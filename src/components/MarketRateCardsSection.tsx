import React, { useEffect, useState } from 'react';
import { Check, Bell, Sun, Moon, Clock } from 'lucide-react';
import type {
  BankExchangeRate,
  CommodityQuote,
  CurrencyQuote,
  GoldQuote,
  MarketSession,
  PipelineMeta,
  TownshipConsensusAssetSummary,
} from '../types';
import { formatGatheredTimeMm } from '../utils/posterGenerator';
import { calcSpread } from '../utils/quoteHelpers';

export type BenchmarkAlertKey = 'fuel-92' | 'USD' | 'gold-24k';

interface MarketRateCardsSectionProps {
  activeSession: MarketSession;
  goldQuotes: GoldQuote[];
  currencyQuotes: CurrencyQuote[];
  commodityQuotes: CommodityQuote[];
  bankRates: BankExchangeRate[];
  pipelineMeta: PipelineMeta | null;
  townshipConsensusMap?: Map<string, TownshipConsensusAssetSummary>;
  onOpenAlertForAsset: (itemKey: BenchmarkAlertKey) => void;
}

interface BenchmarkCardData {
  id: BenchmarkAlertKey;
  kicker: string;
  titleMm: string;
  titleEn: string;
  description: string;
  priceDisplay: string;
  unitLabel: string;
  officialRateDisplay: string;
  officialSourceLabel: string;
  spreadAmountDisplay: string;
  spreadPercent: number;
  deltaDisplay: string;
  deltaDirection: 'up' | 'down' | 'unchanged';
  isMostPopular: boolean;
  ctaLabel: string;
  deliverables: string[];
}

export const MarketRateCardsSection: React.FC<MarketRateCardsSectionProps> = ({
  activeSession,
  goldQuotes,
  currencyQuotes,
  commodityQuotes,
  bankRates,
  pipelineMeta,
  townshipConsensusMap,
  onOpenAlertForAsset,
}) => {
  const [cardSession, setCardSession] = useState<MarketSession>(activeSession);

  useEffect(() => {
    setCardSession(activeSession);
  }, [activeSession]);

  const gold24k = goldQuotes.find((g) => g.id === 'gold-24k');
  const gold15pe = goldQuotes.find((g) => g.id === 'gold-15pe');
  const worldSpot = goldQuotes.find((g) => g.id === 'gold-world-spot');
  const usd = currencyQuotes.find((c) => c.code === 'USD');
  const fuel92 = commodityQuotes.find((cm) => cm.id === 'fuel-92');
  const fuel95 = commodityQuotes.find((cm) => cm.id === 'fuel-95');
  const diesel = commodityQuotes.find((cm) => cm.id === 'fuel-diesel');

  const sessionLabelMm = cardSession === 'morning' ? 'မနက်ပိုင်း' : 'ညနေပိုင်း';
  const gatheredTimeLabel = formatGatheredTimeMm(pipelineMeta?.lastSyncedAt);

  const resolveSessionPrice = (
    current: number,
    morning: number,
    evening: number,
    fallback: number
  ): number => {
    if (cardSession === activeSession && current > 0) return current;
    const target = cardSession === 'morning' ? morning : evening;
    return target > 0 ? target : current || fallback;
  };

  // 1. Octane 92 Fuel
  const fuelPrice = resolveSessionPrice(
    fuel92?.openMarketRate ?? 0,
    fuel92?.morningRate ?? 0,
    fuel92?.eveningRate ?? 0,
    3322
  );
  const fuelOfficial = fuel92?.officialRefRate || 3045;
  const fuelSpread = calcSpread(fuelPrice, fuelOfficial);
  const fuelDelta = fuel92?.delta ?? 0;
  const fuelDir = fuel92?.deltaDirection ?? 'unchanged';
  const fuel95Rate = resolveSessionPrice(
    fuel95?.openMarketRate ?? 0,
    fuel95?.morningRate ?? 0,
    fuel95?.eveningRate ?? 0,
    3425
  );
  const dieselRate = resolveSessionPrice(
    diesel?.openMarketRate ?? 0,
    diesel?.morningRate ?? 0,
    diesel?.eveningRate ?? 0,
    2910
  );

  // 2. US Dollar (USD) - Middle Spotlight Card
  const usdSellPrice = resolveSessionPrice(
    usd?.marketSellRate ?? 0,
    usd?.morningRate ?? 0,
    usd?.eveningRate ?? 0,
    5145
  );
  const usdBuySpreadGap = Math.max(0, (usd?.marketSellRate ?? 5145) - (usd?.marketBuyRate ?? 5070));
  const usdBuyPrice = Math.max(0, usdSellPrice - usdBuySpreadGap);
  const usdOfficial = usd?.cbmOfficialRate || 2100;
  const usdOnline = usd?.onlineTradingRate || 3670;
  const usdSpread = calcSpread(usdSellPrice, usdOfficial);
  const usdDelta = usd?.delta ?? 0;
  const usdDir = usd?.deltaDirection ?? 'unchanged';
  const usdBankCount = bankRates.filter((b) => b.currencyCode === 'USD').length;

  // 3. 24K Pure Gold (16-Pe)
  const goldPrice = resolveSessionPrice(
    gold24k?.marketRate ?? 0,
    gold24k?.morningRate ?? 0,
    gold24k?.eveningRate ?? 0,
    10300000
  );
  const goldOfficial = gold24k?.officialRate || 7100000;
  const goldSpread = calcSpread(goldPrice, goldOfficial);
  const goldDelta = gold24k?.delta ?? 0;
  const goldDir = gold24k?.deltaDirection ?? 'unchanged';
  const gold15Price = resolveSessionPrice(
    gold15pe?.marketRate ?? 0,
    gold15pe?.morningRate ?? 0,
    gold15pe?.eveningRate ?? 0,
    9656000
  );

  const formatDeltaText = (delta: number, dir: 'up' | 'down' | 'unchanged') => {
    if (dir === 'unchanged' || delta === 0) return '0 Ks (Stable)';
    const sign = dir === 'up' ? '+' : '-';
    return `${sign}${Math.abs(delta).toLocaleString()} Ks`;
  };

  const cards: BenchmarkCardData[] = [
    {
      id: 'fuel-92',
      kicker: 'Energy Benchmark',
      titleMm: 'ဓာတ်ဆီ (Octane 92)',
      titleEn: 'Retail Fuel (Octane 92)',
      description: 'Yangon retail station average against PPRD reference cap',
      priceDisplay: fuelPrice.toLocaleString(),
      unitLabel: 'Ks / Litre',
      officialRateDisplay: fuelOfficial.toLocaleString(),
      officialSourceLabel: 'PPRD Official Ref',
      spreadAmountDisplay: `${fuelSpread.spreadAmount >= 0 ? '+' : ''}${Math.round(fuelSpread.spreadAmount).toLocaleString()} Ks`,
      spreadPercent: fuelSpread.spreadPercent,
      deltaDisplay: formatDeltaText(fuelDelta, fuelDir),
      deltaDirection: fuelDir,
      isMostPopular: false,
      ctaLabel: 'Set Fuel Price Alert',
      deliverables: [
        `PPRD Official Ref: ${fuelOfficial.toLocaleString()} Ks/L`,
        `Open Market Gap: ${fuelSpread.spreadPercent >= 0 ? '+' : ''}${fuelSpread.spreadPercent}% (+${Math.round(fuelSpread.spreadAmount).toLocaleString()} Ks)`,
        `Octane 95 Rate: ${fuel95Rate.toLocaleString()} Ks/L`,
        `Standard Diesel: ${dieselRate.toLocaleString()} Ks/L`,
        `Source: Google Search Grounding & PPRD (${sessionLabelMm})`,
      ],
    },
    {
      id: 'USD',
      kicker: 'FX Benchmark',
      titleMm: 'အမေရိကန် ဒေါ်လာ (USD)',
      titleEn: 'US Dollar (Street)',
      description: 'Street cash sell rate cross-checked with CBM & commercial banks',
      priceDisplay: usdSellPrice.toLocaleString(),
      unitLabel: 'Ks / 1 USD',
      officialRateDisplay: usdOfficial.toLocaleString(),
      officialSourceLabel: `CBM Peg (Online ${usdOnline.toLocaleString()})`,
      spreadAmountDisplay: `${usdSpread.spreadAmount >= 0 ? '+' : ''}${Math.round(usdSpread.spreadAmount).toLocaleString()} Ks`,
      spreadPercent: usdSpread.spreadPercent,
      deltaDisplay: formatDeltaText(usdDelta, usdDir),
      deltaDirection: usdDir,
      isMostPopular: true,
      ctaLabel: 'Set USD Price Alert',
      deliverables: [
        `Street Buy / Sell: ${usdBuyPrice.toLocaleString()} / ${usdSellPrice.toLocaleString()} Ks`,
        `CBM Official Peg: ${usdOfficial.toLocaleString()} Ks (+${usdSpread.spreadPercent}%)`,
        `Bank Online Trading: ${usdOnline.toLocaleString()} Ks`,
        pipelineMeta?.workerRemittanceUsd
          ? `Remittance (WR) Rate: ${pipelineMeta.workerRemittanceUsd.toLocaleString()} Ks`
          : `Live Bank Channels: ${usdBankCount || 3} Banks (CB, AYA, MCB)`,
        `Session Snapshot: ${sessionLabelMm} · ${gatheredTimeLabel}`,
      ],
    },
    {
      id: 'gold-24k',
      kicker: 'Bullion Benchmark',
      titleMm: 'အခေါက်ရွှေ ၁၆ ပဲရည်',
      titleEn: 'Gold (16-Pe 24K)',
      description: 'Trusted Yangon gold house spot rate per Kyattha (16.329g)',
      priceDisplay: goldPrice.toLocaleString(),
      unitLabel: 'Ks / 1 Kyattha',
      officialRateDisplay: goldOfficial.toLocaleString(),
      officialSourceLabel: 'YGEA Reference',
      spreadAmountDisplay: `${goldSpread.spreadAmount >= 0 ? '+' : ''}${Math.round(goldSpread.spreadAmount).toLocaleString()} Ks`,
      spreadPercent: goldSpread.spreadPercent,
      deltaDisplay: formatDeltaText(goldDelta, goldDir),
      deltaDirection: goldDir,
      isMostPopular: false,
      ctaLabel: 'Set Gold Price Alert',
      deliverables: [
        `YGEA Reference: ${goldOfficial.toLocaleString()} Ks`,
        `Market Spread: ${goldSpread.spreadPercent >= 0 ? '+' : ''}${goldSpread.spreadPercent}% (+${Math.round(goldSpread.spreadAmount).toLocaleString()} Ks)`,
        `15-Pe Jewelry Rate: ${gold15Price.toLocaleString()} Ks`,
        `World Spot (XAU): $${(worldSpot?.marketRate || pipelineMeta?.xauUsdSpot || 3770).toLocaleString()}/oz${
          pipelineMeta?.validation?.impliedXauParityMmk
            ? ` · Parity ~${pipelineMeta.validation.impliedXauParityMmk.toLocaleString()} Ks (${pipelineMeta.validation.parityStatus})`
            : ''
        }`,
        `Source: ${pipelineMeta?.trustedGoldAnchorShop || 'Multi-Source Median · Bullion Market'}`,
      ],
    },
  ];

  const getConsensusForCard = (cardId: BenchmarkAlertKey): TownshipConsensusAssetSummary | undefined => {
    const prefix = cardId === 'gold-24k' ? 'gold' : cardId === 'USD' ? 'currency' : 'commodity';
    return townshipConsensusMap?.get(`${prefix}:${cardId}`);
  };

  const isEvening = cardSession === 'evening';

  return (
    <section aria-labelledby="benchmark-rate-cards-heading" className="space-y-5">
      {/* Section Header + Morning / Evening Toggle Switch */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="editorial-label text-[#004225] dark:text-emerald-400">
            Live Benchmark Rate Cards
          </div>
          <h2
            id="benchmark-rate-cards-heading"
            className="text-xl sm:text-2xl font-bold text-[#1C1C1C] dark:text-[#F3F2EE] tracking-tight mm-heading"
          >
            အဓိက ဈေးကွက်စံနှုန်းများ
          </h2>
          <p className="text-xs text-[#1C1C1C]/60 dark:text-stone-400 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>Compare Morning &amp; Evening open market benchmarks</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
              <Clock className="w-3 h-3" aria-hidden="true" />
              {gatheredTimeLabel}
            </span>
          </p>
        </div>

        {/* Session Toggle Switch Control */}
        <div className="flex items-center gap-3 self-start md:self-auto shrink-0 bg-white dark:bg-[#191A19] border border-[#1C1C1C]/20 dark:border-stone-700 rounded-sm px-3.5 py-2">
          <button
            type="button"
            onClick={() => setCardSession('morning')}
            className={`inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              !isEvening
                ? 'text-[#1C1C1C] dark:text-white'
                : 'text-[#1C1C1C]/50 dark:text-stone-400 hover:text-[#1C1C1C]'
            }`}
          >
            <Sun className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
            <span>Morning</span>
          </button>

          <button
            type="button"
            role="switch"
            aria-checked={isEvening}
            aria-label="Toggle between Morning and Evening session rates"
            onClick={() => setCardSession((prev) => (prev === 'morning' ? 'evening' : 'morning'))}
            className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#004225] ${
              isEvening ? 'bg-[#004225] dark:bg-emerald-600' : 'bg-[#1C1C1C]/40'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform duration-200 ${
                isEvening ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>

          <button
            type="button"
            onClick={() => setCardSession('evening')}
            className={`inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              isEvening
                ? 'text-[#1C1C1C] dark:text-white'
                : 'text-[#1C1C1C]/50 dark:text-stone-400 hover:text-[#1C1C1C]'
            }`}
          >
            <Moon className="w-3.5 h-3.5 text-[#004225] dark:text-emerald-400" aria-hidden="true" />
            <span>Evening</span>
          </button>
        </div>
      </div>

      {/* 3 Horizontal Broadsheet Rate Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
        {cards.map((card) => {
          const isPopular = card.isMostPopular;

          return (
            <div
              key={card.id}
              className={`group relative flex flex-col justify-between bg-white dark:bg-[#191A19] rounded-sm p-6 transition-all duration-200 ${
                isPopular
                  ? 'border-2 border-[#004225] dark:border-emerald-500 shadow-[0_8px_24px_-12px_rgba(0,66,37,0.22)] md:-translate-y-1'
                  : 'border border-[#1C1C1C]/12 dark:border-stone-800 hover:border-[#004225]/50 dark:hover:border-emerald-500/40'
              }`}
            >
              {/* 'Most Popular' Badge pinned at the top of the middle card */}
              {isPopular && (
                <div className="absolute -top-3 left-6">
                  <span className="inline-flex items-center px-2.5 py-0.5 editorial-label bg-[#004225] text-white dark:bg-emerald-600 rounded-sm whitespace-nowrap">
                    Most Popular
                  </span>
                </div>
              )}

              <div>
                <div className={isPopular ? 'pt-1.5' : ''}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="editorial-label text-[#1C1C1C]/55 dark:text-stone-400">
                      {card.kicker}
                    </span>
                    <span
                      className={`text-[11px] font-mono font-bold tabular-nums shrink-0 ${
                        card.deltaDirection === 'up'
                          ? 'text-[#15803d] dark:text-emerald-400'
                          : card.deltaDirection === 'down'
                          ? 'text-[#b91c1c] dark:text-rose-400'
                          : 'text-[#1C1C1C]/55 dark:text-stone-400'
                      }`}
                    >
                      {card.deltaDisplay}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-[#1C1C1C] dark:text-white mm-heading">
                    {card.titleMm}
                  </h3>
                  <p className="text-xs font-medium text-[#1C1C1C]/60 dark:text-stone-400 mt-0.5">
                    {card.titleEn}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-[#1C1C1C]/65 dark:text-stone-400 min-h-[32px]">
                    {card.description}
                  </p>
                </div>

                {/* Large Bold Dual Price Display: Latest Market + Official Reference */}
                <div className="mt-4 pb-4 border-b border-[#1C1C1C]/12 dark:border-stone-800 space-y-3">
                  <div>
                    <div className="editorial-label text-[#004225] dark:text-emerald-400">
                      Latest Market Rate
                    </div>
                    <div className="mt-1 flex items-baseline gap-2 flex-wrap">
                      <span
                        className={`${
                          isPopular ? 'text-[50.6px]' : 'text-[40.6px]'
                        } font-bold tracking-tight text-[#1C1C1C] dark:text-white font-['Noto_Serif',serif] tabular-nums leading-none`}
                      >
                        {card.priceDisplay}
                      </span>
                      <span className="text-xs font-medium text-[#1C1C1C]/60 dark:text-stone-400 whitespace-nowrap">
                        {card.unitLabel}
                      </span>
                    </div>
                  </div>

                  {/* Official Reference Companion Box */}
                  <div className="p-3 rounded-sm bg-[#F9F8F6] dark:bg-stone-900/90 border border-[#1C1C1C]/12 dark:border-stone-800 flex items-baseline justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="editorial-label text-[#1C1C1C]/60 dark:text-stone-400">
                        Official Price
                      </div>
                      <div className="text-[11px] text-[#1C1C1C]/65 dark:text-stone-400 mt-0.5 truncate">
                        {card.officialSourceLabel}
                      </div>
                    </div>
                    <div className="text-right ml-auto">
                      <div className="text-[20px] font-bold font-['Noto_Serif',serif] tabular-nums text-[#1C1C1C] dark:text-stone-100 leading-tight">
                        {card.officialRateDisplay}{' '}
                        <span className="text-xs font-medium text-[#1C1C1C]/55 dark:text-stone-400">
                          Ks
                        </span>
                      </div>
                      <div
                        className={`text-[11px] font-semibold font-mono tabular-nums mt-0.5 ${
                          card.spreadPercent >= 100
                            ? 'text-[#b91c1c] dark:text-rose-400'
                            : card.spreadPercent >= 30
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-[#15803d] dark:text-emerald-400'
                        }`}
                      >
                        Spread: {card.spreadAmountDisplay} ({card.spreadPercent >= 0 ? '+' : ''}
                        {card.spreadPercent}%)
                      </div>
                    </div>
                  </div>
                </div>

                {/* 5 Key Deliverables Checklist */}
                <ul className="my-5 space-y-2.5" aria-label={`${card.titleEn} deliverables`}>
                  {card.deliverables.map((item, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2.5 text-xs text-[#1C1C1C]/80 dark:text-stone-300"
                    >
                      <span
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm ${
                          isPopular
                            ? 'bg-[#004225] text-white dark:bg-emerald-600'
                            : 'bg-[#004225]/10 text-[#004225] dark:bg-emerald-500/20 dark:text-emerald-400'
                        }`}
                      >
                        <Check className="h-2.5 w-2.5 stroke-[3]" aria-hidden="true" />
                      </span>
                      <span className="leading-snug tabular-nums">{item}</span>
                    </li>
                  ))}
                </ul>

                {(() => {
                  const consensus = getConsensusForCard(card.id);
                  if (!consensus || consensus.reportCount <= 0) return null;
                  const topTownship = consensus.townships[0]?.township || 'Yangon';
                  return (
                    <div className="mb-4 px-3 py-2 rounded-sm bg-[#F9F8F6] dark:bg-stone-900 border border-[#1C1C1C]/10 dark:border-stone-800 text-[11px] font-mono tabular-nums flex items-center justify-between gap-2">
                      <span className="text-[#004225] dark:text-emerald-400 font-semibold truncate">
                        Township ({consensus.reportCount}): {topTownship}
                      </span>
                      <span className="font-bold text-[#1C1C1C] dark:text-white shrink-0">
                        {consensus.medianRate.toLocaleString()} Ks
                      </span>
                    </div>
                  );
                })()}
              </div>

              {/* Full-Width Rectangular Editorial CTA */}
              <button
                type="button"
                onClick={() => onOpenAlertForAsset(card.id)}
                className={`w-full py-2.5 px-4 rounded-sm editorial-label inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
                  isPopular
                    ? 'bg-[#1C1C1C] hover:bg-[#004225] text-[#F9F8F6] dark:bg-emerald-700 dark:hover:bg-emerald-600'
                    : 'bg-[#F9F8F6] hover:bg-[#1C1C1C] text-[#1C1C1C] hover:text-white border border-[#1C1C1C]/25 dark:bg-stone-800 dark:hover:bg-emerald-700 dark:text-stone-100 dark:border-stone-700'
                }`}
              >
                <Bell className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{card.ctaLabel}</span>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
};
