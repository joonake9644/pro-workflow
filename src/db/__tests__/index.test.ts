import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'os';
import * as path from 'path';
import { getDefaultDbPath } from '../index';

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
