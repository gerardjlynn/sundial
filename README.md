# Sundial

Agent-first authoring surface for web UI, in TypeScript.

## Milestone 1 — `sundial check --json` (pillar 1)

A standalone, framework-agnostic CLI that runs the TypeScript toolchain and emits
a stable JSON **diagnostic envelope**. The envelope is the product surface: its
shape is treated as API and versioned independently of the tool
(`schema/envelope-0.1.schema.json`).

What it does today:

- Wraps the TS language service and emits all syntactic, semantic, and suggestion
  diagnostics in the envelope, `source: "ts"`, native codes preserved (`TS2322`).
- Surfaces TS code fixes as `repairs[]` with `safety` ratings (mechanical =
  `safe`, else `review`) lowered to text edits.
- Ships three capability/effect rules (`SND0001` net, `SND0002` storage,
  `SND0003` DOM-outside-subtree) — **detection only, opt-in behind `--rules`**,
  because the capability-annotation syntax is pillar-2 design and a finding can't
  be made dismissible until it exists.
- Deterministic diagnostic ordering (file → span start → code) so runs diff cleanly.

### Usage

```
sundial check <files...> [options]
sundial check -p tsconfig.json [options]

  -p, --project <tsconfig>   Check a project by tsconfig.json.
  --rules[=CODES]            Enable SND rules (opt-in), optionally a subset
                             e.g. --rules=SND0001,SND0002
  --pretty                   Pretty-print the JSON.
```

Exit codes: `0` no errors, `1` errors present, `2` usage/tool error.

### Develop

```
npm install
npm run check    # typecheck
npm test         # vitest
npm run build    # emit dist/
```

Requires Node 20+ (LTS).

## Layout

```
schema/   envelope-0.1.schema.json — the frozen API shape
src/
  envelope.ts    types + ordering/summary (mirrors the schema)
  checker.ts     TS language-service host over a file set / tsconfig
  code-fixes.ts  getCodeFixesAtPosition → repairs with safety ratings
  check.ts       orchestrator → Envelope
  cli.ts         `sundial check`
  rules/         SND rule engine + effect scanner (SND0001–0003)
test/            vitest + fixtures + envelope snapshot
```

## Not yet built (by design)

- **Milestone 2** (graph store + patch ops) — waits on human reaction to the
  graph-schema talk thread.
- **Substrate / projector** — blocked; Solid-reference / React-compat is proposed,
  not decided. Do not build substrate-flavored code.

## License

MIT.
