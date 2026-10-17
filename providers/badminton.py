"""Badminton: BWF internal API (extranet-lv.bwfbadminton.com).

Undocumented and behind Cloudflare: plain urllib gets 403, so requests go
through curl_cffi impersonating Chrome. No auth token needed.
"""
import re
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlencode

import yaml
from curl_cffi import requests

from .common import now_utc, parse_dt, iso, event, result, competitor

API = "https://extranet-lv.bwfbadminton.com/api/"
RANK_CAT = {"MS": 6, "WS": 7, "MD": 8, "WD": 9, "XD": 10}  # rankingtable catId
ENTRY_EVENT = {"MS": 1, "WS": 2, "MD": 3, "WD": 4, "XD": 5}  # entries eventName
WORLD_TOUR_CATS = [22, 23, 24, 25, 26]  # Super 1000/750/500/300 + Finals
MAX_TOURNAMENTS = 3  # how many upcoming tournaments to scan for entries
FLAGS = "https://extranet.bwf.sport/docs/flags-svg/"
NAMES_ZH_FILE = Path(__file__).with_name("badminton_names_zh.yaml")


@lru_cache(maxsize=None)
def _get(query):
    r = requests.get(API + query, impersonate="chrome", timeout=20)
    r.raise_for_status()
    return r.json()


def get(path, **params):
    return _get(f"{path}?{urlencode(params, doseq=True)}")


def _ranking(subj):
    data = get("vue-rankingtable", rankId=2, catId=RANK_CAT[subj["event"]],
               publicationId=0, doubles=str(subj["event"].endswith("D")).lower(),
               searchKey=subj["search"], pageKey=10, page=1, drawCount=1)
    pid = subj["player_id"]
    for row in data["results"]["data"]:
        if pid in (row["player1_id"], row["player2_id"]):
            prev = row.get("rank_previous")
            return {"label": subj["event"], "position": row["rank"],
                    "points": float(row["points"]), "detail": None, "note": None,
                    # positive = moved up since last week's ranking
                    "change": prev - row["rank"] if prev else None}
    return None


def _calendar(year):
    data = get("vue-grouped-year-tournaments", year=year,
               **{"category[]": WORLD_TOUR_CATS}, state="all")
    return [t for month in data["results"] for t in month["tournaments"]]


def _key(name):
    return re.sub(r"[\s.\-]+", " ", name).strip().lower()


@lru_cache(maxsize=None)
def _zh_table():
    raw = yaml.safe_load(NAMES_ZH_FILE.read_text()) or {}
    return {_key(k): v for k, v in raw.items()}


def _surname(display):
    # 'Fajar ALFIAN' -> 'Alfian'; family name is the upper-case part.
    upper = [w for w in display.split() if w.isupper()]
    return " ".join(upper or display.split()[-1:]).title()


def _names(displays):
    """('Alfian / Fikri', '阿尔菲安 / 菲克里') from BWF display names.
    Chinese uses the common translation per player, English surname where none exists;
    it is None when no player has a translation."""
    displays = [d for d in displays if d]
    zh = [_zh_table().get(_key(d)) for d in displays]
    en = " / ".join(_surname(d) for d in displays)
    if not any(zh):
        return en, None
    return en, " / ".join(z or _surname(d) for z, d in zip(zh, displays))


def _surnames(team):
    return _names([p["name_display"] for p in team if p])[0]


def _scores(html):
    return [int(x) for x in re.findall(r"<span>(\d+)</span>", html or "")]


def _day_row(m):
    """The match's row in its tournament day schedule (has matchTimeUtc and the match code).
    Works for any tournament, World Tour or not, via the tournament's GUID code."""
    tid = m["tournament_model"]["id"]
    code = (get("vue-tournament-detail", tmtId=tid).get("results") or {}).get("code")
    if not code:
        return None
    rows = get("tournaments/day-matches", tournamentCode=code, date=m["match_time"][:10], order=2, court=0)
    return next((r for r in rows if r["id"] == m["id"]), None)


def _exact_time(m):
    row = _day_row(m)
    return iso(parse_dt(row["matchTimeUtc"])) if row and row.get("matchTimeUtc") else None


def _match_detail(m, side):
    """Rally-by-rally score per game plus match stats, from our side's perspective.
    `points` is empty when BWF has no point-by-point record for the match."""
    row = _day_row(m)
    if not row:
        return None
    d = get("h2h/match", tmt_id=m["tournament_model"]["id"], match_code=row["code"])
    me, op = f"team{side}", f"team{3 - side}"
    games = [{
        "self": g[me], "opp": g[op],
        "points": [[p[me], p[op]] for p in sorted(g.get("match_set_details_model") or [], key=lambda p: p["ordering"])],
    } for g in sorted(d.get("games") or [], key=lambda g: g["ordering"])]
    st = d.get("stats") or {}
    pair = lambda k: [st.get(f"{me}_{k}"), st.get(f"{op}_{k}")]
    return {
        "duration": (d.get("progress") or {}).get("duration"),
        "venue": (d.get("location") or {}).get("locationName"),
        "games": games,
        "stats": {"rallies_won": pair("rallies_won"), "max_streak": pair("consecutive_points"),
                  "game_points": pair("game_points")},
    }


def _flag(m, team):
    c = m.get(f"t{team}p1country_model") or {}
    return FLAGS + c["flag_name_svg"] if c.get("flag_name_svg") else None


def _side(m, team, me, final):
    """Competitor dict for team 1 or 2, with per-game scores."""
    players = [m[f"t{team}p1_player_model"], m[f"t{team}p2_player_model"]]
    name, name_zh = _names([p["name_display"] for p in players if p])
    games = _scores(m[f"team{team}Score"]) if final else None
    other = _scores(m[f"team{3 - team}Score"]) if final else None
    won = sum(a > b for a, b in zip(games, other)) if final else None
    return competitor(name=name, short=name, name_zh=name_zh, logo=_flag(m, team), score=won,
                      games=games, winner=(m["winner"] == team) if final else None,
                      is_self=team == me)


def _match_event(m, pid):
    side = 1 if pid in ((m["t1p1_player_model"] or {}).get("id"),
                        (m["t1p2_player_model"] or {}).get("id")) else 2
    opp = 2 if side == 1 else 1
    opponent = _surnames([m[f"t{opp}p1_player_model"], m[f"t{opp}p2_player_model"]])
    final = m["match_state"] == "F"

    res = None
    if final:
        ours, theirs = _scores(m[f"team{side}Score"]), _scores(m[f"team{opp}Score"])
        summary = " ".join(f"{a}-{b}" for a, b in zip(ours, theirs))
        if m.get("status_name"):
            summary = f"{summary} ({m['status_name']})".strip()
        res = result(summary, "win" if m["winner"] == side else "loss")

    exact = _exact_time(m)
    detail = None
    if final:
        try:
            detail = _match_detail(m, side)
        except Exception:
            detail = None  # optional extra; never fail the subject for it
    path = _draw_path(m["tournament_model"]["id"], m["draw_model"]["name"][:2], pid) if not final else None
    return event(
        title=m["tournament_model"]["name"],
        subtitle=f"{m['round_name']} vs {opponent}" if opponent else m["round_name"],
        start=exact or m["match_time"][:10],
        precision="exact" if exact else "date",
        status="final" if final else "scheduled",
        result=res,
        url=m.get("tmt_url"),
        competitors=[_side(m, side, side, final), _side(m, opp, side, final)],  # self first
        path=path,
        detail=detail,
    )


def _draw_team(t):
    """Draw-data team -> (player ids, display names, flag URL)."""
    players = (t or {}).get("players") or []
    return [p["id"] for p in players], [p["nameDisplay"] for p in players], (t or {}).get("countryFlagUrl")


@lru_cache(maxsize=None)
def _rank_map(event_name):
    """Current world ranking (top 500) as {frozenset(player ids): rank}."""
    data = get("vue-rankingtable", rankId=2, catId=RANK_CAT[event_name], publicationId=0,
               doubles=str(event_name.endswith("D")).lower(), searchKey="",
               pageKey=500, page=1, drawCount=1)["results"]["data"]
    return {frozenset(str(i) for i in (r["player1_id"], r["player2_id"]) if i): r["rank"] for r in data}


def _seed_num(seed):
    m = re.match(r"\d+", seed or "")
    return int(m.group()) if m else 99


def _draw_path(tmt_id, event_name, pid):
    """Remaining rounds with the actual or most likely (best seed still alive) opponent.

    Draw data is keyed 'round-position'; the opponent in round r comes from the
    sibling block of 2**(r-1) first-round matches.
    """
    try:
        draws = get("vue-tournament-draws", tmtTab="draw", tmtId=tmt_id)["results"]
        draw = next(d for d in draws if d["text"] == event_name and not d.get("qualification"))
        data = get("vue-tournament-draw-data", tmtTab="draw", tmtId=tmt_id, drawId=draw["value"])["results"]
    except Exception:
        return None  # draw not published yet
    if not isinstance(data, dict):
        return None
    pid = str(pid)
    m = lambda r, p: (data.get(f"{r}-{p}") or {}).get("match") or {}

    # First-round entries: position -> list of (ids, names, flag, seed)
    first, pos0 = {}, None
    for key, v in data.items():
        r, p = map(int, key.split("-"))
        if r != 0:
            continue
        mt = v.get("match") or {}
        first[p] = [(*_draw_team(mt.get(f"team{i}")), mt.get(f"team{i}seed")) for i in (1, 2)]
        if any(pid in e[0] for e in first[p]):
            pos0 = p
    if pos0 is None:
        return None

    # Losers of decided matches are out.
    out = set()
    for v in data.values():
        mt = v.get("match") or {}
        if mt.get("winner") in (1, 2):
            out.update(_draw_team(mt.get(f"team{3 - mt['winner']}"))[0])

    rounds = max(int(k.split("-")[0]) for k in data) + 1
    path = []
    for r in range(rounds):
        mt = m(r, pos0 >> r)
        if mt.get("winner") in (1, 2):
            continue  # already played
        if r == 0:
            block = [pos0]
        else:
            sib = (pos0 >> (r - 1)) ^ 1
            block = range(sib << (r - 1), (sib + 1) << (r - 1))
        alive = [e for p in block for e in first.get(p, []) if e[0] and pid not in e[0]
                 and not (set(e[0]) & out)]
        if not alive:
            continue
        ranks = _rank_map(event_name)
        cands = []
        for ids, names, flag, seed in alive:
            en, zh = _names(names)
            cands.append({"name": en, "name_zh": zh, "logo": flag, "seed": seed,
                          "rank": ranks.get(frozenset(ids))})  # None = outside top 500 / new pair
        cands.sort(key=lambda c: (_seed_num(c["seed"]), c["rank"] or 9999))
        best = cands[0]
        path.append({"round": mt.get("roundName") or f"R{r + 1}", **best,
                     "confirmed": len(cands) == 1,
                     "pool": len(cands),  # teams that can still reach this round
                     # all possible opponents, by world ranking
                     "candidates": sorted(cands, key=lambda c: c["rank"] or 9999) if len(cands) > 1 else None})
    return path or None


def _entered(t, subj):
    """True if the subject is in the tournament's main/qualifying draw."""
    ev = ENTRY_EVENT[subj["event"]]
    stages = get("entries/vue-tournament-event-stages", tmtId=t["id"], eventName=ev)
    skip = {str(s["value"]) for s in stages["results"]
            if s["text"] in ("Withdrawn", "Reserve")}
    # searchKey filters server-side; full lists are 150-250 KB and slow.
    data = get("entries/vue-tournament-players-staged", searchKey=subj["search"], tmtId=t["id"],
               tmtType=0, eventName=ev, stageName=0, isPara=0)
    pid = subj["player_id"]
    for stage_id, stage in (data.get("results") or {}).items():
        if stage_id in skip:
            continue
        for e in stage.get("entries", []):
            ids = ((e.get("player1") or {}).get("id"), (e.get("player2") or {}).get("id"))
            if pid in ids:
                return True
    return False


def _next_tournament(subj, exclude_id):
    today = now_utc().date().isoformat()
    year = int(today[:4])
    tours = [t for y in (year, year + 1) for t in _calendar(y)]
    tours = sorted((t for t in tours if t["end_date"][:10] >= today and t["id"] != exclude_id),
                   key=lambda t: t["start_date"])
    for t in tours[:MAX_TOURNAMENTS]:
        if _entered(t, subj):
            return event(title=t["name"], subtitle=None, start=t["start_date"][:10],
                         precision="date", status="scheduled", url=t.get("url"),
                         location=t.get("location"), image=t.get("flag_url"),
                         path=_draw_path(t["id"], subj["event"], subj["player_id"]))
    return None


def fetch_subject(subj):
    pid = subj["player_id"]
    common = dict(drawCount=1, activeTab=1, playerId=pid, isPara="false")
    matches = [get("vue-player-match-previous", previousOffset=0, **common)["results"],
               get("vue-player-match-next", **common)["results"]]
    matches = [m for m in matches if m]  # empty result is {}

    # 'next' endpoint can return a finished match, so sort by state.
    done = sorted((m for m in matches if m["match_state"] == "F"),
                  key=lambda m: (m["match_time"], m["id"]))
    pending = [m for m in matches if m["match_state"] != "F"]

    last_m = done[-1] if done else None
    if pending:
        nxt = _match_event(pending[0], pid)
    else:
        # No drawn match yet: show the next tournament the player entered.
        exclude = last_m["tournament_model"]["id"] if last_m else None
        nxt = _next_tournament(subj, exclude)

    me = 1 if last_m and pid in ((last_m["t1p1_player_model"] or {}).get("id"),
                                 (last_m["t1p2_player_model"] or {}).get("id")) else 2
    return {
        "ranking": _ranking(subj),
        "next": nxt,
        "last": _match_event(last_m, pid) if last_m else None,
        "profile": {"image": _flag(last_m, me) if last_m else None},
    }
