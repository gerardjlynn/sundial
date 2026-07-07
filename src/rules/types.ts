import type ts from "typescript";
import type { Range, Repair, Severity } from "../envelope.js";

/** A rule finding, before the orchestrator attaches contentHash and docs. */
export interface RuleFinding {
  code: string;
  severity: Severity;
  message: string;
  /** Absolute file name. */
  fileName: string;
  range: Range;
  facts?: Record<string, unknown>;
  repairs?: Repair[];
}

export interface RuleContext {
  sourceFile: ts.SourceFile;
  /** Absolute file name. */
  fileName: string;
  push(finding: RuleFinding): void;
}

export interface Rule {
  /** SND-namespaced, zero-padded (SND0001). Append-only, meaning frozen. */
  code: string;
  /** One-line description for the skills doc / rule registry. */
  description: string;
  run(ctx: RuleContext): void;
}
