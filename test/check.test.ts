import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { check } from "../src/check.js";
import type { Envelope } from "../src/envelope.js";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const FIXED_TIME = "2026-07-04T00:00:00.000Z";

function run(files: string[], rules: boolean | string[] = false): Envelope {
  return check({
    cwd: FIXTURES,
    files: files.map((f) => path.join(FIXTURES, f)),
    rules,
    now: () => FIXED_TIME,
  });
}

describe("envelope shape", () => {
  it("clean file → well-formed empty envelope", () => {
    const env = run(["clean.ts"]);
    expect(env.sundial).toBe("0.1");
    expect(env.run).toEqual({ at: FIXED_TIME, mode: "text" });
    expect(env.diagnostics).toEqual([]);
    expect(env.summary).toEqual({ errors: 0, warnings: 0, suggestions: 0, bySource: {} });
  });

  it("type-error fixture matches the envelope snapshot", () => {
    // The envelope IS the product surface; the snapshot guards its shape.
    expect(run(["type-error.ts"])).toMatchSnapshot();
  });
});

describe("TS diagnostics", () => {
  it("emits the native TS code, error severity, and a hashed span", () => {
    const env = run(["type-error.ts"]);
    const typeError = env.diagnostics.find((d) => d.code === "TS2322");
    expect(typeError).toBeDefined();
    expect(typeError!.source).toBe("ts");
    expect(typeError!.severity).toBe("error");
    expect(typeError!.span.file).toBe("type-error.ts");
    expect(typeError!.span.contentHash).toMatch(/^sha256:[0-9a-f]{16}$/);
    expect(typeError!.docs).toBe("sundial://rules/TS2322");
  });

  it("surfaces an unused-import code fix as a safe repair", () => {
    const env = run(["type-error.ts"]);
    const unused = env.diagnostics.find((d) => d.code === "TS6133");
    expect(unused).toBeDefined();
    expect(unused!.severity).toBe("suggestion");
    const safeRepair = unused!.repairs?.find((r) => r.id === "unusedIdentifier");
    expect(safeRepair).toBeDefined();
    expect(safeRepair!.safety).toBe("safe");
    expect(safeRepair!.edits.length).toBeGreaterThan(0);
    expect(safeRepair!.edits[0]!.file).toBe("type-error.ts");
  });
});

describe("determinism", () => {
  it("orders by file, then span start, then code, and is stable across runs", () => {
    const a = run(["type-error.ts", "effects.ts"], true);
    const b = run(["effects.ts", "type-error.ts"], true);
    expect(a.diagnostics).toEqual(b.diagnostics);

    const keys = a.diagnostics.map((d) => [d.span.file, d.span.range[0], d.code]);
    const sorted = [...keys].sort((x, y) =>
      x[0] !== y[0]
        ? String(x[0]) < String(y[0]) ? -1 : 1
        : x[1] !== y[1]
          ? Number(x[1]) - Number(y[1])
          : String(x[2]) < String(y[2]) ? -1 : 1,
    );
    expect(keys).toEqual(sorted);
  });
});

describe("SND rules (opt-in)", () => {
  it("emit nothing when rules are off (default)", () => {
    const env = run(["effects.ts"]);
    expect(env.diagnostics.filter((d) => d.source === "sundial")).toEqual([]);
  });

  it("flag undeclared effects in components, not in plain functions", () => {
    const env = run(["effects.ts"], true);
    const snd = env.diagnostics.filter((d) => d.source === "sundial");
    const codes = snd.map((d) => d.code).sort();
    expect(codes).toEqual(["SND0001", "SND0002", "SND0003"]);

    const net = snd.find((d) => d.code === "SND0001")!;
    expect(net.severity).toBe("warning");
    expect(net.facts).toMatchObject({ component: "UserCard", observed: ["net"], declared: [] });
    expect(net.docs).toBe("sundial://rules/SND0001");

    // loadData is camelCase → not a component → its fetch is not flagged.
    for (const d of snd) {
      expect(d.facts?.component).not.toBe("loadData");
    }
  });

  it("honor a rule subset selector", () => {
    const env = run(["effects.ts"], ["SND0001"]);
    const codes = new Set(
      env.diagnostics.filter((d) => d.source === "sundial").map((d) => d.code),
    );
    expect(codes).toEqual(new Set(["SND0001"]));
  });
});
