import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { initializeDatabase, getDefaultDbPath, ensureDbDir } from '../index';
import { createStore, type Store } from '../store';

function rows<T>(db: Store['db'], sql: string): T[] {
  return db.prepare(sql).all() as T[];
}

function one<T>(db: Store['db'], sql: string, ...args: unknown[]): T {
  return db.prepare(sql).get(...(args as never[])) as T;
}

function sqliteCode(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    return (err as { code?: string }).code ?? `NO_CODE(${err!.constructor.name})`;
  }
  throw new Error('expected the call to throw');
}

describe('initializeDatabase', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'pw-store-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('creates the schema and turns foreign keys on', () => {
    const db = initializeDatabase(path.join(dir, 'a.db'));
    try {
      assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
      const tables = rows<{ name: string }>(
        db, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      ).map(r => r.name);
      for (const t of ['learnings', 'sessions', 'wikis', 'wiki_pages', 'wiki_seeds', 'learnings_fts']) {
        assert.ok(tables.includes(t), `missing table ${t}`);
      }
    } finally {
      db.close();
    }
  });

  it('is idempotent across repeated initialization', () => {
    const p = path.join(dir, 'b.db');
    const first = initializeDatabase(p);
    first.close();
    const second = initializeDatabase(p);
    try {
      const n = one<{ c: number }>(second, "SELECT count(*) AS c FROM sqlite_master WHERE type='table'");
      assert.ok(n.c > 0);
    } finally {
      second.close();
    }
  });

  it('throws a TypeError, not a SqliteError, when the parent directory is absent', () => {
    assert.throws(
      () => initializeDatabase(path.join(dir, 'nope', 'x.db')),
      (err: Error) => err instanceof TypeError && /directory does not exist/.test(err.message)
    );
  });

  it('never creates the parent directory of a custom path', () => {
    try { initializeDatabase(path.join(dir, 'absent', 'x.db')); } catch { /* expected */ }
    assert.equal(fs.existsSync(path.join(dir, 'absent')), false);
  });

  it('ensureDbDir creates the app directory idempotently', () => {
    ensureDbDir();
    ensureDbDir();
    assert.equal(fs.existsSync(path.dirname(getDefaultDbPath())), true);
  });
});

describe('createStore', () => {
  let store: Store;
  beforeEach(() => { store = createStore(':memory:'); });
  afterEach(() => { try { store.close(); } catch { /* already closed */ } });

  type AddInput = Parameters<Store['addLearning']>[0];
  type SeedOverrides = { project?: string | null; rule?: string | null; category?: string | null };

  const seed = (over: SeedOverrides = {}) =>
    store.addLearning({
      project: 'proj', category: 'cat', rule: 'rule-a',
      mistake: null, correction: null, ...over,
    } as unknown as AddInput);

  describe('learnings', () => {
    it('returns the persisted row with times_applied zeroed', () => {
      const l = seed();
      assert.ok(l.id > 0);
      assert.equal(l.times_applied, 0);
      assert.equal(l.rule, 'rule-a');
    });

    it('getLearning returns undefined for an unknown id', () => {
      assert.equal(store.getLearning(9999), undefined);
    });

    it('getAllLearnings without a project returns everything', () => {
      seed(); seed({ project: 'other' });
      assert.equal(store.getAllLearnings().length, 2);
    });

    it('a project filter also returns rows whose project is null', () => {
      seed({ project: null });
      seed({ project: 'other' });
      const got = store.getAllLearnings('other');
      assert.equal(got.length, 2, 'project-less rows are treated as globally visible');
    });

    it('an empty-string project filter returns everything, not a filtered set', () => {
      seed(); seed({ project: 'other' });
      assert.equal(store.getAllLearnings('').length, 2);
    });

    it('updateLearning reports true for a real field change', () => {
      const l = seed();
      assert.equal(store.updateLearning(l.id, { rule: 'rule-b' }), true);
      assert.equal(store.getLearning(l.id)?.rule, 'rule-b');
    });

    it('updateLearning reports false for an unknown id', () => {
      assert.equal(store.updateLearning(9999, { rule: 'x' }), false);
    });

    it('updateLearning keeps the old value when the new one is null', () => {
      const l = seed();
      store.updateLearning(l.id, { rule: null as unknown as string });
      assert.equal(store.getLearning(l.id)?.rule, 'rule-a');
    });

    it('updateLearning silently ignores project while still reporting success', () => {
      const l = seed({ project: 'proj' });
      assert.equal(store.updateLearning(l.id, { project: 'other' }), true);
      assert.equal(store.getLearning(l.id)?.project, 'proj',
        'project is not in the COALESCE list, so the change is dropped');
    });

    it('deleteLearning reports whether a row was removed', () => {
      const l = seed();
      assert.equal(store.deleteLearning(l.id), true);
      assert.equal(store.deleteLearning(l.id), false);
    });

    it('incrementTimesApplied accumulates and no-ops for a missing id', () => {
      const l = seed();
      store.incrementTimesApplied(l.id);
      store.incrementTimesApplied(l.id);
      assert.equal(store.getLearning(l.id)?.times_applied, 2);
      assert.equal(store.incrementTimesApplied(9999), undefined);
    });

    it('rejects a null category with a NOT NULL constraint', () => {
      assert.equal(sqliteCode(() => seed({ category: null })), 'SQLITE_CONSTRAINT_NOTNULL');
    });

    it('rejects a null rule with a NOT NULL constraint', () => {
      assert.equal(sqliteCode(() => seed({ rule: null })), 'SQLITE_CONSTRAINT_NOTNULL');
    });

    it('rolls back when linking to a wiki that does not exist', () => {
      const before = store.getAllLearnings().length;
      assert.equal(sqliteCode(() => store.addLearning(
        { project: 'p', category: 'c', rule: 'r', mistake: null, correction: null },
        'ghost-wiki'
      )), 'SQLITE_CONSTRAINT_FOREIGNKEY');
      assert.equal(store.getAllLearnings().length, before,
        'the learning insert must not survive a failed link');
    });

    it('links a learning to an existing wiki and finds it by wiki', () => {
      store.upsertWiki({ slug: 'w1', title: 'W', flavor: 'research', root_path: '/r' });
      const l = store.addLearning(
        { project: 'p', category: 'c', rule: 'linked', mistake: null, correction: null },
        'w1'
      );
      const found = store.getLearningsByWiki('w1');
      assert.equal(found.length, 1);
      assert.equal(found[0].id, l.id);
      assert.equal(store.getLearningsByWiki('other').length, 0);
    });

    it('keeps the FTS index in sync on update and delete', () => {
      const l = seed({ rule: 'findable' });
      store.updateLearning(l.id, { rule: 'rewritten' });
      const afterUpdate = one<{ c: number }>(store.db,
        "SELECT count(*) AS c FROM learnings_fts WHERE learnings_fts MATCH '\"rewritten\"'");
      assert.equal(afterUpdate.c, 1);
      store.deleteLearning(l.id);
      const afterDelete = one<{ c: number }>(store.db,
        "SELECT count(*) AS c FROM learnings_fts WHERE learnings_fts MATCH '\"rewritten\"'");
      assert.equal(afterDelete.c, 0);
    });
  });

  describe('sessions', () => {
    it('starts a session and reads it back', () => {
      const s = store.startSession('s1', 'proj');
      assert.equal(s.id, 's1');
      assert.equal(s.project, 'proj');
      assert.ok(s.started_at);
      assert.equal(store.getSession('s1')?.id, 's1');
    });

    it('ignores a duplicate session id rather than throwing', () => {
      store.startSession('dup', 'first');
      const again = store.startSession('dup', 'second');
      assert.equal(again.project, 'first', 'INSERT OR IGNORE keeps the original row');
    });

    it('endSession stamps ended_at and no-ops for an unknown id', () => {
      store.startSession('s2');
      assert.equal(store.getSession('s2')?.ended_at ?? null, null);
      store.endSession('s2');
      assert.ok(store.getSession('s2')?.ended_at);
      assert.equal(store.endSession('nope'), undefined);
    });

    it('updateSessionCounts increments the three counters', () => {
      store.startSession('s3');
      store.updateSessionCounts('s3', 2, 1, 5);
      store.updateSessionCounts('s3');
      const s = store.getSession('s3');
      assert.equal(s?.edit_count, 2);
      assert.equal(s?.corrections_count, 1);
      assert.equal(s?.prompts_count, 5);
    });

    it('explicit nulls null the counters instead of leaving them alone', () => {
      store.startSession('s4');
      store.updateSessionCounts('s4', 3, 3, 3);
      store.updateSessionCounts('s4', null as unknown as number, null as unknown as number, null as unknown as number);
      const s = store.getSession('s4');
      assert.equal(s?.edit_count, null, 'NULL + 0 stays NULL, so the default path cannot restore it');
    });

    it('getRecentSessions returns the most recent first and honours the limit', () => {
      store.startSession('r1');
      store.startSession('r2');
      const two = store.getRecentSessions(2);
      assert.equal(two.length, 2);
      assert.equal(store.getRecentSessions(0).length, 0);
    });
  });

  describe('wikis', () => {
    it('upserts, reads back and lists', () => {
      const w = store.upsertWiki({ slug: 'w', title: 'T', flavor: 'research', root_path: '/r' });
      assert.equal(w.slug, 'w');
      assert.equal(store.getWiki('w')?.title, 'T');
      assert.equal(store.listWikis().length, 1);
      assert.equal(store.getWiki('missing'), undefined);
    });

    it('updates title when the same slug is registered at the same location', () => {
      store.upsertWiki({ slug: 'w', title: 'one', flavor: 'research', root_path: '/r' });
      const w = store.upsertWiki({ slug: 'w', title: 'two', flavor: 'research', root_path: '/r' });
      assert.equal(w.title, 'two');
    });

    it('refuses to re-register a slug at a different root_path, with a plain Error', () => {
      store.upsertWiki({ slug: 'w', title: 'T', flavor: 'research', root_path: '/r' });
      let caught: unknown;
      try {
        store.upsertWiki({ slug: 'w', title: 'T', flavor: 'research', root_path: '/elsewhere' });
      } catch (err) { caught = err; }
      assert.ok(caught instanceof Error);
      assert.equal((caught as { code?: string }).code, undefined,
        'this is an application guard, not a SQLite error');
      assert.match((caught as Error).message, /already registered/);
    });

    it('lists by scope, and an empty scope returns everything', () => {
      store.upsertWiki({ slug: 'g', title: 'G', flavor: 'research', root_path: '/g' });
      store.upsertWiki({ slug: 'p', title: 'P', flavor: 'research', root_path: '/p', scope: 'project' });
      assert.equal(store.listWikis('project').length, 1);
      assert.equal(store.listWikis('' as never).length, 2,
        'an empty scope is falsy at runtime, so it widens to every wiki');
    });

    it('deleteWiki reports removal and cascades to wiki_pages', () => {
      store.upsertWiki({ slug: 'w', title: 'T', flavor: 'research', root_path: '/r' });
      store.upsertWikiPage({
        wiki_slug: 'w', rel_path: 'a.md', title: 'A', summary: null,
        content: 'body', page_type: 'note', content_hash: 'h1',
      });
      assert.equal(store.deleteWiki('w'), true);
      assert.equal(store.deleteWiki('w'), false);
      const left = one<{ c: number }>(store.db, 'SELECT count(*) AS c FROM wiki_pages');
      assert.equal(left.c, 0, 'foreign_keys=ON must cascade');
    });
  });

  describe('wiki pages', () => {
    beforeEach(() => {
      store.upsertWiki({ slug: 'w', title: 'W', flavor: 'research', root_path: '/r' });
    });

    type PageInput = Parameters<Store['upsertWikiPage']>[0];
    type PageOverrides = Partial<Record<keyof PageInput, unknown>>;

    const page = (over: PageOverrides = {}) =>
      store.upsertWikiPage({
        wiki_slug: 'w', rel_path: 'a.md', title: 'Alpha', summary: 'sum',
        content: 'the mitochondria is the powerhouse of the cell',
        page_type: 'note', content_hash: 'h1', ...over,
      } as unknown as PageInput);

    it('creates and reads a page', () => {
      const p = page();
      assert.ok(p.id > 0);
      assert.equal(store.getWikiPage('w', 'a.md')?.title, 'Alpha');
      assert.equal(store.getWikiPage('w', 'missing.md'), undefined);
    });

    it('upserts on the same wiki_slug and rel_path instead of throwing', () => {
      page();
      const again = page({ title: 'Alpha 2', content_hash: 'h2' });
      assert.equal(again.title, 'Alpha 2');
      assert.equal(store.listWikiPages('w').length, 1);
    });

    it('rejects a page whose parent wiki does not exist', () => {
      assert.equal(
        sqliteCode(() => page({ wiki_slug: 'ghost' })),
        'SQLITE_CONSTRAINT_FOREIGNKEY'
      );
    });

    it('rejects a null title', () => {
      assert.equal(sqliteCode(() => page({ title: null })), 'SQLITE_CONSTRAINT_NOTNULL');
    });

    it('searchWiki matches on content and returns a snippet and a rank', () => {
      page();
      const hits = store.searchWiki('mitochondria');
      assert.equal(hits.length, 1);
      assert.equal(typeof hits[0].snippet, 'string');
      assert.equal(typeof hits[0].rank, 'number');
      assert.ok(hits[0].rank < 0, 'bm25 is a negative score, so ascending order is best-first');
    });

    it('searchWiki scopes by wiki slug', () => {
      page();
      store.upsertWiki({ slug: 'w2', title: 'W2', flavor: 'research', root_path: '/r2' });
      store.upsertWikiPage({
        wiki_slug: 'w2', rel_path: 'b.md', title: 'Beta', summary: null,
        content: 'mitochondria again', page_type: 'note', content_hash: 'h9',
      });
      assert.equal(store.searchWiki('mitochondria', { wikiSlug: 'w2' }).length, 1);
      assert.equal(store.searchWiki('mitochondria', { wikiSlug: 'w' }).length, 1);
      assert.equal(store.searchWiki('mitochondria').length, 2);
    });

    it('searchWiki returns an empty array for a query that sanitises to nothing', () => {
      page();
      assert.deepEqual(store.searchWiki(''), []);
      assert.deepEqual(store.searchWiki('the and of'), [], 'stopword-only input is dropped');
      assert.deepEqual(store.searchWiki('mitochondria', { limit: 0 }), []);
    });

    it('searchWiki survives a query full of FTS5 metacharacters', () => {
      page();
      assert.doesNotThrow(() => store.searchWiki('NEAR(a b) OR "*'));
      assert.doesNotThrow(() => store.searchWiki('$(rm -rf)'));
    });
  });

  describe('seeds', () => {
    beforeEach(() => {
      store.upsertWiki({ slug: 'w', title: 'W', flavor: 'research', root_path: '/r' });
    });

    type SeedInput = Parameters<Store['enqueueSeed']>[0];

    const seedRow = (query: string, depth = 0, status?: string) =>
      store.enqueueSeed({
        wiki_slug: 'w', query, depth,
        ...(status ? { status: status as SeedInput['status'] } : {}),
      } as SeedInput);

    it('enqueues with a pending default and reads the next one', () => {
      const s = seedRow('first');
      assert.equal(s.status, 'pending');
      assert.equal(store.nextPendingSeed('w')?.query, 'first');
    });

    it('rejects a seed whose wiki does not exist', () => {
      assert.equal(
        sqliteCode(() => store.enqueueSeed({ wiki_slug: 'ghost', query: 'q', depth: 0 } as SeedInput)),
        'SQLITE_CONSTRAINT_FOREIGNKEY'
      );
    });

    it('rejects a seed with no depth', () => {
      assert.equal(
        sqliteCode(() => store.enqueueSeed({ wiki_slug: 'w', query: 'q', depth: undefined as unknown as number } as unknown as SeedInput)),
        'SQLITE_CONSTRAINT_NOTNULL'
      );
    });

    it('rejects a seed whose parent_id does not exist', () => {
      assert.equal(
        sqliteCode(() => store.enqueueSeed({ wiki_slug: 'w', query: 'q', depth: 0, parent_id: 9999 } as SeedInput)),
        'SQLITE_CONSTRAINT_FOREIGNKEY'
      );
    });

    it('orders pending seeds by depth before age', () => {
      seedRow('deep', 2);
      seedRow('shallow', 1);
      assert.equal(store.nextPendingSeed('w')?.query, 'shallow');
    });

    it('nextPendingSeed does not claim, claimPendingSeed does', () => {
      seedRow('one');
      seedRow('two');
      assert.equal(store.nextPendingSeed('w')?.query, 'one');
      assert.equal(store.nextPendingSeed('w')?.query, 'one', 'peek must not mutate');
      assert.equal(store.claimPendingSeed('w')?.query, 'one');
      assert.equal(store.claimPendingSeed('w')?.query, 'two');
      assert.equal(store.claimPendingSeed('w'), undefined);
    });

    it('claimPendingSeed skips seeds already marked active', () => {
      seedRow('a', 0, 'active');
      seedRow('b');
      assert.equal(store.claimPendingSeed('w')?.query, 'b');
    });

    it('setSeedStatus stores an arbitrary status without validating it', () => {
      const s = seedRow('q');
      store.setSeedStatus(s.id, 'BOGUS' as never);
      const row = one<{ status: string }>(store.db, 'SELECT status FROM wiki_seeds WHERE id = ?', s.id);
      assert.equal(row.status, 'BOGUS', 'there is no CHECK constraint or enum on status');
    });

    it('setSeedStatus no-ops for an unknown id', () => {
      assert.equal(store.setSeedStatus(9999, 'pending'), undefined);
    });
  });

  describe('lifecycle', () => {
    it('close is idempotent and later calls fail loudly', () => {
      const s = createStore(':memory:');
      s.close();
      assert.doesNotThrow(() => s.close());
      assert.throws(() => s.getAllLearnings(), (err: Error) =>
        err instanceof TypeError && /not open/.test(err.message));
    });

    it('exposes the raw handle used by the search domain', () => {
      assert.equal(one<{ c: number }>(store.db, 'SELECT count(*) AS c FROM learnings').c, 0);
    });
  });
});
