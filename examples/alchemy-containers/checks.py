"""Exercise real Alchemy Container networking, policy controls and hot reload."""
import http.client
import json
import os
from pathlib import Path
import time
import urllib.error
import urllib.request

BASE_URL = os.environ.get('ALCHEMY_TEST_BASE_URL', 'http://127.0.0.1:8787')
ROOT = Path(__file__).resolve().parent


def request(path, data=None, timeout=40):
    req = urllib.request.Request(BASE_URL + path, data=data)
    try:
        response = urllib.request.urlopen(req, timeout=timeout)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        text = response.read().decode()
        try:
            body = json.loads(text)
        except json.JSONDecodeError:
            body = {'text': text}
        return response.status, body


def wait_for_worker(expected, timeout=90):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(BASE_URL + '/worker', timeout=2) as response:
                if response.read().decode() == expected:
                    return
        except (OSError, urllib.error.URLError):
            pass
        time.sleep(0.5)
    raise RuntimeError(f'Alchemy did not serve {expected!r} within {timeout}s')


def denied_dns(status, body):
    return status == 502 and 'ENOTFOUND' in str(body)


def main():
    wait_for_worker('worker-ready')
    cases = [
        ('ingress_get', '/hello', None,
         lambda s, b: s == 200 and b.get('ok') is True),
        ('ingress_post', '/echo', b'hello from e2b',
         lambda s, b: s == 200 and b.get('body') == 'hello from e2b'),
        ('dns_online', '/dns', None,
         lambda s, b: s == 200 and len(b.get('addresses', [])) > 0),
        ('http_online', '/outbound?target=http%3A%2F%2Fexample.com', None,
         lambda s, b: s == 200 and b.get('status') == 200),
        ('https_online', '/outbound?target=https%3A%2F%2Fexample.com', None,
         lambda s, b: s == 200 and b.get('status') == 200),
        ('ip_online', '/outbound?target=http%3A%2F%2F1.1.1.1%2Fcdn-cgi%2Ftrace', None,
         lambda s, b: s == 200 and b.get('status') == 200),
        ('ingress_offline', '/hello?internet=off', None,
         lambda s, b: s == 200 and b.get('ok') is True),
        ('dns_offline', '/dns?internet=off', None, denied_dns),
        ('http_offline', '/outbound?internet=off&target=http%3A%2F%2Fexample.com',
         None, denied_dns),
        ('https_offline', '/outbound?internet=off&target=https%3A%2F%2Fexample.com',
         None, denied_dns),
        ('ip_offline', '/outbound?internet=off&target=http%3A%2F%2F1.1.1.1%2Fcdn-cgi%2Ftrace',
         None, lambda s, b: s == 502 and 'other side closed' in str(b)),
    ]
    results = []
    for name, path, data, check in cases:
        try:
            status, body = request(path, data)
            result = {'test': name, 'pass': check(status, body), 'status': status}
            if not result['pass']:
                result['body'] = body
        except Exception as error:
            result = {'test': name, 'pass': False, 'error': str(error)}
        results.append(result)
        print(json.dumps(result), flush=True)

    worker = ROOT / 'app' / 'worker.ts'
    original = worker.read_text()
    try:
        if 'worker-ready' not in original:
            raise RuntimeError('Cannot locate the demo readiness response')
        worker.write_text(original.replace('worker-ready', 'worker-reloaded'))
        wait_for_worker('worker-reloaded', timeout=30)
        results.append({'test': 'worker_hot_reload', 'pass': True})
        # The new Worker can answer before the Container binding has finished
        # restarting. Require a successful real request within a bounded wait.
        deadline = time.monotonic() + 30
        last_error = 'Container did not become ready'
        while time.monotonic() < deadline:
            try:
                status, body = request('/hello', timeout=min(5, deadline - time.monotonic()))
                if status == 200 and body.get('ok') is True:
                    results.append({'test': 'container_after_hot_reload', 'pass': True})
                    break
                last_error = f'HTTP {status}: {body}'
            except (OSError, http.client.HTTPException) as error:
                last_error = str(error)
            time.sleep(0.5)
        else:
            raise RuntimeError(f'Container was not ready after reload: {last_error}')
    except Exception as error:
        results.append({'test': 'hot_reload', 'pass': False, 'error': str(error)})
    finally:
        worker.write_text(original)
    for result in results[len(cases):]:
        print(json.dumps(result), flush=True)
    (ROOT / 'results.json').write_text(json.dumps(results, indent=2) + '\n')
    if not all(result['pass'] for result in results):
        raise SystemExit('One or more checks failed. See results.json and the Alchemy logs.')
    print(f'All {len(results)} checks passed.', flush=True)


if __name__ == '__main__':
    main()
