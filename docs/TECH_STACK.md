# FairProof — Tech Stack

Every dependency, why it was chosen, what was rejected, what it costs, and what accounts you need. Versions and licences were read from the npm registry on 2026-10-09; external facts are in [PRD.md](../PRD.md) Appendix F.

Rule: **all software is free/open source; the only usage-billed service is Jev, and it costs cents.** Anything that would need a credit card for the software itself is out.

---

## 1. Runtime and language

| Item | Choice | Why |
|---|---|---|
| Runtime | Node.js 22 LTS | Required ≥ 20 by `@typesafe-ai/sdk`; 22 is current LTS; native `fetch`, `AbortController`, `node:test` |
| Language | TypeScript 5 (strict) | Shared types across web, api, verifier bundle and scripts |
| Package manager | pnpm (workspaces) | Fast, strict; `pnpm -r` for monorepo scripts |
| Monorepo | pnpm workspaces + a root `tsconfig.base.json` | No Turborepo/Nx (unnecessary for 2 people) |

---

## 2. Frontend (`apps/web`)

| Dependency | Version · licence | Purpose |
|---|---|---|
| `next` (App Router) | 16.4 · MIT | Screens, routing, server components for non-interactive pages |
| `react`, `react-dom` | 19 · MIT | |
| `tailwindcss` | 4 · MIT | Styling; icon + text rule for accessibility |
| `qrcode` | 1.5 · MIT | Receipt QR (rendered server-side to SVG) |
| `recharts` | 2 · MIT | Fingerprint chart, fairness charts |
| `zod` | 4.6 · MIT | Parse SSE payloads and API responses |

Rejected: Flutter (no reason to go mobile-native; PS allows web), Vite SPA (Next gives SSR for the verify/share pages and free Vercel hosting).

Hosting: **Vercel Hobby** (free, no card). Demo day runs locally.

---

## 3. Backend (`apps/api`)

| Dependency | Version · licence | Purpose |
|---|---|---|
| `fastify` | 5.12 · MIT | HTTP server; pino logging built in; schema validation hooks |
| `@fastify/cookie`, `@fastify/cors`, `@fastify/helmet`, `@fastify/rate-limit` | 11.x · MIT | Signed cookies, CORS allowlist, security headers, rate limits |
| `better-sqlite3` | 13.0 · MIT | Synchronous SQLite with WAL; zero ops; single-file backups |
| `zod` | 4.6 · MIT | Config, request bodies, Jev/LLM responses |
| `pino`, `pino-pretty` (dev) | 10.4 · MIT | Structured logs |
| `canonicalize` | 5.1 · Apache-2.0 | RFC 8785 JSON canonicalization for receipt hashing (same module bundled in the verifier) |
| `ethers` | 6.17 · MIT | Chain writer, verify reads |
| `tsx` (dev) | MIT | Run TS directly in dev and scripts |
| `vitest` | MIT | Unit + integration tests (`fastify.inject`) |

Rejected: Express (no schema hooks, slower), NestJS (too much ceremony), Postgres (needs a hosted instance; SQLite is enough for one process; schema kept Postgres-portable), serverless functions (FairGate and SSE need a long-running process).

Hosting: **Render free web service** for the data-collection week (sleeps after 15 min idle, 750 h/month). Laptop for the demo. **Not** Cloudflare quick tunnels (no SSE support).

---

## 4. AI: Jev (the decision model)

| Item | Value |
|---|---|
| SDK | `@typesafe-ai/sdk` 0.6.0 · MIT (official TypeScript SDK; `TypeSafeClient.systemOne`) |
| Endpoint | `POST {JEV_BASE_URL}/v1/systemone` |
| Model | `jev-1.13.0` (pinned; `jev-latest` and `jev-preview` currently alias it) |
| Question types | `choice`, `score` (criteria = ordered array, 0-based levels, 2–10), `noul` (yes-probability, no confidence) |
| Limits | 64k tokens/request; 32k for state + longest question; ~1,200 RPM |
| Pricing | **$0.042 per 1M input tokens; output free; no free tier** |
| Our usage | ≈ 2.5k tokens per evaluation ≈ $0.0001; ≈ 840 calls in the project ≈ $0.08 |

Access routes (same request/response shape; switch by env):

| Route | `JEV_BASE_URL` | `JEV_MODEL` | Requirement | When |
|---|---|---|---|---|
| TypeSafe direct | `https://api.typesafe.ai` | `jev-1.13.0` | Key from `console.typesafe.ai/keys` (site shows waitlist/early access `[VERIFY-D1]`) | Preferred |
| Vercel AI Gateway | `https://ai-gateway.vercel.sh/typesafe` | `typesafe-ai/jev` | AI Gateway key + purchased credits (Jev isn't on the free-tier model list; free credits also need a payment method) | PS lists AI Gateway as a resource |
| OpenRouter | `https://openrouter.ai/api` | `typesafe/jev-1.13` | OpenRouter key, $5 minimum prepaid; 32k context | Fastest to obtain |
| Organizer-provided | — | — | Ask the mentor on Day 0 | Zero cost |

Cost controls in code: response cache (`api_cache`), `JEV_DAILY_TOKEN_CAP`, `DEMO_MODE=replay`.

---

## 5. AI: LLM (segmentation + feedback)

| Item | Value |
|---|---|
| Client | Vercel AI SDK `ai` 7.0 · Apache-2.0 (`generateObject`, `streamObject` with zod schemas) |
| Providers | `@ai-sdk/google` 4.0 (Gemini Flash family, **free tier, no card**) primary; `@ai-sdk/groq` 4.0 (**free tier, no card**) secondary |
| Model selection | `LLM_PROVIDER=google|groq`, `LLM_MODEL=<id>`; pick the current Flash/Flash-Lite model that is free in your AI Studio project `[VERIFY-D1]` |
| Settings | `temperature: 0`; segmentation hard timeout 1.8 s; feedback streamed |
| Quotas | Free-tier RPM/RPD are per project and change; budget in PRD §13.4 (~810 calls); spread benchmark runs over days; cache everything |
| Privacy | Gemini free tier: content "used to improve our products" → stated in the consent form; Groq available as the alternative |

Rejected: OpenAI (no free tier), self-hosted models (no GPU, time), LangChain (unnecessary abstraction).

---

## 6. Blockchain (`packages/contracts`, chain writer, verifier)

| Item | Choice | Version · licence | Notes |
|---|---|---|---|
| Network | Ethereum **Sepolia** (chain id 11155111) | — | Testnet; ETH has no value; same contract deploys to an L2 later |
| Framework | Hardhat 3 | 3.19 · MIT | ESM config (`hardhat.config.ts` as ESM); Node ≥ 22 recommended |
| Ethers plugin | `@nomicfoundation/hardhat-ethers` | 4.2 · MIT | ethers v6 |
| Verification | `@nomicfoundation/hardhat-verify` | 3.1 · MIT | `verify.etherscan.apiKey = configVariable("ETHERSCAN_API_KEY")` |
| Deployment | Hardhat Ignition | MIT | Deterministic, resumable deploys |
| Contracts library | `@openzeppelin/contracts` | 5.6.1 · MIT | `Ownable(initialOwner)` |
| Solidity | `^0.8.24` | — | |
| RPC (server) | PublicNode `https://ethereum-sepolia-rpc.publicnode.com` (no key); backup Alchemy free tier (account, 300M CU/month) | — | |
| RPC (browser verifier) | PublicNode | — | CORS `access-control-allow-origin: *` verified live; dRPC rejected (Sepolia paid-only) |
| Explorer API | Etherscan free plan | — | 3 calls/s, 100k/day, attribution required in README |
| Faucets | 1) Google Cloud Web3 faucet (Google account) `[VERIFY-D1]` · 2) pk910 PoW faucet (browser mining, no mainnet ETH) · 3) local Hardhat | — | Alchemy/QuickNode faucets excluded (need 0.001 mainnet ETH) |
| Gas | ≈ 90–110k per `record()`; Sepolia ≈ 0.001 gwei on 2026-10-09; writer caps `MAX_FEE_GWEI=30` | — | One faucet drip covers the project |
| Merkle (stretch) | `merkletreejs` | 0.6 · MIT | `anchorBatch` |
| Bitcoin anchor (stretch) | `@otskit/client` | 0.7 · MIT | OpenTimestamps public calendars, free; 10 min–hours |

Static verifier page: plain HTML, `ethers` 6 UMD from cdnjs (pinned), bundled `canonicalize`, WebCrypto SHA-256. Hosted on **GitHub Pages** (free).

Rejected: Foundry (team knows TS better; Hardhat tests in TS), Polygon/other L2 for the demo (Sepolia faucets are the most available; L2 is the stated production path), per-assessment Bitcoin anchoring (slow, unnecessary).

---

## 7. Testing and quality

| Tool | Version · licence | Use |
|---|---|---|
| `vitest` | MIT | Unit (fusion, claim validator, canonicalization), API integration via `fastify.inject` |
| `node:test` / Hardhat test runner | — | Contract tests |
| `playwright` | 1.64 · Apache-2.0 | E2E smoke (read → hide → write → score); network emulation (Slow 3G) for E5b and the split-screen demo |
| `eslint`, `prettier`, `typescript --noEmit` | MIT | Lint/format/typecheck in CI |
| `gitleaks` GitHub Action | MIT | Secret scanning |
| GitHub Actions | free for public repos | CI: lint → typecheck → unit → contracts → build → e2e smoke (Docker) |

---

## 8. Research tooling (`/research`, `/scripts`)

| Tool | Use |
|---|---|
| TypeScript scripts (`tsx`) | `benchmark.ts`, `order-flip.ts`, `fairness-sim.ts`, `fairclock-test.ts`, `tamper-test.ts` |
| Python 3 + `pandas`, `scipy`, `scikit-learn`, `matplotlib` (all BSD/MIT) | Spearman, QWK, MAE, bootstrap CIs, LOOCV, figures (`research/analysis.ipynb`) |
| Google Forms | Day-1 answer collection (free) |
| CSV in repo (anonymized) | Dataset of record |

---

## 9. Hosting and services summary

| Service | Plan | Card? | Used for |
|---|---|---|---|
| GitHub (public repo, Actions, Pages) | Free | No | Code, CI, static verifier |
| Vercel | Hobby | No | Next.js web app |
| Render | Free web service | No | API during data collection |
| TypeSafe / Vercel AI Gateway / OpenRouter | Usage | Depends on route (see §4) | Jev |
| Google AI Studio (Gemini) | Free tier | No | LLM primary |
| Groq | Free tier | No | LLM secondary |
| Alchemy | Free tier | No | Backup Sepolia RPC |
| Etherscan | Free API plan | No | Contract verification |
| Google Cloud faucet / pk910 | Free | No | Sepolia ETH |

---

## 10. Accounts and keys to create on Day 0

| # | Account | Produces | Owner |
|---|---|---|---|
| 1 | TypeSafe console (or waitlist) → else OpenRouter ($5) / Vercel AI Gateway | `JEV_API_KEY`, `JEV_BASE_URL` | A |
| 2 | Google AI Studio | `GOOGLE_GENERATIVE_AI_API_KEY` | A |
| 3 | Groq | `GROQ_API_KEY` | A |
| 4 | New EVM wallet (never used elsewhere) | `DEPLOYER_PRIVATE_KEY` | B |
| 5 | Google Cloud faucet / pk910 | ≥ 0.05 Sepolia ETH | B |
| 6 | Etherscan | `ETHERSCAN_API_KEY` | B |
| 7 | Alchemy (optional) | `CHAIN_RPC_BACKUP_URL` | B |
| 8 | GitHub repo (public) + Pages enabled | — | B |
| 9 | Vercel (Hobby) | web deploy | B |
| 10 | Render | api deploy | A |
| 11 | Google Form | answer collection link | A |

All keys go in `apps/api/.env` (git-ignored); `.env.example` lists every variable with a comment.

---

## 11. Version pins

Pin exact versions in `package.json` (no `^`) once Day 1 installs succeed, and commit `pnpm-lock.yaml`. Record the Jev `model` string returned by the API in every receipt; record LLM model ids in `evaluations.llmModel`.
