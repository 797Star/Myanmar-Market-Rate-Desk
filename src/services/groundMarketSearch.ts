import fs from 'fs';
import type { GoogleGenAI } from '@google/genai';
import type {
  DataSourceStatus,
  GroundingSourceLink,
  MarketGroundingSummary,
} from '../types.ts';
import {
  executeGroundedSearchWithQuotaGuard,
  formatQuotaErrorMessage,
  isQuotaOrRateLimitError,
  parseRetryDelayMs,
} from './geminiSearchClient.ts';
import {
  getYangonClockLabel,
  isSane24kMmkGold,
  isSaneMmkRate,
  isSaneYgeaMmkGold,
  TRUSTED_SHOPS_CACHE_TTL_MS,
  type SupportedCurrency,
} from './pipelineUtils.ts';

export interface GroundedFxQuote {
  buyRate: number;
  sellRate: number;
  cbmOfficialRate?: number;
  onlineTradingRate?: number;
  workerRemittanceRate?: number;
  sourceLabel?: string;
}

export interface GroundedTrustedShopPrice {
  id: string;
  gold24kRate: number;
  gold15peRate?: number;
}

export interface GroundedGoldQuote {
  gold24kSell?: number;
  gold24kBuy?: number;
  gold15peSell?: number;
  gold15peBuy?: number;
  ygeaOfficial?: number;
  xauUsdSpot?: number;
  xagUsdSpot?: number;
  shopName?: string;
  trustedShops?: GroundedTrustedShopPrice[];
}

export interface GroundedCommodityRates {
  fuel92?: number;
  fuel92Official?: number;
  fuel95?: number;
  fuel95Official?: number;
  diesel?: number;
  dieselOfficial?: number;
  premiumDiesel?: number;
  premiumDieselOfficial?: number;
  oilPalm?: number;
  oilPalmOfficial?: number;
  oilPeanut?: number;
  oilSesame?: number;
  riceShwebo?: number;
  riceShweboOfficial?: number;
  riceAyeyarwady?: number;
  riceEmata?: number;
}

export interface GroundedOnGroundMarketData {
  fx: Partial<Record<SupportedCurrency, GroundedFxQuote>>;
  gold: GroundedGoldQuote;
  commodities: GroundedCommodityRates;
  onGroundSummaryMm?: string;
  updatedAssetsCount: number;
}

export interface GroundedMarketSearchResult {
  data: GroundedOnGroundMarketData | null;
  summary: MarketGroundingSummary;
  source: DataSourceStatus;
}

const GROUND_SEARCH_TIMEOUT_MS = 28000;
const ERROR_RETRY_COOLDOWN_MS = 3 * 60 * 1000; // 3 min cooldown on upstream 429
const DISK_CACHE_PATH = '/tmp/mmw-google-search-cache.json';

interface CachedSearchState {
  result: GroundedMarketSearchResult;
  fetchedAtMs: number;
  cooldownUntilMs?: number;
  isError: boolean;
}

let cachedSearchResult: CachedSearchState | null = null;
let lastKnownGoodResult: GroundedMarketSearchResult | null = null;
let inflightSearchPromise: Promise<GroundedMarketSearchResult> | null = null;

function hydrateSearchCacheFromDisk(): void {
  if (cachedSearchResult) return;
  try {
    if (!fs.existsSync(DISK_CACHE_PATH)) return;
    const raw = fs.readFileSync(DISK_CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as CachedSearchState;
    if (parsed && parsed.result && parsed.result.data && typeof parsed.fetchedAtMs === 'number') {
      cachedSearchResult = parsed;
      lastKnownGoodResult = parsed.result;
    }
  } catch {
    // Ignore corrupt disk cache
  }
}

function persistSearchCacheToDisk(state: CachedSearchState): void {
  if (state.isError || !state.result.data) return;
  try {
    fs.writeFileSync(DISK_CACHE_PATH, JSON.stringify(state), 'utf8');
  } catch {
    // Ignore /tmp write error
  }
}

function getYangonDateString(): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Yangon',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

const FX_STREET_BOUNDS: Record<SupportedCurrency, { min: number; max: number; roundDecimals: number }> = {
  USD: { min: 3800, max: 9000, roundDecimals: 0 },
  THB: { min: 100, max: 280, roundDecimals: 1 },
  SGD: { min: 2800, max: 7500, roundDecimals: 0 },
  EUR: { min: 4000, max: 10500, roundDecimals: 0 },
  MYR: { min: 800, max: 2400, roundDecimals: 0 },
  CNY: { min: 500, max: 1400, roundDecimals: 1 },
  JPY: { min: 22, max: 80, roundDecimals: 1 },
};

const VALID_SHOP_IDS = new Set([
  'shop-aung-thamardi',
  'shop-tate-sein',
  'shop-academy',
  'shop-zwe-htet',
  'shop-u-hton',
]);

function parsePositiveNumber(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val) && val > 0) return val;
  if (typeof val === 'string') {
    const cleaned = val.replace(/,/g, '').trim();
    const num = Number.parseFloat(cleaned);
    return Number.isFinite(num) && num > 0 ? num : null;
  }
  return null;
}

function roundForCurrency(code: SupportedCurrency, val: number): number {
  const decimals = FX_STREET_BOUNDS[code].roundDecimals;
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

function isSaneStreetFx(code: SupportedCurrency, val: number | null): val is number {
  if (val === null) return false;
  const bounds = FX_STREET_BOUNDS[code];
  return val >= bounds.min && val <= bounds.max;
}

function sanitizeGroundedPayload(raw: unknown): GroundedOnGroundMarketData {
  const record = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rawFx = (record.fx && typeof record.fx === 'object' ? record.fx : {}) as Record<
    string,
    unknown
  >;
  const rawGold = (record.gold && typeof record.gold === 'object' ? record.gold : {}) as Record<
    string,
    unknown
  >;
  const rawComm = (
    record.commodities && typeof record.commodities === 'object' ? record.commodities : {}
  ) as Record<string, unknown>;

  let updatedAssetsCount = 0;

  // 1. Validate & normalize FX (street buy/sell + CBM official + bank online/WR)
  const fx: Partial<Record<SupportedCurrency, GroundedFxQuote>> = {};
  const codes: SupportedCurrency[] = ['USD', 'THB', 'SGD', 'EUR', 'MYR', 'CNY'];
  for (const code of codes) {
    const item = (rawFx[code] && typeof rawFx[code] === 'object' ? rawFx[code] : null) as Record<
      string,
      unknown
    > | null;
    if (!item) continue;

    let sell = parsePositiveNumber(item.sellRate);
    let buy = parsePositiveNumber(item.buyRate);

    if (!isSaneStreetFx(code, sell)) sell = null;
    if (!isSaneStreetFx(code, buy)) buy = null;

    if (sell === null && buy === null) continue;
    if (sell === null && buy !== null) {
      sell = roundForCurrency(code, buy * 1.015);
    }
    if (buy === null && sell !== null) {
      buy = roundForCurrency(code, sell * 0.985);
    }

    if (buy !== null && sell !== null) {
      if (buy > sell) {
        const tmp = buy;
        buy = sell;
        sell = tmp;
      }

      const cbm = parsePositiveNumber(item.cbmOfficialRate);
      const online = parsePositiveNumber(item.onlineTradingRate);
      const wr = parsePositiveNumber(item.workerRemittanceRate);

      fx[code] = {
        buyRate: roundForCurrency(code, buy),
        sellRate: roundForCurrency(code, sell),
        cbmOfficialRate: isSaneMmkRate(code, cbm) ? roundForCurrency(code, cbm) : undefined,
        onlineTradingRate: isSaneMmkRate(code, online) ? roundForCurrency(code, online) : undefined,
        workerRemittanceRate: isSaneMmkRate(code, wr) ? roundForCurrency(code, wr) : undefined,
        sourceLabel:
          typeof item.sourceLabel === 'string' && item.sourceLabel.trim()
            ? item.sourceLabel.trim().slice(0, 64)
            : undefined,
      };
      updatedAssetsCount += 1;
    }
  }

  // 2. Validate & normalize Gold buying/selling, YGEA, Spot & Trusted Gold Shops
  const gold: GroundedGoldQuote = {};
  const g24Sell = parsePositiveNumber(rawGold.gold24kSell);
  const g24Buy = parsePositiveNumber(rawGold.gold24kBuy);
  if (isSane24kMmkGold(g24Sell)) {
    gold.gold24kSell = Math.round(g24Sell);
    updatedAssetsCount += 1;
  }
  if (g24Buy !== null && g24Buy >= 8000000 && g24Buy <= (gold.gold24kSell ?? 16000000)) {
    gold.gold24kBuy = Math.round(g24Buy);
  }

  const g15Sell = parsePositiveNumber(rawGold.gold15peSell);
  const g15Buy = parsePositiveNumber(rawGold.gold15peBuy);
  if (g15Sell !== null && g15Sell >= 7500000 && g15Sell <= 15000000) {
    gold.gold15peSell = Math.round(g15Sell);
    updatedAssetsCount += 1;
  }
  if (g15Buy !== null && g15Buy >= 7000000 && g15Buy <= (gold.gold15peSell ?? 15000000)) {
    gold.gold15peBuy = Math.round(g15Buy);
  }

  const ygea = parsePositiveNumber(rawGold.ygeaOfficial);
  if (isSaneYgeaMmkGold(ygea)) {
    gold.ygeaOfficial = Math.round(ygea);
  }

  const xau = parsePositiveNumber(rawGold.xauUsdSpot);
  if (xau !== null && xau >= 1500 && xau <= 8000) {
    gold.xauUsdSpot = Number(xau.toFixed(2));
  }

  const xag = parsePositiveNumber(rawGold.xagUsdSpot);
  if (xag !== null && xag >= 15 && xag <= 150) {
    gold.xagUsdSpot = Number(xag.toFixed(2));
  }

  if (typeof rawGold.shopName === 'string' && rawGold.shopName.trim()) {
    gold.shopName = rawGold.shopName.trim().slice(0, 64);
  }

  if (Array.isArray(rawGold.trustedShops)) {
    const validShops: GroundedTrustedShopPrice[] = [];
    for (const entry of rawGold.trustedShops) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      const id = typeof e.id === 'string' ? e.id.trim() : '';
      const rate24 = parsePositiveNumber(e.gold24kRate);
      if (!VALID_SHOP_IDS.has(id) || !isSane24kMmkGold(rate24)) continue;
      const rounded24 = Math.round(rate24);
      const rate15 = parsePositiveNumber(e.gold15peRate);
      validShops.push({
        id,
        gold24kRate: rounded24,
        gold15peRate:
          rate15 !== null && rate15 >= 7500000 && rate15 <= rounded24
            ? Math.round(rate15)
            : Math.round(((rounded24 * 15) / 16) / 1000) * 1000,
      });
    }
    if (validShops.length > 0) {
      gold.trustedShops = validShops;
    }
  }

  // 3. Validate & normalize On-Ground & Official Commodity Retail Rates
  const commodities: GroundedCommodityRates = {};
  const checkBound = (val: unknown, min: number, max: number, countAsset = false): number | undefined => {
    const n = parsePositiveNumber(val);
    if (n !== null && n >= min && n <= max) {
      if (countAsset) updatedAssetsCount += 1;
      return Math.round(n);
    }
    return undefined;
  };

  commodities.fuel92 = checkBound(rawComm.fuel92, 1800, 7000, true);
  commodities.fuel92Official = checkBound(rawComm.fuel92Official, 1800, 6500);
  commodities.fuel95 = checkBound(rawComm.fuel95, 1800, 7500, true);
  commodities.fuel95Official = checkBound(rawComm.fuel95Official, 1800, 7000);
  commodities.diesel = checkBound(rawComm.diesel, 1800, 7500, true);
  commodities.dieselOfficial = checkBound(rawComm.dieselOfficial, 1800, 7000);
  commodities.premiumDiesel = checkBound(rawComm.premiumDiesel, 1800, 8000, true);
  commodities.premiumDieselOfficial = checkBound(rawComm.premiumDieselOfficial, 1800, 7500);
  commodities.oilPalm = checkBound(rawComm.oilPalm, 7000, 25000, true);
  commodities.oilPalmOfficial = checkBound(rawComm.oilPalmOfficial, 4000, 15000);
  commodities.oilPeanut = checkBound(rawComm.oilPeanut, 10000, 40000, true);
  commodities.oilSesame = checkBound(rawComm.oilSesame, 10000, 40000, true);
  commodities.riceShwebo = checkBound(rawComm.riceShwebo, 90000, 350000, true);
  commodities.riceShweboOfficial = checkBound(rawComm.riceShweboOfficial, 80000, 280000);
  commodities.riceAyeyarwady = checkBound(rawComm.riceAyeyarwady, 70000, 280000, true);
  commodities.riceEmata = checkBound(rawComm.riceEmata, 50000, 220000, true);

  const onGroundSummaryMm =
    typeof record.onGroundSummaryMm === 'string' && record.onGroundSummaryMm.trim()
      ? record.onGroundSummaryMm.trim().slice(0, 280)
      : undefined;

  return {
    fx,
    gold,
    commodities,
    onGroundSummaryMm,
    updatedAssetsCount,
  };
}

export async function fetchOnGroundRatesViaGoogleSearch(options?: {
  aiClient?: GoogleGenAI | null;
  forceRefresh?: boolean;
}): Promise<GroundedMarketSearchResult> {
  const forceRefresh = Boolean(options?.forceRefresh);
  const now = Date.now();
  const nowIso = new Date().toISOString();

  hydrateSearchCacheFromDisk();

  if (cachedSearchResult && !forceRefresh) {
    if (cachedSearchResult.isError) {
      const cooldownEnd =
        cachedSearchResult.cooldownUntilMs ??
        cachedSearchResult.fetchedAtMs + ERROR_RETRY_COOLDOWN_MS;
      if (now < cooldownEnd) {
        return {
          ...cachedSearchResult.result,
          source: {
            ...cachedSearchResult.result.source,
            status: lastKnownGoodResult ? 'cached' : 'fallback',
          },
        };
      }
    } else if (now - cachedSearchResult.fetchedAtMs < TRUSTED_SHOPS_CACHE_TTL_MS) {
      return {
        ...cachedSearchResult.result,
        source: {
          ...cachedSearchResult.result.source,
          status: 'cached',
        },
      };
    }
  }

  if (inflightSearchPromise && !forceRefresh) {
    return inflightSearchPromise;
  }

  const aiClient = options?.aiClient;
  if (!aiClient) {
    return {
      data: null,
      summary: {
        grounded: false,
        lastSearchedAt: nowIso,
        searchQueries: [],
        sources: [],
        updatedAssetsCount: 0,
        error: 'GEMINI_API_KEY is not configured on the server; Google Search data gathering unavailable.',
      },
      source: {
        id: 'google-search-rates',
        nameMm: 'Google Search စျေးကွက်ဒေတာ စုစည်းမှု (Primary Search Grounding)',
        nameEn: 'Google Search Grounded Market Feed',
        category: 'google_search',
        url: 'https://www.google.com',
        status: 'fallback',
        lastFetched: nowIso,
        noteMm: 'GEMINI_API_KEY မရှိသေးသဖြင့် Google Search Grounding မစတင်နိုင်သေးပါ။',
      },
    };
  }

  const runSearch = async (): Promise<GroundedMarketSearchResult> => {
    const started = Date.now();
    const todayStr = getYangonDateString();
    const timeLabel = getYangonClockLabel();

    try {
      const prompt = `Today is ${todayStr} (Asia/Yangon).
Using Google Search, gather the latest Myanmar on-ground buying & selling market rates plus official reference rates:

1. FX in MMK per 1 unit (USD, THB, SGD, EUR, MYR, CNY):
   - Street/Hundi buyRate and sellRate (NOT the 2,100 CBM peg or 3,670 online trading rate)
   - CBM cbmOfficialRate, Bank onlineTradingRate, workerRemittanceRate

2. Gold in MMK per 1 Kyat-tha (16.329g) + Global Spot USD/oz:
   - Open market 24K Pure Gold (16-Pe) sell (gold24kSell) and buy-back (gold24kBuy)
   - 15-Pe Jewelry Gold sell (gold15peSell) and buy-back (gold15peBuy)
   - YGEA reference (ygeaOfficial), Global XAU/USD (xauUsdSpot), Silver XAG/USD (xagUsdSpot)
   - Myanmar gold shops if found (shop-aung-thamardi, shop-tate-sein, shop-academy, shop-zwe-htet, shop-u-hton)

3. Essential Commodities (Yangon/Mandalay on-ground retail + official caps in MMK):
   - Fuel/L: Octane 92 (fuel92, fuel92Official), Octane 95 (fuel95, fuel95Official), Diesel (diesel, dieselOfficial), Premium Diesel (premiumDiesel, premiumDieselOfficial)
   - Cooking Oil/Viss: Palm Oil (oilPalm, oilPalmOfficial), Peanut Oil (oilPeanut), Sesame Oil (oilSesame)
   - Rice/24-pyi Bag: Shwebo Pawsan (riceShwebo, riceShweboOfficial), Ayeyarwady Pawsan (riceAyeyarwady), Emata (riceEmata)

Return ONLY raw valid JSON (no markdown fences, null if unverified):
{
  "fx": {
    "USD": { "buyRate": number | null, "sellRate": number | null, "cbmOfficialRate": number | null, "onlineTradingRate": number | null, "workerRemittanceRate": number | null, "sourceLabel": "string | null" },
    "THB": { "buyRate": number | null, "sellRate": number | null, "cbmOfficialRate": number | null, "onlineTradingRate": number | null, "workerRemittanceRate": number | null, "sourceLabel": "string | null" },
    "SGD": { "buyRate": number | null, "sellRate": number | null, "cbmOfficialRate": number | null, "onlineTradingRate": number | null, "workerRemittanceRate": number | null, "sourceLabel": "string | null" },
    "EUR": { "buyRate": number | null, "sellRate": number | null, "cbmOfficialRate": number | null, "onlineTradingRate": number | null, "workerRemittanceRate": number | null, "sourceLabel": "string | null" },
    "MYR": { "buyRate": number | null, "sellRate": number | null, "cbmOfficialRate": number | null, "onlineTradingRate": number | null, "workerRemittanceRate": number | null, "sourceLabel": "string | null" },
    "CNY": { "buyRate": number | null, "sellRate": number | null, "cbmOfficialRate": number | null, "onlineTradingRate": number | null, "workerRemittanceRate": number | null, "sourceLabel": "string | null" }
  },
  "gold": {
    "gold24kSell": number | null,
    "gold24kBuy": number | null,
    "gold15peSell": number | null,
    "gold15peBuy": number | null,
    "ygeaOfficial": number | null,
    "xauUsdSpot": number | null,
    "xagUsdSpot": number | null,
    "shopName": "string | null",
    "trustedShops": [
      { "id": "shop-aung-thamardi" | "shop-tate-sein" | "shop-academy" | "shop-zwe-htet" | "shop-u-hton", "gold24kRate": number | null, "gold15peRate": number | null }
    ]
  },
  "commodities": {
    "fuel92": number | null,
    "fuel92Official": number | null,
    "fuel95": number | null,
    "fuel95Official": number | null,
    "diesel": number | null,
    "dieselOfficial": number | null,
    "premiumDiesel": number | null,
    "premiumDieselOfficial": number | null,
    "oilPalm": number | null,
    "oilPalmOfficial": number | null,
    "oilPeanut": number | null,
    "oilSesame": number | null,
    "riceShwebo": number | null,
    "riceShweboOfficial": number | null,
    "riceAyeyarwady": number | null,
    "riceEmata": number | null
  },
  "onGroundSummaryMm": "1-2 concise sentences in Burmese Unicode summarizing today's on-ground buying/selling prices and spreads found via Google Search."
}`;

      const { response, modelUsed } = await executeGroundedSearchWithQuotaGuard({
        aiClient,
        prompt,
        timeoutMs: GROUND_SEARCH_TIMEOUT_MS,
        label: 'Market Grounding',
        systemInstruction:
          'You are a Myanmar market data researcher. Use Google Search to gather latest on-ground buying and selling MMK rates (FX, 24K/15-Pe Gold, World Spot Gold, Fuel, Edible Oils, Rice) alongside CBM/YGEA/PPRD/DOCA benchmarks. Never confuse the 2,100 CBM peg with street USD rates. Output strictly raw valid JSON only.',
      });

      const latencyMs = Date.now() - started;
      const metadata = response.candidates?.[0]?.groundingMetadata;
      const chunks = metadata?.groundingChunks || [];
      const searchQueries = Array.isArray(metadata?.webSearchQueries)
        ? metadata.webSearchQueries.filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
        : [];

      const sources: GroundingSourceLink[] = [];
      const seenUris = new Set<string>();
      for (const chunk of chunks) {
        const uri = chunk.web?.uri;
        const title = chunk.web?.title || uri;
        if (uri && !seenUris.has(uri)) {
          seenUris.add(uri);
          sources.push({ title: title || 'Google Search Source', uri });
        }
      }

      const rawText = (response.text || '').trim();
      const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Google Search grounding did not return structured JSON rates.');
      }

      const parsedJson = JSON.parse(jsonMatch[0]);
      const data = sanitizeGroundedPayload(parsedJson);
      const completedIso = new Date().toISOString();

      const usdNote = data.fx.USD
        ? `USD ${data.fx.USD.buyRate.toLocaleString()}/${data.fx.USD.sellRate.toLocaleString()} Ks`
        : null;
      const goldNote = data.gold.gold24kSell
        ? `24K ${data.gold.gold24kSell.toLocaleString()} Ks`
        : null;
      const highlights = [usdNote, goldNote].filter(Boolean).join(' · ');

      const result: GroundedMarketSearchResult = {
        data,
        summary: {
          grounded: sources.length > 0 || data.updatedAssetsCount > 0,
          lastSearchedAt: completedIso,
          latencyMs,
          searchQueries,
          sources,
          onGroundSummaryMm: data.onGroundSummaryMm,
          updatedAssetsCount: data.updatedAssetsCount,
          error: null,
        },
        source: {
          id: 'google-search-rates',
          nameMm: 'Google Search စျေးကွက်ဒေတာ စုစည်းမှု (Primary Grounding)',
          nameEn: 'Google Search Market Data Engine',
          category: 'google_search',
          url: sources[0]?.uri || 'https://www.google.com',
          status: 'live',
          lastFetched: completedIso,
          latencyMs,
          noteMm: `${timeLabel} MMT · ${highlights || `${data.updatedAssetsCount} rates`} (${sources.length} sources via ${modelUsed})`,
        },
      };

      lastKnownGoodResult = result;
      const cacheEntry: CachedSearchState = {
        result,
        fetchedAtMs: Date.now(),
        isError: false,
      };
      cachedSearchResult = cacheEntry;
      persistSearchCacheToDisk(cacheEntry);
      return result;
    } catch (err) {
      const latencyMs = Date.now() - started;
      const isQuota = isQuotaOrRateLimitError(err);
      const cleanError = formatQuotaErrorMessage(err, 'Google Search');
      const retryDelayMs = parseRetryDelayMs(err);
      const cooldownMs = Math.min(
        Math.max(retryDelayMs ?? ERROR_RETRY_COOLDOWN_MS, 60 * 1000),
        10 * 60 * 1000
      );

      console.warn('Google Search market gathering warning:', cleanError);

      if (lastKnownGoodResult && lastKnownGoodResult.data) {
        const retained: GroundedMarketSearchResult = {
          ...lastKnownGoodResult,
          summary: {
            ...lastKnownGoodResult.summary,
            error: cleanError,
          },
          source: {
            ...lastKnownGoodResult.source,
            status: 'cached',
            noteMm: `${lastKnownGoodResult.source.noteMm} (Cached)`,
          },
        };
        cachedSearchResult = {
          result: retained,
          fetchedAtMs: Date.now(),
          cooldownUntilMs: Date.now() + cooldownMs,
          isError: true,
        };
        return retained;
      }

      const fallbackIso = new Date().toISOString();
      const errResult: GroundedMarketSearchResult = {
        data: null,
        summary: {
          grounded: false,
          lastSearchedAt: fallbackIso,
          latencyMs,
          searchQueries: [],
          sources: [],
          updatedAssetsCount: 0,
          error: cleanError,
        },
        source: {
          id: 'google-search-rates',
          nameMm: 'Google Search စျေးကွက်ဒေတာ စုစည်းမှု (Primary Grounding)',
          nameEn: 'Google Search Market Data Engine',
          category: 'google_search',
          url: 'https://www.google.com',
          status: 'fallback',
          lastFetched: fallbackIso,
          latencyMs,
          noteMm: isQuota
            ? 'Google Search API quota ယာယီပြည့်နေသဖြင့် အခြေခံစံနှုန်းများကို ပြသထားသည်'
            : cleanError,
        },
      };

      cachedSearchResult = {
        result: errResult,
        fetchedAtMs: Date.now(),
        cooldownUntilMs: Date.now() + cooldownMs,
        isError: true,
      };
      return errResult;
    }
  };

  inflightSearchPromise = runSearch();
  try {
    return await inflightSearchPromise;
  } finally {
    inflightSearchPromise = null;
  }
}
