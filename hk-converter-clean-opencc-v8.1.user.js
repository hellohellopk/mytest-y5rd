// ==UserScript==
// @name         簡體轉香港繁體（OpenCC CDN・語言判定版）
// @name:en      Simplified to Hong Kong Traditional Chinese (OpenCC CDN)
// @namespace    https://github.com/secretwebmaster/chinese-converter-js
// @version      8.1.0
// @description  需要網絡載入 OpenCC；只處理簡體中文網站，指定網站強制轉為香港繁體。
// @match        *://*/*
// @exclude      *://www.google.com/*
// @exclude      *://mail.google.com/*
// @run-at       document-start
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @grant        GM_info
// @require      https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/dist/umd/full.js
// @license      MIT
// ==/UserScript==

(() => {
  'use strict';

  const CONFIG = {
    convertAttributes: true,
    dynamicDelay: 80,
    skipTags: new Set([
      'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION',
      'CODE', 'PRE', 'KBD', 'SAMP', 'SVG', 'MATH'
    ]),
    attributeSafeTags: new Set(['INPUT', 'TEXTAREA'])
  };

  const ATTRIBUTES = ['title', 'placeholder', 'alt', 'aria-label'];
  const SIMPLIFIED_MARKERS = new Set(Array.from(
    '这们为说还没发对过里见开间现时听话让应国个来后车东长书电门问题学会风云气'
  ));
  const SIMPLIFIED_SIGNATURE_MARKERS = new Set(Array.from('这们为说还没发对过'));
  const TRADITIONAL_MARKERS = new Set(Array.from(
    '這們為說還沒發對過裡見開間現時聽話讓應國個來後車東長書電門問題學會風雲氣'
  ));
  const HAS_CJK = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u{20000}-\u{2FA1F}]/u;
  const SIMPLIFIED_HOST_OVERRIDES = new Set([
    'linux.do',
    'nodeseek.com',
    'v2ex.com'
  ]);

  const processedTextValues = new WeakMap();
  const processedAttributeValues = new WeakMap();
  const pendingRoots = new Set();
  const pendingAttributeElements = new Set();

  let converter = null;
  let flushTimer = 0;
  let convertedTextNodes = 0;
  let convertedAttributes = 0;
  let skippedNodes = 0;

  function notify(title, text, timeout = 2500) {
    if (typeof GM_notification === 'function') {
      GM_notification({ title, text, timeout });
    }
  }

  function shouldSkipElement(element, forAttributes = false) {
    for (let el = element; el && el !== document.body; el = el.parentElement) {
      if (
        CONFIG.skipTags.has(el.tagName) &&
        !(forAttributes && CONFIG.attributeSafeTags.has(el.tagName))
      ) {
        return true;
      }
      if (el.isContentEditable || el.hasAttribute('data-opencc-skip')) return true;
    }
    return false;
  }

  function hasStrongSimplifiedTextEvidence() {
    if (!document.body) return false;

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        return parent && !shouldSkipElement(parent)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    });

    let sample = '';
    let node;
    while ((node = walker.nextNode()) && sample.length < 5000) {
      sample += ` ${node.nodeValue || ''}`;
    }

    let simplifiedScore = 0;
    let signatureScore = 0;
    let traditionalScore = 0;
    for (const char of sample) {
      if (SIMPLIFIED_MARKERS.has(char)) {
        simplifiedScore += 1;
        if (SIMPLIFIED_SIGNATURE_MARKERS.has(char)) signatureScore += 1;
      }
      if (TRADITIONAL_MARKERS.has(char)) traditionalScore += 1;
    }

    return simplifiedScore >= 3 &&
      signatureScore >= 2 &&
      simplifiedScore >= traditionalScore + 3;
  }

  function isSimplifiedChinesePage() {
    const hostname = location.hostname.toLowerCase();
    for (const domain of SIMPLIFIED_HOST_OVERRIDES) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) return true;
    }

    const htmlLang = document.documentElement
      ? (document.documentElement.getAttribute('lang') || '').trim()
      : '';
    const metaLang = document.querySelector(
      'meta[http-equiv="content-language"], meta[name="language"]'
    );
    const declaredLang = (htmlLang || (metaLang && metaLang.content) || '')
      .split(',')[0]
      .trim()
      .toLowerCase()
      .replace(/_/g, '-');

    if (declaredLang) {
      const parts = declaredLang.split('-');
      if (parts[0] !== 'zh') return false;
      if (parts.length === 1) return hasStrongSimplifiedTextEvidence();
      return parts.some(part => ['hans', 'chs', 'cn', 'sg'].includes(part));
    }

    return hasStrongSimplifiedTextEvidence();
  }

  function convertTextNode(node, skipAlreadyChecked = false) {
    if (!node || !node.parentElement) return;

    const source = node.nodeValue;
    if (!source || processedTextValues.get(node) === source) return;

    if (!skipAlreadyChecked && shouldSkipElement(node.parentElement)) {
      skippedNodes += 1;
      return;
    }

    if (!HAS_CJK.test(source)) {
      processedTextValues.set(node, source);
      skippedNodes += 1;
      return;
    }

    try {
      const result = converter(source);
      processedTextValues.set(node, result);
      if (result !== source) {
        node.nodeValue = result;
        convertedTextNodes += 1;
      }
    } catch (error) {
      console.warn('[簡轉香港繁體] 文字轉換錯誤:', error);
    }
  }

  function convertElementAttributes(element) {
    if (!CONFIG.convertAttributes || !element || shouldSkipElement(element, true)) return;

    let processed = processedAttributeValues.get(element);
    if (!processed) {
      processed = new Map();
      processedAttributeValues.set(element, processed);
    }

    for (const name of ATTRIBUTES) {
      if (!element.hasAttribute(name)) continue;

      try {
        const source = element.getAttribute(name);
        if (processed.get(name) === source) continue;
        if (!HAS_CJK.test(source)) {
          processed.set(name, source);
          skippedNodes += 1;
          continue;
        }

        const result = converter(source);
        processed.set(name, result);
        if (result !== source) {
          element.setAttribute(name, result);
          convertedAttributes += 1;
        }
      } catch (error) {
        console.warn('[簡轉香港繁體] 屬性轉換錯誤:', name, error);
      }
    }
  }

  function convertRoot(root) {
    if (!root) return;

    if (root.nodeType === Node.TEXT_NODE) {
      convertTextNode(root);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
      return;
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || shouldSkipElement(parent)) {
          skippedNodes += 1;
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    let textNode;
    while ((textNode = walker.nextNode())) convertTextNode(textNode, true);

    if (!CONFIG.convertAttributes || !root.querySelectorAll) return;
    if (root.nodeType === Node.ELEMENT_NODE) convertElementAttributes(root);
    root.querySelectorAll('[title], [placeholder], [alt], [aria-label]')
      .forEach(convertElementAttributes);
  }

  function flushPendingRoots() {
    flushTimer = 0;
    const roots = Array.from(pendingRoots);
    const attributeElements = Array.from(pendingAttributeElements);
    pendingRoots.clear();
    pendingAttributeElements.clear();

    roots.forEach(convertRoot);
    attributeElements.forEach(convertElementAttributes);
  }

  function schedulePendingFlush() {
    if (flushTimer) return;
    flushTimer = window.setTimeout(flushPendingRoots, CONFIG.dynamicDelay);
  }

  function queueRoot(root) {
    if (!root) return;
    pendingRoots.add(root);
    schedulePendingFlush();
  }

  function queueAttributes(element) {
    if (!element) return;
    pendingAttributeElements.add(element);
    schedulePendingFlush();
  }

  function startObserver() {
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'characterData') {
          queueRoot(record.target);
          continue;
        }
        if (record.type === 'attributes') {
          queueAttributes(record.target);
          continue;
        }
        for (const node of record.addedNodes) {
          if (
            node.nodeType === Node.TEXT_NODE ||
            node.nodeType === Node.ELEMENT_NODE ||
            node.nodeType === Node.DOCUMENT_FRAGMENT_NODE
          ) {
            queueRoot(node);
          }
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: CONFIG.convertAttributes,
      attributeFilter: CONFIG.convertAttributes ? ATTRIBUTES : undefined
    });
  }

  function registerMenu() {
    GM_registerMenuCommand('🔄 重新轉換本頁', () => {
      convertRoot(document.body);
      notify('簡轉香港繁體', '已重新掃描並轉換本頁。', 2000);
    });

    GM_registerMenuCommand('ℹ️ 診斷資訊', () => {
      const version = typeof GM_info !== 'undefined' ? GM_info.script.version : '8.1.0';
      const info = [
        `腳本版本：${version}`,
        `OpenCC：${typeof OpenCC !== 'undefined' ? '已載入' : '載入失敗'}`,
        '轉換方向：簡體 → 香港繁體',
        `已轉換文字節點：${convertedTextNodes}`,
        `已轉換屬性：${convertedAttributes}`,
        `略過節點：${skippedNodes}`,
        `動態內容延遲：${CONFIG.dynamicDelay} ms`
      ].join('\n');
      notify('簡轉香港繁體診斷', info, 7000);
      console.info('[簡轉香港繁體診斷]', {
        version,
        convertedTextNodes,
        convertedAttributes,
        skippedNodes,
        dynamicDelay: CONFIG.dynamicDelay
      });
    });
  }

  function init() {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', init, { once: true });
      return;
    }

    if (!isSimplifiedChinesePage()) return;

    if (typeof OpenCC === 'undefined') {
      console.error('[簡轉香港繁體] OpenCC 載入失敗');
      notify('簡轉香港繁體錯誤', 'OpenCC 載入失敗；請檢查網路或 CDN。', 5000);
      return;
    }

    converter = OpenCC.Converter({ from: 'cn', to: 'hk' });
    convertRoot(document.body);
    startObserver();
    registerMenu();
    console.info('[簡轉香港繁體] v8.1.0 已啟用。');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
