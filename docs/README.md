# Documentation Index

This index contains the current, operational docs for this repository.
Legacy investigations and planning notes belong in `docs/archive/`.

## Start Here

- `../README.md` - canonical project setup and runtime overview
- `ARCHITECTURE-FLOW.md` - request/data flow across frontend, backend, and stem service
- `stem-pipeline.md` - model routing and separation pipeline behavior

## Operations

- `DEPLOY-DOCKER-EC2.md` - Docker Compose deployment on EC2
- `DEPLOY-SERVER-BUNDLE.md` - tarball/rsync deploy path
- `DEPLOY-MARKETING-SITE.md` - separate deployment for marketing pricing site
- `SANITY-CHECKS.md` - post-deploy/manual verification checklist
- `MALWARE-SCAN-OPS.md` - upload malware scan operations and env config

## Product and Billing

- `BILLING-AND-TOKENS.md` - plans, usage tokens, billing behavior
- `new_features.md` - active product feature backlog

## Models and Performance

- `MODEL-SELECTION-AUTHORITY.md` - source of truth for model selection policy
- `MODELS-INVENTORY.md` - required/optional model files
- `MODEL-INVENTORY-RUNBOOK.md` - model inventory maintenance workflow
- `MODEL-INVENTORY-AUTO.md` - auto-generated inventory outputs
- `MODEL-PARAMS.md` - model parameter mapping and usage notes
- `ranked_practical_time_score.csv` - benchmark summary table

## Research / Secondary References

These are useful references but are not the primary operational source:

- `MODELS-NEW-AND-ALTERNATIVES.md`
- `ONNX-EFFICIENCY-INVESTIGATION.md`
- `OPENVINO-INVESTIGATION.md`
- `ORT-MODEL-CONVERSION.md`
- `benchmark-demucs-onnx.md`

## Archived

- `archive/` - superseded docs, exploratory notes, historical plans

If a document conflicts with `../README.md`, `ARCHITECTURE-FLOW.md`, or
`stem-pipeline.md`, treat that document as stale and archive it.
