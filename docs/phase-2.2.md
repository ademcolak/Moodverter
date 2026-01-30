# Faz 2.2: System Tray + Popover Mimarisi

> **Durum:** Planlandı
>
> **Hedef:** Kronik UI sorunlarını çözmek için window mekanizmasını System Tray + Popover pattern'ine geçirmek

---

## Neden Bu Faz?

### Mevcut Sorunlar

1. **Sürükleme çalışmıyor:** Katmanlı `data-tauri-drag-region` yapısı birbiriyle çakışıyor
2. **Window controls bozuk:** Custom close/minimize/maximize butonları güvenilmez
3. **Platform tutarsızlığı:** macOS ve Windows için ayrı ayrı buton yönetimi karmaşık
4. **Karmaşık state yönetimi:** `isCollapsed`, window state, pointer-events kaosude

### Hedeflenen Çözüm

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   KAPALI HAL                        AÇIK HAL                    │
│   ──────────                        ────────                    │
│                                                                 │
│   macOS:  [Menubar Icon]      →     ┌──────────────┐           │
│                                      │              │           │
│   Windows: [System Tray Icon] →     │   Popover    │           │
│                                      │   Window     │           │
│                                      │              │           │
│   • Taskbar'da görünmez              └──────────────┘           │
│   • Tek tıkla toggle                                            │
│   • Focus kaybedince kapanır (opsiyonel)                        │
│   • Kapat/Minimize butonu YOK                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Neden Bu Pattern?

| Şu Anki Yapı | System Tray + Popover |
|--------------|----------------------|
| Custom close/minimize/maximize | Yok, tray kontrol ediyor |
| 3 katmanlı drag region | Sadece title bar |
| Platform-specific button logic | Tauri hallediyor |
| Karmaşık window state | Sadece show/hide |
| Sürükleme sorunları | Minimal drag area |

**Örnek uygulamalar:** Raycast, Alfred, Bartender, Dropbox, macOS Control Center

---

## Checklist

### Bölüm A: Tauri System Tray Kurulumu

#### A1. Tray Plugin Ekleme
- [ ] `tauri-plugin-shell` veya native tray API ekle
- [ ] `Cargo.toml`'a dependency ekle
- [ ] `tauri.conf.json`'da tray permission ekle

#### A2. Tray Icon Oluşturma
- [ ] macOS için menubar icon (template image, 22x22 @1x, @2x)
- [ ] Windows için system tray icon (ICO, 16x16, 32x32)
- [ ] Dark/light mode uyumlu icon

#### A3. Tray Rust Backend
- [ ] `src-tauri/src/tray.rs` oluştur
- [ ] Tray icon initialize
- [ ] Click event handler (toggle window)
- [ ] Right-click context menu (Quit, Settings)

```rust
// src-tauri/src/tray.rs
use tauri::{
    tray::{TrayIconBuilder, TrayIconEvent},
    Manager,
};

pub fn create_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { .. } = event {
                // Toggle window visibility
            }
        })
        .build(app)?;
    Ok(())
}
```

---

### Bölüm B: Window Konfigürasyonu

#### B1. Tauri Config Güncelleme
- [ ] `tauri.conf.json` window ayarları:
  - [ ] `visible: false` (başlangıçta gizli)
  - [ ] `skipTaskbar: true`
  - [ ] `decorations: false`
  - [ ] `alwaysOnTop: true`
  - [ ] `resizable: false` (sabit boyut)
  - [ ] `focus: true` (açılınca focus)

```json
{
  "app": {
    "windows": [
      {
        "title": "Moodverter",
        "width": 400,
        "height": 500,
        "visible": false,
        "skipTaskbar": true,
        "decorations": false,
        "alwaysOnTop": true,
        "resizable": false,
        "center": false
      }
    ]
  }
}
```

#### B2. Window Positioning
- [ ] Tray icon pozisyonuna göre pencere aç
- [ ] macOS: Menubar altında, ortada
- [ ] Windows: Tray icon üstünde
- [ ] Ekran kenarlarını aşmama kontrolü

#### B3. Focus-on-blur Davranışı (Opsiyonel)
- [ ] Window focus kaybedince otomatik gizle
- [ ] Settings'te toggle (bazı kullanıcılar istemeyebilir)
- [ ] Tıklama dışında kapanmama (drag sırasında)

---

### Bölüm C: Frontend Refactor

#### C1. Window Controls Kaldırma
- [ ] macOS traffic light butonları kaldır
- [ ] Windows minimize/maximize/close kaldır
- [ ] İlgili state ve handler'ları temizle

#### C2. Drag Region Basitleştirme
- [ ] Sadece title bar'da tek bir drag region
- [ ] Absolute positioned drag div kaldır
- [ ] `pointer-events` karmaşasını temizle

#### C3. App.tsx Temizliği
- [ ] `windowControls` objesi kaldır
- [ ] `isMacOS` platform detection kaldır
- [ ] `isCollapsed` state kaldır
- [ ] İlgili useEffect'leri temizle

#### C4. Yeni Title Bar
- [ ] Minimal title bar (sadece logo + settings)
- [ ] Drag region olarak işaretle
- [ ] Tıklanabilir alanları `pointer-events-auto` yap

```tsx
// Yeni basit title bar
<div data-tauri-drag-region className="h-10 flex items-center justify-between px-4 bg-[var(--color-surface)]/40">
  <div className="flex items-center gap-2 pointer-events-none">
    <div className="w-2 h-2 bg-gradient-to-tr from-[var(--color-primary)] to-[var(--color-accent)]" />
    <span className="text-[10px] font-black tracking-[0.25em] text-white/80 uppercase">
      Moodverter
    </span>
  </div>
  <button onClick={() => setIsSettingsOpen(true)} className="pointer-events-auto">
    {/* Settings icon */}
  </button>
</div>
```

---

### Bölüm D: Tauri Commands

#### D1. Window Toggle Command
- [ ] `toggle_window` Tauri command
- [ ] Pozisyon hesaplama logic
- [ ] Show/hide animasyonu (opsiyonel)

```rust
#[tauri::command]
async fn toggle_window(window: tauri::Window) {
    if window.is_visible().unwrap() {
        window.hide().unwrap();
    } else {
        // Position window near tray
        window.show().unwrap();
        window.set_focus().unwrap();
    }
}
```

#### D2. Quit Command
- [ ] Context menu'den çağrılacak
- [ ] Graceful shutdown

#### D3. Frontend'e Event Göndermee
- [ ] Window visibility event'i
- [ ] Tray click event'i

---

### Bölüm E: Platform-Specific Davranışlar

#### E1. macOS
- [ ] Menubar'da sağ tarafta icon
- [ ] Click → Toggle window
- [ ] Option+Click → Context menu (veya right-click)
- [ ] Window menubar altında açılsın

#### E2. Windows
- [ ] System tray'de icon
- [ ] Left-click → Toggle window
- [ ] Right-click → Context menu
- [ ] Window tray üstünde açılsın

#### E3. Context Menu
- [ ] "Settings" → Settings modal aç
- [ ] "Quit Moodverter" → Uygulamayı kapat
- [ ] Opsiyonel: "About", versiyon bilgisi

---

### Bölüm F: Settings Güncellemesi

#### F1. Behavior Tab Ekle
- [ ] "Close on focus loss" toggle
- [ ] "Start minimized" toggle (launch at login ile)
- [ ] "Launch at login" toggle

#### F2. Always on Top Kaldır
- [ ] Artık varsayılan davranış, toggle gereksiz
- [ ] Settings'ten kaldır

---

### Bölüm G: Test ve Doğrulama

#### G1. macOS Test
- [ ] Menubar'da icon görünüyor
- [ ] Tıklayınca pencere açılıyor/kapanıyor
- [ ] Pencere doğru pozisyonda açılıyor
- [ ] Right-click menu çalışıyor
- [ ] Quit çalışıyor

#### G2. Windows Test
- [ ] System tray'de icon görünüyor
- [ ] Tıklayınca pencere açılıyor/kapanıyor
- [ ] Pencere doğru pozisyonda açılıyor
- [ ] Right-click menu çalışıyor
- [ ] Quit çalışıyor

#### G3. Genel Test
- [ ] Sürükleme çalışıyor (sadece title bar)
- [ ] Settings açılıyor
- [ ] Müzik kontroleri çalışıyor
- [ ] Focus kaybında kapanma (eğer açıksa)

---

## Dosya Değişiklikleri

| Dosya | Değişiklik |
|-------|------------|
| `src-tauri/Cargo.toml` | Tray plugin dependency |
| `src-tauri/tauri.conf.json` | Window config, permissions |
| `src-tauri/src/main.rs` | Tray initialization |
| `src-tauri/src/tray.rs` | YENİ - Tray logic |
| `src-tauri/icons/` | Tray icons |
| `src/App.tsx` | Window controls kaldır, title bar basitleştir |
| `src/components/Settings.tsx` | Always on top kaldır, behavior tab ekle |

---

## Öncelik Sırası

```
1. Bölüm A: Tray Kurulumu
   └── Tray icon çalışsın, tıklanabilir olsun

2. Bölüm B: Window Config
   └── Doğru başlangıç ayarları

3. Bölüm D: Commands
   └── Toggle çalışsın

4. Bölüm C: Frontend
   └── Gereksiz kodu temizle

5. Bölüm E: Platform
   └── macOS/Windows fine-tuning

6. Bölüm F: Settings
   └── Yeni ayarlar

7. Bölüm G: Test
   └── Her şey çalışıyor mu?
```

---

## Kazanımlar

Bu faz tamamlandığında:

1. **Basitlik:** Custom window controls yerine native tray mekanizması
2. **Güvenilirlik:** Sürükleme ve açma/kapama sorunları çözülmüş
3. **Platform uyumu:** macOS ve Windows'ta doğal davranış
4. **Daha az kod:** ~150 satır gereksiz kod silinecek
5. **Widget hissi:** Gerçek bir menubar widget gibi davranış

---

*Bu döküman güncellenecektir. Her tamamlanan adımı ✅ ile işaretle.*
