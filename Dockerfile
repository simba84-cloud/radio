# One Dockerfile, two releases:
#
#   --target dev   next dev with hot reload; expects the source bind-mounted
#   --target prod  standalone server.js, no devDependencies, non-root
#
# Node 24 matches CI. Alpine is fine: pg is pure JS, and npm ci picks up the
# musl builds of SWC, lightningcss and the Tailwind oxide engine.
ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---------------------------------------------------------------------------
# deps: full install (devDependencies included — the build needs Tailwind,
# TypeScript and eslint-config-next). Cached until the lockfile changes.
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# dev: the source comes from a bind mount (compose.dev.yml), so only the
# dependencies are baked in. The copy below is a fallback that lets the image
# also run on its own without a mount.
FROM deps AS dev
ENV NODE_ENV=development
COPY . .
EXPOSE 3002
# Not `npm run dev`: bind to all interfaces so the port is reachable from the host.
CMD ["npx", "next", "dev", "--hostname", "0.0.0.0", "--port", "3002"]

# ---------------------------------------------------------------------------
# builder: production build, emitted as a self-contained .next/standalone.
FROM deps AS builder
ENV NODE_ENV=production \
    NEXT_OUTPUT=standalone
COPY . .
# next/font/google downloads Montserrat and Open Sans here, so the build needs
# network access; the running container does not.
RUN npm run build

# ---------------------------------------------------------------------------
# prod: only the traced server, its node_modules subset, and static assets.
FROM node:${NODE_VERSION}-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

# server.js serves public/ and .next/static only if they sit beside it.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

USER node
EXPOSE 3000

# /api/health also checks the database, so "healthy" means the app can serve
# ratings, not just that the process is up. fetch is built into Node 24.
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

CMD ["node", "server.js"]
