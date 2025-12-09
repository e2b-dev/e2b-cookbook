import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables first
env_path = Path.cwd() / '.env'
load_dotenv(dotenv_path=env_path, override=True)

# If it's a private deployment, apply necessary patches before importing e2b
if os.getenv('E2B_DOMAIN'):
    import ssl
    import socket
    import httpcore._backends.sync

    # Create unverified SSL context function
    def create_unverified_context(*args, **kwargs):
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        return context

    # Globally replace SSL context creation
    ssl._create_default_https_context = create_unverified_context
    ssl._create_unverified_context = create_unverified_context
    ssl.create_default_context = create_unverified_context

    # DNS patch (optional, if you need to resolve domain to specific IP)
    # Get IP address from environment variable (if set)
    custom_ip = os.getenv('E2B_CUSTOM_IP')
    if custom_ip:
        original_gai = socket.getaddrinfo
        def patched_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
            domain = os.getenv('E2B_DOMAIN', '').split(':')[0]  # Remove port number
            if isinstance(host, (str, bytes)) and domain in (host if isinstance(host, str) else host.decode()):
                return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (custom_ip, port))]
            return original_gai(host, port, family, type, proto, flags)
        socket.getaddrinfo = patched_getaddrinfo

    # TLS patch for httpcore
    _original_start_tls = httpcore._backends.sync.SyncStream.start_tls
    def patched_start_tls(self, ssl_context, server_hostname=None, timeout=None):
        return _original_start_tls(self, create_unverified_context(), server_hostname, timeout)
    httpcore._backends.sync.SyncStream.start_tls = patched_start_tls

import argparse
import select
import termios
import tty
import requests
from datetime import datetime
from typing import Optional
from e2b import Sandbox

# Disable SSL warnings
if os.getenv('E2B_DOMAIN'):
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def format_date(dt: datetime) -> str:
    """Format datetime"""
    return dt.isoformat().replace('T', ' ').replace('+00:00', 'Z').replace('.000000Z', 'Z')


def pad_end(s: str, width: int) -> str:
    """Pad string to specified width on the right"""
    return s if len(s) >= width else s + ' ' * (width - len(s))


def get_minutes_from_env() -> Optional[int]:
    """Get timeout minutes from environment variable"""
    minutes_str = os.getenv('SANDBOX_MINUTES')
    if minutes_str:
        try:
            n = int(minutes_str)
            if n > 0:
                return n
        except ValueError:
            pass
    return None


def get_api_url():
    """Get API URL"""
    domain = os.getenv('E2B_DOMAIN')
    if domain:
        # Private deployment
        return f'https://api.{domain}'
    return 'https://api.e2b.dev'


def get_api_headers():
    """Get API request headers"""
    api_key = os.getenv('E2B_API_KEY')
    return {
        'X-API-Key': api_key,
        'Content-Type': 'application/json',
    }


def list_templates():
    """List all templates"""
    api_url = get_api_url()
    headers = get_api_headers()

    response = requests.get(f'{api_url}/templates', headers=headers, verify=False)

    if response.status_code != 200:
        if response.status_code == 401:
            msg = f'Authentication failed: E2B_API_KEY is invalid or domain is incorrect'
        else:
            msg = f'{response.status_code}: API error'
        print(msg, file=sys.stderr)
        sys.exit(1)

    items = response.json() if response.content else []
    if not items:
        print('No templates found')
        return

    rows = []
    for t in items:
        rows.append({
            'id': t.get('templateID', ''),
            'aliases': ','.join(t.get('aliases', [])),
            'status': t.get('buildStatus', ''),
            'builds': str(t.get('buildCount', '')),
            'created_at': format_date(datetime.fromisoformat(t['createdAt'].replace('Z', '+00:00'))),
            'updated_at': format_date(datetime.fromisoformat(t['updatedAt'].replace('Z', '+00:00'))),
            'last_used_at': format_date(datetime.fromisoformat(t['lastSpawnedAt'].replace('Z', '+00:00'))) if t.get('lastSpawnedAt') else '',
        })

    w_id = max(len('TEMPLATE ID'), max(len(r['id']) for r in rows))
    w_aliases = max(len('ALIASES'), max(len(r['aliases']) for r in rows))
    w_status = max(len('STATUS'), max(len(r['status']) for r in rows))
    w_builds = max(len('BUILDS'), max(len(r['builds']) for r in rows))
    w_created = max(len('CREATED AT'), max(len(r['created_at']) for r in rows))
    w_updated = max(len('UPDATED AT'), max(len(r['updated_at']) for r in rows))
    w_last = max(len('LAST USED AT'), max(len(r['last_used_at']) for r in rows))

    print(f"{pad_end('TEMPLATE ID', w_id)}  {pad_end('ALIASES', w_aliases)}  {pad_end('STATUS', w_status)}  "
          f"{pad_end('BUILDS', w_builds)}  {pad_end('CREATED AT', w_created)}  {pad_end('UPDATED AT', w_updated)}  "
          f"{pad_end('LAST USED AT', w_last)}")
    print(f"{'-' * w_id}  {'-' * w_aliases}  {'-' * w_status}  {'-' * w_builds}  "
          f"{'-' * w_created}  {'-' * w_updated}  {'-' * w_last}")

    for r in rows:
        print(f"{pad_end(r['id'], w_id)}  {pad_end(r['aliases'], w_aliases)}  {pad_end(r['status'], w_status)}  "
              f"{pad_end(r['builds'], w_builds)}  {pad_end(r['created_at'], w_created)}  "
              f"{pad_end(r['updated_at'], w_updated)}  {pad_end(r['last_used_at'], w_last)}")


def delete_template(template_id_or_alias: str):
    """Delete template (supports ID or alias)"""
    api_url = get_api_url()
    headers = get_api_headers()

    # If it looks like an alias, resolve it to ID first
    template_id = template_id_or_alias
    if not template_id.startswith('tpl-') or len(template_id) < 10:
        response = requests.get(f'{api_url}/templates', headers=headers, verify=False)
        if response.status_code == 200:
            items = response.json() if response.content else []
            for t in items:
                if template_id_or_alias in t.get('aliases', []):
                    template_id = t['templateID']
                    break

    response = requests.delete(f'{api_url}/templates/{template_id}', headers=headers, verify=False)
    if response.status_code not in [200, 204]:
        print(f'Delete failed: {template_id}', file=sys.stderr)
        sys.exit(1)

    print(f'Template deleted: {template_id}')


def list_sandboxes():
    """List all sandboxes"""
    paginator = Sandbox.list()
    items = list(paginator.next_items())

    rows = []
    for it in items:
        rows.append({
            'id': it.sandbox_id,
            'state': it.state,
            'name': it.name or '',
            'start_at': format_date(it.started_at),
            'end_at': format_date(it.end_at),
        })

    w_id = max(len('ID'), max(len(r['id']) for r in rows)) if rows else len('ID')
    w_state = max(len('STATE'), max(len(r['state']) for r in rows)) if rows else len('STATE')
    w_name = max(len('NAME'), max(len(r['name']) for r in rows)) if rows else len('NAME')
    w_start = max(len('START AT'), max(len(r['start_at']) for r in rows)) if rows else len('START AT')
    w_end = max(len('END AT'), max(len(r['end_at']) for r in rows)) if rows else len('END AT')

    print(f"{pad_end('ID', w_id)}  {pad_end('STATE', w_state)}  {pad_end('NAME', w_name)}  "
          f"{pad_end('START AT', w_start)}  {pad_end('END AT', w_end)}")
    print(f"{'-' * w_id}  {'-' * w_state}  {'-' * w_name}  {'-' * w_start}  {'-' * w_end}")

    for r in rows:
        print(f"{pad_end(r['id'], w_id)}  {pad_end(r['state'], w_state)}  {pad_end(r['name'], w_name)}  "
              f"{pad_end(r['start_at'], w_start)}  {pad_end(r['end_at'], w_end)}")


def show_info(sandbox_id: str):
    """Show sandbox details"""
    info = Sandbox.get_info(sandbox_id)
    lines = [
        f'ID      : {info.sandbox_id}',
        f'STATE   : {info.state}',
        f'NAME    : {info.name or ""}',
        f'START AT: {format_date(info.started_at)}',
        f'END AT  : {format_date(info.end_at)}',
        f'CPU     : {info.cpu_count}',
        f'MEM MB  : {info.memory_mb}',
    ]
    for line in lines:
        print(line)


def kill_sandbox(sandbox_id: str):
    """Kill sandbox"""
    sandbox = Sandbox.connect(sandbox_id)
    sandbox.kill()
    print(f'Killed: {sandbox_id}')


def pause_sandbox(sandbox_id: str):
    """Pause sandbox"""
    paused = Sandbox.beta_pause(sandbox_id)
    status = 'Paused:' if paused else 'Pause:'
    print(f'{status} {sandbox_id}')


def resume_sandbox(sandbox_id: str):
    """Resume sandbox"""
    sandbox = Sandbox.connect(sandbox_id)
    info = sandbox.get_info()
    print(f'Resumed: {sandbox_id} STATE:{info.state}')


def execute_code(sandbox: Sandbox, code: str):
    """Execute Python code in sandbox"""
    try:
        # Use commands.run to execute Python code
        result = sandbox.commands.run(f'python3 -c {repr(code)}')

        print(f'Exit code: {result.exit_code}')
        if result.stdout:
            print(f'Stdout:\n{result.stdout.rstrip()}')
        if result.stderr:
            print(f'Stderr:\n{result.stderr.rstrip()}', file=sys.stderr)

        return result.exit_code
    except Exception as e:
        # Handle command execution exceptions (may include exit code and output)
        if hasattr(e, 'exit_code'):
            print(f'Exit code: {e.exit_code}')
            if hasattr(e, 'stdout') and e.stdout:
                print(f'Stdout:\n{e.stdout.rstrip()}')
            if hasattr(e, 'stderr') and e.stderr:
                print(f'Stderr:\n{e.stderr.rstrip()}', file=sys.stderr)
            return e.exit_code
        else:
            print(f'Code execution failed: {e}', file=sys.stderr)
            return 1


def execute_file(sandbox: Sandbox, file_path: str):
    """Execute local Python file in sandbox"""
    try:
        # Read local file content
        with open(file_path, 'r', encoding='utf-8') as f:
            code = f.read()

        # Upload to temporary location in sandbox
        remote_path = f'/tmp/{Path(file_path).name}'
        sandbox.files.write(remote_path, code)

        # Execute file
        result = sandbox.commands.run(f'python3 {remote_path}')

        print(f'Exit code: {result.exit_code}')
        if result.stdout:
            print(f'Stdout:\n{result.stdout.rstrip()}')
        if result.stderr:
            print(f'Stderr:\n{result.stderr.rstrip()}', file=sys.stderr)

        return result.exit_code
    except FileNotFoundError:
        print(f'File not found: {file_path}', file=sys.stderr)
        return 1
    except Exception as e:
        # Handle command execution exceptions (may include exit code and output)
        if hasattr(e, 'exit_code'):
            print(f'Exit code: {e.exit_code}')
            if hasattr(e, 'stdout') and e.stdout:
                print(f'Stdout:\n{e.stdout.rstrip()}')
            if hasattr(e, 'stderr') and e.stderr:
                print(f'Stderr:\n{e.stderr.rstrip()}', file=sys.stderr)
            return e.exit_code
        else:
            print(f'File execution failed: {e}', file=sys.stderr)
            return 1


def execute_command(sandbox: Sandbox, command: str):
    """Execute shell command in sandbox"""
    try:
        result = sandbox.commands.run(command)

        print(f'Exit code: {result.exit_code}')
        if result.stdout:
            print(f'Stdout:\n{result.stdout.rstrip()}')
        if result.stderr:
            print(f'Stderr:\n{result.stderr.rstrip()}', file=sys.stderr)

        return result.exit_code
    except Exception as e:
        # Handle command execution exceptions (may include exit code and output)
        if hasattr(e, 'exit_code'):
            print(f'Exit code: {e.exit_code}')
            if hasattr(e, 'stdout') and e.stdout:
                print(f'Stdout:\n{e.stdout.rstrip()}')
            if hasattr(e, 'stderr') and e.stderr:
                print(f'Stderr:\n{e.stderr.rstrip()}', file=sys.stderr)
            return e.exit_code
        else:
            print(f'Command execution failed: {e}', file=sys.stderr)
            return 1


def upload_files_to_sandbox(sandbox: Sandbox, file_paths: list):
    """Upload multiple files to sandbox /home/user directory"""
    uploaded = []
    for file_path in file_paths:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # Upload to user directory, keeping filename
            remote_path = f'/home/user/{Path(file_path).name}'
            sandbox.files.write(remote_path, content)
            uploaded.append(remote_path)
            print(f'Uploaded: {file_path} -> {remote_path}')
        except FileNotFoundError:
            print(f'Warning: File not found: {file_path}', file=sys.stderr)
        except Exception as e:
            print(f'Warning: Upload failed for {file_path}: {e}', file=sys.stderr)

    return uploaded


def enter_shell(sandbox: Sandbox, timeout_minutes: Optional[int]):
    """Enter interactive shell"""
    import threading
    import signal
    from e2b import PtySize

    # Safely get terminal size
    try:
        cols = os.get_terminal_size().columns
        rows = os.get_terminal_size().lines
    except (OSError, AttributeError):
        # Non-interactive environment or unsupported system, use default values
        cols = 80
        rows = 24

    # Create PTY (timeout in seconds)
    timeout_seconds = timeout_minutes * 60 if timeout_minutes else 60

    # PTY output callback
    def on_pty_output(data: bytes):
        sys.stdout.buffer.write(data)
        sys.stdout.flush()

    # Create PTY
    handle = sandbox.pty.create(
        size=PtySize(rows=rows, cols=cols),
        timeout=timeout_seconds,
    )

    # Set terminal to raw mode
    old_settings = None
    if sys.stdin.isatty():
        old_settings = termios.tcgetattr(sys.stdin)
        tty.setraw(sys.stdin)

    # Flag to control the loop
    running = True

    def wait_for_output():
        """Wait for PTY output in background thread"""
        nonlocal running
        try:
            handle.wait(on_pty=on_pty_output)
        except Exception as e:
            if running:
                print(f"\nPTY ended: {e}", file=sys.stderr)
        finally:
            running = False

    # Start output handler thread
    output_thread = threading.Thread(target=wait_for_output, daemon=True)
    output_thread.start()

    # Handle terminal resize
    def handle_resize(signum, frame):
        if hasattr(os, 'get_terminal_size'):
            try:
                new_cols = os.get_terminal_size().columns
                new_rows = os.get_terminal_size().lines
                sandbox.pty.resize(handle.pid, PtySize(rows=new_rows, cols=new_cols))
            except:
                pass

    # Register SIGWINCH signal handler (terminal size change)
    old_sigwinch = None
    try:
        old_sigwinch = signal.signal(signal.SIGWINCH, handle_resize)
    except:
        pass  # Windows doesn't support SIGWINCH

    try:
        # Main loop: read user input and send to PTY
        while running:
            # Check if there's input to read (non-blocking)
            if select.select([sys.stdin], [], [], 0.1)[0]:
                try:
                    data = sys.stdin.buffer.read(1)
                    if not data:
                        break
                    sandbox.pty.send_stdin(handle.pid, data)
                except Exception as e:
                    if running:
                        print(f"\nSending input failed: {e}", file=sys.stderr)
                    break
    finally:
        running = False
        # Restore terminal settings
        if old_settings:
            termios.tcsetattr(sys.stdin, termios.TCSADRAIN, old_settings)
        # Restore signal handler
        if old_sigwinch is not None:
            try:
                signal.signal(signal.SIGWINCH, old_sigwinch)
            except:
                pass
        # Wait for output thread to finish
        output_thread.join(timeout=1.0)


def main():
    if not os.getenv('E2B_API_KEY'):
        print('E2B_API_KEY not set', file=sys.stderr)
        sys.exit(1)

    parser = argparse.ArgumentParser(description='E2B sandbox operation tool')
    parser.add_argument('--list-templates', action='store_true', help='List all templates')
    parser.add_argument('--delete-template', action='store_true', help='Delete template')
    parser.add_argument('--list', action='store_true', help='List all sandboxes')
    parser.add_argument('--info', action='store_true', help='Show sandbox details')
    parser.add_argument('--kill', action='store_true', help='Kill sandbox')
    parser.add_argument('--pause', action='store_true', help='Pause sandbox')
    parser.add_argument('--resume', action='store_true', help='Resume sandbox')
    parser.add_argument('--connect', action='store_true', help='Connect to existing sandbox')
    parser.add_argument('--shell', action='store_true', help='Enter interactive shell')
    parser.add_argument('--id', help='Sandbox ID')
    parser.add_argument('--sandbox-id', help='Sandbox ID (alternative)')
    parser.add_argument('--template-id', help='Template ID')
    parser.add_argument('--alias', help='Template alias')
    parser.add_argument('--minutes', type=int, help='Sandbox timeout in minutes')
    parser.add_argument('--code', help='Python code to execute in sandbox')
    parser.add_argument('--file', help='Local Python file path to execute in sandbox')
    parser.add_argument('--command', help='Shell command to execute in sandbox')
    parser.add_argument('--upload', nargs='+', help='Upload files to sandbox (multiple files separated by spaces)')

    args = parser.parse_args()

    # List templates
    if args.list_templates:
        list_templates()
        return

    # Delete template
    if args.delete_template:
        template_id = args.id or args.template_id or args.alias
        if not template_id:
            print('Requires --id, --template-id or --alias parameter', file=sys.stderr)
            sys.exit(1)
        delete_template(template_id)
        return

    # List sandboxes
    if args.list:
        list_sandboxes()
        return

    # Show sandbox details
    if args.info:
        sandbox_id = args.id or args.sandbox_id
        if not sandbox_id:
            print('Requires --id parameter', file=sys.stderr)
            sys.exit(1)
        show_info(sandbox_id)
        return

    # Kill sandbox
    if args.kill:
        sandbox_id = args.id or args.sandbox_id
        if not sandbox_id:
            print('Requires --id parameter', file=sys.stderr)
            sys.exit(1)
        kill_sandbox(sandbox_id)
        return

    # Pause sandbox
    if args.pause:
        sandbox_id = args.id or args.sandbox_id
        if not sandbox_id:
            print('Requires --id parameter', file=sys.stderr)
            sys.exit(1)
        pause_sandbox(sandbox_id)
        return

    # Resume sandbox
    if args.resume:
        sandbox_id = args.id or args.sandbox_id
        if not sandbox_id:
            print('Requires --id parameter', file=sys.stderr)
            sys.exit(1)
        resume_sandbox(sandbox_id)
        return

    # Connect to existing sandbox
    if args.connect:
        sandbox_id = args.id or args.sandbox_id
        if not sandbox_id:
            print('Usage: --connect --id=<sandboxID> [--shell] [--minutes=N]', file=sys.stderr)
            sys.exit(1)

        minutes = args.minutes or get_minutes_from_env()
        # Sandbox.connect uses seconds
        timeout = minutes * 60 if minutes else (3600 if args.shell else None)

        sandbox = Sandbox.connect(sandbox_id, timeout=timeout)
        if timeout:
            sandbox.set_timeout(timeout)

        info = sandbox.get_info()
        print(f'mode:connect id:{sandbox.sandbox_id} template:{info.name or ""} '
              f'minutes:{minutes or ""} endAt:{info.end_at.isoformat()}')

        # Upload files (if specified)
        if args.upload:
            upload_files_to_sandbox(sandbox, args.upload)

        if args.shell:
            enter_shell(sandbox, minutes)
        elif args.code:
            exit_code = execute_code(sandbox, args.code)
            sys.exit(exit_code)
        elif args.file:
            exit_code = execute_file(sandbox, args.file)
            sys.exit(exit_code)
        elif args.command:
            exit_code = execute_command(sandbox, args.command)
            sys.exit(exit_code)
        return

    # Create new sandbox
    sandbox_id = args.sandbox_id
    minutes = args.minutes or get_minutes_from_env()
    # Sandbox.connect/create uses seconds
    timeout = minutes * 60 if minutes else (3600 if args.shell else None)

    if sandbox_id:
        # Connect to existing sandbox
        sandbox = Sandbox.connect(sandbox_id, timeout=timeout)
        if timeout:
            sandbox.set_timeout(timeout)
        mode = 'connect'
    else:
        # Create new sandbox
        alias = args.alias
        if not alias:
            print('Requires alias parameter. Usage: --alias=<template_alias> [--shell] [--minutes=N]', file=sys.stderr)
            sys.exit(1)
        sandbox = Sandbox.create(alias, timeout=timeout)
        mode = 'create'

    info = sandbox.get_info()
    end_at = info.end_at.isoformat()

    print(f'mode:{mode} id:{sandbox.sandbox_id} template:{info.name or ""} '
          f'minutes:{minutes or ""} endAt:{end_at}')

    # Upload files (if specified)
    if args.upload:
        upload_files_to_sandbox(sandbox, args.upload)

    if args.shell:
        enter_shell(sandbox, minutes)
    elif args.code:
        exit_code = execute_code(sandbox, args.code)
        sys.exit(exit_code)
    elif args.file:
        exit_code = execute_file(sandbox, args.file)
        sys.exit(exit_code)
    elif args.command:
        exit_code = execute_command(sandbox, args.command)
        sys.exit(exit_code)


if __name__ == '__main__':
    try:
        main()
    except Exception as err:
        import traceback
        print(f'Error: {err}', file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
