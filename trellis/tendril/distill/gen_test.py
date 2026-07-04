# Generate Tendril-S outputs on the held-out test sample (TENDRIL.md T-M3).
# Deterministic sample: first N of each task in test.jsonl order (the split
# was shuffled with a fixed seed at prep time). Output feeds gateBench.mjs.

import json
import os
import sys

from mlx_lm import load, generate

HERE = os.path.dirname(os.path.abspath(__file__))
N_PER_TASK = 60

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


def main():
    adapter = os.path.join(HERE, "adapters")
    use_adapter = "--base" not in sys.argv and os.path.isdir(adapter)
    model, tokenizer = load(
        "HuggingFaceTB/SmolLM2-135M-Instruct",
        adapter_path=adapter if use_adapter else None,
    )
    tests = [json.loads(line) for line in open(os.path.join(HERE, "test-heldout.jsonl")) if line.strip()]
    sample = []
    counts = {"skin": 0, "blend": 0}
    for t in tests:
        if counts[t["task"]] < N_PER_TASK:
            counts[t["task"]] += 1
            sample.append(t)
    out_name = "tendril-s.jsonl" if use_adapter else "smollm-base.jsonl"
    os.makedirs(os.path.join(HERE, "outputs"), exist_ok=True)
    out_path = os.path.join(HERE, "outputs", out_name)
    with open(out_path, "w") as f:
        for i, t in enumerate(sample):
            system = SKIN_SYSTEM if t["task"] == "skin" else BLEND_SYSTEM
            user = json.dumps({"mode": t["mode"], "text": t["source"]} if t["mode"] else {"text": t["source"]})
            prompt = tokenizer.apply_chat_template(
                [{"role": "system", "content": system}, {"role": "user", "content": user}],
                tokenize=False,
                add_generation_prompt=True,
            )
            output = generate(model, tokenizer, prompt=prompt, max_tokens=600)
            f.write(json.dumps({"task": t["task"], "mode": t["mode"], "source": t["source"], "output": output.strip()}) + "\n")
            if (i + 1) % 20 == 0:
                print(f"{i + 1}/{len(sample)}", flush=True)
    print("wrote", out_path)


if __name__ == "__main__":
    main()
