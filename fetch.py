#!/usr/bin/env python3
"""Fetch all followed subjects and write data.json.

A failing subject keeps its last good data and is marked stale;
other subjects are unaffected.

`fetch.py --live` (run every 20 s) only touches games that are live or about to
start, via each provider's optional refresh_live(); it exits without any request
when nothing is on.
"""
import importlib
import json
import os
import socket
import sys
import time
import traceback
from pathlib import Path

import yaml

from providers.common import iso, now_utc

ROOT = Path(__file__).resolve().parent
SCHEMA_VERSION = 1


def load_previous(path):
    """(subject id -> subject, sport id -> sport) from the last data.json, if readable."""
    try:
        data = json.loads(path.read_text())
    except (OSError, ValueError):
        return {}, {}
    sports = data.get("sports", [])
    return {s["id"]: s for sport in sports for s in sport["subjects"]}, {sp["id"]: sp for sp in sports}


PROFILE_KEYS = ("team", "color", "image", "badge")


def profile_fields(src, cfg):
    """Display extras for a subject; values in config.yaml override provider data."""
    return {k: cfg.get(k, src.get(k)) for k in PROFILE_KEYS}


def carry_missing(subj, old):
    """Keep display extras a degraded source run couldn't provide (e.g. F1 during an OpenF1
    lockout: no team/colour, no circuit outline or flag) from the previous snapshot."""
    for k in PROFILE_KEYS:
        if subj.get(k) is None and old.get(k) is not None:
            subj[k] = old[k]
    for key in ("next", "last"):
        new_ev, old_ev = subj.get(key) or {}, old.get(key) or {}
        if new_ev and new_ev.get("title") == old_ev.get("title") and \
                (new_ev.get("start") or "")[:10] == (old_ev.get("start") or "")[:10]:
            for f in ("track", "image", "location"):
                if new_ev.get(f) is None and old_ev.get(f) is not None:
                    new_ev[f] = old_ev[f]


def carry_live(subj, old):
    """The full run doesn't fetch live state; keep the live job's last values for the same
    in-progress event so the widget's live clock doesn't blank out until the next live poll."""
    new_ev, old_ev = subj.get("next") or {}, old.get("next") or {}
    if (new_ev.get("status") in ("live", "scheduled") and not new_ev.get("live") and old_ev.get("live")
            and new_ev.get("id") is not None and new_ev.get("id") == old_ev.get("id")):
        # BWF's player endpoint doesn't report "in progress": keep the live job's status + scores too.
        new_ev.update(status="live", live=old_ev["live"])
        for c_new, c_old in zip(new_ev.get("competitors") or [], old_ev.get("competitors") or []):
            c_new["score"], c_new["games"] = c_old.get("score"), c_old.get("games")


def write_atomic(path, data):
    # Write to a temp file then rename, so readers never see a partial file.
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    os.replace(tmp, path)


def summarize(subj):
    """One terminal line per subject, for quick checks and logs."""
    flag = " [STALE]" if subj["stale"] else ""
    r = subj.get("ranking")
    rank = f"#{r['position']} {r['label']}" if r else "-"
    n, l = subj.get("next"), subj.get("last")
    nxt = f"{n['title']} · {n['subtitle']} · {n['start']}" if n else "-"
    lst = f"{l['title']} · {l['subtitle']} · {(l['result'] or {}).get('summary')}" if l else "-"
    return f"{subj['name']}{flag}\n    rank: {rank}\n    next: {nxt}\n    last: {lst}"


# A run right after the Mac wakes can start before Wi-Fi/DNS is back; every source then
# fails and all subjects go stale until the next run 30 min later. Wait for DNS first.
NET_HOSTS = ("api-web.nhle.com", "api.jolpi.ca", "extranet-lv.bwfbadminton.com")
NET_WAIT_S = 120


def wait_for_network(timeout=NET_WAIT_S, step=5):
    """True once any data host resolves (within `timeout` s); False -> run anyway (stale fallback)."""
    deadline = time.monotonic() + timeout
    while True:
        for host in NET_HOSTS:
            try:
                socket.getaddrinfo(host, 443)
                return True
            except OSError:
                pass
        if time.monotonic() >= deadline:
            return False
        time.sleep(step)


def main():
    if not wait_for_network():
        print(f"{iso(now_utc())} network not reachable after {NET_WAIT_S} s, fetching anyway", file=sys.stderr)
    config = yaml.safe_load((ROOT / "config.yaml").read_text())
    out_path = ROOT / config.get("output", "data.json")
    previous, previous_sports = load_previous(out_path)
    failures = 0

    sports, assets = [], {}
    for sport in config["sports"]:
        subjects = []
        for cfg in sport["subjects"]:
            base = {"id": cfg["id"], "name": cfg["name"], "short": cfg.get("short")}
            try:
                # Import inside try: a broken provider only affects its own sport.
                provider = importlib.import_module(f"providers.{sport['provider']}")
                data = provider.fetch_subject(cfg)
                profile = data.pop("profile", None) or {}
                subj = {**base, **profile_fields(profile, cfg),
                        "updated_at": iso(now_utc()), "stale": False, "error": None, **data}
                carry_live(subj, previous.get(cfg["id"], {}))
                carry_missing(subj, previous.get(cfg["id"], {}))
            except Exception as e:
                failures += 1
                traceback.print_exc(file=sys.stderr)
                old = previous.get(cfg["id"], {})
                subj = {**base, **profile_fields(old, cfg),
                        "updated_at": old.get("updated_at"),
                        "stale": True,
                        "error": f"{type(e).__name__}: {e}"[:200],
                        "ranking": old.get("ranking"),
                        "next": old.get("next"),
                        "last": old.get("last")}
            subjects.append(subj)
            if sys.stdout.isatty():  # full summary in terminal, one line in launchd log
                print(summarize(subj))
        entry = {"id": sport["id"], "name": sport["name"], "subjects": subjects}
        # Optional sport-level data (e.g. F1 tables); on failure keep the last good copy.
        try:
            provider = importlib.import_module(f"providers.{sport['provider']}")
            if hasattr(provider, "fetch_sport"):
                entry.update(provider.fetch_sport(sport), tables_stale=False)
        except Exception:
            failures += 1
            traceback.print_exc(file=sys.stderr)
            old = previous_sports.get(sport["id"], {})
            if old.get("tables"):
                entry.update(tables=old["tables"], tables_stale=True, next_round=old.get("next_round"))
        sports.append(entry)
        # Optional inline copies of images the widget can't load reliably (BWF flags).
        try:
            if hasattr(provider, "assets"):
                assets.update(provider.assets(entry))
        except Exception:
            traceback.print_exc(file=sys.stderr)

    data = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": iso(now_utc()),
        "timezone": config.get("timezone", "UTC"),
        "sports": sports,
        "assets": assets,  # {image URL: data: URI}; clients prefer these over the URL
    }
    write_atomic(out_path, data)
    for extra in config.get("extra_outputs") or []:
        try:  # copies are best-effort; never fail the run for them
            path = Path(extra).expanduser()
            path.parent.mkdir(parents=True, exist_ok=True)
            write_atomic(path, data)
        except OSError as e:
            print(f"extra output {extra} failed: {e}", file=sys.stderr)
    print(f"{iso(now_utc())} wrote {out_path} ({failures} failed)")


def live_main():
    config = yaml.safe_load((ROOT / "config.yaml").read_text())
    out_path = ROOT / config.get("output", "data.json")
    try:
        data = json.loads(out_path.read_text())
    except (OSError, ValueError):
        return  # no snapshot yet; the regular run creates it
    current = {s["id"]: s for sp in data.get("sports", []) for s in sp["subjects"]}
    changed = []
    for sport in config["sports"]:
        try:
            provider = importlib.import_module(f"providers.{sport['provider']}")
        except Exception:
            continue
        # Optional sport-level live data (F1 live timing tower); {"live": None} clears it.
        if hasattr(provider, "refresh_live_sport"):
            entry = next((sp for sp in data["sports"] if sp["id"] == sport["id"]), None)
            try:
                upd = provider.refresh_live_sport(sport, entry) if entry is not None else None
            except Exception:
                traceback.print_exc(file=sys.stderr)
                upd = None
            if upd is not None:
                entry.update(upd)
                changed.append(sport["id"])
        if not hasattr(provider, "refresh_live"):
            continue
        for cfg in sport["subjects"]:
            subj = current.get(cfg["id"])
            try:
                update = provider.refresh_live(cfg, subj)
            except Exception:
                traceback.print_exc(file=sys.stderr)
                continue
            if not update or subj is None:
                continue
            if update.pop("refresh_sport", False) and hasattr(provider, "fetch_sport"):
                entry = next((sp for sp in data["sports"] if sp["id"] == sport["id"]), None)
                try:
                    if entry is not None:
                        entry.update(provider.fetch_sport(sport), tables_stale=False)
                except Exception:
                    traceback.print_exc(file=sys.stderr)
            profile = update.pop("profile", None)
            subj.update(update)
            if profile:
                subj.update(profile_fields(profile, cfg))
            subj.update(updated_at=iso(now_utc()), stale=False, error=None)
            changed.append(cfg["id"])
    if changed:
        data["generated_at"] = iso(now_utc())
        write_atomic(out_path, data)
        print(f"{iso(now_utc())} live update: {', '.join(changed)}")


if __name__ == "__main__":
    live_main() if "--live" in sys.argv else main()
