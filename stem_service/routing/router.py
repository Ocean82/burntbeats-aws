"""Pure intent → execution plan routing."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from stem_service.routing.model_bag import specialized_available
from stem_service.routing.schema import SplitIntent
from stem_service.routing.targets import (
    DEMUCS_4_STEMS,
    delivery_stem_id,
    normalize_target,
)

JobKind = Literal[
    "vocals_only",
    "karaoke",
    "hybrid_2",
    "hybrid_4",
    "demucs_4_fallback",
    "mdx_stem",
    "parallel_mdx",
    "mdx_4stem",
]


@dataclass
class ModelJob:
    kind: JobKind
    targets: tuple[str, ...] = ()
    notes: str = ""


@dataclass
class SplitPlan:
    intent: SplitIntent
    output_stems: tuple[str, ...]
    jobs: list[ModelJob] = field(default_factory=list)
    routing_notes: list[str] = field(default_factory=list)

    def uses_hybrid_4stem(self) -> bool:
        return any(j.kind in ("hybrid_4", "demucs_4_fallback") for j in self.jobs)


def route_intent(intent: SplitIntent) -> SplitPlan:
    tier = "fast" if intent.prefer_speed() else "high"
    output = intent.output_stem_ids()
    plan = SplitPlan(intent=intent, output_stems=output)

    if intent.task == "full_separation":
        if intent.mode == "2":
            plan.jobs.append(ModelJob(kind="hybrid_2", targets=output))
        else:
            plan.jobs.append(ModelJob(kind="mdx_4stem", targets=output))
        return plan

    if intent.task == "remove":
        plan.jobs.append(
            ModelJob(kind="karaoke", targets=output, notes="remove_vocals")
        )
        return plan

    # extract
    targets = tuple(normalize_target(t) for t in intent.targets)
    if targets == ("vocals",):
        plan.jobs.append(ModelJob(kind="vocals_only", targets=("vocals",)))
        return plan

    if _all_specialized(targets, tier):
        mdx_targets = tuple(t for t in targets if t != "instrumental")
        if len(mdx_targets) == 1:
            plan.jobs.append(ModelJob(kind="mdx_stem", targets=mdx_targets))
        else:
            plan.jobs.append(ModelJob(kind="parallel_mdx", targets=mdx_targets))
        plan.routing_notes.append("specialized_parallel")
        return plan

    # Mixed or fallback: minimize work
    needs_demucs = any(
        not specialized_available(t, tier) and t in DEMUCS_4_STEMS | {"guitar"}
        for t in targets
    )
    vocals_needed = "vocals" in targets
    demucs_stems = tuple(
        delivery_stem_id(t)
        for t in targets
        if t in DEMUCS_4_STEMS or t == "guitar"
    )

    if needs_demucs:
        # One hybrid 4-stem pass; filter to requested outputs (includes vocals if needed).
        extract_from = tuple(
            dict.fromkeys(
                list(
                    t
                    for t in (
                        *(("vocals",) if vocals_needed else ()),
                        *(demucs_stems if demucs_stems else ()),
                    )
                )
            )
        )
        if not extract_from:
            extract_from = demucs_stems
        plan.jobs.append(
            ModelJob(
                kind="demucs_4_fallback",
                targets=tuple(extract_from),
                notes="routing_fallback:demucs_4stem_extract",
            )
        )
        plan.routing_notes.append("routing_fallback:demucs_4stem_extract")
        # If some targets are specialized while others need demucs, also run MDX for those
        specialized_only = tuple(
            t for t in targets if specialized_available(t, tier) and t not in DEMUCS_4_STEMS
        )
        if specialized_only and not vocals_needed:
            # e.g. drums MDX + bass via demucs — run demucs for bass, mdx for drums in parallel
            if len(specialized_only) == 1:
                plan.jobs.insert(
                    0, ModelJob(kind="mdx_stem", targets=specialized_only)
                )
            else:
                plan.jobs.insert(
                    0, ModelJob(kind="parallel_mdx", targets=specialized_only)
                )
        elif specialized_only and vocals_needed and "vocals" not in extract_from:
            plan.jobs.insert(0, ModelJob(kind="vocals_only", targets=("vocals",)))
        return plan

    # instrumental-only or all specialized non-demucs
    if targets == ("instrumental",):
        plan.jobs.append(ModelJob(kind="karaoke", targets=("instrumental",)))
        return plan

    if len(targets) == 1:
        plan.jobs.append(ModelJob(kind="mdx_stem", targets=targets))
        return plan

    plan.jobs.append(ModelJob(kind="parallel_mdx", targets=targets))
    return plan


def _all_specialized(targets: tuple[str, ...], tier: str) -> bool:
    for t in targets:
        if t == "instrumental":
            return False
        if t in DEMUCS_4_STEMS or t == "guitar":
            if not specialized_available(t, tier):
                return False
        elif not specialized_available(t, tier):
            return False
    return True
