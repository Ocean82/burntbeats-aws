# `stem_api` (Rust) — archived experiment

This crate is **not** used by the production stack (**Docker Compose** → **`stem_service/`** FastAPI). It was kept as reference while evaluating whether a **Rust orchestration layer** around Python inference could reduce CPU latency on a **CPU-only** host.

## What exists here

| File | Role |
|------|------|
| `Cargo.toml` | Axum HTTP server deps |
| `src/main.rs` | Multipart upload, job dirs, **`Child` process** calls to Python for stage 1/2, **`ServeDir`** for stems |
| `src/phase_inversion.rs` | Sample-accur-ish **instrumental = original − vocals** in Rust |

So the bottleneck in real workloads—**neural inference (ONNX / PyTorch / Demucs / SCNet)**—would **still run in Python** (or subprocesses) unless fully reimplemented in Rust/C++. Rust here mainly adds **routing, filesystem, and DSP glue** plus **possible** modest wins on I/O and the inversion path.

## Production path today

See **`stem_service/server.py`** and **`docs/stem-pipeline.md`**.

## Opinion: Rust vs current (hypothetical, CPU-only)

- **Throughput / wall time:** Most user-visible time is **model forward passes** and chunked I/O. Rewriting **only** the API shell in Rust typically yields **single-digit-percent** gains unless you remove subprocess boundaries or consolidate memory. Replacing ONNX/PyTorch with native Rust inference would be a **large** engineering bet.
- **Ops complexity:** Maintaining **Python + Rust + Python scripts** splits observability, packaging, and hiring surface. Solo maintainer leverage favors **one** inference stack (**current FastAPI**).
- **When Rust merits another look:** If you move hot paths into **Rust-native inference** (e.g. ONNX Runtime bindings in Rust everywhere), unify **streaming chunk decode**, or need **strict memory ceilings**—not for HTTP glue alone.

**Bottom line:** The current **`stem_service`** architecture is appropriate for constrained CPU/AWS budget unless you pursue a deliberate **Rust-first inference** project; this folder can remain archival.

See also **`docs/archive/IMPLEMENTATION-HYBRID.md`**.
