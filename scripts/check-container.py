"""Smoke test an isolated container and its private volume; no host ports."""
import argparse
import json
import subprocess
import time
import uuid

parser = argparse.ArgumentParser()
parser.add_argument('--image', default='lore:local-test')
image = parser.parse_args().image
name = 'lore-smoke-' + uuid.uuid4().hex[:12]
volume = name + '-data'
def docker(*args):
    return subprocess.check_output(['docker', *args], text=True).strip()

token = 'container-smoke-token-' * 3
credentials = json.dumps([{'token': token, 'scope': dict(installationId='i', userId='u', characterId='c', chatId='chat', branchId='b')}])
created = False
try:
    docker('volume', 'create', volume)
    docker('run', '-d', '--name', name, '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--tmpfs', '/tmp:size=16m', '--mount', 'type=volume,source=' + volume + ',target=/data', '-e', 'LORE_CREDENTIALS_JSON=' + credentials, image)
    created = True
    assert docker('exec', name, 'id', '-u') == '1000'
    def request(path, method='GET', value=None):
        options = {'method': method, 'headers': {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}}
        if value is not None: options['body'] = json.dumps(value)
        code = "const r=await fetch('http://127.0.0.1:6011'+process.argv[1],JSON.parse(process.argv[2]));if(!r.ok)throw Error('HTTP '+r.status);console.log(await r.text());"
        return json.loads(docker('exec', name, 'node', '--input-type=module', '-e', code, path, json.dumps(options)))
    def healthy():
        deadline = time.monotonic() + 10
        while True:
            try: return request('/health')
            except subprocess.CalledProcessError:
                if time.monotonic() >= deadline: raise
                time.sleep(0.1)
    assert healthy()['ok']
    request('/wiki/persist', 'PATCH', {'page': {'title': 'Restart', 'body': 'Persisted across container restart'}, 'expectedRevision': 0})
    docker('restart', name)
    healthy()
    assert request('/wiki/persist')['body'] == 'Persisted across container restart'
    print('PASS container: UID 1000, read-only root, no network/host ports, persistent volume across restart')
finally:
    if created: docker('rm', '-f', name)
    docker('volume', 'rm', volume)
