var check = require('./lib/check')
var getContext = require('./lib/context')
var wrapExtensions = require('./lib/extension')
var wrapBuffers = require('./lib/buffer')
var wrapDraw = require('./lib/draw')
var wrapTextures = require('./lib/texture')
var wrapFBOs = require('./lib/fbo')
var wrapUniforms = require('./lib/uniform')
var wrapAttributes = require('./lib/attribute')
var wrapShaders = require('./lib/shader')
var wrapContext = require('./lib/state')
var createCompiler = require('./lib/compile')
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

  var frameState = {
    count: 0
  }

  var extensionState = wrapExtensions(gl, options.requiredExtensions || [])
  var bufferState = wrapBuffers(gl, extensionState)
  var drawState = wrapDraw(gl, extensionState, bufferState)
  var textureState = wrapTextures(gl, extensionState)
  var fboState = wrapFBOs(gl, extensionState, textureState)
  var uniformState = wrapUniforms()
  var attributeState = wrapAttributes(gl, extensionState, bufferState)
  var shaderState = wrapShaders(
    gl,
    extensionState,
    attributeState,
    uniformState,
    function (program) {
      return compiler.draw(program)
    })
  var glState = wrapContext(gl, shaderState)

  var compiler = createCompiler(
    gl,
    extensionState,
    bufferState,
    drawState,
    textureState,
    fboState,
    glState,
    uniformState,
    attributeState,
    shaderState,
    frameState)

  var canvas = gl.canvas

  // raf stuff
  var rafCallbacks = []
  var activeRAF = raf.next(handleRAF)
  var prevWidth = 0
  var prevHeight = 0
  function handleRAF () {
    activeRAF = raf.next(handleRAF)
    frameState.count += 1

    if (prevWidth !== gl.drawingBufferWidth ||
        prevHeight !== gl.drawingBufferHeight) {
      prevWidth = gl.drawingBufferWidth
      prevHeight = gl.drawingBufferHeight
      glState.notifyViewportChanged()
    }

    for (var i = 0; i < rafCallbacks.length; ++i) {
      var cb = rafCallbacks[i]
      cb(frameState.count)
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
    glState.refresh()
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

    glState.clear()
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

    var compiled = compiler.command(
      staticOptions, uniforms.static, attributes.static,
      parts.dynamic, uniforms.dynamic, attributes.dynamic,
      hasDynamic)

    return Object.assign(compiled.draw, {
      scope: compiled.scope,
      batch: compiled.batch || void 0
    })
  }

  // Clears the currently bound frame buffer
  function clear (options) {
    var clearFlags = 0

    // Update context state
    glState.poll()

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

  // Registers another requestAnimationFrame callback
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

  return Object.assign(compileProcedure, {
    // Clear current FBO
    clear: clear,

    // Dynamic variable binding
    prop: dynamic.define,

    // Object constructors
    elements: create(drawState),
    buffer: create(bufferState),
    texture: create(textureState),
    fbo: create(fboState),

    // Frame rendering
    frame: frame,

    // Destroy regl and all associated resources
    destroy: destroy
  })
}
