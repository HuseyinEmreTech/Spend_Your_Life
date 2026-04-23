/**
 * Spend Your Life — Popup Logic
 * LLM-dostu, temiz kod. Tek sorumluluk: kullanici ayarlarini yonetmek.
 */

/**
 * Ayar sabitleri. Her key hem storage anahtarini hem varsayilan degerini tutar.
 * DRY: Yeni ayar eklerken tek yere dokun.
 */
const SETTINGS = {
  salary:          { key: 'spendSalary',          default: 0 },
  currency:        { key: 'spendCurrency',        default: 'TRY' },
  weeklyHours:     { key: 'spendWeeklyHours',     default: 45 },
  converterActive: { key: 'spendConverterActive', default: true },
  fomoActive:      { key: 'spendFomoActive',      default: true },
  visionActive:    { key: 'spendVisionActive',    default: false },
  provider:        { key: 'spendApiProvider',     default: 'none' },
  apiKey:          { key: 'spendApiKey',          default: '' },
  rates:           { key: 'spendExchangeRates',   default: {} },
  ratesUpdatedAt:  { key: 'spendRatesUpdatedAt',  default: 0 },
};

const STORAGE_KEYS = Object.fromEntries(
  Object.entries(SETTINGS).map(([k, v]) => [k, v.key])
);
const DEFAULTS = Object.fromEntries(
  Object.entries(SETTINGS).map(([k, v]) => [k, v.default])
);

// ——— DOM referanslari ———
const els = {
  salary: document.getElementById('salaryInput'),
  currency: document.getElementById('currencySelect'),
  hours: document.getElementById('hoursInput'),
  converter: document.getElementById('toggleConverter'),
  fomo: document.getElementById('toggleFomo'),
  vision: document.getElementById('toggleVision'),
  provider: document.getElementById('providerSelect'),
  apiKey: document.getElementById('apiKeyInput'),
  save: document.getElementById('saveBtn'),
  status: document.getElementById('status'),
  hourlyBadge: document.getElementById('hourlyBadge'),
};

// ——— Yardimci fonksiyonlar ———
function formatMoney(n, currency = 'TRY') {
  const symbol = { TRY: '₺', USD: '$', EUR: '€', GBP: '£' }[currency] || currency;
  return `${symbol}${Math.round(n).toLocaleString('tr-TR')}`;
}

function calcHourlyRate(salary, weeklyHours) {
  if (!salary || !weeklyHours || weeklyHours <= 0) return 0;
  return salary / (weeklyHours * 4.33);
}

function updateHourlyBadge() {
  const salary = Number(els.salary.value) || 0;
  const hours = Number(els.hours.value) || 0;
  const currency = els.currency.value;
  const rate = calcHourlyRate(salary, hours);
  els.hourlyBadge.textContent = rate > 0
    ? `Saatlik: ${formatMoney(rate, currency)}`
    : 'Saatlik: —';
}

// ——— Storage yonetimi ———
async function loadSettings() {
  const stored = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  const s = key => stored[STORAGE_KEYS[key]] ?? DEFAULTS[key];

  els.salary.value = String(s('salary') || '');
  els.currency.value = s('currency');
  els.hours.value = String(s('weeklyHours'));
  els.converter.checked = Boolean(s('converterActive'));
  els.fomo.checked = Boolean(s('fomoActive'));
  els.vision.checked = Boolean(s('visionActive'));
  els.provider.value = s('provider');
  els.apiKey.value = s('apiKey') || '';

  updateHourlyBadge();
}

async function saveSettings() {
  const salary = Math.max(0, Number(els.salary.value) || 0);
  const hours = Math.min(168, Math.max(1, Number(els.hours.value) || 45));

  const payload = {
    [STORAGE_KEYS.salary]: salary,
    [STORAGE_KEYS.currency]: els.currency.value,
    [STORAGE_KEYS.weeklyHours]: hours,
    [STORAGE_KEYS.converterActive]: els.converter.checked,
    [STORAGE_KEYS.fomoActive]: els.fomo.checked,
    [STORAGE_KEYS.visionActive]: els.vision.checked,
    [STORAGE_KEYS.provider]: els.provider.value,
    [STORAGE_KEYS.apiKey]: els.apiKey.value.trim(),
  };

  await chrome.storage.local.set(payload);
  updateHourlyBadge();

  // Eger provider degisti ve backend/OpenRouter secildiyse kur cekmeyi tetikle
  if (els.provider.value !== 'none') {
    chrome.runtime.sendMessage({ type: 'SPEND_UPDATE_RATES' });
  }

  showStatus('Ayarlar kaydedildi.', 'ok');
}

function showStatus(msg, type = '') {
  els.status.textContent = msg;
  els.status.className = type;
}

// ——— Event listener'lar ———
els.salary.addEventListener('input', updateHourlyBadge);
els.hours.addEventListener('input', updateHourlyBadge);
els.currency.addEventListener('change', updateHourlyBadge);

els.save.addEventListener('click', async () => {
  els.save.disabled = true;
  try {
    await saveSettings();
  } catch (err) {
    showStatus('Kaydedilemedi: ' + (err?.message || String(err)), 'error');
  } finally {
    els.save.disabled = false;
  }
});

// ——— Baslat ———
loadSettings().catch(err => {
  showStatus('Ayarlar yuklenemedi.', 'error');
  console.error(err);
});
