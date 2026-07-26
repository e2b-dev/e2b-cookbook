import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables first
env_path = Path.cwd() / '.env'
load_dotenv(dotenv_path=env_path, override=True)

# For private deployments, apply necessary patches before importing e2b
if os.getenv('E2B_DOMAIN'):
    import ssl
    import socket
    import httpcore._backends.sync

    # Create SSL context function that doesn't verify certificates
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
    custom_ip = os.getenv('E2B_CUSTOM_IP')
    if custom_ip:
        original_gai = socket.getaddrinfo
        def patched_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
            domain = os.getenv('E2B_DOMAIN', '').split(':')[0]
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
from e2b import Template, default_build_logger
from template import create_template

# Disable SSL warnings
if os.getenv('E2B_DOMAIN'):
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def get_args():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(description='Build E2B template')
    parser.add_argument('--alias', required=True, help='Template alias (required)')
    parser.add_argument(
        '--mode',
        choices=['code', 'base'],
        default=None,
        help='Sandbox mode: code (Code Interpreter) or base (base image). Priority: CLI args > env SANDBOX_MODE > default "code"'
    )
    parser.add_argument(
        '--registry',
        default=None,
        help='Image registry prefix. Priority: CLI args > env E2B_IMAGE_REGISTRY'
    )
    return parser.parse_args()


def main():
    args = get_args()

    # Parameter priority: CLI args > environment variables > default values
    mode = args.mode or os.getenv('SANDBOX_MODE') or 'code'
    registry = args.registry or os.getenv('E2B_IMAGE_REGISTRY') or None

    # Create template
    template = create_template(mode=mode, registry=registry)

    # Build template
    Template.build(
        template,
        alias=args.alias,
        cpu_count=1,
        memory_mb=1024,
        on_build_logs=default_build_logger(),
    )

    print(f'✅ Template built successfully: alias={args.alias}, mode={mode}, registry={registry or "default"}')


if __name__ == '__main__':
    try:
        main()
    except Exception as err:
        print(f'Error: {err}', file=sys.stderr)
        sys.exit(1)
