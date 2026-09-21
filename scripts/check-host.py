"""Run real plugin integration against a disposable, unmodified official host."""
import os
from pathlib import Path
import subprocess
import time
import urllib.request
import uuid

IMAGE = 'ghcr.io/pocketrisu/pocketrisu@sha256:502116cc2007a924c189fad4df6ae13b25c01d0e26538a80d9e25de82b5b05d8'
ROOT = Path(__file__).resolve().parents[1]
name = 'lore-host-check-' + uuid.uuid4().hex[:12]
def docker(*args):
    return subprocess.check_output(['docker', *args], text=True).strip()
created = False
try:
    docker('run', '-d', '--name', name, '-p', '127.0.0.1::6001', IMAGE)
    created = True
    address = 'http://' + docker('port', name, '6001/tcp')
    deadline = time.monotonic() + 30
    while True:
        try:
            with urllib.request.urlopen(address + '/api/test_auth', timeout=2) as response:
                assert response.status == 200
            break
        except (OSError, AssertionError):
            if time.monotonic() >= deadline:
                raise
            time.sleep(0.2)
    gateway = docker('network', 'inspect', 'bridge', '--format', '{{(index .IPAM.Config 0).Gateway}}')
    subprocess.run(['node', 'tests/host.mjs'], cwd=ROOT, env={**os.environ, 'LORE_TEST_HOST':address, 'LORE_TEST_BRIDGE':gateway}, check=True, timeout=240)
finally:
    if created:
        docker('rm', '-f', name)
