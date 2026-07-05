# Tendril-E v2 — stance fine-tune + ONNX q8 export (R1).
# TripletLoss on the bank stance triplets; MPS; export back into the
# transformers.js runtime layout (models/tendril-e2/onnx/model_quantized.onnx)
# so Node and the browser load it exactly like v1.

import json
import os

from sentence_transformers import InputExample, SentenceTransformer, losses
from torch.utils.data import DataLoader

HERE = os.path.dirname(os.path.abspath(__file__))
TRIPLETS = os.path.join(HERE, "stance-triplets.jsonl")
FT_DIR = os.path.join(HERE, "stance-model")
EXPORT_DIR = os.path.join(HERE, "..", "models", "tendril-e2")


def train():
    model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2", device="mps")
    examples = [
        InputExample(texts=[t["anchor"], t["positive"], t["negative"]])
        for t in (json.loads(l) for l in open(TRIPLETS))
    ]
    loader = DataLoader(examples, shuffle=True, batch_size=64)
    loss = losses.TripletLoss(model, triplet_margin=0.25)
    model.fit(train_objectives=[(loader, loss)], epochs=2, warmup_steps=50, show_progress_bar=True)
    model.save(FT_DIR)
    print("saved", FT_DIR)


def export():
    import shutil
    import subprocess

    tmp = os.path.join(HERE, "stance-onnx")
    subprocess.run(
        [
            os.path.join(HERE, "..", ".venv", "bin", "optimum-cli"),
            "export",
            "onnx",
            "--model",
            FT_DIR,
            "--task",
            "feature-extraction",
            tmp,
        ],
        check=True,
    )
    from onnxruntime.quantization import QuantType, quantize_dynamic

    os.makedirs(os.path.join(EXPORT_DIR, "onnx"), exist_ok=True)
    quantize_dynamic(
        os.path.join(tmp, "model.onnx"),
        os.path.join(EXPORT_DIR, "onnx", "model_quantized.onnx"),
        weight_type=QuantType.QUInt8,
    )
    for f in ("config.json", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json", "vocab.txt"):
        src = os.path.join(tmp, f)
        if os.path.exists(src):
            shutil.copy(src, os.path.join(EXPORT_DIR, f))
    size = os.path.getsize(os.path.join(EXPORT_DIR, "onnx", "model_quantized.onnx")) / 1e6
    print(f"exported {EXPORT_DIR} ({size:.1f} MB quantized)")


if __name__ == "__main__":
    train()
    export()
