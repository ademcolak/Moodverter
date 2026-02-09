use serde::{Deserialize, Serialize};
use std::process::Stdio;
use tokio::io::AsyncReadExt;
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

#[tauri::command]
pub async fn search_youtube(
    app: tauri::AppHandle,
    query: String,
    limit: u32,
) -> Result<Vec<SearchResult>, String> {
    let ytdlp_path = get_ytdlp_path(&app)?;
    let search_url = format!("ytsearch{}:{}", limit, query);

    let mut child = Command::new(&ytdlp_path)
        .args([
            "--flat-playlist",
            "--no-warnings",
            "--ignore-errors",
            "-j",
            &search_url,
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn yt-dlp: {}", e))?;

    let mut stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let mut output = String::new();
    stdout
        .read_to_string(&mut output)
        .await
        .map_err(|e| format!("Failed to read stdout: {}", e))?;

    let status = child
        .wait()
        .await
        .map_err(|e| format!("Failed to wait for yt-dlp: {}", e))?;

    if !status.success() && output.is_empty() {
        return Err("yt-dlp search failed".to_string());
    }

    let results: Vec<SearchResult> = output
        .lines()
        .filter_map(|line| {
            let json: serde_json::Value = serde_json::from_str(line).ok()?;
            Some(SearchResult {
                id: json["id"].as_str()?.to_string(),
                title: json["title"].as_str()?.to_string(),
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
            })
        })
        .collect();

    Ok(results)
}
