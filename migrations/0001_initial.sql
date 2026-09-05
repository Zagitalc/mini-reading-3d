CREATE TABLE road_events (
  id TEXT PRIMARY KEY, observed_at TEXT NOT NULL, version INTEGER NOT NULL,
  status TEXT NOT NULL, end_at TEXT, body TEXT NOT NULL
);
CREATE INDEX idx_road_events_status_end ON road_events(status, end_at);
CREATE TABLE sns_messages (id TEXT PRIMARY KEY, received_at INTEGER NOT NULL);
CREATE INDEX idx_sns_received ON sns_messages(received_at);
CREATE TABLE state (id TEXT PRIMARY KEY, body TEXT NOT NULL);
CREATE TABLE feed_items (feed TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(feed,id));
