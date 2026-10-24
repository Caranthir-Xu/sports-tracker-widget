"""F1: schedule + session results from OpenF1, standings from Jolpica,
circuit outline from MultiViewer (unofficial, free), current-weekend session
status/results from ESPN (OpenF1 locks all free access while a session is live)."""
import hashlib
import json
import unicodedata
from functools import lru_cache
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .common import get_json, now_utc, parse_dt, iso, event, result

OPENF1 = "https://api.openf1.org/v1"
JOLPICA = "https://api.jolpi.ca/ergast/f1"
MULTIVIEWER = "https://api.multiviewer.app/api/v1/circuits"
ESPN = "https://site.api.espn.com/apis/site/v2/sports/racing/f1/scoreboard"
CACHE = Path(__file__).resolve().parent.parent / "cache"
TRACK_POINTS = 160  # outline resolution after downsampling
TRACK_BOX = 100     # longest side of the normalised outline

SHORT_NAMES = {
    "Practice 1": "FP1", "Practice 2": "FP2", "Practice 3": "FP3",
    "Sprint Qualifying": "Sprint Quali", "Sprint Shootout": "Sprint Quali",
}


def _openf1(path):
    """OpenF1 GET with a last-good disk copy: while any F1 session is live OpenF1 answers 401
    for everything (even past sessions) until it ends, which used to leave F1 stale for hours."""
    f = CACHE / "openf1" / (hashlib.sha1(path.encode()).hexdigest()[:16] + ".json")
    try:
        data = get_json(f"{OPENF1}/{path}")
    except Exception:
        if f.exists():
            return json.loads(f.read_text())
        raise
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(data))
    return data


ESPN_NAMES = {"FP1": "FP1", "FP2": "FP2", "FP3": "FP3", "QUAL": "Qualifying", "RACE": "Race",
              "SPRINT": "Sprint", "SR": "Sprint", "SS": "Sprint Quali", "SQ": "Sprint Quali"}


def _fold(name):
    """'Nico Hülkenberg' -> 'hulkenberg' (surname, accents stripped) for matching across sources."""
    last = (name or "").split()[-1] if name else ""
    return unicodedata.normalize("NFKD", last).encode("ascii", "ignore").decode().lower()


@lru_cache(maxsize=None)
def _espn_weekend():
    """{short session name: {"state", "order": [surname...]}} for ESPN's current F1 event.
    state: "final" (results in), "live", or "scheduled". {} when ESPN is unavailable."""
    try:
        events = get_json(ESPN).get("events") or []
    except Exception:
        return {}
    out = {}
    for e in events[:1]:
        for c in e.get("competitions") or []:
            name = ESPN_NAMES.get(((c.get("type") or {}).get("abbreviation") or "").upper())
            if not name:
                continue
            st = ((c.get("status") or {}).get("type") or {})
            order = [_fold((x.get("athlete") or {}).get("fullName"))
                     for x in sorted(c.get("competitors") or [], key=lambda x: x.get("order") or 99)]
            done = st.get("completed") or st.get("name") in ("STATUS_FINAL", "STATUS_SESSION_COMPLETE")
            state = "final" if done and order else "live" if st.get("state") == "in" else "scheduled"
            out[name] = {"state": state, "order": order, "date": c.get("date")}
    return out


def _espn_for(s):
    """ESPN entry for an OpenF1 session of the current weekend (matched by name and start)."""
    e = _espn_weekend().get(SHORT_NAMES.get(s["session_name"], s["session_name"]))
    if e and e.get("date") and abs((parse_dt(e["date"]) - parse_dt(s["date_start"])).total_seconds()) < 6 * 3600:
        return e
    return None


# Jolpica schedule keys -> OpenF1 session names and typical length (for date_end).
JOLPICA_SESSIONS = [("FirstPractice", "Practice 1", 60), ("SecondPractice", "Practice 2", 60),
                    ("ThirdPractice", "Practice 3", 60), ("SprintQualifying", "Sprint Qualifying", 45),
                    ("Sprint", "Sprint", 60), ("Qualifying", "Qualifying", 60), (None, "Race", 120)]


def _jolpica_sessions():
    """Season schedule from Jolpica in OpenF1's shape, used when OpenF1 is locked and nothing is
    cached. No circuit_key/flag: fetch.py carries track and flag over from the previous snapshot."""
    out = []
    for r in get_json(f"{JOLPICA}/current.json")["MRData"]["RaceTable"]["Races"]:
        for key, name, minutes in JOLPICA_SESSIONS:
            slot = r if key is None else r.get(key)
            if not slot or not slot.get("time"):
                continue
            start = parse_dt(f"{slot['date']}T{slot['time']}")
            out.append({"session_name": name, "date_start": iso(start),
                        "date_end": iso(start + timedelta(minutes=minutes)),
                        "meeting_key": f"jolpica-{r['season']}-{r['round']}", "meeting_name": r["raceName"],
                        "location": r["Circuit"]["Location"]["locality"], "flag": None,
                        "session_key": None, "circuit_key": None, "year": int(r["season"])})
    return sorted(out, key=lambda s: s["date_start"])


def _sessions():
    """All sessions of this season (and next, near season end), sorted by start.
    OpenF1 (or its last-good copy), else Jolpica's schedule."""
    try:
        return _openf1_sessions()
    except Exception:
        return _jolpica_sessions()


def _openf1_sessions():
    year = now_utc().year
    out = []
    for y in (year, year + 1):
        meetings = {m["meeting_key"]: m for m in _openf1(f"meetings?year={y}")}
        for s in _openf1(f"sessions?year={y}"):
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
    e = _espn_for(s)
    if e and e["state"] != "scheduled":
        return e["state"]  # ESPN knows when results are in / a session overran
    now = now_utc()
    if now < parse_dt(s["date_start"]):
        return "scheduled"
    return "live" if now < parse_dt(s["date_end"]) else "final"


def _result(s, number, surname=None):
    """Driver's classification in a finished session, or None if not published.
    OpenF1 first; ESPN's finishing order when OpenF1 has none (or is locked)."""
    if _status(s) != "final":
        return None
    try:
        rows = _openf1(f"session_result?session_key={s['session_key']}") if s.get("session_key") else []
    except Exception:
        rows = []
    row = next((r for r in rows if r["driver_number"] == number), None)
    if not row:
        e = _espn_for(s)
        if e and surname and _fold(surname) in e["order"]:
            return result(f"P{e['order'].index(_fold(surname)) + 1}")
        return None
    for flag in ("dsq", "dns", "dnf"):
        if row.get(flag):
            return result(flag.upper())
    pos = row.get("position")
    return result(f"P{pos}" if pos else "NC")


def _jolpica_race_result(jolpica_id, race_name):
    """Driver's result in Jolpica's latest race (fallback when OpenF1 has none or is locked)."""
    try:
        race = get_json(f"{JOLPICA}/current/last/results.json")["MRData"]["RaceTable"]["Races"][0]
    except Exception:
        return None
    if race["raceName"] != race_name:
        return None
    r = next((x for x in race["Results"] if x["Driver"]["driverId"] == jolpica_id), None)
    if not r:
        return None
    if r["positionText"].isdigit():
        return result(f"P{r['positionText']}")
    return result({"R": "DNF", "D": "DSQ", "W": "DNS", "N": "NC"}.get(r["positionText"], r["positionText"]))


def _event(s, number, sessions=None, track=None, surname=None):
    name = s["session_name"]
    return event(
        title=s["meeting_name"],
        subtitle=SHORT_NAMES.get(name, name),
        start=iso(parse_dt(s["date_start"])),
        status=_status(s),
        result=_result(s, number, surname),
        sessions=sessions,
        location=s.get("location"),
        image=s.get("flag"),
        track=track,
    )


def _profile(number):
    """Team name/colour and headshot from the latest session's driver list."""
    try:
        drivers = _openf1("drivers?session_key=latest")
    except Exception:
        drivers = []  # profile is optional; fetch.py keeps the previous team/colour
    for d in drivers:
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
    number, surname = subj["number"], subj["name"]
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
            "result": _result(s, number, surname),
        } for s in weekend]
        try:
            track = _track(first["circuit_key"], first["year"]) if first.get("circuit_key") else None
        except Exception:
            track = None  # optional extra; never fail the subject for it
        nxt = _event(first, number, sessions=listing, track=track, surname=surname)

    # 'last' = the latest Grand Prix race; weekend session results live in next.sessions.
    races = [s for s in done if s["session_name"] == "Race"]
    last = _event(races[-1], number, surname=surname) if races else None
    if last and not last["result"]:
        last["result"] = _jolpica_race_result(subj["jolpica_id"], last["title"])
    return {"ranking": _ranking(subj["jolpica_id"]), "next": nxt, "last": last,
            "profile": _profile(number)}


def _team_colours():
    """Driver code -> '#RRGGBB' from the latest session's driver list."""
    try:
        drivers = _openf1("drivers?session_key=latest")
    except Exception:
        return {}
    return {d["name_acronym"]: f"#{d['team_colour']}" for d in drivers if d.get("team_colour")}


# Fallback team colours (OpenF1 team_colour, 2026) for when OpenF1 is locked and not cached yet.
# Keys are folded so OpenF1 ("Racing Bulls") and Jolpica ("RB F1 Team") names both match.
TEAM_COLOURS = {"alpine": "#00A1E8", "astonmartin": "#229971", "audi": "#F50537", "cadillac": "#909090",
                "ferrari": "#ED1131", "haas": "#9C9FA2", "mclaren": "#F47600", "mercedes": "#00D7B6",
                "racingbulls": "#6C98FF", "rb": "#6C98FF", "redbull": "#4781D7", "williams": "#1868DB"}


def _team_colour(team):
    key = "".join(ch for ch in (team or "").lower() if ch.isalnum())
    for suffix in ("f1team", "racing"):
        if key.endswith(suffix) and key != suffix:
            key = key[: -len(suffix)]
    return TEAM_COLOURS.get(key)


def _laptime(sec):
    """94.893 -> '1:34.893'."""
    m, s = divmod(sec, 60)
    return f"{int(m)}:{s:06.3f}" if m else f"{s:.3f}"


def _last_of(v):
    """Qualifying gives [Q1, Q2, Q3]: the furthest segment reached; practice a plain number."""
    if isinstance(v, list):
        v = [x for x in v if x is not None]
        return v[-1] if v else None
    return v


def _openf1_session_table(s, followed_numbers):
    """Timing-tower rows for one finished OpenF1 session: best lap, gap to P1 and the tyre
    compound that best lap was set on (laps + stints). Raises when OpenF1 has nothing."""
    key = s["session_key"]
    res = sorted(_openf1(f"session_result?session_key={key}"), key=lambda r: r.get("position") or 99)
    if not res:
        raise ValueError("no result")
    drivers = {d["driver_number"]: d for d in _openf1(f"drivers?session_key={key}")}
    try:
        laps, stints = _openf1(f"laps?session_key={key}"), _openf1(f"stints?session_key={key}")
    except Exception:
        laps, stints = [], []  # tyres are optional

    def tyre(num, best):
        lap = next((l for l in laps if l["driver_number"] == num and l.get("lap_duration")
                    and abs(l["lap_duration"] - best) < 0.0015), None)
        st = lap and next((x for x in stints if x["driver_number"] == num
                           and x["lap_start"] <= lap["lap_number"] <= (x.get("lap_end") or 999)), None)
        return st.get("compound") if st else None

    rows = []
    for r in res:
        num, d = r["driver_number"], drivers.get(r["driver_number"], {})
        best, gap = _last_of(r.get("duration")), _last_of(r.get("gap_to_leader"))
        flag = next((f.upper() for f in ("dsq", "dns", "dnf") if r.get(f)), None)
        rows.append({
            "pos": r.get("position") or "–", "code": d.get("name_acronym") or str(num),
            "name": d.get("full_name"), "team": d.get("team_name"),
            "color": f"#{d['team_colour']}" if d.get("team_colour") else _team_colour(d.get("team_name")),
            "value": _laptime(best) if best else (flag or "No time"),
            "extra": f"+{gap:.3f}" if gap else "",
            "tyre": tyre(num, best) if best else None,  # SOFT / MEDIUM / HARD / INTERMEDIATE / WET
            "self": num in followed_numbers,
        })
    return rows


def _last_session_table(followed_surnames, followed_numbers=()):
    """Classification of the latest finished session of the current weekend (practice,
    qualifying, sprint...), or None. OpenF1 (times + tyres) when reachable, else ESPN's order
    (names only; code/team from Jolpica). Races are left to Jolpica's last_race table."""
    now = now_utc()
    try:
        sessions = _sessions()
    except Exception:
        sessions = []
    upcoming = [x for x in sessions if parse_dt(x["date_end"]) > now]
    meeting = (upcoming[0] if upcoming else sessions[-1] if sessions else {}).get("meeting_key")
    finished = [x for x in sessions if x.get("meeting_key") == meeting and x["session_name"] != "Race"
                and _status(x) == "final"]
    if finished and finished[-1].get("session_key"):
        s = finished[-1]
        name = SHORT_NAMES.get(s["session_name"], s["session_name"])
        try:
            rows = _openf1_session_table(s, set(followed_numbers))
            return {"name": name, "date": s["date_start"],
                    "table": {"title": name, "subtitle": f"Best laps · {s['date_start'][:10]}", "rows": rows}}
        except Exception:
            pass  # locked / not published yet: ESPN below
    done = [(n, e) for n, e in _espn_weekend().items() if e["state"] == "final" and e.get("date")]
    if not done:
        return None
    name, e = max(done, key=lambda x: x[1]["date"])
    # Code, name and team from Jolpica's standings (always reachable); colour from OpenF1 if cached.
    try:
        lists = get_json(f"{JOLPICA}/current/driverStandings.json")["MRData"]["StandingsTable"]["StandingsLists"]
        drivers = {_fold(d["Driver"]["familyName"]): d for d in (lists[0]["DriverStandings"] if lists else [])}
    except Exception:
        drivers = {}
    colours = _team_colours()
    rows = []
    for i, sn in enumerate(e["order"], 1):
        d = drivers.get(sn) or {}
        drv = d.get("Driver") or {}
        code = drv.get("code") or sn[:3].upper()
        rows.append({"pos": i, "code": code,
                     "name": f"{drv['givenName']} {drv['familyName']}" if drv else sn.title(),
                     "team": (d.get("Constructors") or [{}])[-1].get("name"),
                     "color": colours.get(code) or _team_colour((d.get("Constructors") or [{}])[-1].get("name")),
                     "value": "", "extra": "", "self": sn in followed_surnames})
    return {"name": name, "date": e["date"],
            "table": {"title": name, "subtitle": f"Latest session · {e['date'][:10]}", "rows": rows}}


def fetch_sport(sport_cfg):
    """Sport-level tables shared by all drivers: last race classification, driver standings."""
    followed = {s["jolpica_id"] for s in sport_cfg["subjects"]}
    colours = _team_colours()

    def row(pos, d, team, value, extra):
        return {"pos": pos, "code": d["code"], "name": f"{d['givenName']} {d['familyName']}",
                "team": team, "color": colours.get(d["code"]) or _team_colour(team), "value": value, "extra": extra,
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
    # Latest finished session this weekend; a race uses Jolpica's classification (with times)
    # once Jolpica has it, otherwise ESPN's order.
    latest = _last_session_table({_fold(s["name"]) for s in sport_cfg["subjects"]},
                                 [s["number"] for s in sport_cfg["subjects"]])
    last_session = None
    if latest and not (latest["name"] == "Race" and race.get("date") == latest["date"][:10]):
        last_session = latest["table"]
    return {"next_round": int(nxt[0]["round"]) if nxt else None, "tables": {
        "last_session": last_session,  # None -> clients fall back to last_race
        "last_race": {"title": race["raceName"], "subtitle": f"Round {race['round']} · {race['date']}",
                      "rows": results},
        "standings": {"title": "Driver standings",
                      "subtitle": f"After round {lists[0]['round']}" if lists else None,
                      "rows": standings},
    }}
