import * as path from "node:path";

/** Repo-relative POSIX path, for stable cross-platform spans. */
export function relPosix(cwd: string, absFile: string): string {
  const rel = path.relative(cwd, absFile);
  return rel.split(path.sep).join("/");
}
