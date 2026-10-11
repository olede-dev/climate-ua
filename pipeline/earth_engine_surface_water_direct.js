/* global ee, ui, print */
// Template populated by prepare_surface_water_national.py --direct.
// Source: EC JRC/Google; Pekel et al. (2016), doi:10.1038/nature20584.
// Downloads are masked to Ukraine locally by fetch_surface_water_national.py.
var cells = NATIONAL_CELLS
var years = SUPPORTED_YEARS
var status = ui.Label('Preparing exact national downloads')
print(status)

function runYear(index) {
  if (index >= years.length) {
    status.setValue('ALL REQUESTED YEARS READY')
    return
  }
  var year = years[index]
  var collection =
    year <= 2015
      ? 'JRC/GSW1_4/YearlyHistory'
      : 'projects/global-surface-water/assets/GSW1_5/YearlyHistory_' +
        (year <= 2021 ? '2016_2021' : '2022_2024')
  var matches = ee.ImageCollection(collection).filter(
    ee.Filter.or(
      ee.Filter.eq('year', year),
      ee.Filter.date(year + '-01-01', year + 1 + '-01-01'),
    ),
  )
  if (matches.size().getInfo() !== 1) throw new Error('Not unique annual source: ' + year)
  var image = ee.Image(matches.first()).select('waterClass')
  var imageId = image.id().getInfo()
  var projection = image.projection().getInfo()
  var t = projection.transform
  var next = 0
  var done = 0
  var results = []
  var failed = []

  function request(cell, attempt) {
    var w = cell[0]
    var s = cell[1]
    var chunk = 'e' + w + '-n' + s
    var x = Math.floor((w - t[2]) / t[0])
    var y = Math.floor((s + 1 - t[5]) / t[4])
    var x2 = Math.ceil((w + 1 - t[2]) / t[0])
    var y2 = Math.ceil((s - t[5]) / t[4])
    var grid = [t[0], 0, t[2] + x * t[0], 0, t[4], t[5] + y * t[4]]
    image
      .unmask({ value: 0, sameFootprint: false })
      .toUint8()
      .getDownloadURL(
        {
          crs: projection.crs,
          crs_transform: grid,
          dimensions: [x2 - x, y2 - y],
          format: 'GEO_TIFF',
        },
        function (url, error) {
          if (error && attempt < 3) {
            request(cell, attempt + 1)
            return
          }
          if (error) failed.push(chunk + ': ' + error)
          else
            results.push(
              ee.Feature(null, {
                id: chunk + '-' + year,
                chunkId: chunk,
                year: year,
                file: chunk + '-yearly-' + year + '.tif',
                collection: collection,
                imageId: imageId,
                band: 'waterClass',
                crs: projection.crs,
                nativeTransform: JSON.stringify(t),
                downloadEnvelope: JSON.stringify([w, s, w + 1, s + 1]),
                missingClass: 0,
                attribution: 'Source: EC JRC/Google',
                citation: 'Pekel et al. (2016), doi:10.1038/nature20584',
                downloadUrl: url,
              }),
            )
          done++
          status.setValue('Year ' + year + ': ' + done + '/' + cells.length + ' URLs')
          if (next < cells.length) request(cells[next++], 0)
          if (done === cells.length) {
            if (failed.length) {
              print('FAILED ' + year, failed)
              return
            }
            ee.FeatureCollection(results).getDownloadURL(
              'geojson',
              undefined,
              'provenance-direct-' + year,
              function (manifest, manifestError) {
                if (manifestError) {
                  print('MANIFEST ERROR ' + year, manifestError)
                  return
                }
                print('MANIFEST ' + year, manifest)
                runYear(index + 1)
              },
            )
          }
        },
      )
  }
  for (var k = 0; k < Math.min(16, cells.length); k++) request(cells[next++], 0)
}
runYear(0)
