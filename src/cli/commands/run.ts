/**
 * `omnirouter [prompt]` — the default command: text in, text (or JSON) out.
 */
import { readFileSync } from "node:fs";
import { OmniRouter } from "../../core/omnirouter.ts";
import { structured } from "../../api/structured.ts";
import { DEFAULT_MODEL } from "../../api/ask.ts";
import type { ChatMessage } from "../../core/types.ts";

export interface RunArgs {
  model: string;
  system?: string;
  keys: Record<string, string>;
  stream: boolean;
  json: boolean;
  schemaPath?: string;
  prompt: string;
}

/** Parse argv for the run command. Returns parsed args or `null` to show help. */
export function parseRunArgs(argv: string[]): RunArgs {
  const a: RunArgs = { model: DEFAULT_MODEL, keys: {}, stream: true, json: false, prompt: "" };
  const words: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "-m":
      case "--model":
        a.model = argv[++i] ?? a.model;
        break;
      case "-s":
      case "--system":
        a.system = argv[++i];
        break;
      case "--key": {
        const [prov, token] = (argv[++i] ?? "").split("=");
        if (prov && token) a.keys[prov] = token;
        break;
      }
      case "--json":
        a.json = true;
        break;
      case "--schema":
        a.schemaPath = argv[++i];
        a.json = true;
        break;
      case "--no-stream":
        a.stream = false;
        break;
      default:
        words.push(arg);
    }
  }
  a.prompt = words.join(" ");
  return a;
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data.trim();
}

export async function runCommand(args: RunArgs): Promise<number> {
  const prompt = args.prompt || (await readStdin());
  if (!prompt) return 1; // caller prints help

  // Structured JSON path — never streams; uses the repair loop.
  if (args.json) {
    const schema = args.schemaPath
      ? (JSON.parse(readFileSync(args.schemaPath, "utf8")) as Record<string, unknown>)
      : undefined;
    const value = await structured(prompt, {
      model: args.model,
      system: args.system,
      keys: args.keys,
      schema,
    });
    console.log(JSON.stringify(value, null, 2));
    return 0;
  }

  // Plain text path.
  const ai = new OmniRouter({ keys: args.keys });
  const messages: ChatMessage[] = [];
  if (args.system) messages.push({ role: "system", content: args.system });
  messages.push({ role: "user", content: prompt });

  if (args.stream) {
    for await (const chunk of ai.stream({ model: args.model, messages })) {
      process.stdout.write(chunk.choices?.[0]?.delta?.content ?? "");
    }
    process.stdout.write("\n");
  } else {
    const res = await ai.chat({ model: args.model, messages });
    console.log(res.choices?.[0]?.message?.content ?? "");
  }
  return 0;
}
