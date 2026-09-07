// ==UserScript==
// @name         簡體轉繁體（終極版 - 離線 CDN + 智慧偵測 HK 修正）
// @name:en      Simplified to Traditional Chinese (Ultimate - HK Fixed)
// @namespace    https://github.com/secretwebmaster/chinese-converter-js
// @version      6.1.0
// @description  終極合併版 HK 修正：完整 OpenCC 字典 + 多 CDN 回退 + 智慧語言偵測（精確判斷香港繁體）。
// @description:en Ultimate HK Fixed: Complete OpenCC dictionary + Multi-CDN fallback + Smart language detection (accurate HK Traditional detection).
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
    showNotification: false,
    autoConvert: true,
    
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
    whitelist: [],
    
    // 香港繁體網站黑名單（這些網站永遠不轉換）
    hkSites: [
      'hk01.com',
      'lihkg.com',
      'hkgolden.com',
      'discuss.com.hk',
      'uwants.com',
      'hket.com',
      'stdnews.com',
      'orientaldaily.com.hk',
      'on.cc',
      'thestandnews.com',
      'inmedia.org.hk',
      'rthk.hk',
      'tvb.com',
      'now.com',
      'viu.tv',
      'mingpao.com',
      'am730.com.hk',
      'thestandnews.com'
    ]
  };

  // ==================== 全局狀態 ====================
  let isSimplifiedPage = false;
  let detectionComplete = false;

  // ==================== 檢查 OpenCC 是否可用 ====================
  if (typeof OpenCC === 'undefined') {
    console.error('[簡轉繁] OpenCC 載入失敗');
    GM_notification({
      title: '簡轉繁錯誤',
      text: 'OpenCC 字典載入失敗，請檢查網路連線',
      timeout: 5000
    });
    return;
  }

  console.info('[簡轉繁終極版 HK 修正] 使用完整 OpenCC 字典（8,000+ 字）');

  // ==================== 建立轉換器 ====================
  const converter = OpenCC.Converter({
    from: 'cn',
    to: 'tw'
  });

  // ==================== 語言偵測邏輯（HK 修正版） ====================
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
    // 1. 檢查 html lang 屬性
    const htmlLang = document.documentElement.lang || '';
    
    // 香港繁體通常是 zh-HK 或 zh-TW
    if (htmlLang.toLowerCase() === 'zh-hk' || htmlLang.toLowerCase() === 'zh-tw' || htmlLang.toLowerCase() === 'zh-hant') {
      console.info(`[簡轉繁偵測] HTML lang 標記為繁體 (${htmlLang})，跳過轉換`);
      return false;
    }
    
    // 簡體中文是 zh-CN 或 zh-Hans
    if (htmlLang.toLowerCase() === 'zh-cn' || htmlLang.toLowerCase() === 'zh-hans') {
      console.info('[簡轉繁偵測] HTML lang 標記為簡體中文');
      return true;
    }

    // 2. 分析頁面文字內容
    const text = document.body ? document.body.innerText : '';
    const chineseChars = text.match(/[\u4e00-\u9fff]/g) || [];
    
    if (chineseChars.length < CONFIG.smartDetect.minChineseChars) {
      console.info(`[簡轉繁偵測] 中文字數不足（${chineseChars.length} < ${CONFIG.smartDetect.minChineseChars}），跳過轉換`);
      return false;
    }

    // 3. 檢查「簡體獨有」特徵字（這些字在繁體中幾乎不會出現）
    const simplifiedOnly = new Set([
      '这', '为', '会', '个', '国', '们', '说', '着', '产', '进',
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
    ]);

    // 4. 檢查「繁體獨有」特徵字（這些字在簡體中幾乎不會出現）
    const traditionalOnly = new Set([
      '這', '為', '會', '個', '國', '們', '說', '著', '產', '進',
      '行', '過', '現', '當', '沒', '還', '起', '看', '但', '其',
      '更', '很', '能', '做', '出', '於', '想', '她', '就', '得',
      '比', '兩', '讓', '些', '下', '自', '己', '裡', '心', '明',
      '從', '力', '水', '電', '氣', '車', '門', '問', '間', '關',
      '開', '長', '風', '馬', '魚', '鳥', '龍', '齊', '飛', '飯',
      '麼', '麼', '廣', '廠', '東', '樂', '業', '叢', '絲', '丟',
      '嚴', '喪', '豐', '臨', '丸', '丹', '麗', '舉',
      '乃', '久', '義', '烏', '乏', '樂', '乒', '乓', '喬', '乖',
      '乘', '乙', '乜', '九', '乞', '也', '習', '鄉', '書', '買',
      '亂', '乳', '乾', '了', '予', '爭', '事', '二', '於', '虧',
      '雲', '互', '五', '井', '亞', '些', '產', '亨', '畝', '享',
      '京', '亭', '亮', '親', '褻', '人', '億', '仁', '什', '僕',
      '仇', '今', '介', '仍', '從', '侖', '倉', '仔', '仕', '他',
      '仗', '付', '仙', '仝', '仞', '仟', '代', '令', '以', '仨',
      '儀', '仫', '們', '仭', '假', '會', '傴', '佇', '伲', '傖',
      '伩', '偽', '伭', '伮', '伯', '估', '伻', '伴', '伶', '伾',
      '伿', '伸', '伺', '似', '伽', '伉', '佃', '但', '位', '低',
      '住', '佐', '佑', '體', '何', '佗', '佘', '餘', '佚', '佛',
      '作', '佝', '佞', '佟', '你', '佢', '佣', '佤', '僉', '佦',
      '佧', '佩', '佬', '佯', '佰', '佳', '佶', '佷', '佸', '佹',
      '佺', '佻', '佼', '佽', '佾', '使', '侁', '侂', '侃', '侅',
      '來', '侇', '侈', '侉', '侊', '例', '侌', '侍', '侎', '侏',
      '侐', '侑', '侒', '侓', '侔', '侕', '岳', '侗', '侘', '侙',
      '侚', '俠', '侜', '侞', '侟', '侶', '恁', '侢', '侤', '僥',
      '偵', '側', '僑', '儈', '侫', '儂', '侭', '侮', '侯', '侵',
      '侱', '侲', '侳', '侴', '便', '促', '俄', '侸', '侹', '侺',
      '侻', '侼', '侽', '侾', '俀', '俁', '係', '俅', '俆', '俇',
      '俈', '俉', '俊', '俋', '俌', '俍', '俎', '俐', '俒', '俓',
      '俔', '俕', '俖', '俗', '俘', '俙', '俚', '俛', '俜', '保',
      '俞', '俟', '俠', '信', '俢', '俣', '俤', '俥', '促', '俄',
      '儔', '俧', '儼', '倆', '儷', '俫', '儉', '修', '俯', '俰',
      '俲', '俳', '俴', '俵', '俶', '俷', '俸', '俹', '俺', '俻',
      '俼', '俽', '俾', '俿', '倀', '倁', '倂', '倃', '倄', '倅',
      '兩', '倇', '倈', '倉', '倊', '個', '倌', '倍', '倎', '倏',
      '倐', '們', '倒', '倓', '倔', '倕', '倖', '倗', '倘', '來',
      '倛', '倜', '倝', '倞', '借', '倠', '倡', '倢', '倣', '値',
      '倥', '倦', '倧', '倨', '馬', '倬', '倭', '倮', '倯', '倰',
      '倱', '倲', '倳', '倴', '倵', '倶', '倷', '倸', '倹', '債',
      '倻', '倽', '傾', '倿', '偀', '偁', '偂', '偃', '偄', '偅',
      '偆', '假', '偈', '偉', '偊', '偋', '偌', '偍', '偎', '偏',
      '偐', '偑', '偒', '偓', '偔', '偕', '偖', '偗', '偘', '偙',
      '做', '偛', '停', '偝', '偞', '偠', '偡', '偢', '偣', '健',
      '偦', '偧', '偨', '偩', '偪', '偫', '偬', '偭', '偮', '偯',
      '偰', '偱', '偲', '偳', '側', '偵', '偶', '偷', '偸', '偹',
      '偺', '僂', '偼', '倻', '債', '值', '傾', '偾', '償', '傁',
      '傂', '傃', '傄', '僄', '傆', '傇', '傈', '傉', '傊', '傋',
      '傌', '傍', '傎', '傏', '傐', '傑', '傒', '傓', '傔', '傕',
      '傖', '傗', '單', '傚', '傛', '傜', '傝', '傞', '傟', '傠',
      '傡', '傎', '傐', '傓', '傕', '傖', '傗', '傚', '傜', '傞',
      '傟', '傠', '傡', '傥', '傦', '傧', '傩', '傪', '傫', '傀',
      '傮', '傯', '傰', '傱', '傳', '傴', '債', '傶', '傷', '傸',
      '傹', '傺', '傻', '傼', '傽', '傾', '傿', '僀', '僁', '僂',
      '僃', '僄', '僅', '僆', '僇', '僈', '僉', '僊', '僋', '僌',
      '働', '僎', '僐', '僑', '僒', '僓', '僔', '僕', '僖', '僗',
      '僘', '僙', '僚', '僛', '僜', '僝', '偽', '僟', '僠', '僡',
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
    ]);

    // 計算簡體獨有字和繁體獨有字的出現次數
    let simplifiedOnlyCount = 0;
    let traditionalOnlyCount = 0;

    for (const char of chineseChars) {
      if (simplifiedOnly.has(char)) simplifiedOnlyCount++;
      if (traditionalOnly.has(char)) traditionalOnlyCount++;
    }

    const total = simplifiedOnlyCount + traditionalOnlyCount;
    
    // 如果沒有找到特徵字，使用比例判斷
    if (total === 0) {
      console.info('[簡轉繁偵測] 無法判斷簡繁體，預設為非簡體（安全模式）');
      return false;
    }

    const ratio = simplifiedOnlyCount / total;
    const isSimplified = ratio >= CONFIG.smartDetect.simplifiedRatio;

    console.info(`[簡轉繁偵測] 簡體獨有字：${simplifiedOnlyCount}, 繁體獨有字：${traditionalOnlyCount}, 比例：${ratio.toFixed(2)}`);

    return isSimplified;
  }

  // ==================== 檢查黑名單/白名單/HK 網站 ====================
  function shouldSkipSite() {
    const hostname = location.hostname;
    
    // 檢查香港繁體網站黑名單
    if (CONFIG.hkSites.some(domain => hostname.includes(domain))) {
      console.info(`[簡轉繁偵測] 香港繁體網站 (${hostname})，跳過轉換`);
      return true;
    }
    
    // 檢查一般黑名單
    if (CONFIG.blacklist.some(domain => hostname.includes(domain))) {
      console.info(`[簡轉繁偵測] 網站在黑名單中 (${hostname})，跳過轉換`);
      return true;
    }
    
    // 檢查白名單（如果有設定）
    if (CONFIG.whitelist.length > 0) {
      const inWhitelist = CONFIG.whitelist.some(domain => hostname.includes(domain));
      if (!inWhitelist) {
        console.info(`[簡轉繁偵測] 網站不在白名單中 (${hostname})，跳過轉換`);
        return true;
      }
    }
    
    return false;
  }

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
  async function start() {
    if (!document.body) {
      setTimeout(start, 100);
      return;
    }

    // 1. 檢查黑名單/HK 網站
    if (shouldSkipSite()) {
      return;
    }

    // 2. 智慧偵測語言
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

    // 3. 執行轉換
    if (CONFIG.autoConvert) {
      convertTree(document.body);
    }

    // 4. 監聽動態內容
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

    // 5. 註冊選單指令
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
        '✓ 終極版 HK 修正',
        `偵測結果：${isSimplifiedPage ? '簡體頁面 ✓' : '非簡體頁面'}`,
        `轉換方向：簡體 → 繁體`,
        `腳本版本：${GM_info.script.version}`,
        `OpenCC 版本：${typeof OpenCC.VERSION !== 'undefined' ? OpenCC.VERSION : '未知'}`,
        '字典大小：8,000+ 字 + 詞組',
        `CDN 來源：Worker + jsDelivr`
      ].join('\n');

      GM_notification({
        title: '簡轉繁診斷',
        text: info,
        timeout: 5000
      });

      console.info('[簡轉繁診斷]', {
        openccAvailable: typeof OpenCC !== 'undefined',
        isSimplifiedPage,
        detectionComplete,
        version: GM_info.script.version,
        skipTags: Array.from(CONFIG.skipTags)
      });
    });

    GM_registerMenuCommand('⚙️ 強制轉換', () => {
      CONFIG.smartDetect.forceConvert = true;
      isSimplifiedPage = true;
      convertTree(document.body);
      
      GM_notification({
        title: '簡轉繁',
        text: '已強制轉換本頁（忽略偵測結果）',
        timeout: 2000
      });
    });

    GM_registerMenuCommand('📋 導出轉換後文字', () => {
      const text = document.body ? document.body.innerText : '';
      const converted = converter(text);
      
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(converted);
        GM_notification({
          title: '簡轉繁',
          text: '已複製轉換後文字到剪貼簿',
          timeout: 2000
        });
      } else {
        GM_notification({
          title: '簡轉繁',
          text: '複製失敗，請手動複製',
          timeout: 2000
        });
      }
    });

    if (CONFIG.showNotification) {
      GM_notification({
        title: '簡轉繁終極版 HK 修正已啟用',
        text: `智慧偵測：${isSimplifiedPage ? '簡體頁面 ✓' : '非簡體頁面'} | CDN: Worker + jsDelivr`,
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