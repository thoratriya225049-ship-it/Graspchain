import path from "node:path";
import type { NextConfig } from "next";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://127.0.0.1:4000";

/**
 * The browser only ever talks to this origin. /api/* and the health endpoints are rewritten to
 * the Fastify API, so the session cookie is first-party and SSE streams are proxied through.
 */
const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: false, // never buffer the evaluation event stream
  transpilePackages: ["@graspchain/shared"],
  turbopack: { root: path.resolve(import.meta.dirname, "../..") },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` },
      { source: "/healthz", destination: `${API_ORIGIN}/healthz` },
      { source: "/readyz", destination: `${API_ORIGIN}/readyz` },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default config;
