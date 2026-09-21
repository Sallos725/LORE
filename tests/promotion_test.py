import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('promotion', ROOT / 'scripts/promote-image.py')
promotion = importlib.util.module_from_spec(spec)
spec.loader.exec_module(promotion)
TAG = 'v' + json.loads((ROOT / 'package.json').read_text())['version']
IMAGE = 'ghcr.io/sallos725/lore'

class PromotionTests(unittest.TestCase):
    def test_copies_the_complete_index_and_verifies_latest(self):
        manifest = {'manifests': [{'digest': 'amd', 'platform': {'os': 'linux', 'architecture': 'amd64'}}, {'digest': 'arm', 'platform': {'os': 'linux', 'architecture': 'arm64'}}, {'digest': 'attestation', 'platform': {'os': 'unknown', 'architecture': 'unknown'}}]}
        calls = []
        def run(args, **kwargs):
            calls.append(args)
            return SimpleNamespace(stdout=json.dumps(manifest))
        promotion.promote(IMAGE, TAG, run)
        self.assertEqual(calls[1], ['docker', 'buildx', 'imagetools', 'create', '--tag', IMAGE + ':latest', IMAGE + ':' + TAG])
        self.assertEqual(calls[2][-1], IMAGE + ':latest')
    def test_rejects_single_architecture_before_moving_latest(self):
        calls = []
        def run(args, **kwargs):
            calls.append(args)
            return SimpleNamespace(stdout='{"manifests":[{"platform":{"os":"linux","architecture":"amd64"}}]}')
        with self.assertRaises(ValueError): promotion.promote(IMAGE, TAG, run)
        self.assertEqual(len(calls), 1)
    def test_rejects_wrong_version_or_registry_without_network(self):
        def run(*args, **kwargs): self.fail('must reject before network')
        for image, tag in [(IMAGE, 'latest'), (IMAGE, 'v999.0.0'), ('unrelated/image', TAG), (IMAGE, 'v1.0.0;echo unsafe')]:
            with self.assertRaises(ValueError): promotion.promote(image, tag, run)

if __name__ == '__main__': unittest.main()
