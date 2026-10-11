"""Merge expanded Kremenchuk exports into a new audited prototype input set.

Keep initial inputs and the downloaded ZIP intact. Only the expected seven TIFFs
and provenance are read from ZIP; archive paths never become filesystem paths.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import tempfile
import zipfile
from contextlib import ExitStack

from audit_earth_engine_surface_water import COLLECTIONS, audit

ROOT = Path(__file__).resolve().parent


def merge(base, archive, output):
    archives = [archive] if isinstance(archive, Path) else archive
    if output.exists():
        raise ValueError('Choose a new output directory to preserve previous inputs')
    original = json.loads((base / 'yearly-source-provenance.geojson').read_text())
    names = {f'kremenchuk-yearly-{y}.tif' for y in COLLECTIONS}
    names.add('yearly-source-provenance.geojson')
    with ExitStack() as stack:
        selected = {}
        for path in archives:
            z = stack.enter_context(zipfile.ZipFile(path))
            if z.testzip() is not None:
                raise ValueError('ZIP integrity check failed')
            for member in z.infolist():
                if member.is_dir() or '__MACOSX' in member.filename:
                    continue
                name = Path(member.filename).name
                if name in names:
                    if name in selected:
                        raise ValueError('Duplicate expected export in ZIP')
                    selected[name] = (z, member)
        def read(name):
            z, member = selected[name]
            return z.read(member)
        if set(selected) != names:
            raise ValueError(f'Expanded archive is incomplete: missing {sorted(names-set(selected))}')
        expanded = json.loads(read('yearly-source-provenance.geojson'))
        keys = [(f['properties']['waterbodyId'], f['properties']['year']) for f in expanded['features']]
        if len(keys) != 7 or set(keys) != {('kremenchuk', y) for y in COLLECTIONS}:
            raise ValueError('Expected exactly seven expanded Kremenchuk provenance rows')
        if any(json.loads(f['properties']['downloadEnvelope']) != [31.35, 48.9, 33.3, 49.85]
               for f in expanded['features']):
            raise ValueError('Archive provenance does not describe the expanded envelope')
        combined = {**original, 'features': [f for f in original['features']
                    if f['properties']['waterbodyId'] != 'kremenchuk']+expanded['features']}
        output.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='surface-water-import-', dir=output.parent) as tmp:
            staged = Path(tmp) / 'inputs'
            staged.mkdir()
            for feature in combined['features']:
                p = feature['properties']
                name = p['file']
                if name != f"{p['waterbodyId']}-yearly-{p['year']}.tif":
                    raise ValueError('Unexpected export filename')
                if p['waterbodyId'] == 'kremenchuk':
                    (staged / name).write_bytes(read(name))
                else:
                    shutil.copy2(base / name, staged / name)
            (staged / 'yearly-source-provenance.geojson').write_text(json.dumps(combined)+'\n')
            audit(staged, staged / 'inputs.json')
            (staged / 'import-provenance.json').write_text(json.dumps({
                'archives': [{'file': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
                             for path in archives],
                'initialProvenanceSha256': hashlib.sha256((base / 'yearly-source-provenance.geojson').read_bytes()).hexdigest(),
                'method': 'Replace exactly the seven Kremenchuk annual exports; preserve other bodies'
            }, indent=2)+'\n')
            staged.rename(output)
    print('Expanded sources imported and audited:', output)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', type=Path, default=ROOT / 'data/raw/surface-water/earth-engine')
    parser.add_argument('--archive', type=Path, nargs='+', required=True)
    parser.add_argument('--output', type=Path, default=ROOT / 'data/raw/surface-water/earth-engine-extended')
    args = parser.parse_args()
    merge(args.base, args.archive, args.output)
