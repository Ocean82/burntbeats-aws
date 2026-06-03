# Dependabot: MIDI ONNX migration

## Alerts addressed (GitHub #51–#56)

Root cause was `basic-pitch==0.4.0` pulling **TensorFlow 2.15 → Keras 2.15** on non-Darwin platforms via `uv.lock`.

## Fix (2026-06-03)

1. `midi_service` depends on `onnxruntime>=1.17.0` and pins `basic-pitch>=0.4.0`.
2. Root `[tool.uv] override-dependencies` blocks TensorFlow/Keras with unsatisfiable markers (packages removed from lock resolution).
3. `midi_service/services/model_runtime.py` forces `FilenameSuffix.onnx` for ICASSP 2022 weights.
4. `midi_service/Dockerfile` uninstalls any stray TF wheels after `uv sync`.

After merge to `main` (PR #26, 2026-06-03): alerts **#51, #52, #53, #54, #56** (Keras) are **fixed**. Alert **#55** (protobuf) may remain open via `onnxruntime` transitive dependency — do not fix by reintroducing TensorFlow.

## Residual notes

- `protobuf==4.25.9` may still appear as a transitive dependency (e.g. ONNX stack). If Dependabot flags protobuf separately, evaluate upgrade path without re-introducing TensorFlow’s `protobuf<5` constraint.
- Do **not** add a global `protobuf>=5` override while any TF package remains in the workspace.

## Verification commands

```bash
uv lock
uv sync --package burntbeats-midi
uv run --package burntbeats-midi pytest midi_service/tests/test_model_runtime.py midi_service/tests/test_conversion_service.py -q
uv run --package burntbeats-midi python -c "from midi_service.services.model_runtime import get_model_path; print(get_model_path())"
```

Docker (Linux):

```bash
docker build -f midi_service/Dockerfile .
```
