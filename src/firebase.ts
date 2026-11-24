import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import type {
  AiUsageActionType,
  DailyDigest,
  MarketSession,
  PriceAlert,
  TownshipMarketReport,
} from './types';
import { getSpecificAssetBounds, isRateWithinBounds } from './utils/quoteHelpers';

// Initialize single Firebase app instance
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Combined Workspace OAuth Scopes (Google Sheets, Slides, and Drive)
export const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/presentations',
  'https://www.googleapis.com/auth/presentations.readonly',
];

const baseProvider = new GoogleAuthProvider();
baseProvider.setCustomParameters({ prompt: 'select_account' });

const workspaceProvider = new GoogleAuthProvider();
SCOPES.forEach((scope) => workspaceProvider.addScope(scope));
workspaceProvider.setCustomParameters({ prompt: 'consent' });

// In-memory access token cache (never stored in localStorage/sessionStorage)
let isSigningIn = false;
let cachedAccessToken: string | null = null;
let inFlightSignIn: Promise<{ user: User; accessToken: string | null } | null> | null = null;

// Critical boot connectivity check
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

// Required Firestore Error Handler
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((providerItem) => ({
          providerId: providerItem.providerId,
          email: providerItem.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Auth lifecycle listeners
export const initAuth = (
  onAuthReady: (user: User | null, accessToken: string | null) => void
): Unsubscribe => {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        onAuthReady(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        onAuthReady(user, null);
      }
    } else {
      cachedAccessToken = null;
      onAuthReady(null, null);
    }
  });
};

export const googleSignIn = async (
  includeWorkspaceScopes = false
): Promise<{
  user: User;
  accessToken: string | null;
} | null> => {
  if (inFlightSignIn) {
    return inFlightSignIn;
  }

  const activeProvider = includeWorkspaceScopes ? workspaceProvider : baseProvider;

  inFlightSignIn = (async () => {
    try {
      isSigningIn = true;
      const result = await signInWithPopup(auth, activeProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (includeWorkspaceScopes && credential?.accessToken) {
        cachedAccessToken = credential.accessToken;
      }
      return { user: result.user, accessToken: cachedAccessToken };
    } catch (err: any) {
      const code = String(err?.code || '');
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return null;
      }
      throw err;
    } finally {
      isSigningIn = false;
      inFlightSignIn = null;
    }
  })();

  return inFlightSignIn;
};

export const getFirebaseIdToken = async (forceRefresh = false): Promise<string | null> => {
  if (!auth.currentUser) return null;
  try {
    return await auth.currentUser.getIdToken(forceRefresh);
  } catch {
    return null;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

// Sanitize string helper matching blueprint bounds
function clampStr(val: string, maxLen: number, fallback = 'N/A'): string {
  const clean = (val || '').trim();
  if (!clean) return fallback;
  return clean.length > maxLen ? clean.slice(0, maxLen) : clean;
}

function sanitizeDocId(id: string): string {
  const clean = (id || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return clean || 'item';
}

// Per-path write serialization & profile readiness tracking to prevent concurrent getDoc/setDoc races
const pathQueues = new Map<string, Promise<unknown>>();
const profileReadyPromises = new Map<string, Promise<void>>();

function serializeByPath<T>(path: string, task: () => Promise<T>): Promise<T> {
  const previous = pathQueues.get(path) || Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  const cleanup = next.then(
    () => {
      if (pathQueues.get(path) === cleanup) {
        pathQueues.delete(path);
      }
    },
    () => {
      if (pathQueues.get(path) === cleanup) {
        pathQueues.delete(path);
      }
    }
  );
  pathQueues.set(path, cleanup);
  return next;
}

async function waitForProfileReady(uid: string): Promise<void> {
  const pending = profileReadyPromises.get(uid);
  if (pending) {
    await pending;
  }
}

// Ensure /users/{userId} parent document exists (Master Gate) and return persisted preferences
export async function ensureUserProfile(
  user: User,
  defaultSession: MarketSession,
  defaultTheme: 'light' | 'dark'
): Promise<{ preferredSession: MarketSession; preferredTheme: 'light' | 'dark' }> {
  const path = `users/${user.uid}`;
  let resolvedPrefs = {
    preferredSession: defaultSession,
    preferredTheme: defaultTheme,
  };

  const operation = serializeByPath(path, async () => {
    const docRef = doc(db, 'users', user.uid);
    try {
      const snap = await getDoc(docRef);
      const displayName = clampStr(user.displayName || user.email || 'Myanmar Market User', 120);
      if (!snap.exists()) {
        await setDoc(docRef, {
          uid: user.uid,
          displayName,
          preferredSession: defaultSession,
          preferredTheme: defaultTheme,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const data = snap.data();
        const storedSession: MarketSession =
          data.preferredSession === 'morning' || data.preferredSession === 'evening'
            ? data.preferredSession
            : defaultSession;
        const storedTheme: 'light' | 'dark' =
          data.preferredTheme === 'dark' || data.preferredTheme === 'light'
            ? data.preferredTheme
            : defaultTheme;
        resolvedPrefs = {
          preferredSession: storedSession,
          preferredTheme: storedTheme,
        };
        if (data.displayName !== displayName) {
          await updateDoc(docRef, {
            displayName,
            preferredSession: storedSession,
            preferredTheme: storedTheme,
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  });
  profileReadyPromises.set(user.uid, operation);
  await operation;
  return resolvedPrefs;
}

export async function updateUserPreferences(
  uid: string,
  preferredSession: MarketSession,
  preferredTheme: 'light' | 'dark'
): Promise<void> {
  await waitForProfileReady(uid);
  const path = `users/${uid}`;
  return serializeByPath(path, async () => {
    try {
      await updateDoc(doc(db, 'users', uid), {
        preferredSession,
        preferredTheme,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  });
}

// Custom Rates Persistence
export interface StoredCustomRate {
  id: string;
  userId: string;
  assetType: 'gold' | 'currency' | 'commodity';
  assetId: string;
  assetName: string;
  customRate: number;
  session: MarketSession;
}

export async function saveCustomRateToFirestore(
  uid: string,
  assetType: 'gold' | 'currency' | 'commodity',
  assetId: string,
  assetName: string,
  customRate: number,
  session: MarketSession
): Promise<void> {
  await waitForProfileReady(uid);
  const safeId = sanitizeDocId(assetId);
  const path = `users/${uid}/customRates/${safeId}`;
  return serializeByPath(path, async () => {
    const ref = doc(db, 'users', uid, 'customRates', safeId);
    try {
      const existingSnap = await getDoc(ref);
      if (!existingSnap.exists()) {
        await setDoc(ref, {
          userId: uid,
          assetType,
          assetId: clampStr(assetId, 64),
          assetName: clampStr(assetName, 160),
          customRate,
          session,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(ref, {
          assetName: clampStr(assetName, 160),
          customRate,
          session,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  });
}

export function subscribeCustomRates(
  uid: string,
  onData: (rates: StoredCustomRate[]) => void
): Unsubscribe {
  const path = `users/${uid}/customRates`;
  const q = query(collection(db, 'users', uid, 'customRates'), where('userId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const items: StoredCustomRate[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          userId: data.userId,
          assetType: data.assetType,
          assetId: data.assetId,
          assetName: data.assetName,
          customRate: data.customRate,
          session: data.session,
        };
      });
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

// Price Alerts Persistence
export async function savePriceAlertToFirestore(
  uid: string,
  alert: PriceAlert
): Promise<void> {
  await waitForProfileReady(uid);
  const safeId = sanitizeDocId(alert.id);
  const path = `users/${uid}/priceAlerts/${safeId}`;
  return serializeByPath(path, async () => {
    const ref = doc(db, 'users', uid, 'priceAlerts', safeId);
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, {
          userId: uid,
          itemKey: clampStr(alert.itemKey, 64),
          itemName: clampStr(alert.itemName, 160),
          targetHigh: Number(alert.targetHigh) || 0,
          targetLow: Number(alert.targetLow) || 0,
          alertType: alert.alertType,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(ref, {
          targetHigh: Number(alert.targetHigh) || 0,
          targetLow: Number(alert.targetLow) || 0,
          alertType: alert.alertType,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  });
}

export async function deletePriceAlertFromFirestore(
  uid: string,
  alertId: string
): Promise<void> {
  await waitForProfileReady(uid);
  const safeId = sanitizeDocId(alertId);
  const path = `users/${uid}/priceAlerts/${safeId}`;
  return serializeByPath(path, async () => {
    try {
      await deleteDoc(doc(db, 'users', uid, 'priceAlerts', safeId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  });
}

export function subscribePriceAlerts(
  uid: string,
  onData: (alerts: Omit<PriceAlert, 'currentRate' | 'isTriggered'>[]) => void
): Unsubscribe {
  const path = `users/${uid}/priceAlerts`;
  const q = query(collection(db, 'users', uid, 'priceAlerts'), where('userId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          itemKey: data.itemKey as string,
          itemName: data.itemName as string,
          targetHigh: Number(data.targetHigh),
          targetLow: Number(data.targetLow),
          alertType: data.alertType as 'above' | 'below',
        };
      });
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

// Household Basket Quantities Persistence
export async function saveBasketQuantityToFirestore(
  uid: string,
  itemId: string,
  quantity: number,
  familySize: number
): Promise<void> {
  await waitForProfileReady(uid);
  const safeId = sanitizeDocId(itemId);
  const path = `users/${uid}/basketQuantities/${safeId}`;
  const boundedQty = Math.max(0, Math.min(10000, quantity));
  const boundedFamily = Math.max(1, Math.min(50, Math.round(familySize)));
  return serializeByPath(path, async () => {
    const ref = doc(db, 'users', uid, 'basketQuantities', safeId);
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, {
          userId: uid,
          itemId: clampStr(itemId, 64),
          quantity: boundedQty,
          familySize: boundedFamily,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(ref, {
          quantity: boundedQty,
          familySize: boundedFamily,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  });
}

export function subscribeBasketQuantities(
  uid: string,
  onData: (quantities: Record<string, number>, familySize?: number) => void
): Unsubscribe {
  const path = `users/${uid}/basketQuantities`;
  const q = query(collection(db, 'users', uid, 'basketQuantities'), where('userId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      if (snap.empty) return;
      const map: Record<string, number> = {};
      let latestFamily: number | undefined;
      snap.docs.forEach((d) => {
        const data = d.data();
        map[data.itemId] = Number(data.quantity);
        if (typeof data.familySize === 'number') {
          latestFamily = data.familySize;
        }
      });
      onData(map, latestFamily);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

// Saved Digests & Workspace Export History
export interface StoredDigestRecord {
  id: string;
  date: string;
  session: MarketSession;
  headlineMm: string;
  headlineEn: string;
  spreadAnalysisMm: string;
  marketSentiment: DailyDigest['marketSentiment'];
  keyPointsMm: string[];
  workspaceUrl?: string;
}

export async function saveDigestToFirestore(
  uid: string,
  digest: DailyDigest,
  workspaceUrl?: string
): Promise<string> {
  await waitForProfileReady(uid);
  const digestId = sanitizeDocId(`digest_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  const path = `users/${uid}/savedDigests/${digestId}`;
  const keyPoints = (digest.keyPointsMm || [])
    .slice(0, 8)
    .map((pt) => clampStr(pt, 500));
  if (keyPoints.length === 0) {
    keyPoints.push(clampStr(digest.headlineMm, 500));
  }

  const payload: Record<string, unknown> = {
    userId: uid,
    date: clampStr(digest.date, 80),
    session: digest.session,
    headlineMm: clampStr(digest.headlineMm, 400),
    headlineEn: clampStr(digest.headlineEn, 400),
    spreadAnalysisMm: clampStr(digest.spreadAnalysisMm, 1000),
    marketSentiment: digest.marketSentiment,
    keyPointsMm: keyPoints,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (workspaceUrl && workspaceUrl.trim()) {
    payload.workspaceUrl = clampStr(workspaceUrl, 500);
  }

  try {
    await setDoc(doc(db, 'users', uid, 'savedDigests', digestId), payload);
    return digestId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeSavedDigests(
  uid: string,
  onData: (digests: StoredDigestRecord[]) => void
): Unsubscribe {
  const path = `users/${uid}/savedDigests`;
  const q = query(collection(db, 'users', uid, 'savedDigests'), where('userId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const items: StoredDigestRecord[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          date: data.date,
          session: data.session,
          headlineMm: data.headlineMm,
          headlineEn: data.headlineEn,
          spreadAnalysisMm: data.spreadAnalysisMm,
          marketSentiment: data.marketSentiment,
          keyPointsMm: data.keyPointsMm || [],
          workspaceUrl: data.workspaceUrl,
        };
      });
      onData(items.reverse());
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

// Daily AI & Google Search Quota Usage Ledger
export interface StoredAiUsageLedger {
  dateKey: string;
  digestCalls: number;
  searchCalls: number;
  lastActionType: AiUsageActionType;
  lastModelUsed: string;
}

export function getYangonDateKey(): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Yangon',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (y && m && d) {
      const formatted = `${y}-${m}-${d}`;
      if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(formatted)) {
        return formatted;
      }
    }
  } catch {
    // Fallback to UTC ISO slice
  }
  return new Date().toISOString().slice(0, 10);
}

export async function recordAiUsageInFirestore(
  uid: string,
  actionType: AiUsageActionType,
  modelUsed: string,
  serverCounts?: { digestUsed?: number; searchUsed?: number; dateKey?: string }
): Promise<void> {
  await waitForProfileReady(uid);
  const rawDate = serverCounts?.dateKey || getYangonDateKey();
  const dateKey = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(rawDate) ? rawDate : getYangonDateKey();
  const path = `users/${uid}/aiUsage/${dateKey}`;
  const cleanModel = clampStr(modelUsed || 'gemini-4-hydrogen', 64, 'gemini-4-hydrogen');

  return serializeByPath(path, async () => {
    const ref = doc(db, 'users', uid, 'aiUsage', dateKey);
    try {
      const snap = await getDoc(ref);
      const existingData = snap.exists() ? snap.data() : null;
      const isDigest = actionType === 'digest';

      const prevDigest = Number(existingData?.digestCalls) || 0;
      const prevSearch = Number(existingData?.searchCalls) || 0;

      const nextDigest = Math.max(
        0,
        Math.min(
          100,
          Math.round(
            typeof serverCounts?.digestUsed === 'number'
              ? serverCounts.digestUsed
              : prevDigest + (isDigest ? 1 : 0)
          )
        )
      );
      const nextSearch = Math.max(
        0,
        Math.min(
          100,
          Math.round(
            typeof serverCounts?.searchUsed === 'number'
              ? serverCounts.searchUsed
              : prevSearch + (isDigest ? 0 : 1)
          )
        )
      );

      if (!snap.exists()) {
        await setDoc(ref, {
          userId: uid,
          dateKey,
          digestCalls: nextDigest,
          searchCalls: nextSearch,
          lastActionType: actionType,
          lastModelUsed: cleanModel,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(ref, {
          digestCalls: nextDigest,
          searchCalls: nextSearch,
          lastActionType: actionType,
          lastModelUsed: cleanModel,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  });
}

export function subscribeAiUsageToday(
  uid: string,
  onData: (usage: StoredAiUsageLedger | null) => void
): Unsubscribe {
  const dateKey = getYangonDateKey();
  const path = `users/${uid}/aiUsage/${dateKey}`;
  return onSnapshot(
    doc(db, 'users', uid, 'aiUsage', dateKey),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const data = snap.data();
      onData({
        dateKey: String(data.dateKey || dateKey),
        digestCalls: Number(data.digestCalls) || 0,
        searchCalls: Number(data.searchCalls) || 0,
        lastActionType: (data.lastActionType as AiUsageActionType) || 'digest',
        lastModelUsed: String(data.lastModelUsed || 'gemini-4-hydrogen'),
      });
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

// Shared Community Township Market Reports
export async function submitTownshipReportToFirestore(params: {
  user: User;
  township: string;
  assetType: 'gold' | 'currency' | 'commodity';
  assetId: string;
  reportedRate: number;
  session: MarketSession;
  parityCheckStatus: 'aligned' | 'premium' | 'flagged';
}): Promise<void> {
  const { user, township, assetType, assetId, reportedRate, session, parityCheckStatus } = params;
  const uid = user.uid;
  const cleanAssetId = clampStr(assetId, 64);
  const cleanTownship = clampStr(township, 80, 'Yangon - Downtown / Shwebontha');
  const rawDisplay = (user.displayName || user.email?.split('@')[0] || 'Market Contributor').trim();
  const reporterLabel = clampStr(rawDisplay.split(/\s+/)[0] || rawDisplay, 60, 'Contributor');

  if (!isRateWithinBounds(assetType, cleanAssetId, reportedRate)) {
    const { min, max } = getSpecificAssetBounds(assetType, cleanAssetId);
    throw new Error(
      `Reported rate must be between ${min.toLocaleString()} and ${max.toLocaleString()} MMK for ${cleanAssetId}.`
    );
  }

  await waitForProfileReady(uid);
  const reportId = sanitizeDocId(`${uid}_${assetType}_${cleanAssetId}`);
  const path = `townshipReports/${reportId}`;

  return serializeByPath(path, async () => {
    const ref = doc(db, 'townshipReports', reportId);
    try {
      const existingSnap = await getDoc(ref);
      const boundedRate =
        assetType === 'currency' &&
        (cleanAssetId === 'THB' || cleanAssetId === 'CNY' || cleanAssetId === 'JPY')
          ? Number(reportedRate.toFixed(1))
          : Math.round(reportedRate);

      if (!existingSnap.exists()) {
        await setDoc(ref, {
          userId: uid,
          reporterLabel,
          township: cleanTownship,
          assetType,
          assetId: cleanAssetId,
          reportedRate: boundedRate,
          session,
          parityCheckStatus,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(ref, {
          reporterLabel,
          township: cleanTownship,
          reportedRate: boundedRate,
          session,
          parityCheckStatus,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  });
}

export function subscribeTownshipReports(
  onData: (reports: TownshipMarketReport[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const path = 'townshipReports';
  const q = query(
    collection(db, 'townshipReports'),
    where('createdAt', '>', Timestamp.fromMillis(0)),
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: TownshipMarketReport[] = snap.docs.map((d) => {
        const data = d.data();
        const createdAtTs = data.createdAt as Timestamp | undefined;
        return {
          id: d.id,
          userId: String(data.userId || ''),
          reporterLabel: String(data.reporterLabel || 'Contributor'),
          township: String(data.township || 'Yangon'),
          assetType: (data.assetType as 'gold' | 'currency' | 'commodity') || 'currency',
          assetId: String(data.assetId || ''),
          reportedRate: Number(data.reportedRate) || 0,
          session: (data.session as MarketSession) || 'morning',
          parityCheckStatus:
            (data.parityCheckStatus as 'aligned' | 'premium' | 'flagged') || 'aligned',
          createdAtMs: createdAtTs?.toMillis ? createdAtTs.toMillis() : Date.now(),
        };
      });
      onData(items);
    },
    (error) => {
      if (onError) {
        onError(error);
        return;
      }
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}
