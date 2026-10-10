"""Validate and assemble one immutable local release; never publish it.

Only reviewed, complete zones enter the catalogue. The browser frame contract
splits native indexes by year so a viewport never downloads 41 years of tiles.
Large assets remain ignored; the committed pointer alone selects a version.
"""
import argparse
from itertools import combinations
import json
import math
import os
from pathlib import Path

from shapely.geometry import shape

from build_surface_water_national import compact_json
from package_surface_water_tiles import inventory
from prepare_surface_water_national import YEARS, collection, sha256, write_json

PROCESSING_VERSION = 'surface-water-release-1'


def close(a, b):
    if not math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-5):
        raise ValueError('Area partition mismatch')


def validate_series(body, zone_m2):
    if [a['year'] for a in body['annual']] != list(YEARS):
        raise ValueError('Incomplete or duplicate annual timeline')
    if [(p['beforeYear'], p['afterYear']) for p in body['pairs']] != list(combinations(YEARS, 2)):
        raise ValueError('Incomplete or duplicate common-mask comparisons')
    annual = {a['year']: a for a in body['annual']}
    def totals(areas, valid):
        for key in ('permanentM2', 'seasonalM2', 'unionM2'):
            if not isinstance(areas[key], (int, float)) or not math.isfinite(areas[key]) or areas[key] < 0:
                raise ValueError('Invalid class area')
        close(areas['unionM2'], areas['permanentM2']+areas['seasonalM2'])
        if areas['unionM2'] > valid+max(1e-5, zone_m2*1e-9):
            raise ValueError('Water exceeds valid mask')
    for row in [*body['annual'], *body['pairs']]:
        close(row['zoneM2'], zone_m2)
        if (not math.isfinite(row['validM2']) or not 0 <= row['validM2'] <= zone_m2*(1+1e-9)
                or not math.isfinite(row['coverage']) or not 0 <= row['coverage'] <= 1+1e-9
                or row['temporalCompleteness'] != 'unknown'):
            raise ValueError('Invalid observation quality')
        close(row['coverage'], row['validM2']/zone_m2)
        expected = 'complete' if row['coverage']+1e-12 >= .95 else 'partial' if row['coverage']+1e-12 >= .8 else 'suppressed'
        if row['spatialStatus'] != expected:
            raise ValueError('Quality threshold mismatch')
        value = row['areas'] if 'year' in row else row['comparison']
        if (value is None) != (expected == 'suppressed'):
            raise ValueError('Suppressed observations must be null')
        if 'year' not in row:
            if row['validM2'] > min(annual[row['beforeYear']]['validM2'], annual[row['afterYear']]['validM2'])+zone_m2*1e-9:
                raise ValueError('Pair mask exceeds standalone validity')
        if value is None:
            continue
        if 'year' in row:
            totals(value, row['validM2'])
        else:
            totals(value['before'], row['validM2'])
            totals(value['after'], row['validM2'])
            for key in ('gainedM2', 'lostM2', 'persistentM2', 'permanentToSeasonalM2', 'seasonalToPermanentM2'):
                if not math.isfinite(value[key]) or not 0 <= value[key] <= row['validM2']*(1+1e-9):
                    raise ValueError('Invalid pair partition')
            close(value['before']['unionM2'], value['persistentM2']+value['lostM2'])
            close(value['after']['unionM2'], value['persistentM2']+value['gainedM2'])
            close(value['deltaM2'], value['gainedM2']-value['lostM2'])
            close(value['deltaM2'], value['after']['unionM2']-value['before']['unionM2'])
            if value['permanentToSeasonalM2']+value['seasonalToPermanentM2'] > value['persistentM2']+zone_m2*1e-9:
                raise ValueError('Transitions exceed persistent water')
            baseline = value['before']['unionM2']
            if baseline == 0:
                if value['deltaPercent'] is not None:
                    raise ValueError('Zero baseline percentage must be null')
            else:
                close(value['deltaPercent'], 100*value['deltaM2']/baseline)


def reference(root, path):
    return {'url': str(path.relative_to(root)), 'sha256': sha256(path), 'bytes': path.stat().st_size}


def build(native, overview, zones, areas, review, output):
    reviewed = json.loads(review.read_text())
    registry, numeric = json.loads(zones.read_text()), json.loads(areas.read_text())
    ids = [f['properties']['id'] for f in registry['features']]
    if (not 10 <= len(ids) <= 20 or len(set(ids)) != len(ids) or
            numeric['zoneVersion'] != registry['zoneVersion'] or numeric['unit'] != 'm2' or
            numeric['areaCRS'] != 'EPSG:6933' or reviewed['zonesSha256'] != sha256(zones) or
            reviewed['status'] != 'accepted' or set(reviewed['bodies']) != set(ids)):
        raise ValueError('Complete reviewed coherent catalogue required')
    bodies = {b['id']: b for b in numeric['bodies']}
    if len(bodies) != len(numeric['bodies']) or set(bodies) != set(ids):
        raise ValueError('Series and catalogue IDs differ')
    for i, f in enumerate(registry['features']):
        geometry, p = shape(f['geometry']), f['properties']
        if geometry.is_empty or not geometry.is_valid or geometry.geom_type not in {'Polygon', 'MultiPolygon'}:
            raise ValueError('Invalid zone geometry')
        if p['zoneVersion'] != registry['zoneVersion'] or not math.isfinite(p['zoneM2']) or p['zoneM2'] <= 0:
            raise ValueError('Invalid zone area/version')
        for other in registry['features'][i+1:]:
            if geometry.intersection(shape(other['geometry'])).area > 1e-12:
                raise ValueError('Catalogue overlap')
        validate_series(bodies[p['id']], p['zoneM2'])
    sensitivity_path = zones.parent/'registration-sensitivity.json'
    sensitivity = json.loads(sensitivity_path.read_text())
    if (sensitivity['zoneVersion'] != registry['zoneVersion'] or
            {b['id'] for b in sensitivity['bodies']} != set(ids)):
        raise ValueError('Registration sensitivity must cover the same catalogue')
    for body in sensitivity['bodies']:
        for pair in body['pairs']:
            if {(s['dx'], s['dy']) for s in pair['scenarios']} != {(x, y) for x in (-1, 0, 1) for y in (-1, 0, 1)}:
                raise ValueError('Missing one-cell sensitivity scenarios')
            base = next(s for s in pair['scenarios'] if s['dx'] == s['dy'] == 0)
            reference_pair = next(p for p in bodies[body['id']]['pairs'] if
                                  p['beforeYear'] == pair['beforeYear'] and p['afterYear'] == pair['afterYear'])
            close(base['validM2'], reference_pair['validM2'])
            if base['comparison'] is not None:
                close(base['comparison']['deltaM2'], reference_pair['comparison']['deltaM2'])
    native_manifest, files = inventory(native)
    overview_manifest = json.loads((overview/'overview.json').read_text())
    if (overview_manifest['years'] != list(YEARS) or
            overview_manifest['stamp']['auditSha256'] != native_manifest['auditSha256'] or
            overview_manifest['stamp']['boundarySha256'] != native_manifest['boundarySha256']):
        raise ValueError('Overview and native source versions differ')
    identity = {'nativeManifestSha256': sha256(native/'national-tiles.json'),
                'overviewSha256': sha256(overview/'overview.json'), 'zonesSha256': sha256(zones),
                'areasSha256': sha256(areas), 'reviewSha256': sha256(review),
                'sensitivitySha256': sha256(sensitivity_path),
                'areaProcessorSha256': sha256(Path(__file__).with_name('build_surface_water_zone_areas.py')),
                'areaMathSha256': sha256(Path(__file__).with_name('surface_water.py')),
                'zoneBuilderSha256': sha256(Path(__file__).with_name('build_surface_water_catalogue.py')),
                'processingSha256': sha256(Path(__file__))}
    import hashlib
    version = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()[:20]
    root = output/'versions'/version
    root.mkdir(parents=True, exist_ok=True)
    def install(source, relative, expected=None):
        target = root/relative
        target.parent.mkdir(parents=True, exist_ok=True)
        checksum = expected or sha256(source)
        if target.exists():
            if sha256(target) != checksum:
                raise ValueError('Immutable release asset changed')
        else:
            # Link local immutable tiles; archive/staging independently verify them.
            os.link(source, target)
        # Native inventory already streamed each source hash. Do not hash it
        # twice during linking; packaging verifies every referenced file again
        # and refuses mutations before replacing the accepted archive.
        return {'url': str(target.relative_to(root)), 'sha256': checksum, 'bytes': target.stat().st_size}
    manifest = {'schemaVersion': 1, 'version': version, 'processingVersion': PROCESSING_VERSION,
                'zoneVersion': registry['zoneVersion'], 'sourceVersion': native_manifest['sourceVersion'],
                'years': list(YEARS), 'unit': 'm2', 'areaCRS': 'EPSG:6933', 'rasterCRS': 'EPSG:4326',
                'areaMethod': numeric['method'], 'encoding': 'packed4-gzip', 'tileSize': 512,
                'classes': native_manifest['classes'], 'quality': {'suppressedBelow': .8, 'completeAt': .95,
                'temporalCompleteness': 'unknown', 'missing': 'null, never zero water',
                'pairMask': 'intersection of both annual valid masks'}, 'identity': identity,
                'sources': [{'year': y, 'collection': collection(y), 'band': 'waterClass'} for y in YEARS],
                'attribution': registry['attribution'], 'registrationRisk': 'Cross-release differences remain possible; one-cell shifts are sensitivity scenarios, not error bounds',
                'chunks': [], 'overview': {k: overview_manifest[k] for k in
                    ('width', 'height', 'transform', 'factor', 'method', 'limitation')}, 'catalogue': []}
    for name, record in files.items():
        if name.startswith('tiles/'):
            install(native/name, 'native/'+name, record['sha256'])
    for chunk in native_manifest['chunks']:
        index = json.loads((native/chunk['url']).read_text())
        item = {k: chunk[k] for k in ('id', 'width', 'height', 'transform')}
        item['frames'] = []
        for frame in index['frames']:
            tiles = []
            for tile in frame['tiles']:
                asset = index['assets'][tile['asset']]
                tiles.append({**{k: tile[k] for k in ('x', 'y', 'width', 'height')},
                              **asset, 'url': 'native/'+asset['url']})
            path = root/'native/frames'/chunk['id']/f"{frame['year']}.json"
            compact_json(path, {'version': version, 'year': frame['year'],
                               **{k: item[k] for k in ('width', 'height', 'transform')}, 'tiles': tiles})
            item['frames'].append({'year': frame['year'], **reference(root, path)})
        manifest['chunks'].append(item)
    manifest['overview']['frames'] = []
    for ref in overview_manifest['frames']:
        source = overview/ref['url']
        if sha256(source) != ref['sha256']:
            raise ValueError('Overview index changed')
        frame = json.loads(source.read_text())
        for tile in frame['tiles']:
            install(overview/tile['url'], 'overview/'+tile['url'], tile['sha256'])
            tile['url'] = 'overview/'+tile['url']
        frame['version'] = version
        path = root/'overview'/ref['url']
        compact_json(path, frame)
        manifest['overview']['frames'].append({'year': ref['year'], **reference(root, path)})
    install(zones, 'analysis-zones.geojson', identity['zonesSha256'])
    manifest['analysisZones'] = reference(root, root/'analysis-zones.geojson')
    install(review, 'zone-review.json', identity['reviewSha256'])
    manifest['zoneReview'] = reference(root, root/'zone-review.json')
    install(sensitivity_path, 'registration-sensitivity.json', identity['sensitivitySha256'])
    manifest['registrationSensitivity'] = reference(root, root/'registration-sensitivity.json')
    for f in registry['features']:
        p, body = f['properties'], bodies[f['properties']['id']]
        path = root/'series'/f"{p['id']}.json"
        compact_json(path, {'schemaVersion': 1, 'version': version, 'zoneVersion': registry['zoneVersion'],
                            'unit': 'm2', 'areaCRS': 'EPSG:6933', 'id': p['id'],
                            'annual': body['annual'], 'pairs': body['pairs']})
        manifest['catalogue'].append({**{k: p[k] for k in ('id', 'nameUk', 'nameEn', 'type', 'zoneM2', 'inclusionReason')},
                                      'bounds': list(shape(f['geometry']).bounds), 'series': reference(root, path),
                                      'review': reviewed['bodies'][p['id']]})
    credits = root/'CREDITS.txt'
    credits.write_text(registry['attribution']+'\nPekel et al. (2016), doi:10.1038/nature20584\nOSM derived geometry: https://www.openstreetmap.org/copyright\n')
    compact_json(root/'manifest.json', manifest)
    feature_bytes = sum(p.stat().st_size for p in root.rglob('*') if p.is_file())
    if feature_bytes > 750_000_000:
        raise ValueError('Feature publication size gate exceeded')
    pointer = {'schemaVersion': 1, 'version': version,
               **reference(output, root/'manifest.json')}
    write_json(output/'current.json', pointer)
    write_json(output/'release-build-report.json', {'version': version, 'featureBytes': feature_bytes,
               'featureStorageGate': True, 'annualRecords': len(ids)*41, 'pairRecords': len(ids)*820,
               'status': 'validated local release; no external publication', **identity})
    print(version, feature_bytes, 'bytes', flush=True)
    return pointer


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    root = Path(__file__).resolve().parent/'data/raw/surface-water'
    parser.add_argument('--native', type=Path, default=root/'national-packed4-v1')
    parser.add_argument('--overview', type=Path, default=root/'national-overview-v1')
    parser.add_argument('--zones', type=Path, default=root/'catalogue-full-history/analysis-zones.geojson')
    parser.add_argument('--areas', type=Path, default=root/'catalogue-full-history/zone-areas.json')
    parser.add_argument('--review', type=Path, default=root/'catalogue-full-history/review/acceptance.json')
    parser.add_argument('--output', type=Path, default=root/'release')
    args = parser.parse_args()
    build(args.native, args.overview, args.zones, args.areas, args.review, args.output)
