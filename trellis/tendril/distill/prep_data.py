# Tendril-S corpus prep (TENDRIL.md T-M3).
# reconstructed-pairs.jsonl -> mlx-lm chat JSONL (train/valid) + a held-out
# test set the model NEVER sees (the gate-acceptance bench runs on it).
# Split is by sha1 of the source text, so re-runs are stable and a source
# text can never leak across splits even if it appears in two pairs.

import hashlib
import json
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
CORPUS = os.path.join(HERE, "..", "corpus", "reconstructed-pairs.jsonl")
OUT = os.path.join(HERE, "data")

# The DEPLOYMENT prompts (compose.mjs skin / blend.mjs), single-entry form —
# S is trained on exactly the instruction it will serve.
SKIN_SYSTEM = (
    "You are the course's own instructor unifying a lesson plan assembled from proven parts. "
    "Rewrite the segment MINIMALLY so it reads as one instructor: fix week/lesson references, "
    "add one-clause transitions where segments collide, unify register. NEVER change technical "
    "content, examples, numbers, or code; never add new claims; keep the rewrite within ±40% of "
    "the original length. Return only the rewritten segment text."
)
BLEND_SYSTEM = (
    "You polish quiz explanations. The text contains corrective sentences that were pasted in "
    "mechanically, so it reads as two voices. Rewrite it as ONE natural explanation (2-3 sentences) "
    "that makes every corrective's content its own point — keep the key technical terms (a lexical "
    "gate checks this), never paste a corrective as a standalone sentence. Return only the rewritten "
    "explanation text."
)


def bucket(source_text):
    h = int(hashlib.sha1(source_text.encode()).hexdigest()[:8], 16) % 100
    if h < 80:
        return "train"
    if h < 88:
        return "valid"
    return "test"


def main():
    pairs = [json.loads(line) for line in open(CORPUS) if line.strip()]
    random.seed(7)
    random.shuffle(pairs)
    splits = {"train": [], "valid": [], "test": []}
    heldout = []
    for p in pairs:
        task = "blend" if p["surface"] == "quiz-explanation" else "skin"
        system = BLEND_SYSTEM if task == "blend" else SKIN_SYSTEM
        mode = p["surface"].split(":", 1)[1] if ":" in p["surface"] else None
        user = json.dumps({"mode": mode, "text": p["source"]} if mode else {"text": p["source"]})
        record = {
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
                {"role": "assistant", "content": p["target"]},
            ]
        }
        b = bucket(p["source"])
        splits[b].append(record)
        # R2: skin is outnumbered ~2.5:1 by blends and its acceptance
        # trailed (33% vs 73%); oversample skin x2 in TRAIN only.
        if b == "train" and task == "skin":
            splits[b].append(record)
        if b == "test":
            heldout.append({"task": task, "mode": mode, "source": p["source"], "reference": p["target"]})

    os.makedirs(OUT, exist_ok=True)
    # mlx-lm parses every jsonl in the data dir, so all three carry chat
    # format; the bench reads test-heldout.jsonl (its own shape) instead.
    for name in ("train", "valid", "test"):
        with open(os.path.join(OUT, f"{name}.jsonl"), "w") as f:
            for r in splits[name]:
                f.write(json.dumps(r) + "\n")
    with open(os.path.join(HERE, "test-heldout.jsonl"), "w") as f:
        for r in heldout:
            f.write(json.dumps(r) + "\n")
    print(json.dumps({k: len(v) for k, v in splits.items()}))


if __name__ == "__main__":
    main()
