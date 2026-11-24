import React, { useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { GoldQuote, CurrencyQuote, CommodityQuote } from '../types';

interface TickerBarProps {
  goldQuotes: GoldQuote[];
  currencyQuotes: CurrencyQuote[];
  commodityQuotes: CommodityQuote[];
  onSelectCategory: (tab: string) => void;
  isSyncing?: boolean;
}

export const TickerBar: React.FC<TickerBarProps> = ({
  goldQuotes,
  currencyQuotes,
  commodityQuotes,
  onSelectCategory,
  isSyncing = false,
}) => {
  const [isPaused, setIsPaused] = useState<boolean>(false);

  const gold24k = goldQuotes.find((g) => g.id === 'gold-24k');
  const worldGold = goldQuotes.find((g) => g.id === 'gold-world-spot');
  const usd = currencyQuotes.find((c) => c.code === 'USD');
  const thb = currencyQuotes.find((c) => c.code === 'THB');
  const eur = currencyQuotes.find((c) => c.code === 'EUR');
  const sgd = currencyQuotes.find((c) => c.code === 'SGD');
  const fuel92 = commodityQuotes.find((cm) => cm.id === 'fuel-92');
  const palmOil = commodityQuotes.find((cm) => cm.id === 'oil-palm');
  const shweboRice = commodityQuotes.find((cm) => cm.id === 'rice-shwebo');

  const items = [
    {
      id: 'gold-24k',
      label: '24K Gold',
      mm: '၁၆ ပဲရည်',
      value: gold24k ? gold24k.marketRate.toLocaleString() : '—',
      unit: 'Ks',
      spread: gold24k ? `+${gold24k.spreadPercent.toFixed(1)}% YGEA` : '',
      delta: gold24k?.delta || 0,
      direction: gold24k?.deltaDirection || 'unchanged',
      tab: 'gold',
    },
    {
      id: 'gold-world-spot',
      label: 'XAU/USD',
      mm: 'ကမ္ဘာ့ရွှေ',
      value: worldGold ? `$${worldGold.marketRate.toLocaleString()}` : '—',
      unit: '/oz',
      spread: 'Spot',
      delta: worldGold?.delta || 0,
      direction: worldGold?.deltaDirection || 'unchanged',
      tab: 'gold',
    },
    {
      id: 'usd',
      label: 'USD/MMK',
      mm: 'ဒေါ်လာ',
      value: usd ? usd.marketSellRate.toLocaleString() : '—',
      unit: 'Ks',
      spread: usd ? `CBM ${usd.cbmOfficialRate.toLocaleString()}` : '',
      delta: usd?.delta || 0,
      direction: usd?.deltaDirection || 'unchanged',
      tab: 'forex',
    },
    {
      id: 'thb',
      label: 'THB/MMK',
      mm: 'ဘတ်',
      value: thb ? thb.marketSellRate.toFixed(1) : '—',
      unit: 'Ks',
      spread: thb ? `Online ${thb.onlineTradingRate}` : '',
      delta: thb?.delta || 0,
      direction: thb?.deltaDirection || 'unchanged',
      tab: 'forex',
    },
    {
      id: 'sgd',
      label: 'SGD/MMK',
      mm: 'စင်ကာပူ',
      value: sgd ? sgd.marketSellRate.toLocaleString() : '—',
      unit: 'Ks',
      spread: sgd ? `CBM ${sgd.cbmOfficialRate.toLocaleString()}` : '',
      delta: sgd?.delta || 0,
      direction: sgd?.deltaDirection || 'unchanged',
      tab: 'forex',
    },
    {
      id: 'eur',
      label: 'EUR/MMK',
      mm: 'ယူရို',
      value: eur ? eur.marketSellRate.toLocaleString() : '—',
      unit: 'Ks',
      spread: eur ? `CBM ${eur.cbmOfficialRate.toLocaleString()}` : '',
      delta: eur?.delta || 0,
      direction: eur?.deltaDirection || 'unchanged',
      tab: 'forex',
    },
    {
      id: 'fuel-92',
      label: 'Octane 92',
      mm: 'ဓာတ်ဆီ',
      value: fuel92 ? fuel92.openMarketRate.toLocaleString() : '—',
      unit: 'Ks/L',
      spread: fuel92 ? `PPRD ${fuel92.officialRefRate.toLocaleString()}` : '',
      delta: fuel92?.delta || 0,
      direction: fuel92?.deltaDirection || 'unchanged',
      tab: 'commodities',
    },
    {
      id: 'oil-palm',
      label: 'Palm Oil',
      mm: 'စားအုန်းဆီ',
      value: palmOil ? palmOil.openMarketRate.toLocaleString() : '—',
      unit: 'Ks',
      spread: palmOil ? `DOCA ${palmOil.officialRefRate.toLocaleString()}` : '',
      delta: palmOil?.delta || 0,
      direction: palmOil?.deltaDirection || 'unchanged',
      tab: 'commodities',
    },
    {
      id: 'rice-shwebo',
      label: 'Shwebo Rice',
      mm: 'ရွှေဘိုပေါ်ဆန်း',
      value: shweboRice ? shweboRice.openMarketRate.toLocaleString() : '—',
      unit: 'Ks',
      spread: shweboRice ? `MRF ${shweboRice.officialRefRate.toLocaleString()}` : '',
      delta: shweboRice?.delta || 0,
      direction: shweboRice?.deltaDirection || 'unchanged',
      tab: 'commodities',
    },
  ];

  const renderTrackItems = (copyPrefix: string) =>
    items.map((item) => (
      <button
        key={`${copyPrefix}-${item.id}`}
        type="button"
        onClick={() => onSelectCategory(item.tab)}
        className="group inline-flex items-center gap-2.5 px-3.5 py-1 hover:bg-[#F9F8F6] dark:hover:bg-stone-800/70 transition-colors text-left cursor-pointer shrink-0 whitespace-nowrap"
      >
        <span className="text-[13px] font-bold text-[#1C1C1C] dark:text-stone-100 group-hover:text-[#004225] dark:group-hover:text-emerald-400 transition-colors">
          {item.label}
        </span>
        <span className="text-[11px] text-[#1C1C1C]/55 dark:text-stone-400 mm-text">
          {item.mm}
        </span>

        <span className="text-[13px] font-bold num-tabular text-[#15803d] dark:text-emerald-400">
          {item.value} {item.unit}
        </span>

        {item.direction === 'up' && (
          <span className="text-[11px] font-semibold num-tabular text-[#15803d] dark:text-emerald-400">
            ▲+{item.delta.toLocaleString()}
          </span>
        )}
        {item.direction === 'down' && (
          <span className="text-[11px] font-semibold num-tabular text-[#b91c1c] dark:text-rose-400">
            ▼-{item.delta.toLocaleString()}
          </span>
        )}

        {item.spread && (
          <span className="text-[11px] num-tabular text-[#1C1C1C]/55 dark:text-stone-400">
            · {item.spread}
          </span>
        )}

        <span aria-hidden="true" className="text-[#1C1C1C]/20 dark:text-stone-700 pl-2">
          |
        </span>
      </button>
    ));

  return (
    <div
      className="border-b border-[#1C1C1C]/12 dark:border-stone-800 bg-white dark:bg-[#181918] transition-colors"
      aria-label="Live market marquee prices"
    >
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-10 min-h-11 py-1.5 flex items-center gap-3 text-xs">
        {/* Anchored Ticker Label & Pause/Play */}
        <div className="flex items-center gap-2 shrink-0 pr-3 border-r border-[#1C1C1C]/15 dark:border-stone-800">
          <span className="editorial-label text-[#004225] dark:text-emerald-400 flex items-center gap-1.5 whitespace-nowrap">
            {isSyncing ? (
              <span className="inline-flex items-end gap-0.5 h-3 w-3" aria-label="Syncing prices">
                <span className="w-0.5 h-2.5 bg-[#004225] dark:bg-emerald-400 rounded-full animate-ios-wave" />
                <span className="w-0.5 h-3 bg-[#004225] dark:bg-emerald-400 rounded-full animate-ios-wave [animation-delay:150ms]" />
                <span className="w-0.5 h-2 bg-[#004225] dark:bg-emerald-400 rounded-full animate-ios-wave [animation-delay:300ms]" />
              </span>
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-[#15803d] dark:bg-emerald-400" />
            )}
            <span>{isSyncing ? 'Syncing' : 'Ticker'}</span>
          </span>

          <button
            type="button"
            onClick={() => setIsPaused((prev) => !prev)}
            className="p-1 rounded-sm text-[#1C1C1C]/65 dark:text-stone-400 hover:text-[#1C1C1C] dark:hover:text-white hover:bg-[#F9F8F6] dark:hover:bg-stone-800 transition-colors cursor-pointer"
            title={isPaused ? 'Resume price tape' : 'Pause price tape'}
            aria-label={isPaused ? 'Resume price marquee' : 'Pause price marquee'}
          >
            {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
          </button>
        </div>

        {/* Seamless Ticker Track */}
        <div className="marquee-wrapper flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-16px),transparent)]">
          <div className={`animate-marquee items-center ${isPaused ? 'marquee-paused' : ''}`}>
            <div className="flex items-center">{renderTrackItems('a')}</div>
            <div className="flex items-center" aria-hidden="true">
              {renderTrackItems('b')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
