# syntax=docker/dockerfile:1.7
# One image definition for the monorepo; docker-compose.yml picks a target per service.
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1 CI=1
RUN corepack enable && corepack prepare pnpm@10.34.6 --activate
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/verifier/package.json apps/verifier/
COPY packages/shared/package.json packages/shared/
COPY packages/contracts/package.json packages/contracts/
RUN pnpm install --frozen-lockfile
COPY . .

# Local Hardhat chain (chain id 31337) — the demo fallback chain.
FROM base AS chain
RUN pnpm --filter contracts run build
EXPOSE 8545
CMD ["pnpm", "--filter", "contracts", "exec", "hardhat", "node", "--hostname", "0.0.0.0"]

# One-shot: deploy AssessmentRegistry with Ignition and export deployments/31337.json (shared volume).
FROM base AS deployer
RUN pnpm --filter contracts run build
CMD ["sh", "-c", "rm -rf packages/contracts/ignition/deployments/chain-31337 && echo y | pnpm --filter contracts run deploy:local"]

FROM base AS api
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s CMD node -e "fetch('http://127.0.0.1:4000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["pnpm", "--filter", "api", "run", "start"]

# Next.js rewrites are resolved at build time, so API_ORIGIN is a build argument.
FROM base AS web
ARG API_ORIGIN=http://api:4000
ENV API_ORIGIN=$API_ORIGIN
RUN pnpm --filter web run build
EXPOSE 3000
CMD ["pnpm", "--filter", "web", "exec", "next", "start", "--port", "3000", "--hostname", "0.0.0.0"]

# The static verifier is built at start, after the deployer has written the registry address.
FROM base AS verifier
ENV VERIFIER_HOST=0.0.0.0
EXPOSE 5174
CMD ["sh", "-c", "pnpm --filter verifier run build && node apps/verifier/serve.mjs"]
