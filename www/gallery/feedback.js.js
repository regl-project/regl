(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*
  tags: basic

 <p> This example shows how to use copyTexImage2D to implement feedback effects </p>
 */

const regl = require('../regl')()
const mouse = require('mouse-change')()

const pixels = regl.texture()

const drawFeedback = regl({
  frag: `
  precision mediump float;
  uniform sampler2D texture;
  uniform vec2 mouse;
  uniform float t;
  varying vec2 uv;
  void main () {
    float dist = length(gl_FragCoord.xy - mouse);
    gl_FragColor = vec4(0.98 * texture2D(texture,
      uv + cos(t) * vec2(0.5 - uv.y, uv.x - 0.5) - sin(2.0 * t) * (uv - 0.5)).rgb, 1) +
      exp(-0.01 * dist) * vec4(
        1.0 + cos(2.0 * t),
        1.0 + cos(2.0 * t + 1.5),
        1.0 + cos(2.0 * t + 3.0),
        0.0);
  }`,

  vert: `
  precision mediump float;
  attribute vec2 position;
  varying vec2 uv;
  void main () {
    uv = position;
    gl_Position = vec4(2.0 * position - 1.0, 0, 1);
  }`,

  attributes: {
    position: [
      -2, 0,
      0, -2,
      2, 2]
  },

  uniforms: {
    texture: pixels,
    mouse: ({pixelRatio, viewportHeight}) => [
      mouse.x * pixelRatio,
      viewportHeight - mouse.y * pixelRatio
    ],
    t: ({tick}) => 0.01 * tick
  },

  count: 3
})

regl.frame(function () {
  regl.clear({
    color: [0, 0, 0, 1]
  })

  drawFeedback()

  pixels({
    copy: true
  })
})

},{"../regl":35,"mouse-change":33}],2:[function(require,module,exports){
var GL_FLOAT = 5126

function AttributeRecord () {
  this.state = 0

  this.x = 0.0
  this.y = 0.0
  this.z = 0.0
  this.w = 0.0

  this.buffer = null
  this.size = 0
  this.normalized = false
  this.type = GL_FLOAT
  this.offset = 0
  this.stride = 0
  this.divisor = 0
}

module.exports = function wrapAttributeState (
  gl,
  extensions,
  limits,
  bufferState,
  stringStore) {
  var NUM_ATTRIBUTES = limits.maxAttributes
  var attributeBindings = new Array(NUM_ATTRIBUTES)
  for (var i = 0; i < NUM_ATTRIBUTES; ++i) {
    attributeBindings[i] = new AttributeRecord()
  }

  return {
    Record: AttributeRecord,
    scope: {},
    state: attributeBindings
  }
}

},{}],3:[function(require,module,exports){

var isTypedArray = require('./util/is-typed-array')
var isNDArrayLike = require('./util/is-ndarray')
var values = require('./util/values')
var pool = require('./util/pool')

var arrayTypes = require('./constants/arraytypes.json')
var bufferTypes = require('./constants/dtypes.json')
var usageTypes = require('./constants/usage.json')

var GL_STATIC_DRAW = 0x88E4
var GL_STREAM_DRAW = 0x88E0

var GL_UNSIGNED_BYTE = 5121
var GL_FLOAT = 5126

var DTYPES_SIZES = []
DTYPES_SIZES[5120] = 1 // int8
DTYPES_SIZES[5122] = 2 // int16
DTYPES_SIZES[5124] = 4 // int32
DTYPES_SIZES[5121] = 1 // uint8
DTYPES_SIZES[5123] = 2 // uint16
DTYPES_SIZES[5125] = 4 // uint32
DTYPES_SIZES[5126] = 4 // float32

function typedArrayCode (data) {
  return arrayTypes[Object.prototype.toString.call(data)] | 0
}

function copyArray (out, inp) {
  for (var i = 0; i < inp.length; ++i) {
    out[i] = inp[i]
  }
}

function transpose (
  result, data, shapeX, shapeY, strideX, strideY, offset) {
  var ptr = 0
  for (var i = 0; i < shapeX; ++i) {
    for (var j = 0; j < shapeY; ++j) {
      result[ptr++] = data[strideX * i + strideY * j + offset]
    }
  }
}

function flatten (result, data, dimension) {
  var ptr = 0
  for (var i = 0; i < data.length; ++i) {
    var v = data[i]
    for (var j = 0; j < dimension; ++j) {
      result[ptr++] = v[j]
    }
  }
}

module.exports = function wrapBufferState (gl, stats, config) {
  var bufferCount = 0
  var bufferSet = {}

  function REGLBuffer (type) {
    this.id = bufferCount++
    this.buffer = gl.createBuffer()
    this.type = type
    this.usage = GL_STATIC_DRAW
    this.byteLength = 0
    this.dimension = 1
    this.dtype = GL_UNSIGNED_BYTE

    this.persistentData = null

    if (config.profile) {
      this.stats = {size: 0}
    }
  }

  REGLBuffer.prototype.bind = function () {
    gl.bindBuffer(this.type, this.buffer)
  }

  REGLBuffer.prototype.destroy = function () {
    destroy(this)
  }

  var streamPool = []

  function createStream (type, data) {
    var buffer = streamPool.pop()
    if (!buffer) {
      buffer = new REGLBuffer(type)
    }
    buffer.bind()
    initBufferFromData(buffer, data, GL_STREAM_DRAW, 0, 1, false)
    return buffer
  }

  function destroyStream (stream) {
    streamPool.push(stream)
  }

  function initBufferFromTypedArray (buffer, data, usage) {
    buffer.byteLength = data.byteLength
    gl.bufferData(buffer.type, data, usage)
  }

  function initBufferFromData (buffer, data, usage, dtype, dimension, persist) {
    buffer.usage = usage
    if (Array.isArray(data)) {
      buffer.dtype = dtype || GL_FLOAT
      if (data.length > 0) {
        var flatData
        if (Array.isArray(data[0])) {
          buffer.dimension = data[0].length
          flatData = pool.allocType(
            buffer.dtype,
            data.length * buffer.dimension)
          flatten(flatData, data, buffer.dimension)
          initBufferFromTypedArray(buffer, flatData, usage)
          if (persist) {
            buffer.persistentData = flatData
          } else {
            pool.freeType(flatData)
          }
        } else if (typeof data[0] === 'number') {
          buffer.dimension = dimension
          var typedData = pool.allocType(buffer.dtype, data.length)
          copyArray(typedData, data)
          initBufferFromTypedArray(buffer, typedData, usage)
          if (persist) {
            buffer.persistentData = typedData
          } else {
            pool.freeType(typedData)
          }
        } else if (isTypedArray(data[0])) {
          buffer.dimension = data[0].length
          buffer.dtype = dtype || typedArrayCode(data[0]) || GL_FLOAT
          flatData = pool.allocType(
            buffer.dtype,
            data.length * buffer.dimension)
          flatten(flatData, data, buffer.dimension)
          initBufferFromTypedArray(buffer, flatData, usage)
          if (persist) {
            buffer.persistentData = flatData
          } else {
            pool.freeType(flatData)
          }
        } else {
          
        }
      }
    } else if (isTypedArray(data)) {
      buffer.dtype = dtype || typedArrayCode(data)
      buffer.dimension = dimension
      initBufferFromTypedArray(buffer, data, usage)
      if (persist) {
        buffer.persistentData = new Uint8Array(new Uint8Array(data.buffer))
      }
    } else if (isNDArrayLike(data)) {
      var shape = data.shape
      var stride = data.stride
      var offset = data.offset

      var shapeX = 0
      var shapeY = 0
      var strideX = 0
      var strideY = 0
      if (shape.length === 1) {
        shapeX = shape[0]
        shapeY = 1
        strideX = stride[0]
        strideY = 0
      } else if (shape.length === 2) {
        shapeX = shape[0]
        shapeY = shape[1]
        strideX = stride[0]
        strideY = stride[1]
      } else {
        
      }

      buffer.dtype = dtype || typedArrayCode(data.data) || GL_FLOAT
      buffer.dimension = shapeY

      var transposeData = pool.allocType(buffer.dtype, shapeX * shapeY)
      transpose(transposeData,
        data.data,
        shapeX, shapeY,
        strideX, strideY,
        offset)
      initBufferFromTypedArray(buffer, transposeData, usage)
      if (persist) {
        buffer.persistentData = transposeData
      } else {
        pool.freeType(transposeData)
      }
    } else {
      
    }
  }

  function destroy (buffer) {
    stats.bufferCount--

    var handle = buffer.buffer
    
    gl.deleteBuffer(handle)
    buffer.buffer = null
    delete bufferSet[buffer.id]
  }

  function createBuffer (options, type, deferInit, persistent) {
    stats.bufferCount++

    var buffer = new REGLBuffer(type)
    bufferSet[buffer.id] = buffer

    function reglBuffer (options) {
      var usage = GL_STATIC_DRAW
      var data = null
      var byteLength = 0
      var dtype = 0
      var dimension = 1
      if (Array.isArray(options) ||
          isTypedArray(options) ||
          isNDArrayLike(options)) {
        data = options
      } else if (typeof options === 'number') {
        byteLength = options | 0
      } else if (options) {
        

        if ('data' in options) {
          
          data = options.data
        }

        if ('usage' in options) {
          
          usage = usageTypes[options.usage]
        }

        if ('type' in options) {
          
          dtype = bufferTypes[options.type]
        }

        if ('dimension' in options) {
          
          dimension = options.dimension | 0
        }

        if ('length' in options) {
          
          byteLength = options.length | 0
        }
      }

      buffer.bind()
      if (!data) {
        gl.bufferData(buffer.type, byteLength, usage)
        buffer.dtype = dtype || GL_UNSIGNED_BYTE
        buffer.usage = usage
        buffer.dimension = dimension
        buffer.byteLength = byteLength
      } else {
        initBufferFromData(buffer, data, usage, dtype, dimension, persistent)
      }

      if (config.profile) {
        buffer.stats.size = buffer.byteLength * DTYPES_SIZES[buffer.dtype]
      }

      return reglBuffer
    }

    function setSubData (data, offset) {
      

      gl.bufferSubData(buffer.type, offset, data)
    }

    function subdata (data, offset_) {
      var offset = (offset_ || 0) | 0
      buffer.bind()
      if (Array.isArray(data)) {
        if (data.length > 0) {
          if (typeof data[0] === 'number') {
            var converted = pool.allocType(buffer.dtype, data.length)
            copyArray(converted, data)
            setSubData(converted, offset)
            pool.freeType(converted)
          } else if (Array.isArray(data[0]) || isTypedArray(data[0])) {
            var dimension = data[0].length
            var flatData = pool.allocType(buffer.dtype, data.length * dimension)
            flatten(flatData, data, dimension)
            setSubData(flatData, offset)
            pool.freeType(flatData)
          } else {
            
          }
        }
      } else if (isTypedArray(data)) {
        setSubData(data, offset)
      } else if (isNDArrayLike(data)) {
        var shape = data.shape
        var stride = data.stride

        var shapeX = 0
        var shapeY = 0
        var strideX = 0
        var strideY = 0
        if (shape.length === 1) {
          shapeX = shape[0]
          shapeY = 1
          strideX = stride[0]
          strideY = 0
        } else if (shape.length === 2) {
          shapeX = shape[0]
          shapeY = shape[1]
          strideX = stride[0]
          strideY = stride[1]
        } else {
          
        }
        var dtype = Array.isArray(data.data)
          ? buffer.dtype
          : typedArrayCode(data.data)

        var transposeData = pool.allocType(dtype, shapeX * shapeY)
        transpose(transposeData,
          data.data,
          shapeX, shapeY,
          strideX, strideY,
          data.offset)
        setSubData(transposeData, offset)
        pool.freeType(transposeData)
      } else {
        
      }
      return reglBuffer
    }

    if (!deferInit) {
      reglBuffer(options)
    }

    reglBuffer._reglType = 'buffer'
    reglBuffer._buffer = buffer
    reglBuffer.subdata = subdata
    if (config.profile) {
      reglBuffer.stats = buffer.stats
    }
    reglBuffer.destroy = function () { destroy(buffer) }

    return reglBuffer
  }

  function restoreBuffers () {
    values(bufferSet).forEach(function (buffer) {
      buffer.buffer = gl.createBuffer()
      gl.bindBuffer(buffer.type, buffer.buffer)
      gl.bufferData(
        buffer.type, buffer.persistentData || buffer.byteLength, buffer.usage)
    })
  }

  if (config.profile) {
    stats.getTotalBufferSize = function () {
      var total = 0
      // TODO: Right now, the streams are not part of the total count.
      Object.keys(bufferSet).forEach(function (key) {
        total += bufferSet[key].stats.size
      })
      return total
    }
  }

  return {
    create: createBuffer,

    createStream: createStream,
    destroyStream: destroyStream,

    clear: function () {
      values(bufferSet).forEach(destroy)
      streamPool.forEach(destroy)
    },

    getBuffer: function (wrapper) {
      if (wrapper && wrapper._buffer instanceof REGLBuffer) {
        return wrapper._buffer
      }
      return null
    },

    restore: restoreBuffers,

    _initBuffer: initBufferFromData
  }
}

},{"./constants/arraytypes.json":4,"./constants/dtypes.json":5,"./constants/usage.json":7,"./util/is-ndarray":25,"./util/is-typed-array":26,"./util/pool":28,"./util/values":31}],4:[function(require,module,exports){
module.exports={
  "[object Int8Array]": 5120
, "[object Int16Array]": 5122
, "[object Int32Array]": 5124
, "[object Uint8Array]": 5121
, "[object Uint8ClampedArray]": 5121
, "[object Uint16Array]": 5123
, "[object Uint32Array]": 5125
, "[object Float32Array]": 5126
, "[object Float64Array]": 5121
, "[object ArrayBuffer]": 5121
}

},{}],5:[function(require,module,exports){
module.exports={
  "int8": 5120
, "int16": 5122
, "int32": 5124
, "uint8": 5121
, "uint16": 5123
, "uint32": 5125
, "float": 5126
, "float32": 5126
}

},{}],6:[function(require,module,exports){
module.exports={
  "points": 0,
  "point": 0,
  "lines": 1,
  "line": 1,
  "line loop": 2,
  "line strip": 3,
  "triangles": 4,
  "triangle": 4,
  "triangle strip": 5,
  "triangle fan": 6
}

},{}],7:[function(require,module,exports){
module.exports={
  "static": 35044,
  "dynamic": 35048,
  "stream": 35040
}

},{}],8:[function(require,module,exports){

var createEnvironment = require('./util/codegen')
var loop = require('./util/loop')
var isTypedArray = require('./util/is-typed-array')
var isNDArray = require('./util/is-ndarray')
var isArrayLike = require('./util/is-array-like')
var dynamic = require('./dynamic')

var primTypes = require('./constants/primitives.json')
var glTypes = require('./constants/dtypes.json')

// "cute" names for vector components
var CUTE_COMPONENTS = 'xyzw'.split('')

var GL_UNSIGNED_BYTE = 5121

var ATTRIB_STATE_POINTER = 1
var ATTRIB_STATE_CONSTANT = 2

var DYN_FUNC = 0
var DYN_PROP = 1
var DYN_CONTEXT = 2
var DYN_STATE = 3
var DYN_THUNK = 4

var S_DITHER = 'dither'
var S_BLEND_ENABLE = 'blend.enable'
var S_BLEND_COLOR = 'blend.color'
var S_BLEND_EQUATION = 'blend.equation'
var S_BLEND_FUNC = 'blend.func'
var S_DEPTH_ENABLE = 'depth.enable'
var S_DEPTH_FUNC = 'depth.func'
var S_DEPTH_RANGE = 'depth.range'
var S_DEPTH_MASK = 'depth.mask'
var S_COLOR_MASK = 'colorMask'
var S_CULL_ENABLE = 'cull.enable'
var S_CULL_FACE = 'cull.face'
var S_FRONT_FACE = 'frontFace'
var S_LINE_WIDTH = 'lineWidth'
var S_POLYGON_OFFSET_ENABLE = 'polygonOffset.enable'
var S_POLYGON_OFFSET_OFFSET = 'polygonOffset.offset'
var S_SAMPLE_ALPHA = 'sample.alpha'
var S_SAMPLE_ENABLE = 'sample.enable'
var S_SAMPLE_COVERAGE = 'sample.coverage'
var S_STENCIL_ENABLE = 'stencil.enable'
var S_STENCIL_MASK = 'stencil.mask'
var S_STENCIL_FUNC = 'stencil.func'
var S_STENCIL_OPFRONT = 'stencil.opFront'
var S_STENCIL_OPBACK = 'stencil.opBack'
var S_SCISSOR_ENABLE = 'scissor.enable'
var S_SCISSOR_BOX = 'scissor.box'
var S_VIEWPORT = 'viewport'

var S_PROFILE = 'profile'

var S_FRAMEBUFFER = 'framebuffer'
var S_VERT = 'vert'
var S_FRAG = 'frag'
var S_ELEMENTS = 'elements'
var S_PRIMITIVE = 'primitive'
var S_COUNT = 'count'
var S_OFFSET = 'offset'
var S_INSTANCES = 'instances'

var SUFFIX_WIDTH = 'Width'
var SUFFIX_HEIGHT = 'Height'

var S_FRAMEBUFFER_WIDTH = S_FRAMEBUFFER + SUFFIX_WIDTH
var S_FRAMEBUFFER_HEIGHT = S_FRAMEBUFFER + SUFFIX_HEIGHT
var S_VIEWPORT_WIDTH = S_VIEWPORT + SUFFIX_WIDTH
var S_VIEWPORT_HEIGHT = S_VIEWPORT + SUFFIX_HEIGHT
var S_DRAWINGBUFFER = 'drawingBuffer'
var S_DRAWINGBUFFER_WIDTH = S_DRAWINGBUFFER + SUFFIX_WIDTH
var S_DRAWINGBUFFER_HEIGHT = S_DRAWINGBUFFER + SUFFIX_HEIGHT

var NESTED_OPTIONS = [
  S_BLEND_FUNC,
  S_BLEND_EQUATION,
  S_STENCIL_FUNC,
  S_STENCIL_OPFRONT,
  S_STENCIL_OPBACK,
  S_SAMPLE_COVERAGE,
  S_VIEWPORT,
  S_SCISSOR_BOX,
  S_POLYGON_OFFSET_OFFSET
]

var GL_ARRAY_BUFFER = 34962
var GL_ELEMENT_ARRAY_BUFFER = 34963

var GL_FRAGMENT_SHADER = 35632
var GL_VERTEX_SHADER = 35633

var GL_TEXTURE_2D = 0x0DE1
var GL_TEXTURE_CUBE_MAP = 0x8513

var GL_CULL_FACE = 0x0B44
var GL_BLEND = 0x0BE2
var GL_DITHER = 0x0BD0
var GL_STENCIL_TEST = 0x0B90
var GL_DEPTH_TEST = 0x0B71
var GL_SCISSOR_TEST = 0x0C11
var GL_POLYGON_OFFSET_FILL = 0x8037
var GL_SAMPLE_ALPHA_TO_COVERAGE = 0x809E
var GL_SAMPLE_COVERAGE = 0x80A0

var GL_FLOAT = 5126
var GL_FLOAT_VEC2 = 35664
var GL_FLOAT_VEC3 = 35665
var GL_FLOAT_VEC4 = 35666
var GL_INT = 5124
var GL_INT_VEC2 = 35667
var GL_INT_VEC3 = 35668
var GL_INT_VEC4 = 35669
var GL_BOOL = 35670
var GL_BOOL_VEC2 = 35671
var GL_BOOL_VEC3 = 35672
var GL_BOOL_VEC4 = 35673
var GL_FLOAT_MAT2 = 35674
var GL_FLOAT_MAT3 = 35675
var GL_FLOAT_MAT4 = 35676
var GL_SAMPLER_2D = 35678
var GL_SAMPLER_CUBE = 35680

var GL_TRIANGLES = 4

var GL_FRONT = 1028
var GL_BACK = 1029
var GL_CW = 0x0900
var GL_CCW = 0x0901
var GL_MIN_EXT = 0x8007
var GL_MAX_EXT = 0x8008
var GL_ALWAYS = 519
var GL_KEEP = 7680
var GL_ZERO = 0
var GL_ONE = 1
var GL_FUNC_ADD = 0x8006
var GL_LESS = 513

var GL_FRAMEBUFFER = 0x8D40
var GL_COLOR_ATTACHMENT0 = 0x8CE0

var blendFuncs = {
  '0': 0,
  '1': 1,
  'zero': 0,
  'one': 1,
  'src color': 768,
  'one minus src color': 769,
  'src alpha': 770,
  'one minus src alpha': 771,
  'dst color': 774,
  'one minus dst color': 775,
  'dst alpha': 772,
  'one minus dst alpha': 773,
  'constant color': 32769,
  'one minus constant color': 32770,
  'constant alpha': 32771,
  'one minus constant alpha': 32772,
  'src alpha saturate': 776
}

// There are invalid values for srcRGB and dstRGB. See:
// https://www.khronos.org/registry/webgl/specs/1.0/#6.13
// https://github.com/KhronosGroup/WebGL/blob/0d3201f5f7ec3c0060bc1f04077461541f1987b9/conformance-suites/1.0.3/conformance/misc/webgl-specific.html#L56
var invalidBlendCombinations = [
  'constant color, constant alpha',
  'one minus constant color, constant alpha',
  'constant color, one minus constant alpha',
  'one minus constant color, one minus constant alpha',
  'constant alpha, constant color',
  'constant alpha, one minus constant color',
  'one minus constant alpha, constant color',
  'one minus constant alpha, one minus constant color'
]

var compareFuncs = {
  'never': 512,
  'less': 513,
  '<': 513,
  'equal': 514,
  '=': 514,
  '==': 514,
  '===': 514,
  'lequal': 515,
  '<=': 515,
  'greater': 516,
  '>': 516,
  'notequal': 517,
  '!=': 517,
  '!==': 517,
  'gequal': 518,
  '>=': 518,
  'always': 519
}

var stencilOps = {
  '0': 0,
  'zero': 0,
  'keep': 7680,
  'replace': 7681,
  'increment': 7682,
  'decrement': 7683,
  'increment wrap': 34055,
  'decrement wrap': 34056,
  'invert': 5386
}

var shaderType = {
  'frag': GL_FRAGMENT_SHADER,
  'vert': GL_VERTEX_SHADER
}

var orientationType = {
  'cw': GL_CW,
  'ccw': GL_CCW
}

function isBufferArgs (x) {
  return Array.isArray(x) ||
    isTypedArray(x) ||
    isNDArray(x)
}

// Make sure viewport is processed first
function sortState (state) {
  return state.sort(function (a, b) {
    if (a === S_VIEWPORT) {
      return -1
    } else if (b === S_VIEWPORT) {
      return 1
    }
    return (a < b) ? -1 : 1
  })
}

function Declaration (thisDep, contextDep, propDep, append) {
  this.thisDep = thisDep
  this.contextDep = contextDep
  this.propDep = propDep
  this.append = append
}

function isStatic (decl) {
  return decl && !(decl.thisDep || decl.contextDep || decl.propDep)
}

function createStaticDecl (append) {
  return new Declaration(false, false, false, append)
}

function createDynamicDecl (dyn, append) {
  var type = dyn.type
  if (type === DYN_FUNC) {
    var numArgs = dyn.data.length
    return new Declaration(
      true,
      numArgs >= 1,
      numArgs >= 2,
      append)
  } else if (type === DYN_THUNK) {
    var data = dyn.data
    return new Declaration(
      data.thisDep,
      data.contextDep,
      data.propDep,
      append)
  } else {
    return new Declaration(
      type === DYN_STATE,
      type === DYN_CONTEXT,
      type === DYN_PROP,
      append)
  }
}

var SCOPE_DECL = new Declaration(false, false, false, function () {})

module.exports = function reglCore (
  gl,
  stringStore,
  extensions,
  limits,
  bufferState,
  elementState,
  textureState,
  framebufferState,
  uniformState,
  attributeState,
  shaderState,
  drawState,
  contextState,
  timer,
  config) {
  var AttributeRecord = attributeState.Record

  var blendEquations = {
    'add': 32774,
    'subtract': 32778,
    'reverse subtract': 32779
  }
  if (extensions.ext_blend_minmax) {
    blendEquations.min = GL_MIN_EXT
    blendEquations.max = GL_MAX_EXT
  }

  var extInstancing = extensions.angle_instanced_arrays
  var extDrawBuffers = extensions.webgl_draw_buffers

  // ===================================================
  // ===================================================
  // WEBGL STATE
  // ===================================================
  // ===================================================
  var currentState = {
    dirty: true,
    profile: config.profile
  }
  var nextState = {}
  var GL_STATE_NAMES = []
  var GL_FLAGS = {}
  var GL_VARIABLES = {}

  function propName (name) {
    return name.replace('.', '_')
  }

  function stateFlag (sname, cap, init) {
    var name = propName(sname)
    GL_STATE_NAMES.push(sname)
    nextState[name] = currentState[name] = !!init
    GL_FLAGS[name] = cap
  }

  function stateVariable (sname, func, init) {
    var name = propName(sname)
    GL_STATE_NAMES.push(sname)
    if (Array.isArray(init)) {
      currentState[name] = init.slice()
      nextState[name] = init.slice()
    } else {
      currentState[name] = nextState[name] = init
    }
    GL_VARIABLES[name] = func
  }

  // Dithering
  stateFlag(S_DITHER, GL_DITHER)

  // Blending
  stateFlag(S_BLEND_ENABLE, GL_BLEND)
  stateVariable(S_BLEND_COLOR, 'blendColor', [0, 0, 0, 0])
  stateVariable(S_BLEND_EQUATION, 'blendEquationSeparate',
    [GL_FUNC_ADD, GL_FUNC_ADD])
  stateVariable(S_BLEND_FUNC, 'blendFuncSeparate',
    [GL_ONE, GL_ZERO, GL_ONE, GL_ZERO])

  // Depth
  stateFlag(S_DEPTH_ENABLE, GL_DEPTH_TEST, true)
  stateVariable(S_DEPTH_FUNC, 'depthFunc', GL_LESS)
  stateVariable(S_DEPTH_RANGE, 'depthRange', [0, 1])
  stateVariable(S_DEPTH_MASK, 'depthMask', true)

  // Color mask
  stateVariable(S_COLOR_MASK, S_COLOR_MASK, [true, true, true, true])

  // Face culling
  stateFlag(S_CULL_ENABLE, GL_CULL_FACE)
  stateVariable(S_CULL_FACE, 'cullFace', GL_BACK)

  // Front face orientation
  stateVariable(S_FRONT_FACE, S_FRONT_FACE, GL_CCW)

  // Line width
  stateVariable(S_LINE_WIDTH, S_LINE_WIDTH, 1)

  // Polygon offset
  stateFlag(S_POLYGON_OFFSET_ENABLE, GL_POLYGON_OFFSET_FILL)
  stateVariable(S_POLYGON_OFFSET_OFFSET, 'polygonOffset', [0, 0])

  // Sample coverage
  stateFlag(S_SAMPLE_ALPHA, GL_SAMPLE_ALPHA_TO_COVERAGE)
  stateFlag(S_SAMPLE_ENABLE, GL_SAMPLE_COVERAGE)
  stateVariable(S_SAMPLE_COVERAGE, 'sampleCoverage', [1, false])

  // Stencil
  stateFlag(S_STENCIL_ENABLE, GL_STENCIL_TEST)
  stateVariable(S_STENCIL_MASK, 'stencilMask', -1)
  stateVariable(S_STENCIL_FUNC, 'stencilFunc', [GL_ALWAYS, 0, -1])
  stateVariable(S_STENCIL_OPFRONT, 'stencilOpSeparate',
    [GL_FRONT, GL_KEEP, GL_KEEP, GL_KEEP])
  stateVariable(S_STENCIL_OPBACK, 'stencilOpSeparate',
    [GL_BACK, GL_KEEP, GL_KEEP, GL_KEEP])

  // Scissor
  stateFlag(S_SCISSOR_ENABLE, GL_SCISSOR_TEST)
  stateVariable(S_SCISSOR_BOX, 'scissor',
    [0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight])

  // Viewport
  stateVariable(S_VIEWPORT, S_VIEWPORT,
    [0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight])

  // ===================================================
  // ===================================================
  // ENVIRONMENT
  // ===================================================
  // ===================================================
  var sharedState = {
    gl: gl,
    context: contextState,
    strings: stringStore,
    next: nextState,
    current: currentState,
    draw: drawState,
    elements: elementState,
    buffer: bufferState,
    shader: shaderState,
    attributes: attributeState.state,
    uniforms: uniformState,
    framebuffer: framebufferState,
    extensions: extensions,

    timer: timer,
    isBufferArgs: isBufferArgs
  }

  var sharedConstants = {
    primTypes: primTypes,
    compareFuncs: compareFuncs,
    blendFuncs: blendFuncs,
    blendEquations: blendEquations,
    stencilOps: stencilOps,
    glTypes: glTypes,
    orientationType: orientationType
  }

  

  if (extDrawBuffers) {
    sharedConstants.backBuffer = [GL_BACK]
    sharedConstants.drawBuffer = loop(limits.maxDrawbuffers, function (i) {
      if (i === 0) {
        return [0]
      }
      return loop(i, function (j) {
        return GL_COLOR_ATTACHMENT0 + j
      })
    })
  }

  var drawCallCounter = 0
  function createREGLEnvironment () {
    var env = createEnvironment()
    var link = env.link
    var global = env.global
    env.id = drawCallCounter++

    env.batchId = '0'

    // link shared state
    var SHARED = link(sharedState)
    var shared = env.shared = {
      props: 'a0'
    }
    Object.keys(sharedState).forEach(function (prop) {
      shared[prop] = global.def(SHARED, '.', prop)
    })

    // Inject runtime assertion stuff for debug builds
    

    // Copy GL state variables over
    var nextVars = env.next = {}
    var currentVars = env.current = {}
    Object.keys(GL_VARIABLES).forEach(function (variable) {
      if (Array.isArray(currentState[variable])) {
        nextVars[variable] = global.def(shared.next, '.', variable)
        currentVars[variable] = global.def(shared.current, '.', variable)
      }
    })

    // Initialize shared constants
    var constants = env.constants = {}
    Object.keys(sharedConstants).forEach(function (name) {
      constants[name] = global.def(JSON.stringify(sharedConstants[name]))
    })

    // Helper function for calling a block
    env.invoke = function (block, x) {
      switch (x.type) {
        case DYN_FUNC:
          var argList = [
            'this',
            shared.context,
            shared.props,
            env.batchId
          ]
          return block.def(
            link(x.data), '.call(',
              argList.slice(0, Math.max(x.data.length + 1, 4)),
             ')')
        case DYN_PROP:
          return block.def(shared.props, x.data)
        case DYN_CONTEXT:
          return block.def(shared.context, x.data)
        case DYN_STATE:
          return block.def('this', x.data)
        case DYN_THUNK:
          x.data.append(env, block)
          return x.data.ref
      }
    }

    env.attribCache = {}

    var scopeAttribs = {}
    env.scopeAttrib = function (name) {
      var id = stringStore.id(name)
      if (id in scopeAttribs) {
        return scopeAttribs[id]
      }
      var binding = attributeState.scope[id]
      if (!binding) {
        binding = attributeState.scope[id] = new AttributeRecord()
      }
      var result = scopeAttribs[id] = link(binding)
      return result
    }

    return env
  }

  // ===================================================
  // ===================================================
  // PARSING
  // ===================================================
  // ===================================================
  function parseProfile (options) {
    var staticOptions = options.static
    var dynamicOptions = options.dynamic

    var profileEnable
    if (S_PROFILE in staticOptions) {
      var value = !!staticOptions[S_PROFILE]
      profileEnable = createStaticDecl(function (env, scope) {
        return value
      })
      profileEnable.enable = value
    } else if (S_PROFILE in dynamicOptions) {
      var dyn = dynamicOptions[S_PROFILE]
      profileEnable = createDynamicDecl(dyn, function (env, scope) {
        return env.invoke(scope, dyn)
      })
    }

    return profileEnable
  }

  function parseFramebuffer (options, env) {
    var staticOptions = options.static
    var dynamicOptions = options.dynamic

    if (S_FRAMEBUFFER in staticOptions) {
      var framebuffer = staticOptions[S_FRAMEBUFFER]
      if (framebuffer) {
        framebuffer = framebufferState.getFramebuffer(framebuffer)
        
        return createStaticDecl(function (env, block) {
          var FRAMEBUFFER = env.link(framebuffer)
          var shared = env.shared
          block.set(
            shared.framebuffer,
            '.next',
            FRAMEBUFFER)
          var CONTEXT = shared.context
          block.set(
            CONTEXT,
            '.' + S_FRAMEBUFFER_WIDTH,
            FRAMEBUFFER + '.width')
          block.set(
            CONTEXT,
            '.' + S_FRAMEBUFFER_HEIGHT,
            FRAMEBUFFER + '.height')
          return FRAMEBUFFER
        })
      } else {
        return createStaticDecl(function (env, scope) {
          var shared = env.shared
          scope.set(
            shared.framebuffer,
            '.next',
            'null')
          var CONTEXT = shared.context
          scope.set(
            CONTEXT,
            '.' + S_FRAMEBUFFER_WIDTH,
            CONTEXT + '.' + S_DRAWINGBUFFER_WIDTH)
          scope.set(
            CONTEXT,
            '.' + S_FRAMEBUFFER_HEIGHT,
            CONTEXT + '.' + S_DRAWINGBUFFER_HEIGHT)
          return 'null'
        })
      }
    } else if (S_FRAMEBUFFER in dynamicOptions) {
      var dyn = dynamicOptions[S_FRAMEBUFFER]
      return createDynamicDecl(dyn, function (env, scope) {
        var FRAMEBUFFER_FUNC = env.invoke(scope, dyn)
        var shared = env.shared
        var FRAMEBUFFER_STATE = shared.framebuffer
        var FRAMEBUFFER = scope.def(
          FRAMEBUFFER_STATE, '.getFramebuffer(', FRAMEBUFFER_FUNC, ')')

        

        scope.set(
          FRAMEBUFFER_STATE,
          '.next',
          FRAMEBUFFER)
        var CONTEXT = shared.context
        scope.set(
          CONTEXT,
          '.' + S_FRAMEBUFFER_WIDTH,
          FRAMEBUFFER + '?' + FRAMEBUFFER + '.width:' +
          CONTEXT + '.' + S_DRAWINGBUFFER_WIDTH)
        scope.set(
          CONTEXT,
          '.' + S_FRAMEBUFFER_HEIGHT,
          FRAMEBUFFER +
          '?' + FRAMEBUFFER + '.height:' +
          CONTEXT + '.' + S_DRAWINGBUFFER_HEIGHT)
        return FRAMEBUFFER
      })
    } else {
      return null
    }
  }

  function parseViewportScissor (options, framebuffer, env) {
    var staticOptions = options.static
    var dynamicOptions = options.dynamic

    function parseBox (param) {
      if (param in staticOptions) {
        var box = staticOptions[param]
        

        var isStatic = true
        var x = box.x | 0
        var y = box.y | 0
        
        var w, h
        if ('width' in box) {
          w = box.width | 0
          
        } else {
          isStatic = false
        }
        if ('height' in box) {
          h = box.height | 0
          
        } else {
          isStatic = false
        }

        return new Declaration(
          !isStatic && framebuffer && framebuffer.thisDep,
          !isStatic && framebuffer && framebuffer.contextDep,
          !isStatic && framebuffer && framebuffer.propDep,
          function (env, scope) {
            var CONTEXT = env.shared.context
            var BOX_W = w
            if (!('width' in box)) {
              BOX_W = scope.def(CONTEXT, '.', S_FRAMEBUFFER_WIDTH, '-', x)
            } else {
              
            }
            var BOX_H = h
            if (!('height' in box)) {
              BOX_H = scope.def(CONTEXT, '.', S_FRAMEBUFFER_HEIGHT, '-', y)
            } else {
              
            }
            return [x, y, BOX_W, BOX_H]
          })
      } else if (param in dynamicOptions) {
        var dynBox = dynamicOptions[param]
        var result = createDynamicDecl(dynBox, function (env, scope) {
          var BOX = env.invoke(scope, dynBox)

          

          var CONTEXT = env.shared.context
          var BOX_X = scope.def(BOX, '.x|0')
          var BOX_Y = scope.def(BOX, '.y|0')
          var BOX_W = scope.def(
            '"width" in ', BOX, '?', BOX, '.width|0:',
            '(', CONTEXT, '.', S_FRAMEBUFFER_WIDTH, '-', BOX_X, ')')
          var BOX_H = scope.def(
            '"height" in ', BOX, '?', BOX, '.height|0:',
            '(', CONTEXT, '.', S_FRAMEBUFFER_HEIGHT, '-', BOX_Y, ')')

          

          return [BOX_X, BOX_Y, BOX_W, BOX_H]
        })
        if (framebuffer) {
          result.thisDep = result.thisDep || framebuffer.thisDep
          result.contextDep = result.contextDep || framebuffer.contextDep
          result.propDep = result.propDep || framebuffer.propDep
        }
        return result
      } else if (framebuffer) {
        return new Declaration(
          framebuffer.thisDep,
          framebuffer.contextDep,
          framebuffer.propDep,
          function (env, scope) {
            var CONTEXT = env.shared.context
            return [
              0, 0,
              scope.def(CONTEXT, '.', S_FRAMEBUFFER_WIDTH),
              scope.def(CONTEXT, '.', S_FRAMEBUFFER_HEIGHT)]
          })
      } else {
        return null
      }
    }

    var viewport = parseBox(S_VIEWPORT)

    if (viewport) {
      var prevViewport = viewport
      viewport = new Declaration(
        viewport.thisDep,
        viewport.contextDep,
        viewport.propDep,
        function (env, scope) {
          var VIEWPORT = prevViewport.append(env, scope)
          var CONTEXT = env.shared.context
          scope.set(
            CONTEXT,
            '.' + S_VIEWPORT_WIDTH,
            VIEWPORT[2])
          scope.set(
            CONTEXT,
            '.' + S_VIEWPORT_HEIGHT,
            VIEWPORT[3])
          return VIEWPORT
        })
    }

    return {
      viewport: viewport,
      scissor_box: parseBox(S_SCISSOR_BOX)
    }
  }

  function parseProgram (options) {
    var staticOptions = options.static
    var dynamicOptions = options.dynamic

    function parseShader (name) {
      if (name in staticOptions) {
        var id = stringStore.id(staticOptions[name])
        
        var result = createStaticDecl(function () {
          return id
        })
        result.id = id
        return result
      } else if (name in dynamicOptions) {
        var dyn = dynamicOptions[name]
        return createDynamicDecl(dyn, function (env, scope) {
          var str = env.invoke(scope, dyn)
          var id = scope.def(env.shared.strings, '.id(', str, ')')
          
          return id
        })
      }
      return null
    }

    var frag = parseShader(S_FRAG)
    var vert = parseShader(S_VERT)

    var program = null
    var progVar
    if (isStatic(frag) && isStatic(vert)) {
      program = shaderState.program(vert.id, frag.id)
      progVar = createStaticDecl(function (env, scope) {
        return env.link(program)
      })
    } else {
      progVar = new Declaration(
        (frag && frag.thisDep) || (vert && vert.thisDep),
        (frag && frag.contextDep) || (vert && vert.contextDep),
        (frag && frag.propDep) || (vert && vert.propDep),
        function (env, scope) {
          var SHADER_STATE = env.shared.shader
          var fragId
          if (frag) {
            fragId = frag.append(env, scope)
          } else {
            fragId = scope.def(SHADER_STATE, '.', S_FRAG)
          }
          var vertId
          if (vert) {
            vertId = vert.append(env, scope)
          } else {
            vertId = scope.def(SHADER_STATE, '.', S_VERT)
          }
          var progDef = SHADER_STATE + '.program(' + vertId + ',' + fragId
          
          return scope.def(progDef + ')')
        })
    }

    return {
      frag: frag,
      vert: vert,
      progVar: progVar,
      program: program
    }
  }

  function parseDraw (options, env) {
    var staticOptions = options.static
    var dynamicOptions = options.dynamic

    function parseElements () {
      if (S_ELEMENTS in staticOptions) {
        var elements = staticOptions[S_ELEMENTS]
        if (isBufferArgs(elements)) {
          elements = elementState.getElements(elementState.create(elements, true))
        } else if (elements) {
          elements = elementState.getElements(elements)
          
        }
        var result = createStaticDecl(function (env, scope) {
          if (elements) {
            var result = env.link(elements)
            env.ELEMENTS = result
            return result
          }
          env.ELEMENTS = null
          return null
        })
        result.value = elements
        return result
      } else if (S_ELEMENTS in dynamicOptions) {
        var dyn = dynamicOptions[S_ELEMENTS]
        return createDynamicDecl(dyn, function (env, scope) {
          var shared = env.shared

          var IS_BUFFER_ARGS = shared.isBufferArgs
          var ELEMENT_STATE = shared.elements

          var elementDefn = env.invoke(scope, dyn)
          var elements = scope.def('null')
          var elementStream = scope.def(IS_BUFFER_ARGS, '(', elementDefn, ')')

          var ifte = env.cond(elementStream)
            .then(elements, '=', ELEMENT_STATE, '.createStream(', elementDefn, ');')
            .else(elements, '=', ELEMENT_STATE, '.getElements(', elementDefn, ');')

          

          scope.entry(ifte)
          scope.exit(
            env.cond(elementStream)
              .then(ELEMENT_STATE, '.destroyStream(', elements, ');'))

          env.ELEMENTS = elements

          return elements
        })
      }

      return null
    }

    var elements = parseElements()

    function parsePrimitive () {
      if (S_PRIMITIVE in staticOptions) {
        var primitive = staticOptions[S_PRIMITIVE]
        
        return createStaticDecl(function (env, scope) {
          return primTypes[primitive]
        })
      } else if (S_PRIMITIVE in dynamicOptions) {
        var dynPrimitive = dynamicOptions[S_PRIMITIVE]
        return createDynamicDecl(dynPrimitive, function (env, scope) {
          var PRIM_TYPES = env.constants.primTypes
          var prim = env.invoke(scope, dynPrimitive)
          
          return scope.def(PRIM_TYPES, '[', prim, ']')
        })
      } else if (elements) {
        if (isStatic(elements)) {
          if (elements.value) {
            return createStaticDecl(function (env, scope) {
              return scope.def(env.ELEMENTS, '.primType')
            })
          } else {
            return createStaticDecl(function () {
              return GL_TRIANGLES
            })
          }
        } else {
          return new Declaration(
            elements.thisDep,
            elements.contextDep,
            elements.propDep,
            function (env, scope) {
              var elements = env.ELEMENTS
              return scope.def(elements, '?', elements, '.primType:', GL_TRIANGLES)
            })
        }
      }
      return null
    }

    function parseParam (param, isOffset) {
      if (param in staticOptions) {
        var value = staticOptions[param] | 0
        
        return createStaticDecl(function (env, scope) {
          if (isOffset) {
            env.OFFSET = value
          }
          return value
        })
      } else if (param in dynamicOptions) {
        var dynValue = dynamicOptions[param]
        return createDynamicDecl(dynValue, function (env, scope) {
          var result = env.invoke(scope, dynValue)
          if (isOffset) {
            env.OFFSET = result
            
          }
          return result
        })
      } else if (isOffset && elements) {
        return createStaticDecl(function (env, scope) {
          env.OFFSET = '0'
          return 0
        })
      }
      return null
    }

    var OFFSET = parseParam(S_OFFSET, true)

    function parseVertCount () {
      if (S_COUNT in staticOptions) {
        var count = staticOptions[S_COUNT] | 0
        
        return createStaticDecl(function () {
          return count
        })
      } else if (S_COUNT in dynamicOptions) {
        var dynCount = dynamicOptions[S_COUNT]
        return createDynamicDecl(dynCount, function (env, scope) {
          var result = env.invoke(scope, dynCount)
          
          return result
        })
      } else if (elements) {
        if (isStatic(elements)) {
          if (elements) {
            if (OFFSET) {
              return new Declaration(
                OFFSET.thisDep,
                OFFSET.contextDep,
                OFFSET.propDep,
                function (env, scope) {
                  var result = scope.def(
                    env.ELEMENTS, '.vertCount-', env.OFFSET)

                  

                  return result
                })
            } else {
              return createStaticDecl(function (env, scope) {
                return scope.def(env.ELEMENTS, '.vertCount')
              })
            }
          } else {
            var result = createStaticDecl(function () {
              return -1
            })
            
            return result
          }
        } else {
          var variable = new Declaration(
            elements.thisDep || OFFSET.thisDep,
            elements.contextDep || OFFSET.contextDep,
            elements.propDep || OFFSET.propDep,
            function (env, scope) {
              var elements = env.ELEMENTS
              if (env.OFFSET) {
                return scope.def(elements, '?', elements, '.vertCount-',
                  env.OFFSET, ':-1')
              }
              return scope.def(elements, '?', elements, '.vertCount:-1')
            })
          
          return variable
        }
      }
      return null
    }

    return {
      elements: elements,
      primitive: parsePrimitive(),
      count: parseVertCount(),
      instances: parseParam(S_INSTANCES, false),
      offset: OFFSET
    }
  }

  function parseGLState (options, env) {
    var staticOptions = options.static
    var dynamicOptions = options.dynamic

    var STATE = {}

    GL_STATE_NAMES.forEach(function (prop) {
      var param = propName(prop)

      function parseParam (parseStatic, parseDynamic) {
        if (prop in staticOptions) {
          var value = parseStatic(staticOptions[prop])
          STATE[param] = createStaticDecl(function () {
            return value
          })
        } else if (prop in dynamicOptions) {
          var dyn = dynamicOptions[prop]
          STATE[param] = createDynamicDecl(dyn, function (env, scope) {
            return parseDynamic(env, scope, env.invoke(scope, dyn))
          })
        }
      }

      switch (prop) {
        case S_CULL_ENABLE:
        case S_BLEND_ENABLE:
        case S_DITHER:
        case S_STENCIL_ENABLE:
        case S_DEPTH_ENABLE:
        case S_SCISSOR_ENABLE:
        case S_POLYGON_OFFSET_ENABLE:
        case S_SAMPLE_ALPHA:
        case S_SAMPLE_ENABLE:
        case S_DEPTH_MASK:
          return parseParam(
            function (value) {
              
              return value
            },
            function (env, scope, value) {
              
              return value
            })

        case S_DEPTH_FUNC:
          return parseParam(
            function (value) {
              
              return compareFuncs[value]
            },
            function (env, scope, value) {
              var COMPARE_FUNCS = env.constants.compareFuncs
              
              return scope.def(COMPARE_FUNCS, '[', value, ']')
            })

        case S_DEPTH_RANGE:
          return parseParam(
            function (value) {
              
              return value
            },
            function (env, scope, value) {
              

              var Z_NEAR = scope.def('+', value, '[0]')
              var Z_FAR = scope.def('+', value, '[1]')
              return [Z_NEAR, Z_FAR]
            })

        case S_BLEND_FUNC:
          return parseParam(
            function (value) {
              
              var srcRGB = ('srcRGB' in value ? value.srcRGB : value.src)
              var srcAlpha = ('srcAlpha' in value ? value.srcAlpha : value.src)
              var dstRGB = ('dstRGB' in value ? value.dstRGB : value.dst)
              var dstAlpha = ('dstAlpha' in value ? value.dstAlpha : value.dst)
              
              
              
              

              

              return [
                blendFuncs[srcRGB],
                blendFuncs[dstRGB],
                blendFuncs[srcAlpha],
                blendFuncs[dstAlpha]
              ]
            },
            function (env, scope, value) {
              var BLEND_FUNCS = env.constants.blendFuncs

              

              function read (prefix, suffix) {
                var func = scope.def(
                  '"', prefix, suffix, '" in ', value,
                  '?', value, '.', prefix, suffix,
                  ':', value, '.', prefix)

                

                return func
              }

              var srcRGB = read('src', 'RGB')
              var dstRGB = read('dst', 'RGB')

              

              var SRC_RGB = scope.def(BLEND_FUNCS, '[', srcRGB, ']')
              var SRC_ALPHA = scope.def(BLEND_FUNCS, '[', read('src', 'Alpha'), ']')
              var DST_RGB = scope.def(BLEND_FUNCS, '[', dstRGB, ']')
              var DST_ALPHA = scope.def(BLEND_FUNCS, '[', read('dst', 'Alpha'), ']')

              return [SRC_RGB, DST_RGB, SRC_ALPHA, DST_ALPHA]
            })

        case S_BLEND_EQUATION:
          return parseParam(
            function (value) {
              if (typeof value === 'string') {
                
                return [
                  blendEquations[value],
                  blendEquations[value]
                ]
              } else if (typeof value === 'object') {
                
                
                return [
                  blendEquations[value.rgb],
                  blendEquations[value.alpha]
                ]
              } else {
                
              }
            },
            function (env, scope, value) {
              var BLEND_EQUATIONS = env.constants.blendEquations

              var RGB = scope.def()
              var ALPHA = scope.def()

              var ifte = env.cond('typeof ', value, '==="string"')

              

              ifte.then(
                RGB, '=', ALPHA, '=', BLEND_EQUATIONS, '[', value, '];')
              ifte.else(
                RGB, '=', BLEND_EQUATIONS, '[', value, '.rgb];',
                ALPHA, '=', BLEND_EQUATIONS, '[', value, '.alpha];')

              scope(ifte)

              return [RGB, ALPHA]
            })

        case S_BLEND_COLOR:
          return parseParam(
            function (value) {
              
              return loop(4, function (i) {
                return +value[i]
              })
            },
            function (env, scope, value) {
              
              return loop(4, function (i) {
                return scope.def('+', value, '[', i, ']')
              })
            })

        case S_STENCIL_MASK:
          return parseParam(
            function (value) {
              
              return value | 0
            },
            function (env, scope, value) {
              
              return scope.def(value, '|0')
            })

        case S_STENCIL_FUNC:
          return parseParam(
            function (value) {
              
              var cmp = value.cmp || 'keep'
              var ref = value.ref || 0
              var mask = 'mask' in value ? value.mask : -1
              
              
              
              return [
                compareFuncs[cmp],
                ref,
                mask
              ]
            },
            function (env, scope, value) {
              var COMPARE_FUNCS = env.constants.compareFuncs
              
              var cmp = scope.def(
                '"cmp" in ', value,
                '?', COMPARE_FUNCS, '[', value, '.cmp]',
                ':', GL_KEEP)
              var ref = scope.def(value, '.ref|0')
              var mask = scope.def(
                '"mask" in ', value,
                '?', value, '.mask|0:-1')
              return [cmp, ref, mask]
            })

        case S_STENCIL_OPFRONT:
        case S_STENCIL_OPBACK:
          return parseParam(
            function (value) {
              
              var fail = value.fail || 'keep'
              var zfail = value.zfail || 'keep'
              var zpass = value.zpass || 'keep'
              
              
              
              return [
                prop === S_STENCIL_OPBACK ? GL_BACK : GL_FRONT,
                stencilOps[fail],
                stencilOps[zfail],
                stencilOps[zpass]
              ]
            },
            function (env, scope, value) {
              var STENCIL_OPS = env.constants.stencilOps

              

              function read (name) {
                

                return scope.def(
                  '"', name, '" in ', value,
                  '?', STENCIL_OPS, '[', value, '.', name, ']:',
                  GL_KEEP)
              }

              return [
                prop === S_STENCIL_OPBACK ? GL_BACK : GL_FRONT,
                read('fail'),
                read('zfail'),
                read('zpass')
              ]
            })

        case S_POLYGON_OFFSET_OFFSET:
          return parseParam(
            function (value) {
              
              var factor = value.factor | 0
              var units = value.units | 0
              
              
              return [factor, units]
            },
            function (env, scope, value) {
              

              var FACTOR = scope.def(value, '.factor|0')
              var UNITS = scope.def(value, '.units|0')

              return [FACTOR, UNITS]
            })

        case S_CULL_FACE:
          return parseParam(
            function (value) {
              var face = 0
              if (value === 'front') {
                face = GL_FRONT
              } else if (value === 'back') {
                face = GL_BACK
              }
              
              return face
            },
            function (env, scope, value) {
              
              return scope.def(value, '==="front"?', GL_FRONT, ':', GL_BACK)
            })

        case S_LINE_WIDTH:
          return parseParam(
            function (value) {
              
              return value
            },
            function (env, scope, value) {
              

              return value
            })

        case S_FRONT_FACE:
          return parseParam(
            function (value) {
              
              return orientationType[value]
            },
            function (env, scope, value) {
              
              return scope.def(value + '==="cw"?' + GL_CW + ':' + GL_CCW)
            })

        case S_COLOR_MASK:
          return parseParam(
            function (value) {
              
              return value.map(function (v) { return !!v })
            },
            function (env, scope, value) {
              
              return loop(4, function (i) {
                return '!!' + value + '[' + i + ']'
              })
            })

        case S_SAMPLE_COVERAGE:
          return parseParam(
            function (value) {
              
              var sampleValue = 'value' in value ? value.value : 1
              var sampleInvert = !!value.invert
              
              return [sampleValue, sampleInvert]
            },
            function (env, scope, value) {
              
              var VALUE = scope.def(
                '"value" in ', value, '?+', value, '.value:1')
              var INVERT = scope.def('!!', value, '.invert')
              return [VALUE, INVERT]
            })
      }
    })

    return STATE
  }

  function parseUniforms (uniforms, env) {
    var staticUniforms = uniforms.static
    var dynamicUniforms = uniforms.dynamic

    var UNIFORMS = {}

    Object.keys(staticUniforms).forEach(function (name) {
      var value = staticUniforms[name]
      var result
      if (typeof value === 'number' ||
          typeof value === 'boolean') {
        result = createStaticDecl(function () {
          return value
        })
      } else if (typeof value === 'function') {
        var reglType = value._reglType
        if (reglType === 'texture2d' ||
            reglType === 'textureCube') {
          result = createStaticDecl(function (env) {
            return env.link(value)
          })
        } else if (reglType === 'framebuffer' ||
                   reglType === 'framebufferCube') {
          
          result = createStaticDecl(function (env) {
            return env.link(value.color[0])
          })
        } else {
          
        }
      } else if (isArrayLike(value)) {
        result = createStaticDecl(function (env) {
          var ITEM = env.global.def('[',
            loop(value.length, function (i) {
              
              return value[i]
            }), ']')
          return ITEM
        })
      } else {
        
      }
      result.value = value
      UNIFORMS[name] = result
    })

    Object.keys(dynamicUniforms).forEach(function (key) {
      var dyn = dynamicUniforms[key]
      UNIFORMS[key] = createDynamicDecl(dyn, function (env, scope) {
        return env.invoke(scope, dyn)
      })
    })

    return UNIFORMS
  }

  function parseAttributes (attributes, env) {
    var staticAttributes = attributes.static
    var dynamicAttributes = attributes.dynamic

    var attributeDefs = {}

    Object.keys(staticAttributes).forEach(function (attribute) {
      var value = staticAttributes[attribute]
      var id = stringStore.id(attribute)

      var record = new AttributeRecord()
      if (isBufferArgs(value)) {
        record.state = ATTRIB_STATE_POINTER
        record.buffer = bufferState.getBuffer(
          bufferState.create(value, GL_ARRAY_BUFFER, false, true))
        record.type = 0
      } else {
        var buffer = bufferState.getBuffer(value)
        if (buffer) {
          record.state = ATTRIB_STATE_POINTER
          record.buffer = buffer
          record.type = 0
        } else {
          
          if (value.constant) {
            var constant = value.constant
            record.buffer = 'null'
            record.state = ATTRIB_STATE_CONSTANT
            if (typeof constant === 'number') {
              record.x = constant
            } else {
              
              CUTE_COMPONENTS.forEach(function (c, i) {
                if (i < constant.length) {
                  record[c] = constant[i]
                }
              })
            }
          } else {
            if (isBufferArgs(value.buffer)) {
              buffer = bufferState.getBuffer(
                bufferState.create(value.buffer, GL_ARRAY_BUFFER, false, true))
            } else {
              buffer = bufferState.getBuffer(value.buffer)
            }
            

            var offset = value.offset | 0
            

            var stride = value.stride | 0
            

            var size = value.size | 0
            

            var normalized = !!value.normalized

            var type = 0
            if ('type' in value) {
              
              type = glTypes[value.type]
            }

            var divisor = value.divisor | 0
            if ('divisor' in value) {
              
              
            }

            

            record.buffer = buffer
            record.state = ATTRIB_STATE_POINTER
            record.size = size
            record.normalized = normalized
            record.type = type || buffer.dtype
            record.offset = offset
            record.stride = stride
            record.divisor = divisor
          }
        }
      }

      attributeDefs[attribute] = createStaticDecl(function (env, scope) {
        var cache = env.attribCache
        if (id in cache) {
          return cache[id]
        }
        var result = {
          isStream: false
        }
        Object.keys(record).forEach(function (key) {
          result[key] = record[key]
        })
        if (record.buffer) {
          result.buffer = env.link(record.buffer)
          result.type = result.type || (result.buffer + '.dtype')
        }
        cache[id] = result
        return result
      })
    })

    Object.keys(dynamicAttributes).forEach(function (attribute) {
      var dyn = dynamicAttributes[attribute]

      function appendAttributeCode (env, block) {
        var VALUE = env.invoke(block, dyn)

        var shared = env.shared

        var IS_BUFFER_ARGS = shared.isBufferArgs
        var BUFFER_STATE = shared.buffer

        // Perform validation on attribute
        

        // allocate names for result
        var result = {
          isStream: block.def(false)
        }
        var defaultRecord = new AttributeRecord()
        defaultRecord.state = ATTRIB_STATE_POINTER
        Object.keys(defaultRecord).forEach(function (key) {
          result[key] = block.def('' + defaultRecord[key])
        })

        var BUFFER = result.buffer
        var TYPE = result.type
        block(
          'if(', IS_BUFFER_ARGS, '(', VALUE, ')){',
          result.isStream, '=true;',
          BUFFER, '=', BUFFER_STATE, '.createStream(', GL_ARRAY_BUFFER, ',', VALUE, ');',
          TYPE, '=', BUFFER, '.dtype;',
          '}else{',
          BUFFER, '=', BUFFER_STATE, '.getBuffer(', VALUE, ');',
          'if(', BUFFER, '){',
          TYPE, '=', BUFFER, '.dtype;',
          '}else if("constant" in ', VALUE, '){',
          result.state, '=', ATTRIB_STATE_CONSTANT, ';',
          'if(typeof ' + VALUE + '.constant === "number"){',
          result[CUTE_COMPONENTS[0]], '=', VALUE, '.constant;',
          CUTE_COMPONENTS.slice(1).map(function (n) {
            return result[n]
          }).join('='), '=0;',
          '}else{',
          CUTE_COMPONENTS.map(function (name, i) {
            return (
              result[name] + '=' + VALUE + '.constant.length>=' + i +
              '?' + VALUE + '.constant[' + i + ']:0;'
            )
          }).join(''),
          '}}else{',
          'if(', IS_BUFFER_ARGS, '(', VALUE, '.buffer)){',
          BUFFER, '=', BUFFER_STATE, '.createStream(', GL_ARRAY_BUFFER, ',', VALUE, '.buffer);',
          '}else{',
          BUFFER, '=', BUFFER_STATE, '.getBuffer(', VALUE, '.buffer);',
          '}',
          TYPE, '="type" in ', VALUE, '?',
          shared.glTypes, '[', VALUE, '.type]:', BUFFER, '.dtype;',
          result.normalized, '=!!', VALUE, '.normalized;')
        function emitReadRecord (name) {
          block(result[name], '=', VALUE, '.', name, '|0;')
        }
        emitReadRecord('size')
        emitReadRecord('offset')
        emitReadRecord('stride')
        emitReadRecord('divisor')

        block('}}')

        block.exit(
          'if(', result.isStream, '){',
          BUFFER_STATE, '.destroyStream(', BUFFER, ');',
          '}')

        return result
      }

      attributeDefs[attribute] = createDynamicDecl(dyn, appendAttributeCode)
    })

    return attributeDefs
  }

  function parseContext (context) {
    var staticContext = context.static
    var dynamicContext = context.dynamic
    var result = {}

    Object.keys(staticContext).forEach(function (name) {
      var value = staticContext[name]
      result[name] = createStaticDecl(function (env, scope) {
        if (typeof value === 'number' || typeof value === 'boolean') {
          return '' + value
        } else {
          return env.link(value)
        }
      })
    })

    Object.keys(dynamicContext).forEach(function (name) {
      var dyn = dynamicContext[name]
      result[name] = createDynamicDecl(dyn, function (env, scope) {
        return env.invoke(scope, dyn)
      })
    })

    return result
  }

  function parseArguments (options, attributes, uniforms, context, env) {
    var staticOptions = options.static
    var dynamicOptions = options.dynamic

    

    var framebuffer = parseFramebuffer(options, env)
    var viewportAndScissor = parseViewportScissor(options, framebuffer, env)
    var draw = parseDraw(options, env)
    var state = parseGLState(options, env)
    var shader = parseProgram(options, env)

    function copyBox (name) {
      var defn = viewportAndScissor[name]
      if (defn) {
        state[name] = defn
      }
    }
    copyBox(S_VIEWPORT)
    copyBox(propName(S_SCISSOR_BOX))

    var dirty = Object.keys(state).length > 0

    var result = {
      framebuffer: framebuffer,
      draw: draw,
      shader: shader,
      state: state,
      dirty: dirty
    }

    result.profile = parseProfile(options, env)
    result.uniforms = parseUniforms(uniforms, env)
    result.attributes = parseAttributes(attributes, env)
    result.context = parseContext(context, env)
    return result
  }

  // ===================================================
  // ===================================================
  // COMMON UPDATE FUNCTIONS
  // ===================================================
  // ===================================================
  function emitContext (env, scope, context) {
    var shared = env.shared
    var CONTEXT = shared.context

    var contextEnter = env.scope()

    Object.keys(context).forEach(function (name) {
      scope.save(CONTEXT, '.' + name)
      var defn = context[name]
      contextEnter(CONTEXT, '.', name, '=', defn.append(env, scope), ';')
    })

    scope(contextEnter)
  }

  // ===================================================
  // ===================================================
  // COMMON DRAWING FUNCTIONS
  // ===================================================
  // ===================================================
  function emitPollFramebuffer (env, scope, framebuffer, skipCheck) {
    var shared = env.shared

    var GL = shared.gl
    var FRAMEBUFFER_STATE = shared.framebuffer
    var EXT_DRAW_BUFFERS
    if (extDrawBuffers) {
      EXT_DRAW_BUFFERS = scope.def(shared.extensions, '.webgl_draw_buffers')
    }

    var constants = env.constants

    var DRAW_BUFFERS = constants.drawBuffer
    var BACK_BUFFER = constants.backBuffer

    var NEXT
    if (framebuffer) {
      NEXT = framebuffer.append(env, scope)
    } else {
      NEXT = scope.def(FRAMEBUFFER_STATE, '.next')
    }

    if (!skipCheck) {
      scope('if(', NEXT, '!==', FRAMEBUFFER_STATE, '.cur){')
    }
    scope(
      'if(', NEXT, '){',
      GL, '.bindFramebuffer(', GL_FRAMEBUFFER, ',', NEXT, '.framebuffer);')
    if (extDrawBuffers) {
      scope(EXT_DRAW_BUFFERS, '.drawBuffersWEBGL(',
        DRAW_BUFFERS, '[', NEXT, '.colorAttachments.length]);')
    }
    scope('}else{',
      GL, '.bindFramebuffer(', GL_FRAMEBUFFER, ',null);')
    if (extDrawBuffers) {
      scope(EXT_DRAW_BUFFERS, '.drawBuffersWEBGL(', BACK_BUFFER, ');')
    }
    scope(
      '}',
      FRAMEBUFFER_STATE, '.cur=', NEXT, ';')
    if (!skipCheck) {
      scope('}')
    }
  }

  function emitPollState (env, scope, args) {
    var shared = env.shared

    var GL = shared.gl

    var CURRENT_VARS = env.current
    var NEXT_VARS = env.next
    var CURRENT_STATE = shared.current
    var NEXT_STATE = shared.next

    var block = env.cond(CURRENT_STATE, '.dirty')

    GL_STATE_NAMES.forEach(function (prop) {
      var param = propName(prop)
      if (param in args.state) {
        return
      }

      var NEXT, CURRENT
      if (param in NEXT_VARS) {
        NEXT = NEXT_VARS[param]
        CURRENT = CURRENT_VARS[param]
        var parts = loop(currentState[param].length, function (i) {
          return block.def(NEXT, '[', i, ']')
        })
        block(env.cond(parts.map(function (p, i) {
          return p + '!==' + CURRENT + '[' + i + ']'
        }).join('||'))
          .then(
            GL, '.', GL_VARIABLES[param], '(', parts, ');',
            parts.map(function (p, i) {
              return CURRENT + '[' + i + ']=' + p
            }).join(';'), ';'))
      } else {
        NEXT = block.def(NEXT_STATE, '.', param)
        var ifte = env.cond(NEXT, '!==', CURRENT_STATE, '.', param)
        block(ifte)
        if (param in GL_FLAGS) {
          ifte(
            env.cond(NEXT)
                .then(GL, '.enable(', GL_FLAGS[param], ');')
                .else(GL, '.disable(', GL_FLAGS[param], ');'),
            CURRENT_STATE, '.', param, '=', NEXT, ';')
        } else {
          ifte(
            GL, '.', GL_VARIABLES[param], '(', NEXT, ');',
            CURRENT_STATE, '.', param, '=', NEXT, ';')
        }
      }
    })
    if (Object.keys(args.state).length === 0) {
      block(CURRENT_STATE, '.dirty=false;')
    }
    scope(block)
  }

  function emitSetOptions (env, scope, options, filter) {
    var shared = env.shared
    var CURRENT_VARS = env.current
    var CURRENT_STATE = shared.current
    var GL = shared.gl
    sortState(Object.keys(options)).forEach(function (param) {
      var defn = options[param]
      if (filter && !filter(defn)) {
        return
      }
      var variable = defn.append(env, scope)
      if (GL_FLAGS[param]) {
        var flag = GL_FLAGS[param]
        if (isStatic(defn)) {
          if (variable) {
            scope(GL, '.enable(', flag, ');')
          } else {
            scope(GL, '.disable(', flag, ');')
          }
        } else {
          scope(env.cond(variable)
            .then(GL, '.enable(', flag, ');')
            .else(GL, '.disable(', flag, ');'))
        }
        scope(CURRENT_STATE, '.', param, '=', variable, ';')
      } else if (isArrayLike(variable)) {
        var CURRENT = CURRENT_VARS[param]
        scope(
          GL, '.', GL_VARIABLES[param], '(', variable, ');',
          variable.map(function (v, i) {
            return CURRENT + '[' + i + ']=' + v
          }).join(';'), ';')
      } else {
        scope(
          GL, '.', GL_VARIABLES[param], '(', variable, ');',
          CURRENT_STATE, '.', param, '=', variable, ';')
      }
    })
  }

  function injectExtensions (env, scope) {
    if (extInstancing) {
      env.instancing = scope.def(
        env.shared.extensions, '.angle_instanced_arrays')
    }
  }

  function emitProfile (env, scope, args, useScope, incrementCounter) {
    var shared = env.shared
    var STATS = env.stats
    var CURRENT_STATE = shared.current
    var TIMER = shared.timer
    var profileArg = args.profile

    function perfCounter () {
      if (typeof performance === 'undefined') {
        return 'Date.now()'
      } else {
        return 'performance.now()'
      }
    }

    var CPU_START, QUERY_COUNTER
    function emitProfileStart (block) {
      CPU_START = scope.def()
      block(CPU_START, '=', perfCounter(), ';')
      if (typeof incrementCounter === 'string') {
        block(STATS, '.count+=', incrementCounter, ';')
      } else {
        block(STATS, '.count++;')
      }
      if (timer) {
        if (useScope) {
          QUERY_COUNTER = scope.def()
          block(QUERY_COUNTER, '=', TIMER, '.getNumPendingQueries();')
        } else {
          block(TIMER, '.beginQuery(', STATS, ');')
        }
      }
    }

    function emitProfileEnd (block) {
      block(STATS, '.cpuTime+=', perfCounter(), '-', CPU_START, ';')
      if (timer) {
        if (useScope) {
          block(TIMER, '.pushScopeStats(',
            QUERY_COUNTER, ',',
            TIMER, '.getNumPendingQueries(),',
            STATS, ');')
        } else {
          block(TIMER, '.endQuery();')
        }
      }
    }

    function scopeProfile (value) {
      var prev = scope.def(CURRENT_STATE, '.profile')
      scope(CURRENT_STATE, '.profile=', value, ';')
      scope.exit(CURRENT_STATE, '.profile=', prev, ';')
    }

    var USE_PROFILE
    if (profileArg) {
      if (isStatic(profileArg)) {
        if (profileArg.enable) {
          emitProfileStart(scope)
          emitProfileEnd(scope.exit)
          scopeProfile('true')
        } else {
          scopeProfile('false')
        }
        return
      }
      USE_PROFILE = profileArg.append(env, scope)
      scopeProfile(USE_PROFILE)
    } else {
      USE_PROFILE = scope.def(CURRENT_STATE, '.profile')
    }

    var start = env.block()
    emitProfileStart(start)
    scope('if(', USE_PROFILE, '){', start, '}')
    var end = env.block()
    emitProfileEnd(end)
    scope.exit('if(', USE_PROFILE, '){', end, '}')
  }

  function emitAttributes (env, scope, args, attributes, filter) {
    var shared = env.shared

    function typeLength (x) {
      switch (x) {
        case GL_FLOAT_VEC2:
        case GL_INT_VEC2:
        case GL_BOOL_VEC2:
          return 2
        case GL_FLOAT_VEC3:
        case GL_INT_VEC3:
        case GL_BOOL_VEC3:
          return 3
        case GL_FLOAT_VEC4:
        case GL_INT_VEC4:
        case GL_BOOL_VEC4:
          return 4
        default:
          return 1
      }
    }

    function emitBindAttribute (ATTRIBUTE, size, record) {
      var GL = shared.gl

      var LOCATION = scope.def(ATTRIBUTE, '.location')
      var BINDING = scope.def(shared.attributes, '[', LOCATION, ']')

      var STATE = record.state
      var BUFFER = record.buffer
      var CONST_COMPONENTS = [
        record.x,
        record.y,
        record.z,
        record.w
      ]

      var COMMON_KEYS = [
        'buffer',
        'normalized',
        'offset',
        'stride'
      ]

      function emitBuffer () {
        scope(
          'if(!', BINDING, '.buffer){',
          GL, '.enableVertexAttribArray(', LOCATION, ');}')

        var TYPE = record.type
        var SIZE
        if (!record.size) {
          SIZE = size
        } else {
          SIZE = scope.def(record.size, '||', size)
        }

        scope('if(',
          BINDING, '.type!==', TYPE, '||',
          BINDING, '.size!==', SIZE, '||',
          COMMON_KEYS.map(function (key) {
            return BINDING + '.' + key + '!==' + record[key]
          }).join('||'),
          '){',
          GL, '.bindBuffer(', GL_ARRAY_BUFFER, ',', BUFFER, '.buffer);',
          GL, '.vertexAttribPointer(', [
            LOCATION,
            SIZE,
            TYPE,
            record.normalized,
            record.stride,
            record.offset
          ], ');',
          BINDING, '.type=', TYPE, ';',
          BINDING, '.size=', SIZE, ';',
          COMMON_KEYS.map(function (key) {
            return BINDING + '.' + key + '=' + record[key] + ';'
          }).join(''),
          '}')

        if (extInstancing) {
          var DIVISOR = record.divisor
          scope(
            'if(', BINDING, '.divisor!==', DIVISOR, '){',
            env.instancing, '.vertexAttribDivisorANGLE(', [LOCATION, DIVISOR], ');',
            BINDING, '.divisor=', DIVISOR, ';}')
        }
      }

      function emitConstant () {
        scope(
          'if(', BINDING, '.buffer){',
          GL, '.disableVertexAttribArray(', LOCATION, ');',
          '}if(', CUTE_COMPONENTS.map(function (c, i) {
            return BINDING + '.' + c + '!==' + CONST_COMPONENTS[i]
          }).join('||'), '){',
          GL, '.vertexAttrib4f(', LOCATION, ',', CONST_COMPONENTS, ');',
          CUTE_COMPONENTS.map(function (c, i) {
            return BINDING + '.' + c + '=' + CONST_COMPONENTS[i] + ';'
          }).join(''),
          '}')
      }

      if (STATE === ATTRIB_STATE_POINTER) {
        emitBuffer()
      } else if (STATE === ATTRIB_STATE_CONSTANT) {
        emitConstant()
      } else {
        scope('if(', STATE, '===', ATTRIB_STATE_POINTER, '){')
        emitBuffer()
        scope('}else{')
        emitConstant()
        scope('}')
      }
    }

    attributes.forEach(function (attribute) {
      var name = attribute.name
      var arg = args.attributes[name]
      var record
      if (arg) {
        if (!filter(arg)) {
          return
        }
        record = arg.append(env, scope)
      } else {
        if (!filter(SCOPE_DECL)) {
          return
        }
        var scopeAttrib = env.scopeAttrib(name)
        
        record = {}
        Object.keys(new AttributeRecord()).forEach(function (key) {
          record[key] = scope.def(scopeAttrib, '.', key)
        })
      }
      emitBindAttribute(
        env.link(attribute), typeLength(attribute.info.type), record)
    })
  }

  function emitUniforms (env, scope, args, uniforms, filter) {
    var shared = env.shared
    var GL = shared.gl

    var infix
    for (var i = 0; i < uniforms.length; ++i) {
      var uniform = uniforms[i]
      var name = uniform.name
      var type = uniform.info.type
      var arg = args.uniforms[name]
      var UNIFORM = env.link(uniform)
      var LOCATION = UNIFORM + '.location'

      var VALUE
      if (arg) {
        if (!filter(arg)) {
          continue
        }
        if (isStatic(arg)) {
          var value = arg.value
          
          if (type === GL_SAMPLER_2D || type === GL_SAMPLER_CUBE) {
            
            var TEX_VALUE = env.link(value._texture || value.color[0]._texture)
            scope(GL, '.uniform1i(', LOCATION, ',', TEX_VALUE + '.bind());')
            scope.exit(TEX_VALUE, '.unbind();')
          } else if (
            type === GL_FLOAT_MAT2 ||
            type === GL_FLOAT_MAT3 ||
            type === GL_FLOAT_MAT4) {
            
            var MAT_VALUE = env.global.def('new Float32Array([' +
              Array.prototype.slice.call(value) + '])')
            var dim = 2
            if (type === GL_FLOAT_MAT3) {
              dim = 3
            } else if (type === GL_FLOAT_MAT4) {
              dim = 4
            }
            scope(
              GL, '.uniformMatrix', dim, 'fv(',
              LOCATION, ',false,', MAT_VALUE, ');')
          } else {
            switch (type) {
              case GL_FLOAT:
                
                infix = '1f'
                break
              case GL_FLOAT_VEC2:
                
                infix = '2f'
                break
              case GL_FLOAT_VEC3:
                
                infix = '3f'
                break
              case GL_FLOAT_VEC4:
                
                infix = '4f'
                break
              case GL_BOOL:
                
                infix = '1i'
                break
              case GL_INT:
                
                infix = '1i'
                break
              case GL_BOOL_VEC2:
                
                infix = '2i'
                break
              case GL_INT_VEC2:
                
                infix = '2i'
                break
              case GL_BOOL_VEC3:
                
                infix = '3i'
                break
              case GL_INT_VEC3:
                
                infix = '3i'
                break
              case GL_BOOL_VEC4:
                
                infix = '4i'
                break
              case GL_INT_VEC4:
                
                infix = '4i'
                break
            }
            scope(GL, '.uniform', infix, '(', LOCATION, ',',
              isArrayLike(value) ? Array.prototype.slice.call(value) : value,
              ');')
          }
          continue
        } else {
          VALUE = arg.append(env, scope)
        }
      } else {
        if (!filter(SCOPE_DECL)) {
          continue
        }
        VALUE = scope.def(shared.uniforms, '[', stringStore.id(name), ']')
      }

      if (type === GL_SAMPLER_2D) {
        scope(
          'if(', VALUE, '&&', VALUE, '._reglType==="framebuffer"){',
          VALUE, '=', VALUE, '.color[0];',
          '}')
      } else if (type === GL_SAMPLER_CUBE) {
        scope(
          'if(', VALUE, '&&', VALUE, '._reglType==="framebufferCube"){',
          VALUE, '=', VALUE, '.color[0];',
          '}')
      }

      // perform type validation
      

      var unroll = 1
      switch (type) {
        case GL_SAMPLER_2D:
        case GL_SAMPLER_CUBE:
          var TEX = scope.def(VALUE, '._texture')
          scope(GL, '.uniform1i(', LOCATION, ',', TEX, '.bind());')
          scope.exit(TEX, '.unbind();')
          continue

        case GL_INT:
        case GL_BOOL:
          infix = '1i'
          break

        case GL_INT_VEC2:
        case GL_BOOL_VEC2:
          infix = '2i'
          unroll = 2
          break

        case GL_INT_VEC3:
        case GL_BOOL_VEC3:
          infix = '3i'
          unroll = 3
          break

        case GL_INT_VEC4:
        case GL_BOOL_VEC4:
          infix = '4i'
          unroll = 4
          break

        case GL_FLOAT:
          infix = '1f'
          break

        case GL_FLOAT_VEC2:
          infix = '2f'
          unroll = 2
          break

        case GL_FLOAT_VEC3:
          infix = '3f'
          unroll = 3
          break

        case GL_FLOAT_VEC4:
          infix = '4f'
          unroll = 4
          break

        case GL_FLOAT_MAT2:
          infix = 'Matrix2fv'
          break

        case GL_FLOAT_MAT3:
          infix = 'Matrix3fv'
          break

        case GL_FLOAT_MAT4:
          infix = 'Matrix4fv'
          break
      }

      scope(GL, '.uniform', infix, '(', LOCATION, ',')
      if (infix.charAt(0) === 'M') {
        var matSize = Math.pow(type - GL_FLOAT_MAT2 + 2, 2)
        var STORAGE = env.global.def('new Float32Array(', matSize, ')')
        scope(
          'false,(Array.isArray(', VALUE, ')||', VALUE, ' instanceof Float32Array)?', VALUE, ':(',
          loop(matSize, function (i) {
            return STORAGE + '[' + i + ']=' + VALUE + '[' + i + ']'
          }), ',', STORAGE, ')')
      } else if (unroll > 1) {
        scope(loop(unroll, function (i) {
          return VALUE + '[' + i + ']'
        }))
      } else {
        scope(VALUE)
      }
      scope(');')
    }
  }

  function emitDraw (env, outer, inner, args) {
    var shared = env.shared
    var GL = shared.gl
    var DRAW_STATE = shared.draw

    var drawOptions = args.draw

    function emitElements () {
      var defn = drawOptions.elements
      var ELEMENTS
      var scope = outer
      if (defn) {
        if ((defn.contextDep && args.contextDynamic) || defn.propDep) {
          scope = inner
        }
        ELEMENTS = defn.append(env, scope)
      } else {
        ELEMENTS = scope.def(DRAW_STATE, '.', S_ELEMENTS)
      }
      if (ELEMENTS) {
        scope(
          'if(' + ELEMENTS + ')' +
          GL + '.bindBuffer(' + GL_ELEMENT_ARRAY_BUFFER + ',' + ELEMENTS + '.buffer.buffer);')
      }
      return ELEMENTS
    }

    function emitCount () {
      var defn = drawOptions.count
      var COUNT
      var scope = outer
      if (defn) {
        if ((defn.contextDep && args.contextDynamic) || defn.propDep) {
          scope = inner
        }
        COUNT = defn.append(env, scope)
        
      } else {
        COUNT = scope.def(DRAW_STATE, '.', S_COUNT)
        
      }
      return COUNT
    }

    var ELEMENTS = emitElements()
    function emitValue (name) {
      var defn = drawOptions[name]
      if (defn) {
        if ((defn.contextDep && args.contextDynamic) || defn.propDep) {
          return defn.append(env, inner)
        } else {
          return defn.append(env, outer)
        }
      } else {
        return outer.def(DRAW_STATE, '.', name)
      }
    }

    var PRIMITIVE = emitValue(S_PRIMITIVE)
    var OFFSET = emitValue(S_OFFSET)

    var COUNT = emitCount()
    if (typeof COUNT === 'number') {
      if (COUNT === 0) {
        return
      }
    } else {
      inner('if(', COUNT, '){')
      inner.exit('}')
    }

    var INSTANCES, EXT_INSTANCING
    if (extInstancing) {
      INSTANCES = emitValue(S_INSTANCES)
      EXT_INSTANCING = env.instancing
    }

    var ELEMENT_TYPE = ELEMENTS + '.type'

    var elementsStatic = drawOptions.elements && isStatic(drawOptions.elements)

    function emitInstancing () {
      function drawElements () {
        inner(EXT_INSTANCING, '.drawElementsInstancedANGLE(', [
          PRIMITIVE,
          COUNT,
          ELEMENT_TYPE,
          OFFSET + '<<((' + ELEMENT_TYPE + '-' + GL_UNSIGNED_BYTE + ')>>1)',
          INSTANCES
        ], ');')
      }

      function drawArrays () {
        inner(EXT_INSTANCING, '.drawArraysInstancedANGLE(',
          [PRIMITIVE, OFFSET, COUNT, INSTANCES], ');')
      }

      if (ELEMENTS) {
        if (!elementsStatic) {
          inner('if(', ELEMENTS, '){')
          drawElements()
          inner('}else{')
          drawArrays()
          inner('}')
        } else {
          drawElements()
        }
      } else {
        drawArrays()
      }
    }

    function emitRegular () {
      function drawElements () {
        inner(GL + '.drawElements(' + [
          PRIMITIVE,
          COUNT,
          ELEMENT_TYPE,
          OFFSET + '<<((' + ELEMENT_TYPE + '-' + GL_UNSIGNED_BYTE + ')>>1)'
        ] + ');')
      }

      function drawArrays () {
        inner(GL + '.drawArrays(' + [PRIMITIVE, OFFSET, COUNT] + ');')
      }

      if (ELEMENTS) {
        if (!elementsStatic) {
          inner('if(', ELEMENTS, '){')
          drawElements()
          inner('}else{')
          drawArrays()
          inner('}')
        } else {
          drawElements()
        }
      } else {
        drawArrays()
      }
    }

    if (extInstancing && (typeof INSTANCES !== 'number' || INSTANCES >= 0)) {
      if (typeof INSTANCES === 'string') {
        inner('if(', INSTANCES, '>0){')
        emitInstancing()
        inner('}else if(', INSTANCES, '<0){')
        emitRegular()
        inner('}')
      } else {
        emitInstancing()
      }
    } else {
      emitRegular()
    }
  }

  function createBody (emitBody, parentEnv, args, program, count) {
    var env = createREGLEnvironment()
    var scope = env.proc('body', count)
    
    if (extInstancing) {
      env.instancing = scope.def(
        env.shared.extensions, '.angle_instanced_arrays')
    }
    emitBody(env, scope, args, program)
    return env.compile().body
  }

  // ===================================================
  // ===================================================
  // DRAW PROC
  // ===================================================
  // ===================================================
  function emitDrawBody (env, draw, args, program) {
    injectExtensions(env, draw)
    emitAttributes(env, draw, args, program.attributes, function () {
      return true
    })
    emitUniforms(env, draw, args, program.uniforms, function () {
      return true
    })
    emitDraw(env, draw, draw, args)
  }

  function emitDrawProc (env, args) {
    var draw = env.proc('draw', 1)

    injectExtensions(env, draw)

    emitContext(env, draw, args.context)
    emitPollFramebuffer(env, draw, args.framebuffer)

    emitPollState(env, draw, args)
    emitSetOptions(env, draw, args.state)

    emitProfile(env, draw, args, false, true)

    var program = args.shader.progVar.append(env, draw)
    draw(env.shared.gl, '.useProgram(', program, '.program);')

    if (args.shader.program) {
      emitDrawBody(env, draw, args, args.shader.program)
    } else {
      var drawCache = env.global.def('{}')
      var PROG_ID = draw.def(program, '.id')
      var CACHED_PROC = draw.def(drawCache, '[', PROG_ID, ']')
      draw(
        env.cond(CACHED_PROC)
          .then(CACHED_PROC, '.call(this,a0);')
          .else(
            CACHED_PROC, '=', drawCache, '[', PROG_ID, ']=',
            env.link(function (program) {
              return createBody(emitDrawBody, env, args, program, 1)
            }), '(', program, ');',
            CACHED_PROC, '.call(this,a0);'))
    }

    if (Object.keys(args.state).length > 0) {
      draw(env.shared.current, '.dirty=true;')
    }
  }

  // ===================================================
  // ===================================================
  // BATCH PROC
  // ===================================================
  // ===================================================

  function emitBatchDynamicShaderBody (env, scope, args, program) {
    env.batchId = 'a1'

    injectExtensions(env, scope)

    function all () {
      return true
    }

    emitAttributes(env, scope, args, program.attributes, all)
    emitUniforms(env, scope, args, program.uniforms, all)
    emitDraw(env, scope, scope, args)
  }

  function emitBatchBody (env, scope, args, program) {
    injectExtensions(env, scope)

    var contextDynamic = args.contextDep

    var BATCH_ID = scope.def()
    var PROP_LIST = 'a0'
    var NUM_PROPS = 'a1'
    var PROPS = scope.def()
    env.shared.props = PROPS
    env.batchId = BATCH_ID

    var outer = env.scope()
    var inner = env.scope()

    scope(
      outer.entry,
      'for(', BATCH_ID, '=0;', BATCH_ID, '<', NUM_PROPS, ';++', BATCH_ID, '){',
      PROPS, '=', PROP_LIST, '[', BATCH_ID, '];',
      inner,
      '}',
      outer.exit)

    function isInnerDefn (defn) {
      return ((defn.contextDep && contextDynamic) || defn.propDep)
    }

    function isOuterDefn (defn) {
      return !isInnerDefn(defn)
    }

    if (args.needsContext) {
      emitContext(env, inner, args.context)
    }
    if (args.needsFramebuffer) {
      emitPollFramebuffer(env, inner, args.framebuffer)
    }
    emitSetOptions(env, inner, args.state, isInnerDefn)

    if (args.profile && isInnerDefn(args.profile)) {
      emitProfile(env, inner, args, false, true)
    }

    if (!program) {
      var progCache = env.global.def('{}')
      var PROGRAM = args.shader.progVar.append(env, inner)
      var PROG_ID = inner.def(PROGRAM, '.id')
      var CACHED_PROC = inner.def(progCache, '[', PROG_ID, ']')
      inner(
        env.shared.gl, '.useProgram(', PROGRAM, '.program);',
        'if(!', CACHED_PROC, '){',
        CACHED_PROC, '=', progCache, '[', PROG_ID, ']=',
        env.link(function (program) {
          return createBody(
            emitBatchDynamicShaderBody, env, args, program, 2)
        }), '(', PROGRAM, ');}',
        CACHED_PROC, '.call(this,a0[', BATCH_ID, '],', BATCH_ID, ');')
    } else {
      emitAttributes(env, outer, args, program.attributes, isOuterDefn)
      emitAttributes(env, inner, args, program.attributes, isInnerDefn)
      emitUniforms(env, outer, args, program.uniforms, isOuterDefn)
      emitUniforms(env, inner, args, program.uniforms, isInnerDefn)
      emitDraw(env, outer, inner, args)
    }
  }

  function emitBatchProc (env, args) {
    var batch = env.proc('batch', 2)
    env.batchId = '0'

    injectExtensions(env, batch)

    // Check if any context variables depend on props
    var contextDynamic = false
    var needsContext = true
    Object.keys(args.context).forEach(function (name) {
      contextDynamic = contextDynamic || args.context[name].propDep
    })
    if (!contextDynamic) {
      emitContext(env, batch, args.context)
      needsContext = false
    }

    // framebuffer state affects framebufferWidth/height context vars
    var framebuffer = args.framebuffer
    var needsFramebuffer = false
    if (framebuffer) {
      if (framebuffer.propDep) {
        contextDynamic = needsFramebuffer = true
      } else if (framebuffer.contextDep && contextDynamic) {
        needsFramebuffer = true
      }
      if (!needsFramebuffer) {
        emitPollFramebuffer(env, batch, framebuffer)
      }
    } else {
      emitPollFramebuffer(env, batch, null)
    }

    // viewport is weird because it can affect context vars
    if (args.state.viewport && args.state.viewport.propDep) {
      contextDynamic = true
    }

    function isInnerDefn (defn) {
      return (defn.contextDep && contextDynamic) || defn.propDep
    }

    // set webgl options
    emitPollState(env, batch, args)
    emitSetOptions(env, batch, args.state, function (defn) {
      return !isInnerDefn(defn)
    })

    if (!args.profile || !isInnerDefn(args.profile)) {
      emitProfile(env, batch, args, false, 'a1')
    }

    // Save these values to args so that the batch body routine can use them
    args.contextDep = contextDynamic
    args.needsContext = needsContext
    args.needsFramebuffer = needsFramebuffer

    // determine if shader is dynamic
    var progDefn = args.shader.progVar
    if ((progDefn.contextDep && contextDynamic) || progDefn.propDep) {
      emitBatchBody(
        env,
        batch,
        args,
        null)
    } else {
      var PROGRAM = progDefn.append(env, batch)
      batch(env.shared.gl, '.useProgram(', PROGRAM, '.program);')
      if (args.shader.program) {
        emitBatchBody(
          env,
          batch,
          args,
          args.shader.program)
      } else {
        var batchCache = env.global.def('{}')
        var PROG_ID = batch.def(PROGRAM, '.id')
        var CACHED_PROC = batch.def(batchCache, '[', PROG_ID, ']')
        batch(
          env.cond(CACHED_PROC)
            .then(CACHED_PROC, '.call(this,a0,a1);')
            .else(
              CACHED_PROC, '=', batchCache, '[', PROG_ID, ']=',
              env.link(function (program) {
                return createBody(emitBatchBody, env, args, program, 2)
              }), '(', PROGRAM, ');',
              CACHED_PROC, '.call(this,a0,a1);'))
      }
    }

    if (Object.keys(args.state).length > 0) {
      batch(env.shared.current, '.dirty=true;')
    }
  }

  // ===================================================
  // ===================================================
  // SCOPE COMMAND
  // ===================================================
  // ===================================================
  function emitScopeProc (env, args) {
    var scope = env.proc('scope', 3)
    env.batchId = 'a2'

    var shared = env.shared
    var CURRENT_STATE = shared.current

    emitContext(env, scope, args.context)

    if (args.framebuffer) {
      args.framebuffer.append(env, scope)
    }

    sortState(Object.keys(args.state)).forEach(function (name) {
      var defn = args.state[name]
      var value = defn.append(env, scope)
      if (isArrayLike(value)) {
        value.forEach(function (v, i) {
          scope.set(env.next[name], '[' + i + ']', v)
        })
      } else {
        scope.set(shared.next, '.' + name, value)
      }
    })

    emitProfile(env, scope, args, true, true)

    ;[S_ELEMENTS, S_OFFSET, S_COUNT, S_INSTANCES, S_PRIMITIVE].forEach(
      function (opt) {
        var variable = args.draw[opt]
        if (!variable) {
          return
        }
        scope.set(shared.draw, '.' + opt, '' + variable.append(env, scope))
      })

    Object.keys(args.uniforms).forEach(function (opt) {
      scope.set(
        shared.uniforms,
        '[' + stringStore.id(opt) + ']',
        args.uniforms[opt].append(env, scope))
    })

    Object.keys(args.attributes).forEach(function (name) {
      var record = args.attributes[name].append(env, scope)
      var scopeAttrib = env.scopeAttrib(name)
      Object.keys(new AttributeRecord()).forEach(function (prop) {
        scope.set(scopeAttrib, '.' + prop, record[prop])
      })
    })

    function saveShader (name) {
      var shader = args.shader[name]
      if (shader) {
        scope.set(shared.shader, '.' + name, shader.append(env, scope))
      }
    }
    saveShader(S_VERT)
    saveShader(S_FRAG)

    if (Object.keys(args.state).length > 0) {
      scope(CURRENT_STATE, '.dirty=true;')
      scope.exit(CURRENT_STATE, '.dirty=true;')
    }

    scope('a1(', env.shared.context, ',a0,', env.batchId, ');')
  }

  function isDynamicObject (object) {
    if (typeof object !== 'object' || isArrayLike(object)) {
      return
    }
    var props = Object.keys(object)
    for (var i = 0; i < props.length; ++i) {
      if (dynamic.isDynamic(object[props[i]])) {
        return true
      }
    }
    return false
  }

  function splatObject (env, options, name) {
    var object = options.static[name]
    if (!object || !isDynamicObject(object)) {
      return
    }

    var globals = env.global
    var keys = Object.keys(object)
    var thisDep = false
    var contextDep = false
    var propDep = false
    var objectRef = env.global.def('{}')
    keys.forEach(function (key) {
      var value = object[key]
      if (dynamic.isDynamic(value)) {
        if (typeof value === 'function') {
          value = object[key] = dynamic.unbox(value)
        }
        var deps = createDynamicDecl(value, null)
        thisDep = thisDep || deps.thisDep
        propDep = propDep || deps.propDep
        contextDep = contextDep || deps.contextDep
      } else {
        globals(objectRef, '.', key, '=')
        switch (typeof value) {
          case 'number':
            globals(value)
            break
          case 'string':
            globals('"', value, '"')
            break
          case 'object':
            if (Array.isArray(value)) {
              globals('[', value.join(), ']')
            }
            break
          default:
            globals(env.link(value))
            break
        }
        globals(';')
      }
    })

    function appendBlock (env, block) {
      keys.forEach(function (key) {
        var value = object[key]
        if (!dynamic.isDynamic(value)) {
          return
        }
        var ref = env.invoke(block, value)
        block(objectRef, '.', key, '=', ref, ';')
      })
    }

    options.dynamic[name] = new dynamic.DynamicVariable(DYN_THUNK, {
      thisDep: thisDep,
      contextDep: contextDep,
      propDep: propDep,
      ref: objectRef,
      append: appendBlock
    })
    delete options.static[name]
  }

  // ===========================================================================
  // ===========================================================================
  // MAIN DRAW COMMAND
  // ===========================================================================
  // ===========================================================================
  function compileCommand (options, attributes, uniforms, context, stats) {
    var env = createREGLEnvironment()

    // link stats, so that we can easily access it in the program.
    env.stats = env.link(stats)

    // splat options and attributes to allow for dynamic nested properties
    Object.keys(attributes.static).forEach(function (key) {
      splatObject(env, attributes, key)
    })
    NESTED_OPTIONS.forEach(function (name) {
      splatObject(env, options, name)
    })

    var args = parseArguments(options, attributes, uniforms, context, env)

    emitDrawProc(env, args)
    emitScopeProc(env, args)
    emitBatchProc(env, args)

    return env.compile()
  }

  // ===========================================================================
  // ===========================================================================
  // POLL / REFRESH
  // ===========================================================================
  // ===========================================================================
  return {
    next: nextState,
    current: currentState,
    procs: (function () {
      var env = createREGLEnvironment()
      var poll = env.proc('poll')
      var refresh = env.proc('refresh')
      var common = env.block()
      poll(common)
      refresh(common)

      var shared = env.shared
      var GL = shared.gl
      var NEXT_STATE = shared.next
      var CURRENT_STATE = shared.current

      common(CURRENT_STATE, '.dirty=false;')

      emitPollFramebuffer(env, poll)
      emitPollFramebuffer(env, refresh, null, true)

      // Refresh updates all attribute state changes
      var extInstancing = gl.getExtension('angle_instanced_arrays')
      var INSTANCING
      if (extInstancing) {
        INSTANCING = env.link(extInstancing)
      }
      for (var i = 0; i < limits.maxAttributes; ++i) {
        var BINDING = refresh.def(shared.attributes, '[', i, ']')
        var ifte = env.cond(BINDING, '.buffer')
        ifte.then(
          GL, '.enableVertexAttribArray(', i, ');',
          GL, '.bindBuffer(',
            GL_ARRAY_BUFFER, ',',
            BINDING, '.buffer.buffer);',
          GL, '.vertexAttribPointer(',
            i, ',',
            BINDING, '.size,',
            BINDING, '.type,',
            BINDING, '.normalized,',
            BINDING, '.stride,',
            BINDING, '.offset);'
        ).else(
          GL, '.disableVertexAttribArray(', i, ');',
          GL, '.vertexAttrib4f(',
            i, ',',
            BINDING, '.x,',
            BINDING, '.y,',
            BINDING, '.z,',
            BINDING, '.w);',
          BINDING, '.buffer=null;')
        refresh(ifte)
        if (extInstancing) {
          refresh(
            INSTANCING, '.vertexAttribDivisorANGLE(',
            i, ',',
            BINDING, '.divisor);')
        }
      }

      Object.keys(GL_FLAGS).forEach(function (flag) {
        var cap = GL_FLAGS[flag]
        var NEXT = common.def(NEXT_STATE, '.', flag)
        var block = env.block()
        block('if(', NEXT, '){',
          GL, '.enable(', cap, ')}else{',
          GL, '.disable(', cap, ')}',
          CURRENT_STATE, '.', flag, '=', NEXT, ';')
        refresh(block)
        poll(
          'if(', NEXT, '!==', CURRENT_STATE, '.', flag, '){',
          block,
          '}')
      })

      Object.keys(GL_VARIABLES).forEach(function (name) {
        var func = GL_VARIABLES[name]
        var init = currentState[name]
        var NEXT, CURRENT
        var block = env.block()
        block(GL, '.', func, '(')
        if (isArrayLike(init)) {
          var n = init.length
          NEXT = env.global.def(NEXT_STATE, '.', name)
          CURRENT = env.global.def(CURRENT_STATE, '.', name)
          block(
            loop(n, function (i) {
              return NEXT + '[' + i + ']'
            }), ');',
            loop(n, function (i) {
              return CURRENT + '[' + i + ']=' + NEXT + '[' + i + '];'
            }).join(''))
          poll(
            'if(', loop(n, function (i) {
              return NEXT + '[' + i + ']!==' + CURRENT + '[' + i + ']'
            }).join('||'), '){',
            block,
            '}')
        } else {
          NEXT = common.def(NEXT_STATE, '.', name)
          CURRENT = common.def(CURRENT_STATE, '.', name)
          block(
            NEXT, ');',
            CURRENT_STATE, '.', name, '=', NEXT, ';')
          poll(
            'if(', NEXT, '!==', CURRENT, '){',
            block,
            '}')
        }
        refresh(block)
      })

      return env.compile()
    })(),
    compile: compileCommand
  }
}

},{"./constants/dtypes.json":5,"./constants/primitives.json":6,"./dynamic":9,"./util/codegen":22,"./util/is-array-like":24,"./util/is-ndarray":25,"./util/is-typed-array":26,"./util/loop":27}],9:[function(require,module,exports){
var VARIABLE_COUNTER = 0

var DYN_FUNC = 0

function DynamicVariable (type, data) {
  this.id = (VARIABLE_COUNTER++)
  this.type = type
  this.data = data
}

function escapeStr (str) {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function splitParts (str) {
  if (str.length === 0) {
    return []
  }

  var firstChar = str.charAt(0)
  var lastChar = str.charAt(str.length - 1)

  if (str.length > 1 &&
      firstChar === lastChar &&
      (firstChar === '"' || firstChar === "'")) {
    return ['"' + escapeStr(str.substr(1, str.length - 2)) + '"']
  }

  var parts = /\[(false|true|null|\d+|'[^']*'|"[^"]*")\]/.exec(str)
  if (parts) {
    return (
      splitParts(str.substr(0, parts.index))
      .concat(splitParts(parts[1]))
      .concat(splitParts(str.substr(parts.index + parts[0].length)))
    )
  }

  var subparts = str.split('.')
  if (subparts.length === 1) {
    return ['"' + escapeStr(str) + '"']
  }

  var result = []
  for (var i = 0; i < subparts.length; ++i) {
    result = result.concat(splitParts(subparts[i]))
  }
  return result
}

function toAccessorString (str) {
  return '[' + splitParts(str).join('][') + ']'
}

function defineDynamic (type, data) {
  return new DynamicVariable(type, toAccessorString(data + ''))
}

function isDynamic (x) {
  return (typeof x === 'function' && !x._reglType) ||
         x instanceof DynamicVariable
}

function unbox (x, path) {
  if (typeof x === 'function') {
    return new DynamicVariable(DYN_FUNC, x)
  }
  return x
}

module.exports = {
  DynamicVariable: DynamicVariable,
  define: defineDynamic,
  isDynamic: isDynamic,
  unbox: unbox,
  accessor: toAccessorString
}

},{}],10:[function(require,module,exports){

var isTypedArray = require('./util/is-typed-array')
var isNDArrayLike = require('./util/is-ndarray')
var values = require('./util/values')

var primTypes = require('./constants/primitives.json')
var usageTypes = require('./constants/usage.json')

var GL_POINTS = 0
var GL_LINES = 1
var GL_TRIANGLES = 4

var GL_BYTE = 5120
var GL_UNSIGNED_BYTE = 5121
var GL_SHORT = 5122
var GL_UNSIGNED_SHORT = 5123
var GL_INT = 5124
var GL_UNSIGNED_INT = 5125

var GL_ELEMENT_ARRAY_BUFFER = 34963

var GL_STREAM_DRAW = 0x88E0
var GL_STATIC_DRAW = 0x88E4

module.exports = function wrapElementsState (gl, extensions, bufferState, stats) {
  var elementSet = {}
  var elementCount = 0

  var elementTypes = {
    'uint8': GL_UNSIGNED_BYTE,
    'uint16': GL_UNSIGNED_SHORT
  }

  if (extensions.oes_element_index_uint) {
    elementTypes.uint32 = GL_UNSIGNED_INT
  }

  function REGLElementBuffer (buffer) {
    this.id = elementCount++
    elementSet[this.id] = this
    this.buffer = buffer
    this.primType = GL_TRIANGLES
    this.vertCount = 0
    this.type = 0
  }

  REGLElementBuffer.prototype.bind = function () {
    this.buffer.bind()
  }

  var bufferPool = []

  function createElementStream (data) {
    var result = bufferPool.pop()
    if (!result) {
      result = new REGLElementBuffer(bufferState.create(
        null,
        GL_ELEMENT_ARRAY_BUFFER,
        true,
        false)._buffer)
    }
    initElements(result, data, GL_STREAM_DRAW, -1, -1, 0, 0)
    return result
  }

  function destroyElementStream (elements) {
    bufferPool.push(elements)
  }

  function initElements (
    elements,
    data,
    usage,
    prim,
    count,
    byteLength,
    type) {
    var predictedType = type
    if (!type && (
        !isTypedArray(data) ||
       (isNDArrayLike(data) && !isTypedArray(data.data)))) {
      predictedType = extensions.oes_element_index_uint
        ? GL_UNSIGNED_INT
        : GL_UNSIGNED_SHORT
    }
    elements.buffer.bind()
    bufferState._initBuffer(
      elements.buffer,
      data,
      usage,
      predictedType,
      3)

    var dtype = type
    if (!type) {
      switch (elements.buffer.dtype) {
        case GL_UNSIGNED_BYTE:
        case GL_BYTE:
          dtype = GL_UNSIGNED_BYTE
          break

        case GL_UNSIGNED_SHORT:
        case GL_SHORT:
          dtype = GL_UNSIGNED_SHORT
          break

        case GL_UNSIGNED_INT:
        case GL_INT:
          dtype = GL_UNSIGNED_INT
          break

        default:
          
      }
      elements.buffer.dtype = dtype
    }
    elements.type = dtype

    // Check oes_element_index_uint extension
    

    // try to guess default primitive type and arguments
    var vertCount = count
    if (vertCount < 0) {
      vertCount = elements.buffer.byteLength
      if (dtype === GL_UNSIGNED_SHORT) {
        vertCount >>= 1
      } else if (dtype === GL_UNSIGNED_INT) {
        vertCount >>= 2
      }
    }
    elements.vertCount = vertCount

    // try to guess primitive type from cell dimension
    var primType = prim
    if (prim < 0) {
      primType = GL_TRIANGLES
      var dimension = elements.buffer.dimension
      if (dimension === 1) primType = GL_POINTS
      if (dimension === 2) primType = GL_LINES
      if (dimension === 3) primType = GL_TRIANGLES
    }
    elements.primType = primType
  }

  function destroyElements (elements) {
    stats.elementsCount--

    
    delete elementSet[elements.id]
    elements.buffer.destroy()
    elements.buffer = null
  }

  function createElements (options, persistent) {
    var buffer = bufferState.create(null, GL_ELEMENT_ARRAY_BUFFER, true)
    var elements = new REGLElementBuffer(buffer._buffer)
    stats.elementsCount++

    function reglElements (options) {
      if (!options) {
        buffer()
        elements.primType = GL_TRIANGLES
        elements.vertCount = 0
        elements.type = GL_UNSIGNED_BYTE
      } else if (typeof options === 'number') {
        buffer(options)
        elements.primType = GL_TRIANGLES
        elements.vertCount = options | 0
        elements.type = GL_UNSIGNED_BYTE
      } else {
        var data = null
        var usage = GL_STATIC_DRAW
        var primType = -1
        var vertCount = -1
        var byteLength = 0
        var dtype = 0
        if (Array.isArray(options) ||
            isTypedArray(options) ||
            isNDArrayLike(options)) {
          data = options
        } else {
          
          if ('data' in options) {
            data = options.data
            
          }
          if ('usage' in options) {
            
            usage = usageTypes[options.usage]
          }
          if ('primitive' in options) {
            
            primType = primTypes[options.primitive]
          }
          if ('count' in options) {
            
            vertCount = options.count | 0
          }
          if ('length' in options) {
            byteLength = options.length | 0
          }
          if ('type' in options) {
            
            dtype = elementTypes[options.type]
          }
        }
        if (data) {
          initElements(
            elements,
            data,
            usage,
            primType,
            vertCount,
            byteLength,
            dtype)
        } else {
          var _buffer = elements.buffer
          _buffer.bind()
          gl.bufferData(GL_ELEMENT_ARRAY_BUFFER, byteLength, usage)
          _buffer.dtype = dtype || GL_UNSIGNED_BYTE
          _buffer.usage = usage
          _buffer.dimension = 3
          _buffer.byteLength = byteLength
          elements.primType = primType < 0 ? GL_TRIANGLES : primType
          elements.vertCount = vertCount < 0 ? 0 : vertCount
          elements.type = _buffer.dtype
        }
      }

      return reglElements
    }

    reglElements(options)

    reglElements._reglType = 'elements'
    reglElements._elements = elements
    reglElements.subdata = function (data, offset) {
      buffer.subdata(data, offset)
      return reglElements
    }
    reglElements.destroy = function () {
      destroyElements(elements)
    }

    return reglElements
  }

  return {
    create: createElements,
    createStream: createElementStream,
    destroyStream: destroyElementStream,
    getElements: function (elements) {
      if (typeof elements === 'function' &&
          elements._elements instanceof REGLElementBuffer) {
        return elements._elements
      }
      return null
    },
    clear: function () {
      values(elementSet).forEach(destroyElements)
    }
  }
}

},{"./constants/primitives.json":6,"./constants/usage.json":7,"./util/is-ndarray":25,"./util/is-typed-array":26,"./util/values":31}],11:[function(require,module,exports){


module.exports = function createExtensionCache (gl, config) {
  var extensions = {}

  function tryLoadExtension (name_) {
    
    var name = name_.toLowerCase()
    var ext
    try {
      ext = extensions[name] = gl.getExtension(name)
    } catch (e) {}
    return !!ext
  }

  for (var i = 0; i < config.extensions.length; ++i) {
    var name = config.extensions[i]
    if (!tryLoadExtension(name)) {
      config.onDestroy()
      config.onDone('"' + name + '" extension is not supported by the current WebGL context, try upgrading your system or a different browser')
      return null
    }
  }

  config.optionalExtensions.forEach(tryLoadExtension)

  return {
    extensions: extensions,
    restore: function () {
      Object.keys(extensions).forEach(function (name) {
        if (!tryLoadExtension(name)) {
          throw new Error('(regl): error restoring extension ' + name)
        }
      })
    }
  }
}

},{}],12:[function(require,module,exports){

var values = require('./util/values')
var extend = require('./util/extend')

// We store these constants so that the minifier can inline them
var GL_FRAMEBUFFER = 0x8D40
var GL_RENDERBUFFER = 0x8D41

var GL_TEXTURE_2D = 0x0DE1
var GL_TEXTURE_CUBE_MAP_POSITIVE_X = 0x8515

var GL_COLOR_ATTACHMENT0 = 0x8CE0
var GL_DEPTH_ATTACHMENT = 0x8D00
var GL_STENCIL_ATTACHMENT = 0x8D20
var GL_DEPTH_STENCIL_ATTACHMENT = 0x821A

var GL_FRAMEBUFFER_COMPLETE = 0x8CD5
var GL_FRAMEBUFFER_INCOMPLETE_ATTACHMENT = 0x8CD6
var GL_FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT = 0x8CD7
var GL_FRAMEBUFFER_INCOMPLETE_DIMENSIONS = 0x8CD9
var GL_FRAMEBUFFER_UNSUPPORTED = 0x8CDD

var GL_HALF_FLOAT_OES = 0x8D61
var GL_UNSIGNED_BYTE = 0x1401
var GL_FLOAT = 0x1406

var GL_RGBA = 0x1908

var GL_DEPTH_COMPONENT = 0x1902

var colorTextureFormatEnums = [
  GL_RGBA
]

// for every texture format, store
// the number of channels
var textureFormatChannels = []
textureFormatChannels[GL_RGBA] = 4

// for every texture type, store
// the size in bytes.
var textureTypeSizes = []
textureTypeSizes[GL_UNSIGNED_BYTE] = 1
textureTypeSizes[GL_FLOAT] = 4
textureTypeSizes[GL_HALF_FLOAT_OES] = 2

var GL_RGBA4 = 0x8056
var GL_RGB5_A1 = 0x8057
var GL_RGB565 = 0x8D62
var GL_DEPTH_COMPONENT16 = 0x81A5
var GL_STENCIL_INDEX8 = 0x8D48
var GL_DEPTH_STENCIL = 0x84F9

var GL_SRGB8_ALPHA8_EXT = 0x8C43

var GL_RGBA32F_EXT = 0x8814

var GL_RGBA16F_EXT = 0x881A
var GL_RGB16F_EXT = 0x881B

var colorRenderbufferFormatEnums = [
  GL_RGBA4,
  GL_RGB5_A1,
  GL_RGB565,
  GL_SRGB8_ALPHA8_EXT,
  GL_RGBA16F_EXT,
  GL_RGB16F_EXT,
  GL_RGBA32F_EXT
]

var statusCode = {}
statusCode[GL_FRAMEBUFFER_COMPLETE] = 'complete'
statusCode[GL_FRAMEBUFFER_INCOMPLETE_ATTACHMENT] = 'incomplete attachment'
statusCode[GL_FRAMEBUFFER_INCOMPLETE_DIMENSIONS] = 'incomplete dimensions'
statusCode[GL_FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT] = 'incomplete, missing attachment'
statusCode[GL_FRAMEBUFFER_UNSUPPORTED] = 'unsupported'

module.exports = function wrapFBOState (
  gl,
  extensions,
  limits,
  textureState,
  renderbufferState,
  stats) {
  var framebufferState = {
    cur: null,
    next: null,
    dirty: false
  }

  var colorTextureFormats = ['rgba']
  var colorRenderbufferFormats = ['rgba4', 'rgb565', 'rgb5 a1']

  if (extensions.ext_srgb) {
    colorRenderbufferFormats.push('srgba')
  }

  if (extensions.ext_color_buffer_half_float) {
    colorRenderbufferFormats.push('rgba16f', 'rgb16f')
  }

  if (extensions.webgl_color_buffer_float) {
    colorRenderbufferFormats.push('rgba32f')
  }

  var colorTypes = ['uint8']
  if (extensions.oes_texture_half_float) {
    colorTypes.push('half float', 'float16')
  }
  if (extensions.oes_texture_float) {
    colorTypes.push('float', 'float32')
  }

  function FramebufferAttachment (target, texture, renderbuffer) {
    this.target = target
    this.texture = texture
    this.renderbuffer = renderbuffer

    var w = 0
    var h = 0
    if (texture) {
      w = texture.width
      h = texture.height
    } else if (renderbuffer) {
      w = renderbuffer.width
      h = renderbuffer.height
    }
    this.width = w
    this.height = h
  }

  function decRef (attachment) {
    if (attachment) {
      if (attachment.texture) {
        attachment.texture._texture.decRef()
      }
      if (attachment.renderbuffer) {
        attachment.renderbuffer._renderbuffer.decRef()
      }
    }
  }

  function incRefAndCheckShape (attachment, width, height) {
    if (!attachment) {
      return
    }
    if (attachment.texture) {
      var texture = attachment.texture._texture
      var tw = Math.max(1, texture.width)
      var th = Math.max(1, texture.height)
      
      texture.refCount += 1
    } else {
      var renderbuffer = attachment.renderbuffer._renderbuffer
      
      renderbuffer.refCount += 1
    }
  }

  function attach (location, attachment) {
    if (attachment) {
      if (attachment.texture) {
        gl.framebufferTexture2D(
          GL_FRAMEBUFFER,
          location,
          attachment.target,
          attachment.texture._texture.texture,
          0)
      } else {
        gl.framebufferRenderbuffer(
          GL_FRAMEBUFFER,
          location,
          GL_RENDERBUFFER,
          attachment.renderbuffer._renderbuffer.renderbuffer)
      }
    } else {
      gl.framebufferTexture2D(
        GL_FRAMEBUFFER,
        location,
        GL_TEXTURE_2D,
        null,
        0)
    }
  }

  function parseAttachment (attachment) {
    var target = GL_TEXTURE_2D
    var texture = null
    var renderbuffer = null

    var data = attachment
    if (typeof attachment === 'object') {
      data = attachment.data
      if ('target' in attachment) {
        target = attachment.target | 0
      }
    }

    

    var type = data._reglType
    if (type === 'texture2d') {
      texture = data
      
    } else if (type === 'textureCube') {
      texture = data
      
    } else if (type === 'renderbuffer') {
      renderbuffer = data
      target = GL_RENDERBUFFER
    } else {
      
    }

    return new FramebufferAttachment(target, texture, renderbuffer)
  }

  function allocAttachment (
    width,
    height,
    isTexture,
    format,
    type) {
    if (isTexture) {
      var texture = textureState.create2D({
        width: width,
        height: height,
        format: format,
        type: type
      })
      texture._texture.refCount = 0
      return new FramebufferAttachment(GL_TEXTURE_2D, texture, null)
    } else {
      var rb = renderbufferState.create({
        width: width,
        height: height,
        format: format
      })
      rb._renderbuffer.refCount = 0
      return new FramebufferAttachment(GL_RENDERBUFFER, null, rb)
    }
  }

  function unwrapAttachment (attachment) {
    return attachment && (attachment.texture || attachment.renderbuffer)
  }

  function resizeAttachment (attachment, w, h) {
    if (attachment) {
      if (attachment.texture) {
        attachment.texture.resize(w, h)
      } else if (attachment.renderbuffer) {
        attachment.renderbuffer.resize(w, h)
      }
    }
  }

  var framebufferCount = 0
  var framebufferSet = {}

  function REGLFramebuffer () {
    this.id = framebufferCount++
    framebufferSet[this.id] = this

    this.framebuffer = gl.createFramebuffer()
    this.width = 0
    this.height = 0

    this.colorAttachments = []
    this.depthAttachment = null
    this.stencilAttachment = null
    this.depthStencilAttachment = null
  }

  function decFBORefs (framebuffer) {
    framebuffer.colorAttachments.forEach(decRef)
    decRef(framebuffer.depthAttachment)
    decRef(framebuffer.stencilAttachment)
    decRef(framebuffer.depthStencilAttachment)
  }

  function destroy (framebuffer) {
    var handle = framebuffer.framebuffer
    
    gl.deleteFramebuffer(handle)
    framebuffer.framebuffer = null
    stats.framebufferCount--
    delete framebufferSet[framebuffer.id]
  }

  function updateFramebuffer (framebuffer) {
    var i

    gl.bindFramebuffer(GL_FRAMEBUFFER, framebuffer.framebuffer)
    var colorAttachments = framebuffer.colorAttachments
    for (i = 0; i < colorAttachments.length; ++i) {
      attach(GL_COLOR_ATTACHMENT0 + i, colorAttachments[i])
    }
    for (i = colorAttachments.length; i < limits.maxColorAttachments; ++i) {
      attach(GL_COLOR_ATTACHMENT0 + i, null)
    }
    attach(GL_DEPTH_ATTACHMENT, framebuffer.depthAttachment)
    attach(GL_STENCIL_ATTACHMENT, framebuffer.stencilAttachment)
    attach(GL_DEPTH_STENCIL_ATTACHMENT, framebuffer.depthStencilAttachment)

    // Check status code
    var status = gl.checkFramebufferStatus(GL_FRAMEBUFFER)
    if (status !== GL_FRAMEBUFFER_COMPLETE) {
      
    }

    gl.bindFramebuffer(GL_FRAMEBUFFER, framebufferState.next)
    framebufferState.cur = framebufferState.next

    // FIXME: Clear error code here.  This is a work around for a bug in
    // headless-gl
    gl.getError()
  }

  function createFBO (a0, a1) {
    var framebuffer = new REGLFramebuffer()
    stats.framebufferCount++

    function reglFramebuffer (a, b) {
      var i

      

      var extDrawBuffers = extensions.webgl_draw_buffers

      var width = 0
      var height = 0

      var needsDepth = true
      var needsStencil = true

      var colorBuffer = null
      var colorTexture = true
      var colorFormat = 'rgba'
      var colorType = 'uint8'
      var colorCount = 1

      var depthBuffer = null
      var stencilBuffer = null
      var depthStencilBuffer = null
      var depthStencilTexture = false

      if (typeof a === 'number') {
        width = a | 0
        height = (b | 0) || width
      } else if (!a) {
        width = height = 1
      } else {
        
        var options = a

        if ('shape' in options) {
          var shape = options.shape
          
          width = shape[0]
          height = shape[1]
        } else {
          if ('radius' in options) {
            width = height = options.radius
          }
          if ('width' in options) {
            width = options.width
          }
          if ('height' in options) {
            height = options.height
          }
        }

        if ('color' in options ||
            'colors' in options) {
          colorBuffer =
            options.color ||
            options.colors
          if (Array.isArray(colorBuffer)) {
            
          }
        }

        if (!colorBuffer) {
          if ('colorCount' in options) {
            colorCount = options.colorCount | 0
            
          }

          if ('colorTexture' in options) {
            colorTexture = !!options.colorTexture
            colorFormat = 'rgba4'
          }

          if ('colorType' in options) {
            colorType = options.colorType
            if (!colorTexture) {
              if (colorType === 'half float' || colorType === 'float16') {
                
                colorFormat = 'rgba16f'
              } else if (colorType === 'float' || colorType === 'float32') {
                
                colorFormat = 'rgba32f'
              }
            } else {
              
              
            }
            
          }

          if ('colorFormat' in options) {
            colorFormat = options.colorFormat
            if (colorTextureFormats.indexOf(colorFormat) >= 0) {
              colorTexture = true
            } else if (colorRenderbufferFormats.indexOf(colorFormat) >= 0) {
              colorTexture = false
            } else {
              if (colorTexture) {
                
              } else {
                
              }
            }
          }
        }

        if ('depthTexture' in options || 'depthStencilTexture' in options) {
          depthStencilTexture = !!(options.depthTexture ||
            options.depthStencilTexture)
          
        }

        if ('depth' in options) {
          if (typeof options.depth === 'boolean') {
            needsDepth = options.depth
          } else {
            depthBuffer = options.depth
            needsStencil = false
          }
        }

        if ('stencil' in options) {
          if (typeof options.stencil === 'boolean') {
            needsStencil = options.stencil
          } else {
            stencilBuffer = options.stencil
            needsDepth = false
          }
        }

        if ('depthStencil' in options) {
          if (typeof options.depthStencil === 'boolean') {
            needsDepth = needsStencil = options.depthStencil
          } else {
            depthStencilBuffer = options.depthStencil
            needsDepth = false
            needsStencil = false
          }
        }
      }

      // parse attachments
      var colorAttachments = null
      var depthAttachment = null
      var stencilAttachment = null
      var depthStencilAttachment = null

      // Set up color attachments
      if (Array.isArray(colorBuffer)) {
        colorAttachments = colorBuffer.map(parseAttachment)
      } else if (colorBuffer) {
        colorAttachments = [parseAttachment(colorBuffer)]
      } else {
        colorAttachments = new Array(colorCount)
        for (i = 0; i < colorCount; ++i) {
          colorAttachments[i] = allocAttachment(
            width,
            height,
            colorTexture,
            colorFormat,
            colorType)
        }
      }

      
      

      width = width || colorAttachments[0].width
      height = height || colorAttachments[0].height

      if (depthBuffer) {
        depthAttachment = parseAttachment(depthBuffer)
      } else if (needsDepth && !needsStencil) {
        depthAttachment = allocAttachment(
          width,
          height,
          depthStencilTexture,
          'depth',
          'uint32')
      }

      if (stencilBuffer) {
        stencilAttachment = parseAttachment(stencilBuffer)
      } else if (needsStencil && !needsDepth) {
        stencilAttachment = allocAttachment(
          width,
          height,
          false,
          'stencil',
          'uint8')
      }

      if (depthStencilBuffer) {
        depthStencilAttachment = parseAttachment(depthStencilBuffer)
      } else if (!depthBuffer && !stencilBuffer && needsStencil && needsDepth) {
        depthStencilAttachment = allocAttachment(
          width,
          height,
          depthStencilTexture,
          'depth stencil',
          'depth stencil')
      }

      

      var commonColorAttachmentSize = null

      for (i = 0; i < colorAttachments.length; ++i) {
        incRefAndCheckShape(colorAttachments[i], width, height)
        

        if (colorAttachments[i] && colorAttachments[i].texture) {
          var colorAttachmentSize =
              textureFormatChannels[colorAttachments[i].texture._texture.format] *
              textureTypeSizes[colorAttachments[i].texture._texture.type]

          if (commonColorAttachmentSize === null) {
            commonColorAttachmentSize = colorAttachmentSize
          } else {
            // We need to make sure that all color attachments have the same number of bitplanes
            // (that is, the same numer of bits per pixel)
            // This is required by the GLES2.0 standard. See the beginning of Chapter 4 in that document.
            
          }
        }
      }
      incRefAndCheckShape(depthAttachment, width, height)
      
      incRefAndCheckShape(stencilAttachment, width, height)
      
      incRefAndCheckShape(depthStencilAttachment, width, height)
      

      // decrement references
      decFBORefs(framebuffer)

      framebuffer.width = width
      framebuffer.height = height

      framebuffer.colorAttachments = colorAttachments
      framebuffer.depthAttachment = depthAttachment
      framebuffer.stencilAttachment = stencilAttachment
      framebuffer.depthStencilAttachment = depthStencilAttachment

      reglFramebuffer.color = colorAttachments.map(unwrapAttachment)
      reglFramebuffer.depth = unwrapAttachment(depthAttachment)
      reglFramebuffer.stencil = unwrapAttachment(stencilAttachment)
      reglFramebuffer.depthStencil = unwrapAttachment(depthStencilAttachment)

      reglFramebuffer.width = framebuffer.width
      reglFramebuffer.height = framebuffer.height

      updateFramebuffer(framebuffer)

      return reglFramebuffer
    }

    function resize (w_, h_) {
      

      var w = w_ | 0
      var h = (h_ | 0) || w
      if (w === framebuffer.width && h === framebuffer.height) {
        return reglFramebuffer
      }

      // resize all buffers
      var colorAttachments = framebuffer.colorAttachments
      for (var i = 0; i < colorAttachments.length; ++i) {
        resizeAttachment(colorAttachments[i], w, h)
      }
      resizeAttachment(framebuffer.depthAttachment, w, h)
      resizeAttachment(framebuffer.stencilAttachment, w, h)
      resizeAttachment(framebuffer.depthStencilAttachment, w, h)

      framebuffer.width = reglFramebuffer.width = w
      framebuffer.height = reglFramebuffer.height = h

      updateFramebuffer(framebuffer)

      return reglFramebuffer
    }

    reglFramebuffer(a0, a1)

    return extend(reglFramebuffer, {
      resize: resize,
      _reglType: 'framebuffer',
      _framebuffer: framebuffer,
      destroy: function () {
        destroy(framebuffer)
        decFBORefs(framebuffer)
      }
    })
  }

  function createCubeFBO (options) {
    var faces = Array(6)

    function reglFramebufferCube (a) {
      var i

      

      var extDrawBuffers = extensions.webgl_draw_buffers

      var params = {
        color: null
      }

      var radius = 0

      var colorBuffer = null
      var colorFormat = 'rgba'
      var colorType = 'uint8'
      var colorCount = 1

      if (typeof a === 'number') {
        radius = a | 0
      } else if (!a) {
        radius = 1
      } else {
        
        var options = a

        if ('shape' in options) {
          var shape = options.shape
          
          
          radius = shape[0]
        } else {
          if ('radius' in options) {
            radius = options.radius | 0
          }
          if ('width' in options) {
            radius = options.width | 0
            if ('height' in options) {
              
            }
          } else if ('height' in options) {
            radius = options.height | 0
          }
        }

        if ('color' in options ||
            'colors' in options) {
          colorBuffer =
            options.color ||
            options.colors
          if (Array.isArray(colorBuffer)) {
            
          }
        }

        if (!colorBuffer) {
          if ('colorCount' in options) {
            colorCount = options.colorCount | 0
            
          }

          if ('colorType' in options) {
            
            colorType = options.colorType
          }

          if ('colorFormat' in options) {
            colorFormat = options.colorFormat
            
          }
        }

        if ('depth' in options) {
          params.depth = options.depth
        }

        if ('stencil' in options) {
          params.stencil = options.stencil
        }

        if ('depthStencil' in options) {
          params.depthStencil = options.depthStencil
        }
      }

      var colorCubes
      if (colorBuffer) {
        if (Array.isArray(colorBuffer)) {
          colorCubes = []
          for (i = 0; i < colorBuffer.length; ++i) {
            colorCubes[i] = colorBuffer[i]
          }
        } else {
          colorCubes = [ colorBuffer ]
        }
      } else {
        colorCubes = Array(colorCount)
        var cubeMapParams = {
          radius: radius,
          format: colorFormat,
          type: colorType
        }
        for (i = 0; i < colorCount; ++i) {
          colorCubes[i] = textureState.createCube(cubeMapParams)
        }
      }

      // Check color cubes
      params.color = Array(colorCubes.length)
      for (i = 0; i < colorCubes.length; ++i) {
        var cube = colorCubes[i]
        
        radius = radius || cube.width
        
        params.color[i] = {
          target: GL_TEXTURE_CUBE_MAP_POSITIVE_X,
          data: colorCubes[i]
        }
      }

      for (i = 0; i < 6; ++i) {
        for (var j = 0; j < colorCubes.length; ++j) {
          params.color[j].target = GL_TEXTURE_CUBE_MAP_POSITIVE_X + i
        }
        // reuse depth-stencil attachments across all cube maps
        if (i > 0) {
          params.depth = faces[0].depth
          params.stencil = faces[0].stencil
          params.depthStencil = faces[0].depthStencil
        }
        if (faces[i]) {
          (faces[i])(params)
        } else {
          faces[i] = createFBO(params)
        }
      }

      return extend(reglFramebufferCube, {
        width: radius,
        height: radius,
        color: colorCubes
      })
    }

    function resize (radius_) {
      var i
      var radius = radius_ | 0
      

      if (radius === reglFramebufferCube.width) {
        return reglFramebufferCube
      }

      var colors = reglFramebufferCube.color
      for (i = 0; i < colors.length; ++i) {
        colors[i].resize(radius)
      }

      for (i = 0; i < 6; ++i) {
        faces[i].resize(radius)
      }

      reglFramebufferCube.width = reglFramebufferCube.height = radius

      return reglFramebufferCube
    }

    reglFramebufferCube(options)

    return extend(reglFramebufferCube, {
      faces: faces,
      resize: resize,
      _reglType: 'framebufferCube',
      destroy: function () {
        faces.forEach(function (f) {
          f.destroy()
        })
      }
    })
  }

  function restoreFramebuffers () {
    values(framebufferSet).forEach(function (fb) {
      fb.framebuffer = gl.createFramebuffer()
      updateFramebuffer(fb)
    })
  }

  return extend(framebufferState, {
    getFramebuffer: function (object) {
      if (typeof object === 'function' && object._reglType === 'framebuffer') {
        var fbo = object._framebuffer
        if (fbo instanceof REGLFramebuffer) {
          return fbo
        }
      }
      return null
    },
    create: createFBO,
    createCube: createCubeFBO,
    clear: function () {
      values(framebufferSet).forEach(destroy)
    },
    restore: restoreFramebuffers
  })
}

},{"./util/extend":23,"./util/values":31}],13:[function(require,module,exports){
var GL_SUBPIXEL_BITS = 0x0D50
var GL_RED_BITS = 0x0D52
var GL_GREEN_BITS = 0x0D53
var GL_BLUE_BITS = 0x0D54
var GL_ALPHA_BITS = 0x0D55
var GL_DEPTH_BITS = 0x0D56
var GL_STENCIL_BITS = 0x0D57

var GL_ALIASED_POINT_SIZE_RANGE = 0x846D
var GL_ALIASED_LINE_WIDTH_RANGE = 0x846E

var GL_MAX_TEXTURE_SIZE = 0x0D33
var GL_MAX_VIEWPORT_DIMS = 0x0D3A
var GL_MAX_VERTEX_ATTRIBS = 0x8869
var GL_MAX_VERTEX_UNIFORM_VECTORS = 0x8DFB
var GL_MAX_VARYING_VECTORS = 0x8DFC
var GL_MAX_COMBINED_TEXTURE_IMAGE_UNITS = 0x8B4D
var GL_MAX_VERTEX_TEXTURE_IMAGE_UNITS = 0x8B4C
var GL_MAX_TEXTURE_IMAGE_UNITS = 0x8872
var GL_MAX_FRAGMENT_UNIFORM_VECTORS = 0x8DFD
var GL_MAX_CUBE_MAP_TEXTURE_SIZE = 0x851C
var GL_MAX_RENDERBUFFER_SIZE = 0x84E8

var GL_VENDOR = 0x1F00
var GL_RENDERER = 0x1F01
var GL_VERSION = 0x1F02
var GL_SHADING_LANGUAGE_VERSION = 0x8B8C

var GL_MAX_TEXTURE_MAX_ANISOTROPY_EXT = 0x84FF

var GL_MAX_COLOR_ATTACHMENTS_WEBGL = 0x8CDF
var GL_MAX_DRAW_BUFFERS_WEBGL = 0x8824

module.exports = function (gl, extensions) {
  var maxAnisotropic = 1
  if (extensions.ext_texture_filter_anisotropic) {
    maxAnisotropic = gl.getParameter(GL_MAX_TEXTURE_MAX_ANISOTROPY_EXT)
  }

  var maxDrawbuffers = 1
  var maxColorAttachments = 1
  if (extensions.webgl_draw_buffers) {
    maxDrawbuffers = gl.getParameter(GL_MAX_DRAW_BUFFERS_WEBGL)
    maxColorAttachments = gl.getParameter(GL_MAX_COLOR_ATTACHMENTS_WEBGL)
  }

  return {
    // drawing buffer bit depth
    colorBits: [
      gl.getParameter(GL_RED_BITS),
      gl.getParameter(GL_GREEN_BITS),
      gl.getParameter(GL_BLUE_BITS),
      gl.getParameter(GL_ALPHA_BITS)
    ],
    depthBits: gl.getParameter(GL_DEPTH_BITS),
    stencilBits: gl.getParameter(GL_STENCIL_BITS),
    subpixelBits: gl.getParameter(GL_SUBPIXEL_BITS),

    // supported extensions
    extensions: Object.keys(extensions).filter(function (ext) {
      return !!extensions[ext]
    }),

    // max aniso samples
    maxAnisotropic: maxAnisotropic,

    // max draw buffers
    maxDrawbuffers: maxDrawbuffers,
    maxColorAttachments: maxColorAttachments,

    // point and line size ranges
    pointSizeDims: gl.getParameter(GL_ALIASED_POINT_SIZE_RANGE),
    lineWidthDims: gl.getParameter(GL_ALIASED_LINE_WIDTH_RANGE),
    maxViewportDims: gl.getParameter(GL_MAX_VIEWPORT_DIMS),
    maxCombinedTextureUnits: gl.getParameter(GL_MAX_COMBINED_TEXTURE_IMAGE_UNITS),
    maxCubeMapSize: gl.getParameter(GL_MAX_CUBE_MAP_TEXTURE_SIZE),
    maxRenderbufferSize: gl.getParameter(GL_MAX_RENDERBUFFER_SIZE),
    maxTextureUnits: gl.getParameter(GL_MAX_TEXTURE_IMAGE_UNITS),
    maxTextureSize: gl.getParameter(GL_MAX_TEXTURE_SIZE),
    maxAttributes: gl.getParameter(GL_MAX_VERTEX_ATTRIBS),
    maxVertexUniforms: gl.getParameter(GL_MAX_VERTEX_UNIFORM_VECTORS),
    maxVertexTextureUnits: gl.getParameter(GL_MAX_VERTEX_TEXTURE_IMAGE_UNITS),
    maxVaryingVectors: gl.getParameter(GL_MAX_VARYING_VECTORS),
    maxFragmentUniforms: gl.getParameter(GL_MAX_FRAGMENT_UNIFORM_VECTORS),

    // vendor info
    glsl: gl.getParameter(GL_SHADING_LANGUAGE_VERSION),
    renderer: gl.getParameter(GL_RENDERER),
    vendor: gl.getParameter(GL_VENDOR),
    version: gl.getParameter(GL_VERSION)
  }
}

},{}],14:[function(require,module,exports){

var isTypedArray = require('./util/is-typed-array')

var GL_RGBA = 6408
var GL_UNSIGNED_BYTE = 5121
var GL_PACK_ALIGNMENT = 0x0D05
var GL_FLOAT = 0x1406 // 5126

module.exports = function wrapReadPixels (
  gl,
  framebufferState,
  reglPoll,
  context,
  glAttributes,
  extensions) {
  function readPixels (input) {
    var type
    if (framebufferState.next === null) {
      
      type = GL_UNSIGNED_BYTE
    } else {
      
      type = framebufferState.next.colorAttachments[0].texture._texture.type

      if (extensions.oes_texture_float) {
        
      } else {
        
      }
    }

    var x = 0
    var y = 0
    var width = context.framebufferWidth
    var height = context.framebufferHeight
    var data = null

    if (isTypedArray(input)) {
      data = input
    } else if (input) {
      
      x = input.x | 0
      y = input.y | 0
      
      
      width = (input.width || (context.framebufferWidth - x)) | 0
      height = (input.height || (context.framebufferHeight - y)) | 0
      data = input.data || null
    }

    // sanity check input.data
    if (data) {
      if (type === GL_UNSIGNED_BYTE) {
        
      } else if (type === GL_FLOAT) {
        
      }
    }

    
    

    // Update WebGL state
    reglPoll()

    // Compute size
    var size = width * height * 4

    // Allocate data
    if (!data) {
      if (type === GL_UNSIGNED_BYTE) {
        data = new Uint8Array(size)
      } else if (type === GL_FLOAT) {
        data = data || new Float32Array(size)
      }
    }

    // Type check
    
    

    // Run read pixels
    gl.pixelStorei(GL_PACK_ALIGNMENT, 4)
    gl.readPixels(x, y, width, height, GL_RGBA,
                  type,
                  data)

    return data
  }

  return readPixels
}

},{"./util/is-typed-array":26}],15:[function(require,module,exports){

var values = require('./util/values')

var GL_RENDERBUFFER = 0x8D41

var GL_RGBA4 = 0x8056
var GL_RGB5_A1 = 0x8057
var GL_RGB565 = 0x8D62
var GL_DEPTH_COMPONENT16 = 0x81A5
var GL_STENCIL_INDEX8 = 0x8D48
var GL_DEPTH_STENCIL = 0x84F9

var GL_SRGB8_ALPHA8_EXT = 0x8C43

var GL_RGBA32F_EXT = 0x8814

var GL_RGBA16F_EXT = 0x881A
var GL_RGB16F_EXT = 0x881B

var FORMAT_SIZES = []

FORMAT_SIZES[GL_RGBA4] = 2
FORMAT_SIZES[GL_RGB5_A1] = 2
FORMAT_SIZES[GL_RGB565] = 2

FORMAT_SIZES[GL_DEPTH_COMPONENT16] = 2
FORMAT_SIZES[GL_STENCIL_INDEX8] = 1
FORMAT_SIZES[GL_DEPTH_STENCIL] = 4

FORMAT_SIZES[GL_SRGB8_ALPHA8_EXT] = 4
FORMAT_SIZES[GL_RGBA32F_EXT] = 16
FORMAT_SIZES[GL_RGBA16F_EXT] = 8
FORMAT_SIZES[GL_RGB16F_EXT] = 6

function getRenderbufferSize (format, width, height) {
  return FORMAT_SIZES[format] * width * height
}

module.exports = function (gl, extensions, limits, stats, config) {
  var formatTypes = {
    'rgba4': GL_RGBA4,
    'rgb565': GL_RGB565,
    'rgb5 a1': GL_RGB5_A1,
    'depth': GL_DEPTH_COMPONENT16,
    'stencil': GL_STENCIL_INDEX8,
    'depth stencil': GL_DEPTH_STENCIL
  }

  if (extensions.ext_srgb) {
    formatTypes['srgba'] = GL_SRGB8_ALPHA8_EXT
  }

  if (extensions.ext_color_buffer_half_float) {
    formatTypes['rgba16f'] = GL_RGBA16F_EXT
    formatTypes['rgb16f'] = GL_RGB16F_EXT
  }

  if (extensions.webgl_color_buffer_float) {
    formatTypes['rgba32f'] = GL_RGBA32F_EXT
  }

  var formatTypesInvert = []
  Object.keys(formatTypes).forEach(function (key) {
    var val = formatTypes[key]
    formatTypesInvert[val] = key
  })

  var renderbufferCount = 0
  var renderbufferSet = {}

  function REGLRenderbuffer (renderbuffer) {
    this.id = renderbufferCount++
    this.refCount = 1

    this.renderbuffer = renderbuffer

    this.format = GL_RGBA4
    this.width = 0
    this.height = 0

    if (config.profile) {
      this.stats = {size: 0}
    }
  }

  REGLRenderbuffer.prototype.decRef = function () {
    if (--this.refCount <= 0) {
      destroy(this)
    }
  }

  function destroy (rb) {
    var handle = rb.renderbuffer
    
    gl.bindRenderbuffer(GL_RENDERBUFFER, null)
    gl.deleteRenderbuffer(handle)
    rb.renderbuffer = null
    rb.refCount = 0
    delete renderbufferSet[rb.id]
    stats.renderbufferCount--
  }

  function createRenderbuffer (a, b) {
    var renderbuffer = new REGLRenderbuffer(gl.createRenderbuffer())
    renderbufferSet[renderbuffer.id] = renderbuffer
    stats.renderbufferCount++

    function reglRenderbuffer (a, b) {
      var w = 0
      var h = 0
      var format = GL_RGBA4

      if (typeof a === 'object' && a) {
        var options = a
        if ('shape' in options) {
          var shape = options.shape
          
          w = shape[0] | 0
          h = shape[1] | 0
        } else {
          if ('radius' in options) {
            w = h = options.radius | 0
          }
          if ('width' in options) {
            w = options.width | 0
          }
          if ('height' in options) {
            h = options.height | 0
          }
        }
        if ('format' in options) {
          
          format = formatTypes[options.format]
        }
      } else if (typeof a === 'number') {
        w = a | 0
        if (typeof b === 'number') {
          h = b | 0
        } else {
          h = w
        }
      } else if (!a) {
        w = h = 1
      } else {
        
      }

      // check shape
      

      if (w === renderbuffer.width &&
          h === renderbuffer.height &&
          format === renderbuffer.format) {
        return
      }

      reglRenderbuffer.width = renderbuffer.width = w
      reglRenderbuffer.height = renderbuffer.height = h
      renderbuffer.format = format

      gl.bindRenderbuffer(GL_RENDERBUFFER, renderbuffer.renderbuffer)
      gl.renderbufferStorage(GL_RENDERBUFFER, format, w, h)

      if (config.profile) {
        renderbuffer.stats.size = getRenderbufferSize(renderbuffer.format, renderbuffer.width, renderbuffer.height)
      }
      reglRenderbuffer.format = formatTypesInvert[renderbuffer.format]

      return reglRenderbuffer
    }

    function resize (w_, h_) {
      var w = w_ | 0
      var h = (h_ | 0) || w

      if (w === renderbuffer.width && h === renderbuffer.height) {
        return reglRenderbuffer
      }

      // check shape
      

      reglRenderbuffer.width = renderbuffer.width = w
      reglRenderbuffer.height = renderbuffer.height = h

      gl.bindRenderbuffer(GL_RENDERBUFFER, renderbuffer.renderbuffer)
      gl.renderbufferStorage(GL_RENDERBUFFER, renderbuffer.format, w, h)

      // also, recompute size.
      if (config.profile) {
        renderbuffer.stats.size = getRenderbufferSize(
          renderbuffer.format, renderbuffer.width, renderbuffer.height)
      }

      return reglRenderbuffer
    }

    reglRenderbuffer(a, b)

    reglRenderbuffer.resize = resize
    reglRenderbuffer._reglType = 'renderbuffer'
    reglRenderbuffer._renderbuffer = renderbuffer
    if (config.profile) {
      reglRenderbuffer.stats = renderbuffer.stats
    }
    reglRenderbuffer.destroy = function () {
      renderbuffer.decRef()
    }

    return reglRenderbuffer
  }

  if (config.profile) {
    stats.getTotalRenderbufferSize = function () {
      var total = 0
      Object.keys(renderbufferSet).forEach(function (key) {
        total += renderbufferSet[key].stats.size
      })
      return total
    }
  }

  function restoreRenderbuffers () {
    values(renderbufferSet).forEach(function (rb) {
      rb.renderbuffer = gl.createRenderbuffer()
      gl.bindRenderbuffer(GL_RENDERBUFFER, rb.renderbuffer)
      gl.renderbufferStorage(GL_RENDERBUFFER, rb.format, rb.width, rb.height)
    })
    gl.bindRenderbuffer(GL_RENDERBUFFER, null)
  }

  return {
    create: createRenderbuffer,
    clear: function () {
      values(renderbufferSet).forEach(destroy)
    },
    restore: restoreRenderbuffers
  }
}

},{"./util/values":31}],16:[function(require,module,exports){

var values = require('./util/values')

var GL_FRAGMENT_SHADER = 35632
var GL_VERTEX_SHADER = 35633

var GL_ACTIVE_UNIFORMS = 0x8B86
var GL_ACTIVE_ATTRIBUTES = 0x8B89

module.exports = function wrapShaderState (gl, stringStore, stats, config) {
  // ===================================================
  // glsl compilation and linking
  // ===================================================
  var fragShaders = {}
  var vertShaders = {}

  function ActiveInfo (name, id, location, info) {
    this.name = name
    this.id = id
    this.location = location
    this.info = info
  }

  function insertActiveInfo (list, info) {
    for (var i = 0; i < list.length; ++i) {
      if (list[i].id === info.id) {
        list[i].location = info.location
        return
      }
    }
    list.push(info)
  }

  function getShader (type, id, command) {
    var cache = type === GL_FRAGMENT_SHADER ? fragShaders : vertShaders
    var shader = cache[id]

    if (!shader) {
      var source = stringStore.str(id)
      shader = gl.createShader(type)
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      
      cache[id] = shader
    }

    return shader
  }

  // ===================================================
  // program linking
  // ===================================================
  var programCache = {}
  var programList = []

  var PROGRAM_COUNTER = 0

  function REGLProgram (fragId, vertId) {
    this.id = PROGRAM_COUNTER++
    this.fragId = fragId
    this.vertId = vertId
    this.program = null
    this.uniforms = []
    this.attributes = []

    if (config.profile) {
      this.stats = {
        uniformsCount: 0,
        attributesCount: 0
      }
    }
  }

  function linkProgram (desc, command) {
    var i, info

    // -------------------------------
    // compile & link
    // -------------------------------
    var fragShader = getShader(GL_FRAGMENT_SHADER, desc.fragId)
    var vertShader = getShader(GL_VERTEX_SHADER, desc.vertId)

    var program = desc.program = gl.createProgram()
    gl.attachShader(program, fragShader)
    gl.attachShader(program, vertShader)
    gl.linkProgram(program)
    

    // -------------------------------
    // grab uniforms
    // -------------------------------
    var numUniforms = gl.getProgramParameter(program, GL_ACTIVE_UNIFORMS)
    if (config.profile) {
      desc.stats.uniformsCount = numUniforms
    }
    var uniforms = desc.uniforms
    for (i = 0; i < numUniforms; ++i) {
      info = gl.getActiveUniform(program, i)
      if (info) {
        if (info.size > 1) {
          for (var j = 0; j < info.size; ++j) {
            var name = info.name.replace('[0]', '[' + j + ']')
            insertActiveInfo(uniforms, new ActiveInfo(
              name,
              stringStore.id(name),
              gl.getUniformLocation(program, name),
              info))
          }
        } else {
          insertActiveInfo(uniforms, new ActiveInfo(
            info.name,
            stringStore.id(info.name),
            gl.getUniformLocation(program, info.name),
            info))
        }
      }
    }

    // -------------------------------
    // grab attributes
    // -------------------------------
    var numAttributes = gl.getProgramParameter(program, GL_ACTIVE_ATTRIBUTES)
    if (config.profile) {
      desc.stats.attributesCount = numAttributes
    }

    var attributes = desc.attributes
    for (i = 0; i < numAttributes; ++i) {
      info = gl.getActiveAttrib(program, i)
      if (info) {
        insertActiveInfo(attributes, new ActiveInfo(
          info.name,
          stringStore.id(info.name),
          gl.getAttribLocation(program, info.name),
          info))
      }
    }
  }

  if (config.profile) {
    stats.getMaxUniformsCount = function () {
      var m = 0
      programList.forEach(function (desc) {
        if (desc.stats.uniformsCount > m) {
          m = desc.stats.uniformsCount
        }
      })
      return m
    }

    stats.getMaxAttributesCount = function () {
      var m = 0
      programList.forEach(function (desc) {
        if (desc.stats.attributesCount > m) {
          m = desc.stats.attributesCount
        }
      })
      return m
    }
  }

  function restoreShaders () {
    fragShaders = {}
    vertShaders = {}
    for (var i = 0; i < programList.length; ++i) {
      linkProgram(programList[i])
    }
  }

  return {
    clear: function () {
      var deleteShader = gl.deleteShader.bind(gl)
      values(fragShaders).forEach(deleteShader)
      fragShaders = {}
      values(vertShaders).forEach(deleteShader)
      vertShaders = {}

      programList.forEach(function (desc) {
        gl.deleteProgram(desc.program)
      })
      programList.length = 0
      programCache = {}

      stats.shaderCount = 0
    },

    program: function (vertId, fragId, command) {
      
      

      stats.shaderCount++

      var cache = programCache[fragId]
      if (!cache) {
        cache = programCache[fragId] = {}
      }
      var program = cache[vertId]
      if (!program) {
        program = new REGLProgram(fragId, vertId)
        linkProgram(program, command)
        cache[vertId] = program
        programList.push(program)
      }
      return program
    },

    restore: restoreShaders,

    shader: getShader,

    frag: -1,
    vert: -1
  }
}

},{"./util/values":31}],17:[function(require,module,exports){

module.exports = function stats () {
  return {
    bufferCount: 0,
    elementsCount: 0,
    framebufferCount: 0,
    shaderCount: 0,
    textureCount: 0,
    cubeCount: 0,
    renderbufferCount: 0,

    maxTextureUnits: 0
  }
}

},{}],18:[function(require,module,exports){
module.exports = function createStringStore () {
  var stringIds = {'': 0}
  var stringValues = ['']
  return {
    id: function (str) {
      var result = stringIds[str]
      if (result) {
        return result
      }
      result = stringIds[str] = stringValues.length
      stringValues.push(str)
      return result
    },

    str: function (id) {
      return stringValues[id]
    }
  }
}

},{}],19:[function(require,module,exports){

var extend = require('./util/extend')
var values = require('./util/values')
var isTypedArray = require('./util/is-typed-array')
var isNDArrayLike = require('./util/is-ndarray')
var pool = require('./util/pool')
var convertToHalfFloat = require('./util/to-half-float')
var isArrayLike = require('./util/is-array-like')

var dtypes = require('./constants/arraytypes.json')
var arrayTypes = require('./constants/arraytypes.json')

var GL_COMPRESSED_TEXTURE_FORMATS = 0x86A3

var GL_TEXTURE_2D = 0x0DE1
var GL_TEXTURE_CUBE_MAP = 0x8513
var GL_TEXTURE_CUBE_MAP_POSITIVE_X = 0x8515

var GL_RGBA = 0x1908
var GL_ALPHA = 0x1906
var GL_RGB = 0x1907
var GL_LUMINANCE = 0x1909
var GL_LUMINANCE_ALPHA = 0x190A

var GL_RGBA4 = 0x8056
var GL_RGB5_A1 = 0x8057
var GL_RGB565 = 0x8D62

var GL_UNSIGNED_SHORT_4_4_4_4 = 0x8033
var GL_UNSIGNED_SHORT_5_5_5_1 = 0x8034
var GL_UNSIGNED_SHORT_5_6_5 = 0x8363
var GL_UNSIGNED_INT_24_8_WEBGL = 0x84FA

var GL_DEPTH_COMPONENT = 0x1902
var GL_DEPTH_STENCIL = 0x84F9

var GL_SRGB_EXT = 0x8C40
var GL_SRGB_ALPHA_EXT = 0x8C42

var GL_HALF_FLOAT_OES = 0x8D61

var GL_COMPRESSED_RGB_S3TC_DXT1_EXT = 0x83F0
var GL_COMPRESSED_RGBA_S3TC_DXT1_EXT = 0x83F1
var GL_COMPRESSED_RGBA_S3TC_DXT3_EXT = 0x83F2
var GL_COMPRESSED_RGBA_S3TC_DXT5_EXT = 0x83F3

var GL_COMPRESSED_RGB_ATC_WEBGL = 0x8C92
var GL_COMPRESSED_RGBA_ATC_EXPLICIT_ALPHA_WEBGL = 0x8C93
var GL_COMPRESSED_RGBA_ATC_INTERPOLATED_ALPHA_WEBGL = 0x87EE

var GL_COMPRESSED_RGB_PVRTC_4BPPV1_IMG = 0x8C00
var GL_COMPRESSED_RGB_PVRTC_2BPPV1_IMG = 0x8C01
var GL_COMPRESSED_RGBA_PVRTC_4BPPV1_IMG = 0x8C02
var GL_COMPRESSED_RGBA_PVRTC_2BPPV1_IMG = 0x8C03

var GL_COMPRESSED_RGB_ETC1_WEBGL = 0x8D64

var GL_UNSIGNED_BYTE = 0x1401
var GL_UNSIGNED_SHORT = 0x1403
var GL_UNSIGNED_INT = 0x1405
var GL_FLOAT = 0x1406

var GL_TEXTURE_WRAP_S = 0x2802
var GL_TEXTURE_WRAP_T = 0x2803

var GL_REPEAT = 0x2901
var GL_CLAMP_TO_EDGE = 0x812F
var GL_MIRRORED_REPEAT = 0x8370

var GL_TEXTURE_MAG_FILTER = 0x2800
var GL_TEXTURE_MIN_FILTER = 0x2801

var GL_NEAREST = 0x2600
var GL_LINEAR = 0x2601
var GL_NEAREST_MIPMAP_NEAREST = 0x2700
var GL_LINEAR_MIPMAP_NEAREST = 0x2701
var GL_NEAREST_MIPMAP_LINEAR = 0x2702
var GL_LINEAR_MIPMAP_LINEAR = 0x2703

var GL_GENERATE_MIPMAP_HINT = 0x8192
var GL_DONT_CARE = 0x1100
var GL_FASTEST = 0x1101
var GL_NICEST = 0x1102

var GL_TEXTURE_MAX_ANISOTROPY_EXT = 0x84FE

var GL_UNPACK_ALIGNMENT = 0x0CF5
var GL_UNPACK_FLIP_Y_WEBGL = 0x9240
var GL_UNPACK_PREMULTIPLY_ALPHA_WEBGL = 0x9241
var GL_UNPACK_COLORSPACE_CONVERSION_WEBGL = 0x9243

var GL_BROWSER_DEFAULT_WEBGL = 0x9244

var GL_TEXTURE0 = 0x84C0

var MIPMAP_FILTERS = [
  GL_NEAREST_MIPMAP_NEAREST,
  GL_NEAREST_MIPMAP_LINEAR,
  GL_LINEAR_MIPMAP_NEAREST,
  GL_LINEAR_MIPMAP_LINEAR
]

var CHANNELS_FORMAT = [
  0,
  GL_LUMINANCE,
  GL_LUMINANCE_ALPHA,
  GL_RGB,
  GL_RGBA
]

var FORMAT_CHANNELS = {}
FORMAT_CHANNELS[GL_LUMINANCE] =
FORMAT_CHANNELS[GL_ALPHA] =
FORMAT_CHANNELS[GL_DEPTH_COMPONENT] = 1
FORMAT_CHANNELS[GL_DEPTH_STENCIL] =
FORMAT_CHANNELS[GL_LUMINANCE_ALPHA] = 2
FORMAT_CHANNELS[GL_RGB] =
FORMAT_CHANNELS[GL_SRGB_EXT] = 3
FORMAT_CHANNELS[GL_RGBA] =
FORMAT_CHANNELS[GL_SRGB_ALPHA_EXT] = 4

var formatTypes = {}
formatTypes[GL_RGBA4] = GL_UNSIGNED_SHORT_4_4_4_4
formatTypes[GL_RGB565] = GL_UNSIGNED_SHORT_5_6_5
formatTypes[GL_RGB5_A1] = GL_UNSIGNED_SHORT_5_5_5_1
formatTypes[GL_DEPTH_COMPONENT] = GL_UNSIGNED_INT
formatTypes[GL_DEPTH_STENCIL] = GL_UNSIGNED_INT_24_8_WEBGL

function objectName (str) {
  return '[object ' + str + ']'
}

var CANVAS_CLASS = objectName('HTMLCanvasElement')
var CONTEXT2D_CLASS = objectName('CanvasRenderingContext2D')
var IMAGE_CLASS = objectName('HTMLImageElement')
var VIDEO_CLASS = objectName('HTMLVideoElement')

var PIXEL_CLASSES = Object.keys(dtypes).concat([
  CANVAS_CLASS,
  CONTEXT2D_CLASS,
  IMAGE_CLASS,
  VIDEO_CLASS
])

// for every texture type, store
// the size in bytes.
var TYPE_SIZES = []
TYPE_SIZES[GL_UNSIGNED_BYTE] = 1
TYPE_SIZES[GL_FLOAT] = 4
TYPE_SIZES[GL_HALF_FLOAT_OES] = 2

TYPE_SIZES[GL_UNSIGNED_SHORT] = 2
TYPE_SIZES[GL_UNSIGNED_INT] = 4

var FORMAT_SIZES_SPECIAL = []
FORMAT_SIZES_SPECIAL[GL_RGBA4] = 2
FORMAT_SIZES_SPECIAL[GL_RGB5_A1] = 2
FORMAT_SIZES_SPECIAL[GL_RGB565] = 2
FORMAT_SIZES_SPECIAL[GL_DEPTH_STENCIL] = 4

FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGB_S3TC_DXT1_EXT] = 0.5
FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGBA_S3TC_DXT1_EXT] = 0.5
FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGBA_S3TC_DXT3_EXT] = 1
FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGBA_S3TC_DXT5_EXT] = 1

FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGB_ATC_WEBGL] = 0.5
FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGBA_ATC_EXPLICIT_ALPHA_WEBGL] = 1
FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGBA_ATC_INTERPOLATED_ALPHA_WEBGL] = 1

FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGB_PVRTC_4BPPV1_IMG] = 0.5
FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGB_PVRTC_2BPPV1_IMG] = 0.25
FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGBA_PVRTC_4BPPV1_IMG] = 0.5
FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGBA_PVRTC_2BPPV1_IMG] = 0.25

FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGB_ETC1_WEBGL] = 0.5

function isNumericArray (arr) {
  return (
    Array.isArray(arr) &&
    (arr.length === 0 ||
    typeof arr[0] === 'number'))
}

function isRectArray (arr) {
  if (!Array.isArray(arr)) {
    return false
  }
  var width = arr.length
  if (width === 0 || !isArrayLike(arr[0])) {
    return false
  }
  return true
}

function classString (x) {
  return Object.prototype.toString.call(x)
}

function isCanvasElement (object) {
  return classString(object) === CANVAS_CLASS
}

function isContext2D (object) {
  return classString(object) === CONTEXT2D_CLASS
}

function isImageElement (object) {
  return classString(object) === IMAGE_CLASS
}

function isVideoElement (object) {
  return classString(object) === VIDEO_CLASS
}

function isPixelData (object) {
  if (!object) {
    return false
  }
  var className = classString(object)
  if (PIXEL_CLASSES.indexOf(className) >= 0) {
    return true
  }
  return (
    isNumericArray(object) ||
    isRectArray(object) ||
    isNDArrayLike(object))
}

function typedArrayCode (data) {
  return arrayTypes[Object.prototype.toString.call(data)] | 0
}

function convertData (result, data) {
  var n = result.width * result.height * result.channels
  

  switch (result.type) {
    case GL_UNSIGNED_BYTE:
    case GL_UNSIGNED_SHORT:
    case GL_UNSIGNED_INT:
    case GL_FLOAT:
      var converted = pool.allocType(result.type, n)
      converted.set(data)
      result.data = converted
      break

    case GL_HALF_FLOAT_OES:
      result.data = convertToHalfFloat(data)
      break

    default:
      
  }
}

function preConvert (image, n) {
  return pool.allocType(
    image.type === GL_HALF_FLOAT_OES
      ? GL_FLOAT
      : image.type, n)
}

function postConvert (image, data) {
  if (image.type === GL_HALF_FLOAT_OES) {
    image.data = convertToHalfFloat(data)
    pool.freeType(data)
  } else {
    image.data = data
  }
}

function transposeData (image, array, strideX, strideY, strideC, offset) {
  var w = image.width
  var h = image.height
  var c = image.channels
  var n = w * h * c
  var data = preConvert(image, n)

  var p = 0
  for (var i = 0; i < h; ++i) {
    for (var j = 0; j < w; ++j) {
      for (var k = 0; k < c; ++k) {
        data[p++] = array[strideX * j + strideY * i + strideC * k + offset]
      }
    }
  }

  postConvert(image, data)
}

function flatten2DData (image, array, w, h) {
  var n = w * h
  var data = preConvert(image, n)

  var p = 0
  for (var i = 0; i < h; ++i) {
    var row = array[i]
    for (var j = 0; j < w; ++j) {
      data[p++] = row[j]
    }
  }

  postConvert(image, data)
}

function flatten3DData (image, array, w, h, c) {
  var n = w * h * c
  var data = preConvert(image, n)

  var p = 0
  for (var i = 0; i < h; ++i) {
    var row = array[i]
    for (var j = 0; j < w; ++j) {
      var pixel = row[j]
      for (var k = 0; k < c; ++k) {
        data[p++] = pixel[k]
      }
    }
  }

  postConvert(image, data)
}

function getTextureSize (format, type, width, height, isMipmap, isCube) {
  var s
  if (typeof FORMAT_SIZES_SPECIAL[format] !== 'undefined') {
    // we have a special array for dealing with weird color formats such as RGB5A1
    s = FORMAT_SIZES_SPECIAL[format]
  } else {
    s = FORMAT_CHANNELS[format] * TYPE_SIZES[type]
  }

  if (isCube) {
    s *= 6
  }

  if (isMipmap) {
    // compute the total size of all the mipmaps.
    var total = 0

    var w = width
    while (w >= 1) {
      // we can only use mipmaps on a square image,
      // so we can simply use the width and ignore the height:
      total += s * w * w
      w /= 2
    }
    return total
  } else {
    return s * width * height
  }
}

module.exports = function createTextureSet (
  gl, extensions, limits, reglPoll, contextState, stats, config) {
  // -------------------------------------------------------
  // Initialize constants and parameter tables here
  // -------------------------------------------------------
  var mipmapHint = {
    "don't care": GL_DONT_CARE,
    'dont care': GL_DONT_CARE,
    'nice': GL_NICEST,
    'fast': GL_FASTEST
  }

  var wrapModes = {
    'repeat': GL_REPEAT,
    'clamp': GL_CLAMP_TO_EDGE,
    'mirror': GL_MIRRORED_REPEAT
  }

  var magFilters = {
    'nearest': GL_NEAREST,
    'linear': GL_LINEAR
  }

  var minFilters = extend({
    'mipmap': GL_LINEAR_MIPMAP_LINEAR,
    'nearest mipmap nearest': GL_NEAREST_MIPMAP_NEAREST,
    'linear mipmap nearest': GL_LINEAR_MIPMAP_NEAREST,
    'nearest mipmap linear': GL_NEAREST_MIPMAP_LINEAR,
    'linear mipmap linear': GL_LINEAR_MIPMAP_LINEAR
  }, magFilters)

  var colorSpace = {
    'none': 0,
    'browser': GL_BROWSER_DEFAULT_WEBGL
  }

  var textureTypes = {
    'uint8': GL_UNSIGNED_BYTE,
    'rgba4': GL_UNSIGNED_SHORT_4_4_4_4,
    'rgb565': GL_UNSIGNED_SHORT_5_6_5,
    'rgb5 a1': GL_UNSIGNED_SHORT_5_5_5_1
  }

  var textureFormats = {
    'alpha': GL_ALPHA,
    'luminance': GL_LUMINANCE,
    'luminance alpha': GL_LUMINANCE_ALPHA,
    'rgb': GL_RGB,
    'rgba': GL_RGBA,
    'rgba4': GL_RGBA4,
    'rgb5 a1': GL_RGB5_A1,
    'rgb565': GL_RGB565
  }

  var compressedTextureFormats = {}

  if (extensions.ext_srgb) {
    textureFormats.srgb = GL_SRGB_EXT
    textureFormats.srgba = GL_SRGB_ALPHA_EXT
  }

  if (extensions.oes_texture_float) {
    textureTypes.float32 = textureTypes.float = GL_FLOAT
  }

  if (extensions.oes_texture_half_float) {
    textureTypes['float16'] = textureTypes['half float'] = GL_HALF_FLOAT_OES
  }

  if (extensions.webgl_depth_texture) {
    extend(textureFormats, {
      'depth': GL_DEPTH_COMPONENT,
      'depth stencil': GL_DEPTH_STENCIL
    })

    extend(textureTypes, {
      'uint16': GL_UNSIGNED_SHORT,
      'uint32': GL_UNSIGNED_INT,
      'depth stencil': GL_UNSIGNED_INT_24_8_WEBGL
    })
  }

  if (extensions.webgl_compressed_texture_s3tc) {
    extend(compressedTextureFormats, {
      'rgb s3tc dxt1': GL_COMPRESSED_RGB_S3TC_DXT1_EXT,
      'rgba s3tc dxt1': GL_COMPRESSED_RGBA_S3TC_DXT1_EXT,
      'rgba s3tc dxt3': GL_COMPRESSED_RGBA_S3TC_DXT3_EXT,
      'rgba s3tc dxt5': GL_COMPRESSED_RGBA_S3TC_DXT5_EXT
    })
  }

  if (extensions.webgl_compressed_texture_atc) {
    extend(compressedTextureFormats, {
      'rgb atc': GL_COMPRESSED_RGB_ATC_WEBGL,
      'rgba atc explicit alpha': GL_COMPRESSED_RGBA_ATC_EXPLICIT_ALPHA_WEBGL,
      'rgba atc interpolated alpha': GL_COMPRESSED_RGBA_ATC_INTERPOLATED_ALPHA_WEBGL
    })
  }

  if (extensions.webgl_compressed_texture_pvrtc) {
    extend(compressedTextureFormats, {
      'rgb pvrtc 4bppv1': GL_COMPRESSED_RGB_PVRTC_4BPPV1_IMG,
      'rgb pvrtc 2bppv1': GL_COMPRESSED_RGB_PVRTC_2BPPV1_IMG,
      'rgba pvrtc 4bppv1': GL_COMPRESSED_RGBA_PVRTC_4BPPV1_IMG,
      'rgba pvrtc 2bppv1': GL_COMPRESSED_RGBA_PVRTC_2BPPV1_IMG
    })
  }

  if (extensions.webgl_compressed_texture_etc1) {
    compressedTextureFormats['rgb etc1'] = GL_COMPRESSED_RGB_ETC1_WEBGL
  }

  // Copy over all texture formats
  var supportedCompressedFormats = Array.prototype.slice.call(
    gl.getParameter(GL_COMPRESSED_TEXTURE_FORMATS))
  Object.keys(compressedTextureFormats).forEach(function (name) {
    var format = compressedTextureFormats[name]
    if (supportedCompressedFormats.indexOf(format) >= 0) {
      textureFormats[name] = format
    }
  })

  var supportedFormats = Object.keys(textureFormats)
  limits.textureFormats = supportedFormats

  // associate with every format string its
  // corresponding GL-value.
  var textureFormatsInvert = []
  Object.keys(textureFormats).forEach(function (key) {
    var val = textureFormats[key]
    textureFormatsInvert[val] = key
  })

  // associate with every type string its
  // corresponding GL-value.
  var textureTypesInvert = []
  Object.keys(textureTypes).forEach(function (key) {
    var val = textureTypes[key]
    textureTypesInvert[val] = key
  })

  var magFiltersInvert = []
  Object.keys(magFilters).forEach(function (key) {
    var val = magFilters[key]
    magFiltersInvert[val] = key
  })

  var minFiltersInvert = []
  Object.keys(minFilters).forEach(function (key) {
    var val = minFilters[key]
    minFiltersInvert[val] = key
  })

  var wrapModesInvert = []
  Object.keys(wrapModes).forEach(function (key) {
    var val = wrapModes[key]
    wrapModesInvert[val] = key
  })

  // colorFormats[] gives the format (channels) associated to an
  // internalformat
  var colorFormats = supportedFormats.reduce(function (color, key) {
    var glenum = textureFormats[key]
    if (glenum === GL_LUMINANCE ||
        glenum === GL_ALPHA ||
        glenum === GL_LUMINANCE ||
        glenum === GL_LUMINANCE_ALPHA ||
        glenum === GL_DEPTH_COMPONENT ||
        glenum === GL_DEPTH_STENCIL) {
      color[glenum] = glenum
    } else if (glenum === GL_RGB5_A1 || key.indexOf('rgba') >= 0) {
      color[glenum] = GL_RGBA
    } else {
      color[glenum] = GL_RGB
    }
    return color
  }, {})

  function TexFlags () {
    // format info
    this.internalformat = GL_RGBA
    this.format = GL_RGBA
    this.type = GL_UNSIGNED_BYTE
    this.compressed = false

    // pixel storage
    this.premultiplyAlpha = false
    this.flipY = false
    this.unpackAlignment = 1
    this.colorSpace = 0

    // shape info
    this.width = 0
    this.height = 0
    this.channels = 4
  }

  function copyFlags (result, other) {
    result.internalformat = other.internalformat
    result.format = other.format
    result.type = other.type
    result.compressed = other.compressed

    result.premultiplyAlpha = other.premultiplyAlpha
    result.flipY = other.flipY
    result.unpackAlignment = other.unpackAlignment
    result.colorSpace = other.colorSpace

    result.width = other.width
    result.height = other.height
    result.channels = other.channels
  }

  function parseFlags (flags, options) {
    if (typeof options !== 'object' || !options) {
      return
    }

    if ('premultiplyAlpha' in options) {
      
      flags.premultiplyAlpha = options.premultiplyAlpha
    }

    if ('flipY' in options) {
      
      flags.flipY = options.flipY
    }

    if ('alignment' in options) {
      
      flags.unpackAlignment = options.alignment
    }

    if ('colorSpace' in options) {
      
      flags.colorSpace = colorSpace[options.colorSpace]
    }

    if ('type' in options) {
      var type = options.type
      
      
      
      
      flags.type = textureTypes[type]
    }

    var w = flags.width
    var h = flags.height
    var c = flags.channels
    var hasChannels = false
    if ('shape' in options) {
      
      w = options.shape[0]
      h = options.shape[1]
      if (options.shape.length === 3) {
        c = options.shape[2]
        
        hasChannels = true
      }
      
      
    } else {
      if ('radius' in options) {
        w = h = options.radius
        
      }
      if ('width' in options) {
        w = options.width
        
      }
      if ('height' in options) {
        h = options.height
        
      }
      if ('channels' in options) {
        c = options.channels
        
        hasChannels = true
      }
    }
    flags.width = w | 0
    flags.height = h | 0
    flags.channels = c | 0

    var hasFormat = false
    if ('format' in options) {
      var formatStr = options.format
      
      
      var internalformat = flags.internalformat = textureFormats[formatStr]
      flags.format = colorFormats[internalformat]
      if (formatStr in textureTypes) {
        if (!('type' in options)) {
          flags.type = textureTypes[formatStr]
        }
      }
      if (formatStr in compressedTextureFormats) {
        flags.compressed = true
      }
      hasFormat = true
    }

    // Reconcile channels and format
    if (!hasChannels && hasFormat) {
      flags.channels = FORMAT_CHANNELS[flags.format]
    } else if (hasChannels && !hasFormat) {
      if (flags.channels !== CHANNELS_FORMAT[flags.format]) {
        flags.format = flags.internalformat = CHANNELS_FORMAT[flags.channels]
      }
    } else if (hasFormat && hasChannels) {
      
    }
  }

  function setFlags (flags) {
    gl.pixelStorei(GL_UNPACK_FLIP_Y_WEBGL, flags.flipY)
    gl.pixelStorei(GL_UNPACK_PREMULTIPLY_ALPHA_WEBGL, flags.premultiplyAlpha)
    gl.pixelStorei(GL_UNPACK_COLORSPACE_CONVERSION_WEBGL, flags.colorSpace)
    gl.pixelStorei(GL_UNPACK_ALIGNMENT, flags.unpackAlignment)
  }

  // -------------------------------------------------------
  // Tex image data
  // -------------------------------------------------------
  function TexImage () {
    TexFlags.call(this)

    this.xOffset = 0
    this.yOffset = 0

    // data
    this.data = null
    this.needsFree = false

    // html element
    this.element = null

    // copyTexImage info
    this.needsCopy = false
  }

  function parseImage (image, options) {
    var data = null
    if (isPixelData(options)) {
      data = options
    } else if (options) {
      
      parseFlags(image, options)
      if ('x' in options) {
        image.xOffset = options.x | 0
      }
      if ('y' in options) {
        image.yOffset = options.y | 0
      }
      if (isPixelData(options.data)) {
        data = options.data
      }
    }

    

    if (options.copy) {
      
      var viewW = contextState.viewportWidth
      var viewH = contextState.viewportHeight
      image.width = image.width || (viewW - image.xOffset)
      image.height = image.height || (viewH - image.yOffset)
      image.needsCopy = true
      
    } else if (!data) {
      image.width = image.width || 1
      image.height = image.height || 1
    } else if (isTypedArray(data)) {
      image.data = data
      if (!('type' in options) && image.type === GL_UNSIGNED_BYTE) {
        image.type = typedArrayCode(data)
      }
    } else if (isNumericArray(data)) {
      convertData(image, data)
      image.alignment = 1
      image.needsFree = true
    } else if (isNDArrayLike(data)) {
      var array = data.data
      if (!Array.isArray(array) && image.type === GL_UNSIGNED_BYTE) {
        image.type = typedArrayCode(array)
      }
      var shape = data.shape
      var stride = data.stride
      var shapeX, shapeY, shapeC, strideX, strideY, strideC
      if (shape.length === 3) {
        shapeC = shape[2]
        strideC = stride[2]
      } else {
        
        shapeC = 1
        strideC = 1
      }
      shapeX = shape[0]
      shapeY = shape[1]
      strideX = stride[0]
      strideY = stride[1]
      image.alignment = 1
      image.width = shapeX
      image.height = shapeY
      image.channels = shapeC
      image.format = image.internalformat = CHANNELS_FORMAT[shapeC]
      image.needsFree = true
      transposeData(image, array, strideX, strideY, strideC, data.offset)
    } else if (isCanvasElement(data) || isContext2D(data)) {
      if (isCanvasElement(data)) {
        image.element = data
      } else {
        image.element = data.canvas
      }
      image.width = image.element.width
      image.height = image.element.height
    } else if (isImageElement(data)) {
      image.element = data
      image.width = data.naturalWidth
      image.height = data.naturalHeight
    } else if (isVideoElement(data)) {
      image.element = data
      image.width = data.videoWidth
      image.height = data.videoHeight
      image.needsPoll = true
    } else if (isRectArray(data)) {
      var w = data[0].length
      var h = data.length
      var c = 1
      if (isArrayLike(data[0][0])) {
        c = data[0][0].length
        flatten3DData(image, data, w, h, c)
      } else {
        flatten2DData(image, data, w, h)
      }
      image.alignment = 1
      image.width = w
      image.height = h
      image.channels = c
      image.format = image.internalformat = CHANNELS_FORMAT[c]
      image.needsFree = true
    }

    if (image.type === GL_FLOAT) {
      
    } else if (image.type === GL_HALF_FLOAT_OES) {
      
    }

    // do compressed texture  validation here.
  }

  function setImage (info, target, miplevel) {
    var element = info.element
    var data = info.data
    var internalformat = info.internalformat
    var format = info.format
    var type = info.type
    var width = info.width
    var height = info.height

    setFlags(info)

    if (element) {
      gl.texImage2D(target, miplevel, format, format, type, element)
    } else if (info.compressed) {
      gl.compressedTexImage2D(target, miplevel, internalformat, width, height, 0, data)
    } else if (info.needsCopy) {
      reglPoll()
      gl.copyTexImage2D(
        target, miplevel, format, info.xOffset, info.yOffset, width, height, 0)
    } else {
      gl.texImage2D(
        target, miplevel, format, width, height, 0, format, type, data)
    }
  }

  function setSubImage (info, target, x, y, miplevel) {
    var element = info.element
    var data = info.data
    var internalformat = info.internalformat
    var format = info.format
    var type = info.type
    var width = info.width
    var height = info.height

    setFlags(info)

    if (element) {
      gl.texSubImage2D(
        target, miplevel, x, y, format, type, element)
    } else if (info.compressed) {
      gl.compressedTexSubImage2D(
        target, miplevel, x, y, internalformat, width, height, data)
    } else if (info.needsCopy) {
      reglPoll()
      gl.copyTexSubImage2D(
        target, miplevel, x, y, info.xOffset, info.yOffset, width, height)
    } else {
      gl.texSubImage2D(
        target, miplevel, x, y, width, height, format, type, data)
    }
  }

  // texImage pool
  var imagePool = []

  function allocImage () {
    return imagePool.pop() || new TexImage()
  }

  function freeImage (image) {
    if (image.needsFree) {
      pool.freeType(image.data)
    }
    TexImage.call(image)
    imagePool.push(image)
  }

  // -------------------------------------------------------
  // Mip map
  // -------------------------------------------------------
  function MipMap () {
    TexFlags.call(this)

    this.genMipmaps = false
    this.mipmapHint = GL_DONT_CARE
    this.mipmask = 0
    this.images = Array(16)
  }

  function parseMipMapFromShape (mipmap, width, height) {
    var img = mipmap.images[0] = allocImage()
    mipmap.mipmask = 1
    img.width = mipmap.width = width
    img.height = mipmap.height = height
  }

  function parseMipMapFromObject (mipmap, options) {
    var imgData = null
    if (isPixelData(options)) {
      imgData = mipmap.images[0] = allocImage()
      copyFlags(imgData, mipmap)
      parseImage(imgData, options)
      mipmap.mipmask = 1
    } else {
      parseFlags(mipmap, options)
      if (Array.isArray(options.mipmap)) {
        var mipData = options.mipmap
        for (var i = 0; i < mipData.length; ++i) {
          imgData = mipmap.images[i] = allocImage()
          copyFlags(imgData, mipmap)
          imgData.width >>= i
          imgData.height >>= i
          parseImage(imgData, mipData[i])
          mipmap.mipmask |= (1 << i)
        }
      } else {
        imgData = mipmap.images[0] = allocImage()
        copyFlags(imgData, mipmap)
        parseImage(imgData, options)
        mipmap.mipmask = 1
      }
    }
    copyFlags(mipmap, mipmap.images[0])

    // For textures of the compressed format WEBGL_compressed_texture_s3tc
    // we must have that
    //
    // "When level equals zero width and height must be a multiple of 4.
    // When level is greater than 0 width and height must be 0, 1, 2 or a multiple of 4. "
    //
    // but we do not yet support having multiple mipmap levels for compressed textures,
    // so we only test for level zero.

    if (mipmap.compressed &&
        (mipmap.internalformat === GL_COMPRESSED_RGB_S3TC_DXT1_EXT) ||
        (mipmap.internalformat === GL_COMPRESSED_RGBA_S3TC_DXT1_EXT) ||
        (mipmap.internalformat === GL_COMPRESSED_RGBA_S3TC_DXT3_EXT) ||
        (mipmap.internalformat === GL_COMPRESSED_RGBA_S3TC_DXT5_EXT)) {
      
    }
  }

  function setMipMap (mipmap, target) {
    var images = mipmap.images
    for (var i = 0; i < images.length; ++i) {
      if (!images[i]) {
        return
      }
      setImage(images[i], target, i)
    }
  }

  var mipPool = []

  function allocMipMap () {
    var result = mipPool.pop() || new MipMap()
    TexFlags.call(result)
    result.mipmask = 0
    for (var i = 0; i < 16; ++i) {
      result.images[i] = null
    }
    return result
  }

  function freeMipMap (mipmap) {
    var images = mipmap.images
    for (var i = 0; i < images.length; ++i) {
      if (images[i]) {
        freeImage(images[i])
      }
      images[i] = null
    }
    mipPool.push(mipmap)
  }

  // -------------------------------------------------------
  // Tex info
  // -------------------------------------------------------
  function TexInfo () {
    this.minFilter = GL_NEAREST
    this.magFilter = GL_NEAREST

    this.wrapS = GL_CLAMP_TO_EDGE
    this.wrapT = GL_CLAMP_TO_EDGE

    this.anisotropic = 1

    this.genMipmaps = false
    this.mipmapHint = GL_DONT_CARE
  }

  function parseTexInfo (info, options) {
    if ('min' in options) {
      var minFilter = options.min
      
      info.minFilter = minFilters[minFilter]
      if (MIPMAP_FILTERS.indexOf(info.minFilter) >= 0) {
        info.genMipmaps = true
      }
    }

    if ('mag' in options) {
      var magFilter = options.mag
      
      info.magFilter = magFilters[magFilter]
    }

    var wrapS = info.wrapS
    var wrapT = info.wrapT
    if ('wrap' in options) {
      var wrap = options.wrap
      if (typeof wrap === 'string') {
        
        wrapS = wrapT = wrapModes[wrap]
      } else if (Array.isArray(wrap)) {
        
        
        wrapS = wrapModes[wrap[0]]
        wrapT = wrapModes[wrap[1]]
      }
    } else {
      if ('wrapS' in options) {
        var optWrapS = options.wrapS
        
        wrapS = wrapModes[optWrapS]
      }
      if ('wrapT' in options) {
        var optWrapT = options.wrapT
        
        wrapT = wrapModes[optWrapT]
      }
    }
    info.wrapS = wrapS
    info.wrapT = wrapT

    if ('anisotropic' in options) {
      var anisotropic = options.anisotropic
      
      info.anisotropic = options.anisotropic
    }

    if ('mipmap' in options) {
      var hasMipMap = false
      switch (typeof options.mipmap) {
        case 'string':
          
          info.mipmapHint = mipmapHint[options.mipmap]
          info.genMipmaps = true
          hasMipMap = true
          break

        case 'boolean':
          hasMipMap = info.genMipmaps = options.mipmap
          break

        case 'object':
          
          info.genMipmaps = false
          hasMipMap = true
          break

        default:
          
      }
      if (hasMipMap && !('min' in options)) {
        info.minFilter = GL_NEAREST_MIPMAP_NEAREST
      }
    }
  }

  function setTexInfo (info, target) {
    gl.texParameteri(target, GL_TEXTURE_MIN_FILTER, info.minFilter)
    gl.texParameteri(target, GL_TEXTURE_MAG_FILTER, info.magFilter)
    gl.texParameteri(target, GL_TEXTURE_WRAP_S, info.wrapS)
    gl.texParameteri(target, GL_TEXTURE_WRAP_T, info.wrapT)
    if (extensions.ext_texture_filter_anisotropic) {
      gl.texParameteri(target, GL_TEXTURE_MAX_ANISOTROPY_EXT, info.anisotropic)
    }
    if (info.genMipmaps) {
      gl.hint(GL_GENERATE_MIPMAP_HINT, info.mipmapHint)
      gl.generateMipmap(target)
    }
  }

  // -------------------------------------------------------
  // Full texture object
  // -------------------------------------------------------
  var textureCount = 0
  var textureSet = {}
  var numTexUnits = limits.maxTextureUnits
  var textureUnits = Array(numTexUnits).map(function () {
    return null
  })

  function REGLTexture (target) {
    TexFlags.call(this)
    this.mipmask = 0
    this.internalformat = GL_RGBA

    this.id = textureCount++

    this.refCount = 1

    this.target = target
    this.texture = gl.createTexture()

    this.unit = -1
    this.bindCount = 0

    this.texInfo = new TexInfo()

    if (config.profile) {
      this.stats = {size: 0}
    }
  }

  function tempBind (texture) {
    gl.activeTexture(GL_TEXTURE0)
    gl.bindTexture(texture.target, texture.texture)
  }

  function tempRestore () {
    var prev = textureUnits[0]
    if (prev) {
      gl.bindTexture(prev.target, prev.texture)
    } else {
      gl.bindTexture(GL_TEXTURE_2D, null)
    }
  }

  function destroy (texture) {
    var handle = texture.texture
    
    var unit = texture.unit
    var target = texture.target
    if (unit >= 0) {
      gl.activeTexture(GL_TEXTURE0 + unit)
      gl.bindTexture(target, null)
      textureUnits[unit] = null
    }
    gl.deleteTexture(handle)
    texture.texture = null
    texture.params = null
    texture.pixels = null
    texture.refCount = 0
    delete textureSet[texture.id]
    stats.textureCount--
  }

  extend(REGLTexture.prototype, {
    bind: function () {
      var texture = this
      texture.bindCount += 1
      var unit = texture.unit
      if (unit < 0) {
        for (var i = 0; i < numTexUnits; ++i) {
          var other = textureUnits[i]
          if (other) {
            if (other.bindCount > 0) {
              continue
            }
            other.unit = -1
          }
          textureUnits[i] = texture
          unit = i
          break
        }
        if (unit >= numTexUnits) {
          
        }
        if (config.profile && stats.maxTextureUnits < (unit + 1)) {
          stats.maxTextureUnits = unit + 1 // +1, since the units are zero-based
        }
        texture.unit = unit
        gl.activeTexture(GL_TEXTURE0 + unit)
        gl.bindTexture(texture.target, texture.texture)
      }
      return unit
    },

    unbind: function () {
      this.bindCount -= 1
    },

    decRef: function () {
      if (--this.refCount <= 0) {
        destroy(this)
      }
    }
  })

  function createTexture2D (a, b) {
    var texture = new REGLTexture(GL_TEXTURE_2D)
    textureSet[texture.id] = texture
    stats.textureCount++

    function reglTexture2D (a, b) {
      var texInfo = texture.texInfo
      TexInfo.call(texInfo)
      var mipData = allocMipMap()

      if (typeof a === 'number') {
        if (typeof b === 'number') {
          parseMipMapFromShape(mipData, a | 0, b | 0)
        } else {
          parseMipMapFromShape(mipData, a | 0, a | 0)
        }
      } else if (a) {
        
        parseTexInfo(texInfo, a)
        parseMipMapFromObject(mipData, a)
      } else {
        // empty textures get assigned a default shape of 1x1
        parseMipMapFromShape(mipData, 1, 1)
      }

      if (texInfo.genMipmaps) {
        mipData.mipmask = (mipData.width << 1) - 1
      }
      texture.mipmask = mipData.mipmask

      copyFlags(texture, mipData)

      
      texture.internalformat = mipData.internalformat

      reglTexture2D.width = mipData.width
      reglTexture2D.height = mipData.height

      tempBind(texture)
      setMipMap(mipData, GL_TEXTURE_2D)
      setTexInfo(texInfo, GL_TEXTURE_2D)
      tempRestore()

      freeMipMap(mipData)

      if (config.profile) {
        texture.stats.size = getTextureSize(
          texture.internalformat,
          texture.type,
          mipData.width,
          mipData.height,
          texInfo.genMipmaps,
          false)
      }
      reglTexture2D.format = textureFormatsInvert[texture.internalformat]
      reglTexture2D.type = textureTypesInvert[texture.type]

      reglTexture2D.mag = magFiltersInvert[texInfo.magFilter]
      reglTexture2D.min = minFiltersInvert[texInfo.minFilter]

      reglTexture2D.wrapS = wrapModesInvert[texInfo.wrapS]
      reglTexture2D.wrapT = wrapModesInvert[texInfo.wrapT]

      return reglTexture2D
    }

    function subimage (image, x_, y_, level_) {
      

      var x = x_ | 0
      var y = y_ | 0
      var level = level_ | 0

      var imageData = allocImage()
      copyFlags(imageData, texture)
      imageData.width >>= level
      imageData.height >>= level
      imageData.width -= x
      imageData.height -= y
      parseImage(imageData, image)

      
      
      
      

      tempBind(texture)
      setSubImage(imageData, GL_TEXTURE_2D, x, y, level)
      tempRestore()

      freeImage(imageData)

      return reglTexture2D
    }

    function resize (w_, h_) {
      var w = w_ | 0
      var h = (h_ | 0) || w
      if (w === texture.width && h === texture.height) {
        return reglTexture2D
      }

      reglTexture2D.width = texture.width = w
      reglTexture2D.height = texture.height = h

      tempBind(texture)
      for (var i = 0; texture.mipmask >> i; ++i) {
        gl.texImage2D(
          GL_TEXTURE_2D,
          i,
          texture.format,
          w >> i,
          h >> i,
          0,
          texture.format,
          texture.type,
          null)
      }
      tempRestore()

      // also, recompute the texture size.
      if (config.profile) {
        texture.stats.size = getTextureSize(
          texture.internalformat,
          texture.type,
          w,
          h,
          false,
          false)
      }

      return reglTexture2D
    }

    reglTexture2D(a, b)

    reglTexture2D.subimage = subimage
    reglTexture2D.resize = resize
    reglTexture2D._reglType = 'texture2d'
    reglTexture2D._texture = texture
    if (config.profile) {
      reglTexture2D.stats = texture.stats
    }
    reglTexture2D.destroy = function () {
      texture.decRef()
    }

    return reglTexture2D
  }

  function createTextureCube (a0, a1, a2, a3, a4, a5) {
    var texture = new REGLTexture(GL_TEXTURE_CUBE_MAP)
    textureSet[texture.id] = texture
    stats.cubeCount++

    var faces = new Array(6)

    function reglTextureCube (a0, a1, a2, a3, a4, a5) {
      var i
      var texInfo = texture.texInfo
      TexInfo.call(texInfo)
      for (i = 0; i < 6; ++i) {
        faces[i] = allocMipMap()
      }

      if (typeof a0 === 'number' || !a0) {
        var s = (a0 | 0) || 1
        for (i = 0; i < 6; ++i) {
          parseMipMapFromShape(faces[i], s, s)
        }
      } else if (typeof a0 === 'object') {
        if (a1) {
          parseMipMapFromObject(faces[0], a0)
          parseMipMapFromObject(faces[1], a1)
          parseMipMapFromObject(faces[2], a2)
          parseMipMapFromObject(faces[3], a3)
          parseMipMapFromObject(faces[4], a4)
          parseMipMapFromObject(faces[5], a5)
        } else {
          parseTexInfo(texInfo, a0)
          parseFlags(texture, a0)
          if ('faces' in a0) {
            var face_input = a0.faces
            
            for (i = 0; i < 6; ++i) {
              
              copyFlags(faces[i], texture)
              parseMipMapFromObject(faces[i], face_input[i])
            }
          } else {
            for (i = 0; i < 6; ++i) {
              parseMipMapFromObject(faces[i], a0)
            }
          }
        }
      } else {
        
      }

      copyFlags(texture, faces[0])
      if (texInfo.genMipmaps) {
        texture.mipmask = (faces[0].width << 1) - 1
      } else {
        texture.mipmask = faces[0].mipmask
      }

      
      texture.internalformat = faces[0].internalformat

      reglTextureCube.width = faces[0].width
      reglTextureCube.height = faces[0].height

      tempBind(texture)
      for (i = 0; i < 6; ++i) {
        setMipMap(faces[i], GL_TEXTURE_CUBE_MAP_POSITIVE_X + i)
      }
      setTexInfo(texInfo, GL_TEXTURE_CUBE_MAP)
      tempRestore()

      if (config.profile) {
        texture.stats.size = getTextureSize(
          texture.internalformat,
          texture.type,
          reglTextureCube.width,
          reglTextureCube.height,
          texInfo.genMipmaps,
          true)
      }

      reglTextureCube.format = textureFormatsInvert[texture.internalformat]
      reglTextureCube.type = textureTypesInvert[texture.type]

      reglTextureCube.mag = magFiltersInvert[texInfo.magFilter]
      reglTextureCube.min = minFiltersInvert[texInfo.minFilter]

      reglTextureCube.wrapS = wrapModesInvert[texInfo.wrapS]
      reglTextureCube.wrapT = wrapModesInvert[texInfo.wrapT]

      for (i = 0; i < 6; ++i) {
        freeMipMap(faces[i])
      }

      return reglTextureCube
    }

    function subimage (face, image, x_, y_, level_) {
      
      

      var x = x_ | 0
      var y = y_ | 0
      var level = level_ | 0

      var imageData = allocImage()
      copyFlags(imageData, texture)
      imageData.width >>= level
      imageData.height >>= level
      imageData.width -= x
      imageData.height -= y
      parseImage(imageData, image)

      
      
      
      

      tempBind(texture)
      setSubImage(imageData, GL_TEXTURE_CUBE_MAP_POSITIVE_X + face, x, y, level)
      tempRestore()

      freeImage(imageData)

      return reglTextureCube
    }

    function resize (radius_) {
      var radius = radius_ | 0
      if (radius === texture.width) {
        return
      }

      reglTextureCube.width = texture.width = radius
      reglTextureCube.height = texture.height = radius

      tempBind(texture)
      for (var i = 0; i < 6; ++i) {
        for (var j = 0; texture.mipmask >> j; ++j) {
          gl.texImage2D(
            GL_TEXTURE_CUBE_MAP_POSITIVE_X + i,
            j,
            texture.format,
            radius >> j,
            radius >> j,
            0,
            texture.format,
            texture.type,
            null)
        }
      }
      tempRestore()

      if (config.profile) {
        texture.stats.size = getTextureSize(
          texture.internalformat,
          texture.type,
          reglTextureCube.width,
          reglTextureCube.height,
          false,
          true)
      }

      return reglTextureCube
    }

    reglTextureCube(a0, a1, a2, a3, a4, a5)

    reglTextureCube.subimage = subimage
    reglTextureCube.resize = resize
    reglTextureCube._reglType = 'textureCube'
    reglTextureCube._texture = texture
    if (config.profile) {
      reglTextureCube.stats = texture.stats
    }
    reglTextureCube.destroy = function () {
      texture.decRef()
    }

    return reglTextureCube
  }

  // Called when regl is destroyed
  function destroyTextures () {
    for (var i = 0; i < numTexUnits; ++i) {
      gl.activeTexture(GL_TEXTURE0 + i)
      gl.bindTexture(GL_TEXTURE_2D, null)
      textureUnits[i] = null
    }
    values(textureSet).forEach(destroy)

    stats.cubeCount = 0
    stats.textureCount = 0
  }

  if (config.profile) {
    stats.getTotalTextureSize = function () {
      var total = 0
      Object.keys(textureSet).forEach(function (key) {
        total += textureSet[key].stats.size
      })
      return total
    }
  }

  function restoreTextures () {
    values(textureSet).forEach(function (texture) {
      texture.texture = gl.createTexture()
      gl.bindTexture(texture.target, texture.texture)
      for (var i = 0; i < 32; ++i) {
        if ((texture.mipmask & (1 << i)) === 0) {
          continue
        }
        if (texture.target === GL_TEXTURE_2D) {
          gl.texImage2D(GL_TEXTURE_2D,
            i,
            texture.internalformat,
            texture.width >> i,
            texture.height >> i,
            0,
            texture.internalformat,
            texture.type,
            null)
        } else {
          for (var j = 0; j < 6; ++j) {
            gl.texImage2D(GL_TEXTURE_CUBE_MAP_POSITIVE_X + j,
              i,
              texture.internalformat,
              texture.width >> i,
              texture.height >> i,
              0,
              texture.internalformat,
              texture.type,
              null)
          }
        }
      }
      setTexInfo(texture.texInfo, texture.target)
    })
  }

  return {
    create2D: createTexture2D,
    createCube: createTextureCube,
    clear: destroyTextures,
    getTexture: function (wrapper) {
      return null
    },
    restore: restoreTextures
  }
}

},{"./constants/arraytypes.json":4,"./util/extend":23,"./util/is-array-like":24,"./util/is-ndarray":25,"./util/is-typed-array":26,"./util/pool":28,"./util/to-half-float":30,"./util/values":31}],20:[function(require,module,exports){
var GL_QUERY_RESULT_EXT = 0x8866
var GL_QUERY_RESULT_AVAILABLE_EXT = 0x8867
var GL_TIME_ELAPSED_EXT = 0x88BF

module.exports = function (gl, extensions) {
  var extTimer = extensions.ext_disjoint_timer_query

  if (!extTimer) {
    return null
  }

  // QUERY POOL BEGIN
  var queryPool = []
  function allocQuery () {
    return queryPool.pop() || extTimer.createQueryEXT()
  }
  function freeQuery (query) {
    queryPool.push(query)
  }
  // QUERY POOL END

  var pendingQueries = []
  function beginQuery (stats) {
    var query = allocQuery()
    extTimer.beginQueryEXT(GL_TIME_ELAPSED_EXT, query)
    pendingQueries.push(query)
    pushScopeStats(pendingQueries.length - 1, pendingQueries.length, stats)
  }

  function endQuery () {
    extTimer.endQueryEXT(GL_TIME_ELAPSED_EXT)
  }

  //
  // Pending stats pool.
  //
  function PendingStats () {
    this.startQueryIndex = -1
    this.endQueryIndex = -1
    this.sum = 0
    this.stats = null
  }
  var pendingStatsPool = []
  function allocPendingStats () {
    return pendingStatsPool.pop() || new PendingStats()
  }
  function freePendingStats (pendingStats) {
    pendingStatsPool.push(pendingStats)
  }
  // Pending stats pool end

  var pendingStats = []
  function pushScopeStats (start, end, stats) {
    var ps = allocPendingStats()
    ps.startQueryIndex = start
    ps.endQueryIndex = end
    ps.sum = 0
    ps.stats = stats
    pendingStats.push(ps)
  }

  // we should call this at the beginning of the frame,
  // in order to update gpuTime
  var timeSum = []
  var queryPtr = []
  function update () {
    var ptr, i

    var n = pendingQueries.length
    if (n === 0) {
      return
    }

    // Reserve space
    queryPtr.length = Math.max(queryPtr.length, n + 1)
    timeSum.length = Math.max(timeSum.length, n + 1)
    timeSum[0] = 0
    queryPtr[0] = 0

    // Update all pending timer queries
    var queryTime = 0
    ptr = 0
    for (i = 0; i < pendingQueries.length; ++i) {
      var query = pendingQueries[i]
      if (extTimer.getQueryObjectEXT(query, GL_QUERY_RESULT_AVAILABLE_EXT)) {
        queryTime += extTimer.getQueryObjectEXT(query, GL_QUERY_RESULT_EXT)
        freeQuery(query)
      } else {
        pendingQueries[ptr++] = query
      }
      timeSum[i + 1] = queryTime
      queryPtr[i + 1] = ptr
    }
    pendingQueries.length = ptr

    // Update all pending stat queries
    ptr = 0
    for (i = 0; i < pendingStats.length; ++i) {
      var stats = pendingStats[i]
      var start = stats.startQueryIndex
      var end = stats.endQueryIndex
      stats.sum += timeSum[end] - timeSum[start]
      var startPtr = queryPtr[start]
      var endPtr = queryPtr[end]
      if (endPtr === startPtr) {
        stats.stats.gpuTime += stats.sum / 1e6
        freePendingStats(stats)
      } else {
        stats.startQueryIndex = startPtr
        stats.endQueryIndex = endPtr
        pendingStats[ptr++] = stats
      }
    }
    pendingStats.length = ptr
  }

  return {
    beginQuery: beginQuery,
    endQuery: endQuery,
    pushScopeStats: pushScopeStats,
    update: update,
    getNumPendingQueries: function () {
      return pendingQueries.length
    },
    clear: function () {
      queryPool.push.apply(queryPool, pendingQueries)
      for (var i = 0; i < queryPool.length; i++) {
        extTimer.deleteQueryEXT(queryPool[i])
      }
      pendingQueries.length = 0
      queryPool.length = 0
    },
    restore: function () {
      pendingQueries.length = 0
      queryPool.length = 0
    }
  }
}

},{}],21:[function(require,module,exports){
/* globals performance */
module.exports =
  (typeof performance !== 'undefined' && performance.now)
  ? function () { return performance.now() }
  : function () { return +(new Date()) }

},{}],22:[function(require,module,exports){
var extend = require('./extend')

function slice (x) {
  return Array.prototype.slice.call(x)
}

function join (x) {
  return slice(x).join('')
}

module.exports = function createEnvironment () {
  // Unique variable id counter
  var varCounter = 0

  // Linked values are passed from this scope into the generated code block
  // Calling link() passes a value into the generated scope and returns
  // the variable name which it is bound to
  var linkedNames = []
  var linkedValues = []
  function link (value) {
    for (var i = 0; i < linkedValues.length; ++i) {
      if (linkedValues[i] === value) {
        return linkedNames[i]
      }
    }

    var name = 'g' + (varCounter++)
    linkedNames.push(name)
    linkedValues.push(value)
    return name
  }

  // create a code block
  function block () {
    var code = []
    function push () {
      code.push.apply(code, slice(arguments))
    }

    var vars = []
    function def () {
      var name = 'v' + (varCounter++)
      vars.push(name)

      if (arguments.length > 0) {
        code.push(name, '=')
        code.push.apply(code, slice(arguments))
        code.push(';')
      }

      return name
    }

    return extend(push, {
      def: def,
      toString: function () {
        return join([
          (vars.length > 0 ? 'var ' + vars + ';' : ''),
          join(code)
        ])
      }
    })
  }

  function scope () {
    var entry = block()
    var exit = block()

    var entryToString = entry.toString
    var exitToString = exit.toString

    function save (object, prop) {
      exit(object, prop, '=', entry.def(object, prop), ';')
    }

    return extend(function () {
      entry.apply(entry, slice(arguments))
    }, {
      def: entry.def,
      entry: entry,
      exit: exit,
      save: save,
      set: function (object, prop, value) {
        save(object, prop)
        entry(object, prop, '=', value, ';')
      },
      toString: function () {
        return entryToString() + exitToString()
      }
    })
  }

  function conditional () {
    var pred = join(arguments)
    var thenBlock = scope()
    var elseBlock = scope()

    var thenToString = thenBlock.toString
    var elseToString = elseBlock.toString

    return extend(thenBlock, {
      then: function () {
        thenBlock.apply(thenBlock, slice(arguments))
        return this
      },
      else: function () {
        elseBlock.apply(elseBlock, slice(arguments))
        return this
      },
      toString: function () {
        var elseClause = elseToString()
        if (elseClause) {
          elseClause = 'else{' + elseClause + '}'
        }
        return join([
          'if(', pred, '){',
          thenToString(),
          '}', elseClause
        ])
      }
    })
  }

  // procedure list
  var globalBlock = block()
  var procedures = {}
  function proc (name, count) {
    var args = []
    function arg () {
      var name = 'a' + args.length
      args.push(name)
      return name
    }

    count = count || 0
    for (var i = 0; i < count; ++i) {
      arg()
    }

    var body = scope()
    var bodyToString = body.toString

    var result = procedures[name] = extend(body, {
      arg: arg,
      toString: function () {
        return join([
          'function(', args.join(), '){',
          bodyToString(),
          '}'
        ])
      }
    })

    return result
  }

  function compile () {
    var code = ['"use strict";',
      globalBlock,
      'return {']
    Object.keys(procedures).forEach(function (name) {
      code.push('"', name, '":', procedures[name].toString(), ',')
    })
    code.push('}')
    var src = join(code)
      .replace(/;/g, ';\n')
      .replace(/}/g, '}\n')
      .replace(/{/g, '{\n')
    var proc = Function.apply(null, linkedNames.concat(src))
    return proc.apply(null, linkedValues)
  }

  return {
    global: globalBlock,
    link: link,
    block: block,
    proc: proc,
    scope: scope,
    cond: conditional,
    compile: compile
  }
}

},{"./extend":23}],23:[function(require,module,exports){
module.exports = function (base, opts) {
  var keys = Object.keys(opts)
  for (var i = 0; i < keys.length; ++i) {
    base[keys[i]] = opts[keys[i]]
  }
  return base
}

},{}],24:[function(require,module,exports){
var isTypedArray = require('./is-typed-array')
module.exports = function isArrayLike (s) {
  return Array.isArray(s) || isTypedArray(s)
}

},{"./is-typed-array":26}],25:[function(require,module,exports){
var isTypedArray = require('./is-typed-array')

module.exports = function isNDArrayLike (obj) {
  return (
    !!obj &&
    typeof obj === 'object' &&
    Array.isArray(obj.shape) &&
    Array.isArray(obj.stride) &&
    typeof obj.offset === 'number' &&
    obj.shape.length === obj.stride.length &&
    (Array.isArray(obj.data) ||
      isTypedArray(obj.data)))
}

},{"./is-typed-array":26}],26:[function(require,module,exports){
var dtypes = require('../constants/arraytypes.json')
module.exports = function (x) {
  return Object.prototype.toString.call(x) in dtypes
}

},{"../constants/arraytypes.json":4}],27:[function(require,module,exports){
module.exports = function loop (n, f) {
  var result = Array(n)
  for (var i = 0; i < n; ++i) {
    result[i] = f(i)
  }
  return result
}

},{}],28:[function(require,module,exports){
var loop = require('./loop')

var GL_BYTE = 5120
var GL_UNSIGNED_BYTE = 5121
var GL_SHORT = 5122
var GL_UNSIGNED_SHORT = 5123
var GL_INT = 5124
var GL_UNSIGNED_INT = 5125
var GL_FLOAT = 5126

var bufferPool = loop(8, function () {
  return []
})

function nextPow16 (v) {
  for (var i = 16; i <= (1 << 28); i *= 16) {
    if (v <= i) {
      return i
    }
  }
  return 0
}

function log2 (v) {
  var r, shift
  r = (v > 0xFFFF) << 4
  v >>>= r
  shift = (v > 0xFF) << 3
  v >>>= shift; r |= shift
  shift = (v > 0xF) << 2
  v >>>= shift; r |= shift
  shift = (v > 0x3) << 1
  v >>>= shift; r |= shift
  return r | (v >> 1)
}

function alloc (n) {
  var sz = nextPow16(n)
  var bin = bufferPool[log2(sz) >> 2]
  if (bin.length > 0) {
    return bin.pop()
  }
  return new ArrayBuffer(sz)
}

function free (buf) {
  bufferPool[log2(buf.byteLength) >> 2].push(buf)
}

function allocType (type, n) {
  var result = null
  switch (type) {
    case GL_BYTE:
      result = new Int8Array(alloc(n), 0, n)
      break
    case GL_UNSIGNED_BYTE:
      result = new Uint8Array(alloc(n), 0, n)
      break
    case GL_SHORT:
      result = new Int16Array(alloc(2 * n), 0, n)
      break
    case GL_UNSIGNED_SHORT:
      result = new Uint16Array(alloc(2 * n), 0, n)
      break
    case GL_INT:
      result = new Int32Array(alloc(4 * n), 0, n)
      break
    case GL_UNSIGNED_INT:
      result = new Uint32Array(alloc(4 * n), 0, n)
      break
    case GL_FLOAT:
      result = new Float32Array(alloc(4 * n), 0, n)
      break
    default:
      return null
  }
  if (result.length !== n) {
    return result.subarray(0, n)
  }
  return result
}

function freeType (array) {
  free(array.buffer)
}

module.exports = {
  alloc: alloc,
  free: free,
  allocType: allocType,
  freeType: freeType
}

},{"./loop":27}],29:[function(require,module,exports){
/* globals requestAnimationFrame, cancelAnimationFrame */
if (typeof requestAnimationFrame === 'function' &&
    typeof cancelAnimationFrame === 'function') {
  module.exports = {
    next: function (x) { return requestAnimationFrame(x) },
    cancel: function (x) { return cancelAnimationFrame(x) }
  }
} else {
  module.exports = {
    next: function (cb) {
      return setTimeout(cb, 16)
    },
    cancel: clearTimeout
  }
}

},{}],30:[function(require,module,exports){
var pool = require('./pool')

var FLOAT = new Float32Array(1)
var INT = new Uint32Array(FLOAT.buffer)

var GL_UNSIGNED_SHORT = 5123

module.exports = function convertToHalfFloat (array) {
  var ushorts = pool.allocType(GL_UNSIGNED_SHORT, array.length)

  for (var i = 0; i < array.length; ++i) {
    if (isNaN(array[i])) {
      ushorts[i] = 0xffff
    } else if (array[i] === Infinity) {
      ushorts[i] = 0x7c00
    } else if (array[i] === -Infinity) {
      ushorts[i] = 0xfc00
    } else {
      FLOAT[0] = array[i]
      var x = INT[0]

      var sgn = (x >>> 31) << 15
      var exp = ((x << 1) >>> 24) - 127
      var frac = (x >> 13) & ((1 << 10) - 1)

      if (exp < -24) {
        // round non-representable denormals to 0
        ushorts[i] = sgn
      } else if (exp < -14) {
        // handle denormals
        var s = -14 - exp
        ushorts[i] = sgn + ((frac + (1 << 10)) >> s)
      } else if (exp > 15) {
        // round overflow to +/- Infinity
        ushorts[i] = sgn + 0x7c00
      } else {
        // otherwise convert directly
        ushorts[i] = sgn + ((exp + 15) << 10) + frac
      }
    }
  }

  return ushorts
}

},{"./pool":28}],31:[function(require,module,exports){
module.exports = function (obj) {
  return Object.keys(obj).map(function (key) { return obj[key] })
}

},{}],32:[function(require,module,exports){
// Context and canvas creation helper functions

var extend = require('./util/extend')

function createCanvas (element, onDone, pixelRatio) {
  var canvas = document.createElement('canvas')
  extend(canvas.style, {
    border: 0,
    margin: 0,
    padding: 0,
    top: 0,
    left: 0
  })
  element.appendChild(canvas)

  if (element === document.body) {
    canvas.style.position = 'absolute'
    extend(element.style, {
      margin: 0,
      padding: 0
    })
  }

  function resize () {
    var w = window.innerWidth
    var h = window.innerHeight
    if (element !== document.body) {
      var bounds = element.getBoundingClientRect()
      w = bounds.right - bounds.left
      h = bounds.top - bounds.bottom
    }
    canvas.width = pixelRatio * w
    canvas.height = pixelRatio * h
    extend(canvas.style, {
      width: w + 'px',
      height: h + 'px'
    })
  }

  window.addEventListener('resize', resize, false)

  function onDestroy () {
    window.removeEventListener('resize', resize)
    element.removeChild(canvas)
  }

  resize()

  return {
    canvas: canvas,
    onDestroy: onDestroy
  }
}

function createContext (canvas, contexAttributes) {
  function get (name) {
    try {
      return canvas.getContext(name, contexAttributes)
    } catch (e) {
      return null
    }
  }
  return (
    get('webgl') ||
    get('experimental-webgl') ||
    get('webgl-experimental')
  )
}

function isHTMLElement (obj) {
  return (
    typeof obj.nodeName === 'string' &&
    typeof obj.appendChild === 'function' &&
    typeof obj.getBoundingClientRect === 'function'
  )
}

function isWebGLContext (obj) {
  return (
    typeof obj.drawArrays === 'function' ||
    typeof obj.drawElements === 'function'
  )
}

function parseExtensions (input) {
  if (typeof input === 'string') {
    return input.split()
  }
  
  return input
}

function getElement (desc) {
  if (typeof desc === 'string') {
    
    return document.querySelector(desc)
  }
  return desc
}

module.exports = function parseArgs (args_) {
  var args = args_ || {}
  var element, container, canvas, gl
  var contextAttributes = {}
  var extensions = []
  var optionalExtensions = []
  var pixelRatio = (typeof window === 'undefined' ? 1 : window.devicePixelRatio)
  var profile = false
  var onDone = function (err) {
    if (err) {
      
    }
  }
  var onDestroy = function () {}
  if (typeof args === 'string') {
    
    element = document.querySelector(args)
    
  } else if (typeof args === 'object') {
    if (isHTMLElement(args)) {
      element = args
    } else if (isWebGLContext(args)) {
      gl = args
      canvas = gl.canvas
    } else {
      
      if ('gl' in args) {
        gl = args.gl
      } else if ('canvas' in args) {
        canvas = getElement(args.canvas)
      } else if ('container' in args) {
        container = getElement(args.container)
      }
      if ('attributes' in args) {
        contextAttributes = args.attributes
        
      }
      if ('extensions' in args) {
        extensions = parseExtensions(args.extensions)
      }
      if ('optionalExtensions' in args) {
        optionalExtensions = parseExtensions(args.optionalExtensions)
      }
      if ('onDone' in args) {
        
        onDone = args.onDone
      }
      if ('profile' in args) {
        profile = !!args.profile
      }
      if ('pixelRatio' in args) {
        pixelRatio = +args.pixelRatio
        
      }
    }
  } else {
    
  }

  if (element) {
    if (element.nodeName.toLowerCase() === 'canvas') {
      canvas = element
    } else {
      container = element
    }
  }

  if (!gl) {
    if (!canvas) {
      
      var result = createCanvas(container || document.body, onDone, pixelRatio)
      if (!result) {
        return null
      }
      canvas = result.canvas
      onDestroy = result.onDestroy
    }
    gl = createContext(canvas, contextAttributes)
  }

  if (!gl) {
    onDestroy()
    onDone('webgl not supported, try upgrading your browser or graphics drivers http://get.webgl.org')
    return null
  }

  return {
    gl: gl,
    canvas: canvas,
    container: container,
    extensions: extensions,
    optionalExtensions: optionalExtensions,
    pixelRatio: pixelRatio,
    profile: profile,
    onDone: onDone,
    onDestroy: onDestroy
  }
}

},{"./util/extend":23}],33:[function(require,module,exports){
'use strict'

module.exports = mouseListen

var mouse = require('mouse-event')

function mouseListen(element, callback) {
  if(!callback) {
    callback = element
    element = window
  }

  var buttonState = 0
  var x = 0
  var y = 0
  var mods = {
    shift:   false,
    alt:     false,
    control: false,
    meta:    false
  }
  var attached = false

  function updateMods(ev) {
    var changed = false
    if('altKey' in ev) {
      changed = changed || ev.altKey !== mods.alt
      mods.alt = !!ev.altKey
    }
    if('shiftKey' in ev) {
      changed = changed || ev.shiftKey !== mods.shift
      mods.shift = !!ev.shiftKey
    }
    if('ctrlKey' in ev) {
      changed = changed || ev.ctrlKey !== mods.control
      mods.control = !!ev.ctrlKey
    }
    if('metaKey' in ev) {
      changed = changed || ev.metaKey !== mods.meta
      mods.meta = !!ev.metaKey
    }
    return changed
  }

  function handleEvent(nextButtons, ev) {
    var nextX = mouse.x(ev)
    var nextY = mouse.y(ev)
    if('buttons' in ev) {
      nextButtons = ev.buttons|0
    }
    if(nextButtons !== buttonState ||
       nextX !== x ||
       nextY !== y ||
       updateMods(ev)) {
      buttonState = nextButtons|0
      x = nextX||0
      y = nextY||0
      callback && callback(buttonState, x, y, mods)
    }
  }

  function clearState(ev) {
    handleEvent(0, ev)
  }

  function handleBlur() {
    if(buttonState ||
      x ||
      y ||
      mods.shift ||
      mods.alt ||
      mods.meta ||
      mods.control) {

      x = y = 0
      buttonState = 0
      mods.shift = mods.alt = mods.control = mods.meta = false
      callback && callback(0, 0, 0, mods)
    }
  }

  function handleMods(ev) {
    if(updateMods(ev)) {
      callback && callback(buttonState, x, y, mods)
    }
  }

  function handleMouseMove(ev) {
    if(mouse.buttons(ev) === 0) {
      handleEvent(0, ev)
    } else {
      handleEvent(buttonState, ev)
    }
  }

  function handleMouseDown(ev) {
    handleEvent(buttonState | mouse.buttons(ev), ev)
  }

  function handleMouseUp(ev) {
    handleEvent(buttonState & ~mouse.buttons(ev), ev)
  }

  function attachListeners() {
    if(attached) {
      return
    }
    attached = true

    element.addEventListener('mousemove', handleMouseMove)

    element.addEventListener('mousedown', handleMouseDown)

    element.addEventListener('mouseup', handleMouseUp)

    element.addEventListener('mouseleave', clearState)
    element.addEventListener('mouseenter', clearState)
    element.addEventListener('mouseout', clearState)
    element.addEventListener('mouseover', clearState)

    element.addEventListener('blur', handleBlur)

    element.addEventListener('keyup', handleMods)
    element.addEventListener('keydown', handleMods)
    element.addEventListener('keypress', handleMods)

    if(element !== window) {
      window.addEventListener('blur', handleBlur)

      window.addEventListener('keyup', handleMods)
      window.addEventListener('keydown', handleMods)
      window.addEventListener('keypress', handleMods)
    }
  }

  function detachListeners() {
    if(!attached) {
      return
    }
    attached = false

    element.removeEventListener('mousemove', handleMouseMove)

    element.removeEventListener('mousedown', handleMouseDown)

    element.removeEventListener('mouseup', handleMouseUp)

    element.removeEventListener('mouseleave', clearState)
    element.removeEventListener('mouseenter', clearState)
    element.removeEventListener('mouseout', clearState)
    element.removeEventListener('mouseover', clearState)

    element.removeEventListener('blur', handleBlur)

    element.removeEventListener('keyup', handleMods)
    element.removeEventListener('keydown', handleMods)
    element.removeEventListener('keypress', handleMods)

    if(element !== window) {
      window.removeEventListener('blur', handleBlur)

      window.removeEventListener('keyup', handleMods)
      window.removeEventListener('keydown', handleMods)
      window.removeEventListener('keypress', handleMods)
    }
  }

  //Attach listeners
  attachListeners()

  var result = {
    element: element
  }

  Object.defineProperties(result, {
    enabled: {
      get: function() { return attached },
      set: function(f) {
        if(f) {
          attachListeners()
        } else {
          detachListeners
        }
      },
      enumerable: true
    },
    buttons: {
      get: function() { return buttonState },
      enumerable: true
    },
    x: {
      get: function() { return x },
      enumerable: true
    },
    y: {
      get: function() { return y },
      enumerable: true
    },
    mods: {
      get: function() { return mods },
      enumerable: true
    }
  })

  return result
}

},{"mouse-event":34}],34:[function(require,module,exports){
'use strict'

function mouseButtons(ev) {
  if(typeof ev === 'object') {
    if('buttons' in ev) {
      return ev.buttons
    } else if('which' in ev) {
      var b = ev.which
      if(b === 2) {
        return 4
      } else if(b === 3) {
        return 2
      } else if(b > 0) {
        return 1<<(b-1)
      }
    } else if('button' in ev) {
      var b = ev.button
      if(b === 1) {
        return 4
      } else if(b === 2) {
        return 2
      } else if(b >= 0) {
        return 1<<b
      }
    }
  }
  return 0
}
exports.buttons = mouseButtons

function mouseElement(ev) {
  return ev.target || ev.srcElement || window
}
exports.element = mouseElement

function mouseRelativeX(ev) {
  if(typeof ev === 'object') {
    if('offsetX' in ev) {
      return ev.offsetX
    }
    var target = mouseElement(ev)
    var bounds = target.getBoundingClientRect()
    return ev.clientX - bounds.left
  }
  return 0
}
exports.x = mouseRelativeX

function mouseRelativeY(ev) {
  if(typeof ev === 'object') {
    if('offsetY' in ev) {
      return ev.offsetY
    }
    var target = mouseElement(ev)
    var bounds = target.getBoundingClientRect()
    return ev.clientY - bounds.top
  }
  return 0
}
exports.y = mouseRelativeY

},{}],35:[function(require,module,exports){

var extend = require('./lib/util/extend')
var dynamic = require('./lib/dynamic')
var raf = require('./lib/util/raf')
var clock = require('./lib/util/clock')
var createStringStore = require('./lib/strings')
var initWebGL = require('./lib/webgl')
var wrapExtensions = require('./lib/extension')
var wrapLimits = require('./lib/limits')
var wrapBuffers = require('./lib/buffer')
var wrapElements = require('./lib/elements')
var wrapTextures = require('./lib/texture')
var wrapRenderbuffers = require('./lib/renderbuffer')
var wrapFramebuffers = require('./lib/framebuffer')
var wrapAttributes = require('./lib/attribute')
var wrapShaders = require('./lib/shader')
var wrapRead = require('./lib/read')
var createCore = require('./lib/core')
var createStats = require('./lib/stats')
var createTimer = require('./lib/timer')

var GL_COLOR_BUFFER_BIT = 16384
var GL_DEPTH_BUFFER_BIT = 256
var GL_STENCIL_BUFFER_BIT = 1024

var GL_ARRAY_BUFFER = 34962

var CONTEXT_LOST_EVENT = 'webglcontextlost'
var CONTEXT_RESTORED_EVENT = 'webglcontextrestored'

var DYN_PROP = 1
var DYN_CONTEXT = 2
var DYN_STATE = 3

function find (haystack, needle) {
  for (var i = 0; i < haystack.length; ++i) {
    if (haystack[i] === needle) {
      return i
    }
  }
  return -1
}

module.exports = function wrapREGL (args) {
  var config = initWebGL(args)
  if (!config) {
    return null
  }

  var gl = config.gl
  var glAttributes = gl.getContextAttributes()
  var contextLost = gl.isContextLost()

  var extensionState = wrapExtensions(gl, config)
  if (!extensionState) {
    return null
  }

  var stringStore = createStringStore()
  var stats = createStats()
  var extensions = extensionState.extensions
  var timer = createTimer(gl, extensions)

  var START_TIME = clock()
  var WIDTH = gl.drawingBufferWidth
  var HEIGHT = gl.drawingBufferHeight

  var contextState = {
    tick: 0,
    time: 0,
    viewportWidth: WIDTH,
    viewportHeight: HEIGHT,
    framebufferWidth: WIDTH,
    framebufferHeight: HEIGHT,
    drawingBufferWidth: WIDTH,
    drawingBufferHeight: HEIGHT,
    pixelRatio: config.pixelRatio
  }
  var uniformState = {}
  var drawState = {
    elements: null,
    primitive: 4, // GL_TRIANGLES
    count: -1,
    offset: 0,
    instances: -1
  }

  var limits = wrapLimits(gl, extensions)
  var bufferState = wrapBuffers(gl, stats, config)
  var elementState = wrapElements(gl, extensions, bufferState, stats)
  var attributeState = wrapAttributes(
    gl,
    extensions,
    limits,
    bufferState,
    stringStore)
  var shaderState = wrapShaders(gl, stringStore, stats, config)
  var textureState = wrapTextures(
    gl,
    extensions,
    limits,
    function () { core.procs.poll() },
    contextState,
    stats,
    config)
  var renderbufferState = wrapRenderbuffers(gl, extensions, limits, stats, config)
  var framebufferState = wrapFramebuffers(
    gl,
    extensions,
    limits,
    textureState,
    renderbufferState,
    stats)
  var core = createCore(
    gl,
    stringStore,
    extensions,
    limits,
    bufferState,
    elementState,
    textureState,
    framebufferState,
    uniformState,
    attributeState,
    shaderState,
    drawState,
    contextState,
    timer,
    config)
  var readPixels = wrapRead(
    gl,
    framebufferState,
    core.procs.poll,
    contextState,
    glAttributes, extensions)

  var nextState = core.next
  var canvas = gl.canvas

  var rafCallbacks = []
  var lossCallbacks = []
  var restoreCallbacks = []
  var destroyCallbacks = [config.onDestroy]

  var activeRAF = null
  function handleRAF () {
    if (rafCallbacks.length === 0) {
      if (timer) {
        timer.update()
      }
      activeRAF = null
      return
    }

    // schedule next animation frame
    activeRAF = raf.next(handleRAF)

    // poll for changes
    poll()

    // fire a callback for all pending rafs
    for (var i = rafCallbacks.length - 1; i >= 0; --i) {
      var cb = rafCallbacks[i]
      if (cb) {
        cb(contextState, null, 0)
      }
    }

    // flush all pending webgl calls
    gl.flush()

    // poll GPU timers *after* gl.flush so we don't delay command dispatch
    if (timer) {
      timer.update()
    }
  }

  function startRAF () {
    if (!activeRAF && rafCallbacks.length > 0) {
      activeRAF = raf.next(handleRAF)
    }
  }

  function stopRAF () {
    if (activeRAF) {
      raf.cancel(handleRAF)
      activeRAF = null
    }
  }

  function handleContextLoss (event) {
    event.preventDefault()

    // set context lost flag
    contextLost = true

    // pause request animation frame
    stopRAF()

    // lose context
    lossCallbacks.forEach(function (cb) {
      cb()
    })
  }

  function handleContextRestored (event) {
    // clear error code
    gl.getError()

    // clear context lost flag
    contextLost = false

    // refresh state
    extensionState.restore()
    shaderState.restore()
    bufferState.restore()
    textureState.restore()
    renderbufferState.restore()
    framebufferState.restore()
    if (timer) {
      timer.restore()
    }

    // refresh state
    core.procs.refresh()

    // restart RAF
    startRAF()

    // restore context
    restoreCallbacks.forEach(function (cb) {
      cb()
    })
  }

  if (canvas) {
    canvas.addEventListener(CONTEXT_LOST_EVENT, handleContextLoss, false)
    canvas.addEventListener(CONTEXT_RESTORED_EVENT, handleContextRestored, false)
  }

  function destroy () {
    rafCallbacks.length = 0
    stopRAF()

    if (canvas) {
      canvas.removeEventListener(CONTEXT_LOST_EVENT, handleContextLoss)
      canvas.removeEventListener(CONTEXT_RESTORED_EVENT, handleContextRestored)
    }

    shaderState.clear()
    framebufferState.clear()
    renderbufferState.clear()
    textureState.clear()
    elementState.clear()
    bufferState.clear()

    if (timer) {
      timer.clear()
    }

    destroyCallbacks.forEach(function (cb) {
      cb()
    })
  }

  function compileProcedure (options) {
    
    

    function flattenNestedOptions (options) {
      var result = extend({}, options)
      delete result.uniforms
      delete result.attributes
      delete result.context

      if ('stencil' in result && result.stencil.op) {
        result.stencil.opBack = result.stencil.opFront = result.stencil.op
        delete result.stencil.op
      }

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

    var stats = {
      gpuTime: 0.0,
      cpuTime: 0.0,
      count: 0
    }

    var compiled = core.compile(opts, attributes, uniforms, context, stats)

    var draw = compiled.draw
    var batch = compiled.batch
    var scope = compiled.scope

    // FIXME: we should modify code generation for batch commands so this
    // isn't necessary
    var EMPTY_ARRAY = []
    function reserve (count) {
      while (EMPTY_ARRAY.length < count) {
        EMPTY_ARRAY.push(null)
      }
      return EMPTY_ARRAY
    }

    function REGLCommand (args, body) {
      var i
      if (contextLost) {
        
      }
      if (typeof args === 'function') {
        return scope.call(this, null, args, 0)
      } else if (typeof body === 'function') {
        if (typeof args === 'number') {
          for (i = 0; i < args; ++i) {
            scope.call(this, null, body, i)
          }
          return
        } else if (Array.isArray(args)) {
          for (i = 0; i < args.length; ++i) {
            scope.call(this, args[i], body, i)
          }
          return
        } else {
          return scope.call(this, args, body, 0)
        }
      } else if (typeof args === 'number') {
        if (args > 0) {
          return batch.call(this, reserve(args | 0), args | 0)
        }
      } else if (Array.isArray(args)) {
        if (args.length) {
          return batch.call(this, args, args.length)
        }
      } else {
        return draw.call(this, args)
      }
    }

    return extend(REGLCommand, {
      stats: stats
    })
  }

  function clear (options) {
    

    var clearFlags = 0
    core.procs.poll()

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

    
    gl.clear(clearFlags)
  }

  function frame (cb) {
    
    rafCallbacks.push(cb)

    function cancel () {
      // FIXME:  should we check something other than equals cb here?
      // what if a user calls frame twice with the same callback...
      //
      var i = find(rafCallbacks, cb)
      
      function pendingCancel () {
        var index = find(rafCallbacks, pendingCancel)
        rafCallbacks[index] = rafCallbacks[rafCallbacks.length - 1]
        rafCallbacks.length -= 1
        if (rafCallbacks.length <= 0) {
          stopRAF()
        }
      }
      rafCallbacks[i] = pendingCancel
    }

    startRAF()

    return {
      cancel: cancel
    }
  }

  // poll viewport
  function pollViewport () {
    var viewport = nextState.viewport
    var scissorBox = nextState.scissor_box
    viewport[0] = viewport[1] = scissorBox[0] = scissorBox[1] = 0
    contextState.viewportWidth =
      contextState.framebufferWidth =
      contextState.drawingBufferWidth =
      viewport[2] =
      scissorBox[2] = gl.drawingBufferWidth
    contextState.viewportHeight =
      contextState.framebufferHeight =
      contextState.drawingBufferHeight =
      viewport[3] =
      scissorBox[3] = gl.drawingBufferHeight
  }

  function poll () {
    contextState.tick += 1
    contextState.time = now()
    pollViewport()
    core.procs.poll()
  }

  function refresh () {
    pollViewport()
    core.procs.refresh()
    if (timer) {
      timer.update()
    }
  }

  function now () {
    return (clock() - START_TIME) / 1000.0
  }

  refresh()

  function addListener (event, callback) {
    

    var callbacks
    switch (event) {
      case 'frame':
        return frame(callback)
      case 'lost':
        callbacks = lossCallbacks
        break
      case 'restore':
        callbacks = restoreCallbacks
        break
      case 'destroy':
        callbacks = destroyCallbacks
        break
      default:
        
    }

    callbacks.push(callback)
    return {
      cancel: function () {
        for (var i = 0; i < callbacks.length; ++i) {
          if (callbacks[i] === callback) {
            callbacks[i] = callbacks[callbacks.length - 1]
            callbacks.pop()
            return
          }
        }
      }
    }
  }

  var regl = extend(compileProcedure, {
    // Clear current FBO
    clear: clear,

    // Short cuts for dynamic variables
    prop: dynamic.define.bind(null, DYN_PROP),
    context: dynamic.define.bind(null, DYN_CONTEXT),
    this: dynamic.define.bind(null, DYN_STATE),

    // executes an empty draw command
    draw: compileProcedure({}),

    // Resources
    buffer: function (options) {
      return bufferState.create(options, GL_ARRAY_BUFFER, false, false)
    },
    elements: function (options) {
      return elementState.create(options, false)
    },
    texture: textureState.create2D,
    cube: textureState.createCube,
    renderbuffer: renderbufferState.create,
    framebuffer: framebufferState.create,
    framebufferCube: framebufferState.createCube,

    // Expose context attributes
    attributes: glAttributes,

    // Frame rendering
    frame: frame,
    on: addListener,

    // System limits
    limits: limits,
    hasExtension: function (name) {
      return limits.extensions.indexOf(name.toLowerCase()) >= 0
    },

    // Read pixels
    read: readPixels,

    // Destroy regl and all associated resources
    destroy: destroy,

    // Direct GL state manipulation
    _gl: gl,
    _refresh: refresh,

    poll: function () {
      poll()
      if (timer) {
        timer.update()
      }
    },

    // Current time
    now: now,

    // regl Statistics Information
    stats: stats
  })

  config.onDone(null, regl)

  return regl
}

},{"./lib/attribute":2,"./lib/buffer":3,"./lib/core":8,"./lib/dynamic":9,"./lib/elements":10,"./lib/extension":11,"./lib/framebuffer":12,"./lib/limits":13,"./lib/read":14,"./lib/renderbuffer":15,"./lib/shader":16,"./lib/stats":17,"./lib/strings":18,"./lib/texture":19,"./lib/timer":20,"./lib/util/clock":21,"./lib/util/extend":23,"./lib/util/raf":29,"./lib/webgl":32}]},{},[1])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJleGFtcGxlL2ZlZWRiYWNrLmpzIiwibGliL2F0dHJpYnV0ZS5qcyIsImxpYi9idWZmZXIuanMiLCJsaWIvY29uc3RhbnRzL2FycmF5dHlwZXMuanNvbiIsImxpYi9jb25zdGFudHMvZHR5cGVzLmpzb24iLCJsaWIvY29uc3RhbnRzL3ByaW1pdGl2ZXMuanNvbiIsImxpYi9jb25zdGFudHMvdXNhZ2UuanNvbiIsImxpYi9jb3JlLmpzIiwibGliL2R5bmFtaWMuanMiLCJsaWIvZWxlbWVudHMuanMiLCJsaWIvZXh0ZW5zaW9uLmpzIiwibGliL2ZyYW1lYnVmZmVyLmpzIiwibGliL2xpbWl0cy5qcyIsImxpYi9yZWFkLmpzIiwibGliL3JlbmRlcmJ1ZmZlci5qcyIsImxpYi9zaGFkZXIuanMiLCJsaWIvc3RhdHMuanMiLCJsaWIvc3RyaW5ncy5qcyIsImxpYi90ZXh0dXJlLmpzIiwibGliL3RpbWVyLmpzIiwibGliL3V0aWwvY2xvY2suanMiLCJsaWIvdXRpbC9jb2RlZ2VuLmpzIiwibGliL3V0aWwvZXh0ZW5kLmpzIiwibGliL3V0aWwvaXMtYXJyYXktbGlrZS5qcyIsImxpYi91dGlsL2lzLW5kYXJyYXkuanMiLCJsaWIvdXRpbC9pcy10eXBlZC1hcnJheS5qcyIsImxpYi91dGlsL2xvb3AuanMiLCJsaWIvdXRpbC9wb29sLmpzIiwibGliL3V0aWwvcmFmLmpzIiwibGliL3V0aWwvdG8taGFsZi1mbG9hdC5qcyIsImxpYi91dGlsL3ZhbHVlcy5qcyIsImxpYi93ZWJnbC5qcyIsIm5vZGVfbW9kdWxlcy9tb3VzZS1jaGFuZ2UvbW91c2UtbGlzdGVuLmpzIiwibm9kZV9tb2R1bGVzL21vdXNlLWV2ZW50L21vdXNlLmpzIiwicmVnbC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL1lBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5NkZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hRQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzF6QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0TkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsakRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8qXG4gIHRhZ3M6IGJhc2ljXG5cbiA8cD4gVGhpcyBleGFtcGxlIHNob3dzIGhvdyB0byB1c2UgY29weVRleEltYWdlMkQgdG8gaW1wbGVtZW50IGZlZWRiYWNrIGVmZmVjdHMgPC9wPlxuICovXG5cbmNvbnN0IHJlZ2wgPSByZXF1aXJlKCcuLi9yZWdsJykoKVxuY29uc3QgbW91c2UgPSByZXF1aXJlKCdtb3VzZS1jaGFuZ2UnKSgpXG5cbmNvbnN0IHBpeGVscyA9IHJlZ2wudGV4dHVyZSgpXG5cbmNvbnN0IGRyYXdGZWVkYmFjayA9IHJlZ2woe1xuICBmcmFnOiBgXG4gIHByZWNpc2lvbiBtZWRpdW1wIGZsb2F0O1xuICB1bmlmb3JtIHNhbXBsZXIyRCB0ZXh0dXJlO1xuICB1bmlmb3JtIHZlYzIgbW91c2U7XG4gIHVuaWZvcm0gZmxvYXQgdDtcbiAgdmFyeWluZyB2ZWMyIHV2O1xuICB2b2lkIG1haW4gKCkge1xuICAgIGZsb2F0IGRpc3QgPSBsZW5ndGgoZ2xfRnJhZ0Nvb3JkLnh5IC0gbW91c2UpO1xuICAgIGdsX0ZyYWdDb2xvciA9IHZlYzQoMC45OCAqIHRleHR1cmUyRCh0ZXh0dXJlLFxuICAgICAgdXYgKyBjb3ModCkgKiB2ZWMyKDAuNSAtIHV2LnksIHV2LnggLSAwLjUpIC0gc2luKDIuMCAqIHQpICogKHV2IC0gMC41KSkucmdiLCAxKSArXG4gICAgICBleHAoLTAuMDEgKiBkaXN0KSAqIHZlYzQoXG4gICAgICAgIDEuMCArIGNvcygyLjAgKiB0KSxcbiAgICAgICAgMS4wICsgY29zKDIuMCAqIHQgKyAxLjUpLFxuICAgICAgICAxLjAgKyBjb3MoMi4wICogdCArIDMuMCksXG4gICAgICAgIDAuMCk7XG4gIH1gLFxuXG4gIHZlcnQ6IGBcbiAgcHJlY2lzaW9uIG1lZGl1bXAgZmxvYXQ7XG4gIGF0dHJpYnV0ZSB2ZWMyIHBvc2l0aW9uO1xuICB2YXJ5aW5nIHZlYzIgdXY7XG4gIHZvaWQgbWFpbiAoKSB7XG4gICAgdXYgPSBwb3NpdGlvbjtcbiAgICBnbF9Qb3NpdGlvbiA9IHZlYzQoMi4wICogcG9zaXRpb24gLSAxLjAsIDAsIDEpO1xuICB9YCxcblxuICBhdHRyaWJ1dGVzOiB7XG4gICAgcG9zaXRpb246IFtcbiAgICAgIC0yLCAwLFxuICAgICAgMCwgLTIsXG4gICAgICAyLCAyXVxuICB9LFxuXG4gIHVuaWZvcm1zOiB7XG4gICAgdGV4dHVyZTogcGl4ZWxzLFxuICAgIG1vdXNlOiAoe3BpeGVsUmF0aW8sIHZpZXdwb3J0SGVpZ2h0fSkgPT4gW1xuICAgICAgbW91c2UueCAqIHBpeGVsUmF0aW8sXG4gICAgICB2aWV3cG9ydEhlaWdodCAtIG1vdXNlLnkgKiBwaXhlbFJhdGlvXG4gICAgXSxcbiAgICB0OiAoe3RpY2t9KSA9PiAwLjAxICogdGlja1xuICB9LFxuXG4gIGNvdW50OiAzXG59KVxuXG5yZWdsLmZyYW1lKGZ1bmN0aW9uICgpIHtcbiAgcmVnbC5jbGVhcih7XG4gICAgY29sb3I6IFswLCAwLCAwLCAxXVxuICB9KVxuXG4gIGRyYXdGZWVkYmFjaygpXG5cbiAgcGl4ZWxzKHtcbiAgICBjb3B5OiB0cnVlXG4gIH0pXG59KVxuIiwidmFyIEdMX0ZMT0FUID0gNTEyNlxuXG5mdW5jdGlvbiBBdHRyaWJ1dGVSZWNvcmQgKCkge1xuICB0aGlzLnN0YXRlID0gMFxuXG4gIHRoaXMueCA9IDAuMFxuICB0aGlzLnkgPSAwLjBcbiAgdGhpcy56ID0gMC4wXG4gIHRoaXMudyA9IDAuMFxuXG4gIHRoaXMuYnVmZmVyID0gbnVsbFxuICB0aGlzLnNpemUgPSAwXG4gIHRoaXMubm9ybWFsaXplZCA9IGZhbHNlXG4gIHRoaXMudHlwZSA9IEdMX0ZMT0FUXG4gIHRoaXMub2Zmc2V0ID0gMFxuICB0aGlzLnN0cmlkZSA9IDBcbiAgdGhpcy5kaXZpc29yID0gMFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBBdHRyaWJ1dGVTdGF0ZSAoXG4gIGdsLFxuICBleHRlbnNpb25zLFxuICBsaW1pdHMsXG4gIGJ1ZmZlclN0YXRlLFxuICBzdHJpbmdTdG9yZSkge1xuICB2YXIgTlVNX0FUVFJJQlVURVMgPSBsaW1pdHMubWF4QXR0cmlidXRlc1xuICB2YXIgYXR0cmlidXRlQmluZGluZ3MgPSBuZXcgQXJyYXkoTlVNX0FUVFJJQlVURVMpXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgTlVNX0FUVFJJQlVURVM7ICsraSkge1xuICAgIGF0dHJpYnV0ZUJpbmRpbmdzW2ldID0gbmV3IEF0dHJpYnV0ZVJlY29yZCgpXG4gIH1cblxuICByZXR1cm4ge1xuICAgIFJlY29yZDogQXR0cmlidXRlUmVjb3JkLFxuICAgIHNjb3BlOiB7fSxcbiAgICBzdGF0ZTogYXR0cmlidXRlQmluZGluZ3NcbiAgfVxufVxuIiwiXG52YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi91dGlsL2lzLXR5cGVkLWFycmF5JylcbnZhciBpc05EQXJyYXlMaWtlID0gcmVxdWlyZSgnLi91dGlsL2lzLW5kYXJyYXknKVxudmFyIHZhbHVlcyA9IHJlcXVpcmUoJy4vdXRpbC92YWx1ZXMnKVxudmFyIHBvb2wgPSByZXF1aXJlKCcuL3V0aWwvcG9vbCcpXG5cbnZhciBhcnJheVR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvYXJyYXl0eXBlcy5qc29uJylcbnZhciBidWZmZXJUeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL2R0eXBlcy5qc29uJylcbnZhciB1c2FnZVR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvdXNhZ2UuanNvbicpXG5cbnZhciBHTF9TVEFUSUNfRFJBVyA9IDB4ODhFNFxudmFyIEdMX1NUUkVBTV9EUkFXID0gMHg4OEUwXG5cbnZhciBHTF9VTlNJR05FRF9CWVRFID0gNTEyMVxudmFyIEdMX0ZMT0FUID0gNTEyNlxuXG52YXIgRFRZUEVTX1NJWkVTID0gW11cbkRUWVBFU19TSVpFU1s1MTIwXSA9IDEgLy8gaW50OFxuRFRZUEVTX1NJWkVTWzUxMjJdID0gMiAvLyBpbnQxNlxuRFRZUEVTX1NJWkVTWzUxMjRdID0gNCAvLyBpbnQzMlxuRFRZUEVTX1NJWkVTWzUxMjFdID0gMSAvLyB1aW50OFxuRFRZUEVTX1NJWkVTWzUxMjNdID0gMiAvLyB1aW50MTZcbkRUWVBFU19TSVpFU1s1MTI1XSA9IDQgLy8gdWludDMyXG5EVFlQRVNfU0laRVNbNTEyNl0gPSA0IC8vIGZsb2F0MzJcblxuZnVuY3Rpb24gdHlwZWRBcnJheUNvZGUgKGRhdGEpIHtcbiAgcmV0dXJuIGFycmF5VHlwZXNbT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGRhdGEpXSB8IDBcbn1cblxuZnVuY3Rpb24gY29weUFycmF5IChvdXQsIGlucCkge1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGlucC5sZW5ndGg7ICsraSkge1xuICAgIG91dFtpXSA9IGlucFtpXVxuICB9XG59XG5cbmZ1bmN0aW9uIHRyYW5zcG9zZSAoXG4gIHJlc3VsdCwgZGF0YSwgc2hhcGVYLCBzaGFwZVksIHN0cmlkZVgsIHN0cmlkZVksIG9mZnNldCkge1xuICB2YXIgcHRyID0gMFxuICBmb3IgKHZhciBpID0gMDsgaSA8IHNoYXBlWDsgKytpKSB7XG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBzaGFwZVk7ICsraikge1xuICAgICAgcmVzdWx0W3B0cisrXSA9IGRhdGFbc3RyaWRlWCAqIGkgKyBzdHJpZGVZICogaiArIG9mZnNldF1cbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gZmxhdHRlbiAocmVzdWx0LCBkYXRhLCBkaW1lbnNpb24pIHtcbiAgdmFyIHB0ciA9IDBcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBkYXRhLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIHYgPSBkYXRhW2ldXG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBkaW1lbnNpb247ICsraikge1xuICAgICAgcmVzdWx0W3B0cisrXSA9IHZbal1cbiAgICB9XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwQnVmZmVyU3RhdGUgKGdsLCBzdGF0cywgY29uZmlnKSB7XG4gIHZhciBidWZmZXJDb3VudCA9IDBcbiAgdmFyIGJ1ZmZlclNldCA9IHt9XG5cbiAgZnVuY3Rpb24gUkVHTEJ1ZmZlciAodHlwZSkge1xuICAgIHRoaXMuaWQgPSBidWZmZXJDb3VudCsrXG4gICAgdGhpcy5idWZmZXIgPSBnbC5jcmVhdGVCdWZmZXIoKVxuICAgIHRoaXMudHlwZSA9IHR5cGVcbiAgICB0aGlzLnVzYWdlID0gR0xfU1RBVElDX0RSQVdcbiAgICB0aGlzLmJ5dGVMZW5ndGggPSAwXG4gICAgdGhpcy5kaW1lbnNpb24gPSAxXG4gICAgdGhpcy5kdHlwZSA9IEdMX1VOU0lHTkVEX0JZVEVcblxuICAgIHRoaXMucGVyc2lzdGVudERhdGEgPSBudWxsXG5cbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgIHRoaXMuc3RhdHMgPSB7c2l6ZTogMH1cbiAgICB9XG4gIH1cblxuICBSRUdMQnVmZmVyLnByb3RvdHlwZS5iaW5kID0gZnVuY3Rpb24gKCkge1xuICAgIGdsLmJpbmRCdWZmZXIodGhpcy50eXBlLCB0aGlzLmJ1ZmZlcilcbiAgfVxuXG4gIFJFR0xCdWZmZXIucHJvdG90eXBlLmRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7XG4gICAgZGVzdHJveSh0aGlzKVxuICB9XG5cbiAgdmFyIHN0cmVhbVBvb2wgPSBbXVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZVN0cmVhbSAodHlwZSwgZGF0YSkge1xuICAgIHZhciBidWZmZXIgPSBzdHJlYW1Qb29sLnBvcCgpXG4gICAgaWYgKCFidWZmZXIpIHtcbiAgICAgIGJ1ZmZlciA9IG5ldyBSRUdMQnVmZmVyKHR5cGUpXG4gICAgfVxuICAgIGJ1ZmZlci5iaW5kKClcbiAgICBpbml0QnVmZmVyRnJvbURhdGEoYnVmZmVyLCBkYXRhLCBHTF9TVFJFQU1fRFJBVywgMCwgMSwgZmFsc2UpXG4gICAgcmV0dXJuIGJ1ZmZlclxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveVN0cmVhbSAoc3RyZWFtKSB7XG4gICAgc3RyZWFtUG9vbC5wdXNoKHN0cmVhbSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGluaXRCdWZmZXJGcm9tVHlwZWRBcnJheSAoYnVmZmVyLCBkYXRhLCB1c2FnZSkge1xuICAgIGJ1ZmZlci5ieXRlTGVuZ3RoID0gZGF0YS5ieXRlTGVuZ3RoXG4gICAgZ2wuYnVmZmVyRGF0YShidWZmZXIudHlwZSwgZGF0YSwgdXNhZ2UpXG4gIH1cblxuICBmdW5jdGlvbiBpbml0QnVmZmVyRnJvbURhdGEgKGJ1ZmZlciwgZGF0YSwgdXNhZ2UsIGR0eXBlLCBkaW1lbnNpb24sIHBlcnNpc3QpIHtcbiAgICBidWZmZXIudXNhZ2UgPSB1c2FnZVxuICAgIGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XG4gICAgICBidWZmZXIuZHR5cGUgPSBkdHlwZSB8fCBHTF9GTE9BVFxuICAgICAgaWYgKGRhdGEubGVuZ3RoID4gMCkge1xuICAgICAgICB2YXIgZmxhdERhdGFcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YVswXSkpIHtcbiAgICAgICAgICBidWZmZXIuZGltZW5zaW9uID0gZGF0YVswXS5sZW5ndGhcbiAgICAgICAgICBmbGF0RGF0YSA9IHBvb2wuYWxsb2NUeXBlKFxuICAgICAgICAgICAgYnVmZmVyLmR0eXBlLFxuICAgICAgICAgICAgZGF0YS5sZW5ndGggKiBidWZmZXIuZGltZW5zaW9uKVxuICAgICAgICAgIGZsYXR0ZW4oZmxhdERhdGEsIGRhdGEsIGJ1ZmZlci5kaW1lbnNpb24pXG4gICAgICAgICAgaW5pdEJ1ZmZlckZyb21UeXBlZEFycmF5KGJ1ZmZlciwgZmxhdERhdGEsIHVzYWdlKVxuICAgICAgICAgIGlmIChwZXJzaXN0KSB7XG4gICAgICAgICAgICBidWZmZXIucGVyc2lzdGVudERhdGEgPSBmbGF0RGF0YVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwb29sLmZyZWVUeXBlKGZsYXREYXRhKVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZGF0YVswXSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICBidWZmZXIuZGltZW5zaW9uID0gZGltZW5zaW9uXG4gICAgICAgICAgdmFyIHR5cGVkRGF0YSA9IHBvb2wuYWxsb2NUeXBlKGJ1ZmZlci5kdHlwZSwgZGF0YS5sZW5ndGgpXG4gICAgICAgICAgY29weUFycmF5KHR5cGVkRGF0YSwgZGF0YSlcbiAgICAgICAgICBpbml0QnVmZmVyRnJvbVR5cGVkQXJyYXkoYnVmZmVyLCB0eXBlZERhdGEsIHVzYWdlKVxuICAgICAgICAgIGlmIChwZXJzaXN0KSB7XG4gICAgICAgICAgICBidWZmZXIucGVyc2lzdGVudERhdGEgPSB0eXBlZERhdGFcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcG9vbC5mcmVlVHlwZSh0eXBlZERhdGEpXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKGlzVHlwZWRBcnJheShkYXRhWzBdKSkge1xuICAgICAgICAgIGJ1ZmZlci5kaW1lbnNpb24gPSBkYXRhWzBdLmxlbmd0aFxuICAgICAgICAgIGJ1ZmZlci5kdHlwZSA9IGR0eXBlIHx8IHR5cGVkQXJyYXlDb2RlKGRhdGFbMF0pIHx8IEdMX0ZMT0FUXG4gICAgICAgICAgZmxhdERhdGEgPSBwb29sLmFsbG9jVHlwZShcbiAgICAgICAgICAgIGJ1ZmZlci5kdHlwZSxcbiAgICAgICAgICAgIGRhdGEubGVuZ3RoICogYnVmZmVyLmRpbWVuc2lvbilcbiAgICAgICAgICBmbGF0dGVuKGZsYXREYXRhLCBkYXRhLCBidWZmZXIuZGltZW5zaW9uKVxuICAgICAgICAgIGluaXRCdWZmZXJGcm9tVHlwZWRBcnJheShidWZmZXIsIGZsYXREYXRhLCB1c2FnZSlcbiAgICAgICAgICBpZiAocGVyc2lzdCkge1xuICAgICAgICAgICAgYnVmZmVyLnBlcnNpc3RlbnREYXRhID0gZmxhdERhdGFcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcG9vbC5mcmVlVHlwZShmbGF0RGF0YSlcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGlzVHlwZWRBcnJheShkYXRhKSkge1xuICAgICAgYnVmZmVyLmR0eXBlID0gZHR5cGUgfHwgdHlwZWRBcnJheUNvZGUoZGF0YSlcbiAgICAgIGJ1ZmZlci5kaW1lbnNpb24gPSBkaW1lbnNpb25cbiAgICAgIGluaXRCdWZmZXJGcm9tVHlwZWRBcnJheShidWZmZXIsIGRhdGEsIHVzYWdlKVxuICAgICAgaWYgKHBlcnNpc3QpIHtcbiAgICAgICAgYnVmZmVyLnBlcnNpc3RlbnREYXRhID0gbmV3IFVpbnQ4QXJyYXkobmV3IFVpbnQ4QXJyYXkoZGF0YS5idWZmZXIpKVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoaXNOREFycmF5TGlrZShkYXRhKSkge1xuICAgICAgdmFyIHNoYXBlID0gZGF0YS5zaGFwZVxuICAgICAgdmFyIHN0cmlkZSA9IGRhdGEuc3RyaWRlXG4gICAgICB2YXIgb2Zmc2V0ID0gZGF0YS5vZmZzZXRcblxuICAgICAgdmFyIHNoYXBlWCA9IDBcbiAgICAgIHZhciBzaGFwZVkgPSAwXG4gICAgICB2YXIgc3RyaWRlWCA9IDBcbiAgICAgIHZhciBzdHJpZGVZID0gMFxuICAgICAgaWYgKHNoYXBlLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICBzaGFwZVggPSBzaGFwZVswXVxuICAgICAgICBzaGFwZVkgPSAxXG4gICAgICAgIHN0cmlkZVggPSBzdHJpZGVbMF1cbiAgICAgICAgc3RyaWRlWSA9IDBcbiAgICAgIH0gZWxzZSBpZiAoc2hhcGUubGVuZ3RoID09PSAyKSB7XG4gICAgICAgIHNoYXBlWCA9IHNoYXBlWzBdXG4gICAgICAgIHNoYXBlWSA9IHNoYXBlWzFdXG4gICAgICAgIHN0cmlkZVggPSBzdHJpZGVbMF1cbiAgICAgICAgc3RyaWRlWSA9IHN0cmlkZVsxXVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgXG4gICAgICB9XG5cbiAgICAgIGJ1ZmZlci5kdHlwZSA9IGR0eXBlIHx8IHR5cGVkQXJyYXlDb2RlKGRhdGEuZGF0YSkgfHwgR0xfRkxPQVRcbiAgICAgIGJ1ZmZlci5kaW1lbnNpb24gPSBzaGFwZVlcblxuICAgICAgdmFyIHRyYW5zcG9zZURhdGEgPSBwb29sLmFsbG9jVHlwZShidWZmZXIuZHR5cGUsIHNoYXBlWCAqIHNoYXBlWSlcbiAgICAgIHRyYW5zcG9zZSh0cmFuc3Bvc2VEYXRhLFxuICAgICAgICBkYXRhLmRhdGEsXG4gICAgICAgIHNoYXBlWCwgc2hhcGVZLFxuICAgICAgICBzdHJpZGVYLCBzdHJpZGVZLFxuICAgICAgICBvZmZzZXQpXG4gICAgICBpbml0QnVmZmVyRnJvbVR5cGVkQXJyYXkoYnVmZmVyLCB0cmFuc3Bvc2VEYXRhLCB1c2FnZSlcbiAgICAgIGlmIChwZXJzaXN0KSB7XG4gICAgICAgIGJ1ZmZlci5wZXJzaXN0ZW50RGF0YSA9IHRyYW5zcG9zZURhdGFcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBvb2wuZnJlZVR5cGUodHJhbnNwb3NlRGF0YSlcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSAoYnVmZmVyKSB7XG4gICAgc3RhdHMuYnVmZmVyQ291bnQtLVxuXG4gICAgdmFyIGhhbmRsZSA9IGJ1ZmZlci5idWZmZXJcbiAgICBcbiAgICBnbC5kZWxldGVCdWZmZXIoaGFuZGxlKVxuICAgIGJ1ZmZlci5idWZmZXIgPSBudWxsXG4gICAgZGVsZXRlIGJ1ZmZlclNldFtidWZmZXIuaWRdXG4gIH1cblxuICBmdW5jdGlvbiBjcmVhdGVCdWZmZXIgKG9wdGlvbnMsIHR5cGUsIGRlZmVySW5pdCwgcGVyc2lzdGVudCkge1xuICAgIHN0YXRzLmJ1ZmZlckNvdW50KytcblxuICAgIHZhciBidWZmZXIgPSBuZXcgUkVHTEJ1ZmZlcih0eXBlKVxuICAgIGJ1ZmZlclNldFtidWZmZXIuaWRdID0gYnVmZmVyXG5cbiAgICBmdW5jdGlvbiByZWdsQnVmZmVyIChvcHRpb25zKSB7XG4gICAgICB2YXIgdXNhZ2UgPSBHTF9TVEFUSUNfRFJBV1xuICAgICAgdmFyIGRhdGEgPSBudWxsXG4gICAgICB2YXIgYnl0ZUxlbmd0aCA9IDBcbiAgICAgIHZhciBkdHlwZSA9IDBcbiAgICAgIHZhciBkaW1lbnNpb24gPSAxXG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShvcHRpb25zKSB8fFxuICAgICAgICAgIGlzVHlwZWRBcnJheShvcHRpb25zKSB8fFxuICAgICAgICAgIGlzTkRBcnJheUxpa2Uob3B0aW9ucykpIHtcbiAgICAgICAgZGF0YSA9IG9wdGlvbnNcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIG9wdGlvbnMgPT09ICdudW1iZXInKSB7XG4gICAgICAgIGJ5dGVMZW5ndGggPSBvcHRpb25zIHwgMFxuICAgICAgfSBlbHNlIGlmIChvcHRpb25zKSB7XG4gICAgICAgIFxuXG4gICAgICAgIGlmICgnZGF0YScgaW4gb3B0aW9ucykge1xuICAgICAgICAgIFxuICAgICAgICAgIGRhdGEgPSBvcHRpb25zLmRhdGFcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgndXNhZ2UnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBcbiAgICAgICAgICB1c2FnZSA9IHVzYWdlVHlwZXNbb3B0aW9ucy51c2FnZV1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgndHlwZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgIFxuICAgICAgICAgIGR0eXBlID0gYnVmZmVyVHlwZXNbb3B0aW9ucy50eXBlXVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdkaW1lbnNpb24nIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBcbiAgICAgICAgICBkaW1lbnNpb24gPSBvcHRpb25zLmRpbWVuc2lvbiB8IDBcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnbGVuZ3RoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgXG4gICAgICAgICAgYnl0ZUxlbmd0aCA9IG9wdGlvbnMubGVuZ3RoIHwgMFxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGJ1ZmZlci5iaW5kKClcbiAgICAgIGlmICghZGF0YSkge1xuICAgICAgICBnbC5idWZmZXJEYXRhKGJ1ZmZlci50eXBlLCBieXRlTGVuZ3RoLCB1c2FnZSlcbiAgICAgICAgYnVmZmVyLmR0eXBlID0gZHR5cGUgfHwgR0xfVU5TSUdORURfQllURVxuICAgICAgICBidWZmZXIudXNhZ2UgPSB1c2FnZVxuICAgICAgICBidWZmZXIuZGltZW5zaW9uID0gZGltZW5zaW9uXG4gICAgICAgIGJ1ZmZlci5ieXRlTGVuZ3RoID0gYnl0ZUxlbmd0aFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaW5pdEJ1ZmZlckZyb21EYXRhKGJ1ZmZlciwgZGF0YSwgdXNhZ2UsIGR0eXBlLCBkaW1lbnNpb24sIHBlcnNpc3RlbnQpXG4gICAgICB9XG5cbiAgICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgICBidWZmZXIuc3RhdHMuc2l6ZSA9IGJ1ZmZlci5ieXRlTGVuZ3RoICogRFRZUEVTX1NJWkVTW2J1ZmZlci5kdHlwZV1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJlZ2xCdWZmZXJcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzZXRTdWJEYXRhIChkYXRhLCBvZmZzZXQpIHtcbiAgICAgIFxuXG4gICAgICBnbC5idWZmZXJTdWJEYXRhKGJ1ZmZlci50eXBlLCBvZmZzZXQsIGRhdGEpXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc3ViZGF0YSAoZGF0YSwgb2Zmc2V0Xykge1xuICAgICAgdmFyIG9mZnNldCA9IChvZmZzZXRfIHx8IDApIHwgMFxuICAgICAgYnVmZmVyLmJpbmQoKVxuICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YSkpIHtcbiAgICAgICAgaWYgKGRhdGEubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGlmICh0eXBlb2YgZGF0YVswXSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgIHZhciBjb252ZXJ0ZWQgPSBwb29sLmFsbG9jVHlwZShidWZmZXIuZHR5cGUsIGRhdGEubGVuZ3RoKVxuICAgICAgICAgICAgY29weUFycmF5KGNvbnZlcnRlZCwgZGF0YSlcbiAgICAgICAgICAgIHNldFN1YkRhdGEoY29udmVydGVkLCBvZmZzZXQpXG4gICAgICAgICAgICBwb29sLmZyZWVUeXBlKGNvbnZlcnRlZClcbiAgICAgICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoZGF0YVswXSkgfHwgaXNUeXBlZEFycmF5KGRhdGFbMF0pKSB7XG4gICAgICAgICAgICB2YXIgZGltZW5zaW9uID0gZGF0YVswXS5sZW5ndGhcbiAgICAgICAgICAgIHZhciBmbGF0RGF0YSA9IHBvb2wuYWxsb2NUeXBlKGJ1ZmZlci5kdHlwZSwgZGF0YS5sZW5ndGggKiBkaW1lbnNpb24pXG4gICAgICAgICAgICBmbGF0dGVuKGZsYXREYXRhLCBkYXRhLCBkaW1lbnNpb24pXG4gICAgICAgICAgICBzZXRTdWJEYXRhKGZsYXREYXRhLCBvZmZzZXQpXG4gICAgICAgICAgICBwb29sLmZyZWVUeXBlKGZsYXREYXRhKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoaXNUeXBlZEFycmF5KGRhdGEpKSB7XG4gICAgICAgIHNldFN1YkRhdGEoZGF0YSwgb2Zmc2V0KVxuICAgICAgfSBlbHNlIGlmIChpc05EQXJyYXlMaWtlKGRhdGEpKSB7XG4gICAgICAgIHZhciBzaGFwZSA9IGRhdGEuc2hhcGVcbiAgICAgICAgdmFyIHN0cmlkZSA9IGRhdGEuc3RyaWRlXG5cbiAgICAgICAgdmFyIHNoYXBlWCA9IDBcbiAgICAgICAgdmFyIHNoYXBlWSA9IDBcbiAgICAgICAgdmFyIHN0cmlkZVggPSAwXG4gICAgICAgIHZhciBzdHJpZGVZID0gMFxuICAgICAgICBpZiAoc2hhcGUubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgc2hhcGVYID0gc2hhcGVbMF1cbiAgICAgICAgICBzaGFwZVkgPSAxXG4gICAgICAgICAgc3RyaWRlWCA9IHN0cmlkZVswXVxuICAgICAgICAgIHN0cmlkZVkgPSAwXG4gICAgICAgIH0gZWxzZSBpZiAoc2hhcGUubGVuZ3RoID09PSAyKSB7XG4gICAgICAgICAgc2hhcGVYID0gc2hhcGVbMF1cbiAgICAgICAgICBzaGFwZVkgPSBzaGFwZVsxXVxuICAgICAgICAgIHN0cmlkZVggPSBzdHJpZGVbMF1cbiAgICAgICAgICBzdHJpZGVZID0gc3RyaWRlWzFdXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgXG4gICAgICAgIH1cbiAgICAgICAgdmFyIGR0eXBlID0gQXJyYXkuaXNBcnJheShkYXRhLmRhdGEpXG4gICAgICAgICAgPyBidWZmZXIuZHR5cGVcbiAgICAgICAgICA6IHR5cGVkQXJyYXlDb2RlKGRhdGEuZGF0YSlcblxuICAgICAgICB2YXIgdHJhbnNwb3NlRGF0YSA9IHBvb2wuYWxsb2NUeXBlKGR0eXBlLCBzaGFwZVggKiBzaGFwZVkpXG4gICAgICAgIHRyYW5zcG9zZSh0cmFuc3Bvc2VEYXRhLFxuICAgICAgICAgIGRhdGEuZGF0YSxcbiAgICAgICAgICBzaGFwZVgsIHNoYXBlWSxcbiAgICAgICAgICBzdHJpZGVYLCBzdHJpZGVZLFxuICAgICAgICAgIGRhdGEub2Zmc2V0KVxuICAgICAgICBzZXRTdWJEYXRhKHRyYW5zcG9zZURhdGEsIG9mZnNldClcbiAgICAgICAgcG9vbC5mcmVlVHlwZSh0cmFuc3Bvc2VEYXRhKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgXG4gICAgICB9XG4gICAgICByZXR1cm4gcmVnbEJ1ZmZlclxuICAgIH1cblxuICAgIGlmICghZGVmZXJJbml0KSB7XG4gICAgICByZWdsQnVmZmVyKG9wdGlvbnMpXG4gICAgfVxuXG4gICAgcmVnbEJ1ZmZlci5fcmVnbFR5cGUgPSAnYnVmZmVyJ1xuICAgIHJlZ2xCdWZmZXIuX2J1ZmZlciA9IGJ1ZmZlclxuICAgIHJlZ2xCdWZmZXIuc3ViZGF0YSA9IHN1YmRhdGFcbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgIHJlZ2xCdWZmZXIuc3RhdHMgPSBidWZmZXIuc3RhdHNcbiAgICB9XG4gICAgcmVnbEJ1ZmZlci5kZXN0cm95ID0gZnVuY3Rpb24gKCkgeyBkZXN0cm95KGJ1ZmZlcikgfVxuXG4gICAgcmV0dXJuIHJlZ2xCdWZmZXJcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlc3RvcmVCdWZmZXJzICgpIHtcbiAgICB2YWx1ZXMoYnVmZmVyU2V0KS5mb3JFYWNoKGZ1bmN0aW9uIChidWZmZXIpIHtcbiAgICAgIGJ1ZmZlci5idWZmZXIgPSBnbC5jcmVhdGVCdWZmZXIoKVxuICAgICAgZ2wuYmluZEJ1ZmZlcihidWZmZXIudHlwZSwgYnVmZmVyLmJ1ZmZlcilcbiAgICAgIGdsLmJ1ZmZlckRhdGEoXG4gICAgICAgIGJ1ZmZlci50eXBlLCBidWZmZXIucGVyc2lzdGVudERhdGEgfHwgYnVmZmVyLmJ5dGVMZW5ndGgsIGJ1ZmZlci51c2FnZSlcbiAgICB9KVxuICB9XG5cbiAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgc3RhdHMuZ2V0VG90YWxCdWZmZXJTaXplID0gZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIHRvdGFsID0gMFxuICAgICAgLy8gVE9ETzogUmlnaHQgbm93LCB0aGUgc3RyZWFtcyBhcmUgbm90IHBhcnQgb2YgdGhlIHRvdGFsIGNvdW50LlxuICAgICAgT2JqZWN0LmtleXMoYnVmZmVyU2V0KS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgdG90YWwgKz0gYnVmZmVyU2V0W2tleV0uc3RhdHMuc2l6ZVxuICAgICAgfSlcbiAgICAgIHJldHVybiB0b3RhbFxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY3JlYXRlOiBjcmVhdGVCdWZmZXIsXG5cbiAgICBjcmVhdGVTdHJlYW06IGNyZWF0ZVN0cmVhbSxcbiAgICBkZXN0cm95U3RyZWFtOiBkZXN0cm95U3RyZWFtLFxuXG4gICAgY2xlYXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhbHVlcyhidWZmZXJTZXQpLmZvckVhY2goZGVzdHJveSlcbiAgICAgIHN0cmVhbVBvb2wuZm9yRWFjaChkZXN0cm95KVxuICAgIH0sXG5cbiAgICBnZXRCdWZmZXI6IGZ1bmN0aW9uICh3cmFwcGVyKSB7XG4gICAgICBpZiAod3JhcHBlciAmJiB3cmFwcGVyLl9idWZmZXIgaW5zdGFuY2VvZiBSRUdMQnVmZmVyKSB7XG4gICAgICAgIHJldHVybiB3cmFwcGVyLl9idWZmZXJcbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsXG4gICAgfSxcblxuICAgIHJlc3RvcmU6IHJlc3RvcmVCdWZmZXJzLFxuXG4gICAgX2luaXRCdWZmZXI6IGluaXRCdWZmZXJGcm9tRGF0YVxuICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gIFwiW29iamVjdCBJbnQ4QXJyYXldXCI6IDUxMjBcbiwgXCJbb2JqZWN0IEludDE2QXJyYXldXCI6IDUxMjJcbiwgXCJbb2JqZWN0IEludDMyQXJyYXldXCI6IDUxMjRcbiwgXCJbb2JqZWN0IFVpbnQ4QXJyYXldXCI6IDUxMjFcbiwgXCJbb2JqZWN0IFVpbnQ4Q2xhbXBlZEFycmF5XVwiOiA1MTIxXG4sIFwiW29iamVjdCBVaW50MTZBcnJheV1cIjogNTEyM1xuLCBcIltvYmplY3QgVWludDMyQXJyYXldXCI6IDUxMjVcbiwgXCJbb2JqZWN0IEZsb2F0MzJBcnJheV1cIjogNTEyNlxuLCBcIltvYmplY3QgRmxvYXQ2NEFycmF5XVwiOiA1MTIxXG4sIFwiW29iamVjdCBBcnJheUJ1ZmZlcl1cIjogNTEyMVxufVxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICBcImludDhcIjogNTEyMFxuLCBcImludDE2XCI6IDUxMjJcbiwgXCJpbnQzMlwiOiA1MTI0XG4sIFwidWludDhcIjogNTEyMVxuLCBcInVpbnQxNlwiOiA1MTIzXG4sIFwidWludDMyXCI6IDUxMjVcbiwgXCJmbG9hdFwiOiA1MTI2XG4sIFwiZmxvYXQzMlwiOiA1MTI2XG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gIFwicG9pbnRzXCI6IDAsXG4gIFwicG9pbnRcIjogMCxcbiAgXCJsaW5lc1wiOiAxLFxuICBcImxpbmVcIjogMSxcbiAgXCJsaW5lIGxvb3BcIjogMixcbiAgXCJsaW5lIHN0cmlwXCI6IDMsXG4gIFwidHJpYW5nbGVzXCI6IDQsXG4gIFwidHJpYW5nbGVcIjogNCxcbiAgXCJ0cmlhbmdsZSBzdHJpcFwiOiA1LFxuICBcInRyaWFuZ2xlIGZhblwiOiA2XG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gIFwic3RhdGljXCI6IDM1MDQ0LFxuICBcImR5bmFtaWNcIjogMzUwNDgsXG4gIFwic3RyZWFtXCI6IDM1MDQwXG59XG4iLCJcbnZhciBjcmVhdGVFbnZpcm9ubWVudCA9IHJlcXVpcmUoJy4vdXRpbC9jb2RlZ2VuJylcbnZhciBsb29wID0gcmVxdWlyZSgnLi91dGlsL2xvb3AnKVxudmFyIGlzVHlwZWRBcnJheSA9IHJlcXVpcmUoJy4vdXRpbC9pcy10eXBlZC1hcnJheScpXG52YXIgaXNOREFycmF5ID0gcmVxdWlyZSgnLi91dGlsL2lzLW5kYXJyYXknKVxudmFyIGlzQXJyYXlMaWtlID0gcmVxdWlyZSgnLi91dGlsL2lzLWFycmF5LWxpa2UnKVxudmFyIGR5bmFtaWMgPSByZXF1aXJlKCcuL2R5bmFtaWMnKVxuXG52YXIgcHJpbVR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvcHJpbWl0aXZlcy5qc29uJylcbnZhciBnbFR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvZHR5cGVzLmpzb24nKVxuXG4vLyBcImN1dGVcIiBuYW1lcyBmb3IgdmVjdG9yIGNvbXBvbmVudHNcbnZhciBDVVRFX0NPTVBPTkVOVFMgPSAneHl6dycuc3BsaXQoJycpXG5cbnZhciBHTF9VTlNJR05FRF9CWVRFID0gNTEyMVxuXG52YXIgQVRUUklCX1NUQVRFX1BPSU5URVIgPSAxXG52YXIgQVRUUklCX1NUQVRFX0NPTlNUQU5UID0gMlxuXG52YXIgRFlOX0ZVTkMgPSAwXG52YXIgRFlOX1BST1AgPSAxXG52YXIgRFlOX0NPTlRFWFQgPSAyXG52YXIgRFlOX1NUQVRFID0gM1xudmFyIERZTl9USFVOSyA9IDRcblxudmFyIFNfRElUSEVSID0gJ2RpdGhlcidcbnZhciBTX0JMRU5EX0VOQUJMRSA9ICdibGVuZC5lbmFibGUnXG52YXIgU19CTEVORF9DT0xPUiA9ICdibGVuZC5jb2xvcidcbnZhciBTX0JMRU5EX0VRVUFUSU9OID0gJ2JsZW5kLmVxdWF0aW9uJ1xudmFyIFNfQkxFTkRfRlVOQyA9ICdibGVuZC5mdW5jJ1xudmFyIFNfREVQVEhfRU5BQkxFID0gJ2RlcHRoLmVuYWJsZSdcbnZhciBTX0RFUFRIX0ZVTkMgPSAnZGVwdGguZnVuYydcbnZhciBTX0RFUFRIX1JBTkdFID0gJ2RlcHRoLnJhbmdlJ1xudmFyIFNfREVQVEhfTUFTSyA9ICdkZXB0aC5tYXNrJ1xudmFyIFNfQ09MT1JfTUFTSyA9ICdjb2xvck1hc2snXG52YXIgU19DVUxMX0VOQUJMRSA9ICdjdWxsLmVuYWJsZSdcbnZhciBTX0NVTExfRkFDRSA9ICdjdWxsLmZhY2UnXG52YXIgU19GUk9OVF9GQUNFID0gJ2Zyb250RmFjZSdcbnZhciBTX0xJTkVfV0lEVEggPSAnbGluZVdpZHRoJ1xudmFyIFNfUE9MWUdPTl9PRkZTRVRfRU5BQkxFID0gJ3BvbHlnb25PZmZzZXQuZW5hYmxlJ1xudmFyIFNfUE9MWUdPTl9PRkZTRVRfT0ZGU0VUID0gJ3BvbHlnb25PZmZzZXQub2Zmc2V0J1xudmFyIFNfU0FNUExFX0FMUEhBID0gJ3NhbXBsZS5hbHBoYSdcbnZhciBTX1NBTVBMRV9FTkFCTEUgPSAnc2FtcGxlLmVuYWJsZSdcbnZhciBTX1NBTVBMRV9DT1ZFUkFHRSA9ICdzYW1wbGUuY292ZXJhZ2UnXG52YXIgU19TVEVOQ0lMX0VOQUJMRSA9ICdzdGVuY2lsLmVuYWJsZSdcbnZhciBTX1NURU5DSUxfTUFTSyA9ICdzdGVuY2lsLm1hc2snXG52YXIgU19TVEVOQ0lMX0ZVTkMgPSAnc3RlbmNpbC5mdW5jJ1xudmFyIFNfU1RFTkNJTF9PUEZST05UID0gJ3N0ZW5jaWwub3BGcm9udCdcbnZhciBTX1NURU5DSUxfT1BCQUNLID0gJ3N0ZW5jaWwub3BCYWNrJ1xudmFyIFNfU0NJU1NPUl9FTkFCTEUgPSAnc2Npc3Nvci5lbmFibGUnXG52YXIgU19TQ0lTU09SX0JPWCA9ICdzY2lzc29yLmJveCdcbnZhciBTX1ZJRVdQT1JUID0gJ3ZpZXdwb3J0J1xuXG52YXIgU19QUk9GSUxFID0gJ3Byb2ZpbGUnXG5cbnZhciBTX0ZSQU1FQlVGRkVSID0gJ2ZyYW1lYnVmZmVyJ1xudmFyIFNfVkVSVCA9ICd2ZXJ0J1xudmFyIFNfRlJBRyA9ICdmcmFnJ1xudmFyIFNfRUxFTUVOVFMgPSAnZWxlbWVudHMnXG52YXIgU19QUklNSVRJVkUgPSAncHJpbWl0aXZlJ1xudmFyIFNfQ09VTlQgPSAnY291bnQnXG52YXIgU19PRkZTRVQgPSAnb2Zmc2V0J1xudmFyIFNfSU5TVEFOQ0VTID0gJ2luc3RhbmNlcydcblxudmFyIFNVRkZJWF9XSURUSCA9ICdXaWR0aCdcbnZhciBTVUZGSVhfSEVJR0hUID0gJ0hlaWdodCdcblxudmFyIFNfRlJBTUVCVUZGRVJfV0lEVEggPSBTX0ZSQU1FQlVGRkVSICsgU1VGRklYX1dJRFRIXG52YXIgU19GUkFNRUJVRkZFUl9IRUlHSFQgPSBTX0ZSQU1FQlVGRkVSICsgU1VGRklYX0hFSUdIVFxudmFyIFNfVklFV1BPUlRfV0lEVEggPSBTX1ZJRVdQT1JUICsgU1VGRklYX1dJRFRIXG52YXIgU19WSUVXUE9SVF9IRUlHSFQgPSBTX1ZJRVdQT1JUICsgU1VGRklYX0hFSUdIVFxudmFyIFNfRFJBV0lOR0JVRkZFUiA9ICdkcmF3aW5nQnVmZmVyJ1xudmFyIFNfRFJBV0lOR0JVRkZFUl9XSURUSCA9IFNfRFJBV0lOR0JVRkZFUiArIFNVRkZJWF9XSURUSFxudmFyIFNfRFJBV0lOR0JVRkZFUl9IRUlHSFQgPSBTX0RSQVdJTkdCVUZGRVIgKyBTVUZGSVhfSEVJR0hUXG5cbnZhciBORVNURURfT1BUSU9OUyA9IFtcbiAgU19CTEVORF9GVU5DLFxuICBTX0JMRU5EX0VRVUFUSU9OLFxuICBTX1NURU5DSUxfRlVOQyxcbiAgU19TVEVOQ0lMX09QRlJPTlQsXG4gIFNfU1RFTkNJTF9PUEJBQ0ssXG4gIFNfU0FNUExFX0NPVkVSQUdFLFxuICBTX1ZJRVdQT1JULFxuICBTX1NDSVNTT1JfQk9YLFxuICBTX1BPTFlHT05fT0ZGU0VUX09GRlNFVFxuXVxuXG52YXIgR0xfQVJSQVlfQlVGRkVSID0gMzQ5NjJcbnZhciBHTF9FTEVNRU5UX0FSUkFZX0JVRkZFUiA9IDM0OTYzXG5cbnZhciBHTF9GUkFHTUVOVF9TSEFERVIgPSAzNTYzMlxudmFyIEdMX1ZFUlRFWF9TSEFERVIgPSAzNTYzM1xuXG52YXIgR0xfVEVYVFVSRV8yRCA9IDB4MERFMVxudmFyIEdMX1RFWFRVUkVfQ1VCRV9NQVAgPSAweDg1MTNcblxudmFyIEdMX0NVTExfRkFDRSA9IDB4MEI0NFxudmFyIEdMX0JMRU5EID0gMHgwQkUyXG52YXIgR0xfRElUSEVSID0gMHgwQkQwXG52YXIgR0xfU1RFTkNJTF9URVNUID0gMHgwQjkwXG52YXIgR0xfREVQVEhfVEVTVCA9IDB4MEI3MVxudmFyIEdMX1NDSVNTT1JfVEVTVCA9IDB4MEMxMVxudmFyIEdMX1BPTFlHT05fT0ZGU0VUX0ZJTEwgPSAweDgwMzdcbnZhciBHTF9TQU1QTEVfQUxQSEFfVE9fQ09WRVJBR0UgPSAweDgwOUVcbnZhciBHTF9TQU1QTEVfQ09WRVJBR0UgPSAweDgwQTBcblxudmFyIEdMX0ZMT0FUID0gNTEyNlxudmFyIEdMX0ZMT0FUX1ZFQzIgPSAzNTY2NFxudmFyIEdMX0ZMT0FUX1ZFQzMgPSAzNTY2NVxudmFyIEdMX0ZMT0FUX1ZFQzQgPSAzNTY2NlxudmFyIEdMX0lOVCA9IDUxMjRcbnZhciBHTF9JTlRfVkVDMiA9IDM1NjY3XG52YXIgR0xfSU5UX1ZFQzMgPSAzNTY2OFxudmFyIEdMX0lOVF9WRUM0ID0gMzU2NjlcbnZhciBHTF9CT09MID0gMzU2NzBcbnZhciBHTF9CT09MX1ZFQzIgPSAzNTY3MVxudmFyIEdMX0JPT0xfVkVDMyA9IDM1NjcyXG52YXIgR0xfQk9PTF9WRUM0ID0gMzU2NzNcbnZhciBHTF9GTE9BVF9NQVQyID0gMzU2NzRcbnZhciBHTF9GTE9BVF9NQVQzID0gMzU2NzVcbnZhciBHTF9GTE9BVF9NQVQ0ID0gMzU2NzZcbnZhciBHTF9TQU1QTEVSXzJEID0gMzU2NzhcbnZhciBHTF9TQU1QTEVSX0NVQkUgPSAzNTY4MFxuXG52YXIgR0xfVFJJQU5HTEVTID0gNFxuXG52YXIgR0xfRlJPTlQgPSAxMDI4XG52YXIgR0xfQkFDSyA9IDEwMjlcbnZhciBHTF9DVyA9IDB4MDkwMFxudmFyIEdMX0NDVyA9IDB4MDkwMVxudmFyIEdMX01JTl9FWFQgPSAweDgwMDdcbnZhciBHTF9NQVhfRVhUID0gMHg4MDA4XG52YXIgR0xfQUxXQVlTID0gNTE5XG52YXIgR0xfS0VFUCA9IDc2ODBcbnZhciBHTF9aRVJPID0gMFxudmFyIEdMX09ORSA9IDFcbnZhciBHTF9GVU5DX0FERCA9IDB4ODAwNlxudmFyIEdMX0xFU1MgPSA1MTNcblxudmFyIEdMX0ZSQU1FQlVGRkVSID0gMHg4RDQwXG52YXIgR0xfQ09MT1JfQVRUQUNITUVOVDAgPSAweDhDRTBcblxudmFyIGJsZW5kRnVuY3MgPSB7XG4gICcwJzogMCxcbiAgJzEnOiAxLFxuICAnemVybyc6IDAsXG4gICdvbmUnOiAxLFxuICAnc3JjIGNvbG9yJzogNzY4LFxuICAnb25lIG1pbnVzIHNyYyBjb2xvcic6IDc2OSxcbiAgJ3NyYyBhbHBoYSc6IDc3MCxcbiAgJ29uZSBtaW51cyBzcmMgYWxwaGEnOiA3NzEsXG4gICdkc3QgY29sb3InOiA3NzQsXG4gICdvbmUgbWludXMgZHN0IGNvbG9yJzogNzc1LFxuICAnZHN0IGFscGhhJzogNzcyLFxuICAnb25lIG1pbnVzIGRzdCBhbHBoYSc6IDc3MyxcbiAgJ2NvbnN0YW50IGNvbG9yJzogMzI3NjksXG4gICdvbmUgbWludXMgY29uc3RhbnQgY29sb3InOiAzMjc3MCxcbiAgJ2NvbnN0YW50IGFscGhhJzogMzI3NzEsXG4gICdvbmUgbWludXMgY29uc3RhbnQgYWxwaGEnOiAzMjc3MixcbiAgJ3NyYyBhbHBoYSBzYXR1cmF0ZSc6IDc3NlxufVxuXG4vLyBUaGVyZSBhcmUgaW52YWxpZCB2YWx1ZXMgZm9yIHNyY1JHQiBhbmQgZHN0UkdCLiBTZWU6XG4vLyBodHRwczovL3d3dy5raHJvbm9zLm9yZy9yZWdpc3RyeS93ZWJnbC9zcGVjcy8xLjAvIzYuMTNcbi8vIGh0dHBzOi8vZ2l0aHViLmNvbS9LaHJvbm9zR3JvdXAvV2ViR0wvYmxvYi8wZDMyMDFmNWY3ZWMzYzAwNjBiYzFmMDQwNzc0NjE1NDFmMTk4N2I5L2NvbmZvcm1hbmNlLXN1aXRlcy8xLjAuMy9jb25mb3JtYW5jZS9taXNjL3dlYmdsLXNwZWNpZmljLmh0bWwjTDU2XG52YXIgaW52YWxpZEJsZW5kQ29tYmluYXRpb25zID0gW1xuICAnY29uc3RhbnQgY29sb3IsIGNvbnN0YW50IGFscGhhJyxcbiAgJ29uZSBtaW51cyBjb25zdGFudCBjb2xvciwgY29uc3RhbnQgYWxwaGEnLFxuICAnY29uc3RhbnQgY29sb3IsIG9uZSBtaW51cyBjb25zdGFudCBhbHBoYScsXG4gICdvbmUgbWludXMgY29uc3RhbnQgY29sb3IsIG9uZSBtaW51cyBjb25zdGFudCBhbHBoYScsXG4gICdjb25zdGFudCBhbHBoYSwgY29uc3RhbnQgY29sb3InLFxuICAnY29uc3RhbnQgYWxwaGEsIG9uZSBtaW51cyBjb25zdGFudCBjb2xvcicsXG4gICdvbmUgbWludXMgY29uc3RhbnQgYWxwaGEsIGNvbnN0YW50IGNvbG9yJyxcbiAgJ29uZSBtaW51cyBjb25zdGFudCBhbHBoYSwgb25lIG1pbnVzIGNvbnN0YW50IGNvbG9yJ1xuXVxuXG52YXIgY29tcGFyZUZ1bmNzID0ge1xuICAnbmV2ZXInOiA1MTIsXG4gICdsZXNzJzogNTEzLFxuICAnPCc6IDUxMyxcbiAgJ2VxdWFsJzogNTE0LFxuICAnPSc6IDUxNCxcbiAgJz09JzogNTE0LFxuICAnPT09JzogNTE0LFxuICAnbGVxdWFsJzogNTE1LFxuICAnPD0nOiA1MTUsXG4gICdncmVhdGVyJzogNTE2LFxuICAnPic6IDUxNixcbiAgJ25vdGVxdWFsJzogNTE3LFxuICAnIT0nOiA1MTcsXG4gICchPT0nOiA1MTcsXG4gICdnZXF1YWwnOiA1MTgsXG4gICc+PSc6IDUxOCxcbiAgJ2Fsd2F5cyc6IDUxOVxufVxuXG52YXIgc3RlbmNpbE9wcyA9IHtcbiAgJzAnOiAwLFxuICAnemVybyc6IDAsXG4gICdrZWVwJzogNzY4MCxcbiAgJ3JlcGxhY2UnOiA3NjgxLFxuICAnaW5jcmVtZW50JzogNzY4MixcbiAgJ2RlY3JlbWVudCc6IDc2ODMsXG4gICdpbmNyZW1lbnQgd3JhcCc6IDM0MDU1LFxuICAnZGVjcmVtZW50IHdyYXAnOiAzNDA1NixcbiAgJ2ludmVydCc6IDUzODZcbn1cblxudmFyIHNoYWRlclR5cGUgPSB7XG4gICdmcmFnJzogR0xfRlJBR01FTlRfU0hBREVSLFxuICAndmVydCc6IEdMX1ZFUlRFWF9TSEFERVJcbn1cblxudmFyIG9yaWVudGF0aW9uVHlwZSA9IHtcbiAgJ2N3JzogR0xfQ1csXG4gICdjY3cnOiBHTF9DQ1dcbn1cblxuZnVuY3Rpb24gaXNCdWZmZXJBcmdzICh4KSB7XG4gIHJldHVybiBBcnJheS5pc0FycmF5KHgpIHx8XG4gICAgaXNUeXBlZEFycmF5KHgpIHx8XG4gICAgaXNOREFycmF5KHgpXG59XG5cbi8vIE1ha2Ugc3VyZSB2aWV3cG9ydCBpcyBwcm9jZXNzZWQgZmlyc3RcbmZ1bmN0aW9uIHNvcnRTdGF0ZSAoc3RhdGUpIHtcbiAgcmV0dXJuIHN0YXRlLnNvcnQoZnVuY3Rpb24gKGEsIGIpIHtcbiAgICBpZiAoYSA9PT0gU19WSUVXUE9SVCkge1xuICAgICAgcmV0dXJuIC0xXG4gICAgfSBlbHNlIGlmIChiID09PSBTX1ZJRVdQT1JUKSB7XG4gICAgICByZXR1cm4gMVxuICAgIH1cbiAgICByZXR1cm4gKGEgPCBiKSA/IC0xIDogMVxuICB9KVxufVxuXG5mdW5jdGlvbiBEZWNsYXJhdGlvbiAodGhpc0RlcCwgY29udGV4dERlcCwgcHJvcERlcCwgYXBwZW5kKSB7XG4gIHRoaXMudGhpc0RlcCA9IHRoaXNEZXBcbiAgdGhpcy5jb250ZXh0RGVwID0gY29udGV4dERlcFxuICB0aGlzLnByb3BEZXAgPSBwcm9wRGVwXG4gIHRoaXMuYXBwZW5kID0gYXBwZW5kXG59XG5cbmZ1bmN0aW9uIGlzU3RhdGljIChkZWNsKSB7XG4gIHJldHVybiBkZWNsICYmICEoZGVjbC50aGlzRGVwIHx8IGRlY2wuY29udGV4dERlcCB8fCBkZWNsLnByb3BEZXApXG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVN0YXRpY0RlY2wgKGFwcGVuZCkge1xuICByZXR1cm4gbmV3IERlY2xhcmF0aW9uKGZhbHNlLCBmYWxzZSwgZmFsc2UsIGFwcGVuZClcbn1cblxuZnVuY3Rpb24gY3JlYXRlRHluYW1pY0RlY2wgKGR5biwgYXBwZW5kKSB7XG4gIHZhciB0eXBlID0gZHluLnR5cGVcbiAgaWYgKHR5cGUgPT09IERZTl9GVU5DKSB7XG4gICAgdmFyIG51bUFyZ3MgPSBkeW4uZGF0YS5sZW5ndGhcbiAgICByZXR1cm4gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgdHJ1ZSxcbiAgICAgIG51bUFyZ3MgPj0gMSxcbiAgICAgIG51bUFyZ3MgPj0gMixcbiAgICAgIGFwcGVuZClcbiAgfSBlbHNlIGlmICh0eXBlID09PSBEWU5fVEhVTkspIHtcbiAgICB2YXIgZGF0YSA9IGR5bi5kYXRhXG4gICAgcmV0dXJuIG5ldyBEZWNsYXJhdGlvbihcbiAgICAgIGRhdGEudGhpc0RlcCxcbiAgICAgIGRhdGEuY29udGV4dERlcCxcbiAgICAgIGRhdGEucHJvcERlcCxcbiAgICAgIGFwcGVuZClcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgdHlwZSA9PT0gRFlOX1NUQVRFLFxuICAgICAgdHlwZSA9PT0gRFlOX0NPTlRFWFQsXG4gICAgICB0eXBlID09PSBEWU5fUFJPUCxcbiAgICAgIGFwcGVuZClcbiAgfVxufVxuXG52YXIgU0NPUEVfREVDTCA9IG5ldyBEZWNsYXJhdGlvbihmYWxzZSwgZmFsc2UsIGZhbHNlLCBmdW5jdGlvbiAoKSB7fSlcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiByZWdsQ29yZSAoXG4gIGdsLFxuICBzdHJpbmdTdG9yZSxcbiAgZXh0ZW5zaW9ucyxcbiAgbGltaXRzLFxuICBidWZmZXJTdGF0ZSxcbiAgZWxlbWVudFN0YXRlLFxuICB0ZXh0dXJlU3RhdGUsXG4gIGZyYW1lYnVmZmVyU3RhdGUsXG4gIHVuaWZvcm1TdGF0ZSxcbiAgYXR0cmlidXRlU3RhdGUsXG4gIHNoYWRlclN0YXRlLFxuICBkcmF3U3RhdGUsXG4gIGNvbnRleHRTdGF0ZSxcbiAgdGltZXIsXG4gIGNvbmZpZykge1xuICB2YXIgQXR0cmlidXRlUmVjb3JkID0gYXR0cmlidXRlU3RhdGUuUmVjb3JkXG5cbiAgdmFyIGJsZW5kRXF1YXRpb25zID0ge1xuICAgICdhZGQnOiAzMjc3NCxcbiAgICAnc3VidHJhY3QnOiAzMjc3OCxcbiAgICAncmV2ZXJzZSBzdWJ0cmFjdCc6IDMyNzc5XG4gIH1cbiAgaWYgKGV4dGVuc2lvbnMuZXh0X2JsZW5kX21pbm1heCkge1xuICAgIGJsZW5kRXF1YXRpb25zLm1pbiA9IEdMX01JTl9FWFRcbiAgICBibGVuZEVxdWF0aW9ucy5tYXggPSBHTF9NQVhfRVhUXG4gIH1cblxuICB2YXIgZXh0SW5zdGFuY2luZyA9IGV4dGVuc2lvbnMuYW5nbGVfaW5zdGFuY2VkX2FycmF5c1xuICB2YXIgZXh0RHJhd0J1ZmZlcnMgPSBleHRlbnNpb25zLndlYmdsX2RyYXdfYnVmZmVyc1xuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gV0VCR0wgU1RBVEVcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICB2YXIgY3VycmVudFN0YXRlID0ge1xuICAgIGRpcnR5OiB0cnVlLFxuICAgIHByb2ZpbGU6IGNvbmZpZy5wcm9maWxlXG4gIH1cbiAgdmFyIG5leHRTdGF0ZSA9IHt9XG4gIHZhciBHTF9TVEFURV9OQU1FUyA9IFtdXG4gIHZhciBHTF9GTEFHUyA9IHt9XG4gIHZhciBHTF9WQVJJQUJMRVMgPSB7fVxuXG4gIGZ1bmN0aW9uIHByb3BOYW1lIChuYW1lKSB7XG4gICAgcmV0dXJuIG5hbWUucmVwbGFjZSgnLicsICdfJylcbiAgfVxuXG4gIGZ1bmN0aW9uIHN0YXRlRmxhZyAoc25hbWUsIGNhcCwgaW5pdCkge1xuICAgIHZhciBuYW1lID0gcHJvcE5hbWUoc25hbWUpXG4gICAgR0xfU1RBVEVfTkFNRVMucHVzaChzbmFtZSlcbiAgICBuZXh0U3RhdGVbbmFtZV0gPSBjdXJyZW50U3RhdGVbbmFtZV0gPSAhIWluaXRcbiAgICBHTF9GTEFHU1tuYW1lXSA9IGNhcFxuICB9XG5cbiAgZnVuY3Rpb24gc3RhdGVWYXJpYWJsZSAoc25hbWUsIGZ1bmMsIGluaXQpIHtcbiAgICB2YXIgbmFtZSA9IHByb3BOYW1lKHNuYW1lKVxuICAgIEdMX1NUQVRFX05BTUVTLnB1c2goc25hbWUpXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoaW5pdCkpIHtcbiAgICAgIGN1cnJlbnRTdGF0ZVtuYW1lXSA9IGluaXQuc2xpY2UoKVxuICAgICAgbmV4dFN0YXRlW25hbWVdID0gaW5pdC5zbGljZSgpXG4gICAgfSBlbHNlIHtcbiAgICAgIGN1cnJlbnRTdGF0ZVtuYW1lXSA9IG5leHRTdGF0ZVtuYW1lXSA9IGluaXRcbiAgICB9XG4gICAgR0xfVkFSSUFCTEVTW25hbWVdID0gZnVuY1xuICB9XG5cbiAgLy8gRGl0aGVyaW5nXG4gIHN0YXRlRmxhZyhTX0RJVEhFUiwgR0xfRElUSEVSKVxuXG4gIC8vIEJsZW5kaW5nXG4gIHN0YXRlRmxhZyhTX0JMRU5EX0VOQUJMRSwgR0xfQkxFTkQpXG4gIHN0YXRlVmFyaWFibGUoU19CTEVORF9DT0xPUiwgJ2JsZW5kQ29sb3InLCBbMCwgMCwgMCwgMF0pXG4gIHN0YXRlVmFyaWFibGUoU19CTEVORF9FUVVBVElPTiwgJ2JsZW5kRXF1YXRpb25TZXBhcmF0ZScsXG4gICAgW0dMX0ZVTkNfQURELCBHTF9GVU5DX0FERF0pXG4gIHN0YXRlVmFyaWFibGUoU19CTEVORF9GVU5DLCAnYmxlbmRGdW5jU2VwYXJhdGUnLFxuICAgIFtHTF9PTkUsIEdMX1pFUk8sIEdMX09ORSwgR0xfWkVST10pXG5cbiAgLy8gRGVwdGhcbiAgc3RhdGVGbGFnKFNfREVQVEhfRU5BQkxFLCBHTF9ERVBUSF9URVNULCB0cnVlKVxuICBzdGF0ZVZhcmlhYmxlKFNfREVQVEhfRlVOQywgJ2RlcHRoRnVuYycsIEdMX0xFU1MpXG4gIHN0YXRlVmFyaWFibGUoU19ERVBUSF9SQU5HRSwgJ2RlcHRoUmFuZ2UnLCBbMCwgMV0pXG4gIHN0YXRlVmFyaWFibGUoU19ERVBUSF9NQVNLLCAnZGVwdGhNYXNrJywgdHJ1ZSlcblxuICAvLyBDb2xvciBtYXNrXG4gIHN0YXRlVmFyaWFibGUoU19DT0xPUl9NQVNLLCBTX0NPTE9SX01BU0ssIFt0cnVlLCB0cnVlLCB0cnVlLCB0cnVlXSlcblxuICAvLyBGYWNlIGN1bGxpbmdcbiAgc3RhdGVGbGFnKFNfQ1VMTF9FTkFCTEUsIEdMX0NVTExfRkFDRSlcbiAgc3RhdGVWYXJpYWJsZShTX0NVTExfRkFDRSwgJ2N1bGxGYWNlJywgR0xfQkFDSylcblxuICAvLyBGcm9udCBmYWNlIG9yaWVudGF0aW9uXG4gIHN0YXRlVmFyaWFibGUoU19GUk9OVF9GQUNFLCBTX0ZST05UX0ZBQ0UsIEdMX0NDVylcblxuICAvLyBMaW5lIHdpZHRoXG4gIHN0YXRlVmFyaWFibGUoU19MSU5FX1dJRFRILCBTX0xJTkVfV0lEVEgsIDEpXG5cbiAgLy8gUG9seWdvbiBvZmZzZXRcbiAgc3RhdGVGbGFnKFNfUE9MWUdPTl9PRkZTRVRfRU5BQkxFLCBHTF9QT0xZR09OX09GRlNFVF9GSUxMKVxuICBzdGF0ZVZhcmlhYmxlKFNfUE9MWUdPTl9PRkZTRVRfT0ZGU0VULCAncG9seWdvbk9mZnNldCcsIFswLCAwXSlcblxuICAvLyBTYW1wbGUgY292ZXJhZ2VcbiAgc3RhdGVGbGFnKFNfU0FNUExFX0FMUEhBLCBHTF9TQU1QTEVfQUxQSEFfVE9fQ09WRVJBR0UpXG4gIHN0YXRlRmxhZyhTX1NBTVBMRV9FTkFCTEUsIEdMX1NBTVBMRV9DT1ZFUkFHRSlcbiAgc3RhdGVWYXJpYWJsZShTX1NBTVBMRV9DT1ZFUkFHRSwgJ3NhbXBsZUNvdmVyYWdlJywgWzEsIGZhbHNlXSlcblxuICAvLyBTdGVuY2lsXG4gIHN0YXRlRmxhZyhTX1NURU5DSUxfRU5BQkxFLCBHTF9TVEVOQ0lMX1RFU1QpXG4gIHN0YXRlVmFyaWFibGUoU19TVEVOQ0lMX01BU0ssICdzdGVuY2lsTWFzaycsIC0xKVxuICBzdGF0ZVZhcmlhYmxlKFNfU1RFTkNJTF9GVU5DLCAnc3RlbmNpbEZ1bmMnLCBbR0xfQUxXQVlTLCAwLCAtMV0pXG4gIHN0YXRlVmFyaWFibGUoU19TVEVOQ0lMX09QRlJPTlQsICdzdGVuY2lsT3BTZXBhcmF0ZScsXG4gICAgW0dMX0ZST05ULCBHTF9LRUVQLCBHTF9LRUVQLCBHTF9LRUVQXSlcbiAgc3RhdGVWYXJpYWJsZShTX1NURU5DSUxfT1BCQUNLLCAnc3RlbmNpbE9wU2VwYXJhdGUnLFxuICAgIFtHTF9CQUNLLCBHTF9LRUVQLCBHTF9LRUVQLCBHTF9LRUVQXSlcblxuICAvLyBTY2lzc29yXG4gIHN0YXRlRmxhZyhTX1NDSVNTT1JfRU5BQkxFLCBHTF9TQ0lTU09SX1RFU1QpXG4gIHN0YXRlVmFyaWFibGUoU19TQ0lTU09SX0JPWCwgJ3NjaXNzb3InLFxuICAgIFswLCAwLCBnbC5kcmF3aW5nQnVmZmVyV2lkdGgsIGdsLmRyYXdpbmdCdWZmZXJIZWlnaHRdKVxuXG4gIC8vIFZpZXdwb3J0XG4gIHN0YXRlVmFyaWFibGUoU19WSUVXUE9SVCwgU19WSUVXUE9SVCxcbiAgICBbMCwgMCwgZ2wuZHJhd2luZ0J1ZmZlcldpZHRoLCBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0XSlcblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIEVOVklST05NRU5UXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgdmFyIHNoYXJlZFN0YXRlID0ge1xuICAgIGdsOiBnbCxcbiAgICBjb250ZXh0OiBjb250ZXh0U3RhdGUsXG4gICAgc3RyaW5nczogc3RyaW5nU3RvcmUsXG4gICAgbmV4dDogbmV4dFN0YXRlLFxuICAgIGN1cnJlbnQ6IGN1cnJlbnRTdGF0ZSxcbiAgICBkcmF3OiBkcmF3U3RhdGUsXG4gICAgZWxlbWVudHM6IGVsZW1lbnRTdGF0ZSxcbiAgICBidWZmZXI6IGJ1ZmZlclN0YXRlLFxuICAgIHNoYWRlcjogc2hhZGVyU3RhdGUsXG4gICAgYXR0cmlidXRlczogYXR0cmlidXRlU3RhdGUuc3RhdGUsXG4gICAgdW5pZm9ybXM6IHVuaWZvcm1TdGF0ZSxcbiAgICBmcmFtZWJ1ZmZlcjogZnJhbWVidWZmZXJTdGF0ZSxcbiAgICBleHRlbnNpb25zOiBleHRlbnNpb25zLFxuXG4gICAgdGltZXI6IHRpbWVyLFxuICAgIGlzQnVmZmVyQXJnczogaXNCdWZmZXJBcmdzXG4gIH1cblxuICB2YXIgc2hhcmVkQ29uc3RhbnRzID0ge1xuICAgIHByaW1UeXBlczogcHJpbVR5cGVzLFxuICAgIGNvbXBhcmVGdW5jczogY29tcGFyZUZ1bmNzLFxuICAgIGJsZW5kRnVuY3M6IGJsZW5kRnVuY3MsXG4gICAgYmxlbmRFcXVhdGlvbnM6IGJsZW5kRXF1YXRpb25zLFxuICAgIHN0ZW5jaWxPcHM6IHN0ZW5jaWxPcHMsXG4gICAgZ2xUeXBlczogZ2xUeXBlcyxcbiAgICBvcmllbnRhdGlvblR5cGU6IG9yaWVudGF0aW9uVHlwZVxuICB9XG5cbiAgXG5cbiAgaWYgKGV4dERyYXdCdWZmZXJzKSB7XG4gICAgc2hhcmVkQ29uc3RhbnRzLmJhY2tCdWZmZXIgPSBbR0xfQkFDS11cbiAgICBzaGFyZWRDb25zdGFudHMuZHJhd0J1ZmZlciA9IGxvb3AobGltaXRzLm1heERyYXdidWZmZXJzLCBmdW5jdGlvbiAoaSkge1xuICAgICAgaWYgKGkgPT09IDApIHtcbiAgICAgICAgcmV0dXJuIFswXVxuICAgICAgfVxuICAgICAgcmV0dXJuIGxvb3AoaSwgZnVuY3Rpb24gKGopIHtcbiAgICAgICAgcmV0dXJuIEdMX0NPTE9SX0FUVEFDSE1FTlQwICsgalxuICAgICAgfSlcbiAgICB9KVxuICB9XG5cbiAgdmFyIGRyYXdDYWxsQ291bnRlciA9IDBcbiAgZnVuY3Rpb24gY3JlYXRlUkVHTEVudmlyb25tZW50ICgpIHtcbiAgICB2YXIgZW52ID0gY3JlYXRlRW52aXJvbm1lbnQoKVxuICAgIHZhciBsaW5rID0gZW52LmxpbmtcbiAgICB2YXIgZ2xvYmFsID0gZW52Lmdsb2JhbFxuICAgIGVudi5pZCA9IGRyYXdDYWxsQ291bnRlcisrXG5cbiAgICBlbnYuYmF0Y2hJZCA9ICcwJ1xuXG4gICAgLy8gbGluayBzaGFyZWQgc3RhdGVcbiAgICB2YXIgU0hBUkVEID0gbGluayhzaGFyZWRTdGF0ZSlcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZCA9IHtcbiAgICAgIHByb3BzOiAnYTAnXG4gICAgfVxuICAgIE9iamVjdC5rZXlzKHNoYXJlZFN0YXRlKS5mb3JFYWNoKGZ1bmN0aW9uIChwcm9wKSB7XG4gICAgICBzaGFyZWRbcHJvcF0gPSBnbG9iYWwuZGVmKFNIQVJFRCwgJy4nLCBwcm9wKVxuICAgIH0pXG5cbiAgICAvLyBJbmplY3QgcnVudGltZSBhc3NlcnRpb24gc3R1ZmYgZm9yIGRlYnVnIGJ1aWxkc1xuICAgIFxuXG4gICAgLy8gQ29weSBHTCBzdGF0ZSB2YXJpYWJsZXMgb3ZlclxuICAgIHZhciBuZXh0VmFycyA9IGVudi5uZXh0ID0ge31cbiAgICB2YXIgY3VycmVudFZhcnMgPSBlbnYuY3VycmVudCA9IHt9XG4gICAgT2JqZWN0LmtleXMoR0xfVkFSSUFCTEVTKS5mb3JFYWNoKGZ1bmN0aW9uICh2YXJpYWJsZSkge1xuICAgICAgaWYgKEFycmF5LmlzQXJyYXkoY3VycmVudFN0YXRlW3ZhcmlhYmxlXSkpIHtcbiAgICAgICAgbmV4dFZhcnNbdmFyaWFibGVdID0gZ2xvYmFsLmRlZihzaGFyZWQubmV4dCwgJy4nLCB2YXJpYWJsZSlcbiAgICAgICAgY3VycmVudFZhcnNbdmFyaWFibGVdID0gZ2xvYmFsLmRlZihzaGFyZWQuY3VycmVudCwgJy4nLCB2YXJpYWJsZSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8gSW5pdGlhbGl6ZSBzaGFyZWQgY29uc3RhbnRzXG4gICAgdmFyIGNvbnN0YW50cyA9IGVudi5jb25zdGFudHMgPSB7fVxuICAgIE9iamVjdC5rZXlzKHNoYXJlZENvbnN0YW50cykuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgY29uc3RhbnRzW25hbWVdID0gZ2xvYmFsLmRlZihKU09OLnN0cmluZ2lmeShzaGFyZWRDb25zdGFudHNbbmFtZV0pKVxuICAgIH0pXG5cbiAgICAvLyBIZWxwZXIgZnVuY3Rpb24gZm9yIGNhbGxpbmcgYSBibG9ja1xuICAgIGVudi5pbnZva2UgPSBmdW5jdGlvbiAoYmxvY2ssIHgpIHtcbiAgICAgIHN3aXRjaCAoeC50eXBlKSB7XG4gICAgICAgIGNhc2UgRFlOX0ZVTkM6XG4gICAgICAgICAgdmFyIGFyZ0xpc3QgPSBbXG4gICAgICAgICAgICAndGhpcycsXG4gICAgICAgICAgICBzaGFyZWQuY29udGV4dCxcbiAgICAgICAgICAgIHNoYXJlZC5wcm9wcyxcbiAgICAgICAgICAgIGVudi5iYXRjaElkXG4gICAgICAgICAgXVxuICAgICAgICAgIHJldHVybiBibG9jay5kZWYoXG4gICAgICAgICAgICBsaW5rKHguZGF0YSksICcuY2FsbCgnLFxuICAgICAgICAgICAgICBhcmdMaXN0LnNsaWNlKDAsIE1hdGgubWF4KHguZGF0YS5sZW5ndGggKyAxLCA0KSksXG4gICAgICAgICAgICAgJyknKVxuICAgICAgICBjYXNlIERZTl9QUk9QOlxuICAgICAgICAgIHJldHVybiBibG9jay5kZWYoc2hhcmVkLnByb3BzLCB4LmRhdGEpXG4gICAgICAgIGNhc2UgRFlOX0NPTlRFWFQ6XG4gICAgICAgICAgcmV0dXJuIGJsb2NrLmRlZihzaGFyZWQuY29udGV4dCwgeC5kYXRhKVxuICAgICAgICBjYXNlIERZTl9TVEFURTpcbiAgICAgICAgICByZXR1cm4gYmxvY2suZGVmKCd0aGlzJywgeC5kYXRhKVxuICAgICAgICBjYXNlIERZTl9USFVOSzpcbiAgICAgICAgICB4LmRhdGEuYXBwZW5kKGVudiwgYmxvY2spXG4gICAgICAgICAgcmV0dXJuIHguZGF0YS5yZWZcbiAgICAgIH1cbiAgICB9XG5cbiAgICBlbnYuYXR0cmliQ2FjaGUgPSB7fVxuXG4gICAgdmFyIHNjb3BlQXR0cmlicyA9IHt9XG4gICAgZW52LnNjb3BlQXR0cmliID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHZhciBpZCA9IHN0cmluZ1N0b3JlLmlkKG5hbWUpXG4gICAgICBpZiAoaWQgaW4gc2NvcGVBdHRyaWJzKSB7XG4gICAgICAgIHJldHVybiBzY29wZUF0dHJpYnNbaWRdXG4gICAgICB9XG4gICAgICB2YXIgYmluZGluZyA9IGF0dHJpYnV0ZVN0YXRlLnNjb3BlW2lkXVxuICAgICAgaWYgKCFiaW5kaW5nKSB7XG4gICAgICAgIGJpbmRpbmcgPSBhdHRyaWJ1dGVTdGF0ZS5zY29wZVtpZF0gPSBuZXcgQXR0cmlidXRlUmVjb3JkKClcbiAgICAgIH1cbiAgICAgIHZhciByZXN1bHQgPSBzY29wZUF0dHJpYnNbaWRdID0gbGluayhiaW5kaW5nKVxuICAgICAgcmV0dXJuIHJlc3VsdFxuICAgIH1cblxuICAgIHJldHVybiBlbnZcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gUEFSU0lOR1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIHBhcnNlUHJvZmlsZSAob3B0aW9ucykge1xuICAgIHZhciBzdGF0aWNPcHRpb25zID0gb3B0aW9ucy5zdGF0aWNcbiAgICB2YXIgZHluYW1pY09wdGlvbnMgPSBvcHRpb25zLmR5bmFtaWNcblxuICAgIHZhciBwcm9maWxlRW5hYmxlXG4gICAgaWYgKFNfUFJPRklMRSBpbiBzdGF0aWNPcHRpb25zKSB7XG4gICAgICB2YXIgdmFsdWUgPSAhIXN0YXRpY09wdGlvbnNbU19QUk9GSUxFXVxuICAgICAgcHJvZmlsZUVuYWJsZSA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgcmV0dXJuIHZhbHVlXG4gICAgICB9KVxuICAgICAgcHJvZmlsZUVuYWJsZS5lbmFibGUgPSB2YWx1ZVxuICAgIH0gZWxzZSBpZiAoU19QUk9GSUxFIGluIGR5bmFtaWNPcHRpb25zKSB7XG4gICAgICB2YXIgZHluID0gZHluYW1pY09wdGlvbnNbU19QUk9GSUxFXVxuICAgICAgcHJvZmlsZUVuYWJsZSA9IGNyZWF0ZUR5bmFtaWNEZWNsKGR5biwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgcmV0dXJuIGVudi5pbnZva2Uoc2NvcGUsIGR5bilcbiAgICAgIH0pXG4gICAgfVxuXG4gICAgcmV0dXJuIHByb2ZpbGVFbmFibGVcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlRnJhbWVidWZmZXIgKG9wdGlvbnMsIGVudikge1xuICAgIHZhciBzdGF0aWNPcHRpb25zID0gb3B0aW9ucy5zdGF0aWNcbiAgICB2YXIgZHluYW1pY09wdGlvbnMgPSBvcHRpb25zLmR5bmFtaWNcblxuICAgIGlmIChTX0ZSQU1FQlVGRkVSIGluIHN0YXRpY09wdGlvbnMpIHtcbiAgICAgIHZhciBmcmFtZWJ1ZmZlciA9IHN0YXRpY09wdGlvbnNbU19GUkFNRUJVRkZFUl1cbiAgICAgIGlmIChmcmFtZWJ1ZmZlcikge1xuICAgICAgICBmcmFtZWJ1ZmZlciA9IGZyYW1lYnVmZmVyU3RhdGUuZ2V0RnJhbWVidWZmZXIoZnJhbWVidWZmZXIpXG4gICAgICAgIFxuICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBibG9jaykge1xuICAgICAgICAgIHZhciBGUkFNRUJVRkZFUiA9IGVudi5saW5rKGZyYW1lYnVmZmVyKVxuICAgICAgICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgICAgICAgYmxvY2suc2V0KFxuICAgICAgICAgICAgc2hhcmVkLmZyYW1lYnVmZmVyLFxuICAgICAgICAgICAgJy5uZXh0JyxcbiAgICAgICAgICAgIEZSQU1FQlVGRkVSKVxuICAgICAgICAgIHZhciBDT05URVhUID0gc2hhcmVkLmNvbnRleHRcbiAgICAgICAgICBibG9jay5zZXQoXG4gICAgICAgICAgICBDT05URVhULFxuICAgICAgICAgICAgJy4nICsgU19GUkFNRUJVRkZFUl9XSURUSCxcbiAgICAgICAgICAgIEZSQU1FQlVGRkVSICsgJy53aWR0aCcpXG4gICAgICAgICAgYmxvY2suc2V0KFxuICAgICAgICAgICAgQ09OVEVYVCxcbiAgICAgICAgICAgICcuJyArIFNfRlJBTUVCVUZGRVJfSEVJR0hULFxuICAgICAgICAgICAgRlJBTUVCVUZGRVIgKyAnLmhlaWdodCcpXG4gICAgICAgICAgcmV0dXJuIEZSQU1FQlVGRkVSXG4gICAgICAgIH0pXG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgICAgICAgc2NvcGUuc2V0KFxuICAgICAgICAgICAgc2hhcmVkLmZyYW1lYnVmZmVyLFxuICAgICAgICAgICAgJy5uZXh0JyxcbiAgICAgICAgICAgICdudWxsJylcbiAgICAgICAgICB2YXIgQ09OVEVYVCA9IHNoYXJlZC5jb250ZXh0XG4gICAgICAgICAgc2NvcGUuc2V0KFxuICAgICAgICAgICAgQ09OVEVYVCxcbiAgICAgICAgICAgICcuJyArIFNfRlJBTUVCVUZGRVJfV0lEVEgsXG4gICAgICAgICAgICBDT05URVhUICsgJy4nICsgU19EUkFXSU5HQlVGRkVSX1dJRFRIKVxuICAgICAgICAgIHNjb3BlLnNldChcbiAgICAgICAgICAgIENPTlRFWFQsXG4gICAgICAgICAgICAnLicgKyBTX0ZSQU1FQlVGRkVSX0hFSUdIVCxcbiAgICAgICAgICAgIENPTlRFWFQgKyAnLicgKyBTX0RSQVdJTkdCVUZGRVJfSEVJR0hUKVxuICAgICAgICAgIHJldHVybiAnbnVsbCdcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKFNfRlJBTUVCVUZGRVIgaW4gZHluYW1pY09wdGlvbnMpIHtcbiAgICAgIHZhciBkeW4gPSBkeW5hbWljT3B0aW9uc1tTX0ZSQU1FQlVGRkVSXVxuICAgICAgcmV0dXJuIGNyZWF0ZUR5bmFtaWNEZWNsKGR5biwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgdmFyIEZSQU1FQlVGRkVSX0ZVTkMgPSBlbnYuaW52b2tlKHNjb3BlLCBkeW4pXG4gICAgICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgICAgIHZhciBGUkFNRUJVRkZFUl9TVEFURSA9IHNoYXJlZC5mcmFtZWJ1ZmZlclxuICAgICAgICB2YXIgRlJBTUVCVUZGRVIgPSBzY29wZS5kZWYoXG4gICAgICAgICAgRlJBTUVCVUZGRVJfU1RBVEUsICcuZ2V0RnJhbWVidWZmZXIoJywgRlJBTUVCVUZGRVJfRlVOQywgJyknKVxuXG4gICAgICAgIFxuXG4gICAgICAgIHNjb3BlLnNldChcbiAgICAgICAgICBGUkFNRUJVRkZFUl9TVEFURSxcbiAgICAgICAgICAnLm5leHQnLFxuICAgICAgICAgIEZSQU1FQlVGRkVSKVxuICAgICAgICB2YXIgQ09OVEVYVCA9IHNoYXJlZC5jb250ZXh0XG4gICAgICAgIHNjb3BlLnNldChcbiAgICAgICAgICBDT05URVhULFxuICAgICAgICAgICcuJyArIFNfRlJBTUVCVUZGRVJfV0lEVEgsXG4gICAgICAgICAgRlJBTUVCVUZGRVIgKyAnPycgKyBGUkFNRUJVRkZFUiArICcud2lkdGg6JyArXG4gICAgICAgICAgQ09OVEVYVCArICcuJyArIFNfRFJBV0lOR0JVRkZFUl9XSURUSClcbiAgICAgICAgc2NvcGUuc2V0KFxuICAgICAgICAgIENPTlRFWFQsXG4gICAgICAgICAgJy4nICsgU19GUkFNRUJVRkZFUl9IRUlHSFQsXG4gICAgICAgICAgRlJBTUVCVUZGRVIgK1xuICAgICAgICAgICc/JyArIEZSQU1FQlVGRkVSICsgJy5oZWlnaHQ6JyArXG4gICAgICAgICAgQ09OVEVYVCArICcuJyArIFNfRFJBV0lOR0JVRkZFUl9IRUlHSFQpXG4gICAgICAgIHJldHVybiBGUkFNRUJVRkZFUlxuICAgICAgfSlcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZVZpZXdwb3J0U2Npc3NvciAob3B0aW9ucywgZnJhbWVidWZmZXIsIGVudikge1xuICAgIHZhciBzdGF0aWNPcHRpb25zID0gb3B0aW9ucy5zdGF0aWNcbiAgICB2YXIgZHluYW1pY09wdGlvbnMgPSBvcHRpb25zLmR5bmFtaWNcblxuICAgIGZ1bmN0aW9uIHBhcnNlQm94IChwYXJhbSkge1xuICAgICAgaWYgKHBhcmFtIGluIHN0YXRpY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIGJveCA9IHN0YXRpY09wdGlvbnNbcGFyYW1dXG4gICAgICAgIFxuXG4gICAgICAgIHZhciBpc1N0YXRpYyA9IHRydWVcbiAgICAgICAgdmFyIHggPSBib3gueCB8IDBcbiAgICAgICAgdmFyIHkgPSBib3gueSB8IDBcbiAgICAgICAgXG4gICAgICAgIHZhciB3LCBoXG4gICAgICAgIGlmICgnd2lkdGgnIGluIGJveCkge1xuICAgICAgICAgIHcgPSBib3gud2lkdGggfCAwXG4gICAgICAgICAgXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaXNTdGF0aWMgPSBmYWxzZVxuICAgICAgICB9XG4gICAgICAgIGlmICgnaGVpZ2h0JyBpbiBib3gpIHtcbiAgICAgICAgICBoID0gYm94LmhlaWdodCB8IDBcbiAgICAgICAgICBcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpc1N0YXRpYyA9IGZhbHNlXG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgICAgICFpc1N0YXRpYyAmJiBmcmFtZWJ1ZmZlciAmJiBmcmFtZWJ1ZmZlci50aGlzRGVwLFxuICAgICAgICAgICFpc1N0YXRpYyAmJiBmcmFtZWJ1ZmZlciAmJiBmcmFtZWJ1ZmZlci5jb250ZXh0RGVwLFxuICAgICAgICAgICFpc1N0YXRpYyAmJiBmcmFtZWJ1ZmZlciAmJiBmcmFtZWJ1ZmZlci5wcm9wRGVwLFxuICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgICB2YXIgQ09OVEVYVCA9IGVudi5zaGFyZWQuY29udGV4dFxuICAgICAgICAgICAgdmFyIEJPWF9XID0gd1xuICAgICAgICAgICAgaWYgKCEoJ3dpZHRoJyBpbiBib3gpKSB7XG4gICAgICAgICAgICAgIEJPWF9XID0gc2NvcGUuZGVmKENPTlRFWFQsICcuJywgU19GUkFNRUJVRkZFUl9XSURUSCwgJy0nLCB4KVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2YXIgQk9YX0ggPSBoXG4gICAgICAgICAgICBpZiAoISgnaGVpZ2h0JyBpbiBib3gpKSB7XG4gICAgICAgICAgICAgIEJPWF9IID0gc2NvcGUuZGVmKENPTlRFWFQsICcuJywgU19GUkFNRUJVRkZFUl9IRUlHSFQsICctJywgeSlcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIFt4LCB5LCBCT1hfVywgQk9YX0hdXG4gICAgICAgICAgfSlcbiAgICAgIH0gZWxzZSBpZiAocGFyYW0gaW4gZHluYW1pY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIGR5bkJveCA9IGR5bmFtaWNPcHRpb25zW3BhcmFtXVxuICAgICAgICB2YXIgcmVzdWx0ID0gY3JlYXRlRHluYW1pY0RlY2woZHluQm94LCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciBCT1ggPSBlbnYuaW52b2tlKHNjb3BlLCBkeW5Cb3gpXG5cbiAgICAgICAgICBcblxuICAgICAgICAgIHZhciBDT05URVhUID0gZW52LnNoYXJlZC5jb250ZXh0XG4gICAgICAgICAgdmFyIEJPWF9YID0gc2NvcGUuZGVmKEJPWCwgJy54fDAnKVxuICAgICAgICAgIHZhciBCT1hfWSA9IHNjb3BlLmRlZihCT1gsICcueXwwJylcbiAgICAgICAgICB2YXIgQk9YX1cgPSBzY29wZS5kZWYoXG4gICAgICAgICAgICAnXCJ3aWR0aFwiIGluICcsIEJPWCwgJz8nLCBCT1gsICcud2lkdGh8MDonLFxuICAgICAgICAgICAgJygnLCBDT05URVhULCAnLicsIFNfRlJBTUVCVUZGRVJfV0lEVEgsICctJywgQk9YX1gsICcpJylcbiAgICAgICAgICB2YXIgQk9YX0ggPSBzY29wZS5kZWYoXG4gICAgICAgICAgICAnXCJoZWlnaHRcIiBpbiAnLCBCT1gsICc/JywgQk9YLCAnLmhlaWdodHwwOicsXG4gICAgICAgICAgICAnKCcsIENPTlRFWFQsICcuJywgU19GUkFNRUJVRkZFUl9IRUlHSFQsICctJywgQk9YX1ksICcpJylcblxuICAgICAgICAgIFxuXG4gICAgICAgICAgcmV0dXJuIFtCT1hfWCwgQk9YX1ksIEJPWF9XLCBCT1hfSF1cbiAgICAgICAgfSlcbiAgICAgICAgaWYgKGZyYW1lYnVmZmVyKSB7XG4gICAgICAgICAgcmVzdWx0LnRoaXNEZXAgPSByZXN1bHQudGhpc0RlcCB8fCBmcmFtZWJ1ZmZlci50aGlzRGVwXG4gICAgICAgICAgcmVzdWx0LmNvbnRleHREZXAgPSByZXN1bHQuY29udGV4dERlcCB8fCBmcmFtZWJ1ZmZlci5jb250ZXh0RGVwXG4gICAgICAgICAgcmVzdWx0LnByb3BEZXAgPSByZXN1bHQucHJvcERlcCB8fCBmcmFtZWJ1ZmZlci5wcm9wRGVwXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgfSBlbHNlIGlmIChmcmFtZWJ1ZmZlcikge1xuICAgICAgICByZXR1cm4gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgICAgIGZyYW1lYnVmZmVyLnRoaXNEZXAsXG4gICAgICAgICAgZnJhbWVidWZmZXIuY29udGV4dERlcCxcbiAgICAgICAgICBmcmFtZWJ1ZmZlci5wcm9wRGVwLFxuICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgICB2YXIgQ09OVEVYVCA9IGVudi5zaGFyZWQuY29udGV4dFxuICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgMCwgMCxcbiAgICAgICAgICAgICAgc2NvcGUuZGVmKENPTlRFWFQsICcuJywgU19GUkFNRUJVRkZFUl9XSURUSCksXG4gICAgICAgICAgICAgIHNjb3BlLmRlZihDT05URVhULCAnLicsIFNfRlJBTUVCVUZGRVJfSEVJR0hUKV1cbiAgICAgICAgICB9KVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIG51bGxcbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgdmlld3BvcnQgPSBwYXJzZUJveChTX1ZJRVdQT1JUKVxuXG4gICAgaWYgKHZpZXdwb3J0KSB7XG4gICAgICB2YXIgcHJldlZpZXdwb3J0ID0gdmlld3BvcnRcbiAgICAgIHZpZXdwb3J0ID0gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgICB2aWV3cG9ydC50aGlzRGVwLFxuICAgICAgICB2aWV3cG9ydC5jb250ZXh0RGVwLFxuICAgICAgICB2aWV3cG9ydC5wcm9wRGVwLFxuICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciBWSUVXUE9SVCA9IHByZXZWaWV3cG9ydC5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgICAgICB2YXIgQ09OVEVYVCA9IGVudi5zaGFyZWQuY29udGV4dFxuICAgICAgICAgIHNjb3BlLnNldChcbiAgICAgICAgICAgIENPTlRFWFQsXG4gICAgICAgICAgICAnLicgKyBTX1ZJRVdQT1JUX1dJRFRILFxuICAgICAgICAgICAgVklFV1BPUlRbMl0pXG4gICAgICAgICAgc2NvcGUuc2V0KFxuICAgICAgICAgICAgQ09OVEVYVCxcbiAgICAgICAgICAgICcuJyArIFNfVklFV1BPUlRfSEVJR0hULFxuICAgICAgICAgICAgVklFV1BPUlRbM10pXG4gICAgICAgICAgcmV0dXJuIFZJRVdQT1JUXG4gICAgICAgIH0pXG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIHZpZXdwb3J0OiB2aWV3cG9ydCxcbiAgICAgIHNjaXNzb3JfYm94OiBwYXJzZUJveChTX1NDSVNTT1JfQk9YKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlUHJvZ3JhbSAob3B0aW9ucykge1xuICAgIHZhciBzdGF0aWNPcHRpb25zID0gb3B0aW9ucy5zdGF0aWNcbiAgICB2YXIgZHluYW1pY09wdGlvbnMgPSBvcHRpb25zLmR5bmFtaWNcblxuICAgIGZ1bmN0aW9uIHBhcnNlU2hhZGVyIChuYW1lKSB7XG4gICAgICBpZiAobmFtZSBpbiBzdGF0aWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBpZCA9IHN0cmluZ1N0b3JlLmlkKHN0YXRpY09wdGlvbnNbbmFtZV0pXG4gICAgICAgIFxuICAgICAgICB2YXIgcmVzdWx0ID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcmV0dXJuIGlkXG4gICAgICAgIH0pXG4gICAgICAgIHJlc3VsdC5pZCA9IGlkXG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH0gZWxzZSBpZiAobmFtZSBpbiBkeW5hbWljT3B0aW9ucykge1xuICAgICAgICB2YXIgZHluID0gZHluYW1pY09wdGlvbnNbbmFtZV1cbiAgICAgICAgcmV0dXJuIGNyZWF0ZUR5bmFtaWNEZWNsKGR5biwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICB2YXIgc3RyID0gZW52Lmludm9rZShzY29wZSwgZHluKVxuICAgICAgICAgIHZhciBpZCA9IHNjb3BlLmRlZihlbnYuc2hhcmVkLnN0cmluZ3MsICcuaWQoJywgc3RyLCAnKScpXG4gICAgICAgICAgXG4gICAgICAgICAgcmV0dXJuIGlkXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cblxuICAgIHZhciBmcmFnID0gcGFyc2VTaGFkZXIoU19GUkFHKVxuICAgIHZhciB2ZXJ0ID0gcGFyc2VTaGFkZXIoU19WRVJUKVxuXG4gICAgdmFyIHByb2dyYW0gPSBudWxsXG4gICAgdmFyIHByb2dWYXJcbiAgICBpZiAoaXNTdGF0aWMoZnJhZykgJiYgaXNTdGF0aWModmVydCkpIHtcbiAgICAgIHByb2dyYW0gPSBzaGFkZXJTdGF0ZS5wcm9ncmFtKHZlcnQuaWQsIGZyYWcuaWQpXG4gICAgICBwcm9nVmFyID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICByZXR1cm4gZW52LmxpbmsocHJvZ3JhbSlcbiAgICAgIH0pXG4gICAgfSBlbHNlIHtcbiAgICAgIHByb2dWYXIgPSBuZXcgRGVjbGFyYXRpb24oXG4gICAgICAgIChmcmFnICYmIGZyYWcudGhpc0RlcCkgfHwgKHZlcnQgJiYgdmVydC50aGlzRGVwKSxcbiAgICAgICAgKGZyYWcgJiYgZnJhZy5jb250ZXh0RGVwKSB8fCAodmVydCAmJiB2ZXJ0LmNvbnRleHREZXApLFxuICAgICAgICAoZnJhZyAmJiBmcmFnLnByb3BEZXApIHx8ICh2ZXJ0ICYmIHZlcnQucHJvcERlcCksXG4gICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgdmFyIFNIQURFUl9TVEFURSA9IGVudi5zaGFyZWQuc2hhZGVyXG4gICAgICAgICAgdmFyIGZyYWdJZFxuICAgICAgICAgIGlmIChmcmFnKSB7XG4gICAgICAgICAgICBmcmFnSWQgPSBmcmFnLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBmcmFnSWQgPSBzY29wZS5kZWYoU0hBREVSX1NUQVRFLCAnLicsIFNfRlJBRylcbiAgICAgICAgICB9XG4gICAgICAgICAgdmFyIHZlcnRJZFxuICAgICAgICAgIGlmICh2ZXJ0KSB7XG4gICAgICAgICAgICB2ZXJ0SWQgPSB2ZXJ0LmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2ZXJ0SWQgPSBzY29wZS5kZWYoU0hBREVSX1NUQVRFLCAnLicsIFNfVkVSVClcbiAgICAgICAgICB9XG4gICAgICAgICAgdmFyIHByb2dEZWYgPSBTSEFERVJfU1RBVEUgKyAnLnByb2dyYW0oJyArIHZlcnRJZCArICcsJyArIGZyYWdJZFxuICAgICAgICAgIFxuICAgICAgICAgIHJldHVybiBzY29wZS5kZWYocHJvZ0RlZiArICcpJylcbiAgICAgICAgfSlcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgZnJhZzogZnJhZyxcbiAgICAgIHZlcnQ6IHZlcnQsXG4gICAgICBwcm9nVmFyOiBwcm9nVmFyLFxuICAgICAgcHJvZ3JhbTogcHJvZ3JhbVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlRHJhdyAob3B0aW9ucywgZW52KSB7XG4gICAgdmFyIHN0YXRpY09wdGlvbnMgPSBvcHRpb25zLnN0YXRpY1xuICAgIHZhciBkeW5hbWljT3B0aW9ucyA9IG9wdGlvbnMuZHluYW1pY1xuXG4gICAgZnVuY3Rpb24gcGFyc2VFbGVtZW50cyAoKSB7XG4gICAgICBpZiAoU19FTEVNRU5UUyBpbiBzdGF0aWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBlbGVtZW50cyA9IHN0YXRpY09wdGlvbnNbU19FTEVNRU5UU11cbiAgICAgICAgaWYgKGlzQnVmZmVyQXJncyhlbGVtZW50cykpIHtcbiAgICAgICAgICBlbGVtZW50cyA9IGVsZW1lbnRTdGF0ZS5nZXRFbGVtZW50cyhlbGVtZW50U3RhdGUuY3JlYXRlKGVsZW1lbnRzLCB0cnVlKSlcbiAgICAgICAgfSBlbHNlIGlmIChlbGVtZW50cykge1xuICAgICAgICAgIGVsZW1lbnRzID0gZWxlbWVudFN0YXRlLmdldEVsZW1lbnRzKGVsZW1lbnRzKVxuICAgICAgICAgIFxuICAgICAgICB9XG4gICAgICAgIHZhciByZXN1bHQgPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgaWYgKGVsZW1lbnRzKSB7XG4gICAgICAgICAgICB2YXIgcmVzdWx0ID0gZW52LmxpbmsoZWxlbWVudHMpXG4gICAgICAgICAgICBlbnYuRUxFTUVOVFMgPSByZXN1bHRcbiAgICAgICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgICAgICB9XG4gICAgICAgICAgZW52LkVMRU1FTlRTID0gbnVsbFxuICAgICAgICAgIHJldHVybiBudWxsXG4gICAgICAgIH0pXG4gICAgICAgIHJlc3VsdC52YWx1ZSA9IGVsZW1lbnRzXG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH0gZWxzZSBpZiAoU19FTEVNRU5UUyBpbiBkeW5hbWljT3B0aW9ucykge1xuICAgICAgICB2YXIgZHluID0gZHluYW1pY09wdGlvbnNbU19FTEVNRU5UU11cbiAgICAgICAgcmV0dXJuIGNyZWF0ZUR5bmFtaWNEZWNsKGR5biwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuXG4gICAgICAgICAgdmFyIElTX0JVRkZFUl9BUkdTID0gc2hhcmVkLmlzQnVmZmVyQXJnc1xuICAgICAgICAgIHZhciBFTEVNRU5UX1NUQVRFID0gc2hhcmVkLmVsZW1lbnRzXG5cbiAgICAgICAgICB2YXIgZWxlbWVudERlZm4gPSBlbnYuaW52b2tlKHNjb3BlLCBkeW4pXG4gICAgICAgICAgdmFyIGVsZW1lbnRzID0gc2NvcGUuZGVmKCdudWxsJylcbiAgICAgICAgICB2YXIgZWxlbWVudFN0cmVhbSA9IHNjb3BlLmRlZihJU19CVUZGRVJfQVJHUywgJygnLCBlbGVtZW50RGVmbiwgJyknKVxuXG4gICAgICAgICAgdmFyIGlmdGUgPSBlbnYuY29uZChlbGVtZW50U3RyZWFtKVxuICAgICAgICAgICAgLnRoZW4oZWxlbWVudHMsICc9JywgRUxFTUVOVF9TVEFURSwgJy5jcmVhdGVTdHJlYW0oJywgZWxlbWVudERlZm4sICcpOycpXG4gICAgICAgICAgICAuZWxzZShlbGVtZW50cywgJz0nLCBFTEVNRU5UX1NUQVRFLCAnLmdldEVsZW1lbnRzKCcsIGVsZW1lbnREZWZuLCAnKTsnKVxuXG4gICAgICAgICAgXG5cbiAgICAgICAgICBzY29wZS5lbnRyeShpZnRlKVxuICAgICAgICAgIHNjb3BlLmV4aXQoXG4gICAgICAgICAgICBlbnYuY29uZChlbGVtZW50U3RyZWFtKVxuICAgICAgICAgICAgICAudGhlbihFTEVNRU5UX1NUQVRFLCAnLmRlc3Ryb3lTdHJlYW0oJywgZWxlbWVudHMsICcpOycpKVxuXG4gICAgICAgICAgZW52LkVMRU1FTlRTID0gZWxlbWVudHNcblxuICAgICAgICAgIHJldHVybiBlbGVtZW50c1xuICAgICAgICB9KVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cblxuICAgIHZhciBlbGVtZW50cyA9IHBhcnNlRWxlbWVudHMoKVxuXG4gICAgZnVuY3Rpb24gcGFyc2VQcmltaXRpdmUgKCkge1xuICAgICAgaWYgKFNfUFJJTUlUSVZFIGluIHN0YXRpY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIHByaW1pdGl2ZSA9IHN0YXRpY09wdGlvbnNbU19QUklNSVRJVkVdXG4gICAgICAgIFxuICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHJldHVybiBwcmltVHlwZXNbcHJpbWl0aXZlXVxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIGlmIChTX1BSSU1JVElWRSBpbiBkeW5hbWljT3B0aW9ucykge1xuICAgICAgICB2YXIgZHluUHJpbWl0aXZlID0gZHluYW1pY09wdGlvbnNbU19QUklNSVRJVkVdXG4gICAgICAgIHJldHVybiBjcmVhdGVEeW5hbWljRGVjbChkeW5QcmltaXRpdmUsIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgdmFyIFBSSU1fVFlQRVMgPSBlbnYuY29uc3RhbnRzLnByaW1UeXBlc1xuICAgICAgICAgIHZhciBwcmltID0gZW52Lmludm9rZShzY29wZSwgZHluUHJpbWl0aXZlKVxuICAgICAgICAgIFxuICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoUFJJTV9UWVBFUywgJ1snLCBwcmltLCAnXScpXG4gICAgICAgIH0pXG4gICAgICB9IGVsc2UgaWYgKGVsZW1lbnRzKSB7XG4gICAgICAgIGlmIChpc1N0YXRpYyhlbGVtZW50cykpIHtcbiAgICAgICAgICBpZiAoZWxlbWVudHMudmFsdWUpIHtcbiAgICAgICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoZW52LkVMRU1FTlRTLCAnLnByaW1UeXBlJylcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIEdMX1RSSUFOR0xFU1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIG5ldyBEZWNsYXJhdGlvbihcbiAgICAgICAgICAgIGVsZW1lbnRzLnRoaXNEZXAsXG4gICAgICAgICAgICBlbGVtZW50cy5jb250ZXh0RGVwLFxuICAgICAgICAgICAgZWxlbWVudHMucHJvcERlcCxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgICAgIHZhciBlbGVtZW50cyA9IGVudi5FTEVNRU5UU1xuICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKGVsZW1lbnRzLCAnPycsIGVsZW1lbnRzLCAnLnByaW1UeXBlOicsIEdMX1RSSUFOR0xFUylcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcGFyc2VQYXJhbSAocGFyYW0sIGlzT2Zmc2V0KSB7XG4gICAgICBpZiAocGFyYW0gaW4gc3RhdGljT3B0aW9ucykge1xuICAgICAgICB2YXIgdmFsdWUgPSBzdGF0aWNPcHRpb25zW3BhcmFtXSB8IDBcbiAgICAgICAgXG4gICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgaWYgKGlzT2Zmc2V0KSB7XG4gICAgICAgICAgICBlbnYuT0ZGU0VUID0gdmFsdWVcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHZhbHVlXG4gICAgICAgIH0pXG4gICAgICB9IGVsc2UgaWYgKHBhcmFtIGluIGR5bmFtaWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBkeW5WYWx1ZSA9IGR5bmFtaWNPcHRpb25zW3BhcmFtXVxuICAgICAgICByZXR1cm4gY3JlYXRlRHluYW1pY0RlY2woZHluVmFsdWUsIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgdmFyIHJlc3VsdCA9IGVudi5pbnZva2Uoc2NvcGUsIGR5blZhbHVlKVxuICAgICAgICAgIGlmIChpc09mZnNldCkge1xuICAgICAgICAgICAgZW52Lk9GRlNFVCA9IHJlc3VsdFxuICAgICAgICAgICAgXG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSBpZiAoaXNPZmZzZXQgJiYgZWxlbWVudHMpIHtcbiAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICBlbnYuT0ZGU0VUID0gJzAnXG4gICAgICAgICAgcmV0dXJuIDBcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuXG4gICAgdmFyIE9GRlNFVCA9IHBhcnNlUGFyYW0oU19PRkZTRVQsIHRydWUpXG5cbiAgICBmdW5jdGlvbiBwYXJzZVZlcnRDb3VudCAoKSB7XG4gICAgICBpZiAoU19DT1VOVCBpbiBzdGF0aWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBjb3VudCA9IHN0YXRpY09wdGlvbnNbU19DT1VOVF0gfCAwXG4gICAgICAgIFxuICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcmV0dXJuIGNvdW50XG4gICAgICAgIH0pXG4gICAgICB9IGVsc2UgaWYgKFNfQ09VTlQgaW4gZHluYW1pY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIGR5bkNvdW50ID0gZHluYW1pY09wdGlvbnNbU19DT1VOVF1cbiAgICAgICAgcmV0dXJuIGNyZWF0ZUR5bmFtaWNEZWNsKGR5bkNvdW50LCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciByZXN1bHQgPSBlbnYuaW52b2tlKHNjb3BlLCBkeW5Db3VudClcbiAgICAgICAgICBcbiAgICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICAgIH0pXG4gICAgICB9IGVsc2UgaWYgKGVsZW1lbnRzKSB7XG4gICAgICAgIGlmIChpc1N0YXRpYyhlbGVtZW50cykpIHtcbiAgICAgICAgICBpZiAoZWxlbWVudHMpIHtcbiAgICAgICAgICAgIGlmIChPRkZTRVQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG5ldyBEZWNsYXJhdGlvbihcbiAgICAgICAgICAgICAgICBPRkZTRVQudGhpc0RlcCxcbiAgICAgICAgICAgICAgICBPRkZTRVQuY29udGV4dERlcCxcbiAgICAgICAgICAgICAgICBPRkZTRVQucHJvcERlcCxcbiAgICAgICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgICAgICAgICAgdmFyIHJlc3VsdCA9IHNjb3BlLmRlZihcbiAgICAgICAgICAgICAgICAgICAgZW52LkVMRU1FTlRTLCAnLnZlcnRDb3VudC0nLCBlbnYuT0ZGU0VUKVxuXG4gICAgICAgICAgICAgICAgICBcblxuICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoZW52LkVMRU1FTlRTLCAnLnZlcnRDb3VudCcpXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciByZXN1bHQgPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIC0xXG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHZhciB2YXJpYWJsZSA9IG5ldyBEZWNsYXJhdGlvbihcbiAgICAgICAgICAgIGVsZW1lbnRzLnRoaXNEZXAgfHwgT0ZGU0VULnRoaXNEZXAsXG4gICAgICAgICAgICBlbGVtZW50cy5jb250ZXh0RGVwIHx8IE9GRlNFVC5jb250ZXh0RGVwLFxuICAgICAgICAgICAgZWxlbWVudHMucHJvcERlcCB8fCBPRkZTRVQucHJvcERlcCxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgICAgIHZhciBlbGVtZW50cyA9IGVudi5FTEVNRU5UU1xuICAgICAgICAgICAgICBpZiAoZW52Lk9GRlNFVCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoZWxlbWVudHMsICc/JywgZWxlbWVudHMsICcudmVydENvdW50LScsXG4gICAgICAgICAgICAgICAgICBlbnYuT0ZGU0VULCAnOi0xJylcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKGVsZW1lbnRzLCAnPycsIGVsZW1lbnRzLCAnLnZlcnRDb3VudDotMScpXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIFxuICAgICAgICAgIHJldHVybiB2YXJpYWJsZVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBlbGVtZW50czogZWxlbWVudHMsXG4gICAgICBwcmltaXRpdmU6IHBhcnNlUHJpbWl0aXZlKCksXG4gICAgICBjb3VudDogcGFyc2VWZXJ0Q291bnQoKSxcbiAgICAgIGluc3RhbmNlczogcGFyc2VQYXJhbShTX0lOU1RBTkNFUywgZmFsc2UpLFxuICAgICAgb2Zmc2V0OiBPRkZTRVRcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZUdMU3RhdGUgKG9wdGlvbnMsIGVudikge1xuICAgIHZhciBzdGF0aWNPcHRpb25zID0gb3B0aW9ucy5zdGF0aWNcbiAgICB2YXIgZHluYW1pY09wdGlvbnMgPSBvcHRpb25zLmR5bmFtaWNcblxuICAgIHZhciBTVEFURSA9IHt9XG5cbiAgICBHTF9TVEFURV9OQU1FUy5mb3JFYWNoKGZ1bmN0aW9uIChwcm9wKSB7XG4gICAgICB2YXIgcGFyYW0gPSBwcm9wTmFtZShwcm9wKVxuXG4gICAgICBmdW5jdGlvbiBwYXJzZVBhcmFtIChwYXJzZVN0YXRpYywgcGFyc2VEeW5hbWljKSB7XG4gICAgICAgIGlmIChwcm9wIGluIHN0YXRpY09wdGlvbnMpIHtcbiAgICAgICAgICB2YXIgdmFsdWUgPSBwYXJzZVN0YXRpYyhzdGF0aWNPcHRpb25zW3Byb3BdKVxuICAgICAgICAgIFNUQVRFW3BhcmFtXSA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHZhbHVlXG4gICAgICAgICAgfSlcbiAgICAgICAgfSBlbHNlIGlmIChwcm9wIGluIGR5bmFtaWNPcHRpb25zKSB7XG4gICAgICAgICAgdmFyIGR5biA9IGR5bmFtaWNPcHRpb25zW3Byb3BdXG4gICAgICAgICAgU1RBVEVbcGFyYW1dID0gY3JlYXRlRHluYW1pY0RlY2woZHluLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgICAgcmV0dXJuIHBhcnNlRHluYW1pYyhlbnYsIHNjb3BlLCBlbnYuaW52b2tlKHNjb3BlLCBkeW4pKVxuICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgc3dpdGNoIChwcm9wKSB7XG4gICAgICAgIGNhc2UgU19DVUxMX0VOQUJMRTpcbiAgICAgICAgY2FzZSBTX0JMRU5EX0VOQUJMRTpcbiAgICAgICAgY2FzZSBTX0RJVEhFUjpcbiAgICAgICAgY2FzZSBTX1NURU5DSUxfRU5BQkxFOlxuICAgICAgICBjYXNlIFNfREVQVEhfRU5BQkxFOlxuICAgICAgICBjYXNlIFNfU0NJU1NPUl9FTkFCTEU6XG4gICAgICAgIGNhc2UgU19QT0xZR09OX09GRlNFVF9FTkFCTEU6XG4gICAgICAgIGNhc2UgU19TQU1QTEVfQUxQSEE6XG4gICAgICAgIGNhc2UgU19TQU1QTEVfRU5BQkxFOlxuICAgICAgICBjYXNlIFNfREVQVEhfTUFTSzpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gdmFsdWVcbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX0RFUFRIX0ZVTkM6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBjb21wYXJlRnVuY3NbdmFsdWVdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIHZhciBDT01QQVJFX0ZVTkNTID0gZW52LmNvbnN0YW50cy5jb21wYXJlRnVuY3NcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoQ09NUEFSRV9GVU5DUywgJ1snLCB2YWx1ZSwgJ10nKVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfREVQVEhfUkFOR0U6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBcblxuICAgICAgICAgICAgICB2YXIgWl9ORUFSID0gc2NvcGUuZGVmKCcrJywgdmFsdWUsICdbMF0nKVxuICAgICAgICAgICAgICB2YXIgWl9GQVIgPSBzY29wZS5kZWYoJysnLCB2YWx1ZSwgJ1sxXScpXG4gICAgICAgICAgICAgIHJldHVybiBbWl9ORUFSLCBaX0ZBUl1cbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX0JMRU5EX0ZVTkM6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHZhciBzcmNSR0IgPSAoJ3NyY1JHQicgaW4gdmFsdWUgPyB2YWx1ZS5zcmNSR0IgOiB2YWx1ZS5zcmMpXG4gICAgICAgICAgICAgIHZhciBzcmNBbHBoYSA9ICgnc3JjQWxwaGEnIGluIHZhbHVlID8gdmFsdWUuc3JjQWxwaGEgOiB2YWx1ZS5zcmMpXG4gICAgICAgICAgICAgIHZhciBkc3RSR0IgPSAoJ2RzdFJHQicgaW4gdmFsdWUgPyB2YWx1ZS5kc3RSR0IgOiB2YWx1ZS5kc3QpXG4gICAgICAgICAgICAgIHZhciBkc3RBbHBoYSA9ICgnZHN0QWxwaGEnIGluIHZhbHVlID8gdmFsdWUuZHN0QWxwaGEgOiB2YWx1ZS5kc3QpXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICAgICAgYmxlbmRGdW5jc1tzcmNSR0JdLFxuICAgICAgICAgICAgICAgIGJsZW5kRnVuY3NbZHN0UkdCXSxcbiAgICAgICAgICAgICAgICBibGVuZEZ1bmNzW3NyY0FscGhhXSxcbiAgICAgICAgICAgICAgICBibGVuZEZ1bmNzW2RzdEFscGhhXVxuICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIHZhciBCTEVORF9GVU5DUyA9IGVudi5jb25zdGFudHMuYmxlbmRGdW5jc1xuXG4gICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgIGZ1bmN0aW9uIHJlYWQgKHByZWZpeCwgc3VmZml4KSB7XG4gICAgICAgICAgICAgICAgdmFyIGZ1bmMgPSBzY29wZS5kZWYoXG4gICAgICAgICAgICAgICAgICAnXCInLCBwcmVmaXgsIHN1ZmZpeCwgJ1wiIGluICcsIHZhbHVlLFxuICAgICAgICAgICAgICAgICAgJz8nLCB2YWx1ZSwgJy4nLCBwcmVmaXgsIHN1ZmZpeCxcbiAgICAgICAgICAgICAgICAgICc6JywgdmFsdWUsICcuJywgcHJlZml4KVxuXG4gICAgICAgICAgICAgICAgXG5cbiAgICAgICAgICAgICAgICByZXR1cm4gZnVuY1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgdmFyIHNyY1JHQiA9IHJlYWQoJ3NyYycsICdSR0InKVxuICAgICAgICAgICAgICB2YXIgZHN0UkdCID0gcmVhZCgnZHN0JywgJ1JHQicpXG5cbiAgICAgICAgICAgICAgXG5cbiAgICAgICAgICAgICAgdmFyIFNSQ19SR0IgPSBzY29wZS5kZWYoQkxFTkRfRlVOQ1MsICdbJywgc3JjUkdCLCAnXScpXG4gICAgICAgICAgICAgIHZhciBTUkNfQUxQSEEgPSBzY29wZS5kZWYoQkxFTkRfRlVOQ1MsICdbJywgcmVhZCgnc3JjJywgJ0FscGhhJyksICddJylcbiAgICAgICAgICAgICAgdmFyIERTVF9SR0IgPSBzY29wZS5kZWYoQkxFTkRfRlVOQ1MsICdbJywgZHN0UkdCLCAnXScpXG4gICAgICAgICAgICAgIHZhciBEU1RfQUxQSEEgPSBzY29wZS5kZWYoQkxFTkRfRlVOQ1MsICdbJywgcmVhZCgnZHN0JywgJ0FscGhhJyksICddJylcblxuICAgICAgICAgICAgICByZXR1cm4gW1NSQ19SR0IsIERTVF9SR0IsIFNSQ19BTFBIQSwgRFNUX0FMUEhBXVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfQkxFTkRfRVFVQVRJT046XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgICAgICAgYmxlbmRFcXVhdGlvbnNbdmFsdWVdLFxuICAgICAgICAgICAgICAgICAgYmxlbmRFcXVhdGlvbnNbdmFsdWVdXG4gICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgICAgICAgYmxlbmRFcXVhdGlvbnNbdmFsdWUucmdiXSxcbiAgICAgICAgICAgICAgICAgIGJsZW5kRXF1YXRpb25zW3ZhbHVlLmFscGhhXVxuICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICB2YXIgQkxFTkRfRVFVQVRJT05TID0gZW52LmNvbnN0YW50cy5ibGVuZEVxdWF0aW9uc1xuXG4gICAgICAgICAgICAgIHZhciBSR0IgPSBzY29wZS5kZWYoKVxuICAgICAgICAgICAgICB2YXIgQUxQSEEgPSBzY29wZS5kZWYoKVxuXG4gICAgICAgICAgICAgIHZhciBpZnRlID0gZW52LmNvbmQoJ3R5cGVvZiAnLCB2YWx1ZSwgJz09PVwic3RyaW5nXCInKVxuXG4gICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgIGlmdGUudGhlbihcbiAgICAgICAgICAgICAgICBSR0IsICc9JywgQUxQSEEsICc9JywgQkxFTkRfRVFVQVRJT05TLCAnWycsIHZhbHVlLCAnXTsnKVxuICAgICAgICAgICAgICBpZnRlLmVsc2UoXG4gICAgICAgICAgICAgICAgUkdCLCAnPScsIEJMRU5EX0VRVUFUSU9OUywgJ1snLCB2YWx1ZSwgJy5yZ2JdOycsXG4gICAgICAgICAgICAgICAgQUxQSEEsICc9JywgQkxFTkRfRVFVQVRJT05TLCAnWycsIHZhbHVlLCAnLmFscGhhXTsnKVxuXG4gICAgICAgICAgICAgIHNjb3BlKGlmdGUpXG5cbiAgICAgICAgICAgICAgcmV0dXJuIFtSR0IsIEFMUEhBXVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfQkxFTkRfQ09MT1I6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBsb29wKDQsIGZ1bmN0aW9uIChpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICt2YWx1ZVtpXVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIGxvb3AoNCwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKCcrJywgdmFsdWUsICdbJywgaSwgJ10nKVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfU1RFTkNJTF9NQVNLOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gdmFsdWUgfCAwXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKHZhbHVlLCAnfDAnKVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfU1RFTkNJTF9GVU5DOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICB2YXIgY21wID0gdmFsdWUuY21wIHx8ICdrZWVwJ1xuICAgICAgICAgICAgICB2YXIgcmVmID0gdmFsdWUucmVmIHx8IDBcbiAgICAgICAgICAgICAgdmFyIG1hc2sgPSAnbWFzaycgaW4gdmFsdWUgPyB2YWx1ZS5tYXNrIDogLTFcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgICBjb21wYXJlRnVuY3NbY21wXSxcbiAgICAgICAgICAgICAgICByZWYsXG4gICAgICAgICAgICAgICAgbWFza1xuICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIHZhciBDT01QQVJFX0ZVTkNTID0gZW52LmNvbnN0YW50cy5jb21wYXJlRnVuY3NcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHZhciBjbXAgPSBzY29wZS5kZWYoXG4gICAgICAgICAgICAgICAgJ1wiY21wXCIgaW4gJywgdmFsdWUsXG4gICAgICAgICAgICAgICAgJz8nLCBDT01QQVJFX0ZVTkNTLCAnWycsIHZhbHVlLCAnLmNtcF0nLFxuICAgICAgICAgICAgICAgICc6JywgR0xfS0VFUClcbiAgICAgICAgICAgICAgdmFyIHJlZiA9IHNjb3BlLmRlZih2YWx1ZSwgJy5yZWZ8MCcpXG4gICAgICAgICAgICAgIHZhciBtYXNrID0gc2NvcGUuZGVmKFxuICAgICAgICAgICAgICAgICdcIm1hc2tcIiBpbiAnLCB2YWx1ZSxcbiAgICAgICAgICAgICAgICAnPycsIHZhbHVlLCAnLm1hc2t8MDotMScpXG4gICAgICAgICAgICAgIHJldHVybiBbY21wLCByZWYsIG1hc2tdXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19TVEVOQ0lMX09QRlJPTlQ6XG4gICAgICAgIGNhc2UgU19TVEVOQ0lMX09QQkFDSzpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgdmFyIGZhaWwgPSB2YWx1ZS5mYWlsIHx8ICdrZWVwJ1xuICAgICAgICAgICAgICB2YXIgemZhaWwgPSB2YWx1ZS56ZmFpbCB8fCAna2VlcCdcbiAgICAgICAgICAgICAgdmFyIHpwYXNzID0gdmFsdWUuenBhc3MgfHwgJ2tlZXAnXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICAgICAgcHJvcCA9PT0gU19TVEVOQ0lMX09QQkFDSyA/IEdMX0JBQ0sgOiBHTF9GUk9OVCxcbiAgICAgICAgICAgICAgICBzdGVuY2lsT3BzW2ZhaWxdLFxuICAgICAgICAgICAgICAgIHN0ZW5jaWxPcHNbemZhaWxdLFxuICAgICAgICAgICAgICAgIHN0ZW5jaWxPcHNbenBhc3NdXG4gICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgdmFyIFNURU5DSUxfT1BTID0gZW52LmNvbnN0YW50cy5zdGVuY2lsT3BzXG5cbiAgICAgICAgICAgICAgXG5cbiAgICAgICAgICAgICAgZnVuY3Rpb24gcmVhZCAobmFtZSkge1xuICAgICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihcbiAgICAgICAgICAgICAgICAgICdcIicsIG5hbWUsICdcIiBpbiAnLCB2YWx1ZSxcbiAgICAgICAgICAgICAgICAgICc/JywgU1RFTkNJTF9PUFMsICdbJywgdmFsdWUsICcuJywgbmFtZSwgJ106JyxcbiAgICAgICAgICAgICAgICAgIEdMX0tFRVApXG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgICAgIHByb3AgPT09IFNfU1RFTkNJTF9PUEJBQ0sgPyBHTF9CQUNLIDogR0xfRlJPTlQsXG4gICAgICAgICAgICAgICAgcmVhZCgnZmFpbCcpLFxuICAgICAgICAgICAgICAgIHJlYWQoJ3pmYWlsJyksXG4gICAgICAgICAgICAgICAgcmVhZCgnenBhc3MnKVxuICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19QT0xZR09OX09GRlNFVF9PRkZTRVQ6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHZhciBmYWN0b3IgPSB2YWx1ZS5mYWN0b3IgfCAwXG4gICAgICAgICAgICAgIHZhciB1bml0cyA9IHZhbHVlLnVuaXRzIHwgMFxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBbZmFjdG9yLCB1bml0c11cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgXG5cbiAgICAgICAgICAgICAgdmFyIEZBQ1RPUiA9IHNjb3BlLmRlZih2YWx1ZSwgJy5mYWN0b3J8MCcpXG4gICAgICAgICAgICAgIHZhciBVTklUUyA9IHNjb3BlLmRlZih2YWx1ZSwgJy51bml0c3wwJylcblxuICAgICAgICAgICAgICByZXR1cm4gW0ZBQ1RPUiwgVU5JVFNdXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19DVUxMX0ZBQ0U6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgdmFyIGZhY2UgPSAwXG4gICAgICAgICAgICAgIGlmICh2YWx1ZSA9PT0gJ2Zyb250Jykge1xuICAgICAgICAgICAgICAgIGZhY2UgPSBHTF9GUk9OVFxuICAgICAgICAgICAgICB9IGVsc2UgaWYgKHZhbHVlID09PSAnYmFjaycpIHtcbiAgICAgICAgICAgICAgICBmYWNlID0gR0xfQkFDS1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gZmFjZVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZih2YWx1ZSwgJz09PVwiZnJvbnRcIj8nLCBHTF9GUk9OVCwgJzonLCBHTF9CQUNLKVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfTElORV9XSURUSDpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfRlJPTlRfRkFDRTpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIG9yaWVudGF0aW9uVHlwZVt2YWx1ZV1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYodmFsdWUgKyAnPT09XCJjd1wiPycgKyBHTF9DVyArICc6JyArIEdMX0NDVylcbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX0NPTE9SX01BU0s6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZS5tYXAoZnVuY3Rpb24gKHYpIHsgcmV0dXJuICEhdiB9KVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIGxvb3AoNCwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gJyEhJyArIHZhbHVlICsgJ1snICsgaSArICddJ1xuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfU0FNUExFX0NPVkVSQUdFOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICB2YXIgc2FtcGxlVmFsdWUgPSAndmFsdWUnIGluIHZhbHVlID8gdmFsdWUudmFsdWUgOiAxXG4gICAgICAgICAgICAgIHZhciBzYW1wbGVJbnZlcnQgPSAhIXZhbHVlLmludmVydFxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIFtzYW1wbGVWYWx1ZSwgc2FtcGxlSW52ZXJ0XVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgdmFyIFZBTFVFID0gc2NvcGUuZGVmKFxuICAgICAgICAgICAgICAgICdcInZhbHVlXCIgaW4gJywgdmFsdWUsICc/KycsIHZhbHVlLCAnLnZhbHVlOjEnKVxuICAgICAgICAgICAgICB2YXIgSU5WRVJUID0gc2NvcGUuZGVmKCchIScsIHZhbHVlLCAnLmludmVydCcpXG4gICAgICAgICAgICAgIHJldHVybiBbVkFMVUUsIElOVkVSVF1cbiAgICAgICAgICAgIH0pXG4gICAgICB9XG4gICAgfSlcblxuICAgIHJldHVybiBTVEFURVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VVbmlmb3JtcyAodW5pZm9ybXMsIGVudikge1xuICAgIHZhciBzdGF0aWNVbmlmb3JtcyA9IHVuaWZvcm1zLnN0YXRpY1xuICAgIHZhciBkeW5hbWljVW5pZm9ybXMgPSB1bmlmb3Jtcy5keW5hbWljXG5cbiAgICB2YXIgVU5JRk9STVMgPSB7fVxuXG4gICAgT2JqZWN0LmtleXMoc3RhdGljVW5pZm9ybXMpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHZhciB2YWx1ZSA9IHN0YXRpY1VuaWZvcm1zW25hbWVdXG4gICAgICB2YXIgcmVzdWx0XG4gICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyB8fFxuICAgICAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgIHJlc3VsdCA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHJldHVybiB2YWx1ZVxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgdmFsdWUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgdmFyIHJlZ2xUeXBlID0gdmFsdWUuX3JlZ2xUeXBlXG4gICAgICAgIGlmIChyZWdsVHlwZSA9PT0gJ3RleHR1cmUyZCcgfHxcbiAgICAgICAgICAgIHJlZ2xUeXBlID09PSAndGV4dHVyZUN1YmUnKSB7XG4gICAgICAgICAgcmVzdWx0ID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52KSB7XG4gICAgICAgICAgICByZXR1cm4gZW52LmxpbmsodmFsdWUpXG4gICAgICAgICAgfSlcbiAgICAgICAgfSBlbHNlIGlmIChyZWdsVHlwZSA9PT0gJ2ZyYW1lYnVmZmVyJyB8fFxuICAgICAgICAgICAgICAgICAgIHJlZ2xUeXBlID09PSAnZnJhbWVidWZmZXJDdWJlJykge1xuICAgICAgICAgIFxuICAgICAgICAgIHJlc3VsdCA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudikge1xuICAgICAgICAgICAgcmV0dXJuIGVudi5saW5rKHZhbHVlLmNvbG9yWzBdKVxuICAgICAgICAgIH0pXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoaXNBcnJheUxpa2UodmFsdWUpKSB7XG4gICAgICAgIHJlc3VsdCA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudikge1xuICAgICAgICAgIHZhciBJVEVNID0gZW52Lmdsb2JhbC5kZWYoJ1snLFxuICAgICAgICAgICAgbG9vcCh2YWx1ZS5sZW5ndGgsIGZ1bmN0aW9uIChpKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gdmFsdWVbaV1cbiAgICAgICAgICAgIH0pLCAnXScpXG4gICAgICAgICAgcmV0dXJuIElURU1cbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIFxuICAgICAgfVxuICAgICAgcmVzdWx0LnZhbHVlID0gdmFsdWVcbiAgICAgIFVOSUZPUk1TW25hbWVdID0gcmVzdWx0XG4gICAgfSlcblxuICAgIE9iamVjdC5rZXlzKGR5bmFtaWNVbmlmb3JtcykuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICB2YXIgZHluID0gZHluYW1pY1VuaWZvcm1zW2tleV1cbiAgICAgIFVOSUZPUk1TW2tleV0gPSBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgIHJldHVybiBlbnYuaW52b2tlKHNjb3BlLCBkeW4pXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICByZXR1cm4gVU5JRk9STVNcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlQXR0cmlidXRlcyAoYXR0cmlidXRlcywgZW52KSB7XG4gICAgdmFyIHN0YXRpY0F0dHJpYnV0ZXMgPSBhdHRyaWJ1dGVzLnN0YXRpY1xuICAgIHZhciBkeW5hbWljQXR0cmlidXRlcyA9IGF0dHJpYnV0ZXMuZHluYW1pY1xuXG4gICAgdmFyIGF0dHJpYnV0ZURlZnMgPSB7fVxuXG4gICAgT2JqZWN0LmtleXMoc3RhdGljQXR0cmlidXRlcykuZm9yRWFjaChmdW5jdGlvbiAoYXR0cmlidXRlKSB7XG4gICAgICB2YXIgdmFsdWUgPSBzdGF0aWNBdHRyaWJ1dGVzW2F0dHJpYnV0ZV1cbiAgICAgIHZhciBpZCA9IHN0cmluZ1N0b3JlLmlkKGF0dHJpYnV0ZSlcblxuICAgICAgdmFyIHJlY29yZCA9IG5ldyBBdHRyaWJ1dGVSZWNvcmQoKVxuICAgICAgaWYgKGlzQnVmZmVyQXJncyh2YWx1ZSkpIHtcbiAgICAgICAgcmVjb3JkLnN0YXRlID0gQVRUUklCX1NUQVRFX1BPSU5URVJcbiAgICAgICAgcmVjb3JkLmJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmdldEJ1ZmZlcihcbiAgICAgICAgICBidWZmZXJTdGF0ZS5jcmVhdGUodmFsdWUsIEdMX0FSUkFZX0JVRkZFUiwgZmFsc2UsIHRydWUpKVxuICAgICAgICByZWNvcmQudHlwZSA9IDBcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBidWZmZXIgPSBidWZmZXJTdGF0ZS5nZXRCdWZmZXIodmFsdWUpXG4gICAgICAgIGlmIChidWZmZXIpIHtcbiAgICAgICAgICByZWNvcmQuc3RhdGUgPSBBVFRSSUJfU1RBVEVfUE9JTlRFUlxuICAgICAgICAgIHJlY29yZC5idWZmZXIgPSBidWZmZXJcbiAgICAgICAgICByZWNvcmQudHlwZSA9IDBcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBcbiAgICAgICAgICBpZiAodmFsdWUuY29uc3RhbnQpIHtcbiAgICAgICAgICAgIHZhciBjb25zdGFudCA9IHZhbHVlLmNvbnN0YW50XG4gICAgICAgICAgICByZWNvcmQuYnVmZmVyID0gJ251bGwnXG4gICAgICAgICAgICByZWNvcmQuc3RhdGUgPSBBVFRSSUJfU1RBVEVfQ09OU1RBTlRcbiAgICAgICAgICAgIGlmICh0eXBlb2YgY29uc3RhbnQgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICAgIHJlY29yZC54ID0gY29uc3RhbnRcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBDVVRFX0NPTVBPTkVOVFMuZm9yRWFjaChmdW5jdGlvbiAoYywgaSkge1xuICAgICAgICAgICAgICAgIGlmIChpIDwgY29uc3RhbnQubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICByZWNvcmRbY10gPSBjb25zdGFudFtpXVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKGlzQnVmZmVyQXJncyh2YWx1ZS5idWZmZXIpKSB7XG4gICAgICAgICAgICAgIGJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmdldEJ1ZmZlcihcbiAgICAgICAgICAgICAgICBidWZmZXJTdGF0ZS5jcmVhdGUodmFsdWUuYnVmZmVyLCBHTF9BUlJBWV9CVUZGRVIsIGZhbHNlLCB0cnVlKSlcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmdldEJ1ZmZlcih2YWx1ZS5idWZmZXIpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcblxuICAgICAgICAgICAgdmFyIG9mZnNldCA9IHZhbHVlLm9mZnNldCB8IDBcbiAgICAgICAgICAgIFxuXG4gICAgICAgICAgICB2YXIgc3RyaWRlID0gdmFsdWUuc3RyaWRlIHwgMFxuICAgICAgICAgICAgXG5cbiAgICAgICAgICAgIHZhciBzaXplID0gdmFsdWUuc2l6ZSB8IDBcbiAgICAgICAgICAgIFxuXG4gICAgICAgICAgICB2YXIgbm9ybWFsaXplZCA9ICEhdmFsdWUubm9ybWFsaXplZFxuXG4gICAgICAgICAgICB2YXIgdHlwZSA9IDBcbiAgICAgICAgICAgIGlmICgndHlwZScgaW4gdmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHR5cGUgPSBnbFR5cGVzW3ZhbHVlLnR5cGVdXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBkaXZpc29yID0gdmFsdWUuZGl2aXNvciB8IDBcbiAgICAgICAgICAgIGlmICgnZGl2aXNvcicgaW4gdmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBcblxuICAgICAgICAgICAgcmVjb3JkLmJ1ZmZlciA9IGJ1ZmZlclxuICAgICAgICAgICAgcmVjb3JkLnN0YXRlID0gQVRUUklCX1NUQVRFX1BPSU5URVJcbiAgICAgICAgICAgIHJlY29yZC5zaXplID0gc2l6ZVxuICAgICAgICAgICAgcmVjb3JkLm5vcm1hbGl6ZWQgPSBub3JtYWxpemVkXG4gICAgICAgICAgICByZWNvcmQudHlwZSA9IHR5cGUgfHwgYnVmZmVyLmR0eXBlXG4gICAgICAgICAgICByZWNvcmQub2Zmc2V0ID0gb2Zmc2V0XG4gICAgICAgICAgICByZWNvcmQuc3RyaWRlID0gc3RyaWRlXG4gICAgICAgICAgICByZWNvcmQuZGl2aXNvciA9IGRpdmlzb3JcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgYXR0cmlidXRlRGVmc1thdHRyaWJ1dGVdID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICB2YXIgY2FjaGUgPSBlbnYuYXR0cmliQ2FjaGVcbiAgICAgICAgaWYgKGlkIGluIGNhY2hlKSB7XG4gICAgICAgICAgcmV0dXJuIGNhY2hlW2lkXVxuICAgICAgICB9XG4gICAgICAgIHZhciByZXN1bHQgPSB7XG4gICAgICAgICAgaXNTdHJlYW06IGZhbHNlXG4gICAgICAgIH1cbiAgICAgICAgT2JqZWN0LmtleXMocmVjb3JkKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgICByZXN1bHRba2V5XSA9IHJlY29yZFtrZXldXG4gICAgICAgIH0pXG4gICAgICAgIGlmIChyZWNvcmQuYnVmZmVyKSB7XG4gICAgICAgICAgcmVzdWx0LmJ1ZmZlciA9IGVudi5saW5rKHJlY29yZC5idWZmZXIpXG4gICAgICAgICAgcmVzdWx0LnR5cGUgPSByZXN1bHQudHlwZSB8fCAocmVzdWx0LmJ1ZmZlciArICcuZHR5cGUnKVxuICAgICAgICB9XG4gICAgICAgIGNhY2hlW2lkXSA9IHJlc3VsdFxuICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBPYmplY3Qua2V5cyhkeW5hbWljQXR0cmlidXRlcykuZm9yRWFjaChmdW5jdGlvbiAoYXR0cmlidXRlKSB7XG4gICAgICB2YXIgZHluID0gZHluYW1pY0F0dHJpYnV0ZXNbYXR0cmlidXRlXVxuXG4gICAgICBmdW5jdGlvbiBhcHBlbmRBdHRyaWJ1dGVDb2RlIChlbnYsIGJsb2NrKSB7XG4gICAgICAgIHZhciBWQUxVRSA9IGVudi5pbnZva2UoYmxvY2ssIGR5bilcblxuICAgICAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuXG4gICAgICAgIHZhciBJU19CVUZGRVJfQVJHUyA9IHNoYXJlZC5pc0J1ZmZlckFyZ3NcbiAgICAgICAgdmFyIEJVRkZFUl9TVEFURSA9IHNoYXJlZC5idWZmZXJcblxuICAgICAgICAvLyBQZXJmb3JtIHZhbGlkYXRpb24gb24gYXR0cmlidXRlXG4gICAgICAgIFxuXG4gICAgICAgIC8vIGFsbG9jYXRlIG5hbWVzIGZvciByZXN1bHRcbiAgICAgICAgdmFyIHJlc3VsdCA9IHtcbiAgICAgICAgICBpc1N0cmVhbTogYmxvY2suZGVmKGZhbHNlKVxuICAgICAgICB9XG4gICAgICAgIHZhciBkZWZhdWx0UmVjb3JkID0gbmV3IEF0dHJpYnV0ZVJlY29yZCgpXG4gICAgICAgIGRlZmF1bHRSZWNvcmQuc3RhdGUgPSBBVFRSSUJfU1RBVEVfUE9JTlRFUlxuICAgICAgICBPYmplY3Qua2V5cyhkZWZhdWx0UmVjb3JkKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgICByZXN1bHRba2V5XSA9IGJsb2NrLmRlZignJyArIGRlZmF1bHRSZWNvcmRba2V5XSlcbiAgICAgICAgfSlcblxuICAgICAgICB2YXIgQlVGRkVSID0gcmVzdWx0LmJ1ZmZlclxuICAgICAgICB2YXIgVFlQRSA9IHJlc3VsdC50eXBlXG4gICAgICAgIGJsb2NrKFxuICAgICAgICAgICdpZignLCBJU19CVUZGRVJfQVJHUywgJygnLCBWQUxVRSwgJykpeycsXG4gICAgICAgICAgcmVzdWx0LmlzU3RyZWFtLCAnPXRydWU7JyxcbiAgICAgICAgICBCVUZGRVIsICc9JywgQlVGRkVSX1NUQVRFLCAnLmNyZWF0ZVN0cmVhbSgnLCBHTF9BUlJBWV9CVUZGRVIsICcsJywgVkFMVUUsICcpOycsXG4gICAgICAgICAgVFlQRSwgJz0nLCBCVUZGRVIsICcuZHR5cGU7JyxcbiAgICAgICAgICAnfWVsc2V7JyxcbiAgICAgICAgICBCVUZGRVIsICc9JywgQlVGRkVSX1NUQVRFLCAnLmdldEJ1ZmZlcignLCBWQUxVRSwgJyk7JyxcbiAgICAgICAgICAnaWYoJywgQlVGRkVSLCAnKXsnLFxuICAgICAgICAgIFRZUEUsICc9JywgQlVGRkVSLCAnLmR0eXBlOycsXG4gICAgICAgICAgJ31lbHNlIGlmKFwiY29uc3RhbnRcIiBpbiAnLCBWQUxVRSwgJyl7JyxcbiAgICAgICAgICByZXN1bHQuc3RhdGUsICc9JywgQVRUUklCX1NUQVRFX0NPTlNUQU5ULCAnOycsXG4gICAgICAgICAgJ2lmKHR5cGVvZiAnICsgVkFMVUUgKyAnLmNvbnN0YW50ID09PSBcIm51bWJlclwiKXsnLFxuICAgICAgICAgIHJlc3VsdFtDVVRFX0NPTVBPTkVOVFNbMF1dLCAnPScsIFZBTFVFLCAnLmNvbnN0YW50OycsXG4gICAgICAgICAgQ1VURV9DT01QT05FTlRTLnNsaWNlKDEpLm1hcChmdW5jdGlvbiAobikge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdFtuXVxuICAgICAgICAgIH0pLmpvaW4oJz0nKSwgJz0wOycsXG4gICAgICAgICAgJ31lbHNleycsXG4gICAgICAgICAgQ1VURV9DT01QT05FTlRTLm1hcChmdW5jdGlvbiAobmFtZSwgaSkge1xuICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgcmVzdWx0W25hbWVdICsgJz0nICsgVkFMVUUgKyAnLmNvbnN0YW50Lmxlbmd0aD49JyArIGkgK1xuICAgICAgICAgICAgICAnPycgKyBWQUxVRSArICcuY29uc3RhbnRbJyArIGkgKyAnXTowOydcbiAgICAgICAgICAgIClcbiAgICAgICAgICB9KS5qb2luKCcnKSxcbiAgICAgICAgICAnfX1lbHNleycsXG4gICAgICAgICAgJ2lmKCcsIElTX0JVRkZFUl9BUkdTLCAnKCcsIFZBTFVFLCAnLmJ1ZmZlcikpeycsXG4gICAgICAgICAgQlVGRkVSLCAnPScsIEJVRkZFUl9TVEFURSwgJy5jcmVhdGVTdHJlYW0oJywgR0xfQVJSQVlfQlVGRkVSLCAnLCcsIFZBTFVFLCAnLmJ1ZmZlcik7JyxcbiAgICAgICAgICAnfWVsc2V7JyxcbiAgICAgICAgICBCVUZGRVIsICc9JywgQlVGRkVSX1NUQVRFLCAnLmdldEJ1ZmZlcignLCBWQUxVRSwgJy5idWZmZXIpOycsXG4gICAgICAgICAgJ30nLFxuICAgICAgICAgIFRZUEUsICc9XCJ0eXBlXCIgaW4gJywgVkFMVUUsICc/JyxcbiAgICAgICAgICBzaGFyZWQuZ2xUeXBlcywgJ1snLCBWQUxVRSwgJy50eXBlXTonLCBCVUZGRVIsICcuZHR5cGU7JyxcbiAgICAgICAgICByZXN1bHQubm9ybWFsaXplZCwgJz0hIScsIFZBTFVFLCAnLm5vcm1hbGl6ZWQ7JylcbiAgICAgICAgZnVuY3Rpb24gZW1pdFJlYWRSZWNvcmQgKG5hbWUpIHtcbiAgICAgICAgICBibG9jayhyZXN1bHRbbmFtZV0sICc9JywgVkFMVUUsICcuJywgbmFtZSwgJ3wwOycpXG4gICAgICAgIH1cbiAgICAgICAgZW1pdFJlYWRSZWNvcmQoJ3NpemUnKVxuICAgICAgICBlbWl0UmVhZFJlY29yZCgnb2Zmc2V0JylcbiAgICAgICAgZW1pdFJlYWRSZWNvcmQoJ3N0cmlkZScpXG4gICAgICAgIGVtaXRSZWFkUmVjb3JkKCdkaXZpc29yJylcblxuICAgICAgICBibG9jaygnfX0nKVxuXG4gICAgICAgIGJsb2NrLmV4aXQoXG4gICAgICAgICAgJ2lmKCcsIHJlc3VsdC5pc1N0cmVhbSwgJyl7JyxcbiAgICAgICAgICBCVUZGRVJfU1RBVEUsICcuZGVzdHJveVN0cmVhbSgnLCBCVUZGRVIsICcpOycsXG4gICAgICAgICAgJ30nKVxuXG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH1cblxuICAgICAgYXR0cmlidXRlRGVmc1thdHRyaWJ1dGVdID0gY3JlYXRlRHluYW1pY0RlY2woZHluLCBhcHBlbmRBdHRyaWJ1dGVDb2RlKVxuICAgIH0pXG5cbiAgICByZXR1cm4gYXR0cmlidXRlRGVmc1xuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VDb250ZXh0IChjb250ZXh0KSB7XG4gICAgdmFyIHN0YXRpY0NvbnRleHQgPSBjb250ZXh0LnN0YXRpY1xuICAgIHZhciBkeW5hbWljQ29udGV4dCA9IGNvbnRleHQuZHluYW1pY1xuICAgIHZhciByZXN1bHQgPSB7fVxuXG4gICAgT2JqZWN0LmtleXMoc3RhdGljQ29udGV4dCkuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgdmFyIHZhbHVlID0gc3RhdGljQ29udGV4dFtuYW1lXVxuICAgICAgcmVzdWx0W25hbWVdID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyB8fCB0eXBlb2YgdmFsdWUgPT09ICdib29sZWFuJykge1xuICAgICAgICAgIHJldHVybiAnJyArIHZhbHVlXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIGVudi5saW5rKHZhbHVlKVxuICAgICAgICB9XG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBPYmplY3Qua2V5cyhkeW5hbWljQ29udGV4dCkuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgdmFyIGR5biA9IGR5bmFtaWNDb250ZXh0W25hbWVdXG4gICAgICByZXN1bHRbbmFtZV0gPSBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgIHJldHVybiBlbnYuaW52b2tlKHNjb3BlLCBkeW4pXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICByZXR1cm4gcmVzdWx0XG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZUFyZ3VtZW50cyAob3B0aW9ucywgYXR0cmlidXRlcywgdW5pZm9ybXMsIGNvbnRleHQsIGVudikge1xuICAgIHZhciBzdGF0aWNPcHRpb25zID0gb3B0aW9ucy5zdGF0aWNcbiAgICB2YXIgZHluYW1pY09wdGlvbnMgPSBvcHRpb25zLmR5bmFtaWNcblxuICAgIFxuXG4gICAgdmFyIGZyYW1lYnVmZmVyID0gcGFyc2VGcmFtZWJ1ZmZlcihvcHRpb25zLCBlbnYpXG4gICAgdmFyIHZpZXdwb3J0QW5kU2Npc3NvciA9IHBhcnNlVmlld3BvcnRTY2lzc29yKG9wdGlvbnMsIGZyYW1lYnVmZmVyLCBlbnYpXG4gICAgdmFyIGRyYXcgPSBwYXJzZURyYXcob3B0aW9ucywgZW52KVxuICAgIHZhciBzdGF0ZSA9IHBhcnNlR0xTdGF0ZShvcHRpb25zLCBlbnYpXG4gICAgdmFyIHNoYWRlciA9IHBhcnNlUHJvZ3JhbShvcHRpb25zLCBlbnYpXG5cbiAgICBmdW5jdGlvbiBjb3B5Qm94IChuYW1lKSB7XG4gICAgICB2YXIgZGVmbiA9IHZpZXdwb3J0QW5kU2Npc3NvcltuYW1lXVxuICAgICAgaWYgKGRlZm4pIHtcbiAgICAgICAgc3RhdGVbbmFtZV0gPSBkZWZuXG4gICAgICB9XG4gICAgfVxuICAgIGNvcHlCb3goU19WSUVXUE9SVClcbiAgICBjb3B5Qm94KHByb3BOYW1lKFNfU0NJU1NPUl9CT1gpKVxuXG4gICAgdmFyIGRpcnR5ID0gT2JqZWN0LmtleXMoc3RhdGUpLmxlbmd0aCA+IDBcblxuICAgIHZhciByZXN1bHQgPSB7XG4gICAgICBmcmFtZWJ1ZmZlcjogZnJhbWVidWZmZXIsXG4gICAgICBkcmF3OiBkcmF3LFxuICAgICAgc2hhZGVyOiBzaGFkZXIsXG4gICAgICBzdGF0ZTogc3RhdGUsXG4gICAgICBkaXJ0eTogZGlydHlcbiAgICB9XG5cbiAgICByZXN1bHQucHJvZmlsZSA9IHBhcnNlUHJvZmlsZShvcHRpb25zLCBlbnYpXG4gICAgcmVzdWx0LnVuaWZvcm1zID0gcGFyc2VVbmlmb3Jtcyh1bmlmb3JtcywgZW52KVxuICAgIHJlc3VsdC5hdHRyaWJ1dGVzID0gcGFyc2VBdHRyaWJ1dGVzKGF0dHJpYnV0ZXMsIGVudilcbiAgICByZXN1bHQuY29udGV4dCA9IHBhcnNlQ29udGV4dChjb250ZXh0LCBlbnYpXG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBDT01NT04gVVBEQVRFIEZVTkNUSU9OU1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIGVtaXRDb250ZXh0IChlbnYsIHNjb3BlLCBjb250ZXh0KSB7XG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcbiAgICB2YXIgQ09OVEVYVCA9IHNoYXJlZC5jb250ZXh0XG5cbiAgICB2YXIgY29udGV4dEVudGVyID0gZW52LnNjb3BlKClcblxuICAgIE9iamVjdC5rZXlzKGNvbnRleHQpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHNjb3BlLnNhdmUoQ09OVEVYVCwgJy4nICsgbmFtZSlcbiAgICAgIHZhciBkZWZuID0gY29udGV4dFtuYW1lXVxuICAgICAgY29udGV4dEVudGVyKENPTlRFWFQsICcuJywgbmFtZSwgJz0nLCBkZWZuLmFwcGVuZChlbnYsIHNjb3BlKSwgJzsnKVxuICAgIH0pXG5cbiAgICBzY29wZShjb250ZXh0RW50ZXIpXG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIENPTU1PTiBEUkFXSU5HIEZVTkNUSU9OU1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIGVtaXRQb2xsRnJhbWVidWZmZXIgKGVudiwgc2NvcGUsIGZyYW1lYnVmZmVyLCBza2lwQ2hlY2spIHtcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuXG4gICAgdmFyIEdMID0gc2hhcmVkLmdsXG4gICAgdmFyIEZSQU1FQlVGRkVSX1NUQVRFID0gc2hhcmVkLmZyYW1lYnVmZmVyXG4gICAgdmFyIEVYVF9EUkFXX0JVRkZFUlNcbiAgICBpZiAoZXh0RHJhd0J1ZmZlcnMpIHtcbiAgICAgIEVYVF9EUkFXX0JVRkZFUlMgPSBzY29wZS5kZWYoc2hhcmVkLmV4dGVuc2lvbnMsICcud2ViZ2xfZHJhd19idWZmZXJzJylcbiAgICB9XG5cbiAgICB2YXIgY29uc3RhbnRzID0gZW52LmNvbnN0YW50c1xuXG4gICAgdmFyIERSQVdfQlVGRkVSUyA9IGNvbnN0YW50cy5kcmF3QnVmZmVyXG4gICAgdmFyIEJBQ0tfQlVGRkVSID0gY29uc3RhbnRzLmJhY2tCdWZmZXJcblxuICAgIHZhciBORVhUXG4gICAgaWYgKGZyYW1lYnVmZmVyKSB7XG4gICAgICBORVhUID0gZnJhbWVidWZmZXIuYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgfSBlbHNlIHtcbiAgICAgIE5FWFQgPSBzY29wZS5kZWYoRlJBTUVCVUZGRVJfU1RBVEUsICcubmV4dCcpXG4gICAgfVxuXG4gICAgaWYgKCFza2lwQ2hlY2spIHtcbiAgICAgIHNjb3BlKCdpZignLCBORVhULCAnIT09JywgRlJBTUVCVUZGRVJfU1RBVEUsICcuY3VyKXsnKVxuICAgIH1cbiAgICBzY29wZShcbiAgICAgICdpZignLCBORVhULCAnKXsnLFxuICAgICAgR0wsICcuYmluZEZyYW1lYnVmZmVyKCcsIEdMX0ZSQU1FQlVGRkVSLCAnLCcsIE5FWFQsICcuZnJhbWVidWZmZXIpOycpXG4gICAgaWYgKGV4dERyYXdCdWZmZXJzKSB7XG4gICAgICBzY29wZShFWFRfRFJBV19CVUZGRVJTLCAnLmRyYXdCdWZmZXJzV0VCR0woJyxcbiAgICAgICAgRFJBV19CVUZGRVJTLCAnWycsIE5FWFQsICcuY29sb3JBdHRhY2htZW50cy5sZW5ndGhdKTsnKVxuICAgIH1cbiAgICBzY29wZSgnfWVsc2V7JyxcbiAgICAgIEdMLCAnLmJpbmRGcmFtZWJ1ZmZlcignLCBHTF9GUkFNRUJVRkZFUiwgJyxudWxsKTsnKVxuICAgIGlmIChleHREcmF3QnVmZmVycykge1xuICAgICAgc2NvcGUoRVhUX0RSQVdfQlVGRkVSUywgJy5kcmF3QnVmZmVyc1dFQkdMKCcsIEJBQ0tfQlVGRkVSLCAnKTsnKVxuICAgIH1cbiAgICBzY29wZShcbiAgICAgICd9JyxcbiAgICAgIEZSQU1FQlVGRkVSX1NUQVRFLCAnLmN1cj0nLCBORVhULCAnOycpXG4gICAgaWYgKCFza2lwQ2hlY2spIHtcbiAgICAgIHNjb3BlKCd9JylcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBlbWl0UG9sbFN0YXRlIChlbnYsIHNjb3BlLCBhcmdzKSB7XG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcblxuICAgIHZhciBHTCA9IHNoYXJlZC5nbFxuXG4gICAgdmFyIENVUlJFTlRfVkFSUyA9IGVudi5jdXJyZW50XG4gICAgdmFyIE5FWFRfVkFSUyA9IGVudi5uZXh0XG4gICAgdmFyIENVUlJFTlRfU1RBVEUgPSBzaGFyZWQuY3VycmVudFxuICAgIHZhciBORVhUX1NUQVRFID0gc2hhcmVkLm5leHRcblxuICAgIHZhciBibG9jayA9IGVudi5jb25kKENVUlJFTlRfU1RBVEUsICcuZGlydHknKVxuXG4gICAgR0xfU1RBVEVfTkFNRVMuZm9yRWFjaChmdW5jdGlvbiAocHJvcCkge1xuICAgICAgdmFyIHBhcmFtID0gcHJvcE5hbWUocHJvcClcbiAgICAgIGlmIChwYXJhbSBpbiBhcmdzLnN0YXRlKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuXG4gICAgICB2YXIgTkVYVCwgQ1VSUkVOVFxuICAgICAgaWYgKHBhcmFtIGluIE5FWFRfVkFSUykge1xuICAgICAgICBORVhUID0gTkVYVF9WQVJTW3BhcmFtXVxuICAgICAgICBDVVJSRU5UID0gQ1VSUkVOVF9WQVJTW3BhcmFtXVxuICAgICAgICB2YXIgcGFydHMgPSBsb29wKGN1cnJlbnRTdGF0ZVtwYXJhbV0ubGVuZ3RoLCBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgIHJldHVybiBibG9jay5kZWYoTkVYVCwgJ1snLCBpLCAnXScpXG4gICAgICAgIH0pXG4gICAgICAgIGJsb2NrKGVudi5jb25kKHBhcnRzLm1hcChmdW5jdGlvbiAocCwgaSkge1xuICAgICAgICAgIHJldHVybiBwICsgJyE9PScgKyBDVVJSRU5UICsgJ1snICsgaSArICddJ1xuICAgICAgICB9KS5qb2luKCd8fCcpKVxuICAgICAgICAgIC50aGVuKFxuICAgICAgICAgICAgR0wsICcuJywgR0xfVkFSSUFCTEVTW3BhcmFtXSwgJygnLCBwYXJ0cywgJyk7JyxcbiAgICAgICAgICAgIHBhcnRzLm1hcChmdW5jdGlvbiAocCwgaSkge1xuICAgICAgICAgICAgICByZXR1cm4gQ1VSUkVOVCArICdbJyArIGkgKyAnXT0nICsgcFxuICAgICAgICAgICAgfSkuam9pbignOycpLCAnOycpKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgTkVYVCA9IGJsb2NrLmRlZihORVhUX1NUQVRFLCAnLicsIHBhcmFtKVxuICAgICAgICB2YXIgaWZ0ZSA9IGVudi5jb25kKE5FWFQsICchPT0nLCBDVVJSRU5UX1NUQVRFLCAnLicsIHBhcmFtKVxuICAgICAgICBibG9jayhpZnRlKVxuICAgICAgICBpZiAocGFyYW0gaW4gR0xfRkxBR1MpIHtcbiAgICAgICAgICBpZnRlKFxuICAgICAgICAgICAgZW52LmNvbmQoTkVYVClcbiAgICAgICAgICAgICAgICAudGhlbihHTCwgJy5lbmFibGUoJywgR0xfRkxBR1NbcGFyYW1dLCAnKTsnKVxuICAgICAgICAgICAgICAgIC5lbHNlKEdMLCAnLmRpc2FibGUoJywgR0xfRkxBR1NbcGFyYW1dLCAnKTsnKSxcbiAgICAgICAgICAgIENVUlJFTlRfU1RBVEUsICcuJywgcGFyYW0sICc9JywgTkVYVCwgJzsnKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmdGUoXG4gICAgICAgICAgICBHTCwgJy4nLCBHTF9WQVJJQUJMRVNbcGFyYW1dLCAnKCcsIE5FWFQsICcpOycsXG4gICAgICAgICAgICBDVVJSRU5UX1NUQVRFLCAnLicsIHBhcmFtLCAnPScsIE5FWFQsICc7JylcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pXG4gICAgaWYgKE9iamVjdC5rZXlzKGFyZ3Muc3RhdGUpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgYmxvY2soQ1VSUkVOVF9TVEFURSwgJy5kaXJ0eT1mYWxzZTsnKVxuICAgIH1cbiAgICBzY29wZShibG9jaylcbiAgfVxuXG4gIGZ1bmN0aW9uIGVtaXRTZXRPcHRpb25zIChlbnYsIHNjb3BlLCBvcHRpb25zLCBmaWx0ZXIpIHtcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuICAgIHZhciBDVVJSRU5UX1ZBUlMgPSBlbnYuY3VycmVudFxuICAgIHZhciBDVVJSRU5UX1NUQVRFID0gc2hhcmVkLmN1cnJlbnRcbiAgICB2YXIgR0wgPSBzaGFyZWQuZ2xcbiAgICBzb3J0U3RhdGUoT2JqZWN0LmtleXMob3B0aW9ucykpLmZvckVhY2goZnVuY3Rpb24gKHBhcmFtKSB7XG4gICAgICB2YXIgZGVmbiA9IG9wdGlvbnNbcGFyYW1dXG4gICAgICBpZiAoZmlsdGVyICYmICFmaWx0ZXIoZGVmbikpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICB2YXIgdmFyaWFibGUgPSBkZWZuLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgaWYgKEdMX0ZMQUdTW3BhcmFtXSkge1xuICAgICAgICB2YXIgZmxhZyA9IEdMX0ZMQUdTW3BhcmFtXVxuICAgICAgICBpZiAoaXNTdGF0aWMoZGVmbikpIHtcbiAgICAgICAgICBpZiAodmFyaWFibGUpIHtcbiAgICAgICAgICAgIHNjb3BlKEdMLCAnLmVuYWJsZSgnLCBmbGFnLCAnKTsnKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzY29wZShHTCwgJy5kaXNhYmxlKCcsIGZsYWcsICcpOycpXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHNjb3BlKGVudi5jb25kKHZhcmlhYmxlKVxuICAgICAgICAgICAgLnRoZW4oR0wsICcuZW5hYmxlKCcsIGZsYWcsICcpOycpXG4gICAgICAgICAgICAuZWxzZShHTCwgJy5kaXNhYmxlKCcsIGZsYWcsICcpOycpKVxuICAgICAgICB9XG4gICAgICAgIHNjb3BlKENVUlJFTlRfU1RBVEUsICcuJywgcGFyYW0sICc9JywgdmFyaWFibGUsICc7JylcbiAgICAgIH0gZWxzZSBpZiAoaXNBcnJheUxpa2UodmFyaWFibGUpKSB7XG4gICAgICAgIHZhciBDVVJSRU5UID0gQ1VSUkVOVF9WQVJTW3BhcmFtXVxuICAgICAgICBzY29wZShcbiAgICAgICAgICBHTCwgJy4nLCBHTF9WQVJJQUJMRVNbcGFyYW1dLCAnKCcsIHZhcmlhYmxlLCAnKTsnLFxuICAgICAgICAgIHZhcmlhYmxlLm1hcChmdW5jdGlvbiAodiwgaSkge1xuICAgICAgICAgICAgcmV0dXJuIENVUlJFTlQgKyAnWycgKyBpICsgJ109JyArIHZcbiAgICAgICAgICB9KS5qb2luKCc7JyksICc7JylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNjb3BlKFxuICAgICAgICAgIEdMLCAnLicsIEdMX1ZBUklBQkxFU1twYXJhbV0sICcoJywgdmFyaWFibGUsICcpOycsXG4gICAgICAgICAgQ1VSUkVOVF9TVEFURSwgJy4nLCBwYXJhbSwgJz0nLCB2YXJpYWJsZSwgJzsnKVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiBpbmplY3RFeHRlbnNpb25zIChlbnYsIHNjb3BlKSB7XG4gICAgaWYgKGV4dEluc3RhbmNpbmcpIHtcbiAgICAgIGVudi5pbnN0YW5jaW5nID0gc2NvcGUuZGVmKFxuICAgICAgICBlbnYuc2hhcmVkLmV4dGVuc2lvbnMsICcuYW5nbGVfaW5zdGFuY2VkX2FycmF5cycpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZW1pdFByb2ZpbGUgKGVudiwgc2NvcGUsIGFyZ3MsIHVzZVNjb3BlLCBpbmNyZW1lbnRDb3VudGVyKSB7XG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcbiAgICB2YXIgU1RBVFMgPSBlbnYuc3RhdHNcbiAgICB2YXIgQ1VSUkVOVF9TVEFURSA9IHNoYXJlZC5jdXJyZW50XG4gICAgdmFyIFRJTUVSID0gc2hhcmVkLnRpbWVyXG4gICAgdmFyIHByb2ZpbGVBcmcgPSBhcmdzLnByb2ZpbGVcblxuICAgIGZ1bmN0aW9uIHBlcmZDb3VudGVyICgpIHtcbiAgICAgIGlmICh0eXBlb2YgcGVyZm9ybWFuY2UgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHJldHVybiAnRGF0ZS5ub3coKSdcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiAncGVyZm9ybWFuY2Uubm93KCknXG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFyIENQVV9TVEFSVCwgUVVFUllfQ09VTlRFUlxuICAgIGZ1bmN0aW9uIGVtaXRQcm9maWxlU3RhcnQgKGJsb2NrKSB7XG4gICAgICBDUFVfU1RBUlQgPSBzY29wZS5kZWYoKVxuICAgICAgYmxvY2soQ1BVX1NUQVJULCAnPScsIHBlcmZDb3VudGVyKCksICc7JylcbiAgICAgIGlmICh0eXBlb2YgaW5jcmVtZW50Q291bnRlciA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgYmxvY2soU1RBVFMsICcuY291bnQrPScsIGluY3JlbWVudENvdW50ZXIsICc7JylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGJsb2NrKFNUQVRTLCAnLmNvdW50Kys7JylcbiAgICAgIH1cbiAgICAgIGlmICh0aW1lcikge1xuICAgICAgICBpZiAodXNlU2NvcGUpIHtcbiAgICAgICAgICBRVUVSWV9DT1VOVEVSID0gc2NvcGUuZGVmKClcbiAgICAgICAgICBibG9jayhRVUVSWV9DT1VOVEVSLCAnPScsIFRJTUVSLCAnLmdldE51bVBlbmRpbmdRdWVyaWVzKCk7JylcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBibG9jayhUSU1FUiwgJy5iZWdpblF1ZXJ5KCcsIFNUQVRTLCAnKTsnKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZW1pdFByb2ZpbGVFbmQgKGJsb2NrKSB7XG4gICAgICBibG9jayhTVEFUUywgJy5jcHVUaW1lKz0nLCBwZXJmQ291bnRlcigpLCAnLScsIENQVV9TVEFSVCwgJzsnKVxuICAgICAgaWYgKHRpbWVyKSB7XG4gICAgICAgIGlmICh1c2VTY29wZSkge1xuICAgICAgICAgIGJsb2NrKFRJTUVSLCAnLnB1c2hTY29wZVN0YXRzKCcsXG4gICAgICAgICAgICBRVUVSWV9DT1VOVEVSLCAnLCcsXG4gICAgICAgICAgICBUSU1FUiwgJy5nZXROdW1QZW5kaW5nUXVlcmllcygpLCcsXG4gICAgICAgICAgICBTVEFUUywgJyk7JylcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBibG9jayhUSU1FUiwgJy5lbmRRdWVyeSgpOycpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzY29wZVByb2ZpbGUgKHZhbHVlKSB7XG4gICAgICB2YXIgcHJldiA9IHNjb3BlLmRlZihDVVJSRU5UX1NUQVRFLCAnLnByb2ZpbGUnKVxuICAgICAgc2NvcGUoQ1VSUkVOVF9TVEFURSwgJy5wcm9maWxlPScsIHZhbHVlLCAnOycpXG4gICAgICBzY29wZS5leGl0KENVUlJFTlRfU1RBVEUsICcucHJvZmlsZT0nLCBwcmV2LCAnOycpXG4gICAgfVxuXG4gICAgdmFyIFVTRV9QUk9GSUxFXG4gICAgaWYgKHByb2ZpbGVBcmcpIHtcbiAgICAgIGlmIChpc1N0YXRpYyhwcm9maWxlQXJnKSkge1xuICAgICAgICBpZiAocHJvZmlsZUFyZy5lbmFibGUpIHtcbiAgICAgICAgICBlbWl0UHJvZmlsZVN0YXJ0KHNjb3BlKVxuICAgICAgICAgIGVtaXRQcm9maWxlRW5kKHNjb3BlLmV4aXQpXG4gICAgICAgICAgc2NvcGVQcm9maWxlKCd0cnVlJylcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzY29wZVByb2ZpbGUoJ2ZhbHNlJylcbiAgICAgICAgfVxuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIFVTRV9QUk9GSUxFID0gcHJvZmlsZUFyZy5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgIHNjb3BlUHJvZmlsZShVU0VfUFJPRklMRSlcbiAgICB9IGVsc2Uge1xuICAgICAgVVNFX1BST0ZJTEUgPSBzY29wZS5kZWYoQ1VSUkVOVF9TVEFURSwgJy5wcm9maWxlJylcbiAgICB9XG5cbiAgICB2YXIgc3RhcnQgPSBlbnYuYmxvY2soKVxuICAgIGVtaXRQcm9maWxlU3RhcnQoc3RhcnQpXG4gICAgc2NvcGUoJ2lmKCcsIFVTRV9QUk9GSUxFLCAnKXsnLCBzdGFydCwgJ30nKVxuICAgIHZhciBlbmQgPSBlbnYuYmxvY2soKVxuICAgIGVtaXRQcm9maWxlRW5kKGVuZClcbiAgICBzY29wZS5leGl0KCdpZignLCBVU0VfUFJPRklMRSwgJyl7JywgZW5kLCAnfScpXG4gIH1cblxuICBmdW5jdGlvbiBlbWl0QXR0cmlidXRlcyAoZW52LCBzY29wZSwgYXJncywgYXR0cmlidXRlcywgZmlsdGVyKSB7XG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcblxuICAgIGZ1bmN0aW9uIHR5cGVMZW5ndGggKHgpIHtcbiAgICAgIHN3aXRjaCAoeCkge1xuICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzI6XG4gICAgICAgIGNhc2UgR0xfSU5UX1ZFQzI6XG4gICAgICAgIGNhc2UgR0xfQk9PTF9WRUMyOlxuICAgICAgICAgIHJldHVybiAyXG4gICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDMzpcbiAgICAgICAgY2FzZSBHTF9JTlRfVkVDMzpcbiAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzM6XG4gICAgICAgICAgcmV0dXJuIDNcbiAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUM0OlxuICAgICAgICBjYXNlIEdMX0lOVF9WRUM0OlxuICAgICAgICBjYXNlIEdMX0JPT0xfVkVDNDpcbiAgICAgICAgICByZXR1cm4gNFxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIHJldHVybiAxXG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZW1pdEJpbmRBdHRyaWJ1dGUgKEFUVFJJQlVURSwgc2l6ZSwgcmVjb3JkKSB7XG4gICAgICB2YXIgR0wgPSBzaGFyZWQuZ2xcblxuICAgICAgdmFyIExPQ0FUSU9OID0gc2NvcGUuZGVmKEFUVFJJQlVURSwgJy5sb2NhdGlvbicpXG4gICAgICB2YXIgQklORElORyA9IHNjb3BlLmRlZihzaGFyZWQuYXR0cmlidXRlcywgJ1snLCBMT0NBVElPTiwgJ10nKVxuXG4gICAgICB2YXIgU1RBVEUgPSByZWNvcmQuc3RhdGVcbiAgICAgIHZhciBCVUZGRVIgPSByZWNvcmQuYnVmZmVyXG4gICAgICB2YXIgQ09OU1RfQ09NUE9ORU5UUyA9IFtcbiAgICAgICAgcmVjb3JkLngsXG4gICAgICAgIHJlY29yZC55LFxuICAgICAgICByZWNvcmQueixcbiAgICAgICAgcmVjb3JkLndcbiAgICAgIF1cblxuICAgICAgdmFyIENPTU1PTl9LRVlTID0gW1xuICAgICAgICAnYnVmZmVyJyxcbiAgICAgICAgJ25vcm1hbGl6ZWQnLFxuICAgICAgICAnb2Zmc2V0JyxcbiAgICAgICAgJ3N0cmlkZSdcbiAgICAgIF1cblxuICAgICAgZnVuY3Rpb24gZW1pdEJ1ZmZlciAoKSB7XG4gICAgICAgIHNjb3BlKFxuICAgICAgICAgICdpZighJywgQklORElORywgJy5idWZmZXIpeycsXG4gICAgICAgICAgR0wsICcuZW5hYmxlVmVydGV4QXR0cmliQXJyYXkoJywgTE9DQVRJT04sICcpO30nKVxuXG4gICAgICAgIHZhciBUWVBFID0gcmVjb3JkLnR5cGVcbiAgICAgICAgdmFyIFNJWkVcbiAgICAgICAgaWYgKCFyZWNvcmQuc2l6ZSkge1xuICAgICAgICAgIFNJWkUgPSBzaXplXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgU0laRSA9IHNjb3BlLmRlZihyZWNvcmQuc2l6ZSwgJ3x8Jywgc2l6ZSlcbiAgICAgICAgfVxuXG4gICAgICAgIHNjb3BlKCdpZignLFxuICAgICAgICAgIEJJTkRJTkcsICcudHlwZSE9PScsIFRZUEUsICd8fCcsXG4gICAgICAgICAgQklORElORywgJy5zaXplIT09JywgU0laRSwgJ3x8JyxcbiAgICAgICAgICBDT01NT05fS0VZUy5tYXAoZnVuY3Rpb24gKGtleSkge1xuICAgICAgICAgICAgcmV0dXJuIEJJTkRJTkcgKyAnLicgKyBrZXkgKyAnIT09JyArIHJlY29yZFtrZXldXG4gICAgICAgICAgfSkuam9pbignfHwnKSxcbiAgICAgICAgICAnKXsnLFxuICAgICAgICAgIEdMLCAnLmJpbmRCdWZmZXIoJywgR0xfQVJSQVlfQlVGRkVSLCAnLCcsIEJVRkZFUiwgJy5idWZmZXIpOycsXG4gICAgICAgICAgR0wsICcudmVydGV4QXR0cmliUG9pbnRlcignLCBbXG4gICAgICAgICAgICBMT0NBVElPTixcbiAgICAgICAgICAgIFNJWkUsXG4gICAgICAgICAgICBUWVBFLFxuICAgICAgICAgICAgcmVjb3JkLm5vcm1hbGl6ZWQsXG4gICAgICAgICAgICByZWNvcmQuc3RyaWRlLFxuICAgICAgICAgICAgcmVjb3JkLm9mZnNldFxuICAgICAgICAgIF0sICcpOycsXG4gICAgICAgICAgQklORElORywgJy50eXBlPScsIFRZUEUsICc7JyxcbiAgICAgICAgICBCSU5ESU5HLCAnLnNpemU9JywgU0laRSwgJzsnLFxuICAgICAgICAgIENPTU1PTl9LRVlTLm1hcChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgICAgICByZXR1cm4gQklORElORyArICcuJyArIGtleSArICc9JyArIHJlY29yZFtrZXldICsgJzsnXG4gICAgICAgICAgfSkuam9pbignJyksXG4gICAgICAgICAgJ30nKVxuXG4gICAgICAgIGlmIChleHRJbnN0YW5jaW5nKSB7XG4gICAgICAgICAgdmFyIERJVklTT1IgPSByZWNvcmQuZGl2aXNvclxuICAgICAgICAgIHNjb3BlKFxuICAgICAgICAgICAgJ2lmKCcsIEJJTkRJTkcsICcuZGl2aXNvciE9PScsIERJVklTT1IsICcpeycsXG4gICAgICAgICAgICBlbnYuaW5zdGFuY2luZywgJy52ZXJ0ZXhBdHRyaWJEaXZpc29yQU5HTEUoJywgW0xPQ0FUSU9OLCBESVZJU09SXSwgJyk7JyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcuZGl2aXNvcj0nLCBESVZJU09SLCAnO30nKVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGZ1bmN0aW9uIGVtaXRDb25zdGFudCAoKSB7XG4gICAgICAgIHNjb3BlKFxuICAgICAgICAgICdpZignLCBCSU5ESU5HLCAnLmJ1ZmZlcil7JyxcbiAgICAgICAgICBHTCwgJy5kaXNhYmxlVmVydGV4QXR0cmliQXJyYXkoJywgTE9DQVRJT04sICcpOycsXG4gICAgICAgICAgJ31pZignLCBDVVRFX0NPTVBPTkVOVFMubWFwKGZ1bmN0aW9uIChjLCBpKSB7XG4gICAgICAgICAgICByZXR1cm4gQklORElORyArICcuJyArIGMgKyAnIT09JyArIENPTlNUX0NPTVBPTkVOVFNbaV1cbiAgICAgICAgICB9KS5qb2luKCd8fCcpLCAnKXsnLFxuICAgICAgICAgIEdMLCAnLnZlcnRleEF0dHJpYjRmKCcsIExPQ0FUSU9OLCAnLCcsIENPTlNUX0NPTVBPTkVOVFMsICcpOycsXG4gICAgICAgICAgQ1VURV9DT01QT05FTlRTLm1hcChmdW5jdGlvbiAoYywgaSkge1xuICAgICAgICAgICAgcmV0dXJuIEJJTkRJTkcgKyAnLicgKyBjICsgJz0nICsgQ09OU1RfQ09NUE9ORU5UU1tpXSArICc7J1xuICAgICAgICAgIH0pLmpvaW4oJycpLFxuICAgICAgICAgICd9JylcbiAgICAgIH1cblxuICAgICAgaWYgKFNUQVRFID09PSBBVFRSSUJfU1RBVEVfUE9JTlRFUikge1xuICAgICAgICBlbWl0QnVmZmVyKClcbiAgICAgIH0gZWxzZSBpZiAoU1RBVEUgPT09IEFUVFJJQl9TVEFURV9DT05TVEFOVCkge1xuICAgICAgICBlbWl0Q29uc3RhbnQoKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2NvcGUoJ2lmKCcsIFNUQVRFLCAnPT09JywgQVRUUklCX1NUQVRFX1BPSU5URVIsICcpeycpXG4gICAgICAgIGVtaXRCdWZmZXIoKVxuICAgICAgICBzY29wZSgnfWVsc2V7JylcbiAgICAgICAgZW1pdENvbnN0YW50KClcbiAgICAgICAgc2NvcGUoJ30nKVxuICAgICAgfVxuICAgIH1cblxuICAgIGF0dHJpYnV0ZXMuZm9yRWFjaChmdW5jdGlvbiAoYXR0cmlidXRlKSB7XG4gICAgICB2YXIgbmFtZSA9IGF0dHJpYnV0ZS5uYW1lXG4gICAgICB2YXIgYXJnID0gYXJncy5hdHRyaWJ1dGVzW25hbWVdXG4gICAgICB2YXIgcmVjb3JkXG4gICAgICBpZiAoYXJnKSB7XG4gICAgICAgIGlmICghZmlsdGVyKGFyZykpIHtcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuICAgICAgICByZWNvcmQgPSBhcmcuYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoIWZpbHRlcihTQ09QRV9ERUNMKSkge1xuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG4gICAgICAgIHZhciBzY29wZUF0dHJpYiA9IGVudi5zY29wZUF0dHJpYihuYW1lKVxuICAgICAgICBcbiAgICAgICAgcmVjb3JkID0ge31cbiAgICAgICAgT2JqZWN0LmtleXMobmV3IEF0dHJpYnV0ZVJlY29yZCgpKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgICByZWNvcmRba2V5XSA9IHNjb3BlLmRlZihzY29wZUF0dHJpYiwgJy4nLCBrZXkpXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgICBlbWl0QmluZEF0dHJpYnV0ZShcbiAgICAgICAgZW52LmxpbmsoYXR0cmlidXRlKSwgdHlwZUxlbmd0aChhdHRyaWJ1dGUuaW5mby50eXBlKSwgcmVjb3JkKVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiBlbWl0VW5pZm9ybXMgKGVudiwgc2NvcGUsIGFyZ3MsIHVuaWZvcm1zLCBmaWx0ZXIpIHtcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuICAgIHZhciBHTCA9IHNoYXJlZC5nbFxuXG4gICAgdmFyIGluZml4XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB1bmlmb3Jtcy5sZW5ndGg7ICsraSkge1xuICAgICAgdmFyIHVuaWZvcm0gPSB1bmlmb3Jtc1tpXVxuICAgICAgdmFyIG5hbWUgPSB1bmlmb3JtLm5hbWVcbiAgICAgIHZhciB0eXBlID0gdW5pZm9ybS5pbmZvLnR5cGVcbiAgICAgIHZhciBhcmcgPSBhcmdzLnVuaWZvcm1zW25hbWVdXG4gICAgICB2YXIgVU5JRk9STSA9IGVudi5saW5rKHVuaWZvcm0pXG4gICAgICB2YXIgTE9DQVRJT04gPSBVTklGT1JNICsgJy5sb2NhdGlvbidcblxuICAgICAgdmFyIFZBTFVFXG4gICAgICBpZiAoYXJnKSB7XG4gICAgICAgIGlmICghZmlsdGVyKGFyZykpIHtcbiAgICAgICAgICBjb250aW51ZVxuICAgICAgICB9XG4gICAgICAgIGlmIChpc1N0YXRpYyhhcmcpKSB7XG4gICAgICAgICAgdmFyIHZhbHVlID0gYXJnLnZhbHVlXG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKHR5cGUgPT09IEdMX1NBTVBMRVJfMkQgfHwgdHlwZSA9PT0gR0xfU0FNUExFUl9DVUJFKSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHZhciBURVhfVkFMVUUgPSBlbnYubGluayh2YWx1ZS5fdGV4dHVyZSB8fCB2YWx1ZS5jb2xvclswXS5fdGV4dHVyZSlcbiAgICAgICAgICAgIHNjb3BlKEdMLCAnLnVuaWZvcm0xaSgnLCBMT0NBVElPTiwgJywnLCBURVhfVkFMVUUgKyAnLmJpbmQoKSk7JylcbiAgICAgICAgICAgIHNjb3BlLmV4aXQoVEVYX1ZBTFVFLCAnLnVuYmluZCgpOycpXG4gICAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICAgIHR5cGUgPT09IEdMX0ZMT0FUX01BVDIgfHxcbiAgICAgICAgICAgIHR5cGUgPT09IEdMX0ZMT0FUX01BVDMgfHxcbiAgICAgICAgICAgIHR5cGUgPT09IEdMX0ZMT0FUX01BVDQpIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdmFyIE1BVF9WQUxVRSA9IGVudi5nbG9iYWwuZGVmKCduZXcgRmxvYXQzMkFycmF5KFsnICtcbiAgICAgICAgICAgICAgQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwodmFsdWUpICsgJ10pJylcbiAgICAgICAgICAgIHZhciBkaW0gPSAyXG4gICAgICAgICAgICBpZiAodHlwZSA9PT0gR0xfRkxPQVRfTUFUMykge1xuICAgICAgICAgICAgICBkaW0gPSAzXG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGUgPT09IEdMX0ZMT0FUX01BVDQpIHtcbiAgICAgICAgICAgICAgZGltID0gNFxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc2NvcGUoXG4gICAgICAgICAgICAgIEdMLCAnLnVuaWZvcm1NYXRyaXgnLCBkaW0sICdmdignLFxuICAgICAgICAgICAgICBMT0NBVElPTiwgJyxmYWxzZSwnLCBNQVRfVkFMVUUsICcpOycpXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICAgICAgICBjYXNlIEdMX0ZMT0FUOlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGluZml4ID0gJzFmJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDMjpcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICcyZidcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzM6XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaW5maXggPSAnM2YnXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUM0OlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGluZml4ID0gJzRmJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfQk9PTDpcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICcxaSdcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0lOVDpcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICcxaSdcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0JPT0xfVkVDMjpcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICcyaSdcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0lOVF9WRUMyOlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGluZml4ID0gJzJpJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfQk9PTF9WRUMzOlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGluZml4ID0gJzNpJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfSU5UX1ZFQzM6XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaW5maXggPSAnM2knXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzQ6XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaW5maXggPSAnNGknXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9JTlRfVkVDNDpcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICc0aSdcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc2NvcGUoR0wsICcudW5pZm9ybScsIGluZml4LCAnKCcsIExPQ0FUSU9OLCAnLCcsXG4gICAgICAgICAgICAgIGlzQXJyYXlMaWtlKHZhbHVlKSA/IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKHZhbHVlKSA6IHZhbHVlLFxuICAgICAgICAgICAgICAnKTsnKVxuICAgICAgICAgIH1cbiAgICAgICAgICBjb250aW51ZVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIFZBTFVFID0gYXJnLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoIWZpbHRlcihTQ09QRV9ERUNMKSkge1xuICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgIH1cbiAgICAgICAgVkFMVUUgPSBzY29wZS5kZWYoc2hhcmVkLnVuaWZvcm1zLCAnWycsIHN0cmluZ1N0b3JlLmlkKG5hbWUpLCAnXScpXG4gICAgICB9XG5cbiAgICAgIGlmICh0eXBlID09PSBHTF9TQU1QTEVSXzJEKSB7XG4gICAgICAgIHNjb3BlKFxuICAgICAgICAgICdpZignLCBWQUxVRSwgJyYmJywgVkFMVUUsICcuX3JlZ2xUeXBlPT09XCJmcmFtZWJ1ZmZlclwiKXsnLFxuICAgICAgICAgIFZBTFVFLCAnPScsIFZBTFVFLCAnLmNvbG9yWzBdOycsXG4gICAgICAgICAgJ30nKVxuICAgICAgfSBlbHNlIGlmICh0eXBlID09PSBHTF9TQU1QTEVSX0NVQkUpIHtcbiAgICAgICAgc2NvcGUoXG4gICAgICAgICAgJ2lmKCcsIFZBTFVFLCAnJiYnLCBWQUxVRSwgJy5fcmVnbFR5cGU9PT1cImZyYW1lYnVmZmVyQ3ViZVwiKXsnLFxuICAgICAgICAgIFZBTFVFLCAnPScsIFZBTFVFLCAnLmNvbG9yWzBdOycsXG4gICAgICAgICAgJ30nKVxuICAgICAgfVxuXG4gICAgICAvLyBwZXJmb3JtIHR5cGUgdmFsaWRhdGlvblxuICAgICAgXG5cbiAgICAgIHZhciB1bnJvbGwgPSAxXG4gICAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgICAgY2FzZSBHTF9TQU1QTEVSXzJEOlxuICAgICAgICBjYXNlIEdMX1NBTVBMRVJfQ1VCRTpcbiAgICAgICAgICB2YXIgVEVYID0gc2NvcGUuZGVmKFZBTFVFLCAnLl90ZXh0dXJlJylcbiAgICAgICAgICBzY29wZShHTCwgJy51bmlmb3JtMWkoJywgTE9DQVRJT04sICcsJywgVEVYLCAnLmJpbmQoKSk7JylcbiAgICAgICAgICBzY29wZS5leGl0KFRFWCwgJy51bmJpbmQoKTsnKVxuICAgICAgICAgIGNvbnRpbnVlXG5cbiAgICAgICAgY2FzZSBHTF9JTlQ6XG4gICAgICAgIGNhc2UgR0xfQk9PTDpcbiAgICAgICAgICBpbmZpeCA9ICcxaSdcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfSU5UX1ZFQzI6XG4gICAgICAgIGNhc2UgR0xfQk9PTF9WRUMyOlxuICAgICAgICAgIGluZml4ID0gJzJpJ1xuICAgICAgICAgIHVucm9sbCA9IDJcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfSU5UX1ZFQzM6XG4gICAgICAgIGNhc2UgR0xfQk9PTF9WRUMzOlxuICAgICAgICAgIGluZml4ID0gJzNpJ1xuICAgICAgICAgIHVucm9sbCA9IDNcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfSU5UX1ZFQzQ6XG4gICAgICAgIGNhc2UgR0xfQk9PTF9WRUM0OlxuICAgICAgICAgIGluZml4ID0gJzRpJ1xuICAgICAgICAgIHVucm9sbCA9IDRcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfRkxPQVQ6XG4gICAgICAgICAgaW5maXggPSAnMWYnXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzI6XG4gICAgICAgICAgaW5maXggPSAnMmYnXG4gICAgICAgICAgdW5yb2xsID0gMlxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUMzOlxuICAgICAgICAgIGluZml4ID0gJzNmJ1xuICAgICAgICAgIHVucm9sbCA9IDNcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDNDpcbiAgICAgICAgICBpbmZpeCA9ICc0ZidcbiAgICAgICAgICB1bnJvbGwgPSA0XG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0ZMT0FUX01BVDI6XG4gICAgICAgICAgaW5maXggPSAnTWF0cml4MmZ2J1xuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9GTE9BVF9NQVQzOlxuICAgICAgICAgIGluZml4ID0gJ01hdHJpeDNmdidcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfRkxPQVRfTUFUNDpcbiAgICAgICAgICBpbmZpeCA9ICdNYXRyaXg0ZnYnXG4gICAgICAgICAgYnJlYWtcbiAgICAgIH1cblxuICAgICAgc2NvcGUoR0wsICcudW5pZm9ybScsIGluZml4LCAnKCcsIExPQ0FUSU9OLCAnLCcpXG4gICAgICBpZiAoaW5maXguY2hhckF0KDApID09PSAnTScpIHtcbiAgICAgICAgdmFyIG1hdFNpemUgPSBNYXRoLnBvdyh0eXBlIC0gR0xfRkxPQVRfTUFUMiArIDIsIDIpXG4gICAgICAgIHZhciBTVE9SQUdFID0gZW52Lmdsb2JhbC5kZWYoJ25ldyBGbG9hdDMyQXJyYXkoJywgbWF0U2l6ZSwgJyknKVxuICAgICAgICBzY29wZShcbiAgICAgICAgICAnZmFsc2UsKEFycmF5LmlzQXJyYXkoJywgVkFMVUUsICcpfHwnLCBWQUxVRSwgJyBpbnN0YW5jZW9mIEZsb2F0MzJBcnJheSk/JywgVkFMVUUsICc6KCcsXG4gICAgICAgICAgbG9vcChtYXRTaXplLCBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgICAgcmV0dXJuIFNUT1JBR0UgKyAnWycgKyBpICsgJ109JyArIFZBTFVFICsgJ1snICsgaSArICddJ1xuICAgICAgICAgIH0pLCAnLCcsIFNUT1JBR0UsICcpJylcbiAgICAgIH0gZWxzZSBpZiAodW5yb2xsID4gMSkge1xuICAgICAgICBzY29wZShsb29wKHVucm9sbCwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICByZXR1cm4gVkFMVUUgKyAnWycgKyBpICsgJ10nXG4gICAgICAgIH0pKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2NvcGUoVkFMVUUpXG4gICAgICB9XG4gICAgICBzY29wZSgnKTsnKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGVtaXREcmF3IChlbnYsIG91dGVyLCBpbm5lciwgYXJncykge1xuICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgdmFyIEdMID0gc2hhcmVkLmdsXG4gICAgdmFyIERSQVdfU1RBVEUgPSBzaGFyZWQuZHJhd1xuXG4gICAgdmFyIGRyYXdPcHRpb25zID0gYXJncy5kcmF3XG5cbiAgICBmdW5jdGlvbiBlbWl0RWxlbWVudHMgKCkge1xuICAgICAgdmFyIGRlZm4gPSBkcmF3T3B0aW9ucy5lbGVtZW50c1xuICAgICAgdmFyIEVMRU1FTlRTXG4gICAgICB2YXIgc2NvcGUgPSBvdXRlclxuICAgICAgaWYgKGRlZm4pIHtcbiAgICAgICAgaWYgKChkZWZuLmNvbnRleHREZXAgJiYgYXJncy5jb250ZXh0RHluYW1pYykgfHwgZGVmbi5wcm9wRGVwKSB7XG4gICAgICAgICAgc2NvcGUgPSBpbm5lclxuICAgICAgICB9XG4gICAgICAgIEVMRU1FTlRTID0gZGVmbi5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIEVMRU1FTlRTID0gc2NvcGUuZGVmKERSQVdfU1RBVEUsICcuJywgU19FTEVNRU5UUylcbiAgICAgIH1cbiAgICAgIGlmIChFTEVNRU5UUykge1xuICAgICAgICBzY29wZShcbiAgICAgICAgICAnaWYoJyArIEVMRU1FTlRTICsgJyknICtcbiAgICAgICAgICBHTCArICcuYmluZEJ1ZmZlcignICsgR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIgKyAnLCcgKyBFTEVNRU5UUyArICcuYnVmZmVyLmJ1ZmZlcik7JylcbiAgICAgIH1cbiAgICAgIHJldHVybiBFTEVNRU5UU1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGVtaXRDb3VudCAoKSB7XG4gICAgICB2YXIgZGVmbiA9IGRyYXdPcHRpb25zLmNvdW50XG4gICAgICB2YXIgQ09VTlRcbiAgICAgIHZhciBzY29wZSA9IG91dGVyXG4gICAgICBpZiAoZGVmbikge1xuICAgICAgICBpZiAoKGRlZm4uY29udGV4dERlcCAmJiBhcmdzLmNvbnRleHREeW5hbWljKSB8fCBkZWZuLnByb3BEZXApIHtcbiAgICAgICAgICBzY29wZSA9IGlubmVyXG4gICAgICAgIH1cbiAgICAgICAgQ09VTlQgPSBkZWZuLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgICBcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIENPVU5UID0gc2NvcGUuZGVmKERSQVdfU1RBVEUsICcuJywgU19DT1VOVClcbiAgICAgICAgXG4gICAgICB9XG4gICAgICByZXR1cm4gQ09VTlRcbiAgICB9XG5cbiAgICB2YXIgRUxFTUVOVFMgPSBlbWl0RWxlbWVudHMoKVxuICAgIGZ1bmN0aW9uIGVtaXRWYWx1ZSAobmFtZSkge1xuICAgICAgdmFyIGRlZm4gPSBkcmF3T3B0aW9uc1tuYW1lXVxuICAgICAgaWYgKGRlZm4pIHtcbiAgICAgICAgaWYgKChkZWZuLmNvbnRleHREZXAgJiYgYXJncy5jb250ZXh0RHluYW1pYykgfHwgZGVmbi5wcm9wRGVwKSB7XG4gICAgICAgICAgcmV0dXJuIGRlZm4uYXBwZW5kKGVudiwgaW5uZXIpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIGRlZm4uYXBwZW5kKGVudiwgb3V0ZXIpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBvdXRlci5kZWYoRFJBV19TVEFURSwgJy4nLCBuYW1lKVxuICAgICAgfVxuICAgIH1cblxuICAgIHZhciBQUklNSVRJVkUgPSBlbWl0VmFsdWUoU19QUklNSVRJVkUpXG4gICAgdmFyIE9GRlNFVCA9IGVtaXRWYWx1ZShTX09GRlNFVClcblxuICAgIHZhciBDT1VOVCA9IGVtaXRDb3VudCgpXG4gICAgaWYgKHR5cGVvZiBDT1VOVCA9PT0gJ251bWJlcicpIHtcbiAgICAgIGlmIChDT1VOVCA9PT0gMCkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgaW5uZXIoJ2lmKCcsIENPVU5ULCAnKXsnKVxuICAgICAgaW5uZXIuZXhpdCgnfScpXG4gICAgfVxuXG4gICAgdmFyIElOU1RBTkNFUywgRVhUX0lOU1RBTkNJTkdcbiAgICBpZiAoZXh0SW5zdGFuY2luZykge1xuICAgICAgSU5TVEFOQ0VTID0gZW1pdFZhbHVlKFNfSU5TVEFOQ0VTKVxuICAgICAgRVhUX0lOU1RBTkNJTkcgPSBlbnYuaW5zdGFuY2luZ1xuICAgIH1cblxuICAgIHZhciBFTEVNRU5UX1RZUEUgPSBFTEVNRU5UUyArICcudHlwZSdcblxuICAgIHZhciBlbGVtZW50c1N0YXRpYyA9IGRyYXdPcHRpb25zLmVsZW1lbnRzICYmIGlzU3RhdGljKGRyYXdPcHRpb25zLmVsZW1lbnRzKVxuXG4gICAgZnVuY3Rpb24gZW1pdEluc3RhbmNpbmcgKCkge1xuICAgICAgZnVuY3Rpb24gZHJhd0VsZW1lbnRzICgpIHtcbiAgICAgICAgaW5uZXIoRVhUX0lOU1RBTkNJTkcsICcuZHJhd0VsZW1lbnRzSW5zdGFuY2VkQU5HTEUoJywgW1xuICAgICAgICAgIFBSSU1JVElWRSxcbiAgICAgICAgICBDT1VOVCxcbiAgICAgICAgICBFTEVNRU5UX1RZUEUsXG4gICAgICAgICAgT0ZGU0VUICsgJzw8KCgnICsgRUxFTUVOVF9UWVBFICsgJy0nICsgR0xfVU5TSUdORURfQllURSArICcpPj4xKScsXG4gICAgICAgICAgSU5TVEFOQ0VTXG4gICAgICAgIF0sICcpOycpXG4gICAgICB9XG5cbiAgICAgIGZ1bmN0aW9uIGRyYXdBcnJheXMgKCkge1xuICAgICAgICBpbm5lcihFWFRfSU5TVEFOQ0lORywgJy5kcmF3QXJyYXlzSW5zdGFuY2VkQU5HTEUoJyxcbiAgICAgICAgICBbUFJJTUlUSVZFLCBPRkZTRVQsIENPVU5ULCBJTlNUQU5DRVNdLCAnKTsnKVxuICAgICAgfVxuXG4gICAgICBpZiAoRUxFTUVOVFMpIHtcbiAgICAgICAgaWYgKCFlbGVtZW50c1N0YXRpYykge1xuICAgICAgICAgIGlubmVyKCdpZignLCBFTEVNRU5UUywgJyl7JylcbiAgICAgICAgICBkcmF3RWxlbWVudHMoKVxuICAgICAgICAgIGlubmVyKCd9ZWxzZXsnKVxuICAgICAgICAgIGRyYXdBcnJheXMoKVxuICAgICAgICAgIGlubmVyKCd9JylcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBkcmF3RWxlbWVudHMoKVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkcmF3QXJyYXlzKClcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBlbWl0UmVndWxhciAoKSB7XG4gICAgICBmdW5jdGlvbiBkcmF3RWxlbWVudHMgKCkge1xuICAgICAgICBpbm5lcihHTCArICcuZHJhd0VsZW1lbnRzKCcgKyBbXG4gICAgICAgICAgUFJJTUlUSVZFLFxuICAgICAgICAgIENPVU5ULFxuICAgICAgICAgIEVMRU1FTlRfVFlQRSxcbiAgICAgICAgICBPRkZTRVQgKyAnPDwoKCcgKyBFTEVNRU5UX1RZUEUgKyAnLScgKyBHTF9VTlNJR05FRF9CWVRFICsgJyk+PjEpJ1xuICAgICAgICBdICsgJyk7JylcbiAgICAgIH1cblxuICAgICAgZnVuY3Rpb24gZHJhd0FycmF5cyAoKSB7XG4gICAgICAgIGlubmVyKEdMICsgJy5kcmF3QXJyYXlzKCcgKyBbUFJJTUlUSVZFLCBPRkZTRVQsIENPVU5UXSArICcpOycpXG4gICAgICB9XG5cbiAgICAgIGlmIChFTEVNRU5UUykge1xuICAgICAgICBpZiAoIWVsZW1lbnRzU3RhdGljKSB7XG4gICAgICAgICAgaW5uZXIoJ2lmKCcsIEVMRU1FTlRTLCAnKXsnKVxuICAgICAgICAgIGRyYXdFbGVtZW50cygpXG4gICAgICAgICAgaW5uZXIoJ31lbHNleycpXG4gICAgICAgICAgZHJhd0FycmF5cygpXG4gICAgICAgICAgaW5uZXIoJ30nKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGRyYXdFbGVtZW50cygpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRyYXdBcnJheXMoKVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChleHRJbnN0YW5jaW5nICYmICh0eXBlb2YgSU5TVEFOQ0VTICE9PSAnbnVtYmVyJyB8fCBJTlNUQU5DRVMgPj0gMCkpIHtcbiAgICAgIGlmICh0eXBlb2YgSU5TVEFOQ0VTID09PSAnc3RyaW5nJykge1xuICAgICAgICBpbm5lcignaWYoJywgSU5TVEFOQ0VTLCAnPjApeycpXG4gICAgICAgIGVtaXRJbnN0YW5jaW5nKClcbiAgICAgICAgaW5uZXIoJ31lbHNlIGlmKCcsIElOU1RBTkNFUywgJzwwKXsnKVxuICAgICAgICBlbWl0UmVndWxhcigpXG4gICAgICAgIGlubmVyKCd9JylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGVtaXRJbnN0YW5jaW5nKClcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgZW1pdFJlZ3VsYXIoKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZUJvZHkgKGVtaXRCb2R5LCBwYXJlbnRFbnYsIGFyZ3MsIHByb2dyYW0sIGNvdW50KSB7XG4gICAgdmFyIGVudiA9IGNyZWF0ZVJFR0xFbnZpcm9ubWVudCgpXG4gICAgdmFyIHNjb3BlID0gZW52LnByb2MoJ2JvZHknLCBjb3VudClcbiAgICBcbiAgICBpZiAoZXh0SW5zdGFuY2luZykge1xuICAgICAgZW52Lmluc3RhbmNpbmcgPSBzY29wZS5kZWYoXG4gICAgICAgIGVudi5zaGFyZWQuZXh0ZW5zaW9ucywgJy5hbmdsZV9pbnN0YW5jZWRfYXJyYXlzJylcbiAgICB9XG4gICAgZW1pdEJvZHkoZW52LCBzY29wZSwgYXJncywgcHJvZ3JhbSlcbiAgICByZXR1cm4gZW52LmNvbXBpbGUoKS5ib2R5XG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIERSQVcgUFJPQ1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIGVtaXREcmF3Qm9keSAoZW52LCBkcmF3LCBhcmdzLCBwcm9ncmFtKSB7XG4gICAgaW5qZWN0RXh0ZW5zaW9ucyhlbnYsIGRyYXcpXG4gICAgZW1pdEF0dHJpYnV0ZXMoZW52LCBkcmF3LCBhcmdzLCBwcm9ncmFtLmF0dHJpYnV0ZXMsIGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiB0cnVlXG4gICAgfSlcbiAgICBlbWl0VW5pZm9ybXMoZW52LCBkcmF3LCBhcmdzLCBwcm9ncmFtLnVuaWZvcm1zLCBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIH0pXG4gICAgZW1pdERyYXcoZW52LCBkcmF3LCBkcmF3LCBhcmdzKVxuICB9XG5cbiAgZnVuY3Rpb24gZW1pdERyYXdQcm9jIChlbnYsIGFyZ3MpIHtcbiAgICB2YXIgZHJhdyA9IGVudi5wcm9jKCdkcmF3JywgMSlcblxuICAgIGluamVjdEV4dGVuc2lvbnMoZW52LCBkcmF3KVxuXG4gICAgZW1pdENvbnRleHQoZW52LCBkcmF3LCBhcmdzLmNvbnRleHQpXG4gICAgZW1pdFBvbGxGcmFtZWJ1ZmZlcihlbnYsIGRyYXcsIGFyZ3MuZnJhbWVidWZmZXIpXG5cbiAgICBlbWl0UG9sbFN0YXRlKGVudiwgZHJhdywgYXJncylcbiAgICBlbWl0U2V0T3B0aW9ucyhlbnYsIGRyYXcsIGFyZ3Muc3RhdGUpXG5cbiAgICBlbWl0UHJvZmlsZShlbnYsIGRyYXcsIGFyZ3MsIGZhbHNlLCB0cnVlKVxuXG4gICAgdmFyIHByb2dyYW0gPSBhcmdzLnNoYWRlci5wcm9nVmFyLmFwcGVuZChlbnYsIGRyYXcpXG4gICAgZHJhdyhlbnYuc2hhcmVkLmdsLCAnLnVzZVByb2dyYW0oJywgcHJvZ3JhbSwgJy5wcm9ncmFtKTsnKVxuXG4gICAgaWYgKGFyZ3Muc2hhZGVyLnByb2dyYW0pIHtcbiAgICAgIGVtaXREcmF3Qm9keShlbnYsIGRyYXcsIGFyZ3MsIGFyZ3Muc2hhZGVyLnByb2dyYW0pXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBkcmF3Q2FjaGUgPSBlbnYuZ2xvYmFsLmRlZigne30nKVxuICAgICAgdmFyIFBST0dfSUQgPSBkcmF3LmRlZihwcm9ncmFtLCAnLmlkJylcbiAgICAgIHZhciBDQUNIRURfUFJPQyA9IGRyYXcuZGVmKGRyYXdDYWNoZSwgJ1snLCBQUk9HX0lELCAnXScpXG4gICAgICBkcmF3KFxuICAgICAgICBlbnYuY29uZChDQUNIRURfUFJPQylcbiAgICAgICAgICAudGhlbihDQUNIRURfUFJPQywgJy5jYWxsKHRoaXMsYTApOycpXG4gICAgICAgICAgLmVsc2UoXG4gICAgICAgICAgICBDQUNIRURfUFJPQywgJz0nLCBkcmF3Q2FjaGUsICdbJywgUFJPR19JRCwgJ109JyxcbiAgICAgICAgICAgIGVudi5saW5rKGZ1bmN0aW9uIChwcm9ncmFtKSB7XG4gICAgICAgICAgICAgIHJldHVybiBjcmVhdGVCb2R5KGVtaXREcmF3Qm9keSwgZW52LCBhcmdzLCBwcm9ncmFtLCAxKVxuICAgICAgICAgICAgfSksICcoJywgcHJvZ3JhbSwgJyk7JyxcbiAgICAgICAgICAgIENBQ0hFRF9QUk9DLCAnLmNhbGwodGhpcyxhMCk7JykpXG4gICAgfVxuXG4gICAgaWYgKE9iamVjdC5rZXlzKGFyZ3Muc3RhdGUpLmxlbmd0aCA+IDApIHtcbiAgICAgIGRyYXcoZW52LnNoYXJlZC5jdXJyZW50LCAnLmRpcnR5PXRydWU7JylcbiAgICB9XG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIEJBVENIIFBST0NcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gIGZ1bmN0aW9uIGVtaXRCYXRjaER5bmFtaWNTaGFkZXJCb2R5IChlbnYsIHNjb3BlLCBhcmdzLCBwcm9ncmFtKSB7XG4gICAgZW52LmJhdGNoSWQgPSAnYTEnXG5cbiAgICBpbmplY3RFeHRlbnNpb25zKGVudiwgc2NvcGUpXG5cbiAgICBmdW5jdGlvbiBhbGwgKCkge1xuICAgICAgcmV0dXJuIHRydWVcbiAgICB9XG5cbiAgICBlbWl0QXR0cmlidXRlcyhlbnYsIHNjb3BlLCBhcmdzLCBwcm9ncmFtLmF0dHJpYnV0ZXMsIGFsbClcbiAgICBlbWl0VW5pZm9ybXMoZW52LCBzY29wZSwgYXJncywgcHJvZ3JhbS51bmlmb3JtcywgYWxsKVxuICAgIGVtaXREcmF3KGVudiwgc2NvcGUsIHNjb3BlLCBhcmdzKVxuICB9XG5cbiAgZnVuY3Rpb24gZW1pdEJhdGNoQm9keSAoZW52LCBzY29wZSwgYXJncywgcHJvZ3JhbSkge1xuICAgIGluamVjdEV4dGVuc2lvbnMoZW52LCBzY29wZSlcblxuICAgIHZhciBjb250ZXh0RHluYW1pYyA9IGFyZ3MuY29udGV4dERlcFxuXG4gICAgdmFyIEJBVENIX0lEID0gc2NvcGUuZGVmKClcbiAgICB2YXIgUFJPUF9MSVNUID0gJ2EwJ1xuICAgIHZhciBOVU1fUFJPUFMgPSAnYTEnXG4gICAgdmFyIFBST1BTID0gc2NvcGUuZGVmKClcbiAgICBlbnYuc2hhcmVkLnByb3BzID0gUFJPUFNcbiAgICBlbnYuYmF0Y2hJZCA9IEJBVENIX0lEXG5cbiAgICB2YXIgb3V0ZXIgPSBlbnYuc2NvcGUoKVxuICAgIHZhciBpbm5lciA9IGVudi5zY29wZSgpXG5cbiAgICBzY29wZShcbiAgICAgIG91dGVyLmVudHJ5LFxuICAgICAgJ2ZvcignLCBCQVRDSF9JRCwgJz0wOycsIEJBVENIX0lELCAnPCcsIE5VTV9QUk9QUywgJzsrKycsIEJBVENIX0lELCAnKXsnLFxuICAgICAgUFJPUFMsICc9JywgUFJPUF9MSVNULCAnWycsIEJBVENIX0lELCAnXTsnLFxuICAgICAgaW5uZXIsXG4gICAgICAnfScsXG4gICAgICBvdXRlci5leGl0KVxuXG4gICAgZnVuY3Rpb24gaXNJbm5lckRlZm4gKGRlZm4pIHtcbiAgICAgIHJldHVybiAoKGRlZm4uY29udGV4dERlcCAmJiBjb250ZXh0RHluYW1pYykgfHwgZGVmbi5wcm9wRGVwKVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGlzT3V0ZXJEZWZuIChkZWZuKSB7XG4gICAgICByZXR1cm4gIWlzSW5uZXJEZWZuKGRlZm4pXG4gICAgfVxuXG4gICAgaWYgKGFyZ3MubmVlZHNDb250ZXh0KSB7XG4gICAgICBlbWl0Q29udGV4dChlbnYsIGlubmVyLCBhcmdzLmNvbnRleHQpXG4gICAgfVxuICAgIGlmIChhcmdzLm5lZWRzRnJhbWVidWZmZXIpIHtcbiAgICAgIGVtaXRQb2xsRnJhbWVidWZmZXIoZW52LCBpbm5lciwgYXJncy5mcmFtZWJ1ZmZlcilcbiAgICB9XG4gICAgZW1pdFNldE9wdGlvbnMoZW52LCBpbm5lciwgYXJncy5zdGF0ZSwgaXNJbm5lckRlZm4pXG5cbiAgICBpZiAoYXJncy5wcm9maWxlICYmIGlzSW5uZXJEZWZuKGFyZ3MucHJvZmlsZSkpIHtcbiAgICAgIGVtaXRQcm9maWxlKGVudiwgaW5uZXIsIGFyZ3MsIGZhbHNlLCB0cnVlKVxuICAgIH1cblxuICAgIGlmICghcHJvZ3JhbSkge1xuICAgICAgdmFyIHByb2dDYWNoZSA9IGVudi5nbG9iYWwuZGVmKCd7fScpXG4gICAgICB2YXIgUFJPR1JBTSA9IGFyZ3Muc2hhZGVyLnByb2dWYXIuYXBwZW5kKGVudiwgaW5uZXIpXG4gICAgICB2YXIgUFJPR19JRCA9IGlubmVyLmRlZihQUk9HUkFNLCAnLmlkJylcbiAgICAgIHZhciBDQUNIRURfUFJPQyA9IGlubmVyLmRlZihwcm9nQ2FjaGUsICdbJywgUFJPR19JRCwgJ10nKVxuICAgICAgaW5uZXIoXG4gICAgICAgIGVudi5zaGFyZWQuZ2wsICcudXNlUHJvZ3JhbSgnLCBQUk9HUkFNLCAnLnByb2dyYW0pOycsXG4gICAgICAgICdpZighJywgQ0FDSEVEX1BST0MsICcpeycsXG4gICAgICAgIENBQ0hFRF9QUk9DLCAnPScsIHByb2dDYWNoZSwgJ1snLCBQUk9HX0lELCAnXT0nLFxuICAgICAgICBlbnYubGluayhmdW5jdGlvbiAocHJvZ3JhbSkge1xuICAgICAgICAgIHJldHVybiBjcmVhdGVCb2R5KFxuICAgICAgICAgICAgZW1pdEJhdGNoRHluYW1pY1NoYWRlckJvZHksIGVudiwgYXJncywgcHJvZ3JhbSwgMilcbiAgICAgICAgfSksICcoJywgUFJPR1JBTSwgJyk7fScsXG4gICAgICAgIENBQ0hFRF9QUk9DLCAnLmNhbGwodGhpcyxhMFsnLCBCQVRDSF9JRCwgJ10sJywgQkFUQ0hfSUQsICcpOycpXG4gICAgfSBlbHNlIHtcbiAgICAgIGVtaXRBdHRyaWJ1dGVzKGVudiwgb3V0ZXIsIGFyZ3MsIHByb2dyYW0uYXR0cmlidXRlcywgaXNPdXRlckRlZm4pXG4gICAgICBlbWl0QXR0cmlidXRlcyhlbnYsIGlubmVyLCBhcmdzLCBwcm9ncmFtLmF0dHJpYnV0ZXMsIGlzSW5uZXJEZWZuKVxuICAgICAgZW1pdFVuaWZvcm1zKGVudiwgb3V0ZXIsIGFyZ3MsIHByb2dyYW0udW5pZm9ybXMsIGlzT3V0ZXJEZWZuKVxuICAgICAgZW1pdFVuaWZvcm1zKGVudiwgaW5uZXIsIGFyZ3MsIHByb2dyYW0udW5pZm9ybXMsIGlzSW5uZXJEZWZuKVxuICAgICAgZW1pdERyYXcoZW52LCBvdXRlciwgaW5uZXIsIGFyZ3MpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZW1pdEJhdGNoUHJvYyAoZW52LCBhcmdzKSB7XG4gICAgdmFyIGJhdGNoID0gZW52LnByb2MoJ2JhdGNoJywgMilcbiAgICBlbnYuYmF0Y2hJZCA9ICcwJ1xuXG4gICAgaW5qZWN0RXh0ZW5zaW9ucyhlbnYsIGJhdGNoKVxuXG4gICAgLy8gQ2hlY2sgaWYgYW55IGNvbnRleHQgdmFyaWFibGVzIGRlcGVuZCBvbiBwcm9wc1xuICAgIHZhciBjb250ZXh0RHluYW1pYyA9IGZhbHNlXG4gICAgdmFyIG5lZWRzQ29udGV4dCA9IHRydWVcbiAgICBPYmplY3Qua2V5cyhhcmdzLmNvbnRleHQpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIGNvbnRleHREeW5hbWljID0gY29udGV4dER5bmFtaWMgfHwgYXJncy5jb250ZXh0W25hbWVdLnByb3BEZXBcbiAgICB9KVxuICAgIGlmICghY29udGV4dER5bmFtaWMpIHtcbiAgICAgIGVtaXRDb250ZXh0KGVudiwgYmF0Y2gsIGFyZ3MuY29udGV4dClcbiAgICAgIG5lZWRzQ29udGV4dCA9IGZhbHNlXG4gICAgfVxuXG4gICAgLy8gZnJhbWVidWZmZXIgc3RhdGUgYWZmZWN0cyBmcmFtZWJ1ZmZlcldpZHRoL2hlaWdodCBjb250ZXh0IHZhcnNcbiAgICB2YXIgZnJhbWVidWZmZXIgPSBhcmdzLmZyYW1lYnVmZmVyXG4gICAgdmFyIG5lZWRzRnJhbWVidWZmZXIgPSBmYWxzZVxuICAgIGlmIChmcmFtZWJ1ZmZlcikge1xuICAgICAgaWYgKGZyYW1lYnVmZmVyLnByb3BEZXApIHtcbiAgICAgICAgY29udGV4dER5bmFtaWMgPSBuZWVkc0ZyYW1lYnVmZmVyID0gdHJ1ZVxuICAgICAgfSBlbHNlIGlmIChmcmFtZWJ1ZmZlci5jb250ZXh0RGVwICYmIGNvbnRleHREeW5hbWljKSB7XG4gICAgICAgIG5lZWRzRnJhbWVidWZmZXIgPSB0cnVlXG4gICAgICB9XG4gICAgICBpZiAoIW5lZWRzRnJhbWVidWZmZXIpIHtcbiAgICAgICAgZW1pdFBvbGxGcmFtZWJ1ZmZlcihlbnYsIGJhdGNoLCBmcmFtZWJ1ZmZlcilcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgZW1pdFBvbGxGcmFtZWJ1ZmZlcihlbnYsIGJhdGNoLCBudWxsKVxuICAgIH1cblxuICAgIC8vIHZpZXdwb3J0IGlzIHdlaXJkIGJlY2F1c2UgaXQgY2FuIGFmZmVjdCBjb250ZXh0IHZhcnNcbiAgICBpZiAoYXJncy5zdGF0ZS52aWV3cG9ydCAmJiBhcmdzLnN0YXRlLnZpZXdwb3J0LnByb3BEZXApIHtcbiAgICAgIGNvbnRleHREeW5hbWljID0gdHJ1ZVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGlzSW5uZXJEZWZuIChkZWZuKSB7XG4gICAgICByZXR1cm4gKGRlZm4uY29udGV4dERlcCAmJiBjb250ZXh0RHluYW1pYykgfHwgZGVmbi5wcm9wRGVwXG4gICAgfVxuXG4gICAgLy8gc2V0IHdlYmdsIG9wdGlvbnNcbiAgICBlbWl0UG9sbFN0YXRlKGVudiwgYmF0Y2gsIGFyZ3MpXG4gICAgZW1pdFNldE9wdGlvbnMoZW52LCBiYXRjaCwgYXJncy5zdGF0ZSwgZnVuY3Rpb24gKGRlZm4pIHtcbiAgICAgIHJldHVybiAhaXNJbm5lckRlZm4oZGVmbilcbiAgICB9KVxuXG4gICAgaWYgKCFhcmdzLnByb2ZpbGUgfHwgIWlzSW5uZXJEZWZuKGFyZ3MucHJvZmlsZSkpIHtcbiAgICAgIGVtaXRQcm9maWxlKGVudiwgYmF0Y2gsIGFyZ3MsIGZhbHNlLCAnYTEnKVxuICAgIH1cblxuICAgIC8vIFNhdmUgdGhlc2UgdmFsdWVzIHRvIGFyZ3Mgc28gdGhhdCB0aGUgYmF0Y2ggYm9keSByb3V0aW5lIGNhbiB1c2UgdGhlbVxuICAgIGFyZ3MuY29udGV4dERlcCA9IGNvbnRleHREeW5hbWljXG4gICAgYXJncy5uZWVkc0NvbnRleHQgPSBuZWVkc0NvbnRleHRcbiAgICBhcmdzLm5lZWRzRnJhbWVidWZmZXIgPSBuZWVkc0ZyYW1lYnVmZmVyXG5cbiAgICAvLyBkZXRlcm1pbmUgaWYgc2hhZGVyIGlzIGR5bmFtaWNcbiAgICB2YXIgcHJvZ0RlZm4gPSBhcmdzLnNoYWRlci5wcm9nVmFyXG4gICAgaWYgKChwcm9nRGVmbi5jb250ZXh0RGVwICYmIGNvbnRleHREeW5hbWljKSB8fCBwcm9nRGVmbi5wcm9wRGVwKSB7XG4gICAgICBlbWl0QmF0Y2hCb2R5KFxuICAgICAgICBlbnYsXG4gICAgICAgIGJhdGNoLFxuICAgICAgICBhcmdzLFxuICAgICAgICBudWxsKVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgUFJPR1JBTSA9IHByb2dEZWZuLmFwcGVuZChlbnYsIGJhdGNoKVxuICAgICAgYmF0Y2goZW52LnNoYXJlZC5nbCwgJy51c2VQcm9ncmFtKCcsIFBST0dSQU0sICcucHJvZ3JhbSk7JylcbiAgICAgIGlmIChhcmdzLnNoYWRlci5wcm9ncmFtKSB7XG4gICAgICAgIGVtaXRCYXRjaEJvZHkoXG4gICAgICAgICAgZW52LFxuICAgICAgICAgIGJhdGNoLFxuICAgICAgICAgIGFyZ3MsXG4gICAgICAgICAgYXJncy5zaGFkZXIucHJvZ3JhbSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBiYXRjaENhY2hlID0gZW52Lmdsb2JhbC5kZWYoJ3t9JylcbiAgICAgICAgdmFyIFBST0dfSUQgPSBiYXRjaC5kZWYoUFJPR1JBTSwgJy5pZCcpXG4gICAgICAgIHZhciBDQUNIRURfUFJPQyA9IGJhdGNoLmRlZihiYXRjaENhY2hlLCAnWycsIFBST0dfSUQsICddJylcbiAgICAgICAgYmF0Y2goXG4gICAgICAgICAgZW52LmNvbmQoQ0FDSEVEX1BST0MpXG4gICAgICAgICAgICAudGhlbihDQUNIRURfUFJPQywgJy5jYWxsKHRoaXMsYTAsYTEpOycpXG4gICAgICAgICAgICAuZWxzZShcbiAgICAgICAgICAgICAgQ0FDSEVEX1BST0MsICc9JywgYmF0Y2hDYWNoZSwgJ1snLCBQUk9HX0lELCAnXT0nLFxuICAgICAgICAgICAgICBlbnYubGluayhmdW5jdGlvbiAocHJvZ3JhbSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBjcmVhdGVCb2R5KGVtaXRCYXRjaEJvZHksIGVudiwgYXJncywgcHJvZ3JhbSwgMilcbiAgICAgICAgICAgICAgfSksICcoJywgUFJPR1JBTSwgJyk7JyxcbiAgICAgICAgICAgICAgQ0FDSEVEX1BST0MsICcuY2FsbCh0aGlzLGEwLGExKTsnKSlcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoT2JqZWN0LmtleXMoYXJncy5zdGF0ZSkubGVuZ3RoID4gMCkge1xuICAgICAgYmF0Y2goZW52LnNoYXJlZC5jdXJyZW50LCAnLmRpcnR5PXRydWU7JylcbiAgICB9XG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIFNDT1BFIENPTU1BTkRcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICBmdW5jdGlvbiBlbWl0U2NvcGVQcm9jIChlbnYsIGFyZ3MpIHtcbiAgICB2YXIgc2NvcGUgPSBlbnYucHJvYygnc2NvcGUnLCAzKVxuICAgIGVudi5iYXRjaElkID0gJ2EyJ1xuXG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcbiAgICB2YXIgQ1VSUkVOVF9TVEFURSA9IHNoYXJlZC5jdXJyZW50XG5cbiAgICBlbWl0Q29udGV4dChlbnYsIHNjb3BlLCBhcmdzLmNvbnRleHQpXG5cbiAgICBpZiAoYXJncy5mcmFtZWJ1ZmZlcikge1xuICAgICAgYXJncy5mcmFtZWJ1ZmZlci5hcHBlbmQoZW52LCBzY29wZSlcbiAgICB9XG5cbiAgICBzb3J0U3RhdGUoT2JqZWN0LmtleXMoYXJncy5zdGF0ZSkpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHZhciBkZWZuID0gYXJncy5zdGF0ZVtuYW1lXVxuICAgICAgdmFyIHZhbHVlID0gZGVmbi5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgIGlmIChpc0FycmF5TGlrZSh2YWx1ZSkpIHtcbiAgICAgICAgdmFsdWUuZm9yRWFjaChmdW5jdGlvbiAodiwgaSkge1xuICAgICAgICAgIHNjb3BlLnNldChlbnYubmV4dFtuYW1lXSwgJ1snICsgaSArICddJywgdilcbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNjb3BlLnNldChzaGFyZWQubmV4dCwgJy4nICsgbmFtZSwgdmFsdWUpXG4gICAgICB9XG4gICAgfSlcblxuICAgIGVtaXRQcm9maWxlKGVudiwgc2NvcGUsIGFyZ3MsIHRydWUsIHRydWUpXG5cbiAgICA7W1NfRUxFTUVOVFMsIFNfT0ZGU0VULCBTX0NPVU5ULCBTX0lOU1RBTkNFUywgU19QUklNSVRJVkVdLmZvckVhY2goXG4gICAgICBmdW5jdGlvbiAob3B0KSB7XG4gICAgICAgIHZhciB2YXJpYWJsZSA9IGFyZ3MuZHJhd1tvcHRdXG4gICAgICAgIGlmICghdmFyaWFibGUpIHtcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuICAgICAgICBzY29wZS5zZXQoc2hhcmVkLmRyYXcsICcuJyArIG9wdCwgJycgKyB2YXJpYWJsZS5hcHBlbmQoZW52LCBzY29wZSkpXG4gICAgICB9KVxuXG4gICAgT2JqZWN0LmtleXMoYXJncy51bmlmb3JtcykuZm9yRWFjaChmdW5jdGlvbiAob3B0KSB7XG4gICAgICBzY29wZS5zZXQoXG4gICAgICAgIHNoYXJlZC51bmlmb3JtcyxcbiAgICAgICAgJ1snICsgc3RyaW5nU3RvcmUuaWQob3B0KSArICddJyxcbiAgICAgICAgYXJncy51bmlmb3Jtc1tvcHRdLmFwcGVuZChlbnYsIHNjb3BlKSlcbiAgICB9KVxuXG4gICAgT2JqZWN0LmtleXMoYXJncy5hdHRyaWJ1dGVzKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICB2YXIgcmVjb3JkID0gYXJncy5hdHRyaWJ1dGVzW25hbWVdLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgdmFyIHNjb3BlQXR0cmliID0gZW52LnNjb3BlQXR0cmliKG5hbWUpXG4gICAgICBPYmplY3Qua2V5cyhuZXcgQXR0cmlidXRlUmVjb3JkKCkpLmZvckVhY2goZnVuY3Rpb24gKHByb3ApIHtcbiAgICAgICAgc2NvcGUuc2V0KHNjb3BlQXR0cmliLCAnLicgKyBwcm9wLCByZWNvcmRbcHJvcF0pXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBmdW5jdGlvbiBzYXZlU2hhZGVyIChuYW1lKSB7XG4gICAgICB2YXIgc2hhZGVyID0gYXJncy5zaGFkZXJbbmFtZV1cbiAgICAgIGlmIChzaGFkZXIpIHtcbiAgICAgICAgc2NvcGUuc2V0KHNoYXJlZC5zaGFkZXIsICcuJyArIG5hbWUsIHNoYWRlci5hcHBlbmQoZW52LCBzY29wZSkpXG4gICAgICB9XG4gICAgfVxuICAgIHNhdmVTaGFkZXIoU19WRVJUKVxuICAgIHNhdmVTaGFkZXIoU19GUkFHKVxuXG4gICAgaWYgKE9iamVjdC5rZXlzKGFyZ3Muc3RhdGUpLmxlbmd0aCA+IDApIHtcbiAgICAgIHNjb3BlKENVUlJFTlRfU1RBVEUsICcuZGlydHk9dHJ1ZTsnKVxuICAgICAgc2NvcGUuZXhpdChDVVJSRU5UX1NUQVRFLCAnLmRpcnR5PXRydWU7JylcbiAgICB9XG5cbiAgICBzY29wZSgnYTEoJywgZW52LnNoYXJlZC5jb250ZXh0LCAnLGEwLCcsIGVudi5iYXRjaElkLCAnKTsnKVxuICB9XG5cbiAgZnVuY3Rpb24gaXNEeW5hbWljT2JqZWN0IChvYmplY3QpIHtcbiAgICBpZiAodHlwZW9mIG9iamVjdCAhPT0gJ29iamVjdCcgfHwgaXNBcnJheUxpa2Uob2JqZWN0KSkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIHZhciBwcm9wcyA9IE9iamVjdC5rZXlzKG9iamVjdClcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHByb3BzLmxlbmd0aDsgKytpKSB7XG4gICAgICBpZiAoZHluYW1pYy5pc0R5bmFtaWMob2JqZWN0W3Byb3BzW2ldXSkpIHtcbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cblxuICBmdW5jdGlvbiBzcGxhdE9iamVjdCAoZW52LCBvcHRpb25zLCBuYW1lKSB7XG4gICAgdmFyIG9iamVjdCA9IG9wdGlvbnMuc3RhdGljW25hbWVdXG4gICAgaWYgKCFvYmplY3QgfHwgIWlzRHluYW1pY09iamVjdChvYmplY3QpKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICB2YXIgZ2xvYmFscyA9IGVudi5nbG9iYWxcbiAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKG9iamVjdClcbiAgICB2YXIgdGhpc0RlcCA9IGZhbHNlXG4gICAgdmFyIGNvbnRleHREZXAgPSBmYWxzZVxuICAgIHZhciBwcm9wRGVwID0gZmFsc2VcbiAgICB2YXIgb2JqZWN0UmVmID0gZW52Lmdsb2JhbC5kZWYoJ3t9JylcbiAgICBrZXlzLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgdmFyIHZhbHVlID0gb2JqZWN0W2tleV1cbiAgICAgIGlmIChkeW5hbWljLmlzRHluYW1pYyh2YWx1ZSkpIHtcbiAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgIHZhbHVlID0gb2JqZWN0W2tleV0gPSBkeW5hbWljLnVuYm94KHZhbHVlKVxuICAgICAgICB9XG4gICAgICAgIHZhciBkZXBzID0gY3JlYXRlRHluYW1pY0RlY2wodmFsdWUsIG51bGwpXG4gICAgICAgIHRoaXNEZXAgPSB0aGlzRGVwIHx8IGRlcHMudGhpc0RlcFxuICAgICAgICBwcm9wRGVwID0gcHJvcERlcCB8fCBkZXBzLnByb3BEZXBcbiAgICAgICAgY29udGV4dERlcCA9IGNvbnRleHREZXAgfHwgZGVwcy5jb250ZXh0RGVwXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBnbG9iYWxzKG9iamVjdFJlZiwgJy4nLCBrZXksICc9JylcbiAgICAgICAgc3dpdGNoICh0eXBlb2YgdmFsdWUpIHtcbiAgICAgICAgICBjYXNlICdudW1iZXInOlxuICAgICAgICAgICAgZ2xvYmFscyh2YWx1ZSlcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgICAgICAgIGdsb2JhbHMoJ1wiJywgdmFsdWUsICdcIicpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcbiAgICAgICAgICAgICAgZ2xvYmFscygnWycsIHZhbHVlLmpvaW4oKSwgJ10nKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgZ2xvYmFscyhlbnYubGluayh2YWx1ZSkpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICB9XG4gICAgICAgIGdsb2JhbHMoJzsnKVxuICAgICAgfVxuICAgIH0pXG5cbiAgICBmdW5jdGlvbiBhcHBlbmRCbG9jayAoZW52LCBibG9jaykge1xuICAgICAga2V5cy5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgdmFyIHZhbHVlID0gb2JqZWN0W2tleV1cbiAgICAgICAgaWYgKCFkeW5hbWljLmlzRHluYW1pYyh2YWx1ZSkpIHtcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuICAgICAgICB2YXIgcmVmID0gZW52Lmludm9rZShibG9jaywgdmFsdWUpXG4gICAgICAgIGJsb2NrKG9iamVjdFJlZiwgJy4nLCBrZXksICc9JywgcmVmLCAnOycpXG4gICAgICB9KVxuICAgIH1cblxuICAgIG9wdGlvbnMuZHluYW1pY1tuYW1lXSA9IG5ldyBkeW5hbWljLkR5bmFtaWNWYXJpYWJsZShEWU5fVEhVTkssIHtcbiAgICAgIHRoaXNEZXA6IHRoaXNEZXAsXG4gICAgICBjb250ZXh0RGVwOiBjb250ZXh0RGVwLFxuICAgICAgcHJvcERlcDogcHJvcERlcCxcbiAgICAgIHJlZjogb2JqZWN0UmVmLFxuICAgICAgYXBwZW5kOiBhcHBlbmRCbG9ja1xuICAgIH0pXG4gICAgZGVsZXRlIG9wdGlvbnMuc3RhdGljW25hbWVdXG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIE1BSU4gRFJBVyBDT01NQU5EXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgZnVuY3Rpb24gY29tcGlsZUNvbW1hbmQgKG9wdGlvbnMsIGF0dHJpYnV0ZXMsIHVuaWZvcm1zLCBjb250ZXh0LCBzdGF0cykge1xuICAgIHZhciBlbnYgPSBjcmVhdGVSRUdMRW52aXJvbm1lbnQoKVxuXG4gICAgLy8gbGluayBzdGF0cywgc28gdGhhdCB3ZSBjYW4gZWFzaWx5IGFjY2VzcyBpdCBpbiB0aGUgcHJvZ3JhbS5cbiAgICBlbnYuc3RhdHMgPSBlbnYubGluayhzdGF0cylcblxuICAgIC8vIHNwbGF0IG9wdGlvbnMgYW5kIGF0dHJpYnV0ZXMgdG8gYWxsb3cgZm9yIGR5bmFtaWMgbmVzdGVkIHByb3BlcnRpZXNcbiAgICBPYmplY3Qua2V5cyhhdHRyaWJ1dGVzLnN0YXRpYykuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICBzcGxhdE9iamVjdChlbnYsIGF0dHJpYnV0ZXMsIGtleSlcbiAgICB9KVxuICAgIE5FU1RFRF9PUFRJT05TLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHNwbGF0T2JqZWN0KGVudiwgb3B0aW9ucywgbmFtZSlcbiAgICB9KVxuXG4gICAgdmFyIGFyZ3MgPSBwYXJzZUFyZ3VtZW50cyhvcHRpb25zLCBhdHRyaWJ1dGVzLCB1bmlmb3JtcywgY29udGV4dCwgZW52KVxuXG4gICAgZW1pdERyYXdQcm9jKGVudiwgYXJncylcbiAgICBlbWl0U2NvcGVQcm9jKGVudiwgYXJncylcbiAgICBlbWl0QmF0Y2hQcm9jKGVudiwgYXJncylcblxuICAgIHJldHVybiBlbnYuY29tcGlsZSgpXG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIFBPTEwgLyBSRUZSRVNIXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgcmV0dXJuIHtcbiAgICBuZXh0OiBuZXh0U3RhdGUsXG4gICAgY3VycmVudDogY3VycmVudFN0YXRlLFxuICAgIHByb2NzOiAoZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIGVudiA9IGNyZWF0ZVJFR0xFbnZpcm9ubWVudCgpXG4gICAgICB2YXIgcG9sbCA9IGVudi5wcm9jKCdwb2xsJylcbiAgICAgIHZhciByZWZyZXNoID0gZW52LnByb2MoJ3JlZnJlc2gnKVxuICAgICAgdmFyIGNvbW1vbiA9IGVudi5ibG9jaygpXG4gICAgICBwb2xsKGNvbW1vbilcbiAgICAgIHJlZnJlc2goY29tbW9uKVxuXG4gICAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuICAgICAgdmFyIEdMID0gc2hhcmVkLmdsXG4gICAgICB2YXIgTkVYVF9TVEFURSA9IHNoYXJlZC5uZXh0XG4gICAgICB2YXIgQ1VSUkVOVF9TVEFURSA9IHNoYXJlZC5jdXJyZW50XG5cbiAgICAgIGNvbW1vbihDVVJSRU5UX1NUQVRFLCAnLmRpcnR5PWZhbHNlOycpXG5cbiAgICAgIGVtaXRQb2xsRnJhbWVidWZmZXIoZW52LCBwb2xsKVxuICAgICAgZW1pdFBvbGxGcmFtZWJ1ZmZlcihlbnYsIHJlZnJlc2gsIG51bGwsIHRydWUpXG5cbiAgICAgIC8vIFJlZnJlc2ggdXBkYXRlcyBhbGwgYXR0cmlidXRlIHN0YXRlIGNoYW5nZXNcbiAgICAgIHZhciBleHRJbnN0YW5jaW5nID0gZ2wuZ2V0RXh0ZW5zaW9uKCdhbmdsZV9pbnN0YW5jZWRfYXJyYXlzJylcbiAgICAgIHZhciBJTlNUQU5DSU5HXG4gICAgICBpZiAoZXh0SW5zdGFuY2luZykge1xuICAgICAgICBJTlNUQU5DSU5HID0gZW52LmxpbmsoZXh0SW5zdGFuY2luZylcbiAgICAgIH1cbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGltaXRzLm1heEF0dHJpYnV0ZXM7ICsraSkge1xuICAgICAgICB2YXIgQklORElORyA9IHJlZnJlc2guZGVmKHNoYXJlZC5hdHRyaWJ1dGVzLCAnWycsIGksICddJylcbiAgICAgICAgdmFyIGlmdGUgPSBlbnYuY29uZChCSU5ESU5HLCAnLmJ1ZmZlcicpXG4gICAgICAgIGlmdGUudGhlbihcbiAgICAgICAgICBHTCwgJy5lbmFibGVWZXJ0ZXhBdHRyaWJBcnJheSgnLCBpLCAnKTsnLFxuICAgICAgICAgIEdMLCAnLmJpbmRCdWZmZXIoJyxcbiAgICAgICAgICAgIEdMX0FSUkFZX0JVRkZFUiwgJywnLFxuICAgICAgICAgICAgQklORElORywgJy5idWZmZXIuYnVmZmVyKTsnLFxuICAgICAgICAgIEdMLCAnLnZlcnRleEF0dHJpYlBvaW50ZXIoJyxcbiAgICAgICAgICAgIGksICcsJyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcuc2l6ZSwnLFxuICAgICAgICAgICAgQklORElORywgJy50eXBlLCcsXG4gICAgICAgICAgICBCSU5ESU5HLCAnLm5vcm1hbGl6ZWQsJyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcuc3RyaWRlLCcsXG4gICAgICAgICAgICBCSU5ESU5HLCAnLm9mZnNldCk7J1xuICAgICAgICApLmVsc2UoXG4gICAgICAgICAgR0wsICcuZGlzYWJsZVZlcnRleEF0dHJpYkFycmF5KCcsIGksICcpOycsXG4gICAgICAgICAgR0wsICcudmVydGV4QXR0cmliNGYoJyxcbiAgICAgICAgICAgIGksICcsJyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcueCwnLFxuICAgICAgICAgICAgQklORElORywgJy55LCcsXG4gICAgICAgICAgICBCSU5ESU5HLCAnLnosJyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcudyk7JyxcbiAgICAgICAgICBCSU5ESU5HLCAnLmJ1ZmZlcj1udWxsOycpXG4gICAgICAgIHJlZnJlc2goaWZ0ZSlcbiAgICAgICAgaWYgKGV4dEluc3RhbmNpbmcpIHtcbiAgICAgICAgICByZWZyZXNoKFxuICAgICAgICAgICAgSU5TVEFOQ0lORywgJy52ZXJ0ZXhBdHRyaWJEaXZpc29yQU5HTEUoJyxcbiAgICAgICAgICAgIGksICcsJyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcuZGl2aXNvcik7JylcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBPYmplY3Qua2V5cyhHTF9GTEFHUykuZm9yRWFjaChmdW5jdGlvbiAoZmxhZykge1xuICAgICAgICB2YXIgY2FwID0gR0xfRkxBR1NbZmxhZ11cbiAgICAgICAgdmFyIE5FWFQgPSBjb21tb24uZGVmKE5FWFRfU1RBVEUsICcuJywgZmxhZylcbiAgICAgICAgdmFyIGJsb2NrID0gZW52LmJsb2NrKClcbiAgICAgICAgYmxvY2soJ2lmKCcsIE5FWFQsICcpeycsXG4gICAgICAgICAgR0wsICcuZW5hYmxlKCcsIGNhcCwgJyl9ZWxzZXsnLFxuICAgICAgICAgIEdMLCAnLmRpc2FibGUoJywgY2FwLCAnKX0nLFxuICAgICAgICAgIENVUlJFTlRfU1RBVEUsICcuJywgZmxhZywgJz0nLCBORVhULCAnOycpXG4gICAgICAgIHJlZnJlc2goYmxvY2spXG4gICAgICAgIHBvbGwoXG4gICAgICAgICAgJ2lmKCcsIE5FWFQsICchPT0nLCBDVVJSRU5UX1NUQVRFLCAnLicsIGZsYWcsICcpeycsXG4gICAgICAgICAgYmxvY2ssXG4gICAgICAgICAgJ30nKVxuICAgICAgfSlcblxuICAgICAgT2JqZWN0LmtleXMoR0xfVkFSSUFCTEVTKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICAgIHZhciBmdW5jID0gR0xfVkFSSUFCTEVTW25hbWVdXG4gICAgICAgIHZhciBpbml0ID0gY3VycmVudFN0YXRlW25hbWVdXG4gICAgICAgIHZhciBORVhULCBDVVJSRU5UXG4gICAgICAgIHZhciBibG9jayA9IGVudi5ibG9jaygpXG4gICAgICAgIGJsb2NrKEdMLCAnLicsIGZ1bmMsICcoJylcbiAgICAgICAgaWYgKGlzQXJyYXlMaWtlKGluaXQpKSB7XG4gICAgICAgICAgdmFyIG4gPSBpbml0Lmxlbmd0aFxuICAgICAgICAgIE5FWFQgPSBlbnYuZ2xvYmFsLmRlZihORVhUX1NUQVRFLCAnLicsIG5hbWUpXG4gICAgICAgICAgQ1VSUkVOVCA9IGVudi5nbG9iYWwuZGVmKENVUlJFTlRfU1RBVEUsICcuJywgbmFtZSlcbiAgICAgICAgICBibG9jayhcbiAgICAgICAgICAgIGxvb3AobiwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIE5FWFQgKyAnWycgKyBpICsgJ10nXG4gICAgICAgICAgICB9KSwgJyk7JyxcbiAgICAgICAgICAgIGxvb3AobiwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIENVUlJFTlQgKyAnWycgKyBpICsgJ109JyArIE5FWFQgKyAnWycgKyBpICsgJ107J1xuICAgICAgICAgICAgfSkuam9pbignJykpXG4gICAgICAgICAgcG9sbChcbiAgICAgICAgICAgICdpZignLCBsb29wKG4sIGZ1bmN0aW9uIChpKSB7XG4gICAgICAgICAgICAgIHJldHVybiBORVhUICsgJ1snICsgaSArICddIT09JyArIENVUlJFTlQgKyAnWycgKyBpICsgJ10nXG4gICAgICAgICAgICB9KS5qb2luKCd8fCcpLCAnKXsnLFxuICAgICAgICAgICAgYmxvY2ssXG4gICAgICAgICAgICAnfScpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgTkVYVCA9IGNvbW1vbi5kZWYoTkVYVF9TVEFURSwgJy4nLCBuYW1lKVxuICAgICAgICAgIENVUlJFTlQgPSBjb21tb24uZGVmKENVUlJFTlRfU1RBVEUsICcuJywgbmFtZSlcbiAgICAgICAgICBibG9jayhcbiAgICAgICAgICAgIE5FWFQsICcpOycsXG4gICAgICAgICAgICBDVVJSRU5UX1NUQVRFLCAnLicsIG5hbWUsICc9JywgTkVYVCwgJzsnKVxuICAgICAgICAgIHBvbGwoXG4gICAgICAgICAgICAnaWYoJywgTkVYVCwgJyE9PScsIENVUlJFTlQsICcpeycsXG4gICAgICAgICAgICBibG9jayxcbiAgICAgICAgICAgICd9JylcbiAgICAgICAgfVxuICAgICAgICByZWZyZXNoKGJsb2NrKVxuICAgICAgfSlcblxuICAgICAgcmV0dXJuIGVudi5jb21waWxlKClcbiAgICB9KSgpLFxuICAgIGNvbXBpbGU6IGNvbXBpbGVDb21tYW5kXG4gIH1cbn1cbiIsInZhciBWQVJJQUJMRV9DT1VOVEVSID0gMFxuXG52YXIgRFlOX0ZVTkMgPSAwXG5cbmZ1bmN0aW9uIER5bmFtaWNWYXJpYWJsZSAodHlwZSwgZGF0YSkge1xuICB0aGlzLmlkID0gKFZBUklBQkxFX0NPVU5URVIrKylcbiAgdGhpcy50eXBlID0gdHlwZVxuICB0aGlzLmRhdGEgPSBkYXRhXG59XG5cbmZ1bmN0aW9uIGVzY2FwZVN0ciAoc3RyKSB7XG4gIHJldHVybiBzdHIucmVwbGFjZSgvXFxcXC9nLCAnXFxcXFxcXFwnKS5yZXBsYWNlKC9cIi9nLCAnXFxcXFwiJylcbn1cblxuZnVuY3Rpb24gc3BsaXRQYXJ0cyAoc3RyKSB7XG4gIGlmIChzdHIubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIFtdXG4gIH1cblxuICB2YXIgZmlyc3RDaGFyID0gc3RyLmNoYXJBdCgwKVxuICB2YXIgbGFzdENoYXIgPSBzdHIuY2hhckF0KHN0ci5sZW5ndGggLSAxKVxuXG4gIGlmIChzdHIubGVuZ3RoID4gMSAmJlxuICAgICAgZmlyc3RDaGFyID09PSBsYXN0Q2hhciAmJlxuICAgICAgKGZpcnN0Q2hhciA9PT0gJ1wiJyB8fCBmaXJzdENoYXIgPT09IFwiJ1wiKSkge1xuICAgIHJldHVybiBbJ1wiJyArIGVzY2FwZVN0cihzdHIuc3Vic3RyKDEsIHN0ci5sZW5ndGggLSAyKSkgKyAnXCInXVxuICB9XG5cbiAgdmFyIHBhcnRzID0gL1xcWyhmYWxzZXx0cnVlfG51bGx8XFxkK3wnW14nXSonfFwiW15cIl0qXCIpXFxdLy5leGVjKHN0cilcbiAgaWYgKHBhcnRzKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHNwbGl0UGFydHMoc3RyLnN1YnN0cigwLCBwYXJ0cy5pbmRleCkpXG4gICAgICAuY29uY2F0KHNwbGl0UGFydHMocGFydHNbMV0pKVxuICAgICAgLmNvbmNhdChzcGxpdFBhcnRzKHN0ci5zdWJzdHIocGFydHMuaW5kZXggKyBwYXJ0c1swXS5sZW5ndGgpKSlcbiAgICApXG4gIH1cblxuICB2YXIgc3VicGFydHMgPSBzdHIuc3BsaXQoJy4nKVxuICBpZiAoc3VicGFydHMubGVuZ3RoID09PSAxKSB7XG4gICAgcmV0dXJuIFsnXCInICsgZXNjYXBlU3RyKHN0cikgKyAnXCInXVxuICB9XG5cbiAgdmFyIHJlc3VsdCA9IFtdXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3VicGFydHMubGVuZ3RoOyArK2kpIHtcbiAgICByZXN1bHQgPSByZXN1bHQuY29uY2F0KHNwbGl0UGFydHMoc3VicGFydHNbaV0pKVxuICB9XG4gIHJldHVybiByZXN1bHRcbn1cblxuZnVuY3Rpb24gdG9BY2Nlc3NvclN0cmluZyAoc3RyKSB7XG4gIHJldHVybiAnWycgKyBzcGxpdFBhcnRzKHN0cikuam9pbignXVsnKSArICddJ1xufVxuXG5mdW5jdGlvbiBkZWZpbmVEeW5hbWljICh0eXBlLCBkYXRhKSB7XG4gIHJldHVybiBuZXcgRHluYW1pY1ZhcmlhYmxlKHR5cGUsIHRvQWNjZXNzb3JTdHJpbmcoZGF0YSArICcnKSlcbn1cblxuZnVuY3Rpb24gaXNEeW5hbWljICh4KSB7XG4gIHJldHVybiAodHlwZW9mIHggPT09ICdmdW5jdGlvbicgJiYgIXguX3JlZ2xUeXBlKSB8fFxuICAgICAgICAgeCBpbnN0YW5jZW9mIER5bmFtaWNWYXJpYWJsZVxufVxuXG5mdW5jdGlvbiB1bmJveCAoeCwgcGF0aCkge1xuICBpZiAodHlwZW9mIHggPT09ICdmdW5jdGlvbicpIHtcbiAgICByZXR1cm4gbmV3IER5bmFtaWNWYXJpYWJsZShEWU5fRlVOQywgeClcbiAgfVxuICByZXR1cm4geFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgRHluYW1pY1ZhcmlhYmxlOiBEeW5hbWljVmFyaWFibGUsXG4gIGRlZmluZTogZGVmaW5lRHluYW1pYyxcbiAgaXNEeW5hbWljOiBpc0R5bmFtaWMsXG4gIHVuYm94OiB1bmJveCxcbiAgYWNjZXNzb3I6IHRvQWNjZXNzb3JTdHJpbmdcbn1cbiIsIlxudmFyIGlzVHlwZWRBcnJheSA9IHJlcXVpcmUoJy4vdXRpbC9pcy10eXBlZC1hcnJheScpXG52YXIgaXNOREFycmF5TGlrZSA9IHJlcXVpcmUoJy4vdXRpbC9pcy1uZGFycmF5JylcbnZhciB2YWx1ZXMgPSByZXF1aXJlKCcuL3V0aWwvdmFsdWVzJylcblxudmFyIHByaW1UeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL3ByaW1pdGl2ZXMuanNvbicpXG52YXIgdXNhZ2VUeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL3VzYWdlLmpzb24nKVxuXG52YXIgR0xfUE9JTlRTID0gMFxudmFyIEdMX0xJTkVTID0gMVxudmFyIEdMX1RSSUFOR0xFUyA9IDRcblxudmFyIEdMX0JZVEUgPSA1MTIwXG52YXIgR0xfVU5TSUdORURfQllURSA9IDUxMjFcbnZhciBHTF9TSE9SVCA9IDUxMjJcbnZhciBHTF9VTlNJR05FRF9TSE9SVCA9IDUxMjNcbnZhciBHTF9JTlQgPSA1MTI0XG52YXIgR0xfVU5TSUdORURfSU5UID0gNTEyNVxuXG52YXIgR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIgPSAzNDk2M1xuXG52YXIgR0xfU1RSRUFNX0RSQVcgPSAweDg4RTBcbnZhciBHTF9TVEFUSUNfRFJBVyA9IDB4ODhFNFxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBFbGVtZW50c1N0YXRlIChnbCwgZXh0ZW5zaW9ucywgYnVmZmVyU3RhdGUsIHN0YXRzKSB7XG4gIHZhciBlbGVtZW50U2V0ID0ge31cbiAgdmFyIGVsZW1lbnRDb3VudCA9IDBcblxuICB2YXIgZWxlbWVudFR5cGVzID0ge1xuICAgICd1aW50OCc6IEdMX1VOU0lHTkVEX0JZVEUsXG4gICAgJ3VpbnQxNic6IEdMX1VOU0lHTkVEX1NIT1JUXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5vZXNfZWxlbWVudF9pbmRleF91aW50KSB7XG4gICAgZWxlbWVudFR5cGVzLnVpbnQzMiA9IEdMX1VOU0lHTkVEX0lOVFxuICB9XG5cbiAgZnVuY3Rpb24gUkVHTEVsZW1lbnRCdWZmZXIgKGJ1ZmZlcikge1xuICAgIHRoaXMuaWQgPSBlbGVtZW50Q291bnQrK1xuICAgIGVsZW1lbnRTZXRbdGhpcy5pZF0gPSB0aGlzXG4gICAgdGhpcy5idWZmZXIgPSBidWZmZXJcbiAgICB0aGlzLnByaW1UeXBlID0gR0xfVFJJQU5HTEVTXG4gICAgdGhpcy52ZXJ0Q291bnQgPSAwXG4gICAgdGhpcy50eXBlID0gMFxuICB9XG5cbiAgUkVHTEVsZW1lbnRCdWZmZXIucHJvdG90eXBlLmJpbmQgPSBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5idWZmZXIuYmluZCgpXG4gIH1cblxuICB2YXIgYnVmZmVyUG9vbCA9IFtdXG5cbiAgZnVuY3Rpb24gY3JlYXRlRWxlbWVudFN0cmVhbSAoZGF0YSkge1xuICAgIHZhciByZXN1bHQgPSBidWZmZXJQb29sLnBvcCgpXG4gICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgIHJlc3VsdCA9IG5ldyBSRUdMRWxlbWVudEJ1ZmZlcihidWZmZXJTdGF0ZS5jcmVhdGUoXG4gICAgICAgIG51bGwsXG4gICAgICAgIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSLFxuICAgICAgICB0cnVlLFxuICAgICAgICBmYWxzZSkuX2J1ZmZlcilcbiAgICB9XG4gICAgaW5pdEVsZW1lbnRzKHJlc3VsdCwgZGF0YSwgR0xfU1RSRUFNX0RSQVcsIC0xLCAtMSwgMCwgMClcbiAgICByZXR1cm4gcmVzdWx0XG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95RWxlbWVudFN0cmVhbSAoZWxlbWVudHMpIHtcbiAgICBidWZmZXJQb29sLnB1c2goZWxlbWVudHMpXG4gIH1cblxuICBmdW5jdGlvbiBpbml0RWxlbWVudHMgKFxuICAgIGVsZW1lbnRzLFxuICAgIGRhdGEsXG4gICAgdXNhZ2UsXG4gICAgcHJpbSxcbiAgICBjb3VudCxcbiAgICBieXRlTGVuZ3RoLFxuICAgIHR5cGUpIHtcbiAgICB2YXIgcHJlZGljdGVkVHlwZSA9IHR5cGVcbiAgICBpZiAoIXR5cGUgJiYgKFxuICAgICAgICAhaXNUeXBlZEFycmF5KGRhdGEpIHx8XG4gICAgICAgKGlzTkRBcnJheUxpa2UoZGF0YSkgJiYgIWlzVHlwZWRBcnJheShkYXRhLmRhdGEpKSkpIHtcbiAgICAgIHByZWRpY3RlZFR5cGUgPSBleHRlbnNpb25zLm9lc19lbGVtZW50X2luZGV4X3VpbnRcbiAgICAgICAgPyBHTF9VTlNJR05FRF9JTlRcbiAgICAgICAgOiBHTF9VTlNJR05FRF9TSE9SVFxuICAgIH1cbiAgICBlbGVtZW50cy5idWZmZXIuYmluZCgpXG4gICAgYnVmZmVyU3RhdGUuX2luaXRCdWZmZXIoXG4gICAgICBlbGVtZW50cy5idWZmZXIsXG4gICAgICBkYXRhLFxuICAgICAgdXNhZ2UsXG4gICAgICBwcmVkaWN0ZWRUeXBlLFxuICAgICAgMylcblxuICAgIHZhciBkdHlwZSA9IHR5cGVcbiAgICBpZiAoIXR5cGUpIHtcbiAgICAgIHN3aXRjaCAoZWxlbWVudHMuYnVmZmVyLmR0eXBlKSB7XG4gICAgICAgIGNhc2UgR0xfVU5TSUdORURfQllURTpcbiAgICAgICAgY2FzZSBHTF9CWVRFOlxuICAgICAgICAgIGR0eXBlID0gR0xfVU5TSUdORURfQllURVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9TSE9SVDpcbiAgICAgICAgY2FzZSBHTF9TSE9SVDpcbiAgICAgICAgICBkdHlwZSA9IEdMX1VOU0lHTkVEX1NIT1JUXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX0lOVDpcbiAgICAgICAgY2FzZSBHTF9JTlQ6XG4gICAgICAgICAgZHR5cGUgPSBHTF9VTlNJR05FRF9JTlRcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgXG4gICAgICB9XG4gICAgICBlbGVtZW50cy5idWZmZXIuZHR5cGUgPSBkdHlwZVxuICAgIH1cbiAgICBlbGVtZW50cy50eXBlID0gZHR5cGVcblxuICAgIC8vIENoZWNrIG9lc19lbGVtZW50X2luZGV4X3VpbnQgZXh0ZW5zaW9uXG4gICAgXG5cbiAgICAvLyB0cnkgdG8gZ3Vlc3MgZGVmYXVsdCBwcmltaXRpdmUgdHlwZSBhbmQgYXJndW1lbnRzXG4gICAgdmFyIHZlcnRDb3VudCA9IGNvdW50XG4gICAgaWYgKHZlcnRDb3VudCA8IDApIHtcbiAgICAgIHZlcnRDb3VudCA9IGVsZW1lbnRzLmJ1ZmZlci5ieXRlTGVuZ3RoXG4gICAgICBpZiAoZHR5cGUgPT09IEdMX1VOU0lHTkVEX1NIT1JUKSB7XG4gICAgICAgIHZlcnRDb3VudCA+Pj0gMVxuICAgICAgfSBlbHNlIGlmIChkdHlwZSA9PT0gR0xfVU5TSUdORURfSU5UKSB7XG4gICAgICAgIHZlcnRDb3VudCA+Pj0gMlxuICAgICAgfVxuICAgIH1cbiAgICBlbGVtZW50cy52ZXJ0Q291bnQgPSB2ZXJ0Q291bnRcblxuICAgIC8vIHRyeSB0byBndWVzcyBwcmltaXRpdmUgdHlwZSBmcm9tIGNlbGwgZGltZW5zaW9uXG4gICAgdmFyIHByaW1UeXBlID0gcHJpbVxuICAgIGlmIChwcmltIDwgMCkge1xuICAgICAgcHJpbVR5cGUgPSBHTF9UUklBTkdMRVNcbiAgICAgIHZhciBkaW1lbnNpb24gPSBlbGVtZW50cy5idWZmZXIuZGltZW5zaW9uXG4gICAgICBpZiAoZGltZW5zaW9uID09PSAxKSBwcmltVHlwZSA9IEdMX1BPSU5UU1xuICAgICAgaWYgKGRpbWVuc2lvbiA9PT0gMikgcHJpbVR5cGUgPSBHTF9MSU5FU1xuICAgICAgaWYgKGRpbWVuc2lvbiA9PT0gMykgcHJpbVR5cGUgPSBHTF9UUklBTkdMRVNcbiAgICB9XG4gICAgZWxlbWVudHMucHJpbVR5cGUgPSBwcmltVHlwZVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveUVsZW1lbnRzIChlbGVtZW50cykge1xuICAgIHN0YXRzLmVsZW1lbnRzQ291bnQtLVxuXG4gICAgXG4gICAgZGVsZXRlIGVsZW1lbnRTZXRbZWxlbWVudHMuaWRdXG4gICAgZWxlbWVudHMuYnVmZmVyLmRlc3Ryb3koKVxuICAgIGVsZW1lbnRzLmJ1ZmZlciA9IG51bGxcbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZUVsZW1lbnRzIChvcHRpb25zLCBwZXJzaXN0ZW50KSB7XG4gICAgdmFyIGJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmNyZWF0ZShudWxsLCBHTF9FTEVNRU5UX0FSUkFZX0JVRkZFUiwgdHJ1ZSlcbiAgICB2YXIgZWxlbWVudHMgPSBuZXcgUkVHTEVsZW1lbnRCdWZmZXIoYnVmZmVyLl9idWZmZXIpXG4gICAgc3RhdHMuZWxlbWVudHNDb3VudCsrXG5cbiAgICBmdW5jdGlvbiByZWdsRWxlbWVudHMgKG9wdGlvbnMpIHtcbiAgICAgIGlmICghb3B0aW9ucykge1xuICAgICAgICBidWZmZXIoKVxuICAgICAgICBlbGVtZW50cy5wcmltVHlwZSA9IEdMX1RSSUFOR0xFU1xuICAgICAgICBlbGVtZW50cy52ZXJ0Q291bnQgPSAwXG4gICAgICAgIGVsZW1lbnRzLnR5cGUgPSBHTF9VTlNJR05FRF9CWVRFXG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBvcHRpb25zID09PSAnbnVtYmVyJykge1xuICAgICAgICBidWZmZXIob3B0aW9ucylcbiAgICAgICAgZWxlbWVudHMucHJpbVR5cGUgPSBHTF9UUklBTkdMRVNcbiAgICAgICAgZWxlbWVudHMudmVydENvdW50ID0gb3B0aW9ucyB8IDBcbiAgICAgICAgZWxlbWVudHMudHlwZSA9IEdMX1VOU0lHTkVEX0JZVEVcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBkYXRhID0gbnVsbFxuICAgICAgICB2YXIgdXNhZ2UgPSBHTF9TVEFUSUNfRFJBV1xuICAgICAgICB2YXIgcHJpbVR5cGUgPSAtMVxuICAgICAgICB2YXIgdmVydENvdW50ID0gLTFcbiAgICAgICAgdmFyIGJ5dGVMZW5ndGggPSAwXG4gICAgICAgIHZhciBkdHlwZSA9IDBcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkob3B0aW9ucykgfHxcbiAgICAgICAgICAgIGlzVHlwZWRBcnJheShvcHRpb25zKSB8fFxuICAgICAgICAgICAgaXNOREFycmF5TGlrZShvcHRpb25zKSkge1xuICAgICAgICAgIGRhdGEgPSBvcHRpb25zXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKCdkYXRhJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBkYXRhID0gb3B0aW9ucy5kYXRhXG4gICAgICAgICAgICBcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCd1c2FnZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgXG4gICAgICAgICAgICB1c2FnZSA9IHVzYWdlVHlwZXNbb3B0aW9ucy51c2FnZV1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCdwcmltaXRpdmUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgcHJpbVR5cGUgPSBwcmltVHlwZXNbb3B0aW9ucy5wcmltaXRpdmVdXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgnY291bnQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdmVydENvdW50ID0gb3B0aW9ucy5jb3VudCB8IDBcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCdsZW5ndGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGJ5dGVMZW5ndGggPSBvcHRpb25zLmxlbmd0aCB8IDBcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCd0eXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGR0eXBlID0gZWxlbWVudFR5cGVzW29wdGlvbnMudHlwZV1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGRhdGEpIHtcbiAgICAgICAgICBpbml0RWxlbWVudHMoXG4gICAgICAgICAgICBlbGVtZW50cyxcbiAgICAgICAgICAgIGRhdGEsXG4gICAgICAgICAgICB1c2FnZSxcbiAgICAgICAgICAgIHByaW1UeXBlLFxuICAgICAgICAgICAgdmVydENvdW50LFxuICAgICAgICAgICAgYnl0ZUxlbmd0aCxcbiAgICAgICAgICAgIGR0eXBlKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHZhciBfYnVmZmVyID0gZWxlbWVudHMuYnVmZmVyXG4gICAgICAgICAgX2J1ZmZlci5iaW5kKClcbiAgICAgICAgICBnbC5idWZmZXJEYXRhKEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSLCBieXRlTGVuZ3RoLCB1c2FnZSlcbiAgICAgICAgICBfYnVmZmVyLmR0eXBlID0gZHR5cGUgfHwgR0xfVU5TSUdORURfQllURVxuICAgICAgICAgIF9idWZmZXIudXNhZ2UgPSB1c2FnZVxuICAgICAgICAgIF9idWZmZXIuZGltZW5zaW9uID0gM1xuICAgICAgICAgIF9idWZmZXIuYnl0ZUxlbmd0aCA9IGJ5dGVMZW5ndGhcbiAgICAgICAgICBlbGVtZW50cy5wcmltVHlwZSA9IHByaW1UeXBlIDwgMCA/IEdMX1RSSUFOR0xFUyA6IHByaW1UeXBlXG4gICAgICAgICAgZWxlbWVudHMudmVydENvdW50ID0gdmVydENvdW50IDwgMCA/IDAgOiB2ZXJ0Q291bnRcbiAgICAgICAgICBlbGVtZW50cy50eXBlID0gX2J1ZmZlci5kdHlwZVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZWdsRWxlbWVudHNcbiAgICB9XG5cbiAgICByZWdsRWxlbWVudHMob3B0aW9ucylcblxuICAgIHJlZ2xFbGVtZW50cy5fcmVnbFR5cGUgPSAnZWxlbWVudHMnXG4gICAgcmVnbEVsZW1lbnRzLl9lbGVtZW50cyA9IGVsZW1lbnRzXG4gICAgcmVnbEVsZW1lbnRzLnN1YmRhdGEgPSBmdW5jdGlvbiAoZGF0YSwgb2Zmc2V0KSB7XG4gICAgICBidWZmZXIuc3ViZGF0YShkYXRhLCBvZmZzZXQpXG4gICAgICByZXR1cm4gcmVnbEVsZW1lbnRzXG4gICAgfVxuICAgIHJlZ2xFbGVtZW50cy5kZXN0cm95ID0gZnVuY3Rpb24gKCkge1xuICAgICAgZGVzdHJveUVsZW1lbnRzKGVsZW1lbnRzKVxuICAgIH1cblxuICAgIHJldHVybiByZWdsRWxlbWVudHNcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY3JlYXRlOiBjcmVhdGVFbGVtZW50cyxcbiAgICBjcmVhdGVTdHJlYW06IGNyZWF0ZUVsZW1lbnRTdHJlYW0sXG4gICAgZGVzdHJveVN0cmVhbTogZGVzdHJveUVsZW1lbnRTdHJlYW0sXG4gICAgZ2V0RWxlbWVudHM6IGZ1bmN0aW9uIChlbGVtZW50cykge1xuICAgICAgaWYgKHR5cGVvZiBlbGVtZW50cyA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgICAgIGVsZW1lbnRzLl9lbGVtZW50cyBpbnN0YW5jZW9mIFJFR0xFbGVtZW50QnVmZmVyKSB7XG4gICAgICAgIHJldHVybiBlbGVtZW50cy5fZWxlbWVudHNcbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsXG4gICAgfSxcbiAgICBjbGVhcjogZnVuY3Rpb24gKCkge1xuICAgICAgdmFsdWVzKGVsZW1lbnRTZXQpLmZvckVhY2goZGVzdHJveUVsZW1lbnRzKVxuICAgIH1cbiAgfVxufVxuIiwiXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY3JlYXRlRXh0ZW5zaW9uQ2FjaGUgKGdsLCBjb25maWcpIHtcbiAgdmFyIGV4dGVuc2lvbnMgPSB7fVxuXG4gIGZ1bmN0aW9uIHRyeUxvYWRFeHRlbnNpb24gKG5hbWVfKSB7XG4gICAgXG4gICAgdmFyIG5hbWUgPSBuYW1lXy50b0xvd2VyQ2FzZSgpXG4gICAgdmFyIGV4dFxuICAgIHRyeSB7XG4gICAgICBleHQgPSBleHRlbnNpb25zW25hbWVdID0gZ2wuZ2V0RXh0ZW5zaW9uKG5hbWUpXG4gICAgfSBjYXRjaCAoZSkge31cbiAgICByZXR1cm4gISFleHRcbiAgfVxuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgY29uZmlnLmV4dGVuc2lvbnMubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgbmFtZSA9IGNvbmZpZy5leHRlbnNpb25zW2ldXG4gICAgaWYgKCF0cnlMb2FkRXh0ZW5zaW9uKG5hbWUpKSB7XG4gICAgICBjb25maWcub25EZXN0cm95KClcbiAgICAgIGNvbmZpZy5vbkRvbmUoJ1wiJyArIG5hbWUgKyAnXCIgZXh0ZW5zaW9uIGlzIG5vdCBzdXBwb3J0ZWQgYnkgdGhlIGN1cnJlbnQgV2ViR0wgY29udGV4dCwgdHJ5IHVwZ3JhZGluZyB5b3VyIHN5c3RlbSBvciBhIGRpZmZlcmVudCBicm93c2VyJylcbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuICB9XG5cbiAgY29uZmlnLm9wdGlvbmFsRXh0ZW5zaW9ucy5mb3JFYWNoKHRyeUxvYWRFeHRlbnNpb24pXG5cbiAgcmV0dXJuIHtcbiAgICBleHRlbnNpb25zOiBleHRlbnNpb25zLFxuICAgIHJlc3RvcmU6IGZ1bmN0aW9uICgpIHtcbiAgICAgIE9iamVjdC5rZXlzKGV4dGVuc2lvbnMpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgaWYgKCF0cnlMb2FkRXh0ZW5zaW9uKG5hbWUpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCcocmVnbCk6IGVycm9yIHJlc3RvcmluZyBleHRlbnNpb24gJyArIG5hbWUpXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgfVxuICB9XG59XG4iLCJcbnZhciB2YWx1ZXMgPSByZXF1aXJlKCcuL3V0aWwvdmFsdWVzJylcbnZhciBleHRlbmQgPSByZXF1aXJlKCcuL3V0aWwvZXh0ZW5kJylcblxuLy8gV2Ugc3RvcmUgdGhlc2UgY29uc3RhbnRzIHNvIHRoYXQgdGhlIG1pbmlmaWVyIGNhbiBpbmxpbmUgdGhlbVxudmFyIEdMX0ZSQU1FQlVGRkVSID0gMHg4RDQwXG52YXIgR0xfUkVOREVSQlVGRkVSID0gMHg4RDQxXG5cbnZhciBHTF9URVhUVVJFXzJEID0gMHgwREUxXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YID0gMHg4NTE1XG5cbnZhciBHTF9DT0xPUl9BVFRBQ0hNRU5UMCA9IDB4OENFMFxudmFyIEdMX0RFUFRIX0FUVEFDSE1FTlQgPSAweDhEMDBcbnZhciBHTF9TVEVOQ0lMX0FUVEFDSE1FTlQgPSAweDhEMjBcbnZhciBHTF9ERVBUSF9TVEVOQ0lMX0FUVEFDSE1FTlQgPSAweDgyMUFcblxudmFyIEdMX0ZSQU1FQlVGRkVSX0NPTVBMRVRFID0gMHg4Q0Q1XG52YXIgR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9BVFRBQ0hNRU5UID0gMHg4Q0Q2XG52YXIgR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9NSVNTSU5HX0FUVEFDSE1FTlQgPSAweDhDRDdcbnZhciBHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX0RJTUVOU0lPTlMgPSAweDhDRDlcbnZhciBHTF9GUkFNRUJVRkZFUl9VTlNVUFBPUlRFRCA9IDB4OENERFxuXG52YXIgR0xfSEFMRl9GTE9BVF9PRVMgPSAweDhENjFcbnZhciBHTF9VTlNJR05FRF9CWVRFID0gMHgxNDAxXG52YXIgR0xfRkxPQVQgPSAweDE0MDZcblxudmFyIEdMX1JHQkEgPSAweDE5MDhcblxudmFyIEdMX0RFUFRIX0NPTVBPTkVOVCA9IDB4MTkwMlxuXG52YXIgY29sb3JUZXh0dXJlRm9ybWF0RW51bXMgPSBbXG4gIEdMX1JHQkFcbl1cblxuLy8gZm9yIGV2ZXJ5IHRleHR1cmUgZm9ybWF0LCBzdG9yZVxuLy8gdGhlIG51bWJlciBvZiBjaGFubmVsc1xudmFyIHRleHR1cmVGb3JtYXRDaGFubmVscyA9IFtdXG50ZXh0dXJlRm9ybWF0Q2hhbm5lbHNbR0xfUkdCQV0gPSA0XG5cbi8vIGZvciBldmVyeSB0ZXh0dXJlIHR5cGUsIHN0b3JlXG4vLyB0aGUgc2l6ZSBpbiBieXRlcy5cbnZhciB0ZXh0dXJlVHlwZVNpemVzID0gW11cbnRleHR1cmVUeXBlU2l6ZXNbR0xfVU5TSUdORURfQllURV0gPSAxXG50ZXh0dXJlVHlwZVNpemVzW0dMX0ZMT0FUXSA9IDRcbnRleHR1cmVUeXBlU2l6ZXNbR0xfSEFMRl9GTE9BVF9PRVNdID0gMlxuXG52YXIgR0xfUkdCQTQgPSAweDgwNTZcbnZhciBHTF9SR0I1X0ExID0gMHg4MDU3XG52YXIgR0xfUkdCNTY1ID0gMHg4RDYyXG52YXIgR0xfREVQVEhfQ09NUE9ORU5UMTYgPSAweDgxQTVcbnZhciBHTF9TVEVOQ0lMX0lOREVYOCA9IDB4OEQ0OFxudmFyIEdMX0RFUFRIX1NURU5DSUwgPSAweDg0RjlcblxudmFyIEdMX1NSR0I4X0FMUEhBOF9FWFQgPSAweDhDNDNcblxudmFyIEdMX1JHQkEzMkZfRVhUID0gMHg4ODE0XG5cbnZhciBHTF9SR0JBMTZGX0VYVCA9IDB4ODgxQVxudmFyIEdMX1JHQjE2Rl9FWFQgPSAweDg4MUJcblxudmFyIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0RW51bXMgPSBbXG4gIEdMX1JHQkE0LFxuICBHTF9SR0I1X0ExLFxuICBHTF9SR0I1NjUsXG4gIEdMX1NSR0I4X0FMUEhBOF9FWFQsXG4gIEdMX1JHQkExNkZfRVhULFxuICBHTF9SR0IxNkZfRVhULFxuICBHTF9SR0JBMzJGX0VYVFxuXVxuXG52YXIgc3RhdHVzQ29kZSA9IHt9XG5zdGF0dXNDb2RlW0dMX0ZSQU1FQlVGRkVSX0NPTVBMRVRFXSA9ICdjb21wbGV0ZSdcbnN0YXR1c0NvZGVbR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9BVFRBQ0hNRU5UXSA9ICdpbmNvbXBsZXRlIGF0dGFjaG1lbnQnXG5zdGF0dXNDb2RlW0dMX0ZSQU1FQlVGRkVSX0lOQ09NUExFVEVfRElNRU5TSU9OU10gPSAnaW5jb21wbGV0ZSBkaW1lbnNpb25zJ1xuc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX01JU1NJTkdfQVRUQUNITUVOVF0gPSAnaW5jb21wbGV0ZSwgbWlzc2luZyBhdHRhY2htZW50J1xuc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9VTlNVUFBPUlRFRF0gPSAndW5zdXBwb3J0ZWQnXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcEZCT1N0YXRlIChcbiAgZ2wsXG4gIGV4dGVuc2lvbnMsXG4gIGxpbWl0cyxcbiAgdGV4dHVyZVN0YXRlLFxuICByZW5kZXJidWZmZXJTdGF0ZSxcbiAgc3RhdHMpIHtcbiAgdmFyIGZyYW1lYnVmZmVyU3RhdGUgPSB7XG4gICAgY3VyOiBudWxsLFxuICAgIG5leHQ6IG51bGwsXG4gICAgZGlydHk6IGZhbHNlXG4gIH1cblxuICB2YXIgY29sb3JUZXh0dXJlRm9ybWF0cyA9IFsncmdiYSddXG4gIHZhciBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHMgPSBbJ3JnYmE0JywgJ3JnYjU2NScsICdyZ2I1IGExJ11cblxuICBpZiAoZXh0ZW5zaW9ucy5leHRfc3JnYikge1xuICAgIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0cy5wdXNoKCdzcmdiYScpXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5leHRfY29sb3JfYnVmZmVyX2hhbGZfZmxvYXQpIHtcbiAgICBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHMucHVzaCgncmdiYTE2ZicsICdyZ2IxNmYnKVxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29sb3JfYnVmZmVyX2Zsb2F0KSB7XG4gICAgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzLnB1c2goJ3JnYmEzMmYnKVxuICB9XG5cbiAgdmFyIGNvbG9yVHlwZXMgPSBbJ3VpbnQ4J11cbiAgaWYgKGV4dGVuc2lvbnMub2VzX3RleHR1cmVfaGFsZl9mbG9hdCkge1xuICAgIGNvbG9yVHlwZXMucHVzaCgnaGFsZiBmbG9hdCcsICdmbG9hdDE2JylcbiAgfVxuICBpZiAoZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9mbG9hdCkge1xuICAgIGNvbG9yVHlwZXMucHVzaCgnZmxvYXQnLCAnZmxvYXQzMicpXG4gIH1cblxuICBmdW5jdGlvbiBGcmFtZWJ1ZmZlckF0dGFjaG1lbnQgKHRhcmdldCwgdGV4dHVyZSwgcmVuZGVyYnVmZmVyKSB7XG4gICAgdGhpcy50YXJnZXQgPSB0YXJnZXRcbiAgICB0aGlzLnRleHR1cmUgPSB0ZXh0dXJlXG4gICAgdGhpcy5yZW5kZXJidWZmZXIgPSByZW5kZXJidWZmZXJcblxuICAgIHZhciB3ID0gMFxuICAgIHZhciBoID0gMFxuICAgIGlmICh0ZXh0dXJlKSB7XG4gICAgICB3ID0gdGV4dHVyZS53aWR0aFxuICAgICAgaCA9IHRleHR1cmUuaGVpZ2h0XG4gICAgfSBlbHNlIGlmIChyZW5kZXJidWZmZXIpIHtcbiAgICAgIHcgPSByZW5kZXJidWZmZXIud2lkdGhcbiAgICAgIGggPSByZW5kZXJidWZmZXIuaGVpZ2h0XG4gICAgfVxuICAgIHRoaXMud2lkdGggPSB3XG4gICAgdGhpcy5oZWlnaHQgPSBoXG4gIH1cblxuICBmdW5jdGlvbiBkZWNSZWYgKGF0dGFjaG1lbnQpIHtcbiAgICBpZiAoYXR0YWNobWVudCkge1xuICAgICAgaWYgKGF0dGFjaG1lbnQudGV4dHVyZSkge1xuICAgICAgICBhdHRhY2htZW50LnRleHR1cmUuX3RleHR1cmUuZGVjUmVmKClcbiAgICAgIH1cbiAgICAgIGlmIChhdHRhY2htZW50LnJlbmRlcmJ1ZmZlcikge1xuICAgICAgICBhdHRhY2htZW50LnJlbmRlcmJ1ZmZlci5fcmVuZGVyYnVmZmVyLmRlY1JlZigpXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaW5jUmVmQW5kQ2hlY2tTaGFwZSAoYXR0YWNobWVudCwgd2lkdGgsIGhlaWdodCkge1xuICAgIGlmICghYXR0YWNobWVudCkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIGlmIChhdHRhY2htZW50LnRleHR1cmUpIHtcbiAgICAgIHZhciB0ZXh0dXJlID0gYXR0YWNobWVudC50ZXh0dXJlLl90ZXh0dXJlXG4gICAgICB2YXIgdHcgPSBNYXRoLm1heCgxLCB0ZXh0dXJlLndpZHRoKVxuICAgICAgdmFyIHRoID0gTWF0aC5tYXgoMSwgdGV4dHVyZS5oZWlnaHQpXG4gICAgICBcbiAgICAgIHRleHR1cmUucmVmQ291bnQgKz0gMVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgcmVuZGVyYnVmZmVyID0gYXR0YWNobWVudC5yZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlclxuICAgICAgXG4gICAgICByZW5kZXJidWZmZXIucmVmQ291bnQgKz0gMVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGF0dGFjaCAobG9jYXRpb24sIGF0dGFjaG1lbnQpIHtcbiAgICBpZiAoYXR0YWNobWVudCkge1xuICAgICAgaWYgKGF0dGFjaG1lbnQudGV4dHVyZSkge1xuICAgICAgICBnbC5mcmFtZWJ1ZmZlclRleHR1cmUyRChcbiAgICAgICAgICBHTF9GUkFNRUJVRkZFUixcbiAgICAgICAgICBsb2NhdGlvbixcbiAgICAgICAgICBhdHRhY2htZW50LnRhcmdldCxcbiAgICAgICAgICBhdHRhY2htZW50LnRleHR1cmUuX3RleHR1cmUudGV4dHVyZSxcbiAgICAgICAgICAwKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZ2wuZnJhbWVidWZmZXJSZW5kZXJidWZmZXIoXG4gICAgICAgICAgR0xfRlJBTUVCVUZGRVIsXG4gICAgICAgICAgbG9jYXRpb24sXG4gICAgICAgICAgR0xfUkVOREVSQlVGRkVSLFxuICAgICAgICAgIGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXIucmVuZGVyYnVmZmVyKVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBnbC5mcmFtZWJ1ZmZlclRleHR1cmUyRChcbiAgICAgICAgR0xfRlJBTUVCVUZGRVIsXG4gICAgICAgIGxvY2F0aW9uLFxuICAgICAgICBHTF9URVhUVVJFXzJELFxuICAgICAgICBudWxsLFxuICAgICAgICAwKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlQXR0YWNobWVudCAoYXR0YWNobWVudCkge1xuICAgIHZhciB0YXJnZXQgPSBHTF9URVhUVVJFXzJEXG4gICAgdmFyIHRleHR1cmUgPSBudWxsXG4gICAgdmFyIHJlbmRlcmJ1ZmZlciA9IG51bGxcblxuICAgIHZhciBkYXRhID0gYXR0YWNobWVudFxuICAgIGlmICh0eXBlb2YgYXR0YWNobWVudCA9PT0gJ29iamVjdCcpIHtcbiAgICAgIGRhdGEgPSBhdHRhY2htZW50LmRhdGFcbiAgICAgIGlmICgndGFyZ2V0JyBpbiBhdHRhY2htZW50KSB7XG4gICAgICAgIHRhcmdldCA9IGF0dGFjaG1lbnQudGFyZ2V0IHwgMFxuICAgICAgfVxuICAgIH1cblxuICAgIFxuXG4gICAgdmFyIHR5cGUgPSBkYXRhLl9yZWdsVHlwZVxuICAgIGlmICh0eXBlID09PSAndGV4dHVyZTJkJykge1xuICAgICAgdGV4dHVyZSA9IGRhdGFcbiAgICAgIFxuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3RleHR1cmVDdWJlJykge1xuICAgICAgdGV4dHVyZSA9IGRhdGFcbiAgICAgIFxuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3JlbmRlcmJ1ZmZlcicpIHtcbiAgICAgIHJlbmRlcmJ1ZmZlciA9IGRhdGFcbiAgICAgIHRhcmdldCA9IEdMX1JFTkRFUkJVRkZFUlxuICAgIH0gZWxzZSB7XG4gICAgICBcbiAgICB9XG5cbiAgICByZXR1cm4gbmV3IEZyYW1lYnVmZmVyQXR0YWNobWVudCh0YXJnZXQsIHRleHR1cmUsIHJlbmRlcmJ1ZmZlcilcbiAgfVxuXG4gIGZ1bmN0aW9uIGFsbG9jQXR0YWNobWVudCAoXG4gICAgd2lkdGgsXG4gICAgaGVpZ2h0LFxuICAgIGlzVGV4dHVyZSxcbiAgICBmb3JtYXQsXG4gICAgdHlwZSkge1xuICAgIGlmIChpc1RleHR1cmUpIHtcbiAgICAgIHZhciB0ZXh0dXJlID0gdGV4dHVyZVN0YXRlLmNyZWF0ZTJEKHtcbiAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICBoZWlnaHQ6IGhlaWdodCxcbiAgICAgICAgZm9ybWF0OiBmb3JtYXQsXG4gICAgICAgIHR5cGU6IHR5cGVcbiAgICAgIH0pXG4gICAgICB0ZXh0dXJlLl90ZXh0dXJlLnJlZkNvdW50ID0gMFxuICAgICAgcmV0dXJuIG5ldyBGcmFtZWJ1ZmZlckF0dGFjaG1lbnQoR0xfVEVYVFVSRV8yRCwgdGV4dHVyZSwgbnVsbClcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIHJiID0gcmVuZGVyYnVmZmVyU3RhdGUuY3JlYXRlKHtcbiAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICBoZWlnaHQ6IGhlaWdodCxcbiAgICAgICAgZm9ybWF0OiBmb3JtYXRcbiAgICAgIH0pXG4gICAgICByYi5fcmVuZGVyYnVmZmVyLnJlZkNvdW50ID0gMFxuICAgICAgcmV0dXJuIG5ldyBGcmFtZWJ1ZmZlckF0dGFjaG1lbnQoR0xfUkVOREVSQlVGRkVSLCBudWxsLCByYilcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiB1bndyYXBBdHRhY2htZW50IChhdHRhY2htZW50KSB7XG4gICAgcmV0dXJuIGF0dGFjaG1lbnQgJiYgKGF0dGFjaG1lbnQudGV4dHVyZSB8fCBhdHRhY2htZW50LnJlbmRlcmJ1ZmZlcilcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlc2l6ZUF0dGFjaG1lbnQgKGF0dGFjaG1lbnQsIHcsIGgpIHtcbiAgICBpZiAoYXR0YWNobWVudCkge1xuICAgICAgaWYgKGF0dGFjaG1lbnQudGV4dHVyZSkge1xuICAgICAgICBhdHRhY2htZW50LnRleHR1cmUucmVzaXplKHcsIGgpXG4gICAgICB9IGVsc2UgaWYgKGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyKSB7XG4gICAgICAgIGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyLnJlc2l6ZSh3LCBoKVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHZhciBmcmFtZWJ1ZmZlckNvdW50ID0gMFxuICB2YXIgZnJhbWVidWZmZXJTZXQgPSB7fVxuXG4gIGZ1bmN0aW9uIFJFR0xGcmFtZWJ1ZmZlciAoKSB7XG4gICAgdGhpcy5pZCA9IGZyYW1lYnVmZmVyQ291bnQrK1xuICAgIGZyYW1lYnVmZmVyU2V0W3RoaXMuaWRdID0gdGhpc1xuXG4gICAgdGhpcy5mcmFtZWJ1ZmZlciA9IGdsLmNyZWF0ZUZyYW1lYnVmZmVyKClcbiAgICB0aGlzLndpZHRoID0gMFxuICAgIHRoaXMuaGVpZ2h0ID0gMFxuXG4gICAgdGhpcy5jb2xvckF0dGFjaG1lbnRzID0gW11cbiAgICB0aGlzLmRlcHRoQXR0YWNobWVudCA9IG51bGxcbiAgICB0aGlzLnN0ZW5jaWxBdHRhY2htZW50ID0gbnVsbFxuICAgIHRoaXMuZGVwdGhTdGVuY2lsQXR0YWNobWVudCA9IG51bGxcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlY0ZCT1JlZnMgKGZyYW1lYnVmZmVyKSB7XG4gICAgZnJhbWVidWZmZXIuY29sb3JBdHRhY2htZW50cy5mb3JFYWNoKGRlY1JlZilcbiAgICBkZWNSZWYoZnJhbWVidWZmZXIuZGVwdGhBdHRhY2htZW50KVxuICAgIGRlY1JlZihmcmFtZWJ1ZmZlci5zdGVuY2lsQXR0YWNobWVudClcbiAgICBkZWNSZWYoZnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsQXR0YWNobWVudClcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3kgKGZyYW1lYnVmZmVyKSB7XG4gICAgdmFyIGhhbmRsZSA9IGZyYW1lYnVmZmVyLmZyYW1lYnVmZmVyXG4gICAgXG4gICAgZ2wuZGVsZXRlRnJhbWVidWZmZXIoaGFuZGxlKVxuICAgIGZyYW1lYnVmZmVyLmZyYW1lYnVmZmVyID0gbnVsbFxuICAgIHN0YXRzLmZyYW1lYnVmZmVyQ291bnQtLVxuICAgIGRlbGV0ZSBmcmFtZWJ1ZmZlclNldFtmcmFtZWJ1ZmZlci5pZF1cbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZUZyYW1lYnVmZmVyIChmcmFtZWJ1ZmZlcikge1xuICAgIHZhciBpXG5cbiAgICBnbC5iaW5kRnJhbWVidWZmZXIoR0xfRlJBTUVCVUZGRVIsIGZyYW1lYnVmZmVyLmZyYW1lYnVmZmVyKVxuICAgIHZhciBjb2xvckF0dGFjaG1lbnRzID0gZnJhbWVidWZmZXIuY29sb3JBdHRhY2htZW50c1xuICAgIGZvciAoaSA9IDA7IGkgPCBjb2xvckF0dGFjaG1lbnRzLmxlbmd0aDsgKytpKSB7XG4gICAgICBhdHRhY2goR0xfQ09MT1JfQVRUQUNITUVOVDAgKyBpLCBjb2xvckF0dGFjaG1lbnRzW2ldKVxuICAgIH1cbiAgICBmb3IgKGkgPSBjb2xvckF0dGFjaG1lbnRzLmxlbmd0aDsgaSA8IGxpbWl0cy5tYXhDb2xvckF0dGFjaG1lbnRzOyArK2kpIHtcbiAgICAgIGF0dGFjaChHTF9DT0xPUl9BVFRBQ0hNRU5UMCArIGksIG51bGwpXG4gICAgfVxuICAgIGF0dGFjaChHTF9ERVBUSF9BVFRBQ0hNRU5ULCBmcmFtZWJ1ZmZlci5kZXB0aEF0dGFjaG1lbnQpXG4gICAgYXR0YWNoKEdMX1NURU5DSUxfQVRUQUNITUVOVCwgZnJhbWVidWZmZXIuc3RlbmNpbEF0dGFjaG1lbnQpXG4gICAgYXR0YWNoKEdMX0RFUFRIX1NURU5DSUxfQVRUQUNITUVOVCwgZnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsQXR0YWNobWVudClcblxuICAgIC8vIENoZWNrIHN0YXR1cyBjb2RlXG4gICAgdmFyIHN0YXR1cyA9IGdsLmNoZWNrRnJhbWVidWZmZXJTdGF0dXMoR0xfRlJBTUVCVUZGRVIpXG4gICAgaWYgKHN0YXR1cyAhPT0gR0xfRlJBTUVCVUZGRVJfQ09NUExFVEUpIHtcbiAgICAgIFxuICAgIH1cblxuICAgIGdsLmJpbmRGcmFtZWJ1ZmZlcihHTF9GUkFNRUJVRkZFUiwgZnJhbWVidWZmZXJTdGF0ZS5uZXh0KVxuICAgIGZyYW1lYnVmZmVyU3RhdGUuY3VyID0gZnJhbWVidWZmZXJTdGF0ZS5uZXh0XG5cbiAgICAvLyBGSVhNRTogQ2xlYXIgZXJyb3IgY29kZSBoZXJlLiAgVGhpcyBpcyBhIHdvcmsgYXJvdW5kIGZvciBhIGJ1ZyBpblxuICAgIC8vIGhlYWRsZXNzLWdsXG4gICAgZ2wuZ2V0RXJyb3IoKVxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlRkJPIChhMCwgYTEpIHtcbiAgICB2YXIgZnJhbWVidWZmZXIgPSBuZXcgUkVHTEZyYW1lYnVmZmVyKClcbiAgICBzdGF0cy5mcmFtZWJ1ZmZlckNvdW50KytcblxuICAgIGZ1bmN0aW9uIHJlZ2xGcmFtZWJ1ZmZlciAoYSwgYikge1xuICAgICAgdmFyIGlcblxuICAgICAgXG5cbiAgICAgIHZhciBleHREcmF3QnVmZmVycyA9IGV4dGVuc2lvbnMud2ViZ2xfZHJhd19idWZmZXJzXG5cbiAgICAgIHZhciB3aWR0aCA9IDBcbiAgICAgIHZhciBoZWlnaHQgPSAwXG5cbiAgICAgIHZhciBuZWVkc0RlcHRoID0gdHJ1ZVxuICAgICAgdmFyIG5lZWRzU3RlbmNpbCA9IHRydWVcblxuICAgICAgdmFyIGNvbG9yQnVmZmVyID0gbnVsbFxuICAgICAgdmFyIGNvbG9yVGV4dHVyZSA9IHRydWVcbiAgICAgIHZhciBjb2xvckZvcm1hdCA9ICdyZ2JhJ1xuICAgICAgdmFyIGNvbG9yVHlwZSA9ICd1aW50OCdcbiAgICAgIHZhciBjb2xvckNvdW50ID0gMVxuXG4gICAgICB2YXIgZGVwdGhCdWZmZXIgPSBudWxsXG4gICAgICB2YXIgc3RlbmNpbEJ1ZmZlciA9IG51bGxcbiAgICAgIHZhciBkZXB0aFN0ZW5jaWxCdWZmZXIgPSBudWxsXG4gICAgICB2YXIgZGVwdGhTdGVuY2lsVGV4dHVyZSA9IGZhbHNlXG5cbiAgICAgIGlmICh0eXBlb2YgYSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgd2lkdGggPSBhIHwgMFxuICAgICAgICBoZWlnaHQgPSAoYiB8IDApIHx8IHdpZHRoXG4gICAgICB9IGVsc2UgaWYgKCFhKSB7XG4gICAgICAgIHdpZHRoID0gaGVpZ2h0ID0gMVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgXG4gICAgICAgIHZhciBvcHRpb25zID0gYVxuXG4gICAgICAgIGlmICgnc2hhcGUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB2YXIgc2hhcGUgPSBvcHRpb25zLnNoYXBlXG4gICAgICAgICAgXG4gICAgICAgICAgd2lkdGggPSBzaGFwZVswXVxuICAgICAgICAgIGhlaWdodCA9IHNoYXBlWzFdXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWYgKCdyYWRpdXMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIHdpZHRoID0gaGVpZ2h0ID0gb3B0aW9ucy5yYWRpdXNcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCd3aWR0aCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgd2lkdGggPSBvcHRpb25zLndpZHRoXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgnaGVpZ2h0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBoZWlnaHQgPSBvcHRpb25zLmhlaWdodFxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnY29sb3InIGluIG9wdGlvbnMgfHxcbiAgICAgICAgICAgICdjb2xvcnMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBjb2xvckJ1ZmZlciA9XG4gICAgICAgICAgICBvcHRpb25zLmNvbG9yIHx8XG4gICAgICAgICAgICBvcHRpb25zLmNvbG9yc1xuICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KGNvbG9yQnVmZmVyKSkge1xuICAgICAgICAgICAgXG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFjb2xvckJ1ZmZlcikge1xuICAgICAgICAgIGlmICgnY29sb3JDb3VudCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgY29sb3JDb3VudCA9IG9wdGlvbnMuY29sb3JDb3VudCB8IDBcbiAgICAgICAgICAgIFxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmICgnY29sb3JUZXh0dXJlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBjb2xvclRleHR1cmUgPSAhIW9wdGlvbnMuY29sb3JUZXh0dXJlXG4gICAgICAgICAgICBjb2xvckZvcm1hdCA9ICdyZ2JhNCdcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoJ2NvbG9yVHlwZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgY29sb3JUeXBlID0gb3B0aW9ucy5jb2xvclR5cGVcbiAgICAgICAgICAgIGlmICghY29sb3JUZXh0dXJlKSB7XG4gICAgICAgICAgICAgIGlmIChjb2xvclR5cGUgPT09ICdoYWxmIGZsb2F0JyB8fCBjb2xvclR5cGUgPT09ICdmbG9hdDE2Jykge1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGNvbG9yRm9ybWF0ID0gJ3JnYmExNmYnXG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAoY29sb3JUeXBlID09PSAnZmxvYXQnIHx8IGNvbG9yVHlwZSA9PT0gJ2Zsb2F0MzInKSB7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgY29sb3JGb3JtYXQgPSAncmdiYTMyZidcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKCdjb2xvckZvcm1hdCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgY29sb3JGb3JtYXQgPSBvcHRpb25zLmNvbG9yRm9ybWF0XG4gICAgICAgICAgICBpZiAoY29sb3JUZXh0dXJlRm9ybWF0cy5pbmRleE9mKGNvbG9yRm9ybWF0KSA+PSAwKSB7XG4gICAgICAgICAgICAgIGNvbG9yVGV4dHVyZSA9IHRydWVcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzLmluZGV4T2YoY29sb3JGb3JtYXQpID49IDApIHtcbiAgICAgICAgICAgICAgY29sb3JUZXh0dXJlID0gZmFsc2VcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGlmIChjb2xvclRleHR1cmUpIHtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnZGVwdGhUZXh0dXJlJyBpbiBvcHRpb25zIHx8ICdkZXB0aFN0ZW5jaWxUZXh0dXJlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgZGVwdGhTdGVuY2lsVGV4dHVyZSA9ICEhKG9wdGlvbnMuZGVwdGhUZXh0dXJlIHx8XG4gICAgICAgICAgICBvcHRpb25zLmRlcHRoU3RlbmNpbFRleHR1cmUpXG4gICAgICAgICAgXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ2RlcHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiBvcHRpb25zLmRlcHRoID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgIG5lZWRzRGVwdGggPSBvcHRpb25zLmRlcHRoXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGRlcHRoQnVmZmVyID0gb3B0aW9ucy5kZXB0aFxuICAgICAgICAgICAgbmVlZHNTdGVuY2lsID0gZmFsc2VcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ3N0ZW5jaWwnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBpZiAodHlwZW9mIG9wdGlvbnMuc3RlbmNpbCA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgICBuZWVkc1N0ZW5jaWwgPSBvcHRpb25zLnN0ZW5jaWxcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc3RlbmNpbEJ1ZmZlciA9IG9wdGlvbnMuc3RlbmNpbFxuICAgICAgICAgICAgbmVlZHNEZXB0aCA9IGZhbHNlXG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdkZXB0aFN0ZW5jaWwnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBpZiAodHlwZW9mIG9wdGlvbnMuZGVwdGhTdGVuY2lsID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgIG5lZWRzRGVwdGggPSBuZWVkc1N0ZW5jaWwgPSBvcHRpb25zLmRlcHRoU3RlbmNpbFxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBkZXB0aFN0ZW5jaWxCdWZmZXIgPSBvcHRpb25zLmRlcHRoU3RlbmNpbFxuICAgICAgICAgICAgbmVlZHNEZXB0aCA9IGZhbHNlXG4gICAgICAgICAgICBuZWVkc1N0ZW5jaWwgPSBmYWxzZVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBwYXJzZSBhdHRhY2htZW50c1xuICAgICAgdmFyIGNvbG9yQXR0YWNobWVudHMgPSBudWxsXG4gICAgICB2YXIgZGVwdGhBdHRhY2htZW50ID0gbnVsbFxuICAgICAgdmFyIHN0ZW5jaWxBdHRhY2htZW50ID0gbnVsbFxuICAgICAgdmFyIGRlcHRoU3RlbmNpbEF0dGFjaG1lbnQgPSBudWxsXG5cbiAgICAgIC8vIFNldCB1cCBjb2xvciBhdHRhY2htZW50c1xuICAgICAgaWYgKEFycmF5LmlzQXJyYXkoY29sb3JCdWZmZXIpKSB7XG4gICAgICAgIGNvbG9yQXR0YWNobWVudHMgPSBjb2xvckJ1ZmZlci5tYXAocGFyc2VBdHRhY2htZW50KVxuICAgICAgfSBlbHNlIGlmIChjb2xvckJ1ZmZlcikge1xuICAgICAgICBjb2xvckF0dGFjaG1lbnRzID0gW3BhcnNlQXR0YWNobWVudChjb2xvckJ1ZmZlcildXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb2xvckF0dGFjaG1lbnRzID0gbmV3IEFycmF5KGNvbG9yQ291bnQpXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xvckNvdW50OyArK2kpIHtcbiAgICAgICAgICBjb2xvckF0dGFjaG1lbnRzW2ldID0gYWxsb2NBdHRhY2htZW50KFxuICAgICAgICAgICAgd2lkdGgsXG4gICAgICAgICAgICBoZWlnaHQsXG4gICAgICAgICAgICBjb2xvclRleHR1cmUsXG4gICAgICAgICAgICBjb2xvckZvcm1hdCxcbiAgICAgICAgICAgIGNvbG9yVHlwZSlcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBcbiAgICAgIFxuXG4gICAgICB3aWR0aCA9IHdpZHRoIHx8IGNvbG9yQXR0YWNobWVudHNbMF0ud2lkdGhcbiAgICAgIGhlaWdodCA9IGhlaWdodCB8fCBjb2xvckF0dGFjaG1lbnRzWzBdLmhlaWdodFxuXG4gICAgICBpZiAoZGVwdGhCdWZmZXIpIHtcbiAgICAgICAgZGVwdGhBdHRhY2htZW50ID0gcGFyc2VBdHRhY2htZW50KGRlcHRoQnVmZmVyKVxuICAgICAgfSBlbHNlIGlmIChuZWVkc0RlcHRoICYmICFuZWVkc1N0ZW5jaWwpIHtcbiAgICAgICAgZGVwdGhBdHRhY2htZW50ID0gYWxsb2NBdHRhY2htZW50KFxuICAgICAgICAgIHdpZHRoLFxuICAgICAgICAgIGhlaWdodCxcbiAgICAgICAgICBkZXB0aFN0ZW5jaWxUZXh0dXJlLFxuICAgICAgICAgICdkZXB0aCcsXG4gICAgICAgICAgJ3VpbnQzMicpXG4gICAgICB9XG5cbiAgICAgIGlmIChzdGVuY2lsQnVmZmVyKSB7XG4gICAgICAgIHN0ZW5jaWxBdHRhY2htZW50ID0gcGFyc2VBdHRhY2htZW50KHN0ZW5jaWxCdWZmZXIpXG4gICAgICB9IGVsc2UgaWYgKG5lZWRzU3RlbmNpbCAmJiAhbmVlZHNEZXB0aCkge1xuICAgICAgICBzdGVuY2lsQXR0YWNobWVudCA9IGFsbG9jQXR0YWNobWVudChcbiAgICAgICAgICB3aWR0aCxcbiAgICAgICAgICBoZWlnaHQsXG4gICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgJ3N0ZW5jaWwnLFxuICAgICAgICAgICd1aW50OCcpXG4gICAgICB9XG5cbiAgICAgIGlmIChkZXB0aFN0ZW5jaWxCdWZmZXIpIHtcbiAgICAgICAgZGVwdGhTdGVuY2lsQXR0YWNobWVudCA9IHBhcnNlQXR0YWNobWVudChkZXB0aFN0ZW5jaWxCdWZmZXIpXG4gICAgICB9IGVsc2UgaWYgKCFkZXB0aEJ1ZmZlciAmJiAhc3RlbmNpbEJ1ZmZlciAmJiBuZWVkc1N0ZW5jaWwgJiYgbmVlZHNEZXB0aCkge1xuICAgICAgICBkZXB0aFN0ZW5jaWxBdHRhY2htZW50ID0gYWxsb2NBdHRhY2htZW50KFxuICAgICAgICAgIHdpZHRoLFxuICAgICAgICAgIGhlaWdodCxcbiAgICAgICAgICBkZXB0aFN0ZW5jaWxUZXh0dXJlLFxuICAgICAgICAgICdkZXB0aCBzdGVuY2lsJyxcbiAgICAgICAgICAnZGVwdGggc3RlbmNpbCcpXG4gICAgICB9XG5cbiAgICAgIFxuXG4gICAgICB2YXIgY29tbW9uQ29sb3JBdHRhY2htZW50U2l6ZSA9IG51bGxcblxuICAgICAgZm9yIChpID0gMDsgaSA8IGNvbG9yQXR0YWNobWVudHMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgaW5jUmVmQW5kQ2hlY2tTaGFwZShjb2xvckF0dGFjaG1lbnRzW2ldLCB3aWR0aCwgaGVpZ2h0KVxuICAgICAgICBcblxuICAgICAgICBpZiAoY29sb3JBdHRhY2htZW50c1tpXSAmJiBjb2xvckF0dGFjaG1lbnRzW2ldLnRleHR1cmUpIHtcbiAgICAgICAgICB2YXIgY29sb3JBdHRhY2htZW50U2l6ZSA9XG4gICAgICAgICAgICAgIHRleHR1cmVGb3JtYXRDaGFubmVsc1tjb2xvckF0dGFjaG1lbnRzW2ldLnRleHR1cmUuX3RleHR1cmUuZm9ybWF0XSAqXG4gICAgICAgICAgICAgIHRleHR1cmVUeXBlU2l6ZXNbY29sb3JBdHRhY2htZW50c1tpXS50ZXh0dXJlLl90ZXh0dXJlLnR5cGVdXG5cbiAgICAgICAgICBpZiAoY29tbW9uQ29sb3JBdHRhY2htZW50U2l6ZSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgY29tbW9uQ29sb3JBdHRhY2htZW50U2l6ZSA9IGNvbG9yQXR0YWNobWVudFNpemVcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gV2UgbmVlZCB0byBtYWtlIHN1cmUgdGhhdCBhbGwgY29sb3IgYXR0YWNobWVudHMgaGF2ZSB0aGUgc2FtZSBudW1iZXIgb2YgYml0cGxhbmVzXG4gICAgICAgICAgICAvLyAodGhhdCBpcywgdGhlIHNhbWUgbnVtZXIgb2YgYml0cyBwZXIgcGl4ZWwpXG4gICAgICAgICAgICAvLyBUaGlzIGlzIHJlcXVpcmVkIGJ5IHRoZSBHTEVTMi4wIHN0YW5kYXJkLiBTZWUgdGhlIGJlZ2lubmluZyBvZiBDaGFwdGVyIDQgaW4gdGhhdCBkb2N1bWVudC5cbiAgICAgICAgICAgIFxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaW5jUmVmQW5kQ2hlY2tTaGFwZShkZXB0aEF0dGFjaG1lbnQsIHdpZHRoLCBoZWlnaHQpXG4gICAgICBcbiAgICAgIGluY1JlZkFuZENoZWNrU2hhcGUoc3RlbmNpbEF0dGFjaG1lbnQsIHdpZHRoLCBoZWlnaHQpXG4gICAgICBcbiAgICAgIGluY1JlZkFuZENoZWNrU2hhcGUoZGVwdGhTdGVuY2lsQXR0YWNobWVudCwgd2lkdGgsIGhlaWdodClcbiAgICAgIFxuXG4gICAgICAvLyBkZWNyZW1lbnQgcmVmZXJlbmNlc1xuICAgICAgZGVjRkJPUmVmcyhmcmFtZWJ1ZmZlcilcblxuICAgICAgZnJhbWVidWZmZXIud2lkdGggPSB3aWR0aFxuICAgICAgZnJhbWVidWZmZXIuaGVpZ2h0ID0gaGVpZ2h0XG5cbiAgICAgIGZyYW1lYnVmZmVyLmNvbG9yQXR0YWNobWVudHMgPSBjb2xvckF0dGFjaG1lbnRzXG4gICAgICBmcmFtZWJ1ZmZlci5kZXB0aEF0dGFjaG1lbnQgPSBkZXB0aEF0dGFjaG1lbnRcbiAgICAgIGZyYW1lYnVmZmVyLnN0ZW5jaWxBdHRhY2htZW50ID0gc3RlbmNpbEF0dGFjaG1lbnRcbiAgICAgIGZyYW1lYnVmZmVyLmRlcHRoU3RlbmNpbEF0dGFjaG1lbnQgPSBkZXB0aFN0ZW5jaWxBdHRhY2htZW50XG5cbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci5jb2xvciA9IGNvbG9yQXR0YWNobWVudHMubWFwKHVud3JhcEF0dGFjaG1lbnQpXG4gICAgICByZWdsRnJhbWVidWZmZXIuZGVwdGggPSB1bndyYXBBdHRhY2htZW50KGRlcHRoQXR0YWNobWVudClcbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci5zdGVuY2lsID0gdW53cmFwQXR0YWNobWVudChzdGVuY2lsQXR0YWNobWVudClcbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci5kZXB0aFN0ZW5jaWwgPSB1bndyYXBBdHRhY2htZW50KGRlcHRoU3RlbmNpbEF0dGFjaG1lbnQpXG5cbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci53aWR0aCA9IGZyYW1lYnVmZmVyLndpZHRoXG4gICAgICByZWdsRnJhbWVidWZmZXIuaGVpZ2h0ID0gZnJhbWVidWZmZXIuaGVpZ2h0XG5cbiAgICAgIHVwZGF0ZUZyYW1lYnVmZmVyKGZyYW1lYnVmZmVyKVxuXG4gICAgICByZXR1cm4gcmVnbEZyYW1lYnVmZmVyXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVzaXplICh3XywgaF8pIHtcbiAgICAgIFxuXG4gICAgICB2YXIgdyA9IHdfIHwgMFxuICAgICAgdmFyIGggPSAoaF8gfCAwKSB8fCB3XG4gICAgICBpZiAodyA9PT0gZnJhbWVidWZmZXIud2lkdGggJiYgaCA9PT0gZnJhbWVidWZmZXIuaGVpZ2h0KSB7XG4gICAgICAgIHJldHVybiByZWdsRnJhbWVidWZmZXJcbiAgICAgIH1cblxuICAgICAgLy8gcmVzaXplIGFsbCBidWZmZXJzXG4gICAgICB2YXIgY29sb3JBdHRhY2htZW50cyA9IGZyYW1lYnVmZmVyLmNvbG9yQXR0YWNobWVudHNcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY29sb3JBdHRhY2htZW50cy5sZW5ndGg7ICsraSkge1xuICAgICAgICByZXNpemVBdHRhY2htZW50KGNvbG9yQXR0YWNobWVudHNbaV0sIHcsIGgpXG4gICAgICB9XG4gICAgICByZXNpemVBdHRhY2htZW50KGZyYW1lYnVmZmVyLmRlcHRoQXR0YWNobWVudCwgdywgaClcbiAgICAgIHJlc2l6ZUF0dGFjaG1lbnQoZnJhbWVidWZmZXIuc3RlbmNpbEF0dGFjaG1lbnQsIHcsIGgpXG4gICAgICByZXNpemVBdHRhY2htZW50KGZyYW1lYnVmZmVyLmRlcHRoU3RlbmNpbEF0dGFjaG1lbnQsIHcsIGgpXG5cbiAgICAgIGZyYW1lYnVmZmVyLndpZHRoID0gcmVnbEZyYW1lYnVmZmVyLndpZHRoID0gd1xuICAgICAgZnJhbWVidWZmZXIuaGVpZ2h0ID0gcmVnbEZyYW1lYnVmZmVyLmhlaWdodCA9IGhcblxuICAgICAgdXBkYXRlRnJhbWVidWZmZXIoZnJhbWVidWZmZXIpXG5cbiAgICAgIHJldHVybiByZWdsRnJhbWVidWZmZXJcbiAgICB9XG5cbiAgICByZWdsRnJhbWVidWZmZXIoYTAsIGExKVxuXG4gICAgcmV0dXJuIGV4dGVuZChyZWdsRnJhbWVidWZmZXIsIHtcbiAgICAgIHJlc2l6ZTogcmVzaXplLFxuICAgICAgX3JlZ2xUeXBlOiAnZnJhbWVidWZmZXInLFxuICAgICAgX2ZyYW1lYnVmZmVyOiBmcmFtZWJ1ZmZlcixcbiAgICAgIGRlc3Ryb3k6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgZGVzdHJveShmcmFtZWJ1ZmZlcilcbiAgICAgICAgZGVjRkJPUmVmcyhmcmFtZWJ1ZmZlcilcbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlQ3ViZUZCTyAob3B0aW9ucykge1xuICAgIHZhciBmYWNlcyA9IEFycmF5KDYpXG5cbiAgICBmdW5jdGlvbiByZWdsRnJhbWVidWZmZXJDdWJlIChhKSB7XG4gICAgICB2YXIgaVxuXG4gICAgICBcblxuICAgICAgdmFyIGV4dERyYXdCdWZmZXJzID0gZXh0ZW5zaW9ucy53ZWJnbF9kcmF3X2J1ZmZlcnNcblxuICAgICAgdmFyIHBhcmFtcyA9IHtcbiAgICAgICAgY29sb3I6IG51bGxcbiAgICAgIH1cblxuICAgICAgdmFyIHJhZGl1cyA9IDBcblxuICAgICAgdmFyIGNvbG9yQnVmZmVyID0gbnVsbFxuICAgICAgdmFyIGNvbG9yRm9ybWF0ID0gJ3JnYmEnXG4gICAgICB2YXIgY29sb3JUeXBlID0gJ3VpbnQ4J1xuICAgICAgdmFyIGNvbG9yQ291bnQgPSAxXG5cbiAgICAgIGlmICh0eXBlb2YgYSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgcmFkaXVzID0gYSB8IDBcbiAgICAgIH0gZWxzZSBpZiAoIWEpIHtcbiAgICAgICAgcmFkaXVzID0gMVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgXG4gICAgICAgIHZhciBvcHRpb25zID0gYVxuXG4gICAgICAgIGlmICgnc2hhcGUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB2YXIgc2hhcGUgPSBvcHRpb25zLnNoYXBlXG4gICAgICAgICAgXG4gICAgICAgICAgXG4gICAgICAgICAgcmFkaXVzID0gc2hhcGVbMF1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAoJ3JhZGl1cycgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgcmFkaXVzID0gb3B0aW9ucy5yYWRpdXMgfCAwXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgnd2lkdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIHJhZGl1cyA9IG9wdGlvbnMud2lkdGggfCAwXG4gICAgICAgICAgICBpZiAoJ2hlaWdodCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2UgaWYgKCdoZWlnaHQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIHJhZGl1cyA9IG9wdGlvbnMuaGVpZ2h0IHwgMFxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnY29sb3InIGluIG9wdGlvbnMgfHxcbiAgICAgICAgICAgICdjb2xvcnMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBjb2xvckJ1ZmZlciA9XG4gICAgICAgICAgICBvcHRpb25zLmNvbG9yIHx8XG4gICAgICAgICAgICBvcHRpb25zLmNvbG9yc1xuICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KGNvbG9yQnVmZmVyKSkge1xuICAgICAgICAgICAgXG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFjb2xvckJ1ZmZlcikge1xuICAgICAgICAgIGlmICgnY29sb3JDb3VudCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgY29sb3JDb3VudCA9IG9wdGlvbnMuY29sb3JDb3VudCB8IDBcbiAgICAgICAgICAgIFxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmICgnY29sb3JUeXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbG9yVHlwZSA9IG9wdGlvbnMuY29sb3JUeXBlXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKCdjb2xvckZvcm1hdCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgY29sb3JGb3JtYXQgPSBvcHRpb25zLmNvbG9yRm9ybWF0XG4gICAgICAgICAgICBcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ2RlcHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgcGFyYW1zLmRlcHRoID0gb3B0aW9ucy5kZXB0aFxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdzdGVuY2lsJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgcGFyYW1zLnN0ZW5jaWwgPSBvcHRpb25zLnN0ZW5jaWxcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnZGVwdGhTdGVuY2lsJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgcGFyYW1zLmRlcHRoU3RlbmNpbCA9IG9wdGlvbnMuZGVwdGhTdGVuY2lsXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgdmFyIGNvbG9yQ3ViZXNcbiAgICAgIGlmIChjb2xvckJ1ZmZlcikge1xuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShjb2xvckJ1ZmZlcikpIHtcbiAgICAgICAgICBjb2xvckN1YmVzID0gW11cbiAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY29sb3JCdWZmZXIubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICAgIGNvbG9yQ3ViZXNbaV0gPSBjb2xvckJ1ZmZlcltpXVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb2xvckN1YmVzID0gWyBjb2xvckJ1ZmZlciBdXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbG9yQ3ViZXMgPSBBcnJheShjb2xvckNvdW50KVxuICAgICAgICB2YXIgY3ViZU1hcFBhcmFtcyA9IHtcbiAgICAgICAgICByYWRpdXM6IHJhZGl1cyxcbiAgICAgICAgICBmb3JtYXQ6IGNvbG9yRm9ybWF0LFxuICAgICAgICAgIHR5cGU6IGNvbG9yVHlwZVxuICAgICAgICB9XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xvckNvdW50OyArK2kpIHtcbiAgICAgICAgICBjb2xvckN1YmVzW2ldID0gdGV4dHVyZVN0YXRlLmNyZWF0ZUN1YmUoY3ViZU1hcFBhcmFtcylcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBDaGVjayBjb2xvciBjdWJlc1xuICAgICAgcGFyYW1zLmNvbG9yID0gQXJyYXkoY29sb3JDdWJlcy5sZW5ndGgpXG4gICAgICBmb3IgKGkgPSAwOyBpIDwgY29sb3JDdWJlcy5sZW5ndGg7ICsraSkge1xuICAgICAgICB2YXIgY3ViZSA9IGNvbG9yQ3ViZXNbaV1cbiAgICAgICAgXG4gICAgICAgIHJhZGl1cyA9IHJhZGl1cyB8fCBjdWJlLndpZHRoXG4gICAgICAgIFxuICAgICAgICBwYXJhbXMuY29sb3JbaV0gPSB7XG4gICAgICAgICAgdGFyZ2V0OiBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1gsXG4gICAgICAgICAgZGF0YTogY29sb3JDdWJlc1tpXVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGZvciAoaSA9IDA7IGkgPCA2OyArK2kpIHtcbiAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBjb2xvckN1YmVzLmxlbmd0aDsgKytqKSB7XG4gICAgICAgICAgcGFyYW1zLmNvbG9yW2pdLnRhcmdldCA9IEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCArIGlcbiAgICAgICAgfVxuICAgICAgICAvLyByZXVzZSBkZXB0aC1zdGVuY2lsIGF0dGFjaG1lbnRzIGFjcm9zcyBhbGwgY3ViZSBtYXBzXG4gICAgICAgIGlmIChpID4gMCkge1xuICAgICAgICAgIHBhcmFtcy5kZXB0aCA9IGZhY2VzWzBdLmRlcHRoXG4gICAgICAgICAgcGFyYW1zLnN0ZW5jaWwgPSBmYWNlc1swXS5zdGVuY2lsXG4gICAgICAgICAgcGFyYW1zLmRlcHRoU3RlbmNpbCA9IGZhY2VzWzBdLmRlcHRoU3RlbmNpbFxuICAgICAgICB9XG4gICAgICAgIGlmIChmYWNlc1tpXSkge1xuICAgICAgICAgIChmYWNlc1tpXSkocGFyYW1zKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGZhY2VzW2ldID0gY3JlYXRlRkJPKHBhcmFtcylcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gZXh0ZW5kKHJlZ2xGcmFtZWJ1ZmZlckN1YmUsIHtcbiAgICAgICAgd2lkdGg6IHJhZGl1cyxcbiAgICAgICAgaGVpZ2h0OiByYWRpdXMsXG4gICAgICAgIGNvbG9yOiBjb2xvckN1YmVzXG4gICAgICB9KVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlc2l6ZSAocmFkaXVzXykge1xuICAgICAgdmFyIGlcbiAgICAgIHZhciByYWRpdXMgPSByYWRpdXNfIHwgMFxuICAgICAgXG5cbiAgICAgIGlmIChyYWRpdXMgPT09IHJlZ2xGcmFtZWJ1ZmZlckN1YmUud2lkdGgpIHtcbiAgICAgICAgcmV0dXJuIHJlZ2xGcmFtZWJ1ZmZlckN1YmVcbiAgICAgIH1cblxuICAgICAgdmFyIGNvbG9ycyA9IHJlZ2xGcmFtZWJ1ZmZlckN1YmUuY29sb3JcbiAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xvcnMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgY29sb3JzW2ldLnJlc2l6ZShyYWRpdXMpXG4gICAgICB9XG5cbiAgICAgIGZvciAoaSA9IDA7IGkgPCA2OyArK2kpIHtcbiAgICAgICAgZmFjZXNbaV0ucmVzaXplKHJhZGl1cylcbiAgICAgIH1cblxuICAgICAgcmVnbEZyYW1lYnVmZmVyQ3ViZS53aWR0aCA9IHJlZ2xGcmFtZWJ1ZmZlckN1YmUuaGVpZ2h0ID0gcmFkaXVzXG5cbiAgICAgIHJldHVybiByZWdsRnJhbWVidWZmZXJDdWJlXG4gICAgfVxuXG4gICAgcmVnbEZyYW1lYnVmZmVyQ3ViZShvcHRpb25zKVxuXG4gICAgcmV0dXJuIGV4dGVuZChyZWdsRnJhbWVidWZmZXJDdWJlLCB7XG4gICAgICBmYWNlczogZmFjZXMsXG4gICAgICByZXNpemU6IHJlc2l6ZSxcbiAgICAgIF9yZWdsVHlwZTogJ2ZyYW1lYnVmZmVyQ3ViZScsXG4gICAgICBkZXN0cm95OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGZhY2VzLmZvckVhY2goZnVuY3Rpb24gKGYpIHtcbiAgICAgICAgICBmLmRlc3Ryb3koKVxuICAgICAgICB9KVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiByZXN0b3JlRnJhbWVidWZmZXJzICgpIHtcbiAgICB2YWx1ZXMoZnJhbWVidWZmZXJTZXQpLmZvckVhY2goZnVuY3Rpb24gKGZiKSB7XG4gICAgICBmYi5mcmFtZWJ1ZmZlciA9IGdsLmNyZWF0ZUZyYW1lYnVmZmVyKClcbiAgICAgIHVwZGF0ZUZyYW1lYnVmZmVyKGZiKVxuICAgIH0pXG4gIH1cblxuICByZXR1cm4gZXh0ZW5kKGZyYW1lYnVmZmVyU3RhdGUsIHtcbiAgICBnZXRGcmFtZWJ1ZmZlcjogZnVuY3Rpb24gKG9iamVjdCkge1xuICAgICAgaWYgKHR5cGVvZiBvYmplY3QgPT09ICdmdW5jdGlvbicgJiYgb2JqZWN0Ll9yZWdsVHlwZSA9PT0gJ2ZyYW1lYnVmZmVyJykge1xuICAgICAgICB2YXIgZmJvID0gb2JqZWN0Ll9mcmFtZWJ1ZmZlclxuICAgICAgICBpZiAoZmJvIGluc3RhbmNlb2YgUkVHTEZyYW1lYnVmZmVyKSB7XG4gICAgICAgICAgcmV0dXJuIGZib1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH0sXG4gICAgY3JlYXRlOiBjcmVhdGVGQk8sXG4gICAgY3JlYXRlQ3ViZTogY3JlYXRlQ3ViZUZCTyxcbiAgICBjbGVhcjogZnVuY3Rpb24gKCkge1xuICAgICAgdmFsdWVzKGZyYW1lYnVmZmVyU2V0KS5mb3JFYWNoKGRlc3Ryb3kpXG4gICAgfSxcbiAgICByZXN0b3JlOiByZXN0b3JlRnJhbWVidWZmZXJzXG4gIH0pXG59XG4iLCJ2YXIgR0xfU1VCUElYRUxfQklUUyA9IDB4MEQ1MFxudmFyIEdMX1JFRF9CSVRTID0gMHgwRDUyXG52YXIgR0xfR1JFRU5fQklUUyA9IDB4MEQ1M1xudmFyIEdMX0JMVUVfQklUUyA9IDB4MEQ1NFxudmFyIEdMX0FMUEhBX0JJVFMgPSAweDBENTVcbnZhciBHTF9ERVBUSF9CSVRTID0gMHgwRDU2XG52YXIgR0xfU1RFTkNJTF9CSVRTID0gMHgwRDU3XG5cbnZhciBHTF9BTElBU0VEX1BPSU5UX1NJWkVfUkFOR0UgPSAweDg0NkRcbnZhciBHTF9BTElBU0VEX0xJTkVfV0lEVEhfUkFOR0UgPSAweDg0NkVcblxudmFyIEdMX01BWF9URVhUVVJFX1NJWkUgPSAweDBEMzNcbnZhciBHTF9NQVhfVklFV1BPUlRfRElNUyA9IDB4MEQzQVxudmFyIEdMX01BWF9WRVJURVhfQVRUUklCUyA9IDB4ODg2OVxudmFyIEdMX01BWF9WRVJURVhfVU5JRk9STV9WRUNUT1JTID0gMHg4REZCXG52YXIgR0xfTUFYX1ZBUllJTkdfVkVDVE9SUyA9IDB4OERGQ1xudmFyIEdMX01BWF9DT01CSU5FRF9URVhUVVJFX0lNQUdFX1VOSVRTID0gMHg4QjREXG52YXIgR0xfTUFYX1ZFUlRFWF9URVhUVVJFX0lNQUdFX1VOSVRTID0gMHg4QjRDXG52YXIgR0xfTUFYX1RFWFRVUkVfSU1BR0VfVU5JVFMgPSAweDg4NzJcbnZhciBHTF9NQVhfRlJBR01FTlRfVU5JRk9STV9WRUNUT1JTID0gMHg4REZEXG52YXIgR0xfTUFYX0NVQkVfTUFQX1RFWFRVUkVfU0laRSA9IDB4ODUxQ1xudmFyIEdMX01BWF9SRU5ERVJCVUZGRVJfU0laRSA9IDB4ODRFOFxuXG52YXIgR0xfVkVORE9SID0gMHgxRjAwXG52YXIgR0xfUkVOREVSRVIgPSAweDFGMDFcbnZhciBHTF9WRVJTSU9OID0gMHgxRjAyXG52YXIgR0xfU0hBRElOR19MQU5HVUFHRV9WRVJTSU9OID0gMHg4QjhDXG5cbnZhciBHTF9NQVhfVEVYVFVSRV9NQVhfQU5JU09UUk9QWV9FWFQgPSAweDg0RkZcblxudmFyIEdMX01BWF9DT0xPUl9BVFRBQ0hNRU5UU19XRUJHTCA9IDB4OENERlxudmFyIEdMX01BWF9EUkFXX0JVRkZFUlNfV0VCR0wgPSAweDg4MjRcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoZ2wsIGV4dGVuc2lvbnMpIHtcbiAgdmFyIG1heEFuaXNvdHJvcGljID0gMVxuICBpZiAoZXh0ZW5zaW9ucy5leHRfdGV4dHVyZV9maWx0ZXJfYW5pc290cm9waWMpIHtcbiAgICBtYXhBbmlzb3Ryb3BpYyA9IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVEVYVFVSRV9NQVhfQU5JU09UUk9QWV9FWFQpXG4gIH1cblxuICB2YXIgbWF4RHJhd2J1ZmZlcnMgPSAxXG4gIHZhciBtYXhDb2xvckF0dGFjaG1lbnRzID0gMVxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9kcmF3X2J1ZmZlcnMpIHtcbiAgICBtYXhEcmF3YnVmZmVycyA9IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfRFJBV19CVUZGRVJTX1dFQkdMKVxuICAgIG1heENvbG9yQXR0YWNobWVudHMgPSBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0NPTE9SX0FUVEFDSE1FTlRTX1dFQkdMKVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICAvLyBkcmF3aW5nIGJ1ZmZlciBiaXQgZGVwdGhcbiAgICBjb2xvckJpdHM6IFtcbiAgICAgIGdsLmdldFBhcmFtZXRlcihHTF9SRURfQklUUyksXG4gICAgICBnbC5nZXRQYXJhbWV0ZXIoR0xfR1JFRU5fQklUUyksXG4gICAgICBnbC5nZXRQYXJhbWV0ZXIoR0xfQkxVRV9CSVRTKSxcbiAgICAgIGdsLmdldFBhcmFtZXRlcihHTF9BTFBIQV9CSVRTKVxuICAgIF0sXG4gICAgZGVwdGhCaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfREVQVEhfQklUUyksXG4gICAgc3RlbmNpbEJpdHM6IGdsLmdldFBhcmFtZXRlcihHTF9TVEVOQ0lMX0JJVFMpLFxuICAgIHN1YnBpeGVsQml0czogZ2wuZ2V0UGFyYW1ldGVyKEdMX1NVQlBJWEVMX0JJVFMpLFxuXG4gICAgLy8gc3VwcG9ydGVkIGV4dGVuc2lvbnNcbiAgICBleHRlbnNpb25zOiBPYmplY3Qua2V5cyhleHRlbnNpb25zKS5maWx0ZXIoZnVuY3Rpb24gKGV4dCkge1xuICAgICAgcmV0dXJuICEhZXh0ZW5zaW9uc1tleHRdXG4gICAgfSksXG5cbiAgICAvLyBtYXggYW5pc28gc2FtcGxlc1xuICAgIG1heEFuaXNvdHJvcGljOiBtYXhBbmlzb3Ryb3BpYyxcblxuICAgIC8vIG1heCBkcmF3IGJ1ZmZlcnNcbiAgICBtYXhEcmF3YnVmZmVyczogbWF4RHJhd2J1ZmZlcnMsXG4gICAgbWF4Q29sb3JBdHRhY2htZW50czogbWF4Q29sb3JBdHRhY2htZW50cyxcblxuICAgIC8vIHBvaW50IGFuZCBsaW5lIHNpemUgcmFuZ2VzXG4gICAgcG9pbnRTaXplRGltczogZ2wuZ2V0UGFyYW1ldGVyKEdMX0FMSUFTRURfUE9JTlRfU0laRV9SQU5HRSksXG4gICAgbGluZVdpZHRoRGltczogZ2wuZ2V0UGFyYW1ldGVyKEdMX0FMSUFTRURfTElORV9XSURUSF9SQU5HRSksXG4gICAgbWF4Vmlld3BvcnREaW1zOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1ZJRVdQT1JUX0RJTVMpLFxuICAgIG1heENvbWJpbmVkVGV4dHVyZVVuaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0NPTUJJTkVEX1RFWFRVUkVfSU1BR0VfVU5JVFMpLFxuICAgIG1heEN1YmVNYXBTaXplOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0NVQkVfTUFQX1RFWFRVUkVfU0laRSksXG4gICAgbWF4UmVuZGVyYnVmZmVyU2l6ZTogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9SRU5ERVJCVUZGRVJfU0laRSksXG4gICAgbWF4VGV4dHVyZVVuaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1RFWFRVUkVfSU1BR0VfVU5JVFMpLFxuICAgIG1heFRleHR1cmVTaXplOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1RFWFRVUkVfU0laRSksXG4gICAgbWF4QXR0cmlidXRlczogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9WRVJURVhfQVRUUklCUyksXG4gICAgbWF4VmVydGV4VW5pZm9ybXM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVkVSVEVYX1VOSUZPUk1fVkVDVE9SUyksXG4gICAgbWF4VmVydGV4VGV4dHVyZVVuaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1ZFUlRFWF9URVhUVVJFX0lNQUdFX1VOSVRTKSxcbiAgICBtYXhWYXJ5aW5nVmVjdG9yczogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9WQVJZSU5HX1ZFQ1RPUlMpLFxuICAgIG1heEZyYWdtZW50VW5pZm9ybXM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfRlJBR01FTlRfVU5JRk9STV9WRUNUT1JTKSxcblxuICAgIC8vIHZlbmRvciBpbmZvXG4gICAgZ2xzbDogZ2wuZ2V0UGFyYW1ldGVyKEdMX1NIQURJTkdfTEFOR1VBR0VfVkVSU0lPTiksXG4gICAgcmVuZGVyZXI6IGdsLmdldFBhcmFtZXRlcihHTF9SRU5ERVJFUiksXG4gICAgdmVuZG9yOiBnbC5nZXRQYXJhbWV0ZXIoR0xfVkVORE9SKSxcbiAgICB2ZXJzaW9uOiBnbC5nZXRQYXJhbWV0ZXIoR0xfVkVSU0lPTilcbiAgfVxufVxuIiwiXG52YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi91dGlsL2lzLXR5cGVkLWFycmF5JylcblxudmFyIEdMX1JHQkEgPSA2NDA4XG52YXIgR0xfVU5TSUdORURfQllURSA9IDUxMjFcbnZhciBHTF9QQUNLX0FMSUdOTUVOVCA9IDB4MEQwNVxudmFyIEdMX0ZMT0FUID0gMHgxNDA2IC8vIDUxMjZcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwUmVhZFBpeGVscyAoXG4gIGdsLFxuICBmcmFtZWJ1ZmZlclN0YXRlLFxuICByZWdsUG9sbCxcbiAgY29udGV4dCxcbiAgZ2xBdHRyaWJ1dGVzLFxuICBleHRlbnNpb25zKSB7XG4gIGZ1bmN0aW9uIHJlYWRQaXhlbHMgKGlucHV0KSB7XG4gICAgdmFyIHR5cGVcbiAgICBpZiAoZnJhbWVidWZmZXJTdGF0ZS5uZXh0ID09PSBudWxsKSB7XG4gICAgICBcbiAgICAgIHR5cGUgPSBHTF9VTlNJR05FRF9CWVRFXG4gICAgfSBlbHNlIHtcbiAgICAgIFxuICAgICAgdHlwZSA9IGZyYW1lYnVmZmVyU3RhdGUubmV4dC5jb2xvckF0dGFjaG1lbnRzWzBdLnRleHR1cmUuX3RleHR1cmUudHlwZVxuXG4gICAgICBpZiAoZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9mbG9hdCkge1xuICAgICAgICBcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIFxuICAgICAgfVxuICAgIH1cblxuICAgIHZhciB4ID0gMFxuICAgIHZhciB5ID0gMFxuICAgIHZhciB3aWR0aCA9IGNvbnRleHQuZnJhbWVidWZmZXJXaWR0aFxuICAgIHZhciBoZWlnaHQgPSBjb250ZXh0LmZyYW1lYnVmZmVySGVpZ2h0XG4gICAgdmFyIGRhdGEgPSBudWxsXG5cbiAgICBpZiAoaXNUeXBlZEFycmF5KGlucHV0KSkge1xuICAgICAgZGF0YSA9IGlucHV0XG4gICAgfSBlbHNlIGlmIChpbnB1dCkge1xuICAgICAgXG4gICAgICB4ID0gaW5wdXQueCB8IDBcbiAgICAgIHkgPSBpbnB1dC55IHwgMFxuICAgICAgXG4gICAgICBcbiAgICAgIHdpZHRoID0gKGlucHV0LndpZHRoIHx8IChjb250ZXh0LmZyYW1lYnVmZmVyV2lkdGggLSB4KSkgfCAwXG4gICAgICBoZWlnaHQgPSAoaW5wdXQuaGVpZ2h0IHx8IChjb250ZXh0LmZyYW1lYnVmZmVySGVpZ2h0IC0geSkpIHwgMFxuICAgICAgZGF0YSA9IGlucHV0LmRhdGEgfHwgbnVsbFxuICAgIH1cblxuICAgIC8vIHNhbml0eSBjaGVjayBpbnB1dC5kYXRhXG4gICAgaWYgKGRhdGEpIHtcbiAgICAgIGlmICh0eXBlID09PSBHTF9VTlNJR05FRF9CWVRFKSB7XG4gICAgICAgIFxuICAgICAgfSBlbHNlIGlmICh0eXBlID09PSBHTF9GTE9BVCkge1xuICAgICAgICBcbiAgICAgIH1cbiAgICB9XG5cbiAgICBcbiAgICBcblxuICAgIC8vIFVwZGF0ZSBXZWJHTCBzdGF0ZVxuICAgIHJlZ2xQb2xsKClcblxuICAgIC8vIENvbXB1dGUgc2l6ZVxuICAgIHZhciBzaXplID0gd2lkdGggKiBoZWlnaHQgKiA0XG5cbiAgICAvLyBBbGxvY2F0ZSBkYXRhXG4gICAgaWYgKCFkYXRhKSB7XG4gICAgICBpZiAodHlwZSA9PT0gR0xfVU5TSUdORURfQllURSkge1xuICAgICAgICBkYXRhID0gbmV3IFVpbnQ4QXJyYXkoc2l6ZSlcbiAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gR0xfRkxPQVQpIHtcbiAgICAgICAgZGF0YSA9IGRhdGEgfHwgbmV3IEZsb2F0MzJBcnJheShzaXplKVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFR5cGUgY2hlY2tcbiAgICBcbiAgICBcblxuICAgIC8vIFJ1biByZWFkIHBpeGVsc1xuICAgIGdsLnBpeGVsU3RvcmVpKEdMX1BBQ0tfQUxJR05NRU5ULCA0KVxuICAgIGdsLnJlYWRQaXhlbHMoeCwgeSwgd2lkdGgsIGhlaWdodCwgR0xfUkdCQSxcbiAgICAgICAgICAgICAgICAgIHR5cGUsXG4gICAgICAgICAgICAgICAgICBkYXRhKVxuXG4gICAgcmV0dXJuIGRhdGFcbiAgfVxuXG4gIHJldHVybiByZWFkUGl4ZWxzXG59XG4iLCJcbnZhciB2YWx1ZXMgPSByZXF1aXJlKCcuL3V0aWwvdmFsdWVzJylcblxudmFyIEdMX1JFTkRFUkJVRkZFUiA9IDB4OEQ0MVxuXG52YXIgR0xfUkdCQTQgPSAweDgwNTZcbnZhciBHTF9SR0I1X0ExID0gMHg4MDU3XG52YXIgR0xfUkdCNTY1ID0gMHg4RDYyXG52YXIgR0xfREVQVEhfQ09NUE9ORU5UMTYgPSAweDgxQTVcbnZhciBHTF9TVEVOQ0lMX0lOREVYOCA9IDB4OEQ0OFxudmFyIEdMX0RFUFRIX1NURU5DSUwgPSAweDg0RjlcblxudmFyIEdMX1NSR0I4X0FMUEhBOF9FWFQgPSAweDhDNDNcblxudmFyIEdMX1JHQkEzMkZfRVhUID0gMHg4ODE0XG5cbnZhciBHTF9SR0JBMTZGX0VYVCA9IDB4ODgxQVxudmFyIEdMX1JHQjE2Rl9FWFQgPSAweDg4MUJcblxudmFyIEZPUk1BVF9TSVpFUyA9IFtdXG5cbkZPUk1BVF9TSVpFU1tHTF9SR0JBNF0gPSAyXG5GT1JNQVRfU0laRVNbR0xfUkdCNV9BMV0gPSAyXG5GT1JNQVRfU0laRVNbR0xfUkdCNTY1XSA9IDJcblxuRk9STUFUX1NJWkVTW0dMX0RFUFRIX0NPTVBPTkVOVDE2XSA9IDJcbkZPUk1BVF9TSVpFU1tHTF9TVEVOQ0lMX0lOREVYOF0gPSAxXG5GT1JNQVRfU0laRVNbR0xfREVQVEhfU1RFTkNJTF0gPSA0XG5cbkZPUk1BVF9TSVpFU1tHTF9TUkdCOF9BTFBIQThfRVhUXSA9IDRcbkZPUk1BVF9TSVpFU1tHTF9SR0JBMzJGX0VYVF0gPSAxNlxuRk9STUFUX1NJWkVTW0dMX1JHQkExNkZfRVhUXSA9IDhcbkZPUk1BVF9TSVpFU1tHTF9SR0IxNkZfRVhUXSA9IDZcblxuZnVuY3Rpb24gZ2V0UmVuZGVyYnVmZmVyU2l6ZSAoZm9ybWF0LCB3aWR0aCwgaGVpZ2h0KSB7XG4gIHJldHVybiBGT1JNQVRfU0laRVNbZm9ybWF0XSAqIHdpZHRoICogaGVpZ2h0XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGdsLCBleHRlbnNpb25zLCBsaW1pdHMsIHN0YXRzLCBjb25maWcpIHtcbiAgdmFyIGZvcm1hdFR5cGVzID0ge1xuICAgICdyZ2JhNCc6IEdMX1JHQkE0LFxuICAgICdyZ2I1NjUnOiBHTF9SR0I1NjUsXG4gICAgJ3JnYjUgYTEnOiBHTF9SR0I1X0ExLFxuICAgICdkZXB0aCc6IEdMX0RFUFRIX0NPTVBPTkVOVDE2LFxuICAgICdzdGVuY2lsJzogR0xfU1RFTkNJTF9JTkRFWDgsXG4gICAgJ2RlcHRoIHN0ZW5jaWwnOiBHTF9ERVBUSF9TVEVOQ0lMXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5leHRfc3JnYikge1xuICAgIGZvcm1hdFR5cGVzWydzcmdiYSddID0gR0xfU1JHQjhfQUxQSEE4X0VYVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMuZXh0X2NvbG9yX2J1ZmZlcl9oYWxmX2Zsb2F0KSB7XG4gICAgZm9ybWF0VHlwZXNbJ3JnYmExNmYnXSA9IEdMX1JHQkExNkZfRVhUXG4gICAgZm9ybWF0VHlwZXNbJ3JnYjE2ZiddID0gR0xfUkdCMTZGX0VYVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29sb3JfYnVmZmVyX2Zsb2F0KSB7XG4gICAgZm9ybWF0VHlwZXNbJ3JnYmEzMmYnXSA9IEdMX1JHQkEzMkZfRVhUXG4gIH1cblxuICB2YXIgZm9ybWF0VHlwZXNJbnZlcnQgPSBbXVxuICBPYmplY3Qua2V5cyhmb3JtYXRUeXBlcykuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgdmFyIHZhbCA9IGZvcm1hdFR5cGVzW2tleV1cbiAgICBmb3JtYXRUeXBlc0ludmVydFt2YWxdID0ga2V5XG4gIH0pXG5cbiAgdmFyIHJlbmRlcmJ1ZmZlckNvdW50ID0gMFxuICB2YXIgcmVuZGVyYnVmZmVyU2V0ID0ge31cblxuICBmdW5jdGlvbiBSRUdMUmVuZGVyYnVmZmVyIChyZW5kZXJidWZmZXIpIHtcbiAgICB0aGlzLmlkID0gcmVuZGVyYnVmZmVyQ291bnQrK1xuICAgIHRoaXMucmVmQ291bnQgPSAxXG5cbiAgICB0aGlzLnJlbmRlcmJ1ZmZlciA9IHJlbmRlcmJ1ZmZlclxuXG4gICAgdGhpcy5mb3JtYXQgPSBHTF9SR0JBNFxuICAgIHRoaXMud2lkdGggPSAwXG4gICAgdGhpcy5oZWlnaHQgPSAwXG5cbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgIHRoaXMuc3RhdHMgPSB7c2l6ZTogMH1cbiAgICB9XG4gIH1cblxuICBSRUdMUmVuZGVyYnVmZmVyLnByb3RvdHlwZS5kZWNSZWYgPSBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKC0tdGhpcy5yZWZDb3VudCA8PSAwKSB7XG4gICAgICBkZXN0cm95KHRoaXMpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSAocmIpIHtcbiAgICB2YXIgaGFuZGxlID0gcmIucmVuZGVyYnVmZmVyXG4gICAgXG4gICAgZ2wuYmluZFJlbmRlcmJ1ZmZlcihHTF9SRU5ERVJCVUZGRVIsIG51bGwpXG4gICAgZ2wuZGVsZXRlUmVuZGVyYnVmZmVyKGhhbmRsZSlcbiAgICByYi5yZW5kZXJidWZmZXIgPSBudWxsXG4gICAgcmIucmVmQ291bnQgPSAwXG4gICAgZGVsZXRlIHJlbmRlcmJ1ZmZlclNldFtyYi5pZF1cbiAgICBzdGF0cy5yZW5kZXJidWZmZXJDb3VudC0tXG4gIH1cblxuICBmdW5jdGlvbiBjcmVhdGVSZW5kZXJidWZmZXIgKGEsIGIpIHtcbiAgICB2YXIgcmVuZGVyYnVmZmVyID0gbmV3IFJFR0xSZW5kZXJidWZmZXIoZ2wuY3JlYXRlUmVuZGVyYnVmZmVyKCkpXG4gICAgcmVuZGVyYnVmZmVyU2V0W3JlbmRlcmJ1ZmZlci5pZF0gPSByZW5kZXJidWZmZXJcbiAgICBzdGF0cy5yZW5kZXJidWZmZXJDb3VudCsrXG5cbiAgICBmdW5jdGlvbiByZWdsUmVuZGVyYnVmZmVyIChhLCBiKSB7XG4gICAgICB2YXIgdyA9IDBcbiAgICAgIHZhciBoID0gMFxuICAgICAgdmFyIGZvcm1hdCA9IEdMX1JHQkE0XG5cbiAgICAgIGlmICh0eXBlb2YgYSA9PT0gJ29iamVjdCcgJiYgYSkge1xuICAgICAgICB2YXIgb3B0aW9ucyA9IGFcbiAgICAgICAgaWYgKCdzaGFwZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHZhciBzaGFwZSA9IG9wdGlvbnMuc2hhcGVcbiAgICAgICAgICBcbiAgICAgICAgICB3ID0gc2hhcGVbMF0gfCAwXG4gICAgICAgICAgaCA9IHNoYXBlWzFdIHwgMFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmICgncmFkaXVzJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICB3ID0gaCA9IG9wdGlvbnMucmFkaXVzIHwgMFxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoJ3dpZHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICB3ID0gb3B0aW9ucy53aWR0aCB8IDBcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCdoZWlnaHQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGggPSBvcHRpb25zLmhlaWdodCB8IDBcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCdmb3JtYXQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBcbiAgICAgICAgICBmb3JtYXQgPSBmb3JtYXRUeXBlc1tvcHRpb25zLmZvcm1hdF1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgYSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgdyA9IGEgfCAwXG4gICAgICAgIGlmICh0eXBlb2YgYiA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICBoID0gYiB8IDBcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBoID0gd1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKCFhKSB7XG4gICAgICAgIHcgPSBoID0gMVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgXG4gICAgICB9XG5cbiAgICAgIC8vIGNoZWNrIHNoYXBlXG4gICAgICBcblxuICAgICAgaWYgKHcgPT09IHJlbmRlcmJ1ZmZlci53aWR0aCAmJlxuICAgICAgICAgIGggPT09IHJlbmRlcmJ1ZmZlci5oZWlnaHQgJiZcbiAgICAgICAgICBmb3JtYXQgPT09IHJlbmRlcmJ1ZmZlci5mb3JtYXQpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG5cbiAgICAgIHJlZ2xSZW5kZXJidWZmZXIud2lkdGggPSByZW5kZXJidWZmZXIud2lkdGggPSB3XG4gICAgICByZWdsUmVuZGVyYnVmZmVyLmhlaWdodCA9IHJlbmRlcmJ1ZmZlci5oZWlnaHQgPSBoXG4gICAgICByZW5kZXJidWZmZXIuZm9ybWF0ID0gZm9ybWF0XG5cbiAgICAgIGdsLmJpbmRSZW5kZXJidWZmZXIoR0xfUkVOREVSQlVGRkVSLCByZW5kZXJidWZmZXIucmVuZGVyYnVmZmVyKVxuICAgICAgZ2wucmVuZGVyYnVmZmVyU3RvcmFnZShHTF9SRU5ERVJCVUZGRVIsIGZvcm1hdCwgdywgaClcblxuICAgICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICAgIHJlbmRlcmJ1ZmZlci5zdGF0cy5zaXplID0gZ2V0UmVuZGVyYnVmZmVyU2l6ZShyZW5kZXJidWZmZXIuZm9ybWF0LCByZW5kZXJidWZmZXIud2lkdGgsIHJlbmRlcmJ1ZmZlci5oZWlnaHQpXG4gICAgICB9XG4gICAgICByZWdsUmVuZGVyYnVmZmVyLmZvcm1hdCA9IGZvcm1hdFR5cGVzSW52ZXJ0W3JlbmRlcmJ1ZmZlci5mb3JtYXRdXG5cbiAgICAgIHJldHVybiByZWdsUmVuZGVyYnVmZmVyXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVzaXplICh3XywgaF8pIHtcbiAgICAgIHZhciB3ID0gd18gfCAwXG4gICAgICB2YXIgaCA9IChoXyB8IDApIHx8IHdcblxuICAgICAgaWYgKHcgPT09IHJlbmRlcmJ1ZmZlci53aWR0aCAmJiBoID09PSByZW5kZXJidWZmZXIuaGVpZ2h0KSB7XG4gICAgICAgIHJldHVybiByZWdsUmVuZGVyYnVmZmVyXG4gICAgICB9XG5cbiAgICAgIC8vIGNoZWNrIHNoYXBlXG4gICAgICBcblxuICAgICAgcmVnbFJlbmRlcmJ1ZmZlci53aWR0aCA9IHJlbmRlcmJ1ZmZlci53aWR0aCA9IHdcbiAgICAgIHJlZ2xSZW5kZXJidWZmZXIuaGVpZ2h0ID0gcmVuZGVyYnVmZmVyLmhlaWdodCA9IGhcblxuICAgICAgZ2wuYmluZFJlbmRlcmJ1ZmZlcihHTF9SRU5ERVJCVUZGRVIsIHJlbmRlcmJ1ZmZlci5yZW5kZXJidWZmZXIpXG4gICAgICBnbC5yZW5kZXJidWZmZXJTdG9yYWdlKEdMX1JFTkRFUkJVRkZFUiwgcmVuZGVyYnVmZmVyLmZvcm1hdCwgdywgaClcblxuICAgICAgLy8gYWxzbywgcmVjb21wdXRlIHNpemUuXG4gICAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgICAgcmVuZGVyYnVmZmVyLnN0YXRzLnNpemUgPSBnZXRSZW5kZXJidWZmZXJTaXplKFxuICAgICAgICAgIHJlbmRlcmJ1ZmZlci5mb3JtYXQsIHJlbmRlcmJ1ZmZlci53aWR0aCwgcmVuZGVyYnVmZmVyLmhlaWdodClcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJlZ2xSZW5kZXJidWZmZXJcbiAgICB9XG5cbiAgICByZWdsUmVuZGVyYnVmZmVyKGEsIGIpXG5cbiAgICByZWdsUmVuZGVyYnVmZmVyLnJlc2l6ZSA9IHJlc2l6ZVxuICAgIHJlZ2xSZW5kZXJidWZmZXIuX3JlZ2xUeXBlID0gJ3JlbmRlcmJ1ZmZlcidcbiAgICByZWdsUmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXIgPSByZW5kZXJidWZmZXJcbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgIHJlZ2xSZW5kZXJidWZmZXIuc3RhdHMgPSByZW5kZXJidWZmZXIuc3RhdHNcbiAgICB9XG4gICAgcmVnbFJlbmRlcmJ1ZmZlci5kZXN0cm95ID0gZnVuY3Rpb24gKCkge1xuICAgICAgcmVuZGVyYnVmZmVyLmRlY1JlZigpXG4gICAgfVxuXG4gICAgcmV0dXJuIHJlZ2xSZW5kZXJidWZmZXJcbiAgfVxuXG4gIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgIHN0YXRzLmdldFRvdGFsUmVuZGVyYnVmZmVyU2l6ZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciB0b3RhbCA9IDBcbiAgICAgIE9iamVjdC5rZXlzKHJlbmRlcmJ1ZmZlclNldCkuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgIHRvdGFsICs9IHJlbmRlcmJ1ZmZlclNldFtrZXldLnN0YXRzLnNpemVcbiAgICAgIH0pXG4gICAgICByZXR1cm4gdG90YWxcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiByZXN0b3JlUmVuZGVyYnVmZmVycyAoKSB7XG4gICAgdmFsdWVzKHJlbmRlcmJ1ZmZlclNldCkuZm9yRWFjaChmdW5jdGlvbiAocmIpIHtcbiAgICAgIHJiLnJlbmRlcmJ1ZmZlciA9IGdsLmNyZWF0ZVJlbmRlcmJ1ZmZlcigpXG4gICAgICBnbC5iaW5kUmVuZGVyYnVmZmVyKEdMX1JFTkRFUkJVRkZFUiwgcmIucmVuZGVyYnVmZmVyKVxuICAgICAgZ2wucmVuZGVyYnVmZmVyU3RvcmFnZShHTF9SRU5ERVJCVUZGRVIsIHJiLmZvcm1hdCwgcmIud2lkdGgsIHJiLmhlaWdodClcbiAgICB9KVxuICAgIGdsLmJpbmRSZW5kZXJidWZmZXIoR0xfUkVOREVSQlVGRkVSLCBudWxsKVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjcmVhdGU6IGNyZWF0ZVJlbmRlcmJ1ZmZlcixcbiAgICBjbGVhcjogZnVuY3Rpb24gKCkge1xuICAgICAgdmFsdWVzKHJlbmRlcmJ1ZmZlclNldCkuZm9yRWFjaChkZXN0cm95KVxuICAgIH0sXG4gICAgcmVzdG9yZTogcmVzdG9yZVJlbmRlcmJ1ZmZlcnNcbiAgfVxufVxuIiwiXG52YXIgdmFsdWVzID0gcmVxdWlyZSgnLi91dGlsL3ZhbHVlcycpXG5cbnZhciBHTF9GUkFHTUVOVF9TSEFERVIgPSAzNTYzMlxudmFyIEdMX1ZFUlRFWF9TSEFERVIgPSAzNTYzM1xuXG52YXIgR0xfQUNUSVZFX1VOSUZPUk1TID0gMHg4Qjg2XG52YXIgR0xfQUNUSVZFX0FUVFJJQlVURVMgPSAweDhCODlcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwU2hhZGVyU3RhdGUgKGdsLCBzdHJpbmdTdG9yZSwgc3RhdHMsIGNvbmZpZykge1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gZ2xzbCBjb21waWxhdGlvbiBhbmQgbGlua2luZ1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgdmFyIGZyYWdTaGFkZXJzID0ge31cbiAgdmFyIHZlcnRTaGFkZXJzID0ge31cblxuICBmdW5jdGlvbiBBY3RpdmVJbmZvIChuYW1lLCBpZCwgbG9jYXRpb24sIGluZm8pIHtcbiAgICB0aGlzLm5hbWUgPSBuYW1lXG4gICAgdGhpcy5pZCA9IGlkXG4gICAgdGhpcy5sb2NhdGlvbiA9IGxvY2F0aW9uXG4gICAgdGhpcy5pbmZvID0gaW5mb1xuICB9XG5cbiAgZnVuY3Rpb24gaW5zZXJ0QWN0aXZlSW5mbyAobGlzdCwgaW5mbykge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGlzdC5sZW5ndGg7ICsraSkge1xuICAgICAgaWYgKGxpc3RbaV0uaWQgPT09IGluZm8uaWQpIHtcbiAgICAgICAgbGlzdFtpXS5sb2NhdGlvbiA9IGluZm8ubG9jYXRpb25cbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgfVxuICAgIGxpc3QucHVzaChpbmZvKVxuICB9XG5cbiAgZnVuY3Rpb24gZ2V0U2hhZGVyICh0eXBlLCBpZCwgY29tbWFuZCkge1xuICAgIHZhciBjYWNoZSA9IHR5cGUgPT09IEdMX0ZSQUdNRU5UX1NIQURFUiA/IGZyYWdTaGFkZXJzIDogdmVydFNoYWRlcnNcbiAgICB2YXIgc2hhZGVyID0gY2FjaGVbaWRdXG5cbiAgICBpZiAoIXNoYWRlcikge1xuICAgICAgdmFyIHNvdXJjZSA9IHN0cmluZ1N0b3JlLnN0cihpZClcbiAgICAgIHNoYWRlciA9IGdsLmNyZWF0ZVNoYWRlcih0eXBlKVxuICAgICAgZ2wuc2hhZGVyU291cmNlKHNoYWRlciwgc291cmNlKVxuICAgICAgZ2wuY29tcGlsZVNoYWRlcihzaGFkZXIpXG4gICAgICBcbiAgICAgIGNhY2hlW2lkXSA9IHNoYWRlclxuICAgIH1cblxuICAgIHJldHVybiBzaGFkZXJcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBwcm9ncmFtIGxpbmtpbmdcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIHZhciBwcm9ncmFtQ2FjaGUgPSB7fVxuICB2YXIgcHJvZ3JhbUxpc3QgPSBbXVxuXG4gIHZhciBQUk9HUkFNX0NPVU5URVIgPSAwXG5cbiAgZnVuY3Rpb24gUkVHTFByb2dyYW0gKGZyYWdJZCwgdmVydElkKSB7XG4gICAgdGhpcy5pZCA9IFBST0dSQU1fQ09VTlRFUisrXG4gICAgdGhpcy5mcmFnSWQgPSBmcmFnSWRcbiAgICB0aGlzLnZlcnRJZCA9IHZlcnRJZFxuICAgIHRoaXMucHJvZ3JhbSA9IG51bGxcbiAgICB0aGlzLnVuaWZvcm1zID0gW11cbiAgICB0aGlzLmF0dHJpYnV0ZXMgPSBbXVxuXG4gICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICB0aGlzLnN0YXRzID0ge1xuICAgICAgICB1bmlmb3Jtc0NvdW50OiAwLFxuICAgICAgICBhdHRyaWJ1dGVzQ291bnQ6IDBcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBsaW5rUHJvZ3JhbSAoZGVzYywgY29tbWFuZCkge1xuICAgIHZhciBpLCBpbmZvXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gY29tcGlsZSAmIGxpbmtcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgdmFyIGZyYWdTaGFkZXIgPSBnZXRTaGFkZXIoR0xfRlJBR01FTlRfU0hBREVSLCBkZXNjLmZyYWdJZClcbiAgICB2YXIgdmVydFNoYWRlciA9IGdldFNoYWRlcihHTF9WRVJURVhfU0hBREVSLCBkZXNjLnZlcnRJZClcblxuICAgIHZhciBwcm9ncmFtID0gZGVzYy5wcm9ncmFtID0gZ2wuY3JlYXRlUHJvZ3JhbSgpXG4gICAgZ2wuYXR0YWNoU2hhZGVyKHByb2dyYW0sIGZyYWdTaGFkZXIpXG4gICAgZ2wuYXR0YWNoU2hhZGVyKHByb2dyYW0sIHZlcnRTaGFkZXIpXG4gICAgZ2wubGlua1Byb2dyYW0ocHJvZ3JhbSlcbiAgICBcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBncmFiIHVuaWZvcm1zXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHZhciBudW1Vbmlmb3JtcyA9IGdsLmdldFByb2dyYW1QYXJhbWV0ZXIocHJvZ3JhbSwgR0xfQUNUSVZFX1VOSUZPUk1TKVxuICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgZGVzYy5zdGF0cy51bmlmb3Jtc0NvdW50ID0gbnVtVW5pZm9ybXNcbiAgICB9XG4gICAgdmFyIHVuaWZvcm1zID0gZGVzYy51bmlmb3Jtc1xuICAgIGZvciAoaSA9IDA7IGkgPCBudW1Vbmlmb3JtczsgKytpKSB7XG4gICAgICBpbmZvID0gZ2wuZ2V0QWN0aXZlVW5pZm9ybShwcm9ncmFtLCBpKVxuICAgICAgaWYgKGluZm8pIHtcbiAgICAgICAgaWYgKGluZm8uc2l6ZSA+IDEpIHtcbiAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGluZm8uc2l6ZTsgKytqKSB7XG4gICAgICAgICAgICB2YXIgbmFtZSA9IGluZm8ubmFtZS5yZXBsYWNlKCdbMF0nLCAnWycgKyBqICsgJ10nKVxuICAgICAgICAgICAgaW5zZXJ0QWN0aXZlSW5mbyh1bmlmb3JtcywgbmV3IEFjdGl2ZUluZm8oXG4gICAgICAgICAgICAgIG5hbWUsXG4gICAgICAgICAgICAgIHN0cmluZ1N0b3JlLmlkKG5hbWUpLFxuICAgICAgICAgICAgICBnbC5nZXRVbmlmb3JtTG9jYXRpb24ocHJvZ3JhbSwgbmFtZSksXG4gICAgICAgICAgICAgIGluZm8pKVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpbnNlcnRBY3RpdmVJbmZvKHVuaWZvcm1zLCBuZXcgQWN0aXZlSW5mbyhcbiAgICAgICAgICAgIGluZm8ubmFtZSxcbiAgICAgICAgICAgIHN0cmluZ1N0b3JlLmlkKGluZm8ubmFtZSksXG4gICAgICAgICAgICBnbC5nZXRVbmlmb3JtTG9jYXRpb24ocHJvZ3JhbSwgaW5mby5uYW1lKSxcbiAgICAgICAgICAgIGluZm8pKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGdyYWIgYXR0cmlidXRlc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICB2YXIgbnVtQXR0cmlidXRlcyA9IGdsLmdldFByb2dyYW1QYXJhbWV0ZXIocHJvZ3JhbSwgR0xfQUNUSVZFX0FUVFJJQlVURVMpXG4gICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICBkZXNjLnN0YXRzLmF0dHJpYnV0ZXNDb3VudCA9IG51bUF0dHJpYnV0ZXNcbiAgICB9XG5cbiAgICB2YXIgYXR0cmlidXRlcyA9IGRlc2MuYXR0cmlidXRlc1xuICAgIGZvciAoaSA9IDA7IGkgPCBudW1BdHRyaWJ1dGVzOyArK2kpIHtcbiAgICAgIGluZm8gPSBnbC5nZXRBY3RpdmVBdHRyaWIocHJvZ3JhbSwgaSlcbiAgICAgIGlmIChpbmZvKSB7XG4gICAgICAgIGluc2VydEFjdGl2ZUluZm8oYXR0cmlidXRlcywgbmV3IEFjdGl2ZUluZm8oXG4gICAgICAgICAgaW5mby5uYW1lLFxuICAgICAgICAgIHN0cmluZ1N0b3JlLmlkKGluZm8ubmFtZSksXG4gICAgICAgICAgZ2wuZ2V0QXR0cmliTG9jYXRpb24ocHJvZ3JhbSwgaW5mby5uYW1lKSxcbiAgICAgICAgICBpbmZvKSlcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICBzdGF0cy5nZXRNYXhVbmlmb3Jtc0NvdW50ID0gZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIG0gPSAwXG4gICAgICBwcm9ncmFtTGlzdC5mb3JFYWNoKGZ1bmN0aW9uIChkZXNjKSB7XG4gICAgICAgIGlmIChkZXNjLnN0YXRzLnVuaWZvcm1zQ291bnQgPiBtKSB7XG4gICAgICAgICAgbSA9IGRlc2Muc3RhdHMudW5pZm9ybXNDb3VudFxuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgcmV0dXJuIG1cbiAgICB9XG5cbiAgICBzdGF0cy5nZXRNYXhBdHRyaWJ1dGVzQ291bnQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgbSA9IDBcbiAgICAgIHByb2dyYW1MaXN0LmZvckVhY2goZnVuY3Rpb24gKGRlc2MpIHtcbiAgICAgICAgaWYgKGRlc2Muc3RhdHMuYXR0cmlidXRlc0NvdW50ID4gbSkge1xuICAgICAgICAgIG0gPSBkZXNjLnN0YXRzLmF0dHJpYnV0ZXNDb3VudFxuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgcmV0dXJuIG1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiByZXN0b3JlU2hhZGVycyAoKSB7XG4gICAgZnJhZ1NoYWRlcnMgPSB7fVxuICAgIHZlcnRTaGFkZXJzID0ge31cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHByb2dyYW1MaXN0Lmxlbmd0aDsgKytpKSB7XG4gICAgICBsaW5rUHJvZ3JhbShwcm9ncmFtTGlzdFtpXSlcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNsZWFyOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgZGVsZXRlU2hhZGVyID0gZ2wuZGVsZXRlU2hhZGVyLmJpbmQoZ2wpXG4gICAgICB2YWx1ZXMoZnJhZ1NoYWRlcnMpLmZvckVhY2goZGVsZXRlU2hhZGVyKVxuICAgICAgZnJhZ1NoYWRlcnMgPSB7fVxuICAgICAgdmFsdWVzKHZlcnRTaGFkZXJzKS5mb3JFYWNoKGRlbGV0ZVNoYWRlcilcbiAgICAgIHZlcnRTaGFkZXJzID0ge31cblxuICAgICAgcHJvZ3JhbUxpc3QuZm9yRWFjaChmdW5jdGlvbiAoZGVzYykge1xuICAgICAgICBnbC5kZWxldGVQcm9ncmFtKGRlc2MucHJvZ3JhbSlcbiAgICAgIH0pXG4gICAgICBwcm9ncmFtTGlzdC5sZW5ndGggPSAwXG4gICAgICBwcm9ncmFtQ2FjaGUgPSB7fVxuXG4gICAgICBzdGF0cy5zaGFkZXJDb3VudCA9IDBcbiAgICB9LFxuXG4gICAgcHJvZ3JhbTogZnVuY3Rpb24gKHZlcnRJZCwgZnJhZ0lkLCBjb21tYW5kKSB7XG4gICAgICBcbiAgICAgIFxuXG4gICAgICBzdGF0cy5zaGFkZXJDb3VudCsrXG5cbiAgICAgIHZhciBjYWNoZSA9IHByb2dyYW1DYWNoZVtmcmFnSWRdXG4gICAgICBpZiAoIWNhY2hlKSB7XG4gICAgICAgIGNhY2hlID0gcHJvZ3JhbUNhY2hlW2ZyYWdJZF0gPSB7fVxuICAgICAgfVxuICAgICAgdmFyIHByb2dyYW0gPSBjYWNoZVt2ZXJ0SWRdXG4gICAgICBpZiAoIXByb2dyYW0pIHtcbiAgICAgICAgcHJvZ3JhbSA9IG5ldyBSRUdMUHJvZ3JhbShmcmFnSWQsIHZlcnRJZClcbiAgICAgICAgbGlua1Byb2dyYW0ocHJvZ3JhbSwgY29tbWFuZClcbiAgICAgICAgY2FjaGVbdmVydElkXSA9IHByb2dyYW1cbiAgICAgICAgcHJvZ3JhbUxpc3QucHVzaChwcm9ncmFtKVxuICAgICAgfVxuICAgICAgcmV0dXJuIHByb2dyYW1cbiAgICB9LFxuXG4gICAgcmVzdG9yZTogcmVzdG9yZVNoYWRlcnMsXG5cbiAgICBzaGFkZXI6IGdldFNoYWRlcixcblxuICAgIGZyYWc6IC0xLFxuICAgIHZlcnQ6IC0xXG4gIH1cbn1cbiIsIlxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBzdGF0cyAoKSB7XG4gIHJldHVybiB7XG4gICAgYnVmZmVyQ291bnQ6IDAsXG4gICAgZWxlbWVudHNDb3VudDogMCxcbiAgICBmcmFtZWJ1ZmZlckNvdW50OiAwLFxuICAgIHNoYWRlckNvdW50OiAwLFxuICAgIHRleHR1cmVDb3VudDogMCxcbiAgICBjdWJlQ291bnQ6IDAsXG4gICAgcmVuZGVyYnVmZmVyQ291bnQ6IDAsXG5cbiAgICBtYXhUZXh0dXJlVW5pdHM6IDBcbiAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjcmVhdGVTdHJpbmdTdG9yZSAoKSB7XG4gIHZhciBzdHJpbmdJZHMgPSB7Jyc6IDB9XG4gIHZhciBzdHJpbmdWYWx1ZXMgPSBbJyddXG4gIHJldHVybiB7XG4gICAgaWQ6IGZ1bmN0aW9uIChzdHIpIHtcbiAgICAgIHZhciByZXN1bHQgPSBzdHJpbmdJZHNbc3RyXVxuICAgICAgaWYgKHJlc3VsdCkge1xuICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICB9XG4gICAgICByZXN1bHQgPSBzdHJpbmdJZHNbc3RyXSA9IHN0cmluZ1ZhbHVlcy5sZW5ndGhcbiAgICAgIHN0cmluZ1ZhbHVlcy5wdXNoKHN0cilcbiAgICAgIHJldHVybiByZXN1bHRcbiAgICB9LFxuXG4gICAgc3RyOiBmdW5jdGlvbiAoaWQpIHtcbiAgICAgIHJldHVybiBzdHJpbmdWYWx1ZXNbaWRdXG4gICAgfVxuICB9XG59XG4iLCJcbnZhciBleHRlbmQgPSByZXF1aXJlKCcuL3V0aWwvZXh0ZW5kJylcbnZhciB2YWx1ZXMgPSByZXF1aXJlKCcuL3V0aWwvdmFsdWVzJylcbnZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL3V0aWwvaXMtdHlwZWQtYXJyYXknKVxudmFyIGlzTkRBcnJheUxpa2UgPSByZXF1aXJlKCcuL3V0aWwvaXMtbmRhcnJheScpXG52YXIgcG9vbCA9IHJlcXVpcmUoJy4vdXRpbC9wb29sJylcbnZhciBjb252ZXJ0VG9IYWxmRmxvYXQgPSByZXF1aXJlKCcuL3V0aWwvdG8taGFsZi1mbG9hdCcpXG52YXIgaXNBcnJheUxpa2UgPSByZXF1aXJlKCcuL3V0aWwvaXMtYXJyYXktbGlrZScpXG5cbnZhciBkdHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9hcnJheXR5cGVzLmpzb24nKVxudmFyIGFycmF5VHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9hcnJheXR5cGVzLmpzb24nKVxuXG52YXIgR0xfQ09NUFJFU1NFRF9URVhUVVJFX0ZPUk1BVFMgPSAweDg2QTNcblxudmFyIEdMX1RFWFRVUkVfMkQgPSAweDBERTFcbnZhciBHTF9URVhUVVJFX0NVQkVfTUFQID0gMHg4NTEzXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YID0gMHg4NTE1XG5cbnZhciBHTF9SR0JBID0gMHgxOTA4XG52YXIgR0xfQUxQSEEgPSAweDE5MDZcbnZhciBHTF9SR0IgPSAweDE5MDdcbnZhciBHTF9MVU1JTkFOQ0UgPSAweDE5MDlcbnZhciBHTF9MVU1JTkFOQ0VfQUxQSEEgPSAweDE5MEFcblxudmFyIEdMX1JHQkE0ID0gMHg4MDU2XG52YXIgR0xfUkdCNV9BMSA9IDB4ODA1N1xudmFyIEdMX1JHQjU2NSA9IDB4OEQ2MlxuXG52YXIgR0xfVU5TSUdORURfU0hPUlRfNF80XzRfNCA9IDB4ODAzM1xudmFyIEdMX1VOU0lHTkVEX1NIT1JUXzVfNV81XzEgPSAweDgwMzRcbnZhciBHTF9VTlNJR05FRF9TSE9SVF81XzZfNSA9IDB4ODM2M1xudmFyIEdMX1VOU0lHTkVEX0lOVF8yNF84X1dFQkdMID0gMHg4NEZBXG5cbnZhciBHTF9ERVBUSF9DT01QT05FTlQgPSAweDE5MDJcbnZhciBHTF9ERVBUSF9TVEVOQ0lMID0gMHg4NEY5XG5cbnZhciBHTF9TUkdCX0VYVCA9IDB4OEM0MFxudmFyIEdMX1NSR0JfQUxQSEFfRVhUID0gMHg4QzQyXG5cbnZhciBHTF9IQUxGX0ZMT0FUX09FUyA9IDB4OEQ2MVxuXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfUzNUQ19EWFQxX0VYVCA9IDB4ODNGMFxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDFfRVhUID0gMHg4M0YxXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUM19FWFQgPSAweDgzRjJcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQ1X0VYVCA9IDB4ODNGM1xuXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfQVRDX1dFQkdMID0gMHg4QzkyXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19FWFBMSUNJVF9BTFBIQV9XRUJHTCA9IDB4OEM5M1xudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9BVENfSU5URVJQT0xBVEVEX0FMUEhBX1dFQkdMID0gMHg4N0VFXG5cbnZhciBHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ180QlBQVjFfSU1HID0gMHg4QzAwXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfUFZSVENfMkJQUFYxX0lNRyA9IDB4OEMwMVxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9QVlJUQ180QlBQVjFfSU1HID0gMHg4QzAyXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1BWUlRDXzJCUFBWMV9JTUcgPSAweDhDMDNcblxudmFyIEdMX0NPTVBSRVNTRURfUkdCX0VUQzFfV0VCR0wgPSAweDhENjRcblxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSAweDE0MDFcbnZhciBHTF9VTlNJR05FRF9TSE9SVCA9IDB4MTQwM1xudmFyIEdMX1VOU0lHTkVEX0lOVCA9IDB4MTQwNVxudmFyIEdMX0ZMT0FUID0gMHgxNDA2XG5cbnZhciBHTF9URVhUVVJFX1dSQVBfUyA9IDB4MjgwMlxudmFyIEdMX1RFWFRVUkVfV1JBUF9UID0gMHgyODAzXG5cbnZhciBHTF9SRVBFQVQgPSAweDI5MDFcbnZhciBHTF9DTEFNUF9UT19FREdFID0gMHg4MTJGXG52YXIgR0xfTUlSUk9SRURfUkVQRUFUID0gMHg4MzcwXG5cbnZhciBHTF9URVhUVVJFX01BR19GSUxURVIgPSAweDI4MDBcbnZhciBHTF9URVhUVVJFX01JTl9GSUxURVIgPSAweDI4MDFcblxudmFyIEdMX05FQVJFU1QgPSAweDI2MDBcbnZhciBHTF9MSU5FQVIgPSAweDI2MDFcbnZhciBHTF9ORUFSRVNUX01JUE1BUF9ORUFSRVNUID0gMHgyNzAwXG52YXIgR0xfTElORUFSX01JUE1BUF9ORUFSRVNUID0gMHgyNzAxXG52YXIgR0xfTkVBUkVTVF9NSVBNQVBfTElORUFSID0gMHgyNzAyXG52YXIgR0xfTElORUFSX01JUE1BUF9MSU5FQVIgPSAweDI3MDNcblxudmFyIEdMX0dFTkVSQVRFX01JUE1BUF9ISU5UID0gMHg4MTkyXG52YXIgR0xfRE9OVF9DQVJFID0gMHgxMTAwXG52YXIgR0xfRkFTVEVTVCA9IDB4MTEwMVxudmFyIEdMX05JQ0VTVCA9IDB4MTEwMlxuXG52YXIgR0xfVEVYVFVSRV9NQVhfQU5JU09UUk9QWV9FWFQgPSAweDg0RkVcblxudmFyIEdMX1VOUEFDS19BTElHTk1FTlQgPSAweDBDRjVcbnZhciBHTF9VTlBBQ0tfRkxJUF9ZX1dFQkdMID0gMHg5MjQwXG52YXIgR0xfVU5QQUNLX1BSRU1VTFRJUExZX0FMUEhBX1dFQkdMID0gMHg5MjQxXG52YXIgR0xfVU5QQUNLX0NPTE9SU1BBQ0VfQ09OVkVSU0lPTl9XRUJHTCA9IDB4OTI0M1xuXG52YXIgR0xfQlJPV1NFUl9ERUZBVUxUX1dFQkdMID0gMHg5MjQ0XG5cbnZhciBHTF9URVhUVVJFMCA9IDB4ODRDMFxuXG52YXIgTUlQTUFQX0ZJTFRFUlMgPSBbXG4gIEdMX05FQVJFU1RfTUlQTUFQX05FQVJFU1QsXG4gIEdMX05FQVJFU1RfTUlQTUFQX0xJTkVBUixcbiAgR0xfTElORUFSX01JUE1BUF9ORUFSRVNULFxuICBHTF9MSU5FQVJfTUlQTUFQX0xJTkVBUlxuXVxuXG52YXIgQ0hBTk5FTFNfRk9STUFUID0gW1xuICAwLFxuICBHTF9MVU1JTkFOQ0UsXG4gIEdMX0xVTUlOQU5DRV9BTFBIQSxcbiAgR0xfUkdCLFxuICBHTF9SR0JBXG5dXG5cbnZhciBGT1JNQVRfQ0hBTk5FTFMgPSB7fVxuRk9STUFUX0NIQU5ORUxTW0dMX0xVTUlOQU5DRV0gPVxuRk9STUFUX0NIQU5ORUxTW0dMX0FMUEhBXSA9XG5GT1JNQVRfQ0hBTk5FTFNbR0xfREVQVEhfQ09NUE9ORU5UXSA9IDFcbkZPUk1BVF9DSEFOTkVMU1tHTF9ERVBUSF9TVEVOQ0lMXSA9XG5GT1JNQVRfQ0hBTk5FTFNbR0xfTFVNSU5BTkNFX0FMUEhBXSA9IDJcbkZPUk1BVF9DSEFOTkVMU1tHTF9SR0JdID1cbkZPUk1BVF9DSEFOTkVMU1tHTF9TUkdCX0VYVF0gPSAzXG5GT1JNQVRfQ0hBTk5FTFNbR0xfUkdCQV0gPVxuRk9STUFUX0NIQU5ORUxTW0dMX1NSR0JfQUxQSEFfRVhUXSA9IDRcblxudmFyIGZvcm1hdFR5cGVzID0ge31cbmZvcm1hdFR5cGVzW0dMX1JHQkE0XSA9IEdMX1VOU0lHTkVEX1NIT1JUXzRfNF80XzRcbmZvcm1hdFR5cGVzW0dMX1JHQjU2NV0gPSBHTF9VTlNJR05FRF9TSE9SVF81XzZfNVxuZm9ybWF0VHlwZXNbR0xfUkdCNV9BMV0gPSBHTF9VTlNJR05FRF9TSE9SVF81XzVfNV8xXG5mb3JtYXRUeXBlc1tHTF9ERVBUSF9DT01QT05FTlRdID0gR0xfVU5TSUdORURfSU5UXG5mb3JtYXRUeXBlc1tHTF9ERVBUSF9TVEVOQ0lMXSA9IEdMX1VOU0lHTkVEX0lOVF8yNF84X1dFQkdMXG5cbmZ1bmN0aW9uIG9iamVjdE5hbWUgKHN0cikge1xuICByZXR1cm4gJ1tvYmplY3QgJyArIHN0ciArICddJ1xufVxuXG52YXIgQ0FOVkFTX0NMQVNTID0gb2JqZWN0TmFtZSgnSFRNTENhbnZhc0VsZW1lbnQnKVxudmFyIENPTlRFWFQyRF9DTEFTUyA9IG9iamVjdE5hbWUoJ0NhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCcpXG52YXIgSU1BR0VfQ0xBU1MgPSBvYmplY3ROYW1lKCdIVE1MSW1hZ2VFbGVtZW50JylcbnZhciBWSURFT19DTEFTUyA9IG9iamVjdE5hbWUoJ0hUTUxWaWRlb0VsZW1lbnQnKVxuXG52YXIgUElYRUxfQ0xBU1NFUyA9IE9iamVjdC5rZXlzKGR0eXBlcykuY29uY2F0KFtcbiAgQ0FOVkFTX0NMQVNTLFxuICBDT05URVhUMkRfQ0xBU1MsXG4gIElNQUdFX0NMQVNTLFxuICBWSURFT19DTEFTU1xuXSlcblxuLy8gZm9yIGV2ZXJ5IHRleHR1cmUgdHlwZSwgc3RvcmVcbi8vIHRoZSBzaXplIGluIGJ5dGVzLlxudmFyIFRZUEVfU0laRVMgPSBbXVxuVFlQRV9TSVpFU1tHTF9VTlNJR05FRF9CWVRFXSA9IDFcblRZUEVfU0laRVNbR0xfRkxPQVRdID0gNFxuVFlQRV9TSVpFU1tHTF9IQUxGX0ZMT0FUX09FU10gPSAyXG5cblRZUEVfU0laRVNbR0xfVU5TSUdORURfU0hPUlRdID0gMlxuVFlQRV9TSVpFU1tHTF9VTlNJR05FRF9JTlRdID0gNFxuXG52YXIgRk9STUFUX1NJWkVTX1NQRUNJQUwgPSBbXVxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfUkdCQTRdID0gMlxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfUkdCNV9BMV0gPSAyXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9SR0I1NjVdID0gMlxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfREVQVEhfU1RFTkNJTF0gPSA0XG5cbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCX1MzVENfRFhUMV9FWFRdID0gMC41XG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQxX0VYVF0gPSAwLjVcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDNfRVhUXSA9IDFcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDVfRVhUXSA9IDFcblxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JfQVRDX1dFQkdMXSA9IDAuNVxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19FWFBMSUNJVF9BTFBIQV9XRUJHTF0gPSAxXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQkFfQVRDX0lOVEVSUE9MQVRFRF9BTFBIQV9XRUJHTF0gPSAxXG5cbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCX1BWUlRDXzRCUFBWMV9JTUddID0gMC41XG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ18yQlBQVjFfSU1HXSA9IDAuMjVcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCQV9QVlJUQ180QlBQVjFfSU1HXSA9IDAuNVxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JBX1BWUlRDXzJCUFBWMV9JTUddID0gMC4yNVxuXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQl9FVEMxX1dFQkdMXSA9IDAuNVxuXG5mdW5jdGlvbiBpc051bWVyaWNBcnJheSAoYXJyKSB7XG4gIHJldHVybiAoXG4gICAgQXJyYXkuaXNBcnJheShhcnIpICYmXG4gICAgKGFyci5sZW5ndGggPT09IDAgfHxcbiAgICB0eXBlb2YgYXJyWzBdID09PSAnbnVtYmVyJykpXG59XG5cbmZ1bmN0aW9uIGlzUmVjdEFycmF5IChhcnIpIHtcbiAgaWYgKCFBcnJheS5pc0FycmF5KGFycikpIHtcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxuICB2YXIgd2lkdGggPSBhcnIubGVuZ3RoXG4gIGlmICh3aWR0aCA9PT0gMCB8fCAhaXNBcnJheUxpa2UoYXJyWzBdKSkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG4gIHJldHVybiB0cnVlXG59XG5cbmZ1bmN0aW9uIGNsYXNzU3RyaW5nICh4KSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoeClcbn1cblxuZnVuY3Rpb24gaXNDYW52YXNFbGVtZW50IChvYmplY3QpIHtcbiAgcmV0dXJuIGNsYXNzU3RyaW5nKG9iamVjdCkgPT09IENBTlZBU19DTEFTU1xufVxuXG5mdW5jdGlvbiBpc0NvbnRleHQyRCAob2JqZWN0KSB7XG4gIHJldHVybiBjbGFzc1N0cmluZyhvYmplY3QpID09PSBDT05URVhUMkRfQ0xBU1Ncbn1cblxuZnVuY3Rpb24gaXNJbWFnZUVsZW1lbnQgKG9iamVjdCkge1xuICByZXR1cm4gY2xhc3NTdHJpbmcob2JqZWN0KSA9PT0gSU1BR0VfQ0xBU1Ncbn1cblxuZnVuY3Rpb24gaXNWaWRlb0VsZW1lbnQgKG9iamVjdCkge1xuICByZXR1cm4gY2xhc3NTdHJpbmcob2JqZWN0KSA9PT0gVklERU9fQ0xBU1Ncbn1cblxuZnVuY3Rpb24gaXNQaXhlbERhdGEgKG9iamVjdCkge1xuICBpZiAoIW9iamVjdCkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG4gIHZhciBjbGFzc05hbWUgPSBjbGFzc1N0cmluZyhvYmplY3QpXG4gIGlmIChQSVhFTF9DTEFTU0VTLmluZGV4T2YoY2xhc3NOYW1lKSA+PSAwKSB7XG4gICAgcmV0dXJuIHRydWVcbiAgfVxuICByZXR1cm4gKFxuICAgIGlzTnVtZXJpY0FycmF5KG9iamVjdCkgfHxcbiAgICBpc1JlY3RBcnJheShvYmplY3QpIHx8XG4gICAgaXNOREFycmF5TGlrZShvYmplY3QpKVxufVxuXG5mdW5jdGlvbiB0eXBlZEFycmF5Q29kZSAoZGF0YSkge1xuICByZXR1cm4gYXJyYXlUeXBlc1tPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoZGF0YSldIHwgMFxufVxuXG5mdW5jdGlvbiBjb252ZXJ0RGF0YSAocmVzdWx0LCBkYXRhKSB7XG4gIHZhciBuID0gcmVzdWx0LndpZHRoICogcmVzdWx0LmhlaWdodCAqIHJlc3VsdC5jaGFubmVsc1xuICBcblxuICBzd2l0Y2ggKHJlc3VsdC50eXBlKSB7XG4gICAgY2FzZSBHTF9VTlNJR05FRF9CWVRFOlxuICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlQ6XG4gICAgY2FzZSBHTF9VTlNJR05FRF9JTlQ6XG4gICAgY2FzZSBHTF9GTE9BVDpcbiAgICAgIHZhciBjb252ZXJ0ZWQgPSBwb29sLmFsbG9jVHlwZShyZXN1bHQudHlwZSwgbilcbiAgICAgIGNvbnZlcnRlZC5zZXQoZGF0YSlcbiAgICAgIHJlc3VsdC5kYXRhID0gY29udmVydGVkXG4gICAgICBicmVha1xuXG4gICAgY2FzZSBHTF9IQUxGX0ZMT0FUX09FUzpcbiAgICAgIHJlc3VsdC5kYXRhID0gY29udmVydFRvSGFsZkZsb2F0KGRhdGEpXG4gICAgICBicmVha1xuXG4gICAgZGVmYXVsdDpcbiAgICAgIFxuICB9XG59XG5cbmZ1bmN0aW9uIHByZUNvbnZlcnQgKGltYWdlLCBuKSB7XG4gIHJldHVybiBwb29sLmFsbG9jVHlwZShcbiAgICBpbWFnZS50eXBlID09PSBHTF9IQUxGX0ZMT0FUX09FU1xuICAgICAgPyBHTF9GTE9BVFxuICAgICAgOiBpbWFnZS50eXBlLCBuKVxufVxuXG5mdW5jdGlvbiBwb3N0Q29udmVydCAoaW1hZ2UsIGRhdGEpIHtcbiAgaWYgKGltYWdlLnR5cGUgPT09IEdMX0hBTEZfRkxPQVRfT0VTKSB7XG4gICAgaW1hZ2UuZGF0YSA9IGNvbnZlcnRUb0hhbGZGbG9hdChkYXRhKVxuICAgIHBvb2wuZnJlZVR5cGUoZGF0YSlcbiAgfSBlbHNlIHtcbiAgICBpbWFnZS5kYXRhID0gZGF0YVxuICB9XG59XG5cbmZ1bmN0aW9uIHRyYW5zcG9zZURhdGEgKGltYWdlLCBhcnJheSwgc3RyaWRlWCwgc3RyaWRlWSwgc3RyaWRlQywgb2Zmc2V0KSB7XG4gIHZhciB3ID0gaW1hZ2Uud2lkdGhcbiAgdmFyIGggPSBpbWFnZS5oZWlnaHRcbiAgdmFyIGMgPSBpbWFnZS5jaGFubmVsc1xuICB2YXIgbiA9IHcgKiBoICogY1xuICB2YXIgZGF0YSA9IHByZUNvbnZlcnQoaW1hZ2UsIG4pXG5cbiAgdmFyIHAgPSAwXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgaDsgKytpKSB7XG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCB3OyArK2opIHtcbiAgICAgIGZvciAodmFyIGsgPSAwOyBrIDwgYzsgKytrKSB7XG4gICAgICAgIGRhdGFbcCsrXSA9IGFycmF5W3N0cmlkZVggKiBqICsgc3RyaWRlWSAqIGkgKyBzdHJpZGVDICogayArIG9mZnNldF1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwb3N0Q29udmVydChpbWFnZSwgZGF0YSlcbn1cblxuZnVuY3Rpb24gZmxhdHRlbjJERGF0YSAoaW1hZ2UsIGFycmF5LCB3LCBoKSB7XG4gIHZhciBuID0gdyAqIGhcbiAgdmFyIGRhdGEgPSBwcmVDb252ZXJ0KGltYWdlLCBuKVxuXG4gIHZhciBwID0gMFxuICBmb3IgKHZhciBpID0gMDsgaSA8IGg7ICsraSkge1xuICAgIHZhciByb3cgPSBhcnJheVtpXVxuICAgIGZvciAodmFyIGogPSAwOyBqIDwgdzsgKytqKSB7XG4gICAgICBkYXRhW3ArK10gPSByb3dbal1cbiAgICB9XG4gIH1cblxuICBwb3N0Q29udmVydChpbWFnZSwgZGF0YSlcbn1cblxuZnVuY3Rpb24gZmxhdHRlbjNERGF0YSAoaW1hZ2UsIGFycmF5LCB3LCBoLCBjKSB7XG4gIHZhciBuID0gdyAqIGggKiBjXG4gIHZhciBkYXRhID0gcHJlQ29udmVydChpbWFnZSwgbilcblxuICB2YXIgcCA9IDBcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBoOyArK2kpIHtcbiAgICB2YXIgcm93ID0gYXJyYXlbaV1cbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IHc7ICsraikge1xuICAgICAgdmFyIHBpeGVsID0gcm93W2pdXG4gICAgICBmb3IgKHZhciBrID0gMDsgayA8IGM7ICsraykge1xuICAgICAgICBkYXRhW3ArK10gPSBwaXhlbFtrXVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHBvc3RDb252ZXJ0KGltYWdlLCBkYXRhKVxufVxuXG5mdW5jdGlvbiBnZXRUZXh0dXJlU2l6ZSAoZm9ybWF0LCB0eXBlLCB3aWR0aCwgaGVpZ2h0LCBpc01pcG1hcCwgaXNDdWJlKSB7XG4gIHZhciBzXG4gIGlmICh0eXBlb2YgRk9STUFUX1NJWkVTX1NQRUNJQUxbZm9ybWF0XSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAvLyB3ZSBoYXZlIGEgc3BlY2lhbCBhcnJheSBmb3IgZGVhbGluZyB3aXRoIHdlaXJkIGNvbG9yIGZvcm1hdHMgc3VjaCBhcyBSR0I1QTFcbiAgICBzID0gRk9STUFUX1NJWkVTX1NQRUNJQUxbZm9ybWF0XVxuICB9IGVsc2Uge1xuICAgIHMgPSBGT1JNQVRfQ0hBTk5FTFNbZm9ybWF0XSAqIFRZUEVfU0laRVNbdHlwZV1cbiAgfVxuXG4gIGlmIChpc0N1YmUpIHtcbiAgICBzICo9IDZcbiAgfVxuXG4gIGlmIChpc01pcG1hcCkge1xuICAgIC8vIGNvbXB1dGUgdGhlIHRvdGFsIHNpemUgb2YgYWxsIHRoZSBtaXBtYXBzLlxuICAgIHZhciB0b3RhbCA9IDBcblxuICAgIHZhciB3ID0gd2lkdGhcbiAgICB3aGlsZSAodyA+PSAxKSB7XG4gICAgICAvLyB3ZSBjYW4gb25seSB1c2UgbWlwbWFwcyBvbiBhIHNxdWFyZSBpbWFnZSxcbiAgICAgIC8vIHNvIHdlIGNhbiBzaW1wbHkgdXNlIHRoZSB3aWR0aCBhbmQgaWdub3JlIHRoZSBoZWlnaHQ6XG4gICAgICB0b3RhbCArPSBzICogdyAqIHdcbiAgICAgIHcgLz0gMlxuICAgIH1cbiAgICByZXR1cm4gdG90YWxcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gcyAqIHdpZHRoICogaGVpZ2h0XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjcmVhdGVUZXh0dXJlU2V0IChcbiAgZ2wsIGV4dGVuc2lvbnMsIGxpbWl0cywgcmVnbFBvbGwsIGNvbnRleHRTdGF0ZSwgc3RhdHMsIGNvbmZpZykge1xuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIEluaXRpYWxpemUgY29uc3RhbnRzIGFuZCBwYXJhbWV0ZXIgdGFibGVzIGhlcmVcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICB2YXIgbWlwbWFwSGludCA9IHtcbiAgICBcImRvbid0IGNhcmVcIjogR0xfRE9OVF9DQVJFLFxuICAgICdkb250IGNhcmUnOiBHTF9ET05UX0NBUkUsXG4gICAgJ25pY2UnOiBHTF9OSUNFU1QsXG4gICAgJ2Zhc3QnOiBHTF9GQVNURVNUXG4gIH1cblxuICB2YXIgd3JhcE1vZGVzID0ge1xuICAgICdyZXBlYXQnOiBHTF9SRVBFQVQsXG4gICAgJ2NsYW1wJzogR0xfQ0xBTVBfVE9fRURHRSxcbiAgICAnbWlycm9yJzogR0xfTUlSUk9SRURfUkVQRUFUXG4gIH1cblxuICB2YXIgbWFnRmlsdGVycyA9IHtcbiAgICAnbmVhcmVzdCc6IEdMX05FQVJFU1QsXG4gICAgJ2xpbmVhcic6IEdMX0xJTkVBUlxuICB9XG5cbiAgdmFyIG1pbkZpbHRlcnMgPSBleHRlbmQoe1xuICAgICdtaXBtYXAnOiBHTF9MSU5FQVJfTUlQTUFQX0xJTkVBUixcbiAgICAnbmVhcmVzdCBtaXBtYXAgbmVhcmVzdCc6IEdMX05FQVJFU1RfTUlQTUFQX05FQVJFU1QsXG4gICAgJ2xpbmVhciBtaXBtYXAgbmVhcmVzdCc6IEdMX0xJTkVBUl9NSVBNQVBfTkVBUkVTVCxcbiAgICAnbmVhcmVzdCBtaXBtYXAgbGluZWFyJzogR0xfTkVBUkVTVF9NSVBNQVBfTElORUFSLFxuICAgICdsaW5lYXIgbWlwbWFwIGxpbmVhcic6IEdMX0xJTkVBUl9NSVBNQVBfTElORUFSXG4gIH0sIG1hZ0ZpbHRlcnMpXG5cbiAgdmFyIGNvbG9yU3BhY2UgPSB7XG4gICAgJ25vbmUnOiAwLFxuICAgICdicm93c2VyJzogR0xfQlJPV1NFUl9ERUZBVUxUX1dFQkdMXG4gIH1cblxuICB2YXIgdGV4dHVyZVR5cGVzID0ge1xuICAgICd1aW50OCc6IEdMX1VOU0lHTkVEX0JZVEUsXG4gICAgJ3JnYmE0JzogR0xfVU5TSUdORURfU0hPUlRfNF80XzRfNCxcbiAgICAncmdiNTY1JzogR0xfVU5TSUdORURfU0hPUlRfNV82XzUsXG4gICAgJ3JnYjUgYTEnOiBHTF9VTlNJR05FRF9TSE9SVF81XzVfNV8xXG4gIH1cblxuICB2YXIgdGV4dHVyZUZvcm1hdHMgPSB7XG4gICAgJ2FscGhhJzogR0xfQUxQSEEsXG4gICAgJ2x1bWluYW5jZSc6IEdMX0xVTUlOQU5DRSxcbiAgICAnbHVtaW5hbmNlIGFscGhhJzogR0xfTFVNSU5BTkNFX0FMUEhBLFxuICAgICdyZ2InOiBHTF9SR0IsXG4gICAgJ3JnYmEnOiBHTF9SR0JBLFxuICAgICdyZ2JhNCc6IEdMX1JHQkE0LFxuICAgICdyZ2I1IGExJzogR0xfUkdCNV9BMSxcbiAgICAncmdiNTY1JzogR0xfUkdCNTY1XG4gIH1cblxuICB2YXIgY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzID0ge31cblxuICBpZiAoZXh0ZW5zaW9ucy5leHRfc3JnYikge1xuICAgIHRleHR1cmVGb3JtYXRzLnNyZ2IgPSBHTF9TUkdCX0VYVFxuICAgIHRleHR1cmVGb3JtYXRzLnNyZ2JhID0gR0xfU1JHQl9BTFBIQV9FWFRcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLm9lc190ZXh0dXJlX2Zsb2F0KSB7XG4gICAgdGV4dHVyZVR5cGVzLmZsb2F0MzIgPSB0ZXh0dXJlVHlwZXMuZmxvYXQgPSBHTF9GTE9BVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMub2VzX3RleHR1cmVfaGFsZl9mbG9hdCkge1xuICAgIHRleHR1cmVUeXBlc1snZmxvYXQxNiddID0gdGV4dHVyZVR5cGVzWydoYWxmIGZsb2F0J10gPSBHTF9IQUxGX0ZMT0FUX09FU1xuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfZGVwdGhfdGV4dHVyZSkge1xuICAgIGV4dGVuZCh0ZXh0dXJlRm9ybWF0cywge1xuICAgICAgJ2RlcHRoJzogR0xfREVQVEhfQ09NUE9ORU5ULFxuICAgICAgJ2RlcHRoIHN0ZW5jaWwnOiBHTF9ERVBUSF9TVEVOQ0lMXG4gICAgfSlcblxuICAgIGV4dGVuZCh0ZXh0dXJlVHlwZXMsIHtcbiAgICAgICd1aW50MTYnOiBHTF9VTlNJR05FRF9TSE9SVCxcbiAgICAgICd1aW50MzInOiBHTF9VTlNJR05FRF9JTlQsXG4gICAgICAnZGVwdGggc3RlbmNpbCc6IEdMX1VOU0lHTkVEX0lOVF8yNF84X1dFQkdMXG4gICAgfSlcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9zM3RjKSB7XG4gICAgZXh0ZW5kKGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cywge1xuICAgICAgJ3JnYiBzM3RjIGR4dDEnOiBHTF9DT01QUkVTU0VEX1JHQl9TM1RDX0RYVDFfRVhULFxuICAgICAgJ3JnYmEgczN0YyBkeHQxJzogR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUMV9FWFQsXG4gICAgICAncmdiYSBzM3RjIGR4dDMnOiBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQzX0VYVCxcbiAgICAgICdyZ2JhIHMzdGMgZHh0NSc6IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDVfRVhUXG4gICAgfSlcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9hdGMpIHtcbiAgICBleHRlbmQoY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzLCB7XG4gICAgICAncmdiIGF0Yyc6IEdMX0NPTVBSRVNTRURfUkdCX0FUQ19XRUJHTCxcbiAgICAgICdyZ2JhIGF0YyBleHBsaWNpdCBhbHBoYSc6IEdMX0NPTVBSRVNTRURfUkdCQV9BVENfRVhQTElDSVRfQUxQSEFfV0VCR0wsXG4gICAgICAncmdiYSBhdGMgaW50ZXJwb2xhdGVkIGFscGhhJzogR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19JTlRFUlBPTEFURURfQUxQSEFfV0VCR0xcbiAgICB9KVxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29tcHJlc3NlZF90ZXh0dXJlX3B2cnRjKSB7XG4gICAgZXh0ZW5kKGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cywge1xuICAgICAgJ3JnYiBwdnJ0YyA0YnBwdjEnOiBHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ180QlBQVjFfSU1HLFxuICAgICAgJ3JnYiBwdnJ0YyAyYnBwdjEnOiBHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ18yQlBQVjFfSU1HLFxuICAgICAgJ3JnYmEgcHZydGMgNGJwcHYxJzogR0xfQ09NUFJFU1NFRF9SR0JBX1BWUlRDXzRCUFBWMV9JTUcsXG4gICAgICAncmdiYSBwdnJ0YyAyYnBwdjEnOiBHTF9DT01QUkVTU0VEX1JHQkFfUFZSVENfMkJQUFYxX0lNR1xuICAgIH0pXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb21wcmVzc2VkX3RleHR1cmVfZXRjMSkge1xuICAgIGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0c1sncmdiIGV0YzEnXSA9IEdMX0NPTVBSRVNTRURfUkdCX0VUQzFfV0VCR0xcbiAgfVxuXG4gIC8vIENvcHkgb3ZlciBhbGwgdGV4dHVyZSBmb3JtYXRzXG4gIHZhciBzdXBwb3J0ZWRDb21wcmVzc2VkRm9ybWF0cyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKFxuICAgIGdsLmdldFBhcmFtZXRlcihHTF9DT01QUkVTU0VEX1RFWFRVUkVfRk9STUFUUykpXG4gIE9iamVjdC5rZXlzKGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cykuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgIHZhciBmb3JtYXQgPSBjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHNbbmFtZV1cbiAgICBpZiAoc3VwcG9ydGVkQ29tcHJlc3NlZEZvcm1hdHMuaW5kZXhPZihmb3JtYXQpID49IDApIHtcbiAgICAgIHRleHR1cmVGb3JtYXRzW25hbWVdID0gZm9ybWF0XG4gICAgfVxuICB9KVxuXG4gIHZhciBzdXBwb3J0ZWRGb3JtYXRzID0gT2JqZWN0LmtleXModGV4dHVyZUZvcm1hdHMpXG4gIGxpbWl0cy50ZXh0dXJlRm9ybWF0cyA9IHN1cHBvcnRlZEZvcm1hdHNcblxuICAvLyBhc3NvY2lhdGUgd2l0aCBldmVyeSBmb3JtYXQgc3RyaW5nIGl0c1xuICAvLyBjb3JyZXNwb25kaW5nIEdMLXZhbHVlLlxuICB2YXIgdGV4dHVyZUZvcm1hdHNJbnZlcnQgPSBbXVxuICBPYmplY3Qua2V5cyh0ZXh0dXJlRm9ybWF0cykuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgdmFyIHZhbCA9IHRleHR1cmVGb3JtYXRzW2tleV1cbiAgICB0ZXh0dXJlRm9ybWF0c0ludmVydFt2YWxdID0ga2V5XG4gIH0pXG5cbiAgLy8gYXNzb2NpYXRlIHdpdGggZXZlcnkgdHlwZSBzdHJpbmcgaXRzXG4gIC8vIGNvcnJlc3BvbmRpbmcgR0wtdmFsdWUuXG4gIHZhciB0ZXh0dXJlVHlwZXNJbnZlcnQgPSBbXVxuICBPYmplY3Qua2V5cyh0ZXh0dXJlVHlwZXMpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgIHZhciB2YWwgPSB0ZXh0dXJlVHlwZXNba2V5XVxuICAgIHRleHR1cmVUeXBlc0ludmVydFt2YWxdID0ga2V5XG4gIH0pXG5cbiAgdmFyIG1hZ0ZpbHRlcnNJbnZlcnQgPSBbXVxuICBPYmplY3Qua2V5cyhtYWdGaWx0ZXJzKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICB2YXIgdmFsID0gbWFnRmlsdGVyc1trZXldXG4gICAgbWFnRmlsdGVyc0ludmVydFt2YWxdID0ga2V5XG4gIH0pXG5cbiAgdmFyIG1pbkZpbHRlcnNJbnZlcnQgPSBbXVxuICBPYmplY3Qua2V5cyhtaW5GaWx0ZXJzKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICB2YXIgdmFsID0gbWluRmlsdGVyc1trZXldXG4gICAgbWluRmlsdGVyc0ludmVydFt2YWxdID0ga2V5XG4gIH0pXG5cbiAgdmFyIHdyYXBNb2Rlc0ludmVydCA9IFtdXG4gIE9iamVjdC5rZXlzKHdyYXBNb2RlcykuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgdmFyIHZhbCA9IHdyYXBNb2Rlc1trZXldXG4gICAgd3JhcE1vZGVzSW52ZXJ0W3ZhbF0gPSBrZXlcbiAgfSlcblxuICAvLyBjb2xvckZvcm1hdHNbXSBnaXZlcyB0aGUgZm9ybWF0IChjaGFubmVscykgYXNzb2NpYXRlZCB0byBhblxuICAvLyBpbnRlcm5hbGZvcm1hdFxuICB2YXIgY29sb3JGb3JtYXRzID0gc3VwcG9ydGVkRm9ybWF0cy5yZWR1Y2UoZnVuY3Rpb24gKGNvbG9yLCBrZXkpIHtcbiAgICB2YXIgZ2xlbnVtID0gdGV4dHVyZUZvcm1hdHNba2V5XVxuICAgIGlmIChnbGVudW0gPT09IEdMX0xVTUlOQU5DRSB8fFxuICAgICAgICBnbGVudW0gPT09IEdMX0FMUEhBIHx8XG4gICAgICAgIGdsZW51bSA9PT0gR0xfTFVNSU5BTkNFIHx8XG4gICAgICAgIGdsZW51bSA9PT0gR0xfTFVNSU5BTkNFX0FMUEhBIHx8XG4gICAgICAgIGdsZW51bSA9PT0gR0xfREVQVEhfQ09NUE9ORU5UIHx8XG4gICAgICAgIGdsZW51bSA9PT0gR0xfREVQVEhfU1RFTkNJTCkge1xuICAgICAgY29sb3JbZ2xlbnVtXSA9IGdsZW51bVxuICAgIH0gZWxzZSBpZiAoZ2xlbnVtID09PSBHTF9SR0I1X0ExIHx8IGtleS5pbmRleE9mKCdyZ2JhJykgPj0gMCkge1xuICAgICAgY29sb3JbZ2xlbnVtXSA9IEdMX1JHQkFcbiAgICB9IGVsc2Uge1xuICAgICAgY29sb3JbZ2xlbnVtXSA9IEdMX1JHQlxuICAgIH1cbiAgICByZXR1cm4gY29sb3JcbiAgfSwge30pXG5cbiAgZnVuY3Rpb24gVGV4RmxhZ3MgKCkge1xuICAgIC8vIGZvcm1hdCBpbmZvXG4gICAgdGhpcy5pbnRlcm5hbGZvcm1hdCA9IEdMX1JHQkFcbiAgICB0aGlzLmZvcm1hdCA9IEdMX1JHQkFcbiAgICB0aGlzLnR5cGUgPSBHTF9VTlNJR05FRF9CWVRFXG4gICAgdGhpcy5jb21wcmVzc2VkID0gZmFsc2VcblxuICAgIC8vIHBpeGVsIHN0b3JhZ2VcbiAgICB0aGlzLnByZW11bHRpcGx5QWxwaGEgPSBmYWxzZVxuICAgIHRoaXMuZmxpcFkgPSBmYWxzZVxuICAgIHRoaXMudW5wYWNrQWxpZ25tZW50ID0gMVxuICAgIHRoaXMuY29sb3JTcGFjZSA9IDBcblxuICAgIC8vIHNoYXBlIGluZm9cbiAgICB0aGlzLndpZHRoID0gMFxuICAgIHRoaXMuaGVpZ2h0ID0gMFxuICAgIHRoaXMuY2hhbm5lbHMgPSA0XG4gIH1cblxuICBmdW5jdGlvbiBjb3B5RmxhZ3MgKHJlc3VsdCwgb3RoZXIpIHtcbiAgICByZXN1bHQuaW50ZXJuYWxmb3JtYXQgPSBvdGhlci5pbnRlcm5hbGZvcm1hdFxuICAgIHJlc3VsdC5mb3JtYXQgPSBvdGhlci5mb3JtYXRcbiAgICByZXN1bHQudHlwZSA9IG90aGVyLnR5cGVcbiAgICByZXN1bHQuY29tcHJlc3NlZCA9IG90aGVyLmNvbXByZXNzZWRcblxuICAgIHJlc3VsdC5wcmVtdWx0aXBseUFscGhhID0gb3RoZXIucHJlbXVsdGlwbHlBbHBoYVxuICAgIHJlc3VsdC5mbGlwWSA9IG90aGVyLmZsaXBZXG4gICAgcmVzdWx0LnVucGFja0FsaWdubWVudCA9IG90aGVyLnVucGFja0FsaWdubWVudFxuICAgIHJlc3VsdC5jb2xvclNwYWNlID0gb3RoZXIuY29sb3JTcGFjZVxuXG4gICAgcmVzdWx0LndpZHRoID0gb3RoZXIud2lkdGhcbiAgICByZXN1bHQuaGVpZ2h0ID0gb3RoZXIuaGVpZ2h0XG4gICAgcmVzdWx0LmNoYW5uZWxzID0gb3RoZXIuY2hhbm5lbHNcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlRmxhZ3MgKGZsYWdzLCBvcHRpb25zKSB7XG4gICAgaWYgKHR5cGVvZiBvcHRpb25zICE9PSAnb2JqZWN0JyB8fCAhb3B0aW9ucykge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgaWYgKCdwcmVtdWx0aXBseUFscGhhJyBpbiBvcHRpb25zKSB7XG4gICAgICBcbiAgICAgIGZsYWdzLnByZW11bHRpcGx5QWxwaGEgPSBvcHRpb25zLnByZW11bHRpcGx5QWxwaGFcbiAgICB9XG5cbiAgICBpZiAoJ2ZsaXBZJyBpbiBvcHRpb25zKSB7XG4gICAgICBcbiAgICAgIGZsYWdzLmZsaXBZID0gb3B0aW9ucy5mbGlwWVxuICAgIH1cblxuICAgIGlmICgnYWxpZ25tZW50JyBpbiBvcHRpb25zKSB7XG4gICAgICBcbiAgICAgIGZsYWdzLnVucGFja0FsaWdubWVudCA9IG9wdGlvbnMuYWxpZ25tZW50XG4gICAgfVxuXG4gICAgaWYgKCdjb2xvclNwYWNlJyBpbiBvcHRpb25zKSB7XG4gICAgICBcbiAgICAgIGZsYWdzLmNvbG9yU3BhY2UgPSBjb2xvclNwYWNlW29wdGlvbnMuY29sb3JTcGFjZV1cbiAgICB9XG5cbiAgICBpZiAoJ3R5cGUnIGluIG9wdGlvbnMpIHtcbiAgICAgIHZhciB0eXBlID0gb3B0aW9ucy50eXBlXG4gICAgICBcbiAgICAgIFxuICAgICAgXG4gICAgICBcbiAgICAgIGZsYWdzLnR5cGUgPSB0ZXh0dXJlVHlwZXNbdHlwZV1cbiAgICB9XG5cbiAgICB2YXIgdyA9IGZsYWdzLndpZHRoXG4gICAgdmFyIGggPSBmbGFncy5oZWlnaHRcbiAgICB2YXIgYyA9IGZsYWdzLmNoYW5uZWxzXG4gICAgdmFyIGhhc0NoYW5uZWxzID0gZmFsc2VcbiAgICBpZiAoJ3NoYXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICBcbiAgICAgIHcgPSBvcHRpb25zLnNoYXBlWzBdXG4gICAgICBoID0gb3B0aW9ucy5zaGFwZVsxXVxuICAgICAgaWYgKG9wdGlvbnMuc2hhcGUubGVuZ3RoID09PSAzKSB7XG4gICAgICAgIGMgPSBvcHRpb25zLnNoYXBlWzJdXG4gICAgICAgIFxuICAgICAgICBoYXNDaGFubmVscyA9IHRydWVcbiAgICAgIH1cbiAgICAgIFxuICAgICAgXG4gICAgfSBlbHNlIHtcbiAgICAgIGlmICgncmFkaXVzJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHcgPSBoID0gb3B0aW9ucy5yYWRpdXNcbiAgICAgICAgXG4gICAgICB9XG4gICAgICBpZiAoJ3dpZHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHcgPSBvcHRpb25zLndpZHRoXG4gICAgICAgIFxuICAgICAgfVxuICAgICAgaWYgKCdoZWlnaHQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgaCA9IG9wdGlvbnMuaGVpZ2h0XG4gICAgICAgIFxuICAgICAgfVxuICAgICAgaWYgKCdjaGFubmVscycgaW4gb3B0aW9ucykge1xuICAgICAgICBjID0gb3B0aW9ucy5jaGFubmVsc1xuICAgICAgICBcbiAgICAgICAgaGFzQ2hhbm5lbHMgPSB0cnVlXG4gICAgICB9XG4gICAgfVxuICAgIGZsYWdzLndpZHRoID0gdyB8IDBcbiAgICBmbGFncy5oZWlnaHQgPSBoIHwgMFxuICAgIGZsYWdzLmNoYW5uZWxzID0gYyB8IDBcblxuICAgIHZhciBoYXNGb3JtYXQgPSBmYWxzZVxuICAgIGlmICgnZm9ybWF0JyBpbiBvcHRpb25zKSB7XG4gICAgICB2YXIgZm9ybWF0U3RyID0gb3B0aW9ucy5mb3JtYXRcbiAgICAgIFxuICAgICAgXG4gICAgICB2YXIgaW50ZXJuYWxmb3JtYXQgPSBmbGFncy5pbnRlcm5hbGZvcm1hdCA9IHRleHR1cmVGb3JtYXRzW2Zvcm1hdFN0cl1cbiAgICAgIGZsYWdzLmZvcm1hdCA9IGNvbG9yRm9ybWF0c1tpbnRlcm5hbGZvcm1hdF1cbiAgICAgIGlmIChmb3JtYXRTdHIgaW4gdGV4dHVyZVR5cGVzKSB7XG4gICAgICAgIGlmICghKCd0eXBlJyBpbiBvcHRpb25zKSkge1xuICAgICAgICAgIGZsYWdzLnR5cGUgPSB0ZXh0dXJlVHlwZXNbZm9ybWF0U3RyXVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoZm9ybWF0U3RyIGluIGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cykge1xuICAgICAgICBmbGFncy5jb21wcmVzc2VkID0gdHJ1ZVxuICAgICAgfVxuICAgICAgaGFzRm9ybWF0ID0gdHJ1ZVxuICAgIH1cblxuICAgIC8vIFJlY29uY2lsZSBjaGFubmVscyBhbmQgZm9ybWF0XG4gICAgaWYgKCFoYXNDaGFubmVscyAmJiBoYXNGb3JtYXQpIHtcbiAgICAgIGZsYWdzLmNoYW5uZWxzID0gRk9STUFUX0NIQU5ORUxTW2ZsYWdzLmZvcm1hdF1cbiAgICB9IGVsc2UgaWYgKGhhc0NoYW5uZWxzICYmICFoYXNGb3JtYXQpIHtcbiAgICAgIGlmIChmbGFncy5jaGFubmVscyAhPT0gQ0hBTk5FTFNfRk9STUFUW2ZsYWdzLmZvcm1hdF0pIHtcbiAgICAgICAgZmxhZ3MuZm9ybWF0ID0gZmxhZ3MuaW50ZXJuYWxmb3JtYXQgPSBDSEFOTkVMU19GT1JNQVRbZmxhZ3MuY2hhbm5lbHNdXG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChoYXNGb3JtYXQgJiYgaGFzQ2hhbm5lbHMpIHtcbiAgICAgIFxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHNldEZsYWdzIChmbGFncykge1xuICAgIGdsLnBpeGVsU3RvcmVpKEdMX1VOUEFDS19GTElQX1lfV0VCR0wsIGZsYWdzLmZsaXBZKVxuICAgIGdsLnBpeGVsU3RvcmVpKEdMX1VOUEFDS19QUkVNVUxUSVBMWV9BTFBIQV9XRUJHTCwgZmxhZ3MucHJlbXVsdGlwbHlBbHBoYSlcbiAgICBnbC5waXhlbFN0b3JlaShHTF9VTlBBQ0tfQ09MT1JTUEFDRV9DT05WRVJTSU9OX1dFQkdMLCBmbGFncy5jb2xvclNwYWNlKVxuICAgIGdsLnBpeGVsU3RvcmVpKEdMX1VOUEFDS19BTElHTk1FTlQsIGZsYWdzLnVucGFja0FsaWdubWVudClcbiAgfVxuXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gVGV4IGltYWdlIGRhdGFcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICBmdW5jdGlvbiBUZXhJbWFnZSAoKSB7XG4gICAgVGV4RmxhZ3MuY2FsbCh0aGlzKVxuXG4gICAgdGhpcy54T2Zmc2V0ID0gMFxuICAgIHRoaXMueU9mZnNldCA9IDBcblxuICAgIC8vIGRhdGFcbiAgICB0aGlzLmRhdGEgPSBudWxsXG4gICAgdGhpcy5uZWVkc0ZyZWUgPSBmYWxzZVxuXG4gICAgLy8gaHRtbCBlbGVtZW50XG4gICAgdGhpcy5lbGVtZW50ID0gbnVsbFxuXG4gICAgLy8gY29weVRleEltYWdlIGluZm9cbiAgICB0aGlzLm5lZWRzQ29weSA9IGZhbHNlXG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZUltYWdlIChpbWFnZSwgb3B0aW9ucykge1xuICAgIHZhciBkYXRhID0gbnVsbFxuICAgIGlmIChpc1BpeGVsRGF0YShvcHRpb25zKSkge1xuICAgICAgZGF0YSA9IG9wdGlvbnNcbiAgICB9IGVsc2UgaWYgKG9wdGlvbnMpIHtcbiAgICAgIFxuICAgICAgcGFyc2VGbGFncyhpbWFnZSwgb3B0aW9ucylcbiAgICAgIGlmICgneCcgaW4gb3B0aW9ucykge1xuICAgICAgICBpbWFnZS54T2Zmc2V0ID0gb3B0aW9ucy54IHwgMFxuICAgICAgfVxuICAgICAgaWYgKCd5JyBpbiBvcHRpb25zKSB7XG4gICAgICAgIGltYWdlLnlPZmZzZXQgPSBvcHRpb25zLnkgfCAwXG4gICAgICB9XG4gICAgICBpZiAoaXNQaXhlbERhdGEob3B0aW9ucy5kYXRhKSkge1xuICAgICAgICBkYXRhID0gb3B0aW9ucy5kYXRhXG4gICAgICB9XG4gICAgfVxuXG4gICAgXG5cbiAgICBpZiAob3B0aW9ucy5jb3B5KSB7XG4gICAgICBcbiAgICAgIHZhciB2aWV3VyA9IGNvbnRleHRTdGF0ZS52aWV3cG9ydFdpZHRoXG4gICAgICB2YXIgdmlld0ggPSBjb250ZXh0U3RhdGUudmlld3BvcnRIZWlnaHRcbiAgICAgIGltYWdlLndpZHRoID0gaW1hZ2Uud2lkdGggfHwgKHZpZXdXIC0gaW1hZ2UueE9mZnNldClcbiAgICAgIGltYWdlLmhlaWdodCA9IGltYWdlLmhlaWdodCB8fCAodmlld0ggLSBpbWFnZS55T2Zmc2V0KVxuICAgICAgaW1hZ2UubmVlZHNDb3B5ID0gdHJ1ZVxuICAgICAgXG4gICAgfSBlbHNlIGlmICghZGF0YSkge1xuICAgICAgaW1hZ2Uud2lkdGggPSBpbWFnZS53aWR0aCB8fCAxXG4gICAgICBpbWFnZS5oZWlnaHQgPSBpbWFnZS5oZWlnaHQgfHwgMVxuICAgIH0gZWxzZSBpZiAoaXNUeXBlZEFycmF5KGRhdGEpKSB7XG4gICAgICBpbWFnZS5kYXRhID0gZGF0YVxuICAgICAgaWYgKCEoJ3R5cGUnIGluIG9wdGlvbnMpICYmIGltYWdlLnR5cGUgPT09IEdMX1VOU0lHTkVEX0JZVEUpIHtcbiAgICAgICAgaW1hZ2UudHlwZSA9IHR5cGVkQXJyYXlDb2RlKGRhdGEpXG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChpc051bWVyaWNBcnJheShkYXRhKSkge1xuICAgICAgY29udmVydERhdGEoaW1hZ2UsIGRhdGEpXG4gICAgICBpbWFnZS5hbGlnbm1lbnQgPSAxXG4gICAgICBpbWFnZS5uZWVkc0ZyZWUgPSB0cnVlXG4gICAgfSBlbHNlIGlmIChpc05EQXJyYXlMaWtlKGRhdGEpKSB7XG4gICAgICB2YXIgYXJyYXkgPSBkYXRhLmRhdGFcbiAgICAgIGlmICghQXJyYXkuaXNBcnJheShhcnJheSkgJiYgaW1hZ2UudHlwZSA9PT0gR0xfVU5TSUdORURfQllURSkge1xuICAgICAgICBpbWFnZS50eXBlID0gdHlwZWRBcnJheUNvZGUoYXJyYXkpXG4gICAgICB9XG4gICAgICB2YXIgc2hhcGUgPSBkYXRhLnNoYXBlXG4gICAgICB2YXIgc3RyaWRlID0gZGF0YS5zdHJpZGVcbiAgICAgIHZhciBzaGFwZVgsIHNoYXBlWSwgc2hhcGVDLCBzdHJpZGVYLCBzdHJpZGVZLCBzdHJpZGVDXG4gICAgICBpZiAoc2hhcGUubGVuZ3RoID09PSAzKSB7XG4gICAgICAgIHNoYXBlQyA9IHNoYXBlWzJdXG4gICAgICAgIHN0cmlkZUMgPSBzdHJpZGVbMl1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIFxuICAgICAgICBzaGFwZUMgPSAxXG4gICAgICAgIHN0cmlkZUMgPSAxXG4gICAgICB9XG4gICAgICBzaGFwZVggPSBzaGFwZVswXVxuICAgICAgc2hhcGVZID0gc2hhcGVbMV1cbiAgICAgIHN0cmlkZVggPSBzdHJpZGVbMF1cbiAgICAgIHN0cmlkZVkgPSBzdHJpZGVbMV1cbiAgICAgIGltYWdlLmFsaWdubWVudCA9IDFcbiAgICAgIGltYWdlLndpZHRoID0gc2hhcGVYXG4gICAgICBpbWFnZS5oZWlnaHQgPSBzaGFwZVlcbiAgICAgIGltYWdlLmNoYW5uZWxzID0gc2hhcGVDXG4gICAgICBpbWFnZS5mb3JtYXQgPSBpbWFnZS5pbnRlcm5hbGZvcm1hdCA9IENIQU5ORUxTX0ZPUk1BVFtzaGFwZUNdXG4gICAgICBpbWFnZS5uZWVkc0ZyZWUgPSB0cnVlXG4gICAgICB0cmFuc3Bvc2VEYXRhKGltYWdlLCBhcnJheSwgc3RyaWRlWCwgc3RyaWRlWSwgc3RyaWRlQywgZGF0YS5vZmZzZXQpXG4gICAgfSBlbHNlIGlmIChpc0NhbnZhc0VsZW1lbnQoZGF0YSkgfHwgaXNDb250ZXh0MkQoZGF0YSkpIHtcbiAgICAgIGlmIChpc0NhbnZhc0VsZW1lbnQoZGF0YSkpIHtcbiAgICAgICAgaW1hZ2UuZWxlbWVudCA9IGRhdGFcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGltYWdlLmVsZW1lbnQgPSBkYXRhLmNhbnZhc1xuICAgICAgfVxuICAgICAgaW1hZ2Uud2lkdGggPSBpbWFnZS5lbGVtZW50LndpZHRoXG4gICAgICBpbWFnZS5oZWlnaHQgPSBpbWFnZS5lbGVtZW50LmhlaWdodFxuICAgIH0gZWxzZSBpZiAoaXNJbWFnZUVsZW1lbnQoZGF0YSkpIHtcbiAgICAgIGltYWdlLmVsZW1lbnQgPSBkYXRhXG4gICAgICBpbWFnZS53aWR0aCA9IGRhdGEubmF0dXJhbFdpZHRoXG4gICAgICBpbWFnZS5oZWlnaHQgPSBkYXRhLm5hdHVyYWxIZWlnaHRcbiAgICB9IGVsc2UgaWYgKGlzVmlkZW9FbGVtZW50KGRhdGEpKSB7XG4gICAgICBpbWFnZS5lbGVtZW50ID0gZGF0YVxuICAgICAgaW1hZ2Uud2lkdGggPSBkYXRhLnZpZGVvV2lkdGhcbiAgICAgIGltYWdlLmhlaWdodCA9IGRhdGEudmlkZW9IZWlnaHRcbiAgICAgIGltYWdlLm5lZWRzUG9sbCA9IHRydWVcbiAgICB9IGVsc2UgaWYgKGlzUmVjdEFycmF5KGRhdGEpKSB7XG4gICAgICB2YXIgdyA9IGRhdGFbMF0ubGVuZ3RoXG4gICAgICB2YXIgaCA9IGRhdGEubGVuZ3RoXG4gICAgICB2YXIgYyA9IDFcbiAgICAgIGlmIChpc0FycmF5TGlrZShkYXRhWzBdWzBdKSkge1xuICAgICAgICBjID0gZGF0YVswXVswXS5sZW5ndGhcbiAgICAgICAgZmxhdHRlbjNERGF0YShpbWFnZSwgZGF0YSwgdywgaCwgYylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGZsYXR0ZW4yRERhdGEoaW1hZ2UsIGRhdGEsIHcsIGgpXG4gICAgICB9XG4gICAgICBpbWFnZS5hbGlnbm1lbnQgPSAxXG4gICAgICBpbWFnZS53aWR0aCA9IHdcbiAgICAgIGltYWdlLmhlaWdodCA9IGhcbiAgICAgIGltYWdlLmNoYW5uZWxzID0gY1xuICAgICAgaW1hZ2UuZm9ybWF0ID0gaW1hZ2UuaW50ZXJuYWxmb3JtYXQgPSBDSEFOTkVMU19GT1JNQVRbY11cbiAgICAgIGltYWdlLm5lZWRzRnJlZSA9IHRydWVcbiAgICB9XG5cbiAgICBpZiAoaW1hZ2UudHlwZSA9PT0gR0xfRkxPQVQpIHtcbiAgICAgIFxuICAgIH0gZWxzZSBpZiAoaW1hZ2UudHlwZSA9PT0gR0xfSEFMRl9GTE9BVF9PRVMpIHtcbiAgICAgIFxuICAgIH1cblxuICAgIC8vIGRvIGNvbXByZXNzZWQgdGV4dHVyZSAgdmFsaWRhdGlvbiBoZXJlLlxuICB9XG5cbiAgZnVuY3Rpb24gc2V0SW1hZ2UgKGluZm8sIHRhcmdldCwgbWlwbGV2ZWwpIHtcbiAgICB2YXIgZWxlbWVudCA9IGluZm8uZWxlbWVudFxuICAgIHZhciBkYXRhID0gaW5mby5kYXRhXG4gICAgdmFyIGludGVybmFsZm9ybWF0ID0gaW5mby5pbnRlcm5hbGZvcm1hdFxuICAgIHZhciBmb3JtYXQgPSBpbmZvLmZvcm1hdFxuICAgIHZhciB0eXBlID0gaW5mby50eXBlXG4gICAgdmFyIHdpZHRoID0gaW5mby53aWR0aFxuICAgIHZhciBoZWlnaHQgPSBpbmZvLmhlaWdodFxuXG4gICAgc2V0RmxhZ3MoaW5mbylcblxuICAgIGlmIChlbGVtZW50KSB7XG4gICAgICBnbC50ZXhJbWFnZTJEKHRhcmdldCwgbWlwbGV2ZWwsIGZvcm1hdCwgZm9ybWF0LCB0eXBlLCBlbGVtZW50KVxuICAgIH0gZWxzZSBpZiAoaW5mby5jb21wcmVzc2VkKSB7XG4gICAgICBnbC5jb21wcmVzc2VkVGV4SW1hZ2UyRCh0YXJnZXQsIG1pcGxldmVsLCBpbnRlcm5hbGZvcm1hdCwgd2lkdGgsIGhlaWdodCwgMCwgZGF0YSlcbiAgICB9IGVsc2UgaWYgKGluZm8ubmVlZHNDb3B5KSB7XG4gICAgICByZWdsUG9sbCgpXG4gICAgICBnbC5jb3B5VGV4SW1hZ2UyRChcbiAgICAgICAgdGFyZ2V0LCBtaXBsZXZlbCwgZm9ybWF0LCBpbmZvLnhPZmZzZXQsIGluZm8ueU9mZnNldCwgd2lkdGgsIGhlaWdodCwgMClcbiAgICB9IGVsc2Uge1xuICAgICAgZ2wudGV4SW1hZ2UyRChcbiAgICAgICAgdGFyZ2V0LCBtaXBsZXZlbCwgZm9ybWF0LCB3aWR0aCwgaGVpZ2h0LCAwLCBmb3JtYXQsIHR5cGUsIGRhdGEpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc2V0U3ViSW1hZ2UgKGluZm8sIHRhcmdldCwgeCwgeSwgbWlwbGV2ZWwpIHtcbiAgICB2YXIgZWxlbWVudCA9IGluZm8uZWxlbWVudFxuICAgIHZhciBkYXRhID0gaW5mby5kYXRhXG4gICAgdmFyIGludGVybmFsZm9ybWF0ID0gaW5mby5pbnRlcm5hbGZvcm1hdFxuICAgIHZhciBmb3JtYXQgPSBpbmZvLmZvcm1hdFxuICAgIHZhciB0eXBlID0gaW5mby50eXBlXG4gICAgdmFyIHdpZHRoID0gaW5mby53aWR0aFxuICAgIHZhciBoZWlnaHQgPSBpbmZvLmhlaWdodFxuXG4gICAgc2V0RmxhZ3MoaW5mbylcblxuICAgIGlmIChlbGVtZW50KSB7XG4gICAgICBnbC50ZXhTdWJJbWFnZTJEKFxuICAgICAgICB0YXJnZXQsIG1pcGxldmVsLCB4LCB5LCBmb3JtYXQsIHR5cGUsIGVsZW1lbnQpXG4gICAgfSBlbHNlIGlmIChpbmZvLmNvbXByZXNzZWQpIHtcbiAgICAgIGdsLmNvbXByZXNzZWRUZXhTdWJJbWFnZTJEKFxuICAgICAgICB0YXJnZXQsIG1pcGxldmVsLCB4LCB5LCBpbnRlcm5hbGZvcm1hdCwgd2lkdGgsIGhlaWdodCwgZGF0YSlcbiAgICB9IGVsc2UgaWYgKGluZm8ubmVlZHNDb3B5KSB7XG4gICAgICByZWdsUG9sbCgpXG4gICAgICBnbC5jb3B5VGV4U3ViSW1hZ2UyRChcbiAgICAgICAgdGFyZ2V0LCBtaXBsZXZlbCwgeCwgeSwgaW5mby54T2Zmc2V0LCBpbmZvLnlPZmZzZXQsIHdpZHRoLCBoZWlnaHQpXG4gICAgfSBlbHNlIHtcbiAgICAgIGdsLnRleFN1YkltYWdlMkQoXG4gICAgICAgIHRhcmdldCwgbWlwbGV2ZWwsIHgsIHksIHdpZHRoLCBoZWlnaHQsIGZvcm1hdCwgdHlwZSwgZGF0YSlcbiAgICB9XG4gIH1cblxuICAvLyB0ZXhJbWFnZSBwb29sXG4gIHZhciBpbWFnZVBvb2wgPSBbXVxuXG4gIGZ1bmN0aW9uIGFsbG9jSW1hZ2UgKCkge1xuICAgIHJldHVybiBpbWFnZVBvb2wucG9wKCkgfHwgbmV3IFRleEltYWdlKClcbiAgfVxuXG4gIGZ1bmN0aW9uIGZyZWVJbWFnZSAoaW1hZ2UpIHtcbiAgICBpZiAoaW1hZ2UubmVlZHNGcmVlKSB7XG4gICAgICBwb29sLmZyZWVUeXBlKGltYWdlLmRhdGEpXG4gICAgfVxuICAgIFRleEltYWdlLmNhbGwoaW1hZ2UpXG4gICAgaW1hZ2VQb29sLnB1c2goaW1hZ2UpXG4gIH1cblxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIE1pcCBtYXBcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICBmdW5jdGlvbiBNaXBNYXAgKCkge1xuICAgIFRleEZsYWdzLmNhbGwodGhpcylcblxuICAgIHRoaXMuZ2VuTWlwbWFwcyA9IGZhbHNlXG4gICAgdGhpcy5taXBtYXBIaW50ID0gR0xfRE9OVF9DQVJFXG4gICAgdGhpcy5taXBtYXNrID0gMFxuICAgIHRoaXMuaW1hZ2VzID0gQXJyYXkoMTYpXG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZU1pcE1hcEZyb21TaGFwZSAobWlwbWFwLCB3aWR0aCwgaGVpZ2h0KSB7XG4gICAgdmFyIGltZyA9IG1pcG1hcC5pbWFnZXNbMF0gPSBhbGxvY0ltYWdlKClcbiAgICBtaXBtYXAubWlwbWFzayA9IDFcbiAgICBpbWcud2lkdGggPSBtaXBtYXAud2lkdGggPSB3aWR0aFxuICAgIGltZy5oZWlnaHQgPSBtaXBtYXAuaGVpZ2h0ID0gaGVpZ2h0XG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZU1pcE1hcEZyb21PYmplY3QgKG1pcG1hcCwgb3B0aW9ucykge1xuICAgIHZhciBpbWdEYXRhID0gbnVsbFxuICAgIGlmIChpc1BpeGVsRGF0YShvcHRpb25zKSkge1xuICAgICAgaW1nRGF0YSA9IG1pcG1hcC5pbWFnZXNbMF0gPSBhbGxvY0ltYWdlKClcbiAgICAgIGNvcHlGbGFncyhpbWdEYXRhLCBtaXBtYXApXG4gICAgICBwYXJzZUltYWdlKGltZ0RhdGEsIG9wdGlvbnMpXG4gICAgICBtaXBtYXAubWlwbWFzayA9IDFcbiAgICB9IGVsc2Uge1xuICAgICAgcGFyc2VGbGFncyhtaXBtYXAsIG9wdGlvbnMpXG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShvcHRpb25zLm1pcG1hcCkpIHtcbiAgICAgICAgdmFyIG1pcERhdGEgPSBvcHRpb25zLm1pcG1hcFxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG1pcERhdGEubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICBpbWdEYXRhID0gbWlwbWFwLmltYWdlc1tpXSA9IGFsbG9jSW1hZ2UoKVxuICAgICAgICAgIGNvcHlGbGFncyhpbWdEYXRhLCBtaXBtYXApXG4gICAgICAgICAgaW1nRGF0YS53aWR0aCA+Pj0gaVxuICAgICAgICAgIGltZ0RhdGEuaGVpZ2h0ID4+PSBpXG4gICAgICAgICAgcGFyc2VJbWFnZShpbWdEYXRhLCBtaXBEYXRhW2ldKVxuICAgICAgICAgIG1pcG1hcC5taXBtYXNrIHw9ICgxIDw8IGkpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGltZ0RhdGEgPSBtaXBtYXAuaW1hZ2VzWzBdID0gYWxsb2NJbWFnZSgpXG4gICAgICAgIGNvcHlGbGFncyhpbWdEYXRhLCBtaXBtYXApXG4gICAgICAgIHBhcnNlSW1hZ2UoaW1nRGF0YSwgb3B0aW9ucylcbiAgICAgICAgbWlwbWFwLm1pcG1hc2sgPSAxXG4gICAgICB9XG4gICAgfVxuICAgIGNvcHlGbGFncyhtaXBtYXAsIG1pcG1hcC5pbWFnZXNbMF0pXG5cbiAgICAvLyBGb3IgdGV4dHVyZXMgb2YgdGhlIGNvbXByZXNzZWQgZm9ybWF0IFdFQkdMX2NvbXByZXNzZWRfdGV4dHVyZV9zM3RjXG4gICAgLy8gd2UgbXVzdCBoYXZlIHRoYXRcbiAgICAvL1xuICAgIC8vIFwiV2hlbiBsZXZlbCBlcXVhbHMgemVybyB3aWR0aCBhbmQgaGVpZ2h0IG11c3QgYmUgYSBtdWx0aXBsZSBvZiA0LlxuICAgIC8vIFdoZW4gbGV2ZWwgaXMgZ3JlYXRlciB0aGFuIDAgd2lkdGggYW5kIGhlaWdodCBtdXN0IGJlIDAsIDEsIDIgb3IgYSBtdWx0aXBsZSBvZiA0LiBcIlxuICAgIC8vXG4gICAgLy8gYnV0IHdlIGRvIG5vdCB5ZXQgc3VwcG9ydCBoYXZpbmcgbXVsdGlwbGUgbWlwbWFwIGxldmVscyBmb3IgY29tcHJlc3NlZCB0ZXh0dXJlcyxcbiAgICAvLyBzbyB3ZSBvbmx5IHRlc3QgZm9yIGxldmVsIHplcm8uXG5cbiAgICBpZiAobWlwbWFwLmNvbXByZXNzZWQgJiZcbiAgICAgICAgKG1pcG1hcC5pbnRlcm5hbGZvcm1hdCA9PT0gR0xfQ09NUFJFU1NFRF9SR0JfUzNUQ19EWFQxX0VYVCkgfHxcbiAgICAgICAgKG1pcG1hcC5pbnRlcm5hbGZvcm1hdCA9PT0gR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUMV9FWFQpIHx8XG4gICAgICAgIChtaXBtYXAuaW50ZXJuYWxmb3JtYXQgPT09IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDNfRVhUKSB8fFxuICAgICAgICAobWlwbWFwLmludGVybmFsZm9ybWF0ID09PSBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQ1X0VYVCkpIHtcbiAgICAgIFxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHNldE1pcE1hcCAobWlwbWFwLCB0YXJnZXQpIHtcbiAgICB2YXIgaW1hZ2VzID0gbWlwbWFwLmltYWdlc1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgaW1hZ2VzLmxlbmd0aDsgKytpKSB7XG4gICAgICBpZiAoIWltYWdlc1tpXSkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIHNldEltYWdlKGltYWdlc1tpXSwgdGFyZ2V0LCBpKVxuICAgIH1cbiAgfVxuXG4gIHZhciBtaXBQb29sID0gW11cblxuICBmdW5jdGlvbiBhbGxvY01pcE1hcCAoKSB7XG4gICAgdmFyIHJlc3VsdCA9IG1pcFBvb2wucG9wKCkgfHwgbmV3IE1pcE1hcCgpXG4gICAgVGV4RmxhZ3MuY2FsbChyZXN1bHQpXG4gICAgcmVzdWx0Lm1pcG1hc2sgPSAwXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCAxNjsgKytpKSB7XG4gICAgICByZXN1bHQuaW1hZ2VzW2ldID0gbnVsbFxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0XG4gIH1cblxuICBmdW5jdGlvbiBmcmVlTWlwTWFwIChtaXBtYXApIHtcbiAgICB2YXIgaW1hZ2VzID0gbWlwbWFwLmltYWdlc1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgaW1hZ2VzLmxlbmd0aDsgKytpKSB7XG4gICAgICBpZiAoaW1hZ2VzW2ldKSB7XG4gICAgICAgIGZyZWVJbWFnZShpbWFnZXNbaV0pXG4gICAgICB9XG4gICAgICBpbWFnZXNbaV0gPSBudWxsXG4gICAgfVxuICAgIG1pcFBvb2wucHVzaChtaXBtYXApXG4gIH1cblxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIFRleCBpbmZvXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgZnVuY3Rpb24gVGV4SW5mbyAoKSB7XG4gICAgdGhpcy5taW5GaWx0ZXIgPSBHTF9ORUFSRVNUXG4gICAgdGhpcy5tYWdGaWx0ZXIgPSBHTF9ORUFSRVNUXG5cbiAgICB0aGlzLndyYXBTID0gR0xfQ0xBTVBfVE9fRURHRVxuICAgIHRoaXMud3JhcFQgPSBHTF9DTEFNUF9UT19FREdFXG5cbiAgICB0aGlzLmFuaXNvdHJvcGljID0gMVxuXG4gICAgdGhpcy5nZW5NaXBtYXBzID0gZmFsc2VcbiAgICB0aGlzLm1pcG1hcEhpbnQgPSBHTF9ET05UX0NBUkVcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlVGV4SW5mbyAoaW5mbywgb3B0aW9ucykge1xuICAgIGlmICgnbWluJyBpbiBvcHRpb25zKSB7XG4gICAgICB2YXIgbWluRmlsdGVyID0gb3B0aW9ucy5taW5cbiAgICAgIFxuICAgICAgaW5mby5taW5GaWx0ZXIgPSBtaW5GaWx0ZXJzW21pbkZpbHRlcl1cbiAgICAgIGlmIChNSVBNQVBfRklMVEVSUy5pbmRleE9mKGluZm8ubWluRmlsdGVyKSA+PSAwKSB7XG4gICAgICAgIGluZm8uZ2VuTWlwbWFwcyA9IHRydWVcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoJ21hZycgaW4gb3B0aW9ucykge1xuICAgICAgdmFyIG1hZ0ZpbHRlciA9IG9wdGlvbnMubWFnXG4gICAgICBcbiAgICAgIGluZm8ubWFnRmlsdGVyID0gbWFnRmlsdGVyc1ttYWdGaWx0ZXJdXG4gICAgfVxuXG4gICAgdmFyIHdyYXBTID0gaW5mby53cmFwU1xuICAgIHZhciB3cmFwVCA9IGluZm8ud3JhcFRcbiAgICBpZiAoJ3dyYXAnIGluIG9wdGlvbnMpIHtcbiAgICAgIHZhciB3cmFwID0gb3B0aW9ucy53cmFwXG4gICAgICBpZiAodHlwZW9mIHdyYXAgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIFxuICAgICAgICB3cmFwUyA9IHdyYXBUID0gd3JhcE1vZGVzW3dyYXBdXG4gICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkod3JhcCkpIHtcbiAgICAgICAgXG4gICAgICAgIFxuICAgICAgICB3cmFwUyA9IHdyYXBNb2Rlc1t3cmFwWzBdXVxuICAgICAgICB3cmFwVCA9IHdyYXBNb2Rlc1t3cmFwWzFdXVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoJ3dyYXBTJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBvcHRXcmFwUyA9IG9wdGlvbnMud3JhcFNcbiAgICAgICAgXG4gICAgICAgIHdyYXBTID0gd3JhcE1vZGVzW29wdFdyYXBTXVxuICAgICAgfVxuICAgICAgaWYgKCd3cmFwVCcgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgb3B0V3JhcFQgPSBvcHRpb25zLndyYXBUXG4gICAgICAgIFxuICAgICAgICB3cmFwVCA9IHdyYXBNb2Rlc1tvcHRXcmFwVF1cbiAgICAgIH1cbiAgICB9XG4gICAgaW5mby53cmFwUyA9IHdyYXBTXG4gICAgaW5mby53cmFwVCA9IHdyYXBUXG5cbiAgICBpZiAoJ2FuaXNvdHJvcGljJyBpbiBvcHRpb25zKSB7XG4gICAgICB2YXIgYW5pc290cm9waWMgPSBvcHRpb25zLmFuaXNvdHJvcGljXG4gICAgICBcbiAgICAgIGluZm8uYW5pc290cm9waWMgPSBvcHRpb25zLmFuaXNvdHJvcGljXG4gICAgfVxuXG4gICAgaWYgKCdtaXBtYXAnIGluIG9wdGlvbnMpIHtcbiAgICAgIHZhciBoYXNNaXBNYXAgPSBmYWxzZVxuICAgICAgc3dpdGNoICh0eXBlb2Ygb3B0aW9ucy5taXBtYXApIHtcbiAgICAgICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgICAgICBcbiAgICAgICAgICBpbmZvLm1pcG1hcEhpbnQgPSBtaXBtYXBIaW50W29wdGlvbnMubWlwbWFwXVxuICAgICAgICAgIGluZm8uZ2VuTWlwbWFwcyA9IHRydWVcbiAgICAgICAgICBoYXNNaXBNYXAgPSB0cnVlXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdib29sZWFuJzpcbiAgICAgICAgICBoYXNNaXBNYXAgPSBpbmZvLmdlbk1pcG1hcHMgPSBvcHRpb25zLm1pcG1hcFxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgICAgICBcbiAgICAgICAgICBpbmZvLmdlbk1pcG1hcHMgPSBmYWxzZVxuICAgICAgICAgIGhhc01pcE1hcCA9IHRydWVcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgXG4gICAgICB9XG4gICAgICBpZiAoaGFzTWlwTWFwICYmICEoJ21pbicgaW4gb3B0aW9ucykpIHtcbiAgICAgICAgaW5mby5taW5GaWx0ZXIgPSBHTF9ORUFSRVNUX01JUE1BUF9ORUFSRVNUXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc2V0VGV4SW5mbyAoaW5mbywgdGFyZ2V0KSB7XG4gICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfTUlOX0ZJTFRFUiwgaW5mby5taW5GaWx0ZXIpXG4gICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfTUFHX0ZJTFRFUiwgaW5mby5tYWdGaWx0ZXIpXG4gICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfV1JBUF9TLCBpbmZvLndyYXBTKVxuICAgIGdsLnRleFBhcmFtZXRlcmkodGFyZ2V0LCBHTF9URVhUVVJFX1dSQVBfVCwgaW5mby53cmFwVClcbiAgICBpZiAoZXh0ZW5zaW9ucy5leHRfdGV4dHVyZV9maWx0ZXJfYW5pc290cm9waWMpIHtcbiAgICAgIGdsLnRleFBhcmFtZXRlcmkodGFyZ2V0LCBHTF9URVhUVVJFX01BWF9BTklTT1RST1BZX0VYVCwgaW5mby5hbmlzb3Ryb3BpYylcbiAgICB9XG4gICAgaWYgKGluZm8uZ2VuTWlwbWFwcykge1xuICAgICAgZ2wuaGludChHTF9HRU5FUkFURV9NSVBNQVBfSElOVCwgaW5mby5taXBtYXBIaW50KVxuICAgICAgZ2wuZ2VuZXJhdGVNaXBtYXAodGFyZ2V0KVxuICAgIH1cbiAgfVxuXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gRnVsbCB0ZXh0dXJlIG9iamVjdFxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIHZhciB0ZXh0dXJlQ291bnQgPSAwXG4gIHZhciB0ZXh0dXJlU2V0ID0ge31cbiAgdmFyIG51bVRleFVuaXRzID0gbGltaXRzLm1heFRleHR1cmVVbml0c1xuICB2YXIgdGV4dHVyZVVuaXRzID0gQXJyYXkobnVtVGV4VW5pdHMpLm1hcChmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIG51bGxcbiAgfSlcblxuICBmdW5jdGlvbiBSRUdMVGV4dHVyZSAodGFyZ2V0KSB7XG4gICAgVGV4RmxhZ3MuY2FsbCh0aGlzKVxuICAgIHRoaXMubWlwbWFzayA9IDBcbiAgICB0aGlzLmludGVybmFsZm9ybWF0ID0gR0xfUkdCQVxuXG4gICAgdGhpcy5pZCA9IHRleHR1cmVDb3VudCsrXG5cbiAgICB0aGlzLnJlZkNvdW50ID0gMVxuXG4gICAgdGhpcy50YXJnZXQgPSB0YXJnZXRcbiAgICB0aGlzLnRleHR1cmUgPSBnbC5jcmVhdGVUZXh0dXJlKClcblxuICAgIHRoaXMudW5pdCA9IC0xXG4gICAgdGhpcy5iaW5kQ291bnQgPSAwXG5cbiAgICB0aGlzLnRleEluZm8gPSBuZXcgVGV4SW5mbygpXG5cbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgIHRoaXMuc3RhdHMgPSB7c2l6ZTogMH1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiB0ZW1wQmluZCAodGV4dHVyZSkge1xuICAgIGdsLmFjdGl2ZVRleHR1cmUoR0xfVEVYVFVSRTApXG4gICAgZ2wuYmluZFRleHR1cmUodGV4dHVyZS50YXJnZXQsIHRleHR1cmUudGV4dHVyZSlcbiAgfVxuXG4gIGZ1bmN0aW9uIHRlbXBSZXN0b3JlICgpIHtcbiAgICB2YXIgcHJldiA9IHRleHR1cmVVbml0c1swXVxuICAgIGlmIChwcmV2KSB7XG4gICAgICBnbC5iaW5kVGV4dHVyZShwcmV2LnRhcmdldCwgcHJldi50ZXh0dXJlKVxuICAgIH0gZWxzZSB7XG4gICAgICBnbC5iaW5kVGV4dHVyZShHTF9URVhUVVJFXzJELCBudWxsKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3kgKHRleHR1cmUpIHtcbiAgICB2YXIgaGFuZGxlID0gdGV4dHVyZS50ZXh0dXJlXG4gICAgXG4gICAgdmFyIHVuaXQgPSB0ZXh0dXJlLnVuaXRcbiAgICB2YXIgdGFyZ2V0ID0gdGV4dHVyZS50YXJnZXRcbiAgICBpZiAodW5pdCA+PSAwKSB7XG4gICAgICBnbC5hY3RpdmVUZXh0dXJlKEdMX1RFWFRVUkUwICsgdW5pdClcbiAgICAgIGdsLmJpbmRUZXh0dXJlKHRhcmdldCwgbnVsbClcbiAgICAgIHRleHR1cmVVbml0c1t1bml0XSA9IG51bGxcbiAgICB9XG4gICAgZ2wuZGVsZXRlVGV4dHVyZShoYW5kbGUpXG4gICAgdGV4dHVyZS50ZXh0dXJlID0gbnVsbFxuICAgIHRleHR1cmUucGFyYW1zID0gbnVsbFxuICAgIHRleHR1cmUucGl4ZWxzID0gbnVsbFxuICAgIHRleHR1cmUucmVmQ291bnQgPSAwXG4gICAgZGVsZXRlIHRleHR1cmVTZXRbdGV4dHVyZS5pZF1cbiAgICBzdGF0cy50ZXh0dXJlQ291bnQtLVxuICB9XG5cbiAgZXh0ZW5kKFJFR0xUZXh0dXJlLnByb3RvdHlwZSwge1xuICAgIGJpbmQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciB0ZXh0dXJlID0gdGhpc1xuICAgICAgdGV4dHVyZS5iaW5kQ291bnQgKz0gMVxuICAgICAgdmFyIHVuaXQgPSB0ZXh0dXJlLnVuaXRcbiAgICAgIGlmICh1bml0IDwgMCkge1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG51bVRleFVuaXRzOyArK2kpIHtcbiAgICAgICAgICB2YXIgb3RoZXIgPSB0ZXh0dXJlVW5pdHNbaV1cbiAgICAgICAgICBpZiAob3RoZXIpIHtcbiAgICAgICAgICAgIGlmIChvdGhlci5iaW5kQ291bnQgPiAwKSB7XG4gICAgICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBvdGhlci51bml0ID0gLTFcbiAgICAgICAgICB9XG4gICAgICAgICAgdGV4dHVyZVVuaXRzW2ldID0gdGV4dHVyZVxuICAgICAgICAgIHVuaXQgPSBpXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgfVxuICAgICAgICBpZiAodW5pdCA+PSBudW1UZXhVbml0cykge1xuICAgICAgICAgIFxuICAgICAgICB9XG4gICAgICAgIGlmIChjb25maWcucHJvZmlsZSAmJiBzdGF0cy5tYXhUZXh0dXJlVW5pdHMgPCAodW5pdCArIDEpKSB7XG4gICAgICAgICAgc3RhdHMubWF4VGV4dHVyZVVuaXRzID0gdW5pdCArIDEgLy8gKzEsIHNpbmNlIHRoZSB1bml0cyBhcmUgemVyby1iYXNlZFxuICAgICAgICB9XG4gICAgICAgIHRleHR1cmUudW5pdCA9IHVuaXRcbiAgICAgICAgZ2wuYWN0aXZlVGV4dHVyZShHTF9URVhUVVJFMCArIHVuaXQpXG4gICAgICAgIGdsLmJpbmRUZXh0dXJlKHRleHR1cmUudGFyZ2V0LCB0ZXh0dXJlLnRleHR1cmUpXG4gICAgICB9XG4gICAgICByZXR1cm4gdW5pdFxuICAgIH0sXG5cbiAgICB1bmJpbmQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHRoaXMuYmluZENvdW50IC09IDFcbiAgICB9LFxuXG4gICAgZGVjUmVmOiBmdW5jdGlvbiAoKSB7XG4gICAgICBpZiAoLS10aGlzLnJlZkNvdW50IDw9IDApIHtcbiAgICAgICAgZGVzdHJveSh0aGlzKVxuICAgICAgfVxuICAgIH1cbiAgfSlcblxuICBmdW5jdGlvbiBjcmVhdGVUZXh0dXJlMkQgKGEsIGIpIHtcbiAgICB2YXIgdGV4dHVyZSA9IG5ldyBSRUdMVGV4dHVyZShHTF9URVhUVVJFXzJEKVxuICAgIHRleHR1cmVTZXRbdGV4dHVyZS5pZF0gPSB0ZXh0dXJlXG4gICAgc3RhdHMudGV4dHVyZUNvdW50KytcblxuICAgIGZ1bmN0aW9uIHJlZ2xUZXh0dXJlMkQgKGEsIGIpIHtcbiAgICAgIHZhciB0ZXhJbmZvID0gdGV4dHVyZS50ZXhJbmZvXG4gICAgICBUZXhJbmZvLmNhbGwodGV4SW5mbylcbiAgICAgIHZhciBtaXBEYXRhID0gYWxsb2NNaXBNYXAoKVxuXG4gICAgICBpZiAodHlwZW9mIGEgPT09ICdudW1iZXInKSB7XG4gICAgICAgIGlmICh0eXBlb2YgYiA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICBwYXJzZU1pcE1hcEZyb21TaGFwZShtaXBEYXRhLCBhIHwgMCwgYiB8IDApXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcGFyc2VNaXBNYXBGcm9tU2hhcGUobWlwRGF0YSwgYSB8IDAsIGEgfCAwKVxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGEpIHtcbiAgICAgICAgXG4gICAgICAgIHBhcnNlVGV4SW5mbyh0ZXhJbmZvLCBhKVxuICAgICAgICBwYXJzZU1pcE1hcEZyb21PYmplY3QobWlwRGF0YSwgYSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIGVtcHR5IHRleHR1cmVzIGdldCBhc3NpZ25lZCBhIGRlZmF1bHQgc2hhcGUgb2YgMXgxXG4gICAgICAgIHBhcnNlTWlwTWFwRnJvbVNoYXBlKG1pcERhdGEsIDEsIDEpXG4gICAgICB9XG5cbiAgICAgIGlmICh0ZXhJbmZvLmdlbk1pcG1hcHMpIHtcbiAgICAgICAgbWlwRGF0YS5taXBtYXNrID0gKG1pcERhdGEud2lkdGggPDwgMSkgLSAxXG4gICAgICB9XG4gICAgICB0ZXh0dXJlLm1pcG1hc2sgPSBtaXBEYXRhLm1pcG1hc2tcblxuICAgICAgY29weUZsYWdzKHRleHR1cmUsIG1pcERhdGEpXG5cbiAgICAgIFxuICAgICAgdGV4dHVyZS5pbnRlcm5hbGZvcm1hdCA9IG1pcERhdGEuaW50ZXJuYWxmb3JtYXRcblxuICAgICAgcmVnbFRleHR1cmUyRC53aWR0aCA9IG1pcERhdGEud2lkdGhcbiAgICAgIHJlZ2xUZXh0dXJlMkQuaGVpZ2h0ID0gbWlwRGF0YS5oZWlnaHRcblxuICAgICAgdGVtcEJpbmQodGV4dHVyZSlcbiAgICAgIHNldE1pcE1hcChtaXBEYXRhLCBHTF9URVhUVVJFXzJEKVxuICAgICAgc2V0VGV4SW5mbyh0ZXhJbmZvLCBHTF9URVhUVVJFXzJEKVxuICAgICAgdGVtcFJlc3RvcmUoKVxuXG4gICAgICBmcmVlTWlwTWFwKG1pcERhdGEpXG5cbiAgICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgICB0ZXh0dXJlLnN0YXRzLnNpemUgPSBnZXRUZXh0dXJlU2l6ZShcbiAgICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0LFxuICAgICAgICAgIHRleHR1cmUudHlwZSxcbiAgICAgICAgICBtaXBEYXRhLndpZHRoLFxuICAgICAgICAgIG1pcERhdGEuaGVpZ2h0LFxuICAgICAgICAgIHRleEluZm8uZ2VuTWlwbWFwcyxcbiAgICAgICAgICBmYWxzZSlcbiAgICAgIH1cbiAgICAgIHJlZ2xUZXh0dXJlMkQuZm9ybWF0ID0gdGV4dHVyZUZvcm1hdHNJbnZlcnRbdGV4dHVyZS5pbnRlcm5hbGZvcm1hdF1cbiAgICAgIHJlZ2xUZXh0dXJlMkQudHlwZSA9IHRleHR1cmVUeXBlc0ludmVydFt0ZXh0dXJlLnR5cGVdXG5cbiAgICAgIHJlZ2xUZXh0dXJlMkQubWFnID0gbWFnRmlsdGVyc0ludmVydFt0ZXhJbmZvLm1hZ0ZpbHRlcl1cbiAgICAgIHJlZ2xUZXh0dXJlMkQubWluID0gbWluRmlsdGVyc0ludmVydFt0ZXhJbmZvLm1pbkZpbHRlcl1cblxuICAgICAgcmVnbFRleHR1cmUyRC53cmFwUyA9IHdyYXBNb2Rlc0ludmVydFt0ZXhJbmZvLndyYXBTXVxuICAgICAgcmVnbFRleHR1cmUyRC53cmFwVCA9IHdyYXBNb2Rlc0ludmVydFt0ZXhJbmZvLndyYXBUXVxuXG4gICAgICByZXR1cm4gcmVnbFRleHR1cmUyRFxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHN1YmltYWdlIChpbWFnZSwgeF8sIHlfLCBsZXZlbF8pIHtcbiAgICAgIFxuXG4gICAgICB2YXIgeCA9IHhfIHwgMFxuICAgICAgdmFyIHkgPSB5XyB8IDBcbiAgICAgIHZhciBsZXZlbCA9IGxldmVsXyB8IDBcblxuICAgICAgdmFyIGltYWdlRGF0YSA9IGFsbG9jSW1hZ2UoKVxuICAgICAgY29weUZsYWdzKGltYWdlRGF0YSwgdGV4dHVyZSlcbiAgICAgIGltYWdlRGF0YS53aWR0aCA+Pj0gbGV2ZWxcbiAgICAgIGltYWdlRGF0YS5oZWlnaHQgPj49IGxldmVsXG4gICAgICBpbWFnZURhdGEud2lkdGggLT0geFxuICAgICAgaW1hZ2VEYXRhLmhlaWdodCAtPSB5XG4gICAgICBwYXJzZUltYWdlKGltYWdlRGF0YSwgaW1hZ2UpXG5cbiAgICAgIFxuICAgICAgXG4gICAgICBcbiAgICAgIFxuXG4gICAgICB0ZW1wQmluZCh0ZXh0dXJlKVxuICAgICAgc2V0U3ViSW1hZ2UoaW1hZ2VEYXRhLCBHTF9URVhUVVJFXzJELCB4LCB5LCBsZXZlbClcbiAgICAgIHRlbXBSZXN0b3JlKClcblxuICAgICAgZnJlZUltYWdlKGltYWdlRGF0YSlcblxuICAgICAgcmV0dXJuIHJlZ2xUZXh0dXJlMkRcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZXNpemUgKHdfLCBoXykge1xuICAgICAgdmFyIHcgPSB3XyB8IDBcbiAgICAgIHZhciBoID0gKGhfIHwgMCkgfHwgd1xuICAgICAgaWYgKHcgPT09IHRleHR1cmUud2lkdGggJiYgaCA9PT0gdGV4dHVyZS5oZWlnaHQpIHtcbiAgICAgICAgcmV0dXJuIHJlZ2xUZXh0dXJlMkRcbiAgICAgIH1cblxuICAgICAgcmVnbFRleHR1cmUyRC53aWR0aCA9IHRleHR1cmUud2lkdGggPSB3XG4gICAgICByZWdsVGV4dHVyZTJELmhlaWdodCA9IHRleHR1cmUuaGVpZ2h0ID0gaFxuXG4gICAgICB0ZW1wQmluZCh0ZXh0dXJlKVxuICAgICAgZm9yICh2YXIgaSA9IDA7IHRleHR1cmUubWlwbWFzayA+PiBpOyArK2kpIHtcbiAgICAgICAgZ2wudGV4SW1hZ2UyRChcbiAgICAgICAgICBHTF9URVhUVVJFXzJELFxuICAgICAgICAgIGksXG4gICAgICAgICAgdGV4dHVyZS5mb3JtYXQsXG4gICAgICAgICAgdyA+PiBpLFxuICAgICAgICAgIGggPj4gaSxcbiAgICAgICAgICAwLFxuICAgICAgICAgIHRleHR1cmUuZm9ybWF0LFxuICAgICAgICAgIHRleHR1cmUudHlwZSxcbiAgICAgICAgICBudWxsKVxuICAgICAgfVxuICAgICAgdGVtcFJlc3RvcmUoKVxuXG4gICAgICAvLyBhbHNvLCByZWNvbXB1dGUgdGhlIHRleHR1cmUgc2l6ZS5cbiAgICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgICB0ZXh0dXJlLnN0YXRzLnNpemUgPSBnZXRUZXh0dXJlU2l6ZShcbiAgICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0LFxuICAgICAgICAgIHRleHR1cmUudHlwZSxcbiAgICAgICAgICB3LFxuICAgICAgICAgIGgsXG4gICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgZmFsc2UpXG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZWdsVGV4dHVyZTJEXG4gICAgfVxuXG4gICAgcmVnbFRleHR1cmUyRChhLCBiKVxuXG4gICAgcmVnbFRleHR1cmUyRC5zdWJpbWFnZSA9IHN1YmltYWdlXG4gICAgcmVnbFRleHR1cmUyRC5yZXNpemUgPSByZXNpemVcbiAgICByZWdsVGV4dHVyZTJELl9yZWdsVHlwZSA9ICd0ZXh0dXJlMmQnXG4gICAgcmVnbFRleHR1cmUyRC5fdGV4dHVyZSA9IHRleHR1cmVcbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgIHJlZ2xUZXh0dXJlMkQuc3RhdHMgPSB0ZXh0dXJlLnN0YXRzXG4gICAgfVxuICAgIHJlZ2xUZXh0dXJlMkQuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHRleHR1cmUuZGVjUmVmKClcbiAgICB9XG5cbiAgICByZXR1cm4gcmVnbFRleHR1cmUyRFxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlVGV4dHVyZUN1YmUgKGEwLCBhMSwgYTIsIGEzLCBhNCwgYTUpIHtcbiAgICB2YXIgdGV4dHVyZSA9IG5ldyBSRUdMVGV4dHVyZShHTF9URVhUVVJFX0NVQkVfTUFQKVxuICAgIHRleHR1cmVTZXRbdGV4dHVyZS5pZF0gPSB0ZXh0dXJlXG4gICAgc3RhdHMuY3ViZUNvdW50KytcblxuICAgIHZhciBmYWNlcyA9IG5ldyBBcnJheSg2KVxuXG4gICAgZnVuY3Rpb24gcmVnbFRleHR1cmVDdWJlIChhMCwgYTEsIGEyLCBhMywgYTQsIGE1KSB7XG4gICAgICB2YXIgaVxuICAgICAgdmFyIHRleEluZm8gPSB0ZXh0dXJlLnRleEluZm9cbiAgICAgIFRleEluZm8uY2FsbCh0ZXhJbmZvKVxuICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICBmYWNlc1tpXSA9IGFsbG9jTWlwTWFwKClcbiAgICAgIH1cblxuICAgICAgaWYgKHR5cGVvZiBhMCA9PT0gJ251bWJlcicgfHwgIWEwKSB7XG4gICAgICAgIHZhciBzID0gKGEwIHwgMCkgfHwgMVxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgICAgcGFyc2VNaXBNYXBGcm9tU2hhcGUoZmFjZXNbaV0sIHMsIHMpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGEwID09PSAnb2JqZWN0Jykge1xuICAgICAgICBpZiAoYTEpIHtcbiAgICAgICAgICBwYXJzZU1pcE1hcEZyb21PYmplY3QoZmFjZXNbMF0sIGEwKVxuICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbU9iamVjdChmYWNlc1sxXSwgYTEpXG4gICAgICAgICAgcGFyc2VNaXBNYXBGcm9tT2JqZWN0KGZhY2VzWzJdLCBhMilcbiAgICAgICAgICBwYXJzZU1pcE1hcEZyb21PYmplY3QoZmFjZXNbM10sIGEzKVxuICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbU9iamVjdChmYWNlc1s0XSwgYTQpXG4gICAgICAgICAgcGFyc2VNaXBNYXBGcm9tT2JqZWN0KGZhY2VzWzVdLCBhNSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwYXJzZVRleEluZm8odGV4SW5mbywgYTApXG4gICAgICAgICAgcGFyc2VGbGFncyh0ZXh0dXJlLCBhMClcbiAgICAgICAgICBpZiAoJ2ZhY2VzJyBpbiBhMCkge1xuICAgICAgICAgICAgdmFyIGZhY2VfaW5wdXQgPSBhMC5mYWNlc1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBjb3B5RmxhZ3MoZmFjZXNbaV0sIHRleHR1cmUpXG4gICAgICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbU9iamVjdChmYWNlc1tpXSwgZmFjZV9pbnB1dFtpXSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICAgICAgICBwYXJzZU1pcE1hcEZyb21PYmplY3QoZmFjZXNbaV0sIGEwKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgXG4gICAgICB9XG5cbiAgICAgIGNvcHlGbGFncyh0ZXh0dXJlLCBmYWNlc1swXSlcbiAgICAgIGlmICh0ZXhJbmZvLmdlbk1pcG1hcHMpIHtcbiAgICAgICAgdGV4dHVyZS5taXBtYXNrID0gKGZhY2VzWzBdLndpZHRoIDw8IDEpIC0gMVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGV4dHVyZS5taXBtYXNrID0gZmFjZXNbMF0ubWlwbWFza1xuICAgICAgfVxuXG4gICAgICBcbiAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQgPSBmYWNlc1swXS5pbnRlcm5hbGZvcm1hdFxuXG4gICAgICByZWdsVGV4dHVyZUN1YmUud2lkdGggPSBmYWNlc1swXS53aWR0aFxuICAgICAgcmVnbFRleHR1cmVDdWJlLmhlaWdodCA9IGZhY2VzWzBdLmhlaWdodFxuXG4gICAgICB0ZW1wQmluZCh0ZXh0dXJlKVxuICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICBzZXRNaXBNYXAoZmFjZXNbaV0sIEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCArIGkpXG4gICAgICB9XG4gICAgICBzZXRUZXhJbmZvKHRleEluZm8sIEdMX1RFWFRVUkVfQ1VCRV9NQVApXG4gICAgICB0ZW1wUmVzdG9yZSgpXG5cbiAgICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgICB0ZXh0dXJlLnN0YXRzLnNpemUgPSBnZXRUZXh0dXJlU2l6ZShcbiAgICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0LFxuICAgICAgICAgIHRleHR1cmUudHlwZSxcbiAgICAgICAgICByZWdsVGV4dHVyZUN1YmUud2lkdGgsXG4gICAgICAgICAgcmVnbFRleHR1cmVDdWJlLmhlaWdodCxcbiAgICAgICAgICB0ZXhJbmZvLmdlbk1pcG1hcHMsXG4gICAgICAgICAgdHJ1ZSlcbiAgICAgIH1cblxuICAgICAgcmVnbFRleHR1cmVDdWJlLmZvcm1hdCA9IHRleHR1cmVGb3JtYXRzSW52ZXJ0W3RleHR1cmUuaW50ZXJuYWxmb3JtYXRdXG4gICAgICByZWdsVGV4dHVyZUN1YmUudHlwZSA9IHRleHR1cmVUeXBlc0ludmVydFt0ZXh0dXJlLnR5cGVdXG5cbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS5tYWcgPSBtYWdGaWx0ZXJzSW52ZXJ0W3RleEluZm8ubWFnRmlsdGVyXVxuICAgICAgcmVnbFRleHR1cmVDdWJlLm1pbiA9IG1pbkZpbHRlcnNJbnZlcnRbdGV4SW5mby5taW5GaWx0ZXJdXG5cbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS53cmFwUyA9IHdyYXBNb2Rlc0ludmVydFt0ZXhJbmZvLndyYXBTXVxuICAgICAgcmVnbFRleHR1cmVDdWJlLndyYXBUID0gd3JhcE1vZGVzSW52ZXJ0W3RleEluZm8ud3JhcFRdXG5cbiAgICAgIGZvciAoaSA9IDA7IGkgPCA2OyArK2kpIHtcbiAgICAgICAgZnJlZU1pcE1hcChmYWNlc1tpXSlcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJlZ2xUZXh0dXJlQ3ViZVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHN1YmltYWdlIChmYWNlLCBpbWFnZSwgeF8sIHlfLCBsZXZlbF8pIHtcbiAgICAgIFxuICAgICAgXG5cbiAgICAgIHZhciB4ID0geF8gfCAwXG4gICAgICB2YXIgeSA9IHlfIHwgMFxuICAgICAgdmFyIGxldmVsID0gbGV2ZWxfIHwgMFxuXG4gICAgICB2YXIgaW1hZ2VEYXRhID0gYWxsb2NJbWFnZSgpXG4gICAgICBjb3B5RmxhZ3MoaW1hZ2VEYXRhLCB0ZXh0dXJlKVxuICAgICAgaW1hZ2VEYXRhLndpZHRoID4+PSBsZXZlbFxuICAgICAgaW1hZ2VEYXRhLmhlaWdodCA+Pj0gbGV2ZWxcbiAgICAgIGltYWdlRGF0YS53aWR0aCAtPSB4XG4gICAgICBpbWFnZURhdGEuaGVpZ2h0IC09IHlcbiAgICAgIHBhcnNlSW1hZ2UoaW1hZ2VEYXRhLCBpbWFnZSlcblxuICAgICAgXG4gICAgICBcbiAgICAgIFxuICAgICAgXG5cbiAgICAgIHRlbXBCaW5kKHRleHR1cmUpXG4gICAgICBzZXRTdWJJbWFnZShpbWFnZURhdGEsIEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCArIGZhY2UsIHgsIHksIGxldmVsKVxuICAgICAgdGVtcFJlc3RvcmUoKVxuXG4gICAgICBmcmVlSW1hZ2UoaW1hZ2VEYXRhKVxuXG4gICAgICByZXR1cm4gcmVnbFRleHR1cmVDdWJlXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVzaXplIChyYWRpdXNfKSB7XG4gICAgICB2YXIgcmFkaXVzID0gcmFkaXVzXyB8IDBcbiAgICAgIGlmIChyYWRpdXMgPT09IHRleHR1cmUud2lkdGgpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG5cbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS53aWR0aCA9IHRleHR1cmUud2lkdGggPSByYWRpdXNcbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS5oZWlnaHQgPSB0ZXh0dXJlLmhlaWdodCA9IHJhZGl1c1xuXG4gICAgICB0ZW1wQmluZCh0ZXh0dXJlKVxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCA2OyArK2kpIHtcbiAgICAgICAgZm9yICh2YXIgaiA9IDA7IHRleHR1cmUubWlwbWFzayA+PiBqOyArK2opIHtcbiAgICAgICAgICBnbC50ZXhJbWFnZTJEKFxuICAgICAgICAgICAgR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YICsgaSxcbiAgICAgICAgICAgIGosXG4gICAgICAgICAgICB0ZXh0dXJlLmZvcm1hdCxcbiAgICAgICAgICAgIHJhZGl1cyA+PiBqLFxuICAgICAgICAgICAgcmFkaXVzID4+IGosXG4gICAgICAgICAgICAwLFxuICAgICAgICAgICAgdGV4dHVyZS5mb3JtYXQsXG4gICAgICAgICAgICB0ZXh0dXJlLnR5cGUsXG4gICAgICAgICAgICBudWxsKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICB0ZW1wUmVzdG9yZSgpXG5cbiAgICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgICB0ZXh0dXJlLnN0YXRzLnNpemUgPSBnZXRUZXh0dXJlU2l6ZShcbiAgICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0LFxuICAgICAgICAgIHRleHR1cmUudHlwZSxcbiAgICAgICAgICByZWdsVGV4dHVyZUN1YmUud2lkdGgsXG4gICAgICAgICAgcmVnbFRleHR1cmVDdWJlLmhlaWdodCxcbiAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICB0cnVlKVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmVnbFRleHR1cmVDdWJlXG4gICAgfVxuXG4gICAgcmVnbFRleHR1cmVDdWJlKGEwLCBhMSwgYTIsIGEzLCBhNCwgYTUpXG5cbiAgICByZWdsVGV4dHVyZUN1YmUuc3ViaW1hZ2UgPSBzdWJpbWFnZVxuICAgIHJlZ2xUZXh0dXJlQ3ViZS5yZXNpemUgPSByZXNpemVcbiAgICByZWdsVGV4dHVyZUN1YmUuX3JlZ2xUeXBlID0gJ3RleHR1cmVDdWJlJ1xuICAgIHJlZ2xUZXh0dXJlQ3ViZS5fdGV4dHVyZSA9IHRleHR1cmVcbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS5zdGF0cyA9IHRleHR1cmUuc3RhdHNcbiAgICB9XG4gICAgcmVnbFRleHR1cmVDdWJlLmRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB0ZXh0dXJlLmRlY1JlZigpXG4gICAgfVxuXG4gICAgcmV0dXJuIHJlZ2xUZXh0dXJlQ3ViZVxuICB9XG5cbiAgLy8gQ2FsbGVkIHdoZW4gcmVnbCBpcyBkZXN0cm95ZWRcbiAgZnVuY3Rpb24gZGVzdHJveVRleHR1cmVzICgpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG51bVRleFVuaXRzOyArK2kpIHtcbiAgICAgIGdsLmFjdGl2ZVRleHR1cmUoR0xfVEVYVFVSRTAgKyBpKVxuICAgICAgZ2wuYmluZFRleHR1cmUoR0xfVEVYVFVSRV8yRCwgbnVsbClcbiAgICAgIHRleHR1cmVVbml0c1tpXSA9IG51bGxcbiAgICB9XG4gICAgdmFsdWVzKHRleHR1cmVTZXQpLmZvckVhY2goZGVzdHJveSlcblxuICAgIHN0YXRzLmN1YmVDb3VudCA9IDBcbiAgICBzdGF0cy50ZXh0dXJlQ291bnQgPSAwXG4gIH1cblxuICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICBzdGF0cy5nZXRUb3RhbFRleHR1cmVTaXplID0gZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIHRvdGFsID0gMFxuICAgICAgT2JqZWN0LmtleXModGV4dHVyZVNldCkuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgIHRvdGFsICs9IHRleHR1cmVTZXRba2V5XS5zdGF0cy5zaXplXG4gICAgICB9KVxuICAgICAgcmV0dXJuIHRvdGFsXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcmVzdG9yZVRleHR1cmVzICgpIHtcbiAgICB2YWx1ZXModGV4dHVyZVNldCkuZm9yRWFjaChmdW5jdGlvbiAodGV4dHVyZSkge1xuICAgICAgdGV4dHVyZS50ZXh0dXJlID0gZ2wuY3JlYXRlVGV4dHVyZSgpXG4gICAgICBnbC5iaW5kVGV4dHVyZSh0ZXh0dXJlLnRhcmdldCwgdGV4dHVyZS50ZXh0dXJlKVxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCAzMjsgKytpKSB7XG4gICAgICAgIGlmICgodGV4dHVyZS5taXBtYXNrICYgKDEgPDwgaSkpID09PSAwKSB7XG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfVxuICAgICAgICBpZiAodGV4dHVyZS50YXJnZXQgPT09IEdMX1RFWFRVUkVfMkQpIHtcbiAgICAgICAgICBnbC50ZXhJbWFnZTJEKEdMX1RFWFRVUkVfMkQsXG4gICAgICAgICAgICBpLFxuICAgICAgICAgICAgdGV4dHVyZS5pbnRlcm5hbGZvcm1hdCxcbiAgICAgICAgICAgIHRleHR1cmUud2lkdGggPj4gaSxcbiAgICAgICAgICAgIHRleHR1cmUuaGVpZ2h0ID4+IGksXG4gICAgICAgICAgICAwLFxuICAgICAgICAgICAgdGV4dHVyZS5pbnRlcm5hbGZvcm1hdCxcbiAgICAgICAgICAgIHRleHR1cmUudHlwZSxcbiAgICAgICAgICAgIG51bGwpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCA2OyArK2opIHtcbiAgICAgICAgICAgIGdsLnRleEltYWdlMkQoR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YICsgaixcbiAgICAgICAgICAgICAgaSxcbiAgICAgICAgICAgICAgdGV4dHVyZS5pbnRlcm5hbGZvcm1hdCxcbiAgICAgICAgICAgICAgdGV4dHVyZS53aWR0aCA+PiBpLFxuICAgICAgICAgICAgICB0ZXh0dXJlLmhlaWdodCA+PiBpLFxuICAgICAgICAgICAgICAwLFxuICAgICAgICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0LFxuICAgICAgICAgICAgICB0ZXh0dXJlLnR5cGUsXG4gICAgICAgICAgICAgIG51bGwpXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBzZXRUZXhJbmZvKHRleHR1cmUudGV4SW5mbywgdGV4dHVyZS50YXJnZXQpXG4gICAgfSlcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY3JlYXRlMkQ6IGNyZWF0ZVRleHR1cmUyRCxcbiAgICBjcmVhdGVDdWJlOiBjcmVhdGVUZXh0dXJlQ3ViZSxcbiAgICBjbGVhcjogZGVzdHJveVRleHR1cmVzLFxuICAgIGdldFRleHR1cmU6IGZ1bmN0aW9uICh3cmFwcGVyKSB7XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH0sXG4gICAgcmVzdG9yZTogcmVzdG9yZVRleHR1cmVzXG4gIH1cbn1cbiIsInZhciBHTF9RVUVSWV9SRVNVTFRfRVhUID0gMHg4ODY2XG52YXIgR0xfUVVFUllfUkVTVUxUX0FWQUlMQUJMRV9FWFQgPSAweDg4NjdcbnZhciBHTF9USU1FX0VMQVBTRURfRVhUID0gMHg4OEJGXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGdsLCBleHRlbnNpb25zKSB7XG4gIHZhciBleHRUaW1lciA9IGV4dGVuc2lvbnMuZXh0X2Rpc2pvaW50X3RpbWVyX3F1ZXJ5XG5cbiAgaWYgKCFleHRUaW1lcikge1xuICAgIHJldHVybiBudWxsXG4gIH1cblxuICAvLyBRVUVSWSBQT09MIEJFR0lOXG4gIHZhciBxdWVyeVBvb2wgPSBbXVxuICBmdW5jdGlvbiBhbGxvY1F1ZXJ5ICgpIHtcbiAgICByZXR1cm4gcXVlcnlQb29sLnBvcCgpIHx8IGV4dFRpbWVyLmNyZWF0ZVF1ZXJ5RVhUKClcbiAgfVxuICBmdW5jdGlvbiBmcmVlUXVlcnkgKHF1ZXJ5KSB7XG4gICAgcXVlcnlQb29sLnB1c2gocXVlcnkpXG4gIH1cbiAgLy8gUVVFUlkgUE9PTCBFTkRcblxuICB2YXIgcGVuZGluZ1F1ZXJpZXMgPSBbXVxuICBmdW5jdGlvbiBiZWdpblF1ZXJ5IChzdGF0cykge1xuICAgIHZhciBxdWVyeSA9IGFsbG9jUXVlcnkoKVxuICAgIGV4dFRpbWVyLmJlZ2luUXVlcnlFWFQoR0xfVElNRV9FTEFQU0VEX0VYVCwgcXVlcnkpXG4gICAgcGVuZGluZ1F1ZXJpZXMucHVzaChxdWVyeSlcbiAgICBwdXNoU2NvcGVTdGF0cyhwZW5kaW5nUXVlcmllcy5sZW5ndGggLSAxLCBwZW5kaW5nUXVlcmllcy5sZW5ndGgsIHN0YXRzKVxuICB9XG5cbiAgZnVuY3Rpb24gZW5kUXVlcnkgKCkge1xuICAgIGV4dFRpbWVyLmVuZFF1ZXJ5RVhUKEdMX1RJTUVfRUxBUFNFRF9FWFQpXG4gIH1cblxuICAvL1xuICAvLyBQZW5kaW5nIHN0YXRzIHBvb2wuXG4gIC8vXG4gIGZ1bmN0aW9uIFBlbmRpbmdTdGF0cyAoKSB7XG4gICAgdGhpcy5zdGFydFF1ZXJ5SW5kZXggPSAtMVxuICAgIHRoaXMuZW5kUXVlcnlJbmRleCA9IC0xXG4gICAgdGhpcy5zdW0gPSAwXG4gICAgdGhpcy5zdGF0cyA9IG51bGxcbiAgfVxuICB2YXIgcGVuZGluZ1N0YXRzUG9vbCA9IFtdXG4gIGZ1bmN0aW9uIGFsbG9jUGVuZGluZ1N0YXRzICgpIHtcbiAgICByZXR1cm4gcGVuZGluZ1N0YXRzUG9vbC5wb3AoKSB8fCBuZXcgUGVuZGluZ1N0YXRzKClcbiAgfVxuICBmdW5jdGlvbiBmcmVlUGVuZGluZ1N0YXRzIChwZW5kaW5nU3RhdHMpIHtcbiAgICBwZW5kaW5nU3RhdHNQb29sLnB1c2gocGVuZGluZ1N0YXRzKVxuICB9XG4gIC8vIFBlbmRpbmcgc3RhdHMgcG9vbCBlbmRcblxuICB2YXIgcGVuZGluZ1N0YXRzID0gW11cbiAgZnVuY3Rpb24gcHVzaFNjb3BlU3RhdHMgKHN0YXJ0LCBlbmQsIHN0YXRzKSB7XG4gICAgdmFyIHBzID0gYWxsb2NQZW5kaW5nU3RhdHMoKVxuICAgIHBzLnN0YXJ0UXVlcnlJbmRleCA9IHN0YXJ0XG4gICAgcHMuZW5kUXVlcnlJbmRleCA9IGVuZFxuICAgIHBzLnN1bSA9IDBcbiAgICBwcy5zdGF0cyA9IHN0YXRzXG4gICAgcGVuZGluZ1N0YXRzLnB1c2gocHMpXG4gIH1cblxuICAvLyB3ZSBzaG91bGQgY2FsbCB0aGlzIGF0IHRoZSBiZWdpbm5pbmcgb2YgdGhlIGZyYW1lLFxuICAvLyBpbiBvcmRlciB0byB1cGRhdGUgZ3B1VGltZVxuICB2YXIgdGltZVN1bSA9IFtdXG4gIHZhciBxdWVyeVB0ciA9IFtdXG4gIGZ1bmN0aW9uIHVwZGF0ZSAoKSB7XG4gICAgdmFyIHB0ciwgaVxuXG4gICAgdmFyIG4gPSBwZW5kaW5nUXVlcmllcy5sZW5ndGhcbiAgICBpZiAobiA9PT0gMCkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgLy8gUmVzZXJ2ZSBzcGFjZVxuICAgIHF1ZXJ5UHRyLmxlbmd0aCA9IE1hdGgubWF4KHF1ZXJ5UHRyLmxlbmd0aCwgbiArIDEpXG4gICAgdGltZVN1bS5sZW5ndGggPSBNYXRoLm1heCh0aW1lU3VtLmxlbmd0aCwgbiArIDEpXG4gICAgdGltZVN1bVswXSA9IDBcbiAgICBxdWVyeVB0clswXSA9IDBcblxuICAgIC8vIFVwZGF0ZSBhbGwgcGVuZGluZyB0aW1lciBxdWVyaWVzXG4gICAgdmFyIHF1ZXJ5VGltZSA9IDBcbiAgICBwdHIgPSAwXG4gICAgZm9yIChpID0gMDsgaSA8IHBlbmRpbmdRdWVyaWVzLmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgcXVlcnkgPSBwZW5kaW5nUXVlcmllc1tpXVxuICAgICAgaWYgKGV4dFRpbWVyLmdldFF1ZXJ5T2JqZWN0RVhUKHF1ZXJ5LCBHTF9RVUVSWV9SRVNVTFRfQVZBSUxBQkxFX0VYVCkpIHtcbiAgICAgICAgcXVlcnlUaW1lICs9IGV4dFRpbWVyLmdldFF1ZXJ5T2JqZWN0RVhUKHF1ZXJ5LCBHTF9RVUVSWV9SRVNVTFRfRVhUKVxuICAgICAgICBmcmVlUXVlcnkocXVlcnkpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwZW5kaW5nUXVlcmllc1twdHIrK10gPSBxdWVyeVxuICAgICAgfVxuICAgICAgdGltZVN1bVtpICsgMV0gPSBxdWVyeVRpbWVcbiAgICAgIHF1ZXJ5UHRyW2kgKyAxXSA9IHB0clxuICAgIH1cbiAgICBwZW5kaW5nUXVlcmllcy5sZW5ndGggPSBwdHJcblxuICAgIC8vIFVwZGF0ZSBhbGwgcGVuZGluZyBzdGF0IHF1ZXJpZXNcbiAgICBwdHIgPSAwXG4gICAgZm9yIChpID0gMDsgaSA8IHBlbmRpbmdTdGF0cy5sZW5ndGg7ICsraSkge1xuICAgICAgdmFyIHN0YXRzID0gcGVuZGluZ1N0YXRzW2ldXG4gICAgICB2YXIgc3RhcnQgPSBzdGF0cy5zdGFydFF1ZXJ5SW5kZXhcbiAgICAgIHZhciBlbmQgPSBzdGF0cy5lbmRRdWVyeUluZGV4XG4gICAgICBzdGF0cy5zdW0gKz0gdGltZVN1bVtlbmRdIC0gdGltZVN1bVtzdGFydF1cbiAgICAgIHZhciBzdGFydFB0ciA9IHF1ZXJ5UHRyW3N0YXJ0XVxuICAgICAgdmFyIGVuZFB0ciA9IHF1ZXJ5UHRyW2VuZF1cbiAgICAgIGlmIChlbmRQdHIgPT09IHN0YXJ0UHRyKSB7XG4gICAgICAgIHN0YXRzLnN0YXRzLmdwdVRpbWUgKz0gc3RhdHMuc3VtIC8gMWU2XG4gICAgICAgIGZyZWVQZW5kaW5nU3RhdHMoc3RhdHMpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzdGF0cy5zdGFydFF1ZXJ5SW5kZXggPSBzdGFydFB0clxuICAgICAgICBzdGF0cy5lbmRRdWVyeUluZGV4ID0gZW5kUHRyXG4gICAgICAgIHBlbmRpbmdTdGF0c1twdHIrK10gPSBzdGF0c1xuICAgICAgfVxuICAgIH1cbiAgICBwZW5kaW5nU3RhdHMubGVuZ3RoID0gcHRyXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGJlZ2luUXVlcnk6IGJlZ2luUXVlcnksXG4gICAgZW5kUXVlcnk6IGVuZFF1ZXJ5LFxuICAgIHB1c2hTY29wZVN0YXRzOiBwdXNoU2NvcGVTdGF0cyxcbiAgICB1cGRhdGU6IHVwZGF0ZSxcbiAgICBnZXROdW1QZW5kaW5nUXVlcmllczogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIHBlbmRpbmdRdWVyaWVzLmxlbmd0aFxuICAgIH0sXG4gICAgY2xlYXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHF1ZXJ5UG9vbC5wdXNoLmFwcGx5KHF1ZXJ5UG9vbCwgcGVuZGluZ1F1ZXJpZXMpXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHF1ZXJ5UG9vbC5sZW5ndGg7IGkrKykge1xuICAgICAgICBleHRUaW1lci5kZWxldGVRdWVyeUVYVChxdWVyeVBvb2xbaV0pXG4gICAgICB9XG4gICAgICBwZW5kaW5nUXVlcmllcy5sZW5ndGggPSAwXG4gICAgICBxdWVyeVBvb2wubGVuZ3RoID0gMFxuICAgIH0sXG4gICAgcmVzdG9yZTogZnVuY3Rpb24gKCkge1xuICAgICAgcGVuZGluZ1F1ZXJpZXMubGVuZ3RoID0gMFxuICAgICAgcXVlcnlQb29sLmxlbmd0aCA9IDBcbiAgICB9XG4gIH1cbn1cbiIsIi8qIGdsb2JhbHMgcGVyZm9ybWFuY2UgKi9cbm1vZHVsZS5leHBvcnRzID1cbiAgKHR5cGVvZiBwZXJmb3JtYW5jZSAhPT0gJ3VuZGVmaW5lZCcgJiYgcGVyZm9ybWFuY2Uubm93KVxuICA/IGZ1bmN0aW9uICgpIHsgcmV0dXJuIHBlcmZvcm1hbmNlLm5vdygpIH1cbiAgOiBmdW5jdGlvbiAoKSB7IHJldHVybiArKG5ldyBEYXRlKCkpIH1cbiIsInZhciBleHRlbmQgPSByZXF1aXJlKCcuL2V4dGVuZCcpXG5cbmZ1bmN0aW9uIHNsaWNlICh4KSB7XG4gIHJldHVybiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbCh4KVxufVxuXG5mdW5jdGlvbiBqb2luICh4KSB7XG4gIHJldHVybiBzbGljZSh4KS5qb2luKCcnKVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNyZWF0ZUVudmlyb25tZW50ICgpIHtcbiAgLy8gVW5pcXVlIHZhcmlhYmxlIGlkIGNvdW50ZXJcbiAgdmFyIHZhckNvdW50ZXIgPSAwXG5cbiAgLy8gTGlua2VkIHZhbHVlcyBhcmUgcGFzc2VkIGZyb20gdGhpcyBzY29wZSBpbnRvIHRoZSBnZW5lcmF0ZWQgY29kZSBibG9ja1xuICAvLyBDYWxsaW5nIGxpbmsoKSBwYXNzZXMgYSB2YWx1ZSBpbnRvIHRoZSBnZW5lcmF0ZWQgc2NvcGUgYW5kIHJldHVybnNcbiAgLy8gdGhlIHZhcmlhYmxlIG5hbWUgd2hpY2ggaXQgaXMgYm91bmQgdG9cbiAgdmFyIGxpbmtlZE5hbWVzID0gW11cbiAgdmFyIGxpbmtlZFZhbHVlcyA9IFtdXG4gIGZ1bmN0aW9uIGxpbmsgKHZhbHVlKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsaW5rZWRWYWx1ZXMubGVuZ3RoOyArK2kpIHtcbiAgICAgIGlmIChsaW5rZWRWYWx1ZXNbaV0gPT09IHZhbHVlKSB7XG4gICAgICAgIHJldHVybiBsaW5rZWROYW1lc1tpXVxuICAgICAgfVxuICAgIH1cblxuICAgIHZhciBuYW1lID0gJ2cnICsgKHZhckNvdW50ZXIrKylcbiAgICBsaW5rZWROYW1lcy5wdXNoKG5hbWUpXG4gICAgbGlua2VkVmFsdWVzLnB1c2godmFsdWUpXG4gICAgcmV0dXJuIG5hbWVcbiAgfVxuXG4gIC8vIGNyZWF0ZSBhIGNvZGUgYmxvY2tcbiAgZnVuY3Rpb24gYmxvY2sgKCkge1xuICAgIHZhciBjb2RlID0gW11cbiAgICBmdW5jdGlvbiBwdXNoICgpIHtcbiAgICAgIGNvZGUucHVzaC5hcHBseShjb2RlLCBzbGljZShhcmd1bWVudHMpKVxuICAgIH1cblxuICAgIHZhciB2YXJzID0gW11cbiAgICBmdW5jdGlvbiBkZWYgKCkge1xuICAgICAgdmFyIG5hbWUgPSAndicgKyAodmFyQ291bnRlcisrKVxuICAgICAgdmFycy5wdXNoKG5hbWUpXG5cbiAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb2RlLnB1c2gobmFtZSwgJz0nKVxuICAgICAgICBjb2RlLnB1c2guYXBwbHkoY29kZSwgc2xpY2UoYXJndW1lbnRzKSlcbiAgICAgICAgY29kZS5wdXNoKCc7JylcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG5hbWVcbiAgICB9XG5cbiAgICByZXR1cm4gZXh0ZW5kKHB1c2gsIHtcbiAgICAgIGRlZjogZGVmLFxuICAgICAgdG9TdHJpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIGpvaW4oW1xuICAgICAgICAgICh2YXJzLmxlbmd0aCA+IDAgPyAndmFyICcgKyB2YXJzICsgJzsnIDogJycpLFxuICAgICAgICAgIGpvaW4oY29kZSlcbiAgICAgICAgXSlcbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgZnVuY3Rpb24gc2NvcGUgKCkge1xuICAgIHZhciBlbnRyeSA9IGJsb2NrKClcbiAgICB2YXIgZXhpdCA9IGJsb2NrKClcblxuICAgIHZhciBlbnRyeVRvU3RyaW5nID0gZW50cnkudG9TdHJpbmdcbiAgICB2YXIgZXhpdFRvU3RyaW5nID0gZXhpdC50b1N0cmluZ1xuXG4gICAgZnVuY3Rpb24gc2F2ZSAob2JqZWN0LCBwcm9wKSB7XG4gICAgICBleGl0KG9iamVjdCwgcHJvcCwgJz0nLCBlbnRyeS5kZWYob2JqZWN0LCBwcm9wKSwgJzsnKVxuICAgIH1cblxuICAgIHJldHVybiBleHRlbmQoZnVuY3Rpb24gKCkge1xuICAgICAgZW50cnkuYXBwbHkoZW50cnksIHNsaWNlKGFyZ3VtZW50cykpXG4gICAgfSwge1xuICAgICAgZGVmOiBlbnRyeS5kZWYsXG4gICAgICBlbnRyeTogZW50cnksXG4gICAgICBleGl0OiBleGl0LFxuICAgICAgc2F2ZTogc2F2ZSxcbiAgICAgIHNldDogZnVuY3Rpb24gKG9iamVjdCwgcHJvcCwgdmFsdWUpIHtcbiAgICAgICAgc2F2ZShvYmplY3QsIHByb3ApXG4gICAgICAgIGVudHJ5KG9iamVjdCwgcHJvcCwgJz0nLCB2YWx1ZSwgJzsnKVxuICAgICAgfSxcbiAgICAgIHRvU3RyaW5nOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBlbnRyeVRvU3RyaW5nKCkgKyBleGl0VG9TdHJpbmcoKVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiBjb25kaXRpb25hbCAoKSB7XG4gICAgdmFyIHByZWQgPSBqb2luKGFyZ3VtZW50cylcbiAgICB2YXIgdGhlbkJsb2NrID0gc2NvcGUoKVxuICAgIHZhciBlbHNlQmxvY2sgPSBzY29wZSgpXG5cbiAgICB2YXIgdGhlblRvU3RyaW5nID0gdGhlbkJsb2NrLnRvU3RyaW5nXG4gICAgdmFyIGVsc2VUb1N0cmluZyA9IGVsc2VCbG9jay50b1N0cmluZ1xuXG4gICAgcmV0dXJuIGV4dGVuZCh0aGVuQmxvY2ssIHtcbiAgICAgIHRoZW46IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhlbkJsb2NrLmFwcGx5KHRoZW5CbG9jaywgc2xpY2UoYXJndW1lbnRzKSlcbiAgICAgICAgcmV0dXJuIHRoaXNcbiAgICAgIH0sXG4gICAgICBlbHNlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGVsc2VCbG9jay5hcHBseShlbHNlQmxvY2ssIHNsaWNlKGFyZ3VtZW50cykpXG4gICAgICAgIHJldHVybiB0aGlzXG4gICAgICB9LFxuICAgICAgdG9TdHJpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGVsc2VDbGF1c2UgPSBlbHNlVG9TdHJpbmcoKVxuICAgICAgICBpZiAoZWxzZUNsYXVzZSkge1xuICAgICAgICAgIGVsc2VDbGF1c2UgPSAnZWxzZXsnICsgZWxzZUNsYXVzZSArICd9J1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBqb2luKFtcbiAgICAgICAgICAnaWYoJywgcHJlZCwgJyl7JyxcbiAgICAgICAgICB0aGVuVG9TdHJpbmcoKSxcbiAgICAgICAgICAnfScsIGVsc2VDbGF1c2VcbiAgICAgICAgXSlcbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgLy8gcHJvY2VkdXJlIGxpc3RcbiAgdmFyIGdsb2JhbEJsb2NrID0gYmxvY2soKVxuICB2YXIgcHJvY2VkdXJlcyA9IHt9XG4gIGZ1bmN0aW9uIHByb2MgKG5hbWUsIGNvdW50KSB7XG4gICAgdmFyIGFyZ3MgPSBbXVxuICAgIGZ1bmN0aW9uIGFyZyAoKSB7XG4gICAgICB2YXIgbmFtZSA9ICdhJyArIGFyZ3MubGVuZ3RoXG4gICAgICBhcmdzLnB1c2gobmFtZSlcbiAgICAgIHJldHVybiBuYW1lXG4gICAgfVxuXG4gICAgY291bnQgPSBjb3VudCB8fCAwXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjb3VudDsgKytpKSB7XG4gICAgICBhcmcoKVxuICAgIH1cblxuICAgIHZhciBib2R5ID0gc2NvcGUoKVxuICAgIHZhciBib2R5VG9TdHJpbmcgPSBib2R5LnRvU3RyaW5nXG5cbiAgICB2YXIgcmVzdWx0ID0gcHJvY2VkdXJlc1tuYW1lXSA9IGV4dGVuZChib2R5LCB7XG4gICAgICBhcmc6IGFyZyxcbiAgICAgIHRvU3RyaW5nOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBqb2luKFtcbiAgICAgICAgICAnZnVuY3Rpb24oJywgYXJncy5qb2luKCksICcpeycsXG4gICAgICAgICAgYm9keVRvU3RyaW5nKCksXG4gICAgICAgICAgJ30nXG4gICAgICAgIF0pXG4gICAgICB9XG4gICAgfSlcblxuICAgIHJldHVybiByZXN1bHRcbiAgfVxuXG4gIGZ1bmN0aW9uIGNvbXBpbGUgKCkge1xuICAgIHZhciBjb2RlID0gWydcInVzZSBzdHJpY3RcIjsnLFxuICAgICAgZ2xvYmFsQmxvY2ssXG4gICAgICAncmV0dXJuIHsnXVxuICAgIE9iamVjdC5rZXlzKHByb2NlZHVyZXMpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIGNvZGUucHVzaCgnXCInLCBuYW1lLCAnXCI6JywgcHJvY2VkdXJlc1tuYW1lXS50b1N0cmluZygpLCAnLCcpXG4gICAgfSlcbiAgICBjb2RlLnB1c2goJ30nKVxuICAgIHZhciBzcmMgPSBqb2luKGNvZGUpXG4gICAgICAucmVwbGFjZSgvOy9nLCAnO1xcbicpXG4gICAgICAucmVwbGFjZSgvfS9nLCAnfVxcbicpXG4gICAgICAucmVwbGFjZSgvey9nLCAne1xcbicpXG4gICAgdmFyIHByb2MgPSBGdW5jdGlvbi5hcHBseShudWxsLCBsaW5rZWROYW1lcy5jb25jYXQoc3JjKSlcbiAgICByZXR1cm4gcHJvYy5hcHBseShudWxsLCBsaW5rZWRWYWx1ZXMpXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGdsb2JhbDogZ2xvYmFsQmxvY2ssXG4gICAgbGluazogbGluayxcbiAgICBibG9jazogYmxvY2ssXG4gICAgcHJvYzogcHJvYyxcbiAgICBzY29wZTogc2NvcGUsXG4gICAgY29uZDogY29uZGl0aW9uYWwsXG4gICAgY29tcGlsZTogY29tcGlsZVxuICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChiYXNlLCBvcHRzKSB7XG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXMob3B0cylcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBrZXlzLmxlbmd0aDsgKytpKSB7XG4gICAgYmFzZVtrZXlzW2ldXSA9IG9wdHNba2V5c1tpXV1cbiAgfVxuICByZXR1cm4gYmFzZVxufVxuIiwidmFyIGlzVHlwZWRBcnJheSA9IHJlcXVpcmUoJy4vaXMtdHlwZWQtYXJyYXknKVxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpc0FycmF5TGlrZSAocykge1xuICByZXR1cm4gQXJyYXkuaXNBcnJheShzKSB8fCBpc1R5cGVkQXJyYXkocylcbn1cbiIsInZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL2lzLXR5cGVkLWFycmF5JylcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpc05EQXJyYXlMaWtlIChvYmopIHtcbiAgcmV0dXJuIChcbiAgICAhIW9iaiAmJlxuICAgIHR5cGVvZiBvYmogPT09ICdvYmplY3QnICYmXG4gICAgQXJyYXkuaXNBcnJheShvYmouc2hhcGUpICYmXG4gICAgQXJyYXkuaXNBcnJheShvYmouc3RyaWRlKSAmJlxuICAgIHR5cGVvZiBvYmoub2Zmc2V0ID09PSAnbnVtYmVyJyAmJlxuICAgIG9iai5zaGFwZS5sZW5ndGggPT09IG9iai5zdHJpZGUubGVuZ3RoICYmXG4gICAgKEFycmF5LmlzQXJyYXkob2JqLmRhdGEpIHx8XG4gICAgICBpc1R5cGVkQXJyYXkob2JqLmRhdGEpKSlcbn1cbiIsInZhciBkdHlwZXMgPSByZXF1aXJlKCcuLi9jb25zdGFudHMvYXJyYXl0eXBlcy5qc29uJylcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHgpIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh4KSBpbiBkdHlwZXNcbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gbG9vcCAobiwgZikge1xuICB2YXIgcmVzdWx0ID0gQXJyYXkobilcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBuOyArK2kpIHtcbiAgICByZXN1bHRbaV0gPSBmKGkpXG4gIH1cbiAgcmV0dXJuIHJlc3VsdFxufVxuIiwidmFyIGxvb3AgPSByZXF1aXJlKCcuL2xvb3AnKVxuXG52YXIgR0xfQllURSA9IDUxMjBcbnZhciBHTF9VTlNJR05FRF9CWVRFID0gNTEyMVxudmFyIEdMX1NIT1JUID0gNTEyMlxudmFyIEdMX1VOU0lHTkVEX1NIT1JUID0gNTEyM1xudmFyIEdMX0lOVCA9IDUxMjRcbnZhciBHTF9VTlNJR05FRF9JTlQgPSA1MTI1XG52YXIgR0xfRkxPQVQgPSA1MTI2XG5cbnZhciBidWZmZXJQb29sID0gbG9vcCg4LCBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiBbXVxufSlcblxuZnVuY3Rpb24gbmV4dFBvdzE2ICh2KSB7XG4gIGZvciAodmFyIGkgPSAxNjsgaSA8PSAoMSA8PCAyOCk7IGkgKj0gMTYpIHtcbiAgICBpZiAodiA8PSBpKSB7XG4gICAgICByZXR1cm4gaVxuICAgIH1cbiAgfVxuICByZXR1cm4gMFxufVxuXG5mdW5jdGlvbiBsb2cyICh2KSB7XG4gIHZhciByLCBzaGlmdFxuICByID0gKHYgPiAweEZGRkYpIDw8IDRcbiAgdiA+Pj49IHJcbiAgc2hpZnQgPSAodiA+IDB4RkYpIDw8IDNcbiAgdiA+Pj49IHNoaWZ0OyByIHw9IHNoaWZ0XG4gIHNoaWZ0ID0gKHYgPiAweEYpIDw8IDJcbiAgdiA+Pj49IHNoaWZ0OyByIHw9IHNoaWZ0XG4gIHNoaWZ0ID0gKHYgPiAweDMpIDw8IDFcbiAgdiA+Pj49IHNoaWZ0OyByIHw9IHNoaWZ0XG4gIHJldHVybiByIHwgKHYgPj4gMSlcbn1cblxuZnVuY3Rpb24gYWxsb2MgKG4pIHtcbiAgdmFyIHN6ID0gbmV4dFBvdzE2KG4pXG4gIHZhciBiaW4gPSBidWZmZXJQb29sW2xvZzIoc3opID4+IDJdXG4gIGlmIChiaW4ubGVuZ3RoID4gMCkge1xuICAgIHJldHVybiBiaW4ucG9wKClcbiAgfVxuICByZXR1cm4gbmV3IEFycmF5QnVmZmVyKHN6KVxufVxuXG5mdW5jdGlvbiBmcmVlIChidWYpIHtcbiAgYnVmZmVyUG9vbFtsb2cyKGJ1Zi5ieXRlTGVuZ3RoKSA+PiAyXS5wdXNoKGJ1Zilcbn1cblxuZnVuY3Rpb24gYWxsb2NUeXBlICh0eXBlLCBuKSB7XG4gIHZhciByZXN1bHQgPSBudWxsXG4gIHN3aXRjaCAodHlwZSkge1xuICAgIGNhc2UgR0xfQllURTpcbiAgICAgIHJlc3VsdCA9IG5ldyBJbnQ4QXJyYXkoYWxsb2MobiksIDAsIG4pXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfVU5TSUdORURfQllURTpcbiAgICAgIHJlc3VsdCA9IG5ldyBVaW50OEFycmF5KGFsbG9jKG4pLCAwLCBuKVxuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX1NIT1JUOlxuICAgICAgcmVzdWx0ID0gbmV3IEludDE2QXJyYXkoYWxsb2MoMiAqIG4pLCAwLCBuKVxuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUOlxuICAgICAgcmVzdWx0ID0gbmV3IFVpbnQxNkFycmF5KGFsbG9jKDIgKiBuKSwgMCwgbilcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9JTlQ6XG4gICAgICByZXN1bHQgPSBuZXcgSW50MzJBcnJheShhbGxvYyg0ICogbiksIDAsIG4pXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfVU5TSUdORURfSU5UOlxuICAgICAgcmVzdWx0ID0gbmV3IFVpbnQzMkFycmF5KGFsbG9jKDQgKiBuKSwgMCwgbilcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9GTE9BVDpcbiAgICAgIHJlc3VsdCA9IG5ldyBGbG9hdDMyQXJyYXkoYWxsb2MoNCAqIG4pLCAwLCBuKVxuICAgICAgYnJlYWtcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIG51bGxcbiAgfVxuICBpZiAocmVzdWx0Lmxlbmd0aCAhPT0gbikge1xuICAgIHJldHVybiByZXN1bHQuc3ViYXJyYXkoMCwgbilcbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG5cbmZ1bmN0aW9uIGZyZWVUeXBlIChhcnJheSkge1xuICBmcmVlKGFycmF5LmJ1ZmZlcilcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGFsbG9jOiBhbGxvYyxcbiAgZnJlZTogZnJlZSxcbiAgYWxsb2NUeXBlOiBhbGxvY1R5cGUsXG4gIGZyZWVUeXBlOiBmcmVlVHlwZVxufVxuIiwiLyogZ2xvYmFscyByZXF1ZXN0QW5pbWF0aW9uRnJhbWUsIGNhbmNlbEFuaW1hdGlvbkZyYW1lICovXG5pZiAodHlwZW9mIHJlcXVlc3RBbmltYXRpb25GcmFtZSA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgIHR5cGVvZiBjYW5jZWxBbmltYXRpb25GcmFtZSA9PT0gJ2Z1bmN0aW9uJykge1xuICBtb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBuZXh0OiBmdW5jdGlvbiAoeCkgeyByZXR1cm4gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHgpIH0sXG4gICAgY2FuY2VsOiBmdW5jdGlvbiAoeCkgeyByZXR1cm4gY2FuY2VsQW5pbWF0aW9uRnJhbWUoeCkgfVxuICB9XG59IGVsc2Uge1xuICBtb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBuZXh0OiBmdW5jdGlvbiAoY2IpIHtcbiAgICAgIHJldHVybiBzZXRUaW1lb3V0KGNiLCAxNilcbiAgICB9LFxuICAgIGNhbmNlbDogY2xlYXJUaW1lb3V0XG4gIH1cbn1cbiIsInZhciBwb29sID0gcmVxdWlyZSgnLi9wb29sJylcblxudmFyIEZMT0FUID0gbmV3IEZsb2F0MzJBcnJheSgxKVxudmFyIElOVCA9IG5ldyBVaW50MzJBcnJheShGTE9BVC5idWZmZXIpXG5cbnZhciBHTF9VTlNJR05FRF9TSE9SVCA9IDUxMjNcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjb252ZXJ0VG9IYWxmRmxvYXQgKGFycmF5KSB7XG4gIHZhciB1c2hvcnRzID0gcG9vbC5hbGxvY1R5cGUoR0xfVU5TSUdORURfU0hPUlQsIGFycmF5Lmxlbmd0aClcblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGFycmF5Lmxlbmd0aDsgKytpKSB7XG4gICAgaWYgKGlzTmFOKGFycmF5W2ldKSkge1xuICAgICAgdXNob3J0c1tpXSA9IDB4ZmZmZlxuICAgIH0gZWxzZSBpZiAoYXJyYXlbaV0gPT09IEluZmluaXR5KSB7XG4gICAgICB1c2hvcnRzW2ldID0gMHg3YzAwXG4gICAgfSBlbHNlIGlmIChhcnJheVtpXSA9PT0gLUluZmluaXR5KSB7XG4gICAgICB1c2hvcnRzW2ldID0gMHhmYzAwXG4gICAgfSBlbHNlIHtcbiAgICAgIEZMT0FUWzBdID0gYXJyYXlbaV1cbiAgICAgIHZhciB4ID0gSU5UWzBdXG5cbiAgICAgIHZhciBzZ24gPSAoeCA+Pj4gMzEpIDw8IDE1XG4gICAgICB2YXIgZXhwID0gKCh4IDw8IDEpID4+PiAyNCkgLSAxMjdcbiAgICAgIHZhciBmcmFjID0gKHggPj4gMTMpICYgKCgxIDw8IDEwKSAtIDEpXG5cbiAgICAgIGlmIChleHAgPCAtMjQpIHtcbiAgICAgICAgLy8gcm91bmQgbm9uLXJlcHJlc2VudGFibGUgZGVub3JtYWxzIHRvIDBcbiAgICAgICAgdXNob3J0c1tpXSA9IHNnblxuICAgICAgfSBlbHNlIGlmIChleHAgPCAtMTQpIHtcbiAgICAgICAgLy8gaGFuZGxlIGRlbm9ybWFsc1xuICAgICAgICB2YXIgcyA9IC0xNCAtIGV4cFxuICAgICAgICB1c2hvcnRzW2ldID0gc2duICsgKChmcmFjICsgKDEgPDwgMTApKSA+PiBzKVxuICAgICAgfSBlbHNlIGlmIChleHAgPiAxNSkge1xuICAgICAgICAvLyByb3VuZCBvdmVyZmxvdyB0byArLy0gSW5maW5pdHlcbiAgICAgICAgdXNob3J0c1tpXSA9IHNnbiArIDB4N2MwMFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gb3RoZXJ3aXNlIGNvbnZlcnQgZGlyZWN0bHlcbiAgICAgICAgdXNob3J0c1tpXSA9IHNnbiArICgoZXhwICsgMTUpIDw8IDEwKSArIGZyYWNcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gdXNob3J0c1xufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAob2JqKSB7XG4gIHJldHVybiBPYmplY3Qua2V5cyhvYmopLm1hcChmdW5jdGlvbiAoa2V5KSB7IHJldHVybiBvYmpba2V5XSB9KVxufVxuIiwiLy8gQ29udGV4dCBhbmQgY2FudmFzIGNyZWF0aW9uIGhlbHBlciBmdW5jdGlvbnNcblxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vdXRpbC9leHRlbmQnKVxuXG5mdW5jdGlvbiBjcmVhdGVDYW52YXMgKGVsZW1lbnQsIG9uRG9uZSwgcGl4ZWxSYXRpbykge1xuICB2YXIgY2FudmFzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJylcbiAgZXh0ZW5kKGNhbnZhcy5zdHlsZSwge1xuICAgIGJvcmRlcjogMCxcbiAgICBtYXJnaW46IDAsXG4gICAgcGFkZGluZzogMCxcbiAgICB0b3A6IDAsXG4gICAgbGVmdDogMFxuICB9KVxuICBlbGVtZW50LmFwcGVuZENoaWxkKGNhbnZhcylcblxuICBpZiAoZWxlbWVudCA9PT0gZG9jdW1lbnQuYm9keSkge1xuICAgIGNhbnZhcy5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSdcbiAgICBleHRlbmQoZWxlbWVudC5zdHlsZSwge1xuICAgICAgbWFyZ2luOiAwLFxuICAgICAgcGFkZGluZzogMFxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiByZXNpemUgKCkge1xuICAgIHZhciB3ID0gd2luZG93LmlubmVyV2lkdGhcbiAgICB2YXIgaCA9IHdpbmRvdy5pbm5lckhlaWdodFxuICAgIGlmIChlbGVtZW50ICE9PSBkb2N1bWVudC5ib2R5KSB7XG4gICAgICB2YXIgYm91bmRzID0gZWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKVxuICAgICAgdyA9IGJvdW5kcy5yaWdodCAtIGJvdW5kcy5sZWZ0XG4gICAgICBoID0gYm91bmRzLnRvcCAtIGJvdW5kcy5ib3R0b21cbiAgICB9XG4gICAgY2FudmFzLndpZHRoID0gcGl4ZWxSYXRpbyAqIHdcbiAgICBjYW52YXMuaGVpZ2h0ID0gcGl4ZWxSYXRpbyAqIGhcbiAgICBleHRlbmQoY2FudmFzLnN0eWxlLCB7XG4gICAgICB3aWR0aDogdyArICdweCcsXG4gICAgICBoZWlnaHQ6IGggKyAncHgnXG4gICAgfSlcbiAgfVxuXG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdyZXNpemUnLCByZXNpemUsIGZhbHNlKVxuXG4gIGZ1bmN0aW9uIG9uRGVzdHJveSAoKSB7XG4gICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIHJlc2l6ZSlcbiAgICBlbGVtZW50LnJlbW92ZUNoaWxkKGNhbnZhcylcbiAgfVxuXG4gIHJlc2l6ZSgpXG5cbiAgcmV0dXJuIHtcbiAgICBjYW52YXM6IGNhbnZhcyxcbiAgICBvbkRlc3Ryb3k6IG9uRGVzdHJveVxuICB9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUNvbnRleHQgKGNhbnZhcywgY29udGV4QXR0cmlidXRlcykge1xuICBmdW5jdGlvbiBnZXQgKG5hbWUpIHtcbiAgICB0cnkge1xuICAgICAgcmV0dXJuIGNhbnZhcy5nZXRDb250ZXh0KG5hbWUsIGNvbnRleEF0dHJpYnV0ZXMpXG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG4gIH1cbiAgcmV0dXJuIChcbiAgICBnZXQoJ3dlYmdsJykgfHxcbiAgICBnZXQoJ2V4cGVyaW1lbnRhbC13ZWJnbCcpIHx8XG4gICAgZ2V0KCd3ZWJnbC1leHBlcmltZW50YWwnKVxuICApXG59XG5cbmZ1bmN0aW9uIGlzSFRNTEVsZW1lbnQgKG9iaikge1xuICByZXR1cm4gKFxuICAgIHR5cGVvZiBvYmoubm9kZU5hbWUgPT09ICdzdHJpbmcnICYmXG4gICAgdHlwZW9mIG9iai5hcHBlbmRDaGlsZCA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgIHR5cGVvZiBvYmouZ2V0Qm91bmRpbmdDbGllbnRSZWN0ID09PSAnZnVuY3Rpb24nXG4gIClcbn1cblxuZnVuY3Rpb24gaXNXZWJHTENvbnRleHQgKG9iaikge1xuICByZXR1cm4gKFxuICAgIHR5cGVvZiBvYmouZHJhd0FycmF5cyA9PT0gJ2Z1bmN0aW9uJyB8fFxuICAgIHR5cGVvZiBvYmouZHJhd0VsZW1lbnRzID09PSAnZnVuY3Rpb24nXG4gIClcbn1cblxuZnVuY3Rpb24gcGFyc2VFeHRlbnNpb25zIChpbnB1dCkge1xuICBpZiAodHlwZW9mIGlucHV0ID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBpbnB1dC5zcGxpdCgpXG4gIH1cbiAgXG4gIHJldHVybiBpbnB1dFxufVxuXG5mdW5jdGlvbiBnZXRFbGVtZW50IChkZXNjKSB7XG4gIGlmICh0eXBlb2YgZGVzYyA9PT0gJ3N0cmluZycpIHtcbiAgICBcbiAgICByZXR1cm4gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihkZXNjKVxuICB9XG4gIHJldHVybiBkZXNjXG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcGFyc2VBcmdzIChhcmdzXykge1xuICB2YXIgYXJncyA9IGFyZ3NfIHx8IHt9XG4gIHZhciBlbGVtZW50LCBjb250YWluZXIsIGNhbnZhcywgZ2xcbiAgdmFyIGNvbnRleHRBdHRyaWJ1dGVzID0ge31cbiAgdmFyIGV4dGVuc2lvbnMgPSBbXVxuICB2YXIgb3B0aW9uYWxFeHRlbnNpb25zID0gW11cbiAgdmFyIHBpeGVsUmF0aW8gPSAodHlwZW9mIHdpbmRvdyA9PT0gJ3VuZGVmaW5lZCcgPyAxIDogd2luZG93LmRldmljZVBpeGVsUmF0aW8pXG4gIHZhciBwcm9maWxlID0gZmFsc2VcbiAgdmFyIG9uRG9uZSA9IGZ1bmN0aW9uIChlcnIpIHtcbiAgICBpZiAoZXJyKSB7XG4gICAgICBcbiAgICB9XG4gIH1cbiAgdmFyIG9uRGVzdHJveSA9IGZ1bmN0aW9uICgpIHt9XG4gIGlmICh0eXBlb2YgYXJncyA9PT0gJ3N0cmluZycpIHtcbiAgICBcbiAgICBlbGVtZW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihhcmdzKVxuICAgIFxuICB9IGVsc2UgaWYgKHR5cGVvZiBhcmdzID09PSAnb2JqZWN0Jykge1xuICAgIGlmIChpc0hUTUxFbGVtZW50KGFyZ3MpKSB7XG4gICAgICBlbGVtZW50ID0gYXJnc1xuICAgIH0gZWxzZSBpZiAoaXNXZWJHTENvbnRleHQoYXJncykpIHtcbiAgICAgIGdsID0gYXJnc1xuICAgICAgY2FudmFzID0gZ2wuY2FudmFzXG4gICAgfSBlbHNlIHtcbiAgICAgIFxuICAgICAgaWYgKCdnbCcgaW4gYXJncykge1xuICAgICAgICBnbCA9IGFyZ3MuZ2xcbiAgICAgIH0gZWxzZSBpZiAoJ2NhbnZhcycgaW4gYXJncykge1xuICAgICAgICBjYW52YXMgPSBnZXRFbGVtZW50KGFyZ3MuY2FudmFzKVxuICAgICAgfSBlbHNlIGlmICgnY29udGFpbmVyJyBpbiBhcmdzKSB7XG4gICAgICAgIGNvbnRhaW5lciA9IGdldEVsZW1lbnQoYXJncy5jb250YWluZXIpXG4gICAgICB9XG4gICAgICBpZiAoJ2F0dHJpYnV0ZXMnIGluIGFyZ3MpIHtcbiAgICAgICAgY29udGV4dEF0dHJpYnV0ZXMgPSBhcmdzLmF0dHJpYnV0ZXNcbiAgICAgICAgXG4gICAgICB9XG4gICAgICBpZiAoJ2V4dGVuc2lvbnMnIGluIGFyZ3MpIHtcbiAgICAgICAgZXh0ZW5zaW9ucyA9IHBhcnNlRXh0ZW5zaW9ucyhhcmdzLmV4dGVuc2lvbnMpXG4gICAgICB9XG4gICAgICBpZiAoJ29wdGlvbmFsRXh0ZW5zaW9ucycgaW4gYXJncykge1xuICAgICAgICBvcHRpb25hbEV4dGVuc2lvbnMgPSBwYXJzZUV4dGVuc2lvbnMoYXJncy5vcHRpb25hbEV4dGVuc2lvbnMpXG4gICAgICB9XG4gICAgICBpZiAoJ29uRG9uZScgaW4gYXJncykge1xuICAgICAgICBcbiAgICAgICAgb25Eb25lID0gYXJncy5vbkRvbmVcbiAgICAgIH1cbiAgICAgIGlmICgncHJvZmlsZScgaW4gYXJncykge1xuICAgICAgICBwcm9maWxlID0gISFhcmdzLnByb2ZpbGVcbiAgICAgIH1cbiAgICAgIGlmICgncGl4ZWxSYXRpbycgaW4gYXJncykge1xuICAgICAgICBwaXhlbFJhdGlvID0gK2FyZ3MucGl4ZWxSYXRpb1xuICAgICAgICBcbiAgICAgIH1cbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgXG4gIH1cblxuICBpZiAoZWxlbWVudCkge1xuICAgIGlmIChlbGVtZW50Lm5vZGVOYW1lLnRvTG93ZXJDYXNlKCkgPT09ICdjYW52YXMnKSB7XG4gICAgICBjYW52YXMgPSBlbGVtZW50XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnRhaW5lciA9IGVsZW1lbnRcbiAgICB9XG4gIH1cblxuICBpZiAoIWdsKSB7XG4gICAgaWYgKCFjYW52YXMpIHtcbiAgICAgIFxuICAgICAgdmFyIHJlc3VsdCA9IGNyZWF0ZUNhbnZhcyhjb250YWluZXIgfHwgZG9jdW1lbnQuYm9keSwgb25Eb25lLCBwaXhlbFJhdGlvKVxuICAgICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgICAgcmV0dXJuIG51bGxcbiAgICAgIH1cbiAgICAgIGNhbnZhcyA9IHJlc3VsdC5jYW52YXNcbiAgICAgIG9uRGVzdHJveSA9IHJlc3VsdC5vbkRlc3Ryb3lcbiAgICB9XG4gICAgZ2wgPSBjcmVhdGVDb250ZXh0KGNhbnZhcywgY29udGV4dEF0dHJpYnV0ZXMpXG4gIH1cblxuICBpZiAoIWdsKSB7XG4gICAgb25EZXN0cm95KClcbiAgICBvbkRvbmUoJ3dlYmdsIG5vdCBzdXBwb3J0ZWQsIHRyeSB1cGdyYWRpbmcgeW91ciBicm93c2VyIG9yIGdyYXBoaWNzIGRyaXZlcnMgaHR0cDovL2dldC53ZWJnbC5vcmcnKVxuICAgIHJldHVybiBudWxsXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGdsOiBnbCxcbiAgICBjYW52YXM6IGNhbnZhcyxcbiAgICBjb250YWluZXI6IGNvbnRhaW5lcixcbiAgICBleHRlbnNpb25zOiBleHRlbnNpb25zLFxuICAgIG9wdGlvbmFsRXh0ZW5zaW9uczogb3B0aW9uYWxFeHRlbnNpb25zLFxuICAgIHBpeGVsUmF0aW86IHBpeGVsUmF0aW8sXG4gICAgcHJvZmlsZTogcHJvZmlsZSxcbiAgICBvbkRvbmU6IG9uRG9uZSxcbiAgICBvbkRlc3Ryb3k6IG9uRGVzdHJveVxuICB9XG59XG4iLCIndXNlIHN0cmljdCdcblxubW9kdWxlLmV4cG9ydHMgPSBtb3VzZUxpc3RlblxuXG52YXIgbW91c2UgPSByZXF1aXJlKCdtb3VzZS1ldmVudCcpXG5cbmZ1bmN0aW9uIG1vdXNlTGlzdGVuKGVsZW1lbnQsIGNhbGxiYWNrKSB7XG4gIGlmKCFjYWxsYmFjaykge1xuICAgIGNhbGxiYWNrID0gZWxlbWVudFxuICAgIGVsZW1lbnQgPSB3aW5kb3dcbiAgfVxuXG4gIHZhciBidXR0b25TdGF0ZSA9IDBcbiAgdmFyIHggPSAwXG4gIHZhciB5ID0gMFxuICB2YXIgbW9kcyA9IHtcbiAgICBzaGlmdDogICBmYWxzZSxcbiAgICBhbHQ6ICAgICBmYWxzZSxcbiAgICBjb250cm9sOiBmYWxzZSxcbiAgICBtZXRhOiAgICBmYWxzZVxuICB9XG4gIHZhciBhdHRhY2hlZCA9IGZhbHNlXG5cbiAgZnVuY3Rpb24gdXBkYXRlTW9kcyhldikge1xuICAgIHZhciBjaGFuZ2VkID0gZmFsc2VcbiAgICBpZignYWx0S2V5JyBpbiBldikge1xuICAgICAgY2hhbmdlZCA9IGNoYW5nZWQgfHwgZXYuYWx0S2V5ICE9PSBtb2RzLmFsdFxuICAgICAgbW9kcy5hbHQgPSAhIWV2LmFsdEtleVxuICAgIH1cbiAgICBpZignc2hpZnRLZXknIGluIGV2KSB7XG4gICAgICBjaGFuZ2VkID0gY2hhbmdlZCB8fCBldi5zaGlmdEtleSAhPT0gbW9kcy5zaGlmdFxuICAgICAgbW9kcy5zaGlmdCA9ICEhZXYuc2hpZnRLZXlcbiAgICB9XG4gICAgaWYoJ2N0cmxLZXknIGluIGV2KSB7XG4gICAgICBjaGFuZ2VkID0gY2hhbmdlZCB8fCBldi5jdHJsS2V5ICE9PSBtb2RzLmNvbnRyb2xcbiAgICAgIG1vZHMuY29udHJvbCA9ICEhZXYuY3RybEtleVxuICAgIH1cbiAgICBpZignbWV0YUtleScgaW4gZXYpIHtcbiAgICAgIGNoYW5nZWQgPSBjaGFuZ2VkIHx8IGV2Lm1ldGFLZXkgIT09IG1vZHMubWV0YVxuICAgICAgbW9kcy5tZXRhID0gISFldi5tZXRhS2V5XG4gICAgfVxuICAgIHJldHVybiBjaGFuZ2VkXG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVFdmVudChuZXh0QnV0dG9ucywgZXYpIHtcbiAgICB2YXIgbmV4dFggPSBtb3VzZS54KGV2KVxuICAgIHZhciBuZXh0WSA9IG1vdXNlLnkoZXYpXG4gICAgaWYoJ2J1dHRvbnMnIGluIGV2KSB7XG4gICAgICBuZXh0QnV0dG9ucyA9IGV2LmJ1dHRvbnN8MFxuICAgIH1cbiAgICBpZihuZXh0QnV0dG9ucyAhPT0gYnV0dG9uU3RhdGUgfHxcbiAgICAgICBuZXh0WCAhPT0geCB8fFxuICAgICAgIG5leHRZICE9PSB5IHx8XG4gICAgICAgdXBkYXRlTW9kcyhldikpIHtcbiAgICAgIGJ1dHRvblN0YXRlID0gbmV4dEJ1dHRvbnN8MFxuICAgICAgeCA9IG5leHRYfHwwXG4gICAgICB5ID0gbmV4dFl8fDBcbiAgICAgIGNhbGxiYWNrICYmIGNhbGxiYWNrKGJ1dHRvblN0YXRlLCB4LCB5LCBtb2RzKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNsZWFyU3RhdGUoZXYpIHtcbiAgICBoYW5kbGVFdmVudCgwLCBldilcbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZUJsdXIoKSB7XG4gICAgaWYoYnV0dG9uU3RhdGUgfHxcbiAgICAgIHggfHxcbiAgICAgIHkgfHxcbiAgICAgIG1vZHMuc2hpZnQgfHxcbiAgICAgIG1vZHMuYWx0IHx8XG4gICAgICBtb2RzLm1ldGEgfHxcbiAgICAgIG1vZHMuY29udHJvbCkge1xuXG4gICAgICB4ID0geSA9IDBcbiAgICAgIGJ1dHRvblN0YXRlID0gMFxuICAgICAgbW9kcy5zaGlmdCA9IG1vZHMuYWx0ID0gbW9kcy5jb250cm9sID0gbW9kcy5tZXRhID0gZmFsc2VcbiAgICAgIGNhbGxiYWNrICYmIGNhbGxiYWNrKDAsIDAsIDAsIG1vZHMpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaGFuZGxlTW9kcyhldikge1xuICAgIGlmKHVwZGF0ZU1vZHMoZXYpKSB7XG4gICAgICBjYWxsYmFjayAmJiBjYWxsYmFjayhidXR0b25TdGF0ZSwgeCwgeSwgbW9kcylcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVNb3VzZU1vdmUoZXYpIHtcbiAgICBpZihtb3VzZS5idXR0b25zKGV2KSA9PT0gMCkge1xuICAgICAgaGFuZGxlRXZlbnQoMCwgZXYpXG4gICAgfSBlbHNlIHtcbiAgICAgIGhhbmRsZUV2ZW50KGJ1dHRvblN0YXRlLCBldilcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVNb3VzZURvd24oZXYpIHtcbiAgICBoYW5kbGVFdmVudChidXR0b25TdGF0ZSB8IG1vdXNlLmJ1dHRvbnMoZXYpLCBldilcbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZU1vdXNlVXAoZXYpIHtcbiAgICBoYW5kbGVFdmVudChidXR0b25TdGF0ZSAmIH5tb3VzZS5idXR0b25zKGV2KSwgZXYpXG4gIH1cblxuICBmdW5jdGlvbiBhdHRhY2hMaXN0ZW5lcnMoKSB7XG4gICAgaWYoYXR0YWNoZWQpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBhdHRhY2hlZCA9IHRydWVcblxuICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgaGFuZGxlTW91c2VNb3ZlKVxuXG4gICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCBoYW5kbGVNb3VzZURvd24pXG5cbiAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNldXAnLCBoYW5kbGVNb3VzZVVwKVxuXG4gICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWxlYXZlJywgY2xlYXJTdGF0ZSlcbiAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZW50ZXInLCBjbGVhclN0YXRlKVxuICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VvdXQnLCBjbGVhclN0YXRlKVxuICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VvdmVyJywgY2xlYXJTdGF0ZSlcblxuICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignYmx1cicsIGhhbmRsZUJsdXIpXG5cbiAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXVwJywgaGFuZGxlTW9kcylcbiAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBoYW5kbGVNb2RzKVxuICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5cHJlc3MnLCBoYW5kbGVNb2RzKVxuXG4gICAgaWYoZWxlbWVudCAhPT0gd2luZG93KSB7XG4gICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignYmx1cicsIGhhbmRsZUJsdXIpXG5cbiAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXl1cCcsIGhhbmRsZU1vZHMpXG4gICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIGhhbmRsZU1vZHMpXG4gICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5cHJlc3MnLCBoYW5kbGVNb2RzKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGRldGFjaExpc3RlbmVycygpIHtcbiAgICBpZighYXR0YWNoZWQpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBhdHRhY2hlZCA9IGZhbHNlXG5cbiAgICBlbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIGhhbmRsZU1vdXNlTW92ZSlcblxuICAgIGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgaGFuZGxlTW91c2VEb3duKVxuXG4gICAgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZXVwJywgaGFuZGxlTW91c2VVcClcblxuICAgIGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW91c2VsZWF2ZScsIGNsZWFyU3RhdGUpXG4gICAgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZWVudGVyJywgY2xlYXJTdGF0ZSlcbiAgICBlbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNlb3V0JywgY2xlYXJTdGF0ZSlcbiAgICBlbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNlb3ZlcicsIGNsZWFyU3RhdGUpXG5cbiAgICBlbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2JsdXInLCBoYW5kbGVCbHVyKVxuXG4gICAgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdrZXl1cCcsIGhhbmRsZU1vZHMpXG4gICAgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdrZXlkb3duJywgaGFuZGxlTW9kcylcbiAgICBlbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleXByZXNzJywgaGFuZGxlTW9kcylcblxuICAgIGlmKGVsZW1lbnQgIT09IHdpbmRvdykge1xuICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2JsdXInLCBoYW5kbGVCbHVyKVxuXG4gICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigna2V5dXAnLCBoYW5kbGVNb2RzKVxuICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBoYW5kbGVNb2RzKVxuICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleXByZXNzJywgaGFuZGxlTW9kcylcbiAgICB9XG4gIH1cblxuICAvL0F0dGFjaCBsaXN0ZW5lcnNcbiAgYXR0YWNoTGlzdGVuZXJzKClcblxuICB2YXIgcmVzdWx0ID0ge1xuICAgIGVsZW1lbnQ6IGVsZW1lbnRcbiAgfVxuXG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzKHJlc3VsdCwge1xuICAgIGVuYWJsZWQ6IHtcbiAgICAgIGdldDogZnVuY3Rpb24oKSB7IHJldHVybiBhdHRhY2hlZCB9LFxuICAgICAgc2V0OiBmdW5jdGlvbihmKSB7XG4gICAgICAgIGlmKGYpIHtcbiAgICAgICAgICBhdHRhY2hMaXN0ZW5lcnMoKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGRldGFjaExpc3RlbmVyc1xuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgZW51bWVyYWJsZTogdHJ1ZVxuICAgIH0sXG4gICAgYnV0dG9uczoge1xuICAgICAgZ2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIGJ1dHRvblN0YXRlIH0sXG4gICAgICBlbnVtZXJhYmxlOiB0cnVlXG4gICAgfSxcbiAgICB4OiB7XG4gICAgICBnZXQ6IGZ1bmN0aW9uKCkgeyByZXR1cm4geCB9LFxuICAgICAgZW51bWVyYWJsZTogdHJ1ZVxuICAgIH0sXG4gICAgeToge1xuICAgICAgZ2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIHkgfSxcbiAgICAgIGVudW1lcmFibGU6IHRydWVcbiAgICB9LFxuICAgIG1vZHM6IHtcbiAgICAgIGdldDogZnVuY3Rpb24oKSB7IHJldHVybiBtb2RzIH0sXG4gICAgICBlbnVtZXJhYmxlOiB0cnVlXG4gICAgfVxuICB9KVxuXG4gIHJldHVybiByZXN1bHRcbn1cbiIsIid1c2Ugc3RyaWN0J1xuXG5mdW5jdGlvbiBtb3VzZUJ1dHRvbnMoZXYpIHtcbiAgaWYodHlwZW9mIGV2ID09PSAnb2JqZWN0Jykge1xuICAgIGlmKCdidXR0b25zJyBpbiBldikge1xuICAgICAgcmV0dXJuIGV2LmJ1dHRvbnNcbiAgICB9IGVsc2UgaWYoJ3doaWNoJyBpbiBldikge1xuICAgICAgdmFyIGIgPSBldi53aGljaFxuICAgICAgaWYoYiA9PT0gMikge1xuICAgICAgICByZXR1cm4gNFxuICAgICAgfSBlbHNlIGlmKGIgPT09IDMpIHtcbiAgICAgICAgcmV0dXJuIDJcbiAgICAgIH0gZWxzZSBpZihiID4gMCkge1xuICAgICAgICByZXR1cm4gMTw8KGItMSlcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYoJ2J1dHRvbicgaW4gZXYpIHtcbiAgICAgIHZhciBiID0gZXYuYnV0dG9uXG4gICAgICBpZihiID09PSAxKSB7XG4gICAgICAgIHJldHVybiA0XG4gICAgICB9IGVsc2UgaWYoYiA9PT0gMikge1xuICAgICAgICByZXR1cm4gMlxuICAgICAgfSBlbHNlIGlmKGIgPj0gMCkge1xuICAgICAgICByZXR1cm4gMTw8YlxuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gMFxufVxuZXhwb3J0cy5idXR0b25zID0gbW91c2VCdXR0b25zXG5cbmZ1bmN0aW9uIG1vdXNlRWxlbWVudChldikge1xuICByZXR1cm4gZXYudGFyZ2V0IHx8IGV2LnNyY0VsZW1lbnQgfHwgd2luZG93XG59XG5leHBvcnRzLmVsZW1lbnQgPSBtb3VzZUVsZW1lbnRcblxuZnVuY3Rpb24gbW91c2VSZWxhdGl2ZVgoZXYpIHtcbiAgaWYodHlwZW9mIGV2ID09PSAnb2JqZWN0Jykge1xuICAgIGlmKCdvZmZzZXRYJyBpbiBldikge1xuICAgICAgcmV0dXJuIGV2Lm9mZnNldFhcbiAgICB9XG4gICAgdmFyIHRhcmdldCA9IG1vdXNlRWxlbWVudChldilcbiAgICB2YXIgYm91bmRzID0gdGFyZ2V0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpXG4gICAgcmV0dXJuIGV2LmNsaWVudFggLSBib3VuZHMubGVmdFxuICB9XG4gIHJldHVybiAwXG59XG5leHBvcnRzLnggPSBtb3VzZVJlbGF0aXZlWFxuXG5mdW5jdGlvbiBtb3VzZVJlbGF0aXZlWShldikge1xuICBpZih0eXBlb2YgZXYgPT09ICdvYmplY3QnKSB7XG4gICAgaWYoJ29mZnNldFknIGluIGV2KSB7XG4gICAgICByZXR1cm4gZXYub2Zmc2V0WVxuICAgIH1cbiAgICB2YXIgdGFyZ2V0ID0gbW91c2VFbGVtZW50KGV2KVxuICAgIHZhciBib3VuZHMgPSB0YXJnZXQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KClcbiAgICByZXR1cm4gZXYuY2xpZW50WSAtIGJvdW5kcy50b3BcbiAgfVxuICByZXR1cm4gMFxufVxuZXhwb3J0cy55ID0gbW91c2VSZWxhdGl2ZVlcbiIsIlxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vbGliL3V0aWwvZXh0ZW5kJylcbnZhciBkeW5hbWljID0gcmVxdWlyZSgnLi9saWIvZHluYW1pYycpXG52YXIgcmFmID0gcmVxdWlyZSgnLi9saWIvdXRpbC9yYWYnKVxudmFyIGNsb2NrID0gcmVxdWlyZSgnLi9saWIvdXRpbC9jbG9jaycpXG52YXIgY3JlYXRlU3RyaW5nU3RvcmUgPSByZXF1aXJlKCcuL2xpYi9zdHJpbmdzJylcbnZhciBpbml0V2ViR0wgPSByZXF1aXJlKCcuL2xpYi93ZWJnbCcpXG52YXIgd3JhcEV4dGVuc2lvbnMgPSByZXF1aXJlKCcuL2xpYi9leHRlbnNpb24nKVxudmFyIHdyYXBMaW1pdHMgPSByZXF1aXJlKCcuL2xpYi9saW1pdHMnKVxudmFyIHdyYXBCdWZmZXJzID0gcmVxdWlyZSgnLi9saWIvYnVmZmVyJylcbnZhciB3cmFwRWxlbWVudHMgPSByZXF1aXJlKCcuL2xpYi9lbGVtZW50cycpXG52YXIgd3JhcFRleHR1cmVzID0gcmVxdWlyZSgnLi9saWIvdGV4dHVyZScpXG52YXIgd3JhcFJlbmRlcmJ1ZmZlcnMgPSByZXF1aXJlKCcuL2xpYi9yZW5kZXJidWZmZXInKVxudmFyIHdyYXBGcmFtZWJ1ZmZlcnMgPSByZXF1aXJlKCcuL2xpYi9mcmFtZWJ1ZmZlcicpXG52YXIgd3JhcEF0dHJpYnV0ZXMgPSByZXF1aXJlKCcuL2xpYi9hdHRyaWJ1dGUnKVxudmFyIHdyYXBTaGFkZXJzID0gcmVxdWlyZSgnLi9saWIvc2hhZGVyJylcbnZhciB3cmFwUmVhZCA9IHJlcXVpcmUoJy4vbGliL3JlYWQnKVxudmFyIGNyZWF0ZUNvcmUgPSByZXF1aXJlKCcuL2xpYi9jb3JlJylcbnZhciBjcmVhdGVTdGF0cyA9IHJlcXVpcmUoJy4vbGliL3N0YXRzJylcbnZhciBjcmVhdGVUaW1lciA9IHJlcXVpcmUoJy4vbGliL3RpbWVyJylcblxudmFyIEdMX0NPTE9SX0JVRkZFUl9CSVQgPSAxNjM4NFxudmFyIEdMX0RFUFRIX0JVRkZFUl9CSVQgPSAyNTZcbnZhciBHTF9TVEVOQ0lMX0JVRkZFUl9CSVQgPSAxMDI0XG5cbnZhciBHTF9BUlJBWV9CVUZGRVIgPSAzNDk2MlxuXG52YXIgQ09OVEVYVF9MT1NUX0VWRU5UID0gJ3dlYmdsY29udGV4dGxvc3QnXG52YXIgQ09OVEVYVF9SRVNUT1JFRF9FVkVOVCA9ICd3ZWJnbGNvbnRleHRyZXN0b3JlZCdcblxudmFyIERZTl9QUk9QID0gMVxudmFyIERZTl9DT05URVhUID0gMlxudmFyIERZTl9TVEFURSA9IDNcblxuZnVuY3Rpb24gZmluZCAoaGF5c3RhY2ssIG5lZWRsZSkge1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGhheXN0YWNrLmxlbmd0aDsgKytpKSB7XG4gICAgaWYgKGhheXN0YWNrW2ldID09PSBuZWVkbGUpIHtcbiAgICAgIHJldHVybiBpXG4gICAgfVxuICB9XG4gIHJldHVybiAtMVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBSRUdMIChhcmdzKSB7XG4gIHZhciBjb25maWcgPSBpbml0V2ViR0woYXJncylcbiAgaWYgKCFjb25maWcpIHtcbiAgICByZXR1cm4gbnVsbFxuICB9XG5cbiAgdmFyIGdsID0gY29uZmlnLmdsXG4gIHZhciBnbEF0dHJpYnV0ZXMgPSBnbC5nZXRDb250ZXh0QXR0cmlidXRlcygpXG4gIHZhciBjb250ZXh0TG9zdCA9IGdsLmlzQ29udGV4dExvc3QoKVxuXG4gIHZhciBleHRlbnNpb25TdGF0ZSA9IHdyYXBFeHRlbnNpb25zKGdsLCBjb25maWcpXG4gIGlmICghZXh0ZW5zaW9uU3RhdGUpIHtcbiAgICByZXR1cm4gbnVsbFxuICB9XG5cbiAgdmFyIHN0cmluZ1N0b3JlID0gY3JlYXRlU3RyaW5nU3RvcmUoKVxuICB2YXIgc3RhdHMgPSBjcmVhdGVTdGF0cygpXG4gIHZhciBleHRlbnNpb25zID0gZXh0ZW5zaW9uU3RhdGUuZXh0ZW5zaW9uc1xuICB2YXIgdGltZXIgPSBjcmVhdGVUaW1lcihnbCwgZXh0ZW5zaW9ucylcblxuICB2YXIgU1RBUlRfVElNRSA9IGNsb2NrKClcbiAgdmFyIFdJRFRIID0gZ2wuZHJhd2luZ0J1ZmZlcldpZHRoXG4gIHZhciBIRUlHSFQgPSBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0XG5cbiAgdmFyIGNvbnRleHRTdGF0ZSA9IHtcbiAgICB0aWNrOiAwLFxuICAgIHRpbWU6IDAsXG4gICAgdmlld3BvcnRXaWR0aDogV0lEVEgsXG4gICAgdmlld3BvcnRIZWlnaHQ6IEhFSUdIVCxcbiAgICBmcmFtZWJ1ZmZlcldpZHRoOiBXSURUSCxcbiAgICBmcmFtZWJ1ZmZlckhlaWdodDogSEVJR0hULFxuICAgIGRyYXdpbmdCdWZmZXJXaWR0aDogV0lEVEgsXG4gICAgZHJhd2luZ0J1ZmZlckhlaWdodDogSEVJR0hULFxuICAgIHBpeGVsUmF0aW86IGNvbmZpZy5waXhlbFJhdGlvXG4gIH1cbiAgdmFyIHVuaWZvcm1TdGF0ZSA9IHt9XG4gIHZhciBkcmF3U3RhdGUgPSB7XG4gICAgZWxlbWVudHM6IG51bGwsXG4gICAgcHJpbWl0aXZlOiA0LCAvLyBHTF9UUklBTkdMRVNcbiAgICBjb3VudDogLTEsXG4gICAgb2Zmc2V0OiAwLFxuICAgIGluc3RhbmNlczogLTFcbiAgfVxuXG4gIHZhciBsaW1pdHMgPSB3cmFwTGltaXRzKGdsLCBleHRlbnNpb25zKVxuICB2YXIgYnVmZmVyU3RhdGUgPSB3cmFwQnVmZmVycyhnbCwgc3RhdHMsIGNvbmZpZylcbiAgdmFyIGVsZW1lbnRTdGF0ZSA9IHdyYXBFbGVtZW50cyhnbCwgZXh0ZW5zaW9ucywgYnVmZmVyU3RhdGUsIHN0YXRzKVxuICB2YXIgYXR0cmlidXRlU3RhdGUgPSB3cmFwQXR0cmlidXRlcyhcbiAgICBnbCxcbiAgICBleHRlbnNpb25zLFxuICAgIGxpbWl0cyxcbiAgICBidWZmZXJTdGF0ZSxcbiAgICBzdHJpbmdTdG9yZSlcbiAgdmFyIHNoYWRlclN0YXRlID0gd3JhcFNoYWRlcnMoZ2wsIHN0cmluZ1N0b3JlLCBzdGF0cywgY29uZmlnKVxuICB2YXIgdGV4dHVyZVN0YXRlID0gd3JhcFRleHR1cmVzKFxuICAgIGdsLFxuICAgIGV4dGVuc2lvbnMsXG4gICAgbGltaXRzLFxuICAgIGZ1bmN0aW9uICgpIHsgY29yZS5wcm9jcy5wb2xsKCkgfSxcbiAgICBjb250ZXh0U3RhdGUsXG4gICAgc3RhdHMsXG4gICAgY29uZmlnKVxuICB2YXIgcmVuZGVyYnVmZmVyU3RhdGUgPSB3cmFwUmVuZGVyYnVmZmVycyhnbCwgZXh0ZW5zaW9ucywgbGltaXRzLCBzdGF0cywgY29uZmlnKVxuICB2YXIgZnJhbWVidWZmZXJTdGF0ZSA9IHdyYXBGcmFtZWJ1ZmZlcnMoXG4gICAgZ2wsXG4gICAgZXh0ZW5zaW9ucyxcbiAgICBsaW1pdHMsXG4gICAgdGV4dHVyZVN0YXRlLFxuICAgIHJlbmRlcmJ1ZmZlclN0YXRlLFxuICAgIHN0YXRzKVxuICB2YXIgY29yZSA9IGNyZWF0ZUNvcmUoXG4gICAgZ2wsXG4gICAgc3RyaW5nU3RvcmUsXG4gICAgZXh0ZW5zaW9ucyxcbiAgICBsaW1pdHMsXG4gICAgYnVmZmVyU3RhdGUsXG4gICAgZWxlbWVudFN0YXRlLFxuICAgIHRleHR1cmVTdGF0ZSxcbiAgICBmcmFtZWJ1ZmZlclN0YXRlLFxuICAgIHVuaWZvcm1TdGF0ZSxcbiAgICBhdHRyaWJ1dGVTdGF0ZSxcbiAgICBzaGFkZXJTdGF0ZSxcbiAgICBkcmF3U3RhdGUsXG4gICAgY29udGV4dFN0YXRlLFxuICAgIHRpbWVyLFxuICAgIGNvbmZpZylcbiAgdmFyIHJlYWRQaXhlbHMgPSB3cmFwUmVhZChcbiAgICBnbCxcbiAgICBmcmFtZWJ1ZmZlclN0YXRlLFxuICAgIGNvcmUucHJvY3MucG9sbCxcbiAgICBjb250ZXh0U3RhdGUsXG4gICAgZ2xBdHRyaWJ1dGVzLCBleHRlbnNpb25zKVxuXG4gIHZhciBuZXh0U3RhdGUgPSBjb3JlLm5leHRcbiAgdmFyIGNhbnZhcyA9IGdsLmNhbnZhc1xuXG4gIHZhciByYWZDYWxsYmFja3MgPSBbXVxuICB2YXIgbG9zc0NhbGxiYWNrcyA9IFtdXG4gIHZhciByZXN0b3JlQ2FsbGJhY2tzID0gW11cbiAgdmFyIGRlc3Ryb3lDYWxsYmFja3MgPSBbY29uZmlnLm9uRGVzdHJveV1cblxuICB2YXIgYWN0aXZlUkFGID0gbnVsbFxuICBmdW5jdGlvbiBoYW5kbGVSQUYgKCkge1xuICAgIGlmIChyYWZDYWxsYmFja3MubGVuZ3RoID09PSAwKSB7XG4gICAgICBpZiAodGltZXIpIHtcbiAgICAgICAgdGltZXIudXBkYXRlKClcbiAgICAgIH1cbiAgICAgIGFjdGl2ZVJBRiA9IG51bGxcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIC8vIHNjaGVkdWxlIG5leHQgYW5pbWF0aW9uIGZyYW1lXG4gICAgYWN0aXZlUkFGID0gcmFmLm5leHQoaGFuZGxlUkFGKVxuXG4gICAgLy8gcG9sbCBmb3IgY2hhbmdlc1xuICAgIHBvbGwoKVxuXG4gICAgLy8gZmlyZSBhIGNhbGxiYWNrIGZvciBhbGwgcGVuZGluZyByYWZzXG4gICAgZm9yICh2YXIgaSA9IHJhZkNhbGxiYWNrcy5sZW5ndGggLSAxOyBpID49IDA7IC0taSkge1xuICAgICAgdmFyIGNiID0gcmFmQ2FsbGJhY2tzW2ldXG4gICAgICBpZiAoY2IpIHtcbiAgICAgICAgY2IoY29udGV4dFN0YXRlLCBudWxsLCAwKVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIGZsdXNoIGFsbCBwZW5kaW5nIHdlYmdsIGNhbGxzXG4gICAgZ2wuZmx1c2goKVxuXG4gICAgLy8gcG9sbCBHUFUgdGltZXJzICphZnRlciogZ2wuZmx1c2ggc28gd2UgZG9uJ3QgZGVsYXkgY29tbWFuZCBkaXNwYXRjaFxuICAgIGlmICh0aW1lcikge1xuICAgICAgdGltZXIudXBkYXRlKClcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzdGFydFJBRiAoKSB7XG4gICAgaWYgKCFhY3RpdmVSQUYgJiYgcmFmQ2FsbGJhY2tzLmxlbmd0aCA+IDApIHtcbiAgICAgIGFjdGl2ZVJBRiA9IHJhZi5uZXh0KGhhbmRsZVJBRilcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzdG9wUkFGICgpIHtcbiAgICBpZiAoYWN0aXZlUkFGKSB7XG4gICAgICByYWYuY2FuY2VsKGhhbmRsZVJBRilcbiAgICAgIGFjdGl2ZVJBRiA9IG51bGxcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVDb250ZXh0TG9zcyAoZXZlbnQpIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpXG5cbiAgICAvLyBzZXQgY29udGV4dCBsb3N0IGZsYWdcbiAgICBjb250ZXh0TG9zdCA9IHRydWVcblxuICAgIC8vIHBhdXNlIHJlcXVlc3QgYW5pbWF0aW9uIGZyYW1lXG4gICAgc3RvcFJBRigpXG5cbiAgICAvLyBsb3NlIGNvbnRleHRcbiAgICBsb3NzQ2FsbGJhY2tzLmZvckVhY2goZnVuY3Rpb24gKGNiKSB7XG4gICAgICBjYigpXG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZUNvbnRleHRSZXN0b3JlZCAoZXZlbnQpIHtcbiAgICAvLyBjbGVhciBlcnJvciBjb2RlXG4gICAgZ2wuZ2V0RXJyb3IoKVxuXG4gICAgLy8gY2xlYXIgY29udGV4dCBsb3N0IGZsYWdcbiAgICBjb250ZXh0TG9zdCA9IGZhbHNlXG5cbiAgICAvLyByZWZyZXNoIHN0YXRlXG4gICAgZXh0ZW5zaW9uU3RhdGUucmVzdG9yZSgpXG4gICAgc2hhZGVyU3RhdGUucmVzdG9yZSgpXG4gICAgYnVmZmVyU3RhdGUucmVzdG9yZSgpXG4gICAgdGV4dHVyZVN0YXRlLnJlc3RvcmUoKVxuICAgIHJlbmRlcmJ1ZmZlclN0YXRlLnJlc3RvcmUoKVxuICAgIGZyYW1lYnVmZmVyU3RhdGUucmVzdG9yZSgpXG4gICAgaWYgKHRpbWVyKSB7XG4gICAgICB0aW1lci5yZXN0b3JlKClcbiAgICB9XG5cbiAgICAvLyByZWZyZXNoIHN0YXRlXG4gICAgY29yZS5wcm9jcy5yZWZyZXNoKClcblxuICAgIC8vIHJlc3RhcnQgUkFGXG4gICAgc3RhcnRSQUYoKVxuXG4gICAgLy8gcmVzdG9yZSBjb250ZXh0XG4gICAgcmVzdG9yZUNhbGxiYWNrcy5mb3JFYWNoKGZ1bmN0aW9uIChjYikge1xuICAgICAgY2IoKVxuICAgIH0pXG4gIH1cblxuICBpZiAoY2FudmFzKSB7XG4gICAgY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoQ09OVEVYVF9MT1NUX0VWRU5ULCBoYW5kbGVDb250ZXh0TG9zcywgZmFsc2UpXG4gICAgY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoQ09OVEVYVF9SRVNUT1JFRF9FVkVOVCwgaGFuZGxlQ29udGV4dFJlc3RvcmVkLCBmYWxzZSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3kgKCkge1xuICAgIHJhZkNhbGxiYWNrcy5sZW5ndGggPSAwXG4gICAgc3RvcFJBRigpXG5cbiAgICBpZiAoY2FudmFzKSB7XG4gICAgICBjYW52YXMucmVtb3ZlRXZlbnRMaXN0ZW5lcihDT05URVhUX0xPU1RfRVZFTlQsIGhhbmRsZUNvbnRleHRMb3NzKVxuICAgICAgY2FudmFzLnJlbW92ZUV2ZW50TGlzdGVuZXIoQ09OVEVYVF9SRVNUT1JFRF9FVkVOVCwgaGFuZGxlQ29udGV4dFJlc3RvcmVkKVxuICAgIH1cblxuICAgIHNoYWRlclN0YXRlLmNsZWFyKClcbiAgICBmcmFtZWJ1ZmZlclN0YXRlLmNsZWFyKClcbiAgICByZW5kZXJidWZmZXJTdGF0ZS5jbGVhcigpXG4gICAgdGV4dHVyZVN0YXRlLmNsZWFyKClcbiAgICBlbGVtZW50U3RhdGUuY2xlYXIoKVxuICAgIGJ1ZmZlclN0YXRlLmNsZWFyKClcblxuICAgIGlmICh0aW1lcikge1xuICAgICAgdGltZXIuY2xlYXIoKVxuICAgIH1cblxuICAgIGRlc3Ryb3lDYWxsYmFja3MuZm9yRWFjaChmdW5jdGlvbiAoY2IpIHtcbiAgICAgIGNiKClcbiAgICB9KVxuICB9XG5cbiAgZnVuY3Rpb24gY29tcGlsZVByb2NlZHVyZSAob3B0aW9ucykge1xuICAgIFxuICAgIFxuXG4gICAgZnVuY3Rpb24gZmxhdHRlbk5lc3RlZE9wdGlvbnMgKG9wdGlvbnMpIHtcbiAgICAgIHZhciByZXN1bHQgPSBleHRlbmQoe30sIG9wdGlvbnMpXG4gICAgICBkZWxldGUgcmVzdWx0LnVuaWZvcm1zXG4gICAgICBkZWxldGUgcmVzdWx0LmF0dHJpYnV0ZXNcbiAgICAgIGRlbGV0ZSByZXN1bHQuY29udGV4dFxuXG4gICAgICBpZiAoJ3N0ZW5jaWwnIGluIHJlc3VsdCAmJiByZXN1bHQuc3RlbmNpbC5vcCkge1xuICAgICAgICByZXN1bHQuc3RlbmNpbC5vcEJhY2sgPSByZXN1bHQuc3RlbmNpbC5vcEZyb250ID0gcmVzdWx0LnN0ZW5jaWwub3BcbiAgICAgICAgZGVsZXRlIHJlc3VsdC5zdGVuY2lsLm9wXG4gICAgICB9XG5cbiAgICAgIGZ1bmN0aW9uIG1lcmdlIChuYW1lKSB7XG4gICAgICAgIGlmIChuYW1lIGluIHJlc3VsdCkge1xuICAgICAgICAgIHZhciBjaGlsZCA9IHJlc3VsdFtuYW1lXVxuICAgICAgICAgIGRlbGV0ZSByZXN1bHRbbmFtZV1cbiAgICAgICAgICBPYmplY3Qua2V5cyhjaGlsZCkuZm9yRWFjaChmdW5jdGlvbiAocHJvcCkge1xuICAgICAgICAgICAgcmVzdWx0W25hbWUgKyAnLicgKyBwcm9wXSA9IGNoaWxkW3Byb3BdXG4gICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgbWVyZ2UoJ2JsZW5kJylcbiAgICAgIG1lcmdlKCdkZXB0aCcpXG4gICAgICBtZXJnZSgnY3VsbCcpXG4gICAgICBtZXJnZSgnc3RlbmNpbCcpXG4gICAgICBtZXJnZSgncG9seWdvbk9mZnNldCcpXG4gICAgICBtZXJnZSgnc2Npc3NvcicpXG4gICAgICBtZXJnZSgnc2FtcGxlJylcblxuICAgICAgcmV0dXJuIHJlc3VsdFxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHNlcGFyYXRlRHluYW1pYyAob2JqZWN0KSB7XG4gICAgICB2YXIgc3RhdGljSXRlbXMgPSB7fVxuICAgICAgdmFyIGR5bmFtaWNJdGVtcyA9IHt9XG4gICAgICBPYmplY3Qua2V5cyhvYmplY3QpLmZvckVhY2goZnVuY3Rpb24gKG9wdGlvbikge1xuICAgICAgICB2YXIgdmFsdWUgPSBvYmplY3Rbb3B0aW9uXVxuICAgICAgICBpZiAoZHluYW1pYy5pc0R5bmFtaWModmFsdWUpKSB7XG4gICAgICAgICAgZHluYW1pY0l0ZW1zW29wdGlvbl0gPSBkeW5hbWljLnVuYm94KHZhbHVlLCBvcHRpb24pXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc3RhdGljSXRlbXNbb3B0aW9uXSA9IHZhbHVlXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICByZXR1cm4ge1xuICAgICAgICBkeW5hbWljOiBkeW5hbWljSXRlbXMsXG4gICAgICAgIHN0YXRpYzogc3RhdGljSXRlbXNcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBUcmVhdCBjb250ZXh0IHZhcmlhYmxlcyBzZXBhcmF0ZSBmcm9tIG90aGVyIGR5bmFtaWMgdmFyaWFibGVzXG4gICAgdmFyIGNvbnRleHQgPSBzZXBhcmF0ZUR5bmFtaWMob3B0aW9ucy5jb250ZXh0IHx8IHt9KVxuICAgIHZhciB1bmlmb3JtcyA9IHNlcGFyYXRlRHluYW1pYyhvcHRpb25zLnVuaWZvcm1zIHx8IHt9KVxuICAgIHZhciBhdHRyaWJ1dGVzID0gc2VwYXJhdGVEeW5hbWljKG9wdGlvbnMuYXR0cmlidXRlcyB8fCB7fSlcbiAgICB2YXIgb3B0cyA9IHNlcGFyYXRlRHluYW1pYyhmbGF0dGVuTmVzdGVkT3B0aW9ucyhvcHRpb25zKSlcblxuICAgIHZhciBzdGF0cyA9IHtcbiAgICAgIGdwdVRpbWU6IDAuMCxcbiAgICAgIGNwdVRpbWU6IDAuMCxcbiAgICAgIGNvdW50OiAwXG4gICAgfVxuXG4gICAgdmFyIGNvbXBpbGVkID0gY29yZS5jb21waWxlKG9wdHMsIGF0dHJpYnV0ZXMsIHVuaWZvcm1zLCBjb250ZXh0LCBzdGF0cylcblxuICAgIHZhciBkcmF3ID0gY29tcGlsZWQuZHJhd1xuICAgIHZhciBiYXRjaCA9IGNvbXBpbGVkLmJhdGNoXG4gICAgdmFyIHNjb3BlID0gY29tcGlsZWQuc2NvcGVcblxuICAgIC8vIEZJWE1FOiB3ZSBzaG91bGQgbW9kaWZ5IGNvZGUgZ2VuZXJhdGlvbiBmb3IgYmF0Y2ggY29tbWFuZHMgc28gdGhpc1xuICAgIC8vIGlzbid0IG5lY2Vzc2FyeVxuICAgIHZhciBFTVBUWV9BUlJBWSA9IFtdXG4gICAgZnVuY3Rpb24gcmVzZXJ2ZSAoY291bnQpIHtcbiAgICAgIHdoaWxlIChFTVBUWV9BUlJBWS5sZW5ndGggPCBjb3VudCkge1xuICAgICAgICBFTVBUWV9BUlJBWS5wdXNoKG51bGwpXG4gICAgICB9XG4gICAgICByZXR1cm4gRU1QVFlfQVJSQVlcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBSRUdMQ29tbWFuZCAoYXJncywgYm9keSkge1xuICAgICAgdmFyIGlcbiAgICAgIGlmIChjb250ZXh0TG9zdCkge1xuICAgICAgICBcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlb2YgYXJncyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICByZXR1cm4gc2NvcGUuY2FsbCh0aGlzLCBudWxsLCBhcmdzLCAwKVxuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgYm9keSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBpZiAodHlwZW9mIGFyZ3MgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgZm9yIChpID0gMDsgaSA8IGFyZ3M7ICsraSkge1xuICAgICAgICAgICAgc2NvcGUuY2FsbCh0aGlzLCBudWxsLCBib2R5LCBpKVxuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGFyZ3MpKSB7XG4gICAgICAgICAgZm9yIChpID0gMDsgaSA8IGFyZ3MubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICAgIHNjb3BlLmNhbGwodGhpcywgYXJnc1tpXSwgYm9keSwgaSlcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIHNjb3BlLmNhbGwodGhpcywgYXJncywgYm9keSwgMClcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgYXJncyA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgaWYgKGFyZ3MgPiAwKSB7XG4gICAgICAgICAgcmV0dXJuIGJhdGNoLmNhbGwodGhpcywgcmVzZXJ2ZShhcmdzIHwgMCksIGFyZ3MgfCAwKVxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoYXJncykpIHtcbiAgICAgICAgaWYgKGFyZ3MubGVuZ3RoKSB7XG4gICAgICAgICAgcmV0dXJuIGJhdGNoLmNhbGwodGhpcywgYXJncywgYXJncy5sZW5ndGgpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBkcmF3LmNhbGwodGhpcywgYXJncylcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gZXh0ZW5kKFJFR0xDb21tYW5kLCB7XG4gICAgICBzdGF0czogc3RhdHNcbiAgICB9KVxuICB9XG5cbiAgZnVuY3Rpb24gY2xlYXIgKG9wdGlvbnMpIHtcbiAgICBcblxuICAgIHZhciBjbGVhckZsYWdzID0gMFxuICAgIGNvcmUucHJvY3MucG9sbCgpXG5cbiAgICB2YXIgYyA9IG9wdGlvbnMuY29sb3JcbiAgICBpZiAoYykge1xuICAgICAgZ2wuY2xlYXJDb2xvcigrY1swXSB8fCAwLCArY1sxXSB8fCAwLCArY1syXSB8fCAwLCArY1szXSB8fCAwKVxuICAgICAgY2xlYXJGbGFncyB8PSBHTF9DT0xPUl9CVUZGRVJfQklUXG4gICAgfVxuICAgIGlmICgnZGVwdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgIGdsLmNsZWFyRGVwdGgoK29wdGlvbnMuZGVwdGgpXG4gICAgICBjbGVhckZsYWdzIHw9IEdMX0RFUFRIX0JVRkZFUl9CSVRcbiAgICB9XG4gICAgaWYgKCdzdGVuY2lsJyBpbiBvcHRpb25zKSB7XG4gICAgICBnbC5jbGVhclN0ZW5jaWwob3B0aW9ucy5zdGVuY2lsIHwgMClcbiAgICAgIGNsZWFyRmxhZ3MgfD0gR0xfU1RFTkNJTF9CVUZGRVJfQklUXG4gICAgfVxuXG4gICAgXG4gICAgZ2wuY2xlYXIoY2xlYXJGbGFncylcbiAgfVxuXG4gIGZ1bmN0aW9uIGZyYW1lIChjYikge1xuICAgIFxuICAgIHJhZkNhbGxiYWNrcy5wdXNoKGNiKVxuXG4gICAgZnVuY3Rpb24gY2FuY2VsICgpIHtcbiAgICAgIC8vIEZJWE1FOiAgc2hvdWxkIHdlIGNoZWNrIHNvbWV0aGluZyBvdGhlciB0aGFuIGVxdWFscyBjYiBoZXJlP1xuICAgICAgLy8gd2hhdCBpZiBhIHVzZXIgY2FsbHMgZnJhbWUgdHdpY2Ugd2l0aCB0aGUgc2FtZSBjYWxsYmFjay4uLlxuICAgICAgLy9cbiAgICAgIHZhciBpID0gZmluZChyYWZDYWxsYmFja3MsIGNiKVxuICAgICAgXG4gICAgICBmdW5jdGlvbiBwZW5kaW5nQ2FuY2VsICgpIHtcbiAgICAgICAgdmFyIGluZGV4ID0gZmluZChyYWZDYWxsYmFja3MsIHBlbmRpbmdDYW5jZWwpXG4gICAgICAgIHJhZkNhbGxiYWNrc1tpbmRleF0gPSByYWZDYWxsYmFja3NbcmFmQ2FsbGJhY2tzLmxlbmd0aCAtIDFdXG4gICAgICAgIHJhZkNhbGxiYWNrcy5sZW5ndGggLT0gMVxuICAgICAgICBpZiAocmFmQ2FsbGJhY2tzLmxlbmd0aCA8PSAwKSB7XG4gICAgICAgICAgc3RvcFJBRigpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJhZkNhbGxiYWNrc1tpXSA9IHBlbmRpbmdDYW5jZWxcbiAgICB9XG5cbiAgICBzdGFydFJBRigpXG5cbiAgICByZXR1cm4ge1xuICAgICAgY2FuY2VsOiBjYW5jZWxcbiAgICB9XG4gIH1cblxuICAvLyBwb2xsIHZpZXdwb3J0XG4gIGZ1bmN0aW9uIHBvbGxWaWV3cG9ydCAoKSB7XG4gICAgdmFyIHZpZXdwb3J0ID0gbmV4dFN0YXRlLnZpZXdwb3J0XG4gICAgdmFyIHNjaXNzb3JCb3ggPSBuZXh0U3RhdGUuc2Npc3Nvcl9ib3hcbiAgICB2aWV3cG9ydFswXSA9IHZpZXdwb3J0WzFdID0gc2Npc3NvckJveFswXSA9IHNjaXNzb3JCb3hbMV0gPSAwXG4gICAgY29udGV4dFN0YXRlLnZpZXdwb3J0V2lkdGggPVxuICAgICAgY29udGV4dFN0YXRlLmZyYW1lYnVmZmVyV2lkdGggPVxuICAgICAgY29udGV4dFN0YXRlLmRyYXdpbmdCdWZmZXJXaWR0aCA9XG4gICAgICB2aWV3cG9ydFsyXSA9XG4gICAgICBzY2lzc29yQm94WzJdID0gZ2wuZHJhd2luZ0J1ZmZlcldpZHRoXG4gICAgY29udGV4dFN0YXRlLnZpZXdwb3J0SGVpZ2h0ID1cbiAgICAgIGNvbnRleHRTdGF0ZS5mcmFtZWJ1ZmZlckhlaWdodCA9XG4gICAgICBjb250ZXh0U3RhdGUuZHJhd2luZ0J1ZmZlckhlaWdodCA9XG4gICAgICB2aWV3cG9ydFszXSA9XG4gICAgICBzY2lzc29yQm94WzNdID0gZ2wuZHJhd2luZ0J1ZmZlckhlaWdodFxuICB9XG5cbiAgZnVuY3Rpb24gcG9sbCAoKSB7XG4gICAgY29udGV4dFN0YXRlLnRpY2sgKz0gMVxuICAgIGNvbnRleHRTdGF0ZS50aW1lID0gbm93KClcbiAgICBwb2xsVmlld3BvcnQoKVxuICAgIGNvcmUucHJvY3MucG9sbCgpXG4gIH1cblxuICBmdW5jdGlvbiByZWZyZXNoICgpIHtcbiAgICBwb2xsVmlld3BvcnQoKVxuICAgIGNvcmUucHJvY3MucmVmcmVzaCgpXG4gICAgaWYgKHRpbWVyKSB7XG4gICAgICB0aW1lci51cGRhdGUoKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIG5vdyAoKSB7XG4gICAgcmV0dXJuIChjbG9jaygpIC0gU1RBUlRfVElNRSkgLyAxMDAwLjBcbiAgfVxuXG4gIHJlZnJlc2goKVxuXG4gIGZ1bmN0aW9uIGFkZExpc3RlbmVyIChldmVudCwgY2FsbGJhY2spIHtcbiAgICBcblxuICAgIHZhciBjYWxsYmFja3NcbiAgICBzd2l0Y2ggKGV2ZW50KSB7XG4gICAgICBjYXNlICdmcmFtZSc6XG4gICAgICAgIHJldHVybiBmcmFtZShjYWxsYmFjaylcbiAgICAgIGNhc2UgJ2xvc3QnOlxuICAgICAgICBjYWxsYmFja3MgPSBsb3NzQ2FsbGJhY2tzXG4gICAgICAgIGJyZWFrXG4gICAgICBjYXNlICdyZXN0b3JlJzpcbiAgICAgICAgY2FsbGJhY2tzID0gcmVzdG9yZUNhbGxiYWNrc1xuICAgICAgICBicmVha1xuICAgICAgY2FzZSAnZGVzdHJveSc6XG4gICAgICAgIGNhbGxiYWNrcyA9IGRlc3Ryb3lDYWxsYmFja3NcbiAgICAgICAgYnJlYWtcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIFxuICAgIH1cblxuICAgIGNhbGxiYWNrcy5wdXNoKGNhbGxiYWNrKVxuICAgIHJldHVybiB7XG4gICAgICBjYW5jZWw6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjYWxsYmFja3MubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICBpZiAoY2FsbGJhY2tzW2ldID09PSBjYWxsYmFjaykge1xuICAgICAgICAgICAgY2FsbGJhY2tzW2ldID0gY2FsbGJhY2tzW2NhbGxiYWNrcy5sZW5ndGggLSAxXVxuICAgICAgICAgICAgY2FsbGJhY2tzLnBvcCgpXG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICB2YXIgcmVnbCA9IGV4dGVuZChjb21waWxlUHJvY2VkdXJlLCB7XG4gICAgLy8gQ2xlYXIgY3VycmVudCBGQk9cbiAgICBjbGVhcjogY2xlYXIsXG5cbiAgICAvLyBTaG9ydCBjdXRzIGZvciBkeW5hbWljIHZhcmlhYmxlc1xuICAgIHByb3A6IGR5bmFtaWMuZGVmaW5lLmJpbmQobnVsbCwgRFlOX1BST1ApLFxuICAgIGNvbnRleHQ6IGR5bmFtaWMuZGVmaW5lLmJpbmQobnVsbCwgRFlOX0NPTlRFWFQpLFxuICAgIHRoaXM6IGR5bmFtaWMuZGVmaW5lLmJpbmQobnVsbCwgRFlOX1NUQVRFKSxcblxuICAgIC8vIGV4ZWN1dGVzIGFuIGVtcHR5IGRyYXcgY29tbWFuZFxuICAgIGRyYXc6IGNvbXBpbGVQcm9jZWR1cmUoe30pLFxuXG4gICAgLy8gUmVzb3VyY2VzXG4gICAgYnVmZmVyOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgcmV0dXJuIGJ1ZmZlclN0YXRlLmNyZWF0ZShvcHRpb25zLCBHTF9BUlJBWV9CVUZGRVIsIGZhbHNlLCBmYWxzZSlcbiAgICB9LFxuICAgIGVsZW1lbnRzOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgcmV0dXJuIGVsZW1lbnRTdGF0ZS5jcmVhdGUob3B0aW9ucywgZmFsc2UpXG4gICAgfSxcbiAgICB0ZXh0dXJlOiB0ZXh0dXJlU3RhdGUuY3JlYXRlMkQsXG4gICAgY3ViZTogdGV4dHVyZVN0YXRlLmNyZWF0ZUN1YmUsXG4gICAgcmVuZGVyYnVmZmVyOiByZW5kZXJidWZmZXJTdGF0ZS5jcmVhdGUsXG4gICAgZnJhbWVidWZmZXI6IGZyYW1lYnVmZmVyU3RhdGUuY3JlYXRlLFxuICAgIGZyYW1lYnVmZmVyQ3ViZTogZnJhbWVidWZmZXJTdGF0ZS5jcmVhdGVDdWJlLFxuXG4gICAgLy8gRXhwb3NlIGNvbnRleHQgYXR0cmlidXRlc1xuICAgIGF0dHJpYnV0ZXM6IGdsQXR0cmlidXRlcyxcblxuICAgIC8vIEZyYW1lIHJlbmRlcmluZ1xuICAgIGZyYW1lOiBmcmFtZSxcbiAgICBvbjogYWRkTGlzdGVuZXIsXG5cbiAgICAvLyBTeXN0ZW0gbGltaXRzXG4gICAgbGltaXRzOiBsaW1pdHMsXG4gICAgaGFzRXh0ZW5zaW9uOiBmdW5jdGlvbiAobmFtZSkge1xuICAgICAgcmV0dXJuIGxpbWl0cy5leHRlbnNpb25zLmluZGV4T2YobmFtZS50b0xvd2VyQ2FzZSgpKSA+PSAwXG4gICAgfSxcblxuICAgIC8vIFJlYWQgcGl4ZWxzXG4gICAgcmVhZDogcmVhZFBpeGVscyxcblxuICAgIC8vIERlc3Ryb3kgcmVnbCBhbmQgYWxsIGFzc29jaWF0ZWQgcmVzb3VyY2VzXG4gICAgZGVzdHJveTogZGVzdHJveSxcblxuICAgIC8vIERpcmVjdCBHTCBzdGF0ZSBtYW5pcHVsYXRpb25cbiAgICBfZ2w6IGdsLFxuICAgIF9yZWZyZXNoOiByZWZyZXNoLFxuXG4gICAgcG9sbDogZnVuY3Rpb24gKCkge1xuICAgICAgcG9sbCgpXG4gICAgICBpZiAodGltZXIpIHtcbiAgICAgICAgdGltZXIudXBkYXRlKClcbiAgICAgIH1cbiAgICB9LFxuXG4gICAgLy8gQ3VycmVudCB0aW1lXG4gICAgbm93OiBub3csXG5cbiAgICAvLyByZWdsIFN0YXRpc3RpY3MgSW5mb3JtYXRpb25cbiAgICBzdGF0czogc3RhdHNcbiAgfSlcblxuICBjb25maWcub25Eb25lKG51bGwsIHJlZ2wpXG5cbiAgcmV0dXJuIHJlZ2xcbn1cbiJdfQ==
