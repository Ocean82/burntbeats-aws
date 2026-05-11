"""Hybrid pipeline package — barrel re-export.

All symbols previously available via ``from stem_service.hybrid import X``
continue to work via the shim at ``stem_service/hybrid.py``.

See docs/stem-pipeline.md for the full pipeline routing documentation.
See docs/corrections/hybrid-fixes.md for historical bug fixes applied.
"""

from stem_service.hybrid.utils import (  # noqa: F401
    _materialize_stage1_instrumental,
    collapse_4stem_to_2stem,
)

from stem_service.hybrid.pipeline_2stem import (  # noqa: F401
    run_hybrid_2stem,
    run_demucs_only_2stem,
)

from stem_service.hybrid.pipeline_4stem import (  # noqa: F401
    run_4stem_single_pass_or_hybrid,
    run_hybrid_4stem,
)

from stem_service.hybrid.expand import (  # noqa: F401
    run_expand_to_4stem,
)

from stem_service.hybrid.cli import (  # noqa: F401
    main,
)
