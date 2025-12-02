import os
import signal
import sys
import webbrowser
from flask import Flask, request, Response
import requests
from e2b_code_interpreter import Sandbox
from dotenv import load_dotenv
import random

# Load environment variables
load_dotenv()

# Configuration from environment variables
PORT_IN_SANDBOX = int(os.getenv('PORT_IN_SANDBOX', '8000'))
PROXY_PORT = int(os.getenv('PORT', '80'))
E2B_API_KEY = os.getenv('E2B_API_KEY')

# Global sandbox reference for cleanup
sandbox = None

def generate_unique_name():
    """Generate a unique subdomain name similar to unique-names-generator"""
    adjectives = ['quick', 'lazy', 'sleepy', 'noisy', 'hungry', 'brave', 'calm', 'eager', 'gentle', 'happy']
    colors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'brown', 'gray', 'white']
    animals = ['dog', 'cat', 'fox', 'bear', 'lion', 'tiger', 'eagle', 'shark', 'wolf', 'panda']

    return f"{random.choice(adjectives)}-{random.choice(colors)}-{random.choice(animals)}"

def cleanup_sandbox(signum=None, frame=None):
    """Cleanup sandbox on exit"""
    global sandbox
    if sandbox:
        print('\nShutting down...')
        try:
            sandbox.kill()
        except Exception as e:
            print(f"Error killing sandbox: {e}")
    sys.exit(0)

# Register signal handlers
signal.signal(signal.SIGINT, cleanup_sandbox)
signal.signal(signal.SIGTERM, cleanup_sandbox)

# Start sandbox
print("Creating sandbox...")
sandbox = Sandbox(api_key=E2B_API_KEY)
print(f"Sandbox created: {sandbox.sandbox_id}")

# Start python file serving server inside of the sandbox
sandbox.commands.run(
    f"python3 -m http.server {PORT_IN_SANDBOX}",
    background=True,
    cwd='/',
    user='root'
)
print(f"Python HTTP server started on port {PORT_IN_SANDBOX} inside sandbox")

# Generate custom subdomain
custom_subdomain = generate_unique_name()

# Map custom subdomains to sandbox IDs
sandbox_custom_subdomains = {
    custom_subdomain: sandbox.sandbox_id,
}

# Create Flask app for proxying
app = Flask(__name__)

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def proxy(path):
    """Proxy requests to the sandbox"""
    host = request.headers.get('Host', '')
    subdomain = host.split('.')[0] if '.' in host else ''

    # Check if this is a subdomain request
    if '.' not in host:
        return 'Please use subdomain format: <custom-subdomain>.<domain>', 400

    # Look up sandbox ID by custom subdomain
    sandbox_id = sandbox_custom_subdomains.get(subdomain)

    if not sandbox_id:
        return f'Sandbox with subdomain "{subdomain}" not found', 404

    # Get the sandbox hostname for proxying
    sandbox_host = sandbox.get_host(PORT_IN_SANDBOX)

    # Build target URL
    target_url = f"https://{sandbox_host}/{path}"
    if request.query_string:
        target_url += f"?{request.query_string.decode()}"

    # Forward the request to the sandbox
    try:
        resp = requests.request(
            method=request.method,
            url=target_url,
            headers={key: value for key, value in request.headers if key.lower() != 'host'},
            data=request.get_data(),
            cookies=request.cookies,
            allow_redirects=False,
            verify=True
        )

        # Create response
        excluded_headers = ['content-encoding', 'content-length', 'transfer-encoding', 'connection']
        headers = [(name, value) for name, value in resp.raw.headers.items()
                   if name.lower() not in excluded_headers]

        response = Response(resp.content, resp.status_code, headers)
        return response
    except Exception as e:
        return f"Error proxying request: {str(e)}", 500

if __name__ == '__main__':
    print(f"Proxy server running on http://localhost:{PROXY_PORT}")
    print(f'Sandbox {sandbox.sandbox_id} accessible via custom subdomain: "{custom_subdomain}"')
    print(f"Access via: http://{custom_subdomain}.localhost:{PROXY_PORT}/")

    # Open browser pointing to the custom subdomain
    webbrowser.open(f"http://{custom_subdomain}.localhost:{PROXY_PORT}/")

    # Start Flask server
    try:
        app.run(host='0.0.0.0', port=PROXY_PORT, debug=False)
    except KeyboardInterrupt:
        cleanup_sandbox()
