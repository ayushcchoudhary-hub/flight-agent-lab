FROM node:24-bookworm-slim

WORKDIR /app
RUN npm install --global pnpm@11.19.0

COPY --chown=node:node agent/package.json agent/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --chown=node:node agent/*.mjs ./agent/
COPY --chown=node:node agent/policy-snapshot.json ./agent/policy-snapshot.json
COPY --chown=node:node agent/dashboard ./agent/dashboard
COPY --chown=node:node agent/published-eval-results ./agent/eval-results

ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
EXPOSE 8080
USER node
CMD ["node", "--import", "./agent/register.mjs", "./agent/experiment-server.mjs"]
