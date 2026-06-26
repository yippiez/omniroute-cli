import { DEFAULT_MODEL } from "../api/ask.ts";

export const HELP = `omnirouter — chat with free, keyless AI models

Usage:
  omnirouter [options] [prompt...]        run a prompt (default command)
  echo "prompt" | omnirouter [options]    read the prompt from stdin
  omnirouter serve [options]              start a local OpenAI-compatible server

Run options:
  -m, --model <id>     model id (default: ${DEFAULT_MODEL}); "auto", "auto/coding",
                       "provider/model", or a bare id
  -s, --system <text>  optional system prompt
      --key <p=token>  optional bearer token for provider p (repeatable)
      --json           force valid JSON output (uses a repair loop if needed)
      --schema <file>  path to a JSON Schema file; implies --json
      --no-stream      print the full reply at once instead of streaming
  -l, --list           list available models and exit
  -h, --help           show this help

Serve options:
  -p, --port <n>       port to listen on (default: 8080)
      --host <addr>    host/interface to bind (default: 127.0.0.1)
      --key <p=token>  optional bearer token for provider p (repeatable)

Examples:
  omnirouter "write a haiku about TypeScript"
  omnirouter -m auto/coding "refactor this function"
  omnirouter --json "list 3 primary colors as a JSON array of strings"
  omnirouter --schema person.schema.json "make up a person"
  cat bug.txt | omnirouter -s "You are a senior engineer" "diagnose this"
  omnirouter serve --port 8080      # then point any OpenAI client at it`;
