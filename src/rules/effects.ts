import ts from "typescript";
import type { Range } from "../envelope.js";

/**
 * Effect classes an SND rule reasons about (subset of the pillar-2 capability
 * vocabulary). A component that performs one of these effects without a
 * declared capability is what the rules flag.
 */
export type EffectKind = "net" | "storage" | "dom";

export interface EffectObservation {
  kind: EffectKind;
  /** How the effect was reached, e.g. "fetch", "axios.get", "localStorage". */
  via: string;
  /** PascalCase name of the enclosing component. */
  component: string;
  range: Range;
}

const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*$/;

function isPascalCase(name: string): boolean {
  return PASCAL_CASE.test(name);
}

/**
 * The name a function-like node is bound to, if any: the declaration name for
 * `function Foo()`, or the variable name for `const Foo = () => {}`. Toy-scale
 * heuristic — enough to identify components by the PascalCase convention
 * without type information.
 */
function functionName(node: ts.SignatureDeclaration): string | undefined {
  if (ts.isFunctionDeclaration(node) && node.name) return node.name.text;
  if (
    (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
    node.parent &&
    ts.isVariableDeclaration(node.parent) &&
    ts.isIdentifier(node.parent.name)
  ) {
    return node.parent.name.text;
  }
  return undefined;
}

function isComponentName(name: string | undefined): name is string {
  return name !== undefined && isPascalCase(name);
}

/** Classify a node as an effect, if it is one. */
function classify(node: ts.Node): { kind: EffectKind; via: string } | undefined {
  // Network: fetch(...), axios(...), axios.get(...), new XMLHttpRequest()
  if (ts.isCallExpression(node)) {
    const callee = node.expression;
    if (ts.isIdentifier(callee)) {
      if (callee.text === "fetch") return { kind: "net", via: "fetch" };
      if (callee.text === "axios") return { kind: "net", via: "axios" };
    }
  }
  if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
    if (node.expression.text === "XMLHttpRequest") {
      return { kind: "net", via: "XMLHttpRequest" };
    }
  }
  // Property access on a well-known host object.
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
    const obj = node.expression.text;
    if (obj === "axios") return { kind: "net", via: `axios.${node.name.text}` };
    if (obj === "localStorage" || obj === "sessionStorage") {
      return { kind: "storage", via: obj };
    }
    if (obj === "document" || obj === "window") {
      return { kind: "dom", via: obj };
    }
  }
  return undefined;
}

/**
 * Syntactic scan for capability-relevant effects, each attributed to its
 * innermost enclosing component. No type information is used — this is a cheap
 * structural pass, and it is deliberately a heuristic (a local binding that
 * shadows `fetch` would be a false positive). The rules that consume it are
 * detection-only and gated behind a flag until pillar-2 supplies an annotation
 * syntax to make findings dismissible.
 */
export function scanEffects(sourceFile: ts.SourceFile): EffectObservation[] {
  const out: EffectObservation[] = [];
  const seen = new Set<string>(); // dedupe by `${kind}:${start}`

  const visit = (node: ts.Node, component: string | undefined): void => {
    let current = component;
    if (ts.isFunctionLike(node)) {
      const name = functionName(node as ts.SignatureDeclaration);
      if (isComponentName(name)) current = name;
    }

    if (current) {
      const effect = classify(node);
      if (effect) {
        const start = node.getStart(sourceFile);
        const key = `${effect.kind}:${start}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({
            kind: effect.kind,
            via: effect.via,
            component: current,
            range: [start, node.getEnd()],
          });
        }
      }
    }

    ts.forEachChild(node, (child) => visit(child, current));
  };

  visit(sourceFile, undefined);
  return out;
}
