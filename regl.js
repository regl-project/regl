var getContext = require('./lib/context')
var createExtensionCache = require('./lib/extension')
var createShaderCache = require('./lib/shader')
var createBufferCache = require('./lib/buffer')
var createTextureCache = require('./lib/texture')
var createFBOCache = require('./lib/fbo')
var createStateCache = require('./lib/state')

var CONTEXT_LOST_EVENT = 'webglcontextlost'
var CONTEXT_RESTORED_EVENT = 'webglcontextrestored'

module.exports = function wrapREGL () {
  var args = getContext(Array.prototype.slice.call(arguments))
  var gl = args.gl
  var options = args.options

  var extensionCache = createExtensionCache(gl,
    options.requiredExtensions || [])
  var shaderCache = createShaderCache(gl)
  var bufferCache = createBufferCache(gl,
    extensionCache.extensions)
  var textureCache = createTextureCache(gl,
    extensionCache.extensions)
  var fboCache = createFBOCache(gl,
    extensionCache.extensions,
    textureCache)
  var stateCache = createStateCache(gl,
    extensionCache.extensions,
    shaderCache,
    bufferCache,
    textureCache,
    fboCache)
  var canvas = gl.canvas

  function handleContextLoss (event) {
    event.preventDefault()
    if (options.onContextLost) {
      options.onContextLost()
    }
  }

  function handleContextRestored (event) {
    gl.getError()
    extensionCache.refresh()
    shaderCache.refresh()
    textureCache.refresh()
    bufferCache.refresh()
    fboCache.refresh()
    stateCache.refresh()
    if (options.onContextRestored) {
      options.onContextRestored()
    }
  }

  if (canvas) {
    canvas.addEventListener(CONTEXT_LOST_EVENT, handleContextLoss, false)
    canvas.addEventListener(CONTEXT_RESTORED_EVENT, handleContextRestored, false)
  }

  // Resource destructuion
  function destroy () {
    if (canvas) {
      canvas.removeEventListener(CONTEXT_LOST_EVENT, handleContextLoss)
      canvas.removeEventListener(CONTEXT_RESTORED_EVENT, handleContextRestored)
    }

    shaderCache.clear()
    fboCache.clear()
    bufferCache.clear()
    textureCache.clear()
    stateCache.clear()

    if (options.onDestroy) {
      options.onDestroy()
    }
  }

  function create (cache) {
    return function (options) {
      return cache.create(options)
    }
  }

  return Object.assign(create(stateCache), {
    // Object constructors
    buffer: create(bufferCache),
    texture: create(textureCache),
    fbo: create(fboCache),

    // Destroy regl and all associated resources
    destroy: destroy
  })
}
