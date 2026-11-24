import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type Auth as AdminAuth } from 'firebase-admin/auth';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  initialGoldQuotes,
  initialCurrencyQuotes,
  initialCommodityQuotes,
  initialIntelligenceReports,
  initialInflationBasket,
} from './src/data/initialData.ts';
import {
  gatherLiveMarketSnapshot,
  hasFreshSnapshot,
  mergeLivePipelineIntoQuotes,
} from './src/services/marketPipeline.ts';
import { PIPELINE_CACHE_TTL_MS } from './src/services/pipelineUtils.ts';
import { fetchMyanmarEconomicNews } from './src/services/newsPipeline.ts';
import {
  DEFAULT_TELEGRAM_CHANNELS,
  parseTelegramChannelListInput,
} from './src/services/telegramMarketScraper.ts';
import {
  buildLiveDigestSnapshot,
  calcSpread,
  formatYangonDateMm,
  formatYangonTime12h,
  getCurrentYangonSession,
  switchCommoditySession,
  switchCurrencySession,
  switchGoldSession,
} from './src/utils/quoteHelpers.ts';
import {
  applyExternalFeedToQuotes,
  parseExternalFeedPayload,
} from './src/services/externalFeedAdapter.ts';
import type {
  AiQuotaStatus,
  BankExchangeRate,
  DailyDigest,
  DataSourceStatus,
  MarketFeedStatus,
  MarketSession,
  PipelineMeta,
  TrustedGoldShopQuote,
} from './src/types.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const portArgIndex = process.argv.indexOf('--port');
const cliPort = portArgIndex !== -1 ? Number(process.argv[portArgIndex + 1]) : NaN;
const envPort = process.env.PORT ? Number(process.env.PORT) : NaN;
const PORT = Number.isFinite(cliPort)
  ? cliPort
  : process.env.APP_ENV === 'dev'
  ? Number.isFinite(envPort) && envPort !== 8080
    ? envPort
    : 3000
  : Number.isFinite(envPort)
  ? envPort
  : 3000;

app.use(express.json());

// Initialize Firebase Admin Auth for ID token verification (requires no IAM)
let adminAuth: AdminAuth | null = null;
try {
  const fbConfigPath = path.resolve(__dirname, 'firebase-applet-config.json');
  if (fs.existsSync(fbConfigPath)) {
    const fbConfig = JSON.parse(fs.readFileSync(fbConfigPath, 'utf8')) as {
      projectId?: string;
    };
    if (fbConfig.projectId && fbConfig.projectId !== 'remixed-project-id') {
      const adminApp = getApps().length
        ? getApp()
        : initializeApp({ projectId: fbConfig.projectId });
      adminAuth = getAuth(adminApp);
    }
  }
} catch (err) {
  console.warn('Firebase Admin Auth initialization warning:', err);
}

interface AuthenticatedUser {
  uid: string;
  email: string | null;
}

interface AuthenticatedRequest extends express.Request {
  authUser?: AuthenticatedUser;
}

const DAILY_DIGEST_LIMIT = 15;
const DAILY_SEARCH_LIMIT = 20;
const USER_ACTION_COOLDOWN_MS = 15_000;
const AI_DIGEST_CACHE_TTL_MS = 15 * 60 * 1000;

interface UserQuotaRecord {
  dateKey: string;
  digestUsed: number;
  searchUsed: number;
  lastCallAtMs: number;
}

const userQuotaMap = new Map<string, UserQuotaRecord>();
let lastAiDigestGeneratedMs = 0;

function getYangonDateKeyServer(): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Yangon',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    // Fallback
  }
  return new Date().toISOString().slice(0, 10);
}

function getOrResetUserQuota(uid: string): UserQuotaRecord {
  const todayKey = getYangonDateKeyServer();
  const existing = userQuotaMap.get(uid);
  if (!existing || existing.dateKey !== todayKey) {
    const fresh: UserQuotaRecord = {
      dateKey: todayKey,
      digestUsed: 0,
      searchUsed: 0,
      lastCallAtMs: 0,
    };
    userQuotaMap.set(uid, fresh);
    return fresh;
  }
  return existing;
}

function buildQuotaStatus(uid: string, cachedServed = false): AiQuotaStatus {
  const rec = getOrResetUserQuota(uid);
  const elapsed = rec.lastCallAtMs > 0 ? Date.now() - rec.lastCallAtMs : USER_ACTION_COOLDOWN_MS;
  const cooldownRemainingMs = Math.max(0, USER_ACTION_COOLDOWN_MS - elapsed);
  return {
    dateKey: rec.dateKey,
    digestUsed: rec.digestUsed,
    digestLimit: DAILY_DIGEST_LIMIT,
    searchUsed: rec.searchUsed,
    searchLimit: DAILY_SEARCH_LIMIT,
    cooldownRemainingMs,
    cachedServed,
  };
}

function canUseUserQuota(
  res: express.Response,
  uid: string,
  kind: 'digest' | 'search'
): boolean {
  const rec = getOrResetUserQuota(uid);
  const now = Date.now();
  const elapsed = rec.lastCallAtMs > 0 ? now - rec.lastCallAtMs : USER_ACTION_COOLDOWN_MS;

  if (elapsed < USER_ACTION_COOLDOWN_MS) {
    const waitSec = Math.ceil((USER_ACTION_COOLDOWN_MS - elapsed) / 1000);
    res.status(429).json({
      error: `Token protection cooldown active. Please wait ${waitSec}s before running another live AI/Search request.`,
      code: 'USER_COOLDOWN',
      retryAfterSeconds: waitSec,
      quota: buildQuotaStatus(uid),
    });
    return false;
  }

  if (kind === 'digest' && rec.digestUsed >= DAILY_DIGEST_LIMIT) {
    res.status(429).json({
      error: `Daily AI synthesis allowance (${DAILY_DIGEST_LIMIT}/${DAILY_DIGEST_LIMIT}) reached for your account today. Saved briefings remain available in Cloud History.`,
      code: 'USER_DAILY_QUOTA_EXCEEDED',
      quota: buildQuotaStatus(uid),
    });
    return false;
  }

  if (kind === 'search' && rec.searchUsed >= DAILY_SEARCH_LIMIT) {
    res.status(429).json({
      error: `Daily live Google Search allowance (${DAILY_SEARCH_LIMIT}/${DAILY_SEARCH_LIMIT}) reached for your account today. Cached rates remain active.`,
      code: 'USER_DAILY_QUOTA_EXCEEDED',
      quota: buildQuotaStatus(uid),
    });
    return false;
  }

  return true;
}

function commitUserQuota(uid: string, kind: 'digest' | 'search'): void {
  const rec = getOrResetUserQuota(uid);
  if (kind === 'digest') {
    rec.digestUsed += 1;
  } else {
    rec.searchUsed += 1;
  }
  rec.lastCallAtMs = Date.now();
}

function checkAndConsumeUserQuota(
  res: express.Response,
  uid: string,
  kind: 'digest' | 'search'
): boolean {
  if (!canUseUserQuota(res, uid, kind)) return false;
  commitUserQuota(uid, kind);
  return true;
}

async function verifyBearerUser(req: express.Request): Promise<AuthenticatedUser | null> {
  if (!adminAuth) return null;
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const idToken = authHeader.slice(7).trim();
  if (!idToken) return null;

  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    if (decoded.email_verified === false) {
      return null;
    }
    return {
      uid: decoded.uid,
      email: typeof decoded.email === 'string' ? decoded.email : null,
    };
  } catch {
    return null;
  }
}

async function requireFirebaseAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (!adminAuth) {
    return res.status(503).json({
      error: 'Firebase Authentication is not configured on the server.',
      code: 'AUTH_NOT_CONFIGURED',
    });
  }
  const authUser = await verifyBearerUser(req);
  if (!authUser) {
    return res.status(401).json({
      error:
        'Google Sign-In is required to run live AI synthesis or Google Search grounding. Sign in to track and protect daily token quota.',
      code: 'AUTH_REQUIRED',
    });
  }
  (req as AuthenticatedRequest).authUser = authUser;
  return next();
}

// Initialize Gemini Client
const geminiApiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (geminiApiKey) {
  ai = new GoogleGenAI({
    apiKey: geminiApiKey,
    httpOptions: {
      timeout: 45000,
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// In-memory application state seeded with current Yangon session
let goldQuotes = [...initialGoldQuotes];
let currencyQuotes = [...initialCurrencyQuotes];
let commodityQuotes = [...initialCommodityQuotes];
let intelligenceReports = [...initialIntelligenceReports];
let inflationBasket = [...initialInflationBasket];
let currentSession: MarketSession = getCurrentYangonSession();

const manualOverrides = new Set<string>();
let userPinnedStreetUsd = false;
let activeStreetUsdAnchor: number =
  initialCurrencyQuotes.find((c) => c.code === 'USD')?.marketSellRate || 5145;
let latestBankRates: BankExchangeRate[] = [];
let latestTrustedGoldShops: TrustedGoldShopQuote[] = [];
let latestDataSources: DataSourceStatus[] = [];
let latestPipelineMeta: PipelineMeta | null = null;

let configuredExternalFeedUrl: string = (process.env.MARKET_FEED_URL || '').trim();
let configuredTelegramChannels: string[] = DEFAULT_TELEGRAM_CHANNELS.filter(
  (c) => c.focus === 'market'
).map((c) => c.slug);
let lastSuccessfulSyncIso: string = new Date().toISOString();
let currentFeedStatus: MarketFeedStatus = {
  mode: 'fallback_mock',
  isFallback: true,
  endpointUrl: configuredExternalFeedUrl || 'CBM API · Spot Metals · Telegram (t.me/s)',
  lastSuccessfulUpdate: lastSuccessfulSyncIso,
  sourceBadgeLabel: 'Market Source: Direct APIs & Telegram Desks',
  fallbackReason: 'Initializing zero-quota direct API & Telegram pipeline',
};

let activeDigest: DailyDigest = buildLiveDigestSnapshot({
  session: currentSession,
  goldQuotes,
  currencyQuotes,
  commodityQuotes,
  trustedGoldShops: latestTrustedGoldShops,
  pipelineMeta: latestPipelineMeta,
  aiGenerated: false,
});

function buildMarketResponsePayload(extra?: Record<string, unknown>) {
  return {
    ...extra,
    session: currentSession,
    gold: goldQuotes,
    currencies: currencyQuotes,
    commodities: commodityQuotes,
    reports: intelligenceReports,
    basket: inflationBasket,
    digest: activeDigest,
    bankRates: latestBankRates,
    trustedGoldShops: latestTrustedGoldShops,
    dataSources: latestDataSources,
    pipelineMeta: latestPipelineMeta,
    feedStatus: currentFeedStatus,
    configuredExternalFeedUrl,
    configuredTelegramChannels,
    timestamp: new Date().toISOString(),
  };
}

function isBlockedPrivateHostname(hostname: string): boolean {
  const lower = hostname.trim().toLowerCase();
  if (!lower) return true;
  if (
    lower === 'localhost' ||
    lower === '0.0.0.0' ||
    lower === '::1' ||
    lower === '[::1]' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    return true;
  }
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(lower)) return true;
  const match172 = lower.match(/^172\.(\d+)\./);
  if (match172 && Number(match172[1]) >= 16 && Number(match172[1]) <= 31) return true;
  if (/^(fc|fd|fe80)/i.test(lower.replace(/^\[|\]$/g, ''))) return true;
  return false;
}

function detectIsGoogleSheetUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes('docs.google.com/spreadsheets') ||
    lower.includes('opensheet.elk.sh') ||
    lower.includes('sheetdb.io') ||
    lower.includes('gviz/tq')
  );
}

async function fetchExternalRestOrSheetFeed(url: string): Promise<{
  ok: boolean;
  error?: string;
  appliedCount?: number;
}> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json, text/plain, */*' },
    });
    if (!res.ok) {
      return { ok: false, error: `Endpoint HTTP ${res.status}` };
    }
    const rawText = await res.text();
    const overrides = parseExternalFeedPayload(rawText);
    const label = detectIsGoogleSheetUrl(url)
      ? 'Google Sheet JSON Endpoint'
      : 'External REST API Endpoint';
    const nextQuotes = applyExternalFeedToQuotes({
      overrides,
      goldQuotes,
      currencyQuotes,
      commodityQuotes,
      basket: inflationBasket,
      sourceLabel: label,
    });
    goldQuotes = nextQuotes.gold;
    currencyQuotes = nextQuotes.currencies;
    commodityQuotes = nextQuotes.commodities;
    inflationBasket = nextQuotes.basket;
    if (overrides.updatedAt && !Number.isNaN(new Date(overrides.updatedAt).getTime())) {
      lastSuccessfulSyncIso = overrides.updatedAt;
    } else {
      lastSuccessfulSyncIso = new Date().toISOString();
    }
    return { ok: true, appliedCount: overrides.recordCount };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'External feed unreachable',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function syncPipelineState(
  forceRefresh = false,
  forceShopSearch = false,
  forceGroundSearch = false
): Promise<{ searchConsumedQuota: boolean }> {
  let externalOutcome: { ok: boolean; error?: string; appliedCount?: number } | null = null;
  let searchConsumedQuota = false;

  try {
    const snapshot = await gatherLiveMarketSnapshot({
      forceRefresh,
      forceShopSearch,
      forceGroundSearch,
      aiClient: ai,
      streetUsdAnchor: activeStreetUsdAnchor,
      customTelegramChannels: configuredTelegramChannels,
    });
    searchConsumedQuota = snapshot.searchConsumedQuota;

    const candidateUsdSell =
      snapshot.validatedFx.USD?.sellRate ?? snapshot.groundedMarket?.data?.fx?.USD?.sellRate;
    if (
      !userPinnedStreetUsd &&
      !manualOverrides.has('currency:USD') &&
      typeof candidateUsdSell === 'number' &&
      candidateUsdSell >= 3800 &&
      candidateUsdSell <= 9000
    ) {
      activeStreetUsdAnchor = Math.round(candidateUsdSell);
    }

    const merged = mergeLivePipelineIntoQuotes(
      goldQuotes,
      currencyQuotes,
      snapshot,
      manualOverrides,
      currentSession,
      commodityQuotes,
      inflationBasket,
      { userPinnedStreetUsd, streetUsdAnchor: activeStreetUsdAnchor }
    );
    goldQuotes = merged.gold;
    currencyQuotes = merged.currencies;
    commodityQuotes = merged.commodities;
    inflationBasket = merged.basket;
    latestBankRates = snapshot.bankRates;
    latestTrustedGoldShops = snapshot.trustedGoldShops;
    latestDataSources = snapshot.sources;

    if (configuredExternalFeedUrl) {
      externalOutcome = await fetchExternalRestOrSheetFeed(configuredExternalFeedUrl);
    }

    const groundedSummary = snapshot.groundedMarket?.summary;
    const isGoogleGrounded = Boolean(groundedSummary?.grounded);
    const hasDirectOrTelegramLive = snapshot.sources.some(
      (s) =>
        (s.category === 'central_bank' ||
          s.category === 'gold_api' ||
          s.category === 'global_fx' ||
          s.category === 'telegram_desk') &&
        s.status === 'live'
    );
    const isGoogleSheet = configuredExternalFeedUrl
      ? detectIsGoogleSheetUrl(configuredExternalFeedUrl)
      : false;

    let mode: MarketFeedStatus['mode'] = 'fallback_mock';
    let isFallback = false;
    let fallbackReason: string | null = null;
    let endpointUrl = 'Google Search Grounding';
    let sourceBadgeLabel = 'Market Source: Google Search Grounding (On-Ground / Reference)';

    if (configuredExternalFeedUrl && externalOutcome?.ok) {
      mode = isGoogleSheet ? 'google_sheet_json' : 'rest_api';
      endpointUrl = configuredExternalFeedUrl;
      sourceBadgeLabel = isGoogleSheet
        ? 'Market Source: Google Sheet JSON'
        : 'Market Source: External REST Feed';
    } else if ((snapshot.searchWasSkipped || !isGoogleGrounded) && hasDirectOrTelegramLive) {
      mode = 'direct_telegram';
      isFallback = false;
      endpointUrl = 'CBM API · Spot Metals · Telegram (t.me/s)';
      sourceBadgeLabel = 'Market Source: Direct APIs & Telegram Desks (Zero Search Quota)';
      lastSuccessfulSyncIso = snapshot.lastSyncedAt;
      if (configuredExternalFeedUrl && externalOutcome && !externalOutcome.ok) {
        fallbackReason = `External feed failed (${externalOutcome.error}); using Direct APIs & Telegram Desks.`;
      }
    } else if (isGoogleGrounded && groundedSummary) {
      mode = 'google_search';
      isFallback = false;
      endpointUrl = groundedSummary.sources[0]?.uri || 'Google Search Grounding';
      lastSuccessfulSyncIso = groundedSummary.lastSearchedAt || snapshot.lastSyncedAt;
      if (configuredExternalFeedUrl && externalOutcome && !externalOutcome.ok) {
        fallbackReason = `External feed failed (${externalOutcome.error}); using Google Search Grounding.`;
      }
    } else {
      mode = 'fallback_mock';
      isFallback = true;
      endpointUrl = configuredExternalFeedUrl || 'Google Search Grounding';
      sourceBadgeLabel = 'Market Source: Google Search Grounding (Fallback)';
      fallbackReason =
        groundedSummary?.error ||
        externalOutcome?.error ||
        'Direct APIs & Search grounding unavailable; displaying baseline rates.';
    }

    currentFeedStatus = {
      mode,
      isFallback,
      endpointUrl,
      lastSuccessfulUpdate: lastSuccessfulSyncIso,
      sourceBadgeLabel,
      fallbackReason,
    };

    latestPipelineMeta = {
      ...merged.meta,
      feedStatus: currentFeedStatus,
    };

    // Keep digest synchronized with latest live rates & today's Yangon date unless freshly AI-generated for same day/session
    const todayDateMm = formatYangonDateMm();
    const keepExistingAi =
      activeDigest.aiGenerated &&
      activeDigest.date === todayDateMm &&
      activeDigest.session === currentSession;

    if (!keepExistingAi) {
      activeDigest = buildLiveDigestSnapshot({
        session: currentSession,
        goldQuotes,
        currencyQuotes,
        commodityQuotes,
        trustedGoldShops: latestTrustedGoldShops,
        pipelineMeta: latestPipelineMeta,
        aiGenerated: false,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Market pipeline sync error';
    console.error('Market pipeline sync warning:', message);
    currentFeedStatus = {
      mode: 'fallback_mock',
      isFallback: true,
      endpointUrl: configuredExternalFeedUrl || 'Google Search Grounding',
      lastSuccessfulUpdate: lastSuccessfulSyncIso,
      sourceBadgeLabel: 'Market Source: Google Search Grounding (Fallback)',
      fallbackReason: `${message} — displaying fallback snapshot`,
    };
    if (latestPipelineMeta) {
      latestPipelineMeta = { ...latestPipelineMeta, feedStatus: currentFeedStatus };
    }
  }
  return { searchConsumedQuota };
}

// Authenticated user AI/Search daily quota status
app.get('/api/auth/quota', requireFirebaseAuth, (req, res) => {
  const uid = (req as AuthenticatedRequest).authUser!.uid;
  res.json({ quota: buildQuotaStatus(uid) });
});

// Market Data API: returns cached live snapshot (<60 min) instantly; explicit refresh=1 requires Firebase Auth + quota
app.get('/api/market', async (req, res) => {
  const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
  if (forceRefresh) {
    const authUser = await verifyBearerUser(req);
    if (!authUser) {
      return res.status(401).json({
        error: 'Google Sign-In is required to force-refresh live Google Search market data.',
        code: 'AUTH_REQUIRED',
      });
    }
    if (!canUseUserQuota(res, authUser.uid, 'search')) {
      return;
    }
    const { searchConsumedQuota } = await syncPipelineState(true);
    if (searchConsumedQuota) {
      commitUserQuota(authUser.uid, 'search');
    }
    return res.json(
      buildMarketResponsePayload({
        quota: buildQuotaStatus(authUser.uid, !searchConsumedQuota),
      })
    );
  }

  if (!hasFreshSnapshot()) {
    await syncPipelineState(false);
  }
  return res.json(buildMarketResponsePayload());
});

// Inspect or update optional external REST API / Google Sheet JSON feed endpoint
app.get('/api/market/feed-config', (_req, res) => {
  res.json({
    configuredExternalFeedUrl,
    feedStatus: currentFeedStatus,
  });
});

app.post('/api/market/feed-config', async (req, res) => {
  const rawUrl = typeof req.body?.feedUrl === 'string' ? req.body.feedUrl.trim() : '';
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return res.status(400).json({ error: 'Feed URL must begin with http:// or https://' });
      }
      if (isBlockedPrivateHostname(parsed.hostname)) {
        return res.status(400).json({ error: 'Private or loopback feed hosts are not permitted.' });
      }
    } catch {
      return res.status(400).json({ error: 'Please enter a valid REST API or Google Sheet JSON URL.' });
    }
  }

  configuredExternalFeedUrl = rawUrl;
  await syncPipelineState(true);
  return res.json(
    buildMarketResponsePayload({
      success: true,
      configuredExternalFeedUrl,
    })
  );
});

// Inspect or update allowlisted public Telegram channel slugs (strict slug-only validation)
app.get('/api/market/telegram-channels', (_req, res) => {
  res.json({
    configuredTelegramChannels,
    defaultChannels: DEFAULT_TELEGRAM_CHANNELS,
  });
});

app.post('/api/market/telegram-channels', async (req, res) => {
  const rawInput = req.body?.channels;
  const listInput =
    typeof rawInput === 'string'
      ? rawInput
          .split(/[\s,]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      : rawInput;

  if (!Array.isArray(listInput)) {
    return res.status(400).json({ error: 'Channels must be provided as a list of Telegram channel slugs.' });
  }

  const sanitized = parseTelegramChannelListInput(listInput);
  if (listInput.length > 0 && sanitized.length === 0) {
    return res.status(400).json({
      error: 'Invalid Telegram channel slug(s). Use alphanumeric channel names such as myanmargoldprice.',
    });
  }

  configuredTelegramChannels =
    sanitized.length > 0
      ? sanitized
      : DEFAULT_TELEGRAM_CHANNELS.filter((c) => c.focus === 'market').map((c) => c.slug);

  await syncPipelineState(true);
  return res.json(
    buildMarketResponsePayload({
      success: true,
      configuredTelegramChannels,
    })
  );
});

// Explicit force-sync endpoint for zero-quota cascade + Search fallback (Authenticated + Per-User Quota if Search runs)
app.post('/api/market/sync', requireFirebaseAuth, async (req, res) => {
  const uid = (req as AuthenticatedRequest).authUser!.uid;
  if (!canUseUserQuota(res, uid, 'search')) return;
  const { searchConsumedQuota } = await syncPipelineState(true);
  if (searchConsumedQuota) {
    commitUserQuota(uid, 'search');
  }
  res.json(
    buildMarketResponsePayload({
      success: true,
      quota: buildQuotaStatus(uid, !searchConsumedQuota),
    })
  );
});

// Dedicated Google Search Grounding endpoint for updated on-ground buying & selling rates (Authenticated + Per-User Quota)
app.post('/api/market/search-grounding', requireFirebaseAuth, async (req, res) => {
  const uid = (req as AuthenticatedRequest).authUser!.uid;
  if (!canUseUserQuota(res, uid, 'search')) return;
  userPinnedStreetUsd = false;
  const { searchConsumedQuota } = await syncPipelineState(true, true, true);
  if (searchConsumedQuota) {
    commitUserQuota(uid, 'search');
  }
  res.json(
    buildMarketResponsePayload({
      success: Boolean(latestPipelineMeta?.searchGrounding?.grounded),
      searchGrounding: latestPipelineMeta?.searchGrounding ?? null,
      quota: buildQuotaStatus(uid, !searchConsumedQuota),
    })
  );
});

// Street USD Cross-Rate Sync endpoint (updates USD & proportional cross-currencies)
app.post('/api/fx/street-sync', async (req, res) => {
  const rawStreetUsd = req.body?.streetUsd;
  if (rawStreetUsd !== undefined && rawStreetUsd !== null && rawStreetUsd !== '') {
    const parsedUsd = Number(rawStreetUsd);
    if (!Number.isFinite(parsedUsd) || parsedUsd < 2000 || parsedUsd > 12000) {
      return res
        .status(400)
        .json({ error: 'Street USD rate must be between 2,000 and 12,000 MMK.' });
    }
    activeStreetUsdAnchor = Math.round(parsedUsd);
    userPinnedStreetUsd = true;
    for (const c of currencyQuotes) {
      manualOverrides.delete(`currency:${c.code}`);
    }
  } else {
    userPinnedStreetUsd = false;
  }

  await syncPipelineState(true);
  return res.json(
    buildMarketResponsePayload({
      success: true,
      streetUsdAnchor: activeStreetUsdAnchor,
    })
  );
});

// Dedicated endpoint to verify & search reputable buyer-trusted gold shop rates via Google Search (Authenticated + Quota)
app.post('/api/gold/shops-sync', requireFirebaseAuth, async (req, res) => {
  const uid = (req as AuthenticatedRequest).authUser!.uid;
  if (!canUseUserQuota(res, uid, 'search')) return;
  const { searchConsumedQuota } = await syncPipelineState(true, true);
  if (searchConsumedQuota) {
    commitUserQuota(uid, 'search');
  }
  res.json({
    success: true,
    gold: goldQuotes,
    trustedGoldShops: latestTrustedGoldShops,
    dataSources: latestDataSources,
    pipelineMeta: latestPipelineMeta,
    feedStatus: currentFeedStatus,
    quota: buildQuotaStatus(uid, !searchConsumedQuota),
    timestamp: new Date().toISOString(),
  });
});

// Latest Myanmar economic headlines (RSS + Telegram first, Google Search fallback on refresh=1)
app.get('/api/news', async (req, res) => {
  const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
  if (forceRefresh) {
    const authUser = await verifyBearerUser(req);
    if (!authUser) {
      return res.status(401).json({
        error: 'Google Sign-In is required to refresh live economic news via Google Search.',
        code: 'AUTH_REQUIRED',
      });
    }
    if (!canUseUserQuota(res, authUser.uid, 'search')) return;
    const newsPayload = await fetchMyanmarEconomicNews({
      aiClient: ai,
      forceRefresh: true,
      customTelegramChannels: configuredTelegramChannels,
    });
    const usedSearch = newsPayload.sourceMode === 'google_search';
    if (usedSearch) {
      commitUserQuota(authUser.uid, 'search');
    }
    return res.json({ ...newsPayload, quota: buildQuotaStatus(authUser.uid, !usedSearch) });
  }

  const newsPayload = await fetchMyanmarEconomicNews({
    aiClient: ai,
    forceRefresh: false,
    customTelegramChannels: configuredTelegramChannels,
  });
  return res.json(newsPayload);
});

// Update current active session
app.post('/api/market/session', (req, res) => {
  const { session } = req.body;
  if (session !== 'morning' && session !== 'evening') {
    return res.status(400).json({ error: 'Invalid session identifier' });
  }

  currentSession = session;
  goldQuotes = switchGoldSession(goldQuotes, session);
  currencyQuotes = switchCurrencySession(currencyQuotes, session);
  commodityQuotes = switchCommoditySession(commodityQuotes, session);
  activeDigest = buildLiveDigestSnapshot({
    session: currentSession,
    goldQuotes,
    currencyQuotes,
    commodityQuotes,
    trustedGoldShops: latestTrustedGoldShops,
    pipelineMeta: latestPipelineMeta,
    aiGenerated: false,
  });

  return res.json({ success: true, session: currentSession });
});

// Add user custom quote / township update
app.post('/api/market/update-rate', (req, res) => {
  const { type, id, newRate } = req.body;
  const rateVal = parseFloat(newRate);
  if (isNaN(rateVal) || rateVal <= 0) {
    return res.status(400).json({ error: 'Valid numeric rate is required' });
  }

  if (type === 'gold') {
    const item = goldQuotes.find((g) => g.id === id);
    if (item) {
      manualOverrides.add(`gold:${id}`);
      item.marketRate = rateVal;
      Object.assign(item, calcSpread(item.marketRate, item.officialRate));
      return res.json({ success: true, item });
    }
  } else if (type === 'currency') {
    const item = currencyQuotes.find((c) => c.code === id);
    if (item) {
      manualOverrides.add(`currency:${id}`);
      item.marketSellRate = rateVal;
      if (id === 'USD') {
        activeStreetUsdAnchor = rateVal;
        userPinnedStreetUsd = true;
      }
      Object.assign(item, calcSpread(item.marketSellRate, item.cbmOfficialRate));
      return res.json({ success: true, item });
    }
  } else if (type === 'commodity') {
    const item = commodityQuotes.find((cm) => cm.id === id);
    if (item) {
      manualOverrides.add(`commodity:${id}`);
      item.openMarketRate = rateVal;
      item.spreadPercent = calcSpread(item.openMarketRate, item.officialRefRate).spreadPercent;
      return res.json({ success: true, item });
    }
  }
  return res.status(404).json({ error: 'Item not found' });
});

// AI Market Synthesis Endpoint (Authenticated + Cached + Per-User Quota Protected)
app.post('/api/ai/digest', requireFirebaseAuth, async (req, res) => {
  const uid = (req as AuthenticatedRequest).authUser!.uid;
  const { sessionFocus, specificAsset, force } = req.body || {};
  const targetSession: MarketSession =
    sessionFocus === 'morning' || sessionFocus === 'evening' ? sessionFocus : currentSession;
  const todayDateMm = formatYangonDateMm();

  // Serve cached AI digest within 15 minutes to conserve tokens unless user explicitly forces regeneration
  if (
    !force &&
    activeDigest.aiGenerated &&
    activeDigest.session === targetSession &&
    activeDigest.date === todayDateMm &&
    Date.now() - lastAiDigestGeneratedMs < AI_DIGEST_CACHE_TTL_MS
  ) {
    return res.json({
      ...activeDigest,
      quota: buildQuotaStatus(uid, true),
    });
  }

  if (!checkAndConsumeUserQuota(res, uid, 'digest')) {
    return;
  }

  await syncPipelineState(false);

  const currentSessionLabel =
    targetSession === 'morning'
      ? 'မနက်ခင်း စျေးကွက် (Morning Session)'
      : 'ညနေခင်း စျေးကွက် (Evening Session)';

  const fallbackDigest = buildLiveDigestSnapshot({
    session: targetSession,
    goldQuotes,
    currencyQuotes,
    commodityQuotes,
    trustedGoldShops: latestTrustedGoldShops,
    pipelineMeta: latestPipelineMeta,
    aiGenerated: false,
  });

  if (!ai) {
    activeDigest = fallbackDigest;
    return res.json({
      ...activeDigest,
      quota: buildQuotaStatus(uid),
    });
  }

  const gold24k = goldQuotes.find((g) => g.id === 'gold-24k');
  const worldGold = goldQuotes.find((g) => g.id === 'gold-world-spot');
  const usd = currencyQuotes.find((c) => c.code === 'USD');
  const thb = currencyQuotes.find((c) => c.code === 'THB');
  const fuel92 = commodityQuotes.find((cm) => cm.id === 'fuel-92');
  const palmOil = commodityQuotes.find((cm) => cm.id === 'oil-palm');
  const shwebo = commodityQuotes.find((cm) => cm.id === 'rice-shwebo');
  const wrRate = latestPipelineMeta?.workerRemittanceUsd;
  const marketRefLabel =
    latestPipelineMeta?.trustedGoldAnchorShop || 'မြန်မာ့ပြင်ပရွှေဈေးကွက် (Myanmar Open Gold Market)';
  const trustedShopsSummary = latestTrustedGoldShops
    .slice(0, 4)
    .map((s) => `${s.shopNameMm}: ${s.gold24kRate.toLocaleString()} MMK`)
    .join(', ');

  try {
    const prompt = `You are a professional Myanmar senior financial and macroeconomic analyst.
Based on the following live Myanmar market session data (${currentSessionLabel}):
- Open-Market 24K Gold (${marketRefLabel}): ${(gold24k?.marketRate || 10290000).toLocaleString()} MMK/kyat-tha vs Official YGEA Committee Reference ${(gold24k?.officialRate || 7100000).toLocaleString()} MMK
- Domestic Gold Market Snapshot: ${trustedShopsSummary || 'ရန်ကုန်/မန္တလေး ပြင်ပရွှေဈေးကွက်: 10,290,000 MMK'}
- Global Spot Gold (XAU/USD via Google Search): $${(worldGold?.marketRate || 3900).toLocaleString()}/oz${latestPipelineMeta?.spotParityMmkMarket ? ` (Implied 1 kyat-tha parity at open USD: ~${latestPipelineMeta.spotParityMmkMarket.toLocaleString()} MMK)` : ''}
- US Dollar (USD): CBM Official ${(usd?.cbmOfficialRate || 2100).toLocaleString()} MMK vs Commercial Bank / CBM Online Trading ${(usd?.onlineTradingRate || 3670).toLocaleString()} MMK${wrRate ? ` vs Worker Remittance ${wrRate.toLocaleString()} MMK` : ''} vs Open Market ${(usd?.marketSellRate || 4490).toLocaleString()} MMK
- Thai Baht (THB): CBM Official ${thb?.cbmOfficialRate ?? 61.5} MMK vs Bank Online ${thb?.onlineTradingRate ?? 104.2} MMK vs Open Market ${thb?.marketSellRate ?? 132.5} MMK
- Fuel (Octane 92): PPRD Official ${(fuel92?.officialRefRate || 3045).toLocaleString()} MMK vs On-Ground Retail ${(fuel92?.openMarketRate || 3350).toLocaleString()} MMK
- Palm Oil: DOCA Reference ${(palmOil?.officialRefRate || 6580).toLocaleString()} MMK vs Market ${(palmOil?.openMarketRate || 13500).toLocaleString()} MMK
- Rice: Shwebo Pawsan ${(shwebo?.openMarketRate || 178000).toLocaleString()} MMK/bag
${specificAsset ? `Focus specifically on: ${specificAsset}` : ''}

Generate an executive market intelligence digest in Myanmar language (Burmese) with a concise English headline translation.`;

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(new Error('Gemini request timed out after 45s')),
      45000
    );

    let response;
    const digestSchema = {
      type: Type.OBJECT,
      properties: {
        headlineMm: {
          type: Type.STRING,
          description: 'Concise 1-sentence Burmese executive headline.',
        },
        headlineEn: {
          type: Type.STRING,
          description: 'Concise 1-sentence English headline translation.',
        },
        keyPointsMm: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description:
            'Exactly 4 concise Burmese bullet points covering gold, USD/FX, fuel/oil, and rice.',
        },
        spreadAnalysisMm: {
          type: Type.STRING,
          description:
            '1-2 concise Burmese sentences analyzing official vs bank online vs open-market spreads.',
        },
        marketSentiment: {
          type: Type.STRING,
          description: 'One of: Volatile, Stable, Climbing, Subdued.',
        },
      },
      required: [
        'headlineMm',
        'headlineEn',
        'keyPointsMm',
        'spreadAnalysisMm',
        'marketSentiment',
      ],
    };
    const digestSystemInstruction =
      'You are an expert Myanmar macroeconomic analyst. Output concise, natural Burmese Unicode JSON only: 1-sentence headlines, 4 short bullet points (under 35 words each), and a 1-2 sentence spread analysis.';

    try {
      try {
        response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: prompt,
          config: {
            abortSignal: controller.signal,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: digestSchema,
            systemInstruction: digestSystemInstruction,
          },
        });
      } catch (primaryDigestErr: any) {
        const msg = primaryDigestErr?.message || String(primaryDigestErr);
        if (!/429|503|RESOURCE_EXHAUSTED|UNAVAILABLE|quota|high demand/i.test(msg)) {
          throw primaryDigestErr;
        }
        response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: prompt,
          config: {
            abortSignal: controller.signal,
            responseMimeType: 'application/json',
            responseSchema: digestSchema,
            systemInstruction: digestSystemInstruction,
          },
        });
      }
    } finally {
      clearTimeout(timeoutId);
    }

    const rawText = (response.text || '{}').trim();
    const cleanedJson = rawText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(cleanedJson);
    const allowedSentiments = new Set(['Volatile', 'Stable', 'Climbing', 'Subdued']);
    const sentiment = allowedSentiments.has(parsed.marketSentiment)
      ? parsed.marketSentiment
      : 'Volatile';

    activeDigest = {
      date: formatYangonDateMm(),
      session: targetSession,
      headlineMm: parsed.headlineMm || fallbackDigest.headlineMm,
      headlineEn: parsed.headlineEn || fallbackDigest.headlineEn,
      keyPointsMm:
        Array.isArray(parsed.keyPointsMm) && parsed.keyPointsMm.length > 0
          ? parsed.keyPointsMm
          : fallbackDigest.keyPointsMm,
      spreadAnalysisMm: parsed.spreadAnalysisMm || fallbackDigest.spreadAnalysisMm,
      marketSentiment: sentiment,
      aiGenerated: true,
      lastGeneratedTime: formatYangonTime12h(),
    };

    lastAiDigestGeneratedMs = Date.now();
    return res.json({
      ...activeDigest,
      quota: buildQuotaStatus(uid),
    });
  } catch (error: any) {
    console.warn('Gemini AI digest fallback activated:', error?.message || String(error));
    activeDigest = fallbackDigest;
    return res.json({
      ...activeDigest,
      quota: buildQuotaStatus(uid),
    });
  }
});

// AI Burmese News Anchor Broadcast Pack Endpoint (24h Facebook Post + Teleprompter Video Script)
app.post('/api/ai/broadcast-script', requireFirebaseAuth, async (req, res) => {
  const uid = (req as AuthenticatedRequest).authUser!.uid;

  if (!ai) {
    return res.status(503).json({
      error: 'AI broadcast script generation is unavailable because GEMINI_API_KEY is not configured on the server.',
      code: 'AI_NOT_CONFIGURED',
    });
  }

  if (!canUseUserQuota(res, uid, 'digest')) {
    return;
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const targetSession: MarketSession =
    body.sessionFocus === 'morning' || body.sessionFocus === 'evening'
      ? body.sessionFocus
      : currentSession;
  const bulletinFormat: 'full_bulletin' | 'flash_brief' =
    body.bulletinFormat === 'flash_brief' ? 'flash_brief' : 'full_bulletin';
  const sanitizeText = (val: unknown, maxLen: number): string =>
    typeof val === 'string'
      ? val.replace(/[\r\n\t\x00-\x1f]/g, ' ').trim().slice(0, maxLen)
      : '';

  const reportDateLabel = sanitizeText(body.dateStr, 48) || formatYangonDateMm();
  const brandLabel = sanitizeText(body.brandName, 64) || 'Myanmar Market Watch';
  const sourceLabel = sanitizeText(body.sourceStr, 120) || 'CBM · YGEA · PPRD · DOCA · Verified Market Desks';

  await syncPipelineState(false);

  const sessionLabelMm =
    targetSession === 'morning'
      ? 'မနက်ခင်း ဈေးကွက်သတင်းလွှာ (Morning Session)'
      : 'ညနေခင်း ဈေးကွက်သတင်းလွှာ (Evening Session)';

  const gold24k = goldQuotes.find((g) => g.id === 'gold-24k');
  const gold15pe = goldQuotes.find((g) => g.id === 'gold-15pe');
  const worldGold = goldQuotes.find((g) => g.id === 'gold-world-spot');

  const usd = currencyQuotes.find((c) => c.code === 'USD');
  const sgd = currencyQuotes.find((c) => c.code === 'SGD');
  const thb = currencyQuotes.find((c) => c.code === 'THB');
  const eur = currencyQuotes.find((c) => c.code === 'EUR');
  const myr = currencyQuotes.find((c) => c.code === 'MYR');

  const fuel92 = commodityQuotes.find((cm) => cm.id === 'fuel-92');
  const fuel95 = commodityQuotes.find((cm) => cm.id === 'fuel-95');
  const diesel = commodityQuotes.find((cm) => cm.id === 'fuel-diesel');
  const palmOil = commodityQuotes.find((cm) => cm.id === 'oil-palm');
  const riceShwebo = commodityQuotes.find((cm) => cm.id === 'rice-shwebo');
  const riceEmata = commodityQuotes.find((cm) => cm.id === 'rice-emata');

  const formatDelta = (delta?: number, dir?: string, pct?: number) => {
    if (!delta || dir === 'unchanged') return '0 (Unchanged / ငြိမ်သက်)';
    const sign = dir === 'up' ? '+' : '-';
    const pctStr = typeof pct === 'number' && pct !== 0 ? ` / ${sign}${Math.abs(pct)}%` : '';
    return `${sign}${Math.abs(delta).toLocaleString()} MMK${pctStr}`;
  };

  const trustedShopsText = latestTrustedGoldShops
    .slice(0, 4)
    .map((s) => `${s.shopNameMm}: ${s.gold24kRate.toLocaleString()} MMK`)
    .join('; ');

  const lengthGuidance =
    bulletinFormat === 'flash_brief'
      ? 'Keep the video script crisp (~30 seconds spoken, 85-115 Burmese words across 3 tight segments: Intro/Gold, FX, Fuel/Outro) and keep the Facebook post focused and scannable.'
      : 'Make the video script a full ~55-60 second TV/Reels anchor bulletin (170-230 Burmese words across 5 structured segments: Intro, Gold & Parity, Foreign Exchange, Fuel & Essential Staples, Closing) and make the Facebook post a thorough 24-hour market wrap.';

  const prompt = `You are a seasoned Myanmar television financial news anchor and senior economic editor writing for "${brandLabel}".
Date: ${reportDateLabel} | Session: ${sessionLabelMm} | Gathered Time: ${formatYangonTime12h()}

LIVE & LAST-24-HOUR MARKET DATA (use ONLY these exact figures — do NOT invent or alter any number):
[GOLD & BULLION - 1 Kyat-tha]
- 24K (16-Pe) Open Market: ${(gold24k?.marketRate || 0).toLocaleString()} MMK (Morning: ${(gold24k?.morningRate || 0).toLocaleString()}, Evening: ${(gold24k?.eveningRate || 0).toLocaleString()}, 24h Δ: ${formatDelta(gold24k?.delta, gold24k?.deltaDirection, gold24k?.deltaPercent)})
- 15-Pe Gold Open Market: ${(gold15pe?.marketRate || 0).toLocaleString()} MMK (24h Δ: ${formatDelta(gold15pe?.delta, gold15pe?.deltaDirection, gold15pe?.deltaPercent)})
- YGEA Official Reference: ${(gold24k?.officialRate || 0).toLocaleString()} MMK (Spread: +${gold24k?.spreadPercent ?? 0}%)
- Global Spot Gold (XAU/USD): $${(worldGold?.marketRate || 0).toLocaleString()}/oz (24h Δ: ${worldGold?.deltaDirection === 'up' ? '+' : worldGold?.deltaDirection === 'down' ? '-' : ''}$${Math.abs(worldGold?.delta || 0).toFixed(2)})
- Implied Local Parity (at open USD): ${latestPipelineMeta?.spotParityMmkMarket ? `${latestPipelineMeta.spotParityMmkMarket.toLocaleString()} MMK/kyat-tha` : 'N/A'}
- Verified Gold Shops: ${trustedShopsText || 'Yangon/Mandalay Market Desk'}

[FOREIGN EXCHANGE - MMK]
- USD: Market Buy ${(usd?.marketBuyRate || 0).toLocaleString()} / Sell ${(usd?.marketSellRate || 0).toLocaleString()} MMK (Morning: ${(usd?.morningRate || 0).toLocaleString()}, Evening: ${(usd?.eveningRate || 0).toLocaleString()}, 24h Δ: ${formatDelta(usd?.delta, usd?.deltaDirection, usd?.deltaPercent)}) | CBM Official: ${(usd?.cbmOfficialRate || 2100).toLocaleString()} | Bank Online: ${(usd?.onlineTradingRate || 0).toLocaleString()}${latestPipelineMeta?.workerRemittanceUsd ? ` | Worker Remittance: ${latestPipelineMeta.workerRemittanceUsd.toLocaleString()}` : ''}
- SGD: Buy ${(sgd?.marketBuyRate || 0).toLocaleString()} / Sell ${(sgd?.marketSellRate || 0).toLocaleString()} MMK (24h Δ: ${formatDelta(sgd?.delta, sgd?.deltaDirection, sgd?.deltaPercent)})
- THB: Buy ${thb?.marketBuyRate ?? 0} / Sell ${thb?.marketSellRate ?? 0} MMK (24h Δ: ${thb?.delta ? `${thb.deltaDirection === 'up' ? '+' : '-'}${Math.abs(thb.delta)}` : '0'} MMK)
- EUR: Buy ${(eur?.marketBuyRate || 0).toLocaleString()} / Sell ${(eur?.marketSellRate || 0).toLocaleString()} MMK
- MYR: Buy ${(myr?.marketBuyRate || 0).toLocaleString()} / Sell ${(myr?.marketSellRate || 0).toLocaleString()} MMK

[FUEL & ESSENTIAL COMMODITIES]
- Octane 92: Market ${(fuel92?.openMarketRate || 0).toLocaleString()} MMK/L vs PPRD Ref ${(fuel92?.officialRefRate || 0).toLocaleString()} MMK/L (24h Δ: ${formatDelta(fuel92?.delta, fuel92?.deltaDirection)})
- Octane 95: Market ${(fuel95?.openMarketRate || 0).toLocaleString()} MMK/L vs PPRD Ref ${(fuel95?.officialRefRate || 0).toLocaleString()} MMK/L
- Standard Diesel: Market ${(diesel?.openMarketRate || 0).toLocaleString()} MMK/L vs PPRD Ref ${(diesel?.officialRefRate || 0).toLocaleString()} MMK/L (24h Δ: ${formatDelta(diesel?.delta, diesel?.deltaDirection)})
- Palm Oil (1 Viss): Market ${(palmOil?.openMarketRate || 0).toLocaleString()} MMK vs DOCA Ref ${(palmOil?.officialRefRate || 0).toLocaleString()} MMK
- Shwebo Pawsan Rice (1 Bag): ${(riceShwebo?.openMarketRate || 0).toLocaleString()} MMK | Emata Rice: ${(riceEmata?.openMarketRate || 0).toLocaleString()} MMK

[LAST DIGEST & SOURCES]
- Market Mood: ${activeDigest.marketSentiment}
- Validation Parity Note: ${latestPipelineMeta?.validation?.parityStatus || 'verified'}
- Sources: ${sourceLabel}

REQUIREMENTS:
1. "facebookPostMm": Write a polished, authoritative Burmese Facebook News Post summarizing the **last 24 hours** market situation in News Anchor tone (e.g., opening with a broadcast-desk greeting & 24h takeaway, crisp bulleted or sectioned figures covering Gold 24K/15-Pe + XAU spot, USD/SGD/THB buy-sell & 24h directional move, Fuel & Palm Oil/Rice, official-vs-market spread takeaway, source line, and clean Burmese/English hashtags).
2. "videoScriptMm": Write a teleprompter-ready Burmese News Anchor broadcast script with production/camera cues in brackets (e.g., [STUDIO CAM], [LOWER THIRD: ...], [GRAPHIC], [PAUSE]) formatted clearly with section headers so an anchor can read it directly on camera.
3. "scriptSections": Return the exact matching breakdown of sections as structured items ({ cueLabel, timingHint, scriptMm }).
4. ${lengthGuidance}
5. Use authentic, formal Burmese newsroom vocabulary ("မင်္ဂလာပါ", "ယနေ့ ၂၄ နာရီအတွင်း...", "ဈေးကွက်အဖွင့်အပိတ်...", "ကျပ်", "ပဲရည်", "ဝယ်ဈေး/ရောင်းဈေး").`;

  const broadcastSchema = {
    type: Type.OBJECT,
    properties: {
      anchorHeadlineMm: {
        type: Type.STRING,
        description: 'Crisp single-line Burmese News Anchor headline summarizing the 24h market trend.',
      },
      facebookPostMm: {
        type: Type.STRING,
        description: 'Complete formatted Burmese Facebook post summarizing the last 24 hours market situation in News Anchor tone.',
      },
      videoScriptMm: {
        type: Type.STRING,
        description: 'Complete teleprompter-ready Burmese News Anchor video script with studio cues and section markers.',
      },
      scriptSections: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            cueLabel: { type: Type.STRING, description: 'Segment cue e.g. [INTRO], [GOLD & PARITY], [FOREX], [FUEL & STAPLES], [OUTRO]' },
            timingHint: { type: Type.STRING, description: 'Timestamp window e.g. 0:00 - 0:10' },
            scriptMm: { type: Type.STRING, description: 'Spoken Burmese anchor lines for this segment.' },
          },
          required: ['cueLabel', 'timingHint', 'scriptMm'],
        },
        description: 'Structured cue-by-cue breakdown of the video script.',
      },
      estimatedDurationSec: {
        type: Type.INTEGER,
        description: 'Estimated spoken runtime in seconds.',
      },
    },
    required: ['anchorHeadlineMm', 'facebookPostMm', 'videoScriptMm', 'scriptSections', 'estimatedDurationSec'],
  };

  const broadcastSystemInstruction =
    'You are an experienced Myanmar broadcast financial news anchor and editor. Produce natural, credible formal Burmese Unicode suitable for TV teleprompters and Facebook newsroom bulletins. Never invent prices not given in the prompt.';

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(new Error('Gemini broadcast script request timed out after 50s')),
    50000
  );

  try {
    let response;
    try {
      response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          abortSignal: controller.signal,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: broadcastSchema,
          systemInstruction: broadcastSystemInstruction,
        },
      });
    } catch (primaryErr: any) {
      const msg = primaryErr?.message || String(primaryErr);
      if (!/429|503|RESOURCE_EXHAUSTED|UNAVAILABLE|quota|high demand/i.test(msg)) {
        throw primaryErr;
      }
      response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
          abortSignal: controller.signal,
          responseMimeType: 'application/json',
          responseSchema: broadcastSchema,
          systemInstruction: broadcastSystemInstruction,
        },
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const rawText = (response.text || '{}').trim();
    const cleanedJson = rawText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(cleanedJson);

    if (!parsed.facebookPostMm || !parsed.videoScriptMm) {
      return res.status(502).json({
        error: 'Gemini returned an incomplete broadcast script payload. Please retry.',
        code: 'INCOMPLETE_MODEL_OUTPUT',
      });
    }

    commitUserQuota(uid, 'digest');

    return res.json({
      anchorHeadlineMm: String(parsed.anchorHeadlineMm || ''),
      facebookPostMm: String(parsed.facebookPostMm),
      videoScriptMm: String(parsed.videoScriptMm),
      scriptSections: Array.isArray(parsed.scriptSections) ? parsed.scriptSections : [],
      estimatedDurationSec:
        typeof parsed.estimatedDurationSec === 'number' && parsed.estimatedDurationSec > 0
          ? parsed.estimatedDurationSec
          : bulletinFormat === 'flash_brief'
          ? 30
          : 55,
      bulletinFormat,
      session: targetSession,
      generatedAt: formatYangonTime12h(),
      quota: buildQuotaStatus(uid),
    });
  } catch (error: any) {
    clearTimeout(timeoutId);
    console.error('Gemini broadcast script error:', error?.message || String(error));
    return res.status(502).json({
      error: error?.message || 'Failed to generate Burmese News Anchor broadcast content.',
      code: 'GEMINI_GENERATION_FAILED',
      quota: buildQuotaStatus(uid),
    });
  }
});

// Explicit JSON 404 for unknown /api routes
app.all('/api/*', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Global JSON error handler for APIs
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.path.startsWith('/api')) {
    return res.status(err?.status || 500).json({ error: err?.message || 'Internal server error' });
  }
  return next(err);
});

// Production / Dev handling
const distPath = path.resolve(process.cwd(), 'dist');
const isDev =
  process.env.APP_ENV === 'dev' ||
  (process.env.NODE_ENV === 'development' && !fs.existsSync(distPath));

if (!isDev && fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  const viteMiddlewaresPromise = (async () => {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    return vite.middlewares;
  })();

  viteMiddlewaresPromise.catch((err) => {
    console.error('Vite middleware initialization failed:', err);
  });

  app.use(async (req, res, next) => {
    try {
      const middlewares = await viteMiddlewaresPromise;
      middlewares(req, res, next);
    } catch (err) {
      next(err);
    }
  });
}

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);

  // Pre-warm market snapshot from direct/telegram/cache once on boot, then stagger news check
  void syncPipelineState(false);
  const newsWarmTimer = setTimeout(() => {
    void fetchMyanmarEconomicNews({
      aiClient: ai,
      forceRefresh: false,
      customTelegramChannels: configuredTelegramChannels,
    });
  }, 6000);
  newsWarmTimer.unref();

  // Periodically check pipeline freshness without force-bypassing the 60-minute Google Search cache
  const refreshTimer = setInterval(() => {
    void syncPipelineState(false);
  }, PIPELINE_CACHE_TTL_MS);
  refreshTimer.unref();
});
