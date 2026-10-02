import Database from 'better-sqlite3';
import { Learning } from '../db/store';

export interface SearchResult extends Learning {
  rank: number;
  snippet?: string;
}

export interface SearchOptions {
  limit?: number;
  project?: string;
  category?: string;
}

export function searchLearnings(
  db: Database.Database,
  query: string,
  options: SearchOptions = {}
): SearchResult[] {
  const { limit = 10, project, category } = options;

  const sanitizedQuery = sanitizeQuery(query);

  if (!sanitizedQuery) {
    return [];
  }

  let sql = `
    SELECT
      learnings.*,
      bm25(learnings_fts, 1.0, 2.0, 1.0, 1.0) as rank,
      snippet(learnings_fts, 1, '<mark>', '</mark>', '...', 32) as snippet
    FROM learnings
    JOIN learnings_fts ON learnings.id = learnings_fts.rowid
    WHERE learnings_fts MATCH ?
  `;

  const params: (string | number)[] = [sanitizedQuery];

  if (project) {
    sql += ` AND (learnings.project = ? OR learnings.project IS NULL)`;
    params.push(project);
  }

  if (category) {
    sql += ` AND learnings.category = ?`;
    params.push(category);
  }

  sql += ` ORDER BY rank LIMIT ?`;
  params.push(limit);

  const stmt = db.prepare(sql);
  return stmt.all(...params) as SearchResult[];
}

export function searchByCategory(
  db: Database.Database,
  category: string,
  options: SearchOptions = {}
): Learning[] {
  const { limit = 10, project } = options;

  let sql = `
    SELECT * FROM learnings
    WHERE category = ?
  `;

  const params: (string | number)[] = [category];

  if (project) {
    sql += ` AND (project = ? OR project IS NULL)`;
    params.push(project);
  }

  sql += ` ORDER BY times_applied DESC, created_at DESC LIMIT ?`;
  params.push(limit);

  const stmt = db.prepare(sql);
  return stmt.all(...params) as Learning[];
}

export function getRelatedLearnings(
  db: Database.Database,
  learningId: number,
  limit: number = 5
): SearchResult[] {
  const learningStmt = db.prepare(`SELECT * FROM learnings WHERE id = ?`);
  const learning = learningStmt.get(learningId) as Learning | undefined;

  if (!learning) {
    return [];
  }

  const keywords = extractKeywords(learning.rule);
  if (keywords.length === 0) {
    // Over-fetch and drop the target here too: returning the learning the caller
    // already has is not a related learning.
    return searchByCategory(db, learning.category, { limit: limit + 1 })
      .filter(l => l.id !== learningId)
      .slice(0, limit) as SearchResult[];
  }

  const query = keywords.join(' OR ');
  const results = searchLearnings(db, query, { limit: limit + 1 });

  return results.filter((r) => r.id !== learningId).slice(0, limit);
}

export function getMostAppliedLearnings(
  db: Database.Database,
  limit: number = 10
): Learning[] {
  const stmt = db.prepare(`
    SELECT * FROM learnings
    WHERE times_applied > 0
    ORDER BY times_applied DESC, created_at DESC
    LIMIT ?
  `);

  return stmt.all(limit) as Learning[];
}

export function getRecentLearnings(
  db: Database.Database,
  limit: number = 10,
  project?: string
): Learning[] {
  let sql = `SELECT * FROM learnings`;
  const params: (string | number)[] = [];

  if (project) {
    sql += ` WHERE project = ? OR project IS NULL`;
    params.push(project);
  }

  sql += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);

  const stmt = db.prepare(sql);
  return stmt.all(...params) as Learning[];
}

// FTS5 reads these as operators when they are bare, and a trailing "*" on an
// operator is a syntax error rather than a prefix search.
const FTS5_OPERATORS = new Set(['OR', 'AND', 'NOT', 'NEAR']);

// This is a token filter, not a grammar validator: it keeps the prefix search
// ("zeb" -> "zeb*") and quoted phrases that callers rely on, and it removes the
// two shapes that reach SQLite as invalid FTS5 — a bare operator carrying a
// star, and a token with no word character in it at all. Anything the tests do
// not enumerate is a hole the suite does not cover, not a guarantee.
function sanitizeQuery(query: string): string {
  // One left-to-right pass, so the order the caller wrote is the order that
  // reaches SQLite. Collecting phrases separately and prepending them looks
  // equivalent and is not: it drops the operator that sat between a phrase and
  // its neighbour, turning "a" OR zebra into an implicit AND that matches
  // nothing and reports no error.
  const parts: string[] = [];
  const scanner = /"([^"]*)"|(NEAR2?\s*\([^)]*\))|(\S+)/g;

  for (const match of query.matchAll(scanner)) {
    const [, phrase, near, bare] = match;

    if (phrase !== undefined) {
      // A phrase is forwarded as written. Its punctuation and whitespace runs are
      // already separators to FTS5's tokenizer, so rewriting them here changed
      // nothing observable — and an empty or punctuation-only phrase was measured
      // to match no rows rather than raise, so filtering it out is not needed
      // either. Keeping a guard that no input can distinguish only hides a
      // behaviour the test suite would otherwise pin.
      parts.push(`"${phrase}"`);
      continue;
    }

    // FTS5's NEAR function is the one query form whose punctuation carries
    // meaning, so it is forwarded verbatim rather than tokenised. FTS2 spelled it
    // NEAR2 and rejects it, so that spelling is deliberately not forwarded.
    if (near !== undefined) {
      if (/^NEAR\s*\(\s*\S+\s+\S+\s*,\s*\d+\s*\)$/.test(near)) {
        parts.push(near.replace(/\s+/g, ' ').trim());
      }
      continue;
    }

    const term = (bare as string).replace(/[^\w\s*]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!/\w/.test(term)) continue;
    if (FTS5_OPERATORS.has(term)) {
      parts.push(term);
      continue;
    }
    parts.push(term.includes('*') ? term : `${term}*`);
  }

  // A leading or trailing operator has no term to bind to and is a syntax error,
  // and a query made only of operators matches nothing at all.
  while (parts.length > 0 && FTS5_OPERATORS.has(parts[0])) parts.shift();
  while (parts.length > 0 && FTS5_OPERATORS.has(parts[parts.length - 1])) parts.pop();

  // "a OR OR b" reaches SQLite as a doubled operator, which is a syntax error
  // rather than a query. Collapsing the run leaves the single operator that the
  // caller actually wrote.
  const collapsed: string[] = [];
  for (const part of parts) {
    if (FTS5_OPERATORS.has(part) && FTS5_OPERATORS.has(collapsed[collapsed.length - 1])) continue;
    collapsed.push(part);
  }

  return collapsed.join(' ');
}

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'could', 'should', 'may', 'might', 'must', 'shall',
    'can', 'need', 'to', 'of', 'in', 'for', 'on', 'with', 'at',
    'by', 'from', 'as', 'into', 'through', 'during', 'before',
    'after', 'above', 'below', 'between', 'under', 'again',
    'further', 'then', 'once', 'here', 'there', 'when', 'where',
    'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other',
    'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same',
    'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or',
    'because', 'until', 'while', 'although', 'though', 'this',
    'that', 'these', 'those', 'it', 'its',
  ]);

  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word))
    .slice(0, 5);
}
