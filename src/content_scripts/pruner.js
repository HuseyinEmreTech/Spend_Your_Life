/**
 * Spend Your Life — Pruner (Content Script)
 * Sayfa yuklendiginde potansiyel fiyat ve FOMO metinlerini bulur,
 * hepsine gecici blur uygular.
 * LLM-dostu, tek sorumluluk: tespit + blur.
 */

(function initSpendPruner() {
  'use strict';

  // ——— Sabitler ———
  const CLASSES = {
    blur: 'spend-blur-overlay',
    analyzing: 'spend-analyzing',
  };
  const ATTR = 'data-spend-processed';
  const TYPE_ATTR = 'data-spend-type';

  const PRICE_PATTERNS = [
    /[0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?\s*[₺$€£]/,
    /[0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?\s*(?:TL|USD|EUR|GBP)/i,
    /\b\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?\b/,
  ];

  const FOMO_KEYWORDS = [
    'son', 'adet', 'cok sat', 'sinirli stok', 'tukenmek uzere',
    'kisi su an bakiyor', 'saatte', 'satildi', 'sadece', 'kaldi',
    'stoklarla sinirli', 'firsat urunu', 'yalnizca', 'kacirmayin',
    'acele edin', 'son firsat', 'tukeniyor', 'populer', 'cok izlenen',
  ];

  const FOMO_REGEX = new RegExp(
    FOMO_KEYWORDS.map(k => k.replace(/\s+/g, '\\s+')).join('|'),
    'i'
  );

  const EXCLUDED_TAGS = new Set([
    'script', 'style', 'noscript', 'template', 'iframe', 'code', 'pre',
  ]);

  // ——— Tespit fonksiyonlari ———

  function hasPrice(text) {
    if (!text || text.length > 140) return false;
    return PRICE_PATTERNS.some(p => p.test(text));
  }

  function hasFomo(text) {
    if (!text || text.length > 220) return false;
    return FOMO_REGEX.test(text);
  }

  function isExcluded(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return true;
    const tag = el.tagName.toLowerCase();
    if (EXCLUDED_TAGS.has(tag)) return true;
    if (el.closest('script, style, noscript, iframe, code, pre')) return true;
    return false;
  }

  // ——— Blur uygulama ———

  function applyBlur(el, type) {
    if (!el || el.hasAttribute(ATTR)) return;
    if (isExcluded(el)) return;

    el.classList.add(CLASSES.blur, CLASSES.analyzing);
    el.setAttribute(TYPE_ATTR, type);
    el.setAttribute(ATTR, 'pending');
  }

  // ——— En kucuk hedefi bul (leaf tercihi) ———

  function findBestTarget(container, checkFn) {
    if (!container || isExcluded(container)) return null;

    // Once leaf'leri dene
    const leaves = container.querySelectorAll('*');
    for (const leaf of leaves) {
      if (leaf.children.length > 0) continue;
      if (isExcluded(leaf)) continue;
      const t = (leaf.textContent || '').trim();
      if (t && checkFn(t)) return leaf;
    }

    // Leaf'te bulunamazsa container'ın kendisi
    const t = (container.textContent || '').trim();
    if (t && checkFn(t)) return container;

    return null;
  }

  // ——— DOM tarama ———

  function classifyElement(el) {
    const text = (el.innerText || el.textContent || '').trim();
    if (!text) return null;

    if (hasPrice(text)) return { type: 'price', checkFn: hasPrice };
    if (hasFomo(text)) return { type: 'fomo', checkFn: hasFomo };
    return null;
  }

  function tryBlurElement(el, blurredSet, candidates) {
    const classification = classifyElement(el);
    if (!classification) return;

    const target = findBestTarget(el, classification.checkFn);
    if (!target || blurredSet.has(target)) return;

    applyBlur(target, classification.type);
    blurredSet.add(target);
    candidates.push({
      type: classification.type,
      text: (target.textContent || '').trim(),
      tag: target.tagName.toLowerCase(),
    });
  }

  function scanNode(root) {
    const candidates = [];
    const blurred = new Set();

    for (const el of root.querySelectorAll('*')) {
      if (isExcluded(el) || blurred.has(el)) continue;
      tryBlurElement(el, blurred, candidates);
    }

    return candidates;
  }

  // ——— SPA destegi: MutationObserver ———

  const observer = new MutationObserver((mutations) => {
    let shouldScan = false;
    for (const mut of mutations) {
      for (const node of mut.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          shouldScan = true;
          break;
        }
      }
      if (shouldScan) break;
    }

    if (shouldScan) {
      requestAnimationFrame(() => scanNode(document.body));
    }
  });

  // ——— Baslatma ———

  function init() {
    if (!document.body) return;
    scanNode(document.body);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ——— Disa acik API (transformer.js icin) ———
  window.__SPEND_PRUNER__ = {
    scanNode,
    getCandidates: () => {
      const nodes = document.querySelectorAll(`[${TYPE_ATTR}="price"]`);
      return Array.from(nodes).map(n => ({
        text: (n.textContent || '').trim(),
        type: n.getAttribute(TYPE_ATTR),
        tag: n.tagName.toLowerCase(),
      }));
    },
  };
})();
