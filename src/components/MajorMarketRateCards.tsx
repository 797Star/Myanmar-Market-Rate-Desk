import React from 'react';
import {
  Bell,
  Calculator,
  Pencil,
  ArrowUpRight,
  Coins,
  DollarSign,
  Fuel,
  Utensils,
  Wheat,
} from 'lucide-react';
import type {
  CommodityQuote,
  CurrencyQuote,
  GoldQuote,
  MarketSession,
  TownshipConsensusAssetSummary,
} from '../types';
import { calcSpread } from '../utils/quoteHelpers';

interface MajorMarketRateCardsProps {
  activeSession: MarketSession;
  goldQuotes: GoldQuote[];
  currencyQuotes: CurrencyQuote[];
  commodityQuotes: CommodityQuote[];
  townshipConsensusMap?: Map<string, TownshipConsensusAssetSummary>;
  onOpenAlertForAsset: (itemKey: string) => void;
  onOpenCalculatorWithItem: (type: string, id: string) => void;
  onEditRate: (type: string, id: string, name: string, currentRate: number) => void;
  onNavigateTab: (tab: string) => void;
}

interface MajorCardItem {
  key: string;
  tabTarget: 'gold' | 'forex' | 'commodities';
  editType: 'gold' | 'currency' | 'commodity';
  alertKey: string;
  supportsCalculator: boolean;
  kicker: string;
  titleMm: string;
  titleEn: string;
  unitLabel: string;
  latestRate: number;
  latestLabel: string;
  latestSource: string;
  officialRate: number;
  officialLabel: string;
  officialSource: string;
  spreadAmount: number;
  spreadPercent: number;
  delta: number;
  deltaDirection: 'up' | 'down' | 'unchanged';
  morningRate: number;
  eveningRate: number;
  verifyUrl?: string;
  secondaryMetrics?: Array<{ label: string; value: string }>;
  icon: 'gold' | 'fx' | 'fuel' | 'oil' | 'rice';
}

const getSpreadColor = (pct: number) => {
  if (pct >= 100) return 'text-[#b91c1c] dark:text-rose-400';
  if (pct >= 30) return 'text-amber-700 dark:text-amber-400';
  return 'text-[#15803d] dark:text-emerald-400';
};

const getSpreadBarColor = (pct: number) => {
  if (pct >= 100) return 'bg-[#b91c1c] dark:bg-rose-500';
  if (pct >= 30) return 'bg-amber-600 dark:bg-amber-400';
  return 'bg-[#004225] dark:bg-emerald-500';
};

const renderIcon = (icon: MajorCardItem['icon']) => {
  switch (icon) {
    case 'gold':
      return <Coins className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" aria-hidden="true" />;
    case 'fx':
      return <DollarSign className="w-4 h-4 text-[#004225] dark:text-emerald-400 shrink-0" aria-hidden="true" />;
    case 'fuel':
      return <Fuel className="w-4 h-4 text-sky-700 dark:text-sky-400 shrink-0" aria-hidden="true" />;
    case 'oil':
      return <Utensils className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" aria-hidden="true" />;
    case 'rice':
      return <Wheat className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" aria-hidden="true" />;
  }
};

export const MajorMarketRateCards: React.FC<MajorMarketRateCardsProps> = ({
  activeSession,
  goldQuotes,
  currencyQuotes,
  commodityQuotes,
  townshipConsensusMap,
  onOpenAlertForAsset,
  onOpenCalculatorWithItem,
  onEditRate,
  onNavigateTab,
}) => {
  const gold24k = goldQuotes.find((g) => g.id === 'gold-24k');
  const usd = currencyQuotes.find((c) => c.code === 'USD');
  const thb = currencyQuotes.find((c) => c.code === 'THB');
  const fuel92 = commodityQuotes.find((cm) => cm.id === 'fuel-92');
  const palmOil = commodityQuotes.find((cm) => cm.id === 'oil-palm');
  const shweboRice = commodityQuotes.find((cm) => cm.id === 'rice-shwebo');

  const buildSpread = (latest: number, official: number, storedPct?: number) => {
    const computed = calcSpread(latest, official);
    return {
      amount: Math.round(latest - official),
      percent: typeof storedPct === 'number' && storedPct > 0 ? storedPct : computed.spreadPercent,
    };
  };

  const goldSpread = buildSpread(
    gold24k?.marketRate ?? 10300000,
    gold24k?.officialRate ?? 7100000,
    gold24k?.spreadPercent
  );
  const usdSpread = buildSpread(
    usd?.marketSellRate ?? 5145,
    usd?.cbmOfficialRate ?? 2100,
    usd?.spreadPercent
  );
  const thbSpread = buildSpread(
    thb?.marketSellRate ?? 150.7,
    thb?.cbmOfficialRate ?? 65.1,
    thb?.spreadPercent
  );
  const fuelSpread = buildSpread(
    fuel92?.openMarketRate ?? 3322,
    fuel92?.officialRefRate ?? 3045,
    fuel92?.spreadPercent
  );
  const oilSpread = buildSpread(
    palmOil?.openMarketRate ?? 13500,
    palmOil?.officialRefRate ?? 7015,
    palmOil?.spreadPercent
  );
  const riceSpread = buildSpread(
    shweboRice?.openMarketRate ?? 178000,
    shweboRice?.officialRefRate ?? 145000,
    shweboRice?.spreadPercent
  );

  const items: MajorCardItem[] = [
    {
      key: 'gold-24k',
      tabTarget: 'gold',
      editType: 'gold',
      alertKey: 'gold-24k',
      supportsCalculator: true,
      kicker: 'Bullion · 24K',
      titleMm: 'အခေါက်ရွှေ ၁၆ ပဲရည်',
      titleEn: '24K Pure Gold',
      unitLabel: '1 Kyattha (16.329g)',
      latestRate: gold24k?.marketRate ?? 10300000,
      latestLabel: 'Latest Market',
      latestSource: gold24k?.sourceMarket || 'Google Search / Open Market',
      officialRate: gold24k?.officialRate ?? 7100000,
      officialLabel: 'Official YGEA',
      officialSource: gold24k?.sourceOfficial || 'YGEA Reference',
      spreadAmount: goldSpread.amount,
      spreadPercent: goldSpread.percent,
      delta: gold24k?.delta ?? 0,
      deltaDirection: gold24k?.deltaDirection ?? 'unchanged',
      morningRate: gold24k?.morningRate ?? 10250000,
      eveningRate: gold24k?.eveningRate ?? 10300000,
      verifyUrl: gold24k?.groundingUrl,
      secondaryMetrics: gold24k?.marketBuyRate
        ? [
            { label: 'Buy-Back', value: `${gold24k.marketBuyRate.toLocaleString()} Ks` },
            { label: 'AM', value: `${(gold24k?.morningRate ?? 10250000).toLocaleString()} Ks` },
          ]
        : undefined,
      icon: 'gold',
    },
    {
      key: 'USD',
      tabTarget: 'forex',
      editType: 'currency',
      alertKey: 'USD',
      supportsCalculator: true,
      kicker: 'Forex · USD/MMK',
      titleMm: 'အမေရိကန် ဒေါ်လာ',
      titleEn: 'US Dollar (USD)',
      unitLabel: '1 USD',
      latestRate: usd?.marketSellRate ?? 5145,
      latestLabel: 'Latest Street Sell',
      latestSource: usd?.sourceMarket || 'Street / FB Hundi',
      officialRate: usd?.cbmOfficialRate ?? 2100,
      officialLabel: 'Official CBM',
      officialSource: 'CBM Reference',
      spreadAmount: usdSpread.amount,
      spreadPercent: usdSpread.percent,
      delta: usd?.delta ?? 0,
      deltaDirection: usd?.deltaDirection ?? 'unchanged',
      morningRate: usd?.morningRate ?? 5145,
      eveningRate: usd?.eveningRate ?? 5145,
      verifyUrl: usd?.sourceMarketUrl,
      secondaryMetrics: [
        { label: 'Buy', value: `${(usd?.marketBuyRate ?? 5070).toLocaleString()} Ks` },
        { label: 'Online', value: `${(usd?.onlineTradingRate ?? 3670).toLocaleString()} Ks` },
        ...(usd?.workerRemittanceRate
          ? [{ label: 'Bank WR', value: `${usd.workerRemittanceRate.toLocaleString()} Ks` }]
          : []),
      ],
      icon: 'fx',
    },
    {
      key: 'THB',
      tabTarget: 'forex',
      editType: 'currency',
      alertKey: 'THB',
      supportsCalculator: true,
      kicker: 'Forex · THB/MMK',
      titleMm: 'ထိုင်း ဘတ်',
      titleEn: 'Thai Baht (THB)',
      unitLabel: '1 THB',
      latestRate: thb?.marketSellRate ?? 150.7,
      latestLabel: 'Latest Street Sell',
      latestSource: thb?.sourceMarket || 'Myawaddy / Cross-FX',
      officialRate: thb?.cbmOfficialRate ?? 65.1,
      officialLabel: 'Official CBM',
      officialSource: 'CBM Reference',
      spreadAmount: thbSpread.amount,
      spreadPercent: thbSpread.percent,
      delta: thb?.delta ?? 0,
      deltaDirection: thb?.deltaDirection ?? 'unchanged',
      morningRate: thb?.morningRate ?? 150.7,
      eveningRate: thb?.eveningRate ?? 150.7,
      verifyUrl: thb?.sourceMarketUrl,
      secondaryMetrics: [
        { label: 'Buy', value: `${(thb?.marketBuyRate ?? 147.8).toLocaleString()} Ks` },
        { label: 'Online', value: `${(thb?.onlineTradingRate ?? 107.6).toLocaleString()} Ks` },
        ...(thb?.workerRemittanceRate
          ? [{ label: 'Bank WR', value: `${thb.workerRemittanceRate.toLocaleString()} Ks` }]
          : []),
      ],
      icon: 'fx',
    },
    {
      key: 'fuel-92',
      tabTarget: 'commodities',
      editType: 'commodity',
      alertKey: 'fuel-92',
      supportsCalculator: false,
      kicker: 'Energy · Fuel',
      titleMm: 'အောက်တိန်း 92 ဓာတ်ဆီ',
      titleEn: 'Octane 92 Retail Fuel',
      unitLabel: '1 Litre',
      latestRate: fuel92?.openMarketRate ?? 3322,
      latestLabel: 'Latest Pump Rate',
      latestSource: fuel92?.sourceMarket || 'Google Search / Yangon Pump',
      officialRate: fuel92?.officialRefRate ?? 3045,
      officialLabel: 'Official PPRD',
      officialSource: fuel92?.sourceOfficial || 'PPRD Yangon Cap',
      spreadAmount: fuelSpread.amount,
      spreadPercent: fuelSpread.percent,
      delta: fuel92?.delta ?? 0,
      deltaDirection: fuel92?.deltaDirection ?? 'unchanged',
      morningRate: fuel92?.morningRate ?? 3322,
      eveningRate: fuel92?.eveningRate ?? 3322,
      verifyUrl: fuel92?.groundingUrl,
      icon: 'fuel',
    },
    {
      key: 'oil-palm',
      tabTarget: 'commodities',
      editType: 'commodity',
      alertKey: 'oil-palm',
      supportsCalculator: false,
      kicker: 'Essential · Cooking Oil',
      titleMm: 'စားအုန်းဆီ',
      titleEn: 'Edible Palm Oil',
      unitLabel: '1 Viss (1.63 kg)',
      latestRate: palmOil?.openMarketRate ?? 13500,
      latestLabel: 'Latest Retail Rate',
      latestSource: palmOil?.sourceMarket || 'Google Search / Street Retail',
      officialRate: palmOil?.officialRefRate ?? 7015,
      officialLabel: 'Official DOCA',
      officialSource: palmOil?.sourceOfficial || 'DOCA Reference',
      spreadAmount: oilSpread.amount,
      spreadPercent: oilSpread.percent,
      delta: palmOil?.delta ?? 0,
      deltaDirection: palmOil?.deltaDirection ?? 'unchanged',
      morningRate: palmOil?.morningRate ?? 13500,
      eveningRate: palmOil?.eveningRate ?? 13500,
      verifyUrl: palmOil?.groundingUrl,
      icon: 'oil',
    },
    {
      key: 'rice-shwebo',
      tabTarget: 'commodities',
      editType: 'commodity',
      alertKey: 'rice-shwebo',
      supportsCalculator: false,
      kicker: 'Staple · Rice',
      titleMm: 'ရွှေဘို ပေါ်ဆန်းဆန်',
      titleEn: 'Shwebo Pawsan Rice',
      unitLabel: '1 Bag (24 Pyi)',
      latestRate: shweboRice?.openMarketRate ?? 178000,
      latestLabel: 'Latest Market',
      latestSource: shweboRice?.sourceMarket || 'Google Search / Bayintnaung',
      officialRate: shweboRice?.officialRefRate ?? 145000,
      officialLabel: 'Official MRF',
      officialSource: shweboRice?.sourceOfficial || 'MRF Reference',
      spreadAmount: riceSpread.amount,
      spreadPercent: riceSpread.percent,
      delta: shweboRice?.delta ?? 0,
      deltaDirection: shweboRice?.deltaDirection ?? 'unchanged',
      morningRate: shweboRice?.morningRate ?? 178000,
      eveningRate: shweboRice?.eveningRate ?? 178000,
      verifyUrl: shweboRice?.groundingUrl,
      icon: 'rice',
    },
  ];

  return (
    <section aria-labelledby="major-rates-board-heading" className="space-y-4">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <div className="editorial-label text-[#004225] dark:text-emerald-400">
            Major Market Rate Cards · Latest vs Official Reference
          </div>
          <h2
            id="major-rates-board-heading"
            className="text-xl sm:text-2xl font-bold text-[#1C1C1C] dark:text-[#F3F2EE] tracking-tight mm-heading mt-0.5"
          >
            အဓိက ကုန်စည်နှင့် ငွေကြေး ဈေးနှုန်းကတ်များ (တရားဝင်နှုန်း + နောက်ဆုံးဈေး)
          </h2>
        </div>

        <span className="text-xs font-mono text-[#1C1C1C]/60 dark:text-stone-400 shrink-0">
          Session: {activeSession === 'morning' ? 'Morning (09:30 AM)' : 'Evening (04:30 PM)'}
        </span>
      </div>

      {/* 6 Big Major Rate Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {items.map((item) => {
          const spreadPctText = `${item.spreadPercent >= 0 ? '+' : ''}${item.spreadPercent.toFixed(1)}%`;
          const spreadAmtText = `${item.spreadAmount >= 0 ? '+' : ''}${item.spreadAmount.toLocaleString()} Ks`;

          return (
            <article
              key={item.key}
              className="min-w-0 bg-white dark:bg-[#191A19] border border-[#1C1C1C]/15 dark:border-stone-800 hover:border-[#004225]/50 dark:hover:border-emerald-500/40 rounded-sm p-5 flex flex-col justify-between transition-colors"
            >
              <div>
                {/* Top Metadata Line */}
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#1C1C1C]/10 dark:border-stone-800">
                  <div className="flex items-center gap-2 min-w-0">
                    {renderIcon(item.icon)}
                    <span className="editorial-label text-[#1C1C1C]/65 dark:text-stone-400 truncate">
                      {item.kicker}
                    </span>
                  </div>

                  <span
                    className={`text-xs font-mono font-bold tabular-nums shrink-0 ${
                      item.deltaDirection === 'up'
                        ? 'text-[#15803d] dark:text-emerald-400'
                        : item.deltaDirection === 'down'
                        ? 'text-[#b91c1c] dark:text-rose-400'
                        : 'text-[#1C1C1C]/55 dark:text-stone-400'
                    }`}
                  >
                    {item.deltaDirection === 'up' && `▲ +${item.delta.toLocaleString()} Ks`}
                    {item.deltaDirection === 'down' && `▼ -${item.delta.toLocaleString()} Ks`}
                    {item.deltaDirection === 'unchanged' && '— 0 Ks'}
                  </span>
                </div>

                {/* Title & Unit */}
                <div className="mt-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-base sm:text-lg font-bold text-[#1C1C1C] dark:text-[#F3F2EE] mm-heading leading-snug">
                      {item.titleMm}
                    </h3>
                    <div className="text-xs text-[#1C1C1C]/65 dark:text-stone-400 en-sub mt-0.5">
                      {item.titleEn} · <span className="font-mono">{item.unitLabel}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onNavigateTab(item.tabTarget)}
                    className="inline-flex items-center gap-0.5 text-[11px] font-mono font-semibold text-[#004225] dark:text-emerald-400 hover:underline cursor-pointer shrink-0 whitespace-nowrap"
                  >
                    <span>Details</span>
                    <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                  </button>
                </div>

                {/* Dual Prominent Price Split: Latest Market Rate + Official Reference Price */}
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Latest Open Market Rate */}
                  <div className="p-3.5 rounded-sm bg-[#fffa9d] dark:bg-stone-900/90 border border-[#1C1C1C]/15 dark:border-stone-700/80 min-w-0">
                    <div className="editorial-label text-[#004225] dark:text-emerald-400">
                      {item.latestLabel}
                    </div>
                    <div className="mt-1.5 flex items-baseline gap-1 flex-wrap">
                      <span className="text-2xl sm:text-[1.6rem] font-bold font-['Noto_Serif',serif] tabular-nums tracking-tight text-[#1C1C1C] dark:text-white leading-none">
                        {item.latestRate.toLocaleString()}
                      </span>
                      <span className="text-xs font-mono font-medium text-[#1C1C1C]/60 dark:text-stone-400">
                        Ks
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-1.5">
                      <span
                        className="text-[11px] text-[#1C1C1C]/65 dark:text-stone-400 truncate mm-text"
                        title={item.latestSource}
                      >
                        {item.latestSource}
                      </span>
                      {item.verifyUrl && (
                        <a
                          href={item.verifyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] font-mono font-semibold text-[#004225] dark:text-emerald-400 hover:underline shrink-0"
                        >
                          Source ↗
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Official Government Reference Rate */}
                  <div className="p-3.5 rounded-sm bg-white dark:bg-[#141514] border border-[#1C1C1C]/12 dark:border-stone-800 min-w-0">
                    <div className="editorial-label text-[#1C1C1C]/60 dark:text-stone-400">
                      {item.officialLabel}
                    </div>
                    <div className="mt-1.5 flex items-baseline gap-1 flex-wrap">
                      <span className="text-xl sm:text-[1.35rem] font-bold font-['Noto_Serif',serif] tabular-nums tracking-tight text-[#1C1C1C]/85 dark:text-stone-200 leading-none">
                        {item.officialRate.toLocaleString()}
                      </span>
                      <span className="text-xs font-mono font-medium text-[#1C1C1C]/55 dark:text-stone-400">
                        Ks
                      </span>
                    </div>
                    <div
                      className="mt-1.5 text-[11px] text-[#1C1C1C]/60 dark:text-stone-400 truncate"
                      title={item.officialSource}
                    >
                      {item.officialSource}
                    </div>
                  </div>
                </div>

                {/* FX Tier Strip (Online Trading / Bank WR / Buy) or AM/PM Strip */}
                {item.secondaryMetrics && item.secondaryMetrics.length > 0 ? (
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono tabular-nums text-[#1C1C1C]/70 dark:text-stone-300">
                    {item.secondaryMetrics.map((m, idx) => (
                      <React.Fragment key={m.label}>
                        {idx > 0 && (
                          <span aria-hidden="true" className="text-[#1C1C1C]/25 dark:text-stone-700">
                            ·
                          </span>
                        )}
                        <span>
                          <span className="text-[#1C1C1C]/55 dark:text-stone-400">{m.label}:</span>{' '}
                          <strong className="text-[#1C1C1C] dark:text-stone-100">{m.value}</strong>
                        </span>
                      </React.Fragment>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 flex items-center justify-between gap-2 text-xs font-mono tabular-nums text-[#1C1C1C]/70 dark:text-stone-400">
                    <span>AM: {item.morningRate.toLocaleString()} Ks</span>
                    <span aria-hidden="true" className="text-[#1C1C1C]/25 dark:text-stone-700">
                      ·
                    </span>
                    <span>PM: {item.eveningRate.toLocaleString()} Ks</span>
                  </div>
                )}

                {(() => {
                  const consensus = townshipConsensusMap?.get(`${item.editType}:${item.key}`);
                  if (!consensus || consensus.reportCount <= 0) return null;
                  const topTownship = consensus.townships[0]?.township || 'Yangon';
                  return (
                    <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-[#004225] dark:text-emerald-400">
                      <span className="truncate">
                        Township Median ({consensus.reportCount} · {topTownship})
                      </span>
                      <span className="font-bold shrink-0">
                        {consensus.medianRate.toLocaleString()} Ks
                      </span>
                    </div>
                  );
                })()}

                {/* Spread Gap Indicator */}
                <div className="mt-3 pt-2.5 border-t border-[#1C1C1C]/10 dark:border-stone-800 space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2 text-xs font-mono tabular-nums">
                    <span className="text-[#1C1C1C]/65 dark:text-stone-400 mm-text">
                      တရားဝင်နှင့် ကွာဟချက်
                    </span>
                    <span className={`font-bold ${getSpreadColor(item.spreadPercent)}`}>
                      {spreadAmtText} ({spreadPctText})
                    </span>
                  </div>
                  <div
                    className="w-full h-1 bg-[#1C1C1C]/10 dark:bg-stone-800 rounded-full overflow-hidden"
                    aria-hidden="true"
                  >
                    <div
                      className={`h-full transition-all duration-300 ${getSpreadBarColor(item.spreadPercent)}`}
                      style={{ width: `${Math.min(Math.max((item.spreadPercent / 150) * 100, 6), 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Card Action Bar */}
              <div className="mt-4 pt-3 border-t border-[#1C1C1C]/10 dark:border-stone-800 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onOpenAlertForAsset(item.alertKey)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-sm border border-[#1C1C1C]/20 dark:border-stone-700 bg-[#F9F8F6] hover:bg-[#1C1C1C] text-[#1C1C1C] hover:text-white dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-emerald-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Bell className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Set Alert</span>
                </button>

                <div className="flex items-center gap-1.5 shrink-0">
                  {item.supportsCalculator && (
                    <button
                      type="button"
                      onClick={() => onOpenCalculatorWithItem(item.editType, item.key)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-sm border border-[#1C1C1C]/15 dark:border-stone-700 text-[#1C1C1C] dark:text-stone-200 hover:bg-[#1C1C1C]/5 dark:hover:bg-stone-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      title="Open Calculator"
                    >
                      <Calculator className="w-3.5 h-3.5 text-[#004225] dark:text-emerald-400" aria-hidden="true" />
                      <span>Calc</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onEditRate(item.editType, item.key, item.titleMm, item.latestRate)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-sm border border-[#004225]/30 dark:border-emerald-700/60 text-[#004225] dark:text-emerald-400 hover:bg-[#004225] hover:text-white dark:hover:bg-emerald-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    title="Override Rate"
                  >
                    <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Edit</span>
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
