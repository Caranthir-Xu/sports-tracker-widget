#!/usr/bin/env python3
"""Fetch all followed subjects and write data.json.

A failing subject keeps its last good data and is marked stale;
other subjects are unaffected.
"""
import importlib
import json
import os
import sys
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


def main():
    config = yaml.safe_load((ROOT / "config.yaml").read_text())
    out_path = ROOT / config.get("output", "data.json")
    previous, previous_sports = load_previous(out_path)
    failures = 0

    sports = []
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

    data = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": iso(now_utc()),
        "timezone": config.get("timezone", "UTC"),
        "sports": sports,
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


if __name__ == "__main__":
    main()
