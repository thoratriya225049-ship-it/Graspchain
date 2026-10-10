import type { ClockMode, FairMode } from "@graspchain/shared";
import type { Config } from "./config";
import { nowIso, type DB } from "./db";

/** Runtime modes an admin can switch live (APP_FLOW §5). Defaults come from env. */
export interface RuntimeSettings {
  researchMode: boolean;
  clockMode: ClockMode;
  fairMode: FairMode;
  readSecondsOverride: number | null;
  /** Demo only: each real join also adds a cohort of virtual clients (labelled as simulated). */
  demoLoad: boolean;
}

export class SettingsStore {
  constructor(
    private db: DB,
    private cfg: Config,
  ) {}

  defaults(): RuntimeSettings {
    return {
      researchMode: false,
      clockMode: this.cfg.CLOCK_MODE,
      fairMode: this.cfg.FAIR_MODE,
      readSecondsOverride: this.cfg.READ_SECONDS_OVERRIDE ?? null,
      demoLoad: false,
    };
  }

  get(): RuntimeSettings {
    const rows = this.db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
    const s = this.defaults() as unknown as Record<string, unknown>;
    for (const r of rows) if (r.key in s) s[r.key] = JSON.parse(r.value);
    return s as unknown as RuntimeSettings;
  }

  set(patch: Partial<RuntimeSettings>): RuntimeSettings {
    const up = this.db.prepare(
      "INSERT INTO settings (key, value, updatedAt) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updatedAt=excluded.updatedAt",
    );
    this.db.transaction(() => {
      for (const [k, v] of Object.entries(patch)) if (v !== undefined) up.run(k, JSON.stringify(v), nowIso());
    })();
    return this.get();
  }
}

export function audit(db: DB, actor: string, action: string, target: string | null, detail?: unknown) {
  db.prepare("INSERT INTO audit_log (actor, action, target, detail, at) VALUES (?, ?, ?, ?, ?)").run(
    actor,
    action,
    target,
    detail === undefined ? null : JSON.stringify(detail),
    nowIso(),
  );
}
