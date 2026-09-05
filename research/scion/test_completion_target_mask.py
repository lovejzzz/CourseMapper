"""Regression tests for the production completion-target mask, without weights.

NumPy exercises the same elementwise expressions. This tests token selection
and padding invariance, not numerical parity of a full MLX training run.
"""
import importlib.util
import unittest
from pathlib import Path
import numpy as np

spec = importlib.util.spec_from_file_location('scion_trainer', Path(__file__).with_name('scion_seeded_mlx_vlm_lora.py'))
trainer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(trainer)

class CompletionMaskTests(unittest.TestCase):
    def selected(self, ids, attention):
        ids = np.array([ids])
        mask = trainer._mlx_completion_target_mask(ids, np.array([attention]), np)
        return ids[:, 1:][mask].tolist()

    def test_right_padding_never_adds_a_pad_target(self):
        tokens = [2,105,4368,107,1000,1001,106]
        for padding in [0,1,3,128]:
            with self.subTest(padding=padding):
                self.assertEqual(self.selected(tokens+[0]*padding, [1]*len(tokens)+[0]*padding), [1000,1001,106])

    def test_last_complete_assistant_header_wins(self):
        tokens=[2,105,4368,107,200,106,105,400,107,4368,500,105,4368,107,1000,106,0]
        self.assertEqual(self.selected(tokens,[1]*(len(tokens)-1)+[0]),[1000,106])

    def test_left_padding_and_attention_holes_are_respected(self):
        tokens=[0,0,2,105,4368,107,1000,1001,106,0]
        self.assertEqual(self.selected(tokens,[0,0,1,1,1,1,1,0,1,0]),[1000,106])

    def test_average_log_probability_does_not_change_with_padding(self):
        scores=np.array([-.2,-.4,-.6])
        for padding in [0,5]:
            ids=np.array([[2,105,4368,107,1000,1001,106]+[0]*padding])
            attn=np.array([[1]*7+[0]*padding])
            mask=trainer._mlx_completion_target_mask(ids,attn,np)
            logps=np.full(mask.shape,-90.0)
            logps[mask]=scores
            self.assertAlmostEqual(float((logps*mask).sum()/mask.sum()),-.4)

if __name__ == '__main__':
    unittest.main()
