from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))


def test_run_separation_sync_ignores_legacy_backend_switch_for_2stem(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    from stem_service import job_worker
    from stem_service.job_queue import JobQueue
    from stem_service.job_utils import PROGRESS_FILENAME

    job_id = "00000000-0000-0000-0000-000000000111"
    out_dir = job_worker.OUTPUT_BASE / job_id
    stems_dir = out_dir / "stems"
    stems_dir.mkdir(parents=True, exist_ok=True)
    input_path = out_dir / "input.wav"
    input_path.write_bytes(b"not-a-real-wav")

    vocals_path = stems_dir / "vocals.wav"
    instrumental_path = stems_dir / "instrumental.wav"
    vocals_path.write_bytes(b"v")
    instrumental_path.write_bytes(b"i")

    called: list[str] = []

    def fake_hybrid_2stem(*_args, **_kwargs):
        called.append("hybrid")
        return [("vocals", vocals_path), ("instrumental", instrumental_path)], [
            "rank1-quality",
        ]

    monkeypatch.setattr(
        "stem_service.routing.executor.run_hybrid_2stem", fake_hybrid_2stem
    )
    monkeypatch.setattr(
        job_worker, "schedule_completion_artifacts", lambda *_args, **_kwargs: None
    )
    monkeypatch.setattr(job_worker, "append_metrics_log", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(job_worker, "_finalize_stems_to_16bit", lambda *_args, **_kwargs: None)

    jq = JobQueue()
    job_worker.run_separation_sync(
        job_id=job_id,
        input_path=input_path,
        out_dir=out_dir,
        stem_count=2,
        prefer_speed=False,
        quality_mode="quality",
        job_queue=jq,
    )

    assert called == ["hybrid"]
    progress = (out_dir / PROGRESS_FILENAME).read_text(encoding="utf-8")
    assert '"status": "completed"' in progress


def test_run_4stem_single_pass_or_hybrid_skips_scnet_attempts(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    import stem_service.hybrid.pipeline_4stem as pipeline_4stem

    input_path = tmp_path / "input.wav"
    input_path.write_bytes(b"stub")
    output_dir = tmp_path / "out"

    vocals_path = output_dir / "stems" / "vocals.wav"
    drums_path = output_dir / "stems" / "drums.wav"
    bass_path = output_dir / "stems" / "bass.wav"
    other_path = output_dir / "stems" / "other.wav"
    for path in (vocals_path, drums_path, bass_path, other_path):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"x")

    called: list[str] = []

    def fake_hybrid_4stem(*_args, **_kwargs):
        called.append("hybrid")
        return [
            ("vocals", vocals_path),
            ("drums", drums_path),
            ("bass", bass_path),
            ("other", other_path),
        ], ["hybrid-4stem"]

    monkeypatch.setattr(pipeline_4stem, "run_hybrid_4stem", fake_hybrid_4stem)

    stem_list, models_used = pipeline_4stem.run_4stem_single_pass_or_hybrid(
        input_path,
        output_dir,
        prefer_speed=False,
    )

    assert called == ["hybrid"]
    assert [stem_id for stem_id, _path in stem_list] == [
        "vocals",
        "drums",
        "bass",
        "other",
    ]
    assert models_used == ["hybrid-4stem"]


def test_extract_vocals_stage1_quality_requires_primary_model_without_rank_fallback(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    import stem_service.vocal_stage1 as vocal_stage1

    input_path = tmp_path / "input.wav"
    input_path.write_bytes(b"stub")
    output_dir = tmp_path / "out"
    fallback_model = tmp_path / "UVR_MDXNET_KARA.onnx"
    fallback_model.write_bytes(b"stub")

    resolved_names: list[str] = []
    vocal_calls: list[str] = []

    def fake_resolve_single(logical_name: str):
        resolved_names.append(logical_name)
        if logical_name == "UVR_MDXNET_KARA.onnx":
            return None
        return fallback_model

    def fake_run_vocal_onnx(*_args, **_kwargs):
        vocal_calls.append("run_vocal_onnx")
        return output_dir / "vocals.wav"

    monkeypatch.setattr(vocal_stage1, "resolve_single_vocal_onnx", fake_resolve_single)
    monkeypatch.setattr(vocal_stage1, "run_vocal_onnx", fake_run_vocal_onnx)
    monkeypatch.setattr(vocal_stage1, "resolve_declared_vocal_onnx_path", lambda *_args, **_kwargs: None)

    with pytest.raises(RuntimeError, match="UVR_MDXNET_KARA.onnx"):
        vocal_stage1.extract_vocals_stage1(
            input_path,
            output_dir,
            prefer_speed=False,
            model_tier="quality",
        )

    assert resolved_names == ["UVR_MDXNET_KARA.onnx"]
    assert vocal_calls == []


def test_run_demucs_4stem_raises_original_checkpoint_failure_without_htdemucs_fallback(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    import stem_service.split as split_mod

    input_path = tmp_path / "input.wav"
    input_path.write_bytes(b"stub")
    output_dir = tmp_path / "out"

    repo = tmp_path / "quality_4stem_rank1"
    repo.mkdir(parents=True, exist_ok=True)
    checkpoint = repo / "04573f0d-f3cf25b2__29d4388e.th"
    checkpoint.write_bytes(b"stub")

    monkeypatch.setattr(
        split_mod,
        "demucs_speed_4stem_configs",
        lambda: [("04573f0d", repo, 7, "04573f0d", checkpoint)],
    )
    monkeypatch.setattr(
        split_mod,
        "_run_demucs_4stem_named_checkpoint",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            RuntimeError("quality checkpoint failed")
        ),
    )
    monkeypatch.setattr(split_mod, "htdemucs_available", lambda: False)

    with pytest.raises(RuntimeError, match="quality checkpoint failed"):
        split_mod.run_demucs(
            input_path,
            output_dir,
            stems=4,
            prefer_speed=False,
        )


def test_run_expand_to_4stem_uses_deterministic_stage2_only(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    import stem_service.hybrid.expand as expand_mod

    source_stems_dir = tmp_path / "source" / "stems"
    source_stems_dir.mkdir(parents=True, exist_ok=True)
    (source_stems_dir / "vocals.wav").write_bytes(b"v")
    (source_stems_dir / "instrumental.wav").write_bytes(b"i")

    output_dir = tmp_path / "expand"
    drums_path = output_dir / "stems" / "drums.wav"
    bass_path = output_dir / "stems" / "bass.wav"
    other_path = output_dir / "stems" / "other.wav"
    for path in (drums_path, bass_path, other_path):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"x")

    called: list[str] = []

    def fake_mdx_stage2(*_args, **_kwargs):
        called.append("stage2")
        return [
            ("drums", drums_path),
            ("bass", bass_path),
            ("other", other_path),
        ], ["UVR-MDX-NET-Drum.onnx", "UVR-MDX-NET-Bass.onnx", "residual_other"]

    monkeypatch.setattr(expand_mod, "_expand_mdx_stage2_ready", lambda *_a, **_k: True)
    monkeypatch.setattr(expand_mod, "run_mdx_drums_bass_other", fake_mdx_stage2)

    stem_list, models_used = expand_mod.run_expand_to_4stem(
        source_stems_dir=source_stems_dir,
        target_output_dir=output_dir,
        prefer_speed=False,
    )

    assert called == ["stage2"]
    assert [stem_id for stem_id, _path in stem_list] == [
        "vocals",
        "drums",
        "bass",
        "other",
    ]
    assert models_used == [
        "UVR-MDX-NET-Drum.onnx",
        "UVR-MDX-NET-Bass.onnx",
        "residual_other",
    ]


def test_run_expand_to_4stem_demucs_fallback_when_mdx_unavailable(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    import stem_service.hybrid.expand as expand_mod

    source_stems_dir = tmp_path / "source" / "stems"
    source_stems_dir.mkdir(parents=True, exist_ok=True)
    (source_stems_dir / "vocals.wav").write_bytes(b"v")
    (source_stems_dir / "instrumental.wav").write_bytes(b"i")

    output_dir = tmp_path / "expand"
    drums_path = output_dir / "stems" / "drums.wav"
    bass_path = output_dir / "stems" / "bass.wav"
    other_path = output_dir / "stems" / "other.wav"
    for path in (drums_path, bass_path, other_path):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"x")

    def fake_demucs_stage2(*_args, **_kwargs):
        return [
            ("drums", drums_path),
            ("bass", bass_path),
            ("other", other_path),
        ], ["htdemucs", "routing_fallback:expand_demucs_stage2"]

    monkeypatch.setattr(expand_mod, "_expand_mdx_stage2_ready", lambda *_a, **_k: False)
    monkeypatch.setattr(expand_mod, "_run_demucs_expand_stage2", fake_demucs_stage2)

    stem_list, models_used = expand_mod.run_expand_to_4stem(
        source_stems_dir=source_stems_dir,
        target_output_dir=output_dir,
        prefer_speed=False,
    )

    assert [stem_id for stem_id, _path in stem_list] == [
        "vocals",
        "drums",
        "bass",
        "other",
    ]
    assert "htdemucs" in models_used
    assert "routing_fallback:expand_demucs_stage2" in models_used
