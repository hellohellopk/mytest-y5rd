// ==UserScript==
// @name         簡體轉繁體（乾淨 OpenCC／防重複處理）
// @name:en      Simplified to Traditional Chinese (Clean OpenCC)
// @namespace    https://github.com/secretwebmaster/chinese-converter-js
// @version      8.0.0
// @description  只使用 OpenCC 官方完整字典；不加入危險的逐字自訂替換；支援動態內容並防止重複處理。
// @match        *://*/*
// @run-at       document-start
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_info
// @require      https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/dist/umd/full.js
// @license      MIT
// ==/UserScript==

(() => {
  'use strict';

  const CONFIG = {
    enabled: true,
    convertAttributes: true,
    dynamicDelay: 80,
    font: {
      enabled: true,
      family: '"PingFang TC", "Microsoft JhengHei", sans-serif'
    },
    skipTags: new Set([
      'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION',
      'CODE', 'PRE', 'KBD', 'SAMP', 'SVG', 'MATH'
    ])
  };

  const ATTRIBUTES = ['title', 'placeholder', 'alt', 'aria-label'];
  const PROCESSED_TEXT = new WeakSet();
  const PROCESSED_ATTRIBUTES = new WeakMap();
  const PENDING_ROOTS = new Set();

  let converter;
  let observer;
  let flushTimer = 0;
  let convertedTextNodes = 0;
  let convertedAttributes = 0;
  let skippedNodes = 0;

  function notify(title, text, timeout = 2500) {
    if (typeof GM_notification === 'function') {
      GM_notification({ title, text, timeout });
    }
  }

  function getSetting(key, fallback) {
    try {
      return typeof GM_getValue === 'function' ? GM_getValue(key, fallback) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function setSetting(key, value) {
    try {
      if (typeof GM_setValue === 'function') GM_setValue(key, value);
    } catch (_) {}
  }

  function shouldSkipElement(element) {
    for (let el = element; el && el !== document.documentElement; el = el.parentElement) {
      if (CONFIG.skipTags.has(el.tagName)) return true;
      if (el.isContentEditable) return true;
      if (el.closest?.('[data-opencc-skip]')) return true;
    }
    return false;
  }

  function looksChinese(text) {
    return /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/.test(text);
  }

  function convertTextNode(node) {
    if (!node?.parentElement || PROCESSED_TEXT.has(node)) return;
    const source = node.nodeValue;

    if (!source || !source.trim() || !looksChinese(source) || shouldSkipElement(node.parentElement)) {
      PROCESSED_TEXT.add(node);
      skippedNodes++;
      return;
    }

    const result = converter(source);
    if (result !== source) {
      node.nodeValue = result;
      convertedTextNodes++;
    }

    // Mark only after conversion. Subsequent MutationObserver callbacks caused by
    // our own write therefore do not convert the already-converted node again.
    PROCESSED_TEXT.add(node);
  }

  function convertElementAttributes(element) {
    if (!CONFIG.convertAttributes || !element || shouldSkipElement(element)) return;

    let done = PROCESSED_ATTRIBUTES.get(element);
    if (!done) {
      done = new Set();
      PROCESSED_ATTRIBUTES.set(element, done);
    }

    for (const name of ATTRIBUTES) {
      if (done.has(name) || !element.hasAttribute(name)) continue;
      const source = element.getAttribute(name);
      if (source && looksChinese(source)) {
        const result = converter(source);
        if (result !== source) {
          element.setAttribute(name, result);
          convertedAttributes++;
        }
      }
      done.add(name);
    }
  }

  function convertRoot(root) {
    if (!root || !CONFIG.enabled) return;

    if (root.nodeType === Node.TEXT_NODE) {
      convertTextNode(root);
      return;
    }

    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        return parent && !shouldSkipElement(parent)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    });

    let textNode;
    while ((textNode = walker.nextNode())) convertTextNode(textNode);

    if (!CONFIG.convertAttributes || !root.querySelectorAll) return;
    if (root.nodeType === Node.ELEMENT_NODE) convertElementAttributes(root);
    root.querySelectorAll('[title], [placeholder], [alt], [aria-label]')
      .forEach(convertElementAttributes);
  }

  function queueRoot(root) {
    if (!root) return;
    PENDING_ROOTS.add(root);
    if (flushTimer) return;

    flushTimer = window.setTimeout(() => {
      flushTimer = 0;
      const roots = [...PENDING_ROOTS];
      PENDING_ROOTS.clear();
      for (const item of roots) convertRoot(item);
    }, CONFIG.dynamicDelay);
  }

  function startObserver() {
    observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'characterData') {
          // Content supplied by the site may reuse an existing text node. Allow
          // this new site-provided value to be converted once.
          PROCESSED_TEXT.delete(record.target);
          queueRoot(record.target);
          continue;
        }

        if (record.type === 'attributes') {
          const done = PROCESSED_ATTRIBUTES.get(record.target);
          done?.delete(record.attributeName);
          queueRoot(record.target);
          continue;
        }

        for (const added of record.addedNodes) {
          if (added.nodeType === Node.TEXT_NODE || added.nodeType === Node.ELEMENT_NODE || added.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
            queueRoot(added);
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

  function applyFont() {
    if (!CONFIG.font.enabled) return;
    let style = document.getElementById('clean-opencc-font');
    if (!style) {
      style = document.createElement('style');
      style.id = 'clean-opencc-font';
      (document.head || document.documentElement).appendChild(style);
    }
    style.textContent = `
      body { font-family: ${CONFIG.font.family} !important; }
      code, pre, kbd, samp, textarea, input, select {
        font-family: inherit !important;
      }
    `;
  }

  function clearProcessedAndReconvert() {
    // WeakSet cannot be cleared. Replacing the page's text is unnecessary:
    // OpenCC output is stable. Reloading is the clean way to process page source again.
    notify('簡轉繁', '請重新整理頁面後重新執行轉換。', 3000);
  }

  function registerMenu() {
    GM_registerMenuCommand('🔄 重新整理並轉換', () => location.reload());

    GM_registerMenuCommand('🔤 切換繁體字體', () => {
      CONFIG.font.enabled = !CONFIG.font.enabled;
      setSetting('clean_opencc_font_enabled', CONFIG.font.enabled);
      document.getElementById('clean-opencc-font')?.remove();
      if (CONFIG.font.enabled) applyFont();
      notify('簡轉繁字體', CONFIG.font.enabled ? '已啟用 PingFang TC / Microsoft JhengHei' : '已停用字體覆寫');
    });

    GM_registerMenuCommand('⚙️ 切換轉換', () => {
      CONFIG.enabled = !CONFIG.enabled;
      setSetting('clean_opencc_enabled', CONFIG.enabled);
      notify('簡轉繁', CONFIG.enabled ? '已啟用；重新整理後會重新轉換。' : '已停用。');
    });

    GM_registerMenuCommand('ℹ️ 診斷資訊', () => {
      const font = getComputedStyle(document.body).fontFamily;
      const version = typeof GM_info !== 'undefined' ? GM_info.script.version : '8.0.0';
      notify('簡轉繁診斷', [
        `版本：${version}`,
        `OpenCC：${typeof OpenCC !== 'undefined' ? '已載入' : '載入失敗'}`,
        `已轉換文字節點：${convertedTextNodes}`,
        `已轉換屬性：${convertedAttributes}`,
        `略過節點：${skippedNodes}`,
        `字體 CSS：${font}`
      ].join('\n'), 7000);
    });

    GM_registerMenuCommand('🧹 說明：重新轉換', clearProcessedAndReconvert);
  }

  function init() {
    CONFIG.enabled = getSetting('clean_opencc_enabled', true);
    CONFIG.font.enabled = getSetting('clean_opencc_font_enabled', true);

    if (typeof OpenCC === 'undefined') {
      console.error('[Clean OpenCC] OpenCC 載入失敗');
      notify('簡轉繁錯誤', 'OpenCC 載入失敗；請檢查 @require URL 或網路。', 5000);
      return;
    }

    converter = OpenCC.Converter({ from: 'cn', to: 'tw' });
    applyFont();
    startObserver();

    if (document.body) {
      convertRoot(document.body);
    } else {
      document.addEventListener('DOMContentLoaded', () => convertRoot(document.body), { once: true });
    }

    registerMenu();
    console.info('[Clean OpenCC] 已啟用：純 OpenCC、動態內容支援、防重複處理。');
  }

  init();
})();
