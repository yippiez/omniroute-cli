/**
 * Registry — flat lookup over the keyless providers.
 *
 * This is the only "routing" in the library, and it is deliberately trivial:
 * map a model id to the provider(s) that serve it. There is no combo strategy,
 * weighting, circuit-breaker or cooldown (those lived in OmniRoute's separate
 * services layer and were intentionally dropped).
 */
import type { ProviderDef } from "./types.ts";
import { PROVIDERS } from "../providers/index.ts";

export { PROVIDERS };

export interface ModelEntry {
  /** Fully-qualified id: `provider/model`. */
  id: string;
  /** Bare upstream model id. */
  model: string;
  name: string;
  provider: string;
}

const byId = new Map<string, ProviderDef>();
for (const p of PROVIDERS) {
  byId.set(p.id, p);
  if (p.alias) byId.set(p.alias, p);
}

export function listProviders(): ProviderDef[] {
  return PROVIDERS;
}

export function getProvider(idOrAlias: string): ProviderDef | undefined {
  return byId.get(idOrAlias);
}

/** The virtual model ids that auto-route across providers. */
export const AUTO = "auto";
export const AUTO_CODING = "auto/coding";

/**
 * Ordered preference chains for the virtual `auto` models. `chat({ model })`
 * tries each target in order and returns the first that responds.
 *  - "auto":        fast general keyless models first, optional-token last.
 *  - "auto/coding": code-tuned models first (Qwen-Coder, DeepSeek-Coder, Codestral).
 * Edit these lists to change auto-routing priority.
 */
export const AUTO_CHAINS: Record<string, string[]> = {
  // uncloseai leads both chains: it is the only currently keyless provider, so
  // `auto` works with zero config. The others now require an optional token
  // (pass one with `--key provider=TOKEN`) and act as fall-throughs.
  [AUTO]: [
    "uncloseai/adamo1139/Hermes-3-Llama-3.1-8B-FP8-Dynamic",
    "pollinations/openai-fast",
    "pollinations/openai",
    "hackclub/meta-llama/llama-3.3-70b-instruct",
    "puter/gpt-4o-mini",
  ],
  [AUTO_CODING]: [
    "uncloseai/qwen3.6:27b",
    "pollinations/qwen-coder",
    "hackclub/deepseek-ai/deepseek-coder-33b",
    "puter/codestral-2508",
    "pollinations/deepseek",
  ],
};

/** Back-compat alias for the general chain. */
export const AUTO_CHAIN = AUTO_CHAINS[AUTO];

/** Expand an `auto` chain into concrete provider+model targets, in order. */
export function autoTargets(variant: string = AUTO): ResolvedModel[] {
  const chain = AUTO_CHAINS[variant] ?? [];
  const out: ResolvedModel[] = [];
  const seen = new Set<string>();
  for (const id of chain) {
    for (const t of resolveModel(id)) {
      const key = `${t.provider.id}/${t.model}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(t);
      }
    }
  }
  return out;
}

export function listModels(): ModelEntry[] {
  const out: ModelEntry[] = [
    { id: AUTO, model: AUTO, name: "Auto — best available free model (with fallback)", provider: AUTO },
    { id: AUTO_CODING, model: AUTO_CODING, name: "Auto (coding) — best available code model (with fallback)", provider: AUTO },
  ];
  for (const p of PROVIDERS) {
    for (const m of p.models) {
      out.push({ id: `${p.id}/${m.id}`, model: m.id, name: m.name, provider: p.id });
    }
  }
  return out;
}

export interface ResolvedModel {
  provider: ProviderDef;
  model: string;
}

/**
 * Resolve a model string to a provider + bare model id. Accepts:
 *   - "auto" / "auto/coding"  (virtual; expand to an AUTO_CHAINS list, in order)
 *   - "provider/model"        (explicit; also works for passthrough/unlisted models)
 *   - "alias/model"           (provider alias)
 *   - "model"                 (bare; first provider that lists it wins)
 *
 * Returns every match so callers can fail over across providers that serve the
 * same model id.
 */
export function resolveModel(modelStr: string): ResolvedModel[] {
  if (!modelStr) return [];
  if (modelStr in AUTO_CHAINS) return autoTargets(modelStr);

  const slash = modelStr.indexOf("/");
  if (slash !== -1) {
    const prefix = modelStr.slice(0, slash);
    const rest = modelStr.slice(slash + 1);
    const provider = byId.get(prefix);
    if (provider) {
      // Explicit provider prefix — honour it even for passthrough/unlisted ids.
      const known = provider.models.some((m) => m.id === rest);
      if (known || provider.passthrough) {
        return [{ provider, model: rest }];
      }
    }
  }

  // Bare model id — collect every provider that lists it.
  const matches: ResolvedModel[] = [];
  for (const provider of PROVIDERS) {
    if (provider.models.some((m) => m.id === modelStr)) {
      matches.push({ provider, model: modelStr });
    }
  }
  return matches;
}
