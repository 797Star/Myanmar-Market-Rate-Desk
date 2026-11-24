import React, { useState, useEffect } from 'react';
import { X, Calculator, Coins, ArrowRightLeft, Scale } from 'lucide-react';
import { GoldQuote, CurrencyQuote } from '../types';

interface CalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  goldQuotes: GoldQuote[];
  currencyQuotes: CurrencyQuote[];
  initialType?: string;
  initialId?: string;
}

export const CalculatorModal: React.FC<CalculatorModalProps> = ({
  isOpen,
  onClose,
  goldQuotes,
  currencyQuotes,
  initialType = 'gold',
  initialId,
}) => {
  const [activeTab, setActiveTab] = useState<'gold' | 'currency'>('gold');

  // Gold state
  const [goldType, setGoldType] = useState<string>('gold-24k');
  const [kyat, setKyat] = useState<number>(1);
  const [pe, setPe] = useState<number>(0);
  const [yway, setYway] = useState<number>(0);
  const [pricingBasis, setPricingBasis] = useState<'market' | 'official'>('market');

  // Currency state
  const [currencyCode, setCurrencyCode] = useState<string>('USD');
  const [currencyAmount, setCurrencyAmount] = useState<number>(100);
  const [rateType, setRateType] = useState<'market' | 'online' | 'cbm'>('market');

  useEffect(() => {
    if (initialType === 'currency') {
      setActiveTab('currency');
      if (initialId) setCurrencyCode(initialId);
    } else {
      setActiveTab('gold');
      if (initialId) setGoldType(initialId);
    }
  }, [initialType, initialId]);

  if (!isOpen) return null;

  // Gold calculations
  const selectedGold = goldQuotes.find((g) => g.id === goldType) || goldQuotes[0];
  const ratePerKyat = pricingBasis === 'market' ? selectedGold.marketRate : selectedGold.officialRate;
  const totalKyattha = kyat + pe / 16 + yway / 128;
  const goldTotalMmk = Math.round(totalKyattha * ratePerKyat);
  const goldTotalGrams = (totalKyattha * 16.3293).toFixed(3);

  // Currency calculations
  const selectedCurrency = currencyQuotes.find((c) => c.code === currencyCode) || currencyQuotes[0];
  const effectiveRate =
    rateType === 'market'
      ? selectedCurrency.marketSellRate
      : rateType === 'online'
      ? selectedCurrency.onlineTradingRate
      : selectedCurrency.cbmOfficialRate;
  const currencyTotalMmk = Math.round(currencyAmount * effectiveRate);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl overflow-hidden transition-colors">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-950 dark:text-white mm-heading">
                ဈေးကွက် တိုက်ရိုက်တွက်ချက်စက် (Market Calculator)
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mm-text">
                ရွှေနှင့် နိုင်ငံခြားငွေလဲနှုန်းများကို တိုက်ရိုက် အမြန်တွက်ချက်ရန်
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="ပိတ်မည်"
            className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('gold')}
            className={`flex-1 py-3 text-center transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'gold'
                ? 'border-b-2 border-amber-500 text-amber-600 dark:text-amber-400 font-bold bg-amber-500/5'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Coins className="w-4 h-4" />
            <span>ရွှေတွက်ချက်ရန် (Gold)</span>
          </button>
          <button
            onClick={() => setActiveTab('currency')}
            className={`flex-1 py-3 text-center transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'currency'
                ? 'border-b-2 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/5'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>ငွေလဲနှုန်းတွက်ရန် (Currency)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 text-xs overflow-y-auto">
          {activeTab === 'gold' ? (
            <>
              {/* Gold Selection */}
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  ရွှေအမျိုးအစား ရွေးချယ်ရန်:
                </label>
                <select
                  value={goldType}
                  onChange={(e) => setGoldType(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                >
                  {goldQuotes.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.nameMm} ({g.purity})
                    </option>
                  ))}
                </select>
              </div>

              {/* Pricing Basis Toggle */}
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1 mm-text">
                  အခြေခံတွက်ချက်မည့် ဈေးနှုန်း:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPricingBasis('market')}
                    className={`py-2 px-2.5 text-center rounded-lg border cursor-pointer font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                      pricingBasis === 'market'
                        ? 'border-amber-500 bg-amber-500/10 text-amber-800 dark:text-amber-300 font-bold'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    ပြင်ပဈေးကွက် ({selectedGold.marketRate.toLocaleString()} Ks)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPricingBasis('official')}
                    className={`py-2 px-2.5 text-center rounded-lg border cursor-pointer font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                      pricingBasis === 'official'
                        ? 'border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300 font-bold'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    တရားဝင် ရည်ညွှန်းနှုန်း ({selectedGold.officialRate.toLocaleString()} Ks)
                  </button>
                </div>
              </div>

              {/* Weight Inputs */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">
                    ကျပ်သား (Kyat)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={kyat}
                    onChange={(e) => setKyat(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full px-3 py-2 font-mono text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">
                    ပဲ (Pe: 0-15)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="15"
                    value={pe}
                    onChange={(e) => setPe(Math.max(0, Math.min(15, parseFloat(e.target.value) || 0)))}
                    className="w-full px-3 py-2 font-mono text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">
                    ရွေး (Yway: 0-7)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="7"
                    value={yway}
                    onChange={(e) => setYway(Math.max(0, Math.min(7, parseFloat(e.target.value) || 0)))}
                    className="w-full px-3 py-2 font-mono text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Gold Output Box */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span className="mm-text">စုစုပေါင်း အလေးချိန်:</span>
                  <span className="num-tabular font-medium text-slate-900 dark:text-slate-100">
                    {totalKyattha.toFixed(4)} ကျပ်သား ({goldTotalGrams} g)
                  </span>
                </div>
                <div className="flex justify-between items-baseline pt-2 border-t border-slate-200 dark:border-slate-700">
                  <span className="font-bold text-slate-950 dark:text-white text-sm mm-text">
                    ကျသင့်ငွေ စုစုပေါင်း:
                  </span>
                  <span className="num-tabular text-2xl font-bold text-slate-950 dark:text-white">
                    {goldTotalMmk.toLocaleString()}
                    <span className="text-[60%] font-medium text-slate-500 dark:text-slate-400 ml-1">Ks</span>
                  </span>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Currency Selection */}
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  နိုင်ငံခြားငွေ အမျိုးအစား:
                </label>
                <select
                  value={currencyCode}
                  onChange={(e) => setCurrencyCode(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                >
                  {currencyQuotes.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.code} - {c.nameMm} ({c.nameEn})
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount Input */}
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  ငွေပမာဏ ({currencyCode}):
                </label>
                <input
                  type="number"
                  min="1"
                  value={currencyAmount}
                  onChange={(e) => setCurrencyAmount(Math.max(1, parseFloat(e.target.value) || 0))}
                  className="w-full px-3 py-2 font-mono text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              {/* Rate Type Selector */}
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  လဲလှယ်နှုန်း သတ်မှတ်ချက်:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setRateType('market')}
                    className={`py-2 px-1 text-center rounded-lg border cursor-pointer font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                      rateType === 'market'
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-bold'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <div className="mm-text">ပြင်ပဈေးကွက်</div>
                    <div className="num-tabular text-xs mt-0.5">{selectedCurrency.marketSellRate.toLocaleString()} Ks</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRateType('online')}
                    className={`py-2 px-1 text-center rounded-lg border cursor-pointer font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                      rateType === 'online'
                        ? 'border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300 font-bold'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <div>Online Trading</div>
                    <div className="num-tabular text-xs mt-0.5">{selectedCurrency.onlineTradingRate.toLocaleString()} Ks</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRateType('cbm')}
                    className={`py-2 px-1 text-center rounded-lg border cursor-pointer font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                      rateType === 'cbm'
                        ? 'border-purple-500 bg-purple-500/10 text-purple-700 dark:text-purple-300 font-bold'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <div className="mm-text">တရားဝင် CBM</div>
                    <div className="num-tabular text-xs mt-0.5">{selectedCurrency.cbmOfficialRate.toLocaleString()} Ks</div>
                  </button>
                </div>
              </div>

              {/* Currency Output Box */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span className="mm-text">အသုံးပြုသည့် နှုန်းထား:</span>
                  <span className="num-tabular font-medium text-slate-900 dark:text-slate-100">
                    1 {currencyCode} = {effectiveRate.toLocaleString()} Ks
                  </span>
                </div>
                <div className="flex justify-between items-baseline pt-2 border-t border-slate-200 dark:border-slate-700">
                  <span className="font-bold text-slate-950 dark:text-white text-sm mm-text">
                    ရရှိမည့်ပမာဏ:
                  </span>
                  <span className="num-tabular text-2xl font-bold text-slate-950 dark:text-white">
                    {currencyTotalMmk.toLocaleString()}
                    <span className="text-[60%] font-medium text-slate-500 dark:text-slate-400 ml-1">Ks</span>
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            ပိတ်မည် (Close)
          </button>
        </div>
      </div>
    </div>
  );
};
