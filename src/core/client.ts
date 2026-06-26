/**
 * Thin OpenAI-compatible HTTP client.
 *
 * This is the entire "provider API code" — a single `fetch` against an
 * OpenAI-style `/chat/completions` endpoint, with optional bearer auth and SSE
 * streaming. It replaces OmniRoute's executor + base + translator stack for the
 * subset of providers that already speak the OpenAI format (all the keyless
 * ones included here do).
 *
 * No retries, no backoff, no circuit-breaker — by design. If you want
 * "try the next free provider on failure", do it in your own loop or use the
 * `chat()` fallback in the `OmniRouter` class.
 */

import type { ChatChunk, ChatCompletion, ChatParams, ProviderDef } from "./types.ts";

export interface CallOptions {
  /** Optional bearer token (only meaningful for `auth: "optional"` providers). */
  apiKey?: string;
  /** Abort the in-flight request. */
  signal?: AbortSignal;
  /** Override the global fetch (handy for tests). */
  fetchImpl?: typeof fetch;
  /** Request timeout in ms (default 120_000). Ignored if `signal` is passed. */
  timeoutMs?: number;
}

export class ProviderHttpError extends Error {
  constructor(
    public provider: string,
    public status: number,
    public body: string
  ) {
    super(`[${provider}] upstream HTTP ${status}: ${body.slice(0, 300)}`);
    this.name = "ProviderHttpError";
  }
}

function buildHeaders(
  provider: ProviderDef,
  opts: CallOptions,
  stream: boolean
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(provider.extraHeaders ?? {}),
  };
  if (stream) headers["Accept"] = "text/event-stream";
  if (opts.apiKey) headers["Authorization"] = `Bearer ${opts.apiKey}`;
  return headers;
}

function buildBody(
  provider: ProviderDef,
  model: string,
  params: ChatParams,
  stream: boolean
): Record<string, unknown> {
  const body: Record<string, unknown> = { ...params, model, stream };
  return provider.transformBody ? provider.transformBody(body) : body;
}

function makeSignal(opts: CallOptions): AbortSignal | undefined {
  if (opts.signal) return opts.signal;
  const ms = opts.timeoutMs ?? 120_000;
  if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) {
    return AbortSignal.timeout(ms);
  }
  return undefined;
}

async function post(
  provider: ProviderDef,
  model: string,
  params: ChatParams,
  stream: boolean,
  opts: CallOptions
): Promise<Response> {
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(provider.baseUrl, {
    method: "POST",
    headers: buildHeaders(provider, opts, stream),
    body: JSON.stringify(buildBody(provider, model, params, stream)),
    signal: makeSignal(opts),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ProviderHttpError(provider.id, res.status, text);
  }
  return res;
}

/** Non-streaming chat completion. */
export async function chatCompletion(
  provider: ProviderDef,
  model: string,
  params: ChatParams,
  opts: CallOptions = {}
): Promise<ChatCompletion> {
  const res = await post(provider, model, params, false, opts);
  return (await res.json()) as ChatCompletion;
}

/** Streaming chat completion — yields OpenAI-style chunks as they arrive. */
export async function* chatStream(
  provider: ProviderDef,
  model: string,
  params: ChatParams,
  opts: CallOptions = {}
): AsyncGenerator<ChatChunk> {
  const res = await post(provider, model, params, true, opts);
  if (!res.body) return;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line.
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        for (const line of frame.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (data === "" || data === "[DONE]") continue;
          try {
            yield JSON.parse(data) as ChatChunk;
          } catch {
            // Ignore non-JSON keep-alive frames.
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Collect a streamed completion into a single string of assistant text. */
export async function streamToText(
  stream: AsyncGenerator<ChatChunk>
): Promise<string> {
  let out = "";
  for await (const chunk of stream) {
    out += chunk.choices?.[0]?.delta?.content ?? "";
  }
  return out;
}
