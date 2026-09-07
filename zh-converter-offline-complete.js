// ==UserScript==
// @name         簡體轉繁體（完整離線版 - OpenCC 8,000+ 字）
// @name:en      Simplified to Traditional Chinese (Offline Complete - OpenCC 8,000+ chars)
// @namespace    https://github.com/secretwebmaster/chinese-converter-js
// @version      4.0.0
// @description  在所有網頁自動將簡體中文轉為繁體中文；使用完整 OpenCC 字典（8,000+ 字 + 詞組），100% 離線可用。
// @description:en Convert Simplified Chinese to Traditional Chinese on all webpages; uses complete OpenCC dictionary (8,000+ chars + phrases), 100% offline.
// @author       BYVoid, secretwebmaster
// @match        *://*/*
// @exclude      *://www.google.com/*
// @exclude      *://mail.google.com/*
// @run-at       document-start
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @grant        GM_info
// @grant        GM_getValue
// @grant        GM_setValue
// @license      MIT
// @require      https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/dist/umd/full.js
// ==/UserScript==

(() => {
  'use strict';

  // ==================== 配置區 ====================
  const CONFIG = {
    skipTags: new Set([
      'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT',
      'SELECT', 'OPTION', 'CODE', 'PRE', 'KBD', 'SAMP'
    ]),
    showNotification: true,
    autoConvert: true,
    cacheKey: 'opencc_bundle_cached',
    cacheVersion: '1.0.5'
  };

  // ==================== 檢查 OpenCC 是否可用 ====================
  if (typeof OpenCC === 'undefined') {
    console.error('[簡轉繁離線版] OpenCC 載入失敗');
    GM_notification({
      title: '簡轉繁錯誤',
      text: 'OpenCC 字典載入失敗，請檢查網路連線',
      timeout: 5000
    });
    return;
  }

  console.info('[簡轉繁離線版] 使用完整 OpenCC 字典（8,000+ 字）');

  // ==================== 建立轉換器 ====================
  const converter = OpenCC.Converter({
    from: 'cn',  // 簡體
    to: 'tw'     // 繁體（台灣標準）
  });

  // ==================== DOM 遍歷轉換 ====================
  function shouldSkipNode(node) {
    if (!node.parentNode) return false;

    let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode;

    while (el && el !== document.body) {
      if (CONFIG.skipTags.has(el.tagName)) return true;
      if (el.isContentEditable) return true;
      el = el.parentNode;
    }

    return false;
  }

  function convertTextNode(node) {
    if (!node.nodeValue || !node.nodeValue.trim()) return;
    if (shouldSkipNode(node)) return;

    try {
      const converted = converter(node.nodeValue);
      if (converted !== node.nodeValue) {
        node.nodeValue = converted;
      }
    } catch (e) {
      console.warn('[簡轉繁] 轉換錯誤:', e);
    }
  }

  function convertAttributes(el) {
    if (!el || shouldSkipNode(el)) return;

    const attrs = ['title', 'placeholder', 'alt', 'aria-label'];

    for (const name of attrs) {
      if (!el.hasAttribute(name)) continue;

      try {
        const value = el.getAttribute(name);
        const converted = converter(value);

        if (converted !== value) {
          el.setAttribute(name, converted);
        }
      } catch (e) {
        console.warn('[簡轉繁] 屬性轉換錯誤:', name, e);
      }
    }
  }

  function convertTree(root) {
    if (!root) return;

    if (root.nodeType === Node.TEXT_NODE) {
      convertTextNode(root);
      return;
    }

    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
      return;
    }

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          return shouldSkipNode(node)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const nodes = [];
    let node;

    while ((node = walker.nextNode())) {
      nodes.push(node);
    }

    nodes.forEach(convertTextNode);

    if (root.nodeType === Node.ELEMENT_NODE) {
      convertAttributes(root);
    }

    if (root.querySelectorAll) {
      root.querySelectorAll('[title],[placeholder],[alt],[aria-label]')
        .forEach(convertAttributes);
    }
  }

  // ==================== 初始化 ====================
  function start() {
    if (!document.body) {
      setTimeout(start, 100);
      return;
    }

    if (CONFIG.autoConvert) {
      convertTree(document.body);
    }

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'characterData') {
          convertTextNode(record.target);
          continue;
        }

        for (const node of record.addedNodes) {
          convertTree(node);
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });

    GM_registerMenuCommand('🔄 重新轉換本頁為繁體', () => {
      convertTree(document.body);

      if (CONFIG.showNotification) {
        GM_notification({
          title: '簡轉繁',
          text: '已重新轉換本頁內容為繁體中文',
          timeout: 2000
        });
      }
    });

    GM_registerMenuCommand('ℹ️ 診斷資訊', () => {
      const info = [
        '✓ 完整 OpenCC 離線版',
        '轉換方向：簡體 → 繁體',
        `腳本版本：${GM_info.script.version}`,
        `OpenCC 版本：${typeof OpenCC.VERSION !== 'undefined' ? OpenCC.VERSION : '未知'}`,
        '字典大小：8,000+ 字 + 詞組'
      ].join('\n');

      GM_notification({
        title: '簡轉繁診斷',
        text: info,
        timeout: 5000
      });

      console.info('[簡轉繁診斷]', {
        openccAvailable: typeof OpenCC !== 'undefined',
        version: GM_info.script.version,
        skipTags: Array.from(CONFIG.skipTags)
      });
    });

    if (CONFIG.showNotification) {
      GM_notification({
        title: '簡轉繁已啟用',
        text: '使用完整 OpenCC 字典（8,000+ 字）',
        timeout: 2500
      });
    }
  }

  // ==================== 執行 ====================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();