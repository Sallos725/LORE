"""Publish validated assets through GitHub/Gitea releases, draft first.

Credentials are supplied by Actions, never written to release assets or logs.
Already-published releases are immutable; use a new version instead of replacing.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
from urllib.error import HTTPError
from urllib.parse import quote, urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

class API:
    def __init__(self, forge, base, repo, token):
        if forge not in ('github', 'gitea') or not token:
            raise ValueError('Configure forge and release token')
        parsed = urlsplit(base)
        if parsed.scheme != 'https' or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError('Release API must be an HTTPS URL')
        if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repo):
            raise ValueError('Invalid repository')
        if forge == 'github' and base.rstrip('/') != 'https://api.github.com':
            raise ValueError('This publisher targets github.com')
        self.forge, self.base, self.repo, self.token = forge, base.rstrip('/'), repo, token
        self.prefix = '/repos/' + repo
        self.opener = build_opener(NoRedirect())

    def call(self, method, path, value=None, content_type='application/json', upload=False):
        base = 'https://uploads.github.com' if upload and self.forge == 'github' else self.base
        data = value if isinstance(value, bytes) else json.dumps(value).encode() if value is not None else None
        request = Request(base + self.prefix + path, data=data, method=method, headers={
            'Authorization': 'Bearer ' + self.token,
            'Accept': 'application/json', 'Content-Type': content_type,
            'User-Agent': 'LORE-release',
        })
        try:
            with self.opener.open(request, timeout=120) as response:
                raw = response.read(2 * 1024 * 1024)
                return response.status, json.loads(raw) if raw else None
        except HTTPError as error:
            # Do not echo server bodies, URLs with query credentials, or headers.
            return error.code, None

    def upload(self, release_id, path):
        endpoint = f'/releases/{release_id}/assets?name={quote(path.name, safe="")}'
        data = path.read_bytes()
        if self.forge == 'github':
            return self.call('POST', endpoint, data, 'application/octet-stream', upload=True)
        boundary = 'lore-' + secrets.token_hex(16)
        header = f'--{boundary}\r\nContent-Disposition: form-data; name="attachment"; filename="{path.name}"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode()
        return self.call('POST', endpoint, header + data + f'\r\n--{boundary}--\r\n'.encode(), 'multipart/form-data; boundary=' + boundary)

def checked(result, accepted=(200, 201)):
    status, value = result
    if status not in accepted:
        raise RuntimeError(f'Release API failed with HTTP {status}')
    return value

def publish(api, dist, expected_tag, commit):
    manifest = json.loads((dist / 'release.json').read_text())
    if not re.fullmatch(r'v\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?', expected_tag) or manifest['tag'] != expected_tag:
        raise ValueError('Release tag mismatch')
    if not re.fullmatch(r'[a-f0-9]{40}', commit):
        raise ValueError('Expected checked-out commit SHA')
    assets = manifest['assets']
    if len(assets) != 4 or len(set(assets)) != 4:
        raise ValueError('Expected four distinct release assets')
    for name in assets:
        if Path(name).name != name or not name.startswith('lore-'):
            raise ValueError('Unsafe asset name')
        if hashlib.sha256((dist / name).read_bytes()).hexdigest() != manifest['sha256'][name]:
            raise ValueError('Release checksum mismatch')
    sums = {name: hashlib.sha256((dist / name).read_bytes()).hexdigest() for name in assets + ['release.json']}
    expected_sums = ''.join(f'{value}  {name}\n' for name, value in sorted(sums.items()))
    if (dist / 'SHA256SUMS').read_text() != expected_sums:
        raise ValueError('SHA256SUMS mismatch')
    status, release = api.call('GET', '/releases/tags/' + quote(expected_tag, safe=''))
    if status == 404:
        release = checked(api.call('POST', '/releases', {
            'tag_name': expected_tag, 'target_commitish': commit, 'name': 'LORE ' + expected_tag,
            'draft': True, 'prerelease': '-' in expected_tag,
            'body': 'Lite runs in the browser; Full uses a persistent sidecar. This alpha adds grounded LLM extraction, bounded chat collection, budget-checked memory injection, and hierarchical wiki editing with aliases and links. No PocketRisu modifications or rebuilds are required. Lite calls the selected memory LLM directly; Full uses HTTP(S) to its sidecar, which calls the selected provider. Saved history is reconciled at the next request; injection supports legacy OpenAI-compatible text requests using a conservative budget estimate. Server outbox/proxy and real-device Safari verification remain pending. See README, docs/automation.md and SHA256SUMS.',
        }))
    else:
        checked((status, release))
    if not release.get('draft'):
        raise ValueError('Release already published; use a new version, never replace public assets')
    if release.get('target_commitish') not in (None, '', commit):
        raise ValueError('Draft belongs to a different commit')
    release_id = release['id']
    for page in range(1, 101):
        existing = checked(api.call('GET', f'/releases/{release_id}/assets?per_page=100&limit=100&page={page}'))
        for asset in existing:
            if asset['name'] in assets + ['release.json', 'SHA256SUMS']:
                checked(api.call('DELETE', f'/releases/{release_id}/assets/{asset["id"]}'), (204, 200))
        if len(existing) < 100:
            break
    else:
        raise ValueError('Too many assets in draft')
    for name in assets + ['release.json', 'SHA256SUMS']:
        checked(api.upload(release_id, dist / name))
        print('Uploaded', name)
    checked(api.call('PATCH', f'/releases/{release_id}', {'draft': False}))
    print('Published', expected_tag)

if __name__ == '__main__':
    api = API(os.environ['RELEASE_FORGE'], os.environ['RELEASE_API_URL'], os.environ['RELEASE_REPO'], os.environ['RELEASE_TOKEN'])
    publish(api, Path('dist'), os.environ['RELEASE_TAG'], os.environ['RELEASE_SHA'])
