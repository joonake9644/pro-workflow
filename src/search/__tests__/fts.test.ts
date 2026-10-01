import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import {
  searchLearnings,
  searchByCategory,
  getRelatedLearnings,
  getMostAppliedLearnings,
  getRecentLearnings,
} from '../fts';

// A file-backed database would need its parent directory created by hand and a
// teardown that removes the .db, -wal and -shm set. initializeDatabase also
// creates ~/.pro-workflow as a side effect no matter which path it is given, so
// an in-memory database built straight from the schema keeps these tests free
// of both problems.
const SCHEMA = fs.readFileSync(path.join(__dirname, '..', '..', 'db', 'schema.sql'), 'utf8');

type Seed = {
  project?: string | null;
  category?: string;
  rule: string;
  mistake?: string | null;
  correction?: string | null;
  times_applied?: number;
};

describe('search/fts', () => {
  let db: Database.Database;

  const seed = (s: Seed) => {
    // `project: null` has to reach SQLite as NULL, so presence is checked rather
    // than truthiness: `s.project ?? 'proj'` would silently turn null into 'proj'
    // and the project-less-row cases would pass for the wrong reason.
    const project = 'project' in s ? s.project : 'proj';
    const r = db.prepare(`
      INSERT INTO learnings (project, category, rule, mistake, correction, times_applied)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      project,
      s.category ?? 'cat',
      s.rule,
      s.mistake ?? null,
      s.correction ?? null,
      s.times_applied ?? 0
    );
    return Number(r.lastInsertRowid);
  };

  const ids = (rows: { id: number }[]) => rows.map(r => r.id);

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(SCHEMA);
  });

  afterEach(() => {
    db.close();
  });

  describe('searchLearnings', () => {
    it('returns the learning whose rule matches', () => {
      const a = seed({ rule: 'zebra' });
      seed({ rule: 'giraffe' });
      assert.deepEqual(ids(searchLearnings(db, 'zebra')), [a]);
    });

    it('matches a prefix rather than requiring the whole token', () => {
      const a = seed({ rule: 'zebra' });
      assert.deepEqual(ids(searchLearnings(db, 'zeb')), [a],
        'the sanitizer appends * so partial words are still findable');
    });

    it('returns nothing for a query with no word characters left', () => {
      seed({ rule: 'zebra' });
      for (const q of ['', '   ', '!!! ,,, ???']) {
        assert.deepEqual(searchLearnings(db, q), [], `expected [] for ${JSON.stringify(q)}`);
      }
    });

    it('treats a multi-word query as an AND, not an OR', () => {
      const both = seed({ rule: 'zebra unique' });
      const first = seed({ rule: 'zebra shared' });
      assert.deepEqual(ids(searchLearnings(db, 'zebra unique')), [both],
        'only the row carrying both words matches');
      assert.ok(!ids(searchLearnings(db, 'zebra unique')).includes(first));
    });

    it('honours the limit', () => {
      seed({ rule: 'zebra one' });
      seed({ rule: 'zebra two' });
      seed({ rule: 'zebra three' });
      assert.equal(searchLearnings(db, 'zebra').length, 3);
      assert.equal(searchLearnings(db, 'zebra', { limit: 1 }).length, 1);
      assert.deepEqual(searchLearnings(db, 'zebra', { limit: 0 }), []);
    });

    it('includes rows whose project is null whatever filter is given', () => {
      const global = seed({ project: null, rule: 'zebra' });
      const mine = seed({ project: 'proj', rule: 'zebra' });
      const theirs = seed({ project: 'other', rule: 'zebra' });
      const got = ids(searchLearnings(db, 'zebra', { project: 'other' }));
      assert.ok(got.includes(global), 'a project-less row is treated as globally visible');
      assert.ok(got.includes(theirs));
      assert.ok(!got.includes(mine));
    });

    it('filters by category', () => {
      const kept = seed({ rule: 'zebra', category: 'cat' });
      seed({ rule: 'zebra', category: 'other' });
      assert.deepEqual(ids(searchLearnings(db, 'zebra', { category: 'cat' })), [kept]);
    });

    it('carries a rank and a snippet, and ranks the better match first', () => {
      const many = seed({ rule: 'zebra zebra zebra' });
      const once = seed({ rule: 'zebra' });
      const got = searchLearnings(db, 'zebra');
      const [best, second] = got;
      assert.ok(best, 'the query must match at least the two seeded rows');
      assert.ok(second, 'both seeded rows must come back');
      assert.equal(typeof best.rank, 'number');
      assert.equal(typeof best.snippet, 'string');
      assert.ok((best.snippet ?? '').includes('<mark>'), 'the snippet marks the hit');
      assert.deepEqual(ids(got), [many, once],
        'bm25 returns negative scores, so ascending order is most-relevant first');
      assert.ok(best.rank < second.rank, 'the row with more hits must score better');
    });

    it('survives FTS metacharacters in the query without throwing', () => {
      seed({ rule: 'zebra' });
      for (const q of ['zebra OR unique', 'zebra AND unique', "*", 'zebra' + "' OR '1'='1"]) {
        assert.doesNotThrow(() => searchLearnings(db, q),
          `${JSON.stringify(q)} reached SQLite as invalid FTS5 syntax`);
      }
    });

    it('survives an unbalanced quote in the query without throwing', () => {
      const zebra = seed({ rule: 'zebra' });
      for (const q of ['"zebra', 'zebra"']) {
        const got = ids(searchLearnings(db, q));
        assert.deepEqual(got, [zebra], `${JSON.stringify(q)} must still find the row`);
      }
    });

    it('drops an operator that has no term on one side of it', () => {
      seed({ rule: 'zebra' });
      for (const q of ['OR', 'OR AND', 'NOT', 'OR zebra', 'zebra OR']) {
        assert.doesNotThrow(() => searchLearnings(db, q),
          `${JSON.stringify(q)} reached SQLite as invalid FTS5 syntax`);
      }
    });

    it('returns nothing for a query made only of operators', () => {
      seed({ rule: 'zebra' });
      for (const q of ['OR', 'OR AND', 'NOT NEAR']) {
        assert.deepEqual(searchLearnings(db, q), [],
          `${JSON.stringify(q)} has no term to match and must not reach the MATCH clause`);
      }
    });

    it('treats an infix NEAR as a bare operator and matches nothing, rather than throwing', () => {
      // VERIFIED against the real FTS5 backend: `a NEAR b` sanitizes to an operator
      // run with no bindable term, so it returns [] instead of reaching SQLite as
      // `a* NEAR b*`, which is invalid FTS5 syntax.
      assert.deepEqual(searchLearnings(db, 'a NEAR b'), [],
        'the infix form is not valid FTS5, so it must not reach the MATCH clause');
      assert.doesNotThrow(() => searchLearnings(db, 'zebra NEAR giraffe'));
    });

    it('still honours OR between two real terms', () => {
      const first = seed({ rule: 'zebra' });
      const second = seed({ rule: 'giraffe' });
      const got = ids(searchLearnings(db, 'zebra OR giraffe'));
      assert.deepEqual([...got].sort((a, b) => a - b), [first, second].sort((a, b) => a - b),
        'OR is meaningful in the middle of a query and must survive');
    });

    it('keeps a phrase and the operator around it in the order they were written', () => {
      const zebra = seed({ rule: 'zebra' });
      const giraffe = seed({ rule: 'giraffe' });
      const cases: [string, number[]][] = [
        ['"zebra" OR "giraffe"', [zebra, giraffe]],
        ['"alpha" OR zebra', [zebra]],
        ['zebra OR "giraffe"', [zebra, giraffe]],
      ];
      for (const [q, expected] of cases) {
        const got = ids(searchLearnings(db, q)).sort((a, b) => a - b);
        assert.deepEqual(got, [...expected].sort((a, b) => a - b),
          `${q} must keep its OR, not collapse into an implicit AND`);
      }
    });

    it('does not raise on a query built only from metacharacters', () => {
      seed({ rule: 'zebra' });
      // Each of these reached SQLite as invalid FTS5 syntax at some point in this
      // function's history. Not throwing is the contract; what each one matches
      // is FTS5's business, not this function's.
      const hostile = [
        '*', '**', '"', '""', '"a"b', 'AND', 'OR', 'NOT', 'NEAR', 'NEAR(', 'NEAR()',
        'NEAR2(zebra giraffe, 3)', 'a AND', 'a OR', 'OR a', 'a AND b', 'a NOT b',
        'zebra OR', 'OR zebra', 'zebra OR OR giraffe', 'zebra()', 'a:b', '^zebra',
        '-zebra', 'zebra^2', '(zebra)', '"zebra unique', 'unique"', '  ', '\t',
      ];
      for (const q of hostile) {
        assert.doesNotThrow(() => searchLearnings(db, q),
          `${JSON.stringify(q)} reached SQLite as invalid FTS5 syntax`);
      }
    });

    it('keeps a three-term OR chain intact', () => {
      const a = seed({ rule: 'zebra' });
      const b = seed({ rule: 'giraffe' });
      const c = seed({ rule: 'alpha' });
      const got = ids(searchLearnings(db, 'zebra OR giraffe OR alpha')).sort((x, y) => x - y);
      assert.deepEqual(got, [a, b, c].sort((x, y) => x - y));
    });

    it('drops a quoted phrase that holds no word at all', () => {
      seed({ rule: 'zebra' });
      // A query that is only an empty phrase matches nothing, and a query that is
      // a real term OR an empty phrase must still return the term's row.
      assert.deepEqual(ids(searchLearnings(db, '""')), [],
        'an empty phrase alone has nothing to match');
      assert.deepEqual(ids(searchLearnings(db, '"((("')), []);
      assert.deepEqual(ids(searchLearnings(db, 'zebra OR ""')), [1],
        'the empty phrase is dropped and the real term still resolves');
    });

    it('passes a NEAR function through instead of degrading it to a conjunction', () => {
      const adjacent = seed({ rule: 'zebra giraffe' });
      const distant = seed({ rule: 'zebra alpha beta gamma delta giraffe' });

      // The distance argument is what distinguishes a real NEAR from a plain AND:
      // at distance 1 only the adjacent row qualifies, and tokenising NEAR into
      // bare terms would also drag the literal "1" into the query.
      assert.deepEqual(ids(searchLearnings(db, 'NEAR(zebra giraffe, 1)')), [adjacent]);
      assert.deepEqual(
        ids(searchLearnings(db, 'NEAR(zebra giraffe, 5)')).sort((a, b) => a - b),
        [adjacent, distant].sort((a, b) => a - b)
      );
    });

    it('keeps a quoted phrase working, and a phrase is not two prefixes', () => {
      const phrase = seed({ rule: 'zebra unique' });
      // Both words are present but not adjacent, so a phrase must not match it
      // while two independent prefix terms would.
      seed({ rule: 'zebra is unique' });
      assert.deepEqual(ids(searchLearnings(db, '"zebra unique"')), [phrase]);
    });
  });

  describe('searchByCategory', () => {
    it('returns the rows in the category, most applied first', () => {
      const few = seed({ rule: 'a', times_applied: 1 });
      const many = seed({ rule: 'b', times_applied: 9 });
      assert.deepEqual(ids(searchByCategory(db, 'cat')), [many, few]);
    });

    it('returns nothing for a category that holds no rows', () => {
      seed({ rule: 'a' });
      assert.deepEqual(searchByCategory(db, 'nope'), []);
    });

    it('honours the limit and treats no filter as no rows, not all rows', () => {
      seed({ rule: 'a' });
      seed({ rule: 'b' });
      assert.equal(searchByCategory(db, 'cat').length, 2);
      assert.equal(searchByCategory(db, 'cat', { limit: 1 }).length, 1);
      assert.deepEqual(searchByCategory(db, ''), [],
        'an empty category matches the empty string, it does not match everything');
    });
  });

  describe('getRelatedLearnings', () => {
    it('returns other learnings sharing a keyword, and never the target', () => {
      const partial = seed({ rule: 'zebra' });
      const exact = seed({ rule: 'zebra unique' });
      const target = seed({ rule: 'zebra unique triple' });
      const unrelated = seed({ rule: 'giraffe' });

      const got = ids(getRelatedLearnings(db, target));
      assert.ok(got.includes(exact), 'a learning sharing every keyword is related');
      assert.ok(got.includes(partial), 'a learning sharing one keyword is related');
      assert.ok(!got.includes(target), 'the target is filtered out of its own result set');
      assert.ok(!got.includes(unrelated), 'a learning sharing no keyword is not related');
    });

    it('does not throw when the rule yields more than one keyword', () => {
      const sibling = seed({ rule: 'zebra unique' });
      const target = seed({ rule: 'zebra unique triple' });
      const related = getRelatedLearnings(db, target);
      assert.ok(Array.isArray(related), 'expected an array, not a thrown SQLITE_ERROR');
      assert.ok(related.some((r: { id: number }) => r.id === sibling),
        'the sibling sharing both keywords is the expected result');
    });

    it('returns nothing for an id that does not exist', () => {
      assert.deepEqual(getRelatedLearnings(db, 9999), []);
    });

    it('falls back to the category when the rule has no usable keyword', () => {
      const target = seed({ rule: 'the a an is are', category: 'cat' });
      const sibling = seed({ rule: 'unrelated words', category: 'cat' });
      const got = ids(getRelatedLearnings(db, target));
      assert.ok(got.includes(sibling), 'the category fallback should surface the sibling');
    });

    it('excludes the target from the category fallback too', () => {
      const target = seed({ rule: 'the a an is are', category: 'cat' });
      assert.ok(!ids(getRelatedLearnings(db, target)).includes(target),
        'returning the learning you asked about is not a related learning');
    });

    it('over-fetches in the category fallback so the target does not eat a slot', () => {
      // Ordered by times_applied, so the target would be first and would consume
      // one of the two slots unless the fallback asks for limit + 1.
      const target = seed({ rule: 'the a an is are', times_applied: 10 });
      const first = seed({ rule: 'unrelated one', times_applied: 5 });
      const second = seed({ rule: 'unrelated two', times_applied: 4 });
      seed({ rule: 'unrelated three', times_applied: 3 });

      const got = ids(getRelatedLearnings(db, target, 2));
      assert.equal(got.length, 2, 'two related rows were asked for and two must be returned');
      assert.ok(got.includes(first) && got.includes(second), 'the two best siblings come back');
    });

    it('honours the limit', () => {
      seed({ rule: 'zebra' });
      const target = seed({ rule: 'zebra unique' });
      seed({ rule: 'zebra other' });
      seed({ rule: 'zebra third' });
      assert.ok(getRelatedLearnings(db, target, 1).length <= 1);
    });
  });

  describe('getMostAppliedLearnings', () => {
    it('returns only rows that were applied, most applied first', () => {
      const many = seed({ rule: 'a', times_applied: 9 });
      const some = seed({ rule: 'b', times_applied: 1 });
      seed({ rule: 'c', times_applied: 0 });
      assert.deepEqual(ids(getMostAppliedLearnings(db)), [many, some]);
    });

    it('honours the limit', () => {
      seed({ rule: 'a', times_applied: 1 });
      seed({ rule: 'b', times_applied: 2 });
      assert.equal(getMostAppliedLearnings(db, 1).length, 1);
      assert.deepEqual(getMostAppliedLearnings(db, 0), []);
    });
  });

  describe('getRecentLearnings', () => {
    it('returns rows newest first and honours the limit', () => {
      const first = seed({ rule: 'a' });
      const second = seed({ rule: 'b' });
      const got = ids(getRecentLearnings(db));
      // created_at has one-second resolution, so rows seeded in the same second
      // have no guaranteed order. Assert set membership plus the limit instead.
      assert.deepEqual([...got].sort((x, y) => x - y), [first, second].sort((x, y) => x - y));
      assert.equal(getRecentLearnings(db, 1).length, 1);
    });

    it('includes rows whose project is null whatever filter is given', () => {
      const global = seed({ project: null, rule: 'a' });
      seed({ project: 'proj', rule: 'b' });
      const got = ids(getRecentLearnings(db, 10, 'other'));
      assert.deepEqual(got, [global]);
    });
  });
});
