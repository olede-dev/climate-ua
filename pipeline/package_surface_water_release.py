"""Package a coherent immutable local release with a complete checksum table."""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import tarfile

from prepare_surface_water_national import sha256, write_json


def package(inputs, archive):
    pointer = json.loads((inputs/'current.json').read_text())
    root = inputs/'versions'/pointer['version']
    manifest = json.loads((root/'manifest.json').read_text())
    if (manifest['version'] != pointer['version'] or sha256(root/'manifest.json') != pointer['sha256']
            or manifest['years'] != list(range(1984, 2025)) or not 10 <= len(manifest['catalogue']) <= 20):
        raise ValueError('Invalid selected release')
    files = {str(p.relative_to(inputs)): {'bytes': p.stat().st_size, 'sha256': sha256(p)}
             for p in sorted(root.rglob('*')) if p.is_file()}
    files['current.json'] = {'bytes': (inputs/'current.json').stat().st_size, 'sha256': sha256(inputs/'current.json')}
    def validate_ref(record):
        relative = f'versions/{pointer["version"]}/'+record['url']
        if relative not in files or any(files[relative][k] != record[k] for k in ('bytes', 'sha256')):
            raise ValueError('Immutable release reference changed before packaging')
        return inputs/relative
    for record in [manifest['analysisZones'], manifest['zoneReview'], manifest['registrationSensitivity'],
                   *(b['series'] for b in manifest['catalogue'])]:
        validate_ref(record)
    for grid in [*manifest['chunks'], manifest['overview']]:
        if [f['year'] for f in grid['frames']] != list(range(1984, 2025)):
            raise ValueError('Incomplete release render timeline')
        for record in grid['frames']:
            frame = json.loads(validate_ref(record).read_text())
            if frame['version'] != pointer['version'] or frame['year'] != record['year']:
                raise ValueError('Mixed release frame version')
            for tile in frame['tiles']:
                validate_ref(tile)
    table = (json.dumps({'schemaVersion': 1, 'version': pointer['version'], 'files': files},
                        sort_keys=True, separators=(',', ':'))+'\n').encode()
    total = sum(f['bytes'] for f in files.values())+len(table)
    if total > 750_000_000:
        raise ValueError('Feature size gate exceeded')
    archive.parent.mkdir(parents=True, exist_ok=True)
    staged = archive.with_suffix(archive.suffix+'.part')
    with staged.open('wb') as raw:
        with gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0) as zipped:
            with tarfile.open(fileobj=zipped, mode='w|', format=tarfile.USTAR_FORMAT) as tar:
                # The verifier streams this first without retaining raster assets.
                for name in ['FILES.json', *sorted(files)]:
                    info = tarfile.TarInfo(name)
                    info.size = len(table) if name == 'FILES.json' else files[name]['bytes']
                    info.mode = 0o644
                    info.mtime = info.uid = info.gid = 0
                    info.uname = info.gname = ''
                    if name == 'FILES.json':
                        tar.addfile(info, io.BytesIO(table))
                    else:
                        with (inputs/name).open('rb') as stream:
                            tar.addfile(info, stream)
    seen = set()
    with tarfile.open(staged, 'r|gz') as tar:
        for member in tar:
            expected = {'bytes': len(table), 'sha256': hashlib.sha256(table).hexdigest()} if member.name == 'FILES.json' else files.get(member.name)
            if not member.isfile() or member.name in seen or expected is None:
                raise ValueError('Unexpected release archive member')
            seen.add(member.name)
            digest = hashlib.sha256()
            with tar.extractfile(member) as stream:
                for block in iter(lambda: stream.read(1024*1024), b''):
                    digest.update(block)
            if member.size != expected['bytes'] or digest.hexdigest() != expected['sha256']:
                raise ValueError('Release changed during packaging')
    if seen != {'FILES.json', *files}:
        raise ValueError('Incomplete release archive')
    staged.replace(archive)
    digest = sha256(archive)
    archive.with_suffix(archive.suffix+'.sha256').write_text(f'{digest}  {archive.name}\n')
    report = {'version': pointer['version'], 'archive': str(archive.resolve()), 'archiveSha256': digest,
              'archiveBytes': archive.stat().st_size, 'featureBytes': total, 'files': len(files)+1,
              'status': 'Verified local release archive; no external publication'}
    write_json(inputs/'release-archive-report.json', report)
    print(report, flush=True)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inputs', type=Path, default=Path(__file__).resolve().parent/'data/raw/surface-water/release')
    parser.add_argument('--archive', type=Path, required=True)
    args = parser.parse_args()
    package(args.inputs, args.archive)
