import type { ProviderDef } from "../core/types.ts";

/**
 * Hack Club AI — free, keyless OpenAI-compatible proxy for students/hackers.
 * No signup required. https://ai.hackclub.com
 */
export const hackclub: ProviderDef = {
  id: "hackclub",
  alias: "hc",
  label: "Hack Club AI",
  baseUrl: "https://ai.hackclub.com/proxy/v1/chat/completions",
  auth: "none",
  passthrough: true,
  models: [
    { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B" },
    { id: "mistralai/mistral-7b-instruct", name: "Mistral 7B" },
    { id: "deepseek-ai/deepseek-coder-33b", name: "DeepSeek Coder 33B" },
  ],
};
