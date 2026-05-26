from __future__ import annotations

import re
from pathlib import Path

from fastapi import HTTPException, Request

UUID_REGEX = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I
)


def get_output_dir(request: Request) -> Path:
    return Path(request.app.state.midi_output_dir)


def require_api_token(request: Request) -> None:
    token = getattr(request.app.state, "midi_service_api_token", "")
    if not token:
        return
    provided = request.headers.get("X-Midi-Service-Token")
    if not provided or provided != token:
        raise HTTPException(status_code=401, detail="Unauthorized")
