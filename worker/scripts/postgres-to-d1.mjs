#!/usr/bin/env node
/**
 * One-off move of FlowState data from the NestJS backend's Postgres into D1.
 *
 *   DATABASE_URL="postgres://…" node scripts/postgres-to-d1.mjs > flowstate-data.sql
 *   npx wrangler d1 execute flowstate --remote --file=flowstate-data.sql
 *
 * Read-only against Postgres: it only runs SELECTs, through `psql` (which
 * must be installed). Output converts each column to the D1 schema's storage
 * (migrations/0001_initial.sql): timestamps → ISO-8601 UTC text, JSON and
 * arrays → JSON text, booleans → 0/1. Run it against an empty D1 database —
 * rows that already exist would fail on their primary key.
 */
import { execFileSync } from 'node:child_process';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL to the Postgres database to export.');
  process.exit(1);
}

// Parents before children, so every foreign key has its target. The one
// self-reference (refresh_tokens.replaced_by_token_id) is covered by
// deferring foreign-key checks to the end of the import.
const TABLES = {
  users: { timestamps: ['created_at', 'updated_at'] },
  workflows: { timestamps: ['created_at', 'updated_at'] },
  triggers: { timestamps: ['created_at', 'updated_at'], json: ['config'], bool: ['enabled'] },
  conditions: { timestamps: ['created_at', 'updated_at'], json: ['expression'] },
  actions: { timestamps: ['created_at', 'updated_at'], json: ['config'] },
  connections: { timestamps: ['created_at', 'updated_at', 'access_token_expires_at'], json: ['scopes'] },
  refresh_tokens: { timestamps: ['created_at', 'expires_at', 'revoked_at'] },
  webhook_events: { timestamps: ['created_at', 'received_at'], json: ['payload'] },
  polling_events: { timestamps: ['polled_at'], json: ['response_snapshot'], bool: ['changed'] },
  workflow_executions: { timestamps: ['created_at', 'started_at', 'finished_at'], json: ['input', 'output'] },
  action_executions: { timestamps: ['created_at', 'started_at', 'finished_at'], json: ['input', 'output'] },
  audit_logs: { timestamps: ['created_at'], json: ['metadata'] },
  telegram_users: { timestamps: ['created_at', 'updated_at'], bool: ['is_active'] },
};

/** Postgres gives `timestamp without time zone` as "2026-07-29T12:14:20.658" — UTC, per Prisma. */
function toIsoUtc(value) {
  const normalised = value.includes('.') ? value : `${value}.000`;
  return `${normalised.padEnd(23, '0').slice(0, 23)}Z`;
}

function literal(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function convert(table, row) {
  const spec = TABLES[table];
  const out = {};
  for (const [column, value] of Object.entries(row)) {
    if (value === null) out[column] = null;
    else if (spec.timestamps?.includes(column)) out[column] = toIsoUtc(value);
    else if (spec.json?.includes(column)) out[column] = JSON.stringify(value);
    else if (spec.bool?.includes(column)) out[column] = value ? 1 : 0;
    else out[column] = value;
  }
  return out;
}

const lines = [
  '-- FlowState data exported from Postgres by scripts/postgres-to-d1.mjs',
  'PRAGMA defer_foreign_keys = on;',
];
const counts = {};

for (const table of Object.keys(TABLES)) {
  // row_to_json keeps JSON columns as JSON and arrays as arrays; one row per line.
  const output = execFileSync('psql', [url, '-At', '-c', `SELECT row_to_json(t) FROM "${table}" t`], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 512,
  });
  const rows = output
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  counts[table] = rows.length;
  for (const raw of rows) {
    const row = convert(table, raw);
    const columns = Object.keys(row);
    lines.push(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((c) => literal(row[c])).join(', ')});`,
    );
  }
}

process.stdout.write(`${lines.join('\n')}\n`);
console.error(
  `Exported: ${Object.entries(counts)
    .map(([t, n]) => `${t} ${n}`)
    .join(', ')}`,
);
