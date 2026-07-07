import ts from "typescript";
import type { Checker } from "./checker.js";
import type { Repair, Safety, TextEdit } from "./envelope.js";
import { relPosix } from "./paths.js";

/**
 * Safety ratings for TS code fixes (vault: start conservative — mechanical
 * fixes = safe, everything else = review). Keyed by `fixName`, the stable
 * identifier the language service attaches to each fix. The allowlist is
 * intentionally small; anything not listed defaults to `review`. Grow it only
 * with evidence that a fix is meaning-preserving.
 */
const SAFE_FIX_NAMES = new Set<string>([
  "import", // add a missing import — insertion only
  "fixMissingImport",
  "unusedIdentifier", // delete provably unused code
  "fixMissingFunctionDeclaration",
  "spelling", // rename to an in-scope near-match the checker proposes
]);

function safetyForFix(fixName: string): Safety {
  return SAFE_FIX_NAMES.has(fixName) ? "safe" : "review";
}

const FORMAT_OPTIONS: ts.FormatCodeSettings = {
  indentSize: 2,
  tabSize: 2,
  convertTabsToSpaces: true,
  newLineCharacter: "\n",
  insertSpaceAfterCommaDelimiter: true,
};

const PREFERENCES: ts.UserPreferences = {};

/**
 * Lower a language-service CodeFixAction into an envelope Repair. Text mode
 * emits the lowered `edits` form only; the semantic `op` is reserved until the
 * pillar-3 patch vocabulary lands (envelope open question (a), resolved this
 * way for v0.1 — see talk/diagnostic-envelope.md).
 */
function toRepair(cwd: string, fix: ts.CodeFixAction): Repair | undefined {
  const edits: TextEdit[] = [];
  for (const change of fix.changes) {
    for (const tc of change.textChanges) {
      edits.push({
        file: relPosix(cwd, change.fileName),
        range: [tc.span.start, tc.span.start + tc.span.length],
        newText: tc.newText,
      });
    }
  }
  if (edits.length === 0) return undefined;
  return {
    id: fix.fixName,
    safety: safetyForFix(fix.fixName),
    description: fix.description,
    edits,
  };
}

/** Repairs the TS language service offers for a diagnostic at [start, end). */
export function repairsForTsDiagnostic(
  checker: Checker,
  cwd: string,
  fileName: string,
  start: number,
  end: number,
  errorCode: number,
): Repair[] {
  let fixes: readonly ts.CodeFixAction[];
  try {
    fixes = checker.service.getCodeFixesAtPosition(
      fileName,
      start,
      end,
      [errorCode],
      FORMAT_OPTIONS,
      PREFERENCES,
    );
  } catch {
    // A fix provider may throw on edge-case positions; a missing repair is
    // never a reason to drop the diagnostic itself.
    return [];
  }
  const repairs: Repair[] = [];
  for (const fix of fixes) {
    const repair = toRepair(cwd, fix);
    if (repair) repairs.push(repair);
  }
  return repairs;
}
