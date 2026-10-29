// =========================================================
// NUR JEWELLERY - AI GOLD ANALYTICS & GLOBAL MARKET ENGINE
// =========================================================

const GoldAnalytics = {
  // Historical memory for local momentum & technical metrics
  priceHistory: [],
  maxHistory: 60,

  // Record a tick of gold and currency data
  recordTick: function(market) {
    if (!market || !market.ons || !market.usdKg) return;
    const now = Date.now();
    const onsRate = parseFloat(market.ons ? (market.ons.satis || market.ons.alis) : 0) || 0;
    const usdKgRate = parseFloat(market.usdKg ? (market.usdKg.satis || market.usdKg.alis) : 0) || 0;
    const usdTryRate = parseFloat(market.usdTry ? (market.usdTry.alis || market.usdTry.satis) : 0) || 0;
    const gramTryRate = parseFloat(market.gramGold ? (market.gramGold.satis || market.gramGold.alis) : 0) || 0;

    if (onsRate > 0) {
      this.priceHistory.push({
        t: now,
        ons: onsRate,
        usdKg: usdKgRate,
        usdTry: usdTryRate,
        gramTry: gramTryRate
      });
      if (this.priceHistory.length > this.maxHistory) {
        this.priceHistory.shift();
      }
    }
  },

  // Calculate Istanbul Premium Spread ($ / kg)
  // Difference between Turkish USDKG price and London Global Spot Gold per Kilo (ONS / 31.1034768 * 1000)
  calcIstanbulPremium: function(market) {
    if (!market || !market.ons || !market.usdKg) {
      return { spreadUsdPerKg: 0, spreadPercent: 0, status: 'normal', desc: 'متوازن مع السعر العالمي' };
    }
    const onsPrice = parseFloat(market.ons.satis || market.ons.alis) || 0;
    const localKiloPrice = parseFloat(market.usdKg.satis || market.usdKg.alis) || 0;
    if (onsPrice <= 0 || localKiloPrice <= 0) {
      return { spreadUsdPerKg: 0, spreadPercent: 0, status: 'normal', desc: 'متوازن مع السعر العالمي' };
    }

    const globalKiloPrice = (onsPrice / 31.1034768) * 1000;
    const spread = localKiloPrice - globalKiloPrice;
    const spreadPct = (spread / globalKiloPrice) * 100;

    let status = 'normal';
    let desc = 'الأسعار متوازنة مع البورصة العالمية';
    if (spread > 75) {
      status = 'high_premium';
      desc = 'علاوة مرتفعة في السوق المحلي (+طلب تركي قوي)';
    } else if (spread < -40) {
      status = 'discount';
      desc = 'تخفيض في السوق المحلي (فرصة شراء ذهبية)';
    }

    return {
      globalKiloPrice: Math.round(globalKiloPrice),
      localKiloPrice: Math.round(localKiloPrice),
      spreadUsdPerKg: Math.round(spread),
      spreadPercent: parseFloat(spreadPct.toFixed(2)),
      status: status,
      desc: desc
    };
  },

  // Calculate Standard Classic Pivot Points (Support & Resistance)
  calcPivotLevels: function(market) {
    if (!market || !market.ons) return null;
    const currentOns = parseFloat(market.ons.satis || market.ons.alis) || 2700;
    // Estimate daily intraday volatility (approx 0.8% - 1.2% typical daily ATR for gold)
    const atr = currentOns * 0.009;
    const high = currentOns + (atr * 0.6);
    const low = currentOns - (atr * 0.6);
    const close = currentOns;

    const pp = (high + low + close) / 3;
    const r1 = (2 * pp) - low;
    const s1 = (2 * pp) - high;
    const r2 = pp + (high - low);
    const s2 = pp - (high - low);

    return {
      pp: parseFloat(pp.toFixed(2)),
      r1: parseFloat(r1.toFixed(2)),
      r2: parseFloat(r2.toFixed(2)),
      s1: parseFloat(s1.toFixed(2)),
      s2: parseFloat(s2.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2))
    };
  },

  // Calculate Technical Momentum (RSI & Trend Estimation)
  calcMomentum: function(market) {
    if (this.priceHistory.length < 3) {
      return { rsi: 54, trend: 'neutral', trendText: 'استقرار نسبي' };
    }
    const prices = this.priceHistory.map(p => p.ons);
    let gains = 0;
    let losses = 0;
    for (let i = 1; i < prices.length; i++) {
      const diff = prices[i] - prices[i - 1];
      if (diff >= 0) gains += diff;
      else losses += Math.abs(diff);
    }
    const avgGain = gains / (prices.length - 1);
    const avgLoss = losses / (prices.length - 1);
    let rsi = 50;
    if (avgLoss === 0) rsi = 100;
    else {
      const rs = avgGain / avgLoss;
      rsi = 100 - (100 / (1 + rs));
    }
    rsi = Math.min(95, Math.max(15, Math.round(rsi)));

    let trend = 'neutral';
    let trendText = 'تذبذب عرضي متوازن';
    if (rsi > 62) {
      trend = 'bullish';
      trendText = 'زخم شرائي صاعد 🚀';
    } else if (rsi < 38) {
      trend = 'bearish';
      trendText = 'ضغط بيعي وتصحيح 📉';
    }

    return { rsi, trend, trendText };
  },

  // AI Confluence Synthesis: combines Global Ons, Momentum, Spread, and USD Dynamics
  analyze: function(market) {
    if (!market || !market.ons) {
      return {
        score: 50,
        signal: 'neutral',
        signalBadge: 'ترقب وهدوء ⚖️',
        summarySimple: 'الأسعار في نطاق هادئ ومستقر حالياً، يُفضل المراقبة قبل اتخاذ قرارات الشراء أو البيع الكبيرة.',
        badgeColor: 'amber'
      };
    }

    this.recordTick(market);

    const momentum = this.calcMomentum(market);
    const premium = this.calcIstanbulPremium(market);
    const pivots = this.calcPivotLevels(market);
    const onsPrice = parseFloat(market.ons.satis || market.ons.alis) || 2700;

    // Scoring engine (0 - 100)
    let score = 50;

    // 1. Momentum & RSI weighting (up to +/- 20 pts)
    if (momentum.rsi >= 50) {
      score += (momentum.rsi - 50) * 0.4;
    } else {
      score -= (50 - momentum.rsi) * 0.4;
    }

    // 2. Pivot proximity (Support is buying area, resistance is selling area)
    if (pivots) {
      if (onsPrice <= pivots.s1) {
        score += 18; // Close to or below support -> strong buying opportunity
      } else if (onsPrice >= pivots.r1) {
        score -= 15; // Close to resistance -> overextended, take profit
      }
    }

    // 3. Istanbul Premium factor
    if (premium.status === 'discount') {
      score += 12; // Local gold is discounted -> buy
    } else if (premium.status === 'high_premium') {
      score -= 8; // Local gold carries excess premium
    }

    score = Math.min(96, Math.max(12, Math.round(score)));

    // Categorize signal
    let signal = 'neutral';
    let signalBadge = 'ترقب وهدوء ⚖️';
    let badgeColor = 'amber';
    let summarySimple = '';

    if (score >= 70) {
      signal = 'buy';
      signalBadge = 'فرصة شراء ذهبية 🟢';
      badgeColor = 'emerald';
      summarySimple = `السعر في منطقة طلب ممتازة وارتداد متوقع للأعلى (الزخم: ${momentum.trendText}). مناسب جداً لشراء الذهب والسبائك والتخزين.`;
    } else if (score <= 35) {
      signal = 'sell';
      signalBadge = 'منطقة جني أرباح / بيع 🔴';
      badgeColor = 'rose';
      summarySimple = `السعر يقترب من قمم ومستويات مقاومة مرتفعة. يُفضل التريث في الشراء أو بيع جزء من المخزون لجني الأرباح.`;
    } else {
      signal = 'neutral';
      signalBadge = 'استقرار وترقب 🟡';
      badgeColor = 'amber';
      summarySimple = `السعر يتحرك في مسار عرضي متوازن (${onsPrice}$ للأونصة). مناسب لعمليات البيع والشراء اليومية المعتادة دون قلق.`;
    }

    return {
      score,
      signal,
      signalBadge,
      badgeColor,
      summarySimple,
      momentum,
      premium,
      pivots,
      onsPrice
    };
  }
};

if (typeof window !== 'undefined') {
  window.GoldAnalytics = GoldAnalytics;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GoldAnalytics;
}
