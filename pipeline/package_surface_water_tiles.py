"""Package verified national native tiles as portable local evidence.

This archive is not a production release: catalogue and overview gates remain
mandatory. Only manifest-referenced assets enter it; stale output files do not.
"""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import tarfile

from prepare_surface_water_national import YEARS, sha256, write_json


def local_path(root, name):
    p = PurePosixPath(name)
    if not name or p.is_absolute() or any(part in {'.', '..'} for part in p.parts) or str(p) != name:
        raise ValueError('Unsafe relative asset reference')
    target = root.joinpath(*p.parts)
    if target.is_symlink() or not target.resolve().is_relative_to(root.resolve()):
        raise ValueError('Asset must remain inside build directory')
    return target


def inventory(inputs):
    manifest_path = inputs/'national-tiles.json'
    manifest = json.loads(manifest_path.read_text())
    if (manifest['schemaVersion'] != 1 or manifest['encoding'] != 'packed4-gzip' or
            manifest['tileSize'] != 512 or not manifest['completeTimeline'] or
            manifest['years'] != list(YEARS) or
            manifest['status'] != 'local-build-evidence; catalogue and publication gates pending'):
        raise ValueError('Expected complete supported native local-build manifest')
    files = {'national-tiles.json': {'sha256': sha256(manifest_path), 'bytes': manifest_path.stat().st_size}}
    chunks = manifest['chunks']
    if not chunks or len({c['id'] for c in chunks}) != len(chunks):
        raise ValueError('Expected unique national chunks')
    tile_names = set()
    for chunk in chunks:
        path = local_path(inputs, chunk['url'])
        if path.stat().st_size != chunk['bytes'] or sha256(path) != chunk['sha256']:
            raise ValueError('Chunk index changed since manifest')
        if chunk['url'] in files:
            raise ValueError('Duplicate chunk reference')
        files[chunk['url']] = {k: chunk[k] for k in ('sha256', 'bytes')}
        index = json.loads(path.read_text())
        identity = {k: manifest[k] for k in ('processingVersion', 'builderSha256', 'auditSha256', 'boundarySha256', 'years')}
        if (index['id'] != chunk['id'] or index['stamp']['buildIdentity'] != identity or
                any(index[k] != chunk[k] for k in ('width', 'height', 'transform')) or
                [f['year'] for f in index['frames']] != list(YEARS) or
                [s['year'] for s in index['stamp']['sources']] != list(YEARS)):
            raise ValueError('Incoherent annual index version or grid')
        referenced = set()
        reference_windows = None
        for frame in index['frames']:
            windows = []
            for tile in frame['tiles']:
                x, y, w, h = (tile[k] for k in ('x', 'y', 'width', 'height'))
                if (any(type(v) is not int for v in (x, y, w, h)) or
                        x < 0 or y < 0 or x % 512 or y % 512 or
                        not 0 < w <= 512 or not 0 < h <= 512 or
                        w != min(512, index['width']-x) or h != min(512, index['height']-y)):
                    raise ValueError('Invalid native tile window')
                windows.append((x, y, w, h))
                referenced.add(tile['asset'])
                if tile['asset'] not in index['assets']:
                    raise ValueError('Missing immutable tile reference')
            if len(set(windows)) != len(windows):
                raise ValueError('Duplicate annual native tile window')
            if reference_windows is None:
                reference_windows = windows
            if windows != reference_windows:
                raise ValueError('Annual rendering masks/windows differ')
            counts = frame['counts']
            if len(counts) != 4 or any(type(n) is not int or n < 0 for n in counts):
                raise ValueError('Invalid annual class counts')
        if referenced != set(index['assets']):
            raise ValueError('Index includes unreferenced immutable assets')
        for digest, asset in index['assets'].items():
            expected_url = f'tiles/{digest[:2]}/{digest}.bin.gz'
            if (len(digest) != 64 or any(c not in '0123456789abcdef' for c in digest) or
                    asset['sha256'] != digest or asset['url'] != expected_url or
                    type(asset['bytes']) is not int or asset['bytes'] <= 0):
                raise ValueError('Invalid content-addressed asset')
            local_path(inputs, asset['url'])
            record = {k: asset[k] for k in ('sha256', 'bytes')}
            if asset['url'] in files and files[asset['url']] != record:
                raise ValueError('Conflicting immutable asset record')
            files[asset['url']] = record
            tile_names.add(asset['url'])
    if len(tile_names) != manifest['uniqueTiles']:
        raise ValueError('National unique-tile count mismatch')
    total = sum(f['bytes'] for f in files.values())
    if total - files['national-tiles.json']['bytes'] != manifest['featureBytesExcludingManifest']:
        raise ValueError('National feature size mismatch')
    for name, record in sorted(files.items()):
        path = local_path(inputs, name)
        if path.stat().st_size != record['bytes'] or sha256(path) != record['sha256']:
            raise ValueError('Immutable asset changed since manifest')
    return manifest, files


def package(inputs, archive):
    manifest, files = inventory(inputs)
    if sum(f['bytes'] for f in files.values()) > 750_000_000:
        raise ValueError('Native feature storage gate exceeded; stop packaging')
    prefix = 'surface-water/' + files['national-tiles.json']['sha256'][:16] + '/'
    credits = (manifest['attribution']+'\n'+manifest['boundaryAttribution']+'\n'
               'Classes: EC JRC/Google Global Surface Water YearlyHistory.\n'
               'Pekel et al. (2016), doi:10.1038/nature20584.\n'
               'Boundary: © OpenStreetMap contributors, ODbL-1.0; Natural Earth public domain.\n'
               'Local native-detail evidence only. Catalogue, overview and publication gates pending.\n').encode()
    generated = {'CREDITS.txt': credits}
    expected = {prefix+name: record for name,record in files.items()}
    expected.update({prefix+name: {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
                     for name,data in generated.items()})
    archive.parent.mkdir(parents=True, exist_ok=True)
    staged = archive.with_suffix(archive.suffix+'.part')
    with staged.open('wb') as raw:
        with gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0) as zipped:
            with tarfile.open(fileobj=zipped, mode='w|', format=tarfile.USTAR_FORMAT) as tar:
                for name in sorted(expected):
                    relative = name[len(prefix):]
                    info = tarfile.TarInfo(name)
                    info.size = expected[name]['bytes']
                    info.mode = 0o644
                    info.mtime = info.uid = info.gid = 0
                    info.uname = info.gname = ''
                    if relative in generated:
                        tar.addfile(info, io.BytesIO(generated[relative]))
                    else:
                        with local_path(inputs, relative).open('rb') as source:
                            tar.addfile(info, source)
    # Verify streams without extraction; detect input mutations during packing.
    seen = set()
    with tarfile.open(staged, mode='r|gz') as tar:
        for member in tar:
            if not member.isfile() or member.name not in expected or member.name in seen:
                raise ValueError('Unexpected archive member')
            seen.add(member.name)
            digest = hashlib.sha256()
            with tar.extractfile(member) as stream:
                for block in iter(lambda: stream.read(1024*1024), b''):
                    digest.update(block)
            record = expected[member.name]
            if member.size != record['bytes'] or digest.hexdigest() != record['sha256']:
                raise ValueError('Archive member checksum mismatch')
    if seen != set(expected):
        raise ValueError('Archive missing required member')
    staged.replace(archive)
    checksum = sha256(archive)
    sidecar = archive.with_suffix(archive.suffix+'.sha256')
    sidecar.write_text(f'{checksum}  {archive.name}\n')
    report = {'status': 'Verified portable native-tile evidence; not a production release',
              'archive': str(archive.resolve()), 'archiveSha256': checksum,
              'archiveBytes': archive.stat().st_size, 'unpackedBytes': sum(f['bytes'] for f in expected.values()),
              'memberCount': len(expected), 'assetPrefix': prefix,
              'manifestSha256': files['national-tiles.json']['sha256'], 'years': list(YEARS)}
    write_json(inputs/'tile-archive-report.json', report)
    print(report, flush=True)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inputs', type=Path, default=Path(__file__).resolve().parent/'data/raw/surface-water/national-packed4-v1')
    parser.add_argument('--archive', type=Path, required=True)
    args = parser.parse_args()
    package(args.inputs, args.archive)
