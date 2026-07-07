import { createHash } from "node:crypto";

/**
 * Content hash used for span staleness detection. Short, hex, deterministic.
 *
 * v0.1 hashes whole-file content: the diagnostic's span addresses a file
 * (the projection), so "did this file change since the diagnostic was
 * produced" is the staleness question text mode can answer. Node-level
 * staleness (target.nodeHash) arrives with the graph in Milestone 2.
 */
export function contentHash(text: string): string {
  return "sha256:" + createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}
