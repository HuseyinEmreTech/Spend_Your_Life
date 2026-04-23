/**
 * Spend Your Life — Transformer (Content Script)
 * Sorumluluklari:
 * 1. Bilinen sitelerde hardcoded selector'leri uygula
 * 2. Bilinmeyen sitelerde background'dan LLM analizi iste
 * 3. Blur kaldirir, fiyati saate cevirir, FOMO mesajlarini degistirir
 * 4. Varyasyon degisimlerini MutationObserver ile takip et
 */

(function initSpendTransformer() {
  'use strict';

  // ——— Sabitler ———
  const CLASSES = {
    blur: 'spend-blur-overlay',
    analyzing: 'spend-analyzing',
    revealed: 'spend-revealed',
    hourBadge: 'spend-hour-badge',
    fomoBlocked: 'spend-fomo-blocked',
  };
  const ATTR = 'data-spend-processed';
  const TYPE_ATTR = 'data-spend-type';

  // ——— Bilinen siteler (manuel mod) ———
  const KNOWN_SITES = {
    'amazon.com.tr': {
      priceSelectors: ['.a-price .a-offscreen', '#priceblock_dealprice', '#priceblock_ourprice'],
      fomoSelectors: ['.scarcity-msg', '.bestseller-badge', '#availability span'],
    },
    'amazon.com': {
      priceSelectors: ['.a-price .a-offscreen', '#priceblock_dealprice', '#priceblock_ourprice', '.a-price-range'],
      fomoSelectors: ['.scarcity-msg', '.bestseller-badge'],
    },
    'trendyol.com': {
      priceSelectors: ['[data-testid="price-current"]', '.prc-dsc', '.prc-org', '.product-price-container'],
      fomoSelectors: ['.scarcity-badge', '.stock-badge', '.campaign-badge'],
    },
    'hepsiburada.com': {
      priceSelectors: ['[data-testid="price"]', '.product-price', '.price'],
      fomoSelectors: ['.stock-info', '.campaign-info'],
    },
    'n11.com': {
      priceSelectors: ['.newPrice', '.price', '.productPrice'],
      fomoSelectors: ['.stockText', '.campaignText'],
    },
    'ebay.com': {
      priceSelectors: ['.notranslate', '.u-flL.condText', '.vi-price'],
      fomoSelectors: ['.msgText'],
    },
  };

  // ——— Ayarlari al ———
  async function getSettings() {
    const keys = [
      'spendSalary', 'spendWeeklyHours', 'spendCurrency',
      'spendExchangeRates', 'spendConverterActive', 'spendFomoActive',
    ];
    const stored = await chrome.storage.local.get(keys);
    return {
      salary: Number(stored.spendSalary) || 0,
      weeklyHours: Number(stored.spendWeeklyHours) || 45,
      currency: stored.spendCurrency || 'TRY',
      rates: stored.spendExchangeRates || {},
      converterActive: stored.spendConverterActive !== false,
      fomoActive: stored.spendFomoActive !== false,
    };
  }

  // ——— Fiyat parsing ———

  /**
   * Metinsel fiyati sayiya cevirir.
   * Desteklenen formatlar: "1.250,00", "1,250.00", "1250.00"
   * Strateji: Nokta ve virgulden hangisi SONDA ise o binlik ayiricidir.
   * Ornegin "1.250,00" -> virgul sonda -> virgul ondalik, nokta binlik.
   */
  function parsePrice(text) {
    if (!text) return 0;
    const cleaned = text.replace(/[^\d.,]/g, '');
    if (!cleaned) return 0;

    const lastDot = cleaned.lastIndexOf('.');
    const lastComma = cleaned.lastIndexOf(',');

    // Hem nokta hem virgul varsa: sondaki binlik ayiricidir.
    if (lastDot > -1 && lastComma > -1) {
      if (lastComma > lastDot) {
        // 1.250,00 -> virgul ondalik, nokta binlik
        return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
      }
      // 1,250.00 -> nokta ondalik, virgul binlik
      return parseFloat(cleaned.replace(/,/g, ''));
    }

    // Tek virgul varsa ve sonraki 2 hane varsa ondalik kabul et.
    if (lastComma > -1 && cleaned.lastIndexOf(',') === cleaned.indexOf(',')) {
      const after = cleaned.slice(lastComma + 1);
      if (after.length === 2) {
        return parseFloat(cleaned.replace(',', '.'));
      }
    }

    // Geriye kalan tum durumlar: binlik ayiriciyi kaldir.
    return parseFloat(cleaned.replace(/,/g, ''));
  }

  function detectCurrency(text) {
    if (/₺|TL/i.test(text)) return 'TRY';
    if (/\$|USD/i.test(text)) return 'USD';
    if (/€|EUR/i.test(text)) return 'EUR';
    if (/£|GBP/i.test(text)) return 'GBP';
    return 'TRY';
  }

  function convertCurrency(amount, fromCurrency, toCurrency, rates) {
    if (fromCurrency === toCurrency) return amount;
    const rFrom = rates?.[fromCurrency];
    const rTo = rates?.[toCurrency];
    if (!rFrom || !rTo) return amount; // Cache yoksa oldugu gibi birak
    // Once TRY'ye (base), sonra hedef para birimine
    return (amount / rFrom) * rTo;
  }

  function calculateHours(priceInUserCurrency, settings) {
    if (!settings.salary || !settings.weeklyHours || settings.weeklyHours <= 0) return null;
    const hourlyRate = settings.salary / (settings.weeklyHours * 4.33);
    if (hourlyRate <= 0) return null;
    const totalHours = priceInUserCurrency / hourlyRate;
    const hours = Math.floor(totalHours);
    const minutes = Math.round((totalHours - hours) * 60);
    return { hours, minutes };
  }

  function formatTime({ hours, minutes }) {
    if (hours === 0 && minutes === 0) return '~0 dk';
    if (hours === 0) return `~${minutes} dk`;
    if (minutes === 0) return `~${hours} sa`;
    return `~${hours} sa ${minutes} dk`;
  }

  // ——— DOM manipulasyonlari ———

  function revealPrice(el, settings) {
    if (!settings.converterActive) {
      clearBlur(el);
      return;
    }

    const text = el.textContent || '';
    const price = parsePrice(text);
    const priceCurrency = detectCurrency(text);
    const priceInUserCurrency = convertCurrency(price, priceCurrency, settings.currency, settings.rates);
    const time = calculateHours(priceInUserCurrency, settings);

    clearBlur(el);
    el.textContent = '';

    if (time) {
      const badge = document.createElement('span');
      badge.className = CLASSES.hourBadge;
      badge.textContent = `${formatTime(time)} calismaniza bedel`;
      el.appendChild(badge);
    } else {
      el.textContent = text; // Hesap yapilamazsa eskiyi goster
    }
  }

  function revealFomo(el, settings) {
    if (!settings.fomoActive) {
      clearBlur(el);
      return;
    }
    clearBlur(el);
    el.classList.add(CLASSES.fomoBlocked);
    el.textContent = '🔇 Pazarlama taktigi';
  }

  function clearBlur(el) {
    el.classList.remove(CLASSES.blur, CLASSES.analyzing);
    el.classList.add(CLASSES.revealed);
    el.setAttribute(ATTR, 'revealed');
  }

  function clearAllBlur() {
    document.querySelectorAll(`.${CLASSES.blur}`).forEach(el => clearBlur(el));
  }

  // ——— Bilinen site uygulamasi ———

  async function applyKnownSite() {
    const domain = location.hostname.replace(/^www\./, '');
    const known = KNOWN_SITES[domain];
    if (!known) return false;

    const settings = await getSettings();

    known.priceSelectors.forEach(sel => {
      const el = document.querySelector(sel);
      if (el) revealPrice(el, settings);
    });

    if (settings.fomoActive) {
      known.fomoSelectors.forEach(sel => {
        const el = document.querySelector(sel);
        if (el) revealFomo(el, settings);
      });
    }

    // Pruner'ın aynı elementlere uyguladığı blur'ları da temizle
    clearAllBlur();
    return true;
  }

  // ——— Pruner blur'larini temizle (LLM yoksa veya beklerken) ———

  async function revealAllFromPruner() {
    const settings = await getSettings();
    const blurred = document.querySelectorAll(`[${TYPE_ATTR}]`);

    blurred.forEach(el => {
      const type = el.getAttribute(TYPE_ATTR);
      if (type === 'price') revealPrice(el, settings);
      else if (type === 'fomo') revealFomo(el, settings);
    });
  }

  // ——— LLM analizi sonucunu uygula ———

  async function applyAnalysis(analysis) {
    const settings = await getSettings();

    if (analysis.price_selector) {
      const el = document.querySelector(analysis.price_selector);
      if (el) revealPrice(el, settings);
    }

    if (Array.isArray(analysis.fomo_selectors)) {
      analysis.fomo_selectors.forEach(sel => {
        const el = document.querySelector(sel);
        if (el) revealFomo(el, settings);
      });
    }

    // Geri kalan blur'lari da temizle (pruner'dan kalanlar)
    revealAllFromPruner();
  }

  // ——— Background mesaj dinleyici ———

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'SPEND_ANALYSIS_RESULT') {
      applyAnalysis(message.analysis).catch(console.error);
      sendResponse({ ok: true });
      return false;
    }
    return false;
  });

  // ——— SPA / varyasyon destegi ———

  const variationObserver = new MutationObserver((mutations) => {
    let hasPriceChange = false;
    let hasNewBlur = false;

    mutations.forEach((mut) => {
      mut.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.querySelector?.('.a-price, [data-testid="price"], .price')) {
            hasPriceChange = true;
          }
          if (node.classList?.contains(CLASSES.blur)) {
            hasNewBlur = true;
          }
        }
      });

      if (mut.type === 'characterData' && mut.target.parentElement) {
        const parent = mut.target.parentElement;
        if (parent.classList.contains(CLASSES.hourBadge)) return;
        if (parsePrice(mut.target.textContent || '') > 0) {
          hasPriceChange = true;
        }
      }
    });

    if (!hasPriceChange && !hasNewBlur) return;

    setTimeout(async () => {
      const isKnown = await applyKnownSite();
      if (!isKnown && hasNewBlur) {
        // Bilinmeyen site + yeni blur: LLM yoksa temizle
        const stored = await chrome.storage.local.get(['spendApiProvider']);
        if (!stored.spendApiProvider || stored.spendApiProvider === 'none') {
          clearAllBlur();
        }
      }
    }, 300);
  });

  // ——— Baslatma ———

  async function init() {
    if (!document.body) return;

    // Once bilinen site mi kontrol et
    const isKnown = await applyKnownSite();

    if (!isKnown) {
      // Bilinmeyen site: pruner blur'larini beklet,
      // background'a analiz istegi gonder (eger LLM aktifse)
      const stored = await chrome.storage.local.get(['spendApiProvider']);
      if (stored.spendApiProvider && stored.spendApiProvider !== 'none') {
        const candidates = window.__SPEND_PRUNER__?.getCandidates?.() || [];
        chrome.runtime.sendMessage({
          type: 'SPEND_REQUEST_ANALYSIS',
          url: location.href,
          domain: location.hostname,
          title: document.title,
          candidates,
        });
      } else {
        // Manuel mod (LLM kapali): Pruner blur'larini kaldir,
        // sayfayi okunabilir birak. Bilinmeyen sitelerde fiyat
        // gizlenemez, cunku hangisinin gercek fiyat oldugunu
        // bilmiyoruz.
        clearAllBlur();
      }
    }

    // Varyasyon degisimlerini izle
    variationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
