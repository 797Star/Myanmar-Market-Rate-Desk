import { jsPDF } from 'jspdf';
import type {
  CommodityQuote,
  CurrencyQuote,
  DailyDigest,
  GoldQuote,
  MarketSession,
  RateDirection,
} from '../types';
import { formatYangonTime12h } from './quoteHelpers';

export type RateBoardHeaderTheme = 'editorial_green' | 'navy' | 'charcoal';

export interface PosterRenderOptions {
  session: MarketSession;
  activeDashboardSession: MarketSession;
  dateStr: string;
  gatheredTimeStr?: string;
  sourceStr: string;
  brandName: string;
  headerTheme: RateBoardHeaderTheme;
  goldQuotes: GoldQuote[];
  currencyQuotes: CurrencyQuote[];
  commodityQuotes: CommodityQuote[];
  xauUsdSpot?: number | null;
  impliedXauParityMmk?: number | null;
  workerRemittanceUsd?: number | null;
}

export const POSTER_WIDTH = 1080;
export const POSTER_HEIGHT = 1350; // Exact 4:5 portrait ratio

// Fonts preloaded in index.html: Newsreader, Noto Serif, Noto Sans Myanmar, Plus Jakarta Sans, Space Mono
const MM_FONT = '"Noto Sans Myanmar", "Padauk", -apple-system, BlinkMacSystemFont, sans-serif';
const SERIF_FONT = '"Newsreader", "Noto Serif", Georgia, serif';
const DISPLAY_FONT = '"Plus Jakarta Sans", "Noto Sans Myanmar", -apple-system, BlinkMacSystemFont, sans-serif';
const NUM_FONT = '"Space Mono", "Plus Jakarta Sans", "Noto Sans Myanmar", monospace';

interface BroadsheetPalette {
  paperBg: string;
  cardBg: string;
  tintRowBg: string;
  mastheadStart: string;
  mastheadEnd: string;
  mastheadInsetBg: string;
  primaryAccent: string;
  goldAccent: string;
  goldBright: string;
  goldText: string;
  inkPrimary: string;
  inkSecondary: string;
  inkMuted: string;
  borderHairline: string;
  rowDivider: string;
  upText: string;
  downText: string;
  flatText: string;
}

function getThemePalette(theme: RateBoardHeaderTheme): BroadsheetPalette {
  if (theme === 'editorial_green') {
    return {
      paperBg: '#F7F5F0',
      cardBg: '#FFFFFF',
      tintRowBg: '#FAF9F5',
      mastheadStart: '#00361F',
      mastheadEnd: '#004B2B',
      mastheadInsetBg: 'rgba(0, 26, 15, 0.56)',
      primaryAccent: '#004225',
      goldAccent: '#B57B18',
      goldBright: '#DCA641',
      goldText: '#8E5B08',
      inkPrimary: '#181816',
      inkSecondary: '#3A3834',
      inkMuted: '#68645C',
      borderHairline: '#DDD7CB',
      rowDivider: '#ECE7DC',
      upText: '#15803D',
      downText: '#B91C1C',
      flatText: '#57534E',
    };
  }
  if (theme === 'charcoal') {
    return {
      paperBg: '#F6F6F4',
      cardBg: '#FFFFFF',
      tintRowBg: '#FAFAF8',
      mastheadStart: '#161615',
      mastheadEnd: '#252522',
      mastheadInsetBg: 'rgba(10, 10, 9, 0.58)',
      primaryAccent: '#1C1C1B',
      goldAccent: '#B87D19',
      goldBright: '#E0AA46',
      goldText: '#8E5D0B',
      inkPrimary: '#141413',
      inkSecondary: '#383835',
      inkMuted: '#666661',
      borderHairline: '#DCDBD4',
      rowDivider: '#EBEAE3',
      upText: '#15803D',
      downText: '#B91C1C',
      flatText: '#52525B',
    };
  }
  // Reserve Navy
  return {
    paperBg: '#F4F6F9',
    cardBg: '#FFFFFF',
    tintRowBg: '#F9FAFC',
    mastheadStart: '#0A182E',
    mastheadEnd: '#132A4E',
    mastheadInsetBg: 'rgba(6, 15, 30, 0.58)',
    primaryAccent: '#0F2342',
    goldAccent: '#BA7E17',
    goldBright: '#E2AC44',
    goldText: '#915E09',
    inkPrimary: '#0F172A',
    inkSecondary: '#334155',
    inkMuted: '#64748B',
    borderHairline: '#D5DCE6',
    rowDivider: '#E8EDF4',
    upText: '#15803D',
    downText: '#DC2626',
    flatText: '#475569',
  };
}

async function ensureFontsReady(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  try {
    await Promise.allSettled([
      document.fonts.load(`400 24px ${MM_FONT}`),
      document.fonts.load(`600 28px ${MM_FONT}`),
      document.fonts.load(`700 46px ${MM_FONT}`),
      document.fonts.load('600 22px "Newsreader"'),
      document.fonts.load('700 32px "Plus Jakarta Sans"'),
      document.fonts.load('800 34px "Plus Jakarta Sans"'),
      document.fonts.load('700 40px "Space Mono"'),
      document.fonts.load('700 52px "Space Mono"'),
    ]);
    await document.fonts.ready;
  } catch {
    // Continue gracefully with system fallback fonts
  }
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawGoldBarIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const u = size / 24;
  ctx.beginPath();
  ctx.moveTo(x + 6 * u, y + 7 * u);
  ctx.lineTo(x + 18 * u, y + 7 * u);
  ctx.lineTo(x + 21 * u, y + 17 * u);
  ctx.lineTo(x + 3 * u, y + 17 * u);
  ctx.closePath();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x + 7.5 * u, y + 11.5 * u);
  ctx.lineTo(x + 16.5 * u, y + 11.5 * u);
  ctx.stroke();
  ctx.restore();
}

function drawBanknoteIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const u = size / 24;
  drawRoundedRect(ctx, x + 2.5 * u, y + 5.5 * u, 19 * u, 13 * u, 1.5 * u);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x + 12 * u, y + 12 * u, 2.7 * u, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x + 6 * u, y + 12 * u);
  ctx.lineTo(x + 6.5 * u, y + 12 * u);
  ctx.moveTo(x + 17.5 * u, y + 12 * u);
  ctx.lineTo(x + 18 * u, y + 12 * u);
  ctx.stroke();
  ctx.restore();
}

function drawFuelPumpIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const u = size / 24;
  drawRoundedRect(ctx, x + 4 * u, y + 4 * u, 10.5 * u, 16 * u, 1.4 * u);
  ctx.stroke();

  ctx.beginPath();
  ctx.rect(x + 6.5 * u, y + 6.8 * u, 5.5 * u, 4.2 * u);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x + 2.5 * u, y + 20 * u);
  ctx.lineTo(x + 16 * u, y + 20 * u);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x + 14.5 * u, y + 11 * u);
  ctx.lineTo(x + 17 * u, y + 11 * u);
  ctx.lineTo(x + 18.5 * u, y + 12.5 * u);
  ctx.lineTo(x + 18.5 * u, y + 18 * u);
  ctx.arc(x + 19.8 * u, y + 18 * u, 1.3 * u, Math.PI, 0, true);
  ctx.lineTo(x + 21 * u, y + 8.5 * u);
  ctx.lineTo(x + 18.5 * u, y + 6 * u);
  ctx.stroke();
  ctx.restore();
}

function drawSessionVectorIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  session: MarketSession,
  color: string
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const u = size / 24;

  if (session === 'morning') {
    ctx.beginPath();
    ctx.moveTo(x + 3 * u, y + 16 * u);
    ctx.lineTo(x + 21 * u, y + 16 * u);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x + 12 * u, y + 16 * u, 5 * u, Math.PI, 0, false);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + 12 * u, y + 5 * u);
    ctx.lineTo(x + 12 * u, y + 8 * u);
    ctx.moveTo(x + 6.2 * u, y + 9.2 * u);
    ctx.lineTo(x + 8.2 * u, y + 11.2 * u);
    ctx.moveTo(x + 17.8 * u, y + 9.2 * u);
    ctx.lineTo(x + 15.8 * u, y + 11.2 * u);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(x + 13 * u, y + 12 * u, 7 * u, 0.35 * Math.PI, 1.65 * Math.PI, false);
    ctx.quadraticCurveTo(x + 10.5 * u, y + 12 * u, x + 15.5 * u, y + 18.2 * u);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMinimalLogoMark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  primaryColor: string,
  goldColor: string
): void {
  ctx.save();
  ctx.fillStyle = primaryColor;
  drawRoundedRect(ctx, x, y, size, size, 4);
  ctx.fill();

  ctx.strokeStyle = goldColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 3, y + 3, size - 6, size - 6);

  const pad = size * 0.25;
  const barW = size * 0.125;
  const gap = size * 0.07;
  const baseY = y + size - pad;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(x + pad, baseY - size * 0.22, barW, size * 0.22);
  ctx.fillRect(x + pad + barW + gap, baseY - size * 0.37, barW, size * 0.37);
  ctx.fillStyle = goldColor;
  ctx.fillRect(x + pad + (barW + gap) * 2, baseY - size * 0.52, barW, size * 0.52);
  ctx.restore();
}

function drawInlineMixedSegments(
  ctx: CanvasRenderingContext2D,
  segments: Array<{ text: string; font: string; color: string }>,
  rightX: number,
  baselineY: number
): void {
  const widths = segments.map((seg) => {
    ctx.font = seg.font;
    return ctx.measureText(seg.text).width;
  });
  const totalWidth = widths.reduce((sum, w) => sum + w, 0);
  let cursorX = rightX - totalWidth;

  ctx.textAlign = 'left';
  segments.forEach((seg, idx) => {
    ctx.font = seg.font;
    ctx.fillStyle = seg.color;
    ctx.fillText(seg.text, cursorX, baselineY);
    cursorX += widths[idx];
  });
}

// Clean, unboxed directional delta indicator with subtle underline accent rule (zero pill bubble)
function drawCleanDeltaReadout(
  ctx: CanvasRenderingContext2D,
  text: string,
  direction: RateDirection,
  rightX: number,
  baselineY: number,
  palette: BroadsheetPalette,
  fontSize = 20
): void {
  const color =
    direction === 'up' ? palette.upText : direction === 'down' ? palette.downText : palette.flatText;

  ctx.save();
  ctx.font = `700 ${fontSize}px ${NUM_FONT}`;
  const textW = ctx.measureText(text).width;
  ctx.textAlign = 'right';
  ctx.fillStyle = color;
  ctx.fillText(text, rightX, baselineY);

  // Crisp subtle 2px indicator bar underneath directional deltas
  if (direction !== 'unchanged') {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(rightX - textW, baselineY + 6, textW, 2);
  }
  ctx.restore();
}

function formatPriceNumber(val: number, decimals = 0): string {
  if (decimals > 0) {
    return val.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }
  return Math.round(val).toLocaleString('en-US');
}

function resolveGoldQuote(
  goldQuotes: GoldQuote[],
  id: string,
  selectedSession: MarketSession,
  activeSession: MarketSession,
  fallbackMarket: number
) {
  const item = goldQuotes.find((g) => g.id === id);
  const price = !item
    ? fallbackMarket
    : selectedSession === activeSession
    ? item.marketRate
    : selectedSession === 'morning'
    ? item.morningRate
    : item.eveningRate;
  return {
    price,
    officialRate: item?.officialRate ?? 0,
    delta: item?.delta ?? 0,
    deltaPercent: item?.deltaPercent ?? 0,
    direction: (item?.deltaDirection ?? 'unchanged') as RateDirection,
  };
}

function resolveCurrencyQuote(
  currencyQuotes: CurrencyQuote[],
  code: CurrencyQuote['code'],
  selectedSession: MarketSession,
  activeSession: MarketSession,
  fallbackBuy: number,
  fallbackSell: number
) {
  const item = currencyQuotes.find((c) => c.code === code);
  if (!item) {
    return {
      buy: fallbackBuy,
      sell: fallbackSell,
      cbmOfficialRate: code === 'USD' ? 2100 : 0,
      onlineTradingRate: 0,
      delta: 0,
      direction: 'unchanged' as RateDirection,
    };
  }
  const activeSell =
    selectedSession === activeSession
      ? item.marketSellRate
      : selectedSession === 'morning'
      ? item.morningRate
      : item.eveningRate;
  const spreadDiff = Math.max(0, item.marketSellRate - item.marketBuyRate);
  const buy =
    selectedSession === activeSession
      ? item.marketBuyRate
      : Number((activeSell - spreadDiff).toFixed(code === 'THB' || code === 'JPY' ? 1 : 0));

  return {
    buy,
    sell: activeSell,
    cbmOfficialRate: item.cbmOfficialRate ?? 0,
    onlineTradingRate: item.onlineTradingRate ?? 0,
    delta: item.delta ?? 0,
    direction: item.deltaDirection ?? ('unchanged' as RateDirection),
  };
}

function resolveCommodityQuote(
  commodityQuotes: CommodityQuote[],
  id: string,
  selectedSession: MarketSession,
  activeSession: MarketSession,
  fallbackMarket: number
) {
  const item = commodityQuotes.find((cm) => cm.id === id);
  const price = !item
    ? fallbackMarket
    : selectedSession === activeSession
    ? item.openMarketRate
    : selectedSession === 'morning'
    ? item.morningRate
    : item.eveningRate;
  return {
    price,
    officialRefRate: item?.officialRefRate ?? 0,
    delta: item?.delta ?? 0,
    direction: (item?.deltaDirection ?? 'unchanged') as RateDirection,
  };
}

function formatChangeText(delta: number, direction: RateDirection, decimals = 0, unitSuffix = ''): {
  text: string;
} {
  if (direction === 'unchanged' || delta === 0) {
    return { text: '— 0' };
  }
  const arrow = direction === 'up' ? '▲' : '▼';
  const sign = direction === 'up' ? '+' : '-';
  const formatted = formatPriceNumber(Math.abs(delta), decimals);
  return {
    text: `${arrow} ${sign}${formatted}${unitSuffix}`,
  };
}

export function getDefaultRateBoardDate(): string {
  const now = new Date();
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Yangon',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function formatGatheredTimeMm(isoStr?: string | null): string {
  return formatYangonTime12h(isoStr);
}

export interface RateBoardResolvedData {
  dateText: string;
  gatheredTimeText: string;
  sessionText: 'မနက်ပိုင်း' | 'ညနေပိုင်း';
  gold16Text: string;
  gold15Text: string;
  goldYgeaRefText: string;
  goldChangeText: string;
  goldChangeDirection: RateDirection;
  xauSpotText: string;
  impliedParityText: string;
  usdCbmText: string;
  usdWrText: string;
  usdBuyText: string;
  usdSellText: string;
  usdChangeText: string;
  usdDirection: RateDirection;
  sgdBuyText: string;
  sgdSellText: string;
  sgdChangeText: string;
  sgdDirection: RateDirection;
  thbBuyText: string;
  thbSellText: string;
  thbChangeText: string;
  thbDirection: RateDirection;
  eurBuyText: string;
  eurSellText: string;
  eurChangeText: string;
  eurDirection: RateDirection;
  octane92Text: string;
  octane92ChangeText: string;
  octane92Direction: RateDirection;
  dieselText: string;
  dieselChangeText: string;
  dieselDirection: RateDirection;
  palmOilText: string;
  palmOilChangeText: string;
  palmOilDirection: RateDirection;
  shweboRiceText: string;
  shweboRiceChangeText: string;
  shweboRiceDirection: RateDirection;
  sourceText: string;
  brandText: string;
}

export function resolveRateBoardData(options: PosterRenderOptions): RateBoardResolvedData {
  const gold16 = resolveGoldQuote(options.goldQuotes, 'gold-24k', options.session, options.activeDashboardSession, 10030000);
  const gold15 = resolveGoldQuote(options.goldQuotes, 'gold-15pe', options.session, options.activeDashboardSession, 9405000);
  const worldSpotQuote = options.goldQuotes.find((g) => g.id === 'gold-world-spot');

  const usd = resolveCurrencyQuote(options.currencyQuotes, 'USD', options.session, options.activeDashboardSession, 4430, 4490);
  const sgd = resolveCurrencyQuote(options.currencyQuotes, 'SGD', options.session, options.activeDashboardSession, 3340, 3420);
  const thb = resolveCurrencyQuote(options.currencyQuotes, 'THB', options.session, options.activeDashboardSession, 129.0, 132.5);
  const eur = resolveCurrencyQuote(options.currencyQuotes, 'EUR', options.session, options.activeDashboardSession, 4760, 4880);

  const fuel92 = resolveCommodityQuote(options.commodityQuotes, 'fuel-92', options.session, options.activeDashboardSession, 3150);
  const diesel = resolveCommodityQuote(options.commodityQuotes, 'fuel-diesel', options.session, options.activeDashboardSession, 2800);
  const palmOil = resolveCommodityQuote(options.commodityQuotes, 'oil-palm', options.session, options.activeDashboardSession, 13500);
  const shweboRice = resolveCommodityQuote(options.commodityQuotes, 'rice-shwebo', options.session, options.activeDashboardSession, 178000);

  const goldArrow = gold16.direction === 'up' ? '▲ +' : gold16.direction === 'down' ? '▼ -' : '— ';
  const goldChangeText =
    gold16.delta === 0 || gold16.direction === 'unchanged'
      ? '— 0 ကျပ် (ငြိမ်သက်)'
      : `${goldArrow}${formatPriceNumber(gold16.delta)} ကျပ် (${gold16.deltaPercent}%)`;

  const xauSpotVal = options.xauUsdSpot ?? worldSpotQuote?.marketRate ?? 0;
  const impliedParityVal =
    options.impliedXauParityMmk ??
    (xauSpotVal > 0 && usd.sell > 0 ? Math.round((xauSpotVal / 31.1034768) * 16.329325 * usd.sell) : 0);
  const wrVal = options.workerRemittanceUsd ?? usd.onlineTradingRate;

  return {
    dateText: options.dateStr.trim() || getDefaultRateBoardDate(),
    gatheredTimeText: options.gatheredTimeStr?.trim() || formatGatheredTimeMm(),
    sessionText: options.session === 'morning' ? 'မနက်ပိုင်း' : 'ညနေပိုင်း',
    gold16Text: formatPriceNumber(gold16.price),
    gold15Text: formatPriceNumber(gold15.price),
    goldYgeaRefText: gold16.officialRate > 0 ? `${formatPriceNumber(gold16.officialRate)} ကျပ်` : 'N/A',
    goldChangeText,
    goldChangeDirection: gold16.direction,
    xauSpotText: xauSpotVal > 0 ? `$${formatPriceNumber(xauSpotVal, 2)}/oz` : 'N/A',
    impliedParityText: impliedParityVal > 0 ? `${formatPriceNumber(impliedParityVal)} Ks` : 'N/A',
    usdCbmText: `${formatPriceNumber(usd.cbmOfficialRate || 2100)} Ks`,
    usdWrText: wrVal > 0 ? `${formatPriceNumber(wrVal)} Ks` : 'N/A',
    usdBuyText: formatPriceNumber(usd.buy),
    usdSellText: formatPriceNumber(usd.sell),
    usdChangeText: formatChangeText(usd.delta, usd.direction, 0).text,
    usdDirection: usd.direction,
    sgdBuyText: formatPriceNumber(sgd.buy),
    sgdSellText: formatPriceNumber(sgd.sell),
    sgdChangeText: formatChangeText(sgd.delta, sgd.direction, 0).text,
    sgdDirection: sgd.direction,
    thbBuyText: formatPriceNumber(thb.buy, 1),
    thbSellText: formatPriceNumber(thb.sell, 1),
    thbChangeText: formatChangeText(thb.delta, thb.direction, 1).text,
    thbDirection: thb.direction,
    eurBuyText: formatPriceNumber(eur.buy),
    eurSellText: formatPriceNumber(eur.sell),
    eurChangeText: formatChangeText(eur.delta, eur.direction, 0).text,
    eurDirection: eur.direction,
    octane92Text: formatPriceNumber(fuel92.price),
    octane92ChangeText: formatChangeText(fuel92.delta, fuel92.direction, 0).text,
    octane92Direction: fuel92.direction,
    dieselText: formatPriceNumber(diesel.price),
    dieselChangeText: formatChangeText(diesel.delta, diesel.direction, 0).text,
    dieselDirection: diesel.direction,
    palmOilText: formatPriceNumber(palmOil.price),
    palmOilChangeText: formatChangeText(palmOil.delta, palmOil.direction, 0).text,
    palmOilDirection: palmOil.direction,
    shweboRiceText: formatPriceNumber(shweboRice.price),
    shweboRiceChangeText: formatChangeText(shweboRice.delta, shweboRice.direction, 0).text,
    shweboRiceDirection: shweboRice.direction,
    sourceText: options.sourceStr.trim() || 'CBM · YGEA · PPRD · DOCA · Verified Desks',
    brandText: options.brandName.trim() || 'Myanmar Market Watch',
  };
}

export function buildHydratedPromptText(options: PosterRenderOptions): string {
  const d = resolveRateBoardData(options);
  return `Design a refined broadsheet daily market rate card for social media, portrait 4:5 ratio (1080x1350 px).

CONTENT (use exact values):
Masthead: "နေ့စဉ်ဈေးကွက် နှုန်းထားများ"
Edition: "${d.dateText} | ${d.sessionText} | စုစည်းချိန်: ${d.gatheredTimeText}"
Macro Reference: XAU Spot ${d.xauSpotText} | 24K Parity ${d.impliedParityText} | CBM ${d.usdCbmText}

01 - ရွှေဈေး (GOLD)
- ၁၆ ပဲရည် (24K): ${d.gold16Text} ကျပ် (${d.goldChangeText})
- ၁၅ ပဲရည် (22K): ${d.gold15Text} ကျပ်
- YGEA Ref: ${d.goldYgeaRefText}

02 - နိုင်ငံခြားငွေ (FOREX)
- USD: Buy ${d.usdBuyText} / Sell ${d.usdSellText} (${d.usdChangeText})
- SGD: Buy ${d.sgdBuyText} / Sell ${d.sgdSellText} (${d.sgdChangeText})
- THB: Buy ${d.thbBuyText} / Sell ${d.thbSellText} (${d.thbChangeText})
- EUR: Buy ${d.eurBuyText} / Sell ${d.eurSellText} (${d.eurChangeText})

03 - စက်သုံးဆီနှင့် အခြေခံစားကုန် (FUEL & STAPLES)
- Octane 92: ${d.octane92Text} ကျပ်/လီတာ (${d.octane92ChangeText})
- Diesel: ${d.dieselText} ကျပ်/လီတာ (${d.dieselChangeText})
- Palm Oil (1 Viss): ${d.palmOilText} ကျပ် (${d.palmOilChangeText})
- Shwebo Rice (1 Bag): ${d.shweboRiceText} ကျပ် (${d.shweboRiceChangeText})

Footer: "ရင်းမြစ်: ${d.sourceText} | ${d.brandText}"`;
}

export async function generateMarketPosterDataUrl(options: PosterRenderOptions): Promise<string> {
  await ensureFontsReady();

  const canvas = document.createElement('canvas');
  canvas.width = POSTER_WIDTH;
  canvas.height = POSTER_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context is unavailable');
  }

  const data = resolveRateBoardData(options);
  const p = getThemePalette(options.headerTheme);

  const margin = 44;
  const contentW = POSTER_WIDTH - margin * 2; // 992 px
  const innerPadX = 32;
  const innerLeftX = margin + innerPadX; // 76 px
  const innerRightX = margin + contentW - innerPadX; // 1004 px

  // Swiss vertical axes for FX table
  const colBuyX = margin + 544; // 588 px
  const colSellX = margin + 762; // 806 px

  // 1. Archival Broadsheet Canvas & Double-Hairline Border
  ctx.fillStyle = p.paperBg;
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);

  ctx.strokeStyle = p.borderHairline;
  ctx.lineWidth = 1;
  ctx.strokeRect(22, 22, POSTER_WIDTH - 44, POSTER_HEIGHT - 44);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
  ctx.strokeRect(27, 27, POSTER_WIDTH - 54, POSTER_HEIGHT - 54);

  // =========================================================================
  // 2. EDITORIAL MASTHEAD BANNER (y = 44 .. 222, height = 178)
  // =========================================================================
  const headerY = 44;
  const headerH = 178;

  ctx.save();
  drawRoundedRect(ctx, margin, headerY, contentW, headerH, 4);
  ctx.clip();

  const headerGrad = ctx.createLinearGradient(margin, headerY, margin + contentW, headerY + headerH);
  headerGrad.addColorStop(0, p.mastheadStart);
  headerGrad.addColorStop(1, p.mastheadEnd);
  ctx.fillStyle = headerGrad;
  ctx.fillRect(margin, headerY, contentW, headerH);

  // Subtle architectural pinstripe lines on far right only (very restrained)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.045)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    const px = margin + contentW - 290 + i * 22;
    ctx.beginPath();
    ctx.moveTo(px, headerY);
    ctx.lineTo(px, headerY + headerH);
    ctx.stroke();
  }

  // Crisp gold bottom rule across the masthead
  ctx.fillStyle = p.goldBright;
  ctx.fillRect(margin, headerY + headerH - 4, contentW, 4);
  ctx.restore();

  // Masthead Left: Kicker, Serif/Burmese Headline, Edition Line
  const editionBoxW = 246;
  const editionBoxH = 122;
  const editionBoxX = innerRightX - editionBoxW;
  const editionBoxY = headerY + 28;
  const maxHeaderLeftW = editionBoxX - innerLeftX - 28;

  ctx.fillStyle = p.goldBright;
  ctx.fillRect(innerLeftX, headerY + 33, 34, 3);

  ctx.fillStyle = p.goldBright;
  ctx.font = `700 13px ${DISPLAY_FONT}`;
  ctx.fillText('DAILY ECONOMIC BULLETIN · MYANMAR MARKET RATE BOARD', innerLeftX + 46, headerY + 39);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = `700 44px ${MM_FONT}`;
  ctx.fillText('နေ့စဉ်ဈေးကွက် နှုန်းထားများ', innerLeftX, headerY + 102, maxHeaderLeftW);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.80)';
  ctx.font = `500 19px ${SERIF_FONT}`;
  ctx.fillText(
    `${data.brandText}  ·  Official Reference & Open-Market Treasury Desk`,
    innerLeftX,
    headerY + 144,
    maxHeaderLeftW
  );

  // Masthead Right: Clean Edition & Session Box (hairline-bordered architectural inset)
  ctx.fillStyle = p.mastheadInsetBg;
  ctx.fillRect(editionBoxX, editionBoxY, editionBoxW, editionBoxH);
  ctx.strokeStyle = 'rgba(220, 166, 65, 0.45)';
  ctx.lineWidth = 1;
  ctx.strokeRect(editionBoxX, editionBoxY, editionBoxW, editionBoxH);

  drawSessionVectorIcon(ctx, editionBoxX + 16, editionBoxY + 14, 24, options.session, p.goldBright);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = `700 22px ${MM_FONT}`;
  ctx.fillText(data.sessionText, editionBoxX + 48, editionBoxY + 34, editionBoxW - 64);

  ctx.fillStyle = p.goldBright;
  ctx.font = `700 17px ${NUM_FONT}`;
  ctx.fillText(data.dateText, editionBoxX + 18, editionBoxY + 70, editionBoxW - 36);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.beginPath();
  ctx.moveTo(editionBoxX + 16, editionBoxY + 83);
  ctx.lineTo(editionBoxX + editionBoxW - 16, editionBoxY + 83);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.font = `400 14px ${NUM_FONT}`;
  ctx.fillText(`MMT ${data.gatheredTimeText}`, editionBoxX + 18, editionBoxY + 107, editionBoxW - 36);

  // =========================================================================
  // 3. MACRO PARITY & REFERENCE BAR (y = 234 .. 280, height = 46)
  // =========================================================================
  const stripY = 234;
  const stripH = 46;
  ctx.fillStyle = p.cardBg;
  ctx.fillRect(margin, stripY, contentW, stripH);
  ctx.strokeStyle = p.borderHairline;
  ctx.lineWidth = 1;
  ctx.strokeRect(margin, stripY, contentW, stripH);

  const macroItems = [
    { label: 'XAU SPOT', val: data.xauSpotText },
    { label: '24K PARITY', val: data.impliedParityText },
    { label: 'CBM FIXED', val: data.usdCbmText },
    { label: 'BANK / WR', val: data.usdWrText },
  ];
  const cellW = contentW / macroItems.length;
  macroItems.forEach((item, idx) => {
    const cellX = margin + idx * cellW;
    if (idx > 0) {
      ctx.strokeStyle = p.rowDivider;
      ctx.beginPath();
      ctx.moveTo(cellX, stripY + 8);
      ctx.lineTo(cellX, stripY + stripH - 8);
      ctx.stroke();
    }
    ctx.fillStyle = p.inkMuted;
    ctx.font = `700 11px ${DISPLAY_FONT}`;
    ctx.fillText(item.label, cellX + 18, stripY + 28);

    ctx.textAlign = 'right';
    ctx.fillStyle = idx === 0 ? p.goldText : p.inkPrimary;
    ctx.font = `700 14px ${NUM_FONT}`;
    ctx.fillText(item.val, cellX + cellW - 16, stripY + 28, cellW - 96);
    ctx.textAlign = 'left';
  });

  // Helper to draw sharp editorial section panels (1px hairline + 3px top accent bar)
  const drawEditorialPanel = (y: number, h: number, topBarColor: string) => {
    ctx.fillStyle = p.cardBg;
    ctx.fillRect(margin, y, contentW, h);
    ctx.strokeStyle = p.borderHairline;
    ctx.lineWidth = 1;
    ctx.strokeRect(margin, y, contentW, h);
    ctx.fillStyle = topBarColor;
    ctx.fillRect(margin, y, contentW, 3);
  };

  // =========================================================================
  // 4. SECTION 01 · GOLD BULLION (y = 296 .. 544, height = 248)
  // =========================================================================
  const goldY = 296;
  const goldH = 248;
  drawEditorialPanel(goldY, goldH, p.goldAccent);

  drawGoldBarIcon(ctx, innerLeftX, goldY + 19, 26, p.goldAccent);

  ctx.fillStyle = p.goldText;
  ctx.font = `700 14px ${NUM_FONT}`;
  ctx.fillText('01', innerLeftX + 36, goldY + 37);

  ctx.fillStyle = p.inkPrimary;
  ctx.font = `700 24px ${MM_FONT}`;
  ctx.fillText('ရွှေဈေးနှုန်း', innerLeftX + 66, goldY + 39);

  const goldLabelW = ctx.measureText('ရွှေဈေးနှုန်း').width;
  ctx.fillStyle = p.inkMuted;
  ctx.font = `600 14px ${DISPLAY_FONT}`;
  ctx.fillText('GOLD BULLION · 1 KYAT-THA (16.329g)', innerLeftX + 66 + goldLabelW + 14, goldY + 38);

  // Clean unboxed delta readout for Gold 24K
  drawCleanDeltaReadout(ctx, data.goldChangeText, data.goldChangeDirection, innerRightX, goldY + 38, p, 18);

  ctx.strokeStyle = p.borderHairline;
  ctx.beginPath();
  ctx.moveTo(innerLeftX, goldY + 60);
  ctx.lineTo(innerRightX, goldY + 60);
  ctx.stroke();

  // Gold Row 1: 24K (16-Pe)
  ctx.fillStyle = p.inkPrimary;
  ctx.font = `700 26px ${MM_FONT}`;
  ctx.fillText('၁၆ ပဲရည် အခေါက်ရွှေ (24K)', innerLeftX, goldY + 104);

  ctx.fillStyle = p.inkMuted;
  ctx.font = `500 16px ${DISPLAY_FONT}`;
  ctx.fillText(`Open Market Cash  ·  YGEA Ref: ${data.goldYgeaRefText}`, innerLeftX, goldY + 134);

  drawInlineMixedSegments(
    ctx,
    [
      { text: data.gold16Text, font: `700 50px ${NUM_FONT}`, color: p.inkPrimary },
      { text: ' ကျပ်', font: `600 22px ${MM_FONT}`, color: p.inkSecondary },
    ],
    innerRightX,
    goldY + 124
  );

  // Subtle row divider
  ctx.strokeStyle = p.rowDivider;
  ctx.beginPath();
  ctx.moveTo(innerLeftX, goldY + 154);
  ctx.lineTo(innerRightX, goldY + 154);
  ctx.stroke();

  // Gold Row 2: 15-Pe (22K) on subtle tinted background
  ctx.fillStyle = p.tintRowBg;
  ctx.fillRect(margin + 1, goldY + 155, contentW - 2, 92);

  ctx.fillStyle = p.inkPrimary;
  ctx.font = `700 24px ${MM_FONT}`;
  ctx.fillText('၁၅ ပဲရည် ရွှေ (22K Standard)', innerLeftX, goldY + 197);

  ctx.fillStyle = p.inkMuted;
  ctx.font = `500 16px ${DISPLAY_FONT}`;
  ctx.fillText('Domestic Jewellery & Refinery Grade · 1 Kyat-tha', innerLeftX, goldY + 226);

  drawInlineMixedSegments(
    ctx,
    [
      { text: data.gold15Text, font: `700 44px ${NUM_FONT}`, color: p.inkSecondary },
      { text: ' ကျပ်', font: `600 21px ${MM_FONT}`, color: p.inkMuted },
    ],
    innerRightX,
    goldY + 216
  );

  // =========================================================================
  // 5. SECTION 02 · FOREIGN EXCHANGE (y = 560 .. 936, height = 376)
  // =========================================================================
  const fxY = 560;
  const fxH = 376;
  drawEditorialPanel(fxY, fxH, p.primaryAccent);

  drawBanknoteIcon(ctx, innerLeftX, fxY + 19, 26, p.primaryAccent);

  ctx.fillStyle = p.primaryAccent;
  ctx.font = `700 14px ${NUM_FONT}`;
  ctx.fillText('02', innerLeftX + 36, fxY + 37);

  ctx.fillStyle = p.inkPrimary;
  ctx.font = `700 24px ${MM_FONT}`;
  ctx.fillText('နိုင်ငံခြားငွေဈေး', innerLeftX + 66, fxY + 39);

  // Column headers aligned to Buy / Sell / 24h Delta
  ctx.textAlign = 'right';
  ctx.fillStyle = p.inkMuted;
  ctx.font = `700 15px ${MM_FONT}`;
  ctx.fillText('ဝယ် (BUY)', colBuyX, fxY + 39);
  ctx.fillText('ရောင်း (SELL)', colSellX, fxY + 39);
  ctx.fillText('၂၄နာရီ Δ', innerRightX, fxY + 39);
  ctx.textAlign = 'left';

  ctx.strokeStyle = p.borderHairline;
  ctx.beginPath();
  ctx.moveTo(innerLeftX, fxY + 60);
  ctx.lineTo(innerRightX, fxY + 60);
  ctx.stroke();

  const fxRows = [
    { code: 'USD', sub: 'US Dollar · အမေရိကန်ဒေါ်လာ', buy: data.usdBuyText, sell: data.usdSellText, change: data.usdChangeText, dir: data.usdDirection, highlight: true },
    { code: 'SGD', sub: 'Singapore Dollar · စင်ကာပူဒေါ်လာ', buy: data.sgdBuyText, sell: data.sgdSellText, change: data.sgdChangeText, dir: data.sgdDirection, highlight: false },
    { code: 'THB', sub: 'Thai Baht · ထိုင်းဘတ်', buy: data.thbBuyText, sell: data.thbSellText, change: data.thbChangeText, dir: data.thbDirection, highlight: false },
    { code: 'EUR', sub: 'Euro · ယူရို', buy: data.eurBuyText, sell: data.eurSellText, change: data.eurChangeText, dir: data.eurDirection, highlight: false },
  ];

  const fxRowH = 78;
  fxRows.forEach((row, idx) => {
    const rowTop = fxY + 61 + idx * fxRowH;
    const centerY = rowTop + fxRowH / 2;

    if (idx % 2 === 1) {
      ctx.fillStyle = p.tintRowBg;
      ctx.fillRect(margin + 1, rowTop, contentW - 2, fxRowH);
    }

    if (idx > 0) {
      ctx.strokeStyle = p.rowDivider;
      ctx.beginPath();
      ctx.moveTo(innerLeftX, rowTop);
      ctx.lineTo(innerRightX, rowTop);
      ctx.stroke();
    }

    // Left 3px architectural tick
    ctx.fillStyle = row.highlight ? p.goldAccent : p.primaryAccent;
    ctx.fillRect(innerLeftX, rowTop + 19, 3, 40);

    ctx.fillStyle = p.inkPrimary;
    ctx.font = `800 28px ${DISPLAY_FONT}`;
    ctx.fillText(row.code, innerLeftX + 15, rowTop + 37);

    ctx.fillStyle = p.inkMuted;
    ctx.font = `500 15px ${MM_FONT}`;
    ctx.fillText(row.sub, innerLeftX + 15, rowTop + 60, colBuyX - innerLeftX - 150);

    // Buy rate (34px tabular)
    ctx.textAlign = 'right';
    ctx.fillStyle = p.inkSecondary;
    ctx.font = `700 34px ${NUM_FONT}`;
    ctx.fillText(row.buy, colBuyX, centerY + 11);

    // Sell rate (38px bold tabular)
    ctx.fillStyle = p.inkPrimary;
    ctx.font = `700 38px ${NUM_FONT}`;
    ctx.fillText(row.sell, colSellX, centerY + 12);
    ctx.textAlign = 'left';

    drawCleanDeltaReadout(ctx, row.change, row.dir, innerRightX, centerY + 9, p, 19);
  });

  // =========================================================================
  // 6. SECTION 03 · FUEL & ESSENTIAL STAPLES (y = 952 .. 1236, height = 284)
  // =========================================================================
  const commY = 952;
  const commH = 284;
  drawEditorialPanel(commY, commH, p.primaryAccent);

  drawFuelPumpIcon(ctx, innerLeftX, commY + 19, 26, p.primaryAccent);

  ctx.fillStyle = p.primaryAccent;
  ctx.font = `700 14px ${NUM_FONT}`;
  ctx.fillText('03', innerLeftX + 36, commY + 37);

  ctx.fillStyle = p.inkPrimary;
  ctx.font = `700 24px ${MM_FONT}`;
  ctx.fillText('စက်သုံးဆီနှင့် အခြေခံစားကုန်', innerLeftX + 66, commY + 39);

  const commLabelW = ctx.measureText('စက်သုံးဆီနှင့် အခြေခံစားကုန်').width;
  ctx.fillStyle = p.inkMuted;
  ctx.font = `600 14px ${DISPLAY_FONT}`;
  ctx.fillText('ENERGY & ESSENTIAL STAPLES', innerLeftX + 66 + commLabelW + 14, commY + 38);

  ctx.strokeStyle = p.borderHairline;
  ctx.beginPath();
  ctx.moveTo(innerLeftX, commY + 58);
  ctx.lineTo(innerRightX, commY + 58);
  ctx.stroke();

  // 2x2 Grid dividers
  const gridTopY = commY + 59;
  const cellH = (commH - 60) / 2; // 112 px
  const midX = POSTER_WIDTH / 2;

  ctx.strokeStyle = p.rowDivider;
  ctx.beginPath();
  ctx.moveTo(innerLeftX, gridTopY + cellH);
  ctx.lineTo(innerRightX, gridTopY + cellH);
  ctx.moveTo(midX, gridTopY + 12);
  ctx.lineTo(midX, commY + commH - 12);
  ctx.stroke();

  const commCells = [
    {
      col: 0,
      row: 0,
      title: 'ဓာတ်ဆီ (Octane 92)',
      sub: '1 Litre · Open Retail',
      price: data.octane92Text,
      change: data.octane92ChangeText,
      dir: data.octane92Direction,
    },
    {
      col: 1,
      row: 0,
      title: 'ဒီဇယ် (Diesel)',
      sub: '1 Litre · Open Retail',
      price: data.dieselText,
      change: data.dieselChangeText,
      dir: data.dieselDirection,
    },
    {
      col: 0,
      row: 1,
      title: 'စားအုန်းဆီ (Palm Oil)',
      sub: '၁ ပိဿာ (1 Viss) · Market',
      price: data.palmOilText,
      change: data.palmOilChangeText,
      dir: data.palmOilDirection,
    },
    {
      col: 1,
      row: 1,
      title: 'ရွှေဘိုပေါ်ဆန်း (Rice)',
      sub: '၁ အိတ် (1 Bag) · Market',
      price: data.shweboRiceText,
      change: data.shweboRiceChangeText,
      dir: data.shweboRiceDirection,
    },
  ];

  commCells.forEach((cell) => {
    const cxLeft = cell.col === 0 ? innerLeftX : midX + 26;
    const cxRight = cell.col === 0 ? midX - 26 : innerRightX;
    const cyTop = gridTopY + cell.row * cellH;

    ctx.fillStyle = p.inkPrimary;
    ctx.font = `700 20px ${MM_FONT}`;
    ctx.fillText(cell.title, cxLeft, cyTop + 36, cxRight - cxLeft - 95);

    drawCleanDeltaReadout(ctx, cell.change, cell.dir, cxRight, cyTop + 35, p, 16);

    ctx.fillStyle = p.inkMuted;
    ctx.font = `500 14px ${MM_FONT}`;
    ctx.fillText(cell.sub, cxLeft, cyTop + 62);

    drawInlineMixedSegments(
      ctx,
      [
        { text: cell.price, font: `700 34px ${NUM_FONT}`, color: p.inkPrimary },
        { text: ' ကျပ်', font: `600 17px ${MM_FONT}`, color: p.inkSecondary },
      ],
      cxRight,
      cyTop + 94
    );
  });

  // =========================================================================
  // 7. BROADSHEET FOOTER (y = 1252 .. 1316)
  // =========================================================================
  ctx.strokeStyle = p.borderHairline;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(margin, 1254);
  ctx.lineTo(margin + contentW, 1254);
  ctx.stroke();

  ctx.fillStyle = p.goldAccent;
  ctx.fillRect(margin, 1278, 8, 8);

  const logoSize = 40;
  const logoX = margin + contentW - logoSize;
  const logoY = 1266;

  ctx.textAlign = 'right';
  ctx.fillStyle = p.primaryAccent;
  ctx.font = `700 20px ${SERIF_FONT}`;
  const brandW = ctx.measureText(data.brandText).width;
  ctx.fillText(data.brandText, logoX - 14, 1293);
  ctx.textAlign = 'left';

  ctx.fillStyle = p.inkSecondary;
  ctx.font = `500 18px ${MM_FONT}`;
  const maxSourceW = Math.max(240, logoX - 14 - brandW - 28 - (margin + 20));
  ctx.fillText(`ရင်းမြစ်: ${data.sourceText}`, margin + 20, 1293, maxSourceW);

  drawMinimalLogoMark(ctx, logoX, logoY, logoSize, p.mastheadStart, p.goldBright);

  return canvas.toDataURL('image/png', 1.0);
}

export type TextSnapshotFormat = 'social' | 'detailed';

export interface StructuredSnapshotOptions extends PosterRenderOptions {
  digest?: DailyDigest;
  format?: TextSnapshotFormat;
}

function formatCompactDelta(delta: number, direction: RateDirection, decimals = 0): string {
  if (direction === 'unchanged' || delta === 0) return '0';
  const sign = direction === 'up' ? '+' : '-';
  const arrow = direction === 'up' ? '▲' : '▼';
  return `${arrow} ${sign}${formatPriceNumber(Math.abs(delta), decimals)}`;
}

function formatSignedPercent(pct: number): string {
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

export function buildStructuredMarketText(options: StructuredSnapshotOptions): string {
  const format = options.format ?? 'social';
  const d = resolveRateBoardData(options);
  const goldWorld = options.goldQuotes.find((g) => g.id === 'gold-world-spot');
  const fuel95 = options.commodityQuotes.find((cm) => cm.id === 'fuel-95');
  const premDiesel = options.commodityQuotes.find((cm) => cm.id === 'fuel-prem-diesel');
  const eur = options.currencyQuotes.find((c) => c.code === 'EUR');
  const myr = options.currencyQuotes.find((c) => c.code === 'MYR');
  const palmOil = options.commodityQuotes.find((cm) => cm.id === 'oil-palm');
  const riceShwebo = options.commodityQuotes.find((cm) => cm.id === 'rice-shwebo');

  if (format === 'social') {
    const lines: string[] = [
      `${d.brandText} — နေ့စဉ်ဈေးကွက် နှုန်းထားများ (${d.sessionText})`,
      `${d.dateText}  |  စုစည်းချိန်: ${d.gatheredTimeText}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `၁။ ရွှေဈေး (GOLD)`,
      `• ၁၆ ပဲရည် (24K): ${d.gold16Text} ကျပ် (${d.goldChangeText})`,
      `• ၁၅ ပဲရည် (22K): ${d.gold15Text} ကျပ်`,
    ];
    if (goldWorld) {
      lines.push(`• ကမ္ဘာ့ရွှေ (Spot): $${formatPriceNumber(goldWorld.marketRate, 2)}/oz`);
    }

    lines.push(
      ``,
      `၂။ နိုင်ငံခြားငွေဈေး (FOREX - MMK)`,
      `• USD: ဝယ် ${d.usdBuyText} / ရောင်း ${d.usdSellText} (${d.usdChangeText})`,
      `• SGD: ဝယ် ${d.sgdBuyText} / ရောင်း ${d.sgdSellText} (${d.sgdChangeText})`,
      `• THB: ဝယ် ${d.thbBuyText} / ရောင်း ${d.thbSellText} (${d.thbChangeText})`
    );
    if (eur) {
      lines.push(`• EUR: ဝယ် ${formatPriceNumber(eur.marketBuyRate)} / ရောင်း ${formatPriceNumber(eur.marketSellRate)}`);
    }
    if (myr) {
      lines.push(`• MYR: ဝယ် ${formatPriceNumber(myr.marketBuyRate)} / ရောင်း ${formatPriceNumber(myr.marketSellRate)}`);
    }

    lines.push(
      ``,
      `၃။ စက်သုံးဆီနှင့် အခြေခံစားကုန် (FUEL & STAPLES)`,
      `• ဓာတ်ဆီ (92): ${d.octane92Text} ကျပ်/လီတာ (${d.octane92ChangeText})`
    );
    if (fuel95) {
      lines.push(`• ဓာတ်ဆီ (95): ${formatPriceNumber(fuel95.openMarketRate)} ကျပ်/လီတာ`);
    }
    lines.push(`• ဒီဇယ်: ${d.dieselText} ကျပ်/လီတာ (${d.dieselChangeText})`);
    if (premDiesel) {
      lines.push(`• ပရီမီယံဒီဇယ်: ${formatPriceNumber(premDiesel.openMarketRate)} ကျပ်/လီတာ`);
    }
    if (palmOil) {
      lines.push(`• စားအုန်းဆီ (၁ ပိဿာ): ${formatPriceNumber(palmOil.openMarketRate)} ကျပ်`);
    }
    if (riceShwebo) {
      lines.push(`• ရွှေဘိုပေါ်ဆန်း (၁ အိတ်): ${formatPriceNumber(riceShwebo.openMarketRate)} ကျပ်`);
    }

    if (options.digest?.headlineMm) {
      lines.push(``, `သုံးသပ်ချက်: ${options.digest.headlineMm}`);
    }

    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, `ရင်းမြစ်: ${d.sourceText}`);
    return lines.join('\n');
  }

  const lines: string[] = [
    `============================================================`,
    `${d.brandText.toUpperCase()} — FULL MARKET INTELLIGENCE SNAPSHOT`,
    `Date: ${d.dateText} | Session: ${d.sessionText} | Gathered: ${d.gatheredTimeText}`,
    `============================================================`,
    ``,
    `[1] GOLD & PRECIOUS METALS (Official YGEA vs Open Market)`,
    ...options.goldQuotes.map((g) => {
      const isSpot = g.id === 'gold-world-spot';
      const unit = isSpot ? 'USD/oz' : 'Ks';
      const decimals = isSpot ? 2 : 0;
      const officialStr =
        !isSpot && g.officialRate > 0
          ? `Official ${formatPriceNumber(g.officialRate, decimals)}`
          : 'Global Spot Benchmark';
      const spreadStr =
        !isSpot && g.officialRate > 0 ? `Spread ${formatSignedPercent(g.spreadPercent)}` : '';
      return `• ${g.nameEn} (${g.nameMm}): Market ${formatPriceNumber(g.marketRate, decimals)} ${unit} | ${officialStr}${spreadStr ? ` | ${spreadStr}` : ''} | Δ ${formatCompactDelta(g.delta, g.deltaDirection, decimals)}`;
    }),
    ``,
    `[2] FOREIGN EXCHANGE RATES (CBM Reference vs Bank Online vs Street)`,
    ...options.currencyQuotes.map((c) => {
      const dec = c.code === 'THB' || c.code === 'JPY' ? 1 : 0;
      return `• ${c.code} (${c.nameMm}): Buy ${formatPriceNumber(c.marketBuyRate, dec)} / Sell ${formatPriceNumber(c.marketSellRate, dec)} Ks | CBM ${formatPriceNumber(c.cbmOfficialRate, dec)} | Online ${formatPriceNumber(c.onlineTradingRate, dec)} | Spread ${formatSignedPercent(c.spreadPercent)}`;
    }),
    ``,
    `[3] ESSENTIAL COMMODITIES & FUEL (Official Ref vs Open Market)`,
    ...options.commodityQuotes.map(
      (cm) =>
        `• ${cm.nameMm} (${cm.nameEn} / ${cm.unitEn}): Market ${formatPriceNumber(cm.openMarketRate)} Ks | Official ${formatPriceNumber(cm.officialRefRate)} Ks | Spread ${formatSignedPercent(cm.spreadPercent)}`
    ),
  ];

  if (options.digest) {
    lines.push(
      ``,
      `[4] EXECUTIVE MARKET BRIEFING (${options.digest.marketSentiment})`,
      `Headline: ${options.digest.headlineMm}`,
      ...options.digest.keyPointsMm.map((pt, idx) => `${idx + 1}. ${pt}`),
      `Spread Note: ${options.digest.spreadAnalysisMm}`
    );
  }

  lines.push(
    ``,
    `------------------------------------------------------------`,
    `Sources: ${d.sourceText}`,
    `Exported via ${d.brandText}`
  );

  return lines.join('\n');
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      currentLine = candidate;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

async function generateA4DetailSheetDataUrl(
  options: PosterRenderOptions & { digest?: DailyDigest }
): Promise<string> {
  await ensureFontsReady();

  const W = 1240;
  const H = 1754;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is unavailable');

  const d = resolveRateBoardData(options);
  const p = getThemePalette(options.headerTheme);
  const pad = 64;
  const contentW = W - pad * 2;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = p.mastheadStart;
  ctx.fillRect(pad, 52, contentW, 118);

  ctx.fillStyle = p.goldBright;
  ctx.fillRect(pad, 166, contentW, 4);

  ctx.fillStyle = p.goldBright;
  ctx.font = `700 15px ${DISPLAY_FONT}`;
  ctx.fillText('OFFICIAL VS OPEN MARKET · FULL SNAPSHOT BRIEFING', pad + 32, 92);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = `700 31px ${MM_FONT}`;
  ctx.fillText(`${d.brandText} — စျေးကွက်အနှစ်ချုပ် အစီရင်ခံစာ`, pad + 32, 136, contentW - 340);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#E2E8F0';
  ctx.font = `700 17px ${NUM_FONT}`;
  ctx.fillText(`${d.dateText} · ${d.sessionText}`, W - pad - 32, 102);
  ctx.fillStyle = p.goldBright;
  ctx.font = `600 15px ${NUM_FONT}`;
  ctx.fillText(`Gathered ${d.gatheredTimeText}`, W - pad - 32, 134);
  ctx.textAlign = 'left';

  let cursorY = 204;

  const drawTableSection = (
    title: string,
    columns: Array<{ label: string; x: number; align?: 'left' | 'right' }>,
    rows: Array<{ cells: Array<{ text: string; color?: string; bold?: boolean; mono?: boolean }> }>
  ) => {
    ctx.fillStyle = p.mastheadStart;
    ctx.fillRect(pad, cursorY, 5, 24);
    ctx.fillStyle = p.inkPrimary;
    ctx.font = `700 22px ${MM_FONT}`;
    ctx.fillText(title, pad + 15, cursorY + 20);
    cursorY += 36;

    ctx.fillStyle = p.tintRowBg;
    ctx.fillRect(pad, cursorY, contentW, 40);
    ctx.strokeStyle = p.borderHairline;
    ctx.lineWidth = 1;
    ctx.strokeRect(pad, cursorY, contentW, 40);

    ctx.fillStyle = p.inkMuted;
    ctx.font = `700 14px ${DISPLAY_FONT}`;
    columns.forEach((col) => {
      ctx.textAlign = col.align || 'left';
      ctx.fillText(col.label, col.x, cursorY + 25);
    });
    ctx.textAlign = 'left';
    cursorY += 40;

    rows.forEach((row, rIdx) => {
      const rowH = 44;
      if (rIdx % 2 === 1) {
        ctx.fillStyle = p.tintRowBg;
        ctx.fillRect(pad, cursorY, contentW, rowH);
      }
      ctx.strokeStyle = p.rowDivider;
      ctx.beginPath();
      ctx.moveTo(pad, cursorY + rowH);
      ctx.lineTo(pad + contentW, cursorY + rowH);
      ctx.stroke();

      row.cells.forEach((cell, cIdx) => {
        const col = columns[cIdx];
        ctx.textAlign = col.align || 'left';
        ctx.fillStyle = cell.color || p.inkPrimary;
        ctx.font = `${cell.bold ? '700' : '500'} 16px ${cell.mono ? NUM_FONT : MM_FONT}`;
        const maxColW = cIdx === 0 ? 350 : 210;
        ctx.fillText(cell.text, col.x, cursorY + 28, maxColW);
      });
      ctx.textAlign = 'left';
      cursorY += rowH;
    });
    cursorY += 28;
  };

  drawTableSection(
    '၁။ ရွှေဈေးနှုန်းများ (Gold & Bullion)',
    [
      { label: 'Asset / Grade', x: pad + 16 },
      { label: 'Official (YGEA)', x: pad + 560, align: 'right' },
      { label: 'Open Market', x: pad + 800, align: 'right' },
      { label: 'Spread', x: pad + 950, align: 'right' },
      { label: 'Delta', x: W - pad - 16, align: 'right' },
    ],
    options.goldQuotes.map((g) => {
      const isSpot = g.id === 'gold-world-spot';
      const dec = isSpot ? 2 : 0;
      const prefix = isSpot ? '$' : '';
      return {
        cells: [
          { text: `${g.nameMm} (${g.purity})`, bold: true },
          {
            text: !isSpot && g.officialRate > 0 ? `${prefix}${formatPriceNumber(g.officialRate, dec)}` : 'Global Spot',
            color: p.inkMuted,
            mono: true,
          },
          { text: `${prefix}${formatPriceNumber(g.marketRate, dec)}`, bold: true, color: p.goldText, mono: true },
          {
            text: !isSpot && g.officialRate > 0 ? formatSignedPercent(g.spreadPercent) : 'Benchmark',
            color: p.inkMuted,
            mono: true,
          },
          {
            text: formatCompactDelta(g.delta, g.deltaDirection, dec),
            color: g.deltaDirection === 'up' ? p.upText : g.deltaDirection === 'down' ? p.downText : p.inkMuted,
            mono: true,
          },
        ],
      };
    })
  );

  drawTableSection(
    '၂။ နိုင်ငံခြားငွေလဲလှယ်နှုန်း (Foreign Exchange - MMK)',
    [
      { label: 'Currency', x: pad + 16 },
      { label: 'CBM Official', x: pad + 470, align: 'right' },
      { label: 'Bank Online', x: pad + 650, align: 'right' },
      { label: 'Market Buy / Sell', x: pad + 920, align: 'right' },
      { label: 'Spread', x: W - pad - 16, align: 'right' },
    ],
    options.currencyQuotes.map((c) => {
      const dec = c.code === 'THB' || c.code === 'JPY' ? 1 : 0;
      return {
        cells: [
          { text: `${c.code} · ${c.nameMm}`, bold: true },
          { text: formatPriceNumber(c.cbmOfficialRate, dec), color: p.inkMuted, mono: true },
          { text: formatPriceNumber(c.onlineTradingRate, dec), color: p.primaryAccent, mono: true },
          {
            text: `${formatPriceNumber(c.marketBuyRate, dec)} / ${formatPriceNumber(c.marketSellRate, dec)}`,
            bold: true,
            mono: true,
          },
          { text: formatSignedPercent(c.spreadPercent), color: p.goldText, bold: true, mono: true },
        ],
      };
    })
  );

  drawTableSection(
    '၃။ စက်သုံးဆီနှင့် အခြေခံစားကုန် (Fuel & Essential Commodities)',
    [
      { label: 'Commodity', x: pad + 16 },
      { label: 'Official Ref', x: pad + 560, align: 'right' },
      { label: 'Open Market', x: pad + 800, align: 'right' },
      { label: 'Spread', x: pad + 950, align: 'right' },
      { label: 'Unit', x: W - pad - 16, align: 'right' },
    ],
    options.commodityQuotes.slice(0, 6).map((cm) => ({
      cells: [
        { text: cm.nameMm, bold: true },
        { text: formatPriceNumber(cm.officialRefRate), color: p.inkMuted, mono: true },
        { text: formatPriceNumber(cm.openMarketRate), bold: true, mono: true },
        { text: `+${cm.spreadPercent}%`, color: p.goldText, mono: true },
        { text: cm.unitEn, color: p.inkMuted },
      ],
    }))
  );

  if (options.digest && cursorY < H - 170) {
    const boxH = Math.min(250, H - 96 - cursorY);
    ctx.fillStyle = p.tintRowBg;
    ctx.fillRect(pad, cursorY, contentW, boxH);
    ctx.strokeStyle = p.borderHairline;
    ctx.strokeRect(pad, cursorY, contentW, boxH);

    ctx.fillStyle = p.mastheadStart;
    ctx.font = `700 18px ${MM_FONT}`;
    ctx.fillText(`၄။ ဈေးကွက်သုံးသပ်ချက် — ${options.digest.headlineMm}`, pad + 24, cursorY + 34, contentW - 48);

    ctx.font = `500 15px ${MM_FONT}`;
    ctx.fillStyle = p.inkSecondary;
    let textY = cursorY + 66;
    for (const pt of options.digest.keyPointsMm.slice(0, 3)) {
      const wrapped = wrapCanvasText(ctx, `• ${pt}`, contentW - 48);
      for (const line of wrapped) {
        if (textY > cursorY + boxH - 18) break;
        ctx.fillText(line, pad + 24, textY);
        textY += 24;
      }
    }
  }

  ctx.strokeStyle = p.borderHairline;
  ctx.beginPath();
  ctx.moveTo(pad, H - 72);
  ctx.lineTo(W - pad, H - 72);
  ctx.stroke();

  ctx.fillStyle = p.inkMuted;
  ctx.font = `600 15px ${MM_FONT}`;
  ctx.fillText(`ရင်းမြစ်: ${d.sourceText}`, pad, H - 42);
  ctx.textAlign = 'right';
  ctx.fillText(`${d.brandText} · Page 2 / Full Snapshot`, W - pad, H - 42);
  ctx.textAlign = 'left';

  return canvas.toDataURL('image/png', 0.95);
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load poster image for PDF export'));
    img.src = src;
  });
}

async function generateA4CoverSheetDataUrl(
  options: PosterRenderOptions,
  posterUrl: string
): Promise<string> {
  await ensureFontsReady();
  const W = 1240;
  const H = 1754;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is unavailable');

  const d = resolveRateBoardData(options);
  const p = getThemePalette(options.headerTheme);
  const pad = 64;

  ctx.fillStyle = p.paperBg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = p.inkPrimary;
  ctx.font = `700 22px ${SERIF_FONT}`;
  ctx.fillText(d.brandText, pad, 62);

  ctx.textAlign = 'right';
  ctx.fillStyle = p.inkMuted;
  ctx.font = `600 18px ${MM_FONT}`;
  ctx.fillText(`${d.dateText}  ·  ${d.sessionText}  ·  ${d.gatheredTimeText}`, W - pad, 62);
  ctx.textAlign = 'left';

  ctx.strokeStyle = p.borderHairline;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(pad, 84);
  ctx.lineTo(W - pad, 84);
  ctx.stroke();

  const posterImg = await loadImageElement(posterUrl);
  const targetW = W - pad * 2;
  const targetH = (targetW * 5) / 4;
  const posterY = 124;

  ctx.save();
  ctx.shadowColor = 'rgba(15, 23, 42, 0.08)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;
  ctx.drawImage(posterImg, pad, posterY, targetW, targetH);
  ctx.restore();

  ctx.strokeStyle = p.borderHairline;
  ctx.beginPath();
  ctx.moveTo(pad, H - 72);
  ctx.lineTo(W - pad, H - 72);
  ctx.stroke();

  ctx.fillStyle = p.inkMuted;
  ctx.font = `600 16px ${MM_FONT}`;
  ctx.fillText(`ရင်းမြစ်: ${d.sourceText}`, pad, H - 40);
  ctx.textAlign = 'right';
  ctx.fillText('Page 1 / 2 · Daily Rate Board', W - pad, H - 40);
  ctx.textAlign = 'left';

  return canvas.toDataURL('image/png', 0.95);
}

export async function generateMarketSnapshotPdf(
  options: PosterRenderOptions & { digest?: DailyDigest; posterDataUrl?: string | null }
): Promise<void> {
  const posterUrl = options.posterDataUrl || (await generateMarketPosterDataUrl(options));
  const [coverSheetUrl, detailSheetUrl] = await Promise.all([
    generateA4CoverSheetDataUrl(options, posterUrl),
    generateA4DetailSheetDataUrl(options),
  ]);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  doc.addImage(coverSheetUrl, 'PNG', 0, 0, pageW, pageH, undefined, 'FAST');

  doc.addPage('a4', 'portrait');
  doc.addImage(detailSheetUrl, 'PNG', 0, 0, pageW, pageH, undefined, 'FAST');

  const safeDate = new Date().toISOString().slice(0, 10);
  doc.save(`Myanmar_Market_Snapshot_${options.session}_${safeDate}.pdf`);
}
