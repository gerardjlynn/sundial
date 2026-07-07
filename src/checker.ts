import * as path from "node:path";
import ts from "typescript";

/**
 * A resolved compilation the checker operates over: a LanguageService (for
 * diagnostics and code fixes) plus cached file text (for spans and hashing).
 *
 * The LanguageService is where TypeScript already sits behind an editor —
 * pillar 1 puts an agent loop in exactly that seat (see vault
 * ts-toolchain-prior-art). We do not fork the compiler.
 */
export interface Checker {
  service: ts.LanguageService;
  program: ts.Program;
  /** Absolute file names in the compilation, excluding declaration/lib files. */
  fileNames: string[];
  /** Full text of a file, cached. */
  getText(fileName: string): string;
  options: ts.CompilerOptions;
}

export interface CheckerInput {
  /** Absolute path to a tsconfig.json. If given, its files/options are used. */
  tsconfigPath?: string;
  /** Explicit absolute file names (used when no tsconfig is given). */
  files?: string[];
  /** Compiler options overlaid on defaults (ignored when tsconfigPath is set). */
  compilerOptions?: ts.CompilerOptions;
}

const DEFAULT_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  jsx: ts.JsxEmit.ReactJSX,
  strict: true,
  skipLibCheck: true,
  noEmit: true,
  allowJs: false,
};

function resolveInput(input: CheckerInput): { fileNames: string[]; options: ts.CompilerOptions } {
  if (input.tsconfigPath) {
    const configFile = ts.readConfigFile(input.tsconfigPath, ts.sys.readFile);
    if (configFile.error) {
      throw new Error(
        ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"),
      );
    }
    const parsed = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      path.dirname(input.tsconfigPath),
    );
    return { fileNames: parsed.fileNames, options: parsed.options };
  }
  const files = (input.files ?? []).map((f) => path.resolve(f));
  return { fileNames: files, options: { ...DEFAULT_OPTIONS, ...input.compilerOptions } };
}

export function createChecker(input: CheckerInput): Checker {
  const { fileNames, options } = resolveInput(input);
  const textCache = new Map<string, string>();

  const readText = (fileName: string): string | undefined => {
    if (textCache.has(fileName)) return textCache.get(fileName);
    const text = ts.sys.readFile(fileName);
    if (text !== undefined) textCache.set(fileName, text);
    return text;
  };

  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => fileNames,
    getScriptVersion: () => "1", // files are immutable within a run
    getScriptSnapshot: (fileName) => {
      const text = readText(fileName);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => process.cwd(),
    getCompilationSettings: () => options,
    getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  };

  const service = ts.createLanguageService(host, ts.createDocumentRegistry());
  const program = service.getProgram();
  if (!program) throw new Error("Failed to create TypeScript program.");

  return {
    service,
    program,
    fileNames,
    getText: (fileName) => {
      const text = readText(fileName);
      if (text === undefined) throw new Error(`Cannot read file: ${fileName}`);
      return text;
    },
    options,
  };
}
