/**
 * Spend Your Life — Background Service Worker
 * Sorumluluklari:
 * 1. Gunluk doviz kuru cekme & cache
 * 2. LLM API proxy (OpenRouter / Aura Backend)
 * 3. Content script'lerden gelen analiz isteklerini yonlendirme
 */

const EXCHANGE_API = 'https://api.exchangerate-api.com/v4/latest/TRY';
const STORAGE_KEYS = {
  rates: 'spendExchangeRates',
  ratesUpdatedAt: 'spendRatesUpdatedAt',
  provider: 'spendApiProvider',
  apiKey: 'spendApiKey',
  vision: 'spendVisionActive',
};

// ——— Doviz kuru yonetimi ———

async function updateExchangeRates(force = false) {
  try {
    const stored = await chrome.storage.local.get([STORAGE_KEYS.ratesUpdatedAt]);
    const last = Number(stored[STORAGE_KEYS.ratesUpdatedAt]) || 0;
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    if (!force && last > 0 && (now - last) < oneDay) {
      return; // Cache gecerli
    }

    const res = await fetch(EXCHANGE_API, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if (!data?.rates) throw new Error('Gecersiz kur yaniti');

    await chrome.storage.local.set({
      [STORAGE_KEYS.rates]: data.rates,
      [STORAGE_KEYS.ratesUpdatedAt]: now,
    });

    console.log('[SpendYourLife] Doviz kurlari guncellendi.');
  } catch (err) {
    console.error('[SpendYourLife] Kur cekilemedi:', err);
  }
}

// Kurulumda ve her 24 saatte bir guncelle
chrome.runtime.onInstalled.addListener(() => updateExchangeRates(true));
chrome.alarms.create('spendUpdateRates', { periodInMinutes: 1440 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'spendUpdateRates') updateExchangeRates();
});

// ——— LLM Proxy ———

async function callLLM(payload) {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.provider,
    STORAGE_KEYS.apiKey,
    STORAGE_KEYS.vision,
  ]);

  const provider = stored[STORAGE_KEYS.provider] || 'none';
  const apiKey = stored[STORAGE_KEYS.apiKey] || '';
  const vision = Boolean(stored[STORAGE_KEYS.vision]);

  if (provider === 'none' || !apiKey) {
    return null; // Manuel mod
  }

  const body = buildLLMBody(payload, vision);

  if (provider === 'openrouter') {
    return await callOpenRouter(body, apiKey);
  }

  if (provider === 'backend') {
    return await callBackend(body, apiKey);
  }

  return null;
}

function buildLLMBody(payload, includeVision) {
  const systemPrompt = `Sen bir e-ticaret sayfasi analiz uzmanisin. Grevin:
1. Gercek urun fiyatini bul (indirimli fiyat, cari fiyat).
2. "Son X adet", "Cok satiyor", "Sinirli stok" gibi FOMO (korku temelli) pazarlama mesajlarini bul.
3. JSON formatinda yanut ver. Yanit SADECE su formatta olsun:
{"price_selector":"CSS secici","price_text":"bulunan metin","fomo_selectors":["secici1","secici2"],"confidence":0.0-1.0}
Eger fiyat bulamazsan price_selector bos string olsun.`;

  const content = [
    { type: 'text', text: JSON.stringify(payload.candidates) },
  ];

  if (includeVision && payload.screenshot_b64) {
    content.push({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${payload.screenshot_b64}` },
    });
  }

  return {
    model: 'openrouter/free',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content },
    ],
    response_format: { type: 'json_object' },
  };
}

async function callOpenRouter(body, apiKey) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://spend-your-life.local',
      'X-Title': 'Spend Your Life',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenRouter HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }

  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content || '';

  try {
    const parsed = JSON.parse(raw);
    return {
      price_selector: parsed.price_selector || '',
      price_text: parsed.price_text || '',
      fomo_selectors: Array.isArray(parsed.fomo_selectors) ? parsed.fomo_selectors : [],
      confidence: Number(parsed.confidence) || 0,
    };
  } catch {
    return null;
  }
}

async function callBackend(body, baseUrl) {
  const url = `${baseUrl.replace(/\/$/, '')}/api/extension/analyze-price`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    mode: 'cors',
    credentials: 'omit',
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Backend HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }

  return await res.json();
}

// ——— Mesaj dinleyici ———

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') return;

  if (message.type === 'SPEND_UPDATE_RATES') {
    updateExchangeRates(true).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === 'SPEND_REQUEST_ANALYSIS') {
    handleAnalysis(message, sender).then(sendResponse).catch(err => {
      sendResponse({ ok: false, error: err?.message || String(err) });
    });
    return true;
  }

  if (message.type === 'SPEND_GET_RATES') {
    chrome.storage.local.get([STORAGE_KEYS.rates]).then(data => {
      sendResponse({ ok: true, rates: data[STORAGE_KEYS.rates] || {} });
    });
    return true;
  }
});

async function handleAnalysis(payload, sender) {
  if (!sender?.tab?.id) {
    return { ok: false, error: 'Aktif sekme bulunamadi' };
  }

  const tabId = sender.tab.id;

  // Screenshot al (eger vision aciksa)
  let screenshotB64 = null;
  const stored = await chrome.storage.local.get([STORAGE_KEYS.vision]);
  if (stored[STORAGE_KEYS.vision]) {
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(sender.tab.windowId, {
        format: 'jpeg',
        quality: 50,
      });
      screenshotB64 = dataUrl.split(',')[1];
    } catch (e) {
      console.warn('[SpendYourLife] Screenshot alinamadi:', e);
    }
  }

  const llmPayload = {
    candidates: payload.candidates,
    page_info: {
      url: payload.url,
      domain: payload.domain,
      title: payload.title,
    },
    screenshot_b64: screenshotB64,
  };

  const analysis = await callLLM(llmPayload);

  if (analysis) {
    chrome.tabs.sendMessage(tabId, {
      type: 'SPEND_ANALYSIS_RESULT',
      analysis,
    });
    return { ok: true, source: 'llm' };
  }

  return { ok: false, error: 'LLM analizi yapilamadi veya manuel modda' };
}
