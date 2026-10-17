"""NHL: schedule and standings from api-web.nhle.com (unofficial, no key)."""
from .common import get_json, event, result, competitor

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
    )


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
