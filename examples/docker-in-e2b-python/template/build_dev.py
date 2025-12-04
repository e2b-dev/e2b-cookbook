from dotenv import load_dotenv
from e2b import Template, default_build_logger
from .template import template

load_dotenv()

if __name__ == "__main__":
    Template.build(
        template,
        alias="e2b-with-docker-dev",
        on_build_logs=default_build_logger(),
    )
