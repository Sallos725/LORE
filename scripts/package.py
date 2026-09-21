"""Build reproducible, allowlisted release assets; never include data or secrets."""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import tarfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]

def build(tag=None):
    version = json.loads((ROOT / 'package.json').read_text())['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?', version):
        raise ValueError('Invalid version')
    expected = 'v' + version
    if tag is not None and tag != expected:
        raise ValueError(f'Tag must match package.json: {expected}')
    dist = ROOT / 'dist'
    dist.mkdir(exist_ok=True)
    assets = []
    for edition, source in [('lite', 'lite/lore-lite.js'), ('full', 'full/plugin/lore-full.js')]:
        data = (ROOT / source).read_bytes()
        if f'//@version {version}\n'.encode() not in data:
            raise ValueError('Rebuild plugins before packaging')
        name = f'lore-{edition}-{expected}.js'
        (dist / name).write_bytes(data)
        assets.append(name)
    common = ['package.json', 'LICENSE', 'README.md', 'run.sh', 'docs/memory-evaluation.json']
    common += [str(p.relative_to(ROOT)) for folder in ('server', 'shared', 'docs') for p in sorted((ROOT / folder).glob('*.m*'))]
    # Include .md documentation, as well as executable .mjs modules.
    common = sorted(set(common))
    server_name = f'lore-server-{expected}.tar.gz'
    with (dist / server_name).open('wb') as out, gzip.GzipFile(filename='', mode='wb', fileobj=out, mtime=0) as gz, tarfile.open(fileobj=gz, mode='w') as archive:
        for name in common:
            data = (ROOT / name).read_bytes()
            info = tarfile.TarInfo(name)
            info.size = len(data)
            info.mode = 0o755 if name == 'run.sh' else 0o644
            archive.addfile(info, io.BytesIO(data))
    assets.append(server_name)
    full_name = f'lore-full-{expected}.zip'
    files = common + ['Dockerfile', '.dockerignore', 'docker-compose.yml', 'docker-compose.http.yml', '.env.example', 'full/plugin/lore-full.js']
    for zip_name, members in [(full_name, files)]:
        with zipfile.ZipFile(dist / zip_name, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            for name in members:
                info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = (0o100755 if name == 'run.sh' else 0o100644) << 16
                archive.writestr(info, (ROOT / name).read_bytes())
        assets.append(zip_name)
    checksums = {name: hashlib.sha256((dist / name).read_bytes()).hexdigest() for name in assets}
    manifest = {'version': version, 'tag': expected, 'assets': assets, 'sha256': checksums}
    (dist / 'release.json').write_text(json.dumps(manifest, indent=2) + '\n')
    checksums['release.json'] = hashlib.sha256((dist / 'release.json').read_bytes()).hexdigest()
    (dist / 'SHA256SUMS').write_text(''.join(f'{value}  {name}\n' for name, value in sorted(checksums.items())))
    print(f'Built {expected}: {len(assets)} assets + manifest + SHA256SUMS')
    return manifest

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--tag')
    build(parser.parse_args().tag)
