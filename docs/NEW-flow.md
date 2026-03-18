****Latest RESEARCH****
// Possible new model setup and usage // 

 on a CPU-only EC2 t3.large, I would make SCNet your default production separator for the standard 4-stem case, and build your 2-stem mode by running that same 4-stem model and summing bass + drums + other = instrumental/accompaniment. That recommendation is mostly about your hardware: AWS lists t3.large at 2 vCPUs / 8 GiB RAM with 30% baseline CPU utilization per vCPU, and SCNet is the strongest primary-source option I found that explicitly combines strong separation quality with a CPU-speed claim: its paper reports 9.0 dB SDR on MUSDB18-HQ and says its CPU inference time is 48% of HT Demucs. The MUSDB18 target setup is the usual drums / bass / vocals / other stem split. 
1
If you want a slower high-quality fallback for hard songs, keep Demucs htdemucs as your “HQ retry” path. Demucs v4’s repo reports 9.0 dB SDR, or 9.2 dB with sparse-attention/per-source fine-tuning in the paper setup; the repo also says CPU processing time is roughly 1.5× track duration. Critically for your use case, Demucs also says --two-stems=vocals is not faster and does not use less memory, so it is not a good “fast 2-stem mode” trick on CPU. 
2
What I would actually ship
1) Production default
4 stems: SCNet
2 stems: SCNet 4-stem output, then sum non-vocal stems into accompaniment
Why: on your box, the best bet is the model that explicitly claims a CPU advantage over HT Demucs while still targeting SOTA-level quality. That is SCNet. Its official repo also provides inference code and downloadable checkpoints, including a large checkpoint release. 
3
2) Quality fallback / “hard song” mode
4 stems HQ: Demucs htdemucs
2 stems HQ: Demucs htdemucs, then keep vocals + sum the rest
Why: Demucs is still a very strong open baseline, but on CPU it is materially slower. Also, do not use htdemucs_ft by default on t3.large—the repo says it can be 4× slower than htdemucs. 
3) Experimental / beta only
5 stems: staged pipeline, not primary export
6 stems: do not promise “clean production” quality on this hardware
Why: the official Demucs repo includes htdemucs_6s, but it explicitly warns that piano is not working great and shows bleeding/artifacts. Spleeter officially ships pretrained 2-, 4-, and 5-stem models, so it is useful as a speed-oriented experimental splitter, but I would not make it your flagship export path because newer Demucs / BS-RoFormer / Mel-Band RoFormer / SCNet papers all position themselves as state-of-the-art improvements over earlier separators. 
Best model family by role
Best CPU-first production choice
SCNet.
Reason: it is the only current primary-source model here that plainly says, “better quality than prior SOTA, and faster on CPU than HT Demucs.” That is exactly the shape of problem you have. 
Best quality-oriented fallback on open pretrained weights
Demucs htdemucs.
Reason: still very strong quality, easy to deploy, mature ecosystem, and officially documented CPU support. Just don’t expect it to be your fast path on 2 vCPUs. Also note the original facebookresearch/demucs repo is archived and points to the author’s fork. 
Quality frontier if you later move off this box
BS-RoFormer / Mel-Band RoFormer.
BS-RoFormer reports 9.80 dB average SDR without extra training data and won the SDX23 music separation track; Mel-Band RoFormer says it outperforms BS-RoFormer on vocals, drums, and other on MUSDB18HQ. If you later move to a stronger CPU or GPU, this is the family I would investigate next for top-end quality. On this 2-vCPU burstable machine, though, SCNet has the clearer CPU story. 
4
My recommended app architecture
A. Two public quality tiers
Standard
2-stem: SCNet 4-stem → collapse accompaniment
4-stem: SCNet direct
HQ
2-stem: Demucs htdemucs
4-stem: Demucs htdemucs
That gives you a fast-ish default plus a slower rescue path. On a strict CPU-only service, that is much more realistic than betting everything on one huge model. Demucs’ own docs also say --shifts makes inference linearly slower and should not be used unless you have a GPU. 
B. 5/6-stem strategy
If you insist on 5 or 6 stems, I would label them beta/experimental and use a hierarchical split:
Stage 1: SCNet 4-stem
Stage 2: split only the other stem with a secondary model
For Stage 2, the only primary-source pretrained 5-stem option I found is Spleeter 5-stem. So the practical experiment is:
SCNet → keep vocals, bass, drums
Split other further with Spleeter 5-stem
Retain only the extra target you want from that second pass, and treat the remainder as revised other
That is my inference/design recommendation, not a published benchmark claim. I’m suggesting it because Spleeter officially offers 5-stem pretrained models, while Demucs’ official 6-stem path explicitly warns about piano artifacts. 
5
CPU-only deployment settings I would use
On a t3.large, I would run one separation job at a time per instance. Demucs documents a -j parallel-jobs flag, but it also warns that RAM usage scales with the job count. With only 8 GiB RAM and 2 vCPUs, horizontal scaling is safer than trying to multiplex one box. 
For PyTorch inference:
Python
import torch
torch.set_num_threads(2)
torch.set_num_interop_threads(1)
model.eval()
with torch.inference_mode():
    out = model(x)
PyTorch documents torch.set_num_threads() for CPU intra-op threading, torch.set_num_interop_threads() for inter-op threading, and inference_mode() as a faster inference context than ordinary autograd-disabled execution. 
6
For long tracks, use chunking with overlap/fade. Torchaudio’s Hybrid Demucs tutorial explicitly says chunking is needed for memory and that overlap helps suppress edge artifacts because boundaries can contain inaccurate sounds. Demucs’ own CLI docs expose --overlap and note it can be reduced from the default 0.25 to around 0.1 to improve speed. 
7
Experimental speed-ups worth trying
If you can export a model to ONNX, try ONNX Runtime + OpenVINO Execution Provider on this Intel-based T3 family. ONNX Runtime’s OpenVINO EP is specifically for accelerating inference on Intel CPUs and defaults to CPU; it also lets you set CPU options like device_type="CPU", PERFORMANCE_HINT="LATENCY", and NUM_STREAMS="1". AWS says T3 uses Intel Xeon Scalable processors. 
8
Quantization is worth testing, but only with A/B listening. ONNX Runtime says:
dynamic quantization is generally recommended for RNNs / transformer-based models
static quantization is generally recommended for CNN models
quantization can hurt accuracy, so you need to benchmark it on your actual audio. 
9
One more important AWS point
A sustained separator service is not a natural fit for T3. AWS says T3 instances are burstable, launch in unlimited mode by default, and can incur surplus credit charges if average CPU usage stays above baseline over time. For occasional jobs that may be fine; for steady throughput, it is the wrong instance class even before model choice enters the picture. 
10
My final recommendation
If I had to choose one setup for your exact constraints, I would do this:
Default 2-stem + 4-stem: SCNet
HQ fallback for difficult songs: Demucs htdemucs
Do not use htdemucs_ft by default
Do not market 6-stem as production-clean on t3.large
Use Spleeter only as preview / experimental secondary splitter
One job per instance, threaded for 2 CPU cores, chunked with overlap, torch.inference_mode()
If you have time for engineering, test ONNX Runtime + OpenVINO export paths
 first.
that would be great
gpt-5.4-search
Sources
preview
Short answer: on a CPU-only EC2 t3.large, I would make SCNet your default production separator for the standard 4-stem case, and build your 2-stem mode by running that same 4-stem model and summing bass + drums + other = instrumental/accompaniment. That recommendation is mostly about your hardware: AWS lists t3.large at 2 vCPUs / 8 GiB RAM with 30% baseline CPU utilization per vCPU, and SCNet is the strongest primary-source option I found that explicitly combines strong separation quality with a CPU-speed claim: its paper reports 9.0 dB SDR on MUSDB18-HQ and says its CPU inference time is 48% of HT Demucs. The MUSDB18 target setup is the usual drums / bass / vocals / other stem split. 
If you have time for engineering, test ONNX Runtime + OpenVINO export paths 
If you want, I can do a second pass focused on non-author fine-tuned checkpoints—UVR/MDX23C/Mel-Band/BS-RoFormer community models—and turn this into a ranked benchmark plan specifically for t3.large CPU-only, including a queue architecture and a test harness.
i need to find the perfect model set up for a stem splitter and music mixer web app im building. i am on cpu only no gpu. im running aws ec2 t3 large. I am trying to find the fastest way to separate music into stems while still retaining quality separation with little to no bleeding or ghost sounds. i need to be able to have a set up for base 2 stems and also a 4-6 stem setup. i'm comfortable with mixing models, or merging, or doing complex coding to accomplish this task. im okay with experimental strategies. i would prefer using pretrained models rather than having to train models. i can hunt down any fine tuned models that are needed. i can pull apart models and mix with others if needed. i can work with full stack apps in a multitude of programming languages. the goal is to find the fastest cpu only model setup to separate music stems as stated about, while still maintaining a quality finished product. a finished product that only partially separates is of no use. vocals must be clean. instrumentals must be clean.
Yes — here’s the **t3.large-specific benchmark plan** I would run.
**Bottom line first:** for a **CPU-only AWS t3.large**—which AWS lists at **2 vCPUs, 8 GiB RAM**, with **T3 Unlimited on by default** and possible extra CPU-credit charges under sustained load—you should not chase one universal “best” separator. You want a **router** with a **fast dedicated 2-stem lane**, a **CPU-balanced 4-stem lane**, and a **slower HQ rescue lane**. On this box, concurrency should be **1 job per instance**, not many parallel separations. 
The best backend to build around is **ZFTurbo’s Music-Source-Separation-Training (MSST)**, not because it is the single best model, but because its official repo gives you one scriptable framework that supports **MDX23C, htdemucs, BS-RoFormer, and Mel-Band RoFormer**, includes **inference**, an **ensemble script**, a **pre-trained model list**, and docs for **ONNX conversion**. In parallel, **UVR** is still very useful as a model-discovery/package ecosystem; its official repo says the app uses **state-of-the-art source separation models**, that the core devs trained most bundled models, and it explicitly credits **ZFTurbo** for the **MDX23C** models. 
## My ranked shortlist for your exact constraints
### A. Best **2-stem** benchmark order on t3.large
**1) MDX23C vocal/instrumental checkpoint family — benchmark this first.**  
This is my **best t3.large-specific hypothesis**, not a published t3.large result. The reason is that the **MDX23C family in MSST/UVR is based on KUIELab’s TFC-TDF v3 architecture**, and the KUIELab papers position that family as a **good balance of performance and required resources**, with **TFC-TDF-UNet v3** described as **time-efficient**. MSST officially exposes MDX23C inference and ONNX conversion, and UVR officially points to ZFTurbo as the MDX23C trainer. On a **2-vCPU** host, that makes MDX23C the most plausible **fast-enough while still usable** 2-stem starting point. 
**2) Mel-Band RoFormer vocal fine-tunes — likely your quality ceiling, but not your default CPU path.**  
The paper reports that **Mel-Band RoFormer outperforms BS-RoFormer on vocals, drums, and other** on MUSDB18-HQ. MSST officially supports this model family. My inference is that on a **t3.large**, this is more suitable as an **HQ rescue model** than as your main default, because transformer-heavy models tend to be a rough match for **2 vCPUs** unless your latency budget is generous. 
**3) BS-RoFormer vocal fine-tunes — second quality-rescue candidate.**  
The ByteDance paper reports **first place** in the **SDX23 MSS track**, and gives **9.80 dB average SDR** without extra training data and **11.99 dB** for the larger SDX system with extra songs. That is outstanding quality evidence. My inference, again, is that this family is more likely to be a **quality-first fallback** than a **fast CPU default** on your instance size. 
**4) SCNet 4-stem -> collapse to 2 stems.**  
If your dedicated 2-stem models leave too much vocal bleed, a good fallback is to run **SCNet 4-stem** and sum **drums + bass + other** into accompaniment. The SCNet paper is the strongest primary-source CPU story here: it reports **9.0 dB SDR** on MUSDB18-HQ and says its **CPU inference time is only 48% of HT Demucs**. The official repo also provides inference code and checkpoints, including **SCNet-large**. 
**5) Demucs `htdemucs` — only as HQ fallback, not as first try for 2 stems.**  
Demucs remains a very strong baseline, but its own repo says **CPU processing time is roughly 1.5× track duration**, `--two-stems=vocals` is **not faster** and uses **no less memory**, and `htdemucs_ft` is about **4× slower** than `htdemucs`. That makes it useful as a **rescue model**, not an economical default on this host. 
### B. Best **4-stem** benchmark order on t3.large
**1) SCNet-large — default 4-stem production candidate.**  
This is still my top 4-stem recommendation for your hardware because it is the only high-quality model here with an explicit **CPU speed advantage** over HT Demucs in the primary literature, plus official checkpoints and inference code. 
**2) Demucs `htdemucs` — quality fallback.**  
Demucs is mature, official, and easy to reproduce, but on CPU it is slower. So I would keep it as your **retry path** when SCNet leaves a bad vocal or a bad instrumental. 
**3) MDX23C 4-stem checkpoint — speed contender worth benchmarking, not guaranteed winner.**  
Because MSST officially supports MDX23C and the underlying TFC-TDF-v3 family is positioned as resource-balanced and time-efficient, MDX23C is a very reasonable **speed-oriented 4-stem benchmark candidate** on CPU. I would not assume it beats SCNet out of the box; I would test it side by side. 
**4) Community Mel-Band / BS-RoFormer 4-stem checkpoints — HQ experiments only.**  
The papers argue strongly for quality, and MSST supports those model families, but I would not make them your default on **2 vCPUs** until your own harness proves the latency is acceptable. 
### C. For **5–6 stems**
I would **not** promise 6-stem as your default “clean production” mode on a t3.large. Demucs’ official repo includes `htdemucs_6s`, but it explicitly says the added **piano source is not working great**. If you want 5–6 stems anyway, make it a **beta lane** and require it to pass your benchmark before you expose it broadly. 
My practical recommendation is a **hierarchical approach** for 5–6 stems: first run your best **4-stem** separator, then further split only the stem that needs more structure. That approach is an engineering inference, but it lines up with the benchmark/ensemble literature: the benchmark paper explicitly evaluates **ensembles** and says the best approach can come from **using different models for different stems**, and MSST ships an `ensemble.py` for exactly that reason. 
## What I would actually benchmark first
### Round 1: prune fast on 30–45 second excerpts
Use **12 songs**, each with **30–45 second excerpts**, covering:
- dry pop vocal
- reverby pop vocal
- rap
- dense EDM
- distorted rock
- acoustic ballad
- piano-forward mix
- live drum-heavy mix
- choir/backing-vocal-heavy mix
- old/mastered/lo-fi mix
- female lead with heavy effects
- male lead with dense midrange guitars
This is not from a paper; this is my proposed pruning set. But it mirrors why the literature uses multiple benchmarks and why the SDX challenge explicitly discusses **label noise** and **bleeding** as realistic failure modes. 
For **2 stems**, benchmark:
1. **MDX23C 2-stem**
2. **SCNet 4-stem -> collapse**
3. **Mel-Band RoFormer vocal**
4. **BS-RoFormer vocal**
5. **Demucs `htdemucs`**
6. **Demucs `htdemucs_ft`** only if the others are already close and you want to know the ceiling. 
For **4 stems**, benchmark:
1. **SCNet-large**
2. **MDX23C 4-stem**
3. **Demucs `htdemucs`**
4. **Mel-Band RoFormer 4-stem** if you have a vetted checkpoint
5. **BS-RoFormer 4-stem** if you have a vetted checkpoint. 
### Round 2: full-track test on the top 3
Promote only the top 3 from each lane to full-track tests. Measure:
- **wall-clock time**
- **xRT** = wall time / audio duration
- **peak RSS memory**
- **time-to-first-output**
- **subjective quality score**
- **hard fail / pass** on vocal bleed and instrumental contamination
Again, that exact scorecard is my recommendation, but it is motivated by the benchmark paper’s focus on more than just single-number SDR and by the challenge’s emphasis on bleeding robustness. 
### Round 3: stem-wise ensembles
Only after single models are benchmarked, try **one or two** stem-wise ensembles. Do **not** start with giant blends on t3.large. The benchmark paper explicitly supports per-stem model selection, and MSST includes an ensemble script, so this is worth trying after you know which model wins **vocals** vs **accompaniment** vs **drums/bass/other**. 
My first ensemble experiments would be:
- **2-stem:** take **vocals** from the best vocal specialist, and accompaniment from the same run or from the SCNet-collapse run, whichever is cleaner by ear.
- **4-stem:** take **vocals** from the best vocal model, **drums/bass/other** from the best full-stem model.
- **HQ retry only:** if the first model fails, rerun only then with the slower rescue model.
## The production router I would ship
### 2-stem router
- **Standard:** MDX23C 2-stem
- **If fail:** SCNet 4-stem -> collapse
- **If still fail:** Mel-Band RoFormer vocal
- **If still fail:** BS-RoFormer vocal
- **Last resort:** Demucs `htdemucs`
- **Very last resort:** Demucs `htdemucs_ft` only for premium/HQ jobs. 
### 4-stem router
- **Standard:** SCNet-large
- **If fail:** Demucs `htdemucs`
- **If speed matters more:** try MDX23C 4-stem as alternate standard lane
- **If premium/HQ:** optionally try community Mel-Band or BS-RoFormer 4-stem if your harness proves they are worth the latency. 
### 5–6 stem router
- **Beta only**
- **Run after 4-stem success**
- **Reject output** if it fails your cleanliness threshold instead of returning bad stems.  
That last part is my recommendation, but it follows directly from your product requirement: a partly separated output is worse than no output. Demucs’ own 6-stem warning is enough reason not to auto-promote this mode to production default. 
## Queue architecture for a t3.large
Because this instance is **2 vCPUs / 8 GiB** and burstable, I would use:
- **1 worker process**
- **1 active separation job**
- **horizontal scaling** for throughput
- **async job API**, not synchronous request/response
- **separate Standard and HQ queues**
- **job TTL + retry budget**
- **quality-gated escalation** rather than always running the heavy model. 
A simple architecture:
1. Upload audio to object storage or local durable volume.
2. Insert job row in DB.
3. Push a message to **Standard** or **HQ** queue.
4. Worker polls one job.
5. Worker runs a **preview separation** on the first 30–45 seconds.
6. If preview quality is good, run full track with same model.
7. If preview quality is bad, escalate to next model in the router.
8. Store stems + metrics + logs.
9. Return a final downloadable job result.
That preview/escalation policy is my design recommendation, but it is exactly how I’d control cost on a **T3 Unlimited** instance where long sustained CPU bursts can add charges. 
## CPU-only runtime settings I would lock in
Use **PyTorch CPU thread limits** aggressively:
```python
```
PyTorch’s docs say `torch.set_num_threads()` controls **intra-op CPU parallelism**, `torch.set_num_interop_threads()` controls **inter-op parallelism**, and `torch.inference_mode()` removes more overhead than `no_grad()` for pure inference. PyTorch also warns to set thread counts **before** running eager/JIT/autograd work. 
For long tracks, use **chunking with overlap/fades**. Torchaudio’s Hybrid Demucs tutorial explicitly says chunking is needed because the model is memory-hungry, and that overlap helps suppress **edge artifacts** because boundaries can contain inaccurate sounds. Demucs’ own CLI docs say the default `--overlap` is **0.25**, and it can often be reduced toward **0.1** for more speed. Also, do **not** use Demucs `--shifts` on this machine; its repo says it makes inference linearly slower and is not recommended unless you have a GPU. 
## ONNX / OpenVINO: worth trying, but selectively
This is one optimization path I would absolutely test for **MDX23C first**. MSST officially includes **ONNX conversion** docs, and ONNX Runtime’s official **OpenVINO Execution Provider** supports **Intel CPUs**. Since AWS says T3 uses **Intel Xeon Platinum 8000 series** CPUs, this is a natural fit to benchmark. 
I would **not** spend the first week trying to ONNX-optimize every model family. My order would be:
1. **MDX23C PyTorch**
2. **MDX23C ONNX/OpenVINO**
3. **SCNet PyTorch**
4. only then consider RoFormer ONNX experiments  
That ordering is my inference: start with the model family most likely to become your default 2-stem production lane. ONNX Runtime officially supports both the default CPU EP and OpenVINO EP, so you have a clean A/B path. 
## A benchmark harness I’d actually build
Use a manifest-driven harness:
```yaml
tracks:
  - id: pop_dry_female
    path: data/pop_dry_female.wav
    gt_dir: null
  - id: musdb_track_01
    path: data/musdb_track_01/mix.wav
    gt_dir: data/musdb_track_01/stems/
models:
  - id: mdx23c_2stem
    kind: msst
    cmd: python inference.py --model_type mdx23c --config_path configs/...yaml --start_check_point weights/...ckpt --input_folder {input_dir} --store_dir {out_dir}
  - id: scnet_large
    kind: scnet
    cmd: python -m scnet.inference --input_dir {input_dir} --output_dir {out_dir} --checkpoint_path weights/scnet_large.th
  - id: htdemucs
    kind: demucs
    cmd: demucs -n htdemucs -d cpu {input_file}
For each run, log:
- model id
- stems mode
- track id
- audio duration
- wall time
- xRT
- peak RSS
- output size
- any crash/OOM
- subjective rating fields
- GT metrics if available
That exact schema is my proposal, but it is aligned with how the demixing benchmark literature treats comparative evaluation and ensembling. 
For GT tracks, compute objective metrics only on a **small ground-truth set**; for the rest, do listening tests. Your app goal is **finished-product quality**, not just leaderboard SDR, so I’d define a **hard product fail** as:
- audible lead-vocal residual in instrumental
- audible backing-music contamination in vocal stem
- obvious phasy/ghost tails after vocal phrases
- obvious transient destruction on drums
- severe tonal hole in accompaniment
Those thresholds are my product recommendation, not a published standard.
## My final recommendation
If you asked me what to implement **this week**, I’d do this:
1. **Use MSST as the backend runner** and **UVR as the checkpoint ecosystem/reference point**. 
2. For **2 stems**, benchmark in this order: **MDX23C → SCNet collapse → Mel-Band vocal → BS-RoFormer vocal → htdemucs**. 
3. For **4 stems**, benchmark in this order: **SCNet-large → htdemucs → MDX23C 4-stem**. 
4. Keep **Demucs `htdemucs_ft`** only as an **expensive HQ retry**, not default. 
5. Treat **5–6 stems as beta**, not your main paid promise, unless your own benchmark clears the quality bar. 
6. Run **1 job per instance**, chunked, overlapped, with PyTorch thread caps. 
7. Benchmark **MDX23C ONNX/OpenVINO** early, because that is your best chance at a meaningful CPU-speed win beyond plain PyTorch. 
***POSSIBLE APP SETUP*** 
1. a **benchmark spreadsheet template**
2. a **Python harness skeleton**
3. **queue-worker pseudocode**
4. a **current checkpoint shortlist** with the exact config/checkpoint names I’d test first on your **CPU-only t3.large**
On a **t3.large**, AWS lists **2 vCPUs and 8 GiB RAM**, with **30% baseline CPU utilization per vCPU**, and T3 instances launch in **Unlimited** mode by default unless changed. For a separator service, that means you should treat each instance as **one active separation worker**, not a many-job box. 
## 1) The exact benchmark plan I’d run
### My recommended first-pass routing hypothesis
- **2-stem standard:** **MDX23C vocals/other**
- **2-stem HQ retry:** **Kimberley Jensen Mel-Band RoFormer**
- **2-stem alternate HQ retry:** **viperx BS-RoFormer**
- **4-stem standard:** **SCNet Large**
- **4-stem alternate:** **SCNet Large (starrytong-fixed)**
- **4-stem fallback:** **Demucs `htdemucs`**
- **4-stem speed experiment:** **MDX23C MUSDB 4-stem**
- **6-stem:** **do not ship as default** on this box; Demucs’ official repo explicitly warns its 6-source model’s piano source “is not working great.” 
The reason for that order is: **SCNet** is the strongest primary-source CPU story I found for 4-stem work, with the paper reporting **9.0 dB SDR on MUSDB18-HQ** and **CPU inference time at 48% of HT Demucs**; **Demucs** remains a strong fallback, but its repo says CPU time is roughly **1.5× track duration**, `htdemucs_ft` is about **4× slower**, and `--two-stems=vocals` is **not faster** because it still separates the full mix first. 
### Benchmark sheet template
Use this as a CSV or spreadsheet schema:
```csv
job_id,track_id,track_sec,lane,stems_requested,model_family,model_id,config_file,checkpoint_file,
preview_or_full,chunk_sec,overlap,num_overlap,threads,interop_threads,
wall_sec,x_rt,peak_rss_mb,exit_code,
vocal_bleed_1to5,instr_bleed_1to5,artifact_1to5,drum_damage_1to5,bass_damage_1to5,
hard_fail,notes,final_rank
### Suggested scoring rule
Use a **hard gate first**, then rank by speed:
- **hard_fail = YES** if any of these is true:
  - vocal bleed score ≥ 3
  - instrumental contamination score ≥ 3
  - artifact score ≥ 4
  - crash / OOM / timeout
- Among passes, sort by:
  1. **lowest vocal bleed**
  2. **lowest instrumental bleed**
  3. **lowest artifacts**
  4. **fastest xRT**
That rule is my recommendation, not a published standard, but it matches your product requirement: **partially separated output is not acceptable**.
### Suggested listening set
Use **12 excerpts** first, each **35–45 seconds**:
- EDM
- acoustic
- piano-heavy
- backing-vocal heavy
- live drums
- old/lo-fi master
- female lead with FX
- male lead with dense guitars
Then only promote winners to **full-track** runs.
---
## 2) Current checkpoint shortlist: exact files to test first
A key detail: the **MSST pre-trained models page mixes evaluation sets**. Its **vocal models** note that their listed metrics are measured on the **Multisong Dataset**, while the **multi-stem models** show **MUSDB18 test averages** and Multisong values. So use those numbers to **shortlist**, not to crown a final winner without your own listening tests. 
### A. 2-stem shortlist
**1. MDX23C vocals/other — first standard candidate**  
- model type: `mdx23c`
- config: `config_vocals_mdx23c.yaml`
- checkpoint: `model_vocals_mdx23c_sdr_10.17.ckpt`  
MSST lists this as a **vocals/other** model with **SDR vocals 10.17**, and the linked config/weight filenames resolve to those exact names. 
**2. Kimberley Jensen Mel-Band RoFormer — first HQ vocal retry**  
- model type: `mel_band_roformer`
- config: `config_vocals_mel_band_roformer_kj.yaml`
- checkpoint: `MelBandRoformer.ckpt`  
MSST lists the Kimberley Jensen edition at **SDR vocals 10.98**, and the linked config/weight resolve to those exact names. Kimberley’s repo also provides an inference example for vocals/instrumental export. 
**3. viperx BS-RoFormer — alternate HQ vocal retry**  
- model type: `bs_roformer`
- config: `model_bs_roformer_ep_317_sdr_12.9755.yaml`
- checkpoint: `model_bs_roformer_ep_317_sdr_12.9755.ckpt`  
MSST lists the viperx BS-RoFormer vocals/other model at **SDR vocals 10.87**, and the linked files resolve to those names. 
**4. viperx Mel-Band RoFormer — alternate 2-stem experiment**  
- config: `model_mel_band_roformer_ep_3005_sdr_11.4360.yaml`
- checkpoint: `model_mel_band_roformer_ep_3005_sdr_11.4360.ckpt`  
MSST lists this viperx Mel-Band vocal model at **SDR vocals 9.67**, and the linked files resolve to those names. 
**5. Demucs fallback**  
- command model: `htdemucs`  
Use this only as a retry or premium lane on your hardware. Demucs documents `htdemucs` as the default model, notes CPU time is roughly **1.5× track duration**, and says `--two-stems=vocals` is **not faster**. 
### B. 4-stem shortlist
**1. SCNet Large — first 4-stem production candidate**  
- model type: `scnet` if using MSST, or native SCNet CLI
- config: `config_musdb18_scnet_large.yaml`
- checkpoint: `model_scnet_sdr_9.3244.ckpt`  
MSST lists **SCNet Large** at **9.32 MUSDB test avg SDR**, and the linked files resolve to those names. The official SCNet repo provides an inference command and separately notes that the **large version is available**. 
**2. SCNet Large (starrytong-fixed) — second 4-stem candidate**  
- model type: `scnet`
- config: `config_musdb18_scnet_large_starrytong.yaml`
- checkpoint: `SCNet-large_starrytong_fixed.ckpt`  
MSST lists this version at **9.70 MUSDB test avg SDR**, and the linked files resolve to those names. 
**3. Demucs `htdemucs` — robust fallback**  
Demucs lists `htdemucs` as the default 4-stem model and also documents `htdemucs_ft` and `htdemucs_6s`. For your instance size, I’d keep `htdemucs` as fallback and avoid `htdemucs_ft` except premium/HQ jobs. 
**4. MDX23C MUSDB18 4-stem — speed experiment**  
- config: `config_musdb18_mdx23c.yaml`
- checkpoint: `model_mdx23c_ep_168_sdr_7.0207.ckpt`  
MSST lists this 4-stem MDX23C MUSDB model and the linked files resolve to those names. I would test it because MSST is built around the KUIELab TFC-TDF-v3 family, and the SDX23 technical report says **TFC-TDF-UNet v3** improved separation quality while reducing inference time. 
**5. Optional weekend test: BS-RoFormer 4-stem**  
- config: `config_bs_roformer_384_8_2_485100.yaml`
- checkpoint: `model_bs_roformer_ep_17_sdr_9.6568.ckpt`  
MSST lists the 4-stem BS-RoFormer at **9.65 MUSDB test avg SDR**, and the linked files resolve to those names. I would not make this day-one on a t3.large, but it is worth one benchmark run if you can tolerate slower latency. 
### C. What I would *not* prioritize first
- **`htdemucs_ft`**: Demucs says it can be **4× slower** than `htdemucs`. 
- **`htdemucs_6s`**: Demucs says the **piano** source is “not working great.” 
- **SCNet XL / IHF**: MSST lists stronger MUSDB scores for larger SCNet variants, but on **2 vCPUs / 8 GiB**, I’d save those for later after you’ve proven the latency budget. 
## 3) Folder layout I’d use
```text
weights/
  mdx23c_vocals/
    config_vocals_mdx23c.yaml
    model_vocals_mdx23c_sdr_10.17.ckpt
  melband_kj/
    config_vocals_mel_band_roformer_kj.yaml
    MelBandRoformer.ckpt
  bsroformer_viperx/
    model_bs_roformer_ep_317_sdr_12.9755.yaml
    model_bs_roformer_ep_317_sdr_12.9755.ckpt
  scnet_large/
    config_musdb18_scnet_large.yaml
    model_scnet_sdr_9.3244.ckpt
  scnet_large_starrytong/
    config_musdb18_scnet_large_starrytong.yaml
    SCNet-large_starrytong_fixed.ckpt
  mdx23c_4stem/
    config_musdb18_mdx23c.yaml
    model_mdx23c_ep_168_sdr_7.0207.ckpt
## 4) Harness skeleton
The command shapes below match the current docs for **MSST**, **SCNet**, and **Demucs**. MSST’s README documents `inference.py` with `--model_type`, `--config_path`, `--start_check_point`, `--input_folder`, and `--store_dir`; the official SCNet repo documents `python -m scnet.inference`; and Demucs documents CLI model selection with `-n` and CPU mode with `-d cpu`. 
# benchmark_harness.py
from __future__ import annotations
import csv
import json
import os
import shlex
import subprocess
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional, List
import psutil
@dataclass
class ModelSpec:
    id: str
    family: str               # msst | scnet | demucs
    model_type: Optional[str] # mdx23c | mel_band_roformer | bs_roformer | etc.
    config_file: Optional[str]
    checkpoint_file: Optional[str]
    extra_args: List[str]
class RunSpec:
    track_id: str
    input_file: str
    output_dir: str
    preview_start_sec: float = 0.0
    preview_len_sec: Optional[float] = None
    chunk_sec: Optional[float] = None
    overlap: Optional[float] = None
    num_overlap: Optional[int] = None
    threads: int = 2
    interop_threads: int = 1
def ensure_dir(path: str):
    Path(path).mkdir(parents=True, exist_ok=True)
def build_cmd(model: ModelSpec, run: RunSpec) -> List[str]:
    if model.family == "msst":
        cmd = [
            "python", "inference.py",
            "--model_type", model.model_type,
            "--config_path", model.config_file,
            "--start_check_point", model.checkpoint_file,
            "--input_folder", str(Path(run.input_file).parent),
            "--store_dir", run.output_dir,
        ]
        cmd += model.extra_args
        return cmd
    if model.family == "scnet":
            "python", "-m", "scnet.inference",
            "--input_dir", str(Path(run.input_file).parent),
            "--output_dir", run.output_dir,
            "--checkpoint_path", model.checkpoint_file,
    if model.family == "demucs":
            "demucs",
            "-n", model.id,
            "-d", "cpu",
            run.input_file,
    raise ValueError(f"Unknown family: {model.family}")
def run_subprocess(cmd: List[str], env: dict) -> tuple[int, float, int]:
    t0 = time.perf_counter()
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
        text=True,
    )
    ps = psutil.Process(proc.pid)
    peak_rss = 0
    while proc.poll() is None:
        try:
            rss = ps.memory_info().rss
            peak_rss = max(peak_rss, rss)
        except Exception:
            pass
        time.sleep(0.2)
    stdout, stderr = proc.communicate()
    elapsed = time.perf_counter() - t0
    peak_mb = int(peak_rss / (1024 * 1024))
    return proc.returncode, elapsed, peak_mb
def benchmark_one(model: ModelSpec, run: RunSpec) -> dict:
    ensure_dir(run.output_dir)
    env = os.environ.copy()
    env["OMP_NUM_THREADS"] = str(run.threads)
    env["MKL_NUM_THREADS"] = str(run.threads)
    env["OPENBLAS_NUM_THREADS"] = str(run.threads)
    env["NUMEXPR_NUM_THREADS"] = str(run.threads)
    cmd = build_cmd(model, run)
    rc, elapsed, peak_mb = run_subprocess(cmd, env)
    return {
        "track_id": run.track_id,
        "input_file": run.input_file,
        "model_id": model.id,
        "family": model.family,
        "model_type": model.model_type,
        "config_file": model.config_file,
        "checkpoint_file": model.checkpoint_file,
        "wall_sec": round(elapsed, 3),
        "peak_rss_mb": peak_mb,
        "exit_code": rc,
        "cmd": shlex.join(cmd),
    }
def append_csv(row: dict, csv_path: str):
    file_exists = Path(csv_path).exists()
    with open(csv_path, "a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(row.keys()))
        if not file_exists:
            w.writeheader()
        w.writerow(row)
if __name__ == "__main__":
    models = [
        ModelSpec(
            id="mdx23c_vocals",
            family="msst",
            model_type="mdx23c",
            config_file="weights/mdx23c_vocals/config_vocals_mdx23c.yaml",
            checkpoint_file="weights/mdx23c_vocals/model_vocals_mdx23c_sdr_10.17.ckpt",
            extra_args=[],
        ),
            id="melband_kj",
            model_type="mel_band_roformer",
            config_file="weights/melband_kj/config_vocals_mel_band_roformer_kj.yaml",
            checkpoint_file="weights/melband_kj/MelBandRoformer.ckpt",
            id="scnet_large",
            model_type="scnet",
            config_file="weights/scnet_large/config_musdb18_scnet_large.yaml",
            checkpoint_file="weights/scnet_large/model_scnet_sdr_9.3244.ckpt",
            id="htdemucs",
            family="demucs",
            model_type=None,
            config_file=None,
            checkpoint_file=None,
    ]
    run = RunSpec(
        track_id="song_001",
        input_file="input/song_001.wav",
        output_dir="out/song_001",
        threads=2,
        interop_threads=1,
    for m in models:
        row = benchmark_one(m, run)
        append_csv(row, "benchmark_runs.csv")
        print(json.dumps(row, indent=2))
## 5) Queue worker pseudocode
PyTorch documents `torch.set_num_threads()` for **intra-op** CPU threading and `torch.set_num_interop_threads()` for **inter-op** threading, and warns they should be set before eager/JIT/autograd work begins. Its threading note also warns about **oversubscription**, which can hurt performance. For pure inference, PyTorch’s `inference_mode()` removes more overhead than `no_grad()`. Combined with your **2 vCPU** instance and Demucs’ warning that `-j` multiplies RAM use, that’s why I’d keep **one active job per instance**. 
# queue_worker_pseudocode.py
boot():
    set_env("OMP_NUM_THREADS", "2")
    set_env("MKL_NUM_THREADS", "2")
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
main_loop():
    while True:
        job = dequeue_next_job()     # standard first, HQ second
        if not job:
            sleep(1)
            continue
        mark_job_running(job)
            # 1) preview phase
            preview_audio = make_excerpt(job.input_file, start=0, duration=40)
            if job.requested_stems == 2:
                candidate_chain = [
                    "mdx23c_vocals",
                    "melband_kj",
                    "bsroformer_viperx",
                    "scnet_large_collapse",
                    "htdemucs",
                ]
            elif job.requested_stems == 4:
                    "scnet_large",
                    "scnet_large_starrytong",
                    "mdx23c_4stem",
            else:
                ]  # beta lane only
            winner = None
            for candidate in candidate_chain:
                preview_result = run_model(candidate, preview_audio)
                qc = evaluate_preview(
                    preview_result,
                    rules={
                        "max_vocal_bleed": 2,
                        "max_instr_bleed": 2,
                        "max_artifact": 3,
                    }
                )
                save_preview_metrics(job, candidate, qc)
                if qc.pass_:
                    winner = candidate
                    break
            if winner is None:
                mark_job_failed(job, reason="No preview candidate passed QC")
                continue
            # 2) full-track phase
            full_result = run_model(
                winner,
                job.input_file,
                chunking=True,
                overlap=0.10 if winner.startswith("htdemucs") else None
            )
            # 3) post-process
            if job.requested_stems == 2 and winner == "scnet_large_collapse":
                full_result = collapse_4stem_to_2stem(full_result)
            qc_full = evaluate_full(full_result)
            if not qc_full.pass_:
                # one last escalation for paid/HQ jobs
                if job.plan in ("hq", "premium") and winner != "htdemucs":
                    full_result = run_model("htdemucs", job.input_file, chunking=True)
                    qc_full = evaluate_full(full_result)
                mark_job_failed(job, reason="Full-track QC failed")
            package_outputs(job, full_result)
            mark_job_done(job)
        except TimeoutError:
            mark_job_failed(job, reason="timeout")
        except MemoryError:
            mark_job_failed(job, reason="oom")
        except Exception as e:
            mark_job_failed(job, reason=str(e))
## 6) Runtime defaults I would lock in
For this box, I’d default to:
- `OMP_NUM_THREADS=2`
- `MKL_NUM_THREADS=2`
- `torch.set_num_threads(2)`
- `torch.set_num_interop_threads(1)`
- **1 active separation process per instance**
- preview first, full-track second
- no Demucs `-j` parallel jobs
- no Demucs `--two-stems` shortcut expecting speedups
- no `htdemucs_ft` unless explicitly premium/HQ
Those choices follow directly from AWS’s t3.large sizing, PyTorch’s threading guidance, and Demucs’ own CPU and memory notes. 
## 7) ONNX / OpenVINO experiments worth doing
MSST’s docs point to a separate repo for **ONNX/TensorRT** export and runtime, and that repo explicitly supports ONNX workflows for **htdemucs, bs_roformer, mel_band_roformer, mdx23c,** and **segm** models. ONNX Runtime’s **OpenVINO Execution Provider** is intended for Intel hardware and supports **CPU, GPU, and NPU** devices. 
So my CPU-only optimization order would be:
1. **MDX23C vocals PyTorch baseline**
2. **MDX23C vocals ONNX/OpenVINO**
3. **SCNet Large PyTorch baseline**
4. only then try **Mel-Band/BS-RoFormer ONNX**
If you want a quantization experiment, ONNX Runtime’s docs expose both `quantize_dynamic()` and `quantize_static()`. I would only test that after you have a clean FP32 baseline, because the question here is not just speed — it’s whether the vocal and instrumental remain clean enough to ship. 
## 8) The production setup I’d ship first
### 2-stem
- **Standard:** `mdx23c_vocals`
- **HQ retry:** `melband_kj`
- **Alt HQ retry:** `bsroformer_viperx`
- **Last resort:** `htdemucs`
### 4-stem
- **Standard:** `scnet_large`
- **Alt standard:** `scnet_large_starrytong`
- **Fallback:** `htdemucs`
- **Experiment:** `mdx23c_4stem`
### 5–6 stem
- require QC pass
- otherwise fail cleanly instead of returning bad stems
