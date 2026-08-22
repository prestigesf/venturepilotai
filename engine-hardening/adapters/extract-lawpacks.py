#!/usr/bin/env python3
"""extract-lawpacks.py — recover per-phase law-pack facts from engine history.

READ-ONLY against the engine repository.

A frozen baseline records `<sha256>  <path>` per file, which names files but not
their contents. Git history holds every version of every file. Indexing history
by the SHA-256 of each blob's content lets any baseline line be resolved to the
exact bytes that file had at that phase — so pack facts are read from what the
phase actually contained, not from whatever the file says today.

Emits, per phase, the figures the scorer needs as INDEPENDENT denominators:

  requirements_total     requirements declared across all packs present
  requirements_wired     requirements in packs that also have a penalty profile,
                         i.e. those the engine can carry through to exposure
  jurisdictions          distinct jurisdictions declared
  packs_cited            packs carrying a statutory citation

The wired/total split is the point. Packs arrived at phase 3; their penalty
profiles did not arrive until phase 10. A ratio built from the same count on
both sides would have shown 1.0 throughout and hidden that gap entirely.

  python3 extract-lawpacks.py <engine-root> <out.json> [max-phase]
"""

import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

import yaml


def blob_index(root: Path) -> dict[str, str]:
    """Map sha256(content) -> git object id, across all of history."""
    out = subprocess.run(
        ["git", "-C", str(root), "rev-list", "--objects", "--all"],
        capture_output=True, text=True, check=True).stdout.splitlines()
    index: dict[str, str] = {}
    for line in out:
        parts = line.split(maxsplit=1)
        if len(parts) != 2:
            continue
        oid, _path = parts
        kind = subprocess.run(["git", "-C", str(root), "cat-file", "-t", oid],
                              capture_output=True, text=True).stdout.strip()
        if kind != "blob":
            continue
        content = subprocess.run(["git", "-C", str(root), "cat-file", "blob", oid],
                                 capture_output=True).stdout
        index.setdefault(hashlib.sha256(content).hexdigest(), oid)
    return index


def read_blob(root: Path, oid: str) -> bytes:
    return subprocess.run(["git", "-C", str(root), "cat-file", "blob", oid],
                          capture_output=True).stdout


def baseline(root: Path, phase: int) -> dict[str, str]:
    path = root / "evidence" / f"baseline_code_postPhase{phase}.txt"
    entries: dict[str, str] = {}
    for line in path.read_text().splitlines():
        m = re.match(r"^([0-9a-f]{64})\s+(.+)$", line.strip())
        if m:
            entries[m.group(2)] = m.group(1)
    return entries


def main() -> int:
    root = Path(sys.argv[1]).resolve()
    out_path = Path(sys.argv[2])
    max_phase = int(sys.argv[3]) if len(sys.argv) > 3 else 33

    index = blob_index(root)
    phases = {}

    for phase in range(1, max_phase + 1):
        try:
            files = baseline(root, phase)
        except FileNotFoundError:
            continue

        packs = {p: h for p, h in files.items() if p.startswith("lawpacks/") and p.endswith(".yaml")}
        profiles = {p for p in files if p.startswith("penaltyprofiles/") and p.endswith(".yaml")}
        profiled_laws = {Path(p).stem.removeprefix("pen_").rsplit("_v", 1)[0] for p in profiles}

        requirements_total = 0
        requirements_wired = 0
        jurisdictions: set[str] = set()
        packs_cited = 0
        unresolved: list[str] = []
        detail = []

        for path, sha in sorted(packs.items()):
            oid = index.get(sha)
            if oid is None:
                unresolved.append(path)
                continue
            try:
                doc = yaml.safe_load(read_blob(root, oid)) or {}
            except yaml.YAMLError:
                unresolved.append(path)
                continue
            law_id = doc.get("law_id") or Path(path).stem
            reqs = len(doc.get("requirements") or [])
            wired = law_id in profiled_laws
            requirements_total += reqs
            if wired:
                requirements_wired += reqs
            if doc.get("jurisdiction"):
                jurisdictions.add(str(doc["jurisdiction"]))
            if doc.get("citation"):
                packs_cited += 1
            detail.append({"law_id": law_id, "requirements": reqs, "penalty_profile": wired})

        phases[str(phase)] = {
            "packs": len(packs),
            "packs_resolved": len(packs) - len(unresolved),
            "packs_unresolved": unresolved,
            "requirements_total": requirements_total,
            "requirements_wired": requirements_wired,
            "jurisdictions": len(jurisdictions),
            "packs_cited": packs_cited,
            "detail": detail,
        }

    out_path.write_text(json.dumps({
        "_comment": "Per-phase law-pack facts, read from the exact historical bytes "
                    "of each pack via content-addressed lookup into git history. "
                    "Read-only; the engine repository is never modified.",
        "engine_root": str(root),
        "blobs_indexed": len(index),
        "phases": phases,
    }, indent=2) + "\n")

    resolved = sum(p["packs_resolved"] for p in phases.values())
    missing = sum(len(p["packs_unresolved"]) for p in phases.values())
    print(f"{len(phases)} phases; {resolved} pack versions resolved, {missing} unresolved")
    return 1 if missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
