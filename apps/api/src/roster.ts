import crypto from "node:crypto";
import type { Role } from "@graspchain/shared";
import { nowIso, type DB } from "./db";

/**
 * Accounts are created by the operator (`pnpm roster add …`); nothing is created automatically.
 * A roster code is the login key, so codes are never shipped in the app or listed on any page.
 */
export const CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,31}$/;

export function addAccount(db: DB, code: string, role: Role, label: string): { created: boolean; code: string } {
  const c = code.trim().toUpperCase();
  if (!CODE_PATTERN.test(c)) throw new Error(`Invalid roster code "${code}": 3–32 characters, A–Z, 0–9 and "-".`);
  if (!["student", "teacher", "admin"].includes(role)) throw new Error(`Invalid role "${role}": student, teacher or admin.`);
  if (!label.trim()) throw new Error("A label is required (e.g. the student's class and number; never a full name is needed).");
  // Staff do not take assessments, so the research-consent step applies to students only.
  const r = db
    .prepare("INSERT OR IGNORE INTO students (id, studentCode, salt, role, label, consentAt, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(crypto.randomUUID(), c, crypto.randomBytes(16).toString("hex"), role, label.trim(), role === "student" ? null : nowIso(), nowIso());
  return { created: r.changes === 1, code: c };
}

export function listAccounts(db: DB) {
  return db
    .prepare(
      "SELECT s.studentCode code, s.role, s.label, s.consentAt, s.createdAt, (SELECT COUNT(*) FROM attempts a WHERE a.studentId = s.id) attempts FROM students s ORDER BY s.role, s.studentCode",
    )
    .all() as { code: string; role: Role; label: string; consentAt: string | null; createdAt: string; attempts: number }[];
}

export const accountCount = (db: DB) => (db.prepare("SELECT COUNT(*) n FROM students").get() as { n: number }).n;
