import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./config.js";
import { mergeWordlists, parseWordlistCsv } from "../src/cefr-engine.js";

/** Carrega e junta as duas listas de data/ (CEFR-J A1–B2 + Octanove C1–C2). Chamar uma vez na subida. */
export function loadWordlist(dir = path.join(ROOT, "data")) {
  const read = (f) => fs.readFileSync(path.join(dir, f), "utf8");
  return mergeWordlists(
    parseWordlistCsv(read("cefrj-vocabulary-profile-1.5.csv")),
    parseWordlistCsv(read("octanove-vocabulary-profile-c1c2-1.0.csv")),
  );
}
