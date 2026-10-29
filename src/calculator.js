const { KARATS_CONFIG } = require("./config");

let internalSequence = 1;

function parseNum(val, defaultVal = 0) {
  if (val === null || val === undefined) return defaultVal;
  if (typeof val === "number") return isNaN(val) ? defaultVal : val;
  let str = String(val).trim();
  if (!str) return defaultVal;

  if (str.includes(".") && str.includes(",")) {
    if (str.indexOf(".") < str.indexOf(",")) {
      // Turkish format: 1.234,56
      str = str.replace(/\./g, "").replace(",", ".");
    } else {
      // English format: 1,234.56
      str = str.replace(/,/g, "");
    }
  } else if (str.includes(",")) {
    const commaCount = (str.match(/,/g) || []).length;
    if (commaCount > 1) {
      str = str.replace(/,/g, "");
    } else {
      str = str.replace(",", ".");
    }
  }
  const n = parseFloat(str);
  return isNaN(n) ? defaultVal : n;
}

/**
 * Calculates karats, bullions, market indicators, and currencies
 * based on live market ticks and custom margin rules.
 */
function calculateAll(state, sourceLabel = "primary", customBullions = null, customKarats = null, forcedSeq = null) {
  if (!state || !state.USDKG || (!state.ALTIN && !state.KULCEALTIN && !state.GRAM_ALTIN && !state.GRAMALTIN) || !state.USDTRY) {
    return null;
  }

  const usdKgAlis = parseNum(state.USDKG.alis);
  const usdKgSatis = parseNum(state.USDKG.satis);

  // Gram Gold (KULCEALTIN / GRAM ALTIN / ALTIN) from Harem - Used for Bullions
  const gramGoldNode = state.KULCEALTIN || state.GRAM_ALTIN || state.GRAMALTIN || state.ALTIN;
  const gramGoldAlis = parseNum(gramGoldNode?.alis);
  const gramGoldSatis = parseNum(gramGoldNode?.satis);

  // Has Altin (ALTIN)
  const hasAltinAlis = parseNum(state.ALTIN?.alis);
  const hasAltinSatis = parseNum(state.ALTIN?.satis);

  const usdTryAlis = parseNum(state.USDTRY.alis, 1);
  const usdTrySatis = parseNum(state.USDTRY.satis, 1);

  const onsAlis = state.ONS ? parseNum(state.ONS.alis) : null;
  const onsSatis = state.ONS ? parseNum(state.ONS.satis) : null;

  if (!usdKgSatis || !gramGoldSatis || !usdTryAlis) {
    return null;
  }

  const karatsList = customKarats || KARATS_CONFIG;

  // 1. Karats calculation
  const karats = karatsList.map((k) => {
    const usdPerGramAlis = (usdKgAlis / 1000) * (k.purity / 995);
    const usdPerGramSatis = (usdKgSatis / 1000) * (k.purity / 995);

    const tryAlis = usdPerGramAlis * usdTryAlis;
    const trySatis = usdPerGramSatis * usdTryAlis;

    return {
      id: k.id,
      name: k.name,
      purity: k.purity,
      usd: {
        alis: Number(usdPerGramAlis.toFixed(2)),
        satis: Number(usdPerGramSatis.toFixed(2))
      },
      try: {
        alis: Number(tryAlis.toFixed(2)),
        satis: Number(trySatis.toFixed(2))
      }
    };
  });

  // 2. Bullions calculation: strictly from Gram Gold with zero margin buying
  const bullionsList = customBullions || [
    { id: "b5", weight: 5, margin: 20, name: "سبيكة 5 جرام" },
    { id: "b10", weight: 10, margin: 20, name: "سبيكة 10 جرام" },
    { id: "b20", weight: 20, margin: 10, name: "سبيكة 20 جرام" },
    { id: "b50", weight: 50, margin: 0, name: "سبيكة 50 جرام" },
    { id: "b100", weight: 100, margin: 0, name: "سبيكة 100 جرام" }
  ];

  const bullions = bullionsList.map((b) => {
    const satisTry = (gramGoldSatis + (b.margin || 0)) * b.weight;
    const alisTry = gramGoldAlis * b.weight; // Strict Harem Gram Gold buy price (zero margin)

    const satisUsd = satisTry / usdTryAlis;
    const alisUsd = alisTry / usdTryAlis;

    return {
      id: b.id,
      name: b.name,
      weight: b.weight,
      margin: b.margin || 0,
      try: {
        satis: Number(satisTry.toFixed(2)),
        alis: Number(alisTry.toFixed(2))
      },
      usd: {
        satis: Number(satisUsd.toFixed(2)),
        alis: Number(alisUsd.toFixed(2))
      }
    };
  });

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-GB", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const timeStr = now.toLocaleTimeString("en-GB", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const seq = typeof forcedSeq === "number" ? forcedSeq : ++internalSequence;

  return {
    seq,
    source: sourceLabel,
    timestamp: now.toISOString(),
    formattedDate: dateStr,
    formattedTime: timeStr,
    market: {
      usdKg: { alis: usdKgAlis, satis: usdKgSatis },
      gramGold: { alis: gramGoldAlis, satis: gramGoldSatis },
      hasAltin: { alis: hasAltinAlis, satis: hasAltinSatis },
      usdTry: { alis: usdTryAlis, satis: usdTrySatis },
      ons: { alis: onsAlis, satis: onsSatis }
    },
    karats,
    bullions,
    currencies: {
      USD: { name: "دولار أمريكي (USD)", code: "USD", alis: usdTryAlis, satis: usdTrySatis },
      EUR: { name: "يورو أوروبي (EUR)", code: "EUR", alis: parseNum(state.EURTRY?.alis, 53.12), satis: parseNum(state.EURTRY?.satis, 53.35) },
      GBP: { name: "جنيه إسترليني (GBP)", code: "GBP", alis: parseNum(state.GBPTRY?.alis, 62.45), satis: parseNum(state.GBPTRY?.satis, 62.75) },
      SAR: { name: "ريال سعودي (SAR)", code: "SAR", alis: parseNum(state.SARTRY?.alis, 13.01), satis: parseNum(state.SARTRY?.satis, 13.08) },
      AED: { name: "درهم إماراتي (AED)", code: "AED", alis: parseNum(state.AEDTRY?.alis, 13.28), satis: parseNum(state.AEDTRY?.satis, 13.34) },
      KWD: { name: "دينار كويتي (KWD)", code: "KWD", alis: parseNum(state.KWDTRY?.alis, 158.4), satis: parseNum(state.KWDTRY?.satis, 159.2) },
      TRY: { name: "ليرة تركية (TRY)", code: "TRY", alis: 1, satis: 1 }
    }
  };
}

module.exports = {
  calculateAll
};
