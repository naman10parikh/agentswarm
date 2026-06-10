/**
 * Memory search — a real queryable BM25 index over THIS repo's own corpus.
 *
 * Ports the pattern from Energy's `scripts/memory-search.sh` (term-frequency x
 * source-weight x recency) into in-code BM25 ranking. Unlike a flat grep, this
 * builds a per-document term-frequency table, computes IDF across the corpus,
 * and scores documents with Okapi BM25 — so rare query terms dominate and long
 * documents are length-normalised.
 *
 * Corpus (the repo's own knowledge surface):
 *   - MEMORY.md, memory/LEARNINGS.md, memory/topics/*, memory/daily/*, memory/archive/*
 *   - brain/*.md (the Obsidian knowledge graph)
 *   - top-level docs: README.md, AGENTS.md, CLAUDE.md, CONTEXT.md, QUICKSTART.md, CHANGELOG.md
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
/** Repo root: dist/ (or src/ under tsx) sits one level under the repo root. */
export const REPO_ROOT = join(HERE, "..");

export interface SearchHit {
  /** Repo-relative path of the matched document. */
  path: string;
  /** Combined BM25 + source-weight + recency score (higher = better). */
  score: number;
  /** The single best-matching line of context from the document. */
  snippet: string;
  /** Line number of the snippet (1-indexed). */
  line: number;
}

// ─── BM25 parameters (standard Okapi defaults) ───
const K1 = 1.5;
const B = 0.75;

/** Split text into lowercase alphanumeric tokens (drops markdown punctuation). */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

/** Source-authority weight (mirrors memory-search.sh weight_for_source). */
function sourceWeight(relPath: string): number {
  if (relPath.startsWith("memory/LEARNINGS")) return 4;
  if (relPath.startsWith("memory/topics/")) return 4;
  if (relPath === "MEMORY.md" || relPath === "memory/MEMORY.md") return 4;
  if (relPath.startsWith("memory/daily/")) return 3;
  if (relPath.startsWith("brain/")) return 2;
  if (relPath.startsWith("memory/archive/")) return 1;
  return 2; // top-level docs (README/AGENTS/CLAUDE/CONTEXT/...)
}

/** Recency weight: recently-modified files score higher (mirrors recency_weight). */
function recencyWeight(absPath: string): number {
  let ageDays = 9999;
  try {
    ageDays = (Date.now() - statSync(absPath).mtimeMs) / 86_400_000;
  } catch {
    return 1;
  }
  if (ageDays <= 1) return 1.6;
  if (ageDays <= 3) return 1.4;
  if (ageDays <= 7) return 1.2;
  if (ageDays <= 30) return 1.05;
  return 1;
}

interface Doc {
  path: string; // repo-relative
  abs: string;
  raw: string;
  tokens: string[];
  tf: Map<string, number>;
  len: number;
}

/** Recursively collect .md files under a directory. */
function collectMd(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      if (name === ".obsidian" || name === "node_modules") continue;
      collectMd(full, out);
    } else if (name.endsWith(".md")) {
      out.push(full);
    }
  }
}

/** Build the document list for the corpus rooted at `root` (defaults to repo root). */
export function buildCorpus(root: string = REPO_ROOT): Doc[] {
  const files: string[] = [];

  // Top-level docs
  for (const f of [
    "MEMORY.md",
    "README.md",
    "AGENTS.md",
    "CLAUDE.md",
    "CONTEXT.md",
    "QUICKSTART.md",
    "CHANGELOG.md",
  ]) {
    const p = join(root, f);
    if (existsSync(p)) files.push(p);
  }

  // memory/ and brain/ trees
  collectMd(join(root, "memory"), files);
  collectMd(join(root, "brain"), files);

  const docs: Doc[] = [];
  for (const abs of files) {
    let raw = "";
    try {
      raw = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const tokens = tokenize(raw);
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    docs.push({
      path: relative(root, abs),
      abs,
      raw,
      tokens,
      tf,
      len: tokens.length,
    });
  }
  return docs;
}

/** Best-matching single line for a query within a document (for snippet display). */
function bestLine(
  raw: string,
  queryTokens: string[],
): { snippet: string; line: number } {
  const lines = raw.split("\n");
  let bestScore = -1;
  let bestIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const lineTokens = new Set(tokenize(lines[i]));
    let s = 0;
    for (const q of queryTokens) if (lineTokens.has(q)) s++;
    if (s > bestScore) {
      bestScore = s;
      bestIdx = i;
    }
  }
  return { snippet: lines[bestIdx]?.trim() ?? "", line: bestIdx + 1 };
}

/**
 * Rank corpus documents against a query using Okapi BM25, then multiply by the
 * source-authority and recency weights. Returns the top `limit` hits.
 */
export function searchMemory(
  query: string,
  limit = 5,
  root: string = REPO_ROOT,
): SearchHit[] {
  const queryTokens = [...new Set(tokenize(query))];
  if (queryTokens.length === 0) return [];

  const docs = buildCorpus(root);
  if (docs.length === 0) return [];

  const N = docs.length;
  const avgdl = docs.reduce((a, d) => a + d.len, 0) / N || 1;

  // Document frequency per query term.
  const df = new Map<string, number>();
  for (const q of queryTokens) {
    let count = 0;
    for (const d of docs) if (d.tf.has(q)) count++;
    df.set(q, count);
  }

  const hits: SearchHit[] = [];
  for (const d of docs) {
    let bm25 = 0;
    for (const q of queryTokens) {
      const f = d.tf.get(q) ?? 0;
      if (f === 0) continue;
      const n = df.get(q) ?? 0;
      // BM25 IDF with +1 to keep it non-negative for common terms.
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      const denom = f + K1 * (1 - B + (B * d.len) / avgdl);
      bm25 += idf * ((f * (K1 + 1)) / denom);
    }
    if (bm25 <= 0) continue;

    const score = bm25 * sourceWeight(d.path) * recencyWeight(d.abs);
    const { snippet, line } = bestLine(d.raw, queryTokens);
    hits.push({ path: d.path, score, snippet, line });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}
