# CPU 2-Stem Model Guide (AWS EC2 t3.large)

For AWS EC2 `t3.large` (`2 vCPUs`, `8 GB RAM`), use models that prioritize inference speed while keeping strong SDR quality.  
For a web app workflow, avoid low-quality legacy defaults and focus on CPU-friendly 2-stem architectures.

## 1) MDX-Net: Kim Vocal 2

This is a strong high-speed, high-quality option for CPU vocal separation.

- **Why it is good:** Consistently ranks near the top of 2-stem quality comparisons.
- **Performance:** Typically much faster than RoFormer-class and hybrid Demucs workflows on CPU.
- **Best use:** Default `Quality` tier for production vocal/instrumental extraction.

## 2) MDX23C-InstVoc HQ

A newer architecture that sits between classic MDX and heavier transformer-style models.

- **Why it is good:** High-fidelity vocal/instrumental separation and better handling of dense mixes.
- **Performance:** Slightly heavier than Kim Vocal-class models, but still practical on CPU.
- **Best use:** `Pro` / `Ultra` tier where users accept extra processing time for cleaner stems.

## 3) Mel-Roformer (L6 / Small)

If you need a RoFormer option, prefer lighter Mel-Roformer variants over heavier alternatives.

- **Why it is good:** Strong vocal isolation quality with lower bleed in many benchmarks.
- **Performance:** Lighter variants are more viable on `t3.large` than large RoFormer models.
- **Best use:** Highest isolation quality scenarios where speed is secondary.

## 4) VR Architecture (HP-UVR models)

Legacy architecture, but still very useful for low-resource and speed-first paths.

- **Why it is good:** Very fast on CPU-only environments.
- **Performance:** Fastest practical option in many low-resource workflows.
- **Best use:** `Speed` / `Lite` tier and quick preview generation.

## Suggested Tier Mapping (Web App)

| Tier | Recommended Model | Approx. Speed (t3.large) |
|---|---|---|
| Speed | `UVR-MDX-NET-Voc_FT` or `VR HP2` | `< 2 minutes` |
| Quality | `Kim Vocal 2` | `2-4 minutes` |
| Pro | `MDX23C-InstVoc HQ` | `4-6 minutes` |

## ONNX Deployment Note

When available, prefer quantized ONNX variants (`uint8`, `q4`) for CPU-serving.  
These can substantially reduce CPU and memory usage while keeping acceptable separation quality.

## Source Links

1. [reddit.com](https://www.reddit.com/r/buildapc/comments/1eqfn4a/what_is_the_best_value_cpu_for_everyday_use_no/#:~:text=Table_title:%20Comments%20Section%20Table_content:%20header:%20%7C%20Type,Drive%20%7C%20Price:%20$57.99%20@%20Amazon%20%7C)
2. [mvsep.com](https://mvsep.com/quality_checker/synth_leaderboard?page=5)
3. [github.com](https://github.com/Anjok07/ultimatevocalremovergui/discussions/1608)
4. [reddit.com](https://www.reddit.com/r/audioengineering/comments/1oibijl/ultimate_vocal_remover_5_best_settings_for/)
5. [rysupaudio.com](https://rysupaudio.com/blogs/news/best-free-stem-separators-2026)
6. [reddit.com](https://www.reddit.com/r/buildapc/comments/1gethbi/best_cpu_right_now_for_both_gaming_productivity/#:~:text=RTX%204080%20%28or%20better%29%20128GB%20DDR5%20%28as,back%29%20%3E=4x%20M.2%20slots.%20%3E=4x%20SATA%20ports.)
7. [quora.com](https://www.quora.com/Which-processor-is-better-for-multitasking-AMD-Ryzen-or-Intel-Core)
