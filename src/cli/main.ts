#!/usr/bin/env node
/**
 * omnirouter CLI entry point — parses argv and dispatches to a subcommand.
 *
 *   omnirouter "your prompt"          # default: run
 *   omnirouter serve --port 8080      # local OpenAI-compatible server
 *   omnirouter --list                 # list models
 */
import { HELP } from "./help.ts";
import { listModels } from "../core/registry.ts";
import { parseRunArgs, runCommand } from "./commands/run.ts";
import { parseServeArgs, serveCommand } from "./commands/serve.ts";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  // Global flags that short-circuit before command dispatch.
  if (argv.includes("-h") || argv.includes("--help")) {
    console.log(HELP);
    return;
  }
  if (argv.includes("-l") || argv.includes("--list")) {
    for (const m of listModels()) console.log(`${m.id}\t${m.name}`);
    return;
  }

  const [command, ...rest] = argv;

  if (command === "serve") {
    const code = await serveCommand(parseServeArgs(rest));
    process.exit(code);
  }

  // Default command: run a prompt (the whole argv is the run args).
  const args = parseRunArgs(argv);
  const code = await runCommand(args);
  if (code !== 0) {
    console.error(HELP);
    process.exit(code);
  }
}

main().catch((err) => {
  console.error(`\nerror: ${(err as Error).message}`);
  process.exit(1);
});
