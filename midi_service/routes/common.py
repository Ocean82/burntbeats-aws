from __future__ import annotations

import re
from pathlib import Path

from fastapi import HTTPException, Request

from burntbeats_common.auth import require_configured_api_token

UUID_REGEX = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I
)


def get_output_dir(request: Request) -> Path:
    return Path(request.app.state.midi_output_dir)


def require_api_token(request: Request) -> None:
    token = getattr(request.app.state, "midi_service_api_token", "")
    require_configured_api_token(token, request.headers.get("X-Midi-Service-Token"))
