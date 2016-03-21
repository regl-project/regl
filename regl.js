var check = require('./lib/check')
var getContext = require('./lib/context')
var wrapExtensions = require('./lib/extension')
var wrapShaders = require('./lib/shader')
var wrapBuffers = require('./lib/buffer')
var wrapTextures = require('./lib/texture')
var wrapFBOs = require('./lib/fbo')
var wrapContext = require('./lib/state')
var dynamic = require('./lib/dynamic')
var raf = require('./lib/raf')

var GL_COLOR_BUFFER_BIT = 16384
var GL_DEPTH_BUFFER_BIT = 256
var GL_STENCIL_BUFFER_BIT = 1024

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
  var shaderState = wrapShaders(gl, extensionState)
  var contextState = wrapContext(
    gl,
    extensionState,
    shaderState,
    bufferState,
    textureState,
    fboState)
  var canvas = gl.canvas

  // raf stuff
  var frameCount = 0
  var rafCallbacks = []
  var activeRAF = raf.next(handleRAF)
  function handleRAF () {
    activeRAF = raf.next(handleRAF)
    frameCount += 1
    for (var i = 0; i < rafCallbacks.length; ++i) {
      var cb = rafCallbacks[i]
      cb(frameCount)
    }
  }

  function handleContextLoss (event) {
    raf.cancel(activeRAF)
    activeRAF = 0
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
    handleRAF()
  }

  if (canvas) {
    canvas.addEventListener(CONTEXT_LOST_EVENT, handleContextLoss, false)
    canvas.addEventListener(CONTEXT_RESTORED_EVENT, handleContextRestored, false)
  }

  // Resource destructuion
  function destroy () {
    if (activeRAF) {
      raf.cancel(activeRAF)
    }

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
    check(!!options, 'invalid args to regl({...})')
    check.type(options, 'object', 'invalid args to regl({...})')

    var hasDynamic = false

    // First we separate the options into static and dynamic components
    function separateDynamic (object) {
      var staticItems = {}
      var dynamicItems = {}
      Object.keys(object).forEach(function (option) {
        var value = object[option]
        if (dynamic.isDynamic(value)) {
          hasDynamic = true
          dynamicItems[option] = dynamic.unbox(value, option)
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

    var compiled = contextState.create(
      staticOptions,
      uniforms.static,
      attributes.static,
      parts.dynamic,
      uniforms.dynamic,
      attributes.dynamic,
      hasDynamic)

    return Object.assign(compiled.draw, {
      scope: compiled.scope
    })
  }

  // Clears the currently bound frame buffer
  function clear (options) {
    var clearFlags = 0

    // Update context state
    contextState.poll()

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

  function frame (cb) {
    rafCallbacks.push(cb)

    function cancel () {
      var index = rafCallbacks.find(function (item) {
        return item === cb
      })
      if (index >= 0) {
        rafCallbacks.splice(index, 1)
      }
    }

    return {
      cancel: cancel
    }
  }

  // Initialize state variables
  contextState.poll()

  return Object.assign(compileProcedure, {
    // Clear current FBO
    clear: clear,

    // Place holder for dynamic keys
    prop: dynamic.define,

    // Object constructors
    buffer: create(bufferState),
    texture: create(textureState),
    fbo: create(fboState),

    // Frame rendering
    frame: frame,

    // Destroy regl and all associated resources
    destroy: destroy
  })
}
