FROM node:26-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:26-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY --from=build /app/web/dist ./web/dist
RUN printf '#!/bin/sh\nexec node /app/src/cli.ts "$@"\n' > /usr/local/bin/chores && chmod +x /usr/local/bin/chores
VOLUME /app/data
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=5s \
    CMD node -e "fetch('http://localhost:3000/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
USER node
CMD ["node", "src/server.ts"]
