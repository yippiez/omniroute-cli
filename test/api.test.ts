/**
 * API usage tests — the library surface (OmniRouter, ask, structured,
 * callWithTools, routing). All network is mocked; no real requests.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  OmniRouter,
  ask,
  structured,
  callWithTools,
  extractJson,
  StructuredOutputError,
  listModels,
  resolveModel,
  PROVIDERS,
} from "../src/index.ts";

/** A fetch stub that returns one assistant message as a non-streaming completion. */
function completionFetch(content: string, capture?: (body: any) => void): typeof fetch {
  return (async (_url, init) => {
    capture?.(JSON.parse(String(init?.body)));
    return new Response(
      JSON.stringify({
        choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;
}

test("OmniRouter.chat posts an OpenAI-shaped body and returns the completion", async () => {
  let seen: any;
  const ai = new OmniRouter({ fetchImpl: completionFetch("pong", (b) => (seen = b)) });
  const res = await ai.chat({
    model: "pollinations/openai",
    messages: [{ role: "user", content: "ping" }],
  });
  assert.equal(res.choices[0].message.content, "pong");
  assert.equal(seen.model, "openai");
  assert.equal(seen.stream, false);
  assert.equal(seen.jsonMode, true); // pollinations transformBody
});

test("OmniRouter.complete concatenates streamed text", async () => {
  const sse =
    `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "He" }, finish_reason: null }] })}\n\n` +
    `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "llo" }, finish_reason: "stop" }] })}\n\n` +
    `data: [DONE]\n\n`;
  const fetchImpl = (async () =>
    new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } })) as typeof fetch;
  const ai = new OmniRouter({ fetchImpl });
  const text = await ai.complete({ model: "pollinations/openai", messages: [{ role: "user", content: "x" }] });
  assert.equal(text, "Hello");
});

test("ask() returns the reply as a plain string", async () => {
  const text = await ask("write a haiku", { fetchImpl: completionFetch("a haiku") });
  assert.equal(text, "a haiku");
});

test("listModels surfaces the virtual auto entries first, then provider/model", () => {
  const models = listModels();
  assert.equal(models[0].id, "auto");
  assert.equal(models[1].id, "auto/coding");
  const concrete = models.filter((m) => m.provider !== "auto");
  assert.ok(concrete.every((m) => m.id === `${m.provider}/${m.model}`));
});

test("resolveModel: explicit prefix, passthrough, and bare-id collection", () => {
  assert.equal(resolveModel("pollinations/openai")[0].provider.id, "pollinations");
  assert.equal(resolveModel("puter/some-unlisted-xyz")[0].provider.id, "puter"); // passthrough
  assert.ok(resolveModel("openai").some((m) => m.provider.id === "pollinations"));
});

test("every provider is keyless/optional and OpenAI-shaped", () => {
  for (const p of PROVIDERS) {
    assert.ok(p.baseUrl.startsWith("https://"), `${p.id} https baseUrl`);
    assert.ok(["none", "optional"].includes(p.auth), `${p.id} keyless`);
    assert.ok(p.models.length > 0, `${p.id} lists models`);
  }
});

test("structured() returns parsed JSON and sends a response_format", async () => {
  let seen: any;
  const json = JSON.stringify({ city: "Paris", temp: 21 });
  const out = await structured<{ city: string; temp: number }>("weather in Paris", {
    model: "pollinations/openai",
    fetchImpl: completionFetch(json, (b) => (seen = b)),
  });
  assert.deepEqual(out, { city: "Paris", temp: 21 });
  assert.equal(seen.response_format.type, "json_object");
});

test("structured() with a schema uses json_schema response_format", async () => {
  let seen: any;
  const schema = { type: "object", properties: { n: { type: "number" } }, required: ["n"] };
  await structured("give n", {
    model: "pollinations/openai",
    schema,
    fetchImpl: completionFetch(JSON.stringify({ n: 7 }), (b) => (seen = b)),
  });
  assert.equal(seen.response_format.type, "json_schema");
  assert.equal(seen.response_format.json_schema.name, "output");
  assert.deepEqual(seen.response_format.json_schema.schema, schema);
});

test("callWithTools parses tool_calls and decodes arguments", async () => {
  const fetchImpl = (async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "",
              tool_calls: [
                { id: "c1", type: "function", function: { name: "get_weather", arguments: '{"city":"Paris"}' } },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    )) as typeof fetch;

  const tools = [
    {
      type: "function" as const,
      function: {
        name: "get_weather",
        description: "Get weather",
        parameters: { type: "object", properties: { city: { type: "string" } } },
      },
    },
  ];
  const res = await callWithTools("weather in Paris?", tools, { model: "puter/gpt-4o", fetchImpl });
  assert.equal(res.toolCalls.length, 1);
  assert.equal(res.toolCalls[0].name, "get_weather");
  assert.deepEqual(res.toolCalls[0].arguments, { city: "Paris" });
});

test("extractJson tolerates code fences and surrounding prose", () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Here you go: {"a":2} hope that helps'), { a: 2 });
  assert.deepEqual(extractJson("[1, 2, 3]"), [1, 2, 3]);
});

test("StructuredOutputError is exported and shaped", () => {
  const e = new StructuredOutputError("nope", "raw", 4);
  assert.equal(e.name, "StructuredOutputError");
  assert.equal(e.lastOutput, "raw");
  assert.equal(e.attempts, 4);
});
