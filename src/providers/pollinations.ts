import type { ProviderDef } from "../core/types.ts";

/**
 * Pollinations — keyless, anonymous OpenAI-compatible gateway.
 *
 * The legacy text.pollinations.ai host was retired; the current gateway is
 * gen.pollinations.ai/v1. Premium models (claude, gemini-pro, midijourney)
 * now require a key, so only the genuinely free keyless text models are listed.
 *
 * Get an optional key (higher limits) at https://enter.pollinations.ai
 */
export const pollinations: ProviderDef = {
  id: "pollinations",
  alias: "pol",
  label: "Pollinations",
  baseUrl: "https://gen.pollinations.ai/v1/chat/completions",
  auth: "optional",
  // Pollinations likes an explicit jsonMode flag; harmless for plain chat.
  transformBody: (body) => ({ ...body, jsonMode: true }),
  models: [
    { id: "openai", name: "OpenAI (Pollinations)" },
    { id: "openai-fast", name: "OpenAI Fast (Pollinations)" },
    { id: "openai-large", name: "OpenAI Large (Pollinations)" },
    { id: "qwen-coder", name: "Qwen Coder (Pollinations)" },
    { id: "mistral", name: "Mistral (Pollinations)" },
    { id: "deepseek", name: "DeepSeek (Pollinations)" },
    { id: "grok", name: "Grok (Pollinations)" },
    { id: "gemini-flash-lite-3.1", name: "Gemini Flash Lite 3.1 (Pollinations)" },
    { id: "gemini-fast", name: "Gemini Fast (Pollinations)" },
    { id: "perplexity-fast", name: "Perplexity Fast (Pollinations)" },
    { id: "perplexity-reasoning", name: "Perplexity Reasoning (Pollinations)" },
  ],
};
