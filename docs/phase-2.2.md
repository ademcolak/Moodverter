# Faz 2.2: System Tray + Popover Mimarisi

> **Durum:** Tamamlandı
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
- [x] `tauri-plugin-shell` veya native tray API ekle
- [x] `Cargo.toml`'a dependency ekle
- [x] `tauri.conf.json`'da tray permission ekle

#### A2. Tray Icon Oluşturma
- [x] macOS için menubar icon (template image, 22x22 @1x, @2x)
- [x] Windows için system tray icon (ICO, 16x16, 32x32)
- [x] Dark/light mode uyumlu icon

#### A3. Tray Rust Backend
- [x] `src-tauri/src/tray.rs` oluştur (lib.rs içinde implement edildi)
- [x] Tray icon initialize
- [x] Click event handler (toggle window)
- [x] Right-click context menu (Quit, Settings)

```rust
// src-tauri/src/lib.rs
use tauri::{
    tray::{TrayIconBuilder, TrayIconEvent},
    Manager,
};

// Tray implementation in lib.rs
```

---

### Bölüm B: Window Konfigürasyonu

#### B1. Tauri Config Güncelleme
- [x] `tauri.conf.json` window ayarları:
  - [x] `visible: false` (başlangıçta gizli)
  - [x] `skipTaskbar: true`
  - [x] `decorations: false`
  - [x] `alwaysOnTop: true`
  - [x] `resizable: false` (sabit boyut)
  - [x] `focus: true` (açılınca focus)

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
- [x] Tray icon pozisyonuna göre pencere aç
- [x] macOS: Menubar altında, ortada
- [x] Windows: Tray icon üstünde
- [x] Ekran kenarlarını aşmama kontrolü

#### B3. Focus-on-blur Davranışı (Opsiyonel)
- [x] Window focus kaybedince otomatik gizle
- [x] Settings'te toggle (bazı kullanıcılar istemeyebilir)
- [x] Tıklama dışında kapanmama (drag sırasında)

---

### Bölüm C: Frontend Refactor

#### C1. Window Controls Kaldırma
- [x] macOS traffic light butonları kaldır
- [x] Windows minimize/maximize/close kaldır
- [x] İlgili state ve handler'ları temizle

#### C2. Drag Region Basitleştirme
- [x] Sadece title bar'da tek bir drag region
- [x] Absolute positioned drag div kaldır
- [x] `pointer-events` karmaşasını temizle

#### C3. App.tsx Temizliği
- [x] `windowControls` objesi kaldır
- [x] `isMacOS` platform detection kaldır
- [x] `isCollapsed` state kaldır
- [x] İlgili useEffect'leri temizle

#### C4. Yeni Title Bar
- [x] Minimal title bar (sadece logo + settings)
- [x] Drag region olarak işaretle
- [x] Tıklanabilir alanları `pointer-events-auto` yap

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
- [x] `toggle_window` Tauri command
- [x] Pozisyon hesaplama logic
- [x] Show/hide animasyonu (opsiyonel)

```rust
// Window toggle implemented in tray click handler
if window.is_visible().unwrap_or(false) {
    window.hide()
} else {
    window.set_position(...)
    window.show()
    window.set_focus()
}
```

#### D2. Quit Command
- [x] Context menu'den çağrılacak
- [x] Graceful shutdown

#### D3. Frontend'e Event Göndermee
- [x] Window visibility event'i
- [x] Tray click event'i

---

### Bölüm E: Platform-Specific Davranışlar

#### E1. macOS
- [x] Menubar'da sağ tarafta icon
- [x] Click → Toggle window
- [x] Option+Click → Context menu (veya right-click)
- [x] Window menubar altında açılsın

#### E2. Windows
- [x] System tray'de icon
- [x] Left-click → Toggle window
- [x] Right-click → Context menu
- [x] Window tray üstünde açılsın

#### E3. Context Menu
- [x] "Settings" → Settings modal aç
- [x] "Quit Moodverter" → Uygulamayı kapat
- [x] Opsiyonel: "About", versiyon bilgisi

---

### Bölüm F: Settings Güncellemesi

#### F1. Behavior Tab Ekle
- [x] "Close on focus loss" toggle
- [x] "Start minimized" toggle (launch at login ile)
- [x] "Launch at login" toggle

#### F2. Always on Top Kaldır
- [x] Artık varsayılan davranış, toggle gereksiz
- [x] Settings'ten kaldır

---

### Bölüm G: Test ve Doğrulama

#### G1. macOS Test
- [x] Menubar'da icon görünüyor
- [x] Tıklayınca pencere açılıyor/kapanıyor
- [x] Pencere doğru pozisyonda açılıyor
- [x] Right-click menu çalışıyor
- [x] Quit çalışıyor

#### G2. Windows Test
- [x] System tray'de icon görünüyor
- [x] Tıklayınca pencere açılıyor/kapanıyor
- [x] Pencere doğru pozisyonda açılıyor
- [x] Right-click menu çalışıyor
- [x] Quit çalışıyor

#### G3. Genel Test
- [x] Sürükleme çalışıyor (sadece title bar)
- [x] Settings açılıyor
- [x] Müzik kontroleri çalışıyor
- [x] Focus kaybında kapanma (eğer açıksa)

---

## Dosya Değişiklikleri

| Dosya | Değişiklik |
|-------|------------|
| `src-tauri/Cargo.toml` | Tray plugin dependency, autostart plugin |
| `src-tauri/tauri.conf.json` | Window config, permissions |
| `src-tauri/src/main.rs` | Tray initialization |
| `src-tauri/src/lib.rs` | Tray logic, autostart commands, hide-on-blur toggle |
| `src-tauri/icons/` | Tray icons |
| `src/App.tsx` | Window controls kaldır, title bar basitleştir |
| `src/components/Settings.tsx` | Always on top kaldır, behavior tab ekle |

---

## Öncelik Sırası

```
1. Bölüm A: Tray Kurulumu ✅
   └── Tray icon çalışsın, tıklanabilir olsun

2. Bölüm B: Window Config ✅
   └── Doğru başlangıç ayarları

3. Bölüm D: Commands ✅
   └── Toggle çalışsın

4. Bölüm C: Frontend ✅
   └── Gereksiz kodu temizle

5. Bölüm E: Platform ✅
   └── macOS/Windows fine-tuning

6. Bölüm F: Settings ✅
   └── Yeni ayarlar

7. Bölüm G: Test ✅
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

*Tamamlandı: 2024-02-02*
