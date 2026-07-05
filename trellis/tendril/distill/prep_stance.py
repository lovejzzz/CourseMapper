# Tendril-E v2 stance triplets (TENDRIL_ROADMAP_V0.1.1 R1).
# From the BANK only — never from the frozen eval files. Anchor = the
# misconception family statement; positives = the family's distractor
# texts (what wrong belief sounds like); negatives = the item's correct
# option and explanation (what right sounds like), plus the kernel's
# OTHER family's distractors as hard negatives for 2-way separation.
#
# Honesty: LOO retires as a generalization metric after this training
# (its queries are these very distractors); the ds-paraphrase rulers
# remain untouched and are the verdict.

import json
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
BANK = os.path.join(HERE, "..", "..", "bank", "all-items.json")
OUT = os.path.join(HERE, "stance-triplets.jsonl")


def main():
    bank = json.load(open(BANK))
    by_cell = {}
    for item in bank["items"]:
        if not item.get("familyKey"):
            continue
        cell = by_cell.setdefault((item["kernelId"], item["familyKey"]), {"pos": [], "neg": []})
        correct = item["options"][item["correctIndex"]]
        for i, opt in enumerate(item["options"]):
            if i != item["correctIndex"] and len(opt) >= 8:
                cell["pos"].append(opt)
        if len(correct) >= 8:
            cell["neg"].append(correct)
        if isinstance(item.get("explanation"), str) and len(item["explanation"]) >= 8:
            cell["neg"].append(item["explanation"])

    kernels = {}
    for (kernel, family), cell in by_cell.items():
        kernels.setdefault(kernel, []).append((family, cell))

    random.seed(7)
    triplets = []
    for kernel, families in kernels.items():
        for family, cell in families:
            hard = [p for other, c in families if other != family for p in c["pos"]]
            negatives = cell["neg"] + hard
            if not negatives:
                continue
            for pos in dict.fromkeys(cell["pos"]):
                neg = random.choice(negatives)
                triplets.append({"anchor": family, "positive": pos, "negative": neg})
                # a second draw with a different negative class when available
                if cell["neg"] and hard:
                    triplets.append({"anchor": family, "positive": pos, "negative": random.choice(hard)})

    random.shuffle(triplets)
    with open(OUT, "w") as f:
        for t in triplets:
            f.write(json.dumps(t) + "\n")
    print(json.dumps({"triplets": len(triplets), "cells": len(by_cell)}))


if __name__ == "__main__":
    main()
