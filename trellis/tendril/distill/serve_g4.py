# Gemma 4 E2B local inference server (the items/authoring route).
# Same JSONL protocol as serve_s.py; mlx-vlm backend (E2B is
# multimodal-native and mlx-lm cannot load it). Zero-shot BY DESIGN —
# two measured fine-tune collapses retired SFT for this model
# (TENDRIL_ROADMAP_V0.2.md §3).

import json
import os
import sys

from mlx_vlm import load, generate
from mlx_vlm.prompt_utils import apply_chat_template

MODEL = os.environ.get("G4_MODEL", "google/gemma-4-e2b-it")
model, processor = load(MODEL)
config = model.config
print(json.dumps({"ready": True}), flush=True)

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        req = json.loads(line)
        prompt = apply_chat_template(processor, config, f"{req['system']}\n\n{req['user']}", num_images=0)
        out = generate(model, processor, prompt, max_tokens=int(req.get("maxTokens", 1200)), verbose=False)
        text = (out.text if hasattr(out, "text") else str(out)).strip()
        print(json.dumps({"id": req.get("id"), "text": text}), flush=True)
    except Exception as error:  # noqa: BLE001
        print(json.dumps({"id": req.get("id") if isinstance(req, dict) else None, "error": str(error)[:200]}), flush=True)
