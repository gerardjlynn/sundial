/**
 * Sundial diagnostic envelope — v0.1 types.
 *
 * These types mirror `schema/envelope-0.1.schema.json` one-to-one. The envelope
 * is the product surface (pillar 1): its shape is treated as API, versioned
 * independently of the tool. Spec of record: vault talk/diagnostic-envelope.md.
 */

export const ENVELOPE_VERSION = "0.1" as const;

export type Mode = "text" | "graph";
export type Source = "ts" | "sundial";
export type Severity = "error" | "warning" | "suggestion";
export type Safety = "safe" | "review" | "unsafe";

/** [start, end] UTF-16 character offsets into a file, half-open. */
export type Range = readonly [number, number];

export interface Span {
  /** Repo-relative POSIX path. On graph-canonical projects, addresses the projection. */
  file: string;
  range: Range;
  /** Hash of the addressed file's content at run time (staleness guard). */
  contentHash: string;
}

/** Semantic address into the graph. Absent in text mode. */
export interface Target {
  kind: string;
  node: string;
  nodeHash: string;
}

export interface TextEdit {
  file: string;
  /** [start, end] half-open; an insertion has start === end. */
  range: Range;
  newText: string;
}

/**
 * A checker-suggested patch. Repairs share the pillar-3 patch vocabulary.
 * In text mode a repair lowers to `edits`; the semantic `op` is reserved for
 * when the patch API lands.
 */
export interface Repair {
  id: string;
  safety: Safety;
  description: string;
  /** Reserved: the semantic patch op, once the pillar-3 vocabulary exists. */
  op?: Record<string, unknown>;
  edits: TextEdit[];
}

export interface Diagnostic {
  /** TS diagnostics keep their native code (TS2322); SND rules are SND-namespaced. */
  code: string;
  source: Source;
  severity: Severity;
  /** Advisory prose. Nothing agent-relevant lives only here; see `facts`. */
  message: string;
  span: Span;
  target?: Target;
  /** Structured expected/observed data — the authoritative machine surface. */
  facts?: Record<string, unknown>;
  repairs?: Repair[];
  /** Stable rule URI (e.g. sundial://rules/SND0001). */
  docs: string;
}

export interface Summary {
  errors: number;
  warnings: number;
  suggestions: number;
  /** Diagnostic count keyed by source. */
  bySource: Record<string, number>;
}

export interface Run {
  /** ISO-8601 timestamp; excluded from determinism guarantees. */
  at: string;
  mode: Mode;
}

export interface Envelope {
  sundial: typeof ENVELOPE_VERSION;
  run: Run;
  diagnostics: Diagnostic[];
  summary: Summary;
}

/** Stable rule-doc URI for a code, resolved by the skills doc. */
export function docsUri(code: string): string {
  return `sundial://rules/${code}`;
}

/**
 * Deterministic diagnostic ordering: by file, then span start, then code.
 * Runs must diff cleanly, so ordering is part of the contract.
 */
export function compareDiagnostics(a: Diagnostic, b: Diagnostic): number {
  if (a.span.file !== b.span.file) return a.span.file < b.span.file ? -1 : 1;
  if (a.span.range[0] !== b.span.range[0]) return a.span.range[0] - b.span.range[0];
  if (a.code !== b.code) return a.code < b.code ? -1 : 1;
  return 0;
}

/** Compute the summary counts from an ordered diagnostic list. */
export function summarize(diagnostics: Diagnostic[]): Summary {
  const summary: Summary = { errors: 0, warnings: 0, suggestions: 0, bySource: {} };
  for (const d of diagnostics) {
    if (d.severity === "error") summary.errors++;
    else if (d.severity === "warning") summary.warnings++;
    else summary.suggestions++;
    summary.bySource[d.source] = (summary.bySource[d.source] ?? 0) + 1;
  }
  return summary;
}
