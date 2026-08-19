from dotenv import load_dotenv
from e2b import Template, default_build_logger
from .template import template, template_name

load_dotenv()

Template.build(
    template,
    alias=f"{template_name}-dev",
    cpu_count=1,
    memory_mb=1024,
    on_build_logs=default_build_logger(),
)
