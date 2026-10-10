-- Abandoned sessions must not hold a FairGate slot: track the last client heartbeat.
ALTER TABLE sessions ADD COLUMN lastSeenAt INTEGER;
UPDATE sessions SET lastSeenAt = updatedAt;
