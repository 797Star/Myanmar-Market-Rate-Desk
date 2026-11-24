import type {
  CommodityQuote,
  CurrencyQuote,
  DailyDigest,
  GoldQuote,
  InflationBasketItem,
  MarketSession,
  ParityCheckStatus,
  PipelineMeta,
  TownshipBreakdownEntry,
  TownshipConsensusAssetSummary,
  TownshipMarketReport,
  TrustedGoldShopQuote,
} from '../types.ts';

const OZ_PER_KYATTHA_SHARED = 16.3293 / 31.1034768;

export const MYANMAR_TOWNSHIPS: string[] = [
  'Yangon - Downtown / Shwebontha',
  'Yangon - Hledan / Sanchaung',
  'Yangon - Thingangyun / Insein',
  'Mandalay - Zegyo / Chanayethazan',
  'Naypyidaw',
  'Muse (Border)',
  'Myawaddy (Border)',
  'Taunggyi',
  'Mawlamyine',
  'Pathein',
  'Bago',
];

export const ASSET_NUMERIC_BOUNDS: Record<
  'gold' | 'currency' | 'commodity',
  { min: number; max: number }
> = {
  gold: { min: 1500, max: 50000000 },
  currency: { min: 8, max: 25000 },
  commodity: { min: 500, max: 1000000 },
};

export function getSpecificAssetBounds(
  assetType: 'gold' | 'currency' | 'commodity',
  assetId: string
): { min: number; max: number } {
  if (assetType === 'currency') {
    switch (assetId) {
      case 'USD':
        return { min: 1500, max: 25000 };
      case 'THB':
        return { min: 40, max: 600 };
      case 'SGD':
        return { min: 1000, max: 15000 };
      case 'EUR':
        return { min: 1500, max: 25000 };
      case 'MYR':
        return { min: 300, max: 4500 };
      case 'CNY':
        return { min: 200, max: 2500 };
      case 'JPY':
        return { min: 8, max: 2000 };
      default:
        return ASSET_NUMERIC_BOUNDS.currency;
    }
  }
  if (assetType === 'gold') {
    switch (assetId) {
      case 'gold-24k':
        return { min: 2000000, max: 50000000 };
      case 'gold-15pe':
        return { min: 1500000, max: 45000000 };
      case 'gold-ygea-ref':
        return { min: 1500000, max: 30000000 };
      case 'gold-world-spot':
        return { min: 1200, max: 12000 };
      default:
        return ASSET_NUMERIC_BOUNDS.gold;
    }
  }
  return ASSET_NUMERIC_BOUNDS.commodity;
}

export function isRateWithinBounds(
  assetType: 'gold' | 'currency' | 'commodity',
  assetId: string,
  rate: number
): boolean {
  if (!Number.isFinite(rate) || rate <= 0) return false;
  const { min, max } = getSpecificAssetBounds(assetType, assetId);
  return rate >= min && rate <= max;
}

export function computeMedian(values: number[]): number | null {
  const valid = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (valid.length === 0) return null;
  const mid = Math.floor(valid.length / 2);
  if (valid.length % 2 === 1) return valid[mid];
  return (valid[mid - 1] + valid[mid]) / 2;
}

export function computeTrimmedMedian(
  values: number[],
  deviationThreshold = 0.12
): { median: number | null; kept: number[]; rejected: number[] } {
  const valid = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (valid.length === 0) {
    return { median: null, kept: [], rejected: [] };
  }
  if (valid.length < 3) {
    return { median: computeMedian(valid), kept: valid, rejected: [] };
  }

  const initialMedian = computeMedian(valid)!;
  const kept: number[] = [];
  const rejected: number[] = [];
  for (const val of valid) {
    const relDiff = Math.abs(val - initialMedian) / initialMedian;
    if (relDiff <= deviationThreshold) {
      kept.push(val);
    } else {
      rejected.push(val);
    }
  }

  if (kept.length === 0) {
    return { median: initialMedian, kept: valid, rejected: [] };
  }
  return {
    median: computeMedian(kept),
    kept,
    rejected,
  };
}

export function computeImpliedXauParityMmk(
  xauUsdSpot: number | null | undefined,
  streetUsdSell: number
): number | null {
  if (
    typeof xauUsdSpot !== 'number' ||
    !Number.isFinite(xauUsdSpot) ||
    xauUsdSpot <= 0 ||
    !Number.isFinite(streetUsdSell) ||
    streetUsdSell <= 0
  ) {
    return null;
  }
  return Math.round(xauUsdSpot * OZ_PER_KYATTHA_SHARED * streetUsdSell);
}

export function evaluateGoldParityStatus(
  gold24kRate: number,
  impliedParityMmk: number | null
): { status: ParityCheckStatus; deviationPercent: number | null } {
  if (!impliedParityMmk || impliedParityMmk <= 0 || !Number.isFinite(gold24kRate) || gold24kRate <= 0) {
    return { status: 'unavailable', deviationPercent: null };
  }
  const deviationRatio = (gold24kRate - impliedParityMmk) / impliedParityMmk;
  const deviationPercent = Number((deviationRatio * 100).toFixed(1));
  if (deviationRatio >= -0.10 && deviationRatio <= 0.18) {
    return { status: 'aligned', deviationPercent };
  }
  if (deviationRatio >= -0.15 && deviationRatio <= 0.28) {
    return { status: 'premium', deviationPercent };
  }
  return { status: 'flagged', deviationPercent };
}

export function aggregateTownshipConsensus(
  reports: TownshipMarketReport[],
  nowMs: number = Date.now()
): Map<string, TownshipConsensusAssetSummary> {
  const cutoffMs = nowMs - 24 * 60 * 60 * 1000;
  const freshReports = reports.filter(
    (r) =>
      r &&
      Number.isFinite(r.reportedRate) &&
      r.reportedRate > 0 &&
      (r.createdAtMs === 0 || r.createdAtMs >= cutoffMs)
  );

  // Deduplicate by (userId + assetType + assetId), keeping newest report per user
  const latestPerUserAsset = new Map<string, TownshipMarketReport>();
  for (const r of freshReports) {
    const dedupeKey = `${r.userId}:${r.assetType}:${r.assetId}`;
    const prev = latestPerUserAsset.get(dedupeKey);
    if (!prev || r.createdAtMs >= prev.createdAtMs) {
      latestPerUserAsset.set(dedupeKey, r);
    }
  }

  const byAsset = new Map<string, TownshipMarketReport[]>();
  for (const r of latestPerUserAsset.values()) {
    const key = `${r.assetType}:${r.assetId}`;
    const list = byAsset.get(key) || [];
    list.push(r);
    byAsset.set(key, list);
  }

  const result = new Map<string, TownshipConsensusAssetSummary>();
  for (const [assetKey, list] of byAsset.entries()) {
    const first = list[0];
    const rates = list.map((item) => item.reportedRate);
    const { median, rejected } = computeTrimmedMedian(rates, 0.12);
    if (median === null) continue;

    // Group by township
    const byTownship = new Map<string, TownshipMarketReport[]>();
    for (const item of list) {
      const tw = byTownship.get(item.township) || [];
      tw.push(item);
      byTownship.set(item.township, tw);
    }

    const townships: TownshipBreakdownEntry[] = [];
    for (const [township, entries] of byTownship.entries()) {
      const twMed = computeTrimmedMedian(
        entries.map((e) => e.reportedRate),
        0.15
      ).median;
      if (twMed !== null) {
        townships.push({
          township,
          medianRate:
            first.assetType === 'currency' && (first.assetId === 'THB' || first.assetId === 'CNY' || first.assetId === 'JPY')
              ? Number(twMed.toFixed(1))
              : Math.round(twMed),
          count: entries.length,
          latestAtMs: Math.max(...entries.map((e) => e.createdAtMs || nowMs)),
        });
      }
    }
    townships.sort((a, b) => b.count - a.count || b.latestAtMs - a.latestAtMs);

    const roundedMedian =
      first.assetType === 'currency' &&
      (first.assetId === 'THB' || first.assetId === 'CNY' || first.assetId === 'JPY')
        ? Number(median.toFixed(1))
        : Math.round(median);

    result.set(assetKey, {
      assetType: first.assetType,
      assetId: first.assetId,
      medianRate: roundedMedian,
      reportCount: list.length,
      filteredOutlierCount: rejected.length,
      townships,
      latestUpdatedAtMs: Math.max(...list.map((e) => e.createdAtMs || nowMs)),
    });
  }

  return result;
}

const MM_MONTHS = [
  'ဇန်နဝါရီ',
  'ဖေဖော်ဝါရီ',
  'မတ်',
  'ဧပြီ',
  'မေ',
  'ဇွန်',
  'ဇူလိုင်',
  'ဩဂုတ်',
  'စက်တင်ဘာ',
  'အောက်တိုဘာ',
  'နိုဝင်ဘာ',
  'ဒီဇင်ဘာ',
];

function getYangonDateParts(date: Date = new Date()): {
  year: number;
  monthIndex: number;
  day: number;
  hour: number;
  minute: number;
} {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Yangon',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    }).formatToParts(date);

    const lookup = (type: string) =>
      Number(parts.find((p) => p.type === type)?.value || '0');

    return {
      year: lookup('year') || date.getUTCFullYear(),
      monthIndex: Math.max(0, (lookup('month') || date.getUTCMonth() + 1) - 1),
      day: lookup('day') || date.getUTCDate(),
      hour: lookup('hour') % 24,
      minute: lookup('minute'),
    };
  } catch {
    return {
      year: date.getUTCFullYear(),
      monthIndex: date.getUTCMonth(),
      day: date.getUTCDate(),
      hour: (date.getUTCHours() + 6) % 24,
      minute: date.getUTCMinutes(),
    };
  }
}

export function getCurrentYangonSession(date: Date = new Date()): MarketSession {
  const { hour } = getYangonDateParts(date);
  return hour < 13 ? 'morning' : 'evening';
}

export function formatYangonDateMm(date: Date = new Date()): string {
  const { year, monthIndex, day } = getYangonDateParts(date);
  const monthName = MM_MONTHS[monthIndex] || MM_MONTHS[0];
  return `${year} ခုနှစ်၊ ${monthName} ${day} ရက်`;
}

export function formatYangonTime12h(dateInput?: string | Date | null): string {
  const dateObj = dateInput ? new Date(dateInput) : new Date();
  const safeDate = Number.isNaN(dateObj.getTime()) ? new Date() : dateObj;
  try {
    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Yangon',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(safeDate);
    return `${formatted} MMT`;
  } catch {
    return `${safeDate.toISOString().slice(11, 16)} UTC`;
  }
}

export function formatExactYangonTimestamp(dateInput?: string | Date | null): string {
  const dateObj = dateInput ? new Date(dateInput) : new Date();
  const safeDate = Number.isNaN(dateObj.getTime()) ? new Date() : dateObj;
  try {
    const formatted = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Yangon',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(safeDate);
    return `${formatted} MMT`;
  } catch {
    return `${safeDate.toISOString().replace('T', ' ').slice(0, 19)} UTC`;
  }
}

export function calcSpread(
  marketRate: number,
  officialRate: number
): { spreadAmount: number; spreadPercent: number } {
  const spreadAmount = Number((marketRate - officialRate).toFixed(2));
  const spreadPercent =
    officialRate > 0 ? Number(((spreadAmount / officialRate) * 100).toFixed(1)) : 0;
  return { spreadAmount, spreadPercent };
}

export function applyGoldOverrides(
  quotes: GoldQuote[],
  overrides: Map<string, number>
): GoldQuote[] {
  if (overrides.size === 0) return quotes;
  return quotes.map((g) => {
    const override = overrides.get(g.id);
    if (typeof override !== 'number') return g;
    return {
      ...g,
      marketRate: override,
      ...calcSpread(override, g.officialRate),
    };
  });
}

export function applyCurrencyOverrides(
  quotes: CurrencyQuote[],
  overrides: Map<string, number>
): CurrencyQuote[] {
  if (overrides.size === 0) return quotes;
  return quotes.map((c) => {
    const override = overrides.get(c.code);
    if (typeof override !== 'number') return c;
    return {
      ...c,
      marketSellRate: override,
      ...calcSpread(override, c.cbmOfficialRate),
    };
  });
}

export function applyCommodityOverrides(
  quotes: CommodityQuote[],
  overrides: Map<string, number>
): CommodityQuote[] {
  if (overrides.size === 0) return quotes;
  return quotes.map((cm) => {
    const override = overrides.get(cm.id);
    if (typeof override !== 'number') return cm;
    const { spreadPercent } = calcSpread(override, cm.officialRefRate);
    return {
      ...cm,
      openMarketRate: override,
      spreadPercent,
    };
  });
}

export function switchGoldSession(
  quotes: GoldQuote[],
  session: MarketSession
): GoldQuote[] {
  return quotes.map((g) => {
    const nextRate = session === 'morning' ? g.morningRate : g.eveningRate;
    return {
      ...g,
      marketRate: nextRate,
      ...calcSpread(nextRate, g.officialRate),
    };
  });
}

export function switchCurrencySession(
  quotes: CurrencyQuote[],
  session: MarketSession
): CurrencyQuote[] {
  return quotes.map((c) => {
    const nextRate = session === 'morning' ? c.morningRate : c.eveningRate;
    return {
      ...c,
      marketSellRate: nextRate,
      ...calcSpread(nextRate, c.cbmOfficialRate),
    };
  });
}

export function switchCommoditySession(
  quotes: CommodityQuote[],
  session: MarketSession
): CommodityQuote[] {
  return quotes.map((cm) => {
    const nextRate = session === 'morning' ? cm.morningRate : cm.eveningRate;
    const { spreadPercent } = calcSpread(nextRate, cm.officialRefRate);
    return {
      ...cm,
      openMarketRate: nextRate,
      spreadPercent,
    };
  });
}

export function syncBasketWithCommodities(
  basket: InflationBasketItem[],
  commodities: CommodityQuote[]
): InflationBasketItem[] {
  const byId = new Map(commodities.map((c) => [c.id, c]));
  const mapping: Record<string, string> = {
    'b-rice': 'rice-shwebo',
    'b-oil': 'oil-palm',
    'b-peanut-oil': 'oil-peanut',
    'b-fuel': 'fuel-92',
  };

  return basket.map((item) => {
    const commodityId = mapping[item.id];
    const source = commodityId ? byId.get(commodityId) : undefined;
    if (!source) return item;
    return {
      ...item,
      unitPriceOfficial: source.officialRefRate,
      unitPriceMarket: source.openMarketRate,
    };
  });
}

export function buildLiveDigestSnapshot(params: {
  session: MarketSession;
  goldQuotes: GoldQuote[];
  currencyQuotes: CurrencyQuote[];
  commodityQuotes: CommodityQuote[];
  trustedGoldShops: TrustedGoldShopQuote[];
  pipelineMeta: PipelineMeta | null;
  aiGenerated?: boolean;
}): DailyDigest {
  const {
    session,
    goldQuotes,
    currencyQuotes,
    commodityQuotes,
    trustedGoldShops,
    pipelineMeta,
    aiGenerated = false,
  } = params;

  const gold24k = goldQuotes.find((g) => g.id === 'gold-24k');
  const worldGold = goldQuotes.find((g) => g.id === 'gold-world-spot');
  const usd = currencyQuotes.find((c) => c.code === 'USD');
  const thb = currencyQuotes.find((c) => c.code === 'THB');
  const fuel92 = commodityQuotes.find((cm) => cm.id === 'fuel-92');
  const palmOil = commodityQuotes.find((cm) => cm.id === 'oil-palm');
  const shwebo = commodityQuotes.find((cm) => cm.id === 'rice-shwebo');
  const wrRate = pipelineMeta?.workerRemittanceUsd;

  const marketGoldLabel =
    pipelineMeta?.trustedGoldAnchorShop || 'ရန်ကုန်/မန္တလေး ပြင်ပရွှေဈေးကွက် (Open Market)';

  const goldRate = gold24k?.marketRate || 10290000;
  const goldOfficial = gold24k?.officialRate || 7100000;
  const goldSpread = gold24k?.spreadPercent ?? 44.9;
  const usdRate = usd?.marketSellRate || 4490;
  const usdOfficial = usd?.cbmOfficialRate || 2100;
  const usdSpread = usd?.spreadPercent ?? 113.8;
  const palmOfficial = palmOil?.officialRefRate || 6580;
  const palmMarket = palmOil?.openMarketRate || 13500;
  const palmSpread = palmOil?.spreadPercent ?? 105.2;
  const fuelOfficial = fuel92?.officialRefRate || 3045;
  const fuelMarket = fuel92?.openMarketRate || 3350;
  const fuelSpread = fuel92?.spreadPercent ?? 10;

  return {
    date: formatYangonDateMm(),
    session,
    headlineMm: `ပြင်ပဈေးကွက် 16 ပဲရည်ရွှေ ${goldRate.toLocaleString()} Ks နှင့် USD ${usdRate.toLocaleString()} Ks (${session === 'morning' ? 'မနက်ပိုင်း' : 'ညနေပိုင်း'})`,
    headlineEn: `Open-market 24K gold at ${goldRate.toLocaleString()} Ks & USD ${usdRate.toLocaleString()} Ks (${session} session)`,
    keyPointsMm: [
      `ရွှေဈေး (16 ပဲရည်): ${marketGoldLabel} တွင် ${goldRate.toLocaleString()} Ks (ကမ္ဘာ့ရွှေ $${(worldGold?.marketRate || 3900).toLocaleString()}/oz) ရှိပြီး YGEA တရားဝင် ရည်ညွှန်းနှုန်း ${goldOfficial.toLocaleString()} Ks ထက် +${goldSpread}% ကွာဟနေ။`,
      `နိုင်ငံခြားငွေ (USD): ပြင်ပဈေးကွက်တွင် ${usdRate.toLocaleString()} Ks (THB ${thb?.marketSellRate ?? 132.5} Ks) ရှိပြီး CBM တရားဝင် ရည်ညွှန်းနှုန်း (${usdOfficial.toLocaleString()} Ks) ထက် +${usdSpread}% ကွာဟနေ${wrRate ? ` (Bank Online ${(usd?.onlineTradingRate || 3670).toLocaleString()} Ks / WR ${wrRate.toLocaleString()} Ks)` : ''}။`,
      `စားအုန်းဆီ (1 ပိဿာ): DOCA တရားဝင် ရည်ညွှန်းနှုန်း ${palmOfficial.toLocaleString()} Ks ရှိပြီး ပြင်ပဈေးကွက်တွင် ${palmMarket.toLocaleString()} Ks (+${palmSpread}%) ရှိနေ။`,
      `စက်သုံးဆီ (Octane 92): PPRD တရားဝင် ရည်ညွှန်းနှုန်း ${fuelOfficial.toLocaleString()} Ks ရှိပြီး ပြင်ပဈေးကွက်တွင် ${fuelMarket.toLocaleString()} Ks/L (+${fuelSpread}%) နှင့် ရွှေဘိုပေါ်ဆန်း ${(shwebo?.openMarketRate || 178000).toLocaleString()} Ks/အိတ် ရှိနေ။`,
    ],
    spreadAnalysisMm: `တရားဝင် ရည်ညွှန်းနှုန်းနှင့် ပြင်ပဈေးကွက်အကြား ကွာဟချက် (Spread) သည် 16 ပဲရည်ရွှေတွင် +${goldSpread}%၊ USD တွင် +${usdSpread}% နှင့် စားအုန်းဆီတွင် +${palmSpread}% အသီးသီး ဖြစ်ပေါ်နေသည်။`,
    marketSentiment: 'Volatile',
    aiGenerated,
    lastGeneratedTime: formatYangonTime12h(pipelineMeta?.lastSyncedAt),
  };
}
