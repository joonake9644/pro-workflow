import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { spawnSync } from 'child_process';
import { getDefaultDbPath, initializeDatabase } from '../index';

const TSX_CLI = path.join(__dirname, '..', '..', '..', 'node_modules', 'tsx', 'dist', 'cli.mjs');

describe('getDefaultDbPath', () => {
  it('resolves to ~/.pro-workflow/data.db', () => {
    assert.equal(getDefaultDbPath(), path.join(os.homedir(), '.pro-workflow', 'data.db'));
  });

  it('returns an absolute path', () => {
    assert.ok(path.isAbsolute(getDefaultDbPath()));
  });

  it('is stable across calls', () => {
    assert.equal(getDefaultDbPath(), getDefaultDbPath());
  });
});

describe('initializeDatabase', () => {
  // The app directory is captured from os.homedir() at module load, so an in-process
  // assertion cannot isolate it. A child process with a faked home is the only way to
  // observe what gets created without touching the real home directory.
  it('does not create ~/.pro-workflow when given a different path', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pro-workflow-030-'));
    const fakeHome = path.join(root, 'home');
    const dbPath = path.join(root, 'nested', 'data.db');
    fs.mkdirSync(fakeHome, { recursive: true });

    const probe = `
      const os = require('os');
      const fs = require('fs');
      os.homedir = () => ${JSON.stringify(fakeHome)};
      const { initializeDatabase } = require(${JSON.stringify(path.join(__dirname, '..', 'index.ts'))});
      const db = initializeDatabase(${JSON.stringify(dbPath)});
      db.close();
      console.log(JSON.stringify({
        homeCreated: fs.existsSync(path.join(${JSON.stringify(fakeHome)}, '.pro-workflow')),
        dbParentCreated: fs.existsSync(${JSON.stringify(path.dirname(dbPath))}),
        dbFileCreated: fs.existsSync(${JSON.stringify(dbPath)}),
      }));
    `;
    const res = spawnSync(process.execPath, [TSX_CLI, '-e', probe], { encoding: 'utf8' });
    assert.equal(res.status, 0, res.stderr);
    const seen = JSON.parse(res.stdout.trim());
    assert.equal(seen.homeCreated, false,
      'a caller who pointed the store at their own path must not get a stray home directory');
    assert.equal(seen.dbParentCreated, true,
      'the directory the caller actually asked for must be created');
    assert.equal(seen.dbFileCreated, true);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('calls mkdir for an in-memory database only when the target is missing', () => {
    // `path.dirname(':memory:')` resolves to the cwd, which already exists — so asserting
    // on the resulting directory cannot tell "guarded" from "unguarded". Count the calls.
    const probe = `
      const fs = require('fs');
      const real = fs.mkdirSync;
      const calls = [];
      fs.mkdirSync = (p, o) => { calls.push(p); return real(p, o); };
      const { initializeDatabase } = require(${JSON.stringify(path.join(__dirname, '..', 'index.ts'))});
      initializeDatabase(':memory:').close();
      console.log(JSON.stringify(calls));
    `;
    const res = spawnSync(process.execPath, [TSX_CLI, '-e', probe], { encoding: 'utf8' });
    assert.equal(res.status, 0, res.stderr);
    const calls = JSON.parse(res.stdout.trim()) as string[];
    assert.deepEqual(calls, [],
      'an in-memory store is not a path, so no directory work may be attempted at all');

    // `path.dirname(':memory:')` is the cwd, which already exists, so the mkdir call alone
    // cannot distinguish a guarded run from an unguarded one. Probe the real consequence:
    // an unguarded run would derive a directory from ':memory:' and try to create it.
    const probe2 = `
      const path = require('path');
      const { initializeDatabase } = require(${JSON.stringify(path.join(__dirname, '..', 'index.ts'))});
      const db = initializeDatabase(':memory:');
      console.log(JSON.stringify({ memory: db.memory }));
      db.close();
    `;
    const res2 = spawnSync(process.execPath, [TSX_CLI, '-e', probe2], { encoding: 'utf8' });
    assert.equal(res2.status, 0, res2.stderr);
    assert.deepEqual(JSON.parse(res2.stdout.trim()), { memory: true },
      ':memory: must stay an in-memory database, not be resolved against the filesystem');
  });

  it('stays idempotent when the parent directory already exists', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pro-workflow-030b-'));
    try {
      const p = path.join(root, 'data.db');
      const first = initializeDatabase(p);
      first.close();
      const second = initializeDatabase(p);
      second.close();
      assert.ok(fs.existsSync(p));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

