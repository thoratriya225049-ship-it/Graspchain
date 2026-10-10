-- Remove demo data the old boot-time seed inserted (prepared answers presented as real attempts),
-- with everything derived from it. Real attempts (seeded = 0) are untouched. Commitments already
-- on a chain cannot be removed from it; their server-side receipts are deleted here.
CREATE TEMP TABLE seeded_attempts AS SELECT id, sessionId FROM attempts WHERE seeded = 1;

DELETE FROM chain_outbox WHERE assessmentId IN (SELECT assessmentId FROM receipts WHERE attemptId IN (SELECT id FROM seeded_attempts));
DELETE FROM reviews WHERE attemptId IN (SELECT id FROM seeded_attempts);
DELETE FROM human_ratings WHERE attemptId IN (SELECT id FROM seeded_attempts);
DELETE FROM benchmark_runs WHERE attemptId IN (SELECT id FROM seeded_attempts);
UPDATE receipts SET supersededBy = NULL WHERE supersededBy IN (SELECT assessmentId FROM receipts WHERE attemptId IN (SELECT id FROM seeded_attempts));
DELETE FROM receipts WHERE attemptId IN (SELECT id FROM seeded_attempts) AND supersedes IS NOT NULL;
DELETE FROM receipts WHERE attemptId IN (SELECT id FROM seeded_attempts);
DELETE FROM claims WHERE attemptId IN (SELECT id FROM seeded_attempts);
DELETE FROM evaluations WHERE attemptId IN (SELECT id FROM seeded_attempts);
DELETE FROM attempts WHERE id IN (SELECT id FROM seeded_attempts);
DELETE FROM integrity_events WHERE sessionId IN (SELECT sessionId FROM seeded_attempts);
DELETE FROM integrity_clients WHERE sessionId IN (SELECT sessionId FROM seeded_attempts);
DELETE FROM sessions WHERE id IN (SELECT sessionId FROM seeded_attempts);

-- Simulated queue entries from the removed "demo load" setting.
DELETE FROM queue_tickets WHERE virtual = 1;
DELETE FROM settings WHERE key = 'demoLoad';

DROP TABLE seeded_attempts;
