import React, { useState } from 'react';
import {
  Coins,
  ArrowUpRight,
  ArrowDownRight,
  Calculator,
  Globe,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, Tooltip, YAxis } from 'recharts';
import { GoldQuote, PipelineMeta, TrustedGoldShopQuote } from '../types';

interface GoldSectionProps {
  goldQuotes: GoldQuote[];
  trustedGoldShops?: TrustedGoldShopQuote[];
  pipelineMeta?: PipelineMeta | null;
  onSyncTrustedShops?: () => void;
  isSyncingShops?: boolean;
  shopSyncError?: string | null;
  onOpenCalculator: () => void;
  onEditRate: (type: string, id: string, name: string, currentRate: number) => void;
}

export const GoldSection: React.FC<GoldSectionProps> = ({
  goldQuotes,
  trustedGoldShops = [],
  pipelineMeta,
  onSyncTrustedShops,
  isSyncingShops = false,
  shopSyncError = null,
  onOpenCalculator,
  onEditRate,
}) => {
  // Quick weight estimator
  const [weightKyat, setWeightKyat] = useState<number>(1);
  const [weightPe, setWeightPe] = useState<number>(0);
  const [weightYway, setWeightYway] = useState<number>(0);

  const gold24k = goldQuotes.find((g) => g.id === 'gold-24k');
  const worldGold = goldQuotes.find((g) => g.id === 'gold-world-spot');
  const marketRatePerKyat = gold24k?.marketRate || 10030000;
  const officialRatePerKyat = gold24k?.officialRate || 7100000;

  // Total weight in kyat-tha: kyat + pe/16 + yway/128
  const totalKyattha = weightKyat + weightPe / 16 + weightYway / 128;
  const estimatedMarketTotal = Math.round(totalKyattha * marketRatePerKyat);
  const estimatedOfficialTotal = Math.round(totalKyattha * officialRatePerKyat);
  const estimatedGrams = (totalKyattha * 16.3293).toFixed(2);

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-[20px] sm:text-[22px] font-semibold text-slate-950 dark:text-white flex items-center gap-2 mm-heading">
            <Coins className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0" />
            <span>မြန်မာ့ရွှေဈေးကွက်</span>
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 mm-text">
            Myanmar Gold Market · 16 ပဲရည်၊ 15 ပဲရည်နှင့် YGEA တရားဝင် ရည်ညွှန်းနှုန်းများ (7 ရက် လမ်းကြောင်းနှင့်အတူ)
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenCalculator}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold text-white bg-slate-950 hover:bg-slate-800 dark:bg-amber-500 dark:text-slate-950 dark:hover:bg-amber-400 rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer self-start sm:self-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 mm-text"
        >
          <Calculator className="w-4 h-4" />
          <span>ရွှေတွက်ချက်စက် အပြည့်အစုံ</span>
        </button>
      </div>

      {/* Gold Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {goldQuotes.map((item) => {
          const trendData = item.trend7d || [
            { day: 'Day 1', rate: item.marketRate * 0.98 },
            { day: 'Day 2', rate: item.marketRate * 0.985 },
            { day: 'Day 3', rate: item.marketRate * 0.99 },
            { day: 'Day 4', rate: item.marketRate * 0.988 },
            { day: 'Day 5', rate: item.marketRate * 0.995 },
            { day: 'Day 6', rate: item.morningRate },
            { day: 'ယနေ့', rate: item.marketRate },
          ];

          const isTrendUp = trendData[trendData.length - 1].rate >= trendData[0].rate;
          const trendColor = isTrendUp ? '#10b981' : '#e11d48';

          return (
            <div
              key={item.id}
              className="min-w-0 bg-white dark:bg-[#191A19] border border-[#1C1C1C]/15 dark:border-stone-800 hover:border-[#004225]/50 dark:hover:border-emerald-500/40 rounded-sm p-5 relative flex flex-col justify-between transition-colors"
            >
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-bold text-[#1C1C1C] dark:text-[#F3F2EE] mm-text">
                      {item.nameMm}
                    </h3>
                    <div className="text-xs text-[#1C1C1C]/60 dark:text-stone-400 en-sub">
                      {item.nameEn}
                    </div>
                  </div>
                  <span className="text-xs num-tabular font-semibold text-[#1C1C1C]/75 dark:text-stone-300 bg-[#F9F8F6] dark:bg-stone-800 border border-[#1C1C1C]/12 dark:border-stone-700 px-2 py-0.5 rounded-sm shrink-0">
                    {item.purity}
                  </span>
                </div>

                {/* Current Market Rate */}
                <div className="my-3">
                  <div className="editorial-label text-[#004225] dark:text-emerald-400 mm-text">
                    {item.id === 'gold-world-spot'
                      ? `Live Global Spot (${item.unitMm})`
                      : `ပြင်ပဈေးကွက် ရောင်းဈေး (${item.unitMm})`}
                  </div>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 mt-1">
                    <div className="flex flex-wrap items-baseline gap-x-1.5 text-[24px] font-bold num-tabular text-[#1C1C1C] dark:text-white leading-tight">
                      {item.id === 'gold-world-spot' ? (
                        <span>${item.marketRate.toLocaleString()}</span>
                      ) : (
                        <>
                          <span>{item.marketRate.toLocaleString()}</span>
                          <span className="text-[0.6em] font-medium text-[#1C1C1C]/60 dark:text-stone-400">Ks</span>
                        </>
                      )}
                    </div>
                    {typeof item.marketBuyRate === 'number' && item.marketBuyRate > 0 && (
                      <span className="text-xs font-mono tabular-nums text-[#1C1C1C]/75 dark:text-stone-300">
                        ဝယ် {item.marketBuyRate.toLocaleString()} Ks
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    {item.deltaDirection === 'up' && (
                      <span className="text-xs num-tabular font-semibold text-[#15803d] dark:text-emerald-400">
                        ▲ +{item.delta.toLocaleString()} Ks (+{item.deltaPercent}%)
                      </span>
                    )}
                    {item.deltaDirection === 'down' && (
                      <span className="text-xs num-tabular font-semibold text-[#b91c1c] dark:text-rose-400">
                        ▼ -{item.delta.toLocaleString()} Ks (-{item.deltaPercent}%)
                      </span>
                    )}
                    {item.deltaDirection === 'unchanged' && (
                      <span className="text-xs text-[#1C1C1C]/60 dark:text-stone-400 num-tabular">— 0% (ငြိမ်သက်နေ)</span>
                    )}
                  </div>
                </div>

                {/* Official Comparison */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-[13px] space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2 flex-wrap text-slate-600 dark:text-slate-400">
                    <span className="mm-text">တရားဝင် YGEA:</span>
                    <span className="num-tabular font-semibold text-slate-950 dark:text-slate-200 text-right ml-auto">
                      {item.officialRate.toLocaleString()} <span className="text-[0.75em] text-slate-500">Ks</span>
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2 flex-wrap text-slate-600 dark:text-slate-400">
                    <span className="mm-text">မနက် / ညနေ:</span>
                    <span className="num-tabular text-slate-800 dark:text-slate-300 text-right ml-auto">
                      {item.morningRate.toLocaleString()} / {item.eveningRate.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2 flex-wrap text-slate-600 dark:text-slate-400">
                    <span className="mm-text">ကွာဟချက် (Spread):</span>
                    <span
                      className={`num-tabular font-bold text-right ml-auto ${
                        item.spreadPercent >= 100
                          ? 'text-rose-700 dark:text-rose-400'
                          : item.spreadPercent >= 30
                          ? 'text-orange-700 dark:text-orange-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      +{item.spreadPercent.toFixed(1)}%
                    </span>
                  </div>
                </div>

                {/* 7-Day Mini Sparkline Chart */}
                <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                    <span className="mm-text">7 ရက် ဈေးနှုန်းလမ်းကြောင်း</span>
                    <span className="num-tabular text-xs font-medium text-slate-700 dark:text-slate-300">
                      {trendData[0].rate >= 1000 ? `${(trendData[0].rate / 100000).toFixed(1)}L` : trendData[0].rate} →{' '}
                      {trendData[trendData.length - 1].rate >= 1000
                        ? `${(trendData[trendData.length - 1].rate / 100000).toFixed(1)}L`
                        : trendData[trendData.length - 1].rate}
                    </span>
                  </div>
                  <div className="h-12 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trendData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                        <defs>
                          <linearGradient id={`sparkGrad-${item.id}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={trendColor} stopOpacity={0.35} />
                            <stop offset="100%" stopColor={trendColor} stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <YAxis domain={['auto', 'auto']} hide />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const d = payload[0].payload as { day: string; rate: number };
                              return (
                                <div className="bg-slate-900 text-white text-xs px-2.5 py-1.5 rounded-lg shadow-md border border-slate-700 num-tabular">
                                  <div className="text-slate-400">{d.day}</div>
                                  <div className="font-bold text-amber-400">
                                    {Number(d.rate).toLocaleString()} {item.id === 'gold-world-spot' ? 'USD' : 'Ks'}
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="rate"
                          stroke={trendColor}
                          strokeWidth={1.75}
                          fill={`url(#sparkGrad-${item.id})`}
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {item.noteMm && (
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-lg mm-text">
                    {item.noteMm}
                  </p>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1 flex items-center gap-2">
                  <span className="text-xs text-slate-600 dark:text-slate-400 truncate mm-text" title={item.sourceMarket}>
                    {item.sourceMarket}
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
                  onClick={() => onEditRate('gold', item.id, item.nameMm, item.marketRate)}
                  className="text-xs font-semibold text-blue-700 dark:text-amber-400 hover:underline cursor-pointer shrink-0 mm-text"
                >
                  ဈေးပြင်ဆင်ရန်
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Trusted Gold Shops Priority Feed (Purity & Buyer-Trust First) */}
      {trustedGoldShops.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-[0_2px_10px_rgba(0,0,0,0.03)] space-y-4">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="flex items-start gap-2.5">
              <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-bold text-slate-950 dark:text-white mm-heading">
                    ယုံကြည်စိတ်ချရသော နာမည်ကြီး ရွှေဆိုင်ကြီးများ၏ ပြင်ပဈေးကွက် ဦးစားပေးစာရင်း
                  </h3>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 en-sub">
                    Purity & Integrity First
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 mm-text">
                  {pipelineMeta?.trustedGoldVerificationNote ||
                    'ရွှေသန့်စင်မှု၊ အလေးချိန်တိကျမှုနှင့် ဝယ်ယူသူအများအပြား စိတ်ချလက်ခံထားသော နာမည်ကြီးရွှေဆိုင်ကြီးများ၏ ပြင်ပဈေးကွက်နှုန်းထားများကို Google Search Grounding ဖြင့် စုစည်းဖော်ပြထားပါသည်။'}
                </p>
              </div>
            </div>

            {onSyncTrustedShops && (
              <button
                type="button"
                onClick={onSyncTrustedShops}
                disabled={isSyncingShops}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 transition-all active:scale-95 disabled:opacity-60 cursor-pointer shrink-0 self-start mm-text"
              >
                {isSyncingShops ? (
                  <>
                    <span className="inline-flex items-end gap-0.5 h-3" aria-hidden="true">
                      <span className="w-0.5 h-2 bg-amber-600 rounded-full animate-ios-wave" />
                      <span className="w-0.5 h-3 bg-amber-600 rounded-full animate-ios-wave [animation-delay:150ms]" />
                      <span className="w-0.5 h-2 bg-amber-600 rounded-full animate-ios-wave [animation-delay:300ms]" />
                    </span>
                    <span>ဆိုင်ဈေးများ စစ်ဆေးနေသည်...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                    <span>ဆိုင်ဈေးများ Search စစ်ဆေးရန်</span>
                  </>
                )}
              </button>
            )}
          </div>

          {shopSyncError && (
            <div className="mb-3 px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-xs text-amber-900 dark:text-amber-300">
              {shopSyncError}
            </div>
          )}

          <div className="overflow-x-auto -mx-2 px-2">
            <table className="w-full min-w-[680px] text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200/80 dark:border-slate-800 text-[13px] font-semibold text-slate-700 dark:text-slate-300">
                  <th className="py-3 pr-3 mm-text">ဦးစားပေး</th>
                  <th className="py-3 pr-3 mm-text">ရွှေဆိုင်အမည်</th>
                  <th className="py-3 pr-3 hidden md:table-cell mm-text">စိတ်ချရမှု အကြောင်းရင်း</th>
                  <th className="py-3 pr-3 text-right mm-text">16 ပဲရည် (24K)</th>
                  <th className="py-3 pr-3 text-right hidden sm:table-cell mm-text">15 ပဲရည်</th>
                  <th className="py-3 text-right mm-text">အတည်ပြုချက်</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {trustedGoldShops.map((shop) => (
                  <tr
                    key={shop.id}
                    className={
                      shop.isPrioritySelected
                        ? 'bg-amber-50/60 dark:bg-amber-500/5'
                        : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors'
                    }
                  >
                    <td className="py-3 pr-3 whitespace-nowrap">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg num-tabular text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        #{shop.priorityRank}
                      </span>
                    </td>
                    <td className="py-3 pr-3">
                      <div className="font-bold text-sm text-slate-950 dark:text-white mm-text">{shop.shopNameMm}</div>
                      <div className="text-xs text-slate-600 dark:text-slate-400 en-sub">
                        {shop.shopNameEn} · {shop.city}
                      </div>
                    </td>
                    <td className="py-3 pr-3 hidden md:table-cell max-w-xs">
                      <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-0.5 en-sub">
                        {shop.trustTier}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mm-text">
                        {shop.trustReasonMm}
                      </p>
                    </td>
                    <td className="py-3 pr-3 text-right whitespace-nowrap">
                      <span className="num-tabular font-bold text-base text-slate-950 dark:text-white">
                        {shop.gold24kRate.toLocaleString()}
                        <span className="text-[60%] font-medium text-slate-500 dark:text-slate-400 ml-1">Ks</span>
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-right whitespace-nowrap hidden sm:table-cell">
                      <span className="num-tabular font-medium text-sm text-slate-800 dark:text-slate-200">
                        {shop.gold15peRate ? (
                          <>
                            {shop.gold15peRate.toLocaleString()}
                            <span className="text-[60%] font-medium text-slate-500 dark:text-slate-400 ml-1">Ks</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </span>
                    </td>
                    <td className="py-3 text-right whitespace-nowrap">
                      <div className="inline-flex flex-col items-end gap-0.5">
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-md ${
                            shop.verificationMethod === 'grounding_search'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {shop.verificationMethod === 'grounding_search' ? 'Live Grounded' : 'Verified Benchmark'}
                        </span>
                        {shop.sourceUrl ? (
                          <a
                            href={shop.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-700 dark:text-blue-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                          >
                            <span>{shop.updatedLabel}</span>
                            <ExternalLink className="w-3 h-3" aria-hidden="true" />
                          </a>
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {shop.updatedLabel}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Live Global Spot Gold Parity Benchmark */}
      {pipelineMeta?.xauUsdSpot && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-[0_2px_10px_rgba(0,0,0,0.03)]">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-2.5">
              <Globe className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div>
                <h3 className="text-base font-bold text-slate-950 dark:text-white mm-heading">
                  ကမ္ဘာ့ရွှေ Live Spot နှင့် မြန်မာ့ရွှေ တန်ဖိုးချိန်ထိုးချက် (Global Spot Parity)
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 mm-text">
                  Google Search Grounding မှ ရရှိသော XAU/USD ဈေးကို 1 ကျပ်သား (16.3293 ဂရမ် ≈ 0.525 ထရွိုင်အောင်စ) ဖြင့် တွက်ချက်ထားသည်။
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs w-full md:w-auto min-w-0">
              <div className="min-w-0 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/70">
                <div className="text-xs font-medium text-slate-600 dark:text-slate-400">XAU Spot (1 oz)</div>
                <div className="num-tabular font-bold text-slate-950 dark:text-amber-400 mt-0.5">
                  ${(worldGold?.marketRate || pipelineMeta.xauUsdSpot).toLocaleString()}
                </div>
              </div>
              {pipelineMeta.xagUsdSpot && (
                <div className="min-w-0 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/70">
                  <div className="text-xs font-medium text-slate-600 dark:text-slate-400">XAG Silver (1 oz)</div>
                  <div className="num-tabular font-bold text-slate-900 dark:text-slate-200 mt-0.5">
                    ${pipelineMeta.xagUsdSpot.toLocaleString()}
                  </div>
                </div>
              )}
              {pipelineMeta.spotParityMmkOnline && (
                <div className="min-w-0 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/70">
                  <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mm-text">ဘဏ် Online Parity</div>
                  <div className="num-tabular font-bold text-blue-700 dark:text-blue-400 mt-0.5">
                    ~{pipelineMeta.spotParityMmkOnline.toLocaleString()} Ks
                  </div>
                </div>
              )}
              {pipelineMeta.spotParityMmkMarket && (
                <div className="min-w-0 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/70">
                  <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mm-text">ပြင်ပဒေါ်လာ Parity</div>
                  <div className="num-tabular font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">
                    ~{pipelineMeta.spotParityMmkMarket.toLocaleString()} Ks
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Myanmar Gold Weight Calculator Box */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-[0_2px_10px_rgba(0,0,0,0.03)]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-950 dark:text-white flex items-center gap-2 mm-heading">
              <Coins className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>မြန်မာ့ရွှေ အလေးချိန် အမြန်တွက်ချက်စက် (Quick Gold Estimator)</span>
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mm-text">
              ကျပ်သား၊ ပဲ၊ ရွေး အလိုက် ယနေ့ အခေါက်ရွှေ 16 ပဲရည် ပြင်ပဈေးကွက်နှုန်းဖြင့် ခန့်မှန်းတန်ဖိုးကို တိုက်ရိုက်တွက်ချက်ပေးပါသည်။
            </p>
          </div>

          <div className="text-xs text-slate-700 dark:text-slate-300 num-tabular bg-slate-50 dark:bg-slate-800 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
            1 ကျပ်သား = 16 ပဲ = 128 ရွေး = 16.3293 grams
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 gap-4 items-end">
          {/* Kyat input */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 mm-text">
              ကျပ်သား (Kyat)
            </label>
            <input
              type="number"
              min="0"
              value={weightKyat}
              onChange={(e) => setWeightKyat(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-full px-3 py-2 text-sm num-tabular bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            />
          </div>

          {/* Pe input */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 mm-text">
              ပဲ (Pe: 0-15)
            </label>
            <input
              type="number"
              min="0"
              max="15"
              value={weightPe}
              onChange={(e) => setWeightPe(Math.max(0, Math.min(15, parseFloat(e.target.value) || 0)))}
              className="w-full px-3 py-2 text-sm num-tabular bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            />
          </div>

          {/* Yway input */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 mm-text">
              ရွေး (Yway: 0-7)
            </label>
            <input
              type="number"
              min="0"
              max="7"
              value={weightYway}
              onChange={(e) => setWeightYway(Math.max(0, Math.min(7, parseFloat(e.target.value) || 0)))}
              className="w-full px-3 py-2 text-sm num-tabular bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            />
          </div>

          {/* Results Summary */}
          <div className="min-w-0 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl p-3 sm:col-span-3 md:col-span-1">
            <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mm-text">
              စုစုပေါင်း {totalKyattha.toFixed(3)} ကျပ်သား ({estimatedGrams} g)
            </div>
            <div className="flex flex-wrap items-baseline gap-x-1 text-lg font-bold num-tabular text-slate-950 dark:text-white mt-0.5">
              <span>{estimatedMarketTotal.toLocaleString()}</span>
              <span className="text-[60%] font-medium text-slate-500 dark:text-slate-400">Ks</span>
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400 num-tabular mt-0.5">
              တရားဝင် ရည်ညွှန်းနှုန်း: {estimatedOfficialTotal.toLocaleString()} Ks
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
