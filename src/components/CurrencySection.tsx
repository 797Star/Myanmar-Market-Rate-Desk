import React, { useState } from 'react';
import {
  ArrowRightLeft,
  DollarSign,
  ExternalLink,
  Building2,
  Radio,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Search,
} from 'lucide-react';
import { BankExchangeRate, CurrencyQuote, DataSourceStatus, PipelineMeta } from '../types';
import { formatGatheredTimeMm } from '../utils/posterGenerator';

interface CurrencySectionProps {
  currencyQuotes: CurrencyQuote[];
  bankRates?: BankExchangeRate[];
  dataSources?: DataSourceStatus[];
  pipelineMeta?: PipelineMeta | null;
  isStreetSyncing?: boolean;
  isSearchGrounding?: boolean;
  onRunStreetFxSync?: (streetUsd?: number) => void;
  onRunSearchGrounding?: () => void;
  onOpenCalculator: () => void;
  onEditRate: (type: string, id: string, name: string, currentRate: number) => void;
}

export const CurrencySection: React.FC<CurrencySectionProps> = ({
  currencyQuotes,
  bankRates = [],
  dataSources = [],
  pipelineMeta,
  isStreetSyncing = false,
  isSearchGrounding = false,
  onRunStreetFxSync,
  onRunSearchGrounding,
  onOpenCalculator,
  onEditRate,
}) => {
  // Quick converter state
  const [amount, setAmount] = useState<number>(100);
  const [selectedCurrency, setSelectedCurrency] = useState<string>('USD');
  const [exchangeMode, setExchangeMode] = useState<'foreignToMmk' | 'mmkToForeign'>('foreignToMmk');
  const [bankFilter, setBankFilter] = useState<string>('all');
  const [showMethodology, setShowMethodology] = useState<boolean>(false);

  const usdQuote = currencyQuotes.find((c) => c.code === 'USD');
  const [streetUsdInput, setStreetUsdInput] = useState<string>(
    String(usdQuote?.marketSellRate || 5145)
  );

  React.useEffect(() => {
    if (usdQuote?.marketSellRate) {
      setStreetUsdInput(String(usdQuote.marketSellRate));
    }
  }, [usdQuote?.marketSellRate]);

  const activeQuote = currencyQuotes.find((c) => c.code === selectedCurrency) || currencyQuotes[0];
  const filteredBankRates =
    bankFilter === 'all' ? bankRates : bankRates.filter((row) => row.bankId === bankFilter);

  const handleApplyStreetUsd = (e: React.FormEvent) => {
    e.preventDefault();
    const numeric = Number(streetUsdInput.replace(/,/g, '').trim());
    if (!onRunStreetFxSync || !Number.isFinite(numeric) || numeric < 2000 || numeric > 12000) {
      return;
    }
    onRunStreetFxSync(Math.round(numeric));
  };

  // Calculation
  const marketRate = activeQuote.marketSellRate;
  const officialRate = activeQuote.cbmOfficialRate;

  let convertedMarket = 0;
  let convertedOfficial = 0;

  if (exchangeMode === 'foreignToMmk') {
    convertedMarket = Math.round(amount * marketRate);
    convertedOfficial = Math.round(amount * officialRate);
  } else {
    convertedMarket = Number((amount / marketRate).toFixed(2));
    convertedOfficial = Number((amount / officialRate).toFixed(2));
  }

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[20px] sm:text-[22px] font-semibold text-slate-950 dark:text-white flex items-center gap-2 mm-heading">
            <DollarSign className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0" />
            <span>နိုင်ငံခြားငွေလဲလှယ်နှုန်းများ</span>
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 mm-text">
            Foreign Exchange Rates · Google Search Grounding (မြေပြင်ရောင်းဝယ်ဈေး) နှင့် ဗဟိုဘဏ် (CBM)၊ Online Trading၊ Remittance (WR) နှုန်းများ
          </p>
          {pipelineMeta?.searchGrounding?.grounded && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600 dark:text-slate-400 num-tabular">
              <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
                <Search className="w-3.5 h-3.5 shrink-0" />
                <span>Google Search Grounding ({pipelineMeta.searchGrounding.sources.length} sources)</span>
              </span>
              {typeof pipelineMeta.searchGrounding.latencyMs === 'number' && (
                <>
                  <span>·</span>
                  <span>{pipelineMeta.searchGrounding.latencyMs}ms</span>
                </>
              )}
              <span>·</span>
              <span>Updated {formatGatheredTimeMm(pipelineMeta.searchGrounding.lastSearchedAt)}</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
          {onRunSearchGrounding && (
            <button
              type="button"
              onClick={onRunSearchGrounding}
              disabled={isSearchGrounding || isStreetSyncing}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold text-white bg-[#004225] hover:bg-[#00311b] dark:bg-emerald-700 dark:hover:bg-emerald-600 rounded-sm transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap shrink-0 mm-text focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            >
              <Search className={`w-4 h-4 ${isSearchGrounding ? 'animate-pulse' : ''}`} />
              <span>{isSearchGrounding ? 'Google ဖြင့် ရှာဖွေနေသည်...' : 'Google Search On-Ground'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenCalculator}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold text-white bg-[#1C1C1C] dark:bg-emerald-700 hover:bg-[#004225] dark:hover:bg-emerald-600 rounded-sm transition-colors cursor-pointer whitespace-nowrap shrink-0 mm-text focus:outline-none focus-visible:ring-2 focus-visible:ring-[#004225]"
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>ငွေလဲတွက်ချက်စက် အပြည့်အစုံ</span>
          </button>
        </div>
      </div>

      {/* Google Search Grounded FX Verification Strip */}
      {pipelineMeta?.searchGrounding?.grounded && pipelineMeta.searchGrounding.sources.length > 0 && (
        <div className="bg-white dark:bg-[#191A19] border border-[#004225]/25 dark:border-emerald-700/40 rounded-sm px-4 py-3 text-xs space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 font-semibold text-[#004225] dark:text-emerald-400">
              <Search className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Google Search Grounded On-Ground FX Verification</span>
            </span>
            <span className="font-mono tabular-nums text-[#1C1C1C]/65 dark:text-stone-400">
              {formatGatheredTimeMm(pipelineMeta.searchGrounding.lastSearchedAt)}
            </span>
          </div>
          {pipelineMeta.searchGrounding.onGroundSummaryMm && (
            <p className="text-[#1C1C1C]/75 dark:text-stone-300 mm-text">
              {pipelineMeta.searchGrounding.onGroundSummaryMm}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {pipelineMeta.searchGrounding.sources.slice(0, 6).map((src, idx) => (
              <a
                key={`${src.uri}_${idx}`}
                href={src.uri}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-[#004225] dark:text-emerald-400 hover:underline max-w-[220px] truncate"
              >
                <span className="truncate">{src.title}</span>
                <ExternalLink className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Street USD Quick Cross-Rate Sync Bar */}
      {onRunStreetFxSync && (
        <form
          onSubmit={handleApplyStreetUsd}
          className="bg-white dark:bg-[#191A19] border border-[#1C1C1C]/15 dark:border-stone-800 rounded-sm px-4 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3"
        >
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-[#1C1C1C] dark:text-[#F3F2EE] mm-text">
              ပြင်ပ USD နှုန်း ချိန်ညှိရန် (Street USD Cross-Rate Sync)
            </div>
            <p className="text-xs text-[#1C1C1C]/65 dark:text-stone-400 mt-0.5 mm-text">
              လက်တွေ့မြေပြင် USD ဈေး (ဥပမာ 5,145 Ks) ကို ထည့်သွင်းပါက THB, EUR, SGD, MYR, CNY ဈေးများကိုပါ တိုက်ရိုက် Cross-Rate တွက်ချက်ပြောင်းလဲပေးပါမည်။
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <label htmlFor="street-usd-input" className="text-xs font-medium text-[#1C1C1C]/75 dark:text-stone-300 whitespace-nowrap">
              1 USD =
            </label>
            <input
              id="street-usd-input"
              type="number"
              min={2000}
              max={12000}
              step={1}
              value={streetUsdInput}
              onChange={(e) => setStreetUsdInput(e.target.value)}
              className="w-28 px-3 py-1.5 text-sm font-semibold num-tabular bg-[#F9F8F6] dark:bg-stone-900 border border-[#1C1C1C]/20 dark:border-stone-700 rounded-sm text-[#1C1C1C] dark:text-white focus:outline-none focus:border-[#004225] dark:focus:border-emerald-500"
            />
            <span className="text-xs text-[#1C1C1C]/60 dark:text-stone-400">Ks</span>
            <button
              type="submit"
              disabled={isStreetSyncing}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-[#004225] hover:bg-[#00311b] dark:bg-emerald-700 dark:hover:bg-emerald-600 rounded-sm transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              {isStreetSyncing ? 'Syncing...' : 'Cross-Rate Sync'}
            </button>
          </div>
        </form>
      )}

      {/* Currency Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {currencyQuotes.map((c) => {
          const officialUrl = c.sourceOfficialUrl || 'https://forex.cbm.gov.mm/';
          const marketUrl =
            c.sourceMarketUrl ||
            'https://www.ayabank.com/personal-banking/other-services/foreign-currency-exchange-service';

          return (
            <div
              key={c.code}
              className="min-w-0 bg-white dark:bg-[#191A19] border border-[#1C1C1C]/15 dark:border-stone-800 hover:border-[#004225]/50 dark:hover:border-emerald-500/40 rounded-sm p-5 flex flex-col justify-between transition-colors"
            >
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-2xl shrink-0" role="img" aria-label={c.nameEn}>
                      {c.flag}
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-[15px] font-bold text-[#1C1C1C] dark:text-[#F3F2EE] mm-text">
                        {c.nameMm}
                      </h3>
                      <div className="text-xs text-[#1C1C1C]/60 dark:text-stone-400 en-sub truncate">
                        {c.code} · {c.nameEn}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`text-xs num-tabular font-bold shrink-0 ${
                      c.spreadPercent >= 100
                        ? 'text-[#b91c1c] dark:text-rose-400'
                        : 'text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    +{c.spreadPercent.toFixed(1)}% spread
                  </span>
                </div>

                {/* Rates Table within card */}
                <div className="space-y-2.5 text-[13px]">
                  {/* Market Rates */}
                  <div className="p-3.5 bg-[#F9F8F6] dark:bg-stone-900/90 rounded-sm border border-[#1C1C1C]/12 dark:border-stone-800">
                    <div className="editorial-label text-[#004225] dark:text-emerald-400">
                      ပြင်ပ Street / Facebook ဈေး (ရောင်း / ဝယ်)
                    </div>
                    <div className="flex items-baseline justify-between gap-2 flex-wrap mt-1.5">
                      <span className="num-tabular text-[22px] font-bold text-[#1C1C1C] dark:text-white leading-tight">
                        {c.marketSellRate.toLocaleString()}
                        <span className="text-[0.6em] font-medium text-[#1C1C1C]/60 dark:text-stone-400 ml-1">Ks</span>
                      </span>
                      <span className="num-tabular text-xs text-[#1C1C1C]/75 dark:text-stone-300 text-right ml-auto">
                        ဝယ် {c.marketBuyRate.toLocaleString()} Ks
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      {c.deltaDirection === 'up' && (
                        <span className="text-xs num-tabular font-semibold text-[#15803d] dark:text-emerald-400">
                          ▲ +{c.delta} Ks (+{c.deltaPercent}%)
                        </span>
                      )}
                      {c.deltaDirection === 'down' && (
                        <span className="text-xs num-tabular font-semibold text-[#b91c1c] dark:text-rose-400">
                          ▼ -{c.delta} Ks (-{c.deltaPercent}%)
                        </span>
                      )}
                      {c.deltaDirection === 'unchanged' && (
                        <span className="text-xs text-[#1C1C1C]/60 dark:text-stone-400 num-tabular">— 0% (တည်ငြိမ်နေ)</span>
                      )}
                    </div>
                  </div>

                  {/* Official, Online Trading & Bank WR Platform */}
                  <div className="space-y-1.5 px-1 pt-1">
                    <div className="flex items-baseline justify-between gap-2 flex-wrap text-slate-600 dark:text-slate-400">
                      <span className="mm-text">တရားဝင် CBM:</span>
                      <span className="num-tabular font-semibold text-slate-950 dark:text-slate-200 text-right ml-auto">
                        {c.cbmOfficialRate.toLocaleString()} <span className="text-[0.75em] text-slate-500">Ks</span>
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-2 flex-wrap text-slate-600 dark:text-slate-400">
                      <span className="en-sub">Online Trading:</span>
                      <span className="num-tabular font-semibold text-blue-700 dark:text-blue-400 text-right ml-auto">
                        ~{c.onlineTradingRate.toLocaleString()} <span className="text-[0.75em] text-slate-500">Ks</span>
                      </span>
                    </div>
                    {typeof c.workerRemittanceRate === 'number' && c.workerRemittanceRate > 0 && (
                      <div className="flex items-baseline justify-between gap-2 flex-wrap text-slate-600 dark:text-slate-400">
                        <span className="en-sub">Bank Remittance (WR):</span>
                        <span className="num-tabular font-semibold text-emerald-700 dark:text-emerald-400 text-right ml-auto">
                          {c.workerRemittanceRate.toLocaleString()} <span className="text-[0.75em] text-slate-500">Ks</span>
                        </span>
                      </div>
                    )}
                    <div className="flex items-baseline justify-between gap-2 flex-wrap text-slate-600 dark:text-slate-400">
                      <span className="mm-text">မနက် / ညနေ:</span>
                      <span className="num-tabular text-slate-800 dark:text-slate-300 text-right ml-auto">
                        {c.morningRate.toLocaleString()} / {c.eveningRate.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {(c.rateMethodologyMm || c.noteMm) && (
                    <p className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-lg mm-text leading-relaxed">
                      {c.rateMethodologyMm || c.noteMm}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-xs text-slate-600 dark:text-slate-400 truncate min-w-0 flex-1 mm-text"
                    title={c.sourceMarket}
                  >
                    {c.sourceMarket}
                  </span>
                  <button
                    type="button"
                    onClick={() => onEditRate('currency', c.code, c.nameMm, c.marketSellRate)}
                    className="text-xs font-semibold text-blue-700 dark:text-amber-400 hover:underline cursor-pointer shrink-0 whitespace-nowrap mm-text"
                  >
                    ဈေးပြင်ဆင်ရန်
                  </button>
                </div>

                {/* Direct Source Verification Links */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                  <a
                    href={officialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-400 hover:underline"
                  >
                    <span>Verify Official (CBM)</span>
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  </a>
                  <span aria-hidden="true">·</span>
                  <a
                    href={marketUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
                  >
                    <span>Verify Market / Bank</span>
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  </a>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Live Commercial Banks, CSO Exchange Survey, Starfish & Global FX Pipeline Table */}
      {bankRates.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl overflow-hidden shadow-[0_2px_10px_rgba(0,0,0,0.03)]">
          <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center text-emerald-700 dark:text-emerald-400 shrink-0">
                <Building2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-950 dark:text-white mm-heading">
                  ပြည်တွင်းဘဏ်များ၊ CBM နှင့် Google Search မြေပြင် FX နှုန်းထားများ
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 mm-text">
                  Google Search Grounding မှ စုစည်းရရှိသော မြေပြင်ရောင်းဝယ်ဈေး၊ CB Bank, AYA Bank, MCB နှင့် CBM နှုန်းထားများ
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700 self-start lg:self-auto">
              {[
                { id: 'all', label: 'အားလုံး' },
                { id: 'global_fx', label: 'Street On-Ground' },
                { id: 'aya_bank', label: 'AYA Bank' },
                { id: 'cb_bank', label: 'CB Bank' },
                { id: 'mcb_bank', label: 'MCB' },
                { id: 'cbm', label: 'CBM Peg' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setBankFilter(opt.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-all cursor-pointer whitespace-nowrap active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                    bankFilter === opt.id
                      ? 'bg-white dark:bg-slate-900 text-slate-950 dark:text-white shadow-xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-[13px] border-collapse">
              <thead>
                <tr className="bg-slate-50/90 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-semibold">
                  <th className="py-3 px-4 mm-text">ဘဏ် / အရင်းအမြစ်</th>
                  <th className="py-3 px-4 mm-text">နှုန်းထားအမျိုးအစား</th>
                  <th className="py-3 px-4 mm-text">ငွေကြေး</th>
                  <th className="py-3 px-4 text-right mm-text">ဝယ်ဈေး (Buy)</th>
                  <th className="py-3 px-4 text-right mm-text">ရောင်းဈေး (Sell)</th>
                  <th className="py-3 px-4 mm-text">အချိန်မှတ်တမ်း</th>
                  <th className="py-3 px-4 text-right mm-text">မူရင်းလင့်ခ်</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredBankRates.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-4 font-medium text-slate-950 dark:text-slate-100">
                      <div className="mm-text">{row.bankNameMm}</div>
                      <div className="text-xs text-slate-600 dark:text-slate-400 en-sub">{row.bankNameEn}</div>
                    </td>
                    <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300 mm-text">
                      {row.categoryLabelMm}
                    </td>
                    <td className="py-2.5 px-4 num-tabular font-bold text-slate-950 dark:text-white">
                      {row.currencyCode}
                    </td>
                    <td className="py-2.5 px-4 text-right num-tabular text-slate-950 dark:text-white font-semibold">
                      {row.buyRate !== null ? (
                        <>
                          {row.buyRate.toLocaleString()}
                          <span className="text-[60%] font-medium text-slate-500 dark:text-slate-400 ml-1">Ks</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right num-tabular text-slate-950 dark:text-white font-semibold">
                      {row.sellRate !== null ? (
                        <>
                          {row.sellRate.toLocaleString()}
                          <span className="text-[60%] font-medium text-slate-500 dark:text-slate-400 ml-1">Ks</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-600 dark:text-slate-400 num-tabular whitespace-nowrap">
                      {row.updatedLabel}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <a
                        href={row.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                      >
                        <span>စစ်ဆေးရန်</span>
                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {dataSources.length > 0 && (
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <span className="inline-flex items-center gap-1 font-semibold text-slate-800 dark:text-slate-200">
                  <Radio className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  Live Feeds ({pipelineMeta?.liveSourcesCount ?? 0}/{pipelineMeta?.totalSourcesCount ?? dataSources.length}):
                </span>
                {dataSources.map((src) => (
                  <a
                    key={src.id}
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`${src.noteMm} — Click to verify source`}
                    className="inline-flex items-center gap-1.5 num-tabular hover:text-blue-700 dark:hover:text-blue-400 hover:underline"
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        src.status === 'live' ? 'bg-emerald-500' : 'bg-amber-500'
                      }`}
                    />
                    <span className="text-slate-800 dark:text-slate-300">{src.nameEn}</span>
                    {typeof src.latencyMs === 'number' && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">({src.latencyMs}ms)</span>
                    )}
                    <ExternalLink className="w-2.5 h-2.5 text-slate-400" aria-hidden="true" />
                  </a>
                ))}
              </div>
              {pipelineMeta?.lastSyncedAt && (
                <span className="num-tabular text-xs text-slate-600 dark:text-slate-400">
                  Gathered {formatGatheredTimeMm(pipelineMeta.lastSyncedAt)}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* How FX Rates Are Gathered & Source Verification Guide */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl overflow-hidden shadow-[0_2px_10px_rgba(0,0,0,0.03)]">
        <button
          type="button"
          onClick={() => setShowMethodology((prev) => !prev)}
          className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <ShieldCheck className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-950 dark:text-white mm-heading">
                ငွေလဲနှုန်း စုစည်းတွက်ချက်ပုံနှင့် မူရင်းလင့်ခ် စစ်ဆေးနည်း (How FX Rates Are Gathered & Verified)
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 mm-text">
                Google Search Grounding (On-Ground Buy/Sell) · CBM တရားဝင်နှုန်း · CB/AYA/MCB ဘဏ်နှုန်း ရှင်းလင်းချက်
              </div>
            </div>
          </div>
          {showMethodology ? (
            <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
          )}
        </button>

        {showMethodology && (
          <div className="px-5 pb-5 pt-2 border-t border-slate-100 dark:border-slate-800 space-y-4 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70 space-y-1.5">
                <div className="font-bold text-slate-950 dark:text-white">
                  1. Google Search Grounded On-Ground FX (မြေပြင် ရောင်း/ဝယ် ဈေး)
                </div>
                <p className="mm-text">
                  Dashboard Refresh နှိပ်တိုင်း Google Search Grounding မှတစ်ဆင့် ရန်ကုန်/မန္တလေး ငွေလဲကောင်တာများနှင့် နယ်စပ် Hundi ဈေးကွက်တွင် လက်တွေ့ရောင်းဝယ်နေသည့် USD, THB, SGD, EUR, MYR, CNY Buy/Sell နှုန်းများကို ရင်းမြစ်လင့်ခ်များနှင့်တကွ စုစည်းပေးပါသည်။
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70 space-y-1.5">
                <div className="font-bold text-slate-950 dark:text-white">
                  2. Official CBM Reference (တရားဝင် ဗဟိုဘဏ်နှုန်း)
                </div>
                <p className="mm-text">
                  ဗဟိုဘဏ် (<code className="px-1 py-0.5 rounded bg-slate-200/70 dark:bg-slate-700">forex.cbm.gov.mm</code>) ၏ USD 2,100 Ks နှင့် နိုင်ငံတကာငွေကြေး ၆ မျိုး ရည်ညွှန်းနှုန်းများကို တိုက်ရိုက်နှိုင်းယှဉ်စစ်ဆေးနိုင်ပါသည်။
                </p>
                <a
                  href="https://forex.cbm.gov.mm/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-blue-700 dark:text-blue-400 hover:underline"
                >
                  <span>forex.cbm.gov.mm တွင် တိုက်ရိုက်စစ်ဆေးရန်</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70 space-y-1.5">
                <div className="font-bold text-slate-950 dark:text-white">
                  3. Commercial Bank Online Trading &amp; Worker Remittance (WR)
                </div>
                <p className="mm-text">
                  AYA Bank, CB Bank, MCB Bank တို့၏ Online Trading နှုန်း (USD ~3,670 Ks) နှင့် Worker Remittance (USD ~4,600 Ks, THB ~136 Ks) နှုန်းထားများကို Google Search မှတစ်ဆင့် စုစည်းထားပါသည်။
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  <a
                    href="https://www.ayabank.com/personal-banking/other-services/foreign-currency-exchange-service"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-blue-700 dark:text-blue-400 hover:underline"
                  >
                    <span>AYA Bank</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <a
                    href="https://www.cbbank.com.mm/en"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-blue-700 dark:text-blue-400 hover:underline"
                  >
                    <span>CB Bank</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <a
                    href="https://mcb.com.mm/business/international-banking/foreign-currency-exchange/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-blue-700 dark:text-blue-400 hover:underline"
                  >
                    <span>MCB</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70 space-y-1.5">
                <div className="font-bold text-slate-950 dark:text-white">
                  4. Street USD Cross-Rate Sync &amp; Source Verification
                </div>
                <p className="mm-text">
                  အပေါ်ပိုင်းရှိ Street USD Input တွင် မိမိစစ်ဆေးတွေ့ရှိသော လက်တွေ့ USD ဈေးကို ထည့်သွင်း၍ THB, EUR, SGD, MYR, CNY ဈေးများကို တပြိုင်နက် Cross-Rate ချိန်ညှိနိုင်ပြီး Google Search ရင်းမြစ်လင့်ခ်များကို တစ်ချက်နှိပ်၍ စစ်ဆေးနိုင်ပါသည်။
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Interactive Currency Converter */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-[0_2px_10px_rgba(0,0,0,0.03)]">
        <h3 className="text-sm font-bold text-slate-950 dark:text-white flex items-center gap-2 mb-3">
          <ArrowRightLeft className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
          <span>နိုင်ငံခြားငွေ နှိုင်းယှဉ်လဲလှယ်မှု တွက်စက် (Quick Currency Spread Calculator)</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          {/* Amount input */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              ပမာဏ (Amount)
            </label>
            <input
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(Math.max(1, parseFloat(e.target.value) || 0))}
              className="w-full px-3 py-2 text-sm num-tabular bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>

          {/* Currency Selector */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              ငွေကြေးရွေးချယ်ရန် (Currency)
            </label>
            <select
              value={selectedCurrency}
              onChange={(e) => setSelectedCurrency(e.target.value)}
              className="w-full px-3 py-2 text-sm font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            >
              {currencyQuotes.map((cq) => (
                <option key={cq.code} value={cq.code}>
                  {cq.flag} {cq.code} - {cq.nameMm}
                </option>
              ))}
            </select>
          </div>

          {/* Direction Toggle */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              လဲလှယ်မှု ဦးတည်ရာ
            </label>
            <div className="grid grid-cols-2 gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/70 dark:border-slate-700">
              <button
                onClick={() => setExchangeMode('foreignToMmk')}
                className={`py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer active:scale-95 ${
                  exchangeMode === 'foreignToMmk'
                    ? 'bg-white dark:bg-slate-900 text-slate-950 dark:text-white shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {selectedCurrency} ➔ MMK
              </button>
              <button
                onClick={() => setExchangeMode('mmkToForeign')}
                className={`py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer active:scale-95 ${
                  exchangeMode === 'mmkToForeign'
                    ? 'bg-white dark:bg-slate-900 text-slate-950 dark:text-white shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                MMK ➔ {selectedCurrency}
              </button>
            </div>
          </div>

          {/* Results Summary Box */}
          <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl p-3">
            <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mm-text">
              ဈေးကွက် / WR ဖြင့် ရရှိမည့်ပမာဏ:
            </div>
            <div className="text-lg font-bold num-tabular text-slate-950 dark:text-white">
              {exchangeMode === 'foreignToMmk'
                ? `${convertedMarket.toLocaleString()} Ks`
                : `${convertedMarket.toLocaleString()} ${selectedCurrency}`}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400 num-tabular">
              (တရားဝင် CBM: {convertedOfficial.toLocaleString()} Ks)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
