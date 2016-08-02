(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*
  <p>This example implements the game of life in regl.</p>

 */

const regl = require('../regl')()

const RADIUS = 512
const INITIAL_CONDITIONS = (Array(RADIUS * RADIUS * 4)).fill(0).map(
  () => Math.random() > 0.9 ? 255 : 0)

const state = (Array(2)).fill().map(() =>
  regl.framebuffer({
    color: regl.texture({
      radius: RADIUS,
      data: INITIAL_CONDITIONS,
      wrap: 'repeat'
    }),
    depthStencil: false
  }))

const updateLife = regl({
  frag: `
  precision mediump float;
  uniform sampler2D prevState;
  varying vec2 uv;
  void main() {
    float n = 0.0;
    for(int dx=-1; dx<=1; ++dx)
    for(int dy=-1; dy<=1; ++dy) {
      n += texture2D(prevState, uv+vec2(dx,dy)/float(${RADIUS})).r;
    }
    float s = texture2D(prevState, uv).r;
    if(n > 3.0+s || n < 3.0) {
      gl_FragColor = vec4(0,0,0,1);
    } else {
      gl_FragColor = vec4(1,1,1,1);
    }
  }`,

  framebuffer: ({tick}) => state[(tick + 1) % 2]
})

const setupQuad = regl({
  frag: `
  precision mediump float;
  uniform sampler2D prevState;
  varying vec2 uv;
  void main() {
    float state = texture2D(prevState, uv).r;
    gl_FragColor = vec4(vec3(state), 1);
  }`,

  vert: `
  precision mediump float;
  attribute vec2 position;
  varying vec2 uv;
  void main() {
    uv = 0.5 * (position + 1.0);
    gl_Position = vec4(position, 0, 1);
  }`,

  attributes: {
    position: [ -4, -4, 4, -4, 0, 4 ]
  },

  uniforms: {
    prevState: ({tick}) => state[tick % 2]
  },

  depth: { enable: false },

  count: 3
})

regl.frame(() => {
  setupQuad(() => {
    regl.draw()
    updateLife()
  })
})

},{"../regl":33}],2:[function(require,module,exports){
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
    initBufferFromData(buffer, data, GL_STREAM_DRAW, 0, 1)
    return buffer
  }

  function destroyStream (stream) {
    streamPool.push(stream)
  }

  function initBufferFromTypedArray (buffer, data, usage) {
    buffer.byteLength = data.byteLength
    gl.bufferData(buffer.type, data, usage)
  }

  function initBufferFromData (buffer, data, usage, dtype, dimension) {
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
          pool.freeType(flatData)
        } else if (typeof data[0] === 'number') {
          buffer.dimension = dimension
          var typedData = pool.allocType(buffer.dtype, data.length)
          copyArray(typedData, data)
          initBufferFromTypedArray(buffer, typedData, usage)
          pool.freeType(typedData)
        } else if (isTypedArray(data[0])) {
          buffer.dimension = data[0].length
          buffer.dtype = dtype || typedArrayCode(data[0]) || GL_FLOAT
          flatData = pool.allocType(
            buffer.dtype,
            data.length * buffer.dimension)
          flatten(flatData, data, buffer.dimension)
          initBufferFromTypedArray(buffer, flatData, usage)
          pool.freeType(flatData)
        } else {
          
        }
      }
    } else if (isTypedArray(data)) {
      buffer.dtype = dtype || typedArrayCode(data)
      buffer.dimension = dimension
      initBufferFromTypedArray(buffer, data, usage)
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
      pool.freeType(transposeData)
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

  function createBuffer (options, type, deferInit) {
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
        initBufferFromData(buffer, data, usage, dtype, dimension)
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

  function parseFramebuffer (options) {
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

  function parseViewportScissor (options, framebuffer) {
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

  function parseDraw (options) {
    var staticOptions = options.static
    var dynamicOptions = options.dynamic

    function parseElements () {
      if (S_ELEMENTS in staticOptions) {
        var elements = staticOptions[S_ELEMENTS]
        if (isBufferArgs(elements)) {
          elements = elementState.getElements(elementState.create(elements))
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

  function parseGLState (options) {
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

                

                return scope.def(BLEND_FUNCS, '[', func, ']')
              }

              var SRC_RGB = read('src', 'RGB')
              var SRC_ALPHA = read('src', 'Alpha')
              var DST_RGB = read('dst', 'RGB')
              var DST_ALPHA = read('dst', 'Alpha')

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
              var pass = value.pass || 'keep'
              
              
              
              return [
                prop === S_STENCIL_OPBACK ? GL_BACK : GL_FRONT,
                stencilOps[fail],
                stencilOps[zfail],
                stencilOps[pass]
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
                read('pass')
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

  function parseOptions (options) {
    var staticOptions = options.static
    var dynamicOptions = options.dynamic

    

    var framebuffer = parseFramebuffer(options)
    var viewportAndScissor = parseViewportScissor(options, framebuffer)
    var draw = parseDraw(options)
    var state = parseGLState(options)
    var shader = parseProgram(options)

    function copyBox (name) {
      var defn = viewportAndScissor[name]
      if (defn) {
        state[name] = defn
      }
    }
    copyBox(S_VIEWPORT)
    copyBox(propName(S_SCISSOR_BOX))

    var dirty = Object.keys(state).length > 0

    return {
      framebuffer: framebuffer,
      draw: draw,
      shader: shader,
      state: state,
      dirty: dirty
    }
  }

  function parseUniforms (uniforms) {
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

  function parseAttributes (attributes) {
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
          bufferState.create(value, GL_ARRAY_BUFFER, false))
        record.type = record.buffer.dtype
      } else {
        var buffer = bufferState.getBuffer(value)
        if (buffer) {
          record.state = ATTRIB_STATE_POINTER
          record.buffer = buffer
          record.type = buffer.dtype
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
            buffer = bufferState.getBuffer(value.buffer)
            

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
          BUFFER, '=', BUFFER_STATE, '.getBuffer(', VALUE, '.buffer);',
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

  function parseArguments (options, attributes, uniforms, context) {
    var result = parseOptions(options)

    result.profile = parseProfile(options)
    result.uniforms = parseUniforms(uniforms)
    result.attributes = parseAttributes(attributes)
    result.context = parseContext(context)
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
    if (extInstancing && !env.instancing) {
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

    var args = parseArguments(options, attributes, uniforms, context)

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

      // FIXME: refresh should update vertex attribute pointers

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
        true)._buffer)
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

  function createElements (options) {
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
    extensions: extensions
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
    }
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

  return {
    create: createRenderbuffer,
    clear: function () {
      values(renderbufferSet).forEach(destroy)
    }
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

    shader: getShader,

    frag: null,
    vert: null
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
    'nearest mipmap nearest': GL_NEAREST_MIPMAP_NEAREST,
    'linear mipmap nearest': GL_LINEAR_MIPMAP_NEAREST,
    'nearest mipmap linear': GL_NEAREST_MIPMAP_LINEAR,
    'linear mipmap linear': GL_LINEAR_MIPMAP_LINEAR,
    'mipmap': GL_LINEAR_MIPMAP_LINEAR
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

  var infoPool = []

  function allocInfo () {
    var result = infoPool.pop() || new TexInfo()
    TexInfo.call(result)
    return result
  }

  function freeInfo (info) {
    infoPool.push(info)
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
      var texInfo = allocInfo()
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

      freeInfo(texInfo)
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
      var texInfo = allocInfo()
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

      freeInfo(texInfo)

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

  return {
    create2D: createTexture2D,
    createCube: createTextureCube,
    clear: destroyTextures,
    getTexture: function (wrapper) {
      return null
    }
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
    // TODO
  }

  function handleContextRestored (event) {
    // TODO
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

    config.onDestroy()
  }

  function compileProcedure (options) {
    
    

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
    contextState.time = (clock() - START_TIME) / 1000.0
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

  refresh()

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
      return bufferState.create(options, GL_ARRAY_BUFFER)
    },
    elements: elementState.create,
    texture: textureState.create2D,
    cube: textureState.createCube,
    renderbuffer: renderbufferState.create,
    framebuffer: framebufferState.create,
    framebufferCube: framebufferState.createCube,

    // Expose context attributes
    attributes: glAttributes,

    // Frame rendering
    frame: frame,

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

    // regl Statistics Information
    stats: stats
  })

  config.onDone(null, regl)

  return regl
}

},{"./lib/attribute":2,"./lib/buffer":3,"./lib/core":8,"./lib/dynamic":9,"./lib/elements":10,"./lib/extension":11,"./lib/framebuffer":12,"./lib/limits":13,"./lib/read":14,"./lib/renderbuffer":15,"./lib/shader":16,"./lib/stats":17,"./lib/strings":18,"./lib/texture":19,"./lib/timer":20,"./lib/util/clock":21,"./lib/util/extend":23,"./lib/util/raf":29,"./lib/webgl":32}]},{},[1])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJleGFtcGxlL2xpZmUuanMiLCJsaWIvYXR0cmlidXRlLmpzIiwibGliL2J1ZmZlci5qcyIsImxpYi9jb25zdGFudHMvYXJyYXl0eXBlcy5qc29uIiwibGliL2NvbnN0YW50cy9kdHlwZXMuanNvbiIsImxpYi9jb25zdGFudHMvcHJpbWl0aXZlcy5qc29uIiwibGliL2NvbnN0YW50cy91c2FnZS5qc29uIiwibGliL2NvcmUuanMiLCJsaWIvZHluYW1pYy5qcyIsImxpYi9lbGVtZW50cy5qcyIsImxpYi9leHRlbnNpb24uanMiLCJsaWIvZnJhbWVidWZmZXIuanMiLCJsaWIvbGltaXRzLmpzIiwibGliL3JlYWQuanMiLCJsaWIvcmVuZGVyYnVmZmVyLmpzIiwibGliL3NoYWRlci5qcyIsImxpYi9zdGF0cy5qcyIsImxpYi9zdHJpbmdzLmpzIiwibGliL3RleHR1cmUuanMiLCJsaWIvdGltZXIuanMiLCJsaWIvdXRpbC9jbG9jay5qcyIsImxpYi91dGlsL2NvZGVnZW4uanMiLCJsaWIvdXRpbC9leHRlbmQuanMiLCJsaWIvdXRpbC9pcy1hcnJheS1saWtlLmpzIiwibGliL3V0aWwvaXMtbmRhcnJheS5qcyIsImxpYi91dGlsL2lzLXR5cGVkLWFycmF5LmpzIiwibGliL3V0aWwvbG9vcC5qcyIsImxpYi91dGlsL3Bvb2wuanMiLCJsaWIvdXRpbC9yYWYuanMiLCJsaWIvdXRpbC90by1oYWxmLWZsb2F0LmpzIiwibGliL3V0aWwvdmFsdWVzLmpzIiwibGliL3dlYmdsLmpzIiwicmVnbC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9XQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNaQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxMkZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2UUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5TkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNkQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyK0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0SUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0TEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDYkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVDQTtBQUNBO0FBQ0E7QUFDQTs7QUNIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0TUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKlxuICA8cD5UaGlzIGV4YW1wbGUgaW1wbGVtZW50cyB0aGUgZ2FtZSBvZiBsaWZlIGluIHJlZ2wuPC9wPlxuXG4gKi9cblxuY29uc3QgcmVnbCA9IHJlcXVpcmUoJy4uL3JlZ2wnKSgpXG5cbmNvbnN0IFJBRElVUyA9IDUxMlxuY29uc3QgSU5JVElBTF9DT05ESVRJT05TID0gKEFycmF5KFJBRElVUyAqIFJBRElVUyAqIDQpKS5maWxsKDApLm1hcChcbiAgKCkgPT4gTWF0aC5yYW5kb20oKSA+IDAuOSA/IDI1NSA6IDApXG5cbmNvbnN0IHN0YXRlID0gKEFycmF5KDIpKS5maWxsKCkubWFwKCgpID0+XG4gIHJlZ2wuZnJhbWVidWZmZXIoe1xuICAgIGNvbG9yOiByZWdsLnRleHR1cmUoe1xuICAgICAgcmFkaXVzOiBSQURJVVMsXG4gICAgICBkYXRhOiBJTklUSUFMX0NPTkRJVElPTlMsXG4gICAgICB3cmFwOiAncmVwZWF0J1xuICAgIH0pLFxuICAgIGRlcHRoU3RlbmNpbDogZmFsc2VcbiAgfSkpXG5cbmNvbnN0IHVwZGF0ZUxpZmUgPSByZWdsKHtcbiAgZnJhZzogYFxuICBwcmVjaXNpb24gbWVkaXVtcCBmbG9hdDtcbiAgdW5pZm9ybSBzYW1wbGVyMkQgcHJldlN0YXRlO1xuICB2YXJ5aW5nIHZlYzIgdXY7XG4gIHZvaWQgbWFpbigpIHtcbiAgICBmbG9hdCBuID0gMC4wO1xuICAgIGZvcihpbnQgZHg9LTE7IGR4PD0xOyArK2R4KVxuICAgIGZvcihpbnQgZHk9LTE7IGR5PD0xOyArK2R5KSB7XG4gICAgICBuICs9IHRleHR1cmUyRChwcmV2U3RhdGUsIHV2K3ZlYzIoZHgsZHkpL2Zsb2F0KCR7UkFESVVTfSkpLnI7XG4gICAgfVxuICAgIGZsb2F0IHMgPSB0ZXh0dXJlMkQocHJldlN0YXRlLCB1dikucjtcbiAgICBpZihuID4gMy4wK3MgfHwgbiA8IDMuMCkge1xuICAgICAgZ2xfRnJhZ0NvbG9yID0gdmVjNCgwLDAsMCwxKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZ2xfRnJhZ0NvbG9yID0gdmVjNCgxLDEsMSwxKTtcbiAgICB9XG4gIH1gLFxuXG4gIGZyYW1lYnVmZmVyOiAoe3RpY2t9KSA9PiBzdGF0ZVsodGljayArIDEpICUgMl1cbn0pXG5cbmNvbnN0IHNldHVwUXVhZCA9IHJlZ2woe1xuICBmcmFnOiBgXG4gIHByZWNpc2lvbiBtZWRpdW1wIGZsb2F0O1xuICB1bmlmb3JtIHNhbXBsZXIyRCBwcmV2U3RhdGU7XG4gIHZhcnlpbmcgdmVjMiB1djtcbiAgdm9pZCBtYWluKCkge1xuICAgIGZsb2F0IHN0YXRlID0gdGV4dHVyZTJEKHByZXZTdGF0ZSwgdXYpLnI7XG4gICAgZ2xfRnJhZ0NvbG9yID0gdmVjNCh2ZWMzKHN0YXRlKSwgMSk7XG4gIH1gLFxuXG4gIHZlcnQ6IGBcbiAgcHJlY2lzaW9uIG1lZGl1bXAgZmxvYXQ7XG4gIGF0dHJpYnV0ZSB2ZWMyIHBvc2l0aW9uO1xuICB2YXJ5aW5nIHZlYzIgdXY7XG4gIHZvaWQgbWFpbigpIHtcbiAgICB1diA9IDAuNSAqIChwb3NpdGlvbiArIDEuMCk7XG4gICAgZ2xfUG9zaXRpb24gPSB2ZWM0KHBvc2l0aW9uLCAwLCAxKTtcbiAgfWAsXG5cbiAgYXR0cmlidXRlczoge1xuICAgIHBvc2l0aW9uOiBbIC00LCAtNCwgNCwgLTQsIDAsIDQgXVxuICB9LFxuXG4gIHVuaWZvcm1zOiB7XG4gICAgcHJldlN0YXRlOiAoe3RpY2t9KSA9PiBzdGF0ZVt0aWNrICUgMl1cbiAgfSxcblxuICBkZXB0aDogeyBlbmFibGU6IGZhbHNlIH0sXG5cbiAgY291bnQ6IDNcbn0pXG5cbnJlZ2wuZnJhbWUoKCkgPT4ge1xuICBzZXR1cFF1YWQoKCkgPT4ge1xuICAgIHJlZ2wuZHJhdygpXG4gICAgdXBkYXRlTGlmZSgpXG4gIH0pXG59KVxuIiwidmFyIEdMX0ZMT0FUID0gNTEyNlxuXG5mdW5jdGlvbiBBdHRyaWJ1dGVSZWNvcmQgKCkge1xuICB0aGlzLnN0YXRlID0gMFxuXG4gIHRoaXMueCA9IDAuMFxuICB0aGlzLnkgPSAwLjBcbiAgdGhpcy56ID0gMC4wXG4gIHRoaXMudyA9IDAuMFxuXG4gIHRoaXMuYnVmZmVyID0gbnVsbFxuICB0aGlzLnNpemUgPSAwXG4gIHRoaXMubm9ybWFsaXplZCA9IGZhbHNlXG4gIHRoaXMudHlwZSA9IEdMX0ZMT0FUXG4gIHRoaXMub2Zmc2V0ID0gMFxuICB0aGlzLnN0cmlkZSA9IDBcbiAgdGhpcy5kaXZpc29yID0gMFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBBdHRyaWJ1dGVTdGF0ZSAoXG4gIGdsLFxuICBleHRlbnNpb25zLFxuICBsaW1pdHMsXG4gIGJ1ZmZlclN0YXRlLFxuICBzdHJpbmdTdG9yZSkge1xuICB2YXIgTlVNX0FUVFJJQlVURVMgPSBsaW1pdHMubWF4QXR0cmlidXRlc1xuICB2YXIgYXR0cmlidXRlQmluZGluZ3MgPSBuZXcgQXJyYXkoTlVNX0FUVFJJQlVURVMpXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgTlVNX0FUVFJJQlVURVM7ICsraSkge1xuICAgIGF0dHJpYnV0ZUJpbmRpbmdzW2ldID0gbmV3IEF0dHJpYnV0ZVJlY29yZCgpXG4gIH1cblxuICByZXR1cm4ge1xuICAgIFJlY29yZDogQXR0cmlidXRlUmVjb3JkLFxuICAgIHNjb3BlOiB7fSxcbiAgICBzdGF0ZTogYXR0cmlidXRlQmluZGluZ3NcbiAgfVxufVxuIiwiXG52YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi91dGlsL2lzLXR5cGVkLWFycmF5JylcbnZhciBpc05EQXJyYXlMaWtlID0gcmVxdWlyZSgnLi91dGlsL2lzLW5kYXJyYXknKVxudmFyIHZhbHVlcyA9IHJlcXVpcmUoJy4vdXRpbC92YWx1ZXMnKVxudmFyIHBvb2wgPSByZXF1aXJlKCcuL3V0aWwvcG9vbCcpXG5cbnZhciBhcnJheVR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvYXJyYXl0eXBlcy5qc29uJylcbnZhciBidWZmZXJUeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL2R0eXBlcy5qc29uJylcbnZhciB1c2FnZVR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvdXNhZ2UuanNvbicpXG5cbnZhciBHTF9TVEFUSUNfRFJBVyA9IDB4ODhFNFxudmFyIEdMX1NUUkVBTV9EUkFXID0gMHg4OEUwXG5cbnZhciBHTF9VTlNJR05FRF9CWVRFID0gNTEyMVxudmFyIEdMX0ZMT0FUID0gNTEyNlxuXG52YXIgRFRZUEVTX1NJWkVTID0gW11cbkRUWVBFU19TSVpFU1s1MTIwXSA9IDEgLy8gaW50OFxuRFRZUEVTX1NJWkVTWzUxMjJdID0gMiAvLyBpbnQxNlxuRFRZUEVTX1NJWkVTWzUxMjRdID0gNCAvLyBpbnQzMlxuRFRZUEVTX1NJWkVTWzUxMjFdID0gMSAvLyB1aW50OFxuRFRZUEVTX1NJWkVTWzUxMjNdID0gMiAvLyB1aW50MTZcbkRUWVBFU19TSVpFU1s1MTI1XSA9IDQgLy8gdWludDMyXG5EVFlQRVNfU0laRVNbNTEyNl0gPSA0IC8vIGZsb2F0MzJcblxuZnVuY3Rpb24gdHlwZWRBcnJheUNvZGUgKGRhdGEpIHtcbiAgcmV0dXJuIGFycmF5VHlwZXNbT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGRhdGEpXSB8IDBcbn1cblxuZnVuY3Rpb24gY29weUFycmF5IChvdXQsIGlucCkge1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGlucC5sZW5ndGg7ICsraSkge1xuICAgIG91dFtpXSA9IGlucFtpXVxuICB9XG59XG5cbmZ1bmN0aW9uIHRyYW5zcG9zZSAoXG4gIHJlc3VsdCwgZGF0YSwgc2hhcGVYLCBzaGFwZVksIHN0cmlkZVgsIHN0cmlkZVksIG9mZnNldCkge1xuICB2YXIgcHRyID0gMFxuICBmb3IgKHZhciBpID0gMDsgaSA8IHNoYXBlWDsgKytpKSB7XG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBzaGFwZVk7ICsraikge1xuICAgICAgcmVzdWx0W3B0cisrXSA9IGRhdGFbc3RyaWRlWCAqIGkgKyBzdHJpZGVZICogaiArIG9mZnNldF1cbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gZmxhdHRlbiAocmVzdWx0LCBkYXRhLCBkaW1lbnNpb24pIHtcbiAgdmFyIHB0ciA9IDBcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBkYXRhLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIHYgPSBkYXRhW2ldXG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBkaW1lbnNpb247ICsraikge1xuICAgICAgcmVzdWx0W3B0cisrXSA9IHZbal1cbiAgICB9XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwQnVmZmVyU3RhdGUgKGdsLCBzdGF0cywgY29uZmlnKSB7XG4gIHZhciBidWZmZXJDb3VudCA9IDBcbiAgdmFyIGJ1ZmZlclNldCA9IHt9XG5cbiAgZnVuY3Rpb24gUkVHTEJ1ZmZlciAodHlwZSkge1xuICAgIHRoaXMuaWQgPSBidWZmZXJDb3VudCsrXG4gICAgdGhpcy5idWZmZXIgPSBnbC5jcmVhdGVCdWZmZXIoKVxuICAgIHRoaXMudHlwZSA9IHR5cGVcbiAgICB0aGlzLnVzYWdlID0gR0xfU1RBVElDX0RSQVdcbiAgICB0aGlzLmJ5dGVMZW5ndGggPSAwXG4gICAgdGhpcy5kaW1lbnNpb24gPSAxXG4gICAgdGhpcy5kdHlwZSA9IEdMX1VOU0lHTkVEX0JZVEVcblxuICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgdGhpcy5zdGF0cyA9IHtzaXplOiAwfVxuICAgIH1cbiAgfVxuXG4gIFJFR0xCdWZmZXIucHJvdG90eXBlLmJpbmQgPSBmdW5jdGlvbiAoKSB7XG4gICAgZ2wuYmluZEJ1ZmZlcih0aGlzLnR5cGUsIHRoaXMuYnVmZmVyKVxuICB9XG5cbiAgUkVHTEJ1ZmZlci5wcm90b3R5cGUuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgICBkZXN0cm95KHRoaXMpXG4gIH1cblxuICB2YXIgc3RyZWFtUG9vbCA9IFtdXG5cbiAgZnVuY3Rpb24gY3JlYXRlU3RyZWFtICh0eXBlLCBkYXRhKSB7XG4gICAgdmFyIGJ1ZmZlciA9IHN0cmVhbVBvb2wucG9wKClcbiAgICBpZiAoIWJ1ZmZlcikge1xuICAgICAgYnVmZmVyID0gbmV3IFJFR0xCdWZmZXIodHlwZSlcbiAgICB9XG4gICAgYnVmZmVyLmJpbmQoKVxuICAgIGluaXRCdWZmZXJGcm9tRGF0YShidWZmZXIsIGRhdGEsIEdMX1NUUkVBTV9EUkFXLCAwLCAxKVxuICAgIHJldHVybiBidWZmZXJcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3lTdHJlYW0gKHN0cmVhbSkge1xuICAgIHN0cmVhbVBvb2wucHVzaChzdHJlYW0pXG4gIH1cblxuICBmdW5jdGlvbiBpbml0QnVmZmVyRnJvbVR5cGVkQXJyYXkgKGJ1ZmZlciwgZGF0YSwgdXNhZ2UpIHtcbiAgICBidWZmZXIuYnl0ZUxlbmd0aCA9IGRhdGEuYnl0ZUxlbmd0aFxuICAgIGdsLmJ1ZmZlckRhdGEoYnVmZmVyLnR5cGUsIGRhdGEsIHVzYWdlKVxuICB9XG5cbiAgZnVuY3Rpb24gaW5pdEJ1ZmZlckZyb21EYXRhIChidWZmZXIsIGRhdGEsIHVzYWdlLCBkdHlwZSwgZGltZW5zaW9uKSB7XG4gICAgYnVmZmVyLnVzYWdlID0gdXNhZ2VcbiAgICBpZiAoQXJyYXkuaXNBcnJheShkYXRhKSkge1xuICAgICAgYnVmZmVyLmR0eXBlID0gZHR5cGUgfHwgR0xfRkxPQVRcbiAgICAgIGlmIChkYXRhLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdmFyIGZsYXREYXRhXG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KGRhdGFbMF0pKSB7XG4gICAgICAgICAgYnVmZmVyLmRpbWVuc2lvbiA9IGRhdGFbMF0ubGVuZ3RoXG4gICAgICAgICAgZmxhdERhdGEgPSBwb29sLmFsbG9jVHlwZShcbiAgICAgICAgICAgIGJ1ZmZlci5kdHlwZSxcbiAgICAgICAgICAgIGRhdGEubGVuZ3RoICogYnVmZmVyLmRpbWVuc2lvbilcbiAgICAgICAgICBmbGF0dGVuKGZsYXREYXRhLCBkYXRhLCBidWZmZXIuZGltZW5zaW9uKVxuICAgICAgICAgIGluaXRCdWZmZXJGcm9tVHlwZWRBcnJheShidWZmZXIsIGZsYXREYXRhLCB1c2FnZSlcbiAgICAgICAgICBwb29sLmZyZWVUeXBlKGZsYXREYXRhKVxuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBkYXRhWzBdID09PSAnbnVtYmVyJykge1xuICAgICAgICAgIGJ1ZmZlci5kaW1lbnNpb24gPSBkaW1lbnNpb25cbiAgICAgICAgICB2YXIgdHlwZWREYXRhID0gcG9vbC5hbGxvY1R5cGUoYnVmZmVyLmR0eXBlLCBkYXRhLmxlbmd0aClcbiAgICAgICAgICBjb3B5QXJyYXkodHlwZWREYXRhLCBkYXRhKVxuICAgICAgICAgIGluaXRCdWZmZXJGcm9tVHlwZWRBcnJheShidWZmZXIsIHR5cGVkRGF0YSwgdXNhZ2UpXG4gICAgICAgICAgcG9vbC5mcmVlVHlwZSh0eXBlZERhdGEpXG4gICAgICAgIH0gZWxzZSBpZiAoaXNUeXBlZEFycmF5KGRhdGFbMF0pKSB7XG4gICAgICAgICAgYnVmZmVyLmRpbWVuc2lvbiA9IGRhdGFbMF0ubGVuZ3RoXG4gICAgICAgICAgYnVmZmVyLmR0eXBlID0gZHR5cGUgfHwgdHlwZWRBcnJheUNvZGUoZGF0YVswXSkgfHwgR0xfRkxPQVRcbiAgICAgICAgICBmbGF0RGF0YSA9IHBvb2wuYWxsb2NUeXBlKFxuICAgICAgICAgICAgYnVmZmVyLmR0eXBlLFxuICAgICAgICAgICAgZGF0YS5sZW5ndGggKiBidWZmZXIuZGltZW5zaW9uKVxuICAgICAgICAgIGZsYXR0ZW4oZmxhdERhdGEsIGRhdGEsIGJ1ZmZlci5kaW1lbnNpb24pXG4gICAgICAgICAgaW5pdEJ1ZmZlckZyb21UeXBlZEFycmF5KGJ1ZmZlciwgZmxhdERhdGEsIHVzYWdlKVxuICAgICAgICAgIHBvb2wuZnJlZVR5cGUoZmxhdERhdGEpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGlzVHlwZWRBcnJheShkYXRhKSkge1xuICAgICAgYnVmZmVyLmR0eXBlID0gZHR5cGUgfHwgdHlwZWRBcnJheUNvZGUoZGF0YSlcbiAgICAgIGJ1ZmZlci5kaW1lbnNpb24gPSBkaW1lbnNpb25cbiAgICAgIGluaXRCdWZmZXJGcm9tVHlwZWRBcnJheShidWZmZXIsIGRhdGEsIHVzYWdlKVxuICAgIH0gZWxzZSBpZiAoaXNOREFycmF5TGlrZShkYXRhKSkge1xuICAgICAgdmFyIHNoYXBlID0gZGF0YS5zaGFwZVxuICAgICAgdmFyIHN0cmlkZSA9IGRhdGEuc3RyaWRlXG4gICAgICB2YXIgb2Zmc2V0ID0gZGF0YS5vZmZzZXRcblxuICAgICAgdmFyIHNoYXBlWCA9IDBcbiAgICAgIHZhciBzaGFwZVkgPSAwXG4gICAgICB2YXIgc3RyaWRlWCA9IDBcbiAgICAgIHZhciBzdHJpZGVZID0gMFxuICAgICAgaWYgKHNoYXBlLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICBzaGFwZVggPSBzaGFwZVswXVxuICAgICAgICBzaGFwZVkgPSAxXG4gICAgICAgIHN0cmlkZVggPSBzdHJpZGVbMF1cbiAgICAgICAgc3RyaWRlWSA9IDBcbiAgICAgIH0gZWxzZSBpZiAoc2hhcGUubGVuZ3RoID09PSAyKSB7XG4gICAgICAgIHNoYXBlWCA9IHNoYXBlWzBdXG4gICAgICAgIHNoYXBlWSA9IHNoYXBlWzFdXG4gICAgICAgIHN0cmlkZVggPSBzdHJpZGVbMF1cbiAgICAgICAgc3RyaWRlWSA9IHN0cmlkZVsxXVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgXG4gICAgICB9XG5cbiAgICAgIGJ1ZmZlci5kdHlwZSA9IGR0eXBlIHx8IHR5cGVkQXJyYXlDb2RlKGRhdGEuZGF0YSkgfHwgR0xfRkxPQVRcbiAgICAgIGJ1ZmZlci5kaW1lbnNpb24gPSBzaGFwZVlcblxuICAgICAgdmFyIHRyYW5zcG9zZURhdGEgPSBwb29sLmFsbG9jVHlwZShidWZmZXIuZHR5cGUsIHNoYXBlWCAqIHNoYXBlWSlcbiAgICAgIHRyYW5zcG9zZSh0cmFuc3Bvc2VEYXRhLFxuICAgICAgICBkYXRhLmRhdGEsXG4gICAgICAgIHNoYXBlWCwgc2hhcGVZLFxuICAgICAgICBzdHJpZGVYLCBzdHJpZGVZLFxuICAgICAgICBvZmZzZXQpXG4gICAgICBpbml0QnVmZmVyRnJvbVR5cGVkQXJyYXkoYnVmZmVyLCB0cmFuc3Bvc2VEYXRhLCB1c2FnZSlcbiAgICAgIHBvb2wuZnJlZVR5cGUodHJhbnNwb3NlRGF0YSlcbiAgICB9IGVsc2Uge1xuICAgICAgXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSAoYnVmZmVyKSB7XG4gICAgc3RhdHMuYnVmZmVyQ291bnQtLVxuXG4gICAgdmFyIGhhbmRsZSA9IGJ1ZmZlci5idWZmZXJcbiAgICBcbiAgICBnbC5kZWxldGVCdWZmZXIoaGFuZGxlKVxuICAgIGJ1ZmZlci5idWZmZXIgPSBudWxsXG4gICAgZGVsZXRlIGJ1ZmZlclNldFtidWZmZXIuaWRdXG4gIH1cblxuICBmdW5jdGlvbiBjcmVhdGVCdWZmZXIgKG9wdGlvbnMsIHR5cGUsIGRlZmVySW5pdCkge1xuICAgIHN0YXRzLmJ1ZmZlckNvdW50KytcblxuICAgIHZhciBidWZmZXIgPSBuZXcgUkVHTEJ1ZmZlcih0eXBlKVxuICAgIGJ1ZmZlclNldFtidWZmZXIuaWRdID0gYnVmZmVyXG5cbiAgICBmdW5jdGlvbiByZWdsQnVmZmVyIChvcHRpb25zKSB7XG4gICAgICB2YXIgdXNhZ2UgPSBHTF9TVEFUSUNfRFJBV1xuICAgICAgdmFyIGRhdGEgPSBudWxsXG4gICAgICB2YXIgYnl0ZUxlbmd0aCA9IDBcbiAgICAgIHZhciBkdHlwZSA9IDBcbiAgICAgIHZhciBkaW1lbnNpb24gPSAxXG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShvcHRpb25zKSB8fFxuICAgICAgICAgIGlzVHlwZWRBcnJheShvcHRpb25zKSB8fFxuICAgICAgICAgIGlzTkRBcnJheUxpa2Uob3B0aW9ucykpIHtcbiAgICAgICAgZGF0YSA9IG9wdGlvbnNcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIG9wdGlvbnMgPT09ICdudW1iZXInKSB7XG4gICAgICAgIGJ5dGVMZW5ndGggPSBvcHRpb25zIHwgMFxuICAgICAgfSBlbHNlIGlmIChvcHRpb25zKSB7XG4gICAgICAgIFxuXG4gICAgICAgIGlmICgnZGF0YScgaW4gb3B0aW9ucykge1xuICAgICAgICAgIFxuICAgICAgICAgIGRhdGEgPSBvcHRpb25zLmRhdGFcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgndXNhZ2UnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBcbiAgICAgICAgICB1c2FnZSA9IHVzYWdlVHlwZXNbb3B0aW9ucy51c2FnZV1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgndHlwZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgIFxuICAgICAgICAgIGR0eXBlID0gYnVmZmVyVHlwZXNbb3B0aW9ucy50eXBlXVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdkaW1lbnNpb24nIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBcbiAgICAgICAgICBkaW1lbnNpb24gPSBvcHRpb25zLmRpbWVuc2lvbiB8IDBcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnbGVuZ3RoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgXG4gICAgICAgICAgYnl0ZUxlbmd0aCA9IG9wdGlvbnMubGVuZ3RoIHwgMFxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGJ1ZmZlci5iaW5kKClcbiAgICAgIGlmICghZGF0YSkge1xuICAgICAgICBnbC5idWZmZXJEYXRhKGJ1ZmZlci50eXBlLCBieXRlTGVuZ3RoLCB1c2FnZSlcbiAgICAgICAgYnVmZmVyLmR0eXBlID0gZHR5cGUgfHwgR0xfVU5TSUdORURfQllURVxuICAgICAgICBidWZmZXIudXNhZ2UgPSB1c2FnZVxuICAgICAgICBidWZmZXIuZGltZW5zaW9uID0gZGltZW5zaW9uXG4gICAgICAgIGJ1ZmZlci5ieXRlTGVuZ3RoID0gYnl0ZUxlbmd0aFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaW5pdEJ1ZmZlckZyb21EYXRhKGJ1ZmZlciwgZGF0YSwgdXNhZ2UsIGR0eXBlLCBkaW1lbnNpb24pXG4gICAgICB9XG5cbiAgICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgICBidWZmZXIuc3RhdHMuc2l6ZSA9IGJ1ZmZlci5ieXRlTGVuZ3RoICogRFRZUEVTX1NJWkVTW2J1ZmZlci5kdHlwZV1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJlZ2xCdWZmZXJcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzZXRTdWJEYXRhIChkYXRhLCBvZmZzZXQpIHtcbiAgICAgIFxuXG4gICAgICBnbC5idWZmZXJTdWJEYXRhKGJ1ZmZlci50eXBlLCBvZmZzZXQsIGRhdGEpXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc3ViZGF0YSAoZGF0YSwgb2Zmc2V0Xykge1xuICAgICAgdmFyIG9mZnNldCA9IChvZmZzZXRfIHx8IDApIHwgMFxuICAgICAgYnVmZmVyLmJpbmQoKVxuICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YSkpIHtcbiAgICAgICAgaWYgKGRhdGEubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGlmICh0eXBlb2YgZGF0YVswXSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgIHZhciBjb252ZXJ0ZWQgPSBwb29sLmFsbG9jVHlwZShidWZmZXIuZHR5cGUsIGRhdGEubGVuZ3RoKVxuICAgICAgICAgICAgY29weUFycmF5KGNvbnZlcnRlZCwgZGF0YSlcbiAgICAgICAgICAgIHNldFN1YkRhdGEoY29udmVydGVkLCBvZmZzZXQpXG4gICAgICAgICAgICBwb29sLmZyZWVUeXBlKGNvbnZlcnRlZClcbiAgICAgICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoZGF0YVswXSkgfHwgaXNUeXBlZEFycmF5KGRhdGFbMF0pKSB7XG4gICAgICAgICAgICB2YXIgZGltZW5zaW9uID0gZGF0YVswXS5sZW5ndGhcbiAgICAgICAgICAgIHZhciBmbGF0RGF0YSA9IHBvb2wuYWxsb2NUeXBlKGJ1ZmZlci5kdHlwZSwgZGF0YS5sZW5ndGggKiBkaW1lbnNpb24pXG4gICAgICAgICAgICBmbGF0dGVuKGZsYXREYXRhLCBkYXRhLCBkaW1lbnNpb24pXG4gICAgICAgICAgICBzZXRTdWJEYXRhKGZsYXREYXRhLCBvZmZzZXQpXG4gICAgICAgICAgICBwb29sLmZyZWVUeXBlKGZsYXREYXRhKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoaXNUeXBlZEFycmF5KGRhdGEpKSB7XG4gICAgICAgIHNldFN1YkRhdGEoZGF0YSwgb2Zmc2V0KVxuICAgICAgfSBlbHNlIGlmIChpc05EQXJyYXlMaWtlKGRhdGEpKSB7XG4gICAgICAgIHZhciBzaGFwZSA9IGRhdGEuc2hhcGVcbiAgICAgICAgdmFyIHN0cmlkZSA9IGRhdGEuc3RyaWRlXG5cbiAgICAgICAgdmFyIHNoYXBlWCA9IDBcbiAgICAgICAgdmFyIHNoYXBlWSA9IDBcbiAgICAgICAgdmFyIHN0cmlkZVggPSAwXG4gICAgICAgIHZhciBzdHJpZGVZID0gMFxuICAgICAgICBpZiAoc2hhcGUubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgc2hhcGVYID0gc2hhcGVbMF1cbiAgICAgICAgICBzaGFwZVkgPSAxXG4gICAgICAgICAgc3RyaWRlWCA9IHN0cmlkZVswXVxuICAgICAgICAgIHN0cmlkZVkgPSAwXG4gICAgICAgIH0gZWxzZSBpZiAoc2hhcGUubGVuZ3RoID09PSAyKSB7XG4gICAgICAgICAgc2hhcGVYID0gc2hhcGVbMF1cbiAgICAgICAgICBzaGFwZVkgPSBzaGFwZVsxXVxuICAgICAgICAgIHN0cmlkZVggPSBzdHJpZGVbMF1cbiAgICAgICAgICBzdHJpZGVZID0gc3RyaWRlWzFdXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgXG4gICAgICAgIH1cbiAgICAgICAgdmFyIGR0eXBlID0gQXJyYXkuaXNBcnJheShkYXRhLmRhdGEpXG4gICAgICAgICAgPyBidWZmZXIuZHR5cGVcbiAgICAgICAgICA6IHR5cGVkQXJyYXlDb2RlKGRhdGEuZGF0YSlcblxuICAgICAgICB2YXIgdHJhbnNwb3NlRGF0YSA9IHBvb2wuYWxsb2NUeXBlKGR0eXBlLCBzaGFwZVggKiBzaGFwZVkpXG4gICAgICAgIHRyYW5zcG9zZSh0cmFuc3Bvc2VEYXRhLFxuICAgICAgICAgIGRhdGEuZGF0YSxcbiAgICAgICAgICBzaGFwZVgsIHNoYXBlWSxcbiAgICAgICAgICBzdHJpZGVYLCBzdHJpZGVZLFxuICAgICAgICAgIGRhdGEub2Zmc2V0KVxuICAgICAgICBzZXRTdWJEYXRhKHRyYW5zcG9zZURhdGEsIG9mZnNldClcbiAgICAgICAgcG9vbC5mcmVlVHlwZSh0cmFuc3Bvc2VEYXRhKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgXG4gICAgICB9XG4gICAgICByZXR1cm4gcmVnbEJ1ZmZlclxuICAgIH1cblxuICAgIGlmICghZGVmZXJJbml0KSB7XG4gICAgICByZWdsQnVmZmVyKG9wdGlvbnMpXG4gICAgfVxuXG4gICAgcmVnbEJ1ZmZlci5fcmVnbFR5cGUgPSAnYnVmZmVyJ1xuICAgIHJlZ2xCdWZmZXIuX2J1ZmZlciA9IGJ1ZmZlclxuICAgIHJlZ2xCdWZmZXIuc3ViZGF0YSA9IHN1YmRhdGFcbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgIHJlZ2xCdWZmZXIuc3RhdHMgPSBidWZmZXIuc3RhdHNcbiAgICB9XG4gICAgcmVnbEJ1ZmZlci5kZXN0cm95ID0gZnVuY3Rpb24gKCkgeyBkZXN0cm95KGJ1ZmZlcikgfVxuXG4gICAgcmV0dXJuIHJlZ2xCdWZmZXJcbiAgfVxuXG4gIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgIHN0YXRzLmdldFRvdGFsQnVmZmVyU2l6ZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciB0b3RhbCA9IDBcbiAgICAgIC8vIFRPRE86IFJpZ2h0IG5vdywgdGhlIHN0cmVhbXMgYXJlIG5vdCBwYXJ0IG9mIHRoZSB0b3RhbCBjb3VudC5cbiAgICAgIE9iamVjdC5rZXlzKGJ1ZmZlclNldCkuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgIHRvdGFsICs9IGJ1ZmZlclNldFtrZXldLnN0YXRzLnNpemVcbiAgICAgIH0pXG4gICAgICByZXR1cm4gdG90YWxcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNyZWF0ZTogY3JlYXRlQnVmZmVyLFxuXG4gICAgY3JlYXRlU3RyZWFtOiBjcmVhdGVTdHJlYW0sXG4gICAgZGVzdHJveVN0cmVhbTogZGVzdHJveVN0cmVhbSxcblxuICAgIGNsZWFyOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YWx1ZXMoYnVmZmVyU2V0KS5mb3JFYWNoKGRlc3Ryb3kpXG4gICAgICBzdHJlYW1Qb29sLmZvckVhY2goZGVzdHJveSlcbiAgICB9LFxuXG4gICAgZ2V0QnVmZmVyOiBmdW5jdGlvbiAod3JhcHBlcikge1xuICAgICAgaWYgKHdyYXBwZXIgJiYgd3JhcHBlci5fYnVmZmVyIGluc3RhbmNlb2YgUkVHTEJ1ZmZlcikge1xuICAgICAgICByZXR1cm4gd3JhcHBlci5fYnVmZmVyXG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH0sXG5cbiAgICBfaW5pdEJ1ZmZlcjogaW5pdEJ1ZmZlckZyb21EYXRhXG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgXCJbb2JqZWN0IEludDhBcnJheV1cIjogNTEyMFxuLCBcIltvYmplY3QgSW50MTZBcnJheV1cIjogNTEyMlxuLCBcIltvYmplY3QgSW50MzJBcnJheV1cIjogNTEyNFxuLCBcIltvYmplY3QgVWludDhBcnJheV1cIjogNTEyMVxuLCBcIltvYmplY3QgVWludDhDbGFtcGVkQXJyYXldXCI6IDUxMjFcbiwgXCJbb2JqZWN0IFVpbnQxNkFycmF5XVwiOiA1MTIzXG4sIFwiW29iamVjdCBVaW50MzJBcnJheV1cIjogNTEyNVxuLCBcIltvYmplY3QgRmxvYXQzMkFycmF5XVwiOiA1MTI2XG4sIFwiW29iamVjdCBGbG9hdDY0QXJyYXldXCI6IDUxMjFcbiwgXCJbb2JqZWN0IEFycmF5QnVmZmVyXVwiOiA1MTIxXG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gIFwiaW50OFwiOiA1MTIwXG4sIFwiaW50MTZcIjogNTEyMlxuLCBcImludDMyXCI6IDUxMjRcbiwgXCJ1aW50OFwiOiA1MTIxXG4sIFwidWludDE2XCI6IDUxMjNcbiwgXCJ1aW50MzJcIjogNTEyNVxuLCBcImZsb2F0XCI6IDUxMjZcbiwgXCJmbG9hdDMyXCI6IDUxMjZcbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgXCJwb2ludHNcIjogMCxcbiAgXCJwb2ludFwiOiAwLFxuICBcImxpbmVzXCI6IDEsXG4gIFwibGluZVwiOiAxLFxuICBcImxpbmUgbG9vcFwiOiAyLFxuICBcImxpbmUgc3RyaXBcIjogMyxcbiAgXCJ0cmlhbmdsZXNcIjogNCxcbiAgXCJ0cmlhbmdsZVwiOiA0LFxuICBcInRyaWFuZ2xlIHN0cmlwXCI6IDUsXG4gIFwidHJpYW5nbGUgZmFuXCI6IDZcbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgXCJzdGF0aWNcIjogMzUwNDQsXG4gIFwiZHluYW1pY1wiOiAzNTA0OCxcbiAgXCJzdHJlYW1cIjogMzUwNDBcbn1cbiIsIlxudmFyIGNyZWF0ZUVudmlyb25tZW50ID0gcmVxdWlyZSgnLi91dGlsL2NvZGVnZW4nKVxudmFyIGxvb3AgPSByZXF1aXJlKCcuL3V0aWwvbG9vcCcpXG52YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi91dGlsL2lzLXR5cGVkLWFycmF5JylcbnZhciBpc05EQXJyYXkgPSByZXF1aXJlKCcuL3V0aWwvaXMtbmRhcnJheScpXG52YXIgaXNBcnJheUxpa2UgPSByZXF1aXJlKCcuL3V0aWwvaXMtYXJyYXktbGlrZScpXG52YXIgZHluYW1pYyA9IHJlcXVpcmUoJy4vZHluYW1pYycpXG5cbnZhciBwcmltVHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9wcmltaXRpdmVzLmpzb24nKVxudmFyIGdsVHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9kdHlwZXMuanNvbicpXG5cbi8vIFwiY3V0ZVwiIG5hbWVzIGZvciB2ZWN0b3IgY29tcG9uZW50c1xudmFyIENVVEVfQ09NUE9ORU5UUyA9ICd4eXp3Jy5zcGxpdCgnJylcblxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSA1MTIxXG5cbnZhciBBVFRSSUJfU1RBVEVfUE9JTlRFUiA9IDFcbnZhciBBVFRSSUJfU1RBVEVfQ09OU1RBTlQgPSAyXG5cbnZhciBEWU5fRlVOQyA9IDBcbnZhciBEWU5fUFJPUCA9IDFcbnZhciBEWU5fQ09OVEVYVCA9IDJcbnZhciBEWU5fU1RBVEUgPSAzXG52YXIgRFlOX1RIVU5LID0gNFxuXG52YXIgU19ESVRIRVIgPSAnZGl0aGVyJ1xudmFyIFNfQkxFTkRfRU5BQkxFID0gJ2JsZW5kLmVuYWJsZSdcbnZhciBTX0JMRU5EX0NPTE9SID0gJ2JsZW5kLmNvbG9yJ1xudmFyIFNfQkxFTkRfRVFVQVRJT04gPSAnYmxlbmQuZXF1YXRpb24nXG52YXIgU19CTEVORF9GVU5DID0gJ2JsZW5kLmZ1bmMnXG52YXIgU19ERVBUSF9FTkFCTEUgPSAnZGVwdGguZW5hYmxlJ1xudmFyIFNfREVQVEhfRlVOQyA9ICdkZXB0aC5mdW5jJ1xudmFyIFNfREVQVEhfUkFOR0UgPSAnZGVwdGgucmFuZ2UnXG52YXIgU19ERVBUSF9NQVNLID0gJ2RlcHRoLm1hc2snXG52YXIgU19DT0xPUl9NQVNLID0gJ2NvbG9yTWFzaydcbnZhciBTX0NVTExfRU5BQkxFID0gJ2N1bGwuZW5hYmxlJ1xudmFyIFNfQ1VMTF9GQUNFID0gJ2N1bGwuZmFjZSdcbnZhciBTX0ZST05UX0ZBQ0UgPSAnZnJvbnRGYWNlJ1xudmFyIFNfTElORV9XSURUSCA9ICdsaW5lV2lkdGgnXG52YXIgU19QT0xZR09OX09GRlNFVF9FTkFCTEUgPSAncG9seWdvbk9mZnNldC5lbmFibGUnXG52YXIgU19QT0xZR09OX09GRlNFVF9PRkZTRVQgPSAncG9seWdvbk9mZnNldC5vZmZzZXQnXG52YXIgU19TQU1QTEVfQUxQSEEgPSAnc2FtcGxlLmFscGhhJ1xudmFyIFNfU0FNUExFX0VOQUJMRSA9ICdzYW1wbGUuZW5hYmxlJ1xudmFyIFNfU0FNUExFX0NPVkVSQUdFID0gJ3NhbXBsZS5jb3ZlcmFnZSdcbnZhciBTX1NURU5DSUxfRU5BQkxFID0gJ3N0ZW5jaWwuZW5hYmxlJ1xudmFyIFNfU1RFTkNJTF9NQVNLID0gJ3N0ZW5jaWwubWFzaydcbnZhciBTX1NURU5DSUxfRlVOQyA9ICdzdGVuY2lsLmZ1bmMnXG52YXIgU19TVEVOQ0lMX09QRlJPTlQgPSAnc3RlbmNpbC5vcEZyb250J1xudmFyIFNfU1RFTkNJTF9PUEJBQ0sgPSAnc3RlbmNpbC5vcEJhY2snXG52YXIgU19TQ0lTU09SX0VOQUJMRSA9ICdzY2lzc29yLmVuYWJsZSdcbnZhciBTX1NDSVNTT1JfQk9YID0gJ3NjaXNzb3IuYm94J1xudmFyIFNfVklFV1BPUlQgPSAndmlld3BvcnQnXG5cbnZhciBTX1BST0ZJTEUgPSAncHJvZmlsZSdcblxudmFyIFNfRlJBTUVCVUZGRVIgPSAnZnJhbWVidWZmZXInXG52YXIgU19WRVJUID0gJ3ZlcnQnXG52YXIgU19GUkFHID0gJ2ZyYWcnXG52YXIgU19FTEVNRU5UUyA9ICdlbGVtZW50cydcbnZhciBTX1BSSU1JVElWRSA9ICdwcmltaXRpdmUnXG52YXIgU19DT1VOVCA9ICdjb3VudCdcbnZhciBTX09GRlNFVCA9ICdvZmZzZXQnXG52YXIgU19JTlNUQU5DRVMgPSAnaW5zdGFuY2VzJ1xuXG52YXIgU1VGRklYX1dJRFRIID0gJ1dpZHRoJ1xudmFyIFNVRkZJWF9IRUlHSFQgPSAnSGVpZ2h0J1xuXG52YXIgU19GUkFNRUJVRkZFUl9XSURUSCA9IFNfRlJBTUVCVUZGRVIgKyBTVUZGSVhfV0lEVEhcbnZhciBTX0ZSQU1FQlVGRkVSX0hFSUdIVCA9IFNfRlJBTUVCVUZGRVIgKyBTVUZGSVhfSEVJR0hUXG52YXIgU19WSUVXUE9SVF9XSURUSCA9IFNfVklFV1BPUlQgKyBTVUZGSVhfV0lEVEhcbnZhciBTX1ZJRVdQT1JUX0hFSUdIVCA9IFNfVklFV1BPUlQgKyBTVUZGSVhfSEVJR0hUXG52YXIgU19EUkFXSU5HQlVGRkVSID0gJ2RyYXdpbmdCdWZmZXInXG52YXIgU19EUkFXSU5HQlVGRkVSX1dJRFRIID0gU19EUkFXSU5HQlVGRkVSICsgU1VGRklYX1dJRFRIXG52YXIgU19EUkFXSU5HQlVGRkVSX0hFSUdIVCA9IFNfRFJBV0lOR0JVRkZFUiArIFNVRkZJWF9IRUlHSFRcblxudmFyIE5FU1RFRF9PUFRJT05TID0gW1xuICBTX0JMRU5EX0ZVTkMsXG4gIFNfQkxFTkRfRVFVQVRJT04sXG4gIFNfU1RFTkNJTF9GVU5DLFxuICBTX1NURU5DSUxfT1BGUk9OVCxcbiAgU19TVEVOQ0lMX09QQkFDSyxcbiAgU19TQU1QTEVfQ09WRVJBR0UsXG4gIFNfVklFV1BPUlQsXG4gIFNfU0NJU1NPUl9CT1gsXG4gIFNfUE9MWUdPTl9PRkZTRVRfT0ZGU0VUXG5dXG5cbnZhciBHTF9BUlJBWV9CVUZGRVIgPSAzNDk2MlxudmFyIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSID0gMzQ5NjNcblxudmFyIEdMX0ZSQUdNRU5UX1NIQURFUiA9IDM1NjMyXG52YXIgR0xfVkVSVEVYX1NIQURFUiA9IDM1NjMzXG5cbnZhciBHTF9URVhUVVJFXzJEID0gMHgwREUxXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUCA9IDB4ODUxM1xuXG52YXIgR0xfQ1VMTF9GQUNFID0gMHgwQjQ0XG52YXIgR0xfQkxFTkQgPSAweDBCRTJcbnZhciBHTF9ESVRIRVIgPSAweDBCRDBcbnZhciBHTF9TVEVOQ0lMX1RFU1QgPSAweDBCOTBcbnZhciBHTF9ERVBUSF9URVNUID0gMHgwQjcxXG52YXIgR0xfU0NJU1NPUl9URVNUID0gMHgwQzExXG52YXIgR0xfUE9MWUdPTl9PRkZTRVRfRklMTCA9IDB4ODAzN1xudmFyIEdMX1NBTVBMRV9BTFBIQV9UT19DT1ZFUkFHRSA9IDB4ODA5RVxudmFyIEdMX1NBTVBMRV9DT1ZFUkFHRSA9IDB4ODBBMFxuXG52YXIgR0xfRkxPQVQgPSA1MTI2XG52YXIgR0xfRkxPQVRfVkVDMiA9IDM1NjY0XG52YXIgR0xfRkxPQVRfVkVDMyA9IDM1NjY1XG52YXIgR0xfRkxPQVRfVkVDNCA9IDM1NjY2XG52YXIgR0xfSU5UID0gNTEyNFxudmFyIEdMX0lOVF9WRUMyID0gMzU2NjdcbnZhciBHTF9JTlRfVkVDMyA9IDM1NjY4XG52YXIgR0xfSU5UX1ZFQzQgPSAzNTY2OVxudmFyIEdMX0JPT0wgPSAzNTY3MFxudmFyIEdMX0JPT0xfVkVDMiA9IDM1NjcxXG52YXIgR0xfQk9PTF9WRUMzID0gMzU2NzJcbnZhciBHTF9CT09MX1ZFQzQgPSAzNTY3M1xudmFyIEdMX0ZMT0FUX01BVDIgPSAzNTY3NFxudmFyIEdMX0ZMT0FUX01BVDMgPSAzNTY3NVxudmFyIEdMX0ZMT0FUX01BVDQgPSAzNTY3NlxudmFyIEdMX1NBTVBMRVJfMkQgPSAzNTY3OFxudmFyIEdMX1NBTVBMRVJfQ1VCRSA9IDM1NjgwXG5cbnZhciBHTF9UUklBTkdMRVMgPSA0XG5cbnZhciBHTF9GUk9OVCA9IDEwMjhcbnZhciBHTF9CQUNLID0gMTAyOVxudmFyIEdMX0NXID0gMHgwOTAwXG52YXIgR0xfQ0NXID0gMHgwOTAxXG52YXIgR0xfTUlOX0VYVCA9IDB4ODAwN1xudmFyIEdMX01BWF9FWFQgPSAweDgwMDhcbnZhciBHTF9BTFdBWVMgPSA1MTlcbnZhciBHTF9LRUVQID0gNzY4MFxudmFyIEdMX1pFUk8gPSAwXG52YXIgR0xfT05FID0gMVxudmFyIEdMX0ZVTkNfQUREID0gMHg4MDA2XG52YXIgR0xfTEVTUyA9IDUxM1xuXG52YXIgR0xfRlJBTUVCVUZGRVIgPSAweDhENDBcbnZhciBHTF9DT0xPUl9BVFRBQ0hNRU5UMCA9IDB4OENFMFxuXG52YXIgYmxlbmRGdW5jcyA9IHtcbiAgJzAnOiAwLFxuICAnMSc6IDEsXG4gICd6ZXJvJzogMCxcbiAgJ29uZSc6IDEsXG4gICdzcmMgY29sb3InOiA3NjgsXG4gICdvbmUgbWludXMgc3JjIGNvbG9yJzogNzY5LFxuICAnc3JjIGFscGhhJzogNzcwLFxuICAnb25lIG1pbnVzIHNyYyBhbHBoYSc6IDc3MSxcbiAgJ2RzdCBjb2xvcic6IDc3NCxcbiAgJ29uZSBtaW51cyBkc3QgY29sb3InOiA3NzUsXG4gICdkc3QgYWxwaGEnOiA3NzIsXG4gICdvbmUgbWludXMgZHN0IGFscGhhJzogNzczLFxuICAnY29uc3RhbnQgY29sb3InOiAzMjc2OSxcbiAgJ29uZSBtaW51cyBjb25zdGFudCBjb2xvcic6IDMyNzcwLFxuICAnY29uc3RhbnQgYWxwaGEnOiAzMjc3MSxcbiAgJ29uZSBtaW51cyBjb25zdGFudCBhbHBoYSc6IDMyNzcyLFxuICAnc3JjIGFscGhhIHNhdHVyYXRlJzogNzc2XG59XG5cbnZhciBjb21wYXJlRnVuY3MgPSB7XG4gICduZXZlcic6IDUxMixcbiAgJ2xlc3MnOiA1MTMsXG4gICc8JzogNTEzLFxuICAnZXF1YWwnOiA1MTQsXG4gICc9JzogNTE0LFxuICAnPT0nOiA1MTQsXG4gICc9PT0nOiA1MTQsXG4gICdsZXF1YWwnOiA1MTUsXG4gICc8PSc6IDUxNSxcbiAgJ2dyZWF0ZXInOiA1MTYsXG4gICc+JzogNTE2LFxuICAnbm90ZXF1YWwnOiA1MTcsXG4gICchPSc6IDUxNyxcbiAgJyE9PSc6IDUxNyxcbiAgJ2dlcXVhbCc6IDUxOCxcbiAgJz49JzogNTE4LFxuICAnYWx3YXlzJzogNTE5XG59XG5cbnZhciBzdGVuY2lsT3BzID0ge1xuICAnMCc6IDAsXG4gICd6ZXJvJzogMCxcbiAgJ2tlZXAnOiA3NjgwLFxuICAncmVwbGFjZSc6IDc2ODEsXG4gICdpbmNyZW1lbnQnOiA3NjgyLFxuICAnZGVjcmVtZW50JzogNzY4MyxcbiAgJ2luY3JlbWVudCB3cmFwJzogMzQwNTUsXG4gICdkZWNyZW1lbnQgd3JhcCc6IDM0MDU2LFxuICAnaW52ZXJ0JzogNTM4NlxufVxuXG52YXIgc2hhZGVyVHlwZSA9IHtcbiAgJ2ZyYWcnOiBHTF9GUkFHTUVOVF9TSEFERVIsXG4gICd2ZXJ0JzogR0xfVkVSVEVYX1NIQURFUlxufVxuXG52YXIgb3JpZW50YXRpb25UeXBlID0ge1xuICAnY3cnOiBHTF9DVyxcbiAgJ2Njdyc6IEdMX0NDV1xufVxuXG5mdW5jdGlvbiBpc0J1ZmZlckFyZ3MgKHgpIHtcbiAgcmV0dXJuIEFycmF5LmlzQXJyYXkoeCkgfHxcbiAgICBpc1R5cGVkQXJyYXkoeCkgfHxcbiAgICBpc05EQXJyYXkoeClcbn1cblxuLy8gTWFrZSBzdXJlIHZpZXdwb3J0IGlzIHByb2Nlc3NlZCBmaXJzdFxuZnVuY3Rpb24gc29ydFN0YXRlIChzdGF0ZSkge1xuICByZXR1cm4gc3RhdGUuc29ydChmdW5jdGlvbiAoYSwgYikge1xuICAgIGlmIChhID09PSBTX1ZJRVdQT1JUKSB7XG4gICAgICByZXR1cm4gLTFcbiAgICB9IGVsc2UgaWYgKGIgPT09IFNfVklFV1BPUlQpIHtcbiAgICAgIHJldHVybiAxXG4gICAgfVxuICAgIHJldHVybiAoYSA8IGIpID8gLTEgOiAxXG4gIH0pXG59XG5cbmZ1bmN0aW9uIERlY2xhcmF0aW9uICh0aGlzRGVwLCBjb250ZXh0RGVwLCBwcm9wRGVwLCBhcHBlbmQpIHtcbiAgdGhpcy50aGlzRGVwID0gdGhpc0RlcFxuICB0aGlzLmNvbnRleHREZXAgPSBjb250ZXh0RGVwXG4gIHRoaXMucHJvcERlcCA9IHByb3BEZXBcbiAgdGhpcy5hcHBlbmQgPSBhcHBlbmRcbn1cblxuZnVuY3Rpb24gaXNTdGF0aWMgKGRlY2wpIHtcbiAgcmV0dXJuIGRlY2wgJiYgIShkZWNsLnRoaXNEZXAgfHwgZGVjbC5jb250ZXh0RGVwIHx8IGRlY2wucHJvcERlcClcbn1cblxuZnVuY3Rpb24gY3JlYXRlU3RhdGljRGVjbCAoYXBwZW5kKSB7XG4gIHJldHVybiBuZXcgRGVjbGFyYXRpb24oZmFsc2UsIGZhbHNlLCBmYWxzZSwgYXBwZW5kKVxufVxuXG5mdW5jdGlvbiBjcmVhdGVEeW5hbWljRGVjbCAoZHluLCBhcHBlbmQpIHtcbiAgdmFyIHR5cGUgPSBkeW4udHlwZVxuICBpZiAodHlwZSA9PT0gRFlOX0ZVTkMpIHtcbiAgICB2YXIgbnVtQXJncyA9IGR5bi5kYXRhLmxlbmd0aFxuICAgIHJldHVybiBuZXcgRGVjbGFyYXRpb24oXG4gICAgICB0cnVlLFxuICAgICAgbnVtQXJncyA+PSAxLFxuICAgICAgbnVtQXJncyA+PSAyLFxuICAgICAgYXBwZW5kKVxuICB9IGVsc2UgaWYgKHR5cGUgPT09IERZTl9USFVOSykge1xuICAgIHZhciBkYXRhID0gZHluLmRhdGFcbiAgICByZXR1cm4gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgZGF0YS50aGlzRGVwLFxuICAgICAgZGF0YS5jb250ZXh0RGVwLFxuICAgICAgZGF0YS5wcm9wRGVwLFxuICAgICAgYXBwZW5kKVxuICB9IGVsc2Uge1xuICAgIHJldHVybiBuZXcgRGVjbGFyYXRpb24oXG4gICAgICB0eXBlID09PSBEWU5fU1RBVEUsXG4gICAgICB0eXBlID09PSBEWU5fQ09OVEVYVCxcbiAgICAgIHR5cGUgPT09IERZTl9QUk9QLFxuICAgICAgYXBwZW5kKVxuICB9XG59XG5cbnZhciBTQ09QRV9ERUNMID0gbmV3IERlY2xhcmF0aW9uKGZhbHNlLCBmYWxzZSwgZmFsc2UsIGZ1bmN0aW9uICgpIHt9KVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHJlZ2xDb3JlIChcbiAgZ2wsXG4gIHN0cmluZ1N0b3JlLFxuICBleHRlbnNpb25zLFxuICBsaW1pdHMsXG4gIGJ1ZmZlclN0YXRlLFxuICBlbGVtZW50U3RhdGUsXG4gIHRleHR1cmVTdGF0ZSxcbiAgZnJhbWVidWZmZXJTdGF0ZSxcbiAgdW5pZm9ybVN0YXRlLFxuICBhdHRyaWJ1dGVTdGF0ZSxcbiAgc2hhZGVyU3RhdGUsXG4gIGRyYXdTdGF0ZSxcbiAgY29udGV4dFN0YXRlLFxuICB0aW1lcixcbiAgY29uZmlnKSB7XG4gIHZhciBBdHRyaWJ1dGVSZWNvcmQgPSBhdHRyaWJ1dGVTdGF0ZS5SZWNvcmRcblxuICB2YXIgYmxlbmRFcXVhdGlvbnMgPSB7XG4gICAgJ2FkZCc6IDMyNzc0LFxuICAgICdzdWJ0cmFjdCc6IDMyNzc4LFxuICAgICdyZXZlcnNlIHN1YnRyYWN0JzogMzI3NzlcbiAgfVxuICBpZiAoZXh0ZW5zaW9ucy5leHRfYmxlbmRfbWlubWF4KSB7XG4gICAgYmxlbmRFcXVhdGlvbnMubWluID0gR0xfTUlOX0VYVFxuICAgIGJsZW5kRXF1YXRpb25zLm1heCA9IEdMX01BWF9FWFRcbiAgfVxuXG4gIHZhciBleHRJbnN0YW5jaW5nID0gZXh0ZW5zaW9ucy5hbmdsZV9pbnN0YW5jZWRfYXJyYXlzXG4gIHZhciBleHREcmF3QnVmZmVycyA9IGV4dGVuc2lvbnMud2ViZ2xfZHJhd19idWZmZXJzXG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBXRUJHTCBTVEFURVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIHZhciBjdXJyZW50U3RhdGUgPSB7XG4gICAgZGlydHk6IHRydWUsXG4gICAgcHJvZmlsZTogY29uZmlnLnByb2ZpbGVcbiAgfVxuICB2YXIgbmV4dFN0YXRlID0ge31cbiAgdmFyIEdMX1NUQVRFX05BTUVTID0gW11cbiAgdmFyIEdMX0ZMQUdTID0ge31cbiAgdmFyIEdMX1ZBUklBQkxFUyA9IHt9XG5cbiAgZnVuY3Rpb24gcHJvcE5hbWUgKG5hbWUpIHtcbiAgICByZXR1cm4gbmFtZS5yZXBsYWNlKCcuJywgJ18nKVxuICB9XG5cbiAgZnVuY3Rpb24gc3RhdGVGbGFnIChzbmFtZSwgY2FwLCBpbml0KSB7XG4gICAgdmFyIG5hbWUgPSBwcm9wTmFtZShzbmFtZSlcbiAgICBHTF9TVEFURV9OQU1FUy5wdXNoKHNuYW1lKVxuICAgIG5leHRTdGF0ZVtuYW1lXSA9IGN1cnJlbnRTdGF0ZVtuYW1lXSA9ICEhaW5pdFxuICAgIEdMX0ZMQUdTW25hbWVdID0gY2FwXG4gIH1cblxuICBmdW5jdGlvbiBzdGF0ZVZhcmlhYmxlIChzbmFtZSwgZnVuYywgaW5pdCkge1xuICAgIHZhciBuYW1lID0gcHJvcE5hbWUoc25hbWUpXG4gICAgR0xfU1RBVEVfTkFNRVMucHVzaChzbmFtZSlcbiAgICBpZiAoQXJyYXkuaXNBcnJheShpbml0KSkge1xuICAgICAgY3VycmVudFN0YXRlW25hbWVdID0gaW5pdC5zbGljZSgpXG4gICAgICBuZXh0U3RhdGVbbmFtZV0gPSBpbml0LnNsaWNlKClcbiAgICB9IGVsc2Uge1xuICAgICAgY3VycmVudFN0YXRlW25hbWVdID0gbmV4dFN0YXRlW25hbWVdID0gaW5pdFxuICAgIH1cbiAgICBHTF9WQVJJQUJMRVNbbmFtZV0gPSBmdW5jXG4gIH1cblxuICAvLyBEaXRoZXJpbmdcbiAgc3RhdGVGbGFnKFNfRElUSEVSLCBHTF9ESVRIRVIpXG5cbiAgLy8gQmxlbmRpbmdcbiAgc3RhdGVGbGFnKFNfQkxFTkRfRU5BQkxFLCBHTF9CTEVORClcbiAgc3RhdGVWYXJpYWJsZShTX0JMRU5EX0NPTE9SLCAnYmxlbmRDb2xvcicsIFswLCAwLCAwLCAwXSlcbiAgc3RhdGVWYXJpYWJsZShTX0JMRU5EX0VRVUFUSU9OLCAnYmxlbmRFcXVhdGlvblNlcGFyYXRlJyxcbiAgICBbR0xfRlVOQ19BREQsIEdMX0ZVTkNfQUREXSlcbiAgc3RhdGVWYXJpYWJsZShTX0JMRU5EX0ZVTkMsICdibGVuZEZ1bmNTZXBhcmF0ZScsXG4gICAgW0dMX09ORSwgR0xfWkVSTywgR0xfT05FLCBHTF9aRVJPXSlcblxuICAvLyBEZXB0aFxuICBzdGF0ZUZsYWcoU19ERVBUSF9FTkFCTEUsIEdMX0RFUFRIX1RFU1QsIHRydWUpXG4gIHN0YXRlVmFyaWFibGUoU19ERVBUSF9GVU5DLCAnZGVwdGhGdW5jJywgR0xfTEVTUylcbiAgc3RhdGVWYXJpYWJsZShTX0RFUFRIX1JBTkdFLCAnZGVwdGhSYW5nZScsIFswLCAxXSlcbiAgc3RhdGVWYXJpYWJsZShTX0RFUFRIX01BU0ssICdkZXB0aE1hc2snLCB0cnVlKVxuXG4gIC8vIENvbG9yIG1hc2tcbiAgc3RhdGVWYXJpYWJsZShTX0NPTE9SX01BU0ssIFNfQ09MT1JfTUFTSywgW3RydWUsIHRydWUsIHRydWUsIHRydWVdKVxuXG4gIC8vIEZhY2UgY3VsbGluZ1xuICBzdGF0ZUZsYWcoU19DVUxMX0VOQUJMRSwgR0xfQ1VMTF9GQUNFKVxuICBzdGF0ZVZhcmlhYmxlKFNfQ1VMTF9GQUNFLCAnY3VsbEZhY2UnLCBHTF9CQUNLKVxuXG4gIC8vIEZyb250IGZhY2Ugb3JpZW50YXRpb25cbiAgc3RhdGVWYXJpYWJsZShTX0ZST05UX0ZBQ0UsIFNfRlJPTlRfRkFDRSwgR0xfQ0NXKVxuXG4gIC8vIExpbmUgd2lkdGhcbiAgc3RhdGVWYXJpYWJsZShTX0xJTkVfV0lEVEgsIFNfTElORV9XSURUSCwgMSlcblxuICAvLyBQb2x5Z29uIG9mZnNldFxuICBzdGF0ZUZsYWcoU19QT0xZR09OX09GRlNFVF9FTkFCTEUsIEdMX1BPTFlHT05fT0ZGU0VUX0ZJTEwpXG4gIHN0YXRlVmFyaWFibGUoU19QT0xZR09OX09GRlNFVF9PRkZTRVQsICdwb2x5Z29uT2Zmc2V0JywgWzAsIDBdKVxuXG4gIC8vIFNhbXBsZSBjb3ZlcmFnZVxuICBzdGF0ZUZsYWcoU19TQU1QTEVfQUxQSEEsIEdMX1NBTVBMRV9BTFBIQV9UT19DT1ZFUkFHRSlcbiAgc3RhdGVGbGFnKFNfU0FNUExFX0VOQUJMRSwgR0xfU0FNUExFX0NPVkVSQUdFKVxuICBzdGF0ZVZhcmlhYmxlKFNfU0FNUExFX0NPVkVSQUdFLCAnc2FtcGxlQ292ZXJhZ2UnLCBbMSwgZmFsc2VdKVxuXG4gIC8vIFN0ZW5jaWxcbiAgc3RhdGVGbGFnKFNfU1RFTkNJTF9FTkFCTEUsIEdMX1NURU5DSUxfVEVTVClcbiAgc3RhdGVWYXJpYWJsZShTX1NURU5DSUxfTUFTSywgJ3N0ZW5jaWxNYXNrJywgLTEpXG4gIHN0YXRlVmFyaWFibGUoU19TVEVOQ0lMX0ZVTkMsICdzdGVuY2lsRnVuYycsIFtHTF9BTFdBWVMsIDAsIC0xXSlcbiAgc3RhdGVWYXJpYWJsZShTX1NURU5DSUxfT1BGUk9OVCwgJ3N0ZW5jaWxPcFNlcGFyYXRlJyxcbiAgICBbR0xfRlJPTlQsIEdMX0tFRVAsIEdMX0tFRVAsIEdMX0tFRVBdKVxuICBzdGF0ZVZhcmlhYmxlKFNfU1RFTkNJTF9PUEJBQ0ssICdzdGVuY2lsT3BTZXBhcmF0ZScsXG4gICAgW0dMX0JBQ0ssIEdMX0tFRVAsIEdMX0tFRVAsIEdMX0tFRVBdKVxuXG4gIC8vIFNjaXNzb3JcbiAgc3RhdGVGbGFnKFNfU0NJU1NPUl9FTkFCTEUsIEdMX1NDSVNTT1JfVEVTVClcbiAgc3RhdGVWYXJpYWJsZShTX1NDSVNTT1JfQk9YLCAnc2Npc3NvcicsXG4gICAgWzAsIDAsIGdsLmRyYXdpbmdCdWZmZXJXaWR0aCwgZ2wuZHJhd2luZ0J1ZmZlckhlaWdodF0pXG5cbiAgLy8gVmlld3BvcnRcbiAgc3RhdGVWYXJpYWJsZShTX1ZJRVdQT1JULCBTX1ZJRVdQT1JULFxuICAgIFswLCAwLCBnbC5kcmF3aW5nQnVmZmVyV2lkdGgsIGdsLmRyYXdpbmdCdWZmZXJIZWlnaHRdKVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gRU5WSVJPTk1FTlRcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICB2YXIgc2hhcmVkU3RhdGUgPSB7XG4gICAgZ2w6IGdsLFxuICAgIGNvbnRleHQ6IGNvbnRleHRTdGF0ZSxcbiAgICBzdHJpbmdzOiBzdHJpbmdTdG9yZSxcbiAgICBuZXh0OiBuZXh0U3RhdGUsXG4gICAgY3VycmVudDogY3VycmVudFN0YXRlLFxuICAgIGRyYXc6IGRyYXdTdGF0ZSxcbiAgICBlbGVtZW50czogZWxlbWVudFN0YXRlLFxuICAgIGJ1ZmZlcjogYnVmZmVyU3RhdGUsXG4gICAgc2hhZGVyOiBzaGFkZXJTdGF0ZSxcbiAgICBhdHRyaWJ1dGVzOiBhdHRyaWJ1dGVTdGF0ZS5zdGF0ZSxcbiAgICB1bmlmb3JtczogdW5pZm9ybVN0YXRlLFxuICAgIGZyYW1lYnVmZmVyOiBmcmFtZWJ1ZmZlclN0YXRlLFxuICAgIGV4dGVuc2lvbnM6IGV4dGVuc2lvbnMsXG5cbiAgICB0aW1lcjogdGltZXIsXG4gICAgaXNCdWZmZXJBcmdzOiBpc0J1ZmZlckFyZ3NcbiAgfVxuXG4gIHZhciBzaGFyZWRDb25zdGFudHMgPSB7XG4gICAgcHJpbVR5cGVzOiBwcmltVHlwZXMsXG4gICAgY29tcGFyZUZ1bmNzOiBjb21wYXJlRnVuY3MsXG4gICAgYmxlbmRGdW5jczogYmxlbmRGdW5jcyxcbiAgICBibGVuZEVxdWF0aW9uczogYmxlbmRFcXVhdGlvbnMsXG4gICAgc3RlbmNpbE9wczogc3RlbmNpbE9wcyxcbiAgICBnbFR5cGVzOiBnbFR5cGVzLFxuICAgIG9yaWVudGF0aW9uVHlwZTogb3JpZW50YXRpb25UeXBlXG4gIH1cblxuICBcblxuICBpZiAoZXh0RHJhd0J1ZmZlcnMpIHtcbiAgICBzaGFyZWRDb25zdGFudHMuYmFja0J1ZmZlciA9IFtHTF9CQUNLXVxuICAgIHNoYXJlZENvbnN0YW50cy5kcmF3QnVmZmVyID0gbG9vcChsaW1pdHMubWF4RHJhd2J1ZmZlcnMsIGZ1bmN0aW9uIChpKSB7XG4gICAgICBpZiAoaSA9PT0gMCkge1xuICAgICAgICByZXR1cm4gWzBdXG4gICAgICB9XG4gICAgICByZXR1cm4gbG9vcChpLCBmdW5jdGlvbiAoaikge1xuICAgICAgICByZXR1cm4gR0xfQ09MT1JfQVRUQUNITUVOVDAgKyBqXG4gICAgICB9KVxuICAgIH0pXG4gIH1cblxuICB2YXIgZHJhd0NhbGxDb3VudGVyID0gMFxuICBmdW5jdGlvbiBjcmVhdGVSRUdMRW52aXJvbm1lbnQgKCkge1xuICAgIHZhciBlbnYgPSBjcmVhdGVFbnZpcm9ubWVudCgpXG4gICAgdmFyIGxpbmsgPSBlbnYubGlua1xuICAgIHZhciBnbG9iYWwgPSBlbnYuZ2xvYmFsXG4gICAgZW52LmlkID0gZHJhd0NhbGxDb3VudGVyKytcblxuICAgIGVudi5iYXRjaElkID0gJzAnXG5cbiAgICAvLyBsaW5rIHNoYXJlZCBzdGF0ZVxuICAgIHZhciBTSEFSRUQgPSBsaW5rKHNoYXJlZFN0YXRlKVxuICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkID0ge1xuICAgICAgcHJvcHM6ICdhMCdcbiAgICB9XG4gICAgT2JqZWN0LmtleXMoc2hhcmVkU3RhdGUpLmZvckVhY2goZnVuY3Rpb24gKHByb3ApIHtcbiAgICAgIHNoYXJlZFtwcm9wXSA9IGdsb2JhbC5kZWYoU0hBUkVELCAnLicsIHByb3ApXG4gICAgfSlcblxuICAgIC8vIEluamVjdCBydW50aW1lIGFzc2VydGlvbiBzdHVmZiBmb3IgZGVidWcgYnVpbGRzXG4gICAgXG5cbiAgICAvLyBDb3B5IEdMIHN0YXRlIHZhcmlhYmxlcyBvdmVyXG4gICAgdmFyIG5leHRWYXJzID0gZW52Lm5leHQgPSB7fVxuICAgIHZhciBjdXJyZW50VmFycyA9IGVudi5jdXJyZW50ID0ge31cbiAgICBPYmplY3Qua2V5cyhHTF9WQVJJQUJMRVMpLmZvckVhY2goZnVuY3Rpb24gKHZhcmlhYmxlKSB7XG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShjdXJyZW50U3RhdGVbdmFyaWFibGVdKSkge1xuICAgICAgICBuZXh0VmFyc1t2YXJpYWJsZV0gPSBnbG9iYWwuZGVmKHNoYXJlZC5uZXh0LCAnLicsIHZhcmlhYmxlKVxuICAgICAgICBjdXJyZW50VmFyc1t2YXJpYWJsZV0gPSBnbG9iYWwuZGVmKHNoYXJlZC5jdXJyZW50LCAnLicsIHZhcmlhYmxlKVxuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyBJbml0aWFsaXplIHNoYXJlZCBjb25zdGFudHNcbiAgICB2YXIgY29uc3RhbnRzID0gZW52LmNvbnN0YW50cyA9IHt9XG4gICAgT2JqZWN0LmtleXMoc2hhcmVkQ29uc3RhbnRzKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICBjb25zdGFudHNbbmFtZV0gPSBnbG9iYWwuZGVmKEpTT04uc3RyaW5naWZ5KHNoYXJlZENvbnN0YW50c1tuYW1lXSkpXG4gICAgfSlcblxuICAgIC8vIEhlbHBlciBmdW5jdGlvbiBmb3IgY2FsbGluZyBhIGJsb2NrXG4gICAgZW52Lmludm9rZSA9IGZ1bmN0aW9uIChibG9jaywgeCkge1xuICAgICAgc3dpdGNoICh4LnR5cGUpIHtcbiAgICAgICAgY2FzZSBEWU5fRlVOQzpcbiAgICAgICAgICB2YXIgYXJnTGlzdCA9IFtcbiAgICAgICAgICAgICd0aGlzJyxcbiAgICAgICAgICAgIHNoYXJlZC5jb250ZXh0LFxuICAgICAgICAgICAgc2hhcmVkLnByb3BzLFxuICAgICAgICAgICAgZW52LmJhdGNoSWRcbiAgICAgICAgICBdXG4gICAgICAgICAgcmV0dXJuIGJsb2NrLmRlZihcbiAgICAgICAgICAgIGxpbmsoeC5kYXRhKSwgJy5jYWxsKCcsXG4gICAgICAgICAgICAgIGFyZ0xpc3Quc2xpY2UoMCwgTWF0aC5tYXgoeC5kYXRhLmxlbmd0aCArIDEsIDQpKSxcbiAgICAgICAgICAgICAnKScpXG4gICAgICAgIGNhc2UgRFlOX1BST1A6XG4gICAgICAgICAgcmV0dXJuIGJsb2NrLmRlZihzaGFyZWQucHJvcHMsIHguZGF0YSlcbiAgICAgICAgY2FzZSBEWU5fQ09OVEVYVDpcbiAgICAgICAgICByZXR1cm4gYmxvY2suZGVmKHNoYXJlZC5jb250ZXh0LCB4LmRhdGEpXG4gICAgICAgIGNhc2UgRFlOX1NUQVRFOlxuICAgICAgICAgIHJldHVybiBibG9jay5kZWYoJ3RoaXMnLCB4LmRhdGEpXG4gICAgICAgIGNhc2UgRFlOX1RIVU5LOlxuICAgICAgICAgIHguZGF0YS5hcHBlbmQoZW52LCBibG9jaylcbiAgICAgICAgICByZXR1cm4geC5kYXRhLnJlZlxuICAgICAgfVxuICAgIH1cblxuICAgIGVudi5hdHRyaWJDYWNoZSA9IHt9XG5cbiAgICB2YXIgc2NvcGVBdHRyaWJzID0ge31cbiAgICBlbnYuc2NvcGVBdHRyaWIgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgICAgdmFyIGlkID0gc3RyaW5nU3RvcmUuaWQobmFtZSlcbiAgICAgIGlmIChpZCBpbiBzY29wZUF0dHJpYnMpIHtcbiAgICAgICAgcmV0dXJuIHNjb3BlQXR0cmlic1tpZF1cbiAgICAgIH1cbiAgICAgIHZhciBiaW5kaW5nID0gYXR0cmlidXRlU3RhdGUuc2NvcGVbaWRdXG4gICAgICBpZiAoIWJpbmRpbmcpIHtcbiAgICAgICAgYmluZGluZyA9IGF0dHJpYnV0ZVN0YXRlLnNjb3BlW2lkXSA9IG5ldyBBdHRyaWJ1dGVSZWNvcmQoKVxuICAgICAgfVxuICAgICAgdmFyIHJlc3VsdCA9IHNjb3BlQXR0cmlic1tpZF0gPSBsaW5rKGJpbmRpbmcpXG4gICAgICByZXR1cm4gcmVzdWx0XG4gICAgfVxuXG4gICAgcmV0dXJuIGVudlxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBQQVJTSU5HXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgZnVuY3Rpb24gcGFyc2VQcm9maWxlIChvcHRpb25zKSB7XG4gICAgdmFyIHN0YXRpY09wdGlvbnMgPSBvcHRpb25zLnN0YXRpY1xuICAgIHZhciBkeW5hbWljT3B0aW9ucyA9IG9wdGlvbnMuZHluYW1pY1xuXG4gICAgdmFyIHByb2ZpbGVFbmFibGVcbiAgICBpZiAoU19QUk9GSUxFIGluIHN0YXRpY09wdGlvbnMpIHtcbiAgICAgIHZhciB2YWx1ZSA9ICEhc3RhdGljT3B0aW9uc1tTX1BST0ZJTEVdXG4gICAgICBwcm9maWxlRW5hYmxlID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICByZXR1cm4gdmFsdWVcbiAgICAgIH0pXG4gICAgICBwcm9maWxlRW5hYmxlLmVuYWJsZSA9IHZhbHVlXG4gICAgfSBlbHNlIGlmIChTX1BST0ZJTEUgaW4gZHluYW1pY09wdGlvbnMpIHtcbiAgICAgIHZhciBkeW4gPSBkeW5hbWljT3B0aW9uc1tTX1BST0ZJTEVdXG4gICAgICBwcm9maWxlRW5hYmxlID0gY3JlYXRlRHluYW1pY0RlY2woZHluLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICByZXR1cm4gZW52Lmludm9rZShzY29wZSwgZHluKVxuICAgICAgfSlcbiAgICB9XG5cbiAgICByZXR1cm4gcHJvZmlsZUVuYWJsZVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VGcmFtZWJ1ZmZlciAob3B0aW9ucykge1xuICAgIHZhciBzdGF0aWNPcHRpb25zID0gb3B0aW9ucy5zdGF0aWNcbiAgICB2YXIgZHluYW1pY09wdGlvbnMgPSBvcHRpb25zLmR5bmFtaWNcblxuICAgIGlmIChTX0ZSQU1FQlVGRkVSIGluIHN0YXRpY09wdGlvbnMpIHtcbiAgICAgIHZhciBmcmFtZWJ1ZmZlciA9IHN0YXRpY09wdGlvbnNbU19GUkFNRUJVRkZFUl1cbiAgICAgIGlmIChmcmFtZWJ1ZmZlcikge1xuICAgICAgICBmcmFtZWJ1ZmZlciA9IGZyYW1lYnVmZmVyU3RhdGUuZ2V0RnJhbWVidWZmZXIoZnJhbWVidWZmZXIpXG4gICAgICAgIFxuICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBibG9jaykge1xuICAgICAgICAgIHZhciBGUkFNRUJVRkZFUiA9IGVudi5saW5rKGZyYW1lYnVmZmVyKVxuICAgICAgICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgICAgICAgYmxvY2suc2V0KFxuICAgICAgICAgICAgc2hhcmVkLmZyYW1lYnVmZmVyLFxuICAgICAgICAgICAgJy5uZXh0JyxcbiAgICAgICAgICAgIEZSQU1FQlVGRkVSKVxuICAgICAgICAgIHZhciBDT05URVhUID0gc2hhcmVkLmNvbnRleHRcbiAgICAgICAgICBibG9jay5zZXQoXG4gICAgICAgICAgICBDT05URVhULFxuICAgICAgICAgICAgJy4nICsgU19GUkFNRUJVRkZFUl9XSURUSCxcbiAgICAgICAgICAgIEZSQU1FQlVGRkVSICsgJy53aWR0aCcpXG4gICAgICAgICAgYmxvY2suc2V0KFxuICAgICAgICAgICAgQ09OVEVYVCxcbiAgICAgICAgICAgICcuJyArIFNfRlJBTUVCVUZGRVJfSEVJR0hULFxuICAgICAgICAgICAgRlJBTUVCVUZGRVIgKyAnLmhlaWdodCcpXG4gICAgICAgICAgcmV0dXJuIEZSQU1FQlVGRkVSXG4gICAgICAgIH0pXG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgICAgICAgc2NvcGUuc2V0KFxuICAgICAgICAgICAgc2hhcmVkLmZyYW1lYnVmZmVyLFxuICAgICAgICAgICAgJy5uZXh0JyxcbiAgICAgICAgICAgICdudWxsJylcbiAgICAgICAgICB2YXIgQ09OVEVYVCA9IHNoYXJlZC5jb250ZXh0XG4gICAgICAgICAgc2NvcGUuc2V0KFxuICAgICAgICAgICAgQ09OVEVYVCxcbiAgICAgICAgICAgICcuJyArIFNfRlJBTUVCVUZGRVJfV0lEVEgsXG4gICAgICAgICAgICBDT05URVhUICsgJy4nICsgU19EUkFXSU5HQlVGRkVSX1dJRFRIKVxuICAgICAgICAgIHNjb3BlLnNldChcbiAgICAgICAgICAgIENPTlRFWFQsXG4gICAgICAgICAgICAnLicgKyBTX0ZSQU1FQlVGRkVSX0hFSUdIVCxcbiAgICAgICAgICAgIENPTlRFWFQgKyAnLicgKyBTX0RSQVdJTkdCVUZGRVJfSEVJR0hUKVxuICAgICAgICAgIHJldHVybiAnbnVsbCdcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKFNfRlJBTUVCVUZGRVIgaW4gZHluYW1pY09wdGlvbnMpIHtcbiAgICAgIHZhciBkeW4gPSBkeW5hbWljT3B0aW9uc1tTX0ZSQU1FQlVGRkVSXVxuICAgICAgcmV0dXJuIGNyZWF0ZUR5bmFtaWNEZWNsKGR5biwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgdmFyIEZSQU1FQlVGRkVSX0ZVTkMgPSBlbnYuaW52b2tlKHNjb3BlLCBkeW4pXG4gICAgICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgICAgIHZhciBGUkFNRUJVRkZFUl9TVEFURSA9IHNoYXJlZC5mcmFtZWJ1ZmZlclxuICAgICAgICB2YXIgRlJBTUVCVUZGRVIgPSBzY29wZS5kZWYoXG4gICAgICAgICAgRlJBTUVCVUZGRVJfU1RBVEUsICcuZ2V0RnJhbWVidWZmZXIoJywgRlJBTUVCVUZGRVJfRlVOQywgJyknKVxuXG4gICAgICAgIFxuXG4gICAgICAgIHNjb3BlLnNldChcbiAgICAgICAgICBGUkFNRUJVRkZFUl9TVEFURSxcbiAgICAgICAgICAnLm5leHQnLFxuICAgICAgICAgIEZSQU1FQlVGRkVSKVxuICAgICAgICB2YXIgQ09OVEVYVCA9IHNoYXJlZC5jb250ZXh0XG4gICAgICAgIHNjb3BlLnNldChcbiAgICAgICAgICBDT05URVhULFxuICAgICAgICAgICcuJyArIFNfRlJBTUVCVUZGRVJfV0lEVEgsXG4gICAgICAgICAgRlJBTUVCVUZGRVIgKyAnPycgKyBGUkFNRUJVRkZFUiArICcud2lkdGg6JyArXG4gICAgICAgICAgQ09OVEVYVCArICcuJyArIFNfRFJBV0lOR0JVRkZFUl9XSURUSClcbiAgICAgICAgc2NvcGUuc2V0KFxuICAgICAgICAgIENPTlRFWFQsXG4gICAgICAgICAgJy4nICsgU19GUkFNRUJVRkZFUl9IRUlHSFQsXG4gICAgICAgICAgRlJBTUVCVUZGRVIgK1xuICAgICAgICAgICc/JyArIEZSQU1FQlVGRkVSICsgJy5oZWlnaHQ6JyArXG4gICAgICAgICAgQ09OVEVYVCArICcuJyArIFNfRFJBV0lOR0JVRkZFUl9IRUlHSFQpXG4gICAgICAgIHJldHVybiBGUkFNRUJVRkZFUlxuICAgICAgfSlcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZVZpZXdwb3J0U2Npc3NvciAob3B0aW9ucywgZnJhbWVidWZmZXIpIHtcbiAgICB2YXIgc3RhdGljT3B0aW9ucyA9IG9wdGlvbnMuc3RhdGljXG4gICAgdmFyIGR5bmFtaWNPcHRpb25zID0gb3B0aW9ucy5keW5hbWljXG5cbiAgICBmdW5jdGlvbiBwYXJzZUJveCAocGFyYW0pIHtcbiAgICAgIGlmIChwYXJhbSBpbiBzdGF0aWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBib3ggPSBzdGF0aWNPcHRpb25zW3BhcmFtXVxuICAgICAgICBcblxuICAgICAgICB2YXIgaXNTdGF0aWMgPSB0cnVlXG4gICAgICAgIHZhciB4ID0gYm94LnggfCAwXG4gICAgICAgIHZhciB5ID0gYm94LnkgfCAwXG4gICAgICAgIFxuICAgICAgICB2YXIgdywgaFxuICAgICAgICBpZiAoJ3dpZHRoJyBpbiBib3gpIHtcbiAgICAgICAgICB3ID0gYm94LndpZHRoIHwgMFxuICAgICAgICAgIFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlzU3RhdGljID0gZmFsc2VcbiAgICAgICAgfVxuICAgICAgICBpZiAoJ2hlaWdodCcgaW4gYm94KSB7XG4gICAgICAgICAgaCA9IGJveC5oZWlnaHQgfCAwXG4gICAgICAgICAgXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaXNTdGF0aWMgPSBmYWxzZVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG5ldyBEZWNsYXJhdGlvbihcbiAgICAgICAgICAhaXNTdGF0aWMgJiYgZnJhbWVidWZmZXIgJiYgZnJhbWVidWZmZXIudGhpc0RlcCxcbiAgICAgICAgICAhaXNTdGF0aWMgJiYgZnJhbWVidWZmZXIgJiYgZnJhbWVidWZmZXIuY29udGV4dERlcCxcbiAgICAgICAgICAhaXNTdGF0aWMgJiYgZnJhbWVidWZmZXIgJiYgZnJhbWVidWZmZXIucHJvcERlcCxcbiAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgICAgdmFyIENPTlRFWFQgPSBlbnYuc2hhcmVkLmNvbnRleHRcbiAgICAgICAgICAgIHZhciBCT1hfVyA9IHdcbiAgICAgICAgICAgIGlmICghKCd3aWR0aCcgaW4gYm94KSkge1xuICAgICAgICAgICAgICBCT1hfVyA9IHNjb3BlLmRlZihDT05URVhULCAnLicsIFNfRlJBTUVCVUZGRVJfV0lEVEgsICctJywgeClcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIEJPWF9IID0gaFxuICAgICAgICAgICAgaWYgKCEoJ2hlaWdodCcgaW4gYm94KSkge1xuICAgICAgICAgICAgICBCT1hfSCA9IHNjb3BlLmRlZihDT05URVhULCAnLicsIFNfRlJBTUVCVUZGRVJfSEVJR0hULCAnLScsIHkpXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBbeCwgeSwgQk9YX1csIEJPWF9IXVxuICAgICAgICAgIH0pXG4gICAgICB9IGVsc2UgaWYgKHBhcmFtIGluIGR5bmFtaWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBkeW5Cb3ggPSBkeW5hbWljT3B0aW9uc1twYXJhbV1cbiAgICAgICAgdmFyIHJlc3VsdCA9IGNyZWF0ZUR5bmFtaWNEZWNsKGR5bkJveCwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICB2YXIgQk9YID0gZW52Lmludm9rZShzY29wZSwgZHluQm94KVxuXG4gICAgICAgICAgXG5cbiAgICAgICAgICB2YXIgQ09OVEVYVCA9IGVudi5zaGFyZWQuY29udGV4dFxuICAgICAgICAgIHZhciBCT1hfWCA9IHNjb3BlLmRlZihCT1gsICcueHwwJylcbiAgICAgICAgICB2YXIgQk9YX1kgPSBzY29wZS5kZWYoQk9YLCAnLnl8MCcpXG4gICAgICAgICAgdmFyIEJPWF9XID0gc2NvcGUuZGVmKFxuICAgICAgICAgICAgJ1wid2lkdGhcIiBpbiAnLCBCT1gsICc/JywgQk9YLCAnLndpZHRofDA6JyxcbiAgICAgICAgICAgICcoJywgQ09OVEVYVCwgJy4nLCBTX0ZSQU1FQlVGRkVSX1dJRFRILCAnLScsIEJPWF9YLCAnKScpXG4gICAgICAgICAgdmFyIEJPWF9IID0gc2NvcGUuZGVmKFxuICAgICAgICAgICAgJ1wiaGVpZ2h0XCIgaW4gJywgQk9YLCAnPycsIEJPWCwgJy5oZWlnaHR8MDonLFxuICAgICAgICAgICAgJygnLCBDT05URVhULCAnLicsIFNfRlJBTUVCVUZGRVJfSEVJR0hULCAnLScsIEJPWF9ZLCAnKScpXG5cbiAgICAgICAgICBcblxuICAgICAgICAgIHJldHVybiBbQk9YX1gsIEJPWF9ZLCBCT1hfVywgQk9YX0hdXG4gICAgICAgIH0pXG4gICAgICAgIGlmIChmcmFtZWJ1ZmZlcikge1xuICAgICAgICAgIHJlc3VsdC50aGlzRGVwID0gcmVzdWx0LnRoaXNEZXAgfHwgZnJhbWVidWZmZXIudGhpc0RlcFxuICAgICAgICAgIHJlc3VsdC5jb250ZXh0RGVwID0gcmVzdWx0LmNvbnRleHREZXAgfHwgZnJhbWVidWZmZXIuY29udGV4dERlcFxuICAgICAgICAgIHJlc3VsdC5wcm9wRGVwID0gcmVzdWx0LnByb3BEZXAgfHwgZnJhbWVidWZmZXIucHJvcERlcFxuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH0gZWxzZSBpZiAoZnJhbWVidWZmZXIpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBEZWNsYXJhdGlvbihcbiAgICAgICAgICBmcmFtZWJ1ZmZlci50aGlzRGVwLFxuICAgICAgICAgIGZyYW1lYnVmZmVyLmNvbnRleHREZXAsXG4gICAgICAgICAgZnJhbWVidWZmZXIucHJvcERlcCxcbiAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgICAgdmFyIENPTlRFWFQgPSBlbnYuc2hhcmVkLmNvbnRleHRcbiAgICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICAgIDAsIDAsXG4gICAgICAgICAgICAgIHNjb3BlLmRlZihDT05URVhULCAnLicsIFNfRlJBTUVCVUZGRVJfV0lEVEgpLFxuICAgICAgICAgICAgICBzY29wZS5kZWYoQ09OVEVYVCwgJy4nLCBTX0ZSQU1FQlVGRkVSX0hFSUdIVCldXG4gICAgICAgICAgfSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBudWxsXG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFyIHZpZXdwb3J0ID0gcGFyc2VCb3goU19WSUVXUE9SVClcblxuICAgIGlmICh2aWV3cG9ydCkge1xuICAgICAgdmFyIHByZXZWaWV3cG9ydCA9IHZpZXdwb3J0XG4gICAgICB2aWV3cG9ydCA9IG5ldyBEZWNsYXJhdGlvbihcbiAgICAgICAgdmlld3BvcnQudGhpc0RlcCxcbiAgICAgICAgdmlld3BvcnQuY29udGV4dERlcCxcbiAgICAgICAgdmlld3BvcnQucHJvcERlcCxcbiAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICB2YXIgVklFV1BPUlQgPSBwcmV2Vmlld3BvcnQuYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgICAgICAgdmFyIENPTlRFWFQgPSBlbnYuc2hhcmVkLmNvbnRleHRcbiAgICAgICAgICBzY29wZS5zZXQoXG4gICAgICAgICAgICBDT05URVhULFxuICAgICAgICAgICAgJy4nICsgU19WSUVXUE9SVF9XSURUSCxcbiAgICAgICAgICAgIFZJRVdQT1JUWzJdKVxuICAgICAgICAgIHNjb3BlLnNldChcbiAgICAgICAgICAgIENPTlRFWFQsXG4gICAgICAgICAgICAnLicgKyBTX1ZJRVdQT1JUX0hFSUdIVCxcbiAgICAgICAgICAgIFZJRVdQT1JUWzNdKVxuICAgICAgICAgIHJldHVybiBWSUVXUE9SVFxuICAgICAgICB9KVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICB2aWV3cG9ydDogdmlld3BvcnQsXG4gICAgICBzY2lzc29yX2JveDogcGFyc2VCb3goU19TQ0lTU09SX0JPWClcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZVByb2dyYW0gKG9wdGlvbnMpIHtcbiAgICB2YXIgc3RhdGljT3B0aW9ucyA9IG9wdGlvbnMuc3RhdGljXG4gICAgdmFyIGR5bmFtaWNPcHRpb25zID0gb3B0aW9ucy5keW5hbWljXG5cbiAgICBmdW5jdGlvbiBwYXJzZVNoYWRlciAobmFtZSkge1xuICAgICAgaWYgKG5hbWUgaW4gc3RhdGljT3B0aW9ucykge1xuICAgICAgICB2YXIgaWQgPSBzdHJpbmdTdG9yZS5pZChzdGF0aWNPcHRpb25zW25hbWVdKVxuICAgICAgICBcbiAgICAgICAgdmFyIHJlc3VsdCA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHJldHVybiBpZFxuICAgICAgICB9KVxuICAgICAgICByZXN1bHQuaWQgPSBpZFxuICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICB9IGVsc2UgaWYgKG5hbWUgaW4gZHluYW1pY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIGR5biA9IGR5bmFtaWNPcHRpb25zW25hbWVdXG4gICAgICAgIHJldHVybiBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgdmFyIHN0ciA9IGVudi5pbnZva2Uoc2NvcGUsIGR5bilcbiAgICAgICAgICB2YXIgaWQgPSBzY29wZS5kZWYoZW52LnNoYXJlZC5zdHJpbmdzLCAnLmlkKCcsIHN0ciwgJyknKVxuICAgICAgICAgIFxuICAgICAgICAgIHJldHVybiBpZFxuICAgICAgICB9KVxuICAgICAgfVxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG5cbiAgICB2YXIgZnJhZyA9IHBhcnNlU2hhZGVyKFNfRlJBRylcbiAgICB2YXIgdmVydCA9IHBhcnNlU2hhZGVyKFNfVkVSVClcblxuICAgIHZhciBwcm9ncmFtID0gbnVsbFxuICAgIHZhciBwcm9nVmFyXG4gICAgaWYgKGlzU3RhdGljKGZyYWcpICYmIGlzU3RhdGljKHZlcnQpKSB7XG4gICAgICBwcm9ncmFtID0gc2hhZGVyU3RhdGUucHJvZ3JhbSh2ZXJ0LmlkLCBmcmFnLmlkKVxuICAgICAgcHJvZ1ZhciA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgcmV0dXJuIGVudi5saW5rKHByb2dyYW0pXG4gICAgICB9KVxuICAgIH0gZWxzZSB7XG4gICAgICBwcm9nVmFyID0gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgICAoZnJhZyAmJiBmcmFnLnRoaXNEZXApIHx8ICh2ZXJ0ICYmIHZlcnQudGhpc0RlcCksXG4gICAgICAgIChmcmFnICYmIGZyYWcuY29udGV4dERlcCkgfHwgKHZlcnQgJiYgdmVydC5jb250ZXh0RGVwKSxcbiAgICAgICAgKGZyYWcgJiYgZnJhZy5wcm9wRGVwKSB8fCAodmVydCAmJiB2ZXJ0LnByb3BEZXApLFxuICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciBTSEFERVJfU1RBVEUgPSBlbnYuc2hhcmVkLnNoYWRlclxuICAgICAgICAgIHZhciBmcmFnSWRcbiAgICAgICAgICBpZiAoZnJhZykge1xuICAgICAgICAgICAgZnJhZ0lkID0gZnJhZy5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZnJhZ0lkID0gc2NvcGUuZGVmKFNIQURFUl9TVEFURSwgJy4nLCBTX0ZSQUcpXG4gICAgICAgICAgfVxuICAgICAgICAgIHZhciB2ZXJ0SWRcbiAgICAgICAgICBpZiAodmVydCkge1xuICAgICAgICAgICAgdmVydElkID0gdmVydC5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmVydElkID0gc2NvcGUuZGVmKFNIQURFUl9TVEFURSwgJy4nLCBTX1ZFUlQpXG4gICAgICAgICAgfVxuICAgICAgICAgIHZhciBwcm9nRGVmID0gU0hBREVSX1NUQVRFICsgJy5wcm9ncmFtKCcgKyB2ZXJ0SWQgKyAnLCcgKyBmcmFnSWRcbiAgICAgICAgICBcbiAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKHByb2dEZWYgKyAnKScpXG4gICAgICAgIH0pXG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGZyYWc6IGZyYWcsXG4gICAgICB2ZXJ0OiB2ZXJ0LFxuICAgICAgcHJvZ1ZhcjogcHJvZ1ZhcixcbiAgICAgIHByb2dyYW06IHByb2dyYW1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZURyYXcgKG9wdGlvbnMpIHtcbiAgICB2YXIgc3RhdGljT3B0aW9ucyA9IG9wdGlvbnMuc3RhdGljXG4gICAgdmFyIGR5bmFtaWNPcHRpb25zID0gb3B0aW9ucy5keW5hbWljXG5cbiAgICBmdW5jdGlvbiBwYXJzZUVsZW1lbnRzICgpIHtcbiAgICAgIGlmIChTX0VMRU1FTlRTIGluIHN0YXRpY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIGVsZW1lbnRzID0gc3RhdGljT3B0aW9uc1tTX0VMRU1FTlRTXVxuICAgICAgICBpZiAoaXNCdWZmZXJBcmdzKGVsZW1lbnRzKSkge1xuICAgICAgICAgIGVsZW1lbnRzID0gZWxlbWVudFN0YXRlLmdldEVsZW1lbnRzKGVsZW1lbnRTdGF0ZS5jcmVhdGUoZWxlbWVudHMpKVxuICAgICAgICB9IGVsc2UgaWYgKGVsZW1lbnRzKSB7XG4gICAgICAgICAgZWxlbWVudHMgPSBlbGVtZW50U3RhdGUuZ2V0RWxlbWVudHMoZWxlbWVudHMpXG4gICAgICAgICAgXG4gICAgICAgIH1cbiAgICAgICAgdmFyIHJlc3VsdCA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICBpZiAoZWxlbWVudHMpIHtcbiAgICAgICAgICAgIHZhciByZXN1bHQgPSBlbnYubGluayhlbGVtZW50cylcbiAgICAgICAgICAgIGVudi5FTEVNRU5UUyA9IHJlc3VsdFxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgICAgIH1cbiAgICAgICAgICBlbnYuRUxFTUVOVFMgPSBudWxsXG4gICAgICAgICAgcmV0dXJuIG51bGxcbiAgICAgICAgfSlcbiAgICAgICAgcmVzdWx0LnZhbHVlID0gZWxlbWVudHNcbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgfSBlbHNlIGlmIChTX0VMRU1FTlRTIGluIGR5bmFtaWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBkeW4gPSBkeW5hbWljT3B0aW9uc1tTX0VMRU1FTlRTXVxuICAgICAgICByZXR1cm4gY3JlYXRlRHluYW1pY0RlY2woZHluLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG5cbiAgICAgICAgICB2YXIgSVNfQlVGRkVSX0FSR1MgPSBzaGFyZWQuaXNCdWZmZXJBcmdzXG4gICAgICAgICAgdmFyIEVMRU1FTlRfU1RBVEUgPSBzaGFyZWQuZWxlbWVudHNcblxuICAgICAgICAgIHZhciBlbGVtZW50RGVmbiA9IGVudi5pbnZva2Uoc2NvcGUsIGR5bilcbiAgICAgICAgICB2YXIgZWxlbWVudHMgPSBzY29wZS5kZWYoJ251bGwnKVxuICAgICAgICAgIHZhciBlbGVtZW50U3RyZWFtID0gc2NvcGUuZGVmKElTX0JVRkZFUl9BUkdTLCAnKCcsIGVsZW1lbnREZWZuLCAnKScpXG5cbiAgICAgICAgICB2YXIgaWZ0ZSA9IGVudi5jb25kKGVsZW1lbnRTdHJlYW0pXG4gICAgICAgICAgICAudGhlbihlbGVtZW50cywgJz0nLCBFTEVNRU5UX1NUQVRFLCAnLmNyZWF0ZVN0cmVhbSgnLCBlbGVtZW50RGVmbiwgJyk7JylcbiAgICAgICAgICAgIC5lbHNlKGVsZW1lbnRzLCAnPScsIEVMRU1FTlRfU1RBVEUsICcuZ2V0RWxlbWVudHMoJywgZWxlbWVudERlZm4sICcpOycpXG5cbiAgICAgICAgICBcblxuICAgICAgICAgIHNjb3BlLmVudHJ5KGlmdGUpXG4gICAgICAgICAgc2NvcGUuZXhpdChcbiAgICAgICAgICAgIGVudi5jb25kKGVsZW1lbnRTdHJlYW0pXG4gICAgICAgICAgICAgIC50aGVuKEVMRU1FTlRfU1RBVEUsICcuZGVzdHJveVN0cmVhbSgnLCBlbGVtZW50cywgJyk7JykpXG5cbiAgICAgICAgICBlbnYuRUxFTUVOVFMgPSBlbGVtZW50c1xuXG4gICAgICAgICAgcmV0dXJuIGVsZW1lbnRzXG4gICAgICAgIH0pXG4gICAgICB9XG5cbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuXG4gICAgdmFyIGVsZW1lbnRzID0gcGFyc2VFbGVtZW50cygpXG5cbiAgICBmdW5jdGlvbiBwYXJzZVByaW1pdGl2ZSAoKSB7XG4gICAgICBpZiAoU19QUklNSVRJVkUgaW4gc3RhdGljT3B0aW9ucykge1xuICAgICAgICB2YXIgcHJpbWl0aXZlID0gc3RhdGljT3B0aW9uc1tTX1BSSU1JVElWRV1cbiAgICAgICAgXG4gICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgcmV0dXJuIHByaW1UeXBlc1twcmltaXRpdmVdXG4gICAgICAgIH0pXG4gICAgICB9IGVsc2UgaWYgKFNfUFJJTUlUSVZFIGluIGR5bmFtaWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBkeW5QcmltaXRpdmUgPSBkeW5hbWljT3B0aW9uc1tTX1BSSU1JVElWRV1cbiAgICAgICAgcmV0dXJuIGNyZWF0ZUR5bmFtaWNEZWNsKGR5blByaW1pdGl2ZSwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICB2YXIgUFJJTV9UWVBFUyA9IGVudi5jb25zdGFudHMucHJpbVR5cGVzXG4gICAgICAgICAgdmFyIHByaW0gPSBlbnYuaW52b2tlKHNjb3BlLCBkeW5QcmltaXRpdmUpXG4gICAgICAgICAgXG4gICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihQUklNX1RZUEVTLCAnWycsIHByaW0sICddJylcbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSBpZiAoZWxlbWVudHMpIHtcbiAgICAgICAgaWYgKGlzU3RhdGljKGVsZW1lbnRzKSkge1xuICAgICAgICAgIGlmIChlbGVtZW50cy52YWx1ZSkge1xuICAgICAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihlbnYuRUxFTUVOVFMsICcucHJpbVR5cGUnKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICByZXR1cm4gR0xfVFJJQU5HTEVTXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgICAgICAgZWxlbWVudHMudGhpc0RlcCxcbiAgICAgICAgICAgIGVsZW1lbnRzLmNvbnRleHREZXAsXG4gICAgICAgICAgICBlbGVtZW50cy5wcm9wRGVwLFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICAgICAgdmFyIGVsZW1lbnRzID0gZW52LkVMRU1FTlRTXG4gICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoZWxlbWVudHMsICc/JywgZWxlbWVudHMsICcucHJpbVR5cGU6JywgR0xfVFJJQU5HTEVTKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwYXJzZVBhcmFtIChwYXJhbSwgaXNPZmZzZXQpIHtcbiAgICAgIGlmIChwYXJhbSBpbiBzdGF0aWNPcHRpb25zKSB7XG4gICAgICAgIHZhciB2YWx1ZSA9IHN0YXRpY09wdGlvbnNbcGFyYW1dIHwgMFxuICAgICAgICBcbiAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICBpZiAoaXNPZmZzZXQpIHtcbiAgICAgICAgICAgIGVudi5PRkZTRVQgPSB2YWx1ZVxuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdmFsdWVcbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSBpZiAocGFyYW0gaW4gZHluYW1pY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIGR5blZhbHVlID0gZHluYW1pY09wdGlvbnNbcGFyYW1dXG4gICAgICAgIHJldHVybiBjcmVhdGVEeW5hbWljRGVjbChkeW5WYWx1ZSwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICB2YXIgcmVzdWx0ID0gZW52Lmludm9rZShzY29wZSwgZHluVmFsdWUpXG4gICAgICAgICAgaWYgKGlzT2Zmc2V0KSB7XG4gICAgICAgICAgICBlbnYuT0ZGU0VUID0gcmVzdWx0XG4gICAgICAgICAgICBcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIGlmIChpc09mZnNldCAmJiBlbGVtZW50cykge1xuICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIGVudi5PRkZTRVQgPSAnMCdcbiAgICAgICAgICByZXR1cm4gMFxuICAgICAgICB9KVxuICAgICAgfVxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG5cbiAgICB2YXIgT0ZGU0VUID0gcGFyc2VQYXJhbShTX09GRlNFVCwgdHJ1ZSlcblxuICAgIGZ1bmN0aW9uIHBhcnNlVmVydENvdW50ICgpIHtcbiAgICAgIGlmIChTX0NPVU5UIGluIHN0YXRpY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIGNvdW50ID0gc3RhdGljT3B0aW9uc1tTX0NPVU5UXSB8IDBcbiAgICAgICAgXG4gICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICByZXR1cm4gY291bnRcbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSBpZiAoU19DT1VOVCBpbiBkeW5hbWljT3B0aW9ucykge1xuICAgICAgICB2YXIgZHluQ291bnQgPSBkeW5hbWljT3B0aW9uc1tTX0NPVU5UXVxuICAgICAgICByZXR1cm4gY3JlYXRlRHluYW1pY0RlY2woZHluQ291bnQsIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgdmFyIHJlc3VsdCA9IGVudi5pbnZva2Uoc2NvcGUsIGR5bkNvdW50KVxuICAgICAgICAgIFxuICAgICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSBpZiAoZWxlbWVudHMpIHtcbiAgICAgICAgaWYgKGlzU3RhdGljKGVsZW1lbnRzKSkge1xuICAgICAgICAgIGlmIChlbGVtZW50cykge1xuICAgICAgICAgICAgaWYgKE9GRlNFVCkge1xuICAgICAgICAgICAgICByZXR1cm4gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgICAgICAgICAgIE9GRlNFVC50aGlzRGVwLFxuICAgICAgICAgICAgICAgIE9GRlNFVC5jb250ZXh0RGVwLFxuICAgICAgICAgICAgICAgIE9GRlNFVC5wcm9wRGVwLFxuICAgICAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgICAgICAgICB2YXIgcmVzdWx0ID0gc2NvcGUuZGVmKFxuICAgICAgICAgICAgICAgICAgICBlbnYuRUxFTUVOVFMsICcudmVydENvdW50LScsIGVudi5PRkZTRVQpXG5cbiAgICAgICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihlbnYuRUxFTUVOVFMsICcudmVydENvdW50JylcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFyIHJlc3VsdCA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICByZXR1cm4gLTFcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdmFyIHZhcmlhYmxlID0gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgICAgICAgZWxlbWVudHMudGhpc0RlcCB8fCBPRkZTRVQudGhpc0RlcCxcbiAgICAgICAgICAgIGVsZW1lbnRzLmNvbnRleHREZXAgfHwgT0ZGU0VULmNvbnRleHREZXAsXG4gICAgICAgICAgICBlbGVtZW50cy5wcm9wRGVwIHx8IE9GRlNFVC5wcm9wRGVwLFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICAgICAgdmFyIGVsZW1lbnRzID0gZW52LkVMRU1FTlRTXG4gICAgICAgICAgICAgIGlmIChlbnYuT0ZGU0VUKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihlbGVtZW50cywgJz8nLCBlbGVtZW50cywgJy52ZXJ0Q291bnQtJyxcbiAgICAgICAgICAgICAgICAgIGVudi5PRkZTRVQsICc6LTEnKVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoZWxlbWVudHMsICc/JywgZWxlbWVudHMsICcudmVydENvdW50Oi0xJylcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgXG4gICAgICAgICAgcmV0dXJuIHZhcmlhYmxlXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGVsZW1lbnRzOiBlbGVtZW50cyxcbiAgICAgIHByaW1pdGl2ZTogcGFyc2VQcmltaXRpdmUoKSxcbiAgICAgIGNvdW50OiBwYXJzZVZlcnRDb3VudCgpLFxuICAgICAgaW5zdGFuY2VzOiBwYXJzZVBhcmFtKFNfSU5TVEFOQ0VTLCBmYWxzZSksXG4gICAgICBvZmZzZXQ6IE9GRlNFVFxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlR0xTdGF0ZSAob3B0aW9ucykge1xuICAgIHZhciBzdGF0aWNPcHRpb25zID0gb3B0aW9ucy5zdGF0aWNcbiAgICB2YXIgZHluYW1pY09wdGlvbnMgPSBvcHRpb25zLmR5bmFtaWNcblxuICAgIHZhciBTVEFURSA9IHt9XG5cbiAgICBHTF9TVEFURV9OQU1FUy5mb3JFYWNoKGZ1bmN0aW9uIChwcm9wKSB7XG4gICAgICB2YXIgcGFyYW0gPSBwcm9wTmFtZShwcm9wKVxuXG4gICAgICBmdW5jdGlvbiBwYXJzZVBhcmFtIChwYXJzZVN0YXRpYywgcGFyc2VEeW5hbWljKSB7XG4gICAgICAgIGlmIChwcm9wIGluIHN0YXRpY09wdGlvbnMpIHtcbiAgICAgICAgICB2YXIgdmFsdWUgPSBwYXJzZVN0YXRpYyhzdGF0aWNPcHRpb25zW3Byb3BdKVxuICAgICAgICAgIFNUQVRFW3BhcmFtXSA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHZhbHVlXG4gICAgICAgICAgfSlcbiAgICAgICAgfSBlbHNlIGlmIChwcm9wIGluIGR5bmFtaWNPcHRpb25zKSB7XG4gICAgICAgICAgdmFyIGR5biA9IGR5bmFtaWNPcHRpb25zW3Byb3BdXG4gICAgICAgICAgU1RBVEVbcGFyYW1dID0gY3JlYXRlRHluYW1pY0RlY2woZHluLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgICAgcmV0dXJuIHBhcnNlRHluYW1pYyhlbnYsIHNjb3BlLCBlbnYuaW52b2tlKHNjb3BlLCBkeW4pKVxuICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgc3dpdGNoIChwcm9wKSB7XG4gICAgICAgIGNhc2UgU19DVUxMX0VOQUJMRTpcbiAgICAgICAgY2FzZSBTX0JMRU5EX0VOQUJMRTpcbiAgICAgICAgY2FzZSBTX0RJVEhFUjpcbiAgICAgICAgY2FzZSBTX1NURU5DSUxfRU5BQkxFOlxuICAgICAgICBjYXNlIFNfREVQVEhfRU5BQkxFOlxuICAgICAgICBjYXNlIFNfU0NJU1NPUl9FTkFCTEU6XG4gICAgICAgIGNhc2UgU19QT0xZR09OX09GRlNFVF9FTkFCTEU6XG4gICAgICAgIGNhc2UgU19TQU1QTEVfQUxQSEE6XG4gICAgICAgIGNhc2UgU19TQU1QTEVfRU5BQkxFOlxuICAgICAgICBjYXNlIFNfREVQVEhfTUFTSzpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gdmFsdWVcbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX0RFUFRIX0ZVTkM6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBjb21wYXJlRnVuY3NbdmFsdWVdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIHZhciBDT01QQVJFX0ZVTkNTID0gZW52LmNvbnN0YW50cy5jb21wYXJlRnVuY3NcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoQ09NUEFSRV9GVU5DUywgJ1snLCB2YWx1ZSwgJ10nKVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfREVQVEhfUkFOR0U6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBcblxuICAgICAgICAgICAgICB2YXIgWl9ORUFSID0gc2NvcGUuZGVmKCcrJywgdmFsdWUsICdbMF0nKVxuICAgICAgICAgICAgICB2YXIgWl9GQVIgPSBzY29wZS5kZWYoJysnLCB2YWx1ZSwgJ1sxXScpXG4gICAgICAgICAgICAgIHJldHVybiBbWl9ORUFSLCBaX0ZBUl1cbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX0JMRU5EX0ZVTkM6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHZhciBzcmNSR0IgPSAoJ3NyY1JHQicgaW4gdmFsdWUgPyB2YWx1ZS5zcmNSR0IgOiB2YWx1ZS5zcmMpXG4gICAgICAgICAgICAgIHZhciBzcmNBbHBoYSA9ICgnc3JjQWxwaGEnIGluIHZhbHVlID8gdmFsdWUuc3JjQWxwaGEgOiB2YWx1ZS5zcmMpXG4gICAgICAgICAgICAgIHZhciBkc3RSR0IgPSAoJ2RzdFJHQicgaW4gdmFsdWUgPyB2YWx1ZS5kc3RSR0IgOiB2YWx1ZS5kc3QpXG4gICAgICAgICAgICAgIHZhciBkc3RBbHBoYSA9ICgnZHN0QWxwaGEnIGluIHZhbHVlID8gdmFsdWUuZHN0QWxwaGEgOiB2YWx1ZS5kc3QpXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgICAgIGJsZW5kRnVuY3Nbc3JjUkdCXSxcbiAgICAgICAgICAgICAgICBibGVuZEZ1bmNzW2RzdFJHQl0sXG4gICAgICAgICAgICAgICAgYmxlbmRGdW5jc1tzcmNBbHBoYV0sXG4gICAgICAgICAgICAgICAgYmxlbmRGdW5jc1tkc3RBbHBoYV1cbiAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICB2YXIgQkxFTkRfRlVOQ1MgPSBlbnYuY29uc3RhbnRzLmJsZW5kRnVuY3NcblxuICAgICAgICAgICAgICBcblxuICAgICAgICAgICAgICBmdW5jdGlvbiByZWFkIChwcmVmaXgsIHN1ZmZpeCkge1xuICAgICAgICAgICAgICAgIHZhciBmdW5jID0gc2NvcGUuZGVmKFxuICAgICAgICAgICAgICAgICAgJ1wiJywgcHJlZml4LCBzdWZmaXgsICdcIiBpbiAnLCB2YWx1ZSxcbiAgICAgICAgICAgICAgICAgICc/JywgdmFsdWUsICcuJywgcHJlZml4LCBzdWZmaXgsXG4gICAgICAgICAgICAgICAgICAnOicsIHZhbHVlLCAnLicsIHByZWZpeClcblxuICAgICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihCTEVORF9GVU5DUywgJ1snLCBmdW5jLCAnXScpXG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICB2YXIgU1JDX1JHQiA9IHJlYWQoJ3NyYycsICdSR0InKVxuICAgICAgICAgICAgICB2YXIgU1JDX0FMUEhBID0gcmVhZCgnc3JjJywgJ0FscGhhJylcbiAgICAgICAgICAgICAgdmFyIERTVF9SR0IgPSByZWFkKCdkc3QnLCAnUkdCJylcbiAgICAgICAgICAgICAgdmFyIERTVF9BTFBIQSA9IHJlYWQoJ2RzdCcsICdBbHBoYScpXG5cbiAgICAgICAgICAgICAgcmV0dXJuIFtTUkNfUkdCLCBEU1RfUkdCLCBTUkNfQUxQSEEsIERTVF9BTFBIQV1cbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX0JMRU5EX0VRVUFUSU9OOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgICAgIGJsZW5kRXF1YXRpb25zW3ZhbHVlXSxcbiAgICAgICAgICAgICAgICAgIGJsZW5kRXF1YXRpb25zW3ZhbHVlXVxuICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgICAgIGJsZW5kRXF1YXRpb25zW3ZhbHVlLnJnYl0sXG4gICAgICAgICAgICAgICAgICBibGVuZEVxdWF0aW9uc1t2YWx1ZS5hbHBoYV1cbiAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgdmFyIEJMRU5EX0VRVUFUSU9OUyA9IGVudi5jb25zdGFudHMuYmxlbmRFcXVhdGlvbnNcblxuICAgICAgICAgICAgICB2YXIgUkdCID0gc2NvcGUuZGVmKClcbiAgICAgICAgICAgICAgdmFyIEFMUEhBID0gc2NvcGUuZGVmKClcblxuICAgICAgICAgICAgICB2YXIgaWZ0ZSA9IGVudi5jb25kKCd0eXBlb2YgJywgdmFsdWUsICc9PT1cInN0cmluZ1wiJylcblxuICAgICAgICAgICAgICBcblxuICAgICAgICAgICAgICBpZnRlLnRoZW4oXG4gICAgICAgICAgICAgICAgUkdCLCAnPScsIEFMUEhBLCAnPScsIEJMRU5EX0VRVUFUSU9OUywgJ1snLCB2YWx1ZSwgJ107JylcbiAgICAgICAgICAgICAgaWZ0ZS5lbHNlKFxuICAgICAgICAgICAgICAgIFJHQiwgJz0nLCBCTEVORF9FUVVBVElPTlMsICdbJywgdmFsdWUsICcucmdiXTsnLFxuICAgICAgICAgICAgICAgIEFMUEhBLCAnPScsIEJMRU5EX0VRVUFUSU9OUywgJ1snLCB2YWx1ZSwgJy5hbHBoYV07JylcblxuICAgICAgICAgICAgICBzY29wZShpZnRlKVxuXG4gICAgICAgICAgICAgIHJldHVybiBbUkdCLCBBTFBIQV1cbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX0JMRU5EX0NPTE9SOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gbG9vcCg0LCBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgICAgICAgIHJldHVybiArdmFsdWVbaV1cbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBsb29wKDQsIGZ1bmN0aW9uIChpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZignKycsIHZhbHVlLCAnWycsIGksICddJylcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX1NURU5DSUxfTUFTSzpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlIHwgMFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZih2YWx1ZSwgJ3wwJylcbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX1NURU5DSUxfRlVOQzpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgdmFyIGNtcCA9IHZhbHVlLmNtcCB8fCAna2VlcCdcbiAgICAgICAgICAgICAgdmFyIHJlZiA9IHZhbHVlLnJlZiB8fCAwXG4gICAgICAgICAgICAgIHZhciBtYXNrID0gJ21hc2snIGluIHZhbHVlID8gdmFsdWUubWFzayA6IC0xXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICAgICAgY29tcGFyZUZ1bmNzW2NtcF0sXG4gICAgICAgICAgICAgICAgcmVmLFxuICAgICAgICAgICAgICAgIG1hc2tcbiAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICB2YXIgQ09NUEFSRV9GVU5DUyA9IGVudi5jb25zdGFudHMuY29tcGFyZUZ1bmNzXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICB2YXIgY21wID0gc2NvcGUuZGVmKFxuICAgICAgICAgICAgICAgICdcImNtcFwiIGluICcsIHZhbHVlLFxuICAgICAgICAgICAgICAgICc/JywgQ09NUEFSRV9GVU5DUywgJ1snLCB2YWx1ZSwgJy5jbXBdJyxcbiAgICAgICAgICAgICAgICAnOicsIEdMX0tFRVApXG4gICAgICAgICAgICAgIHZhciByZWYgPSBzY29wZS5kZWYodmFsdWUsICcucmVmfDAnKVxuICAgICAgICAgICAgICB2YXIgbWFzayA9IHNjb3BlLmRlZihcbiAgICAgICAgICAgICAgICAnXCJtYXNrXCIgaW4gJywgdmFsdWUsXG4gICAgICAgICAgICAgICAgJz8nLCB2YWx1ZSwgJy5tYXNrfDA6LTEnKVxuICAgICAgICAgICAgICByZXR1cm4gW2NtcCwgcmVmLCBtYXNrXVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfU1RFTkNJTF9PUEZST05UOlxuICAgICAgICBjYXNlIFNfU1RFTkNJTF9PUEJBQ0s6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHZhciBmYWlsID0gdmFsdWUuZmFpbCB8fCAna2VlcCdcbiAgICAgICAgICAgICAgdmFyIHpmYWlsID0gdmFsdWUuemZhaWwgfHwgJ2tlZXAnXG4gICAgICAgICAgICAgIHZhciBwYXNzID0gdmFsdWUucGFzcyB8fCAna2VlcCdcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgICBwcm9wID09PSBTX1NURU5DSUxfT1BCQUNLID8gR0xfQkFDSyA6IEdMX0ZST05ULFxuICAgICAgICAgICAgICAgIHN0ZW5jaWxPcHNbZmFpbF0sXG4gICAgICAgICAgICAgICAgc3RlbmNpbE9wc1t6ZmFpbF0sXG4gICAgICAgICAgICAgICAgc3RlbmNpbE9wc1twYXNzXVxuICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIHZhciBTVEVOQ0lMX09QUyA9IGVudi5jb25zdGFudHMuc3RlbmNpbE9wc1xuXG4gICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgIGZ1bmN0aW9uIHJlYWQgKG5hbWUpIHtcbiAgICAgICAgICAgICAgICBcblxuICAgICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoXG4gICAgICAgICAgICAgICAgICAnXCInLCBuYW1lLCAnXCIgaW4gJywgdmFsdWUsXG4gICAgICAgICAgICAgICAgICAnPycsIFNURU5DSUxfT1BTLCAnWycsIHZhbHVlLCAnLicsIG5hbWUsICddOicsXG4gICAgICAgICAgICAgICAgICBHTF9LRUVQKVxuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgICBwcm9wID09PSBTX1NURU5DSUxfT1BCQUNLID8gR0xfQkFDSyA6IEdMX0ZST05ULFxuICAgICAgICAgICAgICAgIHJlYWQoJ2ZhaWwnKSxcbiAgICAgICAgICAgICAgICByZWFkKCd6ZmFpbCcpLFxuICAgICAgICAgICAgICAgIHJlYWQoJ3Bhc3MnKVxuICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19QT0xZR09OX09GRlNFVF9PRkZTRVQ6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHZhciBmYWN0b3IgPSB2YWx1ZS5mYWN0b3IgfCAwXG4gICAgICAgICAgICAgIHZhciB1bml0cyA9IHZhbHVlLnVuaXRzIHwgMFxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBbZmFjdG9yLCB1bml0c11cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgXG5cbiAgICAgICAgICAgICAgdmFyIEZBQ1RPUiA9IHNjb3BlLmRlZih2YWx1ZSwgJy5mYWN0b3J8MCcpXG4gICAgICAgICAgICAgIHZhciBVTklUUyA9IHNjb3BlLmRlZih2YWx1ZSwgJy51bml0c3wwJylcblxuICAgICAgICAgICAgICByZXR1cm4gW0ZBQ1RPUiwgVU5JVFNdXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19DVUxMX0ZBQ0U6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgdmFyIGZhY2UgPSAwXG4gICAgICAgICAgICAgIGlmICh2YWx1ZSA9PT0gJ2Zyb250Jykge1xuICAgICAgICAgICAgICAgIGZhY2UgPSBHTF9GUk9OVFxuICAgICAgICAgICAgICB9IGVsc2UgaWYgKHZhbHVlID09PSAnYmFjaycpIHtcbiAgICAgICAgICAgICAgICBmYWNlID0gR0xfQkFDS1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gZmFjZVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZih2YWx1ZSwgJz09PVwiZnJvbnRcIj8nLCBHTF9GUk9OVCwgJzonLCBHTF9CQUNLKVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfTElORV9XSURUSDpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfRlJPTlRfRkFDRTpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIG9yaWVudGF0aW9uVHlwZVt2YWx1ZV1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYodmFsdWUgKyAnPT09XCJjd1wiPycgKyBHTF9DVyArICc6JyArIEdMX0NDVylcbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX0NPTE9SX01BU0s6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZS5tYXAoZnVuY3Rpb24gKHYpIHsgcmV0dXJuICEhdiB9KVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIGxvb3AoNCwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gJyEhJyArIHZhbHVlICsgJ1snICsgaSArICddJ1xuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfU0FNUExFX0NPVkVSQUdFOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICB2YXIgc2FtcGxlVmFsdWUgPSAndmFsdWUnIGluIHZhbHVlID8gdmFsdWUudmFsdWUgOiAxXG4gICAgICAgICAgICAgIHZhciBzYW1wbGVJbnZlcnQgPSAhIXZhbHVlLmludmVydFxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIFtzYW1wbGVWYWx1ZSwgc2FtcGxlSW52ZXJ0XVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgdmFyIFZBTFVFID0gc2NvcGUuZGVmKFxuICAgICAgICAgICAgICAgICdcInZhbHVlXCIgaW4gJywgdmFsdWUsICc/KycsIHZhbHVlLCAnLnZhbHVlOjEnKVxuICAgICAgICAgICAgICB2YXIgSU5WRVJUID0gc2NvcGUuZGVmKCchIScsIHZhbHVlLCAnLmludmVydCcpXG4gICAgICAgICAgICAgIHJldHVybiBbVkFMVUUsIElOVkVSVF1cbiAgICAgICAgICAgIH0pXG4gICAgICB9XG4gICAgfSlcblxuICAgIHJldHVybiBTVEFURVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VPcHRpb25zIChvcHRpb25zKSB7XG4gICAgdmFyIHN0YXRpY09wdGlvbnMgPSBvcHRpb25zLnN0YXRpY1xuICAgIHZhciBkeW5hbWljT3B0aW9ucyA9IG9wdGlvbnMuZHluYW1pY1xuXG4gICAgXG5cbiAgICB2YXIgZnJhbWVidWZmZXIgPSBwYXJzZUZyYW1lYnVmZmVyKG9wdGlvbnMpXG4gICAgdmFyIHZpZXdwb3J0QW5kU2Npc3NvciA9IHBhcnNlVmlld3BvcnRTY2lzc29yKG9wdGlvbnMsIGZyYW1lYnVmZmVyKVxuICAgIHZhciBkcmF3ID0gcGFyc2VEcmF3KG9wdGlvbnMpXG4gICAgdmFyIHN0YXRlID0gcGFyc2VHTFN0YXRlKG9wdGlvbnMpXG4gICAgdmFyIHNoYWRlciA9IHBhcnNlUHJvZ3JhbShvcHRpb25zKVxuXG4gICAgZnVuY3Rpb24gY29weUJveCAobmFtZSkge1xuICAgICAgdmFyIGRlZm4gPSB2aWV3cG9ydEFuZFNjaXNzb3JbbmFtZV1cbiAgICAgIGlmIChkZWZuKSB7XG4gICAgICAgIHN0YXRlW25hbWVdID0gZGVmblxuICAgICAgfVxuICAgIH1cbiAgICBjb3B5Qm94KFNfVklFV1BPUlQpXG4gICAgY29weUJveChwcm9wTmFtZShTX1NDSVNTT1JfQk9YKSlcblxuICAgIHZhciBkaXJ0eSA9IE9iamVjdC5rZXlzKHN0YXRlKS5sZW5ndGggPiAwXG5cbiAgICByZXR1cm4ge1xuICAgICAgZnJhbWVidWZmZXI6IGZyYW1lYnVmZmVyLFxuICAgICAgZHJhdzogZHJhdyxcbiAgICAgIHNoYWRlcjogc2hhZGVyLFxuICAgICAgc3RhdGU6IHN0YXRlLFxuICAgICAgZGlydHk6IGRpcnR5XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VVbmlmb3JtcyAodW5pZm9ybXMpIHtcbiAgICB2YXIgc3RhdGljVW5pZm9ybXMgPSB1bmlmb3Jtcy5zdGF0aWNcbiAgICB2YXIgZHluYW1pY1VuaWZvcm1zID0gdW5pZm9ybXMuZHluYW1pY1xuXG4gICAgdmFyIFVOSUZPUk1TID0ge31cblxuICAgIE9iamVjdC5rZXlzKHN0YXRpY1VuaWZvcm1zKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICB2YXIgdmFsdWUgPSBzdGF0aWNVbmlmb3Jtc1tuYW1lXVxuICAgICAgdmFyIHJlc3VsdFxuICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgfHxcbiAgICAgICAgICB0eXBlb2YgdmFsdWUgPT09ICdib29sZWFuJykge1xuICAgICAgICByZXN1bHQgPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICByZXR1cm4gdmFsdWVcbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHZhciByZWdsVHlwZSA9IHZhbHVlLl9yZWdsVHlwZVxuICAgICAgICBpZiAocmVnbFR5cGUgPT09ICd0ZXh0dXJlMmQnIHx8XG4gICAgICAgICAgICByZWdsVHlwZSA9PT0gJ3RleHR1cmVDdWJlJykge1xuICAgICAgICAgIHJlc3VsdCA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudikge1xuICAgICAgICAgICAgcmV0dXJuIGVudi5saW5rKHZhbHVlKVxuICAgICAgICAgIH0pXG4gICAgICAgIH0gZWxzZSBpZiAocmVnbFR5cGUgPT09ICdmcmFtZWJ1ZmZlcicgfHxcbiAgICAgICAgICAgICAgICAgICByZWdsVHlwZSA9PT0gJ2ZyYW1lYnVmZmVyQ3ViZScpIHtcbiAgICAgICAgICBcbiAgICAgICAgICByZXN1bHQgPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYpIHtcbiAgICAgICAgICAgIHJldHVybiBlbnYubGluayh2YWx1ZS5jb2xvclswXSlcbiAgICAgICAgICB9KVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIFxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGlzQXJyYXlMaWtlKHZhbHVlKSkge1xuICAgICAgICByZXN1bHQgPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYpIHtcbiAgICAgICAgICB2YXIgSVRFTSA9IGVudi5nbG9iYWwuZGVmKCdbJyxcbiAgICAgICAgICAgIGxvb3AodmFsdWUubGVuZ3RoLCBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlW2ldXG4gICAgICAgICAgICB9KSwgJ10nKVxuICAgICAgICAgIHJldHVybiBJVEVNXG4gICAgICAgIH0pXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBcbiAgICAgIH1cbiAgICAgIHJlc3VsdC52YWx1ZSA9IHZhbHVlXG4gICAgICBVTklGT1JNU1tuYW1lXSA9IHJlc3VsdFxuICAgIH0pXG5cbiAgICBPYmplY3Qua2V5cyhkeW5hbWljVW5pZm9ybXMpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgdmFyIGR5biA9IGR5bmFtaWNVbmlmb3Jtc1trZXldXG4gICAgICBVTklGT1JNU1trZXldID0gY3JlYXRlRHluYW1pY0RlY2woZHluLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICByZXR1cm4gZW52Lmludm9rZShzY29wZSwgZHluKVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgcmV0dXJuIFVOSUZPUk1TXG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZUF0dHJpYnV0ZXMgKGF0dHJpYnV0ZXMpIHtcbiAgICB2YXIgc3RhdGljQXR0cmlidXRlcyA9IGF0dHJpYnV0ZXMuc3RhdGljXG4gICAgdmFyIGR5bmFtaWNBdHRyaWJ1dGVzID0gYXR0cmlidXRlcy5keW5hbWljXG5cbiAgICB2YXIgYXR0cmlidXRlRGVmcyA9IHt9XG5cbiAgICBPYmplY3Qua2V5cyhzdGF0aWNBdHRyaWJ1dGVzKS5mb3JFYWNoKGZ1bmN0aW9uIChhdHRyaWJ1dGUpIHtcbiAgICAgIHZhciB2YWx1ZSA9IHN0YXRpY0F0dHJpYnV0ZXNbYXR0cmlidXRlXVxuICAgICAgdmFyIGlkID0gc3RyaW5nU3RvcmUuaWQoYXR0cmlidXRlKVxuXG4gICAgICB2YXIgcmVjb3JkID0gbmV3IEF0dHJpYnV0ZVJlY29yZCgpXG4gICAgICBpZiAoaXNCdWZmZXJBcmdzKHZhbHVlKSkge1xuICAgICAgICByZWNvcmQuc3RhdGUgPSBBVFRSSUJfU1RBVEVfUE9JTlRFUlxuICAgICAgICByZWNvcmQuYnVmZmVyID0gYnVmZmVyU3RhdGUuZ2V0QnVmZmVyKFxuICAgICAgICAgIGJ1ZmZlclN0YXRlLmNyZWF0ZSh2YWx1ZSwgR0xfQVJSQVlfQlVGRkVSLCBmYWxzZSkpXG4gICAgICAgIHJlY29yZC50eXBlID0gcmVjb3JkLmJ1ZmZlci5kdHlwZVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIGJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmdldEJ1ZmZlcih2YWx1ZSlcbiAgICAgICAgaWYgKGJ1ZmZlcikge1xuICAgICAgICAgIHJlY29yZC5zdGF0ZSA9IEFUVFJJQl9TVEFURV9QT0lOVEVSXG4gICAgICAgICAgcmVjb3JkLmJ1ZmZlciA9IGJ1ZmZlclxuICAgICAgICAgIHJlY29yZC50eXBlID0gYnVmZmVyLmR0eXBlXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKHZhbHVlLmNvbnN0YW50KSB7XG4gICAgICAgICAgICB2YXIgY29uc3RhbnQgPSB2YWx1ZS5jb25zdGFudFxuICAgICAgICAgICAgcmVjb3JkLmJ1ZmZlciA9ICdudWxsJ1xuICAgICAgICAgICAgcmVjb3JkLnN0YXRlID0gQVRUUklCX1NUQVRFX0NPTlNUQU5UXG4gICAgICAgICAgICBpZiAodHlwZW9mIGNvbnN0YW50ID09PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgICByZWNvcmQueCA9IGNvbnN0YW50XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgQ1VURV9DT01QT05FTlRTLmZvckVhY2goZnVuY3Rpb24gKGMsIGkpIHtcbiAgICAgICAgICAgICAgICBpZiAoaSA8IGNvbnN0YW50Lmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgcmVjb3JkW2NdID0gY29uc3RhbnRbaV1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmdldEJ1ZmZlcih2YWx1ZS5idWZmZXIpXG4gICAgICAgICAgICBcblxuICAgICAgICAgICAgdmFyIG9mZnNldCA9IHZhbHVlLm9mZnNldCB8IDBcbiAgICAgICAgICAgIFxuXG4gICAgICAgICAgICB2YXIgc3RyaWRlID0gdmFsdWUuc3RyaWRlIHwgMFxuICAgICAgICAgICAgXG5cbiAgICAgICAgICAgIHZhciBzaXplID0gdmFsdWUuc2l6ZSB8IDBcbiAgICAgICAgICAgIFxuXG4gICAgICAgICAgICB2YXIgbm9ybWFsaXplZCA9ICEhdmFsdWUubm9ybWFsaXplZFxuXG4gICAgICAgICAgICB2YXIgdHlwZSA9IDBcbiAgICAgICAgICAgIGlmICgndHlwZScgaW4gdmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHR5cGUgPSBnbFR5cGVzW3ZhbHVlLnR5cGVdXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBkaXZpc29yID0gdmFsdWUuZGl2aXNvciB8IDBcbiAgICAgICAgICAgIGlmICgnZGl2aXNvcicgaW4gdmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBcblxuICAgICAgICAgICAgcmVjb3JkLmJ1ZmZlciA9IGJ1ZmZlclxuICAgICAgICAgICAgcmVjb3JkLnN0YXRlID0gQVRUUklCX1NUQVRFX1BPSU5URVJcbiAgICAgICAgICAgIHJlY29yZC5zaXplID0gc2l6ZVxuICAgICAgICAgICAgcmVjb3JkLm5vcm1hbGl6ZWQgPSBub3JtYWxpemVkXG4gICAgICAgICAgICByZWNvcmQudHlwZSA9IHR5cGUgfHwgYnVmZmVyLmR0eXBlXG4gICAgICAgICAgICByZWNvcmQub2Zmc2V0ID0gb2Zmc2V0XG4gICAgICAgICAgICByZWNvcmQuc3RyaWRlID0gc3RyaWRlXG4gICAgICAgICAgICByZWNvcmQuZGl2aXNvciA9IGRpdmlzb3JcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgYXR0cmlidXRlRGVmc1thdHRyaWJ1dGVdID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICB2YXIgY2FjaGUgPSBlbnYuYXR0cmliQ2FjaGVcbiAgICAgICAgaWYgKGlkIGluIGNhY2hlKSB7XG4gICAgICAgICAgcmV0dXJuIGNhY2hlW2lkXVxuICAgICAgICB9XG4gICAgICAgIHZhciByZXN1bHQgPSB7XG4gICAgICAgICAgaXNTdHJlYW06IGZhbHNlXG4gICAgICAgIH1cbiAgICAgICAgT2JqZWN0LmtleXMocmVjb3JkKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgICByZXN1bHRba2V5XSA9IHJlY29yZFtrZXldXG4gICAgICAgIH0pXG4gICAgICAgIGlmIChyZWNvcmQuYnVmZmVyKSB7XG4gICAgICAgICAgcmVzdWx0LmJ1ZmZlciA9IGVudi5saW5rKHJlY29yZC5idWZmZXIpXG4gICAgICAgIH1cbiAgICAgICAgY2FjaGVbaWRdID0gcmVzdWx0XG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIE9iamVjdC5rZXlzKGR5bmFtaWNBdHRyaWJ1dGVzKS5mb3JFYWNoKGZ1bmN0aW9uIChhdHRyaWJ1dGUpIHtcbiAgICAgIHZhciBkeW4gPSBkeW5hbWljQXR0cmlidXRlc1thdHRyaWJ1dGVdXG5cbiAgICAgIGZ1bmN0aW9uIGFwcGVuZEF0dHJpYnV0ZUNvZGUgKGVudiwgYmxvY2spIHtcbiAgICAgICAgdmFyIFZBTFVFID0gZW52Lmludm9rZShibG9jaywgZHluKVxuXG4gICAgICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG5cbiAgICAgICAgdmFyIElTX0JVRkZFUl9BUkdTID0gc2hhcmVkLmlzQnVmZmVyQXJnc1xuICAgICAgICB2YXIgQlVGRkVSX1NUQVRFID0gc2hhcmVkLmJ1ZmZlclxuXG4gICAgICAgIC8vIFBlcmZvcm0gdmFsaWRhdGlvbiBvbiBhdHRyaWJ1dGVcbiAgICAgICAgXG5cbiAgICAgICAgLy8gYWxsb2NhdGUgbmFtZXMgZm9yIHJlc3VsdFxuICAgICAgICB2YXIgcmVzdWx0ID0ge1xuICAgICAgICAgIGlzU3RyZWFtOiBibG9jay5kZWYoZmFsc2UpXG4gICAgICAgIH1cbiAgICAgICAgdmFyIGRlZmF1bHRSZWNvcmQgPSBuZXcgQXR0cmlidXRlUmVjb3JkKClcbiAgICAgICAgZGVmYXVsdFJlY29yZC5zdGF0ZSA9IEFUVFJJQl9TVEFURV9QT0lOVEVSXG4gICAgICAgIE9iamVjdC5rZXlzKGRlZmF1bHRSZWNvcmQpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgICAgIHJlc3VsdFtrZXldID0gYmxvY2suZGVmKCcnICsgZGVmYXVsdFJlY29yZFtrZXldKVxuICAgICAgICB9KVxuXG4gICAgICAgIHZhciBCVUZGRVIgPSByZXN1bHQuYnVmZmVyXG4gICAgICAgIHZhciBUWVBFID0gcmVzdWx0LnR5cGVcbiAgICAgICAgYmxvY2soXG4gICAgICAgICAgJ2lmKCcsIElTX0JVRkZFUl9BUkdTLCAnKCcsIFZBTFVFLCAnKSl7JyxcbiAgICAgICAgICByZXN1bHQuaXNTdHJlYW0sICc9dHJ1ZTsnLFxuICAgICAgICAgIEJVRkZFUiwgJz0nLCBCVUZGRVJfU1RBVEUsICcuY3JlYXRlU3RyZWFtKCcsIEdMX0FSUkFZX0JVRkZFUiwgJywnLCBWQUxVRSwgJyk7JyxcbiAgICAgICAgICBUWVBFLCAnPScsIEJVRkZFUiwgJy5kdHlwZTsnLFxuICAgICAgICAgICd9ZWxzZXsnLFxuICAgICAgICAgIEJVRkZFUiwgJz0nLCBCVUZGRVJfU1RBVEUsICcuZ2V0QnVmZmVyKCcsIFZBTFVFLCAnKTsnLFxuICAgICAgICAgICdpZignLCBCVUZGRVIsICcpeycsXG4gICAgICAgICAgVFlQRSwgJz0nLCBCVUZGRVIsICcuZHR5cGU7JyxcbiAgICAgICAgICAnfWVsc2UgaWYoXCJjb25zdGFudFwiIGluICcsIFZBTFVFLCAnKXsnLFxuICAgICAgICAgIHJlc3VsdC5zdGF0ZSwgJz0nLCBBVFRSSUJfU1RBVEVfQ09OU1RBTlQsICc7JyxcbiAgICAgICAgICAnaWYodHlwZW9mICcgKyBWQUxVRSArICcuY29uc3RhbnQgPT09IFwibnVtYmVyXCIpeycsXG4gICAgICAgICAgcmVzdWx0W0NVVEVfQ09NUE9ORU5UU1swXV0sICc9JywgVkFMVUUsICcuY29uc3RhbnQ7JyxcbiAgICAgICAgICBDVVRFX0NPTVBPTkVOVFMuc2xpY2UoMSkubWFwKGZ1bmN0aW9uIChuKSB7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0W25dXG4gICAgICAgICAgfSkuam9pbignPScpLCAnPTA7JyxcbiAgICAgICAgICAnfWVsc2V7JyxcbiAgICAgICAgICBDVVRFX0NPTVBPTkVOVFMubWFwKGZ1bmN0aW9uIChuYW1lLCBpKSB7XG4gICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICByZXN1bHRbbmFtZV0gKyAnPScgKyBWQUxVRSArICcuY29uc3RhbnQubGVuZ3RoPj0nICsgaSArXG4gICAgICAgICAgICAgICc/JyArIFZBTFVFICsgJy5jb25zdGFudFsnICsgaSArICddOjA7J1xuICAgICAgICAgICAgKVxuICAgICAgICAgIH0pLmpvaW4oJycpLFxuICAgICAgICAgICd9fWVsc2V7JyxcbiAgICAgICAgICBCVUZGRVIsICc9JywgQlVGRkVSX1NUQVRFLCAnLmdldEJ1ZmZlcignLCBWQUxVRSwgJy5idWZmZXIpOycsXG4gICAgICAgICAgVFlQRSwgJz1cInR5cGVcIiBpbiAnLCBWQUxVRSwgJz8nLFxuICAgICAgICAgIHNoYXJlZC5nbFR5cGVzLCAnWycsIFZBTFVFLCAnLnR5cGVdOicsIEJVRkZFUiwgJy5kdHlwZTsnLFxuICAgICAgICAgIHJlc3VsdC5ub3JtYWxpemVkLCAnPSEhJywgVkFMVUUsICcubm9ybWFsaXplZDsnKVxuICAgICAgICBmdW5jdGlvbiBlbWl0UmVhZFJlY29yZCAobmFtZSkge1xuICAgICAgICAgIGJsb2NrKHJlc3VsdFtuYW1lXSwgJz0nLCBWQUxVRSwgJy4nLCBuYW1lLCAnfDA7JylcbiAgICAgICAgfVxuICAgICAgICBlbWl0UmVhZFJlY29yZCgnc2l6ZScpXG4gICAgICAgIGVtaXRSZWFkUmVjb3JkKCdvZmZzZXQnKVxuICAgICAgICBlbWl0UmVhZFJlY29yZCgnc3RyaWRlJylcbiAgICAgICAgZW1pdFJlYWRSZWNvcmQoJ2Rpdmlzb3InKVxuXG4gICAgICAgIGJsb2NrKCd9fScpXG5cbiAgICAgICAgYmxvY2suZXhpdChcbiAgICAgICAgICAnaWYoJywgcmVzdWx0LmlzU3RyZWFtLCAnKXsnLFxuICAgICAgICAgIEJVRkZFUl9TVEFURSwgJy5kZXN0cm95U3RyZWFtKCcsIEJVRkZFUiwgJyk7JyxcbiAgICAgICAgICAnfScpXG5cbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgfVxuXG4gICAgICBhdHRyaWJ1dGVEZWZzW2F0dHJpYnV0ZV0gPSBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGFwcGVuZEF0dHJpYnV0ZUNvZGUpXG4gICAgfSlcblxuICAgIHJldHVybiBhdHRyaWJ1dGVEZWZzXG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZUNvbnRleHQgKGNvbnRleHQpIHtcbiAgICB2YXIgc3RhdGljQ29udGV4dCA9IGNvbnRleHQuc3RhdGljXG4gICAgdmFyIGR5bmFtaWNDb250ZXh0ID0gY29udGV4dC5keW5hbWljXG4gICAgdmFyIHJlc3VsdCA9IHt9XG5cbiAgICBPYmplY3Qua2V5cyhzdGF0aWNDb250ZXh0KS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICB2YXIgdmFsdWUgPSBzdGF0aWNDb250ZXh0W25hbWVdXG4gICAgICByZXN1bHRbbmFtZV0gPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInIHx8IHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgcmV0dXJuICcnICsgdmFsdWVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gZW52LmxpbmsodmFsdWUpXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgfSlcblxuICAgIE9iamVjdC5rZXlzKGR5bmFtaWNDb250ZXh0KS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICB2YXIgZHluID0gZHluYW1pY0NvbnRleHRbbmFtZV1cbiAgICAgIHJlc3VsdFtuYW1lXSA9IGNyZWF0ZUR5bmFtaWNEZWNsKGR5biwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgcmV0dXJuIGVudi5pbnZva2Uoc2NvcGUsIGR5bilcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIHJldHVybiByZXN1bHRcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlQXJndW1lbnRzIChvcHRpb25zLCBhdHRyaWJ1dGVzLCB1bmlmb3JtcywgY29udGV4dCkge1xuICAgIHZhciByZXN1bHQgPSBwYXJzZU9wdGlvbnMob3B0aW9ucylcblxuICAgIHJlc3VsdC5wcm9maWxlID0gcGFyc2VQcm9maWxlKG9wdGlvbnMpXG4gICAgcmVzdWx0LnVuaWZvcm1zID0gcGFyc2VVbmlmb3Jtcyh1bmlmb3JtcylcbiAgICByZXN1bHQuYXR0cmlidXRlcyA9IHBhcnNlQXR0cmlidXRlcyhhdHRyaWJ1dGVzKVxuICAgIHJlc3VsdC5jb250ZXh0ID0gcGFyc2VDb250ZXh0KGNvbnRleHQpXG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBDT01NT04gVVBEQVRFIEZVTkNUSU9OU1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIGVtaXRDb250ZXh0IChlbnYsIHNjb3BlLCBjb250ZXh0KSB7XG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcbiAgICB2YXIgQ09OVEVYVCA9IHNoYXJlZC5jb250ZXh0XG5cbiAgICB2YXIgY29udGV4dEVudGVyID0gZW52LnNjb3BlKClcblxuICAgIE9iamVjdC5rZXlzKGNvbnRleHQpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHNjb3BlLnNhdmUoQ09OVEVYVCwgJy4nICsgbmFtZSlcbiAgICAgIHZhciBkZWZuID0gY29udGV4dFtuYW1lXVxuICAgICAgY29udGV4dEVudGVyKENPTlRFWFQsICcuJywgbmFtZSwgJz0nLCBkZWZuLmFwcGVuZChlbnYsIHNjb3BlKSwgJzsnKVxuICAgIH0pXG5cbiAgICBzY29wZShjb250ZXh0RW50ZXIpXG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIENPTU1PTiBEUkFXSU5HIEZVTkNUSU9OU1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIGVtaXRQb2xsRnJhbWVidWZmZXIgKGVudiwgc2NvcGUsIGZyYW1lYnVmZmVyLCBza2lwQ2hlY2spIHtcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuXG4gICAgdmFyIEdMID0gc2hhcmVkLmdsXG4gICAgdmFyIEZSQU1FQlVGRkVSX1NUQVRFID0gc2hhcmVkLmZyYW1lYnVmZmVyXG4gICAgdmFyIEVYVF9EUkFXX0JVRkZFUlNcbiAgICBpZiAoZXh0RHJhd0J1ZmZlcnMpIHtcbiAgICAgIEVYVF9EUkFXX0JVRkZFUlMgPSBzY29wZS5kZWYoc2hhcmVkLmV4dGVuc2lvbnMsICcud2ViZ2xfZHJhd19idWZmZXJzJylcbiAgICB9XG5cbiAgICB2YXIgY29uc3RhbnRzID0gZW52LmNvbnN0YW50c1xuXG4gICAgdmFyIERSQVdfQlVGRkVSUyA9IGNvbnN0YW50cy5kcmF3QnVmZmVyXG4gICAgdmFyIEJBQ0tfQlVGRkVSID0gY29uc3RhbnRzLmJhY2tCdWZmZXJcblxuICAgIHZhciBORVhUXG4gICAgaWYgKGZyYW1lYnVmZmVyKSB7XG4gICAgICBORVhUID0gZnJhbWVidWZmZXIuYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgfSBlbHNlIHtcbiAgICAgIE5FWFQgPSBzY29wZS5kZWYoRlJBTUVCVUZGRVJfU1RBVEUsICcubmV4dCcpXG4gICAgfVxuXG4gICAgaWYgKCFza2lwQ2hlY2spIHtcbiAgICAgIHNjb3BlKCdpZignLCBORVhULCAnIT09JywgRlJBTUVCVUZGRVJfU1RBVEUsICcuY3VyKXsnKVxuICAgIH1cbiAgICBzY29wZShcbiAgICAgICdpZignLCBORVhULCAnKXsnLFxuICAgICAgR0wsICcuYmluZEZyYW1lYnVmZmVyKCcsIEdMX0ZSQU1FQlVGRkVSLCAnLCcsIE5FWFQsICcuZnJhbWVidWZmZXIpOycpXG4gICAgaWYgKGV4dERyYXdCdWZmZXJzKSB7XG4gICAgICBzY29wZShFWFRfRFJBV19CVUZGRVJTLCAnLmRyYXdCdWZmZXJzV0VCR0woJyxcbiAgICAgICAgRFJBV19CVUZGRVJTLCAnWycsIE5FWFQsICcuY29sb3JBdHRhY2htZW50cy5sZW5ndGhdKTsnKVxuICAgIH1cbiAgICBzY29wZSgnfWVsc2V7JyxcbiAgICAgIEdMLCAnLmJpbmRGcmFtZWJ1ZmZlcignLCBHTF9GUkFNRUJVRkZFUiwgJyxudWxsKTsnKVxuICAgIGlmIChleHREcmF3QnVmZmVycykge1xuICAgICAgc2NvcGUoRVhUX0RSQVdfQlVGRkVSUywgJy5kcmF3QnVmZmVyc1dFQkdMKCcsIEJBQ0tfQlVGRkVSLCAnKTsnKVxuICAgIH1cbiAgICBzY29wZShcbiAgICAgICd9JyxcbiAgICAgIEZSQU1FQlVGRkVSX1NUQVRFLCAnLmN1cj0nLCBORVhULCAnOycpXG4gICAgaWYgKCFza2lwQ2hlY2spIHtcbiAgICAgIHNjb3BlKCd9JylcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBlbWl0UG9sbFN0YXRlIChlbnYsIHNjb3BlLCBhcmdzKSB7XG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcblxuICAgIHZhciBHTCA9IHNoYXJlZC5nbFxuXG4gICAgdmFyIENVUlJFTlRfVkFSUyA9IGVudi5jdXJyZW50XG4gICAgdmFyIE5FWFRfVkFSUyA9IGVudi5uZXh0XG4gICAgdmFyIENVUlJFTlRfU1RBVEUgPSBzaGFyZWQuY3VycmVudFxuICAgIHZhciBORVhUX1NUQVRFID0gc2hhcmVkLm5leHRcblxuICAgIHZhciBibG9jayA9IGVudi5jb25kKENVUlJFTlRfU1RBVEUsICcuZGlydHknKVxuXG4gICAgR0xfU1RBVEVfTkFNRVMuZm9yRWFjaChmdW5jdGlvbiAocHJvcCkge1xuICAgICAgdmFyIHBhcmFtID0gcHJvcE5hbWUocHJvcClcbiAgICAgIGlmIChwYXJhbSBpbiBhcmdzLnN0YXRlKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuXG4gICAgICB2YXIgTkVYVCwgQ1VSUkVOVFxuICAgICAgaWYgKHBhcmFtIGluIE5FWFRfVkFSUykge1xuICAgICAgICBORVhUID0gTkVYVF9WQVJTW3BhcmFtXVxuICAgICAgICBDVVJSRU5UID0gQ1VSUkVOVF9WQVJTW3BhcmFtXVxuICAgICAgICB2YXIgcGFydHMgPSBsb29wKGN1cnJlbnRTdGF0ZVtwYXJhbV0ubGVuZ3RoLCBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgIHJldHVybiBibG9jay5kZWYoTkVYVCwgJ1snLCBpLCAnXScpXG4gICAgICAgIH0pXG4gICAgICAgIGJsb2NrKGVudi5jb25kKHBhcnRzLm1hcChmdW5jdGlvbiAocCwgaSkge1xuICAgICAgICAgIHJldHVybiBwICsgJyE9PScgKyBDVVJSRU5UICsgJ1snICsgaSArICddJ1xuICAgICAgICB9KS5qb2luKCd8fCcpKVxuICAgICAgICAgIC50aGVuKFxuICAgICAgICAgICAgR0wsICcuJywgR0xfVkFSSUFCTEVTW3BhcmFtXSwgJygnLCBwYXJ0cywgJyk7JyxcbiAgICAgICAgICAgIHBhcnRzLm1hcChmdW5jdGlvbiAocCwgaSkge1xuICAgICAgICAgICAgICByZXR1cm4gQ1VSUkVOVCArICdbJyArIGkgKyAnXT0nICsgcFxuICAgICAgICAgICAgfSkuam9pbignOycpLCAnOycpKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgTkVYVCA9IGJsb2NrLmRlZihORVhUX1NUQVRFLCAnLicsIHBhcmFtKVxuICAgICAgICB2YXIgaWZ0ZSA9IGVudi5jb25kKE5FWFQsICchPT0nLCBDVVJSRU5UX1NUQVRFLCAnLicsIHBhcmFtKVxuICAgICAgICBibG9jayhpZnRlKVxuICAgICAgICBpZiAocGFyYW0gaW4gR0xfRkxBR1MpIHtcbiAgICAgICAgICBpZnRlKFxuICAgICAgICAgICAgZW52LmNvbmQoTkVYVClcbiAgICAgICAgICAgICAgICAudGhlbihHTCwgJy5lbmFibGUoJywgR0xfRkxBR1NbcGFyYW1dLCAnKTsnKVxuICAgICAgICAgICAgICAgIC5lbHNlKEdMLCAnLmRpc2FibGUoJywgR0xfRkxBR1NbcGFyYW1dLCAnKTsnKSxcbiAgICAgICAgICAgIENVUlJFTlRfU1RBVEUsICcuJywgcGFyYW0sICc9JywgTkVYVCwgJzsnKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmdGUoXG4gICAgICAgICAgICBHTCwgJy4nLCBHTF9WQVJJQUJMRVNbcGFyYW1dLCAnKCcsIE5FWFQsICcpOycsXG4gICAgICAgICAgICBDVVJSRU5UX1NUQVRFLCAnLicsIHBhcmFtLCAnPScsIE5FWFQsICc7JylcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pXG4gICAgaWYgKE9iamVjdC5rZXlzKGFyZ3Muc3RhdGUpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgYmxvY2soQ1VSUkVOVF9TVEFURSwgJy5kaXJ0eT1mYWxzZTsnKVxuICAgIH1cbiAgICBzY29wZShibG9jaylcbiAgfVxuXG4gIGZ1bmN0aW9uIGVtaXRTZXRPcHRpb25zIChlbnYsIHNjb3BlLCBvcHRpb25zLCBmaWx0ZXIpIHtcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuICAgIHZhciBDVVJSRU5UX1ZBUlMgPSBlbnYuY3VycmVudFxuICAgIHZhciBDVVJSRU5UX1NUQVRFID0gc2hhcmVkLmN1cnJlbnRcbiAgICB2YXIgR0wgPSBzaGFyZWQuZ2xcbiAgICBzb3J0U3RhdGUoT2JqZWN0LmtleXMob3B0aW9ucykpLmZvckVhY2goZnVuY3Rpb24gKHBhcmFtKSB7XG4gICAgICB2YXIgZGVmbiA9IG9wdGlvbnNbcGFyYW1dXG4gICAgICBpZiAoZmlsdGVyICYmICFmaWx0ZXIoZGVmbikpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICB2YXIgdmFyaWFibGUgPSBkZWZuLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgaWYgKEdMX0ZMQUdTW3BhcmFtXSkge1xuICAgICAgICB2YXIgZmxhZyA9IEdMX0ZMQUdTW3BhcmFtXVxuICAgICAgICBpZiAoaXNTdGF0aWMoZGVmbikpIHtcbiAgICAgICAgICBpZiAodmFyaWFibGUpIHtcbiAgICAgICAgICAgIHNjb3BlKEdMLCAnLmVuYWJsZSgnLCBmbGFnLCAnKTsnKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzY29wZShHTCwgJy5kaXNhYmxlKCcsIGZsYWcsICcpOycpXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHNjb3BlKGVudi5jb25kKHZhcmlhYmxlKVxuICAgICAgICAgICAgLnRoZW4oR0wsICcuZW5hYmxlKCcsIGZsYWcsICcpOycpXG4gICAgICAgICAgICAuZWxzZShHTCwgJy5kaXNhYmxlKCcsIGZsYWcsICcpOycpKVxuICAgICAgICB9XG4gICAgICAgIHNjb3BlKENVUlJFTlRfU1RBVEUsICcuJywgcGFyYW0sICc9JywgdmFyaWFibGUsICc7JylcbiAgICAgIH0gZWxzZSBpZiAoaXNBcnJheUxpa2UodmFyaWFibGUpKSB7XG4gICAgICAgIHZhciBDVVJSRU5UID0gQ1VSUkVOVF9WQVJTW3BhcmFtXVxuICAgICAgICBzY29wZShcbiAgICAgICAgICBHTCwgJy4nLCBHTF9WQVJJQUJMRVNbcGFyYW1dLCAnKCcsIHZhcmlhYmxlLCAnKTsnLFxuICAgICAgICAgIHZhcmlhYmxlLm1hcChmdW5jdGlvbiAodiwgaSkge1xuICAgICAgICAgICAgcmV0dXJuIENVUlJFTlQgKyAnWycgKyBpICsgJ109JyArIHZcbiAgICAgICAgICB9KS5qb2luKCc7JyksICc7JylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNjb3BlKFxuICAgICAgICAgIEdMLCAnLicsIEdMX1ZBUklBQkxFU1twYXJhbV0sICcoJywgdmFyaWFibGUsICcpOycsXG4gICAgICAgICAgQ1VSUkVOVF9TVEFURSwgJy4nLCBwYXJhbSwgJz0nLCB2YXJpYWJsZSwgJzsnKVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiBpbmplY3RFeHRlbnNpb25zIChlbnYsIHNjb3BlKSB7XG4gICAgaWYgKGV4dEluc3RhbmNpbmcgJiYgIWVudi5pbnN0YW5jaW5nKSB7XG4gICAgICBlbnYuaW5zdGFuY2luZyA9IHNjb3BlLmRlZihcbiAgICAgICAgZW52LnNoYXJlZC5leHRlbnNpb25zLCAnLmFuZ2xlX2luc3RhbmNlZF9hcnJheXMnKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGVtaXRQcm9maWxlIChlbnYsIHNjb3BlLCBhcmdzLCB1c2VTY29wZSwgaW5jcmVtZW50Q291bnRlcikge1xuICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgdmFyIFNUQVRTID0gZW52LnN0YXRzXG4gICAgdmFyIENVUlJFTlRfU1RBVEUgPSBzaGFyZWQuY3VycmVudFxuICAgIHZhciBUSU1FUiA9IHNoYXJlZC50aW1lclxuICAgIHZhciBwcm9maWxlQXJnID0gYXJncy5wcm9maWxlXG5cbiAgICBmdW5jdGlvbiBwZXJmQ291bnRlciAoKSB7XG4gICAgICBpZiAodHlwZW9mIHBlcmZvcm1hbmNlID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICByZXR1cm4gJ0RhdGUubm93KCknXG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gJ3BlcmZvcm1hbmNlLm5vdygpJ1xuICAgICAgfVxuICAgIH1cblxuICAgIHZhciBDUFVfU1RBUlQsIFFVRVJZX0NPVU5URVJcbiAgICBmdW5jdGlvbiBlbWl0UHJvZmlsZVN0YXJ0IChibG9jaykge1xuICAgICAgQ1BVX1NUQVJUID0gc2NvcGUuZGVmKClcbiAgICAgIGJsb2NrKENQVV9TVEFSVCwgJz0nLCBwZXJmQ291bnRlcigpLCAnOycpXG4gICAgICBpZiAodHlwZW9mIGluY3JlbWVudENvdW50ZXIgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGJsb2NrKFNUQVRTLCAnLmNvdW50Kz0nLCBpbmNyZW1lbnRDb3VudGVyLCAnOycpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBibG9jayhTVEFUUywgJy5jb3VudCsrOycpXG4gICAgICB9XG4gICAgICBpZiAodGltZXIpIHtcbiAgICAgICAgaWYgKHVzZVNjb3BlKSB7XG4gICAgICAgICAgUVVFUllfQ09VTlRFUiA9IHNjb3BlLmRlZigpXG4gICAgICAgICAgYmxvY2soUVVFUllfQ09VTlRFUiwgJz0nLCBUSU1FUiwgJy5nZXROdW1QZW5kaW5nUXVlcmllcygpOycpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYmxvY2soVElNRVIsICcuYmVnaW5RdWVyeSgnLCBTVEFUUywgJyk7JylcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGVtaXRQcm9maWxlRW5kIChibG9jaykge1xuICAgICAgYmxvY2soU1RBVFMsICcuY3B1VGltZSs9JywgcGVyZkNvdW50ZXIoKSwgJy0nLCBDUFVfU1RBUlQsICc7JylcbiAgICAgIGlmICh0aW1lcikge1xuICAgICAgICBpZiAodXNlU2NvcGUpIHtcbiAgICAgICAgICBibG9jayhUSU1FUiwgJy5wdXNoU2NvcGVTdGF0cygnLFxuICAgICAgICAgICAgUVVFUllfQ09VTlRFUiwgJywnLFxuICAgICAgICAgICAgVElNRVIsICcuZ2V0TnVtUGVuZGluZ1F1ZXJpZXMoKSwnLFxuICAgICAgICAgICAgU1RBVFMsICcpOycpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYmxvY2soVElNRVIsICcuZW5kUXVlcnkoKTsnKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2NvcGVQcm9maWxlICh2YWx1ZSkge1xuICAgICAgdmFyIHByZXYgPSBzY29wZS5kZWYoQ1VSUkVOVF9TVEFURSwgJy5wcm9maWxlJylcbiAgICAgIHNjb3BlKENVUlJFTlRfU1RBVEUsICcucHJvZmlsZT0nLCB2YWx1ZSwgJzsnKVxuICAgICAgc2NvcGUuZXhpdChDVVJSRU5UX1NUQVRFLCAnLnByb2ZpbGU9JywgcHJldiwgJzsnKVxuICAgIH1cblxuICAgIHZhciBVU0VfUFJPRklMRVxuICAgIGlmIChwcm9maWxlQXJnKSB7XG4gICAgICBpZiAoaXNTdGF0aWMocHJvZmlsZUFyZykpIHtcbiAgICAgICAgaWYgKHByb2ZpbGVBcmcuZW5hYmxlKSB7XG4gICAgICAgICAgZW1pdFByb2ZpbGVTdGFydChzY29wZSlcbiAgICAgICAgICBlbWl0UHJvZmlsZUVuZChzY29wZS5leGl0KVxuICAgICAgICAgIHNjb3BlUHJvZmlsZSgndHJ1ZScpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc2NvcGVQcm9maWxlKCdmYWxzZScpXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICBVU0VfUFJPRklMRSA9IHByb2ZpbGVBcmcuYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgICBzY29wZVByb2ZpbGUoVVNFX1BST0ZJTEUpXG4gICAgfSBlbHNlIHtcbiAgICAgIFVTRV9QUk9GSUxFID0gc2NvcGUuZGVmKENVUlJFTlRfU1RBVEUsICcucHJvZmlsZScpXG4gICAgfVxuXG4gICAgdmFyIHN0YXJ0ID0gZW52LmJsb2NrKClcbiAgICBlbWl0UHJvZmlsZVN0YXJ0KHN0YXJ0KVxuICAgIHNjb3BlKCdpZignLCBVU0VfUFJPRklMRSwgJyl7Jywgc3RhcnQsICd9JylcbiAgICB2YXIgZW5kID0gZW52LmJsb2NrKClcbiAgICBlbWl0UHJvZmlsZUVuZChlbmQpXG4gICAgc2NvcGUuZXhpdCgnaWYoJywgVVNFX1BST0ZJTEUsICcpeycsIGVuZCwgJ30nKVxuICB9XG5cbiAgZnVuY3Rpb24gZW1pdEF0dHJpYnV0ZXMgKGVudiwgc2NvcGUsIGFyZ3MsIGF0dHJpYnV0ZXMsIGZpbHRlcikge1xuICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG5cbiAgICBmdW5jdGlvbiB0eXBlTGVuZ3RoICh4KSB7XG4gICAgICBzd2l0Y2ggKHgpIHtcbiAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUMyOlxuICAgICAgICBjYXNlIEdMX0lOVF9WRUMyOlxuICAgICAgICBjYXNlIEdMX0JPT0xfVkVDMjpcbiAgICAgICAgICByZXR1cm4gMlxuICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzM6XG4gICAgICAgIGNhc2UgR0xfSU5UX1ZFQzM6XG4gICAgICAgIGNhc2UgR0xfQk9PTF9WRUMzOlxuICAgICAgICAgIHJldHVybiAzXG4gICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDNDpcbiAgICAgICAgY2FzZSBHTF9JTlRfVkVDNDpcbiAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzQ6XG4gICAgICAgICAgcmV0dXJuIDRcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICByZXR1cm4gMVxuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGVtaXRCaW5kQXR0cmlidXRlIChBVFRSSUJVVEUsIHNpemUsIHJlY29yZCkge1xuICAgICAgdmFyIEdMID0gc2hhcmVkLmdsXG5cbiAgICAgIHZhciBMT0NBVElPTiA9IHNjb3BlLmRlZihBVFRSSUJVVEUsICcubG9jYXRpb24nKVxuICAgICAgdmFyIEJJTkRJTkcgPSBzY29wZS5kZWYoc2hhcmVkLmF0dHJpYnV0ZXMsICdbJywgTE9DQVRJT04sICddJylcblxuICAgICAgdmFyIFNUQVRFID0gcmVjb3JkLnN0YXRlXG4gICAgICB2YXIgQlVGRkVSID0gcmVjb3JkLmJ1ZmZlclxuICAgICAgdmFyIENPTlNUX0NPTVBPTkVOVFMgPSBbXG4gICAgICAgIHJlY29yZC54LFxuICAgICAgICByZWNvcmQueSxcbiAgICAgICAgcmVjb3JkLnosXG4gICAgICAgIHJlY29yZC53XG4gICAgICBdXG5cbiAgICAgIHZhciBDT01NT05fS0VZUyA9IFtcbiAgICAgICAgJ2J1ZmZlcicsXG4gICAgICAgICdub3JtYWxpemVkJyxcbiAgICAgICAgJ29mZnNldCcsXG4gICAgICAgICdzdHJpZGUnXG4gICAgICBdXG5cbiAgICAgIGZ1bmN0aW9uIGVtaXRCdWZmZXIgKCkge1xuICAgICAgICBzY29wZShcbiAgICAgICAgICAnaWYoIScsIEJJTkRJTkcsICcuYnVmZmVyKXsnLFxuICAgICAgICAgIEdMLCAnLmVuYWJsZVZlcnRleEF0dHJpYkFycmF5KCcsIExPQ0FUSU9OLCAnKTt9JylcblxuICAgICAgICB2YXIgVFlQRSA9IHJlY29yZC50eXBlXG4gICAgICAgIHZhciBTSVpFXG4gICAgICAgIGlmICghcmVjb3JkLnNpemUpIHtcbiAgICAgICAgICBTSVpFID0gc2l6ZVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIFNJWkUgPSBzY29wZS5kZWYocmVjb3JkLnNpemUsICd8fCcsIHNpemUpXG4gICAgICAgIH1cblxuICAgICAgICBzY29wZSgnaWYoJyxcbiAgICAgICAgICBCSU5ESU5HLCAnLnR5cGUhPT0nLCBUWVBFLCAnfHwnLFxuICAgICAgICAgIEJJTkRJTkcsICcuc2l6ZSE9PScsIFNJWkUsICd8fCcsXG4gICAgICAgICAgQ09NTU9OX0tFWVMubWFwKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgICAgIHJldHVybiBCSU5ESU5HICsgJy4nICsga2V5ICsgJyE9PScgKyByZWNvcmRba2V5XVxuICAgICAgICAgIH0pLmpvaW4oJ3x8JyksXG4gICAgICAgICAgJyl7JyxcbiAgICAgICAgICBHTCwgJy5iaW5kQnVmZmVyKCcsIEdMX0FSUkFZX0JVRkZFUiwgJywnLCBCVUZGRVIsICcuYnVmZmVyKTsnLFxuICAgICAgICAgIEdMLCAnLnZlcnRleEF0dHJpYlBvaW50ZXIoJywgW1xuICAgICAgICAgICAgTE9DQVRJT04sXG4gICAgICAgICAgICBTSVpFLFxuICAgICAgICAgICAgVFlQRSxcbiAgICAgICAgICAgIHJlY29yZC5ub3JtYWxpemVkLFxuICAgICAgICAgICAgcmVjb3JkLnN0cmlkZSxcbiAgICAgICAgICAgIHJlY29yZC5vZmZzZXRcbiAgICAgICAgICBdLCAnKTsnLFxuICAgICAgICAgIEJJTkRJTkcsICcudHlwZT0nLCBUWVBFLCAnOycsXG4gICAgICAgICAgQklORElORywgJy5zaXplPScsIFNJWkUsICc7JyxcbiAgICAgICAgICBDT01NT05fS0VZUy5tYXAoZnVuY3Rpb24gKGtleSkge1xuICAgICAgICAgICAgcmV0dXJuIEJJTkRJTkcgKyAnLicgKyBrZXkgKyAnPScgKyByZWNvcmRba2V5XSArICc7J1xuICAgICAgICAgIH0pLmpvaW4oJycpLFxuICAgICAgICAgICd9JylcblxuICAgICAgICBpZiAoZXh0SW5zdGFuY2luZykge1xuICAgICAgICAgIHZhciBESVZJU09SID0gcmVjb3JkLmRpdmlzb3JcbiAgICAgICAgICBzY29wZShcbiAgICAgICAgICAgICdpZignLCBCSU5ESU5HLCAnLmRpdmlzb3IhPT0nLCBESVZJU09SLCAnKXsnLFxuICAgICAgICAgICAgZW52Lmluc3RhbmNpbmcsICcudmVydGV4QXR0cmliRGl2aXNvckFOR0xFKCcsIFtMT0NBVElPTiwgRElWSVNPUl0sICcpOycsXG4gICAgICAgICAgICBCSU5ESU5HLCAnLmRpdmlzb3I9JywgRElWSVNPUiwgJzt9JylcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBlbWl0Q29uc3RhbnQgKCkge1xuICAgICAgICBzY29wZShcbiAgICAgICAgICAnaWYoJywgQklORElORywgJy5idWZmZXIpeycsXG4gICAgICAgICAgR0wsICcuZGlzYWJsZVZlcnRleEF0dHJpYkFycmF5KCcsIExPQ0FUSU9OLCAnKTsnLFxuICAgICAgICAgICd9aWYoJywgQ1VURV9DT01QT05FTlRTLm1hcChmdW5jdGlvbiAoYywgaSkge1xuICAgICAgICAgICAgcmV0dXJuIEJJTkRJTkcgKyAnLicgKyBjICsgJyE9PScgKyBDT05TVF9DT01QT05FTlRTW2ldXG4gICAgICAgICAgfSkuam9pbignfHwnKSwgJyl7JyxcbiAgICAgICAgICBHTCwgJy52ZXJ0ZXhBdHRyaWI0ZignLCBMT0NBVElPTiwgJywnLCBDT05TVF9DT01QT05FTlRTLCAnKTsnLFxuICAgICAgICAgIENVVEVfQ09NUE9ORU5UUy5tYXAoZnVuY3Rpb24gKGMsIGkpIHtcbiAgICAgICAgICAgIHJldHVybiBCSU5ESU5HICsgJy4nICsgYyArICc9JyArIENPTlNUX0NPTVBPTkVOVFNbaV0gKyAnOydcbiAgICAgICAgICB9KS5qb2luKCcnKSxcbiAgICAgICAgICAnfScpXG4gICAgICB9XG5cbiAgICAgIGlmIChTVEFURSA9PT0gQVRUUklCX1NUQVRFX1BPSU5URVIpIHtcbiAgICAgICAgZW1pdEJ1ZmZlcigpXG4gICAgICB9IGVsc2UgaWYgKFNUQVRFID09PSBBVFRSSUJfU1RBVEVfQ09OU1RBTlQpIHtcbiAgICAgICAgZW1pdENvbnN0YW50KClcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNjb3BlKCdpZignLCBTVEFURSwgJz09PScsIEFUVFJJQl9TVEFURV9QT0lOVEVSLCAnKXsnKVxuICAgICAgICBlbWl0QnVmZmVyKClcbiAgICAgICAgc2NvcGUoJ31lbHNleycpXG4gICAgICAgIGVtaXRDb25zdGFudCgpXG4gICAgICAgIHNjb3BlKCd9JylcbiAgICAgIH1cbiAgICB9XG5cbiAgICBhdHRyaWJ1dGVzLmZvckVhY2goZnVuY3Rpb24gKGF0dHJpYnV0ZSkge1xuICAgICAgdmFyIG5hbWUgPSBhdHRyaWJ1dGUubmFtZVxuICAgICAgdmFyIGFyZyA9IGFyZ3MuYXR0cmlidXRlc1tuYW1lXVxuICAgICAgdmFyIHJlY29yZFxuICAgICAgaWYgKGFyZykge1xuICAgICAgICBpZiAoIWZpbHRlcihhcmcpKSB7XG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cbiAgICAgICAgcmVjb3JkID0gYXJnLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKCFmaWx0ZXIoU0NPUEVfREVDTCkpIHtcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuICAgICAgICB2YXIgc2NvcGVBdHRyaWIgPSBlbnYuc2NvcGVBdHRyaWIobmFtZSlcbiAgICAgICAgXG4gICAgICAgIHJlY29yZCA9IHt9XG4gICAgICAgIE9iamVjdC5rZXlzKG5ldyBBdHRyaWJ1dGVSZWNvcmQoKSkuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgICAgcmVjb3JkW2tleV0gPSBzY29wZS5kZWYoc2NvcGVBdHRyaWIsICcuJywga2V5KVxuICAgICAgICB9KVxuICAgICAgfVxuICAgICAgZW1pdEJpbmRBdHRyaWJ1dGUoXG4gICAgICAgIGVudi5saW5rKGF0dHJpYnV0ZSksIHR5cGVMZW5ndGgoYXR0cmlidXRlLmluZm8udHlwZSksIHJlY29yZClcbiAgICB9KVxuICB9XG5cbiAgZnVuY3Rpb24gZW1pdFVuaWZvcm1zIChlbnYsIHNjb3BlLCBhcmdzLCB1bmlmb3JtcywgZmlsdGVyKSB7XG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcbiAgICB2YXIgR0wgPSBzaGFyZWQuZ2xcblxuICAgIHZhciBpbmZpeFxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdW5pZm9ybXMubGVuZ3RoOyArK2kpIHtcbiAgICAgIHZhciB1bmlmb3JtID0gdW5pZm9ybXNbaV1cbiAgICAgIHZhciBuYW1lID0gdW5pZm9ybS5uYW1lXG4gICAgICB2YXIgdHlwZSA9IHVuaWZvcm0uaW5mby50eXBlXG4gICAgICB2YXIgYXJnID0gYXJncy51bmlmb3Jtc1tuYW1lXVxuICAgICAgdmFyIFVOSUZPUk0gPSBlbnYubGluayh1bmlmb3JtKVxuICAgICAgdmFyIExPQ0FUSU9OID0gVU5JRk9STSArICcubG9jYXRpb24nXG5cbiAgICAgIHZhciBWQUxVRVxuICAgICAgaWYgKGFyZykge1xuICAgICAgICBpZiAoIWZpbHRlcihhcmcpKSB7XG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfVxuICAgICAgICBpZiAoaXNTdGF0aWMoYXJnKSkge1xuICAgICAgICAgIHZhciB2YWx1ZSA9IGFyZy52YWx1ZVxuICAgICAgICAgIFxuICAgICAgICAgIGlmICh0eXBlID09PSBHTF9TQU1QTEVSXzJEIHx8IHR5cGUgPT09IEdMX1NBTVBMRVJfQ1VCRSkge1xuICAgICAgICAgICAgXG4gICAgICAgICAgICB2YXIgVEVYX1ZBTFVFID0gZW52LmxpbmsodmFsdWUuX3RleHR1cmUgfHwgdmFsdWUuY29sb3JbMF0uX3RleHR1cmUpXG4gICAgICAgICAgICBzY29wZShHTCwgJy51bmlmb3JtMWkoJywgTE9DQVRJT04sICcsJywgVEVYX1ZBTFVFICsgJy5iaW5kKCkpOycpXG4gICAgICAgICAgICBzY29wZS5leGl0KFRFWF9WQUxVRSwgJy51bmJpbmQoKTsnKVxuICAgICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAgICB0eXBlID09PSBHTF9GTE9BVF9NQVQyIHx8XG4gICAgICAgICAgICB0eXBlID09PSBHTF9GTE9BVF9NQVQzIHx8XG4gICAgICAgICAgICB0eXBlID09PSBHTF9GTE9BVF9NQVQ0KSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHZhciBNQVRfVkFMVUUgPSBlbnYuZ2xvYmFsLmRlZignbmV3IEZsb2F0MzJBcnJheShbJyArXG4gICAgICAgICAgICAgIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKHZhbHVlKSArICddKScpXG4gICAgICAgICAgICB2YXIgZGltID0gMlxuICAgICAgICAgICAgaWYgKHR5cGUgPT09IEdMX0ZMT0FUX01BVDMpIHtcbiAgICAgICAgICAgICAgZGltID0gM1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlID09PSBHTF9GTE9BVF9NQVQ0KSB7XG4gICAgICAgICAgICAgIGRpbSA9IDRcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHNjb3BlKFxuICAgICAgICAgICAgICBHTCwgJy51bmlmb3JtTWF0cml4JywgZGltLCAnZnYoJyxcbiAgICAgICAgICAgICAgTE9DQVRJT04sICcsZmFsc2UsJywgTUFUX1ZBTFVFLCAnKTsnKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgICAgICAgICAgY2FzZSBHTF9GTE9BVDpcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICcxZidcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzI6XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaW5maXggPSAnMmYnXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUMzOlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGluZml4ID0gJzNmJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDNDpcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICc0ZidcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0JPT0w6XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaW5maXggPSAnMWknXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9JTlQ6XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaW5maXggPSAnMWknXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzI6XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaW5maXggPSAnMmknXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9JTlRfVkVDMjpcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICcyaSdcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0JPT0xfVkVDMzpcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICczaSdcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0lOVF9WRUMzOlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGluZml4ID0gJzNpJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfQk9PTF9WRUM0OlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGluZml4ID0gJzRpJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfSU5UX1ZFQzQ6XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaW5maXggPSAnNGknXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHNjb3BlKEdMLCAnLnVuaWZvcm0nLCBpbmZpeCwgJygnLCBMT0NBVElPTiwgJywnLFxuICAgICAgICAgICAgICBpc0FycmF5TGlrZSh2YWx1ZSkgPyBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbCh2YWx1ZSkgOiB2YWx1ZSxcbiAgICAgICAgICAgICAgJyk7JylcbiAgICAgICAgICB9XG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBWQUxVRSA9IGFyZy5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKCFmaWx0ZXIoU0NPUEVfREVDTCkpIHtcbiAgICAgICAgICBjb250aW51ZVxuICAgICAgICB9XG4gICAgICAgIFZBTFVFID0gc2NvcGUuZGVmKHNoYXJlZC51bmlmb3JtcywgJ1snLCBzdHJpbmdTdG9yZS5pZChuYW1lKSwgJ10nKVxuICAgICAgfVxuXG4gICAgICBpZiAodHlwZSA9PT0gR0xfU0FNUExFUl8yRCkge1xuICAgICAgICBzY29wZShcbiAgICAgICAgICAnaWYoJywgVkFMVUUsICcmJicsIFZBTFVFLCAnLl9yZWdsVHlwZT09PVwiZnJhbWVidWZmZXJcIil7JyxcbiAgICAgICAgICBWQUxVRSwgJz0nLCBWQUxVRSwgJy5jb2xvclswXTsnLFxuICAgICAgICAgICd9JylcbiAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gR0xfU0FNUExFUl9DVUJFKSB7XG4gICAgICAgIHNjb3BlKFxuICAgICAgICAgICdpZignLCBWQUxVRSwgJyYmJywgVkFMVUUsICcuX3JlZ2xUeXBlPT09XCJmcmFtZWJ1ZmZlckN1YmVcIil7JyxcbiAgICAgICAgICBWQUxVRSwgJz0nLCBWQUxVRSwgJy5jb2xvclswXTsnLFxuICAgICAgICAgICd9JylcbiAgICAgIH1cblxuICAgICAgLy8gcGVyZm9ybSB0eXBlIHZhbGlkYXRpb25cbiAgICAgIFxuXG4gICAgICB2YXIgdW5yb2xsID0gMVxuICAgICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICAgIGNhc2UgR0xfU0FNUExFUl8yRDpcbiAgICAgICAgY2FzZSBHTF9TQU1QTEVSX0NVQkU6XG4gICAgICAgICAgdmFyIFRFWCA9IHNjb3BlLmRlZihWQUxVRSwgJy5fdGV4dHVyZScpXG4gICAgICAgICAgc2NvcGUoR0wsICcudW5pZm9ybTFpKCcsIExPQ0FUSU9OLCAnLCcsIFRFWCwgJy5iaW5kKCkpOycpXG4gICAgICAgICAgc2NvcGUuZXhpdChURVgsICcudW5iaW5kKCk7JylcbiAgICAgICAgICBjb250aW51ZVxuXG4gICAgICAgIGNhc2UgR0xfSU5UOlxuICAgICAgICBjYXNlIEdMX0JPT0w6XG4gICAgICAgICAgaW5maXggPSAnMWknXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0lOVF9WRUMyOlxuICAgICAgICBjYXNlIEdMX0JPT0xfVkVDMjpcbiAgICAgICAgICBpbmZpeCA9ICcyaSdcbiAgICAgICAgICB1bnJvbGwgPSAyXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0lOVF9WRUMzOlxuICAgICAgICBjYXNlIEdMX0JPT0xfVkVDMzpcbiAgICAgICAgICBpbmZpeCA9ICczaSdcbiAgICAgICAgICB1bnJvbGwgPSAzXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0lOVF9WRUM0OlxuICAgICAgICBjYXNlIEdMX0JPT0xfVkVDNDpcbiAgICAgICAgICBpbmZpeCA9ICc0aSdcbiAgICAgICAgICB1bnJvbGwgPSA0XG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0ZMT0FUOlxuICAgICAgICAgIGluZml4ID0gJzFmJ1xuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUMyOlxuICAgICAgICAgIGluZml4ID0gJzJmJ1xuICAgICAgICAgIHVucm9sbCA9IDJcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDMzpcbiAgICAgICAgICBpbmZpeCA9ICczZidcbiAgICAgICAgICB1bnJvbGwgPSAzXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzQ6XG4gICAgICAgICAgaW5maXggPSAnNGYnXG4gICAgICAgICAgdW5yb2xsID0gNFxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9GTE9BVF9NQVQyOlxuICAgICAgICAgIGluZml4ID0gJ01hdHJpeDJmdidcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfRkxPQVRfTUFUMzpcbiAgICAgICAgICBpbmZpeCA9ICdNYXRyaXgzZnYnXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0ZMT0FUX01BVDQ6XG4gICAgICAgICAgaW5maXggPSAnTWF0cml4NGZ2J1xuICAgICAgICAgIGJyZWFrXG4gICAgICB9XG5cbiAgICAgIHNjb3BlKEdMLCAnLnVuaWZvcm0nLCBpbmZpeCwgJygnLCBMT0NBVElPTiwgJywnKVxuICAgICAgaWYgKGluZml4LmNoYXJBdCgwKSA9PT0gJ00nKSB7XG4gICAgICAgIHZhciBtYXRTaXplID0gTWF0aC5wb3codHlwZSAtIEdMX0ZMT0FUX01BVDIgKyAyLCAyKVxuICAgICAgICB2YXIgU1RPUkFHRSA9IGVudi5nbG9iYWwuZGVmKCduZXcgRmxvYXQzMkFycmF5KCcsIG1hdFNpemUsICcpJylcbiAgICAgICAgc2NvcGUoXG4gICAgICAgICAgJ2ZhbHNlLChBcnJheS5pc0FycmF5KCcsIFZBTFVFLCAnKXx8JywgVkFMVUUsICcgaW5zdGFuY2VvZiBGbG9hdDMyQXJyYXkpPycsIFZBTFVFLCAnOignLFxuICAgICAgICAgIGxvb3AobWF0U2l6ZSwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICAgIHJldHVybiBTVE9SQUdFICsgJ1snICsgaSArICddPScgKyBWQUxVRSArICdbJyArIGkgKyAnXSdcbiAgICAgICAgICB9KSwgJywnLCBTVE9SQUdFLCAnKScpXG4gICAgICB9IGVsc2UgaWYgKHVucm9sbCA+IDEpIHtcbiAgICAgICAgc2NvcGUobG9vcCh1bnJvbGwsIGZ1bmN0aW9uIChpKSB7XG4gICAgICAgICAgcmV0dXJuIFZBTFVFICsgJ1snICsgaSArICddJ1xuICAgICAgICB9KSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNjb3BlKFZBTFVFKVxuICAgICAgfVxuICAgICAgc2NvcGUoJyk7JylcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBlbWl0RHJhdyAoZW52LCBvdXRlciwgaW5uZXIsIGFyZ3MpIHtcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuICAgIHZhciBHTCA9IHNoYXJlZC5nbFxuICAgIHZhciBEUkFXX1NUQVRFID0gc2hhcmVkLmRyYXdcblxuICAgIHZhciBkcmF3T3B0aW9ucyA9IGFyZ3MuZHJhd1xuXG4gICAgZnVuY3Rpb24gZW1pdEVsZW1lbnRzICgpIHtcbiAgICAgIHZhciBkZWZuID0gZHJhd09wdGlvbnMuZWxlbWVudHNcbiAgICAgIHZhciBFTEVNRU5UU1xuICAgICAgdmFyIHNjb3BlID0gb3V0ZXJcbiAgICAgIGlmIChkZWZuKSB7XG4gICAgICAgIGlmICgoZGVmbi5jb250ZXh0RGVwICYmIGFyZ3MuY29udGV4dER5bmFtaWMpIHx8IGRlZm4ucHJvcERlcCkge1xuICAgICAgICAgIHNjb3BlID0gaW5uZXJcbiAgICAgICAgfVxuICAgICAgICBFTEVNRU5UUyA9IGRlZm4uYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBFTEVNRU5UUyA9IHNjb3BlLmRlZihEUkFXX1NUQVRFLCAnLicsIFNfRUxFTUVOVFMpXG4gICAgICB9XG4gICAgICBpZiAoRUxFTUVOVFMpIHtcbiAgICAgICAgc2NvcGUoXG4gICAgICAgICAgJ2lmKCcgKyBFTEVNRU5UUyArICcpJyArXG4gICAgICAgICAgR0wgKyAnLmJpbmRCdWZmZXIoJyArIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSICsgJywnICsgRUxFTUVOVFMgKyAnLmJ1ZmZlci5idWZmZXIpOycpXG4gICAgICB9XG4gICAgICByZXR1cm4gRUxFTUVOVFNcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBlbWl0Q291bnQgKCkge1xuICAgICAgdmFyIGRlZm4gPSBkcmF3T3B0aW9ucy5jb3VudFxuICAgICAgdmFyIENPVU5UXG4gICAgICB2YXIgc2NvcGUgPSBvdXRlclxuICAgICAgaWYgKGRlZm4pIHtcbiAgICAgICAgaWYgKChkZWZuLmNvbnRleHREZXAgJiYgYXJncy5jb250ZXh0RHluYW1pYykgfHwgZGVmbi5wcm9wRGVwKSB7XG4gICAgICAgICAgc2NvcGUgPSBpbm5lclxuICAgICAgICB9XG4gICAgICAgIENPVU5UID0gZGVmbi5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgICAgXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBDT1VOVCA9IHNjb3BlLmRlZihEUkFXX1NUQVRFLCAnLicsIFNfQ09VTlQpXG4gICAgICAgIFxuICAgICAgfVxuICAgICAgcmV0dXJuIENPVU5UXG4gICAgfVxuXG4gICAgdmFyIEVMRU1FTlRTID0gZW1pdEVsZW1lbnRzKClcbiAgICBmdW5jdGlvbiBlbWl0VmFsdWUgKG5hbWUpIHtcbiAgICAgIHZhciBkZWZuID0gZHJhd09wdGlvbnNbbmFtZV1cbiAgICAgIGlmIChkZWZuKSB7XG4gICAgICAgIGlmICgoZGVmbi5jb250ZXh0RGVwICYmIGFyZ3MuY29udGV4dER5bmFtaWMpIHx8IGRlZm4ucHJvcERlcCkge1xuICAgICAgICAgIHJldHVybiBkZWZuLmFwcGVuZChlbnYsIGlubmVyKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBkZWZuLmFwcGVuZChlbnYsIG91dGVyKVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gb3V0ZXIuZGVmKERSQVdfU1RBVEUsICcuJywgbmFtZSlcbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgUFJJTUlUSVZFID0gZW1pdFZhbHVlKFNfUFJJTUlUSVZFKVxuICAgIHZhciBPRkZTRVQgPSBlbWl0VmFsdWUoU19PRkZTRVQpXG5cbiAgICB2YXIgQ09VTlQgPSBlbWl0Q291bnQoKVxuICAgIGlmICh0eXBlb2YgQ09VTlQgPT09ICdudW1iZXInKSB7XG4gICAgICBpZiAoQ09VTlQgPT09IDApIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGlubmVyKCdpZignLCBDT1VOVCwgJyl7JylcbiAgICAgIGlubmVyLmV4aXQoJ30nKVxuICAgIH1cblxuICAgIHZhciBJTlNUQU5DRVMsIEVYVF9JTlNUQU5DSU5HXG4gICAgaWYgKGV4dEluc3RhbmNpbmcpIHtcbiAgICAgIElOU1RBTkNFUyA9IGVtaXRWYWx1ZShTX0lOU1RBTkNFUylcbiAgICAgIEVYVF9JTlNUQU5DSU5HID0gZW52Lmluc3RhbmNpbmdcbiAgICB9XG5cbiAgICB2YXIgRUxFTUVOVF9UWVBFID0gRUxFTUVOVFMgKyAnLnR5cGUnXG5cbiAgICB2YXIgZWxlbWVudHNTdGF0aWMgPSBkcmF3T3B0aW9ucy5lbGVtZW50cyAmJiBpc1N0YXRpYyhkcmF3T3B0aW9ucy5lbGVtZW50cylcblxuICAgIGZ1bmN0aW9uIGVtaXRJbnN0YW5jaW5nICgpIHtcbiAgICAgIGZ1bmN0aW9uIGRyYXdFbGVtZW50cyAoKSB7XG4gICAgICAgIGlubmVyKEVYVF9JTlNUQU5DSU5HLCAnLmRyYXdFbGVtZW50c0luc3RhbmNlZEFOR0xFKCcsIFtcbiAgICAgICAgICBQUklNSVRJVkUsXG4gICAgICAgICAgQ09VTlQsXG4gICAgICAgICAgRUxFTUVOVF9UWVBFLFxuICAgICAgICAgIE9GRlNFVCArICc8PCgoJyArIEVMRU1FTlRfVFlQRSArICctJyArIEdMX1VOU0lHTkVEX0JZVEUgKyAnKT4+MSknLFxuICAgICAgICAgIElOU1RBTkNFU1xuICAgICAgICBdLCAnKTsnKVxuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBkcmF3QXJyYXlzICgpIHtcbiAgICAgICAgaW5uZXIoRVhUX0lOU1RBTkNJTkcsICcuZHJhd0FycmF5c0luc3RhbmNlZEFOR0xFKCcsXG4gICAgICAgICAgW1BSSU1JVElWRSwgT0ZGU0VULCBDT1VOVCwgSU5TVEFOQ0VTXSwgJyk7JylcbiAgICAgIH1cblxuICAgICAgaWYgKEVMRU1FTlRTKSB7XG4gICAgICAgIGlmICghZWxlbWVudHNTdGF0aWMpIHtcbiAgICAgICAgICBpbm5lcignaWYoJywgRUxFTUVOVFMsICcpeycpXG4gICAgICAgICAgZHJhd0VsZW1lbnRzKClcbiAgICAgICAgICBpbm5lcignfWVsc2V7JylcbiAgICAgICAgICBkcmF3QXJyYXlzKClcbiAgICAgICAgICBpbm5lcignfScpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZHJhd0VsZW1lbnRzKClcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZHJhd0FycmF5cygpXG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZW1pdFJlZ3VsYXIgKCkge1xuICAgICAgZnVuY3Rpb24gZHJhd0VsZW1lbnRzICgpIHtcbiAgICAgICAgaW5uZXIoR0wgKyAnLmRyYXdFbGVtZW50cygnICsgW1xuICAgICAgICAgIFBSSU1JVElWRSxcbiAgICAgICAgICBDT1VOVCxcbiAgICAgICAgICBFTEVNRU5UX1RZUEUsXG4gICAgICAgICAgT0ZGU0VUICsgJzw8KCgnICsgRUxFTUVOVF9UWVBFICsgJy0nICsgR0xfVU5TSUdORURfQllURSArICcpPj4xKSdcbiAgICAgICAgXSArICcpOycpXG4gICAgICB9XG5cbiAgICAgIGZ1bmN0aW9uIGRyYXdBcnJheXMgKCkge1xuICAgICAgICBpbm5lcihHTCArICcuZHJhd0FycmF5cygnICsgW1BSSU1JVElWRSwgT0ZGU0VULCBDT1VOVF0gKyAnKTsnKVxuICAgICAgfVxuXG4gICAgICBpZiAoRUxFTUVOVFMpIHtcbiAgICAgICAgaWYgKCFlbGVtZW50c1N0YXRpYykge1xuICAgICAgICAgIGlubmVyKCdpZignLCBFTEVNRU5UUywgJyl7JylcbiAgICAgICAgICBkcmF3RWxlbWVudHMoKVxuICAgICAgICAgIGlubmVyKCd9ZWxzZXsnKVxuICAgICAgICAgIGRyYXdBcnJheXMoKVxuICAgICAgICAgIGlubmVyKCd9JylcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBkcmF3RWxlbWVudHMoKVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkcmF3QXJyYXlzKClcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoZXh0SW5zdGFuY2luZyAmJiAodHlwZW9mIElOU1RBTkNFUyAhPT0gJ251bWJlcicgfHwgSU5TVEFOQ0VTID49IDApKSB7XG4gICAgICBpZiAodHlwZW9mIElOU1RBTkNFUyA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgaW5uZXIoJ2lmKCcsIElOU1RBTkNFUywgJz4wKXsnKVxuICAgICAgICBlbWl0SW5zdGFuY2luZygpXG4gICAgICAgIGlubmVyKCd9ZWxzZSBpZignLCBJTlNUQU5DRVMsICc8MCl7JylcbiAgICAgICAgZW1pdFJlZ3VsYXIoKVxuICAgICAgICBpbm5lcignfScpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBlbWl0SW5zdGFuY2luZygpXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGVtaXRSZWd1bGFyKClcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBjcmVhdGVCb2R5IChlbWl0Qm9keSwgcGFyZW50RW52LCBhcmdzLCBwcm9ncmFtLCBjb3VudCkge1xuICAgIHZhciBlbnYgPSBjcmVhdGVSRUdMRW52aXJvbm1lbnQoKVxuICAgIHZhciBzY29wZSA9IGVudi5wcm9jKCdib2R5JywgY291bnQpXG4gICAgXG4gICAgaWYgKGV4dEluc3RhbmNpbmcpIHtcbiAgICAgIGVudi5pbnN0YW5jaW5nID0gc2NvcGUuZGVmKFxuICAgICAgICBlbnYuc2hhcmVkLmV4dGVuc2lvbnMsICcuYW5nbGVfaW5zdGFuY2VkX2FycmF5cycpXG4gICAgfVxuICAgIGVtaXRCb2R5KGVudiwgc2NvcGUsIGFyZ3MsIHByb2dyYW0pXG4gICAgcmV0dXJuIGVudi5jb21waWxlKCkuYm9keVxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBEUkFXIFBST0NcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICBmdW5jdGlvbiBlbWl0RHJhd0JvZHkgKGVudiwgZHJhdywgYXJncywgcHJvZ3JhbSkge1xuICAgIGluamVjdEV4dGVuc2lvbnMoZW52LCBkcmF3KVxuICAgIGVtaXRBdHRyaWJ1dGVzKGVudiwgZHJhdywgYXJncywgcHJvZ3JhbS5hdHRyaWJ1dGVzLCBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIH0pXG4gICAgZW1pdFVuaWZvcm1zKGVudiwgZHJhdywgYXJncywgcHJvZ3JhbS51bmlmb3JtcywgZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIHRydWVcbiAgICB9KVxuICAgIGVtaXREcmF3KGVudiwgZHJhdywgZHJhdywgYXJncylcbiAgfVxuXG4gIGZ1bmN0aW9uIGVtaXREcmF3UHJvYyAoZW52LCBhcmdzKSB7XG4gICAgdmFyIGRyYXcgPSBlbnYucHJvYygnZHJhdycsIDEpXG5cbiAgICBpbmplY3RFeHRlbnNpb25zKGVudiwgZHJhdylcblxuICAgIGVtaXRDb250ZXh0KGVudiwgZHJhdywgYXJncy5jb250ZXh0KVxuICAgIGVtaXRQb2xsRnJhbWVidWZmZXIoZW52LCBkcmF3LCBhcmdzLmZyYW1lYnVmZmVyKVxuXG4gICAgZW1pdFBvbGxTdGF0ZShlbnYsIGRyYXcsIGFyZ3MpXG4gICAgZW1pdFNldE9wdGlvbnMoZW52LCBkcmF3LCBhcmdzLnN0YXRlKVxuXG4gICAgZW1pdFByb2ZpbGUoZW52LCBkcmF3LCBhcmdzLCBmYWxzZSwgdHJ1ZSlcblxuICAgIHZhciBwcm9ncmFtID0gYXJncy5zaGFkZXIucHJvZ1Zhci5hcHBlbmQoZW52LCBkcmF3KVxuICAgIGRyYXcoZW52LnNoYXJlZC5nbCwgJy51c2VQcm9ncmFtKCcsIHByb2dyYW0sICcucHJvZ3JhbSk7JylcblxuICAgIGlmIChhcmdzLnNoYWRlci5wcm9ncmFtKSB7XG4gICAgICBlbWl0RHJhd0JvZHkoZW52LCBkcmF3LCBhcmdzLCBhcmdzLnNoYWRlci5wcm9ncmFtKVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgZHJhd0NhY2hlID0gZW52Lmdsb2JhbC5kZWYoJ3t9JylcbiAgICAgIHZhciBQUk9HX0lEID0gZHJhdy5kZWYocHJvZ3JhbSwgJy5pZCcpXG4gICAgICB2YXIgQ0FDSEVEX1BST0MgPSBkcmF3LmRlZihkcmF3Q2FjaGUsICdbJywgUFJPR19JRCwgJ10nKVxuICAgICAgZHJhdyhcbiAgICAgICAgZW52LmNvbmQoQ0FDSEVEX1BST0MpXG4gICAgICAgICAgLnRoZW4oQ0FDSEVEX1BST0MsICcuY2FsbCh0aGlzLGEwKTsnKVxuICAgICAgICAgIC5lbHNlKFxuICAgICAgICAgICAgQ0FDSEVEX1BST0MsICc9JywgZHJhd0NhY2hlLCAnWycsIFBST0dfSUQsICddPScsXG4gICAgICAgICAgICBlbnYubGluayhmdW5jdGlvbiAocHJvZ3JhbSkge1xuICAgICAgICAgICAgICByZXR1cm4gY3JlYXRlQm9keShlbWl0RHJhd0JvZHksIGVudiwgYXJncywgcHJvZ3JhbSwgMSlcbiAgICAgICAgICAgIH0pLCAnKCcsIHByb2dyYW0sICcpOycsXG4gICAgICAgICAgICBDQUNIRURfUFJPQywgJy5jYWxsKHRoaXMsYTApOycpKVxuICAgIH1cblxuICAgIGlmIChPYmplY3Qua2V5cyhhcmdzLnN0YXRlKS5sZW5ndGggPiAwKSB7XG4gICAgICBkcmF3KGVudi5zaGFyZWQuY3VycmVudCwgJy5kaXJ0eT10cnVlOycpXG4gICAgfVxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBCQVRDSCBQUk9DXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICBmdW5jdGlvbiBlbWl0QmF0Y2hEeW5hbWljU2hhZGVyQm9keSAoZW52LCBzY29wZSwgYXJncywgcHJvZ3JhbSkge1xuICAgIGVudi5iYXRjaElkID0gJ2ExJ1xuXG4gICAgaW5qZWN0RXh0ZW5zaW9ucyhlbnYsIHNjb3BlKVxuXG4gICAgZnVuY3Rpb24gYWxsICgpIHtcbiAgICAgIHJldHVybiB0cnVlXG4gICAgfVxuXG4gICAgZW1pdEF0dHJpYnV0ZXMoZW52LCBzY29wZSwgYXJncywgcHJvZ3JhbS5hdHRyaWJ1dGVzLCBhbGwpXG4gICAgZW1pdFVuaWZvcm1zKGVudiwgc2NvcGUsIGFyZ3MsIHByb2dyYW0udW5pZm9ybXMsIGFsbClcbiAgICBlbWl0RHJhdyhlbnYsIHNjb3BlLCBzY29wZSwgYXJncylcbiAgfVxuXG4gIGZ1bmN0aW9uIGVtaXRCYXRjaEJvZHkgKGVudiwgc2NvcGUsIGFyZ3MsIHByb2dyYW0pIHtcbiAgICBpbmplY3RFeHRlbnNpb25zKGVudiwgc2NvcGUpXG5cbiAgICB2YXIgY29udGV4dER5bmFtaWMgPSBhcmdzLmNvbnRleHREZXBcblxuICAgIHZhciBCQVRDSF9JRCA9IHNjb3BlLmRlZigpXG4gICAgdmFyIFBST1BfTElTVCA9ICdhMCdcbiAgICB2YXIgTlVNX1BST1BTID0gJ2ExJ1xuICAgIHZhciBQUk9QUyA9IHNjb3BlLmRlZigpXG4gICAgZW52LnNoYXJlZC5wcm9wcyA9IFBST1BTXG4gICAgZW52LmJhdGNoSWQgPSBCQVRDSF9JRFxuXG4gICAgdmFyIG91dGVyID0gZW52LnNjb3BlKClcbiAgICB2YXIgaW5uZXIgPSBlbnYuc2NvcGUoKVxuXG4gICAgc2NvcGUoXG4gICAgICBvdXRlci5lbnRyeSxcbiAgICAgICdmb3IoJywgQkFUQ0hfSUQsICc9MDsnLCBCQVRDSF9JRCwgJzwnLCBOVU1fUFJPUFMsICc7KysnLCBCQVRDSF9JRCwgJyl7JyxcbiAgICAgIFBST1BTLCAnPScsIFBST1BfTElTVCwgJ1snLCBCQVRDSF9JRCwgJ107JyxcbiAgICAgIGlubmVyLFxuICAgICAgJ30nLFxuICAgICAgb3V0ZXIuZXhpdClcblxuICAgIGZ1bmN0aW9uIGlzSW5uZXJEZWZuIChkZWZuKSB7XG4gICAgICByZXR1cm4gKChkZWZuLmNvbnRleHREZXAgJiYgY29udGV4dER5bmFtaWMpIHx8IGRlZm4ucHJvcERlcClcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBpc091dGVyRGVmbiAoZGVmbikge1xuICAgICAgcmV0dXJuICFpc0lubmVyRGVmbihkZWZuKVxuICAgIH1cblxuICAgIGlmIChhcmdzLm5lZWRzQ29udGV4dCkge1xuICAgICAgZW1pdENvbnRleHQoZW52LCBpbm5lciwgYXJncy5jb250ZXh0KVxuICAgIH1cbiAgICBpZiAoYXJncy5uZWVkc0ZyYW1lYnVmZmVyKSB7XG4gICAgICBlbWl0UG9sbEZyYW1lYnVmZmVyKGVudiwgaW5uZXIsIGFyZ3MuZnJhbWVidWZmZXIpXG4gICAgfVxuICAgIGVtaXRTZXRPcHRpb25zKGVudiwgaW5uZXIsIGFyZ3Muc3RhdGUsIGlzSW5uZXJEZWZuKVxuXG4gICAgaWYgKGFyZ3MucHJvZmlsZSAmJiBpc0lubmVyRGVmbihhcmdzLnByb2ZpbGUpKSB7XG4gICAgICBlbWl0UHJvZmlsZShlbnYsIGlubmVyLCBhcmdzLCBmYWxzZSwgdHJ1ZSlcbiAgICB9XG5cbiAgICBpZiAoIXByb2dyYW0pIHtcbiAgICAgIHZhciBwcm9nQ2FjaGUgPSBlbnYuZ2xvYmFsLmRlZigne30nKVxuICAgICAgdmFyIFBST0dSQU0gPSBhcmdzLnNoYWRlci5wcm9nVmFyLmFwcGVuZChlbnYsIGlubmVyKVxuICAgICAgdmFyIFBST0dfSUQgPSBpbm5lci5kZWYoUFJPR1JBTSwgJy5pZCcpXG4gICAgICB2YXIgQ0FDSEVEX1BST0MgPSBpbm5lci5kZWYocHJvZ0NhY2hlLCAnWycsIFBST0dfSUQsICddJylcbiAgICAgIGlubmVyKFxuICAgICAgICBlbnYuc2hhcmVkLmdsLCAnLnVzZVByb2dyYW0oJywgUFJPR1JBTSwgJy5wcm9ncmFtKTsnLFxuICAgICAgICAnaWYoIScsIENBQ0hFRF9QUk9DLCAnKXsnLFxuICAgICAgICBDQUNIRURfUFJPQywgJz0nLCBwcm9nQ2FjaGUsICdbJywgUFJPR19JRCwgJ109JyxcbiAgICAgICAgZW52LmxpbmsoZnVuY3Rpb24gKHByb2dyYW0pIHtcbiAgICAgICAgICByZXR1cm4gY3JlYXRlQm9keShcbiAgICAgICAgICAgIGVtaXRCYXRjaER5bmFtaWNTaGFkZXJCb2R5LCBlbnYsIGFyZ3MsIHByb2dyYW0sIDIpXG4gICAgICAgIH0pLCAnKCcsIFBST0dSQU0sICcpO30nLFxuICAgICAgICBDQUNIRURfUFJPQywgJy5jYWxsKHRoaXMsYTBbJywgQkFUQ0hfSUQsICddLCcsIEJBVENIX0lELCAnKTsnKVxuICAgIH0gZWxzZSB7XG4gICAgICBlbWl0QXR0cmlidXRlcyhlbnYsIG91dGVyLCBhcmdzLCBwcm9ncmFtLmF0dHJpYnV0ZXMsIGlzT3V0ZXJEZWZuKVxuICAgICAgZW1pdEF0dHJpYnV0ZXMoZW52LCBpbm5lciwgYXJncywgcHJvZ3JhbS5hdHRyaWJ1dGVzLCBpc0lubmVyRGVmbilcbiAgICAgIGVtaXRVbmlmb3JtcyhlbnYsIG91dGVyLCBhcmdzLCBwcm9ncmFtLnVuaWZvcm1zLCBpc091dGVyRGVmbilcbiAgICAgIGVtaXRVbmlmb3JtcyhlbnYsIGlubmVyLCBhcmdzLCBwcm9ncmFtLnVuaWZvcm1zLCBpc0lubmVyRGVmbilcbiAgICAgIGVtaXREcmF3KGVudiwgb3V0ZXIsIGlubmVyLCBhcmdzKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGVtaXRCYXRjaFByb2MgKGVudiwgYXJncykge1xuICAgIHZhciBiYXRjaCA9IGVudi5wcm9jKCdiYXRjaCcsIDIpXG4gICAgZW52LmJhdGNoSWQgPSAnMCdcblxuICAgIGluamVjdEV4dGVuc2lvbnMoZW52LCBiYXRjaClcblxuICAgIC8vIENoZWNrIGlmIGFueSBjb250ZXh0IHZhcmlhYmxlcyBkZXBlbmQgb24gcHJvcHNcbiAgICB2YXIgY29udGV4dER5bmFtaWMgPSBmYWxzZVxuICAgIHZhciBuZWVkc0NvbnRleHQgPSB0cnVlXG4gICAgT2JqZWN0LmtleXMoYXJncy5jb250ZXh0KS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICBjb250ZXh0RHluYW1pYyA9IGNvbnRleHREeW5hbWljIHx8IGFyZ3MuY29udGV4dFtuYW1lXS5wcm9wRGVwXG4gICAgfSlcbiAgICBpZiAoIWNvbnRleHREeW5hbWljKSB7XG4gICAgICBlbWl0Q29udGV4dChlbnYsIGJhdGNoLCBhcmdzLmNvbnRleHQpXG4gICAgICBuZWVkc0NvbnRleHQgPSBmYWxzZVxuICAgIH1cblxuICAgIC8vIGZyYW1lYnVmZmVyIHN0YXRlIGFmZmVjdHMgZnJhbWVidWZmZXJXaWR0aC9oZWlnaHQgY29udGV4dCB2YXJzXG4gICAgdmFyIGZyYW1lYnVmZmVyID0gYXJncy5mcmFtZWJ1ZmZlclxuICAgIHZhciBuZWVkc0ZyYW1lYnVmZmVyID0gZmFsc2VcbiAgICBpZiAoZnJhbWVidWZmZXIpIHtcbiAgICAgIGlmIChmcmFtZWJ1ZmZlci5wcm9wRGVwKSB7XG4gICAgICAgIGNvbnRleHREeW5hbWljID0gbmVlZHNGcmFtZWJ1ZmZlciA9IHRydWVcbiAgICAgIH0gZWxzZSBpZiAoZnJhbWVidWZmZXIuY29udGV4dERlcCAmJiBjb250ZXh0RHluYW1pYykge1xuICAgICAgICBuZWVkc0ZyYW1lYnVmZmVyID0gdHJ1ZVxuICAgICAgfVxuICAgICAgaWYgKCFuZWVkc0ZyYW1lYnVmZmVyKSB7XG4gICAgICAgIGVtaXRQb2xsRnJhbWVidWZmZXIoZW52LCBiYXRjaCwgZnJhbWVidWZmZXIpXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGVtaXRQb2xsRnJhbWVidWZmZXIoZW52LCBiYXRjaCwgbnVsbClcbiAgICB9XG5cbiAgICAvLyB2aWV3cG9ydCBpcyB3ZWlyZCBiZWNhdXNlIGl0IGNhbiBhZmZlY3QgY29udGV4dCB2YXJzXG4gICAgaWYgKGFyZ3Muc3RhdGUudmlld3BvcnQgJiYgYXJncy5zdGF0ZS52aWV3cG9ydC5wcm9wRGVwKSB7XG4gICAgICBjb250ZXh0RHluYW1pYyA9IHRydWVcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBpc0lubmVyRGVmbiAoZGVmbikge1xuICAgICAgcmV0dXJuIChkZWZuLmNvbnRleHREZXAgJiYgY29udGV4dER5bmFtaWMpIHx8IGRlZm4ucHJvcERlcFxuICAgIH1cblxuICAgIC8vIHNldCB3ZWJnbCBvcHRpb25zXG4gICAgZW1pdFBvbGxTdGF0ZShlbnYsIGJhdGNoLCBhcmdzKVxuICAgIGVtaXRTZXRPcHRpb25zKGVudiwgYmF0Y2gsIGFyZ3Muc3RhdGUsIGZ1bmN0aW9uIChkZWZuKSB7XG4gICAgICByZXR1cm4gIWlzSW5uZXJEZWZuKGRlZm4pXG4gICAgfSlcblxuICAgIGlmICghYXJncy5wcm9maWxlIHx8ICFpc0lubmVyRGVmbihhcmdzLnByb2ZpbGUpKSB7XG4gICAgICBlbWl0UHJvZmlsZShlbnYsIGJhdGNoLCBhcmdzLCBmYWxzZSwgJ2ExJylcbiAgICB9XG5cbiAgICAvLyBTYXZlIHRoZXNlIHZhbHVlcyB0byBhcmdzIHNvIHRoYXQgdGhlIGJhdGNoIGJvZHkgcm91dGluZSBjYW4gdXNlIHRoZW1cbiAgICBhcmdzLmNvbnRleHREZXAgPSBjb250ZXh0RHluYW1pY1xuICAgIGFyZ3MubmVlZHNDb250ZXh0ID0gbmVlZHNDb250ZXh0XG4gICAgYXJncy5uZWVkc0ZyYW1lYnVmZmVyID0gbmVlZHNGcmFtZWJ1ZmZlclxuXG4gICAgLy8gZGV0ZXJtaW5lIGlmIHNoYWRlciBpcyBkeW5hbWljXG4gICAgdmFyIHByb2dEZWZuID0gYXJncy5zaGFkZXIucHJvZ1ZhclxuICAgIGlmICgocHJvZ0RlZm4uY29udGV4dERlcCAmJiBjb250ZXh0RHluYW1pYykgfHwgcHJvZ0RlZm4ucHJvcERlcCkge1xuICAgICAgZW1pdEJhdGNoQm9keShcbiAgICAgICAgZW52LFxuICAgICAgICBiYXRjaCxcbiAgICAgICAgYXJncyxcbiAgICAgICAgbnVsbClcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIFBST0dSQU0gPSBwcm9nRGVmbi5hcHBlbmQoZW52LCBiYXRjaClcbiAgICAgIGJhdGNoKGVudi5zaGFyZWQuZ2wsICcudXNlUHJvZ3JhbSgnLCBQUk9HUkFNLCAnLnByb2dyYW0pOycpXG4gICAgICBpZiAoYXJncy5zaGFkZXIucHJvZ3JhbSkge1xuICAgICAgICBlbWl0QmF0Y2hCb2R5KFxuICAgICAgICAgIGVudixcbiAgICAgICAgICBiYXRjaCxcbiAgICAgICAgICBhcmdzLFxuICAgICAgICAgIGFyZ3Muc2hhZGVyLnByb2dyYW0pXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgYmF0Y2hDYWNoZSA9IGVudi5nbG9iYWwuZGVmKCd7fScpXG4gICAgICAgIHZhciBQUk9HX0lEID0gYmF0Y2guZGVmKFBST0dSQU0sICcuaWQnKVxuICAgICAgICB2YXIgQ0FDSEVEX1BST0MgPSBiYXRjaC5kZWYoYmF0Y2hDYWNoZSwgJ1snLCBQUk9HX0lELCAnXScpXG4gICAgICAgIGJhdGNoKFxuICAgICAgICAgIGVudi5jb25kKENBQ0hFRF9QUk9DKVxuICAgICAgICAgICAgLnRoZW4oQ0FDSEVEX1BST0MsICcuY2FsbCh0aGlzLGEwLGExKTsnKVxuICAgICAgICAgICAgLmVsc2UoXG4gICAgICAgICAgICAgIENBQ0hFRF9QUk9DLCAnPScsIGJhdGNoQ2FjaGUsICdbJywgUFJPR19JRCwgJ109JyxcbiAgICAgICAgICAgICAgZW52LmxpbmsoZnVuY3Rpb24gKHByb2dyYW0pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gY3JlYXRlQm9keShlbWl0QmF0Y2hCb2R5LCBlbnYsIGFyZ3MsIHByb2dyYW0sIDIpXG4gICAgICAgICAgICAgIH0pLCAnKCcsIFBST0dSQU0sICcpOycsXG4gICAgICAgICAgICAgIENBQ0hFRF9QUk9DLCAnLmNhbGwodGhpcyxhMCxhMSk7JykpXG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKE9iamVjdC5rZXlzKGFyZ3Muc3RhdGUpLmxlbmd0aCA+IDApIHtcbiAgICAgIGJhdGNoKGVudi5zaGFyZWQuY3VycmVudCwgJy5kaXJ0eT10cnVlOycpXG4gICAgfVxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBTQ09QRSBDT01NQU5EXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgZnVuY3Rpb24gZW1pdFNjb3BlUHJvYyAoZW52LCBhcmdzKSB7XG4gICAgdmFyIHNjb3BlID0gZW52LnByb2MoJ3Njb3BlJywgMylcbiAgICBlbnYuYmF0Y2hJZCA9ICdhMidcblxuICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgdmFyIENVUlJFTlRfU1RBVEUgPSBzaGFyZWQuY3VycmVudFxuXG4gICAgZW1pdENvbnRleHQoZW52LCBzY29wZSwgYXJncy5jb250ZXh0KVxuXG4gICAgaWYgKGFyZ3MuZnJhbWVidWZmZXIpIHtcbiAgICAgIGFyZ3MuZnJhbWVidWZmZXIuYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgfVxuXG4gICAgc29ydFN0YXRlKE9iamVjdC5rZXlzKGFyZ3Muc3RhdGUpKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICB2YXIgZGVmbiA9IGFyZ3Muc3RhdGVbbmFtZV1cbiAgICAgIHZhciB2YWx1ZSA9IGRlZm4uYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgICBpZiAoaXNBcnJheUxpa2UodmFsdWUpKSB7XG4gICAgICAgIHZhbHVlLmZvckVhY2goZnVuY3Rpb24gKHYsIGkpIHtcbiAgICAgICAgICBzY29wZS5zZXQoZW52Lm5leHRbbmFtZV0sICdbJyArIGkgKyAnXScsIHYpXG4gICAgICAgIH0pXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzY29wZS5zZXQoc2hhcmVkLm5leHQsICcuJyArIG5hbWUsIHZhbHVlKVxuICAgICAgfVxuICAgIH0pXG5cbiAgICBlbWl0UHJvZmlsZShlbnYsIHNjb3BlLCBhcmdzLCB0cnVlLCB0cnVlKVxuXG4gICAgO1tTX0VMRU1FTlRTLCBTX09GRlNFVCwgU19DT1VOVCwgU19JTlNUQU5DRVMsIFNfUFJJTUlUSVZFXS5mb3JFYWNoKFxuICAgICAgZnVuY3Rpb24gKG9wdCkge1xuICAgICAgICB2YXIgdmFyaWFibGUgPSBhcmdzLmRyYXdbb3B0XVxuICAgICAgICBpZiAoIXZhcmlhYmxlKSB7XG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cbiAgICAgICAgc2NvcGUuc2V0KHNoYXJlZC5kcmF3LCAnLicgKyBvcHQsICcnICsgdmFyaWFibGUuYXBwZW5kKGVudiwgc2NvcGUpKVxuICAgICAgfSlcblxuICAgIE9iamVjdC5rZXlzKGFyZ3MudW5pZm9ybXMpLmZvckVhY2goZnVuY3Rpb24gKG9wdCkge1xuICAgICAgc2NvcGUuc2V0KFxuICAgICAgICBzaGFyZWQudW5pZm9ybXMsXG4gICAgICAgICdbJyArIHN0cmluZ1N0b3JlLmlkKG9wdCkgKyAnXScsXG4gICAgICAgIGFyZ3MudW5pZm9ybXNbb3B0XS5hcHBlbmQoZW52LCBzY29wZSkpXG4gICAgfSlcblxuICAgIE9iamVjdC5rZXlzKGFyZ3MuYXR0cmlidXRlcykuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgdmFyIHJlY29yZCA9IGFyZ3MuYXR0cmlidXRlc1tuYW1lXS5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgIHZhciBzY29wZUF0dHJpYiA9IGVudi5zY29wZUF0dHJpYihuYW1lKVxuICAgICAgT2JqZWN0LmtleXMobmV3IEF0dHJpYnV0ZVJlY29yZCgpKS5mb3JFYWNoKGZ1bmN0aW9uIChwcm9wKSB7XG4gICAgICAgIHNjb3BlLnNldChzY29wZUF0dHJpYiwgJy4nICsgcHJvcCwgcmVjb3JkW3Byb3BdKVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgZnVuY3Rpb24gc2F2ZVNoYWRlciAobmFtZSkge1xuICAgICAgdmFyIHNoYWRlciA9IGFyZ3Muc2hhZGVyW25hbWVdXG4gICAgICBpZiAoc2hhZGVyKSB7XG4gICAgICAgIHNjb3BlLnNldChzaGFyZWQuc2hhZGVyLCAnLicgKyBuYW1lLCBzaGFkZXIuYXBwZW5kKGVudiwgc2NvcGUpKVxuICAgICAgfVxuICAgIH1cbiAgICBzYXZlU2hhZGVyKFNfVkVSVClcbiAgICBzYXZlU2hhZGVyKFNfRlJBRylcblxuICAgIGlmIChPYmplY3Qua2V5cyhhcmdzLnN0YXRlKS5sZW5ndGggPiAwKSB7XG4gICAgICBzY29wZShDVVJSRU5UX1NUQVRFLCAnLmRpcnR5PXRydWU7JylcbiAgICAgIHNjb3BlLmV4aXQoQ1VSUkVOVF9TVEFURSwgJy5kaXJ0eT10cnVlOycpXG4gICAgfVxuXG4gICAgc2NvcGUoJ2ExKCcsIGVudi5zaGFyZWQuY29udGV4dCwgJyxhMCwnLCBlbnYuYmF0Y2hJZCwgJyk7JylcbiAgfVxuXG4gIGZ1bmN0aW9uIGlzRHluYW1pY09iamVjdCAob2JqZWN0KSB7XG4gICAgaWYgKHR5cGVvZiBvYmplY3QgIT09ICdvYmplY3QnIHx8IGlzQXJyYXlMaWtlKG9iamVjdCkpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICB2YXIgcHJvcHMgPSBPYmplY3Qua2V5cyhvYmplY3QpXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwcm9wcy5sZW5ndGg7ICsraSkge1xuICAgICAgaWYgKGR5bmFtaWMuaXNEeW5hbWljKG9iamVjdFtwcm9wc1tpXV0pKSB7XG4gICAgICAgIHJldHVybiB0cnVlXG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmYWxzZVxuICB9XG5cbiAgZnVuY3Rpb24gc3BsYXRPYmplY3QgKGVudiwgb3B0aW9ucywgbmFtZSkge1xuICAgIHZhciBvYmplY3QgPSBvcHRpb25zLnN0YXRpY1tuYW1lXVxuICAgIGlmICghb2JqZWN0IHx8ICFpc0R5bmFtaWNPYmplY3Qob2JqZWN0KSkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgdmFyIGdsb2JhbHMgPSBlbnYuZ2xvYmFsXG4gICAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhvYmplY3QpXG4gICAgdmFyIHRoaXNEZXAgPSBmYWxzZVxuICAgIHZhciBjb250ZXh0RGVwID0gZmFsc2VcbiAgICB2YXIgcHJvcERlcCA9IGZhbHNlXG4gICAgdmFyIG9iamVjdFJlZiA9IGVudi5nbG9iYWwuZGVmKCd7fScpXG4gICAga2V5cy5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgIHZhciB2YWx1ZSA9IG9iamVjdFtrZXldXG4gICAgICBpZiAoZHluYW1pYy5pc0R5bmFtaWModmFsdWUpKSB7XG4gICAgICAgIHZhciBkZXBzID0gY3JlYXRlRHluYW1pY0RlY2wodmFsdWUsIG51bGwpXG4gICAgICAgIHRoaXNEZXAgPSB0aGlzRGVwIHx8IGRlcHMudGhpc0RlcFxuICAgICAgICBwcm9wRGVwID0gcHJvcERlcCB8fCBkZXBzLnByb3BEZXBcbiAgICAgICAgY29udGV4dERlcCA9IGNvbnRleHREZXAgfHwgZGVwcy5jb250ZXh0RGVwXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBnbG9iYWxzKG9iamVjdFJlZiwgJy4nLCBrZXksICc9JylcbiAgICAgICAgc3dpdGNoICh0eXBlb2YgdmFsdWUpIHtcbiAgICAgICAgICBjYXNlICdudW1iZXInOlxuICAgICAgICAgICAgZ2xvYmFscyh2YWx1ZSlcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgICAgICAgIGdsb2JhbHMoJ1wiJywgdmFsdWUsICdcIicpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcbiAgICAgICAgICAgICAgZ2xvYmFscygnWycsIHZhbHVlLmpvaW4oKSwgJ10nKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgZ2xvYmFscyhlbnYubGluayh2YWx1ZSkpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICB9XG4gICAgICAgIGdsb2JhbHMoJzsnKVxuICAgICAgfVxuICAgIH0pXG5cbiAgICBmdW5jdGlvbiBhcHBlbmRCbG9jayAoZW52LCBibG9jaykge1xuICAgICAga2V5cy5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgdmFyIHZhbHVlID0gb2JqZWN0W2tleV1cbiAgICAgICAgaWYgKCFkeW5hbWljLmlzRHluYW1pYyh2YWx1ZSkpIHtcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuICAgICAgICB2YXIgcmVmID0gZW52Lmludm9rZShibG9jaywgdmFsdWUpXG4gICAgICAgIGJsb2NrKG9iamVjdFJlZiwgJy4nLCBrZXksICc9JywgcmVmLCAnOycpXG4gICAgICB9KVxuICAgIH1cblxuICAgIG9wdGlvbnMuZHluYW1pY1tuYW1lXSA9IG5ldyBkeW5hbWljLkR5bmFtaWNWYXJpYWJsZShEWU5fVEhVTkssIHtcbiAgICAgIHRoaXNEZXA6IHRoaXNEZXAsXG4gICAgICBjb250ZXh0RGVwOiBjb250ZXh0RGVwLFxuICAgICAgcHJvcERlcDogcHJvcERlcCxcbiAgICAgIHJlZjogb2JqZWN0UmVmLFxuICAgICAgYXBwZW5kOiBhcHBlbmRCbG9ja1xuICAgIH0pXG4gICAgZGVsZXRlIG9wdGlvbnMuc3RhdGljW25hbWVdXG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIE1BSU4gRFJBVyBDT01NQU5EXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgZnVuY3Rpb24gY29tcGlsZUNvbW1hbmQgKG9wdGlvbnMsIGF0dHJpYnV0ZXMsIHVuaWZvcm1zLCBjb250ZXh0LCBzdGF0cykge1xuICAgIHZhciBlbnYgPSBjcmVhdGVSRUdMRW52aXJvbm1lbnQoKVxuXG4gICAgLy8gbGluayBzdGF0cywgc28gdGhhdCB3ZSBjYW4gZWFzaWx5IGFjY2VzcyBpdCBpbiB0aGUgcHJvZ3JhbS5cbiAgICBlbnYuc3RhdHMgPSBlbnYubGluayhzdGF0cylcblxuICAgIC8vIHNwbGF0IG9wdGlvbnMgYW5kIGF0dHJpYnV0ZXMgdG8gYWxsb3cgZm9yIGR5bmFtaWMgbmVzdGVkIHByb3BlcnRpZXNcbiAgICBPYmplY3Qua2V5cyhhdHRyaWJ1dGVzLnN0YXRpYykuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICBzcGxhdE9iamVjdChlbnYsIGF0dHJpYnV0ZXMsIGtleSlcbiAgICB9KVxuICAgIE5FU1RFRF9PUFRJT05TLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHNwbGF0T2JqZWN0KGVudiwgb3B0aW9ucywgbmFtZSlcbiAgICB9KVxuXG4gICAgdmFyIGFyZ3MgPSBwYXJzZUFyZ3VtZW50cyhvcHRpb25zLCBhdHRyaWJ1dGVzLCB1bmlmb3JtcywgY29udGV4dClcblxuICAgIGVtaXREcmF3UHJvYyhlbnYsIGFyZ3MpXG4gICAgZW1pdFNjb3BlUHJvYyhlbnYsIGFyZ3MpXG4gICAgZW1pdEJhdGNoUHJvYyhlbnYsIGFyZ3MpXG5cbiAgICByZXR1cm4gZW52LmNvbXBpbGUoKVxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBQT0xMIC8gUkVGUkVTSFxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIHJldHVybiB7XG4gICAgbmV4dDogbmV4dFN0YXRlLFxuICAgIGN1cnJlbnQ6IGN1cnJlbnRTdGF0ZSxcbiAgICBwcm9jczogKGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBlbnYgPSBjcmVhdGVSRUdMRW52aXJvbm1lbnQoKVxuICAgICAgdmFyIHBvbGwgPSBlbnYucHJvYygncG9sbCcpXG4gICAgICB2YXIgcmVmcmVzaCA9IGVudi5wcm9jKCdyZWZyZXNoJylcbiAgICAgIHZhciBjb21tb24gPSBlbnYuYmxvY2soKVxuICAgICAgcG9sbChjb21tb24pXG4gICAgICByZWZyZXNoKGNvbW1vbilcblxuICAgICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcbiAgICAgIHZhciBHTCA9IHNoYXJlZC5nbFxuICAgICAgdmFyIE5FWFRfU1RBVEUgPSBzaGFyZWQubmV4dFxuICAgICAgdmFyIENVUlJFTlRfU1RBVEUgPSBzaGFyZWQuY3VycmVudFxuXG4gICAgICBjb21tb24oQ1VSUkVOVF9TVEFURSwgJy5kaXJ0eT1mYWxzZTsnKVxuXG4gICAgICBlbWl0UG9sbEZyYW1lYnVmZmVyKGVudiwgcG9sbClcbiAgICAgIGVtaXRQb2xsRnJhbWVidWZmZXIoZW52LCByZWZyZXNoLCBudWxsLCB0cnVlKVxuXG4gICAgICAvLyBGSVhNRTogcmVmcmVzaCBzaG91bGQgdXBkYXRlIHZlcnRleCBhdHRyaWJ1dGUgcG9pbnRlcnNcblxuICAgICAgT2JqZWN0LmtleXMoR0xfRkxBR1MpLmZvckVhY2goZnVuY3Rpb24gKGZsYWcpIHtcbiAgICAgICAgdmFyIGNhcCA9IEdMX0ZMQUdTW2ZsYWddXG4gICAgICAgIHZhciBORVhUID0gY29tbW9uLmRlZihORVhUX1NUQVRFLCAnLicsIGZsYWcpXG4gICAgICAgIHZhciBibG9jayA9IGVudi5ibG9jaygpXG4gICAgICAgIGJsb2NrKCdpZignLCBORVhULCAnKXsnLFxuICAgICAgICAgIEdMLCAnLmVuYWJsZSgnLCBjYXAsICcpfWVsc2V7JyxcbiAgICAgICAgICBHTCwgJy5kaXNhYmxlKCcsIGNhcCwgJyl9JyxcbiAgICAgICAgICBDVVJSRU5UX1NUQVRFLCAnLicsIGZsYWcsICc9JywgTkVYVCwgJzsnKVxuICAgICAgICByZWZyZXNoKGJsb2NrKVxuICAgICAgICBwb2xsKFxuICAgICAgICAgICdpZignLCBORVhULCAnIT09JywgQ1VSUkVOVF9TVEFURSwgJy4nLCBmbGFnLCAnKXsnLFxuICAgICAgICAgIGJsb2NrLFxuICAgICAgICAgICd9JylcbiAgICAgIH0pXG5cbiAgICAgIE9iamVjdC5rZXlzKEdMX1ZBUklBQkxFUykuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgICB2YXIgZnVuYyA9IEdMX1ZBUklBQkxFU1tuYW1lXVxuICAgICAgICB2YXIgaW5pdCA9IGN1cnJlbnRTdGF0ZVtuYW1lXVxuICAgICAgICB2YXIgTkVYVCwgQ1VSUkVOVFxuICAgICAgICB2YXIgYmxvY2sgPSBlbnYuYmxvY2soKVxuICAgICAgICBibG9jayhHTCwgJy4nLCBmdW5jLCAnKCcpXG4gICAgICAgIGlmIChpc0FycmF5TGlrZShpbml0KSkge1xuICAgICAgICAgIHZhciBuID0gaW5pdC5sZW5ndGhcbiAgICAgICAgICBORVhUID0gZW52Lmdsb2JhbC5kZWYoTkVYVF9TVEFURSwgJy4nLCBuYW1lKVxuICAgICAgICAgIENVUlJFTlQgPSBlbnYuZ2xvYmFsLmRlZihDVVJSRU5UX1NUQVRFLCAnLicsIG5hbWUpXG4gICAgICAgICAgYmxvY2soXG4gICAgICAgICAgICBsb29wKG4sIGZ1bmN0aW9uIChpKSB7XG4gICAgICAgICAgICAgIHJldHVybiBORVhUICsgJ1snICsgaSArICddJ1xuICAgICAgICAgICAgfSksICcpOycsXG4gICAgICAgICAgICBsb29wKG4sIGZ1bmN0aW9uIChpKSB7XG4gICAgICAgICAgICAgIHJldHVybiBDVVJSRU5UICsgJ1snICsgaSArICddPScgKyBORVhUICsgJ1snICsgaSArICddOydcbiAgICAgICAgICAgIH0pLmpvaW4oJycpKVxuICAgICAgICAgIHBvbGwoXG4gICAgICAgICAgICAnaWYoJywgbG9vcChuLCBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgICAgICByZXR1cm4gTkVYVCArICdbJyArIGkgKyAnXSE9PScgKyBDVVJSRU5UICsgJ1snICsgaSArICddJ1xuICAgICAgICAgICAgfSkuam9pbignfHwnKSwgJyl7JyxcbiAgICAgICAgICAgIGJsb2NrLFxuICAgICAgICAgICAgJ30nKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIE5FWFQgPSBjb21tb24uZGVmKE5FWFRfU1RBVEUsICcuJywgbmFtZSlcbiAgICAgICAgICBDVVJSRU5UID0gY29tbW9uLmRlZihDVVJSRU5UX1NUQVRFLCAnLicsIG5hbWUpXG4gICAgICAgICAgYmxvY2soXG4gICAgICAgICAgICBORVhULCAnKTsnLFxuICAgICAgICAgICAgQ1VSUkVOVF9TVEFURSwgJy4nLCBuYW1lLCAnPScsIE5FWFQsICc7JylcbiAgICAgICAgICBwb2xsKFxuICAgICAgICAgICAgJ2lmKCcsIE5FWFQsICchPT0nLCBDVVJSRU5ULCAnKXsnLFxuICAgICAgICAgICAgYmxvY2ssXG4gICAgICAgICAgICAnfScpXG4gICAgICAgIH1cbiAgICAgICAgcmVmcmVzaChibG9jaylcbiAgICAgIH0pXG5cbiAgICAgIHJldHVybiBlbnYuY29tcGlsZSgpXG4gICAgfSkoKSxcbiAgICBjb21waWxlOiBjb21waWxlQ29tbWFuZFxuICB9XG59XG4iLCJ2YXIgVkFSSUFCTEVfQ09VTlRFUiA9IDBcblxudmFyIERZTl9GVU5DID0gMFxuXG5mdW5jdGlvbiBEeW5hbWljVmFyaWFibGUgKHR5cGUsIGRhdGEpIHtcbiAgdGhpcy5pZCA9IChWQVJJQUJMRV9DT1VOVEVSKyspXG4gIHRoaXMudHlwZSA9IHR5cGVcbiAgdGhpcy5kYXRhID0gZGF0YVxufVxuXG5mdW5jdGlvbiBlc2NhcGVTdHIgKHN0cikge1xuICByZXR1cm4gc3RyLnJlcGxhY2UoL1xcXFwvZywgJ1xcXFxcXFxcJykucmVwbGFjZSgvXCIvZywgJ1xcXFxcIicpXG59XG5cbmZ1bmN0aW9uIHNwbGl0UGFydHMgKHN0cikge1xuICBpZiAoc3RyLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiBbXVxuICB9XG5cbiAgdmFyIGZpcnN0Q2hhciA9IHN0ci5jaGFyQXQoMClcbiAgdmFyIGxhc3RDaGFyID0gc3RyLmNoYXJBdChzdHIubGVuZ3RoIC0gMSlcblxuICBpZiAoc3RyLmxlbmd0aCA+IDEgJiZcbiAgICAgIGZpcnN0Q2hhciA9PT0gbGFzdENoYXIgJiZcbiAgICAgIChmaXJzdENoYXIgPT09ICdcIicgfHwgZmlyc3RDaGFyID09PSBcIidcIikpIHtcbiAgICByZXR1cm4gWydcIicgKyBlc2NhcGVTdHIoc3RyLnN1YnN0cigxLCBzdHIubGVuZ3RoIC0gMikpICsgJ1wiJ11cbiAgfVxuXG4gIHZhciBwYXJ0cyA9IC9cXFsoZmFsc2V8dHJ1ZXxudWxsfFxcZCt8J1teJ10qJ3xcIlteXCJdKlwiKVxcXS8uZXhlYyhzdHIpXG4gIGlmIChwYXJ0cykge1xuICAgIHJldHVybiAoXG4gICAgICBzcGxpdFBhcnRzKHN0ci5zdWJzdHIoMCwgcGFydHMuaW5kZXgpKVxuICAgICAgLmNvbmNhdChzcGxpdFBhcnRzKHBhcnRzWzFdKSlcbiAgICAgIC5jb25jYXQoc3BsaXRQYXJ0cyhzdHIuc3Vic3RyKHBhcnRzLmluZGV4ICsgcGFydHNbMF0ubGVuZ3RoKSkpXG4gICAgKVxuICB9XG5cbiAgdmFyIHN1YnBhcnRzID0gc3RyLnNwbGl0KCcuJylcbiAgaWYgKHN1YnBhcnRzLmxlbmd0aCA9PT0gMSkge1xuICAgIHJldHVybiBbJ1wiJyArIGVzY2FwZVN0cihzdHIpICsgJ1wiJ11cbiAgfVxuXG4gIHZhciByZXN1bHQgPSBbXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHN1YnBhcnRzLmxlbmd0aDsgKytpKSB7XG4gICAgcmVzdWx0ID0gcmVzdWx0LmNvbmNhdChzcGxpdFBhcnRzKHN1YnBhcnRzW2ldKSlcbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG5cbmZ1bmN0aW9uIHRvQWNjZXNzb3JTdHJpbmcgKHN0cikge1xuICByZXR1cm4gJ1snICsgc3BsaXRQYXJ0cyhzdHIpLmpvaW4oJ11bJykgKyAnXSdcbn1cblxuZnVuY3Rpb24gZGVmaW5lRHluYW1pYyAodHlwZSwgZGF0YSkge1xuICByZXR1cm4gbmV3IER5bmFtaWNWYXJpYWJsZSh0eXBlLCB0b0FjY2Vzc29yU3RyaW5nKGRhdGEgKyAnJykpXG59XG5cbmZ1bmN0aW9uIGlzRHluYW1pYyAoeCkge1xuICByZXR1cm4gKHR5cGVvZiB4ID09PSAnZnVuY3Rpb24nICYmICF4Ll9yZWdsVHlwZSkgfHxcbiAgICAgICAgIHggaW5zdGFuY2VvZiBEeW5hbWljVmFyaWFibGVcbn1cblxuZnVuY3Rpb24gdW5ib3ggKHgsIHBhdGgpIHtcbiAgaWYgKHR5cGVvZiB4ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgcmV0dXJuIG5ldyBEeW5hbWljVmFyaWFibGUoRFlOX0ZVTkMsIHgpXG4gIH1cbiAgcmV0dXJuIHhcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIER5bmFtaWNWYXJpYWJsZTogRHluYW1pY1ZhcmlhYmxlLFxuICBkZWZpbmU6IGRlZmluZUR5bmFtaWMsXG4gIGlzRHluYW1pYzogaXNEeW5hbWljLFxuICB1bmJveDogdW5ib3gsXG4gIGFjY2Vzc29yOiB0b0FjY2Vzc29yU3RyaW5nXG59XG4iLCJcbnZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL3V0aWwvaXMtdHlwZWQtYXJyYXknKVxudmFyIGlzTkRBcnJheUxpa2UgPSByZXF1aXJlKCcuL3V0aWwvaXMtbmRhcnJheScpXG52YXIgdmFsdWVzID0gcmVxdWlyZSgnLi91dGlsL3ZhbHVlcycpXG5cbnZhciBwcmltVHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9wcmltaXRpdmVzLmpzb24nKVxudmFyIHVzYWdlVHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy91c2FnZS5qc29uJylcblxudmFyIEdMX1BPSU5UUyA9IDBcbnZhciBHTF9MSU5FUyA9IDFcbnZhciBHTF9UUklBTkdMRVMgPSA0XG5cbnZhciBHTF9CWVRFID0gNTEyMFxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSA1MTIxXG52YXIgR0xfU0hPUlQgPSA1MTIyXG52YXIgR0xfVU5TSUdORURfU0hPUlQgPSA1MTIzXG52YXIgR0xfSU5UID0gNTEyNFxudmFyIEdMX1VOU0lHTkVEX0lOVCA9IDUxMjVcblxudmFyIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSID0gMzQ5NjNcblxudmFyIEdMX1NUUkVBTV9EUkFXID0gMHg4OEUwXG52YXIgR0xfU1RBVElDX0RSQVcgPSAweDg4RTRcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwRWxlbWVudHNTdGF0ZSAoZ2wsIGV4dGVuc2lvbnMsIGJ1ZmZlclN0YXRlLCBzdGF0cykge1xuICB2YXIgZWxlbWVudFNldCA9IHt9XG4gIHZhciBlbGVtZW50Q291bnQgPSAwXG5cbiAgdmFyIGVsZW1lbnRUeXBlcyA9IHtcbiAgICAndWludDgnOiBHTF9VTlNJR05FRF9CWVRFLFxuICAgICd1aW50MTYnOiBHTF9VTlNJR05FRF9TSE9SVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMub2VzX2VsZW1lbnRfaW5kZXhfdWludCkge1xuICAgIGVsZW1lbnRUeXBlcy51aW50MzIgPSBHTF9VTlNJR05FRF9JTlRcbiAgfVxuXG4gIGZ1bmN0aW9uIFJFR0xFbGVtZW50QnVmZmVyIChidWZmZXIpIHtcbiAgICB0aGlzLmlkID0gZWxlbWVudENvdW50KytcbiAgICBlbGVtZW50U2V0W3RoaXMuaWRdID0gdGhpc1xuICAgIHRoaXMuYnVmZmVyID0gYnVmZmVyXG4gICAgdGhpcy5wcmltVHlwZSA9IEdMX1RSSUFOR0xFU1xuICAgIHRoaXMudmVydENvdW50ID0gMFxuICAgIHRoaXMudHlwZSA9IDBcbiAgfVxuXG4gIFJFR0xFbGVtZW50QnVmZmVyLnByb3RvdHlwZS5iaW5kID0gZnVuY3Rpb24gKCkge1xuICAgIHRoaXMuYnVmZmVyLmJpbmQoKVxuICB9XG5cbiAgdmFyIGJ1ZmZlclBvb2wgPSBbXVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZUVsZW1lbnRTdHJlYW0gKGRhdGEpIHtcbiAgICB2YXIgcmVzdWx0ID0gYnVmZmVyUG9vbC5wb3AoKVxuICAgIGlmICghcmVzdWx0KSB7XG4gICAgICByZXN1bHQgPSBuZXcgUkVHTEVsZW1lbnRCdWZmZXIoYnVmZmVyU3RhdGUuY3JlYXRlKFxuICAgICAgICBudWxsLFxuICAgICAgICBHTF9FTEVNRU5UX0FSUkFZX0JVRkZFUixcbiAgICAgICAgdHJ1ZSkuX2J1ZmZlcilcbiAgICB9XG4gICAgaW5pdEVsZW1lbnRzKHJlc3VsdCwgZGF0YSwgR0xfU1RSRUFNX0RSQVcsIC0xLCAtMSwgMCwgMClcbiAgICByZXR1cm4gcmVzdWx0XG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95RWxlbWVudFN0cmVhbSAoZWxlbWVudHMpIHtcbiAgICBidWZmZXJQb29sLnB1c2goZWxlbWVudHMpXG4gIH1cblxuICBmdW5jdGlvbiBpbml0RWxlbWVudHMgKFxuICAgIGVsZW1lbnRzLFxuICAgIGRhdGEsXG4gICAgdXNhZ2UsXG4gICAgcHJpbSxcbiAgICBjb3VudCxcbiAgICBieXRlTGVuZ3RoLFxuICAgIHR5cGUpIHtcbiAgICB2YXIgcHJlZGljdGVkVHlwZSA9IHR5cGVcbiAgICBpZiAoIXR5cGUgJiYgKFxuICAgICAgICAhaXNUeXBlZEFycmF5KGRhdGEpIHx8XG4gICAgICAgKGlzTkRBcnJheUxpa2UoZGF0YSkgJiYgIWlzVHlwZWRBcnJheShkYXRhLmRhdGEpKSkpIHtcbiAgICAgIHByZWRpY3RlZFR5cGUgPSBleHRlbnNpb25zLm9lc19lbGVtZW50X2luZGV4X3VpbnRcbiAgICAgICAgPyBHTF9VTlNJR05FRF9JTlRcbiAgICAgICAgOiBHTF9VTlNJR05FRF9TSE9SVFxuICAgIH1cbiAgICBlbGVtZW50cy5idWZmZXIuYmluZCgpXG4gICAgYnVmZmVyU3RhdGUuX2luaXRCdWZmZXIoXG4gICAgICBlbGVtZW50cy5idWZmZXIsXG4gICAgICBkYXRhLFxuICAgICAgdXNhZ2UsXG4gICAgICBwcmVkaWN0ZWRUeXBlLFxuICAgICAgMylcblxuICAgIHZhciBkdHlwZSA9IHR5cGVcbiAgICBpZiAoIXR5cGUpIHtcbiAgICAgIHN3aXRjaCAoZWxlbWVudHMuYnVmZmVyLmR0eXBlKSB7XG4gICAgICAgIGNhc2UgR0xfVU5TSUdORURfQllURTpcbiAgICAgICAgY2FzZSBHTF9CWVRFOlxuICAgICAgICAgIGR0eXBlID0gR0xfVU5TSUdORURfQllURVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9TSE9SVDpcbiAgICAgICAgY2FzZSBHTF9TSE9SVDpcbiAgICAgICAgICBkdHlwZSA9IEdMX1VOU0lHTkVEX1NIT1JUXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX0lOVDpcbiAgICAgICAgY2FzZSBHTF9JTlQ6XG4gICAgICAgICAgZHR5cGUgPSBHTF9VTlNJR05FRF9JTlRcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgXG4gICAgICB9XG4gICAgICBlbGVtZW50cy5idWZmZXIuZHR5cGUgPSBkdHlwZVxuICAgIH1cbiAgICBlbGVtZW50cy50eXBlID0gZHR5cGVcblxuICAgIC8vIENoZWNrIG9lc19lbGVtZW50X2luZGV4X3VpbnQgZXh0ZW5zaW9uXG4gICAgXG5cbiAgICAvLyB0cnkgdG8gZ3Vlc3MgZGVmYXVsdCBwcmltaXRpdmUgdHlwZSBhbmQgYXJndW1lbnRzXG4gICAgdmFyIHZlcnRDb3VudCA9IGNvdW50XG4gICAgaWYgKHZlcnRDb3VudCA8IDApIHtcbiAgICAgIHZlcnRDb3VudCA9IGVsZW1lbnRzLmJ1ZmZlci5ieXRlTGVuZ3RoXG4gICAgICBpZiAoZHR5cGUgPT09IEdMX1VOU0lHTkVEX1NIT1JUKSB7XG4gICAgICAgIHZlcnRDb3VudCA+Pj0gMVxuICAgICAgfSBlbHNlIGlmIChkdHlwZSA9PT0gR0xfVU5TSUdORURfSU5UKSB7XG4gICAgICAgIHZlcnRDb3VudCA+Pj0gMlxuICAgICAgfVxuICAgIH1cbiAgICBlbGVtZW50cy52ZXJ0Q291bnQgPSB2ZXJ0Q291bnRcblxuICAgIC8vIHRyeSB0byBndWVzcyBwcmltaXRpdmUgdHlwZSBmcm9tIGNlbGwgZGltZW5zaW9uXG4gICAgdmFyIHByaW1UeXBlID0gcHJpbVxuICAgIGlmIChwcmltIDwgMCkge1xuICAgICAgcHJpbVR5cGUgPSBHTF9UUklBTkdMRVNcbiAgICAgIHZhciBkaW1lbnNpb24gPSBlbGVtZW50cy5idWZmZXIuZGltZW5zaW9uXG4gICAgICBpZiAoZGltZW5zaW9uID09PSAxKSBwcmltVHlwZSA9IEdMX1BPSU5UU1xuICAgICAgaWYgKGRpbWVuc2lvbiA9PT0gMikgcHJpbVR5cGUgPSBHTF9MSU5FU1xuICAgICAgaWYgKGRpbWVuc2lvbiA9PT0gMykgcHJpbVR5cGUgPSBHTF9UUklBTkdMRVNcbiAgICB9XG4gICAgZWxlbWVudHMucHJpbVR5cGUgPSBwcmltVHlwZVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveUVsZW1lbnRzIChlbGVtZW50cykge1xuICAgIHN0YXRzLmVsZW1lbnRzQ291bnQtLVxuXG4gICAgXG4gICAgZGVsZXRlIGVsZW1lbnRTZXRbZWxlbWVudHMuaWRdXG4gICAgZWxlbWVudHMuYnVmZmVyLmRlc3Ryb3koKVxuICAgIGVsZW1lbnRzLmJ1ZmZlciA9IG51bGxcbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZUVsZW1lbnRzIChvcHRpb25zKSB7XG4gICAgdmFyIGJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmNyZWF0ZShudWxsLCBHTF9FTEVNRU5UX0FSUkFZX0JVRkZFUiwgdHJ1ZSlcbiAgICB2YXIgZWxlbWVudHMgPSBuZXcgUkVHTEVsZW1lbnRCdWZmZXIoYnVmZmVyLl9idWZmZXIpXG4gICAgc3RhdHMuZWxlbWVudHNDb3VudCsrXG5cbiAgICBmdW5jdGlvbiByZWdsRWxlbWVudHMgKG9wdGlvbnMpIHtcbiAgICAgIGlmICghb3B0aW9ucykge1xuICAgICAgICBidWZmZXIoKVxuICAgICAgICBlbGVtZW50cy5wcmltVHlwZSA9IEdMX1RSSUFOR0xFU1xuICAgICAgICBlbGVtZW50cy52ZXJ0Q291bnQgPSAwXG4gICAgICAgIGVsZW1lbnRzLnR5cGUgPSBHTF9VTlNJR05FRF9CWVRFXG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBvcHRpb25zID09PSAnbnVtYmVyJykge1xuICAgICAgICBidWZmZXIob3B0aW9ucylcbiAgICAgICAgZWxlbWVudHMucHJpbVR5cGUgPSBHTF9UUklBTkdMRVNcbiAgICAgICAgZWxlbWVudHMudmVydENvdW50ID0gb3B0aW9ucyB8IDBcbiAgICAgICAgZWxlbWVudHMudHlwZSA9IEdMX1VOU0lHTkVEX0JZVEVcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBkYXRhID0gbnVsbFxuICAgICAgICB2YXIgdXNhZ2UgPSBHTF9TVEFUSUNfRFJBV1xuICAgICAgICB2YXIgcHJpbVR5cGUgPSAtMVxuICAgICAgICB2YXIgdmVydENvdW50ID0gLTFcbiAgICAgICAgdmFyIGJ5dGVMZW5ndGggPSAwXG4gICAgICAgIHZhciBkdHlwZSA9IDBcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkob3B0aW9ucykgfHxcbiAgICAgICAgICAgIGlzVHlwZWRBcnJheShvcHRpb25zKSB8fFxuICAgICAgICAgICAgaXNOREFycmF5TGlrZShvcHRpb25zKSkge1xuICAgICAgICAgIGRhdGEgPSBvcHRpb25zXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKCdkYXRhJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBkYXRhID0gb3B0aW9ucy5kYXRhXG4gICAgICAgICAgICBcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCd1c2FnZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgXG4gICAgICAgICAgICB1c2FnZSA9IHVzYWdlVHlwZXNbb3B0aW9ucy51c2FnZV1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCdwcmltaXRpdmUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgcHJpbVR5cGUgPSBwcmltVHlwZXNbb3B0aW9ucy5wcmltaXRpdmVdXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgnY291bnQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdmVydENvdW50ID0gb3B0aW9ucy5jb3VudCB8IDBcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCdsZW5ndGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGJ5dGVMZW5ndGggPSBvcHRpb25zLmxlbmd0aCB8IDBcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCd0eXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGR0eXBlID0gZWxlbWVudFR5cGVzW29wdGlvbnMudHlwZV1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGRhdGEpIHtcbiAgICAgICAgICBpbml0RWxlbWVudHMoXG4gICAgICAgICAgICBlbGVtZW50cyxcbiAgICAgICAgICAgIGRhdGEsXG4gICAgICAgICAgICB1c2FnZSxcbiAgICAgICAgICAgIHByaW1UeXBlLFxuICAgICAgICAgICAgdmVydENvdW50LFxuICAgICAgICAgICAgYnl0ZUxlbmd0aCxcbiAgICAgICAgICAgIGR0eXBlKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHZhciBfYnVmZmVyID0gZWxlbWVudHMuYnVmZmVyXG4gICAgICAgICAgX2J1ZmZlci5iaW5kKClcbiAgICAgICAgICBnbC5idWZmZXJEYXRhKEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSLCBieXRlTGVuZ3RoLCB1c2FnZSlcbiAgICAgICAgICBfYnVmZmVyLmR0eXBlID0gZHR5cGUgfHwgR0xfVU5TSUdORURfQllURVxuICAgICAgICAgIF9idWZmZXIudXNhZ2UgPSB1c2FnZVxuICAgICAgICAgIF9idWZmZXIuZGltZW5zaW9uID0gM1xuICAgICAgICAgIF9idWZmZXIuYnl0ZUxlbmd0aCA9IGJ5dGVMZW5ndGhcbiAgICAgICAgICBlbGVtZW50cy5wcmltVHlwZSA9IHByaW1UeXBlIDwgMCA/IEdMX1RSSUFOR0xFUyA6IHByaW1UeXBlXG4gICAgICAgICAgZWxlbWVudHMudmVydENvdW50ID0gdmVydENvdW50IDwgMCA/IDAgOiB2ZXJ0Q291bnRcbiAgICAgICAgICBlbGVtZW50cy50eXBlID0gX2J1ZmZlci5kdHlwZVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZWdsRWxlbWVudHNcbiAgICB9XG5cbiAgICByZWdsRWxlbWVudHMob3B0aW9ucylcblxuICAgIHJlZ2xFbGVtZW50cy5fcmVnbFR5cGUgPSAnZWxlbWVudHMnXG4gICAgcmVnbEVsZW1lbnRzLl9lbGVtZW50cyA9IGVsZW1lbnRzXG4gICAgcmVnbEVsZW1lbnRzLnN1YmRhdGEgPSBmdW5jdGlvbiAoZGF0YSwgb2Zmc2V0KSB7XG4gICAgICBidWZmZXIuc3ViZGF0YShkYXRhLCBvZmZzZXQpXG4gICAgICByZXR1cm4gcmVnbEVsZW1lbnRzXG4gICAgfVxuICAgIHJlZ2xFbGVtZW50cy5kZXN0cm95ID0gZnVuY3Rpb24gKCkge1xuICAgICAgZGVzdHJveUVsZW1lbnRzKGVsZW1lbnRzKVxuICAgIH1cblxuICAgIHJldHVybiByZWdsRWxlbWVudHNcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY3JlYXRlOiBjcmVhdGVFbGVtZW50cyxcbiAgICBjcmVhdGVTdHJlYW06IGNyZWF0ZUVsZW1lbnRTdHJlYW0sXG4gICAgZGVzdHJveVN0cmVhbTogZGVzdHJveUVsZW1lbnRTdHJlYW0sXG4gICAgZ2V0RWxlbWVudHM6IGZ1bmN0aW9uIChlbGVtZW50cykge1xuICAgICAgaWYgKHR5cGVvZiBlbGVtZW50cyA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgICAgIGVsZW1lbnRzLl9lbGVtZW50cyBpbnN0YW5jZW9mIFJFR0xFbGVtZW50QnVmZmVyKSB7XG4gICAgICAgIHJldHVybiBlbGVtZW50cy5fZWxlbWVudHNcbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsXG4gICAgfSxcbiAgICBjbGVhcjogZnVuY3Rpb24gKCkge1xuICAgICAgdmFsdWVzKGVsZW1lbnRTZXQpLmZvckVhY2goZGVzdHJveUVsZW1lbnRzKVxuICAgIH1cbiAgfVxufVxuIiwiXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY3JlYXRlRXh0ZW5zaW9uQ2FjaGUgKGdsLCBjb25maWcpIHtcbiAgdmFyIGV4dGVuc2lvbnMgPSB7fVxuXG4gIGZ1bmN0aW9uIHRyeUxvYWRFeHRlbnNpb24gKG5hbWVfKSB7XG4gICAgXG4gICAgdmFyIG5hbWUgPSBuYW1lXy50b0xvd2VyQ2FzZSgpXG4gICAgdmFyIGV4dFxuICAgIHRyeSB7XG4gICAgICBleHQgPSBleHRlbnNpb25zW25hbWVdID0gZ2wuZ2V0RXh0ZW5zaW9uKG5hbWUpXG4gICAgfSBjYXRjaCAoZSkge31cbiAgICByZXR1cm4gISFleHRcbiAgfVxuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgY29uZmlnLmV4dGVuc2lvbnMubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgbmFtZSA9IGNvbmZpZy5leHRlbnNpb25zW2ldXG4gICAgaWYgKCF0cnlMb2FkRXh0ZW5zaW9uKG5hbWUpKSB7XG4gICAgICBjb25maWcub25EZXN0cm95KClcbiAgICAgIGNvbmZpZy5vbkRvbmUoJ1wiJyArIG5hbWUgKyAnXCIgZXh0ZW5zaW9uIGlzIG5vdCBzdXBwb3J0ZWQgYnkgdGhlIGN1cnJlbnQgV2ViR0wgY29udGV4dCwgdHJ5IHVwZ3JhZGluZyB5b3VyIHN5c3RlbSBvciBhIGRpZmZlcmVudCBicm93c2VyJylcbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuICB9XG5cbiAgY29uZmlnLm9wdGlvbmFsRXh0ZW5zaW9ucy5mb3JFYWNoKHRyeUxvYWRFeHRlbnNpb24pXG5cbiAgcmV0dXJuIHtcbiAgICBleHRlbnNpb25zOiBleHRlbnNpb25zXG4gIH1cbn1cbiIsIlxudmFyIHZhbHVlcyA9IHJlcXVpcmUoJy4vdXRpbC92YWx1ZXMnKVxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vdXRpbC9leHRlbmQnKVxuXG4vLyBXZSBzdG9yZSB0aGVzZSBjb25zdGFudHMgc28gdGhhdCB0aGUgbWluaWZpZXIgY2FuIGlubGluZSB0aGVtXG52YXIgR0xfRlJBTUVCVUZGRVIgPSAweDhENDBcbnZhciBHTF9SRU5ERVJCVUZGRVIgPSAweDhENDFcblxudmFyIEdMX1RFWFRVUkVfMkQgPSAweDBERTFcbnZhciBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1ggPSAweDg1MTVcblxudmFyIEdMX0NPTE9SX0FUVEFDSE1FTlQwID0gMHg4Q0UwXG52YXIgR0xfREVQVEhfQVRUQUNITUVOVCA9IDB4OEQwMFxudmFyIEdMX1NURU5DSUxfQVRUQUNITUVOVCA9IDB4OEQyMFxudmFyIEdMX0RFUFRIX1NURU5DSUxfQVRUQUNITUVOVCA9IDB4ODIxQVxuXG52YXIgR0xfRlJBTUVCVUZGRVJfQ09NUExFVEUgPSAweDhDRDVcbnZhciBHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX0FUVEFDSE1FTlQgPSAweDhDRDZcbnZhciBHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX01JU1NJTkdfQVRUQUNITUVOVCA9IDB4OENEN1xudmFyIEdMX0ZSQU1FQlVGRkVSX0lOQ09NUExFVEVfRElNRU5TSU9OUyA9IDB4OENEOVxudmFyIEdMX0ZSQU1FQlVGRkVSX1VOU1VQUE9SVEVEID0gMHg4Q0REXG5cbnZhciBHTF9IQUxGX0ZMT0FUX09FUyA9IDB4OEQ2MVxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSAweDE0MDFcbnZhciBHTF9GTE9BVCA9IDB4MTQwNlxuXG52YXIgR0xfUkdCQSA9IDB4MTkwOFxuXG52YXIgR0xfREVQVEhfQ09NUE9ORU5UID0gMHgxOTAyXG5cbnZhciBjb2xvclRleHR1cmVGb3JtYXRFbnVtcyA9IFtcbiAgR0xfUkdCQVxuXVxuXG4vLyBmb3IgZXZlcnkgdGV4dHVyZSBmb3JtYXQsIHN0b3JlXG4vLyB0aGUgbnVtYmVyIG9mIGNoYW5uZWxzXG52YXIgdGV4dHVyZUZvcm1hdENoYW5uZWxzID0gW11cbnRleHR1cmVGb3JtYXRDaGFubmVsc1tHTF9SR0JBXSA9IDRcblxuLy8gZm9yIGV2ZXJ5IHRleHR1cmUgdHlwZSwgc3RvcmVcbi8vIHRoZSBzaXplIGluIGJ5dGVzLlxudmFyIHRleHR1cmVUeXBlU2l6ZXMgPSBbXVxudGV4dHVyZVR5cGVTaXplc1tHTF9VTlNJR05FRF9CWVRFXSA9IDFcbnRleHR1cmVUeXBlU2l6ZXNbR0xfRkxPQVRdID0gNFxudGV4dHVyZVR5cGVTaXplc1tHTF9IQUxGX0ZMT0FUX09FU10gPSAyXG5cbnZhciBHTF9SR0JBNCA9IDB4ODA1NlxudmFyIEdMX1JHQjVfQTEgPSAweDgwNTdcbnZhciBHTF9SR0I1NjUgPSAweDhENjJcbnZhciBHTF9ERVBUSF9DT01QT05FTlQxNiA9IDB4ODFBNVxudmFyIEdMX1NURU5DSUxfSU5ERVg4ID0gMHg4RDQ4XG52YXIgR0xfREVQVEhfU1RFTkNJTCA9IDB4ODRGOVxuXG52YXIgR0xfU1JHQjhfQUxQSEE4X0VYVCA9IDB4OEM0M1xuXG52YXIgR0xfUkdCQTMyRl9FWFQgPSAweDg4MTRcblxudmFyIEdMX1JHQkExNkZfRVhUID0gMHg4ODFBXG52YXIgR0xfUkdCMTZGX0VYVCA9IDB4ODgxQlxuXG52YXIgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRFbnVtcyA9IFtcbiAgR0xfUkdCQTQsXG4gIEdMX1JHQjVfQTEsXG4gIEdMX1JHQjU2NSxcbiAgR0xfU1JHQjhfQUxQSEE4X0VYVCxcbiAgR0xfUkdCQTE2Rl9FWFQsXG4gIEdMX1JHQjE2Rl9FWFQsXG4gIEdMX1JHQkEzMkZfRVhUXG5dXG5cbnZhciBzdGF0dXNDb2RlID0ge31cbnN0YXR1c0NvZGVbR0xfRlJBTUVCVUZGRVJfQ09NUExFVEVdID0gJ2NvbXBsZXRlJ1xuc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX0FUVEFDSE1FTlRdID0gJ2luY29tcGxldGUgYXR0YWNobWVudCdcbnN0YXR1c0NvZGVbR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9ESU1FTlNJT05TXSA9ICdpbmNvbXBsZXRlIGRpbWVuc2lvbnMnXG5zdGF0dXNDb2RlW0dMX0ZSQU1FQlVGRkVSX0lOQ09NUExFVEVfTUlTU0lOR19BVFRBQ0hNRU5UXSA9ICdpbmNvbXBsZXRlLCBtaXNzaW5nIGF0dGFjaG1lbnQnXG5zdGF0dXNDb2RlW0dMX0ZSQU1FQlVGRkVSX1VOU1VQUE9SVEVEXSA9ICd1bnN1cHBvcnRlZCdcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwRkJPU3RhdGUgKFxuICBnbCxcbiAgZXh0ZW5zaW9ucyxcbiAgbGltaXRzLFxuICB0ZXh0dXJlU3RhdGUsXG4gIHJlbmRlcmJ1ZmZlclN0YXRlLFxuICBzdGF0cykge1xuICB2YXIgZnJhbWVidWZmZXJTdGF0ZSA9IHtcbiAgICBjdXI6IG51bGwsXG4gICAgbmV4dDogbnVsbCxcbiAgICBkaXJ0eTogZmFsc2VcbiAgfVxuXG4gIHZhciBjb2xvclRleHR1cmVGb3JtYXRzID0gWydyZ2JhJ11cbiAgdmFyIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0cyA9IFsncmdiYTQnLCAncmdiNTY1JywgJ3JnYjUgYTEnXVxuXG4gIGlmIChleHRlbnNpb25zLmV4dF9zcmdiKSB7XG4gICAgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzLnB1c2goJ3NyZ2JhJylcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLmV4dF9jb2xvcl9idWZmZXJfaGFsZl9mbG9hdCkge1xuICAgIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0cy5wdXNoKCdyZ2JhMTZmJywgJ3JnYjE2ZicpXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb2xvcl9idWZmZXJfZmxvYXQpIHtcbiAgICBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHMucHVzaCgncmdiYTMyZicpXG4gIH1cblxuICB2YXIgY29sb3JUeXBlcyA9IFsndWludDgnXVxuICBpZiAoZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9oYWxmX2Zsb2F0KSB7XG4gICAgY29sb3JUeXBlcy5wdXNoKCdoYWxmIGZsb2F0JywgJ2Zsb2F0MTYnKVxuICB9XG4gIGlmIChleHRlbnNpb25zLm9lc190ZXh0dXJlX2Zsb2F0KSB7XG4gICAgY29sb3JUeXBlcy5wdXNoKCdmbG9hdCcsICdmbG9hdDMyJylcbiAgfVxuXG4gIGZ1bmN0aW9uIEZyYW1lYnVmZmVyQXR0YWNobWVudCAodGFyZ2V0LCB0ZXh0dXJlLCByZW5kZXJidWZmZXIpIHtcbiAgICB0aGlzLnRhcmdldCA9IHRhcmdldFxuICAgIHRoaXMudGV4dHVyZSA9IHRleHR1cmVcbiAgICB0aGlzLnJlbmRlcmJ1ZmZlciA9IHJlbmRlcmJ1ZmZlclxuXG4gICAgdmFyIHcgPSAwXG4gICAgdmFyIGggPSAwXG4gICAgaWYgKHRleHR1cmUpIHtcbiAgICAgIHcgPSB0ZXh0dXJlLndpZHRoXG4gICAgICBoID0gdGV4dHVyZS5oZWlnaHRcbiAgICB9IGVsc2UgaWYgKHJlbmRlcmJ1ZmZlcikge1xuICAgICAgdyA9IHJlbmRlcmJ1ZmZlci53aWR0aFxuICAgICAgaCA9IHJlbmRlcmJ1ZmZlci5oZWlnaHRcbiAgICB9XG4gICAgdGhpcy53aWR0aCA9IHdcbiAgICB0aGlzLmhlaWdodCA9IGhcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlY1JlZiAoYXR0YWNobWVudCkge1xuICAgIGlmIChhdHRhY2htZW50KSB7XG4gICAgICBpZiAoYXR0YWNobWVudC50ZXh0dXJlKSB7XG4gICAgICAgIGF0dGFjaG1lbnQudGV4dHVyZS5fdGV4dHVyZS5kZWNSZWYoKVxuICAgICAgfVxuICAgICAgaWYgKGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyKSB7XG4gICAgICAgIGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXIuZGVjUmVmKClcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBpbmNSZWZBbmRDaGVja1NoYXBlIChhdHRhY2htZW50LCB3aWR0aCwgaGVpZ2h0KSB7XG4gICAgaWYgKCFhdHRhY2htZW50KSB7XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgaWYgKGF0dGFjaG1lbnQudGV4dHVyZSkge1xuICAgICAgdmFyIHRleHR1cmUgPSBhdHRhY2htZW50LnRleHR1cmUuX3RleHR1cmVcbiAgICAgIHZhciB0dyA9IE1hdGgubWF4KDEsIHRleHR1cmUud2lkdGgpXG4gICAgICB2YXIgdGggPSBNYXRoLm1heCgxLCB0ZXh0dXJlLmhlaWdodClcbiAgICAgIFxuICAgICAgdGV4dHVyZS5yZWZDb3VudCArPSAxXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciByZW5kZXJidWZmZXIgPSBhdHRhY2htZW50LnJlbmRlcmJ1ZmZlci5fcmVuZGVyYnVmZmVyXG4gICAgICBcbiAgICAgIHJlbmRlcmJ1ZmZlci5yZWZDb3VudCArPSAxXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gYXR0YWNoIChsb2NhdGlvbiwgYXR0YWNobWVudCkge1xuICAgIGlmIChhdHRhY2htZW50KSB7XG4gICAgICBpZiAoYXR0YWNobWVudC50ZXh0dXJlKSB7XG4gICAgICAgIGdsLmZyYW1lYnVmZmVyVGV4dHVyZTJEKFxuICAgICAgICAgIEdMX0ZSQU1FQlVGRkVSLFxuICAgICAgICAgIGxvY2F0aW9uLFxuICAgICAgICAgIGF0dGFjaG1lbnQudGFyZ2V0LFxuICAgICAgICAgIGF0dGFjaG1lbnQudGV4dHVyZS5fdGV4dHVyZS50ZXh0dXJlLFxuICAgICAgICAgIDApXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBnbC5mcmFtZWJ1ZmZlclJlbmRlcmJ1ZmZlcihcbiAgICAgICAgICBHTF9GUkFNRUJVRkZFUixcbiAgICAgICAgICBsb2NhdGlvbixcbiAgICAgICAgICBHTF9SRU5ERVJCVUZGRVIsXG4gICAgICAgICAgYXR0YWNobWVudC5yZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlci5yZW5kZXJidWZmZXIpXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGdsLmZyYW1lYnVmZmVyVGV4dHVyZTJEKFxuICAgICAgICBHTF9GUkFNRUJVRkZFUixcbiAgICAgICAgbG9jYXRpb24sXG4gICAgICAgIEdMX1RFWFRVUkVfMkQsXG4gICAgICAgIG51bGwsXG4gICAgICAgIDApXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VBdHRhY2htZW50IChhdHRhY2htZW50KSB7XG4gICAgdmFyIHRhcmdldCA9IEdMX1RFWFRVUkVfMkRcbiAgICB2YXIgdGV4dHVyZSA9IG51bGxcbiAgICB2YXIgcmVuZGVyYnVmZmVyID0gbnVsbFxuXG4gICAgdmFyIGRhdGEgPSBhdHRhY2htZW50XG4gICAgaWYgKHR5cGVvZiBhdHRhY2htZW50ID09PSAnb2JqZWN0Jykge1xuICAgICAgZGF0YSA9IGF0dGFjaG1lbnQuZGF0YVxuICAgICAgaWYgKCd0YXJnZXQnIGluIGF0dGFjaG1lbnQpIHtcbiAgICAgICAgdGFyZ2V0ID0gYXR0YWNobWVudC50YXJnZXQgfCAwXG4gICAgICB9XG4gICAgfVxuXG4gICAgXG5cbiAgICB2YXIgdHlwZSA9IGRhdGEuX3JlZ2xUeXBlXG4gICAgaWYgKHR5cGUgPT09ICd0ZXh0dXJlMmQnKSB7XG4gICAgICB0ZXh0dXJlID0gZGF0YVxuICAgICAgXG4gICAgfSBlbHNlIGlmICh0eXBlID09PSAndGV4dHVyZUN1YmUnKSB7XG4gICAgICB0ZXh0dXJlID0gZGF0YVxuICAgICAgXG4gICAgfSBlbHNlIGlmICh0eXBlID09PSAncmVuZGVyYnVmZmVyJykge1xuICAgICAgcmVuZGVyYnVmZmVyID0gZGF0YVxuICAgICAgdGFyZ2V0ID0gR0xfUkVOREVSQlVGRkVSXG4gICAgfSBlbHNlIHtcbiAgICAgIFxuICAgIH1cblxuICAgIHJldHVybiBuZXcgRnJhbWVidWZmZXJBdHRhY2htZW50KHRhcmdldCwgdGV4dHVyZSwgcmVuZGVyYnVmZmVyKVxuICB9XG5cbiAgZnVuY3Rpb24gYWxsb2NBdHRhY2htZW50IChcbiAgICB3aWR0aCxcbiAgICBoZWlnaHQsXG4gICAgaXNUZXh0dXJlLFxuICAgIGZvcm1hdCxcbiAgICB0eXBlKSB7XG4gICAgaWYgKGlzVGV4dHVyZSkge1xuICAgICAgdmFyIHRleHR1cmUgPSB0ZXh0dXJlU3RhdGUuY3JlYXRlMkQoe1xuICAgICAgICB3aWR0aDogd2lkdGgsXG4gICAgICAgIGhlaWdodDogaGVpZ2h0LFxuICAgICAgICBmb3JtYXQ6IGZvcm1hdCxcbiAgICAgICAgdHlwZTogdHlwZVxuICAgICAgfSlcbiAgICAgIHRleHR1cmUuX3RleHR1cmUucmVmQ291bnQgPSAwXG4gICAgICByZXR1cm4gbmV3IEZyYW1lYnVmZmVyQXR0YWNobWVudChHTF9URVhUVVJFXzJELCB0ZXh0dXJlLCBudWxsKVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgcmIgPSByZW5kZXJidWZmZXJTdGF0ZS5jcmVhdGUoe1xuICAgICAgICB3aWR0aDogd2lkdGgsXG4gICAgICAgIGhlaWdodDogaGVpZ2h0LFxuICAgICAgICBmb3JtYXQ6IGZvcm1hdFxuICAgICAgfSlcbiAgICAgIHJiLl9yZW5kZXJidWZmZXIucmVmQ291bnQgPSAwXG4gICAgICByZXR1cm4gbmV3IEZyYW1lYnVmZmVyQXR0YWNobWVudChHTF9SRU5ERVJCVUZGRVIsIG51bGwsIHJiKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHVud3JhcEF0dGFjaG1lbnQgKGF0dGFjaG1lbnQpIHtcbiAgICByZXR1cm4gYXR0YWNobWVudCAmJiAoYXR0YWNobWVudC50ZXh0dXJlIHx8IGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyKVxuICB9XG5cbiAgZnVuY3Rpb24gcmVzaXplQXR0YWNobWVudCAoYXR0YWNobWVudCwgdywgaCkge1xuICAgIGlmIChhdHRhY2htZW50KSB7XG4gICAgICBpZiAoYXR0YWNobWVudC50ZXh0dXJlKSB7XG4gICAgICAgIGF0dGFjaG1lbnQudGV4dHVyZS5yZXNpemUodywgaClcbiAgICAgIH0gZWxzZSBpZiAoYXR0YWNobWVudC5yZW5kZXJidWZmZXIpIHtcbiAgICAgICAgYXR0YWNobWVudC5yZW5kZXJidWZmZXIucmVzaXplKHcsIGgpXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgdmFyIGZyYW1lYnVmZmVyQ291bnQgPSAwXG4gIHZhciBmcmFtZWJ1ZmZlclNldCA9IHt9XG5cbiAgZnVuY3Rpb24gUkVHTEZyYW1lYnVmZmVyICgpIHtcbiAgICB0aGlzLmlkID0gZnJhbWVidWZmZXJDb3VudCsrXG4gICAgZnJhbWVidWZmZXJTZXRbdGhpcy5pZF0gPSB0aGlzXG5cbiAgICB0aGlzLmZyYW1lYnVmZmVyID0gZ2wuY3JlYXRlRnJhbWVidWZmZXIoKVxuICAgIHRoaXMud2lkdGggPSAwXG4gICAgdGhpcy5oZWlnaHQgPSAwXG5cbiAgICB0aGlzLmNvbG9yQXR0YWNobWVudHMgPSBbXVxuICAgIHRoaXMuZGVwdGhBdHRhY2htZW50ID0gbnVsbFxuICAgIHRoaXMuc3RlbmNpbEF0dGFjaG1lbnQgPSBudWxsXG4gICAgdGhpcy5kZXB0aFN0ZW5jaWxBdHRhY2htZW50ID0gbnVsbFxuICB9XG5cbiAgZnVuY3Rpb24gZGVjRkJPUmVmcyAoZnJhbWVidWZmZXIpIHtcbiAgICBmcmFtZWJ1ZmZlci5jb2xvckF0dGFjaG1lbnRzLmZvckVhY2goZGVjUmVmKVxuICAgIGRlY1JlZihmcmFtZWJ1ZmZlci5kZXB0aEF0dGFjaG1lbnQpXG4gICAgZGVjUmVmKGZyYW1lYnVmZmVyLnN0ZW5jaWxBdHRhY2htZW50KVxuICAgIGRlY1JlZihmcmFtZWJ1ZmZlci5kZXB0aFN0ZW5jaWxBdHRhY2htZW50KVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSAoZnJhbWVidWZmZXIpIHtcbiAgICB2YXIgaGFuZGxlID0gZnJhbWVidWZmZXIuZnJhbWVidWZmZXJcbiAgICBcbiAgICBnbC5kZWxldGVGcmFtZWJ1ZmZlcihoYW5kbGUpXG4gICAgZnJhbWVidWZmZXIuZnJhbWVidWZmZXIgPSBudWxsXG4gICAgc3RhdHMuZnJhbWVidWZmZXJDb3VudC0tXG4gICAgZGVsZXRlIGZyYW1lYnVmZmVyU2V0W2ZyYW1lYnVmZmVyLmlkXVxuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlRnJhbWVidWZmZXIgKGZyYW1lYnVmZmVyKSB7XG4gICAgdmFyIGlcblxuICAgIGdsLmJpbmRGcmFtZWJ1ZmZlcihHTF9GUkFNRUJVRkZFUiwgZnJhbWVidWZmZXIuZnJhbWVidWZmZXIpXG4gICAgdmFyIGNvbG9yQXR0YWNobWVudHMgPSBmcmFtZWJ1ZmZlci5jb2xvckF0dGFjaG1lbnRzXG4gICAgZm9yIChpID0gMDsgaSA8IGNvbG9yQXR0YWNobWVudHMubGVuZ3RoOyArK2kpIHtcbiAgICAgIGF0dGFjaChHTF9DT0xPUl9BVFRBQ0hNRU5UMCArIGksIGNvbG9yQXR0YWNobWVudHNbaV0pXG4gICAgfVxuICAgIGZvciAoaSA9IGNvbG9yQXR0YWNobWVudHMubGVuZ3RoOyBpIDwgbGltaXRzLm1heENvbG9yQXR0YWNobWVudHM7ICsraSkge1xuICAgICAgYXR0YWNoKEdMX0NPTE9SX0FUVEFDSE1FTlQwICsgaSwgbnVsbClcbiAgICB9XG4gICAgYXR0YWNoKEdMX0RFUFRIX0FUVEFDSE1FTlQsIGZyYW1lYnVmZmVyLmRlcHRoQXR0YWNobWVudClcbiAgICBhdHRhY2goR0xfU1RFTkNJTF9BVFRBQ0hNRU5ULCBmcmFtZWJ1ZmZlci5zdGVuY2lsQXR0YWNobWVudClcbiAgICBhdHRhY2goR0xfREVQVEhfU1RFTkNJTF9BVFRBQ0hNRU5ULCBmcmFtZWJ1ZmZlci5kZXB0aFN0ZW5jaWxBdHRhY2htZW50KVxuXG4gICAgLy8gQ2hlY2sgc3RhdHVzIGNvZGVcbiAgICB2YXIgc3RhdHVzID0gZ2wuY2hlY2tGcmFtZWJ1ZmZlclN0YXR1cyhHTF9GUkFNRUJVRkZFUilcbiAgICBpZiAoc3RhdHVzICE9PSBHTF9GUkFNRUJVRkZFUl9DT01QTEVURSkge1xuICAgICAgXG4gICAgfVxuXG4gICAgZ2wuYmluZEZyYW1lYnVmZmVyKEdMX0ZSQU1FQlVGRkVSLCBmcmFtZWJ1ZmZlclN0YXRlLm5leHQpXG4gICAgZnJhbWVidWZmZXJTdGF0ZS5jdXIgPSBmcmFtZWJ1ZmZlclN0YXRlLm5leHRcblxuICAgIC8vIEZJWE1FOiBDbGVhciBlcnJvciBjb2RlIGhlcmUuICBUaGlzIGlzIGEgd29yayBhcm91bmQgZm9yIGEgYnVnIGluXG4gICAgLy8gaGVhZGxlc3MtZ2xcbiAgICBnbC5nZXRFcnJvcigpXG4gIH1cblxuICBmdW5jdGlvbiBjcmVhdGVGQk8gKGEwLCBhMSkge1xuICAgIHZhciBmcmFtZWJ1ZmZlciA9IG5ldyBSRUdMRnJhbWVidWZmZXIoKVxuICAgIHN0YXRzLmZyYW1lYnVmZmVyQ291bnQrK1xuXG4gICAgZnVuY3Rpb24gcmVnbEZyYW1lYnVmZmVyIChhLCBiKSB7XG4gICAgICB2YXIgaVxuXG4gICAgICBcblxuICAgICAgdmFyIGV4dERyYXdCdWZmZXJzID0gZXh0ZW5zaW9ucy53ZWJnbF9kcmF3X2J1ZmZlcnNcblxuICAgICAgdmFyIHdpZHRoID0gMFxuICAgICAgdmFyIGhlaWdodCA9IDBcblxuICAgICAgdmFyIG5lZWRzRGVwdGggPSB0cnVlXG4gICAgICB2YXIgbmVlZHNTdGVuY2lsID0gdHJ1ZVxuXG4gICAgICB2YXIgY29sb3JCdWZmZXIgPSBudWxsXG4gICAgICB2YXIgY29sb3JUZXh0dXJlID0gdHJ1ZVxuICAgICAgdmFyIGNvbG9yRm9ybWF0ID0gJ3JnYmEnXG4gICAgICB2YXIgY29sb3JUeXBlID0gJ3VpbnQ4J1xuICAgICAgdmFyIGNvbG9yQ291bnQgPSAxXG5cbiAgICAgIHZhciBkZXB0aEJ1ZmZlciA9IG51bGxcbiAgICAgIHZhciBzdGVuY2lsQnVmZmVyID0gbnVsbFxuICAgICAgdmFyIGRlcHRoU3RlbmNpbEJ1ZmZlciA9IG51bGxcbiAgICAgIHZhciBkZXB0aFN0ZW5jaWxUZXh0dXJlID0gZmFsc2VcblxuICAgICAgaWYgKHR5cGVvZiBhID09PSAnbnVtYmVyJykge1xuICAgICAgICB3aWR0aCA9IGEgfCAwXG4gICAgICAgIGhlaWdodCA9IChiIHwgMCkgfHwgd2lkdGhcbiAgICAgIH0gZWxzZSBpZiAoIWEpIHtcbiAgICAgICAgd2lkdGggPSBoZWlnaHQgPSAxXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBcbiAgICAgICAgdmFyIG9wdGlvbnMgPSBhXG5cbiAgICAgICAgaWYgKCdzaGFwZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHZhciBzaGFwZSA9IG9wdGlvbnMuc2hhcGVcbiAgICAgICAgICBcbiAgICAgICAgICB3aWR0aCA9IHNoYXBlWzBdXG4gICAgICAgICAgaGVpZ2h0ID0gc2hhcGVbMV1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAoJ3JhZGl1cycgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgd2lkdGggPSBoZWlnaHQgPSBvcHRpb25zLnJhZGl1c1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoJ3dpZHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICB3aWR0aCA9IG9wdGlvbnMud2lkdGhcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCdoZWlnaHQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGhlaWdodCA9IG9wdGlvbnMuaGVpZ2h0XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdjb2xvcicgaW4gb3B0aW9ucyB8fFxuICAgICAgICAgICAgJ2NvbG9ycycgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGNvbG9yQnVmZmVyID1cbiAgICAgICAgICAgIG9wdGlvbnMuY29sb3IgfHxcbiAgICAgICAgICAgIG9wdGlvbnMuY29sb3JzXG4gICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoY29sb3JCdWZmZXIpKSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWNvbG9yQnVmZmVyKSB7XG4gICAgICAgICAgaWYgKCdjb2xvckNvdW50JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBjb2xvckNvdW50ID0gb3B0aW9ucy5jb2xvckNvdW50IHwgMFxuICAgICAgICAgICAgXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKCdjb2xvclRleHR1cmUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGNvbG9yVGV4dHVyZSA9ICEhb3B0aW9ucy5jb2xvclRleHR1cmVcbiAgICAgICAgICAgIGNvbG9yRm9ybWF0ID0gJ3JnYmE0J1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmICgnY29sb3JUeXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBjb2xvclR5cGUgPSBvcHRpb25zLmNvbG9yVHlwZVxuICAgICAgICAgICAgaWYgKCFjb2xvclRleHR1cmUpIHtcbiAgICAgICAgICAgICAgaWYgKGNvbG9yVHlwZSA9PT0gJ2hhbGYgZmxvYXQnIHx8IGNvbG9yVHlwZSA9PT0gJ2Zsb2F0MTYnKSB7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgY29sb3JGb3JtYXQgPSAncmdiYTE2ZidcbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChjb2xvclR5cGUgPT09ICdmbG9hdCcgfHwgY29sb3JUeXBlID09PSAnZmxvYXQzMicpIHtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBjb2xvckZvcm1hdCA9ICdyZ2JhMzJmJ1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoJ2NvbG9yRm9ybWF0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBjb2xvckZvcm1hdCA9IG9wdGlvbnMuY29sb3JGb3JtYXRcbiAgICAgICAgICAgIGlmIChjb2xvclRleHR1cmVGb3JtYXRzLmluZGV4T2YoY29sb3JGb3JtYXQpID49IDApIHtcbiAgICAgICAgICAgICAgY29sb3JUZXh0dXJlID0gdHJ1ZVxuICAgICAgICAgICAgfSBlbHNlIGlmIChjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHMuaW5kZXhPZihjb2xvckZvcm1hdCkgPj0gMCkge1xuICAgICAgICAgICAgICBjb2xvclRleHR1cmUgPSBmYWxzZVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgaWYgKGNvbG9yVGV4dHVyZSkge1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdkZXB0aFRleHR1cmUnIGluIG9wdGlvbnMgfHwgJ2RlcHRoU3RlbmNpbFRleHR1cmUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBkZXB0aFN0ZW5jaWxUZXh0dXJlID0gISEob3B0aW9ucy5kZXB0aFRleHR1cmUgfHxcbiAgICAgICAgICAgIG9wdGlvbnMuZGVwdGhTdGVuY2lsVGV4dHVyZSlcbiAgICAgICAgICBcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnZGVwdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBpZiAodHlwZW9mIG9wdGlvbnMuZGVwdGggPT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgbmVlZHNEZXB0aCA9IG9wdGlvbnMuZGVwdGhcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZGVwdGhCdWZmZXIgPSBvcHRpb25zLmRlcHRoXG4gICAgICAgICAgICBuZWVkc1N0ZW5jaWwgPSBmYWxzZVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnc3RlbmNpbCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5zdGVuY2lsID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgIG5lZWRzU3RlbmNpbCA9IG9wdGlvbnMuc3RlbmNpbFxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzdGVuY2lsQnVmZmVyID0gb3B0aW9ucy5zdGVuY2lsXG4gICAgICAgICAgICBuZWVkc0RlcHRoID0gZmFsc2VcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ2RlcHRoU3RlbmNpbCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5kZXB0aFN0ZW5jaWwgPT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgbmVlZHNEZXB0aCA9IG5lZWRzU3RlbmNpbCA9IG9wdGlvbnMuZGVwdGhTdGVuY2lsXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGRlcHRoU3RlbmNpbEJ1ZmZlciA9IG9wdGlvbnMuZGVwdGhTdGVuY2lsXG4gICAgICAgICAgICBuZWVkc0RlcHRoID0gZmFsc2VcbiAgICAgICAgICAgIG5lZWRzU3RlbmNpbCA9IGZhbHNlXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIHBhcnNlIGF0dGFjaG1lbnRzXG4gICAgICB2YXIgY29sb3JBdHRhY2htZW50cyA9IG51bGxcbiAgICAgIHZhciBkZXB0aEF0dGFjaG1lbnQgPSBudWxsXG4gICAgICB2YXIgc3RlbmNpbEF0dGFjaG1lbnQgPSBudWxsXG4gICAgICB2YXIgZGVwdGhTdGVuY2lsQXR0YWNobWVudCA9IG51bGxcblxuICAgICAgLy8gU2V0IHVwIGNvbG9yIGF0dGFjaG1lbnRzXG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShjb2xvckJ1ZmZlcikpIHtcbiAgICAgICAgY29sb3JBdHRhY2htZW50cyA9IGNvbG9yQnVmZmVyLm1hcChwYXJzZUF0dGFjaG1lbnQpXG4gICAgICB9IGVsc2UgaWYgKGNvbG9yQnVmZmVyKSB7XG4gICAgICAgIGNvbG9yQXR0YWNobWVudHMgPSBbcGFyc2VBdHRhY2htZW50KGNvbG9yQnVmZmVyKV1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbG9yQXR0YWNobWVudHMgPSBuZXcgQXJyYXkoY29sb3JDb3VudClcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGNvbG9yQ291bnQ7ICsraSkge1xuICAgICAgICAgIGNvbG9yQXR0YWNobWVudHNbaV0gPSBhbGxvY0F0dGFjaG1lbnQoXG4gICAgICAgICAgICB3aWR0aCxcbiAgICAgICAgICAgIGhlaWdodCxcbiAgICAgICAgICAgIGNvbG9yVGV4dHVyZSxcbiAgICAgICAgICAgIGNvbG9yRm9ybWF0LFxuICAgICAgICAgICAgY29sb3JUeXBlKVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIFxuICAgICAgXG5cbiAgICAgIHdpZHRoID0gd2lkdGggfHwgY29sb3JBdHRhY2htZW50c1swXS53aWR0aFxuICAgICAgaGVpZ2h0ID0gaGVpZ2h0IHx8IGNvbG9yQXR0YWNobWVudHNbMF0uaGVpZ2h0XG5cbiAgICAgIGlmIChkZXB0aEJ1ZmZlcikge1xuICAgICAgICBkZXB0aEF0dGFjaG1lbnQgPSBwYXJzZUF0dGFjaG1lbnQoZGVwdGhCdWZmZXIpXG4gICAgICB9IGVsc2UgaWYgKG5lZWRzRGVwdGggJiYgIW5lZWRzU3RlbmNpbCkge1xuICAgICAgICBkZXB0aEF0dGFjaG1lbnQgPSBhbGxvY0F0dGFjaG1lbnQoXG4gICAgICAgICAgd2lkdGgsXG4gICAgICAgICAgaGVpZ2h0LFxuICAgICAgICAgIGRlcHRoU3RlbmNpbFRleHR1cmUsXG4gICAgICAgICAgJ2RlcHRoJyxcbiAgICAgICAgICAndWludDMyJylcbiAgICAgIH1cblxuICAgICAgaWYgKHN0ZW5jaWxCdWZmZXIpIHtcbiAgICAgICAgc3RlbmNpbEF0dGFjaG1lbnQgPSBwYXJzZUF0dGFjaG1lbnQoc3RlbmNpbEJ1ZmZlcilcbiAgICAgIH0gZWxzZSBpZiAobmVlZHNTdGVuY2lsICYmICFuZWVkc0RlcHRoKSB7XG4gICAgICAgIHN0ZW5jaWxBdHRhY2htZW50ID0gYWxsb2NBdHRhY2htZW50KFxuICAgICAgICAgIHdpZHRoLFxuICAgICAgICAgIGhlaWdodCxcbiAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICAnc3RlbmNpbCcsXG4gICAgICAgICAgJ3VpbnQ4JylcbiAgICAgIH1cblxuICAgICAgaWYgKGRlcHRoU3RlbmNpbEJ1ZmZlcikge1xuICAgICAgICBkZXB0aFN0ZW5jaWxBdHRhY2htZW50ID0gcGFyc2VBdHRhY2htZW50KGRlcHRoU3RlbmNpbEJ1ZmZlcilcbiAgICAgIH0gZWxzZSBpZiAoIWRlcHRoQnVmZmVyICYmICFzdGVuY2lsQnVmZmVyICYmIG5lZWRzU3RlbmNpbCAmJiBuZWVkc0RlcHRoKSB7XG4gICAgICAgIGRlcHRoU3RlbmNpbEF0dGFjaG1lbnQgPSBhbGxvY0F0dGFjaG1lbnQoXG4gICAgICAgICAgd2lkdGgsXG4gICAgICAgICAgaGVpZ2h0LFxuICAgICAgICAgIGRlcHRoU3RlbmNpbFRleHR1cmUsXG4gICAgICAgICAgJ2RlcHRoIHN0ZW5jaWwnLFxuICAgICAgICAgICdkZXB0aCBzdGVuY2lsJylcbiAgICAgIH1cblxuICAgICAgXG5cbiAgICAgIHZhciBjb21tb25Db2xvckF0dGFjaG1lbnRTaXplID0gbnVsbFxuXG4gICAgICBmb3IgKGkgPSAwOyBpIDwgY29sb3JBdHRhY2htZW50cy5sZW5ndGg7ICsraSkge1xuICAgICAgICBpbmNSZWZBbmRDaGVja1NoYXBlKGNvbG9yQXR0YWNobWVudHNbaV0sIHdpZHRoLCBoZWlnaHQpXG4gICAgICAgIFxuXG4gICAgICAgIGlmIChjb2xvckF0dGFjaG1lbnRzW2ldICYmIGNvbG9yQXR0YWNobWVudHNbaV0udGV4dHVyZSkge1xuICAgICAgICAgIHZhciBjb2xvckF0dGFjaG1lbnRTaXplID1cbiAgICAgICAgICAgICAgdGV4dHVyZUZvcm1hdENoYW5uZWxzW2NvbG9yQXR0YWNobWVudHNbaV0udGV4dHVyZS5fdGV4dHVyZS5mb3JtYXRdICpcbiAgICAgICAgICAgICAgdGV4dHVyZVR5cGVTaXplc1tjb2xvckF0dGFjaG1lbnRzW2ldLnRleHR1cmUuX3RleHR1cmUudHlwZV1cblxuICAgICAgICAgIGlmIChjb21tb25Db2xvckF0dGFjaG1lbnRTaXplID09PSBudWxsKSB7XG4gICAgICAgICAgICBjb21tb25Db2xvckF0dGFjaG1lbnRTaXplID0gY29sb3JBdHRhY2htZW50U2l6ZVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBXZSBuZWVkIHRvIG1ha2Ugc3VyZSB0aGF0IGFsbCBjb2xvciBhdHRhY2htZW50cyBoYXZlIHRoZSBzYW1lIG51bWJlciBvZiBiaXRwbGFuZXNcbiAgICAgICAgICAgIC8vICh0aGF0IGlzLCB0aGUgc2FtZSBudW1lciBvZiBiaXRzIHBlciBwaXhlbClcbiAgICAgICAgICAgIC8vIFRoaXMgaXMgcmVxdWlyZWQgYnkgdGhlIEdMRVMyLjAgc3RhbmRhcmQuIFNlZSB0aGUgYmVnaW5uaW5nIG9mIENoYXB0ZXIgNCBpbiB0aGF0IGRvY3VtZW50LlxuICAgICAgICAgICAgXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpbmNSZWZBbmRDaGVja1NoYXBlKGRlcHRoQXR0YWNobWVudCwgd2lkdGgsIGhlaWdodClcbiAgICAgIFxuICAgICAgaW5jUmVmQW5kQ2hlY2tTaGFwZShzdGVuY2lsQXR0YWNobWVudCwgd2lkdGgsIGhlaWdodClcbiAgICAgIFxuICAgICAgaW5jUmVmQW5kQ2hlY2tTaGFwZShkZXB0aFN0ZW5jaWxBdHRhY2htZW50LCB3aWR0aCwgaGVpZ2h0KVxuICAgICAgXG5cbiAgICAgIC8vIGRlY3JlbWVudCByZWZlcmVuY2VzXG4gICAgICBkZWNGQk9SZWZzKGZyYW1lYnVmZmVyKVxuXG4gICAgICBmcmFtZWJ1ZmZlci53aWR0aCA9IHdpZHRoXG4gICAgICBmcmFtZWJ1ZmZlci5oZWlnaHQgPSBoZWlnaHRcblxuICAgICAgZnJhbWVidWZmZXIuY29sb3JBdHRhY2htZW50cyA9IGNvbG9yQXR0YWNobWVudHNcbiAgICAgIGZyYW1lYnVmZmVyLmRlcHRoQXR0YWNobWVudCA9IGRlcHRoQXR0YWNobWVudFxuICAgICAgZnJhbWVidWZmZXIuc3RlbmNpbEF0dGFjaG1lbnQgPSBzdGVuY2lsQXR0YWNobWVudFxuICAgICAgZnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsQXR0YWNobWVudCA9IGRlcHRoU3RlbmNpbEF0dGFjaG1lbnRcblxuICAgICAgcmVnbEZyYW1lYnVmZmVyLmNvbG9yID0gY29sb3JBdHRhY2htZW50cy5tYXAodW53cmFwQXR0YWNobWVudClcbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci5kZXB0aCA9IHVud3JhcEF0dGFjaG1lbnQoZGVwdGhBdHRhY2htZW50KVxuICAgICAgcmVnbEZyYW1lYnVmZmVyLnN0ZW5jaWwgPSB1bndyYXBBdHRhY2htZW50KHN0ZW5jaWxBdHRhY2htZW50KVxuICAgICAgcmVnbEZyYW1lYnVmZmVyLmRlcHRoU3RlbmNpbCA9IHVud3JhcEF0dGFjaG1lbnQoZGVwdGhTdGVuY2lsQXR0YWNobWVudClcblxuICAgICAgcmVnbEZyYW1lYnVmZmVyLndpZHRoID0gZnJhbWVidWZmZXIud2lkdGhcbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci5oZWlnaHQgPSBmcmFtZWJ1ZmZlci5oZWlnaHRcblxuICAgICAgdXBkYXRlRnJhbWVidWZmZXIoZnJhbWVidWZmZXIpXG5cbiAgICAgIHJldHVybiByZWdsRnJhbWVidWZmZXJcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZXNpemUgKHdfLCBoXykge1xuICAgICAgXG5cbiAgICAgIHZhciB3ID0gd18gfCAwXG4gICAgICB2YXIgaCA9IChoXyB8IDApIHx8IHdcbiAgICAgIGlmICh3ID09PSBmcmFtZWJ1ZmZlci53aWR0aCAmJiBoID09PSBmcmFtZWJ1ZmZlci5oZWlnaHQpIHtcbiAgICAgICAgcmV0dXJuIHJlZ2xGcmFtZWJ1ZmZlclxuICAgICAgfVxuXG4gICAgICAvLyByZXNpemUgYWxsIGJ1ZmZlcnNcbiAgICAgIHZhciBjb2xvckF0dGFjaG1lbnRzID0gZnJhbWVidWZmZXIuY29sb3JBdHRhY2htZW50c1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjb2xvckF0dGFjaG1lbnRzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgIHJlc2l6ZUF0dGFjaG1lbnQoY29sb3JBdHRhY2htZW50c1tpXSwgdywgaClcbiAgICAgIH1cbiAgICAgIHJlc2l6ZUF0dGFjaG1lbnQoZnJhbWVidWZmZXIuZGVwdGhBdHRhY2htZW50LCB3LCBoKVxuICAgICAgcmVzaXplQXR0YWNobWVudChmcmFtZWJ1ZmZlci5zdGVuY2lsQXR0YWNobWVudCwgdywgaClcbiAgICAgIHJlc2l6ZUF0dGFjaG1lbnQoZnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsQXR0YWNobWVudCwgdywgaClcblxuICAgICAgZnJhbWVidWZmZXIud2lkdGggPSByZWdsRnJhbWVidWZmZXIud2lkdGggPSB3XG4gICAgICBmcmFtZWJ1ZmZlci5oZWlnaHQgPSByZWdsRnJhbWVidWZmZXIuaGVpZ2h0ID0gaFxuXG4gICAgICB1cGRhdGVGcmFtZWJ1ZmZlcihmcmFtZWJ1ZmZlcilcblxuICAgICAgcmV0dXJuIHJlZ2xGcmFtZWJ1ZmZlclxuICAgIH1cblxuICAgIHJlZ2xGcmFtZWJ1ZmZlcihhMCwgYTEpXG5cbiAgICByZXR1cm4gZXh0ZW5kKHJlZ2xGcmFtZWJ1ZmZlciwge1xuICAgICAgcmVzaXplOiByZXNpemUsXG4gICAgICBfcmVnbFR5cGU6ICdmcmFtZWJ1ZmZlcicsXG4gICAgICBfZnJhbWVidWZmZXI6IGZyYW1lYnVmZmVyLFxuICAgICAgZGVzdHJveTogZnVuY3Rpb24gKCkge1xuICAgICAgICBkZXN0cm95KGZyYW1lYnVmZmVyKVxuICAgICAgICBkZWNGQk9SZWZzKGZyYW1lYnVmZmVyKVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiBjcmVhdGVDdWJlRkJPIChvcHRpb25zKSB7XG4gICAgdmFyIGZhY2VzID0gQXJyYXkoNilcblxuICAgIGZ1bmN0aW9uIHJlZ2xGcmFtZWJ1ZmZlckN1YmUgKGEpIHtcbiAgICAgIHZhciBpXG5cbiAgICAgIFxuXG4gICAgICB2YXIgZXh0RHJhd0J1ZmZlcnMgPSBleHRlbnNpb25zLndlYmdsX2RyYXdfYnVmZmVyc1xuXG4gICAgICB2YXIgcGFyYW1zID0ge1xuICAgICAgICBjb2xvcjogbnVsbFxuICAgICAgfVxuXG4gICAgICB2YXIgcmFkaXVzID0gMFxuXG4gICAgICB2YXIgY29sb3JCdWZmZXIgPSBudWxsXG4gICAgICB2YXIgY29sb3JGb3JtYXQgPSAncmdiYSdcbiAgICAgIHZhciBjb2xvclR5cGUgPSAndWludDgnXG4gICAgICB2YXIgY29sb3JDb3VudCA9IDFcblxuICAgICAgaWYgKHR5cGVvZiBhID09PSAnbnVtYmVyJykge1xuICAgICAgICByYWRpdXMgPSBhIHwgMFxuICAgICAgfSBlbHNlIGlmICghYSkge1xuICAgICAgICByYWRpdXMgPSAxXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBcbiAgICAgICAgdmFyIG9wdGlvbnMgPSBhXG5cbiAgICAgICAgaWYgKCdzaGFwZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHZhciBzaGFwZSA9IG9wdGlvbnMuc2hhcGVcbiAgICAgICAgICBcbiAgICAgICAgICBcbiAgICAgICAgICByYWRpdXMgPSBzaGFwZVswXVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmICgncmFkaXVzJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICByYWRpdXMgPSBvcHRpb25zLnJhZGl1cyB8IDBcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCd3aWR0aCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgcmFkaXVzID0gb3B0aW9ucy53aWR0aCB8IDBcbiAgICAgICAgICAgIGlmICgnaGVpZ2h0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSBpZiAoJ2hlaWdodCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgcmFkaXVzID0gb3B0aW9ucy5oZWlnaHQgfCAwXG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdjb2xvcicgaW4gb3B0aW9ucyB8fFxuICAgICAgICAgICAgJ2NvbG9ycycgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGNvbG9yQnVmZmVyID1cbiAgICAgICAgICAgIG9wdGlvbnMuY29sb3IgfHxcbiAgICAgICAgICAgIG9wdGlvbnMuY29sb3JzXG4gICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoY29sb3JCdWZmZXIpKSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWNvbG9yQnVmZmVyKSB7XG4gICAgICAgICAgaWYgKCdjb2xvckNvdW50JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBjb2xvckNvdW50ID0gb3B0aW9ucy5jb2xvckNvdW50IHwgMFxuICAgICAgICAgICAgXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKCdjb2xvclR5cGUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY29sb3JUeXBlID0gb3B0aW9ucy5jb2xvclR5cGVcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoJ2NvbG9yRm9ybWF0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBjb2xvckZvcm1hdCA9IG9wdGlvbnMuY29sb3JGb3JtYXRcbiAgICAgICAgICAgIFxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnZGVwdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBwYXJhbXMuZGVwdGggPSBvcHRpb25zLmRlcHRoXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ3N0ZW5jaWwnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBwYXJhbXMuc3RlbmNpbCA9IG9wdGlvbnMuc3RlbmNpbFxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdkZXB0aFN0ZW5jaWwnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBwYXJhbXMuZGVwdGhTdGVuY2lsID0gb3B0aW9ucy5kZXB0aFN0ZW5jaWxcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICB2YXIgY29sb3JDdWJlc1xuICAgICAgaWYgKGNvbG9yQnVmZmVyKSB7XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KGNvbG9yQnVmZmVyKSkge1xuICAgICAgICAgIGNvbG9yQ3ViZXMgPSBbXVxuICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xvckJ1ZmZlci5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgY29sb3JDdWJlc1tpXSA9IGNvbG9yQnVmZmVyW2ldXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbG9yQ3ViZXMgPSBbIGNvbG9yQnVmZmVyIF1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29sb3JDdWJlcyA9IEFycmF5KGNvbG9yQ291bnQpXG4gICAgICAgIHZhciBjdWJlTWFwUGFyYW1zID0ge1xuICAgICAgICAgIHJhZGl1czogcmFkaXVzLFxuICAgICAgICAgIGZvcm1hdDogY29sb3JGb3JtYXQsXG4gICAgICAgICAgdHlwZTogY29sb3JUeXBlXG4gICAgICAgIH1cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGNvbG9yQ291bnQ7ICsraSkge1xuICAgICAgICAgIGNvbG9yQ3ViZXNbaV0gPSB0ZXh0dXJlU3RhdGUuY3JlYXRlQ3ViZShjdWJlTWFwUGFyYW1zKVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIENoZWNrIGNvbG9yIGN1YmVzXG4gICAgICBwYXJhbXMuY29sb3IgPSBBcnJheShjb2xvckN1YmVzLmxlbmd0aClcbiAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xvckN1YmVzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgIHZhciBjdWJlID0gY29sb3JDdWJlc1tpXVxuICAgICAgICBcbiAgICAgICAgcmFkaXVzID0gcmFkaXVzIHx8IGN1YmUud2lkdGhcbiAgICAgICAgXG4gICAgICAgIHBhcmFtcy5jb2xvcltpXSA9IHtcbiAgICAgICAgICB0YXJnZXQ6IEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCxcbiAgICAgICAgICBkYXRhOiBjb2xvckN1YmVzW2ldXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGNvbG9yQ3ViZXMubGVuZ3RoOyArK2opIHtcbiAgICAgICAgICBwYXJhbXMuY29sb3Jbal0udGFyZ2V0ID0gR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YICsgaVxuICAgICAgICB9XG4gICAgICAgIC8vIHJldXNlIGRlcHRoLXN0ZW5jaWwgYXR0YWNobWVudHMgYWNyb3NzIGFsbCBjdWJlIG1hcHNcbiAgICAgICAgaWYgKGkgPiAwKSB7XG4gICAgICAgICAgcGFyYW1zLmRlcHRoID0gZmFjZXNbMF0uZGVwdGhcbiAgICAgICAgICBwYXJhbXMuc3RlbmNpbCA9IGZhY2VzWzBdLnN0ZW5jaWxcbiAgICAgICAgICBwYXJhbXMuZGVwdGhTdGVuY2lsID0gZmFjZXNbMF0uZGVwdGhTdGVuY2lsXG4gICAgICAgIH1cbiAgICAgICAgaWYgKGZhY2VzW2ldKSB7XG4gICAgICAgICAgKGZhY2VzW2ldKShwYXJhbXMpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZmFjZXNbaV0gPSBjcmVhdGVGQk8ocGFyYW1zKVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBleHRlbmQocmVnbEZyYW1lYnVmZmVyQ3ViZSwge1xuICAgICAgICB3aWR0aDogcmFkaXVzLFxuICAgICAgICBoZWlnaHQ6IHJhZGl1cyxcbiAgICAgICAgY29sb3I6IGNvbG9yQ3ViZXNcbiAgICAgIH0pXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVzaXplIChyYWRpdXNfKSB7XG4gICAgICB2YXIgaVxuICAgICAgdmFyIHJhZGl1cyA9IHJhZGl1c18gfCAwXG4gICAgICBcblxuICAgICAgaWYgKHJhZGl1cyA9PT0gcmVnbEZyYW1lYnVmZmVyQ3ViZS53aWR0aCkge1xuICAgICAgICByZXR1cm4gcmVnbEZyYW1lYnVmZmVyQ3ViZVxuICAgICAgfVxuXG4gICAgICB2YXIgY29sb3JzID0gcmVnbEZyYW1lYnVmZmVyQ3ViZS5jb2xvclxuICAgICAgZm9yIChpID0gMDsgaSA8IGNvbG9ycy5sZW5ndGg7ICsraSkge1xuICAgICAgICBjb2xvcnNbaV0ucmVzaXplKHJhZGl1cylcbiAgICAgIH1cblxuICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICBmYWNlc1tpXS5yZXNpemUocmFkaXVzKVxuICAgICAgfVxuXG4gICAgICByZWdsRnJhbWVidWZmZXJDdWJlLndpZHRoID0gcmVnbEZyYW1lYnVmZmVyQ3ViZS5oZWlnaHQgPSByYWRpdXNcblxuICAgICAgcmV0dXJuIHJlZ2xGcmFtZWJ1ZmZlckN1YmVcbiAgICB9XG5cbiAgICByZWdsRnJhbWVidWZmZXJDdWJlKG9wdGlvbnMpXG5cbiAgICByZXR1cm4gZXh0ZW5kKHJlZ2xGcmFtZWJ1ZmZlckN1YmUsIHtcbiAgICAgIGZhY2VzOiBmYWNlcyxcbiAgICAgIHJlc2l6ZTogcmVzaXplLFxuICAgICAgX3JlZ2xUeXBlOiAnZnJhbWVidWZmZXJDdWJlJyxcbiAgICAgIGRlc3Ryb3k6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgZmFjZXMuZm9yRWFjaChmdW5jdGlvbiAoZikge1xuICAgICAgICAgIGYuZGVzdHJveSgpXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIHJldHVybiBleHRlbmQoZnJhbWVidWZmZXJTdGF0ZSwge1xuICAgIGdldEZyYW1lYnVmZmVyOiBmdW5jdGlvbiAob2JqZWN0KSB7XG4gICAgICBpZiAodHlwZW9mIG9iamVjdCA9PT0gJ2Z1bmN0aW9uJyAmJiBvYmplY3QuX3JlZ2xUeXBlID09PSAnZnJhbWVidWZmZXInKSB7XG4gICAgICAgIHZhciBmYm8gPSBvYmplY3QuX2ZyYW1lYnVmZmVyXG4gICAgICAgIGlmIChmYm8gaW5zdGFuY2VvZiBSRUdMRnJhbWVidWZmZXIpIHtcbiAgICAgICAgICByZXR1cm4gZmJvXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsXG4gICAgfSxcbiAgICBjcmVhdGU6IGNyZWF0ZUZCTyxcbiAgICBjcmVhdGVDdWJlOiBjcmVhdGVDdWJlRkJPLFxuICAgIGNsZWFyOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YWx1ZXMoZnJhbWVidWZmZXJTZXQpLmZvckVhY2goZGVzdHJveSlcbiAgICB9XG4gIH0pXG59XG4iLCJ2YXIgR0xfU1VCUElYRUxfQklUUyA9IDB4MEQ1MFxudmFyIEdMX1JFRF9CSVRTID0gMHgwRDUyXG52YXIgR0xfR1JFRU5fQklUUyA9IDB4MEQ1M1xudmFyIEdMX0JMVUVfQklUUyA9IDB4MEQ1NFxudmFyIEdMX0FMUEhBX0JJVFMgPSAweDBENTVcbnZhciBHTF9ERVBUSF9CSVRTID0gMHgwRDU2XG52YXIgR0xfU1RFTkNJTF9CSVRTID0gMHgwRDU3XG5cbnZhciBHTF9BTElBU0VEX1BPSU5UX1NJWkVfUkFOR0UgPSAweDg0NkRcbnZhciBHTF9BTElBU0VEX0xJTkVfV0lEVEhfUkFOR0UgPSAweDg0NkVcblxudmFyIEdMX01BWF9URVhUVVJFX1NJWkUgPSAweDBEMzNcbnZhciBHTF9NQVhfVklFV1BPUlRfRElNUyA9IDB4MEQzQVxudmFyIEdMX01BWF9WRVJURVhfQVRUUklCUyA9IDB4ODg2OVxudmFyIEdMX01BWF9WRVJURVhfVU5JRk9STV9WRUNUT1JTID0gMHg4REZCXG52YXIgR0xfTUFYX1ZBUllJTkdfVkVDVE9SUyA9IDB4OERGQ1xudmFyIEdMX01BWF9DT01CSU5FRF9URVhUVVJFX0lNQUdFX1VOSVRTID0gMHg4QjREXG52YXIgR0xfTUFYX1ZFUlRFWF9URVhUVVJFX0lNQUdFX1VOSVRTID0gMHg4QjRDXG52YXIgR0xfTUFYX1RFWFRVUkVfSU1BR0VfVU5JVFMgPSAweDg4NzJcbnZhciBHTF9NQVhfRlJBR01FTlRfVU5JRk9STV9WRUNUT1JTID0gMHg4REZEXG52YXIgR0xfTUFYX0NVQkVfTUFQX1RFWFRVUkVfU0laRSA9IDB4ODUxQ1xudmFyIEdMX01BWF9SRU5ERVJCVUZGRVJfU0laRSA9IDB4ODRFOFxuXG52YXIgR0xfVkVORE9SID0gMHgxRjAwXG52YXIgR0xfUkVOREVSRVIgPSAweDFGMDFcbnZhciBHTF9WRVJTSU9OID0gMHgxRjAyXG52YXIgR0xfU0hBRElOR19MQU5HVUFHRV9WRVJTSU9OID0gMHg4QjhDXG5cbnZhciBHTF9NQVhfVEVYVFVSRV9NQVhfQU5JU09UUk9QWV9FWFQgPSAweDg0RkZcblxudmFyIEdMX01BWF9DT0xPUl9BVFRBQ0hNRU5UU19XRUJHTCA9IDB4OENERlxudmFyIEdMX01BWF9EUkFXX0JVRkZFUlNfV0VCR0wgPSAweDg4MjRcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoZ2wsIGV4dGVuc2lvbnMpIHtcbiAgdmFyIG1heEFuaXNvdHJvcGljID0gMVxuICBpZiAoZXh0ZW5zaW9ucy5leHRfdGV4dHVyZV9maWx0ZXJfYW5pc290cm9waWMpIHtcbiAgICBtYXhBbmlzb3Ryb3BpYyA9IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVEVYVFVSRV9NQVhfQU5JU09UUk9QWV9FWFQpXG4gIH1cblxuICB2YXIgbWF4RHJhd2J1ZmZlcnMgPSAxXG4gIHZhciBtYXhDb2xvckF0dGFjaG1lbnRzID0gMVxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9kcmF3X2J1ZmZlcnMpIHtcbiAgICBtYXhEcmF3YnVmZmVycyA9IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfRFJBV19CVUZGRVJTX1dFQkdMKVxuICAgIG1heENvbG9yQXR0YWNobWVudHMgPSBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0NPTE9SX0FUVEFDSE1FTlRTX1dFQkdMKVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICAvLyBkcmF3aW5nIGJ1ZmZlciBiaXQgZGVwdGhcbiAgICBjb2xvckJpdHM6IFtcbiAgICAgIGdsLmdldFBhcmFtZXRlcihHTF9SRURfQklUUyksXG4gICAgICBnbC5nZXRQYXJhbWV0ZXIoR0xfR1JFRU5fQklUUyksXG4gICAgICBnbC5nZXRQYXJhbWV0ZXIoR0xfQkxVRV9CSVRTKSxcbiAgICAgIGdsLmdldFBhcmFtZXRlcihHTF9BTFBIQV9CSVRTKVxuICAgIF0sXG4gICAgZGVwdGhCaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfREVQVEhfQklUUyksXG4gICAgc3RlbmNpbEJpdHM6IGdsLmdldFBhcmFtZXRlcihHTF9TVEVOQ0lMX0JJVFMpLFxuICAgIHN1YnBpeGVsQml0czogZ2wuZ2V0UGFyYW1ldGVyKEdMX1NVQlBJWEVMX0JJVFMpLFxuXG4gICAgLy8gc3VwcG9ydGVkIGV4dGVuc2lvbnNcbiAgICBleHRlbnNpb25zOiBPYmplY3Qua2V5cyhleHRlbnNpb25zKS5maWx0ZXIoZnVuY3Rpb24gKGV4dCkge1xuICAgICAgcmV0dXJuICEhZXh0ZW5zaW9uc1tleHRdXG4gICAgfSksXG5cbiAgICAvLyBtYXggYW5pc28gc2FtcGxlc1xuICAgIG1heEFuaXNvdHJvcGljOiBtYXhBbmlzb3Ryb3BpYyxcblxuICAgIC8vIG1heCBkcmF3IGJ1ZmZlcnNcbiAgICBtYXhEcmF3YnVmZmVyczogbWF4RHJhd2J1ZmZlcnMsXG4gICAgbWF4Q29sb3JBdHRhY2htZW50czogbWF4Q29sb3JBdHRhY2htZW50cyxcblxuICAgIC8vIHBvaW50IGFuZCBsaW5lIHNpemUgcmFuZ2VzXG4gICAgcG9pbnRTaXplRGltczogZ2wuZ2V0UGFyYW1ldGVyKEdMX0FMSUFTRURfUE9JTlRfU0laRV9SQU5HRSksXG4gICAgbGluZVdpZHRoRGltczogZ2wuZ2V0UGFyYW1ldGVyKEdMX0FMSUFTRURfTElORV9XSURUSF9SQU5HRSksXG4gICAgbWF4Vmlld3BvcnREaW1zOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1ZJRVdQT1JUX0RJTVMpLFxuICAgIG1heENvbWJpbmVkVGV4dHVyZVVuaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0NPTUJJTkVEX1RFWFRVUkVfSU1BR0VfVU5JVFMpLFxuICAgIG1heEN1YmVNYXBTaXplOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0NVQkVfTUFQX1RFWFRVUkVfU0laRSksXG4gICAgbWF4UmVuZGVyYnVmZmVyU2l6ZTogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9SRU5ERVJCVUZGRVJfU0laRSksXG4gICAgbWF4VGV4dHVyZVVuaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1RFWFRVUkVfSU1BR0VfVU5JVFMpLFxuICAgIG1heFRleHR1cmVTaXplOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1RFWFRVUkVfU0laRSksXG4gICAgbWF4QXR0cmlidXRlczogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9WRVJURVhfQVRUUklCUyksXG4gICAgbWF4VmVydGV4VW5pZm9ybXM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVkVSVEVYX1VOSUZPUk1fVkVDVE9SUyksXG4gICAgbWF4VmVydGV4VGV4dHVyZVVuaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1ZFUlRFWF9URVhUVVJFX0lNQUdFX1VOSVRTKSxcbiAgICBtYXhWYXJ5aW5nVmVjdG9yczogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9WQVJZSU5HX1ZFQ1RPUlMpLFxuICAgIG1heEZyYWdtZW50VW5pZm9ybXM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfRlJBR01FTlRfVU5JRk9STV9WRUNUT1JTKSxcblxuICAgIC8vIHZlbmRvciBpbmZvXG4gICAgZ2xzbDogZ2wuZ2V0UGFyYW1ldGVyKEdMX1NIQURJTkdfTEFOR1VBR0VfVkVSU0lPTiksXG4gICAgcmVuZGVyZXI6IGdsLmdldFBhcmFtZXRlcihHTF9SRU5ERVJFUiksXG4gICAgdmVuZG9yOiBnbC5nZXRQYXJhbWV0ZXIoR0xfVkVORE9SKSxcbiAgICB2ZXJzaW9uOiBnbC5nZXRQYXJhbWV0ZXIoR0xfVkVSU0lPTilcbiAgfVxufVxuIiwiXG52YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi91dGlsL2lzLXR5cGVkLWFycmF5JylcblxudmFyIEdMX1JHQkEgPSA2NDA4XG52YXIgR0xfVU5TSUdORURfQllURSA9IDUxMjFcbnZhciBHTF9QQUNLX0FMSUdOTUVOVCA9IDB4MEQwNVxudmFyIEdMX0ZMT0FUID0gMHgxNDA2IC8vIDUxMjZcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwUmVhZFBpeGVscyAoXG4gIGdsLFxuICBmcmFtZWJ1ZmZlclN0YXRlLFxuICByZWdsUG9sbCxcbiAgY29udGV4dCxcbiAgZ2xBdHRyaWJ1dGVzLFxuICBleHRlbnNpb25zKSB7XG4gIGZ1bmN0aW9uIHJlYWRQaXhlbHMgKGlucHV0KSB7XG4gICAgdmFyIHR5cGVcbiAgICBpZiAoZnJhbWVidWZmZXJTdGF0ZS5uZXh0ID09PSBudWxsKSB7XG4gICAgICBcbiAgICAgIHR5cGUgPSBHTF9VTlNJR05FRF9CWVRFXG4gICAgfSBlbHNlIHtcbiAgICAgIFxuICAgICAgdHlwZSA9IGZyYW1lYnVmZmVyU3RhdGUubmV4dC5jb2xvckF0dGFjaG1lbnRzWzBdLnRleHR1cmUuX3RleHR1cmUudHlwZVxuXG4gICAgICBpZiAoZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9mbG9hdCkge1xuICAgICAgICBcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIFxuICAgICAgfVxuICAgIH1cblxuICAgIHZhciB4ID0gMFxuICAgIHZhciB5ID0gMFxuICAgIHZhciB3aWR0aCA9IGNvbnRleHQuZnJhbWVidWZmZXJXaWR0aFxuICAgIHZhciBoZWlnaHQgPSBjb250ZXh0LmZyYW1lYnVmZmVySGVpZ2h0XG4gICAgdmFyIGRhdGEgPSBudWxsXG5cbiAgICBpZiAoaXNUeXBlZEFycmF5KGlucHV0KSkge1xuICAgICAgZGF0YSA9IGlucHV0XG4gICAgfSBlbHNlIGlmIChpbnB1dCkge1xuICAgICAgXG4gICAgICB4ID0gaW5wdXQueCB8IDBcbiAgICAgIHkgPSBpbnB1dC55IHwgMFxuICAgICAgXG4gICAgICBcbiAgICAgIHdpZHRoID0gKGlucHV0LndpZHRoIHx8IChjb250ZXh0LmZyYW1lYnVmZmVyV2lkdGggLSB4KSkgfCAwXG4gICAgICBoZWlnaHQgPSAoaW5wdXQuaGVpZ2h0IHx8IChjb250ZXh0LmZyYW1lYnVmZmVySGVpZ2h0IC0geSkpIHwgMFxuICAgICAgZGF0YSA9IGlucHV0LmRhdGEgfHwgbnVsbFxuICAgIH1cblxuICAgIC8vIHNhbml0eSBjaGVjayBpbnB1dC5kYXRhXG4gICAgaWYgKGRhdGEpIHtcbiAgICAgIGlmICh0eXBlID09PSBHTF9VTlNJR05FRF9CWVRFKSB7XG4gICAgICAgIFxuICAgICAgfSBlbHNlIGlmICh0eXBlID09PSBHTF9GTE9BVCkge1xuICAgICAgICBcbiAgICAgIH1cbiAgICB9XG5cbiAgICBcbiAgICBcblxuICAgIC8vIFVwZGF0ZSBXZWJHTCBzdGF0ZVxuICAgIHJlZ2xQb2xsKClcblxuICAgIC8vIENvbXB1dGUgc2l6ZVxuICAgIHZhciBzaXplID0gd2lkdGggKiBoZWlnaHQgKiA0XG5cbiAgICAvLyBBbGxvY2F0ZSBkYXRhXG4gICAgaWYgKCFkYXRhKSB7XG4gICAgICBpZiAodHlwZSA9PT0gR0xfVU5TSUdORURfQllURSkge1xuICAgICAgICBkYXRhID0gbmV3IFVpbnQ4QXJyYXkoc2l6ZSlcbiAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gR0xfRkxPQVQpIHtcbiAgICAgICAgZGF0YSA9IGRhdGEgfHwgbmV3IEZsb2F0MzJBcnJheShzaXplKVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFR5cGUgY2hlY2tcbiAgICBcbiAgICBcblxuICAgIC8vIFJ1biByZWFkIHBpeGVsc1xuICAgIGdsLnBpeGVsU3RvcmVpKEdMX1BBQ0tfQUxJR05NRU5ULCA0KVxuICAgIGdsLnJlYWRQaXhlbHMoeCwgeSwgd2lkdGgsIGhlaWdodCwgR0xfUkdCQSxcbiAgICAgICAgICAgICAgICAgIHR5cGUsXG4gICAgICAgICAgICAgICAgICBkYXRhKVxuXG4gICAgcmV0dXJuIGRhdGFcbiAgfVxuXG4gIHJldHVybiByZWFkUGl4ZWxzXG59XG4iLCJcbnZhciB2YWx1ZXMgPSByZXF1aXJlKCcuL3V0aWwvdmFsdWVzJylcblxudmFyIEdMX1JFTkRFUkJVRkZFUiA9IDB4OEQ0MVxuXG52YXIgR0xfUkdCQTQgPSAweDgwNTZcbnZhciBHTF9SR0I1X0ExID0gMHg4MDU3XG52YXIgR0xfUkdCNTY1ID0gMHg4RDYyXG52YXIgR0xfREVQVEhfQ09NUE9ORU5UMTYgPSAweDgxQTVcbnZhciBHTF9TVEVOQ0lMX0lOREVYOCA9IDB4OEQ0OFxudmFyIEdMX0RFUFRIX1NURU5DSUwgPSAweDg0RjlcblxudmFyIEdMX1NSR0I4X0FMUEhBOF9FWFQgPSAweDhDNDNcblxudmFyIEdMX1JHQkEzMkZfRVhUID0gMHg4ODE0XG5cbnZhciBHTF9SR0JBMTZGX0VYVCA9IDB4ODgxQVxudmFyIEdMX1JHQjE2Rl9FWFQgPSAweDg4MUJcblxudmFyIEZPUk1BVF9TSVpFUyA9IFtdXG5cbkZPUk1BVF9TSVpFU1tHTF9SR0JBNF0gPSAyXG5GT1JNQVRfU0laRVNbR0xfUkdCNV9BMV0gPSAyXG5GT1JNQVRfU0laRVNbR0xfUkdCNTY1XSA9IDJcblxuRk9STUFUX1NJWkVTW0dMX0RFUFRIX0NPTVBPTkVOVDE2XSA9IDJcbkZPUk1BVF9TSVpFU1tHTF9TVEVOQ0lMX0lOREVYOF0gPSAxXG5GT1JNQVRfU0laRVNbR0xfREVQVEhfU1RFTkNJTF0gPSA0XG5cbkZPUk1BVF9TSVpFU1tHTF9TUkdCOF9BTFBIQThfRVhUXSA9IDRcbkZPUk1BVF9TSVpFU1tHTF9SR0JBMzJGX0VYVF0gPSAxNlxuRk9STUFUX1NJWkVTW0dMX1JHQkExNkZfRVhUXSA9IDhcbkZPUk1BVF9TSVpFU1tHTF9SR0IxNkZfRVhUXSA9IDZcblxuZnVuY3Rpb24gZ2V0UmVuZGVyYnVmZmVyU2l6ZSAoZm9ybWF0LCB3aWR0aCwgaGVpZ2h0KSB7XG4gIHJldHVybiBGT1JNQVRfU0laRVNbZm9ybWF0XSAqIHdpZHRoICogaGVpZ2h0XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGdsLCBleHRlbnNpb25zLCBsaW1pdHMsIHN0YXRzLCBjb25maWcpIHtcbiAgdmFyIGZvcm1hdFR5cGVzID0ge1xuICAgICdyZ2JhNCc6IEdMX1JHQkE0LFxuICAgICdyZ2I1NjUnOiBHTF9SR0I1NjUsXG4gICAgJ3JnYjUgYTEnOiBHTF9SR0I1X0ExLFxuICAgICdkZXB0aCc6IEdMX0RFUFRIX0NPTVBPTkVOVDE2LFxuICAgICdzdGVuY2lsJzogR0xfU1RFTkNJTF9JTkRFWDgsXG4gICAgJ2RlcHRoIHN0ZW5jaWwnOiBHTF9ERVBUSF9TVEVOQ0lMXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5leHRfc3JnYikge1xuICAgIGZvcm1hdFR5cGVzWydzcmdiYSddID0gR0xfU1JHQjhfQUxQSEE4X0VYVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMuZXh0X2NvbG9yX2J1ZmZlcl9oYWxmX2Zsb2F0KSB7XG4gICAgZm9ybWF0VHlwZXNbJ3JnYmExNmYnXSA9IEdMX1JHQkExNkZfRVhUXG4gICAgZm9ybWF0VHlwZXNbJ3JnYjE2ZiddID0gR0xfUkdCMTZGX0VYVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29sb3JfYnVmZmVyX2Zsb2F0KSB7XG4gICAgZm9ybWF0VHlwZXNbJ3JnYmEzMmYnXSA9IEdMX1JHQkEzMkZfRVhUXG4gIH1cblxuICB2YXIgcmVuZGVyYnVmZmVyQ291bnQgPSAwXG4gIHZhciByZW5kZXJidWZmZXJTZXQgPSB7fVxuXG4gIGZ1bmN0aW9uIFJFR0xSZW5kZXJidWZmZXIgKHJlbmRlcmJ1ZmZlcikge1xuICAgIHRoaXMuaWQgPSByZW5kZXJidWZmZXJDb3VudCsrXG4gICAgdGhpcy5yZWZDb3VudCA9IDFcblxuICAgIHRoaXMucmVuZGVyYnVmZmVyID0gcmVuZGVyYnVmZmVyXG5cbiAgICB0aGlzLmZvcm1hdCA9IEdMX1JHQkE0XG4gICAgdGhpcy53aWR0aCA9IDBcbiAgICB0aGlzLmhlaWdodCA9IDBcblxuICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgdGhpcy5zdGF0cyA9IHtzaXplOiAwfVxuICAgIH1cbiAgfVxuXG4gIFJFR0xSZW5kZXJidWZmZXIucHJvdG90eXBlLmRlY1JlZiA9IGZ1bmN0aW9uICgpIHtcbiAgICBpZiAoLS10aGlzLnJlZkNvdW50IDw9IDApIHtcbiAgICAgIGRlc3Ryb3kodGhpcylcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95IChyYikge1xuICAgIHZhciBoYW5kbGUgPSByYi5yZW5kZXJidWZmZXJcbiAgICBcbiAgICBnbC5iaW5kUmVuZGVyYnVmZmVyKEdMX1JFTkRFUkJVRkZFUiwgbnVsbClcbiAgICBnbC5kZWxldGVSZW5kZXJidWZmZXIoaGFuZGxlKVxuICAgIHJiLnJlbmRlcmJ1ZmZlciA9IG51bGxcbiAgICByYi5yZWZDb3VudCA9IDBcbiAgICBkZWxldGUgcmVuZGVyYnVmZmVyU2V0W3JiLmlkXVxuICAgIHN0YXRzLnJlbmRlcmJ1ZmZlckNvdW50LS1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZVJlbmRlcmJ1ZmZlciAoYSwgYikge1xuICAgIHZhciByZW5kZXJidWZmZXIgPSBuZXcgUkVHTFJlbmRlcmJ1ZmZlcihnbC5jcmVhdGVSZW5kZXJidWZmZXIoKSlcbiAgICByZW5kZXJidWZmZXJTZXRbcmVuZGVyYnVmZmVyLmlkXSA9IHJlbmRlcmJ1ZmZlclxuICAgIHN0YXRzLnJlbmRlcmJ1ZmZlckNvdW50KytcblxuICAgIGZ1bmN0aW9uIHJlZ2xSZW5kZXJidWZmZXIgKGEsIGIpIHtcbiAgICAgIHZhciB3ID0gMFxuICAgICAgdmFyIGggPSAwXG4gICAgICB2YXIgZm9ybWF0ID0gR0xfUkdCQTRcblxuICAgICAgaWYgKHR5cGVvZiBhID09PSAnb2JqZWN0JyAmJiBhKSB7XG4gICAgICAgIHZhciBvcHRpb25zID0gYVxuICAgICAgICBpZiAoJ3NoYXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgdmFyIHNoYXBlID0gb3B0aW9ucy5zaGFwZVxuICAgICAgICAgIFxuICAgICAgICAgIHcgPSBzaGFwZVswXSB8IDBcbiAgICAgICAgICBoID0gc2hhcGVbMV0gfCAwXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWYgKCdyYWRpdXMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIHcgPSBoID0gb3B0aW9ucy5yYWRpdXMgfCAwXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgnd2lkdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIHcgPSBvcHRpb25zLndpZHRoIHwgMFxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoJ2hlaWdodCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgaCA9IG9wdGlvbnMuaGVpZ2h0IHwgMFxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoJ2Zvcm1hdCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIFxuICAgICAgICAgIGZvcm1hdCA9IGZvcm1hdFR5cGVzW29wdGlvbnMuZm9ybWF0XVxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBhID09PSAnbnVtYmVyJykge1xuICAgICAgICB3ID0gYSB8IDBcbiAgICAgICAgaWYgKHR5cGVvZiBiID09PSAnbnVtYmVyJykge1xuICAgICAgICAgIGggPSBiIHwgMFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGggPSB3XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoIWEpIHtcbiAgICAgICAgdyA9IGggPSAxXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBcbiAgICAgIH1cblxuICAgICAgLy8gY2hlY2sgc2hhcGVcbiAgICAgIFxuXG4gICAgICBpZiAodyA9PT0gcmVuZGVyYnVmZmVyLndpZHRoICYmXG4gICAgICAgICAgaCA9PT0gcmVuZGVyYnVmZmVyLmhlaWdodCAmJlxuICAgICAgICAgIGZvcm1hdCA9PT0gcmVuZGVyYnVmZmVyLmZvcm1hdCkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgcmVnbFJlbmRlcmJ1ZmZlci53aWR0aCA9IHJlbmRlcmJ1ZmZlci53aWR0aCA9IHdcbiAgICAgIHJlZ2xSZW5kZXJidWZmZXIuaGVpZ2h0ID0gcmVuZGVyYnVmZmVyLmhlaWdodCA9IGhcbiAgICAgIHJlbmRlcmJ1ZmZlci5mb3JtYXQgPSBmb3JtYXRcblxuICAgICAgZ2wuYmluZFJlbmRlcmJ1ZmZlcihHTF9SRU5ERVJCVUZGRVIsIHJlbmRlcmJ1ZmZlci5yZW5kZXJidWZmZXIpXG4gICAgICBnbC5yZW5kZXJidWZmZXJTdG9yYWdlKEdMX1JFTkRFUkJVRkZFUiwgZm9ybWF0LCB3LCBoKVxuXG4gICAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgICAgcmVuZGVyYnVmZmVyLnN0YXRzLnNpemUgPSBnZXRSZW5kZXJidWZmZXJTaXplKHJlbmRlcmJ1ZmZlci5mb3JtYXQsIHJlbmRlcmJ1ZmZlci53aWR0aCwgcmVuZGVyYnVmZmVyLmhlaWdodClcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJlZ2xSZW5kZXJidWZmZXJcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZXNpemUgKHdfLCBoXykge1xuICAgICAgdmFyIHcgPSB3XyB8IDBcbiAgICAgIHZhciBoID0gKGhfIHwgMCkgfHwgd1xuXG4gICAgICBpZiAodyA9PT0gcmVuZGVyYnVmZmVyLndpZHRoICYmIGggPT09IHJlbmRlcmJ1ZmZlci5oZWlnaHQpIHtcbiAgICAgICAgcmV0dXJuIHJlZ2xSZW5kZXJidWZmZXJcbiAgICAgIH1cblxuICAgICAgLy8gY2hlY2sgc2hhcGVcbiAgICAgIFxuXG4gICAgICByZWdsUmVuZGVyYnVmZmVyLndpZHRoID0gcmVuZGVyYnVmZmVyLndpZHRoID0gd1xuICAgICAgcmVnbFJlbmRlcmJ1ZmZlci5oZWlnaHQgPSByZW5kZXJidWZmZXIuaGVpZ2h0ID0gaFxuXG4gICAgICBnbC5iaW5kUmVuZGVyYnVmZmVyKEdMX1JFTkRFUkJVRkZFUiwgcmVuZGVyYnVmZmVyLnJlbmRlcmJ1ZmZlcilcbiAgICAgIGdsLnJlbmRlcmJ1ZmZlclN0b3JhZ2UoR0xfUkVOREVSQlVGRkVSLCByZW5kZXJidWZmZXIuZm9ybWF0LCB3LCBoKVxuXG4gICAgICAvLyBhbHNvLCByZWNvbXB1dGUgc2l6ZS5cbiAgICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgICByZW5kZXJidWZmZXIuc3RhdHMuc2l6ZSA9IGdldFJlbmRlcmJ1ZmZlclNpemUoXG4gICAgICAgICAgcmVuZGVyYnVmZmVyLmZvcm1hdCwgcmVuZGVyYnVmZmVyLndpZHRoLCByZW5kZXJidWZmZXIuaGVpZ2h0KVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmVnbFJlbmRlcmJ1ZmZlclxuICAgIH1cblxuICAgIHJlZ2xSZW5kZXJidWZmZXIoYSwgYilcblxuICAgIHJlZ2xSZW5kZXJidWZmZXIucmVzaXplID0gcmVzaXplXG4gICAgcmVnbFJlbmRlcmJ1ZmZlci5fcmVnbFR5cGUgPSAncmVuZGVyYnVmZmVyJ1xuICAgIHJlZ2xSZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlciA9IHJlbmRlcmJ1ZmZlclxuICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgcmVnbFJlbmRlcmJ1ZmZlci5zdGF0cyA9IHJlbmRlcmJ1ZmZlci5zdGF0c1xuICAgIH1cbiAgICByZWdsUmVuZGVyYnVmZmVyLmRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7XG4gICAgICByZW5kZXJidWZmZXIuZGVjUmVmKClcbiAgICB9XG5cbiAgICByZXR1cm4gcmVnbFJlbmRlcmJ1ZmZlclxuICB9XG5cbiAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgc3RhdHMuZ2V0VG90YWxSZW5kZXJidWZmZXJTaXplID0gZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIHRvdGFsID0gMFxuICAgICAgT2JqZWN0LmtleXMocmVuZGVyYnVmZmVyU2V0KS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgdG90YWwgKz0gcmVuZGVyYnVmZmVyU2V0W2tleV0uc3RhdHMuc2l6ZVxuICAgICAgfSlcbiAgICAgIHJldHVybiB0b3RhbFxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY3JlYXRlOiBjcmVhdGVSZW5kZXJidWZmZXIsXG4gICAgY2xlYXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhbHVlcyhyZW5kZXJidWZmZXJTZXQpLmZvckVhY2goZGVzdHJveSlcbiAgICB9XG4gIH1cbn1cbiIsIlxudmFyIHZhbHVlcyA9IHJlcXVpcmUoJy4vdXRpbC92YWx1ZXMnKVxuXG52YXIgR0xfRlJBR01FTlRfU0hBREVSID0gMzU2MzJcbnZhciBHTF9WRVJURVhfU0hBREVSID0gMzU2MzNcblxudmFyIEdMX0FDVElWRV9VTklGT1JNUyA9IDB4OEI4NlxudmFyIEdMX0FDVElWRV9BVFRSSUJVVEVTID0gMHg4Qjg5XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcFNoYWRlclN0YXRlIChnbCwgc3RyaW5nU3RvcmUsIHN0YXRzLCBjb25maWcpIHtcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIGdsc2wgY29tcGlsYXRpb24gYW5kIGxpbmtpbmdcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIHZhciBmcmFnU2hhZGVycyA9IHt9XG4gIHZhciB2ZXJ0U2hhZGVycyA9IHt9XG5cbiAgZnVuY3Rpb24gQWN0aXZlSW5mbyAobmFtZSwgaWQsIGxvY2F0aW9uLCBpbmZvKSB7XG4gICAgdGhpcy5uYW1lID0gbmFtZVxuICAgIHRoaXMuaWQgPSBpZFxuICAgIHRoaXMubG9jYXRpb24gPSBsb2NhdGlvblxuICAgIHRoaXMuaW5mbyA9IGluZm9cbiAgfVxuXG4gIGZ1bmN0aW9uIGluc2VydEFjdGl2ZUluZm8gKGxpc3QsIGluZm8pIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxpc3QubGVuZ3RoOyArK2kpIHtcbiAgICAgIGlmIChsaXN0W2ldLmlkID09PSBpbmZvLmlkKSB7XG4gICAgICAgIGxpc3RbaV0ubG9jYXRpb24gPSBpbmZvLmxvY2F0aW9uXG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgIH1cbiAgICBsaXN0LnB1c2goaW5mbylcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldFNoYWRlciAodHlwZSwgaWQsIGNvbW1hbmQpIHtcbiAgICB2YXIgY2FjaGUgPSB0eXBlID09PSBHTF9GUkFHTUVOVF9TSEFERVIgPyBmcmFnU2hhZGVycyA6IHZlcnRTaGFkZXJzXG4gICAgdmFyIHNoYWRlciA9IGNhY2hlW2lkXVxuXG4gICAgaWYgKCFzaGFkZXIpIHtcbiAgICAgIHZhciBzb3VyY2UgPSBzdHJpbmdTdG9yZS5zdHIoaWQpXG4gICAgICBzaGFkZXIgPSBnbC5jcmVhdGVTaGFkZXIodHlwZSlcbiAgICAgIGdsLnNoYWRlclNvdXJjZShzaGFkZXIsIHNvdXJjZSlcbiAgICAgIGdsLmNvbXBpbGVTaGFkZXIoc2hhZGVyKVxuICAgICAgXG4gICAgICBjYWNoZVtpZF0gPSBzaGFkZXJcbiAgICB9XG5cbiAgICByZXR1cm4gc2hhZGVyXG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gcHJvZ3JhbSBsaW5raW5nXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICB2YXIgcHJvZ3JhbUNhY2hlID0ge31cbiAgdmFyIHByb2dyYW1MaXN0ID0gW11cblxuICB2YXIgUFJPR1JBTV9DT1VOVEVSID0gMFxuXG4gIGZ1bmN0aW9uIFJFR0xQcm9ncmFtIChmcmFnSWQsIHZlcnRJZCkge1xuICAgIHRoaXMuaWQgPSBQUk9HUkFNX0NPVU5URVIrK1xuICAgIHRoaXMuZnJhZ0lkID0gZnJhZ0lkXG4gICAgdGhpcy52ZXJ0SWQgPSB2ZXJ0SWRcbiAgICB0aGlzLnByb2dyYW0gPSBudWxsXG4gICAgdGhpcy51bmlmb3JtcyA9IFtdXG4gICAgdGhpcy5hdHRyaWJ1dGVzID0gW11cblxuICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgdGhpcy5zdGF0cyA9IHtcbiAgICAgICAgdW5pZm9ybXNDb3VudDogMCxcbiAgICAgICAgYXR0cmlidXRlc0NvdW50OiAwXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gbGlua1Byb2dyYW0gKGRlc2MsIGNvbW1hbmQpIHtcbiAgICB2YXIgaSwgaW5mb1xuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGNvbXBpbGUgJiBsaW5rXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHZhciBmcmFnU2hhZGVyID0gZ2V0U2hhZGVyKEdMX0ZSQUdNRU5UX1NIQURFUiwgZGVzYy5mcmFnSWQpXG4gICAgdmFyIHZlcnRTaGFkZXIgPSBnZXRTaGFkZXIoR0xfVkVSVEVYX1NIQURFUiwgZGVzYy52ZXJ0SWQpXG5cbiAgICB2YXIgcHJvZ3JhbSA9IGRlc2MucHJvZ3JhbSA9IGdsLmNyZWF0ZVByb2dyYW0oKVxuICAgIGdsLmF0dGFjaFNoYWRlcihwcm9ncmFtLCBmcmFnU2hhZGVyKVxuICAgIGdsLmF0dGFjaFNoYWRlcihwcm9ncmFtLCB2ZXJ0U2hhZGVyKVxuICAgIGdsLmxpbmtQcm9ncmFtKHByb2dyYW0pXG4gICAgXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gZ3JhYiB1bmlmb3Jtc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICB2YXIgbnVtVW5pZm9ybXMgPSBnbC5nZXRQcm9ncmFtUGFyYW1ldGVyKHByb2dyYW0sIEdMX0FDVElWRV9VTklGT1JNUylcbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgIGRlc2Muc3RhdHMudW5pZm9ybXNDb3VudCA9IG51bVVuaWZvcm1zXG4gICAgfVxuICAgIHZhciB1bmlmb3JtcyA9IGRlc2MudW5pZm9ybXNcbiAgICBmb3IgKGkgPSAwOyBpIDwgbnVtVW5pZm9ybXM7ICsraSkge1xuICAgICAgaW5mbyA9IGdsLmdldEFjdGl2ZVVuaWZvcm0ocHJvZ3JhbSwgaSlcbiAgICAgIGlmIChpbmZvKSB7XG4gICAgICAgIGlmIChpbmZvLnNpemUgPiAxKSB7XG4gICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBpbmZvLnNpemU7ICsraikge1xuICAgICAgICAgICAgdmFyIG5hbWUgPSBpbmZvLm5hbWUucmVwbGFjZSgnWzBdJywgJ1snICsgaiArICddJylcbiAgICAgICAgICAgIGluc2VydEFjdGl2ZUluZm8odW5pZm9ybXMsIG5ldyBBY3RpdmVJbmZvKFxuICAgICAgICAgICAgICBuYW1lLFxuICAgICAgICAgICAgICBzdHJpbmdTdG9yZS5pZChuYW1lKSxcbiAgICAgICAgICAgICAgZ2wuZ2V0VW5pZm9ybUxvY2F0aW9uKHByb2dyYW0sIG5hbWUpLFxuICAgICAgICAgICAgICBpbmZvKSlcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaW5zZXJ0QWN0aXZlSW5mbyh1bmlmb3JtcywgbmV3IEFjdGl2ZUluZm8oXG4gICAgICAgICAgICBpbmZvLm5hbWUsXG4gICAgICAgICAgICBzdHJpbmdTdG9yZS5pZChpbmZvLm5hbWUpLFxuICAgICAgICAgICAgZ2wuZ2V0VW5pZm9ybUxvY2F0aW9uKHByb2dyYW0sIGluZm8ubmFtZSksXG4gICAgICAgICAgICBpbmZvKSlcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBncmFiIGF0dHJpYnV0ZXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgdmFyIG51bUF0dHJpYnV0ZXMgPSBnbC5nZXRQcm9ncmFtUGFyYW1ldGVyKHByb2dyYW0sIEdMX0FDVElWRV9BVFRSSUJVVEVTKVxuICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgZGVzYy5zdGF0cy5hdHRyaWJ1dGVzQ291bnQgPSBudW1BdHRyaWJ1dGVzXG4gICAgfVxuXG4gICAgdmFyIGF0dHJpYnV0ZXMgPSBkZXNjLmF0dHJpYnV0ZXNcbiAgICBmb3IgKGkgPSAwOyBpIDwgbnVtQXR0cmlidXRlczsgKytpKSB7XG4gICAgICBpbmZvID0gZ2wuZ2V0QWN0aXZlQXR0cmliKHByb2dyYW0sIGkpXG4gICAgICBpZiAoaW5mbykge1xuICAgICAgICBpbnNlcnRBY3RpdmVJbmZvKGF0dHJpYnV0ZXMsIG5ldyBBY3RpdmVJbmZvKFxuICAgICAgICAgIGluZm8ubmFtZSxcbiAgICAgICAgICBzdHJpbmdTdG9yZS5pZChpbmZvLm5hbWUpLFxuICAgICAgICAgIGdsLmdldEF0dHJpYkxvY2F0aW9uKHByb2dyYW0sIGluZm8ubmFtZSksXG4gICAgICAgICAgaW5mbykpXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgc3RhdHMuZ2V0TWF4VW5pZm9ybXNDb3VudCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBtID0gMFxuICAgICAgcHJvZ3JhbUxpc3QuZm9yRWFjaChmdW5jdGlvbiAoZGVzYykge1xuICAgICAgICBpZiAoZGVzYy5zdGF0cy51bmlmb3Jtc0NvdW50ID4gbSkge1xuICAgICAgICAgIG0gPSBkZXNjLnN0YXRzLnVuaWZvcm1zQ291bnRcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIHJldHVybiBtXG4gICAgfVxuXG4gICAgc3RhdHMuZ2V0TWF4QXR0cmlidXRlc0NvdW50ID0gZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIG0gPSAwXG4gICAgICBwcm9ncmFtTGlzdC5mb3JFYWNoKGZ1bmN0aW9uIChkZXNjKSB7XG4gICAgICAgIGlmIChkZXNjLnN0YXRzLmF0dHJpYnV0ZXNDb3VudCA+IG0pIHtcbiAgICAgICAgICBtID0gZGVzYy5zdGF0cy5hdHRyaWJ1dGVzQ291bnRcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIHJldHVybiBtXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjbGVhcjogZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIGRlbGV0ZVNoYWRlciA9IGdsLmRlbGV0ZVNoYWRlci5iaW5kKGdsKVxuICAgICAgdmFsdWVzKGZyYWdTaGFkZXJzKS5mb3JFYWNoKGRlbGV0ZVNoYWRlcilcbiAgICAgIGZyYWdTaGFkZXJzID0ge31cbiAgICAgIHZhbHVlcyh2ZXJ0U2hhZGVycykuZm9yRWFjaChkZWxldGVTaGFkZXIpXG4gICAgICB2ZXJ0U2hhZGVycyA9IHt9XG5cbiAgICAgIHByb2dyYW1MaXN0LmZvckVhY2goZnVuY3Rpb24gKGRlc2MpIHtcbiAgICAgICAgZ2wuZGVsZXRlUHJvZ3JhbShkZXNjLnByb2dyYW0pXG4gICAgICB9KVxuICAgICAgcHJvZ3JhbUxpc3QubGVuZ3RoID0gMFxuICAgICAgcHJvZ3JhbUNhY2hlID0ge31cblxuICAgICAgc3RhdHMuc2hhZGVyQ291bnQgPSAwXG4gICAgfSxcblxuICAgIHByb2dyYW06IGZ1bmN0aW9uICh2ZXJ0SWQsIGZyYWdJZCwgY29tbWFuZCkge1xuICAgICAgXG4gICAgICBcblxuICAgICAgc3RhdHMuc2hhZGVyQ291bnQrK1xuXG4gICAgICB2YXIgY2FjaGUgPSBwcm9ncmFtQ2FjaGVbZnJhZ0lkXVxuICAgICAgaWYgKCFjYWNoZSkge1xuICAgICAgICBjYWNoZSA9IHByb2dyYW1DYWNoZVtmcmFnSWRdID0ge31cbiAgICAgIH1cbiAgICAgIHZhciBwcm9ncmFtID0gY2FjaGVbdmVydElkXVxuICAgICAgaWYgKCFwcm9ncmFtKSB7XG4gICAgICAgIHByb2dyYW0gPSBuZXcgUkVHTFByb2dyYW0oZnJhZ0lkLCB2ZXJ0SWQpXG4gICAgICAgIGxpbmtQcm9ncmFtKHByb2dyYW0sIGNvbW1hbmQpXG4gICAgICAgIGNhY2hlW3ZlcnRJZF0gPSBwcm9ncmFtXG4gICAgICAgIHByb2dyYW1MaXN0LnB1c2gocHJvZ3JhbSlcbiAgICAgIH1cbiAgICAgIHJldHVybiBwcm9ncmFtXG4gICAgfSxcblxuICAgIHNoYWRlcjogZ2V0U2hhZGVyLFxuXG4gICAgZnJhZzogbnVsbCxcbiAgICB2ZXJ0OiBudWxsXG4gIH1cbn1cbiIsIlxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBzdGF0cyAoKSB7XG4gIHJldHVybiB7XG4gICAgYnVmZmVyQ291bnQ6IDAsXG4gICAgZWxlbWVudHNDb3VudDogMCxcbiAgICBmcmFtZWJ1ZmZlckNvdW50OiAwLFxuICAgIHNoYWRlckNvdW50OiAwLFxuICAgIHRleHR1cmVDb3VudDogMCxcbiAgICBjdWJlQ291bnQ6IDAsXG4gICAgcmVuZGVyYnVmZmVyQ291bnQ6IDAsXG5cbiAgICBtYXhUZXh0dXJlVW5pdHM6IDBcbiAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjcmVhdGVTdHJpbmdTdG9yZSAoKSB7XG4gIHZhciBzdHJpbmdJZHMgPSB7Jyc6IDB9XG4gIHZhciBzdHJpbmdWYWx1ZXMgPSBbJyddXG4gIHJldHVybiB7XG4gICAgaWQ6IGZ1bmN0aW9uIChzdHIpIHtcbiAgICAgIHZhciByZXN1bHQgPSBzdHJpbmdJZHNbc3RyXVxuICAgICAgaWYgKHJlc3VsdCkge1xuICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICB9XG4gICAgICByZXN1bHQgPSBzdHJpbmdJZHNbc3RyXSA9IHN0cmluZ1ZhbHVlcy5sZW5ndGhcbiAgICAgIHN0cmluZ1ZhbHVlcy5wdXNoKHN0cilcbiAgICAgIHJldHVybiByZXN1bHRcbiAgICB9LFxuXG4gICAgc3RyOiBmdW5jdGlvbiAoaWQpIHtcbiAgICAgIHJldHVybiBzdHJpbmdWYWx1ZXNbaWRdXG4gICAgfVxuICB9XG59XG4iLCJcbnZhciBleHRlbmQgPSByZXF1aXJlKCcuL3V0aWwvZXh0ZW5kJylcbnZhciB2YWx1ZXMgPSByZXF1aXJlKCcuL3V0aWwvdmFsdWVzJylcbnZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL3V0aWwvaXMtdHlwZWQtYXJyYXknKVxudmFyIGlzTkRBcnJheUxpa2UgPSByZXF1aXJlKCcuL3V0aWwvaXMtbmRhcnJheScpXG52YXIgcG9vbCA9IHJlcXVpcmUoJy4vdXRpbC9wb29sJylcbnZhciBjb252ZXJ0VG9IYWxmRmxvYXQgPSByZXF1aXJlKCcuL3V0aWwvdG8taGFsZi1mbG9hdCcpXG52YXIgaXNBcnJheUxpa2UgPSByZXF1aXJlKCcuL3V0aWwvaXMtYXJyYXktbGlrZScpXG5cbnZhciBkdHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9hcnJheXR5cGVzLmpzb24nKVxudmFyIGFycmF5VHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9hcnJheXR5cGVzLmpzb24nKVxuXG52YXIgR0xfQ09NUFJFU1NFRF9URVhUVVJFX0ZPUk1BVFMgPSAweDg2QTNcblxudmFyIEdMX1RFWFRVUkVfMkQgPSAweDBERTFcbnZhciBHTF9URVhUVVJFX0NVQkVfTUFQID0gMHg4NTEzXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YID0gMHg4NTE1XG5cbnZhciBHTF9SR0JBID0gMHgxOTA4XG52YXIgR0xfQUxQSEEgPSAweDE5MDZcbnZhciBHTF9SR0IgPSAweDE5MDdcbnZhciBHTF9MVU1JTkFOQ0UgPSAweDE5MDlcbnZhciBHTF9MVU1JTkFOQ0VfQUxQSEEgPSAweDE5MEFcblxudmFyIEdMX1JHQkE0ID0gMHg4MDU2XG52YXIgR0xfUkdCNV9BMSA9IDB4ODA1N1xudmFyIEdMX1JHQjU2NSA9IDB4OEQ2MlxuXG52YXIgR0xfVU5TSUdORURfU0hPUlRfNF80XzRfNCA9IDB4ODAzM1xudmFyIEdMX1VOU0lHTkVEX1NIT1JUXzVfNV81XzEgPSAweDgwMzRcbnZhciBHTF9VTlNJR05FRF9TSE9SVF81XzZfNSA9IDB4ODM2M1xudmFyIEdMX1VOU0lHTkVEX0lOVF8yNF84X1dFQkdMID0gMHg4NEZBXG5cbnZhciBHTF9ERVBUSF9DT01QT05FTlQgPSAweDE5MDJcbnZhciBHTF9ERVBUSF9TVEVOQ0lMID0gMHg4NEY5XG5cbnZhciBHTF9TUkdCX0VYVCA9IDB4OEM0MFxudmFyIEdMX1NSR0JfQUxQSEFfRVhUID0gMHg4QzQyXG5cbnZhciBHTF9IQUxGX0ZMT0FUX09FUyA9IDB4OEQ2MVxuXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfUzNUQ19EWFQxX0VYVCA9IDB4ODNGMFxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDFfRVhUID0gMHg4M0YxXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUM19FWFQgPSAweDgzRjJcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQ1X0VYVCA9IDB4ODNGM1xuXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfQVRDX1dFQkdMID0gMHg4QzkyXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19FWFBMSUNJVF9BTFBIQV9XRUJHTCA9IDB4OEM5M1xudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9BVENfSU5URVJQT0xBVEVEX0FMUEhBX1dFQkdMID0gMHg4N0VFXG5cbnZhciBHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ180QlBQVjFfSU1HID0gMHg4QzAwXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfUFZSVENfMkJQUFYxX0lNRyA9IDB4OEMwMVxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9QVlJUQ180QlBQVjFfSU1HID0gMHg4QzAyXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1BWUlRDXzJCUFBWMV9JTUcgPSAweDhDMDNcblxudmFyIEdMX0NPTVBSRVNTRURfUkdCX0VUQzFfV0VCR0wgPSAweDhENjRcblxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSAweDE0MDFcbnZhciBHTF9VTlNJR05FRF9TSE9SVCA9IDB4MTQwM1xudmFyIEdMX1VOU0lHTkVEX0lOVCA9IDB4MTQwNVxudmFyIEdMX0ZMT0FUID0gMHgxNDA2XG5cbnZhciBHTF9URVhUVVJFX1dSQVBfUyA9IDB4MjgwMlxudmFyIEdMX1RFWFRVUkVfV1JBUF9UID0gMHgyODAzXG5cbnZhciBHTF9SRVBFQVQgPSAweDI5MDFcbnZhciBHTF9DTEFNUF9UT19FREdFID0gMHg4MTJGXG52YXIgR0xfTUlSUk9SRURfUkVQRUFUID0gMHg4MzcwXG5cbnZhciBHTF9URVhUVVJFX01BR19GSUxURVIgPSAweDI4MDBcbnZhciBHTF9URVhUVVJFX01JTl9GSUxURVIgPSAweDI4MDFcblxudmFyIEdMX05FQVJFU1QgPSAweDI2MDBcbnZhciBHTF9MSU5FQVIgPSAweDI2MDFcbnZhciBHTF9ORUFSRVNUX01JUE1BUF9ORUFSRVNUID0gMHgyNzAwXG52YXIgR0xfTElORUFSX01JUE1BUF9ORUFSRVNUID0gMHgyNzAxXG52YXIgR0xfTkVBUkVTVF9NSVBNQVBfTElORUFSID0gMHgyNzAyXG52YXIgR0xfTElORUFSX01JUE1BUF9MSU5FQVIgPSAweDI3MDNcblxudmFyIEdMX0dFTkVSQVRFX01JUE1BUF9ISU5UID0gMHg4MTkyXG52YXIgR0xfRE9OVF9DQVJFID0gMHgxMTAwXG52YXIgR0xfRkFTVEVTVCA9IDB4MTEwMVxudmFyIEdMX05JQ0VTVCA9IDB4MTEwMlxuXG52YXIgR0xfVEVYVFVSRV9NQVhfQU5JU09UUk9QWV9FWFQgPSAweDg0RkVcblxudmFyIEdMX1VOUEFDS19BTElHTk1FTlQgPSAweDBDRjVcbnZhciBHTF9VTlBBQ0tfRkxJUF9ZX1dFQkdMID0gMHg5MjQwXG52YXIgR0xfVU5QQUNLX1BSRU1VTFRJUExZX0FMUEhBX1dFQkdMID0gMHg5MjQxXG52YXIgR0xfVU5QQUNLX0NPTE9SU1BBQ0VfQ09OVkVSU0lPTl9XRUJHTCA9IDB4OTI0M1xuXG52YXIgR0xfQlJPV1NFUl9ERUZBVUxUX1dFQkdMID0gMHg5MjQ0XG5cbnZhciBHTF9URVhUVVJFMCA9IDB4ODRDMFxuXG52YXIgTUlQTUFQX0ZJTFRFUlMgPSBbXG4gIEdMX05FQVJFU1RfTUlQTUFQX05FQVJFU1QsXG4gIEdMX05FQVJFU1RfTUlQTUFQX0xJTkVBUixcbiAgR0xfTElORUFSX01JUE1BUF9ORUFSRVNULFxuICBHTF9MSU5FQVJfTUlQTUFQX0xJTkVBUlxuXVxuXG52YXIgQ0hBTk5FTFNfRk9STUFUID0gW1xuICAwLFxuICBHTF9MVU1JTkFOQ0UsXG4gIEdMX0xVTUlOQU5DRV9BTFBIQSxcbiAgR0xfUkdCLFxuICBHTF9SR0JBXG5dXG5cbnZhciBGT1JNQVRfQ0hBTk5FTFMgPSB7fVxuRk9STUFUX0NIQU5ORUxTW0dMX0xVTUlOQU5DRV0gPVxuRk9STUFUX0NIQU5ORUxTW0dMX0FMUEhBXSA9XG5GT1JNQVRfQ0hBTk5FTFNbR0xfREVQVEhfQ09NUE9ORU5UXSA9IDFcbkZPUk1BVF9DSEFOTkVMU1tHTF9ERVBUSF9TVEVOQ0lMXSA9XG5GT1JNQVRfQ0hBTk5FTFNbR0xfTFVNSU5BTkNFX0FMUEhBXSA9IDJcbkZPUk1BVF9DSEFOTkVMU1tHTF9SR0JdID1cbkZPUk1BVF9DSEFOTkVMU1tHTF9TUkdCX0VYVF0gPSAzXG5GT1JNQVRfQ0hBTk5FTFNbR0xfUkdCQV0gPVxuRk9STUFUX0NIQU5ORUxTW0dMX1NSR0JfQUxQSEFfRVhUXSA9IDRcblxudmFyIGZvcm1hdFR5cGVzID0ge31cbmZvcm1hdFR5cGVzW0dMX1JHQkE0XSA9IEdMX1VOU0lHTkVEX1NIT1JUXzRfNF80XzRcbmZvcm1hdFR5cGVzW0dMX1JHQjU2NV0gPSBHTF9VTlNJR05FRF9TSE9SVF81XzZfNVxuZm9ybWF0VHlwZXNbR0xfUkdCNV9BMV0gPSBHTF9VTlNJR05FRF9TSE9SVF81XzVfNV8xXG5mb3JtYXRUeXBlc1tHTF9ERVBUSF9DT01QT05FTlRdID0gR0xfVU5TSUdORURfSU5UXG5mb3JtYXRUeXBlc1tHTF9ERVBUSF9TVEVOQ0lMXSA9IEdMX1VOU0lHTkVEX0lOVF8yNF84X1dFQkdMXG5cbmZ1bmN0aW9uIG9iamVjdE5hbWUgKHN0cikge1xuICByZXR1cm4gJ1tvYmplY3QgJyArIHN0ciArICddJ1xufVxuXG52YXIgQ0FOVkFTX0NMQVNTID0gb2JqZWN0TmFtZSgnSFRNTENhbnZhc0VsZW1lbnQnKVxudmFyIENPTlRFWFQyRF9DTEFTUyA9IG9iamVjdE5hbWUoJ0NhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCcpXG52YXIgSU1BR0VfQ0xBU1MgPSBvYmplY3ROYW1lKCdIVE1MSW1hZ2VFbGVtZW50JylcbnZhciBWSURFT19DTEFTUyA9IG9iamVjdE5hbWUoJ0hUTUxWaWRlb0VsZW1lbnQnKVxuXG52YXIgUElYRUxfQ0xBU1NFUyA9IE9iamVjdC5rZXlzKGR0eXBlcykuY29uY2F0KFtcbiAgQ0FOVkFTX0NMQVNTLFxuICBDT05URVhUMkRfQ0xBU1MsXG4gIElNQUdFX0NMQVNTLFxuICBWSURFT19DTEFTU1xuXSlcblxuLy8gZm9yIGV2ZXJ5IHRleHR1cmUgdHlwZSwgc3RvcmVcbi8vIHRoZSBzaXplIGluIGJ5dGVzLlxudmFyIFRZUEVfU0laRVMgPSBbXVxuVFlQRV9TSVpFU1tHTF9VTlNJR05FRF9CWVRFXSA9IDFcblRZUEVfU0laRVNbR0xfRkxPQVRdID0gNFxuVFlQRV9TSVpFU1tHTF9IQUxGX0ZMT0FUX09FU10gPSAyXG5cblRZUEVfU0laRVNbR0xfVU5TSUdORURfU0hPUlRdID0gMlxuVFlQRV9TSVpFU1tHTF9VTlNJR05FRF9JTlRdID0gNFxuXG52YXIgRk9STUFUX1NJWkVTX1NQRUNJQUwgPSBbXVxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfUkdCQTRdID0gMlxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfUkdCNV9BMV0gPSAyXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9SR0I1NjVdID0gMlxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfREVQVEhfU1RFTkNJTF0gPSA0XG5cbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCX1MzVENfRFhUMV9FWFRdID0gMC41XG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQxX0VYVF0gPSAwLjVcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDNfRVhUXSA9IDFcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDVfRVhUXSA9IDFcblxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JfQVRDX1dFQkdMXSA9IDAuNVxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19FWFBMSUNJVF9BTFBIQV9XRUJHTF0gPSAxXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQkFfQVRDX0lOVEVSUE9MQVRFRF9BTFBIQV9XRUJHTF0gPSAxXG5cbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCX1BWUlRDXzRCUFBWMV9JTUddID0gMC41XG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ18yQlBQVjFfSU1HXSA9IDAuMjVcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCQV9QVlJUQ180QlBQVjFfSU1HXSA9IDAuNVxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JBX1BWUlRDXzJCUFBWMV9JTUddID0gMC4yNVxuXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQl9FVEMxX1dFQkdMXSA9IDAuNVxuXG5mdW5jdGlvbiBpc051bWVyaWNBcnJheSAoYXJyKSB7XG4gIHJldHVybiAoXG4gICAgQXJyYXkuaXNBcnJheShhcnIpICYmXG4gICAgKGFyci5sZW5ndGggPT09IDAgfHxcbiAgICB0eXBlb2YgYXJyWzBdID09PSAnbnVtYmVyJykpXG59XG5cbmZ1bmN0aW9uIGlzUmVjdEFycmF5IChhcnIpIHtcbiAgaWYgKCFBcnJheS5pc0FycmF5KGFycikpIHtcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxuICB2YXIgd2lkdGggPSBhcnIubGVuZ3RoXG4gIGlmICh3aWR0aCA9PT0gMCB8fCAhaXNBcnJheUxpa2UoYXJyWzBdKSkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG4gIHJldHVybiB0cnVlXG59XG5cbmZ1bmN0aW9uIGNsYXNzU3RyaW5nICh4KSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoeClcbn1cblxuZnVuY3Rpb24gaXNDYW52YXNFbGVtZW50IChvYmplY3QpIHtcbiAgcmV0dXJuIGNsYXNzU3RyaW5nKG9iamVjdCkgPT09IENBTlZBU19DTEFTU1xufVxuXG5mdW5jdGlvbiBpc0NvbnRleHQyRCAob2JqZWN0KSB7XG4gIHJldHVybiBjbGFzc1N0cmluZyhvYmplY3QpID09PSBDT05URVhUMkRfQ0xBU1Ncbn1cblxuZnVuY3Rpb24gaXNJbWFnZUVsZW1lbnQgKG9iamVjdCkge1xuICByZXR1cm4gY2xhc3NTdHJpbmcob2JqZWN0KSA9PT0gSU1BR0VfQ0xBU1Ncbn1cblxuZnVuY3Rpb24gaXNWaWRlb0VsZW1lbnQgKG9iamVjdCkge1xuICByZXR1cm4gY2xhc3NTdHJpbmcob2JqZWN0KSA9PT0gVklERU9fQ0xBU1Ncbn1cblxuZnVuY3Rpb24gaXNQaXhlbERhdGEgKG9iamVjdCkge1xuICBpZiAoIW9iamVjdCkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG4gIHZhciBjbGFzc05hbWUgPSBjbGFzc1N0cmluZyhvYmplY3QpXG4gIGlmIChQSVhFTF9DTEFTU0VTLmluZGV4T2YoY2xhc3NOYW1lKSA+PSAwKSB7XG4gICAgcmV0dXJuIHRydWVcbiAgfVxuICByZXR1cm4gKFxuICAgIGlzTnVtZXJpY0FycmF5KG9iamVjdCkgfHxcbiAgICBpc1JlY3RBcnJheShvYmplY3QpIHx8XG4gICAgaXNOREFycmF5TGlrZShvYmplY3QpKVxufVxuXG5mdW5jdGlvbiB0eXBlZEFycmF5Q29kZSAoZGF0YSkge1xuICByZXR1cm4gYXJyYXlUeXBlc1tPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoZGF0YSldIHwgMFxufVxuXG5mdW5jdGlvbiBjb252ZXJ0RGF0YSAocmVzdWx0LCBkYXRhKSB7XG4gIHZhciBuID0gcmVzdWx0LndpZHRoICogcmVzdWx0LmhlaWdodCAqIHJlc3VsdC5jaGFubmVsc1xuICBcblxuICBzd2l0Y2ggKHJlc3VsdC50eXBlKSB7XG4gICAgY2FzZSBHTF9VTlNJR05FRF9CWVRFOlxuICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlQ6XG4gICAgY2FzZSBHTF9VTlNJR05FRF9JTlQ6XG4gICAgY2FzZSBHTF9GTE9BVDpcbiAgICAgIHZhciBjb252ZXJ0ZWQgPSBwb29sLmFsbG9jVHlwZShyZXN1bHQudHlwZSwgbilcbiAgICAgIGNvbnZlcnRlZC5zZXQoZGF0YSlcbiAgICAgIHJlc3VsdC5kYXRhID0gY29udmVydGVkXG4gICAgICBicmVha1xuXG4gICAgY2FzZSBHTF9IQUxGX0ZMT0FUX09FUzpcbiAgICAgIHJlc3VsdC5kYXRhID0gY29udmVydFRvSGFsZkZsb2F0KGRhdGEpXG4gICAgICBicmVha1xuXG4gICAgZGVmYXVsdDpcbiAgICAgIFxuICB9XG59XG5cbmZ1bmN0aW9uIHByZUNvbnZlcnQgKGltYWdlLCBuKSB7XG4gIHJldHVybiBwb29sLmFsbG9jVHlwZShcbiAgICBpbWFnZS50eXBlID09PSBHTF9IQUxGX0ZMT0FUX09FU1xuICAgICAgPyBHTF9GTE9BVFxuICAgICAgOiBpbWFnZS50eXBlLCBuKVxufVxuXG5mdW5jdGlvbiBwb3N0Q29udmVydCAoaW1hZ2UsIGRhdGEpIHtcbiAgaWYgKGltYWdlLnR5cGUgPT09IEdMX0hBTEZfRkxPQVRfT0VTKSB7XG4gICAgaW1hZ2UuZGF0YSA9IGNvbnZlcnRUb0hhbGZGbG9hdChkYXRhKVxuICAgIHBvb2wuZnJlZVR5cGUoZGF0YSlcbiAgfSBlbHNlIHtcbiAgICBpbWFnZS5kYXRhID0gZGF0YVxuICB9XG59XG5cbmZ1bmN0aW9uIHRyYW5zcG9zZURhdGEgKGltYWdlLCBhcnJheSwgc3RyaWRlWCwgc3RyaWRlWSwgc3RyaWRlQywgb2Zmc2V0KSB7XG4gIHZhciB3ID0gaW1hZ2Uud2lkdGhcbiAgdmFyIGggPSBpbWFnZS5oZWlnaHRcbiAgdmFyIGMgPSBpbWFnZS5jaGFubmVsc1xuICB2YXIgbiA9IHcgKiBoICogY1xuICB2YXIgZGF0YSA9IHByZUNvbnZlcnQoaW1hZ2UsIG4pXG5cbiAgdmFyIHAgPSAwXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgaDsgKytpKSB7XG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCB3OyArK2opIHtcbiAgICAgIGZvciAodmFyIGsgPSAwOyBrIDwgYzsgKytrKSB7XG4gICAgICAgIGRhdGFbcCsrXSA9IGFycmF5W3N0cmlkZVggKiBqICsgc3RyaWRlWSAqIGkgKyBzdHJpZGVDICogayArIG9mZnNldF1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwb3N0Q29udmVydChpbWFnZSwgZGF0YSlcbn1cblxuZnVuY3Rpb24gZmxhdHRlbjJERGF0YSAoaW1hZ2UsIGFycmF5LCB3LCBoKSB7XG4gIHZhciBuID0gdyAqIGhcbiAgdmFyIGRhdGEgPSBwcmVDb252ZXJ0KGltYWdlLCBuKVxuXG4gIHZhciBwID0gMFxuICBmb3IgKHZhciBpID0gMDsgaSA8IGg7ICsraSkge1xuICAgIHZhciByb3cgPSBhcnJheVtpXVxuICAgIGZvciAodmFyIGogPSAwOyBqIDwgdzsgKytqKSB7XG4gICAgICBkYXRhW3ArK10gPSByb3dbal1cbiAgICB9XG4gIH1cblxuICBwb3N0Q29udmVydChpbWFnZSwgZGF0YSlcbn1cblxuZnVuY3Rpb24gZmxhdHRlbjNERGF0YSAoaW1hZ2UsIGFycmF5LCB3LCBoLCBjKSB7XG4gIHZhciBuID0gdyAqIGggKiBjXG4gIHZhciBkYXRhID0gcHJlQ29udmVydChpbWFnZSwgbilcblxuICB2YXIgcCA9IDBcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBoOyArK2kpIHtcbiAgICB2YXIgcm93ID0gYXJyYXlbaV1cbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IHc7ICsraikge1xuICAgICAgdmFyIHBpeGVsID0gcm93W2pdXG4gICAgICBmb3IgKHZhciBrID0gMDsgayA8IGM7ICsraykge1xuICAgICAgICBkYXRhW3ArK10gPSBwaXhlbFtrXVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHBvc3RDb252ZXJ0KGltYWdlLCBkYXRhKVxufVxuXG5mdW5jdGlvbiBnZXRUZXh0dXJlU2l6ZSAoZm9ybWF0LCB0eXBlLCB3aWR0aCwgaGVpZ2h0LCBpc01pcG1hcCwgaXNDdWJlKSB7XG4gIHZhciBzXG4gIGlmICh0eXBlb2YgRk9STUFUX1NJWkVTX1NQRUNJQUxbZm9ybWF0XSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAvLyB3ZSBoYXZlIGEgc3BlY2lhbCBhcnJheSBmb3IgZGVhbGluZyB3aXRoIHdlaXJkIGNvbG9yIGZvcm1hdHMgc3VjaCBhcyBSR0I1QTFcbiAgICBzID0gRk9STUFUX1NJWkVTX1NQRUNJQUxbZm9ybWF0XVxuICB9IGVsc2Uge1xuICAgIHMgPSBGT1JNQVRfQ0hBTk5FTFNbZm9ybWF0XSAqIFRZUEVfU0laRVNbdHlwZV1cbiAgfVxuXG4gIGlmIChpc0N1YmUpIHtcbiAgICBzICo9IDZcbiAgfVxuXG4gIGlmIChpc01pcG1hcCkge1xuICAgIC8vIGNvbXB1dGUgdGhlIHRvdGFsIHNpemUgb2YgYWxsIHRoZSBtaXBtYXBzLlxuICAgIHZhciB0b3RhbCA9IDBcblxuICAgIHZhciB3ID0gd2lkdGhcbiAgICB3aGlsZSAodyA+PSAxKSB7XG4gICAgICAvLyB3ZSBjYW4gb25seSB1c2UgbWlwbWFwcyBvbiBhIHNxdWFyZSBpbWFnZSxcbiAgICAgIC8vIHNvIHdlIGNhbiBzaW1wbHkgdXNlIHRoZSB3aWR0aCBhbmQgaWdub3JlIHRoZSBoZWlnaHQ6XG4gICAgICB0b3RhbCArPSBzICogdyAqIHdcbiAgICAgIHcgLz0gMlxuICAgIH1cbiAgICByZXR1cm4gdG90YWxcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gcyAqIHdpZHRoICogaGVpZ2h0XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjcmVhdGVUZXh0dXJlU2V0IChcbiAgZ2wsIGV4dGVuc2lvbnMsIGxpbWl0cywgcmVnbFBvbGwsIGNvbnRleHRTdGF0ZSwgc3RhdHMsIGNvbmZpZykge1xuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIEluaXRpYWxpemUgY29uc3RhbnRzIGFuZCBwYXJhbWV0ZXIgdGFibGVzIGhlcmVcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICB2YXIgbWlwbWFwSGludCA9IHtcbiAgICBcImRvbid0IGNhcmVcIjogR0xfRE9OVF9DQVJFLFxuICAgICdkb250IGNhcmUnOiBHTF9ET05UX0NBUkUsXG4gICAgJ25pY2UnOiBHTF9OSUNFU1QsXG4gICAgJ2Zhc3QnOiBHTF9GQVNURVNUXG4gIH1cblxuICB2YXIgd3JhcE1vZGVzID0ge1xuICAgICdyZXBlYXQnOiBHTF9SRVBFQVQsXG4gICAgJ2NsYW1wJzogR0xfQ0xBTVBfVE9fRURHRSxcbiAgICAnbWlycm9yJzogR0xfTUlSUk9SRURfUkVQRUFUXG4gIH1cblxuICB2YXIgbWFnRmlsdGVycyA9IHtcbiAgICAnbmVhcmVzdCc6IEdMX05FQVJFU1QsXG4gICAgJ2xpbmVhcic6IEdMX0xJTkVBUlxuICB9XG5cbiAgdmFyIG1pbkZpbHRlcnMgPSBleHRlbmQoe1xuICAgICduZWFyZXN0IG1pcG1hcCBuZWFyZXN0JzogR0xfTkVBUkVTVF9NSVBNQVBfTkVBUkVTVCxcbiAgICAnbGluZWFyIG1pcG1hcCBuZWFyZXN0JzogR0xfTElORUFSX01JUE1BUF9ORUFSRVNULFxuICAgICduZWFyZXN0IG1pcG1hcCBsaW5lYXInOiBHTF9ORUFSRVNUX01JUE1BUF9MSU5FQVIsXG4gICAgJ2xpbmVhciBtaXBtYXAgbGluZWFyJzogR0xfTElORUFSX01JUE1BUF9MSU5FQVIsXG4gICAgJ21pcG1hcCc6IEdMX0xJTkVBUl9NSVBNQVBfTElORUFSXG4gIH0sIG1hZ0ZpbHRlcnMpXG5cbiAgdmFyIGNvbG9yU3BhY2UgPSB7XG4gICAgJ25vbmUnOiAwLFxuICAgICdicm93c2VyJzogR0xfQlJPV1NFUl9ERUZBVUxUX1dFQkdMXG4gIH1cblxuICB2YXIgdGV4dHVyZVR5cGVzID0ge1xuICAgICd1aW50OCc6IEdMX1VOU0lHTkVEX0JZVEUsXG4gICAgJ3JnYmE0JzogR0xfVU5TSUdORURfU0hPUlRfNF80XzRfNCxcbiAgICAncmdiNTY1JzogR0xfVU5TSUdORURfU0hPUlRfNV82XzUsXG4gICAgJ3JnYjUgYTEnOiBHTF9VTlNJR05FRF9TSE9SVF81XzVfNV8xXG4gIH1cblxuICB2YXIgdGV4dHVyZUZvcm1hdHMgPSB7XG4gICAgJ2FscGhhJzogR0xfQUxQSEEsXG4gICAgJ2x1bWluYW5jZSc6IEdMX0xVTUlOQU5DRSxcbiAgICAnbHVtaW5hbmNlIGFscGhhJzogR0xfTFVNSU5BTkNFX0FMUEhBLFxuICAgICdyZ2InOiBHTF9SR0IsXG4gICAgJ3JnYmEnOiBHTF9SR0JBLFxuICAgICdyZ2JhNCc6IEdMX1JHQkE0LFxuICAgICdyZ2I1IGExJzogR0xfUkdCNV9BMSxcbiAgICAncmdiNTY1JzogR0xfUkdCNTY1XG4gIH1cblxuICB2YXIgY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzID0ge31cblxuICBpZiAoZXh0ZW5zaW9ucy5leHRfc3JnYikge1xuICAgIHRleHR1cmVGb3JtYXRzLnNyZ2IgPSBHTF9TUkdCX0VYVFxuICAgIHRleHR1cmVGb3JtYXRzLnNyZ2JhID0gR0xfU1JHQl9BTFBIQV9FWFRcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLm9lc190ZXh0dXJlX2Zsb2F0KSB7XG4gICAgdGV4dHVyZVR5cGVzLmZsb2F0MzIgPSB0ZXh0dXJlVHlwZXMuZmxvYXQgPSBHTF9GTE9BVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMub2VzX3RleHR1cmVfaGFsZl9mbG9hdCkge1xuICAgIHRleHR1cmVUeXBlc1snZmxvYXQxNiddID0gdGV4dHVyZVR5cGVzWydoYWxmIGZsb2F0J10gPSBHTF9IQUxGX0ZMT0FUX09FU1xuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfZGVwdGhfdGV4dHVyZSkge1xuICAgIGV4dGVuZCh0ZXh0dXJlRm9ybWF0cywge1xuICAgICAgJ2RlcHRoJzogR0xfREVQVEhfQ09NUE9ORU5ULFxuICAgICAgJ2RlcHRoIHN0ZW5jaWwnOiBHTF9ERVBUSF9TVEVOQ0lMXG4gICAgfSlcblxuICAgIGV4dGVuZCh0ZXh0dXJlVHlwZXMsIHtcbiAgICAgICd1aW50MTYnOiBHTF9VTlNJR05FRF9TSE9SVCxcbiAgICAgICd1aW50MzInOiBHTF9VTlNJR05FRF9JTlQsXG4gICAgICAnZGVwdGggc3RlbmNpbCc6IEdMX1VOU0lHTkVEX0lOVF8yNF84X1dFQkdMXG4gICAgfSlcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9zM3RjKSB7XG4gICAgZXh0ZW5kKGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cywge1xuICAgICAgJ3JnYiBzM3RjIGR4dDEnOiBHTF9DT01QUkVTU0VEX1JHQl9TM1RDX0RYVDFfRVhULFxuICAgICAgJ3JnYmEgczN0YyBkeHQxJzogR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUMV9FWFQsXG4gICAgICAncmdiYSBzM3RjIGR4dDMnOiBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQzX0VYVCxcbiAgICAgICdyZ2JhIHMzdGMgZHh0NSc6IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDVfRVhUXG4gICAgfSlcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9hdGMpIHtcbiAgICBleHRlbmQoY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzLCB7XG4gICAgICAncmdiIGF0Yyc6IEdMX0NPTVBSRVNTRURfUkdCX0FUQ19XRUJHTCxcbiAgICAgICdyZ2JhIGF0YyBleHBsaWNpdCBhbHBoYSc6IEdMX0NPTVBSRVNTRURfUkdCQV9BVENfRVhQTElDSVRfQUxQSEFfV0VCR0wsXG4gICAgICAncmdiYSBhdGMgaW50ZXJwb2xhdGVkIGFscGhhJzogR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19JTlRFUlBPTEFURURfQUxQSEFfV0VCR0xcbiAgICB9KVxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29tcHJlc3NlZF90ZXh0dXJlX3B2cnRjKSB7XG4gICAgZXh0ZW5kKGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cywge1xuICAgICAgJ3JnYiBwdnJ0YyA0YnBwdjEnOiBHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ180QlBQVjFfSU1HLFxuICAgICAgJ3JnYiBwdnJ0YyAyYnBwdjEnOiBHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ18yQlBQVjFfSU1HLFxuICAgICAgJ3JnYmEgcHZydGMgNGJwcHYxJzogR0xfQ09NUFJFU1NFRF9SR0JBX1BWUlRDXzRCUFBWMV9JTUcsXG4gICAgICAncmdiYSBwdnJ0YyAyYnBwdjEnOiBHTF9DT01QUkVTU0VEX1JHQkFfUFZSVENfMkJQUFYxX0lNR1xuICAgIH0pXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb21wcmVzc2VkX3RleHR1cmVfZXRjMSkge1xuICAgIGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0c1sncmdiIGV0YzEnXSA9IEdMX0NPTVBSRVNTRURfUkdCX0VUQzFfV0VCR0xcbiAgfVxuXG4gIC8vIENvcHkgb3ZlciBhbGwgdGV4dHVyZSBmb3JtYXRzXG4gIHZhciBzdXBwb3J0ZWRDb21wcmVzc2VkRm9ybWF0cyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKFxuICAgIGdsLmdldFBhcmFtZXRlcihHTF9DT01QUkVTU0VEX1RFWFRVUkVfRk9STUFUUykpXG4gIE9iamVjdC5rZXlzKGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cykuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgIHZhciBmb3JtYXQgPSBjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHNbbmFtZV1cbiAgICBpZiAoc3VwcG9ydGVkQ29tcHJlc3NlZEZvcm1hdHMuaW5kZXhPZihmb3JtYXQpID49IDApIHtcbiAgICAgIHRleHR1cmVGb3JtYXRzW25hbWVdID0gZm9ybWF0XG4gICAgfVxuICB9KVxuXG4gIHZhciBzdXBwb3J0ZWRGb3JtYXRzID0gT2JqZWN0LmtleXModGV4dHVyZUZvcm1hdHMpXG4gIGxpbWl0cy50ZXh0dXJlRm9ybWF0cyA9IHN1cHBvcnRlZEZvcm1hdHNcblxuICAvLyBjb2xvckZvcm1hdHNbXSBnaXZlcyB0aGUgZm9ybWF0IChjaGFubmVscykgYXNzb2NpYXRlZCB0byBhblxuICAvLyBpbnRlcm5hbGZvcm1hdFxuICB2YXIgY29sb3JGb3JtYXRzID0gc3VwcG9ydGVkRm9ybWF0cy5yZWR1Y2UoZnVuY3Rpb24gKGNvbG9yLCBrZXkpIHtcbiAgICB2YXIgZ2xlbnVtID0gdGV4dHVyZUZvcm1hdHNba2V5XVxuICAgIGlmIChnbGVudW0gPT09IEdMX0xVTUlOQU5DRSB8fFxuICAgICAgICBnbGVudW0gPT09IEdMX0FMUEhBIHx8XG4gICAgICAgIGdsZW51bSA9PT0gR0xfTFVNSU5BTkNFIHx8XG4gICAgICAgIGdsZW51bSA9PT0gR0xfTFVNSU5BTkNFX0FMUEhBIHx8XG4gICAgICAgIGdsZW51bSA9PT0gR0xfREVQVEhfQ09NUE9ORU5UIHx8XG4gICAgICAgIGdsZW51bSA9PT0gR0xfREVQVEhfU1RFTkNJTCkge1xuICAgICAgY29sb3JbZ2xlbnVtXSA9IGdsZW51bVxuICAgIH0gZWxzZSBpZiAoZ2xlbnVtID09PSBHTF9SR0I1X0ExIHx8IGtleS5pbmRleE9mKCdyZ2JhJykgPj0gMCkge1xuICAgICAgY29sb3JbZ2xlbnVtXSA9IEdMX1JHQkFcbiAgICB9IGVsc2Uge1xuICAgICAgY29sb3JbZ2xlbnVtXSA9IEdMX1JHQlxuICAgIH1cbiAgICByZXR1cm4gY29sb3JcbiAgfSwge30pXG5cbiAgZnVuY3Rpb24gVGV4RmxhZ3MgKCkge1xuICAgIC8vIGZvcm1hdCBpbmZvXG4gICAgdGhpcy5pbnRlcm5hbGZvcm1hdCA9IEdMX1JHQkFcbiAgICB0aGlzLmZvcm1hdCA9IEdMX1JHQkFcbiAgICB0aGlzLnR5cGUgPSBHTF9VTlNJR05FRF9CWVRFXG4gICAgdGhpcy5jb21wcmVzc2VkID0gZmFsc2VcblxuICAgIC8vIHBpeGVsIHN0b3JhZ2VcbiAgICB0aGlzLnByZW11bHRpcGx5QWxwaGEgPSBmYWxzZVxuICAgIHRoaXMuZmxpcFkgPSBmYWxzZVxuICAgIHRoaXMudW5wYWNrQWxpZ25tZW50ID0gMVxuICAgIHRoaXMuY29sb3JTcGFjZSA9IDBcblxuICAgIC8vIHNoYXBlIGluZm9cbiAgICB0aGlzLndpZHRoID0gMFxuICAgIHRoaXMuaGVpZ2h0ID0gMFxuICAgIHRoaXMuY2hhbm5lbHMgPSA0XG4gIH1cblxuICBmdW5jdGlvbiBjb3B5RmxhZ3MgKHJlc3VsdCwgb3RoZXIpIHtcbiAgICByZXN1bHQuaW50ZXJuYWxmb3JtYXQgPSBvdGhlci5pbnRlcm5hbGZvcm1hdFxuICAgIHJlc3VsdC5mb3JtYXQgPSBvdGhlci5mb3JtYXRcbiAgICByZXN1bHQudHlwZSA9IG90aGVyLnR5cGVcbiAgICByZXN1bHQuY29tcHJlc3NlZCA9IG90aGVyLmNvbXByZXNzZWRcblxuICAgIHJlc3VsdC5wcmVtdWx0aXBseUFscGhhID0gb3RoZXIucHJlbXVsdGlwbHlBbHBoYVxuICAgIHJlc3VsdC5mbGlwWSA9IG90aGVyLmZsaXBZXG4gICAgcmVzdWx0LnVucGFja0FsaWdubWVudCA9IG90aGVyLnVucGFja0FsaWdubWVudFxuICAgIHJlc3VsdC5jb2xvclNwYWNlID0gb3RoZXIuY29sb3JTcGFjZVxuXG4gICAgcmVzdWx0LndpZHRoID0gb3RoZXIud2lkdGhcbiAgICByZXN1bHQuaGVpZ2h0ID0gb3RoZXIuaGVpZ2h0XG4gICAgcmVzdWx0LmNoYW5uZWxzID0gb3RoZXIuY2hhbm5lbHNcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlRmxhZ3MgKGZsYWdzLCBvcHRpb25zKSB7XG4gICAgaWYgKHR5cGVvZiBvcHRpb25zICE9PSAnb2JqZWN0JyB8fCAhb3B0aW9ucykge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgaWYgKCdwcmVtdWx0aXBseUFscGhhJyBpbiBvcHRpb25zKSB7XG4gICAgICBcbiAgICAgIGZsYWdzLnByZW11bHRpcGx5QWxwaGEgPSBvcHRpb25zLnByZW11bHRpcGx5QWxwaGFcbiAgICB9XG5cbiAgICBpZiAoJ2ZsaXBZJyBpbiBvcHRpb25zKSB7XG4gICAgICBcbiAgICAgIGZsYWdzLmZsaXBZID0gb3B0aW9ucy5mbGlwWVxuICAgIH1cblxuICAgIGlmICgnYWxpZ25tZW50JyBpbiBvcHRpb25zKSB7XG4gICAgICBcbiAgICAgIGZsYWdzLnVucGFja0FsaWdubWVudCA9IG9wdGlvbnMuYWxpZ25tZW50XG4gICAgfVxuXG4gICAgaWYgKCdjb2xvclNwYWNlJyBpbiBvcHRpb25zKSB7XG4gICAgICBcbiAgICAgIGZsYWdzLmNvbG9yU3BhY2UgPSBjb2xvclNwYWNlW29wdGlvbnMuY29sb3JTcGFjZV1cbiAgICB9XG5cbiAgICBpZiAoJ3R5cGUnIGluIG9wdGlvbnMpIHtcbiAgICAgIHZhciB0eXBlID0gb3B0aW9ucy50eXBlXG4gICAgICBcbiAgICAgIFxuICAgICAgXG4gICAgICBcbiAgICAgIGZsYWdzLnR5cGUgPSB0ZXh0dXJlVHlwZXNbdHlwZV1cbiAgICB9XG5cbiAgICB2YXIgdyA9IGZsYWdzLndpZHRoXG4gICAgdmFyIGggPSBmbGFncy5oZWlnaHRcbiAgICB2YXIgYyA9IGZsYWdzLmNoYW5uZWxzXG4gICAgdmFyIGhhc0NoYW5uZWxzID0gZmFsc2VcbiAgICBpZiAoJ3NoYXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICBcbiAgICAgIHcgPSBvcHRpb25zLnNoYXBlWzBdXG4gICAgICBoID0gb3B0aW9ucy5zaGFwZVsxXVxuICAgICAgaWYgKG9wdGlvbnMuc2hhcGUubGVuZ3RoID09PSAzKSB7XG4gICAgICAgIGMgPSBvcHRpb25zLnNoYXBlWzJdXG4gICAgICAgIFxuICAgICAgICBoYXNDaGFubmVscyA9IHRydWVcbiAgICAgIH1cbiAgICAgIFxuICAgICAgXG4gICAgfSBlbHNlIHtcbiAgICAgIGlmICgncmFkaXVzJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHcgPSBoID0gb3B0aW9ucy5yYWRpdXNcbiAgICAgICAgXG4gICAgICB9XG4gICAgICBpZiAoJ3dpZHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHcgPSBvcHRpb25zLndpZHRoXG4gICAgICAgIFxuICAgICAgfVxuICAgICAgaWYgKCdoZWlnaHQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgaCA9IG9wdGlvbnMuaGVpZ2h0XG4gICAgICAgIFxuICAgICAgfVxuICAgICAgaWYgKCdjaGFubmVscycgaW4gb3B0aW9ucykge1xuICAgICAgICBjID0gb3B0aW9ucy5jaGFubmVsc1xuICAgICAgICBcbiAgICAgICAgaGFzQ2hhbm5lbHMgPSB0cnVlXG4gICAgICB9XG4gICAgfVxuICAgIGZsYWdzLndpZHRoID0gdyB8IDBcbiAgICBmbGFncy5oZWlnaHQgPSBoIHwgMFxuICAgIGZsYWdzLmNoYW5uZWxzID0gYyB8IDBcblxuICAgIHZhciBoYXNGb3JtYXQgPSBmYWxzZVxuICAgIGlmICgnZm9ybWF0JyBpbiBvcHRpb25zKSB7XG4gICAgICB2YXIgZm9ybWF0U3RyID0gb3B0aW9ucy5mb3JtYXRcbiAgICAgIFxuICAgICAgXG4gICAgICB2YXIgaW50ZXJuYWxmb3JtYXQgPSBmbGFncy5pbnRlcm5hbGZvcm1hdCA9IHRleHR1cmVGb3JtYXRzW2Zvcm1hdFN0cl1cbiAgICAgIGZsYWdzLmZvcm1hdCA9IGNvbG9yRm9ybWF0c1tpbnRlcm5hbGZvcm1hdF1cbiAgICAgIGlmIChmb3JtYXRTdHIgaW4gdGV4dHVyZVR5cGVzKSB7XG4gICAgICAgIGlmICghKCd0eXBlJyBpbiBvcHRpb25zKSkge1xuICAgICAgICAgIGZsYWdzLnR5cGUgPSB0ZXh0dXJlVHlwZXNbZm9ybWF0U3RyXVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoZm9ybWF0U3RyIGluIGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cykge1xuICAgICAgICBmbGFncy5jb21wcmVzc2VkID0gdHJ1ZVxuICAgICAgfVxuICAgICAgaGFzRm9ybWF0ID0gdHJ1ZVxuICAgIH1cblxuICAgIC8vIFJlY29uY2lsZSBjaGFubmVscyBhbmQgZm9ybWF0XG4gICAgaWYgKCFoYXNDaGFubmVscyAmJiBoYXNGb3JtYXQpIHtcbiAgICAgIGZsYWdzLmNoYW5uZWxzID0gRk9STUFUX0NIQU5ORUxTW2ZsYWdzLmZvcm1hdF1cbiAgICB9IGVsc2UgaWYgKGhhc0NoYW5uZWxzICYmICFoYXNGb3JtYXQpIHtcbiAgICAgIGlmIChmbGFncy5jaGFubmVscyAhPT0gQ0hBTk5FTFNfRk9STUFUW2ZsYWdzLmZvcm1hdF0pIHtcbiAgICAgICAgZmxhZ3MuZm9ybWF0ID0gZmxhZ3MuaW50ZXJuYWxmb3JtYXQgPSBDSEFOTkVMU19GT1JNQVRbZmxhZ3MuY2hhbm5lbHNdXG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChoYXNGb3JtYXQgJiYgaGFzQ2hhbm5lbHMpIHtcbiAgICAgIFxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHNldEZsYWdzIChmbGFncykge1xuICAgIGdsLnBpeGVsU3RvcmVpKEdMX1VOUEFDS19GTElQX1lfV0VCR0wsIGZsYWdzLmZsaXBZKVxuICAgIGdsLnBpeGVsU3RvcmVpKEdMX1VOUEFDS19QUkVNVUxUSVBMWV9BTFBIQV9XRUJHTCwgZmxhZ3MucHJlbXVsdGlwbHlBbHBoYSlcbiAgICBnbC5waXhlbFN0b3JlaShHTF9VTlBBQ0tfQ09MT1JTUEFDRV9DT05WRVJTSU9OX1dFQkdMLCBmbGFncy5jb2xvclNwYWNlKVxuICAgIGdsLnBpeGVsU3RvcmVpKEdMX1VOUEFDS19BTElHTk1FTlQsIGZsYWdzLnVucGFja0FsaWdubWVudClcbiAgfVxuXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gVGV4IGltYWdlIGRhdGFcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICBmdW5jdGlvbiBUZXhJbWFnZSAoKSB7XG4gICAgVGV4RmxhZ3MuY2FsbCh0aGlzKVxuXG4gICAgdGhpcy54T2Zmc2V0ID0gMFxuICAgIHRoaXMueU9mZnNldCA9IDBcblxuICAgIC8vIGRhdGFcbiAgICB0aGlzLmRhdGEgPSBudWxsXG4gICAgdGhpcy5uZWVkc0ZyZWUgPSBmYWxzZVxuXG4gICAgLy8gaHRtbCBlbGVtZW50XG4gICAgdGhpcy5lbGVtZW50ID0gbnVsbFxuXG4gICAgLy8gY29weVRleEltYWdlIGluZm9cbiAgICB0aGlzLm5lZWRzQ29weSA9IGZhbHNlXG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZUltYWdlIChpbWFnZSwgb3B0aW9ucykge1xuICAgIHZhciBkYXRhID0gbnVsbFxuICAgIGlmIChpc1BpeGVsRGF0YShvcHRpb25zKSkge1xuICAgICAgZGF0YSA9IG9wdGlvbnNcbiAgICB9IGVsc2UgaWYgKG9wdGlvbnMpIHtcbiAgICAgIFxuICAgICAgcGFyc2VGbGFncyhpbWFnZSwgb3B0aW9ucylcbiAgICAgIGlmICgneCcgaW4gb3B0aW9ucykge1xuICAgICAgICBpbWFnZS54T2Zmc2V0ID0gb3B0aW9ucy54IHwgMFxuICAgICAgfVxuICAgICAgaWYgKCd5JyBpbiBvcHRpb25zKSB7XG4gICAgICAgIGltYWdlLnlPZmZzZXQgPSBvcHRpb25zLnkgfCAwXG4gICAgICB9XG4gICAgICBpZiAoaXNQaXhlbERhdGEob3B0aW9ucy5kYXRhKSkge1xuICAgICAgICBkYXRhID0gb3B0aW9ucy5kYXRhXG4gICAgICB9XG4gICAgfVxuXG4gICAgXG5cbiAgICBpZiAob3B0aW9ucy5jb3B5KSB7XG4gICAgICBcbiAgICAgIHZhciB2aWV3VyA9IGNvbnRleHRTdGF0ZS52aWV3cG9ydFdpZHRoXG4gICAgICB2YXIgdmlld0ggPSBjb250ZXh0U3RhdGUudmlld3BvcnRIZWlnaHRcbiAgICAgIGltYWdlLndpZHRoID0gaW1hZ2Uud2lkdGggfHwgKHZpZXdXIC0gaW1hZ2UueE9mZnNldClcbiAgICAgIGltYWdlLmhlaWdodCA9IGltYWdlLmhlaWdodCB8fCAodmlld0ggLSBpbWFnZS55T2Zmc2V0KVxuICAgICAgaW1hZ2UubmVlZHNDb3B5ID0gdHJ1ZVxuICAgICAgXG4gICAgfSBlbHNlIGlmICghZGF0YSkge1xuICAgICAgaW1hZ2Uud2lkdGggPSBpbWFnZS53aWR0aCB8fCAxXG4gICAgICBpbWFnZS5oZWlnaHQgPSBpbWFnZS5oZWlnaHQgfHwgMVxuICAgIH0gZWxzZSBpZiAoaXNUeXBlZEFycmF5KGRhdGEpKSB7XG4gICAgICBpbWFnZS5kYXRhID0gZGF0YVxuICAgICAgaWYgKCEoJ3R5cGUnIGluIG9wdGlvbnMpICYmIGltYWdlLnR5cGUgPT09IEdMX1VOU0lHTkVEX0JZVEUpIHtcbiAgICAgICAgaW1hZ2UudHlwZSA9IHR5cGVkQXJyYXlDb2RlKGRhdGEpXG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChpc051bWVyaWNBcnJheShkYXRhKSkge1xuICAgICAgY29udmVydERhdGEoaW1hZ2UsIGRhdGEpXG4gICAgICBpbWFnZS5hbGlnbm1lbnQgPSAxXG4gICAgICBpbWFnZS5uZWVkc0ZyZWUgPSB0cnVlXG4gICAgfSBlbHNlIGlmIChpc05EQXJyYXlMaWtlKGRhdGEpKSB7XG4gICAgICB2YXIgYXJyYXkgPSBkYXRhLmRhdGFcbiAgICAgIGlmICghQXJyYXkuaXNBcnJheShhcnJheSkgJiYgaW1hZ2UudHlwZSA9PT0gR0xfVU5TSUdORURfQllURSkge1xuICAgICAgICBpbWFnZS50eXBlID0gdHlwZWRBcnJheUNvZGUoYXJyYXkpXG4gICAgICB9XG4gICAgICB2YXIgc2hhcGUgPSBkYXRhLnNoYXBlXG4gICAgICB2YXIgc3RyaWRlID0gZGF0YS5zdHJpZGVcbiAgICAgIHZhciBzaGFwZVgsIHNoYXBlWSwgc2hhcGVDLCBzdHJpZGVYLCBzdHJpZGVZLCBzdHJpZGVDXG4gICAgICBpZiAoc2hhcGUubGVuZ3RoID09PSAzKSB7XG4gICAgICAgIHNoYXBlQyA9IHNoYXBlWzJdXG4gICAgICAgIHN0cmlkZUMgPSBzdHJpZGVbMl1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIFxuICAgICAgICBzaGFwZUMgPSAxXG4gICAgICAgIHN0cmlkZUMgPSAxXG4gICAgICB9XG4gICAgICBzaGFwZVggPSBzaGFwZVswXVxuICAgICAgc2hhcGVZID0gc2hhcGVbMV1cbiAgICAgIHN0cmlkZVggPSBzdHJpZGVbMF1cbiAgICAgIHN0cmlkZVkgPSBzdHJpZGVbMV1cbiAgICAgIGltYWdlLmFsaWdubWVudCA9IDFcbiAgICAgIGltYWdlLndpZHRoID0gc2hhcGVYXG4gICAgICBpbWFnZS5oZWlnaHQgPSBzaGFwZVlcbiAgICAgIGltYWdlLmNoYW5uZWxzID0gc2hhcGVDXG4gICAgICBpbWFnZS5mb3JtYXQgPSBpbWFnZS5pbnRlcm5hbGZvcm1hdCA9IENIQU5ORUxTX0ZPUk1BVFtzaGFwZUNdXG4gICAgICBpbWFnZS5uZWVkc0ZyZWUgPSB0cnVlXG4gICAgICB0cmFuc3Bvc2VEYXRhKGltYWdlLCBhcnJheSwgc3RyaWRlWCwgc3RyaWRlWSwgc3RyaWRlQywgZGF0YS5vZmZzZXQpXG4gICAgfSBlbHNlIGlmIChpc0NhbnZhc0VsZW1lbnQoZGF0YSkgfHwgaXNDb250ZXh0MkQoZGF0YSkpIHtcbiAgICAgIGlmIChpc0NhbnZhc0VsZW1lbnQoZGF0YSkpIHtcbiAgICAgICAgaW1hZ2UuZWxlbWVudCA9IGRhdGFcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGltYWdlLmVsZW1lbnQgPSBkYXRhLmNhbnZhc1xuICAgICAgfVxuICAgICAgaW1hZ2Uud2lkdGggPSBpbWFnZS5lbGVtZW50LndpZHRoXG4gICAgICBpbWFnZS5oZWlnaHQgPSBpbWFnZS5lbGVtZW50LmhlaWdodFxuICAgIH0gZWxzZSBpZiAoaXNJbWFnZUVsZW1lbnQoZGF0YSkpIHtcbiAgICAgIGltYWdlLmVsZW1lbnQgPSBkYXRhXG4gICAgICBpbWFnZS53aWR0aCA9IGRhdGEubmF0dXJhbFdpZHRoXG4gICAgICBpbWFnZS5oZWlnaHQgPSBkYXRhLm5hdHVyYWxIZWlnaHRcbiAgICB9IGVsc2UgaWYgKGlzVmlkZW9FbGVtZW50KGRhdGEpKSB7XG4gICAgICBpbWFnZS5lbGVtZW50ID0gZGF0YVxuICAgICAgaW1hZ2Uud2lkdGggPSBkYXRhLnZpZGVvV2lkdGhcbiAgICAgIGltYWdlLmhlaWdodCA9IGRhdGEudmlkZW9IZWlnaHRcbiAgICAgIGltYWdlLm5lZWRzUG9sbCA9IHRydWVcbiAgICB9IGVsc2UgaWYgKGlzUmVjdEFycmF5KGRhdGEpKSB7XG4gICAgICB2YXIgdyA9IGRhdGFbMF0ubGVuZ3RoXG4gICAgICB2YXIgaCA9IGRhdGEubGVuZ3RoXG4gICAgICB2YXIgYyA9IDFcbiAgICAgIGlmIChpc0FycmF5TGlrZShkYXRhWzBdWzBdKSkge1xuICAgICAgICBjID0gZGF0YVswXVswXS5sZW5ndGhcbiAgICAgICAgZmxhdHRlbjNERGF0YShpbWFnZSwgZGF0YSwgdywgaCwgYylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGZsYXR0ZW4yRERhdGEoaW1hZ2UsIGRhdGEsIHcsIGgpXG4gICAgICB9XG4gICAgICBpbWFnZS5hbGlnbm1lbnQgPSAxXG4gICAgICBpbWFnZS53aWR0aCA9IHdcbiAgICAgIGltYWdlLmhlaWdodCA9IGhcbiAgICAgIGltYWdlLmNoYW5uZWxzID0gY1xuICAgICAgaW1hZ2UuZm9ybWF0ID0gaW1hZ2UuaW50ZXJuYWxmb3JtYXQgPSBDSEFOTkVMU19GT1JNQVRbY11cbiAgICAgIGltYWdlLm5lZWRzRnJlZSA9IHRydWVcbiAgICB9XG5cbiAgICBpZiAoaW1hZ2UudHlwZSA9PT0gR0xfRkxPQVQpIHtcbiAgICAgIFxuICAgIH0gZWxzZSBpZiAoaW1hZ2UudHlwZSA9PT0gR0xfSEFMRl9GTE9BVF9PRVMpIHtcbiAgICAgIFxuICAgIH1cblxuICAgIC8vIGRvIGNvbXByZXNzZWQgdGV4dHVyZSAgdmFsaWRhdGlvbiBoZXJlLlxuICB9XG5cbiAgZnVuY3Rpb24gc2V0SW1hZ2UgKGluZm8sIHRhcmdldCwgbWlwbGV2ZWwpIHtcbiAgICB2YXIgZWxlbWVudCA9IGluZm8uZWxlbWVudFxuICAgIHZhciBkYXRhID0gaW5mby5kYXRhXG4gICAgdmFyIGludGVybmFsZm9ybWF0ID0gaW5mby5pbnRlcm5hbGZvcm1hdFxuICAgIHZhciBmb3JtYXQgPSBpbmZvLmZvcm1hdFxuICAgIHZhciB0eXBlID0gaW5mby50eXBlXG4gICAgdmFyIHdpZHRoID0gaW5mby53aWR0aFxuICAgIHZhciBoZWlnaHQgPSBpbmZvLmhlaWdodFxuXG4gICAgc2V0RmxhZ3MoaW5mbylcblxuICAgIGlmIChlbGVtZW50KSB7XG4gICAgICBnbC50ZXhJbWFnZTJEKHRhcmdldCwgbWlwbGV2ZWwsIGZvcm1hdCwgZm9ybWF0LCB0eXBlLCBlbGVtZW50KVxuICAgIH0gZWxzZSBpZiAoaW5mby5jb21wcmVzc2VkKSB7XG4gICAgICBnbC5jb21wcmVzc2VkVGV4SW1hZ2UyRCh0YXJnZXQsIG1pcGxldmVsLCBpbnRlcm5hbGZvcm1hdCwgd2lkdGgsIGhlaWdodCwgMCwgZGF0YSlcbiAgICB9IGVsc2UgaWYgKGluZm8ubmVlZHNDb3B5KSB7XG4gICAgICByZWdsUG9sbCgpXG4gICAgICBnbC5jb3B5VGV4SW1hZ2UyRChcbiAgICAgICAgdGFyZ2V0LCBtaXBsZXZlbCwgZm9ybWF0LCBpbmZvLnhPZmZzZXQsIGluZm8ueU9mZnNldCwgd2lkdGgsIGhlaWdodCwgMClcbiAgICB9IGVsc2Uge1xuICAgICAgZ2wudGV4SW1hZ2UyRChcbiAgICAgICAgdGFyZ2V0LCBtaXBsZXZlbCwgZm9ybWF0LCB3aWR0aCwgaGVpZ2h0LCAwLCBmb3JtYXQsIHR5cGUsIGRhdGEpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc2V0U3ViSW1hZ2UgKGluZm8sIHRhcmdldCwgeCwgeSwgbWlwbGV2ZWwpIHtcbiAgICB2YXIgZWxlbWVudCA9IGluZm8uZWxlbWVudFxuICAgIHZhciBkYXRhID0gaW5mby5kYXRhXG4gICAgdmFyIGludGVybmFsZm9ybWF0ID0gaW5mby5pbnRlcm5hbGZvcm1hdFxuICAgIHZhciBmb3JtYXQgPSBpbmZvLmZvcm1hdFxuICAgIHZhciB0eXBlID0gaW5mby50eXBlXG4gICAgdmFyIHdpZHRoID0gaW5mby53aWR0aFxuICAgIHZhciBoZWlnaHQgPSBpbmZvLmhlaWdodFxuXG4gICAgc2V0RmxhZ3MoaW5mbylcblxuICAgIGlmIChlbGVtZW50KSB7XG4gICAgICBnbC50ZXhTdWJJbWFnZTJEKFxuICAgICAgICB0YXJnZXQsIG1pcGxldmVsLCB4LCB5LCBmb3JtYXQsIHR5cGUsIGVsZW1lbnQpXG4gICAgfSBlbHNlIGlmIChpbmZvLmNvbXByZXNzZWQpIHtcbiAgICAgIGdsLmNvbXByZXNzZWRUZXhTdWJJbWFnZTJEKFxuICAgICAgICB0YXJnZXQsIG1pcGxldmVsLCB4LCB5LCBpbnRlcm5hbGZvcm1hdCwgd2lkdGgsIGhlaWdodCwgZGF0YSlcbiAgICB9IGVsc2UgaWYgKGluZm8ubmVlZHNDb3B5KSB7XG4gICAgICByZWdsUG9sbCgpXG4gICAgICBnbC5jb3B5VGV4U3ViSW1hZ2UyRChcbiAgICAgICAgdGFyZ2V0LCBtaXBsZXZlbCwgeCwgeSwgaW5mby54T2Zmc2V0LCBpbmZvLnlPZmZzZXQsIHdpZHRoLCBoZWlnaHQpXG4gICAgfSBlbHNlIHtcbiAgICAgIGdsLnRleFN1YkltYWdlMkQoXG4gICAgICAgIHRhcmdldCwgbWlwbGV2ZWwsIHgsIHksIHdpZHRoLCBoZWlnaHQsIGZvcm1hdCwgdHlwZSwgZGF0YSlcbiAgICB9XG4gIH1cblxuICAvLyB0ZXhJbWFnZSBwb29sXG4gIHZhciBpbWFnZVBvb2wgPSBbXVxuXG4gIGZ1bmN0aW9uIGFsbG9jSW1hZ2UgKCkge1xuICAgIHJldHVybiBpbWFnZVBvb2wucG9wKCkgfHwgbmV3IFRleEltYWdlKClcbiAgfVxuXG4gIGZ1bmN0aW9uIGZyZWVJbWFnZSAoaW1hZ2UpIHtcbiAgICBpZiAoaW1hZ2UubmVlZHNGcmVlKSB7XG4gICAgICBwb29sLmZyZWVUeXBlKGltYWdlLmRhdGEpXG4gICAgfVxuICAgIFRleEltYWdlLmNhbGwoaW1hZ2UpXG4gICAgaW1hZ2VQb29sLnB1c2goaW1hZ2UpXG4gIH1cblxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIE1pcCBtYXBcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICBmdW5jdGlvbiBNaXBNYXAgKCkge1xuICAgIFRleEZsYWdzLmNhbGwodGhpcylcblxuICAgIHRoaXMuZ2VuTWlwbWFwcyA9IGZhbHNlXG4gICAgdGhpcy5taXBtYXBIaW50ID0gR0xfRE9OVF9DQVJFXG4gICAgdGhpcy5taXBtYXNrID0gMFxuICAgIHRoaXMuaW1hZ2VzID0gQXJyYXkoMTYpXG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZU1pcE1hcEZyb21TaGFwZSAobWlwbWFwLCB3aWR0aCwgaGVpZ2h0KSB7XG4gICAgdmFyIGltZyA9IG1pcG1hcC5pbWFnZXNbMF0gPSBhbGxvY0ltYWdlKClcbiAgICBtaXBtYXAubWlwbWFzayA9IDFcbiAgICBpbWcud2lkdGggPSBtaXBtYXAud2lkdGggPSB3aWR0aFxuICAgIGltZy5oZWlnaHQgPSBtaXBtYXAuaGVpZ2h0ID0gaGVpZ2h0XG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZU1pcE1hcEZyb21PYmplY3QgKG1pcG1hcCwgb3B0aW9ucykge1xuICAgIHZhciBpbWdEYXRhID0gbnVsbFxuICAgIGlmIChpc1BpeGVsRGF0YShvcHRpb25zKSkge1xuICAgICAgaW1nRGF0YSA9IG1pcG1hcC5pbWFnZXNbMF0gPSBhbGxvY0ltYWdlKClcbiAgICAgIGNvcHlGbGFncyhpbWdEYXRhLCBtaXBtYXApXG4gICAgICBwYXJzZUltYWdlKGltZ0RhdGEsIG9wdGlvbnMpXG4gICAgICBtaXBtYXAubWlwbWFzayA9IDFcbiAgICB9IGVsc2Uge1xuICAgICAgcGFyc2VGbGFncyhtaXBtYXAsIG9wdGlvbnMpXG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShvcHRpb25zLm1pcG1hcCkpIHtcbiAgICAgICAgdmFyIG1pcERhdGEgPSBvcHRpb25zLm1pcG1hcFxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG1pcERhdGEubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICBpbWdEYXRhID0gbWlwbWFwLmltYWdlc1tpXSA9IGFsbG9jSW1hZ2UoKVxuICAgICAgICAgIGNvcHlGbGFncyhpbWdEYXRhLCBtaXBtYXApXG4gICAgICAgICAgaW1nRGF0YS53aWR0aCA+Pj0gaVxuICAgICAgICAgIGltZ0RhdGEuaGVpZ2h0ID4+PSBpXG4gICAgICAgICAgcGFyc2VJbWFnZShpbWdEYXRhLCBtaXBEYXRhW2ldKVxuICAgICAgICAgIG1pcG1hcC5taXBtYXNrIHw9ICgxIDw8IGkpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGltZ0RhdGEgPSBtaXBtYXAuaW1hZ2VzWzBdID0gYWxsb2NJbWFnZSgpXG4gICAgICAgIGNvcHlGbGFncyhpbWdEYXRhLCBtaXBtYXApXG4gICAgICAgIHBhcnNlSW1hZ2UoaW1nRGF0YSwgb3B0aW9ucylcbiAgICAgICAgbWlwbWFwLm1pcG1hc2sgPSAxXG4gICAgICB9XG4gICAgfVxuICAgIGNvcHlGbGFncyhtaXBtYXAsIG1pcG1hcC5pbWFnZXNbMF0pXG5cbiAgICAvLyBGb3IgdGV4dHVyZXMgb2YgdGhlIGNvbXByZXNzZWQgZm9ybWF0IFdFQkdMX2NvbXByZXNzZWRfdGV4dHVyZV9zM3RjXG4gICAgLy8gd2UgbXVzdCBoYXZlIHRoYXRcbiAgICAvL1xuICAgIC8vIFwiV2hlbiBsZXZlbCBlcXVhbHMgemVybyB3aWR0aCBhbmQgaGVpZ2h0IG11c3QgYmUgYSBtdWx0aXBsZSBvZiA0LlxuICAgIC8vIFdoZW4gbGV2ZWwgaXMgZ3JlYXRlciB0aGFuIDAgd2lkdGggYW5kIGhlaWdodCBtdXN0IGJlIDAsIDEsIDIgb3IgYSBtdWx0aXBsZSBvZiA0LiBcIlxuICAgIC8vXG4gICAgLy8gYnV0IHdlIGRvIG5vdCB5ZXQgc3VwcG9ydCBoYXZpbmcgbXVsdGlwbGUgbWlwbWFwIGxldmVscyBmb3IgY29tcHJlc3NlZCB0ZXh0dXJlcyxcbiAgICAvLyBzbyB3ZSBvbmx5IHRlc3QgZm9yIGxldmVsIHplcm8uXG5cbiAgICBpZiAobWlwbWFwLmNvbXByZXNzZWQgJiZcbiAgICAgICAgKG1pcG1hcC5pbnRlcm5hbGZvcm1hdCA9PT0gR0xfQ09NUFJFU1NFRF9SR0JfUzNUQ19EWFQxX0VYVCkgfHxcbiAgICAgICAgKG1pcG1hcC5pbnRlcm5hbGZvcm1hdCA9PT0gR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUMV9FWFQpIHx8XG4gICAgICAgIChtaXBtYXAuaW50ZXJuYWxmb3JtYXQgPT09IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDNfRVhUKSB8fFxuICAgICAgICAobWlwbWFwLmludGVybmFsZm9ybWF0ID09PSBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQ1X0VYVCkpIHtcbiAgICAgIFxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHNldE1pcE1hcCAobWlwbWFwLCB0YXJnZXQpIHtcbiAgICB2YXIgaW1hZ2VzID0gbWlwbWFwLmltYWdlc1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgaW1hZ2VzLmxlbmd0aDsgKytpKSB7XG4gICAgICBpZiAoIWltYWdlc1tpXSkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIHNldEltYWdlKGltYWdlc1tpXSwgdGFyZ2V0LCBpKVxuICAgIH1cbiAgfVxuXG4gIHZhciBtaXBQb29sID0gW11cblxuICBmdW5jdGlvbiBhbGxvY01pcE1hcCAoKSB7XG4gICAgdmFyIHJlc3VsdCA9IG1pcFBvb2wucG9wKCkgfHwgbmV3IE1pcE1hcCgpXG4gICAgVGV4RmxhZ3MuY2FsbChyZXN1bHQpXG4gICAgcmVzdWx0Lm1pcG1hc2sgPSAwXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCAxNjsgKytpKSB7XG4gICAgICByZXN1bHQuaW1hZ2VzW2ldID0gbnVsbFxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0XG4gIH1cblxuICBmdW5jdGlvbiBmcmVlTWlwTWFwIChtaXBtYXApIHtcbiAgICB2YXIgaW1hZ2VzID0gbWlwbWFwLmltYWdlc1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgaW1hZ2VzLmxlbmd0aDsgKytpKSB7XG4gICAgICBpZiAoaW1hZ2VzW2ldKSB7XG4gICAgICAgIGZyZWVJbWFnZShpbWFnZXNbaV0pXG4gICAgICB9XG4gICAgICBpbWFnZXNbaV0gPSBudWxsXG4gICAgfVxuICAgIG1pcFBvb2wucHVzaChtaXBtYXApXG4gIH1cblxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIFRleCBpbmZvXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgZnVuY3Rpb24gVGV4SW5mbyAoKSB7XG4gICAgdGhpcy5taW5GaWx0ZXIgPSBHTF9ORUFSRVNUXG4gICAgdGhpcy5tYWdGaWx0ZXIgPSBHTF9ORUFSRVNUXG5cbiAgICB0aGlzLndyYXBTID0gR0xfQ0xBTVBfVE9fRURHRVxuICAgIHRoaXMud3JhcFQgPSBHTF9DTEFNUF9UT19FREdFXG5cbiAgICB0aGlzLmFuaXNvdHJvcGljID0gMVxuXG4gICAgdGhpcy5nZW5NaXBtYXBzID0gZmFsc2VcbiAgICB0aGlzLm1pcG1hcEhpbnQgPSBHTF9ET05UX0NBUkVcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlVGV4SW5mbyAoaW5mbywgb3B0aW9ucykge1xuICAgIGlmICgnbWluJyBpbiBvcHRpb25zKSB7XG4gICAgICB2YXIgbWluRmlsdGVyID0gb3B0aW9ucy5taW5cbiAgICAgIFxuICAgICAgaW5mby5taW5GaWx0ZXIgPSBtaW5GaWx0ZXJzW21pbkZpbHRlcl1cbiAgICAgIGlmIChNSVBNQVBfRklMVEVSUy5pbmRleE9mKGluZm8ubWluRmlsdGVyKSA+PSAwKSB7XG4gICAgICAgIGluZm8uZ2VuTWlwbWFwcyA9IHRydWVcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoJ21hZycgaW4gb3B0aW9ucykge1xuICAgICAgdmFyIG1hZ0ZpbHRlciA9IG9wdGlvbnMubWFnXG4gICAgICBcbiAgICAgIGluZm8ubWFnRmlsdGVyID0gbWFnRmlsdGVyc1ttYWdGaWx0ZXJdXG4gICAgfVxuXG4gICAgdmFyIHdyYXBTID0gaW5mby53cmFwU1xuICAgIHZhciB3cmFwVCA9IGluZm8ud3JhcFRcbiAgICBpZiAoJ3dyYXAnIGluIG9wdGlvbnMpIHtcbiAgICAgIHZhciB3cmFwID0gb3B0aW9ucy53cmFwXG4gICAgICBpZiAodHlwZW9mIHdyYXAgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIFxuICAgICAgICB3cmFwUyA9IHdyYXBUID0gd3JhcE1vZGVzW3dyYXBdXG4gICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkod3JhcCkpIHtcbiAgICAgICAgXG4gICAgICAgIFxuICAgICAgICB3cmFwUyA9IHdyYXBNb2Rlc1t3cmFwWzBdXVxuICAgICAgICB3cmFwVCA9IHdyYXBNb2Rlc1t3cmFwWzFdXVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoJ3dyYXBTJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBvcHRXcmFwUyA9IG9wdGlvbnMud3JhcFNcbiAgICAgICAgXG4gICAgICAgIHdyYXBTID0gd3JhcE1vZGVzW29wdFdyYXBTXVxuICAgICAgfVxuICAgICAgaWYgKCd3cmFwVCcgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgb3B0V3JhcFQgPSBvcHRpb25zLndyYXBUXG4gICAgICAgIFxuICAgICAgICB3cmFwVCA9IHdyYXBNb2Rlc1tvcHRXcmFwVF1cbiAgICAgIH1cbiAgICB9XG4gICAgaW5mby53cmFwUyA9IHdyYXBTXG4gICAgaW5mby53cmFwVCA9IHdyYXBUXG5cbiAgICBpZiAoJ2FuaXNvdHJvcGljJyBpbiBvcHRpb25zKSB7XG4gICAgICB2YXIgYW5pc290cm9waWMgPSBvcHRpb25zLmFuaXNvdHJvcGljXG4gICAgICBcbiAgICAgIGluZm8uYW5pc290cm9waWMgPSBvcHRpb25zLmFuaXNvdHJvcGljXG4gICAgfVxuXG4gICAgaWYgKCdtaXBtYXAnIGluIG9wdGlvbnMpIHtcbiAgICAgIHZhciBoYXNNaXBNYXAgPSBmYWxzZVxuICAgICAgc3dpdGNoICh0eXBlb2Ygb3B0aW9ucy5taXBtYXApIHtcbiAgICAgICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgICAgICBcbiAgICAgICAgICBpbmZvLm1pcG1hcEhpbnQgPSBtaXBtYXBIaW50W29wdGlvbnMubWlwbWFwXVxuICAgICAgICAgIGluZm8uZ2VuTWlwbWFwcyA9IHRydWVcbiAgICAgICAgICBoYXNNaXBNYXAgPSB0cnVlXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdib29sZWFuJzpcbiAgICAgICAgICBoYXNNaXBNYXAgPSBpbmZvLmdlbk1pcG1hcHMgPSBvcHRpb25zLm1pcG1hcFxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgICAgICBcbiAgICAgICAgICBpbmZvLmdlbk1pcG1hcHMgPSBmYWxzZVxuICAgICAgICAgIGhhc01pcE1hcCA9IHRydWVcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgXG4gICAgICB9XG4gICAgICBpZiAoaGFzTWlwTWFwICYmICEoJ21pbicgaW4gb3B0aW9ucykpIHtcbiAgICAgICAgaW5mby5taW5GaWx0ZXIgPSBHTF9ORUFSRVNUX01JUE1BUF9ORUFSRVNUXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc2V0VGV4SW5mbyAoaW5mbywgdGFyZ2V0KSB7XG4gICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfTUlOX0ZJTFRFUiwgaW5mby5taW5GaWx0ZXIpXG4gICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfTUFHX0ZJTFRFUiwgaW5mby5tYWdGaWx0ZXIpXG4gICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfV1JBUF9TLCBpbmZvLndyYXBTKVxuICAgIGdsLnRleFBhcmFtZXRlcmkodGFyZ2V0LCBHTF9URVhUVVJFX1dSQVBfVCwgaW5mby53cmFwVClcbiAgICBpZiAoZXh0ZW5zaW9ucy5leHRfdGV4dHVyZV9maWx0ZXJfYW5pc290cm9waWMpIHtcbiAgICAgIGdsLnRleFBhcmFtZXRlcmkodGFyZ2V0LCBHTF9URVhUVVJFX01BWF9BTklTT1RST1BZX0VYVCwgaW5mby5hbmlzb3Ryb3BpYylcbiAgICB9XG4gICAgaWYgKGluZm8uZ2VuTWlwbWFwcykge1xuICAgICAgZ2wuaGludChHTF9HRU5FUkFURV9NSVBNQVBfSElOVCwgaW5mby5taXBtYXBIaW50KVxuICAgICAgZ2wuZ2VuZXJhdGVNaXBtYXAodGFyZ2V0KVxuICAgIH1cbiAgfVxuXG4gIHZhciBpbmZvUG9vbCA9IFtdXG5cbiAgZnVuY3Rpb24gYWxsb2NJbmZvICgpIHtcbiAgICB2YXIgcmVzdWx0ID0gaW5mb1Bvb2wucG9wKCkgfHwgbmV3IFRleEluZm8oKVxuICAgIFRleEluZm8uY2FsbChyZXN1bHQpXG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG5cbiAgZnVuY3Rpb24gZnJlZUluZm8gKGluZm8pIHtcbiAgICBpbmZvUG9vbC5wdXNoKGluZm8pXG4gIH1cblxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIEZ1bGwgdGV4dHVyZSBvYmplY3RcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICB2YXIgdGV4dHVyZUNvdW50ID0gMFxuICB2YXIgdGV4dHVyZVNldCA9IHt9XG4gIHZhciBudW1UZXhVbml0cyA9IGxpbWl0cy5tYXhUZXh0dXJlVW5pdHNcbiAgdmFyIHRleHR1cmVVbml0cyA9IEFycmF5KG51bVRleFVuaXRzKS5tYXAoZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBudWxsXG4gIH0pXG5cbiAgZnVuY3Rpb24gUkVHTFRleHR1cmUgKHRhcmdldCkge1xuICAgIFRleEZsYWdzLmNhbGwodGhpcylcbiAgICB0aGlzLm1pcG1hc2sgPSAwXG4gICAgdGhpcy5pbnRlcm5hbGZvcm1hdCA9IEdMX1JHQkFcblxuICAgIHRoaXMuaWQgPSB0ZXh0dXJlQ291bnQrK1xuXG4gICAgdGhpcy5yZWZDb3VudCA9IDFcblxuICAgIHRoaXMudGFyZ2V0ID0gdGFyZ2V0XG4gICAgdGhpcy50ZXh0dXJlID0gZ2wuY3JlYXRlVGV4dHVyZSgpXG5cbiAgICB0aGlzLnVuaXQgPSAtMVxuICAgIHRoaXMuYmluZENvdW50ID0gMFxuXG4gICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICB0aGlzLnN0YXRzID0ge3NpemU6IDB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gdGVtcEJpbmQgKHRleHR1cmUpIHtcbiAgICBnbC5hY3RpdmVUZXh0dXJlKEdMX1RFWFRVUkUwKVxuICAgIGdsLmJpbmRUZXh0dXJlKHRleHR1cmUudGFyZ2V0LCB0ZXh0dXJlLnRleHR1cmUpXG4gIH1cblxuICBmdW5jdGlvbiB0ZW1wUmVzdG9yZSAoKSB7XG4gICAgdmFyIHByZXYgPSB0ZXh0dXJlVW5pdHNbMF1cbiAgICBpZiAocHJldikge1xuICAgICAgZ2wuYmluZFRleHR1cmUocHJldi50YXJnZXQsIHByZXYudGV4dHVyZSlcbiAgICB9IGVsc2Uge1xuICAgICAgZ2wuYmluZFRleHR1cmUoR0xfVEVYVFVSRV8yRCwgbnVsbClcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95ICh0ZXh0dXJlKSB7XG4gICAgdmFyIGhhbmRsZSA9IHRleHR1cmUudGV4dHVyZVxuICAgIFxuICAgIHZhciB1bml0ID0gdGV4dHVyZS51bml0XG4gICAgdmFyIHRhcmdldCA9IHRleHR1cmUudGFyZ2V0XG4gICAgaWYgKHVuaXQgPj0gMCkge1xuICAgICAgZ2wuYWN0aXZlVGV4dHVyZShHTF9URVhUVVJFMCArIHVuaXQpXG4gICAgICBnbC5iaW5kVGV4dHVyZSh0YXJnZXQsIG51bGwpXG4gICAgICB0ZXh0dXJlVW5pdHNbdW5pdF0gPSBudWxsXG4gICAgfVxuICAgIGdsLmRlbGV0ZVRleHR1cmUoaGFuZGxlKVxuICAgIHRleHR1cmUudGV4dHVyZSA9IG51bGxcbiAgICB0ZXh0dXJlLnBhcmFtcyA9IG51bGxcbiAgICB0ZXh0dXJlLnBpeGVscyA9IG51bGxcbiAgICB0ZXh0dXJlLnJlZkNvdW50ID0gMFxuICAgIGRlbGV0ZSB0ZXh0dXJlU2V0W3RleHR1cmUuaWRdXG4gICAgc3RhdHMudGV4dHVyZUNvdW50LS1cbiAgfVxuXG4gIGV4dGVuZChSRUdMVGV4dHVyZS5wcm90b3R5cGUsIHtcbiAgICBiaW5kOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgdGV4dHVyZSA9IHRoaXNcbiAgICAgIHRleHR1cmUuYmluZENvdW50ICs9IDFcbiAgICAgIHZhciB1bml0ID0gdGV4dHVyZS51bml0XG4gICAgICBpZiAodW5pdCA8IDApIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBudW1UZXhVbml0czsgKytpKSB7XG4gICAgICAgICAgdmFyIG90aGVyID0gdGV4dHVyZVVuaXRzW2ldXG4gICAgICAgICAgaWYgKG90aGVyKSB7XG4gICAgICAgICAgICBpZiAob3RoZXIuYmluZENvdW50ID4gMCkge1xuICAgICAgICAgICAgICBjb250aW51ZVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgb3RoZXIudW5pdCA9IC0xXG4gICAgICAgICAgfVxuICAgICAgICAgIHRleHR1cmVVbml0c1tpXSA9IHRleHR1cmVcbiAgICAgICAgICB1bml0ID0gaVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIH1cbiAgICAgICAgaWYgKHVuaXQgPj0gbnVtVGV4VW5pdHMpIHtcbiAgICAgICAgICBcbiAgICAgICAgfVxuICAgICAgICBpZiAoY29uZmlnLnByb2ZpbGUgJiYgc3RhdHMubWF4VGV4dHVyZVVuaXRzIDwgKHVuaXQgKyAxKSkge1xuICAgICAgICAgIHN0YXRzLm1heFRleHR1cmVVbml0cyA9IHVuaXQgKyAxIC8vICsxLCBzaW5jZSB0aGUgdW5pdHMgYXJlIHplcm8tYmFzZWRcbiAgICAgICAgfVxuICAgICAgICB0ZXh0dXJlLnVuaXQgPSB1bml0XG4gICAgICAgIGdsLmFjdGl2ZVRleHR1cmUoR0xfVEVYVFVSRTAgKyB1bml0KVxuICAgICAgICBnbC5iaW5kVGV4dHVyZSh0ZXh0dXJlLnRhcmdldCwgdGV4dHVyZS50ZXh0dXJlKVxuICAgICAgfVxuICAgICAgcmV0dXJuIHVuaXRcbiAgICB9LFxuXG4gICAgdW5iaW5kOiBmdW5jdGlvbiAoKSB7XG4gICAgICB0aGlzLmJpbmRDb3VudCAtPSAxXG4gICAgfSxcblxuICAgIGRlY1JlZjogZnVuY3Rpb24gKCkge1xuICAgICAgaWYgKC0tdGhpcy5yZWZDb3VudCA8PSAwKSB7XG4gICAgICAgIGRlc3Ryb3kodGhpcylcbiAgICAgIH1cbiAgICB9XG4gIH0pXG5cbiAgZnVuY3Rpb24gY3JlYXRlVGV4dHVyZTJEIChhLCBiKSB7XG4gICAgdmFyIHRleHR1cmUgPSBuZXcgUkVHTFRleHR1cmUoR0xfVEVYVFVSRV8yRClcbiAgICB0ZXh0dXJlU2V0W3RleHR1cmUuaWRdID0gdGV4dHVyZVxuICAgIHN0YXRzLnRleHR1cmVDb3VudCsrXG5cbiAgICBmdW5jdGlvbiByZWdsVGV4dHVyZTJEIChhLCBiKSB7XG4gICAgICB2YXIgdGV4SW5mbyA9IGFsbG9jSW5mbygpXG4gICAgICB2YXIgbWlwRGF0YSA9IGFsbG9jTWlwTWFwKClcblxuICAgICAgaWYgKHR5cGVvZiBhID09PSAnbnVtYmVyJykge1xuICAgICAgICBpZiAodHlwZW9mIGIgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgcGFyc2VNaXBNYXBGcm9tU2hhcGUobWlwRGF0YSwgYSB8IDAsIGIgfCAwKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbVNoYXBlKG1pcERhdGEsIGEgfCAwLCBhIHwgMClcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChhKSB7XG4gICAgICAgIFxuICAgICAgICBwYXJzZVRleEluZm8odGV4SW5mbywgYSlcbiAgICAgICAgcGFyc2VNaXBNYXBGcm9tT2JqZWN0KG1pcERhdGEsIGEpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBlbXB0eSB0ZXh0dXJlcyBnZXQgYXNzaWduZWQgYSBkZWZhdWx0IHNoYXBlIG9mIDF4MVxuICAgICAgICBwYXJzZU1pcE1hcEZyb21TaGFwZShtaXBEYXRhLCAxLCAxKVxuICAgICAgfVxuXG4gICAgICBpZiAodGV4SW5mby5nZW5NaXBtYXBzKSB7XG4gICAgICAgIG1pcERhdGEubWlwbWFzayA9IChtaXBEYXRhLndpZHRoIDw8IDEpIC0gMVxuICAgICAgfVxuICAgICAgdGV4dHVyZS5taXBtYXNrID0gbWlwRGF0YS5taXBtYXNrXG5cbiAgICAgIGNvcHlGbGFncyh0ZXh0dXJlLCBtaXBEYXRhKVxuXG4gICAgICBcbiAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQgPSBtaXBEYXRhLmludGVybmFsZm9ybWF0XG5cbiAgICAgIHJlZ2xUZXh0dXJlMkQud2lkdGggPSBtaXBEYXRhLndpZHRoXG4gICAgICByZWdsVGV4dHVyZTJELmhlaWdodCA9IG1pcERhdGEuaGVpZ2h0XG5cbiAgICAgIHRlbXBCaW5kKHRleHR1cmUpXG4gICAgICBzZXRNaXBNYXAobWlwRGF0YSwgR0xfVEVYVFVSRV8yRClcbiAgICAgIHNldFRleEluZm8odGV4SW5mbywgR0xfVEVYVFVSRV8yRClcbiAgICAgIHRlbXBSZXN0b3JlKClcblxuICAgICAgZnJlZUluZm8odGV4SW5mbylcbiAgICAgIGZyZWVNaXBNYXAobWlwRGF0YSlcblxuICAgICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICAgIHRleHR1cmUuc3RhdHMuc2l6ZSA9IGdldFRleHR1cmVTaXplKFxuICAgICAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQsXG4gICAgICAgICAgdGV4dHVyZS50eXBlLFxuICAgICAgICAgIG1pcERhdGEud2lkdGgsXG4gICAgICAgICAgbWlwRGF0YS5oZWlnaHQsXG4gICAgICAgICAgdGV4SW5mby5nZW5NaXBtYXBzLFxuICAgICAgICAgIGZhbHNlKVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmVnbFRleHR1cmUyRFxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHN1YmltYWdlIChpbWFnZSwgeF8sIHlfLCBsZXZlbF8pIHtcbiAgICAgIFxuXG4gICAgICB2YXIgeCA9IHhfIHwgMFxuICAgICAgdmFyIHkgPSB5XyB8IDBcbiAgICAgIHZhciBsZXZlbCA9IGxldmVsXyB8IDBcblxuICAgICAgdmFyIGltYWdlRGF0YSA9IGFsbG9jSW1hZ2UoKVxuICAgICAgY29weUZsYWdzKGltYWdlRGF0YSwgdGV4dHVyZSlcbiAgICAgIGltYWdlRGF0YS53aWR0aCA+Pj0gbGV2ZWxcbiAgICAgIGltYWdlRGF0YS5oZWlnaHQgPj49IGxldmVsXG4gICAgICBpbWFnZURhdGEud2lkdGggLT0geFxuICAgICAgaW1hZ2VEYXRhLmhlaWdodCAtPSB5XG4gICAgICBwYXJzZUltYWdlKGltYWdlRGF0YSwgaW1hZ2UpXG5cbiAgICAgIFxuICAgICAgXG4gICAgICBcbiAgICAgIFxuXG4gICAgICB0ZW1wQmluZCh0ZXh0dXJlKVxuICAgICAgc2V0U3ViSW1hZ2UoaW1hZ2VEYXRhLCBHTF9URVhUVVJFXzJELCB4LCB5LCBsZXZlbClcbiAgICAgIHRlbXBSZXN0b3JlKClcblxuICAgICAgZnJlZUltYWdlKGltYWdlRGF0YSlcblxuICAgICAgcmV0dXJuIHJlZ2xUZXh0dXJlMkRcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZXNpemUgKHdfLCBoXykge1xuICAgICAgdmFyIHcgPSB3XyB8IDBcbiAgICAgIHZhciBoID0gKGhfIHwgMCkgfHwgd1xuICAgICAgaWYgKHcgPT09IHRleHR1cmUud2lkdGggJiYgaCA9PT0gdGV4dHVyZS5oZWlnaHQpIHtcbiAgICAgICAgcmV0dXJuIHJlZ2xUZXh0dXJlMkRcbiAgICAgIH1cblxuICAgICAgcmVnbFRleHR1cmUyRC53aWR0aCA9IHRleHR1cmUud2lkdGggPSB3XG4gICAgICByZWdsVGV4dHVyZTJELmhlaWdodCA9IHRleHR1cmUuaGVpZ2h0ID0gaFxuXG4gICAgICB0ZW1wQmluZCh0ZXh0dXJlKVxuICAgICAgZm9yICh2YXIgaSA9IDA7IHRleHR1cmUubWlwbWFzayA+PiBpOyArK2kpIHtcbiAgICAgICAgZ2wudGV4SW1hZ2UyRChcbiAgICAgICAgICBHTF9URVhUVVJFXzJELFxuICAgICAgICAgIGksXG4gICAgICAgICAgdGV4dHVyZS5mb3JtYXQsXG4gICAgICAgICAgdyA+PiBpLFxuICAgICAgICAgIGggPj4gaSxcbiAgICAgICAgICAwLFxuICAgICAgICAgIHRleHR1cmUuZm9ybWF0LFxuICAgICAgICAgIHRleHR1cmUudHlwZSxcbiAgICAgICAgICBudWxsKVxuICAgICAgfVxuICAgICAgdGVtcFJlc3RvcmUoKVxuXG4gICAgICAvLyBhbHNvLCByZWNvbXB1dGUgdGhlIHRleHR1cmUgc2l6ZS5cbiAgICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgICB0ZXh0dXJlLnN0YXRzLnNpemUgPSBnZXRUZXh0dXJlU2l6ZShcbiAgICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0LFxuICAgICAgICAgIHRleHR1cmUudHlwZSxcbiAgICAgICAgICB3LFxuICAgICAgICAgIGgsXG4gICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgZmFsc2UpXG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZWdsVGV4dHVyZTJEXG4gICAgfVxuXG4gICAgcmVnbFRleHR1cmUyRChhLCBiKVxuXG4gICAgcmVnbFRleHR1cmUyRC5zdWJpbWFnZSA9IHN1YmltYWdlXG4gICAgcmVnbFRleHR1cmUyRC5yZXNpemUgPSByZXNpemVcbiAgICByZWdsVGV4dHVyZTJELl9yZWdsVHlwZSA9ICd0ZXh0dXJlMmQnXG4gICAgcmVnbFRleHR1cmUyRC5fdGV4dHVyZSA9IHRleHR1cmVcbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgIHJlZ2xUZXh0dXJlMkQuc3RhdHMgPSB0ZXh0dXJlLnN0YXRzXG4gICAgfVxuICAgIHJlZ2xUZXh0dXJlMkQuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHRleHR1cmUuZGVjUmVmKClcbiAgICB9XG5cbiAgICByZXR1cm4gcmVnbFRleHR1cmUyRFxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlVGV4dHVyZUN1YmUgKGEwLCBhMSwgYTIsIGEzLCBhNCwgYTUpIHtcbiAgICB2YXIgdGV4dHVyZSA9IG5ldyBSRUdMVGV4dHVyZShHTF9URVhUVVJFX0NVQkVfTUFQKVxuICAgIHRleHR1cmVTZXRbdGV4dHVyZS5pZF0gPSB0ZXh0dXJlXG4gICAgc3RhdHMuY3ViZUNvdW50KytcblxuICAgIHZhciBmYWNlcyA9IG5ldyBBcnJheSg2KVxuXG4gICAgZnVuY3Rpb24gcmVnbFRleHR1cmVDdWJlIChhMCwgYTEsIGEyLCBhMywgYTQsIGE1KSB7XG4gICAgICB2YXIgaVxuICAgICAgdmFyIHRleEluZm8gPSBhbGxvY0luZm8oKVxuICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICBmYWNlc1tpXSA9IGFsbG9jTWlwTWFwKClcbiAgICAgIH1cblxuICAgICAgaWYgKHR5cGVvZiBhMCA9PT0gJ251bWJlcicgfHwgIWEwKSB7XG4gICAgICAgIHZhciBzID0gKGEwIHwgMCkgfHwgMVxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgICAgcGFyc2VNaXBNYXBGcm9tU2hhcGUoZmFjZXNbaV0sIHMsIHMpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGEwID09PSAnb2JqZWN0Jykge1xuICAgICAgICBpZiAoYTEpIHtcbiAgICAgICAgICBwYXJzZU1pcE1hcEZyb21PYmplY3QoZmFjZXNbMF0sIGEwKVxuICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbU9iamVjdChmYWNlc1sxXSwgYTEpXG4gICAgICAgICAgcGFyc2VNaXBNYXBGcm9tT2JqZWN0KGZhY2VzWzJdLCBhMilcbiAgICAgICAgICBwYXJzZU1pcE1hcEZyb21PYmplY3QoZmFjZXNbM10sIGEzKVxuICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbU9iamVjdChmYWNlc1s0XSwgYTQpXG4gICAgICAgICAgcGFyc2VNaXBNYXBGcm9tT2JqZWN0KGZhY2VzWzVdLCBhNSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwYXJzZVRleEluZm8odGV4SW5mbywgYTApXG4gICAgICAgICAgcGFyc2VGbGFncyh0ZXh0dXJlLCBhMClcbiAgICAgICAgICBpZiAoJ2ZhY2VzJyBpbiBhMCkge1xuICAgICAgICAgICAgdmFyIGZhY2VfaW5wdXQgPSBhMC5mYWNlc1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBjb3B5RmxhZ3MoZmFjZXNbaV0sIHRleHR1cmUpXG4gICAgICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbU9iamVjdChmYWNlc1tpXSwgZmFjZV9pbnB1dFtpXSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICAgICAgICBwYXJzZU1pcE1hcEZyb21PYmplY3QoZmFjZXNbaV0sIGEwKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgXG4gICAgICB9XG5cbiAgICAgIGNvcHlGbGFncyh0ZXh0dXJlLCBmYWNlc1swXSlcbiAgICAgIGlmICh0ZXhJbmZvLmdlbk1pcG1hcHMpIHtcbiAgICAgICAgdGV4dHVyZS5taXBtYXNrID0gKGZhY2VzWzBdLndpZHRoIDw8IDEpIC0gMVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGV4dHVyZS5taXBtYXNrID0gZmFjZXNbMF0ubWlwbWFza1xuICAgICAgfVxuXG4gICAgICBcbiAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQgPSBmYWNlc1swXS5pbnRlcm5hbGZvcm1hdFxuXG4gICAgICByZWdsVGV4dHVyZUN1YmUud2lkdGggPSBmYWNlc1swXS53aWR0aFxuICAgICAgcmVnbFRleHR1cmVDdWJlLmhlaWdodCA9IGZhY2VzWzBdLmhlaWdodFxuXG4gICAgICB0ZW1wQmluZCh0ZXh0dXJlKVxuICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICBzZXRNaXBNYXAoZmFjZXNbaV0sIEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCArIGkpXG4gICAgICB9XG4gICAgICBzZXRUZXhJbmZvKHRleEluZm8sIEdMX1RFWFRVUkVfQ1VCRV9NQVApXG4gICAgICB0ZW1wUmVzdG9yZSgpXG5cbiAgICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgICB0ZXh0dXJlLnN0YXRzLnNpemUgPSBnZXRUZXh0dXJlU2l6ZShcbiAgICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0LFxuICAgICAgICAgIHRleHR1cmUudHlwZSxcbiAgICAgICAgICByZWdsVGV4dHVyZUN1YmUud2lkdGgsXG4gICAgICAgICAgcmVnbFRleHR1cmVDdWJlLmhlaWdodCxcbiAgICAgICAgICB0ZXhJbmZvLmdlbk1pcG1hcHMsXG4gICAgICAgICAgdHJ1ZSlcbiAgICAgIH1cblxuICAgICAgZnJlZUluZm8odGV4SW5mbylcblxuICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICBmcmVlTWlwTWFwKGZhY2VzW2ldKVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmVnbFRleHR1cmVDdWJlXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc3ViaW1hZ2UgKGZhY2UsIGltYWdlLCB4XywgeV8sIGxldmVsXykge1xuICAgICAgXG4gICAgICBcblxuICAgICAgdmFyIHggPSB4XyB8IDBcbiAgICAgIHZhciB5ID0geV8gfCAwXG4gICAgICB2YXIgbGV2ZWwgPSBsZXZlbF8gfCAwXG5cbiAgICAgIHZhciBpbWFnZURhdGEgPSBhbGxvY0ltYWdlKClcbiAgICAgIGNvcHlGbGFncyhpbWFnZURhdGEsIHRleHR1cmUpXG4gICAgICBpbWFnZURhdGEud2lkdGggPj49IGxldmVsXG4gICAgICBpbWFnZURhdGEuaGVpZ2h0ID4+PSBsZXZlbFxuICAgICAgaW1hZ2VEYXRhLndpZHRoIC09IHhcbiAgICAgIGltYWdlRGF0YS5oZWlnaHQgLT0geVxuICAgICAgcGFyc2VJbWFnZShpbWFnZURhdGEsIGltYWdlKVxuXG4gICAgICBcbiAgICAgIFxuICAgICAgXG4gICAgICBcblxuICAgICAgdGVtcEJpbmQodGV4dHVyZSlcbiAgICAgIHNldFN1YkltYWdlKGltYWdlRGF0YSwgR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YICsgZmFjZSwgeCwgeSwgbGV2ZWwpXG4gICAgICB0ZW1wUmVzdG9yZSgpXG5cbiAgICAgIGZyZWVJbWFnZShpbWFnZURhdGEpXG5cbiAgICAgIHJldHVybiByZWdsVGV4dHVyZUN1YmVcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZXNpemUgKHJhZGl1c18pIHtcbiAgICAgIHZhciByYWRpdXMgPSByYWRpdXNfIHwgMFxuICAgICAgaWYgKHJhZGl1cyA9PT0gdGV4dHVyZS53aWR0aCkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgcmVnbFRleHR1cmVDdWJlLndpZHRoID0gdGV4dHVyZS53aWR0aCA9IHJhZGl1c1xuICAgICAgcmVnbFRleHR1cmVDdWJlLmhlaWdodCA9IHRleHR1cmUuaGVpZ2h0ID0gcmFkaXVzXG5cbiAgICAgIHRlbXBCaW5kKHRleHR1cmUpXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICBmb3IgKHZhciBqID0gMDsgdGV4dHVyZS5taXBtYXNrID4+IGo7ICsraikge1xuICAgICAgICAgIGdsLnRleEltYWdlMkQoXG4gICAgICAgICAgICBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1ggKyBpLFxuICAgICAgICAgICAgaixcbiAgICAgICAgICAgIHRleHR1cmUuZm9ybWF0LFxuICAgICAgICAgICAgcmFkaXVzID4+IGosXG4gICAgICAgICAgICByYWRpdXMgPj4gaixcbiAgICAgICAgICAgIDAsXG4gICAgICAgICAgICB0ZXh0dXJlLmZvcm1hdCxcbiAgICAgICAgICAgIHRleHR1cmUudHlwZSxcbiAgICAgICAgICAgIG51bGwpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHRlbXBSZXN0b3JlKClcblxuICAgICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICAgIHRleHR1cmUuc3RhdHMuc2l6ZSA9IGdldFRleHR1cmVTaXplKFxuICAgICAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQsXG4gICAgICAgICAgdGV4dHVyZS50eXBlLFxuICAgICAgICAgIHJlZ2xUZXh0dXJlQ3ViZS53aWR0aCxcbiAgICAgICAgICByZWdsVGV4dHVyZUN1YmUuaGVpZ2h0LFxuICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgIHRydWUpXG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZWdsVGV4dHVyZUN1YmVcbiAgICB9XG5cbiAgICByZWdsVGV4dHVyZUN1YmUoYTAsIGExLCBhMiwgYTMsIGE0LCBhNSlcblxuICAgIHJlZ2xUZXh0dXJlQ3ViZS5zdWJpbWFnZSA9IHN1YmltYWdlXG4gICAgcmVnbFRleHR1cmVDdWJlLnJlc2l6ZSA9IHJlc2l6ZVxuICAgIHJlZ2xUZXh0dXJlQ3ViZS5fcmVnbFR5cGUgPSAndGV4dHVyZUN1YmUnXG4gICAgcmVnbFRleHR1cmVDdWJlLl90ZXh0dXJlID0gdGV4dHVyZVxuICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgcmVnbFRleHR1cmVDdWJlLnN0YXRzID0gdGV4dHVyZS5zdGF0c1xuICAgIH1cbiAgICByZWdsVGV4dHVyZUN1YmUuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHRleHR1cmUuZGVjUmVmKClcbiAgICB9XG5cbiAgICByZXR1cm4gcmVnbFRleHR1cmVDdWJlXG4gIH1cblxuICAvLyBDYWxsZWQgd2hlbiByZWdsIGlzIGRlc3Ryb3llZFxuICBmdW5jdGlvbiBkZXN0cm95VGV4dHVyZXMgKCkge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbnVtVGV4VW5pdHM7ICsraSkge1xuICAgICAgZ2wuYWN0aXZlVGV4dHVyZShHTF9URVhUVVJFMCArIGkpXG4gICAgICBnbC5iaW5kVGV4dHVyZShHTF9URVhUVVJFXzJELCBudWxsKVxuICAgICAgdGV4dHVyZVVuaXRzW2ldID0gbnVsbFxuICAgIH1cbiAgICB2YWx1ZXModGV4dHVyZVNldCkuZm9yRWFjaChkZXN0cm95KVxuXG4gICAgc3RhdHMuY3ViZUNvdW50ID0gMFxuICAgIHN0YXRzLnRleHR1cmVDb3VudCA9IDBcbiAgfVxuXG4gIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgIHN0YXRzLmdldFRvdGFsVGV4dHVyZVNpemUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgdG90YWwgPSAwXG4gICAgICBPYmplY3Qua2V5cyh0ZXh0dXJlU2V0KS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgdG90YWwgKz0gdGV4dHVyZVNldFtrZXldLnN0YXRzLnNpemVcbiAgICAgIH0pXG4gICAgICByZXR1cm4gdG90YWxcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNyZWF0ZTJEOiBjcmVhdGVUZXh0dXJlMkQsXG4gICAgY3JlYXRlQ3ViZTogY3JlYXRlVGV4dHVyZUN1YmUsXG4gICAgY2xlYXI6IGRlc3Ryb3lUZXh0dXJlcyxcbiAgICBnZXRUZXh0dXJlOiBmdW5jdGlvbiAod3JhcHBlcikge1xuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG4gIH1cbn1cbiIsInZhciBHTF9RVUVSWV9SRVNVTFRfRVhUID0gMHg4ODY2XG52YXIgR0xfUVVFUllfUkVTVUxUX0FWQUlMQUJMRV9FWFQgPSAweDg4NjdcbnZhciBHTF9USU1FX0VMQVBTRURfRVhUID0gMHg4OEJGXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGdsLCBleHRlbnNpb25zKSB7XG4gIHZhciBleHRUaW1lciA9IGV4dGVuc2lvbnMuZXh0X2Rpc2pvaW50X3RpbWVyX3F1ZXJ5XG5cbiAgaWYgKCFleHRUaW1lcikge1xuICAgIHJldHVybiBudWxsXG4gIH1cblxuICAvLyBRVUVSWSBQT09MIEJFR0lOXG4gIHZhciBxdWVyeVBvb2wgPSBbXVxuICBmdW5jdGlvbiBhbGxvY1F1ZXJ5ICgpIHtcbiAgICByZXR1cm4gcXVlcnlQb29sLnBvcCgpIHx8IGV4dFRpbWVyLmNyZWF0ZVF1ZXJ5RVhUKClcbiAgfVxuICBmdW5jdGlvbiBmcmVlUXVlcnkgKHF1ZXJ5KSB7XG4gICAgcXVlcnlQb29sLnB1c2gocXVlcnkpXG4gIH1cbiAgLy8gUVVFUlkgUE9PTCBFTkRcblxuICB2YXIgcGVuZGluZ1F1ZXJpZXMgPSBbXVxuICBmdW5jdGlvbiBiZWdpblF1ZXJ5IChzdGF0cykge1xuICAgIHZhciBxdWVyeSA9IGFsbG9jUXVlcnkoKVxuICAgIGV4dFRpbWVyLmJlZ2luUXVlcnlFWFQoR0xfVElNRV9FTEFQU0VEX0VYVCwgcXVlcnkpXG4gICAgcGVuZGluZ1F1ZXJpZXMucHVzaChxdWVyeSlcbiAgICBwdXNoU2NvcGVTdGF0cyhwZW5kaW5nUXVlcmllcy5sZW5ndGggLSAxLCBwZW5kaW5nUXVlcmllcy5sZW5ndGgsIHN0YXRzKVxuICB9XG5cbiAgZnVuY3Rpb24gZW5kUXVlcnkgKCkge1xuICAgIGV4dFRpbWVyLmVuZFF1ZXJ5RVhUKEdMX1RJTUVfRUxBUFNFRF9FWFQpXG4gIH1cblxuICAvL1xuICAvLyBQZW5kaW5nIHN0YXRzIHBvb2wuXG4gIC8vXG4gIGZ1bmN0aW9uIFBlbmRpbmdTdGF0cyAoKSB7XG4gICAgdGhpcy5zdGFydFF1ZXJ5SW5kZXggPSAtMVxuICAgIHRoaXMuZW5kUXVlcnlJbmRleCA9IC0xXG4gICAgdGhpcy5zdW0gPSAwXG4gICAgdGhpcy5zdGF0cyA9IG51bGxcbiAgfVxuICB2YXIgcGVuZGluZ1N0YXRzUG9vbCA9IFtdXG4gIGZ1bmN0aW9uIGFsbG9jUGVuZGluZ1N0YXRzICgpIHtcbiAgICByZXR1cm4gcGVuZGluZ1N0YXRzUG9vbC5wb3AoKSB8fCBuZXcgUGVuZGluZ1N0YXRzKClcbiAgfVxuICBmdW5jdGlvbiBmcmVlUGVuZGluZ1N0YXRzIChwZW5kaW5nU3RhdHMpIHtcbiAgICBwZW5kaW5nU3RhdHNQb29sLnB1c2gocGVuZGluZ1N0YXRzKVxuICB9XG4gIC8vIFBlbmRpbmcgc3RhdHMgcG9vbCBlbmRcblxuICB2YXIgcGVuZGluZ1N0YXRzID0gW11cbiAgZnVuY3Rpb24gcHVzaFNjb3BlU3RhdHMgKHN0YXJ0LCBlbmQsIHN0YXRzKSB7XG4gICAgdmFyIHBzID0gYWxsb2NQZW5kaW5nU3RhdHMoKVxuICAgIHBzLnN0YXJ0UXVlcnlJbmRleCA9IHN0YXJ0XG4gICAgcHMuZW5kUXVlcnlJbmRleCA9IGVuZFxuICAgIHBzLnN1bSA9IDBcbiAgICBwcy5zdGF0cyA9IHN0YXRzXG4gICAgcGVuZGluZ1N0YXRzLnB1c2gocHMpXG4gIH1cblxuICAvLyB3ZSBzaG91bGQgY2FsbCB0aGlzIGF0IHRoZSBiZWdpbm5pbmcgb2YgdGhlIGZyYW1lLFxuICAvLyBpbiBvcmRlciB0byB1cGRhdGUgZ3B1VGltZVxuICB2YXIgdGltZVN1bSA9IFtdXG4gIHZhciBxdWVyeVB0ciA9IFtdXG4gIGZ1bmN0aW9uIHVwZGF0ZSAoKSB7XG4gICAgdmFyIHB0ciwgaVxuXG4gICAgdmFyIG4gPSBwZW5kaW5nUXVlcmllcy5sZW5ndGhcbiAgICBpZiAobiA9PT0gMCkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgLy8gUmVzZXJ2ZSBzcGFjZVxuICAgIHF1ZXJ5UHRyLmxlbmd0aCA9IE1hdGgubWF4KHF1ZXJ5UHRyLmxlbmd0aCwgbiArIDEpXG4gICAgdGltZVN1bS5sZW5ndGggPSBNYXRoLm1heCh0aW1lU3VtLmxlbmd0aCwgbiArIDEpXG4gICAgdGltZVN1bVswXSA9IDBcbiAgICBxdWVyeVB0clswXSA9IDBcblxuICAgIC8vIFVwZGF0ZSBhbGwgcGVuZGluZyB0aW1lciBxdWVyaWVzXG4gICAgdmFyIHF1ZXJ5VGltZSA9IDBcbiAgICBwdHIgPSAwXG4gICAgZm9yIChpID0gMDsgaSA8IHBlbmRpbmdRdWVyaWVzLmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgcXVlcnkgPSBwZW5kaW5nUXVlcmllc1tpXVxuICAgICAgaWYgKGV4dFRpbWVyLmdldFF1ZXJ5T2JqZWN0RVhUKHF1ZXJ5LCBHTF9RVUVSWV9SRVNVTFRfQVZBSUxBQkxFX0VYVCkpIHtcbiAgICAgICAgcXVlcnlUaW1lICs9IGV4dFRpbWVyLmdldFF1ZXJ5T2JqZWN0RVhUKHF1ZXJ5LCBHTF9RVUVSWV9SRVNVTFRfRVhUKVxuICAgICAgICBmcmVlUXVlcnkocXVlcnkpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwZW5kaW5nUXVlcmllc1twdHIrK10gPSBxdWVyeVxuICAgICAgfVxuICAgICAgdGltZVN1bVtpICsgMV0gPSBxdWVyeVRpbWVcbiAgICAgIHF1ZXJ5UHRyW2kgKyAxXSA9IHB0clxuICAgIH1cbiAgICBwZW5kaW5nUXVlcmllcy5sZW5ndGggPSBwdHJcblxuICAgIC8vIFVwZGF0ZSBhbGwgcGVuZGluZyBzdGF0IHF1ZXJpZXNcbiAgICBwdHIgPSAwXG4gICAgZm9yIChpID0gMDsgaSA8IHBlbmRpbmdTdGF0cy5sZW5ndGg7ICsraSkge1xuICAgICAgdmFyIHN0YXRzID0gcGVuZGluZ1N0YXRzW2ldXG4gICAgICB2YXIgc3RhcnQgPSBzdGF0cy5zdGFydFF1ZXJ5SW5kZXhcbiAgICAgIHZhciBlbmQgPSBzdGF0cy5lbmRRdWVyeUluZGV4XG4gICAgICBzdGF0cy5zdW0gKz0gdGltZVN1bVtlbmRdIC0gdGltZVN1bVtzdGFydF1cbiAgICAgIHZhciBzdGFydFB0ciA9IHF1ZXJ5UHRyW3N0YXJ0XVxuICAgICAgdmFyIGVuZFB0ciA9IHF1ZXJ5UHRyW2VuZF1cbiAgICAgIGlmIChlbmRQdHIgPT09IHN0YXJ0UHRyKSB7XG4gICAgICAgIHN0YXRzLnN0YXRzLmdwdVRpbWUgKz0gc3RhdHMuc3VtIC8gMWU2XG4gICAgICAgIGZyZWVQZW5kaW5nU3RhdHMoc3RhdHMpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzdGF0cy5zdGFydFF1ZXJ5SW5kZXggPSBzdGFydFB0clxuICAgICAgICBzdGF0cy5lbmRRdWVyeUluZGV4ID0gZW5kUHRyXG4gICAgICAgIHBlbmRpbmdTdGF0c1twdHIrK10gPSBzdGF0c1xuICAgICAgfVxuICAgIH1cbiAgICBwZW5kaW5nU3RhdHMubGVuZ3RoID0gcHRyXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGJlZ2luUXVlcnk6IGJlZ2luUXVlcnksXG4gICAgZW5kUXVlcnk6IGVuZFF1ZXJ5LFxuICAgIHB1c2hTY29wZVN0YXRzOiBwdXNoU2NvcGVTdGF0cyxcbiAgICB1cGRhdGU6IHVwZGF0ZSxcbiAgICBnZXROdW1QZW5kaW5nUXVlcmllczogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIHBlbmRpbmdRdWVyaWVzLmxlbmd0aFxuICAgIH0sXG4gICAgY2xlYXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHF1ZXJ5UG9vbC5wdXNoLmFwcGx5KHF1ZXJ5UG9vbCwgcGVuZGluZ1F1ZXJpZXMpXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHF1ZXJ5UG9vbC5sZW5ndGg7IGkrKykge1xuICAgICAgICBleHRUaW1lci5kZWxldGVRdWVyeUVYVChxdWVyeVBvb2xbaV0pXG4gICAgICB9XG4gICAgICBwZW5kaW5nUXVlcmllcy5sZW5ndGggPSAwXG4gICAgICBxdWVyeVBvb2wubGVuZ3RoID0gMFxuICAgIH1cbiAgfVxufVxuIiwiLyogZ2xvYmFscyBwZXJmb3JtYW5jZSAqL1xubW9kdWxlLmV4cG9ydHMgPVxuICAodHlwZW9mIHBlcmZvcm1hbmNlICE9PSAndW5kZWZpbmVkJyAmJiBwZXJmb3JtYW5jZS5ub3cpXG4gID8gZnVuY3Rpb24gKCkgeyByZXR1cm4gcGVyZm9ybWFuY2Uubm93KCkgfVxuICA6IGZ1bmN0aW9uICgpIHsgcmV0dXJuICsobmV3IERhdGUoKSkgfVxuIiwidmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vZXh0ZW5kJylcblxuZnVuY3Rpb24gc2xpY2UgKHgpIHtcbiAgcmV0dXJuIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKHgpXG59XG5cbmZ1bmN0aW9uIGpvaW4gKHgpIHtcbiAgcmV0dXJuIHNsaWNlKHgpLmpvaW4oJycpXG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY3JlYXRlRW52aXJvbm1lbnQgKCkge1xuICAvLyBVbmlxdWUgdmFyaWFibGUgaWQgY291bnRlclxuICB2YXIgdmFyQ291bnRlciA9IDBcblxuICAvLyBMaW5rZWQgdmFsdWVzIGFyZSBwYXNzZWQgZnJvbSB0aGlzIHNjb3BlIGludG8gdGhlIGdlbmVyYXRlZCBjb2RlIGJsb2NrXG4gIC8vIENhbGxpbmcgbGluaygpIHBhc3NlcyBhIHZhbHVlIGludG8gdGhlIGdlbmVyYXRlZCBzY29wZSBhbmQgcmV0dXJuc1xuICAvLyB0aGUgdmFyaWFibGUgbmFtZSB3aGljaCBpdCBpcyBib3VuZCB0b1xuICB2YXIgbGlua2VkTmFtZXMgPSBbXVxuICB2YXIgbGlua2VkVmFsdWVzID0gW11cbiAgZnVuY3Rpb24gbGluayAodmFsdWUpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxpbmtlZFZhbHVlcy5sZW5ndGg7ICsraSkge1xuICAgICAgaWYgKGxpbmtlZFZhbHVlc1tpXSA9PT0gdmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIGxpbmtlZE5hbWVzW2ldXG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFyIG5hbWUgPSAnZycgKyAodmFyQ291bnRlcisrKVxuICAgIGxpbmtlZE5hbWVzLnB1c2gobmFtZSlcbiAgICBsaW5rZWRWYWx1ZXMucHVzaCh2YWx1ZSlcbiAgICByZXR1cm4gbmFtZVxuICB9XG5cbiAgLy8gY3JlYXRlIGEgY29kZSBibG9ja1xuICBmdW5jdGlvbiBibG9jayAoKSB7XG4gICAgdmFyIGNvZGUgPSBbXVxuICAgIGZ1bmN0aW9uIHB1c2ggKCkge1xuICAgICAgY29kZS5wdXNoLmFwcGx5KGNvZGUsIHNsaWNlKGFyZ3VtZW50cykpXG4gICAgfVxuXG4gICAgdmFyIHZhcnMgPSBbXVxuICAgIGZ1bmN0aW9uIGRlZiAoKSB7XG4gICAgICB2YXIgbmFtZSA9ICd2JyArICh2YXJDb3VudGVyKyspXG4gICAgICB2YXJzLnB1c2gobmFtZSlcblxuICAgICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGNvZGUucHVzaChuYW1lLCAnPScpXG4gICAgICAgIGNvZGUucHVzaC5hcHBseShjb2RlLCBzbGljZShhcmd1bWVudHMpKVxuICAgICAgICBjb2RlLnB1c2goJzsnKVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gbmFtZVxuICAgIH1cblxuICAgIHJldHVybiBleHRlbmQocHVzaCwge1xuICAgICAgZGVmOiBkZWYsXG4gICAgICB0b1N0cmluZzogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gam9pbihbXG4gICAgICAgICAgKHZhcnMubGVuZ3RoID4gMCA/ICd2YXIgJyArIHZhcnMgKyAnOycgOiAnJyksXG4gICAgICAgICAgam9pbihjb2RlKVxuICAgICAgICBdKVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiBzY29wZSAoKSB7XG4gICAgdmFyIGVudHJ5ID0gYmxvY2soKVxuICAgIHZhciBleGl0ID0gYmxvY2soKVxuXG4gICAgdmFyIGVudHJ5VG9TdHJpbmcgPSBlbnRyeS50b1N0cmluZ1xuICAgIHZhciBleGl0VG9TdHJpbmcgPSBleGl0LnRvU3RyaW5nXG5cbiAgICBmdW5jdGlvbiBzYXZlIChvYmplY3QsIHByb3ApIHtcbiAgICAgIGV4aXQob2JqZWN0LCBwcm9wLCAnPScsIGVudHJ5LmRlZihvYmplY3QsIHByb3ApLCAnOycpXG4gICAgfVxuXG4gICAgcmV0dXJuIGV4dGVuZChmdW5jdGlvbiAoKSB7XG4gICAgICBlbnRyeS5hcHBseShlbnRyeSwgc2xpY2UoYXJndW1lbnRzKSlcbiAgICB9LCB7XG4gICAgICBkZWY6IGVudHJ5LmRlZixcbiAgICAgIGVudHJ5OiBlbnRyeSxcbiAgICAgIGV4aXQ6IGV4aXQsXG4gICAgICBzYXZlOiBzYXZlLFxuICAgICAgc2V0OiBmdW5jdGlvbiAob2JqZWN0LCBwcm9wLCB2YWx1ZSkge1xuICAgICAgICBzYXZlKG9iamVjdCwgcHJvcClcbiAgICAgICAgZW50cnkob2JqZWN0LCBwcm9wLCAnPScsIHZhbHVlLCAnOycpXG4gICAgICB9LFxuICAgICAgdG9TdHJpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIGVudHJ5VG9TdHJpbmcoKSArIGV4aXRUb1N0cmluZygpXG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGNvbmRpdGlvbmFsICgpIHtcbiAgICB2YXIgcHJlZCA9IGpvaW4oYXJndW1lbnRzKVxuICAgIHZhciB0aGVuQmxvY2sgPSBzY29wZSgpXG4gICAgdmFyIGVsc2VCbG9jayA9IHNjb3BlKClcblxuICAgIHZhciB0aGVuVG9TdHJpbmcgPSB0aGVuQmxvY2sudG9TdHJpbmdcbiAgICB2YXIgZWxzZVRvU3RyaW5nID0gZWxzZUJsb2NrLnRvU3RyaW5nXG5cbiAgICByZXR1cm4gZXh0ZW5kKHRoZW5CbG9jaywge1xuICAgICAgdGhlbjogZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGVuQmxvY2suYXBwbHkodGhlbkJsb2NrLCBzbGljZShhcmd1bWVudHMpKVxuICAgICAgICByZXR1cm4gdGhpc1xuICAgICAgfSxcbiAgICAgIGVsc2U6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgZWxzZUJsb2NrLmFwcGx5KGVsc2VCbG9jaywgc2xpY2UoYXJndW1lbnRzKSlcbiAgICAgICAgcmV0dXJuIHRoaXNcbiAgICAgIH0sXG4gICAgICB0b1N0cmluZzogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZWxzZUNsYXVzZSA9IGVsc2VUb1N0cmluZygpXG4gICAgICAgIGlmIChlbHNlQ2xhdXNlKSB7XG4gICAgICAgICAgZWxzZUNsYXVzZSA9ICdlbHNleycgKyBlbHNlQ2xhdXNlICsgJ30nXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGpvaW4oW1xuICAgICAgICAgICdpZignLCBwcmVkLCAnKXsnLFxuICAgICAgICAgIHRoZW5Ub1N0cmluZygpLFxuICAgICAgICAgICd9JywgZWxzZUNsYXVzZVxuICAgICAgICBdKVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICAvLyBwcm9jZWR1cmUgbGlzdFxuICB2YXIgZ2xvYmFsQmxvY2sgPSBibG9jaygpXG4gIHZhciBwcm9jZWR1cmVzID0ge31cbiAgZnVuY3Rpb24gcHJvYyAobmFtZSwgY291bnQpIHtcbiAgICB2YXIgYXJncyA9IFtdXG4gICAgZnVuY3Rpb24gYXJnICgpIHtcbiAgICAgIHZhciBuYW1lID0gJ2EnICsgYXJncy5sZW5ndGhcbiAgICAgIGFyZ3MucHVzaChuYW1lKVxuICAgICAgcmV0dXJuIG5hbWVcbiAgICB9XG5cbiAgICBjb3VudCA9IGNvdW50IHx8IDBcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNvdW50OyArK2kpIHtcbiAgICAgIGFyZygpXG4gICAgfVxuXG4gICAgdmFyIGJvZHkgPSBzY29wZSgpXG4gICAgdmFyIGJvZHlUb1N0cmluZyA9IGJvZHkudG9TdHJpbmdcblxuICAgIHZhciByZXN1bHQgPSBwcm9jZWR1cmVzW25hbWVdID0gZXh0ZW5kKGJvZHksIHtcbiAgICAgIGFyZzogYXJnLFxuICAgICAgdG9TdHJpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIGpvaW4oW1xuICAgICAgICAgICdmdW5jdGlvbignLCBhcmdzLmpvaW4oKSwgJyl7JyxcbiAgICAgICAgICBib2R5VG9TdHJpbmcoKSxcbiAgICAgICAgICAnfSdcbiAgICAgICAgXSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG5cbiAgZnVuY3Rpb24gY29tcGlsZSAoKSB7XG4gICAgdmFyIGNvZGUgPSBbJ1widXNlIHN0cmljdFwiOycsXG4gICAgICBnbG9iYWxCbG9jayxcbiAgICAgICdyZXR1cm4geyddXG4gICAgT2JqZWN0LmtleXMocHJvY2VkdXJlcykuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgY29kZS5wdXNoKCdcIicsIG5hbWUsICdcIjonLCBwcm9jZWR1cmVzW25hbWVdLnRvU3RyaW5nKCksICcsJylcbiAgICB9KVxuICAgIGNvZGUucHVzaCgnfScpXG4gICAgdmFyIHNyYyA9IGpvaW4oY29kZSlcbiAgICAgIC5yZXBsYWNlKC87L2csICc7XFxuJylcbiAgICAgIC5yZXBsYWNlKC99L2csICd9XFxuJylcbiAgICAgIC5yZXBsYWNlKC97L2csICd7XFxuJylcbiAgICB2YXIgcHJvYyA9IEZ1bmN0aW9uLmFwcGx5KG51bGwsIGxpbmtlZE5hbWVzLmNvbmNhdChzcmMpKVxuICAgIHJldHVybiBwcm9jLmFwcGx5KG51bGwsIGxpbmtlZFZhbHVlcylcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgZ2xvYmFsOiBnbG9iYWxCbG9jayxcbiAgICBsaW5rOiBsaW5rLFxuICAgIGJsb2NrOiBibG9jayxcbiAgICBwcm9jOiBwcm9jLFxuICAgIHNjb3BlOiBzY29wZSxcbiAgICBjb25kOiBjb25kaXRpb25hbCxcbiAgICBjb21waWxlOiBjb21waWxlXG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGJhc2UsIG9wdHMpIHtcbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhvcHRzKVxuICBmb3IgKHZhciBpID0gMDsgaSA8IGtleXMubGVuZ3RoOyArK2kpIHtcbiAgICBiYXNlW2tleXNbaV1dID0gb3B0c1trZXlzW2ldXVxuICB9XG4gIHJldHVybiBiYXNlXG59XG4iLCJ2YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi9pcy10eXBlZC1hcnJheScpXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGlzQXJyYXlMaWtlIChzKSB7XG4gIHJldHVybiBBcnJheS5pc0FycmF5KHMpIHx8IGlzVHlwZWRBcnJheShzKVxufVxuIiwidmFyIGlzVHlwZWRBcnJheSA9IHJlcXVpcmUoJy4vaXMtdHlwZWQtYXJyYXknKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGlzTkRBcnJheUxpa2UgKG9iaikge1xuICByZXR1cm4gKFxuICAgICEhb2JqICYmXG4gICAgdHlwZW9mIG9iaiA9PT0gJ29iamVjdCcgJiZcbiAgICBBcnJheS5pc0FycmF5KG9iai5zaGFwZSkgJiZcbiAgICBBcnJheS5pc0FycmF5KG9iai5zdHJpZGUpICYmXG4gICAgdHlwZW9mIG9iai5vZmZzZXQgPT09ICdudW1iZXInICYmXG4gICAgb2JqLnNoYXBlLmxlbmd0aCA9PT0gb2JqLnN0cmlkZS5sZW5ndGggJiZcbiAgICAoQXJyYXkuaXNBcnJheShvYmouZGF0YSkgfHxcbiAgICAgIGlzVHlwZWRBcnJheShvYmouZGF0YSkpKVxufVxuIiwidmFyIGR0eXBlcyA9IHJlcXVpcmUoJy4uL2NvbnN0YW50cy9hcnJheXR5cGVzLmpzb24nKVxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoeCkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHgpIGluIGR0eXBlc1xufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBsb29wIChuLCBmKSB7XG4gIHZhciByZXN1bHQgPSBBcnJheShuKVxuICBmb3IgKHZhciBpID0gMDsgaSA8IG47ICsraSkge1xuICAgIHJlc3VsdFtpXSA9IGYoaSlcbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG4iLCJ2YXIgbG9vcCA9IHJlcXVpcmUoJy4vbG9vcCcpXG5cbnZhciBHTF9CWVRFID0gNTEyMFxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSA1MTIxXG52YXIgR0xfU0hPUlQgPSA1MTIyXG52YXIgR0xfVU5TSUdORURfU0hPUlQgPSA1MTIzXG52YXIgR0xfSU5UID0gNTEyNFxudmFyIEdMX1VOU0lHTkVEX0lOVCA9IDUxMjVcbnZhciBHTF9GTE9BVCA9IDUxMjZcblxudmFyIGJ1ZmZlclBvb2wgPSBsb29wKDgsIGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIFtdXG59KVxuXG5mdW5jdGlvbiBuZXh0UG93MTYgKHYpIHtcbiAgZm9yICh2YXIgaSA9IDE2OyBpIDw9ICgxIDw8IDI4KTsgaSAqPSAxNikge1xuICAgIGlmICh2IDw9IGkpIHtcbiAgICAgIHJldHVybiBpXG4gICAgfVxuICB9XG4gIHJldHVybiAwXG59XG5cbmZ1bmN0aW9uIGxvZzIgKHYpIHtcbiAgdmFyIHIsIHNoaWZ0XG4gIHIgPSAodiA+IDB4RkZGRikgPDwgNFxuICB2ID4+Pj0gclxuICBzaGlmdCA9ICh2ID4gMHhGRikgPDwgM1xuICB2ID4+Pj0gc2hpZnQ7IHIgfD0gc2hpZnRcbiAgc2hpZnQgPSAodiA+IDB4RikgPDwgMlxuICB2ID4+Pj0gc2hpZnQ7IHIgfD0gc2hpZnRcbiAgc2hpZnQgPSAodiA+IDB4MykgPDwgMVxuICB2ID4+Pj0gc2hpZnQ7IHIgfD0gc2hpZnRcbiAgcmV0dXJuIHIgfCAodiA+PiAxKVxufVxuXG5mdW5jdGlvbiBhbGxvYyAobikge1xuICB2YXIgc3ogPSBuZXh0UG93MTYobilcbiAgdmFyIGJpbiA9IGJ1ZmZlclBvb2xbbG9nMihzeikgPj4gMl1cbiAgaWYgKGJpbi5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIGJpbi5wb3AoKVxuICB9XG4gIHJldHVybiBuZXcgQXJyYXlCdWZmZXIoc3opXG59XG5cbmZ1bmN0aW9uIGZyZWUgKGJ1Zikge1xuICBidWZmZXJQb29sW2xvZzIoYnVmLmJ5dGVMZW5ndGgpID4+IDJdLnB1c2goYnVmKVxufVxuXG5mdW5jdGlvbiBhbGxvY1R5cGUgKHR5cGUsIG4pIHtcbiAgdmFyIHJlc3VsdCA9IG51bGxcbiAgc3dpdGNoICh0eXBlKSB7XG4gICAgY2FzZSBHTF9CWVRFOlxuICAgICAgcmVzdWx0ID0gbmV3IEludDhBcnJheShhbGxvYyhuKSwgMCwgbilcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9VTlNJR05FRF9CWVRFOlxuICAgICAgcmVzdWx0ID0gbmV3IFVpbnQ4QXJyYXkoYWxsb2MobiksIDAsIG4pXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfU0hPUlQ6XG4gICAgICByZXN1bHQgPSBuZXcgSW50MTZBcnJheShhbGxvYygyICogbiksIDAsIG4pXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlQ6XG4gICAgICByZXN1bHQgPSBuZXcgVWludDE2QXJyYXkoYWxsb2MoMiAqIG4pLCAwLCBuKVxuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX0lOVDpcbiAgICAgIHJlc3VsdCA9IG5ldyBJbnQzMkFycmF5KGFsbG9jKDQgKiBuKSwgMCwgbilcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9VTlNJR05FRF9JTlQ6XG4gICAgICByZXN1bHQgPSBuZXcgVWludDMyQXJyYXkoYWxsb2MoNCAqIG4pLCAwLCBuKVxuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX0ZMT0FUOlxuICAgICAgcmVzdWx0ID0gbmV3IEZsb2F0MzJBcnJheShhbGxvYyg0ICogbiksIDAsIG4pXG4gICAgICBicmVha1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gbnVsbFxuICB9XG4gIGlmIChyZXN1bHQubGVuZ3RoICE9PSBuKSB7XG4gICAgcmV0dXJuIHJlc3VsdC5zdWJhcnJheSgwLCBuKVxuICB9XG4gIHJldHVybiByZXN1bHRcbn1cblxuZnVuY3Rpb24gZnJlZVR5cGUgKGFycmF5KSB7XG4gIGZyZWUoYXJyYXkuYnVmZmVyKVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgYWxsb2M6IGFsbG9jLFxuICBmcmVlOiBmcmVlLFxuICBhbGxvY1R5cGU6IGFsbG9jVHlwZSxcbiAgZnJlZVR5cGU6IGZyZWVUeXBlXG59XG4iLCIvKiBnbG9iYWxzIHJlcXVlc3RBbmltYXRpb25GcmFtZSwgY2FuY2VsQW5pbWF0aW9uRnJhbWUgKi9cbmlmICh0eXBlb2YgcmVxdWVzdEFuaW1hdGlvbkZyYW1lID09PSAnZnVuY3Rpb24nICYmXG4gICAgdHlwZW9mIGNhbmNlbEFuaW1hdGlvbkZyYW1lID09PSAnZnVuY3Rpb24nKSB7XG4gIG1vZHVsZS5leHBvcnRzID0ge1xuICAgIG5leHQ6IGZ1bmN0aW9uICh4KSB7IHJldHVybiByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoeCkgfSxcbiAgICBjYW5jZWw6IGZ1bmN0aW9uICh4KSB7IHJldHVybiBjYW5jZWxBbmltYXRpb25GcmFtZSh4KSB9XG4gIH1cbn0gZWxzZSB7XG4gIG1vZHVsZS5leHBvcnRzID0ge1xuICAgIG5leHQ6IGZ1bmN0aW9uIChjYikge1xuICAgICAgcmV0dXJuIHNldFRpbWVvdXQoY2IsIDE2KVxuICAgIH0sXG4gICAgY2FuY2VsOiBjbGVhclRpbWVvdXRcbiAgfVxufVxuIiwidmFyIHBvb2wgPSByZXF1aXJlKCcuL3Bvb2wnKVxuXG52YXIgRkxPQVQgPSBuZXcgRmxvYXQzMkFycmF5KDEpXG52YXIgSU5UID0gbmV3IFVpbnQzMkFycmF5KEZMT0FULmJ1ZmZlcilcblxudmFyIEdMX1VOU0lHTkVEX1NIT1JUID0gNTEyM1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNvbnZlcnRUb0hhbGZGbG9hdCAoYXJyYXkpIHtcbiAgdmFyIHVzaG9ydHMgPSBwb29sLmFsbG9jVHlwZShHTF9VTlNJR05FRF9TSE9SVCwgYXJyYXkubGVuZ3RoKVxuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgYXJyYXkubGVuZ3RoOyArK2kpIHtcbiAgICBpZiAoaXNOYU4oYXJyYXlbaV0pKSB7XG4gICAgICB1c2hvcnRzW2ldID0gMHhmZmZmXG4gICAgfSBlbHNlIGlmIChhcnJheVtpXSA9PT0gSW5maW5pdHkpIHtcbiAgICAgIHVzaG9ydHNbaV0gPSAweDdjMDBcbiAgICB9IGVsc2UgaWYgKGFycmF5W2ldID09PSAtSW5maW5pdHkpIHtcbiAgICAgIHVzaG9ydHNbaV0gPSAweGZjMDBcbiAgICB9IGVsc2Uge1xuICAgICAgRkxPQVRbMF0gPSBhcnJheVtpXVxuICAgICAgdmFyIHggPSBJTlRbMF1cblxuICAgICAgdmFyIHNnbiA9ICh4ID4+PiAzMSkgPDwgMTVcbiAgICAgIHZhciBleHAgPSAoKHggPDwgMSkgPj4+IDI0KSAtIDEyN1xuICAgICAgdmFyIGZyYWMgPSAoeCA+PiAxMykgJiAoKDEgPDwgMTApIC0gMSlcblxuICAgICAgaWYgKGV4cCA8IC0yNCkge1xuICAgICAgICAvLyByb3VuZCBub24tcmVwcmVzZW50YWJsZSBkZW5vcm1hbHMgdG8gMFxuICAgICAgICB1c2hvcnRzW2ldID0gc2duXG4gICAgICB9IGVsc2UgaWYgKGV4cCA8IC0xNCkge1xuICAgICAgICAvLyBoYW5kbGUgZGVub3JtYWxzXG4gICAgICAgIHZhciBzID0gLTE0IC0gZXhwXG4gICAgICAgIHVzaG9ydHNbaV0gPSBzZ24gKyAoKGZyYWMgKyAoMSA8PCAxMCkpID4+IHMpXG4gICAgICB9IGVsc2UgaWYgKGV4cCA+IDE1KSB7XG4gICAgICAgIC8vIHJvdW5kIG92ZXJmbG93IHRvICsvLSBJbmZpbml0eVxuICAgICAgICB1c2hvcnRzW2ldID0gc2duICsgMHg3YzAwXG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBvdGhlcndpc2UgY29udmVydCBkaXJlY3RseVxuICAgICAgICB1c2hvcnRzW2ldID0gc2duICsgKChleHAgKyAxNSkgPDwgMTApICsgZnJhY1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB1c2hvcnRzXG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChvYmopIHtcbiAgcmV0dXJuIE9iamVjdC5rZXlzKG9iaikubWFwKGZ1bmN0aW9uIChrZXkpIHsgcmV0dXJuIG9ialtrZXldIH0pXG59XG4iLCIvLyBDb250ZXh0IGFuZCBjYW52YXMgY3JlYXRpb24gaGVscGVyIGZ1bmN0aW9uc1xuXG52YXIgZXh0ZW5kID0gcmVxdWlyZSgnLi91dGlsL2V4dGVuZCcpXG5cbmZ1bmN0aW9uIGNyZWF0ZUNhbnZhcyAoZWxlbWVudCwgb25Eb25lLCBwaXhlbFJhdGlvKSB7XG4gIHZhciBjYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKVxuICBleHRlbmQoY2FudmFzLnN0eWxlLCB7XG4gICAgYm9yZGVyOiAwLFxuICAgIG1hcmdpbjogMCxcbiAgICBwYWRkaW5nOiAwLFxuICAgIHRvcDogMCxcbiAgICBsZWZ0OiAwXG4gIH0pXG4gIGVsZW1lbnQuYXBwZW5kQ2hpbGQoY2FudmFzKVxuXG4gIGlmIChlbGVtZW50ID09PSBkb2N1bWVudC5ib2R5KSB7XG4gICAgY2FudmFzLnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJ1xuICAgIGV4dGVuZChlbGVtZW50LnN0eWxlLCB7XG4gICAgICBtYXJnaW46IDAsXG4gICAgICBwYWRkaW5nOiAwXG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlc2l6ZSAoKSB7XG4gICAgdmFyIHcgPSB3aW5kb3cuaW5uZXJXaWR0aFxuICAgIHZhciBoID0gd2luZG93LmlubmVySGVpZ2h0XG4gICAgaWYgKGVsZW1lbnQgIT09IGRvY3VtZW50LmJvZHkpIHtcbiAgICAgIHZhciBib3VuZHMgPSBlbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpXG4gICAgICB3ID0gYm91bmRzLnJpZ2h0IC0gYm91bmRzLmxlZnRcbiAgICAgIGggPSBib3VuZHMudG9wIC0gYm91bmRzLmJvdHRvbVxuICAgIH1cbiAgICBjYW52YXMud2lkdGggPSBwaXhlbFJhdGlvICogd1xuICAgIGNhbnZhcy5oZWlnaHQgPSBwaXhlbFJhdGlvICogaFxuICAgIGV4dGVuZChjYW52YXMuc3R5bGUsIHtcbiAgICAgIHdpZHRoOiB3ICsgJ3B4JyxcbiAgICAgIGhlaWdodDogaCArICdweCdcbiAgICB9KVxuICB9XG5cbiAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIHJlc2l6ZSwgZmFsc2UpXG5cbiAgZnVuY3Rpb24gb25EZXN0cm95ICgpIHtcbiAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigncmVzaXplJywgcmVzaXplKVxuICAgIGVsZW1lbnQucmVtb3ZlQ2hpbGQoY2FudmFzKVxuICB9XG5cbiAgcmVzaXplKClcblxuICByZXR1cm4ge1xuICAgIGNhbnZhczogY2FudmFzLFxuICAgIG9uRGVzdHJveTogb25EZXN0cm95XG4gIH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlQ29udGV4dCAoY2FudmFzLCBjb250ZXhBdHRyaWJ1dGVzKSB7XG4gIGZ1bmN0aW9uIGdldCAobmFtZSkge1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gY2FudmFzLmdldENvbnRleHQobmFtZSwgY29udGV4QXR0cmlidXRlcylcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cbiAgfVxuICByZXR1cm4gKFxuICAgIGdldCgnd2ViZ2wnKSB8fFxuICAgIGdldCgnZXhwZXJpbWVudGFsLXdlYmdsJykgfHxcbiAgICBnZXQoJ3dlYmdsLWV4cGVyaW1lbnRhbCcpXG4gIClcbn1cblxuZnVuY3Rpb24gaXNIVE1MRWxlbWVudCAob2JqKSB7XG4gIHJldHVybiAoXG4gICAgdHlwZW9mIG9iai5ub2RlTmFtZSA9PT0gJ3N0cmluZycgJiZcbiAgICB0eXBlb2Ygb2JqLmFwcGVuZENoaWxkID09PSAnZnVuY3Rpb24nICYmXG4gICAgdHlwZW9mIG9iai5nZXRCb3VuZGluZ0NsaWVudFJlY3QgPT09ICdmdW5jdGlvbidcbiAgKVxufVxuXG5mdW5jdGlvbiBpc1dlYkdMQ29udGV4dCAob2JqKSB7XG4gIHJldHVybiAoXG4gICAgdHlwZW9mIG9iai5kcmF3QXJyYXlzID09PSAnZnVuY3Rpb24nIHx8XG4gICAgdHlwZW9mIG9iai5kcmF3RWxlbWVudHMgPT09ICdmdW5jdGlvbidcbiAgKVxufVxuXG5mdW5jdGlvbiBwYXJzZUV4dGVuc2lvbnMgKGlucHV0KSB7XG4gIGlmICh0eXBlb2YgaW5wdXQgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIGlucHV0LnNwbGl0KClcbiAgfVxuICBcbiAgcmV0dXJuIGlucHV0XG59XG5cbmZ1bmN0aW9uIGdldEVsZW1lbnQgKGRlc2MpIHtcbiAgaWYgKHR5cGVvZiBkZXNjID09PSAnc3RyaW5nJykge1xuICAgIFxuICAgIHJldHVybiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGRlc2MpXG4gIH1cbiAgcmV0dXJuIGRlc2Ncbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBwYXJzZUFyZ3MgKGFyZ3NfKSB7XG4gIHZhciBhcmdzID0gYXJnc18gfHwge31cbiAgdmFyIGVsZW1lbnQsIGNvbnRhaW5lciwgY2FudmFzLCBnbFxuICB2YXIgY29udGV4dEF0dHJpYnV0ZXMgPSB7fVxuICB2YXIgZXh0ZW5zaW9ucyA9IFtdXG4gIHZhciBvcHRpb25hbEV4dGVuc2lvbnMgPSBbXVxuICB2YXIgcGl4ZWxSYXRpbyA9ICh0eXBlb2Ygd2luZG93ID09PSAndW5kZWZpbmVkJyA/IDEgOiB3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbylcbiAgdmFyIHByb2ZpbGUgPSBmYWxzZVxuICB2YXIgb25Eb25lID0gZnVuY3Rpb24gKGVycikge1xuICAgIGlmIChlcnIpIHtcbiAgICAgIFxuICAgIH1cbiAgfVxuICB2YXIgb25EZXN0cm95ID0gZnVuY3Rpb24gKCkge31cbiAgaWYgKHR5cGVvZiBhcmdzID09PSAnc3RyaW5nJykge1xuICAgIFxuICAgIGVsZW1lbnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGFyZ3MpXG4gICAgXG4gIH0gZWxzZSBpZiAodHlwZW9mIGFyZ3MgPT09ICdvYmplY3QnKSB7XG4gICAgaWYgKGlzSFRNTEVsZW1lbnQoYXJncykpIHtcbiAgICAgIGVsZW1lbnQgPSBhcmdzXG4gICAgfSBlbHNlIGlmIChpc1dlYkdMQ29udGV4dChhcmdzKSkge1xuICAgICAgZ2wgPSBhcmdzXG4gICAgICBjYW52YXMgPSBnbC5jYW52YXNcbiAgICB9IGVsc2Uge1xuICAgICAgXG4gICAgICBpZiAoJ2dsJyBpbiBhcmdzKSB7XG4gICAgICAgIGdsID0gYXJncy5nbFxuICAgICAgfSBlbHNlIGlmICgnY2FudmFzJyBpbiBhcmdzKSB7XG4gICAgICAgIGNhbnZhcyA9IGdldEVsZW1lbnQoYXJncy5jYW52YXMpXG4gICAgICB9IGVsc2UgaWYgKCdjb250YWluZXInIGluIGFyZ3MpIHtcbiAgICAgICAgY29udGFpbmVyID0gZ2V0RWxlbWVudChhcmdzLmNvbnRhaW5lcilcbiAgICAgIH1cbiAgICAgIGlmICgnYXR0cmlidXRlcycgaW4gYXJncykge1xuICAgICAgICBjb250ZXh0QXR0cmlidXRlcyA9IGFyZ3MuYXR0cmlidXRlc1xuICAgICAgICBcbiAgICAgIH1cbiAgICAgIGlmICgnZXh0ZW5zaW9ucycgaW4gYXJncykge1xuICAgICAgICBleHRlbnNpb25zID0gcGFyc2VFeHRlbnNpb25zKGFyZ3MuZXh0ZW5zaW9ucylcbiAgICAgIH1cbiAgICAgIGlmICgnb3B0aW9uYWxFeHRlbnNpb25zJyBpbiBhcmdzKSB7XG4gICAgICAgIG9wdGlvbmFsRXh0ZW5zaW9ucyA9IHBhcnNlRXh0ZW5zaW9ucyhhcmdzLm9wdGlvbmFsRXh0ZW5zaW9ucylcbiAgICAgIH1cbiAgICAgIGlmICgnb25Eb25lJyBpbiBhcmdzKSB7XG4gICAgICAgIFxuICAgICAgICBvbkRvbmUgPSBhcmdzLm9uRG9uZVxuICAgICAgfVxuICAgICAgaWYgKCdwcm9maWxlJyBpbiBhcmdzKSB7XG4gICAgICAgIHByb2ZpbGUgPSAhIWFyZ3MucHJvZmlsZVxuICAgICAgfVxuICAgICAgaWYgKCdwaXhlbFJhdGlvJyBpbiBhcmdzKSB7XG4gICAgICAgIHBpeGVsUmF0aW8gPSArYXJncy5waXhlbFJhdGlvXG4gICAgICAgIFxuICAgICAgfVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBcbiAgfVxuXG4gIGlmIChlbGVtZW50KSB7XG4gICAgaWYgKGVsZW1lbnQubm9kZU5hbWUudG9Mb3dlckNhc2UoKSA9PT0gJ2NhbnZhcycpIHtcbiAgICAgIGNhbnZhcyA9IGVsZW1lbnRcbiAgICB9IGVsc2Uge1xuICAgICAgY29udGFpbmVyID0gZWxlbWVudFxuICAgIH1cbiAgfVxuXG4gIGlmICghZ2wpIHtcbiAgICBpZiAoIWNhbnZhcykge1xuICAgICAgXG4gICAgICB2YXIgcmVzdWx0ID0gY3JlYXRlQ2FudmFzKGNvbnRhaW5lciB8fCBkb2N1bWVudC5ib2R5LCBvbkRvbmUsIHBpeGVsUmF0aW8pXG4gICAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgICByZXR1cm4gbnVsbFxuICAgICAgfVxuICAgICAgY2FudmFzID0gcmVzdWx0LmNhbnZhc1xuICAgICAgb25EZXN0cm95ID0gcmVzdWx0Lm9uRGVzdHJveVxuICAgIH1cbiAgICBnbCA9IGNyZWF0ZUNvbnRleHQoY2FudmFzLCBjb250ZXh0QXR0cmlidXRlcylcbiAgfVxuXG4gIGlmICghZ2wpIHtcbiAgICBvbkRlc3Ryb3koKVxuICAgIG9uRG9uZSgnd2ViZ2wgbm90IHN1cHBvcnRlZCwgdHJ5IHVwZ3JhZGluZyB5b3VyIGJyb3dzZXIgb3IgZ3JhcGhpY3MgZHJpdmVycyBodHRwOi8vZ2V0LndlYmdsLm9yZycpXG4gICAgcmV0dXJuIG51bGxcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgZ2w6IGdsLFxuICAgIGNhbnZhczogY2FudmFzLFxuICAgIGNvbnRhaW5lcjogY29udGFpbmVyLFxuICAgIGV4dGVuc2lvbnM6IGV4dGVuc2lvbnMsXG4gICAgb3B0aW9uYWxFeHRlbnNpb25zOiBvcHRpb25hbEV4dGVuc2lvbnMsXG4gICAgcGl4ZWxSYXRpbzogcGl4ZWxSYXRpbyxcbiAgICBwcm9maWxlOiBwcm9maWxlLFxuICAgIG9uRG9uZTogb25Eb25lLFxuICAgIG9uRGVzdHJveTogb25EZXN0cm95XG4gIH1cbn1cbiIsIlxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vbGliL3V0aWwvZXh0ZW5kJylcbnZhciBkeW5hbWljID0gcmVxdWlyZSgnLi9saWIvZHluYW1pYycpXG52YXIgcmFmID0gcmVxdWlyZSgnLi9saWIvdXRpbC9yYWYnKVxudmFyIGNsb2NrID0gcmVxdWlyZSgnLi9saWIvdXRpbC9jbG9jaycpXG52YXIgY3JlYXRlU3RyaW5nU3RvcmUgPSByZXF1aXJlKCcuL2xpYi9zdHJpbmdzJylcbnZhciBpbml0V2ViR0wgPSByZXF1aXJlKCcuL2xpYi93ZWJnbCcpXG52YXIgd3JhcEV4dGVuc2lvbnMgPSByZXF1aXJlKCcuL2xpYi9leHRlbnNpb24nKVxudmFyIHdyYXBMaW1pdHMgPSByZXF1aXJlKCcuL2xpYi9saW1pdHMnKVxudmFyIHdyYXBCdWZmZXJzID0gcmVxdWlyZSgnLi9saWIvYnVmZmVyJylcbnZhciB3cmFwRWxlbWVudHMgPSByZXF1aXJlKCcuL2xpYi9lbGVtZW50cycpXG52YXIgd3JhcFRleHR1cmVzID0gcmVxdWlyZSgnLi9saWIvdGV4dHVyZScpXG52YXIgd3JhcFJlbmRlcmJ1ZmZlcnMgPSByZXF1aXJlKCcuL2xpYi9yZW5kZXJidWZmZXInKVxudmFyIHdyYXBGcmFtZWJ1ZmZlcnMgPSByZXF1aXJlKCcuL2xpYi9mcmFtZWJ1ZmZlcicpXG52YXIgd3JhcEF0dHJpYnV0ZXMgPSByZXF1aXJlKCcuL2xpYi9hdHRyaWJ1dGUnKVxudmFyIHdyYXBTaGFkZXJzID0gcmVxdWlyZSgnLi9saWIvc2hhZGVyJylcbnZhciB3cmFwUmVhZCA9IHJlcXVpcmUoJy4vbGliL3JlYWQnKVxudmFyIGNyZWF0ZUNvcmUgPSByZXF1aXJlKCcuL2xpYi9jb3JlJylcbnZhciBjcmVhdGVTdGF0cyA9IHJlcXVpcmUoJy4vbGliL3N0YXRzJylcbnZhciBjcmVhdGVUaW1lciA9IHJlcXVpcmUoJy4vbGliL3RpbWVyJylcblxudmFyIEdMX0NPTE9SX0JVRkZFUl9CSVQgPSAxNjM4NFxudmFyIEdMX0RFUFRIX0JVRkZFUl9CSVQgPSAyNTZcbnZhciBHTF9TVEVOQ0lMX0JVRkZFUl9CSVQgPSAxMDI0XG5cbnZhciBHTF9BUlJBWV9CVUZGRVIgPSAzNDk2MlxuXG52YXIgQ09OVEVYVF9MT1NUX0VWRU5UID0gJ3dlYmdsY29udGV4dGxvc3QnXG52YXIgQ09OVEVYVF9SRVNUT1JFRF9FVkVOVCA9ICd3ZWJnbGNvbnRleHRyZXN0b3JlZCdcblxudmFyIERZTl9QUk9QID0gMVxudmFyIERZTl9DT05URVhUID0gMlxudmFyIERZTl9TVEFURSA9IDNcblxuZnVuY3Rpb24gZmluZCAoaGF5c3RhY2ssIG5lZWRsZSkge1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGhheXN0YWNrLmxlbmd0aDsgKytpKSB7XG4gICAgaWYgKGhheXN0YWNrW2ldID09PSBuZWVkbGUpIHtcbiAgICAgIHJldHVybiBpXG4gICAgfVxuICB9XG4gIHJldHVybiAtMVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBSRUdMIChhcmdzKSB7XG4gIHZhciBjb25maWcgPSBpbml0V2ViR0woYXJncylcbiAgaWYgKCFjb25maWcpIHtcbiAgICByZXR1cm4gbnVsbFxuICB9XG5cbiAgdmFyIGdsID0gY29uZmlnLmdsXG4gIHZhciBnbEF0dHJpYnV0ZXMgPSBnbC5nZXRDb250ZXh0QXR0cmlidXRlcygpXG5cbiAgdmFyIGV4dGVuc2lvblN0YXRlID0gd3JhcEV4dGVuc2lvbnMoZ2wsIGNvbmZpZylcbiAgaWYgKCFleHRlbnNpb25TdGF0ZSkge1xuICAgIHJldHVybiBudWxsXG4gIH1cblxuICB2YXIgc3RyaW5nU3RvcmUgPSBjcmVhdGVTdHJpbmdTdG9yZSgpXG4gIHZhciBzdGF0cyA9IGNyZWF0ZVN0YXRzKClcbiAgdmFyIGV4dGVuc2lvbnMgPSBleHRlbnNpb25TdGF0ZS5leHRlbnNpb25zXG4gIHZhciB0aW1lciA9IGNyZWF0ZVRpbWVyKGdsLCBleHRlbnNpb25zKVxuXG4gIHZhciBTVEFSVF9USU1FID0gY2xvY2soKVxuICB2YXIgV0lEVEggPSBnbC5kcmF3aW5nQnVmZmVyV2lkdGhcbiAgdmFyIEhFSUdIVCA9IGdsLmRyYXdpbmdCdWZmZXJIZWlnaHRcblxuICB2YXIgY29udGV4dFN0YXRlID0ge1xuICAgIHRpY2s6IDAsXG4gICAgdGltZTogMCxcbiAgICB2aWV3cG9ydFdpZHRoOiBXSURUSCxcbiAgICB2aWV3cG9ydEhlaWdodDogSEVJR0hULFxuICAgIGZyYW1lYnVmZmVyV2lkdGg6IFdJRFRILFxuICAgIGZyYW1lYnVmZmVySGVpZ2h0OiBIRUlHSFQsXG4gICAgZHJhd2luZ0J1ZmZlcldpZHRoOiBXSURUSCxcbiAgICBkcmF3aW5nQnVmZmVySGVpZ2h0OiBIRUlHSFQsXG4gICAgcGl4ZWxSYXRpbzogY29uZmlnLnBpeGVsUmF0aW9cbiAgfVxuICB2YXIgdW5pZm9ybVN0YXRlID0ge31cbiAgdmFyIGRyYXdTdGF0ZSA9IHtcbiAgICBlbGVtZW50czogbnVsbCxcbiAgICBwcmltaXRpdmU6IDQsIC8vIEdMX1RSSUFOR0xFU1xuICAgIGNvdW50OiAtMSxcbiAgICBvZmZzZXQ6IDAsXG4gICAgaW5zdGFuY2VzOiAtMVxuICB9XG5cbiAgdmFyIGxpbWl0cyA9IHdyYXBMaW1pdHMoZ2wsIGV4dGVuc2lvbnMpXG4gIHZhciBidWZmZXJTdGF0ZSA9IHdyYXBCdWZmZXJzKGdsLCBzdGF0cywgY29uZmlnKVxuICB2YXIgZWxlbWVudFN0YXRlID0gd3JhcEVsZW1lbnRzKGdsLCBleHRlbnNpb25zLCBidWZmZXJTdGF0ZSwgc3RhdHMpXG4gIHZhciBhdHRyaWJ1dGVTdGF0ZSA9IHdyYXBBdHRyaWJ1dGVzKFxuICAgIGdsLFxuICAgIGV4dGVuc2lvbnMsXG4gICAgbGltaXRzLFxuICAgIGJ1ZmZlclN0YXRlLFxuICAgIHN0cmluZ1N0b3JlKVxuICB2YXIgc2hhZGVyU3RhdGUgPSB3cmFwU2hhZGVycyhnbCwgc3RyaW5nU3RvcmUsIHN0YXRzLCBjb25maWcpXG4gIHZhciB0ZXh0dXJlU3RhdGUgPSB3cmFwVGV4dHVyZXMoXG4gICAgZ2wsXG4gICAgZXh0ZW5zaW9ucyxcbiAgICBsaW1pdHMsXG4gICAgZnVuY3Rpb24gKCkgeyBjb3JlLnByb2NzLnBvbGwoKSB9LFxuICAgIGNvbnRleHRTdGF0ZSxcbiAgICBzdGF0cyxcbiAgICBjb25maWcpXG4gIHZhciByZW5kZXJidWZmZXJTdGF0ZSA9IHdyYXBSZW5kZXJidWZmZXJzKGdsLCBleHRlbnNpb25zLCBsaW1pdHMsIHN0YXRzLCBjb25maWcpXG4gIHZhciBmcmFtZWJ1ZmZlclN0YXRlID0gd3JhcEZyYW1lYnVmZmVycyhcbiAgICBnbCxcbiAgICBleHRlbnNpb25zLFxuICAgIGxpbWl0cyxcbiAgICB0ZXh0dXJlU3RhdGUsXG4gICAgcmVuZGVyYnVmZmVyU3RhdGUsXG4gICAgc3RhdHMpXG4gIHZhciBjb3JlID0gY3JlYXRlQ29yZShcbiAgICBnbCxcbiAgICBzdHJpbmdTdG9yZSxcbiAgICBleHRlbnNpb25zLFxuICAgIGxpbWl0cyxcbiAgICBidWZmZXJTdGF0ZSxcbiAgICBlbGVtZW50U3RhdGUsXG4gICAgdGV4dHVyZVN0YXRlLFxuICAgIGZyYW1lYnVmZmVyU3RhdGUsXG4gICAgdW5pZm9ybVN0YXRlLFxuICAgIGF0dHJpYnV0ZVN0YXRlLFxuICAgIHNoYWRlclN0YXRlLFxuICAgIGRyYXdTdGF0ZSxcbiAgICBjb250ZXh0U3RhdGUsXG4gICAgdGltZXIsXG4gICAgY29uZmlnKVxuICB2YXIgcmVhZFBpeGVscyA9IHdyYXBSZWFkKFxuICAgIGdsLFxuICAgIGZyYW1lYnVmZmVyU3RhdGUsXG4gICAgY29yZS5wcm9jcy5wb2xsLFxuICAgIGNvbnRleHRTdGF0ZSxcbiAgICBnbEF0dHJpYnV0ZXMsIGV4dGVuc2lvbnMpXG5cbiAgdmFyIG5leHRTdGF0ZSA9IGNvcmUubmV4dFxuICB2YXIgY2FudmFzID0gZ2wuY2FudmFzXG5cbiAgdmFyIHJhZkNhbGxiYWNrcyA9IFtdXG4gIHZhciBhY3RpdmVSQUYgPSBudWxsXG4gIGZ1bmN0aW9uIGhhbmRsZVJBRiAoKSB7XG4gICAgaWYgKHJhZkNhbGxiYWNrcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGlmICh0aW1lcikge1xuICAgICAgICB0aW1lci51cGRhdGUoKVxuICAgICAgfVxuICAgICAgYWN0aXZlUkFGID0gbnVsbFxuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgLy8gc2NoZWR1bGUgbmV4dCBhbmltYXRpb24gZnJhbWVcbiAgICBhY3RpdmVSQUYgPSByYWYubmV4dChoYW5kbGVSQUYpXG5cbiAgICAvLyBwb2xsIGZvciBjaGFuZ2VzXG4gICAgcG9sbCgpXG5cbiAgICAvLyBmaXJlIGEgY2FsbGJhY2sgZm9yIGFsbCBwZW5kaW5nIHJhZnNcbiAgICBmb3IgKHZhciBpID0gcmFmQ2FsbGJhY2tzLmxlbmd0aCAtIDE7IGkgPj0gMDsgLS1pKSB7XG4gICAgICB2YXIgY2IgPSByYWZDYWxsYmFja3NbaV1cbiAgICAgIGlmIChjYikge1xuICAgICAgICBjYihjb250ZXh0U3RhdGUsIG51bGwsIDApXG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gZmx1c2ggYWxsIHBlbmRpbmcgd2ViZ2wgY2FsbHNcbiAgICBnbC5mbHVzaCgpXG5cbiAgICAvLyBwb2xsIEdQVSB0aW1lcnMgKmFmdGVyKiBnbC5mbHVzaCBzbyB3ZSBkb24ndCBkZWxheSBjb21tYW5kIGRpc3BhdGNoXG4gICAgaWYgKHRpbWVyKSB7XG4gICAgICB0aW1lci51cGRhdGUoKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHN0YXJ0UkFGICgpIHtcbiAgICBpZiAoIWFjdGl2ZVJBRiAmJiByYWZDYWxsYmFja3MubGVuZ3RoID4gMCkge1xuICAgICAgYWN0aXZlUkFGID0gcmFmLm5leHQoaGFuZGxlUkFGKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHN0b3BSQUYgKCkge1xuICAgIGlmIChhY3RpdmVSQUYpIHtcbiAgICAgIHJhZi5jYW5jZWwoaGFuZGxlUkFGKVxuICAgICAgYWN0aXZlUkFGID0gbnVsbFxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZUNvbnRleHRMb3NzIChldmVudCkge1xuICAgIC8vIFRPRE9cbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZUNvbnRleHRSZXN0b3JlZCAoZXZlbnQpIHtcbiAgICAvLyBUT0RPXG4gIH1cblxuICBpZiAoY2FudmFzKSB7XG4gICAgY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoQ09OVEVYVF9MT1NUX0VWRU5ULCBoYW5kbGVDb250ZXh0TG9zcywgZmFsc2UpXG4gICAgY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoQ09OVEVYVF9SRVNUT1JFRF9FVkVOVCwgaGFuZGxlQ29udGV4dFJlc3RvcmVkLCBmYWxzZSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3kgKCkge1xuICAgIHJhZkNhbGxiYWNrcy5sZW5ndGggPSAwXG4gICAgc3RvcFJBRigpXG5cbiAgICBpZiAoY2FudmFzKSB7XG4gICAgICBjYW52YXMucmVtb3ZlRXZlbnRMaXN0ZW5lcihDT05URVhUX0xPU1RfRVZFTlQsIGhhbmRsZUNvbnRleHRMb3NzKVxuICAgICAgY2FudmFzLnJlbW92ZUV2ZW50TGlzdGVuZXIoQ09OVEVYVF9SRVNUT1JFRF9FVkVOVCwgaGFuZGxlQ29udGV4dFJlc3RvcmVkKVxuICAgIH1cblxuICAgIHNoYWRlclN0YXRlLmNsZWFyKClcbiAgICBmcmFtZWJ1ZmZlclN0YXRlLmNsZWFyKClcbiAgICByZW5kZXJidWZmZXJTdGF0ZS5jbGVhcigpXG4gICAgdGV4dHVyZVN0YXRlLmNsZWFyKClcbiAgICBlbGVtZW50U3RhdGUuY2xlYXIoKVxuICAgIGJ1ZmZlclN0YXRlLmNsZWFyKClcblxuICAgIGlmICh0aW1lcikge1xuICAgICAgdGltZXIuY2xlYXIoKVxuICAgIH1cblxuICAgIGNvbmZpZy5vbkRlc3Ryb3koKVxuICB9XG5cbiAgZnVuY3Rpb24gY29tcGlsZVByb2NlZHVyZSAob3B0aW9ucykge1xuICAgIFxuICAgIFxuXG4gICAgZnVuY3Rpb24gZmxhdHRlbk5lc3RlZE9wdGlvbnMgKG9wdGlvbnMpIHtcbiAgICAgIHZhciByZXN1bHQgPSBleHRlbmQoe30sIG9wdGlvbnMpXG4gICAgICBkZWxldGUgcmVzdWx0LnVuaWZvcm1zXG4gICAgICBkZWxldGUgcmVzdWx0LmF0dHJpYnV0ZXNcbiAgICAgIGRlbGV0ZSByZXN1bHQuY29udGV4dFxuXG4gICAgICBmdW5jdGlvbiBtZXJnZSAobmFtZSkge1xuICAgICAgICBpZiAobmFtZSBpbiByZXN1bHQpIHtcbiAgICAgICAgICB2YXIgY2hpbGQgPSByZXN1bHRbbmFtZV1cbiAgICAgICAgICBkZWxldGUgcmVzdWx0W25hbWVdXG4gICAgICAgICAgT2JqZWN0LmtleXMoY2hpbGQpLmZvckVhY2goZnVuY3Rpb24gKHByb3ApIHtcbiAgICAgICAgICAgIHJlc3VsdFtuYW1lICsgJy4nICsgcHJvcF0gPSBjaGlsZFtwcm9wXVxuICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIG1lcmdlKCdibGVuZCcpXG4gICAgICBtZXJnZSgnZGVwdGgnKVxuICAgICAgbWVyZ2UoJ2N1bGwnKVxuICAgICAgbWVyZ2UoJ3N0ZW5jaWwnKVxuICAgICAgbWVyZ2UoJ3BvbHlnb25PZmZzZXQnKVxuICAgICAgbWVyZ2UoJ3NjaXNzb3InKVxuICAgICAgbWVyZ2UoJ3NhbXBsZScpXG5cbiAgICAgIHJldHVybiByZXN1bHRcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzZXBhcmF0ZUR5bmFtaWMgKG9iamVjdCkge1xuICAgICAgdmFyIHN0YXRpY0l0ZW1zID0ge31cbiAgICAgIHZhciBkeW5hbWljSXRlbXMgPSB7fVxuICAgICAgT2JqZWN0LmtleXMob2JqZWN0KS5mb3JFYWNoKGZ1bmN0aW9uIChvcHRpb24pIHtcbiAgICAgICAgdmFyIHZhbHVlID0gb2JqZWN0W29wdGlvbl1cbiAgICAgICAgaWYgKGR5bmFtaWMuaXNEeW5hbWljKHZhbHVlKSkge1xuICAgICAgICAgIGR5bmFtaWNJdGVtc1tvcHRpb25dID0gZHluYW1pYy51bmJveCh2YWx1ZSwgb3B0aW9uKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHN0YXRpY0l0ZW1zW29wdGlvbl0gPSB2YWx1ZVxuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgZHluYW1pYzogZHluYW1pY0l0ZW1zLFxuICAgICAgICBzdGF0aWM6IHN0YXRpY0l0ZW1zXG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gVHJlYXQgY29udGV4dCB2YXJpYWJsZXMgc2VwYXJhdGUgZnJvbSBvdGhlciBkeW5hbWljIHZhcmlhYmxlc1xuICAgIHZhciBjb250ZXh0ID0gc2VwYXJhdGVEeW5hbWljKG9wdGlvbnMuY29udGV4dCB8fCB7fSlcbiAgICB2YXIgdW5pZm9ybXMgPSBzZXBhcmF0ZUR5bmFtaWMob3B0aW9ucy51bmlmb3JtcyB8fCB7fSlcbiAgICB2YXIgYXR0cmlidXRlcyA9IHNlcGFyYXRlRHluYW1pYyhvcHRpb25zLmF0dHJpYnV0ZXMgfHwge30pXG4gICAgdmFyIG9wdHMgPSBzZXBhcmF0ZUR5bmFtaWMoZmxhdHRlbk5lc3RlZE9wdGlvbnMob3B0aW9ucykpXG5cbiAgICB2YXIgc3RhdHMgPSB7XG4gICAgICBncHVUaW1lOiAwLjAsXG4gICAgICBjcHVUaW1lOiAwLjAsXG4gICAgICBjb3VudDogMFxuICAgIH1cblxuICAgIHZhciBjb21waWxlZCA9IGNvcmUuY29tcGlsZShvcHRzLCBhdHRyaWJ1dGVzLCB1bmlmb3JtcywgY29udGV4dCwgc3RhdHMpXG5cbiAgICB2YXIgZHJhdyA9IGNvbXBpbGVkLmRyYXdcbiAgICB2YXIgYmF0Y2ggPSBjb21waWxlZC5iYXRjaFxuICAgIHZhciBzY29wZSA9IGNvbXBpbGVkLnNjb3BlXG5cbiAgICAvLyBGSVhNRTogd2Ugc2hvdWxkIG1vZGlmeSBjb2RlIGdlbmVyYXRpb24gZm9yIGJhdGNoIGNvbW1hbmRzIHNvIHRoaXNcbiAgICAvLyBpc24ndCBuZWNlc3NhcnlcbiAgICB2YXIgRU1QVFlfQVJSQVkgPSBbXVxuICAgIGZ1bmN0aW9uIHJlc2VydmUgKGNvdW50KSB7XG4gICAgICB3aGlsZSAoRU1QVFlfQVJSQVkubGVuZ3RoIDwgY291bnQpIHtcbiAgICAgICAgRU1QVFlfQVJSQVkucHVzaChudWxsKVxuICAgICAgfVxuICAgICAgcmV0dXJuIEVNUFRZX0FSUkFZXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gUkVHTENvbW1hbmQgKGFyZ3MsIGJvZHkpIHtcbiAgICAgIHZhciBpXG4gICAgICBpZiAodHlwZW9mIGFyZ3MgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgcmV0dXJuIHNjb3BlLmNhbGwodGhpcywgbnVsbCwgYXJncywgMClcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGJvZHkgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBhcmdzID09PSAnbnVtYmVyJykge1xuICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBhcmdzOyArK2kpIHtcbiAgICAgICAgICAgIHNjb3BlLmNhbGwodGhpcywgbnVsbCwgYm9keSwgaSlcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShhcmdzKSkge1xuICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBhcmdzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgICBzY29wZS5jYWxsKHRoaXMsIGFyZ3NbaV0sIGJvZHksIGkpXG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVyblxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBzY29wZS5jYWxsKHRoaXMsIGFyZ3MsIGJvZHksIDApXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGFyZ3MgPT09ICdudW1iZXInKSB7XG4gICAgICAgIGlmIChhcmdzID4gMCkge1xuICAgICAgICAgIHJldHVybiBiYXRjaC5jYWxsKHRoaXMsIHJlc2VydmUoYXJncyB8IDApLCBhcmdzIHwgMClcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGFyZ3MpKSB7XG4gICAgICAgIGlmIChhcmdzLmxlbmd0aCkge1xuICAgICAgICAgIHJldHVybiBiYXRjaC5jYWxsKHRoaXMsIGFyZ3MsIGFyZ3MubGVuZ3RoKVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZHJhdy5jYWxsKHRoaXMsIGFyZ3MpXG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGV4dGVuZChSRUdMQ29tbWFuZCwge1xuICAgICAgc3RhdHM6IHN0YXRzXG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGNsZWFyIChvcHRpb25zKSB7XG4gICAgXG5cbiAgICB2YXIgY2xlYXJGbGFncyA9IDBcbiAgICBjb3JlLnByb2NzLnBvbGwoKVxuXG4gICAgdmFyIGMgPSBvcHRpb25zLmNvbG9yXG4gICAgaWYgKGMpIHtcbiAgICAgIGdsLmNsZWFyQ29sb3IoK2NbMF0gfHwgMCwgK2NbMV0gfHwgMCwgK2NbMl0gfHwgMCwgK2NbM10gfHwgMClcbiAgICAgIGNsZWFyRmxhZ3MgfD0gR0xfQ09MT1JfQlVGRkVSX0JJVFxuICAgIH1cbiAgICBpZiAoJ2RlcHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICBnbC5jbGVhckRlcHRoKCtvcHRpb25zLmRlcHRoKVxuICAgICAgY2xlYXJGbGFncyB8PSBHTF9ERVBUSF9CVUZGRVJfQklUXG4gICAgfVxuICAgIGlmICgnc3RlbmNpbCcgaW4gb3B0aW9ucykge1xuICAgICAgZ2wuY2xlYXJTdGVuY2lsKG9wdGlvbnMuc3RlbmNpbCB8IDApXG4gICAgICBjbGVhckZsYWdzIHw9IEdMX1NURU5DSUxfQlVGRkVSX0JJVFxuICAgIH1cblxuICAgIFxuICAgIGdsLmNsZWFyKGNsZWFyRmxhZ3MpXG4gIH1cblxuICBmdW5jdGlvbiBmcmFtZSAoY2IpIHtcbiAgICBcbiAgICByYWZDYWxsYmFja3MucHVzaChjYilcblxuICAgIGZ1bmN0aW9uIGNhbmNlbCAoKSB7XG4gICAgICAvLyBGSVhNRTogIHNob3VsZCB3ZSBjaGVjayBzb21ldGhpbmcgb3RoZXIgdGhhbiBlcXVhbHMgY2IgaGVyZT9cbiAgICAgIC8vIHdoYXQgaWYgYSB1c2VyIGNhbGxzIGZyYW1lIHR3aWNlIHdpdGggdGhlIHNhbWUgY2FsbGJhY2suLi5cbiAgICAgIC8vXG4gICAgICB2YXIgaSA9IGZpbmQocmFmQ2FsbGJhY2tzLCBjYilcbiAgICAgIFxuICAgICAgZnVuY3Rpb24gcGVuZGluZ0NhbmNlbCAoKSB7XG4gICAgICAgIHZhciBpbmRleCA9IGZpbmQocmFmQ2FsbGJhY2tzLCBwZW5kaW5nQ2FuY2VsKVxuICAgICAgICByYWZDYWxsYmFja3NbaW5kZXhdID0gcmFmQ2FsbGJhY2tzW3JhZkNhbGxiYWNrcy5sZW5ndGggLSAxXVxuICAgICAgICByYWZDYWxsYmFja3MubGVuZ3RoIC09IDFcbiAgICAgICAgaWYgKHJhZkNhbGxiYWNrcy5sZW5ndGggPD0gMCkge1xuICAgICAgICAgIHN0b3BSQUYoKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICByYWZDYWxsYmFja3NbaV0gPSBwZW5kaW5nQ2FuY2VsXG4gICAgfVxuXG4gICAgc3RhcnRSQUYoKVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGNhbmNlbDogY2FuY2VsXG4gICAgfVxuICB9XG5cbiAgLy8gcG9sbCB2aWV3cG9ydFxuICBmdW5jdGlvbiBwb2xsVmlld3BvcnQgKCkge1xuICAgIHZhciB2aWV3cG9ydCA9IG5leHRTdGF0ZS52aWV3cG9ydFxuICAgIHZhciBzY2lzc29yQm94ID0gbmV4dFN0YXRlLnNjaXNzb3JfYm94XG4gICAgdmlld3BvcnRbMF0gPSB2aWV3cG9ydFsxXSA9IHNjaXNzb3JCb3hbMF0gPSBzY2lzc29yQm94WzFdID0gMFxuICAgIGNvbnRleHRTdGF0ZS52aWV3cG9ydFdpZHRoID1cbiAgICAgIGNvbnRleHRTdGF0ZS5mcmFtZWJ1ZmZlcldpZHRoID1cbiAgICAgIGNvbnRleHRTdGF0ZS5kcmF3aW5nQnVmZmVyV2lkdGggPVxuICAgICAgdmlld3BvcnRbMl0gPVxuICAgICAgc2Npc3NvckJveFsyXSA9IGdsLmRyYXdpbmdCdWZmZXJXaWR0aFxuICAgIGNvbnRleHRTdGF0ZS52aWV3cG9ydEhlaWdodCA9XG4gICAgICBjb250ZXh0U3RhdGUuZnJhbWVidWZmZXJIZWlnaHQgPVxuICAgICAgY29udGV4dFN0YXRlLmRyYXdpbmdCdWZmZXJIZWlnaHQgPVxuICAgICAgdmlld3BvcnRbM10gPVxuICAgICAgc2Npc3NvckJveFszXSA9IGdsLmRyYXdpbmdCdWZmZXJIZWlnaHRcbiAgfVxuXG4gIGZ1bmN0aW9uIHBvbGwgKCkge1xuICAgIGNvbnRleHRTdGF0ZS50aWNrICs9IDFcbiAgICBjb250ZXh0U3RhdGUudGltZSA9IChjbG9jaygpIC0gU1RBUlRfVElNRSkgLyAxMDAwLjBcbiAgICBwb2xsVmlld3BvcnQoKVxuICAgIGNvcmUucHJvY3MucG9sbCgpXG4gIH1cblxuICBmdW5jdGlvbiByZWZyZXNoICgpIHtcbiAgICBwb2xsVmlld3BvcnQoKVxuICAgIGNvcmUucHJvY3MucmVmcmVzaCgpXG4gICAgaWYgKHRpbWVyKSB7XG4gICAgICB0aW1lci51cGRhdGUoKVxuICAgIH1cbiAgfVxuXG4gIHJlZnJlc2goKVxuXG4gIHZhciByZWdsID0gZXh0ZW5kKGNvbXBpbGVQcm9jZWR1cmUsIHtcbiAgICAvLyBDbGVhciBjdXJyZW50IEZCT1xuICAgIGNsZWFyOiBjbGVhcixcblxuICAgIC8vIFNob3J0IGN1dHMgZm9yIGR5bmFtaWMgdmFyaWFibGVzXG4gICAgcHJvcDogZHluYW1pYy5kZWZpbmUuYmluZChudWxsLCBEWU5fUFJPUCksXG4gICAgY29udGV4dDogZHluYW1pYy5kZWZpbmUuYmluZChudWxsLCBEWU5fQ09OVEVYVCksXG4gICAgdGhpczogZHluYW1pYy5kZWZpbmUuYmluZChudWxsLCBEWU5fU1RBVEUpLFxuXG4gICAgLy8gZXhlY3V0ZXMgYW4gZW1wdHkgZHJhdyBjb21tYW5kXG4gICAgZHJhdzogY29tcGlsZVByb2NlZHVyZSh7fSksXG5cbiAgICAvLyBSZXNvdXJjZXNcbiAgICBidWZmZXI6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICByZXR1cm4gYnVmZmVyU3RhdGUuY3JlYXRlKG9wdGlvbnMsIEdMX0FSUkFZX0JVRkZFUilcbiAgICB9LFxuICAgIGVsZW1lbnRzOiBlbGVtZW50U3RhdGUuY3JlYXRlLFxuICAgIHRleHR1cmU6IHRleHR1cmVTdGF0ZS5jcmVhdGUyRCxcbiAgICBjdWJlOiB0ZXh0dXJlU3RhdGUuY3JlYXRlQ3ViZSxcbiAgICByZW5kZXJidWZmZXI6IHJlbmRlcmJ1ZmZlclN0YXRlLmNyZWF0ZSxcbiAgICBmcmFtZWJ1ZmZlcjogZnJhbWVidWZmZXJTdGF0ZS5jcmVhdGUsXG4gICAgZnJhbWVidWZmZXJDdWJlOiBmcmFtZWJ1ZmZlclN0YXRlLmNyZWF0ZUN1YmUsXG5cbiAgICAvLyBFeHBvc2UgY29udGV4dCBhdHRyaWJ1dGVzXG4gICAgYXR0cmlidXRlczogZ2xBdHRyaWJ1dGVzLFxuXG4gICAgLy8gRnJhbWUgcmVuZGVyaW5nXG4gICAgZnJhbWU6IGZyYW1lLFxuXG4gICAgLy8gU3lzdGVtIGxpbWl0c1xuICAgIGxpbWl0czogbGltaXRzLFxuICAgIGhhc0V4dGVuc2lvbjogZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHJldHVybiBsaW1pdHMuZXh0ZW5zaW9ucy5pbmRleE9mKG5hbWUudG9Mb3dlckNhc2UoKSkgPj0gMFxuICAgIH0sXG5cbiAgICAvLyBSZWFkIHBpeGVsc1xuICAgIHJlYWQ6IHJlYWRQaXhlbHMsXG5cbiAgICAvLyBEZXN0cm95IHJlZ2wgYW5kIGFsbCBhc3NvY2lhdGVkIHJlc291cmNlc1xuICAgIGRlc3Ryb3k6IGRlc3Ryb3ksXG5cbiAgICAvLyBEaXJlY3QgR0wgc3RhdGUgbWFuaXB1bGF0aW9uXG4gICAgX2dsOiBnbCxcbiAgICBfcmVmcmVzaDogcmVmcmVzaCxcblxuICAgIHBvbGw6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHBvbGwoKVxuICAgICAgaWYgKHRpbWVyKSB7XG4gICAgICAgIHRpbWVyLnVwZGF0ZSgpXG4gICAgICB9XG4gICAgfSxcblxuICAgIC8vIHJlZ2wgU3RhdGlzdGljcyBJbmZvcm1hdGlvblxuICAgIHN0YXRzOiBzdGF0c1xuICB9KVxuXG4gIGNvbmZpZy5vbkRvbmUobnVsbCwgcmVnbClcblxuICByZXR1cm4gcmVnbFxufVxuIl19
