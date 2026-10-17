# Sports tracker widget

Desktop widget (Übersicht) tracking followed F1 drivers, an NHL team and BWF players.
Data layer and display layer are separate: `fetch.py` writes `data.json`; any
client (Übersicht now, iOS Scriptable later) only reads `data.json`.

## Layout
- `config.yaml` — followed subjects, display order, timezone
- `fetch.py` — runs every provider, stale fallback, atomic write of `data.json`
- `providers/<sport>.py` — one module per sport, each exposes
  `fetch_subject(subject_cfg) -> {"ranking", "next", "last"}` and raises on failure
- `providers/common.py` — `get_json` (urllib, cached per run), `event()`/`result()` builders
- `widget/sports-tracker.widget/index.jsx` — Übersicht widget (display only)
- `launchd/install.sh` + `com.adaxu.sports-tracker.plist.template` — scheduled job
- Run manually: `.venv/bin/python fetch.py` (Python 3.9, deps in `requirements.txt`: PyYAML, curl_cffi).
  Writes the project's own `data.json` (dev copy; the widget does not read it).

## Deployment (two locations — important)
macOS TCC blocks launchd jobs from reading `~/Documents`, so the scheduled job
runs from a runtime copy:
- `./launchd/install.sh` copies `fetch.py`, `providers/`, `config.yaml` to
  `~/Library/Application Support/sports-tracker/`, creates its own `.venv` there,
  writes `~/Library/LaunchAgents/com.adaxu.sports-tracker.plist` and loads it
  (RunAtLoad + every 1800 s). **Re-run it after any change to fetch.py, providers or config.yaml.**
- Runtime writes `~/Library/Application Support/sports-tracker/data.json` and
  `logs/fetch.log` (one line per run), `logs/fetch.err.log` (tracebacks).
- The widget reads that runtime `data.json` (`DATA` in index.jsx, `$HOME`-relative so the repo is portable).
- Übersicht does not follow symlinks, so its Widgets Folder preference points at
  this project's `widget/` folder; widget edits apply immediately.
- Uninstall: `./launchd/install.sh remove`. Status: `launchctl print gui/$(id -u)/com.adaxu.sports-tracker`.

## Data sources
| Sport | Source | Used for | Notes |
|---|---|---|---|
| F1 | OpenF1 `api.openf1.org/v1` | `meetings`, `sessions` (schedule), `session_result` (positions incl. practice) | Free for historical data. Live-session access may need a paid account; if blocked during a session, F1 goes stale until it ends. |
| F1 | Jolpica `api.jolpi.ca/ergast/f1` | `current/driverStandings.json` | Ergast successor. ~4 req/s, 500 req/h limit. |
| F1 | MultiViewer `api.multiviewer.app/api/v1/circuits/{circuit_key}/{year}` | circuit outline `x/y`, `rotation`, `miniSectorsIndexes` | Unofficial. Some circuits (e.g. Singapore 61) have no mini-sector data. |
| NHL | `api-web.nhle.com/v1` | `club-schedule-season/{TEAM}/now`, `standings/now` | Unofficial, undocumented, no key. |
| Badminton | BWF `extranet-lv.bwfbadminton.com/api/` | rankings, player prev/next match, calendar, day schedule, entry lists | Undocumented. Cloudflare blocks urllib/curl (403); `curl_cffi` with `impersonate="chrome"` works. No token. |

BWF endpoints in use:
- `vue-rankingtable?rankId=2&catId={6 MS,7 WS,8 MD,9 WD,10 XD}&publicationId=0&doubles=...&searchKey=<BWF name>` (publicationId=0 = latest)
- `vue-player-match-previous` / `vue-player-match-next?playerId=...` — date only (`00:00:00`); `next` may return an already finished match, so always check `match_state == "F"`
- `vue-grouped-year-tournaments?year=&category[]=22..26` — World Tour calendar only (no Asian Games, Worlds, Olympics)
- `tournaments/day-matches?tournamentCode=&date=` — gives `matchTimeUtc`; used to upgrade a match to an exact time
- `entries/vue-tournament-event-stages` + `entries/vue-tournament-players-staged?searchKey=` (eventName 1 MS..5 XD); stages named Withdrawn/Reserve are ignored
- `vue-tournament-draws?tmtTab=draw&tmtId=` (draw id = entry with `text == event`, `qualification == 0`) +
  `vue-tournament-draw-data?tmtTab=draw&tmtId=&drawId=` — bracket keyed `"round-position"`, each `{match: {team1, team2, team1seed, winner, roundName}}`
- BWF ids and `search` names in config come from the player page URL (`bwfbadminton.com/player/<id>/<slug>`) and BWF display name (e.g. `CHEN Yu Fei`).

## data.json (schema_version 1)
```
{ schema_version, generated_at (UTC), timezone ("America/Detroit"),
  sports: [ { id, name,
    subjects: [ { id, name, short, updated_at, stale, error,
      team, color ("#RRGGBB"), image (headshot/logo/flag URL), badge (e.g. car number),
      ranking: { label, position, points, detail } | null,
      next: Event | null, last: Event | null } ] } ] }

Event = { title, subtitle, start, time_precision ("exact"|"date"),
          status ("scheduled"|"live"|"final"|"cancelled"),
          result: { outcome ("win"|"loss"|null), summary } | null,
          live: null,            # reserved for a future live mode
          url, location, image (e.g. country flag) — each may be null,
          competitors: [ Competitor ] | null,                       # head-to-head only
          sessions: [ { name, start, status, result } ] | null }   # F1 weekend only

Competitor = { name, short, name_zh, logo, score, games: [int] | null, winner, self,
               record, form }   # record/form: NHL pre-game only ("4-3-0", "L10 4-3-0 · W1")
ranking also has: note (string, e.g. NHL playoff picture / F1 gap), change (int, BWF weekly
  rank change, + = up).
Event also has:
  track = { points: [[x,y]...], sectors: [s2_start, s3_start] | null, w, h }   # F1 next event
  path  = [ { round, name, name_zh, logo, seed, rank, confirmed, pool,
              candidates: [ { name, name_zh, logo, seed, rank } ] | null } ]  # BWF knockout path
          # rank = current world rank (top 500, null if unranked or a new pair); candidates sorted by rank
  # NHL: [away, home], score = goals. Badminton: [self, opponent], games = per-game points, score = games won.
```
- Subject display fields (`team/color/image/badge`) come from the provider's
  optional `profile`; a same-named key in config.yaml overrides it (e.g. NHL `color`).
  So config must not use those keys for provider settings (NHL uses `abbrev`).
- `start` is UTC ISO (`...Z`) when `time_precision == "exact"`, or a plain date `YYYY-MM-DD`
  (tournament-local) when `"date"` — display it as-is, never convert it across timezones.
- Clients compute local time, countdown and the "started in last 24h" highlight themselves.
- F1 `next` = next session (FP/Sprint/Quali/Race); `sessions` lists the whole weekend with per-session results.
  F1 `last` = the latest Grand Prix **race** (not sprint, not the latest session).
- Badminton `next` = next drawn match, else the next World Tour tournament the player is entered in (`subtitle: null`), else null.

## Feature notes
- F1 track: outline from MultiViewer, rotated by its `rotation`, y flipped, downsampled to
  ~160 points, normalised to 100 on the long side. Sector starts: if MultiViewer has
  `miniSectorsIndexes`, S2 starts at `idx[n1-1]`, S3 at `idx[n1+n2-1]` where n1/n2 = len of
  OpenF1 `segments_sector_1/2` from a past lap at that circuit; otherwise the car's
  `/location` at lap start + S1 (+S2) duration is snapped to the nearest outline point.
  Both were checked against real car positions. Cached in `cache/track_<key>_<year>.json`.
- NHL playoff note: top 3 per division + WC1/WC2 per conference (`wildcardSequence`).
- BWF draw path: for round r the opponent comes from the sibling block of 2^(r-1)
  first-round slots; shows the actual opponent if only one team is alive there, else the
  best seed still alive (ties/unseeded: best world rank; `pool` = teams still possible).
  Played rounds are skipped. World ranks come from one top-500 ranking call per event
  (`_rank_map`, keyed by the pair's player ids). In the widget, clicking "等N队" toggles
  the full candidate list (DOM class toggle, not persisted).
- BWF Chinese names: `providers/badminton_names_zh.yaml` (display name → common Chinese
  name, matching ignores case/space/dot/hyphen). Untranslated players fall back to English surname.
- `extra_outputs` in config: best-effort copies of data.json (iCloud Drive
  `SportsTracker/data.json` for the future Scriptable widget). launchd can write there.
- Widget auto-collapse: a card collapses to one line unless something is live, starts
  within 48 h, or finished in the last 24 h. The chevron toggles; the manual choice is kept
  (localStorage `sports-tracker-fold`) until the automatic state flips.

## Gotchas
- Stale fallback is per subject: on any exception the subject keeps the previous
  `ranking/next/last`, sets `stale: true`, `error`, and keeps the old `updated_at`.
- `get_json` / BWF `_get` are `lru_cache`d, so shared calls (standings, calendar) run once per run.
- `data.json` is written via temp file + rename; readers never see partial JSON.
- A full run takes ~15 s (BWF is the slow part).
- Widget: refreshes every 60 s (just `cat`), highlights events that are live or
  started < 24 h ago (date-only: date == today in `timezone`) with an amber tint +
  "Last 24h"/"Today"/"Live" pill; title shortening ("Grand Prix" → "GP", drop year,
  drop leading all-caps sponsor words) is display-only.
- F1 driver row: car number (white), code + team, newest 3 session results of the current
  weekend (Q/SPR/SQ/FP), then LAST RACE and STANDINGS stat columns. No headshots (data still has `image`).
- Widget layout: `F1Card` (Box Box style: flag, countdown, session strip, driver rows
  in team colour) for sport id `f1`; every other sport uses the generic `H2HCard`
  (Apple Sports style: matchup with logos for `next`, score row or per-game board for `last`).
- Themes: F1 card gradient = the two drivers' team colours (Ferrari red → Red Bull blue);
  a single-subject H2H card uses the subject `color` (Sharks teal) + `.card.nhl` orange accents.
- Language: sports listed in `ZH_SPORTS` (badminton) render in Chinese (`T.zh`, `ZH_EVENTS`,
  `ZH_ROUNDS`, `ZH_TOURNAMENTS` substring map). Subject names come from config (Chinese);
  opponents stay as BWF gives them (English). The board shows the subject's `short` for our side.
- Position: drag any card header; offset saved in localStorage key `sports-tracker-pos`
  and applied as a transform on `[data-root]`; double-click a header resets it.
- Avoid `??` / `?.` in index.jsx — Übersicht 1.6 bundles an old Babel.
- The in-app browser pane throttles hidden tabs, so a preview may stay blank until the
  next 60 s refresh — not a widget bug.
- Visual check without screen access: open http://127.0.0.1:41416/ (Übersicht's
  own server) in a browser; it renders the same widgets (no wallpaper/blur).
- Übersicht compiles JSX to a global `html(...)`; never define a global named `html`
  when debugging in its page. Hidden browser panes may never render the widget
  (no rAF) — serialize `require('sports-tracker-widget-index-jsx').render({output})`
  into the widget div to preview instead.
- To test the widget build without touching the running app: start Übersicht's
  bundled `node-arm64 server.js -d widget -p 41500 -s <tmp>` and GET `/state/`.
- Code comments in concise English.
