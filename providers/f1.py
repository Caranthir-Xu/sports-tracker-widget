"""F1: schedule + session results from OpenF1, standings from Jolpica,
circuit outline from MultiViewer (unofficial, free)."""
import json
from functools import lru_cache
import math
from datetime import datetime, timezone
from pathlib import Path

from .common import get_json, now_utc, parse_dt, iso, event, result

OPENF1 = "https://api.openf1.org/v1"
JOLPICA = "https://api.jolpi.ca/ergast/f1"
MULTIVIEWER = "https://api.multiviewer.app/api/v1/circuits"
CACHE = Path(__file__).resolve().parent.parent / "cache"
TRACK_POINTS = 160  # outline resolution after downsampling
TRACK_BOX = 100     # longest side of the normalised outline

SHORT_NAMES = {
    "Practice 1": "FP1", "Practice 2": "FP2", "Practice 3": "FP3",
    "Sprint Qualifying": "Sprint Quali", "Sprint Shootout": "Sprint Quali",
}


def _sessions():
    """All sessions of this season (and next, near season end), sorted by start."""
    year = now_utc().year
    out = []
    for y in (year, year + 1):
        meetings = {m["meeting_key"]: m for m in get_json(f"{OPENF1}/meetings?year={y}")}
        for s in get_json(f"{OPENF1}/sessions?year={y}"):
            m = meetings.get(s["meeting_key"], {})
            s["meeting_name"] = m.get("meeting_name", s.get("location"))
            s["flag"] = m.get("country_flag")
            out.append(s)
        if any(parse_dt(s["date_end"]) > now_utc() for s in out):
            break  # current season still has sessions ahead
    return sorted(out, key=lambda s: s["date_start"])


def _reference_lap(circuit_key):
    """A clean lap (lap 5) from the most recent past session at this circuit."""
    past = [s for s in get_json(f"{OPENF1}/sessions?circuit_key={circuit_key}")
            if parse_dt(s["date_end"]) < now_utc()]
    for s in sorted(past, key=lambda s: s["date_start"], reverse=True)[:4]:
        try:
            laps = get_json(f"{OPENF1}/laps?session_key={s['session_key']}&lap_number=5")
        except Exception:
            continue  # OpenF1 answers 404 when a session has no lap data
        for lap in laps:
            if lap.get("segments_sector_1") and lap.get("duration_sector_2") and lap.get("date_start"):
                return lap
    return None


def _iso_ms(ts):
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")


def _sector_indexes(mv, pts, lap):
    """Raw track point indexes where S2 and S3 start."""
    idx = mv.get("miniSectorsIndexes") or []
    n1, n2 = len(lap["segments_sector_1"]), len(lap.get("segments_sector_2") or [])
    if n2 and len(idx) >= n1 + n2:
        # S2 starts after S1's mini-sectors, S3 after S2's (checked against car positions).
        return [idx[n1 - 1], idx[n1 + n2 - 1]]

    # No mini-sector data: find where the car was when S1 and S2 ended.
    start = parse_dt(lap["date_start"]).timestamp()
    out = []
    for secs in (lap["duration_sector_1"], lap["duration_sector_1"] + lap["duration_sector_2"]):
        lo, hi = _iso_ms(start + secs - 0.6), _iso_ms(start + secs + 0.6)
        loc = get_json(f"{OPENF1}/location?session_key={lap['session_key']}"
                       f"&driver_number={lap['driver_number']}&date>{lo}&date<{hi}")
        if not loc:
            return None
        p = loc[len(loc) // 2]
        out.append(min(range(len(pts)),
                       key=lambda i: (pts[i][0] - p["x"]) ** 2 + (pts[i][1] - p["y"]) ** 2))
    return out


def _build_track(circuit_key, year):
    mv = None
    for y in (year, year - 1, year - 2):
        try:
            mv = get_json(f"{MULTIVIEWER}/{circuit_key}/{y}")
            break
        except Exception:
            continue
    if not mv:
        return None

    raw = list(zip(mv["x"], mv["y"]))
    lap = _reference_lap(circuit_key)
    sectors = _sector_indexes(mv, raw, lap) if lap else None

    # Rotate to the usual broadcast orientation; flip y for SVG.
    rot = math.radians(mv.get("rotation") or 0)
    pts = [(x * math.cos(rot) - y * math.sin(rot), -(x * math.sin(rot) + y * math.cos(rot)))
           for x, y in raw]

    step = max(1, len(pts) // TRACK_POINTS)
    keep = list(range(0, len(pts), step))
    xs, ys = [pts[i][0] for i in keep], [pts[i][1] for i in keep]
    scale = TRACK_BOX / max(max(xs) - min(xs), max(ys) - min(ys))
    out = [[round((x - min(xs)) * scale, 1), round((y - min(ys)) * scale, 1)] for x, y in zip(xs, ys)]
    return {
        "points": out,
        "sectors": [i // step for i in sectors] if sectors else None,
        "w": round((max(xs) - min(xs)) * scale, 1),
        "h": round((max(ys) - min(ys)) * scale, 1),
    }


def _track(circuit_key, year):
    """Circuit outline, cached on disk per circuit (it never changes mid-season)."""
    path = CACHE / f"track_{circuit_key}_{year}.json"
    if path.exists():
        return json.loads(path.read_text())
    track = _build_track(circuit_key, year)
    if track and track["sectors"]:  # only cache complete results
        CACHE.mkdir(exist_ok=True)
        path.write_text(json.dumps(track))
    return track


def _status(s):
    if s.get("is_cancelled"):
        return "cancelled"
    now = now_utc()
    if now < parse_dt(s["date_start"]):
        return "scheduled"
    return "live" if now < parse_dt(s["date_end"]) else "final"


def _result(s, number):
    """Driver's classification in a finished session, or None if not published."""
    if _status(s) != "final":
        return None
    rows = get_json(f"{OPENF1}/session_result?session_key={s['session_key']}")
    row = next((r for r in rows if r["driver_number"] == number), None)
    if not row:
        return None
    for flag in ("dsq", "dns", "dnf"):
        if row.get(flag):
            return result(flag.upper())
    pos = row.get("position")
    return result(f"P{pos}" if pos else "NC")


def _event(s, number, sessions=None, track=None):
    name = s["session_name"]
    return event(
        title=s["meeting_name"],
        subtitle=SHORT_NAMES.get(name, name),
        start=iso(parse_dt(s["date_start"])),
        status=_status(s),
        result=_result(s, number),
        sessions=sessions,
        location=s.get("location"),
        image=s.get("flag"),
        track=track,
    )


def _profile(number):
    """Team name/colour and headshot from the latest session's driver list."""
    for d in get_json(f"{OPENF1}/drivers?session_key=latest"):
        if d["driver_number"] == number:
            colour = d.get("team_colour")
            return {"team": d.get("team_name"),
                    "color": f"#{colour}" if colour else None,
                    "image": d.get("headshot_url"),
                    "badge": str(number)}
    return {"badge": str(number)}


@lru_cache(maxsize=None)
def _prev_positions():
    """{driverId: position} after the previous round, for standings change. {} if unknown."""
    try:
        lists = get_json(f"{JOLPICA}/current/driverStandings.json")["MRData"]["StandingsTable"]["StandingsLists"]
        rnd = int(lists[0]["round"]) if lists else 0
        if rnd < 2:
            return {}
        prev = get_json(f"{JOLPICA}/current/{rnd - 1}/driverStandings.json")["MRData"]["StandingsTable"]["StandingsLists"]
        return {d["Driver"]["driverId"]: int(d["position"]) for d in (prev[0]["DriverStandings"] if prev else [])}
    except Exception:
        return {}  # change is optional


def _change(driver_id, pos):
    """Places moved since the previous round (+ = up); None when unknown."""
    old = _prev_positions().get(driver_id)
    return old - pos if old else None


def _ranking(jolpica_id):
    table = get_json(f"{JOLPICA}/current/driverStandings.json")
    lists = table["MRData"]["StandingsTable"]["StandingsLists"]
    rows = lists[0]["DriverStandings"] if lists else []
    for d in rows:
        if d["Driver"]["driverId"] == jolpica_id:
            wins = int(d["wins"])
            gap = float(rows[0]["points"]) - float(d["points"])
            return {
                "label": "Drivers",
                "position": int(d["position"]),
                "points": float(d["points"]),
                "detail": f"{wins} win{'s' if wins != 1 else ''}",
                "note": "Championship leader" if d is rows[0] else f"{gap:.0f} pts behind leader",
                "change": _change(jolpica_id, int(d["position"])),
            }
    return None


def fetch_subject(subj):
    number = subj["number"]
    sessions = [s for s in _sessions() if not s.get("is_cancelled")]
    now = now_utc()

    upcoming = [s for s in sessions if parse_dt(s["date_end"]) > now]
    done = [s for s in sessions if parse_dt(s["date_end"]) <= now]

    nxt = None
    if upcoming:
        first = upcoming[0]
        weekend = [s for s in sessions if s["meeting_key"] == first["meeting_key"]]
        listing = [{
            "name": SHORT_NAMES.get(s["session_name"], s["session_name"]),
            "start": iso(parse_dt(s["date_start"])),
            "status": _status(s),
            "result": _result(s, number),
        } for s in weekend]
        try:
            track = _track(first["circuit_key"], first["year"])
        except Exception:
            track = None  # optional extra; never fail the subject for it
        nxt = _event(first, number, sessions=listing, track=track)

    # 'last' = the latest Grand Prix race; weekend session results live in next.sessions.
    races = [s for s in done if s["session_name"] == "Race"]
    last = _event(races[-1], number) if races else None
    return {"ranking": _ranking(subj["jolpica_id"]), "next": nxt, "last": last,
            "profile": _profile(number)}


def _team_colours():
    """Driver code -> '#RRGGBB' from the latest session's driver list."""
    return {d["name_acronym"]: f"#{d['team_colour']}"
            for d in get_json(f"{OPENF1}/drivers?session_key=latest") if d.get("team_colour")}


def fetch_sport(sport_cfg):
    """Sport-level tables shared by all drivers: last race classification, driver standings."""
    followed = {s["jolpica_id"] for s in sport_cfg["subjects"]}
    colours = _team_colours()

    def row(pos, d, team, value, extra):
        return {"pos": pos, "code": d["code"], "name": f"{d['givenName']} {d['familyName']}",
                "team": team, "color": colours.get(d["code"]), "value": value, "extra": extra,
                "self": d["driverId"] in followed}

    race = get_json(f"{JOLPICA}/current/last/results.json")["MRData"]["RaceTable"]["Races"][0]
    lead_laps = int(race["Results"][0]["laps"])

    def gap(r):
        # Lapped cars' times are measured a lap down, so show laps like the official classification.
        if r["status"] == "Finished":
            return r["Time"]["time"]
        down = lead_laps - int(r["laps"])
        if r["status"] == "Lapped" or r["status"].startswith("+"):
            return f"+{down} Lap{'s' if down > 1 else ''}"
        return "DNF" if r["status"] == "Retired" else r["status"]

    results = [row(int(r["position"]), r["Driver"], r["Constructor"]["name"], gap(r),
                   f"+{r['points']}" if float(r["points"]) else "")
               for r in race["Results"]]

    lists = get_json(f"{JOLPICA}/current/driverStandings.json")["MRData"]["StandingsTable"]["StandingsLists"]
    standings = [dict(row(int(d["position"]), d["Driver"], d["Constructors"][-1]["name"],
                          f"{float(d['points']):g}", f"{d['wins']}W" if int(d["wins"]) else ""),
                      change=_change(d["Driver"]["driverId"], int(d["position"])))
                 for d in (lists[0]["DriverStandings"] if lists else [])]

    nxt = get_json(f"{JOLPICA}/current/next.json")["MRData"]["RaceTable"]["Races"]
    return {"next_round": int(nxt[0]["round"]) if nxt else None, "tables": {
        "last_race": {"title": race["raceName"], "subtitle": f"Round {race['round']} · {race['date']}",
                      "rows": results},
        "standings": {"title": "Driver standings",
                      "subtitle": f"After round {lists[0]['round']}" if lists else None,
                      "rows": standings},
    }}
