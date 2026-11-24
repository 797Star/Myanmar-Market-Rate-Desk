import { useState, useEffect, useRef, useMemo } from 'react';
import type { User } from 'firebase/auth';
import type {
  CommodityQuote,
  CurrencyQuote,
  DailyDigest,
  GoldQuote,
  InflationBasketItem,
  MarketSession,
  PriceAlert,
  TownshipMarketReport,
} from '../types';
import {
  deletePriceAlertFromFirestore,
  ensureUserProfile,
  googleSignIn,
  initAuth,
  logout,
  saveBasketQuantityToFirestore,
  saveDigestToFirestore,
  savePriceAlertToFirestore,
  submitTownshipReportToFirestore,
  subscribeAiUsageToday,
  subscribeBasketQuantities,
  subscribePriceAlerts,
  subscribeSavedDigests,
  subscribeTownshipReports,
  type StoredAiUsageLedger,
  type StoredDigestRecord,
} from '../firebase';
import {
  aggregateTownshipConsensus,
  evaluateGoldParityStatus,
  getSpecificAssetBounds,
  isRateWithinBounds,
} from '../utils/quoteHelpers';

function buildDefaultBasketQuantities(items: InflationBasketItem[]): Record<string, number> {
  const initial: Record<string, number> = {};
  items.forEach((item) => {
    initial[item.id] = item.defaultMonthlyQty;
  });
  return initial;
}

function buildDefaultAlerts(
  goldQuotes: GoldQuote[],
  currencyQuotes: CurrencyQuote[],
  commodityQuotes: CommodityQuote[]
): PriceAlert[] {
  return [
    {
      id: 'a_1',
      itemKey: 'USD',
      itemName: 'အမေရိကန်ဒေါ်လာ (USD)',
      targetHigh: 4500,
      targetLow: 4200,
      currentRate: currencyQuotes.find((c) => c.code === 'USD')?.marketSellRate || 4490,
      isTriggered: true,
      alertType: 'above',
    },
    {
      id: 'a_2',
      itemKey: 'gold-24k',
      itemName: 'အခေါက်ရွှေ 16 ပဲရည်',
      targetHigh: 10500000,
      targetLow: 9800000,
      currentRate: goldQuotes.find((g) => g.id === 'gold-24k')?.marketRate || 10290000,
      isTriggered: false,
      alertType: 'above',
    },
    {
      id: 'a_3',
      itemKey: 'oil-palm',
      itemName: 'စားအုန်းဆီ (1 ပိဿာ)',
      targetHigh: 14000,
      targetLow: 12000,
      currentRate: commodityQuotes.find((cm) => cm.id === 'oil-palm')?.openMarketRate || 13500,
      isTriggered: false,
      alertType: 'above',
    },
  ];
}

export function useUserPersistence(params: {
  initialBasket: InflationBasketItem[];
  initialGold: GoldQuote[];
  initialCurrencies: CurrencyQuote[];
  initialCommodities: CommodityQuote[];
  currentSession: MarketSession;
  isDark: boolean;
  onLoadedPreferences?: (prefs: {
    preferredSession: MarketSession;
    preferredTheme: 'light' | 'dark';
  }) => void;
}) {
  const {
    initialBasket,
    initialGold,
    initialCurrencies,
    initialCommodities,
    currentSession,
    isDark,
    onLoadedPreferences,
  } = params;

  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [savedDigests, setSavedDigests] = useState<StoredDigestRecord[]>([]);
  const [aiUsageToday, setAiUsageToday] = useState<StoredAiUsageLedger | null>(null);
  const [townshipReports, setTownshipReports] = useState<TownshipMarketReport[]>([]);

  const [basketQuantities, setBasketQuantities] = useState<Record<string, number>>(() =>
    buildDefaultBasketQuantities(initialBasket)
  );
  const [familySize, setFamilySize] = useState<number>(4);
  const [alerts, setAlerts] = useState<PriceAlert[]>(() =>
    buildDefaultAlerts(initialGold, initialCurrencies, initialCommodities)
  );

  const ensuredUidRef = useRef<string | null>(null);
  const hasCloudAlertsRef = useRef<boolean>(false);
  const latestDefaultsRef = useRef({ currentSession, isDark });
  latestDefaultsRef.current = { currentSession, isDark };
  const onLoadedPrefsRef = useRef(onLoadedPreferences);
  onLoadedPrefsRef.current = onLoadedPreferences;

  useEffect(() => {
    const unsubscribe = initAuth((authUser, token) => {
      setUser(authUser);
      setAccessToken(token);
      setAuthReady(true);
      if (!authUser) {
        ensuredUidRef.current = null;
        hasCloudAlertsRef.current = false;
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady || !user) return;
    if (ensuredUidRef.current === user.uid) return;
    ensuredUidRef.current = user.uid;

    const { currentSession: defSession, isDark: defDark } = latestDefaultsRef.current;
    ensureUserProfile(user, defSession, defDark ? 'dark' : 'light')
      .then((prefs) => {
        onLoadedPrefsRef.current?.(prefs);
      })
      .catch((err) => {
        ensuredUidRef.current = null;
        console.error('Failed to ensure user profile:', err);
      });
  }, [authReady, user]);

  useEffect(() => {
    if (!authReady || !user) {
      setSavedDigests([]);
      setAiUsageToday(null);
      return;
    }

    const unsubAlerts = subscribePriceAlerts(user.uid, (storedAlerts) => {
      if (storedAlerts.length === 0) {
        if (hasCloudAlertsRef.current) {
          setAlerts([]);
        }
        return;
      }
      hasCloudAlertsRef.current = true;
      setAlerts(
        storedAlerts.map((a) => ({
          ...a,
          currentRate: 0,
          isTriggered: false,
        }))
      );
    });

    const unsubBasket = subscribeBasketQuantities(user.uid, (qtyMap, storedFamilySize) => {
      setBasketQuantities((prev) => ({ ...prev, ...qtyMap }));
      if (typeof storedFamilySize === 'number') {
        setFamilySize(storedFamilySize);
      }
    });

    const unsubDigests = subscribeSavedDigests(user.uid, (digests) => {
      setSavedDigests(digests);
    });

    const unsubAiUsage = subscribeAiUsageToday(user.uid, (usage) => {
      setAiUsageToday(usage);
    });

    const unsubTownshipReports = subscribeTownshipReports(
      (reports) => {
        setTownshipReports(reports);
      },
      (err) => {
        console.warn('Township consensus subscription unavailable:', err);
      }
    );

    return () => {
      unsubAlerts();
      unsubBasket();
      unsubDigests();
      unsubAiUsage();
      unsubTownshipReports();
    };
  }, [authReady, user]);

  // Clear shared reports on sign-out
  useEffect(() => {
    if (authReady && !user) {
      setTownshipReports([]);
    }
  }, [authReady, user]);

  const townshipConsensusMap = useMemo(
    () => aggregateTownshipConsensus(townshipReports),
    [townshipReports]
  );

  const handleGoogleLogin = async (includeWorkspaceScopes = false) => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    setAuthError(null);
    try {
      const result = await googleSignIn(includeWorkspaceScopes);
      if (!result) {
        return;
      }
      setUser(result.user);
      setAccessToken(result.accessToken);
    } catch (err: any) {
      const code = String(err?.code || '');
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setAuthError(null);
        return;
      }
      if (code === 'auth/popup-blocked') {
        setAuthError(
          'Sign-in popup was blocked by your browser. Please allow popups for this site and try again.'
        );
      } else if (code === 'auth/unauthorized-domain') {
        setAuthError(
          'This preview domain is not authorized in Firebase Authentication settings.'
        );
      } else {
        setAuthError(
          err?.message || 'Google Sign-In could not be completed. Please try again.'
        );
      }
      console.warn('Google Sign-In warning:', code || err?.message || err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
      setAccessToken(null);
      setSavedDigests([]);
      setAiUsageToday(null);
      setAuthError(null);
      ensuredUidRef.current = null;
      hasCloudAlertsRef.current = false;
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const handleAddAlert = (newAlert: PriceAlert) => {
    setAlerts((prev) => [...prev, newAlert]);
    if (authReady && user) {
      hasCloudAlertsRef.current = true;
      savePriceAlertToFirestore(user.uid, newAlert).catch((err) =>
        console.error('Failed to save price alert:', err)
      );
    }
  };

  const handleDeleteAlert = (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    if (authReady && user) {
      deletePriceAlertFromFirestore(user.uid, id).catch((err) =>
        console.error('Failed to delete price alert:', err)
      );
    }
  };

  const handleBasketQtyChange = (id: string, newQty: number, nextFamilySize: number) => {
    setBasketQuantities((prev) => ({ ...prev, [id]: newQty }));
    if (authReady && user) {
      saveBasketQuantityToFirestore(user.uid, id, newQty, nextFamilySize).catch((err) =>
        console.error('Failed to save basket quantity:', err)
      );
    }
  };

  const handleBasketFamilyPreset = (size: number, updatedQuantities: Record<string, number>) => {
    setFamilySize(size);
    setBasketQuantities(updatedQuantities);
    if (authReady && user) {
      Promise.all(
        Object.entries(updatedQuantities).map(([id, qty]) =>
          saveBasketQuantityToFirestore(user.uid, id, qty, size)
        )
      ).catch((err) => console.error('Failed to save family basket preset:', err));
    }
  };

  const handleSaveDigestToCloud = async (digest: DailyDigest, workspaceUrl?: string) => {
    if (!authReady || !user) return;
    await saveDigestToFirestore(user.uid, digest, workspaceUrl);
  };

  const handleSubmitTownshipReport = async (params: {
    township: string;
    assetType: 'gold' | 'currency' | 'commodity';
    assetId: string;
    reportedRate: number;
    impliedXauParityMmk?: number | null;
  }): Promise<void> => {
    if (!authReady || !user) {
      throw new Error('Google Sign-In is required to submit a public township quote.');
    }
    const { township, assetType, assetId, reportedRate, impliedXauParityMmk } = params;
    if (!isRateWithinBounds(assetType, assetId, reportedRate)) {
      const { min, max } = getSpecificAssetBounds(assetType, assetId);
      throw new Error(
        `Reported rate must be between ${min.toLocaleString()} and ${max.toLocaleString()} MMK.`
      );
    }

    let parityCheckStatus: 'aligned' | 'premium' | 'flagged' = 'aligned';
    if (assetType === 'gold' && assetId === 'gold-24k' && impliedXauParityMmk) {
      const evalRes = evaluateGoldParityStatus(reportedRate, impliedXauParityMmk);
      if (evalRes.status === 'premium' || evalRes.status === 'flagged') {
        parityCheckStatus = evalRes.status;
      }
    }

    await submitTownshipReportToFirestore({
      user,
      township,
      assetType,
      assetId,
      reportedRate,
      session: currentSession,
      parityCheckStatus,
    });
  };

  return {
    user,
    accessToken,
    authReady,
    isLoggingIn,
    authError,
    savedDigests,
    aiUsageToday,
    townshipReports,
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
  };
}
