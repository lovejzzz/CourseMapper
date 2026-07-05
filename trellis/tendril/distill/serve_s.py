# Tendril-S local inference server (zero-API mode).
# Persistent JSONL protocol on stdin/stdout: {"id","system","user"} in,
# {"id","text"} out. Loads SmolLM2-135M + the round-2 adapter once
# (~2-4s), then serves at M4-class speed. Greedy first; one temp-0.7
# retry on identity no-ops (mirrors gen_test.py — the gates judge the
# retry, so it is risk-free by construction).

import json
import os
import sys

from mlx_lm import load, generate
from mlx_lm.sample_utils import make_sampler

HERE = os.path.dirname(os.path.abspath(__file__))
model, tokenizer = load("HuggingFaceTB/SmolLM2-135M-Instruct", adapter_path=os.path.join(HERE, "adapters"))
print(json.dumps({"ready": True}), flush=True)

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        req = json.loads(line)
        prompt = tokenizer.apply_chat_template(
            [{"role": "system", "content": req["system"]}, {"role": "user", "content": req["user"]}],
            tokenize=False,
            add_generation_prompt=True,
        )
        text = generate(model, tokenizer, prompt=prompt, max_tokens=600).strip()
        source = req.get("source", "")
        if source and (text == source.strip() or text in source or source.strip() in text):
            text = generate(
                model, tokenizer, prompt=prompt, max_tokens=600, sampler=make_sampler(temp=0.7)
            ).strip()
        print(json.dumps({"id": req.get("id"), "text": text}), flush=True)
    except Exception as error:  # noqa: BLE001 — server must not die mid-run
        print(json.dumps({"id": req.get("id") if isinstance(req, dict) else None, "error": str(error)[:200]}), flush=True)
