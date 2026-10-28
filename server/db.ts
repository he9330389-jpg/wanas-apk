// WANAS storage layer.
// - DATABASE_URL set -> PostgreSQL (Supabase / Neon / any Postgres). Data survives restarts and redeploys.
// - DATABASE_URL empty -> JSON file under DATA_DIR (local development / quick tests only).
// Both modes expose the same small API so server.ts does not care which one is active.
import fs from 'fs';
import path from 'path';
import pg from 'pg';

export type Collection =
  | 'users'
  | 'posts'
  | 'stories'
  | 'rooms'
  | 'room_messages'
  | 'direct_messages'
  | 'news';

export const COLLECTIONS: Collection[] = [
  'users',
  'posts',
  'stories',
  'rooms',
  'room_messages',
  'direct_messages',
  'news',
];

export interface Credential {
  userId: string;
  email: string | null;
  phone: string | null;
  passwordHash: string;
}

interface Row {
  id: string;
  owner: string | null;
  ts: number;
  data: any;
}

export interface Store {
  mode: 'postgres' | 'file';
  init(): Promise<void>;
  /** newest first when `newestFirst`, otherwise oldest first */
  load(c: Collection, opts?: { limit?: number; newestFirst?: boolean }): Promise<any[]>;
  count(c: Collection): Promise<number>;
  put(c: Collection, id: string, data: any, owner?: string | null, ts?: number): void;
  remove(c: Collection, id: string): void;
  removeWhere(c: Collection, owner: string): void;
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
  findCredential(q: { email?: string | null; phone?: string | null; userId?: string }): Promise<Credential | null>;
  putCredential(c: Credential): Promise<void>;
  flush(): Promise<void>;
}

const table = (c: Collection) => `wanas_${c}`;

/* -------------------------------------------------------------------------- */
/* PostgreSQL */
/* -------------------------------------------------------------------------- */

export function schemaSql(): string {
  const parts: string[] = [];
  for (const c of COLLECTIONS) {
    const t = table(c);
    parts.push(
      `create table if not exists ${t} ( id text primary key, owner text, ts bigint not null default 0, data jsonb not null );`,
      `create index if not exists ${t}_ts_idx on ${t} (ts desc);`,
      `create index if not exists ${t}_owner_idx on ${t} (owner);`,
      // Supabase exposes every table in the public schema through its REST API.
      // RLS with no policies means the public anon key can read/write nothing;
      // the WANAS server connects as the database owner and bypasses RLS.
      `alter table ${t} enable row level security;`
    );
  }
  parts.push(
    `create table if not exists wanas_credentials ( user_id text primary key, email text unique, phone text unique, password_hash text not null, created_at timestamptz not null default now() );`,
    `alter table wanas_credentials enable row level security;`,
    `create table if not exists wanas_meta ( key text primary key, value text not null );`,
    `alter table wanas_meta enable row level security;`
  );
  return parts.join('\n');
}

class PgStore implements Store {
  mode = 'postgres' as const;
  private pool: pg.Pool;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(url: string) {
    const needsSsl =
      /supabase\.(co|com)|pooler\.supabase|neon\.tech|render\.com/i.test(url) ||
      process.env.PGSSL === '1';
    this.pool = new pg.Pool({
      connectionString: url,
      max: Number(process.env.PG_POOL_MAX) || 5,
      ssl: needsSsl && process.env.PGSSL !== '0' ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 15000,
    });
    this.pool.on('error', (err) => console.error('[db] idle client error:', err.message));
  }

  async init() {
    await this.pool.query('select 1');
    await this.pool.query(schemaSql());
  }

  async load(c: Collection, opts: { limit?: number; newestFirst?: boolean } = {}) {
    const order = opts.newestFirst === false ? 'asc' : 'desc';
    const limit = opts.limit ? `limit ${Math.floor(opts.limit)}` : '';
    const r = await this.pool.query(
      `select data from ${table(c)} order by ts ${order}, id ${order} ${limit}`
    );
    return r.rows.map((x) => x.data);
  }

  async count(c: Collection) {
    const r = await this.pool.query(`select count(*)::int as n from ${table(c)}`);
    return r.rows[0].n as number;
  }

  private enqueue(sql: string, params: unknown[]) {
    this.queue = this.queue
      .then(() => this.pool.query(sql, params as any[]))
      .catch((err) => console.error('[db] write failed:', err.message));
  }

  put(c: Collection, id: string, data: any, owner: string | null = null, ts = Date.now()) {
    this.enqueue(
      `insert into ${table(c)} (id, owner, ts, data) values ($1,$2,$3,$4::jsonb) on conflict (id) do update set owner = excluded.owner, ts = excluded.ts, data = excluded.data`,
      [id, owner, ts, JSON.stringify(data)]
    );
  }

  remove(c: Collection, id: string) {
    this.enqueue(`delete from ${table(c)} where id = $1`, [id]);
  }

  removeWhere(c: Collection, owner: string) {
    this.enqueue(`delete from ${table(c)} where owner = $1`, [owner]);
  }

  async getMeta(key: string) {
    const r = await this.pool.query('select value from wanas_meta where key = $1', [key]);
    return r.rows[0]?.value ?? null;
  }

  async setMeta(key: string, value: string) {
    await this.pool.query(
      `insert into wanas_meta (key, value) values ($1,$2) on conflict (key) do update set value = excluded.value`,
      [key, value]
    );
  }

  async findCredential(q: { email?: string | null; phone?: string | null; userId?: string }) {
    const r = await this.pool.query(
      `select user_id, email, phone, password_hash from wanas_credentials where ($1::text is not null and user_id = $1) or ($2::text is not null and email = $2) or ($3::text is not null and phone = $3) limit 1`,
      [q.userId ?? null, q.email ?? null, q.phone ?? null]
    );
    const x = r.rows[0];
    return x
      ? { userId: x.user_id, email: x.email, phone: x.phone, passwordHash: x.password_hash }
      : null;
  }

  async putCredential(c: Credential) {
    await this.pool.query(
      `insert into wanas_credentials (user_id, email, phone, password_hash) values ($1,$2,$3,$4) on conflict (user_id) do update set email = excluded.email, phone = excluded.phone, password_hash = excluded.password_hash`,
      [c.userId, c.email, c.phone, c.passwordHash]
    );
  }

  async flush() {
    await this.queue;
  }
}

/* -------------------------------------------------------------------------- */
/* JSON file fallback */
/* -------------------------------------------------------------------------- */

interface FileShape {
  collections: Record<string, Row[]>;
  credentials: Credential[];
  meta: Record<string, string>;
}

class FileStore implements Store {
  mode = 'file' as const;
  private file: string;
  private state: FileShape = { collections: {}, credentials: [], meta: {} };
  private timer: NodeJS.Timeout | null = null;

  constructor(private dataDir: string) {
    this.file = path.join(dataDir, 'wanas_store.json');
  }

  async init() {
    for (const c of COLLECTIONS) this.state.collections[c] = [];
    try {
      if (fs.existsSync(this.file)) {
        const parsed = JSON.parse(fs.readFileSync(this.file, 'utf-8')) as FileShape;
        this.state = {
          collections: { ...this.state.collections, ...(parsed.collections || {}) },
          credentials: parsed.credentials || [],
          meta: parsed.meta || {},
        };
      }
    } catch (err) {
      console.error('[db] failed to read store file:', err);
    }
  }

  private schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.writeNow();
    }, 400);
  }

  private writeNow() {
    try {
      fs.mkdirSync(this.dataDir, { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.state), 'utf-8');
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error('[db] failed to write store file:', err);
    }
  }

  async load(c: Collection, opts: { limit?: number; newestFirst?: boolean } = {}) {
    const rows = [...(this.state.collections[c] || [])].sort((a, b) => a.ts - b.ts);
    if (opts.newestFirst !== false) rows.reverse();
    return (opts.limit ? rows.slice(0, opts.limit) : rows).map((r) => r.data);
  }

  async count(c: Collection) {
    return (this.state.collections[c] || []).length;
  }

  put(c: Collection, id: string, data: any, owner: string | null = null, ts = Date.now()) {
    const rows = this.state.collections[c] || (this.state.collections[c] = []);
    const i = rows.findIndex((r) => r.id === id);
    const row: Row = { id, owner, ts, data: JSON.parse(JSON.stringify(data)) };
    if (i === -1) rows.push(row);
    else rows[i] = row;
    this.schedule();
  }

  remove(c: Collection, id: string) {
    const rows = this.state.collections[c] || [];
    this.state.collections[c] = rows.filter((r) => r.id !== id);
    this.schedule();
  }

  removeWhere(c: Collection, owner: string) {
    const rows = this.state.collections[c] || [];
    this.state.collections[c] = rows.filter((r) => r.owner !== owner);
    this.schedule();
  }

  async getMeta(key: string) {
    return this.state.meta[key] ?? null;
  }

  async setMeta(key: string, value: string) {
    this.state.meta[key] = value;
    this.schedule();
  }

  async findCredential(q: { email?: string | null; phone?: string | null; userId?: string }) {
    return (
      this.state.credentials.find(
        (c) =>
          (q.userId && c.userId === q.userId) ||
          (q.email && c.email === q.email) ||
          (q.phone && c.phone === q.phone)
      ) || null
    );
  }

  async putCredential(c: Credential) {
    const i = this.state.credentials.findIndex((x) => x.userId === c.userId);
    if (i === -1) this.state.credentials.push(c);
    else this.state.credentials[i] = c;
    this.schedule();
  }

  async flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.writeNow();
  }
}

export function createStore(dataDir: string): Store {
  const url = (process.env.DATABASE_URL || '').trim();
  if (url) return new PgStore(url);
  return new FileStore(dataDir);
  }
