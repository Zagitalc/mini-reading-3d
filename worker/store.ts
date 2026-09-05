import type { D1Database } from '@cloudflare/workers-types';
import type { RoadEvent } from '../shared/types';

export class CloudStore {
  constructor(public db: D1Database) {}

  async state<T>(id: string): Promise<T | undefined> {
    const row = await this.db.prepare('SELECT body FROM state WHERE id=?').bind(id).first<{body:string}>();
    return row ? JSON.parse(row.body) : undefined;
  }

  stateStatement(id: string, value: unknown) {
    return this.db.prepare('INSERT INTO state VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body')
      .bind(id, JSON.stringify(value));
  }

  async items<T>(feed: string): Promise<T[]> {
    const result = await this.db.prepare('SELECT body FROM feed_items WHERE feed=?').bind(feed).all<{body:string}>();
    return result.results.flatMap(row => JSON.parse(row.body));
  }

  async saveFeed(feed: string, items: {id:string}[], health: unknown, routes: Record<string, unknown> = {}) {
    // Chunk snapshots to limit daily writes while staying below D1's 2 MB row limit.
    const chunks = (values: unknown[]) => {
      const output: string[] = []; let current: string[] = []; let size = 2;
      for (const value of values) {
        const encoded = JSON.stringify(value);
        const bytes = new TextEncoder().encode(encoded).length;
        if (bytes > 1024 * 1024) throw Error('Feed item exceeds storage budget');
        if (current.length && size + bytes > 128 * 1024) { output.push(`[${current.join(',')}]`); current = []; size = 2; }
        current.push(encoded); size += bytes + 1;
      }
      if (current.length) output.push(`[${current.join(',')}]`);
      if (output.length > 10) throw Error('Feed snapshot exceeds free-plan storage budget');
      return output;
    };
    const routeFeed = `${feed}:routes`;
    await this.db.batch([
      this.db.prepare('DELETE FROM feed_items WHERE feed IN (?,?)').bind(feed, routeFeed),
      ...chunks(items).map((body,id) => this.db.prepare('INSERT INTO feed_items VALUES(?,?,?)').bind(feed, String(id), body)),
      ...chunks(Object.entries(routes).map(([id,route])=>({id,route}))).map((body,id) => this.db.prepare('INSERT INTO feed_items VALUES(?,?,?)').bind(routeFeed, String(id), body)),
      this.stateStatement(feed, health),
    ]);
  }

  async active(now = Date.now()): Promise<RoadEvent[]> {
    const result = await this.db.prepare("SELECT body FROM road_events WHERE status IN ('active','planned') AND (end_at IS NULL OR julianday(end_at)>=julianday(?)) ORDER BY observed_at DESC")
      .bind(new Date(now).toISOString()).all<{body:string}>();
    return result.results.map(row => JSON.parse(row.body));
  }

  async seen(id: string) {
    return !!await this.db.prepare('SELECT id FROM sns_messages WHERE id=?').bind(id).first();
  }

  async accept(id: string, event?: RoadEvent) {
    const statements = [];
    if (event) statements.push(this.db.prepare(`INSERT INTO road_events(id,observed_at,version,status,end_at,body) VALUES(?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET observed_at=excluded.observed_at,version=excluded.version,status=excluded.status,end_at=excluded.end_at,body=excluded.body
      WHERE julianday(excluded.observed_at)>julianday(road_events.observed_at)
      OR (julianday(excluded.observed_at)=julianday(road_events.observed_at) AND excluded.version>road_events.version)`)
      .bind(event.id,event.observedAt,event.version,event.status,event.actualEnd??event.plannedEnd??null,JSON.stringify(event)));
    statements.push(
      this.db.prepare('INSERT OR IGNORE INTO sns_messages VALUES(?,?)').bind(id, Date.now()),
      this.stateStatement('roadworks', {confirmed: true, lastSuccess: new Date().toISOString()}),
    );
    await this.db.batch(statements);
  }
}
