// ==UserScript==
// @name         簡體轉繁體（終極版 v2 - 蘋方/微軟正黑體）
// @name:en      Simplified to Traditional Chinese (Ultimate v2 - PingFang/Microsoft JhengHei)
// @namespace    https://github.com/secretwebmaster/chinese-converter-js
// @version      7.1.0
// @description  終極合併版：完整 OpenCC 字典 + jsDelivr CDN + 智慧偵測 + 蘋方/微軟正黑體字體。
// @description:en Ultimate version: Complete OpenCC dictionary + jsDelivr CDN + Smart detection + PingFang/Microsoft JhengHei font.
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
    // 字體設定（預設使用 蘋方 TC + 微軟正黑體）
    font: {
      enabled: true,
      fontFamily: '"PingFang TC", "Microsoft JhengHei", "Heiti TC", "Noto Sans TC", "思源黑體 TC", "微軟正黑體", "蘋果儷中黑", "Apple LiGothic", sans-serif',
      fontSize: null,                   // null = 使用網站預設，或設為 '16px'
      lineHeight: null,                 // null = 使用網站預設，或設為 '1.6'
      applyTo: 'body',                  // 套用範圍：'body', 'html', 或 CSS selector
      excludeSelectors: [               // 排除的元素（不套用字體）
        'code', 'pre', 'kbd', 'samp', 'tt',  // 程式碼
        'textarea', 'input', 'select',        // 表單
        '.highlight', '.code-block',          // 程式碼區塊
        '[class*="code"]',                    // class 包含 code 的元素
        '[class*="highlight"]'                // class 包含 highlight 的元素
      ]
    },
    
    // DOM 處理設定
    skipTags: new Set([
      'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT',
      'SELECT', 'OPTION', 'CODE', 'PRE', 'KBD', 'SAMP'
    ]),
    
    // 通知設定
    showNotification: true,
    autoConvert: true,
    
    // 智慧偵測設定
    smartDetect: {
      enabled: true,              // 是否啟用智慧偵測
      minChineseChars: 50,        // 最少中文字數閾值
      simplifiedRatio: 0.3,       // 簡體字比例閾值（30%）
      checkDelay: 1000,           // 頁面載入後延遲檢查時間（ms）
      forceConvert: false         // 強制轉換（忽略偵測結果）
    },
    
    // 黑名單（這些網站永遠不轉換）
    blacklist: [
      'github.com',
      'stackoverflow.com',
      'npmjs.com',
      'reddit.com'
    ],
    
    // 白名單（只在這些網站啟用，空陣列表示所有網站）
    whitelist: []
  };

  // ==================== 全局狀態 ====================
  let isSimplifiedPage = false;
  let detectionComplete = false;
  let fontApplied = false;

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

  console.info('[簡轉繁] 使用完整 OpenCC 字典（8,000+ 字）');
  console.info('[簡轉繁] 字體設定：蘋方 TC + 微軟正黑體');

  // ==================== 套用字體 ====================
  function applyFont() {
    if (!CONFIG.font.enabled || fontApplied) {
      return;
    }

    try {
      const target = document.querySelector(CONFIG.font.applyTo);
      if (!target) {
        console.warn('[簡轉繁字體] 找不到目標元素:', CONFIG.font.applyTo);
        return;
      }

      // 建立或獲取 style 元素
      let styleEl = document.getElementById('zh-converter-font-style');
      
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'zh-converter-font-style';
        styleEl.type = 'text/css';
        document.head.appendChild(styleEl);
      }

      // 建立 CSS 規則
      let cssRules = '';
      
      // 主體字體設定
      const fontFamily = CONFIG.font.fontFamily;
      const fontSize = CONFIG.font.fontSize ? `font-size: ${CONFIG.font.fontSize};` : '';
      const lineHeight = CONFIG.font.lineHeight ? `line-height: ${CONFIG.font.lineHeight};` : '';
      
      if (fontFamily || fontSize || lineHeight) {
        cssRules += `${CONFIG.font.applyTo} {\n`;
        if (fontFamily) cssRules += `  font-family: ${fontFamily} !important;\n`;
        if (fontSize) cssRules += `  font-size: ${fontSize}\n`;
        if (lineHeight) cssRules += `  line-height: ${lineHeight}\n`;
        cssRules += `}\n`;
      }

      // 排除的元素
      if (CONFIG.font.excludeSelectors && CONFIG.font.excludeSelectors.length > 0) {
        const excludeRules = CONFIG.font.excludeSelectors.join(', ');
        cssRules += `${excludeRules} {\n`;
        cssRules += `  font-family: inherit !important;\n`;
        cssRules += `  font-size: inherit !important;\n`;
        cssRules += `  line-height: inherit !important;\n`;
        cssRules += `}\n`;
      }

      styleEl.textContent = cssRules;
      fontApplied = true;
      
      console.info('[簡轉繁字體] 字體已套用 (PingFang TC, Microsoft JhengHei)');
      
    } catch (e) {
      console.error('[簡轉繁字體] 套用失敗:', e);
    }
  }

  // ==================== 移除字體 ====================
  function removeFont() {
    const styleEl = document.getElementById('zh-converter-font-style');
    if (styleEl) {
      styleEl.remove();
      fontApplied = false;
      console.info('[簡轉繁字體] 字體已移除');
    }
  }

  // ==================== 切換字體 ====================
  function toggleFont() {
    CONFIG.font.enabled = !CONFIG.font.enabled;
    GM_setValue('zh_converter_font_enabled', CONFIG.font.enabled);
    
    if (CONFIG.font.enabled) {
      applyFont();
      GM_notification({
        title: '簡轉繁字體',
        text: '已啟用繁體字體 (PingFang TC + Microsoft JhengHei)',
        timeout: 2000
      });
    } else {
      removeFont();
      GM_notification({
        title: '簡轉繁字體',
        text: '已停用繁體字體',
        timeout: 2000
      });
    }
  }

  // ==================== 載入使用者設定 ====================
  function loadUserSettings() {
    // 載入字體設定
    const fontEnabled = GM_getValue('zh_converter_font_enabled', null);
    if (fontEnabled !== null) {
      CONFIG.font.enabled = fontEnabled;
    }
  }

  // ==================== 建立轉換器 ====================
  const converter = OpenCC.Converter({
    from: 'cn',
    to: 'tw'
  });

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
      console.info(`[簡轉繁偵測] 中文字數不足，跳過轉換`);
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
      '儾', '儿', '兀', '允', '兂', '元', '兄', '充', '兆', '先',
      '光', '克', '兌', '免', '兎', '兏', '党', '兜', '兓', '兖',
      '兗', '兘', '兙', '兩', '兛', '兝', '兞', '兟', '兠', '兡',
      '兣', '兤', '入', '內', '全', '兩', '八', '公', '六', '兮',
      '兰', '共', '关', '兴', '兵', '其', '具', '典', '兹', '养',
      '兼', '兽', '冀', '内', '冈', '册', '再', '冏', '冒', '冔',
      '冕', '冗', '写', '冚', '军', '农', '冢', '冣', '冤', '冥',
      '冦', '冧', '冨', '冩', '冪', '冫', '冬', '冯', '冰', '冱',
      '冲', '决', '冴', '况', '泠', '冸', '冹', '冺', '冻', '冼',
      '冽', '冾', '冿', '净', '凄', '准', '凇', '凈', '凉', '凊',
      '凎', '减', '凐', '凋', '凒', '凓', '凔', '凕', '凖', '凗',
      '凘', '凙', '凚', '凜', '凝', '凞', '凟', '几', '凡', '凤',
      '処', '凧', '凨', '凩', '凪', '凫', '凭', '凬', '凮', '凯',
      '凲', '凳', '凴', '凵', '凶', '凷', '凸', '凹', '出', '击',
      '凼', '函', '凾', '凿', '刀', '刁', '刂', '刃', '刄', '刅',
      '刉', '刊', '刋', '刌', '刍', '刎', '刏', '刐', '刈', '刓',
      '刔', '刕', '刖', '刘', '则', '创', '刜', '初', '刞', '刟',
      '删', '刡', '刢', '刣', '判', '別', '刦', '刧', '刨', '利',
      '刪', '别', '刬', '刭', '到', '刱', '刲', '制', '刷', '券',
      '刹', '刺', '刵', '制', '刷', '券', '刨', '利', '别', '刬',
      '刭', '到', '刱', '刲', '制', '刷', '券', '刹', '刺', '劑',
      '劀', '劁', '劂', '劃', '劄', '劅', '劆', '剧', '剰', '劈',
      '劉', '劊', '劋', '劌', '劍', '劏', '劐', '劑', '劒', '劓',
      '劔', '劕', '劖', '劗', '劘', '劙', '劚', '力', '劝', '办',
      '功', '加', '务', '劣', '动', '助', '努', '劫', '劢', '励',
      '劲', '劳', '劥', '劦', '劧', '动', '劯', '劰', '勉', '勋',
      '勂', '勒', '勄', '勅', '勆', '勘', '務', '勈', '勉', '勧',
      '勊', '勝', '勞', '勍', '勎', '勏', '勐', '勧', '勓', '勔',
      '動', '勖', '勘', '務', '勚', '勛', '勜', '勝', '勞', '募',
      '勠', '勡', '勢', '勣', '勤', '勥', '勦', '勧', '勨', '勩',
      '勪', '勫', '勬', '勭', '勮', '勯', '勰', '勱', '勲', '勳',
      '勴', '勵', '勶', '勷', '勸', '勹', '包', '匆', '匈', '匁',
      '匃', '匄', '包', '匆', '匈', '匉', '匊', '匋', '匌', '匍',
      '匎', '匏', '匐', '匑', '匒', '匓', '匔', '匕', '化', '北',
      '匙', '匚', '匛', '匜', '匝', '匞', '匟', '匠', '匣', '匢',
      '匣', '匪', '匥', '匦', '匮', '匯', '匩', '匫', '匬', '匭',
      '匯', '匰', '匱', '匲', '匳', '匴', '匵', '匶', '匷', '匸',
      '区', '匹', '医', '匼', '匽', '匾', '匿', '十', '千', '卆',
      '升', '午', '半', '卋', '华', '协', '单', '卖', '南', '卐',
      '卙', '卢', '卛', '卤', '卝', '卞', '卟', '占', '卡', '卢',
      '卣', '卤', '卥', '卦', '卧', '卫', '卩', '卪', '卷', '却',
      '卬', '卭', '卸', '卮', '卯', '印', '危', '卲', '即', '却',
      '卶', '卷', '卸', '卹', '卺', '卻', '卼', '卽', '卾', '卿',
      '卿', '厀', '厁', '厂', '厅', '历', '厉', '压', '厌', '厐',
      '厑', '厒', '厓', '厔', '厕', '厖', '厗', '厘', '厙', '厚',
      '厛', '厜', '厝', '厞', '厢', '厠', '厡', '厦', '厣', '厥',
      '厥', '厨', '厧', '厮', '厩', '厪', '厫', '厬', '厌', '厮',
      '厯', '厰', '厱', '厲', '厳', '厴', '厵', '厶', '去', '县',
      '叁', '参', '叄', '叅', '叆', '叇', '又', '叉', '及', '友',
      '双', '反', '収', '发', '叏', '叐', '变', '叙', '叛', '叓',
      '叕', '取', '叚', '叔', '叜', '叝', '叞', '叟', '叠', '叡',
      '叢'
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

    // 1. 載入使用者設定
    loadUserSettings();

    // 2. 套用字體（立即套用，不等待偵測）
    if (CONFIG.font.enabled) {
      applyFont();
    }

    // 3. 檢查黑名單/白名單
    if (shouldSkipSite()) {
      return;
    }

    // 4. 智慧偵測語言
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

    // 5. 執行轉換
    if (CONFIG.autoConvert) {
      convertTree(document.body);
    }

    // 6. 監聽動態內容
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

    // 7. 註冊選單指令
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

    GM_registerMenuCommand('🔤 切換字體', toggleFont);

    GM_registerMenuCommand('ℹ️ 診斷資訊', () => {
      const info = [
        '✓ 終極版 v2（jsDelivr CDN + 智慧偵測 + 字體）',
        `偵測結果：${isSimplifiedPage ? '簡體頁面 ✓' : '非簡體頁面'}`,
        `轉換方向：簡體 → 繁體`,
        `字體狀態：${CONFIG.font.enabled ? '已啟用 (PingFang TC + Microsoft JhengHei)' : '已停用'}`,
        `腳本版本：${GM_info.script.version}`,
        `OpenCC 版本：${typeof OpenCC.VERSION !== 'undefined' ? OpenCC.VERSION : '未知'}`,
        '字典大小：8,000+ 字 + 詞組',
        `CDN 來源：jsDelivr`
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
        fontEnabled: CONFIG.font.enabled,
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
        title: '簡轉繁已啟用',
        text: `智慧偵測：${isSimplifiedPage ? '簡體頁面 ✓' : '非簡體頁面'} | 字體：PingFang TC + Microsoft JhengHei`,
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