# OmniRouter

A small CLI and TypeScript library that exposes a handful of **free, keyless AI
providers** as one **OpenAI-compatible** client — with cross-provider fail-over,
structured JSON output (native + repair loop), tool calling, and a local
OpenAI-compatible server.

> **Provider note:** the free-model landscape shifts. As of this writing only
> `uncloseai` is fully keyless, so `auto` leads with it and works with zero
> config. The other providers (`pollinations`, `hackclub`, `puter`) now accept an
> optional token — pass one with `--key provider=TOKEN`.

## Install / run

```bash
npm install
npm run omnirouter -- "write a haiku about TypeScript"   # dev (tsx)
npm run build && node dist/cli/main.js "..."             # built
```

## CLI

```text
omnirouter [options] [prompt...]        run a prompt (default command)
echo "prompt" | omnirouter [options]    read the prompt from stdin
omnirouter serve [options]              start a local OpenAI-compatible server
```

### `run` (default command)

```bash
omnirouter "explain monads"
omnirouter -m auto/coding "refactor this function"
omnirouter --json "list 3 primary colors as a JSON array of strings"
omnirouter --schema person.schema.json "make up a person"
cat bug.txt | omnirouter -s "You are a senior engineer" "diagnose this"
```

| Flag | Meaning |
|------|---------|
| `-m, --model <id>` | `auto`, `auto/coding`, `provider/model`, or a bare id (default `auto`) |
| `-s, --system <text>` | system prompt |
| `--json` | force valid JSON output (uses a repair loop if the model misbehaves) |
| `--schema <file>` | JSON Schema file to constrain output; implies `--json` |
| `--key <p=token>` | optional bearer token for provider `p` (repeatable) |
| `--no-stream` | print the whole reply at once |
| `-l, --list` | list available models |
| `-h, --help` | help |

### `serve`

Starts a local OpenAI-compatible HTTP server backed by OmniRouter routing and
fail-over. Point any OpenAI client at `http://host:port/v1`.

```bash
omnirouter serve --port 8080
curl http://127.0.0.1:8080/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"auto","messages":[{"role":"user","content":"hi"}]}'
```

Endpoints: `POST /v1/chat/completions` (streaming + non-streaming),
`GET /v1/models`, `GET /health`.

## Library

```ts
import { OmniRouter, ask, structured, callWithTools } from "omnirouter-cli";

// Just text:
const text = await ask("Write a haiku about TypeScript.");

// Full client with fail-over + streaming:
const ai = new OmniRouter();
const res = await ai.chat({ model: "auto", messages: [{ role: "user", content: "hi" }] });
for await (const chunk of ai.stream({ model: "auto", messages: [...] })) { /* ... */ }

// Structured JSON (native response_format, with a re-prompt repair loop fallback):
const colors = await structured<string[]>("3 primary colors as a JSON array of strings");
const person = await structured("make a person", {
  schema: { type: "object", properties: { name: { type: "string" }, age: { type: "number" } }, required: ["name", "age"] },
  validate: (v) => ((v as any).age >= 0 ? null : "age must be non-negative"),
});

// Tool calling:
const out = await callWithTools("weather in Paris?", [{
  type: "function",
  function: { name: "get_weather", parameters: { type: "object", properties: { city: { type: "string" } } } },
}]);
out.toolCalls; // [{ name: "get_weather", arguments: { city: "Paris" }, ... }]
```

## Project layout

```
src/
  index.ts            library barrel (public exports)
  core/               provider-agnostic engine
    types.ts          OpenAI-shaped types (chat, tools, response_format)
    client.ts         thin fetch-based OpenAI client + SSE streaming
    registry.ts       model -> provider routing, auto-chains, fail-over targets
    omnirouter.ts     OmniRouter class (chat / stream / complete)
  api/
    ask.ts            ask(prompt) -> string
    structured.ts     structured() JSON + repair loop, callWithTools()
  providers/          one ProviderDef per provider
  cli/
    main.ts           argv parsing + command dispatch
    help.ts           help text
    commands/
      run.ts          default prompt command (text or --json)
      serve.ts        local OpenAI-compatible HTTP server
test/
  basic.test.ts       CLI parsing, run command, --list / --help
  advanced.test.ts    structured repair loop, fail-over, serve server
  api.test.ts         library API (OmniRouter, ask, structured, tools)
```

## Develop

```bash
npm test         # run all tests (mocked network, no keys needed)
npm run typecheck
npm run build
```

## License

MIT
