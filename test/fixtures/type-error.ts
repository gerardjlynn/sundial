// A plain type error (TS2322) with a mechanical follow-on: an unused import.
import { readFileSync } from "node:fs";

export const count: number = "not a number";
