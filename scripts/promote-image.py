"""Copy the validated release index to latest without rebuilding either platform."""
import argparse
import json
from pathlib import Path
import re
import subprocess

IMAGES = {'ghcr.io/sallos725/lore', 'gitea.grantos.m1ndb3nd3r.com/m1ndb3nd3r/lore'}

def promote(image, tag, run=subprocess.run):
    if image not in IMAGES or not re.fullmatch(r'v\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?', tag):
        raise ValueError('Expected a LORE registry and version tag')
    version = json.loads((Path(__file__).resolve().parents[1] / 'package.json').read_text())['version']
    if tag != 'v' + version:
        raise ValueError('Only the current project version may update latest')
    source, target = image + ':' + tag, image + ':latest'
    def inspect(ref):
        result = run(['docker', 'buildx', 'imagetools', 'inspect', '--raw', ref], check=True, capture_output=True, text=True)
        value = json.loads(result.stdout)
        platforms = {(m.get('platform', {}).get('os'), m.get('platform', {}).get('architecture')) for m in value.get('manifests', [])}
        if not {('linux', 'amd64'), ('linux', 'arm64')} <= platforms:
            raise ValueError('Release must include linux/amd64 and linux/arm64')
        return value
    manifest = inspect(source)
    # One source index preserves both platform images and attestations.
    run(['docker', 'buildx', 'imagetools', 'create', '--tag', target, source], check=True)
    if inspect(target) != manifest:
        raise ValueError('latest differs from the published release index')
    print(f'Verified {target} -> {source}: identical multi-platform index')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--image', required=True)
    parser.add_argument('--tag', required=True)
    args = parser.parse_args()
    promote(args.image, args.tag)
