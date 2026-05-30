"""Intent-based stem separation routing."""

from stem_service.routing.executor import execute_plan
from stem_service.routing.model_bag import intent_routing_health
from stem_service.routing.router import route_intent
from stem_service.routing.schema import (
    SplitIntent,
    intent_from_legacy,
    parse_intent_dict,
    parse_intent_form,
    parse_intent_json,
)

__all__ = [
    "SplitIntent",
    "execute_plan",
    "intent_from_legacy",
    "intent_routing_health",
    "parse_intent_dict",
    "parse_intent_form",
    "parse_intent_json",
    "route_intent",
]
