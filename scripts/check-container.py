"""Smoke test an isolated container and its private volume; no host ports."""
import argparse
from pathlib import Path
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

token = 'synthetic-pocketrisu-login'
fixture = json.loads((Path(__file__).resolve().parents[1] / 'tests/fixtures/pocketrisu-chat.json').read_text())['base64']
upstream_code = "require('node:http').createServer((req,res)=>{if(req.headers['risu-auth']!==process.argv[1]){res.writeHead(401);res.end();return;}res.end(req.url==='/api/test_auth'?JSON.stringify({status:'success'}):Buffer.from(process.argv[2],'base64'));}).listen(6012,'127.0.0.1')"
def upstream():
    docker('exec', '-d', name, 'node', '-e', upstream_code, token, fixture)
created = False
try:
    docker('volume', 'create', volume)
    docker('run', '-d', '--name', name, '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--tmpfs', '/tmp:size=16m', '--mount', 'type=volume,source=' + volume + ',target=/data', '-e', 'LORE_POCKETRISU_URL=http://127.0.0.1:6012', image)
    created = True
    assert docker('exec', name, 'id', '-u') == '1000'
    def request(path, method='GET', value=None):
        options = {'method': method, 'headers': {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'X-Lore-Character': 'c', 'X-Lore-Chat': 'codec-fixture'}}
        if path == '/connect':
            options['headers'].pop('X-Lore-Character'); options['headers'].pop('X-Lore-Chat')
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
    upstream()
    request('/connect', 'POST', {'selector': {'characterId': 'c', 'index': 0}})
    request('/wiki/persist', 'PATCH', {'page': {'title': 'Restart', 'body': 'Persisted across container restart'}, 'expectedRevision': 0})
    docker('restart', name)
    healthy()
    upstream()
    assert request('/wiki/persist')['body'] == 'Persisted across container restart'
    print('PASS container: UID 1000, read-only root, no network/host ports, persistent volume across restart')
finally:
    if created: docker('rm', '-f', name)
    docker('volume', 'rm', volume)
