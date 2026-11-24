import type { DataSourceStatus } from '../types.ts';

export const PIPELINE_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
export const TRUSTED_SHOPS_CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutes for Google Search grounding
export const FETCH_TIMEOUT_MS = 5000; // 5s cap per external upstream source
export const GRAMS_PER_KYATTHA = 16.3293;
export const GRAMS_PER_TROY_OUNCE = 31.1034768;
export const OZ_PER_KYATTHA = GRAMS_PER_KYATTHA / GRAMS_PER_TROY_OUNCE;

export const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export type SupportedCurrency = 'USD' | 'THB' | 'EUR' | 'SGD' | 'MYR' | 'CNY' | 'JPY';

export function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#038;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseNumeric(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, '').trim();
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) && num > 0 ? num : null;
}

export function isSaneMmkRate(code: SupportedCurrency, val: number | null): val is number {
  if (val === null || !Number.isFinite(val)) return false;
  switch (code) {
    case 'USD':
      return val >= 1500 && val <= 15000;
    case 'EUR':
      return val >= 1500 && val <= 18000;
    case 'SGD':
      return val >= 1000 && val <= 12000;
    case 'THB':
      return val >= 40 && val <= 600;
    case 'MYR':
      return val >= 300 && val <= 4000;
    case 'CNY':
      return val >= 200 && val <= 2500;
    case 'JPY':
      return val >= 8 && val <= 2000;
    default:
      return val > 0;
  }
}

export function isSane24kMmkGold(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val) && val >= 8500000 && val <= 16000000;
}

export function isSaneYgeaMmkGold(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val) && val >= 5500000 && val <= 12000000;
}

export async function fetchTextWithTimeout(
  url: string,
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<{ text: string; latencyMs: number }> {
  const started = Date.now();
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json, text/html, */*',
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${url}`);
  }
  const text = await res.text();
  return { text, latencyMs: Date.now() - started };
}

export async function fetchJsonPostWithTimeout<T>(
  url: string,
  body: unknown,
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<{ json: T; latencyMs: number }> {
  const started = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const json = (await res.json()) as T;
  return { json, latencyMs: Date.now() - started };
}

export function getYangonClockLabel(): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Yangon',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(11, 16);
  }
}

/**
 * Wraps individual source fetchers with per-source last-known-good retention
 * so a transient timeout on one upstream site preserves its latest valid payload
 * rather than dropping live rates on partial network hiccups.
 */
interface SourceResultWithStatus {
  source: DataSourceStatus;
}

const lastKnownGoodSourceMap = new Map<string, SourceResultWithStatus>();

export async function withSourceResilience<T extends SourceResultWithStatus>(
  key: string,
  fetcher: () => Promise<T>
): Promise<T> {
  const res = await fetcher();
  if (res.source.status === 'live') {
    lastKnownGoodSourceMap.set(key, res);
    return res;
  }

  const cached = lastKnownGoodSourceMap.get(key) as T | undefined;
  if (cached) {
    return {
      ...cached,
      source: {
        ...cached.source,
        status: 'cached',
        noteMm: `${cached.source.noteMm} (Cached)`,
      },
    };
  }
  return res;
}
