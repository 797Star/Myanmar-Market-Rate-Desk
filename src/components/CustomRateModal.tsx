import React, { useState, useEffect } from 'react';
import { X, Edit3, CheckCircle2, MapPin, ShieldAlert, Scale } from 'lucide-react';
import type { PipelineMeta, TownshipConsensusAssetSummary } from '../types';
import {
  MYANMAR_TOWNSHIPS,
  evaluateGoldParityStatus,
  getSpecificAssetBounds,
  isRateWithinBounds,
} from '../utils/quoteHelpers';

interface CustomRateModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemType: string;
  itemId: string;
  itemName: string;
  currentRate: number;
  onSaveRate: (type: string, id: string, newRate: number) => void;
  isSignedIn?: boolean;
  pipelineMeta?: PipelineMeta | null;
  consensusSummary?: TownshipConsensusAssetSummary | null;
  onSubmitTownshipReport?: (params: {
    township: string;
    assetType: 'gold' | 'currency' | 'commodity';
    assetId: string;
    reportedRate: number;
    impliedXauParityMmk?: number | null;
  }) => Promise<void>;
}

export const CustomRateModal: React.FC<CustomRateModalProps> = ({
  isOpen,
  onClose,
  itemType,
  itemId,
  itemName,
  currentRate,
  onSaveRate,
  isSignedIn = false,
  pipelineMeta = null,
  consensusSummary = null,
  onSubmitTownshipReport,
}) => {
  const [rateInput, setRateInput] = useState<number>(currentRate);
  const [contributeConsensus, setContributeConsensus] = useState<boolean>(false);
  const [selectedTownship, setSelectedTownship] = useState<string>(MYANMAR_TOWNSHIPS[0]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    setRateInput(currentRate);
    setContributeConsensus(false);
    setSubmitError(null);
    setIsSubmitting(false);
  }, [currentRate, isOpen, itemId]);

  if (!isOpen) return null;

  const isSupportedAssetType =
    itemType === 'gold' || itemType === 'currency' || itemType === 'commodity';
  const normalizedAssetType: 'gold' | 'currency' | 'commodity' = isSupportedAssetType
    ? itemType
    : 'currency';

  const bounds = getSpecificAssetBounds(normalizedAssetType, itemId);
  const withinBounds = isRateWithinBounds(normalizedAssetType, itemId, rateInput);

  const impliedParityMmk =
    itemType === 'gold' && itemId === 'gold-24k' ? pipelineMeta?.spotParityMmkMarket ?? null : null;
  const goldParityEval =
    impliedParityMmk && rateInput > 0
      ? evaluateGoldParityStatus(rateInput, impliedParityMmk)
      : null;

  const consensusDeviationPct =
    consensusSummary && consensusSummary.medianRate > 0 && rateInput > 0
      ? Number(
          (((rateInput - consensusSummary.medianRate) / consensusSummary.medianRate) * 100).toFixed(
            1
          )
        )
      : null;

  const isExtremeMedianOutlier =
    consensusDeviationPct !== null && Math.abs(consensusDeviationPct) > 15;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!withinBounds) {
      setSubmitError(
        `Rate must be between ${bounds.min.toLocaleString()} and ${bounds.max.toLocaleString()} MMK.`
      );
      return;
    }

    onSaveRate(itemType, itemId, rateInput);

    if (contributeConsensus && isSignedIn && isSupportedAssetType && onSubmitTownshipReport) {
      setIsSubmitting(true);
      try {
        await onSubmitTownshipReport({
          township: selectedTownship,
          assetType: normalizedAssetType,
          assetId: itemId,
          reportedRate: rateInput,
          impliedXauParityMmk: impliedParityMmk,
        });
        onClose();
      } catch (err) {
        setSubmitError(
          err instanceof Error
            ? err.message
            : 'Unable to publish township consensus report. Local override was saved.'
        );
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1C1C1C]/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-[#191A19] border border-[#1C1C1C]/20 dark:border-stone-800 rounded-sm w-full max-w-md shadow-2xl overflow-hidden transition-colors">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#1C1C1C]/12 dark:border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-sm bg-[#004225]/10 dark:bg-emerald-500/10 text-[#004225] dark:text-emerald-400">
              <Edit3 className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#1C1C1C] dark:text-white mm-heading">
                ဈေးနှုန်း ပြင်ဆင်သတ်မှတ်ရန်
              </h3>
              <p className="text-xs text-[#1C1C1C]/65 dark:text-stone-400 mm-text">
                မိမိဒေသ (သို့) မြို့နယ် ပြင်ပဈေးကွက်အတိုင်း ပြင်ဆင်ကြည့်ရှုရန်
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="ပိတ်မည်"
            className="p-1.5 text-[#1C1C1C]/60 hover:text-[#1C1C1C] dark:text-stone-400 dark:hover:text-white rounded-sm hover:bg-[#F9F8F6] dark:hover:bg-stone-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div>
            <label className="block text-[#1C1C1C]/70 dark:text-stone-400 mb-1 font-medium mm-text">
              ကုန်စည် / နိုင်ငံခြားငွေ:
            </label>
            <div className="font-bold text-[#1C1C1C] dark:text-white text-sm bg-[#F9F8F6] dark:bg-stone-900 p-2.5 rounded-sm border border-[#1C1C1C]/15 dark:border-stone-700 mm-text flex items-center justify-between gap-2">
              <span>{itemName}</span>
              {consensusSummary && consensusSummary.reportCount > 0 && (
                <span className="text-[11px] font-mono tabular-nums text-[#004225] dark:text-emerald-400">
                  Township Median: {consensusSummary.medianRate.toLocaleString()} Ks
                </span>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label
                htmlFor="custom-rate-input"
                className="block text-[#1C1C1C]/70 dark:text-stone-400 font-medium mm-text"
              >
                ပြင်ပဈေးကွက် အသစ် (Ks):
              </label>
              <span className="text-[11px] font-mono tabular-nums text-[#1C1C1C]/55 dark:text-stone-400">
                Bounds: {bounds.min.toLocaleString()}–{bounds.max.toLocaleString()}
              </span>
            </div>
            <input
              id="custom-rate-input"
              type="number"
              step="any"
              min={bounds.min}
              max={bounds.max}
              value={Number.isFinite(rateInput) ? rateInput : ''}
              onChange={(e) => {
                setRateInput(parseFloat(e.target.value) || 0);
                setSubmitError(null);
              }}
              className="w-full px-3 py-2.5 num-tabular text-base font-bold bg-white dark:bg-stone-900 border border-[#1C1C1C]/25 dark:border-stone-700 rounded-sm text-[#1C1C1C] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#004225] dark:focus:ring-emerald-500"
              autoFocus
            />

            {/* Live Parity & Median Deviation Checks */}
            {goldParityEval && impliedParityMmk && (
              <div
                className={`mt-2 p-2.5 rounded-sm border flex items-start gap-2 ${
                  goldParityEval.status === 'flagged'
                    ? 'bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950/30 dark:border-rose-800/50 dark:text-rose-200'
                    : 'bg-[#F9F8F6] border-[#1C1C1C]/12 text-[#1C1C1C]/80 dark:bg-stone-900 dark:border-stone-800 dark:text-stone-300'
                }`}
              >
                <Scale className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                <div className="space-y-0.5 font-mono tabular-nums text-[11px]">
                  <div>
                    XAU Parity Ref: ~{impliedParityMmk.toLocaleString()} Ks (
                    {goldParityEval.deviationPercent !== null &&
                      `${goldParityEval.deviationPercent >= 0 ? '+' : ''}${goldParityEval.deviationPercent}%`}
                    )
                  </div>
                  {goldParityEval.status === 'flagged' && (
                    <div className="font-sans text-[11px] font-semibold">
                      Warning: Quote deviates significantly from international XAU parity and may be filtered as an outlier.
                    </div>
                  )}
                </div>
              </div>
            )}

            {isExtremeMedianOutlier && consensusSummary && (
              <div className="mt-2 p-2.5 rounded-sm border border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:border-amber-700/50 dark:text-amber-200 flex items-start gap-2">
                <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                <span className="text-[11px]">
                  This rate differs by {consensusDeviationPct! >= 0 ? '+' : ''}
                  {consensusDeviationPct}% from current township median (
                  {consensusSummary.medianRate.toLocaleString()} Ks) and will be evaluated by the ±12% outlier filter.
                </span>
              </div>
            )}

            <p className="text-[11px] text-[#1C1C1C]/65 dark:text-stone-400 mt-1.5 mm-text">
              * ပြင်ဆင်ပြီးပါက Dashboard တစ်ခုလုံးရှိ ကွာဟချက်နှင့် တွက်ချက်စက်များတွင် ချက်ချင်း အကျိုးသက်ရောက်မည် ဖြစ်ပါသည်။
            </p>
          </div>

          {/* Optional Shared Township Consensus Contribution (Signed-in Users) */}
          {isSupportedAssetType && onSubmitTownshipReport && (
            <div className="pt-3 border-t border-[#1C1C1C]/12 dark:border-stone-800 space-y-2.5">
              {isSignedIn ? (
                <>
                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={contributeConsensus}
                      onChange={(e) => setContributeConsensus(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded-sm border-[#1C1C1C]/30 text-[#004225] focus:ring-[#004225]"
                    />
                    <span className="space-y-0.5">
                      <span className="block font-semibold text-[#1C1C1C] dark:text-white">
                        Contribute to Public Township Consensus
                      </span>
                      <span className="block text-[11px] text-[#1C1C1C]/65 dark:text-stone-400">
                        Shares your verified township quote into the 24h trimmed-median community benchmark (outliers &gt; ±12% auto-filtered).
                      </span>
                    </span>
                  </label>

                  {contributeConsensus && (
                    <div className="pl-6 space-y-1.5">
                      <label
                        htmlFor="township-select"
                        className="flex items-center gap-1.5 text-[11px] font-semibold text-[#1C1C1C]/80 dark:text-stone-300"
                      >
                        <MapPin className="w-3 h-3 text-[#004225] dark:text-emerald-400" aria-hidden="true" />
                        <span>Township / Trading Hub</span>
                      </label>
                      <select
                        id="township-select"
                        value={selectedTownship}
                        onChange={(e) => setSelectedTownship(e.target.value)}
                        className="w-full px-2.5 py-2 text-xs bg-[#F9F8F6] dark:bg-stone-900 border border-[#1C1C1C]/20 dark:border-stone-700 rounded-sm text-[#1C1C1C] dark:text-white focus:outline-none focus:border-[#004225]"
                      >
                        {MYANMAR_TOWNSHIPS.map((tw) => (
                          <option key={tw} value={tw}>
                            {tw}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-[11px] text-[#1C1C1C]/60 dark:text-stone-400">
                  Sign in with Google to optionally contribute this quote to the public Township Consensus pool.
                </p>
              )}
            </div>
          )}

          {submitError && (
            <div className="p-2.5 rounded-sm bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50 text-rose-800 dark:text-rose-200 text-xs font-medium">
              {submitError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-[#1C1C1C]/75 dark:text-stone-300 hover:bg-[#F9F8F6] dark:hover:bg-stone-800 rounded-sm transition-colors cursor-pointer"
            >
              မလုပ်တော့ပါ (Cancel)
            </button>
            <button
              type="submit"
              disabled={!withinBounds || isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#004225] hover:bg-[#00311b] dark:bg-emerald-700 dark:hover:bg-emerald-600 rounded-sm transition-colors cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              <span>
                {isSubmitting
                  ? 'Submitting...'
                  : contributeConsensus
                  ? 'Save & Publish Quote'
                  : 'အတည်ပြု သိမ်းဆည်းမည်'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
