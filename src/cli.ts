#!/usr/bin/env node
import * as path from "node:path";
import { check } from "./check.js";
import type { Envelope } from "./envelope.js";

const HELP = `sundial — agent-first authoring surface (Milestone 1: pillar 1)

Usage:
  sundial check [files...] [options]

Options:
  -p, --project <tsconfig>   Check the project described by a tsconfig.json.
  --rules[=CODES]            Enable SND framework rules (opt-in). Optionally a
                             comma-separated subset, e.g. --rules=SND0001,SND0002.
  --json                     Emit the diagnostic envelope as JSON (default).
  --pretty                   Pretty-print the JSON envelope.
  -h, --help                 Show this help.

Exit codes: 0 = no errors, 1 = errors present, 2 = usage/tool error.
The envelope schema is the product surface; see schema/envelope-0.1.schema.json.`;

interface Args {
  files: string[];
  project?: string;
  rules: boolean | string[];
  pretty: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { files: [], rules: false, pretty: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(HELP + "\n");
      process.exit(0);
    } else if (arg === "--project" || arg === "-p") {
      const next = argv[++i];
      if (!next) fail("--project requires a path");
      args.project = path.resolve(next!);
    } else if (arg.startsWith("--project=")) {
      args.project = path.resolve(arg.slice("--project=".length));
    } else if (arg === "--rules") {
      args.rules = true;
    } else if (arg.startsWith("--rules=")) {
      args.rules = arg
        .slice("--rules=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg === "--json") {
      // JSON is the only output form in v0.1; accepted for forward-compat.
    } else if (arg === "--pretty") {
      args.pretty = true;
    } else if (arg.startsWith("-")) {
      fail(`Unknown option: ${arg}`);
    } else {
      args.files.push(path.resolve(arg));
    }
  }
  return args;
}

function fail(message: string): never {
  process.stderr.write(`sundial: ${message}\n`);
  process.exit(2);
}

function main(): void {
  const [subcommand, ...rest] = process.argv.slice(2);
  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    process.stdout.write(HELP + "\n");
    process.exit(subcommand ? 0 : 2);
  }
  if (subcommand !== "check") fail(`Unknown command: ${subcommand}`);

  const args = parseArgs(rest);
  if (!args.project && args.files.length === 0) {
    fail("nothing to check — pass files or --project <tsconfig.json>");
  }

  let envelope: Envelope;
  try {
    envelope = check({
      ...(args.project !== undefined ? { tsconfigPath: args.project } : {}),
      ...(args.files.length > 0 ? { files: args.files } : {}),
      rules: args.rules,
    });
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  process.stdout.write(JSON.stringify(envelope, null, args.pretty ? 2 : 0) + "\n");
  process.exit(envelope.summary.errors > 0 ? 1 : 0);
}

main();
