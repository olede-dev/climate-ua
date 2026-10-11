"""List standing-water OSM polygons of at least 1 km² from the pinned regional archive.

Rivers, canals and other flowing or engineered channels are excluded by tag. The
polygon is an identity hint for a local zone, never its observed footprint.
"""
import argparse
import json
from pathlib import Path

import osmium
from shapely import wkb
from shapely.geometry import mapping
from shapely.ops import transform

from prepare_surface_water_national import sha256, write_json
from surface_water import GEOGRAPHIC_TO_AREA

MIN_M2 = 1e6
PLACES = ('city', 'town', 'village')
FLOWING = {'river', 'canal', 'stream', 'ditch', 'drain', 'riverbank', 'moat',
           'wastewater', 'basin', 'lock', 'fishpass', 'rapids'}


class Lakes(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.factory = osmium.geom.WKBFactory()
        self.found = []
        self.places = []

    def node(self, n):
        tags = n.tags
        if tags.get('place') in PLACES and tags.get('name'):
            self.places.append({'nameUk': tags.get('name:uk') or tags['name'], 'nameEn': tags.get('name:en'),
                                'place': tags['place'], 'lon': n.location.lon, 'lat': n.location.lat})

    def area(self, a):
        tags = a.tags
        if tags.get('natural') != 'water' and tags.get('landuse') != 'reservoir':
            return
        if tags.get('water', '') in FLOWING or 'waterway' in tags:
            return
        try:
            geometry = wkb.loads(self.factory.create_multipolygon(a), hex=True)
        except RuntimeError:
            return
        if not geometry.is_valid:
            geometry = geometry.buffer(0)
        m2 = transform(GEOGRAPHIC_TO_AREA.transform, geometry).area
        if m2 < MIN_M2:
            return
        self.found.append({'type': 'Feature', 'geometry': mapping(geometry), 'properties': {
            'osmId': ('way/' if a.from_way() else 'relation/') + str(a.orig_id()),
            'nameUk': tags.get('name:uk') or tags.get('name'), 'nameEn': tags.get('name:en'),
            'water': tags.get('water') or ('reservoir' if tags.get('landuse') == 'reservoir' else None),
            'osmM2': m2}})


def extract(archive, output):
    handler = Lakes()
    handler.apply_file(str(archive), locations=True, idx='flex_mem')
    features = sorted(handler.found, key=lambda f: (-f['properties']['osmM2'], f['properties']['osmId']))
    write_json(output, {'type': 'FeatureCollection', 'archiveSha256': sha256(archive),
                        'minM2': MIN_M2, 'attribution': '© OpenStreetMap contributors, ODbL-1.0',
                        'features': features})
    write_json(output.with_name('osm-places.json'), sorted(handler.places, key=lambda p: (p['lon'], p['lat'])))
    print(len(features), 'standing-water polygons ≥ 1 km²;', len(handler.places), 'places')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    root = Path(__file__).resolve().parent/'data/raw/surface-water'
    parser.add_argument('--archive', type=Path, default=root/'osm-archive/ukraine-230101.osm.pbf')
    parser.add_argument('--output', type=Path, default=root/'local-catalogue/osm-lakes.geojson')
    args = parser.parse_args()
    extract(args.archive, args.output)
