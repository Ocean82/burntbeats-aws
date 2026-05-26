"""
Compatibility shim for the MIDI FastAPI application.

External runtimes still import `midi_service.server:app`; the real app now
lives in `midi_service.app`.
"""

from midi_service.app import app

__all__ = ["app"]
