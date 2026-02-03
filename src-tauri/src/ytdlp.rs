use serde::{Deserialize, Serialize};
use std::process::Stdio;
use tauri::Manager;
use tokio::io::AsyncReadExt;
use tokio::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VideoInfo {
    pub id: String,
    pub title: String,
    pub uploader: Option<String>,
    pub channel: Option<String>,
    pub duration: Option<u64>,
    pub view_count: Option<u64>,
    pub description: Option<String>,
    pub thumbnail: Option<String>,
    pub tags: Option<Vec<String>>,
    pub categories: Option<Vec<String>>,
    pub upload_date: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchResult {
    pub id: String,
    pub title: String,
    pub uploader: Option<String>,
    pub duration: Option<u64>,
    pub view_count: Option<u64>,
    pub thumbnail: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AudioStream {
    pub url: String,
    pub format: String,
    pub quality: String,
    pub expires_at: Option<u64>,
}

/// Get the path to the yt-dlp binary
fn get_ytdlp_path(_app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    // Get target triple for the binary name
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

    // In dev mode, use the source directory
    #[cfg(debug_assertions)]
    {
        let dev_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(&binary_name);
        if dev_path.exists() {
            return Ok(dev_path);
        }
    }

    // In production, try resource directory
    if let Ok(exe_dir) = std::env::current_exe() {
        if let Some(parent) = exe_dir.parent() {
            // macOS: Contents/MacOS/../Resources/binaries/
            let resource_path = parent
                .join("../Resources/binaries")
                .join(&binary_name);
            if resource_path.exists() {
                return Ok(resource_path);
            }
            // Fallback: same directory as executable
            let same_dir = parent.join(&binary_name);
            if same_dir.exists() {
                return Ok(same_dir);
            }
        }
    }

    Err(format!("yt-dlp binary not found: {}", binary_name))
}

/// Search YouTube for videos matching the query
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
                thumbnail: json["thumbnail"].as_str().or_else(|| {
                    // Try thumbnails array
                    json["thumbnails"]
                        .as_array()
                        .and_then(|arr| arr.last())
                        .and_then(|t| t["url"].as_str())
                }).map(|s| s.to_string()),
            })
        })
        .collect();

    Ok(results)
}

/// Get detailed video information
#[tauri::command]
pub async fn get_video_info(
    app: tauri::AppHandle,
    video_id: String,
) -> Result<VideoInfo, String> {
    let ytdlp_path = get_ytdlp_path(&app)?;

    let url = format!("https://www.youtube.com/watch?v={}", video_id);

    let mut child = Command::new(&ytdlp_path)
        .args([
            "--no-warnings",
            "--ignore-errors",
            "--skip-download",
            "-j",
            &url,
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

    if !status.success() {
        return Err("yt-dlp failed to get video info".to_string());
    }

    let json: serde_json::Value =
        serde_json::from_str(&output).map_err(|e| format!("Failed to parse JSON: {}", e))?;

    Ok(VideoInfo {
        id: json["id"]
            .as_str()
            .unwrap_or(&video_id)
            .to_string(),
        title: json["title"]
            .as_str()
            .unwrap_or("Unknown")
            .to_string(),
        uploader: json["uploader"].as_str().map(|s| s.to_string()),
        channel: json["channel"].as_str().map(|s| s.to_string()),
        duration: json["duration"].as_u64(),
        view_count: json["view_count"].as_u64(),
        description: json["description"].as_str().map(|s| s.to_string()),
        thumbnail: json["thumbnail"]
            .as_str()
            .or_else(|| {
                json["thumbnails"]
                    .as_array()
                    .and_then(|arr| arr.last())
                    .and_then(|t| t["url"].as_str())
            })
            .map(|s| s.to_string()),
        tags: json["tags"]
            .as_array()
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()),
        categories: json["categories"]
            .as_array()
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()),
        upload_date: json["upload_date"].as_str().map(|s| s.to_string()),
    })
}

/// Get the best audio stream URL for a video
#[tauri::command]
pub async fn get_audio_url(
    app: tauri::AppHandle,
    video_id: String,
) -> Result<AudioStream, String> {
    let ytdlp_path = get_ytdlp_path(&app)?;

    let url = format!("https://www.youtube.com/watch?v={}", video_id);

    let mut child = Command::new(&ytdlp_path)
        .args([
            "--no-warnings",
            "--ignore-errors",
            "-f",
            "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio",
            "-g",
            "--print",
            "%(format)s",
            &url,
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

    if !status.success() {
        return Err("yt-dlp failed to get audio URL".to_string());
    }

    let lines: Vec<&str> = output.lines().collect();
    if lines.len() < 2 {
        return Err("Unexpected yt-dlp output format".to_string());
    }

    let audio_url = lines[0].to_string();
    let format_info = lines[1].to_string();

    // Extract expiration from URL if present (typically &expire=TIMESTAMP)
    let expires_at = audio_url
        .split('&')
        .find(|s| s.starts_with("expire="))
        .and_then(|s| s.strip_prefix("expire="))
        .and_then(|s| s.parse::<u64>().ok());

    Ok(AudioStream {
        url: audio_url,
        format: format_info.clone(),
        quality: if format_info.contains("251") || format_info.contains("opus") {
            "high".to_string()
        } else if format_info.contains("140") || format_info.contains("m4a") {
            "medium".to_string()
        } else {
            "low".to_string()
        },
        expires_at,
    })
}

/// Fetch audio data from a URL (CORS bypass)
#[tauri::command]
pub async fn fetch_audio_data(url: String) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::new();

    let response = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch audio: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read audio bytes: {}", e))?;

    Ok(bytes.to_vec())
}
