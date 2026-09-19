FROM node:24-bookworm-slim

WORKDIR /app
RUN npm install --global pnpm@11.19.0

COPY agent/package.json agent/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY agent/*.mjs ./agent/
COPY agent/policy-snapshot.json ./agent/policy-snapshot.json
COPY agent/dashboard ./agent/dashboard
RUN mkdir -p ./agent/eval-results

ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
EXPOSE 8080
CMD ["node", "--import", "./agent/register.mjs", "./agent/experiment-server.mjs"]
