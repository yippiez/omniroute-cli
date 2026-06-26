/**
 * `omnirouter serve` — a local OpenAI-compatible HTTP server.
 *
 * Point any OpenAI client (SDK, curl, an IDE extension) at
 * `http://host:port/v1` and it transparently uses OmniRouter's routing and
 * cross-provider fail-over. Endpoints:
 *
 *   POST /v1/chat/completions   (streaming and non-streaming)
 *   GET  /v1/models
 *   GET  /health
 */
import http from "node:http";
import { OmniRouter } from "../../core/omnirouter.ts";
import type { ChatRequest } from "../../core/omnirouter.ts";

export interface ServeArgs {
  port: number;
  host: string;
  keys: Record<string, string>;
}

export function parseServeArgs(argv: string[]): ServeArgs {
  const a: ServeArgs = { port: 8080, host: "127.0.0.1", keys: {} };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "-p":
      case "--port":
        a.port = Number(argv[++i]) || a.port;
        break;
      case "--host":
        a.host = argv[++i] ?? a.host;
        break;
      case "--key": {
        const [prov, token] = (argv[++i] ?? "").split("=");
        if (prov && token) a.keys[prov] = token;
        break;
      }
    }
  }
  return a;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(payload);
}

function errorBody(message: string, type = "invalid_request_error") {
  return { error: { message, type } };
}

/**
 * Build the HTTP server backed by an `OmniRouter`. Exposed separately from
 * `serveCommand` so tests can drive it without binding a long-lived port.
 */
export function createServer(ai: OmniRouter): http.Server {
  return http.createServer(async (req, res) => {
    try {
      const url = req.url ?? "/";

      if (req.method === "GET" && (url === "/health" || url === "/")) {
        return sendJson(res, 200, { status: "ok" });
      }

      if (req.method === "GET" && url.startsWith("/v1/models")) {
        const data = ai.listModels().map((m) => ({
          id: m.id,
          object: "model",
          owned_by: m.provider,
        }));
        return sendJson(res, 200, { object: "list", data });
      }

      if (req.method === "POST" && url.startsWith("/v1/chat/completions")) {
        let body: ChatRequest;
        try {
          body = JSON.parse(await readBody(req)) as ChatRequest;
        } catch {
          return sendJson(res, 400, errorBody("request body is not valid JSON"));
        }
        if (!Array.isArray(body.messages)) {
          return sendJson(res, 400, errorBody("`messages` array is required"));
        }

        if (body.stream) {
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });
          for await (const chunk of ai.stream(body)) {
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
          }
          res.write("data: [DONE]\n\n");
          return res.end();
        }

        const completion = await ai.chat(body);
        return sendJson(res, 200, completion);
      }

      return sendJson(res, 404, errorBody(`no route for ${req.method} ${url}`, "not_found"));
    } catch (err) {
      const message = (err as Error).message ?? "internal error";
      // Headers may already be sent on a streaming error; guard before writing.
      if (!res.headersSent) {
        return sendJson(res, 502, errorBody(message, "upstream_error"));
      }
      res.end();
    }
  });
}

export async function serveCommand(args: ServeArgs): Promise<number> {
  const ai = new OmniRouter({ keys: args.keys });
  const server = createServer(ai);

  await new Promise<void>((resolve) => server.listen(args.port, args.host, resolve));
  console.error(
    `omnirouter serving an OpenAI-compatible API at http://${args.host}:${args.port}/v1`
  );
  console.error("  POST /v1/chat/completions   GET /v1/models   GET /health");

  // Keep the process alive until interrupted.
  return new Promise<number>((resolve) => {
    const shutdown = () => {
      server.close(() => resolve(0));
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });
}
