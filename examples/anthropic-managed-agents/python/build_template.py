from __future__ import annotations

from e2b import Template, default_build_logger

from config import E2B_TEMPLATE_NAME
from template import template


def main() -> None:
    info = Template.build(
        template,
        E2B_TEMPLATE_NAME,
        cpu_count=2,
        memory_mb=4096,
        on_build_logs=default_build_logger(),
    )
    print(f"E2B_TEMPLATE_NAME={info.name}")


if __name__ == "__main__":
    main()

