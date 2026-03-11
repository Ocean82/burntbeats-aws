from importlib.metadata import PackageNotFoundError, version as _version

try:
    __version__ = _version("vadslice")
except PackageNotFoundError:
    __version__ = "0.0.0"

from .core import slicer

__all__ = ["slicer", "__version__"]
