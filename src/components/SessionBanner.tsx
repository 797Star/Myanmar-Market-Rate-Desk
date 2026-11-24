import React from 'react';
import { Clock, Calendar, RefreshCw, TrendingUp } from 'lucide-react';
import { MarketSession, GoldQuote, CurrencyQuote, CommodityQuote } from '../types';
import { formatGatheredTimeMm } from '../utils/posterGenerator';

interface SessionBannerProps {
  currentSession: MarketSession;
  onSessionChange: (session: MarketSession) => void;
  dateStr: string;
  lastSyncedAt?: string | null;
  sentiment: string;
  onTriggerAiDigest: () => void;
  isAiGenerating: boolean;
  goldQuotes?: GoldQuote[];
  currencyQuotes?: CurrencyQuote[];
  commodityQuotes?: CommodityQuote[];
}

export const SessionBanner: React.FC<SessionBannerProps> = ({
  currentSession,
  onSessionChange,
  dateStr,
  lastSyncedAt,
  sentiment,
}) => {
  const gatheredTimeLabel = formatGatheredTimeMm(lastSyncedAt);

  return (
    <section
      aria-label="Daily market overview and editorial hero"
      className="pb-6 border-b border-[#1C1C1C]/15 dark:border-stone-800 transition-colors"
    >
      {/* Editorial Kicker Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 editorial-label text-[#1C1C1C]/65 dark:text-stone-400">
          <span className="inline-flex items-center gap-1.5 text-[#004225] dark:text-emerald-400">
            <Calendar className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Daily Economic Brief — {dateStr}</span>
          </span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span>
              {currentSession === 'morning' ? 'Morning Session (09:30 AM)' : 'Evening Session (04:30 PM)'}
            </span>
          </span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1 num-tabular">
            <RefreshCw className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span>Sync: {gatheredTimeLabel}</span>
          </span>
        </div>

        {/* Mobile inline session toggle */}
        <div className="flex md:hidden items-center border border-[#1C1C1C] dark:border-stone-600 rounded-sm overflow-hidden">
          <button
            type="button"
            onClick={() => onSessionChange('morning')}
            className={`px-2.5 py-1 text-[11px] font-bold uppercase cursor-pointer ${
              currentSession === 'morning'
                ? 'bg-[#1C1C1C] text-white dark:bg-emerald-700'
                : 'text-[#1C1C1C]/75 dark:text-stone-300'
            }`}
          >
            Morning
          </button>
          <button
            type="button"
            onClick={() => onSessionChange('evening')}
            className={`px-2.5 py-1 text-[11px] font-bold uppercase cursor-pointer border-l border-[#1C1C1C]/30 dark:border-stone-600 ${
              currentSession === 'evening'
                ? 'bg-[#1C1C1C] text-white dark:bg-emerald-700'
                : 'text-[#1C1C1C]/75 dark:text-stone-300'
            }`}
          >
            Evening
          </button>
        </div>
      </div>

      {/* Main Editorial Serif Headline */}
      <h1 className="serif text-[41px] leading-[1.08] tracking-[-0.03em] font-bold text-[#1C1C1C] dark:text-[#F3F2EE] max-w-4xl text-balance">
        Market conditions remain {sentiment.toLowerCase()} as spreads widen across key sectors.
      </h1>

      <div className="mt-3 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
        <p className="text-[13px] w-[784px] max-w-full text-[#1C1C1C]/70 dark:text-stone-300 mm-text leading-relaxed">
          မြန်မာ့ဈေးကွက် နေ့စဉ် အနှစ်ချုပ် — တရားဝင် ရည်ညွှန်းနှုန်းများနှင့် ပြင်ပဈေးကွက် လက်တွေ့နှုန်းများကို နေ့စဉ် စုစည်းတင်ပြပေးပါသည်။
        </p>

        <div className="inline-flex items-center gap-1.5 editorial-label text-[#004225] dark:text-emerald-400 shrink-0">
          <TrendingUp className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Sentiment: {sentiment}</span>
        </div>
      </div>
    </section>
  );
};
