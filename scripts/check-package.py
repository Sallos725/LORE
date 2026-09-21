"""Verify hashes and actually run each installed server archive in a temp folder."""
import hashlib
import base64
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
import json
import os
from pathlib import Path
import socket
import subprocess
import tarfile
import tempfile
import time
from urllib.request import Request, urlopen
import zipfile

DIST = Path(__file__).resolve().parents[1] / 'dist'
manifest = json.loads((DIST / 'release.json').read_text())
for line in (DIST / 'SHA256SUMS').read_text().splitlines():
    checksum, name = line.split('  ', 1)
    assert Path(name).name == name
    assert hashlib.sha256((DIST / name).read_bytes()).hexdigest() == checksum

def smoke(directory):
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    token = 'synthetic-pocketrisu-login'
    fixture = json.loads((DIST.parent / 'tests/fixtures/pocketrisu-chat.json').read_text())
    class Upstream(BaseHTTPRequestHandler):
        def log_message(self, *args): pass
        def do_GET(self):
            if self.headers.get('risu-auth') != token:
                self.send_response(401); self.end_headers(); return
            data = json.dumps({'status': 'success'}).encode() if self.path == '/api/test_auth' else base64.b64decode(fixture['base64'])
            self.send_response(200); self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)
    upstream = ThreadingHTTPServer(('127.0.0.1', 0), Upstream)
    Thread(target=upstream.serve_forever, daemon=True).start()
    env = {**os.environ, 'PORT': str(port), 'HOST': '127.0.0.1', 'LORE_DATA_DIR': str(directory / 'data'), 'LORE_POCKETRISU_URL': f'http://127.0.0.1:{upstream.server_port}'}
    proc = subprocess.Popen(['node', 'server/main.mjs'], cwd=directory, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        deadline = time.monotonic() + 10
        base = f'http://127.0.0.1:{port}'
        while True:
            if proc.poll() is not None:
                raise RuntimeError('Packaged server exited: ' + proc.stderr.read().decode())
            try:
                with urlopen(base + '/health', timeout=1) as response:
                    assert json.load(response)['ok'] is True
                break
            except OSError:
                if time.monotonic() >= deadline:
                    raise RuntimeError('Packaged server did not start')
                time.sleep(0.05)
        headers = {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}
        with urlopen(Request(base + '/connect', data=json.dumps({'selector': {'characterId': 'c', 'index': 0}}).encode(), headers=headers), timeout=2) as response:
            scope = json.load(response)['scope']
        headers.update({'X-Lore-Character': scope['characterId'], 'X-Lore-Chat': scope['chatId']})
        data = json.dumps({'page': {'title': 'Installed', 'body': 'Smoke test'}, 'expectedRevision': 0}).encode()
        with urlopen(Request(base + '/wiki/smoke', data=data, headers=headers, method='PATCH'), timeout=2) as response:
            assert json.load(response)['revision'] == 1
        with urlopen(Request(base + '/wiki/smoke', headers=headers), timeout=2) as response:
            assert json.load(response)['body'] == 'Smoke test'
    finally:
        upstream.shutdown(); upstream.server_close()
        proc.terminate()
        try:
            proc.communicate(timeout=8)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.communicate()

for name in manifest['assets']:
    if not name.endswith(('.tar.gz', '.zip')):
        continue
    with tempfile.TemporaryDirectory(prefix='lore-install-') as temp:
        directory = Path(temp)
        if name.endswith('.zip'):
            with zipfile.ZipFile(DIST / name) as archive:
                names = archive.namelist()
                assert all(not Path(n).is_absolute() and '..' not in Path(n).parts for n in names)
                archive.extractall(directory)
        else:
            with tarfile.open(DIST / name) as archive:
                names = archive.getnames()
                archive.extractall(directory, filter='data')
        assert all(not any(p in ('.env', '.git', 'node_modules', 'data') for p in Path(n).parts) for n in names)
        assert 'server/main.mjs' in names
        assert not any('install-host' in n or n.startswith('integration/') for n in names)
        smoke(directory)
    print('PASS installed', name)
