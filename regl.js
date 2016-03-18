var getContext = require('./lib/context')
var wrapExtensions = require('./lib/extension')
var wrapShaders = require('./lib/shader')
var wrapBuffers = require('./lib/buffer')
var wrapTextures = require('./lib/texture')
var wrapFBOs = require('./lib/fbo')
var wrapContext = require('./lib/state')

var CONTEXT_LOST_EVENT = 'webglcontextlost'
var CONTEXT_RESTORED_EVENT = 'webglcontextrestored'

module.exports = function wrapREGL () {
  var args = getContext(Array.prototype.slice.call(arguments))
  var gl = args.gl
  var options = args.options

  var extensionState = wrapExtensions(gl, options.requiredExtensions || [])
  var bufferState = wrapBuffers(gl, extensionState)
  var textureState = wrapTextures(gl, extensionState)
  var fboState = wrapFBOs(gl, extensionState, textureState)
  var shaderState = wrapShaders(gl)
  var contextState = wrapContext(
    gl,
    extensionState,
    shaderState,
    bufferState,
    textureState,
    fboState)
  var canvas = gl.canvas

  function handleContextLoss (event) {
    event.preventDefault()
    if (options.onContextLost) {
      options.onContextLost()
    }
  }

  function handleContextRestored (event) {
    gl.getError()
    extensionState.refresh()
    bufferState.refresh()
    textureState.refresh()
    fboState.refresh()
    shaderState.refresh()
    contextState.refresh()
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

    contextState.clear()
    shaderState.clear()
    fboState.clear()
    textureState.clear()
    bufferState.clear()

    if (options.onDestroy) {
      options.onDestroy()
    }
  }

  function create (cache) {
    return function (options) {
      return cache.create(options)
    }
  }

  // The main regl entry point
  function regl (options) {
  }

  return Object.assign(regl, {
    // Object constructors
    buffer: create(bufferState),
    texture: create(textureState),
    fbo: create(fboState),

    // Destroy regl and all associated resources
    destroy: destroy
  })
}
