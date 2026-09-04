from pathlib import Path
import re
import tomllib


ROOT = Path(__file__).resolve().parents[1]
SERVICE_PYPROJECTS = [
    ROOT / "stem_service" / "pyproject.toml",
    ROOT / "speech_service" / "pyproject.toml",
]


def test_services_keep_torch_and_torchaudio_constraints_aligned() -> None:
    for pyproject_path in SERVICE_PYPROJECTS:
        dependencies = _project_dependencies(pyproject_path)
        torch_minor = _lower_bound_minor(dependencies["torch"])
        torchaudio_minor = _lower_bound_minor(dependencies["torchaudio"])

        assert torchaudio_minor == torch_minor, (
            f"{pyproject_path.relative_to(ROOT)} pins torch {torch_minor} but "
            f"torchaudio {torchaudio_minor}; PyTorch audio wheels must match "
            "the torch minor version to avoid ABI crashes"
        )


def test_lockfile_keeps_torch_and_torchaudio_versions_aligned() -> None:
    packages = _locked_packages(ROOT / "uv.lock")
    torch_versions = _locked_versions(packages, "torch")
    torchaudio_versions = _locked_versions(packages, "torchaudio")

    assert torch_versions, "uv.lock must include torch"
    assert torchaudio_versions, "uv.lock must include torchaudio"

    torch_minors = {_version_minor(version) for version in torch_versions}
    torchaudio_minors = {_version_minor(version) for version in torchaudio_versions}

    assert torchaudio_minors == torch_minors, (
        f"uv.lock resolves torch minors {sorted(torch_minors)} but torchaudio "
        f"minors {sorted(torchaudio_minors)}; fresh installs must not combine "
        "ABI-incompatible PyTorch audio wheels"
    )


def _project_dependencies(pyproject_path: Path) -> dict[str, str]:
    project = tomllib.loads(pyproject_path.read_text())["project"]
    dependencies: dict[str, str] = {}

    for dependency in project["dependencies"]:
        match = re.match(r"^([A-Za-z0-9_.-]+)(.*)$", dependency)
        assert match, f"Unable to parse dependency {dependency!r}"
        dependencies[match.group(1).lower()] = dependency

    return dependencies


def _locked_packages(lockfile_path: Path) -> list[dict[str, object]]:
    return tomllib.loads(lockfile_path.read_text())["package"]


def _locked_versions(packages: list[dict[str, object]], package_name: str) -> set[str]:
    return {
        str(package["version"])
        for package in packages
        if str(package["name"]).lower() == package_name
    }


def _lower_bound_minor(dependency: str) -> str:
    match = re.search(r">=\s*(\d+\.\d+)\.\d+", dependency)
    assert match, f"{dependency!r} must declare an explicit lower bound"
    return match.group(1)


def _version_minor(version: str) -> str:
    public_version = version.split("+", maxsplit=1)[0]
    match = re.match(r"^(\d+\.\d+)\.\d+", public_version)
    assert match, f"Unable to parse package version {version!r}"
    return match.group(1)
