"""
Derive MDX config from ONNX tensor shapes directly.
Shape: (batch, 4, n_bins, dim_t) where n_bins = n_fft//2 + 1
So n_fft = (n_bins - 1) * 2, dim_t = time frames.
"""

models = {
    "Kim_Vocal_2.onnx": (3072, 256),  # (n_bins, dim_t) from probe
    "UVR-MDX-NET-Voc_FT.onnx": (3072, 256),
    "UVR-MDX-NET-Inst_HQ_4.onnx": (2560, 256),
    "UVR-MDX-NET-Inst_HQ_5.onnx": (2560, 256),
    "UVR_MDXNET_1_9703.onnx": (2048, 256),
}

for name, (n_bins, dim_t) in models.items():
    n_fft = (n_bins - 1) * 2
    hop = n_fft // 2
    chunk_samples = hop * (dim_t - 1)
    chunk_sec = chunk_samples / 44100
    print(f"{name}:")
    print(f"  n_fft={n_fft}  hop={hop}  dim_t={dim_t}")
    print(f"  chunk_samples={chunk_samples}  chunk_sec={chunk_sec:.2f}s")
    print()
