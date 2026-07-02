from __future__ import annotations

from midi_service.app import app as app_module
from midi_service.server import app as server_module


def test_server_shim_re_exports_app_module():
    assert server_module is app_module


def test_app_module_exposes_expected_route_paths():
    route_paths = {route.path for route in app_module.routes}

    assert "/health" in route_paths
    assert "/metrics" in route_paths
    assert "/convert" in route_paths
    assert "/status/{job_id}" in route_paths
    assert "/file/{job_id}/{filename}" in route_paths
    assert "/merge" in route_paths
    assert "/soundfonts" in route_paths
    assert "/rhythm/styles" in route_paths
