import React, { useState, useRef, useEffect } from 'react';
import type { User } from 'firebase/auth';
import {
  Sun,
  Moon,
  Download,
  Calculator,
  Bell,
  RefreshCw,
  MoreHorizontal,
  LogIn,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import type { AiQuotaStatus, MarketSession } from '../types';
import type { StoredAiUsageLedger } from '../firebase';

interface NavbarProps {
  currentSession: MarketSession;
  onSessionToggle: (session: MarketSession) => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
  isDark: boolean;
  onThemeToggle: () => void;
  onOpenCalculator: () => void;
  onOpenExport: () => void;
  onOpenAlerts: () => void;
  isSyncing: boolean;
  isProcessing?: boolean;
  onSync: () => void;
  isWorkspaceConnected?: boolean;
  user?: User | null;
  isLoggingIn?: boolean;
  onGoogleLogin?: () => void;
  onLogout?: () => void;
  quotaStatus?: AiQuotaStatus | null;
  aiUsageToday?: StoredAiUsageLedger | null;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentSession,
  onSessionToggle,
  activeTab,
  onTabChange,
  isDark,
  onThemeToggle,
  onOpenCalculator,
  onOpenExport,
  onOpenAlerts,
  isSyncing,
  isProcessing = false,
  onSync,
  isWorkspaceConnected = false,
  user = null,
  isLoggingIn = false,
  onGoogleLogin,
  onLogout,
  quotaStatus = null,
  aiUsageToday = null,
}) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const digestLimit = quotaStatus?.digestLimit ?? 15;
  const digestUsed = quotaStatus?.digestUsed ?? aiUsageToday?.digestCalls ?? 0;
  const digestRemaining = Math.max(0, digestLimit - digestUsed);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const tabs = [
    { id: 'overview', labelMm: 'ခြုံငုံ', labelEn: 'Overview' },
    { id: 'gold', labelMm: 'ရွှေဈေး', labelEn: 'Gold' },
    { id: 'forex', labelMm: 'ငွေလဲနှုန်း', labelEn: 'Forex' },
    { id: 'commodities', labelMm: 'ကုန်စည်/ဆီ', labelEn: 'Commodities' },
    { id: 'basket', labelMm: 'ကုန်ကျစရိတ်', labelEn: 'Basket' },
    { id: 'reports', labelMm: 'သတင်း/သုတေသန', labelEn: 'Intelligence' },
    { id: 'workspace', labelMm: 'Workspace', labelEn: 'Workspace' },
  ];

  const primaryLgTabs = tabs.slice(0, 4);
  const overflowLgTabs = tabs.slice(4);
  const isOverflowActive = overflowLgTabs.some((t) => t.id === activeTab);

  const showProgressBar = isSyncing || isProcessing;

  return (
    <header className="relative border-b-2 border-[#1C1C1C] dark:border-stone-700 bg-[#F9F8F6]/95 dark:bg-[#141514]/95 backdrop-blur-md sticky top-0 z-40 transition-colors">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-10">
        <div className="flex items-center justify-between gap-4 min-h-[72px] py-3">
          {/* Zone 1: Editorial Wordmark */}
          <div className="flex items-center min-w-0 flex-1 lg:flex-initial">
            <button
              type="button"
              onClick={() => onTabChange('overview')}
              className="text-left group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#004225] rounded-sm px-1 py-0.5 -ml-1 transition-colors min-w-0 max-w-full"
            >
              <div className="flex items-baseline gap-2 min-w-0">
                <span className="serif w-[269.922px] max-w-full text-xl sm:text-2xl font-bold tracking-tight text-[#1C1C1C] dark:text-[#F3F2EE] group-hover:text-[#004225] dark:group-hover:text-emerald-400 transition-colors truncate">
                  Myanmar Market Watch
                </span>
              </div>
              <div className="hidden sm:block text-xs text-[#1C1C1C]/65 dark:text-stone-400 mm-text truncate max-w-[280px]">
                မြန်မာ့စီးပွားရေးနှင့် ဈေးကွက်စောင့်ကြည့်ရေး
              </div>
            </button>
          </div>

          {/* Zone 2: Clean Editorial Text Navigation on XL */}
          <nav
            aria-label="Primary sections"
            className="hidden xl:flex items-center gap-6"
          >
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  title={tab.labelMm}
                  onClick={() => onTabChange(tab.id)}
                  className={`py-1.5 text-xs font-semibold uppercase tracking-[0.06em] whitespace-nowrap shrink-0 transition-all duration-150 cursor-pointer inline-flex items-center gap-1.5 border-b-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#004225] ${
                    isActive
                      ? 'border-[#004225] dark:border-emerald-400 text-[#004225] dark:text-emerald-300'
                      : 'border-transparent text-[#1C1C1C]/80 dark:text-stone-300 hover:border-[#1C1C1C] dark:hover:border-stone-400 hover:text-[#1C1C1C] dark:hover:text-white'
                  }`}
                >
                  {tab.id === 'workspace' && isWorkspaceConnected && (
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-[#15803d] dark:bg-emerald-400 shrink-0"
                      title="Workspace Connected"
                    />
                  )}
                  <span className="mm-text">{tab.labelMm}</span>
                </button>
              );
            })}
          </nav>

          {/* Zone 2b: Compact LG Navigation */}
          <nav
            aria-label="Compact navigation"
            className="hidden lg:flex xl:hidden items-center gap-4 relative"
            ref={moreRef}
          >
            {primaryLgTabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  title={tab.labelEn}
                  onClick={() => onTabChange(tab.id)}
                  className={`py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 transition-all cursor-pointer border-b-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#004225] mm-text ${
                    isActive
                      ? 'border-[#004225] dark:border-emerald-400 text-[#004225] dark:text-emerald-300'
                      : 'border-transparent text-[#1C1C1C]/75 dark:text-stone-300 hover:border-[#1C1C1C] hover:text-[#1C1C1C] dark:hover:text-white'
                  }`}
                >
                  {tab.labelMm}
                </button>
              );
            })}
            <div className="relative">
              <button
                type="button"
                aria-label="More sections"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen((prev) => !prev)}
                className={`px-2 py-1 text-xs font-semibold rounded-sm whitespace-nowrap shrink-0 transition-all cursor-pointer inline-flex items-center gap-1 border border-[#1C1C1C]/15 dark:border-stone-700 ${
                  isOverflowActive
                    ? 'bg-[#1C1C1C] text-white dark:bg-emerald-700'
                    : 'text-[#1C1C1C] dark:text-stone-300 hover:bg-[#1C1C1C]/5'
                }`}
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {moreOpen && (
                <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-[#191A19] border border-[#1C1C1C]/20 dark:border-stone-700 rounded-sm shadow-lg p-1.5 z-50">
                  {overflowLgTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      title={tab.labelEn}
                      onClick={() => {
                        onTabChange(tab.id);
                        setMoreOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs rounded-sm flex items-center justify-between cursor-pointer mm-text ${
                        activeTab === tab.id
                          ? 'bg-[#1C1C1C] text-white dark:bg-emerald-700 font-semibold'
                          : 'text-[#1C1C1C] dark:text-stone-200 hover:bg-[#F9F8F6] dark:hover:bg-stone-800'
                      }`}
                    >
                      <span>{tab.labelMm}</span>
                      <span className="text-[11px] opacity-65 en-sub">{tab.labelEn}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </nav>

          {/* Zone 3: Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Compact Rectangular Session Switcher */}
            <div className="hidden md:flex items-center border border-[#1C1C1C] dark:border-stone-600 rounded-sm overflow-hidden">
              <button
                type="button"
                onClick={() => onSessionToggle('morning')}
                className={`px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap transition-colors cursor-pointer ${
                  currentSession === 'morning'
                    ? 'bg-[#1C1C1C] text-[#F9F8F6] dark:bg-emerald-700 dark:text-white'
                    : 'bg-transparent text-[#1C1C1C]/75 dark:text-stone-300 hover:bg-[#1C1C1C]/5'
                }`}
                title="Morning Session (09:30 AM)"
              >
                AM
              </button>
              <button
                type="button"
                onClick={() => onSessionToggle('evening')}
                className={`px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap transition-colors cursor-pointer border-l border-[#1C1C1C]/30 dark:border-stone-600 ${
                  currentSession === 'evening'
                    ? 'bg-[#1C1C1C] text-[#F9F8F6] dark:bg-emerald-700 dark:text-white'
                    : 'bg-transparent text-[#1C1C1C]/75 dark:text-stone-300 hover:bg-[#1C1C1C]/5'
                }`}
                title="Evening Session (04:30 PM)"
              >
                PM
              </button>
            </div>

            <button
              type="button"
              onClick={onSync}
              disabled={isSyncing}
              aria-label="ဈေးနှုန်းများ အသစ်ပြန်လည်ရယူရန်"
              className="p-2 text-[#1C1C1C] dark:text-stone-200 border border-[#1C1C1C]/20 dark:border-stone-700 hover:border-[#1C1C1C] dark:hover:border-stone-500 bg-white dark:bg-[#191A19] rounded-sm transition-colors cursor-pointer disabled:opacity-60"
              title="Sync Live Market Data"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-[#004225] dark:text-emerald-400' : ''}`}
              />
            </button>

            <button
              type="button"
              onClick={onOpenCalculator}
              aria-label="ရွှေနှင့် ငွေလဲနှုန်း တွက်ချက်စက် ဖွင့်ရန်"
              className="flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-[#1C1C1C] dark:text-stone-200 border border-[#1C1C1C]/20 dark:border-stone-700 hover:border-[#1C1C1C] dark:hover:border-stone-500 bg-white dark:bg-[#191A19] rounded-sm transition-colors cursor-pointer whitespace-nowrap"
              title="Calculator"
            >
              <Calculator className="w-3.5 h-3.5 text-[#004225] dark:text-emerald-400" />
              <span className="hidden 2xl:inline mm-text">တွက်စက်</span>
            </button>

            <button
              type="button"
              onClick={onOpenAlerts}
              aria-label="ဈေးနှုန်း သတိပေးချက်များ"
              className="p-2 text-[#1C1C1C] dark:text-stone-200 border border-[#1C1C1C]/20 dark:border-stone-700 hover:border-[#1C1C1C] dark:hover:border-stone-500 bg-white dark:bg-[#191A19] rounded-sm transition-colors cursor-pointer"
              title="Price Alerts"
            >
              <Bell className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={onThemeToggle}
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              className="p-2 text-[#1C1C1C] dark:text-stone-200 border border-[#1C1C1C]/20 dark:border-stone-700 hover:border-[#1C1C1C] dark:hover:border-stone-500 bg-white dark:bg-[#191A19] rounded-sm transition-colors cursor-pointer"
              title={isDark ? 'Light Theme' : 'Dark Theme'}
            >
              {isDark ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5" />}
            </button>

            {/* Auth & Daily AI Token Quota Status */}
            {user ? (
              <div className="flex items-center border border-[#004225]/30 dark:border-emerald-600/40 bg-white dark:bg-[#191A19] rounded-sm overflow-hidden shrink-0">
                <button
                  type="button"
                  onClick={() => onTabChange('workspace')}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-[#004225] dark:text-emerald-300 hover:bg-[#004225]/5 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer whitespace-nowrap"
                  title={`Signed in as ${user.email || user.displayName || 'Google User'} · Daily AI quota remaining: ${digestRemaining}/${digestLimit}`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span className="hidden sm:inline max-w-[96px] truncate">
                    {user.displayName?.split(' ')[0] || 'Account'}
                  </span>
                  <span className="font-mono tabular-nums text-[11px] px-1.5 py-0.5 bg-[#004225]/10 dark:bg-emerald-500/15 rounded-sm">
                    {digestRemaining}/{digestLimit}
                  </span>
                </button>
                {onLogout && (
                  <button
                    type="button"
                    onClick={onLogout}
                    aria-label="Sign out"
                    title="Sign out"
                    className="p-2 text-[#1C1C1C]/70 dark:text-stone-300 hover:text-[#b91c1c] dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 border-l border-[#1C1C1C]/15 dark:border-stone-700 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            ) : (
              onGoogleLogin && (
                <button
                  type="button"
                  onClick={onGoogleLogin}
                  disabled={isLoggingIn}
                  className="flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-[#004225] dark:text-emerald-300 border border-[#004225]/35 dark:border-emerald-600/40 hover:bg-[#004225] hover:text-white dark:hover:bg-emerald-700 bg-white dark:bg-[#191A19] rounded-sm transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-60"
                  title="Sign in with Google to unlock live AI & Search quota protection"
                >
                  <LogIn className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span className="hidden sm:inline">
                    {isLoggingIn ? 'Signing in...' : 'Sign in'}
                  </span>
                </button>
              )
            )}

            {/* Primary Action: Live Export */}
            <button
              type="button"
              onClick={onOpenExport}
              className="flex items-center gap-1.5 px-3.5 py-2 editorial-label text-white bg-[#1C1C1C] hover:bg-[#004225] dark:bg-emerald-700 dark:hover:bg-emerald-600 rounded-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="Export Market Snapshot"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Live Export</span>
            </button>
          </div>
        </div>

        {/* Mobile/Tablet secondary tab strip */}
        <div className="flex lg:hidden items-center gap-2 overflow-x-auto py-2 border-t border-[#1C1C1C]/12 dark:border-stone-800 no-scrollbar">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                title={tab.labelEn}
                onClick={() => onTabChange(tab.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-sm whitespace-nowrap transition-colors mm-text ${
                  isActive
                    ? 'bg-[#1C1C1C] text-[#F9F8F6] dark:bg-emerald-700 dark:text-white'
                    : 'text-[#1C1C1C]/75 dark:text-stone-300 hover:bg-[#1C1C1C]/5'
                }`}
              >
                {tab.labelMm}
              </button>
            );
          })}
        </div>
      </div>

      {/* Indeterminate Data Processing Progress Line */}
      {showProgressBar && (
        <div
          className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#1C1C1C]/10 dark:bg-stone-800 overflow-hidden"
          role="progressbar"
          aria-label="Processing market data"
        >
          <div className="w-1/2 h-full bg-[#004225] dark:bg-emerald-400 animate-ios-progress" />
        </div>
      )}
    </header>
  );
};
