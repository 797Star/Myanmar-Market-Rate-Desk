import { useState, useEffect, useCallback, useRef } from 'react';
import type { User } from 'firebase/auth';
import type {
  AiQuotaStatus,
  BankExchangeRate,
  CommodityQuote,
  CurrencyQuote,
  DailyDigest,
  DataSourceStatus,
  GoldQuote,
  InflationBasketItem,
  IntelligenceReport,
  MarketFeedStatus,
  MarketSession,
  PipelineMeta,
  TrustedGoldShopQuote,
} from '../types';
import {
  initialCommodityQuotes,
  initialCurrencyQuotes,
  initialDigest,
  initialGoldQuotes,
  initialInflationBasket,
  initialIntelligenceReports,
} from '../data/initialData';
import {
  applyCommodityOverrides,
  applyCurrencyOverrides,
  applyGoldOverrides,
  calcSpread,
  formatYangonDateMm,
  getCurrentYangonSession,
  switchCommoditySession,
  switchCurrencySession,
  switchGoldSession,
} from '../utils/quoteHelpers';
import {
  getFirebaseIdToken,
  recordAiUsageInFirestore,
  saveCustomRateToFirestore,
  subscribeCustomRates,
  updateUserPreferences,
} from '../firebase';

const CLIENT_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_SEARCH_THROTTLE_MS = 2000;
const MAX_SEARCH_THROTTLE_MS = 60_000;
const LAST_GOOD_CACHE_KEY = 'mmw_last_good_snapshot_v2';
const MOCK_BASELINE_TIMESTAMP = '2026-11-23T12:00:00.000Z';

function clampThrottleDelay(ms: number): number {
  if (!Number.isFinite(ms)) return DEFAULT_SEARCH_THROTTLE_MS;
  return Math.max(0, Math.min(MAX_SEARCH_THROTTLE_MS, Math.round(ms)));
}

interface QueuedSearchTask<T = unknown> {
  id: string;
  dedupeKey?: string;
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  promise: Promise<T>;
}

interface CachedSnapshotPayload {
  gold: GoldQuote[];
  currencies: CurrencyQuote[];
  commodities: CommodityQuote[];
  basket?: InflationBasketItem[];
  digest?: DailyDigest;
  bankRates?: BankExchangeRate[];
  trustedGoldShops?: TrustedGoldShopQuote[];
  dataSources?: DataSourceStatus[];
  pipelineMeta?: PipelineMeta | null;
  savedAt: string;
}

function readCachedSnapshot(): CachedSnapshotPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LAST_GOOD_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedSnapshotPayload;
    if (!Array.isArray(parsed.gold) || !Array.isArray(parsed.currencies)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedSnapshot(payload: CachedSnapshotPayload): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LAST_GOOD_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota errors
  }
}

export function useMarketDashboard(params: {
  user: User | null;
  authReady: boolean;
  isDark: boolean;
  currentSession: MarketSession;
  setCurrentSession: (session: MarketSession) => void;
  searchThrottleDelayMs?: number;
}) {
  const {
    user,
    authReady,
    isDark,
    currentSession,
    setCurrentSession,
    searchThrottleDelayMs: initialThrottleDelayMs,
  } = params;

  const [initialCache] = useState<CachedSnapshotPayload | null>(() => readCachedSnapshot());

  const [goldQuotes, setGoldQuotes] = useState<GoldQuote[]>(
    () => initialCache?.gold || initialGoldQuotes
  );
  const [currencyQuotes, setCurrencyQuotes] = useState<CurrencyQuote[]>(
    () => initialCache?.currencies || initialCurrencyQuotes
  );
  const [commodityQuotes, setCommodityQuotes] = useState<CommodityQuote[]>(
    () => initialCache?.commodities || initialCommodityQuotes
  );
  const [intelligenceReports, setIntelligenceReports] = useState<IntelligenceReport[]>(
    initialIntelligenceReports
  );
  const [inflationBasket, setInflationBasket] = useState<InflationBasketItem[]>(
    () => initialCache?.basket || initialInflationBasket
  );
  const [digest, setDigest] = useState<DailyDigest>(() => ({
    ...(initialCache?.digest || initialDigest),
    date: formatYangonDateMm(),
    session: getCurrentYangonSession(),
  }));
  const [bankRates, setBankRates] = useState<BankExchangeRate[]>(
    () => initialCache?.bankRates || []
  );
  const [trustedGoldShops, setTrustedGoldShops] = useState<TrustedGoldShopQuote[]>(
    () => initialCache?.trustedGoldShops || []
  );
  const [dataSources, setDataSources] = useState<DataSourceStatus[]>(
    () => initialCache?.dataSources || []
  );
  const [pipelineMeta, setPipelineMeta] = useState<PipelineMeta | null>(
    () => initialCache?.pipelineMeta || null
  );
  const [feedStatus, setFeedStatus] = useState<MarketFeedStatus>(() => ({
    mode: initialCache ? 'google_search' : 'fallback_mock',
    isFallback: !initialCache,
    endpointUrl: 'Google Search Grounding',
    lastSuccessfulUpdate: initialCache?.savedAt || MOCK_BASELINE_TIMESTAMP,
    sourceBadgeLabel: 'Market Source: Google Search Grounding (On-Ground / Reference)',
    fallbackReason: initialCache ? null : 'Connecting to Google Search grounding pipeline',
  }));
  const [configuredFeedUrl, setConfiguredFeedUrl] = useState<string>('');
  const [isUpdatingFeedConfig, setIsUpdatingFeedConfig] = useState<boolean>(false);
  const [feedConfigError, setFeedConfigError] = useState<string | null>(null);
  const [configuredTelegramChannels, setConfiguredTelegramChannels] = useState<string[]>([]);
  const [isUpdatingTelegramConfig, setIsUpdatingTelegramConfig] = useState<boolean>(false);
  const [telegramConfigError, setTelegramConfigError] = useState<string | null>(null);

  const [isSyncing, setIsSyncing] = useState<boolean>(true);
  const [isStreetFxSyncing, setIsStreetFxSyncing] = useState<boolean>(false);
  const [isSearchGrounding, setIsSearchGrounding] = useState<boolean>(false);
  const [searchGroundingError, setSearchGroundingError] = useState<string | null>(null);
  const [isSyncingShops, setIsSyncingShops] = useState<boolean>(false);
  const [shopSyncError, setShopSyncError] = useState<string | null>(null);
  const [isAiGenerating, setIsAiGenerating] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [quotaStatus, setQuotaStatus] = useState<AiQuotaStatus | null>(null);
  const [searchThrottleDelayMs, setSearchThrottleDelayState] = useState<number>(() =>
    clampThrottleDelay(initialThrottleDelayMs ?? DEFAULT_SEARCH_THROTTLE_MS)
  );
  const [queuedRequestsCount, setQueuedRequestsCount] = useState<number>(0);

  const customOverridesRef = useRef<{
    gold: Map<string, number>;
    currency: Map<string, number>;
    commodity: Map<string, number>;
  }>({
    gold: new Map(),
    currency: new Map(),
    commodity: new Map(),
  });

  const lastFetchedMsRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);
  const throttleDelayRef = useRef<number>(searchThrottleDelayMs);
  throttleDelayRef.current = searchThrottleDelayMs;

  const requestQueueRef = useRef<QueuedSearchTask<any>[]>([]);
  const isQueueRunningRef = useRef<boolean>(false);
  const lastQueuedCallFinishedAtRef = useRef<number>(0);
  const activeThrottleTimerRef = useRef<number | null>(null);

  const setSearchThrottleDelayMs = useCallback((nextDelayMs: number) => {
    const clamped = clampThrottleDelay(nextDelayMs);
    throttleDelayRef.current = clamped;
    setSearchThrottleDelayState(clamped);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (activeThrottleTimerRef.current !== null) {
        window.clearTimeout(activeThrottleTimerRef.current);
        activeThrottleTimerRef.current = null;
      }
      const pending = requestQueueRef.current.splice(0);
      pending.forEach((item) => item.reject(new Error('Dashboard unmounted before queued request started')));
    };
  }, []);

  const processRequestQueue = useCallback(async () => {
    if (isQueueRunningRef.current) return;
    isQueueRunningRef.current = true;

    try {
      while (requestQueueRef.current.length > 0 && isMountedRef.current) {
        const nextTask = requestQueueRef.current.shift()!;
        if (isMountedRef.current) {
          setQueuedRequestsCount(requestQueueRef.current.length + 1);
        }

        const delayMs = throttleDelayRef.current;
        if (lastQueuedCallFinishedAtRef.current > 0 && delayMs > 0) {
          const elapsedMs = Date.now() - lastQueuedCallFinishedAtRef.current;
          const waitMs = delayMs - elapsedMs;
          if (waitMs > 0) {
            await new Promise<void>((resolveWait) => {
              activeThrottleTimerRef.current = window.setTimeout(() => {
                activeThrottleTimerRef.current = null;
                resolveWait();
              }, waitMs);
            });
          }
        }

        if (!isMountedRef.current) {
          nextTask.reject(new Error('Dashboard unmounted before queued request started'));
          break;
        }

        try {
          const result = await nextTask.run();
          nextTask.resolve(result);
        } catch (err) {
          nextTask.reject(err);
        } finally {
          lastQueuedCallFinishedAtRef.current = Date.now();
        }
      }
    } finally {
      isQueueRunningRef.current = false;
      if (isMountedRef.current) {
        setQueuedRequestsCount(requestQueueRef.current.length);
      }
    }
  }, []);

  const enqueueThrottledRequest = useCallback(
    <T,>(run: () => Promise<T>, options?: { dedupeKey?: string }): Promise<T> => {
      const dedupeKey = options?.dedupeKey;
      if (dedupeKey) {
        const existing = requestQueueRef.current.find((t) => t.dedupeKey === dedupeKey);
        if (existing) {
          return existing.promise as Promise<T>;
        }
      }

      let resolveFn!: (value: T) => void;
      let rejectFn!: (reason?: unknown) => void;
      const promise = new Promise<T>((resolve, reject) => {
        resolveFn = resolve;
        rejectFn = reject;
      });

      const task: QueuedSearchTask<T> = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        dedupeKey,
        run,
        resolve: resolveFn,
        reject: rejectFn,
        promise,
      };

      requestQueueRef.current.push(task);
      if (isMountedRef.current) {
        setQueuedRequestsCount(requestQueueRef.current.length + (isQueueRunningRef.current ? 1 : 0));
      }
      void processRequestQueue();
      return promise;
    },
    [processRequestQueue]
  );

  // Sync Firestore custom user rate overrides after auth settles
  useEffect(() => {
    if (!authReady || !user) {
      customOverridesRef.current = {
        gold: new Map(),
        currency: new Map(),
        commodity: new Map(),
      };
      return;
    }

    const unsubRates = subscribeCustomRates(user.uid, (storedRates) => {
      const goldMap = new Map<string, number>();
      const fxMap = new Map<string, number>();
      const commMap = new Map<string, number>();

      storedRates.forEach((r) => {
        if (r.assetType === 'gold') goldMap.set(r.assetId, r.customRate);
        if (r.assetType === 'currency') fxMap.set(r.assetId, r.customRate);
        if (r.assetType === 'commodity') commMap.set(r.assetId, r.customRate);
      });

      customOverridesRef.current = { gold: goldMap, currency: fxMap, commodity: commMap };

      if (goldMap.size > 0) setGoldQuotes((prev) => applyGoldOverrides(prev, goldMap));
      if (fxMap.size > 0) setCurrencyQuotes((prev) => applyCurrencyOverrides(prev, fxMap));
      if (commMap.size > 0) setCommodityQuotes((prev) => applyCommodityOverrides(prev, commMap));
    });

    return () => unsubRates();
  }, [authReady, user]);

  // Fetch per-user server AI/Search quota status when authenticated
  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      setQuotaStatus(null);
      return;
    }

    setAiError(null);
    setSearchGroundingError(null);
    setShopSyncError(null);

    let cancelled = false;
    (async () => {
      try {
        const idToken = await getFirebaseIdToken();
        if (!idToken || cancelled) return;
        const res = await fetch('/api/auth/quota', {
          headers: { Authorization: `Bearer ${idToken}` },
          cache: 'no-store',
        });
        if (!res.ok || cancelled) return;
        const payload = await res.json();
        if (!cancelled && payload?.quota) {
          setQuotaStatus(payload.quota as AiQuotaStatus);
        }
      } catch {
        // Non-blocking quota check
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authReady, user]);

  const applyMarketPayload = useCallback(
    (data: any) => {
      const overrides = customOverridesRef.current;
      const nextGold = Array.isArray(data.gold)
        ? applyGoldOverrides(data.gold, overrides.gold)
        : null;
      const nextCurrencies = Array.isArray(data.currencies)
        ? applyCurrencyOverrides(data.currencies, overrides.currency)
        : null;
      const nextCommodities = Array.isArray(data.commodities)
        ? applyCommodityOverrides(data.commodities, overrides.commodity)
        : null;

      if (nextGold) setGoldQuotes(nextGold);
      if (nextCurrencies) setCurrencyQuotes(nextCurrencies);
      if (nextCommodities) setCommodityQuotes(nextCommodities);
      if (data.reports) setIntelligenceReports(data.reports);
      if (data.basket) setInflationBasket(data.basket);
      if (data.digest) setDigest(data.digest);
      if (data.session) setCurrentSession(data.session);
      if (Array.isArray(data.bankRates)) setBankRates(data.bankRates);
      if (Array.isArray(data.trustedGoldShops)) setTrustedGoldShops(data.trustedGoldShops);
      if (Array.isArray(data.dataSources)) setDataSources(data.dataSources);
      if (data.pipelineMeta) setPipelineMeta(data.pipelineMeta);

      const resolvedStatus: MarketFeedStatus = data.feedStatus || {
        mode: 'google_search',
        isFallback: false,
        endpointUrl: 'Google Search Grounding',
        lastSuccessfulUpdate:
          data.pipelineMeta?.lastSyncedAt || data.timestamp || new Date().toISOString(),
        sourceBadgeLabel: 'Market Source: Google Search Grounding (On-Ground / Reference)',
        fallbackReason: null,
      };
      setFeedStatus(resolvedStatus);

      if (typeof data.configuredExternalFeedUrl === 'string') {
        setConfiguredFeedUrl(data.configuredExternalFeedUrl);
      }
      if (Array.isArray(data.configuredTelegramChannels)) {
        setConfiguredTelegramChannels(data.configuredTelegramChannels);
      }

      if (!resolvedStatus.isFallback && nextGold && nextCurrencies && nextCommodities) {
        writeCachedSnapshot({
          gold: nextGold,
          currencies: nextCurrencies,
          commodities: nextCommodities,
          basket: data.basket,
          digest: data.digest,
          bankRates: data.bankRates,
          trustedGoldShops: data.trustedGoldShops,
          dataSources: data.dataSources,
          pipelineMeta: data.pipelineMeta,
          savedAt: resolvedStatus.lastSuccessfulUpdate,
        });
      }
      lastFetchedMsRef.current = Date.now();
    },
    [setCurrentSession]
  );

  // Fetch live market payload via throttled queue (public cached endpoint on boot; authenticated POST /api/market/sync for force refresh)
  const fetchMarketData = useCallback(
    async (forceRefresh = false) => {
      setIsSyncing(true);
      const canForceSync = Boolean(forceRefresh && user);

      try {
        await enqueueThrottledRequest(
          async () => {
            const controller = new AbortController();
            const timeoutId = window.setTimeout(
              () => controller.abort(),
              canForceSync ? 26000 : 18000
            );
            try {
              let res: Response;
              if (canForceSync) {
                const idToken = await getFirebaseIdToken();
                if (idToken) {
                  res = await fetch('/api/market/sync', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${idToken}` },
                    cache: 'no-store',
                    signal: controller.signal,
                  });
                } else {
                  res = await fetch('/api/market', {
                    cache: 'no-store',
                    signal: controller.signal,
                  });
                }
              } else {
                res = await fetch('/api/market', {
                  cache: 'no-store',
                  signal: controller.signal,
                });
              }

              const contentType = res.headers.get('content-type') || '';
              if (!contentType.includes('application/json')) {
                throw new Error(`REST API responded with ${res.status}`);
              }

              const data = await res.json();
              if (data?.quota) {
                setQuotaStatus(data.quota as AiQuotaStatus);
              }

              if (res.status === 401 || res.status === 429) {
                setSearchGroundingError(
                  data?.error || 'Live Google Search sync paused to protect daily token quota.'
                );
                return;
              }

              if (!res.ok) {
                throw new Error(data?.error || `REST API responded with ${res.status}`);
              }

              applyMarketPayload(data);
              if (canForceSync && user && data?.quota && !data.quota.cachedServed) {
                recordAiUsageInFirestore(user.uid, 'market_sync', 'gemini-4-hydrogen', {
                  digestUsed: data.quota.digestUsed,
                  searchUsed: data.quota.searchUsed,
                  dateKey: data.quota.dateKey,
                }).catch(() => undefined);
              }
            } finally {
              window.clearTimeout(timeoutId);
            }
          },
          { dedupeKey: canForceSync ? undefined : 'market_cached_poll' }
        );
      } catch (err) {
        if (!isMountedRef.current) return;
        const cached = readCachedSnapshot();
        if (cached) {
          setGoldQuotes(cached.gold);
          setCurrencyQuotes(cached.currencies);
          setCommodityQuotes(cached.commodities);
        } else {
          setGoldQuotes(initialGoldQuotes);
          setCurrencyQuotes(initialCurrencyQuotes);
          setCommodityQuotes(initialCommodityQuotes);
        }
        setFeedStatus((prev) => ({
          ...prev,
          mode: 'fallback_mock',
          isFallback: true,
          sourceBadgeLabel: 'Market Source: Street Rate / Reference Rate',
          fallbackReason:
            err instanceof Error
              ? `API unreachable (${err.message}); showing ${cached ? 'cached snapshot' : 'fallback mock data'}.`
              : 'REST API temporarily unavailable; showing fallback snapshot.',
        }));
      } finally {
        if (isMountedRef.current) {
          setIsSyncing(false);
        }
      }
    },
    [applyMarketPayload, enqueueThrottledRequest, user]
  );

  // Sync initial feed URL configuration on mount + refresh on focus/interval
  useEffect(() => {
    void fetchMarketData(false);
    fetch('/api/market/feed-config')
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (cfg && typeof cfg.configuredExternalFeedUrl === 'string') {
          setConfiguredFeedUrl(cfg.configuredExternalFeedUrl);
        }
      })
      .catch(() => undefined);

    fetch('/api/market/telegram-channels')
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (cfg && Array.isArray(cfg.configuredTelegramChannels)) {
          setConfiguredTelegramChannels(cfg.configuredTelegramChannels);
        }
      })
      .catch(() => undefined);

    const handleVisibility = () => {
      if (
        document.visibilityState === 'visible' &&
        Date.now() - lastFetchedMsRef.current >= CLIENT_REFRESH_INTERVAL_MS
      ) {
        void fetchMarketData(false);
      }
    };

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void fetchMarketData(false);
      }
    }, CLIENT_REFRESH_INTERVAL_MS);

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchMarketData]);

  const handleConfigureFeedUrl = async (feedUrl: string): Promise<boolean> => {
    setIsUpdatingFeedConfig(true);
    setFeedConfigError(null);
    try {
      const res = await fetch('/api/market/feed-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedConfigError(data?.error || `Failed to update feed URL (${res.status})`);
        return false;
      }
      setConfiguredFeedUrl(feedUrl.trim());
      applyMarketPayload(data);
      return true;
    } catch (err) {
      setFeedConfigError(err instanceof Error ? err.message : 'Unable to reach REST API');
      return false;
    } finally {
      setIsUpdatingFeedConfig(false);
    }
  };

  const handleConfigureTelegramChannels = async (channels: string[]): Promise<boolean> => {
    setIsUpdatingTelegramConfig(true);
    setTelegramConfigError(null);
    try {
      const res = await fetch('/api/market/telegram-channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTelegramConfigError(data?.error || `Failed to update Telegram channels (${res.status})`);
        return false;
      }
      if (Array.isArray(data.configuredTelegramChannels)) {
        setConfiguredTelegramChannels(data.configuredTelegramChannels);
      }
      applyMarketPayload(data);
      return true;
    } catch (err) {
      setTelegramConfigError(err instanceof Error ? err.message : 'Unable to reach REST API');
      return false;
    } finally {
      setIsUpdatingTelegramConfig(false);
    }
  };

  const handleActivateFallbackPreview = () => {
    setGoldQuotes(initialGoldQuotes);
    setCurrencyQuotes(initialCurrencyQuotes);
    setCommodityQuotes(initialCommodityQuotes);
    setFeedStatus((prev) => ({
      ...prev,
      mode: 'fallback_mock',
      isFallback: true,
      sourceBadgeLabel: 'Market Source: Google Search Grounding (Fallback)',
      fallbackReason: 'Fallback baseline data state active (simulated Google Search downtime preview)',
    }));
  };

  const handleSessionToggle = async (session: MarketSession) => {
    setCurrentSession(session);
    setGoldQuotes((prev) => switchGoldSession(prev, session));
    setCurrencyQuotes((prev) => switchCurrencySession(prev, session));
    setCommodityQuotes((prev) => switchCommoditySession(prev, session));

    if (authReady && user) {
      updateUserPreferences(user.uid, session, isDark ? 'dark' : 'light').catch((err) =>
        console.error('Failed to sync session preference:', err)
      );
    }

    try {
      await fetch('/api/market/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session }),
      });
    } catch {
      // Offline fallback
    }
  };

  const handleSyncTrustedShops = useCallback(async () => {
    setShopSyncError(null);
    if (!user) {
      setShopSyncError(
        'Sign in with Google to run live gold shop verification and track your daily token quota.'
      );
      return;
    }

    setIsSyncingShops(true);
    try {
      await enqueueThrottledRequest(async () => {
        const idToken = await getFirebaseIdToken();
        if (!idToken) {
          setShopSyncError('Authentication expired. Please sign in with Google again.');
          return;
        }

        const res = await fetch('/api/gold/shops-sync', {
          method: 'POST',
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new Error(`Trusted shops sync responded with HTTP ${res.status}`);
        }

        const data = await res.json();
        if (data?.quota) {
          setQuotaStatus(data.quota as AiQuotaStatus);
        }
        if (!res.ok) {
          throw new Error(data?.error || `Trusted shops sync failed (${res.status})`);
        }

        const overrides = customOverridesRef.current;
        if (Array.isArray(data.gold)) {
          setGoldQuotes(applyGoldOverrides(data.gold, overrides.gold));
        }
        if (Array.isArray(data.trustedGoldShops)) setTrustedGoldShops(data.trustedGoldShops);
        if (Array.isArray(data.dataSources)) setDataSources(data.dataSources);
        if (data.pipelineMeta) setPipelineMeta(data.pipelineMeta);

        if (data?.quota && !data.quota.cachedServed) {
          recordAiUsageInFirestore(user.uid, 'shops_sync', 'gemini-4-hydrogen', {
            digestUsed: data.quota.digestUsed,
            searchUsed: data.quota.searchUsed,
            dateKey: data.quota.dateKey,
          }).catch(() => undefined);
        }
      });
    } catch (err) {
      if (!isMountedRef.current) return;
      console.error('Trusted gold shops sync failed:', err);
      setShopSyncError(
        err instanceof Error ? err.message : 'Trusted gold shops search failed.'
      );
    } finally {
      if (isMountedRef.current) {
        setIsSyncingShops(false);
      }
    }
  }, [enqueueThrottledRequest, user]);

  const handleRunStreetFxSync = async (streetUsd?: number) => {
    setIsStreetFxSyncing(true);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 16000);
    try {
      const hasStreetOverride = typeof streetUsd === 'number' && Number.isFinite(streetUsd);
      if (hasStreetOverride) {
        customOverridesRef.current.currency.clear();
      }
      const res = await fetch('/api/fx/street-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: hasStreetOverride ? JSON.stringify({ streetUsd }) : undefined,
        signal: controller.signal,
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        applyMarketPayload(data);
      }
    } catch (err) {
      console.error('Street FX cross-sync failed:', err);
    } finally {
      window.clearTimeout(timeoutId);
      setIsStreetFxSyncing(false);
    }
  };

  const handleRunSearchGrounding = useCallback(async () => {
    setSearchGroundingError(null);
    if (!user) {
      setSearchGroundingError(
        'Sign in with Google to run live Google Search grounding and protect daily token quota.'
      );
      return;
    }

    setIsSearchGrounding(true);
    try {
      await enqueueThrottledRequest(async () => {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 30000);
        try {
          const idToken = await getFirebaseIdToken();
          if (!idToken) {
            setSearchGroundingError('Authentication expired. Please sign in with Google again.');
            return;
          }

          const res = await fetch('/api/market/search-grounding', {
            method: 'POST',
            headers: { Authorization: `Bearer ${idToken}` },
            signal: controller.signal,
          });
          const contentType = res.headers.get('content-type') || '';
          if (!contentType.includes('application/json')) {
            throw new Error(`Google Search grounding responded with HTTP ${res.status}`);
          }
          const data = await res.json();
          if (data?.quota) {
            setQuotaStatus(data.quota as AiQuotaStatus);
          }
          if (!res.ok) {
            throw new Error(data?.error || `Google Search grounding failed (${res.status})`);
          }

          applyMarketPayload(data);
          const errNote = data?.searchGrounding?.error || data?.pipelineMeta?.searchGrounding?.error;
          if (errNote) {
            setSearchGroundingError(errNote);
          }

          if (data?.quota && !data.quota.cachedServed) {
            recordAiUsageInFirestore(user.uid, 'search_grounding', 'gemini-4-hydrogen', {
              digestUsed: data.quota.digestUsed,
              searchUsed: data.quota.searchUsed,
              dateKey: data.quota.dateKey,
            }).catch(() => undefined);
          }
        } finally {
          window.clearTimeout(timeoutId);
        }
      });
    } catch (err) {
      if (!isMountedRef.current) return;
      setSearchGroundingError(
        err instanceof Error ? err.message : 'Google Search grounding request failed.'
      );
    } finally {
      if (isMountedRef.current) {
        setIsSearchGrounding(false);
      }
    }
  }, [applyMarketPayload, enqueueThrottledRequest, user]);

  const handleTriggerAiDigest = useCallback(async () => {
    setAiError(null);
    if (!user) {
      setAiError(
        'Sign in with Google to generate live AI briefings and protect your daily token allowance.'
      );
      return;
    }

    setIsAiGenerating(true);
    try {
      await enqueueThrottledRequest(async () => {
        const idToken = await getFirebaseIdToken();
        if (!idToken) {
          throw new Error('Authentication expired. Please sign in with Google again.');
        }

        const res = await fetch('/api/ai/digest', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ sessionFocus: currentSession }),
        });

        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new Error(`ဆာဗာမှ JSON မဟုတ်သော တုံ့ပြန်မှု (${res.status}) ပြန်လာပါသည်။`);
        }

        const payload = await res.json();
        if (payload?.quota) {
          setQuotaStatus(payload.quota as AiQuotaStatus);
        }
        if (!res.ok) {
          throw new Error(payload?.error || `AI သုံးသပ်ချက် ရယူမှု မအောင်မြင်ပါ (${res.status})`);
        }

        setDigest(payload);
        if (payload?.quota && !payload.quota.cachedServed) {
          recordAiUsageInFirestore(user.uid, 'digest', 'gemini-4-hydrogen', {
            digestUsed: payload.quota.digestUsed,
            searchUsed: payload.quota.searchUsed,
            dateKey: payload.quota.dateKey,
          }).catch(() => undefined);
        }
      });
    } catch (err: any) {
      if (!isMountedRef.current) return;
      console.error('Failed to generate AI digest:', err);
      setAiError(err?.message || 'AI ဈေးကွက်သုံးသပ်ချက် ထုတ်ယူရာတွင် အမှားဖြစ်ပွားပါသည်။');
    } finally {
      if (isMountedRef.current) {
        setIsAiGenerating(false);
      }
    }
  }, [currentSession, enqueueThrottledRequest, user]);

  const handleSaveRate = async (type: string, id: string, newRate: number) => {
    let assetName = id;

    if (type === 'gold') {
      const target = goldQuotes.find((g) => g.id === id);
      if (target) assetName = target.nameMm;
      customOverridesRef.current.gold.set(id, newRate);
      setGoldQuotes((prev) =>
        prev.map((g) =>
          g.id === id
            ? { ...g, marketRate: newRate, ...calcSpread(newRate, g.officialRate) }
            : g
        )
      );
    } else if (type === 'currency') {
      const target = currencyQuotes.find((c) => c.code === id);
      if (target) assetName = target.nameMm;
      customOverridesRef.current.currency.set(id, newRate);
      setCurrencyQuotes((prev) =>
        prev.map((c) =>
          c.code === id
            ? { ...c, marketSellRate: newRate, ...calcSpread(newRate, c.cbmOfficialRate) }
            : c
        )
      );
    } else if (type === 'commodity') {
      const target = commodityQuotes.find((cm) => cm.id === id);
      if (target) assetName = target.nameMm;
      customOverridesRef.current.commodity.set(id, newRate);
      setCommodityQuotes((prev) =>
        prev.map((cm) => {
          if (cm.id !== id) return cm;
          const { spreadPercent } = calcSpread(newRate, cm.officialRefRate);
          return { ...cm, openMarketRate: newRate, spreadPercent };
        })
      );
    }

    if (authReady && user && (type === 'gold' || type === 'currency' || type === 'commodity')) {
      saveCustomRateToFirestore(user.uid, type, id, assetName, newRate, currentSession).catch(
        (err) => console.error('Failed to persist custom rate:', err)
      );
    }

    try {
      await fetch('/api/market/update-rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, id, newRate }),
      });
    } catch {
      // Local state is already updated
    }
  };

  const handleImportRatesFromSheet = async (rows: string[][]) => {
    for (const row of rows) {
      if (!row || row.length < 6) continue;
      const categoryCell = String(row[0] || '').toLowerCase();
      const assetId = String(row[1] || '').trim();
      const rawMarketValue = String(row[5] || '').replace(/,/g, '').trim();
      const numericRate = parseFloat(rawMarketValue);
      if (!assetId || isNaN(numericRate) || numericRate <= 0) continue;

      if (categoryCell.includes('gold') || goldQuotes.some((g) => g.id === assetId)) {
        await handleSaveRate('gold', assetId, numericRate);
      } else if (categoryCell.includes('currency') || currencyQuotes.some((c) => c.code === assetId)) {
        await handleSaveRate('currency', assetId, numericRate);
      } else if (categoryCell.includes('commodity') || commodityQuotes.some((cm) => cm.id === assetId)) {
        await handleSaveRate('commodity', assetId, numericRate);
      }
    }
  };

  return {
    currentSession,
    goldQuotes,
    currencyQuotes,
    commodityQuotes,
    intelligenceReports,
    inflationBasket,
    digest,
    bankRates,
    trustedGoldShops,
    dataSources,
    pipelineMeta,
    feedStatus,
    configuredFeedUrl,
    isUpdatingFeedConfig,
    feedConfigError,
    configuredTelegramChannels,
    isUpdatingTelegramConfig,
    telegramConfigError,
    isSyncing,
    isStreetFxSyncing,
    isSearchGrounding,
    searchGroundingError,
    isSyncingShops,
    shopSyncError,
    isAiGenerating,
    aiError,
    quotaStatus,
    searchThrottleDelayMs,
    setSearchThrottleDelayMs,
    queuedRequestsCount,
    fetchMarketData,
    handleConfigureFeedUrl,
    handleConfigureTelegramChannels,
    handleActivateFallbackPreview,
    handleSessionToggle,
    handleSyncTrustedShops,
    handleRunStreetFxSync,
    handleRunSearchGrounding,
    handleTriggerAiDigest,
    handleSaveRate,
    handleImportRatesFromSheet,
  };
}
