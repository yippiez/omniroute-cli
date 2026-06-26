/**
 * structured.ts — structured JSON output and tool calling.
 *
 * Free keyless models vary wildly in how well they honour OpenAI's
 * `response_format` / `tools`. The strategy here is two-layered:
 *
 *   1. NATIVE first — send `response_format: { type: "json_schema" | "json_object" }`
 *      (and `tools` for tool calling). Strong providers do the right thing.
 *   2. REPAIR LOOP — parse the reply; if it isn't valid JSON (or fails the
 *      caller's `validate`), feed the bad output and the error back to the model
 *      and ask it to fix it, up to `maxRepairs` times. This is what makes weak
 *      models usable for structured output.
 *
 * @example
 * ```ts
 * import { structured } from "omnirouter-cli";
 * const out = await structured<{ city: string; temp: number }>(
 *   "Give me the weather in Paris as JSON.",
 *   { schema: { type: "object", properties: { city: { type: "string" }, temp: { type: "number" } }, required: ["city", "temp"] } }
 * );
 * ```
 */
import { OmniRouter } from "../core/omnirouter.ts";
import { DEFAULT_MODEL } from "./ask.ts";
import type { ChatMessage, ResponseFormat, Tool, ToolCall } from "../core/types.ts";

export interface StructuredOptions {
  /** Model id. Default "auto". */
  model?: string;
  /** Optional system prompt prepended before the JSON instruction. */
  system?: string;
  /** Optional per-provider bearer tokens. */
  keys?: Record<string, string>;
  temperature?: number;
  maxTokens?: number;
  fetchImpl?: typeof fetch;
  /** JSON Schema to constrain the output. When set, uses `json_schema` natively. */
  schema?: Record<string, unknown>;
  /** Name for the schema (sent in `json_schema`). Default "output". */
  schemaName?: string;
  /** Max corrective re-prompts when the reply isn't valid JSON. Default 3. */
  maxRepairs?: number;
  /**
   * Optional extra validation on the parsed value. Return an error string to
   * trigger a repair attempt, or `null`/`undefined` when the value is good.
   */
  validate?: (value: unknown) => string | null | undefined;
  /** Skip native `response_format` and rely purely on prompting + repair loop. */
  noNative?: boolean;
}

export class StructuredOutputError extends Error {
  constructor(
    message: string,
    /** The last raw model output we failed to parse. */
    public lastOutput: string,
    public attempts: number
  ) {
    super(message);
    this.name = "StructuredOutputError";
  }
}

/**
 * Pull a JSON value out of model text, tolerating markdown code fences and
 * leading/trailing prose. Returns the parsed value or throws a SyntaxError.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();

  // Strip a ```json ... ``` (or plain ```) fence if present.
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fence ? fence[1].trim() : trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    // Fall back to the first {...} or [...] span in the text.
    const start = candidate.search(/[{[]/);
    if (start !== -1) {
      const open = candidate[start];
      const close = open === "{" ? "}" : "]";
      const end = candidate.lastIndexOf(close);
      if (end > start) {
        return JSON.parse(candidate.slice(start, end + 1));
      }
    }
    throw new SyntaxError("no parseable JSON found in model output");
  }
}

function responseFormat(opts: StructuredOptions): ResponseFormat {
  if (opts.schema) {
    return {
      type: "json_schema",
      json_schema: { name: opts.schemaName ?? "output", schema: opts.schema, strict: true },
    };
  }
  return { type: "json_object" };
}

function jsonInstruction(opts: StructuredOptions): string {
  let msg = "Respond with a single valid JSON value and nothing else — no prose, no markdown code fences.";
  if (opts.schema) {
    msg += ` The JSON must conform to this JSON Schema:\n${JSON.stringify(opts.schema)}`;
  }
  return msg;
}

/**
 * Ask the model for structured JSON. Returns the parsed value (typed as `T`).
 * Throws `StructuredOutputError` if no valid JSON could be obtained within
 * `maxRepairs` attempts.
 */
export async function structured<T = unknown>(
  prompt: string,
  opts: StructuredOptions = {}
): Promise<T> {
  const ai = new OmniRouter({ keys: opts.keys, fetchImpl: opts.fetchImpl });
  const maxRepairs = opts.maxRepairs ?? 3;

  const messages: ChatMessage[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "system", content: jsonInstruction(opts) });
  messages.push({ role: "user", content: prompt });

  let lastOutput = "";
  let lastError = "";

  // attempt 0 is the first try; 1..maxRepairs are corrective re-prompts.
  for (let attempt = 0; attempt <= maxRepairs; attempt++) {
    const res = await ai.chat({
      model: opts.model ?? DEFAULT_MODEL,
      messages,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      ...(opts.noNative ? {} : { response_format: responseFormat(opts) }),
    });

    lastOutput = res.choices?.[0]?.message?.content ?? "";

    try {
      const value = extractJson(lastOutput);
      const err = opts.validate?.(value);
      if (err) throw new Error(err);
      return value as T;
    } catch (e) {
      lastError = (e as Error).message;
      // Feed the bad output back and ask for a correction.
      messages.push({ role: "assistant", content: lastOutput });
      messages.push({
        role: "user",
        content: `That was not valid (${lastError}). Reply again with ONLY the corrected JSON value, no prose or code fences.`,
      });
    }
  }

  throw new StructuredOutputError(
    `Failed to get valid JSON after ${maxRepairs + 1} attempts (last error: ${lastError})`,
    lastOutput,
    maxRepairs + 1
  );
}

export interface ToolsOptions {
  model?: string;
  system?: string;
  keys?: Record<string, string>;
  temperature?: number;
  maxTokens?: number;
  fetchImpl?: typeof fetch;
  /** Force a specific tool, any tool, or none. Default "auto". */
  toolChoice?: "auto" | "none" | "required" | { type: "function"; function: { name: string } };
}

export interface ToolResult {
  /** Assistant text, if any (may be empty when the model only calls tools). */
  content: string;
  /** Parsed tool calls with arguments already JSON-decoded where possible. */
  toolCalls: Array<{ id: string; name: string; arguments: unknown; raw: ToolCall }>;
}

/**
 * Run a single turn with tools available. Returns the assistant text plus any
 * tool calls the model emitted (arguments parsed from their JSON strings).
 * Executing the tools and looping is left to the caller.
 */
export async function callWithTools(
  prompt: string,
  tools: Tool[],
  opts: ToolsOptions = {}
): Promise<ToolResult> {
  const ai = new OmniRouter({ keys: opts.keys, fetchImpl: opts.fetchImpl });

  const messages: ChatMessage[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: prompt });

  const res = await ai.chat({
    model: opts.model ?? DEFAULT_MODEL,
    messages,
    temperature: opts.temperature,
    max_tokens: opts.maxTokens,
    tools,
    tool_choice: opts.toolChoice ?? "auto",
  });

  const msg = res.choices?.[0]?.message;
  const toolCalls = (msg?.tool_calls ?? []).map((tc) => {
    let args: unknown = tc.function.arguments;
    try {
      args = JSON.parse(tc.function.arguments);
    } catch {
      // Leave as the raw string if it isn't valid JSON.
    }
    return { id: tc.id, name: tc.function.name, arguments: args, raw: tc };
  });

  return { content: msg?.content ?? "", toolCalls };
}
