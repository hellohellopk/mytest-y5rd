// ==UserScript==
// @name         簡體轉繁體（OpenCC）
// @name:en      Simplified to Traditional Chinese (OpenCC)
// @namespace    https://github.com/secretwebmaster/chinese-converter-js
// @version      4.1.0
// @description  自動將網頁簡體中文轉為繁體（預設香港）；略過非中文與已是繁體的內容，支援動態內容。
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

  const TARGET = 'hk'; // 'hk' 香港 / 'tw' 台灣 / 't' 通用繁體

  const CONFIG = {
    enabled: true,
    convertAttributes: true,
    showStartupNotification: false,
    delay: 80,
    skipTags: new Set([
      'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION',
      'CODE', 'PRE', 'KBD', 'SAMP', 'SVG', 'MATH'
    ])
  };
  const ATTRS = ['title', 'placeholder', 'alt', 'aria-label'];
  const ATTR_SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'KBD', 'SAMP', 'SVG', 'MATH']);

  const DONE_TEXT = new WeakMap();   // node -> 已寫入的轉換結果
  const DONE_ATTR = new WeakMap();   // element -> Map(name -> 已寫入的轉換結果)
  const pendingRoots = new Set();
  const pendingAttrs = new Set();
  let timer = 0;
  let converter;
  let observer;
  let nText = 0;
  let nAttr = 0;

  const tagOf = (el) => String(el.tagName || '').toUpperCase();

  function notify(title, text, timeout = 2500) {
    try {
      if (typeof GM_notification === 'function') GM_notification({ title, text, timeout });
    } catch (_) {}
  }

  function getSetting(key, fallback) {
    try { return typeof GM_getValue === 'function' ? GM_getValue(key, fallback) : fallback; }
    catch (_) { return fallback; }
  }
  function setSetting(key, value) {
    try { if (typeof GM_setValue === 'function') GM_setValue(key, value); } catch (_) {}
  }

  const HAN = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;
  const KANA_HANGUL = /[\u3040-\u30FF\u31F0-\u31FF\u1100-\u11FF\uAC00-\uD7AF]/;

  function getLang(el) {
    for (let e = el; e; e = e.parentElement) {
      const v = e.getAttribute?.('lang')?.trim();
      if (v) return v.replace(/_/g, '-').toLowerCase();
    }
    return '';
  }

  function shouldConvert(text, el) {
    if (!HAN.test(text)) return false;
    const lang = getLang(el);
    if (lang) {
      if (!/^zh(?:-|$)/.test(lang)) return false;
      if (/^zh-(?:hant|tw|hk|mo|cht)(?:-|$)/.test(lang)) return false;
    }
    if (KANA_HANGUL.test(text)) return false;
    return true;
  }

  function skipElement(el, attrMode) {
    if (!el) return true;
    if (el.closest?.('[data-opencc-skip]')) return true;
    const tags = attrMode ? ATTR_SKIP : CONFIG.skipTags;
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      if (tags.has(tagOf(e))) return true;
      if (e.isContentEditable) return true;
    }
    return false;
  }

  function convertTextNode(node) {
    if (!CONFIG.enabled || !node?.isConnected) return;
    const source = node.nodeValue;
    if (!source || !source.trim()) return;
    if (DONE_TEXT.get(node) === source) return; // 這是我們自己寫入的結果
    const parent = node.parentElement;
    if (!parent || skipElement(parent, false) || !shouldConvert(source, parent)) return;

    try {
      const result = converter(source);
      if (result !== source) {
        DONE_TEXT.set(node, result);
        node.nodeValue = result;
        nText++;
      }
    } catch (e) {
      console.warn('[簡轉繁] 轉換錯誤:', e);
    }
  }

  function convertAttributes(el) {
    if (!CONFIG.enabled || !CONFIG.convertAttributes || !el?.isConnected) return;
    if (skipElement(el, true)) return;
    let done = DONE_ATTR.get(el);
    for (const name of ATTRS) {
      if (!el.hasAttribute(name)) continue;
      const value = el.getAttribute(name);
      if (!value || done?.get(name) === value) continue;
      if (!shouldConvert(value, el)) continue;
      try {
        const result = converter(value);
        if (result !== value) {
          if (!done) { done = new Map(); DONE_ATTR.set(el, done); }
          done.set(name, result);
          el.setAttribute(name, result);
          nAttr++;
        }
      } catch (e) {
        console.warn('[簡轉繁] 屬性轉換錯誤:', name, e);
      }
    }
  }

  function convertTree(root) {
    if (!root || !CONFIG.enabled) return;
    if (root.nodeType === Node.TEXT_NODE) { convertTextNode(root); return; }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        return n.parentElement && !skipElement(n.parentElement, false)
          ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(convertTextNode);

    if (!CONFIG.convertAttributes) return;
    if (root.nodeType === Node.ELEMENT_NODE) convertAttributes(root);
    root.querySelectorAll?.('[title],[placeholder],[alt],[aria-label]').forEach(convertAttributes);
  }

  function convertTitle() {
    const t = document.querySelector('title')?.firstChild;
    if (t) convertTextNode(t);
  }

  function flush() {
    timer = 0;
    const roots = [...pendingRoots];
    const attrs = [...pendingAttrs];
    pendingRoots.clear();
    pendingAttrs.clear();
    roots.forEach(convertTree);
    attrs.forEach(convertAttributes);
  }
  function schedule() {
    if (!timer) timer = setTimeout(flush, CONFIG.delay);
  }
  function queueRoot(node) {
    if (!node) return;
    for (const p of pendingRoots) if (p === node || p.contains?.(node)) return;
    for (const p of pendingRoots) if (node.contains?.(p)) pendingRoots.delete(p);
    pendingRoots.add(node);
    schedule();
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'characterData') { queueRoot(r.target); continue; }
        if (r.type === 'attributes') { pendingAttrs.add(r.target); schedule(); continue; }
        for (const added of r.addedNodes) queueRoot(added);
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: CONFIG.convertAttributes,
      attributeFilter: CONFIG.convertAttributes ? ATTRS : undefined
    });
  }

  function registerMenu() {
    if (typeof GM_registerMenuCommand !== 'function') return;

    GM_registerMenuCommand('🔄 重新轉換本頁', () => {
      convertTree(document.body);
      convertTitle();
      notify('簡轉繁', '已重新轉換本頁內容。', 2000);
    });

    GM_registerMenuCommand('⚙️ 切換轉換（重新整理後生效）', () => {
      CONFIG.enabled = !CONFIG.enabled;
      setSetting('opencc_enabled', CONFIG.enabled);
      notify('簡轉繁', CONFIG.enabled ? '已啟用。' : '已停用。');
    });

    GM_registerMenuCommand('ℹ️ 診斷資訊', () => {
      const version = typeof GM_info !== 'undefined' ? GM_info.script.version : '4.1.0';
      notify('簡轉繁診斷', [
        `版本：${version}`,
        `目標：${TARGET}`,
        `已轉換文字節點：${nText}`,
        `已轉換屬性：${nAttr}`
      ].join('\n'), 6000);
    });
  }

  function init() {
    if (typeof OpenCC === 'undefined') {
      console.error('[簡轉繁] OpenCC 載入失敗');
      notify('簡轉繁錯誤', 'OpenCC 載入失敗，請檢查 @require 網址或網路。', 5000);
      return;
    }
    CONFIG.enabled = getSetting('opencc_enabled', true);

    try {
      converter = OpenCC.Converter({ from: 'cn', to: TARGET });
    } catch (e) {
      console.error('[簡轉繁] 初始化失敗', e);
      notify('簡轉繁錯誤', 'OpenCC 初始化失敗。', 5000);
      return;
    }

    const run = () => {
      startObserver();
      convertTree(document.body);
      convertTitle();
      registerMenu();
      if (CONFIG.showStartupNotification) notify('簡轉繁已啟用', `目標：${TARGET}`);
    };

    if (document.readyState === 'loading') {
      startObserver(); // document-start 就開始監聽,避免漏掉串流載入的內容
      document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
      run();
    }
  }

  init();
})();
