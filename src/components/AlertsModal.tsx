import React, { useState, useEffect, useCallback } from 'react';
import { X, Bell, Plus, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { PriceAlert, GoldQuote, CurrencyQuote, CommodityQuote } from '../types';

interface AlertsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialItemKey?: string | null;
  goldQuotes: GoldQuote[];
  currencyQuotes: CurrencyQuote[];
  commodityQuotes: CommodityQuote[];
  alerts: PriceAlert[];
  onAddAlert: (alert: PriceAlert) => void;
  onDeleteAlert: (id: string) => void;
}

export const AlertsModal: React.FC<AlertsModalProps> = ({
  isOpen,
  onClose,
  initialItemKey,
  goldQuotes,
  currencyQuotes,
  commodityQuotes,
  alerts,
  onAddAlert,
  onDeleteAlert,
}) => {
  const [newItem, setNewItem] = useState<string>('THB');
  const [newThreshold, setNewThreshold] = useState<number>(135);

  const resolveCurrentRate = useCallback(
    (itemKey: string): { name: string; current: number } => {
      if (itemKey === 'USD') {
        return {
          name: 'အမေရိကန်ဒေါ်လာ (USD)',
          current: currencyQuotes.find((c) => c.code === 'USD')?.marketSellRate || 5145,
        };
      }
      if (itemKey === 'THB') {
        return {
          name: 'ထိုင်းဘတ် (THB)',
          current: currencyQuotes.find((c) => c.code === 'THB')?.marketSellRate || 150.7,
        };
      }
      if (itemKey === 'gold-24k') {
        return {
          name: 'အခေါက်ရွှေ 16 ပဲရည်',
          current: goldQuotes.find((g) => g.id === 'gold-24k')?.marketRate || 10300000,
        };
      }
      if (itemKey === 'oil-palm') {
        return {
          name: 'စားအုန်းဆီ (1 ပိဿာ)',
          current: commodityQuotes.find((cm) => cm.id === 'oil-palm')?.openMarketRate || 13500,
        };
      }
      if (itemKey === 'fuel-92') {
        return {
          name: 'အောက်တိန်း 92 (1 လီတာ)',
          current: commodityQuotes.find((cm) => cm.id === 'fuel-92')?.openMarketRate || 3322,
        };
      }
      return {
        name: 'ရွှေဘိုပေါ်ဆန်း (1 အိတ်)',
        current: commodityQuotes.find((cm) => cm.id === 'rice-shwebo')?.openMarketRate || 178000,
      };
    },
    [goldQuotes, currencyQuotes, commodityQuotes]
  );

  const computeSuggestedThreshold = useCallback(
    (itemKey: string): number => {
      const live = resolveCurrentRate(itemKey).current;
      if (itemKey === 'gold-24k') return Math.round((live + 100000) / 10000) * 10000;
      if (itemKey === 'USD') return Math.round(live + 50);
      if (itemKey === 'THB') return Number((live + 2).toFixed(1));
      if (itemKey === 'fuel-92') return Math.round(live + 100);
      if (itemKey === 'oil-palm') return Math.round(live + 500);
      return Math.round(live + 5000);
    },
    [resolveCurrentRate]
  );

  useEffect(() => {
    if (!isOpen) return;
    const targetKey = initialItemKey || 'THB';
    setNewItem(targetKey);
    setNewThreshold(computeSuggestedThreshold(targetKey));
  }, [isOpen, initialItemKey, computeSuggestedThreshold]);

  if (!isOpen) return null;

  const handleSelectItemChange = (nextKey: string) => {
    setNewItem(nextKey);
    setNewThreshold(computeSuggestedThreshold(nextKey));
  };

  const handleAddAlert = (e: React.FormEvent) => {
    e.preventDefault();
    const { name, current } = resolveCurrentRate(newItem);

    const newAlertObj: PriceAlert = {
      id: `a_${Date.now()}`,
      itemKey: newItem,
      itemName: name,
      targetHigh: newThreshold,
      targetLow: 0,
      currentRate: current,
      isTriggered: current >= newThreshold,
      alertType: 'above',
    };

    onAddAlert(newAlertObj);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl overflow-hidden transition-colors">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400">
              <Bell className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-950 dark:text-white mm-heading">
                ဈေးနှုန်း အတက်အကျ သတိပေးချက်များ (Price Volatility Alerts)
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mm-text">
                ရွှေ၊ ဒေါ်လာနှင့် အခြေခံကုန်စည် ဈေးနှုန်း စံချိန်တင် ကျော်လွန်ချိန်များတွင် အချက်ပေးရန်
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

        {/* Content */}
        <div className="p-5 space-y-4 text-xs overflow-y-auto">
          {/* Active Alerts List */}
          <div className="space-y-2 max-h-60 overflow-y-auto">
            <label className="block font-semibold text-slate-950 dark:text-white mm-text">
              လက်ရှိ သတ်မှတ်ထားသော သတိပေးချက်များ:
            </label>

            {alerts.map((alert) => {
              const liveRate = resolveCurrentRate(alert.itemKey).current || alert.currentRate;
              const triggered = liveRate >= alert.targetHigh;
              return (
                <div
                  key={alert.id}
                  className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-950 dark:text-slate-100 mm-text">
                      {alert.itemName}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 num-tabular mt-0.5">
                      သတ်မှတ်အမြင့်ဆုံးနှုန်း: {alert.targetHigh.toLocaleString()} Ks · ပြင်ပဈေးကွက်: {liveRate.toLocaleString()} Ks
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {triggered ? (
                      <span className="flex items-center gap-1 text-xs font-semibold text-rose-700 dark:text-rose-400 num-tabular">
                        <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                        ကျော်လွန်နေပြီ
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 num-tabular">
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        ပုံမှန်အောက်
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => onDeleteAlert(alert.id)}
                      aria-label={`${alert.itemName} သတိပေးချက် ဖျက်ရန်`}
                      className="p-1.5 text-slate-500 hover:text-rose-700 dark:text-slate-400 dark:hover:text-rose-400 rounded-lg transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add New Alert Form */}
          <form onSubmit={handleAddAlert} className="pt-3 border-t border-slate-200 dark:border-slate-700 space-y-3">
            <div className="font-semibold text-slate-950 dark:text-white mm-text">
              သတိပေးချက် အသစ်ထည့်သွင်းရန်:
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1 mm-text">ပစ္စည်းရွေးရန်</label>
                <select
                  value={newItem}
                  onChange={(e) => handleSelectItemChange(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-950 dark:text-white"
                >
                  <option value="USD">အမေရိကန်ဒေါ်လာ (USD)</option>
                  <option value="THB">ထိုင်းဘတ် (THB)</option>
                  <option value="gold-24k">အခေါက်ရွှေ 16 ပဲရည်</option>
                  <option value="oil-palm">စားအုန်းဆီ (1 ပိဿာ)</option>
                  <option value="fuel-92">အောက်တိန်း 92 (1 လီတာ)</option>
                  <option value="rice-shwebo">ရွှေဘိုပေါ်ဆန်း (1 အိတ်)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1 mm-text">သတိပေးမည့်နှုန်း (Ks)</label>
                <input
                  type="number"
                  value={newThreshold}
                  onChange={(e) => setNewThreshold(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-xs num-tabular bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-950 dark:text-white"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2 flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>သတိပေးချက် ထည့်သွင်းမည်</span>
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            ပိတ်မည် (Close)
          </button>
        </div>
      </div>
    </div>
  );
};
