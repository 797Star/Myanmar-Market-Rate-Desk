/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { MarketSession } from './types';
import {
  initialCommodityQuotes,
  initialCurrencyQuotes,
  initialGoldQuotes,
  initialInflationBasket,
} from './data/initialData';
import { formatGatheredTimeMm } from './utils/posterGenerator';
import { getCurrentYangonSession } from './utils/quoteHelpers';
import { updateUserPreferences } from './firebase';
import { useUserPersistence } from './hooks/useUserPersistence';
import { useMarketDashboard } from './hooks/useMarketDashboard';

import { Navbar } from './components/Navbar';
import { TickerBar } from './components/TickerBar';
import { MarketNewsTicker } from './components/MarketNewsTicker';
import { SessionBanner } from './components/SessionBanner';
import { MarketSourceBadge } from './components/MarketSourceBadge';
import { AiDigestCard } from './components/AiDigestCard';
import { MarketRateCardsSection, BenchmarkAlertKey } from './components/MarketRateCardsSection';
import { MajorMarketRateCards } from './components/MajorMarketRateCards';
import { OfficialVsMarketCard } from './components/OfficialVsMarketCard';
import { GoldSection } from './components/GoldSection';
import { CurrencySection } from './components/CurrencySection';
import { CommoditySection } from './components/CommoditySection';
import { InflationBasketSection } from './components/InflationBasketSection';
import { IntelligenceFeed } from './components/IntelligenceFeed';
import { WorkspaceHub } from './components/WorkspaceHub';
import { CalculatorModal } from './components/CalculatorModal';
import { ExportModal } from './components/ExportModal';
import { AlertsModal } from './components/AlertsModal';
import { CustomRateModal } from './components/CustomRateModal';

export default function App() {
  const [currentSession, setCurrentSession] = useState<MarketSession>(() =>
    getCurrentYangonSession()
  );
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [isDark, setIsDark] = useState<boolean>(false);

  // Modals state
  const [isCalculatorOpen, setIsCalculatorOpen] = useState<boolean>(false);
  const [calculatorItem, setCalculatorItem] = useState<{ type: string; id: string }>({
    type: 'gold',
    id: 'gold-24k',
  });
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);
  const [isAlertsOpen, setIsAlertsOpen] = useState<boolean>(false);
  const [alertInitialItem, setAlertInitialItem] = useState<string | null>(null);
  const [customRateTarget, setCustomRateTarget] = useState<{
    isOpen: boolean;
    type: string;
    id: string;
    name: string;
    currentRate: number;
  }>({
    isOpen: false,
    type: '',
    id: '',
    name: '',
    currentRate: 0,
  });

  // Dark mode class sync
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  // Firebase Auth & User Preferences/Tools Persistence
  const {
    user,
    accessToken,
    authReady,
    isLoggingIn,
    authError,
    savedDigests,
    aiUsageToday,
    townshipConsensusMap,
    basketQuantities,
    familySize,
    alerts,
    handleGoogleLogin,
    handleLogout,
    handleAddAlert,
    handleDeleteAlert,
    handleBasketQtyChange,
    handleBasketFamilyPreset,
    handleSaveDigestToCloud,
    handleSubmitTownshipReport,
  } = useUserPersistence({
    initialBasket: initialInflationBasket,
    initialGold: initialGoldQuotes,
    initialCurrencies: initialCurrencyQuotes,
    initialCommodities: initialCommodityQuotes,
    currentSession,
    isDark,
    onLoadedPreferences: ({ preferredSession, preferredTheme }) => {
      setCurrentSession(preferredSession);
      setIsDark(preferredTheme === 'dark');
    },
  });

  // Live Market Data Pipeline & Actions
  const {
    goldQuotes,
    currencyQuotes,
    commodityQuotes,
    intelligenceReports,
    inflationBasket,
    digest,
    bankRates,
    trustedGoldShops,
    dataSources,
    pipelineMeta,
    feedStatus,
    configuredFeedUrl,
    isUpdatingFeedConfig,
    feedConfigError,
    configuredTelegramChannels,
    isUpdatingTelegramConfig,
    telegramConfigError,
    isSyncing,
    isStreetFxSyncing,
    isSearchGrounding,
    searchGroundingError,
    isSyncingShops,
    shopSyncError,
    isAiGenerating,
    aiError,
    quotaStatus,
    searchThrottleDelayMs,
    setSearchThrottleDelayMs,
    queuedRequestsCount,
    fetchMarketData,
    handleConfigureFeedUrl,
    handleConfigureTelegramChannels,
    handleActivateFallbackPreview,
    handleSessionToggle,
    handleSyncTrustedShops,
    handleRunStreetFxSync,
    handleRunSearchGrounding,
    handleTriggerAiDigest,
    handleSaveRate,
    handleImportRatesFromSheet,
  } = useMarketDashboard({
    user,
    authReady,
    isDark,
    currentSession,
    setCurrentSession,
  });

  const handleThemeToggle = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (authReady && user) {
      updateUserPreferences(user.uid, currentSession, nextDark ? 'dark' : 'light').catch((err) =>
        console.error('Failed to sync theme preference:', err)
      );
    }
  };

  const handleOpenCalculatorWithItem = (type: string, id: string) => {
    setCalculatorItem({ type, id });
    setIsCalculatorOpen(true);
  };

  const handleOpenEditRate = (type: string, id: string, name: string, currentRate: number) => {
    setCustomRateTarget({
      isOpen: true,
      type,
      id,
      name,
      currentRate,
    });
  };

  const handleOpenAlertsForAsset = (itemKey?: BenchmarkAlertKey) => {
    setAlertInitialItem(itemKey ?? null);
    setIsAlertsOpen(true);
  };

  const isProcessingData =
    isSyncing || isStreetFxSyncing || isSearchGrounding || isSyncingShops || isAiGenerating;

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#F9F8F6] dark:bg-[#111211] text-[#1C1C1C] dark:text-[#F3F2EE] flex flex-col font-sans transition-colors duration-200">
      {/* Sticky Editorial Header */}
      <Navbar
        currentSession={currentSession}
        onSessionToggle={handleSessionToggle}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isDark={isDark}
        onThemeToggle={handleThemeToggle}
        onOpenCalculator={() => setIsCalculatorOpen(true)}
        onOpenExport={() => setIsExportOpen(true)}
        onOpenAlerts={() => handleOpenAlertsForAsset()}
        isSyncing={isSyncing}
        isProcessing={isProcessingData}
        onSync={() => fetchMarketData(true)}
        isWorkspaceConnected={Boolean(user && accessToken)}
        user={user}
        isLoggingIn={isLoggingIn}
        onGoogleLogin={() => handleGoogleLogin(false)}
        onLogout={handleLogout}
        quotaStatus={quotaStatus}
        aiUsageToday={aiUsageToday}
      />

      {/* Focused Element: Live Market Marquee Prices */}
      <TickerBar
        goldQuotes={goldQuotes}
        currencyQuotes={currencyQuotes}
        commodityQuotes={commodityQuotes}
        onSelectCategory={setActiveTab}
        isSyncing={isSyncing}
      />

      {/* Economic News Headlines Wire (Google Search Grounded) */}
      <MarketNewsTicker
        onSelectCategory={setActiveTab}
        isSignedIn={Boolean(authReady && user)}
        onRequireSignIn={() => handleGoogleLogin(false)}
      />

      {/* Main Viewport Content */}
      <main className="flex-1 max-w-[1280px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-7">
        {authError && (
          <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50 text-rose-900 dark:text-rose-200 px-4 py-2.5 rounded-sm text-xs flex items-center justify-between gap-2">
            <span>{authError}</span>
          </div>
        )}

        {/* Session Banner with 3-Second Scan KPI Strip */}
        <SessionBanner
          currentSession={currentSession}
          onSessionChange={handleSessionToggle}
          dateStr={digest.date}
          lastSyncedAt={pipelineMeta?.lastSyncedAt || feedStatus.lastSuccessfulUpdate}
          sentiment={digest.marketSentiment}
          onTriggerAiDigest={handleTriggerAiDigest}
          isAiGenerating={isAiGenerating}
          goldQuotes={goldQuotes}
          currencyQuotes={currencyQuotes}
          commodityQuotes={commodityQuotes}
        />

        {/* Market Source Badge + Exact Last Successful Update Timestamp + Google Search Grounding */}
        <MarketSourceBadge
          feedStatus={feedStatus}
          configuredFeedUrl={configuredFeedUrl}
          configuredTelegramChannels={configuredTelegramChannels}
          pipelineMeta={pipelineMeta}
          isSyncing={isSyncing}
          isUpdatingFeedConfig={isUpdatingFeedConfig}
          feedConfigError={feedConfigError}
          isUpdatingTelegramConfig={isUpdatingTelegramConfig}
          telegramConfigError={telegramConfigError}
          searchGrounding={pipelineMeta?.searchGrounding}
          isSearchGrounding={isSearchGrounding}
          searchGroundingError={searchGroundingError}
          isSignedIn={Boolean(authReady && user)}
          isLoggingIn={isLoggingIn}
          onGoogleLogin={() => handleGoogleLogin(false)}
          quotaStatus={quotaStatus}
          aiUsageToday={aiUsageToday}
          searchThrottleDelayMs={searchThrottleDelayMs}
          onChangeSearchThrottleDelayMs={setSearchThrottleDelayMs}
          queuedRequestsCount={queuedRequestsCount}
          onRunSearchGrounding={handleRunSearchGrounding}
          onConfigureFeedUrl={handleConfigureFeedUrl}
          onConfigureTelegramChannels={handleConfigureTelegramChannels}
          onRefreshLive={() => fetchMarketData(true)}
          onSimulateFallback={handleActivateFallbackPreview}
        />

        {/* Dynamic Tab Views with Smooth Transition */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            {activeTab === 'overview' && (
              <div className="space-y-8">
                {/* 3-Card Live Benchmark Rate Cards with Session Toggle & Alert Triggers */}
                <MarketRateCardsSection
                  activeSession={currentSession}
                  goldQuotes={goldQuotes}
                  currencyQuotes={currencyQuotes}
                  commodityQuotes={commodityQuotes}
                  bankRates={bankRates}
                  pipelineMeta={pipelineMeta}
                  townshipConsensusMap={townshipConsensusMap}
                  onOpenAlertForAsset={handleOpenAlertsForAsset}
                />

                {/* 6 Major Market Big Rate Cards (Latest Open-Market + Official Reference Prices Side-by-Side) */}
                <MajorMarketRateCards
                  activeSession={currentSession}
                  goldQuotes={goldQuotes}
                  currencyQuotes={currencyQuotes}
                  commodityQuotes={commodityQuotes}
                  townshipConsensusMap={townshipConsensusMap}
                  onOpenAlertForAsset={(itemKey) => handleOpenAlertsForAsset(itemKey as BenchmarkAlertKey)}
                  onOpenCalculatorWithItem={handleOpenCalculatorWithItem}
                  onEditRate={handleOpenEditRate}
                  onNavigateTab={setActiveTab}
                />

                {/* Central Spread Matrix + Executive Ink Briefing Sidebar */}
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                  <div className="xl:col-span-8 min-w-0">
                    <OfficialVsMarketCard
                      goldQuotes={goldQuotes}
                      currencyQuotes={currencyQuotes}
                      commodityQuotes={commodityQuotes}
                      lastSyncedAt={pipelineMeta?.lastSyncedAt}
                      townshipConsensusMap={townshipConsensusMap}
                      onOpenCalculatorWithItem={handleOpenCalculatorWithItem}
                      onEditRate={handleOpenEditRate}
                    />
                  </div>

                  <div className="xl:col-span-4 min-w-0">
                    <AiDigestCard
                      digest={digest}
                      onRefresh={handleTriggerAiDigest}
                      isLoading={isAiGenerating}
                      errorMsg={aiError}
                      isSignedIn={Boolean(authReady && user)}
                      isLoggingIn={isLoggingIn}
                      onGoogleLogin={() => handleGoogleLogin(false)}
                      quotaStatus={quotaStatus}
                      aiUsageToday={aiUsageToday}
                      onSaveToCloud={() => handleSaveDigestToCloud(digest)}
                      goldQuotes={goldQuotes}
                      currencyQuotes={currencyQuotes}
                      commodityQuotes={commodityQuotes}
                    />
                  </div>
                </div>

                {/* Live Pipeline Feed Status Summary Strip */}
                {pipelineMeta && (
                  <div className="bg-white dark:bg-[#191A19] border border-[#1C1C1C]/15 dark:border-stone-800 rounded-sm px-4 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[#1C1C1C]/80 dark:text-stone-300">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-[#1C1C1C] dark:text-white en-sub">
                        {isSyncing ? (
                          <span className="inline-flex items-end gap-0.5 h-3" aria-hidden="true">
                            <span className="w-0.5 h-2 bg-[#004225] dark:bg-emerald-400 rounded-full animate-ios-wave" />
                            <span className="w-0.5 h-3 bg-[#004225] dark:bg-emerald-400 rounded-full animate-ios-wave [animation-delay:150ms]" />
                            <span className="w-0.5 h-2 bg-[#004225] dark:bg-emerald-400 rounded-full animate-ios-wave [animation-delay:300ms]" />
                          </span>
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-[#15803d] dark:bg-emerald-400" />
                        )}
                        Live Market Pipeline ({pipelineMeta.liveSourcesCount}/
                        {pipelineMeta.totalSourcesCount} Active)
                      </span>
                      {pipelineMeta.workerRemittanceUsd && (
                        <span className="num-tabular text-[#1C1C1C]/70 dark:text-stone-400">
                          Bank WR Rate:{' '}
                          <strong className="text-[#1C1C1C] dark:text-stone-200">
                            {pipelineMeta.workerRemittanceUsd.toLocaleString()} Ks
                          </strong>
                        </span>
                      )}
                      {pipelineMeta.xauUsdSpot && (
                        <span className="num-tabular text-[#1C1C1C]/70 dark:text-stone-400">
                          XAU Spot:{' '}
                          <strong className="text-[#1C1C1C] dark:text-amber-400">
                            ${pipelineMeta.xauUsdSpot.toLocaleString()}/oz
                          </strong>
                        </span>
                      )}
                      <span className="num-tabular text-[#1C1C1C]/70 dark:text-stone-400">
                        Last Gathered:{' '}
                        <strong className="text-[#1C1C1C] dark:text-stone-200">
                          {formatGatheredTimeMm(pipelineMeta.lastSyncedAt)}
                        </strong>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('forex')}
                      className="text-xs font-semibold text-[#004225] dark:text-emerald-400 hover:underline cursor-pointer mm-text focus:outline-none focus-visible:ring-2 focus-visible:ring-[#004225] rounded px-1"
                    >
                      CBM, CB, AYA &amp; MCB နှုန်းထားများ ကြည့်ရန် →
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'gold' && (
              <GoldSection
                goldQuotes={goldQuotes}
                trustedGoldShops={trustedGoldShops}
                pipelineMeta={pipelineMeta}
                onSyncTrustedShops={handleSyncTrustedShops}
                isSyncingShops={isSyncingShops}
                shopSyncError={shopSyncError}
                onOpenCalculator={() => setIsCalculatorOpen(true)}
                onEditRate={handleOpenEditRate}
              />
            )}

            {activeTab === 'forex' && (
              <CurrencySection
                currencyQuotes={currencyQuotes}
                bankRates={bankRates}
                dataSources={dataSources}
                pipelineMeta={pipelineMeta}
                isStreetSyncing={isStreetFxSyncing}
                isSearchGrounding={isSearchGrounding}
                onRunStreetFxSync={handleRunStreetFxSync}
                onRunSearchGrounding={handleRunSearchGrounding}
                onOpenCalculator={() => setIsCalculatorOpen(true)}
                onEditRate={handleOpenEditRate}
              />
            )}

            {activeTab === 'commodities' && (
              <CommoditySection
                commodityQuotes={commodityQuotes}
                onEditRate={handleOpenEditRate}
              />
            )}

            {activeTab === 'basket' && (
              <InflationBasketSection
                basketItems={inflationBasket}
                quantities={basketQuantities}
                familySize={familySize}
                onQuantityChange={handleBasketQtyChange}
                onFamilyPresetChange={handleBasketFamilyPreset}
              />
            )}

            {activeTab === 'reports' && <IntelligenceFeed reports={intelligenceReports} />}

            {activeTab === 'workspace' && (
              <WorkspaceHub
                user={user}
                accessToken={accessToken}
                isLoggingIn={isLoggingIn}
                onGoogleLogin={() => handleGoogleLogin(true)}
                onLogout={handleLogout}
                exportPayload={{
                  session: currentSession,
                  dateStr: digest.date,
                  goldQuotes,
                  currencyQuotes,
                  commodityQuotes,
                  basketItems: inflationBasket,
                  basketQuantities,
                  digest,
                }}
                savedDigests={savedDigests}
                onSaveDigestToCloud={(workspaceUrl) =>
                  handleSaveDigestToCloud(digest, workspaceUrl)
                }
                onImportRatesFromSheet={handleImportRatesFromSheet}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Clean quiet editorial footer */}
      <footer className="mt-auto border-t border-[#1C1C1C]/15 dark:border-stone-800 bg-white dark:bg-[#161716] py-6 text-xs text-[#1C1C1C]/65 dark:text-stone-400 transition-colors">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-center sm:text-left">
            <div className="text-[13px] font-semibold text-[#1C1C1C] dark:text-[#F3F2EE] mm-text">
              Myanmar Market Watch · မြန်မာ့စီးပွားရေးနှင့် ဈေးကွက်စောင့်ကြည့်ရေး
            </div>
            <div className="text-xs text-[#1C1C1C]/65 dark:text-stone-400 mt-0.5 mm-text">
              တရားဝင် ရည်ညွှန်းနှုန်းများနှင့် ပြင်ပဈေးကွက် လက်တွေ့နှုန်းများကို နေ့စဉ် စုစည်းတင်ပြပေးပါသည်။
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 text-xs text-[#1C1C1C]/65 dark:text-stone-400 num-tabular">
            <span>Google Search Grounding</span>
            <span>·</span>
            <span>CBM (ဗဟိုဘဏ်)</span>
            <span>·</span>
            <span>YGEA</span>
            <span>·</span>
            <span>PPRD</span>
            <span>·</span>
            <span>DOCA</span>
            <span>·</span>
            <span>MRF</span>
          </div>
        </div>
      </footer>

      {/* Modals Suite */}
      <CalculatorModal
        isOpen={isCalculatorOpen}
        onClose={() => setIsCalculatorOpen(false)}
        goldQuotes={goldQuotes}
        currencyQuotes={currencyQuotes}
        initialType={calculatorItem.type}
        initialId={calculatorItem.id}
      />

      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        session={currentSession}
        dateStr={digest.date}
        lastSyncedAt={pipelineMeta?.lastSyncedAt}
        goldQuotes={goldQuotes}
        currencyQuotes={currencyQuotes}
        commodityQuotes={commodityQuotes}
        digest={digest}
        pipelineMeta={pipelineMeta}
        isSignedIn={Boolean(authReady && user)}
        isLoggingIn={isLoggingIn}
        onGoogleLogin={() => handleGoogleLogin(false)}
        quotaStatus={quotaStatus}
      />

      <AlertsModal
        isOpen={isAlertsOpen}
        onClose={() => setIsAlertsOpen(false)}
        initialItemKey={alertInitialItem}
        goldQuotes={goldQuotes}
        currencyQuotes={currencyQuotes}
        commodityQuotes={commodityQuotes}
        alerts={alerts}
        onAddAlert={handleAddAlert}
        onDeleteAlert={handleDeleteAlert}
      />

      <CustomRateModal
        isOpen={customRateTarget.isOpen}
        onClose={() => setCustomRateTarget((prev) => ({ ...prev, isOpen: false }))}
        itemType={customRateTarget.type}
        itemId={customRateTarget.id}
        itemName={customRateTarget.name}
        currentRate={customRateTarget.currentRate}
        onSaveRate={handleSaveRate}
        isSignedIn={Boolean(authReady && user)}
        pipelineMeta={pipelineMeta}
        consensusSummary={
          customRateTarget.type && customRateTarget.id
            ? townshipConsensusMap.get(`${customRateTarget.type}:${customRateTarget.id}`) ?? null
            : null
        }
        onSubmitTownshipReport={handleSubmitTownshipReport}
      />
    </div>
  );
}
