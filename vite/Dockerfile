# -----------------------------------------------------------
#  [*] legalops-vite — production image
#
#  Stage 1 builds the SPA from the locked dependencies (npm
#  ci from package-lock.json, then vite build); stage 2 is a
#  bare Caddy serving dist/ with the cache rules in
#  ./Caddyfile. Nothing mounted; compose runs it read_only
#  (its `user: 1000:1000` line is commented out there).
#
#  Dependencies are installed before the source is copied: a
#  code-only change skips the npm ci layer.
# -----------------------------------------------------------

FROM node:24.16.0-alpine AS builder

WORKDIR /app

COPY app/package.json app/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY app/ ./
RUN npm run build



################################
##### Production container #####
################################
FROM caddy:2.11-alpine AS prod

COPY --from=builder /app/dist /app/dist
COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 80
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
