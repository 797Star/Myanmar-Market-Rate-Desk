import React, { useState } from 'react';
import { Sparkles, AlertTriangle, RefreshCw, CloudUpload, LogIn, ShieldCheck } from 'lucide-react';
import type {
  AiQuotaStatus,
  DailyDigest,
  GoldQuote,
  CurrencyQuote,
  CommodityQuote,
} from '../types';
import type { StoredAiUsageLedger } from '../firebase';

interface AiDigestCardProps {
  digest: DailyDigest;
  onRefresh: () => void;
  isLoading: boolean;
  errorMsg?: string | null;
  isSignedIn?: boolean;
  isLoggingIn?: boolean;
  onGoogleLogin?: () => void;
  quotaStatus?: AiQuotaStatus | null;
  aiUsageToday?: StoredAiUsageLedger | null;
  onSaveToCloud?: () => Promise<void>;
  goldQuotes?: GoldQuote[];
  currencyQuotes?: CurrencyQuote[];
  commodityQuotes?: CommodityQuote[];
  variant?: 'sidebar' | 'full';
}

export const AiDigestCard: React.FC<AiDigestCardProps> = ({
  digest,
  onRefresh,
  isLoading,
  errorMsg,
  isSignedIn = false,
  isLoggingIn = false,
  onGoogleLogin,
  quotaStatus = null,
  aiUsageToday = null,
  onSaveToCloud,
  goldQuotes = [],
  currencyQuotes = [],
  commodityQuotes = [],
  variant = 'sidebar',
}) => {
  const [isSavingCloud, setIsSavingCloud] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const handleSaveCloud = async () => {
    if (!onSaveToCloud) return;
    setIsSavingCloud(true);
    try {
      await onSaveToCloud();
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 3000);
    } finally {
      setIsSavingCloud(false);
    }
  };

  const gold24k = goldQuotes.find((g) => g.id === 'gold-24k');
  const usd = currencyQuotes.find((c) => c.code === 'USD');
  const palmOil = commodityQuotes.find((cm) => cm.id === 'oil-palm');
  const fuel92 = commodityQuotes.find((cm) => cm.id === 'fuel-92');

  const hasLiveQuotes = Boolean(gold24k && usd && palmOil && fuel92);

  const digestLimit = quotaStatus?.digestLimit ?? 15;
  const digestUsed = quotaStatus?.digestUsed ?? aiUsageToday?.digestCalls ?? 0;
  const isQuotaError = Boolean(
    errorMsg && /quota|429|RESOURCE_EXHAUSTED|allowance|exhaust/i.test(errorMsg)
  );

  const bullets =
    digest.aiGenerated && digest.keyPointsMm.length > 0
      ? digest.keyPointsMm.slice(0, 4).map((pt, i) => ({
          title: `AI Insight 0${i + 1}`,
          text: pt,
        }))
      : hasLiveQuotes
      ? [
          {
            title: 'Gold Market',
            text: `ပြင်ပဈေးကွက် 16 ပဲရည်ရွှေ ${gold24k!.marketRate.toLocaleString()} Ks ရှိနေပြီး YGEA ရည်ညွှန်းနှုန်း ${gold24k!.officialRate.toLocaleString()} Ks နှင့် +${gold24k!.spreadPercent.toFixed(1)}% ကွာဟနေဆဲ။`,
          },
          {
            title: 'Currency & FX',
            text: `ပြင်ပဒေါ်လာဈေး ${usd!.marketSellRate.toLocaleString()} Ks ဝန်းကျင်ရှိနေပြီး Bank Online Trading နှုန်းမှာ ${usd!.onlineTradingRate.toLocaleString()} Ks ရှိသည်။`,
          },
          {
            title: 'Commodities & Fuel',
            text: `စားအုန်းဆီ ပြင်ပဈေး ${palmOil!.openMarketRate.toLocaleString()} Ks (+${palmOil!.spreadPercent.toFixed(1)}%) နှင့် Octane 92 ${fuel92!.openMarketRate.toLocaleString()} Ks/L ရှိနေသည်။`,
          },
        ]
      : digest.keyPointsMm.slice(0, 3).map((pt, i) => ({
          title: `Key Insight 0${i + 1}`,
          text: pt,
        }));

  // Variation 5 Signature Dark Ink Sidebar Briefing Box
  if (variant === 'sidebar') {
    return (
      <section
        aria-label="Executive Market Briefing"
        className="bg-[#1C1C1C] dark:bg-[#191A19] dark:border dark:border-stone-800 text-[#F9F8F6] rounded-sm p-6 sm:p-7 transition-colors"
      >
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="editorial-label text-white/45">
            Executive Briefing · {digest.session === 'morning' ? 'Morning' : 'Evening'}
          </div>
          {isSignedIn && (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-mono tabular-nums text-emerald-300/90"
              title="Server-enforced daily AI briefing allowance & 15-minute caching"
            >
              <ShieldCheck className="w-3 h-3 shrink-0" aria-hidden="true" />
              <span>
                AI {digestUsed}/{digestLimit}
              </span>
            </span>
          )}
        </div>

        <h3 className="text-base font-bold text-white mm-heading mb-4">
          ယနေ့ {digest.session === 'morning' ? 'မနက်ပိုင်း' : 'ညနေပိုင်း'} ဈေးကွက်သုံးသပ်ချက်
        </h3>

        {digest.aiGenerated && digest.headlineMm && (
          <p className="mb-4 text-xs sm:text-[13px] font-semibold text-amber-200/95 mm-text leading-relaxed">
            {digest.headlineMm}
          </p>
        )}

        {errorMsg && (
          <div className="mb-4 p-2.5 bg-rose-950/60 border border-rose-500/40 text-xs text-rose-200 space-y-1.5 rounded-sm">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
            {isQuotaError && (
              <p className="text-[11px] text-rose-200/80 pl-5">
                To use your own AI Studio quota without exhausting shared tokens, configure{' '}
                <code className="font-mono">GEMINI_API_KEY</code> in AI Studio{' '}
                <strong>Settings &gt; Secrets</strong>.
              </p>
            )}
          </div>
        )}

        <ul className={`space-y-4 transition-opacity ${isLoading ? 'opacity-50' : 'opacity-100'}`}>
          {bullets.map((b) => (
            <li
              key={b.title}
              className="text-xs sm:text-[13px] leading-relaxed text-white/75 border-l-2 border-white/25 pl-3.5"
            >
              <strong className="text-white font-semibold block mb-0.5 en-sub">{b.title}</strong>
              <span className="mm-text">{b.text}</span>
            </li>
          ))}
        </ul>

        <div className="mt-5 pt-4 border-t border-white/15 flex flex-col gap-2">
          {!isSignedIn && onGoogleLogin ? (
            <button
              type="button"
              onClick={onGoogleLogin}
              disabled={isLoggingIn}
              className="w-full py-2.5 px-4 editorial-label border border-emerald-400/50 bg-[#004225] hover:bg-[#005832] text-white transition-colors cursor-pointer inline-flex items-center justify-center gap-2 disabled:opacity-60 rounded-sm"
            >
              <LogIn className="w-3.5 h-3.5 text-emerald-300" aria-hidden="true" />
              <span>{isLoggingIn ? 'Signing in...' : 'Sign in with Google to Run AI'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              className="w-full py-2.5 px-4 editorial-label border border-white/25 hover:bg-[#004225] hover:border-[#004225] text-white transition-colors cursor-pointer inline-flex items-center justify-center gap-2 disabled:opacity-60 rounded-sm"
            >
              {isLoading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-amber-300" aria-hidden="true" />
              )}
              <span>{isLoading ? 'Synthesizing...' : 'Ask AI Intelligence'}</span>
            </button>
          )}

          {isSignedIn && onSaveToCloud && (
            <button
              type="button"
              onClick={handleSaveCloud}
              disabled={isSavingCloud}
              className="w-full py-2 px-3 text-[11px] font-semibold text-white/80 hover:text-white border border-white/15 hover:border-white/35 transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5 rounded-sm mm-text"
            >
              <CloudUpload className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                {savedNotice
                  ? 'Cloud တွင် သိမ်းပြီး'
                  : isSavingCloud
                  ? 'သိမ်းဆည်းနေ...'
                  : 'Cloud တွင် သိမ်းမည်'}
              </span>
            </button>
          )}
        </div>

        <div className="mt-3 text-[11px] font-mono text-white/45 flex items-center justify-between">
          <span>Updated {digest.lastGeneratedTime}</span>
          <span>
            {quotaStatus?.cachedServed
              ? 'AI Cached (15m)'
              : digest.aiGenerated
              ? 'AI Grounded'
              : 'Live Sync'}
          </span>
        </div>
      </section>
    );
  }

  return null;
};
