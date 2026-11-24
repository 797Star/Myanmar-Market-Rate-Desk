import React from 'react';
import { Calculator, Pencil, Clock } from 'lucide-react';
import {
  GoldQuote,
  CurrencyQuote,
  CommodityQuote,
  TownshipConsensusAssetSummary,
} from '../types';
import { formatGatheredTimeMm } from '../utils/posterGenerator';

interface OfficialVsMarketCardProps {
  goldQuotes: GoldQuote[];
  currencyQuotes: CurrencyQuote[];
  commodityQuotes: CommodityQuote[];
  lastSyncedAt?: string | null;
  townshipConsensusMap?: Map<string, TownshipConsensusAssetSummary>;
  onOpenCalculatorWithItem: (type: string, id: string) => void;
  onEditRate: (type: string, id: string, name: string, currentRate: number) => void;
}

const getSpreadTextColor = (pct: number) => {
  if (pct >= 100) return 'text-[#b91c1c] dark:text-rose-400';
  if (pct >= 30) return 'text-amber-700 dark:text-amber-400';
  return 'text-[#15803d] dark:text-emerald-400';
};

const getSpreadBarColor = (pct: number) => {
  if (pct >= 100) return 'bg-[#b91c1c] dark:bg-rose-500';
  if (pct >= 30) return 'bg-amber-600 dark:bg-amber-400';
  return 'bg-[#004225] dark:bg-emerald-500';
};

export const OfficialVsMarketCard: React.FC<OfficialVsMarketCardProps> = ({
  goldQuotes,
  currencyQuotes,
  commodityQuotes,
  lastSyncedAt,
  townshipConsensusMap,
  onOpenCalculatorWithItem,
  onEditRate,
}) => {
  const gatheredTimeLabel = formatGatheredTimeMm(lastSyncedAt);
  const gold24k = goldQuotes.find((g) => g.id === 'gold-24k');
  const gold15pe = goldQuotes.find((g) => g.id === 'gold-15pe');
  const usd = currencyQuotes.find((c) => c.code === 'USD');
  const thb = currencyQuotes.find((c) => c.code === 'THB');
  const sgd = currencyQuotes.find((c) => c.code === 'SGD');
  const fuel92 = commodityQuotes.find((cm) => cm.id === 'fuel-92');
  const palmOil = commodityQuotes.find((cm) => cm.id === 'oil-palm');
  const shweboRice = commodityQuotes.find((cm) => cm.id === 'rice-shwebo');

  const rows = [
    {
      type: 'gold',
      id: 'gold-24k',
      nameMm: 'အခေါက်ရွှေ 16 ပဲရည်',
      nameEn: 'Academy 24K Gold',
      unit: '1 Kyattha',
      officialRate: gold24k?.officialRate || 0,
      officialSource: 'YGEA Reference',
      marketRate: gold24k?.marketRate || 0,
      marketSource: gold24k?.sourceMarket || 'Google Search / Open Market',
      spreadAmount: gold24k?.spreadAmount || 0,
      spreadPercent: gold24k?.spreadPercent || 0,
      delta: gold24k?.delta || 0,
      direction: gold24k?.deltaDirection || 'unchanged',
    },
    {
      type: 'gold',
      id: 'gold-15pe',
      nameMm: '15 ပဲရည် ရွှေစံချိန်',
      nameEn: '15-Pe Standard Gold',
      unit: '1 Kyattha',
      officialRate: gold15pe?.officialRate || 0,
      officialSource: 'YGEA Parity',
      marketRate: gold15pe?.marketRate || 0,
      marketSource: 'Open Market Shops',
      spreadAmount: gold15pe?.spreadAmount || 0,
      spreadPercent: gold15pe?.spreadPercent || 0,
      delta: gold15pe?.delta || 0,
      direction: gold15pe?.deltaDirection || 'unchanged',
    },
    {
      type: 'currency',
      id: 'USD',
      nameMm: 'အမေရိကန် ဒေါ်လာ',
      nameEn: 'US Dollar (USD)',
      unit: '1 USD',
      officialRate: usd?.cbmOfficialRate || 0,
      officialSource: `CBM (Online ${(usd?.onlineTradingRate || 0).toLocaleString()})`,
      marketRate: usd?.marketSellRate || 0,
      marketSource: 'Street Counter / Hundi',
      spreadAmount: usd?.spreadAmount || 0,
      spreadPercent: usd?.spreadPercent || 0,
      delta: usd?.delta || 0,
      direction: usd?.deltaDirection || 'unchanged',
    },
    {
      type: 'currency',
      id: 'THB',
      nameMm: 'ထိုင်း ဘတ်',
      nameEn: 'Thai Baht (THB)',
      unit: '1 THB',
      officialRate: thb?.cbmOfficialRate || 0,
      officialSource: `CBM (Online ${(thb?.onlineTradingRate || 0).toLocaleString()})`,
      marketRate: thb?.marketSellRate || 0,
      marketSource: 'Myawaddy / Border Hundi',
      spreadAmount: thb?.spreadAmount || 0,
      spreadPercent: thb?.spreadPercent || 0,
      delta: thb?.delta || 0,
      direction: thb?.deltaDirection || 'unchanged',
    },
    {
      type: 'currency',
      id: 'SGD',
      nameMm: 'စင်ကာပူ ဒေါ်လာ',
      nameEn: 'Singapore Dollar (SGD)',
      unit: '1 SGD',
      officialRate: sgd?.cbmOfficialRate || 0,
      officialSource: `CBM (Online ${(sgd?.onlineTradingRate || 0).toLocaleString()})`,
      marketRate: sgd?.marketSellRate || 0,
      marketSource: 'SG-YGN Remittance',
      spreadAmount: sgd?.spreadAmount || 0,
      spreadPercent: sgd?.spreadPercent || 0,
      delta: sgd?.delta || 0,
      direction: sgd?.deltaDirection || 'unchanged',
    },
    {
      type: 'commodity',
      id: 'oil-palm',
      nameMm: 'စားအုန်းဆီ',
      nameEn: 'Edible Palm Oil',
      unit: '1 Viss',
      officialRate: palmOil?.officialRefRate || 0,
      officialSource: 'DOCA Reference',
      marketRate: palmOil?.openMarketRate || 0,
      marketSource: 'Retail Market',
      spreadAmount: (palmOil?.openMarketRate || 0) - (palmOil?.officialRefRate || 0),
      spreadPercent: palmOil?.spreadPercent || 0,
      delta: palmOil?.delta || 0,
      direction: palmOil?.deltaDirection || 'unchanged',
    },
    {
      type: 'commodity',
      id: 'fuel-92',
      nameMm: 'အောက်တိန်း 92',
      nameEn: 'Octane 92 Fuel',
      unit: '1 Litre',
      officialRate: fuel92?.officialRefRate || 0,
      officialSource: 'PPRD Yangon Ref',
      marketRate: fuel92?.openMarketRate || 0,
      marketSource: fuel92?.sourceMarket || 'Google Search / Retail Pump',
      spreadAmount: (fuel92?.openMarketRate || 0) - (fuel92?.officialRefRate || 0),
      spreadPercent: fuel92?.spreadPercent || 0,
      delta: fuel92?.delta || 0,
      direction: fuel92?.deltaDirection || 'unchanged',
    },
    {
      type: 'commodity',
      id: 'rice-shwebo',
      nameMm: 'ရွှေဘို ပေါ်ဆန်း',
      nameEn: 'Shwebo Pawsan Rice',
      unit: '1 Bag (24 Pyi)',
      officialRate: shweboRice?.officialRefRate || 0,
      officialSource: 'MRF Reference',
      marketRate: shweboRice?.openMarketRate || 0,
      marketSource: 'Bayintnaung Exchange',
      spreadAmount: (shweboRice?.openMarketRate || 0) - (shweboRice?.officialRefRate || 0),
      spreadPercent: shweboRice?.spreadPercent || 0,
      delta: shweboRice?.delta || 0,
      direction: shweboRice?.deltaDirection || 'unchanged',
    },
  ];

  return (
    <section
      aria-label="Official reference vs open market spread matrix"
      className="bg-white dark:bg-[#191A19] border border-[#1C1C1C]/12 dark:border-stone-800 rounded-sm overflow-hidden transition-colors duration-200"
    >
      {/* Matrix Header */}
      <div className="px-5 py-4 border-b border-[#1C1C1C]/12 dark:border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <div className="editorial-label text-[#004225] dark:text-emerald-400">
            Reference vs Open Market Spread Matrix
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-[#1C1C1C] dark:text-white mm-heading mt-0.5">
            တရားဝင် ရည်ညွှန်းနှုန်း vs ပြင်ပဈေးကွက်
          </h2>
        </div>

        <div className="flex items-center gap-1.5 text-xs font-mono tabular-nums text-[#1C1C1C]/70 dark:text-stone-400">
          <Clock className="w-3.5 h-3.5 text-[#004225] dark:text-emerald-400 shrink-0" />
          <span>Gathered: {gatheredTimeLabel}</span>
        </div>
      </div>

      {/* Desktop Spread Matrix Table (>= 1024px) */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr className="border-b border-[#1C1C1C] dark:border-stone-700 text-[11px] font-mono uppercase tracking-[0.1em] text-[#1C1C1C]/65 dark:text-stone-400 bg-[#F9F8F6]/60 dark:bg-stone-900/50">
              <th scope="col" className="py-3.5 px-4 text-left">
                Commodity / Asset
              </th>
              <th scope="col" className="py-3.5 px-3 text-left whitespace-nowrap">
                Unit
              </th>
              <th scope="col" className="py-3.5 px-3 text-right whitespace-nowrap">
                Reference
              </th>
              <th scope="col" className="py-3.5 px-3 text-right whitespace-nowrap">
                Open Market
              </th>
              <th scope="col" className="py-3.5 px-3 text-right whitespace-nowrap">
                Spread %
              </th>
              <th scope="col" className="py-3.5 px-4 text-right whitespace-nowrap w-[92px]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1C1C1C]/10 dark:divide-stone-800">
            {rows.map((row) => (
              <tr
                key={row.id}
                className="hover:bg-[#F9F8F6]/80 dark:hover:bg-stone-800/40 transition-colors"
              >
                <td className="py-3.5 px-4 align-middle">
                  <div className="text-sm font-bold text-[#1C1C1C] dark:text-white mm-text">
                    {row.nameMm}
                  </div>
                  <div className="text-xs text-[#1C1C1C]/60 dark:text-stone-400 en-sub">
                    {row.nameEn}
                  </div>
                </td>

                <td className="py-3.5 px-3 align-middle text-xs font-mono text-[#1C1C1C]/70 dark:text-stone-300 whitespace-nowrap">
                  {row.unit}
                </td>

                <td className="py-3.5 px-3 align-middle text-right">
                  <div className="text-sm font-mono font-medium tabular-nums text-[#1C1C1C] dark:text-stone-200 whitespace-nowrap">
                    {row.officialRate.toLocaleString()} Ks
                  </div>
                  <div className="text-[11px] text-[#1C1C1C]/55 dark:text-stone-400 whitespace-nowrap">
                    {row.officialSource}
                  </div>
                </td>

                <td className="py-3.5 px-3 align-middle text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span className="text-base font-bold font-mono tabular-nums text-[#1C1C1C] dark:text-white whitespace-nowrap">
                      {row.marketRate.toLocaleString()} Ks
                    </span>
                    {row.direction === 'up' && (
                      <span className="text-[11px] font-mono font-semibold text-[#15803d] dark:text-emerald-400 whitespace-nowrap">
                        ▲+{row.delta.toLocaleString()}
                      </span>
                    )}
                    {row.direction === 'down' && (
                      <span className="text-[11px] font-mono font-semibold text-[#b91c1c] dark:text-rose-400 whitespace-nowrap">
                        ▼-{row.delta.toLocaleString()}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[#1C1C1C]/55 dark:text-stone-400">
                    {row.marketSource}
                  </div>
                  {(() => {
                    const consensus = townshipConsensusMap?.get(`${row.type}:${row.id}`);
                    if (!consensus || consensus.reportCount <= 0) return null;
                    return (
                      <div className="text-[10px] font-mono tabular-nums text-[#004225] dark:text-emerald-400">
                        Township ({consensus.reportCount}): {consensus.medianRate.toLocaleString()} Ks
                      </div>
                    );
                  })()}
                </td>

                <td className="py-3.5 px-3 align-middle text-right whitespace-nowrap">
                  <div className="inline-flex items-center justify-end gap-2.5">
                    <span
                      className={`text-sm font-bold font-mono tabular-nums ${getSpreadTextColor(
                        row.spreadPercent
                      )}`}
                    >
                      +{row.spreadPercent.toFixed(1)}%
                    </span>
                    <div
                      className="w-20 h-1 bg-[#1C1C1C]/10 dark:bg-stone-700 rounded-full overflow-hidden"
                      aria-hidden="true"
                    >
                      <div
                        className={`h-full transition-all duration-300 ${getSpreadBarColor(
                          row.spreadPercent
                        )}`}
                        style={{ width: `${Math.min((row.spreadPercent / 120) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-[#1C1C1C]/50 dark:text-stone-400">
                    +{row.spreadAmount.toLocaleString()} Ks
                  </div>
                </td>

                <td className="py-3.5 px-4 align-middle text-right whitespace-nowrap">
                  <div className="inline-flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => onOpenCalculatorWithItem(row.type, row.id)}
                      aria-label={`${row.nameMm} တွက်ချက်ရန်`}
                      title="Calculator"
                      className="w-8 h-8 inline-flex items-center justify-center text-[#1C1C1C] dark:text-stone-200 border border-[#1C1C1C]/15 dark:border-stone-700 hover:bg-[#1C1C1C] hover:text-white dark:hover:bg-stone-700 rounded-sm transition-colors cursor-pointer"
                    >
                      <Calculator className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onEditRate(row.type, row.id, row.nameMm, row.marketRate)}
                      aria-label={`${row.nameMm} ဈေးနှုန်း ပြင်ဆင်ရန်`}
                      title="Edit Rate"
                      className="w-8 h-8 inline-flex items-center justify-center text-[#004225] dark:text-emerald-400 border border-[#004225]/25 dark:border-emerald-700/50 hover:bg-[#004225] hover:text-white rounded-sm transition-colors cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile & Tablet Stacked Grid (< 1024px) */}
      <div className="lg:hidden grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:gap-px md:bg-[#1C1C1C]/12 dark:md:bg-stone-800">
        {rows.map((row) => (
          <div key={row.id} className="p-4 space-y-3 bg-white dark:bg-[#191A19] min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-bold text-[#1C1C1C] dark:text-white mm-text">
                  {row.nameMm}
                </div>
                <div className="text-xs text-[#1C1C1C]/60 dark:text-stone-400">
                  {row.nameEn} · {row.unit}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-lg font-bold font-mono tabular-nums text-[#1C1C1C] dark:text-white">
                  {row.marketRate.toLocaleString()} Ks
                </div>
                <div className={`text-xs font-mono font-bold ${getSpreadTextColor(row.spreadPercent)}`}>
                  +{row.spreadPercent.toFixed(1)}%
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2 border-t border-[#1C1C1C]/10 dark:border-stone-800 text-xs">
              <div className="min-w-0">
                <span className="font-mono tabular-nums text-[#1C1C1C]/70 dark:text-stone-400 block">
                  Ref: {row.officialRate.toLocaleString()} Ks
                </span>
                {(() => {
                  const consensus = townshipConsensusMap?.get(`${row.type}:${row.id}`);
                  if (!consensus || consensus.reportCount <= 0) return null;
                  return (
                    <span className="text-[10px] font-mono tabular-nums text-[#004225] dark:text-emerald-400 block">
                      Township ({consensus.reportCount}): {consensus.medianRate.toLocaleString()} Ks
                    </span>
                  );
                })()}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onOpenCalculatorWithItem(row.type, row.id)}
                  className="p-1.5 border border-[#1C1C1C]/15 dark:border-stone-700 rounded-sm cursor-pointer"
                  aria-label="Calculator"
                >
                  <Calculator className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onEditRate(row.type, row.id, row.nameMm, row.marketRate)}
                  className="p-1.5 border border-[#004225]/25 text-[#004225] dark:text-emerald-400 rounded-sm cursor-pointer"
                  aria-label="Edit rate"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer Note */}
      <div className="px-5 py-3 bg-[#F9F8F6] dark:bg-stone-900/50 border-t border-[#1C1C1C]/10 dark:border-stone-800 text-xs text-[#1C1C1C]/65 dark:text-stone-400 flex flex-wrap items-center justify-between gap-2">
        <span className="mm-text">
          ပြင်ပဈေးကွက်နှုန်းများသည် ရန်ကုန်/မန္တလေး လက်ငင်းအရောင်းအဝယ် ပျမ်းမျှဖြစ်သည်။
        </span>
        <span className="editorial-label text-[#1C1C1C]/50 dark:text-stone-500">
          Sources: Google Search Grounding · CBM · YGEA · MRF · PPRD · DOCA
        </span>
      </div>
    </section>
  );
};
