/**
 * Advanced usage tests — the structured-output repair loop, cross-provider
 * fail-over, and the local OpenAI-compatible server. Network is mocked.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";

import { OmniRouter, structured, StructuredOutputError, PROVIDERS } from "../src/index.ts";
import { createServer } from "../src/cli/commands/serve.ts";

function jsonResponse(content: string): Response {
  return new Response(
    JSON.stringify({
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

test("structured() repairs invalid JSON by re-prompting", async () => {
  const replies = ["not json at all", "still {nope}", '{"ok":true}'];
  let i = 0;
  const fetchImpl = (async () => jsonResponse(replies[i++])) as typeof fetch;

  const out = await structured<{ ok: boolean }>("give json", {
    model: "pollinations/openai",
    fetchImpl,
  });
  assert.deepEqual(out, { ok: true });
  assert.equal(i, 3, "took two repairs then succeeded");
});

test("structured() throws StructuredOutputError after exhausting repairs", async () => {
  const fetchImpl = (async () => jsonResponse("never json")) as typeof fetch;
  await assert.rejects(
    () => structured("give json", { model: "pollinations/openai", maxRepairs: 2, fetchImpl }),
    (err: unknown) => {
      assert.ok(err instanceof StructuredOutputError);
      assert.equal(err.attempts, 3); // 1 initial + 2 repairs
      return true;
    }
  );
});

test("structured() validate() rejection triggers a repair", async () => {
  const replies = ['{"n":-1}', '{"n":5}'];
  let i = 0;
  const fetchImpl = (async () => jsonResponse(replies[i++])) as typeof fetch;
  const out = await structured<{ n: number }>("positive n", {
    model: "pollinations/openai",
    fetchImpl,
    validate: (v) => ((v as any).n > 0 ? null : "n must be positive"),
  });
  assert.deepEqual(out, { n: 5 });
  assert.equal(i, 2);
});

test("chat() fails over to the next provider serving the same bare id", async () => {
  PROVIDERS.push(
    { id: "fo-a", label: "A", baseUrl: "https://a.invalid/v1", auth: "none", models: [{ id: "fo", name: "fo" }] },
    { id: "fo-b", label: "B", baseUrl: "https://b.invalid/v1", auth: "none", models: [{ id: "fo", name: "fo" }] }
  );
  try {
    const fetchImpl = (async (url) =>
      String(url).includes("a.invalid") ? new Response("down", { status: 503 }) : jsonResponse("ok")) as typeof fetch;
    const ai = new OmniRouter({ fetchImpl });
    const res = await ai.chat({ model: "fo", messages: [{ role: "user", content: "x" }] });
    assert.equal(res.choices[0].message.content, "ok");
  } finally {
    PROVIDERS.splice(-2, 2);
  }
});

test("auto: chat falls over down the chain until one provider responds", async () => {
  let n = 0;
  const fetchImpl = (async () => {
    n += 1;
    return n < 3 ? new Response("down", { status: 503 }) : jsonResponse("third");
  }) as typeof fetch;
  const ai = new OmniRouter({ fetchImpl });
  const res = await ai.chat({ model: "auto", messages: [{ role: "user", content: "x" }] });
  assert.equal(res.choices[0].message.content, "third");
  assert.equal(n, 3);
});

// --- serve: local OpenAI-compatible server -------------------------------

async function withServer(ai: OmniRouter, fn: (base: string) => Promise<void>): Promise<void> {
  const server = createServer(ai);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

test("serve: GET /health returns ok", async () => {
  const ai = new OmniRouter({ fetchImpl: (async () => jsonResponse("")) as typeof fetch });
  await withServer(ai, async (base) => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: "ok" });
  });
});

test("serve: GET /v1/models lists models in OpenAI shape", async () => {
  const ai = new OmniRouter({ fetchImpl: (async () => jsonResponse("")) as typeof fetch });
  await withServer(ai, async (base) => {
    const res = await fetch(`${base}/v1/models`);
    const body = (await res.json()) as { object: string; data: Array<{ id: string; object: string }> };
    assert.equal(body.object, "list");
    assert.ok(body.data.some((m) => m.id === "auto"));
    assert.ok(body.data.every((m) => m.object === "model"));
  });
});

test("serve: POST /v1/chat/completions proxies to OmniRouter", async () => {
  const ai = new OmniRouter({ fetchImpl: (async () => jsonResponse("proxied")) as typeof fetch });
  await withServer(ai, async (base) => {
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "pollinations/openai", messages: [{ role: "user", content: "hi" }] }),
    });
    const body = (await res.json()) as any;
    assert.equal(body.choices[0].message.content, "proxied");
  });
});

test("serve: streaming request emits SSE frames ending in [DONE]", async () => {
  const sse =
    `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "hi" }, finish_reason: "stop" }] })}\n\n` +
    `data: [DONE]\n\n`;
  const upstream = (async () =>
    new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } })) as typeof fetch;
  const ai = new OmniRouter({ fetchImpl: upstream });
  await withServer(ai, async (base) => {
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "pollinations/openai", stream: true, messages: [{ role: "user", content: "hi" }] }),
    });
    const text = await res.text();
    assert.match(text, /data: /);
    assert.match(text, /\[DONE\]/);
  });
});

test("serve: bad JSON body returns a 400 error", async () => {
  const ai = new OmniRouter({ fetchImpl: (async () => jsonResponse("")) as typeof fetch });
  await withServer(ai, async (base) => {
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    assert.ok(body.error.message);
  });
});
