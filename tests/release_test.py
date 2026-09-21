import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('publish', Path(__file__).resolve().parents[1] / 'scripts/publish.py')
publish = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publish)

class FakeAPI:
    def __init__(self, fail_upload=False, published=False):
        self.calls = []
        self.fail_upload, self.published = fail_upload, published
    def call(self, method, path, value=None):
        self.calls.append((method, path, value))
        if '/tags/' in path:
            return (200, {'id': 1, 'draft': False}) if self.published else (404, None)
        if method == 'POST':
            return 201, {'id': 1, 'draft': True, **value}
        if '/assets?' in path:
            return 200, []
        return 200, {}
    def upload(self, release_id, path):
        self.calls.append(('UPLOAD', path.name, None))
        return (500, None) if self.fail_upload else (201, {'id': 2})

class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.dist = Path(self.temp.name)
        assets = ['lore-lite.js', 'lore-full.js', 'lore-full.zip', 'lore-server.tar.gz', 'lore-pocketrisu-host.zip']
        for name in assets:
            (self.dist / name).write_bytes(b'fixture')
        checksums = {name: hashlib.sha256((self.dist / name).read_bytes()).hexdigest() for name in assets}
        (self.dist / 'release.json').write_text(json.dumps({'tag': 'v0.1.0-alpha.1', 'assets': assets, 'sha256': checksums}))
        checksums['release.json'] = hashlib.sha256((self.dist / 'release.json').read_bytes()).hexdigest()
        (self.dist / 'SHA256SUMS').write_text(''.join(f'{value}  {name}\n' for name, value in sorted(checksums.items())))
    def run_publish(self, api, tag='v0.1.0-alpha.1'):
        publish.publish(api, self.dist, tag, 'a' * 40)
    def test_draft_only_becomes_public_after_all_uploads(self):
        api = FakeAPI()
        self.run_publish(api)
        self.assertEqual(api.calls[-1], ('PATCH', '/releases/1', {'draft': False}))
        self.assertEqual(sum(call[0] == 'UPLOAD' for call in api.calls), 7)
        create = next(call for call in api.calls if call[:2] == ('POST', '/releases'))
        self.assertTrue(create[2]['prerelease'])
    def test_upload_failure_keeps_release_draft(self):
        api = FakeAPI(fail_upload=True)
        with self.assertRaises(RuntimeError): self.run_publish(api)
        self.assertFalse(any(call[0] == 'PATCH' for call in api.calls))
    def test_published_assets_are_never_overwritten(self):
        api = FakeAPI(published=True)
        with self.assertRaises(ValueError): self.run_publish(api)
        self.assertEqual(len(api.calls), 1)
    def test_mismatched_tag_and_corruption_fail_before_network(self):
        api = FakeAPI()
        with self.assertRaises(ValueError): self.run_publish(api, 'v9.0.0')
        (self.dist / 'lore-lite.js').write_bytes(b'changed')
        with self.assertRaises(ValueError): self.run_publish(api)
        self.assertEqual(api.calls, [])
    def test_transport_rejects_credential_urls_and_invalid_repo(self):
        for url, repo in [('http://example.com', 'a/b'), ('https://user:pass@example.com', 'a/b'), ('https://example.com', '../b/c')]:
            with self.assertRaises(ValueError): publish.API('gitea', url, repo, 'test')

if __name__ == '__main__': unittest.main()
