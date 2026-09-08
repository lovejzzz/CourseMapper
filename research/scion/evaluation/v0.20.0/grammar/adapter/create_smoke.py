"""Generate an UNTRAINED rank-one adapter for native apply/clear tests only.
No training, semantic quality, or promotion claim. Needs gguf and numpy.
"""
from pathlib import Path
import argparse, hashlib, json
import numpy as np
from gguf import GGUFWriter, GGUFReader

parser = argparse.ArgumentParser()
parser.add_argument('base_shard', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
reader = GGUFReader(args.base_shard, 'r')
target = next(t for t in reader.tensors if t.name == 'blk.0.attn_q.weight')
width, height = map(int, target.shape)
if (width, height) != (1536, 2048):
    raise ValueError('Unexpected Gemma 4 E2B query shape')
rng = np.random.default_rng(7)
writer = GGUFWriter(args.output, 'gemma4')
writer.add_string('general.type', 'adapter')
writer.add_string('general.name', 'UNTRAINED mechanical smoke adapter')
writer.add_string('adapter.type', 'lora')
writer.add_float32('adapter.lora.alpha', 1.0)
writer.add_tensor(target.name + '.lora_a', rng.normal(0, 0.25, (1, width)).astype(np.float32))
writer.add_tensor(target.name + '.lora_b', rng.normal(0, 0.25, (height, 1)).astype(np.float32))
writer.write_header_to_file()
writer.write_kv_data_to_file()
writer.write_tensors_to_file()
writer.close()
receipt = {'kind': 'untrained-mechanical-smoke', 'promotionEligible': False, 'target': target.name,
           'baseShape': [width, height], 'rank': 1, 'seed': 7, 'bytes': args.output.stat().st_size,
           'sha256': hashlib.sha256(args.output.read_bytes()).hexdigest()}
args.output.with_suffix('.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
