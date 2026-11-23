# -----------------------------------------------------------
#  [*] legalops-assistant — production image
#
#  The locked production dependencies and the source, nothing
#  mounted. Compose runs it read-only (its `user: 1000:1000`
#  line is commented out there, and no init is set): node is
#  PID 1, so a stop signal reaches it and server.js can drain
#  the open chat streams. The dependencies install
#  before the source is copied, so a code-only change
#  rebuilds in seconds.
# -----------------------------------------------------------

FROM node:24.16.0-alpine

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

COPY app/package.json app/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force

COPY app/ ./

EXPOSE 3000
CMD ["node", "server.js"]
