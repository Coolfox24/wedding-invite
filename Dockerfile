FROM node:24-bookworm-slim AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.server.json ./
COPY tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public
COPY server ./server
# Container hosting uses /; the separate GitHub Pages build keeps its existing base.
RUN npm run build -- --base=/ && npm run api:build && npm run api:test

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 DATABASE_PATH=/data/rsvp.sqlite STATIC_DIRECTORY=/app/public-dist
WORKDIR /app
COPY --from=build --chown=node:node /build/dist-server ./dist-server
COPY --from=build --chown=node:node /build/dist ./public-dist
COPY --chown=node:node package.json ./
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '3001') + '/health/ready').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist-server/index.js"]
