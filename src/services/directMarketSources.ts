import type { DataSourceStatus } from '../types.ts';
import {
  FETCH_TIMEOUT_MS,
  USER_AGENT,
  isSaneMmkRate,
  withSourceResilience,
  type SupportedCurrency,
} from './pipelineUtils.ts';

export interface DirectCbmResult {
  rates: Partial<Record<SupportedCurrency, number>>;
  timestampLabel: string | null;
  source: DataSourceStatus;
}

export interface DirectGlobalCrossResult {
  usdCrossRates: Partial<Record<SupportedCurrency, number>>; // 1 USD = X currency
  source: DataSourceStatus;
}

export interface DirectSpotMetalsResult {
  xauUsdSpot: number | null;
  xagUsdSpot: number | null;
  source: DataSourceStatus;
}

export interface DirectMarketSnapshot {
  cbmRates: Partial<Record<SupportedCurrency, number>>;
  usdCrossRates: Partial<Record<SupportedCurrency, number>>;
  xauUsdSpot: number | null;
  xagUsdSpot: number | null;
  sources: DataSourceStatus[];
  fetchedAtIso: string;
}

const SUPPORTED_CODES: SupportedCurrency[] = ['USD', 'THB', 'EUR', 'SGD', 'MYR', 'CNY', 'JPY'];

function parseNumericRate(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/,/g, '').trim();
    if (!cleaned) return null;
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

async function fetchJsonStrict<T>(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<{ json: T; latencyMs: number }> {
  const started = Date.now();
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'manual',
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const json = (await res.json()) as T;
  return { json, latencyMs: Date.now() - started };
}

export async function fetchCbmOfficialRates(): Promise<DirectCbmResult> {
  return withSourceResilience('direct:cbm', async () => {
    const nowIso = new Date().toISOString();
    try {
      const { json, latencyMs } = await fetchJsonStrict<{
        timestamp?: string;
        rates?: Record<string, string | number>;
      }>('https://forex.cbm.gov.mm/api/latest', 5500);

      const rawRates = json?.rates || {};
      const parsedRates: Partial<Record<SupportedCurrency, number>> = {};

      for (const code of SUPPORTED_CODES) {
        const rawVal = parseNumericRate(rawRates[code]);
        if (rawVal === null) continue;
        // CBM quotes JPY per 100 Yen in their legacy API; normalize to 1 JPY
        const normalized = code === 'JPY' && rawVal > 100 ? Number((rawVal / 100).toFixed(2)) : rawVal;
        if (isSaneMmkRate(code, normalized)) {
          parsedRates[code] = normalized;
        }
      }

      const count = Object.keys(parsedRates).length;
      if (count === 0) {
        throw new Error('CBM JSON returned no valid currency rows');
      }

      return {
        rates: parsedRates,
        timestampLabel: typeof json?.timestamp === 'string' ? json.timestamp : null,
        source: {
          id: 'direct-cbm-api',
          nameMm: 'ဗဟိုဘဏ် (CBM Direct JSON API)',
          nameEn: 'Central Bank of Myanmar Direct API',
          category: 'central_bank',
          url: 'https://forex.cbm.gov.mm/api/latest',
          status: 'live',
          lastFetched: nowIso,
          latencyMs,
          noteMm: `CBM တိုက်ရိုက် API မှ ငွေကြေး ${count} မျိုး ရယူပြီး (Zero Search Quota)`,
        },
      };
    } catch (err) {
      return {
        rates: {},
        timestampLabel: null,
        source: {
          id: 'direct-cbm-api',
          nameMm: 'ဗဟိုဘဏ် (CBM Direct JSON API)',
          nameEn: 'Central Bank of Myanmar Direct API',
          category: 'central_bank',
          url: 'https://forex.cbm.gov.mm/api/latest',
          status: 'fallback',
          lastFetched: nowIso,
          noteMm: `CBM API ခေတ္တချိတ်ဆက်မရပါ (${err instanceof Error ? err.message : 'Timeout'})`,
        },
      };
    }
  });
}

export async function fetchGlobalUsdCrossRates(): Promise<DirectGlobalCrossResult> {
  return withSourceResilience('direct:global_fx', async () => {
    const nowIso = new Date().toISOString();
    try {
      const { json, latencyMs } = await fetchJsonStrict<{
        result?: string;
        rates?: Record<string, number>;
      }>('https://open.er-api.com/v6/latest/USD', 5000);

      const raw = json?.rates || {};
      const usdCrossRates: Partial<Record<SupportedCurrency, number>> = { USD: 1 };
      for (const code of SUPPORTED_CODES) {
        if (code === 'USD') continue;
        const val = parseNumericRate(raw[code]);
        if (val !== null) {
          usdCrossRates[code] = val;
        }
      }

      if (Object.keys(usdCrossRates).length < 4) {
        throw new Error('Incomplete global FX cross-rates');
      }

      return {
        usdCrossRates,
        source: {
          id: 'direct-global-fx',
          nameMm: 'နိုင်ငံတကာ ငွေကြေး Cross-Rate API',
          nameEn: 'Global Interbank FX Cross API',
          category: 'global_fx',
          url: 'https://open.er-api.com/v6/latest/USD',
          status: 'live',
          lastFetched: nowIso,
          latencyMs,
          noteMm: `THB/SGD/EUR/MYR/CNY Cross-Sync ရရှိပြီး (Zero Search Quota)`,
        },
      };
    } catch (err) {
      return {
        usdCrossRates: {},
        source: {
          id: 'direct-global-fx',
          nameMm: 'နိုင်ငံတကာ ငွေကြေး Cross-Rate API',
          nameEn: 'Global Interbank FX Cross API',
          category: 'global_fx',
          url: 'https://open.er-api.com/v6/latest/USD',
          status: 'fallback',
          lastFetched: nowIso,
          noteMm: `Global Cross FX ခေတ္တမရရှိပါ (${err instanceof Error ? err.message : 'Error'})`,
        },
      };
    }
  });
}

export async function fetchGlobalSpotMetals(): Promise<DirectSpotMetalsResult> {
  return withSourceResilience('direct:spot_metals', async () => {
    const nowIso = new Date().toISOString();

    // Endpoint 1: goldprice.org public ticker
    try {
      const { json, latencyMs } = await fetchJsonStrict<{
        items?: Array<{ xauPrice?: number; xagPrice?: number }>;
      }>('https://data-asg.goldprice.org/dbXRates/USD', 4500);

      const first = json?.items?.[0];
      const xau = parseNumericRate(first?.xauPrice);
      const xag = parseNumericRate(first?.xagPrice);
      if (xau !== null && xau >= 1500 && xau <= 8000) {
        const cleanXau = Number(xau.toFixed(2));
        const cleanXag = xag !== null && xag >= 15 && xag <= 150 ? Number(xag.toFixed(2)) : null;
        return {
          xauUsdSpot: cleanXau,
          xagUsdSpot: cleanXag,
          source: {
            id: 'direct-spot-metals',
            nameMm: 'ကမ္ဘာ့ရွှေ/ငွေ Spot API (XAU/USD)',
            nameEn: 'Global Spot Bullion Direct API',
            category: 'gold_api',
            url: 'https://data-asg.goldprice.org/dbXRates/USD',
            status: 'live',
            lastFetched: nowIso,
            latencyMs,
            noteMm: `XAU $${cleanXau.toLocaleString()}/oz တိုက်ရိုက်ရရှိပြီး (Parity Check Ready)`,
          },
        };
      }
    } catch {
      // Fall through to backup endpoint
    }

    // Endpoint 2: gold-api.com fallback
    try {
      const started = Date.now();
      const [xauRes, xagRes] = await Promise.allSettled([
        fetchJsonStrict<{ price?: number }>('https://api.gold-api.com/price/XAU', 4500),
        fetchJsonStrict<{ price?: number }>('https://api.gold-api.com/price/XAG', 4500),
      ]);

      const xau =
        xauRes.status === 'fulfilled' ? parseNumericRate(xauRes.value.json?.price) : null;
      const xag =
        xagRes.status === 'fulfilled' ? parseNumericRate(xagRes.value.json?.price) : null;

      if (xau !== null && xau >= 1500 && xau <= 8000) {
        const cleanXau = Number(xau.toFixed(2));
        const cleanXag = xag !== null && xag >= 15 && xag <= 150 ? Number(xag.toFixed(2)) : null;
        return {
          xauUsdSpot: cleanXau,
          xagUsdSpot: cleanXag,
          source: {
            id: 'direct-spot-metals',
            nameMm: 'ကမ္ဘာ့ရွှေ/ငွေ Spot API (XAU/USD)',
            nameEn: 'Global Spot Bullion Direct API',
            category: 'gold_api',
            url: 'https://api.gold-api.com/price/XAU',
            status: 'live',
            lastFetched: nowIso,
            latencyMs: Date.now() - started,
            noteMm: `XAU $${cleanXau.toLocaleString()}/oz တိုက်ရိုက်ရရှိပြီး (Parity Check Ready)`,
          },
        };
      }
    } catch {
      // Handled below
    }

    return {
      xauUsdSpot: null,
      xagUsdSpot: null,
      source: {
        id: 'direct-spot-metals',
        nameMm: 'ကမ္ဘာ့ရွှေ/ငွေ Spot API (XAU/USD)',
        nameEn: 'Global Spot Bullion Direct API',
        category: 'gold_api',
        url: 'https://data-asg.goldprice.org/dbXRates/USD',
        status: 'fallback',
        lastFetched: nowIso,
        noteMm: 'XAU/USD Spot API ခေတ္တချိတ်ဆက်မရပါ',
      },
    };
  });
}

export async function gatherDirectMarketSources(): Promise<DirectMarketSnapshot> {
  const [cbmRes, crossRes, spotRes] = await Promise.all([
    fetchCbmOfficialRates(),
    fetchGlobalUsdCrossRates(),
    fetchGlobalSpotMetals(),
  ]);

  return {
    cbmRates: cbmRes.rates,
    usdCrossRates: crossRes.usdCrossRates,
    xauUsdSpot: spotRes.xauUsdSpot,
    xagUsdSpot: spotRes.xagUsdSpot,
    sources: [cbmRes.source, crossRes.source, spotRes.source],
    fetchedAtIso: new Date().toISOString(),
  };
}
