# Moodverter Kullanım ve Test Kılavuzu

Bu kılavuz, Moodverter Faz 2 özelliklerini (Ollama AI, YouTube Entegrasyonu, Masaüstü Widget) nasıl çalıştıracağınızı ve test edeceğinizi açıklar.

## 1. Hazırlık (Harici Servisler)

AI özelliklerinin (Ollama) çalışması için arka planda Ollama'nın kurulu ve açık olması gerekir.

```bash
# Ollama'yı başlat (macOS'ta uygulamayı açmak yeterlidir)
ollama serve

# Gerekli modelleri indir (Sadece ilk kurulumda)
ollama pull llama3.2:3b
ollama pull nomic-embed-text
```

## 2. Uygulamayı Çalıştırma

Uygulamayı ihtiyacınıza göre iki modda çalıştırabilirsiniz:

### A. Masaüstü Uygulaması (Önerilen)
Tauri üzerinde gerçek bir masaüstü widget'ı olarak çalıştırmak için:
```bash
pnpm tauri dev
```

### B. Web Tarayıcısı
Sadece arayüz ve mantıksal katmanları hızlıca test etmek için:
```bash
pnpm dev
```

## 3. Testleri Çalıştırma

Sistem bileşenlerinin doğruluğunu kontrol etmek için Vitest kullanıyoruz:

```bash
# Tüm testleri çalıştır
pnpm test run

# Kritik entegrasyon testlerini çalıştır (YouTube + AI Fallback)
pnpm test src/__tests__/integration/fullSystem.test.ts
```

## 4. Kod Kalitesi

```bash
# Lint kontrolü
pnpm lint

# Kod formatlama
pnpm format
```

## 5. Manuel Test Senaryosu (Adım Adım)

Sistemin tam kapasite çalıştığını doğrulamak için şu adımları izleyebilirsiniz:

1.  **AI Kontrolü:** Uygulamayı açın, **Settings** (Çark simgesi) panelini açın. "AI Engine (Ollama)" bölümünde "Running" ve "Ready" durumlarını teyit edin.
2.  **Provider Değişimi:** Settings panelinden **YouTube** provider'ını seçin.
3.  **Şarkı Ekleme:** "Add YouTube Track" alanına bir YouTube linki yapıştırın ve "Add" butonuna basın.
4.  **Audio Analysis:** Şarkı çalmaya başladığında ana ekranda şarkı isminin yanında mavi renkli **"Analyzing"** uyarısını görün. Bu, sistemin şarkıyı o an analiz edip mood parametrelerini çıkardığını gösterir.
5.  **Mood Girişi:** Input alanına karmaşık bir mood yazın (Örn: *"SONIC VIBES FOR A RAINY DAY"*). Enter'a bastığınızda sistem en uygun şarkıyı otomatik olarak seçip çalmaya başlayacaktır.
6.  **Fallback Doğrulaması:** Sağ üstteki durum göstergesinden AI'nın aktif olup olmadığını kontrol edin.
7.  **Pencere Yönetimi:** Pencereyi hareket ettirmek için arka plandaki herhangi bir boş alana tıklayıp sürükleyebilirsiniz.
8.  **Improvisation (Doğaçlama):** Bir şarkıyı manuel olarak seçtiğinizde veya YouTube linki eklediğinizde, sistem o şarkının enerjisini analiz eder ve mevcut mood'u otomatik olarak ("Improvisation") günceller.

---

**Not:** Tasarım tamamen **Sharp-Edge (Keskin Köşeli)** ve **Neon-Industrial** konseptine göre güncellenmiştir.
