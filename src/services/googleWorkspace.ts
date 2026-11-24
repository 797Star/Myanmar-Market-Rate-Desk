import type {
  GoldQuote,
  CurrencyQuote,
  CommodityQuote,
  InflationBasketItem,
  DailyDigest,
  MarketSession,
} from '../types';

export interface DriveFileItem {
  id: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export interface SheetTabMeta {
  sheetId: number;
  title: string;
  rowCount: number;
  columnCount: number;
}

export interface SpreadsheetMeta {
  spreadsheetId: string;
  title: string;
  spreadsheetUrl: string;
  sheets: SheetTabMeta[];
}

export interface PresentationMeta {
  presentationId: string;
  title: string;
  slideCount: number;
  presentationUrl: string;
}

export interface MarketExportPayload {
  session: MarketSession;
  dateStr: string;
  goldQuotes: GoldQuote[];
  currencyQuotes: CurrencyQuote[];
  commodityQuotes: CommodityQuote[];
  basketItems: InflationBasketItem[];
  basketQuantities: Record<string, number>;
  digest: DailyDigest;
}

async function workspaceFetch<T>(url: string, accessToken: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Google API returned non-JSON response (${res.status})`);
  }

  if (!res.ok) {
    const errMsg = json?.error?.message || `Google API request failed (${res.status})`;
    throw new Error(errMsg);
  }
  return json as T;
}

// Extract file ID from full Google Sheets/Slides URL or raw ID
export function extractGoogleFileId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) return match[1];
  return trimmed;
}

// ==========================================
// GOOGLE DRIVE FILE DISCOVERY
// ==========================================

export async function listUserSpreadsheets(accessToken: string): Promise<DriveFileItem[]> {
  const q = encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime desc&pageSize=15&fields=files(id,name,modifiedTime,webViewLink)`;
  const data = await workspaceFetch<{ files?: DriveFileItem[] }>(url, accessToken);
  return data.files || [];
}

export async function listUserPresentations(accessToken: string): Promise<DriveFileItem[]> {
  const q = encodeURIComponent("mimeType='application/vnd.google-apps.presentation' and trashed=false");
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime desc&pageSize=15&fields=files(id,name,modifiedTime,webViewLink)`;
  const data = await workspaceFetch<{ files?: DriveFileItem[] }>(url, accessToken);
  return data.files || [];
}

// ==========================================
// GOOGLE SHEETS API
// ==========================================

export async function getSpreadsheetMetadata(
  accessToken: string,
  spreadsheetId: string
): Promise<SpreadsheetMeta> {
  const cleanId = extractGoogleFileId(spreadsheetId);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(cleanId)}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets.properties`;
  const data = await workspaceFetch<any>(url, accessToken);

  return {
    spreadsheetId: data.spreadsheetId,
    title: data.properties?.title || 'Untitled Spreadsheet',
    spreadsheetUrl: data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}`,
    sheets: (data.sheets || []).map((s: any) => ({
      sheetId: s.properties?.sheetId ?? 0,
      title: s.properties?.title || 'Tab',
      rowCount: s.properties?.gridProperties?.rowCount ?? 100,
      columnCount: s.properties?.gridProperties?.columnCount ?? 26,
    })),
  };
}

export async function readSheetRange(
  accessToken: string,
  spreadsheetId: string,
  sheetTitle: string,
  cellRange = 'A1:H40'
): Promise<string[][]> {
  const cleanId = extractGoogleFileId(spreadsheetId);
  const safeSheet = `'${sheetTitle.replace(/'/g, "''")}'!${cellRange}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(cleanId)}/values/${encodeURIComponent(safeSheet)}`;
  const data = await workspaceFetch<{ values?: string[][] }>(url, accessToken);
  return data.values || [];
}

export function buildMarketSheetRows(payload: MarketExportPayload): (string | number)[][] {
  const sessionLabel = payload.session === 'morning' ? 'Morning (09:30 AM)' : 'Evening (04:30 PM)';
  const rows: (string | number)[][] = [
    ['Myanmar Daily Economic & Market Monitor', payload.dateStr, sessionLabel, '', '', '', ''],
    ['Category', 'Asset ID', 'Name (Myanmar)', 'Name (English)', 'Official Ref (MMK)', 'Open Market (MMK)', 'Spread (%)'],
  ];

  payload.goldQuotes.forEach((g) => {
    rows.push(['Gold', g.id, g.nameMm, g.nameEn, g.officialRate, g.marketRate, `${g.spreadPercent}%`]);
  });

  payload.currencyQuotes.forEach((c) => {
    rows.push(['Currency', c.code, c.nameMm, c.nameEn, c.cbmOfficialRate, c.marketSellRate, `${c.spreadPercent}%`]);
  });

  payload.commodityQuotes.forEach((cm) => {
    rows.push([
      `Commodity (${cm.category})`,
      cm.id,
      cm.nameMm,
      cm.nameEn,
      cm.officialRefRate,
      cm.openMarketRate,
      `${cm.spreadPercent}%`,
    ]);
  });

  rows.push([]);
  rows.push(['Household Inflation Basket', 'Monthly Qty', 'Unit', 'Official Unit Cost', 'Market Unit Cost', 'Monthly Official', 'Monthly Market']);
  payload.basketItems.forEach((b) => {
    const qty = payload.basketQuantities[b.id] ?? b.defaultMonthlyQty;
    rows.push([
      b.nameMm,
      qty,
      b.unitMm,
      b.unitPriceOfficial,
      b.unitPriceMarket,
      qty * b.unitPriceOfficial,
      qty * b.unitPriceMarket,
    ]);
  });

  rows.push([]);
  rows.push(['AI Executive Digest', payload.digest.headlineMm]);
  rows.push(['English Summary', payload.digest.headlineEn]);
  rows.push(['Spread Intelligence', payload.digest.spreadAnalysisMm]);

  return rows;
}

export async function createMarketSpreadsheet(
  accessToken: string,
  title: string,
  payload: MarketExportPayload
): Promise<{ spreadsheetId: string; spreadsheetUrl: string; title: string }> {
  const createRes = await workspaceFetch<any>(
    'https://sheets.googleapis.com/v4/spreadsheets',
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        properties: { title },
        sheets: [
          { properties: { title: 'Market Rates & Spreads' } },
          { properties: { title: 'Executive Digest' } },
        ],
      }),
    }
  );

  const spreadsheetId = createRes.spreadsheetId;
  const spreadsheetUrl = createRes.spreadsheetUrl;

  const rateRows = buildMarketSheetRows(payload);
  const digestRows = [
    ['Myanmar Economic Digest', payload.dateStr, payload.session === 'morning' ? 'Morning' : 'Evening'],
    ['Headline (MM)', payload.digest.headlineMm],
    ['Headline (EN)', payload.digest.headlineEn],
    ['Sentiment', payload.digest.marketSentiment],
    ['Spread Analysis', payload.digest.spreadAnalysisMm],
    ['Key Points', ...payload.digest.keyPointsMm],
  ];

  await workspaceFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: [
          { range: "'Market Rates & Spreads'!A1", values: rateRows },
          { range: "'Executive Digest'!A1", values: digestRows },
        ],
      }),
    }
  );

  return { spreadsheetId, spreadsheetUrl, title };
}

export async function syncMarketToExistingSheet(
  accessToken: string,
  spreadsheetId: string,
  sheetTitle: string,
  payload: MarketExportPayload,
  mode: 'append' | 'overwrite'
): Promise<{ updatedRange: string }> {
  const cleanId = extractGoogleFileId(spreadsheetId);
  const rows = buildMarketSheetRows(payload);
  const targetRange = `'${sheetTitle.replace(/'/g, "''")}'!A1`;

  if (mode === 'append') {
    const res = await workspaceFetch<any>(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(cleanId)}/values/${encodeURIComponent(targetRange)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({ values: rows }),
      }
    );
    return { updatedRange: res.updates?.updatedRange || sheetTitle };
  }

  const res = await workspaceFetch<any>(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(cleanId)}/values/${encodeURIComponent(targetRange)}?valueInputOption=USER_ENTERED`,
    accessToken,
    {
      method: 'PUT',
      body: JSON.stringify({ values: rows }),
    }
  );
  return { updatedRange: res.updatedRange || sheetTitle };
}

// ==========================================
// GOOGLE SLIDES API
// ==========================================

export async function getPresentationMetadata(
  accessToken: string,
  presentationId: string
): Promise<PresentationMeta> {
  const cleanId = extractGoogleFileId(presentationId);
  const url = `https://slides.googleapis.com/v1/presentations/${encodeURIComponent(cleanId)}?fields=presentationId,title,slides.objectId`;
  const data = await workspaceFetch<any>(url, accessToken);
  return {
    presentationId: data.presentationId,
    title: data.title || 'Untitled Presentation',
    slideCount: Array.isArray(data.slides) ? data.slides.length : 0,
    presentationUrl: `https://docs.google.com/presentation/d/${data.presentationId}/edit`,
  };
}

function buildSlideInsertRequests(slideId: string, titleText: string, bodyText: string, insertionIndex?: number) {
  const titleBoxId = `${slideId}_title`;
  const bodyBoxId = `${slideId}_body`;

  const createSlideReq: any = {
    createSlide: {
      objectId: slideId,
      slideLayoutReference: { predefinedLayout: 'TITLE_AND_BODY' },
      placeholderIdMappings: [
        { layoutPlaceholder: { type: 'TITLE', index: 0 }, objectId: titleBoxId },
        { layoutPlaceholder: { type: 'BODY', index: 0 }, objectId: bodyBoxId },
      ],
    },
  };

  if (typeof insertionIndex === 'number') {
    createSlideReq.createSlide.insertionIndex = insertionIndex;
  }

  return [
    createSlideReq,
    {
      insertText: {
        objectId: titleBoxId,
        insertionIndex: 0,
        text: titleText,
      },
    },
    {
      insertText: {
        objectId: bodyBoxId,
        insertionIndex: 0,
        text: bodyText,
      },
    },
  ];
}

export async function createMarketBriefingDeck(
  accessToken: string,
  title: string,
  payload: MarketExportPayload
): Promise<{ presentationId: string; presentationUrl: string; title: string }> {
  const created = await workspaceFetch<any>(
    'https://slides.googleapis.com/v1/presentations',
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({ title }),
    }
  );

  const presentationId = created.presentationId;
  const presentationUrl = `https://docs.google.com/presentation/d/${presentationId}/edit`;
  const firstSlide = created.slides?.[0];

  const sessionLabel = payload.session === 'morning' ? 'မနက်ပိုင်း စျေးကွက် (Morning)' : 'ညနေပိုင်း စျေးကွက် (Evening)';

  const gold24k = payload.goldQuotes.find((g) => g.id === 'gold-24k');
  const gold15pe = payload.goldQuotes.find((g) => g.id === 'gold-15pe');
  const fxLines = payload.currencyQuotes
    .map(
      (c) =>
        `• ${c.code} (${c.nameMm}): ပြင်ပ ${c.marketSellRate.toLocaleString()} Ks | CBM ${c.cbmOfficialRate.toLocaleString()} Ks (Gap +${c.spreadPercent}%)`
    )
    .join('\n');

  const commodityLines = payload.commodityQuotes
    .slice(0, 6)
    .map(
      (cm) =>
        `• ${cm.nameMm}: ပြင်ပ ${cm.openMarketRate.toLocaleString()} Ks | ရည်ညွှန်း ${cm.officialRefRate.toLocaleString()} Ks (+${cm.spreadPercent}%)`
    )
    .join('\n');

  let totalOfficial = 0;
  let totalMarket = 0;
  payload.basketItems.forEach((b) => {
    const qty = payload.basketQuantities[b.id] ?? b.defaultMonthlyQty;
    totalOfficial += qty * b.unitPriceOfficial;
    totalMarket += qty * b.unitPriceMarket;
  });

  const digestBody = `${payload.digest.headlineMm}\n"${payload.digest.headlineEn}"\n\n` +
    payload.digest.keyPointsMm.map((pt) => `• ${pt}`).join('\n') +
    `\n\nSpread Analysis: ${payload.digest.spreadAnalysisMm}`;

  const goldFxBody =
    `ရွှေစျေးနှုန်းများ (Gold Prices):\n` +
    `• ၂၄K အခေါက်ရွှေ: ပြင်ပ ${gold24k?.marketRate.toLocaleString()} Ks | YGEA ${gold24k?.officialRate.toLocaleString()} Ks (+${gold24k?.spreadPercent}%)\n` +
    `• ၁၅ ပဲရည်ရွှေ: ပြင်ပ ${gold15pe?.marketRate.toLocaleString()} Ks | YGEA ${gold15pe?.officialRate.toLocaleString()} Ks\n\n` +
    `နိုင်ငံခြားငွေလဲနှုန်းများ (Foreign Exchange):\n${fxLines}`;

  const commodityBody =
    `အခြေခံစားသောက်ကုန်နှင့် စက်သုံးဆီ:\n${commodityLines}\n\n` +
    `အိမ်ထောင်စု လစဉ်ကုန်ကျစရိတ် ခြင်းတောင်း:\n` +
    `• တရားဝင်နှုန်းဖြင့်: ${totalOfficial.toLocaleString()} Ks/လ\n` +
    `• ပြင်ပပေါက်စျေးဖြင့်: ${totalMarket.toLocaleString()} Ks/လ (+${(totalMarket - totalOfficial).toLocaleString()} Ks ဖိအား)`;

  const requests: any[] = [];
  if (firstSlide?.objectId) {
    requests.push({ deleteObject: { objectId: firstSlide.objectId } });
  }

  const ts = Date.now();
  requests.push(
    ...buildSlideInsertRequests(
      `slide_cover_${ts}`,
      `မြန်မာ့စီးပွားရေးနှင့် စျေးကွက်စောင့်ကြည့်ရေး`,
      `${payload.dateStr}\n${sessionLabel}\n\nMarket Sentiment: ${payload.digest.marketSentiment}\nSources: CBM · YGEA · PPRD · DOCA · World Bank`,
      0
    ),
    ...buildSlideInsertRequests(
      `slide_digest_${ts}`,
      `အလုပ်အမှုဆောင် စျေးကွက်သုံးသပ်ချက် (Executive Digest)`,
      digestBody,
      1
    ),
    ...buildSlideInsertRequests(
      `slide_gold_fx_${ts}`,
      `ရွှေနှင့် နိုင်ငံခြားငွေ (Official vs Open Market)`,
      goldFxBody,
      2
    ),
    ...buildSlideInsertRequests(
      `slide_comm_${ts}`,
      `ဆန်၊ ဆီ၊ စက်သုံးဆီနှင့် အိမ်ထောင်စု ကုန်ကျစရိတ်`,
      commodityBody,
      3
    )
  );

  await workspaceFetch(
    `https://slides.googleapis.com/v1/presentations/${encodeURIComponent(presentationId)}:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({ requests }),
    }
  );

  return { presentationId, presentationUrl, title };
}

export async function appendBriefingSlideToDeck(
  accessToken: string,
  presentationId: string,
  payload: MarketExportPayload
): Promise<{ presentationUrl: string }> {
  const cleanId = extractGoogleFileId(presentationId);
  const gold24k = payload.goldQuotes.find((g) => g.id === 'gold-24k');
  const usd = payload.currencyQuotes.find((c) => c.code === 'USD');
  const thb = payload.currencyQuotes.find((c) => c.code === 'THB');
  const fuel92 = payload.commodityQuotes.find((cm) => cm.id === 'fuel-92');
  const palmOil = payload.commodityQuotes.find((cm) => cm.id === 'oil-palm');
  const sessionLabel = payload.session === 'morning' ? 'မနက်ပိုင်း (Morning)' : 'ညနေပိုင်း (Evening)';

  const slideBody =
    `${payload.digest.headlineMm}\n\n` +
    `• ၂၄K ရွှေ: ${gold24k?.marketRate.toLocaleString()} Ks (YGEA: ${gold24k?.officialRate.toLocaleString()} Ks)\n` +
    `• USD: ${usd?.marketSellRate.toLocaleString()} Ks (CBM: ${usd?.cbmOfficialRate.toLocaleString()} Ks)\n` +
    `• THB: ${thb?.marketSellRate.toFixed(1)} Ks (CBM: ${thb?.cbmOfficialRate.toFixed(1)} Ks)\n` +
    `• စားအုန်းဆီ: ${palmOil?.openMarketRate.toLocaleString()} Ks/ပိဿာ (DOCA: ${palmOil?.officialRefRate.toLocaleString()} Ks)\n` +
    `• အောက်တိန်း ၉၂: ${fuel92?.openMarketRate.toLocaleString()} Ks/L (PPRD: ${fuel92?.officialRefRate.toLocaleString()} Ks)\n\n` +
    `${payload.digest.spreadAnalysisMm}`;

  const slideId = `mm_brief_${Date.now()}`;
  const requests = buildSlideInsertRequests(
    slideId,
    `${payload.dateStr} — ${sessionLabel} စျေးကွက်အနှစ်ချုပ်`,
    slideBody
  );

  await workspaceFetch(
    `https://slides.googleapis.com/v1/presentations/${encodeURIComponent(cleanId)}:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({ requests }),
    }
  );

  return {
    presentationUrl: `https://docs.google.com/presentation/d/${cleanId}/edit`,
  };
}
