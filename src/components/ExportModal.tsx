import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  X,
  Download,
  Copy,
  Check,
  Printer,
  Share2,
  RefreshCw,
  Image as ImageIcon,
  Calendar,
  FileCode2,
  FileText,
  AlignLeft,
  Tv,
  Mic,
  Clapperboard,
  LogIn,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import {
  AiQuotaStatus,
  BroadcastBulletinFormat,
  BroadcastScriptPayload,
  CommodityQuote,
  CurrencyQuote,
  DailyDigest,
  GoldQuote,
  MarketSession,
  PipelineMeta,
} from '../types';
import {
  buildHydratedPromptText,
  buildStructuredMarketText,
  formatGatheredTimeMm,
  generateMarketPosterDataUrl,
  generateMarketSnapshotPdf,
  getDefaultRateBoardDate,
  RateBoardHeaderTheme,
  resolveRateBoardData,
  TextSnapshotFormat,
} from '../utils/posterGenerator';
import { getFirebaseIdToken } from '../firebase';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: MarketSession;
  dateStr: string;
  lastSyncedAt?: string | null;
  goldQuotes: GoldQuote[];
  currencyQuotes: CurrencyQuote[];
  commodityQuotes: CommodityQuote[];
  digest: DailyDigest;
  pipelineMeta?: PipelineMeta | null;
  isSignedIn?: boolean;
  isLoggingIn?: boolean;
  onGoogleLogin?: () => void;
  quotaStatus?: AiQuotaStatus | null;
}

async function copyTextReliably(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below for restricted iframe permissions
    }
  }
  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    document.body.removeChild(textarea);
    return ok;
  }
  return false;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  session,
  dateStr,
  lastSyncedAt,
  goldQuotes,
  currencyQuotes,
  commodityQuotes,
  digest,
  pipelineMeta,
  isSignedIn = false,
  isLoggingIn = false,
  onGoogleLogin,
  quotaStatus,
}) => {
  const [studioTab, setStudioTab] = useState<'rate_card' | 'anchor_content'>('rate_card');
  const [selectedSession, setSelectedSession] = useState<MarketSession>(session);
  const [dateValue, setDateValue] = useState<string>(() => dateStr || getDefaultRateBoardDate());
  const [gatheredTimeValue, setGatheredTimeValue] = useState<string>(() => formatGatheredTimeMm(lastSyncedAt));
  const [sourceValue, setSourceValue] = useState<string>('CBM · YGEA · PPRD · DOCA · Verified Desks');
  const [brandValue, setBrandValue] = useState<string>('Myanmar Market Watch');
  const [headerTheme, setHeaderTheme] = useState<RateBoardHeaderTheme>('editorial_green');

  const [previewMode, setPreviewMode] = useState<'poster' | 'text'>('poster');
  const [textFormat, setTextFormat] = useState<TextSnapshotFormat>('social');

  const [posterDataUrl, setPosterDataUrl] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<boolean>(false);
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);
  const [pdfSuccess, setPdfSuccess] = useState<boolean>(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  // Burmese News Anchor Content Studio State
  const [bulletinFormat, setBulletinFormat] = useState<BroadcastBulletinFormat>('full_bulletin');
  const [isGeneratingAnchor, setIsGeneratingAnchor] = useState<boolean>(false);
  const [anchorError, setAnchorError] = useState<string | null>(null);
  const [anchorPayload, setAnchorPayload] = useState<BroadcastScriptPayload | null>(null);
  const [editedFacebookPost, setEditedFacebookPost] = useState<string>('');
  const [editedVideoScript, setEditedVideoScript] = useState<string>('');
  const [scriptViewMode, setScriptViewMode] = useState<'cue_sheet' | 'raw_editor'>('cue_sheet');
  const [copiedFbPost, setCopiedFbPost] = useState<boolean>(false);
  const [copiedVideoScript, setCopiedVideoScript] = useState<boolean>(false);
  const [localQuota, setLocalQuota] = useState<AiQuotaStatus | null>(quotaStatus ?? null);

  useEffect(() => {
    if (quotaStatus) {
      setLocalQuota(quotaStatus);
    }
  }, [quotaStatus]);

  useEffect(() => {
    if (isOpen) {
      setSelectedSession(session);
      setDateValue(dateStr || getDefaultRateBoardDate());
      setGatheredTimeValue(formatGatheredTimeMm(lastSyncedAt));
      setRenderError(null);
      setAnchorError(null);
    }
  }, [isOpen, session, dateStr, lastSyncedAt]);

  const currentOptions = useMemo(
    () => ({
      session: selectedSession,
      activeDashboardSession: session,
      dateStr: dateValue,
      gatheredTimeStr: gatheredTimeValue,
      sourceStr: sourceValue,
      brandName: brandValue,
      headerTheme,
      goldQuotes,
      currencyQuotes,
      commodityQuotes,
      xauUsdSpot: pipelineMeta?.xauUsdSpot ?? null,
      impliedXauParityMmk: pipelineMeta?.spotParityMmkMarket ?? null,
      workerRemittanceUsd: pipelineMeta?.workerRemittanceUsd ?? null,
    }),
    [
      selectedSession,
      session,
      dateValue,
      gatheredTimeValue,
      sourceValue,
      brandValue,
      headerTheme,
      goldQuotes,
      currencyQuotes,
      commodityQuotes,
      pipelineMeta,
    ]
  );

  const renderPoster = useCallback(async () => {
    if (!isOpen) return;
    setIsRendering(true);
    setRenderError(null);
    try {
      const dataUrl = await generateMarketPosterDataUrl(currentOptions);
      setPosterDataUrl(dataUrl);
    } catch (err) {
      setRenderError(err instanceof Error ? err.message : 'Rate card render failed');
    } finally {
      setIsRendering(false);
    }
  }, [isOpen, currentOptions]);

  useEffect(() => {
    void renderPoster();
  }, [renderPoster]);

  const structuredText = useMemo(
    () =>
      buildStructuredMarketText({
        ...currentOptions,
        digest,
        format: textFormat,
      }),
    [currentOptions, digest, textFormat]
  );

  if (!isOpen) return null;

  const resolved = resolveRateBoardData(currentOptions);

  const handleResetDateAndTime = () => {
    setDateValue(dateStr || getDefaultRateBoardDate());
    setGatheredTimeValue(formatGatheredTimeMm(lastSyncedAt));
  };

  const handleCopyText = async () => {
    const ok = await copyTextReliably(structuredText);
    if (ok) {
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2500);
    } else {
      setRenderError('Clipboard ခွင့်ပြုချက် မရရှိသဖြင့် စာသားကူးယူ၍ မရနိုင်ပါ။');
    }
  };

  const handleCopyPrompt = async () => {
    const ok = await copyTextReliably(buildHydratedPromptText(currentOptions));
    if (ok) {
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2500);
    }
  };

  const handleDownloadPdf = async () => {
    setIsExportingPdf(true);
    setRenderError(null);
    try {
      await generateMarketSnapshotPdf({
        ...currentOptions,
        digest,
        posterDataUrl,
      });
      setPdfSuccess(true);
      setTimeout(() => setPdfSuccess(false), 2500);
    } catch (err) {
      setRenderError(err instanceof Error ? err.message : 'PDF snapshot export failed');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadImage = async () => {
    try {
      const dataUrl = posterDataUrl || (await generateMarketPosterDataUrl(currentOptions));
      const link = document.createElement('a');
      link.download = `Daily_Market_Rates_4x5_${selectedSession}_${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      setRenderError(err instanceof Error ? err.message : 'Download failed');
    }
  };

  const handleShareImage = async () => {
    if (!posterDataUrl || typeof navigator === 'undefined' || !navigator.share) return;
    try {
      const res = await fetch(posterDataUrl);
      const blob = await res.blob();
      const file = new File(
        [blob],
        `Daily_Market_Rates_4x5_${selectedSession}.png`,
        { type: 'image/png' }
      );
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `နေ့စဉ်ဈေးနှုန်းများ · ${resolved.dateText}`,
          text: `${resolved.dateText} | ${resolved.sessionText} | စုစည်းချိန် ${resolved.gatheredTimeText}`,
          files: [file],
        });
        setShareStatus('မျှဝေပြီးပါပြီ');
        setTimeout(() => setShareStatus(null), 2500);
      }
    } catch {
      // Ignore user cancel
    }
  };

  const handleGenerateAnchorContent = async () => {
    setAnchorError(null);
    if (!isSignedIn) {
      setAnchorError('AI သတင်းကြေညာစာသား ထုတ်ယူရန် Google Account ဖြင့် ဦးစွာ Sign In ဝင်ရောက်ပေးပါ။');
      return;
    }

    setIsGeneratingAnchor(true);
    try {
      const idToken = await getFirebaseIdToken();
      if (!idToken) {
        throw new Error('Authentication session expired. Please sign in again.');
      }

      const res = await fetch('/api/ai/broadcast-script', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          sessionFocus: selectedSession,
          bulletinFormat,
          dateStr: dateValue,
          brandName: brandValue,
          sourceStr: sourceValue,
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(`Unexpected response from broadcast endpoint (HTTP ${res.status}).`);
      }

      const data = await res.json().catch(() => null);
      if (data?.quota) {
        setLocalQuota(data.quota);
      }
      if (!res.ok) {
        throw new Error(data?.error || `Generation failed (${res.status})`);
      }

      if (
        !data ||
        typeof data.facebookPostMm !== 'string' ||
        typeof data.videoScriptMm !== 'string'
      ) {
        throw new Error(
          data?.error || 'Broadcast script response was incomplete. Please try generating again.'
        );
      }

      const payload: BroadcastScriptPayload = {
        anchorHeadlineMm: typeof data.anchorHeadlineMm === 'string' ? data.anchorHeadlineMm : '',
        facebookPostMm: data.facebookPostMm,
        videoScriptMm: data.videoScriptMm,
        scriptSections: Array.isArray(data.scriptSections) ? data.scriptSections : [],
        estimatedDurationSec:
          typeof data.estimatedDurationSec === 'number' ? data.estimatedDurationSec : 55,
        bulletinFormat: data.bulletinFormat === 'flash_brief' ? 'flash_brief' : 'full_bulletin',
        session: data.session === 'morning' || data.session === 'evening' ? data.session : selectedSession,
        generatedAt: typeof data.generatedAt === 'string' ? data.generatedAt : '',
        quota: data.quota,
      };
      setAnchorPayload(payload);
      setEditedFacebookPost(payload.facebookPostMm || '');
      setEditedVideoScript(payload.videoScriptMm || '');
    } catch (err) {
      setAnchorError(
        err instanceof Error ? err.message : 'Burmese News Anchor script generation failed.'
      );
    } finally {
      setIsGeneratingAnchor(false);
    }
  };

  const handleCopyFacebookPost = async () => {
    if (!editedFacebookPost) return;
    const ok = await copyTextReliably(editedFacebookPost);
    if (ok) {
      setCopiedFbPost(true);
      setTimeout(() => setCopiedFbPost(false), 2500);
    }
  };

  const handleCopyVideoScript = async () => {
    if (!editedVideoScript) return;
    const ok = await copyTextReliably(editedVideoScript);
    if (ok) {
      setCopiedVideoScript(true);
      setTimeout(() => setCopiedVideoScript(false), 2500);
    }
  };

  const handleDownloadBroadcastTxt = () => {
    if (!anchorPayload) return;
    const content = [
      `${brandValue} — Burmese News Anchor Broadcast Pack`,
      `Date: ${resolved.dateText} | Session: ${resolved.sessionText} | Format: ${anchorPayload.bulletinFormat} (~${anchorPayload.estimatedDurationSec}s)`,
      `Headline: ${anchorPayload.anchorHeadlineMm}`,
      ``,
      `============================================================`,
      `PART 1: FACEBOOK POST (LAST 24H MARKET REPORT)`,
      `============================================================`,
      editedFacebookPost,
      ``,
      `============================================================`,
      `PART 2: VIDEO SCRIPT (NEWS ANCHOR TELEPROMPTER)`,
      `============================================================`,
      editedVideoScript,
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Market_News_Anchor_Pack_${selectedSession}_${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const canNativeShare =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-950/75 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-[#161716] border border-[#1C1C1C]/20 dark:border-stone-800 rounded-md w-full max-w-5xl shadow-2xl my-6 overflow-hidden transition-colors">
        {/* Top Modal Masthead & Studio Switcher */}
        <div className="px-4 sm:px-6 pt-4 pb-3 border-b border-[#1C1C1C]/15 dark:border-stone-800 bg-[#F9F8F6] dark:bg-[#121312]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-sm bg-[#004225] text-amber-300 flex items-center justify-center shrink-0">
                {studioTab === 'rate_card' ? (
                  <ImageIcon className="w-4 h-4" />
                ) : (
                  <Tv className="w-4 h-4" />
                )}
              </div>
              <div>
                <h3 className="text-base font-bold text-[#1C1C1C] dark:text-[#F3F2EE] mm-text">
                  Snapshot Export & Broadcast Studio
                </h3>
                <p className="text-xs text-[#1C1C1C]/65 dark:text-stone-400 mm-text">
                  4:5 Broadsheet Rate Card, 2-Page PDF နှင့် Burmese News Anchor FB/Video Script ထုတ်ယူရန်
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close export modal"
              className="p-1.5 text-[#1C1C1C]/60 hover:text-[#1C1C1C] dark:text-stone-400 dark:hover:text-white rounded-sm hover:bg-[#1C1C1C]/5 dark:hover:bg-stone-800 transition-colors cursor-pointer shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Primary Studio Tabs */}
          <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-[#1C1C1C]/10 dark:border-stone-800 pt-3">
            <button
              type="button"
              onClick={() => setStudioTab('rate_card')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-sm text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                studioTab === 'rate_card'
                  ? 'bg-[#004225] text-white border-[#004225]'
                  : 'bg-white dark:bg-[#1C1D1C] text-[#1C1C1C]/80 dark:text-stone-300 border-[#1C1C1C]/15 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Rate Card & PDF Studio</span>
            </button>

            <button
              type="button"
              onClick={() => setStudioTab('anchor_content')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-sm text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                studioTab === 'anchor_content'
                  ? 'bg-[#004225] text-white border-[#004225]'
                  : 'bg-white dark:bg-[#1C1D1C] text-[#1C1C1C]/80 dark:text-stone-300 border-[#1C1C1C]/15 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800'
              }`}
            >
              <Tv className="w-3.5 h-3.5" />
              <span>News Anchor Studio (FB Post & Video Script)</span>
            </button>
          </div>
        </div>

        {/* Workspace Viewport */}
        <div className="p-4 sm:p-6 max-h-[72vh] overflow-y-auto bg-[#F9F8F6] dark:bg-[#111211]">
          {studioTab === 'rate_card' ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left: 4:5 Broadsheet Rate Card Preview OR Structured Text */}
              <div className="lg:col-span-6 flex flex-col items-center">
                <div className="w-full max-w-[430px] mb-3 grid grid-cols-2 gap-1 p-1 bg-stone-200/80 dark:bg-stone-800 rounded-sm border border-[#1C1C1C]/10 dark:border-stone-700">
                  <button
                    type="button"
                    onClick={() => setPreviewMode('poster')}
                    className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-sm text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                      previewMode === 'poster'
                        ? 'bg-white dark:bg-[#1C1D1C] text-[#1C1C1C] dark:text-white shadow-xs'
                        : 'text-[#1C1C1C]/65 dark:text-stone-400 hover:text-[#1C1C1C]'
                    }`}
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>4:5 Rate Card</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode('text')}
                    className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-sm text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                      previewMode === 'text'
                        ? 'bg-white dark:bg-[#1C1D1C] text-[#1C1C1C] dark:text-white shadow-xs'
                        : 'text-[#1C1C1C]/65 dark:text-stone-400 hover:text-[#1C1C1C]'
                    }`}
                  >
                    <AlignLeft className="w-3.5 h-3.5" />
                    <span>Structured Text</span>
                  </button>
                </div>

                {previewMode === 'poster' ? (
                  <>
                    <div className="w-full max-w-[430px] aspect-[4/5] rounded-sm overflow-hidden bg-white border border-[#1C1C1C]/20 dark:border-stone-700 shadow-md relative flex items-center justify-center">
                      {posterDataUrl ? (
                        <img
                          src={posterDataUrl}
                          alt="4:5 Daily Market Rate Card Preview"
                          className={`w-full h-full object-contain transition-opacity duration-200 ${
                            isRendering ? 'opacity-65' : 'opacity-100'
                          }`}
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-2.5 text-[#1C1C1C]/70 text-xs p-6 text-center">
                          <RefreshCw className="w-4 h-4 animate-spin text-[#004225]" />
                          <span className="mm-text">4:5 Broadsheet Rate Card ပြင်ဆင်နေပါသည်...</span>
                        </div>
                      )}

                      {isRendering && posterDataUrl && (
                        <div className="absolute top-3 right-3 px-2.5 py-1 rounded-sm bg-[#004225]/90 text-[10px] font-medium text-white flex items-center gap-1.5">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          <span>Updating...</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-2.5 flex items-center justify-center gap-2 text-[11px] font-mono text-[#1C1C1C]/60 dark:text-stone-400">
                      <span>1080 × 1350 px (4:5)</span>
                      <span aria-hidden="true">·</span>
                      <span>Broadsheet Print Spec</span>
                    </div>
                  </>
                ) : (
                  <div className="w-full max-w-[430px] aspect-[4/5] rounded-sm overflow-hidden bg-white dark:bg-[#1C1D1C] border border-[#1C1C1C]/20 dark:border-stone-700 shadow-md flex flex-col">
                    <div className="p-3 border-b border-[#1C1C1C]/10 dark:border-stone-800 flex items-center justify-between gap-2 bg-[#F9F8F6] dark:bg-stone-900">
                      <div className="inline-flex rounded-sm bg-stone-200/70 dark:bg-stone-800 p-0.5 text-[11px] font-semibold">
                        <button
                          type="button"
                          onClick={() => setTextFormat('social')}
                          className={`px-2.5 py-1 rounded-sm transition-colors cursor-pointer ${
                            textFormat === 'social'
                              ? 'bg-white dark:bg-[#1C1D1C] text-[#1C1C1C] dark:text-white shadow-xs'
                              : 'text-[#1C1C1C]/65 dark:text-stone-400'
                          }`}
                        >
                          Social Brief
                        </button>
                        <button
                          type="button"
                          onClick={() => setTextFormat('detailed')}
                          className={`px-2.5 py-1 rounded-sm transition-colors cursor-pointer ${
                            textFormat === 'detailed'
                              ? 'bg-white dark:bg-[#1C1D1C] text-[#1C1C1C] dark:text-white shadow-xs'
                              : 'text-[#1C1C1C]/65 dark:text-stone-400'
                          }`}
                        >
                          Full Table
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={handleCopyText}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-sm text-[11px] font-semibold bg-[#004225] text-white hover:bg-[#005530] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        {copiedText ? <Check className="w-3 h-3 text-emerald-300" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedText ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>

                    <pre className="flex-1 p-3.5 overflow-y-auto text-[11.5px] leading-relaxed font-mono text-[#1C1C1C] dark:text-stone-200 whitespace-pre-wrap break-words select-all">
                      {structuredText}
                    </pre>
                  </div>
                )}
              </div>

              {/* Right: Configuration & Palette Controls */}
              <div className="lg:col-span-6 space-y-4">
                {/* Session Switch */}
                <div className="bg-white dark:bg-[#1C1D1C] border border-[#1C1C1C]/15 dark:border-stone-800 rounded-sm p-4 space-y-3">
                  <div className="text-xs font-bold text-[#1C1C1C] dark:text-white mm-text">
                    ၁။ ဈေးကွက်အချိန်ပိုင်း (Market Session)
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-stone-100 dark:bg-stone-900 rounded-sm border border-[#1C1C1C]/10 dark:border-stone-800">
                    <button
                      type="button"
                      onClick={() => setSelectedSession('morning')}
                      className={`py-2 px-3 rounded-sm text-xs font-semibold transition-all cursor-pointer ${
                        selectedSession === 'morning'
                          ? 'bg-[#004225] text-white'
                          : 'text-[#1C1C1C]/70 dark:text-stone-400 hover:text-[#1C1C1C]'
                      }`}
                    >
                      မနက်ပိုင်း (Morning)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedSession('evening')}
                      className={`py-2 px-3 rounded-sm text-xs font-semibold transition-all cursor-pointer ${
                        selectedSession === 'evening'
                          ? 'bg-[#004225] text-white'
                          : 'text-[#1C1C1C]/70 dark:text-stone-400 hover:text-[#1C1C1C]'
                      }`}
                    >
                      ညနေပိုင်း (Evening)
                    </button>
                  </div>
                </div>

                {/* Date, Gathered Time, Source & Brand */}
                <div className="bg-white dark:bg-[#1C1D1C] border border-[#1C1C1C]/15 dark:border-stone-800 rounded-sm p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#1C1C1C] dark:text-white flex items-center gap-1.5 mm-text">
                      <Calendar className="w-3.5 h-3.5 text-[#004225] dark:text-emerald-400" />
                      <span>၂။ နေ့စွဲ၊ စုစည်းချိန်၊ ရင်းမြစ်နှင့် Brand</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleResetDateAndTime}
                      className="text-[11px] font-semibold text-[#004225] dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Reset</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-medium text-[#1C1C1C]/65 dark:text-stone-400 mb-1">
                        နေ့စွဲ (Date)
                      </label>
                      <input
                        type="text"
                        value={dateValue}
                        onChange={(e) => setDateValue(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-mono bg-[#F9F8F6] dark:bg-stone-900 border border-[#1C1C1C]/15 dark:border-stone-700 rounded-sm text-[#1C1C1C] dark:text-white focus:outline-none focus:border-[#004225]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[#1C1C1C]/65 dark:text-stone-400 mb-1">
                        စုစည်းချိန် (Gathered Time)
                      </label>
                      <input
                        type="text"
                        value={gatheredTimeValue}
                        onChange={(e) => setGatheredTimeValue(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-mono bg-[#F9F8F6] dark:bg-stone-900 border border-[#1C1C1C]/15 dark:border-stone-700 rounded-sm text-[#1C1C1C] dark:text-white focus:outline-none focus:border-[#004225]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-medium text-[#1C1C1C]/65 dark:text-stone-400 mb-1">
                        ရင်းမြစ် (Source)
                      </label>
                      <input
                        type="text"
                        value={sourceValue}
                        onChange={(e) => setSourceValue(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-[#F9F8F6] dark:bg-stone-900 border border-[#1C1C1C]/15 dark:border-stone-700 rounded-sm text-[#1C1C1C] dark:text-white focus:outline-none focus:border-[#004225]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[#1C1C1C]/65 dark:text-stone-400 mb-1">
                        Brand Name
                      </label>
                      <input
                        type="text"
                        value={brandValue}
                        onChange={(e) => setBrandValue(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-[#F9F8F6] dark:bg-stone-900 border border-[#1C1C1C]/15 dark:border-stone-700 rounded-sm text-[#1C1C1C] dark:text-white focus:outline-none focus:border-[#004225]"
                      />
                    </div>
                  </div>
                </div>

                {/* Broadsheet Theme Selector */}
                <div className="bg-white dark:bg-[#1C1D1C] border border-[#1C1C1C]/15 dark:border-stone-800 rounded-sm p-4 space-y-2.5">
                  <div className="text-xs font-bold text-[#1C1C1C] dark:text-white">
                    ၃။ Editorial Rate Card Theme
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setHeaderTheme('editorial_green')}
                      className={`flex items-center gap-2.5 p-2.5 rounded-sm border text-left transition-all cursor-pointer ${
                        headerTheme === 'editorial_green'
                          ? 'border-[#004225] bg-[#004225]/5 dark:bg-emerald-500/10'
                          : 'border-[#1C1C1C]/15 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800'
                      }`}
                    >
                      <span className="w-4 h-4 rounded-xs bg-[#004225] shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[#1C1C1C] dark:text-white truncate">Editorial Forest</div>
                        <div className="text-[10px] text-[#1C1C1C]/60 dark:text-stone-400 truncate">Archival Ivory</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setHeaderTheme('navy')}
                      className={`flex items-center gap-2.5 p-2.5 rounded-sm border text-left transition-all cursor-pointer ${
                        headerTheme === 'navy'
                          ? 'border-[#004225] bg-[#004225]/5 dark:bg-emerald-500/10'
                          : 'border-[#1C1C1C]/15 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800'
                      }`}
                    >
                      <span className="w-4 h-4 rounded-xs bg-[#0A182E] shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[#1C1C1C] dark:text-white truncate">Reserve Navy</div>
                        <div className="text-[10px] text-[#1C1C1C]/60 dark:text-stone-400 truncate">Treasury Board</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setHeaderTheme('charcoal')}
                      className={`flex items-center gap-2.5 p-2.5 rounded-sm border text-left transition-all cursor-pointer ${
                        headerTheme === 'charcoal'
                          ? 'border-[#004225] bg-[#004225]/5 dark:bg-emerald-500/10'
                          : 'border-[#1C1C1C]/15 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800'
                      }`}
                    >
                      <span className="w-4 h-4 rounded-xs bg-[#1C1C1B] shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[#1C1C1C] dark:text-white truncate">Broadsheet Ink</div>
                        <div className="text-[10px] text-[#1C1C1C]/60 dark:text-stone-400 truncate">Financial Press</div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Live Board Verification */}
                <div className="bg-white dark:bg-[#1C1D1C] border border-[#1C1C1C]/15 dark:border-stone-800 rounded-sm p-4 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[#1C1C1C] dark:text-white mm-text">
                      တိကျသော ဈေးနှုန်းအချက်အလက် (Card Snapshot):
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyPrompt}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1C1C1C]/70 dark:text-stone-300 hover:text-[#004225] dark:hover:text-emerald-400 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      {copiedPrompt ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-700 dark:text-emerald-400" />
                          <span>Prompt Copied</span>
                        </>
                      ) : (
                        <>
                          <FileCode2 className="w-3 h-3" />
                          <span>Copy Prompt</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px] tabular-nums">
                    <div className="p-2.5 rounded-sm bg-[#F9F8F6] dark:bg-stone-900 border border-[#1C1C1C]/10 dark:border-stone-800 min-w-0">
                      <div className="text-[#1C1C1C]/60 dark:text-stone-400 font-sans text-[10px]">ရွှေ ၁၆ ပဲရည်</div>
                      <div className="font-bold text-[#9A5B04] dark:text-amber-400 truncate">{resolved.gold16Text}</div>
                    </div>
                    <div className="p-2.5 rounded-sm bg-[#F9F8F6] dark:bg-stone-900 border border-[#1C1C1C]/10 dark:border-stone-800 min-w-0">
                      <div className="text-[#1C1C1C]/60 dark:text-stone-400 font-sans text-[10px]">USD ရောင်း</div>
                      <div className="font-bold text-[#1C1C1C] dark:text-white truncate">{resolved.usdSellText}</div>
                    </div>
                    <div className="p-2.5 rounded-sm bg-[#F9F8F6] dark:bg-stone-900 border border-[#1C1C1C]/10 dark:border-stone-800 min-w-0">
                      <div className="text-[#1C1C1C]/60 dark:text-stone-400 font-sans text-[10px]">ဓာတ်ဆီ (92)</div>
                      <div className="font-bold text-[#1C1C1C] dark:text-white truncate">{resolved.octane92Text}</div>
                    </div>
                    <div className="p-2.5 rounded-sm bg-[#F9F8F6] dark:bg-stone-900 border border-[#1C1C1C]/10 dark:border-stone-800 min-w-0">
                      <div className="text-[#1C1C1C]/60 dark:text-stone-400 font-sans text-[10px]">စားအုန်းဆီ</div>
                      <div className="font-bold text-[#1C1C1C] dark:text-white truncate">{resolved.palmOilText}</div>
                    </div>
                  </div>
                </div>

                {renderError && (
                  <div className="p-3 rounded-sm bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-700 dark:text-rose-300">
                    {renderError}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* NEWS ANCHOR STUDIO TAB (Burmese Facebook Post + Video Script) */
            <div className="space-y-4">
              {/* Studio Control Header */}
              <div className="bg-white dark:bg-[#1C1D1C] border border-[#1C1C1C]/15 dark:border-stone-800 rounded-sm p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Mic className="w-4 h-4 text-[#004225] dark:text-emerald-400" />
                    <h4 className="text-sm font-bold text-[#1C1C1C] dark:text-white mm-text">
                      မြန်မာဘာသာ ဈေးကွက်သတင်းကြေညာစာသား (Burmese News Anchor Studio)
                    </h4>
                  </div>
                  <p className="text-xs text-[#1C1C1C]/65 dark:text-stone-400 mm-text">
                    လွန်ခဲ့သော ၂၄ နာရီအတွင်း ရွှေ၊ ဒေါ်လာ၊ စက်သုံးဆီနှင့် ကုန်ဈေးနှုန်း အခြေအနေအနှစ်ချုပ် Facebook Post နှင့် Teleprompter Video Script ကို တစ်ပြိုင်နက် ထုတ်ယူပါ
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {/* Session Selector */}
                  <div className="inline-flex rounded-sm bg-stone-100 dark:bg-stone-900 border border-[#1C1C1C]/10 dark:border-stone-800 p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setSelectedSession('morning')}
                      className={`px-2.5 py-1.5 rounded-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                        selectedSession === 'morning'
                          ? 'bg-white dark:bg-[#1C1D1C] text-[#1C1C1C] dark:text-white shadow-xs'
                          : 'text-[#1C1C1C]/65 dark:text-stone-400'
                      }`}
                    >
                      မနက်ပိုင်း
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedSession('evening')}
                      className={`px-2.5 py-1.5 rounded-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                        selectedSession === 'evening'
                          ? 'bg-white dark:bg-[#1C1D1C] text-[#1C1C1C] dark:text-white shadow-xs'
                          : 'text-[#1C1C1C]/65 dark:text-stone-400'
                      }`}
                    >
                      ညနေပိုင်း
                    </button>
                  </div>

                  {/* Bulletin Length Toggle */}
                  <div className="inline-flex rounded-sm bg-stone-100 dark:bg-stone-900 border border-[#1C1C1C]/10 dark:border-stone-800 p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setBulletinFormat('full_bulletin')}
                      className={`px-2.5 py-1.5 rounded-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                        bulletinFormat === 'full_bulletin'
                          ? 'bg-white dark:bg-[#1C1D1C] text-[#1C1C1C] dark:text-white shadow-xs'
                          : 'text-[#1C1C1C]/65 dark:text-stone-400'
                      }`}
                    >
                      60s Bulletin
                    </button>
                    <button
                      type="button"
                      onClick={() => setBulletinFormat('flash_brief')}
                      className={`px-2.5 py-1.5 rounded-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                        bulletinFormat === 'flash_brief'
                          ? 'bg-white dark:bg-[#1C1D1C] text-[#1C1C1C] dark:text-white shadow-xs'
                          : 'text-[#1C1C1C]/65 dark:text-stone-400'
                      }`}
                    >
                      30s Flash
                    </button>
                  </div>

                  {isSignedIn ? (
                    <button
                      type="button"
                      onClick={handleGenerateAnchorContent}
                      disabled={isGeneratingAnchor}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-sm text-xs font-bold bg-[#004225] hover:bg-[#005731] text-white transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
                    >
                      {isGeneratingAnchor ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                      )}
                      <span>
                        {isGeneratingAnchor
                          ? 'သတင်းလွှာ ရေးသားနေသည်...'
                          : anchorPayload
                          ? 'Regenerate Anchor Pack'
                          : 'Generate FB & Video Script'}
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onGoogleLogin?.()}
                      disabled={isLoggingIn}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-sm text-xs font-bold bg-[#004225] hover:bg-[#005731] text-white transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      <span>{isLoggingIn ? 'Signing in...' : 'Sign in with Google to Generate'}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Quota & Auth Note */}
              {localQuota && isSignedIn && (
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-sm bg-white dark:bg-[#1C1D1C] border border-[#1C1C1C]/10 dark:border-stone-800 text-[11px] text-[#1C1C1C]/70 dark:text-stone-400 font-mono tabular-nums">
                  <span>
                    AI Synthesis Quota Today: {localQuota.digestUsed}/{localQuota.digestLimit}
                  </span>
                  <span>Model: Gemini Broadcast Desk · Live 24h Market Context</span>
                </div>
              )}

              {anchorError && (
                <div className="p-3 rounded-sm bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{anchorError}</span>
                </div>
              )}

              {/* Generated Output OR Empty Studio Prompt */}
              {anchorPayload ? (
                <div className="space-y-4">
                  {/* Editorial Broadcast Headline Strip */}
                  <div className="bg-white dark:bg-[#1C1D1C] border border-[#1C1C1C]/15 dark:border-stone-800 rounded-sm p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#004225] dark:text-emerald-400">
                        ANCHOR HEADLINE · {anchorPayload.session === 'morning' ? 'MORNING' : 'EVENING'} BULLETIN
                      </div>
                      <div className="text-sm font-bold text-[#1C1C1C] dark:text-white mt-0.5 mm-text">
                        {anchorPayload.anchorHeadlineMm}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] font-mono text-[#1C1C1C]/65 dark:text-stone-400 shrink-0 tabular-nums">
                      <span>~{anchorPayload.estimatedDurationSec}s runtime</span>
                      <span>·</span>
                      <span>{anchorPayload.generatedAt}</span>
                    </div>
                  </div>

                  {/* Two-Column Content Output: Facebook Post (24h Report) & Video Script (Teleprompter) */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Left: Facebook Post Content (24h Market Summary) */}
                    <div className="bg-white dark:bg-[#1C1D1C] border border-[#1C1C1C]/15 dark:border-stone-800 rounded-sm flex flex-col overflow-hidden">
                      <div className="px-4 py-3 border-b border-[#1C1C1C]/10 dark:border-stone-800 bg-[#F9F8F6] dark:bg-stone-900 flex items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-bold text-[#1C1C1C] dark:text-white">
                            Facebook Post Content (Last 24 Hours)
                          </div>
                          <div className="text-[10px] text-[#1C1C1C]/60 dark:text-stone-400 font-mono tabular-nums">
                            {(editedFacebookPost ?? '').length.toLocaleString()} chars · Editable Burmese News Anchor Tone
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={handleCopyFacebookPost}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-semibold bg-[#004225] hover:bg-[#005731] text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
                        >
                          {copiedFbPost ? (
                            <Check className="w-3.5 h-3.5 text-emerald-300" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          <span>{copiedFbPost ? 'Copied FB Post' : 'Copy Post'}</span>
                        </button>
                      </div>

                      <textarea
                        value={editedFacebookPost ?? ''}
                        onChange={(e) => setEditedFacebookPost(e.target.value)}
                        rows={15}
                        className="w-full flex-1 p-4 text-xs leading-relaxed bg-white dark:bg-[#1C1D1C] text-[#1C1C1C] dark:text-stone-200 mm-text focus:outline-none resize-none"
                      />
                    </div>

                    {/* Right: Video Broadcast Script (Teleprompter Cue Sheet + Raw Editor) */}
                    <div className="bg-white dark:bg-[#1C1D1C] border border-[#1C1C1C]/15 dark:border-stone-800 rounded-sm flex flex-col overflow-hidden">
                      <div className="px-4 py-3 border-b border-[#1C1C1C]/10 dark:border-stone-800 bg-[#F9F8F6] dark:bg-stone-900 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Clapperboard className="w-3.5 h-3.5 text-[#004225] dark:text-emerald-400" />
                          <span className="text-xs font-bold text-[#1C1C1C] dark:text-white">
                            Video Broadcast Script
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <div className="inline-flex rounded-sm bg-stone-200/70 dark:bg-stone-800 p-0.5 text-[11px] font-semibold">
                            <button
                              type="button"
                              onClick={() => setScriptViewMode('cue_sheet')}
                              className={`px-2 py-1 rounded-sm cursor-pointer ${
                                scriptViewMode === 'cue_sheet'
                                  ? 'bg-white dark:bg-[#1C1D1C] text-[#1C1C1C] dark:text-white shadow-xs'
                                  : 'text-[#1C1C1C]/65 dark:text-stone-400'
                              }`}
                            >
                              Cue Sheet
                            </button>
                            <button
                              type="button"
                              onClick={() => setScriptViewMode('raw_editor')}
                              className={`px-2 py-1 rounded-sm cursor-pointer ${
                                scriptViewMode === 'raw_editor'
                                  ? 'bg-white dark:bg-[#1C1D1C] text-[#1C1C1C] dark:text-white shadow-xs'
                                  : 'text-[#1C1C1C]/65 dark:text-stone-400'
                              }`}
                            >
                              Edit Script
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={handleCopyVideoScript}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-sm text-xs font-semibold bg-[#004225] hover:bg-[#005731] text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
                          >
                            {copiedVideoScript ? (
                              <Check className="w-3.5 h-3.5 text-emerald-300" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            <span>{copiedVideoScript ? 'Copied' : 'Copy'}</span>
                          </button>
                        </div>
                      </div>

                      {scriptViewMode === 'cue_sheet' &&
                      Array.isArray(anchorPayload.scriptSections) &&
                      anchorPayload.scriptSections.length > 0 ? (
                        <div className="flex-1 max-h-[380px] overflow-y-auto divide-y divide-[#1C1C1C]/10 dark:divide-stone-800">
                          {anchorPayload.scriptSections.map((sec, idx) => (
                            <div key={`${sec.cueLabel}-${idx}`} className="p-3.5 space-y-1.5">
                              <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                                <span className="font-bold text-[#004225] dark:text-emerald-400">
                                  {sec.cueLabel}
                                </span>
                                <span className="text-[#1C1C1C]/55 dark:text-stone-400 tabular-nums">
                                  {sec.timingHint}
                                </span>
                              </div>
                              <p className="text-xs leading-relaxed text-[#1C1C1C] dark:text-stone-200 mm-text whitespace-pre-wrap">
                                {sec.scriptMm}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <textarea
                          value={editedVideoScript ?? ''}
                          onChange={(e) => setEditedVideoScript(e.target.value)}
                          rows={15}
                          className="w-full flex-1 p-4 text-xs leading-relaxed bg-white dark:bg-[#1C1D1C] text-[#1C1C1C] dark:text-stone-200 mm-text focus:outline-none resize-none"
                        />
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white dark:bg-[#1C1D1C] border border-[#1C1C1C]/15 dark:border-stone-800 rounded-sm p-6 sm:p-8 text-center space-y-3">
                  <div className="w-10 h-10 rounded-sm bg-[#004225]/10 dark:bg-emerald-500/15 text-[#004225] dark:text-emerald-400 flex items-center justify-center mx-auto">
                    <Tv className="w-5 h-5" />
                  </div>
                  <div className="max-w-xl mx-auto space-y-1.5">
                    <h5 className="text-sm font-bold text-[#1C1C1C] dark:text-white mm-text">
                      Burmese News Anchor Broadcast Pack (24-Hour Market Reporting)
                    </h5>
                    <p className="text-xs text-[#1C1C1C]/65 dark:text-stone-400 leading-relaxed mm-text">
                      လက်ရှိ ရရှိထားသော ရွှေဈေး (၁၆/၁၅ ပဲရည် + ကမ္ဘာ့ရွှေ)၊ ဒေါ်လာ/စင်ကာပူ/ထိုင်းဘတ် ဝယ်-ရောင်းနှုန်းနှင့် ၂၄ နာရီ အတက်အကျ၊ စက်သုံးဆီနှင့် စားအုန်းဆီ/ဆန်ဈေး အချက်အလက်များကို အခြေခံ၍ သတင်းကြေညာသူ (News Anchor) လေသံဖြင့် Facebook Post နှင့် Video Teleprompter Script များကို ဖန်တီးပေးပါမည်။
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions Bar */}
        <div className="px-4 sm:px-6 py-3.5 bg-white dark:bg-[#161716] border-t border-[#1C1C1C]/15 dark:border-stone-800 flex flex-wrap items-center justify-between gap-3">
          {studioTab === 'rate_card' ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyText}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#1C1C1C] dark:text-stone-200 bg-[#F9F8F6] dark:bg-stone-800 border border-[#1C1C1C]/20 dark:border-stone-700 hover:bg-stone-200/70 dark:hover:bg-stone-700 rounded-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  {copiedText ? (
                    <Check className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {copiedText
                      ? 'Copied!'
                      : `Copy Text (${textFormat === 'social' ? 'Social' : 'Full'})`}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handlePrint}
                  aria-label="Print page"
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#1C1C1C]/80 dark:text-stone-300 bg-[#F9F8F6] dark:bg-stone-800 border border-[#1C1C1C]/15 dark:border-stone-700 hover:bg-stone-200/70 dark:hover:bg-stone-700 rounded-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {canNativeShare && (
                  <button
                    type="button"
                    onClick={handleShareImage}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#1C1C1C] dark:text-white bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 rounded-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>{shareStatus || 'Share'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={isExportingPdf || (isRendering && !posterDataUrl)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-[#1C1C1C] bg-amber-300 hover:bg-amber-400 dark:text-stone-950 dark:bg-amber-400 dark:hover:bg-amber-300 rounded-sm transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  {isExportingPdf ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : pdfSuccess ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <FileText className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {isExportingPdf
                      ? 'Preparing PDF...'
                      : pdfSuccess
                      ? 'PDF Saved!'
                      : 'Save PDF (2-Page)'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadImage}
                  disabled={isRendering && !posterDataUrl}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#004225] hover:bg-[#005731] rounded-sm transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Save PNG (4:5)</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="text-xs text-[#1C1C1C]/65 dark:text-stone-400 mm-text">
                {anchorPayload
                  ? 'စာသားများကို လိုအပ်သလို တည်းဖြတ်ပြီး Clipboard သို့ ကူးယူခြင်း (သို့) TXT ဖိုင်အဖြစ် သိမ်းဆည်းနိုင်ပါသည်။'
                  : 'Generate ကို နှိပ်၍ ၂၄ နာရီ ဈေးကွက်သတင်းလွှာကို ဖန်တီးပါ။'}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {anchorPayload && (
                  <button
                    type="button"
                    onClick={handleDownloadBroadcastTxt}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-[#004225] hover:bg-[#005731] rounded-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Script Pack (.TXT)</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setStudioTab('rate_card')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#1C1C1C] dark:text-stone-200 bg-[#F9F8F6] dark:bg-stone-800 border border-[#1C1C1C]/15 dark:border-stone-700 hover:bg-stone-200/70 rounded-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>Back to 4:5 Card</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
