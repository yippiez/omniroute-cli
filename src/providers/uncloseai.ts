import type { ProviderDef } from "../core/types.ts";

/**
 * UncloseAI (unturf Hermes) — free, keyless OpenAI-compatible endpoint.
 * No signup required. https://hermes.ai.unturf.com
 */
export const uncloseai: ProviderDef = {
  id: "uncloseai",
  alias: "unc",
  label: "UncloseAI",
  baseUrl: "https://hermes.ai.unturf.com/v1/chat/completions",
  auth: "none",
  models: [
    { id: "adamo1139/Hermes-3-Llama-3.1-8B-FP8-Dynamic", name: "Hermes 3 Llama 3.1 8B" },
    { id: "qwen3.6:27b", name: "Qwen3 Coder 27B" },
    { id: "gemma4:31b", name: "Gemma 4 31B" },
  ],
};
