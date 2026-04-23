# Aura Adaptive UI — Eklenti güncel bağlamı (yapay zeka / geliştirici)

Bu dosya **Chrome uzantısı (`extension/`)** ile **yerel FastAPI backend (`../backend/`)** arasındaki güncel mimariyi tek yerde toplar. Başka bir oturumda çalışan bir yapay zekanın veya geliştiricinin “ne nerede, neden böyle” sorusuna cevap vermek için yazıldı.

---

## 1. Ürün özeti

- **Amaç:** Kullanıcının belirlediği **stres skoru (0–30)** ve sayfanın **budanmış DOM özeti** ile backend’de bir LLM’den **tek bir React bileşeni (JSX)** üretmek; bu bileşeni sayfa üzerinde **tam ekran sandbox iframe** içinde göstermek.
- **Önemli kısıt:** MV3 uzantı sayfalarında `unsafe-eval` kullanılamaz; bu yüzden **Babel + `new Function`** ile JSX derleme **yalnızca manifest’te tanımlı sandbox sayfasında** yapılır.
- **Backend:** Varsayılan `http://127.0.0.1:8000` veya `http://localhost:8000`. LLM olarak **OpenRouter** (API anahtarı varsa, ücretsiz mod + paralel yarış) veya **Ollama** kullanılabilir — eklenti tarafı sadece HTTP API ile konuşur.

---

## 2. Dizin yapısı (eklenti kökü: `extension/`)

| Yol | Rol |
|-----|-----|
| `manifest.json` | MV3: izinler, sandbox sayfası, `web_accessible_resources`, background service worker |
| `public/popup.html` + `src/popup.js` | Kullanıcı arayüzü: stres kaydırıcısı, “Aura” tetikleyicisi, durum metni |
| `src/background.js` | İsteğe bağlı `AURA_SYNTHESIZE` mesajı ile aynı sentez API’sine proxy (popup’taki doğrudan `fetch` birincil yol) |
| `src/content_scripts/pruner.js` | Sayfada **body klonu** üzerinde çalışır; script/style siler; yapıyı sıkıştırılmış **JSON string** olarak döndürür |
| `src/content_scripts/bridge.js` | **`world: "MAIN"`** ile enjekte edilir: `postMessage` ile orijinal DOM’da tıklama ve overlay kapatma |
| `src/content_scripts/injector.js` | Orijinal `body`’yi gizler, sandbox iframe’i ekler, `chrome.storage`’daki JSX’i `postMessage` ile sandbox’a iletir |
| `sandbox/aura-sandbox.html` | Sandbox sayfası: React, ReactDOM, Babel (vendor) |
| `sandbox/aura-sandbox-run.js` | `AURA_INJECT_JSX` mesajını dinler → Babel ile derleme → `AdaptiveUI` render → tıklama köprüsü |
| `vendor/*.js` | `react`, `react-dom`, `babel` min dosyaları |

---

## 3. Manifest özeti (`manifest.json`)

- **`permissions`:** `activeTab`, `scripting`, `storage`
- **`host_permissions`:** `http://127.0.0.1/*`, `http://localhost/*` — backend’e `fetch` için gerekli
- **`sandbox.pages`:** `sandbox/aura-sandbox.html` — burada eval benzeri işlemler serbest
- **`web_accessible_resources`:** sandbox HTML’in her URL’den iframe `src` ile yüklenmesi için
- **`background.service_worker`:** `src/background.js`

---

## 4. Uçtan uca akış (popup “Aura” tıklaması)

Sıra **kritik**; değiştirirken bu sırayı koru:

1. **Aktif sekme** alınır; `chrome://`, `chrome-extension://`, `edge://` engellenir.
2. **Pruner enjekte:** `chrome.scripting.executeScript({ files: [pruner.js] })` — izole dünya (varsayılan).
3. **Pruner çalıştır:** İkinci `executeScript` yalnızca `func` ile `window.__AURA_PRUNER__.run()` çağırır (Chrome aynı çağrıda `files` + `func` birleştirmeyi desteklemediği için iki adım).
4. Dönen **JSON string** `chrome.storage.local` içine `auraDomSummary` (+ zaman damgası) olarak yazılır.
5. **`postExtensionSynthesize`** (popup içi `fetch`):
   - Gövde: `JSON.stringify({ dom_summary, stress_level, user_preferences })`
   - **Önemli:** `Content-Type: text/plain;charset=UTF-8` — böylece tarayıcı **CORS preflight** tetiklemez (“simple request”). `application/json` bazı loopback + eklenti kombinasyonlarında `Failed to fetch` üretebiliyordu.
   - `credentials: "omit"`
   - URL sırası: `chrome.storage.local.auraApiBase` (varsa), sonra `http://127.0.0.1:8000`, sonra `http://localhost:8000`
   - Endpoint: **`POST /api/extension/synthesize`**
6. Başarılı yanıt: `{ "jsx": "<string>" }` → `auraLastJsx` + `auraLastSynthesizeAt` storage’a yazılır.
7. **Bridge** `world: "MAIN"` + **Injector** (izole) sırayla enjekte edilir.
8. Injector: `body` gizlenir, iframe `chrome.runtime.getURL("sandbox/aura-sandbox.html")` yüklenir; `load` sonrası `postMessage({ type: "AURA_INJECT_JSX", jsx })`.
9. Sandbox: Babel → `AdaptiveUI` → `ReactDOM.createRoot` ile render; `[data-original-click]` tıklanınca parent’a `AURA_PROXY_CLICK` gönderilir.
10. Bridge (MAIN): `AURA_PROXY_CLICK` ile `document.querySelector(sel).click()`; `Escape` veya `AURA_CLOSE` / `AURA_RENDER_FAIL` ile iframe kaldırılır ve `body` görünürlüğü geri alınır.

---

## 5. İki “dünya” ve `postMessage` sözleşmesi

| Dünya | Script | Görev |
|--------|--------|--------|
| **Izole (ISOLATED)** | pruner, injector (varsayılan) | `chrome.*` API kullanımı |
| **MAIN** | bridge.js | Orijinal sayfanın gerçek DOM’unda `click()`; `chrome` yok |

**Mesaj tipleri (özet):**

- `AURA_INJECT_JSX` — parent (injector/sayfa) → sandbox: JSX string
- `AURA_PROXY_CLICK` — sandbox → parent: `{ sel }` (CSS seçici, mümkünse `#id`)
- `AURA_CLOSE`, `AURA_RENDER_FAIL` — overlay kapatma
- Escape: MAIN bridge `data-aura-overlay` varken `AURA_CLOSE` yayınlar

Pruner, tıklanabilir öğeler için mümkünse **`sel`** alanında `#escapedId` üretir; LLM çıktısında bunun **`data-original-click`** ile geri bağlanması backend prompt’unda istenir.

---

## 6. Pruner çıktısı (DOM özeti)

- **Canlı DOM değiştirilmez:** `document.body.cloneNode(true)` üzerinde çalışılır.
- Klon üzerinde **`script`, `style`, `noscript`, `template`** silinir.
- **Header/footer özellikle silinmez** (kurumsal sitelerde menü kaybını önlemek için).
- **`items` limiti:** `MAX_ITEMS = 280`; JSON üst sınırı `MAX_JSON_CHARS` (aşılırsa kırpma).
- Öğe tipleri (kısaltılmış alanlar): `img`, `btn`, `a` (+ iç `img` + logo metni), `h`, `in` (input), `li` (içi doluysa çocuklara iner), `tx` (p, td, th, …).

Backend bu stringi **`dom_summary`** olarak alır; `build_extension_prompt` ile LLM prompt’una dönüşür.

---

## 7. Backend sözleşmesi (eklenti açısından)

- **Endpoint:** `POST /api/extension/synthesize`
- **Gövde:** JSON (eklenti pratikte `text/plain` ile gönderir; FastAPI `Request.body()` + `json.loads` ile okur).
- **Alanlar:** `dom_summary` (string, min 1), `stress_level` (0–30), `user_preferences` (opsiyonel object), `nasa_tlx_score` (opsiyonel) — payload modeli backend’de `ExtensionSynthesizePayload`.
- **Yanıt:** `{ "jsx": "..." }` — tek string, sandbox’ta derlenecek React bileşeni kaynağı.
- **LLM çıktı formatı (zorunlu):** `export default function AdaptiveUI()` ile başlayan JSX (prompt’ta vurgulanır). Arrow function `export default` kullanılmamalı (sandbox `export default` satırını strip ediyor).
- **CORS / PNA:** Backend’de `CORSMiddleware` + özel `PrivateNetworkAccessMiddleware` (Chrome’un Private Network Access başlığı) kullanılır; eklenti `chrome-extension://` kökeninden loopback’e istek atar.

**Durum paneli (debug):** `http://localhost:8000/` ve `GET /api/status` — LLM sağlayıcı, OpenRouter zinciri, DB ping, `.env` / `settings.yaml` varlığı vb.

---

## 8. OpenRouter davranışı (backend; eklentiyi doğrudan ilgilendirmez ama hata ayıklamada önemli)

- Anahtar: `OPENROUTER_API_KEY` veya `settings.yaml` / `backend/.env` (gitignore).
- Varsayılan: **yalnızca ücretsiz** model id’leri (`:free`, `openrouter/free`); `OPENROUTER_ALLOW_PAID_MODELS=1` ile ücretli serbest.
- **Paralel yarış:** Model zincirindeki her modele aynı anda istek; HTTP/boş/hatalı yanıtlar yok sayılır; **ilk geçerli `AdaptiveUI` içeren** cevap seçilir, diğer görevler iptal edilir.

---

## 9. `chrome.storage.local` anahtarları

| Anahtar | Anlam |
|---------|--------|
| `auraStressLevel` | 0–30 stres |
| `auraDomSummary` | Son pruner JSON string |
| `auraDomSummaryAt` | Zaman damgası |
| `auraLastJsx` | Son başarılı sentez JSX |
| `auraLastSynthesizeAt` | Zaman damgası |
| `auraApiBase` | Opsiyonel backend kök URL (sonunda `/` olmadan) |
| `auraUserPreferences` | Opsiyonel object → sentez gövdesine eklenir |

---

## 10. Sık sorunlar (kısa)

- **`Failed to fetch`:** Backend ayakta mı (`/api/health` veya `/` panel)? `host_permissions` ve tarayıcıda localhost izni? Önce `127.0.0.1:8000` deneniyor.
- **Pruner null:** İki aşamalı enjekte bozulmuş olabilir veya sayfa `body` yok.
- **Boş / hatalı panel:** JSX `AdaptiveUI` içermiyor veya Babel derlemesi hata veriyor — sandbox `showError` ve `AURA_RENDER_FAIL`.
- **`chrome.*` in bridge:** Bridge **MAIN** dünyasında; orada `chrome` kullanılmamalı.

---

## 11. Sürüm ipucu

`manifest.json` içindeki `"version"` (ör. `0.4.1`) kullanıcıya görünen sürümdür; bu belge ile çelişirse manifest ve bu dosyayı senkronize etmek gerekir.

---

## 12. İlgili backend dosyaları (referans)

- `backend/api/routes.py` — `POST /api/extension/synthesize`, `GET /api/status`, `GET /api/health`
- `backend/services/prompt_builder.py` — `build_extension_prompt`
- `backend/services/llm_service.py` — OpenRouter yarış / Ollama
- `backend/app.py` — CORS, PNA middleware, `/` dashboard HTML

Bu belge **yalnızca eklenti klasöründe** tutulur; backend veya kök README ile çakışan idiomatik tekrar bilinçli olabilir — amaç “eklenti + entegrasyon” odaklı tek elden özet sağlamaktır.
