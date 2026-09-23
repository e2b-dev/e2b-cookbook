"""Build a 2 GB base sandbox for the source build and local development server."""
import os
from dotenv import load_dotenv
from e2b import Template

load_dotenv()
if __name__ == '__main__':
    name = os.environ.get('E2B_TEMPLATE_NAME', 'alchemy-containers')
    build = Template.build(
        Template().from_template('base'),
        name,
        cpu_count=2,
        memory_mb=2048,
    )
    print(f'Template: {name} ({build.template_id})')
