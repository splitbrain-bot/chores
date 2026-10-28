# Chores

Chores is a recommender for household chores. It holds a pool of chores and suggests the two or three chores that
are the best to do now. It reads presence, calendars and template results from Home Assistant.

## Chore Model

A chore has a name, rooms, an interval in days, a duration and an effort. All other values are optional.

| Value             | Meaning                                                                                    |
|-------------------|--------------------------------------------------------------------------------------------|
| name              | Chores with the same name form a group, for example the same chore in several rooms.      |
| kind              | Recurring, or a one-time task.                                                             |
| interval          | Days between two done events of a recurring chore. The app corrects it over time.          |
| pauses when away  | The elapsed time counts only while a person is at home. Default yes.                       |
| duration, effort  | Minutes and effort from 1 to 5. Both must fit the capacity of the person.                  |
| persons           | No person: anybody. One person: only this person. More persons: all of them together.     |
| season            | Months of the chore. No month means the whole year.                                        |
| noisy             | Not on Sundays and public holidays.                                                        |
| deadline          | MM-DD for a recurring chore, a date for a one-time task. The chore is urgent before it.     |
| only when         | A condition that must be true. Its forecast template gives the hints of the outlook.       |
| urgent when       | A condition that makes the chore urgent when it becomes true, until the chore is done.     |

The need level of a chore is the elapsed time divided by the interval. A chore with a need level of 0.9 or more is a
candidate for the suggestions. A seasonal chore counts the time outside its season at most one interval, so it is
due at the start of the season. A recurring chore without a known last done date counts from half an interval before
its creation, so it starts at the need level 0.5. A one-time task reaches the need level 1 after the reference days
and stays there. At most one one-time task is in the suggestions while a recurring chore is possible.

A deadline or a trigger makes a chore urgent. A trigger applies when its condition became true after the last done
event and at least half of the interval has passed. A done tap ends the urgency.

Two taps correct the interval. "Was necessary earlier" after a done tap moves the interval toward the elapsed time
minus the margin. "Not necessary yet" in the dialog Later moves it toward the elapsed time plus the margin. One tap
applies half of the change, a second tap in the same direction applies the whole change. Both taps need a known last
done date. For a recurring chore without one, "Not necessary yet" is not possible, and its first done tap gives no
question "Was necessary earlier". The reasons "No time" and "No energy" lower the capacity of the person for the rest
of the slot, so the next suggestions are shorter or lighter.

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
docker exec -it chores chores add-person Andi
```

The tool asks for the password twice. Without a terminal it reads the password from the first two lines of the
standard input. The Home Assistant entities of the person are set in the settings screen. Changes there apply at
once. A person without a person entity counts as always at home.

## MCP

The MCP endpoint is `/mcp`. It accepts only tokens of the kind MCP. A logged-in person creates such a token in the
settings screen.

```
claude mcp add --transport http chores https://<host>/mcp --header "Authorization: Bearer <token>"
```

## Simulation

`npm run sim` simulates one year with about 150 generated chores and prints the need levels per month, the learned
vacuuming interval, the days until the interval follows the shedding season of the dog and the state after a
vacation. The arguments `seed=<n>`, `year=<yyyy>` and `settings=<json>` change the random seed, the year and the
settings. `size=<n>` sets the number of random recurring chores, default 110. `active=1` simulates a user who also
vacuums from the chore list when the floor needs it, for example:

```
npm run sim -- seed=2 size=13 active=1 settings='{"suggest_threshold":1}'
```
