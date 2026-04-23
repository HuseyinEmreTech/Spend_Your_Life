# ⏱️ Spend Your Life

> **Alışveriş sitelerindeki fiyatları çalışma saatine çevirir. Pazarlama taktiklerini gizler.**
>
> **Converts prices on shopping sites into work hours. Hides marketing tactics.**

---

## 🇹🇷 Türkçe

### Nedir?

**Spend Your Life**, alışveriş sitelerinde gezinirken her ürünün fiyatını otomatik olarak **"kaç saat çalışmanıza bedel"** olarak gösteren bir Chrome eklentisidir.

Örneğin bir ayakkabı **1.250 ₺** ise ve sizin saatlik ücretiniz **180 ₺** ise, eklenti fiyatın yerine şunu yazar:

```
~6 sa 57 dk çalışmanıza bedel
```

Ayrıca şu tür FOMO (korku temelli) pazarlama mesajlarını da otomatik olarak gizler:
- "Son 3 adet!"
- "Çok satıyor"
- "Sınırlı stok"
- "X kişi şu an bakıyor"

### Nasıl Çalışır?

1. **Anlık Blur:** Sayfa yüklenir yüklenmez tüm potansiyel fiyat ve FOMO metinleri bulanıklaştırılır.
2. **Bilinen Siteler:** Amazon, Trendyol, Hepsiburada, n11, eBay gibi sitelerde doğrudan fiyatı saate çevirir. Blur anında kalkar.
3. **Bilinmeyen Siteler:** LLM (OpenRouter veya kendi backend'iniz) analiz eder ve doğru fiyat/FOMO alanlarını bulur.
4. **Blur Kalkar:** Doğru yerlerde blur kalkar, yerine saat karşılığı veya "🔇 Pazarlama taktigi" yazar.

### Kurulum

```bash
# 1. Depoyu klonla
git clone https://github.com/kullanici/spend-your-life.git

# 2. Chrome'da chrome://extensions/ adresine git
# 3. Geliştirici modunu aç
# 4. "Paketlenmemiş öğe yükle" butonuna tıkla
# 5. Proje klasörünü seç
```

### Kullanım

1. Eklenti ikonuna tıkla.
2. **Aylık maaşını** ve **haftalık çalışma saatini** gir.
3. Para birimini seç (TRY, USD, EUR, GBP).
4. İsteğe bağlı: LLM ayarlarını yap (OpenRouter API key veya kendi backend URL'n).
5. Alışveriş sitesine git. Fiyatlar otomatik değişir.

### Dosya Yapısı

```
Spend_Your_Life/
├── manifest.json                    # MV3 yapılandırması
├── public/
│   ├── icon.png                     # Eklenti ikonu
│   └── popup.html                   # Ayarlar arayüzü (dark theme)
├── src/
│   ├── popup.js                     # Ayar yönetimi & saatlik ücret hesaplama
│   ├── background.js                # Döviz kuru çekme & LLM proxy
│   └── content_scripts/
│       ├── pruner.js                # Fiyat/FOMO tespiti + blur uygulama
│       ├── transformer.js           # Saat hesaplama + DOM manipülasyonu
│       └── styles.css               # Blur, overlay, badge stilleri
├── EKLENTI_PLANI.md                 # (Eski Aura belgesi)
└── GUNCEL_BAGLAM_YAPAY_ZEKA.md      # (Eski Aura belgesi)
```

### Mimari Özeti

| Bileşen | Tek Sorumluluk |
|---------|---------------|
| `pruner.js` | DOM'da fiyat/FOMO adayı bulur, blur uygular |
| `transformer.js` | Blur kaldırır, saat hesaplar, bilinen siteleri uygular |
| `background.js` | Günlük döviz kuru cache + LLM API proxy |
| `popup.js` | Kullanıcı ayarlarını `chrome.storage` ile yönetir |

**SPA Desteği:** `MutationObserver` ile sayfa içindeki varyasyon (beden/renk) değişimleri otomatik takip edilir. LLM'e tekrar gidilmez.

**Döviz Çevrimi:** `exchangerate-api.com` üzerinden günlük kurlar çekilir. Kullanıcı TRY maaşı girer ama Amazon.com (USD) ürünü bakarsa otomatik çevrilir.

---

## 🇬🇧 English

### What is it?

**Spend Your Life** is a Chrome extension that automatically converts every product price on shopping sites into **"how many hours you need to work to afford it."**

For example, if a shoe costs **₺1,250** and your hourly rate is **₺180**, the extension replaces the price with:

```
~6 hr 57 min of your work
```

It also automatically hides FOMO (fear-based) marketing messages such as:
- "Only 3 left!"
- "Best seller"
- "Limited stock"
- "X people are viewing this now"

### How It Works

1. **Instant Blur:** As soon as the page loads, all potential price and FOMO text is blurred out.
2. **Known Sites:** On Amazon, Trendyol, Hepsiburada, n11, eBay, etc., the price is converted directly. Blur disappears instantly.
3. **Unknown Sites:** LLM (OpenRouter or your own backend) analyzes the page to find the correct price/FOMO areas.
4. **Reveal:** Blur is removed and replaced with the work-hour equivalent or "🔇 Marketing tactic."

### Installation

```bash
# 1. Clone the repo
git clone https://github.com/user/spend-your-life.git

# 2. Open chrome://extensions/ in Chrome
# 3. Enable Developer mode
# 4. Click "Load unpacked"
# 5. Select the project folder
```

### Usage

1. Click the extension icon.
2. Enter your **monthly salary** and **weekly work hours**.
3. Select your currency (TRY, USD, EUR, GBP).
4. Optional: Set up LLM settings (OpenRouter API key or your own backend URL).
5. Visit a shopping site. Prices are transformed automatically.

### File Structure

```
Spend_Your_Life/
├── manifest.json                    # MV3 configuration
├── public/
│   ├── icon.png                     # Extension icon
│   └── popup.html                   # Settings UI (dark theme)
├── src/
│   ├── popup.js                     # Settings management & hourly rate calc
│   ├── background.js                # Exchange rate fetch & LLM proxy
│   └── content_scripts/
│       ├── pruner.js                # Price/FOMO detection + blur
│       ├── transformer.js           # Hour calculation + DOM manipulation
│       └── styles.css               # Blur, overlay, badge styles
├── EKLENTI_PLANI.md                 # (Legacy Aura doc)
└── GUNCEL_BAGLAM_YAPAY_ZEKA.md      # (Legacy Aura doc)
```

### Architecture Summary

| Component | Single Responsibility |
|-----------|----------------------|
| `pruner.js` | Finds price/FOMO candidates in DOM and applies blur |
| `transformer.js` | Removes blur, calculates hours, handles known sites |
| `background.js` | Daily exchange rate cache + LLM API proxy |
| `popup.js` | Manages user settings via `chrome.storage` |

**SPA Support:** `MutationObserver` automatically tracks in-page variation (size/color) changes. No repeated LLM calls.

**Currency Conversion:** Daily rates are fetched from `exchangerate-api.com`. If you set your salary in TRY but browse Amazon.com (USD), conversion is automatic.

---

## 🔒 Privacy

- Your salary and API keys are stored **locally** via `chrome.storage.local`.
- No data is sent to any server except:
  - `exchangerate-api.com` (daily currency rates)
  - Your chosen LLM provider (only if you enable it)
- Screenshots are only taken if you enable **Advanced Visual Analysis**.

---

## 📜 License

MIT

---

> **Not / Note:** Bu proje Aura Adaptive UI eklentisinin iskeletinden yola çıkarak tamamen yeniden yazılmıştır. / This project was completely rewritten from the Aura Adaptive UI extension skeleton.
