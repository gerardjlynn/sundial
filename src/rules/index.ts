import type { Severity } from "../envelope.js";
import { scanEffects, type EffectKind } from "./effects.js";
import type { Rule } from "./types.js";

export type { Rule, RuleContext, RuleFinding } from "./types.js";

/**
 * Capability/effect rules (SND0xxx block). Each flags a component that performs
 * an effect without a declared capability. Detection only: no repairs are
 * offered because the capability-annotation syntax is pillar-2 design, not yet
 * settled — until it exists a finding cannot be made dismissible, which is why
 * the whole SND set is gated behind a flag (default off).
 *
 * Numbering blocks (namespacing convention only; codes stay individually
 * frozen): SND0xxx capability/effect, SND1xxx graph-integrity, SND2xxx
 * substrate-specific.
 */

interface EffectRuleSpec {
  code: string;
  kind: EffectKind;
  label: string; // human phrase for the effect, e.g. "a network effect"
  severity: Severity;
}

function effectRule(spec: EffectRuleSpec): Rule {
  return {
    code: spec.code,
    description: `Component performs ${spec.label} without a declared capability (detection only).`,
    run(ctx) {
      for (const obs of scanEffects(ctx.sourceFile)) {
        if (obs.kind !== spec.kind) continue;
        ctx.push({
          code: spec.code,
          severity: spec.severity,
          message: `Component "${obs.component}" performs ${spec.label} (via ${obs.via}) but declares no capability.`,
          fileName: ctx.fileName,
          range: obs.range,
          facts: {
            component: obs.component,
            via: obs.via,
            declared: [],
            observed: [spec.kind],
          },
        });
      }
    },
  };
}

/** SND0001 — component performs a network effect with no capability annotation. */
export const SND0001 = effectRule({
  code: "SND0001",
  kind: "net",
  label: "a network effect",
  severity: "warning",
});

/** SND0002 — component performs a storage effect with no capability annotation. */
export const SND0002 = effectRule({
  code: "SND0002",
  kind: "storage",
  label: "a storage effect",
  severity: "warning",
});

/** SND0003 — component touches the DOM outside its subtree with no capability annotation. */
export const SND0003 = effectRule({
  code: "SND0003",
  kind: "dom",
  label: "a DOM effect outside its subtree",
  severity: "warning",
});

/** All registered rules, keyed by code. */
export const RULES: Record<string, Rule> = {
  [SND0001.code]: SND0001,
  [SND0002.code]: SND0002,
  [SND0003.code]: SND0003,
};

/**
 * Resolve a rules selector into a concrete rule list.
 * - `false` / undefined → no rules (default; the SND set is opt-in)
 * - `true` → every registered rule
 * - `string[]` → the named subset (unknown codes throw)
 */
export function selectRules(selector: boolean | string[] | undefined): Rule[] {
  if (!selector) return [];
  if (selector === true) return Object.values(RULES);
  return selector.map((code) => {
    const rule = RULES[code];
    if (!rule) throw new Error(`Unknown rule code: ${code}`);
    return rule;
  });
}
