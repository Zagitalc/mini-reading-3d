-- Reading over time: one row per UTC hour of minute samples, and one row per London day of fuel prices.
CREATE TABLE history_hours (hour TEXT PRIMARY KEY, body TEXT NOT NULL);
CREATE TABLE history_fuel (day TEXT PRIMARY KEY, observed_at TEXT NOT NULL, body TEXT NOT NULL);
