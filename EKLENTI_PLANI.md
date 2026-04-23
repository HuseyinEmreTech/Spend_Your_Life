# Aura Adaptive UI: Eklenti (Extension) Geliştirme Rehberi

**Ana Amaç:** Kullanıcının o anki stres seviyesi (GSR) ve başlangıç anket sonuçlarına dayanarak, bulunduğu web sayfasını anlayıp onu baştan aşağı "Aura stiliyle" yeniden yazan bir Chrome Eklentisi geliştirmek.

Bu doküman, projeyi devralacak yapay zekanın (AI Assistant) sırasıyla hangi adımları atacağını ve mimariyi nasıl kuracağını gösteren bir uygulama anayasasıdır. Tüm eklenti kodları `aura-adaptive-ui/extension` klasöründe yer alacaktır.

---

## 1. Dizin ve Dosya Yapısı Hedefi

AI, `extension` klasörünü şu yapıda inşa etmelidir:

```
extension/
├── manifest.json         # Eklenti yetkileri (V3), Host izinleri (*://*/*)
├── public/               
│   ├── icon.png          # Aura Eklenti İkonu
│   └── popup.html        # Kullanıcı Kontrol Paneli (Stres Slider vb.)
├── src/
│   ├── popup.js          # popup.html'in mantığı, Backend'e test verisi iletme
│   ├── background.js     # Arka plan servisi: Backend ile API haberleşmesini (fetch) yönetme
│   └── content_scripts/
│       ├── pruner.js     # DOM'u budayan (temizleyen) ve JSON'a çeviren script
│       ├── injector.js   # Üretilen React/Tailwind UI'ını sayfaya basan script
│       └── bridge.js     # Üretilen butona tıklandığında orijinal sayfaya aktaran (Click Proxy)
```

---

## 2. Adım Adım Kodlama Planı (AI İş Listesi)

Geliştirmeyi yapacak yapay zeka şu adımları sırayla takip etmelidir:

### Adım 1: Temel Kurulum (Manifest ve Popup)
- **Görev:** `manifest.json` dosyasını Manifest V3 standartlarına göre oluştur. Yetkiler: `activeTab`, `scripting`, `storage`.
- **Görev:** `popup.html` ve `popup.js` dosyalarını oluştur. Popup içinde kullanıcının o anki stres seviyesini gösteren bir arayüz ve "Sayfayı Aura Moduna Al" adlı bir tetikleyici buton (Trigger) bulunmalı.

### Adım 2: DOM Budama (Semantic Pruning)
- **Görev:** `pruner.js` dosyasını kodla.
- Bu script orijinal sitenin `document.body`sini analiz etmeli. 
- Gereksiz etiketleri `<script>`, `<style>`, `<header>`, `<footer>` silmeli. 
- Gerçek içeriği (Metin, Resim (img src), Buton ID'leri) alıp token-dostu saf bir JSON veya Markdown formatına çevirmelidir. Mümkün olduğunca küçük bir çıktı üretmelidir.

### Adım 3: Backend İletişimi (The Brain Connect)
- **Görev:** `background.js` dosyasında iletişim altyapısını kur.
- `pruner.js`den gelen JSON verisini ve kullanıcının `popup.js`deki stres verisini (ayrıca anket profillerini) alıp yerel Python Backend'ine (`http://localhost:8000/api/extension/synthesize`) `POST` et.
- Backend'den gelecek yanıt: Saf JSX formatında (React + Tailwindcss kullanan) kod bloğu olmalıdır.

### Adım 4: Enjeksiyon ve Hata Sınırı (Injector)
- **Görev:** Backend'den gelen kodu alıp mevcut sayfaya basacak `injector.js` dosyasını yaz.
- Sayfanın orijinal `display` özelliğini `none` yapıp gizle.
- Yeni bir `div#aura-root` oluştur ve backend'den gelen saf JSX tasarımını ekranda renderla. Babel (standalone) veya benzeri bir yöntem kullanarak JSX'i o an derle (veya Backend direkt JS de yollayabilir, bu mimariyi kurgula).
- **Hata Sınırı (Error Boundary):** Eğer render başarısız olursa, işlemi iptal edip orijinal sayfayı tekrar görünür yap.

### Adım 5: Eylem Köprüsü (Action Mapping)
- **Görev:** `bridge.js` entegrasyonu sağla. 
- Yeni üretilen Aura arayüzündeki butonlarda bir veri etiketi olacak (Örn: `data-original-click="#buy-btn"`).
- Kullanıcı bu ürettiğimiz butona bastığında, `document.querySelector('#buy-btn').click()` aracılığıyla tıklamayı gizli olan orijinal Amazon/site arayüzüne pasla. İşlevsellik böylece bozulmasın.

---

## 3. Backend Hazırlığı (Eklenti Takımının Python Beklentileri)

Eklenti, Backend'den (`app.py` / `routes.py`) şu uç noktanın (Endpoint) hazır olmasını bekler:

- **`POST /api/extension/synthesize`**
  - **Girdi (Request):** `{ "dom_summary": "...", "stress_level": 25, "user_preferences": {...} }`
  - **Çıktı (Response):** Tamamen kullanıma hazır React/Tailwind kodu (String olarak).

> **AI Asistana Not:** Adımları asla tek seferde yapma. Adım 1'i tamamla, çalıştır, kullanıcının veya sistemi denetleyenin onayını al. Ardından Adım 2'ye geç.
