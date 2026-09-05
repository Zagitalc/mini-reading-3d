import{DatabaseSync}from'node:sqlite';import type{RoadEvent}from'../shared/types';
export class RoadEventStore{
 db:DatabaseSync;
 constructor(path:string){this.db=new DatabaseSync(path);this.db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS road_events (id TEXT PRIMARY KEY, observed_at TEXT NOT NULL, version INTEGER NOT NULL, status TEXT NOT NULL, end_at TEXT, body TEXT NOT NULL); CREATE INDEX IF NOT EXISTS idx_road_events_status_end ON road_events(status,end_at); CREATE TABLE IF NOT EXISTS sns_messages (id TEXT PRIMARY KEY, received_at INTEGER NOT NULL); PRAGMA optimize;`);}
 upsert(e:RoadEvent){return this.db.prepare(`INSERT INTO road_events(id,observed_at,version,status,end_at,body) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET observed_at=excluded.observed_at,version=excluded.version,status=excluded.status,end_at=excluded.end_at,body=excluded.body WHERE julianday(excluded.observed_at)>julianday(road_events.observed_at) OR (julianday(excluded.observed_at)=julianday(road_events.observed_at) AND excluded.version>road_events.version)`).run(e.id,e.observedAt,e.version,e.status,e.actualEnd??e.plannedEnd??null,JSON.stringify(e)).changes>0;}
 active(now=Date.now()):RoadEvent[]{return this.db.prepare(`SELECT body FROM road_events WHERE status IN ('active','planned') AND (end_at IS NULL OR julianday(end_at)>=julianday(?)) ORDER BY observed_at DESC`).all(new Date(now).toISOString()).map(r=>JSON.parse(String(r.body)));}
 lastUpdate():string|undefined{return this.db.prepare('SELECT max(observed_at) AS time FROM road_events').get()?.time as string|undefined;}
 seen(id:string){return !!this.db.prepare('SELECT 1 FROM sns_messages WHERE id=?').get(id);}
 record(id:string){this.db.prepare('INSERT OR IGNORE INTO sns_messages VALUES(?,?)').run(id,Date.now());this.db.prepare('DELETE FROM sns_messages WHERE received_at < ?').run(Date.now()-7*86400000);}
 close(){this.db.close();}
}
