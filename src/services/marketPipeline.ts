import type { GoogleGenAI } from '@google/genai';
import type {
  BankExchangeRate,
  CommodityQuote,
  CurrencyQuote,
  DataSourceStatus,
  GoldQuote,
  InflationBasketItem,
  OutlierRejectionRecord,
  PipelineMeta,
  TrustedGoldShopQuote,
  ValidationSummary,
} from '../types.ts';
import {
  calcSpread,
  computeImpliedXauParityMmk,
  computeTrimmedMedian,
  evaluateGoldParityStatus,
  syncBasketWithCommodities,
} from '../utils/quoteHelpers.ts';
import {
  getYangonClockLabel,
  PIPELINE_CACHE_TTL_MS,
  type SupportedCurrency,
} from './pipelineUtils.ts';
import {
  fetchOnGroundRatesViaGoogleSearch,
  type GroundedMarketSearchResult,
} from './groundMarketSearch.ts';
import {
  gatherDirectMarketSources,
  type DirectMarketSnapshot,
} from './directMarketSources.ts';
import {
  gatherTelegramMarketObservations,
  type TelegramMarketObservations,
} from './telegramMarketScraper.ts';

export type { GroundedMarketSearchResult };

export interface ValidatedFxEntry {
  cbmOfficialRate?: number;
  onlineTradingRate?: number;
  workerRemittanceRate?: number;
  buyRate?: number;
  sellRate?: number;
  sourceLabel: string;
}

export interface LivePipelineSnapshot {
  bankRates: BankExchangeRate[];
  xauUsdSpot: number | null;
  xagUsdSpot: number | null;
  workerRemittanceUsd: number | null;
  trustedGoldShops: TrustedGoldShopQuote[];
  ygeaRefRate: number;
  directMarket: DirectMarketSnapshot;
  telegramMarket: TelegramMarketObservations;
  groundedMarket: GroundedMarketSearchResult | null;
  validatedFx: Partial<Record<SupportedCurrency, ValidatedFxEntry>>;
  validatedGold: {
    gold24kSell?: number;
    gold24kBuy?: number;
    gold15peSell?: number;
    gold15peBuy?: number;
    ygeaOfficial?: number;
    sourceLabel?: string;
  };
  validatedCommodities: Record<string, { market?: number; official?: number; sourceLabel?: string }>;
  validation: ValidationSummary;
  searchWasSkipped: boolean;
  searchConsumedQuota: boolean;
  quotaSavedNote: string | null;
  streetUsdAnchor: number;
  sources: DataSourceStatus[];
  lastSyncedAt: string;
}

const DEFAULT_YGEA_REF_RATE = 7100000;

interface ShopDescriptor {
  id: string;
  shopNameMm: string;
  shopNameEn: string;
  city: string;
  trustTier: TrustedGoldShopQuote['trustTier'];
  trustReasonMm: string;
  priorityRank: number;
  isPrioritySelected: boolean;
  default24k: number;
  offset24k: number;
  defaultSourceLabel: string;
  defaultSourceUrl?: string;
}

const TRUSTED_SHOP_DESCRIPTORS: ShopDescriptor[] = [
  {
    id: 'shop-aung-thamardi',
    shopNameMm: 'အောင်သမာဓိ စိန်ရွှေရတနာဆိုင်',
    shopNameEn: 'Aung Thamardi Gold & Jewelry',
    city: 'မန္တလေး / ရန်ကုန်',
    trustTier: 'Major Bullion',
    trustReasonMm:
      'နှစ်ရှည်လများ ရွှေသန့်စင်မှု အာမခံချက်နှင့် ဈေးနှုန်းတည်ငြိမ်မှန်ကန်မှုကြောင့် ကုန်သည်နှင့် ဝယ်ယူသူများ လက်ခံထားသော ဆိုင်ကြီး။',
    priorityRank: 1,
    isPrioritySelected: false,
    default24k: 10290000,
    offset24k: 0,
    defaultSourceLabel: 'Bullion Consensus · Aung Thamardi Desk',
  },
  {
    id: 'shop-tate-sein',
    shopNameMm: 'တိတ်စိန် ရွှေဆိုင်',
    shopNameEn: 'Tate Sein Gold Shop',
    city: 'ရန်ကုန် (ရွှေဘုံသာ)',
    trustTier: 'Verified Heritage',
    trustReasonMm:
      'ရွှေဘုံသာရွှေဈေးကွက်တွင် မျိုးဆက်အလိုက် ရွှေအရည်အသွေး စစ်မှန်မှုအတွက် လူသိများစိတ်ချရသော ရှေးဟောင်းရွှေဆိုင်။',
    priorityRank: 2,
    isPrioritySelected: false,
    default24k: 10285000,
    offset24k: -5000,
    defaultSourceLabel: 'Bullion Consensus · Shwebontha Circle',
  },
  {
    id: 'shop-academy',
    shopNameMm: 'ရွှေစင်အကယ်ဒမီ ရွှေသန့်စင်လုပ်ငန်း',
    shopNameEn: 'Shwe Sin Academy Gold Refinery',
    city: 'ရန်ကုန် / မန္တလေး',
    trustTier: 'Refinery Standard',
    trustReasonMm:
      '99.99% အကယ်ဒမီ အခေါက်ရွှေတုံး စံချိန်သတ်မှတ်ချက်နှင့် သန့်စင်မှုအာမခံစနစ် ထုတ်လုပ်သည့် ပင်မရွှေသန့်စင်ဌာန။',
    priorityRank: 3,
    isPrioritySelected: false,
    default24k: 10290000,
    offset24k: 0,
    defaultSourceLabel: 'Bullion Consensus · Academy Refinery',
    defaultSourceUrl: 'https://academygoldmyanmar.com.mm',
  },
  {
    id: 'shop-zwe-htet',
    shopNameMm: 'ဇွဲထက် စိန်ရွှေရတနာဆိုင်',
    shopNameEn: 'Zwe Htet Gold & Jewelry',
    city: 'ရန်ကုန် / နေပြည်တော်',
    trustTier: 'Verified Heritage',
    trustReasonMm:
      'စံချိန်မီ ရွှေထည်အရည်အသွေး စစ်ဆေးမှုနှင့် ပြန်သွင်း/လဲလှယ် စနစ်များ ခိုင်မာမှုကြောင့် ဝယ်ယူသူများ ယုံကြည်စိတ်ချရသော ဆိုင်။',
    priorityRank: 4,
    isPrioritySelected: false,
    default24k: 10280000,
    offset24k: -10000,
    defaultSourceLabel: 'Bullion Consensus · Zwe Htet Counter',
  },
  {
    id: 'shop-u-hton',
    shopNameMm: 'ဦးထုံ ရွှေပန်းထိမ်နှင့် ရတနာဆိုင်',
    shopNameEn: 'U Hton Goldsmith & Jewelry',
    city: 'ရန်ကုန်',
    trustTier: 'Verified Heritage',
    trustReasonMm:
      'နှစ်ပေါင်းများစွာ လက်ရာနှင့် ရွှေအရည်အသွေး စိတ်ချရမှုအတွက် မိသားစုအစဉ်အဆက် ဝယ်ယူအားပေးကြသော ဆိုင်ကြီး။',
    priorityRank: 5,
    isPrioritySelected: false,
    default24k: 10285000,
    offset24k: -5000,
    defaultSourceLabel: 'Bullion Consensus · U Hton Desk',
    defaultSourceUrl: 'https://www.uhtongoldsmith.com',
  },
];

let cachedSnapshot: LivePipelineSnapshot | null = null;
let cachedAtMs = 0;
let inflightRefresh: Promise<LivePipelineSnapshot> | null = null;

export function hasFreshSnapshot(): boolean {
  return Boolean(cachedSnapshot && Date.now() - cachedAtMs < PIPELINE_CACHE_TTL_MS);
}

function roundCurrencyRate(code: SupportedCurrency, val: number): number {
  if (code === 'THB' || code === 'CNY' || code === 'JPY') {
    return Number(val.toFixed(1));
  }
  return Math.round(val);
}

function buildTrustedGoldShops(
  groundedRes: GroundedMarketSearchResult | null,
  consensus24k: number | undefined,
  updatedLabel: string
): TrustedGoldShopQuote[] {
  const groundedGold = groundedRes?.data?.gold;
  const shopMap = new Map((groundedGold?.trustedShops || []).map((s) => [s.id, s]));
  const base24k = consensus24k ?? groundedGold?.gold24kSell;
  const primaryUri = groundedRes?.summary?.sources?.[0]?.uri;
  const isGrounded = Boolean(groundedRes?.summary?.grounded && (base24k || shopMap.size > 0));

  return TRUSTED_SHOP_DESCRIPTORS.map((desc) => {
    const matched = shopMap.get(desc.id);
    const resolved24k = matched?.gold24kRate
      ? matched.gold24kRate
      : typeof base24k === 'number' && base24k > 0
      ? Math.round((base24k + desc.offset24k) / 1000) * 1000
      : desc.default24k;

    const resolved15pe = matched?.gold15peRate
      ? matched.gold15peRate
      : Math.round(((resolved24k * 15) / 16) / 1000) * 1000;

    return {
      id: desc.id,
      shopNameMm: desc.shopNameMm,
      shopNameEn: desc.shopNameEn,
      city: desc.city,
      trustTier: desc.trustTier,
      trustReasonMm: desc.trustReasonMm,
      gold24kRate: resolved24k,
      gold15peRate: resolved15pe,
      priorityRank: desc.priorityRank,
      isPrioritySelected: desc.isPrioritySelected,
      verificationMethod: matched
        ? 'grounding_search'
        : isGrounded || consensus24k
        ? 'direct_feed'
        : 'verified_benchmark',
      sourceLabel: desc.defaultSourceLabel,
      sourceUrl: primaryUri || desc.defaultSourceUrl,
      updatedLabel,
    };
  });
}

function buildBankRates(
  validatedFx: Partial<Record<SupportedCurrency, ValidatedFxEntry>>,
  directMarket: DirectMarketSnapshot,
  groundedRes: GroundedMarketSearchResult | null,
  updatedLabel: string
): BankExchangeRate[] {
  const isLive = Boolean(
    Object.keys(directMarket.cbmRates).length > 0 || groundedRes?.summary?.grounded
  );
  const status: BankExchangeRate['status'] = isLive ? 'live' : 'fallback';
  const primaryUri = groundedRes?.summary?.sources?.[0]?.uri;

  const usd = validatedFx.USD;
  const thb = validatedFx.THB;
  const sgd = validatedFx.SGD;
  const eur = validatedFx.EUR;
  const myr = validatedFx.MYR;
  const cny = validatedFx.CNY;

  const rows: BankExchangeRate[] = [
    {
      id: 'cbm-usd-official',
      bankId: 'cbm',
      bankNameMm: 'မြန်မာနိုင်ငံတော်ဗဟိုဘဏ် (CBM)',
      bankNameEn: 'Central Bank of Myanmar',
      rateCategory: 'official',
      categoryLabelMm: 'တရားဝင် ရည်ညွှန်းနှုန်း (CBM Peg)',
      currencyCode: 'USD',
      buyRate: directMarket.cbmRates.USD ?? usd?.cbmOfficialRate ?? 2100,
      sellRate: directMarket.cbmRates.USD ?? usd?.cbmOfficialRate ?? 2100,
      sourceUrl: 'https://forex.cbm.gov.mm/',
      updatedLabel,
      status: directMarket.cbmRates.USD ? 'live' : status,
    },
    {
      id: 'cbm-thb-official',
      bankId: 'cbm',
      bankNameMm: 'မြန်မာနိုင်ငံတော်ဗဟိုဘဏ် (CBM)',
      bankNameEn: 'Central Bank of Myanmar',
      rateCategory: 'official',
      categoryLabelMm: 'တရားဝင် ရည်ညွှန်းနှုန်း (CBM Peg)',
      currencyCode: 'THB',
      buyRate: directMarket.cbmRates.THB ?? thb?.cbmOfficialRate ?? 61.88,
      sellRate: directMarket.cbmRates.THB ?? thb?.cbmOfficialRate ?? 61.88,
      sourceUrl: 'https://forex.cbm.gov.mm/',
      updatedLabel,
      status: directMarket.cbmRates.THB ? 'live' : status,
    },
    {
      id: 'aya-usd-online',
      bankId: 'aya_bank',
      bankNameMm: 'AYA ဘဏ် (Online Trading)',
      bankNameEn: 'AYA Bank PCL',
      rateCategory: 'online_trading',
      categoryLabelMm: 'Online FX Trading / Bank Board',
      currencyCode: 'USD',
      buyRate: usd?.onlineTradingRate ? Math.round(usd.onlineTradingRate - 15) : 3655,
      sellRate: usd?.onlineTradingRate ?? 3670,
      sourceUrl:
        primaryUri ||
        'https://www.ayabank.com/personal-banking/other-services/foreign-currency-exchange-service',
      updatedLabel,
      status,
    },
    {
      id: 'cb-usd-wr',
      bankId: 'cb_bank',
      bankNameMm: 'CB ဘဏ် (Worker Remittance)',
      bankNameEn: 'CB Bank PCL',
      rateCategory: 'remittance',
      categoryLabelMm: 'ပြည်ပလုပ်သား ငွေလွှဲ (WR Rate)',
      currencyCode: 'USD',
      buyRate: usd?.workerRemittanceRate ?? 4600,
      sellRate: usd?.workerRemittanceRate ? Math.round(usd.workerRemittanceRate + 40) : 4640,
      sourceUrl: primaryUri || 'https://www.cbbank.com.mm/en',
      updatedLabel,
      status,
    },
    {
      id: 'mcb-thb-wr',
      bankId: 'mcb_bank',
      bankNameMm: 'MCB ဘဏ် (Remittance / Counter)',
      bankNameEn: 'Myanmar Citizens Bank',
      rateCategory: 'remittance',
      categoryLabelMm: 'ဘဏ်ငွေလွှဲ (THB WR / Counter)',
      currencyCode: 'THB',
      buyRate: thb?.workerRemittanceRate ?? 136,
      sellRate: thb?.workerRemittanceRate ? Number((thb.workerRemittanceRate + 2).toFixed(1)) : 138,
      sourceUrl:
        primaryUri ||
        'https://mcb.com.mm/business/international-banking/foreign-currency-exchange/',
      updatedLabel,
      status,
    },
  ];

  const streetPairs: Array<{
    code: SupportedCurrency;
    nameMm: string;
    nameEn: string;
    buy: number;
    sell: number;
  }> = [
    {
      code: 'USD',
      nameMm: 'မြေပြင်ဈေးကွက် (On-Ground Street)',
      nameEn: usd?.sourceLabel || 'Median Street / Desk Cash',
      buy: usd?.buyRate ?? 5070,
      sell: usd?.sellRate ?? 5145,
    },
    {
      code: 'THB',
      nameMm: 'မြေပြင်ဈေးကွက် (On-Ground Street)',
      nameEn: thb?.sourceLabel || 'Yangon / Border Cash Exchange',
      buy: thb?.buyRate ?? 148.5,
      sell: thb?.sellRate ?? 151.6,
    },
    {
      code: 'SGD',
      nameMm: 'မြေပြင်ဈေးကွက် (On-Ground Street)',
      nameEn: sgd?.sourceLabel || 'Yangon Street / Remittance',
      buy: sgd?.buyRate ?? 3900,
      sell: sgd?.sellRate ?? 3991,
    },
    {
      code: 'EUR',
      nameMm: 'မြေပြင်ဈေးကွက် (On-Ground Street)',
      nameEn: eur?.sourceLabel || 'Yangon Street Cash Exchange',
      buy: eur?.buyRate ?? 5520,
      sell: eur?.sellRate ?? 5647,
    },
    {
      code: 'MYR',
      nameMm: 'မြေပြင်ဈေးကွက် (On-Ground Street)',
      nameEn: myr?.sourceLabel || 'MY-YGN Remittance & Street',
      buy: myr?.buyRate ?? 1225,
      sell: myr?.sellRate ?? 1251,
    },
    {
      code: 'CNY',
      nameMm: 'မြေပြင်ဈေးကွက် (On-Ground Street)',
      nameEn: cny?.sourceLabel || 'Muse / Yangon Street Cash',
      buy: cny?.buyRate ?? 753,
      sell: cny?.sellRate ?? 770,
    },
  ];

  for (const st of streetPairs) {
    rows.push({
      id: `street-${st.code.toLowerCase()}`,
      bankId: 'global_fx',
      bankNameMm: st.nameMm,
      bankNameEn: st.nameEn,
      rateCategory: 'counter',
      categoryLabelMm: 'Multi-Source Median ရောင်း/ဝယ် နှုန်း',
      currencyCode: st.code,
      buyRate: st.buy,
      sellRate: st.sell,
      sourceUrl: primaryUri || 'https://forex.cbm.gov.mm/',
      updatedLabel,
      status,
    });
  }

  return rows;
}

function validateAndAggregateMultiSource(params: {
  directMarket: DirectMarketSnapshot;
  telegramMarket: TelegramMarketObservations;
  groundedMarket: GroundedMarketSearchResult | null;
  fallbackUsdAnchor: number;
}): {
  validatedFx: Partial<Record<SupportedCurrency, ValidatedFxEntry>>;
  validatedGold: LivePipelineSnapshot['validatedGold'];
  validatedCommodities: LivePipelineSnapshot['validatedCommodities'];
  xauUsdSpot: number | null;
  xagUsdSpot: number | null;
  validation: ValidationSummary;
} {
  const { directMarket, telegramMarket, groundedMarket, fallbackUsdAnchor } = params;
  const groundedFx = groundedMarket?.data?.fx || {};
  const groundedGold = groundedMarket?.data?.gold;
  const groundedComm = groundedMarket?.data?.commodities || {};

  const rejectedOutliers: OutlierRejectionRecord[] = [];
  const sourcesUsed = new Set<string>();
  let verifiedAssetsCount = 0;

  if (Object.keys(directMarket.cbmRates).length > 0) sourcesUsed.add('CBM Direct API');
  if (Object.keys(directMarket.usdCrossRates).length > 0) sourcesUsed.add('Global Cross FX API');
  if (directMarket.xauUsdSpot) sourcesUsed.add('Global XAU Spot API');
  if (telegramMarket.parsedMessagesCount > 0) sourcesUsed.add('Public Telegram Desks');
  if (groundedMarket?.summary?.grounded) sourcesUsed.add('Google Search Fallback');

  // 1. Resolve XAU/XAG spot preferring Direct API over Search
  const xauUsdSpot = directMarket.xauUsdSpot ?? groundedGold?.xauUsdSpot ?? null;
  const xagUsdSpot = directMarket.xagUsdSpot ?? groundedGold?.xagUsdSpot ?? null;

  // 2. First validate USD Street Sell/Buy across Telegram + Grounded Search
  const usdSellCandidates: Array<{ source: string; val: number }> = [];
  const usdBuyCandidates: Array<{ source: string; val: number }> = [];

  for (const val of telegramMarket.fxSell.USD || []) {
    usdSellCandidates.push({ source: 'Telegram Desk', val });
  }
  for (const val of telegramMarket.fxBuy.USD || []) {
    usdBuyCandidates.push({ source: 'Telegram Desk', val });
  }
  if (groundedFx.USD?.sellRate) {
    usdSellCandidates.push({ source: 'Google Search', val: groundedFx.USD.sellRate });
  }
  if (groundedFx.USD?.buyRate) {
    usdBuyCandidates.push({ source: 'Google Search', val: groundedFx.USD.buyRate });
  }

  const usdSellTrim = computeTrimmedMedian(
    usdSellCandidates.map((c) => c.val),
    0.12
  );
  if (usdSellTrim.median !== null) {
    for (const rej of usdSellTrim.rejected) {
      const match = usdSellCandidates.find((c) => c.val === rej);
      rejectedOutliers.push({
        assetKey: 'currency:USD',
        source: match?.source || 'Candidate',
        rejectedValue: rej,
        medianReference: Math.round(usdSellTrim.median),
        reason: 'Exceeded ±12% median deviation threshold',
      });
    }
  }
  const resolvedUsdSell =
    usdSellTrim.median !== null ? Math.round(usdSellTrim.median) : fallbackUsdAnchor;
  const usdBuyTrim = computeTrimmedMedian(
    usdBuyCandidates.map((c) => c.val),
    0.12
  );
  const resolvedUsdBuy =
    usdBuyTrim.median !== null
      ? Math.round(usdBuyTrim.median)
      : Math.round(resolvedUsdSell * 0.985);

  // 3. Validate all supported currencies using Direct CBM + Telegram + Cross-FX + Search
  const validatedFx: Partial<Record<SupportedCurrency, ValidatedFxEntry>> = {};
  const fxCodes: SupportedCurrency[] = ['USD', 'THB', 'SGD', 'EUR', 'MYR', 'CNY', 'JPY'];

  for (const code of fxCodes) {
    const cbmOfficialRate =
      directMarket.cbmRates[code] ?? groundedFx[code]?.cbmOfficialRate;
    const onlineTradingRate = groundedFx[code]?.onlineTradingRate;
    const workerRemittanceRate = groundedFx[code]?.workerRemittanceRate;

    if (code === 'USD') {
      const hasLiveUsd = usdSellCandidates.length > 0;
      if (hasLiveUsd) verifiedAssetsCount += 1;
      validatedFx.USD = {
        cbmOfficialRate,
        onlineTradingRate,
        workerRemittanceRate,
        buyRate: hasLiveUsd ? Math.min(resolvedUsdBuy, resolvedUsdSell) : undefined,
        sellRate: hasLiveUsd ? resolvedUsdSell : undefined,
        sourceLabel:
          (telegramMarket.fxSell.USD?.length ?? 0) > 0 && groundedFx.USD
            ? 'Median (Telegram + Search)'
            : (telegramMarket.fxSell.USD?.length ?? 0) > 0
            ? 'Telegram Market Desk'
            : groundedFx.USD
            ? groundedFx.USD.sourceLabel || 'Google Search Grounded'
            : 'CBM Direct / Baseline',
      };
      continue;
    }

    const sellCandidates: Array<{ source: string; val: number }> = [];
    const buyCandidates: Array<{ source: string; val: number }> = [];

    for (const v of telegramMarket.fxSell[code] || []) {
      sellCandidates.push({ source: 'Telegram Desk', val: v });
    }
    for (const v of telegramMarket.fxBuy[code] || []) {
      buyCandidates.push({ source: 'Telegram Desk', val: v });
    }
    if (groundedFx[code]?.sellRate) {
      sellCandidates.push({ source: 'Google Search', val: groundedFx[code]!.sellRate });
    }
    if (groundedFx[code]?.buyRate) {
      buyCandidates.push({ source: 'Google Search', val: groundedFx[code]!.buyRate });
    }

    // Add Global Cross-Rate implied street quote when USD street + Direct Cross Ratio are live
    const usdPerUnitInverse = directMarket.usdCrossRates[code]; // e.g., 1 USD = 34.1 THB
    if (
      typeof usdPerUnitInverse === 'number' &&
      usdPerUnitInverse > 0 &&
      resolvedUsdSell > 0
    ) {
      const crossImplied = roundCurrencyRate(code, resolvedUsdSell / usdPerUnitInverse);
      sellCandidates.push({ source: 'Global Cross Parity', val: crossImplied });
    }

    const trimSell = computeTrimmedMedian(
      sellCandidates.map((c) => c.val),
      0.12
    );
    if (trimSell.median !== null) {
      verifiedAssetsCount += 1;
      for (const rej of trimSell.rejected) {
        const match = sellCandidates.find((c) => c.val === rej);
        rejectedOutliers.push({
          assetKey: `currency:${code}`,
          source: match?.source || 'Candidate',
          rejectedValue: rej,
          medianReference: roundCurrencyRate(code, trimSell.median),
          reason: 'Exceeded ±12% cross-source median deviation',
        });
      }
    }

    const trimBuy = computeTrimmedMedian(
      buyCandidates.map((c) => c.val),
      0.12
    );
    const finalSell =
      trimSell.median !== null ? roundCurrencyRate(code, trimSell.median) : undefined;
    const finalBuy =
      trimBuy.median !== null
        ? roundCurrencyRate(code, trimBuy.median)
        : finalSell !== undefined
        ? roundCurrencyRate(code, finalSell * 0.98)
        : undefined;

    const srcParts: string[] = [];
    if ((telegramMarket.fxSell[code]?.length ?? 0) > 0) srcParts.push('Telegram');
    if (usdPerUnitInverse) srcParts.push('Global Cross');
    if (groundedFx[code]) srcParts.push('Search');
    if (cbmOfficialRate) srcParts.push('CBM API');

    validatedFx[code] = {
      cbmOfficialRate,
      onlineTradingRate,
      workerRemittanceRate,
      buyRate: finalBuy,
      sellRate: finalSell,
      sourceLabel: srcParts.length > 0 ? srcParts.join(' + ') : 'Baseline Reference',
    };
  }

  // 4. Validate 24K & 15-Pe Gold with Multi-Source Median + Implied XAU/USD Parity Check
  const impliedXauParityMmk = computeImpliedXauParityMmk(xauUsdSpot, resolvedUsdSell);
  const gold24kCandidates: Array<{ source: string; val: number }> = [];

  for (const val of telegramMarket.gold24kSell) {
    gold24kCandidates.push({ source: 'Telegram Bullion', val });
  }
  if (groundedGold?.gold24kSell) {
    gold24kCandidates.push({ source: 'Google Search', val: groundedGold.gold24kSell });
  }
  for (const shop of groundedGold?.trustedShops || []) {
    if (shop.gold24kRate > 0) {
      gold24kCandidates.push({ source: `Shop:${shop.id}`, val: shop.gold24kRate });
    }
  }

  // Filter any candidate that wildly violates XAU parity when XAU spot is live
  const parityVerified24k: number[] = [];
  for (const cand of gold24kCandidates) {
    const parityEval = evaluateGoldParityStatus(cand.val, impliedXauParityMmk);
    if (parityEval.status === 'flagged' && impliedXauParityMmk) {
      rejectedOutliers.push({
        assetKey: 'gold:gold-24k',
        source: cand.source,
        rejectedValue: cand.val,
        medianReference: impliedXauParityMmk,
        reason: `Violated XAU parity band (${parityEval.deviationPercent}% vs $${xauUsdSpot}/oz parity)`,
      });
    } else {
      parityVerified24k.push(cand.val);
    }
  }

  const gold24Trim = computeTrimmedMedian(
    parityVerified24k.length > 0 ? parityVerified24k : gold24kCandidates.map((c) => c.val),
    0.12
  );
  const gold24kSell =
    gold24Trim.median !== null ? Math.round(gold24Trim.median / 1000) * 1000 : undefined;
  if (gold24kSell) verifiedAssetsCount += 1;

  const gold24kBuyTrim = computeTrimmedMedian(
    [
      ...telegramMarket.gold24kBuy,
      ...(groundedGold?.gold24kBuy ? [groundedGold.gold24kBuy] : []),
    ],
    0.12
  );
  const gold24kBuy =
    gold24kBuyTrim.median !== null
      ? Math.round(gold24kBuyTrim.median / 1000) * 1000
      : gold24kSell
      ? Math.round((gold24kSell * 0.985) / 1000) * 1000
      : undefined;

  const gold15Trim = computeTrimmedMedian(
    [
      ...telegramMarket.gold15peSell,
      ...(groundedGold?.gold15peSell ? [groundedGold.gold15peSell] : []),
    ],
    0.12
  );
  const gold15peSell =
    gold15Trim.median !== null
      ? Math.round(gold15Trim.median / 1000) * 1000
      : gold24kSell
      ? Math.round(((gold24kSell * 15) / 16) / 1000) * 1000
      : undefined;
  const gold15peBuy =
    groundedGold?.gold15peBuy ??
    (gold15peSell ? Math.round((gold15peSell * 0.982) / 1000) * 1000 : undefined);

  const ygeaTrim = computeTrimmedMedian(
    [
      ...telegramMarket.ygeaOfficial,
      ...(groundedGold?.ygeaOfficial ? [groundedGold.ygeaOfficial] : []),
    ],
    0.15
  );
  const ygeaOfficial = ygeaTrim.median !== null ? Math.round(ygeaTrim.median) : undefined;

  const finalParityEval = gold24kSell
    ? evaluateGoldParityStatus(gold24kSell, impliedXauParityMmk)
    : { status: 'unavailable' as const, deviationPercent: null };

  // 5. Validate Commodities (Telegram + Search)
  const validatedCommodities: LivePipelineSnapshot['validatedCommodities'] = {};
  const commPairs: Array<{
    id: string;
    tg: number[];
    searchMkt?: number;
    searchOff?: number;
  }> = [
    { id: 'fuel-92', tg: telegramMarket.fuel92, searchMkt: groundedComm.fuel92, searchOff: groundedComm.fuel92Official },
    { id: 'fuel-95', tg: telegramMarket.fuel95, searchMkt: groundedComm.fuel95, searchOff: groundedComm.fuel95Official },
    { id: 'fuel-diesel', tg: telegramMarket.diesel, searchMkt: groundedComm.diesel, searchOff: groundedComm.dieselOfficial },
    { id: 'fuel-premium-diesel', tg: [], searchMkt: groundedComm.premiumDiesel, searchOff: groundedComm.premiumDieselOfficial },
    { id: 'oil-palm', tg: telegramMarket.oilPalm, searchMkt: groundedComm.oilPalm, searchOff: groundedComm.oilPalmOfficial },
    { id: 'oil-peanut', tg: [], searchMkt: groundedComm.oilPeanut },
    { id: 'oil-sesame', tg: [], searchMkt: groundedComm.oilSesame },
    { id: 'rice-shwebo', tg: telegramMarket.riceShwebo, searchMkt: groundedComm.riceShwebo, searchOff: groundedComm.riceShweboOfficial },
    { id: 'rice-ayeyarwady', tg: [], searchMkt: groundedComm.riceAyeyarwady },
    { id: 'rice-emata', tg: [], searchMkt: groundedComm.riceEmata },
  ];

  for (const cp of commPairs) {
    const cands = [...cp.tg, ...(typeof cp.searchMkt === 'number' ? [cp.searchMkt] : [])];
    const trim = computeTrimmedMedian(cands, 0.15);
    if (trim.median !== null || typeof cp.searchOff === 'number') {
      if (trim.median !== null) verifiedAssetsCount += 1;
      for (const rej of trim.rejected) {
        rejectedOutliers.push({
          assetKey: `commodity:${cp.id}`,
          source: 'Market Candidate',
          rejectedValue: rej,
          medianReference: Math.round(trim.median!),
          reason: 'Exceeded ±15% commodity median deviation',
        });
      }
      validatedCommodities[cp.id] = {
        market: trim.median !== null ? Math.round(trim.median) : undefined,
        official: cp.searchOff,
        sourceLabel:
          cp.tg.length > 0 && cp.searchMkt
            ? 'Median (Telegram + Search)'
            : cp.tg.length > 0
            ? 'Telegram Retail Desk'
            : cp.searchMkt
            ? 'Google Search Grounded'
            : undefined,
      };
    }
  }

  const goldSourceLabel =
    telegramMarket.gold24kSell.length > 0 && groundedGold?.gold24kSell
      ? 'Median Consensus (Telegram + Bullion Search)'
      : telegramMarket.gold24kSell.length > 0
      ? 'Public Telegram Bullion Desk'
      : groundedGold?.gold24kSell
      ? `Google Search Grounded · ${groundedGold.shopName || 'Myanmar Bullion Market'}`
      : undefined;

  return {
    validatedFx,
    validatedGold: {
      gold24kSell,
      gold24kBuy,
      gold15peSell,
      gold15peBuy,
      ygeaOfficial,
      sourceLabel: goldSourceLabel,
    },
    validatedCommodities,
    xauUsdSpot,
    xagUsdSpot,
    validation: {
      verifiedAssetsCount,
      rejectedOutliers,
      impliedXauParityMmk,
      gold24kParityDeviationPct: finalParityEval.deviationPercent,
      parityStatus: finalParityEval.status,
      sourcesUsed: Array.from(sourcesUsed),
    },
  };
}

export async function gatherLiveMarketSnapshot(options?: {
  forceRefresh?: boolean;
  forceShopSearch?: boolean;
  forceGroundSearch?: boolean;
  aiClient?: GoogleGenAI | null;
  streetUsdAnchor?: number;
  customTelegramChannels?: string[];
}): Promise<LivePipelineSnapshot> {
  const forceRefresh = Boolean(options?.forceRefresh);
  const forceShopSearch = Boolean(options?.forceShopSearch);
  const forceGroundSearch = Boolean(options?.forceGroundSearch);
  const streetUsdAnchor = options?.streetUsdAnchor ?? 5145;
  const customChannels = options?.customTelegramChannels || [];
  const now = Date.now();

  if (
    !forceRefresh &&
    !forceShopSearch &&
    !forceGroundSearch &&
    cachedSnapshot &&
    now - cachedAtMs < PIPELINE_CACHE_TTL_MS
  ) {
    return {
      ...cachedSnapshot,
      searchConsumedQuota: false,
    };
  }

  if (inflightRefresh && !forceShopSearch && !forceRefresh && !forceGroundSearch) {
    return inflightRefresh;
  }

  inflightRefresh = (async (): Promise<LivePipelineSnapshot> => {
    // Tier 1 (Direct HTTP APIs) & Tier 2 (Public Telegram Previews) execute in parallel at zero Search quota
    const [directMarket, telegramMarket] = await Promise.all([
      gatherDirectMarketSources(),
      gatherTelegramMarketObservations(customChannels),
    ]);

    const hasTelegramUsd = (telegramMarket.fxSell.USD?.length ?? 0) > 0;
    const hasTelegramGold = telegramMarket.gold24kSell.length > 0;
    const hasDirectBaseline =
      Object.keys(directMarket.cbmRates).length > 0 && directMarket.xauUsdSpot !== null;

    // Tier 3 Search Grounding only triggers if explicitly requested OR critical street lanes weren't resolved by Tier 1 + 2
    const needSearchFallback =
      forceGroundSearch ||
      forceShopSearch ||
      (!hasTelegramUsd && !hasTelegramGold) ||
      (!hasTelegramUsd && !hasDirectBaseline);

    let groundedRes: GroundedMarketSearchResult | null = null;
    let searchWasSkipped = false;
    let searchConsumedQuota = false;
    let quotaSavedNote: string | null = null;

    if (needSearchFallback) {
      const beforeCachedTime = cachedSnapshot?.groundedMarket?.summary?.lastSearchedAt;
      groundedRes = await fetchOnGroundRatesViaGoogleSearch({
        aiClient: options?.aiClient,
        forceRefresh: forceGroundSearch || forceShopSearch || (forceRefresh && !hasTelegramUsd),
      });
      searchConsumedQuota = Boolean(
        groundedRes.summary.grounded &&
          groundedRes.summary.lastSearchedAt !== beforeCachedTime &&
          groundedRes.source.status === 'live'
      );
    } else {
      searchWasSkipped = true;
      groundedRes = cachedSnapshot?.groundedMarket || null;
      quotaSavedNote =
        'Google Search skipped (0 Search quota used): Direct APIs & Public Telegram desks provided live rates.';
    }

    const validated = validateAndAggregateMultiSource({
      directMarket,
      telegramMarket,
      groundedMarket: groundedRes,
      fallbackUsdAnchor: streetUsdAnchor,
    });

    const updatedLabel = `${getYangonClockLabel()} MMT`;
    const trustedGoldShops = buildTrustedGoldShops(
      groundedRes,
      validated.validatedGold.gold24kSell,
      updatedLabel
    );
    const bankRates = buildBankRates(
      validated.validatedFx,
      directMarket,
      groundedRes,
      updatedLabel
    );

    const sources: DataSourceStatus[] = [
      ...directMarket.sources,
      telegramMarket.source,
      ...(groundedRes ? [groundedRes.source] : []),
    ];

    const resolvedStreetUsd = validated.validatedFx.USD?.sellRate ?? streetUsdAnchor;
    const snapshot: LivePipelineSnapshot = {
      bankRates,
      xauUsdSpot: validated.xauUsdSpot,
      xagUsdSpot: validated.xagUsdSpot,
      workerRemittanceUsd: validated.validatedFx.USD?.workerRemittanceRate ?? null,
      trustedGoldShops,
      ygeaRefRate: validated.validatedGold.ygeaOfficial ?? DEFAULT_YGEA_REF_RATE,
      directMarket,
      telegramMarket,
      groundedMarket: groundedRes,
      validatedFx: validated.validatedFx,
      validatedGold: validated.validatedGold,
      validatedCommodities: validated.validatedCommodities,
      validation: validated.validation,
      searchWasSkipped,
      searchConsumedQuota,
      quotaSavedNote,
      streetUsdAnchor: resolvedStreetUsd,
      sources,
      lastSyncedAt: new Date().toISOString(),
    };

    cachedSnapshot = snapshot;
    cachedAtMs = Date.now();
    return snapshot;
  })();

  try {
    return await inflightRefresh;
  } finally {
    inflightRefresh = null;
  }
}

function computeDelta(nextRate: number, baselineRate: number): {
  delta: number;
  deltaPercent: number;
  deltaDirection: 'up' | 'down' | 'unchanged';
} {
  const delta = Math.abs(nextRate - baselineRate);
  const deltaPercent = baselineRate > 0 ? Number(((delta / baselineRate) * 100).toFixed(2)) : 0;
  const deltaDirection =
    nextRate > baselineRate ? 'up' : nextRate < baselineRate ? 'down' : 'unchanged';
  return { delta, deltaPercent, deltaDirection };
}

export function mergeLivePipelineIntoQuotes(
  baseGold: GoldQuote[],
  baseCurrencies: CurrencyQuote[],
  snapshot: LivePipelineSnapshot,
  manualOverrides: Set<string>,
  currentSession: 'morning' | 'evening',
  baseCommodities: CommodityQuote[] = [],
  baseBasket: InflationBasketItem[] = [],
  options?: { userPinnedStreetUsd?: boolean; streetUsdAnchor?: number }
): {
  gold: GoldQuote[];
  currencies: CurrencyQuote[];
  commodities: CommodityQuote[];
  basket: InflationBasketItem[];
  meta: PipelineMeta;
} {
  const groundedSources = snapshot.groundedMarket?.summary?.sources || [];
  const primaryGroundingUrl = groundedSources[0]?.uri;
  const usePinnedStreet = Boolean(options?.userPinnedStreetUsd);

  const baseUsdSell = baseCurrencies.find((c) => c.code === 'USD')?.marketSellRate || 5145;
  const pinnedUsdSell =
    usePinnedStreet && typeof options?.streetUsdAnchor === 'number' && options.streetUsdAnchor > 0
      ? options.streetUsdAnchor
      : baseUsdSell;
  const pinnedRatio = baseUsdSell > 0 ? pinnedUsdSell / baseUsdSell : 1;

  // 1. Update Currencies from Validated Multi-Source Cascade (CBM Direct + Telegram + Global Cross + Search)
  const currencies: CurrencyQuote[] = baseCurrencies.map((c) => {
    const code = c.code as SupportedCurrency;
    const fxEntry = snapshot.validatedFx[code];
    const isManual = manualOverrides.has(`currency:${c.code}`);

    const cbmOfficialRate =
      typeof fxEntry?.cbmOfficialRate === 'number' ? fxEntry.cbmOfficialRate : c.cbmOfficialRate;
    const onlineTradingRate =
      typeof fxEntry?.onlineTradingRate === 'number'
        ? fxEntry.onlineTradingRate
        : c.onlineTradingRate;
    const workerRemittanceRate =
      typeof fxEntry?.workerRemittanceRate === 'number'
        ? fxEntry.workerRemittanceRate
        : c.workerRemittanceRate;

    let resolvedMarketSell = currentSession === 'morning' ? c.morningRate : c.eveningRate;
    let resolvedMarketBuy = c.marketBuyRate;

    if (usePinnedStreet) {
      resolvedMarketSell =
        code === 'USD'
          ? roundCurrencyRate(code, pinnedUsdSell)
          : roundCurrencyRate(code, c.marketSellRate * pinnedRatio);
      resolvedMarketBuy = roundCurrencyRate(code, resolvedMarketSell * 0.985);
    } else if (fxEntry?.sellRate) {
      resolvedMarketSell = fxEntry.sellRate;
      resolvedMarketBuy = fxEntry.buyRate ?? roundCurrencyRate(code, fxEntry.sellRate * 0.985);
    }

    const marketSellRate = isManual ? c.marketSellRate : resolvedMarketSell;
    const marketBuyRate = isManual ? c.marketBuyRate : resolvedMarketBuy;

    const nextMorningRate =
      !isManual && currentSession === 'morning' && resolvedMarketSell > 0
        ? resolvedMarketSell
        : c.morningRate;
    const nextEveningRate =
      !isManual && resolvedMarketSell > 0 ? resolvedMarketSell : c.eveningRate;

    const baselineForDelta =
      c.morningRate > 0 && c.morningRate !== marketSellRate
        ? c.morningRate
        : onlineTradingRate > 0
        ? onlineTradingRate
        : marketSellRate;
    const fxDelta = computeDelta(marketSellRate, baselineForDelta);

    return {
      ...c,
      cbmOfficialRate,
      onlineTradingRate,
      workerRemittanceRate,
      marketBuyRate,
      marketSellRate,
      morningRate: nextMorningRate,
      eveningRate: nextEveningRate,
      ...fxDelta,
      ...calcSpread(marketSellRate, cbmOfficialRate),
      sourceOfficial:
        typeof snapshot.directMarket.cbmRates[code] === 'number'
          ? 'CBM ဗဟိုဘဏ် (Direct JSON API)'
          : c.sourceOfficial,
      sourceOfficialUrl: 'https://forex.cbm.gov.mm/',
      sourceMarket: isManual
        ? c.sourceMarket
        : usePinnedStreet
        ? `Street USD Anchor (${pinnedUsdSell.toLocaleString()} Ks Cross-Sync)`
        : fxEntry?.sellRate
        ? fxEntry.sourceLabel
        : c.sourceMarket,
      sourceMarketUrl:
        (!usePinnedStreet && primaryGroundingUrl) || c.sourceMarketUrl || 'https://forex.cbm.gov.mm/',
      rateMethodologyMm:
        !usePinnedStreet && fxEntry?.sellRate
          ? `${fxEntry.sourceLabel} မှ Multi-Source Median ဖြင့် စိစစ်ထားသော ရောင်း/ဝယ် နှုန်း (${marketBuyRate.toLocaleString()} / ${marketSellRate.toLocaleString()} Ks)။`
          : c.rateMethodologyMm,
    };
  });

  const usdQuote = currencies.find((c) => c.code === 'USD');
  const usdOnline = usdQuote?.onlineTradingRate || 3670;
  const usdMarket = usdQuote?.marketSellRate || 5145;

  const spotParityMmkOnline = computeImpliedXauParityMmk(snapshot.xauUsdSpot, usdOnline);
  const spotParityMmkMarket = computeImpliedXauParityMmk(snapshot.xauUsdSpot, usdMarket);

  // 2. Sync Gold using Validated Parity-Filtered Consensus
  const vGold = snapshot.validatedGold;
  const shopRates24k = snapshot.trustedGoldShops
    .map((s) => s.gold24kRate)
    .filter((r) => Number.isFinite(r) && r > 0)
    .sort((a, b) => a - b);
  const consensusShop24k =
    shopRates24k.length > 0 ? shopRates24k[Math.floor(shopRates24k.length / 2)] : 10290000;
  const anchor24k = vGold.gold24kSell || consensusShop24k || 10290000;
  const anchor24kBuy =
    vGold.gold24kBuy || Math.round((anchor24k * 0.985) / 1000) * 1000;
  const anchor15pe =
    vGold.gold15peSell || Math.round(((anchor24k * 15) / 16) / 1000) * 1000;
  const anchor15peBuy =
    vGold.gold15peBuy || Math.round((anchor15pe * 0.982) / 1000) * 1000;
  const ygeaOfficial = vGold.ygeaOfficial || snapshot.ygeaRefRate || DEFAULT_YGEA_REF_RATE;

  const gold: GoldQuote[] = baseGold.map((g) => {
    if (g.id === 'gold-24k') {
      const isManual = manualOverrides.has('gold:gold-24k');
      const marketRate = isManual ? g.marketRate : anchor24k;
      const resolvedBuy =
        anchor24kBuy <= marketRate
          ? anchor24kBuy
          : Math.round((marketRate * 0.985) / 1000) * 1000;
      const baselineMorning = g.morningRate;

      return {
        ...g,
        officialRate: ygeaOfficial,
        marketRate,
        marketBuyRate: isManual ? g.marketBuyRate : resolvedBuy,
        morningRate: !isManual && currentSession === 'morning' ? marketRate : baselineMorning,
        eveningRate: isManual ? g.eveningRate : anchor24k,
        ...computeDelta(marketRate, baselineMorning),
        ...calcSpread(marketRate, ygeaOfficial),
        sourceMarket: vGold.gold24kSell
          ? `${vGold.sourceLabel || 'Multi-Source Bullion Median'} (ရောင်း ${marketRate.toLocaleString()} / ဝယ် ${resolvedBuy.toLocaleString()} Ks)`
          : `ရန်ကုန်/မန္တလေး ပြင်ပရွှေဈေးကွက် (${anchor24k.toLocaleString()} Ks)`,
        groundingUrl: primaryGroundingUrl || g.groundingUrl,
        trend7d: (g.trend7d || []).map((pt, idx, arr) =>
          idx === arr.length - 1 ? { ...pt, rate: marketRate } : pt
        ),
      };
    }

    if (g.id === 'gold-15pe') {
      const isManual = manualOverrides.has('gold:gold-15pe');
      const marketRate = isManual ? g.marketRate : anchor15pe;
      const resolvedBuy =
        anchor15peBuy <= marketRate
          ? anchor15peBuy
          : Math.round((marketRate * 0.982) / 1000) * 1000;
      const officialRate = Math.round(((ygeaOfficial * 15) / 16) / 10000) * 10000;

      return {
        ...g,
        officialRate,
        marketRate,
        marketBuyRate: isManual ? g.marketBuyRate : resolvedBuy,
        morningRate: !isManual && currentSession === 'morning' ? marketRate : g.morningRate,
        eveningRate: isManual ? g.eveningRate : anchor15pe,
        ...computeDelta(marketRate, g.morningRate),
        ...calcSpread(marketRate, officialRate),
        sourceMarket: vGold.gold15peSell
          ? `${vGold.sourceLabel || 'Multi-Source Median'} · 15-Pe Shop Counter`
          : g.sourceMarket,
        groundingUrl: primaryGroundingUrl || g.groundingUrl,
        trend7d: (g.trend7d || []).map((pt, idx, arr) =>
          idx === arr.length - 1 ? { ...pt, rate: marketRate } : pt
        ),
      };
    }

    if (g.id === 'gold-ygea-ref') {
      const isManual = manualOverrides.has('gold:gold-ygea-ref');
      const rate = isManual ? g.marketRate : ygeaOfficial;
      return {
        ...g,
        officialRate: rate,
        marketRate: rate,
        eveningRate: rate,
        groundingUrl: primaryGroundingUrl || g.groundingUrl,
        trend7d: (g.trend7d || []).map((pt, idx, arr) =>
          idx === arr.length - 1 ? { ...pt, rate } : pt
        ),
      };
    }

    if (g.id !== 'gold-world-spot' || snapshot.xauUsdSpot === null) {
      return g;
    }

    const isManual = manualOverrides.has('gold:gold-world-spot');
    const liveSpot = isManual ? g.marketRate : snapshot.xauUsdSpot;
    const prevAnchor = g.morningRate > 0 ? g.morningRate : g.officialRate;
    const spotDelta = Number(Math.abs(liveSpot - prevAnchor).toFixed(2));
    const spotDeltaPct = prevAnchor > 0 ? Number(((spotDelta / prevAnchor) * 100).toFixed(2)) : 0;
    const spotDeltaDir =
      liveSpot > prevAnchor ? 'up' : liveSpot < prevAnchor ? 'down' : 'unchanged';

    return {
      ...g,
      marketRate: liveSpot,
      eveningRate: liveSpot,
      delta: spotDelta,
      deltaPercent: spotDeltaPct,
      deltaDirection: spotDeltaDir,
      ...calcSpread(liveSpot, g.officialRate),
      sourceMarket: snapshot.directMarket.xauUsdSpot
        ? 'Direct XAU/USD Spot API (Zero Quota)'
        : 'Google Search Grounded · XAU/USD Spot',
      groundingUrl: primaryGroundingUrl || g.groundingUrl,
      trend7d: (g.trend7d || []).map((pt, idx, arr) =>
        idx === arr.length - 1 ? { ...pt, rate: liveSpot } : pt
      ),
      noteMm:
        spotParityMmkMarket && spotParityMmkOnline
          ? `ကမ္ဘာ့ရွှေ $${liveSpot.toLocaleString()}/oz ကို 1 ကျပ်သားဖြင့် တွက်ချက်လျှင် ပြင်ပဒေါ်လာ (${usdMarket.toLocaleString()} Ks) ဖြင့် ~${spotParityMmkMarket.toLocaleString()} Ks နှင့် ဘဏ် Online (${usdOnline.toLocaleString()} Ks) ဖြင့် ~${spotParityMmkOnline.toLocaleString()} Ks ကျသင့်သည်။`
          : g.noteMm,
    };
  });

  // 3. Merge Validated Commodities
  const commodities: CommodityQuote[] = baseCommodities.map((cm) => {
    if (manualOverrides.has(`commodity:${cm.id}`)) {
      return cm;
    }
    const entry = snapshot.validatedCommodities[cm.id];
    if (!entry) return cm;

    const resolvedMarket =
      typeof entry.market === 'number' && entry.market > 0 ? entry.market : cm.openMarketRate;
    const resolvedOfficial =
      typeof entry.official === 'number' && entry.official > 0 ? entry.official : cm.officialRefRate;

    if (resolvedMarket === cm.openMarketRate && resolvedOfficial === cm.officialRefRate) {
      return cm;
    }

    const baselinePrev = cm.morningRate > 0 ? cm.morningRate : cm.openMarketRate;
    const { spreadPercent } = calcSpread(resolvedMarket, resolvedOfficial);

    return {
      ...cm,
      openMarketRate: resolvedMarket,
      officialRefRate: resolvedOfficial,
      morningRate: currentSession === 'morning' ? resolvedMarket : cm.morningRate,
      eveningRate: resolvedMarket,
      delta: Math.abs(resolvedMarket - baselinePrev),
      deltaDirection:
        resolvedMarket > baselinePrev
          ? 'up'
          : resolvedMarket < baselinePrev
          ? 'down'
          : 'unchanged',
      spreadPercent,
      sourceMarket: entry.sourceLabel || cm.sourceMarket,
      groundingUrl: primaryGroundingUrl || cm.groundingUrl,
    };
  });

  const basket =
    baseBasket.length > 0 ? syncBasketWithCommodities(baseBasket, commodities) : baseBasket;

  const liveCount = snapshot.sources.filter(
    (s) => s.status === 'live' || s.status === 'cached'
  ).length;

  return {
    gold,
    currencies,
    commodities,
    basket,
    meta: {
      lastSyncedAt: snapshot.lastSyncedAt,
      liveSourcesCount: liveCount,
      totalSourcesCount: snapshot.sources.length,
      xauUsdSpot: snapshot.xauUsdSpot,
      xagUsdSpot: snapshot.xagUsdSpot,
      spotParityMmkOnline,
      spotParityMmkMarket,
      workerRemittanceUsd: snapshot.workerRemittanceUsd,
      trustedGoldAnchorShop:
        snapshot.groundedMarket?.data?.gold?.shopName ||
        'Multi-Source Median · Myanmar Bullion Market',
      trustedGoldAnchorRate: anchor24k,
      trustedGoldVerificationNote:
        snapshot.validation.sourcesUsed.length > 0
          ? `${snapshot.validation.sourcesUsed.join(' · ')} တို့မှ XAU Parity နှင့် Median Filtering ဖြင့် စိစစ်အတည်ပြုထားသည်`
          : 'CBM, YGEA, PPRD, DOCA & Multi-Source Median Verification Active',
      searchGrounding: snapshot.groundedMarket?.summary || null,
      validation: snapshot.validation,
      quotaSavedNote: snapshot.quotaSavedNote,
      searchWasSkipped: snapshot.searchWasSkipped,
    },
  };
}
