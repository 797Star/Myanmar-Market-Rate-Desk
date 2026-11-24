export type MarketSession = 'morning' | 'evening';

export type RateDirection = 'up' | 'down' | 'unchanged';

export interface GoldQuote {
  id: string;
  nameMm: string;
  nameEn: string;
  purity: string;
  unitMm: string;
  unitEn: string;
  officialRate: number; // e.g. YGEA reference
  marketRate: number;   // e.g. Open market cash sell
  marketBuyRate?: number; // Open market shop buy-back price
  morningRate: number;
  eveningRate: number;
  delta: number;
  deltaPercent: number;
  deltaDirection: RateDirection;
  spreadAmount: number;
  spreadPercent: number;
  sourceOfficial: string;
  sourceMarket: string;
  groundingUrl?: string;
  history?: { time: string; rate: number }[];
  trend7d?: { day: string; rate: number }[];
  noteMm?: string;
}

export interface CurrencyQuote {
  code: 'USD' | 'THB' | 'EUR' | 'SGD' | 'MYR' | 'CNY' | 'JPY';
  nameMm: string;
  nameEn: string;
  symbol: string;
  flag: string;
  cbmOfficialRate: number; // CBM fixed rate (e.g. 2100)
  onlineTradingRate: number; // CBM Online Trading Platform
  workerRemittanceRate?: number; // Bank Worker Remittance (e.g. 4600)
  marketBuyRate: number;    // Open market buying
  marketSellRate: number;   // Open market selling
  morningRate: number;
  eveningRate: number;
  delta: number;
  deltaPercent: number;
  deltaDirection: RateDirection;
  spreadAmount: number;     // Market Sell - Official
  spreadPercent: number;
  sourceOfficial: string;
  sourceMarket: string;
  sourceOfficialUrl?: string;
  sourceMarketUrl?: string;
  rateMethodologyMm?: string;
  history?: { session: string; rate: number }[];
  noteMm?: string;
}

export interface CommodityQuote {
  id: string;
  category: 'rice' | 'oil' | 'fuel';
  nameMm: string;
  nameEn: string;
  spec: string;
  unitMm: string;
  unitEn: string;
  officialRefRate: number; // PPRD or Dept of Consumer Affairs
  openMarketRate: number;
  morningRate: number;
  eveningRate: number;
  delta: number;
  deltaDirection: RateDirection;
  region: string;
  sourceOfficial: string;
  sourceMarket: string;
  groundingUrl?: string;
  spreadPercent: number;
  noteMm?: string;
}

export interface IntelligenceReport {
  id: string;
  titleMm: string;
  titleEn: string;
  summaryMm: string;
  summaryEn: string;
  category: 'government' | 'worldbank_ngo' | 'roundtable' | 'verified_media';
  publisher: string;
  publicationDate: string;
  session: 'morning' | 'evening' | 'general';
  verifiedBadge: boolean;
  keyTakeaways: string[];
  impactLevel: 'high' | 'medium' | 'neutral';
  sourceUrl?: string;
}

export interface DailyDigest {
  date: string;
  session: MarketSession;
  headlineMm: string;
  headlineEn: string;
  keyPointsMm: string[];
  spreadAnalysisMm: string;
  marketSentiment: 'Volatile' | 'Stable' | 'Climbing' | 'Subdued';
  aiGenerated: boolean;
  lastGeneratedTime: string;
}

export interface InflationBasketItem {
  id: string;
  nameMm: string;
  nameEn: string;
  defaultMonthlyQty: number;
  unitMm: string;
  unitEn: string;
  unitPriceOfficial: number;
  unitPriceMarket: number;
  category: 'rice' | 'oil' | 'fuel' | 'staple';
}

export interface PriceAlert {
  id: string;
  itemKey: string;
  itemName: string;
  targetHigh: number;
  targetLow: number;
  currentRate: number;
  isTriggered: boolean;
  alertType: 'above' | 'below';
}

export interface BankExchangeRate {
  id: string;
  bankId: 'cb_bank' | 'aya_bank' | 'mcb_bank' | 'cbm' | 'global_fx' | 'cso' | 'starfish';
  bankNameMm: string;
  bankNameEn: string;
  rateCategory: 'counter' | 'online_trading' | 'remittance' | 'official' | 'interbank';
  categoryLabelMm: string;
  currencyCode: 'USD' | 'THB' | 'EUR' | 'SGD' | 'MYR' | 'CNY' | 'JPY';
  buyRate: number | null;
  sellRate: number | null;
  sourceUrl: string;
  updatedLabel: string;
  status: 'live' | 'fallback';
}

export interface TrustedGoldShopQuote {
  id: string;
  shopNameMm: string;
  shopNameEn: string;
  city: string;
  trustTier: 'Major Bullion' | 'Verified Heritage' | 'Refinery Standard';
  trustReasonMm: string;
  gold24kRate: number;
  gold15peRate?: number;
  priorityRank: number;
  isPrioritySelected: boolean;
  verificationMethod: 'grounding_search' | 'verified_benchmark' | 'direct_feed';
  sourceLabel: string;
  sourceUrl?: string;
  updatedLabel: string;
}

export interface DataSourceStatus {
  id: string;
  nameMm: string;
  nameEn: string;
  category:
    | 'central_bank'
    | 'commercial_bank'
    | 'gold_api'
    | 'global_fx'
    | 'trusted_gold_shop'
    | 'fuel_market'
    | 'cso_commodities'
    | 'telegram_desk'
    | 'rss_feed'
    | 'township_consensus'
    | 'google_search';
  url: string;
  status: 'live' | 'cached' | 'fallback';
  lastFetched: string;
  latencyMs?: number;
  noteMm: string;
}

export type CsoCategoryName =
  | 'Rice'
  | 'Edible Oil'
  | 'Pulses'
  | 'Spices'
  | 'Fish and Prawn'
  | 'Fuel price';

export interface CsoCommodityRow {
  category: CsoCategoryName;
  name: string;
  unit: string;
  prices: number[];
  latestPrice: number;
  previousPrice: number | null;
  fuelSeries?: Array<{ petrol92: number; diesel: number }>;
}

export interface CsoMarketPriceData {
  sourceUrl: string;
  dates: string[];
  latestDate: string;
  rows: CsoCommodityRow[];
  mappedRates: {
    riceShweboBag: number | null;
    riceShweboPyi: number | null;
    riceShweboPrevBag: number | null;
    riceEmataBag: number | null;
    riceEmataPyi: number | null;
    riceEmataPrevBag: number | null;
    oilPalmViss: number | null;
    oilPalmPrevViss: number | null;
    oilPeanutViss: number | null;
    oilPeanutSpecialViss: number | null;
    oilPeanutPrevViss: number | null;
    oilSesameViss: number | null;
    oilSesamePrevViss: number | null;
    fuel92Litre: number | null;
    fuel92Gallon: number | null;
    fuel92PrevLitre: number | null;
    fuelDieselLitre: number | null;
    fuelDieselGallon: number | null;
    fuelDieselPrevLitre: number | null;
    fuelPremiumDieselLitre: number | null;
    fuelPremiumDieselGallon: number | null;
    fuelPremiumDieselPrevLitre: number | null;
  };
}

export type FeedMode =
  | 'direct_telegram'
  | 'google_search'
  | 'rest_api'
  | 'google_sheet_json'
  | 'fallback_mock';

export type ParityCheckStatus = 'aligned' | 'premium' | 'flagged' | 'unavailable';

export interface OutlierRejectionRecord {
  assetKey: string;
  source: string;
  rejectedValue: number;
  medianReference: number;
  reason: string;
}

export interface ValidationSummary {
  verifiedAssetsCount: number;
  rejectedOutliers: OutlierRejectionRecord[];
  impliedXauParityMmk: number | null;
  gold24kParityDeviationPct: number | null;
  parityStatus: ParityCheckStatus;
  sourcesUsed: string[];
}

export interface TownshipMarketReport {
  id: string;
  userId: string;
  reporterLabel: string;
  township: string;
  assetType: 'gold' | 'currency' | 'commodity';
  assetId: string;
  reportedRate: number;
  session: MarketSession;
  parityCheckStatus: 'aligned' | 'premium' | 'flagged';
  createdAtMs: number;
}

export interface TownshipBreakdownEntry {
  township: string;
  medianRate: number;
  count: number;
  latestAtMs: number;
}

export interface TownshipConsensusAssetSummary {
  assetType: 'gold' | 'currency' | 'commodity';
  assetId: string;
  medianRate: number;
  reportCount: number;
  filteredOutlierCount: number;
  townships: TownshipBreakdownEntry[];
  latestUpdatedAtMs: number;
}

export interface MarketFeedStatus {
  mode: FeedMode;
  isFallback: boolean;
  endpointUrl: string;
  lastSuccessfulUpdate: string;
  sourceBadgeLabel: string;
  fallbackReason?: string | null;
}

export interface PipelineMeta {
  lastSyncedAt: string;
  liveSourcesCount: number;
  totalSourcesCount: number;
  xauUsdSpot: number | null;
  xagUsdSpot: number | null;
  spotParityMmkOnline: number | null;
  spotParityMmkMarket: number | null;
  workerRemittanceUsd: number | null;
  trustedGoldAnchorShop?: string;
  trustedGoldAnchorRate?: number;
  trustedGoldVerificationNote?: string;
  pythonFxEngine?: string;
  pythonFxLatencyMs?: number;
  pythonFxGatheredAt?: string;
  feedStatus?: MarketFeedStatus;
  searchGrounding?: MarketGroundingSummary | null;
  validation?: ValidationSummary | null;
  quotaSavedNote?: string | null;
  searchWasSkipped?: boolean;
}

export interface GroundingSourceLink {
  title: string;
  uri: string;
}

export interface MarketGroundingSummary {
  grounded: boolean;
  lastSearchedAt: string;
  latencyMs?: number;
  searchQueries: string[];
  sources: GroundingSourceLink[];
  onGroundSummaryMm?: string;
  updatedAssetsCount: number;
  error?: string | null;
}

export interface MarketNewsHeadline {
  id: string;
  headlineMm: string;
  headlineEn: string;
  source: string;
  category: 'gold' | 'forex' | 'commodities' | 'macro';
  impact: 'up' | 'down' | 'policy' | 'neutral';
  publishedLabel: string;
  url?: string;
  relatedTab?: 'overview' | 'gold' | 'forex' | 'commodities' | 'intel';
}

export interface MarketNewsResponse {
  headlines: MarketNewsHeadline[];
  groundingSources: GroundingSourceLink[];
  grounded: boolean;
  sourceMode?: 'rss_telegram' | 'google_search' | 'fallback';
  lastUpdated: string;
  noteMm?: string;
}

export type AiUsageActionType =
  | 'digest'
  | 'broadcast_script'
  | 'search_grounding'
  | 'market_sync'
  | 'shops_sync'
  | 'news_refresh';

export interface AiQuotaStatus {
  dateKey: string;
  digestUsed: number;
  digestLimit: number;
  searchUsed: number;
  searchLimit: number;
  cooldownRemainingMs: number;
  lastActionType?: AiUsageActionType;
  lastModelUsed?: string;
  cachedServed?: boolean;
}

export type BroadcastBulletinFormat = 'full_bulletin' | 'flash_brief';

export interface BroadcastScriptSection {
  cueLabel: string;
  timingHint: string;
  scriptMm: string;
}

export interface BroadcastScriptPayload {
  anchorHeadlineMm: string;
  facebookPostMm: string;
  videoScriptMm: string;
  scriptSections: BroadcastScriptSection[];
  estimatedDurationSec: number;
  bulletinFormat: BroadcastBulletinFormat;
  session: MarketSession;
  generatedAt: string;
  quota?: AiQuotaStatus;
}
