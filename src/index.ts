/**
 * OmniRouter — a tiny library that exposes a handful of free, keyless AI
 * providers as a single OpenAI-compatible client, with optional fail-over,
 * structured JSON output, and tool calling.
 *
 * @example
 * ```ts
 * import { OmniRouter, ask, structured } from "omnirouter-cli";
 *
 * const text = await ask("Write a haiku about TypeScript.");
 *
 * const ai = new OmniRouter();
 * const res = await ai.chat({ model: "auto", messages: [{ role: "user", content: "hi" }] });
 *
 * const data = await structured("List 3 primary colors as a JSON array of strings.");
 * ```
 */

// Core engine
export * from "./core/types.ts";
export {
  chatCompletion,
  chatStream,
  streamToText,
  ProviderHttpError,
} from "./core/client.ts";
export type { CallOptions } from "./core/client.ts";
export {
  listModels,
  listProviders,
  getProvider,
  resolveModel,
  AUTO,
  AUTO_CODING,
  AUTO_CHAIN,
  AUTO_CHAINS,
  PROVIDERS,
} from "./core/registry.ts";
export type { ModelEntry, ResolvedModel } from "./core/registry.ts";

// The main client
export { OmniRouter, omniRouter, NoProviderError } from "./core/omnirouter.ts";
export type { OmniRouterOptions, ChatRequest } from "./core/omnirouter.ts";

// Ergonomic APIs
export { ask, DEFAULT_MODEL } from "./api/ask.ts";
export type { AskOptions } from "./api/ask.ts";
export {
  structured,
  callWithTools,
  extractJson,
  StructuredOutputError,
} from "./api/structured.ts";
export type {
  StructuredOptions,
  ToolsOptions,
  ToolResult,
} from "./api/structured.ts";
