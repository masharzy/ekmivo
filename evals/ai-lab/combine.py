#!/usr/bin/env python3
"""Combine AI Lab job reports (one runs.json per candidate and arm) into one comparison.

Usage: combine.py <dir with ai-lab-* artifact folders> > summary.md
Each folder holds runs.json and arm.txt (written by the workflow). Scoring rules are the same as the harness:
a scenario passes for a candidate only if every repeat passed (worst case). Scenarios that no candidate
passed in any arm are listed separately as likely platform problems, so they are visible but do not decide
the ranking between models.
"""
import json
import pathlib
import sys
from collections import defaultdict


def main(root: str) -> None:
    runs = []
    for folder in sorted(pathlib.Path(root).glob("ai-lab-*")):
        f = folder / "runs.json"
        if not f.exists():
            continue
        arm = (folder / "arm.txt").read_text().strip() if (folder / "arm.txt").exists() else "?"
        for r in json.loads(f.read_text()):
            r["arm"] = arm
            runs.append(r)
    if not runs:
        print("No AI Lab runs found.")
        return
    # (arm, candidate, scenario) -> [passed, total]
    cell = defaultdict(lambda: [0, 0])
    cost = defaultdict(float)
    convs = defaultdict(int)
    for r in runs:
        k = (r["arm"], r["candidate"], r["scenario"])
        cell[k][1] += 1
        cell[k][0] += 0 if r.get("failures") else 1
        cost[(r["arm"], r["candidate"])] += r.get("cost_usd", 0)
        convs[(r["arm"], r["candidate"])] += 1
    scenarios = sorted({r["scenario"] for r in runs})
    arms = sorted({r["arm"] for r in runs})
    cands = sorted({r["candidate"] for r in runs})
    nobody = [s for s in scenarios if not any(cell[(a, c, s)][0] == cell[(a, c, s)][1] > 0 for a in arms for c in cands)]
    scored = [s for s in scenarios if s not in nobody]

    print("# AI Lab comparison\n")
    print("A scenario counts as passed only if every repeat passed. Cost is real OpenRouter usage per conversation.\n")
    for a in arms:
        print(f"## Arm `{a}`\n")
        print("| Candidate | Scenarios passed | Avg cost / conversation (USD) |\n|---|---|---|")
        rows = []
        for c in cands:
            if not convs[(a, c)]:
                continue
            ok = sum(1 for s in scored if cell[(a, c, s)][1] and cell[(a, c, s)][0] == cell[(a, c, s)][1])
            rows.append((ok, -cost[(a, c)] / convs[(a, c)], c))
        for ok, neg, c in sorted(rows, reverse=True):
            print(f"| `{c}` | {ok} / {len(scored)} | {-neg:.5f} |")
        print()
    if nobody:
        print("## Failed for every candidate in every arm (likely platform problem, not scored)\n")
        for s in nobody:
            print(f"- {s}")
        print()
    print("## Per scenario (passed / runs)\n")
    cols = [(a, c) for a in arms for c in cands if convs[(a, c)]]
    print("| Scenario | " + " | ".join(f"{c.split('/')[-1]} ({a})" for a, c in cols) + " |")
    print("|---|" + "---|" * len(cols))
    for s in scenarios:
        print(f"| {s} | " + " | ".join("{}/{}".format(*cell[(a, c, s)]) for a, c in cols) + " |")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ".")
