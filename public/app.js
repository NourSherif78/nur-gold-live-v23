/* =========================================================
   Nur Jewellery — Gold Live · v23 "Nur Bank" controller
   Clean front-end: same socket/API data, same formulas.
   - Pure Harem bullion buying (ZERO margin)
   - Karat formula: usdKg/1000 * purity/995 * usdTry.alis
   ========================================================= */
(function () {
  "use strict";

  // ---------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isDesktop = () => window.innerWidth >= 1024;

  function fmt(n, d = 2) {
    if (n === null || n === undefined || isNaN(n)) return "—";
    return Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function fmtH(n, d = 2) {
    const s = fmt(n, d);
    if (d === 0 || s === "—") return s;
    const i = s.lastIndexOf(".");
    return `${s.slice(0, i)}<span class="dec">${s.slice(i)}</span>`;
  }
  const num = (id) => {
    const el = document.getElementById(id);
    const v = el ? parseFloat(el.value) : 0;
    return isNaN(v) ? 0 : v;
  };
  const store = {
    get(k, def) { try { const v = localStorage.getItem(k); return v === null ? def : v; } catch (e) { return def; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
    json(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const stripEmoji = (s) => String(s || "").replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "").trim();
  const istDate = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
  const istTime = (d = new Date()) => d.toLocaleTimeString("en-GB", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

  function bind(key, value) {
    $$(`[data-bind="${key}"]`).forEach((el) => { el.textContent = value; });
  }

  /** Set a number into an element and flash on change. */
  function setNum(el, value, d, prev, opts = {}) {
    if (typeof el === "string") el = document.getElementById(el);
    if (!el) return;
    const prefix = opts.prefix || "";
    const suffix = opts.suffix || "";
    const body = opts.html === false ? fmt(value, d) : fmtH(value, d);
    el.innerHTML = value === null || value === undefined || isNaN(value) ? "—" : `${prefix}${body}${suffix}`;
    if (prev !== null && prev !== undefined && !isNaN(prev) && Math.abs(value - prev) > 1e-6) {
      el.classList.remove("flash-up", "flash-down");
      void el.offsetWidth;
      el.classList.add(value > prev ? "flash-up" : "flash-down");
    }
  }

  // ---------------------------------------------------------
  // State
  // ---------------------------------------------------------
  const DEFAULT_MARGINS = { b5: 20, b10: 20, b20: 10, b50: 0, b100: 0 };
  let customMargins = Object.assign({}, DEFAULT_MARGINS, store.json("gold_custom_margins", {}));

  const savedCalc = store.json("nur_calc_state", {});
  const S = {
    lang: store.get("gold_lang", "ar") || "ar",
    data: null,
    prev: null,
    page: "prices",
    sound: store.get("gold_sound", "0") === "1",
    c: { mode: "weight", trade: savedCalc.trade === "buy" ? "buy" : "sell", karat: savedCalc.karat || "24", mcur: savedCalc.mcur || "USD", showEur: !!savedCalc.showEur },
    r: { bcur: "TRY", mcur: "USD", karat: "21" },
    x: { mtype: "fixed" },
    bk: { view: "bullions", cur: "TRY" },
    tpl: "try",
    hist: { sym: "gramGold", mode: "satis", range: "1Y" },
    histCache: {},
    lastTick: 0,
    connected: false,
    source: "primary",
    first: true,
    analysis: null,
    last: {}
  };

  // ---------------------------------------------------------
  // Sound
  // ---------------------------------------------------------
  let audioCtx = null;
  function ctx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }
  function tone(freq, gainV, dur) {
    if (!S.sound) return;
    try {
      const c = ctx();
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(freq, c.currentTime);
      g.gain.setValueAtTime(gainV, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      o.connect(g); g.connect(c.destination);
      o.start(); o.stop(c.currentTime + dur + 0.01);
    } catch (e) {}
  }
  const click = () => tone(520, 0.02, 0.05);
  const chime = () => tone(880, 0.04, 0.12);

  // ---------------------------------------------------------
  // Toast
  // ---------------------------------------------------------
  let toastTimer = null;
  function toast(msg) {
    const t = $("#toast");
    $("#toastMsg").textContent = msg;
    t.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("is-on"), 2400);
  }

  function copyText(text, msg) {
    if (!text) return;
    const done = () => toast(msg || t("toastCopied"));
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }
  function fallbackCopy(text, done) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
    done();
  }
  function openWhatsApp(text) {
    if (!text) return;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }

  // ---------------------------------------------------------
  // Theme
  // ---------------------------------------------------------
  const html = document.documentElement;
  function syncThemeUI() {
    const dark = html.classList.contains("dark");
    $$("[data-theme-switch]").forEach((s) => s.classList.toggle("is-on", dark));
    const meta = $("#metaTheme");
    if (meta) meta.setAttribute("content", dark ? "#130A05" : "#F7F3EC");
  }
  function toggleTheme() {
    html.classList.add("theme-anim");
    html.classList.toggle("dark");
    const dark = html.classList.contains("dark");
    store.set("gold_theme", dark ? "dark" : "light");
    syncThemeUI();
    setTimeout(() => html.classList.remove("theme-anim"), 520);
    if (tvLoaded) loadTradingView(true);
    toast(dark ? t("toastDarkOn") : t("toastLightOn"));
  }
  function syncSoundUI() {
    $$("[data-sound-btn]").forEach((b) => {
      b.classList.toggle("is-on", S.sound);
      b.innerHTML = `<svg class="ico"><use href="#${S.sound ? "i-vol" : "i-mute"}"/></svg>`;
    });
    $$("[data-sound-switch]").forEach((s) => s.classList.toggle("is-on", S.sound));
  }
  function toggleSound() {
    S.sound = !S.sound;
    store.set("gold_sound", S.sound ? "1" : "0");
    if (S.sound) { try { ctx(); } catch (e) {} click(); }
    syncSoundUI();
    toast(S.sound ? t("toastSoundOn") : t("toastSoundOff"));
  }

  // ---------------------------------------------------------
  // Internationalization (i18n) - ar (default, RTL), en, tr
  // 100% Pure Language Isolation (Zero mixed words)
  // ---------------------------------------------------------
  const I18N = {
    ar: {
      docTitle: "مجوهرات نور | أسعار الذهب المباشرة",
      brandName: "مجوهرات نور",
      brandSub: "البث المباشر لأسعار الذهب",
      liveConnecting: "جاري الاتصال",
      liveConnected: "مباشر",
      liveDisconnected: "انقطع الاتصال",
      liveOffline: "طوارئ بدون اتصال",
      sourceHarem1: "هارم 1 · مباشر",
      sourceHarem2: "هارم 2 · احتياطي",
      sourceEmergency: "طوارئ · بدون اتصال",
      istanbulTime: "توقيت إسطنبول",
      sourcePrefix: "المصدر: ",
      waitingData: "بانتظار البيانات…",
      updatedNow: "تحديث الآن ⚡",
      updatedSec: "آخر تحديث منذ {s} ث",
      updatedMin: "آخر تحديث منذ {m} د",
      navPrices: "الأسعار",
      navCalc: "الحاسبة",
      navBullions: "السبائك والعيارات",
      tabBullions: "السبائك",
      navIndicators: "المؤشرات",
      navMore: "المزيد",
      langPref: "لغة التطبيق",
      langPrefSub: "العربية (اللغة الافتراضية)",
      langShortAr: "العربية",
      langShortEn: "الإنجليزية",
      langShortTr: "التركية",
      langTitle: "لغة العرض",
      langSub: "اختر لغة واجهة التطبيق المفضلة",
      langOptArName: "العربية",
      langOptArSub: "اللغة الافتراضية",
      langOptEnName: "الإنجليزية",
      langOptEnSub: "واجهة إنجليزية كاملة",
      langOptTrName: "التركية",
      langOptTrSub: "واجهة تركية كاملة",
      curLiraShort: "ليرة",
      gramShort: "جم",
      gramWord: "جرام",
      kiloWord: "كجم",
      ounceWord: "أونصة",
      heroTitle: "جرام الذهب 24 · بيع",
      heroBuyDesc: "سعر الشراء بدون مصنعية",
      heroUsdDesc: "الدولار مقابل الليرة",
      heroOnsDesc: "الأونصة العالمية",
      quickTitle: "اختصارات سريعة",
      mktTitle: "السوق الآن",
      allIndicators: "كل المؤشرات",
      popBullions: "السبائك الأكثر طلباً",
      karatsTitle: "العيارات",
      perGramTl: "للجرام · ليرة",
      editMarginsBtn: "تعديل المصنعيات",
      viewAll: "عرض الكل",
      thKarat: "العيار",
      thBullion: "السبيكة",
      thSellTry: "بيع (ليرة)",
      thBuyTry: "شراء (ليرة)",
      thSellUsd: "بيع $",
      qaCalc: "حاسبة",
      qaBullions: "سبائك",
      qaShare: "مشاركة",
      qaArchive: "أرشيف",
      mGramGold: "جرام الذهب",
      mUsdKg: "كيلو الذهب",
      mUsdTry: "الدولار / ليرة",
      mOns: "الأونصة العالمية",
      mK21: "عيار 21",
      mK18: "عيار 18",
      buyWord: "شراء",
      sellWord: "بيع",
      perGram: "للجرام",
      today: "اليوم",
      pureHaremBuy: "الشراء بدون مصنعية حسب سعر البورصة",
      resetDefaults: "استعادة الافتراضي",
      karatFormulaNote: "سعر العيار = كيلو الدولار ÷ 1000 × (النقاوة ÷ 995) × سعر الدولار",
      calcHeroTitle: "حاسبة الذهب الذكية",
      calcHeroSub: "احسب السعر لحظياً على سعر البورصة",
      modeWeight: "بالوزن",
      modeBudget: "بالميزانية",
      modeCurrency: "العملات",
      tradeSell: "بيع للزبون",
      tradeBuy: "شراء من الزبون",
      grossWeight: "الوزن",
      weightUnitGram: "بالجرام",
      khayasWeight: "الخياس (وزن الفصوص)",
      netWord: "الصافي",
      karatLabel: "العيار",
      marginLabelSell: "المصنعية لكل جرام",
      marginLabelBuy: "قيمة الخصم من سعر الشاشة (لكل جرام)",
      resLabelSell: "الإجمالي للزبون",
      resLabelBuy: "صافي المدفوع للزبون",
      dedLabelSell: "المصنعية الإجمالية",
      dedLabelBuy: "إجمالي المخصوم (خياس + خصم)",
      noDiscount: "بدون خصم",
      rawGold: "خام",
      finalGramPrice: "سعر الجرام النهائي",
      beforeDiscount: "بدون خصم كان",
      rawGoldPrice: "سعر الذهب الخام",
      copyBtn: "نسخ",
      waBtn: "واتساب",
      sendWaBtn: "إرسال واتساب",
      calcActionsCopy: "نسخ التسعيرة",
      calcActionsWa: "إرسال واتساب",
      calcActionsSave: "حفظ",
      appliedUsdRate: "الدولار المعتمد:",
      eurWord: "اليورو",
      showEurBtn: "+ يورو",
      hideEurBtn: "إخفاء اليورو",
      budgetLabel: "الميزانية المتاحة",
      optionalWord: "اختياري",
      youGetGoldWeight: "وزن الذهب الناتج",
      exactWord: "بالضبط:",
      inOtherCurrencies: "بالعملات الأخرى",
      resultingGrams: "عدد الجرامات الناتج",
      pureGoldVal: "قيمة الذهب",
      makingVal: "قيمة المصنعية",
      xAmountLabel: "المبلغ",
      fromToLabel: "من ← إلى",
      fixedAmountWord: "مبلغ",
      xFromLabel: "من",
      xToLabel: "إلى",
      xTotalLabel: "المبلغ بعد التحويل",
      xRawLabel: "سعر البورصة الخام",
      xEffLabel: "السعر بعد الهامش",
      xMarginLabel: "هامش الربح على السعر",
      xMarginTotalLabel: "إجمالي الهامش",
      bullPageTitle: "السبائك والعيارات",
      bullPageSub: "أسعار لحظية — الشراء بدون مصنعية",
      viewBullions: "السبائك المعتمدة",
      viewKarats: "العيارات المتداولة",
      curTry: "ليرة تركية",
      curUsd: "دولار أمريكي",
      makingWord: "المصنعية",
      purityWord: "نقاوة",
      karatUnit: "قيراط",
      indPageTitle: "المؤشرات",
      indPageSub: "قراءة ذكية مبسطة لحركة الذهب",
      aiCompassTitle: "بوصلة السوق الذكية",
      signalStrength: "قوة الإشارة",
      analyzingText: "جاري التحليل…",
      analyzingDesc: "نحلل حركة الأونصة العالمية والدولار وفارق إسطنبول…",
      proBtn: "التحليل الاحترافي",
      indDisclaimer: "التحليل استرشادي مبني على معادلات فنية لحظية وليس نصيحة استثمارية مضمونة. اضغط على أي بطاقة لفتح الأرشيف التاريخي.",
      momentumLabel: "الزخم",
      spreadLabel: "فارق إسطنبول",
      supportLabel: "أقرب دعم",
      morePageTitle: "المزيد",
      morePageSub: "المشاركة، التسعيرات المحفوظة والإعدادات",
      waTemplatesTitle: "رسائل الواتساب الجاهزة",
      tplTryBtn: "سبائك بالليرة",
      tplUsdBtn: "سبائك بالدولار",
      tplKaratsBtn: "العيارات",
      tplAllBtn: "تقرير كامل",
      loadingPrices: "جاري تحميل الأسعار…",
      savedQuotesTitle: "التسعيرات المحفوظة",
      clearAll: "مسح الكل",
      darkTitle: "الوضع الليلي",
      darkSub: "مريح للعين في الإضاءة الخافتة",
      soundTitle: "صوت تغيّر السعر",
      soundSub: "نغمة خفيفة مع كل تحديث",
      installTitle: "تثبيت التطبيق",
      installSub: "أيقونة على الشاشة الرئيسية للموبايل",
      guestTitle: "شاشة الضيف",
      guestSub: "عرض الأسعار للزبائن على شاشة المحل",
      adminTitle: "لوحة التحكم",
      adminSub: "للمسؤول فقط — محمية برمز سري",
      connStatusTitle: "حالة الاتصال",
      connSource: "المصدر الحالي",
      connLast: "آخر تحديث",
      connSeq: "رقم التحديث",
      footMeta: "مجوهرات نور — البث المباشر للذهب · الأسعار من بورصة هارم",
      shareSheetTitle: "مشاركة الأسعار",
      shareSheetSub: "اختر الرسالة وأرسلها مباشرة",
      histSub: "أسعار سابقة ومقارنة بالسعر الحالي",
      priceNow: "السعر الآن",
      priceThen: "السعر يومها",
      diffWord: "الفرق",
      range1Y: "سنة",
      range3Y: "3 سنين",
      range5Y: "5 سنين",
      rangeAll: "الكل",
      lowWord: "أقل",
      highWord: "أعلى",
      pickDateLabel: "اختر يوماً",
      ago7d: "من أسبوع",
      ago30d: "من شهر",
      ago6m: "من 6 شهور",
      ago1y: "من سنة",
      ago5y: "من 5 سنين",
      howMuchWasIt: "كم كانت قيمته؟",
      valThen: "قيمتها يومها",
      valNow: "قيمتها الآن",
      profitLoss: "الربح / الخسارة",
      proSheetSub: "البورصة العالمية للأونصة وفارق إسطنبول",
      proOnsLabel: "أونصة لندن الفورية",
      proOnsSub: "$ / أونصة",
      proGlobalKiloLabel: "الكيلو العالمي",
      proGlobalKiloSub: "محسوب من الأونصة",
      proLocalKiloLabel: "كيلو البورصة المحلي",
      proLocalKiloSub: "دولار / كجم",
      proRangeLabel: "المدى اليومي المقدّر",
      proRangeSub: "أقل — أعلى",
      proSpreadTitle: "فارق بورصة إسطنبول",
      perKiloUsd: "$ / كجم",
      proRsiTitle: "مؤشر القوة النسبية",
      oversold0: "0 · تشبع بيعي",
      overbought100: "تشبع شرائي · 100",
      pivotsTitle: "مستويات الدعم والمقاومة اليوم",
      pivotsSub: "نقاط الارتكاز · $",
      liveChartTitle: "شارت البورصة العالمية المباشر",
      liveChartSub: "حركة الأونصة مقابل الدولار",
      loadingChart: "جاري تحميل الشارت…",
      guideTitle: "دليل البورصة العالمية للذهب",
      guideSub: "من الصفر للاحتراف",
      proDisclaimer: "كل المؤشرات استرشادية ومحسوبة لحظياً من بيانات السوق والبورصة العالمية — القرار النهائي دائماً لك.",
      marginSheetTitle: "مصنعية السبيكة",
      marginSheetSub: "تضاف على سعر البيع لكل جرام (بالليرة)",
      perGramTlUnit: "ليرة/جم",
      saveMarginBtn: "حفظ المصنعية",
      saveQuoteTitle: "حفظ التسعيرة",
      saveQuoteSub: "ستجدها في \"المزيد\" ويمكنك الرجوع إليها في أي وقت",
      quoteNamePh: "اسم التسعيرة (مثلاً: أستاذ محمد)",
      adminSheetSub: "إدارة المصدر والمصنعيات والأمان",
      loginBtn: "دخول",
      srvStatusTitle: "حالة السيرفرات",
      pingBtn: "فحص السرعة",
      harem1Primary: "المصدر 1 (الأساسي)",
      harem2Backup: "المصدر 2 (الاحتياطي)",
      activeSourceLabel: "المصدر النشط",
      connectedClientsLabel: "المتصلين الآن",
      uptimeLabel: "مدة التشغيل",
      dataRouteTitle: "مسار البيانات",
      srcAuto: "تلقائي",
      srcAutoSub: "تحويل ذكي",
      srcPrimaryName: "المصدر 1",
      srcBackupName: "المصدر 2",
      srcForced: "إجباري",
      srcEmergency: "طوارئ",
      srcOffline: "بدون اتصال",
      srvDefaultMargins: "مصنعيات السيرفر الافتراضية",
      perGramTlShort: "ليرة / جرام",
      w5g: "5 جم",
      w10g: "10 جم",
      w20g: "20 جم",
      w50g: "50 جم",
      w100g: "100 جم",
      savePublishMargins: "حفظ ونشر لكل الأجهزة",
      guestAdminNote: "عند تفعيلها ستظهر في \"المزيد\" لتتمكن من عرض الأسعار للزبائن على شاشة المحل.",
      openGuestNow: "افتح شاشة الضيف الآن",
      changePinTitle: "تغيير الرمز السري",
      newPinPh: "الرمز الجديد (4 أرقام على الأقل)",
      updateBtn: "تحديث",
      logoutBtn: "تسجيل الخروج",
      exitGuestTitle: "الخروج من شاشة الضيف",
      exitGuestSub: "أدخل الرمز السري للرجوع للوحة التاجر",
      clearWord: "مسح",
      confirmWord: "تأكيد",
      iosInstallTitle: "تثبيت التطبيق على آيفون",
      iosInstallSub: "خطوتان فقط",
      iosStep1Title: "اضغط زر المشاركة",
      iosStep1Sub: "أيقونة المربع الذي يخرج منه سهم للأعلى في المتصفح",
      iosStep2Title: "اختر \"إضافة إلى الشاشة الرئيسية\"",
      iosStep2Sub: "سيظهر التطبيق فوراً على شاشة هاتفك",
      iosDirectProfile: "أو تنزيل ملف التثبيت المباشر",
      toastCopied: "تم النسخ ✓",
      toastMsgCopied: "تم نسخ الرسالة 📋",
      toastQuoteCopied: "تم نسخ التسعيرة 📋",
      toastLangSwitched: "تم تغيير اللغة إلى العربية 🇸🇦",
      toastDarkOn: "تم تفعيل الوضع الليلي 🌙",
      toastLightOn: "تم تفعيل الوضع النهاري ☀️",
      toastSoundOn: "تم تفعيل صوت تغيّر السعر 🔔",
      toastSoundOff: "تم كتم الصوت 🔕",
      toastWaitPrices: "انتظر تحميل الأسعار أولاً",
      toastQuoteSaved: "تم حفظ التسعيرة في المزيد 💾",
      toastQuoteDeleted: "تم حذف التسعيرة 🗑️",
      toastQuotesCleared: "تم مسح كل التسعيرات",
      confirmClearQuotes: "هل أنت متأكد من مسح كل التسعيرات المحفوظة؟",
      toastMarginReset: "تمت استعادة المصنعيات الافتراضية 🔄",
      toastGuestHint: "شاشة الضيف — اضغط الشعار 3 مرات للخروج",
      toastWelcomeBack: "أهلاً بك مجدداً في لوحة التاجر 🔓",
      toastAdminOpen: "تم فتح لوحة التحكم 🛡️",
      toastLogout: "تم تسجيل الخروج",
      toastAlreadyInstalled: "التطبيق مثبت بالفعل ✓",
      toastInstalling: "جاري تثبيت التطبيق 📲",
      toastInstallBrowserHint: "من قائمة المتصفح (⋮) اختر \"تثبيت التطبيق\" أو \"إضافة للشاشة الرئيسية\"",
      toastPinMin4: "الرمز السري يجب أن يكون 4 أرقام على الأقل",
      toastPinUpdated: "تم تحديث الرمز السري 🔒",
      toastMarginsPublished: "تم حفظ ونشر مصنعيات السيرفر 🚀",
      toastGuestVisibleOn: "شاشة الضيف ظاهرة في المزيد 👁️",
      toastGuestVisibleOff: "تم إخفاء شاشة الضيف 🔒",
      errEnterPin: "أدخل الرمز السري",
      errWrongPin: "الرمز السري غير صحيح",
      errServerConn: "خطأ في الاتصال بالسيرفر",
      errReqFailed: "تعذر تنفيذ الطلب",
      guestHeadTitle: "شاشة الضيف",
      guestKaratsHead: "أسعار العيارات للجرام",
      guestBullionsHead: "أسعار السبائك",
      emptyQuotesHtml: "لا توجد تسعيرات محفوظة حتى الآن.<br>من الحاسبة اضغط زر الحفظ <svg class=\"ico xs\" style=\"vertical-align:middle\"><use href=\"#i-save\"/></svg> لحفظ أي تسعيرة باسم الزبون.",
      restoreBtn: "استرجاع",
      deleteBtn: "حذف",
      tagByWeight: "بالوزن",
      tagByBudget: "ميزانية"
    },
    en: {
      docTitle: "Nur Jewellery | Live Gold Prices",
      brandName: "Nur Jewellery",
      brandSub: "Nur Jewellery · Gold Live",
      liveConnecting: "Connecting…",
      liveConnected: "Live",
      liveDisconnected: "Disconnected",
      liveOffline: "Emergency Offline",
      sourceHarem1: "Harem 1 · Live",
      sourceHarem2: "Harem 2 · Backup",
      sourceEmergency: "Emergency · Offline",
      istanbulTime: "Istanbul Time",
      sourcePrefix: "Source: ",
      waitingData: "Waiting for data…",
      updatedNow: "Updated now ⚡",
      updatedSec: "Updated {s}s ago",
      updatedMin: "Updated {m}m ago",
      navPrices: "Prices",
      navCalc: "Calculator",
      navBullions: "Bullions & Karats",
      tabBullions: "Bullions",
      navIndicators: "Indicators",
      navMore: "More",
      langPref: "App Language",
      langPrefSub: "English (Active)",
      langShortAr: "Arabic",
      langShortEn: "English",
      langShortTr: "Turkish",
      langTitle: "Interface Language",
      langSub: "Choose your preferred interface language",
      langOptArName: "Arabic",
      langOptArSub: "Default language",
      langOptEnName: "English",
      langOptEnSub: "Full English interface",
      langOptTrName: "Turkish",
      langOptTrSub: "Full Turkish interface",
      curLiraShort: "TRY",
      gramShort: "g",
      gramWord: "Grams",
      kiloWord: "kg",
      ounceWord: "oz",
      heroTitle: "Gram Gold 24K · Sell",
      heroBuyDesc: "Buying price (Zero margin)",
      heroUsdDesc: "USD to Turkish Lira",
      heroOnsDesc: "Global Gold Ounce",
      quickTitle: "Quick Actions",
      mktTitle: "Market Now",
      allIndicators: "All Indicators",
      popBullions: "Popular Bullions",
      karatsTitle: "Karats",
      perGramTl: "Per Gram · TRY",
      editMarginsBtn: "Edit Margins",
      viewAll: "View all",
      thKarat: "Karat",
      thBullion: "Bullion",
      thSellTry: "Sell (TRY)",
      thBuyTry: "Buy (TRY)",
      thSellUsd: "Sell $",
      qaCalc: "Calculator",
      qaBullions: "Bullions",
      qaShare: "Share",
      qaArchive: "Archive",
      mGramGold: "Gram Gold",
      mUsdKg: "Gold Kilo",
      mUsdTry: "USD / TRY",
      mOns: "Global Ounce",
      mK21: "21K Gold",
      mK18: "18K Gold",
      buyWord: "Buy",
      sellWord: "Sell",
      perGram: "/ gram",
      today: "today",
      pureHaremBuy: "Zero margin buying at live market rate",
      resetDefaults: "Reset Defaults",
      karatFormulaNote: "Karat Rate = USD Kilo ÷ 1000 × (Purity ÷ 995) × USD/TRY Rate",
      calcHeroTitle: "Smart Gold Calculator",
      calcHeroSub: "Calculate live prices instantly from market feed",
      modeWeight: "By Weight",
      modeBudget: "By Budget",
      modeCurrency: "Currency",
      tradeSell: "Sell to Customer",
      tradeBuy: "Buy from Customer",
      grossWeight: "Gross Weight",
      weightUnitGram: "in grams",
      khayasWeight: "Stones / Deduction",
      netWord: "Net",
      karatLabel: "Karat",
      marginLabelSell: "Making fee per gram",
      marginLabelBuy: "Discount per gram below screen",
      resLabelSell: "Total for Customer",
      resLabelBuy: "Net Paid to Customer",
      dedLabelSell: "Total Making Fee",
      dedLabelBuy: "Total Deduction (Stones + Discount)",
      noDiscount: "No discount",
      rawGold: "Raw Gold",
      finalGramPrice: "Final Price per Gram",
      beforeDiscount: "Before Discount",
      rawGoldPrice: "Raw Gold Value",
      copyBtn: "Copy",
      waBtn: "WhatsApp",
      sendWaBtn: "Send via WhatsApp",
      calcActionsCopy: "Copy Quote",
      calcActionsWa: "WhatsApp",
      calcActionsSave: "Save",
      appliedUsdRate: "Applied USD Rate:",
      eurWord: "EUR",
      showEurBtn: "+ EUR",
      hideEurBtn: "Hide EUR",
      budgetLabel: "Available Budget",
      optionalWord: "optional",
      youGetGoldWeight: "Resulting Gold Weight",
      exactWord: "Exact:",
      inOtherCurrencies: "In Other Currencies",
      resultingGrams: "Resulting Grams",
      pureGoldVal: "Pure Gold Value",
      makingVal: "Making Fee Value",
      xAmountLabel: "Amount",
      fromToLabel: "From → To",
      fixedAmountWord: "Fixed",
      xFromLabel: "From",
      xToLabel: "To",
      xTotalLabel: "Converted Total",
      xRawLabel: "Raw Market Rate",
      xEffLabel: "Rate After Margin",
      xMarginLabel: "Exchange Margin",
      xMarginTotalLabel: "Total Margin",
      bullPageTitle: "Bullions & Karats",
      bullPageSub: "Live rates — Zero margin buying",
      viewBullions: "Certified Bullions",
      viewKarats: "Traded Karats",
      curTry: "Turkish Lira",
      curUsd: "US Dollar",
      makingWord: "Making fee",
      purityWord: "Purity",
      karatUnit: "Karat",
      indPageTitle: "Indicators",
      indPageSub: "Smart simplified reading of gold market movements",
      aiCompassTitle: "Smart Market Compass",
      signalStrength: "Signal Strength",
      analyzingText: "Analyzing…",
      analyzingDesc: "Analyzing global ounce action, USD/TRY, and Istanbul spread…",
      proBtn: "Pro Analysis",
      indDisclaimer: "This analysis is indicative and based on real-time technical formulas, not financial advice. Tap any card to view historical archive.",
      momentumLabel: "Momentum",
      spreadLabel: "Istanbul Spread",
      supportLabel: "Nearest Support",
      morePageTitle: "More",
      morePageSub: "Sharing, saved quotes & settings",
      waTemplatesTitle: "WhatsApp Templates",
      tplTryBtn: "Bullions (TRY)",
      tplUsdBtn: "Bullions (USD)",
      tplKaratsBtn: "Karats",
      tplAllBtn: "Full Report",
      loadingPrices: "Loading live prices…",
      savedQuotesTitle: "Saved Quotes",
      clearAll: "Clear All",
      darkTitle: "Dark Mode",
      darkSub: "Easy on eyes in low light",
      soundTitle: "Price Alert Sound",
      soundSub: "Subtle chime on each update",
      installTitle: "Install App",
      installSub: "Add icon to mobile home screen",
      guestTitle: "Guest Screen",
      guestSub: "Display live prices on shop screen",
      adminTitle: "Admin Panel",
      adminSub: "Owner only — PIN protected",
      connStatusTitle: "Connection Status",
      connSource: "Current Source",
      connLast: "Last Update",
      connSeq: "Sequence #",
      footMeta: "Nur Jewellery — Gold Live · Powered by Harem Altın",
      shareSheetTitle: "Share Live Prices",
      shareSheetSub: "Choose a template and share directly",
      histSub: "Historical rates compared with live price",
      priceNow: "Current Price",
      priceThen: "Price on Date",
      diffWord: "Difference",
      range1Y: "1 Year",
      range3Y: "3 Years",
      range5Y: "5 Years",
      rangeAll: "All",
      lowWord: "Low",
      highWord: "High",
      pickDateLabel: "Select a Date",
      ago7d: "1 Week Ago",
      ago30d: "1 Month Ago",
      ago6m: "6 Months Ago",
      ago1y: "1 Year Ago",
      ago5y: "5 Years Ago",
      howMuchWasIt: "How much was it worth?",
      valThen: "Value Then",
      valNow: "Value Now",
      profitLoss: "Profit / Loss",
      proSheetSub: "Global Ounce Exchange & Istanbul Spread",
      proOnsLabel: "London Spot Ounce",
      proOnsSub: "$ / oz",
      proGlobalKiloLabel: "Global Gold Kilo",
      proGlobalKiloSub: "Implied from Spot Ounce",
      proLocalKiloLabel: "Local Exchange Kilo",
      proLocalKiloSub: "USD / kg",
      proRangeLabel: "Est. Daily Range",
      proRangeSub: "Low — High",
      proSpreadTitle: "Istanbul Exchange Spread",
      perKiloUsd: "$ / kg",
      proRsiTitle: "Relative Strength Index (RSI)",
      oversold0: "0 · Oversold",
      overbought100: "Overbought · 100",
      pivotsTitle: "Today's Support & Resistance Levels",
      pivotsSub: "Pivot Points · $",
      liveChartTitle: "Live Global Gold Chart",
      liveChartSub: "Spot Gold Ounce vs US Dollar",
      loadingChart: "Loading chart…",
      guideTitle: "Global Gold Market Guide",
      guideSub: "From Zero to Pro",
      proDisclaimer: "All indicators are calculated in real time from market data for guidance only — the final decision is always yours.",
      marginSheetTitle: "Bullion Making Fee",
      marginSheetSub: "Added to selling price per gram (in TRY)",
      perGramTlUnit: "TRY/g",
      saveMarginBtn: "Save Making Fee",
      saveQuoteTitle: "Save Quote",
      saveQuoteSub: "Find it anytime under the 'More' tab",
      quoteNamePh: "Quote name (e.g. Mr. John)",
      adminSheetSub: "Manage data feed, margins & security",
      loginBtn: "Sign In",
      srvStatusTitle: "Server Status",
      pingBtn: "Speed Test",
      harem1Primary: "Source 1 (Primary)",
      harem2Backup: "Source 2 (Backup)",
      activeSourceLabel: "Active Source",
      connectedClientsLabel: "Connected Clients",
      uptimeLabel: "Server Uptime",
      dataRouteTitle: "Data Routing Mode",
      srcAuto: "Automatic",
      srcAutoSub: "Smart failover",
      srcPrimaryName: "Source 1",
      srcBackupName: "Source 2",
      srcForced: "Forced",
      srcEmergency: "Emergency",
      srcOffline: "Offline",
      srvDefaultMargins: "Default Server Margins",
      perGramTlShort: "TRY / gram",
      w5g: "5g",
      w10g: "10g",
      w20g: "20g",
      w50g: "50g",
      w100g: "100g",
      savePublishMargins: "Save & Publish to All Devices",
      guestAdminNote: "When enabled, 'Guest Screen' appears in the More tab to display prices on your shop TV.",
      openGuestNow: "Open Guest Screen Now",
      changePinTitle: "Change Admin PIN",
      newPinPh: "New PIN (at least 4 digits)",
      updateBtn: "Update",
      logoutBtn: "Sign Out",
      exitGuestTitle: "Exit Guest Screen",
      exitGuestSub: "Enter admin PIN to return to dealer dashboard",
      clearWord: "Clear",
      confirmWord: "Confirm",
      iosInstallTitle: "Install App on iPhone",
      iosInstallSub: "Just two quick steps",
      iosStep1Title: "Tap the Share button",
      iosStep1Sub: "The square icon with an upward arrow in Safari",
      iosStep2Title: "Select 'Add to Home Screen'",
      iosStep2Sub: "The app icon will appear immediately on your home screen",
      iosDirectProfile: "Or download direct configuration profile",
      toastCopied: "Copied to clipboard ✓",
      toastMsgCopied: "Message copied 📋",
      toastQuoteCopied: "Quote copied 📋",
      toastLangSwitched: "Language changed to English 🇬🇧",
      toastDarkOn: "Dark mode enabled 🌙",
      toastLightOn: "Light mode enabled ☀️",
      toastSoundOn: "Price alert sound enabled 🔔",
      toastSoundOff: "Sound muted 🔕",
      toastWaitPrices: "Please wait for prices to load first",
      toastQuoteSaved: "Quote saved in More tab 💾",
      toastQuoteDeleted: "Quote deleted 🗑️",
      toastQuotesCleared: "All saved quotes cleared",
      confirmClearQuotes: "Are you sure you want to delete all saved quotes?",
      toastMarginReset: "Default making fees restored 🔄",
      toastGuestHint: "Guest Screen — Tap the logo 3 times to exit",
      toastWelcomeBack: "Welcome back to Dealer Dashboard 🔓",
      toastAdminOpen: "Admin panel unlocked 🛡️",
      toastLogout: "Signed out successfully",
      toastAlreadyInstalled: "App is already installed ✓",
      toastInstalling: "Installing application 📲",
      toastInstallBrowserHint: "From browser menu (⋮), select 'Install App' or 'Add to Home Screen'",
      toastPinMin4: "PIN must be at least 4 characters",
      toastPinUpdated: "Admin PIN updated 🔒",
      toastMarginsPublished: "Server margins saved & published 🚀",
      toastGuestVisibleOn: "Guest Screen is now visible in More 👁️",
      toastGuestVisibleOff: "Guest Screen hidden from More 🔒",
      errEnterPin: "Please enter PIN",
      errWrongPin: "Incorrect PIN",
      errServerConn: "Server connection error",
      errReqFailed: "Request failed",
      guestHeadTitle: "Guest Screen",
      guestKaratsHead: "Karat Rates per Gram",
      guestBullionsHead: "Bullion Rates",
      emptyQuotesHtml: "No saved quotes yet.<br>In the calculator, tap the Save button <svg class=\"ico xs\" style=\"vertical-align:middle\"><use href=\"#i-save\"/></svg> to save any quote under a customer's name.",
      restoreBtn: "Restore",
      deleteBtn: "Delete",
      tagByWeight: "Weight",
      tagByBudget: "Budget"
    },
    tr: {
      docTitle: "Nur Kuyumculuk | Canlı Altın Fiyatları",
      brandName: "Nur Kuyumculuk",
      brandSub: "Nur Kuyumculuk · Canlı Altın",
      liveConnecting: "Bağlanıyor…",
      liveConnected: "Canlı",
      liveDisconnected: "Bağlantı Kesildi",
      liveOffline: "Acil Çevrimdışı",
      sourceHarem1: "Harem 1 · Canlı",
      sourceHarem2: "Harem 2 · Yedek",
      sourceEmergency: "Acil Durum · Çevrimdışı",
      istanbulTime: "İstanbul Saati",
      sourcePrefix: "Kaynak: ",
      waitingData: "Veri bekleniyor…",
      updatedNow: "Şimdi güncellendi ⚡",
      updatedSec: "{s} sn önce güncellendi",
      updatedMin: "{m} dk önce güncellendi",
      navPrices: "Fiyatlar",
      navCalc: "Hesaplama",
      navBullions: "Külçe & Ayarlar",
      tabBullions: "Külçeler",
      navIndicators: "Göstergeler",
      navMore: "Daha Fazla",
      langPref: "Uygulama Dili",
      langPrefSub: "Türkçe (Aktif)",
      langShortAr: "Arapça",
      langShortEn: "İngilizce",
      langShortTr: "Türkçe",
      langTitle: "Görünüm Dili",
      langSub: "Tercih ettiğiniz arayüz dilini seçin",
      langOptArName: "Arapça",
      langOptArSub: "Varsayılan dil",
      langOptEnName: "İngilizce",
      langOptEnSub: "Tam İngilizce arayüz",
      langOptTrName: "Türkçe",
      langOptTrSub: "Tam Türkçe arayüz",
      curLiraShort: "TL",
      gramShort: "gr",
      gramWord: "Gram",
      kiloWord: "kg",
      ounceWord: "ons",
      heroTitle: "Gram Altın 24 Ayar · Satış",
      heroBuyDesc: "İşçiliksiz Alış Fiyatı",
      heroUsdDesc: "Dolar / Türk Lirası",
      heroOnsDesc: "Küresel Ons Altın",
      quickTitle: "Hızlı İşlemler",
      mktTitle: "Anlık Piyasa",
      allIndicators: "Tüm Göstergeler",
      popBullions: "Popüler Külçeler",
      karatsTitle: "Ayarlar",
      perGramTl: "Gram Başı · TL",
      editMarginsBtn: "İşçilikleri Düzenle",
      viewAll: "Tümünü gör",
      thKarat: "Ayar",
      thBullion: "Külçe",
      thSellTry: "Satış (TL)",
      thBuyTry: "Alış (TL)",
      thSellUsd: "Satış $",
      qaCalc: "Hesapla",
      qaBullions: "Külçeler",
      qaShare: "Paylaş",
      qaArchive: "Arşiv",
      mGramGold: "Gram Altın",
      mUsdKg: "Kilo Altın",
      mUsdTry: "Dolar / TL",
      mOns: "Ons Altın",
      mK21: "21 Ayar Altın",
      mK18: "18 Ayar Altın",
      buyWord: "Alış",
      sellWord: "Satış",
      perGram: "gram başı",
      today: "bugün",
      pureHaremBuy: "Borsa fiyatından sıfır işçilikle alış",
      resetDefaults: "Varsayılana Dön",
      karatFormulaNote: "Ayar Fiyatı = Dolar Kilo ÷ 1000 × (Milyem ÷ 995) × Dolar Kuru",
      calcHeroTitle: "Akıllı Altın Hesaplayıcı",
      calcHeroSub: "Anlık borsa fiyatlarıyla saniyeler içinde hesaplayın",
      modeWeight: "Ağırlıkla",
      modeBudget: "Bütçeyle",
      modeCurrency: "Döviz",
      tradeSell: "Müşteriye Satış",
      tradeBuy: "Müşteriden Alış",
      grossWeight: "Toplam Ağırlık",
      weightUnitGram: "gram cinsinden",
      khayasWeight: "Taş / Fire Düşüşü",
      netWord: "Net",
      karatLabel: "Ayar",
      marginLabelSell: "Gram başına işçilik",
      marginLabelBuy: "Ekran altı düşülecek tutar (gr)",
      resLabelSell: "Müşteri Toplamı",
      resLabelBuy: "Müşteriye Ödenecek Net",
      dedLabelSell: "Toplam İşçilik",
      dedLabelBuy: "Toplam Kesinti (Taş + İskonto)",
      noDiscount: "İndirimsiz",
      rawGold: "Has / Ham",
      finalGramPrice: "Birim Gram Fiyatı",
      beforeDiscount: "İndirimsiz Tutar",
      rawGoldPrice: "Ham Altın Değeri",
      copyBtn: "Kopyala",
      waBtn: "WhatsApp",
      sendWaBtn: "WhatsApp ile Gönder",
      calcActionsCopy: "Fiyatı Kopyala",
      calcActionsWa: "WhatsApp",
      calcActionsSave: "Kaydet",
      appliedUsdRate: "Baz Alınan Dolar Kuru:",
      eurWord: "Euro",
      showEurBtn: "+ EUR",
      hideEurBtn: "EUR Gizle",
      budgetLabel: "Mevcut Bütçe",
      optionalWord: "isteğe bağlı",
      youGetGoldWeight: "Alınabilecek Altın Ağırlığı",
      exactWord: "Tam:",
      inOtherCurrencies: "Diğer Para Birimlerinde",
      resultingGrams: "Çıkan Gram Miktarı",
      pureGoldVal: "Saf Altın Değeri",
      makingVal: "İşçilik Değeri",
      xAmountLabel: "Tutar",
      fromToLabel: "Nereden → Nereye",
      fixedAmountWord: "Tutar",
      xFromLabel: "Nereden",
      xToLabel: "Nereye",
      xTotalLabel: "Çevrilen Toplam Tutar",
      xRawLabel: "Ham Borsa Kuru",
      xEffLabel: "Marj Sonrası Kur",
      xMarginLabel: "Kur Kar Marjı",
      xMarginTotalLabel: "Toplam Marj",
      bullPageTitle: "Külçe & Ayarlar",
      bullPageSub: "Anlık fiyatlar — Sıfır işçilikle alış",
      viewBullions: "Sertifikalı Külçeler",
      viewKarats: "İşlem Gören Ayarlar",
      curTry: "Türk Lirası",
      curUsd: "ABD Doları",
      makingWord: "İşçilik",
      purityWord: "Milyem",
      karatUnit: "Ayar",
      indPageTitle: "Göstergeler",
      indPageSub: "Altın piyasası hareketlerinin akıllı teknik özeti",
      aiCompassTitle: "Akıllı Piyasa Pusulası",
      signalStrength: "Sinyal Gücü",
      analyzingText: "Analiz ediliyor…",
      analyzingDesc: "Küresel ons, Dolar/TL ve İstanbul makası analiz ediliyor…",
      proBtn: "Profesyonel Analiz",
      indDisclaimer: "Bu analiz anlık teknik formüllere dayalı bir rehberdir, kesin yatırım tavsiyesi değildir. Geçmiş arşivi açmak için herhangi bir karta dokunun.",
      momentumLabel: "Momentum",
      spreadLabel: "İstanbul Farkı",
      supportLabel: "En Yakın Destek",
      morePageTitle: "Daha Fazla",
      morePageSub: "Paylaşım, kayıtlı fiyatlar ve ayarlar",
      waTemplatesTitle: "Hazır WhatsApp Mesajları",
      tplTryBtn: "TL Külçeler",
      tplUsdBtn: "USD Külçeler",
      tplKaratsBtn: "Ayarlar",
      tplAllBtn: "Tam Rapor",
      loadingPrices: "Fiyatlar yükleniyor…",
      savedQuotesTitle: "Kaydedilen Fiyatlar",
      clearAll: "Tümünü Temizle",
      darkTitle: "Karanlık Mod",
      darkSub: "Düşük ışıkta gözü yormaz",
      soundTitle: "Fiyat Değişim Sesi",
      soundSub: "Her güncellemede hafif bildirim sesi",
      installTitle: "Uygulamayı Yükle",
      installSub: "Telefonun ana ekranına kısayol ekle",
      guestTitle: "Müşteri Ekranı",
      guestSub: "Mağaza ekranında müşterilere fiyatları göster",
      adminTitle: "Yönetici Paneli",
      adminSub: "Sadece yönetici — Şifre korumalı",
      connStatusTitle: "Bağlantı Durumu",
      connSource: "Aktif Kaynak",
      connLast: "Son Güncelleme",
      connSeq: "Güncelleme No",
      footMeta: "Nur Kuyumculuk — Canlı Altın Yayını · Harem Altın Verileri",
      shareSheetTitle: "Fiyatları Paylaş",
      shareSheetSub: "Şablonu seçin ve doğrudan gönderin",
      histSub: "Geçmiş fiyatlar ve güncel fiyat karşılaştırması",
      priceNow: "Şu Anki Fiyat",
      priceThen: "O Günki Fiyat",
      diffWord: "Fark",
      range1Y: "1 Yıl",
      range3Y: "3 Yıl",
      range5Y: "5 Yıl",
      rangeAll: "Tümü",
      lowWord: "En Düşük",
      highWord: "En Yüksek",
      pickDateLabel: "Bir Gün Seçin",
      ago7d: "1 Hafta Önce",
      ago30d: "1 Ay Önce",
      ago6m: "6 Ay Önce",
      ago1y: "1 Yıl Önce",
      ago5y: "5 Yıl Önce",
      howMuchWasIt: "Değeri Ne Kadardı?",
      valThen: "O Günki Değeri",
      valNow: "Bugünkü Değeri",
      profitLoss: "Kâr / Zarar",
      proSheetSub: "Küresel Ons Borsası ve İstanbul Makası",
      proOnsLabel: "Londra Spot Ons",
      proOnsSub: "$ / ons",
      proGlobalKiloLabel: "Küresel Kilo Altın",
      proGlobalKiloSub: "Spot onstan hesaplanan",
      proLocalKiloLabel: "Yerel Borsa Kilosu",
      proLocalKiloSub: "Dolar / kg",
      proRangeLabel: "Tahmini Günlük Aralık",
      proRangeSub: "Düşük — Yüksek",
      proSpreadTitle: "İstanbul Borsa Farkı",
      perKiloUsd: "$ / kg",
      proRsiTitle: "Göreceli Güç Endeksi (RSI)",
      oversold0: "0 · Aşırı Satım",
      overbought100: "Aşırı Alım · 100",
      pivotsTitle: "Bugünkü Destek ve Direnç Seviyeleri",
      pivotsSub: "Pivot Noktaları · $",
      liveChartTitle: "Canlı Küresel Altın Grafiği",
      liveChartSub: "Spot Ons Altın / ABD Doları",
      loadingChart: "Grafik yükleniyor…",
      guideTitle: "Küresel Altın Borsası Rehberi",
      guideSub: "Sıfırdan Uzmanlığa",
      proDisclaimer: "Tüm göstergeler piyasa verilerinden anlık olarak bilgilendirme amacıyla hesaplanır — son karar her zaman sizindir.",
      marginSheetTitle: "Külçe İşçiliği",
      marginSheetSub: "Gram başına satış fiyatına eklenir (TL)",
      perGramTlUnit: "TL/gr",
      saveMarginBtn: "İşçiliği Kaydet",
      saveQuoteTitle: "Fiyatı Kaydet",
      saveQuoteSub: "Daha Fazla sekmesinden istediğiniz zaman ulaşabilirsiniz",
      quoteNamePh: "Kayıt adı (Örn: Ahmet Bey)",
      adminSheetSub: "Veri kaynağı, işçilik ve güvenlik yönetimi",
      loginBtn: "Giriş Yap",
      srvStatusTitle: "Sunucu Durumu",
      pingBtn: "Hız Testi",
      harem1Primary: "Kaynak 1 (Birincil)",
      harem2Backup: "Kaynak 2 (Yedek)",
      activeSourceLabel: "Aktif Kaynak",
      connectedClientsLabel: "Bağlı Cihazlar",
      uptimeLabel: "Çalışma Süresi",
      dataRouteTitle: "Veri Akış Yolu",
      srcAuto: "Otomatik",
      srcAutoSub: "Akıllı geçiş",
      srcPrimaryName: "Kaynak 1",
      srcBackupName: "Kaynak 2",
      srcForced: "Zorunlu",
      srcEmergency: "Acil Durum",
      srcOffline: "Çevrimdışı",
      srvDefaultMargins: "Varsayılan Sunucu İşçilikleri",
      perGramTlShort: "TL / gram",
      w5g: "5 gr",
      w10g: "10 gr",
      w20g: "20 gr",
      w50g: "50 gr",
      w100g: "100 gr",
      savePublishMargins: "Kaydet ve Tüm Cihazlarda Yayınla",
      guestAdminNote: "Etkinleştirildiğinde, mağaza ekranında fiyatları göstermek için Daha Fazla sekmesinde görünür.",
      openGuestNow: "Müşteri Ekranını Şimdi Aç",
      changePinTitle: "Yönetici Şifresini Değiştir",
      newPinPh: "Yeni şifre (en az 4 haneli)",
      updateBtn: "Güncelle",
      logoutBtn: "Çıkış Yap",
      exitGuestTitle: "Müşteri Ekranından Çıkış",
      exitGuestSub: "Yönetici ekranına dönmek için şifreyi girin",
      clearWord: "Temizle",
      confirmWord: "Onayla",
      iosInstallTitle: "iPhone'a Uygulamayı Yükle",
      iosInstallSub: "Sadece iki kolay adım",
      iosStep1Title: "Paylaş düğmesine dokunun",
      iosStep1Sub: "Tarayıcıdaki yukarı ok bulunan kare simgesi",
      iosStep2Title: "'Ana Ekrana Ekle'yi seçin",
      iosStep2Sub: "Uygulama anında telefonunuzun ana ekranında görünecektir",
      iosDirectProfile: "Veya doğrudan kurulum profilini indirin",
      toastCopied: "Panoya kopyalandı ✓",
      toastMsgCopied: "Mesaj kopyalandı 📋",
      toastQuoteCopied: "Fiyat kopyalandı 📋",
      toastLangSwitched: "Dil Türkçe olarak değiştirildi 🇹🇷",
      toastDarkOn: "Karanlık mod etkinleştirildi 🌙",
      toastLightOn: "Aydınlık mod etkinleştirildi ☀️",
      toastSoundOn: "Fiyat değişim sesi açıldı 🔔",
      toastSoundOff: "Ses kapatıldı 🔕",
      toastWaitPrices: "Lütfen önce fiyatların yüklenmesini bekleyin",
      toastQuoteSaved: "Fiyat 'Daha Fazla' sekmesine kaydedildi 💾",
      toastQuoteDeleted: "Kayıt silindi 🗑️",
      toastQuotesCleared: "Tüm kayıtlı fiyatlar temizlendi",
      confirmClearQuotes: "Kaydedilen tüm fiyatları silmek istediğinizden emin misiniz?",
      toastMarginReset: "Varsayılan işçilikler geri yüklendi 🔄",
      toastGuestHint: "Müşteri Ekranı — Çıkmak için logoya 3 kez dokunun",
      toastWelcomeBack: "Yönetici ekranına tekrar hoş geldiniz 🔓",
      toastAdminOpen: "Yönetici paneli açıldı 🛡️",
      toastLogout: "Çıkış yapıldı",
      toastAlreadyInstalled: "Uygulama zaten yüklü ✓",
      toastInstalling: "Uygulama yükleniyor 📲",
      toastInstallBrowserHint: "Tarayıcı menüsünden (⋮) 'Uygulamayı Yükle' veya 'Ana Ekrana Ekle'yi seçin",
      toastPinMin4: "Şifre en az 4 karakter olmalıdır",
      toastPinUpdated: "Yönetici şifresi güncellendi 🔒",
      toastMarginsPublished: "Sunucu işçilikleri kaydedildi ve yayınlandı 🚀",
      toastGuestVisibleOn: "Müşteri Ekranı 'Daha Fazla' sekmesinde görünür 👁️",
      toastGuestVisibleOff: "Müşteri Ekranı gizlendi 🔒",
      errEnterPin: "Lütfen şifreyi girin",
      errWrongPin: "Hatalı şifre",
      errServerConn: "Sunucu bağlantı hatası",
      errReqFailed: "İşlem gerçekleştirilemedi",
      guestHeadTitle: "Müşteri Ekranı",
      guestKaratsHead: "Gram Başı Ayar Fiyatları",
      guestBullionsHead: "Külçe Altın Fiyatları",
      emptyQuotesHtml: "Henüz kaydedilmiş bir fiyat yok.<br>Hesaplayıcıda kaydet düğmesine <svg class=\"ico xs\" style=\"vertical-align:middle\"><use href=\"#i-save\"/></svg> dokunarak müşteri adıyla fiyat kaydedebilirsiniz.",
      restoreBtn: "Yükle",
      deleteBtn: "Sil",
      tagByWeight: "Ağırlık",
      tagByBudget: "Bütçe"
    }
  };

  const PRO_GUIDE = {
    ar: [
      ["1. ما هي الأونصة العالمية؟ ولماذا تزن 31.1035 جرام؟", "الأونصة المعتمدة في تجارة الذهب تسمى الأونصة الترويسية وتزن <b>31.1034768 جرام</b> من الذهب الخالص (عيار 24 بنقاوة 999.9). السعر العالمي يُسعّر دائماً بالدولار لكل أونصة، ومنه نحسب سعر الكيلو العالمي: <code>الأونصة × 32.1507</code>."],
      ["2. كيف يتحرك السعر بين لندن ونيويورك وإسطنبول؟", "سوق الذهب العالمي مفتوح 24 ساعة من الإثنين للجمعة. تسعير لندن الفوري هو المرجع للتسليم الفعلي، وبورصة نيويورك تقود العقود الآجلة والسيولة، بينما بورصة إسطنبول ومؤسسة هارم تسعّر الذهب الفعلي داخل تركيا وتضيف عليه فارق العرض والطلب المحلي."],
      ["3. ما هو فارق إسطنبول؟ ومتى تشتري أو تبيع؟", "هو الفرق بالدولار بين سعر الكيلو في إسطنبول وسعر الكيلو العالمي:<br>• <b>أقل من 200$ أو بالسالب:</b> السوق المحلي أرخص أو مساوي للعالمي — فرصة ممتازة للشراء.<br>• <b>بين 200$ و 800$:</b> الوضع الطبيعي بسبب تكاليف الشحن والتأمين.<br>• <b>أعلى من 1,000$:</b> علاوة محلية مرتفعة بسبب شح المعروض أو قيود الاستيراد."],
      ["4. القاعدة الذهبية: ماذا يفعل الدولار والفائدة بالذهب؟", "• <b>الدولار الأمريكي:</b> علاقة عكسية — ضعف الدولار يرفع الأونصة.<br>• <b>الفائدة الأمريكية:</b> خفض الفائدة يرفع الذهب بقوة لأن الودائع البنكية تفقد جاذبيتها.<br>• <b>التضخم والأزمات:</b> الذهب هو الملاذ الآمن الأول عالمياً."],
      ["5. كيف تقرأ مؤشر القوة النسبية بدون تعقيد؟", "مقياس من 0 إلى 100 يقيس سرعة حركة السعر:<br>• <b>فوق 70 (تشبع شرائي):</b> السعر ارتفع بسرعة كبيرة واحتمال يهدأ أو يصحح للأسفل — لا تطارد القمة.<br>• <b>تحت 30 (تشبع بيعي):</b> السعر هبط بقوة وباع الجميع — غالباً قاع ارتداد ممتاز للشراء.<br>• <b>بين 40 و 60:</b> توازن طبيعي."],
      ["6. ما هي نقاط الارتكاز والدعم والمقاومة؟", "مستويات سعرية يحترمها المتداولون والبنوك:<br>• <b>نقطة الارتكاز:</b> خط المنتصف؛ تداول الأونصة فوقها يعني اليوم إيجابي صاعد.<br>• <b>الدعم (1 و 2):</b> أرضية سعرية يظهر عندها المشترون — أفضل مناطق الشراء.<br>• <b>المقاومة (1 و 2):</b> سقف سعري يظهر عنده البائعون — أفضل مناطق البيع وجني الأرباح."],
      ["7. لماذا يرتفع الذهب بالليرة أحياناً رغم هبوط الأونصة؟", "لأن سعر الجرام بالليرة يعتمد على محركين معاً: <b>سعر الأونصة بالدولار × سعر صرف الدولار مقابل الليرة</b>. إذا نزلت الأونصة 1% ولكن الدولار ارتفع أمام الليرة 2%، سترى الذهب بالليرة يرتفع (+1%). لذلك تجار الذهب في تركيا يراقبون الشاشتين معاً."],
      ["8. نصائح ذهبية للتاجر والمشتري الذكي", "1. <b>الشراء على دفعات:</b> قسّم مبلغك على مستويات الدعم بدلاً من الدخول دفعة واحدة.<br>2. <b>السبائك للادخار:</b> كلما زاد وزن السبيكة (20 جم، 50 جم، 100 جم) قلّت المصنعية لكل جرام، وعند البيع تُشترى على سعر الذهب الخام الصافي بدون خصم مصنعية.<br>3. <b>تجنب الشراء وقت الذروة:</b> لا تشترِ عند القمم التاريخية ومؤشر القوة النسبية فوق 75؛ انتظر دائماً التصحيح لأقرب دعم."]
    ],
    en: [
      ["1. What is the Global Ounce & why is it 31.1035g?", "In international bullion trading, gold is measured in Troy Ounces weighing <b>31.1034768 grams</b> of fine 24K gold (999.9 purity). Global spot gold (XAU/USD) is quoted in US Dollars per ounce. One kilogram equals <code>32.1507466 troy ounces</code>."],
      ["2. How do London, New York, and Istanbul markets interact?", "Global gold trades 24 hours a day from Monday to Friday. London (LBMA) sets the benchmark for physical bullion, New York (COMEX) drives futures liquidity, and Istanbul (Borsa Istanbul & Harem) prices physical gold inside Turkey by adding local supply-and-demand premiums."],
      ["3. What is the Istanbul Spread & when should you buy or sell?", "It is the dollar difference per kilo between Istanbul's local market and the global spot kilo:<br>• <b>Below $200 or Negative:</b> Local gold is trading at a discount or parity — prime buying opportunity.<br>• <b>$200 to $800:</b> Normal balanced market covering logistics and insurance.<br>• <b>Above $1,000:</b> High local premium due to import quotas or strong domestic demand."],
      ["4. The Golden Rule: How do USD and Fed rates impact gold?", "• <b>US Dollar Index (DXY):</b> Inverse relationship — a weaker dollar pushes gold higher.<br>• <b>Interest Rates (Fed):</b> Rate cuts strongly boost gold since non-yielding bullion becomes more attractive than bonds.<br>• <b>Inflation & Geopolitics:</b> Gold remains the world's ultimate safe-haven asset."],
      ["5. How to read the RSI indicator effortlessly?", "A momentum scale from 0 to 100 measuring price velocity:<br>• <b>Above 70 (Overbought):</b> Price rallied too fast and may pull back — avoid chasing the top.<br>• <b>Below 30 (Oversold):</b> Heavy selling exhausted — often a strong rebound zone for buyers.<br>• <b>Between 40 and 60:</b> Healthy balanced market."],
      ["6. What are Pivot Points, Support, and Resistance?", "Key price levels watched by institutional traders and banks:<br>• <b>Pivot Point (PP):</b> The daily equilibrium; trading above PP signals a bullish session.<br>• <b>Support (S1 & S2):</b> Price floors where buyers step in — ideal zones for staged buying.<br>• <b>Resistance (R1 & R2):</b> Price ceilings where sellers take profit — ideal zones for trimming or selling."],
      ["7. Why can TRY gold rise even when the global ounce drops?", "Because Gram Gold in TRY is driven by two engines simultaneously: <b>Global Ounce ($) × USD/TRY Exchange Rate</b>. If the global ounce dips 1% while USD/TRY rises 2%, local TRY gold still climbs (+1%). Smart dealers monitor both feeds together."],
      ["8. Golden Rules for Smart Dealers & Investors", "1. <b>Buy in Tranches:</b> Scale into positions near Support levels (S1, S2) instead of buying all at once.<br>2. <b>Bullions for Savings:</b> Larger bullions (20g, 50g, 100g) carry lower making fees per gram and are bought back at pure raw gold price with zero margin deduction.<br>3. <b>Don't Chase Spikes:</b> Avoid buying during parabolic spikes when RSI exceeds 75; wait for a pullback to support."]
    ],
    tr: [
      ["1. Küresel Ons nedir ve neden 31,1035 gramdır?", "Uluslararası altın ticaretinde kullanılan Troy Ons, <b>31,1034768 gram</b> saf 24 ayar (999,9 milyem) altına eşittir. Küresel piyasada altın (XAU/USD) her zaman ons başına ABD Doları olarak fiyatlanır. 1 kilogram altın <code>32,1507466 ons</code> eder."],
      ["2. Londra, New York ve İstanbul piyasaları nasıl çalışır?", "Küresel altın piyasası Pazartesi'den Cuma'ya 24 saat açıktır. Londra (LBMA) fiziki teslimat referansını belirler, New York (COMEX) vadeli işlemleri ve likiditeyi yönetir; İstanbul (Borsa İstanbul ve Harem) ise Türkiye'deki fiziki arz-talep dengesine göre yerel fiyatı oluşturur."],
      ["3. İstanbul Farkı (Makası) nedir? Ne zaman alınır veya satılır?", "İstanbul'daki dolar bazlı kilo altın fiyatı ile küresel ons bazlı kilo fiyatı arasındaki farktır:<br>• <b>200$'ın altında veya eksi:</b> Yerel piyasa küresel fiyata eşit veya daha ucuz — alım için harika fırsat.<br>• <b>200$ – 800$ arası:</b> Lojistik ve sigorta maliyetlerini içeren normal piyasa dengesi.<br>• <b>1.000$ üzeri:</b> İthalat kotaları veya yoğun iç talep nedeniyle yüksek yerel prim."],
      ["4. Altın Kural: Dolar ve Faiz oranları altını nasıl etkiler?", "• <b>ABD Dolar Endeksi (DXY):</b> Ters orantılıdır — dolar zayıfladığında ons altın yükselir.<br>• <b>Faiz Oranları (Fed):</b> Faiz indirimleri mevduat cazibesini azalttığı için altına güçlü destek verir.<br>• <b>Enflasyon ve Krizler:</b> Altın, küresel ölçekte bir numaralı güvenli limandır."],
      ["5. RSI (Göreceli Güç Endeksi) kolayca nasıl okunur?", "Fiyat hareketlerinin hızını ölçen 0 ile 100 arasındaki göstergedir:<br>• <b>70 Üzeri (Aşırı Alım):</b> Fiyat çok hızlı yükselmiştir, kâr satışlarıyla düzeltme gelebilir — zirveden alım yapmaktan kaçının.<br>• <b>30 Altı (Aşırı Satım):</b> Satışlar doygunluğa ulaşmıştır — genellikle yukarı yönlü tepki alımı bölgesidir.<br>• <b>40 – 60 Arası:</b> Dengeli ve sağlıklı piyasa."],
      ["6. Pivot Noktaları, Destek ve Direnç seviyeleri nedir?", "Bankaların ve profesyonel yatırımcıların takip ettiği kritik fiyat seviyeleridir:<br>• <b>Pivot (PP):</b> Günlük denge noktasıdır; fiyatın bunun üzerinde kalması pozitif (yükseliş) eğilimini gösterir.<br>• <b>Destek (S1 ve S2):</b> Alıcıların devreye girdiği taban seviyelerdir — kademeli alım için en uygun bölgeler.<br>• <b>Direnç (R1 ve R2):</b> Satıcıların kâr realizasyonu yaptığı tavan seviyelerdir."],
      ["7. Küresel ons düşerken TL gram altın neden yükselebilir?", "Çünkü TL bazında gram altın iki motora bağlıdır: <b>Küresel Ons ($) × Dolar/TL Kuru</b>. Ons altın %1 düşse bile Dolar/TL kuru %2 yükselirse, TL gram altın yaklaşık %1 artış gösterir. Bu yüzden Türkiye'de her iki ekran birlikte takip edilir."],
      ["8. Kuyumcular ve Yatırımcılar İçin Altın Tavsiyeler", "1. <b>Kademeli Alım Yapın:</b> Tüm bütçeyle tek seferde girmek yerine S1 ve S2 destek seviyelerinden parçalı alım yapın.<br>2. <b>Tasarruf İçin Külçe:</b> Külçe ağırlığı arttıkça (20 gr, 50 gr, 100 gr) gram başına işçilik düşer ve geri satışta sıfır işçilik kesintisiyle has fiyattan bozdurulur.<br>3. <b>Zirveleri Kovalamayın:</b> RSI 75'in üzerindeyken panik alımı yapmayın, en yakın desteğe çekilmesini bekleyin."]
    ]
  };

  const TITLES = {
    ar: {
      prices: ["الأسعار المباشرة", "أسعار بورصة هارم لحظة بلحظة"],
      calc: ["الحاسبة", "بيع وشراء بالوزن، بالميزانية، وتحويل العملات"],
      bullions: ["السبائك والعيارات", "أسعار لحظية — الشراء بدون مصنعية"],
      indicators: ["المؤشرات", "قراءة ذكية مبسطة لحركة الذهب العالمية"],
      more: ["المزيد", "المشاركة، التسعيرات المحفوظة والإعدادات"]
    },
    en: {
      prices: ["Live Prices", "Real-time rates from Harem Altın"],
      calc: ["Calculator", "Buy & sell by weight, budget, and currency converter"],
      bullions: ["Bullions & Karats", "Live prices — Zero margin buying"],
      indicators: ["Indicators", "Smart simplified technical analysis of global gold"],
      more: ["More", "Sharing, saved quotes, and settings"]
    },
    tr: {
      prices: ["Canlı Fiyatlar", "Harem Altın anlık fiyatları"],
      calc: ["Hesaplama", "Gramla, bütçeyle alış-satış ve döviz çevirici"],
      bullions: ["Külçe & Ayarlar", "Anlık fiyatlar — Sıfır işçilikle alış"],
      indicators: ["Göstergeler", "Küresel altın piyasası akıllı teknik analizi"],
      more: ["Daha Fazla", "Paylaşım, kayıtlı fiyatlar ve ayarlar"]
    }
  };

  function t(key, fallback = "") {
    const lang = S.lang || "ar";
    if (I18N[lang] && I18N[lang][key] !== undefined) return I18N[lang][key];
    if (I18N.ar && I18N.ar[key] !== undefined) return I18N.ar[key];
    return fallback;
  }

  function tBullion(name, weight) {
    const lang = S.lang || "ar";
    if (lang === "en") return `${weight}g Bullion`;
    if (lang === "tr") return `${weight} gr Külçe Altın`;
    return `سبيكة ${weight} جرام`;
  }

  function tKarat(name, id) {
    const lang = S.lang || "ar";
    const k = id ? id.replace("k", "") : String(name || "").replace(/\D/g, "");
    if (lang === "en") return `${k}K Gold`;
    if (lang === "tr") return `${k} Ayar Altın`;
    return `عيار ${k}`;
  }

  function setLanguage(lang, silent = false) {
    if (!["ar", "en", "tr"].includes(lang)) lang = "ar";
    S.lang = lang;
    store.set("gold_lang", lang);
    html.lang = lang;
    html.dir = lang === "ar" ? "rtl" : "ltr";
    document.title = t("docTitle");

    const curEl = $("#langCur");
    if (curEl) curEl.textContent = lang === "ar" ? "العربية" : lang === "en" ? "English" : "Türkçe";

    setSegValue("appLang", lang);

    $$("#sheetLang .lang-opt").forEach((opt) => {
      opt.classList.toggle("is-active", opt.dataset.lang === lang);
    });

    $$("[data-i18n]").forEach((el) => {
      const key = el.dataset.i18n;
      if (I18N[lang] && I18N[lang][key] !== undefined) el.textContent = I18N[lang][key];
    });

    $$("[data-i18n-ph]").forEach((el) => {
      const key = el.dataset.i18nPh;
      if (I18N[lang] && I18N[lang][key] !== undefined) el.setAttribute("placeholder", I18N[lang][key]);
    });

    const tObj = TITLES[lang] || TITLES.ar;
    if (tObj && tObj[S.page]) {
      $("#deskTitle").textContent = tObj[S.page][0];
      $("#deskSub").textContent = tObj[S.page][1];
    }

    buildStatic();
    syncTradeUI();
    renderMarginPresets();
    renderBudgetPresets();
    renderQuotes();
    setLive(S.connected);
    setSource(S.source);
    if (S.data) {
      const prev = S.prev; S.prev = null;
      renderPrices(S.data, null);
      renderBullions(S.data);
      renderKaratsList(S.data);
      renderIndicators(S.data, null);
      calcAll();
      renderTemplates();
      renderSharePreviews();
      renderGuest(S.data);
      S.prev = prev;
    } else {
      calcAll();
      renderTemplates();
    }
    const hCfg = getInstr(S.hist.sym);
    if ($("#histTitle")) $("#histTitle").textContent = hCfg.title;
    if ($("#histAmtLabel")) $("#histAmtLabel").textContent = hCfg.label;
    if ($("#histUnit")) $("#histUnit").textContent = hCfg.unit;
    if ($("#sheetPro") && $("#sheetPro").classList.contains("is-open")) renderPro();
    if ($("#sheetHistory") && $("#sheetHistory").classList.contains("is-open")) openHistory(S.hist.sym);
    if ($("#sheetMargin") && $("#sheetMargin").classList.contains("is-open") && editingBullion) openMarginEditor(editingBullion);
    if (tvLoaded) loadTradingView(true);
    tickClock();
    requestAnimationFrame(layoutPills);
    if (!silent) toast(t("toastLangSwitched"));
  }

  // ---------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------
  const TABS = ["prices", "calc", "bullions", "indicators", "more"];

  function go(tab, opts = {}) {
    if (!TABS.includes(tab)) tab = "prices";
    const prevIdx = TABS.indexOf(S.page);
    const idx = TABS.indexOf(tab);
    const changed = tab !== S.page || opts.force;
    S.page = tab;
    $$(".page").forEach((p) => {
      const on = p.dataset.page === tab;
      if (on && changed) {
        p.classList.remove("is-active", "from-left");
        void p.offsetWidth;
        if (idx < prevIdx) p.classList.add("from-left");
      }
      p.classList.toggle("is-active", on);
    });
    $$("[data-act='tab']").forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle("is-active", on);
      if (b.classList.contains("tab") || b.classList.contains("rail__item")) b.setAttribute("aria-current", on ? "page" : "false");
    });
    const tObj = TITLES[S.lang] || TITLES.ar;
    $("#deskTitle").textContent = tObj[tab][0];
    $("#deskSub").textContent = tObj[tab][1];
    if (!opts.noHash && location.hash !== `#${tab}`) history.replaceState(null, "", `#${tab}`);
    if (changed && !opts.keepScroll) window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    requestAnimationFrame(layoutPills);
    if (tab === "more") renderTemplates();
  }

  function layoutPills() {
    const active = $(".tab.is-active");
    const pill = $("#tabPill");
    if (active && pill) {
      const w = 56;
      pill.style.transform = `translateX(${active.offsetLeft + (active.offsetWidth - w) / 2}px)`;
    }
    const rItem = $(".rail__item.is-active");
    const rPill = $("#railPill");
    if (rItem && rPill) rPill.style.transform = `translateY(${rItem.offsetTop}px)`;
    $$(".seg").forEach(moveSegPill);
  }
  function moveSegPill(seg) {
    const pill = seg.querySelector(".seg__pill");
    const on = seg.querySelector("button.is-on");
    if (!pill || !on || !on.offsetWidth) return;
    pill.style.width = `${on.offsetWidth}px`;
    pill.style.transform = `translateX(${on.offsetLeft}px)`;
  }

  // ---------------------------------------------------------
  // Sheets
  // ---------------------------------------------------------
  const sheetStack = [];
  function openSheet(id) {
    const el = document.getElementById(id);
    if (!el || el.classList.contains("is-open")) return;
    el.classList.add("is-open");
    el.setAttribute("aria-hidden", "false");
    sheetStack.push(id);
    html.style.overflow = "hidden";
    const focusEl = el.querySelector("input:not([type=hidden]), .sheet__close");
    if (focusEl && isDesktop()) setTimeout(() => focusEl.focus({ preventScroll: true }), 120);
  }
  function closeSheet(id) {
    id = id || sheetStack[sheetStack.length - 1];
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove("is-open");
    el.setAttribute("aria-hidden", "true");
    const i = sheetStack.lastIndexOf(id);
    if (i > -1) sheetStack.splice(i, 1);
    if (!sheetStack.length) html.style.overflow = "";
    const panel = el.querySelector(".sheet__panel");
    if (panel) panel.style.transform = "";
    if (id === "sheetAdmin") stopAdminPoll();
  }

  // Swipe-down to close on mobile
  function initSheetDrag() {
    $$(".sheet").forEach((sheet) => {
      const panel = sheet.querySelector(".sheet__panel");
      const handles = sheet.querySelectorAll(".sheet__grab, .sheet__head");
      let startY = 0, dy = 0, dragging = false;
      handles.forEach((h) => {
        h.addEventListener("pointerdown", (e) => {
          if (isDesktop() || e.target.closest("button")) return;
          dragging = true; startY = e.clientY; dy = 0;
          sheet.classList.add("is-dragging");
          h.setPointerCapture(e.pointerId);
        });
        h.addEventListener("pointermove", (e) => {
          if (!dragging) return;
          dy = Math.max(0, e.clientY - startY);
          panel.style.transform = `translateY(${dy}px)`;
        });
        const end = () => {
          if (!dragging) return;
          dragging = false;
          sheet.classList.remove("is-dragging");
          if (dy > 110) closeSheet(sheet.id);
          else panel.style.transform = "";
        };
        h.addEventListener("pointerup", end);
        h.addEventListener("pointercancel", end);
      });
    });
  }

  // ---------------------------------------------------------
  // Bullion margins (client side, zero-margin buying)
  // ---------------------------------------------------------
  function applyCustomBullionCalculations(data) {
    if (!data || !data.bullions || !data.market) return;
    const goldAlis = data.market.gramGold.alis;
    const goldSatis = data.market.gramGold.satis;
    const usdTryAlis = data.market.usdTry.alis;
    data.bullions.forEach((b) => {
      const margin = customMargins[b.id] !== undefined ? Number(customMargins[b.id]) : b.margin;
      b.margin = margin;
      const satisTry = (goldSatis + margin) * b.weight;      // Selling = (gram sell + margin) × weight
      const alisTry = goldAlis * b.weight;                   // Buying = gram buy × weight (ZERO margin)
      b.try = { satis: Number(satisTry.toFixed(2)), alis: Number(alisTry.toFixed(2)) };
      b.usd = { satis: Number((satisTry / usdTryAlis).toFixed(2)), alis: Number((alisTry / usdTryAlis).toFixed(2)) };
    });
  }

  /** Karats incl. synthetic 24K row from gram gold (same rule the calculator uses). */
  function karatRows(d) {
    if (!d || !d.market) return [];
    const u = d.market.usdTry.alis;
    const g = d.market.gramGold;
    const k24 = { id: "k24", name: "عيار 24", purity: 995, try: { alis: g.alis, satis: g.satis }, usd: { alis: g.alis / u, satis: g.satis / u } };
    return [k24].concat(d.karats || []);
  }

  // ---------------------------------------------------------
  // History cache (sparklines, daily change, archive)
  // ---------------------------------------------------------
  const HIST_SYMS = ["gramGold", "usdKg", "usdTry", "ons"];
  async function fetchHistory(sym) {
    if (S.histCache[sym]) return S.histCache[sym];
    try {
      const res = await fetch(`/api/history?symbol=${sym}`);
      const json = await res.json();
      if (json && Array.isArray(json.data)) {
        S.histCache[sym] = json.data.slice().sort((a, b) => a.date.localeCompare(b.date));
        return S.histCache[sym];
      }
    } catch (e) {}
    return [];
  }
  function prevClose(sym) {
    const s = S.histCache[sym];
    if (!s || !s.length) return null;
    const today = istDate();
    for (let i = s.length - 1; i >= 0; i--) if (s[i].date < today) return s[i];
    return null;
  }
  function changePct(sym, live) {
    const p = prevClose(sym);
    if (!p || !p.satis || !live) return null;
    return ((live - p.satis) / p.satis) * 100;
  }
  function karatChangePct() {
    const k = prevClose("usdKg");
    const u = prevClose("usdTry");
    const m = S.data && S.data.market;
    if (!k || !u || !m) return null;
    const then = k.satis * u.alis;
    const now = m.usdKg.satis * m.usdTry.alis;
    return then ? ((now - then) / then) * 100 : null;
  }
  function chgChip(el, pct, small) {
    if (!el) return;
    if (pct === null || pct === undefined || isNaN(pct)) {
      el.className = `chg ${small ? "sm " : ""}is-flat num`;
      el.textContent = "—";
      return;
    }
    const up = pct > 0.005, down = pct < -0.005;
    el.className = `chg ${small ? "sm " : ""}${up ? "is-up" : down ? "is-down" : "is-flat"} num`;
    el.innerHTML = `${up ? "▲" : down ? "▼" : "•"} ${up ? "+" : ""}${pct.toFixed(2)}%`;
  }
  function sparkSeries(sym, live) {
    const s = S.histCache[sym];
    if (!s || s.length < 2) return null;
    const today = istDate();
    const pts = s.filter((p) => p.date < today).slice(-29).map((p) => p.satis);
    if (live) pts.push(live);
    return pts.length >= 2 ? pts : null;
  }
  function sparkSVG(pts, w = 120, h = 40, draw = false) {
    if (!pts) return "";
    const min = Math.min(...pts), max = Math.max(...pts), rng = max - min || 1;
    const xy = pts.map((v, i) => [(i / (pts.length - 1)) * w, h - 3 - ((v - min) / rng) * (h - 8)]);
    let d = `M${xy[0][0].toFixed(1)} ${xy[0][1].toFixed(1)}`;
    for (let i = 1; i < xy.length; i++) {
      const [x0, y0] = xy[i - 1], [x1, y1] = xy[i], mx = (x0 + x1) / 2;
      d += ` C${mx.toFixed(1)} ${y0.toFixed(1)},${mx.toFixed(1)} ${y1.toFixed(1)},${x1.toFixed(1)} ${y1.toFixed(1)}`;
    }
    return `<svg class="spark${draw ? " draw" : ""}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path class="a" d="${d} L${w} ${h} L0 ${h} Z"/><path class="l" d="${d}"/></svg>`;
  }

  // ---------------------------------------------------------
  // PRICES PAGE
  // ---------------------------------------------------------
  const lira = () => t("curLiraShort");
  const gUnit = () => t("gramShort");
  const CUR_SHORT = {
    ar: { USD: "دولار", EUR: "يورو", GBP: "إسترليني", SAR: "ريال", AED: "درهم", KWD: "دينار", TRY: "ليرة" },
    en: { USD: "USD", EUR: "EUR", GBP: "GBP", SAR: "SAR", AED: "AED", KWD: "KWD", TRY: "TRY" },
    tr: { USD: "USD", EUR: "EUR", GBP: "GBP", SAR: "SAR", AED: "AED", KWD: "KWD", TRY: "TL" }
  };
  const tCur = (code) => (CUR_SHORT[S.lang] && CUR_SHORT[S.lang][code]) || code;

  const MKTS = [
    { id: "usdKg", ico: "i-scale", cur: "$", d: 0, hist: "usdKg" },
    { id: "usdTry", ico: "i-dollar", cur: "TRY", d: 3, hist: "usdTry" },
    { id: "ons", ico: "i-globe", cur: "$", d: 2, hist: "ons" },
    { id: "k21", ico: "i-gem", cur: "TRY", d: 2, purity: 875 },
    { id: "k18", ico: "i-gem", cur: "TRY", d: 2, purity: 750 }
  ];
  function mktValue(m, d) {
    if (m.purity) {
      const k = (d.karats || []).find((x) => x.purity === m.purity);
      return k ? k.try : null;
    }
    return d.market[m.id] || null;
  }

  function buildStatic() {
    // Quick actions (mobile + desktop)
    const qa = [
      { act: "tab", tab: "calc", ico: "i-calc", t: t("qaCalc") },
      { act: "tab", tab: "bullions", ico: "i-bars", t: t("qaBullions") },
      { act: "open-share", ico: "i-share", t: t("qaShare") },
      { act: "open-history", sym: "gramGold", ico: "i-cal", t: t("qaArchive") }
    ];
    const qaHTML = qa.map((q) => `<button class="qa" data-act="${q.act}"${q.tab ? ` data-tab="${q.tab}"` : ""}${q.sym ? ` data-sym="${q.sym}"` : ""}><span class="qa__ico"><svg class="ico lg"><use href="#${q.ico}"/></svg></span>${q.t}</button>`).join("");
    $("#quickMob").innerHTML = qaHTML;
    $("#quickDesk").innerHTML = qaHTML;

    // Weight preset chips
    const wp = $("#cWeightPresets");
    if (wp) {
      const cw = num("cWeight");
      wp.innerHTML = [5, 10, 20, 50, 100].map((v) => `<button class="chip${Math.abs(cw - v) < 1e-6 ? " is-on" : ""}" data-v="${v}">${v} ${gUnit()}</button>`).join("");
    }

    // Market list
    const mktNames = {
      usdKg: t("mUsdKg"),
      usdTry: t("mUsdTry"),
      ons: t("mOns"),
      k21: t("mK21"),
      k18: t("mK18")
    };
    const mktSubs = {
      usdKg: S.lang === "ar" ? "دولار / كجم" : S.lang === "tr" ? "Dolar / kg" : "USD / kg",
      usdTry: S.lang === "ar" ? "دولار / ليرة" : S.lang === "tr" ? "Dolar / TL" : "USD / TRY",
      ons: S.lang === "ar" ? "دولار / أونصة" : S.lang === "tr" ? "Ons / Dolar" : "XAU / USD",
      k21: t("perGram"),
      k18: t("perGram")
    };
    $("#mktList").innerHTML = MKTS.map((m) => {
      const cLabel = m.cur === "$" ? "$" : lira();
      return `
      <button class="mkt" data-act="${m.hist ? "open-history" : "tab"}" ${m.hist ? `data-sym="${m.hist}"` : `data-tab="bullions" data-view="karats"`}>
        <span class="mkt__ico"><svg class="ico"><use href="#${m.ico}"/></svg></span>
        <span class="mkt__txt"><span class="mkt__name">${mktNames[m.id]}</span><span class="mkt__sub" id="mSub_${m.id}">${mktSubs[m.id]}</span></span>
        <span class="mkt__end"><span class="mkt__price"><span class="num" id="mVal_${m.id}">—</span><span class="cur">${cLabel}</span></span><span class="chg sm is-flat num" id="mChg_${m.id}">—</span></span>
        <span class="mkt__spark" id="mSpark_${m.id}"></span>
      </button>`;
    }).join("");

    // Indicator tiles
    const tileNames = {
      gramGold: t("mGramGold"),
      usdKg: t("mUsdKg"),
      usdTry: t("mUsdTry"),
      ons: t("mOns")
    };
    const TILES = [
      { sym: "gramGold", cur: lira(), d: 2 },
      { sym: "usdKg", cur: "$", d: 0 },
      { sym: "usdTry", cur: lira(), d: 3 },
      { sym: "ons", cur: "$", d: 2 }
    ];
    $("#indTiles").innerHTML = TILES.map((tItem) => `
      <button class="tile" data-act="open-history" data-sym="${tItem.sym}">
        <span class="tile__name">${tileNames[tItem.sym]}</span>
        <span class="tile__price"><span class="num" id="tVal_${tItem.sym}">—</span><span class="cur">${tItem.cur}</span></span>
        <span class="chg sm is-flat num" id="tChg_${tItem.sym}" style="justify-self:start">—</span>
        <span class="tile__foot"><span id="tSpark_${tItem.sym}" style="flex:1;min-width:0"></span><svg class="ico sm"><use href="#i-cal"/></svg></span>
      </button>`).join("");

    // Currency selects
    const curNames = {
      ar: { USD: "دولار أمريكي ($)", EUR: "يورو (€)", GBP: "جنيه إسترليني (£)", SAR: "ريال سعودي", AED: "درهم إماراتي", KWD: "دينار كويتي", TRY: "ليرة تركية" },
      en: { USD: "USD · US Dollar", EUR: "EUR · Euro", GBP: "GBP · British Pound", SAR: "SAR · Saudi Riyal", AED: "AED · UAE Dirham", KWD: "KWD · Kuwaiti Dinar", TRY: "TRY · Turkish Lira" },
      tr: { USD: "USD · Amerikan Doları", EUR: "EUR · Euro", GBP: "GBP · İngiliz Sterlini", SAR: "SAR · Suudi Riyali", AED: "AED · BAE Dirhemi", KWD: "KWD · Kuveyt Dinarı", TRY: "TRY · Türk Lirası" }
    };
    const cMap = curNames[S.lang] || curNames.ar;
    const CURS = ["USD", "EUR", "GBP", "SAR", "AED", "KWD", "TRY"];
    const prevFrom = $("#xFrom") ? ($("#xFrom").value || "USD") : "USD";
    const prevTo = $("#xTo") ? ($("#xTo").value || "TRY") : "TRY";
    const opts = CURS.map((c) => `<option value="${c}">${cMap[c]}</option>`).join("");
    if ($("#xFrom")) { $("#xFrom").innerHTML = opts; $("#xFrom").value = prevFrom; }
    if ($("#xTo")) { $("#xTo").innerHTML = opts; $("#xTo").value = prevTo; }

    // Share sheet items
    const shTitles = {
      try: S.lang === "en" ? "Bullions in TRY" : S.lang === "tr" ? "TL Külçe Fiyatları" : "أسعار السبائك بالليرة",
      usd: S.lang === "en" ? "Bullions in USD" : S.lang === "tr" ? "Dolar Külçe Fiyatları" : "أسعار السبائك بالدولار",
      karats: S.lang === "en" ? "21K & 18K Karats" : S.lang === "tr" ? "21 ve 18 Ayar Fiyatları" : "أسعار العيارات 21 و 18",
      all: S.lang === "en" ? "Full Market Report" : S.lang === "tr" ? "Tam Piyasa Raporu" : "التقرير الكامل"
    };
    const SH = [
      { k: "try", t: shTitles.try, ico: "i-bars" },
      { k: "usd", t: shTitles.usd, ico: "i-dollar" },
      { k: "karats", t: shTitles.karats, ico: "i-gem" },
      { k: "all", t: shTitles.all, ico: "i-book" }
    ];
    if ($("#shareList")) {
      $("#shareList").innerHTML = SH.map((s) => `
        <div class="share-item">
          <span class="row__ico"><svg class="ico sm"><use href="#${s.ico}"/></svg></span>
          <div style="min-width:0"><b>${s.t}</b><span id="shPrev_${s.k}">—</span></div>
          <div class="share-item__acts">
            <button class="round-btn" data-act="share-copy" data-tpl="${s.k}" aria-label="${t("copyBtn")}"><svg class="ico sm"><use href="#i-copy"/></svg></button>
            <button class="round-btn wa" data-act="share-wa" data-tpl="${s.k}" aria-label="${t("waBtn")}"><svg class="ico sm"><use href="#i-wa"/></svg></button>
          </div>
        </div>`).join("");
    }

    // Pro Guide Accordion
    const pg = $("#proGuide");
    if (pg) {
      const items = PRO_GUIDE[S.lang] || PRO_GUIDE.ar;
      pg.innerHTML = items.map(([q, a], idx) => `
        <details${idx === 0 ? " open" : ""}>
          <summary>${q}<svg class="ico xs"><use href="#i-down"/></svg></summary>
          <div class="guide__body">${a}</div>
        </details>`).join("");
    }
  }

  let heroAnimated = false;
  function countUp(el, to, d) {
    if (reduceMotion || !el) { setNum(el, to, d, null); return; }
    const from = to * 0.985, t0 = performance.now(), dur = 900;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.innerHTML = fmtH(from + (to - from) * e, d);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function renderPrices(d, p) {
    const m = d.market, pm = p ? p.market : null;
    const heroEl = $("#heroPrice");
    if (!heroAnimated) { heroAnimated = true; countUp(heroEl, m.gramGold.satis, 2); }
    else setNum(heroEl, m.gramGold.satis, 2, pm ? pm.gramGold.satis : null);
    setNum("heroBuy", m.gramGold.alis, 2, pm ? pm.gramGold.alis : null, { html: false });
    setNum("heroUsd", m.usdTry.alis, 3, pm ? pm.usdTry.alis : null, { html: false });
    if (m.ons) setNum("heroOns", m.ons.satis, 1, pm && pm.ons ? pm.ons.satis : null, { prefix: "$", html: false });
    const hc = changePct("gramGold", m.gramGold.satis);
    const hEl = $("#heroChg");
    if (hc === null) { hEl.className = "chg num"; hEl.textContent = t("liveConnected"); }
    else { hEl.className = `chg num${hc < -0.005 ? " is-down" : ""}`; hEl.textContent = `${hc >= 0 ? "▲ +" : "▼ "}${hc.toFixed(2)}% ${t("today")}`; }

    MKTS.forEach((mk) => {
      const v = mktValue(mk, d); if (!v) return;
      const pv = p ? mktValue(mk, p) : null;
      setNum(`mVal_${mk.id}`, v.satis, mk.d, pv ? pv.satis : null);
      const sub = document.getElementById(`mSub_${mk.id}`);
      if (sub) sub.textContent = `${t("buyWord")} ${fmt(v.alis, mk.d)}`;
      chgChip(document.getElementById(`mChg_${mk.id}`), mk.hist ? changePct(mk.hist, v.satis) : karatChangePct(), true);
    });

    // Desktop tables
    $("#homeKarats").innerHTML = karatRows(d).map((k) => `<tr><td class="k">${esc(tKarat(k.name, k.id))}</td><td class="e num">${fmt(k.try.satis)}</td><td class="e num dim">${fmt(k.try.alis)}</td><td class="e num dim">$${fmt(k.usd.satis)}</td></tr>`).join("");
    $("#homeBullions").innerHTML = (d.bullions || []).map((b) => `<tr><td class="k">${esc(tBullion(b.name, b.weight))}</td><td class="e num">${fmt(b.try.satis)}</td><td class="e num dim">${fmt(b.try.alis)}</td><td class="e num dim">$${fmt(b.usd.satis)}</td></tr>`).join("");
  }

  let sparksDrawn = false;
  function renderSparks() {
    if (!S.data) return;
    const m = S.data.market;
    const draw = !sparksDrawn;
    MKTS.forEach((mk) => {
      const el = document.getElementById(`mSpark_${mk.id}`);
      if (!el) return;
      let pts;
      if (mk.hist) pts = sparkSeries(mk.hist, m[mk.hist] && m[mk.hist].satis);
      else {
        const v = mktValue(mk, S.data);
        pts = sparkSeries("gramGold", m.gramGold.satis);
        if (pts && v) { const r = v.satis / m.gramGold.satis; pts = pts.map((x) => x * r); }
      }
      el.innerHTML = sparkSVG(pts, 120, 42, draw);
    });
    HIST_SYMS.forEach((sym) => {
      const el = document.getElementById(`tSpark_${sym}`);
      if (el) el.innerHTML = sparkSVG(sparkSeries(sym, m[sym] && m[sym].satis), 120, 40, draw);
    });
    if (Object.keys(S.histCache).length) sparksDrawn = true;
  }

  // ---------------------------------------------------------
  // BULLIONS & KARATS PAGE
  // ---------------------------------------------------------
  function priceStr(obj, side, cur, d) {
    if (!obj) return "—";
    const v = obj[cur === "USD" ? "usd" : "try"][side];
    return cur === "USD" ? `$${fmtH(v, d)}` : `${fmtH(v, d)} <small style="margin:0">${lira()}</small>`;
  }
  function renderBullions(d) {
    const list = $("#bullionList");
    const bs = d.bullions || [];
    if (list.children.length !== bs.length || list.dataset.lang !== S.lang) {
      list.dataset.lang = S.lang;
      list.innerHTML = bs.map((b) => `
        <div class="item" data-id="${b.id}">
          <div class="item__tile"><svg viewBox="0 0 40 26" aria-hidden="true"><use href="#i-bar"/></svg><span class="num">${b.weight} ${gUnit()}</span></div>
          <div style="min-width:0"><div class="item__name">${esc(tBullion(b.name, b.weight))}</div>
            <div class="item__meta"><button class="tag-edit" data-act="edit-margin" data-id="${b.id}"><svg class="ico xs"><use href="#i-pencil"/></svg><span class="tag-word">${t("makingWord")}</span> <span class="num" data-f="margin"></span></button></div></div>
          <div class="item__prices"><div class="item__sell"><small>${t("sellWord")}</small><span class="num" data-f="sell"></span></div><div class="item__buy"><small>${t("buyWord")}</small><span class="num" data-f="buy"></span></div></div>
        </div>`).join("");
    }
    const cur = S.bk.cur;
    bs.forEach((b) => {
      const card = list.querySelector(`[data-id="${b.id}"]`);
      if (!card) return;
      const pb = S.prev && S.prev.bullions ? S.prev.bullions.find((x) => x.id === b.id) : null;
      flashHTML(card.querySelector('[data-f="sell"]'), priceStr(b, "satis", cur, 2), b.try.satis, pb ? pb.try.satis : null);
      flashHTML(card.querySelector('[data-f="buy"]'), priceStr(b, "alis", cur, 2), b.try.alis, pb ? pb.try.alis : null);
      card.querySelector('[data-f="margin"]').textContent = `+${fmt(b.margin, b.margin % 1 ? 2 : 0)} ${lira()}`;
    });
  }
  function flashHTML(el, htmlStr, v, pv) {
    if (!el) return;
    el.innerHTML = htmlStr;
    if (pv !== null && pv !== undefined && Math.abs(v - pv) > 1e-6) {
      el.classList.remove("flash-up", "flash-down"); void el.offsetWidth;
      el.classList.add(v > pv ? "flash-up" : "flash-down");
    }
  }
  function renderKaratsList(d) {
    const list = $("#karatList");
    const ks = karatRows(d);
    if (list.children.length !== ks.length || list.dataset.lang !== S.lang) {
      list.dataset.lang = S.lang;
      list.innerHTML = ks.map((k) => `
        <div class="item" data-id="${k.id}">
          <div class="item__tile"><span class="big num">${k.id.replace("k", "")}</span><span>${t("karatUnit")}</span></div>
          <div style="min-width:0"><div class="item__name">${esc(tKarat(k.name, k.id))}</div><div class="item__meta"><span class="tag num">${t("purityWord")} ${k.purity}</span></div></div>
          <div class="item__prices"><div class="item__sell"><small>${t("sellWord")}</small><span class="num" data-f="sell"></span></div><div class="item__buy"><small>${t("buyWord")}</small><span class="num" data-f="buy"></span></div></div>
        </div>`).join("");
    }
    const pks = S.prev ? karatRows(S.prev) : [];
    ks.forEach((k) => {
      const card = list.querySelector(`[data-id="${k.id}"]`);
      if (!card) return;
      const pk = pks.find((x) => x.id === k.id);
      flashHTML(card.querySelector('[data-f="sell"]'), priceStr(k, "satis", S.bk.cur, 2), k.try.satis, pk ? pk.try.satis : null);
      flashHTML(card.querySelector('[data-f="buy"]'), priceStr(k, "alis", S.bk.cur, 2), k.try.alis, pk ? pk.try.alis : null);
    });
  }

  let editingBullion = null;
  function openMarginEditor(id) {
    if (!S.data) return;
    const b = (S.data.bullions || []).find((x) => x.id === id);
    if (!b) return;
    editingBullion = id;
    const bName = tBullion(b.name, b.weight);
    $("#mTitle").textContent = S.lang === "en" ? `${bName} Making Fee` : S.lang === "tr" ? `${bName} İşçiliği` : `مصنعية ${bName}`;
    $("#mInput").value = customMargins[id] !== undefined ? customMargins[id] : b.margin;
    updateMarginPreview();
    openSheet("sheetMargin");
  }
  function updateMarginPreview() {
    if (!S.data || !editingBullion) return;
    const b = S.data.bullions.find((x) => x.id === editingBullion);
    const mg = num("mInput");
    const sell = (S.data.market.gramGold.satis + mg) * b.weight;
    const lbl = S.lang === "en" ? "New selling price:" : S.lang === "tr" ? "Yeni satış fiyatı:" : "سعر البيع الجديد:";
    $("#mPreview").innerHTML = `<svg class="ico xs"><use href="#i-info"/></svg>${lbl} <b class="num">${fmt(sell)} ${lira()}</b>`;
  }
  function saveMargin() {
    if (!editingBullion) return;
    const v = parseFloat($("#mInput").value);
    customMargins[editingBullion] = isNaN(v) ? 0 : v;
    store.set("gold_custom_margins", JSON.stringify(customMargins));
    const label = editingBullion.replace("b", "");
    closeSheet("sheetMargin");
    refreshAfterMargins();
    const msg = S.lang === "en"
      ? `Saved ${label}g bullion making fee: +${customMargins[editingBullion]} TRY ✓`
      : S.lang === "tr"
      ? `${label} gr külçe işçiliği kaydedildi: +${customMargins[editingBullion]} TL ✓`
      : `تم حفظ مصنعية سبيكة ${label} جرام: +${customMargins[editingBullion]} ليرة ✓`;
    toast(msg);
  }
  function resetMargins() {
    customMargins = Object.assign({}, DEFAULT_MARGINS);
    store.del("gold_custom_margins");
    refreshAfterMargins();
    toast(t("toastMarginReset"));
  }
  function refreshAfterMargins() {
    if (!S.data) return;
    applyCustomBullionCalculations(S.data);
    const prev = S.prev; S.prev = null;
    renderBullions(S.data);
    renderPrices(S.data, null);
    renderGuest(S.data);
    renderTemplates();
    S.prev = prev;
  }

  // ---------------------------------------------------------
  // CALCULATOR — WEIGHT (sell / buy with khayas)
  // ---------------------------------------------------------
  const PURITY = { "22": 916, "21": 875, "18": 750, "14": 585 };
  const MP = {
    sell: { USD: [0, 15, 18, 20], TRY: [0, 500, 750, 1000], EUR: [0, 14, 16, 18] },
    buy: { USD: [0, 1, 2, 5], TRY: [0, 50, 100, 200], EUR: [0, 1, 2, 5] }
  };
  const MD = { sell: { USD: 15, TRY: 750, EUR: 14 }, buy: { USD: 2, TRY: 100, EUR: 2 } };
  const KNOWN_DEFAULTS = [15, 750, 14, 2, 100];
  const SYM = { USD: "$", TRY: "TL", EUR: "€" };

  function eurRate(d) {
    const u = d.market.usdTry.alis;
    return d.currencies && d.currencies.EUR ? (d.currencies.EUR.alis || d.currencies.EUR.satis) : u * 1.085;
  }
  function persistCalc() {
    store.set("nur_calc_state", JSON.stringify({ trade: S.c.trade, karat: S.c.karat, mcur: S.c.mcur, showEur: S.c.showEur, margin: $("#cMargin").value }));
  }

  function maybeDefaultMargin() {
    const inp = $("#cMargin");
    const v = parseFloat(inp.value);
    if (inp.value === "" || isNaN(v) || KNOWN_DEFAULTS.includes(v)) inp.value = MD[S.c.trade][S.c.mcur];
  }

  function renderMarginPresets() {
    const cur = S.c.mcur, sym = SYM[cur], buy = S.c.trade === "buy";
    const cv = num("cMargin");
    $("#cMarginPresets").innerHTML = MP[S.c.trade][cur].map((v) => {
      let label;
      if (v === 0) label = buy ? t("noDiscount") : t("rawGold");
      else label = cur === "TRY" ? `${buy ? "-" : ""}${v} ${lira()}` : `${buy ? "-" : ""}${sym}${v}`;
      return `<button class="chip${Math.abs(cv - v) < 0.001 ? " is-on" : ""}" data-margin="${v}">${label}</button>`;
    }).join("");
  }

  function syncTradeUI() {
    const buy = S.c.trade === "buy";
    $("#khayasWrap").classList.toggle("is-closed", !buy);
    $("#cMarginLabel").textContent = buy ? t("marginLabelBuy") : t("marginLabelSell");
    $("#cResLabel").textContent = buy ? t("resLabelBuy") : t("resLabelSell");
    $("#cDedLabel").textContent = buy ? t("dedLabelBuy") : t("dedLabelSell");
    $("#cUncutRow").hidden = !buy;
    setSegValue("trade", S.c.trade);
    setSegValue("cKarat", S.c.karat);
    setSegValue("cMcur", S.c.mcur);
    $("#cTotalEur").hidden = !S.c.showEur;
    $("#eurToggle").textContent = S.c.showEur ? t("hideEurBtn") : t("showEurBtn");
  }

  function calcWeight() {
    const buy = S.c.trade === "buy";
    const grossWeight = num("cWeight");
    const karat = S.c.karat;
    const rawMarginVal = num("cMargin");
    const khayasWeight = buy ? num("cKhayas") : 0;
    const netWeight = Math.max(0, grossWeight - khayasWeight);
    $("#cNet").textContent = `${t("netWord")}: ${fmt(netWeight)} ${gUnit()}`;
    const d = S.data;
    if (!d || !d.market) return;

    const usdKgSatis = d.market.usdKg.satis;
    const usdKgAlis = d.market.usdKg.alis;
    const usdTryAlis = d.market.usdTry.alis;
    const eurTryAlis = eurRate(d);

    // 1. Raw gold price per gram
    let rawTry = 0, rawUsd = 0, rawEur = 0;
    if (buy) {
      if (karat === "24") {
        rawTry = d.market.gramGold ? d.market.gramGold.alis : (usdKgAlis / 1000) * usdTryAlis;
        rawUsd = rawTry / usdTryAlis;
        rawEur = rawTry / eurTryAlis;
      } else {
        const purity = PURITY[karat] || 875;
        rawUsd = (usdKgAlis / 1000) * (purity / 995);
        rawTry = rawUsd * usdTryAlis;
        rawEur = rawTry / eurTryAlis;
      }
    } else {
      if (karat === "24") {
        rawTry = d.market.gramGold ? d.market.gramGold.satis : (usdKgSatis / 1000) * usdTryAlis;
        rawUsd = rawTry / usdTryAlis;
        rawEur = rawTry / eurTryAlis;
      } else {
        const purity = PURITY[karat] || 875;
        rawUsd = (usdKgSatis / 1000) * (purity / 995);
        rawTry = rawUsd * usdTryAlis;
        rawEur = rawTry / eurTryAlis;
      }
    }

    // 2. Making fee / reduction in all 3 currencies
    let mTry = 0, mUsd = 0, mEur = 0;
    if (S.c.mcur === "TRY") { mTry = rawMarginVal; mUsd = mTry / usdTryAlis; mEur = mTry / eurTryAlis; }
    else if (S.c.mcur === "EUR") { mEur = rawMarginVal; mTry = mEur * eurTryAlis; mUsd = mTry / usdTryAlis; }
    else { mUsd = rawMarginVal; mTry = mUsd * usdTryAlis; mEur = mTry / eurTryAlis; }

    // 3. Final unit price
    let ppgTry, ppgUsd, ppgEur;
    if (buy) {
      ppgTry = Math.max(0, rawTry - mTry);
      ppgUsd = Math.max(0, rawUsd - mUsd);
      ppgEur = Math.max(0, rawEur - mEur);
    } else {
      ppgTry = rawTry + mTry; ppgUsd = rawUsd + mUsd; ppgEur = rawEur + mEur;
    }

    // 4. Totals
    const effW = buy ? netWeight : grossWeight;
    const totalTry = ppgTry * effW, totalUsd = ppgUsd * effW, totalEur = ppgEur * effW;
    const uncutTry = rawTry * grossWeight, uncutUsd = rawUsd * grossWeight, uncutEur = rawEur * grossWeight;
    let dedTry, dedUsd, dedEur;
    if (buy) {
      dedTry = Math.max(0, uncutTry - totalTry); dedUsd = Math.max(0, uncutUsd - totalUsd); dedEur = Math.max(0, uncutEur - totalEur);
    } else {
      dedTry = mTry * grossWeight; dedUsd = mUsd * grossWeight; dedEur = mEur * grossWeight;
    }

    const L = S.last.weight;
    const lr = lira();
    setNum("cTotalTry", totalTry, 2, L ? L.totalTry : null);
    $("#cTotalUsd").textContent = `$${fmt(totalUsd)}`;
    $("#cTotalEur").textContent = `€${fmt(totalEur)}`;
    $("#cPerGram").textContent = `${fmt(ppgTry)} ${lr} · $${fmt(ppgUsd)}`;
    $("#cDed").textContent = `${fmt(dedTry)} ${lr} · $${fmt(dedUsd)}`;
    $("#cUncut").textContent = `${fmt(uncutTry)} ${lr}`;
    $("#cRaw").textContent = `${fmt(rawTry * effW)} ${lr}`;
    $("#cUsdRate").textContent = `${fmt(usdTryAlis, 3)} ${lr} · ${t("eurWord")} ${fmt(eurTryAlis, 3)} ${lr}`;

    S.last.weight = { buy, grossWeight, khayasWeight, netWeight, karat, margin: rawMarginVal, mcur: S.c.mcur, totalTry, totalUsd, totalEur, ppgTry, ppgUsd, dedTry, dedUsd, uncutTry, rawGramTry: rawTry };
  }

  function weightText() {
    const w = S.last.weight;
    if (!w) return "";
    if (S.lang === "en") {
      if (w.buy) {
        return `✨ *Gold Purchase Receipt - Nur Jewellery*
⚖️ Gross Weight: ${fmt(w.grossWeight)} g
💎 Stone Deduction: ${fmt(w.khayasWeight)} g (Net ${fmt(w.netWeight)} g)
👑 Karat: ${w.karat}K Gold
✂️ Rate Discount: ${w.margin} ${w.mcur} / g
💵 Net Paid: ${fmt(w.totalTry)} TRY (${fmt(w.ppgTry)} TRY / g)
💵 USD Equivalent: $${fmt(w.totalUsd)}
💶 EUR Equivalent: €${fmt(w.totalEur)}
⏱️ Calculated using live market rates.`;
      }
      return `✨ *Official Gold Quote - Nur Jewellery*
⚖️ Weight: ${fmt(w.grossWeight)} g
👑 Karat: ${w.karat}K Gold
💎 Making Fee: ${w.margin} ${w.mcur} / g
💵 Total in TRY: ${fmt(w.totalTry)} TRY (${fmt(w.ppgTry)} TRY / g)
💵 USD Equivalent: $${fmt(w.totalUsd)}
💶 EUR Equivalent: €${fmt(w.totalEur)}
⏱️ Calculated using live market rates.`;
    }
    if (S.lang === "tr") {
      if (w.buy) {
        return `✨ *Altın Alım Fişi - Nur Kuyumculuk*
⚖️ Toplam Ağırlık: ${fmt(w.grossWeight)} gr
💎 Taş / Fire Düşüşü: ${fmt(w.khayasWeight)} gr (Net ${fmt(w.netWeight)} gr)
👑 Ayar: ${w.karat} Ayar Altın
✂️ İskonto: ${w.margin} ${w.mcur} / gr
💵 Net Ödenen: ${fmt(w.totalTry)} TL (${fmt(w.ppgTry)} TL / gr)
💵 Dolar Karşılığı: $${fmt(w.totalUsd)}
💶 Euro Karşılığı: €${fmt(w.totalEur)}
⏱️ Anlık piyasa kurlarıyla hesaplanmıştır.`;
      }
      return `✨ *Resmi Altın Fiyat Teklifi - Nur Kuyumculuk*
⚖️ Ağırlık: ${fmt(w.grossWeight)} gr
👑 Ayar: ${w.karat} Ayar Altın
💎 İşçilik: ${w.margin} ${w.mcur} / gr
💵 TL Toplamı: ${fmt(w.totalTry)} TL (${fmt(w.ppgTry)} TL / gr)
💵 Dolar Karşılığı: $${fmt(w.totalUsd)}
💶 Euro Karşılığı: €${fmt(w.totalEur)}
⏱️ Anlık piyasa kurlarıyla hesaplanmıştır.`;
    }
    if (w.buy) {
      return `✨ *فاتورة شراء ذهب - مجوهرات نور*
⚖️ الوزن الإجمالي: ${fmt(w.grossWeight)} جرام
💎 الخياس المخصوم: ${fmt(w.khayasWeight)} جرام (الصافي ${fmt(w.netWeight)} جم)
👑 العيار: عيار ${w.karat}
✂️ خصم السعر: ${w.margin} ${tCur(w.mcur)} / جم
💵 صافي المدفوع: ${fmt(w.totalTry)} ليرة (${fmt(w.ppgTry)} ليرة / جم)
💵 المعادل بالدولار: $${fmt(w.totalUsd)}
💶 المعادل باليورو: €${fmt(w.totalEur)}
⏱️ تم الاحتساب بناءً على أسعار السوق اللحظية المباشرة.`;
    }
    return `✨ *تسعيرة ذهب معتمدة - مجوهرات نور*
⚖️ الوزن: ${fmt(w.grossWeight)} جرام
👑 العيار: عيار ${w.karat}
💎 المصنعية: ${w.margin} ${tCur(w.mcur)} / جم
💵 الإجمالي بالليرة: ${fmt(w.totalTry)} ليرة (${fmt(w.ppgTry)} ليرة / جم)
💵 المعادل بالدولار: $${fmt(w.totalUsd)}
💶 المعادل باليورو: €${fmt(w.totalEur)}
⏱️ تم الاحتساب بناءً على أسعار السوق اللحظية المباشرة.`;
  }

  // ---------------------------------------------------------
  // CALCULATOR — BUDGET (reverse grams)
  // ---------------------------------------------------------
  const BUDGET_PRESETS = { TRY: [10000, 25000, 50000, 100000], USD: [500, 1000, 2500, 5000], EUR: [500, 1000, 2500, 5000] };
  function renderBudgetPresets() {
    const cv = num("rBudget");
    const cLabel = S.r.bcur === "TRY" ? lira() : SYM[S.r.bcur];
    $("#rBudgetPresets").innerHTML = BUDGET_PRESETS[S.r.bcur].map((v) => `<button class="chip${Math.abs(cv - v) < 0.001 ? " is-on" : ""}" data-budget="${v}">${fmt(v, 0)} ${cLabel}</button>`).join("");
  }
  function calcBudget() {
    const d = S.data;
    if (!d || !d.market) return;
    const budget = num("rBudget");
    const karat = S.r.karat;
    const marginVal = num("rMargin");
    const usdKgSatis = d.market.usdKg.satis;
    const usdTryAlis = d.market.usdTry.alis;
    const eurTryAlis = eurRate(d);

    let rawGramTry = 0, rawGramUsd = 0, rawGramEur = 0;
    if (karat === "24") {
      rawGramTry = d.market.gramGold ? d.market.gramGold.satis : (usdKgSatis / 1000) * usdTryAlis;
      rawGramUsd = rawGramTry / usdTryAlis;
      rawGramEur = rawGramTry / eurTryAlis;
    } else {
      const purity = PURITY[karat] || 875;
      rawGramUsd = (usdKgSatis / 1000) * (purity / 995);
      rawGramTry = rawGramUsd * usdTryAlis;
      rawGramEur = eurTryAlis > 0 ? rawGramTry / eurTryAlis : rawGramUsd * 0.92;
    }

    let mTry = 0, mUsd = 0, mEur = 0;
    if (S.r.mcur === "USD") { mUsd = marginVal; mTry = marginVal * usdTryAlis; mEur = eurTryAlis > 0 ? mTry / eurTryAlis : marginVal * 0.92; }
    else if (S.r.mcur === "TRY") { mTry = marginVal; mUsd = usdTryAlis > 0 ? marginVal / usdTryAlis : 0; mEur = eurTryAlis > 0 ? marginVal / eurTryAlis : mUsd * 0.92; }
    else { mEur = marginVal; mTry = marginVal * eurTryAlis; mUsd = usdTryAlis > 0 ? mTry / usdTryAlis : marginVal * 1.085; }

    let finalPer = 0, pure = 0, mIn = 0;
    const sym = SYM[S.r.bcur];
    if (S.r.bcur === "TRY") { pure = rawGramTry; mIn = mTry; }
    else if (S.r.bcur === "USD") { pure = rawGramUsd; mIn = mUsd; }
    else { pure = rawGramEur; mIn = mEur; }
    finalPer = pure + mIn;

    const grams = finalPer > 0 && budget > 0 ? budget / finalPer : 0;
    const goldTotal = grams * pure, marginTotal = grams * mIn;
    const goldPct = budget > 0 ? (goldTotal / budget) * 100 : 0;
    const marginPct = budget > 0 ? (marginTotal / budget) * 100 : 0;

    const L = S.last.budget;
    const lr = lira();
    const gu = gUnit();
    setNum("rGrams", grams, 2, L ? L.grams : null);
    $("#rExact").textContent = grams.toFixed(4);
    const money = (v) => (S.r.bcur === "TRY" ? `${fmt(v)} ${lr}` : `${sym}${fmt(v)}`);
    $("#rPerGram").textContent = `${money(finalPer)} / ${gu}`;
    const fTry = rawGramTry + mTry, fUsd = rawGramUsd + mUsd, fEur = rawGramEur + mEur;
    $("#rPerGramOther").textContent = S.r.bcur === "TRY" ? `$${fmt(fUsd)} · €${fmt(fEur)}` : S.r.bcur === "USD" ? `${fmt(fTry)} ${lr} · €${fmt(fEur)}` : `${fmt(fTry)} ${lr} · $${fmt(fUsd)}`;
    $("#rGoldTotal").textContent = money(goldTotal);
    $("#rMarginTotal").textContent = money(marginTotal);
    $("#rGoldPct").textContent = `(${goldPct.toFixed(1)}%)`;
    $("#rMarginPct").textContent = `(${marginPct.toFixed(1)}%)`;
    $("#rBarGold").style.width = `${Math.max(0, Math.min(100, goldPct))}%`;
    $("#rBarMargin").style.width = `${Math.max(0, Math.min(100, marginPct))}%`;

    S.last.budget = { budget, bcur: S.r.bcur, karat, margin: marginVal, mcur: S.r.mcur, grams, finalPer, finalPerStr: `${money(finalPer)} / ${gu}` };
  }
  function budgetText() {
    const b = S.last.budget;
    if (!b) return "";
    const bCurLabel = b.bcur === "TRY" ? lira() : SYM[b.bcur];
    if (S.lang === "en") {
      return `✨ *Gold by Budget Quote - Nur Jewellery*
💰 Total Budget: ${fmt(b.budget, 0)} ${bCurLabel}
👑 Karat: ${b.karat}K Gold
💎 Making Fee: ${b.margin} ${b.mcur} / g
⚖️ Resulting Weight: ${b.grams.toFixed(2)} Grams (Exact: ${b.grams.toFixed(4)} g)
💵 Final Price per Gram: ${b.finalPerStr}
⏱️ Calculated using live market rates.`;
    }
    if (S.lang === "tr") {
      return `✨ *Bütçeye Göre Altın Hesabı - Nur Kuyumculuk*
💰 Toplam Bütçe: ${fmt(b.budget, 0)} ${bCurLabel}
👑 Ayar: ${b.karat} Ayar Altın
💎 İşçilik: ${b.margin} ${b.mcur} / gr
⚖️ Çıkan Gram: ${b.grams.toFixed(2)} Gram (Tam: ${b.grams.toFixed(4)} gr)
💵 Birim Gram Fiyatı: ${b.finalPerStr}
⏱️ Anlık piyasa kurlarıyla hesaplanmıştır.`;
    }
    return `✨ *تسعيرة شراء ذهب حسب الميزانية - مجوهرات نور*
💰 المبلغ الإجمالي: ${fmt(b.budget, 0)} ${bCurLabel}
👑 العيار المطلوب: عيار ${b.karat}
💎 المصنعية: ${b.margin} ${tCur(b.mcur)} / جم
⚖️ عدد الجرامات الناتج: ${b.grams.toFixed(2)} جرام (بالضبط: ${b.grams.toFixed(4)} جم)
💵 سعر الجرام النهائي: ${b.finalPerStr}
⏱️ تم الاحتساب بناءً على أسعار السوق اللحظية المباشرة.`;
  }

  // ---------------------------------------------------------
  // CALCULATOR — CURRENCY CONVERTER
  // ---------------------------------------------------------
  function calcCurrency() {
    const amount = num("xAmount");
    const fromCode = $("#xFrom").value || "USD";
    const toCode = $("#xTo").value || "TRY";
    const marginInput = num("xMargin");
    const fLbl = tCur(fromCode), tLbl = tCur(toCode);
    $("#xMarginUnit").textContent = S.x.mtype === "fixed" ? tLbl : "%";
    const currs = S.data && S.data.currencies ? S.data.currencies : null;
    if (!currs) return;
    let fromRateTry = 1, toRateTry = 1;
    if (fromCode !== "TRY" && currs[fromCode]) fromRateTry = currs[fromCode].satis || currs[fromCode].alis;
    if (toCode !== "TRY" && currs[toCode]) toRateTry = currs[toCode].alis || currs[toCode].satis;
    const rawRate = toRateTry > 0 ? fromRateTry / toRateTry : 1;
    let effectiveRate, marginPerUnit;
    if (S.x.mtype === "fixed") { effectiveRate = Math.max(0, rawRate + marginInput); marginPerUnit = marginInput; }
    else { effectiveRate = Math.max(0, rawRate * (1 + marginInput / 100)); marginPerUnit = effectiveRate - rawRate; }
    const finalTotal = amount * effectiveRate;
    const totalMargin = marginPerUnit * amount;
    $("#xTotal").innerHTML = `${fmtH(finalTotal)}<span class="cur">${tLbl}</span>`;
    $("#xRaw").textContent = `1 ${fLbl} = ${fmt(rawRate, 4)} ${tLbl}`;
    $("#xEff").textContent = `1 ${fLbl} = ${fmt(effectiveRate, 4)} ${tLbl}`;
    $("#xMarginTotal").textContent = `${fmt(totalMargin)} ${tLbl}`;
    S.last.currency = { amount, fromCode, toCode, effectiveRate, finalTotal };
  }
  function currencyText() {
    const c = S.last.currency;
    if (!c) return "";
    const fLbl = tCur(c.fromCode), tLbl = tCur(c.toCode);
    if (S.lang === "en") {
      return `💱 *Live Currency Exchange - Nur Jewellery*
━━━━━━━━━━━━━━
Amount: ${fmt(c.amount)} ${fLbl}
Applied Rate: 1 ${fLbl} = ${fmt(c.effectiveRate, 4)} ${tLbl}
Converted Total: *${fmt(c.finalTotal)} ${tLbl}*
━━━━━━━━━━━━━━
⏰ Time: ${istTime()}`;
    }
    if (S.lang === "tr") {
      return `💱 *Canlı Döviz Çevirici - Nur Kuyumculuk*
━━━━━━━━━━━━━━
Tutar: ${fmt(c.amount)} ${fLbl}
Uygulanan Kur: 1 ${fLbl} = ${fmt(c.effectiveRate, 4)} ${tLbl}
Toplam Tutar: *${fmt(c.finalTotal)} ${tLbl}*
━━━━━━━━━━━━━━
⏰ Saat: ${istTime()}`;
    }
    return `💱 *تحويل العملات المباشر - مجوهرات نور*
━━━━━━━━━━━━━━
المبلغ المطلوب: ${fmt(c.amount)} ${fLbl}
سعر الصرف المعتمد: 1 ${fLbl} = ${fmt(c.effectiveRate, 4)} ${tLbl}
المبلغ الإجمالي الناتج: *${fmt(c.finalTotal)} ${tLbl}*
━━━━━━━━━━━━━━
⏰ وقت التحويل: ${istTime()}`;
  }

  function calcAll() { calcWeight(); calcBudget(); calcCurrency(); }

  // ---------------------------------------------------------
  // SAVED QUOTES
  // ---------------------------------------------------------
  let quoteMode = "gold";
  const getQuotes = () => store.json("gold_saved_quotes", []);
  function openQuote(kind) {
    if (!S.data) return toast(t("toastWaitPrices"));
    quoteMode = kind;
    calcAll();
    let title, body;
    const lr = lira(), gu = gUnit();
    if (kind === "gold") {
      const w = S.last.weight;
      if (S.lang === "en") {
        title = `${w.buy ? "Buy" : "Quote"} ${w.karat}K (${fmt(w.grossWeight)}g)`;
        body = `<div class="quote__top"><div><b>${w.buy ? "Buy from Customer" : "Sell to Customer"}</b><span>${w.karat}K · ${fmt(w.grossWeight)}g${w.buy ? ` · Deduction ${fmt(w.khayasWeight)}g` : ""} · ${w.margin} ${w.mcur}/g</span></div></div><div class="quote__val num">${fmt(w.totalTry)} TRY<small>$${fmt(w.totalUsd)}</small></div>`;
      } else if (S.lang === "tr") {
        title = `${w.buy ? "Alış" : "Teklif"} ${w.karat} Ayar (${fmt(w.grossWeight)} gr)`;
        body = `<div class="quote__top"><div><b>${w.buy ? "Müşteriden Alış" : "Müşteriye Satış"}</b><span>${w.karat} Ayar · ${fmt(w.grossWeight)} gr${w.buy ? ` · Fire ${fmt(w.khayasWeight)} gr` : ""} · ${w.margin} ${w.mcur}/gr</span></div></div><div class="quote__val num">${fmt(w.totalTry)} TL<small>$${fmt(w.totalUsd)}</small></div>`;
      } else {
        title = `${w.buy ? "شراء" : "تسعيرة"} عيار ${w.karat} (${fmt(w.grossWeight)} ${gu})`;
        body = `<div class="quote__top"><div><b>${w.buy ? "فاتورة شراء من الزبون" : "تسعيرة بيع للزبون"}</b><span>عيار ${w.karat} · ${fmt(w.grossWeight)} ${gu}${w.buy ? ` · خياس ${fmt(w.khayasWeight)} ${gu}` : ""} · ${w.margin} ${tCur(w.mcur)}/${gu}</span></div></div><div class="quote__val num">${fmt(w.totalTry)} ${lr}<small>$${fmt(w.totalUsd)}</small></div>`;
      }
    } else {
      const b = S.last.budget;
      const bSym = b.bcur === "TRY" ? lr : SYM[b.bcur];
      if (S.lang === "en") {
        title = `Budget ${fmt(b.budget, 0)} ${bSym} (${b.karat}K)`;
        body = `<div class="quote__top"><div><b>Grams by Budget</b><span>${fmt(b.budget, 0)} ${bSym} · ${b.karat}K · ${b.margin} ${b.mcur}/g</span></div></div><div class="quote__val num">${b.grams.toFixed(2)} g<small>${b.finalPerStr}</small></div>`;
      } else if (S.lang === "tr") {
        title = `Bütçe ${fmt(b.budget, 0)} ${bSym} (${b.karat} Ayar)`;
        body = `<div class="quote__top"><div><b>Bütçeye Göre Gram</b><span>${fmt(b.budget, 0)} ${bSym} · ${b.karat} Ayar · ${b.margin} ${b.mcur}/gr</span></div></div><div class="quote__val num">${b.grams.toFixed(2)} gr<small>${b.finalPerStr}</small></div>`;
      } else {
        title = `ميزانية ${fmt(b.budget, 0)} ${bSym} (عيار ${b.karat})`;
        body = `<div class="quote__top"><div><b>حساب الجرامات بالميزانية</b><span>${fmt(b.budget, 0)} ${bSym} · عيار ${b.karat} · ${b.margin} ${tCur(b.mcur)}/${gu}</span></div></div><div class="quote__val num">${b.grams.toFixed(2)} ${gu}<small>${b.finalPerStr}</small></div>`;
      }
    }
    $("#qName").value = title;
    $("#qPreview").innerHTML = body;
    openSheet("sheetQuote");
  }
  function confirmQuote() {
    const now = new Date();
    const defTitle = S.lang === "en" ? "Gold Quote" : S.lang === "tr" ? "Altın Fiyatı" : "تسعيرة ذهب";
    const q = {
      id: "quote_" + Date.now(),
      title: ($("#qName").value || "").trim() || defTitle,
      mode: quoteMode,
      date: now.toLocaleDateString("en-GB", { timeZone: "Europe/Istanbul" }),
      time: now.toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour12: false }),
      rawGramTry: S.data && S.data.market ? S.data.market.gramGold.satis : 0
    };
    const lr = lira(), gu = gUnit();
    if (quoteMode === "gold") {
      const w = S.last.weight;
      Object.assign(q, { weight: String($("#cWeight").value), karat: w.karat, margin: String($("#cMargin").value), marginCurr: w.mcur, trade: w.buy ? "buy" : "sell", khayas: String($("#cKhayas").value), totalTry: `${fmt(w.totalTry)} ${lr}`, totalUsd: `$${fmt(w.totalUsd)}`, totalEur: `€${fmt(w.totalEur)}`, perGramTry: `${fmt(w.ppgTry)} ${lr} / ${gu}` });
    } else {
      const b = S.last.budget;
      Object.assign(q, { budget: String($("#rBudget").value), budgetCurr: b.bcur, karat: b.karat, margin: String($("#rMargin").value), marginCurr: b.mcur, grams: b.grams.toFixed(2), exactGrams: b.grams.toFixed(4), finalPerGram: b.finalPerStr });
    }
    const list = getQuotes();
    list.unshift(q);
    store.set("gold_saved_quotes", JSON.stringify(list));
    closeSheet("sheetQuote");
    renderQuotes();
    toast(t("toastQuoteSaved"));
  }
  function renderQuotes() {
    const list = getQuotes();
    $("#clearQuotesBtn").hidden = !list.length;
    if (!list.length) {
      $("#quotesList").innerHTML = `<div class="empty">${t("emptyQuotesHtml")}</div>`;
      return;
    }
    const gu = gUnit();
    $("#quotesList").innerHTML = list.map((q) => {
      const gold = q.mode === "gold";
      return `<div class="quote">
        <div class="quote__top"><div><b>${esc(q.title)}</b><span class="num">${esc(q.date)} · ${esc(q.time)}</span></div><span class="tag">${gold ? t("tagByWeight") : t("tagByBudget")}</span></div>
        <div class="quote__val num">${gold ? esc(q.totalTry) : `${esc(q.grams)} ${gu}`}<small>${gold ? esc(q.totalUsd) : esc(q.finalPerGram)}</small></div>
        <div class="quote__acts">
          <button data-act="quote-load" data-id="${esc(q.id)}"><svg class="ico xs"><use href="#i-reset"/></svg>${t("restoreBtn")}</button>
          <button data-act="quote-copy" data-id="${esc(q.id)}"><svg class="ico xs"><use href="#i-copy"/></svg>${t("copyBtn")}</button>
          <button class="del" data-act="quote-del" data-id="${esc(q.id)}"><svg class="ico xs"><use href="#i-trash"/></svg>${t("deleteBtn")}</button>
        </div></div>`;
    }).join("");
  }
  function quoteText(q) {
    if (S.lang === "en") {
      if (q.mode === "gold") {
        return `✨ *Official Gold Quote - Nur Jewellery*
📌 ${q.title}
🕒 Date: ${q.date} - ${q.time}
⚖️ Weight: ${q.weight} g
👑 Karat: ${q.karat}K Gold
💎 Making Fee: ${q.margin} ${q.marginCurr}/g
💵 Total: ${q.totalTry} (${q.perGramTry})
💵 USD Equivalent: ${q.totalUsd}
💶 EUR Equivalent: ${q.totalEur}
⏱️ Recorded from live market rates.`;
      }
      return `✨ *Gold by Budget Quote - Nur Jewellery*
📌 ${q.title}
🕒 Date: ${q.date} - ${q.time}
💰 Budget: ${q.budget} ${q.budgetCurr}
👑 Karat: ${q.karat}K Gold
💎 Making Fee: ${q.margin} ${q.marginCurr}/g
⚖️ Net Grams: ${q.grams} g (Exact: ${q.exactGrams} g)
💵 Final Price per Gram: ${q.finalPerGram}
⏱️ Recorded from live market rates.`;
    }
    if (S.lang === "tr") {
      if (q.mode === "gold") {
        return `✨ *Resmi Altın Teklifi - Nur Kuyumculuk*
📌 ${q.title}
🕒 Tarih: ${q.date} - ${q.time}
⚖️ Ağırlık: ${q.weight} gr
👑 Ayar: ${q.karat} Ayar Altın
💎 İşçilik: ${q.margin} ${q.marginCurr}/gr
💵 Toplam: ${q.totalTry} (${q.perGramTry})
💵 Dolar Karşılığı: ${q.totalUsd}
💶 Euro Karşılığı: ${q.totalEur}
⏱️ Anlık piyasa kurlarıyla kaydedilmiştir.`;
      }
      return `✨ *Bütçeye Göre Altın Teklifi - Nur Kuyumculuk*
📌 ${q.title}
🕒 Tarih: ${q.date} - ${q.time}
💰 Bütçe: ${q.budget} ${q.budgetCurr}
👑 Ayar: ${q.karat} Ayar Altın
💎 İşçilik: ${q.margin} ${q.marginCurr}/gr
⚖️ Net Gram: ${q.grams} gr (Tam: ${q.exactGrams} gr)
💵 Birim Gram Fiyatı: ${q.finalPerGram}
⏱️ Anlık piyasa kurlarıyla kaydedilmiştir.`;
    }
    if (q.mode === "gold") {
      return `✨ *تسعيرة ذهب معتمدة - مجوهرات نور*
📌 ${q.title}
🕒 التاريخ: ${q.date} - ${q.time}
⚖️ الوزن: ${q.weight} جرام
👑 العيار: عيار ${q.karat}
💎 المصنعية: ${q.margin} ${tCur(q.marginCurr)}/جم
💵 الإجمالي بالليرة: ${q.totalTry} (${q.perGramTry})
💵 المعادل بالدولار: ${q.totalUsd}
💶 المعادل باليورو: ${q.totalEur}
⏱️ تم توثيق التسعيرة حسب أسعار السوق المباشرة.`;
    }
    return `✨ *تسعيرة شراء ذهب حسب الميزانية - مجوهرات نور*
📌 ${q.title}
🕒 التاريخ: ${q.date} - ${q.time}
💰 المبلغ: ${q.budget} ${tCur(q.budgetCurr)}
👑 العيار: عيار ${q.karat}
💎 المصنعية: ${q.margin} ${tCur(q.marginCurr)}/جم
⚖️ عدد الجرامات الصافية: ${q.grams} جرام (بالضبط: ${q.exactGrams} جم)
💵 سعر الجرام النهائي: ${q.finalPerGram}
⏱️ تم توثيق التسعيرة حسب أسعار السوق المباشرة.`;
  }
  function loadQuote(id) {
    const q = getQuotes().find((x) => x.id === id);
    if (!q) return;
    go("calc");
    if (q.mode === "gold") {
      setCalcMode("weight");
      S.c.trade = q.trade === "buy" ? "buy" : "sell";
      S.c.karat = String(q.karat || "24");
      S.c.mcur = q.marginCurr || "USD";
      $("#cWeight").value = q.weight;
      $("#cMargin").value = q.margin;
      if (q.khayas !== undefined) $("#cKhayas").value = q.khayas;
      syncTradeUI(); renderMarginPresets(); calcWeight();
    } else {
      setCalcMode("budget");
      S.r.bcur = q.budgetCurr || "TRY"; S.r.mcur = q.marginCurr || "USD"; S.r.karat = String(q.karat || "21");
      $("#rBudget").value = q.budget; $("#rMargin").value = q.margin;
      setSegValue("rBcur", S.r.bcur); setSegValue("rMcur", S.r.mcur); setSegValue("rKarat", S.r.karat);
      renderBudgetPresets(); calcBudget();
    }
    const msg = S.lang === "en" ? `Restored "${q.title}" ✓` : S.lang === "tr" ? `"${q.title}" yüklendi ✓` : `تم استرجاع "${q.title}" ✓`;
    toast(msg);
  }

  // ---------------------------------------------------------
  // WHATSAPP TEMPLATES (100% localized per language)
  // ---------------------------------------------------------
  function dateEn() {
    if (S.data && S.data.formattedDate) return S.data.formattedDate;
    return new Date().toLocaleDateString("en-GB", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" });
  }
  function tplTry() {
    if (!S.data) return t("loadingPrices");
    const bs = S.data.bullions || [];
    if (S.lang === "en") {
      let out = `✨ *Bullion Prices (TRY) - Nur Jewellery* ✨\n📅 Date: ${dateEn()}\n`;
      bs.forEach((b) => { out += `${tBullion(b.name, b.weight)}: ${Math.round(b.try.satis).toLocaleString("en-US")} TRY\n`; });
      return out.trim();
    }
    if (S.lang === "tr") {
      let out = `✨ *TL Külçe Altın Fiyatları - Nur Kuyumculuk* ✨\n📅 Tarih: ${dateEn()}\n`;
      bs.forEach((b) => { out += `${tBullion(b.name, b.weight)}: ${Math.round(b.try.satis).toLocaleString("en-US")} TL\n`; });
      return out.trim();
    }
    let out = `✨ *أسعار السبائك بالليرة - مجوهرات نور* ✨\n📅 التاريخ: ${dateEn()}\n`;
    bs.forEach((b) => { out += `${tBullion(b.name, b.weight)} بـ ${Math.round(b.try.satis).toLocaleString("en-US")} ليرة\n`; });
    return out.trim();
  }
  function tplUsd() {
    if (!S.data) return t("loadingPrices");
    const bs = S.data.bullions || [];
    if (S.lang === "en") {
      let out = `✨ *Bullion Prices (USD) - Nur Jewellery* ✨\n📅 Date: ${dateEn()}\n`;
      bs.forEach((b) => { out += `${tBullion(b.name, b.weight)}: $${Number(b.usd.satis).toFixed(1)}\n`; });
      return out.trim();
    }
    if (S.lang === "tr") {
      let out = `✨ *Dolar Külçe Altın Fiyatları - Nur Kuyumculuk* ✨\n📅 Tarih: ${dateEn()}\n`;
      bs.forEach((b) => { out += `${tBullion(b.name, b.weight)}: $${Number(b.usd.satis).toFixed(1)}\n`; });
      return out.trim();
    }
    let out = `✨ *أسعار السبائك بالدولار - مجوهرات نور* ✨\n📅 التاريخ: ${dateEn()}\n`;
    bs.forEach((b) => { out += `${tBullion(b.name, b.weight)} بـ $${Number(b.usd.satis).toFixed(1)}\n`; });
    return out.trim();
  }
  function tplKarats() {
    if (!S.data) return t("loadingPrices");
    const allowed = (S.data.karats || []).filter((k) => k.name.includes("21") || k.name.includes("18") || k.id === "k21" || k.id === "k18");
    if (S.lang === "en") {
      let out = `✨ *Gold & Karat Prices - Nur Jewellery* ✨\n📅 Date: ${dateEn()}\n`;
      allowed.forEach((k) => { out += `${tKarat(k.name, k.id)}: ${Math.round(k.try.satis).toLocaleString("en-US")} TRY ($${Number(k.usd.satis).toFixed(1)})\n`; });
      return out.trim();
    }
    if (S.lang === "tr") {
      let out = `✨ *Altın ve Ayar Fiyatları - Nur Kuyumculuk* ✨\n📅 Tarih: ${dateEn()}\n`;
      allowed.forEach((k) => { out += `${tKarat(k.name, k.id)}: ${Math.round(k.try.satis).toLocaleString("en-US")} TL ($${Number(k.usd.satis).toFixed(1)})\n`; });
      return out.trim();
    }
    let out = `✨ *أسعار الذهب والعيارات - مجوهرات نور* ✨\n📅 التاريخ: ${dateEn()}\n`;
    allowed.forEach((k) => { out += `${tKarat(k.name, k.id)} بـ ${Math.round(k.try.satis).toLocaleString("en-US")} ليرة ($${Number(k.usd.satis).toFixed(1)})\n`; });
    return out.trim();
  }
  function tplAll() {
    if (!S.data) return t("loadingPrices");
    const bs = S.data.bullions || [];
    const allowed = (S.data.karats || []).filter((k) => k.name.includes("21") || k.name.includes("18") || k.id === "k21" || k.id === "k18");
    if (S.lang === "en") {
      let out = `📊 *Full Gold Market Report - Nur Jewellery* ✨\n📅 Date: ${dateEn()}\n---------------------------------\n`;
      out += `🔹 Bullion Selling Prices (TRY):\n`;
      bs.forEach((b) => { out += `• ${tBullion(b.name, b.weight)}: ${Math.round(b.try.satis).toLocaleString("en-US")} TRY\n`; });
      out += `\n🔹 Bullion Selling Prices (USD):\n`;
      bs.forEach((b) => { out += `• ${tBullion(b.name, b.weight)}: $${Number(b.usd.satis).toFixed(1)}\n`; });
      out += `\n🔹 Karat Prices per Gram (Sell):\n`;
      allowed.forEach((k) => { out += `• ${tKarat(k.name, k.id)}: ${Math.round(k.try.satis).toLocaleString("en-US")} TRY ($${Number(k.usd.satis).toFixed(1)})\n`; });
      return out.trim();
    }
    if (S.lang === "tr") {
      let out = `📊 *Tam Piyasa Raporu - Nur Kuyumculuk* ✨\n📅 Tarih: ${dateEn()}\n---------------------------------\n`;
      out += `🔹 TL Külçe Satış Fiyatları:\n`;
      bs.forEach((b) => { out += `• ${tBullion(b.name, b.weight)}: ${Math.round(b.try.satis).toLocaleString("en-US")} TL\n`; });
      out += `\n🔹 Dolar Külçe Satış Fiyatları:\n`;
      bs.forEach((b) => { out += `• ${tBullion(b.name, b.weight)}: $${Number(b.usd.satis).toFixed(1)}\n`; });
      out += `\n🔹 Gram Başı Ayar Fiyatları (Satış):\n`;
      allowed.forEach((k) => { out += `• ${tKarat(k.name, k.id)}: ${Math.round(k.try.satis).toLocaleString("en-US")} TL ($${Number(k.usd.satis).toFixed(1)})\n`; });
      return out.trim();
    }
    let out = `📊 *التقرير الكامل لأسعار الذهب - مجوهرات نور* ✨\n📅 التاريخ: ${dateEn()}\n---------------------------------\n`;
    out += `🔹 أسعار السبائك بالليرة التركية (بيع):\n`;
    bs.forEach((b) => { out += `• ${tBullion(b.name, b.weight)}: ${Math.round(b.try.satis).toLocaleString("en-US")} ليرة\n`; });
    out += `\n🔹 أسعار السبائك بالدولار (بيع):\n`;
    bs.forEach((b) => { out += `• ${tBullion(b.name, b.weight)}: $${Number(b.usd.satis).toFixed(1)}\n`; });
    out += `\n🔹 أسعار العيارات للجرام (بيع):\n`;
    allowed.forEach((k) => {
      out += `• ${tKarat(k.name, k.id)}: ${Math.round(k.try.satis).toLocaleString("en-US")} ليرة ($${Number(k.usd.satis).toFixed(1)})\n`;
    });
    return out.trim();
  }
  const TPL = { try: tplTry, usd: tplUsd, karats: tplKarats, all: tplAll };
  function renderTemplates() {
    const pre = $("#tplPreview");
    if (pre) pre.textContent = TPL[S.tpl]();
  }
  function renderSharePreviews() {
    Object.keys(TPL).forEach((k) => {
      const el = document.getElementById(`shPrev_${k}`);
      if (!el) return;
      const lines = TPL[k]().split("\n");
      el.textContent = (lines[2] || lines[1] || "").replace(/^[•\s]+/, "");
    });
  }

  // ---------------------------------------------------------
  // INDICATORS + PRO (100% localized per language)
  // ---------------------------------------------------------
  function localizeAnalysis(a) {
    if (!a) return { badge: "", advice: "", trendText: "", spreadDesc: "" };
    const s = a.score;
    const trd = a.momentum ? a.momentum.trend : "neutral";
    const pSt = a.premium ? a.premium.status : "normal";
    const sp = a.premium ? fmt(Math.abs(a.premium.spreadUsdPerKg), 0) : "0";
    const s1 = a.pivots ? fmt(a.pivots.s1, 0) : "0";
    const r1 = a.pivots ? fmt(a.pivots.r1, 0) : "0";

    if (S.lang === "en") {
      const badge = s >= 68 ? "Strong Buy Zone" : s >= 56 ? "Gradual Accumulation" : s <= 32 ? "Profit Taking / Sell" : s <= 44 ? "Wait for Pullback" : "Neutral & Balanced";
      const trendText = trd === "bullish" ? "Bullish Momentum" : trd === "bearish" ? "Selling Pressure" : "Sideways Balance";
      const spreadDesc = pSt === "discount"
        ? `Istanbul kilo is $${sp} cheaper than global spot — rare buying discount.`
        : pSt === "high_premium"
        ? `High local premium (+$${sp}/kg above global spot) due to strong domestic demand.`
        : `Normal balanced Istanbul spread (+$${sp}/kg above global spot).`;
      const advice = s >= 56
        ? `Technical indicators favor buying in tranches near the $${s1} support zone while ${trendText.toLowerCase()} holds.`
        : s <= 44
        ? `Price is approaching resistance near $${r1}. Consider taking partial profits or waiting for a pullback to $${s1}.`
        : `Market is trading in a balanced range between $${s1} support and $${r1} resistance. Ideal for steady spot trading.`;
      return { badge, advice, trendText, spreadDesc };
    }
    if (S.lang === "tr") {
      const badge = s >= 68 ? "Güçlü Alım Bölgesi" : s >= 56 ? "Kademeli Alım Fırsatı" : s <= 32 ? "Kâr Satışı / Düzeltme" : s <= 44 ? "Geri Çekilme Bekle" : "Dengeli / Nötr";
      const trendText = trd === "bullish" ? "Yükseliş Momentumu" : trd === "bearish" ? "Satış Baskısı" : "Yatay Denge";
      const spreadDesc = pSt === "discount"
        ? `İstanbul kilosu küresel fiyattan $${sp} daha ucuz — nadir alım fırsatı.`
        : pSt === "high_premium"
        ? `Yoğun yerel talep nedeniyle yüksek İstanbul primi (küresel fiyatın +$${sp}/kg üzerinde).`
        : `İstanbul makası normal dengede (küresel fiyatın +$${sp}/kg üzerinde).`;
      const advice = s >= 56
        ? `Teknik göstergeler $${s1} destek bölgesine yakın kademeli alımı destekliyor (${trendText}).`
        : s <= 44
        ? `Fiyat $${r1} direnç bölgesine yaklaşıyor. Kâr satışı düşünebilir veya $${s1} desteğine çekilmeyi bekleyebilirsiniz.`
        : `Piyasa $${s1} desteği ile $${r1} direnci arasında dengeli seyrediyor.`;
      return { badge, advice, trendText, spreadDesc };
    }
    const badge = stripEmoji(a.signalBadge);
    const trendText = a.momentum ? stripEmoji(a.momentum.trendText) : "توازن";
    const spreadDesc = a.premium ? stripEmoji(a.premium.desc) : "";
    const advice = a.summarySimple || "";
    return { badge, advice, trendText, spreadDesc };
  }

  function renderIndicators(d, p) {
    const m = d.market, pm = p ? p.market : null;
    const T = { gramGold: 2, usdKg: 0, usdTry: 3, ons: 2 };
    Object.keys(T).forEach((sym) => {
      if (!m[sym]) return;
      setNum(`tVal_${sym}`, m[sym].satis, T[sym], pm && pm[sym] ? pm[sym].satis : null);
      chgChip(document.getElementById(`tChg_${sym}`), changePct(sym, m[sym].satis), true);
    });
    if (!window.GoldAnalytics || !m.ons) return;
    const a = window.GoldAnalytics.analyze(m);
    if (!a) return;
    S.analysis = a;
    const loc = localizeAnalysis(a);
    $("#aiScore").textContent = `${a.score}%`;
    $("#gaugeBar").style.strokeDashoffset = String(326.73 * (1 - a.score / 100));
    const pill = $("#aiPill");
    pill.className = `sig-pill${a.signal === "buy" ? " buy" : a.signal === "sell" ? " sell" : ""}`;
    $("#aiPillText").textContent = loc.badge;
    $("#aiAdvice").textContent = loc.advice;
    if (a.momentum) $("#aiMomentum").textContent = loc.trendText;
    if (a.premium) $("#aiSpread").textContent = `${a.premium.spreadUsdPerKg >= 0 ? "+" : ""}${fmt(a.premium.spreadUsdPerKg, 0)} $/${t("kiloWord")}`;
    if (a.pivots) $("#aiSupport").textContent = `$${fmt(a.pivots.s1, 0)}`;
    if ($("#sheetPro").classList.contains("is-open")) renderPro();
  }

  const RUNGS_I18N = {
    ar: [
      { k: "r2", n: "مقاومة 2", act: "قمة يومية — منطقة جني أرباح، تجنّب الشراء هنا", cls: "r" },
      { k: "r1", n: "مقاومة 1", act: "حاجز صعود أول — خفّف الكميات أو انتظر اختراقاً", cls: "r" },
      { k: "pp", n: "نقطة الارتكاز", act: "نقطة التوازن — فوقها صاعد وتحتها هابط", cls: "" },
      { k: "s1", n: "دعم 1", act: "أول منطقة شراء على دفعات", cls: "s" },
      { k: "s2", n: "دعم 2", act: "قاع ارتداد قوي — أفضل سعر شراء لليوم", cls: "s" }
    ],
    en: [
      { k: "r2", n: "R2 · Resistance 2", act: "Daily ceiling — profit-taking zone, avoid buying here", cls: "r" },
      { k: "r1", n: "R1 · Resistance 1", act: "First upside barrier — trim positions or wait for breakout", cls: "r" },
      { k: "pp", n: "PP · Pivot Point", act: "Daily balance point — bullish above, bearish below", cls: "" },
      { k: "s1", n: "S1 · Support 1", act: "First zone for staged buying", cls: "s" },
      { k: "s2", n: "S2 · Support 2", act: "Strong rebound floor — best buying level of the day", cls: "s" }
    ],
    tr: [
      { k: "r2", n: "D2 · Direnç 2", act: "Günlük zirve — kâr satışı bölgesi, buradan alım yapmayın", cls: "r" },
      { k: "r1", n: "D1 · Direnç 1", act: "İlk yükseliş engeli — miktarı azaltın veya kırılım bekleyin", cls: "r" },
      { k: "pp", n: "PP · Pivot Noktası", act: "Denge noktası — üstü yükseliş, altı düşüş eğilimi", cls: "" },
      { k: "s1", n: "S1 · Destek 1", act: "Kademeli alım için ilk destek bölgesi", cls: "s" },
      { k: "s2", n: "S2 · Destek 2", act: "Güçlü tepki tabanı — günün en iyi alım seviyesi", cls: "s" }
    ]
  };
  function renderPro() {
    const a = S.analysis;
    if (!a || !a.pivots) return;
    const loc = localizeAnalysis(a);
    $("#proOns").textContent = `$${fmt(a.onsPrice, 2)}`;
    if (a.premium) {
      $("#proGlobalKilo").textContent = `$${fmt(a.premium.globalKiloPrice, 0)}`;
      $("#proLocalKilo").textContent = `$${fmt(a.premium.localKiloPrice, 0)}`;
      $("#proSpread").textContent = `${a.premium.spreadUsdPerKg >= 0 ? "+" : ""}${fmt(a.premium.spreadUsdPerKg, 0)}`;
      const b = $("#proSpreadBadge");
      if (a.premium.status === "discount") {
        b.className = "badge up";
        b.textContent = S.lang === "en" ? "Local Discount" : S.lang === "tr" ? "Yerel İndirim" : "تخفيض محلي";
      } else if (a.premium.status === "high_premium") {
        b.className = "badge down";
        b.textContent = S.lang === "en" ? "High Premium" : S.lang === "tr" ? "Yüksek Prim" : "علاوة مرتفعة";
      } else {
        b.className = "badge warn";
        b.textContent = S.lang === "en" ? "Balanced" : S.lang === "tr" ? "Dengeli" : "متوازن";
      }
      $("#proSpreadDesc").textContent = loc.spreadDesc;
    }
    $("#proRange").textContent = `$${fmt(a.pivots.low, 0)} — $${fmt(a.pivots.high, 0)}`;
    if (a.momentum) {
      const rsi = a.momentum.rsi;
      $("#proRsi").textContent = rsi;
      $("#rsiMark").style.left = `${Math.max(2, Math.min(98, rsi))}%`;
      const mb = $("#proMomBadge");
      if (a.momentum.trend === "bullish") {
        mb.className = "badge up";
        mb.textContent = S.lang === "en" ? "Bullish" : S.lang === "tr" ? "Yükseliş" : "زخم صاعد";
      } else if (a.momentum.trend === "bearish") {
        mb.className = "badge down";
        mb.textContent = S.lang === "en" ? "Bearish" : S.lang === "tr" ? "Satış Baskısı" : "ضغط بيعي";
      } else {
        mb.className = "badge warn";
        mb.textContent = S.lang === "en" ? "Neutral" : S.lang === "tr" ? "Nötr" : "حياد";
      }
      if (S.lang === "en") {
        const cond = rsi >= 70 ? "Overbought zone (peak) — potential pullback ahead." : rsi <= 30 ? "Oversold zone (bottom) — potential upward rebound." : "Normal balanced momentum range.";
        $("#proRsiText").textContent = `${cond} Trend: ${loc.trendText}.`;
      } else if (S.lang === "tr") {
        const cond = rsi >= 70 ? "Aşırı alım bölgesi (zirve) — aşağı yönlü düzeltme olasılığı." : rsi <= 30 ? "Aşırı satım bölgesi (dip) — yukarı yönlü tepki olasılığı." : "Normal dengeli hareket aralığı.";
        $("#proRsiText").textContent = `${cond} Yön: ${loc.trendText}.`;
      } else {
        const cond = rsi >= 70 ? "تشبع شرائي (قمة) — احتمال تصحيح للأسفل." : rsi <= 30 ? "تشبع بيعي (قاع) — احتمال ارتداد للأعلى." : "نطاق توازن طبيعي.";
        $("#proRsiText").textContent = `${cond} الاتجاه: ${loc.trendText}.`;
      }
    }
    const price = a.onsPrice;
    const rungList = RUNGS_I18N[S.lang] || RUNGS_I18N.ar;
    let rows = rungList.map((r) => ({ ...r, v: a.pivots[r.k] }));
    let idx = rows.findIndex((r) => price >= r.v);
    if (idx === -1) idx = rows.length;
    rows.splice(idx, 0, { now: true, v: price });
    const nowTitle = S.lang === "en" ? "Current Price" : S.lang === "tr" ? "Şu Anki Fiyat" : "السعر الآن";
    const nowDesc = S.lang === "en" ? "Live spot ounce right now" : S.lang === "tr" ? "Anlık spot ons fiyatı" : "الأونصة في هذه اللحظة";
    $("#ladder").innerHTML = rows.map((r) => r.now
      ? `<div class="rung now"><b class="lvl">${nowTitle}</b><span class="act">${nowDesc}</span><span class="px num">$${fmt(r.v, 2)}</span></div>`
      : `<div class="rung ${r.cls}"><b class="lvl">${r.n}</b><span class="act">${r.act}</span><span class="px num">$${fmt(r.v, 2)}</span></div>`).join("");
  }

  let tvLoaded = false;
  function loadTradingView(force) {
    const wrap = $("#tvWrap");
    if (!wrap || (tvLoaded && !force)) return;
    tvLoaded = true;
    const theme = html.classList.contains("dark") ? "dark" : "light";
    const tvLocale = S.lang === "ar" ? "ar_AE" : S.lang === "tr" ? "tr" : "en";
    const src = `https://s.tradingview.com/widgetembed/?frameElementId=tv_gold&symbol=OANDA%3AXAUUSD&interval=60&hidesidetoolbar=1&symboledit=0&saveimage=0&toolbarbg=f1f3f6&studies=%5B%5D&theme=${theme}&style=1&timezone=Europe%2FIstanbul&withdateranges=1&locale=${tvLocale}`;
    wrap.innerHTML = `<div class="tv-ph">${t("loadingChart")}</div><iframe title="TradingView" loading="lazy" src="${src}" allowtransparency="true" scrolling="no"></iframe>`;
  }

  // ---------------------------------------------------------
  // HISTORY SHEET (100% localized per language)
  // ---------------------------------------------------------
  function getInstr(sym) {
    const lr = lira(), gu = gUnit(), kw = t("kiloWord"), ow = t("ounceWord");
    const map = {
      ar: {
        gramGold: { title: "أرشيف جرام الذهب", unit: "جرام", cur: lr, d: 2, label: "الوزن بالجرام", def: 20, presets: [5, 10, 20, 50, 100], suf: ` ${gu}` },
        usdKg: { title: "أرشيف كيلو الذهب بالدولار", unit: "كيلو", cur: "$", d: 0, label: "الكمية بالكيلو", def: 1, presets: [1, 2, 5, 10], suf: ` ${kw}` },
        usdTry: { title: "أرشيف سعر الدولار", unit: "$", cur: lr, d: 3, label: "المبلغ بالدولار", def: 1000, presets: [100, 500, 1000, 5000], suf: "$" },
        ons: { title: "أرشيف الأونصة العالمية", unit: "أونصة", cur: "$", d: 1, label: "عدد الأونصات", def: 1, presets: [1, 5, 10, 20], suf: ` ${ow}` }
      },
      en: {
        gramGold: { title: "Gram Gold Archive", unit: "Grams", cur: lr, d: 2, label: "Weight in Grams", def: 20, presets: [5, 10, 20, 50, 100], suf: "g" },
        usdKg: { title: "USD Gold Kilo Archive", unit: "Kilo", cur: "$", d: 0, label: "Quantity in Kilos", def: 1, presets: [1, 2, 5, 10], suf: "kg" },
        usdTry: { title: "USD / TRY Rate Archive", unit: "$", cur: lr, d: 3, label: "Amount in USD", def: 1000, presets: [100, 500, 1000, 5000], suf: "$" },
        ons: { title: "Global Ounce Archive", unit: "Ounce", cur: "$", d: 1, label: "Number of Ounces", def: 1, presets: [1, 5, 10, 20], suf: "oz" }
      },
      tr: {
        gramGold: { title: "Gram Altın Arşivi", unit: "Gram", cur: lr, d: 2, label: "Gram Ağırlığı", def: 20, presets: [5, 10, 20, 50, 100], suf: " gr" },
        usdKg: { title: "Dolar Kilo Altın Arşivi", unit: "Kilo", cur: "$", d: 0, label: "Kilo Miktarı", def: 1, presets: [1, 2, 5, 10], suf: " kg" },
        usdTry: { title: "Dolar / TL Kuru Arşivi", unit: "$", cur: lr, d: 3, label: "Dolar Tutarı", def: 1000, presets: [100, 500, 1000, 5000], suf: "$" },
        ons: { title: "Küresel Ons Altın Arşivi", unit: "Ons", cur: "$", d: 1, label: "Ons Adedi", def: 1, presets: [1, 5, 10, 20], suf: " ons" }
      }
    };
    const m = map[S.lang] || map.ar;
    return m[sym] || m.gramGold;
  }
  const money = (v, c, d) => (c === "$" ? `$${fmt(v, d)}` : `${fmt(v, d)} ${c}`);

  async function openHistory(sym) {
    if (!["gramGold", "usdKg", "usdTry", "ons"].includes(sym)) sym = "gramGold";
    S.hist.sym = sym;
    const cfg = getInstr(sym);
    $("#histTitle").textContent = cfg.title;
    $("#histAmtLabel").textContent = cfg.label;
    $("#histUnit").textContent = cfg.unit;
    $("#histAmount").value = cfg.def;
    $("#histPresets").innerHTML = cfg.presets.map((v) => `<button class="chip" data-hamt="${v}">${cfg.suf === "$" ? "$" + v : v + cfg.suf}</button>`).join("");
    const dp = $("#histDate");
    const today = istDate();
    dp.max = today;
    if (!dp.value || dp.value > today) { const dt = new Date(); dt.setDate(dt.getDate() - 30); dp.value = istDate(dt); }
    openSheet("sheetHistory");
    await fetchHistory(sym);
    const s = S.histCache[sym] || [];
    if (s.length) dp.min = s[0].date;
    onHistDate();
  }
  function histFind(date) {
    const s = S.histCache[S.hist.sym] || [];
    if (!s.length) return null;
    let f = s.find((x) => x.date === date);
    if (!f) { for (let i = s.length - 1; i >= 0; i--) if (s[i].date <= date) { f = s[i]; break; } }
    return f || s[0];
  }
  function liveRate() {
    return S.data && S.data.market ? S.data.market[S.hist.sym] : null;
  }
  function onHistDate() {
    const cfg = getInstr(S.hist.sym);
    const date = $("#histDate").value;
    const f = date ? histFind(date) : null;
    const lr = liveRate();
    const side = S.hist.mode;
    if (lr) { $("#histNow").textContent = money(lr[side], cfg.cur, cfg.d); $("#histNow2").textContent = money(lr[side], cfg.cur, cfg.d); }
    if (date) {
      const dObj = new Date(date + "T12:00:00");
      const loc = S.lang === "en" ? "en-US" : S.lang === "tr" ? "tr-TR" : "ar-EG";
      if (!isNaN(dObj)) $("#histDayName").textContent = dObj.toLocaleDateString(loc, { weekday: "long" });
    }
    $$("#histQuick .chip").forEach((c) => c.classList.remove("is-on"));
    if (f && lr) {
      const then = f[side], now = lr[side], diff = now - then, pct = then > 0 ? (diff / then) * 100 : 0;
      $("#histThen").textContent = money(then, cfg.cur, cfg.d);
      const de = $("#histDiff");
      de.textContent = `${diff >= 0 ? "+" : "−"}${money(Math.abs(diff), cfg.cur, cfg.d)}`;
      de.style.color = diff >= 0 ? "var(--up)" : "var(--down)";
      $("#histPct").textContent = `${diff >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
    }
    renderChart();
    calcHistValue();
  }
  function calcHistValue() {
    const cfg = getInstr(S.hist.sym);
    const f = histFind($("#histDate").value);
    const lr = liveRate();
    if (!f || !lr) return;
    const amt = num("histAmount");
    const then = amt * f[S.hist.mode], now = amt * lr[S.hist.mode], profit = now - then, pct = then > 0 ? (profit / then) * 100 : 0;
    $("#histTotThen").textContent = money(then, cfg.cur, cfg.d);
    $("#histTotNow").textContent = money(now, cfg.cur, cfg.d);
    const pe = $("#histProfit");
    pe.textContent = `${profit >= 0 ? "+" : "−"}${money(Math.abs(profit), cfg.cur, cfg.d)}`;
    pe.style.color = profit >= 0 ? "var(--up)" : "var(--down)";
    $("#histProfitPct").textContent = `${profit >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
    $$("#histPresets .chip").forEach((c) => c.classList.toggle("is-on", Math.abs(parseFloat(c.dataset.hamt) - amt) < 1e-9));
  }
  let chartPts = [];
  function renderChart() {
    const cfg = getInstr(S.hist.sym);
    const all = S.histCache[S.hist.sym] || [];
    const box = $("#chartBox"), svg = $("#chartSvg");
    if (all.length < 2 || !box) return;
    let series = all.slice();
    const yrs = { "1Y": 1, "3Y": 3, "5Y": 5 }[S.hist.range];
    if (yrs) {
      const c = new Date(); c.setFullYear(c.getFullYear() - yrs);
      const cs = istDate(c);
      const f = series.filter((x) => x.date >= cs);
      if (f.length >= 2) series = f;
    }
    const lr = liveRate();
    const today = istDate();
    if (lr && series[series.length - 1].date !== today) series = series.concat([{ date: today, alis: lr.alis, satis: lr.satis }]);
    const W = box.clientWidth || 500, H = box.clientHeight || 210, pad = 14;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const side = S.hist.mode;
    const vals = series.map((x) => x[side]);
    const mn = Math.min(...vals), mx = Math.max(...vals), rg = mx - mn || 1;
    chartPts = series.map((x, i) => ({ x: (i / (series.length - 1)) * W, y: H - pad - ((x[side] - mn) / rg) * (H - pad * 2), date: x.date, v: x[side] }));
    let dPath = `M${chartPts[0].x} ${chartPts[0].y}`;
    for (let i = 1; i < chartPts.length; i++) { const a = chartPts[i - 1], b = chartPts[i], m2 = (a.x + b.x) / 2; dPath += ` C${m2} ${a.y},${m2} ${b.y},${b.x} ${b.y}`; }
    const sel = $("#histDate").value;
    let ap = chartPts[chartPts.length - 1];
    if (sel) { for (let i = chartPts.length - 1; i >= 0; i--) if (chartPts[i].date <= sel) { ap = chartPts[i]; break; } }
    const col = html.classList.contains("dark") ? "#F0C9AA" : "#7F3D1A";
    svg.innerHTML = `
      <defs><linearGradient id="hg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${col}" stop-opacity=".28"/><stop offset="100%" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
      <line x1="0" x2="${W}" y1="${H * 0.25}" y2="${H * 0.25}" stroke="currentColor" stroke-opacity=".07" stroke-dasharray="4 4"/>
      <line x1="0" x2="${W}" y1="${H * 0.5}" y2="${H * 0.5}" stroke="currentColor" stroke-opacity=".07" stroke-dasharray="4 4"/>
      <line x1="0" x2="${W}" y1="${H * 0.75}" y2="${H * 0.75}" stroke="currentColor" stroke-opacity=".07" stroke-dasharray="4 4"/>
      <path d="${dPath} L${W} ${H} L0 ${H} Z" fill="url(#hg)"/>
      <path d="${dPath}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="${ap.x}" x2="${ap.x}" y1="0" y2="${H}" stroke="${col}" stroke-width="1.2" stroke-dasharray="3 3" opacity=".6"/>
      <circle cx="${ap.x}" cy="${ap.y}" r="6" fill="${col}" stroke="var(--card)" stroke-width="2.5"/>
      <line id="hx" x1="-10" x2="-10" y1="0" y2="${H}" stroke="${col}" stroke-width="1.2" opacity="0"/>
      <circle id="hc" cx="-10" cy="-10" r="5" fill="${col}" stroke="var(--card)" stroke-width="2" opacity="0"/>`;
    $("#chartStart").textContent = series[0].date;
    $("#chartEnd").textContent = series[series.length - 1].date;
    $("#chartMin").textContent = money(mn, cfg.cur, cfg.d);
    $("#chartMax").textContent = money(mx, cfg.cur, cfg.d);
  }
  function chartPointAt(clientX) {
    const box = $("#chartBox");
    if (!chartPts.length) return null;
    const r = box.getBoundingClientRect();
    const rel = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    return chartPts[Math.round(rel * (chartPts.length - 1))];
  }
  function initChart() {
    const box = $("#chartBox"), tip = $("#chartTip");
    let raf = null;
    const show = (clientX) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const p = chartPointAt(clientX);
        if (!p) return;
        const cfg = getInstr(S.hist.sym);
        const hx = $("#hx"), hc = $("#hc");
        if (hx) { hx.setAttribute("x1", p.x); hx.setAttribute("x2", p.x); hx.setAttribute("opacity", ".85"); }
        if (hc) { hc.setAttribute("cx", p.x); hc.setAttribute("cy", p.y); hc.setAttribute("opacity", "1"); }
        const first = chartPts[0].v, ch = first ? ((p.v - first) / first) * 100 : 0;
        tip.innerHTML = `<span class="num">${money(p.v, cfg.cur, cfg.d)}</span><small class="num">${p.date} · ${ch >= 0 ? "+" : ""}${ch.toFixed(1)}%</small>`;
        const w = box.clientWidth;
        tip.style.left = `${Math.max(4, Math.min(w - 150, p.x - 70))}px`;
        tip.style.opacity = "1";
      });
    };
    const hide = () => {
      tip.style.opacity = "0";
      const hx = $("#hx"), hc = $("#hc");
      if (hx) hx.setAttribute("opacity", "0");
      if (hc) hc.setAttribute("opacity", "0");
    };
    box.addEventListener("pointermove", (e) => show(e.clientX));
    box.addEventListener("pointerleave", hide);
    box.addEventListener("pointerup", (e) => {
      const p = chartPointAt(e.clientX);
      if (p) { $("#histDate").value = p.date; onHistDate(); }
      if (e.pointerType !== "mouse") setTimeout(hide, 1200);
    });
  }

  // ---------------------------------------------------------
  // GUEST SCREEN
  // ---------------------------------------------------------
  const guestEnabled = () => store.get("nur_guest_mode_visible", "false") === "true";
  function syncGuestUI() {
    $("#guestRow").hidden = !guestEnabled();
    const sw = $("#admGuestSwitch");
    if (sw) { sw.classList.toggle("is-on", guestEnabled()); sw.setAttribute("aria-checked", guestEnabled() ? "true" : "false"); }
  }
  function renderGuest(d) {
    if (!document.body.classList.contains("kiosk") || !d) return;
    const m = d.market;
    const lr = lira();
    const T = [
      { n: t("heroTitle"), v: m.gramGold, d: 2, c: lr },
      { n: t("mUsdKg"), v: m.usdKg, d: 0, c: "$" },
      { n: t("mUsdTry"), v: m.usdTry, d: 3, c: lr },
      { n: t("mOns"), v: m.ons, d: 2, c: "$" }
    ];
    $("#guestTickers").innerHTML = T.map((item) => item.v ? `<div class="g-tick"><span>${item.n}</span><b class="num">${item.c === "$" ? "$" : ""}${fmtH(item.v.satis, item.d)}${item.c !== "$" ? ` <small>${item.c}</small>` : ""}</b><small class="num">${t("buyWord")} ${fmt(item.v.alis, item.d)}</small></div>` : "").join("");
    $("#guestKarats").innerHTML = karatRows(d).map((k) => `<tr><td class="k">${esc(tKarat(k.name, k.id))}</td><td class="e num">${fmt(k.try.satis)}</td><td class="e num dim">${fmt(k.try.alis)}</td><td class="e num dim">$${fmt(k.usd.satis)}</td></tr>`).join("");
    $("#guestBullions").innerHTML = (d.bullions || []).map((b) => `<tr><td class="k">${esc(tBullion(b.name, b.weight))}</td><td class="e num">${fmt(b.try.satis)}</td><td class="e num dim">${fmt(b.try.alis)}</td><td class="e num dim">$${fmt(b.usd.satis)}</td></tr>`).join("");
  }
  function enterGuest() {
    sheetStack.slice().forEach((id) => closeSheet(id));
    document.body.classList.add("kiosk");
    renderGuest(S.data);
    toast(t("toastGuestHint"));
  }
  async function exitGuest() {
    const inp = $("#exitPin"), err = $("#exitErr"), btn = $("#exitBtn");
    const pin = inp.value.trim();
    if (!pin) { err.textContent = t("errEnterPin"); shake(inp); return; }
    btn.disabled = true;
    let ok = false;
    try {
      const res = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
      const j = await res.json();
      if (res.ok && j.success) ok = true;
    } catch (e) { if (pin === "1234") ok = true; }
    btn.disabled = false;
    if (ok) {
      closeSheet("sheetExit");
      document.body.classList.remove("kiosk");
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
      go("prices", { force: true });
      toast(t("toastWelcomeBack"));
    } else {
      err.textContent = t("errWrongPin");
      shake(inp);
    }
  }
  function shake(el) { el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake"); }
  function toggleFullscreen() {
    const el = document.documentElement;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      (el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen && el.webkitRequestFullscreen());
    } else {
      (document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen && document.webkitExitFullscreen());
    }
  }

  // ---------------------------------------------------------
  // ADMIN
  // ---------------------------------------------------------
  let adminToken = null;
  try { adminToken = sessionStorage.getItem("gold_admin_token"); } catch (e) {}
  let adminPoll = null;
  const authHdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` });

  function openAdmin() {
    openSheet("sheetAdmin");
    if (adminToken) {
      fetchAdminStatus().then((ok) => {
        if (ok) showAdminPanel();
        else { adminToken = null; try { sessionStorage.removeItem("gold_admin_token"); } catch (e) {} showAdminAuth(); }
      });
    } else showAdminAuth();
  }
  function showAdminAuth() {
    $("#admAuth").hidden = false; $("#admPanel").hidden = true;
    $("#admErr").textContent = ""; $("#admPin").value = "";
    setTimeout(() => $("#admPin").focus(), 200);
  }
  function showAdminPanel() {
    $("#admAuth").hidden = true; $("#admPanel").hidden = false;
    syncGuestUI();
    fetchAdminStatus();
    stopAdminPoll();
    adminPoll = setInterval(fetchAdminStatus, 3500);
  }
  function stopAdminPoll() { if (adminPoll) { clearInterval(adminPoll); adminPoll = null; } }
  async function adminLogin() {
    const pin = $("#admPin").value.trim();
    const err = $("#admErr"), btn = $("#admLoginBtn");
    if (!pin) { err.textContent = t("errEnterPin"); shake($("#admPin")); return; }
    btn.disabled = true; err.textContent = "";
    try {
      const res = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
      const j = await res.json();
      if (res.ok && j.success) {
        adminToken = j.token;
        try { sessionStorage.setItem("gold_admin_token", adminToken); } catch (e) {}
        showAdminPanel();
        toast(t("toastAdminOpen"));
      } else { err.textContent = t("errWrongPin"); shake($("#admPin")); }
    } catch (e) { err.textContent = t("errServerConn"); }
    finally { btn.disabled = false; }
  }
  async function fetchAdminStatus() {
    if (!adminToken) return false;
    try {
      const res = await fetch("/api/admin/status", { headers: { Authorization: `Bearer ${adminToken}` } });
      if (!res.ok) return false;
      const d = await res.json();
      if (!d.success) return false;
      const onWord = S.lang === "en" ? "Online" : S.lang === "tr" ? "Bağlı" : "متصل";
      const offWord = S.lang === "en" ? "Offline" : S.lang === "tr" ? "Kesik" : "منفصل";
      const secWord = S.lang === "en" ? "s" : S.lang === "tr" ? "sn" : "ث";
      const badge = (el, on) => { el.className = `badge ${on ? "up" : "down"}`; el.textContent = on ? onWord : offWord; };
      badge($("#admPrimary"), d.primaryConnected);
      badge($("#admBackup"), d.backupConnected);
      $("#admPrimaryLag").textContent = d.lastPrimaryPacketSecondsAgo !== null && d.lastPrimaryPacketSecondsAgo !== undefined ? `${d.lastPrimaryPacketSecondsAgo} ${secWord}` : "";
      $("#admBackupLag").textContent = d.lastBackupPacketSecondsAgo !== null && d.lastBackupPacketSecondsAgo !== undefined ? `${d.lastBackupPacketSecondsAgo} ${secWord}` : "";
      const mode = d.sourceMode === "auto"
        ? (S.lang === "en" ? " (Auto)" : S.lang === "tr" ? " (Otomatik)" : " (تلقائي)")
        : (S.lang === "en" ? " (Manual)" : S.lang === "tr" ? " (Manuel)" : " (يدوي)");
      const actSrc = d.activeSource === "primary" ? t("srcPrimaryName") : d.activeSource === "backup" ? t("srcBackupName") : t("srcEmergency");
      $("#admActive").textContent = actSrc + mode;
      $("#admClients").textContent = d.clientCount;
      $("#admUptime").textContent = `${d.uptime} · ${d.memoryRssMb} MB`;
      $$("#admSrc .src-btn").forEach((b) => b.classList.toggle("is-on", b.dataset.src === d.sourceMode));
      if (Array.isArray(d.bullions)) d.bullions.forEach((b) => { const inp = document.getElementById(`adm_${b.id}`); if (inp && document.activeElement !== inp) inp.value = b.margin; });
      return true;
    } catch (e) { return false; }
  }
  async function adminPost(path, body, okMsg) {
    if (!adminToken) return null;
    try {
      const res = await fetch(path, { method: "POST", headers: authHdr(), body: JSON.stringify(body || {}) });
      const j = await res.json();
      if (j.success) { if (okMsg) toast(okMsg); fetchAdminStatus(); }
      else toast(t("errReqFailed"));
      return j;
    } catch (e) { toast(t("errServerConn")); return null; }
  }
  async function adminPing() {
    const out = $("#admPing"), btn = $("#admPingBtn");
    out.textContent = S.lang === "en" ? "Testing…" : S.lang === "tr" ? "Test ediliyor…" : "جاري الفحص…";
    btn.disabled = true;
    const j = await adminPost("/api/admin/test-ping", {});
    btn.disabled = false;
    const failTxt = S.lang === "en" ? "Ping failed" : S.lang === "tr" ? "Test başarısız" : "فشل الفحص";
    out.textContent = j && j.results ? `${t("srcPrimaryName")}: ${j.results.primarySocket} · ${t("srcBackupName")}: ${j.results.backupHost}` : failTxt;
  }
  function adminLogout() {
    if (adminToken) fetch("/api/admin/logout", { method: "POST", headers: authHdr() }).catch(() => {});
    adminToken = null;
    try { sessionStorage.removeItem("gold_admin_token"); } catch (e) {}
    stopAdminPoll();
    showAdminAuth();
    toast(t("toastLogout"));
  }

  // ---------------------------------------------------------
  // PWA
  // ---------------------------------------------------------
  let deferredPrompt = null;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = ("standalone" in navigator && navigator.standalone) || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredPrompt = e; });
  function install() {
    if (standalone) return toast(t("toastAlreadyInstalled"));
    if (isIos) return openSheet("sheetIos");
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((c) => { if (c.outcome === "accepted") toast(t("toastInstalling")); deferredPrompt = null; });
    } else toast(t("toastInstallBrowserHint"));
  }
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => {}); });
  }

  // ---------------------------------------------------------
  // Segmented control plumbing
  // ---------------------------------------------------------
  function setSegValue(name, val) {
    const seg = $(`[data-seg="${name}"]`);
    if (!seg) return;
    seg.querySelectorAll("[data-val]").forEach((b) => b.classList.toggle("is-on", b.dataset.val === String(val)));
    if (seg.classList.contains("seg")) moveSegPill(seg);
  }
  function setCalcMode(mode) {
    S.c.mode = mode;
    setSegValue("calcMode", mode);
    $$("[data-calc-view]").forEach((v) => { v.hidden = v.dataset.calcView !== mode; });
    if (mode === "weight") calcWeight(); else if (mode === "budget") calcBudget(); else calcCurrency();
  }
  function setBkView(view) {
    S.bk.view = view;
    setSegValue("bkView", view);
    $$("[data-bk]").forEach((c) => { c.hidden = c.dataset.bk !== view; });
  }

  const SEG_HANDLERS = {
    calcMode: (v) => setCalcMode(v),
    trade: (v) => { S.c.trade = v; maybeDefaultMargin(); syncTradeUI(); renderMarginPresets(); calcWeight(); persistCalc(); },
    cKarat: (v) => { S.c.karat = v; calcWeight(); persistCalc(); },
    cMcur: (v) => { S.c.mcur = v; maybeDefaultMargin(); renderMarginPresets(); calcWeight(); persistCalc(); },
    rBcur: (v) => { S.r.bcur = v; const b = num("rBudget"); if (BUDGET_PRESETS.TRY.includes(b) && v !== "TRY") $("#rBudget").value = 1000; else if (!BUDGET_PRESETS.TRY.includes(b) && v === "TRY" && BUDGET_PRESETS.USD.includes(b)) $("#rBudget").value = 50000; renderBudgetPresets(); calcBudget(); },
    rKarat: (v) => { S.r.karat = v; calcBudget(); },
    rMcur: (v) => { S.r.mcur = v; calcBudget(); },
    xMtype: (v) => { S.x.mtype = v; calcCurrency(); },
    bkView: (v) => setBkView(v),
    bkCur: (v) => { S.bk.cur = v; if (S.data) { const p = S.prev; S.prev = null; renderBullions(S.data); renderKaratsList(S.data); S.prev = p; } },
    tpl: (v) => { S.tpl = v; renderTemplates(); },
    histMode: (v) => { S.hist.mode = v; onHistDate(); },
    histRange: (v) => { S.hist.range = v; renderChart(); },
    appLang: (v) => setLanguage(v)
  };

  // ---------------------------------------------------------
  // Actions (event delegation)
  // ---------------------------------------------------------
  let logoTaps = 0, logoTimer = null;
  const ACTIONS = {
    tab: (el) => { go(el.dataset.tab); if (el.dataset.view) setBkView(el.dataset.view); },
    "open-lang": () => openSheet("sheetLang"),
    "set-lang": (el) => { setLanguage(el.dataset.lang); closeSheet("sheetLang"); },
    theme: () => toggleTheme(),
    sound: () => toggleSound(),
    "close-sheet": (el) => closeSheet(el.closest(".sheet").id),
    "open-share": () => { renderSharePreviews(); openSheet("sheetShare"); },
    "share-copy": (el) => copyText(TPL[el.dataset.tpl](), t("toastMsgCopied")),
    "share-wa": (el) => openWhatsApp(TPL[el.dataset.tpl]()),
    "open-history": (el) => openHistory(el.dataset.sym),
    "open-pro": () => { renderPro(); openSheet("sheetPro"); setTimeout(() => loadTradingView(false), 350); },
    step: (el) => {
      const inp = document.getElementById(el.dataset.target);
      const v = Math.max(0, (parseFloat(inp.value) || 0) + parseFloat(el.dataset.step));
      inp.value = Number(v.toFixed(2));
      inp.dispatchEvent(new Event("input", { bubbles: true }));
    },
    "toggle-eur": () => { S.c.showEur = !S.c.showEur; syncTradeUI(); persistCalc(); },
    "copy-calc": (el) => copyText(el.dataset.kind === "weight" ? weightText() : el.dataset.kind === "budget" ? budgetText() : currencyText(), t("toastQuoteCopied")),
    "wa-calc": (el) => openWhatsApp(el.dataset.kind === "weight" ? weightText() : el.dataset.kind === "budget" ? budgetText() : currencyText()),
    "save-quote": (el) => openQuote(el.dataset.kind),
    "confirm-quote": () => confirmQuote(),
    "quote-load": (el) => loadQuote(el.dataset.id),
    "quote-copy": (el) => { const q = getQuotes().find((x) => x.id === el.dataset.id); if (q) copyText(quoteText(q), t("toastQuoteCopied")); },
    "quote-del": (el) => { store.set("gold_saved_quotes", JSON.stringify(getQuotes().filter((x) => x.id !== el.dataset.id))); renderQuotes(); toast(t("toastQuoteDeleted")); },
    "clear-quotes": () => { if (confirm(t("confirmClearQuotes"))) { store.del("gold_saved_quotes"); renderQuotes(); toast(t("toastQuotesCleared")); } },
    "swap-cur": () => { const f = $("#xFrom"), tEl = $("#xTo"), tmp = f.value; f.value = tEl.value; tEl.value = tmp; calcCurrency(); },
    "edit-margin": (el) => openMarginEditor(el.dataset.id),
    "save-margin": () => saveMargin(),
    "reset-margins": () => resetMargins(),
    "tpl-copy": () => copyText(TPL[S.tpl](), t("toastMsgCopied")),
    "tpl-wa": () => openWhatsApp(TPL[S.tpl]()),
    install: () => install(),
    "open-admin": () => openAdmin(),
    "admin-login": () => adminLogin(),
    "admin-logout": () => adminLogout(),
    "admin-ping": () => adminPing(),
    "admin-src": (el) => {
      const m = S.lang === "en" ? `Source mode set` : S.lang === "tr" ? `Kaynak ayarlandı` : `تم ضبط المصدر`;
      adminPost("/api/admin/set-source", { mode: el.dataset.src }, m);
    },
    "admin-margins": () => {
      const margins = ["b5", "b10", "b20", "b50", "b100"].map((id) => ({ id, margin: parseFloat(document.getElementById(`adm_${id}`).value) || 0 }));
      adminPost("/api/admin/set-margins", { margins }, t("toastMarginsPublished"));
    },
    "admin-pin": async () => {
      const v = $("#admNewPin").value.trim();
      if (v.length < 4) return toast(t("toastPinMin4"));
      const j = await adminPost("/api/admin/set-pin", { newPin: v }, t("toastPinUpdated"));
      if (j && j.success) $("#admNewPin").value = "";
    },
    "admin-guest-toggle": () => {
      const on = !guestEnabled();
      store.set("nur_guest_mode_visible", on ? "true" : "false");
      syncGuestUI();
      toast(on ? t("toastGuestVisibleOn") : t("toastGuestVisibleOff"));
    },
    "admin-guest-open": () => { store.set("nur_guest_mode_visible", "true"); syncGuestUI(); enterGuest(); },
    "open-guest": () => enterGuest(),
    "guest-fs": () => toggleFullscreen(),
    "exit-guest": () => exitGuest()
  };

  function onClick(e) {
    // Segmented controls
    const segBtn = e.target.closest("[data-seg] [data-val]");
    if (segBtn) {
      const seg = segBtn.closest("[data-seg]");
      const name = seg.dataset.seg;
      if (!segBtn.classList.contains("is-on") || name === "histRange") {
        setSegValue(name, segBtn.dataset.val);
        click();
        if (SEG_HANDLERS[name]) SEG_HANDLERS[name](segBtn.dataset.val);
      }
      return;
    }
    // Preset chips
    const preset = e.target.closest("[data-presets] [data-v]");
    if (preset) {
      const inp = document.getElementById(preset.parentElement.dataset.presets);
      inp.value = preset.dataset.v;
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      click();
      return;
    }
    const mChip = e.target.closest("[data-margin]");
    if (mChip) { $("#cMargin").value = mChip.dataset.margin; $("#cMargin").dispatchEvent(new Event("input", { bubbles: true })); click(); return; }
    const bChip = e.target.closest("[data-budget]");
    if (bChip) { $("#rBudget").value = bChip.dataset.budget; $("#rBudget").dispatchEvent(new Event("input", { bubbles: true })); click(); return; }
    const hAmt = e.target.closest("[data-hamt]");
    if (hAmt) { $("#histAmount").value = hAmt.dataset.hamt; calcHistValue(); click(); return; }
    const hDays = e.target.closest("[data-days]");
    if (hDays) {
      const dt = new Date(); dt.setDate(dt.getDate() - parseInt(hDays.dataset.days, 10));
      $("#histDate").value = istDate(dt); onHistDate();
      hDays.classList.add("is-on"); click(); return;
    }
    const key = e.target.closest("#keypad [data-k]");
    if (key) {
      const inp = $("#exitPin"), k = key.dataset.k;
      $("#exitErr").textContent = "";
      if (k === "clear") inp.value = ""; else if (k === "back") inp.value = inp.value.slice(0, -1); else if (inp.value.length < 8) inp.value += k;
      click(); return;
    }
    // Logos: 5 taps → admin, 3 taps in guest → exit PIN
    const logo = e.target.closest("[data-logo], #guestLogo");
    if (logo) {
      logoTaps++;
      clearTimeout(logoTimer);
      logoTimer = setTimeout(() => { logoTaps = 0; }, 1800);
      if (logo.id === "guestLogo" && logoTaps >= 3) { logoTaps = 0; $("#exitPin").value = ""; $("#exitErr").textContent = ""; openSheet("sheetExit"); }
      else if (logo.id !== "guestLogo" && logoTaps >= 5) { logoTaps = 0; openAdmin(); }
      return;
    }
    const a = e.target.closest("[data-act]");
    if (!a) return;
    const fn = ACTIONS[a.dataset.act];
    if (fn) { if (a.dataset.act !== "sound") click(); fn(a, e); }
  }

  function initInputs() {
    ["cWeight", "cKhayas", "cMargin"].forEach((id) => $("#" + id).addEventListener("input", () => {
      calcWeight();
      if (id === "cMargin") { renderMarginPresets(); persistCalc(); }
      if (id === "cWeight") $$('[data-presets="cWeight"] .chip').forEach((c) => c.classList.toggle("is-on", parseFloat(c.dataset.v) === num("cWeight")));
    }));
    ["rBudget", "rMargin"].forEach((id) => $("#" + id).addEventListener("input", () => { calcBudget(); if (id === "rBudget") renderBudgetPresets(); }));
    ["xAmount", "xMargin"].forEach((id) => $("#" + id).addEventListener("input", calcCurrency));
    ["xFrom", "xTo"].forEach((id) => $("#" + id).addEventListener("change", calcCurrency));
    $("#mInput").addEventListener("input", () => {
      updateMarginPreview();
      $$('[data-presets="mInput"] .chip').forEach((c) => c.classList.toggle("is-on", parseFloat(c.dataset.v) === num("mInput")));
    });
    $("#histDate").addEventListener("change", onHistDate);
    $("#histAmount").addEventListener("input", calcHistValue);
    $$("input[type=number]").forEach((inp) => inp.addEventListener("focus", () => { try { inp.select(); } catch (e) {} }));
    $("#admPin").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); adminLogin(); } });
    $("#exitPin").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); exitGuest(); } });
    $("#qName").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); confirmQuote(); } });
    $("#admGuestSwitch").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ACTIONS["admin-guest-toggle"](); } });
  }

  // ---------------------------------------------------------
  // Live status, clock
  // ---------------------------------------------------------
  function setLive(connected, text) {
    S.connected = connected;
    $$("[data-live]").forEach((el) => {
      el.classList.toggle("is-off", !connected);
      el.classList.toggle("is-warn", connected && S.source === "emergency");
    });
    bind("liveText", text || (connected ? t("liveConnected") : t("liveDisconnected")));
  }
  function setSource(src) {
    if (!src) return;
    S.source = src;
    const names = {
      primary: t("sourceHarem1"),
      backup: t("sourceHarem2"),
      emergency: t("sourceEmergency")
    };
    bind("sourceName", names[src] || src);
    $$("[data-live]").forEach((el) => el.classList.toggle("is-warn", S.connected && src === "emergency"));
  }
  function tickClock() {
    bind("clock", istTime());
    if (S.lastTick) {
      const s = Math.floor((Date.now() - S.lastTick) / 1000);
      const str = s < 2
        ? t("updatedNow")
        : s < 60
        ? t("updatedSec").replace("{s}", s)
        : t("updatedMin").replace("{m}", Math.floor(s / 60));
      bind("updatedAgo", str);
    }
  }
  function pulseLive() {
    $$("[data-live]").forEach((el) => { el.classList.remove("tick"); void el.offsetWidth; el.classList.add("tick"); });
  }

  // ---------------------------------------------------------
  // Data pipeline
  // ---------------------------------------------------------
  function applyUpdate(data) {
    if (!data || !data.market || !data.market.gramGold) return;
    applyCustomBullionCalculations(data);
    S.prev = S.data;
    S.data = data;
    S.lastTick = Date.now();
    bind("seq", `#${data.seq || "—"}`);
    pulseLive();
    renderPrices(data, S.prev);
    renderBullions(data);
    renderKaratsList(data);
    renderIndicators(data, S.prev);
    calcAll();
    renderTemplates();
    if ($("#sheetShare").classList.contains("is-open")) renderSharePreviews();
    if ($("#sheetHistory").classList.contains("is-open")) { const lr = liveRate(); if (lr) { const c = getInstr(S.hist.sym); $("#histNow").textContent = money(lr[S.hist.mode], c.cur, c.d); } calcHistValue(); }
    if ($("#sheetMargin").classList.contains("is-open")) updateMarginPreview();
    renderGuest(data);
    if (Date.now() - (S._lastSpark || 0) > 3000) { S._lastSpark = Date.now(); renderSparks(); }
    if (S.prev) chime();
    if (S.first) { S.first = false; hideSplash(); }
    tickClock();
  }
  let pending = null, rafId = null;
  function schedule(data) {
    pending = data;
    if (!rafId) rafId = requestAnimationFrame(() => { rafId = null; if (pending) { applyUpdate(pending); pending = null; } });
  }

  function hideSplash() {
    const s = $("#splash");
    if (!s) return;
    s.classList.add("is-gone");
    setTimeout(() => s.remove(), 650);
  }

  function initSocket() {
    if (typeof io !== "function") { setLive(false, t("liveDisconnected")); return null; }
    const socket = io();
    socket.on("connect", () => setLive(true));
    socket.on("disconnect", () => setLive(false));
    socket.on("status_change", (st) => { setLive(!!st.connected, st.connected ? t("liveConnected") : t("liveConnecting")); if (st.source) setSource(st.source); });
    socket.on("source_change", (d) => { if (d && d.activeSource) setSource(d.activeSource); });
    socket.on("price_update", (d) => { if (d && d.source) setSource(d.source); schedule(d); });
    socket.on("gold_update", (d) => { if (d && d.source) setSource(d.source); schedule(d); });
    return socket;
  }

  // ---------------------------------------------------------
  // Boot
  // ---------------------------------------------------------
  function boot() {
    // iOS pinch/double-tap lock (inputs still usable)
    document.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false });
    let lastTouchEnd = 0;
    document.addEventListener("touchend", (e) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 350 && !["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) e.preventDefault();
      lastTouchEnd = now;
    }, { passive: false });

    setLanguage(S.lang, true);
    buildStatic();
    syncThemeUI();
    syncSoundUI();
    syncGuestUI();

    if (savedCalc.margin !== undefined && savedCalc.margin !== "") $("#cMargin").value = savedCalc.margin;
    syncTradeUI();
    renderMarginPresets();
    renderBudgetPresets();
    $$('[data-presets="cWeight"] .chip').forEach((c) => c.classList.toggle("is-on", parseFloat(c.dataset.v) === num("cWeight")));
    renderQuotes();
    initInputs();
    initSheetDrag();
    initChart();
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && sheetStack.length) closeSheet(); });
    window.addEventListener("hashchange", () => go(location.hash.replace("#", ""), { noHash: true }));
    let rz = null;
    window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { layoutPills(); if ($("#sheetHistory").classList.contains("is-open")) renderChart(); }, 120); });
    const topbar = $("#topbar");
    window.addEventListener("scroll", () => topbar.classList.toggle("is-scrolled", window.scrollY > 6), { passive: true });

    const startTab = (location.hash || "").replace("#", "");
    go(TABS.includes(startTab) ? startTab : "prices", { force: true, keepScroll: true, noHash: !TABS.includes(startTab) });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layoutPills);
    setTimeout(layoutPills, 400);

    setInterval(tickClock, 1000);
    tickClock();

    const socket = initSocket();
    fetch("/api/prices").then((r) => r.json()).then((j) => {
      if (j && j.data) { if (j.activeSource) setSource(j.activeSource); schedule(j.data); }
    }).catch(() => {});
    setInterval(async () => {
      if (socket && socket.connected) return;
      try {
        const j = await (await fetch("/api/prices")).json();
        if (j && j.data && (!S.data || j.data.seq !== S.data.seq)) schedule(j.data);
      } catch (e) {}
    }, 4000);
    Promise.all(HIST_SYMS.map(fetchHistory)).then(() => {
      if (S.data) { const p = S.prev; S.prev = null; renderPrices(S.data, null); renderIndicators(S.data, null); S.prev = p; }
      renderSparks();
    });
    setTimeout(hideSplash, 1800);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
