"""Show unique n_fft/dim_f/stem combos from model_data.json."""

import json

with open("models/mdxnet_models/model_data.json") as f:
    data = json.load(f)

seen = set()
for k, v in data.items():
    if isinstance(v, dict) and "mdx_n_fft_scale_set" in v:
        key = (v["mdx_n_fft_scale_set"], v.get("mdx_dim_f_set"), v.get("primary_stem"))
        if key not in seen:
            seen.add(key)
            print(key)
