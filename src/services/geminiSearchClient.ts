import { ThinkingLevel, type GenerateContentResponse, type GoogleGenAI } from '@google/genai';

export interface GroundedSearchCallOptions {
  aiClient: GoogleGenAI;
  prompt: string;
  systemInstruction: string;
  timeoutMs?: number;
  label?: string;
}

export interface GroundedSearchCallResult {
  response: GenerateContentResponse;
  modelUsed: string;
  retried: boolean;
}

const PRIMARY_SEARCH_MODEL = 'gemini-4-hydrogen';
const FALLBACK_SEARCH_MODEL = 'gemini-3.1-flash-lite';
const MIN_SEARCH_SPACING_MS = 2200;

let searchQueueChain: Promise<void> = Promise.resolve();
let lastSearchCompletedAtMs = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isQuotaOrRateLimitError(err: unknown): boolean {
  const msg = extractRawErrorMessage(err);
  return /429|RESOURCE_EXHAUSTED|quota|Too Many Requests|rate[_ ]?limit/i.test(msg);
}

export function extractRawErrorMessage(err: unknown): string {
  if (!err) return 'Unknown Google Search error';
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export function parseRetryDelayMs(err: unknown): number | null {
  const msg = extractRawErrorMessage(err);
  // Matches formats like "retryDelay":"12s", "Please retry in 3.5s", "retry in 45s"
  const match =
    msg.match(/retryDelay["']?\s*[:=]\s*["']?(\d+(?:\.\d+)?)s/i) ||
    msg.match(/retry\s+in\s+(\d+(?:\.\d+)?)s/i);
  if (!match) return null;
  const seconds = Number.parseFloat(match[1]);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds * 1000) : null;
}

export function formatQuotaErrorMessage(err: unknown, contextLabel = 'Google Search'): string {
  const raw = extractRawErrorMessage(err);
  const retryMs = parseRetryDelayMs(err);
  const retryNote =
    retryMs && retryMs >= 1000
      ? ` Retry available in ~${Math.ceil(retryMs / 1000)}s.`
      : '';

  if (isQuotaOrRateLimitError(err)) {
    const isDaily = /per[_ ]?day|daily|RPD|grounding_requests/i.test(raw);
    if (isDaily) {
      return `${contextLabel} daily quota (429 RESOURCE_EXHAUSTED) reached on the current API key. Attach a billing-enabled key in Settings > Secrets or retry after quota resets.${retryNote}`;
    }
    return `${contextLabel} rate limit (429 RESOURCE_EXHAUSTED) reached; using cached/baseline rates.${retryNote} Click Retry Google Search shortly or check Settings > Secrets.`;
  }

  return raw;
}

async function runSingleGenerateSearch(params: {
  aiClient: GoogleGenAI;
  model: string;
  prompt: string;
  systemInstruction: string;
  timeoutMs: number;
  useLowThinking: boolean;
}): Promise<GenerateContentResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(new Error(`Google Search (${params.model}) timed out after ${params.timeoutMs}ms`)),
    params.timeoutMs
  );

  try {
    return await params.aiClient.models.generateContent({
      model: params.model,
      contents: params.prompt,
      config: {
        abortSignal: controller.signal,
        ...(params.useLowThinking
          ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
          : {}),
        tools: [{ googleSearch: {} }],
        systemInstruction: params.systemInstruction,
      },
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Serializes all Google Search Grounding requests across market rates and news,
 * applies exponential backoff for transient 429 RPM limits, and automatically
 * falls back from gemini-4-hydrogen to gemini-3.1-flash-lite if quota is hit.
 */
export async function executeGroundedSearchWithQuotaGuard(
  options: GroundedSearchCallOptions
): Promise<GroundedSearchCallResult> {
  const execute = async (): Promise<GroundedSearchCallResult> => {
    const elapsedSinceLast = Date.now() - lastSearchCompletedAtMs;
    if (lastSearchCompletedAtMs > 0 && elapsedSinceLast < MIN_SEARCH_SPACING_MS) {
      await sleep(MIN_SEARCH_SPACING_MS - elapsedSinceLast);
    }

    const timeoutMs = options.timeoutMs ?? 28000;
    let retried = false;

    try {
      try {
        const response = await runSingleGenerateSearch({
          aiClient: options.aiClient,
          model: PRIMARY_SEARCH_MODEL,
          prompt: options.prompt,
          systemInstruction: options.systemInstruction,
          timeoutMs,
          useLowThinking: true,
        });
        return { response, modelUsed: PRIMARY_SEARCH_MODEL, retried };
      } catch (primaryErr) {
        const isQuota = isQuotaOrRateLimitError(primaryErr);
        const retryMs = parseRetryDelayMs(primaryErr);

        // Short exponential backoff retry on primary model if transient RPM 429
        if (isQuota && (!retryMs || retryMs <= 4000)) {
          retried = true;
          await sleep(Math.min(Math.max(retryMs ?? 1600, 1200), 4000));
          try {
            const response = await runSingleGenerateSearch({
              aiClient: options.aiClient,
              model: PRIMARY_SEARCH_MODEL,
              prompt: options.prompt,
              systemInstruction: options.systemInstruction,
              timeoutMs,
              useLowThinking: true,
            });
            return { response, modelUsed: PRIMARY_SEARCH_MODEL, retried };
          } catch (retryErr) {
            if (!isQuotaOrRateLimitError(retryErr)) {
              throw retryErr;
            }
          }
        } else if (!isQuota) {
          throw primaryErr;
        }

        // Separate model bucket fallback: gemini-3.1-flash-lite
        retried = true;
        const fallbackResponse = await runSingleGenerateSearch({
          aiClient: options.aiClient,
          model: FALLBACK_SEARCH_MODEL,
          prompt: options.prompt,
          systemInstruction: options.systemInstruction,
          timeoutMs,
          useLowThinking: false,
        });
        return { response: fallbackResponse, modelUsed: FALLBACK_SEARCH_MODEL, retried };
      }
    } finally {
      lastSearchCompletedAtMs = Date.now();
    }
  };

  const resultPromise = searchQueueChain.then(execute, execute);
  searchQueueChain = resultPromise.then(
    () => undefined,
    () => undefined
  );
  return resultPromise;
}
