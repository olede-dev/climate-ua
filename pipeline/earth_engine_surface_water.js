/* global ee, Export, print */
// Run in the authenticated Earth Engine Code Editor, not in the site or CI.
// Source: EC JRC/Google. Pekel et al. (2016), Nature 540, 418–422,
// doi:10.1038/nature20584. Download envelopes are NOT analysis zones.
// Creates Drive export tasks; starting tasks is a separate Code Editor action.

var envelopes = {
  kakhovka: [33.52, 46.81, 35.35, 47.87],
  kremenchuk: [31.35, 48.9, 33.3, 49.85],
  svitiaz: [23.75, 51.44, 23.92, 51.54]
}
var requests = [
  { year: 1984, collection: 'JRC/GSW1_4/YearlyHistory' },
  { year: 2015, collection: 'JRC/GSW1_4/YearlyHistory' },
  {
    year: 2016,
    collection: 'projects/global-surface-water/assets/GSW1_5/YearlyHistory_2016_2021'
  },
  {
    year: 2021,
    collection: 'projects/global-surface-water/assets/GSW1_5/YearlyHistory_2016_2021'
  },
  {
    year: 2022,
    collection: 'projects/global-surface-water/assets/GSW1_5/YearlyHistory_2022_2024'
  },
  {
    year: 2023,
    collection: 'projects/global-surface-water/assets/GSW1_5/YearlyHistory_2022_2024'
  },
  {
    year: 2024,
    collection: 'projects/global-surface-water/assets/GSW1_5/YearlyHistory_2022_2024'
  }
]
var folder = 'climate-ua-surface-water-prototype'
var provenance = []

// Resolve and check every request before creating any tasks. Date filtering also
// accepts assets that expose system:time_start instead of a numeric year field.
var resolved = requests.map(function (request) {
  var matches = ee.ImageCollection(request.collection).filter(
    ee.Filter.or(
      ee.Filter.eq('year', request.year),
      ee.Filter.date(request.year + '-01-01', request.year + 1 + '-01-01')
    )
  )
  if (matches.size().getInfo() !== 1) {
    throw new Error('Expected exactly one annual image: ' + request.collection + ' ' + request.year)
  }
  var image = ee.Image(matches.first()).select('waterClass')
  return {
    request: request,
    image: image,
    imageId: image.id().getInfo(),
    projection: image.projection().getInfo()
  }
})

resolved.forEach(function (item) {
  Object.keys(envelopes).forEach(function (id) {
    var filename = id + '-yearly-' + item.request.year
    // Preserve each source's actual grid. `scale: 30` can shift pixel origins;
    // cross-release alignment must be checked after downloading these files.
    Export.image.toDrive({
      image: item.image.unmask({ value: 0, sameFootprint: false }).toUint8(),
      description: filename,
      folder: folder,
      fileNamePrefix: filename,
      region: ee.Geometry.Rectangle(envelopes[id], 'EPSG:4326', false),
      crs: item.projection.crs,
      crsTransform: item.projection.transform,
      maxPixels: 40000000,
      fileFormat: 'GeoTIFF',
      formatOptions: { cloudOptimized: true, noData: 0 }
    })
    provenance.push(
      ee.Feature(null, {
        waterbodyId: id,
        year: item.request.year,
        collection: item.request.collection,
        imageId: item.imageId,
        band: 'waterClass',
        file: filename + '.tif',
        downloadEnvelope: JSON.stringify(envelopes[id]),
        crs: item.projection.crs,
        nativeTransform: JSON.stringify(item.projection.transform),
        missingClass: 0,
        attribution: 'Source: EC JRC/Google',
        citation: 'Pekel et al. (2016), doi:10.1038/nature20584'
      })
    )
  })
})
Export.table.toDrive({
  collection: ee.FeatureCollection(provenance),
  description: 'yearly-source-provenance',
  folder: folder,
  fileNamePrefix: 'yearly-source-provenance',
  fileFormat: 'GeoJSON'
})
print('Prepared ' + provenance.length + ' annual crops and one provenance export in Tasks.')
print('Download completed crops and provenance into pipeline/data/raw/surface-water/earth-engine/.')
