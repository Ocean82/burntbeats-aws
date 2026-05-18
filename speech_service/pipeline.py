"""Run speech enhancement for a single job."""

from __future__ import annotations

import logging
from pathlib import Path

import soundfile as sf

from speech_service.job_utils import OUTPUT_FILENAME, write_progress
from speech_service.model_runtime import get_lava_model

logger = logging.getLogger(__name__)


def run_enhance_sync(
    job_id: str,
    input_path: Path,
    out_dir: Path,
    *,
    denoise: bool = True,
    batch: bool = False,
) -> None:
    job_log = logging.getLogger(f"speech.job.{job_id}")
    write_progress(
        out_dir,
        {
            "status": "processing",
            "job_id": job_id,
            "progress": 10,
            "message": "Loading speech enhancement model",
        },
    )

    model = get_lava_model()
    write_progress(
        out_dir,
        {"status": "processing", "job_id": job_id, "progress": 25, "message": "Enhancing audio"},
    )

    audio, _input_sr = model.load_audio(str(input_path))
    enhanced = model.enhance(audio, denoise=denoise, batch=batch)
    output_path = out_dir / OUTPUT_FILENAME

    wav_np = enhanced.detach().cpu().numpy().squeeze()
    sf.write(str(output_path), wav_np, 48000, subtype="PCM_16")

    write_progress(
        out_dir,
        {
            "status": "completed",
            "job_id": job_id,
            "progress": 100,
            "output": OUTPUT_FILENAME,
            "sample_rate": 48000,
        },
    )
    job_log.info("Speech enhance completed: %s", output_path)
