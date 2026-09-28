import type{DatabaseSync}from'node:sqlite';import type{FuelDay,HistoryStore,HourRecord}from'../shared/history';
/** The local Node counterpart of the D1 history tables, in the same SQLite file as road events. */
export function sqliteHistory(db:DatabaseSync):HistoryStore{
 db.exec('CREATE TABLE IF NOT EXISTS history_hours (hour TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS history_fuel (day TEXT PRIMARY KEY, observed_at TEXT NOT NULL, body TEXT NOT NULL);');
 const parse=<T>(rows:Record<string,unknown>[])=>rows.map(r=>JSON.parse(String(r.body)) as T);
 return{
  async hours(keys){return parse<HourRecord>(db.prepare(`SELECT body FROM history_hours WHERE hour IN (${keys.map(()=>'?').join(',')})`).all(...keys));},
  async saveHours(rows){const s=db.prepare('INSERT INTO history_hours VALUES(?,?) ON CONFLICT(hour) DO UPDATE SET body=excluded.body');for(const r of rows)s.run(r.hour,JSON.stringify(r));},
  async fuelObservedAt(day){return db.prepare('SELECT observed_at FROM history_fuel WHERE day=?').get(day)?.observed_at as string|undefined;},
  async saveFuel(day){db.prepare('INSERT INTO history_fuel VALUES(?,?,?) ON CONFLICT(day) DO UPDATE SET observed_at=excluded.observed_at,body=excluded.body').run(day.day,day.observedAt,JSON.stringify(day));},
  async range(fromHour,fromDay){return{hours:parse<HourRecord>(db.prepare('SELECT body FROM history_hours WHERE hour>=?').all(fromHour)),fuel:parse<FuelDay>(db.prepare('SELECT body FROM history_fuel WHERE day>=?').all(fromDay)),since:(db.prepare('SELECT min(hour) AS hour FROM history_hours').get()?.hour as string|null)??null};},
 };
}
