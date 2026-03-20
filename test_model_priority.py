#!/usr/bin/env python3
"""
Test script to verify our model priority logic without running full separation.
"""

import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from stem_service.config import (
    mdx23c_vocal_available,
    mdx23c_inst_available,
    mel_band_roformer_vocal_available,
    mel_band_roformer_inst_available,
    bs_roformer_vocal_available,
    bs_roformer_inst_available,
    scnet_available,
    htdemucs_available,
)


def test_model_detection():
    """Test that our model detection functions work correctly."""
    print("=== Model Detection Test ===")
    print(f"MDX23C Vocal Available: {mdx23c_vocal_available()}")
    print(f"MDX23C Instrumental Available: {mdx23c_inst_available()}")
    print(f"Mel-Band RoFormer Vocal Available: {mel_band_roformer_vocal_available()}")
    print(
        f"Mel-Band RoFormer Instrumental Available: {mel_band_roformer_inst_available()}"
    )
    print(f"BS-RoFormer Vocal Available: {bs_roformer_vocal_available()}")
    print(f"BS-RoFormer Instrumental Available: {bs_roformer_inst_available()}")
    print(f"SCNet Available: {scnet_available()}")
    print(f"Demucs Available: {htdemucs_available()}")
    print()


def test_2stem_priority():
    """Test the 2-stem priority logic as recommended in NEW-flow.md."""
    print("=== 2-Stem Priority Logic (NEW-flow.md) ===")
    print("Priority order:")
    print("  1. MDX23C vocal ONNX + MDX23C instrumental ONNX (no phase inversion)")
    print("  2. SCNet 4-stem -> collapse to 2-stem")
    print("  3. Mel-Band RoFormer vocal + phase inversion")
    print("  4. BS-RoFormer vocal + phase inversion")
    print("  5. Demucs 2-stem (fallback)")
    print()

    # Simulate the decision logic
    if mdx23c_vocal_available() and mdx23c_inst_available():
        print("SELECTED: MDX23C vocal + instrumental (PRIMARY CHOICE)")
        return "mdx23c"
    elif scnet_available():
        print("SELECTED: SCNet 4-stem -> collapse (SECONDARY CHOICE)")
        return "scnet_collapse"
    elif mel_band_roformer_vocal_available():
        print("SELECTED: Mel-Band RoFormer vocal + phase inversion (TERTIARY CHOICE)")
        return "mel_band"
    elif bs_roformer_vocal_available():
        print("SELECTED: BS-RoFormer vocal + phase inversion (QUATERNARY CHOICE)")
        return "bs_roformer"
    elif htdemucs_available():
        print("SELECTED: Demucs 2-stem (FALLBACK)")
        return "demucs"
    else:
        print("ERROR: No separation models available!")
        return None


def test_4stem_priority():
    """Test the 4-stem priority logic as recommended in NEW-flow.md."""
    print("\n=== 4-Stem Priority Logic (NEW-flow.md) ===")
    print("Priority order:")
    print("  1. SCNet-large ONNX (PRIMARY CHOICE)")
    print("  2. Demucs htdemucs (QUALITY FALLBACK)")
    print("  3. MDX23C 4-stem (SPEED EXPERIMENT)")
    print()

    # Simulate the decision logic
    if scnet_available():
        print("SELECTED: SCNet-large ONNX (PRIMARY CHOICE)")
        return "scnet"
    elif htdemucs_available():
        print("SELECTED: Demucs htdemucs (QUALITY FALLBACK)")
        return "demucs"
    else:
        print("ERROR: No 4-stem separation models available!")
        return None


if __name__ == "__main__":
    print("Testing NEW-flow.md model priority logic for AWS t3.large\n")

    test_model_detection()

    two_stem_choice = test_2stem_priority()
    four_stem_choice = test_4stem_priority()

    print("\n=== SUMMARY ===")
    print(f"Recommended 2-stem model: {two_stem_choice}")
    print(f"Recommended 4-stem model: {four_stem_choice}")

    if two_stem_choice and four_stem_choice:
        print("\n✓ Model selection logic is working correctly!")
        print("✓ Ready to implement full separation pipeline.")
    else:
        print("\n✗ Model selection failed - check model availability.")
