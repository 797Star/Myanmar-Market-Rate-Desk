import type {
  CommodityQuote,
  CurrencyQuote,
  GoldQuote,
  InflationBasketItem,
} from '../types.ts';
import { calcSpread, syncBasketWithCommodities } from '../utils/quoteHelpers.ts';

export interface ExternalFeedOverrides {
  gold: Map<string, { market?: number; official?: number }>;
  currency: Map<string, { marketSell?: number; marketBuy?: number; official?: number; online?: number }>;
  commodity: Map<string, { market?: number; official?: number }>;
  updatedAt: string | null;
  recordCount: number;
}

function parseFinitePositive(val: unknown): number | undefined {
  if (typeof val === 'number') {
    return Number.isFinite(val) && val > 0 ? val : undefined;
  }
  if (typeof val === 'string') {
    const cleaned = val.replace(/,/g, '').trim();
    if (!cleaned) return undefined;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
  return undefined;
}

function normalizeKey(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
}

function parseGoogleVisualizationJson(rawText: string): Record<string, unknown>[] {
  const startIdx = rawText.indexOf('{');
  const endIdx = rawText.lastIndexOf('}');
  if (startIdx === -1 || endIdx <= startIdx) {
    throw new Error('Invalid Google Sheet JSON payload');
  }
  const jsonSlice = rawText.slice(startIdx, endIdx + 1);
  const parsed = JSON.parse(jsonSlice) as {
    table?: {
      cols?: Array<{ label?: string; id?: string }>;
      rows?: Array<{ c?: Array<{ v?: unknown; f?: string } | null> }>;
    };
  };

  const cols = parsed?.table?.cols || [];
  const rows = parsed?.table?.rows || [];
  if (cols.length === 0 || rows.length === 0) return [];

  const headers = cols.map((col, idx) =>
    normalizeKey(col.label || col.id || `col${idx}`)
  );

  return rows.map((row) => {
    const record: Record<string, unknown> = {};
    (row.c || []).forEach((cell, idx) => {
      const key = headers[idx] || `col${idx}`;
      record[key] = cell?.v ?? cell?.f ?? '';
    });
    return record;
  });
}

function ingestRowRecord(row: Record<string, unknown>, out: ExternalFeedOverrides): void {
  const lowered: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    lowered[normalizeKey(k)] = v;
  }

  const assetId = String(
    lowered.id ?? lowered.assetid ?? lowered.code ?? lowered.symbol ?? lowered.key ?? ''
  ).trim();
  if (!assetId) return;

  const category = String(lowered.category ?? lowered.type ?? lowered.assettype ?? '').toLowerCase();
  const marketVal = parseFinitePositive(
    lowered.marketrate ??
      lowered.streetrate ??
      lowered.openmarketrate ??
      lowered.marketsellrate ??
      lowered.sell ??
      lowered.price ??
      lowered.rate
  );
  const buyVal = parseFinitePositive(lowered.marketbuyrate ?? lowered.buy ?? lowered.buyrate);
  const officialVal = parseFinitePositive(
    lowered.officialrate ??
      lowered.referencerate ??
      lowered.cbmofficialrate ??
      lowered.officialrefrate ??
      lowered.ygearate ??
      lowered.pprdrate ??
      lowered.reference
  );
  const onlineVal = parseFinitePositive(lowered.onlinetradingrate ?? lowered.online);

  if (marketVal === undefined && officialVal === undefined && buyVal === undefined) {
    return;
  }

  const upperCode = assetId.toUpperCase();
  const isCurrency =
    category.includes('currency') ||
    category.includes('fx') ||
    ['USD', 'THB', 'EUR', 'SGD', 'MYR', 'CNY', 'JPY'].includes(upperCode);

  if (isCurrency) {
    out.currency.set(upperCode, {
      marketSell: marketVal,
      marketBuy: buyVal,
      official: officialVal,
      online: onlineVal,
    });
    out.recordCount += 1;
    return;
  }

  const isGold = category.includes('gold') || assetId.startsWith('gold-');
  if (isGold) {
    out.gold.set(assetId, { market: marketVal, official: officialVal });
    out.recordCount += 1;
    return;
  }

  out.commodity.set(assetId, { market: marketVal, official: officialVal });
  out.recordCount += 1;
}

export function parseExternalFeedPayload(rawText: string): ExternalFeedOverrides {
  const out: ExternalFeedOverrides = {
    gold: new Map(),
    currency: new Map(),
    commodity: new Map(),
    updatedAt: null,
    recordCount: 0,
  };

  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error('Empty feed response');
  }

  // Handle Google Sheets Visualization response: /*O_o*/\ngoogle.visualization.Query.setResponse({...});
  if (trimmed.includes('google.visualization.Query.setResponse')) {
    const rows = parseGoogleVisualizationJson(trimmed);
    rows.forEach((r) => ingestRowRecord(r, out));
    if (out.recordCount === 0) {
      throw new Error('No recognizable asset rows found in Google Sheet JSON');
    }
    return out;
  }

  const json = JSON.parse(trimmed) as unknown;

  if (Array.isArray(json)) {
    json.forEach((item) => {
      if (item && typeof item === 'object') {
        ingestRowRecord(item as Record<string, unknown>, out);
      }
    });
    if (out.recordCount === 0) {
      throw new Error('No valid rate rows in JSON array');
    }
    return out;
  }

  if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>;
    if (typeof obj.updatedAt === 'string') out.updatedAt = obj.updatedAt;
    else if (typeof obj.timestamp === 'string') out.updatedAt = obj.timestamp;
    else if (typeof obj.lastUpdated === 'string') out.updatedAt = obj.lastUpdated;

    const arrayBuckets = [obj.gold, obj.currencies, obj.commodities, obj.rates, obj.rows, obj.data];
    for (const bucket of arrayBuckets) {
      if (Array.isArray(bucket)) {
        bucket.forEach((item) => {
          if (item && typeof item === 'object') {
            ingestRowRecord(item as Record<string, unknown>, out);
          }
        });
      }
    }

    if (out.recordCount === 0) {
      throw new Error('REST JSON response did not include recognizable rate records');
    }
    return out;
  }

  throw new Error('Unsupported feed JSON format');
}

export function applyExternalFeedToQuotes(params: {
  overrides: ExternalFeedOverrides;
  goldQuotes: GoldQuote[];
  currencyQuotes: CurrencyQuote[];
  commodityQuotes: CommodityQuote[];
  basket: InflationBasketItem[];
  sourceLabel: string;
}): {
  gold: GoldQuote[];
  currencies: CurrencyQuote[];
  commodities: CommodityQuote[];
  basket: InflationBasketItem[];
} {
  const { overrides, goldQuotes, currencyQuotes, commodityQuotes, basket, sourceLabel } = params;

  const gold = goldQuotes.map((g) => {
    const ov = overrides.gold.get(g.id);
    if (!ov) return g;
    const marketRate = ov.market ?? g.marketRate;
    const officialRate = ov.official ?? g.officialRate;
    return {
      ...g,
      marketRate,
      officialRate,
      ...calcSpread(marketRate, officialRate),
      sourceMarket: sourceLabel,
    };
  });

  const currencies = currencyQuotes.map((c) => {
    const ov = overrides.currency.get(c.code);
    if (!ov) return c;
    const marketSellRate = ov.marketSell ?? c.marketSellRate;
    const marketBuyRate = ov.marketBuy ?? c.marketBuyRate;
    const cbmOfficialRate = ov.official ?? c.cbmOfficialRate;
    const onlineTradingRate = ov.online ?? c.onlineTradingRate;
    return {
      ...c,
      marketSellRate,
      marketBuyRate,
      cbmOfficialRate,
      onlineTradingRate,
      ...calcSpread(marketSellRate, cbmOfficialRate),
      sourceMarket: sourceLabel,
    };
  });

  const commodities = commodityQuotes.map((cm) => {
    const ov = overrides.commodity.get(cm.id);
    if (!ov) return cm;
    const openMarketRate = ov.market ?? cm.openMarketRate;
    const officialRefRate = ov.official ?? cm.officialRefRate;
    const { spreadPercent } = calcSpread(openMarketRate, officialRefRate);
    return {
      ...cm,
      openMarketRate,
      officialRefRate,
      spreadPercent,
      sourceMarket: sourceLabel,
    };
  });

  return {
    gold,
    currencies,
    commodities,
    basket: syncBasketWithCommodities(basket, commodities),
  };
}
