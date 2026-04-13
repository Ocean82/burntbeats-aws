# Stem service CI parity (Linux/macOS). On Windows see scripts/dev-stem.ps1.
.PHONY: stem-install-ci stem-smoke stem-test

stem-install-ci:
	python -m pip install --upgrade pip
	python -m pip install -r stem_service/requirements.lock.txt \
		--extra-index-url https://download.pytorch.org/whl/cpu

stem-smoke: stem-install-ci
	python scripts/smoke_torchaudio_io.py

stem-test: stem-smoke
	STEM_ALLOW_MISSING_HTDEMUCS=1 python -m pytest stem_service/tests -q
