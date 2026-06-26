import type { ProviderDef } from "../core/types.ts";

/**
 * Puter AI — OpenAI-compatible gateway exposing 500+ models (GPT, Claude,
 * Gemini, Grok, DeepSeek, Qwen, Mistral, Llama…) behind one endpoint.
 *
 * No account signup is strictly required, but anonymous use is rate-limited;
 * an optional bearer token (puter.com/dashboard → "Copy Auth Token") lifts the
 * limits. Hence `auth: "optional"`.
 *
 * Model ids use a `provider/model` prefix for non-OpenAI models (e.g.
 * `google/gemini-3-flash`, `deepseek/deepseek-v4-flash`, `x-ai/grok-4.3`),
 * and bare ids for OpenAI/Claude/Llama/Mistral. `passthrough` is on because the
 * full catalog is far larger than this curated sample.
 *
 * Docs: https://docs.puter.com/AI/
 */
export const puter: ProviderDef = {
  id: "puter",
  alias: "pu",
  label: "Puter AI",
  baseUrl: "https://api.puter.com/puterai/openai/v1/chat/completions",
  auth: "optional",
  passthrough: true,
  models: [
    { id: "gpt-5.4-mini", name: "GPT-5.4 Mini (Puter)" },
    { id: "gpt-4o-mini", name: "GPT-4o Mini (Puter)" },
    { id: "gpt-4o", name: "GPT-4o (Puter)" },
    { id: "claude-haiku-4-5", name: "Claude Haiku 4.5 (Puter)" },
    { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6 (Puter)" },
    { id: "google/gemini-3-flash", name: "Gemini 3 Flash (Puter)" },
    { id: "google/gemini-3.5-flash", name: "Gemini 3.5 Flash (Puter)" },
    { id: "deepseek/deepseek-v4-flash", name: "DeepSeek V4 Flash (Puter)" },
    { id: "x-ai/grok-4.3", name: "Grok 4.3 (Puter)" },
    { id: "llama-4-scout", name: "Llama 4 Scout (Puter)" },
    { id: "llama-3.3-70b-instruct", name: "Llama 3.3 70B (Puter)" },
    { id: "mistral-small-2603", name: "Mistral Small 4 (Puter)" },
    { id: "codestral-2508", name: "Codestral (Puter)" },
    { id: "qwen/qwen3.6-plus", name: "Qwen 3.6 Plus (Puter)" },
  ],
};
