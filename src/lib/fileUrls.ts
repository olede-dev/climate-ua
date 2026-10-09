/** The URL each static data file was fetched from, keyed by its parsed object. */
const urls = new WeakMap<object, string>()

export function rememberUrl<T extends object>(file: T, url: string): T {
  urls.set(file, url)
  return file
}

/**
 * The URL to hand MapLibre for a GeoJSON source, or the object itself when it was not fetched.
 * Given the URL, MapLibre's worker reads the file from the HTTP cache; given the object, the page
 * copies it to the worker, which blocks a phone's main thread for tens of milliseconds.
 */
export function geojsonData<T extends object>(file: T): T | string {
  return urls.get(file) ?? file
}
