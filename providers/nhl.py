"""NHL: schedule and standings from api-web.nhle.com (unofficial, no key)."""
import copy
import json
import urllib.request
from datetime import date, timedelta
from functools import lru_cache

from .common import UA, get_json, event, result, competitor, now_utc, parse_dt, iso

API = "https://api-web.nhle.com/v1"
GAME_TYPES = {1: "NHL Preseason", 2: "NHL Regular Season", 3: "NHL Playoffs"}
UPCOMING = {"FUT", "PRE", "LIVE", "CRIT"}
FINISHED = {"OFF", "FINAL"}


def _standings():
    return get_json(f"{API}/standings/now")["standings"]


def _finished_games(team):
    games = get_json(f"{API}/club-schedule-season/{team}/now")["games"]
    return sorted((g for g in games if g["gameState"] in FINISHED), key=lambda g: g["startTimeUTC"])


@lru_cache(maxsize=None)
def _before_last_game(team):
    """{abbrev: (divisionSequence, wildcardSequence)} from the standings at the end of the day
    before `team`'s last game, so changes show what that game did. None before any games."""
    done = [g for g in _finished_games(team) if g.get("gameType") == 2 and g.get("gameDate")]
    if not done:
        return None
    day = (date.fromisoformat(done[-1]["gameDate"]) - timedelta(days=1)).isoformat()
    try:
        rows = get_json(f"{API}/standings/{day}")["standings"]
    except Exception:
        return None  # change is optional
    return {t["teamAbbrev"]["default"]: (t["divisionSequence"], t.get("wildcardSequence")) for t in rows}


def _change(before, abbrev, i, now):
    """Places moved since before the last game (+ = up); None when unknown."""
    old = (before or {}).get(abbrev)
    return old[i] - now if old and old[i] and now else None


def _team_row(abbrev):
    return next((t for t in _standings() if t["teamAbbrev"]["default"] == abbrev), None)


def _form(abbrev):
    """Season record, last-10 record and streak, e.g. ('4-3-0', '6-3-1', 'W2')."""
    t = _team_row(abbrev)
    if not t:
        return None, None
    record = f"{t['wins']}-{t['losses']}-{t['otLosses']}"
    l10 = f"{t['l10Wins']}-{t['l10Losses']}-{t['l10OtLosses']}"
    streak = f"{t.get('streakCode', '')}{t.get('streakCount', '')}"
    return record, f"L10 {l10} · {streak}" if streak else f"L10 {l10}"


PERIOD_LABELS = {"OT": "OT", "SO": "SO"}


def _landing(game_id):
    return get_json(f"{API}/gamecenter/{game_id}/landing")


def _game_detail(game_id):
    return _detail_from_landing(_landing(game_id))


def _detail_from_landing(d):
    """Goals, shootout, shots and three stars of a live or finished game."""
    summary = d.get("summary") or {}
    goals = []
    for period in summary.get("scoring", []):
        pd = period["periodDescriptor"]
        if pd["periodType"] == "SO":
            continue  # shootout goals are listed separately
        label = PERIOD_LABELS.get(pd["periodType"], str(pd["number"]))
        for g in period["goals"]:
            strength = (g.get("strength") or "ev").upper()
            goals.append({
                "period": label, "time": g["timeInPeriod"], "team": g["teamAbbrev"]["default"],
                "scorer": g["name"]["default"], "scorer_total": g.get("goalsToDate"),
                "assists": [a["name"]["default"] for a in g.get("assists", [])],
                "strength": None if strength == "EV" else strength,  # PP / SH
                "empty_net": g.get("goalModifier") == "empty-net",
                "score": f"{g['awayScore']}–{g['homeScore']}",       # away–home, like competitors
            })
    def so_name(e):  # some attempts come without a player
        first = (e.get("firstName") or {}).get("default") or ""
        last = (e.get("lastName") or {}).get("default")
        return f"{first[:1]}. {last}" if first and last else (last or "—")
    shootout = [{
        "team": e["teamAbbrev"]["default"], "player": so_name(e),
        "result": e["result"], "winner": bool(e.get("gameWinner")),
    } for e in (summary.get("shootout") or {}).get("events", [])] if isinstance(summary.get("shootout"), dict) else []
    stars = []
    for st in summary.get("threeStars", []):
        if st.get("position") == "G":
            line = f"{st.get('savePctg', 0):.3f} SV%".lstrip("0")
        else:
            line = f"{st.get('goals', 0)}G {st.get('assists', 0)}A"
        stars.append({"star": st["star"], "team": st["teamAbbrev"], "name": st["name"]["default"],
                      "pos": st.get("position"), "line": line})
    return {"goals": goals, "shootout": shootout, "stars": stars,
            "sog": {"away": d["awayTeam"].get("sog"), "home": d["homeTeam"].get("sog")}}


def _event(g, team):
    home = g["homeTeam"]["abbrev"] == team
    us, them = (g["homeTeam"], g["awayTeam"]) if home else (g["awayTeam"], g["homeTeam"])
    state = g["gameState"]

    if g.get("gameScheduleState") in ("CNCL", "PPD"):
        status = "cancelled"
    elif state in FINISHED:
        status = "final"
    elif state in ("LIVE", "CRIT"):
        status = "live"
    else:
        status = "scheduled"

    res = None
    if status == "final":
        a, b = us.get("score", 0), them.get("score", 0)
        period = (g.get("gameOutcome") or {}).get("lastPeriodType", "REG")
        suffix = "" if period == "REG" else f" {period}"
        res = result(f"{a}–{b}{suffix}", "win" if a > b else "loss")

    def side(t):
        score = t.get("score") if status in ("final", "live") else None
        win = None if status != "final" else score == max(us.get("score", 0), them.get("score", 0))
        c = competitor(name=t["commonName"]["default"], short=t["abbrev"],
                       logo=t.get("darkLogo") or t.get("logo"), score=score,
                       winner=win, is_self=t is us)
        if status != "final":  # pre-game context: current record and recent form
            c["record"], c["form"] = _form(t["abbrev"])
        return c

    link = g.get("gameCenterLink")
    return event(
        title=GAME_TYPES.get(g.get("gameType"), "NHL"),
        subtitle=f"{'vs' if home else '@'} {them['abbrev']}",
        start=g["startTimeUTC"],
        status=status,
        result=res,
        url=f"https://www.nhl.com{link}" if link else None,
        location=(g.get("venue") or {}).get("default"),
        competitors=[side(g["awayTeam"]), side(g["homeTeam"])],  # away first, like scoreboards
        detail=_detail_or_none(g["id"]) if status in ("final", "live") else None,
        id=g["id"],
    )


def _detail_or_none(game_id):
    try:
        return _game_detail(game_id)
    except Exception:
        return None  # optional extra; never fail the subject for it


def _playoff_note(t):
    """Playoff picture: top 3 per division + 2 wild cards per conference make it."""
    if t["divisionSequence"] <= 3:
        return f"{t['divisionName']} top 3 · in playoff spot"
    conf = [x for x in _standings() if x["conferenceName"] == t["conferenceName"]]
    wc = {x["wildcardSequence"]: x for x in conf if x["wildcardSequence"]}
    n = t["wildcardSequence"]
    if n <= 2:
        first_out = wc.get(3)
        margin = t["points"] - first_out["points"] if first_out else 0
        return f"WC{n} · +{margin} pts over cut line"
    cut = wc.get(2)
    back = cut["points"] - t["points"] if cut else 0
    gp = f" ({t['gamesPlayed']} GP vs {cut['gamesPlayed']})" if cut else ""
    return f"WC{n} · {back} pts back of WC2{gp}"


def _ranking(team, played=None):
    """`played` = regular-season games the schedule already shows as final. The NHL updates
    standings a few minutes after the final horn; until then `pending` is set and the live
    job keeps re-checking (see refresh_live)."""
    t = _team_row(team)
    if not t:
        return None
    return {
        "pending": bool(played and t["gamesPlayed"] < played),
        "label": t["divisionName"],
        "position": t["divisionSequence"],
        "points": t["points"],
        "detail": f"{t['wins']}-{t['losses']}-{t['otLosses']}",
        "note": _playoff_note(t),
        "change": _change(_before_last_game(team), team, 0, t["divisionSequence"]),
    }


def fetch_subject(subj):
    team = subj["abbrev"]
    games = get_json(f"{API}/club-schedule-season/{team}/now")["games"]
    games = sorted(games, key=lambda g: g["startTimeUTC"])
    nxt = next((g for g in games if g["gameState"] in UPCOMING), None)
    done = [g for g in games if g["gameState"] in FINISHED]
    me = next((g[k] for g in games for k in ("homeTeam", "awayTeam")
               if g[k]["abbrev"] == team), {})
    return {
        "ranking": _ranking(team, sum(1 for g in done if g.get("gameType") == 2)),
        "next": _event(nxt, team) if nxt else None,
        "last": _event(done[-1], team) if done else None,
        "profile": {"image": me.get("darkLogo") or me.get("logo")},
    }


# ---------- live mode (fetch.py --live, every minute) ----------

LIVE_BEFORE = timedelta(minutes=15)  # start polling shortly before puck drop
LIVE_AFTER = timedelta(hours=5)      # give up if a game somehow never reports final
ORDINALS = {1: "1ST", 2: "2ND", 3: "3RD"}


def _landing_live(game_id):
    """Uncached landing fetch plus the moment it was generated: the NHL CDN caches it
    ~19 s, so subtract the HTTP Age header to know when the clock value was true."""
    req = urllib.request.Request(f"{API}/gamecenter/{game_id}/landing", headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as r:
        age = int(r.headers.get("Age") or 0)
        return json.load(r), now_utc() - timedelta(seconds=age)


def _situation(d):
    """Power play / empty net: {team, label ("PP"|"EN"|...), strength "5v4", seconds} or None."""
    sit = d.get("situation") or {}
    for side in ("homeTeam", "awayTeam"):
        t = sit.get(side) or {}
        if t.get("situationDescriptions"):
            other = sit.get("awayTeam" if side == "homeTeam" else "homeTeam") or {}
            return {"team": t.get("abbrev"), "label": " ".join(t["situationDescriptions"]),
                    "strength": f"{t.get('strength')}v{other.get('strength')}",
                    "seconds": sit.get("secondsRemaining")}
    return None


def _live_state(d, as_of=None):
    """Period / clock / shots from a gamecenter landing of a live game. Clients count the
    clock down from `seconds` at `as_of` while `running`, and re-sync on each poll."""
    pd = d.get("periodDescriptor") or {}
    clock = d.get("clock") or {}
    ptype = pd.get("periodType", "REG")
    return {
        "period": ORDINALS.get(pd.get("number"), ptype) if ptype == "REG" else ptype,  # 1ST / 2ND / 3RD / OT / SO
        "clock": clock.get("timeRemaining"),
        "seconds": clock.get("secondsRemaining"),
        "as_of": iso(as_of or now_utc()),
        "intermission": bool(clock.get("inIntermission")),
        "running": bool(clock.get("running")),
        "sog": {"away": d["awayTeam"].get("sog"), "home": d["homeTeam"].get("sog")},
        "situation": _situation(d),  # counts down with the game clock, like `seconds`
        "updated_at": iso(now_utc()),
    }


STANDINGS_WAIT = timedelta(hours=8)  # stop waiting for post-game standings after this


def _standings_caught_up(team, current):
    """True once standings include a game that already went final (ranking.pending)."""
    rk, last = (current or {}).get("ranking") or {}, (current or {}).get("last") or {}
    if not rk.get("pending") or not last.get("start"):
        return False
    if now_utc() - parse_dt(last["start"]) > STANDINGS_WAIT:
        return False
    t = _team_row(team)
    return bool(t) and f"{t['wins']}-{t['losses']}-{t['otLosses']}" != rk.get("detail")


def refresh_live(subj, current):
    """Update the subject's next game while it is live; None when there is nothing to do.

    Makes no request unless a game is live or within the polling window. When the game
    goes final, returns a full fetch_subject() so 'last'/'next' roll over.
    """
    if _standings_caught_up(subj["abbrev"], current):
        return dict(fetch_subject(subj), refresh_sport=True)  # new record/form + tables too
    ev = (current or {}).get("next")
    if not ev or not ev.get("id"):
        return None
    start, now = parse_dt(ev["start"]), now_utc()
    if ev.get("status") != "live" and not (start - LIVE_BEFORE <= now <= start + LIVE_AFTER):
        return None
    d, as_of = _landing_live(ev["id"])
    state = d.get("gameState")
    if state in FINISHED:
        return fetch_subject(subj)
    if state not in ("LIVE", "CRIT"):
        return None  # pre-game: nothing to show yet
    ev = copy.deepcopy(ev)
    ev["status"] = "live"
    scores = {"away": d["awayTeam"].get("score", 0), "home": d["homeTeam"].get("score", 0)}
    for side, c in zip(("away", "home"), ev["competitors"]):
        c["score"] = scores[side]
    ev["live"] = _live_state(d, as_of)
    ev["detail"] = _detail_from_landing(d)
    return {"next": ev}


# ---------- sport-level tables (fetch.py merges these into the sport entry) ----------

def _standing_row(t, team, pos):
    return {
        "pos": pos, "code": t["teamAbbrev"]["default"], "name": t["teamCommonName"]["default"],
        "logo": (t.get("teamLogo") or "").replace("_light.svg", "_dark.svg") or None,  # dark-background variant
        "team": None, "color": None,
        "value": str(t["points"]), "extra": f"{t['wins']}-{t['losses']}-{t['otLosses']}",
        "gp": t["gamesPlayed"], "self": t["teamAbbrev"]["default"] == team,
    }


def fetch_sport(sport_cfg):
    """Division standings and the conference wild-card race for the followed team.
    `cut` marks the last row inside a playoff spot (3rd in the division, WC2)."""
    team = sport_cfg["subjects"][0]["abbrev"]
    me = _team_row(team)
    if not me:
        return {}
    rows = _standings()
    div = sorted((t for t in rows if t["divisionName"] == me["divisionName"]), key=lambda t: t["divisionSequence"])
    wc = sorted((t for t in rows if t["conferenceName"] == me["conferenceName"] and t["wildcardSequence"]),
                key=lambda t: t["wildcardSequence"])
    before = _before_last_game(team)
    code = lambda t: t["teamAbbrev"]["default"]
    division = [dict(_standing_row(t, team, t["divisionSequence"]), cut=t["divisionSequence"] == 3,
                     change=_change(before, code(t), 0, t["divisionSequence"])) for t in div]
    wild = [dict(_standing_row(t, team, t["wildcardSequence"]), cut=t["wildcardSequence"] == 2,
                 change=_change(before, code(t), 1, t["wildcardSequence"])) for t in wc]
    return {"tables": {
        "division": {"title": f"{me['divisionName']} Division", "subtitle": "Top 3 make the playoffs", "rows": division},
        "wildcard": {"title": f"{me['conferenceName']} Wild Card", "subtitle": "Top 2 make the playoffs", "rows": wild},
    }}
