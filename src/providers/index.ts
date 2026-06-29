/**
 * Free, keyless / no-signup providers.
 *
 * One file per provider in this directory; add a new provider by dropping a
 * `providers/<id>.ts` that exports a `ProviderDef` and listing it here.
 */
import type { ProviderDef } from "../core/types.ts";
import { pollinations } from "./pollinations.ts";
import { hackclub } from "./hackclub.ts";
import { uncloseai } from "./uncloseai.ts";
import { puter } from "./puter.ts";

export const PROVIDERS: ProviderDef[] = [pollinations, hackclub, uncloseai, puter];

export { pollinations, hackclub, uncloseai, puter };
