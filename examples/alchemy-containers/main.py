"""Run the complete recipe in a fresh E2B sandbox, then clean up the sandbox."""
import os
from pathlib import Path
from dotenv import load_dotenv
from e2b import Sandbox

load_dotenv()
ROOT = Path(__file__).resolve().parent
REMOTE = '/root/alchemy-containers'


def main():
    sandbox = None
    try:
        sandbox = Sandbox.create(
            os.environ.get('E2B_TEMPLATE_NAME', 'alchemy-containers'),
            timeout=1200,
        )
        print(f'Sandbox: {sandbox.sandbox_id}', flush=True)
        files = [ROOT / p for p in ['setup.sh', 'run-demo.sh', 'checks.py']]
        for name in ['app', 'proxy']:
            files.extend(p for p in (ROOT / name).rglob('*') if p.is_file()
                         and not any(x in p.relative_to(ROOT).parts
                                     for x in ['node_modules', '.alchemy', '__pycache__']))
        for path in files:
            sandbox.files.write(
                f'{REMOTE}/{path.relative_to(ROOT).as_posix()}',
                path.read_bytes(), user='root',
            )
        output = lambda text: print(text, end='', flush=True)
        sandbox.commands.run(
            f'cd {REMOTE} && bash setup.sh', user='root', timeout=300,
            on_stdout=output, on_stderr=output,
        )
        # Build the source image before starting the server, so startup has a
        # bounded wait independent of image download and compilation time.
        sandbox.commands.run(
            f'cd {REMOTE} && docker build -t e2b-cf-proxy:nat proxy '
            '&& cd app && bun install --frozen-lockfile',
            user='root', timeout=600, on_stdout=output, on_stderr=output,
        )
        sandbox.commands.run(
            f'cd {REMOTE}/app && bash run-local.sh > /tmp/alchemy.log 2>&1',
            user='root', background=True,
        )
        sandbox.commands.run(
            f'cd {REMOTE} && python3 checks.py',
            user='root', timeout=180, on_stdout=output, on_stderr=output,
        )
    except BaseException:
        if sandbox is not None:
            try:
                print(sandbox.files.read('/tmp/alchemy.log', user='root')[-12000:])
            except Exception:
                pass
        raise
    finally:
        if sandbox is not None:
            sandbox.kill()
            print('Test sandbox deleted.', flush=True)


if __name__ == '__main__':
    main()
