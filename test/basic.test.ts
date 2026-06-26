/**
 * Basic usage tests — CLI argument parsing, the default `run` command, and the
 * no-network `--list` / `--help` paths via the real CLI binary.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { parseRunArgs, runCommand } from "../src/cli/commands/run.ts";
import { parseServeArgs } from "../src/cli/commands/serve.ts";

const CLI = fileURLToPath(new URL("../src/cli/main.ts", import.meta.url));

function jsonResponse(content: string): Response {
  return new Response(
    JSON.stringify({
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

/** Swap globalThis.fetch for the duration of `fn`, then restore it. */
async function withFetch(stub: typeof fetch, fn: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    await fn();
  } finally {
    globalThis.fetch = original;
  }
}

/** Capture console.log output produced while `fn` runs. */
async function captureLog(fn: () => Promise<void>): Promise<string> {
  const original = console.log;
  let out = "";
  console.log = (...args: unknown[]) => {
    out += args.join(" ") + "\n";
  };
  try {
    await fn();
  } finally {
    console.log = original;
  }
  return out;
}

test("parseRunArgs: defaults", () => {
  const a = parseRunArgs(["hello", "world"]);
  assert.equal(a.model, "auto");
  assert.equal(a.prompt, "hello world");
  assert.equal(a.stream, true);
  assert.equal(a.json, false);
});

test("parseRunArgs: flags", () => {
  const a = parseRunArgs([
    "-m", "puter/gpt-4o-mini",
    "-s", "be terse",
    "--no-stream",
    "--key", "puter=tok",
    "explain", "monads",
  ]);
  assert.equal(a.model, "puter/gpt-4o-mini");
  assert.equal(a.system, "be terse");
  assert.equal(a.stream, false);
  assert.deepEqual(a.keys, { puter: "tok" });
  assert.equal(a.prompt, "explain monads");
});

test("parseRunArgs: --json and --schema (schema implies json)", () => {
  assert.equal(parseRunArgs(["--json", "hi"]).json, true);
  const a = parseRunArgs(["--schema", "person.json", "make a person"]);
  assert.equal(a.json, true);
  assert.equal(a.schemaPath, "person.json");
  assert.equal(a.prompt, "make a person");
});

test("parseServeArgs: defaults and overrides", () => {
  assert.deepEqual(parseServeArgs([]), { port: 8080, host: "127.0.0.1", keys: {} });
  const a = parseServeArgs(["--port", "9000", "--host", "0.0.0.0", "--key", "puter=tok"]);
  assert.equal(a.port, 9000);
  assert.equal(a.host, "0.0.0.0");
  assert.deepEqual(a.keys, { puter: "tok" });
});

test("runCommand: text output (no-stream) prints the reply", async () => {
  await withFetch((async () => jsonResponse("a haiku")) as typeof fetch, async () => {
    const out = await captureLog(async () => {
      const code = await runCommand({ model: "pollinations/openai", keys: {}, stream: false, json: false, prompt: "hi" });
      assert.equal(code, 0);
    });
    assert.equal(out.trim(), "a haiku");
  });
});

test("runCommand: --json prints pretty-printed parsed JSON", async () => {
  await withFetch((async () => jsonResponse('{"colors":["red","green","blue"]}')) as typeof fetch, async () => {
    const out = await captureLog(async () => {
      const code = await runCommand({ model: "pollinations/openai", keys: {}, stream: false, json: true, prompt: "colors" });
      assert.equal(code, 0);
    });
    assert.deepEqual(JSON.parse(out), { colors: ["red", "green", "blue"] });
  });
});

test("runCommand: empty prompt returns exit code 1", async () => {
  // Force the TTY path so readStdin returns "" immediately instead of blocking.
  const original = process.stdin.isTTY;
  Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
  try {
    const code = await runCommand({ model: "auto", keys: {}, stream: false, json: false, prompt: "" });
    assert.equal(code, 1);
  } finally {
    Object.defineProperty(process.stdin, "isTTY", { value: original, configurable: true });
  }
});

test("CLI --list prints provider/model entries (no network)", () => {
  const out = execFileSync("node", ["--import", "tsx/esm", CLI, "--list"], { encoding: "utf8" });
  assert.match(out, /^auto\b/m);
  assert.match(out, /^auto\/coding\b/m);
  assert.match(out, /pollinations\/openai/);
  assert.match(out, /puter\//);
});

test("CLI --help prints usage including serve (no network)", () => {
  const out = execFileSync("node", ["--import", "tsx/esm", CLI, "--help"], { encoding: "utf8" });
  assert.match(out, /omnirouter/);
  assert.match(out, /serve/);
  assert.match(out, /--json/);
});
