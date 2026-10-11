"""GSW1_4 never-water correction for national rendering (tiles and overview).

GSW1_4 YearlyHistory (1984–2015) masks cells never mapped as water, so they
arrive as class 0 even where they were dry. GSW1_5 (2016–2024) has no
such mask. A cell with no water class (2 or 3) in any supported year is outside
the ever-water footprint (the annual equivalent of GSW max_extent); its 1984–2015
class 0 becomes 1. Unobserved cells inside the footprint stay 0.

Area accounting (zone extraction) keeps raw classes: GSW1_4 masks never-water
cells whether or not they were observed, so treating them as dry would let a
buffered zone pass the coverage gate in a year its water was unobserved.
"""
import hashlib

import numpy as np
import rasterio

LAST_GSW14_YEAR = 2015
CORRECTION = 'gsw14-never-water-1'


def ever_water(inputs, entries):
    """Ever-water footprint for one chunk on its shared native grid, cached by source hashes."""
    if len({e['chunkId'] for e in entries}) != 1:
        raise ValueError('Expected the full timeline of one chunk')
    key = hashlib.sha256(''.join(sorted(e['sha256'] for e in entries)).encode()).hexdigest()[:16]
    path = inputs/'ever-water'/f"{entries[0]['chunkId']}-{key}.npz"
    if path.exists():
        cached = np.load(path)
        shape = tuple(cached['shape'])
        return np.unpackbits(cached['bits'], count=shape[0]*shape[1]).reshape(shape).astype(bool)
    wet = None
    for entry in entries:
        with rasterio.open(inputs/entry['file']) as source:
            data = source.read(1, masked=True).filled(0) >= 2
        if wet is not None and data.shape != wet.shape:
            raise ValueError('Chunk years do not share one native grid')
        wet = data if wet is None else wet | data
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name+'.part.npz')
    np.savez_compressed(temporary, bits=np.packbits(wet), shape=np.array(wet.shape))
    temporary.replace(path)
    return wet


def dry_never_water(data, year, ever):
    """Reclassify observed-dry GSW1_4 cells in place; `ever` matches `data`'s window."""
    if year <= LAST_GSW14_YEAR:
        data[(data == 0) & ~ever] = 1
    return data
