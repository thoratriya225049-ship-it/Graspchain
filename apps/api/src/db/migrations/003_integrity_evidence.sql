-- Assessment integrity: every monitored event, from the browser monitor or from the server itself.
CREATE TABLE integrity_events (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  sessionId TEXT NOT NULL REFERENCES sessions(id),
  clientId TEXT,
  seq      INTEGER,
  type     TEXT NOT NULL,
  source   TEXT NOT NULL CHECK (source IN ('client','server')),
  phase    TEXT NOT NULL CHECK (phase IN ('reading','writing','other')),
  at       INTEGER NOT NULL,
  clientAt INTEGER,
  detail   TEXT NOT NULL
);
CREATE UNIQUE INDEX integrity_events_seq ON integrity_events(sessionId, clientId, seq) WHERE seq IS NOT NULL;
CREATE INDEX integrity_events_session ON integrity_events(sessionId, at);

-- One row per browser instance (page load) that reported for a session.
CREATE TABLE integrity_clients (
  sessionId       TEXT NOT NULL REFERENCES sessions(id),
  clientId        TEXT NOT NULL,
  firstSeenAt     INTEGER NOT NULL,
  lastSeenAt      INTEGER NOT NULL,
  lastSeqReported INTEGER NOT NULL DEFAULT 0,
  lastVisibility  TEXT NOT NULL DEFAULT 'visible',
  PRIMARY KEY (sessionId, clientId)
);

ALTER TABLE sessions ADD COLUMN submittedAt INTEGER;
ALTER TABLE evaluations ADD COLUMN evidence TEXT;
ALTER TABLE evaluations ADD COLUMN integrity TEXT;
ALTER TABLE evaluations ADD COLUMN integrityStatus TEXT;
ALTER TABLE evaluations ADD COLUMN integrityOutcome TEXT;
