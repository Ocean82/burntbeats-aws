For a web app focused on CPU-only processing with high-quality 4-stem output, the best strategy is a Hybrid Pipeline. This plan uses high-SDR (Signal-to-Distortion Ratio) models for critical stems (vocals/instrumentals) and an efficient multi-stem model for the rest.
The app uses **2-stem first** (vocals + instrumental); the user can then **expand** to 4 stems (Demucs on instrumental → drums, bass, other) so most users get fast 2-stem by default.

The "Quality-Speed" 4-Stem CPU Plan
This plan follows a sequential separation logic to ensure "Other" stems are clean while keeping CPU load manageable by using ONNX-optimized versions. 
Stage 	Process	Recommended Model	Best Setting for CPU
1. Primary Split	Vocal vs. Instrumental	BS-Roformer-Viperx-1297 (ONNX)	Segment: 256 / Overlap: 2
2. Core Stems	Split Instrumental Output	htdemucs_ft (v4 ONNX)	Shifts: 0 (Fast) / 1 (Quality)
3. Clean Up	Final Vocals Polish	UVR-Denoise (VR Architecture)	Auto Denoise: ON
Step-by-Step Implementation
Extract the Lead Vocal (Stage 1)
Model: Use BS-Roformer-Viperx-1297 in the MDX-Net architecture.
Why: It is currently the state-of-the-art for vocals, providing the cleanest isolation with the least "phasing" artifacts.
CPU Optimization: Use the ONNX version and set the Segment Size to 256 to prevent RAM spikes.
Generate Instrumental-Only Source (Stage 2)
Instead of splitting the original file into 4 stems immediately, take the Instrumental output from Step 1.
Model: Use htdemucs_ft (v4 ONNX).
Why: Demucs v4 is excellent at keeping "punch" in drums and bass, but sometimes struggles with vocals. By feeding it a vocal-free instrumental, the resulting Drums, Bass, and "Other" stems are significantly cleaner.
The "Ensemble" Refinement (Optional - High Quality)
For professional mastering quality, ensemble Kim_Vocal_2 with the Roformer output.
Algorithm: Use Avg/Avg for the most natural sound on CPU. 

Optimization for Web Apps
Parallel Processing: Since we are on CPU, don't try to run both models at once unless we have high core counts. Run them sequentially to maintain stability.
Inversion Logic: To save processing time for a "Mixed" stem, we can subtract (Invert) the isolated Vocals, Drums, and Bass from the original track to create the "Other" stem manually.
ONNX Runtime: Ensure the app uses the ONNX Runtime (ORT), as it is natively optimized for CPU execution across different hardware platforms.

To get the best quality-to-speed ratio on a CPU using ONNX models, use these specific configurations in UVR5. These settings minimize redundant calculations while maintaining high fidelity for a 4-stem output.
1. The Vocal Extraction (MDX-Net / Roformer)
This is your "Gold Standard" vocal pass.
Model: BS-Roformer-Viperx-1297 (ONNX)
Segment Size: 256 (Reduces RAM usage and "chunk" processing time on CPU).
Overlap: 2 (Setting this to 8 or higher doubles/quadruples processing time with diminishing returns on CPU).
Denoise: Enabled (Post-process only).
Secondary Model: None (Ensembling doubles processing time; skip for speed).
2. The 4-Stem Separation (Demucs)
Once you have the Instrumental output from Step 1, run it through this to get Drums, Bass, and "Other".
Model: htdemucs_ft (ONNX)
Stem: All (To get Bass, Drums, and Other).
Shifts: 0 (This is the "speed" secret. Increasing shifts to 1 or 2 significantly slows down CPU processing; 0 is the fastest).
Overlap: 0.25 (Standard for Demucs; don't increase this).
Split Mode: Enabled (Processes segments to avoid crashing on long files).
3. Summary of Internal Workflow
For your web app, the most efficient logic is:
Input → BS-Roformer → Outputs: Vocals_Stem and Instrumental_Temp.
Instrumental_Temp → htdemucs_ft → Outputs: Drums_Stem, Bass_Stem, and Other_Stem.
Final Step: Discard Instrumental_Temp.
Why this works for a Web App
ONNX Native: Both models have highly optimized ONNX versions that leverage OpenVINO (if on Intel CPU) or standard multithreading.
Sequential processing: By isolating vocals first with a Roformer, the Demucs model doesn't have to "fight" vocal frequencies to find the drums, leading to much higher quality in the "Other" (guitars/synths) stem.
Lowest Latency: Using Shifts: 0 and Overlap: 2 makes the difference between a 10-minute wait and a 2-minute wait on a standard 4-core CPU.
One Final "Speed Cheat"
If the BS-Roformer is still too slow on your CPU, swap it for Kim_Vocal_2 (ONNX). It is roughly 30-40% faster than Roformer while still beating almost every other model on the market.

To automate these models in a web app backend (using the UVR or MDX-Net API structures), you can use the following JSON configuration. This structure defines the parameters for the two-stage pipeline: Vocal Extraction followed by Stem Splitting.

**Stage 1: Vocal Extraction (MDX-Net/Roformer)**  
This config targets the cleanest vocal separation while keeping memory overhead low.

```json
{
  "stage": "vocal_extraction",
  "model_info": {
    "model_name": "BS-Roformer-Viperx-1297",
    "architecture": "MDX-Net",
    "format": "ONNX"
  },
  "inference_params": {
    "segment_size": 256,
    "overlap": 2,
    "batch_size": 1,
    "hop_length": 1024,
    "denoise": true,
    "invert_spectrogram": true
  },
  "cpu_optimization": {
    "use_openvino": true,
    "thread_count": 0,
    "precision": "fp32"
  }
}
```

**Stage 2: 4-Stem Splitting (Demucs)**  
Feed the Instrumental output from Stage 1 into this config to get the remaining stems.

```json
{
  "stage": "stem_splitting",
  "model_info": {
    "model_name": "htdemucs_ft",
    "architecture": "Demucs_v4",
    "format": "ONNX"
  },
  "inference_params": {
    "stems": ["drums", "bass", "other"],
    "shifts": 0,
    "overlap": 0.25,
    "split_segments": true,
    "segment_length": 441000
  },
  "cpu_optimization": {
    "thread_count": 0,
    "use_multiprocessing": true
  }
}
```


Key Implementation Details for this App:
thread_count: 0: This usually tells the ONNX Runtime to auto-detect and use all available logical CPU cores.
Segment Size (256): On a CPU, smaller segments prevent the system from swapping memory to the disk, which is the main cause of "freezing" in web apps.
Invert Spectrogram: This ensures that Original - Vocals = Instrumental. It’s faster than running a second pass for the instrumental.
Output Strategy: For a 4-stem web app, your final delivery package should be: Vocals (Stage 1), Drums (Stage 2), Bass (Stage 2), and Other (Stage 2).


To ensure your stems are "phase-perfect" (meaning if you play them all at once, they sound exactly like the original song), you must use Phase Inversion.
Instead of letting a model "guess" what the instrumental sounds like, you subtract the isolated vocals from the original audio. This prevents artifacts and ensures no frequencies are lost.
Python Inversion Logic (using librosa and numpy)
python
import librosa
import soundfile as sf
import numpy as np

def create_perfect_instrumental(original_path, vocal_path, output_path):
    # 1. Load both files (ensure same sample rate)
    orig, sr = librosa.load(original_path, sr=None, mono=False)
    vocal, _ = librosa.load(vocal_path, sr=sr, mono=False)

    # 2. Match lengths (models sometimes add a few ms of padding)
    min_len = min(orig.shape[-1], vocal.shape[-1])
    orig = orig[:, :min_len]
    vocal = vocal[:, :min_len]

    # 3. Mathematical Subtraction (The Inversion)
    # Original - Vocals = Instrumental
    instrumental = orig - vocal

    # 4. Clip to prevent digital distortion
    instrumental = np.clip(instrumental, -1.0, 1.0)

    # 5. Export for the next stage (Demucs)
    sf.write(output_path, instrumental.T, sr)
    return output_path


Why this is critical for this Web App:
Quality: It eliminates "underwater" sounds in the instrumental.
Speed: You don't need to run the model twice or wait for a secondary "instrumental" output; the subtraction is nearly instantaneous on a CPU.
Storage: You only need to save the Vocal stem and the "Leftover" to reconstruct the mix.
Integration Plan
Step A: Run BS-Roformer to get vocal_stem.
Step B: Use the Python Inversion above to create inst_temp.
Step C: Run htdemucs_ft on inst_temp to get drums, bass, and other.
Step D: (Optional) For the "Other" stem, you can perform one final inversion: inst_temp - (drums + bass) = other. This ensures the "Other" stem catches everything else perfectly.