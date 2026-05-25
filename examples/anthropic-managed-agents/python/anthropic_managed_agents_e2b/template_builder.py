from __future__ import annotations

from e2b import Template, default_build_logger

from anthropic_managed_agents_e2b.template import template


def build_template(*, template_name: str):
    return Template.build(
        template,
        template_name,
        cpu_count=2,
        memory_mb=4096,
        on_build_logs=default_build_logger(),
    )
