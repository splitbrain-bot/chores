# Chores

Chores is a recommender for household chores. It holds a pool of chores and suggests the two or three chores that
are the best to do now. It reads presence, calendars and template results from Home Assistant.

## Development

Node.js 26 is required.

```
npm install
npm run dev
```

The server listens on port 3000. Vite serves the web app on port 5173 and sends `/api` and `/mcp` to the server.

| Script             | Purpose                                     |
|--------------------|---------------------------------------------|
| `npm run dev`      | Server with reload and the Vite dev server  |
| `npm run build`    | Type check and build of the web app         |
| `npm test`         | Unit and service tests                      |
| `npm run test:e2e` | Playwright tests                            |
| `npm run lint`     | ESLint                                      |
| `npm run sim`      | Simulation of one year                      |
| `npm run migrate`  | Database migrations                         |

## Environment

| Variable           | Default              | Purpose                                                   |
|--------------------|----------------------|-----------------------------------------------------------|
| `PORT`             | 3000                 | HTTP port                                                 |
| `DATABASE_PATH`    | `data/chores.sqlite` | SQLite file                                               |
| `STATIC_DIR`       | `web/dist`           | Built web app                                             |
| `HA_URL`           |                      | Home Assistant URL, for example `http://192.168.1.10:8123` |
| `HA_TOKEN`         |                      | Long-lived access token of Home Assistant                 |
| `INITIAL_PERSON`   |                      | Name of the first person, used when no person exists      |
| `INITIAL_PASSWORD` |                      | Password of the first person                              |
| `INITIAL_PERSON_ENTITY` | `person.<name>` | Home Assistant person entity of the first person          |

## Docker

```
docker compose up -d --build
```

The container runs as the user `node` with the uid 1000. The directory `data` on the host must be writable for this
uid.

## MCP

The MCP endpoint is `/mcp`. It accepts only tokens of the kind MCP. A logged-in person creates such a token in the
settings screen.

```
claude mcp add --transport http chores https://<host>/mcp --header "Authorization: Bearer <token>"
```
