import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface ProWorkflowConfig {
  dbPath: string;
}

const DEFAULT_DB_DIR = path.join(os.homedir(), '.pro-workflow');
const DEFAULT_DB_PATH = path.join(DEFAULT_DB_DIR, 'data.db');

export function getDefaultDbPath(): string {
  return DEFAULT_DB_PATH;
}

export function ensureDbDir(dir: string = DEFAULT_DB_DIR): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function initializeDatabase(dbPath: string = DEFAULT_DB_PATH): Database.Database {
  // Only the directory the caller actually asked for. Creating the home app directory
  // as a side effect of an unrelated dbPath litters $HOME and breaks test isolation.
  // ':memory:' needs no special case: its dirname is the cwd, which existsSync already
  // reports as present, so no directory is created for it either way.
  ensureDbDir(path.dirname(path.resolve(dbPath)));

  const db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  try {
    const candidates = [
      path.join(__dirname, 'schema.sql'),
      path.join(__dirname, '..', '..', 'src', 'db', 'schema.sql'),
    ];
    const schemaPath = candidates.find(p => fs.existsSync(p));
    if (!schemaPath) {
      throw new Error(`pro-workflow: schema.sql not found. Tried: ${candidates.join(', ')}. Run: npm run build`);
    }
    const schema = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schema);
  } catch (err) {
    db.close();
    throw err;
  }

  return db;
}

if (require.main === module) {
  const db = initializeDatabase();
  console.log(`Database initialized at: ${DEFAULT_DB_PATH}`);
  db.close();
}
