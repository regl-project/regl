var check = require('./lib/util/check')
var extend = require('./lib/util/extend')
var initWebGL = require('./lib/webgl')
var createStringStore = require('./lib/strings')
var wrapExtensions = require('./lib/extension')
var wrapLimits = require('./lib/limits')
var wrapBuffers = require('./lib/buffer')
var wrapElements = require('./lib/elements')
var wrapTextures = require('./lib/texture')
var wrapRenderbuffers = require('./lib/renderbuffer')
var wrapFramebuffers = require('./lib/framebuffer')
var wrapAttributes = require('./lib/attribute')
var wrapShaders = require('./lib/shader')
var wrapGLState = require('./lib/state')
var createCompiler = require('./lib/compile')
var wrapRead = require('./lib/read')
var dynamic = require('./lib/dynamic')
var raf = require('./lib/util/raf')
var clock = require('./lib/util/clock')

var GL_COLOR_BUFFER_BIT = 16384
var GL_DEPTH_BUFFER_BIT = 256
var GL_STENCIL_BUFFER_BIT = 1024

var GL_ARRAY_BUFFER = 34962
var GL_TEXTURE_2D = 0x0DE1
var GL_TEXTURE_CUBE_MAP = 0x8513

var CONTEXT_LOST_EVENT = 'webglcontextlost'
var CONTEXT_RESTORED_EVENT = 'webglcontextrestored'

var DYN_PROP = 1
var DYN_CONTEXT = 2
var DYN_STATE = 3

module.exports = function wrapREGL () {
  var args = initWebGL(Array.prototype.slice.call(arguments))
  var gl = args.gl
  var options = args.options

  var stringStore = createStringStore()

  var extensionState = wrapExtensions(gl)
  var extensions = extensionState.extensions

  var START_TIME = clock()
  var LAST_TIME = START_TIME
  var WIDTH = gl.drawingBufferWidth
  var HEIGHT = gl.drawingBufferHeight

  var contextState = {
    count: 0,
    batchId: 0,
    deltaTime: 0,
    time: 0,
    viewportWidth: WIDTH,
    viewportHeight: HEIGHT,
    framebufferWidth: WIDTH,
    framebufferHeight: HEIGHT,
    drawingBufferWidth: WIDTH,
    drawingBufferHeight: HEIGHT,
    pixelRatio: options.pixelRatio
  }

  var limits = wrapLimits(
    gl,
    extensions)

  var bufferState = wrapBuffers(gl, unbindBuffer)

  var elementState = wrapElements(
    gl,
    extensions,
    bufferState)

  var uniformState = {}

  var attributeState = wrapAttributes(
    gl,
    extensions,
    limits,
    bufferState,
    stringStore)

  var shaderState = wrapShaders(
    gl,
    attributeState,
    uniformState,
    stringStore)

  var drawState = {
    primitive: 4, // GL_TRIANGLES
    count: -1,
    offset: 0,
    instances: 0
  }

  var textureState = wrapTextures(
    gl,
    extensions,
    limits,
    poll,
    contextState)

  var renderbufferState = wrapRenderbuffers(
    gl,
    extensions,
    limits)

  var framebufferState = wrapFramebuffers(
    gl,
    extensions,
    limits,
    textureState,
    renderbufferState)

  var glState = wrapGLState(
    gl,
    contextState)

  var readPixels = wrapRead(gl, poll, contextState)

  var compileCommand = createCompiler(
    gl,
    stringStore,
    extensions,
    limits,
    bufferState,
    elementState,
    textureState,
    framebufferState,
    glState,
    uniformState,
    attributeState,
    shaderState,
    drawState,
    contextState,
    poll)

  function unbindBuffer (buffer) {
    for (var i = 0; i < attributeState.bindings.length; ++i) {
      var attr = attributeState.bindings[i]
      if (attr.pointer && attr.buffer === buffer) {
        attr.pointer = false
        attr.buffer = null
        attr.x = attr.y = attr.z = attr.w = NaN
        gl.disableVertexAttribArray(i)
      }
    }
  }

  var canvas = gl.canvas

  var rafCallbacks = []
  var activeRAF = 0
  function handleRAF () {
    // schedule next animation frame
    activeRAF = raf.next(handleRAF)

    // increment frame coun
    contextState.count += 1

    // update viewport dimensions if viewport changed
    var curWidth = gl.drawingBufferWidth
    var curHeight = gl.drawingBufferHeight
    if (WIDTH !== curWidth ||
        HEIGHT !== curHeight) {
      contextState.viewportWidth =
        contextState.frameBufferWidth =
        contextState.drawingBufferWidth =
        WIDTH = curWidth
      contextState.viewportHeight =
        contextState.frameBufferWidth =
        contextState.drawingBufferHeight =
        HEIGHT = curHeight
      glState.notifyViewportChanged()
    }

    var now = clock()
    contextState.deltaTime = (now - LAST_TIME) / 1000.0
    contextState.time = (now - START_TIME) / 1000.0
    LAST_TIME = now

    textureState.poll()

    for (var i = 0; i < rafCallbacks.length; ++i) {
      var cb = rafCallbacks[i]
      cb(null, contextState)
    }
  }

  function startRAF () {
    if (!activeRAF && rafCallbacks.length > 0) {
      handleRAF()
    }
  }

  function stopRAF () {
    if (activeRAF) {
      raf.cancel(handleRAF)
      activeRAF = 0
    }
  }

  function handleContextLoss (event) {
    stopRAF()
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
    renderbufferState.refresh()
    framebufferState.refresh()
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

  function destroy () {
    stopRAF()

    if (canvas) {
      canvas.removeEventListener(CONTEXT_LOST_EVENT, handleContextLoss)
      canvas.removeEventListener(CONTEXT_RESTORED_EVENT, handleContextRestored)
    }

    shaderState.clear()
    framebufferState.clear()
    renderbufferState.clear()
    textureState.clear()
    bufferState.clear()

    if (options.onDestroy) {
      options.onDestroy()
    }
  }

  function compileProcedure (options) {
    check(!!options, 'invalid args to regl({...})')
    check.type(options, 'object', 'invalid args to regl({...})')

    function flattenNestedOptions (options) {
      var result = extend({}, options)
      delete result.uniforms
      delete result.attributes
      delete result.context

      function merge (name) {
        if (name in result) {
          var child = result[name]
          delete result[name]
          Object.keys(child).forEach(function (prop) {
            result[name + '.' + prop] = child[prop]
          })
        }
      }
      merge('blend')
      merge('depth')
      merge('cull')
      merge('stencil')
      merge('polygonOffset')
      merge('scissor')
      merge('sample')

      return result
    }

    function separateDynamic (object) {
      var staticItems = {}
      var dynamicItems = {}
      Object.keys(object).forEach(function (option) {
        var value = object[option]
        if (dynamic.isDynamic(value)) {
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

    // Treat context variables separate from other dynamic variables
    var context = separateDynamic(options.context || {})
    var uniforms = separateDynamic(options.uniforms || {})
    var attributes = separateDynamic(options.attributes || {})
    var opts = separateDynamic(flattenNestedOptions(options))

    var compiled = compileCommand(opts, uniforms, attributes, context)

    var draw = compiled.draw
    var batch = compiled.batch
    var scope = compiled.scope

    var EMPTY_ARRAY = []
    function reserve (count) {
      while (EMPTY_ARRAY.length < count) {
        EMPTY_ARRAY.push(null)
      }
      return EMPTY_ARRAY
    }

    check.saveDrawInfo(opts, uniforms, attributes, stringStore)

    function REGLCommand (args, body) {
      if (typeof args === 'function') {
        return scope.call(this, null, args)
      } else if (typeof body === 'function') {
        return scope.call(this, args, body)
      }

      // Runtime shader check.  Removed in production builds
      check.drawOk(
        drawState,
        shaderState,
        uniformState,
        attributeState,
        opts._commandRef,
        opts._fragId,
        opts._vertId,
        opts._uniformSet,
        opts._attributeSet,
        opts._hasCount)

      if (typeof args === 'number') {
        return batch.call(this, args | 0, reserve(args | 0))
      } else if (Array.isArray(args)) {
        return batch.call(this, args.length, args)
      }
      return draw.call(this, args)
    }

    return REGLCommand
  }

  function poll () {
    framebufferState.poll()
    glState.poll()
  }

  function clear (options) {
    var clearFlags = 0

    poll()

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
      if (index < 0) {
        return
      }
      rafCallbacks.splice(index, 1)
      if (rafCallbacks.length <= 0) {
        stopRAF()
      }
    }

    startRAF()

    return {
      cancel: cancel
    }
  }

  return extend(compileProcedure, {
    // Clear current FBO
    clear: clear,

    // Short cuts for dynamic variables
    prop: dynamic.define.bind(null, DYN_PROP),
    context: dynamic.define.bind(null, DYN_CONTEXT),
    this: dynamic.define.bind(null, DYN_STATE),

    // executes an empty draw command
    draw: compileProcedure({}),

    // Resources
    elements: function (options) {
      return elementState.create(options)
    },
    buffer: function (options) {
      return bufferState.create(options, GL_ARRAY_BUFFER)
    },
    texture: function (options) {
      return textureState.create(options, GL_TEXTURE_2D)
    },
    cube: function (options) {
      if (arguments.length === 6) {
        return textureState.create(
          Array.prototype.slice.call(arguments),
          GL_TEXTURE_CUBE_MAP)
      } else {
        return textureState.create(options, GL_TEXTURE_CUBE_MAP)
      }
    },
    renderbuffer: function (options) {
      return renderbufferState.create(options)
    },
    framebuffer: function (options) {
      return framebufferState.create(options)
    },
    framebufferCube: function (options) {
      check.raise('framebuffer cube not yet implemented')
    },

    // Frame rendering
    frame: frame,

    // System limits
    limits: limits,

    // Read pixels
    read: readPixels,

    // Destroy regl and all associated resources
    destroy: destroy
  })
}
