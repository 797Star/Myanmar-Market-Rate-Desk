import type { DataSourceStatus, MarketNewsHeadline } from '../types.ts';
import {
  USER_AGENT,
  isSane24kMmkGold,
  isSaneYgeaMmkGold,
  stripHtmlToText,
  withSourceResilience,
  type SupportedCurrency,
} from './pipelineUtils.ts';

export interface TelegramChannelConfig {
  slug: string;
  label: string;
  focus: 'market' | 'news';
}

export interface TelegramMarketObservations {
  fxBuy: Partial<Record<SupportedCurrency, number[]>>;
  fxSell: Partial<Record<SupportedCurrency, number[]>>;
  gold24kSell: number[];
  gold24kBuy: number[];
  gold15peSell: number[];
  ygeaOfficial: number[];
  fuel92: number[];
  fuel95: number[];
  diesel: number[];
  oilPalm: number[];
  riceShwebo: number[];
  activeChannelsCount: number;
  parsedMessagesCount: number;
  channelLabels: string[];
  source: DataSourceStatus;
}

export const DEFAULT_TELEGRAM_CHANNELS: TelegramChannelConfig[] = [
  { slug: 'myanmargoldprice', label: 'Myanmar Gold Desk (t.me)', focus: 'market' },
  { slug: 'mmkexchange', label: 'MMK Exchange Desk (t.me)', focus: 'market' },
  { slug: 'shwebonthagold', label: 'Shwebontha Bullion (t.me)', focus: 'market' },
  { slug: 'elevenmedia', label: 'Eleven Media Wire (t.me)', focus: 'news' },
  { slug: 'frontiermyanmar', label: 'Frontier Myanmar Wire (t.me)', focus: 'news' },
];

const CHANNEL_SLUG_REGEX = /^[a-zA-Z0-9_]{4,48}$/;
const TELEGRAM_FETCH_TIMEOUT_MS = 5000;
const MAX_MESSAGE_AGE_MS = 72 * 60 * 60 * 1000; // 72 hours

const FX_BOUNDS: Record<SupportedCurrency, { min: number; max: number }> = {
  USD: { min: 3800, max: 9000 },
  THB: { min: 100, max: 280 },
  SGD: { min: 2800, max: 7500 },
  EUR: { min: 4000, max: 10500 },
  MYR: { min: 800, max: 2400 },
  CNY: { min: 500, max: 1400 },
  JPY: { min: 22, max: 80 },
};

export function sanitizeTelegramChannelSlug(raw: string): string | null {
  let clean = raw.trim();
  if (!clean) return null;
  clean = clean
    .replace(/^https?:\/\/(www\.)?(t\.me|telegram\.me)\/(s\/)?/i, '')
    .replace(/^@/, '')
    .split(/[/?#]/)[0]
    .trim();
  if (!CHANNEL_SLUG_REGEX.test(clean)) return null;
  return clean;
}

export function parseTelegramChannelListInput(rawList: unknown): string[] {
  if (!Array.isArray(rawList)) return [];
  const valid: string[] = [];
  const seen = new Set<string>();
  for (const item of rawList) {
    if (typeof item !== 'string') continue;
    const slug = sanitizeTelegramChannelSlug(item);
    if (slug && !seen.has(slug.toLowerCase())) {
      seen.add(slug.toLowerCase());
      valid.push(slug);
      if (valid.length >= 10) break;
    }
  }
  return valid;
}

interface ParsedTelegramPost {
  text: string;
  timestampMs: number;
  url: string;
}

function extractTelegramPostsFromHtml(html: string, slug: string): ParsedTelegramPost[] {
  const posts: ParsedTelegramPost[] = [];
  const nowMs = Date.now();
  const blocks = html.split(/<div class="tgme_widget_message\b/i).slice(1);

  for (const block of blocks.slice(-15)) {
    const timeMatch = block.match(/datetime="([^"]+)"/i);
    const parsedTimeMs = timeMatch ? Date.parse(timeMatch[1]) : NaN;
    const timestampMs = Number.isFinite(parsedTimeMs) ? parsedTimeMs : nowMs;
    if (nowMs - timestampMs > MAX_MESSAGE_AGE_MS) continue;

    const textMatch = block.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (!textMatch) continue;
    const cleanText = stripHtmlToText(textMatch[1]);
    if (cleanText.length < 8) continue;

    const postLinkMatch = block.match(/data-post="([^"]+)"/i);
    const postUrl = postLinkMatch
      ? `https://t.me/${postLinkMatch[1]}`
      : `https://t.me/s/${slug}`;

    posts.push({ text: cleanText, timestampMs, url: postUrl });
  }
  return posts;
}

function extractNumberCandidates(segment: string): number[] {
  const matches = segment.match(/\d{2,3}(?:,\d{3})+(?:\.\d{1,2})?|\d{2,8}(?:\.\d{1,2})?/g) || [];
  const nums: number[] = [];
  for (const m of matches) {
    const n = Number.parseFloat(m.replace(/,/g, ''));
    if (Number.isFinite(n) && n > 0) nums.push(n);
  }
  return nums;
}

function parseMarketTextIntoObservations(text: string, out: TelegramMarketObservations): boolean {
  let matchedAny = false;
  const segments = text.split(/[|\n•·;]+/).map((s) => s.trim()).filter(Boolean);

  for (const seg of segments) {
    const lower = seg.toLowerCase();

    // 1. USD Street
    if (/\busd\b|ဒေါ်လာ|dollar/i.test(seg) && !/xau|gold|cbm|peg|2100|2,100/i.test(seg)) {
      const nums = extractNumberCandidates(seg).filter(
        (n) => n >= FX_BOUNDS.USD.min && n <= FX_BOUNDS.USD.max
      );
      if (nums.length >= 2) {
        const sorted = [...nums].sort((a, b) => a - b);
        (out.fxBuy.USD ||= []).push(sorted[0]);
        (out.fxSell.USD ||= []).push(sorted[sorted.length - 1]);
        matchedAny = true;
      } else if (nums.length === 1) {
        (out.fxSell.USD ||= []).push(nums[0]);
        matchedAny = true;
      }
    }

    // 2. THB
    if (/\bthb\b|ဘတ်|baht/i.test(seg)) {
      const nums = extractNumberCandidates(seg).filter(
        (n) => n >= FX_BOUNDS.THB.min && n <= FX_BOUNDS.THB.max
      );
      if (nums.length >= 2) {
        const sorted = [...nums].sort((a, b) => a - b);
        (out.fxBuy.THB ||= []).push(sorted[0]);
        (out.fxSell.THB ||= []).push(sorted[sorted.length - 1]);
        matchedAny = true;
      } else if (nums.length === 1) {
        (out.fxSell.THB ||= []).push(nums[0]);
        matchedAny = true;
      }
    }

    // 3. SGD / EUR / MYR / CNY
    const fxChecks: Array<{ code: SupportedCurrency; pattern: RegExp }> = [
      { code: 'SGD', pattern: /\bsgd\b|စင်ကာပူ/i },
      { code: 'EUR', pattern: /\beur\b|ယူရို/i },
      { code: 'MYR', pattern: /\bmyr\b|ရင်းဂစ်/i },
      { code: 'CNY', pattern: /\bcny\b|ယွမ်/i },
    ];
    for (const check of fxChecks) {
      if (check.pattern.test(seg)) {
        const b = FX_BOUNDS[check.code];
        const nums = extractNumberCandidates(seg).filter((n) => n >= b.min && n <= b.max);
        if (nums.length >= 2) {
          const sorted = [...nums].sort((a, b2) => a - b2);
          (out.fxBuy[check.code] ||= []).push(sorted[0]);
          (out.fxSell[check.code] ||= []).push(sorted[sorted.length - 1]);
          matchedAny = true;
        } else if (nums.length === 1) {
          (out.fxSell[check.code] ||= []).push(nums[0]);
          matchedAny = true;
        }
      }
    }

    // 4. 24K Gold (16-Pe) & 15-Pe Gold & YGEA
    if (/ygea|ရွှေအသင်း|ရည်ညွှန်းရွှေ/i.test(seg)) {
      const nums = extractNumberCandidates(seg).filter((n) => isSaneYgeaMmkGold(n));
      if (nums.length > 0) {
        out.ygeaOfficial.push(nums[0]);
        matchedAny = true;
      }
    } else if (/15\s*ပဲ|၁၅\s*ပဲ|15\s*pe/i.test(seg)) {
      const nums = extractNumberCandidates(seg).filter((n) => n >= 7500000 && n <= 16000000);
      if (nums.length > 0) {
        out.gold15peSell.push(nums[nums.length - 1]);
        matchedAny = true;
      }
    } else if (/24k|16\s*ပဲ|၁၆\s*ပဲ|အခေါက်|gold|ရွှေ/i.test(seg)) {
      const nums = extractNumberCandidates(seg).filter((n) => isSane24kMmkGold(n));
      if (nums.length >= 2) {
        const sorted = [...nums].sort((a, b) => a - b);
        out.gold24kBuy.push(sorted[0]);
        out.gold24kSell.push(sorted[sorted.length - 1]);
        matchedAny = true;
      } else if (nums.length === 1) {
        out.gold24kSell.push(nums[0]);
        matchedAny = true;
      }
    }

    // 5. Fuel & Staples
    if (lower.includes('92') || /octane\s*92|ဓာတ်ဆီ\s*92/i.test(seg)) {
      const nums = extractNumberCandidates(seg).filter((n) => n >= 1800 && n <= 7000);
      if (nums.length > 0) {
        out.fuel92.push(nums[nums.length - 1]);
        matchedAny = true;
      }
    }
    if (lower.includes('95') || /octane\s*95/i.test(seg)) {
      const nums = extractNumberCandidates(seg).filter((n) => n >= 1900 && n <= 7500);
      if (nums.length > 0) {
        out.fuel95.push(nums[nums.length - 1]);
        matchedAny = true;
      }
    }
    if (/diesel|ဒီဇယ်/i.test(seg)) {
      const nums = extractNumberCandidates(seg).filter((n) => n >= 1800 && n <= 7500);
      if (nums.length > 0) {
        out.diesel.push(nums[nums.length - 1]);
        matchedAny = true;
      }
    }
    if (/palm\s*oil|စားအုန်းဆီ/i.test(seg)) {
      const nums = extractNumberCandidates(seg).filter((n) => n >= 7000 && n <= 25000);
      if (nums.length > 0) {
        out.oilPalm.push(nums[nums.length - 1]);
        matchedAny = true;
      }
    }
    if (/shwebo|ရွှေဘို|pawsan|ပေါ်ဆန်း/i.test(seg)) {
      const nums = extractNumberCandidates(seg).filter((n) => n >= 90000 && n <= 350000);
      if (nums.length > 0) {
        out.riceShwebo.push(nums[nums.length - 1]);
        matchedAny = true;
      }
    }
  }

  return matchedAny;
}

async function fetchAllowlistedTelegramPreview(slug: string): Promise<ParsedTelegramPost[]> {
  if (!CHANNEL_SLUG_REGEX.test(slug)) return [];
  const safeUrl = `https://t.me/s/${encodeURIComponent(slug)}`;
  const res = await fetch(safeUrl, {
    signal: AbortSignal.timeout(TELEGRAM_FETCH_TIMEOUT_MS),
    redirect: 'manual',
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
    },
  });
  if (!res.ok) return [];
  const html = await res.text();
  return extractTelegramPostsFromHtml(html, slug);
}

export async function gatherTelegramMarketObservations(
  customChannelSlugs: string[] = []
): Promise<TelegramMarketObservations> {
  return withSourceResilience(`telegram:market:${customChannelSlugs.join(',')}`, async () => {
    const nowIso = new Date().toISOString();
    const started = Date.now();

    const channelMap = new Map<string, TelegramChannelConfig>();
    for (const ch of DEFAULT_TELEGRAM_CHANNELS) {
      if (ch.focus === 'market') channelMap.set(ch.slug.toLowerCase(), ch);
    }
    for (const rawSlug of customChannelSlugs) {
      const clean = sanitizeTelegramChannelSlug(rawSlug);
      if (clean && !channelMap.has(clean.toLowerCase())) {
        channelMap.set(clean.toLowerCase(), {
          slug: clean,
          label: `@${clean} (t.me)`,
          focus: 'market',
        });
      }
    }

    const targets = Array.from(channelMap.values());
    const out: TelegramMarketObservations = {
      fxBuy: {},
      fxSell: {},
      gold24kSell: [],
      gold24kBuy: [],
      gold15peSell: [],
      ygeaOfficial: [],
      fuel92: [],
      fuel95: [],
      diesel: [],
      oilPalm: [],
      riceShwebo: [],
      activeChannelsCount: 0,
      parsedMessagesCount: 0,
      channelLabels: [],
      source: {
        id: 'telegram-market-desks',
        nameMm: 'Telegram ပြင်ပဈေးကွက် Desk များ (t.me/s)',
        nameEn: 'Public Telegram Market Desks',
        category: 'telegram_desk',
        url: targets[0] ? `https://t.me/s/${targets[0].slug}` : 'https://t.me/',
        status: 'fallback',
        lastFetched: nowIso,
        noteMm: 'Telegram public desk များ စစ်ဆေးနေပါသည်',
      },
    };

    const settled = await Promise.allSettled(
      targets.map(async (ch) => {
        const posts = await fetchAllowlistedTelegramPreview(ch.slug);
        return { ch, posts };
      })
    );

    for (const item of settled) {
      if (item.status !== 'fulfilled') continue;
      const { ch, posts } = item.value;
      if (posts.length === 0) continue;

      let channelHadRates = false;
      for (const post of posts) {
        if (parseMarketTextIntoObservations(post.text, out)) {
          channelHadRates = true;
          out.parsedMessagesCount += 1;
        }
      }
      if (channelHadRates) {
        out.activeChannelsCount += 1;
        out.channelLabels.push(ch.label);
      }
    }

    const latencyMs = Date.now() - started;
    const hasObservations = out.parsedMessagesCount > 0;
    out.source = {
      id: 'telegram-market-desks',
      nameMm: 'Telegram ပြင်ပဈေးကွက် Desk များ (t.me/s)',
      nameEn: 'Public Telegram Market Desks',
      category: 'telegram_desk',
      url: targets[0] ? `https://t.me/s/${targets[0].slug}` : 'https://t.me/',
      status: hasObservations ? 'live' : 'fallback',
      lastFetched: nowIso,
      latencyMs,
      noteMm: hasObservations
        ? `Public channel ${out.activeChannelsCount} ခုမှ ဈေးနှုန်း post ${out.parsedMessagesCount} ခု စုစည်းပြီး (Zero Search Quota)`
        : 'လတ်တလော Telegram desk post များမှ ဈေးနှုန်းအသစ် မတွေ့ရှိသေးပါ (Direct API + Search Fallback အသုံးပြုမည်)',
    };

    return out;
  });
}

const ECON_KEYWORDS =
  /gold|kyat|dollar|usd|cbm|central bank|exchange|fuel|petrol|diesel|rice|oil|inflation|trade|economy|market|bank|export|import|ရွှေ|ဒေါ်လာ|ငွေလဲ|ဗဟိုဘဏ်|စီးပွားရေး|ကုန်ဈေးနှုန်း|စက်သုံးဆီ|ဆန်|စားအုန်းဆီ/i;

export async function fetchTelegramEconomicBriefs(
  customChannelSlugs: string[] = []
): Promise<MarketNewsHeadline[]> {
  const slugs = new Set<string>(
    DEFAULT_TELEGRAM_CHANNELS.filter((c) => c.focus === 'news').map((c) => c.slug)
  );
  for (const s of customChannelSlugs) {
    const clean = sanitizeTelegramChannelSlug(s);
    if (clean) slugs.add(clean);
  }

  const settled = await Promise.allSettled(
    Array.from(slugs).map(async (slug) => ({
      slug,
      posts: await fetchAllowlistedTelegramPreview(slug),
    }))
  );

  const headlines: MarketNewsHeadline[] = [];
  for (const res of settled) {
    if (res.status !== 'fulfilled') continue;
    const { slug, posts } = res.value;
    for (const post of posts.slice(-5).reverse()) {
      if (!ECON_KEYWORDS.test(post.text)) continue;
      const snippet = post.text.slice(0, 120).trim();
      const lower = post.text.toLowerCase();
      const category: MarketNewsHeadline['category'] = /gold|ရွှေ/.test(lower)
        ? 'gold'
        : /usd|dollar|cbm|exchange|ဒေါ်လာ|ငွေလဲ/.test(lower)
        ? 'forex'
        : /fuel|oil|rice|ဆန်|ဆီ/.test(lower)
        ? 'commodities'
        : 'macro';

      headlines.push({
        id: `tg-${slug}-${post.timestampMs}`,
        headlineMm: snippet,
        headlineEn: snippet,
        source: `@${slug} (Telegram)`,
        category,
        impact: 'neutral',
        publishedLabel: new Date(post.timestampMs).toLocaleTimeString('en-US', {
          timeZone: 'Asia/Yangon',
          hour: '2-digit',
          minute: '2-digit',
        }),
        url: post.url,
        relatedTab:
          category === 'gold'
            ? 'gold'
            : category === 'forex'
            ? 'forex'
            : category === 'commodities'
            ? 'commodities'
            : 'intel',
      });
      if (headlines.length >= 6) return headlines;
    }
  }
  return headlines;
}
