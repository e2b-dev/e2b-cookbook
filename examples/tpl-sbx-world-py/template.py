from e2b import Template
from e2b.template.readycmd import wait_for_url
from typing import Optional, Literal


# Type definition: mode can only be 'code' or 'base'
Mode = Literal['code', 'base']


def create_template(mode: Mode = 'code', registry: Optional[str] = None) -> Template:
    prefix = (registry.rstrip('/') + '/') if registry else ''

    # Select image based on mode
    if mode == 'code':
        image = f"{prefix}e2bdev/code-interpreter:latest"
        tpl = (
            Template()
            .from_image(image)
            .set_user('user')
            .set_workdir('/home/user')
            .run_cmd('echo Hello World E2B! > hello.txt')
        )
        return tpl.set_start_cmd('sudo /root/.jupyter/start-up.sh', wait_for_url('http://localhost:49999/health'))

    # Base mode: base image + bash
    image = f"{prefix}e2bdev/base:latest"
    tpl = (
        Template()
        .from_image(image)
        .set_user('user')
        .set_workdir('/home/user')
        .run_cmd('echo Hello World E2B! > hello.txt')
    )
    return tpl.set_start_cmd('sudo /bin/bash')
