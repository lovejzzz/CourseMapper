#!/usr/bin/env python3
"""Resolve one immutable Hugging Face snapshot for Scion adapter training."""

import argparse
import json
import re
import sys
from pathlib import Path

from huggingface_hub import snapshot_download


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--revision", required=True)
    parser.add_argument("--cache-dir", required=True)
    parser.add_argument("--local-files-only", action="store_true")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-f0-9]{40}", args.revision):
        raise SystemExit("revision must be an exact 40-character commit SHA")

    snapshot = Path(
        snapshot_download(
            repo_id=args.model,
            revision=args.revision,
            cache_dir=args.cache_dir,
            local_files_only=args.local_files_only,
        )
    ).resolve()
    if snapshot.name != args.revision:
        raise SystemExit(f"resolved snapshot does not match requested revision: {snapshot}")
    print(
        json.dumps(
            {"modelId": args.model, "revision": args.revision, "snapshot": str(snapshot)},
            separators=(",", ":"),
        ),
        file=sys.stderr,
    )
    print(snapshot)


if __name__ == "__main__":
    main()
