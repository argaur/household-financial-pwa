#!/usr/bin/env python3
"""
CI event-registry check. Fails the build when:
  1. Feature code calls the raw PostHog SDK instead of the track() wrapper.
  2. A track("...") / track('...') event name is not in the registry.

Run from repo root:  python scripts/check_events.py
Wire into CI (GitHub Actions step) after tests.

Conventions assumed (adjust REGISTRY_* if your layout differs):
  frontend registry: frontend/src/lib/analytics.ts   (AnalyticsEvent union)
  backend registry:  backend/app/analytics.py        (REGISTERED_EVENTS set)
"""

from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SCAN_DIRS = ["src", "api"]
ALLOWED_RAW_SDK_FILES = {"analytics.ts", "analytics.py", "posthog.ts"}
CODE_EXT = {".ts", ".tsx", ".js", ".jsx", ".py"}

RAW_SDK = re.compile(r"posthog\s*\.\s*(capture|init|identify)\s*\(")
TRACK_CALL = re.compile(r"""\btrack\s*\(\s*["']([a-zA-Z0-9_]+)["']""")
# This project's registry is an `interface EventMap { event_name: {...} }` (src/lib/analytics.ts),
# not a string-literal union — match top-level object keys instead of `| "name"`.
TS_EVENT = re.compile(r"""^\s{2}([a-zA-Z0-9_]+):""", re.MULTILINE)
PY_EVENT = re.compile(r"""^\s*["']([a-zA-Z0-9_]+)["']\s*,\s*$""", re.MULTILINE)


def load_registry() -> set[str]:
    events: set[str] = set()
    for path in ROOT.rglob("analytics.*"):
        if "node_modules" in path.parts:
            continue
        if path.name == "analytics.ts":
            events |= set(TS_EVENT.findall(path.read_text(encoding="utf-8")))
        elif path.name == "analytics.py":
            events |= set(PY_EVENT.findall(path.read_text(encoding="utf-8")))
    return events


def main() -> int:
    registry = load_registry()
    if not registry:
        print("ERROR: no event registry found (analytics.ts / analytics.py).")
        return 1

    failures: list[str] = []
    for d in SCAN_DIRS:
        base = ROOT / d
        if not base.exists():
            continue
        for f in base.rglob("*"):
            if f.suffix not in CODE_EXT or f.name in ALLOWED_RAW_SDK_FILES:
                continue
            text = f.read_text(encoding="utf-8", errors="ignore")
            if RAW_SDK.search(text):
                failures.append(f"{f.relative_to(ROOT)}: raw posthog SDK call — use track()")
            for event in TRACK_CALL.findall(text):
                if event not in registry:
                    failures.append(f"{f.relative_to(ROOT)}: unregistered event '{event}'")

    if failures:
        print("EVENT REGISTRY CHECK FAILED:")
        for line in failures:
            print(f"  ✗ {line}")
        return 1

    print(f"Event registry check passed ({len(registry)} registered events).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
