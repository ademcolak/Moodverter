use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::time::Duration;
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

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistFetchReport {
    pub playlist_title: Option<String>,
    pub total_entries: usize,
    pub valid_entries: usize,
    pub skipped_entries: usize,
    pub unavailable_entries: usize,
    pub entries: Vec<SearchResult>,
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

const PUBLIC_SEARCH_ENDPOINTS: &[&str] = &[
    "https://piped.video/api/v1/search",
    "https://pipedapi.kavin.rocks/search",
    "https://pipedapi.adminforge.de/search",
    "https://pipedapi.ducks.party/search",
];
const YOUTUBE_WEB_SEARCH_ENDPOINT: &str = "https://www.youtube.com/results";

fn is_valid_video_id(value: &str) -> bool {
    value.len() == 11
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

fn extract_video_id(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    if is_valid_video_id(trimmed) {
        return Some(trimmed.to_string());
    }

    let normalized = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_string()
    } else if trimmed.starts_with('/') {
        format!("https://youtube.com{}", trimmed)
    } else {
        format!("https://youtube.com/{}", trimmed)
    };

    let url = reqwest::Url::parse(&normalized).ok()?;
    let host = url.host_str()?.to_lowercase();
    if host.contains("youtube.com") {
        if let Some((_, value)) = url.query_pairs().find(|(key, _)| key == "v") {
            let id = value.into_owned();
            if is_valid_video_id(&id) {
                return Some(id);
            }
        }
    }
    if host == "youtu.be" || host.ends_with(".youtu.be") {
        if let Some(segment) = url.path_segments().and_then(|mut segments| segments.next()) {
            if is_valid_video_id(segment) {
                return Some(segment.to_string());
            }
        }
    }

    None
}

fn value_to_u64(value: Option<&serde_json::Value>) -> Option<u64> {
    let raw = value?;
    if let Some(v) = raw.as_u64() {
        return Some(v);
    }
    if let Some(v) = raw.as_f64() {
        if v.is_finite() && v >= 0.0 {
            return Some(v.floor() as u64);
        }
    }
    None
}

fn parse_public_search_results(payload: serde_json::Value, limit: usize) -> Vec<SearchResult> {
    let items = match payload.as_array() {
        Some(items) => items,
        None => return Vec::new(),
    };

    let mut results = Vec::new();
    let mut seen = HashSet::new();
    for item in items {
        if results.len() >= limit {
            break;
        }
        let row = match item.as_object() {
            Some(row) => row,
            None => continue,
        };

        let id = row
            .get("id")
            .and_then(|value| value.as_str())
            .and_then(extract_video_id)
            .or_else(|| {
                row.get("url")
                    .and_then(|value| value.as_str())
                    .and_then(extract_video_id)
            });
        let id = match id {
            Some(id) => id,
            None => continue,
        };

        if !seen.insert(id.clone()) {
            continue;
        }

        let title = row
            .get("title")
            .and_then(|value| value.as_str())
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let title = match title {
            Some(title) => title,
            None => continue,
        };

        let uploader = row
            .get("uploaderName")
            .and_then(|value| value.as_str())
            .or_else(|| row.get("uploader").and_then(|value| value.as_str()))
            .map(|value| value.to_string());
        let view_count = value_to_u64(row.get("views"));
        let duration = value_to_u64(row.get("duration"));
        let thumbnail = row
            .get("thumbnail")
            .and_then(|value| value.as_str())
            .map(|value| value.to_string())
            .or_else(|| Some(format!("https://i.ytimg.com/vi/{}/hqdefault.jpg", id)));

        results.push(SearchResult {
            id,
            title,
            uploader,
            duration,
            view_count,
            thumbnail,
        });
    }

    results
}

fn parse_duration_to_seconds(input: &str) -> Option<u64> {
    let parts: Vec<u64> = input
        .split(':')
        .filter_map(|part| part.trim().parse::<u64>().ok())
        .collect();
    match parts.len() {
        2 => Some(parts[0] * 60 + parts[1]),
        3 => Some(parts[0] * 3600 + parts[1] * 60 + parts[2]),
        _ => None,
    }
}

fn parse_view_count(input: &str) -> Option<u64> {
    let digits: String = input.chars().filter(|ch| ch.is_ascii_digit()).collect();
    if digits.is_empty() {
        return None;
    }
    digits.parse::<u64>().ok()
}

fn extract_text(value: Option<&serde_json::Value>) -> Option<String> {
    let value = value?;
    if let Some(simple_text) = value.get("simpleText").and_then(|item| item.as_str()) {
        let normalized = simple_text.trim().to_string();
        if !normalized.is_empty() {
            return Some(normalized);
        }
    }

    let runs = value.get("runs").and_then(|item| item.as_array())?;
    let text = runs
        .iter()
        .filter_map(|item| item.get("text").and_then(|item| item.as_str()))
        .collect::<Vec<&str>>()
        .join("");
    let normalized = text.trim().to_string();
    if normalized.is_empty() {
        return None;
    }
    Some(normalized)
}

fn collect_video_renderers(value: &serde_json::Value, out: &mut Vec<serde_json::Map<String, serde_json::Value>>) {
    match value {
        serde_json::Value::Object(map) => {
            if let Some(renderer) = map.get("videoRenderer").and_then(|item| item.as_object()) {
                out.push(renderer.clone());
            }
            for child in map.values() {
                collect_video_renderers(child, out);
            }
        }
        serde_json::Value::Array(items) => {
            for child in items {
                collect_video_renderers(child, out);
            }
        }
        _ => {}
    }
}

fn extract_first_json_object(input: &str) -> Option<&str> {
    let bytes = input.as_bytes();
    let start = bytes.iter().position(|&b| b == b'{')?;
    let mut depth = 0i32;
    let mut in_string = false;
    let mut escaped = false;

    for (index, byte) in bytes.iter().enumerate().skip(start) {
        if in_string {
            if escaped {
                escaped = false;
                continue;
            }
            if *byte == b'\\' {
                escaped = true;
                continue;
            }
            if *byte == b'"' {
                in_string = false;
            }
            continue;
        }

        if *byte == b'"' {
            in_string = true;
            continue;
        }
        if *byte == b'{' {
            depth += 1;
            continue;
        }
        if *byte == b'}' {
            depth -= 1;
            if depth == 0 {
                return input.get(start..=index);
            }
        }
    }

    None
}

fn extract_yt_initial_data(html: &str) -> Option<serde_json::Value> {
    let markers = [
        "var ytInitialData = ",
        "window[\"ytInitialData\"] = ",
        "ytInitialData = ",
    ];

    for marker in markers {
        let Some(marker_start) = html.find(marker) else {
            continue;
        };
        let remainder = &html[marker_start + marker.len()..];
        let Some(json_slice) = extract_first_json_object(remainder) else {
            continue;
        };
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(json_slice) {
            return Some(parsed);
        }
    }

    None
}

fn is_unavailable_playlist_title(title: &str) -> bool {
    let normalized = title.trim().to_lowercase();
    normalized.contains("private video") || normalized.contains("deleted video")
}

fn parse_playlist_report(payload: serde_json::Value) -> PlaylistFetchReport {
    let playlist_title = payload
        .get("title")
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let entries = payload
        .get("entries")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();

    let mut parsed_entries: Vec<SearchResult> = Vec::new();
    let mut seen_ids = HashSet::new();
    let mut skipped_entries = 0usize;
    let mut unavailable_entries = 0usize;

    for entry in entries.iter() {
        let row = match entry.as_object() {
            Some(row) => row,
            None => {
                skipped_entries += 1;
                unavailable_entries += 1;
                continue;
            }
        };

        let title = row
            .get("title")
            .and_then(|value| value.as_str())
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());

        if title
            .as_deref()
            .map(is_unavailable_playlist_title)
            .unwrap_or(false)
        {
            skipped_entries += 1;
            unavailable_entries += 1;
            continue;
        }

        let id = row
            .get("id")
            .and_then(|value| value.as_str())
            .map(|value| value.trim().to_string())
            .filter(|value| is_valid_video_id(value));

        let id = match id {
            Some(id) => id,
            None => {
                skipped_entries += 1;
                unavailable_entries += 1;
                continue;
            }
        };

        if !seen_ids.insert(id.clone()) {
            skipped_entries += 1;
            continue;
        }

        let thumbnail = row
            .get("thumbnail")
            .and_then(|value| value.as_str())
            .or_else(|| {
                row.get("thumbnails")
                    .and_then(|value| value.as_array())
                    .and_then(|items| items.last())
                    .and_then(|value| value.get("url"))
                    .and_then(|value| value.as_str())
            })
            .map(|value| value.to_string())
            .or_else(|| Some(format!("https://i.ytimg.com/vi/{}/hqdefault.jpg", id)));

        parsed_entries.push(SearchResult {
            id: id.clone(),
            title: title.unwrap_or_else(|| format!("YouTube {}", id)),
            uploader: row
                .get("uploader")
                .and_then(|value| value.as_str())
                .map(|value| value.to_string()),
            duration: row.get("duration").and_then(|value| value.as_u64()),
            view_count: None,
            thumbnail,
        });
    }

    let total_entries = entries.len();
    let valid_entries = parsed_entries.len();

    PlaylistFetchReport {
        playlist_title,
        total_entries,
        valid_entries,
        skipped_entries,
        unavailable_entries,
        entries: parsed_entries,
    }
}

fn parse_youtube_web_results(payload: serde_json::Value, limit: usize) -> Vec<SearchResult> {
    let mut renderers = Vec::new();
    collect_video_renderers(&payload, &mut renderers);

    let mut results = Vec::new();
    let mut seen = HashSet::new();
    for renderer in renderers {
        if results.len() >= limit {
            break;
        }

        let id = renderer
            .get("videoId")
            .and_then(|item| item.as_str())
            .map(|item| item.to_string());
        let id = match id {
            Some(id) if seen.insert(id.clone()) => id,
            _ => continue,
        };

        let title = extract_text(renderer.get("title"));
        let title = match title {
            Some(title) => title,
            None => continue,
        };

        let uploader = extract_text(renderer.get("ownerText").or_else(|| renderer.get("longBylineText")));
        let duration = extract_text(renderer.get("lengthText")).and_then(|raw| parse_duration_to_seconds(&raw));
        let view_count = extract_text(renderer.get("viewCountText")).and_then(|raw| parse_view_count(&raw));
        let thumbnail = renderer
            .get("thumbnail")
            .and_then(|item| item.get("thumbnails"))
            .and_then(|item| item.as_array())
            .and_then(|items| items.last())
            .and_then(|item| item.get("url"))
            .and_then(|item| item.as_str())
            .map(|item| item.to_string())
            .or_else(|| Some(format!("https://i.ytimg.com/vi/{}/hqdefault.jpg", id)));

        results.push(SearchResult {
            id,
            title,
            uploader,
            duration,
            view_count,
            thumbnail,
        });
    }

    results
}

async fn fetch_public_search_endpoint(
    client: reqwest::Client,
    endpoint: &'static str,
    query: String,
    limit: usize,
) -> Result<Vec<SearchResult>, String> {
    let url = reqwest::Url::parse_with_params(endpoint, &[("q", query.as_str()), ("filter", "videos")])
        .map_err(|error| format!("{} url parse failed: {}", endpoint, error))?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("{} request failed: {}", endpoint, error))?;
    if !response.status().is_success() {
        return Ok(Vec::new());
    }

    let payload = response
        .json::<serde_json::Value>()
        .await
        .map_err(|error| format!("{} invalid json: {}", endpoint, error))?;
    Ok(parse_public_search_results(payload, limit))
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

#[tauri::command]
pub async fn search_youtube_public_v1(
    query: String,
    limit: u32,
) -> InvokeResponse<Vec<SearchResult>> {
    let bounded_limit = usize::try_from(limit.max(1).min(25)).unwrap_or(10);
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_millis(1500))
        .build()
    {
        Ok(client) => client,
        Err(error) => {
            return err_response(
                "YTDLP_NETWORK",
                "Public YouTube search client kurulamadı".to_string(),
                Some(error.to_string()),
            );
        }
    };

    let mut diagnostics: Vec<String> = Vec::new();
    for endpoint in PUBLIC_SEARCH_ENDPOINTS {
        match fetch_public_search_endpoint(client.clone(), endpoint, query.clone(), bounded_limit).await {
            Ok(results) if !results.is_empty() => {
                return ok_response(results);
            }
            Ok(_) => {}
            Err(error) => diagnostics.push(error),
        }
    }

    if diagnostics.is_empty() {
        return ok_response(Vec::new());
    }
    err_response(
        "YTDLP_NETWORK",
        "Public YouTube aramasi basarisiz oldu".to_string(),
        trim_details(&diagnostics.join(" | ")),
    )
}

#[tauri::command]
pub async fn search_youtube_web_v1(
    query: String,
    limit: u32,
) -> InvokeResponse<Vec<SearchResult>> {
    let bounded_limit = usize::try_from(limit.max(1).min(25)).unwrap_or(10);
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_millis(3500))
        .build()
    {
        Ok(client) => client,
        Err(error) => {
            return err_response(
                "YTDLP_NETWORK",
                "YouTube web arama istemcisi olusturulamadi".to_string(),
                Some(error.to_string()),
            );
        }
    };

    let url = match reqwest::Url::parse_with_params(
        YOUTUBE_WEB_SEARCH_ENDPOINT,
        &[("search_query", query.as_str()), ("hl", "tr"), ("gl", "TR")],
    ) {
        Ok(url) => url,
        Err(error) => {
            return err_response(
                "YTDLP_NETWORK",
                "YouTube web arama URL'i olusturulamadi".to_string(),
                Some(error.to_string()),
            );
        }
    };

    let response = match client
        .get(url)
        .header("accept-language", "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7")
        .header(
            "user-agent",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        )
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => {
            return err_response(
                "YTDLP_NETWORK",
                "YouTube web arama istegi basarisiz oldu".to_string(),
                Some(error.to_string()),
            );
        }
    };

    if !response.status().is_success() {
        return err_response(
            "YTDLP_NETWORK",
            "YouTube web arama yaniti basarisiz oldu".to_string(),
            Some(format!("status: {}", response.status())),
        );
    }

    let body = match response.text().await {
        Ok(body) => body,
        Err(error) => {
            return err_response(
                "YTDLP_NETWORK",
                "YouTube web arama yaniti okunamadi".to_string(),
                Some(error.to_string()),
            );
        }
    };

    let initial_data = match extract_yt_initial_data(&body) {
        Some(initial_data) => initial_data,
        None => {
            return err_response(
                "YTDLP_PARSE_FAILED",
                "YouTube web arama verisi parse edilemedi".to_string(),
                trim_details(&body),
            );
        }
    };

    ok_response(parse_youtube_web_results(initial_data, bounded_limit))
}

#[tauri::command]
pub async fn fetch_youtube_playlist_v1(
    app: tauri::AppHandle,
    url: String,
) -> InvokeResponse<PlaylistFetchReport> {
    let normalized_url = url.trim();
    if normalized_url.is_empty() {
        return err_response(
            "YTDLP_SEARCH_FAILED",
            "Playlist URL bos olamaz".to_string(),
            None,
        );
    }

    let ytdlp_path = match get_ytdlp_path(&app) {
        Ok(path) => path,
        Err(message) => {
            return err_response("YTDLP_BINARY_NOT_FOUND", message, None);
        }
    };

    let output = match Command::new(&ytdlp_path)
        .args([
            "--flat-playlist",
            "--no-warnings",
            "--ignore-errors",
            "-J",
            "--",
        ])
        .arg(normalized_url)
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
    if stdout.trim().is_empty() {
        return err_response(
            "YTDLP_PARSE_FAILED",
            "Playlist verisi bos dondu".to_string(),
            trim_details(&stderr),
        );
    }

    let payload: serde_json::Value = match serde_json::from_str(&stdout) {
        Ok(payload) => payload,
        Err(_) => {
            return err_response(
                "YTDLP_PARSE_FAILED",
                "Playlist verisi parse edilemedi".to_string(),
                trim_details(&stdout),
            );
        }
    };

    ok_response(parse_playlist_report(payload))
}
