# Sports tracker widget

Desktop widget (Übersicht) tracking followed F1 drivers, an NHL team and BWF players.
Data layer and display layer are separate: `fetch.py` writes `data.json`; any
client (Übersicht now, iOS Scriptable later) only reads `data.json`.

## Layout
- `config.yaml` — followed subjects, display order, timezone
- `fetch.py` — runs every provider, stale fallback, atomic write of `data.json`
- `providers/<sport>.py` — one module per sport, each exposes
  `fetch_subject(subject_cfg) -> {"ranking", "next", "last"}` and raises on failure;
  optionally `fetch_sport(sport_cfg) -> dict` merged into the sport entry (F1, NHL, badminton: `tables`)
- `providers/common.py` — `get_json` (urllib, cached per run), `event()`/`result()` builders
- `widget/sports-tracker.widget/index.jsx` — Übersicht widget (display only)
- `launchd/install.sh` + `*.plist.template` — scheduled jobs: `com.adaxu.sports-tracker`
  (full snapshot, every 30 min) and `com.adaxu.sports-tracker.live` (`fetch.py --live`, every 20 s)
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

## iOS version (`ios/`, Scriptable)
- `Sports Data.js` — Scriptable module, JS port of `providers/` + fetch.py producing the same
  schema (plus `country` ISO3 on badminton subjects/competitors and PNG flags, because widgets
  can't render SVG). Requests run in parallel (~4 s total). Cache: Scriptable local documents
  `sports-tracker/data.json`, refetched when older than 15 min; per-subject stale fallback and a
  25 s timeout per subject. Track outlines cached as `track_<key>_<year>.json`. Badminton Chinese
  names are fetched from this repo's raw `providers/badminton_names_zh.yaml` (cached 1 day).
- BWF does NOT block Apple's URL stack (tested with URLSession), unlike urllib/curl/Node.
- `Sports Tracker.js` — the widget: `CONFIG` at top (mirror of config.yaml); widget parameter
  `f1|nhl|badminton|empty`; families small / medium / large / accessory*. NHL logos are swapped
  to ESPN PNGs (`ESPN_NHL` code map). Tap → `scriptable:///run/...?view=detail` → WebView detail
  page (native `<details>` for the candidate lists). Running it in the app shows a preview menu.
- Install/update: `./ios/install.sh` copies both files to
  `~/Library/Mobile Documents/iCloud~dk~simonbs~Scriptable/Documents`.
- Testing without a phone (`ios/dev/`, Node = Übersicht's bundled `node-arm64`):
  `node ios/dev/test.js` runs `Sports Data.js` with Scriptable shims (BWF via `cffi.py`, since
  Node is blocked) → `ios/dev/out/data.json`, compare with the Mac's data.json;
  `node ios/dev/widgetmock.js` renders every widget size + the detail page to `ios/dev/out/www/`.
  NHL detail/live (`nhlDetail`, `nhlLive`), NHL standings tables (`nhlSport`, detail page: tap the
  rank) and badminton match detail (`dayRow`, `matchDetail`) are ported to iOS. iOS widgets: NHL matchup has a DrawContext rink as stack `backgroundImage`, last game
  is a scoreboard capsule; badminton uses `COURT_GREEN` + gold ranks. The detail page mirrors the
  desktop NHL card and badminton card (timeline path, court board, `scoreChartSVG`, stats), toggled by `gd(id)`.
- Widget runs call `load(CONFIG, { lite: true })`: `LITE` skips detail-only data (NHL landing,
  BWF h2h/match + draw paths + top-500 ranks, F1 tables — keeps previous tables, fetches only
  next_round). A full run (detail page, `force: true`) fetches everything. A widget run that runs
  out of memory/time is killed silently and iOS keeps the previous snapshot — keep widget work lean.
- iOS live NHL: only the detail page shows the live score (full run on open, clock ticks every
  second, PP/EN pill). Widgets show NO live score — just start time + "● LIVE" — because iOS
  throttles widget refreshes (asked for 1 min, got 5–15+ min; frozen scores looked broken, and
  per-minute full refreshes got the large widget killed). Widgets refresh every `REFRESH_MIN`.
  Widget background images (`bandsBackground`, `rinkImage`) render at 1x to save memory.
  Desktop PP/EN: amber "PP m:ss" pill counting down under the team; strength in the centre line.
- NHL widget matchup: equal fixed-width team columns + every middle row centred with spacers
  (a vstack's own centring was not reliable on device). Scriptable stacks only have
  top/center/bottomAlignContent — no left/right (a `rightAlignContent()` call crashed the widget).
- After installing, iOS keeps showing each home-screen widget's old snapshot until it refreshes
  (each widget separately; re-pick the script in Edit Widget to force it).
- F1 on iOS mirrors the desktop racing style. Widgets can't slant text, so they use
  `raceFont()` (HelveticaNeue-CondensedBlack) upright, and draw the slanted number plate
  (`plateImage`) and start lights (`lightsImage`) with DrawContext. The detail page (HTML) uses the same CSS as the
  desktop, including the timing-tower tables toggled by tapping LAST RACE / STANDINGS (`tbl()`).
  `Sports Data.js` has `f1Sport()` (= Python `fetch_sport`) for `tables` + `next_round`.
- Large widget = three full-bleed colour bands; medium F1 has the chequered strip. Bands, the
  left→right gradients and the chequered strip are painted into ONE `backgroundImage`
  (`bandsBackground`), which iOS stretches to the real widget size — never use fixed-width
  images/stacks: `largeSize()` (screen-size table, fallback ≈ 0.86×/0.9× screen width) did not
  match the user's phone exactly. Content stacks are transparent, width 0 (stretch), heights
  split by `share`. Gradient strips are opaque (alpha pre-mixed) so their overlaps don't seam.
- Widget memory is tight: no large images (flags are emoji via `flag()`, NHL logos via ESPN's
  96 px resizer), the BWF top-500 rank map is cached daily, and `load()` uses a 90 s lock so
  only one widget fetches at a time. Widget errors render as text instead of a blank widget.

## Data sources
| Sport | Source | Used for | Notes |
|---|---|---|---|
| F1 | OpenF1 `api.openf1.org/v1` | `meetings`, `sessions` (schedule), `session_result` (positions incl. practice), `drivers` | Free, but while ANY F1 session is live it answers 401 to everything (even past sessions) until it ends. All calls go through `_openf1` / iOS `openf1()`, which keep a last-good copy on disk (`cache/openf1/`, iOS `openf1_*.json`). |
| F1 | Jolpica `api.jolpi.ca/ergast/f1` | `current/driverStandings.json` | Ergast successor. ~4 req/s, 500 req/h limit. |
| F1 | ESPN `site.api.espn.com/apis/site/v2/sports/racing/f1/scoreboard` | current weekend: per-session status + finishing order (names only, no times/teams) | No key; not affected by OpenF1's live lockout. |
| F1 | MultiViewer `api.multiviewer.app/api/v1/circuits/{circuit_key}/{year}` | circuit outline `x/y`, `rotation`, `miniSectorsIndexes` | Unofficial. Some circuits (e.g. Singapore 61) have no mini-sector data. |
| NHL | `api-web.nhle.com/v1` | `club-schedule-season/{TEAM}/now`, `standings/now`, `gamecenter/{id}/landing` (goals, shootout, SOG, three stars) | Unofficial, undocumented, no key. |
| F1 | F1 live timing `livetiming.formula1.com/signalrcore` | live timing tower during sessions | No key (the old `/signalr` and `/static` need auth). SignalR Core over HTTP long polling: negotiate → handshake → Subscribe → read the completion (full current state). |
| Badminton | BWF `extranet-lv.bwfbadminton.com/api/` | rankings, player prev/next match, calendar, day schedule, entry lists | Undocumented. Cloudflare blocks urllib/curl (403); `curl_cffi` with `impersonate="chrome"` works. No token. |

BWF endpoints in use:
- `vue-rankingtable?rankId=2&catId={6 MS,7 WS,8 MD,9 WD,10 XD}&publicationId=0&doubles=...&searchKey=<BWF name>` (publicationId=0 = latest)
- `vue-player-match-previous` / `vue-player-match-next?playerId=...` — date only (`00:00:00`); `next` may return an already finished match, so always check `match_state == "F"`
- `vue-grouped-year-tournaments?year=&category[]=22..26` — World Tour calendar only (no Asian Games, Worlds, Olympics)
- `tournaments/day-matches?tournamentCode=&date=` — gives `matchTimeUtc` and the in-tournament match `code`
- `vue-tournament-detail?tmtId=` — tournament GUID `code` for ANY tournament (also non-World-Tour, e.g. Asian Games)
- `h2h/match?tmt_id=&match_code=` — match detail: duration, venue, stats (rallies won, longest run,
  game points) and `games[].match_set_details_model` = every rally's running score (may be empty)
- `entries/vue-tournament-event-stages` + `entries/vue-tournament-players-staged?searchKey=` (eventName 1 MS..5 XD); stages named Withdrawn/Reserve are ignored
- `vue-tournament-draws?tmtTab=draw&tmtId=` (draw id = entry with `text == event`, `qualification == 0`) +
  `vue-tournament-draw-data?tmtTab=draw&tmtId=&drawId=` — bracket keyed `"round-position"`, each `{match: {team1, team2, team1seed, winner, roundName}}`
- BWF ids and `search` names in config come from the player page URL (`bwfbadminton.com/player/<id>/<slug>`) and BWF display name (e.g. `CHEN Yu Fei`).

## data.json (schema_version 1)
```
{ schema_version, generated_at (UTC), timezone ("America/Detroit"),
  assets: { <image URL>: "data:...;base64,..." },   # inline BWF flags; clients use them first
  sports: [ { id, name,
    subjects: [ { id, name, short, updated_at, stale, error,
      team, color ("#RRGGBB"), image (headshot/logo/flag URL), badge (e.g. car number),
      ranking: { label, position, points, detail } | null,
      next: Event | null, last: Event | null } ] } ] }

Event = { title, subtitle, start, time_precision ("exact"|"date"),
          status ("scheduled"|"live"|"final"|"cancelled"),
          result: { outcome ("win"|"loss"|null), summary } | null,
          id,                    # source id (NHL game id) for live refresh
          live: { period ("1ST".."3RD"|"OT"|"SO"), clock, seconds, as_of, intermission, running,
                  sog: {away, home}, updated_at } | null,   # NHL, written by fetch.py --live while a game is on
          # seconds = clock seconds remaining, true at as_of (fetch time minus the CDN Age header)
          # live.situation = { team, label ("PP"/"EN"), strength "5v4", seconds } | null — power play /
          #   empty net from landing `situation`; its seconds count down with the game clock
          url, location, image (e.g. country flag) — each may be null,
          competitors: [ Competitor ] | null,                       # head-to-head only
          sessions: [ { name, start, status, result } ] | null }   # F1 weekend only

Sport entry may also have (F1 and NHL):
  tables = { last_race: Table, standings: Table }, tables_stale (bool; last good copy kept on failure)
  next_round (int, F1 round number of the next race)
  Table = { title, subtitle, rows: [ { pos, code, name, team, color, value, extra, self } ] }
  # F1 last_race value = winner time / gap / "+N Lap(s)" / "DNF", extra = "+pts"; standings value = points, extra = "NW",
  #   change = places moved since the previous round (Jolpica current/{round-1}/driverStandings; also ranking.change)
  # NHL tables = { division, wildcard }: rows add logo, gp, cut (last playoff spot: 3rd in division / WC2);
  #   value = points, extra = "W-L-OT", change = places moved since before our last game (see below).
  # Badminton tables = { <event code e.g. MD/WS>: Table }: BWF world top 10 (one rankingtable call
  #   per followed event); rows add name_zh, logo = flag, team = country, value = points ("95,089"),
  #   extra = weekly rank change (int, + = up), self = followed pair/player.

Competitor = { name, short, name_zh, logo, score, games: [int] | null, winner, self,
               record, form }   # record/form: NHL pre-game only ("4-3-0", "L10 4-3-0 · W1")
ranking also has: note (string, e.g. NHL playoff picture / F1 gap), change (int, BWF weekly
  rank change, + = up).
Event also has:
  track = { points: [[x,y]...], sectors: [s2_start, s3_start] | null, w, h }   # F1 next event
  path  = [ { round, name, name_zh, logo, seed, rank, confirmed, pool,
              candidates: [ { name, name_zh, logo, seed, rank } ] | null } ]  # BWF knockout path
          # rank = current world rank (top 500, null if unranked or a new pair); candidates sorted by rank
  detail = { goals: [ { period ("1"|"2"|"3"|"OT"), time, team, scorer, scorer_total, assists: [..],
              strength ("PP"|"SH"|null), empty_net, score ("away–home") } ],
            shootout: [ { team, player, result ("goal"|"save"|"miss"), winner } ],
            sog: { away, home }, stars: [ { star, team, name, pos, line } ],
            stats: [ { key, label, away, home, a, h } ] | null }   # NHL finished/live game
  # stats = team game stats from gamecenter/{id}/right-rail (power play "2/5", PIM, faceoff %, hits,
  #   blocked shots, giveaways, takeaways); away/home = display strings, a/h = numbers for the bar
  #   (power play bar compares PP goals). One extra request per game; the live job fetches it uncached.
  # badminton finished match: detail = { duration, venue, games: [ { self, opp, points: [[self, opp]...] } ],
  #   stats: { rallies_won, max_streak, game_points } as [self, opp] }   (points empty if BWF has none)
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
  For an entered tournament (from the day before it starts), `_scheduled_match` / iOS `scheduledMatch`
  scans its published day schedules (`tournaments/day-matches`, one per day until an unpublished
  day) for the player and returns that match with the exact `matchTimeUtc`, round, opponent and
  court. vue-player-match-next often stays empty until shortly before the match, while the order
  of play comes out the evening before. Day-schedule country codes are IOC (DEN, TPE, MAS).
  BWF's flag CDN (`flag-circle-svg-custom/<code>.png`) is keyed by IOC code, but player models give
  ISO3 for some countries (TWN, IDN...): iOS `FLAG_PNG` maps them via `IOC` (TWN.png is a 404).
  Later rows can say `oopText` "Court and time TBA": their matchTimeUtc is BWF's provisional slot.
- BWF flags on the desktop: Übersicht's WebKit had random flags blocked (BWF Cloudflare) although
  the URLs are fine. Providers may expose `assets(sport_entry) -> {url: data URI}`; badminton
  downloads every flag URL in its entry once with curl_cffi into `cache/flags/` and fetch.py writes
  them as top-level `assets` (~190 KB). The widget's `Img` uses `ASSETS[src] || src`. iOS loads
  flags itself (Apple's stack isn't blocked) and ignores `assets`.
- Badminton live (desktop): `tournaments/day-matches` rows carry `matchStatus` (N scheduled, P in
  progress, O off court, F finished), `score` [{set, home, away, serve}] (home = team1) and elapsed
  `time`; CDN max-age 10 s. Badminton next events get `id` = "<tournament code>|<date>|<match id>";
  `refresh_live` polls that row from −15 min to +4 h around the (often provisional) start: P → status
  live + `live` { period "G2", games [[self, opp]...] incl. the current game, serve "self"/"opp",
  court, elapsed } and competitor games/score (games won); a row with a winner → full
  `fetch_subject()`. `carry_live` keeps live status/scores across full runs (BWF's player API never
  says "in progress"). Desktop Matchup: current game big, "第N局 · elapsed · court", finished games
  + games won, gold dot by the server. iOS does not show badminton live (widgets show no live scores).
- Narrow matchup columns (desktop `Matchup`, iOS detail `.team`) shorten a doubles pair of 2–3-character
  CJK names to its surnames via `pairShort` (4-character Japanese names stay whole) ("梁伟铿 / 王昶" → "梁王"); boards and lists keep full names.

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
- `extra_outputs` in config (optional, none set): best-effort extra copies of data.json.
  Not needed by the iOS widget, which fetches on the phone.
- Widget auto-collapse: a card collapses to one line unless something is live, starts
  within 48 h, or finished in the last 24 h. The chevron toggles; the manual choice is kept
  (localStorage `sports-tracker-fold`) until the automatic state flips.

## Gotchas
- Stale fallback is per subject: on any exception the subject keeps the previous
  `ranking/next/last`, sets `stale: true`, `error`, and keeps the old `updated_at`.
- `get_json` / BWF `_get` are `lru_cache`d, so shared calls (standings, calendar) run once per run.
- `data.json` is written via temp file + rename; readers never see partial JSON.
- A full run takes ~15 s (BWF is the slow part).
- Full runs first wait up to 120 s for DNS (`wait_for_network`): a run right after the Mac wakes
  used to start before the network was back, fail every source ("8 failed") and leave everything
  stale for 30 min. If still offline it fetches anyway (stale fallback). The live job does not wait.
- A scheduled event whose start time has passed but is not live yet (NHL "PRE", delays) shows
  "Starting soon" / "即将开始", not "started". The live job ignores PRE and updates once LIVE.
- Widget: refreshes every 15 s (just `cat`; keeps live scores fresh), highlights events that are live or
  started < 24 h ago (date-only: date == today in `timezone`) with an amber tint +
  "Last 24h"/"Today"/"Live" pill; title shortening ("Grand Prix" → "GP", drop year,
  drop leading all-caps sponsor words) is display-only.
- F1 tables: clicking a driver's LAST RACE / STANDINGS stat toggles the full Jolpica
  classification / standings below the driver rows (one open at a time; followed drivers highlighted).
  Lapped cars' Jolpica times are measured a lap down, so they're shown as "+N Lap(s)".
- F1 visual style ("racing"): `.f1x` = Helvetica Neue Condensed Black + italic for headings
  and numbers; chequered strip on the card top (conic-gradient); carbon weave layered over the
  team-colour gradient; ROUND n chip from sport `next_round` (Jolpica current/next.json);
  start lights next to the countdown (lit = 5 − whole days left, all off + "LIGHTS OUT" when
  live); slanted (skewX −12°) session chips and team-colour number plates; tables styled as a
  timing tower (zebra rows, monospace times, team-colour edge on followed drivers).
- F1 during an OpenF1 lockout: schedule = cached OpenF1, else Jolpica `current.json` (`_jolpica_sessions`,
  typical durations, no circuit/flag); session status/results of the current weekend = ESPN
  (`_espn_weekend`, matched by session name + start ±6 h, drivers by accent-folded surname);
  last race result = Jolpica (`_jolpica_race_result`); team/colour/track/flag carried over from the
  previous snapshot (`carry_missing` / iOS `carryMissing`); table colours fall back to `TEAM_COLOURS`
  (OpenF1 2026 team_colour by folded team name, `_team_colour` / iOS `teamColour`). Sport table `last_session` = latest
  finished non-race session of the weekend: OpenF1 `_openf1_session_table` when reachable (value =
  best lap "1:34.893" — qualifying uses the furthest Q segment reached; extra = gap "+0.168"; `tyre` =
  compound of that best lap from `laps` + `stints`: SOFT/MEDIUM/HARD/INTERMEDIATE/WET), else ESPN's
  order (code/team from Jolpica standings, no times/tyres). Tables render the tyre as a Pirelli-
  coloured letter (`Tyre` / iOS `tyreHTML`) when any row has one.
- F1 driver row: car number (on plate), code + team, newest 3 session results of the current
  weekend (Q/SPR/SQ/FP), then LATEST (newest finished session this weekend, else the last race;
  click → `tables.last_session || tables.last_race`) and STANDINGS stat columns (▲/▼ since the previous round;
  iOS caches each finished round's standings as `f1_standings_<season>_<round>.json`). No headshots (data still has `image`).
- Widget layout: `F1Card` (Box Box style: flag, countdown, session strip, driver rows
  in team colour) for sport id `f1`; every other sport uses the generic `H2HCard`
  (Apple Sports style: matchup with logos for `next`, score row or per-game board for `last`).
- F1 live timing (desktop): providers may expose `refresh_live_sport(sport_cfg, entry)`; the live job
  merges its dict into the sport entry (`{"live": None}` clears). F1 takes one `_live_snapshot()`
  per tick (curl_cffi; topics SessionInfo, SessionStatus, ExtrapolatedClock, TimingData,
  TimingAppData, DriverList, LapCount) while a scheduled session is within −5 min…+15 min
  (`_live_window`, schedule from the OpenF1 cache / Jolpica). Sport `live` = { session, part ("Q2",
  from TimingData.SessionPart), status, remaining + clock_utc + running (session clock), laps,
  rows: [ { pos, number, code, team, color, value (best lap; races: last lap), best, extra (gap:
  races GapToLeader, else best − P1 best), tyre (current stint compound), laps, pit, out, self } ],
  as_of }. Widget `liveF1` uses it only if as_of < 3 min old: `LiveTower` (open, red dot, clock via
  LiveClock, PIT tag, out rows dimmed) above the session tables, and the driver's stat shows LIVE P#
  + best lap. iOS has no F1 live timing yet.
- NHL live mode: `fetch.py --live` calls providers' optional `refresh_live(cfg, subject)`.
  NHL polls `gamecenter/{id}/landing` only if the next game is live or within −15 min…+5 h of
  its start (otherwise no request); updates score, `live`, `detail` (goals so far). When the
  game reports FINAL it returns a full `fetch_subject()` so last/next roll over. Writes only
  when something changed; logs to `logs/live.log`. Latency budget: NHL CDN caches the landing
  ~19 s (`max-age=19`), job every 20 s, widget re-read every 15 s → live data ≲ 40 s behind.
  Was 60 s + 60 s, which looked "stuck" during play. Python's default urllib UA gets 403 from
  the NHL CDN; providers send their own UA.
- NHL rank change: `ranking.change` and each table row's `change` = position the day before the
  followed team's last regular-season game (`standings/{date}` = end of that US date, one extra call)
  minus the position now (+ = up; division rank for the chip/division table, wild-card rank for the
  wild-card table). Shown as ▲/▼ on the rank chip, a column in the standings tables, and on the iOS
  widget header (only when non-zero). iOS caches each past day's standings on disk (`nhl_standings_<date>.json`).
- Post-game standings: the NHL updates standings/now a few minutes after the final horn, so a
  run right after a game can still have the old record. `fetch_subject` sets `ranking.pending`
  when standings GP < regular-season games final in the schedule; while pending (≤ 8 h after
  the game) the live job re-checks standings each tick and, once the record changes, returns a
  full `fetch_subject()` + `refresh_sport` → fetch.py also refreshes the sport `tables`.
- Live clock countdown: `LiveClock` renders a span with data-sec / data-asof / data-running and a
  module-level 1 s `setInterval` (`window.__sportsClockTicker`) counts it down locally while
  running; each 15 s re-render replaces the span → corrected by the latest poll (whistles cause
  a small overshoot until then). Not running / intermission → static. The 30-min full run keeps
  the live job's last `live` for the same game id (`carry_live`) so the clock never blanks.
- NHL card ("hockey", refined): next game on a faint ice sheet (`RinkLines`: goal lines and
  creases at the ends, blue lines beside the logos, red line only as ticks at the boards —
  nothing crosses the text), team logo + record + streak chip. Live: big score, red dot +
  period/clock (or "INT"), SOG; clicking the live matchup opens `GameDetail` (started periods
  only). Last game = symmetric scoreboard capsule (away · FINAL[/OT/SO] · home, loser dimmed);
  click toggles `GameDetail`: two-sided SOG bar, team-stat bars, goals by period (time chip, scorer (total),
  PP/SH/EN tags, assists, running score with the scoring side bold), shootout dots, three
  stars as three cards. Only the NHL uses these (`Subject` gets `sportId`). Clicking the
  "Pacific #5" rank toggles `NHLStandings` (division + wild card tables, followed team
  highlighted, red rule under the last playoff spot).
- Übersicht must be running for the desktop widget: it lives in /Applications and needs
  "Launch Übersicht when I login" ticked (the user's setting). The launchd data job is separate.
- Badminton rank ("男双 #2") is clickable like the NHL rank: toggles `BWFRanking`, the world top 10
  for that event (Chinese names, flags, weekly change, points; followed entry highlighted gold).
  iOS: `bwfSport()` in Sports Data.js (full runs only; lite runs keep the previous tables), detail
  page rank tap → `gd('wr_<subject id>')` panel (class `wrk`; `.wr` is taken by the candidate list).
- Badminton card: court-green gradient, shuttlecock icon in the header, draw path as a vertical
  timeline (solid dot = confirmed opponent, hollow = possible), last match board on faint court lines
  (`CourtLines`); clicking it toggles `BadmintonDetail`: duration/venue chips, `ScoreChart` (one
  section per game, our running score gold vs opponent white, game score labels), two-sided bars
  for points won / longest run / game points. Shows "暂无逐分数据" when there are no rallies.
- Themes: F1 card gradient = the two drivers' team colours (Ferrari red → Red Bull blue);
  a single-subject H2H card uses the subject `color` (Sharks teal) + `.card.nhl` orange accents.
- Language: sports listed in `ZH_SPORTS` (badminton) render in Chinese (`T.zh`, `ZH_EVENTS`,
  `ZH_ROUNDS`, `ZH_TOURNAMENTS` substring map). Subject names come from config (Chinese);
  opponents stay as BWF gives them (English). The board shows the subject's `short` for our side.
- Position: drag any card header; offset saved in localStorage key `sports-tracker-pos`
  and applied as a transform on `[data-root]`; double-click a header resets it.
  `[data-root]` is capped at the screen height below its offset (`applyPos`: max-height
  calc(100vh − 20px − y)) and scrolls (hidden scrollbar); the element survives re-renders, so the
  scroll position is kept across the 15 s refresh.
  `clampPos` keeps the offset on the current screen (an offset of x −1532 saved on a wider /
  second display once put the whole widget off the 1512-pt laptop screen).
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
