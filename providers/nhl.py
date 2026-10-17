"""NHL: schedule and standings from api-web.nhle.com (unofficial, no key)."""
import copy
from datetime import timedelta

from .common import get_json, event, result, competitor, now_utc, parse_dt

API = "https://api-web.nhle.com/v1"
GAME_TYPES = {1: "NHL Preseason", 2: "NHL Regular Season", 3: "NHL Playoffs"}
UPCOMING = {"FUT", "PRE", "LIVE", "CRIT"}
FINISHED = {"OFF", "FINAL"}


def _standings():
    return get_json(f"{API}/standings/now")["standings"]


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
    shootout = [{
        "team": e["teamAbbrev"]["default"], "player": f"{e['firstName']['default'][0]}. {e['lastName']['default']}",
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


def _ranking(team):
    t = _team_row(team)
    if not t:
        return None
    return {
        "label": t["divisionName"],
        "position": t["divisionSequence"],
        "points": t["points"],
        "detail": f"{t['wins']}-{t['losses']}-{t['otLosses']}",
        "note": _playoff_note(t),
        "change": None,
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
        "ranking": _ranking(team),
        "next": _event(nxt, team) if nxt else None,
        "last": _event(done[-1], team) if done else None,
        "profile": {"image": me.get("darkLogo") or me.get("logo")},
    }


# ---------- live mode (fetch.py --live, every minute) ----------

LIVE_BEFORE = timedelta(minutes=15)  # start polling shortly before puck drop
LIVE_AFTER = timedelta(hours=5)      # give up if a game somehow never reports final
ORDINALS = {1: "1ST", 2: "2ND", 3: "3RD"}


def _live_state(d):
    """Period / clock / shots from a gamecenter landing of a live game."""
    pd = d.get("periodDescriptor") or {}
    clock = d.get("clock") or {}
    ptype = pd.get("periodType", "REG")
    return {
        "period": ORDINALS.get(pd.get("number"), ptype) if ptype == "REG" else ptype,  # 1ST / 2ND / 3RD / OT / SO
        "clock": clock.get("timeRemaining"),
        "intermission": bool(clock.get("inIntermission")),
        "running": bool(clock.get("running")),
        "sog": {"away": d["awayTeam"].get("sog"), "home": d["homeTeam"].get("sog")},
        "updated_at": now_utc().strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def refresh_live(subj, current):
    """Update the subject's next game while it is live; None when there is nothing to do.

    Makes no request unless a game is live or within the polling window. When the game
    goes final, returns a full fetch_subject() so 'last'/'next' roll over.
    """
    ev = (current or {}).get("next")
    if not ev or not ev.get("id"):
        return None
    start, now = parse_dt(ev["start"]), now_utc()
    if ev.get("status") != "live" and not (start - LIVE_BEFORE <= now <= start + LIVE_AFTER):
        return None
    d = _landing(ev["id"])
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
    ev["live"] = _live_state(d)
    ev["detail"] = _detail_from_landing(d)
    return {"next": ev}
