"""Shared helpers for providers.

Provider interface: each module exposes
    fetch_subject(subject: dict) -> {"ranking", "next", "last", "profile"?}
and raises on failure. fetch.py handles errors and stale fallback.
"profile" (optional) = {"team", "color", "image", "badge"}, merged into the subject.
"""
import json
import urllib.request
from datetime import datetime, timezone
from functools import lru_cache

UA = "sports-widget/1.0 (personal use)"


@lru_cache(maxsize=None)
def get_json(url):
    # Cached per run, so shared data (e.g. standings) is fetched once.
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)


def now_utc():
    return datetime.now(timezone.utc)


def iso(dt):
    """datetime -> 'YYYY-MM-DDTHH:MM:SSZ'."""
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_dt(s):
    """Parse ISO-ish strings ('...Z', '+00:00', or 'YYYY-MM-DD HH:MM:SS' as UTC)."""
    s = s.replace(" ", "T").replace("Z", "+00:00")
    dt = datetime.fromisoformat(s)
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def event(title, subtitle, start, status, precision="exact", result=None, url=None,
          sessions=None, location=None, image=None, competitors=None, track=None, path=None):
    """Build an Event dict in the data.json schema."""
    return {
        "title": title,
        "subtitle": subtitle,
        "start": start,
        "time_precision": precision,
        "status": status,
        "result": result,
        "live": None,  # reserved for future live mode
        "url": url,
        "location": location,
        "image": image,              # e.g. country flag
        "competitors": competitors,  # head-to-head sides, see competitor()
        "sessions": sessions,
        "track": track,              # F1 circuit outline + sector split
        "path": path,                # knockout draw: possible opponent per round
    }


def result(summary, outcome=None):
    return {"outcome": outcome, "summary": summary}


def competitor(name, short, logo=None, score=None, games=None, winner=None, is_self=False,
               name_zh=None):
    """One side of a head-to-head event. games = per-game/set scores."""
    return {"name": name, "short": short, "name_zh": name_zh, "logo": logo, "score": score,
            "games": games, "winner": winner, "self": is_self, "record": None, "form": None}
