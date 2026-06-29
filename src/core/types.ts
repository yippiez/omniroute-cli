/**
 * Core types for OmniRouter.
 *
 * Everything here is provider-agnostic and OpenAI-Chat-Completions shaped, so a
 * coding agent can treat the whole library as a single OpenAI-compatible
 * provider. There is no routing, fallback, circuit-breaker or DB layer — each
 * provider is a flat declaration of "how to reach this upstream", and the thin
 * client (`client.ts`) does the actual HTTP call.
 */

export type Role = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: Role;
  content: string | null;
  name?: string;
  tool_call_id?: string;
  /** Assistant tool-call requests (OpenAI shape), present on assistant turns. */
  tool_calls?: ToolCall[];
  [extra: string]: unknown;
}

/** An OpenAI-style function tool the model may call. */
export interface Tool {
  type: "function";
  function: {
    name: string;
    description?: string;
    /** JSON Schema for the function arguments. */
    parameters?: Record<string, unknown>;
  };
}

/** A tool call emitted by the model. */
export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    /** Raw JSON string of arguments, as returned by the model. */
    arguments: string;
  };
}

/**
 * OpenAI-style structured-output request. `json_object` asks for "any valid
 * JSON"; `json_schema` constrains it to a schema (when the provider supports it).
 */
export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | {
      type: "json_schema";
      json_schema: { name: string; schema: Record<string, unknown>; strict?: boolean };
    };

/** OpenAI-compatible chat request parameters. `model` is filled in by the client. */
export interface ChatParams {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stop?: string | string[];
  stream?: boolean;
  tools?: Tool[];
  tool_choice?: "auto" | "none" | "required" | { type: "function"; function: { name: string } };
  response_format?: ResponseFormat;
  /** Any extra OpenAI-style field is passed through untouched. */
  [extra: string]: unknown;
}

export interface ModelDef {
  /** Upstream model id, sent verbatim as the request `model`. */
  id: string;
  /** Human-friendly label. */
  name: string;
}

export interface ProviderDef {
  /** Stable provider id, e.g. "pollinations". */
  id: string;
  /** Short alias, e.g. "pol". */
  alias?: string;
  /** Human label. */
  label: string;
  /** OpenAI-compatible `/chat/completions` endpoint. */
  baseUrl: string;
  /**
   * Auth requirement:
   *  - "none":     truly keyless, no signup (works with zero config).
   *  - "optional": works keyless, accepts an optional bearer token for higher limits.
   */
  auth: "none" | "optional";
  /** Free models this provider serves. */
  models: ModelDef[];
  /**
   * Provider accepts model ids beyond the listed ones (the catalog is a sample).
   * When true, `resolveModel` still works for unlisted ids if addressed as
   * `providerId/modelId`.
   */
  passthrough?: boolean;
  /** Extra static headers merged into every request. */
  extraHeaders?: Record<string, string>;
  /** Last-chance hook to tweak the request body before it is sent. */
  transformBody?: (body: Record<string, unknown>) => Record<string, unknown>;
}

/** Minimal OpenAI ChatCompletion shape (non-streaming). */
export interface ChatCompletion {
  id?: string;
  model?: string;
  choices: Array<{
    index: number;
    message: { role: Role; content: string | null; tool_calls?: ToolCall[] };
    finish_reason: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  [extra: string]: unknown;
}

/** Minimal OpenAI streaming chunk shape. */
export interface ChatChunk {
  id?: string;
  model?: string;
  choices: Array<{
    index: number;
    delta: { role?: Role; content?: string };
    finish_reason: string | null;
  }>;
  [extra: string]: unknown;
}
