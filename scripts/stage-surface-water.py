"""Checksum-verify a release and stage same-origin static assets into a fresh build.

Standard library only; no geospatial processing or authentication in CI/browser.
The archive hash must be independently pinned by the authorized release operator.
"""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import tarfile
import tempfile


def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024*1024), b''):
            result.update(block)
    return result.hexdigest()


def safe(name):
    p = PurePosixPath(name)
    if not name or p.is_absolute() or str(p) != name or any(c in {'.', '..'} for c in p.parts):
        raise ValueError('Unsafe archive path')
    return p


def stage(archive, checksum, site):
    if len(checksum) != 64 or any(c not in '0123456789abcdef' for c in checksum) or digest(archive) != checksum:
        raise ValueError('Pinned archive SHA-256 mismatch')
    destination = site/'data/surface-water'
    if destination.exists():
        raise ValueError('Stage into a fresh site build; existing feature is preserved')
    site.mkdir(parents=True, exist_ok=True)
    destination.parent.mkdir(parents=True, exist_ok=True)
    base_bytes = sum(p.stat().st_size for p in site.rglob('*') if p.is_file())
    with tempfile.TemporaryDirectory(prefix='.surface-water-', dir=destination.parent) as temporary:
        root = Path(temporary)
        seen, total = set(), 0
        with tarfile.open(archive, mode='r|gz') as tar:
            first = tar.next()
            if first.name != 'FILES.json' or not first.isfile() or first.size > 100_000_000:
                raise ValueError('Archive checksum table must be first and bounded')
            table = json.load(tar.extractfile(first))
            if table['schemaVersion'] != 1 or not table['files']:
                raise ValueError('Invalid release checksum table')
            version = table['version']
            if len(version) != 20 or any(c not in '0123456789abcdef' for c in version):
                raise ValueError('Invalid immutable version')
            expected = table['files']
            for name, record in expected.items():
                safe(name)
                if (name != 'current.json' and not name.startswith(f'versions/{version}/') or
                        type(record['bytes']) is not int or record['bytes'] <= 0 or
                        len(record['sha256']) != 64):
                    raise ValueError('Invalid release file record')
            total = sum(r['bytes'] for r in expected.values())
            archive_unpacked = first.size+total
            if archive_unpacked > 750_000_000:
                raise ValueError('Feature exceeds 750 MB')
            while (member := tar.next()) is not None:
                if not member.isfile() or member.name not in expected or member.name in seen:
                    raise ValueError('Unexpected, linked or duplicate archive member')
                seen.add(member.name)
                record = expected[member.name]
                if member.size != record['bytes']:
                    raise ValueError('Archive member size mismatch')
                path = root.joinpath(*safe(member.name).parts)
                path.parent.mkdir(parents=True, exist_ok=True)
                with tar.extractfile(member) as source, path.open('wb') as target:
                    shutil.copyfileobj(source, target, length=1024*1024)
                if digest(path) != record['sha256']:
                    raise ValueError('Archive member checksum mismatch')
            if seen != set(expected):
                raise ValueError('Missing archive members')
        pointer = json.loads((root/'current.json').read_text())
        manifest_path = root/f'versions/{version}/manifest.json'
        manifest = json.loads(manifest_path.read_text())
        if (pointer['version'] != version or manifest['version'] != version or
                pointer['url'] != f'versions/{version}/manifest.json' or
                pointer['sha256'] != digest(manifest_path) or pointer['bytes'] != manifest_path.stat().st_size or
                manifest['schemaVersion'] != 1 or manifest['years'] != list(range(1984, 2025))):
            raise ValueError('Incoherent release pointer/manifest')
        feature_root = manifest_path.parent
        def ref(record):
            name = f'versions/{version}/{record["url"]}'
            safe(name)
            if (name not in expected or expected[name]['sha256'] != record['sha256'] or
                    expected[name]['bytes'] != record['bytes']):
                raise ValueError('Manifest reference differs from archive table')
            return feature_root/record['url']
        for record in [manifest['analysisZones'], manifest['zoneReview'], manifest['registrationSensitivity'],
                       *(b['series'] for b in manifest['catalogue'])]:
            ref(record)
        for grid in [*manifest['chunks'], manifest['overview']]:
            if [f['year'] for f in grid['frames']] != list(range(1984, 2025)):
                raise ValueError('Incomplete render timeline')
            for frame in grid['frames']:
                index = json.loads(ref(frame).read_text())
                if index['version'] != version or index['year'] != frame['year']:
                    raise ValueError('Incoherent frame version')
                for tile in index['tiles']:
                    ref(tile)
        if base_bytes+total > 900_000_000:
            raise ValueError('Complete Pages site exceeds 900 MB')
        # The transport checksum table is verified but is not a browser asset.
        root.rename(destination)
    return {'version': version, 'featureBytes': total, 'siteBytes': base_bytes+total,
            'archiveUnpackedBytes': archive_unpacked,
            'destination': str(destination.resolve()), 'verified': True}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--sha256', required=True)
    parser.add_argument('--site', type=Path, default=Path('dist'))
    args = parser.parse_args()
    print(json.dumps(stage(args.archive, args.sha256, args.site), indent=2))
