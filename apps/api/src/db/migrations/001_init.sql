-- Graspchain schema v1 (PRD §10, SYSTEM_DESIGN §5). Postgres-portable types; JSON stored as TEXT.

CREATE TABLE students (
  id           TEXT PRIMARY KEY,
  studentCode  TEXT NOT NULL UNIQUE,
  salt         TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('student','teacher','admin')),
  label        TEXT NOT NULL,
  consentAt    TEXT,
  withdrawnAt  TEXT,
  createdAt    TEXT NOT NULL
);

CREATE TABLE articles (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  sentences     TEXT NOT NULL,
  difficulty    INTEGER NOT NULL,
  skillTags     TEXT NOT NULL,
  rubricVersion INTEGER NOT NULL,
  contentHash   TEXT NOT NULL,
  updatedAt     TEXT NOT NULL
);

CREATE TABLE key_points (
  articleId   TEXT NOT NULL REFERENCES articles(id),
  id          TEXT NOT NULL,
  weight      REAL NOT NULL,
  statement   TEXT NOT NULL,
  sentenceIdx TEXT NOT NULL,
  PRIMARY KEY (articleId, id)
);

CREATE TABLE settings (
  key       TEXT PRIMARY KEY,
  value     TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE queue_windows (
  id          TEXT PRIMARY KEY,
  mode        TEXT NOT NULL,
  opensAt     INTEGER NOT NULL,
  closesAt    INTEGER NOT NULL,
  seed        TEXT NOT NULL,
  ticketOrder TEXT NOT NULL,
  hash        TEXT NOT NULL
);

CREATE TABLE queue_tickets (
  id             TEXT PRIMARY KEY,
  studentId      TEXT REFERENCES students(id),
  articleId      TEXT,
  virtual        INTEGER NOT NULL DEFAULT 0,
  joinedAt       INTEGER NOT NULL,
  windowId       TEXT,
  position       INTEGER,
  state          TEXT NOT NULL CHECK (state IN ('waiting','admitted','used','done','expired')),
  admittedAt     INTEGER,
  tokenExpiresAt INTEGER,
  usedAt         INTEGER,
  serviceEndsAt  INTEGER,
  mode           TEXT NOT NULL
);
CREATE UNIQUE INDEX tickets_open ON queue_tickets(studentId) WHERE state = 'waiting';
CREATE INDEX tickets_state ON queue_tickets(state, position);

CREATE TABLE sessions (
  id              TEXT PRIMARY KEY,
  studentId       TEXT NOT NULL REFERENCES students(id),
  articleId       TEXT NOT NULL REFERENCES articles(id),
  state           TEXT NOT NULL CHECK (state IN ('CREATED','READING','WRITING','EVALUATING','DONE','EXPIRED')),
  readSeconds     INTEGER NOT NULL,
  sentAt          INTEGER,
  ackAt           INTEGER,
  readDeadline    INTEGER,
  clockMode       TEXT NOT NULL,
  latencyCompMs   INTEGER NOT NULL DEFAULT 0,
  measuredDelayMs INTEGER,
  admissionMode   TEXT NOT NULL,
  ticketId        TEXT REFERENCES queue_tickets(id),
  windowId        TEXT,
  pasteCount      INTEGER NOT NULL DEFAULT 0,
  blurCount       INTEGER NOT NULL DEFAULT 0,
  copyCount       INTEGER NOT NULL DEFAULT 0,
  articleFetches  INTEGER NOT NULL DEFAULT 0,
  hiddenAt        INTEGER,
  createdAt       INTEGER NOT NULL,
  updatedAt       INTEGER NOT NULL
);
CREATE INDEX sessions_student ON sessions(studentId, createdAt);
CREATE INDEX sessions_state ON sessions(state);

CREATE TABLE attempts (
  id             TEXT PRIMARY KEY,
  sessionId      TEXT NOT NULL REFERENCES sessions(id),
  studentId      TEXT NOT NULL REFERENCES students(id),
  articleId      TEXT NOT NULL REFERENCES articles(id),
  attemptNo      INTEGER NOT NULL,
  answerText     TEXT NOT NULL,
  wordCount      INTEGER NOT NULL,
  idempotencyKey TEXT NOT NULL,
  recordSalt     TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('evaluating','scored','done','delayed','failed')),
  error          TEXT,
  retryCount     INTEGER NOT NULL DEFAULT 0,
  nextRetryAt    INTEGER,
  seeded         INTEGER NOT NULL DEFAULT 0,
  createdAt      TEXT NOT NULL,
  updatedAt      TEXT NOT NULL
);
CREATE UNIQUE INDEX attempts_idem ON attempts(sessionId, idempotencyKey);
CREATE INDEX attempts_student ON attempts(studentId, createdAt);
CREATE INDEX attempts_status ON attempts(status);

CREATE TABLE claims (
  id        TEXT PRIMARY KEY,
  attemptId TEXT NOT NULL REFERENCES attempts(id),
  claimId   TEXT NOT NULL,
  text      TEXT NOT NULL,
  start     INTEGER NOT NULL,
  "end"     INTEGER NOT NULL,
  source    TEXT NOT NULL CHECK (source IN ('llm','sentence'))
);
CREATE INDEX claims_attempt ON claims(attemptId);

CREATE TABLE evaluations (
  id             TEXT PRIMARY KEY,
  attemptId      TEXT NOT NULL UNIQUE REFERENCES attempts(id),
  segmentation   TEXT NOT NULL,
  judgeKind      TEXT NOT NULL,
  jevRequest     TEXT NOT NULL,
  jevResponse    TEXT NOT NULL,
  jevReask       TEXT,
  jevModel       TEXT NOT NULL,
  judgeCached    INTEGER NOT NULL DEFAULT 0,
  llmProvider    TEXT,
  llmModel       TEXT,
  llmFeedback    TEXT,
  feedbackSource TEXT,
  scorePayload   TEXT NOT NULL,
  fused          TEXT NOT NULL,
  xray           TEXT,
  dimensions     TEXT NOT NULL,
  finalScore     REAL NOT NULL,
  band           TEXT NOT NULL,
  lowConfidence  INTEGER NOT NULL,
  flags          TEXT NOT NULL,
  claimStats     TEXT NOT NULL,
  latencySegMs   INTEGER,
  latencyJevMs   INTEGER,
  latencyLlmMs   INTEGER,
  tScoreMs       INTEGER,
  tFeedbackMs    INTEGER,
  jevInputTokens INTEGER NOT NULL DEFAULT 0,
  llmTokens      INTEGER NOT NULL DEFAULT 0,
  costEst        REAL NOT NULL DEFAULT 0,
  createdAt      TEXT NOT NULL,
  updatedAt      TEXT NOT NULL
);

CREATE TABLE receipts (
  assessmentId  TEXT PRIMARY KEY,
  attemptId     TEXT NOT NULL REFERENCES attempts(id),
  supersedes    TEXT REFERENCES receipts(assessmentId),
  supersededBy  TEXT,
  canonicalJson TEXT NOT NULL,
  recordHash    TEXT NOT NULL,
  ethTx         TEXT,
  gasUsed       INTEGER,
  blockNumber   INTEGER,
  minedAt       TEXT,
  chainId       INTEGER,
  chainStatus   TEXT NOT NULL CHECK (chainStatus IN ('queued','sent','mined','failed')),
  tamperedField TEXT,
  tamperedAt    TEXT,
  originalJson  TEXT,
  createdAt     TEXT NOT NULL
);
CREATE INDEX receipts_attempt ON receipts(attemptId);

CREATE TABLE chain_outbox (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  assessmentId  TEXT NOT NULL REFERENCES receipts(assessmentId),
  kind          TEXT NOT NULL CHECK (kind IN ('record','supersede')),
  oldId         TEXT,
  payload       TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('queued','sent','retry','mined','failed')),
  attempts      INTEGER NOT NULL DEFAULT 0,
  lastError     TEXT,
  nonce         INTEGER,
  txHash        TEXT,
  nextAttemptAt INTEGER NOT NULL DEFAULT 0,
  createdAt     TEXT NOT NULL,
  updatedAt     TEXT NOT NULL
);
CREATE INDEX outbox_status ON chain_outbox(status, id);

CREATE TABLE reviews (
  id              TEXT PRIMARY KEY,
  assessmentId    TEXT NOT NULL REFERENCES receipts(assessmentId),
  oldAssessmentId TEXT NOT NULL REFERENCES receipts(assessmentId),
  attemptId       TEXT NOT NULL REFERENCES attempts(id),
  reviewerId      TEXT NOT NULL REFERENCES students(id),
  reason          TEXT NOT NULL,
  previousScore   REAL NOT NULL,
  newScore        REAL NOT NULL,
  createdAt       TEXT NOT NULL
);

CREATE TABLE api_usage (
  day          TEXT NOT NULL,
  provider     TEXT NOT NULL,
  inputTokens  INTEGER NOT NULL DEFAULT 0,
  outputTokens INTEGER NOT NULL DEFAULT 0,
  calls        INTEGER NOT NULL DEFAULT 0,
  cacheHits    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, provider)
);

CREATE TABLE api_cache (
  key       TEXT NOT NULL,
  provider  TEXT NOT NULL,
  response  TEXT NOT NULL,
  hits      INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL
);
CREATE UNIQUE INDEX cache_key ON api_cache(key);

CREATE TABLE human_ratings (
  id        TEXT PRIMARY KEY,
  attemptId TEXT NOT NULL REFERENCES attempts(id),
  rater     TEXT NOT NULL,
  raterType TEXT NOT NULL CHECK (raterType IN ('internal','external')),
  score     INTEGER NOT NULL CHECK (score BETWEEN 1 AND 10),
  createdAt TEXT NOT NULL
);
CREATE UNIQUE INDEX ratings_unique ON human_ratings(attemptId, rater);

CREATE TABLE benchmark_runs (
  id          TEXT PRIMARY KEY,
  attemptId   TEXT NOT NULL,
  system      TEXT NOT NULL,
  run         INTEGER NOT NULL,
  optionOrder TEXT NOT NULL,
  score       REAL NOT NULL,
  latencyMs   INTEGER,
  tokens      INTEGER,
  judgeModel  TEXT NOT NULL,
  createdAt   TEXT NOT NULL
);

CREATE TABLE fairness_runs (
  id            TEXT PRIMARY KEY,
  experiment    TEXT NOT NULL,
  config        TEXT NOT NULL,
  cohort        TEXT NOT NULL,
  medianWait    REAL,
  p95Wait       REAL,
  admitRate     REAL,
  jain          REAL,
  readTimeLossS REAL,
  createdAt     TEXT NOT NULL
);

CREATE TABLE audit_log (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  actor  TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  at     TEXT NOT NULL
);
