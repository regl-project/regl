var check = require('./lib/check')
var getContext = require('./lib/context')
var wrapExtensions = require('./lib/extension')
var wrapShaders = require('./lib/shader')
var wrapBuffers = require('./lib/buffer')
var wrapTextures = require('./lib/texture')
var wrapFBOs = require('./lib/fbo')
var wrapContext = require('./lib/state')

var DYNAMIC = require('./lib/constants/dynamic')

var CONTEXT_LOST_EVENT = 'webglcontextlost'
var CONTEXT_RESTORED_EVENT = 'webglcontextrestored'

module.exports = function wrapREGL () {
  var args = getContext(Array.prototype.slice.call(arguments))
  var gl = args.gl
  var options = args.options

  var GL_COLOR_BUFFER_BIT = 16384
  var GL_DEPTH_BUFFER_BIT = 256
  var GL_STENCIL_BUFFER_BIT = 1024

  var extensionState = wrapExtensions(gl, options.requiredExtensions || [])
  var bufferState = wrapBuffers(gl, extensionState)
  var textureState = wrapTextures(gl, extensionState)
  var fboState = wrapFBOs(gl, extensionState, textureState)
  var shaderState = wrapShaders(gl, extensionState)
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

  // Compiles a set of procedures for an object
  function compileProcedure (options) {
    function separateDynamic (object) {
      var staticItems = {}
      var dynamicItems = []
      Object.keys(object).forEach(function (option) {
        var value = object[option]
        if (value === DYNAMIC) {
          dynamicItems.push(option)
        } else {
          staticItems[option] = value
        }
      })
      return {
        dynamic: dynamicItems,
        static: staticItems
      }
    }

    var uniforms = separateDynamic(options.uniforms || {})
    var attributes = separateDynamic(options.attributes || {})
    var parts = separateDynamic(options)
    var staticOptions = parts.static
    delete staticOptions.uniforms
    delete staticOptions.attributes

    return contextState.create(
      staticOptions,
      uniforms.static,
      attributes.static,
      parts.dynamic,
      uniforms.dynamic,
      attributes.dynamic)
  }

  // The main regl entry point
  function regl (options) {
    var compiled = compileProcedure(options)
    var result = compiled.scope
    result.draw = compiled.draw
    return result
  }

  // Clears the currently bound frame buffer
  function clear (options) {
    var clearFlags = 0

    var c = options.color
    if (c) {
      gl.clearColor(+c[0] || 0, +c[1] || 0, +c[2] || 0, +c[3] || 0)
      clearFlags |= GL_COLOR_BUFFER_BIT
    }

    if ('depth' in options) {
      gl.clearDepth(+options.depth)
      clearFlags |= GL_DEPTH_BUFFER_BIT
    }

    if ('stencil' in options) {
      gl.clearStencil(options.stencil | 0)
      clearFlags |= GL_STENCIL_BUFFER_BIT
    }

    check(!!clearFlags, 'called regl.clear with no buffer specified')
    gl.clear(clearFlags)
  }

  return Object.assign(regl, {
    // Clear current FBO
    clear: clear,

    // Place holder for dynamic keys
    dynamic: DYNAMIC,

    // Object constructors
    buffer: create(bufferState),
    texture: create(textureState),
    fbo: create(fboState),

    // Destroy regl and all associated resources
    destroy: destroy
  })
}
