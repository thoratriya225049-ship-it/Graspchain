/** Minimal static server for dist/ (local demo; GitHub Pages serves the same files in production). */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const root = path.join(import.meta.dirname, "dist");
const port = Number(process.env.VERIFIER_PORT ?? 5174);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".map": "application/json",
  ".json": "application/json",
};

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const file = path.normalize(path.join(root, rel));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { "content-type": "text/plain" });
      return res.end("Not found");
    }
    res.writeHead(200, {
      "content-type": types[path.extname(file)] ?? "application/octet-stream",
      "cache-control": "no-cache",
      "x-content-type-options": "nosniff",
    });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, process.env.VERIFIER_HOST ?? "127.0.0.1", () => console.log(`Independent verifier on http://localhost:${port}/`));
