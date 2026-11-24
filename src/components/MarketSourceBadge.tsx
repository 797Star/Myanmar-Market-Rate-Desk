import React, { useEffect, useState } from 'react';
import {
  Database,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Settings2,
  RotateCcw,
  Search,
  ExternalLink,
  LogIn,
  ShieldCheck,
  Scale,
  Send,
} from 'lucide-react';
import type {
  AiQuotaStatus,
  MarketFeedStatus,
  MarketGroundingSummary,
  PipelineMeta,
} from '../types';
import type { StoredAiUsageLedger } from '../firebase';
import { formatExactYangonTimestamp } from '../utils/quoteHelpers';

interface MarketSourceBadgeProps {
  feedStatus: MarketFeedStatus;
  configuredFeedUrl: string;
  configuredTelegramChannels?: string[];
  pipelineMeta?: PipelineMeta | null;
  isSyncing: boolean;
  isUpdatingFeedConfig: boolean;
  feedConfigError: string | null;
  isUpdatingTelegramConfig?: boolean;
  telegramConfigError?: string | null;
  searchGrounding?: MarketGroundingSummary | null;
  isSearchGrounding?: boolean;
  searchGroundingError?: string | null;
  isSignedIn?: boolean;
  isLoggingIn?: boolean;
  onGoogleLogin?: () => void;
  quotaStatus?: AiQuotaStatus | null;
  aiUsageToday?: StoredAiUsageLedger | null;
  searchThrottleDelayMs?: number;
  onChangeSearchThrottleDelayMs?: (delayMs: number) => void;
  queuedRequestsCount?: number;
  onRunSearchGrounding?: () => void;
  onConfigureFeedUrl: (feedUrl: string) => Promise<boolean>;
  onConfigureTelegramChannels?: (channels: string[]) => Promise<boolean>;
  onRefreshLive: () => void;
  onSimulateFallback: () => void;
}

export const MarketSourceBadge: React.FC<MarketSourceBadgeProps> = ({
  feedStatus,
  configuredFeedUrl,
  configuredTelegramChannels = [],
  pipelineMeta = null,
  isSyncing,
  isUpdatingFeedConfig,
  feedConfigError,
  isUpdatingTelegramConfig = false,
  telegramConfigError = null,
  searchGrounding,
  isSearchGrounding = false,
  searchGroundingError = null,
  isSignedIn = false,
  isLoggingIn = false,
  onGoogleLogin,
  quotaStatus = null,
  aiUsageToday = null,
  searchThrottleDelayMs = 2000,
  onChangeSearchThrottleDelayMs,
  queuedRequestsCount = 0,
  onRunSearchGrounding,
  onConfigureFeedUrl,
  onConfigureTelegramChannels,
  onRefreshLive,
  onSimulateFallback,
}) => {
  const [showFeedConfig, setShowFeedConfig] = useState<boolean>(false);
  const [draftUrl, setDraftUrl] = useState<string>(configuredFeedUrl);
  const [draftTelegramInput, setDraftTelegramInput] = useState<string>(
    configuredTelegramChannels.join(', ')
  );

  const searchLimit = quotaStatus?.searchLimit ?? 20;
  const searchUsed = quotaStatus?.searchUsed ?? aiUsageToday?.searchCalls ?? 0;

  useEffect(() => {
    setDraftUrl(configuredFeedUrl);
  }, [configuredFeedUrl]);

  useEffect(() => {
    setDraftTelegramInput(configuredTelegramChannels.join(', '));
  }, [configuredTelegramChannels]);

  const exactTimestamp = formatExactYangonTimestamp(feedStatus.lastSuccessfulUpdate);

  const modeLabel =
    feedStatus.mode === 'direct_telegram'
      ? 'Direct APIs + Telegram'
      : feedStatus.mode === 'google_search'
      ? 'Google Search Grounding'
      : feedStatus.mode === 'google_sheet_json'
      ? 'Google Sheet JSON'
      : feedStatus.mode === 'rest_api'
      ? 'REST API'
      : 'Fallback Baseline';

  const handleSubmitRest = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await onConfigureFeedUrl(draftUrl.trim());
    if (ok) {
      setShowFeedConfig(false);
    }
  };

  const handleResetDefault = async () => {
    setDraftUrl('');
    const ok = await onConfigureFeedUrl('');
    if (ok) {
      setShowFeedConfig(false);
    }
  };

  const handleSubmitTelegramChannels = async () => {
    if (!onConfigureTelegramChannels) return;
    const list = draftTelegramInput
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    await onConfigureTelegramChannels(list);
  };

  const validation = pipelineMeta?.validation;
  const parityBadgeTone =
    validation?.parityStatus === 'aligned'
      ? 'text-[#004225] dark:text-emerald-400'
      : validation?.parityStatus === 'premium'
      ? 'text-amber-700 dark:text-amber-400'
      : validation?.parityStatus === 'flagged'
      ? 'text-[#b91c1c] dark:text-rose-400'
      : 'text-[#1C1C1C]/65 dark:text-stone-400';

  return (
    <div className="bg-white dark:bg-[#191A19] border border-[#1C1C1C]/15 dark:border-stone-800 rounded-sm px-4 py-3 transition-colors">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Market Source Badge + Exact Last Successful Update Timestamp */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 min-w-0">
          <div
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-sm border text-xs font-semibold ${
              feedStatus.isFallback
                ? 'bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30'
                : 'bg-[#004225]/5 text-[#004225] border-[#004225]/25 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30'
            }`}
          >
            {feedStatus.isFallback ? (
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            )}
            <span>{feedStatus.sourceBadgeLabel}</span>
            <span aria-hidden="true" className="opacity-45">
              ·
            </span>
            <span className="font-mono">{modeLabel}</span>
          </div>

          <div className="text-xs text-[#1C1C1C]/65 dark:text-stone-400 flex flex-wrap items-center gap-x-1.5">
            <span className="editorial-label">Last Sync:</span>
            <strong className="font-mono tabular-nums text-[#1C1C1C] dark:text-[#F3F2EE]">
              {exactTimestamp}
            </strong>
            {queuedRequestsCount > 1 && (
              <span className="text-[11px] font-mono tabular-nums text-[#004225] dark:text-emerald-400">
                · Queue ({queuedRequestsCount})
              </span>
            )}
          </div>
        </div>

        {/* Feed Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {isSignedIn && (
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm border border-[#004225]/20 dark:border-emerald-500/30 bg-[#004225]/5 dark:bg-emerald-500/10 text-[11px] font-mono tabular-nums text-[#004225] dark:text-emerald-300"
              title="Daily Google Search grounding allowance for your signed-in account"
            >
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>
                Search {searchUsed}/{searchLimit}
              </span>
            </span>
          )}

          {onRunSearchGrounding &&
            (!isSignedIn && onGoogleLogin ? (
              <button
                type="button"
                onClick={onGoogleLogin}
                disabled={isLoggingIn}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-semibold bg-[#004225] text-white hover:bg-[#00311b] dark:bg-emerald-700 dark:hover:bg-emerald-600 transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
                title="Sign in with Google to run live Google Search grounding and track daily quota"
              >
                <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{isLoggingIn ? 'Signing in...' : 'Sign in to Search Live'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onRunSearchGrounding}
                disabled={isSearchGrounding || isSyncing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-semibold bg-[#004225] text-white hover:bg-[#00311b] dark:bg-emerald-700 dark:hover:bg-emerald-600 transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
              >
                <Search
                  className={`w-3.5 h-3.5 ${isSearchGrounding ? 'animate-pulse' : ''}`}
                  aria-hidden="true"
                />
                <span>
                  {isSearchGrounding
                    ? 'Searching On-Ground Rates...'
                    : 'Google Search Fallback'}
                </span>
              </button>
            ))}

          {feedStatus.isFallback && (
            <button
              type="button"
              onClick={onRefreshLive}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-semibold bg-[#1C1C1C] text-white hover:bg-[#004225] dark:bg-emerald-700 dark:hover:bg-emerald-600 transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>Retry Live Sync</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowFeedConfig((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              showFeedConfig
                ? 'bg-[#1C1C1C] text-white border-[#1C1C1C] dark:bg-stone-200 dark:text-[#1C1C1C]'
                : 'text-[#1C1C1C] dark:text-stone-200 bg-[#F9F8F6] hover:bg-[#EFECE6] dark:bg-stone-900 dark:hover:bg-stone-800 border-[#1C1C1C]/20 dark:border-stone-700'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{showFeedConfig ? 'Hide Feed Config' : 'Feed & Telegram Config'}</span>
          </button>
        </div>
      </div>

      {/* Multi-Source Validation, XAU Parity & Search Quota Telemetry Strip */}
      {(validation || pipelineMeta?.quotaSavedNote) && (
        <div className="mt-2.5 pt-2.5 border-t border-[#1C1C1C]/10 dark:border-stone-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[#1C1C1C]/75 dark:text-stone-300 font-mono tabular-nums text-[11px]">
            {validation && (
              <>
                <span className="inline-flex items-center gap-1.5 font-sans font-semibold text-[#1C1C1C] dark:text-stone-200">
                  <Scale className="w-3.5 h-3.5 text-[#004225] dark:text-emerald-400" aria-hidden="true" />
                  <span>Consensus Validation:</span>
                </span>
                <span>{validation.verifiedAssetsCount} assets median-checked</span>
                {validation.impliedXauParityMmk && (
                  <span className={parityBadgeTone}>
                    · XAU Parity ~{validation.impliedXauParityMmk.toLocaleString()} Ks (
                    {validation.parityStatus === 'unavailable'
                      ? 'XAU Benchmark'
                      : validation.parityStatus.toUpperCase()}
                    {validation.gold24kParityDeviationPct !== null &&
                      ` ${validation.gold24kParityDeviationPct >= 0 ? '+' : ''}${validation.gold24kParityDeviationPct}%`}
                    )
                  </span>
                )}
                {validation.rejectedOutliers.length > 0 && (
                  <span
                    className="text-amber-700 dark:text-amber-400 underline decoration-dotted cursor-help"
                    title={validation.rejectedOutliers
                      .map((o) => `${o.assetKey}: rejected ${o.rejectedValue.toLocaleString()} (${o.reason})`)
                      .join(' | ')}
                  >
                    · {validation.rejectedOutliers.length} outlier(s) quarantined
                  </span>
                )}
              </>
            )}
          </div>

          {pipelineMeta?.quotaSavedNote && (
            <span className="text-[11px] font-medium text-[#004225] dark:text-emerald-400">
              {pipelineMeta.quotaSavedNote}
            </span>
          )}
        </div>
      )}

      {/* Google Search Grounding Attribution & Verification Links */}
      {(searchGrounding || searchGroundingError) && (
        <div className="mt-2.5 pt-2.5 border-t border-[#1C1C1C]/10 dark:border-stone-800 space-y-1.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[#1C1C1C]/75 dark:text-stone-300">
              <span className="inline-flex items-center gap-1.5 font-semibold text-[#004225] dark:text-emerald-400">
                <Search className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Google Search Grounding (On-Ground Buy &amp; Sell):</span>
              </span>
              {searchGrounding?.grounded ? (
                <span className="font-mono tabular-nums text-[#1C1C1C] dark:text-stone-200">
                  {searchGrounding.updatedAssetsCount} rates verified ·{' '}
                  {formatExactYangonTimestamp(searchGrounding.lastSearchedAt)}
                </span>
              ) : (
                <span className="text-amber-800 dark:text-amber-300">
                  {searchGroundingError || searchGrounding?.error || 'Live web search standby'}
                </span>
              )}
            </div>

            {searchGrounding?.searchQueries && searchGrounding.searchQueries.length > 0 && (
              <span className="text-[11px] font-mono text-[#1C1C1C]/55 dark:text-stone-400 truncate max-w-md">
                Query: {searchGrounding.searchQueries[0]}
              </span>
            )}
          </div>

          {searchGrounding?.onGroundSummaryMm && (
            <p className="text-xs text-[#1C1C1C]/75 dark:text-stone-300 mm-text leading-relaxed">
              {searchGrounding.onGroundSummaryMm}
            </p>
          )}

          {(searchGroundingError || (searchGrounding?.error && searchGrounding.grounded)) && (
            <div className="text-[11px] text-amber-800 dark:text-amber-300 space-y-0.5">
              <div>{searchGroundingError || searchGrounding?.error}</div>
              {/quota|429|RESOURCE_EXHAUSTED|allowance|exhaust/i.test(
                searchGroundingError || searchGrounding?.error || ''
              ) && (
                <div className="text-[#1C1C1C]/70 dark:text-stone-400">
                  Tip: Configure your own <code className="font-mono">GEMINI_API_KEY</code> via AI
                  Studio <strong>Settings &gt; Secrets</strong> to avoid shared token exhaustion.
                </div>
              )}
            </div>
          )}

          {searchGrounding?.sources && searchGrounding.sources.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
              <span className="editorial-label text-[#1C1C1C]/55 dark:text-stone-400">
                Search Sources:
              </span>
              {searchGrounding.sources.slice(0, 6).map((src, idx) => (
                <a
                  key={`${src.uri}_${idx}`}
                  href={src.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[#004225] dark:text-emerald-400 hover:underline max-w-[220px] truncate"
                  title={src.title}
                >
                  <span className="truncate">{src.title}</span>
                  <ExternalLink className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Explicit Fallback Notice when Google Search quota/API is temporarily unavailable */}
      {feedStatus.isFallback && feedStatus.fallbackReason && (
        <div className="mt-2.5 pt-2.5 border-t border-amber-300/70 dark:border-amber-500/20 text-xs text-amber-900 dark:text-amber-300 flex items-center gap-2">
          <Database className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{feedStatus.fallbackReason}</span>
        </div>
      )}

      {/* Feed, Telegram Channels & Throttle Configurator */}
      {showFeedConfig && (
        <div className="mt-3 pt-3 border-t border-[#1C1C1C]/15 dark:border-stone-800 space-y-3">
          <form onSubmit={handleSubmitRest} className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <label
                htmlFor="custom-feed-url-input"
                className="font-semibold text-[#1C1C1C] dark:text-white"
              >
                Optional Custom REST API or Google Sheet JSON Override
              </label>
              <span className="text-[11px] font-mono text-[#1C1C1C]/60 dark:text-stone-400 truncate max-w-full">
                Active: {feedStatus.endpointUrl}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                id="custom-feed-url-input"
                type="url"
                value={draftUrl}
                onChange={(e) => setDraftUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/.../gviz/tq?tqx=out:json or REST JSON URL"
                className="flex-1 px-3 py-2 text-xs font-mono bg-[#F9F8F6] dark:bg-stone-900 border border-[#1C1C1C]/20 dark:border-stone-700 rounded-sm text-[#1C1C1C] dark:text-white focus:outline-none focus:border-[#004225] dark:focus:border-emerald-500"
              />
              <button
                type="submit"
                disabled={isUpdatingFeedConfig}
                className="px-3.5 py-2 rounded-sm text-xs font-bold bg-[#1C1C1C] text-white hover:bg-[#004225] dark:bg-emerald-700 dark:hover:bg-emerald-600 transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-60"
              >
                {isUpdatingFeedConfig ? 'Syncing...' : 'Save & Sync Feed'}
              </button>
              {configuredFeedUrl && (
                <button
                  type="button"
                  onClick={handleResetDefault}
                  disabled={isUpdatingFeedConfig}
                  className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-sm text-xs font-semibold bg-[#F9F8F6] hover:bg-[#EFECE6] dark:bg-stone-900 dark:hover:bg-stone-800 border border-[#1C1C1C]/20 dark:border-stone-700 text-[#1C1C1C] dark:text-stone-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Reset Feed</span>
                </button>
              )}
              <button
                type="button"
                onClick={onSimulateFallback}
                className="px-3 py-2 rounded-sm text-xs font-medium bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-500/10 dark:hover:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Test Fallback State
              </button>
            </div>

            {feedConfigError && (
              <div className="text-xs text-[#b91c1c] dark:text-rose-400 font-medium">
                {feedConfigError}
              </div>
            )}
          </form>

          {/* Public Telegram Market Desk Slugs (Zero Search Quota) */}
          {onConfigureTelegramChannels && (
            <div className="pt-2.5 border-t border-[#1C1C1C]/10 dark:border-stone-800 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <label
                  htmlFor="telegram-channels-input"
                  className="font-semibold text-[#1C1C1C] dark:text-white inline-flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5 text-[#004225] dark:text-emerald-400" aria-hidden="true" />
                  <span>Public Telegram Desk Channels (Zero-Quota Scrape via t.me/s)</span>
                </label>
                <span className="text-[11px] font-mono text-[#1C1C1C]/55 dark:text-stone-400">
                  Comma-separated @channel slugs
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  id="telegram-channels-input"
                  type="text"
                  value={draftTelegramInput}
                  onChange={(e) => setDraftTelegramInput(e.target.value)}
                  placeholder="myanmargoldprice, mmkexchange, shwebonthagold"
                  className="flex-1 px-3 py-2 text-xs font-mono bg-[#F9F8F6] dark:bg-stone-900 border border-[#1C1C1C]/20 dark:border-stone-700 rounded-sm text-[#1C1C1C] dark:text-white focus:outline-none focus:border-[#004225] dark:focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={handleSubmitTelegramChannels}
                  disabled={isUpdatingTelegramConfig}
                  className="px-3.5 py-2 rounded-sm text-xs font-bold bg-[#004225] text-white hover:bg-[#00311b] dark:bg-emerald-700 dark:hover:bg-emerald-600 transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-60"
                >
                  {isUpdatingTelegramConfig ? 'Updating...' : 'Update Telegram Desks'}
                </button>
              </div>
              {telegramConfigError && (
                <div className="text-xs text-[#b91c1c] dark:text-rose-400 font-medium">
                  {telegramConfigError}
                </div>
              )}
            </div>
          )}

          {onChangeSearchThrottleDelayMs && (
            <div className="pt-2 border-t border-[#1C1C1C]/10 dark:border-stone-800 flex flex-wrap items-center justify-between gap-2 text-xs">
              <label
                htmlFor="search-throttle-delay-select"
                className="font-semibold text-[#1C1C1C]/80 dark:text-stone-300"
              >
                Google Search Queue Throttle Delay (spacing between consecutive calls)
              </label>
              <select
                id="search-throttle-delay-select"
                value={searchThrottleDelayMs}
                onChange={(e) => onChangeSearchThrottleDelayMs(Number(e.target.value))}
                className="px-2.5 py-1 text-xs font-mono bg-[#F9F8F6] dark:bg-stone-900 border border-[#1C1C1C]/20 dark:border-stone-700 rounded-sm text-[#1C1C1C] dark:text-white focus:outline-none focus:border-[#004225] dark:focus:border-emerald-500"
              >
                <option value={1000}>1.0s spacing</option>
                <option value={2000}>2.0s spacing (Default)</option>
                <option value={3500}>3.5s spacing</option>
                <option value={5000}>5.0s spacing</option>
                <option value={10000}>10.0s spacing</option>
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
