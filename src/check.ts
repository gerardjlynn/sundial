import ts from "typescript";
import { createChecker, type Checker } from "./checker.js";
import { repairsForTsDiagnostic } from "./code-fixes.js";
import {
  ENVELOPE_VERSION,
  compareDiagnostics,
  docsUri,
  summarize,
  type Diagnostic,
  type Envelope,
  type Severity,
} from "./envelope.js";
import { contentHash } from "./hash.js";
import { relPosix } from "./paths.js";
import { selectRules, type Rule, type RuleFinding } from "./rules/index.js";

export interface CheckOptions {
  /** Repo root for relative span paths. Default: process.cwd(). */
  cwd?: string;
  /** Absolute path to a tsconfig.json. Takes precedence over `files`. */
  tsconfigPath?: string;
  /** Explicit files to check when no tsconfig is given. */
  files?: string[];
  /** Overlaid compiler options (ignored when tsconfigPath is set). */
  compilerOptions?: ts.CompilerOptions;
  /** SND rule selector. Off by default (the SND set is opt-in). */
  rules?: boolean | string[];
  /** Injectable clock for deterministic output. Default: real time. */
  now?: () => string;
}

function severityOf(category: ts.DiagnosticCategory): Severity {
  switch (category) {
    case ts.DiagnosticCategory.Error:
      return "error";
    case ts.DiagnosticCategory.Warning:
      return "warning";
    default:
      return "suggestion";
  }
}

/** Per-run cache of file content hashes. */
function hashCache(checker: Checker): (fileName: string) => string {
  const cache = new Map<string, string>();
  return (fileName) => {
    let h = cache.get(fileName);
    if (h === undefined) {
      h = contentHash(checker.getText(fileName));
      cache.set(fileName, h);
    }
    return h;
  };
}

function collectTsDiagnostics(
  checker: Checker,
  cwd: string,
  hashOf: (fileName: string) => string,
): Diagnostic[] {
  const { program, service, fileNames } = checker;
  const out: Diagnostic[] = [];
  const seen = new Set<string>();

  const emit = (d: ts.Diagnostic): void => {
    if (!d.file || d.start === undefined) return; // v0.1 skips file-less diagnostics
    const fileName = d.file.fileName;
    const start = d.start;
    const end = start + (d.length ?? 0);
    const code = `TS${d.code}`;
    const key = `${code}:${fileName}:${start}:${end}`;
    if (seen.has(key)) return;
    seen.add(key);

    out.push({
      code,
      source: "ts",
      severity: severityOf(d.category),
      message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
      span: {
        file: relPosix(cwd, fileName),
        range: [start, end],
        contentHash: hashOf(fileName),
      },
      repairs: repairsForTsDiagnostic(checker, cwd, fileName, start, end, d.code),
      docs: docsUri(code),
    });
  };

  for (const fileName of fileNames) {
    const sf = program.getSourceFile(fileName);
    if (!sf || sf.isDeclarationFile) continue;
    for (const d of program.getSyntacticDiagnostics(sf)) emit(d);
    for (const d of program.getSemanticDiagnostics(sf)) emit(d);
    for (const d of service.getSuggestionDiagnostics(fileName)) emit(d);
  }
  return out;
}

function findingToDiagnostic(
  finding: RuleFinding,
  cwd: string,
  hashOf: (fileName: string) => string,
): Diagnostic {
  const diag: Diagnostic = {
    code: finding.code,
    source: "sundial",
    severity: finding.severity,
    message: finding.message,
    span: {
      file: relPosix(cwd, finding.fileName),
      range: finding.range,
      contentHash: hashOf(finding.fileName),
    },
    docs: docsUri(finding.code),
  };
  if (finding.facts) diag.facts = finding.facts;
  if (finding.repairs && finding.repairs.length > 0) diag.repairs = finding.repairs;
  return diag;
}

function runRules(
  checker: Checker,
  rules: Rule[],
  cwd: string,
  hashOf: (fileName: string) => string,
): Diagnostic[] {
  if (rules.length === 0) return [];
  const out: Diagnostic[] = [];
  for (const fileName of checker.fileNames) {
    const sourceFile = checker.program.getSourceFile(fileName);
    if (!sourceFile || sourceFile.isDeclarationFile) continue;
    const findings: RuleFinding[] = [];
    const ctx = { sourceFile, fileName, push: (f: RuleFinding) => findings.push(f) };
    for (const rule of rules) rule.run(ctx);
    for (const f of findings) out.push(findingToDiagnostic(f, cwd, hashOf));
  }
  return out;
}

/**
 * Run `sundial check` over a compilation and produce the v0.1 envelope.
 * Text mode (pillar 1): `target` addressing is omitted; spans address files.
 */
export function check(options: CheckOptions = {}): Envelope {
  const cwd = options.cwd ?? process.cwd();
  const now = options.now ?? (() => new Date().toISOString());

  const checker = createChecker({
    ...(options.tsconfigPath !== undefined ? { tsconfigPath: options.tsconfigPath } : {}),
    ...(options.files !== undefined ? { files: options.files } : {}),
    ...(options.compilerOptions !== undefined ? { compilerOptions: options.compilerOptions } : {}),
  });
  const hashOf = hashCache(checker);

  const diagnostics = [
    ...collectTsDiagnostics(checker, cwd, hashOf),
    ...runRules(checker, selectRules(options.rules), cwd, hashOf),
  ].sort(compareDiagnostics);

  return {
    sundial: ENVELOPE_VERSION,
    run: { at: now(), mode: "text" },
    diagnostics,
    summary: summarize(diagnostics),
  };
}
