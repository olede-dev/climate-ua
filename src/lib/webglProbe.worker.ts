// Runs `softwareWebgl`'s check: on a CPU renderer creating the context alone takes seconds,
// which would block the main thread that the check is meant to protect.
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software/i

function software(): boolean {
  const canvas = new OffscreenCanvas(1, 1)
  // With `failIfMajorPerformanceCaveat` a browser that would fall back to software returns null.
  const gl = canvas.getContext('webgl', { failIfMajorPerformanceCaveat: true })
  if (!gl) return true
  const info = gl.getExtension('WEBGL_debug_renderer_info')
  const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : ''
  gl.getExtension('WEBGL_lose_context')?.loseContext()
  return SOFTWARE_RENDERER.test(renderer)
}

postMessage(software())
