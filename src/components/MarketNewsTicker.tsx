import React, { useState, useEffect, useCallback } from 'react';
import {
  Newspaper,
  Pause,
  Play,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
} from 'lucide-react';
import { MarketNewsHeadline, MarketNewsResponse } from '../types';
import { getFirebaseIdToken } from '../firebase';

interface MarketNewsTickerProps {
  onSelectCategory: (tab: string) => void;
  isSignedIn?: boolean;
  onRequireSignIn?: () => void;
}

const CATEGORY_LABELS: Record<MarketNewsHeadline['category'], { mm: string; accentClass: string }> = {
  gold: {
    mm: 'ရွှေဈေး',
    accentClass: 'text-amber-700 dark:text-amber-400',
  },
  forex: {
    mm: 'ငွေလဲနှုန်း',
    accentClass: 'text-blue-700 dark:text-blue-400',
  },
  commodities: {
    mm: 'ကုန်ဈေးနှုန်း',
    accentClass: 'text-emerald-700 dark:text-emerald-400',
  },
  macro: {
    mm: 'စီးပွားရေး',
    accentClass: 'text-slate-700 dark:text-slate-300',
  },
};

const IMPACT_SYMBOL: Record<MarketNewsHeadline['impact'], { symbol: string; toneClass: string }> = {
  up: { symbol: '▲', toneClass: 'text-emerald-700 dark:text-emerald-400' },
  down: { symbol: '▼', toneClass: 'text-rose-700 dark:text-rose-400' },
  policy: { symbol: '§', toneClass: 'text-amber-700 dark:text-amber-400' },
  neutral: { symbol: '·', toneClass: 'text-slate-500 dark:text-slate-400' },
};

export const MarketNewsTicker: React.FC<MarketNewsTickerProps> = ({
  onSelectCategory,
  isSignedIn = false,
  onRequireSignIn,
}) => {
  const [newsData, setNewsData] = useState<MarketNewsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [selectedHeadline, setSelectedHeadline] = useState<MarketNewsHeadline | null>(null);
  const [isSourcesOpen, setIsSourcesOpen] = useState<boolean>(false);

  const loadHeadlines = useCallback(
    async (forceRefresh = false) => {
      if (forceRefresh && !isSignedIn) {
        if (onRequireSignIn) {
          onRequireSignIn();
        }
        return;
      }

      if (forceRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setErrorMsg(null);

      try {
        const headers: Record<string, string> = {};
        if (forceRefresh) {
          const idToken = await getFirebaseIdToken();
          if (idToken) {
            headers.Authorization = `Bearer ${idToken}`;
          }
        }

        const res = await fetch(forceRefresh ? '/api/news?refresh=1' : '/api/news', {
          headers,
        });
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new Error(`Unexpected response (${res.status})`);
        }
        const data = (await res.json()) as MarketNewsResponse & { error?: string };
        if (!res.ok) {
          throw new Error(data?.error || 'Failed to load economic news headlines');
        }
        setNewsData(data);
        setSelectedHeadline((prev) => {
          if (!prev) return data.headlines[0] || null;
          return data.headlines.find((h) => h.id === prev.id) || data.headlines[0] || null;
        });
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Unable to fetch market headlines');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [isSignedIn, onRequireSignIn]
  );

  useEffect(() => {
    void loadHeadlines(false);
  }, [loadHeadlines]);

  const headlines = newsData?.headlines || [];
  const groundingSources = newsData?.groundingSources || [];

  const handleHeadlineClick = (item: MarketNewsHeadline) => {
    setSelectedHeadline(item);
    setIsSourcesOpen(true);
  };

  const renderNewsTrack = (copyPrefix: string) =>
    headlines.map((item) => {
      const catMeta = CATEGORY_LABELS[item.category] || CATEGORY_LABELS.macro;
      const impactMeta = IMPACT_SYMBOL[item.impact] || IMPACT_SYMBOL.neutral;
      const isSelected = selectedHeadline?.id === item.id && isSourcesOpen;

      return (
        <button
          key={`${copyPrefix}-${item.id}`}
          type="button"
          onClick={() => handleHeadlineClick(item)}
          className={`group inline-flex items-center gap-2 px-3 py-1 rounded-md transition-colors duration-150 text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 shrink-0 whitespace-nowrap ${
            isSelected
              ? 'bg-slate-200/80 dark:bg-slate-800'
              : 'hover:bg-slate-200/60 dark:hover:bg-slate-800/70'
          }`}
        >
          <span className={`text-xs font-semibold ${impactMeta.toneClass}`} aria-hidden="true">
            {impactMeta.symbol}
          </span>
          <span className={`text-xs font-semibold mm-text ${catMeta.accentClass}`}>
            {catMeta.mm}
          </span>
          <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
            /
          </span>
          <span className="text-[13px] font-medium text-slate-900 dark:text-slate-100 group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors mm-text">
            {item.headlineMm}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400 en-sub">
            · {item.source} · {item.publishedLabel}
          </span>
          <span aria-hidden="true" className="text-slate-300 dark:text-slate-700 pl-1.5">
            |
          </span>
        </button>
      );
    });

  return (
    <section
      aria-label="Myanmar economic news headlines"
      className="border-b border-[#1C1C1C]/12 dark:border-stone-800 bg-[#F4F2EE] dark:bg-[#141514] text-[#1C1C1C] dark:text-stone-100 transition-colors"
    >
      <div className="max-w-[1360px] w-full mx-auto px-4 sm:px-6 lg:px-10 min-h-10 py-1.5 flex items-center gap-3 text-xs">
        {/* Left Anchored Label & Marquee Toggle */}
        <div className="flex items-center gap-2 shrink-0 pr-3 border-r border-[#1C1C1C]/15 dark:border-stone-800">
          <Newspaper className="w-3.5 h-3.5 text-[#004225] dark:text-emerald-400 shrink-0" aria-hidden="true" />
          <span className="text-xs font-semibold text-[#1C1C1C] dark:text-stone-200 whitespace-nowrap mm-text">
            စီးပွားရေးသတင်း
          </span>
          <button
            type="button"
            onClick={() => setIsPaused((prev) => !prev)}
            disabled={isLoading || headlines.length === 0}
            className="p-1 rounded-md text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            title={isPaused ? 'သတင်းတန်း ဆက်လက်ရွေ့လျားရန်' : 'သတင်းတန်း ခေတ္တရပ်ရန်'}
            aria-label={isPaused ? 'Resume news ticker' : 'Pause news ticker'}
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Center Scrolling Wire / Loading / Error State */}
        <div className="flex-1 min-w-0 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center gap-3 py-1" aria-busy="true" aria-label="Loading economic news">
              <div className="h-3.5 w-48 rounded bg-slate-200 dark:bg-slate-800 animate-pulse shrink-0" />
              <div className="h-3.5 w-64 rounded bg-slate-200/80 dark:bg-slate-800/80 animate-pulse shrink-0 hidden sm:block" />
              <span className="text-xs text-slate-500 dark:text-slate-400 mm-text whitespace-nowrap">
                စီးပွားရေးသတင်းများ စုစည်းနေပါသည်...
              </span>
            </div>
          ) : errorMsg && headlines.length === 0 ? (
            <div className="flex items-center gap-3 text-xs text-rose-700 dark:text-rose-400">
              <span className="mm-text truncate">သတင်းအချက်အလက် ရယူ၍မရပါ ({errorMsg})</span>
              <button
                type="button"
                onClick={() => loadHeadlines(true)}
                className="font-semibold underline hover:no-underline whitespace-nowrap shrink-0 cursor-pointer"
              >
                ပြန်စမ်းမည်
              </button>
            </div>
          ) : headlines.length === 0 ? (
            <span className="text-xs text-slate-500 dark:text-slate-400 mm-text">
              လတ်တလော စီးပွားရေးသတင်း မရှိသေးပါ။
            </span>
          ) : (
            <div className="marquee-wrapper overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-16px),transparent)]">
              <div className={`animate-marquee items-center ${isPaused ? 'marquee-paused' : ''}`}>
                <div className="flex items-center">{renderNewsTrack('a')}</div>
                <div className="flex items-center" aria-hidden="true">
                  {renderNewsTrack('b')}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Controls: Sources Toggle & Refresh */}
        <div className="flex items-center gap-1.5 shrink-0 pl-2 border-l border-slate-200 dark:border-slate-800">
          {headlines.length > 0 && (
            <button
              type="button"
              onClick={() => setIsSourcesOpen((prev) => !prev)}
              aria-expanded={isSourcesOpen}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <span className="mm-text">
                ရင်းမြစ် ({groundingSources.length || headlines.length})
              </span>
              {isSourcesOpen ? (
                <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => loadHeadlines(true)}
            disabled={isRefreshing || isLoading}
            className="p-1.5 rounded-md text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            title="သတင်းခေါင်းစဉ်များ အသစ်ပြန်ရှာရန်"
            aria-label="Refresh economic news headlines"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Expandable Context & Grounding Sources Drawer */}
      {isSourcesOpen && headlines.length > 0 && (
        <div className="border-t border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/95">
          <div className="max-w-[1280px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-3 space-y-2.5">
            {selectedHeadline && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-200/70 dark:border-slate-800">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className={`font-semibold mm-text ${CATEGORY_LABELS[selectedHeadline.category].accentClass}`}>
                      {CATEGORY_LABELS[selectedHeadline.category].mm}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-medium text-slate-700 dark:text-slate-300 en-sub">
                      {selectedHeadline.source}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="num-tabular">{selectedHeadline.publishedLabel}</span>
                    {newsData?.lastUpdated && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="num-tabular">Updated {newsData.lastUpdated}</span>
                      </>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-slate-950 dark:text-white mm-text">
                    {selectedHeadline.headlineMm}
                  </p>
                  {selectedHeadline.headlineEn &&
                    selectedHeadline.headlineEn !== selectedHeadline.headlineMm && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 en-sub">
                        {selectedHeadline.headlineEn}
                      </p>
                    )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {selectedHeadline.relatedTab && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectCategory(selectedHeadline.relatedTab!);
                        setIsSourcesOpen(false);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <span className="mm-text">သက်ဆိုင်ရာဈေးကွက်ကြည့်ရန်</span>
                      <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  )}
                  {selectedHeadline.url && (
                    <a
                      href={selectedHeadline.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                    >
                      <span>Read Source</span>
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Grounding Attribution Links (Google Search Sources) */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
              <span className="font-semibold text-slate-600 dark:text-slate-400 mm-text shrink-0">
                {newsData?.sourceMode === 'rss_telegram'
                  ? 'RSS & Telegram Wire (Zero Search Quota):'
                  : newsData?.grounded
                  ? 'Google Search ရင်းမြစ်များ:'
                  : 'ရည်ညွှန်းသတင်းရင်းမြစ်များ:'}
              </span>
              {groundingSources.length > 0 ? (
                groundingSources.map((src, idx) => (
                  <a
                    key={`${src.uri}-${idx}`}
                    href={src.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400 hover:underline max-w-[260px] truncate en-sub"
                    title={src.title}
                  >
                    <span className="truncate">{src.title}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                  </a>
                ))
              ) : (
                <span className="text-slate-500 dark:text-slate-400 mm-text">
                  {newsData?.noteMm || 'စိစစ်ပြီးသား စီးပွားရေးသတင်းများ'}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
