import React, { useState } from 'react';
import { ExternalLink, Fuel, Utensils, Wheat } from 'lucide-react';
import type { CommodityQuote } from '../types';

interface CommoditySectionProps {
  commodityQuotes: CommodityQuote[];
  onEditRate: (type: string, id: string, name: string, currentRate: number) => void;
}

export const CommoditySection: React.FC<CommoditySectionProps> = ({
  commodityQuotes,
  onEditRate,
}) => {
  const [filterCategory, setFilterCategory] = useState<'all' | 'rice' | 'oil' | 'fuel'>('all');

  const filtered = commodityQuotes.filter((item) =>
    filterCategory === 'all' ? true : item.category === filterCategory
  );

  return (
    <div className="space-y-6">
      {/* Header and Filter Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-[20px] sm:text-[22px] font-semibold text-slate-950 dark:text-white flex items-center gap-2 mm-heading">
            <Wheat className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0" />
            <span>အခြေခံစားသောက်ကုန်နှင့် စက်သုံးဆီဈေးကွက်</span>
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 mm-text">
            Staple Commodities &amp; Fuel · Google Search Grounded Street Retail &amp; PPRD / DOCA / MRF References
          </p>
        </div>

        {/* Category Filter Tabs */}
        <div className="inline-flex flex-wrap max-w-full bg-slate-200/70 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 self-start sm:self-auto">
          {[
            { id: 'all' as const, labelMm: 'အားလုံး', labelEn: 'All' },
            { id: 'rice' as const, labelMm: 'ဆန်', labelEn: 'Rice' },
            { id: 'oil' as const, labelMm: 'စားသုံးဆီ', labelEn: 'Edible Oil' },
            { id: 'fuel' as const, labelMm: 'စက်သုံးဆီ', labelEn: 'Fuel' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              title={tab.labelEn}
              onClick={() => setFilterCategory(tab.id)}
              className={`px-3 py-1.5 text-[13px] font-medium rounded-lg transition-all cursor-pointer active:scale-95 whitespace-nowrap shrink-0 mm-text ${
                filterCategory === tab.id
                  ? 'bg-white dark:bg-slate-900 text-slate-950 dark:text-white shadow-xs font-semibold'
                  : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
              }`}
            >
              {tab.labelMm}
            </button>
          ))}
        </div>
      </div>

      {/* Commodity Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((item) => {
          const spreadAmt = item.openMarketRate - item.officialRefRate;
          const spreadColor =
            item.spreadPercent >= 100
              ? 'text-rose-700 dark:text-rose-400'
              : item.spreadPercent >= 30
              ? 'text-orange-700 dark:text-orange-400'
              : 'text-emerald-700 dark:text-emerald-400';

          return (
            <div
              key={item.id}
              className="min-w-0 bg-white dark:bg-[#191A19] border border-[#1C1C1C]/15 dark:border-stone-800 hover:border-[#004225]/50 dark:hover:border-emerald-500/40 rounded-sm p-5 flex flex-col justify-between transition-colors"
            >
              <div className="min-w-0">
                {/* Header row */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {item.category === 'rice' && (
                      <div className="p-1.5 rounded-sm bg-amber-500/12 text-amber-700 dark:text-amber-400 shrink-0">
                        <Wheat className="w-4 h-4" />
                      </div>
                    )}
                    {item.category === 'oil' && (
                      <div className="p-1.5 rounded-sm bg-yellow-500/15 text-amber-700 dark:text-yellow-400 shrink-0">
                        <Utensils className="w-4 h-4" />
                      </div>
                    )}
                    {item.category === 'fuel' && (
                      <div className="p-1.5 rounded-sm bg-sky-500/12 text-sky-700 dark:text-sky-400 shrink-0">
                        <Fuel className="w-4 h-4" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <h3 className="text-[15px] font-bold text-[#1C1C1C] dark:text-[#F3F2EE] mm-text">
                        {item.nameMm}
                      </h3>
                      <div className="text-xs text-[#1C1C1C]/60 dark:text-stone-400 mm-text">
                        {item.spec}
                      </div>
                    </div>
                  </div>

                  <span className="text-xs num-tabular font-semibold text-[#1C1C1C]/75 dark:text-stone-300 bg-[#F9F8F6] dark:bg-stone-800 border border-[#1C1C1C]/12 dark:border-stone-700 px-2 py-0.5 rounded-sm shrink-0 mm-text">
                    {item.unitMm}
                  </span>
                </div>

                {/* Rates Highlight */}
                <div className="my-3 p-3.5 bg-[#F9F8F6] dark:bg-stone-900/90 rounded-sm border border-[#1C1C1C]/12 dark:border-stone-800">
                  <div className="editorial-label text-[#004225] dark:text-emerald-400 mm-text">
                    {item.sourceMarket.includes('Google Search')
                      ? 'Google Search / ပြင်ပဈေးကွက်'
                      : 'ပြင်ပဈေးကွက်'}
                  </div>
                  <div className="flex items-baseline justify-between gap-2 flex-wrap mt-1.5">
                    <span className="num-tabular text-[22px] font-bold text-[#1C1C1C] dark:text-white leading-tight">
                      {item.openMarketRate.toLocaleString()}
                      <span className="text-[0.6em] font-medium text-[#1C1C1C]/60 dark:text-stone-400 ml-1">
                        Ks
                      </span>
                    </span>
                    {item.deltaDirection === 'up' && (
                      <span className="text-xs num-tabular font-semibold text-[#15803d] dark:text-emerald-400">
                        ▲ +{item.delta.toLocaleString()} Ks
                      </span>
                    )}
                    {item.deltaDirection === 'down' && (
                      <span className="text-xs num-tabular font-semibold text-[#b91c1c] dark:text-rose-400">
                        ▼ -{item.delta.toLocaleString()} Ks
                      </span>
                    )}
                    {item.deltaDirection === 'unchanged' && (
                      <span className="text-xs text-[#1C1C1C]/60 dark:text-stone-400 num-tabular">
                        — 0% (ငြိမ်နေ)
                      </span>
                    )}
                  </div>

                  <div className="pt-2 mt-2.5 border-t border-slate-200/70 dark:border-slate-700/60 flex items-baseline justify-between gap-2 flex-wrap text-[13px]">
                    <span className="text-slate-600 dark:text-slate-400 mm-text">
                      တရားဝင် ရည်ညွှန်းနှုန်း:
                    </span>
                    <span className="num-tabular font-semibold text-slate-900 dark:text-slate-200 text-right ml-auto">
                      {item.officialRefRate.toLocaleString()}{' '}
                      <span className="text-[0.75em] text-slate-500">Ks</span>
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between gap-2 flex-wrap text-[13px] mt-1">
                    <span className="text-slate-600 dark:text-slate-400 mm-text">
                      ကွာဟချက် (Spread):
                    </span>
                    <span className={`num-tabular font-bold text-right ml-auto ${spreadColor}`}>
                      {spreadAmt >= 0 ? '+' : ''}
                      {spreadAmt.toLocaleString()} Ks ({item.spreadPercent >= 0 ? '+' : ''}
                      {item.spreadPercent.toFixed(1)}%)
                    </span>
                  </div>
                </div>

                {/* Regional and session note */}
                <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap mm-text">
                    <span className="font-semibold text-slate-800 dark:text-slate-300">ဒေသ:</span>
                    <span>{item.region}</span>
                  </div>
                  {item.noteMm && (
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/30 text-slate-700 dark:text-slate-400 mm-text">
                      {item.noteMm}
                    </div>
                  )}
                </div>
              </div>

              {/* Source attribution and edit button */}
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0 flex-1 flex items-center gap-2">
                  <span
                    className="text-xs text-slate-600 dark:text-slate-400 truncate mm-text"
                    title={`${item.sourceMarket} · ${item.sourceOfficial}`}
                  >
                    {item.sourceMarket || item.sourceOfficial}
                  </span>
                  {item.groundingUrl && (
                    <a
                      href={item.groundingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-[11px] font-medium text-[#004225] dark:text-emerald-400 hover:underline shrink-0"
                    >
                      <span>Source</span>
                      <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    </a>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onEditRate('commodity', item.id, item.nameMm, item.openMarketRate)}
                  className="text-xs font-semibold text-blue-700 dark:text-amber-400 hover:underline cursor-pointer shrink-0 mm-text"
                >
                  ဈေးပြင်ဆင်ရန်
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
