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
| `npm run sim`      | Simulation of one year, see below           |
| `npm run migrate`  | Database migrations                         |
| `npm run cli`      | Command line tool, see below                |

## Environment

| Variable           | Default              | Purpose                                                   |
|--------------------|----------------------|-----------------------------------------------------------|
| `PORT`             | 3000                 | HTTP port                                                 |
| `DATABASE_PATH`    | `data/chores.sqlite` | SQLite file                                               |
| `STATIC_DIR`       | `web/dist`           | Built web app                                             |
| `HA_URL`           |                      | Home Assistant URL, for example `http://192.168.1.10:8123` |
| `HA_TOKEN`         |                      | Long-lived access token of Home Assistant                 |

## Docker

The CI workflow publishes the image `ghcr.io/splitbrain/chores` for `linux/amd64` and `linux/arm64` after the tests
pass. A push to `main` updates the tag `latest`, and a tag `v1.2.3` publishes the tags `1.2.3` and `1.2`.

```
docker compose up -d --build
```

`compose.yaml` builds the image from the source. To use the published image, replace `build: .` with
`image: ghcr.io/splitbrain/chores:latest`.

The container runs as the user `node` with the uid 1000. The directory `data` on the host must be writable for this
uid.

## Persons

The command line tool creates a person with a password, for example the first person after the installation:

```
docker exec -it chores chores add-person Andi person.andreas_gohr
```

The tool asks for the password twice. Without a terminal it reads the password from the first two lines of the
standard input. The server reads the watched Home Assistant entities at the start, so the container needs a restart
after a new person. Logged-in persons can add more persons in the settings screen.

## MCP

The MCP endpoint is `/mcp`. It accepts only tokens of the kind MCP. A logged-in person creates such a token in the
settings screen.

```
claude mcp add --transport http chores https://<host>/mcp --header "Authorization: Bearer <token>"
```

## Simulation

`npm run sim` simulates one year with about 150 generated chores and prints the need levels per month, the learned
vacuuming interval and the state after a vacation. The arguments `seed=<n>`, `year=<yyyy>` and
`settings=<json>` change the random seed, the year and the settings, for example:

```
npm run sim -- seed=2 settings='{"suggest_threshold":1}'
```
