# Sports Tracker Widget

[中文说明](README.zh-CN.md)

A compact macOS desktop widget ([Übersicht](https://tracesof.net/uebersicht/)) that tracks the
athletes and teams you follow: F1 drivers, an NHL team and BWF badminton players.

- **F1**: next session countdown, full weekend schedule, circuit map split into S1/S2/S3,
  per-driver last race result, championship position and this weekend's session results.
- **NHL**: next game (Apple Sports style matchup with records and last-10 form), last result,
  division rank and playoff picture (wild-card position, points from the cut line).
- **Badminton**: world ranking with weekly ▲▼ change, last match scoreboard, next match or
  next tournament entered, and the knockout path with every possible opponent per round
  (click "等N队" / "+N" to expand).
- Events that started within the last 24 h are highlighted; sports with nothing happening
  soon collapse to one line. The widget can be dragged anywhere.

The data layer and display layer are separate: `fetch.py` writes one generic `data.json`
that any client can read (the Übersicht widget now, an iOS Scriptable widget later).

## Requirements

- macOS with Python 3.9+ (the system `python3` is fine)
- [Übersicht](https://tracesof.net/uebersicht/)

## Setup

```bash
git clone git@github.com:Caranthir-Xu/sports-tracker-widget.git
cd sports-tracker-widget
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python fetch.py          # test run, writes ./data.json
./launchd/install.sh               # deploy and run every 30 minutes
```

Then open Übersicht → Preferences → **Widgets Folder** and choose this repo's `widget/` folder.

`install.sh` copies the data layer to `~/Library/Application Support/sports-tracker/`,
because macOS privacy rules stop launchd jobs from reading `~/Documents`. Re-run it after
changing `fetch.py`, `providers/` or `config.yaml`. `./launchd/install.sh remove` uninstalls.

## Configuration

Edit `config.yaml` to choose who to follow, the timezone and extra output paths
(e.g. an iCloud Drive copy of `data.json`). Each sport has a provider in `providers/`
with the same interface: `fetch_subject(subject) -> {ranking, next, last, profile}`.
If one source fails, that subject keeps its last good data and is marked stale.

Chinese names for badminton players live in `providers/badminton_names_zh.yaml`.

## Data sources

All free, no API keys. Most are unofficial and may change without notice.

| Sport | Source |
|---|---|
| F1 | [OpenF1](https://openf1.org) (schedule, results), [Jolpica](https://github.com/jolpica/jolpica-f1) (standings), MultiViewer (circuit outlines) |
| NHL | `api-web.nhle.com` (unofficial NHL API) |
| Badminton | BWF website's internal API (behind Cloudflare; requested via `curl_cffi`) |

See [CLAUDE.md](CLAUDE.md) for the `data.json` schema, endpoint details and gotchas.

For personal use. Not affiliated with Formula 1, the NHL or the BWF.
