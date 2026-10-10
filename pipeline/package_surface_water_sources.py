"""Package a fully audited Ukraine-only source dataset, never a deployment asset."""
import argparse
import gzip
import io
import json
from pathlib import Path
import tarfile

from prepare_surface_water_national import BOUNDARY_ATTRIBUTION, sha256, write_json


def package(inputs, boundary, archive):
    manifest = json.loads((inputs / 'inputs.json').read_text())
    requests = json.loads((inputs / 'requests.json').read_text())
    if not manifest['complete'] or manifest['missing']:
        raise ValueError('Cannot package incomplete national sources')
    if (sha256(boundary) != manifest['boundarySha256'] or
            sha256(inputs / 'requests.json') != manifest['requestsSha256']):
        raise ValueError('Coverage or requests changed since the source audit')
    expected = {j['id'] for j in requests['jobs']}
    files = manifest['files']
    if len(files) != len(expected) or {f['id'] for f in files} != expected:
        raise ValueError('Source audit does not cover every national request')
    receipts = []
    for entry in files:
        target = inputs / entry['file']
        receipt = json.loads((inputs / 'receipts' / (entry['id'] + '.json')).read_text())
        if (receipt['id'] != entry['id'] or receipt['file'] != entry['file'] or
                receipt['boundarySha256'] != manifest['boundarySha256'] or
                entry.get('nationalClipBoundarySha256') != manifest['boundarySha256'] or
                receipt['sha256'] != entry['sha256'] or sha256(target) != entry['sha256']):
            raise ValueError('Country-masked source changed since audit')
        receipts.append(receipt)
    clean = {**manifest, 'boundaryAttribution': BOUNDARY_ATTRIBUTION,
             'purpose': 'Audited Ukraine-only annual source rasters; not production tiles or catalogue',
             'files': [{k: v for k, v in entry.items() if k != 'downloadUrl'} for entry in files]}
    for entry in clean['files']:
        entry['nationalClipAttribution'] = BOUNDARY_ATTRIBUTION
    report = {'sourceVersion': manifest['sourceVersion'], 'complete': True,
              'years': requests['years'], 'chunkCount': len(requests['chunks']),
              'fileCount': len(files), 'rasterBytes': sum(e['bytes'] for e in files),
              'boundarySha256': manifest['boundarySha256'], 'boundaryAttribution': BOUNDARY_ATTRIBUTION,
              'sourceAttribution': requests['attribution'], 'crs': 'EPSG:4326',
              'classes': {'0': 'no-data, including foreign pixels', '1': 'dry',
                          '2': 'seasonal water', '3': 'permanent water'},
              'countryMask': 'Pinned oblast union at native pixel centres; includes Crimea',
              'analysisWarning': 'Neighbouring fragments overlap at native cells crossing integer-degree edges; do not sum fragment histograms',
              'publicationStatus': 'Source acquisition complete; production catalogue/tiles and delivery gates remain pending'}
    readme = ('Ukraine annual surface-water source archive, 1984–2024\n\n'
              + requests['attribution'] + '\n' + BOUNDARY_ATTRIBUTION + '\n\n'
              'JRC data: Copernicus Programme, free use with attribution.\n'
              'https://global-surface-water.appspot.com/download\n'
              'Boundary licensing/credits: https://www.geoboundaries.org/ and '
              'https://www.openstreetmap.org/copyright ; Natural Earth public domain.\n\n'
              'GeoTIFFs retain native categorical values inside Ukraine. Foreign pixels are 0.\n'
              'Receipt rawSha256 identifies the pristine downloaded raster; sha256 identifies the retained raster.\n'
              'These are source rasters, not published map tiles or accepted historical waterbody zones.\n'
              'No-data is not dry land. Annual observation completeness remains unknown.\n'
              'Do not sum fragment histograms: native edge cells occur in neighbouring fragments.\n')
    archive.parent.mkdir(parents=True, exist_ok=True)
    temporary = archive.with_suffix(archive.suffix + '.part')
    def json_bytes(value):
        return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False) + '\n').encode()
    with temporary.open('wb') as raw, gzip.GzipFile(fileobj=raw, mode='wb', filename='', mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode='w') as tar:
            def add(name, content):
                info = tarfile.TarInfo(name)
                info.mode = 0o644
                if isinstance(content, Path):
                    info.size = content.stat().st_size
                    with content.open('rb') as stream:
                        tar.addfile(info, stream)
                else:
                    info.size = len(content)
                    tar.addfile(info, io.BytesIO(content))
            add('README.txt', readme.encode())
            add('inputs.json', json_bytes(clean))
            add('requests.json', json_bytes(requests))
            add('download-report.json', json_bytes(report))
            add('oblasts.geojson', boundary)
            for entry in sorted(files, key=lambda e: e['id']):
                add(entry['file'], inputs / entry['file'])
            for receipt in sorted(receipts, key=lambda r: r['id']):
                add('receipts/' + receipt['id'] + '.json', json_bytes({
                    k: v for k, v in receipt.items() if k != 'downloadUrl'}))
    temporary.replace(archive)
    report.update(archive=archive.name, archiveBytes=archive.stat().st_size, archiveSha256=sha256(archive))
    write_json(inputs / 'download-report.json', report)
    archive.with_suffix(archive.suffix + '.sha256').write_text(report['archiveSha256'] + '  ' + archive.name + '\n')
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inputs', type=Path, required=True)
    parser.add_argument('--boundary', type=Path, default=Path('public/data/oblasts.geojson'))
    parser.add_argument('--archive', type=Path, required=True)
    args = parser.parse_args()
    package(args.inputs, args.boundary, args.archive)
