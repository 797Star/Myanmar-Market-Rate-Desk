import React, { useState } from 'react';
import { ShoppingBag, Users, AlertTriangle, RotateCcw } from 'lucide-react';
import { InflationBasketItem } from '../types';

interface InflationBasketSectionProps {
  basketItems: InflationBasketItem[];
  quantities?: Record<string, number>;
  familySize?: number;
  onQuantityChange?: (id: string, newQty: number, nextFamilySize: number) => void;
  onFamilyPresetChange?: (size: number, updatedQuantities: Record<string, number>) => void;
}

export const InflationBasketSection: React.FC<InflationBasketSectionProps> = ({
  basketItems,
  quantities: controlledQuantities,
  familySize: controlledFamilySize,
  onQuantityChange,
  onFamilyPresetChange,
}) => {
  const [localQuantities, setLocalQuantities] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    basketItems.forEach((item) => {
      initial[item.id] = item.defaultMonthlyQty;
    });
    return initial;
  });

  const [localFamilySize, setLocalFamilySize] = useState<number>(4);

  const quantities = controlledQuantities ?? localQuantities;
  const familySize = controlledFamilySize ?? localFamilySize;

  // Apply family size preset multiplier
  const handleFamilyPreset = (size: number) => {
    const multiplier = size / 4;
    const updated: Record<string, number> = {};
    basketItems.forEach((item) => {
      updated[item.id] = Math.max(1, Math.round(item.defaultMonthlyQty * multiplier));
    });
    if (onFamilyPresetChange) {
      onFamilyPresetChange(size, updated);
    } else {
      setLocalFamilySize(size);
      setLocalQuantities(updated);
    }
  };

  const handleQtyChange = (id: string, newQty: number) => {
    const clamped = Math.max(0, newQty);
    if (onQuantityChange) {
      onQuantityChange(id, clamped, familySize);
    } else {
      setLocalQuantities((prev) => ({
        ...prev,
        [id]: clamped,
      }));
    }
  };

  const handleReset = () => {
    handleFamilyPreset(4);
  };

  // Compute totals
  let totalOfficial = 0;
  let totalMarket = 0;

  basketItems.forEach((item) => {
    const qty = quantities[item.id] ?? item.defaultMonthlyQty;
    totalOfficial += qty * item.unitPriceOfficial;
    totalMarket += qty * item.unitPriceMarket;
  });

  const gapAmount = totalMarket - totalOfficial;
  const gapPercent = totalOfficial > 0 ? (gapAmount / totalOfficial) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-950 dark:text-white flex items-center gap-2 mm-heading">
            <ShoppingBag className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0" aria-hidden="true" />
            <span>အိမ်ထောင်စု အခြေခံကုန်ကျစရိတ်နှင့် ငွေကြေးဖောင်းပွမှု အညွှန်း</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 en-sub mt-0.5">
            Household Inflation Basket · Official Reference Rate vs. Open Market Cost Comparison
          </p>
        </div>

        {/* Family Size Preset Selector */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <span className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1 mm-text">
            <Users className="w-3.5 h-3.5" aria-hidden="true" />
            မိသားစုဝင်:
          </span>
          <div className="inline-flex bg-slate-200/70 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            {[2, 4, 6].map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => handleFamilyPreset(size)}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition-all cursor-pointer active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  familySize === size
                    ? 'bg-white dark:bg-slate-900 text-slate-950 dark:text-white shadow-xs font-bold'
                    : 'text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white'
                }`}
              >
                {size} ဦး
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleReset}
            aria-label="မူလအတိုင်း ပြန်လည်ထားရှိရန်"
            className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            title="မူလအတိုင်း ပြန်လည်ထားရှိရန်"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
          <div className="text-xs text-slate-600 dark:text-slate-400 font-medium mm-text">
            တရားဝင် ရည်ညွှန်းနှုန်းဖြင့် လစဉ်ကုန်ကျစရိတ်
          </div>
          <div className="text-2xl font-bold num-tabular text-slate-950 dark:text-white mt-1.5">
            {totalOfficial.toLocaleString()}
            <span className="text-[60%] font-medium text-slate-500 dark:text-slate-400 ml-1">Ks</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 mm-text">
            ခွဲတမ်းကူပွန်နှင့် သတ်မှတ်ဈေးနှုန်း ရရှိပါက
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
          <div className="text-xs text-slate-600 dark:text-slate-400 font-medium mm-text">
            ပြင်ပဈေးကွက်ဖြင့် လစဉ်ကုန်ကျစရိတ်
          </div>
          <div className="text-2xl font-bold num-tabular text-slate-950 dark:text-white mt-1.5">
            {totalMarket.toLocaleString()}
            <span className="text-[60%] font-medium text-slate-500 dark:text-slate-400 ml-1">Ks</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 mm-text">
            ပြင်ပဆိုင်များတွင် ဝယ်ယူရသည့် ပကတိစရိတ်
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-500/30 rounded-2xl p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
          <div className="text-xs text-slate-700 dark:text-slate-300 font-semibold flex items-center gap-1.5 mm-text">
            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" aria-hidden="true" />
            <span>လစဉ် ပိုမိုပေးဆောင်ရသည့် ကွာဟချက် (Spread)</span>
          </div>
          <div className="text-2xl font-bold num-tabular text-rose-700 dark:text-rose-400 mt-1.5">
            +{gapAmount.toLocaleString()}
            <span className="text-[60%] font-medium text-rose-600/80 dark:text-rose-400/80 ml-1">Ks</span>
          </div>
          <div className="mt-1.5">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300 text-[13px] font-semibold num-tabular">
              <span aria-hidden="true">▲</span> +{gapPercent.toFixed(1)}% အပိုဝန်ထုပ်ဝန်ပိုး
            </span>
          </div>
        </div>
      </div>

      {/* Interactive Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
        <div className="p-4 sm:px-5 border-b border-slate-100 dark:border-slate-800 text-sm font-semibold text-slate-900 dark:text-slate-200 mm-heading">
          အိမ်ထောင်စုတစ်စု၏ လစဉ် စားသောက်ကုန်နှင့် စက်သုံးဆီ ခြင်းတောင်း အသေးစိတ်
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[13px] text-slate-700 dark:text-slate-300 font-semibold">
                <th className="py-3 px-4 mm-text">ပစ္စည်းအမည်</th>
                <th className="py-3 px-4 mm-text">ယူနစ်</th>
                <th className="py-3 px-4 mm-text">လစဉ်သုံးစွဲမှု</th>
                <th className="py-3 px-4 text-right mm-text">တရားဝင် ရည်ညွှန်းနှုန်း (1 ယူနစ်)</th>
                <th className="py-3 px-4 text-right mm-text">ပြင်ပဈေးကွက် (1 ယူနစ်)</th>
                <th className="py-3 px-4 text-right mm-text">လစဉ် စုစုပေါင်း</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {basketItems.map((item) => {
                const qty = quantities[item.id] ?? item.defaultMonthlyQty;
                const itemMarketTotal = qty * item.unitPriceMarket;
                const itemOfficialTotal = qty * item.unitPriceOfficial;

                return (
                  <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-950 dark:text-white">
                      <div className="mm-text">{item.nameMm}</div>
                      <div className="text-xs font-normal text-slate-500 dark:text-slate-400 en-sub">{item.nameEn}</div>
                    </td>

                    <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300 mm-text">
                      {item.unitMm}
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleQtyChange(item.id, qty - 1)}
                          aria-label={`${item.nameMm} ပမာဏ လျှော့ရန်`}
                          className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold flex items-center justify-center cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="0"
                          aria-label={`${item.nameMm} လစဉ်ပမာဏ`}
                          value={qty}
                          onChange={(e) => handleQtyChange(item.id, parseFloat(e.target.value) || 0)}
                          className="w-14 text-center py-1 num-tabular text-sm font-medium bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600/40"
                        />
                        <button
                          type="button"
                          onClick={() => handleQtyChange(item.id, qty + 1)}
                          aria-label={`${item.nameMm} ပမာဏ တိုးရန်`}
                          className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold flex items-center justify-center cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                        >
                          +
                        </button>
                      </div>
                    </td>

                    <td className="py-3 px-4 text-right num-tabular text-[15px] font-medium text-slate-700 dark:text-slate-300">
                      {item.unitPriceOfficial.toLocaleString()}
                      <span className="text-[60%] font-normal text-slate-500 dark:text-slate-400 ml-1">Ks</span>
                    </td>

                    <td className="py-3 px-4 text-right num-tabular text-[17px] font-bold text-slate-950 dark:text-white">
                      {item.unitPriceMarket.toLocaleString()}
                      <span className="text-[60%] font-medium text-slate-500 dark:text-slate-400 ml-1">Ks</span>
                    </td>

                    <td className="py-3 px-4 text-right num-tabular">
                      <div className="text-[18px] font-bold text-slate-950 dark:text-white">
                        {itemMarketTotal.toLocaleString()}
                        <span className="text-[60%] font-medium text-slate-500 dark:text-slate-400 ml-1">Ks</span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        တရားဝင်: {itemOfficialTotal.toLocaleString()} Ks
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
