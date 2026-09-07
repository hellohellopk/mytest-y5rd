// ==UserScript==
// @name         簡體轉繁體（終極加強版 - 港台異體字 + 性能優化）
// @name:en      Simplified to Traditional Chinese (Ultimate Plus - HK/TW Variants + Performance)
// @namespace    https://github.com/secretwebmaster/chinese-converter-js
// @version      7.0.0
// @description  終極加強版：完整 OpenCC 字典 + 香港/台灣異體字選擇 + 性能優化（批次處理 + 快取）+ 智慧偵測。
// @description:en Ultimate Plus version: Complete OpenCC dictionary + HK/TW variants selection + Performance optimization (batch + cache) + Smart detection.
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
    // 轉換器設定
    defaultVariant: 'hk',     // 'tw' (台灣) 或 'hk' (香港)
    
    // 性能優化設定
    performance: {
      enabled: true,          // 啟用性能優化
      batchSize: 100,         // 每批次處理的節點數
      batchDelay: 30,         // 批次間延遲（ms）
      cacheEnabled: true,     // 啟用文字快取
      cacheSize: 2000         // 快取最大条目數
    },
    
    // DOM 處理設定
    skipTags: new Set([
      'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT',
      'SELECT', 'OPTION', 'CODE', 'PRE', 'KBD', 'SAMP'
    ]),
    
    // 通知設定
    showNotification: false,
    autoConvert: true,
    
    // 智慧偵測設定
    smartDetect: {
      enabled: true,
      minChineseChars: 50,
      simplifiedRatio: 0.3,
      checkDelay: 1000,
      forceConvert: false
    },
    
    // 黑名單
    blacklist: [
      'github.com',
      'stackoverflow.com',
      'npmjs.com',
      'reddit.com'
    ],
    
    // 白名單
    whitelist: []
  };

  // ==================== 全局狀態 ====================
  let isSimplifiedPage = false;
  let detectionComplete = false;
  let currentVariant = GM_getValue('user_variant', CONFIG.defaultVariant);
  
  // 性能統計
  const stats = {
    convertedChars: 0,
    skippedNodes: 0,
    cacheHits: 0,
    cacheMisses: 0,
    startTime: 0
  };

  // 快取
  const conversionCache = new Map();

  // ==================== 檢查 OpenCC 是否可用 ====================
  if (typeof OpenCC === 'undefined') {
    console.error('[簡轉繁終極加強版] OpenCC 載入失敗');
    GM_notification({
      title: '簡轉繁錯誤',
      text: 'OpenCC 字典載入失敗，請檢查網路連線',
      timeout: 5000
    });
    return;
  }

  console.info(`[簡轉繁終極加強版] 使用完整 OpenCC 字典（${currentVariant === 'tw' ? '台灣' : '香港'}異體字）`);
  console.info('[簡轉繁終極加強版] 性能優化：批次處理 + 快取已啟用');

  // ==================== 建立轉換器 ====================
  // OpenCC 支援多種目標變體
  const converterMap = {
    tw: OpenCC.Converter({ from: 'cn', to: 'tw' }),  // 台灣繁體
    hk: OpenCC.Converter({ from: 'cn', to: 'hk' }),  // 香港繁體
    jp: OpenCC.Converter({ from: 'cn', to: 'jp' }),  // 日本新字體
    twt: OpenCC.Converter({ from: 'cn', to: 'twp' }), // 台灣常用詞
    hkt: OpenCC.Converter({ from: 'cn', to: 'hkp' })  // 香港常用詞
  };

  const converter = converterMap[currentVariant] || converterMap.tw;

  // ==================== 快取函數 ====================
  function convertWithCache(text) {
    if (!CONFIG.performance.cacheEnabled) {
      return converter(text);
    }

    if (conversionCache.has(text)) {
      stats.cacheHits++;
      return conversionCache.get(text);
    }

    stats.cacheMisses++;
    const converted = converter(text);
    
    // 限制快取大小
    if (conversionCache.size >= CONFIG.performance.cacheSize) {
      const firstKey = conversionCache.keys().next().value;
      conversionCache.delete(firstKey);
    }
    
    conversionCache.set(text, converted);
    return converted;
  }

  // ==================== 語言偵測邏輯 ====================
  function detectLanguage() {
    if (!document.body) {
      return new Promise((resolve) => {
        setTimeout(() => resolve(detectLanguage()), 100);
      });
    }

    return new Promise((resolve) => {
      setTimeout(() => {
        const result = analyzePageContent();
        resolve(result);
      }, CONFIG.smartDetect.checkDelay);
    });
  }

  function analyzePageContent() {
    const htmlLang = document.documentElement.lang || '';
    if (htmlLang.toLowerCase() === 'zh-cn' || htmlLang.toLowerCase() === 'zh-hans') {
      console.info('[簡轉繁偵測] HTML lang 標記為簡體中文');
      return true;
    }

    const text = document.body ? document.body.innerText : '';
    const chineseChars = text.match(/[\u4e00-\u9fff]/g) || [];
    
    if (chineseChars.length < CONFIG.smartDetect.minChineseChars) {
      console.info(`[簡轉繁偵測] 中文字數不足（${chineseChars.length}），跳過轉換`);
      return false;
    }

    const simplifiedIndicators = [
      '的', '一', '是', '在', '了', '有', '和', '人', '这', '中',
      '大', '为', '上', '个', '国', '我', '以', '他', '会', '来',
      '们', '后', '到', '说', '而', '着', '对', '生', '产', '进',
      '行', '过', '现', '当', '没', '还', '起', '看', '但', '其',
      '更', '很', '能', '做', '出', '于', '想', '她', '就', '得',
      '比', '两', '让', '些', '下', '自', '己', '里', '心', '明',
      '从', '力', '水', '电', '气', '车', '门', '问', '间', '关',
      '开', '长', '风', '马', '鱼', '鸟', '龙', '齐', '飞', '饭',
      '么', '广', '厂', '东', '乐', '业', '丛', '丝', '丢',
      '严', '丧', '丰', '串', '临', '丸', '丹', '丽', '举',
      '乃', '久', '义', '乌', '乏', '乐', '乒', '乓', '乔', '乖',
      '乘', '乙', '乜', '九', '乞', '也', '习', '乡', '书', '买',
      '乱', '乳', '乾', '了', '予', '争', '事', '二', '于', '亏',
      '云', '互', '五', '井', '亚', '些', '产', '亨', '亩', '享',
      '京', '亭', '亮', '亲', '亵', '人', '亿', '仁', '什', '仆',
      '仇', '今', '介', '仍', '从', '仑', '仓', '仔', '仕', '他',
      '仗', '付', '仙', '仝', '仞', '仟', '代', '令', '以', '仨',
      '仪', '仫', '们', '仭', '假', '会', '伛', '伫', '伲', '伧',
      '伩', '伪', '伭', '伮', '伯', '估', '伻', '伴', '伶', '伾',
      '伿', '伸', '伺', '似', '伽', '伉', '佃', '但', '位', '低',
      '住', '佐', '佑', '体', '何', '佗', '佘', '余', '佚', '佛',
      '作', '佝', '佞', '佟', '你', '佢', '佣', '佤', '佥', '佦',
      '佧', '佩', '佬', '佯', '佰', '佳', '佶', '佷', '佸', '佹',
      '佺', '佻', '佼', '佽', '佾', '使', '侁', '侂', '侃', '侅',
      '来', '侇', '侈', '侉', '侊', '例', '侌', '侍', '侎', '侏',
      '侐', '侑', '侒', '侓', '侔', '侕', '岳', '侗', '侘', '侙',
      '侚', '侠', '侜', '侞', '侟', '侣', '恁', '侢', '侤', '侥',
      '侦', '侧', '侨', '侩', '侫', '侬', '侭', '侮', '侯', '侵',
      '侱', '侲', '侳', '侴', '便', '促', '俄', '侸', '侹', '侺',
      '侻', '侼', '侽', '侾', '俀', '俁', '係', '俅', '俆', '俇',
      '俈', '俉', '俊', '俋', '俌', '俍', '俎', '俐', '俒', '俓',
      '俔', '俕', '俖', '俗', '俘', '俙', '俚', '俛', '俜', '保',
      '俞', '俟', '俠', '信', '俢', '俣', '俤', '俥', '促', '俄',
      '俦', '俧', '俨', '俩', '俪', '俫', '俭', '修', '俯', '俰',
      '俲', '俳', '俴', '俵', '俶', '俷', '俸', '俹', '俺', '俻',
      '俼', '俽', '俾', '俿', '倀', '倁', '倂', '倃', '倄', '倅',
      '兩', '倇', '倈', '倉', '倊', '個', '倌', '倍', '倎', '倏',
      '倐', '們', '倒', '倓', '倔', '倕', '倖', '倗', '倘', '來',
      '倛', '倜', '倝', '倞', '借', '倠', '倡', '倢', '倣', '値',
      '倥', '倦', '倧', '倨', '馬', '倬', '倭', '倮', '倯', '倰',
      '倱', '倲', '倳', '倴', '倵', '倶', '倷', '倸', '倹', '债',
      '倻', '倽', '倾', '倿', '偀', '偁', '偂', '偃', '偄', '偅',
      '偆', '假', '偈', '偉', '偊', '偋', '偌', '偍', '偎', '偏',
      '偐', '偑', '偒', '偓', '偔', '偕', '偖', '偗', '偘', '偙',
      '做', '偛', '停', '偝', '偞', '偠', '偡', '偢', '偣', '健',
      '偦', '偧', '偨', '偩', '偪', '偫', '偬', '偭', '偮', '偯',
      '偰', '偱', '偲', '偳', '側', '偵', '偶', '偷', '偸', '偹',
      '偺', '偻', '偼', '倻', '债', '值', '倾', '偾', '偿', '傁',
      '傂', '傃', '傄', '僄', '傆', '傇', '傈', '傉', '傊', '傋',
      '傌', '傍', '傎', '傏', '傐', '傑', '傒', '傓', '傔', '傕',
      '傖', '傗', '單', '傚', '傛', '傜', '傝', '傞', '傟', '傠',
      '傡', '傎', '傐', '傓', '傕', '傖', '傗', '傚', '傜', '傞',
      '傟', '傠', '傡', '傥', '傦', '傧', '傩', '傪', '傫', '傀',
      '傮', '傯', '傰', '傱', '傳', '傴', '債', '傶', '傷', '傸',
      '傹', '傺', '傻', '傼', '傽', '傾', '傿', '僀', '僁', '僂',
      '僃', '僄', '僅', '僆', '僇', '僈', '僉', '僊', '僋', '僌',
      '働', '僎', '僐', '僑', '僒', '僓', '僔', '僕', '僖', '僗',
      '僘', '僙', '僚', '僛', '僜', '僝', '僞', '僟', '僠', '僡',
      '僢', '僣', '僤', '僥', '僦', '僨', '僩', '僪', '僫', '僬',
      '僭', '僮', '僯', '僰', '僱', '僲', '僳', '僴', '僵', '僶',
      '僷', '僸', '價', '僺', '僻', '僼', '僽', '僾', '僿', '儀',
      '儁', '儂', '儃', '億', '儅', '儆', '儇', '儈', '儉', '儊',
      '儋', '儌', '儍', '儎', '儏', '儐', '儑', '儒', '儓', '儔',
      '儕', '儖', '儗', '儘', '儙', '儚', '儛', '儜', '儝', '儞',
      '償', '儠', '儡', '儢', '儣', '儤', '儥', '儦', '儧', '儨',
      '儩', '優', '儫', '儬', '儭', '儮', '儯', '儰', '儱', '儳',
      '儴', '儵', '儶', '儷', '儸', '儹', '儺', '儻', '儼', '儽',
      '儾'
    ];

    const traditionalIndicators = [
      '的', '一', '是', '在', '了', '有', '和', '人', '這', '中',
      '大', '為', '上', '個', '國', '我', '以', '他', '會', '來',
      '們', '後', '到', '說', '而', '著', '對', '生', '產', '進',
      '行', '過', '現', '當', '沒', '還', '起', '看', '但', '其',
      '更', '很', '能', '做', '出', '於', '想', '她', '就', '得',
      '比', '兩', '讓', '些', '下', '自', '己', '裡', '心', '明',
      '從', '力', '水', '電', '氣', '車', '門', '問', '間', '關',
      '開', '長', '風', '馬', '魚', '鳥', '龍', '齊', '飛', '飯',
      '麼', '麼', '廣', '廠', '東', '樂', '業', '叢', '絲', '丟',
      '嚴', '喪', '個', '豐', '串', '臨', '丸', '丹', '麗', '舉'
    ];

    let simplifiedCount = 0;
    let traditionalCount = 0;

    for (const char of chineseChars) {
      if (simplifiedIndicators.includes(char)) simplifiedCount++;
      if (traditionalIndicators.includes(char)) traditionalCount++;
    }

    const total = simplifiedCount + traditionalCount;
    if (total === 0) {
      console.info('[簡轉繁偵測] 無法判斷簡繁體，預設為簡體');
      return true;
    }

    const ratio = simplifiedCount / total;
    const isSimplified = ratio >= CONFIG.smartDetect.simplifiedRatio;

    console.info(`[簡轉繁偵測] 簡體特徵字：${simplifiedCount}, 繁體特徵字：${traditionalCount}, 比例：${ratio.toFixed(2)}`);

    return isSimplified;
  }

  // ==================== 檢查黑名單/白名單 ====================
  function shouldSkipSite() {
    const hostname = location.hostname;
    
    if (CONFIG.blacklist.some(domain => hostname.includes(domain))) {
      console.info(`[簡轉繁偵測] 網站在黑名單中 (${hostname})，跳過轉換`);
      return true;
    }
    
    if (CONFIG.whitelist.length > 0) {
      const inWhitelist = CONFIG.whitelist.some(domain => hostname.includes(domain));
      if (!inWhitelist) {
        console.info(`[簡轉繁偵測] 網站不在白名單中 (${hostname})，跳過轉換`);
        return true;
      }
    }
    
    return false;
  }

  // ==================== DOM 遍歷轉換（性能優化版） ====================
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
    if (shouldSkipNode(node)) {
      stats.skippedNodes++;
      return;
    }

    try {
      const original = node.nodeValue;
      const converted = convertWithCache(original);
      
      if (converted !== original) {
        node.nodeValue = converted;
        stats.convertedChars += converted.length;
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
        const converted = convertWithCache(value);

        if (converted !== value) {
          el.setAttribute(name, converted);
        }
      } catch (e) {
        console.warn('[簡轉繁] 屬性轉換錯誤:', name, e);
      }
    }
  }

  // 批次處理版本
  function convertTreeBatched(root) {
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

    // 批次處理
    if (CONFIG.performance.enabled && CONFIG.performance.batchSize > 0) {
      let index = 0;
      
      function processBatch() {
        const end = Math.min(index + CONFIG.performance.batchSize, nodes.length);
        
        for (let i = index; i < end; i++) {
          convertTextNode(nodes[i]);
        }
        
        index = end;
        
        if (index < nodes.length) {
          setTimeout(processBatch, CONFIG.performance.batchDelay);
        } else {
          // 處理屬性
          if (root.nodeType === Node.ELEMENT_NODE) {
            convertAttributes(root);
          }

          if (root.querySelectorAll) {
            root.querySelectorAll('[title],[placeholder],[alt],[aria-label]')
              .forEach(convertAttributes);
          }
        }
      }
      
      processBatch();
    } else {
      // 非批次處理（向後相容）
      nodes.forEach(convertTextNode);

      if (root.nodeType === Node.ELEMENT_NODE) {
        convertAttributes(root);
      }

      if (root.querySelectorAll) {
        root.querySelectorAll('[title],[placeholder],[alt],[aria-label]')
          .forEach(convertAttributes);
      }
    }
  }

  // ==================== 初始化 ====================
  async function start() {
    stats.startTime = performance.now();
    
    if (!document.body) {
      setTimeout(start, 100);
      return;
    }

    if (shouldSkipSite()) {
      return;
    }

    if (CONFIG.smartDetect.enabled && !CONFIG.smartDetect.forceConvert) {
      isSimplifiedPage = await detectLanguage();
      detectionComplete = true;

      if (!isSimplifiedPage) {
        console.info('[簡轉繁偵測] 非簡體中文頁面，跳過轉換');
        
        GM_registerMenuCommand('ℹ️ 偵測結果', () => {
          GM_notification({
            title: '簡轉繁偵測',
            text: '此頁面被判定為非簡體中文頁面，已跳過轉換',
            timeout: 3000
          });
        });
        
        return;
      }

      console.info('[簡轉繁偵測] 簡體中文頁面，開始轉換');
    }

    if (CONFIG.autoConvert) {
      convertTreeBatched(document.body);
    }

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'characterData') {
          convertTextNode(record.target);
          continue;
        }

        for (const node of record.addedNodes) {
          convertTreeBatched(node);
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });

    // 註冊選單指令
    GM_registerMenuCommand('🔄 重新轉換本頁為繁體', () => {
      stats.convertedChars = 0;
      stats.skippedNodes = 0;
      stats.startTime = performance.now();
      
      convertTreeBatched(document.body);

      if (CONFIG.showNotification) {
        GM_notification({
          title: '簡轉繁',
          text: '已重新轉換本頁內容為繁體中文',
          timeout: 2000
        });
      }
    });

    GM_registerMenuCommand('🇹🇼 轉換為台灣繁體', () => {
      currentVariant = 'tw';
      GM_setValue('user_variant', 'tw');
      GM_notification({
        title: '簡轉繁',
        text: '已切換為台灣繁體（台灣異體字）',
        timeout: 2000
      });
    });

    GM_registerMenuCommand('🇭🇰 轉換為香港繁體', () => {
      currentVariant = 'hk';
      GM_setValue('user_variant', 'hk');
      GM_notification({
        title: '簡轉繁',
        text: '已切換為香港繁體（香港異體字）',
        timeout: 2000
      });
    });

    GM_registerMenuCommand('📊 性能統計', () => {
      const duration = performance.now() - stats.startTime;
      const hitRate = stats.cacheHits + stats.cacheMisses > 0 
        ? ((stats.cacheHits / (stats.cacheHits + stats.cacheMisses)) * 100).toFixed(1)
        : 0;
      
      const info = [
        '📊 性能統計',
        `轉換時間：${duration.toFixed(2)} ms`,
        `轉換字數：${stats.convertedChars}`,
        `跳過節點：${stats.skippedNodes}`,
        `快取命中：${stats.cacheHits}`,
        `快取未命中：${stats.cacheMisses}`,
        `快取命中率：${hitRate}%`,
        `快取大小：${conversionCache.size}/${CONFIG.performance.cacheSize}`,
        `當前異體字：${currentVariant === 'tw' ? '台灣' : '香港'}`
      ].join('\n');

      GM_notification({
        title: '簡轉繁性能統計',
        text: info,
        timeout: 6000
      });

      console.info('[簡轉繁性能統計]', {
        duration,
        convertedChars: stats.convertedChars,
        skippedNodes: stats.skippedNodes,
        cacheHits: stats.cacheHits,
        cacheMisses: stats.cacheMisses,
        cacheHitRate: hitRate,
        cacheSize: conversionCache.size,
        variant: currentVariant
      });
    });

    GM_registerMenuCommand('ℹ️ 診斷資訊', () => {
      const info = [
        '✓ 終極加強版',
        `異體字：${currentVariant === 'tw' ? '台灣' : '香港'}`,
        `偵測結果：${isSimplifiedPage ? '簡體頁面 ✓' : '非簡體頁面'}`,
        `轉換方向：簡體 → 繁體`,
        `腳本版本：${GM_info.script.version}`,
        `OpenCC 版本：${typeof OpenCC.VERSION !== 'undefined' ? OpenCC.VERSION : '未知'}`,
        '字典大小：8,000+ 字 + 詞組',
        `CDN 來源：Worker + jsDelivr`,
        `性能優化：批次 + 快取 ✓`
      ].join('\n');

      GM_notification({
        title: '簡轉繁診斷',
        text: info,
        timeout: 6000
      });
    });

    GM_registerMenuCommand('⚙️ 強制轉換', () => {
      CONFIG.smartDetect.forceConvert = true;
      isSimplifiedPage = true;
      convertTreeBatched(document.body);
      
      GM_notification({
        title: '簡轉繁',
        text: '已強制轉換本頁（忽略偵測結果）',
        timeout: 2000
      });
    });

    GM_registerMenuCommand('🗑️ 清除快取', () => {
      conversionCache.clear();
      stats.cacheHits = 0;
      stats.cacheMisses = 0;
      
      GM_notification({
        title: '簡轉繁',
        text: '已清除轉換快取',
        timeout: 1500
      });
    });

    if (CONFIG.showNotification) {
      GM_notification({
        title: '簡轉繁終極加強版已啟用',
        text: `${currentVariant === 'tw' ? '🇹🇼 台灣' : '🇭🇰 香港'}異體字 | 性能優化 ✓`,
        timeout: 3000
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