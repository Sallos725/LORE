import {DatabaseSync} from 'node:sqlite';
import {createHash, randomUUID} from 'node:crypto';
import {boundedString, requireValue, revision, scopeKey, validatePage, compileContext, canRead} from '../shared/core.mjs';

export class Store {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS scopes (scope TEXT PRIMARY KEY, revision INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sources (scope TEXT, id TEXT, revision INTEGER, text TEXT, deleted INTEGER, PRIMARY KEY(scope,id));
      CREATE TABLE IF NOT EXISTS source_versions (scope TEXT, id TEXT, revision INTEGER, data TEXT, PRIMARY KEY(scope,id,revision));
      CREATE TABLE IF NOT EXISTS pages (scope TEXT, id TEXT, source TEXT, data TEXT NOT NULL, PRIMARY KEY(scope,id));
      CREATE TABLE IF NOT EXISTS history (scope TEXT, id TEXT, revision INTEGER, data TEXT, PRIMARY KEY(scope,id,revision));
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, scope TEXT, eventId TEXT, hash TEXT, payload TEXT, state TEXT, attempts INTEGER DEFAULT 0, error TEXT, createdAt INTEGER, updatedAt INTEGER, UNIQUE(scope,eventId));
      CREATE INDEX IF NOT EXISTS jobs_queue ON jobs(state,createdAt);
      CREATE INDEX IF NOT EXISTS pages_source ON pages(scope,source);`);
    this.db.prepare("UPDATE jobs SET state='queued' WHERE state='running'").run();
  }
  close() { this.db.close(); }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  head(scope) { return this.db.prepare('SELECT revision FROM scopes WHERE scope=?').get(scopeKey(scope))?.revision ?? 0; }
  save(key, page, source = null) {
    this.db.prepare('INSERT OR REPLACE INTO pages VALUES (?,?,?,?)').run(key, page.id, source, JSON.stringify(page));
    this.db.prepare('INSERT INTO history VALUES (?,?,?,?)').run(key, page.id, page.revision, JSON.stringify(page));
  }
  page(scope, id, audience = 'world') {
    const row = this.db.prepare('SELECT data FROM pages WHERE scope=? AND id=?').get(scopeKey(scope), id);
    const page = row && JSON.parse(row.data);
    requireValue(page && canRead(page, audience), 'Page not found', 404);
    return page;
  }
  list(scope, {query = '', offset = 0, limit = 20, audience = 'world', includeBody = false} = {}) {
    boundedString(query, 'query', 200, true);
    requireValue(Number.isSafeInteger(offset) && offset >= 0 && Number.isInteger(limit) && limit >= 1 && limit <= 128, 'Invalid pagination');
    const rows = this.db.prepare(`SELECT data FROM pages WHERE scope=?
      AND (json_extract(data,'$.visibility')='public' OR json_extract(data,'$.visibility')=?)
      AND json_extract(data,'$.active')=1
      AND instr(lower(json_extract(data,'$.title') || ' ' || json_extract(data,'$.body')),lower(?))>0
      ORDER BY json_extract(data,'$.pinned') DESC,id LIMIT ? OFFSET ?`).all(scopeKey(scope), audience, query, limit + 1, offset);
    const hasMore = rows.length > limit;
    const pages = rows.slice(0, limit).map(row => { const p = JSON.parse(row.data); if (!includeBody) { delete p.body; delete p.evidence; } return p; });
    return {pages, hasMore, nextOffset: hasMore ? offset + limit : null, scopeRevision: this.head(scope)};
  }
  put(scope, id, input, expectedRevision, audience = 'world') {
    boundedString(id, 'page ID');
    requireValue(!id.startsWith('source:'), 'Reserved page ID');
    revision(expectedRevision);
    const valid = validatePage(input), key = scopeKey(scope);
    requireValue(canRead(valid, audience), 'Visibility is outside credential audience', 403);
    return this.transaction(() => {
      const row = this.db.prepare('SELECT data FROM pages WHERE scope=? AND id=?').get(key, id);
      const previous = row && JSON.parse(row.data);
      requireValue(!previous || canRead(previous, audience), 'Page not found', 404);
      requireValue((previous?.revision ?? 0) === expectedRevision, 'Page revision conflict', 409);
      const page = {...valid, id, revision: expectedRevision + 1, origin: 'manual', evidence: [], active: true};
      this.save(key, page);
      return page;
    });
  }
  history(scope, id, audience = 'world', offset = 0) {
    this.page(scope, id, audience);
    requireValue(Number.isSafeInteger(offset) && offset >= 0, 'Invalid offset');
    return this.db.prepare('SELECT data FROM history WHERE scope=? AND id=? ORDER BY revision DESC LIMIT 20 OFFSET ?')
      .all(scopeKey(scope), id, offset).map(r => JSON.parse(r.data)).filter(p => canRead(p, audience));
  }
  context(scope, options = {}) {
    const candidates = this.list(scope, {...options, offset: 0, limit: 128, includeBody: true});
    const pending = this.db.prepare("SELECT count(*) AS n FROM jobs WHERE scope=? AND state IN ('queued','running','failed','cancelled')").get(scopeKey(scope)).n;
    return {...compileContext(candidates.pages, options), scopeRevision: candidates.scopeRevision, pendingJobs: pending, fresh: pending === 0, candidateLimitReached: candidates.hasMore};
  }
  source(scope, id, rev, audience = 'world') {
    revision(rev);
    const row = this.db.prepare('SELECT data FROM source_versions WHERE scope=? AND id=? AND revision=?').get(scopeKey(scope), id, rev);
    const value = row && JSON.parse(row.data);
    requireValue(value && canRead(value, audience), 'Source not found', 404);
    return value;
  }
  enqueue(scope, event, audience = 'world') {
    const key = scopeKey(scope);
    boundedString(event?.eventId, 'eventId'); revision(event.baseRevision);
    requireValue(Array.isArray(event.changes) && event.changes.length > 0 && event.changes.length <= 32, 'Expected 1–32 changes');
    const ids = new Set();
    for (const change of event.changes) {
      requireValue(change && typeof change === 'object' && !Array.isArray(change), 'Invalid change');
      boundedString(change.id, 'message ID'); revision(change.revision);
      requireValue(change.revision > 0 && !ids.has(change.id), 'Invalid or duplicate message revision'); ids.add(change.id);
      requireValue(['upsert', 'delete'].includes(change.op), 'Invalid change operation');
      boundedString(change.visibility, 'visibility');
      requireValue(canRead(change, audience), 'Visibility is outside credential audience', 403);
      if (change.op === 'upsert') {
        boundedString(change.text, 'source text', 16384);
        requireValue(Buffer.byteLength(change.text) <= 16384, 'Source too large', 413);
      }
    }
    const payload = JSON.stringify(event), hash = createHash('sha256').update(payload).digest('hex');
    requireValue(Buffer.byteLength(payload) <= 131072, 'Event too large', 413);
    return this.transaction(() => {
      const old = this.db.prepare('SELECT id,hash FROM jobs WHERE scope=? AND eventId=?').get(key, event.eventId);
      if (old) { requireValue(old.hash === hash, 'Event ID reused with different payload', 409); return this.job(scope, old.id); }
      requireValue(this.head(scope) === event.baseRevision, 'Scope revision conflict', 409);
      const pending = this.db.prepare("SELECT count(*) AS n FROM jobs WHERE state IN ('queued','running')").get().n;
      requireValue(pending < 1000, 'Queue full', 503);
      for (const change of event.changes) {
        const source = this.db.prepare('SELECT revision FROM sources WHERE scope=? AND id=?').get(key, change.id);
        requireValue(change.revision > (source?.revision ?? 0), 'Message revision conflict', 409);
        this.db.prepare('INSERT INTO source_versions VALUES (?,?,?,?)').run(key, change.id, change.revision, JSON.stringify(change));
        this.db.prepare('INSERT OR REPLACE INTO sources VALUES (?,?,?,?,?)').run(key, change.id, change.revision, change.op === 'delete' ? '' : change.text, Number(change.op === 'delete'));
        const rows = this.db.prepare('SELECT data FROM pages WHERE scope=? AND source=?').all(key, change.id);
        for (const row of rows) {
          const page = JSON.parse(row.data);
          if (page.active) this.save(key, {...page, active: false, revision: page.revision + 1}, change.id);
        }
      }
      this.db.prepare('INSERT OR REPLACE INTO scopes VALUES (?,?)').run(key, event.baseRevision + 1);
      const id = randomUUID(), now = Date.now();
      this.db.prepare("INSERT INTO jobs(id,scope,eventId,hash,payload,state,createdAt,updatedAt) VALUES (?,?,?,?,?,'queued',?,?)").run(id, key, event.eventId, hash, payload, now, now);
      return this.job(scope, id);
    });
  }
  job(scope, id) {
    const row = this.db.prepare('SELECT id,eventId,state,attempts,error,createdAt,updatedAt FROM jobs WHERE scope=? AND id=?').get(scopeKey(scope), id);
    requireValue(row, 'Job not found', 404); return row;
  }
  cancel(scope, id) {
    this.job(scope, id);
    this.db.prepare("UPDATE jobs SET state='cancelled',updatedAt=? WHERE scope=? AND id=? AND state='queued'").run(Date.now(), scopeKey(scope), id);
    return this.job(scope, id);
  }
  runOne() {
    const job = this.db.prepare("SELECT * FROM jobs WHERE state='queued' ORDER BY createdAt,id LIMIT 1").get();
    if (!job) return false;
    this.db.prepare("UPDATE jobs SET state='running',attempts=attempts+1,updatedAt=? WHERE id=?").run(Date.now(), job.id);
    try {
      this.transaction(() => {
        const event = JSON.parse(job.payload);
        for (const change of event.changes) {
          if (change.op === 'delete') continue;
          const source = this.db.prepare('SELECT * FROM sources WHERE scope=? AND id=?').get(job.scope, change.id);
          if (!source || source.deleted || source.revision !== change.revision) continue;
          const id = 'source:' + createHash('sha256').update(change.id).digest('hex');
          const row = this.db.prepare('SELECT data FROM pages WHERE scope=? AND id=?').get(job.scope, id);
          const old = row && JSON.parse(row.data);
          if (old?.pinned || old?.origin === 'manual') continue;
          this.save(job.scope, {
            id, title: `원문 ${change.id}`.slice(0,160), kind: 'event', body: change.text,
            visibility: change.visibility, pinned: false, active: true, origin: 'source-quote',
            revision: (old?.revision ?? 0) + 1, evidence: [{messageId: change.id, revision: change.revision}],
          }, change.id);
        }
        this.db.prepare("UPDATE jobs SET state='completed',error=NULL,updatedAt=? WHERE id=?").run(Date.now(), job.id);
      });
    } catch {
      this.db.prepare('UPDATE jobs SET state=?,error=?,updatedAt=? WHERE id=?').run(job.attempts + 1 >= 3 ? 'failed' : 'queued', 'Derivation failed; inspect storage health', Date.now(), job.id);
    }
    return true;
  }
}
