import fs from 'fs';
import type { GoogleGenAI } from '@google/genai';
import type { GroundingSourceLink, MarketNewsHeadline, MarketNewsResponse } from '../types.ts';
import { initialIntelligenceReports } from '../data/initialData.ts';
import {
  executeGroundedSearchWithQuotaGuard,
  formatQuotaErrorMessage,
  isQuotaOrRateLimitError,
  parseRetryDelayMs,
} from './geminiSearchClient.ts';
import { USER_AGENT, stripHtmlToText } from './pipelineUtils.ts';
import { fetchTelegramEconomicBriefs } from './telegramMarketScraper.ts';

const NEWS_CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutes to conserve Google Search quota
const NEWS_SEARCH_TIMEOUT_MS = 22000;
const RSS_TIMEOUT_MS = 5000;
const NEWS_DISK_CACHE_PATH = '/tmp/mmw-news-search-cache.json';

const VERIFIED_MYANMAR_RSS_FEEDS: Array<{ url: string; publisher: string }> = [
  { url: 'https://www.frontiermyanmar.net/en/feed/', publisher: 'Frontier Myanmar' },
  { url: 'https://eng.mizzima.com/feed', publisher: 'Mizzima Business' },
  { url: 'https://www.irrawaddy.com/feed', publisher: 'The Irrawaddy' },
];

const ECON_HEADLINE_FILTER =
  /gold|kyat|dollar|usd|cbm|central bank|exchange|currency|fuel|petrol|diesel|rice|palm oil|inflation|trade|economy|economic|bank|import|export|tariff|commodity|remittance|ရွှေ|ဒေါ်လာ|ဗဟိုဘဏ်|စီးပွားရေး|ကုန်ဈေးနှုန်း/i;

interface CachedNewsState {
  payload: MarketNewsResponse;
  fetchedAtMs: number;
  cooldownUntilMs?: number;
}

let cachedNews: CachedNewsState | null = null;
let lastKnownGoodNews: MarketNewsResponse | null = null;
let inflightNewsPromise: Promise<MarketNewsResponse> | null = null;

function hydrateNewsCacheFromDisk(): void {
  if (cachedNews) return;
  try {
    if (!fs.existsSync(NEWS_DISK_CACHE_PATH)) return;
    const raw = fs.readFileSync(NEWS_DISK_CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as CachedNewsState;
    if (
      parsed &&
      parsed.payload &&
      Array.isArray(parsed.payload.headlines) &&
      typeof parsed.fetchedAtMs === 'number'
    ) {
      cachedNews = parsed;
      if (parsed.payload.grounded || parsed.payload.sourceMode === 'rss_telegram') {
        lastKnownGoodNews = parsed.payload;
      }
    }
  } catch {
    // Ignore corrupt cache
  }
}

function persistNewsCacheToDisk(state: CachedNewsState): void {
  if (!state.payload.grounded && state.payload.sourceMode !== 'rss_telegram') return;
  try {
    fs.writeFileSync(NEWS_DISK_CACHE_PATH, JSON.stringify(state), 'utf8');
  } catch {
    // Ignore write error
  }
}

function normalizeCategory(raw: unknown): MarketNewsHeadline['category'] {
  if (raw === 'gold' || raw === 'forex' || raw === 'commodities' || raw === 'macro') {
    return raw;
  }
  return 'macro';
}

function normalizeImpact(raw: unknown): MarketNewsHeadline['impact'] {
  if (raw === 'up' || raw === 'down' || raw === 'policy' || raw === 'neutral') {
    return raw;
  }
  return 'neutral';
}

function mapCategoryToTab(cat: MarketNewsHeadline['category']): MarketNewsHeadline['relatedTab'] {
  switch (cat) {
    case 'gold':
      return 'gold';
    case 'forex':
      return 'forex';
    case 'commodities':
      return 'commodities';
    default:
      return 'intel';
  }
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .trim();
}

function classifyHeadlineCategory(text: string): MarketNewsHeadline['category'] {
  const lower = text.toLowerCase();
  if (/\bgold\b|bullion|ygea|ရွှေ/.test(lower)) return 'gold';
  if (/\bkyat\b|\bdollar\b|\busd\b|cbm|currency|exchange|remittance|ဒေါ်လာ|ငွေလဲ/.test(lower)) {
    return 'forex';
  }
  if (/\bfuel\b|\bpetrol\b|\bdiesel\b|\brice\b|palm oil|စက်သုံးဆီ|ဆန်|စားအုန်းဆီ/.test(lower)) {
    return 'commodities';
  }
  return 'macro';
}

async function fetchRssEconomicHeadlines(): Promise<{
  headlines: MarketNewsHeadline[];
  sources: GroundingSourceLink[];
}> {
  const headlines: MarketNewsHeadline[] = [];
  const sources: GroundingSourceLink[] = [];
  const seenUrls = new Set<string>();

  const settled = await Promise.allSettled(
    VERIFIED_MYANMAR_RSS_FEEDS.map(async (feed) => {
      const res = await fetch(feed.url, {
        signal: AbortSignal.timeout(RSS_TIMEOUT_MS),
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/rss+xml, application/xml, text/xml, */*',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      return { feed, xml };
    })
  );

  for (const res of settled) {
    if (res.status !== 'fulfilled') continue;
    const { feed, xml } = res.value;
    const itemBlocks = xml.split(/<item\b[^>]*>/i).slice(1);

    let feedMatched = false;
    for (const block of itemBlocks.slice(0, 15)) {
      const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/i);
      const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/i);
      const dateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
      const descMatch = block.match(/<description>([\s\S]*?)<\/description>/i);

      const title = titleMatch ? stripHtmlToText(decodeXmlEntities(titleMatch[1])) : '';
      const desc = descMatch ? stripHtmlToText(decodeXmlEntities(descMatch[1])) : '';
      if (!title || title.length < 10) continue;

      if (!ECON_HEADLINE_FILTER.test(`${title} ${desc}`)) continue;

      const link = linkMatch ? decodeXmlEntities(linkMatch[1]) : feed.url;
      const safeUrl = /^https?:\/\//i.test(link) ? link : feed.url;
      const category = classifyHeadlineCategory(`${title} ${desc}`);
      const publishedLabel = dateMatch
        ? new Date(decodeXmlEntities(dateMatch[1])).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })
        : 'Latest';

      headlines.push({
        id: `rss-${feed.publisher.toLowerCase().replace(/\s+/g, '-')}-${headlines.length}`,
        headlineMm: title,
        headlineEn: title,
        source: feed.publisher,
        category,
        impact: /policy|cbm|central bank|tariff|ban|rate/i.test(title) ? 'policy' : 'neutral',
        publishedLabel: publishedLabel === 'Invalid Date' ? 'Recent' : publishedLabel,
        url: safeUrl,
        relatedTab: mapCategoryToTab(category),
      });

      feedMatched = true;
      if (headlines.filter((h) => h.source === feed.publisher).length >= 3) break;
    }

    if (feedMatched && !seenUrls.has(feed.url)) {
      seenUrls.add(feed.url);
      sources.push({ title: `${feed.publisher} (RSS)`, uri: feed.url });
    }
  }

  return { headlines: headlines.slice(0, 8), sources };
}

function buildFallbackNews(noteMm: string): MarketNewsResponse {
  const categoryMap: Record<string, MarketNewsHeadline['category']> = {
    government: 'macro',
    worldbank_ngo: 'macro',
    roundtable: 'forex',
    verified_media: 'gold',
  };

  const tabMap: Record<MarketNewsHeadline['category'], MarketNewsHeadline['relatedTab']> = {
    gold: 'gold',
    forex: 'forex',
    commodities: 'commodities',
    macro: 'intel',
  };

  const fallbackUrlByReportId: Record<string, string> = {
    'wb-monitor-2026': 'https://www.worldbank.org/en/country/myanmar',
    'cbm-auction-update': 'https://forex.cbm.gov.mm/',
    'ygea-gold-statement': 'https://academygoldmyanmar.com.mm/',
    'doca-palmoil-ref': 'https://www.commerce.gov.mm/',
  };

  const headlines: MarketNewsHeadline[] = initialIntelligenceReports.slice(0, 6).map((rep, idx) => {
    const cat = categoryMap[rep.category] || 'macro';
    const resolvedUrl = rep.sourceUrl || fallbackUrlByReportId[rep.id];
    return {
      id: `fallback-news-${idx + 1}`,
      headlineMm: rep.titleMm,
      headlineEn: rep.titleEn,
      source: rep.publisher,
      category: cat,
      impact: rep.impactLevel === 'high' ? 'policy' : 'neutral',
      publishedLabel: rep.publicationDate,
      url: resolvedUrl,
      relatedTab: tabMap[cat],
    };
  });

  const groundingSources: GroundingSourceLink[] = [];
  const seen = new Set<string>();
  for (const h of headlines) {
    if (h.url && !seen.has(h.url)) {
      seen.add(h.url);
      groundingSources.push({ title: h.source, uri: h.url });
    }
  }

  return {
    headlines,
    groundingSources,
    grounded: false,
    sourceMode: 'fallback',
    lastUpdated: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    noteMm,
  };
}

export async function fetchMyanmarEconomicNews(options?: {
  aiClient?: GoogleGenAI | null;
  forceRefresh?: boolean;
  customTelegramChannels?: string[];
}): Promise<MarketNewsResponse> {
  const forceRefresh = Boolean(options?.forceRefresh);
  const now = Date.now();

  hydrateNewsCacheFromDisk();

  if (!forceRefresh && cachedNews) {
    if (cachedNews.cooldownUntilMs && now < cachedNews.cooldownUntilMs) {
      return cachedNews.payload;
    }
    if (!cachedNews.cooldownUntilMs && now - cachedNews.fetchedAtMs < NEWS_CACHE_TTL_MS) {
      return cachedNews.payload;
    }
  }

  if (inflightNewsPromise && !forceRefresh) {
    return inflightNewsPromise;
  }

  const runFetch = async (): Promise<MarketNewsResponse> => {
    // Tier 1 & 2 Zero-Quota Wire: Economic RSS Feeds + Public Telegram News Briefs
    try {
      const [rssOutcome, tgBriefs] = await Promise.all([
        fetchRssEconomicHeadlines(),
        fetchTelegramEconomicBriefs(options?.customTelegramChannels),
      ]);

      const combinedHeadlines = [...rssOutcome.headlines, ...tgBriefs].slice(0, 8);
      const combinedSources = [...rssOutcome.sources];
      for (const h of tgBriefs) {
        if (h.url && !combinedSources.some((s) => s.uri === h.url)) {
          combinedSources.push({ title: h.source, uri: h.url });
        }
      }

      if (combinedHeadlines.length >= 3 && !forceRefresh) {
        const rssPayload: MarketNewsResponse = {
          headlines: combinedHeadlines,
          groundingSources: combinedSources,
          grounded: true,
          sourceMode: 'rss_telegram',
          lastUpdated: new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          noteMm: `RSS & Public Telegram များမှ စီးပွားရေးသတင်း ${combinedHeadlines.length} ပုဒ် တိုက်ရိုက်စုစည်းပြီး (Zero Search Quota)`,
        };
        lastKnownGoodNews = rssPayload;
        const newsState: CachedNewsState = { payload: rssPayload, fetchedAtMs: Date.now() };
        cachedNews = newsState;
        persistNewsCacheToDisk(newsState);
        return rssPayload;
      }
    } catch {
      // Proceed to Search fallback or baseline below
    }

    const aiClient = options?.aiClient;
    if (!aiClient) {
      const fallback = buildFallbackNews(
        'Gemini API key မရှိသေးသဖြင့် စိစစ်ပြီးသား စီးပွားရေးသတင်းများကို ပြသထားပါသည်။'
      );
      cachedNews = { payload: fallback, fetchedAtMs: now, cooldownUntilMs: now + 60 * 1000 };
      return fallback;
    }

    try {
      const prompt = `Search for the latest reliable economic, financial, and market news headlines in Myanmar (gold prices, YGEA, Central Bank of Myanmar / CBM exchange rate, MMK USD/THB market, fuel / PPRD, palm oil / DOCA, rice prices, trade policy, World Bank Myanmar economic updates).
Prioritize credible economic and business news sources such as Central Bank of Myanmar (CBM), Global New Light of Myanmar, Eleven Media Business, Frontier Myanmar, The Irrawaddy Business, Mizzima Business, World Bank Myanmar, and Reuters.

Return 6 to 8 concise, factual, up-to-date headlines as ONLY valid JSON (no markdown fences, no commentary) using this exact structure:
{
  "headlines": [
    {
      "headlineMm": "Concise Burmese headline (Unicode, max 110 characters)",
      "headlineEn": "Concise English headline (max 110 characters)",
      "source": "Publisher / Institution name",
      "category": "gold" | "forex" | "commodities" | "macro",
      "impact": "up" | "down" | "policy" | "neutral",
      "publishedLabel": "e.g. Today, Nov 2026, or date found",
      "url": "Direct article or source URL if known, otherwise null"
    }
  ]
}`;

      const { response } = await executeGroundedSearchWithQuotaGuard({
        aiClient,
        prompt,
        timeoutMs: NEWS_SEARCH_TIMEOUT_MS,
        label: 'News Search Grounding',
        systemInstruction:
          'You are a Myanmar financial news wire editor. Return strictly valid JSON with concise Burmese Unicode and English headlines grounded in search results. Never fabricate URLs.',
      });

      const rawText = (response.text || '').trim();
      const cleanedText = rawText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
      const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);

      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const groundingSources: GroundingSourceLink[] = [];
      const seenUris = new Set<string>();
      for (const chunk of chunks) {
        const uri = chunk.web?.uri;
        const title = chunk.web?.title || uri;
        if (uri && !seenUris.has(uri)) {
          seenUris.add(uri);
          groundingSources.push({ title: title || 'Source', uri });
        }
      }

      if (!jsonMatch) {
        throw new Error('Search grounding returned no structured headlines');
      }

      const parsed = JSON.parse(jsonMatch[0]) as {
        headlines?: Array<{
          headlineMm?: string;
          headlineEn?: string;
          source?: string;
          category?: string;
          impact?: string;
          publishedLabel?: string;
          url?: string | null;
        }>;
      };

      const rawList = Array.isArray(parsed.headlines) ? parsed.headlines : [];
      const headlines: MarketNewsHeadline[] = rawList
        .filter((item) => Boolean(item?.headlineMm || item?.headlineEn))
        .slice(0, 8)
        .map((item, idx) => {
          const category = normalizeCategory(item.category);
          const fallbackChunkUrl = groundingSources[idx]?.uri || groundingSources[0]?.uri;
          const validUrl =
            typeof item.url === 'string' && /^https?:\/\//i.test(item.url)
              ? item.url
              : fallbackChunkUrl;

          return {
            id: `news-${Date.now()}-${idx}`,
            headlineMm: (item.headlineMm || item.headlineEn || '').trim(),
            headlineEn: (item.headlineEn || item.headlineMm || '').trim(),
            source: (item.source || groundingSources[idx]?.title || 'Myanmar Business Wire').trim(),
            category,
            impact: normalizeImpact(item.impact),
            publishedLabel: (item.publishedLabel || 'Latest').trim(),
            url: validUrl,
            relatedTab: mapCategoryToTab(category),
          };
        });

      if (headlines.length === 0) {
        throw new Error('Empty headlines list from grounding');
      }

      const payload: MarketNewsResponse = {
        headlines,
        groundingSources,
        grounded: groundingSources.length > 0,
        sourceMode: 'google_search',
        lastUpdated: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        noteMm:
          groundingSources.length > 0
            ? `Google Search ဖြင့် ရင်းမြစ် ${groundingSources.length} ခုမှ စိစစ်စုစည်းထားသည်`
            : 'စီးပွားရေးသတင်းများ စုစည်းပြီး',
      };

      lastKnownGoodNews = payload;
      const newsState: CachedNewsState = { payload, fetchedAtMs: Date.now() };
      cachedNews = newsState;
      persistNewsCacheToDisk(newsState);
      return payload;
    } catch (err) {
      const isQuota = isQuotaOrRateLimitError(err);
      const cleanErr = formatQuotaErrorMessage(err, 'News Search');
      const retryDelayMs = parseRetryDelayMs(err);
      const cooldownMs = Math.min(Math.max(retryDelayMs ?? 3 * 60 * 1000, 60 * 1000), 10 * 60 * 1000);
      console.warn('Market news grounding fallback:', isQuota ? cleanErr : cleanErr);
      if (lastKnownGoodNews && (lastKnownGoodNews.grounded || lastKnownGoodNews.sourceMode === 'rss_telegram')) {
        cachedNews = {
          payload: lastKnownGoodNews,
          fetchedAtMs: Date.now(),
          cooldownUntilMs: Date.now() + cooldownMs,
        };
        return lastKnownGoodNews;
      }
      const fallback = buildFallbackNews(
        isQuota
          ? 'Google Search API quota ယာယီပြည့်နေသဖြင့် စိစစ်ပြီးသား စီးပွားရေးသတင်းရင်းမြစ်များကို ပြသထားပါသည်။'
          : 'တိုက်ရိုက်သတင်းရှာဖွေမှု ခေတ္တနှောင့်နှေးနေသဖြင့် အခြေခံစီးပွားရေးသတင်းများ ပြသထားပါသည်။'
      );
      cachedNews = {
        payload: fallback,
        fetchedAtMs: Date.now(),
        cooldownUntilMs: Date.now() + cooldownMs,
      };
      return fallback;
    }
  };

  inflightNewsPromise = runFetch();
  try {
    return await inflightNewsPromise;
  } finally {
    inflightNewsPromise = null;
  }
}
