// ==UserScript==
// @name         簡體轉香港繁體（乾淨 OpenCC／防重複處理）
// @name:en      Simplified to Hong Kong Traditional Chinese (Clean OpenCC)
// @namespace    https://github.com/secretwebmaster/chinese-converter-js
// @version      8.1.6
// @description  僅將簡體中文轉為香港繁體；略過其他語言，支援動態內容並防止重複處理。
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
    skipTags: new Set([
      'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION',
      'CODE', 'PRE', 'KBD', 'SAMP', 'SVG', 'MATH'
    ])
  };
  const ATTRIBUTES = ['title', 'placeholder', 'alt', 'aria-label'];
  const ATTRIBUTE_SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'KBD', 'SAMP', 'SVG', 'MATH'
  ]);
  const PROCESSED_TEXT = new WeakSet();
  const PROCESSED_ATTRIBUTES = new WeakMap();
  const EXPECTED_TEXT_WRITES = new WeakMap();
  const EXPECTED_ATTRIBUTE_WRITES = new WeakMap();
  const PENDING_ROOTS = new Set();
  const PENDING_ATTR_ELEMENTS = new Set();

  let converter;
  let observer;
  let flushTimer = 0;
  let convertedTextNodes = 0;
  let convertedAttributes = 0;
  let skippedNodes = 0;
  let simplifiedSourceCharacters;
  let protectedTraditionalCharacters;

  const tagOf = (el) => String(el.tagName || '').toUpperCase();

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
    if (element?.closest?.('[data-opencc-skip]')) return true;
    for (let el = element; el && el !== document.documentElement; el = el.parentElement) {
      if (CONFIG.skipTags.has(tagOf(el))) return true;
      if (el.isContentEditable) return true;
    }
    return false;
  }

  function shouldSkipAttributeElement(element) {
    if (element?.closest?.('[data-opencc-skip]')) return true;
    for (let el = element; el && el !== document.documentElement; el = el.parentElement) {
      if (ATTRIBUTE_SKIP_TAGS.has(tagOf(el))) return true;
      if (el.isContentEditable) return true;
    }
    return false;
  }

  function looksChinese(text) {
    return /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/.test(text);
  }

  function initializeLocaleGuards() {
    const dictionary = OpenCC.Locale?.from?.cn?.[0];
    if (typeof dictionary !== 'string' || !dictionary.trim()) return false;

    const sourceCharacters = new Set();
    const traditionalCharacters = new Set();

    for (const entry of dictionary.split('|')) {
      const [source, target] = entry.split(' ');
      if (!source || !target) continue;
      for (const character of source) sourceCharacters.add(character);
      if (source !== target) {
        for (const character of target) traditionalCharacters.add(character);
      }
    }

    if (!sourceCharacters.size || !traditionalCharacters.size) return false;
    simplifiedSourceCharacters = sourceCharacters;
    protectedTraditionalCharacters = traditionalCharacters;
    return true;
  }

  function containsSimplifiedSourceCharacter(text) {
    if (!simplifiedSourceCharacters) return true;
    for (const character of text) {
      if (simplifiedSourceCharacters.has(character)) return true;
    }
    return false;
  }

  function containsSimplifiedSpecificCharacter(text) {
    if (!simplifiedSourceCharacters || !protectedTraditionalCharacters) {
      return containsSimplifiedSourceCharacter(text);
    }
    for (const character of text) {
      if (simplifiedSourceCharacters.has(character) && !protectedTraditionalCharacters.has(character)) {
        return true;
      }
    }
    return false;
  }

  function getLanguageHint(element) {
    for (let el = element; el; el = el.parentElement) {
      const lang = el.getAttribute?.('lang')?.trim();
      if (lang) return lang.replace(/_/g, '-').toLowerCase();
    }
    return '';
  }

  function shouldConvertSimplifiedChinese(text, element) {
    if (!looksChinese(text)) return false;

    const lang = getLanguageHint(element);
    if (lang) {
      if (!/^zh(?:-|$)/i.test(lang)) return false;
      if (/^zh-(?:hant|tw|hk|mo|cht)(?:-|$)/i.test(lang)) return false;
      if (/^zh-(?:hans|cn|sg|chs)(?:-|$)/i.test(lang)) {
        return containsSimplifiedSourceCharacter(text);
      }
    }

    if (/[\u3040-\u30FF\u31F0-\u31FF\u1100-\u11FF\uAC00-\uD7AF]/.test(text)) {
      return false;
    }
    return containsSimplifiedSpecificCharacter(text);
  }

  function convertSimplifiedSegments(text) {
    if (!simplifiedSourceCharacters || !protectedTraditionalCharacters) {
      return converter(text);
    }

    let result = '';
    let segment = '';

    const flushSegment = () => {
      if (!segment) return;
      result += containsSimplifiedSourceCharacter(segment)
        ? converter(segment)
        : segment;
      segment = '';
    };

    for (const character of text) {
      if (protectedTraditionalCharacters.has(character)) {
        flushSegment();
        result += character;
      } else {
        segment += character;
      }
    }
    flushSegment();
    return result;
  }

  function convertTextNode(node) {
    if (!node?.parentElement || !node.isConnected || PROCESSED_TEXT.has(node)) return;
    const source = node.nodeValue;

    if (
      !source ||
      !source.trim() ||
      !shouldConvertSimplifiedChinese(source, node.parentElement) ||
      shouldSkipElement(node.parentElement)
    ) {
      PROCESSED_TEXT.add(node);
      skippedNodes++;
      return;
    }

    const result = convertSimplifiedSegments(source);
    if (result !== source) {
      EXPECTED_TEXT_WRITES.set(node, result);
      node.nodeValue = result;
      convertedTextNodes++;
    }
    PROCESSED_TEXT.add(node);
  }

  function convertElementAttributes(element) {
    if (!CONFIG.enabled || !CONFIG.convertAttributes || !element || !element.isConnected) return;
    if (shouldSkipAttributeElement(element)) return;

    let done = PROCESSED_ATTRIBUTES.get(element);
    if (!done) {
      done = new Set();
      PROCESSED_ATTRIBUTES.set(element, done);
    }

    for (const name of ATTRIBUTES) {
      if (done.has(name) || !element.hasAttribute(name)) continue;
      const source = element.getAttribute(name);
      if (source && shouldConvertSimplifiedChinese(source, element)) {
        const result = convertSimplifiedSegments(source);
        if (result !== source) {
          let expected = EXPECTED_ATTRIBUTE_WRITES.get(element);
          if (!expected) {
            expected = new Map();
            EXPECTED_ATTRIBUTE_WRITES.set(element, expected);
          }
          expected.set(name, result);
          element.setAttribute(name, result);
          convertedAttributes++;
        }
      }
      done.add(name);
    }
  }

  function convertRoot(root) {
    if (!root || !CONFIG.enabled) return;
    if (root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE && !root.isConnected) return;

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

  function convertTitle() {
    const titleNode = document.querySelector('title')?.firstChild;
    if (titleNode) convertTextNode(titleNode);
  }

  function flushPending() {
    flushTimer = 0;
    const roots = [...PENDING_ROOTS];
    const attrs = [...PENDING_ATTR_ELEMENTS];
    PENDING_ROOTS.clear();
    PENDING_ATTR_ELEMENTS.clear();
    for (const item of roots) convertRoot(item);
    for (const item of attrs) convertElementAttributes(item);
  }

  function scheduleFlush() {
    if (!flushTimer) flushTimer = window.setTimeout(flushPending, CONFIG.dynamicDelay);
  }

  function queueRoot(root) {
    if (!root) return;
    for (const pending of PENDING_ROOTS) {
      if (pending === root || pending.contains?.(root)) return;
    }
    for (const pending of PENDING_ROOTS) {
      if (root.contains?.(pending)) PENDING_ROOTS.delete(pending);
    }
    PENDING_ROOTS.add(root);
    scheduleFlush();
  }

  function queueAttributeTarget(element) {
    if (!element) return;
    PENDING_ATTR_ELEMENTS.add(element);
    scheduleFlush();
  }

  function startObserver() {
    if (observer) return;
    if (!document.documentElement) {
      document.addEventListener('DOMContentLoaded', startObserver, { once: true });
      return;
    }

    observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'characterData') {
          const expected = EXPECTED_TEXT_WRITES.get(record.target);
          if (expected !== undefined && record.target.nodeValue === expected) {
            EXPECTED_TEXT_WRITES.delete(record.target);
            continue;
          }
          EXPECTED_TEXT_WRITES.delete(record.target);
          PROCESSED_TEXT.delete(record.target);
          queueRoot(record.target);
          continue;
        }

        if (record.type === 'attributes') {
          const expected = EXPECTED_ATTRIBUTE_WRITES.get(record.target);
          const expectedValue = expected?.get(record.attributeName);
          if (expectedValue !== undefined && record.target.getAttribute(record.attributeName) === expectedValue) {
            expected.delete(record.attributeName);
            continue;
          }
          expected?.delete(record.attributeName);
          const done = PROCESSED_ATTRIBUTES.get(record.target);
          done?.delete(record.attributeName);
          queueAttributeTarget(record.target);
          continue;
        }

        for (const added of record.addedNodes) {
          if (
            added.nodeType === Node.TEXT_NODE ||
            added.nodeType === Node.ELEMENT_NODE ||
            added.nodeType === Node.DOCUMENT_FRAGMENT_NODE
          ) {
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

  function registerMenu() {
    if (typeof GM_registerMenuCommand !== 'function') return;

    GM_registerMenuCommand('🔄 重新整理並轉換', () => location.reload());

    GM_registerMenuCommand('⚙️ 切換轉換', () => {
      CONFIG.enabled = !CONFIG.enabled;
      setSetting('clean_opencc_enabled', CONFIG.enabled);
      notify('香港繁體轉換', CONFIG.enabled ? '已啟用；重新整理後會重新轉換。' : '已停用。');
    });

    GM_registerMenuCommand('ℹ️ 診斷資訊', () => {
      const version = typeof GM_info !== 'undefined' ? GM_info.script.version : '8.1.6';
      notify('香港繁體診斷', [
        `版本：${version}`,
        `OpenCC：${typeof OpenCC !== 'undefined' ? '已載入' : '載入失敗'}`,
        `字元篩選：${simplifiedSourceCharacters ? '啟用' : '停用'}`,
        `已轉換文字節點：${convertedTextNodes}`,
        `已轉換屬性：${convertedAttributes}`,
        `略過節點：${skippedNodes}`
      ].join('\n'), 7000);
    });
  }

  function init() {
    CONFIG.enabled = getSetting('clean_opencc_enabled', true);

    if (typeof OpenCC === 'undefined') {
      console.error('[Clean OpenCC HK] OpenCC 載入失敗');
      notify('香港繁體轉換錯誤', 'OpenCC 載入失敗；請檢查 @require URL 或網路。', 5000);
      return;
    }

    try {
      converter = OpenCC.Converter({ from: 'cn', to: 'hk' });
      if (!initializeLocaleGuards()) {
        simplifiedSourceCharacters = undefined;
        protectedTraditionalCharacters = undefined;
        console.warn('[Clean OpenCC HK] 字典格式無法解析；已停用字元篩選並使用一般轉換。');
      }
    } catch (error) {
      console.error('[Clean OpenCC HK] Converter initialization failed', error);
      notify('香港繁體轉換錯誤', 'OpenCC 初始化失敗；請檢查 @require 版本或網路。', 5000);
      return;
    }

    startObserver();

    const run = () => {
      convertRoot(document.body);
      convertTitle();
    };
    if (document.body) run();
    else document.addEventListener('DOMContentLoaded', run, { once: true });

    registerMenu();
    console.info('[Clean OpenCC HK] 已啟用：香港 OpenCC、動態內容支援、防重複處理。');
  }

  init();
})();
