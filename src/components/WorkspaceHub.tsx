import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
  FileSpreadsheet,
  Presentation,
  ExternalLink,
  RefreshCw,
  Plus,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Database,
  LogOut,
  Search,
  Download,
  X,
} from 'lucide-react';
import { GoogleSignInButton } from './GoogleSignInButton';
import { StoredDigestRecord } from '../firebase';
import {
  DriveFileItem,
  SpreadsheetMeta,
  PresentationMeta,
  MarketExportPayload,
  listUserSpreadsheets,
  listUserPresentations,
  getSpreadsheetMetadata,
  readSheetRange,
  createMarketSpreadsheet,
  syncMarketToExistingSheet,
  getPresentationMetadata,
  createMarketBriefingDeck,
  appendBriefingSlideToDeck,
} from '../services/googleWorkspace';

interface WorkspaceHubProps {
  user: User | null;
  accessToken: string | null;
  isLoggingIn: boolean;
  onGoogleLogin: () => void;
  onLogout: () => void;
  exportPayload: MarketExportPayload;
  savedDigests: StoredDigestRecord[];
  onSaveDigestToCloud: (workspaceUrl?: string) => Promise<void>;
  onImportRatesFromSheet?: (rows: string[][]) => void;
}

interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
}

export const WorkspaceHub: React.FC<WorkspaceHubProps> = ({
  user,
  accessToken,
  isLoggingIn,
  onGoogleLogin,
  onLogout,
  exportPayload,
  savedDigests,
  onSaveDigestToCloud,
  onImportRatesFromSheet,
}) => {
  const [activeService, setActiveService] = useState<'sheets' | 'slides' | 'cloud'>('sheets');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string; url?: string } | null>(null);
  const [isBusy, setIsBusy] = useState<boolean>(false);

  // Google Sheets state
  const [spreadsheets, setSpreadsheets] = useState<DriveFileItem[]>([]);
  const [sheetIdInput, setSheetIdInput] = useState<string>('');
  const [selectedSheetMeta, setSelectedSheetMeta] = useState<SpreadsheetMeta | null>(null);
  const [selectedTabTitle, setSelectedTabTitle] = useState<string>('');
  const [sheetRowsPreview, setSheetRowsPreview] = useState<string[][]>([]);
  const [newSheetTitle, setNewSheetTitle] = useState<string>(
    `Myanmar Market Watch (${new Date().toISOString().slice(0, 10)})`
  );

  // Google Slides state
  const [presentations, setPresentations] = useState<DriveFileItem[]>([]);
  const [slideIdInput, setSlideIdInput] = useState<string>('');
  const [selectedPresMeta, setSelectedPresMeta] = useState<PresentationMeta | null>(null);
  const [newDeckTitle, setNewDeckTitle] = useState<string>(
    `Myanmar Market Briefing - ${new Date().toISOString().slice(0, 10)}`
  );

  // Mandatory Confirmation Dialog state
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    isOpen: false,
    title: '',
    description: '',
    confirmLabel: 'Confirm',
    onConfirm: async () => {},
  });

  const loadDriveFiles = async () => {
    if (!accessToken) return;
    setIsBusy(true);
    setStatusMessage(null);
    try {
      const [sheetsList, slidesList] = await Promise.all([
        listUserSpreadsheets(accessToken),
        listUserPresentations(accessToken),
      ]);
      setSpreadsheets(sheetsList);
      setPresentations(slidesList);
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Google Drive ဖိုင်စာရင်း ရယူရာတွင် အမှားဖြစ်ပွားပါသည်။',
      });
    } finally {
      setIsBusy(false);
    }
  };

  useEffect(() => {
    if (accessToken) {
      loadDriveFiles();
    }
  }, [accessToken]);

  const handleInspectSpreadsheet = async (idOrUrl: string) => {
    if (!accessToken || !idOrUrl.trim()) return;
    setIsBusy(true);
    setStatusMessage(null);
    try {
      const meta = await getSpreadsheetMetadata(accessToken, idOrUrl);
      setSelectedSheetMeta(meta);
      setSheetIdInput(meta.spreadsheetId);
      const firstTab = meta.sheets[0]?.title || '';
      setSelectedTabTitle(firstTab);
      if (firstTab) {
        const rows = await readSheetRange(accessToken, meta.spreadsheetId, firstTab);
        setSheetRowsPreview(rows);
      } else {
        setSheetRowsPreview([]);
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Spreadsheet ဖတ်ရှုမရပါ။' });
    } finally {
      setIsBusy(false);
    }
  };

  const handleSelectSheetTab = async (tabTitle: string) => {
    setSelectedTabTitle(tabTitle);
    if (!accessToken || !selectedSheetMeta) return;
    setIsBusy(true);
    try {
      const rows = await readSheetRange(accessToken, selectedSheetMeta.spreadsheetId, tabTitle);
      setSheetRowsPreview(rows);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Sheet tab ဖတ်ရှုမရပါ။' });
    } finally {
      setIsBusy(false);
    }
  };

  const handleCreateSpreadsheet = async () => {
    if (!accessToken) return;
    setIsBusy(true);
    setStatusMessage(null);
    try {
      const created = await createMarketSpreadsheet(accessToken, newSheetTitle.trim() || 'Myanmar Market Watch', exportPayload);
      await onSaveDigestToCloud(created.spreadsheetUrl);
      setStatusMessage({
        type: 'success',
        text: `Google Sheet အသစ် "${created.title}" ကို အောင်မြင်စွာ ဖန်တီးပြီးပါပြီ။`,
        url: created.spreadsheetUrl,
      });
      await loadDriveFiles();
      await handleInspectSpreadsheet(created.spreadsheetId);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Google Sheet ဖန်တီးမှု မအောင်မြင်ပါ။' });
    } finally {
      setIsBusy(false);
    }
  };

  const requestUpdateExistingSheet = (mode: 'append' | 'overwrite') => {
    if (!selectedSheetMeta || !selectedTabTitle) return;
    const actionLabel = mode === 'append' ? 'Append New Session Rows' : 'Overwrite Tab Contents';
    setConfirmDialog({
      isOpen: true,
      title: `${actionLabel}: "${selectedSheetMeta.title}"`,
      description:
        mode === 'overwrite'
          ? `သင်သည် "${selectedSheetMeta.title}" ရှိ "${selectedTabTitle}" tab အတွင်းရှိ အချက်အလက်များကို ယနေ့ဈေးကွက်စာရင်းအသစ်ဖြင့် အစားထိုးရေးသား (Overwrite) တော့မည် ဖြစ်ပါသည်။ ယခင်ဒေတာများ ပျက်ပြယ်နိုင်ပါသည်။`
          : `သင်သည် "${selectedSheetMeta.title}" ရှိ "${selectedTabTitle}" tab ၏ အောက်ဆုံးတွင် ယနေ့ မနက်/ညနေ ဈေးကွက်စာရင်းအသစ် ထပ်မံဖြည့်သွင်း (Append) တော့မည် ဖြစ်ပါသည်။`,
      confirmLabel: mode === 'overwrite' ? 'အစားထိုးရေးသားမည် (Overwrite)' : 'ထပ်မံဖြည့်သွင်းမည် (Append)',
      onConfirm: async () => {
        if (!accessToken) return;
        setIsBusy(true);
        setStatusMessage(null);
        try {
          await syncMarketToExistingSheet(
            accessToken,
            selectedSheetMeta.spreadsheetId,
            selectedTabTitle,
            exportPayload,
            mode
          );
          await onSaveDigestToCloud(selectedSheetMeta.spreadsheetUrl);
          const rows = await readSheetRange(accessToken, selectedSheetMeta.spreadsheetId, selectedTabTitle);
          setSheetRowsPreview(rows);
          setStatusMessage({
            type: 'success',
            text: `"${selectedSheetMeta.title}" (${selectedTabTitle}) သို့ အချက်အလက်များ အောင်မြင်စွာ သိမ်းဆည်းပြီးပါပြီ။`,
            url: selectedSheetMeta.spreadsheetUrl,
          });
        } catch (err: any) {
          setStatusMessage({ type: 'error', text: err?.message || 'Google Sheet ပြင်ဆင်မှု မအောင်မြင်ပါ။' });
        } finally {
          setIsBusy(false);
        }
      },
    });
  };

  const handleInspectPresentation = async (idOrUrl: string) => {
    if (!accessToken || !idOrUrl.trim()) return;
    setIsBusy(true);
    setStatusMessage(null);
    try {
      const meta = await getPresentationMetadata(accessToken, idOrUrl);
      setSelectedPresMeta(meta);
      setSlideIdInput(meta.presentationId);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Presentation ဖတ်ရှုမရပါ။' });
    } finally {
      setIsBusy(false);
    }
  };

  const handleCreateDeck = async () => {
    if (!accessToken) return;
    setIsBusy(true);
    setStatusMessage(null);
    try {
      const created = await createMarketBriefingDeck(
        accessToken,
        newDeckTitle.trim() || 'Myanmar Market Briefing',
        exportPayload
      );
      await onSaveDigestToCloud(created.presentationUrl);
      setStatusMessage({
        type: 'success',
        text: `Google Slides ရှင်းလင်းချက်အသစ် "${created.title}" (4 Slides) ကို ဖန်တီးပြီးပါပြီ။`,
        url: created.presentationUrl,
      });
      await loadDriveFiles();
      await handleInspectPresentation(created.presentationId);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Google Slides ဖန်တီးမှု မအောင်မြင်ပါ။' });
    } finally {
      setIsBusy(false);
    }
  };

  const requestAppendSlide = () => {
    if (!selectedPresMeta) return;
    setConfirmDialog({
      isOpen: true,
      title: `Add New Briefing Slide to "${selectedPresMeta.title}"`,
      description: `သင်သည် "${selectedPresMeta.title}" (လက်ရှိ Slide ${selectedPresMeta.slideCount} ခု) ထဲသို့ ယနေ့ မနက်/ညနေ ဈေးကွက်အနှစ်ချုပ် Slide အသစ်တစ်ခု ထပ်မံထည့်သွင်းတော့မည် ဖြစ်ပါသည်။`,
      confirmLabel: 'Slide အသစ် ထည့်သွင်းမည်',
      onConfirm: async () => {
        if (!accessToken) return;
        setIsBusy(true);
        setStatusMessage(null);
        try {
          const res = await appendBriefingSlideToDeck(accessToken, selectedPresMeta.presentationId, exportPayload);
          await onSaveDigestToCloud(res.presentationUrl);
          await handleInspectPresentation(selectedPresMeta.presentationId);
          setStatusMessage({
            type: 'success',
            text: `"${selectedPresMeta.title}" ထဲသို့ Slide အသစ် အောင်မြင်စွာ ထည့်သွင်းပြီးပါပြီ။`,
            url: res.presentationUrl,
          });
        } catch (err: any) {
          setStatusMessage({ type: 'error', text: err?.message || 'Slide ထည့်သွင်းမှု မအောင်မြင်ပါ။' });
        } finally {
          setIsBusy(false);
        }
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Header & Google Auth Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Google Workspace (Sheets & Slides) နှင့် Cloud Sync ချိတ်ဆက်မှု
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              နေ့စဉ် ရွှေ၊ ငွေလဲနှုန်းနှင့် ကုန်စည်စာရင်းများကို Google Sheets တွင် သိမ်းဆည်းခြင်း၊ Google Slides အစီရင်ခံစာ ထုတ်ယူခြင်းနှင့် Firebase Cloud Sync
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {user ? (
              <div className="flex items-center gap-3">
                <div className="text-right text-xs">
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {user.displayName || user.email}
                  </div>
                  <div className="text-xs text-slate-500 font-mono">
                    {accessToken ? 'Workspace Connected' : 'Firebase Signed In · Reconnect for Sheets/Slides'}
                  </div>
                </div>
                {!accessToken && (
                  <GoogleSignInButton
                    onClick={onGoogleLogin}
                    disabled={isLoggingIn}
                    label="Connect Sheets & Slides"
                  />
                )}
                <button
                  onClick={onLogout}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>ထွက်ရန်</span>
                </button>
              </div>
            ) : (
              <GoogleSignInButton onClick={onGoogleLogin} disabled={isLoggingIn} />
            )}
          </div>
        </div>
      </div>

      {/* Require Auth Prompt if not connected */}
      {!user || !accessToken ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center space-y-4">
          <div className="flex items-center justify-center gap-4 text-slate-400">
            <FileSpreadsheet className="w-8 h-8 text-emerald-500" />
            <Presentation className="w-8 h-8 text-amber-500" />
            <Database className="w-8 h-8 text-blue-500" />
          </div>
          <div className="max-w-lg mx-auto space-y-1.5">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Google Sheets, Google Slides နှင့် Cloud Sync အသုံးပြုရန် Google Account ဖြင့် ဝင်ရောက်ပါ
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mm-text">
              သင့်ခွင့်ပြုချက်ဖြင့် နေ့စဉ်ဈေးကွက်ဒေတာများကို Google Sheets စာရင်းဇယားများအဖြစ် ထုတ်ယူခြင်း၊ Google Slides တင်ဆက်မှုဖိုင်များ ဖန်တီးခြင်းနှင့် Firebase တွင် သင့်စိတ်ကြိုက်ဈေးနှုန်း/သတိပေးချက်များကို သိမ်းဆည်းနိုင်ပါသည်။
            </p>
          </div>
          <div className="flex justify-center pt-1">
            <GoogleSignInButton
              onClick={onGoogleLogin}
              disabled={isLoggingIn}
              label={user ? 'Authorize Google Sheets & Slides' : 'Sign in with Google'}
            />
          </div>
        </div>
      ) : (
        <>
          {/* Service Sub-tabs */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex flex-wrap max-w-full bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setActiveService('sheets')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  activeService === 'sheets'
                    ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 font-semibold shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Google Sheets ({spreadsheets.length})</span>
              </button>
              <button
                onClick={() => setActiveService('slides')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  activeService === 'slides'
                    ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 font-semibold shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Presentation className="w-3.5 h-3.5" />
                <span>Google Slides ({presentations.length})</span>
              </button>
              <button
                onClick={() => setActiveService('cloud')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  activeService === 'cloud'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 font-semibold shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Database className="w-3.5 h-3.5" />
                <span>Firebase Cloud History ({savedDigests.length})</span>
              </button>
            </div>

            <button
              onClick={loadDriveFiles}
              disabled={isBusy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} />
              <span>Drive စာရင်း ပြန်ယူရန်</span>
            </button>
          </div>

          {/* Status Feedback Banner */}
          {statusMessage && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-3 ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {statusMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                )}
                <span>{statusMessage.text}</span>
              </div>
              {statusMessage.url && (
                <a
                  href={statusMessage.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold underline hover:opacity-80"
                >
                  <span>ဖွင့်ကြည့်ရန်</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          )}

          {/* GOOGLE SHEETS PANEL */}
          {activeService === 'sheets' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Create & Browse */}
              <div className="lg:col-span-5 space-y-4">
                {/* Create New Spreadsheet */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Plus className="w-4 h-4 text-emerald-500" />
                    <span>ဈေးကွက်စာရင်း Google Sheet အသစ်ဖန်တီးရန်</span>
                  </h3>
                  <input
                    type="text"
                    value={newSheetTitle}
                    onChange={(e) => setNewSheetTitle(e.target.value)}
                    placeholder="Spreadsheet Title..."
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                  <button
                    onClick={handleCreateSpreadsheet}
                    disabled={isBusy}
                    className="w-full py-2 px-4 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {isBusy ? 'ဖန်တီးနေပါသည်...' : 'Google Sheet အသစ်ထုတ်မည်'}
                  </button>
                </div>

                {/* Open by URL/ID or Pick from Drive */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    ရှိပြီးသား Google Sheets များ (Google Drive)
                  </h3>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={sheetIdInput}
                      onChange={(e) => setSheetIdInput(e.target.value)}
                      placeholder="Google Sheet URL သို့မဟုတ် ID ထည့်ပါ..."
                      className="flex-1 px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                    />
                    <button
                      onClick={() => handleInspectSpreadsheet(sheetIdInput)}
                      disabled={isBusy || !sheetIdInput.trim()}
                      className="px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-700 text-white rounded-lg cursor-pointer disabled:opacity-50"
                    >
                      <Search className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
                    {spreadsheets.length === 0 ? (
                      <div className="py-6 text-center text-xs text-slate-500">
                        Google Drive တွင် Spreadsheet မတွေ့သေးပါ။ အသစ်တစ်ခု ဖန်တီးကြည့်ပါ။
                      </div>
                    ) : (
                      spreadsheets.map((file) => (
                        <div
                          key={file.id}
                          className="py-2.5 flex items-center justify-between gap-2 text-xs"
                        >
                          <button
                            onClick={() => handleInspectSpreadsheet(file.id)}
                            className="text-left flex-1 truncate font-medium text-slate-800 dark:text-slate-200 hover:text-emerald-500 cursor-pointer"
                          >
                            {file.name}
                          </button>
                          {file.webViewLink && (
                            <a
                              href={file.webViewLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Sheet Tab Inspector & Sync Actions */}
              <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-4">
                {selectedSheetMeta ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                          {selectedSheetMeta.title}
                        </h3>
                        <div className="text-xs text-slate-500 font-mono">
                          Tabs: {selectedSheetMeta.sheets.map((s) => s.title).join(' · ')}
                        </div>
                      </div>
                      <a
                        href={selectedSheetMeta.spreadsheetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                      >
                        <span>Google Sheets တွင်ဖွင့်ရန်</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>

                    {/* Dynamic Sheet Tab Selector */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {selectedSheetMeta.sheets.map((tab) => (
                          <button
                            key={tab.sheetId}
                            onClick={() => handleSelectSheetTab(tab.title)}
                            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                              selectedTabTitle === tab.title
                                ? 'bg-emerald-600 text-white font-semibold'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {tab.title}
                          </button>
                        ))}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {onImportRatesFromSheet && sheetRowsPreview.length > 0 && (
                          <button
                            onClick={() => {
                              onImportRatesFromSheet(sheetRowsPreview);
                              setStatusMessage({
                                type: 'success',
                                text: 'Google Sheet မှ ဈေးနှုန်းများကို Dashboard သို့ တင်သွင်းပြီးပါပြီ။',
                              });
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>ဈေးနှုန်းသွင်းမည်</span>
                          </button>
                        )}
                        <button
                          onClick={() => requestUpdateExistingSheet('append')}
                          disabled={isBusy}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white rounded-lg cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Append Today</span>
                        </button>
                        <button
                          onClick={() => requestUpdateExistingSheet('overwrite')}
                          disabled={isBusy}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>Overwrite Tab</span>
                        </button>
                      </div>
                    </div>

                    {/* Preview Table */}
                    <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg max-h-80">
                      {sheetRowsPreview.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-500">
                          ဤ Tab တွင် ဒေတာမရှိသေးပါ။
                        </div>
                      ) : (
                        <table className="w-full text-left text-xs border-collapse">
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {sheetRowsPreview.map((row, rIdx) => (
                              <tr
                                key={rIdx}
                                className={rIdx === 0 || rIdx === 1 ? 'bg-slate-50 dark:bg-slate-800/60 font-semibold' : ''}
                              >
                                {row.map((cell, cIdx) => (
                                  <td key={cIdx} className="py-2 px-3 whitespace-nowrap num-tabular text-xs">
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="h-64 flex flex-col items-center justify-center text-center text-xs text-slate-500 space-y-2">
                    <FileSpreadsheet className="w-8 h-8 text-slate-400" />
                    <div>ဘယ်ဘက်စာရင်းမှ Google Sheet တစ်ခုကို ရွေးချယ်ကြည့်ရှုပါ သို့မဟုတ် အသစ်ဖန်တီးပါ။</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* GOOGLE SLIDES PANEL */}
          {activeService === 'slides' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Create & Browse */}
              <div className="lg:col-span-5 space-y-4">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Plus className="w-4 h-4 text-amber-500" />
                    <span>နေ့စဉ်ဈေးကွက် Briefing Deck (Google Slides) ဖန်တီးရန်</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mm-text">
                    မျက်နှာဖုံး၊ AI သုံးသပ်ချက်၊ ရွှေ/ဒေါ်လာ နှိုင်းယှဉ်ချက်နှင့် ကုန်စည်/အိမ်ထောင်စု ကုန်ကျစရိတ် Slide 4 ခုကို အလိုအလျောက် တည်ဆောက်ပေးပါမည်။
                  </p>
                  <input
                    type="text"
                    value={newDeckTitle}
                    onChange={(e) => setNewDeckTitle(e.target.value)}
                    placeholder="Presentation Title..."
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                  <button
                    onClick={handleCreateDeck}
                    disabled={isBusy}
                    className="w-full py-2 px-4 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {isBusy ? 'Slide Deck ဖန်တီးနေပါသည်...' : 'Google Slides Deck အသစ်ထုတ်မည်'}
                  </button>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    ရှိပြီးသား Google Slides များ
                  </h3>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={slideIdInput}
                      onChange={(e) => setSlideIdInput(e.target.value)}
                      placeholder="Presentation URL သို့မဟုတ် ID..."
                      className="flex-1 px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                    />
                    <button
                      onClick={() => handleInspectPresentation(slideIdInput)}
                      disabled={isBusy || !slideIdInput.trim()}
                      className="px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-700 text-white rounded-lg cursor-pointer disabled:opacity-50"
                    >
                      <Search className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
                    {presentations.length === 0 ? (
                      <div className="py-6 text-center text-xs text-slate-500">
                        Google Drive တွင် Presentation မတွေ့သေးပါ။
                      </div>
                    ) : (
                      presentations.map((file) => (
                        <div
                          key={file.id}
                          className="py-2.5 flex items-center justify-between gap-2 text-xs"
                        >
                          <button
                            onClick={() => handleInspectPresentation(file.id)}
                            className="text-left flex-1 truncate font-medium text-slate-800 dark:text-slate-200 hover:text-amber-500 cursor-pointer"
                          >
                            {file.name}
                          </button>
                          {file.webViewLink && (
                            <a
                              href={file.webViewLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Presentation Inspector & Append Slide */}
              <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
                {selectedPresMeta ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                      <div>
                        <h3 className="text-base font-bold text-slate-900 dark:text-white">
                          {selectedPresMeta.title}
                        </h3>
                        <div className="text-xs text-slate-500 font-mono">
                          စုစုပေါင်း Slide အရေအတွက်: {selectedPresMeta.slideCount} ခု
                        </div>
                      </div>
                      <a
                        href={selectedPresMeta.presentationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline"
                      >
                        <span>Google Slides တွင်ဖွင့်ရန်</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3 text-xs">
                      <div className="font-semibold text-slate-900 dark:text-white mm-text">
                        ယနေ့ဈေးကွက်အနှစ်ချုပ် Slide ထပ်ပေါင်းထည့်သွင်းရန် ({exportPayload.session === 'morning' ? 'မနက်ပိုင်း' : 'ညနေပိုင်း'})
                      </div>
                      <p className="text-slate-500 mm-text">
                        {exportPayload.digest.headlineMm}
                      </p>
                      <button
                        onClick={requestAppendSlide}
                        disabled={isBusy}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Slide အသစ် ထပ်ပေါင်းထည့်မည်</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="h-64 flex flex-col items-center justify-center text-center text-xs text-slate-500 space-y-2">
                    <Presentation className="w-8 h-8 text-slate-400" />
                    <div>ဘယ်ဘက်စာရင်းမှ Google Slides ဖိုင်တစ်ခုကို ရွေးချယ်ပါ သို့မဟုတ် Deck အသစ်တစ်ခု ဖန်တီးပါ။</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* FIREBASE CLOUD DIGESTS HISTORY */}
          {activeService === 'cloud' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Firebase Cloud တွင် သိမ်းဆည်းထားသော နေ့စဉ်အနှစ်ချုပ်မှတ်တမ်းများ
                  </h3>
                  <p className="text-xs text-slate-500 mm-text">
                    သင်သိမ်းဆည်းထားသော AI ဈေးကွက်သုံးသပ်ချက်များနှင့် Google Sheets/Slides လင့်ခ်များ
                  </p>
                </div>
                <button
                  onClick={() => onSaveDigestToCloud()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>လက်ရှိသုံးသပ်ချက်ကို Cloud တွင် သိမ်းရန်</span>
                </button>
              </div>

              {savedDigests.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                  Firebase Cloud တွင် သိမ်းဆည်းထားသော မှတ်တမ်း မရှိသေးပါ။
                </div>
              ) : (
                <div className="space-y-3">
                  {savedDigests.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-xs space-y-1.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                        <span>
                          {item.date} · {item.session === 'morning' ? 'မနက်ပိုင်း' : 'ညနေပိုင်း'} · {item.marketSentiment}
                        </span>
                        {item.workspaceUrl && (
                          <a
                            href={item.workspaceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold hover:underline"
                          >
                            <span>Workspace ဖိုင်ဖွင့်ရန်</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                      <div className="font-bold text-slate-900 dark:text-white">{item.headlineMm}</div>
                      <div className="text-slate-500 italic">{item.headlineEn}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Mandatory User Confirmation Dialog for Destructive / Mutating Operations */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>အတည်ပြုချက် လိုအပ်ပါသည် (Confirm Update)</span>
              </div>
              <button
                onClick={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs">
              <div className="font-bold text-slate-900 dark:text-white text-sm">
                {confirmDialog.title}
              </div>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                {confirmDialog.description}
              </p>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
              >
                မလုပ်တော့ပါ (Cancel)
              </button>
              <button
                onClick={async () => {
                  const fn = confirmDialog.onConfirm;
                  setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
                  await fn();
                }}
                className="px-4 py-2 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg cursor-pointer"
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
