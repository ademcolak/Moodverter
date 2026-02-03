# yt-dlp Binaries

Bu klasör yt-dlp sidecar binary'lerini içerir.

## Kurulum

Binary'leri [yt-dlp releases](https://github.com/yt-dlp/yt-dlp/releases) sayfasından indirin ve Tauri naming convention'a göre adlandırın:

### macOS (Apple Silicon)
```bash
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos -o yt-dlp-aarch64-apple-darwin
chmod +x yt-dlp-aarch64-apple-darwin
```

### macOS (Intel)
```bash
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos -o yt-dlp-x86_64-apple-darwin
chmod +x yt-dlp-x86_64-apple-darwin
```

### Windows
```powershell
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe -o yt-dlp-x86_64-pc-windows-msvc.exe
```

### Linux
```bash
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o yt-dlp-x86_64-unknown-linux-gnu
chmod +x yt-dlp-x86_64-unknown-linux-gnu
```

## Tauri Naming Convention

Tauri sidecar binary'leri şu formatta adlandırılmalıdır:
`{binary-name}-{target-triple}[.exe]`

| Platform | Target Triple |
|----------|---------------|
| macOS ARM | aarch64-apple-darwin |
| macOS Intel | x86_64-apple-darwin |
| Windows x64 | x86_64-pc-windows-msvc |
| Linux x64 | x86_64-unknown-linux-gnu |

## Not

Bu binary'ler git'e eklenmez (.gitignore). Her geliştirici kendi makinesine indirmelidir.
