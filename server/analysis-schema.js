import { z } from "zod";
import { LEVELS, STRUCTURES } from "../src/cefr-engine.js";

const level = z.enum(LEVELS);
const GRAMMAR_TYPES = ["verb_tense", "agreement", "article", "preposition", "word_order", "missing_subject", "plural", "pronoun", "auxiliary", "other"];
const LEXICAL_TYPES = ["wrong_word", "collocation", "word_formation", "false_cognate", "portuguese"];
const int0 = z.coerce.number().int().min(0);

/**
 * Esquema da saída do LLM (prompts/analise-llm.md). Campos desconhecidos — inclusive qualquer
 * "cefr", "level" ou "score" que o modelo invente — são descartados: o nível vem só do motor.
 */
export const AnalysisSchema = z.object({
  on_topic: z.boolean(),
  grammar_errors: z.array(z.object({
    text: z.string(),
    correction: z.string(),
    type: z.enum(GRAMMAR_TYPES).catch("other"),
    impedes: z.boolean().default(false),
    explanation_pt: z.string().default(""),
  })),
  lexical_errors: z.array(z.object({
    text: z.string(),
    correction: z.string(),
    type: z.enum(LEXICAL_TYPES).catch("wrong_word"),
    explanation_pt: z.string().default(""),
  })),
  multiword_expressions: z.array(z.object({ text: z.string(), cefr: level })),
  structures: z.array(z.string()).transform((ids) => [...new Set(ids)].filter((id) => id in STRUCTURES)),
  t_units: int0,
  clauses: int0.optional(),
  subordinate_clauses: int0.optional(),
  restarts: int0.default(0),
  unknown_word_levels: z.record(z.string(), z.string())
    .default({})
    .transform((m) => Object.fromEntries(Object.entries(m).filter(([, v]) => LEVELS.includes(String(v).toUpperCase())).map(([k, v]) => [k.toLowerCase(), String(v).toUpperCase()]))),
  corrected_version: z.string().default(""),
  suggested_words: z.array(z.object({ word: z.string(), cefr: z.string().default(""), instead_of: z.string().default("") })).default([]),
  feedback_pt: z.string().default(""),
});
