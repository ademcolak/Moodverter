use serde::{Deserialize, Serialize};
use tokio::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchResult {
    pub id: String,
    pub title: String,
    pub uploader: Option<String>,
    pub duration: Option<u64>,
    pub view_count: Option<u64>,
    pub thumbnail: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InvokeError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InvokeResponse<T> {
    pub ok: bool,
    pub data: Option<T>,
    pub error: Option<InvokeError>,
}

fn get_ytdlp_path(_app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let target = if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "aarch64-apple-darwin"
        } else {
            "x86_64-apple-darwin"
        }
    } else if cfg!(target_os = "windows") {
        "x86_64-pc-windows-msvc"
    } else {
        "x86_64-unknown-linux-gnu"
    };

    let binary_name = format!("yt-dlp-{}", target);

    #[cfg(debug_assertions)]
    {
        let dev_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(&binary_name);
        if dev_path.exists() {
            return Ok(dev_path);
        }
    }

    if let Ok(exe_dir) = std::env::current_exe() {
        if let Some(parent) = exe_dir.parent() {
            let resource_path = parent.join("../Resources/binaries").join(&binary_name);
            if resource_path.exists() {
                return Ok(resource_path);
            }
            let same_dir = parent.join(&binary_name);
            if same_dir.exists() {
                return Ok(same_dir);
            }
        }
    }

    Err(format!("yt-dlp binary not found: {}", binary_name))
}

fn ok_response<T>(data: T) -> InvokeResponse<T> {
    InvokeResponse {
        ok: true,
        data: Some(data),
        error: None,
    }
}

fn err_response<T>(code: &str, message: String, details: Option<String>) -> InvokeResponse<T> {
    InvokeResponse {
        ok: false,
        data: None,
        error: Some(InvokeError {
            code: code.to_string(),
            message,
            details,
        }),
    }
}

fn trim_details(input: &str) -> Option<String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.len() <= 280 {
        return Some(trimmed.to_string());
    }
    let mut sliced = trimmed.chars().take(280).collect::<String>();
    sliced.push_str("...");
    Some(sliced)
}

fn classify_ytdlp_failure(stderr: &str) -> (&'static str, String) {
    let lower = stderr.to_lowercase();
    if lower.contains("429")
        || lower.contains("too many requests")
        || lower.contains("rate limit")
        || lower.contains("slow down")
    {
        return ("YTDLP_RATE_LIMITED", "yt-dlp rate limit nedeniyle aramayi tamamlayamadi".to_string());
    }
    if lower.contains("network")
        || lower.contains("timed out")
        || lower.contains("timeout")
        || lower.contains("connection")
        || lower.contains("temporary failure")
    {
        return ("YTDLP_NETWORK", "yt-dlp ag baglantisi nedeniyle aramayi tamamlayamadi".to_string());
    }
    if lower.contains("private video") || lower.contains("sign in to confirm") {
        return ("YOUTUBE_AUTH_REQUIRED", "YouTube icerigi ek kimlik dogrulama gerektiriyor".to_string());
    }
    (
        "YTDLP_SEARCH_FAILED",
        "yt-dlp arama islemini basarisiz tamamlandi".to_string(),
    )
}

#[tauri::command]
pub async fn search_youtube_v1(
    app: tauri::AppHandle,
    query: String,
    limit: u32,
) -> InvokeResponse<Vec<SearchResult>> {
    let ytdlp_path = match get_ytdlp_path(&app) {
        Ok(path) => path,
        Err(message) => {
            return err_response("YTDLP_BINARY_NOT_FOUND", message, None);
        }
    };
    let bounded_limit = limit.max(1).min(25);
    let search_url = format!("ytsearch{}:{}", bounded_limit, query);

    let output = match Command::new(&ytdlp_path)
        .args([
            "--flat-playlist",
            "--no-warnings",
            "--ignore-errors",
            "-j",
            &search_url,
        ])
        .output()
        .await
    {
        Ok(output) => output,
        Err(error) => {
            return err_response(
                "YTDLP_SPAWN_FAILED",
                format!("Failed to execute yt-dlp: {}", error),
                None,
            );
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() && stdout.trim().is_empty() {
        let (code, message) = classify_ytdlp_failure(&stderr);
        return err_response(code, message, trim_details(&stderr));
    }

    let mut parse_failures = 0;
    let mut results: Vec<SearchResult> = Vec::new();
    for line in stdout.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let json: serde_json::Value = match serde_json::from_str(line) {
            Ok(value) => value,
            Err(_) => {
                parse_failures += 1;
                continue;
            }
        };

        let Some(id) = json["id"].as_str() else {
            parse_failures += 1;
            continue;
        };
        let Some(title) = json["title"].as_str() else {
            parse_failures += 1;
            continue;
        };

        results.push(SearchResult {
            id: id.to_string(),
            title: title.to_string(),
            uploader: json["uploader"].as_str().map(|s| s.to_string()),
            duration: json["duration"].as_u64(),
            view_count: json["view_count"].as_u64(),
            thumbnail: json["thumbnail"]
                .as_str()
                .or_else(|| {
                    json["thumbnails"]
                        .as_array()
                        .and_then(|arr| arr.last())
                        .and_then(|t| t["url"].as_str())
                })
                .map(|s| s.to_string()),
        });
    }

    if results.is_empty() && !stdout.trim().is_empty() && parse_failures > 0 {
        return err_response(
            "YTDLP_PARSE_FAILED",
            "yt-dlp cikti formati parse edilemedi".to_string(),
            trim_details(&stdout),
        );
    }

    ok_response(results)
}

#[tauri::command]
pub async fn search_youtube(
    app: tauri::AppHandle,
    query: String,
    limit: u32,
) -> Result<Vec<SearchResult>, String> {
    let response = search_youtube_v1(app, query, limit).await;
    if response.ok {
        return Ok(response.data.unwrap_or_default());
    }

    match response.error {
        Some(error) => Err(format!("{}: {}", error.code, error.message)),
        None => Err("YTDLP_UNKNOWN: Unknown yt-dlp error".to_string()),
    }
}
