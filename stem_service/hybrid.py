"""
Hybrid pipeline — thin re-export shim.

All implementation has moved to stem_service/hybrid/ package.
This file preserves backward compatibility for existing consumers:
  from stem_service.hybrid import run_hybrid_2stem, run_4stem_single_pass_or_hybrid, ...

See: stem_service/hybrid/__init__.py for the full module map.
See: docs/stem-pipeline.md for pipeline routing documentation.
"""

from stem_service.hybrid import (  # noqa: F401
    _materialize_stage1_instrumental,
    collapse_4stem_to_2stem,
    run_hybrid_2stem,
    run_demucs_only_2stem,
    run_4stem_single_pass_or_hybrid,
    run_hybrid_4stem,
    run_expand_to_4stem,
    main,
)

import sys

if __name__ == "__main__":
    sys.exit(main())
