import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ArticleSchema, articleText, readSecondsForWords, wordCount, type Article } from "@graspchain/shared";
import { REPO_ROOT } from "./config";
import { nowIso, type DB } from "./db";

export const CONTENT_DIR = path.join(REPO_ROOT, "content", "articles");

/** Load and validate content/articles/*.json. Invalid content stops the boot with the file name. */
export function loadArticles(dir = CONTENT_DIR): Map<string, Article> {
  const out = new Map<string, Article>();
  for (const f of fs
    .readdirSync(dir)
    .filter((x) => x.endsWith(".json"))
    .sort()) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const parsed = ArticleSchema.safeParse(raw);
    if (!parsed.success) throw new Error(`content/articles/${f}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    out.set(parsed.data.id, parsed.data as Article);
  }
  if (!out.size) throw new Error(`No articles found in ${dir}`);
  return out;
}

/** Mirror articles and key points into SQLite (for reporting and foreign keys). */
export function syncArticles(db: DB, articles: Map<string, Article>) {
  const up = db.prepare(
    `INSERT INTO articles (id, title, sentences, difficulty, skillTags, rubricVersion, contentHash, updatedAt)
     VALUES (@id, @title, @sentences, @difficulty, @skillTags, @rubricVersion, @contentHash, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET title=excluded.title, sentences=excluded.sentences, difficulty=excluded.difficulty,
       skillTags=excluded.skillTags, rubricVersion=excluded.rubricVersion, contentHash=excluded.contentHash, updatedAt=excluded.updatedAt
     WHERE articles.contentHash <> excluded.contentHash`,
  );
  const kp = db.prepare(
    `INSERT INTO key_points (articleId, id, weight, statement, sentenceIdx) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(articleId, id) DO UPDATE SET weight=excluded.weight, statement=excluded.statement, sentenceIdx=excluded.sentenceIdx`,
  );
  db.transaction(() => {
    for (const a of articles.values()) {
      up.run({
        id: a.id,
        title: a.title,
        sentences: JSON.stringify(a.sentences),
        difficulty: a.difficulty,
        skillTags: JSON.stringify(a.skillTags),
        rubricVersion: a.rubricVersion,
        contentHash: crypto.createHash("sha256").update(JSON.stringify(a)).digest("hex"),
        updatedAt: nowIso(),
      });
      for (const k of a.keyPoints) kp.run(a.id, k.id, k.weight, k.statement, JSON.stringify(k.sentenceIdx));
    }
  })();
}

export const articleWords = (a: Article) => wordCount(articleText(a));
export const defaultReadSeconds = (a: Article) => readSecondsForWords(articleWords(a));
