(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
module.exports=[[[1,11],[1,11],[1,11],[1,11],[1,11],[1,11],[1,11],[1,11],[6,6],[7,6],[8,6],[1,11],[1,11],[1,11],[1,11],[1,11]],
[[1,11],[0,0],[1,0],[1,0],[2,0],[1,11],[1,11],[1,11],[6,6],[7,6],[8,6],[1,11],[1,11],[1,11],[1,11],[1,11]],
[[1,11],[0,1],[1,1],[1,1],[2,1],[1,11],[1,11],[1,11],[6,6],[8,8],[8,6],[1,11],[1,11],[1,11],[1,11],[1,11]],
[[1,11],[0,1],[1,1],[0,3],[5,2],[1,11],[13,12],[13,12],[6,6],[7,6],[6,9],[1,11],[1,11],[1,11],[1,11],[1,11]],
[[1,11],[0,1],[1,1],[2,1],[1,11],[1,11],[13,15],[13,15],[6,6],[7,6],[7,6],[6,9],[1,11],[1,11],[1,11],[1,11]],
[[1,11],[0,2],[1,2],[2,2],[1,11],[1,11],[14,2],[15,2],[6,6],[7,6],[7,6],[7,6],[6,9],[8,5],[1,11],[1,11]],
[[1,11],[1,11],[1,11],[1,11],[1,11],[1,11],[1,11],[1,11],[6,6],[8,8],[7,6],[7,6],[7,6],[8,6],[1,11],[1,11]],
[[4,5],[2,5],[0,5],[1,5],[2,5],[1,11],[1,11],[1,11],[6,7],[7,8],[7,6],[7,6],[8,9],[6,9],[8,5],[1,11]],
[[2,8],[3,9],[4,9],[4,6],[3,9],[5,0],[1,11],[1,11],[1,11],[6,7],[7,8],[7,6],[7,6],[8,8],[8,6],[1,11]],
[[4,7],[4,7],[4,8],[5,8],[2,9],[3,9],[4,5],[2,5],[1,11],[1,11],[6,7],[7,8],[7,6],[7,6],[6,9],[8,5]],
[[1,11],[1,11],[3,7],[4,7],[4,8],[5,9],[5,8],[0,9],[2,5],[1,11],[1,11],[6,7],[7,8],[7,6],[7,6],[6,9]],
[[1,11],[1,11],[1,11],[1,11],[0,7],[4,8],[4,6],[4,6],[5,1],[1,11],[1,11],[1,11],[6,7],[7,8],[7,6],[7,6]],
[[1,11],[9,0],[10,0],[8,0],[1,11],[3,7],[1,7],[1,7],[5,7],[1,11],[1,11],[1,11],[1,11],[6,7],[7,7],[7,7]],
[[1,11],[9,1],[11,3],[11,1],[1,11],[1,11],[1,11],[1,11],[1,11],[1,11],[1,11],[1,11],[1,11],[1,11],[1,11],[1,11]],
[[1,11],[9,2],[7,2],[11,2],[1,11],[1,11],[1,11],[2,12],[1,13],[1,13],[1,13],[1,13],[1,13],[1,13],[0,12],[1,11]],
[[1,11],[1,11],[1,11],[1,11],[1,11],[1,11],[1,11],[2,10],[3,10],[3,10],[3,10],[3,10],[3,10],[3,10],[0,10],[1,11]]]

},{}],2:[function(require,module,exports){
const regl = require('../regl')()
const mouse = require('mouse-change')()
const MAP = require('./assets/map.json')

const drawBackground = regl({
  frag: `
  precision mediump float;
  uniform sampler2D map, tiles;
  uniform vec2 mapSize, tileSize;
  varying vec2 uv;
  void main() {
    vec2 tileCoord = floor(255.0 * texture2D(map, floor(uv) / mapSize).ra);
    gl_FragColor = texture2D(tiles, (tileCoord + fract(uv)) / tileSize);
  }`,

  vert: `
  precision mediump float;
  attribute vec2 position;
  uniform vec4 view;
  varying vec2 uv;
  void main() {
    uv = mix(view.xw, view.zy, 0.5 * (1.0 + position));
    gl_Position = vec4(position, 1, 1);
  }`,

  depth: { enable: false },

  uniforms: {
    tiles: regl.texture('assets/tiles.png'),
    tileSize: [16.0, 16.0],
    map: regl.texture(MAP),
    mapSize: [MAP[0].length, MAP.length],
    view: regl.prop('view')
  },

  attributes: {
    position: [ -1, -1, 1, -1, -1, 1, 1, 1, -1, 1, 1, -1 ]
  },

  count: 6
})

regl.frame(({viewportWidth, viewportHeight}) => {
  const {x, y} = mouse

  const boxX = MAP[0].length * x / viewportWidth
  const boxY = MAP.length * y / viewportHeight
  const boxH = 10
  const boxW = viewportWidth / viewportHeight * boxH

  drawBackground({
    view: [
      boxX - 0.5 * boxW,
      boxY - 0.5 * boxH,
      boxX + 0.5 * boxW,
      boxY + 0.5 * boxH
    ]
  })
})

},{"../regl":33,"./assets/map.json":1,"mouse-change":31}],3:[function(require,module,exports){
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

},{}],4:[function(require,module,exports){
// Array and element buffer creation

var isTypedArray = require('./util/is-typed-array')
var isNDArrayLike = require('./util/is-ndarray')
var arrayTypes = require('./constants/arraytypes.json')
var bufferTypes = require('./constants/dtypes.json')
var values = require('./util/values')

var GL_STATIC_DRAW = 35044

var GL_ARRAY_BUFFER = 34962

var GL_BYTE = 5120
var GL_UNSIGNED_BYTE = 5121
var GL_SHORT = 5122
var GL_UNSIGNED_SHORT = 5123
var GL_INT = 5124
var GL_UNSIGNED_INT = 5125
var GL_FLOAT = 5126

var usageTypes = {
  'static': 35044,
  'dynamic': 35048,
  'stream': 35040
}

function typedArrayCode (data) {
  return arrayTypes[Object.prototype.toString.call(data)] | 0
}

function makeTypedArray (dtype, args) {
  switch (dtype) {
    case GL_UNSIGNED_BYTE:
      return new Uint8Array(args)
    case GL_UNSIGNED_SHORT:
      return new Uint16Array(args)
    case GL_UNSIGNED_INT:
      return new Uint32Array(args)
    case GL_BYTE:
      return new Int8Array(args)
    case GL_SHORT:
      return new Int16Array(args)
    case GL_INT:
      return new Int32Array(args)
    case GL_FLOAT:
      return new Float32Array(args)
    default:
      return null
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

function transpose (result, data, shapeX, shapeY, strideX, strideY, offset) {
  var ptr = 0
  for (var i = 0; i < shapeX; ++i) {
    for (var j = 0; j < shapeY; ++j) {
      result[ptr++] = data[strideX * i + strideY * j + offset]
    }
  }
  return result
}

module.exports = function wrapBufferState (gl) {
  var bufferCount = 0
  var bufferSet = {}

  function REGLBuffer (type) {
    this.id = bufferCount++
    this.buffer = null
    this.type = type
    this.usage = GL_STATIC_DRAW
    this.byteLength = 0
    this.dimension = 1
    this.data = null
    this.dtype = GL_UNSIGNED_BYTE
  }

  REGLBuffer.prototype.bind = function () {
    gl.bindBuffer(this.type, this.buffer)
  }

  function refresh (buffer) {
    if (!gl.isBuffer(buffer.buffer)) {
      buffer.buffer = gl.createBuffer()
    }
    buffer.bind()
    gl.bufferData(buffer.type, buffer.data || buffer.byteLength, buffer.usage)
  }

  function destroy (buffer) {
    var handle = buffer.buffer
    
    if (gl.isBuffer(handle)) {
      gl.deleteBuffer(handle)
    }
    buffer.buffer = null
    delete bufferSet[buffer.id]
  }

  // TODO Implement pooled allocator for stream buffers
  function createStream (data) {
    var result = createBuffer({
      data: data,
      usage: 'stream'
    },
    GL_ARRAY_BUFFER,
    false)
    return result._buffer
  }

  function destroyStream (stream) {
    destroy(stream)
  }

  function createBuffer (options, type, deferInit) {
    var buffer = new REGLBuffer(type)
    bufferSet[buffer.id] = buffer

    function reglBuffer (input) {
      var options = input || {}
      if (Array.isArray(options) ||
          isTypedArray(options) ||
          isNDArrayLike(options)) {
        options = {
          data: options
        }
      } else if (typeof options === 'number') {
        options = {
          length: options | 0
        }
      } else if (options === null || options === void 0) {
        options = {}
      }

      

      if ('usage' in options) {
        var usage = options.usage
        
        buffer.usage = usageTypes[options.usage]
      } else {
        buffer.usage = GL_STATIC_DRAW
      }

      var dtype = 0
      if ('type' in options) {
        
        dtype = bufferTypes[options.type]
      }

      var dimension = (options.dimension | 0) || 1
      var byteLength = 0
      var data = null
      if ('data' in options) {
        data = options.data
        if (data === null) {
          byteLength = options.length | 0
        } else {
          if (isNDArrayLike(data)) {
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

            dtype = dtype || typedArrayCode(data.data) || GL_FLOAT
            dimension = shapeY
            data = transpose(
              makeTypedArray(dtype, shapeX * shapeY),
              data.data,
              shapeX, shapeY,
              strideX, strideY,
              offset)
          } else if (Array.isArray(data)) {
            if (data.length > 0 && Array.isArray(data[0])) {
              dimension = data[0].length
              dtype = dtype || GL_FLOAT
              var result = makeTypedArray(dtype, data.length * dimension)
              data = flatten(result, data, dimension)
              data = result
            } else {
              dtype = dtype || GL_FLOAT
              data = makeTypedArray(dtype, data)
            }
          } else {
            
            dtype = dtype || typedArrayCode(data)
          }
          byteLength = data.byteLength
        }
      } else if ('length' in options) {
        byteLength = options.length | 0
        
      }

      buffer.data = data
      buffer.dtype = dtype || GL_UNSIGNED_BYTE
      buffer.byteLength = byteLength
      buffer.dimension = dimension

      refresh(buffer)

      return reglBuffer
    }

    if (!deferInit) {
      reglBuffer(options)
    }

    reglBuffer._reglType = 'buffer'
    reglBuffer._buffer = buffer
    reglBuffer.destroy = function () { destroy(buffer) }

    return reglBuffer
  }

  return {
    create: createBuffer,

    createStream: createStream,
    destroyStream: destroyStream,

    clear: function () {
      values(bufferSet).forEach(destroy)
    },

    refresh: function () {
      values(bufferSet).forEach(refresh)
    },

    getBuffer: function (wrapper) {
      if (wrapper && wrapper._buffer instanceof REGLBuffer) {
        return wrapper._buffer
      }
      return null
    }
  }
}

},{"./constants/arraytypes.json":5,"./constants/dtypes.json":6,"./util/is-ndarray":22,"./util/is-typed-array":23,"./util/values":29}],5:[function(require,module,exports){
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

},{}],6:[function(require,module,exports){
module.exports={
  "int8": 5120
, "int16": 5122
, "int32": 5124
, "uint8": 5121
, "uint16": 5123
, "uint32": 5125
, "float": 5126
}

},{}],7:[function(require,module,exports){
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

},{}],8:[function(require,module,exports){

var createEnvironment = require('./util/codegen')
var loop = require('./util/loop')
var isTypedArray = require('./util/is-typed-array')
var isNDArray = require('./util/is-ndarray')

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
  contextState) {
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
    dirty: true
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
          return null
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
        if ('w' in box) {
          w = box.w | 0
          
        } else {
          isStatic = false
        }
        if ('h' in box) {
          h = box.h | 0
          
        } else {
          isStatic = false
        }

        return new Declaration(
          isStatic && framebuffer && framebuffer.thisDep,
          isStatic && framebuffer && framebuffer.contextDep,
          isStatic && framebuffer && framebuffer.propDep,
          function (env, scope) {
            var CONTEXT = env.shared.context
            var BOX_W = w
            if (!('w' in box)) {
              BOX_W = scope.def(CONTEXT, '.', S_FRAMEBUFFER_WIDTH, '-', x)
            }
            var BOX_H = h
            if (!('h' in box)) {
              BOX_H = scope.def(CONTEXT, '.', S_FRAMEBUFFER_HEIGHT, '-', y)
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
            '"w" in ', BOX, '?', BOX, '.w|0:',
            '(', CONTEXT, '.', S_FRAMEBUFFER_WIDTH, '-', BOX_X, ')')
          var BOX_H = scope.def(
            '"h" in ', BOX, '?', BOX, '.h|0:',
            '(', CONTEXT, '.', S_FRAMEBUFFER_HEIGHT, '-', BOX_Y, ')')

          

          return [BOX_X, BOX_Y, BOX_W, BOX_H]
        })
        if (framebuffer) {
          result.thisDep = result.thisDep || framebuffer.thisDep
          result.contextDep = result.contextDep || framebuffer.contextDep
          result.propDep = result.propDep || framebuffer.prpoDep
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
      } else if (
        typeof value === 'function' &&
        value._reglType === 'texture') {
        result = createStaticDecl(function (env) {
          return env.link(value)
        })
      } else if (Array.isArray(value) || isTypedArray(value)) {
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
            if ('size' in value) {
              
            }

            var normalized = !!value.normalized
            if ('normalized' in value) {
              
            }

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
          BUFFER, '=', BUFFER_STATE, '.createStream(', VALUE, ');',
          TYPE, '=', BUFFER, '.dtype;',
          '}else{',
          BUFFER, '=', BUFFER_STATE, '.getBuffer(', VALUE, ');',
          'if(', BUFFER, '){',
          TYPE, '=', BUFFER, '.dtype;',
          '}else if(', VALUE, '.constant){',
          result.state, '=', ATTRIB_STATE_CONSTANT, ';',
          CUTE_COMPONENTS.map(function (name, i) {
            return (
              result[name] + '=' + VALUE + '.length>=' + i +
              '?' + VALUE + '[' + i + ']:0;'
            )
          }).join(''),
          '}else{',
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
  function emitPollFramebuffer (env, scope, framebuffer) {
    var shared = env.shared

    var GL = shared.gl
    var FRAMEBUFFER_STATE = shared.framebuffer
    var EXT_DRAW_BUFFERS
    if (extDrawBuffers) {
      EXT_DRAW_BUFFERS = scope.def(shared.extensions, '.webgl_draw_buffers')
    }

    var constants = env.constants

    var DRAW_BUFFERS = constants.drawBuffers
    var BACK_BUFFER = constants.backBuffer

    var NEXT
    if (framebuffer) {
      NEXT = framebuffer.append(env, scope)
    } else {
      NEXT = scope.def(FRAMEBUFFER_STATE, '.next')
    }

    scope(
      'if(', FRAMEBUFFER_STATE, '.dirty||', NEXT, '!==', FRAMEBUFFER_STATE, '.cur){',
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
      FRAMEBUFFER_STATE, '.cur=', NEXT, ';',
      FRAMEBUFFER_STATE, '.dirty=false;',
      '}')
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
          return p + '===' + CURRENT + '[' + i + ']'
        }).join('&&'))
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
      } else if (Array.isArray(variable)) {
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
          'if(!', BINDING, '.pointer){',
          GL, '.enableVertexAttribArray(', LOCATION, ');',
          BINDING, '.pointer=true;}')

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
          'if(', BINDING, '.pointer){',
          GL, '.disableVertexAttribArray(', LOCATION, ');',
          BINDING, '.pointer=false;',
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
        if (arg.static) {
          var value = arg.value
          if (type === GL_SAMPLER_2D || type === GL_SAMPLER_CUBE) {
            
            var TEX_VALUE = env.link(value._texture)
            scope(GL, '.uniform1i(', LOCATION, TEX_VALUE + '.bind());')
            scope.exit(TEX_VALUE, '.unbind()')
          } else if (
            type === GL_FLOAT_MAT2 ||
            type === GL_FLOAT_MAT3 ||
            type === GL_FLOAT_MAT4) {
            
            var MAT_VALUE = env.global.def('[' + value + ']')
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
              default:
                
            }
            scope(GL, '.uniform', infix, '(', LOCATION, ',', value, ');')
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

      // perform type validation
      

      var separator = ','
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
          infix = '2iv'
          break

        case GL_INT_VEC3:
        case GL_BOOL_VEC3:
          infix = '3iv'
          break

        case GL_INT_VEC4:
        case GL_BOOL_VEC4:
          infix = '4iv'
          break

        case GL_FLOAT:
          infix = '1f'
          break

        case GL_FLOAT_VEC2:
          infix = '2fv'
          break

        case GL_FLOAT_VEC3:
          infix = '3fv'
          break

        case GL_FLOAT_VEC4:
          infix = '4fv'
          break

        case GL_FLOAT_MAT2:
          infix = 'Matrix2fv'
          separator = ',false,'
          break

        case GL_FLOAT_MAT3:
          infix = 'Matrix3fv'
          separator = ',false,'
          break

        case GL_FLOAT_MAT4:
          infix = 'Matrix4fv'
          separator = ',false,'
          break
      }
      scope(GL, '.uniform', infix, '(', LOCATION, separator, VALUE, ');')
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
        if (!defn.batchStatic) {
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
        if (!defn.batchStatic) {
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
        if (defn.batchStatic) {
          return defn.append(env, outer)
        } else {
          return defn.append(env, inner)
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

    var contextDynamic = args.contextDynamic

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
    }

    // viewport is weird because it can affect context vars
    if (args.state.viewport && args.state.viewport.propDynamic) {
      contextDynamic = true
    }

    // set webgl options
    emitPollState(env, batch, args)
    emitSetOptions(env, batch, args.state, function (defn) {
      return !((defn.contextDep && contextDynamic) || defn.propDep)
    })

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
      if (Array.isArray(value)) {
        value.forEach(function (v, i) {
          scope.set(env.next[name], '[' + i + ']', v)
        })
      } else {
        scope.set(shared.next, '.' + name, value)
      }
    })

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

    scope('a1(', env.shared.context, ',a0,0);')
  }

  // ===========================================================================
  // ===========================================================================
  // MAIN DRAW COMMAND
  // ===========================================================================
  // ===========================================================================
  function compileCommand (options, attributes, uniforms, context) {
    var env = createREGLEnvironment()
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

      refresh(shared.framebuffer, '.dirty=true;')
      emitPollFramebuffer(env, refresh)

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
        if (Array.isArray(init)) {
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

},{"./constants/dtypes.json":6,"./constants/primitives.json":7,"./util/codegen":20,"./util/is-ndarray":22,"./util/is-typed-array":23,"./util/loop":25}],9:[function(require,module,exports){


var VARIABLE_COUNTER = 0

var DYN_FUNC = 0
var DYN_PENDING_FLAG = 128

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
  switch (typeof data) {
    case 'boolean':
    case 'number':
    case 'string':
      return new DynamicVariable(type, toAccessorString(data + ''))

    case 'undefined':
      return new DynamicVariable(type | DYN_PENDING_FLAG, null)

    default:
      
  }
}

function isDynamic (x) {
  return (typeof x === 'function' && !x._reglType) ||
         x instanceof DynamicVariable
}

function unbox (x, path) {
  if (x instanceof DynamicVariable) {
    if (x.type & DYN_PENDING_FLAG) {
      return new DynamicVariable(
        x.type & ~DYN_PENDING_FLAG,
        toAccessorString(path))
    }
  } else if (typeof x === 'function') {
    return new DynamicVariable(DYN_FUNC, x)
  }
  return x
}

module.exports = {
  define: defineDynamic,
  isDynamic: isDynamic,
  unbox: unbox,
  accessor: toAccessorString
}

},{}],10:[function(require,module,exports){

var isTypedArray = require('./util/is-typed-array')
var isNDArrayLike = require('./util/is-ndarray')
var primTypes = require('./constants/primitives.json')

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

module.exports = function wrapElementsState (gl, extensions, bufferState) {
  function REGLElementBuffer () {
    this.buffer = null
    this.primType = GL_TRIANGLES
    this.vertCount = 0
    this.type = 0
  }

  REGLElementBuffer.prototype.bind = function () {
    this.buffer.bind()
  }

  function createElements (options) {
    var elements = new REGLElementBuffer()
    var buffer = bufferState.create(null, GL_ELEMENT_ARRAY_BUFFER, true)
    elements.buffer = buffer._buffer

    function reglElements (input) {
      var options = input
      var ext32bit = extensions.oes_element_index_uint

      // Upload data to vertex buffer
      if (!options) {
        buffer()
      } else if (typeof options === 'number') {
        buffer(options)
      } else {
        var data = null
        var usage = 'static'
        if (
          Array.isArray(options) ||
          isTypedArray(options) ||
          isNDArrayLike(options)) {
          data = options
        } else {
          
          if ('data' in options) {
            data = options.data
          }
          if ('usage' in options) {
            usage = options.usage
          }
        }
        if (Array.isArray(data) ||
            (isNDArrayLike(data) && Array.isArray(data.data)) ||
            'type' in options) {
          buffer({
            type: options.type ||
              (ext32bit
                ? 'uint32'
                : 'uint16'),
            usage: usage,
            data: data
          })
        } else {
          buffer({
            usage: usage,
            data: data
          })
        }
        if (Array.isArray(data) || isTypedArray(data)) {
          buffer.dimension = 3
        }
      }

      // try to guess default primitive type and arguments
      var vertCount = elements.buffer.byteLength
      var type = 0
      switch (elements.buffer.dtype) {
        case GL_UNSIGNED_BYTE:
        case GL_BYTE:
          type = GL_UNSIGNED_BYTE
          break

        case GL_UNSIGNED_SHORT:
        case GL_SHORT:
          type = GL_UNSIGNED_SHORT
          vertCount >>= 1
          break

        case GL_UNSIGNED_INT:
        case GL_INT:
          
          type = GL_UNSIGNED_INT
          vertCount >>= 2
          break

        default:
          
      }

      // try to guess primitive type from cell dimension
      var primType = GL_TRIANGLES
      var dimension = elements.buffer.dimension
      if (dimension === 1) primType = GL_POINTS
      if (dimension === 2) primType = GL_LINES
      if (dimension === 3) primType = GL_TRIANGLES

      // if manual override present, use that
      if (typeof options === 'object') {
        if ('primitive' in options) {
          var primitive = options.primitive
          
          primType = primTypes[primitive]
        }

        if ('count' in options) {
          vertCount = options.vertCount | 0
        }
      }

      // update properties for element buffer
      elements.primType = primType
      elements.vertCount = vertCount
      elements.type = type

      return reglElements
    }

    reglElements(options)

    reglElements._reglType = 'elements'
    reglElements._elements = elements
    reglElements.destroy = function () {
      
      buffer.destroy()
      elements.buffer = null
    }

    return reglElements
  }

  // TODO implemented pooled allocator for element buffer streams
  function createElementStream (data) {
    return createElements({
      usage: 'stream',
      data: data
    })._elements
  }

  function destroyElementStream (elements) {
    bufferState.destroyStream(elements.buffer)
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
    }
  }
}

},{"./constants/primitives.json":7,"./util/is-ndarray":22,"./util/is-typed-array":23}],11:[function(require,module,exports){
module.exports = function createExtensionCache (gl) {
  var extensions = {}

  function refreshExtensions () {
    [
      'oes_texture_float',
      'oes_texture_float_linear',
      'oes_texture_half_float',
      'oes_texture_half_float_linear',
      'oes_standard_derivatives',
      'oes_element_index_uint',
      'oes_fbo_render_mipmap',

      'webgl_depth_texture',
      'webgl_draw_buffers',
      'webgl_color_buffer_float',

      'ext_texture_filter_anisotropic',
      'ext_frag_depth',
      'ext_blend_minmax',
      'ext_shader_texture_lod',
      'ext_color_buffer_half_float',
      'ext_srgb',

      'angle_instanced_arrays',

      'webgl_compressed_texture_s3tc',
      'webgl_compressed_texture_atc',
      'webgl_compressed_texture_pvrtc',
      'webgl_compressed_texture_etc1'
    ].forEach(function (ext) {
      try {
        extensions[ext] = gl.getExtension(ext)
      } catch (e) {}
    })
  }

  refreshExtensions()

  return {
    extensions: extensions,
    refresh: refreshExtensions
  }
}

},{}],12:[function(require,module,exports){

var values = require('./util/values')
var extend = require('./util/extend')

// We store these constants so that the minifier can inline them
var GL_FRAMEBUFFER = 0x8D40
var GL_RENDERBUFFER = 0x8D41

var GL_TEXTURE_2D = 0x0DE1
var GL_TEXTURE_CUBE_MAP = 0x8513
var GL_TEXTURE_CUBE_MAP_POSITIVE_X = 0x8515

var GL_COLOR_ATTACHMENT0 = 0x8CE0
var GL_DEPTH_ATTACHMENT = 0x8D00
var GL_STENCIL_ATTACHMENT = 0x8D20
var GL_DEPTH_STENCIL_ATTACHMENT = 0x821A

var GL_UNSIGNED_BYTE = 0x1401
var GL_FLOAT = 0x1406

var GL_HALF_FLOAT_OES = 0x8D61

var GL_RGBA = 0x1908

var GL_RGBA4 = 0x8056
var GL_RGB5_A1 = 0x8057
var GL_RGB565 = 0x8D62
var GL_DEPTH_COMPONENT16 = 0x81A5
var GL_STENCIL_INDEX8 = 0x8D48

var GL_DEPTH_COMPONENT = 0x1902
var GL_DEPTH_STENCIL = 0x84F9

var GL_SRGB8_ALPHA8_EXT = 0x8C43

var GL_RGBA32F_EXT = 0x8814

var GL_RGBA16F_EXT = 0x881A
var GL_RGB16F_EXT = 0x881B

var GL_FRAMEBUFFER_COMPLETE = 0x8CD5
var GL_FRAMEBUFFER_INCOMPLETE_ATTACHMENT = 0x8CD6
var GL_FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT = 0x8CD7
var GL_FRAMEBUFFER_INCOMPLETE_DIMENSIONS = 0x8CD9
var GL_FRAMEBUFFER_UNSUPPORTED = 0x8CDD

module.exports = function wrapFBOState (
  gl,
  extensions,
  limits,
  textureState,
  renderbufferState) {
  var framebufferState = {
    current: null,
    next: null,
    dirty: false
  }

  var statusCode = {}
  statusCode[GL_FRAMEBUFFER_COMPLETE] = 'complete'
  statusCode[GL_FRAMEBUFFER_INCOMPLETE_ATTACHMENT] = 'incomplete attachment'
  statusCode[GL_FRAMEBUFFER_INCOMPLETE_DIMENSIONS] = 'incomplete dimensions'
  statusCode[GL_FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT] = 'incomplete, missing attachment'
  statusCode[GL_FRAMEBUFFER_UNSUPPORTED] = 'unsupported'

  var colorTextureFormats = {
    'rgba': GL_RGBA
  }

  var colorRenderbufferFormats = {
    'rgba4': GL_RGBA4,
    'rgb565': GL_RGB565,
    'rgb5 a1': GL_RGB5_A1
  }

  if (extensions.ext_srgb) {
    colorRenderbufferFormats['srgba'] = GL_SRGB8_ALPHA8_EXT
  }

  if (extensions.ext_color_buffer_half_float) {
    colorRenderbufferFormats['rgba16f'] = GL_RGBA16F_EXT
    colorRenderbufferFormats['rgb16f'] = GL_RGB16F_EXT
  }

  if (extensions.webgl_color_buffer_float) {
    colorRenderbufferFormats['rgba32f'] = GL_RGBA32F_EXT
  }

  var depthRenderbufferFormatEnums = [GL_DEPTH_COMPONENT16]
  var stencilRenderbufferFormatEnums = [GL_STENCIL_INDEX8]
  var depthStencilRenderbufferFormatEnums = [GL_DEPTH_STENCIL]

  var depthTextureFormatEnums = []
  var stencilTextureFormatEnums = []
  var depthStencilTextureFormatEnums = []

  if (extensions.webgl_depth_texture) {
    depthTextureFormatEnums.push(GL_DEPTH_COMPONENT)
    depthStencilTextureFormatEnums.push(GL_DEPTH_STENCIL)
  }

  var colorFormats = extend(extend({},
    colorTextureFormats),
    colorRenderbufferFormats)

  var colorTextureFormatEnums = values(colorTextureFormats)
  var colorRenderbufferFormatEnums = values(colorRenderbufferFormats)

  var highestPrecision = GL_UNSIGNED_BYTE
  var colorTypes = {
    'uint8': GL_UNSIGNED_BYTE
  }
  if (extensions.oes_texture_half_float) {
    highestPrecision = colorTypes['half float'] = GL_HALF_FLOAT_OES
  }
  if (extensions.oes_texture_float) {
    highestPrecision = colorTypes.float = GL_FLOAT
  }
  colorTypes.best = highestPrecision

  var DRAW_BUFFERS = (function () {
    var result = new Array(limits.maxDrawbuffers)
    for (var i = 0; i <= limits.maxDrawbuffers; ++i) {
      var row = result[i] = new Array(i)
      for (var j = 0; j < i; ++j) {
        row[j] = GL_COLOR_ATTACHMENT0 + j
      }
    }
    return result
  })()

  function FramebufferAttachment (target, level, texture, renderbuffer) {
    this.target = target
    this.level = level
    this.texture = texture
    this.renderbuffer = renderbuffer
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

  function incRefAndCheckShape (attachment, framebuffer) {
    var width = framebuffer.width
    var height = framebuffer.height
    if (attachment.texture) {
      var texture = attachment.texture._texture
      var tw = Math.max(1, texture.params.width >> attachment.level)
      var th = Math.max(1, texture.params.height >> attachment.level)
      width = width || tw
      height = height || th
      
      
      texture.refCount += 1
    } else {
      var renderbuffer = attachment.renderbuffer._renderbuffer
      width = width || renderbuffer.width
      height = height || renderbuffer.height
      
      
      renderbuffer.refCount += 1
    }
    framebuffer.width = width
    framebuffer.height = height
  }

  function attach (location, attachment) {
    if (attachment) {
      if (attachment.texture) {
        gl.framebufferTexture2D(
          GL_FRAMEBUFFER,
          location,
          attachment.target,
          attachment.texture._texture.texture,
          attachment.level)
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

  function tryUpdateAttachment (
    attachment,
    isTexture,
    format,
    type,
    width,
    height) {
    if (attachment.texture) {
      var texture = attachment.texture
      if (isTexture) {
        texture({
          format: format,
          type: type,
          width: width,
          height: height
        })
        texture._texture.refCount += 1
        return true
      }
    } else {
      var renderbuffer = attachment.renderbuffer
      if (!isTexture) {
        renderbuffer({
          format: format,
          width: width,
          height: height
        })
        renderbuffer._renderbuffer.refCount += 1
        return true
      }
    }
    decRef(attachment)
    return false
  }

  function parseAttachment (attachment) {
    var target = GL_TEXTURE_2D
    var level = 0
    var texture = null
    var renderbuffer = null

    var data = attachment
    if (typeof attachment === 'object') {
      data = attachment.data
      if ('level' in attachment) {
        level = attachment.level | 0
      }
      if ('target' in attachment) {
        target = attachment.target | 0
      }
    }

    

    var type = attachment._reglType
    if (type === 'texture') {
      texture = attachment
      if (texture._texture.target === GL_TEXTURE_CUBE_MAP) {
        
      } else {
        
      }
      // TODO check miplevel is consistent
    } else if (type === 'renderbuffer') {
      renderbuffer = attachment
      target = GL_RENDERBUFFER
      level = 0
    } else {
      
    }

    return new FramebufferAttachment(target, level, texture, renderbuffer)
  }

  function unwrapAttachment (attachment) {
    return attachment && (attachment.texture || attachment.renderbuffer)
  }

  var framebufferCount = 0
  var framebufferSet = {}

  function REGLFramebuffer () {
    this.id = framebufferCount++
    framebufferSet[this.id] = this

    this.framebuffer = null
    this.width = 0
    this.height = 0

    this.colorAttachments = []
    this.depthAttachment = null
    this.stencilAttachment = null
    this.depthStencilAttachment = null

    this.ownsColor = false
    this.ownsDepthStencil = false
  }

  function refresh (framebuffer) {
    if (!gl.isFramebuffer(framebuffer.framebuffer)) {
      framebuffer.framebuffer = gl.createFramebuffer()
    }
    framebufferState.dirty = true
    gl.bindFramebuffer(GL_FRAMEBUFFER, framebuffer.framebuffer)

    var colorAttachments = framebuffer.colorAttachments
    for (var i = 0; i < colorAttachments.length; ++i) {
      attach(GL_COLOR_ATTACHMENT0 + i, colorAttachments[i])
    }
    for (i = colorAttachments.length; i < limits.maxColorAttachments; ++i) {
      attach(GL_COLOR_ATTACHMENT0 + i, null)
    }
    attach(GL_DEPTH_ATTACHMENT, framebuffer.depthAttachment)
    attach(GL_STENCIL_ATTACHMENT, framebuffer.stencilAttachment)
    attach(GL_DEPTH_STENCIL_ATTACHMENT, framebuffer.depthStencilAttachment)

    if (extensions.webgl_draw_buffers) {
      extensions.webgl_draw_buffers.drawBuffersWEBGL(
        DRAW_BUFFERS[colorAttachments.length])
    }

    // Check status code
    var status = gl.checkFramebufferStatus(GL_FRAMEBUFFER)
    if (status !== GL_FRAMEBUFFER_COMPLETE) {
      
    }
  }

  function decFBORefs (framebuffer) {
    framebuffer.colorAttachments.forEach(decRef)
    decRef(framebuffer.depthAttachment)
    decRef(framebuffer.stencilAttachment)
    decRef(framebuffer.depthStencilAttachment)
  }

  function destroy (framebuffer) {
    var handle = framebuffer.framebuffer
    
    if (gl.isFramebuffer(handle)) {
      gl.deleteFramebuffer(handle)
    }
  }

  function createFBO (options) {
    var framebuffer = new REGLFramebuffer()

    function reglFramebuffer (input) {
      var i
      var options = input || {}

      var extDrawBuffers = extensions.webgl_draw_buffers

      var width = 0
      var height = 0
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

      // colorType, numColors
      var colorBuffers = null
      var ownsColor = false
      if ('colorBuffers' in options || 'colorBuffer' in options) {
        var colorInputs = options.colorBuffers || options.colorBuffer
        if (!Array.isArray(colorInputs)) {
          colorInputs = [colorInputs]
        }

        framebuffer.width = width
        framebuffer.height = height

        if (colorInputs.length > 1) {
          
        }
        

        // Wrap color attachments
        colorBuffers = colorInputs.map(parseAttachment)

        // Check head node
        for (i = 0; i < colorBuffers.length; ++i) {
          var colorAttachment = colorBuffers[i]
          
          incRefAndCheckShape(
            colorAttachment,
            framebuffer)
        }

        width = framebuffer.width
        height = framebuffer.height
      } else {
        var colorTexture = true
        var colorFormat = 'rgba'
        var colorType = 'uint8'
        var colorCount = 1
        ownsColor = true

        framebuffer.width = width = width || gl.drawingBufferWidth
        framebuffer.height = height = height || gl.drawingBufferHeight

        if ('format' in options) {
          colorFormat = options.format
          
          colorTexture = colorFormat in colorTextureFormats
        }

        if ('type' in options) {
          
          colorType = options.type
          
        }

        if ('colorCount' in options) {
          colorCount = options.colorCount | 0
          
        }

        // Reuse color buffer array if we own it
        if (framebuffer.ownsColor) {
          colorBuffers = framebuffer.colorAttachments
          while (colorBuffers.length > colorCount) {
            decRef(colorBuffers.pop())
          }
        } else {
          colorBuffers = []
        }

        // update buffers in place, remove incompatible buffers
        for (i = 0; i < colorBuffers.length; ++i) {
          if (!tryUpdateAttachment(
              colorBuffers[i],
              colorTexture,
              colorFormat,
              colorType,
              width,
              height)) {
            colorBuffers[i--] = colorBuffers[colorBuffers.length - 1]
            colorBuffers.pop()
          }
        }

        // Then append new buffers
        while (colorBuffers.length < colorCount) {
          if (colorTexture) {
            colorBuffers.push(new FramebufferAttachment(
              GL_TEXTURE_2D,
              0,
              textureState.create({
                format: colorFormat,
                type: colorType,
                width: width,
                height: height
              }, GL_TEXTURE_2D),
              null))
          } else {
            colorBuffers.push(new FramebufferAttachment(
              GL_RENDERBUFFER,
              0,
              null,
              renderbufferState.create({
                format: colorFormat,
                width: width,
                height: height
              })))
          }
        }
      }

      

      framebuffer.width = width
      framebuffer.height = height

      var depthBuffer = null
      var stencilBuffer = null
      var depthStencilBuffer = null
      var ownsDepthStencil = false
      var depthStencilCount = 0

      if ('depthBuffer' in options) {
        depthBuffer = parseAttachment(options.depthBuffer)
        
        depthStencilCount += 1
      }
      if ('stencilBuffer' in options) {
        stencilBuffer = parseAttachment(options.stencilBuffer)
        
        depthStencilCount += 1
      }
      if ('depthStencilBuffer' in options) {
        depthStencilBuffer = parseAttachment(options.depthStencilBuffer)
        
        depthStencilCount += 1
      }

      if (!(depthBuffer || stencilBuffer || depthStencilBuffer)) {
        var depth = true
        var stencil = false
        var useTexture = false

        if ('depth' in options) {
          depth = !!options.depth
        }
        if ('stencil' in options) {
          stencil = !!options.stencil
        }
        if ('depthTexture' in options) {
          useTexture = !!options.depthTexture
        }

        var curDepthStencil =
          framebuffer.depthAttachment ||
          framebuffer.stencilAttachment ||
          framebuffer.depthStencilAttachment
        var nextDepthStencil = null

        if (depth || stencil) {
          ownsDepthStencil = true

          if (useTexture) {
            
            var depthTextureFormat
            
            if (stencil) {
              depthTextureFormat = 'depth stencil'
            } else {
              depthTextureFormat = 'depth'
            }
            if (framebuffer.ownsDepthStencil && curDepthStencil.texture) {
              curDepthStencil.texture({
                format: depthTextureFormat,
                width: width,
                height: height
              })
              curDepthStencil.texture._texture.refCount += 1
              nextDepthStencil = curDepthStencil
            } else {
              nextDepthStencil = new FramebufferAttachment(
                GL_TEXTURE_2D,
                0,
                textureState.create({
                  format: depthTextureFormat,
                  width: width,
                  height: height
                }, GL_TEXTURE_2D),
                null)
            }
          } else {
            var depthRenderbufferFormat
            if (depth) {
              if (stencil) {
                depthRenderbufferFormat = 'depth stencil'
              } else {
                depthRenderbufferFormat = 'depth'
              }
            } else {
              depthRenderbufferFormat = 'stencil'
            }
            if (framebuffer.ownsDepthStencil && curDepthStencil.renderbuffer) {
              curDepthStencil.renderbuffer({
                format: depthRenderbufferFormat,
                width: width,
                height: height
              })
              curDepthStencil.renderbuffer._renderbuffer.refCount += 1
              nextDepthStencil = curDepthStencil
            } else {
              nextDepthStencil = new FramebufferAttachment(
                GL_RENDERBUFFER,
                0,
                null,
                renderbufferState.create({
                  format: depthRenderbufferFormat,
                  width: width,
                  height: height
                }))
            }
          }

          if (depth) {
            if (stencil) {
              depthStencilBuffer = nextDepthStencil
            } else {
              depthBuffer = nextDepthStencil
            }
          } else {
            stencilBuffer = nextDepthStencil
          }
        }
      } else {
        

        incRefAndCheckShape(
          depthBuffer ||
          stencilBuffer ||
          depthStencilBuffer,
          framebuffer)
      }

      decFBORefs(framebuffer)

      framebuffer.colorAttachments = colorBuffers
      framebuffer.depthAttachment = depthBuffer
      framebuffer.stencilAttachment = stencilBuffer
      framebuffer.depthStencilAttachment = depthStencilBuffer
      framebuffer.ownsColor = ownsColor
      framebuffer.ownsDepthStencil = ownsDepthStencil

      reglFramebuffer.color = colorBuffers.map(unwrapAttachment)
      reglFramebuffer.depth = unwrapAttachment(depthBuffer)
      reglFramebuffer.stencil = unwrapAttachment(stencilBuffer)
      reglFramebuffer.depthStencil = unwrapAttachment(depthStencilBuffer)

      refresh(framebuffer)

      reglFramebuffer.width = framebuffer.width
      reglFramebuffer.height = framebuffer.height

      return reglFramebuffer
    }

    reglFramebuffer(options)

    reglFramebuffer._reglType = 'framebuffer'
    reglFramebuffer._framebuffer = framebuffer
    reglFramebuffer._destroy = function () {
      destroy(framebuffer)
    }

    return reglFramebuffer
  }

  function refreshCache () {
    values(framebufferSet).forEach(refresh)
  }

  function clearCache () {
    values(framebufferSet).forEach(destroy)
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
    clear: clearCache,
    refresh: refreshCache
  })
}

},{"./util/extend":21,"./util/values":29}],13:[function(require,module,exports){
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

module.exports = function wrapReadPixels (gl, reglPoll, context) {
  function readPixels (input) {
    var options = input || {}
    if (isTypedArray(input)) {
      options = {
        data: options
      }
    } else if (arguments.length === 2) {
      options = {
        width: arguments[0] | 0,
        height: arguments[1] | 0
      }
    } else if (typeof input !== 'object') {
      options = {}
    }

    // Update WebGL state
    reglPoll()

    // Read viewport state
    var x = options.x || 0
    var y = options.y || 0
    var width = options.width || context.viewportWidth
    var height = options.height || context.viewportHeight

    // Compute size
    var size = width * height * 4

    // Allocate data
    var data = options.data || new Uint8Array(size)

    // Type check
    
    

    // Run read pixels
    gl.pixelStorei(GL_PACK_ALIGNMENT, 4)
    gl.readPixels(x, y, width, height, GL_RGBA, GL_UNSIGNED_BYTE, data)

    return data
  }

  return readPixels
}

},{"./util/is-typed-array":23}],15:[function(require,module,exports){

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

module.exports = function (gl, extensions, limits) {
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

  function REGLRenderbuffer () {
    this.id = renderbufferCount++
    this.refCount = 1

    this.renderbuffer = null

    this.format = GL_RGBA4
    this.width = 0
    this.height = 0
  }

  REGLRenderbuffer.prototype.decRef = function () {
    if (--this.refCount === 0) {
      destroy(this)
    }
  }

  function refresh (rb) {
    if (!gl.isRenderbuffer(rb.renderbuffer)) {
      rb.renderbuffer = gl.createRenderbuffer()
    }
    gl.bindRenderbuffer(GL_RENDERBUFFER, rb.renderbuffer)
    gl.renderbufferStorage(
      GL_RENDERBUFFER,
      rb.format,
      rb.width,
      rb.height)
  }

  function destroy (rb) {
    var handle = rb.renderbuffer
    
    gl.bindRenderbuffer(GL_RENDERBUFFER, null)
    if (gl.isRenderbuffer(handle)) {
      gl.deleteRenderbuffer(handle)
    }
    rb.renderbuffer = null
    rb.refCount = 0
    delete renderbufferSet[rb.id]
  }

  function createRenderbuffer (input) {
    var renderbuffer = new REGLRenderbuffer()
    renderbufferSet[renderbuffer.id] = renderbuffer

    function reglRenderbuffer (input) {
      var options = input || {}

      var w = 0
      var h = 0
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
      var s = limits.maxRenderbufferSize
      
      reglRenderbuffer.width = renderbuffer.width = Math.max(w, 1)
      reglRenderbuffer.height = renderbuffer.height = Math.max(h, 1)

      renderbuffer.format = GL_RGBA4
      if ('format' in options) {
        var format = options.format
        
        renderbuffer.format = formatTypes[format]
      }

      refresh(renderbuffer)

      return reglRenderbuffer
    }

    reglRenderbuffer(input)

    reglRenderbuffer._reglType = 'renderbuffer'
    reglRenderbuffer._renderbuffer = renderbuffer
    reglRenderbuffer.destroy = function () {
      renderbuffer.decRef()
    }

    return reglRenderbuffer
  }

  function refreshRenderbuffers () {
    values(renderbufferSet).forEach(refresh)
  }

  function destroyRenderbuffers () {
    values(renderbufferSet).forEach(destroy)
  }

  return {
    create: createRenderbuffer,
    refresh: refreshRenderbuffers,
    clear: destroyRenderbuffers
  }
}

},{"./util/values":29}],16:[function(require,module,exports){

var values = require('./util/values')

var GL_FRAGMENT_SHADER = 35632
var GL_VERTEX_SHADER = 35633

var GL_ACTIVE_UNIFORMS = 0x8B86
var GL_ACTIVE_ATTRIBUTES = 0x8B89

module.exports = function wrapShaderState (gl, stringStore) {
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
    },

    refresh: function () {
      fragShaders = {}
      vertShaders = {}
      programList.forEach(linkProgram)
    },

    program: function (vertId, fragId, command) {
      
      

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

},{"./util/values":29}],17:[function(require,module,exports){
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

},{}],18:[function(require,module,exports){

var extend = require('./util/extend')
var values = require('./util/values')
var isTypedArray = require('./util/is-typed-array')
var isNDArrayLike = require('./util/is-ndarray')
var loadTexture = require('./util/load-texture')
var convertToHalfFloat = require('./util/to-half-float')
var parseDDS = require('./util/parse-dds')

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

function isPow2 (v) {
  return !(v & (v - 1)) && (!!v)
}

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
  if (width === 0 || !Array.isArray(arr[0])) {
    return false
  }

  var height = arr[0].length
  for (var i = 1; i < width; ++i) {
    if (!Array.isArray(arr[i]) || arr[i].length !== height) {
      return false
    }
  }
  return true
}

function classString (x) {
  return Object.prototype.toString.call(x)
}

function isCanvasElement (object) {
  return classString(object) === '[object HTMLCanvasElement]'
}

function isContext2D (object) {
  return classString(object) === '[object CanvasRenderingContext2D]'
}

function isImageElement (object) {
  return classString(object) === '[object HTMLImageElement]'
}

function isVideoElement (object) {
  return classString(object) === '[object HTMLVideoElement]'
}

function isPendingXHR (object) {
  return classString(object) === '[object XMLHttpRequest]'
}

function isPixelData (object) {
  return (
    typeof object === 'string' ||
    (!!object && (
      isTypedArray(object) ||
      isNumericArray(object) ||
      isNDArrayLike(object) ||
      isCanvasElement(object) ||
      isContext2D(object) ||
      isImageElement(object) ||
      isVideoElement(object) ||
      isRectArray(object))))
}

// Transpose an array of pixels
function transposePixels (data, nx, ny, nc, sx, sy, sc, off) {
  var result = new data.constructor(nx * ny * nc)
  var ptr = 0
  for (var i = 0; i < ny; ++i) {
    for (var j = 0; j < nx; ++j) {
      for (var k = 0; k < nc; ++k) {
        result[ptr++] = data[sy * i + sx * j + sc * k + off]
      }
    }
  }
  return result
}

module.exports = function createTextureSet (gl, extensions, limits, reglPoll, contextState) {
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
    textureTypes.float = GL_FLOAT
  }

  if (extensions.oes_texture_half_float) {
    textureTypes['half float'] = GL_HALF_FLOAT_OES
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
      'rgb arc': GL_COMPRESSED_RGB_ATC_WEBGL,
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

  // Pixel storage parsing
  function PixelInfo (target) {
    // tex target
    this.target = target

    // pixelStorei info
    this.flipY = false
    this.premultiplyAlpha = false
    this.unpackAlignment = 1
    this.colorSpace = 0

    // shape
    this.width = 0
    this.height = 0
    this.channels = 0

    // format and type
    this.format = 0
    this.internalformat = 0
    this.type = 0
    this.compressed = false

    // mip level
    this.miplevel = 0

    // ndarray-like parameters
    this.strideX = 0
    this.strideY = 0
    this.strideC = 0
    this.offset = 0

    // copy pixels info
    this.x = 0
    this.y = 0
    this.copy = false

    // data sources
    this.data = null
    this.image = null
    this.video = null
    this.canvas = null
    this.xhr = null

    // CORS
    this.crossOrigin = null

    // horrible state flags
    this.needsPoll = false
    this.needsListeners = false
  }

  extend(PixelInfo.prototype, {
    parseFlags: function (options) {
      if (typeof options !== 'object' || !options) {
        return
      }

      if ('premultiplyAlpha' in options) {
        
        this.premultiplyAlpha = options.premultiplyAlpha
      }

      if ('flipY' in options) {
        
        this.flipY = options.flipY
      }

      if ('alignment' in options) {
        
        this.unpackAlignment = options.alignment
      }

      if ('colorSpace' in options) {
        
        this.colorSpace = colorSpace[options.colorSpace]
      }

      if ('format' in options) {
        var format = options.format
        
        this.internalformat = textureFormats[format]
        if (format in textureTypes) {
          this.type = textureTypes[format]
        }
        if (format in compressedTextureFormats) {
          this.compressed = true
        }
      }

      if ('type' in options) {
        var type = options.type
        
        this.type = textureTypes[type]
      }

      var w = this.width
      var h = this.height
      var c = this.channels
      if ('shape' in options) {
        
        w = options.shape[0]
        h = options.shape[1]
        if (options.shape.length === 3) {
          c = options.shape[2]
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
        }
      }
      this.width = w | 0
      this.height = h | 0
      this.channels = c | 0

      if ('stride' in options) {
        var stride = options.stride
        
        this.strideX = stride[0]
        this.strideY = stride[1]
        if (stride.length === 3) {
          this.strideC = stride[2]
        } else {
          this.strideC = 1
        }
        this.needsTranspose = true
      } else {
        this.strideC = 1
        this.strideX = this.strideC * c
        this.strideY = this.strideX * w
      }

      if ('offset' in options) {
        this.offset = options.offset | 0
        this.needsTranspose = true
      }

      if ('crossOrigin' in options) {
        this.crossOrigin = options.crossOrigin
      }
    },
    parse: function (options, miplevel) {
      this.miplevel = miplevel
      this.width = this.width >> miplevel
      this.height = this.height >> miplevel

      var data = options
      switch (typeof options) {
        case 'string':
          break
        case 'object':
          if (!options) {
            return
          }
          this.parseFlags(options)
          if (isPixelData(options.data)) {
            data = options.data
          }
          break
        case 'undefined':
          return
        default:
          
      }

      if (typeof data === 'string') {
        data = loadTexture(data, this.crossOrigin)
      }

      var array = null
      var needsConvert = false

      if (this.compressed) {
        
      }

      if (data === null) {
        // TODO
      } else if (isTypedArray(data)) {
        this.data = data
      } else if (isNumericArray(data)) {
        array = data
        needsConvert = true
      } else if (isNDArrayLike(data)) {
        if (Array.isArray(data.data)) {
          array = data.data
          needsConvert = true
        } else {
          this.data = data.data
        }
        var shape = data.shape
        this.width = shape[0]
        this.height = shape[1]
        if (shape.length === 3) {
          this.channels = shape[2]
        } else {
          this.channels = 1
        }
        var stride = data.stride
        this.strideX = data.stride[0]
        this.strideY = data.stride[1]
        if (stride.length === 3) {
          this.strideC = data.stride[2]
        } else {
          this.strideC = 1
        }
        this.offset = data.offset
        this.needsTranspose = true
      } else if (isCanvasElement(data) || isContext2D(data)) {
        if (isCanvasElement(data)) {
          this.canvas = data
        } else {
          this.canvas = data.canvas
        }
        this.width = this.canvas.width
        this.height = this.canvas.height
        this.setDefaultFormat()
      } else if (isImageElement(data)) {
        this.image = data
        if (!data.complete) {
          this.width = this.width || data.naturalWidth
          this.height = this.height || data.naturalHeight
          this.needsListeners = true
        } else {
          this.width = data.naturalWidth
          this.height = data.naturalHeight
        }
        this.setDefaultFormat()
      } else if (isVideoElement(data)) {
        this.video = data
        if (data.readyState > 1) {
          this.width = data.width
          this.height = data.height
        } else {
          this.width = this.width || data.width
          this.height = this.height || data.height
          this.needsListeners = true
        }
        this.needsPoll = true
        this.setDefaultFormat()
      } else if (isPendingXHR(data)) {
        this.xhr = data
        this.needsListeners = true
      } else if (isRectArray(data)) {
        var w = data[0].length
        var h = data.length
        var c = 1
        var i, j, k, p
        if (Array.isArray(data[0][0])) {
          c = data[0][0].length
          
          array = Array(w * h * c)
          p = 0
          for (j = 0; j < h; ++j) {
            for (i = 0; i < w; ++i) {
              for (k = 0; k < c; ++k) {
                array[p++] = data[j][i][k]
              }
            }
          }
        } else {
          array = Array(w * h)
          p = 0
          for (j = 0; j < h; ++j) {
            for (i = 0; i < w; ++i) {
              array[p++] = data[j][i]
            }
          }
        }
        this.width = w
        this.height = h
        this.channels = c
        needsConvert = true
      } else if (options.copy) {
        this.copy = true
        this.x = this.x | 0
        this.y = this.y | 0
        this.width = (this.width || contextState.viewportWidth) | 0
        this.height = (this.height || contextState.viewportHeight) | 0
        this.setDefaultFormat()
      }

      // Fix up missing type info for typed arrays
      if (!this.type && this.data) {
        if (this.format === GL_DEPTH_COMPONENT) {
          if (this.data instanceof Uint16Array) {
            this.type = GL_UNSIGNED_SHORT
          } else if (this.data instanceof Uint32Array) {
            this.type = GL_UNSIGNED_INT
          }
        } else if (this.data instanceof Float32Array) {
          this.type = GL_FLOAT
        }
      }

      // Infer default format
      if (!this.internalformat) {
        var channels = this.channels = this.channels || 4
        this.internalformat = [
          GL_LUMINANCE,
          GL_LUMINANCE_ALPHA,
          GL_RGB,
          GL_RGBA][channels - 1]
        
      }

      var format = this.internalformat
      if (format === GL_DEPTH_COMPONENT || format === GL_DEPTH_STENCIL) {
        
        if (format === GL_DEPTH_COMPONENT) {
          
        }
        if (format === GL_DEPTH_STENCIL) {
          
        }
        
      }

      // Compute color format and number of channels
      var colorFormat = this.format = colorFormats[format]
      if (!this.channels) {
        switch (colorFormat) {
          case GL_LUMINANCE:
          case GL_ALPHA:
          case GL_DEPTH_COMPONENT:
            this.channels = 1
            break

          case GL_DEPTH_STENCIL:
          case GL_LUMINANCE_ALPHA:
            this.channels = 2
            break

          case GL_RGB:
            this.channels = 3
            break

          default:
            this.channels = 4
        }
      }

      // Check that texture type is supported
      var type = this.type
      if (type === GL_FLOAT) {
        
      } else if (type === GL_HALF_FLOAT_OES) {
        
      } else if (!type) {
        if (format === GL_DEPTH_COMPONENT) {
          type = GL_UNSIGNED_INT
        } else {
          type = GL_UNSIGNED_BYTE
        }
      }
      this.type = type

      // apply conversion
      if (needsConvert) {
        switch (type) {
          case GL_UNSIGNED_BYTE:
            this.data = new Uint8Array(array)
            break
          case GL_UNSIGNED_SHORT:
            this.data = new Uint16Array(array)
            break
          case GL_UNSIGNED_INT:
            this.data = new Uint32Array(array)
            break
          case GL_FLOAT:
            this.data = new Float32Array(array)
            break
          case GL_HALF_FLOAT_OES:
            this.data = convertToHalfFloat(array)
            break

          case GL_UNSIGNED_SHORT_5_6_5:
          case GL_UNSIGNED_SHORT_5_5_5_1:
          case GL_UNSIGNED_SHORT_4_4_4_4:
          case GL_UNSIGNED_INT_24_8_WEBGL:
            
            break

          default:
            
        }
      }

      if (this.data) {
        // apply transpose
        if (this.needsTranspose) {
          this.data = transposePixels(
            this.data,
            this.width,
            this.height,
            this.channels,
            this.strideX,
            this.strideY,
            this.strideC,
            this.offset)
        }
        // check data type
        switch (type) {
          case GL_UNSIGNED_BYTE:
            
            break
          case GL_UNSIGNED_SHORT_5_6_5:
          case GL_UNSIGNED_SHORT_5_5_5_1:
          case GL_UNSIGNED_SHORT_4_4_4_4:
          case GL_UNSIGNED_SHORT:
          case GL_HALF_FLOAT_OES:
            
            break
          case GL_UNSIGNED_INT:
            
            break

          case GL_FLOAT:
            
            break

          default:
            
        }
      }

      this.needsTranspose = false
    },

    setDefaultFormat: function () {
      this.format = this.internalformat = GL_RGBA
      this.type = GL_UNSIGNED_BYTE
      this.channels = 4
      this.compressed = false
    },

    upload: function (params) {
      gl.pixelStorei(GL_UNPACK_FLIP_Y_WEBGL, this.flipY)
      gl.pixelStorei(GL_UNPACK_PREMULTIPLY_ALPHA_WEBGL, this.premultiplyAlpha)
      gl.pixelStorei(GL_UNPACK_COLORSPACE_CONVERSION_WEBGL, this.colorSpace)
      gl.pixelStorei(GL_UNPACK_ALIGNMENT, this.unpackAlignment)

      var target = this.target
      var miplevel = this.miplevel
      var image = this.image
      var canvas = this.canvas
      var video = this.video
      var data = this.data
      var internalformat = this.internalformat
      var format = this.format
      var type = this.type
      var width = this.width || Math.max(1, params.width >> miplevel)
      var height = this.height || Math.max(1, params.height >> miplevel)
      if (video && video.readyState > 2) {
        gl.texImage2D(target, miplevel, format, format, type, video)
      } else if (image && image.complete) {
        gl.texImage2D(target, miplevel, format, format, type, image)
      } else if (canvas) {
        gl.texImage2D(target, miplevel, format, format, type, canvas)
      } else if (this.compressed) {
        gl.compressedTexImage2D(target, miplevel, internalformat, width, height, 0, data)
      } else if (this.copy) {
        reglPoll()
        gl.copyTexImage2D(target, miplevel, format, this.x, this.y, width, height, 0)
      } else if (data) {
        gl.texImage2D(target, miplevel, format, width, height, 0, format, type, data)
      } else {
        gl.texImage2D(target, miplevel, format, width || 1, height || 1, 0, format, type, null)
      }
    }
  })

  function TexParams (target) {
    this.target = target

    // Default image shape info
    this.width = 0
    this.height = 0
    this.format = 0
    this.internalformat = 0
    this.type = 0

    // wrap mode
    this.wrapS = GL_CLAMP_TO_EDGE
    this.wrapT = GL_CLAMP_TO_EDGE

    // filtering
    this.minFilter = 0
    this.magFilter = GL_NEAREST
    this.anisotropic = 1

    // mipmaps
    this.genMipmaps = false
    this.mipmapHint = GL_DONT_CARE
  }

  extend(TexParams.prototype, {
    parse: function (options) {
      if (typeof options !== 'object' || !options) {
        return
      }

      if ('min' in options) {
        var minFilter = options.min
        
        this.minFilter = minFilters[minFilter]
      }

      if ('mag' in options) {
        var magFilter = options.mag
        
        this.magFilter = magFilters[magFilter]
      }

      var wrapS = this.wrapS
      var wrapT = this.wrapT
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
      this.wrapS = wrapS
      this.wrapT = wrapT

      if ('anisotropic' in options) {
        var anisotropic = options.anisotropic
        
        this.anisotropic = options.anisotropic
      }

      if ('mipmap' in options) {
        var mipmap = options.mipmap
        switch (typeof mipmap) {
          case 'string':
            
            this.mipmapHint = mipmapHint[mipmap]
            this.genMipmaps = true
            break

          case 'boolean':
            this.genMipmaps = !!mipmap
            break

          case 'object':
            break

          default:
            
        }
      }
    },

    upload: function () {
      var target = this.target
      gl.texParameteri(target, GL_TEXTURE_MIN_FILTER, this.minFilter)
      gl.texParameteri(target, GL_TEXTURE_MAG_FILTER, this.magFilter)
      gl.texParameteri(target, GL_TEXTURE_WRAP_S, this.wrapS)
      gl.texParameteri(target, GL_TEXTURE_WRAP_T, this.wrapT)
      if (extensions.ext_texture_filter_anisotropic) {
        gl.texParameteri(target, GL_TEXTURE_MAX_ANISOTROPY_EXT, this.anisotropic)
      }
      if (this.genMipmaps) {
        gl.hint(GL_GENERATE_MIPMAP_HINT, this.mipmapHint)
        gl.generateMipmap(target)
      }
    }
  })

  // Final pass to merge params and pixel data
  function checkTextureComplete (params, pixels) {
    var i, pixmap

    var type = 0
    var format = 0
    var internalformat = 0
    var width = 0
    var height = 0
    var channels = 0
    var compressed = false
    var needsPoll = false
    var needsListeners = false
    var mipMask2D = 0
    var mipMaskCube = [0, 0, 0, 0, 0, 0]
    var cubeMask = 0
    var hasMip = false
    for (i = 0; i < pixels.length; ++i) {
      pixmap = pixels[i]
      width = width || (pixmap.width << pixmap.miplevel)
      height = height || (pixmap.height << pixmap.miplevel)
      type = type || pixmap.type
      format = format || pixmap.format
      internalformat = internalformat || pixmap.internalformat
      channels = channels || pixmap.channels
      needsPoll = needsPoll || pixmap.needsPoll
      needsListeners = needsListeners || pixmap.needsListeners
      compressed = compressed || pixmap.compressed

      var miplevel = pixmap.miplevel
      var target = pixmap.target
      hasMip = hasMip || (miplevel > 0)
      if (target === GL_TEXTURE_2D) {
        mipMask2D |= (1 << miplevel)
      } else {
        var face = target - GL_TEXTURE_CUBE_MAP_POSITIVE_X
        mipMaskCube[face] |= (1 << miplevel)
        cubeMask |= (1 << face)
      }
    }

    params.needsPoll = needsPoll
    params.needsListeners = needsListeners
    params.width = width
    params.height = height
    params.format = format
    params.internalformat = internalformat
    params.type = type

    var mipMask = hasMip ? (width << 1) - 1 : 1
    if (params.target === GL_TEXTURE_2D) {
      
      
    } else {
      
      for (i = 0; i < 6; ++i) {
        
      }
    }

    var mipFilter = (MIPMAP_FILTERS.indexOf(params.minFilter) >= 0)
    params.genMipmaps = !hasMip && (params.genMipmaps || mipFilter)
    var useMipmaps = hasMip || params.genMipmaps

    if (!params.minFilter) {
      params.minFilter = useMipmaps
        ? GL_LINEAR_MIPMAP_LINEAR
        : GL_NEAREST
    } else {
      
    }

    if (useMipmaps) {
      
    }

    if (params.genMipmaps) {
      
    }

    params.wrapS = params.wrapS || GL_CLAMP_TO_EDGE
    params.wrapT = params.wrapT || GL_CLAMP_TO_EDGE
    if (params.wrapS !== GL_CLAMP_TO_EDGE ||
        params.wrapT !== GL_CLAMP_TO_EDGE) {
      
    }

    if ((type === GL_FLOAT && !extensions.oes_texture_float_linear) ||
        (type === GL_HALF_FLOAT_OES &&
          !extensions.oes_texture_half_float_linear)) {
      
    }

    for (i = 0; i < pixels.length; ++i) {
      pixmap = pixels[i]
      var level = pixmap.miplevel
      if (pixmap.width) {
        
      }
      if (pixmap.height) {
        
      }
      if (pixmap.channels) {
        
      } else {
        pixmap.channels = channels
      }
      if (pixmap.format) {
        
      } else {
        pixmap.format = format
      }
      if (pixmap.internalformat) {
        
      } else {
        pixmap.internalformat = internalformat
      }
      if (pixmap.type) {
        
      } else {
        pixmap.type = type
      }
      if (pixmap.copy) {
        
      }
    }
  }

  var activeTexture = 0
  var textureCount = 0
  var textureSet = {}
  var pollSet = []
  var numTexUnits = limits.maxTextureUnits
  var textureUnits = Array(numTexUnits).map(function () {
    return null
  })

  function REGLTexture (target) {
    this.id = textureCount++
    this.refCount = 1

    this.target = target
    this.texture = null

    this.pollId = -1

    this.unit = -1
    this.bindCount = 0

    // cancels all pending callbacks
    this.cancelPending = null

    // parsed user inputs
    this.params = new TexParams(target)
    this.pixels = []
  }

  function update (texture, options) {
    var i
    clearListeners(texture)

    // Clear parameters and pixel data
    var params = texture.params
    TexParams.call(params, texture.target)
    var pixels = texture.pixels
    pixels.length = 0

    // parse parameters
    params.parse(options)

    // parse pixel data
    function parseMip (target, data) {
      var mipmap = data.mipmap
      var pixmap
      if (Array.isArray(mipmap)) {
        for (var i = 0; i < mipmap.length; ++i) {
          pixmap = new PixelInfo(target)
          pixmap.parseFlags(options)
          pixmap.parseFlags(data)
          pixmap.parse(mipmap[i], i)
          pixels.push(pixmap)
        }
      } else {
        pixmap = new PixelInfo(target)
        pixmap.parseFlags(options)
        pixmap.parse(data, 0)
        pixels.push(pixmap)
      }
    }
    if (texture.target === GL_TEXTURE_2D) {
      parseMip(GL_TEXTURE_2D, options)
    } else {
      var faces = options.faces || options
      if (Array.isArray(faces)) {
        
        for (i = 0; i < 6; ++i) {
          parseMip(GL_TEXTURE_CUBE_MAP_POSITIVE_X + i, faces[i])
        }
      } else if (typeof faces === 'string') {
        // TODO Read dds
      } else {
        // Initialize to all empty textures
        for (i = 0; i < 6; ++i) {
          parseMip(GL_TEXTURE_CUBE_MAP_POSITIVE_X + i, {})
        }
      }
    }

    // do a second pass to reconcile defaults
    checkTextureComplete(params, pixels)

    if (params.needsListeners) {
      hookListeners(texture)
    }

    if (params.needsPoll) {
      texture.pollId = pollSet.length
      pollSet.push(texture)
    }

    refresh(texture)
  }

  function refresh (texture) {
    if (!gl.isTexture(texture.texture)) {
      texture.texture = gl.createTexture()
    }

    // Lazy bind
    var target = texture.target
    var unit = texture.unit
    if (unit >= 0) {
      gl.activeTexture(GL_TEXTURE0 + unit)
      activeTexture = unit
    } else {
      gl.bindTexture(target, texture.texture)
    }

    // Upload
    var pixels = texture.pixels
    var params = texture.params
    for (var i = 0; i < pixels.length; ++i) {
      pixels[i].upload(params)
    }
    params.upload()

    // Lazy unbind
    if (unit < 0) {
      var active = textureUnits[activeTexture]
      if (active) {
        // restore binding state
        gl.bindTexture(active.target, active.texture)
      } else {
        // otherwise become new active
        texture.unit = activeTexture
        textureUnits[activeTexture] = texture
      }
    }
  }

  function hookListeners (texture) {
    var params = texture.params
    var pixels = texture.pixels

    // Appends all the texture data from the buffer to the current
    function appendDDS (target, miplevel, buffer) {
      var dds = parseDDS(buffer)

      

      if (dds.cube) {
        

        // TODO handle cube map DDS
        
      } else {
        
      }

      if (miplevel) {
        
      }

      dds.pixels.forEach(function (pixmap) {
        var info = new PixelInfo(dds.cube ? pixmap.target : target)

        info.channels = dds.channels
        info.compressed = dds.compressed
        info.type = dds.type
        info.internalformat = dds.format
        info.format = colorFormats[dds.format]

        info.width = pixmap.width
        info.height = pixmap.height
        info.miplevel = pixmap.miplevel || miplevel
        info.data = pixmap.data

        pixels.push(info)
      })
    }

    function onData () {
      // Update size of any newly loaded pixels
      for (var i = 0; i < pixels.length; ++i) {
        var pixelData = pixels[i]
        var image = pixelData.image
        var video = pixelData.video
        var xhr = pixelData.xhr
        if (image && image.complete) {
          pixelData.width = image.naturalWidth
          pixelData.height = image.naturalHeight
        } else if (video && video.readyState > 2) {
          pixelData.width = video.width
          pixelData.height = video.height
        } else if (xhr && xhr.readyState === 4) {
          pixels[i] = pixels[pixels.length - 1]
          pixels.pop()
          xhr.removeEventListener('readystatechange', refresh)
          appendDDS(pixelData.target, pixelData.miplevel, xhr.response)
        }
      }
      checkTextureComplete(params, pixels)
      refresh(texture)
    }

    pixels.forEach(function (pixelData) {
      if (pixelData.image && !pixelData.image.complete) {
        pixelData.image.addEventListener('load', onData)
      } else if (pixelData.video && pixelData.readyState < 1) {
        pixelData.video.addEventListener('progress', onData)
      } else if (pixelData.xhr) {
        pixelData.xhr.addEventListener('readystatechange', onData)
      }
    })

    texture.cancelPending = function detachListeners () {
      pixels.forEach(function (pixelData) {
        if (pixelData.image) {
          pixelData.image.removeEventListener('load', onData)
        } else if (pixelData.video) {
          pixelData.video.removeEventListener('progress', onData)
        } else if (pixelData.xhr) {
          pixelData.xhr.removeEventListener('readystatechange', onData)
          pixelData.xhr.abort()
        }
      })
    }
  }

  function clearListeners (texture) {
    var cancelPending = texture.cancelPending
    if (cancelPending) {
      cancelPending()
      texture.cancelPending = null
    }
    var id = texture.pollId
    if (id >= 0) {
      var other = pollSet[id] = pollSet[pollSet.length - 1]
      other.id = id
      pollSet.pop()
      texture.pollId = -1
    }
  }

  function destroy (texture) {
    var handle = texture.texture
    
    var unit = texture.unit
    var target = texture.target
    if (unit >= 0) {
      gl.activeTexture(GL_TEXTURE0 + unit)
      activeTexture = unit
      gl.bindTexture(target, null)
      textureUnits[unit] = null
    }
    clearListeners(texture)
    if (gl.isTexture(handle)) {
      gl.deleteTexture(handle)
    }
    texture.texture = null
    texture.params = null
    texture.pixels = null
    texture.refCount = 0
    delete textureSet[texture.id]
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
        texture.unit = unit
        gl.activeTexture(GL_TEXTURE0 + unit)
        gl.bindTexture(texture.target, texture.texture)
        activeTexture = unit
      }
      return unit
    },

    unbind: function () {
      this.bindCount -= 1
    },

    decRef: function () {
      if (--this.refCount === 0) {
        destroy(this)
      }
    }
  })

  function createTexture (options, target) {
    var texture = new REGLTexture(target)
    textureSet[texture.id] = texture

    function reglTexture (a0, a1, a2, a3, a4, a5) {
      var options = a0 || {}
      if (target === GL_TEXTURE_CUBE_MAP && arguments.length === 6) {
        options = [a0, a1, a2, a3, a4, a5]
      }
      update(texture, options)
      reglTexture.width = texture.params.width
      reglTexture.height = texture.params.height
      return reglTexture
    }

    reglTexture(options)

    reglTexture._reglType = 'texture'
    reglTexture._texture = texture
    reglTexture.destroy = function () {
      texture.decRef()
    }

    return reglTexture
  }

  // Called after context restore
  function refreshTextures () {
    values(textureSet).forEach(refresh)
    for (var i = 0; i < numTexUnits; ++i) {
      textureUnits[i] = null
    }
    activeTexture = 0
    gl.activeTexture(GL_TEXTURE0)
  }

  // Called when regl is destroyed
  function destroyTextures () {
    for (var i = 0; i < numTexUnits; ++i) {
      gl.activeTexture(GL_TEXTURE0 + i)
      gl.bindTexture(GL_TEXTURE_2D, null)
      textureUnits[i] = null
    }
    gl.activeTexture(GL_TEXTURE0)
    activeTexture = 0
    values(textureSet).forEach(destroy)
  }

  // Called once per raf, updates video textures
  function pollTextures () {
    pollSet.forEach(refresh)
  }

  return {
    create: createTexture,
    refresh: refreshTextures,
    clear: destroyTextures,
    poll: pollTextures,
    getTexture: function (wrapper) {
      return null
    }
  }
}

},{"./util/extend":21,"./util/is-ndarray":22,"./util/is-typed-array":23,"./util/load-texture":24,"./util/parse-dds":26,"./util/to-half-float":28,"./util/values":29}],19:[function(require,module,exports){
/* globals performance */
module.exports =
  (typeof performance !== 'undefined' && performance.now)
  ? function () { return performance.now() }
  : function () { return +(new Date()) }

},{}],20:[function(require,module,exports){
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

    return extend(entry, {
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

},{"./extend":21}],21:[function(require,module,exports){
module.exports = function (base, opts) {
  var keys = Object.keys(opts)
  for (var i = 0; i < keys.length; ++i) {
    base[keys[i]] = opts[keys[i]]
  }
  return base
}

},{}],22:[function(require,module,exports){
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

},{"./is-typed-array":23}],23:[function(require,module,exports){
var dtypes = require('../constants/arraytypes.json')
module.exports = function (x) {
  return Object.prototype.toString.call(x) in dtypes
}

},{"../constants/arraytypes.json":5}],24:[function(require,module,exports){
/* globals document, Image, XMLHttpRequest */

module.exports = loadTexture

function getExtension (url) {
  var parts = /\.(\w+)(\?.*)?$/.exec(url)
  if (parts && parts[1]) {
    return parts[1].toLowerCase()
  }
}

function isVideoExtension (url) {
  return [
    'avi',
    'asf',
    'gifv',
    'mov',
    'qt',
    'yuv',
    'mpg',
    'mpeg',
    'm2v',
    'mp4',
    'm4p',
    'm4v',
    'ogg',
    'ogv',
    'vob',
    'webm',
    'wmv'
  ].indexOf(url) >= 0
}

function isCompressedExtension (url) {
  return [
    'dds'
  ].indexOf(url) >= 0
}

function loadVideo (url, crossOrigin) {
  var video = document.createElement('video')
  video.autoplay = true
  video.loop = true
  if (crossOrigin) {
    video.crossOrigin = crossOrigin
  }
  video.src = url
  return video
}

function loadCompressedTexture (url, ext, crossOrigin) {
  var xhr = new XMLHttpRequest()
  xhr.responseType = 'arraybuffer'
  xhr.open('GET', url, true)
  xhr.send()
  return xhr
}

function loadImage (url, crossOrigin) {
  var image = new Image()
  if (crossOrigin) {
    image.crossOrigin = crossOrigin
  }
  image.src = url
  return image
}

// Currently this stuff only works in a DOM environment
function loadTexture (url, crossOrigin) {
  if (typeof document !== 'undefined') {
    var ext = getExtension(url)
    if (isVideoExtension(ext)) {
      return loadVideo(url, crossOrigin)
    }
    if (isCompressedExtension(ext)) {
      return loadCompressedTexture(url, ext, crossOrigin)
    }
    return loadImage(url, crossOrigin)
  }
  return null
}

},{}],25:[function(require,module,exports){
module.exports = function loop (n, f) {
  var result = Array(n)
  for (var i = 0; i < n; ++i) {
    result[i] = f(i)
  }
  return result
}

},{}],26:[function(require,module,exports){
// References:
//
// http://msdn.microsoft.com/en-us/library/bb943991.aspx/
// http://blog.tojicode.com/2011/12/compressed-textures-in-webgl.html
//


module.exports = parseDDS

var DDS_MAGIC = 0x20534444

var GL_TEXTURE_2D = 0x0DE1
var GL_TEXTURE_CUBE_MAP_POSITIVE_X = 0x8515

var GL_COMPRESSED_RGB_S3TC_DXT1_EXT = 0x83F0
var GL_COMPRESSED_RGBA_S3TC_DXT1_EXT = 0x83F1
var GL_COMPRESSED_RGBA_S3TC_DXT3_EXT = 0x83F2
var GL_COMPRESSED_RGBA_S3TC_DXT5_EXT = 0x83F3

var GL_COMPRESSED_RGB_ETC1_WEBGL = 0x8D64

var GL_UNSIGNED_BYTE = 0x1401
// var GL_HALF_FLOAT_OES = 0x8D61
// var GL_FLOAT = 0x1406

var DDSD_MIPMAPCOUNT = 0x20000

var DDSCAPS2_CUBEMAP = 0x200
var DDSCAPS2_CUBEMAP_POSITIVEX = 0x400
var DDSCAPS2_CUBEMAP_NEGATIVEX = 0x800
var DDSCAPS2_CUBEMAP_POSITIVEY = 0x1000
var DDSCAPS2_CUBEMAP_NEGATIVEY = 0x2000
var DDSCAPS2_CUBEMAP_POSITIVEZ = 0x4000
var DDSCAPS2_CUBEMAP_NEGATIVEZ = 0x8000

var CUBEMAP_COMPLETE_FACES = (
  DDSCAPS2_CUBEMAP_POSITIVEX |
  DDSCAPS2_CUBEMAP_NEGATIVEX |
  DDSCAPS2_CUBEMAP_POSITIVEY |
  DDSCAPS2_CUBEMAP_NEGATIVEY |
  DDSCAPS2_CUBEMAP_POSITIVEZ |
  DDSCAPS2_CUBEMAP_NEGATIVEZ)

var DDPF_FOURCC = 0x4
var DDPF_RGB = 0x40

var FOURCC_DXT1 = 0x31545844
var FOURCC_DXT3 = 0x33545844
var FOURCC_DXT5 = 0x35545844
var FOURCC_ETC1 = 0x31435445

// DDS_HEADER {
var OFF_SIZE = 1        // int32 dwSize
var OFF_FLAGS = 2       // int32 dwFlags
var OFF_HEIGHT = 3      // int32 dwHeight
var OFF_WIDTH = 4       // int32 dwWidth
// var OFF_PITCH = 5       // int32 dwPitchOrLinearSize
// var OFF_DEPTH = 6       // int32 dwDepth
var OFF_MIPMAP = 7      // int32 dwMipMapCount; // offset: 7
// int32[11] dwReserved1
// DDS_PIXELFORMAT {
// var OFF_PF_SIZE = 19    // int32 dwSize; // offset: 19
var OFF_PF_FLAGS = 20   // int32 dwFlags
var OFF_FOURCC = 21     // char[4] dwFourCC
// var OFF_RGBA_BITS = 22  // int32 dwRGBBitCount
// var OFF_RED_MASK = 23   // int32 dwRBitMask
// var OFF_GREEN_MASK = 24 // int32 dwGBitMask
// var OFF_BLUE_MASK = 25  // int32 dwBBitMask
// var OFF_ALPHA_MASK = 26 // int32 dwABitMask; // offset: 26
// }
// var OFF_CAPS = 27       // int32 dwCaps; // offset: 27
var OFF_CAPS2 = 28      // int32 dwCaps2
// var OFF_CAPS3 = 29      // int32 dwCaps3
// var OFF_CAPS4 = 30      // int32 dwCaps4
// int32 dwReserved2 // offset 31

function parseDDS (arrayBuffer) {
  var header = new Int32Array(arrayBuffer)
  

  var flags = header[OFF_FLAGS]
  

  var width = header[OFF_WIDTH]
  var height = header[OFF_HEIGHT]

  var type = GL_UNSIGNED_BYTE
  var format = 0
  var blockBytes = 0
  var channels = 4
  switch (header[OFF_FOURCC]) {
    case FOURCC_DXT1:
      blockBytes = 8
      if (flags & DDPF_RGB) {
        channels = 3
        format = GL_COMPRESSED_RGB_S3TC_DXT1_EXT
      } else {
        format = GL_COMPRESSED_RGBA_S3TC_DXT1_EXT
      }
      break

    case FOURCC_DXT3:
      blockBytes = 16
      format = GL_COMPRESSED_RGBA_S3TC_DXT3_EXT
      break

    case FOURCC_DXT5:
      blockBytes = 16
      format = GL_COMPRESSED_RGBA_S3TC_DXT5_EXT
      break

    case FOURCC_ETC1:
      blockBytes = 8
      format = GL_COMPRESSED_RGB_ETC1_WEBGL
      break

    // TODO: Implement hdr and uncompressed textures

    default:
      // Handle uncompressed data here
      
  }

  var pixelFlags = header[OFF_PF_FLAGS]

  var mipmapCount = 1
  if (pixelFlags & DDSD_MIPMAPCOUNT) {
    mipmapCount = Math.max(1, header[OFF_MIPMAP])
  }

  var ptr = header[OFF_SIZE] + 4

  var result = {
    width: width,
    height: height,
    channels: channels,
    format: format,
    type: type,
    compressed: true,
    cube: false,
    pixels: []
  }

  function parseMips (target) {
    var mipWidth = width
    var mipHeight = height

    for (var i = 0; i < mipmapCount; ++i) {
      var size =
        Math.max(1, (mipWidth + 3) >> 2) *
        Math.max(1, (mipHeight + 3) >> 2) *
        blockBytes
      result.pixels.push({
        target: target,
        miplevel: i,
        width: mipWidth,
        height: mipHeight,
        data: new Uint8Array(arrayBuffer, ptr, size)
      })
      ptr += size
      mipWidth >>= 1
      mipHeight >>= 1
    }
  }

  var caps2 = header[OFF_CAPS2]
  var cubemap = !!(caps2 & DDSCAPS2_CUBEMAP)
  if (cubemap) {
    
    result.cube = true
    for (var i = 0; i < 6; ++i) {
      parseMips(GL_TEXTURE_CUBE_MAP_POSITIVE_X + i)
    }
  } else {
    parseMips(GL_TEXTURE_2D)
  }

  return result
}

},{}],27:[function(require,module,exports){
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
      setTimeout(cb, 30)
    },
    cancel: clearTimeout
  }
}

},{}],28:[function(require,module,exports){
module.exports = function convertToHalfFloat (array) {
  var floats = new Float32Array(array)
  var uints = new Uint32Array(floats.buffer)
  var ushorts = new Uint16Array(array.length)

  for (var i = 0; i < array.length; ++i) {
    if (isNaN(array[i])) {
      ushorts[i] = 0xffff
    } else if (array[i] === Infinity) {
      ushorts[i] = 0x7c00
    } else if (array[i] === -Infinity) {
      ushorts[i] = 0xfc00
    } else {
      var x = uints[i]

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

},{}],29:[function(require,module,exports){
module.exports = function (obj) {
  return Object.keys(obj).map(function (key) { return obj[key] })
}

},{}],30:[function(require,module,exports){
// Context and canvas creation helper functions
/*globals HTMLElement,WebGLRenderingContext*/


var extend = require('./util/extend')

function createCanvas (element, options) {
  var canvas = document.createElement('canvas')
  var args = getContext(canvas, options)

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

  var scale = +args.options.pixelRatio
  function resize () {
    var w = window.innerWidth
    var h = window.innerHeight
    if (element !== document.body) {
      var bounds = element.getBoundingClientRect()
      w = bounds.right - bounds.left
      h = bounds.top - bounds.bottom
    }
    canvas.width = scale * w
    canvas.height = scale * h
    extend(canvas.style, {
      width: w + 'px',
      height: h + 'px'
    })
  }

  window.addEventListener('resize', resize, false)

  var prevDestroy = args.options.onDestroy
  args.options = extend(extend({}, args.options), {
    onDestroy: function () {
      window.removeEventListener('resize', resize)
      element.removeChild(canvas)
      prevDestroy && prevDestroy()
    }
  })

  resize()

  return args
}

function getContext (canvas, options) {
  var glOptions = options.glOptions || {}

  function get (name) {
    try {
      return canvas.getContext(name, glOptions)
    } catch (e) {
      return null
    }
  }

  var gl = get('webgl') ||
           get('experimental-webgl') ||
           get('webgl-experimental')

  

  return {
    gl: gl,
    options: extend({
      pixelRatio: window.devicePixelRatio
    }, options)
  }
}

module.exports = function parseArgs (args) {
  if (typeof document === 'undefined' ||
      typeof HTMLElement === 'undefined') {
    return {
      gl: args[0],
      options: args[1] || {}
    }
  }

  var element = document.body
  var options = args[1] || {}

  if (typeof args[0] === 'string') {
    element = document.querySelector(args[0]) || document.body
  } else if (typeof args[0] === 'object') {
    if (args[0] instanceof HTMLElement) {
      element = args[0]
    } else if (args[0] instanceof WebGLRenderingContext) {
      return {
        gl: args[0],
        options: extend({
          pixelRatio: 1
        }, options)
      }
    } else {
      options = args[0]
    }
  }

  if (element.nodeName && element.nodeName.toUpperCase() === 'CANVAS') {
    return getContext(element, options)
  } else {
    return createCanvas(element, options)
  }
}

},{"./util/extend":21}],31:[function(require,module,exports){
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

},{"mouse-event":32}],32:[function(require,module,exports){
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

},{}],33:[function(require,module,exports){

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
  var uniformState = {}
  var drawState = {
    elements: null,
    primitive: 4, // GL_TRIANGLES
    count: -1,
    offset: 0,
    instances: -1
  }

  var limits = wrapLimits(gl, extensions)
  var bufferState = wrapBuffers(gl)
  var elementState = wrapElements(gl, extensions, bufferState)
  var attributeState = wrapAttributes(
    gl,
    extensions,
    limits,
    bufferState,
    stringStore)
  var shaderState = wrapShaders(gl, stringStore)
  var textureState = wrapTextures(
    gl,
    extensions,
    limits,
    poll,
    contextState)
  var renderbufferState = wrapRenderbuffers(gl, extensions, limits)
  var framebufferState = wrapFramebuffers(
    gl,
    extensions,
    limits,
    textureState,
    renderbufferState)
  var readPixels = wrapRead(gl, poll, contextState)

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
    contextState)

  var nextState = core.next
  var canvas = gl.canvas

  var rafCallbacks = []
  var activeRAF = 0
  function handleRAF () {
    // schedule next animation frame
    activeRAF = raf.next(handleRAF)

    // increment frame coun
    contextState.count += 1

    // reset viewport
    var viewport = nextState.viewport
    var scissorBox = nextState.scissor_box
    viewport[0] = viewport[1] = scissorBox[0] = scissorBox[1] = 0

    contextState.viewportWidth =
      contextState.frameBufferWidth =
      contextState.drawingBufferWidth =
      viewport[2] =
      scissorBox[2] = gl.drawingBufferWidth
    contextState.viewportHeight =
      contextState.frameBufferWidth =
      contextState.drawingBufferHeight =
      viewport[3] =
      scissorBox[3] = gl.drawingBufferHeight

    var now = clock()
    contextState.deltaTime = (now - LAST_TIME) / 1000.0
    contextState.time = (now - START_TIME) / 1000.0
    LAST_TIME = now

    core.procs.refresh()
    textureState.poll()

    for (var i = 0; i < rafCallbacks.length; ++i) {
      var cb = rafCallbacks[i]
      cb(contextState, null, 0)
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
    core.procs.refresh()
    bufferState.refresh()
    textureState.refresh()
    renderbufferState.refresh()
    framebufferState.refresh()
    shaderState.refresh()
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

    var compiled = core.compile(opts, attributes, uniforms, context)

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

    return REGLCommand
  }

  function poll () {
    core.procs.poll()
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

  core.procs.refresh()

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
      
    },

    // Expose context attributes
    attributes: gl.getContextAttributes(),

    // Frame rendering
    frame: frame,

    // System limits
    limits: limits,

    // Read pixels
    read: readPixels,

    // Destroy regl and all associated resources
    destroy: destroy,

    // Direct GL state manipulation
    _gl: gl,
    _refresh: function () {
      core.procs.refresh()
    }
  })
}

},{"./lib/attribute":3,"./lib/buffer":4,"./lib/core":8,"./lib/dynamic":9,"./lib/elements":10,"./lib/extension":11,"./lib/framebuffer":12,"./lib/limits":13,"./lib/read":14,"./lib/renderbuffer":15,"./lib/shader":16,"./lib/strings":17,"./lib/texture":18,"./lib/util/clock":19,"./lib/util/extend":21,"./lib/util/raf":27,"./lib/webgl":30}]},{},[2])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJleGFtcGxlL2Fzc2V0cy9tYXAuanNvbiIsImV4YW1wbGUvdGlsZS5qcyIsImxpYi9hdHRyaWJ1dGUuanMiLCJsaWIvYnVmZmVyLmpzIiwibGliL2NvbnN0YW50cy9hcnJheXR5cGVzLmpzb24iLCJsaWIvY29uc3RhbnRzL2R0eXBlcy5qc29uIiwibGliL2NvbnN0YW50cy9wcmltaXRpdmVzLmpzb24iLCJsaWIvY29yZS5qcyIsImxpYi9keW5hbWljLmpzIiwibGliL2VsZW1lbnRzLmpzIiwibGliL2V4dGVuc2lvbi5qcyIsImxpYi9mcmFtZWJ1ZmZlci5qcyIsImxpYi9saW1pdHMuanMiLCJsaWIvcmVhZC5qcyIsImxpYi9yZW5kZXJidWZmZXIuanMiLCJsaWIvc2hhZGVyLmpzIiwibGliL3N0cmluZ3MuanMiLCJsaWIvdGV4dHVyZS5qcyIsImxpYi91dGlsL2Nsb2NrLmpzIiwibGliL3V0aWwvY29kZWdlbi5qcyIsImxpYi91dGlsL2V4dGVuZC5qcyIsImxpYi91dGlsL2lzLW5kYXJyYXkuanMiLCJsaWIvdXRpbC9pcy10eXBlZC1hcnJheS5qcyIsImxpYi91dGlsL2xvYWQtdGV4dHVyZS5qcyIsImxpYi91dGlsL2xvb3AuanMiLCJsaWIvdXRpbC9wYXJzZS1kZHMuanMiLCJsaWIvdXRpbC9yYWYuanMiLCJsaWIvdXRpbC90by1oYWxmLWZsb2F0LmpzIiwibGliL3V0aWwvdmFsdWVzLmpzIiwibGliL3dlYmdsLmpzIiwibm9kZV9tb2R1bGVzL21vdXNlLWNoYW5nZS9tb3VzZS1saXN0ZW4uanMiLCJub2RlX21vZHVsZXMvbW91c2UtZXZlbnQvbW91c2UuanMiLCJyZWdsLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdlFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNWpGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0tBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMXBCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6SkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzEzQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25MQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdENBO0FBQ0E7QUFDQTtBQUNBOztBQ0hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwibW9kdWxlLmV4cG9ydHM9W1tbMSwxMV0sWzEsMTFdLFsxLDExXSxbMSwxMV0sWzEsMTFdLFsxLDExXSxbMSwxMV0sWzEsMTFdLFs2LDZdLFs3LDZdLFs4LDZdLFsxLDExXSxbMSwxMV0sWzEsMTFdLFsxLDExXSxbMSwxMV1dLFxuW1sxLDExXSxbMCwwXSxbMSwwXSxbMSwwXSxbMiwwXSxbMSwxMV0sWzEsMTFdLFsxLDExXSxbNiw2XSxbNyw2XSxbOCw2XSxbMSwxMV0sWzEsMTFdLFsxLDExXSxbMSwxMV0sWzEsMTFdXSxcbltbMSwxMV0sWzAsMV0sWzEsMV0sWzEsMV0sWzIsMV0sWzEsMTFdLFsxLDExXSxbMSwxMV0sWzYsNl0sWzgsOF0sWzgsNl0sWzEsMTFdLFsxLDExXSxbMSwxMV0sWzEsMTFdLFsxLDExXV0sXG5bWzEsMTFdLFswLDFdLFsxLDFdLFswLDNdLFs1LDJdLFsxLDExXSxbMTMsMTJdLFsxMywxMl0sWzYsNl0sWzcsNl0sWzYsOV0sWzEsMTFdLFsxLDExXSxbMSwxMV0sWzEsMTFdLFsxLDExXV0sXG5bWzEsMTFdLFswLDFdLFsxLDFdLFsyLDFdLFsxLDExXSxbMSwxMV0sWzEzLDE1XSxbMTMsMTVdLFs2LDZdLFs3LDZdLFs3LDZdLFs2LDldLFsxLDExXSxbMSwxMV0sWzEsMTFdLFsxLDExXV0sXG5bWzEsMTFdLFswLDJdLFsxLDJdLFsyLDJdLFsxLDExXSxbMSwxMV0sWzE0LDJdLFsxNSwyXSxbNiw2XSxbNyw2XSxbNyw2XSxbNyw2XSxbNiw5XSxbOCw1XSxbMSwxMV0sWzEsMTFdXSxcbltbMSwxMV0sWzEsMTFdLFsxLDExXSxbMSwxMV0sWzEsMTFdLFsxLDExXSxbMSwxMV0sWzEsMTFdLFs2LDZdLFs4LDhdLFs3LDZdLFs3LDZdLFs3LDZdLFs4LDZdLFsxLDExXSxbMSwxMV1dLFxuW1s0LDVdLFsyLDVdLFswLDVdLFsxLDVdLFsyLDVdLFsxLDExXSxbMSwxMV0sWzEsMTFdLFs2LDddLFs3LDhdLFs3LDZdLFs3LDZdLFs4LDldLFs2LDldLFs4LDVdLFsxLDExXV0sXG5bWzIsOF0sWzMsOV0sWzQsOV0sWzQsNl0sWzMsOV0sWzUsMF0sWzEsMTFdLFsxLDExXSxbMSwxMV0sWzYsN10sWzcsOF0sWzcsNl0sWzcsNl0sWzgsOF0sWzgsNl0sWzEsMTFdXSxcbltbNCw3XSxbNCw3XSxbNCw4XSxbNSw4XSxbMiw5XSxbMyw5XSxbNCw1XSxbMiw1XSxbMSwxMV0sWzEsMTFdLFs2LDddLFs3LDhdLFs3LDZdLFs3LDZdLFs2LDldLFs4LDVdXSxcbltbMSwxMV0sWzEsMTFdLFszLDddLFs0LDddLFs0LDhdLFs1LDldLFs1LDhdLFswLDldLFsyLDVdLFsxLDExXSxbMSwxMV0sWzYsN10sWzcsOF0sWzcsNl0sWzcsNl0sWzYsOV1dLFxuW1sxLDExXSxbMSwxMV0sWzEsMTFdLFsxLDExXSxbMCw3XSxbNCw4XSxbNCw2XSxbNCw2XSxbNSwxXSxbMSwxMV0sWzEsMTFdLFsxLDExXSxbNiw3XSxbNyw4XSxbNyw2XSxbNyw2XV0sXG5bWzEsMTFdLFs5LDBdLFsxMCwwXSxbOCwwXSxbMSwxMV0sWzMsN10sWzEsN10sWzEsN10sWzUsN10sWzEsMTFdLFsxLDExXSxbMSwxMV0sWzEsMTFdLFs2LDddLFs3LDddLFs3LDddXSxcbltbMSwxMV0sWzksMV0sWzExLDNdLFsxMSwxXSxbMSwxMV0sWzEsMTFdLFsxLDExXSxbMSwxMV0sWzEsMTFdLFsxLDExXSxbMSwxMV0sWzEsMTFdLFsxLDExXSxbMSwxMV0sWzEsMTFdLFsxLDExXV0sXG5bWzEsMTFdLFs5LDJdLFs3LDJdLFsxMSwyXSxbMSwxMV0sWzEsMTFdLFsxLDExXSxbMiwxMl0sWzEsMTNdLFsxLDEzXSxbMSwxM10sWzEsMTNdLFsxLDEzXSxbMSwxM10sWzAsMTJdLFsxLDExXV0sXG5bWzEsMTFdLFsxLDExXSxbMSwxMV0sWzEsMTFdLFsxLDExXSxbMSwxMV0sWzEsMTFdLFsyLDEwXSxbMywxMF0sWzMsMTBdLFszLDEwXSxbMywxMF0sWzMsMTBdLFszLDEwXSxbMCwxMF0sWzEsMTFdXV1cbiIsImNvbnN0IHJlZ2wgPSByZXF1aXJlKCcuLi9yZWdsJykoKVxuY29uc3QgbW91c2UgPSByZXF1aXJlKCdtb3VzZS1jaGFuZ2UnKSgpXG5jb25zdCBNQVAgPSByZXF1aXJlKCcuL2Fzc2V0cy9tYXAuanNvbicpXG5cbmNvbnN0IGRyYXdCYWNrZ3JvdW5kID0gcmVnbCh7XG4gIGZyYWc6IGBcbiAgcHJlY2lzaW9uIG1lZGl1bXAgZmxvYXQ7XG4gIHVuaWZvcm0gc2FtcGxlcjJEIG1hcCwgdGlsZXM7XG4gIHVuaWZvcm0gdmVjMiBtYXBTaXplLCB0aWxlU2l6ZTtcbiAgdmFyeWluZyB2ZWMyIHV2O1xuICB2b2lkIG1haW4oKSB7XG4gICAgdmVjMiB0aWxlQ29vcmQgPSBmbG9vcigyNTUuMCAqIHRleHR1cmUyRChtYXAsIGZsb29yKHV2KSAvIG1hcFNpemUpLnJhKTtcbiAgICBnbF9GcmFnQ29sb3IgPSB0ZXh0dXJlMkQodGlsZXMsICh0aWxlQ29vcmQgKyBmcmFjdCh1dikpIC8gdGlsZVNpemUpO1xuICB9YCxcblxuICB2ZXJ0OiBgXG4gIHByZWNpc2lvbiBtZWRpdW1wIGZsb2F0O1xuICBhdHRyaWJ1dGUgdmVjMiBwb3NpdGlvbjtcbiAgdW5pZm9ybSB2ZWM0IHZpZXc7XG4gIHZhcnlpbmcgdmVjMiB1djtcbiAgdm9pZCBtYWluKCkge1xuICAgIHV2ID0gbWl4KHZpZXcueHcsIHZpZXcuenksIDAuNSAqICgxLjAgKyBwb3NpdGlvbikpO1xuICAgIGdsX1Bvc2l0aW9uID0gdmVjNChwb3NpdGlvbiwgMSwgMSk7XG4gIH1gLFxuXG4gIGRlcHRoOiB7IGVuYWJsZTogZmFsc2UgfSxcblxuICB1bmlmb3Jtczoge1xuICAgIHRpbGVzOiByZWdsLnRleHR1cmUoJ2Fzc2V0cy90aWxlcy5wbmcnKSxcbiAgICB0aWxlU2l6ZTogWzE2LjAsIDE2LjBdLFxuICAgIG1hcDogcmVnbC50ZXh0dXJlKE1BUCksXG4gICAgbWFwU2l6ZTogW01BUFswXS5sZW5ndGgsIE1BUC5sZW5ndGhdLFxuICAgIHZpZXc6IHJlZ2wucHJvcCgndmlldycpXG4gIH0sXG5cbiAgYXR0cmlidXRlczoge1xuICAgIHBvc2l0aW9uOiBbIC0xLCAtMSwgMSwgLTEsIC0xLCAxLCAxLCAxLCAtMSwgMSwgMSwgLTEgXVxuICB9LFxuXG4gIGNvdW50OiA2XG59KVxuXG5yZWdsLmZyYW1lKCh7dmlld3BvcnRXaWR0aCwgdmlld3BvcnRIZWlnaHR9KSA9PiB7XG4gIGNvbnN0IHt4LCB5fSA9IG1vdXNlXG5cbiAgY29uc3QgYm94WCA9IE1BUFswXS5sZW5ndGggKiB4IC8gdmlld3BvcnRXaWR0aFxuICBjb25zdCBib3hZID0gTUFQLmxlbmd0aCAqIHkgLyB2aWV3cG9ydEhlaWdodFxuICBjb25zdCBib3hIID0gMTBcbiAgY29uc3QgYm94VyA9IHZpZXdwb3J0V2lkdGggLyB2aWV3cG9ydEhlaWdodCAqIGJveEhcblxuICBkcmF3QmFja2dyb3VuZCh7XG4gICAgdmlldzogW1xuICAgICAgYm94WCAtIDAuNSAqIGJveFcsXG4gICAgICBib3hZIC0gMC41ICogYm94SCxcbiAgICAgIGJveFggKyAwLjUgKiBib3hXLFxuICAgICAgYm94WSArIDAuNSAqIGJveEhcbiAgICBdXG4gIH0pXG59KVxuIiwidmFyIEdMX0ZMT0FUID0gNTEyNlxuXG5mdW5jdGlvbiBBdHRyaWJ1dGVSZWNvcmQgKCkge1xuICB0aGlzLnN0YXRlID0gMFxuXG4gIHRoaXMueCA9IDAuMFxuICB0aGlzLnkgPSAwLjBcbiAgdGhpcy56ID0gMC4wXG4gIHRoaXMudyA9IDAuMFxuXG4gIHRoaXMuYnVmZmVyID0gbnVsbFxuICB0aGlzLnNpemUgPSAwXG4gIHRoaXMubm9ybWFsaXplZCA9IGZhbHNlXG4gIHRoaXMudHlwZSA9IEdMX0ZMT0FUXG4gIHRoaXMub2Zmc2V0ID0gMFxuICB0aGlzLnN0cmlkZSA9IDBcbiAgdGhpcy5kaXZpc29yID0gMFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBBdHRyaWJ1dGVTdGF0ZSAoXG4gIGdsLFxuICBleHRlbnNpb25zLFxuICBsaW1pdHMsXG4gIGJ1ZmZlclN0YXRlLFxuICBzdHJpbmdTdG9yZSkge1xuICB2YXIgTlVNX0FUVFJJQlVURVMgPSBsaW1pdHMubWF4QXR0cmlidXRlc1xuICB2YXIgYXR0cmlidXRlQmluZGluZ3MgPSBuZXcgQXJyYXkoTlVNX0FUVFJJQlVURVMpXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgTlVNX0FUVFJJQlVURVM7ICsraSkge1xuICAgIGF0dHJpYnV0ZUJpbmRpbmdzW2ldID0gbmV3IEF0dHJpYnV0ZVJlY29yZCgpXG4gIH1cblxuICByZXR1cm4ge1xuICAgIFJlY29yZDogQXR0cmlidXRlUmVjb3JkLFxuICAgIHNjb3BlOiB7fSxcbiAgICBzdGF0ZTogYXR0cmlidXRlQmluZGluZ3NcbiAgfVxufVxuIiwiLy8gQXJyYXkgYW5kIGVsZW1lbnQgYnVmZmVyIGNyZWF0aW9uXG5cbnZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL3V0aWwvaXMtdHlwZWQtYXJyYXknKVxudmFyIGlzTkRBcnJheUxpa2UgPSByZXF1aXJlKCcuL3V0aWwvaXMtbmRhcnJheScpXG52YXIgYXJyYXlUeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL2FycmF5dHlwZXMuanNvbicpXG52YXIgYnVmZmVyVHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9kdHlwZXMuanNvbicpXG52YXIgdmFsdWVzID0gcmVxdWlyZSgnLi91dGlsL3ZhbHVlcycpXG5cbnZhciBHTF9TVEFUSUNfRFJBVyA9IDM1MDQ0XG5cbnZhciBHTF9BUlJBWV9CVUZGRVIgPSAzNDk2MlxuXG52YXIgR0xfQllURSA9IDUxMjBcbnZhciBHTF9VTlNJR05FRF9CWVRFID0gNTEyMVxudmFyIEdMX1NIT1JUID0gNTEyMlxudmFyIEdMX1VOU0lHTkVEX1NIT1JUID0gNTEyM1xudmFyIEdMX0lOVCA9IDUxMjRcbnZhciBHTF9VTlNJR05FRF9JTlQgPSA1MTI1XG52YXIgR0xfRkxPQVQgPSA1MTI2XG5cbnZhciB1c2FnZVR5cGVzID0ge1xuICAnc3RhdGljJzogMzUwNDQsXG4gICdkeW5hbWljJzogMzUwNDgsXG4gICdzdHJlYW0nOiAzNTA0MFxufVxuXG5mdW5jdGlvbiB0eXBlZEFycmF5Q29kZSAoZGF0YSkge1xuICByZXR1cm4gYXJyYXlUeXBlc1tPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoZGF0YSldIHwgMFxufVxuXG5mdW5jdGlvbiBtYWtlVHlwZWRBcnJheSAoZHR5cGUsIGFyZ3MpIHtcbiAgc3dpdGNoIChkdHlwZSkge1xuICAgIGNhc2UgR0xfVU5TSUdORURfQllURTpcbiAgICAgIHJldHVybiBuZXcgVWludDhBcnJheShhcmdzKVxuICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlQ6XG4gICAgICByZXR1cm4gbmV3IFVpbnQxNkFycmF5KGFyZ3MpXG4gICAgY2FzZSBHTF9VTlNJR05FRF9JTlQ6XG4gICAgICByZXR1cm4gbmV3IFVpbnQzMkFycmF5KGFyZ3MpXG4gICAgY2FzZSBHTF9CWVRFOlxuICAgICAgcmV0dXJuIG5ldyBJbnQ4QXJyYXkoYXJncylcbiAgICBjYXNlIEdMX1NIT1JUOlxuICAgICAgcmV0dXJuIG5ldyBJbnQxNkFycmF5KGFyZ3MpXG4gICAgY2FzZSBHTF9JTlQ6XG4gICAgICByZXR1cm4gbmV3IEludDMyQXJyYXkoYXJncylcbiAgICBjYXNlIEdMX0ZMT0FUOlxuICAgICAgcmV0dXJuIG5ldyBGbG9hdDMyQXJyYXkoYXJncylcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIG51bGxcbiAgfVxufVxuXG5mdW5jdGlvbiBmbGF0dGVuIChyZXN1bHQsIGRhdGEsIGRpbWVuc2lvbikge1xuICB2YXIgcHRyID0gMFxuICBmb3IgKHZhciBpID0gMDsgaSA8IGRhdGEubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgdiA9IGRhdGFbaV1cbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IGRpbWVuc2lvbjsgKytqKSB7XG4gICAgICByZXN1bHRbcHRyKytdID0gdltqXVxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiB0cmFuc3Bvc2UgKHJlc3VsdCwgZGF0YSwgc2hhcGVYLCBzaGFwZVksIHN0cmlkZVgsIHN0cmlkZVksIG9mZnNldCkge1xuICB2YXIgcHRyID0gMFxuICBmb3IgKHZhciBpID0gMDsgaSA8IHNoYXBlWDsgKytpKSB7XG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBzaGFwZVk7ICsraikge1xuICAgICAgcmVzdWx0W3B0cisrXSA9IGRhdGFbc3RyaWRlWCAqIGkgKyBzdHJpZGVZICogaiArIG9mZnNldF1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBCdWZmZXJTdGF0ZSAoZ2wpIHtcbiAgdmFyIGJ1ZmZlckNvdW50ID0gMFxuICB2YXIgYnVmZmVyU2V0ID0ge31cblxuICBmdW5jdGlvbiBSRUdMQnVmZmVyICh0eXBlKSB7XG4gICAgdGhpcy5pZCA9IGJ1ZmZlckNvdW50KytcbiAgICB0aGlzLmJ1ZmZlciA9IG51bGxcbiAgICB0aGlzLnR5cGUgPSB0eXBlXG4gICAgdGhpcy51c2FnZSA9IEdMX1NUQVRJQ19EUkFXXG4gICAgdGhpcy5ieXRlTGVuZ3RoID0gMFxuICAgIHRoaXMuZGltZW5zaW9uID0gMVxuICAgIHRoaXMuZGF0YSA9IG51bGxcbiAgICB0aGlzLmR0eXBlID0gR0xfVU5TSUdORURfQllURVxuICB9XG5cbiAgUkVHTEJ1ZmZlci5wcm90b3R5cGUuYmluZCA9IGZ1bmN0aW9uICgpIHtcbiAgICBnbC5iaW5kQnVmZmVyKHRoaXMudHlwZSwgdGhpcy5idWZmZXIpXG4gIH1cblxuICBmdW5jdGlvbiByZWZyZXNoIChidWZmZXIpIHtcbiAgICBpZiAoIWdsLmlzQnVmZmVyKGJ1ZmZlci5idWZmZXIpKSB7XG4gICAgICBidWZmZXIuYnVmZmVyID0gZ2wuY3JlYXRlQnVmZmVyKClcbiAgICB9XG4gICAgYnVmZmVyLmJpbmQoKVxuICAgIGdsLmJ1ZmZlckRhdGEoYnVmZmVyLnR5cGUsIGJ1ZmZlci5kYXRhIHx8IGJ1ZmZlci5ieXRlTGVuZ3RoLCBidWZmZXIudXNhZ2UpXG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95IChidWZmZXIpIHtcbiAgICB2YXIgaGFuZGxlID0gYnVmZmVyLmJ1ZmZlclxuICAgIFxuICAgIGlmIChnbC5pc0J1ZmZlcihoYW5kbGUpKSB7XG4gICAgICBnbC5kZWxldGVCdWZmZXIoaGFuZGxlKVxuICAgIH1cbiAgICBidWZmZXIuYnVmZmVyID0gbnVsbFxuICAgIGRlbGV0ZSBidWZmZXJTZXRbYnVmZmVyLmlkXVxuICB9XG5cbiAgLy8gVE9ETyBJbXBsZW1lbnQgcG9vbGVkIGFsbG9jYXRvciBmb3Igc3RyZWFtIGJ1ZmZlcnNcbiAgZnVuY3Rpb24gY3JlYXRlU3RyZWFtIChkYXRhKSB7XG4gICAgdmFyIHJlc3VsdCA9IGNyZWF0ZUJ1ZmZlcih7XG4gICAgICBkYXRhOiBkYXRhLFxuICAgICAgdXNhZ2U6ICdzdHJlYW0nXG4gICAgfSxcbiAgICBHTF9BUlJBWV9CVUZGRVIsXG4gICAgZmFsc2UpXG4gICAgcmV0dXJuIHJlc3VsdC5fYnVmZmVyXG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95U3RyZWFtIChzdHJlYW0pIHtcbiAgICBkZXN0cm95KHN0cmVhbSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZUJ1ZmZlciAob3B0aW9ucywgdHlwZSwgZGVmZXJJbml0KSB7XG4gICAgdmFyIGJ1ZmZlciA9IG5ldyBSRUdMQnVmZmVyKHR5cGUpXG4gICAgYnVmZmVyU2V0W2J1ZmZlci5pZF0gPSBidWZmZXJcblxuICAgIGZ1bmN0aW9uIHJlZ2xCdWZmZXIgKGlucHV0KSB7XG4gICAgICB2YXIgb3B0aW9ucyA9IGlucHV0IHx8IHt9XG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShvcHRpb25zKSB8fFxuICAgICAgICAgIGlzVHlwZWRBcnJheShvcHRpb25zKSB8fFxuICAgICAgICAgIGlzTkRBcnJheUxpa2Uob3B0aW9ucykpIHtcbiAgICAgICAgb3B0aW9ucyA9IHtcbiAgICAgICAgICBkYXRhOiBvcHRpb25zXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIG9wdGlvbnMgPT09ICdudW1iZXInKSB7XG4gICAgICAgIG9wdGlvbnMgPSB7XG4gICAgICAgICAgbGVuZ3RoOiBvcHRpb25zIHwgMFxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKG9wdGlvbnMgPT09IG51bGwgfHwgb3B0aW9ucyA9PT0gdm9pZCAwKSB7XG4gICAgICAgIG9wdGlvbnMgPSB7fVxuICAgICAgfVxuXG4gICAgICBcblxuICAgICAgaWYgKCd1c2FnZScgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgdXNhZ2UgPSBvcHRpb25zLnVzYWdlXG4gICAgICAgIFxuICAgICAgICBidWZmZXIudXNhZ2UgPSB1c2FnZVR5cGVzW29wdGlvbnMudXNhZ2VdXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBidWZmZXIudXNhZ2UgPSBHTF9TVEFUSUNfRFJBV1xuICAgICAgfVxuXG4gICAgICB2YXIgZHR5cGUgPSAwXG4gICAgICBpZiAoJ3R5cGUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgXG4gICAgICAgIGR0eXBlID0gYnVmZmVyVHlwZXNbb3B0aW9ucy50eXBlXVxuICAgICAgfVxuXG4gICAgICB2YXIgZGltZW5zaW9uID0gKG9wdGlvbnMuZGltZW5zaW9uIHwgMCkgfHwgMVxuICAgICAgdmFyIGJ5dGVMZW5ndGggPSAwXG4gICAgICB2YXIgZGF0YSA9IG51bGxcbiAgICAgIGlmICgnZGF0YScgaW4gb3B0aW9ucykge1xuICAgICAgICBkYXRhID0gb3B0aW9ucy5kYXRhXG4gICAgICAgIGlmIChkYXRhID09PSBudWxsKSB7XG4gICAgICAgICAgYnl0ZUxlbmd0aCA9IG9wdGlvbnMubGVuZ3RoIHwgMFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmIChpc05EQXJyYXlMaWtlKGRhdGEpKSB7XG4gICAgICAgICAgICB2YXIgc2hhcGUgPSBkYXRhLnNoYXBlXG4gICAgICAgICAgICB2YXIgc3RyaWRlID0gZGF0YS5zdHJpZGVcbiAgICAgICAgICAgIHZhciBvZmZzZXQgPSBkYXRhLm9mZnNldFxuXG4gICAgICAgICAgICB2YXIgc2hhcGVYID0gMFxuICAgICAgICAgICAgdmFyIHNoYXBlWSA9IDBcbiAgICAgICAgICAgIHZhciBzdHJpZGVYID0gMFxuICAgICAgICAgICAgdmFyIHN0cmlkZVkgPSAwXG4gICAgICAgICAgICBpZiAoc2hhcGUubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICAgIHNoYXBlWCA9IHNoYXBlWzBdXG4gICAgICAgICAgICAgIHNoYXBlWSA9IDFcbiAgICAgICAgICAgICAgc3RyaWRlWCA9IHN0cmlkZVswXVxuICAgICAgICAgICAgICBzdHJpZGVZID0gMFxuICAgICAgICAgICAgfSBlbHNlIGlmIChzaGFwZS5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgICAgICAgc2hhcGVYID0gc2hhcGVbMF1cbiAgICAgICAgICAgICAgc2hhcGVZID0gc2hhcGVbMV1cbiAgICAgICAgICAgICAgc3RyaWRlWCA9IHN0cmlkZVswXVxuICAgICAgICAgICAgICBzdHJpZGVZID0gc3RyaWRlWzFdXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZHR5cGUgPSBkdHlwZSB8fCB0eXBlZEFycmF5Q29kZShkYXRhLmRhdGEpIHx8IEdMX0ZMT0FUXG4gICAgICAgICAgICBkaW1lbnNpb24gPSBzaGFwZVlcbiAgICAgICAgICAgIGRhdGEgPSB0cmFuc3Bvc2UoXG4gICAgICAgICAgICAgIG1ha2VUeXBlZEFycmF5KGR0eXBlLCBzaGFwZVggKiBzaGFwZVkpLFxuICAgICAgICAgICAgICBkYXRhLmRhdGEsXG4gICAgICAgICAgICAgIHNoYXBlWCwgc2hhcGVZLFxuICAgICAgICAgICAgICBzdHJpZGVYLCBzdHJpZGVZLFxuICAgICAgICAgICAgICBvZmZzZXQpXG4gICAgICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XG4gICAgICAgICAgICBpZiAoZGF0YS5sZW5ndGggPiAwICYmIEFycmF5LmlzQXJyYXkoZGF0YVswXSkpIHtcbiAgICAgICAgICAgICAgZGltZW5zaW9uID0gZGF0YVswXS5sZW5ndGhcbiAgICAgICAgICAgICAgZHR5cGUgPSBkdHlwZSB8fCBHTF9GTE9BVFxuICAgICAgICAgICAgICB2YXIgcmVzdWx0ID0gbWFrZVR5cGVkQXJyYXkoZHR5cGUsIGRhdGEubGVuZ3RoICogZGltZW5zaW9uKVxuICAgICAgICAgICAgICBkYXRhID0gZmxhdHRlbihyZXN1bHQsIGRhdGEsIGRpbWVuc2lvbilcbiAgICAgICAgICAgICAgZGF0YSA9IHJlc3VsdFxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgZHR5cGUgPSBkdHlwZSB8fCBHTF9GTE9BVFxuICAgICAgICAgICAgICBkYXRhID0gbWFrZVR5cGVkQXJyYXkoZHR5cGUsIGRhdGEpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZHR5cGUgPSBkdHlwZSB8fCB0eXBlZEFycmF5Q29kZShkYXRhKVxuICAgICAgICAgIH1cbiAgICAgICAgICBieXRlTGVuZ3RoID0gZGF0YS5ieXRlTGVuZ3RoXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoJ2xlbmd0aCcgaW4gb3B0aW9ucykge1xuICAgICAgICBieXRlTGVuZ3RoID0gb3B0aW9ucy5sZW5ndGggfCAwXG4gICAgICAgIFxuICAgICAgfVxuXG4gICAgICBidWZmZXIuZGF0YSA9IGRhdGFcbiAgICAgIGJ1ZmZlci5kdHlwZSA9IGR0eXBlIHx8IEdMX1VOU0lHTkVEX0JZVEVcbiAgICAgIGJ1ZmZlci5ieXRlTGVuZ3RoID0gYnl0ZUxlbmd0aFxuICAgICAgYnVmZmVyLmRpbWVuc2lvbiA9IGRpbWVuc2lvblxuXG4gICAgICByZWZyZXNoKGJ1ZmZlcilcblxuICAgICAgcmV0dXJuIHJlZ2xCdWZmZXJcbiAgICB9XG5cbiAgICBpZiAoIWRlZmVySW5pdCkge1xuICAgICAgcmVnbEJ1ZmZlcihvcHRpb25zKVxuICAgIH1cblxuICAgIHJlZ2xCdWZmZXIuX3JlZ2xUeXBlID0gJ2J1ZmZlcidcbiAgICByZWdsQnVmZmVyLl9idWZmZXIgPSBidWZmZXJcbiAgICByZWdsQnVmZmVyLmRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7IGRlc3Ryb3koYnVmZmVyKSB9XG5cbiAgICByZXR1cm4gcmVnbEJ1ZmZlclxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjcmVhdGU6IGNyZWF0ZUJ1ZmZlcixcblxuICAgIGNyZWF0ZVN0cmVhbTogY3JlYXRlU3RyZWFtLFxuICAgIGRlc3Ryb3lTdHJlYW06IGRlc3Ryb3lTdHJlYW0sXG5cbiAgICBjbGVhcjogZnVuY3Rpb24gKCkge1xuICAgICAgdmFsdWVzKGJ1ZmZlclNldCkuZm9yRWFjaChkZXN0cm95KVxuICAgIH0sXG5cbiAgICByZWZyZXNoOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YWx1ZXMoYnVmZmVyU2V0KS5mb3JFYWNoKHJlZnJlc2gpXG4gICAgfSxcblxuICAgIGdldEJ1ZmZlcjogZnVuY3Rpb24gKHdyYXBwZXIpIHtcbiAgICAgIGlmICh3cmFwcGVyICYmIHdyYXBwZXIuX2J1ZmZlciBpbnN0YW5jZW9mIFJFR0xCdWZmZXIpIHtcbiAgICAgICAgcmV0dXJuIHdyYXBwZXIuX2J1ZmZlclxuICAgICAgfVxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgXCJbb2JqZWN0IEludDhBcnJheV1cIjogNTEyMFxuLCBcIltvYmplY3QgSW50MTZBcnJheV1cIjogNTEyMlxuLCBcIltvYmplY3QgSW50MzJBcnJheV1cIjogNTEyNFxuLCBcIltvYmplY3QgVWludDhBcnJheV1cIjogNTEyMVxuLCBcIltvYmplY3QgVWludDhDbGFtcGVkQXJyYXldXCI6IDUxMjFcbiwgXCJbb2JqZWN0IFVpbnQxNkFycmF5XVwiOiA1MTIzXG4sIFwiW29iamVjdCBVaW50MzJBcnJheV1cIjogNTEyNVxuLCBcIltvYmplY3QgRmxvYXQzMkFycmF5XVwiOiA1MTI2XG4sIFwiW29iamVjdCBGbG9hdDY0QXJyYXldXCI6IDUxMjFcbiwgXCJbb2JqZWN0IEFycmF5QnVmZmVyXVwiOiA1MTIxXG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gIFwiaW50OFwiOiA1MTIwXG4sIFwiaW50MTZcIjogNTEyMlxuLCBcImludDMyXCI6IDUxMjRcbiwgXCJ1aW50OFwiOiA1MTIxXG4sIFwidWludDE2XCI6IDUxMjNcbiwgXCJ1aW50MzJcIjogNTEyNVxuLCBcImZsb2F0XCI6IDUxMjZcbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgXCJwb2ludHNcIjogMCxcbiAgXCJwb2ludFwiOiAwLFxuICBcImxpbmVzXCI6IDEsXG4gIFwibGluZVwiOiAxLFxuICBcImxpbmUgbG9vcFwiOiAyLFxuICBcImxpbmUgc3RyaXBcIjogMyxcbiAgXCJ0cmlhbmdsZXNcIjogNCxcbiAgXCJ0cmlhbmdsZVwiOiA0LFxuICBcInRyaWFuZ2xlIHN0cmlwXCI6IDUsXG4gIFwidHJpYW5nbGUgZmFuXCI6IDZcbn1cbiIsIlxudmFyIGNyZWF0ZUVudmlyb25tZW50ID0gcmVxdWlyZSgnLi91dGlsL2NvZGVnZW4nKVxudmFyIGxvb3AgPSByZXF1aXJlKCcuL3V0aWwvbG9vcCcpXG52YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi91dGlsL2lzLXR5cGVkLWFycmF5JylcbnZhciBpc05EQXJyYXkgPSByZXF1aXJlKCcuL3V0aWwvaXMtbmRhcnJheScpXG5cbnZhciBwcmltVHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9wcmltaXRpdmVzLmpzb24nKVxudmFyIGdsVHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9kdHlwZXMuanNvbicpXG5cbi8vIFwiY3V0ZVwiIG5hbWVzIGZvciB2ZWN0b3IgY29tcG9uZW50c1xudmFyIENVVEVfQ09NUE9ORU5UUyA9ICd4eXp3Jy5zcGxpdCgnJylcblxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSA1MTIxXG5cbnZhciBBVFRSSUJfU1RBVEVfUE9JTlRFUiA9IDFcbnZhciBBVFRSSUJfU1RBVEVfQ09OU1RBTlQgPSAyXG5cbnZhciBEWU5fRlVOQyA9IDBcbnZhciBEWU5fUFJPUCA9IDFcbnZhciBEWU5fQ09OVEVYVCA9IDJcbnZhciBEWU5fU1RBVEUgPSAzXG5cbnZhciBTX0RJVEhFUiA9ICdkaXRoZXInXG52YXIgU19CTEVORF9FTkFCTEUgPSAnYmxlbmQuZW5hYmxlJ1xudmFyIFNfQkxFTkRfQ09MT1IgPSAnYmxlbmQuY29sb3InXG52YXIgU19CTEVORF9FUVVBVElPTiA9ICdibGVuZC5lcXVhdGlvbidcbnZhciBTX0JMRU5EX0ZVTkMgPSAnYmxlbmQuZnVuYydcbnZhciBTX0RFUFRIX0VOQUJMRSA9ICdkZXB0aC5lbmFibGUnXG52YXIgU19ERVBUSF9GVU5DID0gJ2RlcHRoLmZ1bmMnXG52YXIgU19ERVBUSF9SQU5HRSA9ICdkZXB0aC5yYW5nZSdcbnZhciBTX0RFUFRIX01BU0sgPSAnZGVwdGgubWFzaydcbnZhciBTX0NPTE9SX01BU0sgPSAnY29sb3JNYXNrJ1xudmFyIFNfQ1VMTF9FTkFCTEUgPSAnY3VsbC5lbmFibGUnXG52YXIgU19DVUxMX0ZBQ0UgPSAnY3VsbC5mYWNlJ1xudmFyIFNfRlJPTlRfRkFDRSA9ICdmcm9udEZhY2UnXG52YXIgU19MSU5FX1dJRFRIID0gJ2xpbmVXaWR0aCdcbnZhciBTX1BPTFlHT05fT0ZGU0VUX0VOQUJMRSA9ICdwb2x5Z29uT2Zmc2V0LmVuYWJsZSdcbnZhciBTX1BPTFlHT05fT0ZGU0VUX09GRlNFVCA9ICdwb2x5Z29uT2Zmc2V0Lm9mZnNldCdcbnZhciBTX1NBTVBMRV9BTFBIQSA9ICdzYW1wbGUuYWxwaGEnXG52YXIgU19TQU1QTEVfRU5BQkxFID0gJ3NhbXBsZS5lbmFibGUnXG52YXIgU19TQU1QTEVfQ09WRVJBR0UgPSAnc2FtcGxlLmNvdmVyYWdlJ1xudmFyIFNfU1RFTkNJTF9FTkFCTEUgPSAnc3RlbmNpbC5lbmFibGUnXG52YXIgU19TVEVOQ0lMX01BU0sgPSAnc3RlbmNpbC5tYXNrJ1xudmFyIFNfU1RFTkNJTF9GVU5DID0gJ3N0ZW5jaWwuZnVuYydcbnZhciBTX1NURU5DSUxfT1BGUk9OVCA9ICdzdGVuY2lsLm9wRnJvbnQnXG52YXIgU19TVEVOQ0lMX09QQkFDSyA9ICdzdGVuY2lsLm9wQmFjaydcbnZhciBTX1NDSVNTT1JfRU5BQkxFID0gJ3NjaXNzb3IuZW5hYmxlJ1xudmFyIFNfU0NJU1NPUl9CT1ggPSAnc2Npc3Nvci5ib3gnXG52YXIgU19WSUVXUE9SVCA9ICd2aWV3cG9ydCdcblxudmFyIFNfRlJBTUVCVUZGRVIgPSAnZnJhbWVidWZmZXInXG52YXIgU19WRVJUID0gJ3ZlcnQnXG52YXIgU19GUkFHID0gJ2ZyYWcnXG52YXIgU19FTEVNRU5UUyA9ICdlbGVtZW50cydcbnZhciBTX1BSSU1JVElWRSA9ICdwcmltaXRpdmUnXG52YXIgU19DT1VOVCA9ICdjb3VudCdcbnZhciBTX09GRlNFVCA9ICdvZmZzZXQnXG52YXIgU19JTlNUQU5DRVMgPSAnaW5zdGFuY2VzJ1xuXG52YXIgU1VGRklYX1dJRFRIID0gJ1dpZHRoJ1xudmFyIFNVRkZJWF9IRUlHSFQgPSAnSGVpZ2h0J1xuXG52YXIgU19GUkFNRUJVRkZFUl9XSURUSCA9IFNfRlJBTUVCVUZGRVIgKyBTVUZGSVhfV0lEVEhcbnZhciBTX0ZSQU1FQlVGRkVSX0hFSUdIVCA9IFNfRlJBTUVCVUZGRVIgKyBTVUZGSVhfSEVJR0hUXG52YXIgU19WSUVXUE9SVF9XSURUSCA9IFNfVklFV1BPUlQgKyBTVUZGSVhfV0lEVEhcbnZhciBTX1ZJRVdQT1JUX0hFSUdIVCA9IFNfVklFV1BPUlQgKyBTVUZGSVhfSEVJR0hUXG52YXIgU19EUkFXSU5HQlVGRkVSID0gJ2RyYXdpbmdCdWZmZXInXG52YXIgU19EUkFXSU5HQlVGRkVSX1dJRFRIID0gU19EUkFXSU5HQlVGRkVSICsgU1VGRklYX1dJRFRIXG52YXIgU19EUkFXSU5HQlVGRkVSX0hFSUdIVCA9IFNfRFJBV0lOR0JVRkZFUiArIFNVRkZJWF9IRUlHSFRcblxudmFyIEdMX0FSUkFZX0JVRkZFUiA9IDM0OTYyXG52YXIgR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIgPSAzNDk2M1xuXG52YXIgR0xfRlJBR01FTlRfU0hBREVSID0gMzU2MzJcbnZhciBHTF9WRVJURVhfU0hBREVSID0gMzU2MzNcblxudmFyIEdMX1RFWFRVUkVfMkQgPSAweDBERTFcbnZhciBHTF9URVhUVVJFX0NVQkVfTUFQID0gMHg4NTEzXG5cbnZhciBHTF9DVUxMX0ZBQ0UgPSAweDBCNDRcbnZhciBHTF9CTEVORCA9IDB4MEJFMlxudmFyIEdMX0RJVEhFUiA9IDB4MEJEMFxudmFyIEdMX1NURU5DSUxfVEVTVCA9IDB4MEI5MFxudmFyIEdMX0RFUFRIX1RFU1QgPSAweDBCNzFcbnZhciBHTF9TQ0lTU09SX1RFU1QgPSAweDBDMTFcbnZhciBHTF9QT0xZR09OX09GRlNFVF9GSUxMID0gMHg4MDM3XG52YXIgR0xfU0FNUExFX0FMUEhBX1RPX0NPVkVSQUdFID0gMHg4MDlFXG52YXIgR0xfU0FNUExFX0NPVkVSQUdFID0gMHg4MEEwXG5cbnZhciBHTF9GTE9BVCA9IDUxMjZcbnZhciBHTF9GTE9BVF9WRUMyID0gMzU2NjRcbnZhciBHTF9GTE9BVF9WRUMzID0gMzU2NjVcbnZhciBHTF9GTE9BVF9WRUM0ID0gMzU2NjZcbnZhciBHTF9JTlQgPSA1MTI0XG52YXIgR0xfSU5UX1ZFQzIgPSAzNTY2N1xudmFyIEdMX0lOVF9WRUMzID0gMzU2NjhcbnZhciBHTF9JTlRfVkVDNCA9IDM1NjY5XG52YXIgR0xfQk9PTCA9IDM1NjcwXG52YXIgR0xfQk9PTF9WRUMyID0gMzU2NzFcbnZhciBHTF9CT09MX1ZFQzMgPSAzNTY3MlxudmFyIEdMX0JPT0xfVkVDNCA9IDM1NjczXG52YXIgR0xfRkxPQVRfTUFUMiA9IDM1Njc0XG52YXIgR0xfRkxPQVRfTUFUMyA9IDM1Njc1XG52YXIgR0xfRkxPQVRfTUFUNCA9IDM1Njc2XG52YXIgR0xfU0FNUExFUl8yRCA9IDM1Njc4XG52YXIgR0xfU0FNUExFUl9DVUJFID0gMzU2ODBcblxudmFyIEdMX1RSSUFOR0xFUyA9IDRcblxudmFyIEdMX0ZST05UID0gMTAyOFxudmFyIEdMX0JBQ0sgPSAxMDI5XG52YXIgR0xfQ1cgPSAweDA5MDBcbnZhciBHTF9DQ1cgPSAweDA5MDFcbnZhciBHTF9NSU5fRVhUID0gMHg4MDA3XG52YXIgR0xfTUFYX0VYVCA9IDB4ODAwOFxudmFyIEdMX0FMV0FZUyA9IDUxOVxudmFyIEdMX0tFRVAgPSA3NjgwXG52YXIgR0xfWkVSTyA9IDBcbnZhciBHTF9PTkUgPSAxXG52YXIgR0xfRlVOQ19BREQgPSAweDgwMDZcbnZhciBHTF9MRVNTID0gNTEzXG5cbnZhciBHTF9GUkFNRUJVRkZFUiA9IDB4OEQ0MFxudmFyIEdMX0NPTE9SX0FUVEFDSE1FTlQwID0gMHg4Q0UwXG5cbnZhciBibGVuZEZ1bmNzID0ge1xuICAnMCc6IDAsXG4gICcxJzogMSxcbiAgJ3plcm8nOiAwLFxuICAnb25lJzogMSxcbiAgJ3NyYyBjb2xvcic6IDc2OCxcbiAgJ29uZSBtaW51cyBzcmMgY29sb3InOiA3NjksXG4gICdzcmMgYWxwaGEnOiA3NzAsXG4gICdvbmUgbWludXMgc3JjIGFscGhhJzogNzcxLFxuICAnZHN0IGNvbG9yJzogNzc0LFxuICAnb25lIG1pbnVzIGRzdCBjb2xvcic6IDc3NSxcbiAgJ2RzdCBhbHBoYSc6IDc3MixcbiAgJ29uZSBtaW51cyBkc3QgYWxwaGEnOiA3NzMsXG4gICdjb25zdGFudCBjb2xvcic6IDMyNzY5LFxuICAnb25lIG1pbnVzIGNvbnN0YW50IGNvbG9yJzogMzI3NzAsXG4gICdjb25zdGFudCBhbHBoYSc6IDMyNzcxLFxuICAnb25lIG1pbnVzIGNvbnN0YW50IGFscGhhJzogMzI3NzIsXG4gICdzcmMgYWxwaGEgc2F0dXJhdGUnOiA3NzZcbn1cblxudmFyIGNvbXBhcmVGdW5jcyA9IHtcbiAgJ25ldmVyJzogNTEyLFxuICAnbGVzcyc6IDUxMyxcbiAgJzwnOiA1MTMsXG4gICdlcXVhbCc6IDUxNCxcbiAgJz0nOiA1MTQsXG4gICc9PSc6IDUxNCxcbiAgJz09PSc6IDUxNCxcbiAgJ2xlcXVhbCc6IDUxNSxcbiAgJzw9JzogNTE1LFxuICAnZ3JlYXRlcic6IDUxNixcbiAgJz4nOiA1MTYsXG4gICdub3RlcXVhbCc6IDUxNyxcbiAgJyE9JzogNTE3LFxuICAnIT09JzogNTE3LFxuICAnZ2VxdWFsJzogNTE4LFxuICAnPj0nOiA1MTgsXG4gICdhbHdheXMnOiA1MTlcbn1cblxudmFyIHN0ZW5jaWxPcHMgPSB7XG4gICcwJzogMCxcbiAgJ3plcm8nOiAwLFxuICAna2VlcCc6IDc2ODAsXG4gICdyZXBsYWNlJzogNzY4MSxcbiAgJ2luY3JlbWVudCc6IDc2ODIsXG4gICdkZWNyZW1lbnQnOiA3NjgzLFxuICAnaW5jcmVtZW50IHdyYXAnOiAzNDA1NSxcbiAgJ2RlY3JlbWVudCB3cmFwJzogMzQwNTYsXG4gICdpbnZlcnQnOiA1Mzg2XG59XG5cbnZhciBzaGFkZXJUeXBlID0ge1xuICAnZnJhZyc6IEdMX0ZSQUdNRU5UX1NIQURFUixcbiAgJ3ZlcnQnOiBHTF9WRVJURVhfU0hBREVSXG59XG5cbnZhciBvcmllbnRhdGlvblR5cGUgPSB7XG4gICdjdyc6IEdMX0NXLFxuICAnY2N3JzogR0xfQ0NXXG59XG5cbmZ1bmN0aW9uIGlzQnVmZmVyQXJncyAoeCkge1xuICByZXR1cm4gQXJyYXkuaXNBcnJheSh4KSB8fFxuICAgIGlzVHlwZWRBcnJheSh4KSB8fFxuICAgIGlzTkRBcnJheSh4KVxufVxuXG4vLyBNYWtlIHN1cmUgdmlld3BvcnQgaXMgcHJvY2Vzc2VkIGZpcnN0XG5mdW5jdGlvbiBzb3J0U3RhdGUgKHN0YXRlKSB7XG4gIHJldHVybiBzdGF0ZS5zb3J0KGZ1bmN0aW9uIChhLCBiKSB7XG4gICAgaWYgKGEgPT09IFNfVklFV1BPUlQpIHtcbiAgICAgIHJldHVybiAtMVxuICAgIH0gZWxzZSBpZiAoYiA9PT0gU19WSUVXUE9SVCkge1xuICAgICAgcmV0dXJuIDFcbiAgICB9XG4gICAgcmV0dXJuIChhIDwgYikgPyAtMSA6IDFcbiAgfSlcbn1cblxuZnVuY3Rpb24gRGVjbGFyYXRpb24gKHRoaXNEZXAsIGNvbnRleHREZXAsIHByb3BEZXAsIGFwcGVuZCkge1xuICB0aGlzLnRoaXNEZXAgPSB0aGlzRGVwXG4gIHRoaXMuY29udGV4dERlcCA9IGNvbnRleHREZXBcbiAgdGhpcy5wcm9wRGVwID0gcHJvcERlcFxuICB0aGlzLmFwcGVuZCA9IGFwcGVuZFxufVxuXG5mdW5jdGlvbiBpc1N0YXRpYyAoZGVjbCkge1xuICByZXR1cm4gZGVjbCAmJiAhKGRlY2wudGhpc0RlcCB8fCBkZWNsLmNvbnRleHREZXAgfHwgZGVjbC5wcm9wRGVwKVxufVxuXG5mdW5jdGlvbiBjcmVhdGVTdGF0aWNEZWNsIChhcHBlbmQpIHtcbiAgcmV0dXJuIG5ldyBEZWNsYXJhdGlvbihmYWxzZSwgZmFsc2UsIGZhbHNlLCBhcHBlbmQpXG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUR5bmFtaWNEZWNsIChkeW4sIGFwcGVuZCkge1xuICB2YXIgdHlwZSA9IGR5bi50eXBlXG4gIGlmICh0eXBlID09PSBEWU5fRlVOQykge1xuICAgIHZhciBudW1BcmdzID0gZHluLmRhdGEubGVuZ3RoXG4gICAgcmV0dXJuIG5ldyBEZWNsYXJhdGlvbihcbiAgICAgIHRydWUsXG4gICAgICBudW1BcmdzID49IDEsXG4gICAgICBudW1BcmdzID49IDIsXG4gICAgICBhcHBlbmQpXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIG5ldyBEZWNsYXJhdGlvbihcbiAgICAgIHR5cGUgPT09IERZTl9TVEFURSxcbiAgICAgIHR5cGUgPT09IERZTl9DT05URVhULFxuICAgICAgdHlwZSA9PT0gRFlOX1BST1AsXG4gICAgICBhcHBlbmQpXG4gIH1cbn1cblxudmFyIFNDT1BFX0RFQ0wgPSBuZXcgRGVjbGFyYXRpb24oZmFsc2UsIGZhbHNlLCBmYWxzZSwgZnVuY3Rpb24gKCkge30pXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcmVnbENvcmUgKFxuICBnbCxcbiAgc3RyaW5nU3RvcmUsXG4gIGV4dGVuc2lvbnMsXG4gIGxpbWl0cyxcbiAgYnVmZmVyU3RhdGUsXG4gIGVsZW1lbnRTdGF0ZSxcbiAgdGV4dHVyZVN0YXRlLFxuICBmcmFtZWJ1ZmZlclN0YXRlLFxuICB1bmlmb3JtU3RhdGUsXG4gIGF0dHJpYnV0ZVN0YXRlLFxuICBzaGFkZXJTdGF0ZSxcbiAgZHJhd1N0YXRlLFxuICBjb250ZXh0U3RhdGUpIHtcbiAgdmFyIEF0dHJpYnV0ZVJlY29yZCA9IGF0dHJpYnV0ZVN0YXRlLlJlY29yZFxuXG4gIHZhciBibGVuZEVxdWF0aW9ucyA9IHtcbiAgICAnYWRkJzogMzI3NzQsXG4gICAgJ3N1YnRyYWN0JzogMzI3NzgsXG4gICAgJ3JldmVyc2Ugc3VidHJhY3QnOiAzMjc3OVxuICB9XG4gIGlmIChleHRlbnNpb25zLmV4dF9ibGVuZF9taW5tYXgpIHtcbiAgICBibGVuZEVxdWF0aW9ucy5taW4gPSBHTF9NSU5fRVhUXG4gICAgYmxlbmRFcXVhdGlvbnMubWF4ID0gR0xfTUFYX0VYVFxuICB9XG5cbiAgdmFyIGV4dEluc3RhbmNpbmcgPSBleHRlbnNpb25zLmFuZ2xlX2luc3RhbmNlZF9hcnJheXNcbiAgdmFyIGV4dERyYXdCdWZmZXJzID0gZXh0ZW5zaW9ucy53ZWJnbF9kcmF3X2J1ZmZlcnNcblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIFdFQkdMIFNUQVRFXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgdmFyIGN1cnJlbnRTdGF0ZSA9IHtcbiAgICBkaXJ0eTogdHJ1ZVxuICB9XG4gIHZhciBuZXh0U3RhdGUgPSB7fVxuICB2YXIgR0xfU1RBVEVfTkFNRVMgPSBbXVxuICB2YXIgR0xfRkxBR1MgPSB7fVxuICB2YXIgR0xfVkFSSUFCTEVTID0ge31cblxuICBmdW5jdGlvbiBwcm9wTmFtZSAobmFtZSkge1xuICAgIHJldHVybiBuYW1lLnJlcGxhY2UoJy4nLCAnXycpXG4gIH1cblxuICBmdW5jdGlvbiBzdGF0ZUZsYWcgKHNuYW1lLCBjYXAsIGluaXQpIHtcbiAgICB2YXIgbmFtZSA9IHByb3BOYW1lKHNuYW1lKVxuICAgIEdMX1NUQVRFX05BTUVTLnB1c2goc25hbWUpXG4gICAgbmV4dFN0YXRlW25hbWVdID0gY3VycmVudFN0YXRlW25hbWVdID0gISFpbml0XG4gICAgR0xfRkxBR1NbbmFtZV0gPSBjYXBcbiAgfVxuXG4gIGZ1bmN0aW9uIHN0YXRlVmFyaWFibGUgKHNuYW1lLCBmdW5jLCBpbml0KSB7XG4gICAgdmFyIG5hbWUgPSBwcm9wTmFtZShzbmFtZSlcbiAgICBHTF9TVEFURV9OQU1FUy5wdXNoKHNuYW1lKVxuICAgIGlmIChBcnJheS5pc0FycmF5KGluaXQpKSB7XG4gICAgICBjdXJyZW50U3RhdGVbbmFtZV0gPSBpbml0LnNsaWNlKClcbiAgICAgIG5leHRTdGF0ZVtuYW1lXSA9IGluaXQuc2xpY2UoKVxuICAgIH0gZWxzZSB7XG4gICAgICBjdXJyZW50U3RhdGVbbmFtZV0gPSBuZXh0U3RhdGVbbmFtZV0gPSBpbml0XG4gICAgfVxuICAgIEdMX1ZBUklBQkxFU1tuYW1lXSA9IGZ1bmNcbiAgfVxuXG4gIC8vIERpdGhlcmluZ1xuICBzdGF0ZUZsYWcoU19ESVRIRVIsIEdMX0RJVEhFUilcblxuICAvLyBCbGVuZGluZ1xuICBzdGF0ZUZsYWcoU19CTEVORF9FTkFCTEUsIEdMX0JMRU5EKVxuICBzdGF0ZVZhcmlhYmxlKFNfQkxFTkRfQ09MT1IsICdibGVuZENvbG9yJywgWzAsIDAsIDAsIDBdKVxuICBzdGF0ZVZhcmlhYmxlKFNfQkxFTkRfRVFVQVRJT04sICdibGVuZEVxdWF0aW9uU2VwYXJhdGUnLFxuICAgIFtHTF9GVU5DX0FERCwgR0xfRlVOQ19BRERdKVxuICBzdGF0ZVZhcmlhYmxlKFNfQkxFTkRfRlVOQywgJ2JsZW5kRnVuY1NlcGFyYXRlJyxcbiAgICBbR0xfT05FLCBHTF9aRVJPLCBHTF9PTkUsIEdMX1pFUk9dKVxuXG4gIC8vIERlcHRoXG4gIHN0YXRlRmxhZyhTX0RFUFRIX0VOQUJMRSwgR0xfREVQVEhfVEVTVCwgdHJ1ZSlcbiAgc3RhdGVWYXJpYWJsZShTX0RFUFRIX0ZVTkMsICdkZXB0aEZ1bmMnLCBHTF9MRVNTKVxuICBzdGF0ZVZhcmlhYmxlKFNfREVQVEhfUkFOR0UsICdkZXB0aFJhbmdlJywgWzAsIDFdKVxuICBzdGF0ZVZhcmlhYmxlKFNfREVQVEhfTUFTSywgJ2RlcHRoTWFzaycsIHRydWUpXG5cbiAgLy8gQ29sb3IgbWFza1xuICBzdGF0ZVZhcmlhYmxlKFNfQ09MT1JfTUFTSywgU19DT0xPUl9NQVNLLCBbdHJ1ZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZV0pXG5cbiAgLy8gRmFjZSBjdWxsaW5nXG4gIHN0YXRlRmxhZyhTX0NVTExfRU5BQkxFLCBHTF9DVUxMX0ZBQ0UpXG4gIHN0YXRlVmFyaWFibGUoU19DVUxMX0ZBQ0UsICdjdWxsRmFjZScsIEdMX0JBQ0spXG5cbiAgLy8gRnJvbnQgZmFjZSBvcmllbnRhdGlvblxuICBzdGF0ZVZhcmlhYmxlKFNfRlJPTlRfRkFDRSwgU19GUk9OVF9GQUNFLCBHTF9DQ1cpXG5cbiAgLy8gTGluZSB3aWR0aFxuICBzdGF0ZVZhcmlhYmxlKFNfTElORV9XSURUSCwgU19MSU5FX1dJRFRILCAxKVxuXG4gIC8vIFBvbHlnb24gb2Zmc2V0XG4gIHN0YXRlRmxhZyhTX1BPTFlHT05fT0ZGU0VUX0VOQUJMRSwgR0xfUE9MWUdPTl9PRkZTRVRfRklMTClcbiAgc3RhdGVWYXJpYWJsZShTX1BPTFlHT05fT0ZGU0VUX09GRlNFVCwgJ3BvbHlnb25PZmZzZXQnLCBbMCwgMF0pXG5cbiAgLy8gU2FtcGxlIGNvdmVyYWdlXG4gIHN0YXRlRmxhZyhTX1NBTVBMRV9BTFBIQSwgR0xfU0FNUExFX0FMUEhBX1RPX0NPVkVSQUdFKVxuICBzdGF0ZUZsYWcoU19TQU1QTEVfRU5BQkxFLCBHTF9TQU1QTEVfQ09WRVJBR0UpXG4gIHN0YXRlVmFyaWFibGUoU19TQU1QTEVfQ09WRVJBR0UsICdzYW1wbGVDb3ZlcmFnZScsIFsxLCBmYWxzZV0pXG5cbiAgLy8gU3RlbmNpbFxuICBzdGF0ZUZsYWcoU19TVEVOQ0lMX0VOQUJMRSwgR0xfU1RFTkNJTF9URVNUKVxuICBzdGF0ZVZhcmlhYmxlKFNfU1RFTkNJTF9NQVNLLCAnc3RlbmNpbE1hc2snLCAtMSlcbiAgc3RhdGVWYXJpYWJsZShTX1NURU5DSUxfRlVOQywgJ3N0ZW5jaWxGdW5jJywgW0dMX0FMV0FZUywgMCwgLTFdKVxuICBzdGF0ZVZhcmlhYmxlKFNfU1RFTkNJTF9PUEZST05ULCAnc3RlbmNpbE9wU2VwYXJhdGUnLFxuICAgIFtHTF9GUk9OVCwgR0xfS0VFUCwgR0xfS0VFUCwgR0xfS0VFUF0pXG4gIHN0YXRlVmFyaWFibGUoU19TVEVOQ0lMX09QQkFDSywgJ3N0ZW5jaWxPcFNlcGFyYXRlJyxcbiAgICBbR0xfQkFDSywgR0xfS0VFUCwgR0xfS0VFUCwgR0xfS0VFUF0pXG5cbiAgLy8gU2Npc3NvclxuICBzdGF0ZUZsYWcoU19TQ0lTU09SX0VOQUJMRSwgR0xfU0NJU1NPUl9URVNUKVxuICBzdGF0ZVZhcmlhYmxlKFNfU0NJU1NPUl9CT1gsICdzY2lzc29yJyxcbiAgICBbMCwgMCwgZ2wuZHJhd2luZ0J1ZmZlcldpZHRoLCBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0XSlcblxuICAvLyBWaWV3cG9ydFxuICBzdGF0ZVZhcmlhYmxlKFNfVklFV1BPUlQsIFNfVklFV1BPUlQsXG4gICAgWzAsIDAsIGdsLmRyYXdpbmdCdWZmZXJXaWR0aCwgZ2wuZHJhd2luZ0J1ZmZlckhlaWdodF0pXG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBFTlZJUk9OTUVOVFxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIHZhciBzaGFyZWRTdGF0ZSA9IHtcbiAgICBnbDogZ2wsXG4gICAgY29udGV4dDogY29udGV4dFN0YXRlLFxuICAgIHN0cmluZ3M6IHN0cmluZ1N0b3JlLFxuICAgIG5leHQ6IG5leHRTdGF0ZSxcbiAgICBjdXJyZW50OiBjdXJyZW50U3RhdGUsXG4gICAgZHJhdzogZHJhd1N0YXRlLFxuICAgIGVsZW1lbnRzOiBlbGVtZW50U3RhdGUsXG4gICAgYnVmZmVyOiBidWZmZXJTdGF0ZSxcbiAgICBzaGFkZXI6IHNoYWRlclN0YXRlLFxuICAgIGF0dHJpYnV0ZXM6IGF0dHJpYnV0ZVN0YXRlLnN0YXRlLFxuICAgIHVuaWZvcm1zOiB1bmlmb3JtU3RhdGUsXG4gICAgZnJhbWVidWZmZXI6IGZyYW1lYnVmZmVyU3RhdGUsXG4gICAgZXh0ZW5zaW9uczogZXh0ZW5zaW9ucyxcblxuICAgIGlzQnVmZmVyQXJnczogaXNCdWZmZXJBcmdzXG4gIH1cblxuICB2YXIgc2hhcmVkQ29uc3RhbnRzID0ge1xuICAgIHByaW1UeXBlczogcHJpbVR5cGVzLFxuICAgIGNvbXBhcmVGdW5jczogY29tcGFyZUZ1bmNzLFxuICAgIGJsZW5kRnVuY3M6IGJsZW5kRnVuY3MsXG4gICAgYmxlbmRFcXVhdGlvbnM6IGJsZW5kRXF1YXRpb25zLFxuICAgIHN0ZW5jaWxPcHM6IHN0ZW5jaWxPcHMsXG4gICAgZ2xUeXBlczogZ2xUeXBlcyxcbiAgICBvcmllbnRhdGlvblR5cGU6IG9yaWVudGF0aW9uVHlwZVxuICB9XG5cbiAgaWYgKGV4dERyYXdCdWZmZXJzKSB7XG4gICAgc2hhcmVkQ29uc3RhbnRzLmJhY2tCdWZmZXIgPSBbR0xfQkFDS11cbiAgICBzaGFyZWRDb25zdGFudHMuZHJhd0J1ZmZlciA9IGxvb3AobGltaXRzLm1heERyYXdidWZmZXJzLCBmdW5jdGlvbiAoaSkge1xuICAgICAgcmV0dXJuIGxvb3AoaSwgZnVuY3Rpb24gKGopIHtcbiAgICAgICAgcmV0dXJuIEdMX0NPTE9SX0FUVEFDSE1FTlQwICsgalxuICAgICAgfSlcbiAgICB9KVxuICB9XG5cbiAgdmFyIGRyYXdDYWxsQ291bnRlciA9IDBcbiAgZnVuY3Rpb24gY3JlYXRlUkVHTEVudmlyb25tZW50ICgpIHtcbiAgICB2YXIgZW52ID0gY3JlYXRlRW52aXJvbm1lbnQoKVxuICAgIHZhciBsaW5rID0gZW52LmxpbmtcbiAgICB2YXIgZ2xvYmFsID0gZW52Lmdsb2JhbFxuICAgIGVudi5pZCA9IGRyYXdDYWxsQ291bnRlcisrXG5cbiAgICBlbnYuYmF0Y2hJZCA9ICcwJ1xuXG4gICAgLy8gbGluayBzaGFyZWQgc3RhdGVcbiAgICB2YXIgU0hBUkVEID0gbGluayhzaGFyZWRTdGF0ZSlcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZCA9IHtcbiAgICAgIHByb3BzOiAnYTAnXG4gICAgfVxuICAgIE9iamVjdC5rZXlzKHNoYXJlZFN0YXRlKS5mb3JFYWNoKGZ1bmN0aW9uIChwcm9wKSB7XG4gICAgICBzaGFyZWRbcHJvcF0gPSBnbG9iYWwuZGVmKFNIQVJFRCwgJy4nLCBwcm9wKVxuICAgIH0pXG5cbiAgICAvLyBJbmplY3QgcnVudGltZSBhc3NlcnRpb24gc3R1ZmYgZm9yIGRlYnVnIGJ1aWxkc1xuICAgIFxuXG4gICAgLy8gQ29weSBHTCBzdGF0ZSB2YXJpYWJsZXMgb3ZlclxuICAgIHZhciBuZXh0VmFycyA9IGVudi5uZXh0ID0ge31cbiAgICB2YXIgY3VycmVudFZhcnMgPSBlbnYuY3VycmVudCA9IHt9XG4gICAgT2JqZWN0LmtleXMoR0xfVkFSSUFCTEVTKS5mb3JFYWNoKGZ1bmN0aW9uICh2YXJpYWJsZSkge1xuICAgICAgaWYgKEFycmF5LmlzQXJyYXkoY3VycmVudFN0YXRlW3ZhcmlhYmxlXSkpIHtcbiAgICAgICAgbmV4dFZhcnNbdmFyaWFibGVdID0gZ2xvYmFsLmRlZihzaGFyZWQubmV4dCwgJy4nLCB2YXJpYWJsZSlcbiAgICAgICAgY3VycmVudFZhcnNbdmFyaWFibGVdID0gZ2xvYmFsLmRlZihzaGFyZWQuY3VycmVudCwgJy4nLCB2YXJpYWJsZSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8gSW5pdGlhbGl6ZSBzaGFyZWQgY29uc3RhbnRzXG4gICAgdmFyIGNvbnN0YW50cyA9IGVudi5jb25zdGFudHMgPSB7fVxuICAgIE9iamVjdC5rZXlzKHNoYXJlZENvbnN0YW50cykuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgY29uc3RhbnRzW25hbWVdID0gZ2xvYmFsLmRlZihKU09OLnN0cmluZ2lmeShzaGFyZWRDb25zdGFudHNbbmFtZV0pKVxuICAgIH0pXG5cbiAgICAvLyBIZWxwZXIgZnVuY3Rpb24gZm9yIGNhbGxpbmcgYSBibG9ja1xuICAgIGVudi5pbnZva2UgPSBmdW5jdGlvbiAoYmxvY2ssIHgpIHtcbiAgICAgIHN3aXRjaCAoeC50eXBlKSB7XG4gICAgICAgIGNhc2UgRFlOX0ZVTkM6XG4gICAgICAgICAgdmFyIGFyZ0xpc3QgPSBbXG4gICAgICAgICAgICAndGhpcycsXG4gICAgICAgICAgICBzaGFyZWQuY29udGV4dCxcbiAgICAgICAgICAgIHNoYXJlZC5wcm9wcyxcbiAgICAgICAgICAgIGVudi5iYXRjaElkXG4gICAgICAgICAgXVxuICAgICAgICAgIHJldHVybiBibG9jay5kZWYoXG4gICAgICAgICAgICBsaW5rKHguZGF0YSksICcuY2FsbCgnLFxuICAgICAgICAgICAgICBhcmdMaXN0LnNsaWNlKDAsIE1hdGgubWF4KHguZGF0YS5sZW5ndGggKyAxLCA0KSksXG4gICAgICAgICAgICAgJyknKVxuICAgICAgICBjYXNlIERZTl9QUk9QOlxuICAgICAgICAgIHJldHVybiBibG9jay5kZWYoc2hhcmVkLnByb3BzLCB4LmRhdGEpXG4gICAgICAgIGNhc2UgRFlOX0NPTlRFWFQ6XG4gICAgICAgICAgcmV0dXJuIGJsb2NrLmRlZihzaGFyZWQuY29udGV4dCwgeC5kYXRhKVxuICAgICAgICBjYXNlIERZTl9TVEFURTpcbiAgICAgICAgICByZXR1cm4gYmxvY2suZGVmKCd0aGlzJywgeC5kYXRhKVxuICAgICAgfVxuICAgIH1cblxuICAgIGVudi5hdHRyaWJDYWNoZSA9IHt9XG5cbiAgICB2YXIgc2NvcGVBdHRyaWJzID0ge31cbiAgICBlbnYuc2NvcGVBdHRyaWIgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgICAgdmFyIGlkID0gc3RyaW5nU3RvcmUuaWQobmFtZSlcbiAgICAgIGlmIChpZCBpbiBzY29wZUF0dHJpYnMpIHtcbiAgICAgICAgcmV0dXJuIHNjb3BlQXR0cmlic1tpZF1cbiAgICAgIH1cbiAgICAgIHZhciBiaW5kaW5nID0gYXR0cmlidXRlU3RhdGUuc2NvcGVbaWRdXG4gICAgICBpZiAoIWJpbmRpbmcpIHtcbiAgICAgICAgYmluZGluZyA9IGF0dHJpYnV0ZVN0YXRlLnNjb3BlW2lkXSA9IG5ldyBBdHRyaWJ1dGVSZWNvcmQoKVxuICAgICAgfVxuICAgICAgdmFyIHJlc3VsdCA9IHNjb3BlQXR0cmlic1tpZF0gPSBsaW5rKGJpbmRpbmcpXG4gICAgICByZXR1cm4gcmVzdWx0XG4gICAgfVxuXG4gICAgcmV0dXJuIGVudlxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBQQVJTSU5HXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgZnVuY3Rpb24gcGFyc2VGcmFtZWJ1ZmZlciAob3B0aW9ucykge1xuICAgIHZhciBzdGF0aWNPcHRpb25zID0gb3B0aW9ucy5zdGF0aWNcbiAgICB2YXIgZHluYW1pY09wdGlvbnMgPSBvcHRpb25zLmR5bmFtaWNcblxuICAgIGlmIChTX0ZSQU1FQlVGRkVSIGluIHN0YXRpY09wdGlvbnMpIHtcbiAgICAgIHZhciBmcmFtZWJ1ZmZlciA9IHN0YXRpY09wdGlvbnNbU19GUkFNRUJVRkZFUl1cbiAgICAgIGlmIChmcmFtZWJ1ZmZlcikge1xuICAgICAgICBmcmFtZWJ1ZmZlciA9IGZyYW1lYnVmZmVyU3RhdGUuZ2V0RnJhbWVidWZmZXIoZnJhbWVidWZmZXIpXG4gICAgICAgIFxuICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBibG9jaykge1xuICAgICAgICAgIHZhciBGUkFNRUJVRkZFUiA9IGVudi5saW5rKGZyYW1lYnVmZmVyKVxuICAgICAgICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgICAgICAgYmxvY2suc2V0KFxuICAgICAgICAgICAgc2hhcmVkLmZyYW1lYnVmZmVyLFxuICAgICAgICAgICAgJy5uZXh0JyxcbiAgICAgICAgICAgIEZSQU1FQlVGRkVSKVxuICAgICAgICAgIHZhciBDT05URVhUID0gc2hhcmVkLmNvbnRleHRcbiAgICAgICAgICBibG9jay5zZXQoXG4gICAgICAgICAgICBDT05URVhULFxuICAgICAgICAgICAgJy4nICsgU19GUkFNRUJVRkZFUl9XSURUSCxcbiAgICAgICAgICAgIEZSQU1FQlVGRkVSICsgJy53aWR0aCcpXG4gICAgICAgICAgYmxvY2suc2V0KFxuICAgICAgICAgICAgQ09OVEVYVCxcbiAgICAgICAgICAgICcuJyArIFNfRlJBTUVCVUZGRVJfSEVJR0hULFxuICAgICAgICAgICAgRlJBTUVCVUZGRVIgKyAnLmhlaWdodCcpXG4gICAgICAgICAgcmV0dXJuIEZSQU1FQlVGRkVSXG4gICAgICAgIH0pXG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgICAgICAgc2NvcGUuc2V0KFxuICAgICAgICAgICAgc2hhcmVkLmZyYW1lYnVmZmVyLFxuICAgICAgICAgICAgJy5uZXh0JyxcbiAgICAgICAgICAgICdudWxsJylcbiAgICAgICAgICB2YXIgQ09OVEVYVCA9IHNoYXJlZC5jb250ZXh0XG4gICAgICAgICAgc2NvcGUuc2V0KFxuICAgICAgICAgICAgQ09OVEVYVCxcbiAgICAgICAgICAgICcuJyArIFNfRlJBTUVCVUZGRVJfV0lEVEgsXG4gICAgICAgICAgICBDT05URVhUICsgJy4nICsgU19EUkFXSU5HQlVGRkVSX1dJRFRIKVxuICAgICAgICAgIHNjb3BlLnNldChcbiAgICAgICAgICAgIENPTlRFWFQsXG4gICAgICAgICAgICAnLicgKyBTX0ZSQU1FQlVGRkVSX0hFSUdIVCxcbiAgICAgICAgICAgIENPTlRFWFQgKyAnLicgKyBTX0RSQVdJTkdCVUZGRVJfSEVJR0hUKVxuICAgICAgICAgIHJldHVybiBudWxsXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChTX0ZSQU1FQlVGRkVSIGluIGR5bmFtaWNPcHRpb25zKSB7XG4gICAgICB2YXIgZHluID0gZHluYW1pY09wdGlvbnNbU19GUkFNRUJVRkZFUl1cbiAgICAgIHJldHVybiBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgIHZhciBGUkFNRUJVRkZFUl9GVU5DID0gZW52Lmludm9rZShzY29wZSwgZHluKVxuICAgICAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuICAgICAgICB2YXIgRlJBTUVCVUZGRVJfU1RBVEUgPSBzaGFyZWQuZnJhbWVidWZmZXJcbiAgICAgICAgdmFyIEZSQU1FQlVGRkVSID0gc2NvcGUuZGVmKFxuICAgICAgICAgIEZSQU1FQlVGRkVSX1NUQVRFLCAnLmdldEZyYW1lYnVmZmVyKCcsIEZSQU1FQlVGRkVSX0ZVTkMsICcpJylcblxuICAgICAgICBcblxuICAgICAgICBzY29wZS5zZXQoXG4gICAgICAgICAgRlJBTUVCVUZGRVJfU1RBVEUsXG4gICAgICAgICAgJy5uZXh0JyxcbiAgICAgICAgICBGUkFNRUJVRkZFUilcbiAgICAgICAgdmFyIENPTlRFWFQgPSBzaGFyZWQuY29udGV4dFxuICAgICAgICBzY29wZS5zZXQoXG4gICAgICAgICAgQ09OVEVYVCxcbiAgICAgICAgICAnLicgKyBTX0ZSQU1FQlVGRkVSX1dJRFRILFxuICAgICAgICAgIEZSQU1FQlVGRkVSICsgJz8nICsgRlJBTUVCVUZGRVIgKyAnLndpZHRoOicgK1xuICAgICAgICAgIENPTlRFWFQgKyAnLicgKyBTX0RSQVdJTkdCVUZGRVJfV0lEVEgpXG4gICAgICAgIHNjb3BlLnNldChcbiAgICAgICAgICBDT05URVhULFxuICAgICAgICAgICcuJyArIFNfRlJBTUVCVUZGRVJfSEVJR0hULFxuICAgICAgICAgIEZSQU1FQlVGRkVSICtcbiAgICAgICAgICAnPycgKyBGUkFNRUJVRkZFUiArICcuaGVpZ2h0OicgK1xuICAgICAgICAgIENPTlRFWFQgKyAnLicgKyBTX0RSQVdJTkdCVUZGRVJfSEVJR0hUKVxuICAgICAgICByZXR1cm4gRlJBTUVCVUZGRVJcbiAgICAgIH0pXG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VWaWV3cG9ydFNjaXNzb3IgKG9wdGlvbnMsIGZyYW1lYnVmZmVyKSB7XG4gICAgdmFyIHN0YXRpY09wdGlvbnMgPSBvcHRpb25zLnN0YXRpY1xuICAgIHZhciBkeW5hbWljT3B0aW9ucyA9IG9wdGlvbnMuZHluYW1pY1xuXG4gICAgZnVuY3Rpb24gcGFyc2VCb3ggKHBhcmFtKSB7XG4gICAgICBpZiAocGFyYW0gaW4gc3RhdGljT3B0aW9ucykge1xuICAgICAgICB2YXIgYm94ID0gc3RhdGljT3B0aW9uc1twYXJhbV1cbiAgICAgICAgXG5cbiAgICAgICAgdmFyIGlzU3RhdGljID0gdHJ1ZVxuICAgICAgICB2YXIgeCA9IGJveC54IHwgMFxuICAgICAgICB2YXIgeSA9IGJveC55IHwgMFxuICAgICAgICB2YXIgdywgaFxuICAgICAgICBpZiAoJ3cnIGluIGJveCkge1xuICAgICAgICAgIHcgPSBib3gudyB8IDBcbiAgICAgICAgICBcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpc1N0YXRpYyA9IGZhbHNlXG4gICAgICAgIH1cbiAgICAgICAgaWYgKCdoJyBpbiBib3gpIHtcbiAgICAgICAgICBoID0gYm94LmggfCAwXG4gICAgICAgICAgXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaXNTdGF0aWMgPSBmYWxzZVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG5ldyBEZWNsYXJhdGlvbihcbiAgICAgICAgICBpc1N0YXRpYyAmJiBmcmFtZWJ1ZmZlciAmJiBmcmFtZWJ1ZmZlci50aGlzRGVwLFxuICAgICAgICAgIGlzU3RhdGljICYmIGZyYW1lYnVmZmVyICYmIGZyYW1lYnVmZmVyLmNvbnRleHREZXAsXG4gICAgICAgICAgaXNTdGF0aWMgJiYgZnJhbWVidWZmZXIgJiYgZnJhbWVidWZmZXIucHJvcERlcCxcbiAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgICAgdmFyIENPTlRFWFQgPSBlbnYuc2hhcmVkLmNvbnRleHRcbiAgICAgICAgICAgIHZhciBCT1hfVyA9IHdcbiAgICAgICAgICAgIGlmICghKCd3JyBpbiBib3gpKSB7XG4gICAgICAgICAgICAgIEJPWF9XID0gc2NvcGUuZGVmKENPTlRFWFQsICcuJywgU19GUkFNRUJVRkZFUl9XSURUSCwgJy0nLCB4KVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIEJPWF9IID0gaFxuICAgICAgICAgICAgaWYgKCEoJ2gnIGluIGJveCkpIHtcbiAgICAgICAgICAgICAgQk9YX0ggPSBzY29wZS5kZWYoQ09OVEVYVCwgJy4nLCBTX0ZSQU1FQlVGRkVSX0hFSUdIVCwgJy0nLCB5KVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIFt4LCB5LCBCT1hfVywgQk9YX0hdXG4gICAgICAgICAgfSlcbiAgICAgIH0gZWxzZSBpZiAocGFyYW0gaW4gZHluYW1pY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIGR5bkJveCA9IGR5bmFtaWNPcHRpb25zW3BhcmFtXVxuICAgICAgICB2YXIgcmVzdWx0ID0gY3JlYXRlRHluYW1pY0RlY2woZHluQm94LCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciBCT1ggPSBlbnYuaW52b2tlKHNjb3BlLCBkeW5Cb3gpXG5cbiAgICAgICAgICBcblxuICAgICAgICAgIHZhciBDT05URVhUID0gZW52LnNoYXJlZC5jb250ZXh0XG4gICAgICAgICAgdmFyIEJPWF9YID0gc2NvcGUuZGVmKEJPWCwgJy54fDAnKVxuICAgICAgICAgIHZhciBCT1hfWSA9IHNjb3BlLmRlZihCT1gsICcueXwwJylcbiAgICAgICAgICB2YXIgQk9YX1cgPSBzY29wZS5kZWYoXG4gICAgICAgICAgICAnXCJ3XCIgaW4gJywgQk9YLCAnPycsIEJPWCwgJy53fDA6JyxcbiAgICAgICAgICAgICcoJywgQ09OVEVYVCwgJy4nLCBTX0ZSQU1FQlVGRkVSX1dJRFRILCAnLScsIEJPWF9YLCAnKScpXG4gICAgICAgICAgdmFyIEJPWF9IID0gc2NvcGUuZGVmKFxuICAgICAgICAgICAgJ1wiaFwiIGluICcsIEJPWCwgJz8nLCBCT1gsICcuaHwwOicsXG4gICAgICAgICAgICAnKCcsIENPTlRFWFQsICcuJywgU19GUkFNRUJVRkZFUl9IRUlHSFQsICctJywgQk9YX1ksICcpJylcblxuICAgICAgICAgIFxuXG4gICAgICAgICAgcmV0dXJuIFtCT1hfWCwgQk9YX1ksIEJPWF9XLCBCT1hfSF1cbiAgICAgICAgfSlcbiAgICAgICAgaWYgKGZyYW1lYnVmZmVyKSB7XG4gICAgICAgICAgcmVzdWx0LnRoaXNEZXAgPSByZXN1bHQudGhpc0RlcCB8fCBmcmFtZWJ1ZmZlci50aGlzRGVwXG4gICAgICAgICAgcmVzdWx0LmNvbnRleHREZXAgPSByZXN1bHQuY29udGV4dERlcCB8fCBmcmFtZWJ1ZmZlci5jb250ZXh0RGVwXG4gICAgICAgICAgcmVzdWx0LnByb3BEZXAgPSByZXN1bHQucHJvcERlcCB8fCBmcmFtZWJ1ZmZlci5wcnBvRGVwXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgfSBlbHNlIGlmIChmcmFtZWJ1ZmZlcikge1xuICAgICAgICByZXR1cm4gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgICAgIGZyYW1lYnVmZmVyLnRoaXNEZXAsXG4gICAgICAgICAgZnJhbWVidWZmZXIuY29udGV4dERlcCxcbiAgICAgICAgICBmcmFtZWJ1ZmZlci5wcm9wRGVwLFxuICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgICB2YXIgQ09OVEVYVCA9IGVudi5zaGFyZWQuY29udGV4dFxuICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgMCwgMCxcbiAgICAgICAgICAgICAgc2NvcGUuZGVmKENPTlRFWFQsICcuJywgU19GUkFNRUJVRkZFUl9XSURUSCksXG4gICAgICAgICAgICAgIHNjb3BlLmRlZihDT05URVhULCAnLicsIFNfRlJBTUVCVUZGRVJfSEVJR0hUKV1cbiAgICAgICAgICB9KVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIG51bGxcbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgdmlld3BvcnQgPSBwYXJzZUJveChTX1ZJRVdQT1JUKVxuXG4gICAgaWYgKHZpZXdwb3J0KSB7XG4gICAgICB2YXIgcHJldlZpZXdwb3J0ID0gdmlld3BvcnRcbiAgICAgIHZpZXdwb3J0ID0gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgICB2aWV3cG9ydC50aGlzRGVwLFxuICAgICAgICB2aWV3cG9ydC5jb250ZXh0RGVwLFxuICAgICAgICB2aWV3cG9ydC5wcm9wRGVwLFxuICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciBWSUVXUE9SVCA9IHByZXZWaWV3cG9ydC5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgICAgICB2YXIgQ09OVEVYVCA9IGVudi5zaGFyZWQuY29udGV4dFxuICAgICAgICAgIHNjb3BlLnNldChcbiAgICAgICAgICAgIENPTlRFWFQsXG4gICAgICAgICAgICAnLicgKyBTX1ZJRVdQT1JUX1dJRFRILFxuICAgICAgICAgICAgVklFV1BPUlRbMl0pXG4gICAgICAgICAgc2NvcGUuc2V0KFxuICAgICAgICAgICAgQ09OVEVYVCxcbiAgICAgICAgICAgICcuJyArIFNfVklFV1BPUlRfSEVJR0hULFxuICAgICAgICAgICAgVklFV1BPUlRbM10pXG4gICAgICAgICAgcmV0dXJuIFZJRVdQT1JUXG4gICAgICAgIH0pXG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIHZpZXdwb3J0OiB2aWV3cG9ydCxcbiAgICAgIHNjaXNzb3JfYm94OiBwYXJzZUJveChTX1NDSVNTT1JfQk9YKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlUHJvZ3JhbSAob3B0aW9ucykge1xuICAgIHZhciBzdGF0aWNPcHRpb25zID0gb3B0aW9ucy5zdGF0aWNcbiAgICB2YXIgZHluYW1pY09wdGlvbnMgPSBvcHRpb25zLmR5bmFtaWNcblxuICAgIGZ1bmN0aW9uIHBhcnNlU2hhZGVyIChuYW1lKSB7XG4gICAgICBpZiAobmFtZSBpbiBzdGF0aWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBpZCA9IHN0cmluZ1N0b3JlLmlkKHN0YXRpY09wdGlvbnNbbmFtZV0pXG4gICAgICAgIFxuICAgICAgICB2YXIgcmVzdWx0ID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcmV0dXJuIGlkXG4gICAgICAgIH0pXG4gICAgICAgIHJlc3VsdC5pZCA9IGlkXG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH0gZWxzZSBpZiAobmFtZSBpbiBkeW5hbWljT3B0aW9ucykge1xuICAgICAgICB2YXIgZHluID0gZHluYW1pY09wdGlvbnNbbmFtZV1cbiAgICAgICAgcmV0dXJuIGNyZWF0ZUR5bmFtaWNEZWNsKGR5biwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICB2YXIgc3RyID0gZW52Lmludm9rZShzY29wZSwgZHluKVxuICAgICAgICAgIHZhciBpZCA9IHNjb3BlLmRlZihlbnYuc2hhcmVkLnN0cmluZ3MsICcuaWQoJywgc3RyLCAnKScpXG4gICAgICAgICAgXG4gICAgICAgICAgcmV0dXJuIGlkXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cblxuICAgIHZhciBmcmFnID0gcGFyc2VTaGFkZXIoU19GUkFHKVxuICAgIHZhciB2ZXJ0ID0gcGFyc2VTaGFkZXIoU19WRVJUKVxuXG4gICAgdmFyIHByb2dyYW0gPSBudWxsXG4gICAgdmFyIHByb2dWYXJcbiAgICBpZiAoaXNTdGF0aWMoZnJhZykgJiYgaXNTdGF0aWModmVydCkpIHtcbiAgICAgIHByb2dyYW0gPSBzaGFkZXJTdGF0ZS5wcm9ncmFtKHZlcnQuaWQsIGZyYWcuaWQpXG4gICAgICBwcm9nVmFyID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICByZXR1cm4gZW52LmxpbmsocHJvZ3JhbSlcbiAgICAgIH0pXG4gICAgfSBlbHNlIHtcbiAgICAgIHByb2dWYXIgPSBuZXcgRGVjbGFyYXRpb24oXG4gICAgICAgIChmcmFnICYmIGZyYWcudGhpc0RlcCkgfHwgKHZlcnQgJiYgdmVydC50aGlzRGVwKSxcbiAgICAgICAgKGZyYWcgJiYgZnJhZy5jb250ZXh0RGVwKSB8fCAodmVydCAmJiB2ZXJ0LmNvbnRleHREZXApLFxuICAgICAgICAoZnJhZyAmJiBmcmFnLnByb3BEZXApIHx8ICh2ZXJ0ICYmIHZlcnQucHJvcERlcCksXG4gICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgdmFyIFNIQURFUl9TVEFURSA9IGVudi5zaGFyZWQuc2hhZGVyXG4gICAgICAgICAgdmFyIGZyYWdJZFxuICAgICAgICAgIGlmIChmcmFnKSB7XG4gICAgICAgICAgICBmcmFnSWQgPSBmcmFnLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBmcmFnSWQgPSBzY29wZS5kZWYoU0hBREVSX1NUQVRFLCAnLicsIFNfRlJBRylcbiAgICAgICAgICB9XG4gICAgICAgICAgdmFyIHZlcnRJZFxuICAgICAgICAgIGlmICh2ZXJ0KSB7XG4gICAgICAgICAgICB2ZXJ0SWQgPSB2ZXJ0LmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2ZXJ0SWQgPSBzY29wZS5kZWYoU0hBREVSX1NUQVRFLCAnLicsIFNfVkVSVClcbiAgICAgICAgICB9XG4gICAgICAgICAgdmFyIHByb2dEZWYgPSBTSEFERVJfU1RBVEUgKyAnLnByb2dyYW0oJyArIHZlcnRJZCArICcsJyArIGZyYWdJZFxuICAgICAgICAgIFxuICAgICAgICAgIHJldHVybiBzY29wZS5kZWYocHJvZ0RlZiArICcpJylcbiAgICAgICAgfSlcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgZnJhZzogZnJhZyxcbiAgICAgIHZlcnQ6IHZlcnQsXG4gICAgICBwcm9nVmFyOiBwcm9nVmFyLFxuICAgICAgcHJvZ3JhbTogcHJvZ3JhbVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlRHJhdyAob3B0aW9ucykge1xuICAgIHZhciBzdGF0aWNPcHRpb25zID0gb3B0aW9ucy5zdGF0aWNcbiAgICB2YXIgZHluYW1pY09wdGlvbnMgPSBvcHRpb25zLmR5bmFtaWNcblxuICAgIGZ1bmN0aW9uIHBhcnNlRWxlbWVudHMgKCkge1xuICAgICAgaWYgKFNfRUxFTUVOVFMgaW4gc3RhdGljT3B0aW9ucykge1xuICAgICAgICB2YXIgZWxlbWVudHMgPSBzdGF0aWNPcHRpb25zW1NfRUxFTUVOVFNdXG4gICAgICAgIGlmIChpc0J1ZmZlckFyZ3MoZWxlbWVudHMpKSB7XG4gICAgICAgICAgZWxlbWVudHMgPSBlbGVtZW50U3RhdGUuZ2V0RWxlbWVudHMoZWxlbWVudFN0YXRlLmNyZWF0ZShlbGVtZW50cykpXG4gICAgICAgIH0gZWxzZSBpZiAoZWxlbWVudHMpIHtcbiAgICAgICAgICBlbGVtZW50cyA9IGVsZW1lbnRTdGF0ZS5nZXRFbGVtZW50cyhlbGVtZW50cylcbiAgICAgICAgICBcbiAgICAgICAgfVxuICAgICAgICB2YXIgcmVzdWx0ID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIGlmIChlbGVtZW50cykge1xuICAgICAgICAgICAgdmFyIHJlc3VsdCA9IGVudi5saW5rKGVsZW1lbnRzKVxuICAgICAgICAgICAgZW52LkVMRU1FTlRTID0gcmVzdWx0XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICAgICAgfVxuICAgICAgICAgIGVudi5FTEVNRU5UUyA9IG51bGxcbiAgICAgICAgICByZXR1cm4gbnVsbFxuICAgICAgICB9KVxuICAgICAgICByZXN1bHQudmFsdWUgPSBlbGVtZW50c1xuICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICB9IGVsc2UgaWYgKFNfRUxFTUVOVFMgaW4gZHluYW1pY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIGR5biA9IGR5bmFtaWNPcHRpb25zW1NfRUxFTUVOVFNdXG4gICAgICAgIHJldHVybiBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcblxuICAgICAgICAgIHZhciBJU19CVUZGRVJfQVJHUyA9IHNoYXJlZC5pc0J1ZmZlckFyZ3NcbiAgICAgICAgICB2YXIgRUxFTUVOVF9TVEFURSA9IHNoYXJlZC5lbGVtZW50c1xuXG4gICAgICAgICAgdmFyIGVsZW1lbnREZWZuID0gZW52Lmludm9rZShzY29wZSwgZHluKVxuICAgICAgICAgIHZhciBlbGVtZW50cyA9IHNjb3BlLmRlZignbnVsbCcpXG4gICAgICAgICAgdmFyIGVsZW1lbnRTdHJlYW0gPSBzY29wZS5kZWYoSVNfQlVGRkVSX0FSR1MsICcoJywgZWxlbWVudERlZm4sICcpJylcblxuICAgICAgICAgIHZhciBpZnRlID0gZW52LmNvbmQoZWxlbWVudFN0cmVhbSlcbiAgICAgICAgICAgIC50aGVuKGVsZW1lbnRzLCAnPScsIEVMRU1FTlRfU1RBVEUsICcuY3JlYXRlU3RyZWFtKCcsIGVsZW1lbnREZWZuLCAnKTsnKVxuICAgICAgICAgICAgLmVsc2UoZWxlbWVudHMsICc9JywgRUxFTUVOVF9TVEFURSwgJy5nZXRFbGVtZW50cygnLCBlbGVtZW50RGVmbiwgJyk7JylcblxuICAgICAgICAgIFxuXG4gICAgICAgICAgc2NvcGUuZW50cnkoaWZ0ZSlcbiAgICAgICAgICBzY29wZS5leGl0KFxuICAgICAgICAgICAgZW52LmNvbmQoZWxlbWVudFN0cmVhbSlcbiAgICAgICAgICAgICAgLnRoZW4oRUxFTUVOVF9TVEFURSwgJy5kZXN0cm95U3RyZWFtKCcsIGVsZW1lbnRzLCAnKTsnKSlcblxuICAgICAgICAgIGVudi5FTEVNRU5UUyA9IGVsZW1lbnRzXG5cbiAgICAgICAgICByZXR1cm4gZWxlbWVudHNcbiAgICAgICAgfSlcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG5cbiAgICB2YXIgZWxlbWVudHMgPSBwYXJzZUVsZW1lbnRzKClcblxuICAgIGZ1bmN0aW9uIHBhcnNlUHJpbWl0aXZlICgpIHtcbiAgICAgIGlmIChTX1BSSU1JVElWRSBpbiBzdGF0aWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBwcmltaXRpdmUgPSBzdGF0aWNPcHRpb25zW1NfUFJJTUlUSVZFXVxuICAgICAgICBcbiAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICByZXR1cm4gcHJpbVR5cGVzW3ByaW1pdGl2ZV1cbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSBpZiAoU19QUklNSVRJVkUgaW4gZHluYW1pY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIGR5blByaW1pdGl2ZSA9IGR5bmFtaWNPcHRpb25zW1NfUFJJTUlUSVZFXVxuICAgICAgICByZXR1cm4gY3JlYXRlRHluYW1pY0RlY2woZHluUHJpbWl0aXZlLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciBQUklNX1RZUEVTID0gZW52LmNvbnN0YW50cy5wcmltVHlwZXNcbiAgICAgICAgICB2YXIgcHJpbSA9IGVudi5pbnZva2Uoc2NvcGUsIGR5blByaW1pdGl2ZSlcbiAgICAgICAgICBcbiAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKFBSSU1fVFlQRVMsICdbJywgcHJpbSwgJ10nKVxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIGlmIChlbGVtZW50cykge1xuICAgICAgICBpZiAoaXNTdGF0aWMoZWxlbWVudHMpKSB7XG4gICAgICAgICAgaWYgKGVsZW1lbnRzLnZhbHVlKSB7XG4gICAgICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKGVudi5FTEVNRU5UUywgJy5wcmltVHlwZScpXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgIHJldHVybiBHTF9UUklBTkdMRVNcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBuZXcgRGVjbGFyYXRpb24oXG4gICAgICAgICAgICBlbGVtZW50cy50aGlzRGVwLFxuICAgICAgICAgICAgZWxlbWVudHMuY29udGV4dERlcCxcbiAgICAgICAgICAgIGVsZW1lbnRzLnByb3BEZXAsXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgICAgICB2YXIgZWxlbWVudHMgPSBlbnYuRUxFTUVOVFNcbiAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihlbGVtZW50cywgJz8nLCBlbGVtZW50cywgJy5wcmltVHlwZTonLCBHTF9UUklBTkdMRVMpXG4gICAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBhcnNlUGFyYW0gKHBhcmFtLCBpc09mZnNldCkge1xuICAgICAgaWYgKHBhcmFtIGluIHN0YXRpY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIHZhbHVlID0gc3RhdGljT3B0aW9uc1twYXJhbV0gfCAwXG4gICAgICAgIFxuICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIGlmIChpc09mZnNldCkge1xuICAgICAgICAgICAgZW52Lk9GRlNFVCA9IHZhbHVlXG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB2YWx1ZVxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIGlmIChwYXJhbSBpbiBkeW5hbWljT3B0aW9ucykge1xuICAgICAgICB2YXIgZHluVmFsdWUgPSBkeW5hbWljT3B0aW9uc1twYXJhbV1cbiAgICAgICAgcmV0dXJuIGNyZWF0ZUR5bmFtaWNEZWNsKGR5blZhbHVlLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciByZXN1bHQgPSBlbnYuaW52b2tlKHNjb3BlLCBkeW5WYWx1ZSlcbiAgICAgICAgICBpZiAoaXNPZmZzZXQpIHtcbiAgICAgICAgICAgIGVudi5PRkZTRVQgPSByZXN1bHRcbiAgICAgICAgICAgIFxuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICAgIH0pXG4gICAgICB9IGVsc2UgaWYgKGlzT2Zmc2V0ICYmIGVsZW1lbnRzKSB7XG4gICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgZW52Lk9GRlNFVCA9ICcwJ1xuICAgICAgICAgIHJldHVybiAwXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cblxuICAgIHZhciBPRkZTRVQgPSBwYXJzZVBhcmFtKFNfT0ZGU0VULCB0cnVlKVxuXG4gICAgZnVuY3Rpb24gcGFyc2VWZXJ0Q291bnQgKCkge1xuICAgICAgaWYgKFNfQ09VTlQgaW4gc3RhdGljT3B0aW9ucykge1xuICAgICAgICB2YXIgY291bnQgPSBzdGF0aWNPcHRpb25zW1NfQ09VTlRdIHwgMFxuICAgICAgICBcbiAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHJldHVybiBjb3VudFxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIGlmIChTX0NPVU5UIGluIGR5bmFtaWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBkeW5Db3VudCA9IGR5bmFtaWNPcHRpb25zW1NfQ09VTlRdXG4gICAgICAgIHJldHVybiBjcmVhdGVEeW5hbWljRGVjbChkeW5Db3VudCwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICB2YXIgcmVzdWx0ID0gZW52Lmludm9rZShzY29wZSwgZHluQ291bnQpXG4gICAgICAgICAgXG4gICAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIGlmIChlbGVtZW50cykge1xuICAgICAgICBpZiAoaXNTdGF0aWMoZWxlbWVudHMpKSB7XG4gICAgICAgICAgaWYgKGVsZW1lbnRzKSB7XG4gICAgICAgICAgICBpZiAoT0ZGU0VUKSB7XG4gICAgICAgICAgICAgIHJldHVybiBuZXcgRGVjbGFyYXRpb24oXG4gICAgICAgICAgICAgICAgT0ZGU0VULnRoaXNEZXAsXG4gICAgICAgICAgICAgICAgT0ZGU0VULmNvbnRleHREZXAsXG4gICAgICAgICAgICAgICAgT0ZGU0VULnByb3BEZXAsXG4gICAgICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICAgICAgICAgIHZhciByZXN1bHQgPSBzY29wZS5kZWYoXG4gICAgICAgICAgICAgICAgICAgIGVudi5FTEVNRU5UUywgJy52ZXJ0Q291bnQtJywgZW52Lk9GRlNFVClcblxuICAgICAgICAgICAgICAgICAgXG5cbiAgICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKGVudi5FTEVNRU5UUywgJy52ZXJ0Q291bnQnKVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgcmVzdWx0ID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgIHJldHVybiAtMVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB2YXIgdmFyaWFibGUgPSBuZXcgRGVjbGFyYXRpb24oXG4gICAgICAgICAgICBlbGVtZW50cy50aGlzRGVwIHx8IE9GRlNFVC50aGlzRGVwLFxuICAgICAgICAgICAgZWxlbWVudHMuY29udGV4dERlcCB8fCBPRkZTRVQuY29udGV4dERlcCxcbiAgICAgICAgICAgIGVsZW1lbnRzLnByb3BEZXAgfHwgT0ZGU0VULnByb3BEZXAsXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgICAgICB2YXIgZWxlbWVudHMgPSBlbnYuRUxFTUVOVFNcbiAgICAgICAgICAgICAgaWYgKGVudi5PRkZTRVQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKGVsZW1lbnRzLCAnPycsIGVsZW1lbnRzLCAnLnZlcnRDb3VudC0nLFxuICAgICAgICAgICAgICAgICAgZW52Lk9GRlNFVCwgJzotMScpXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihlbGVtZW50cywgJz8nLCBlbGVtZW50cywgJy52ZXJ0Q291bnQ6LTEnKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICBcbiAgICAgICAgICByZXR1cm4gdmFyaWFibGVcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgZWxlbWVudHM6IGVsZW1lbnRzLFxuICAgICAgcHJpbWl0aXZlOiBwYXJzZVByaW1pdGl2ZSgpLFxuICAgICAgY291bnQ6IHBhcnNlVmVydENvdW50KCksXG4gICAgICBpbnN0YW5jZXM6IHBhcnNlUGFyYW0oU19JTlNUQU5DRVMsIGZhbHNlKSxcbiAgICAgIG9mZnNldDogT0ZGU0VUXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VHTFN0YXRlIChvcHRpb25zKSB7XG4gICAgdmFyIHN0YXRpY09wdGlvbnMgPSBvcHRpb25zLnN0YXRpY1xuICAgIHZhciBkeW5hbWljT3B0aW9ucyA9IG9wdGlvbnMuZHluYW1pY1xuXG4gICAgdmFyIFNUQVRFID0ge31cblxuICAgIEdMX1NUQVRFX05BTUVTLmZvckVhY2goZnVuY3Rpb24gKHByb3ApIHtcbiAgICAgIHZhciBwYXJhbSA9IHByb3BOYW1lKHByb3ApXG5cbiAgICAgIGZ1bmN0aW9uIHBhcnNlUGFyYW0gKHBhcnNlU3RhdGljLCBwYXJzZUR5bmFtaWMpIHtcbiAgICAgICAgaWYgKHByb3AgaW4gc3RhdGljT3B0aW9ucykge1xuICAgICAgICAgIHZhciB2YWx1ZSA9IHBhcnNlU3RhdGljKHN0YXRpY09wdGlvbnNbcHJvcF0pXG4gICAgICAgICAgU1RBVEVbcGFyYW1dID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gdmFsdWVcbiAgICAgICAgICB9KVxuICAgICAgICB9IGVsc2UgaWYgKHByb3AgaW4gZHluYW1pY09wdGlvbnMpIHtcbiAgICAgICAgICB2YXIgZHluID0gZHluYW1pY09wdGlvbnNbcHJvcF1cbiAgICAgICAgICBTVEFURVtwYXJhbV0gPSBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgICByZXR1cm4gcGFyc2VEeW5hbWljKGVudiwgc2NvcGUsIGVudi5pbnZva2Uoc2NvcGUsIGR5bikpXG4gICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBzd2l0Y2ggKHByb3ApIHtcbiAgICAgICAgY2FzZSBTX0NVTExfRU5BQkxFOlxuICAgICAgICBjYXNlIFNfQkxFTkRfRU5BQkxFOlxuICAgICAgICBjYXNlIFNfRElUSEVSOlxuICAgICAgICBjYXNlIFNfU1RFTkNJTF9FTkFCTEU6XG4gICAgICAgIGNhc2UgU19ERVBUSF9FTkFCTEU6XG4gICAgICAgIGNhc2UgU19TQ0lTU09SX0VOQUJMRTpcbiAgICAgICAgY2FzZSBTX1BPTFlHT05fT0ZGU0VUX0VOQUJMRTpcbiAgICAgICAgY2FzZSBTX1NBTVBMRV9BTFBIQTpcbiAgICAgICAgY2FzZSBTX1NBTVBMRV9FTkFCTEU6XG4gICAgICAgIGNhc2UgU19ERVBUSF9NQVNLOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gdmFsdWVcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfREVQVEhfRlVOQzpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIGNvbXBhcmVGdW5jc1t2YWx1ZV1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgdmFyIENPTVBBUkVfRlVOQ1MgPSBlbnYuY29uc3RhbnRzLmNvbXBhcmVGdW5jc1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihDT01QQVJFX0ZVTkNTLCAnWycsIHZhbHVlLCAnXScpXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19ERVBUSF9SQU5HRTpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgIHZhciBaX05FQVIgPSBzY29wZS5kZWYoJysnLCB2YWx1ZSwgJ1swXScpXG4gICAgICAgICAgICAgIHZhciBaX0ZBUiA9IHNjb3BlLmRlZignKycsIHZhbHVlLCAnWzFdJylcbiAgICAgICAgICAgICAgcmV0dXJuIFtaX05FQVIsIFpfRkFSXVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfQkxFTkRfRlVOQzpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgdmFyIHNyY1JHQiA9ICgnc3JjUkdCJyBpbiB2YWx1ZSA/IHZhbHVlLnNyY1JHQiA6IHZhbHVlLnNyYylcbiAgICAgICAgICAgICAgdmFyIHNyY0FscGhhID0gKCdzcmNBbHBoYScgaW4gdmFsdWUgPyB2YWx1ZS5zcmNBbHBoYSA6IHZhbHVlLnNyYylcbiAgICAgICAgICAgICAgdmFyIGRzdFJHQiA9ICgnZHN0UkdCJyBpbiB2YWx1ZSA/IHZhbHVlLmRzdFJHQiA6IHZhbHVlLmRzdClcbiAgICAgICAgICAgICAgdmFyIGRzdEFscGhhID0gKCdkc3RBbHBoYScgaW4gdmFsdWUgPyB2YWx1ZS5kc3RBbHBoYSA6IHZhbHVlLmRzdClcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICAgICAgYmxlbmRGdW5jc1tzcmNSR0JdLFxuICAgICAgICAgICAgICAgIGJsZW5kRnVuY3NbZHN0UkdCXSxcbiAgICAgICAgICAgICAgICBibGVuZEZ1bmNzW3NyY0FscGhhXSxcbiAgICAgICAgICAgICAgICBibGVuZEZ1bmNzW2RzdEFscGhhXVxuICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIHZhciBCTEVORF9GVU5DUyA9IGVudi5jb25zdGFudHMuYmxlbmRGdW5jc1xuXG4gICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgIGZ1bmN0aW9uIHJlYWQgKHByZWZpeCwgc3VmZml4KSB7XG4gICAgICAgICAgICAgICAgdmFyIGZ1bmMgPSBzY29wZS5kZWYoXG4gICAgICAgICAgICAgICAgICAnXCInLCBwcmVmaXgsIHN1ZmZpeCwgJ1wiIGluICcsIHZhbHVlLFxuICAgICAgICAgICAgICAgICAgJz8nLCB2YWx1ZSwgJy4nLCBwcmVmaXgsIHN1ZmZpeCxcbiAgICAgICAgICAgICAgICAgICc6JywgdmFsdWUsICcuJywgcHJlZml4KVxuXG4gICAgICAgICAgICAgICAgXG5cbiAgICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKEJMRU5EX0ZVTkNTLCAnWycsIGZ1bmMsICddJylcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIHZhciBTUkNfUkdCID0gcmVhZCgnc3JjJywgJ1JHQicpXG4gICAgICAgICAgICAgIHZhciBTUkNfQUxQSEEgPSByZWFkKCdzcmMnLCAnQWxwaGEnKVxuICAgICAgICAgICAgICB2YXIgRFNUX1JHQiA9IHJlYWQoJ2RzdCcsICdSR0InKVxuICAgICAgICAgICAgICB2YXIgRFNUX0FMUEhBID0gcmVhZCgnZHN0JywgJ0FscGhhJylcblxuICAgICAgICAgICAgICByZXR1cm4gW1NSQ19SR0IsIERTVF9SR0IsIFNSQ19BTFBIQSwgRFNUX0FMUEhBXVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfQkxFTkRfRVFVQVRJT046XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgICAgICAgYmxlbmRFcXVhdGlvbnNbdmFsdWVdLFxuICAgICAgICAgICAgICAgICAgYmxlbmRFcXVhdGlvbnNbdmFsdWVdXG4gICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgICAgICAgYmxlbmRFcXVhdGlvbnNbdmFsdWUucmdiXSxcbiAgICAgICAgICAgICAgICAgIGJsZW5kRXF1YXRpb25zW3ZhbHVlLmFscGhhXVxuICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICB2YXIgQkxFTkRfRVFVQVRJT05TID0gZW52LmNvbnN0YW50cy5ibGVuZEVxdWF0aW9uc1xuXG4gICAgICAgICAgICAgIHZhciBSR0IgPSBzY29wZS5kZWYoKVxuICAgICAgICAgICAgICB2YXIgQUxQSEEgPSBzY29wZS5kZWYoKVxuXG4gICAgICAgICAgICAgIHZhciBpZnRlID0gZW52LmNvbmQoJ3R5cGVvZiAnLCB2YWx1ZSwgJz09PVwic3RyaW5nXCInKVxuXG4gICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgIGlmdGUudGhlbihcbiAgICAgICAgICAgICAgICBSR0IsICc9JywgQUxQSEEsICc9JywgQkxFTkRfRVFVQVRJT05TLCAnWycsIHZhbHVlLCAnXTsnKVxuICAgICAgICAgICAgICBpZnRlLmVsc2UoXG4gICAgICAgICAgICAgICAgUkdCLCAnPScsIEJMRU5EX0VRVUFUSU9OUywgJ1snLCB2YWx1ZSwgJy5yZ2JdOycsXG4gICAgICAgICAgICAgICAgQUxQSEEsICc9JywgQkxFTkRfRVFVQVRJT05TLCAnWycsIHZhbHVlLCAnLmFscGhhXTsnKVxuXG4gICAgICAgICAgICAgIHNjb3BlKGlmdGUpXG5cbiAgICAgICAgICAgICAgcmV0dXJuIFtSR0IsIEFMUEhBXVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfQkxFTkRfQ09MT1I6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBsb29wKDQsIGZ1bmN0aW9uIChpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICt2YWx1ZVtpXVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIGxvb3AoNCwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKCcrJywgdmFsdWUsICdbJywgaSwgJ10nKVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfU1RFTkNJTF9NQVNLOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gdmFsdWUgfCAwXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKHZhbHVlLCAnfDAnKVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfU1RFTkNJTF9GVU5DOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICB2YXIgY21wID0gdmFsdWUuY21wIHx8ICdrZWVwJ1xuICAgICAgICAgICAgICB2YXIgcmVmID0gdmFsdWUucmVmIHx8IDBcbiAgICAgICAgICAgICAgdmFyIG1hc2sgPSAnbWFzaycgaW4gdmFsdWUgPyB2YWx1ZS5tYXNrIDogLTFcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgICBjb21wYXJlRnVuY3NbY21wXSxcbiAgICAgICAgICAgICAgICByZWYsXG4gICAgICAgICAgICAgICAgbWFza1xuICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIHZhciBDT01QQVJFX0ZVTkNTID0gZW52LmNvbnN0YW50cy5jb21wYXJlRnVuY3NcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHZhciBjbXAgPSBzY29wZS5kZWYoXG4gICAgICAgICAgICAgICAgJ1wiY21wXCIgaW4gJywgdmFsdWUsXG4gICAgICAgICAgICAgICAgJz8nLCBDT01QQVJFX0ZVTkNTLCAnWycsIHZhbHVlLCAnLmNtcF0nLFxuICAgICAgICAgICAgICAgICc6JywgR0xfS0VFUClcbiAgICAgICAgICAgICAgdmFyIHJlZiA9IHNjb3BlLmRlZih2YWx1ZSwgJy5yZWZ8MCcpXG4gICAgICAgICAgICAgIHZhciBtYXNrID0gc2NvcGUuZGVmKFxuICAgICAgICAgICAgICAgICdcIm1hc2tcIiBpbiAnLCB2YWx1ZSxcbiAgICAgICAgICAgICAgICAnPycsIHZhbHVlLCAnLm1hc2t8MDotMScpXG4gICAgICAgICAgICAgIHJldHVybiBbY21wLCByZWYsIG1hc2tdXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19TVEVOQ0lMX09QRlJPTlQ6XG4gICAgICAgIGNhc2UgU19TVEVOQ0lMX09QQkFDSzpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgdmFyIGZhaWwgPSB2YWx1ZS5mYWlsIHx8ICdrZWVwJ1xuICAgICAgICAgICAgICB2YXIgemZhaWwgPSB2YWx1ZS56ZmFpbCB8fCAna2VlcCdcbiAgICAgICAgICAgICAgdmFyIHBhc3MgPSB2YWx1ZS5wYXNzIHx8ICdrZWVwJ1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgICAgIHByb3AgPT09IFNfU1RFTkNJTF9PUEJBQ0sgPyBHTF9CQUNLIDogR0xfRlJPTlQsXG4gICAgICAgICAgICAgICAgc3RlbmNpbE9wc1tmYWlsXSxcbiAgICAgICAgICAgICAgICBzdGVuY2lsT3BzW3pmYWlsXSxcbiAgICAgICAgICAgICAgICBzdGVuY2lsT3BzW3Bhc3NdXG4gICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgdmFyIFNURU5DSUxfT1BTID0gZW52LmNvbnN0YW50cy5zdGVuY2lsT3BzXG5cbiAgICAgICAgICAgICAgXG5cbiAgICAgICAgICAgICAgZnVuY3Rpb24gcmVhZCAobmFtZSkge1xuICAgICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihcbiAgICAgICAgICAgICAgICAgICdcIicsIG5hbWUsICdcIiBpbiAnLCB2YWx1ZSxcbiAgICAgICAgICAgICAgICAgICc/JywgU1RFTkNJTF9PUFMsICdbJywgdmFsdWUsICcuJywgbmFtZSwgJ106JyxcbiAgICAgICAgICAgICAgICAgIEdMX0tFRVApXG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgICAgIHByb3AgPT09IFNfU1RFTkNJTF9PUEJBQ0sgPyBHTF9CQUNLIDogR0xfRlJPTlQsXG4gICAgICAgICAgICAgICAgcmVhZCgnZmFpbCcpLFxuICAgICAgICAgICAgICAgIHJlYWQoJ3pmYWlsJyksXG4gICAgICAgICAgICAgICAgcmVhZCgncGFzcycpXG4gICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX1BPTFlHT05fT0ZGU0VUX09GRlNFVDpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgdmFyIGZhY3RvciA9IHZhbHVlLmZhY3RvciB8IDBcbiAgICAgICAgICAgICAgdmFyIHVuaXRzID0gdmFsdWUudW5pdHMgfCAwXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIFtmYWN0b3IsIHVuaXRzXVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBcblxuICAgICAgICAgICAgICB2YXIgRkFDVE9SID0gc2NvcGUuZGVmKHZhbHVlLCAnLmZhY3RvcnwwJylcbiAgICAgICAgICAgICAgdmFyIFVOSVRTID0gc2NvcGUuZGVmKHZhbHVlLCAnLnVuaXRzfDAnKVxuXG4gICAgICAgICAgICAgIHJldHVybiBbRkFDVE9SLCBVTklUU11cbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX0NVTExfRkFDRTpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICB2YXIgZmFjZSA9IDBcbiAgICAgICAgICAgICAgaWYgKHZhbHVlID09PSAnZnJvbnQnKSB7XG4gICAgICAgICAgICAgICAgZmFjZSA9IEdMX0ZST05UXG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAodmFsdWUgPT09ICdiYWNrJykge1xuICAgICAgICAgICAgICAgIGZhY2UgPSBHTF9CQUNLXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBmYWNlXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKHZhbHVlLCAnPT09XCJmcm9udFwiPycsIEdMX0ZST05ULCAnOicsIEdMX0JBQ0spXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19MSU5FX1dJRFRIOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gdmFsdWVcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgXG5cbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19GUk9OVF9GQUNFOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gb3JpZW50YXRpb25UeXBlW3ZhbHVlXVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZih2YWx1ZSArICc9PT1cImN3XCI/JyArIEdMX0NXICsgJzonICsgR0xfQ0NXKVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfQ09MT1JfTUFTSzpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlLm1hcChmdW5jdGlvbiAodikgeyByZXR1cm4gISF2IH0pXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gbG9vcCg0LCBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgICAgICAgIHJldHVybiAnISEnICsgdmFsdWUgKyAnWycgKyBpICsgJ10nXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19TQU1QTEVfQ09WRVJBR0U6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHZhciBzYW1wbGVWYWx1ZSA9ICd2YWx1ZScgaW4gdmFsdWUgPyB2YWx1ZS52YWx1ZSA6IDFcbiAgICAgICAgICAgICAgdmFyIHNhbXBsZUludmVydCA9ICEhdmFsdWUuaW52ZXJ0XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gW3NhbXBsZVZhbHVlLCBzYW1wbGVJbnZlcnRdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICB2YXIgVkFMVUUgPSBzY29wZS5kZWYoXG4gICAgICAgICAgICAgICAgJ1widmFsdWVcIiBpbiAnLCB2YWx1ZSwgJz8rJywgdmFsdWUsICcudmFsdWU6MScpXG4gICAgICAgICAgICAgIHZhciBJTlZFUlQgPSBzY29wZS5kZWYoJyEhJywgdmFsdWUsICcuaW52ZXJ0JylcbiAgICAgICAgICAgICAgcmV0dXJuIFtWQUxVRSwgSU5WRVJUXVxuICAgICAgICAgICAgfSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgcmV0dXJuIFNUQVRFXG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZU9wdGlvbnMgKG9wdGlvbnMpIHtcbiAgICB2YXIgc3RhdGljT3B0aW9ucyA9IG9wdGlvbnMuc3RhdGljXG4gICAgdmFyIGR5bmFtaWNPcHRpb25zID0gb3B0aW9ucy5keW5hbWljXG5cbiAgICBcblxuICAgIHZhciBmcmFtZWJ1ZmZlciA9IHBhcnNlRnJhbWVidWZmZXIob3B0aW9ucylcbiAgICB2YXIgdmlld3BvcnRBbmRTY2lzc29yID0gcGFyc2VWaWV3cG9ydFNjaXNzb3Iob3B0aW9ucywgZnJhbWVidWZmZXIpXG4gICAgdmFyIGRyYXcgPSBwYXJzZURyYXcob3B0aW9ucylcbiAgICB2YXIgc3RhdGUgPSBwYXJzZUdMU3RhdGUob3B0aW9ucylcbiAgICB2YXIgc2hhZGVyID0gcGFyc2VQcm9ncmFtKG9wdGlvbnMpXG5cbiAgICBmdW5jdGlvbiBjb3B5Qm94IChuYW1lKSB7XG4gICAgICB2YXIgZGVmbiA9IHZpZXdwb3J0QW5kU2Npc3NvcltuYW1lXVxuICAgICAgaWYgKGRlZm4pIHtcbiAgICAgICAgc3RhdGVbbmFtZV0gPSBkZWZuXG4gICAgICB9XG4gICAgfVxuICAgIGNvcHlCb3goU19WSUVXUE9SVClcbiAgICBjb3B5Qm94KHByb3BOYW1lKFNfU0NJU1NPUl9CT1gpKVxuXG4gICAgdmFyIGRpcnR5ID0gT2JqZWN0LmtleXMoc3RhdGUpLmxlbmd0aCA+IDBcblxuICAgIHJldHVybiB7XG4gICAgICBmcmFtZWJ1ZmZlcjogZnJhbWVidWZmZXIsXG4gICAgICBkcmF3OiBkcmF3LFxuICAgICAgc2hhZGVyOiBzaGFkZXIsXG4gICAgICBzdGF0ZTogc3RhdGUsXG4gICAgICBkaXJ0eTogZGlydHlcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZVVuaWZvcm1zICh1bmlmb3Jtcykge1xuICAgIHZhciBzdGF0aWNVbmlmb3JtcyA9IHVuaWZvcm1zLnN0YXRpY1xuICAgIHZhciBkeW5hbWljVW5pZm9ybXMgPSB1bmlmb3Jtcy5keW5hbWljXG5cbiAgICB2YXIgVU5JRk9STVMgPSB7fVxuXG4gICAgT2JqZWN0LmtleXMoc3RhdGljVW5pZm9ybXMpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHZhciB2YWx1ZSA9IHN0YXRpY1VuaWZvcm1zW25hbWVdXG4gICAgICB2YXIgcmVzdWx0XG4gICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyB8fFxuICAgICAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgIHJlc3VsdCA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHJldHVybiB2YWx1ZVxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgdHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nICYmXG4gICAgICAgIHZhbHVlLl9yZWdsVHlwZSA9PT0gJ3RleHR1cmUnKSB7XG4gICAgICAgIHJlc3VsdCA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudikge1xuICAgICAgICAgIHJldHVybiBlbnYubGluayh2YWx1ZSlcbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkgfHwgaXNUeXBlZEFycmF5KHZhbHVlKSkge1xuICAgICAgICByZXN1bHQgPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYpIHtcbiAgICAgICAgICB2YXIgSVRFTSA9IGVudi5nbG9iYWwuZGVmKCdbJyxcbiAgICAgICAgICAgIGxvb3AodmFsdWUubGVuZ3RoLCBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlW2ldXG4gICAgICAgICAgICB9KSwgJ10nKVxuICAgICAgICAgIHJldHVybiBJVEVNXG4gICAgICAgIH0pXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBcbiAgICAgIH1cbiAgICAgIHJlc3VsdC52YWx1ZSA9IHZhbHVlXG4gICAgICBVTklGT1JNU1tuYW1lXSA9IHJlc3VsdFxuICAgIH0pXG5cbiAgICBPYmplY3Qua2V5cyhkeW5hbWljVW5pZm9ybXMpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgdmFyIGR5biA9IGR5bmFtaWNVbmlmb3Jtc1trZXldXG4gICAgICBVTklGT1JNU1trZXldID0gY3JlYXRlRHluYW1pY0RlY2woZHluLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICByZXR1cm4gZW52Lmludm9rZShzY29wZSwgZHluKVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgcmV0dXJuIFVOSUZPUk1TXG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZUF0dHJpYnV0ZXMgKGF0dHJpYnV0ZXMpIHtcbiAgICB2YXIgc3RhdGljQXR0cmlidXRlcyA9IGF0dHJpYnV0ZXMuc3RhdGljXG4gICAgdmFyIGR5bmFtaWNBdHRyaWJ1dGVzID0gYXR0cmlidXRlcy5keW5hbWljXG5cbiAgICB2YXIgYXR0cmlidXRlRGVmcyA9IHt9XG5cbiAgICBPYmplY3Qua2V5cyhzdGF0aWNBdHRyaWJ1dGVzKS5mb3JFYWNoKGZ1bmN0aW9uIChhdHRyaWJ1dGUpIHtcbiAgICAgIHZhciB2YWx1ZSA9IHN0YXRpY0F0dHJpYnV0ZXNbYXR0cmlidXRlXVxuICAgICAgdmFyIGlkID0gc3RyaW5nU3RvcmUuaWQoYXR0cmlidXRlKVxuXG4gICAgICB2YXIgcmVjb3JkID0gbmV3IEF0dHJpYnV0ZVJlY29yZCgpXG4gICAgICBpZiAoaXNCdWZmZXJBcmdzKHZhbHVlKSkge1xuICAgICAgICByZWNvcmQuc3RhdGUgPSBBVFRSSUJfU1RBVEVfUE9JTlRFUlxuICAgICAgICByZWNvcmQuYnVmZmVyID0gYnVmZmVyU3RhdGUuZ2V0QnVmZmVyKFxuICAgICAgICAgIGJ1ZmZlclN0YXRlLmNyZWF0ZSh2YWx1ZSwgR0xfQVJSQVlfQlVGRkVSLCBmYWxzZSkpXG4gICAgICAgIHJlY29yZC50eXBlID0gcmVjb3JkLmJ1ZmZlci5kdHlwZVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIGJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmdldEJ1ZmZlcih2YWx1ZSlcbiAgICAgICAgaWYgKGJ1ZmZlcikge1xuICAgICAgICAgIHJlY29yZC5zdGF0ZSA9IEFUVFJJQl9TVEFURV9QT0lOVEVSXG4gICAgICAgICAgcmVjb3JkLmJ1ZmZlciA9IGJ1ZmZlclxuICAgICAgICAgIHJlY29yZC50eXBlID0gYnVmZmVyLmR0eXBlXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKHZhbHVlLmNvbnN0YW50KSB7XG4gICAgICAgICAgICB2YXIgY29uc3RhbnQgPSB2YWx1ZS5jb25zdGFudFxuICAgICAgICAgICAgcmVjb3JkLnN0YXRlID0gQVRUUklCX1NUQVRFX0NPTlNUQU5UXG4gICAgICAgICAgICBpZiAodHlwZW9mIGNvbnN0YW50ID09PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgICByZWNvcmQueCA9IGNvbnN0YW50XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgQ1VURV9DT01QT05FTlRTLmZvckVhY2goZnVuY3Rpb24gKGMsIGkpIHtcbiAgICAgICAgICAgICAgICBpZiAoaSA8IGNvbnN0YW50Lmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgcmVjb3JkW2NdID0gY29uc3RhbnRbaV1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmdldEJ1ZmZlcih2YWx1ZS5idWZmZXIpXG4gICAgICAgICAgICBcblxuICAgICAgICAgICAgdmFyIG9mZnNldCA9IHZhbHVlLm9mZnNldCB8IDBcbiAgICAgICAgICAgIFxuXG4gICAgICAgICAgICB2YXIgc3RyaWRlID0gdmFsdWUuc3RyaWRlIHwgMFxuICAgICAgICAgICAgXG5cbiAgICAgICAgICAgIHZhciBzaXplID0gdmFsdWUuc2l6ZSB8IDBcbiAgICAgICAgICAgIGlmICgnc2l6ZScgaW4gdmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBub3JtYWxpemVkID0gISF2YWx1ZS5ub3JtYWxpemVkXG4gICAgICAgICAgICBpZiAoJ25vcm1hbGl6ZWQnIGluIHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgdHlwZSA9IDBcbiAgICAgICAgICAgIGlmICgndHlwZScgaW4gdmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHR5cGUgPSBnbFR5cGVzW3ZhbHVlLnR5cGVdXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBkaXZpc29yID0gdmFsdWUuZGl2aXNvciB8IDBcbiAgICAgICAgICAgIGlmICgnZGl2aXNvcicgaW4gdmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZWNvcmQuYnVmZmVyID0gYnVmZmVyXG4gICAgICAgICAgICByZWNvcmQuc3RhdGUgPSBBVFRSSUJfU1RBVEVfUE9JTlRFUlxuICAgICAgICAgICAgcmVjb3JkLnNpemUgPSBzaXplXG4gICAgICAgICAgICByZWNvcmQubm9ybWFsaXplZCA9IG5vcm1hbGl6ZWRcbiAgICAgICAgICAgIHJlY29yZC50eXBlID0gdHlwZSB8fCBidWZmZXIuZHR5cGVcbiAgICAgICAgICAgIHJlY29yZC5vZmZzZXQgPSBvZmZzZXRcbiAgICAgICAgICAgIHJlY29yZC5zdHJpZGUgPSBzdHJpZGVcbiAgICAgICAgICAgIHJlY29yZC5kaXZpc29yID0gZGl2aXNvclxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBhdHRyaWJ1dGVEZWZzW2F0dHJpYnV0ZV0gPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgIHZhciBjYWNoZSA9IGVudi5hdHRyaWJDYWNoZVxuICAgICAgICBpZiAoaWQgaW4gY2FjaGUpIHtcbiAgICAgICAgICByZXR1cm4gY2FjaGVbaWRdXG4gICAgICAgIH1cbiAgICAgICAgdmFyIHJlc3VsdCA9IHtcbiAgICAgICAgICBpc1N0cmVhbTogZmFsc2VcbiAgICAgICAgfVxuICAgICAgICBPYmplY3Qua2V5cyhyZWNvcmQpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgICAgIHJlc3VsdFtrZXldID0gcmVjb3JkW2tleV1cbiAgICAgICAgfSlcbiAgICAgICAgaWYgKHJlY29yZC5idWZmZXIpIHtcbiAgICAgICAgICByZXN1bHQuYnVmZmVyID0gZW52LmxpbmsocmVjb3JkLmJ1ZmZlcilcbiAgICAgICAgfVxuICAgICAgICBjYWNoZVtpZF0gPSByZXN1bHRcbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgT2JqZWN0LmtleXMoZHluYW1pY0F0dHJpYnV0ZXMpLmZvckVhY2goZnVuY3Rpb24gKGF0dHJpYnV0ZSkge1xuICAgICAgdmFyIGR5biA9IGR5bmFtaWNBdHRyaWJ1dGVzW2F0dHJpYnV0ZV1cblxuICAgICAgZnVuY3Rpb24gYXBwZW5kQXR0cmlidXRlQ29kZSAoZW52LCBibG9jaykge1xuICAgICAgICB2YXIgVkFMVUUgPSBlbnYuaW52b2tlKGJsb2NrLCBkeW4pXG5cbiAgICAgICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcblxuICAgICAgICB2YXIgSVNfQlVGRkVSX0FSR1MgPSBzaGFyZWQuaXNCdWZmZXJBcmdzXG4gICAgICAgIHZhciBCVUZGRVJfU1RBVEUgPSBzaGFyZWQuYnVmZmVyXG5cbiAgICAgICAgLy8gUGVyZm9ybSB2YWxpZGF0aW9uIG9uIGF0dHJpYnV0ZVxuICAgICAgICBcblxuICAgICAgICAvLyBhbGxvY2F0ZSBuYW1lcyBmb3IgcmVzdWx0XG4gICAgICAgIHZhciByZXN1bHQgPSB7XG4gICAgICAgICAgaXNTdHJlYW06IGJsb2NrLmRlZihmYWxzZSlcbiAgICAgICAgfVxuICAgICAgICB2YXIgZGVmYXVsdFJlY29yZCA9IG5ldyBBdHRyaWJ1dGVSZWNvcmQoKVxuICAgICAgICBkZWZhdWx0UmVjb3JkLnN0YXRlID0gQVRUUklCX1NUQVRFX1BPSU5URVJcbiAgICAgICAgT2JqZWN0LmtleXMoZGVmYXVsdFJlY29yZCkuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgICAgcmVzdWx0W2tleV0gPSBibG9jay5kZWYoJycgKyBkZWZhdWx0UmVjb3JkW2tleV0pXG4gICAgICAgIH0pXG5cbiAgICAgICAgdmFyIEJVRkZFUiA9IHJlc3VsdC5idWZmZXJcbiAgICAgICAgdmFyIFRZUEUgPSByZXN1bHQudHlwZVxuICAgICAgICBibG9jayhcbiAgICAgICAgICAnaWYoJywgSVNfQlVGRkVSX0FSR1MsICcoJywgVkFMVUUsICcpKXsnLFxuICAgICAgICAgIHJlc3VsdC5pc1N0cmVhbSwgJz10cnVlOycsXG4gICAgICAgICAgQlVGRkVSLCAnPScsIEJVRkZFUl9TVEFURSwgJy5jcmVhdGVTdHJlYW0oJywgVkFMVUUsICcpOycsXG4gICAgICAgICAgVFlQRSwgJz0nLCBCVUZGRVIsICcuZHR5cGU7JyxcbiAgICAgICAgICAnfWVsc2V7JyxcbiAgICAgICAgICBCVUZGRVIsICc9JywgQlVGRkVSX1NUQVRFLCAnLmdldEJ1ZmZlcignLCBWQUxVRSwgJyk7JyxcbiAgICAgICAgICAnaWYoJywgQlVGRkVSLCAnKXsnLFxuICAgICAgICAgIFRZUEUsICc9JywgQlVGRkVSLCAnLmR0eXBlOycsXG4gICAgICAgICAgJ31lbHNlIGlmKCcsIFZBTFVFLCAnLmNvbnN0YW50KXsnLFxuICAgICAgICAgIHJlc3VsdC5zdGF0ZSwgJz0nLCBBVFRSSUJfU1RBVEVfQ09OU1RBTlQsICc7JyxcbiAgICAgICAgICBDVVRFX0NPTVBPTkVOVFMubWFwKGZ1bmN0aW9uIChuYW1lLCBpKSB7XG4gICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICByZXN1bHRbbmFtZV0gKyAnPScgKyBWQUxVRSArICcubGVuZ3RoPj0nICsgaSArXG4gICAgICAgICAgICAgICc/JyArIFZBTFVFICsgJ1snICsgaSArICddOjA7J1xuICAgICAgICAgICAgKVxuICAgICAgICAgIH0pLmpvaW4oJycpLFxuICAgICAgICAgICd9ZWxzZXsnLFxuICAgICAgICAgIEJVRkZFUiwgJz0nLCBCVUZGRVJfU1RBVEUsICcuZ2V0QnVmZmVyKCcsIFZBTFVFLCAnLmJ1ZmZlcik7JyxcbiAgICAgICAgICBUWVBFLCAnPVwidHlwZVwiIGluICcsIFZBTFVFLCAnPycsXG4gICAgICAgICAgc2hhcmVkLmdsVHlwZXMsICdbJywgVkFMVUUsICcudHlwZV06JywgQlVGRkVSLCAnLmR0eXBlOycsXG4gICAgICAgICAgcmVzdWx0Lm5vcm1hbGl6ZWQsICc9ISEnLCBWQUxVRSwgJy5ub3JtYWxpemVkOycpXG4gICAgICAgIGZ1bmN0aW9uIGVtaXRSZWFkUmVjb3JkIChuYW1lKSB7XG4gICAgICAgICAgYmxvY2socmVzdWx0W25hbWVdLCAnPScsIFZBTFVFLCAnLicsIG5hbWUsICd8MDsnKVxuICAgICAgICB9XG4gICAgICAgIGVtaXRSZWFkUmVjb3JkKCdzaXplJylcbiAgICAgICAgZW1pdFJlYWRSZWNvcmQoJ29mZnNldCcpXG4gICAgICAgIGVtaXRSZWFkUmVjb3JkKCdzdHJpZGUnKVxuICAgICAgICBlbWl0UmVhZFJlY29yZCgnZGl2aXNvcicpXG5cbiAgICAgICAgYmxvY2soJ319JylcblxuICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICB9XG5cbiAgICAgIGF0dHJpYnV0ZURlZnNbYXR0cmlidXRlXSA9IGNyZWF0ZUR5bmFtaWNEZWNsKGR5biwgYXBwZW5kQXR0cmlidXRlQ29kZSlcbiAgICB9KVxuXG4gICAgcmV0dXJuIGF0dHJpYnV0ZURlZnNcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlQ29udGV4dCAoY29udGV4dCkge1xuICAgIHZhciBzdGF0aWNDb250ZXh0ID0gY29udGV4dC5zdGF0aWNcbiAgICB2YXIgZHluYW1pY0NvbnRleHQgPSBjb250ZXh0LmR5bmFtaWNcbiAgICB2YXIgcmVzdWx0ID0ge31cblxuICAgIE9iamVjdC5rZXlzKHN0YXRpY0NvbnRleHQpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHZhciB2YWx1ZSA9IHN0YXRpY0NvbnRleHRbbmFtZV1cbiAgICAgIHJlc3VsdFtuYW1lXSA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgfHwgdHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICByZXR1cm4gJycgKyB2YWx1ZVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBlbnYubGluayh2YWx1ZSlcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgT2JqZWN0LmtleXMoZHluYW1pY0NvbnRleHQpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHZhciBkeW4gPSBkeW5hbWljQ29udGV4dFtuYW1lXVxuICAgICAgcmVzdWx0W25hbWVdID0gY3JlYXRlRHluYW1pY0RlY2woZHluLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICByZXR1cm4gZW52Lmludm9rZShzY29wZSwgZHluKVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VBcmd1bWVudHMgKG9wdGlvbnMsIGF0dHJpYnV0ZXMsIHVuaWZvcm1zLCBjb250ZXh0KSB7XG4gICAgdmFyIHJlc3VsdCA9IHBhcnNlT3B0aW9ucyhvcHRpb25zKVxuICAgIHJlc3VsdC51bmlmb3JtcyA9IHBhcnNlVW5pZm9ybXModW5pZm9ybXMpXG4gICAgcmVzdWx0LmF0dHJpYnV0ZXMgPSBwYXJzZUF0dHJpYnV0ZXMoYXR0cmlidXRlcylcbiAgICByZXN1bHQuY29udGV4dCA9IHBhcnNlQ29udGV4dChjb250ZXh0KVxuICAgIHJldHVybiByZXN1bHRcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gQ09NTU9OIFVQREFURSBGVU5DVElPTlNcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICBmdW5jdGlvbiBlbWl0Q29udGV4dCAoZW52LCBzY29wZSwgY29udGV4dCkge1xuICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgdmFyIENPTlRFWFQgPSBzaGFyZWQuY29udGV4dFxuXG4gICAgdmFyIGNvbnRleHRFbnRlciA9IGVudi5zY29wZSgpXG5cbiAgICBPYmplY3Qua2V5cyhjb250ZXh0KS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICBzY29wZS5zYXZlKENPTlRFWFQsICcuJyArIG5hbWUpXG4gICAgICB2YXIgZGVmbiA9IGNvbnRleHRbbmFtZV1cbiAgICAgIGNvbnRleHRFbnRlcihDT05URVhULCAnLicsIG5hbWUsICc9JywgZGVmbi5hcHBlbmQoZW52LCBzY29wZSksICc7JylcbiAgICB9KVxuXG4gICAgc2NvcGUoY29udGV4dEVudGVyKVxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBDT01NT04gRFJBV0lORyBGVU5DVElPTlNcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICBmdW5jdGlvbiBlbWl0UG9sbEZyYW1lYnVmZmVyIChlbnYsIHNjb3BlLCBmcmFtZWJ1ZmZlcikge1xuICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG5cbiAgICB2YXIgR0wgPSBzaGFyZWQuZ2xcbiAgICB2YXIgRlJBTUVCVUZGRVJfU1RBVEUgPSBzaGFyZWQuZnJhbWVidWZmZXJcbiAgICB2YXIgRVhUX0RSQVdfQlVGRkVSU1xuICAgIGlmIChleHREcmF3QnVmZmVycykge1xuICAgICAgRVhUX0RSQVdfQlVGRkVSUyA9IHNjb3BlLmRlZihzaGFyZWQuZXh0ZW5zaW9ucywgJy53ZWJnbF9kcmF3X2J1ZmZlcnMnKVxuICAgIH1cblxuICAgIHZhciBjb25zdGFudHMgPSBlbnYuY29uc3RhbnRzXG5cbiAgICB2YXIgRFJBV19CVUZGRVJTID0gY29uc3RhbnRzLmRyYXdCdWZmZXJzXG4gICAgdmFyIEJBQ0tfQlVGRkVSID0gY29uc3RhbnRzLmJhY2tCdWZmZXJcblxuICAgIHZhciBORVhUXG4gICAgaWYgKGZyYW1lYnVmZmVyKSB7XG4gICAgICBORVhUID0gZnJhbWVidWZmZXIuYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgfSBlbHNlIHtcbiAgICAgIE5FWFQgPSBzY29wZS5kZWYoRlJBTUVCVUZGRVJfU1RBVEUsICcubmV4dCcpXG4gICAgfVxuXG4gICAgc2NvcGUoXG4gICAgICAnaWYoJywgRlJBTUVCVUZGRVJfU1RBVEUsICcuZGlydHl8fCcsIE5FWFQsICchPT0nLCBGUkFNRUJVRkZFUl9TVEFURSwgJy5jdXIpeycsXG4gICAgICAnaWYoJywgTkVYVCwgJyl7JyxcbiAgICAgIEdMLCAnLmJpbmRGcmFtZWJ1ZmZlcignLCBHTF9GUkFNRUJVRkZFUiwgJywnLCBORVhULCAnLmZyYW1lYnVmZmVyKTsnKVxuICAgIGlmIChleHREcmF3QnVmZmVycykge1xuICAgICAgc2NvcGUoRVhUX0RSQVdfQlVGRkVSUywgJy5kcmF3QnVmZmVyc1dFQkdMKCcsXG4gICAgICAgIERSQVdfQlVGRkVSUywgJ1snLCBORVhULCAnLmNvbG9yQXR0YWNobWVudHMubGVuZ3RoXSk7JylcbiAgICB9XG4gICAgc2NvcGUoJ31lbHNleycsXG4gICAgICBHTCwgJy5iaW5kRnJhbWVidWZmZXIoJywgR0xfRlJBTUVCVUZGRVIsICcsbnVsbCk7JylcbiAgICBpZiAoZXh0RHJhd0J1ZmZlcnMpIHtcbiAgICAgIHNjb3BlKEVYVF9EUkFXX0JVRkZFUlMsICcuZHJhd0J1ZmZlcnNXRUJHTCgnLCBCQUNLX0JVRkZFUiwgJyk7JylcbiAgICB9XG4gICAgc2NvcGUoXG4gICAgICAnfScsXG4gICAgICBGUkFNRUJVRkZFUl9TVEFURSwgJy5jdXI9JywgTkVYVCwgJzsnLFxuICAgICAgRlJBTUVCVUZGRVJfU1RBVEUsICcuZGlydHk9ZmFsc2U7JyxcbiAgICAgICd9JylcbiAgfVxuXG4gIGZ1bmN0aW9uIGVtaXRQb2xsU3RhdGUgKGVudiwgc2NvcGUsIGFyZ3MpIHtcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuXG4gICAgdmFyIEdMID0gc2hhcmVkLmdsXG5cbiAgICB2YXIgQ1VSUkVOVF9WQVJTID0gZW52LmN1cnJlbnRcbiAgICB2YXIgTkVYVF9WQVJTID0gZW52Lm5leHRcbiAgICB2YXIgQ1VSUkVOVF9TVEFURSA9IHNoYXJlZC5jdXJyZW50XG4gICAgdmFyIE5FWFRfU1RBVEUgPSBzaGFyZWQubmV4dFxuXG4gICAgdmFyIGJsb2NrID0gZW52LmNvbmQoQ1VSUkVOVF9TVEFURSwgJy5kaXJ0eScpXG5cbiAgICBHTF9TVEFURV9OQU1FUy5mb3JFYWNoKGZ1bmN0aW9uIChwcm9wKSB7XG4gICAgICB2YXIgcGFyYW0gPSBwcm9wTmFtZShwcm9wKVxuICAgICAgaWYgKHBhcmFtIGluIGFyZ3Muc3RhdGUpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG5cbiAgICAgIHZhciBORVhULCBDVVJSRU5UXG4gICAgICBpZiAocGFyYW0gaW4gTkVYVF9WQVJTKSB7XG4gICAgICAgIE5FWFQgPSBORVhUX1ZBUlNbcGFyYW1dXG4gICAgICAgIENVUlJFTlQgPSBDVVJSRU5UX1ZBUlNbcGFyYW1dXG4gICAgICAgIHZhciBwYXJ0cyA9IGxvb3AoY3VycmVudFN0YXRlW3BhcmFtXS5sZW5ndGgsIGZ1bmN0aW9uIChpKSB7XG4gICAgICAgICAgcmV0dXJuIGJsb2NrLmRlZihORVhULCAnWycsIGksICddJylcbiAgICAgICAgfSlcbiAgICAgICAgYmxvY2soZW52LmNvbmQocGFydHMubWFwKGZ1bmN0aW9uIChwLCBpKSB7XG4gICAgICAgICAgcmV0dXJuIHAgKyAnPT09JyArIENVUlJFTlQgKyAnWycgKyBpICsgJ10nXG4gICAgICAgIH0pLmpvaW4oJyYmJykpXG4gICAgICAgICAgLnRoZW4oXG4gICAgICAgICAgICBHTCwgJy4nLCBHTF9WQVJJQUJMRVNbcGFyYW1dLCAnKCcsIHBhcnRzLCAnKTsnLFxuICAgICAgICAgICAgcGFydHMubWFwKGZ1bmN0aW9uIChwLCBpKSB7XG4gICAgICAgICAgICAgIHJldHVybiBDVVJSRU5UICsgJ1snICsgaSArICddPScgKyBwXG4gICAgICAgICAgICB9KS5qb2luKCc7JyksICc7JykpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBORVhUID0gYmxvY2suZGVmKE5FWFRfU1RBVEUsICcuJywgcGFyYW0pXG4gICAgICAgIHZhciBpZnRlID0gZW52LmNvbmQoTkVYVCwgJyE9PScsIENVUlJFTlRfU1RBVEUsICcuJywgcGFyYW0pXG4gICAgICAgIGJsb2NrKGlmdGUpXG4gICAgICAgIGlmIChwYXJhbSBpbiBHTF9GTEFHUykge1xuICAgICAgICAgIGlmdGUoXG4gICAgICAgICAgICBlbnYuY29uZChORVhUKVxuICAgICAgICAgICAgICAgIC50aGVuKEdMLCAnLmVuYWJsZSgnLCBHTF9GTEFHU1twYXJhbV0sICcpOycpXG4gICAgICAgICAgICAgICAgLmVsc2UoR0wsICcuZGlzYWJsZSgnLCBHTF9GTEFHU1twYXJhbV0sICcpOycpLFxuICAgICAgICAgICAgQ1VSUkVOVF9TVEFURSwgJy4nLCBwYXJhbSwgJz0nLCBORVhULCAnOycpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWZ0ZShcbiAgICAgICAgICAgIEdMLCAnLicsIEdMX1ZBUklBQkxFU1twYXJhbV0sICcoJywgTkVYVCwgJyk7JyxcbiAgICAgICAgICAgIENVUlJFTlRfU1RBVEUsICcuJywgcGFyYW0sICc9JywgTkVYVCwgJzsnKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSlcbiAgICBpZiAoT2JqZWN0LmtleXMoYXJncy5zdGF0ZSkubGVuZ3RoID09PSAwKSB7XG4gICAgICBibG9jayhDVVJSRU5UX1NUQVRFLCAnLmRpcnR5PWZhbHNlOycpXG4gICAgfVxuICAgIHNjb3BlKGJsb2NrKVxuICB9XG5cbiAgZnVuY3Rpb24gZW1pdFNldE9wdGlvbnMgKGVudiwgc2NvcGUsIG9wdGlvbnMsIGZpbHRlcikge1xuICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgdmFyIENVUlJFTlRfVkFSUyA9IGVudi5jdXJyZW50XG4gICAgdmFyIENVUlJFTlRfU1RBVEUgPSBzaGFyZWQuY3VycmVudFxuICAgIHZhciBHTCA9IHNoYXJlZC5nbFxuICAgIHNvcnRTdGF0ZShPYmplY3Qua2V5cyhvcHRpb25zKSkuZm9yRWFjaChmdW5jdGlvbiAocGFyYW0pIHtcbiAgICAgIHZhciBkZWZuID0gb3B0aW9uc1twYXJhbV1cbiAgICAgIGlmIChmaWx0ZXIgJiYgIWZpbHRlcihkZWZuKSkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIHZhciB2YXJpYWJsZSA9IGRlZm4uYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgICBpZiAoR0xfRkxBR1NbcGFyYW1dKSB7XG4gICAgICAgIHZhciBmbGFnID0gR0xfRkxBR1NbcGFyYW1dXG4gICAgICAgIGlmIChpc1N0YXRpYyhkZWZuKSkge1xuICAgICAgICAgIGlmICh2YXJpYWJsZSkge1xuICAgICAgICAgICAgc2NvcGUoR0wsICcuZW5hYmxlKCcsIGZsYWcsICcpOycpXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNjb3BlKEdMLCAnLmRpc2FibGUoJywgZmxhZywgJyk7JylcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc2NvcGUoZW52LmNvbmQodmFyaWFibGUpXG4gICAgICAgICAgICAudGhlbihHTCwgJy5lbmFibGUoJywgZmxhZywgJyk7JylcbiAgICAgICAgICAgIC5lbHNlKEdMLCAnLmRpc2FibGUoJywgZmxhZywgJyk7JykpXG4gICAgICAgIH1cbiAgICAgICAgc2NvcGUoQ1VSUkVOVF9TVEFURSwgJy4nLCBwYXJhbSwgJz0nLCB2YXJpYWJsZSwgJzsnKVxuICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KHZhcmlhYmxlKSkge1xuICAgICAgICB2YXIgQ1VSUkVOVCA9IENVUlJFTlRfVkFSU1twYXJhbV1cbiAgICAgICAgc2NvcGUoXG4gICAgICAgICAgR0wsICcuJywgR0xfVkFSSUFCTEVTW3BhcmFtXSwgJygnLCB2YXJpYWJsZSwgJyk7JyxcbiAgICAgICAgICB2YXJpYWJsZS5tYXAoZnVuY3Rpb24gKHYsIGkpIHtcbiAgICAgICAgICAgIHJldHVybiBDVVJSRU5UICsgJ1snICsgaSArICddPScgKyB2XG4gICAgICAgICAgfSkuam9pbignOycpLCAnOycpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzY29wZShcbiAgICAgICAgICBHTCwgJy4nLCBHTF9WQVJJQUJMRVNbcGFyYW1dLCAnKCcsIHZhcmlhYmxlLCAnKTsnLFxuICAgICAgICAgIENVUlJFTlRfU1RBVEUsICcuJywgcGFyYW0sICc9JywgdmFyaWFibGUsICc7JylcbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgZnVuY3Rpb24gaW5qZWN0RXh0ZW5zaW9ucyAoZW52LCBzY29wZSkge1xuICAgIGlmIChleHRJbnN0YW5jaW5nICYmICFlbnYuaW5zdGFuY2luZykge1xuICAgICAgZW52Lmluc3RhbmNpbmcgPSBzY29wZS5kZWYoXG4gICAgICAgIGVudi5zaGFyZWQuZXh0ZW5zaW9ucywgJy5hbmdsZV9pbnN0YW5jZWRfYXJyYXlzJylcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBlbWl0QXR0cmlidXRlcyAoZW52LCBzY29wZSwgYXJncywgYXR0cmlidXRlcywgZmlsdGVyKSB7XG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcblxuICAgIGZ1bmN0aW9uIHR5cGVMZW5ndGggKHgpIHtcbiAgICAgIHN3aXRjaCAoeCkge1xuICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzI6XG4gICAgICAgIGNhc2UgR0xfSU5UX1ZFQzI6XG4gICAgICAgIGNhc2UgR0xfQk9PTF9WRUMyOlxuICAgICAgICAgIHJldHVybiAyXG4gICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDMzpcbiAgICAgICAgY2FzZSBHTF9JTlRfVkVDMzpcbiAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzM6XG4gICAgICAgICAgcmV0dXJuIDNcbiAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUM0OlxuICAgICAgICBjYXNlIEdMX0lOVF9WRUM0OlxuICAgICAgICBjYXNlIEdMX0JPT0xfVkVDNDpcbiAgICAgICAgICByZXR1cm4gNFxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIHJldHVybiAxXG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZW1pdEJpbmRBdHRyaWJ1dGUgKEFUVFJJQlVURSwgc2l6ZSwgcmVjb3JkKSB7XG4gICAgICB2YXIgR0wgPSBzaGFyZWQuZ2xcblxuICAgICAgdmFyIExPQ0FUSU9OID0gc2NvcGUuZGVmKEFUVFJJQlVURSwgJy5sb2NhdGlvbicpXG4gICAgICB2YXIgQklORElORyA9IHNjb3BlLmRlZihzaGFyZWQuYXR0cmlidXRlcywgJ1snLCBMT0NBVElPTiwgJ10nKVxuXG4gICAgICB2YXIgU1RBVEUgPSByZWNvcmQuc3RhdGVcbiAgICAgIHZhciBCVUZGRVIgPSByZWNvcmQuYnVmZmVyXG4gICAgICB2YXIgQ09OU1RfQ09NUE9ORU5UUyA9IFtcbiAgICAgICAgcmVjb3JkLngsXG4gICAgICAgIHJlY29yZC55LFxuICAgICAgICByZWNvcmQueixcbiAgICAgICAgcmVjb3JkLndcbiAgICAgIF1cblxuICAgICAgdmFyIENPTU1PTl9LRVlTID0gW1xuICAgICAgICAnYnVmZmVyJyxcbiAgICAgICAgJ25vcm1hbGl6ZWQnLFxuICAgICAgICAnb2Zmc2V0JyxcbiAgICAgICAgJ3N0cmlkZSdcbiAgICAgIF1cblxuICAgICAgZnVuY3Rpb24gZW1pdEJ1ZmZlciAoKSB7XG4gICAgICAgIHNjb3BlKFxuICAgICAgICAgICdpZighJywgQklORElORywgJy5wb2ludGVyKXsnLFxuICAgICAgICAgIEdMLCAnLmVuYWJsZVZlcnRleEF0dHJpYkFycmF5KCcsIExPQ0FUSU9OLCAnKTsnLFxuICAgICAgICAgIEJJTkRJTkcsICcucG9pbnRlcj10cnVlO30nKVxuXG4gICAgICAgIHZhciBUWVBFID0gcmVjb3JkLnR5cGVcbiAgICAgICAgdmFyIFNJWkVcbiAgICAgICAgaWYgKCFyZWNvcmQuc2l6ZSkge1xuICAgICAgICAgIFNJWkUgPSBzaXplXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgU0laRSA9IHNjb3BlLmRlZihyZWNvcmQuc2l6ZSwgJ3x8Jywgc2l6ZSlcbiAgICAgICAgfVxuXG4gICAgICAgIHNjb3BlKCdpZignLFxuICAgICAgICAgIEJJTkRJTkcsICcudHlwZSE9PScsIFRZUEUsICd8fCcsXG4gICAgICAgICAgQklORElORywgJy5zaXplIT09JywgU0laRSwgJ3x8JyxcbiAgICAgICAgICBDT01NT05fS0VZUy5tYXAoZnVuY3Rpb24gKGtleSkge1xuICAgICAgICAgICAgcmV0dXJuIEJJTkRJTkcgKyAnLicgKyBrZXkgKyAnIT09JyArIHJlY29yZFtrZXldXG4gICAgICAgICAgfSkuam9pbignfHwnKSxcbiAgICAgICAgICAnKXsnLFxuICAgICAgICAgIEdMLCAnLmJpbmRCdWZmZXIoJywgR0xfQVJSQVlfQlVGRkVSLCAnLCcsIEJVRkZFUiwgJy5idWZmZXIpOycsXG4gICAgICAgICAgR0wsICcudmVydGV4QXR0cmliUG9pbnRlcignLCBbXG4gICAgICAgICAgICBMT0NBVElPTixcbiAgICAgICAgICAgIFNJWkUsXG4gICAgICAgICAgICBUWVBFLFxuICAgICAgICAgICAgcmVjb3JkLm5vcm1hbGl6ZWQsXG4gICAgICAgICAgICByZWNvcmQuc3RyaWRlLFxuICAgICAgICAgICAgcmVjb3JkLm9mZnNldFxuICAgICAgICAgIF0sICcpOycsXG4gICAgICAgICAgQklORElORywgJy50eXBlPScsIFRZUEUsICc7JyxcbiAgICAgICAgICBCSU5ESU5HLCAnLnNpemU9JywgU0laRSwgJzsnLFxuICAgICAgICAgIENPTU1PTl9LRVlTLm1hcChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgICAgICByZXR1cm4gQklORElORyArICcuJyArIGtleSArICc9JyArIHJlY29yZFtrZXldICsgJzsnXG4gICAgICAgICAgfSkuam9pbignJyksXG4gICAgICAgICAgJ30nKVxuXG4gICAgICAgIGlmIChleHRJbnN0YW5jaW5nKSB7XG4gICAgICAgICAgdmFyIERJVklTT1IgPSByZWNvcmQuZGl2aXNvclxuICAgICAgICAgIHNjb3BlKFxuICAgICAgICAgICAgJ2lmKCcsIEJJTkRJTkcsICcuZGl2aXNvciE9PScsIERJVklTT1IsICcpeycsXG4gICAgICAgICAgICBlbnYuaW5zdGFuY2luZywgJy52ZXJ0ZXhBdHRyaWJEaXZpc29yQU5HTEUoJywgW0xPQ0FUSU9OLCBESVZJU09SXSwgJyk7JyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcuZGl2aXNvcj0nLCBESVZJU09SLCAnO30nKVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGZ1bmN0aW9uIGVtaXRDb25zdGFudCAoKSB7XG4gICAgICAgIHNjb3BlKFxuICAgICAgICAgICdpZignLCBCSU5ESU5HLCAnLnBvaW50ZXIpeycsXG4gICAgICAgICAgR0wsICcuZGlzYWJsZVZlcnRleEF0dHJpYkFycmF5KCcsIExPQ0FUSU9OLCAnKTsnLFxuICAgICAgICAgIEJJTkRJTkcsICcucG9pbnRlcj1mYWxzZTsnLFxuICAgICAgICAgICd9aWYoJywgQ1VURV9DT01QT05FTlRTLm1hcChmdW5jdGlvbiAoYywgaSkge1xuICAgICAgICAgICAgcmV0dXJuIEJJTkRJTkcgKyAnLicgKyBjICsgJyE9PScgKyBDT05TVF9DT01QT05FTlRTW2ldXG4gICAgICAgICAgfSkuam9pbignfHwnKSwgJyl7JyxcbiAgICAgICAgICBHTCwgJy52ZXJ0ZXhBdHRyaWI0ZignLCBMT0NBVElPTiwgJywnLCBDT05TVF9DT01QT05FTlRTLCAnKTsnLFxuICAgICAgICAgIENVVEVfQ09NUE9ORU5UUy5tYXAoZnVuY3Rpb24gKGMsIGkpIHtcbiAgICAgICAgICAgIHJldHVybiBCSU5ESU5HICsgJy4nICsgYyArICc9JyArIENPTlNUX0NPTVBPTkVOVFNbaV0gKyAnOydcbiAgICAgICAgICB9KS5qb2luKCcnKSxcbiAgICAgICAgICAnfScpXG4gICAgICB9XG5cbiAgICAgIGlmIChTVEFURSA9PT0gQVRUUklCX1NUQVRFX1BPSU5URVIpIHtcbiAgICAgICAgZW1pdEJ1ZmZlcigpXG4gICAgICB9IGVsc2UgaWYgKFNUQVRFID09PSBBVFRSSUJfU1RBVEVfQ09OU1RBTlQpIHtcbiAgICAgICAgZW1pdENvbnN0YW50KClcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNjb3BlKCdpZignLCBTVEFURSwgJz09PScsIEFUVFJJQl9TVEFURV9QT0lOVEVSLCAnKXsnKVxuICAgICAgICBlbWl0QnVmZmVyKClcbiAgICAgICAgc2NvcGUoJ31lbHNleycpXG4gICAgICAgIGVtaXRDb25zdGFudCgpXG4gICAgICAgIHNjb3BlKCd9JylcbiAgICAgIH1cbiAgICB9XG5cbiAgICBhdHRyaWJ1dGVzLmZvckVhY2goZnVuY3Rpb24gKGF0dHJpYnV0ZSkge1xuICAgICAgdmFyIG5hbWUgPSBhdHRyaWJ1dGUubmFtZVxuICAgICAgdmFyIGFyZyA9IGFyZ3MuYXR0cmlidXRlc1tuYW1lXVxuICAgICAgdmFyIHJlY29yZFxuICAgICAgaWYgKGFyZykge1xuICAgICAgICBpZiAoIWZpbHRlcihhcmcpKSB7XG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cbiAgICAgICAgcmVjb3JkID0gYXJnLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKCFmaWx0ZXIoU0NPUEVfREVDTCkpIHtcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuICAgICAgICB2YXIgc2NvcGVBdHRyaWIgPSBlbnYuc2NvcGVBdHRyaWIobmFtZSlcbiAgICAgICAgXG4gICAgICAgIHJlY29yZCA9IHt9XG4gICAgICAgIE9iamVjdC5rZXlzKG5ldyBBdHRyaWJ1dGVSZWNvcmQoKSkuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgICAgcmVjb3JkW2tleV0gPSBzY29wZS5kZWYoc2NvcGVBdHRyaWIsICcuJywga2V5KVxuICAgICAgICB9KVxuICAgICAgfVxuICAgICAgZW1pdEJpbmRBdHRyaWJ1dGUoXG4gICAgICAgIGVudi5saW5rKGF0dHJpYnV0ZSksIHR5cGVMZW5ndGgoYXR0cmlidXRlLmluZm8udHlwZSksIHJlY29yZClcbiAgICB9KVxuICB9XG5cbiAgZnVuY3Rpb24gZW1pdFVuaWZvcm1zIChlbnYsIHNjb3BlLCBhcmdzLCB1bmlmb3JtcywgZmlsdGVyKSB7XG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcbiAgICB2YXIgR0wgPSBzaGFyZWQuZ2xcblxuICAgIHZhciBpbmZpeFxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdW5pZm9ybXMubGVuZ3RoOyArK2kpIHtcbiAgICAgIHZhciB1bmlmb3JtID0gdW5pZm9ybXNbaV1cbiAgICAgIHZhciBuYW1lID0gdW5pZm9ybS5uYW1lXG4gICAgICB2YXIgdHlwZSA9IHVuaWZvcm0uaW5mby50eXBlXG4gICAgICB2YXIgYXJnID0gYXJncy51bmlmb3Jtc1tuYW1lXVxuICAgICAgdmFyIFVOSUZPUk0gPSBlbnYubGluayh1bmlmb3JtKVxuICAgICAgdmFyIExPQ0FUSU9OID0gVU5JRk9STSArICcubG9jYXRpb24nXG5cbiAgICAgIHZhciBWQUxVRVxuICAgICAgaWYgKGFyZykge1xuICAgICAgICBpZiAoIWZpbHRlcihhcmcpKSB7XG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfVxuICAgICAgICBpZiAoYXJnLnN0YXRpYykge1xuICAgICAgICAgIHZhciB2YWx1ZSA9IGFyZy52YWx1ZVxuICAgICAgICAgIGlmICh0eXBlID09PSBHTF9TQU1QTEVSXzJEIHx8IHR5cGUgPT09IEdMX1NBTVBMRVJfQ1VCRSkge1xuICAgICAgICAgICAgXG4gICAgICAgICAgICB2YXIgVEVYX1ZBTFVFID0gZW52LmxpbmsodmFsdWUuX3RleHR1cmUpXG4gICAgICAgICAgICBzY29wZShHTCwgJy51bmlmb3JtMWkoJywgTE9DQVRJT04sIFRFWF9WQUxVRSArICcuYmluZCgpKTsnKVxuICAgICAgICAgICAgc2NvcGUuZXhpdChURVhfVkFMVUUsICcudW5iaW5kKCknKVxuICAgICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAgICB0eXBlID09PSBHTF9GTE9BVF9NQVQyIHx8XG4gICAgICAgICAgICB0eXBlID09PSBHTF9GTE9BVF9NQVQzIHx8XG4gICAgICAgICAgICB0eXBlID09PSBHTF9GTE9BVF9NQVQ0KSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHZhciBNQVRfVkFMVUUgPSBlbnYuZ2xvYmFsLmRlZignWycgKyB2YWx1ZSArICddJylcbiAgICAgICAgICAgIHZhciBkaW0gPSAyXG4gICAgICAgICAgICBpZiAodHlwZSA9PT0gR0xfRkxPQVRfTUFUMykge1xuICAgICAgICAgICAgICBkaW0gPSAzXG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGUgPT09IEdMX0ZMT0FUX01BVDQpIHtcbiAgICAgICAgICAgICAgZGltID0gNFxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc2NvcGUoXG4gICAgICAgICAgICAgIEdMLCAnLnVuaWZvcm1NYXRyaXgnLCBkaW0sICdmdignLFxuICAgICAgICAgICAgICBMT0NBVElPTiwgJyxmYWxzZSwnLCBNQVRfVkFMVUUsICcpOycpXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICAgICAgICBjYXNlIEdMX0ZMT0FUOlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGluZml4ID0gJzFmJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDMjpcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICcyZidcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzM6XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaW5maXggPSAnM2YnXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUM0OlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGluZml4ID0gJzRmJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfQk9PTDpcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICcxaSdcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0lOVDpcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICcxaSdcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0JPT0xfVkVDMjpcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICcyaSdcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0lOVF9WRUMyOlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGluZml4ID0gJzJpJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfQk9PTF9WRUMzOlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGluZml4ID0gJzNpJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfSU5UX1ZFQzM6XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaW5maXggPSAnM2knXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzQ6XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaW5maXggPSAnNGknXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9JTlRfVkVDNDpcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICc0aSdcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc2NvcGUoR0wsICcudW5pZm9ybScsIGluZml4LCAnKCcsIExPQ0FUSU9OLCAnLCcsIHZhbHVlLCAnKTsnKVxuICAgICAgICAgIH1cbiAgICAgICAgICBjb250aW51ZVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIFZBTFVFID0gYXJnLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoIWZpbHRlcihTQ09QRV9ERUNMKSkge1xuICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgIH1cbiAgICAgICAgVkFMVUUgPSBzY29wZS5kZWYoc2hhcmVkLnVuaWZvcm1zLCAnWycsIHN0cmluZ1N0b3JlLmlkKG5hbWUpLCAnXScpXG4gICAgICB9XG5cbiAgICAgIC8vIHBlcmZvcm0gdHlwZSB2YWxpZGF0aW9uXG4gICAgICBcblxuICAgICAgdmFyIHNlcGFyYXRvciA9ICcsJ1xuICAgICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICAgIGNhc2UgR0xfU0FNUExFUl8yRDpcbiAgICAgICAgY2FzZSBHTF9TQU1QTEVSX0NVQkU6XG4gICAgICAgICAgdmFyIFRFWCA9IHNjb3BlLmRlZihWQUxVRSwgJy5fdGV4dHVyZScpXG4gICAgICAgICAgc2NvcGUoR0wsICcudW5pZm9ybTFpKCcsIExPQ0FUSU9OLCAnLCcsIFRFWCwgJy5iaW5kKCkpOycpXG4gICAgICAgICAgc2NvcGUuZXhpdChURVgsICcudW5iaW5kKCk7JylcbiAgICAgICAgICBjb250aW51ZVxuXG4gICAgICAgIGNhc2UgR0xfSU5UOlxuICAgICAgICBjYXNlIEdMX0JPT0w6XG4gICAgICAgICAgaW5maXggPSAnMWknXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0lOVF9WRUMyOlxuICAgICAgICBjYXNlIEdMX0JPT0xfVkVDMjpcbiAgICAgICAgICBpbmZpeCA9ICcyaXYnXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0lOVF9WRUMzOlxuICAgICAgICBjYXNlIEdMX0JPT0xfVkVDMzpcbiAgICAgICAgICBpbmZpeCA9ICczaXYnXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0lOVF9WRUM0OlxuICAgICAgICBjYXNlIEdMX0JPT0xfVkVDNDpcbiAgICAgICAgICBpbmZpeCA9ICc0aXYnXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0ZMT0FUOlxuICAgICAgICAgIGluZml4ID0gJzFmJ1xuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUMyOlxuICAgICAgICAgIGluZml4ID0gJzJmdidcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDMzpcbiAgICAgICAgICBpbmZpeCA9ICczZnYnXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzQ6XG4gICAgICAgICAgaW5maXggPSAnNGZ2J1xuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9GTE9BVF9NQVQyOlxuICAgICAgICAgIGluZml4ID0gJ01hdHJpeDJmdidcbiAgICAgICAgICBzZXBhcmF0b3IgPSAnLGZhbHNlLCdcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfRkxPQVRfTUFUMzpcbiAgICAgICAgICBpbmZpeCA9ICdNYXRyaXgzZnYnXG4gICAgICAgICAgc2VwYXJhdG9yID0gJyxmYWxzZSwnXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0ZMT0FUX01BVDQ6XG4gICAgICAgICAgaW5maXggPSAnTWF0cml4NGZ2J1xuICAgICAgICAgIHNlcGFyYXRvciA9ICcsZmFsc2UsJ1xuICAgICAgICAgIGJyZWFrXG4gICAgICB9XG4gICAgICBzY29wZShHTCwgJy51bmlmb3JtJywgaW5maXgsICcoJywgTE9DQVRJT04sIHNlcGFyYXRvciwgVkFMVUUsICcpOycpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZW1pdERyYXcgKGVudiwgb3V0ZXIsIGlubmVyLCBhcmdzKSB7XG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcbiAgICB2YXIgR0wgPSBzaGFyZWQuZ2xcbiAgICB2YXIgRFJBV19TVEFURSA9IHNoYXJlZC5kcmF3XG5cbiAgICB2YXIgZHJhd09wdGlvbnMgPSBhcmdzLmRyYXdcblxuICAgIGZ1bmN0aW9uIGVtaXRFbGVtZW50cyAoKSB7XG4gICAgICB2YXIgZGVmbiA9IGRyYXdPcHRpb25zLmVsZW1lbnRzXG4gICAgICB2YXIgRUxFTUVOVFNcbiAgICAgIHZhciBzY29wZSA9IG91dGVyXG4gICAgICBpZiAoZGVmbikge1xuICAgICAgICBpZiAoIWRlZm4uYmF0Y2hTdGF0aWMpIHtcbiAgICAgICAgICBzY29wZSA9IGlubmVyXG4gICAgICAgIH1cbiAgICAgICAgRUxFTUVOVFMgPSBkZWZuLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgRUxFTUVOVFMgPSBzY29wZS5kZWYoRFJBV19TVEFURSwgJy4nLCBTX0VMRU1FTlRTKVxuICAgICAgfVxuICAgICAgaWYgKEVMRU1FTlRTKSB7XG4gICAgICAgIHNjb3BlKFxuICAgICAgICAgICdpZignICsgRUxFTUVOVFMgKyAnKScgK1xuICAgICAgICAgIEdMICsgJy5iaW5kQnVmZmVyKCcgKyBHTF9FTEVNRU5UX0FSUkFZX0JVRkZFUiArICcsJyArIEVMRU1FTlRTICsgJy5idWZmZXIuYnVmZmVyKTsnKVxuICAgICAgfVxuICAgICAgcmV0dXJuIEVMRU1FTlRTXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZW1pdENvdW50ICgpIHtcbiAgICAgIHZhciBkZWZuID0gZHJhd09wdGlvbnMuY291bnRcbiAgICAgIHZhciBDT1VOVFxuICAgICAgdmFyIHNjb3BlID0gb3V0ZXJcbiAgICAgIGlmIChkZWZuKSB7XG4gICAgICAgIGlmICghZGVmbi5iYXRjaFN0YXRpYykge1xuICAgICAgICAgIHNjb3BlID0gaW5uZXJcbiAgICAgICAgfVxuICAgICAgICBDT1VOVCA9IGRlZm4uYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgICAgIFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgQ09VTlQgPSBzY29wZS5kZWYoRFJBV19TVEFURSwgJy4nLCBTX0NPVU5UKVxuICAgICAgfVxuICAgICAgcmV0dXJuIENPVU5UXG4gICAgfVxuXG4gICAgdmFyIEVMRU1FTlRTID0gZW1pdEVsZW1lbnRzKClcbiAgICBmdW5jdGlvbiBlbWl0VmFsdWUgKG5hbWUpIHtcbiAgICAgIHZhciBkZWZuID0gZHJhd09wdGlvbnNbbmFtZV1cbiAgICAgIGlmIChkZWZuKSB7XG4gICAgICAgIGlmIChkZWZuLmJhdGNoU3RhdGljKSB7XG4gICAgICAgICAgcmV0dXJuIGRlZm4uYXBwZW5kKGVudiwgb3V0ZXIpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIGRlZm4uYXBwZW5kKGVudiwgaW5uZXIpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBvdXRlci5kZWYoRFJBV19TVEFURSwgJy4nLCBuYW1lKVxuICAgICAgfVxuICAgIH1cblxuICAgIHZhciBQUklNSVRJVkUgPSBlbWl0VmFsdWUoU19QUklNSVRJVkUpXG4gICAgdmFyIE9GRlNFVCA9IGVtaXRWYWx1ZShTX09GRlNFVClcblxuICAgIHZhciBDT1VOVCA9IGVtaXRDb3VudCgpXG4gICAgaWYgKHR5cGVvZiBDT1VOVCA9PT0gJ251bWJlcicpIHtcbiAgICAgIGlmIChDT1VOVCA9PT0gMCkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgaW5uZXIoJ2lmKCcsIENPVU5ULCAnKXsnKVxuICAgICAgaW5uZXIuZXhpdCgnfScpXG4gICAgfVxuXG4gICAgdmFyIElOU1RBTkNFUywgRVhUX0lOU1RBTkNJTkdcbiAgICBpZiAoZXh0SW5zdGFuY2luZykge1xuICAgICAgSU5TVEFOQ0VTID0gZW1pdFZhbHVlKFNfSU5TVEFOQ0VTKVxuICAgICAgRVhUX0lOU1RBTkNJTkcgPSBlbnYuaW5zdGFuY2luZ1xuICAgIH1cblxuICAgIHZhciBFTEVNRU5UX1RZUEUgPSBFTEVNRU5UUyArICcudHlwZSdcblxuICAgIHZhciBlbGVtZW50c1N0YXRpYyA9IGRyYXdPcHRpb25zLmVsZW1lbnRzICYmIGlzU3RhdGljKGRyYXdPcHRpb25zLmVsZW1lbnRzKVxuXG4gICAgZnVuY3Rpb24gZW1pdEluc3RhbmNpbmcgKCkge1xuICAgICAgZnVuY3Rpb24gZHJhd0VsZW1lbnRzICgpIHtcbiAgICAgICAgaW5uZXIoRVhUX0lOU1RBTkNJTkcsICcuZHJhd0VsZW1lbnRzSW5zdGFuY2VkQU5HTEUoJywgW1xuICAgICAgICAgIFBSSU1JVElWRSxcbiAgICAgICAgICBDT1VOVCxcbiAgICAgICAgICBFTEVNRU5UX1RZUEUsXG4gICAgICAgICAgT0ZGU0VUICsgJzw8KCgnICsgRUxFTUVOVF9UWVBFICsgJy0nICsgR0xfVU5TSUdORURfQllURSArICcpPj4xKScsXG4gICAgICAgICAgSU5TVEFOQ0VTXG4gICAgICAgIF0sICcpOycpXG4gICAgICB9XG5cbiAgICAgIGZ1bmN0aW9uIGRyYXdBcnJheXMgKCkge1xuICAgICAgICBpbm5lcihFWFRfSU5TVEFOQ0lORywgJy5kcmF3QXJyYXlzSW5zdGFuY2VkQU5HTEUoJyxcbiAgICAgICAgICBbUFJJTUlUSVZFLCBPRkZTRVQsIENPVU5ULCBJTlNUQU5DRVNdLCAnKTsnKVxuICAgICAgfVxuXG4gICAgICBpZiAoRUxFTUVOVFMpIHtcbiAgICAgICAgaWYgKCFlbGVtZW50c1N0YXRpYykge1xuICAgICAgICAgIGlubmVyKCdpZignLCBFTEVNRU5UUywgJyl7JylcbiAgICAgICAgICBkcmF3RWxlbWVudHMoKVxuICAgICAgICAgIGlubmVyKCd9ZWxzZXsnKVxuICAgICAgICAgIGRyYXdBcnJheXMoKVxuICAgICAgICAgIGlubmVyKCd9JylcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBkcmF3RWxlbWVudHMoKVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkcmF3QXJyYXlzKClcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBlbWl0UmVndWxhciAoKSB7XG4gICAgICBmdW5jdGlvbiBkcmF3RWxlbWVudHMgKCkge1xuICAgICAgICBpbm5lcihHTCArICcuZHJhd0VsZW1lbnRzKCcgKyBbXG4gICAgICAgICAgUFJJTUlUSVZFLFxuICAgICAgICAgIENPVU5ULFxuICAgICAgICAgIEVMRU1FTlRfVFlQRSxcbiAgICAgICAgICBPRkZTRVQgKyAnPDwoKCcgKyBFTEVNRU5UX1RZUEUgKyAnLScgKyBHTF9VTlNJR05FRF9CWVRFICsgJyk+PjEpJ1xuICAgICAgICBdICsgJyk7JylcbiAgICAgIH1cblxuICAgICAgZnVuY3Rpb24gZHJhd0FycmF5cyAoKSB7XG4gICAgICAgIGlubmVyKEdMICsgJy5kcmF3QXJyYXlzKCcgKyBbUFJJTUlUSVZFLCBPRkZTRVQsIENPVU5UXSArICcpOycpXG4gICAgICB9XG5cbiAgICAgIGlmIChFTEVNRU5UUykge1xuICAgICAgICBpZiAoIWVsZW1lbnRzU3RhdGljKSB7XG4gICAgICAgICAgaW5uZXIoJ2lmKCcsIEVMRU1FTlRTLCAnKXsnKVxuICAgICAgICAgIGRyYXdFbGVtZW50cygpXG4gICAgICAgICAgaW5uZXIoJ31lbHNleycpXG4gICAgICAgICAgZHJhd0FycmF5cygpXG4gICAgICAgICAgaW5uZXIoJ30nKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGRyYXdFbGVtZW50cygpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRyYXdBcnJheXMoKVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChleHRJbnN0YW5jaW5nICYmICh0eXBlb2YgSU5TVEFOQ0VTICE9PSAnbnVtYmVyJyB8fCBJTlNUQU5DRVMgPj0gMCkpIHtcbiAgICAgIGlmICh0eXBlb2YgSU5TVEFOQ0VTID09PSAnc3RyaW5nJykge1xuICAgICAgICBpbm5lcignaWYoJywgSU5TVEFOQ0VTLCAnPjApeycpXG4gICAgICAgIGVtaXRJbnN0YW5jaW5nKClcbiAgICAgICAgaW5uZXIoJ31lbHNlIGlmKCcsIElOU1RBTkNFUywgJzwwKXsnKVxuICAgICAgICBlbWl0UmVndWxhcigpXG4gICAgICAgIGlubmVyKCd9JylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGVtaXRJbnN0YW5jaW5nKClcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgZW1pdFJlZ3VsYXIoKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZUJvZHkgKGVtaXRCb2R5LCBwYXJlbnRFbnYsIGFyZ3MsIHByb2dyYW0sIGNvdW50KSB7XG4gICAgdmFyIGVudiA9IGNyZWF0ZVJFR0xFbnZpcm9ubWVudCgpXG4gICAgdmFyIHNjb3BlID0gZW52LnByb2MoJ2JvZHknLCBjb3VudClcbiAgICBcbiAgICBpZiAoZXh0SW5zdGFuY2luZykge1xuICAgICAgZW52Lmluc3RhbmNpbmcgPSBzY29wZS5kZWYoXG4gICAgICAgIGVudi5zaGFyZWQuZXh0ZW5zaW9ucywgJy5hbmdsZV9pbnN0YW5jZWRfYXJyYXlzJylcbiAgICB9XG4gICAgZW1pdEJvZHkoZW52LCBzY29wZSwgYXJncywgcHJvZ3JhbSlcbiAgICByZXR1cm4gZW52LmNvbXBpbGUoKS5ib2R5XG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIERSQVcgUFJPQ1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIGVtaXREcmF3Qm9keSAoZW52LCBkcmF3LCBhcmdzLCBwcm9ncmFtKSB7XG4gICAgaW5qZWN0RXh0ZW5zaW9ucyhlbnYsIGRyYXcpXG5cbiAgICBlbWl0QXR0cmlidXRlcyhlbnYsIGRyYXcsIGFyZ3MsIHByb2dyYW0uYXR0cmlidXRlcywgZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIHRydWVcbiAgICB9KVxuICAgIGVtaXRVbmlmb3JtcyhlbnYsIGRyYXcsIGFyZ3MsIHByb2dyYW0udW5pZm9ybXMsIGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiB0cnVlXG4gICAgfSlcbiAgICBlbWl0RHJhdyhlbnYsIGRyYXcsIGRyYXcsIGFyZ3MpXG4gIH1cblxuICBmdW5jdGlvbiBlbWl0RHJhd1Byb2MgKGVudiwgYXJncykge1xuICAgIHZhciBkcmF3ID0gZW52LnByb2MoJ2RyYXcnLCAxKVxuXG4gICAgaW5qZWN0RXh0ZW5zaW9ucyhlbnYsIGRyYXcpXG5cbiAgICBlbWl0Q29udGV4dChlbnYsIGRyYXcsIGFyZ3MuY29udGV4dClcbiAgICBlbWl0UG9sbEZyYW1lYnVmZmVyKGVudiwgZHJhdywgYXJncy5mcmFtZWJ1ZmZlcilcbiAgICBlbWl0UG9sbFN0YXRlKGVudiwgZHJhdywgYXJncylcbiAgICBlbWl0U2V0T3B0aW9ucyhlbnYsIGRyYXcsIGFyZ3Muc3RhdGUpXG5cbiAgICB2YXIgcHJvZ3JhbSA9IGFyZ3Muc2hhZGVyLnByb2dWYXIuYXBwZW5kKGVudiwgZHJhdylcbiAgICBkcmF3KGVudi5zaGFyZWQuZ2wsICcudXNlUHJvZ3JhbSgnLCBwcm9ncmFtLCAnLnByb2dyYW0pOycpXG5cbiAgICBpZiAoYXJncy5zaGFkZXIucHJvZ3JhbSkge1xuICAgICAgZW1pdERyYXdCb2R5KGVudiwgZHJhdywgYXJncywgYXJncy5zaGFkZXIucHJvZ3JhbSlcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGRyYXdDYWNoZSA9IGVudi5nbG9iYWwuZGVmKCd7fScpXG4gICAgICB2YXIgUFJPR19JRCA9IGRyYXcuZGVmKHByb2dyYW0sICcuaWQnKVxuICAgICAgdmFyIENBQ0hFRF9QUk9DID0gZHJhdy5kZWYoZHJhd0NhY2hlLCAnWycsIFBST0dfSUQsICddJylcbiAgICAgIGRyYXcoXG4gICAgICAgIGVudi5jb25kKENBQ0hFRF9QUk9DKVxuICAgICAgICAgIC50aGVuKENBQ0hFRF9QUk9DLCAnLmNhbGwodGhpcyxhMCk7JylcbiAgICAgICAgICAuZWxzZShcbiAgICAgICAgICAgIENBQ0hFRF9QUk9DLCAnPScsIGRyYXdDYWNoZSwgJ1snLCBQUk9HX0lELCAnXT0nLFxuICAgICAgICAgICAgZW52LmxpbmsoZnVuY3Rpb24gKHByb2dyYW0pIHtcbiAgICAgICAgICAgICAgcmV0dXJuIGNyZWF0ZUJvZHkoZW1pdERyYXdCb2R5LCBlbnYsIGFyZ3MsIHByb2dyYW0sIDEpXG4gICAgICAgICAgICB9KSwgJygnLCBwcm9ncmFtLCAnKTsnLFxuICAgICAgICAgICAgQ0FDSEVEX1BST0MsICcuY2FsbCh0aGlzLGEwKTsnKSlcbiAgICB9XG5cbiAgICBpZiAoT2JqZWN0LmtleXMoYXJncy5zdGF0ZSkubGVuZ3RoID4gMCkge1xuICAgICAgZHJhdyhlbnYuc2hhcmVkLmN1cnJlbnQsICcuZGlydHk9dHJ1ZTsnKVxuICAgIH1cbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gQkFUQ0ggUFJPQ1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgZnVuY3Rpb24gZW1pdEJhdGNoRHluYW1pY1NoYWRlckJvZHkgKGVudiwgc2NvcGUsIGFyZ3MsIHByb2dyYW0pIHtcbiAgICBlbnYuYmF0Y2hJZCA9ICdhMSdcblxuICAgIGluamVjdEV4dGVuc2lvbnMoZW52LCBzY29wZSlcblxuICAgIGZ1bmN0aW9uIGFsbCAoKSB7XG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIH1cblxuICAgIGVtaXRBdHRyaWJ1dGVzKGVudiwgc2NvcGUsIGFyZ3MsIHByb2dyYW0uYXR0cmlidXRlcywgYWxsKVxuICAgIGVtaXRVbmlmb3JtcyhlbnYsIHNjb3BlLCBhcmdzLCBwcm9ncmFtLnVuaWZvcm1zLCBhbGwpXG4gICAgZW1pdERyYXcoZW52LCBzY29wZSwgc2NvcGUsIGFyZ3MpXG4gIH1cblxuICBmdW5jdGlvbiBlbWl0QmF0Y2hCb2R5IChlbnYsIHNjb3BlLCBhcmdzLCBwcm9ncmFtKSB7XG4gICAgaW5qZWN0RXh0ZW5zaW9ucyhlbnYsIHNjb3BlKVxuXG4gICAgdmFyIGNvbnRleHREeW5hbWljID0gYXJncy5jb250ZXh0RHluYW1pY1xuXG4gICAgdmFyIEJBVENIX0lEID0gc2NvcGUuZGVmKClcbiAgICB2YXIgUFJPUF9MSVNUID0gJ2EwJ1xuICAgIHZhciBOVU1fUFJPUFMgPSAnYTEnXG4gICAgdmFyIFBST1BTID0gc2NvcGUuZGVmKClcbiAgICBlbnYuc2hhcmVkLnByb3BzID0gUFJPUFNcbiAgICBlbnYuYmF0Y2hJZCA9IEJBVENIX0lEXG5cbiAgICB2YXIgb3V0ZXIgPSBlbnYuc2NvcGUoKVxuICAgIHZhciBpbm5lciA9IGVudi5zY29wZSgpXG5cbiAgICBzY29wZShcbiAgICAgIG91dGVyLmVudHJ5LFxuICAgICAgJ2ZvcignLCBCQVRDSF9JRCwgJz0wOycsIEJBVENIX0lELCAnPCcsIE5VTV9QUk9QUywgJzsrKycsIEJBVENIX0lELCAnKXsnLFxuICAgICAgUFJPUFMsICc9JywgUFJPUF9MSVNULCAnWycsIEJBVENIX0lELCAnXTsnLFxuICAgICAgaW5uZXIsXG4gICAgICAnfScsXG4gICAgICBvdXRlci5leGl0KVxuXG4gICAgZnVuY3Rpb24gaXNJbm5lckRlZm4gKGRlZm4pIHtcbiAgICAgIHJldHVybiAoKGRlZm4uY29udGV4dERlcCAmJiBjb250ZXh0RHluYW1pYykgfHwgZGVmbi5wcm9wRGVwKVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGlzT3V0ZXJEZWZuIChkZWZuKSB7XG4gICAgICByZXR1cm4gIWlzSW5uZXJEZWZuKGRlZm4pXG4gICAgfVxuXG4gICAgaWYgKGFyZ3MubmVlZHNDb250ZXh0KSB7XG4gICAgICBlbWl0Q29udGV4dChlbnYsIGlubmVyLCBhcmdzLmNvbnRleHQpXG4gICAgfVxuICAgIGlmIChhcmdzLm5lZWRzRnJhbWVidWZmZXIpIHtcbiAgICAgIGVtaXRQb2xsRnJhbWVidWZmZXIoZW52LCBpbm5lciwgYXJncy5mcmFtZWJ1ZmZlcilcbiAgICB9XG4gICAgZW1pdFNldE9wdGlvbnMoZW52LCBpbm5lciwgYXJncy5zdGF0ZSwgaXNJbm5lckRlZm4pXG5cbiAgICBpZiAoIXByb2dyYW0pIHtcbiAgICAgIHZhciBwcm9nQ2FjaGUgPSBlbnYuZ2xvYmFsLmRlZigne30nKVxuICAgICAgdmFyIFBST0dSQU0gPSBhcmdzLnNoYWRlci5wcm9nVmFyLmFwcGVuZChlbnYsIGlubmVyKVxuICAgICAgdmFyIFBST0dfSUQgPSBpbm5lci5kZWYoUFJPR1JBTSwgJy5pZCcpXG4gICAgICB2YXIgQ0FDSEVEX1BST0MgPSBpbm5lci5kZWYocHJvZ0NhY2hlLCAnWycsIFBST0dfSUQsICddJylcbiAgICAgIGlubmVyKFxuICAgICAgICBlbnYuc2hhcmVkLmdsLCAnLnVzZVByb2dyYW0oJywgUFJPR1JBTSwgJy5wcm9ncmFtKTsnLFxuICAgICAgICAnaWYoIScsIENBQ0hFRF9QUk9DLCAnKXsnLFxuICAgICAgICBDQUNIRURfUFJPQywgJz0nLCBwcm9nQ2FjaGUsICdbJywgUFJPR19JRCwgJ109JyxcbiAgICAgICAgZW52LmxpbmsoZnVuY3Rpb24gKHByb2dyYW0pIHtcbiAgICAgICAgICByZXR1cm4gY3JlYXRlQm9keShcbiAgICAgICAgICAgIGVtaXRCYXRjaER5bmFtaWNTaGFkZXJCb2R5LCBlbnYsIGFyZ3MsIHByb2dyYW0sIDIpXG4gICAgICAgIH0pLCAnKCcsIFBST0dSQU0sICcpO30nLFxuICAgICAgICBDQUNIRURfUFJPQywgJy5jYWxsKHRoaXMsYTBbJywgQkFUQ0hfSUQsICddLCcsIEJBVENIX0lELCAnKTsnKVxuICAgIH0gZWxzZSB7XG4gICAgICBlbWl0QXR0cmlidXRlcyhlbnYsIG91dGVyLCBhcmdzLCBwcm9ncmFtLmF0dHJpYnV0ZXMsIGlzT3V0ZXJEZWZuKVxuICAgICAgZW1pdEF0dHJpYnV0ZXMoZW52LCBpbm5lciwgYXJncywgcHJvZ3JhbS5hdHRyaWJ1dGVzLCBpc0lubmVyRGVmbilcbiAgICAgIGVtaXRVbmlmb3JtcyhlbnYsIG91dGVyLCBhcmdzLCBwcm9ncmFtLnVuaWZvcm1zLCBpc091dGVyRGVmbilcbiAgICAgIGVtaXRVbmlmb3JtcyhlbnYsIGlubmVyLCBhcmdzLCBwcm9ncmFtLnVuaWZvcm1zLCBpc0lubmVyRGVmbilcbiAgICAgIGVtaXREcmF3KGVudiwgb3V0ZXIsIGlubmVyLCBhcmdzKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGVtaXRCYXRjaFByb2MgKGVudiwgYXJncykge1xuICAgIHZhciBiYXRjaCA9IGVudi5wcm9jKCdiYXRjaCcsIDIpXG4gICAgZW52LmJhdGNoSWQgPSAnMCdcblxuICAgIGluamVjdEV4dGVuc2lvbnMoZW52LCBiYXRjaClcblxuICAgIC8vIENoZWNrIGlmIGFueSBjb250ZXh0IHZhcmlhYmxlcyBkZXBlbmQgb24gcHJvcHNcbiAgICB2YXIgY29udGV4dER5bmFtaWMgPSBmYWxzZVxuICAgIHZhciBuZWVkc0NvbnRleHQgPSB0cnVlXG4gICAgT2JqZWN0LmtleXMoYXJncy5jb250ZXh0KS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICBjb250ZXh0RHluYW1pYyA9IGNvbnRleHREeW5hbWljIHx8IGFyZ3MuY29udGV4dFtuYW1lXS5wcm9wRGVwXG4gICAgfSlcbiAgICBpZiAoIWNvbnRleHREeW5hbWljKSB7XG4gICAgICBlbWl0Q29udGV4dChlbnYsIGJhdGNoLCBhcmdzLmNvbnRleHQpXG4gICAgICBuZWVkc0NvbnRleHQgPSBmYWxzZVxuICAgIH1cblxuICAgIC8vIGZyYW1lYnVmZmVyIHN0YXRlIGFmZmVjdHMgZnJhbWVidWZmZXJXaWR0aC9oZWlnaHQgY29udGV4dCB2YXJzXG4gICAgdmFyIGZyYW1lYnVmZmVyID0gYXJncy5mcmFtZWJ1ZmZlclxuICAgIHZhciBuZWVkc0ZyYW1lYnVmZmVyID0gZmFsc2VcbiAgICBpZiAoZnJhbWVidWZmZXIpIHtcbiAgICAgIGlmIChmcmFtZWJ1ZmZlci5wcm9wRGVwKSB7XG4gICAgICAgIGNvbnRleHREeW5hbWljID0gbmVlZHNGcmFtZWJ1ZmZlciA9IHRydWVcbiAgICAgIH0gZWxzZSBpZiAoZnJhbWVidWZmZXIuY29udGV4dERlcCAmJiBjb250ZXh0RHluYW1pYykge1xuICAgICAgICBuZWVkc0ZyYW1lYnVmZmVyID0gdHJ1ZVxuICAgICAgfVxuICAgICAgaWYgKCFuZWVkc0ZyYW1lYnVmZmVyKSB7XG4gICAgICAgIGVtaXRQb2xsRnJhbWVidWZmZXIoZW52LCBiYXRjaCwgZnJhbWVidWZmZXIpXG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gdmlld3BvcnQgaXMgd2VpcmQgYmVjYXVzZSBpdCBjYW4gYWZmZWN0IGNvbnRleHQgdmFyc1xuICAgIGlmIChhcmdzLnN0YXRlLnZpZXdwb3J0ICYmIGFyZ3Muc3RhdGUudmlld3BvcnQucHJvcER5bmFtaWMpIHtcbiAgICAgIGNvbnRleHREeW5hbWljID0gdHJ1ZVxuICAgIH1cblxuICAgIC8vIHNldCB3ZWJnbCBvcHRpb25zXG4gICAgZW1pdFBvbGxTdGF0ZShlbnYsIGJhdGNoLCBhcmdzKVxuICAgIGVtaXRTZXRPcHRpb25zKGVudiwgYmF0Y2gsIGFyZ3Muc3RhdGUsIGZ1bmN0aW9uIChkZWZuKSB7XG4gICAgICByZXR1cm4gISgoZGVmbi5jb250ZXh0RGVwICYmIGNvbnRleHREeW5hbWljKSB8fCBkZWZuLnByb3BEZXApXG4gICAgfSlcblxuICAgIC8vIFNhdmUgdGhlc2UgdmFsdWVzIHRvIGFyZ3Mgc28gdGhhdCB0aGUgYmF0Y2ggYm9keSByb3V0aW5lIGNhbiB1c2UgdGhlbVxuICAgIGFyZ3MuY29udGV4dERlcCA9IGNvbnRleHREeW5hbWljXG4gICAgYXJncy5uZWVkc0NvbnRleHQgPSBuZWVkc0NvbnRleHRcbiAgICBhcmdzLm5lZWRzRnJhbWVidWZmZXIgPSBuZWVkc0ZyYW1lYnVmZmVyXG5cbiAgICAvLyBkZXRlcm1pbmUgaWYgc2hhZGVyIGlzIGR5bmFtaWNcbiAgICB2YXIgcHJvZ0RlZm4gPSBhcmdzLnNoYWRlci5wcm9nVmFyXG4gICAgaWYgKChwcm9nRGVmbi5jb250ZXh0RGVwICYmIGNvbnRleHREeW5hbWljKSB8fCBwcm9nRGVmbi5wcm9wRGVwKSB7XG4gICAgICBlbWl0QmF0Y2hCb2R5KFxuICAgICAgICBlbnYsXG4gICAgICAgIGJhdGNoLFxuICAgICAgICBhcmdzLFxuICAgICAgICBudWxsKVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgUFJPR1JBTSA9IHByb2dEZWZuLmFwcGVuZChlbnYsIGJhdGNoKVxuICAgICAgYmF0Y2goZW52LnNoYXJlZC5nbCwgJy51c2VQcm9ncmFtKCcsIFBST0dSQU0sICcucHJvZ3JhbSk7JylcbiAgICAgIGlmIChhcmdzLnNoYWRlci5wcm9ncmFtKSB7XG4gICAgICAgIGVtaXRCYXRjaEJvZHkoXG4gICAgICAgICAgZW52LFxuICAgICAgICAgIGJhdGNoLFxuICAgICAgICAgIGFyZ3MsXG4gICAgICAgICAgYXJncy5zaGFkZXIucHJvZ3JhbSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBiYXRjaENhY2hlID0gZW52Lmdsb2JhbC5kZWYoJ3t9JylcbiAgICAgICAgdmFyIFBST0dfSUQgPSBiYXRjaC5kZWYoUFJPR1JBTSwgJy5pZCcpXG4gICAgICAgIHZhciBDQUNIRURfUFJPQyA9IGJhdGNoLmRlZihiYXRjaENhY2hlLCAnWycsIFBST0dfSUQsICddJylcbiAgICAgICAgYmF0Y2goXG4gICAgICAgICAgZW52LmNvbmQoQ0FDSEVEX1BST0MpXG4gICAgICAgICAgICAudGhlbihDQUNIRURfUFJPQywgJy5jYWxsKHRoaXMsYTAsYTEpOycpXG4gICAgICAgICAgICAuZWxzZShcbiAgICAgICAgICAgICAgQ0FDSEVEX1BST0MsICc9JywgYmF0Y2hDYWNoZSwgJ1snLCBQUk9HX0lELCAnXT0nLFxuICAgICAgICAgICAgICBlbnYubGluayhmdW5jdGlvbiAocHJvZ3JhbSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBjcmVhdGVCb2R5KGVtaXRCYXRjaEJvZHksIGVudiwgYXJncywgcHJvZ3JhbSwgMilcbiAgICAgICAgICAgICAgfSksICcoJywgUFJPR1JBTSwgJyk7JyxcbiAgICAgICAgICAgICAgQ0FDSEVEX1BST0MsICcuY2FsbCh0aGlzLGEwLGExKTsnKSlcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoT2JqZWN0LmtleXMoYXJncy5zdGF0ZSkubGVuZ3RoID4gMCkge1xuICAgICAgYmF0Y2goZW52LnNoYXJlZC5jdXJyZW50LCAnLmRpcnR5PXRydWU7JylcbiAgICB9XG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIFNDT1BFIENPTU1BTkRcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICBmdW5jdGlvbiBlbWl0U2NvcGVQcm9jIChlbnYsIGFyZ3MpIHtcbiAgICB2YXIgc2NvcGUgPSBlbnYucHJvYygnc2NvcGUnLCAzKVxuICAgIGVudi5iYXRjaElkID0gJ2EyJ1xuXG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcbiAgICB2YXIgQ1VSUkVOVF9TVEFURSA9IHNoYXJlZC5jdXJyZW50XG5cbiAgICBlbWl0Q29udGV4dChlbnYsIHNjb3BlLCBhcmdzLmNvbnRleHQpXG5cbiAgICBpZiAoYXJncy5mcmFtZWJ1ZmZlcikge1xuICAgICAgYXJncy5mcmFtZWJ1ZmZlci5hcHBlbmQoZW52LCBzY29wZSlcbiAgICB9XG5cbiAgICBzb3J0U3RhdGUoT2JqZWN0LmtleXMoYXJncy5zdGF0ZSkpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHZhciBkZWZuID0gYXJncy5zdGF0ZVtuYW1lXVxuICAgICAgdmFyIHZhbHVlID0gZGVmbi5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuICAgICAgICB2YWx1ZS5mb3JFYWNoKGZ1bmN0aW9uICh2LCBpKSB7XG4gICAgICAgICAgc2NvcGUuc2V0KGVudi5uZXh0W25hbWVdLCAnWycgKyBpICsgJ10nLCB2KVxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2NvcGUuc2V0KHNoYXJlZC5uZXh0LCAnLicgKyBuYW1lLCB2YWx1ZSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgO1tTX0VMRU1FTlRTLCBTX09GRlNFVCwgU19DT1VOVCwgU19JTlNUQU5DRVMsIFNfUFJJTUlUSVZFXS5mb3JFYWNoKFxuICAgICAgZnVuY3Rpb24gKG9wdCkge1xuICAgICAgICB2YXIgdmFyaWFibGUgPSBhcmdzLmRyYXdbb3B0XVxuICAgICAgICBpZiAoIXZhcmlhYmxlKSB7XG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cbiAgICAgICAgc2NvcGUuc2V0KHNoYXJlZC5kcmF3LCAnLicgKyBvcHQsICcnICsgdmFyaWFibGUuYXBwZW5kKGVudiwgc2NvcGUpKVxuICAgICAgfSlcblxuICAgIE9iamVjdC5rZXlzKGFyZ3MudW5pZm9ybXMpLmZvckVhY2goZnVuY3Rpb24gKG9wdCkge1xuICAgICAgc2NvcGUuc2V0KFxuICAgICAgICBzaGFyZWQudW5pZm9ybXMsXG4gICAgICAgICdbJyArIHN0cmluZ1N0b3JlLmlkKG9wdCkgKyAnXScsXG4gICAgICAgIGFyZ3MudW5pZm9ybXNbb3B0XS5hcHBlbmQoZW52LCBzY29wZSkpXG4gICAgfSlcblxuICAgIE9iamVjdC5rZXlzKGFyZ3MuYXR0cmlidXRlcykuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgdmFyIHJlY29yZCA9IGFyZ3MuYXR0cmlidXRlc1tuYW1lXS5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgIHZhciBzY29wZUF0dHJpYiA9IGVudi5zY29wZUF0dHJpYihuYW1lKVxuICAgICAgT2JqZWN0LmtleXMobmV3IEF0dHJpYnV0ZVJlY29yZCgpKS5mb3JFYWNoKGZ1bmN0aW9uIChwcm9wKSB7XG4gICAgICAgIHNjb3BlLnNldChzY29wZUF0dHJpYiwgJy4nICsgcHJvcCwgcmVjb3JkW3Byb3BdKVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgZnVuY3Rpb24gc2F2ZVNoYWRlciAobmFtZSkge1xuICAgICAgdmFyIHNoYWRlciA9IGFyZ3Muc2hhZGVyW25hbWVdXG4gICAgICBpZiAoc2hhZGVyKSB7XG4gICAgICAgIHNjb3BlLnNldChzaGFyZWQuc2hhZGVyLCAnLicgKyBuYW1lLCBzaGFkZXIuYXBwZW5kKGVudiwgc2NvcGUpKVxuICAgICAgfVxuICAgIH1cbiAgICBzYXZlU2hhZGVyKFNfVkVSVClcbiAgICBzYXZlU2hhZGVyKFNfRlJBRylcblxuICAgIGlmIChPYmplY3Qua2V5cyhhcmdzLnN0YXRlKS5sZW5ndGggPiAwKSB7XG4gICAgICBzY29wZShDVVJSRU5UX1NUQVRFLCAnLmRpcnR5PXRydWU7JylcbiAgICAgIHNjb3BlLmV4aXQoQ1VSUkVOVF9TVEFURSwgJy5kaXJ0eT10cnVlOycpXG4gICAgfVxuXG4gICAgc2NvcGUoJ2ExKCcsIGVudi5zaGFyZWQuY29udGV4dCwgJyxhMCwwKTsnKVxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBNQUlOIERSQVcgQ09NTUFORFxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIGNvbXBpbGVDb21tYW5kIChvcHRpb25zLCBhdHRyaWJ1dGVzLCB1bmlmb3JtcywgY29udGV4dCkge1xuICAgIHZhciBlbnYgPSBjcmVhdGVSRUdMRW52aXJvbm1lbnQoKVxuICAgIHZhciBhcmdzID0gcGFyc2VBcmd1bWVudHMob3B0aW9ucywgYXR0cmlidXRlcywgdW5pZm9ybXMsIGNvbnRleHQpXG5cbiAgICBlbWl0RHJhd1Byb2MoZW52LCBhcmdzKVxuICAgIGVtaXRTY29wZVByb2MoZW52LCBhcmdzKVxuICAgIGVtaXRCYXRjaFByb2MoZW52LCBhcmdzKVxuXG4gICAgcmV0dXJuIGVudi5jb21waWxlKClcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gUE9MTCAvIFJFRlJFU0hcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICByZXR1cm4ge1xuICAgIG5leHQ6IG5leHRTdGF0ZSxcbiAgICBjdXJyZW50OiBjdXJyZW50U3RhdGUsXG4gICAgcHJvY3M6IChmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgZW52ID0gY3JlYXRlUkVHTEVudmlyb25tZW50KClcbiAgICAgIHZhciBwb2xsID0gZW52LnByb2MoJ3BvbGwnKVxuICAgICAgdmFyIHJlZnJlc2ggPSBlbnYucHJvYygncmVmcmVzaCcpXG4gICAgICB2YXIgY29tbW9uID0gZW52LmJsb2NrKClcbiAgICAgIHBvbGwoY29tbW9uKVxuICAgICAgcmVmcmVzaChjb21tb24pXG5cbiAgICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgICB2YXIgR0wgPSBzaGFyZWQuZ2xcbiAgICAgIHZhciBORVhUX1NUQVRFID0gc2hhcmVkLm5leHRcbiAgICAgIHZhciBDVVJSRU5UX1NUQVRFID0gc2hhcmVkLmN1cnJlbnRcblxuICAgICAgY29tbW9uKENVUlJFTlRfU1RBVEUsICcuZGlydHk9ZmFsc2U7JylcblxuICAgICAgZW1pdFBvbGxGcmFtZWJ1ZmZlcihlbnYsIHBvbGwpXG5cbiAgICAgIHJlZnJlc2goc2hhcmVkLmZyYW1lYnVmZmVyLCAnLmRpcnR5PXRydWU7JylcbiAgICAgIGVtaXRQb2xsRnJhbWVidWZmZXIoZW52LCByZWZyZXNoKVxuXG4gICAgICAvLyBGSVhNRTogcmVmcmVzaCBzaG91bGQgdXBkYXRlIHZlcnRleCBhdHRyaWJ1dGUgcG9pbnRlcnNcblxuICAgICAgT2JqZWN0LmtleXMoR0xfRkxBR1MpLmZvckVhY2goZnVuY3Rpb24gKGZsYWcpIHtcbiAgICAgICAgdmFyIGNhcCA9IEdMX0ZMQUdTW2ZsYWddXG4gICAgICAgIHZhciBORVhUID0gY29tbW9uLmRlZihORVhUX1NUQVRFLCAnLicsIGZsYWcpXG4gICAgICAgIHZhciBibG9jayA9IGVudi5ibG9jaygpXG4gICAgICAgIGJsb2NrKCdpZignLCBORVhULCAnKXsnLFxuICAgICAgICAgIEdMLCAnLmVuYWJsZSgnLCBjYXAsICcpfWVsc2V7JyxcbiAgICAgICAgICBHTCwgJy5kaXNhYmxlKCcsIGNhcCwgJyl9JyxcbiAgICAgICAgICBDVVJSRU5UX1NUQVRFLCAnLicsIGZsYWcsICc9JywgTkVYVCwgJzsnKVxuICAgICAgICByZWZyZXNoKGJsb2NrKVxuICAgICAgICBwb2xsKFxuICAgICAgICAgICdpZignLCBORVhULCAnIT09JywgQ1VSUkVOVF9TVEFURSwgJy4nLCBmbGFnLCAnKXsnLFxuICAgICAgICAgIGJsb2NrLFxuICAgICAgICAgICd9JylcbiAgICAgIH0pXG5cbiAgICAgIE9iamVjdC5rZXlzKEdMX1ZBUklBQkxFUykuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgICB2YXIgZnVuYyA9IEdMX1ZBUklBQkxFU1tuYW1lXVxuICAgICAgICB2YXIgaW5pdCA9IGN1cnJlbnRTdGF0ZVtuYW1lXVxuICAgICAgICB2YXIgTkVYVCwgQ1VSUkVOVFxuICAgICAgICB2YXIgYmxvY2sgPSBlbnYuYmxvY2soKVxuICAgICAgICBibG9jayhHTCwgJy4nLCBmdW5jLCAnKCcpXG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KGluaXQpKSB7XG4gICAgICAgICAgdmFyIG4gPSBpbml0Lmxlbmd0aFxuICAgICAgICAgIE5FWFQgPSBlbnYuZ2xvYmFsLmRlZihORVhUX1NUQVRFLCAnLicsIG5hbWUpXG4gICAgICAgICAgQ1VSUkVOVCA9IGVudi5nbG9iYWwuZGVmKENVUlJFTlRfU1RBVEUsICcuJywgbmFtZSlcbiAgICAgICAgICBibG9jayhcbiAgICAgICAgICAgIGxvb3AobiwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIE5FWFQgKyAnWycgKyBpICsgJ10nXG4gICAgICAgICAgICB9KSwgJyk7JyxcbiAgICAgICAgICAgIGxvb3AobiwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIENVUlJFTlQgKyAnWycgKyBpICsgJ109JyArIE5FWFQgKyAnWycgKyBpICsgJ107J1xuICAgICAgICAgICAgfSkuam9pbignJykpXG4gICAgICAgICAgcG9sbChcbiAgICAgICAgICAgICdpZignLCBsb29wKG4sIGZ1bmN0aW9uIChpKSB7XG4gICAgICAgICAgICAgIHJldHVybiBORVhUICsgJ1snICsgaSArICddIT09JyArIENVUlJFTlQgKyAnWycgKyBpICsgJ10nXG4gICAgICAgICAgICB9KS5qb2luKCd8fCcpLCAnKXsnLFxuICAgICAgICAgICAgYmxvY2ssXG4gICAgICAgICAgICAnfScpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgTkVYVCA9IGNvbW1vbi5kZWYoTkVYVF9TVEFURSwgJy4nLCBuYW1lKVxuICAgICAgICAgIENVUlJFTlQgPSBjb21tb24uZGVmKENVUlJFTlRfU1RBVEUsICcuJywgbmFtZSlcbiAgICAgICAgICBibG9jayhcbiAgICAgICAgICAgIE5FWFQsICcpOycsXG4gICAgICAgICAgICBDVVJSRU5UX1NUQVRFLCAnLicsIG5hbWUsICc9JywgTkVYVCwgJzsnKVxuICAgICAgICAgIHBvbGwoXG4gICAgICAgICAgICAnaWYoJywgTkVYVCwgJyE9PScsIENVUlJFTlQsICcpeycsXG4gICAgICAgICAgICBibG9jayxcbiAgICAgICAgICAgICd9JylcbiAgICAgICAgfVxuICAgICAgICByZWZyZXNoKGJsb2NrKVxuICAgICAgfSlcblxuICAgICAgcmV0dXJuIGVudi5jb21waWxlKClcbiAgICB9KSgpLFxuICAgIGNvbXBpbGU6IGNvbXBpbGVDb21tYW5kXG4gIH1cbn1cbiIsIlxuXG52YXIgVkFSSUFCTEVfQ09VTlRFUiA9IDBcblxudmFyIERZTl9GVU5DID0gMFxudmFyIERZTl9QRU5ESU5HX0ZMQUcgPSAxMjhcblxuZnVuY3Rpb24gRHluYW1pY1ZhcmlhYmxlICh0eXBlLCBkYXRhKSB7XG4gIHRoaXMuaWQgPSAoVkFSSUFCTEVfQ09VTlRFUisrKVxuICB0aGlzLnR5cGUgPSB0eXBlXG4gIHRoaXMuZGF0YSA9IGRhdGFcbn1cblxuZnVuY3Rpb24gZXNjYXBlU3RyIChzdHIpIHtcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC9cXFxcL2csICdcXFxcXFxcXCcpLnJlcGxhY2UoL1wiL2csICdcXFxcXCInKVxufVxuXG5mdW5jdGlvbiBzcGxpdFBhcnRzIChzdHIpIHtcbiAgaWYgKHN0ci5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gW11cbiAgfVxuXG4gIHZhciBmaXJzdENoYXIgPSBzdHIuY2hhckF0KDApXG4gIHZhciBsYXN0Q2hhciA9IHN0ci5jaGFyQXQoc3RyLmxlbmd0aCAtIDEpXG5cbiAgaWYgKHN0ci5sZW5ndGggPiAxICYmXG4gICAgICBmaXJzdENoYXIgPT09IGxhc3RDaGFyICYmXG4gICAgICAoZmlyc3RDaGFyID09PSAnXCInIHx8IGZpcnN0Q2hhciA9PT0gXCInXCIpKSB7XG4gICAgcmV0dXJuIFsnXCInICsgZXNjYXBlU3RyKHN0ci5zdWJzdHIoMSwgc3RyLmxlbmd0aCAtIDIpKSArICdcIiddXG4gIH1cblxuICB2YXIgcGFydHMgPSAvXFxbKGZhbHNlfHRydWV8bnVsbHxcXGQrfCdbXiddKid8XCJbXlwiXSpcIilcXF0vLmV4ZWMoc3RyKVxuICBpZiAocGFydHMpIHtcbiAgICByZXR1cm4gKFxuICAgICAgc3BsaXRQYXJ0cyhzdHIuc3Vic3RyKDAsIHBhcnRzLmluZGV4KSlcbiAgICAgIC5jb25jYXQoc3BsaXRQYXJ0cyhwYXJ0c1sxXSkpXG4gICAgICAuY29uY2F0KHNwbGl0UGFydHMoc3RyLnN1YnN0cihwYXJ0cy5pbmRleCArIHBhcnRzWzBdLmxlbmd0aCkpKVxuICAgIClcbiAgfVxuXG4gIHZhciBzdWJwYXJ0cyA9IHN0ci5zcGxpdCgnLicpXG4gIGlmIChzdWJwYXJ0cy5sZW5ndGggPT09IDEpIHtcbiAgICByZXR1cm4gWydcIicgKyBlc2NhcGVTdHIoc3RyKSArICdcIiddXG4gIH1cblxuICB2YXIgcmVzdWx0ID0gW11cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdWJwYXJ0cy5sZW5ndGg7ICsraSkge1xuICAgIHJlc3VsdCA9IHJlc3VsdC5jb25jYXQoc3BsaXRQYXJ0cyhzdWJwYXJ0c1tpXSkpXG4gIH1cbiAgcmV0dXJuIHJlc3VsdFxufVxuXG5mdW5jdGlvbiB0b0FjY2Vzc29yU3RyaW5nIChzdHIpIHtcbiAgcmV0dXJuICdbJyArIHNwbGl0UGFydHMoc3RyKS5qb2luKCddWycpICsgJ10nXG59XG5cbmZ1bmN0aW9uIGRlZmluZUR5bmFtaWMgKHR5cGUsIGRhdGEpIHtcbiAgc3dpdGNoICh0eXBlb2YgZGF0YSkge1xuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgIGNhc2UgJ251bWJlcic6XG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgIHJldHVybiBuZXcgRHluYW1pY1ZhcmlhYmxlKHR5cGUsIHRvQWNjZXNzb3JTdHJpbmcoZGF0YSArICcnKSlcblxuICAgIGNhc2UgJ3VuZGVmaW5lZCc6XG4gICAgICByZXR1cm4gbmV3IER5bmFtaWNWYXJpYWJsZSh0eXBlIHwgRFlOX1BFTkRJTkdfRkxBRywgbnVsbClcblxuICAgIGRlZmF1bHQ6XG4gICAgICBcbiAgfVxufVxuXG5mdW5jdGlvbiBpc0R5bmFtaWMgKHgpIHtcbiAgcmV0dXJuICh0eXBlb2YgeCA9PT0gJ2Z1bmN0aW9uJyAmJiAheC5fcmVnbFR5cGUpIHx8XG4gICAgICAgICB4IGluc3RhbmNlb2YgRHluYW1pY1ZhcmlhYmxlXG59XG5cbmZ1bmN0aW9uIHVuYm94ICh4LCBwYXRoKSB7XG4gIGlmICh4IGluc3RhbmNlb2YgRHluYW1pY1ZhcmlhYmxlKSB7XG4gICAgaWYgKHgudHlwZSAmIERZTl9QRU5ESU5HX0ZMQUcpIHtcbiAgICAgIHJldHVybiBuZXcgRHluYW1pY1ZhcmlhYmxlKFxuICAgICAgICB4LnR5cGUgJiB+RFlOX1BFTkRJTkdfRkxBRyxcbiAgICAgICAgdG9BY2Nlc3NvclN0cmluZyhwYXRoKSlcbiAgICB9XG4gIH0gZWxzZSBpZiAodHlwZW9mIHggPT09ICdmdW5jdGlvbicpIHtcbiAgICByZXR1cm4gbmV3IER5bmFtaWNWYXJpYWJsZShEWU5fRlVOQywgeClcbiAgfVxuICByZXR1cm4geFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgZGVmaW5lOiBkZWZpbmVEeW5hbWljLFxuICBpc0R5bmFtaWM6IGlzRHluYW1pYyxcbiAgdW5ib3g6IHVuYm94LFxuICBhY2Nlc3NvcjogdG9BY2Nlc3NvclN0cmluZ1xufVxuIiwiXG52YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi91dGlsL2lzLXR5cGVkLWFycmF5JylcbnZhciBpc05EQXJyYXlMaWtlID0gcmVxdWlyZSgnLi91dGlsL2lzLW5kYXJyYXknKVxudmFyIHByaW1UeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL3ByaW1pdGl2ZXMuanNvbicpXG5cbnZhciBHTF9QT0lOVFMgPSAwXG52YXIgR0xfTElORVMgPSAxXG52YXIgR0xfVFJJQU5HTEVTID0gNFxuXG52YXIgR0xfQllURSA9IDUxMjBcbnZhciBHTF9VTlNJR05FRF9CWVRFID0gNTEyMVxudmFyIEdMX1NIT1JUID0gNTEyMlxudmFyIEdMX1VOU0lHTkVEX1NIT1JUID0gNTEyM1xudmFyIEdMX0lOVCA9IDUxMjRcbnZhciBHTF9VTlNJR05FRF9JTlQgPSA1MTI1XG5cbnZhciBHTF9FTEVNRU5UX0FSUkFZX0JVRkZFUiA9IDM0OTYzXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcEVsZW1lbnRzU3RhdGUgKGdsLCBleHRlbnNpb25zLCBidWZmZXJTdGF0ZSkge1xuICBmdW5jdGlvbiBSRUdMRWxlbWVudEJ1ZmZlciAoKSB7XG4gICAgdGhpcy5idWZmZXIgPSBudWxsXG4gICAgdGhpcy5wcmltVHlwZSA9IEdMX1RSSUFOR0xFU1xuICAgIHRoaXMudmVydENvdW50ID0gMFxuICAgIHRoaXMudHlwZSA9IDBcbiAgfVxuXG4gIFJFR0xFbGVtZW50QnVmZmVyLnByb3RvdHlwZS5iaW5kID0gZnVuY3Rpb24gKCkge1xuICAgIHRoaXMuYnVmZmVyLmJpbmQoKVxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlRWxlbWVudHMgKG9wdGlvbnMpIHtcbiAgICB2YXIgZWxlbWVudHMgPSBuZXcgUkVHTEVsZW1lbnRCdWZmZXIoKVxuICAgIHZhciBidWZmZXIgPSBidWZmZXJTdGF0ZS5jcmVhdGUobnVsbCwgR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIsIHRydWUpXG4gICAgZWxlbWVudHMuYnVmZmVyID0gYnVmZmVyLl9idWZmZXJcblxuICAgIGZ1bmN0aW9uIHJlZ2xFbGVtZW50cyAoaW5wdXQpIHtcbiAgICAgIHZhciBvcHRpb25zID0gaW5wdXRcbiAgICAgIHZhciBleHQzMmJpdCA9IGV4dGVuc2lvbnMub2VzX2VsZW1lbnRfaW5kZXhfdWludFxuXG4gICAgICAvLyBVcGxvYWQgZGF0YSB0byB2ZXJ0ZXggYnVmZmVyXG4gICAgICBpZiAoIW9wdGlvbnMpIHtcbiAgICAgICAgYnVmZmVyKClcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIG9wdGlvbnMgPT09ICdudW1iZXInKSB7XG4gICAgICAgIGJ1ZmZlcihvcHRpb25zKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIGRhdGEgPSBudWxsXG4gICAgICAgIHZhciB1c2FnZSA9ICdzdGF0aWMnXG4gICAgICAgIGlmIChcbiAgICAgICAgICBBcnJheS5pc0FycmF5KG9wdGlvbnMpIHx8XG4gICAgICAgICAgaXNUeXBlZEFycmF5KG9wdGlvbnMpIHx8XG4gICAgICAgICAgaXNOREFycmF5TGlrZShvcHRpb25zKSkge1xuICAgICAgICAgIGRhdGEgPSBvcHRpb25zXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKCdkYXRhJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBkYXRhID0gb3B0aW9ucy5kYXRhXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgndXNhZ2UnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIHVzYWdlID0gb3B0aW9ucy51c2FnZVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShkYXRhKSB8fFxuICAgICAgICAgICAgKGlzTkRBcnJheUxpa2UoZGF0YSkgJiYgQXJyYXkuaXNBcnJheShkYXRhLmRhdGEpKSB8fFxuICAgICAgICAgICAgJ3R5cGUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBidWZmZXIoe1xuICAgICAgICAgICAgdHlwZTogb3B0aW9ucy50eXBlIHx8XG4gICAgICAgICAgICAgIChleHQzMmJpdFxuICAgICAgICAgICAgICAgID8gJ3VpbnQzMidcbiAgICAgICAgICAgICAgICA6ICd1aW50MTYnKSxcbiAgICAgICAgICAgIHVzYWdlOiB1c2FnZSxcbiAgICAgICAgICAgIGRhdGE6IGRhdGFcbiAgICAgICAgICB9KVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGJ1ZmZlcih7XG4gICAgICAgICAgICB1c2FnZTogdXNhZ2UsXG4gICAgICAgICAgICBkYXRhOiBkYXRhXG4gICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShkYXRhKSB8fCBpc1R5cGVkQXJyYXkoZGF0YSkpIHtcbiAgICAgICAgICBidWZmZXIuZGltZW5zaW9uID0gM1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIHRyeSB0byBndWVzcyBkZWZhdWx0IHByaW1pdGl2ZSB0eXBlIGFuZCBhcmd1bWVudHNcbiAgICAgIHZhciB2ZXJ0Q291bnQgPSBlbGVtZW50cy5idWZmZXIuYnl0ZUxlbmd0aFxuICAgICAgdmFyIHR5cGUgPSAwXG4gICAgICBzd2l0Y2ggKGVsZW1lbnRzLmJ1ZmZlci5kdHlwZSkge1xuICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX0JZVEU6XG4gICAgICAgIGNhc2UgR0xfQllURTpcbiAgICAgICAgICB0eXBlID0gR0xfVU5TSUdORURfQllURVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9TSE9SVDpcbiAgICAgICAgY2FzZSBHTF9TSE9SVDpcbiAgICAgICAgICB0eXBlID0gR0xfVU5TSUdORURfU0hPUlRcbiAgICAgICAgICB2ZXJ0Q291bnQgPj49IDFcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfVU5TSUdORURfSU5UOlxuICAgICAgICBjYXNlIEdMX0lOVDpcbiAgICAgICAgICBcbiAgICAgICAgICB0eXBlID0gR0xfVU5TSUdORURfSU5UXG4gICAgICAgICAgdmVydENvdW50ID4+PSAyXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIFxuICAgICAgfVxuXG4gICAgICAvLyB0cnkgdG8gZ3Vlc3MgcHJpbWl0aXZlIHR5cGUgZnJvbSBjZWxsIGRpbWVuc2lvblxuICAgICAgdmFyIHByaW1UeXBlID0gR0xfVFJJQU5HTEVTXG4gICAgICB2YXIgZGltZW5zaW9uID0gZWxlbWVudHMuYnVmZmVyLmRpbWVuc2lvblxuICAgICAgaWYgKGRpbWVuc2lvbiA9PT0gMSkgcHJpbVR5cGUgPSBHTF9QT0lOVFNcbiAgICAgIGlmIChkaW1lbnNpb24gPT09IDIpIHByaW1UeXBlID0gR0xfTElORVNcbiAgICAgIGlmIChkaW1lbnNpb24gPT09IDMpIHByaW1UeXBlID0gR0xfVFJJQU5HTEVTXG5cbiAgICAgIC8vIGlmIG1hbnVhbCBvdmVycmlkZSBwcmVzZW50LCB1c2UgdGhhdFxuICAgICAgaWYgKHR5cGVvZiBvcHRpb25zID09PSAnb2JqZWN0Jykge1xuICAgICAgICBpZiAoJ3ByaW1pdGl2ZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHZhciBwcmltaXRpdmUgPSBvcHRpb25zLnByaW1pdGl2ZVxuICAgICAgICAgIFxuICAgICAgICAgIHByaW1UeXBlID0gcHJpbVR5cGVzW3ByaW1pdGl2ZV1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnY291bnQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB2ZXJ0Q291bnQgPSBvcHRpb25zLnZlcnRDb3VudCB8IDBcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyB1cGRhdGUgcHJvcGVydGllcyBmb3IgZWxlbWVudCBidWZmZXJcbiAgICAgIGVsZW1lbnRzLnByaW1UeXBlID0gcHJpbVR5cGVcbiAgICAgIGVsZW1lbnRzLnZlcnRDb3VudCA9IHZlcnRDb3VudFxuICAgICAgZWxlbWVudHMudHlwZSA9IHR5cGVcblxuICAgICAgcmV0dXJuIHJlZ2xFbGVtZW50c1xuICAgIH1cblxuICAgIHJlZ2xFbGVtZW50cyhvcHRpb25zKVxuXG4gICAgcmVnbEVsZW1lbnRzLl9yZWdsVHlwZSA9ICdlbGVtZW50cydcbiAgICByZWdsRWxlbWVudHMuX2VsZW1lbnRzID0gZWxlbWVudHNcbiAgICByZWdsRWxlbWVudHMuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIFxuICAgICAgYnVmZmVyLmRlc3Ryb3koKVxuICAgICAgZWxlbWVudHMuYnVmZmVyID0gbnVsbFxuICAgIH1cblxuICAgIHJldHVybiByZWdsRWxlbWVudHNcbiAgfVxuXG4gIC8vIFRPRE8gaW1wbGVtZW50ZWQgcG9vbGVkIGFsbG9jYXRvciBmb3IgZWxlbWVudCBidWZmZXIgc3RyZWFtc1xuICBmdW5jdGlvbiBjcmVhdGVFbGVtZW50U3RyZWFtIChkYXRhKSB7XG4gICAgcmV0dXJuIGNyZWF0ZUVsZW1lbnRzKHtcbiAgICAgIHVzYWdlOiAnc3RyZWFtJyxcbiAgICAgIGRhdGE6IGRhdGFcbiAgICB9KS5fZWxlbWVudHNcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3lFbGVtZW50U3RyZWFtIChlbGVtZW50cykge1xuICAgIGJ1ZmZlclN0YXRlLmRlc3Ryb3lTdHJlYW0oZWxlbWVudHMuYnVmZmVyKVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjcmVhdGU6IGNyZWF0ZUVsZW1lbnRzLFxuICAgIGNyZWF0ZVN0cmVhbTogY3JlYXRlRWxlbWVudFN0cmVhbSxcbiAgICBkZXN0cm95U3RyZWFtOiBkZXN0cm95RWxlbWVudFN0cmVhbSxcbiAgICBnZXRFbGVtZW50czogZnVuY3Rpb24gKGVsZW1lbnRzKSB7XG4gICAgICBpZiAodHlwZW9mIGVsZW1lbnRzID09PSAnZnVuY3Rpb24nICYmXG4gICAgICAgICAgZWxlbWVudHMuX2VsZW1lbnRzIGluc3RhbmNlb2YgUkVHTEVsZW1lbnRCdWZmZXIpIHtcbiAgICAgICAgcmV0dXJuIGVsZW1lbnRzLl9lbGVtZW50c1xuICAgICAgfVxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY3JlYXRlRXh0ZW5zaW9uQ2FjaGUgKGdsKSB7XG4gIHZhciBleHRlbnNpb25zID0ge31cblxuICBmdW5jdGlvbiByZWZyZXNoRXh0ZW5zaW9ucyAoKSB7XG4gICAgW1xuICAgICAgJ29lc190ZXh0dXJlX2Zsb2F0JyxcbiAgICAgICdvZXNfdGV4dHVyZV9mbG9hdF9saW5lYXInLFxuICAgICAgJ29lc190ZXh0dXJlX2hhbGZfZmxvYXQnLFxuICAgICAgJ29lc190ZXh0dXJlX2hhbGZfZmxvYXRfbGluZWFyJyxcbiAgICAgICdvZXNfc3RhbmRhcmRfZGVyaXZhdGl2ZXMnLFxuICAgICAgJ29lc19lbGVtZW50X2luZGV4X3VpbnQnLFxuICAgICAgJ29lc19mYm9fcmVuZGVyX21pcG1hcCcsXG5cbiAgICAgICd3ZWJnbF9kZXB0aF90ZXh0dXJlJyxcbiAgICAgICd3ZWJnbF9kcmF3X2J1ZmZlcnMnLFxuICAgICAgJ3dlYmdsX2NvbG9yX2J1ZmZlcl9mbG9hdCcsXG5cbiAgICAgICdleHRfdGV4dHVyZV9maWx0ZXJfYW5pc290cm9waWMnLFxuICAgICAgJ2V4dF9mcmFnX2RlcHRoJyxcbiAgICAgICdleHRfYmxlbmRfbWlubWF4JyxcbiAgICAgICdleHRfc2hhZGVyX3RleHR1cmVfbG9kJyxcbiAgICAgICdleHRfY29sb3JfYnVmZmVyX2hhbGZfZmxvYXQnLFxuICAgICAgJ2V4dF9zcmdiJyxcblxuICAgICAgJ2FuZ2xlX2luc3RhbmNlZF9hcnJheXMnLFxuXG4gICAgICAnd2ViZ2xfY29tcHJlc3NlZF90ZXh0dXJlX3MzdGMnLFxuICAgICAgJ3dlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9hdGMnLFxuICAgICAgJ3dlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9wdnJ0YycsXG4gICAgICAnd2ViZ2xfY29tcHJlc3NlZF90ZXh0dXJlX2V0YzEnXG4gICAgXS5mb3JFYWNoKGZ1bmN0aW9uIChleHQpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGV4dGVuc2lvbnNbZXh0XSA9IGdsLmdldEV4dGVuc2lvbihleHQpXG4gICAgICB9IGNhdGNoIChlKSB7fVxuICAgIH0pXG4gIH1cblxuICByZWZyZXNoRXh0ZW5zaW9ucygpXG5cbiAgcmV0dXJuIHtcbiAgICBleHRlbnNpb25zOiBleHRlbnNpb25zLFxuICAgIHJlZnJlc2g6IHJlZnJlc2hFeHRlbnNpb25zXG4gIH1cbn1cbiIsIlxudmFyIHZhbHVlcyA9IHJlcXVpcmUoJy4vdXRpbC92YWx1ZXMnKVxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vdXRpbC9leHRlbmQnKVxuXG4vLyBXZSBzdG9yZSB0aGVzZSBjb25zdGFudHMgc28gdGhhdCB0aGUgbWluaWZpZXIgY2FuIGlubGluZSB0aGVtXG52YXIgR0xfRlJBTUVCVUZGRVIgPSAweDhENDBcbnZhciBHTF9SRU5ERVJCVUZGRVIgPSAweDhENDFcblxudmFyIEdMX1RFWFRVUkVfMkQgPSAweDBERTFcbnZhciBHTF9URVhUVVJFX0NVQkVfTUFQID0gMHg4NTEzXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YID0gMHg4NTE1XG5cbnZhciBHTF9DT0xPUl9BVFRBQ0hNRU5UMCA9IDB4OENFMFxudmFyIEdMX0RFUFRIX0FUVEFDSE1FTlQgPSAweDhEMDBcbnZhciBHTF9TVEVOQ0lMX0FUVEFDSE1FTlQgPSAweDhEMjBcbnZhciBHTF9ERVBUSF9TVEVOQ0lMX0FUVEFDSE1FTlQgPSAweDgyMUFcblxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSAweDE0MDFcbnZhciBHTF9GTE9BVCA9IDB4MTQwNlxuXG52YXIgR0xfSEFMRl9GTE9BVF9PRVMgPSAweDhENjFcblxudmFyIEdMX1JHQkEgPSAweDE5MDhcblxudmFyIEdMX1JHQkE0ID0gMHg4MDU2XG52YXIgR0xfUkdCNV9BMSA9IDB4ODA1N1xudmFyIEdMX1JHQjU2NSA9IDB4OEQ2MlxudmFyIEdMX0RFUFRIX0NPTVBPTkVOVDE2ID0gMHg4MUE1XG52YXIgR0xfU1RFTkNJTF9JTkRFWDggPSAweDhENDhcblxudmFyIEdMX0RFUFRIX0NPTVBPTkVOVCA9IDB4MTkwMlxudmFyIEdMX0RFUFRIX1NURU5DSUwgPSAweDg0RjlcblxudmFyIEdMX1NSR0I4X0FMUEhBOF9FWFQgPSAweDhDNDNcblxudmFyIEdMX1JHQkEzMkZfRVhUID0gMHg4ODE0XG5cbnZhciBHTF9SR0JBMTZGX0VYVCA9IDB4ODgxQVxudmFyIEdMX1JHQjE2Rl9FWFQgPSAweDg4MUJcblxudmFyIEdMX0ZSQU1FQlVGRkVSX0NPTVBMRVRFID0gMHg4Q0Q1XG52YXIgR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9BVFRBQ0hNRU5UID0gMHg4Q0Q2XG52YXIgR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9NSVNTSU5HX0FUVEFDSE1FTlQgPSAweDhDRDdcbnZhciBHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX0RJTUVOU0lPTlMgPSAweDhDRDlcbnZhciBHTF9GUkFNRUJVRkZFUl9VTlNVUFBPUlRFRCA9IDB4OENERFxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBGQk9TdGF0ZSAoXG4gIGdsLFxuICBleHRlbnNpb25zLFxuICBsaW1pdHMsXG4gIHRleHR1cmVTdGF0ZSxcbiAgcmVuZGVyYnVmZmVyU3RhdGUpIHtcbiAgdmFyIGZyYW1lYnVmZmVyU3RhdGUgPSB7XG4gICAgY3VycmVudDogbnVsbCxcbiAgICBuZXh0OiBudWxsLFxuICAgIGRpcnR5OiBmYWxzZVxuICB9XG5cbiAgdmFyIHN0YXR1c0NvZGUgPSB7fVxuICBzdGF0dXNDb2RlW0dMX0ZSQU1FQlVGRkVSX0NPTVBMRVRFXSA9ICdjb21wbGV0ZSdcbiAgc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX0FUVEFDSE1FTlRdID0gJ2luY29tcGxldGUgYXR0YWNobWVudCdcbiAgc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX0RJTUVOU0lPTlNdID0gJ2luY29tcGxldGUgZGltZW5zaW9ucydcbiAgc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX01JU1NJTkdfQVRUQUNITUVOVF0gPSAnaW5jb21wbGV0ZSwgbWlzc2luZyBhdHRhY2htZW50J1xuICBzdGF0dXNDb2RlW0dMX0ZSQU1FQlVGRkVSX1VOU1VQUE9SVEVEXSA9ICd1bnN1cHBvcnRlZCdcblxuICB2YXIgY29sb3JUZXh0dXJlRm9ybWF0cyA9IHtcbiAgICAncmdiYSc6IEdMX1JHQkFcbiAgfVxuXG4gIHZhciBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHMgPSB7XG4gICAgJ3JnYmE0JzogR0xfUkdCQTQsXG4gICAgJ3JnYjU2NSc6IEdMX1JHQjU2NSxcbiAgICAncmdiNSBhMSc6IEdMX1JHQjVfQTFcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLmV4dF9zcmdiKSB7XG4gICAgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzWydzcmdiYSddID0gR0xfU1JHQjhfQUxQSEE4X0VYVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMuZXh0X2NvbG9yX2J1ZmZlcl9oYWxmX2Zsb2F0KSB7XG4gICAgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzWydyZ2JhMTZmJ10gPSBHTF9SR0JBMTZGX0VYVFxuICAgIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0c1sncmdiMTZmJ10gPSBHTF9SR0IxNkZfRVhUXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb2xvcl9idWZmZXJfZmxvYXQpIHtcbiAgICBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHNbJ3JnYmEzMmYnXSA9IEdMX1JHQkEzMkZfRVhUXG4gIH1cblxuICB2YXIgZGVwdGhSZW5kZXJidWZmZXJGb3JtYXRFbnVtcyA9IFtHTF9ERVBUSF9DT01QT05FTlQxNl1cbiAgdmFyIHN0ZW5jaWxSZW5kZXJidWZmZXJGb3JtYXRFbnVtcyA9IFtHTF9TVEVOQ0lMX0lOREVYOF1cbiAgdmFyIGRlcHRoU3RlbmNpbFJlbmRlcmJ1ZmZlckZvcm1hdEVudW1zID0gW0dMX0RFUFRIX1NURU5DSUxdXG5cbiAgdmFyIGRlcHRoVGV4dHVyZUZvcm1hdEVudW1zID0gW11cbiAgdmFyIHN0ZW5jaWxUZXh0dXJlRm9ybWF0RW51bXMgPSBbXVxuICB2YXIgZGVwdGhTdGVuY2lsVGV4dHVyZUZvcm1hdEVudW1zID0gW11cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9kZXB0aF90ZXh0dXJlKSB7XG4gICAgZGVwdGhUZXh0dXJlRm9ybWF0RW51bXMucHVzaChHTF9ERVBUSF9DT01QT05FTlQpXG4gICAgZGVwdGhTdGVuY2lsVGV4dHVyZUZvcm1hdEVudW1zLnB1c2goR0xfREVQVEhfU1RFTkNJTClcbiAgfVxuXG4gIHZhciBjb2xvckZvcm1hdHMgPSBleHRlbmQoZXh0ZW5kKHt9LFxuICAgIGNvbG9yVGV4dHVyZUZvcm1hdHMpLFxuICAgIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0cylcblxuICB2YXIgY29sb3JUZXh0dXJlRm9ybWF0RW51bXMgPSB2YWx1ZXMoY29sb3JUZXh0dXJlRm9ybWF0cylcbiAgdmFyIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0RW51bXMgPSB2YWx1ZXMoY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzKVxuXG4gIHZhciBoaWdoZXN0UHJlY2lzaW9uID0gR0xfVU5TSUdORURfQllURVxuICB2YXIgY29sb3JUeXBlcyA9IHtcbiAgICAndWludDgnOiBHTF9VTlNJR05FRF9CWVRFXG4gIH1cbiAgaWYgKGV4dGVuc2lvbnMub2VzX3RleHR1cmVfaGFsZl9mbG9hdCkge1xuICAgIGhpZ2hlc3RQcmVjaXNpb24gPSBjb2xvclR5cGVzWydoYWxmIGZsb2F0J10gPSBHTF9IQUxGX0ZMT0FUX09FU1xuICB9XG4gIGlmIChleHRlbnNpb25zLm9lc190ZXh0dXJlX2Zsb2F0KSB7XG4gICAgaGlnaGVzdFByZWNpc2lvbiA9IGNvbG9yVHlwZXMuZmxvYXQgPSBHTF9GTE9BVFxuICB9XG4gIGNvbG9yVHlwZXMuYmVzdCA9IGhpZ2hlc3RQcmVjaXNpb25cblxuICB2YXIgRFJBV19CVUZGRVJTID0gKGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgcmVzdWx0ID0gbmV3IEFycmF5KGxpbWl0cy5tYXhEcmF3YnVmZmVycylcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8PSBsaW1pdHMubWF4RHJhd2J1ZmZlcnM7ICsraSkge1xuICAgICAgdmFyIHJvdyA9IHJlc3VsdFtpXSA9IG5ldyBBcnJheShpKVxuICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBpOyArK2opIHtcbiAgICAgICAgcm93W2pdID0gR0xfQ09MT1JfQVRUQUNITUVOVDAgKyBqXG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHRcbiAgfSkoKVxuXG4gIGZ1bmN0aW9uIEZyYW1lYnVmZmVyQXR0YWNobWVudCAodGFyZ2V0LCBsZXZlbCwgdGV4dHVyZSwgcmVuZGVyYnVmZmVyKSB7XG4gICAgdGhpcy50YXJnZXQgPSB0YXJnZXRcbiAgICB0aGlzLmxldmVsID0gbGV2ZWxcbiAgICB0aGlzLnRleHR1cmUgPSB0ZXh0dXJlXG4gICAgdGhpcy5yZW5kZXJidWZmZXIgPSByZW5kZXJidWZmZXJcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlY1JlZiAoYXR0YWNobWVudCkge1xuICAgIGlmIChhdHRhY2htZW50KSB7XG4gICAgICBpZiAoYXR0YWNobWVudC50ZXh0dXJlKSB7XG4gICAgICAgIGF0dGFjaG1lbnQudGV4dHVyZS5fdGV4dHVyZS5kZWNSZWYoKVxuICAgICAgfVxuICAgICAgaWYgKGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyKSB7XG4gICAgICAgIGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXIuZGVjUmVmKClcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBpbmNSZWZBbmRDaGVja1NoYXBlIChhdHRhY2htZW50LCBmcmFtZWJ1ZmZlcikge1xuICAgIHZhciB3aWR0aCA9IGZyYW1lYnVmZmVyLndpZHRoXG4gICAgdmFyIGhlaWdodCA9IGZyYW1lYnVmZmVyLmhlaWdodFxuICAgIGlmIChhdHRhY2htZW50LnRleHR1cmUpIHtcbiAgICAgIHZhciB0ZXh0dXJlID0gYXR0YWNobWVudC50ZXh0dXJlLl90ZXh0dXJlXG4gICAgICB2YXIgdHcgPSBNYXRoLm1heCgxLCB0ZXh0dXJlLnBhcmFtcy53aWR0aCA+PiBhdHRhY2htZW50LmxldmVsKVxuICAgICAgdmFyIHRoID0gTWF0aC5tYXgoMSwgdGV4dHVyZS5wYXJhbXMuaGVpZ2h0ID4+IGF0dGFjaG1lbnQubGV2ZWwpXG4gICAgICB3aWR0aCA9IHdpZHRoIHx8IHR3XG4gICAgICBoZWlnaHQgPSBoZWlnaHQgfHwgdGhcbiAgICAgIFxuICAgICAgXG4gICAgICB0ZXh0dXJlLnJlZkNvdW50ICs9IDFcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIHJlbmRlcmJ1ZmZlciA9IGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXJcbiAgICAgIHdpZHRoID0gd2lkdGggfHwgcmVuZGVyYnVmZmVyLndpZHRoXG4gICAgICBoZWlnaHQgPSBoZWlnaHQgfHwgcmVuZGVyYnVmZmVyLmhlaWdodFxuICAgICAgXG4gICAgICBcbiAgICAgIHJlbmRlcmJ1ZmZlci5yZWZDb3VudCArPSAxXG4gICAgfVxuICAgIGZyYW1lYnVmZmVyLndpZHRoID0gd2lkdGhcbiAgICBmcmFtZWJ1ZmZlci5oZWlnaHQgPSBoZWlnaHRcbiAgfVxuXG4gIGZ1bmN0aW9uIGF0dGFjaCAobG9jYXRpb24sIGF0dGFjaG1lbnQpIHtcbiAgICBpZiAoYXR0YWNobWVudCkge1xuICAgICAgaWYgKGF0dGFjaG1lbnQudGV4dHVyZSkge1xuICAgICAgICBnbC5mcmFtZWJ1ZmZlclRleHR1cmUyRChcbiAgICAgICAgICBHTF9GUkFNRUJVRkZFUixcbiAgICAgICAgICBsb2NhdGlvbixcbiAgICAgICAgICBhdHRhY2htZW50LnRhcmdldCxcbiAgICAgICAgICBhdHRhY2htZW50LnRleHR1cmUuX3RleHR1cmUudGV4dHVyZSxcbiAgICAgICAgICBhdHRhY2htZW50LmxldmVsKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZ2wuZnJhbWVidWZmZXJSZW5kZXJidWZmZXIoXG4gICAgICAgICAgR0xfRlJBTUVCVUZGRVIsXG4gICAgICAgICAgbG9jYXRpb24sXG4gICAgICAgICAgR0xfUkVOREVSQlVGRkVSLFxuICAgICAgICAgIGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXIucmVuZGVyYnVmZmVyKVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBnbC5mcmFtZWJ1ZmZlclRleHR1cmUyRChcbiAgICAgICAgR0xfRlJBTUVCVUZGRVIsXG4gICAgICAgIGxvY2F0aW9uLFxuICAgICAgICBHTF9URVhUVVJFXzJELFxuICAgICAgICBudWxsLFxuICAgICAgICAwKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHRyeVVwZGF0ZUF0dGFjaG1lbnQgKFxuICAgIGF0dGFjaG1lbnQsXG4gICAgaXNUZXh0dXJlLFxuICAgIGZvcm1hdCxcbiAgICB0eXBlLFxuICAgIHdpZHRoLFxuICAgIGhlaWdodCkge1xuICAgIGlmIChhdHRhY2htZW50LnRleHR1cmUpIHtcbiAgICAgIHZhciB0ZXh0dXJlID0gYXR0YWNobWVudC50ZXh0dXJlXG4gICAgICBpZiAoaXNUZXh0dXJlKSB7XG4gICAgICAgIHRleHR1cmUoe1xuICAgICAgICAgIGZvcm1hdDogZm9ybWF0LFxuICAgICAgICAgIHR5cGU6IHR5cGUsXG4gICAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICAgIGhlaWdodDogaGVpZ2h0XG4gICAgICAgIH0pXG4gICAgICAgIHRleHR1cmUuX3RleHR1cmUucmVmQ291bnQgKz0gMVxuICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgcmVuZGVyYnVmZmVyID0gYXR0YWNobWVudC5yZW5kZXJidWZmZXJcbiAgICAgIGlmICghaXNUZXh0dXJlKSB7XG4gICAgICAgIHJlbmRlcmJ1ZmZlcih7XG4gICAgICAgICAgZm9ybWF0OiBmb3JtYXQsXG4gICAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICAgIGhlaWdodDogaGVpZ2h0XG4gICAgICAgIH0pXG4gICAgICAgIHJlbmRlcmJ1ZmZlci5fcmVuZGVyYnVmZmVyLnJlZkNvdW50ICs9IDFcbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgIH1cbiAgICB9XG4gICAgZGVjUmVmKGF0dGFjaG1lbnQpXG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZUF0dGFjaG1lbnQgKGF0dGFjaG1lbnQpIHtcbiAgICB2YXIgdGFyZ2V0ID0gR0xfVEVYVFVSRV8yRFxuICAgIHZhciBsZXZlbCA9IDBcbiAgICB2YXIgdGV4dHVyZSA9IG51bGxcbiAgICB2YXIgcmVuZGVyYnVmZmVyID0gbnVsbFxuXG4gICAgdmFyIGRhdGEgPSBhdHRhY2htZW50XG4gICAgaWYgKHR5cGVvZiBhdHRhY2htZW50ID09PSAnb2JqZWN0Jykge1xuICAgICAgZGF0YSA9IGF0dGFjaG1lbnQuZGF0YVxuICAgICAgaWYgKCdsZXZlbCcgaW4gYXR0YWNobWVudCkge1xuICAgICAgICBsZXZlbCA9IGF0dGFjaG1lbnQubGV2ZWwgfCAwXG4gICAgICB9XG4gICAgICBpZiAoJ3RhcmdldCcgaW4gYXR0YWNobWVudCkge1xuICAgICAgICB0YXJnZXQgPSBhdHRhY2htZW50LnRhcmdldCB8IDBcbiAgICAgIH1cbiAgICB9XG5cbiAgICBcblxuICAgIHZhciB0eXBlID0gYXR0YWNobWVudC5fcmVnbFR5cGVcbiAgICBpZiAodHlwZSA9PT0gJ3RleHR1cmUnKSB7XG4gICAgICB0ZXh0dXJlID0gYXR0YWNobWVudFxuICAgICAgaWYgKHRleHR1cmUuX3RleHR1cmUudGFyZ2V0ID09PSBHTF9URVhUVVJFX0NVQkVfTUFQKSB7XG4gICAgICAgIFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgXG4gICAgICB9XG4gICAgICAvLyBUT0RPIGNoZWNrIG1pcGxldmVsIGlzIGNvbnNpc3RlbnRcbiAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICdyZW5kZXJidWZmZXInKSB7XG4gICAgICByZW5kZXJidWZmZXIgPSBhdHRhY2htZW50XG4gICAgICB0YXJnZXQgPSBHTF9SRU5ERVJCVUZGRVJcbiAgICAgIGxldmVsID0gMFxuICAgIH0gZWxzZSB7XG4gICAgICBcbiAgICB9XG5cbiAgICByZXR1cm4gbmV3IEZyYW1lYnVmZmVyQXR0YWNobWVudCh0YXJnZXQsIGxldmVsLCB0ZXh0dXJlLCByZW5kZXJidWZmZXIpXG4gIH1cblxuICBmdW5jdGlvbiB1bndyYXBBdHRhY2htZW50IChhdHRhY2htZW50KSB7XG4gICAgcmV0dXJuIGF0dGFjaG1lbnQgJiYgKGF0dGFjaG1lbnQudGV4dHVyZSB8fCBhdHRhY2htZW50LnJlbmRlcmJ1ZmZlcilcbiAgfVxuXG4gIHZhciBmcmFtZWJ1ZmZlckNvdW50ID0gMFxuICB2YXIgZnJhbWVidWZmZXJTZXQgPSB7fVxuXG4gIGZ1bmN0aW9uIFJFR0xGcmFtZWJ1ZmZlciAoKSB7XG4gICAgdGhpcy5pZCA9IGZyYW1lYnVmZmVyQ291bnQrK1xuICAgIGZyYW1lYnVmZmVyU2V0W3RoaXMuaWRdID0gdGhpc1xuXG4gICAgdGhpcy5mcmFtZWJ1ZmZlciA9IG51bGxcbiAgICB0aGlzLndpZHRoID0gMFxuICAgIHRoaXMuaGVpZ2h0ID0gMFxuXG4gICAgdGhpcy5jb2xvckF0dGFjaG1lbnRzID0gW11cbiAgICB0aGlzLmRlcHRoQXR0YWNobWVudCA9IG51bGxcbiAgICB0aGlzLnN0ZW5jaWxBdHRhY2htZW50ID0gbnVsbFxuICAgIHRoaXMuZGVwdGhTdGVuY2lsQXR0YWNobWVudCA9IG51bGxcblxuICAgIHRoaXMub3duc0NvbG9yID0gZmFsc2VcbiAgICB0aGlzLm93bnNEZXB0aFN0ZW5jaWwgPSBmYWxzZVxuICB9XG5cbiAgZnVuY3Rpb24gcmVmcmVzaCAoZnJhbWVidWZmZXIpIHtcbiAgICBpZiAoIWdsLmlzRnJhbWVidWZmZXIoZnJhbWVidWZmZXIuZnJhbWVidWZmZXIpKSB7XG4gICAgICBmcmFtZWJ1ZmZlci5mcmFtZWJ1ZmZlciA9IGdsLmNyZWF0ZUZyYW1lYnVmZmVyKClcbiAgICB9XG4gICAgZnJhbWVidWZmZXJTdGF0ZS5kaXJ0eSA9IHRydWVcbiAgICBnbC5iaW5kRnJhbWVidWZmZXIoR0xfRlJBTUVCVUZGRVIsIGZyYW1lYnVmZmVyLmZyYW1lYnVmZmVyKVxuXG4gICAgdmFyIGNvbG9yQXR0YWNobWVudHMgPSBmcmFtZWJ1ZmZlci5jb2xvckF0dGFjaG1lbnRzXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjb2xvckF0dGFjaG1lbnRzLmxlbmd0aDsgKytpKSB7XG4gICAgICBhdHRhY2goR0xfQ09MT1JfQVRUQUNITUVOVDAgKyBpLCBjb2xvckF0dGFjaG1lbnRzW2ldKVxuICAgIH1cbiAgICBmb3IgKGkgPSBjb2xvckF0dGFjaG1lbnRzLmxlbmd0aDsgaSA8IGxpbWl0cy5tYXhDb2xvckF0dGFjaG1lbnRzOyArK2kpIHtcbiAgICAgIGF0dGFjaChHTF9DT0xPUl9BVFRBQ0hNRU5UMCArIGksIG51bGwpXG4gICAgfVxuICAgIGF0dGFjaChHTF9ERVBUSF9BVFRBQ0hNRU5ULCBmcmFtZWJ1ZmZlci5kZXB0aEF0dGFjaG1lbnQpXG4gICAgYXR0YWNoKEdMX1NURU5DSUxfQVRUQUNITUVOVCwgZnJhbWVidWZmZXIuc3RlbmNpbEF0dGFjaG1lbnQpXG4gICAgYXR0YWNoKEdMX0RFUFRIX1NURU5DSUxfQVRUQUNITUVOVCwgZnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsQXR0YWNobWVudClcblxuICAgIGlmIChleHRlbnNpb25zLndlYmdsX2RyYXdfYnVmZmVycykge1xuICAgICAgZXh0ZW5zaW9ucy53ZWJnbF9kcmF3X2J1ZmZlcnMuZHJhd0J1ZmZlcnNXRUJHTChcbiAgICAgICAgRFJBV19CVUZGRVJTW2NvbG9yQXR0YWNobWVudHMubGVuZ3RoXSlcbiAgICB9XG5cbiAgICAvLyBDaGVjayBzdGF0dXMgY29kZVxuICAgIHZhciBzdGF0dXMgPSBnbC5jaGVja0ZyYW1lYnVmZmVyU3RhdHVzKEdMX0ZSQU1FQlVGRkVSKVxuICAgIGlmIChzdGF0dXMgIT09IEdMX0ZSQU1FQlVGRkVSX0NPTVBMRVRFKSB7XG4gICAgICBcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBkZWNGQk9SZWZzIChmcmFtZWJ1ZmZlcikge1xuICAgIGZyYW1lYnVmZmVyLmNvbG9yQXR0YWNobWVudHMuZm9yRWFjaChkZWNSZWYpXG4gICAgZGVjUmVmKGZyYW1lYnVmZmVyLmRlcHRoQXR0YWNobWVudClcbiAgICBkZWNSZWYoZnJhbWVidWZmZXIuc3RlbmNpbEF0dGFjaG1lbnQpXG4gICAgZGVjUmVmKGZyYW1lYnVmZmVyLmRlcHRoU3RlbmNpbEF0dGFjaG1lbnQpXG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95IChmcmFtZWJ1ZmZlcikge1xuICAgIHZhciBoYW5kbGUgPSBmcmFtZWJ1ZmZlci5mcmFtZWJ1ZmZlclxuICAgIFxuICAgIGlmIChnbC5pc0ZyYW1lYnVmZmVyKGhhbmRsZSkpIHtcbiAgICAgIGdsLmRlbGV0ZUZyYW1lYnVmZmVyKGhhbmRsZSlcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBjcmVhdGVGQk8gKG9wdGlvbnMpIHtcbiAgICB2YXIgZnJhbWVidWZmZXIgPSBuZXcgUkVHTEZyYW1lYnVmZmVyKClcblxuICAgIGZ1bmN0aW9uIHJlZ2xGcmFtZWJ1ZmZlciAoaW5wdXQpIHtcbiAgICAgIHZhciBpXG4gICAgICB2YXIgb3B0aW9ucyA9IGlucHV0IHx8IHt9XG5cbiAgICAgIHZhciBleHREcmF3QnVmZmVycyA9IGV4dGVuc2lvbnMud2ViZ2xfZHJhd19idWZmZXJzXG5cbiAgICAgIHZhciB3aWR0aCA9IDBcbiAgICAgIHZhciBoZWlnaHQgPSAwXG4gICAgICBpZiAoJ3NoYXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBzaGFwZSA9IG9wdGlvbnMuc2hhcGVcbiAgICAgICAgXG4gICAgICAgIHdpZHRoID0gc2hhcGVbMF1cbiAgICAgICAgaGVpZ2h0ID0gc2hhcGVbMV1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmICgncmFkaXVzJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgd2lkdGggPSBoZWlnaHQgPSBvcHRpb25zLnJhZGl1c1xuICAgICAgICB9XG4gICAgICAgIGlmICgnd2lkdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB3aWR0aCA9IG9wdGlvbnMud2lkdGhcbiAgICAgICAgfVxuICAgICAgICBpZiAoJ2hlaWdodCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGhlaWdodCA9IG9wdGlvbnMuaGVpZ2h0XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gY29sb3JUeXBlLCBudW1Db2xvcnNcbiAgICAgIHZhciBjb2xvckJ1ZmZlcnMgPSBudWxsXG4gICAgICB2YXIgb3duc0NvbG9yID0gZmFsc2VcbiAgICAgIGlmICgnY29sb3JCdWZmZXJzJyBpbiBvcHRpb25zIHx8ICdjb2xvckJ1ZmZlcicgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgY29sb3JJbnB1dHMgPSBvcHRpb25zLmNvbG9yQnVmZmVycyB8fCBvcHRpb25zLmNvbG9yQnVmZmVyXG4gICAgICAgIGlmICghQXJyYXkuaXNBcnJheShjb2xvcklucHV0cykpIHtcbiAgICAgICAgICBjb2xvcklucHV0cyA9IFtjb2xvcklucHV0c11cbiAgICAgICAgfVxuXG4gICAgICAgIGZyYW1lYnVmZmVyLndpZHRoID0gd2lkdGhcbiAgICAgICAgZnJhbWVidWZmZXIuaGVpZ2h0ID0gaGVpZ2h0XG5cbiAgICAgICAgaWYgKGNvbG9ySW5wdXRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICBcbiAgICAgICAgfVxuICAgICAgICBcblxuICAgICAgICAvLyBXcmFwIGNvbG9yIGF0dGFjaG1lbnRzXG4gICAgICAgIGNvbG9yQnVmZmVycyA9IGNvbG9ySW5wdXRzLm1hcChwYXJzZUF0dGFjaG1lbnQpXG5cbiAgICAgICAgLy8gQ2hlY2sgaGVhZCBub2RlXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xvckJ1ZmZlcnMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICB2YXIgY29sb3JBdHRhY2htZW50ID0gY29sb3JCdWZmZXJzW2ldXG4gICAgICAgICAgXG4gICAgICAgICAgaW5jUmVmQW5kQ2hlY2tTaGFwZShcbiAgICAgICAgICAgIGNvbG9yQXR0YWNobWVudCxcbiAgICAgICAgICAgIGZyYW1lYnVmZmVyKVxuICAgICAgICB9XG5cbiAgICAgICAgd2lkdGggPSBmcmFtZWJ1ZmZlci53aWR0aFxuICAgICAgICBoZWlnaHQgPSBmcmFtZWJ1ZmZlci5oZWlnaHRcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBjb2xvclRleHR1cmUgPSB0cnVlXG4gICAgICAgIHZhciBjb2xvckZvcm1hdCA9ICdyZ2JhJ1xuICAgICAgICB2YXIgY29sb3JUeXBlID0gJ3VpbnQ4J1xuICAgICAgICB2YXIgY29sb3JDb3VudCA9IDFcbiAgICAgICAgb3duc0NvbG9yID0gdHJ1ZVxuXG4gICAgICAgIGZyYW1lYnVmZmVyLndpZHRoID0gd2lkdGggPSB3aWR0aCB8fCBnbC5kcmF3aW5nQnVmZmVyV2lkdGhcbiAgICAgICAgZnJhbWVidWZmZXIuaGVpZ2h0ID0gaGVpZ2h0ID0gaGVpZ2h0IHx8IGdsLmRyYXdpbmdCdWZmZXJIZWlnaHRcblxuICAgICAgICBpZiAoJ2Zvcm1hdCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGNvbG9yRm9ybWF0ID0gb3B0aW9ucy5mb3JtYXRcbiAgICAgICAgICBcbiAgICAgICAgICBjb2xvclRleHR1cmUgPSBjb2xvckZvcm1hdCBpbiBjb2xvclRleHR1cmVGb3JtYXRzXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ3R5cGUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBcbiAgICAgICAgICBjb2xvclR5cGUgPSBvcHRpb25zLnR5cGVcbiAgICAgICAgICBcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnY29sb3JDb3VudCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGNvbG9yQ291bnQgPSBvcHRpb25zLmNvbG9yQ291bnQgfCAwXG4gICAgICAgICAgXG4gICAgICAgIH1cblxuICAgICAgICAvLyBSZXVzZSBjb2xvciBidWZmZXIgYXJyYXkgaWYgd2Ugb3duIGl0XG4gICAgICAgIGlmIChmcmFtZWJ1ZmZlci5vd25zQ29sb3IpIHtcbiAgICAgICAgICBjb2xvckJ1ZmZlcnMgPSBmcmFtZWJ1ZmZlci5jb2xvckF0dGFjaG1lbnRzXG4gICAgICAgICAgd2hpbGUgKGNvbG9yQnVmZmVycy5sZW5ndGggPiBjb2xvckNvdW50KSB7XG4gICAgICAgICAgICBkZWNSZWYoY29sb3JCdWZmZXJzLnBvcCgpKVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb2xvckJ1ZmZlcnMgPSBbXVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gdXBkYXRlIGJ1ZmZlcnMgaW4gcGxhY2UsIHJlbW92ZSBpbmNvbXBhdGlibGUgYnVmZmVyc1xuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY29sb3JCdWZmZXJzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgaWYgKCF0cnlVcGRhdGVBdHRhY2htZW50KFxuICAgICAgICAgICAgICBjb2xvckJ1ZmZlcnNbaV0sXG4gICAgICAgICAgICAgIGNvbG9yVGV4dHVyZSxcbiAgICAgICAgICAgICAgY29sb3JGb3JtYXQsXG4gICAgICAgICAgICAgIGNvbG9yVHlwZSxcbiAgICAgICAgICAgICAgd2lkdGgsXG4gICAgICAgICAgICAgIGhlaWdodCkpIHtcbiAgICAgICAgICAgIGNvbG9yQnVmZmVyc1tpLS1dID0gY29sb3JCdWZmZXJzW2NvbG9yQnVmZmVycy5sZW5ndGggLSAxXVxuICAgICAgICAgICAgY29sb3JCdWZmZXJzLnBvcCgpXG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gVGhlbiBhcHBlbmQgbmV3IGJ1ZmZlcnNcbiAgICAgICAgd2hpbGUgKGNvbG9yQnVmZmVycy5sZW5ndGggPCBjb2xvckNvdW50KSB7XG4gICAgICAgICAgaWYgKGNvbG9yVGV4dHVyZSkge1xuICAgICAgICAgICAgY29sb3JCdWZmZXJzLnB1c2gobmV3IEZyYW1lYnVmZmVyQXR0YWNobWVudChcbiAgICAgICAgICAgICAgR0xfVEVYVFVSRV8yRCxcbiAgICAgICAgICAgICAgMCxcbiAgICAgICAgICAgICAgdGV4dHVyZVN0YXRlLmNyZWF0ZSh7XG4gICAgICAgICAgICAgICAgZm9ybWF0OiBjb2xvckZvcm1hdCxcbiAgICAgICAgICAgICAgICB0eXBlOiBjb2xvclR5cGUsXG4gICAgICAgICAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICAgICAgICAgIGhlaWdodDogaGVpZ2h0XG4gICAgICAgICAgICAgIH0sIEdMX1RFWFRVUkVfMkQpLFxuICAgICAgICAgICAgICBudWxsKSlcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29sb3JCdWZmZXJzLnB1c2gobmV3IEZyYW1lYnVmZmVyQXR0YWNobWVudChcbiAgICAgICAgICAgICAgR0xfUkVOREVSQlVGRkVSLFxuICAgICAgICAgICAgICAwLFxuICAgICAgICAgICAgICBudWxsLFxuICAgICAgICAgICAgICByZW5kZXJidWZmZXJTdGF0ZS5jcmVhdGUoe1xuICAgICAgICAgICAgICAgIGZvcm1hdDogY29sb3JGb3JtYXQsXG4gICAgICAgICAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICAgICAgICAgIGhlaWdodDogaGVpZ2h0XG4gICAgICAgICAgICAgIH0pKSlcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgXG5cbiAgICAgIGZyYW1lYnVmZmVyLndpZHRoID0gd2lkdGhcbiAgICAgIGZyYW1lYnVmZmVyLmhlaWdodCA9IGhlaWdodFxuXG4gICAgICB2YXIgZGVwdGhCdWZmZXIgPSBudWxsXG4gICAgICB2YXIgc3RlbmNpbEJ1ZmZlciA9IG51bGxcbiAgICAgIHZhciBkZXB0aFN0ZW5jaWxCdWZmZXIgPSBudWxsXG4gICAgICB2YXIgb3duc0RlcHRoU3RlbmNpbCA9IGZhbHNlXG4gICAgICB2YXIgZGVwdGhTdGVuY2lsQ291bnQgPSAwXG5cbiAgICAgIGlmICgnZGVwdGhCdWZmZXInIGluIG9wdGlvbnMpIHtcbiAgICAgICAgZGVwdGhCdWZmZXIgPSBwYXJzZUF0dGFjaG1lbnQob3B0aW9ucy5kZXB0aEJ1ZmZlcilcbiAgICAgICAgXG4gICAgICAgIGRlcHRoU3RlbmNpbENvdW50ICs9IDFcbiAgICAgIH1cbiAgICAgIGlmICgnc3RlbmNpbEJ1ZmZlcicgaW4gb3B0aW9ucykge1xuICAgICAgICBzdGVuY2lsQnVmZmVyID0gcGFyc2VBdHRhY2htZW50KG9wdGlvbnMuc3RlbmNpbEJ1ZmZlcilcbiAgICAgICAgXG4gICAgICAgIGRlcHRoU3RlbmNpbENvdW50ICs9IDFcbiAgICAgIH1cbiAgICAgIGlmICgnZGVwdGhTdGVuY2lsQnVmZmVyJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIGRlcHRoU3RlbmNpbEJ1ZmZlciA9IHBhcnNlQXR0YWNobWVudChvcHRpb25zLmRlcHRoU3RlbmNpbEJ1ZmZlcilcbiAgICAgICAgXG4gICAgICAgIGRlcHRoU3RlbmNpbENvdW50ICs9IDFcbiAgICAgIH1cblxuICAgICAgaWYgKCEoZGVwdGhCdWZmZXIgfHwgc3RlbmNpbEJ1ZmZlciB8fCBkZXB0aFN0ZW5jaWxCdWZmZXIpKSB7XG4gICAgICAgIHZhciBkZXB0aCA9IHRydWVcbiAgICAgICAgdmFyIHN0ZW5jaWwgPSBmYWxzZVxuICAgICAgICB2YXIgdXNlVGV4dHVyZSA9IGZhbHNlXG5cbiAgICAgICAgaWYgKCdkZXB0aCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGRlcHRoID0gISFvcHRpb25zLmRlcHRoXG4gICAgICAgIH1cbiAgICAgICAgaWYgKCdzdGVuY2lsJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgc3RlbmNpbCA9ICEhb3B0aW9ucy5zdGVuY2lsXG4gICAgICAgIH1cbiAgICAgICAgaWYgKCdkZXB0aFRleHR1cmUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB1c2VUZXh0dXJlID0gISFvcHRpb25zLmRlcHRoVGV4dHVyZVxuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGN1ckRlcHRoU3RlbmNpbCA9XG4gICAgICAgICAgZnJhbWVidWZmZXIuZGVwdGhBdHRhY2htZW50IHx8XG4gICAgICAgICAgZnJhbWVidWZmZXIuc3RlbmNpbEF0dGFjaG1lbnQgfHxcbiAgICAgICAgICBmcmFtZWJ1ZmZlci5kZXB0aFN0ZW5jaWxBdHRhY2htZW50XG4gICAgICAgIHZhciBuZXh0RGVwdGhTdGVuY2lsID0gbnVsbFxuXG4gICAgICAgIGlmIChkZXB0aCB8fCBzdGVuY2lsKSB7XG4gICAgICAgICAgb3duc0RlcHRoU3RlbmNpbCA9IHRydWVcblxuICAgICAgICAgIGlmICh1c2VUZXh0dXJlKSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHZhciBkZXB0aFRleHR1cmVGb3JtYXRcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYgKHN0ZW5jaWwpIHtcbiAgICAgICAgICAgICAgZGVwdGhUZXh0dXJlRm9ybWF0ID0gJ2RlcHRoIHN0ZW5jaWwnXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBkZXB0aFRleHR1cmVGb3JtYXQgPSAnZGVwdGgnXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoZnJhbWVidWZmZXIub3duc0RlcHRoU3RlbmNpbCAmJiBjdXJEZXB0aFN0ZW5jaWwudGV4dHVyZSkge1xuICAgICAgICAgICAgICBjdXJEZXB0aFN0ZW5jaWwudGV4dHVyZSh7XG4gICAgICAgICAgICAgICAgZm9ybWF0OiBkZXB0aFRleHR1cmVGb3JtYXQsXG4gICAgICAgICAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICAgICAgICAgIGhlaWdodDogaGVpZ2h0XG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIGN1ckRlcHRoU3RlbmNpbC50ZXh0dXJlLl90ZXh0dXJlLnJlZkNvdW50ICs9IDFcbiAgICAgICAgICAgICAgbmV4dERlcHRoU3RlbmNpbCA9IGN1ckRlcHRoU3RlbmNpbFxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgbmV4dERlcHRoU3RlbmNpbCA9IG5ldyBGcmFtZWJ1ZmZlckF0dGFjaG1lbnQoXG4gICAgICAgICAgICAgICAgR0xfVEVYVFVSRV8yRCxcbiAgICAgICAgICAgICAgICAwLFxuICAgICAgICAgICAgICAgIHRleHR1cmVTdGF0ZS5jcmVhdGUoe1xuICAgICAgICAgICAgICAgICAgZm9ybWF0OiBkZXB0aFRleHR1cmVGb3JtYXQsXG4gICAgICAgICAgICAgICAgICB3aWR0aDogd2lkdGgsXG4gICAgICAgICAgICAgICAgICBoZWlnaHQ6IGhlaWdodFxuICAgICAgICAgICAgICAgIH0sIEdMX1RFWFRVUkVfMkQpLFxuICAgICAgICAgICAgICAgIG51bGwpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciBkZXB0aFJlbmRlcmJ1ZmZlckZvcm1hdFxuICAgICAgICAgICAgaWYgKGRlcHRoKSB7XG4gICAgICAgICAgICAgIGlmIChzdGVuY2lsKSB7XG4gICAgICAgICAgICAgICAgZGVwdGhSZW5kZXJidWZmZXJGb3JtYXQgPSAnZGVwdGggc3RlbmNpbCdcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZXB0aFJlbmRlcmJ1ZmZlckZvcm1hdCA9ICdkZXB0aCdcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgZGVwdGhSZW5kZXJidWZmZXJGb3JtYXQgPSAnc3RlbmNpbCdcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChmcmFtZWJ1ZmZlci5vd25zRGVwdGhTdGVuY2lsICYmIGN1ckRlcHRoU3RlbmNpbC5yZW5kZXJidWZmZXIpIHtcbiAgICAgICAgICAgICAgY3VyRGVwdGhTdGVuY2lsLnJlbmRlcmJ1ZmZlcih7XG4gICAgICAgICAgICAgICAgZm9ybWF0OiBkZXB0aFJlbmRlcmJ1ZmZlckZvcm1hdCxcbiAgICAgICAgICAgICAgICB3aWR0aDogd2lkdGgsXG4gICAgICAgICAgICAgICAgaGVpZ2h0OiBoZWlnaHRcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgY3VyRGVwdGhTdGVuY2lsLnJlbmRlcmJ1ZmZlci5fcmVuZGVyYnVmZmVyLnJlZkNvdW50ICs9IDFcbiAgICAgICAgICAgICAgbmV4dERlcHRoU3RlbmNpbCA9IGN1ckRlcHRoU3RlbmNpbFxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgbmV4dERlcHRoU3RlbmNpbCA9IG5ldyBGcmFtZWJ1ZmZlckF0dGFjaG1lbnQoXG4gICAgICAgICAgICAgICAgR0xfUkVOREVSQlVGRkVSLFxuICAgICAgICAgICAgICAgIDAsXG4gICAgICAgICAgICAgICAgbnVsbCxcbiAgICAgICAgICAgICAgICByZW5kZXJidWZmZXJTdGF0ZS5jcmVhdGUoe1xuICAgICAgICAgICAgICAgICAgZm9ybWF0OiBkZXB0aFJlbmRlcmJ1ZmZlckZvcm1hdCxcbiAgICAgICAgICAgICAgICAgIHdpZHRoOiB3aWR0aCxcbiAgICAgICAgICAgICAgICAgIGhlaWdodDogaGVpZ2h0XG4gICAgICAgICAgICAgICAgfSkpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKGRlcHRoKSB7XG4gICAgICAgICAgICBpZiAoc3RlbmNpbCkge1xuICAgICAgICAgICAgICBkZXB0aFN0ZW5jaWxCdWZmZXIgPSBuZXh0RGVwdGhTdGVuY2lsXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBkZXB0aEJ1ZmZlciA9IG5leHREZXB0aFN0ZW5jaWxcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc3RlbmNpbEJ1ZmZlciA9IG5leHREZXB0aFN0ZW5jaWxcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIFxuXG4gICAgICAgIGluY1JlZkFuZENoZWNrU2hhcGUoXG4gICAgICAgICAgZGVwdGhCdWZmZXIgfHxcbiAgICAgICAgICBzdGVuY2lsQnVmZmVyIHx8XG4gICAgICAgICAgZGVwdGhTdGVuY2lsQnVmZmVyLFxuICAgICAgICAgIGZyYW1lYnVmZmVyKVxuICAgICAgfVxuXG4gICAgICBkZWNGQk9SZWZzKGZyYW1lYnVmZmVyKVxuXG4gICAgICBmcmFtZWJ1ZmZlci5jb2xvckF0dGFjaG1lbnRzID0gY29sb3JCdWZmZXJzXG4gICAgICBmcmFtZWJ1ZmZlci5kZXB0aEF0dGFjaG1lbnQgPSBkZXB0aEJ1ZmZlclxuICAgICAgZnJhbWVidWZmZXIuc3RlbmNpbEF0dGFjaG1lbnQgPSBzdGVuY2lsQnVmZmVyXG4gICAgICBmcmFtZWJ1ZmZlci5kZXB0aFN0ZW5jaWxBdHRhY2htZW50ID0gZGVwdGhTdGVuY2lsQnVmZmVyXG4gICAgICBmcmFtZWJ1ZmZlci5vd25zQ29sb3IgPSBvd25zQ29sb3JcbiAgICAgIGZyYW1lYnVmZmVyLm93bnNEZXB0aFN0ZW5jaWwgPSBvd25zRGVwdGhTdGVuY2lsXG5cbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci5jb2xvciA9IGNvbG9yQnVmZmVycy5tYXAodW53cmFwQXR0YWNobWVudClcbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci5kZXB0aCA9IHVud3JhcEF0dGFjaG1lbnQoZGVwdGhCdWZmZXIpXG4gICAgICByZWdsRnJhbWVidWZmZXIuc3RlbmNpbCA9IHVud3JhcEF0dGFjaG1lbnQoc3RlbmNpbEJ1ZmZlcilcbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci5kZXB0aFN0ZW5jaWwgPSB1bndyYXBBdHRhY2htZW50KGRlcHRoU3RlbmNpbEJ1ZmZlcilcblxuICAgICAgcmVmcmVzaChmcmFtZWJ1ZmZlcilcblxuICAgICAgcmVnbEZyYW1lYnVmZmVyLndpZHRoID0gZnJhbWVidWZmZXIud2lkdGhcbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci5oZWlnaHQgPSBmcmFtZWJ1ZmZlci5oZWlnaHRcblxuICAgICAgcmV0dXJuIHJlZ2xGcmFtZWJ1ZmZlclxuICAgIH1cblxuICAgIHJlZ2xGcmFtZWJ1ZmZlcihvcHRpb25zKVxuXG4gICAgcmVnbEZyYW1lYnVmZmVyLl9yZWdsVHlwZSA9ICdmcmFtZWJ1ZmZlcidcbiAgICByZWdsRnJhbWVidWZmZXIuX2ZyYW1lYnVmZmVyID0gZnJhbWVidWZmZXJcbiAgICByZWdsRnJhbWVidWZmZXIuX2Rlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7XG4gICAgICBkZXN0cm95KGZyYW1lYnVmZmVyKVxuICAgIH1cblxuICAgIHJldHVybiByZWdsRnJhbWVidWZmZXJcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlZnJlc2hDYWNoZSAoKSB7XG4gICAgdmFsdWVzKGZyYW1lYnVmZmVyU2V0KS5mb3JFYWNoKHJlZnJlc2gpXG4gIH1cblxuICBmdW5jdGlvbiBjbGVhckNhY2hlICgpIHtcbiAgICB2YWx1ZXMoZnJhbWVidWZmZXJTZXQpLmZvckVhY2goZGVzdHJveSlcbiAgfVxuXG4gIHJldHVybiBleHRlbmQoZnJhbWVidWZmZXJTdGF0ZSwge1xuICAgIGdldEZyYW1lYnVmZmVyOiBmdW5jdGlvbiAob2JqZWN0KSB7XG4gICAgICBpZiAodHlwZW9mIG9iamVjdCA9PT0gJ2Z1bmN0aW9uJyAmJiBvYmplY3QuX3JlZ2xUeXBlID09PSAnZnJhbWVidWZmZXInKSB7XG4gICAgICAgIHZhciBmYm8gPSBvYmplY3QuX2ZyYW1lYnVmZmVyXG4gICAgICAgIGlmIChmYm8gaW5zdGFuY2VvZiBSRUdMRnJhbWVidWZmZXIpIHtcbiAgICAgICAgICByZXR1cm4gZmJvXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsXG4gICAgfSxcbiAgICBjcmVhdGU6IGNyZWF0ZUZCTyxcbiAgICBjbGVhcjogY2xlYXJDYWNoZSxcbiAgICByZWZyZXNoOiByZWZyZXNoQ2FjaGVcbiAgfSlcbn1cbiIsInZhciBHTF9TVUJQSVhFTF9CSVRTID0gMHgwRDUwXG52YXIgR0xfUkVEX0JJVFMgPSAweDBENTJcbnZhciBHTF9HUkVFTl9CSVRTID0gMHgwRDUzXG52YXIgR0xfQkxVRV9CSVRTID0gMHgwRDU0XG52YXIgR0xfQUxQSEFfQklUUyA9IDB4MEQ1NVxudmFyIEdMX0RFUFRIX0JJVFMgPSAweDBENTZcbnZhciBHTF9TVEVOQ0lMX0JJVFMgPSAweDBENTdcblxudmFyIEdMX0FMSUFTRURfUE9JTlRfU0laRV9SQU5HRSA9IDB4ODQ2RFxudmFyIEdMX0FMSUFTRURfTElORV9XSURUSF9SQU5HRSA9IDB4ODQ2RVxuXG52YXIgR0xfTUFYX1RFWFRVUkVfU0laRSA9IDB4MEQzM1xudmFyIEdMX01BWF9WSUVXUE9SVF9ESU1TID0gMHgwRDNBXG52YXIgR0xfTUFYX1ZFUlRFWF9BVFRSSUJTID0gMHg4ODY5XG52YXIgR0xfTUFYX1ZFUlRFWF9VTklGT1JNX1ZFQ1RPUlMgPSAweDhERkJcbnZhciBHTF9NQVhfVkFSWUlOR19WRUNUT1JTID0gMHg4REZDXG52YXIgR0xfTUFYX0NPTUJJTkVEX1RFWFRVUkVfSU1BR0VfVU5JVFMgPSAweDhCNERcbnZhciBHTF9NQVhfVkVSVEVYX1RFWFRVUkVfSU1BR0VfVU5JVFMgPSAweDhCNENcbnZhciBHTF9NQVhfVEVYVFVSRV9JTUFHRV9VTklUUyA9IDB4ODg3MlxudmFyIEdMX01BWF9GUkFHTUVOVF9VTklGT1JNX1ZFQ1RPUlMgPSAweDhERkRcbnZhciBHTF9NQVhfQ1VCRV9NQVBfVEVYVFVSRV9TSVpFID0gMHg4NTFDXG52YXIgR0xfTUFYX1JFTkRFUkJVRkZFUl9TSVpFID0gMHg4NEU4XG5cbnZhciBHTF9WRU5ET1IgPSAweDFGMDBcbnZhciBHTF9SRU5ERVJFUiA9IDB4MUYwMVxudmFyIEdMX1ZFUlNJT04gPSAweDFGMDJcbnZhciBHTF9TSEFESU5HX0xBTkdVQUdFX1ZFUlNJT04gPSAweDhCOENcblxudmFyIEdMX01BWF9URVhUVVJFX01BWF9BTklTT1RST1BZX0VYVCA9IDB4ODRGRlxuXG52YXIgR0xfTUFYX0NPTE9SX0FUVEFDSE1FTlRTX1dFQkdMID0gMHg4Q0RGXG52YXIgR0xfTUFYX0RSQVdfQlVGRkVSU19XRUJHTCA9IDB4ODgyNFxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChnbCwgZXh0ZW5zaW9ucykge1xuICB2YXIgbWF4QW5pc290cm9waWMgPSAxXG4gIGlmIChleHRlbnNpb25zLmV4dF90ZXh0dXJlX2ZpbHRlcl9hbmlzb3Ryb3BpYykge1xuICAgIG1heEFuaXNvdHJvcGljID0gZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9URVhUVVJFX01BWF9BTklTT1RST1BZX0VYVClcbiAgfVxuXG4gIHZhciBtYXhEcmF3YnVmZmVycyA9IDFcbiAgdmFyIG1heENvbG9yQXR0YWNobWVudHMgPSAxXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2RyYXdfYnVmZmVycykge1xuICAgIG1heERyYXdidWZmZXJzID0gZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9EUkFXX0JVRkZFUlNfV0VCR0wpXG4gICAgbWF4Q29sb3JBdHRhY2htZW50cyA9IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfQ09MT1JfQVRUQUNITUVOVFNfV0VCR0wpXG4gIH1cblxuICByZXR1cm4ge1xuICAgIC8vIGRyYXdpbmcgYnVmZmVyIGJpdCBkZXB0aFxuICAgIGNvbG9yQml0czogW1xuICAgICAgZ2wuZ2V0UGFyYW1ldGVyKEdMX1JFRF9CSVRTKSxcbiAgICAgIGdsLmdldFBhcmFtZXRlcihHTF9HUkVFTl9CSVRTKSxcbiAgICAgIGdsLmdldFBhcmFtZXRlcihHTF9CTFVFX0JJVFMpLFxuICAgICAgZ2wuZ2V0UGFyYW1ldGVyKEdMX0FMUEhBX0JJVFMpXG4gICAgXSxcbiAgICBkZXB0aEJpdHM6IGdsLmdldFBhcmFtZXRlcihHTF9ERVBUSF9CSVRTKSxcbiAgICBzdGVuY2lsQml0czogZ2wuZ2V0UGFyYW1ldGVyKEdMX1NURU5DSUxfQklUUyksXG4gICAgc3VicGl4ZWxCaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfU1VCUElYRUxfQklUUyksXG5cbiAgICAvLyBzdXBwb3J0ZWQgZXh0ZW5zaW9uc1xuICAgIGV4dGVuc2lvbnM6IE9iamVjdC5rZXlzKGV4dGVuc2lvbnMpLmZpbHRlcihmdW5jdGlvbiAoZXh0KSB7XG4gICAgICByZXR1cm4gISFleHRlbnNpb25zW2V4dF1cbiAgICB9KSxcblxuICAgIC8vIG1heCBhbmlzbyBzYW1wbGVzXG4gICAgbWF4QW5pc290cm9waWM6IG1heEFuaXNvdHJvcGljLFxuXG4gICAgLy8gbWF4IGRyYXcgYnVmZmVyc1xuICAgIG1heERyYXdidWZmZXJzOiBtYXhEcmF3YnVmZmVycyxcbiAgICBtYXhDb2xvckF0dGFjaG1lbnRzOiBtYXhDb2xvckF0dGFjaG1lbnRzLFxuXG4gICAgLy8gcG9pbnQgYW5kIGxpbmUgc2l6ZSByYW5nZXNcbiAgICBwb2ludFNpemVEaW1zOiBnbC5nZXRQYXJhbWV0ZXIoR0xfQUxJQVNFRF9QT0lOVF9TSVpFX1JBTkdFKSxcbiAgICBsaW5lV2lkdGhEaW1zOiBnbC5nZXRQYXJhbWV0ZXIoR0xfQUxJQVNFRF9MSU5FX1dJRFRIX1JBTkdFKSxcbiAgICBtYXhWaWV3cG9ydERpbXM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVklFV1BPUlRfRElNUyksXG4gICAgbWF4Q29tYmluZWRUZXh0dXJlVW5pdHM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfQ09NQklORURfVEVYVFVSRV9JTUFHRV9VTklUUyksXG4gICAgbWF4Q3ViZU1hcFNpemU6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfQ1VCRV9NQVBfVEVYVFVSRV9TSVpFKSxcbiAgICBtYXhSZW5kZXJidWZmZXJTaXplOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1JFTkRFUkJVRkZFUl9TSVpFKSxcbiAgICBtYXhUZXh0dXJlVW5pdHM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVEVYVFVSRV9JTUFHRV9VTklUUyksXG4gICAgbWF4VGV4dHVyZVNpemU6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVEVYVFVSRV9TSVpFKSxcbiAgICBtYXhBdHRyaWJ1dGVzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1ZFUlRFWF9BVFRSSUJTKSxcbiAgICBtYXhWZXJ0ZXhVbmlmb3JtczogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9WRVJURVhfVU5JRk9STV9WRUNUT1JTKSxcbiAgICBtYXhWZXJ0ZXhUZXh0dXJlVW5pdHM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVkVSVEVYX1RFWFRVUkVfSU1BR0VfVU5JVFMpLFxuICAgIG1heFZhcnlpbmdWZWN0b3JzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1ZBUllJTkdfVkVDVE9SUyksXG4gICAgbWF4RnJhZ21lbnRVbmlmb3JtczogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9GUkFHTUVOVF9VTklGT1JNX1ZFQ1RPUlMpLFxuXG4gICAgLy8gdmVuZG9yIGluZm9cbiAgICBnbHNsOiBnbC5nZXRQYXJhbWV0ZXIoR0xfU0hBRElOR19MQU5HVUFHRV9WRVJTSU9OKSxcbiAgICByZW5kZXJlcjogZ2wuZ2V0UGFyYW1ldGVyKEdMX1JFTkRFUkVSKSxcbiAgICB2ZW5kb3I6IGdsLmdldFBhcmFtZXRlcihHTF9WRU5ET1IpLFxuICAgIHZlcnNpb246IGdsLmdldFBhcmFtZXRlcihHTF9WRVJTSU9OKVxuICB9XG59XG4iLCJcbnZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL3V0aWwvaXMtdHlwZWQtYXJyYXknKVxuXG52YXIgR0xfUkdCQSA9IDY0MDhcbnZhciBHTF9VTlNJR05FRF9CWVRFID0gNTEyMVxudmFyIEdMX1BBQ0tfQUxJR05NRU5UID0gMHgwRDA1XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcFJlYWRQaXhlbHMgKGdsLCByZWdsUG9sbCwgY29udGV4dCkge1xuICBmdW5jdGlvbiByZWFkUGl4ZWxzIChpbnB1dCkge1xuICAgIHZhciBvcHRpb25zID0gaW5wdXQgfHwge31cbiAgICBpZiAoaXNUeXBlZEFycmF5KGlucHV0KSkge1xuICAgICAgb3B0aW9ucyA9IHtcbiAgICAgICAgZGF0YTogb3B0aW9uc1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMikge1xuICAgICAgb3B0aW9ucyA9IHtcbiAgICAgICAgd2lkdGg6IGFyZ3VtZW50c1swXSB8IDAsXG4gICAgICAgIGhlaWdodDogYXJndW1lbnRzWzFdIHwgMFxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAodHlwZW9mIGlucHV0ICE9PSAnb2JqZWN0Jykge1xuICAgICAgb3B0aW9ucyA9IHt9XG4gICAgfVxuXG4gICAgLy8gVXBkYXRlIFdlYkdMIHN0YXRlXG4gICAgcmVnbFBvbGwoKVxuXG4gICAgLy8gUmVhZCB2aWV3cG9ydCBzdGF0ZVxuICAgIHZhciB4ID0gb3B0aW9ucy54IHx8IDBcbiAgICB2YXIgeSA9IG9wdGlvbnMueSB8fCAwXG4gICAgdmFyIHdpZHRoID0gb3B0aW9ucy53aWR0aCB8fCBjb250ZXh0LnZpZXdwb3J0V2lkdGhcbiAgICB2YXIgaGVpZ2h0ID0gb3B0aW9ucy5oZWlnaHQgfHwgY29udGV4dC52aWV3cG9ydEhlaWdodFxuXG4gICAgLy8gQ29tcHV0ZSBzaXplXG4gICAgdmFyIHNpemUgPSB3aWR0aCAqIGhlaWdodCAqIDRcblxuICAgIC8vIEFsbG9jYXRlIGRhdGFcbiAgICB2YXIgZGF0YSA9IG9wdGlvbnMuZGF0YSB8fCBuZXcgVWludDhBcnJheShzaXplKVxuXG4gICAgLy8gVHlwZSBjaGVja1xuICAgIFxuICAgIFxuXG4gICAgLy8gUnVuIHJlYWQgcGl4ZWxzXG4gICAgZ2wucGl4ZWxTdG9yZWkoR0xfUEFDS19BTElHTk1FTlQsIDQpXG4gICAgZ2wucmVhZFBpeGVscyh4LCB5LCB3aWR0aCwgaGVpZ2h0LCBHTF9SR0JBLCBHTF9VTlNJR05FRF9CWVRFLCBkYXRhKVxuXG4gICAgcmV0dXJuIGRhdGFcbiAgfVxuXG4gIHJldHVybiByZWFkUGl4ZWxzXG59XG4iLCJcbnZhciB2YWx1ZXMgPSByZXF1aXJlKCcuL3V0aWwvdmFsdWVzJylcblxudmFyIEdMX1JFTkRFUkJVRkZFUiA9IDB4OEQ0MVxuXG52YXIgR0xfUkdCQTQgPSAweDgwNTZcbnZhciBHTF9SR0I1X0ExID0gMHg4MDU3XG52YXIgR0xfUkdCNTY1ID0gMHg4RDYyXG52YXIgR0xfREVQVEhfQ09NUE9ORU5UMTYgPSAweDgxQTVcbnZhciBHTF9TVEVOQ0lMX0lOREVYOCA9IDB4OEQ0OFxudmFyIEdMX0RFUFRIX1NURU5DSUwgPSAweDg0RjlcblxudmFyIEdMX1NSR0I4X0FMUEhBOF9FWFQgPSAweDhDNDNcblxudmFyIEdMX1JHQkEzMkZfRVhUID0gMHg4ODE0XG5cbnZhciBHTF9SR0JBMTZGX0VYVCA9IDB4ODgxQVxudmFyIEdMX1JHQjE2Rl9FWFQgPSAweDg4MUJcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoZ2wsIGV4dGVuc2lvbnMsIGxpbWl0cykge1xuICB2YXIgZm9ybWF0VHlwZXMgPSB7XG4gICAgJ3JnYmE0JzogR0xfUkdCQTQsXG4gICAgJ3JnYjU2NSc6IEdMX1JHQjU2NSxcbiAgICAncmdiNSBhMSc6IEdMX1JHQjVfQTEsXG4gICAgJ2RlcHRoJzogR0xfREVQVEhfQ09NUE9ORU5UMTYsXG4gICAgJ3N0ZW5jaWwnOiBHTF9TVEVOQ0lMX0lOREVYOCxcbiAgICAnZGVwdGggc3RlbmNpbCc6IEdMX0RFUFRIX1NURU5DSUxcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLmV4dF9zcmdiKSB7XG4gICAgZm9ybWF0VHlwZXNbJ3NyZ2JhJ10gPSBHTF9TUkdCOF9BTFBIQThfRVhUXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5leHRfY29sb3JfYnVmZmVyX2hhbGZfZmxvYXQpIHtcbiAgICBmb3JtYXRUeXBlc1sncmdiYTE2ZiddID0gR0xfUkdCQTE2Rl9FWFRcbiAgICBmb3JtYXRUeXBlc1sncmdiMTZmJ10gPSBHTF9SR0IxNkZfRVhUXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb2xvcl9idWZmZXJfZmxvYXQpIHtcbiAgICBmb3JtYXRUeXBlc1sncmdiYTMyZiddID0gR0xfUkdCQTMyRl9FWFRcbiAgfVxuXG4gIHZhciByZW5kZXJidWZmZXJDb3VudCA9IDBcbiAgdmFyIHJlbmRlcmJ1ZmZlclNldCA9IHt9XG5cbiAgZnVuY3Rpb24gUkVHTFJlbmRlcmJ1ZmZlciAoKSB7XG4gICAgdGhpcy5pZCA9IHJlbmRlcmJ1ZmZlckNvdW50KytcbiAgICB0aGlzLnJlZkNvdW50ID0gMVxuXG4gICAgdGhpcy5yZW5kZXJidWZmZXIgPSBudWxsXG5cbiAgICB0aGlzLmZvcm1hdCA9IEdMX1JHQkE0XG4gICAgdGhpcy53aWR0aCA9IDBcbiAgICB0aGlzLmhlaWdodCA9IDBcbiAgfVxuXG4gIFJFR0xSZW5kZXJidWZmZXIucHJvdG90eXBlLmRlY1JlZiA9IGZ1bmN0aW9uICgpIHtcbiAgICBpZiAoLS10aGlzLnJlZkNvdW50ID09PSAwKSB7XG4gICAgICBkZXN0cm95KHRoaXMpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcmVmcmVzaCAocmIpIHtcbiAgICBpZiAoIWdsLmlzUmVuZGVyYnVmZmVyKHJiLnJlbmRlcmJ1ZmZlcikpIHtcbiAgICAgIHJiLnJlbmRlcmJ1ZmZlciA9IGdsLmNyZWF0ZVJlbmRlcmJ1ZmZlcigpXG4gICAgfVxuICAgIGdsLmJpbmRSZW5kZXJidWZmZXIoR0xfUkVOREVSQlVGRkVSLCByYi5yZW5kZXJidWZmZXIpXG4gICAgZ2wucmVuZGVyYnVmZmVyU3RvcmFnZShcbiAgICAgIEdMX1JFTkRFUkJVRkZFUixcbiAgICAgIHJiLmZvcm1hdCxcbiAgICAgIHJiLndpZHRoLFxuICAgICAgcmIuaGVpZ2h0KVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSAocmIpIHtcbiAgICB2YXIgaGFuZGxlID0gcmIucmVuZGVyYnVmZmVyXG4gICAgXG4gICAgZ2wuYmluZFJlbmRlcmJ1ZmZlcihHTF9SRU5ERVJCVUZGRVIsIG51bGwpXG4gICAgaWYgKGdsLmlzUmVuZGVyYnVmZmVyKGhhbmRsZSkpIHtcbiAgICAgIGdsLmRlbGV0ZVJlbmRlcmJ1ZmZlcihoYW5kbGUpXG4gICAgfVxuICAgIHJiLnJlbmRlcmJ1ZmZlciA9IG51bGxcbiAgICByYi5yZWZDb3VudCA9IDBcbiAgICBkZWxldGUgcmVuZGVyYnVmZmVyU2V0W3JiLmlkXVxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlUmVuZGVyYnVmZmVyIChpbnB1dCkge1xuICAgIHZhciByZW5kZXJidWZmZXIgPSBuZXcgUkVHTFJlbmRlcmJ1ZmZlcigpXG4gICAgcmVuZGVyYnVmZmVyU2V0W3JlbmRlcmJ1ZmZlci5pZF0gPSByZW5kZXJidWZmZXJcblxuICAgIGZ1bmN0aW9uIHJlZ2xSZW5kZXJidWZmZXIgKGlucHV0KSB7XG4gICAgICB2YXIgb3B0aW9ucyA9IGlucHV0IHx8IHt9XG5cbiAgICAgIHZhciB3ID0gMFxuICAgICAgdmFyIGggPSAwXG4gICAgICBpZiAoJ3NoYXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBzaGFwZSA9IG9wdGlvbnMuc2hhcGVcbiAgICAgICAgXG4gICAgICAgIHcgPSBzaGFwZVswXSB8IDBcbiAgICAgICAgaCA9IHNoYXBlWzFdIHwgMFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKCdyYWRpdXMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB3ID0gaCA9IG9wdGlvbnMucmFkaXVzIHwgMFxuICAgICAgICB9XG4gICAgICAgIGlmICgnd2lkdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB3ID0gb3B0aW9ucy53aWR0aCB8IDBcbiAgICAgICAgfVxuICAgICAgICBpZiAoJ2hlaWdodCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGggPSBvcHRpb25zLmhlaWdodCB8IDBcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgdmFyIHMgPSBsaW1pdHMubWF4UmVuZGVyYnVmZmVyU2l6ZVxuICAgICAgXG4gICAgICByZWdsUmVuZGVyYnVmZmVyLndpZHRoID0gcmVuZGVyYnVmZmVyLndpZHRoID0gTWF0aC5tYXgodywgMSlcbiAgICAgIHJlZ2xSZW5kZXJidWZmZXIuaGVpZ2h0ID0gcmVuZGVyYnVmZmVyLmhlaWdodCA9IE1hdGgubWF4KGgsIDEpXG5cbiAgICAgIHJlbmRlcmJ1ZmZlci5mb3JtYXQgPSBHTF9SR0JBNFxuICAgICAgaWYgKCdmb3JtYXQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGZvcm1hdCA9IG9wdGlvbnMuZm9ybWF0XG4gICAgICAgIFxuICAgICAgICByZW5kZXJidWZmZXIuZm9ybWF0ID0gZm9ybWF0VHlwZXNbZm9ybWF0XVxuICAgICAgfVxuXG4gICAgICByZWZyZXNoKHJlbmRlcmJ1ZmZlcilcblxuICAgICAgcmV0dXJuIHJlZ2xSZW5kZXJidWZmZXJcbiAgICB9XG5cbiAgICByZWdsUmVuZGVyYnVmZmVyKGlucHV0KVxuXG4gICAgcmVnbFJlbmRlcmJ1ZmZlci5fcmVnbFR5cGUgPSAncmVuZGVyYnVmZmVyJ1xuICAgIHJlZ2xSZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlciA9IHJlbmRlcmJ1ZmZlclxuICAgIHJlZ2xSZW5kZXJidWZmZXIuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJlbmRlcmJ1ZmZlci5kZWNSZWYoKVxuICAgIH1cblxuICAgIHJldHVybiByZWdsUmVuZGVyYnVmZmVyXG4gIH1cblxuICBmdW5jdGlvbiByZWZyZXNoUmVuZGVyYnVmZmVycyAoKSB7XG4gICAgdmFsdWVzKHJlbmRlcmJ1ZmZlclNldCkuZm9yRWFjaChyZWZyZXNoKVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveVJlbmRlcmJ1ZmZlcnMgKCkge1xuICAgIHZhbHVlcyhyZW5kZXJidWZmZXJTZXQpLmZvckVhY2goZGVzdHJveSlcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY3JlYXRlOiBjcmVhdGVSZW5kZXJidWZmZXIsXG4gICAgcmVmcmVzaDogcmVmcmVzaFJlbmRlcmJ1ZmZlcnMsXG4gICAgY2xlYXI6IGRlc3Ryb3lSZW5kZXJidWZmZXJzXG4gIH1cbn1cbiIsIlxudmFyIHZhbHVlcyA9IHJlcXVpcmUoJy4vdXRpbC92YWx1ZXMnKVxuXG52YXIgR0xfRlJBR01FTlRfU0hBREVSID0gMzU2MzJcbnZhciBHTF9WRVJURVhfU0hBREVSID0gMzU2MzNcblxudmFyIEdMX0FDVElWRV9VTklGT1JNUyA9IDB4OEI4NlxudmFyIEdMX0FDVElWRV9BVFRSSUJVVEVTID0gMHg4Qjg5XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcFNoYWRlclN0YXRlIChnbCwgc3RyaW5nU3RvcmUpIHtcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIGdsc2wgY29tcGlsYXRpb24gYW5kIGxpbmtpbmdcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIHZhciBmcmFnU2hhZGVycyA9IHt9XG4gIHZhciB2ZXJ0U2hhZGVycyA9IHt9XG5cbiAgZnVuY3Rpb24gQWN0aXZlSW5mbyAobmFtZSwgaWQsIGxvY2F0aW9uLCBpbmZvKSB7XG4gICAgdGhpcy5uYW1lID0gbmFtZVxuICAgIHRoaXMuaWQgPSBpZFxuICAgIHRoaXMubG9jYXRpb24gPSBsb2NhdGlvblxuICAgIHRoaXMuaW5mbyA9IGluZm9cbiAgfVxuXG4gIGZ1bmN0aW9uIGluc2VydEFjdGl2ZUluZm8gKGxpc3QsIGluZm8pIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxpc3QubGVuZ3RoOyArK2kpIHtcbiAgICAgIGlmIChsaXN0W2ldLmlkID09PSBpbmZvLmlkKSB7XG4gICAgICAgIGxpc3RbaV0ubG9jYXRpb24gPSBpbmZvLmxvY2F0aW9uXG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgIH1cbiAgICBsaXN0LnB1c2goaW5mbylcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldFNoYWRlciAodHlwZSwgaWQsIGNvbW1hbmQpIHtcbiAgICB2YXIgY2FjaGUgPSB0eXBlID09PSBHTF9GUkFHTUVOVF9TSEFERVIgPyBmcmFnU2hhZGVycyA6IHZlcnRTaGFkZXJzXG4gICAgdmFyIHNoYWRlciA9IGNhY2hlW2lkXVxuXG4gICAgaWYgKCFzaGFkZXIpIHtcbiAgICAgIHZhciBzb3VyY2UgPSBzdHJpbmdTdG9yZS5zdHIoaWQpXG4gICAgICBzaGFkZXIgPSBnbC5jcmVhdGVTaGFkZXIodHlwZSlcbiAgICAgIGdsLnNoYWRlclNvdXJjZShzaGFkZXIsIHNvdXJjZSlcbiAgICAgIGdsLmNvbXBpbGVTaGFkZXIoc2hhZGVyKVxuICAgICAgXG4gICAgICBjYWNoZVtpZF0gPSBzaGFkZXJcbiAgICB9XG5cbiAgICByZXR1cm4gc2hhZGVyXG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gcHJvZ3JhbSBsaW5raW5nXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICB2YXIgcHJvZ3JhbUNhY2hlID0ge31cbiAgdmFyIHByb2dyYW1MaXN0ID0gW11cblxuICB2YXIgUFJPR1JBTV9DT1VOVEVSID0gMFxuXG4gIGZ1bmN0aW9uIFJFR0xQcm9ncmFtIChmcmFnSWQsIHZlcnRJZCkge1xuICAgIHRoaXMuaWQgPSBQUk9HUkFNX0NPVU5URVIrK1xuICAgIHRoaXMuZnJhZ0lkID0gZnJhZ0lkXG4gICAgdGhpcy52ZXJ0SWQgPSB2ZXJ0SWRcbiAgICB0aGlzLnByb2dyYW0gPSBudWxsXG4gICAgdGhpcy51bmlmb3JtcyA9IFtdXG4gICAgdGhpcy5hdHRyaWJ1dGVzID0gW11cbiAgfVxuXG4gIGZ1bmN0aW9uIGxpbmtQcm9ncmFtIChkZXNjLCBjb21tYW5kKSB7XG4gICAgdmFyIGksIGluZm9cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBjb21waWxlICYgbGlua1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICB2YXIgZnJhZ1NoYWRlciA9IGdldFNoYWRlcihHTF9GUkFHTUVOVF9TSEFERVIsIGRlc2MuZnJhZ0lkKVxuICAgIHZhciB2ZXJ0U2hhZGVyID0gZ2V0U2hhZGVyKEdMX1ZFUlRFWF9TSEFERVIsIGRlc2MudmVydElkKVxuXG4gICAgdmFyIHByb2dyYW0gPSBkZXNjLnByb2dyYW0gPSBnbC5jcmVhdGVQcm9ncmFtKClcbiAgICBnbC5hdHRhY2hTaGFkZXIocHJvZ3JhbSwgZnJhZ1NoYWRlcilcbiAgICBnbC5hdHRhY2hTaGFkZXIocHJvZ3JhbSwgdmVydFNoYWRlcilcbiAgICBnbC5saW5rUHJvZ3JhbShwcm9ncmFtKVxuICAgIFxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGdyYWIgdW5pZm9ybXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgdmFyIG51bVVuaWZvcm1zID0gZ2wuZ2V0UHJvZ3JhbVBhcmFtZXRlcihwcm9ncmFtLCBHTF9BQ1RJVkVfVU5JRk9STVMpXG4gICAgdmFyIHVuaWZvcm1zID0gZGVzYy51bmlmb3Jtc1xuICAgIGZvciAoaSA9IDA7IGkgPCBudW1Vbmlmb3JtczsgKytpKSB7XG4gICAgICBpbmZvID0gZ2wuZ2V0QWN0aXZlVW5pZm9ybShwcm9ncmFtLCBpKVxuICAgICAgaWYgKGluZm8pIHtcbiAgICAgICAgaWYgKGluZm8uc2l6ZSA+IDEpIHtcbiAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGluZm8uc2l6ZTsgKytqKSB7XG4gICAgICAgICAgICB2YXIgbmFtZSA9IGluZm8ubmFtZS5yZXBsYWNlKCdbMF0nLCAnWycgKyBqICsgJ10nKVxuICAgICAgICAgICAgaW5zZXJ0QWN0aXZlSW5mbyh1bmlmb3JtcywgbmV3IEFjdGl2ZUluZm8oXG4gICAgICAgICAgICAgIG5hbWUsXG4gICAgICAgICAgICAgIHN0cmluZ1N0b3JlLmlkKG5hbWUpLFxuICAgICAgICAgICAgICBnbC5nZXRVbmlmb3JtTG9jYXRpb24ocHJvZ3JhbSwgbmFtZSksXG4gICAgICAgICAgICAgIGluZm8pKVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpbnNlcnRBY3RpdmVJbmZvKHVuaWZvcm1zLCBuZXcgQWN0aXZlSW5mbyhcbiAgICAgICAgICAgIGluZm8ubmFtZSxcbiAgICAgICAgICAgIHN0cmluZ1N0b3JlLmlkKGluZm8ubmFtZSksXG4gICAgICAgICAgICBnbC5nZXRVbmlmb3JtTG9jYXRpb24ocHJvZ3JhbSwgaW5mby5uYW1lKSxcbiAgICAgICAgICAgIGluZm8pKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGdyYWIgYXR0cmlidXRlc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICB2YXIgbnVtQXR0cmlidXRlcyA9IGdsLmdldFByb2dyYW1QYXJhbWV0ZXIocHJvZ3JhbSwgR0xfQUNUSVZFX0FUVFJJQlVURVMpXG4gICAgdmFyIGF0dHJpYnV0ZXMgPSBkZXNjLmF0dHJpYnV0ZXNcbiAgICBmb3IgKGkgPSAwOyBpIDwgbnVtQXR0cmlidXRlczsgKytpKSB7XG4gICAgICBpbmZvID0gZ2wuZ2V0QWN0aXZlQXR0cmliKHByb2dyYW0sIGkpXG4gICAgICBpZiAoaW5mbykge1xuICAgICAgICBpbnNlcnRBY3RpdmVJbmZvKGF0dHJpYnV0ZXMsIG5ldyBBY3RpdmVJbmZvKFxuICAgICAgICAgIGluZm8ubmFtZSxcbiAgICAgICAgICBzdHJpbmdTdG9yZS5pZChpbmZvLm5hbWUpLFxuICAgICAgICAgIGdsLmdldEF0dHJpYkxvY2F0aW9uKHByb2dyYW0sIGluZm8ubmFtZSksXG4gICAgICAgICAgaW5mbykpXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjbGVhcjogZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIGRlbGV0ZVNoYWRlciA9IGdsLmRlbGV0ZVNoYWRlci5iaW5kKGdsKVxuICAgICAgdmFsdWVzKGZyYWdTaGFkZXJzKS5mb3JFYWNoKGRlbGV0ZVNoYWRlcilcbiAgICAgIGZyYWdTaGFkZXJzID0ge31cbiAgICAgIHZhbHVlcyh2ZXJ0U2hhZGVycykuZm9yRWFjaChkZWxldGVTaGFkZXIpXG4gICAgICB2ZXJ0U2hhZGVycyA9IHt9XG5cbiAgICAgIHByb2dyYW1MaXN0LmZvckVhY2goZnVuY3Rpb24gKGRlc2MpIHtcbiAgICAgICAgZ2wuZGVsZXRlUHJvZ3JhbShkZXNjLnByb2dyYW0pXG4gICAgICB9KVxuICAgICAgcHJvZ3JhbUxpc3QubGVuZ3RoID0gMFxuICAgICAgcHJvZ3JhbUNhY2hlID0ge31cbiAgICB9LFxuXG4gICAgcmVmcmVzaDogZnVuY3Rpb24gKCkge1xuICAgICAgZnJhZ1NoYWRlcnMgPSB7fVxuICAgICAgdmVydFNoYWRlcnMgPSB7fVxuICAgICAgcHJvZ3JhbUxpc3QuZm9yRWFjaChsaW5rUHJvZ3JhbSlcbiAgICB9LFxuXG4gICAgcHJvZ3JhbTogZnVuY3Rpb24gKHZlcnRJZCwgZnJhZ0lkLCBjb21tYW5kKSB7XG4gICAgICBcbiAgICAgIFxuXG4gICAgICB2YXIgY2FjaGUgPSBwcm9ncmFtQ2FjaGVbZnJhZ0lkXVxuICAgICAgaWYgKCFjYWNoZSkge1xuICAgICAgICBjYWNoZSA9IHByb2dyYW1DYWNoZVtmcmFnSWRdID0ge31cbiAgICAgIH1cbiAgICAgIHZhciBwcm9ncmFtID0gY2FjaGVbdmVydElkXVxuICAgICAgaWYgKCFwcm9ncmFtKSB7XG4gICAgICAgIHByb2dyYW0gPSBuZXcgUkVHTFByb2dyYW0oZnJhZ0lkLCB2ZXJ0SWQpXG4gICAgICAgIGxpbmtQcm9ncmFtKHByb2dyYW0sIGNvbW1hbmQpXG4gICAgICAgIGNhY2hlW3ZlcnRJZF0gPSBwcm9ncmFtXG4gICAgICAgIHByb2dyYW1MaXN0LnB1c2gocHJvZ3JhbSlcbiAgICAgIH1cbiAgICAgIHJldHVybiBwcm9ncmFtXG4gICAgfSxcblxuICAgIHNoYWRlcjogZ2V0U2hhZGVyLFxuXG4gICAgZnJhZzogbnVsbCxcbiAgICB2ZXJ0OiBudWxsXG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY3JlYXRlU3RyaW5nU3RvcmUgKCkge1xuICB2YXIgc3RyaW5nSWRzID0geycnOiAwfVxuICB2YXIgc3RyaW5nVmFsdWVzID0gWycnXVxuICByZXR1cm4ge1xuICAgIGlkOiBmdW5jdGlvbiAoc3RyKSB7XG4gICAgICB2YXIgcmVzdWx0ID0gc3RyaW5nSWRzW3N0cl1cbiAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgfVxuICAgICAgcmVzdWx0ID0gc3RyaW5nSWRzW3N0cl0gPSBzdHJpbmdWYWx1ZXMubGVuZ3RoXG4gICAgICBzdHJpbmdWYWx1ZXMucHVzaChzdHIpXG4gICAgICByZXR1cm4gcmVzdWx0XG4gICAgfSxcblxuICAgIHN0cjogZnVuY3Rpb24gKGlkKSB7XG4gICAgICByZXR1cm4gc3RyaW5nVmFsdWVzW2lkXVxuICAgIH1cbiAgfVxufVxuIiwiXG52YXIgZXh0ZW5kID0gcmVxdWlyZSgnLi91dGlsL2V4dGVuZCcpXG52YXIgdmFsdWVzID0gcmVxdWlyZSgnLi91dGlsL3ZhbHVlcycpXG52YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi91dGlsL2lzLXR5cGVkLWFycmF5JylcbnZhciBpc05EQXJyYXlMaWtlID0gcmVxdWlyZSgnLi91dGlsL2lzLW5kYXJyYXknKVxudmFyIGxvYWRUZXh0dXJlID0gcmVxdWlyZSgnLi91dGlsL2xvYWQtdGV4dHVyZScpXG52YXIgY29udmVydFRvSGFsZkZsb2F0ID0gcmVxdWlyZSgnLi91dGlsL3RvLWhhbGYtZmxvYXQnKVxudmFyIHBhcnNlRERTID0gcmVxdWlyZSgnLi91dGlsL3BhcnNlLWRkcycpXG5cbnZhciBHTF9DT01QUkVTU0VEX1RFWFRVUkVfRk9STUFUUyA9IDB4ODZBM1xuXG52YXIgR0xfVEVYVFVSRV8yRCA9IDB4MERFMVxudmFyIEdMX1RFWFRVUkVfQ1VCRV9NQVAgPSAweDg1MTNcbnZhciBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1ggPSAweDg1MTVcblxudmFyIEdMX1JHQkEgPSAweDE5MDhcbnZhciBHTF9BTFBIQSA9IDB4MTkwNlxudmFyIEdMX1JHQiA9IDB4MTkwN1xudmFyIEdMX0xVTUlOQU5DRSA9IDB4MTkwOVxudmFyIEdMX0xVTUlOQU5DRV9BTFBIQSA9IDB4MTkwQVxuXG52YXIgR0xfUkdCQTQgPSAweDgwNTZcbnZhciBHTF9SR0I1X0ExID0gMHg4MDU3XG52YXIgR0xfUkdCNTY1ID0gMHg4RDYyXG5cbnZhciBHTF9VTlNJR05FRF9TSE9SVF80XzRfNF80ID0gMHg4MDMzXG52YXIgR0xfVU5TSUdORURfU0hPUlRfNV81XzVfMSA9IDB4ODAzNFxudmFyIEdMX1VOU0lHTkVEX1NIT1JUXzVfNl81ID0gMHg4MzYzXG52YXIgR0xfVU5TSUdORURfSU5UXzI0XzhfV0VCR0wgPSAweDg0RkFcblxudmFyIEdMX0RFUFRIX0NPTVBPTkVOVCA9IDB4MTkwMlxudmFyIEdMX0RFUFRIX1NURU5DSUwgPSAweDg0RjlcblxudmFyIEdMX1NSR0JfRVhUID0gMHg4QzQwXG52YXIgR0xfU1JHQl9BTFBIQV9FWFQgPSAweDhDNDJcblxudmFyIEdMX0hBTEZfRkxPQVRfT0VTID0gMHg4RDYxXG5cbnZhciBHTF9DT01QUkVTU0VEX1JHQl9TM1RDX0RYVDFfRVhUID0gMHg4M0YwXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUMV9FWFQgPSAweDgzRjFcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQzX0VYVCA9IDB4ODNGMlxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDVfRVhUID0gMHg4M0YzXG5cbnZhciBHTF9DT01QUkVTU0VEX1JHQl9BVENfV0VCR0wgPSAweDhDOTJcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfQVRDX0VYUExJQ0lUX0FMUEhBX1dFQkdMID0gMHg4QzkzXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19JTlRFUlBPTEFURURfQUxQSEFfV0VCR0wgPSAweDg3RUVcblxudmFyIEdMX0NPTVBSRVNTRURfUkdCX1BWUlRDXzRCUFBWMV9JTUcgPSAweDhDMDBcbnZhciBHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ18yQlBQVjFfSU1HID0gMHg4QzAxXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1BWUlRDXzRCUFBWMV9JTUcgPSAweDhDMDJcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUFZSVENfMkJQUFYxX0lNRyA9IDB4OEMwM1xuXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfRVRDMV9XRUJHTCA9IDB4OEQ2NFxuXG52YXIgR0xfVU5TSUdORURfQllURSA9IDB4MTQwMVxudmFyIEdMX1VOU0lHTkVEX1NIT1JUID0gMHgxNDAzXG52YXIgR0xfVU5TSUdORURfSU5UID0gMHgxNDA1XG52YXIgR0xfRkxPQVQgPSAweDE0MDZcblxudmFyIEdMX1RFWFRVUkVfV1JBUF9TID0gMHgyODAyXG52YXIgR0xfVEVYVFVSRV9XUkFQX1QgPSAweDI4MDNcblxudmFyIEdMX1JFUEVBVCA9IDB4MjkwMVxudmFyIEdMX0NMQU1QX1RPX0VER0UgPSAweDgxMkZcbnZhciBHTF9NSVJST1JFRF9SRVBFQVQgPSAweDgzNzBcblxudmFyIEdMX1RFWFRVUkVfTUFHX0ZJTFRFUiA9IDB4MjgwMFxudmFyIEdMX1RFWFRVUkVfTUlOX0ZJTFRFUiA9IDB4MjgwMVxuXG52YXIgR0xfTkVBUkVTVCA9IDB4MjYwMFxudmFyIEdMX0xJTkVBUiA9IDB4MjYwMVxudmFyIEdMX05FQVJFU1RfTUlQTUFQX05FQVJFU1QgPSAweDI3MDBcbnZhciBHTF9MSU5FQVJfTUlQTUFQX05FQVJFU1QgPSAweDI3MDFcbnZhciBHTF9ORUFSRVNUX01JUE1BUF9MSU5FQVIgPSAweDI3MDJcbnZhciBHTF9MSU5FQVJfTUlQTUFQX0xJTkVBUiA9IDB4MjcwM1xuXG52YXIgR0xfR0VORVJBVEVfTUlQTUFQX0hJTlQgPSAweDgxOTJcbnZhciBHTF9ET05UX0NBUkUgPSAweDExMDBcbnZhciBHTF9GQVNURVNUID0gMHgxMTAxXG52YXIgR0xfTklDRVNUID0gMHgxMTAyXG5cbnZhciBHTF9URVhUVVJFX01BWF9BTklTT1RST1BZX0VYVCA9IDB4ODRGRVxuXG52YXIgR0xfVU5QQUNLX0FMSUdOTUVOVCA9IDB4MENGNVxudmFyIEdMX1VOUEFDS19GTElQX1lfV0VCR0wgPSAweDkyNDBcbnZhciBHTF9VTlBBQ0tfUFJFTVVMVElQTFlfQUxQSEFfV0VCR0wgPSAweDkyNDFcbnZhciBHTF9VTlBBQ0tfQ09MT1JTUEFDRV9DT05WRVJTSU9OX1dFQkdMID0gMHg5MjQzXG5cbnZhciBHTF9CUk9XU0VSX0RFRkFVTFRfV0VCR0wgPSAweDkyNDRcblxudmFyIEdMX1RFWFRVUkUwID0gMHg4NEMwXG5cbnZhciBNSVBNQVBfRklMVEVSUyA9IFtcbiAgR0xfTkVBUkVTVF9NSVBNQVBfTkVBUkVTVCxcbiAgR0xfTkVBUkVTVF9NSVBNQVBfTElORUFSLFxuICBHTF9MSU5FQVJfTUlQTUFQX05FQVJFU1QsXG4gIEdMX0xJTkVBUl9NSVBNQVBfTElORUFSXG5dXG5cbmZ1bmN0aW9uIGlzUG93MiAodikge1xuICByZXR1cm4gISh2ICYgKHYgLSAxKSkgJiYgKCEhdilcbn1cblxuZnVuY3Rpb24gaXNOdW1lcmljQXJyYXkgKGFycikge1xuICByZXR1cm4gKFxuICAgIEFycmF5LmlzQXJyYXkoYXJyKSAmJlxuICAgIChhcnIubGVuZ3RoID09PSAwIHx8XG4gICAgdHlwZW9mIGFyclswXSA9PT0gJ251bWJlcicpKVxufVxuXG5mdW5jdGlvbiBpc1JlY3RBcnJheSAoYXJyKSB7XG4gIGlmICghQXJyYXkuaXNBcnJheShhcnIpKSB7XG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cblxuICB2YXIgd2lkdGggPSBhcnIubGVuZ3RoXG4gIGlmICh3aWR0aCA9PT0gMCB8fCAhQXJyYXkuaXNBcnJheShhcnJbMF0pKSB7XG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cblxuICB2YXIgaGVpZ2h0ID0gYXJyWzBdLmxlbmd0aFxuICBmb3IgKHZhciBpID0gMTsgaSA8IHdpZHRoOyArK2kpIHtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkoYXJyW2ldKSB8fCBhcnJbaV0ubGVuZ3RoICE9PSBoZWlnaHQpIHtcbiAgICAgIHJldHVybiBmYWxzZVxuICAgIH1cbiAgfVxuICByZXR1cm4gdHJ1ZVxufVxuXG5mdW5jdGlvbiBjbGFzc1N0cmluZyAoeCkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHgpXG59XG5cbmZ1bmN0aW9uIGlzQ2FudmFzRWxlbWVudCAob2JqZWN0KSB7XG4gIHJldHVybiBjbGFzc1N0cmluZyhvYmplY3QpID09PSAnW29iamVjdCBIVE1MQ2FudmFzRWxlbWVudF0nXG59XG5cbmZ1bmN0aW9uIGlzQ29udGV4dDJEIChvYmplY3QpIHtcbiAgcmV0dXJuIGNsYXNzU3RyaW5nKG9iamVjdCkgPT09ICdbb2JqZWN0IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRF0nXG59XG5cbmZ1bmN0aW9uIGlzSW1hZ2VFbGVtZW50IChvYmplY3QpIHtcbiAgcmV0dXJuIGNsYXNzU3RyaW5nKG9iamVjdCkgPT09ICdbb2JqZWN0IEhUTUxJbWFnZUVsZW1lbnRdJ1xufVxuXG5mdW5jdGlvbiBpc1ZpZGVvRWxlbWVudCAob2JqZWN0KSB7XG4gIHJldHVybiBjbGFzc1N0cmluZyhvYmplY3QpID09PSAnW29iamVjdCBIVE1MVmlkZW9FbGVtZW50XSdcbn1cblxuZnVuY3Rpb24gaXNQZW5kaW5nWEhSIChvYmplY3QpIHtcbiAgcmV0dXJuIGNsYXNzU3RyaW5nKG9iamVjdCkgPT09ICdbb2JqZWN0IFhNTEh0dHBSZXF1ZXN0XSdcbn1cblxuZnVuY3Rpb24gaXNQaXhlbERhdGEgKG9iamVjdCkge1xuICByZXR1cm4gKFxuICAgIHR5cGVvZiBvYmplY3QgPT09ICdzdHJpbmcnIHx8XG4gICAgKCEhb2JqZWN0ICYmIChcbiAgICAgIGlzVHlwZWRBcnJheShvYmplY3QpIHx8XG4gICAgICBpc051bWVyaWNBcnJheShvYmplY3QpIHx8XG4gICAgICBpc05EQXJyYXlMaWtlKG9iamVjdCkgfHxcbiAgICAgIGlzQ2FudmFzRWxlbWVudChvYmplY3QpIHx8XG4gICAgICBpc0NvbnRleHQyRChvYmplY3QpIHx8XG4gICAgICBpc0ltYWdlRWxlbWVudChvYmplY3QpIHx8XG4gICAgICBpc1ZpZGVvRWxlbWVudChvYmplY3QpIHx8XG4gICAgICBpc1JlY3RBcnJheShvYmplY3QpKSkpXG59XG5cbi8vIFRyYW5zcG9zZSBhbiBhcnJheSBvZiBwaXhlbHNcbmZ1bmN0aW9uIHRyYW5zcG9zZVBpeGVscyAoZGF0YSwgbngsIG55LCBuYywgc3gsIHN5LCBzYywgb2ZmKSB7XG4gIHZhciByZXN1bHQgPSBuZXcgZGF0YS5jb25zdHJ1Y3RvcihueCAqIG55ICogbmMpXG4gIHZhciBwdHIgPSAwXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbnk7ICsraSkge1xuICAgIGZvciAodmFyIGogPSAwOyBqIDwgbng7ICsraikge1xuICAgICAgZm9yICh2YXIgayA9IDA7IGsgPCBuYzsgKytrKSB7XG4gICAgICAgIHJlc3VsdFtwdHIrK10gPSBkYXRhW3N5ICogaSArIHN4ICogaiArIHNjICogayArIG9mZl1cbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNyZWF0ZVRleHR1cmVTZXQgKGdsLCBleHRlbnNpb25zLCBsaW1pdHMsIHJlZ2xQb2xsLCBjb250ZXh0U3RhdGUpIHtcbiAgdmFyIG1pcG1hcEhpbnQgPSB7XG4gICAgXCJkb24ndCBjYXJlXCI6IEdMX0RPTlRfQ0FSRSxcbiAgICAnZG9udCBjYXJlJzogR0xfRE9OVF9DQVJFLFxuICAgICduaWNlJzogR0xfTklDRVNULFxuICAgICdmYXN0JzogR0xfRkFTVEVTVFxuICB9XG5cbiAgdmFyIHdyYXBNb2RlcyA9IHtcbiAgICAncmVwZWF0JzogR0xfUkVQRUFULFxuICAgICdjbGFtcCc6IEdMX0NMQU1QX1RPX0VER0UsXG4gICAgJ21pcnJvcic6IEdMX01JUlJPUkVEX1JFUEVBVFxuICB9XG5cbiAgdmFyIG1hZ0ZpbHRlcnMgPSB7XG4gICAgJ25lYXJlc3QnOiBHTF9ORUFSRVNULFxuICAgICdsaW5lYXInOiBHTF9MSU5FQVJcbiAgfVxuXG4gIHZhciBtaW5GaWx0ZXJzID0gZXh0ZW5kKHtcbiAgICAnbmVhcmVzdCBtaXBtYXAgbmVhcmVzdCc6IEdMX05FQVJFU1RfTUlQTUFQX05FQVJFU1QsXG4gICAgJ2xpbmVhciBtaXBtYXAgbmVhcmVzdCc6IEdMX0xJTkVBUl9NSVBNQVBfTkVBUkVTVCxcbiAgICAnbmVhcmVzdCBtaXBtYXAgbGluZWFyJzogR0xfTkVBUkVTVF9NSVBNQVBfTElORUFSLFxuICAgICdsaW5lYXIgbWlwbWFwIGxpbmVhcic6IEdMX0xJTkVBUl9NSVBNQVBfTElORUFSLFxuICAgICdtaXBtYXAnOiBHTF9MSU5FQVJfTUlQTUFQX0xJTkVBUlxuICB9LCBtYWdGaWx0ZXJzKVxuXG4gIHZhciBjb2xvclNwYWNlID0ge1xuICAgICdub25lJzogMCxcbiAgICAnYnJvd3Nlcic6IEdMX0JST1dTRVJfREVGQVVMVF9XRUJHTFxuICB9XG5cbiAgdmFyIHRleHR1cmVUeXBlcyA9IHtcbiAgICAndWludDgnOiBHTF9VTlNJR05FRF9CWVRFLFxuICAgICdyZ2JhNCc6IEdMX1VOU0lHTkVEX1NIT1JUXzRfNF80XzQsXG4gICAgJ3JnYjU2NSc6IEdMX1VOU0lHTkVEX1NIT1JUXzVfNl81LFxuICAgICdyZ2I1IGExJzogR0xfVU5TSUdORURfU0hPUlRfNV81XzVfMVxuICB9XG5cbiAgdmFyIHRleHR1cmVGb3JtYXRzID0ge1xuICAgICdhbHBoYSc6IEdMX0FMUEhBLFxuICAgICdsdW1pbmFuY2UnOiBHTF9MVU1JTkFOQ0UsXG4gICAgJ2x1bWluYW5jZSBhbHBoYSc6IEdMX0xVTUlOQU5DRV9BTFBIQSxcbiAgICAncmdiJzogR0xfUkdCLFxuICAgICdyZ2JhJzogR0xfUkdCQSxcbiAgICAncmdiYTQnOiBHTF9SR0JBNCxcbiAgICAncmdiNSBhMSc6IEdMX1JHQjVfQTEsXG4gICAgJ3JnYjU2NSc6IEdMX1JHQjU2NVxuICB9XG5cbiAgdmFyIGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cyA9IHt9XG5cbiAgaWYgKGV4dGVuc2lvbnMuZXh0X3NyZ2IpIHtcbiAgICB0ZXh0dXJlRm9ybWF0cy5zcmdiID0gR0xfU1JHQl9FWFRcbiAgICB0ZXh0dXJlRm9ybWF0cy5zcmdiYSA9IEdMX1NSR0JfQUxQSEFfRVhUXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9mbG9hdCkge1xuICAgIHRleHR1cmVUeXBlcy5mbG9hdCA9IEdMX0ZMT0FUXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9oYWxmX2Zsb2F0KSB7XG4gICAgdGV4dHVyZVR5cGVzWydoYWxmIGZsb2F0J10gPSBHTF9IQUxGX0ZMT0FUX09FU1xuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfZGVwdGhfdGV4dHVyZSkge1xuICAgIGV4dGVuZCh0ZXh0dXJlRm9ybWF0cywge1xuICAgICAgJ2RlcHRoJzogR0xfREVQVEhfQ09NUE9ORU5ULFxuICAgICAgJ2RlcHRoIHN0ZW5jaWwnOiBHTF9ERVBUSF9TVEVOQ0lMXG4gICAgfSlcblxuICAgIGV4dGVuZCh0ZXh0dXJlVHlwZXMsIHtcbiAgICAgICd1aW50MTYnOiBHTF9VTlNJR05FRF9TSE9SVCxcbiAgICAgICd1aW50MzInOiBHTF9VTlNJR05FRF9JTlQsXG4gICAgICAnZGVwdGggc3RlbmNpbCc6IEdMX1VOU0lHTkVEX0lOVF8yNF84X1dFQkdMXG4gICAgfSlcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9zM3RjKSB7XG4gICAgZXh0ZW5kKGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cywge1xuICAgICAgJ3JnYiBzM3RjIGR4dDEnOiBHTF9DT01QUkVTU0VEX1JHQl9TM1RDX0RYVDFfRVhULFxuICAgICAgJ3JnYmEgczN0YyBkeHQxJzogR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUMV9FWFQsXG4gICAgICAncmdiYSBzM3RjIGR4dDMnOiBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQzX0VYVCxcbiAgICAgICdyZ2JhIHMzdGMgZHh0NSc6IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDVfRVhUXG4gICAgfSlcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9hdGMpIHtcbiAgICBleHRlbmQoY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzLCB7XG4gICAgICAncmdiIGFyYyc6IEdMX0NPTVBSRVNTRURfUkdCX0FUQ19XRUJHTCxcbiAgICAgICdyZ2JhIGF0YyBleHBsaWNpdCBhbHBoYSc6IEdMX0NPTVBSRVNTRURfUkdCQV9BVENfRVhQTElDSVRfQUxQSEFfV0VCR0wsXG4gICAgICAncmdiYSBhdGMgaW50ZXJwb2xhdGVkIGFscGhhJzogR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19JTlRFUlBPTEFURURfQUxQSEFfV0VCR0xcbiAgICB9KVxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29tcHJlc3NlZF90ZXh0dXJlX3B2cnRjKSB7XG4gICAgZXh0ZW5kKGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cywge1xuICAgICAgJ3JnYiBwdnJ0YyA0YnBwdjEnOiBHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ180QlBQVjFfSU1HLFxuICAgICAgJ3JnYiBwdnJ0YyAyYnBwdjEnOiBHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ18yQlBQVjFfSU1HLFxuICAgICAgJ3JnYmEgcHZydGMgNGJwcHYxJzogR0xfQ09NUFJFU1NFRF9SR0JBX1BWUlRDXzRCUFBWMV9JTUcsXG4gICAgICAncmdiYSBwdnJ0YyAyYnBwdjEnOiBHTF9DT01QUkVTU0VEX1JHQkFfUFZSVENfMkJQUFYxX0lNR1xuICAgIH0pXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb21wcmVzc2VkX3RleHR1cmVfZXRjMSkge1xuICAgIGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0c1sncmdiIGV0YzEnXSA9IEdMX0NPTVBSRVNTRURfUkdCX0VUQzFfV0VCR0xcbiAgfVxuXG4gIC8vIENvcHkgb3ZlciBhbGwgdGV4dHVyZSBmb3JtYXRzXG4gIHZhciBzdXBwb3J0ZWRDb21wcmVzc2VkRm9ybWF0cyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKFxuICAgIGdsLmdldFBhcmFtZXRlcihHTF9DT01QUkVTU0VEX1RFWFRVUkVfRk9STUFUUykpXG4gIE9iamVjdC5rZXlzKGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cykuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgIHZhciBmb3JtYXQgPSBjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHNbbmFtZV1cbiAgICBpZiAoc3VwcG9ydGVkQ29tcHJlc3NlZEZvcm1hdHMuaW5kZXhPZihmb3JtYXQpID49IDApIHtcbiAgICAgIHRleHR1cmVGb3JtYXRzW25hbWVdID0gZm9ybWF0XG4gICAgfVxuICB9KVxuXG4gIHZhciBzdXBwb3J0ZWRGb3JtYXRzID0gT2JqZWN0LmtleXModGV4dHVyZUZvcm1hdHMpXG4gIGxpbWl0cy50ZXh0dXJlRm9ybWF0cyA9IHN1cHBvcnRlZEZvcm1hdHNcblxuICB2YXIgY29sb3JGb3JtYXRzID0gc3VwcG9ydGVkRm9ybWF0cy5yZWR1Y2UoZnVuY3Rpb24gKGNvbG9yLCBrZXkpIHtcbiAgICB2YXIgZ2xlbnVtID0gdGV4dHVyZUZvcm1hdHNba2V5XVxuICAgIGlmIChnbGVudW0gPT09IEdMX0xVTUlOQU5DRSB8fFxuICAgICAgICBnbGVudW0gPT09IEdMX0FMUEhBIHx8XG4gICAgICAgIGdsZW51bSA9PT0gR0xfTFVNSU5BTkNFIHx8XG4gICAgICAgIGdsZW51bSA9PT0gR0xfTFVNSU5BTkNFX0FMUEhBIHx8XG4gICAgICAgIGdsZW51bSA9PT0gR0xfREVQVEhfQ09NUE9ORU5UIHx8XG4gICAgICAgIGdsZW51bSA9PT0gR0xfREVQVEhfU1RFTkNJTCkge1xuICAgICAgY29sb3JbZ2xlbnVtXSA9IGdsZW51bVxuICAgIH0gZWxzZSBpZiAoZ2xlbnVtID09PSBHTF9SR0I1X0ExIHx8IGtleS5pbmRleE9mKCdyZ2JhJykgPj0gMCkge1xuICAgICAgY29sb3JbZ2xlbnVtXSA9IEdMX1JHQkFcbiAgICB9IGVsc2Uge1xuICAgICAgY29sb3JbZ2xlbnVtXSA9IEdMX1JHQlxuICAgIH1cbiAgICByZXR1cm4gY29sb3JcbiAgfSwge30pXG5cbiAgLy8gUGl4ZWwgc3RvcmFnZSBwYXJzaW5nXG4gIGZ1bmN0aW9uIFBpeGVsSW5mbyAodGFyZ2V0KSB7XG4gICAgLy8gdGV4IHRhcmdldFxuICAgIHRoaXMudGFyZ2V0ID0gdGFyZ2V0XG5cbiAgICAvLyBwaXhlbFN0b3JlaSBpbmZvXG4gICAgdGhpcy5mbGlwWSA9IGZhbHNlXG4gICAgdGhpcy5wcmVtdWx0aXBseUFscGhhID0gZmFsc2VcbiAgICB0aGlzLnVucGFja0FsaWdubWVudCA9IDFcbiAgICB0aGlzLmNvbG9yU3BhY2UgPSAwXG5cbiAgICAvLyBzaGFwZVxuICAgIHRoaXMud2lkdGggPSAwXG4gICAgdGhpcy5oZWlnaHQgPSAwXG4gICAgdGhpcy5jaGFubmVscyA9IDBcblxuICAgIC8vIGZvcm1hdCBhbmQgdHlwZVxuICAgIHRoaXMuZm9ybWF0ID0gMFxuICAgIHRoaXMuaW50ZXJuYWxmb3JtYXQgPSAwXG4gICAgdGhpcy50eXBlID0gMFxuICAgIHRoaXMuY29tcHJlc3NlZCA9IGZhbHNlXG5cbiAgICAvLyBtaXAgbGV2ZWxcbiAgICB0aGlzLm1pcGxldmVsID0gMFxuXG4gICAgLy8gbmRhcnJheS1saWtlIHBhcmFtZXRlcnNcbiAgICB0aGlzLnN0cmlkZVggPSAwXG4gICAgdGhpcy5zdHJpZGVZID0gMFxuICAgIHRoaXMuc3RyaWRlQyA9IDBcbiAgICB0aGlzLm9mZnNldCA9IDBcblxuICAgIC8vIGNvcHkgcGl4ZWxzIGluZm9cbiAgICB0aGlzLnggPSAwXG4gICAgdGhpcy55ID0gMFxuICAgIHRoaXMuY29weSA9IGZhbHNlXG5cbiAgICAvLyBkYXRhIHNvdXJjZXNcbiAgICB0aGlzLmRhdGEgPSBudWxsXG4gICAgdGhpcy5pbWFnZSA9IG51bGxcbiAgICB0aGlzLnZpZGVvID0gbnVsbFxuICAgIHRoaXMuY2FudmFzID0gbnVsbFxuICAgIHRoaXMueGhyID0gbnVsbFxuXG4gICAgLy8gQ09SU1xuICAgIHRoaXMuY3Jvc3NPcmlnaW4gPSBudWxsXG5cbiAgICAvLyBob3JyaWJsZSBzdGF0ZSBmbGFnc1xuICAgIHRoaXMubmVlZHNQb2xsID0gZmFsc2VcbiAgICB0aGlzLm5lZWRzTGlzdGVuZXJzID0gZmFsc2VcbiAgfVxuXG4gIGV4dGVuZChQaXhlbEluZm8ucHJvdG90eXBlLCB7XG4gICAgcGFyc2VGbGFnczogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucyAhPT0gJ29iamVjdCcgfHwgIW9wdGlvbnMpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG5cbiAgICAgIGlmICgncHJlbXVsdGlwbHlBbHBoYScgaW4gb3B0aW9ucykge1xuICAgICAgICBcbiAgICAgICAgdGhpcy5wcmVtdWx0aXBseUFscGhhID0gb3B0aW9ucy5wcmVtdWx0aXBseUFscGhhXG4gICAgICB9XG5cbiAgICAgIGlmICgnZmxpcFknIGluIG9wdGlvbnMpIHtcbiAgICAgICAgXG4gICAgICAgIHRoaXMuZmxpcFkgPSBvcHRpb25zLmZsaXBZXG4gICAgICB9XG5cbiAgICAgIGlmICgnYWxpZ25tZW50JyBpbiBvcHRpb25zKSB7XG4gICAgICAgIFxuICAgICAgICB0aGlzLnVucGFja0FsaWdubWVudCA9IG9wdGlvbnMuYWxpZ25tZW50XG4gICAgICB9XG5cbiAgICAgIGlmICgnY29sb3JTcGFjZScgaW4gb3B0aW9ucykge1xuICAgICAgICBcbiAgICAgICAgdGhpcy5jb2xvclNwYWNlID0gY29sb3JTcGFjZVtvcHRpb25zLmNvbG9yU3BhY2VdXG4gICAgICB9XG5cbiAgICAgIGlmICgnZm9ybWF0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBmb3JtYXQgPSBvcHRpb25zLmZvcm1hdFxuICAgICAgICBcbiAgICAgICAgdGhpcy5pbnRlcm5hbGZvcm1hdCA9IHRleHR1cmVGb3JtYXRzW2Zvcm1hdF1cbiAgICAgICAgaWYgKGZvcm1hdCBpbiB0ZXh0dXJlVHlwZXMpIHtcbiAgICAgICAgICB0aGlzLnR5cGUgPSB0ZXh0dXJlVHlwZXNbZm9ybWF0XVxuICAgICAgICB9XG4gICAgICAgIGlmIChmb3JtYXQgaW4gY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzKSB7XG4gICAgICAgICAgdGhpcy5jb21wcmVzc2VkID0gdHJ1ZVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmICgndHlwZScgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgdHlwZSA9IG9wdGlvbnMudHlwZVxuICAgICAgICBcbiAgICAgICAgdGhpcy50eXBlID0gdGV4dHVyZVR5cGVzW3R5cGVdXG4gICAgICB9XG5cbiAgICAgIHZhciB3ID0gdGhpcy53aWR0aFxuICAgICAgdmFyIGggPSB0aGlzLmhlaWdodFxuICAgICAgdmFyIGMgPSB0aGlzLmNoYW5uZWxzXG4gICAgICBpZiAoJ3NoYXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIFxuICAgICAgICB3ID0gb3B0aW9ucy5zaGFwZVswXVxuICAgICAgICBoID0gb3B0aW9ucy5zaGFwZVsxXVxuICAgICAgICBpZiAob3B0aW9ucy5zaGFwZS5sZW5ndGggPT09IDMpIHtcbiAgICAgICAgICBjID0gb3B0aW9ucy5zaGFwZVsyXVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoJ3JhZGl1cycgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHcgPSBoID0gb3B0aW9ucy5yYWRpdXNcbiAgICAgICAgfVxuICAgICAgICBpZiAoJ3dpZHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgdyA9IG9wdGlvbnMud2lkdGhcbiAgICAgICAgfVxuICAgICAgICBpZiAoJ2hlaWdodCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGggPSBvcHRpb25zLmhlaWdodFxuICAgICAgICB9XG4gICAgICAgIGlmICgnY2hhbm5lbHMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBjID0gb3B0aW9ucy5jaGFubmVsc1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICB0aGlzLndpZHRoID0gdyB8IDBcbiAgICAgIHRoaXMuaGVpZ2h0ID0gaCB8IDBcbiAgICAgIHRoaXMuY2hhbm5lbHMgPSBjIHwgMFxuXG4gICAgICBpZiAoJ3N0cmlkZScgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgc3RyaWRlID0gb3B0aW9ucy5zdHJpZGVcbiAgICAgICAgXG4gICAgICAgIHRoaXMuc3RyaWRlWCA9IHN0cmlkZVswXVxuICAgICAgICB0aGlzLnN0cmlkZVkgPSBzdHJpZGVbMV1cbiAgICAgICAgaWYgKHN0cmlkZS5sZW5ndGggPT09IDMpIHtcbiAgICAgICAgICB0aGlzLnN0cmlkZUMgPSBzdHJpZGVbMl1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLnN0cmlkZUMgPSAxXG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5uZWVkc1RyYW5zcG9zZSA9IHRydWVcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuc3RyaWRlQyA9IDFcbiAgICAgICAgdGhpcy5zdHJpZGVYID0gdGhpcy5zdHJpZGVDICogY1xuICAgICAgICB0aGlzLnN0cmlkZVkgPSB0aGlzLnN0cmlkZVggKiB3XG4gICAgICB9XG5cbiAgICAgIGlmICgnb2Zmc2V0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHRoaXMub2Zmc2V0ID0gb3B0aW9ucy5vZmZzZXQgfCAwXG4gICAgICAgIHRoaXMubmVlZHNUcmFuc3Bvc2UgPSB0cnVlXG4gICAgICB9XG5cbiAgICAgIGlmICgnY3Jvc3NPcmlnaW4nIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdGhpcy5jcm9zc09yaWdpbiA9IG9wdGlvbnMuY3Jvc3NPcmlnaW5cbiAgICAgIH1cbiAgICB9LFxuICAgIHBhcnNlOiBmdW5jdGlvbiAob3B0aW9ucywgbWlwbGV2ZWwpIHtcbiAgICAgIHRoaXMubWlwbGV2ZWwgPSBtaXBsZXZlbFxuICAgICAgdGhpcy53aWR0aCA9IHRoaXMud2lkdGggPj4gbWlwbGV2ZWxcbiAgICAgIHRoaXMuaGVpZ2h0ID0gdGhpcy5oZWlnaHQgPj4gbWlwbGV2ZWxcblxuICAgICAgdmFyIGRhdGEgPSBvcHRpb25zXG4gICAgICBzd2l0Y2ggKHR5cGVvZiBvcHRpb25zKSB7XG4gICAgICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgICAgICBpZiAoIW9wdGlvbnMpIHtcbiAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgIH1cbiAgICAgICAgICB0aGlzLnBhcnNlRmxhZ3Mob3B0aW9ucylcbiAgICAgICAgICBpZiAoaXNQaXhlbERhdGEob3B0aW9ucy5kYXRhKSkge1xuICAgICAgICAgICAgZGF0YSA9IG9wdGlvbnMuZGF0YVxuICAgICAgICAgIH1cbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlICd1bmRlZmluZWQnOlxuICAgICAgICAgIHJldHVyblxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIFxuICAgICAgfVxuXG4gICAgICBpZiAodHlwZW9mIGRhdGEgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGRhdGEgPSBsb2FkVGV4dHVyZShkYXRhLCB0aGlzLmNyb3NzT3JpZ2luKVxuICAgICAgfVxuXG4gICAgICB2YXIgYXJyYXkgPSBudWxsXG4gICAgICB2YXIgbmVlZHNDb252ZXJ0ID0gZmFsc2VcblxuICAgICAgaWYgKHRoaXMuY29tcHJlc3NlZCkge1xuICAgICAgICBcbiAgICAgIH1cblxuICAgICAgaWYgKGRhdGEgPT09IG51bGwpIHtcbiAgICAgICAgLy8gVE9ET1xuICAgICAgfSBlbHNlIGlmIChpc1R5cGVkQXJyYXkoZGF0YSkpIHtcbiAgICAgICAgdGhpcy5kYXRhID0gZGF0YVxuICAgICAgfSBlbHNlIGlmIChpc051bWVyaWNBcnJheShkYXRhKSkge1xuICAgICAgICBhcnJheSA9IGRhdGFcbiAgICAgICAgbmVlZHNDb252ZXJ0ID0gdHJ1ZVxuICAgICAgfSBlbHNlIGlmIChpc05EQXJyYXlMaWtlKGRhdGEpKSB7XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KGRhdGEuZGF0YSkpIHtcbiAgICAgICAgICBhcnJheSA9IGRhdGEuZGF0YVxuICAgICAgICAgIG5lZWRzQ29udmVydCA9IHRydWVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLmRhdGEgPSBkYXRhLmRhdGFcbiAgICAgICAgfVxuICAgICAgICB2YXIgc2hhcGUgPSBkYXRhLnNoYXBlXG4gICAgICAgIHRoaXMud2lkdGggPSBzaGFwZVswXVxuICAgICAgICB0aGlzLmhlaWdodCA9IHNoYXBlWzFdXG4gICAgICAgIGlmIChzaGFwZS5sZW5ndGggPT09IDMpIHtcbiAgICAgICAgICB0aGlzLmNoYW5uZWxzID0gc2hhcGVbMl1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLmNoYW5uZWxzID0gMVxuICAgICAgICB9XG4gICAgICAgIHZhciBzdHJpZGUgPSBkYXRhLnN0cmlkZVxuICAgICAgICB0aGlzLnN0cmlkZVggPSBkYXRhLnN0cmlkZVswXVxuICAgICAgICB0aGlzLnN0cmlkZVkgPSBkYXRhLnN0cmlkZVsxXVxuICAgICAgICBpZiAoc3RyaWRlLmxlbmd0aCA9PT0gMykge1xuICAgICAgICAgIHRoaXMuc3RyaWRlQyA9IGRhdGEuc3RyaWRlWzJdXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5zdHJpZGVDID0gMVxuICAgICAgICB9XG4gICAgICAgIHRoaXMub2Zmc2V0ID0gZGF0YS5vZmZzZXRcbiAgICAgICAgdGhpcy5uZWVkc1RyYW5zcG9zZSA9IHRydWVcbiAgICAgIH0gZWxzZSBpZiAoaXNDYW52YXNFbGVtZW50KGRhdGEpIHx8IGlzQ29udGV4dDJEKGRhdGEpKSB7XG4gICAgICAgIGlmIChpc0NhbnZhc0VsZW1lbnQoZGF0YSkpIHtcbiAgICAgICAgICB0aGlzLmNhbnZhcyA9IGRhdGFcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLmNhbnZhcyA9IGRhdGEuY2FudmFzXG4gICAgICAgIH1cbiAgICAgICAgdGhpcy53aWR0aCA9IHRoaXMuY2FudmFzLndpZHRoXG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gdGhpcy5jYW52YXMuaGVpZ2h0XG4gICAgICAgIHRoaXMuc2V0RGVmYXVsdEZvcm1hdCgpXG4gICAgICB9IGVsc2UgaWYgKGlzSW1hZ2VFbGVtZW50KGRhdGEpKSB7XG4gICAgICAgIHRoaXMuaW1hZ2UgPSBkYXRhXG4gICAgICAgIGlmICghZGF0YS5jb21wbGV0ZSkge1xuICAgICAgICAgIHRoaXMud2lkdGggPSB0aGlzLndpZHRoIHx8IGRhdGEubmF0dXJhbFdpZHRoXG4gICAgICAgICAgdGhpcy5oZWlnaHQgPSB0aGlzLmhlaWdodCB8fCBkYXRhLm5hdHVyYWxIZWlnaHRcbiAgICAgICAgICB0aGlzLm5lZWRzTGlzdGVuZXJzID0gdHJ1ZVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMud2lkdGggPSBkYXRhLm5hdHVyYWxXaWR0aFxuICAgICAgICAgIHRoaXMuaGVpZ2h0ID0gZGF0YS5uYXR1cmFsSGVpZ2h0XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zZXREZWZhdWx0Rm9ybWF0KClcbiAgICAgIH0gZWxzZSBpZiAoaXNWaWRlb0VsZW1lbnQoZGF0YSkpIHtcbiAgICAgICAgdGhpcy52aWRlbyA9IGRhdGFcbiAgICAgICAgaWYgKGRhdGEucmVhZHlTdGF0ZSA+IDEpIHtcbiAgICAgICAgICB0aGlzLndpZHRoID0gZGF0YS53aWR0aFxuICAgICAgICAgIHRoaXMuaGVpZ2h0ID0gZGF0YS5oZWlnaHRcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLndpZHRoID0gdGhpcy53aWR0aCB8fCBkYXRhLndpZHRoXG4gICAgICAgICAgdGhpcy5oZWlnaHQgPSB0aGlzLmhlaWdodCB8fCBkYXRhLmhlaWdodFxuICAgICAgICAgIHRoaXMubmVlZHNMaXN0ZW5lcnMgPSB0cnVlXG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5uZWVkc1BvbGwgPSB0cnVlXG4gICAgICAgIHRoaXMuc2V0RGVmYXVsdEZvcm1hdCgpXG4gICAgICB9IGVsc2UgaWYgKGlzUGVuZGluZ1hIUihkYXRhKSkge1xuICAgICAgICB0aGlzLnhociA9IGRhdGFcbiAgICAgICAgdGhpcy5uZWVkc0xpc3RlbmVycyA9IHRydWVcbiAgICAgIH0gZWxzZSBpZiAoaXNSZWN0QXJyYXkoZGF0YSkpIHtcbiAgICAgICAgdmFyIHcgPSBkYXRhWzBdLmxlbmd0aFxuICAgICAgICB2YXIgaCA9IGRhdGEubGVuZ3RoXG4gICAgICAgIHZhciBjID0gMVxuICAgICAgICB2YXIgaSwgaiwgaywgcFxuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShkYXRhWzBdWzBdKSkge1xuICAgICAgICAgIGMgPSBkYXRhWzBdWzBdLmxlbmd0aFxuICAgICAgICAgIFxuICAgICAgICAgIGFycmF5ID0gQXJyYXkodyAqIGggKiBjKVxuICAgICAgICAgIHAgPSAwXG4gICAgICAgICAgZm9yIChqID0gMDsgaiA8IGg7ICsraikge1xuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IHc7ICsraSkge1xuICAgICAgICAgICAgICBmb3IgKGsgPSAwOyBrIDwgYzsgKytrKSB7XG4gICAgICAgICAgICAgICAgYXJyYXlbcCsrXSA9IGRhdGFbal1baV1ba11cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBhcnJheSA9IEFycmF5KHcgKiBoKVxuICAgICAgICAgIHAgPSAwXG4gICAgICAgICAgZm9yIChqID0gMDsgaiA8IGg7ICsraikge1xuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IHc7ICsraSkge1xuICAgICAgICAgICAgICBhcnJheVtwKytdID0gZGF0YVtqXVtpXVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLndpZHRoID0gd1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhcbiAgICAgICAgdGhpcy5jaGFubmVscyA9IGNcbiAgICAgICAgbmVlZHNDb252ZXJ0ID0gdHJ1ZVxuICAgICAgfSBlbHNlIGlmIChvcHRpb25zLmNvcHkpIHtcbiAgICAgICAgdGhpcy5jb3B5ID0gdHJ1ZVxuICAgICAgICB0aGlzLnggPSB0aGlzLnggfCAwXG4gICAgICAgIHRoaXMueSA9IHRoaXMueSB8IDBcbiAgICAgICAgdGhpcy53aWR0aCA9ICh0aGlzLndpZHRoIHx8IGNvbnRleHRTdGF0ZS52aWV3cG9ydFdpZHRoKSB8IDBcbiAgICAgICAgdGhpcy5oZWlnaHQgPSAodGhpcy5oZWlnaHQgfHwgY29udGV4dFN0YXRlLnZpZXdwb3J0SGVpZ2h0KSB8IDBcbiAgICAgICAgdGhpcy5zZXREZWZhdWx0Rm9ybWF0KClcbiAgICAgIH1cblxuICAgICAgLy8gRml4IHVwIG1pc3NpbmcgdHlwZSBpbmZvIGZvciB0eXBlZCBhcnJheXNcbiAgICAgIGlmICghdGhpcy50eXBlICYmIHRoaXMuZGF0YSkge1xuICAgICAgICBpZiAodGhpcy5mb3JtYXQgPT09IEdMX0RFUFRIX0NPTVBPTkVOVCkge1xuICAgICAgICAgIGlmICh0aGlzLmRhdGEgaW5zdGFuY2VvZiBVaW50MTZBcnJheSkge1xuICAgICAgICAgICAgdGhpcy50eXBlID0gR0xfVU5TSUdORURfU0hPUlRcbiAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMuZGF0YSBpbnN0YW5jZW9mIFVpbnQzMkFycmF5KSB7XG4gICAgICAgICAgICB0aGlzLnR5cGUgPSBHTF9VTlNJR05FRF9JTlRcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5kYXRhIGluc3RhbmNlb2YgRmxvYXQzMkFycmF5KSB7XG4gICAgICAgICAgdGhpcy50eXBlID0gR0xfRkxPQVRcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBJbmZlciBkZWZhdWx0IGZvcm1hdFxuICAgICAgaWYgKCF0aGlzLmludGVybmFsZm9ybWF0KSB7XG4gICAgICAgIHZhciBjaGFubmVscyA9IHRoaXMuY2hhbm5lbHMgPSB0aGlzLmNoYW5uZWxzIHx8IDRcbiAgICAgICAgdGhpcy5pbnRlcm5hbGZvcm1hdCA9IFtcbiAgICAgICAgICBHTF9MVU1JTkFOQ0UsXG4gICAgICAgICAgR0xfTFVNSU5BTkNFX0FMUEhBLFxuICAgICAgICAgIEdMX1JHQixcbiAgICAgICAgICBHTF9SR0JBXVtjaGFubmVscyAtIDFdXG4gICAgICAgIFxuICAgICAgfVxuXG4gICAgICB2YXIgZm9ybWF0ID0gdGhpcy5pbnRlcm5hbGZvcm1hdFxuICAgICAgaWYgKGZvcm1hdCA9PT0gR0xfREVQVEhfQ09NUE9ORU5UIHx8IGZvcm1hdCA9PT0gR0xfREVQVEhfU1RFTkNJTCkge1xuICAgICAgICBcbiAgICAgICAgaWYgKGZvcm1hdCA9PT0gR0xfREVQVEhfQ09NUE9ORU5UKSB7XG4gICAgICAgICAgXG4gICAgICAgIH1cbiAgICAgICAgaWYgKGZvcm1hdCA9PT0gR0xfREVQVEhfU1RFTkNJTCkge1xuICAgICAgICAgIFxuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgfVxuXG4gICAgICAvLyBDb21wdXRlIGNvbG9yIGZvcm1hdCBhbmQgbnVtYmVyIG9mIGNoYW5uZWxzXG4gICAgICB2YXIgY29sb3JGb3JtYXQgPSB0aGlzLmZvcm1hdCA9IGNvbG9yRm9ybWF0c1tmb3JtYXRdXG4gICAgICBpZiAoIXRoaXMuY2hhbm5lbHMpIHtcbiAgICAgICAgc3dpdGNoIChjb2xvckZvcm1hdCkge1xuICAgICAgICAgIGNhc2UgR0xfTFVNSU5BTkNFOlxuICAgICAgICAgIGNhc2UgR0xfQUxQSEE6XG4gICAgICAgICAgY2FzZSBHTF9ERVBUSF9DT01QT05FTlQ6XG4gICAgICAgICAgICB0aGlzLmNoYW5uZWxzID0gMVxuICAgICAgICAgICAgYnJlYWtcblxuICAgICAgICAgIGNhc2UgR0xfREVQVEhfU1RFTkNJTDpcbiAgICAgICAgICBjYXNlIEdMX0xVTUlOQU5DRV9BTFBIQTpcbiAgICAgICAgICAgIHRoaXMuY2hhbm5lbHMgPSAyXG4gICAgICAgICAgICBicmVha1xuXG4gICAgICAgICAgY2FzZSBHTF9SR0I6XG4gICAgICAgICAgICB0aGlzLmNoYW5uZWxzID0gM1xuICAgICAgICAgICAgYnJlYWtcblxuICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICB0aGlzLmNoYW5uZWxzID0gNFxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIENoZWNrIHRoYXQgdGV4dHVyZSB0eXBlIGlzIHN1cHBvcnRlZFxuICAgICAgdmFyIHR5cGUgPSB0aGlzLnR5cGVcbiAgICAgIGlmICh0eXBlID09PSBHTF9GTE9BVCkge1xuICAgICAgICBcbiAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gR0xfSEFMRl9GTE9BVF9PRVMpIHtcbiAgICAgICAgXG4gICAgICB9IGVsc2UgaWYgKCF0eXBlKSB7XG4gICAgICAgIGlmIChmb3JtYXQgPT09IEdMX0RFUFRIX0NPTVBPTkVOVCkge1xuICAgICAgICAgIHR5cGUgPSBHTF9VTlNJR05FRF9JTlRcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0eXBlID0gR0xfVU5TSUdORURfQllURVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICB0aGlzLnR5cGUgPSB0eXBlXG5cbiAgICAgIC8vIGFwcGx5IGNvbnZlcnNpb25cbiAgICAgIGlmIChuZWVkc0NvbnZlcnQpIHtcbiAgICAgICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9CWVRFOlxuICAgICAgICAgICAgdGhpcy5kYXRhID0gbmV3IFVpbnQ4QXJyYXkoYXJyYXkpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlQ6XG4gICAgICAgICAgICB0aGlzLmRhdGEgPSBuZXcgVWludDE2QXJyYXkoYXJyYXkpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfSU5UOlxuICAgICAgICAgICAgdGhpcy5kYXRhID0gbmV3IFVpbnQzMkFycmF5KGFycmF5KVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlIEdMX0ZMT0FUOlxuICAgICAgICAgICAgdGhpcy5kYXRhID0gbmV3IEZsb2F0MzJBcnJheShhcnJheSlcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSBHTF9IQUxGX0ZMT0FUX09FUzpcbiAgICAgICAgICAgIHRoaXMuZGF0YSA9IGNvbnZlcnRUb0hhbGZGbG9hdChhcnJheSlcbiAgICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUXzVfNl81OlxuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlRfNV81XzVfMTpcbiAgICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUXzRfNF80XzQ6XG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9JTlRfMjRfOF9XRUJHTDpcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgYnJlYWtcblxuICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICBcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5kYXRhKSB7XG4gICAgICAgIC8vIGFwcGx5IHRyYW5zcG9zZVxuICAgICAgICBpZiAodGhpcy5uZWVkc1RyYW5zcG9zZSkge1xuICAgICAgICAgIHRoaXMuZGF0YSA9IHRyYW5zcG9zZVBpeGVscyhcbiAgICAgICAgICAgIHRoaXMuZGF0YSxcbiAgICAgICAgICAgIHRoaXMud2lkdGgsXG4gICAgICAgICAgICB0aGlzLmhlaWdodCxcbiAgICAgICAgICAgIHRoaXMuY2hhbm5lbHMsXG4gICAgICAgICAgICB0aGlzLnN0cmlkZVgsXG4gICAgICAgICAgICB0aGlzLnN0cmlkZVksXG4gICAgICAgICAgICB0aGlzLnN0cmlkZUMsXG4gICAgICAgICAgICB0aGlzLm9mZnNldClcbiAgICAgICAgfVxuICAgICAgICAvLyBjaGVjayBkYXRhIHR5cGVcbiAgICAgICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9CWVRFOlxuICAgICAgICAgICAgXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlRfNV82XzU6XG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9TSE9SVF81XzVfNV8xOlxuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlRfNF80XzRfNDpcbiAgICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUOlxuICAgICAgICAgIGNhc2UgR0xfSEFMRl9GTE9BVF9PRVM6XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9JTlQ6XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgICBjYXNlIEdMX0ZMT0FUOlxuICAgICAgICAgICAgXG4gICAgICAgICAgICBicmVha1xuXG4gICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIFxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHRoaXMubmVlZHNUcmFuc3Bvc2UgPSBmYWxzZVxuICAgIH0sXG5cbiAgICBzZXREZWZhdWx0Rm9ybWF0OiBmdW5jdGlvbiAoKSB7XG4gICAgICB0aGlzLmZvcm1hdCA9IHRoaXMuaW50ZXJuYWxmb3JtYXQgPSBHTF9SR0JBXG4gICAgICB0aGlzLnR5cGUgPSBHTF9VTlNJR05FRF9CWVRFXG4gICAgICB0aGlzLmNoYW5uZWxzID0gNFxuICAgICAgdGhpcy5jb21wcmVzc2VkID0gZmFsc2VcbiAgICB9LFxuXG4gICAgdXBsb2FkOiBmdW5jdGlvbiAocGFyYW1zKSB7XG4gICAgICBnbC5waXhlbFN0b3JlaShHTF9VTlBBQ0tfRkxJUF9ZX1dFQkdMLCB0aGlzLmZsaXBZKVxuICAgICAgZ2wucGl4ZWxTdG9yZWkoR0xfVU5QQUNLX1BSRU1VTFRJUExZX0FMUEhBX1dFQkdMLCB0aGlzLnByZW11bHRpcGx5QWxwaGEpXG4gICAgICBnbC5waXhlbFN0b3JlaShHTF9VTlBBQ0tfQ09MT1JTUEFDRV9DT05WRVJTSU9OX1dFQkdMLCB0aGlzLmNvbG9yU3BhY2UpXG4gICAgICBnbC5waXhlbFN0b3JlaShHTF9VTlBBQ0tfQUxJR05NRU5ULCB0aGlzLnVucGFja0FsaWdubWVudClcblxuICAgICAgdmFyIHRhcmdldCA9IHRoaXMudGFyZ2V0XG4gICAgICB2YXIgbWlwbGV2ZWwgPSB0aGlzLm1pcGxldmVsXG4gICAgICB2YXIgaW1hZ2UgPSB0aGlzLmltYWdlXG4gICAgICB2YXIgY2FudmFzID0gdGhpcy5jYW52YXNcbiAgICAgIHZhciB2aWRlbyA9IHRoaXMudmlkZW9cbiAgICAgIHZhciBkYXRhID0gdGhpcy5kYXRhXG4gICAgICB2YXIgaW50ZXJuYWxmb3JtYXQgPSB0aGlzLmludGVybmFsZm9ybWF0XG4gICAgICB2YXIgZm9ybWF0ID0gdGhpcy5mb3JtYXRcbiAgICAgIHZhciB0eXBlID0gdGhpcy50eXBlXG4gICAgICB2YXIgd2lkdGggPSB0aGlzLndpZHRoIHx8IE1hdGgubWF4KDEsIHBhcmFtcy53aWR0aCA+PiBtaXBsZXZlbClcbiAgICAgIHZhciBoZWlnaHQgPSB0aGlzLmhlaWdodCB8fCBNYXRoLm1heCgxLCBwYXJhbXMuaGVpZ2h0ID4+IG1pcGxldmVsKVxuICAgICAgaWYgKHZpZGVvICYmIHZpZGVvLnJlYWR5U3RhdGUgPiAyKSB7XG4gICAgICAgIGdsLnRleEltYWdlMkQodGFyZ2V0LCBtaXBsZXZlbCwgZm9ybWF0LCBmb3JtYXQsIHR5cGUsIHZpZGVvKVxuICAgICAgfSBlbHNlIGlmIChpbWFnZSAmJiBpbWFnZS5jb21wbGV0ZSkge1xuICAgICAgICBnbC50ZXhJbWFnZTJEKHRhcmdldCwgbWlwbGV2ZWwsIGZvcm1hdCwgZm9ybWF0LCB0eXBlLCBpbWFnZSlcbiAgICAgIH0gZWxzZSBpZiAoY2FudmFzKSB7XG4gICAgICAgIGdsLnRleEltYWdlMkQodGFyZ2V0LCBtaXBsZXZlbCwgZm9ybWF0LCBmb3JtYXQsIHR5cGUsIGNhbnZhcylcbiAgICAgIH0gZWxzZSBpZiAodGhpcy5jb21wcmVzc2VkKSB7XG4gICAgICAgIGdsLmNvbXByZXNzZWRUZXhJbWFnZTJEKHRhcmdldCwgbWlwbGV2ZWwsIGludGVybmFsZm9ybWF0LCB3aWR0aCwgaGVpZ2h0LCAwLCBkYXRhKVxuICAgICAgfSBlbHNlIGlmICh0aGlzLmNvcHkpIHtcbiAgICAgICAgcmVnbFBvbGwoKVxuICAgICAgICBnbC5jb3B5VGV4SW1hZ2UyRCh0YXJnZXQsIG1pcGxldmVsLCBmb3JtYXQsIHRoaXMueCwgdGhpcy55LCB3aWR0aCwgaGVpZ2h0LCAwKVxuICAgICAgfSBlbHNlIGlmIChkYXRhKSB7XG4gICAgICAgIGdsLnRleEltYWdlMkQodGFyZ2V0LCBtaXBsZXZlbCwgZm9ybWF0LCB3aWR0aCwgaGVpZ2h0LCAwLCBmb3JtYXQsIHR5cGUsIGRhdGEpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBnbC50ZXhJbWFnZTJEKHRhcmdldCwgbWlwbGV2ZWwsIGZvcm1hdCwgd2lkdGggfHwgMSwgaGVpZ2h0IHx8IDEsIDAsIGZvcm1hdCwgdHlwZSwgbnVsbClcbiAgICAgIH1cbiAgICB9XG4gIH0pXG5cbiAgZnVuY3Rpb24gVGV4UGFyYW1zICh0YXJnZXQpIHtcbiAgICB0aGlzLnRhcmdldCA9IHRhcmdldFxuXG4gICAgLy8gRGVmYXVsdCBpbWFnZSBzaGFwZSBpbmZvXG4gICAgdGhpcy53aWR0aCA9IDBcbiAgICB0aGlzLmhlaWdodCA9IDBcbiAgICB0aGlzLmZvcm1hdCA9IDBcbiAgICB0aGlzLmludGVybmFsZm9ybWF0ID0gMFxuICAgIHRoaXMudHlwZSA9IDBcblxuICAgIC8vIHdyYXAgbW9kZVxuICAgIHRoaXMud3JhcFMgPSBHTF9DTEFNUF9UT19FREdFXG4gICAgdGhpcy53cmFwVCA9IEdMX0NMQU1QX1RPX0VER0VcblxuICAgIC8vIGZpbHRlcmluZ1xuICAgIHRoaXMubWluRmlsdGVyID0gMFxuICAgIHRoaXMubWFnRmlsdGVyID0gR0xfTkVBUkVTVFxuICAgIHRoaXMuYW5pc290cm9waWMgPSAxXG5cbiAgICAvLyBtaXBtYXBzXG4gICAgdGhpcy5nZW5NaXBtYXBzID0gZmFsc2VcbiAgICB0aGlzLm1pcG1hcEhpbnQgPSBHTF9ET05UX0NBUkVcbiAgfVxuXG4gIGV4dGVuZChUZXhQYXJhbXMucHJvdG90eXBlLCB7XG4gICAgcGFyc2U6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbnMgIT09ICdvYmplY3QnIHx8ICFvcHRpb25zKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuXG4gICAgICBpZiAoJ21pbicgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgbWluRmlsdGVyID0gb3B0aW9ucy5taW5cbiAgICAgICAgXG4gICAgICAgIHRoaXMubWluRmlsdGVyID0gbWluRmlsdGVyc1ttaW5GaWx0ZXJdXG4gICAgICB9XG5cbiAgICAgIGlmICgnbWFnJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBtYWdGaWx0ZXIgPSBvcHRpb25zLm1hZ1xuICAgICAgICBcbiAgICAgICAgdGhpcy5tYWdGaWx0ZXIgPSBtYWdGaWx0ZXJzW21hZ0ZpbHRlcl1cbiAgICAgIH1cblxuICAgICAgdmFyIHdyYXBTID0gdGhpcy53cmFwU1xuICAgICAgdmFyIHdyYXBUID0gdGhpcy53cmFwVFxuICAgICAgaWYgKCd3cmFwJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciB3cmFwID0gb3B0aW9ucy53cmFwXG4gICAgICAgIGlmICh0eXBlb2Ygd3JhcCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICBcbiAgICAgICAgICB3cmFwUyA9IHdyYXBUID0gd3JhcE1vZGVzW3dyYXBdXG4gICAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheSh3cmFwKSkge1xuICAgICAgICAgIFxuICAgICAgICAgIFxuICAgICAgICAgIHdyYXBTID0gd3JhcE1vZGVzW3dyYXBbMF1dXG4gICAgICAgICAgd3JhcFQgPSB3cmFwTW9kZXNbd3JhcFsxXV1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKCd3cmFwUycgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHZhciBvcHRXcmFwUyA9IG9wdGlvbnMud3JhcFNcbiAgICAgICAgICBcbiAgICAgICAgICB3cmFwUyA9IHdyYXBNb2Rlc1tvcHRXcmFwU11cbiAgICAgICAgfVxuICAgICAgICBpZiAoJ3dyYXBUJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgdmFyIG9wdFdyYXBUID0gb3B0aW9ucy53cmFwVFxuICAgICAgICAgIFxuICAgICAgICAgIHdyYXBUID0gd3JhcE1vZGVzW29wdFdyYXBUXVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICB0aGlzLndyYXBTID0gd3JhcFNcbiAgICAgIHRoaXMud3JhcFQgPSB3cmFwVFxuXG4gICAgICBpZiAoJ2FuaXNvdHJvcGljJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBhbmlzb3Ryb3BpYyA9IG9wdGlvbnMuYW5pc290cm9waWNcbiAgICAgICAgXG4gICAgICAgIHRoaXMuYW5pc290cm9waWMgPSBvcHRpb25zLmFuaXNvdHJvcGljXG4gICAgICB9XG5cbiAgICAgIGlmICgnbWlwbWFwJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBtaXBtYXAgPSBvcHRpb25zLm1pcG1hcFxuICAgICAgICBzd2l0Y2ggKHR5cGVvZiBtaXBtYXApIHtcbiAgICAgICAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgICAgICAgXG4gICAgICAgICAgICB0aGlzLm1pcG1hcEhpbnQgPSBtaXBtYXBIaW50W21pcG1hcF1cbiAgICAgICAgICAgIHRoaXMuZ2VuTWlwbWFwcyA9IHRydWVcbiAgICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgICBjYXNlICdib29sZWFuJzpcbiAgICAgICAgICAgIHRoaXMuZ2VuTWlwbWFwcyA9ICEhbWlwbWFwXG4gICAgICAgICAgICBicmVha1xuXG4gICAgICAgICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuXG4gICAgdXBsb2FkOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgdGFyZ2V0ID0gdGhpcy50YXJnZXRcbiAgICAgIGdsLnRleFBhcmFtZXRlcmkodGFyZ2V0LCBHTF9URVhUVVJFX01JTl9GSUxURVIsIHRoaXMubWluRmlsdGVyKVxuICAgICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfTUFHX0ZJTFRFUiwgdGhpcy5tYWdGaWx0ZXIpXG4gICAgICBnbC50ZXhQYXJhbWV0ZXJpKHRhcmdldCwgR0xfVEVYVFVSRV9XUkFQX1MsIHRoaXMud3JhcFMpXG4gICAgICBnbC50ZXhQYXJhbWV0ZXJpKHRhcmdldCwgR0xfVEVYVFVSRV9XUkFQX1QsIHRoaXMud3JhcFQpXG4gICAgICBpZiAoZXh0ZW5zaW9ucy5leHRfdGV4dHVyZV9maWx0ZXJfYW5pc290cm9waWMpIHtcbiAgICAgICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfTUFYX0FOSVNPVFJPUFlfRVhULCB0aGlzLmFuaXNvdHJvcGljKVxuICAgICAgfVxuICAgICAgaWYgKHRoaXMuZ2VuTWlwbWFwcykge1xuICAgICAgICBnbC5oaW50KEdMX0dFTkVSQVRFX01JUE1BUF9ISU5ULCB0aGlzLm1pcG1hcEhpbnQpXG4gICAgICAgIGdsLmdlbmVyYXRlTWlwbWFwKHRhcmdldClcbiAgICAgIH1cbiAgICB9XG4gIH0pXG5cbiAgLy8gRmluYWwgcGFzcyB0byBtZXJnZSBwYXJhbXMgYW5kIHBpeGVsIGRhdGFcbiAgZnVuY3Rpb24gY2hlY2tUZXh0dXJlQ29tcGxldGUgKHBhcmFtcywgcGl4ZWxzKSB7XG4gICAgdmFyIGksIHBpeG1hcFxuXG4gICAgdmFyIHR5cGUgPSAwXG4gICAgdmFyIGZvcm1hdCA9IDBcbiAgICB2YXIgaW50ZXJuYWxmb3JtYXQgPSAwXG4gICAgdmFyIHdpZHRoID0gMFxuICAgIHZhciBoZWlnaHQgPSAwXG4gICAgdmFyIGNoYW5uZWxzID0gMFxuICAgIHZhciBjb21wcmVzc2VkID0gZmFsc2VcbiAgICB2YXIgbmVlZHNQb2xsID0gZmFsc2VcbiAgICB2YXIgbmVlZHNMaXN0ZW5lcnMgPSBmYWxzZVxuICAgIHZhciBtaXBNYXNrMkQgPSAwXG4gICAgdmFyIG1pcE1hc2tDdWJlID0gWzAsIDAsIDAsIDAsIDAsIDBdXG4gICAgdmFyIGN1YmVNYXNrID0gMFxuICAgIHZhciBoYXNNaXAgPSBmYWxzZVxuICAgIGZvciAoaSA9IDA7IGkgPCBwaXhlbHMubGVuZ3RoOyArK2kpIHtcbiAgICAgIHBpeG1hcCA9IHBpeGVsc1tpXVxuICAgICAgd2lkdGggPSB3aWR0aCB8fCAocGl4bWFwLndpZHRoIDw8IHBpeG1hcC5taXBsZXZlbClcbiAgICAgIGhlaWdodCA9IGhlaWdodCB8fCAocGl4bWFwLmhlaWdodCA8PCBwaXhtYXAubWlwbGV2ZWwpXG4gICAgICB0eXBlID0gdHlwZSB8fCBwaXhtYXAudHlwZVxuICAgICAgZm9ybWF0ID0gZm9ybWF0IHx8IHBpeG1hcC5mb3JtYXRcbiAgICAgIGludGVybmFsZm9ybWF0ID0gaW50ZXJuYWxmb3JtYXQgfHwgcGl4bWFwLmludGVybmFsZm9ybWF0XG4gICAgICBjaGFubmVscyA9IGNoYW5uZWxzIHx8IHBpeG1hcC5jaGFubmVsc1xuICAgICAgbmVlZHNQb2xsID0gbmVlZHNQb2xsIHx8IHBpeG1hcC5uZWVkc1BvbGxcbiAgICAgIG5lZWRzTGlzdGVuZXJzID0gbmVlZHNMaXN0ZW5lcnMgfHwgcGl4bWFwLm5lZWRzTGlzdGVuZXJzXG4gICAgICBjb21wcmVzc2VkID0gY29tcHJlc3NlZCB8fCBwaXhtYXAuY29tcHJlc3NlZFxuXG4gICAgICB2YXIgbWlwbGV2ZWwgPSBwaXhtYXAubWlwbGV2ZWxcbiAgICAgIHZhciB0YXJnZXQgPSBwaXhtYXAudGFyZ2V0XG4gICAgICBoYXNNaXAgPSBoYXNNaXAgfHwgKG1pcGxldmVsID4gMClcbiAgICAgIGlmICh0YXJnZXQgPT09IEdMX1RFWFRVUkVfMkQpIHtcbiAgICAgICAgbWlwTWFzazJEIHw9ICgxIDw8IG1pcGxldmVsKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIGZhY2UgPSB0YXJnZXQgLSBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1hcbiAgICAgICAgbWlwTWFza0N1YmVbZmFjZV0gfD0gKDEgPDwgbWlwbGV2ZWwpXG4gICAgICAgIGN1YmVNYXNrIHw9ICgxIDw8IGZhY2UpXG4gICAgICB9XG4gICAgfVxuXG4gICAgcGFyYW1zLm5lZWRzUG9sbCA9IG5lZWRzUG9sbFxuICAgIHBhcmFtcy5uZWVkc0xpc3RlbmVycyA9IG5lZWRzTGlzdGVuZXJzXG4gICAgcGFyYW1zLndpZHRoID0gd2lkdGhcbiAgICBwYXJhbXMuaGVpZ2h0ID0gaGVpZ2h0XG4gICAgcGFyYW1zLmZvcm1hdCA9IGZvcm1hdFxuICAgIHBhcmFtcy5pbnRlcm5hbGZvcm1hdCA9IGludGVybmFsZm9ybWF0XG4gICAgcGFyYW1zLnR5cGUgPSB0eXBlXG5cbiAgICB2YXIgbWlwTWFzayA9IGhhc01pcCA/ICh3aWR0aCA8PCAxKSAtIDEgOiAxXG4gICAgaWYgKHBhcmFtcy50YXJnZXQgPT09IEdMX1RFWFRVUkVfMkQpIHtcbiAgICAgIFxuICAgICAgXG4gICAgfSBlbHNlIHtcbiAgICAgIFxuICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICBcbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgbWlwRmlsdGVyID0gKE1JUE1BUF9GSUxURVJTLmluZGV4T2YocGFyYW1zLm1pbkZpbHRlcikgPj0gMClcbiAgICBwYXJhbXMuZ2VuTWlwbWFwcyA9ICFoYXNNaXAgJiYgKHBhcmFtcy5nZW5NaXBtYXBzIHx8IG1pcEZpbHRlcilcbiAgICB2YXIgdXNlTWlwbWFwcyA9IGhhc01pcCB8fCBwYXJhbXMuZ2VuTWlwbWFwc1xuXG4gICAgaWYgKCFwYXJhbXMubWluRmlsdGVyKSB7XG4gICAgICBwYXJhbXMubWluRmlsdGVyID0gdXNlTWlwbWFwc1xuICAgICAgICA/IEdMX0xJTkVBUl9NSVBNQVBfTElORUFSXG4gICAgICAgIDogR0xfTkVBUkVTVFxuICAgIH0gZWxzZSB7XG4gICAgICBcbiAgICB9XG5cbiAgICBpZiAodXNlTWlwbWFwcykge1xuICAgICAgXG4gICAgfVxuXG4gICAgaWYgKHBhcmFtcy5nZW5NaXBtYXBzKSB7XG4gICAgICBcbiAgICB9XG5cbiAgICBwYXJhbXMud3JhcFMgPSBwYXJhbXMud3JhcFMgfHwgR0xfQ0xBTVBfVE9fRURHRVxuICAgIHBhcmFtcy53cmFwVCA9IHBhcmFtcy53cmFwVCB8fCBHTF9DTEFNUF9UT19FREdFXG4gICAgaWYgKHBhcmFtcy53cmFwUyAhPT0gR0xfQ0xBTVBfVE9fRURHRSB8fFxuICAgICAgICBwYXJhbXMud3JhcFQgIT09IEdMX0NMQU1QX1RPX0VER0UpIHtcbiAgICAgIFxuICAgIH1cblxuICAgIGlmICgodHlwZSA9PT0gR0xfRkxPQVQgJiYgIWV4dGVuc2lvbnMub2VzX3RleHR1cmVfZmxvYXRfbGluZWFyKSB8fFxuICAgICAgICAodHlwZSA9PT0gR0xfSEFMRl9GTE9BVF9PRVMgJiZcbiAgICAgICAgICAhZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9oYWxmX2Zsb2F0X2xpbmVhcikpIHtcbiAgICAgIFxuICAgIH1cblxuICAgIGZvciAoaSA9IDA7IGkgPCBwaXhlbHMubGVuZ3RoOyArK2kpIHtcbiAgICAgIHBpeG1hcCA9IHBpeGVsc1tpXVxuICAgICAgdmFyIGxldmVsID0gcGl4bWFwLm1pcGxldmVsXG4gICAgICBpZiAocGl4bWFwLndpZHRoKSB7XG4gICAgICAgIFxuICAgICAgfVxuICAgICAgaWYgKHBpeG1hcC5oZWlnaHQpIHtcbiAgICAgICAgXG4gICAgICB9XG4gICAgICBpZiAocGl4bWFwLmNoYW5uZWxzKSB7XG4gICAgICAgIFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGl4bWFwLmNoYW5uZWxzID0gY2hhbm5lbHNcbiAgICAgIH1cbiAgICAgIGlmIChwaXhtYXAuZm9ybWF0KSB7XG4gICAgICAgIFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGl4bWFwLmZvcm1hdCA9IGZvcm1hdFxuICAgICAgfVxuICAgICAgaWYgKHBpeG1hcC5pbnRlcm5hbGZvcm1hdCkge1xuICAgICAgICBcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBpeG1hcC5pbnRlcm5hbGZvcm1hdCA9IGludGVybmFsZm9ybWF0XG4gICAgICB9XG4gICAgICBpZiAocGl4bWFwLnR5cGUpIHtcbiAgICAgICAgXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwaXhtYXAudHlwZSA9IHR5cGVcbiAgICAgIH1cbiAgICAgIGlmIChwaXhtYXAuY29weSkge1xuICAgICAgICBcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICB2YXIgYWN0aXZlVGV4dHVyZSA9IDBcbiAgdmFyIHRleHR1cmVDb3VudCA9IDBcbiAgdmFyIHRleHR1cmVTZXQgPSB7fVxuICB2YXIgcG9sbFNldCA9IFtdXG4gIHZhciBudW1UZXhVbml0cyA9IGxpbWl0cy5tYXhUZXh0dXJlVW5pdHNcbiAgdmFyIHRleHR1cmVVbml0cyA9IEFycmF5KG51bVRleFVuaXRzKS5tYXAoZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBudWxsXG4gIH0pXG5cbiAgZnVuY3Rpb24gUkVHTFRleHR1cmUgKHRhcmdldCkge1xuICAgIHRoaXMuaWQgPSB0ZXh0dXJlQ291bnQrK1xuICAgIHRoaXMucmVmQ291bnQgPSAxXG5cbiAgICB0aGlzLnRhcmdldCA9IHRhcmdldFxuICAgIHRoaXMudGV4dHVyZSA9IG51bGxcblxuICAgIHRoaXMucG9sbElkID0gLTFcblxuICAgIHRoaXMudW5pdCA9IC0xXG4gICAgdGhpcy5iaW5kQ291bnQgPSAwXG5cbiAgICAvLyBjYW5jZWxzIGFsbCBwZW5kaW5nIGNhbGxiYWNrc1xuICAgIHRoaXMuY2FuY2VsUGVuZGluZyA9IG51bGxcblxuICAgIC8vIHBhcnNlZCB1c2VyIGlucHV0c1xuICAgIHRoaXMucGFyYW1zID0gbmV3IFRleFBhcmFtcyh0YXJnZXQpXG4gICAgdGhpcy5waXhlbHMgPSBbXVxuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlICh0ZXh0dXJlLCBvcHRpb25zKSB7XG4gICAgdmFyIGlcbiAgICBjbGVhckxpc3RlbmVycyh0ZXh0dXJlKVxuXG4gICAgLy8gQ2xlYXIgcGFyYW1ldGVycyBhbmQgcGl4ZWwgZGF0YVxuICAgIHZhciBwYXJhbXMgPSB0ZXh0dXJlLnBhcmFtc1xuICAgIFRleFBhcmFtcy5jYWxsKHBhcmFtcywgdGV4dHVyZS50YXJnZXQpXG4gICAgdmFyIHBpeGVscyA9IHRleHR1cmUucGl4ZWxzXG4gICAgcGl4ZWxzLmxlbmd0aCA9IDBcblxuICAgIC8vIHBhcnNlIHBhcmFtZXRlcnNcbiAgICBwYXJhbXMucGFyc2Uob3B0aW9ucylcblxuICAgIC8vIHBhcnNlIHBpeGVsIGRhdGFcbiAgICBmdW5jdGlvbiBwYXJzZU1pcCAodGFyZ2V0LCBkYXRhKSB7XG4gICAgICB2YXIgbWlwbWFwID0gZGF0YS5taXBtYXBcbiAgICAgIHZhciBwaXhtYXBcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KG1pcG1hcCkpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBtaXBtYXAubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICBwaXhtYXAgPSBuZXcgUGl4ZWxJbmZvKHRhcmdldClcbiAgICAgICAgICBwaXhtYXAucGFyc2VGbGFncyhvcHRpb25zKVxuICAgICAgICAgIHBpeG1hcC5wYXJzZUZsYWdzKGRhdGEpXG4gICAgICAgICAgcGl4bWFwLnBhcnNlKG1pcG1hcFtpXSwgaSlcbiAgICAgICAgICBwaXhlbHMucHVzaChwaXhtYXApXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBpeG1hcCA9IG5ldyBQaXhlbEluZm8odGFyZ2V0KVxuICAgICAgICBwaXhtYXAucGFyc2VGbGFncyhvcHRpb25zKVxuICAgICAgICBwaXhtYXAucGFyc2UoZGF0YSwgMClcbiAgICAgICAgcGl4ZWxzLnB1c2gocGl4bWFwKVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAodGV4dHVyZS50YXJnZXQgPT09IEdMX1RFWFRVUkVfMkQpIHtcbiAgICAgIHBhcnNlTWlwKEdMX1RFWFRVUkVfMkQsIG9wdGlvbnMpXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBmYWNlcyA9IG9wdGlvbnMuZmFjZXMgfHwgb3B0aW9uc1xuICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZmFjZXMpKSB7XG4gICAgICAgIFxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgICAgcGFyc2VNaXAoR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YICsgaSwgZmFjZXNbaV0pXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZhY2VzID09PSAnc3RyaW5nJykge1xuICAgICAgICAvLyBUT0RPIFJlYWQgZGRzXG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBJbml0aWFsaXplIHRvIGFsbCBlbXB0eSB0ZXh0dXJlc1xuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgICAgcGFyc2VNaXAoR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YICsgaSwge30pXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBkbyBhIHNlY29uZCBwYXNzIHRvIHJlY29uY2lsZSBkZWZhdWx0c1xuICAgIGNoZWNrVGV4dHVyZUNvbXBsZXRlKHBhcmFtcywgcGl4ZWxzKVxuXG4gICAgaWYgKHBhcmFtcy5uZWVkc0xpc3RlbmVycykge1xuICAgICAgaG9va0xpc3RlbmVycyh0ZXh0dXJlKVxuICAgIH1cblxuICAgIGlmIChwYXJhbXMubmVlZHNQb2xsKSB7XG4gICAgICB0ZXh0dXJlLnBvbGxJZCA9IHBvbGxTZXQubGVuZ3RoXG4gICAgICBwb2xsU2V0LnB1c2godGV4dHVyZSlcbiAgICB9XG5cbiAgICByZWZyZXNoKHRleHR1cmUpXG4gIH1cblxuICBmdW5jdGlvbiByZWZyZXNoICh0ZXh0dXJlKSB7XG4gICAgaWYgKCFnbC5pc1RleHR1cmUodGV4dHVyZS50ZXh0dXJlKSkge1xuICAgICAgdGV4dHVyZS50ZXh0dXJlID0gZ2wuY3JlYXRlVGV4dHVyZSgpXG4gICAgfVxuXG4gICAgLy8gTGF6eSBiaW5kXG4gICAgdmFyIHRhcmdldCA9IHRleHR1cmUudGFyZ2V0XG4gICAgdmFyIHVuaXQgPSB0ZXh0dXJlLnVuaXRcbiAgICBpZiAodW5pdCA+PSAwKSB7XG4gICAgICBnbC5hY3RpdmVUZXh0dXJlKEdMX1RFWFRVUkUwICsgdW5pdClcbiAgICAgIGFjdGl2ZVRleHR1cmUgPSB1bml0XG4gICAgfSBlbHNlIHtcbiAgICAgIGdsLmJpbmRUZXh0dXJlKHRhcmdldCwgdGV4dHVyZS50ZXh0dXJlKVxuICAgIH1cblxuICAgIC8vIFVwbG9hZFxuICAgIHZhciBwaXhlbHMgPSB0ZXh0dXJlLnBpeGVsc1xuICAgIHZhciBwYXJhbXMgPSB0ZXh0dXJlLnBhcmFtc1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcGl4ZWxzLmxlbmd0aDsgKytpKSB7XG4gICAgICBwaXhlbHNbaV0udXBsb2FkKHBhcmFtcylcbiAgICB9XG4gICAgcGFyYW1zLnVwbG9hZCgpXG5cbiAgICAvLyBMYXp5IHVuYmluZFxuICAgIGlmICh1bml0IDwgMCkge1xuICAgICAgdmFyIGFjdGl2ZSA9IHRleHR1cmVVbml0c1thY3RpdmVUZXh0dXJlXVxuICAgICAgaWYgKGFjdGl2ZSkge1xuICAgICAgICAvLyByZXN0b3JlIGJpbmRpbmcgc3RhdGVcbiAgICAgICAgZ2wuYmluZFRleHR1cmUoYWN0aXZlLnRhcmdldCwgYWN0aXZlLnRleHR1cmUpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBvdGhlcndpc2UgYmVjb21lIG5ldyBhY3RpdmVcbiAgICAgICAgdGV4dHVyZS51bml0ID0gYWN0aXZlVGV4dHVyZVxuICAgICAgICB0ZXh0dXJlVW5pdHNbYWN0aXZlVGV4dHVyZV0gPSB0ZXh0dXJlXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaG9va0xpc3RlbmVycyAodGV4dHVyZSkge1xuICAgIHZhciBwYXJhbXMgPSB0ZXh0dXJlLnBhcmFtc1xuICAgIHZhciBwaXhlbHMgPSB0ZXh0dXJlLnBpeGVsc1xuXG4gICAgLy8gQXBwZW5kcyBhbGwgdGhlIHRleHR1cmUgZGF0YSBmcm9tIHRoZSBidWZmZXIgdG8gdGhlIGN1cnJlbnRcbiAgICBmdW5jdGlvbiBhcHBlbmRERFMgKHRhcmdldCwgbWlwbGV2ZWwsIGJ1ZmZlcikge1xuICAgICAgdmFyIGRkcyA9IHBhcnNlRERTKGJ1ZmZlcilcblxuICAgICAgXG5cbiAgICAgIGlmIChkZHMuY3ViZSkge1xuICAgICAgICBcblxuICAgICAgICAvLyBUT0RPIGhhbmRsZSBjdWJlIG1hcCBERFNcbiAgICAgICAgXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBcbiAgICAgIH1cblxuICAgICAgaWYgKG1pcGxldmVsKSB7XG4gICAgICAgIFxuICAgICAgfVxuXG4gICAgICBkZHMucGl4ZWxzLmZvckVhY2goZnVuY3Rpb24gKHBpeG1hcCkge1xuICAgICAgICB2YXIgaW5mbyA9IG5ldyBQaXhlbEluZm8oZGRzLmN1YmUgPyBwaXhtYXAudGFyZ2V0IDogdGFyZ2V0KVxuXG4gICAgICAgIGluZm8uY2hhbm5lbHMgPSBkZHMuY2hhbm5lbHNcbiAgICAgICAgaW5mby5jb21wcmVzc2VkID0gZGRzLmNvbXByZXNzZWRcbiAgICAgICAgaW5mby50eXBlID0gZGRzLnR5cGVcbiAgICAgICAgaW5mby5pbnRlcm5hbGZvcm1hdCA9IGRkcy5mb3JtYXRcbiAgICAgICAgaW5mby5mb3JtYXQgPSBjb2xvckZvcm1hdHNbZGRzLmZvcm1hdF1cblxuICAgICAgICBpbmZvLndpZHRoID0gcGl4bWFwLndpZHRoXG4gICAgICAgIGluZm8uaGVpZ2h0ID0gcGl4bWFwLmhlaWdodFxuICAgICAgICBpbmZvLm1pcGxldmVsID0gcGl4bWFwLm1pcGxldmVsIHx8IG1pcGxldmVsXG4gICAgICAgIGluZm8uZGF0YSA9IHBpeG1hcC5kYXRhXG5cbiAgICAgICAgcGl4ZWxzLnB1c2goaW5mbylcbiAgICAgIH0pXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gb25EYXRhICgpIHtcbiAgICAgIC8vIFVwZGF0ZSBzaXplIG9mIGFueSBuZXdseSBsb2FkZWQgcGl4ZWxzXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHBpeGVscy5sZW5ndGg7ICsraSkge1xuICAgICAgICB2YXIgcGl4ZWxEYXRhID0gcGl4ZWxzW2ldXG4gICAgICAgIHZhciBpbWFnZSA9IHBpeGVsRGF0YS5pbWFnZVxuICAgICAgICB2YXIgdmlkZW8gPSBwaXhlbERhdGEudmlkZW9cbiAgICAgICAgdmFyIHhociA9IHBpeGVsRGF0YS54aHJcbiAgICAgICAgaWYgKGltYWdlICYmIGltYWdlLmNvbXBsZXRlKSB7XG4gICAgICAgICAgcGl4ZWxEYXRhLndpZHRoID0gaW1hZ2UubmF0dXJhbFdpZHRoXG4gICAgICAgICAgcGl4ZWxEYXRhLmhlaWdodCA9IGltYWdlLm5hdHVyYWxIZWlnaHRcbiAgICAgICAgfSBlbHNlIGlmICh2aWRlbyAmJiB2aWRlby5yZWFkeVN0YXRlID4gMikge1xuICAgICAgICAgIHBpeGVsRGF0YS53aWR0aCA9IHZpZGVvLndpZHRoXG4gICAgICAgICAgcGl4ZWxEYXRhLmhlaWdodCA9IHZpZGVvLmhlaWdodFxuICAgICAgICB9IGVsc2UgaWYgKHhociAmJiB4aHIucmVhZHlTdGF0ZSA9PT0gNCkge1xuICAgICAgICAgIHBpeGVsc1tpXSA9IHBpeGVsc1twaXhlbHMubGVuZ3RoIC0gMV1cbiAgICAgICAgICBwaXhlbHMucG9wKClcbiAgICAgICAgICB4aHIucmVtb3ZlRXZlbnRMaXN0ZW5lcigncmVhZHlzdGF0ZWNoYW5nZScsIHJlZnJlc2gpXG4gICAgICAgICAgYXBwZW5kRERTKHBpeGVsRGF0YS50YXJnZXQsIHBpeGVsRGF0YS5taXBsZXZlbCwgeGhyLnJlc3BvbnNlKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjaGVja1RleHR1cmVDb21wbGV0ZShwYXJhbXMsIHBpeGVscylcbiAgICAgIHJlZnJlc2godGV4dHVyZSlcbiAgICB9XG5cbiAgICBwaXhlbHMuZm9yRWFjaChmdW5jdGlvbiAocGl4ZWxEYXRhKSB7XG4gICAgICBpZiAocGl4ZWxEYXRhLmltYWdlICYmICFwaXhlbERhdGEuaW1hZ2UuY29tcGxldGUpIHtcbiAgICAgICAgcGl4ZWxEYXRhLmltYWdlLmFkZEV2ZW50TGlzdGVuZXIoJ2xvYWQnLCBvbkRhdGEpXG4gICAgICB9IGVsc2UgaWYgKHBpeGVsRGF0YS52aWRlbyAmJiBwaXhlbERhdGEucmVhZHlTdGF0ZSA8IDEpIHtcbiAgICAgICAgcGl4ZWxEYXRhLnZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ3Byb2dyZXNzJywgb25EYXRhKVxuICAgICAgfSBlbHNlIGlmIChwaXhlbERhdGEueGhyKSB7XG4gICAgICAgIHBpeGVsRGF0YS54aHIuYWRkRXZlbnRMaXN0ZW5lcigncmVhZHlzdGF0ZWNoYW5nZScsIG9uRGF0YSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgdGV4dHVyZS5jYW5jZWxQZW5kaW5nID0gZnVuY3Rpb24gZGV0YWNoTGlzdGVuZXJzICgpIHtcbiAgICAgIHBpeGVscy5mb3JFYWNoKGZ1bmN0aW9uIChwaXhlbERhdGEpIHtcbiAgICAgICAgaWYgKHBpeGVsRGF0YS5pbWFnZSkge1xuICAgICAgICAgIHBpeGVsRGF0YS5pbWFnZS5yZW1vdmVFdmVudExpc3RlbmVyKCdsb2FkJywgb25EYXRhKVxuICAgICAgICB9IGVsc2UgaWYgKHBpeGVsRGF0YS52aWRlbykge1xuICAgICAgICAgIHBpeGVsRGF0YS52aWRlby5yZW1vdmVFdmVudExpc3RlbmVyKCdwcm9ncmVzcycsIG9uRGF0YSlcbiAgICAgICAgfSBlbHNlIGlmIChwaXhlbERhdGEueGhyKSB7XG4gICAgICAgICAgcGl4ZWxEYXRhLnhoci5yZW1vdmVFdmVudExpc3RlbmVyKCdyZWFkeXN0YXRlY2hhbmdlJywgb25EYXRhKVxuICAgICAgICAgIHBpeGVsRGF0YS54aHIuYWJvcnQoKVxuICAgICAgICB9XG4gICAgICB9KVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNsZWFyTGlzdGVuZXJzICh0ZXh0dXJlKSB7XG4gICAgdmFyIGNhbmNlbFBlbmRpbmcgPSB0ZXh0dXJlLmNhbmNlbFBlbmRpbmdcbiAgICBpZiAoY2FuY2VsUGVuZGluZykge1xuICAgICAgY2FuY2VsUGVuZGluZygpXG4gICAgICB0ZXh0dXJlLmNhbmNlbFBlbmRpbmcgPSBudWxsXG4gICAgfVxuICAgIHZhciBpZCA9IHRleHR1cmUucG9sbElkXG4gICAgaWYgKGlkID49IDApIHtcbiAgICAgIHZhciBvdGhlciA9IHBvbGxTZXRbaWRdID0gcG9sbFNldFtwb2xsU2V0Lmxlbmd0aCAtIDFdXG4gICAgICBvdGhlci5pZCA9IGlkXG4gICAgICBwb2xsU2V0LnBvcCgpXG4gICAgICB0ZXh0dXJlLnBvbGxJZCA9IC0xXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSAodGV4dHVyZSkge1xuICAgIHZhciBoYW5kbGUgPSB0ZXh0dXJlLnRleHR1cmVcbiAgICBcbiAgICB2YXIgdW5pdCA9IHRleHR1cmUudW5pdFxuICAgIHZhciB0YXJnZXQgPSB0ZXh0dXJlLnRhcmdldFxuICAgIGlmICh1bml0ID49IDApIHtcbiAgICAgIGdsLmFjdGl2ZVRleHR1cmUoR0xfVEVYVFVSRTAgKyB1bml0KVxuICAgICAgYWN0aXZlVGV4dHVyZSA9IHVuaXRcbiAgICAgIGdsLmJpbmRUZXh0dXJlKHRhcmdldCwgbnVsbClcbiAgICAgIHRleHR1cmVVbml0c1t1bml0XSA9IG51bGxcbiAgICB9XG4gICAgY2xlYXJMaXN0ZW5lcnModGV4dHVyZSlcbiAgICBpZiAoZ2wuaXNUZXh0dXJlKGhhbmRsZSkpIHtcbiAgICAgIGdsLmRlbGV0ZVRleHR1cmUoaGFuZGxlKVxuICAgIH1cbiAgICB0ZXh0dXJlLnRleHR1cmUgPSBudWxsXG4gICAgdGV4dHVyZS5wYXJhbXMgPSBudWxsXG4gICAgdGV4dHVyZS5waXhlbHMgPSBudWxsXG4gICAgdGV4dHVyZS5yZWZDb3VudCA9IDBcbiAgICBkZWxldGUgdGV4dHVyZVNldFt0ZXh0dXJlLmlkXVxuICB9XG5cbiAgZXh0ZW5kKFJFR0xUZXh0dXJlLnByb3RvdHlwZSwge1xuICAgIGJpbmQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciB0ZXh0dXJlID0gdGhpc1xuICAgICAgdGV4dHVyZS5iaW5kQ291bnQgKz0gMVxuICAgICAgdmFyIHVuaXQgPSB0ZXh0dXJlLnVuaXRcbiAgICAgIGlmICh1bml0IDwgMCkge1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG51bVRleFVuaXRzOyArK2kpIHtcbiAgICAgICAgICB2YXIgb3RoZXIgPSB0ZXh0dXJlVW5pdHNbaV1cbiAgICAgICAgICBpZiAob3RoZXIpIHtcbiAgICAgICAgICAgIGlmIChvdGhlci5iaW5kQ291bnQgPiAwKSB7XG4gICAgICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBvdGhlci51bml0ID0gLTFcbiAgICAgICAgICB9XG4gICAgICAgICAgdGV4dHVyZVVuaXRzW2ldID0gdGV4dHVyZVxuICAgICAgICAgIHVuaXQgPSBpXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgfVxuICAgICAgICBpZiAodW5pdCA+PSBudW1UZXhVbml0cykge1xuICAgICAgICAgIFxuICAgICAgICB9XG4gICAgICAgIHRleHR1cmUudW5pdCA9IHVuaXRcbiAgICAgICAgZ2wuYWN0aXZlVGV4dHVyZShHTF9URVhUVVJFMCArIHVuaXQpXG4gICAgICAgIGdsLmJpbmRUZXh0dXJlKHRleHR1cmUudGFyZ2V0LCB0ZXh0dXJlLnRleHR1cmUpXG4gICAgICAgIGFjdGl2ZVRleHR1cmUgPSB1bml0XG4gICAgICB9XG4gICAgICByZXR1cm4gdW5pdFxuICAgIH0sXG5cbiAgICB1bmJpbmQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHRoaXMuYmluZENvdW50IC09IDFcbiAgICB9LFxuXG4gICAgZGVjUmVmOiBmdW5jdGlvbiAoKSB7XG4gICAgICBpZiAoLS10aGlzLnJlZkNvdW50ID09PSAwKSB7XG4gICAgICAgIGRlc3Ryb3kodGhpcylcbiAgICAgIH1cbiAgICB9XG4gIH0pXG5cbiAgZnVuY3Rpb24gY3JlYXRlVGV4dHVyZSAob3B0aW9ucywgdGFyZ2V0KSB7XG4gICAgdmFyIHRleHR1cmUgPSBuZXcgUkVHTFRleHR1cmUodGFyZ2V0KVxuICAgIHRleHR1cmVTZXRbdGV4dHVyZS5pZF0gPSB0ZXh0dXJlXG5cbiAgICBmdW5jdGlvbiByZWdsVGV4dHVyZSAoYTAsIGExLCBhMiwgYTMsIGE0LCBhNSkge1xuICAgICAgdmFyIG9wdGlvbnMgPSBhMCB8fCB7fVxuICAgICAgaWYgKHRhcmdldCA9PT0gR0xfVEVYVFVSRV9DVUJFX01BUCAmJiBhcmd1bWVudHMubGVuZ3RoID09PSA2KSB7XG4gICAgICAgIG9wdGlvbnMgPSBbYTAsIGExLCBhMiwgYTMsIGE0LCBhNV1cbiAgICAgIH1cbiAgICAgIHVwZGF0ZSh0ZXh0dXJlLCBvcHRpb25zKVxuICAgICAgcmVnbFRleHR1cmUud2lkdGggPSB0ZXh0dXJlLnBhcmFtcy53aWR0aFxuICAgICAgcmVnbFRleHR1cmUuaGVpZ2h0ID0gdGV4dHVyZS5wYXJhbXMuaGVpZ2h0XG4gICAgICByZXR1cm4gcmVnbFRleHR1cmVcbiAgICB9XG5cbiAgICByZWdsVGV4dHVyZShvcHRpb25zKVxuXG4gICAgcmVnbFRleHR1cmUuX3JlZ2xUeXBlID0gJ3RleHR1cmUnXG4gICAgcmVnbFRleHR1cmUuX3RleHR1cmUgPSB0ZXh0dXJlXG4gICAgcmVnbFRleHR1cmUuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHRleHR1cmUuZGVjUmVmKClcbiAgICB9XG5cbiAgICByZXR1cm4gcmVnbFRleHR1cmVcbiAgfVxuXG4gIC8vIENhbGxlZCBhZnRlciBjb250ZXh0IHJlc3RvcmVcbiAgZnVuY3Rpb24gcmVmcmVzaFRleHR1cmVzICgpIHtcbiAgICB2YWx1ZXModGV4dHVyZVNldCkuZm9yRWFjaChyZWZyZXNoKVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbnVtVGV4VW5pdHM7ICsraSkge1xuICAgICAgdGV4dHVyZVVuaXRzW2ldID0gbnVsbFxuICAgIH1cbiAgICBhY3RpdmVUZXh0dXJlID0gMFxuICAgIGdsLmFjdGl2ZVRleHR1cmUoR0xfVEVYVFVSRTApXG4gIH1cblxuICAvLyBDYWxsZWQgd2hlbiByZWdsIGlzIGRlc3Ryb3llZFxuICBmdW5jdGlvbiBkZXN0cm95VGV4dHVyZXMgKCkge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbnVtVGV4VW5pdHM7ICsraSkge1xuICAgICAgZ2wuYWN0aXZlVGV4dHVyZShHTF9URVhUVVJFMCArIGkpXG4gICAgICBnbC5iaW5kVGV4dHVyZShHTF9URVhUVVJFXzJELCBudWxsKVxuICAgICAgdGV4dHVyZVVuaXRzW2ldID0gbnVsbFxuICAgIH1cbiAgICBnbC5hY3RpdmVUZXh0dXJlKEdMX1RFWFRVUkUwKVxuICAgIGFjdGl2ZVRleHR1cmUgPSAwXG4gICAgdmFsdWVzKHRleHR1cmVTZXQpLmZvckVhY2goZGVzdHJveSlcbiAgfVxuXG4gIC8vIENhbGxlZCBvbmNlIHBlciByYWYsIHVwZGF0ZXMgdmlkZW8gdGV4dHVyZXNcbiAgZnVuY3Rpb24gcG9sbFRleHR1cmVzICgpIHtcbiAgICBwb2xsU2V0LmZvckVhY2gocmVmcmVzaClcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY3JlYXRlOiBjcmVhdGVUZXh0dXJlLFxuICAgIHJlZnJlc2g6IHJlZnJlc2hUZXh0dXJlcyxcbiAgICBjbGVhcjogZGVzdHJveVRleHR1cmVzLFxuICAgIHBvbGw6IHBvbGxUZXh0dXJlcyxcbiAgICBnZXRUZXh0dXJlOiBmdW5jdGlvbiAod3JhcHBlcikge1xuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG4gIH1cbn1cbiIsIi8qIGdsb2JhbHMgcGVyZm9ybWFuY2UgKi9cbm1vZHVsZS5leHBvcnRzID1cbiAgKHR5cGVvZiBwZXJmb3JtYW5jZSAhPT0gJ3VuZGVmaW5lZCcgJiYgcGVyZm9ybWFuY2Uubm93KVxuICA/IGZ1bmN0aW9uICgpIHsgcmV0dXJuIHBlcmZvcm1hbmNlLm5vdygpIH1cbiAgOiBmdW5jdGlvbiAoKSB7IHJldHVybiArKG5ldyBEYXRlKCkpIH1cbiIsInZhciBleHRlbmQgPSByZXF1aXJlKCcuL2V4dGVuZCcpXG5cbmZ1bmN0aW9uIHNsaWNlICh4KSB7XG4gIHJldHVybiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbCh4KVxufVxuXG5mdW5jdGlvbiBqb2luICh4KSB7XG4gIHJldHVybiBzbGljZSh4KS5qb2luKCcnKVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNyZWF0ZUVudmlyb25tZW50ICgpIHtcbiAgLy8gVW5pcXVlIHZhcmlhYmxlIGlkIGNvdW50ZXJcbiAgdmFyIHZhckNvdW50ZXIgPSAwXG5cbiAgLy8gTGlua2VkIHZhbHVlcyBhcmUgcGFzc2VkIGZyb20gdGhpcyBzY29wZSBpbnRvIHRoZSBnZW5lcmF0ZWQgY29kZSBibG9ja1xuICAvLyBDYWxsaW5nIGxpbmsoKSBwYXNzZXMgYSB2YWx1ZSBpbnRvIHRoZSBnZW5lcmF0ZWQgc2NvcGUgYW5kIHJldHVybnNcbiAgLy8gdGhlIHZhcmlhYmxlIG5hbWUgd2hpY2ggaXQgaXMgYm91bmQgdG9cbiAgdmFyIGxpbmtlZE5hbWVzID0gW11cbiAgdmFyIGxpbmtlZFZhbHVlcyA9IFtdXG4gIGZ1bmN0aW9uIGxpbmsgKHZhbHVlKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsaW5rZWRWYWx1ZXMubGVuZ3RoOyArK2kpIHtcbiAgICAgIGlmIChsaW5rZWRWYWx1ZXNbaV0gPT09IHZhbHVlKSB7XG4gICAgICAgIHJldHVybiBsaW5rZWROYW1lc1tpXVxuICAgICAgfVxuICAgIH1cblxuICAgIHZhciBuYW1lID0gJ2cnICsgKHZhckNvdW50ZXIrKylcbiAgICBsaW5rZWROYW1lcy5wdXNoKG5hbWUpXG4gICAgbGlua2VkVmFsdWVzLnB1c2godmFsdWUpXG4gICAgcmV0dXJuIG5hbWVcbiAgfVxuXG4gIC8vIGNyZWF0ZSBhIGNvZGUgYmxvY2tcbiAgZnVuY3Rpb24gYmxvY2sgKCkge1xuICAgIHZhciBjb2RlID0gW11cbiAgICBmdW5jdGlvbiBwdXNoICgpIHtcbiAgICAgIGNvZGUucHVzaC5hcHBseShjb2RlLCBzbGljZShhcmd1bWVudHMpKVxuICAgIH1cblxuICAgIHZhciB2YXJzID0gW11cbiAgICBmdW5jdGlvbiBkZWYgKCkge1xuICAgICAgdmFyIG5hbWUgPSAndicgKyAodmFyQ291bnRlcisrKVxuICAgICAgdmFycy5wdXNoKG5hbWUpXG5cbiAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb2RlLnB1c2gobmFtZSwgJz0nKVxuICAgICAgICBjb2RlLnB1c2guYXBwbHkoY29kZSwgc2xpY2UoYXJndW1lbnRzKSlcbiAgICAgICAgY29kZS5wdXNoKCc7JylcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG5hbWVcbiAgICB9XG5cbiAgICByZXR1cm4gZXh0ZW5kKHB1c2gsIHtcbiAgICAgIGRlZjogZGVmLFxuICAgICAgdG9TdHJpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIGpvaW4oW1xuICAgICAgICAgICh2YXJzLmxlbmd0aCA+IDAgPyAndmFyICcgKyB2YXJzICsgJzsnIDogJycpLFxuICAgICAgICAgIGpvaW4oY29kZSlcbiAgICAgICAgXSlcbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgZnVuY3Rpb24gc2NvcGUgKCkge1xuICAgIHZhciBlbnRyeSA9IGJsb2NrKClcbiAgICB2YXIgZXhpdCA9IGJsb2NrKClcblxuICAgIHZhciBlbnRyeVRvU3RyaW5nID0gZW50cnkudG9TdHJpbmdcbiAgICB2YXIgZXhpdFRvU3RyaW5nID0gZXhpdC50b1N0cmluZ1xuXG4gICAgZnVuY3Rpb24gc2F2ZSAob2JqZWN0LCBwcm9wKSB7XG4gICAgICBleGl0KG9iamVjdCwgcHJvcCwgJz0nLCBlbnRyeS5kZWYob2JqZWN0LCBwcm9wKSwgJzsnKVxuICAgIH1cblxuICAgIHJldHVybiBleHRlbmQoZW50cnksIHtcbiAgICAgIGVudHJ5OiBlbnRyeSxcbiAgICAgIGV4aXQ6IGV4aXQsXG4gICAgICBzYXZlOiBzYXZlLFxuICAgICAgc2V0OiBmdW5jdGlvbiAob2JqZWN0LCBwcm9wLCB2YWx1ZSkge1xuICAgICAgICBzYXZlKG9iamVjdCwgcHJvcClcbiAgICAgICAgZW50cnkob2JqZWN0LCBwcm9wLCAnPScsIHZhbHVlLCAnOycpXG4gICAgICB9LFxuICAgICAgdG9TdHJpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIGVudHJ5VG9TdHJpbmcoKSArIGV4aXRUb1N0cmluZygpXG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGNvbmRpdGlvbmFsICgpIHtcbiAgICB2YXIgcHJlZCA9IGpvaW4oYXJndW1lbnRzKVxuICAgIHZhciB0aGVuQmxvY2sgPSBzY29wZSgpXG4gICAgdmFyIGVsc2VCbG9jayA9IHNjb3BlKClcblxuICAgIHZhciB0aGVuVG9TdHJpbmcgPSB0aGVuQmxvY2sudG9TdHJpbmdcbiAgICB2YXIgZWxzZVRvU3RyaW5nID0gZWxzZUJsb2NrLnRvU3RyaW5nXG5cbiAgICByZXR1cm4gZXh0ZW5kKHRoZW5CbG9jaywge1xuICAgICAgdGhlbjogZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGVuQmxvY2suYXBwbHkodGhlbkJsb2NrLCBzbGljZShhcmd1bWVudHMpKVxuICAgICAgICByZXR1cm4gdGhpc1xuICAgICAgfSxcbiAgICAgIGVsc2U6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgZWxzZUJsb2NrLmFwcGx5KGVsc2VCbG9jaywgc2xpY2UoYXJndW1lbnRzKSlcbiAgICAgICAgcmV0dXJuIHRoaXNcbiAgICAgIH0sXG4gICAgICB0b1N0cmluZzogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZWxzZUNsYXVzZSA9IGVsc2VUb1N0cmluZygpXG4gICAgICAgIGlmIChlbHNlQ2xhdXNlKSB7XG4gICAgICAgICAgZWxzZUNsYXVzZSA9ICdlbHNleycgKyBlbHNlQ2xhdXNlICsgJ30nXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGpvaW4oW1xuICAgICAgICAgICdpZignLCBwcmVkLCAnKXsnLFxuICAgICAgICAgIHRoZW5Ub1N0cmluZygpLFxuICAgICAgICAgICd9JywgZWxzZUNsYXVzZVxuICAgICAgICBdKVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICAvLyBwcm9jZWR1cmUgbGlzdFxuICB2YXIgZ2xvYmFsQmxvY2sgPSBibG9jaygpXG4gIHZhciBwcm9jZWR1cmVzID0ge31cbiAgZnVuY3Rpb24gcHJvYyAobmFtZSwgY291bnQpIHtcbiAgICB2YXIgYXJncyA9IFtdXG4gICAgZnVuY3Rpb24gYXJnICgpIHtcbiAgICAgIHZhciBuYW1lID0gJ2EnICsgYXJncy5sZW5ndGhcbiAgICAgIGFyZ3MucHVzaChuYW1lKVxuICAgICAgcmV0dXJuIG5hbWVcbiAgICB9XG5cbiAgICBjb3VudCA9IGNvdW50IHx8IDBcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNvdW50OyArK2kpIHtcbiAgICAgIGFyZygpXG4gICAgfVxuXG4gICAgdmFyIGJvZHkgPSBzY29wZSgpXG4gICAgdmFyIGJvZHlUb1N0cmluZyA9IGJvZHkudG9TdHJpbmdcblxuICAgIHZhciByZXN1bHQgPSBwcm9jZWR1cmVzW25hbWVdID0gZXh0ZW5kKGJvZHksIHtcbiAgICAgIGFyZzogYXJnLFxuICAgICAgdG9TdHJpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIGpvaW4oW1xuICAgICAgICAgICdmdW5jdGlvbignLCBhcmdzLmpvaW4oKSwgJyl7JyxcbiAgICAgICAgICBib2R5VG9TdHJpbmcoKSxcbiAgICAgICAgICAnfSdcbiAgICAgICAgXSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG5cbiAgZnVuY3Rpb24gY29tcGlsZSAoKSB7XG4gICAgdmFyIGNvZGUgPSBbJ1widXNlIHN0cmljdFwiOycsXG4gICAgICBnbG9iYWxCbG9jayxcbiAgICAgICdyZXR1cm4geyddXG4gICAgT2JqZWN0LmtleXMocHJvY2VkdXJlcykuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgY29kZS5wdXNoKCdcIicsIG5hbWUsICdcIjonLCBwcm9jZWR1cmVzW25hbWVdLnRvU3RyaW5nKCksICcsJylcbiAgICB9KVxuICAgIGNvZGUucHVzaCgnfScpXG4gICAgdmFyIHNyYyA9IGpvaW4oY29kZSlcbiAgICAgIC5yZXBsYWNlKC87L2csICc7XFxuJylcbiAgICAgIC5yZXBsYWNlKC99L2csICd9XFxuJylcbiAgICAgIC5yZXBsYWNlKC97L2csICd7XFxuJylcbiAgICB2YXIgcHJvYyA9IEZ1bmN0aW9uLmFwcGx5KG51bGwsIGxpbmtlZE5hbWVzLmNvbmNhdChzcmMpKVxuICAgIHJldHVybiBwcm9jLmFwcGx5KG51bGwsIGxpbmtlZFZhbHVlcylcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgZ2xvYmFsOiBnbG9iYWxCbG9jayxcbiAgICBsaW5rOiBsaW5rLFxuICAgIGJsb2NrOiBibG9jayxcbiAgICBwcm9jOiBwcm9jLFxuICAgIHNjb3BlOiBzY29wZSxcbiAgICBjb25kOiBjb25kaXRpb25hbCxcbiAgICBjb21waWxlOiBjb21waWxlXG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGJhc2UsIG9wdHMpIHtcbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhvcHRzKVxuICBmb3IgKHZhciBpID0gMDsgaSA8IGtleXMubGVuZ3RoOyArK2kpIHtcbiAgICBiYXNlW2tleXNbaV1dID0gb3B0c1trZXlzW2ldXVxuICB9XG4gIHJldHVybiBiYXNlXG59XG4iLCJ2YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi9pcy10eXBlZC1hcnJheScpXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaXNOREFycmF5TGlrZSAob2JqKSB7XG4gIHJldHVybiAoXG4gICAgISFvYmogJiZcbiAgICB0eXBlb2Ygb2JqID09PSAnb2JqZWN0JyAmJlxuICAgIEFycmF5LmlzQXJyYXkob2JqLnNoYXBlKSAmJlxuICAgIEFycmF5LmlzQXJyYXkob2JqLnN0cmlkZSkgJiZcbiAgICB0eXBlb2Ygb2JqLm9mZnNldCA9PT0gJ251bWJlcicgJiZcbiAgICBvYmouc2hhcGUubGVuZ3RoID09PSBvYmouc3RyaWRlLmxlbmd0aCAmJlxuICAgIChBcnJheS5pc0FycmF5KG9iai5kYXRhKSB8fFxuICAgICAgaXNUeXBlZEFycmF5KG9iai5kYXRhKSkpXG59XG4iLCJ2YXIgZHR5cGVzID0gcmVxdWlyZSgnLi4vY29uc3RhbnRzL2FycmF5dHlwZXMuanNvbicpXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uICh4KSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoeCkgaW4gZHR5cGVzXG59XG4iLCIvKiBnbG9iYWxzIGRvY3VtZW50LCBJbWFnZSwgWE1MSHR0cFJlcXVlc3QgKi9cblxubW9kdWxlLmV4cG9ydHMgPSBsb2FkVGV4dHVyZVxuXG5mdW5jdGlvbiBnZXRFeHRlbnNpb24gKHVybCkge1xuICB2YXIgcGFydHMgPSAvXFwuKFxcdyspKFxcPy4qKT8kLy5leGVjKHVybClcbiAgaWYgKHBhcnRzICYmIHBhcnRzWzFdKSB7XG4gICAgcmV0dXJuIHBhcnRzWzFdLnRvTG93ZXJDYXNlKClcbiAgfVxufVxuXG5mdW5jdGlvbiBpc1ZpZGVvRXh0ZW5zaW9uICh1cmwpIHtcbiAgcmV0dXJuIFtcbiAgICAnYXZpJyxcbiAgICAnYXNmJyxcbiAgICAnZ2lmdicsXG4gICAgJ21vdicsXG4gICAgJ3F0JyxcbiAgICAneXV2JyxcbiAgICAnbXBnJyxcbiAgICAnbXBlZycsXG4gICAgJ20ydicsXG4gICAgJ21wNCcsXG4gICAgJ200cCcsXG4gICAgJ200dicsXG4gICAgJ29nZycsXG4gICAgJ29ndicsXG4gICAgJ3ZvYicsXG4gICAgJ3dlYm0nLFxuICAgICd3bXYnXG4gIF0uaW5kZXhPZih1cmwpID49IDBcbn1cblxuZnVuY3Rpb24gaXNDb21wcmVzc2VkRXh0ZW5zaW9uICh1cmwpIHtcbiAgcmV0dXJuIFtcbiAgICAnZGRzJ1xuICBdLmluZGV4T2YodXJsKSA+PSAwXG59XG5cbmZ1bmN0aW9uIGxvYWRWaWRlbyAodXJsLCBjcm9zc09yaWdpbikge1xuICB2YXIgdmlkZW8gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd2aWRlbycpXG4gIHZpZGVvLmF1dG9wbGF5ID0gdHJ1ZVxuICB2aWRlby5sb29wID0gdHJ1ZVxuICBpZiAoY3Jvc3NPcmlnaW4pIHtcbiAgICB2aWRlby5jcm9zc09yaWdpbiA9IGNyb3NzT3JpZ2luXG4gIH1cbiAgdmlkZW8uc3JjID0gdXJsXG4gIHJldHVybiB2aWRlb1xufVxuXG5mdW5jdGlvbiBsb2FkQ29tcHJlc3NlZFRleHR1cmUgKHVybCwgZXh0LCBjcm9zc09yaWdpbikge1xuICB2YXIgeGhyID0gbmV3IFhNTEh0dHBSZXF1ZXN0KClcbiAgeGhyLnJlc3BvbnNlVHlwZSA9ICdhcnJheWJ1ZmZlcidcbiAgeGhyLm9wZW4oJ0dFVCcsIHVybCwgdHJ1ZSlcbiAgeGhyLnNlbmQoKVxuICByZXR1cm4geGhyXG59XG5cbmZ1bmN0aW9uIGxvYWRJbWFnZSAodXJsLCBjcm9zc09yaWdpbikge1xuICB2YXIgaW1hZ2UgPSBuZXcgSW1hZ2UoKVxuICBpZiAoY3Jvc3NPcmlnaW4pIHtcbiAgICBpbWFnZS5jcm9zc09yaWdpbiA9IGNyb3NzT3JpZ2luXG4gIH1cbiAgaW1hZ2Uuc3JjID0gdXJsXG4gIHJldHVybiBpbWFnZVxufVxuXG4vLyBDdXJyZW50bHkgdGhpcyBzdHVmZiBvbmx5IHdvcmtzIGluIGEgRE9NIGVudmlyb25tZW50XG5mdW5jdGlvbiBsb2FkVGV4dHVyZSAodXJsLCBjcm9zc09yaWdpbikge1xuICBpZiAodHlwZW9mIGRvY3VtZW50ICE9PSAndW5kZWZpbmVkJykge1xuICAgIHZhciBleHQgPSBnZXRFeHRlbnNpb24odXJsKVxuICAgIGlmIChpc1ZpZGVvRXh0ZW5zaW9uKGV4dCkpIHtcbiAgICAgIHJldHVybiBsb2FkVmlkZW8odXJsLCBjcm9zc09yaWdpbilcbiAgICB9XG4gICAgaWYgKGlzQ29tcHJlc3NlZEV4dGVuc2lvbihleHQpKSB7XG4gICAgICByZXR1cm4gbG9hZENvbXByZXNzZWRUZXh0dXJlKHVybCwgZXh0LCBjcm9zc09yaWdpbilcbiAgICB9XG4gICAgcmV0dXJuIGxvYWRJbWFnZSh1cmwsIGNyb3NzT3JpZ2luKVxuICB9XG4gIHJldHVybiBudWxsXG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGxvb3AgKG4sIGYpIHtcbiAgdmFyIHJlc3VsdCA9IEFycmF5KG4pXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbjsgKytpKSB7XG4gICAgcmVzdWx0W2ldID0gZihpKVxuICB9XG4gIHJldHVybiByZXN1bHRcbn1cbiIsIi8vIFJlZmVyZW5jZXM6XG4vL1xuLy8gaHR0cDovL21zZG4ubWljcm9zb2Z0LmNvbS9lbi11cy9saWJyYXJ5L2JiOTQzOTkxLmFzcHgvXG4vLyBodHRwOi8vYmxvZy50b2ppY29kZS5jb20vMjAxMS8xMi9jb21wcmVzc2VkLXRleHR1cmVzLWluLXdlYmdsLmh0bWxcbi8vXG5cblxubW9kdWxlLmV4cG9ydHMgPSBwYXJzZUREU1xuXG52YXIgRERTX01BR0lDID0gMHgyMDUzNDQ0NFxuXG52YXIgR0xfVEVYVFVSRV8yRCA9IDB4MERFMVxudmFyIEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCA9IDB4ODUxNVxuXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfUzNUQ19EWFQxX0VYVCA9IDB4ODNGMFxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDFfRVhUID0gMHg4M0YxXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUM19FWFQgPSAweDgzRjJcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQ1X0VYVCA9IDB4ODNGM1xuXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfRVRDMV9XRUJHTCA9IDB4OEQ2NFxuXG52YXIgR0xfVU5TSUdORURfQllURSA9IDB4MTQwMVxuLy8gdmFyIEdMX0hBTEZfRkxPQVRfT0VTID0gMHg4RDYxXG4vLyB2YXIgR0xfRkxPQVQgPSAweDE0MDZcblxudmFyIEREU0RfTUlQTUFQQ09VTlQgPSAweDIwMDAwXG5cbnZhciBERFNDQVBTMl9DVUJFTUFQID0gMHgyMDBcbnZhciBERFNDQVBTMl9DVUJFTUFQX1BPU0lUSVZFWCA9IDB4NDAwXG52YXIgRERTQ0FQUzJfQ1VCRU1BUF9ORUdBVElWRVggPSAweDgwMFxudmFyIEREU0NBUFMyX0NVQkVNQVBfUE9TSVRJVkVZID0gMHgxMDAwXG52YXIgRERTQ0FQUzJfQ1VCRU1BUF9ORUdBVElWRVkgPSAweDIwMDBcbnZhciBERFNDQVBTMl9DVUJFTUFQX1BPU0lUSVZFWiA9IDB4NDAwMFxudmFyIEREU0NBUFMyX0NVQkVNQVBfTkVHQVRJVkVaID0gMHg4MDAwXG5cbnZhciBDVUJFTUFQX0NPTVBMRVRFX0ZBQ0VTID0gKFxuICBERFNDQVBTMl9DVUJFTUFQX1BPU0lUSVZFWCB8XG4gIEREU0NBUFMyX0NVQkVNQVBfTkVHQVRJVkVYIHxcbiAgRERTQ0FQUzJfQ1VCRU1BUF9QT1NJVElWRVkgfFxuICBERFNDQVBTMl9DVUJFTUFQX05FR0FUSVZFWSB8XG4gIEREU0NBUFMyX0NVQkVNQVBfUE9TSVRJVkVaIHxcbiAgRERTQ0FQUzJfQ1VCRU1BUF9ORUdBVElWRVopXG5cbnZhciBERFBGX0ZPVVJDQyA9IDB4NFxudmFyIEREUEZfUkdCID0gMHg0MFxuXG52YXIgRk9VUkNDX0RYVDEgPSAweDMxNTQ1ODQ0XG52YXIgRk9VUkNDX0RYVDMgPSAweDMzNTQ1ODQ0XG52YXIgRk9VUkNDX0RYVDUgPSAweDM1NTQ1ODQ0XG52YXIgRk9VUkNDX0VUQzEgPSAweDMxNDM1NDQ1XG5cbi8vIEREU19IRUFERVIge1xudmFyIE9GRl9TSVpFID0gMSAgICAgICAgLy8gaW50MzIgZHdTaXplXG52YXIgT0ZGX0ZMQUdTID0gMiAgICAgICAvLyBpbnQzMiBkd0ZsYWdzXG52YXIgT0ZGX0hFSUdIVCA9IDMgICAgICAvLyBpbnQzMiBkd0hlaWdodFxudmFyIE9GRl9XSURUSCA9IDQgICAgICAgLy8gaW50MzIgZHdXaWR0aFxuLy8gdmFyIE9GRl9QSVRDSCA9IDUgICAgICAgLy8gaW50MzIgZHdQaXRjaE9yTGluZWFyU2l6ZVxuLy8gdmFyIE9GRl9ERVBUSCA9IDYgICAgICAgLy8gaW50MzIgZHdEZXB0aFxudmFyIE9GRl9NSVBNQVAgPSA3ICAgICAgLy8gaW50MzIgZHdNaXBNYXBDb3VudDsgLy8gb2Zmc2V0OiA3XG4vLyBpbnQzMlsxMV0gZHdSZXNlcnZlZDFcbi8vIEREU19QSVhFTEZPUk1BVCB7XG4vLyB2YXIgT0ZGX1BGX1NJWkUgPSAxOSAgICAvLyBpbnQzMiBkd1NpemU7IC8vIG9mZnNldDogMTlcbnZhciBPRkZfUEZfRkxBR1MgPSAyMCAgIC8vIGludDMyIGR3RmxhZ3NcbnZhciBPRkZfRk9VUkNDID0gMjEgICAgIC8vIGNoYXJbNF0gZHdGb3VyQ0Ncbi8vIHZhciBPRkZfUkdCQV9CSVRTID0gMjIgIC8vIGludDMyIGR3UkdCQml0Q291bnRcbi8vIHZhciBPRkZfUkVEX01BU0sgPSAyMyAgIC8vIGludDMyIGR3UkJpdE1hc2tcbi8vIHZhciBPRkZfR1JFRU5fTUFTSyA9IDI0IC8vIGludDMyIGR3R0JpdE1hc2tcbi8vIHZhciBPRkZfQkxVRV9NQVNLID0gMjUgIC8vIGludDMyIGR3QkJpdE1hc2tcbi8vIHZhciBPRkZfQUxQSEFfTUFTSyA9IDI2IC8vIGludDMyIGR3QUJpdE1hc2s7IC8vIG9mZnNldDogMjZcbi8vIH1cbi8vIHZhciBPRkZfQ0FQUyA9IDI3ICAgICAgIC8vIGludDMyIGR3Q2FwczsgLy8gb2Zmc2V0OiAyN1xudmFyIE9GRl9DQVBTMiA9IDI4ICAgICAgLy8gaW50MzIgZHdDYXBzMlxuLy8gdmFyIE9GRl9DQVBTMyA9IDI5ICAgICAgLy8gaW50MzIgZHdDYXBzM1xuLy8gdmFyIE9GRl9DQVBTNCA9IDMwICAgICAgLy8gaW50MzIgZHdDYXBzNFxuLy8gaW50MzIgZHdSZXNlcnZlZDIgLy8gb2Zmc2V0IDMxXG5cbmZ1bmN0aW9uIHBhcnNlRERTIChhcnJheUJ1ZmZlcikge1xuICB2YXIgaGVhZGVyID0gbmV3IEludDMyQXJyYXkoYXJyYXlCdWZmZXIpXG4gIFxuXG4gIHZhciBmbGFncyA9IGhlYWRlcltPRkZfRkxBR1NdXG4gIFxuXG4gIHZhciB3aWR0aCA9IGhlYWRlcltPRkZfV0lEVEhdXG4gIHZhciBoZWlnaHQgPSBoZWFkZXJbT0ZGX0hFSUdIVF1cblxuICB2YXIgdHlwZSA9IEdMX1VOU0lHTkVEX0JZVEVcbiAgdmFyIGZvcm1hdCA9IDBcbiAgdmFyIGJsb2NrQnl0ZXMgPSAwXG4gIHZhciBjaGFubmVscyA9IDRcbiAgc3dpdGNoIChoZWFkZXJbT0ZGX0ZPVVJDQ10pIHtcbiAgICBjYXNlIEZPVVJDQ19EWFQxOlxuICAgICAgYmxvY2tCeXRlcyA9IDhcbiAgICAgIGlmIChmbGFncyAmIEREUEZfUkdCKSB7XG4gICAgICAgIGNoYW5uZWxzID0gM1xuICAgICAgICBmb3JtYXQgPSBHTF9DT01QUkVTU0VEX1JHQl9TM1RDX0RYVDFfRVhUXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBmb3JtYXQgPSBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQxX0VYVFxuICAgICAgfVxuICAgICAgYnJlYWtcblxuICAgIGNhc2UgRk9VUkNDX0RYVDM6XG4gICAgICBibG9ja0J5dGVzID0gMTZcbiAgICAgIGZvcm1hdCA9IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDNfRVhUXG4gICAgICBicmVha1xuXG4gICAgY2FzZSBGT1VSQ0NfRFhUNTpcbiAgICAgIGJsb2NrQnl0ZXMgPSAxNlxuICAgICAgZm9ybWF0ID0gR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUNV9FWFRcbiAgICAgIGJyZWFrXG5cbiAgICBjYXNlIEZPVVJDQ19FVEMxOlxuICAgICAgYmxvY2tCeXRlcyA9IDhcbiAgICAgIGZvcm1hdCA9IEdMX0NPTVBSRVNTRURfUkdCX0VUQzFfV0VCR0xcbiAgICAgIGJyZWFrXG5cbiAgICAvLyBUT0RPOiBJbXBsZW1lbnQgaGRyIGFuZCB1bmNvbXByZXNzZWQgdGV4dHVyZXNcblxuICAgIGRlZmF1bHQ6XG4gICAgICAvLyBIYW5kbGUgdW5jb21wcmVzc2VkIGRhdGEgaGVyZVxuICAgICAgXG4gIH1cblxuICB2YXIgcGl4ZWxGbGFncyA9IGhlYWRlcltPRkZfUEZfRkxBR1NdXG5cbiAgdmFyIG1pcG1hcENvdW50ID0gMVxuICBpZiAocGl4ZWxGbGFncyAmIEREU0RfTUlQTUFQQ09VTlQpIHtcbiAgICBtaXBtYXBDb3VudCA9IE1hdGgubWF4KDEsIGhlYWRlcltPRkZfTUlQTUFQXSlcbiAgfVxuXG4gIHZhciBwdHIgPSBoZWFkZXJbT0ZGX1NJWkVdICsgNFxuXG4gIHZhciByZXN1bHQgPSB7XG4gICAgd2lkdGg6IHdpZHRoLFxuICAgIGhlaWdodDogaGVpZ2h0LFxuICAgIGNoYW5uZWxzOiBjaGFubmVscyxcbiAgICBmb3JtYXQ6IGZvcm1hdCxcbiAgICB0eXBlOiB0eXBlLFxuICAgIGNvbXByZXNzZWQ6IHRydWUsXG4gICAgY3ViZTogZmFsc2UsXG4gICAgcGl4ZWxzOiBbXVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VNaXBzICh0YXJnZXQpIHtcbiAgICB2YXIgbWlwV2lkdGggPSB3aWR0aFxuICAgIHZhciBtaXBIZWlnaHQgPSBoZWlnaHRcblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbWlwbWFwQ291bnQ7ICsraSkge1xuICAgICAgdmFyIHNpemUgPVxuICAgICAgICBNYXRoLm1heCgxLCAobWlwV2lkdGggKyAzKSA+PiAyKSAqXG4gICAgICAgIE1hdGgubWF4KDEsIChtaXBIZWlnaHQgKyAzKSA+PiAyKSAqXG4gICAgICAgIGJsb2NrQnl0ZXNcbiAgICAgIHJlc3VsdC5waXhlbHMucHVzaCh7XG4gICAgICAgIHRhcmdldDogdGFyZ2V0LFxuICAgICAgICBtaXBsZXZlbDogaSxcbiAgICAgICAgd2lkdGg6IG1pcFdpZHRoLFxuICAgICAgICBoZWlnaHQ6IG1pcEhlaWdodCxcbiAgICAgICAgZGF0YTogbmV3IFVpbnQ4QXJyYXkoYXJyYXlCdWZmZXIsIHB0ciwgc2l6ZSlcbiAgICAgIH0pXG4gICAgICBwdHIgKz0gc2l6ZVxuICAgICAgbWlwV2lkdGggPj49IDFcbiAgICAgIG1pcEhlaWdodCA+Pj0gMVxuICAgIH1cbiAgfVxuXG4gIHZhciBjYXBzMiA9IGhlYWRlcltPRkZfQ0FQUzJdXG4gIHZhciBjdWJlbWFwID0gISEoY2FwczIgJiBERFNDQVBTMl9DVUJFTUFQKVxuICBpZiAoY3ViZW1hcCkge1xuICAgIFxuICAgIHJlc3VsdC5jdWJlID0gdHJ1ZVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICBwYXJzZU1pcHMoR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YICsgaSlcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgcGFyc2VNaXBzKEdMX1RFWFRVUkVfMkQpXG4gIH1cblxuICByZXR1cm4gcmVzdWx0XG59XG4iLCIvKiBnbG9iYWxzIHJlcXVlc3RBbmltYXRpb25GcmFtZSwgY2FuY2VsQW5pbWF0aW9uRnJhbWUgKi9cbmlmICh0eXBlb2YgcmVxdWVzdEFuaW1hdGlvbkZyYW1lID09PSAnZnVuY3Rpb24nICYmXG4gICAgdHlwZW9mIGNhbmNlbEFuaW1hdGlvbkZyYW1lID09PSAnZnVuY3Rpb24nKSB7XG4gIG1vZHVsZS5leHBvcnRzID0ge1xuICAgIG5leHQ6IGZ1bmN0aW9uICh4KSB7IHJldHVybiByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoeCkgfSxcbiAgICBjYW5jZWw6IGZ1bmN0aW9uICh4KSB7IHJldHVybiBjYW5jZWxBbmltYXRpb25GcmFtZSh4KSB9XG4gIH1cbn0gZWxzZSB7XG4gIG1vZHVsZS5leHBvcnRzID0ge1xuICAgIG5leHQ6IGZ1bmN0aW9uIChjYikge1xuICAgICAgc2V0VGltZW91dChjYiwgMzApXG4gICAgfSxcbiAgICBjYW5jZWw6IGNsZWFyVGltZW91dFxuICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNvbnZlcnRUb0hhbGZGbG9hdCAoYXJyYXkpIHtcbiAgdmFyIGZsb2F0cyA9IG5ldyBGbG9hdDMyQXJyYXkoYXJyYXkpXG4gIHZhciB1aW50cyA9IG5ldyBVaW50MzJBcnJheShmbG9hdHMuYnVmZmVyKVxuICB2YXIgdXNob3J0cyA9IG5ldyBVaW50MTZBcnJheShhcnJheS5sZW5ndGgpXG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnJheS5sZW5ndGg7ICsraSkge1xuICAgIGlmIChpc05hTihhcnJheVtpXSkpIHtcbiAgICAgIHVzaG9ydHNbaV0gPSAweGZmZmZcbiAgICB9IGVsc2UgaWYgKGFycmF5W2ldID09PSBJbmZpbml0eSkge1xuICAgICAgdXNob3J0c1tpXSA9IDB4N2MwMFxuICAgIH0gZWxzZSBpZiAoYXJyYXlbaV0gPT09IC1JbmZpbml0eSkge1xuICAgICAgdXNob3J0c1tpXSA9IDB4ZmMwMFxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgeCA9IHVpbnRzW2ldXG5cbiAgICAgIHZhciBzZ24gPSAoeCA+Pj4gMzEpIDw8IDE1XG4gICAgICB2YXIgZXhwID0gKCh4IDw8IDEpID4+PiAyNCkgLSAxMjdcbiAgICAgIHZhciBmcmFjID0gKHggPj4gMTMpICYgKCgxIDw8IDEwKSAtIDEpXG5cbiAgICAgIGlmIChleHAgPCAtMjQpIHtcbiAgICAgICAgLy8gcm91bmQgbm9uLXJlcHJlc2VudGFibGUgZGVub3JtYWxzIHRvIDBcbiAgICAgICAgdXNob3J0c1tpXSA9IHNnblxuICAgICAgfSBlbHNlIGlmIChleHAgPCAtMTQpIHtcbiAgICAgICAgLy8gaGFuZGxlIGRlbm9ybWFsc1xuICAgICAgICB2YXIgcyA9IC0xNCAtIGV4cFxuICAgICAgICB1c2hvcnRzW2ldID0gc2duICsgKChmcmFjICsgKDEgPDwgMTApKSA+PiBzKVxuICAgICAgfSBlbHNlIGlmIChleHAgPiAxNSkge1xuICAgICAgICAvLyByb3VuZCBvdmVyZmxvdyB0byArLy0gSW5maW5pdHlcbiAgICAgICAgdXNob3J0c1tpXSA9IHNnbiArIDB4N2MwMFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gb3RoZXJ3aXNlIGNvbnZlcnQgZGlyZWN0bHlcbiAgICAgICAgdXNob3J0c1tpXSA9IHNnbiArICgoZXhwICsgMTUpIDw8IDEwKSArIGZyYWNcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gdXNob3J0c1xufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAob2JqKSB7XG4gIHJldHVybiBPYmplY3Qua2V5cyhvYmopLm1hcChmdW5jdGlvbiAoa2V5KSB7IHJldHVybiBvYmpba2V5XSB9KVxufVxuIiwiLy8gQ29udGV4dCBhbmQgY2FudmFzIGNyZWF0aW9uIGhlbHBlciBmdW5jdGlvbnNcbi8qZ2xvYmFscyBIVE1MRWxlbWVudCxXZWJHTFJlbmRlcmluZ0NvbnRleHQqL1xuXG5cbnZhciBleHRlbmQgPSByZXF1aXJlKCcuL3V0aWwvZXh0ZW5kJylcblxuZnVuY3Rpb24gY3JlYXRlQ2FudmFzIChlbGVtZW50LCBvcHRpb25zKSB7XG4gIHZhciBjYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKVxuICB2YXIgYXJncyA9IGdldENvbnRleHQoY2FudmFzLCBvcHRpb25zKVxuXG4gIGV4dGVuZChjYW52YXMuc3R5bGUsIHtcbiAgICBib3JkZXI6IDAsXG4gICAgbWFyZ2luOiAwLFxuICAgIHBhZGRpbmc6IDAsXG4gICAgdG9wOiAwLFxuICAgIGxlZnQ6IDBcbiAgfSlcbiAgZWxlbWVudC5hcHBlbmRDaGlsZChjYW52YXMpXG5cbiAgaWYgKGVsZW1lbnQgPT09IGRvY3VtZW50LmJvZHkpIHtcbiAgICBjYW52YXMuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnXG4gICAgZXh0ZW5kKGVsZW1lbnQuc3R5bGUsIHtcbiAgICAgIG1hcmdpbjogMCxcbiAgICAgIHBhZGRpbmc6IDBcbiAgICB9KVxuICB9XG5cbiAgdmFyIHNjYWxlID0gK2FyZ3Mub3B0aW9ucy5waXhlbFJhdGlvXG4gIGZ1bmN0aW9uIHJlc2l6ZSAoKSB7XG4gICAgdmFyIHcgPSB3aW5kb3cuaW5uZXJXaWR0aFxuICAgIHZhciBoID0gd2luZG93LmlubmVySGVpZ2h0XG4gICAgaWYgKGVsZW1lbnQgIT09IGRvY3VtZW50LmJvZHkpIHtcbiAgICAgIHZhciBib3VuZHMgPSBlbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpXG4gICAgICB3ID0gYm91bmRzLnJpZ2h0IC0gYm91bmRzLmxlZnRcbiAgICAgIGggPSBib3VuZHMudG9wIC0gYm91bmRzLmJvdHRvbVxuICAgIH1cbiAgICBjYW52YXMud2lkdGggPSBzY2FsZSAqIHdcbiAgICBjYW52YXMuaGVpZ2h0ID0gc2NhbGUgKiBoXG4gICAgZXh0ZW5kKGNhbnZhcy5zdHlsZSwge1xuICAgICAgd2lkdGg6IHcgKyAncHgnLFxuICAgICAgaGVpZ2h0OiBoICsgJ3B4J1xuICAgIH0pXG4gIH1cblxuICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgcmVzaXplLCBmYWxzZSlcblxuICB2YXIgcHJldkRlc3Ryb3kgPSBhcmdzLm9wdGlvbnMub25EZXN0cm95XG4gIGFyZ3Mub3B0aW9ucyA9IGV4dGVuZChleHRlbmQoe30sIGFyZ3Mub3B0aW9ucyksIHtcbiAgICBvbkRlc3Ryb3k6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdyZXNpemUnLCByZXNpemUpXG4gICAgICBlbGVtZW50LnJlbW92ZUNoaWxkKGNhbnZhcylcbiAgICAgIHByZXZEZXN0cm95ICYmIHByZXZEZXN0cm95KClcbiAgICB9XG4gIH0pXG5cbiAgcmVzaXplKClcblxuICByZXR1cm4gYXJnc1xufVxuXG5mdW5jdGlvbiBnZXRDb250ZXh0IChjYW52YXMsIG9wdGlvbnMpIHtcbiAgdmFyIGdsT3B0aW9ucyA9IG9wdGlvbnMuZ2xPcHRpb25zIHx8IHt9XG5cbiAgZnVuY3Rpb24gZ2V0IChuYW1lKSB7XG4gICAgdHJ5IHtcbiAgICAgIHJldHVybiBjYW52YXMuZ2V0Q29udGV4dChuYW1lLCBnbE9wdGlvbnMpXG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG4gIH1cblxuICB2YXIgZ2wgPSBnZXQoJ3dlYmdsJykgfHxcbiAgICAgICAgICAgZ2V0KCdleHBlcmltZW50YWwtd2ViZ2wnKSB8fFxuICAgICAgICAgICBnZXQoJ3dlYmdsLWV4cGVyaW1lbnRhbCcpXG5cbiAgXG5cbiAgcmV0dXJuIHtcbiAgICBnbDogZ2wsXG4gICAgb3B0aW9uczogZXh0ZW5kKHtcbiAgICAgIHBpeGVsUmF0aW86IHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvXG4gICAgfSwgb3B0aW9ucylcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHBhcnNlQXJncyAoYXJncykge1xuICBpZiAodHlwZW9mIGRvY3VtZW50ID09PSAndW5kZWZpbmVkJyB8fFxuICAgICAgdHlwZW9mIEhUTUxFbGVtZW50ID09PSAndW5kZWZpbmVkJykge1xuICAgIHJldHVybiB7XG4gICAgICBnbDogYXJnc1swXSxcbiAgICAgIG9wdGlvbnM6IGFyZ3NbMV0gfHwge31cbiAgICB9XG4gIH1cblxuICB2YXIgZWxlbWVudCA9IGRvY3VtZW50LmJvZHlcbiAgdmFyIG9wdGlvbnMgPSBhcmdzWzFdIHx8IHt9XG5cbiAgaWYgKHR5cGVvZiBhcmdzWzBdID09PSAnc3RyaW5nJykge1xuICAgIGVsZW1lbnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGFyZ3NbMF0pIHx8IGRvY3VtZW50LmJvZHlcbiAgfSBlbHNlIGlmICh0eXBlb2YgYXJnc1swXSA9PT0gJ29iamVjdCcpIHtcbiAgICBpZiAoYXJnc1swXSBpbnN0YW5jZW9mIEhUTUxFbGVtZW50KSB7XG4gICAgICBlbGVtZW50ID0gYXJnc1swXVxuICAgIH0gZWxzZSBpZiAoYXJnc1swXSBpbnN0YW5jZW9mIFdlYkdMUmVuZGVyaW5nQ29udGV4dCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgZ2w6IGFyZ3NbMF0sXG4gICAgICAgIG9wdGlvbnM6IGV4dGVuZCh7XG4gICAgICAgICAgcGl4ZWxSYXRpbzogMVxuICAgICAgICB9LCBvcHRpb25zKVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBvcHRpb25zID0gYXJnc1swXVxuICAgIH1cbiAgfVxuXG4gIGlmIChlbGVtZW50Lm5vZGVOYW1lICYmIGVsZW1lbnQubm9kZU5hbWUudG9VcHBlckNhc2UoKSA9PT0gJ0NBTlZBUycpIHtcbiAgICByZXR1cm4gZ2V0Q29udGV4dChlbGVtZW50LCBvcHRpb25zKVxuICB9IGVsc2Uge1xuICAgIHJldHVybiBjcmVhdGVDYW52YXMoZWxlbWVudCwgb3B0aW9ucylcbiAgfVxufVxuIiwiJ3VzZSBzdHJpY3QnXG5cbm1vZHVsZS5leHBvcnRzID0gbW91c2VMaXN0ZW5cblxudmFyIG1vdXNlID0gcmVxdWlyZSgnbW91c2UtZXZlbnQnKVxuXG5mdW5jdGlvbiBtb3VzZUxpc3RlbihlbGVtZW50LCBjYWxsYmFjaykge1xuICBpZighY2FsbGJhY2spIHtcbiAgICBjYWxsYmFjayA9IGVsZW1lbnRcbiAgICBlbGVtZW50ID0gd2luZG93XG4gIH1cblxuICB2YXIgYnV0dG9uU3RhdGUgPSAwXG4gIHZhciB4ID0gMFxuICB2YXIgeSA9IDBcbiAgdmFyIG1vZHMgPSB7XG4gICAgc2hpZnQ6ICAgZmFsc2UsXG4gICAgYWx0OiAgICAgZmFsc2UsXG4gICAgY29udHJvbDogZmFsc2UsXG4gICAgbWV0YTogICAgZmFsc2VcbiAgfVxuICB2YXIgYXR0YWNoZWQgPSBmYWxzZVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZU1vZHMoZXYpIHtcbiAgICB2YXIgY2hhbmdlZCA9IGZhbHNlXG4gICAgaWYoJ2FsdEtleScgaW4gZXYpIHtcbiAgICAgIGNoYW5nZWQgPSBjaGFuZ2VkIHx8IGV2LmFsdEtleSAhPT0gbW9kcy5hbHRcbiAgICAgIG1vZHMuYWx0ID0gISFldi5hbHRLZXlcbiAgICB9XG4gICAgaWYoJ3NoaWZ0S2V5JyBpbiBldikge1xuICAgICAgY2hhbmdlZCA9IGNoYW5nZWQgfHwgZXYuc2hpZnRLZXkgIT09IG1vZHMuc2hpZnRcbiAgICAgIG1vZHMuc2hpZnQgPSAhIWV2LnNoaWZ0S2V5XG4gICAgfVxuICAgIGlmKCdjdHJsS2V5JyBpbiBldikge1xuICAgICAgY2hhbmdlZCA9IGNoYW5nZWQgfHwgZXYuY3RybEtleSAhPT0gbW9kcy5jb250cm9sXG4gICAgICBtb2RzLmNvbnRyb2wgPSAhIWV2LmN0cmxLZXlcbiAgICB9XG4gICAgaWYoJ21ldGFLZXknIGluIGV2KSB7XG4gICAgICBjaGFuZ2VkID0gY2hhbmdlZCB8fCBldi5tZXRhS2V5ICE9PSBtb2RzLm1ldGFcbiAgICAgIG1vZHMubWV0YSA9ICEhZXYubWV0YUtleVxuICAgIH1cbiAgICByZXR1cm4gY2hhbmdlZFxuICB9XG5cbiAgZnVuY3Rpb24gaGFuZGxlRXZlbnQobmV4dEJ1dHRvbnMsIGV2KSB7XG4gICAgdmFyIG5leHRYID0gbW91c2UueChldilcbiAgICB2YXIgbmV4dFkgPSBtb3VzZS55KGV2KVxuICAgIGlmKCdidXR0b25zJyBpbiBldikge1xuICAgICAgbmV4dEJ1dHRvbnMgPSBldi5idXR0b25zfDBcbiAgICB9XG4gICAgaWYobmV4dEJ1dHRvbnMgIT09IGJ1dHRvblN0YXRlIHx8XG4gICAgICAgbmV4dFggIT09IHggfHxcbiAgICAgICBuZXh0WSAhPT0geSB8fFxuICAgICAgIHVwZGF0ZU1vZHMoZXYpKSB7XG4gICAgICBidXR0b25TdGF0ZSA9IG5leHRCdXR0b25zfDBcbiAgICAgIHggPSBuZXh0WHx8MFxuICAgICAgeSA9IG5leHRZfHwwXG4gICAgICBjYWxsYmFjayAmJiBjYWxsYmFjayhidXR0b25TdGF0ZSwgeCwgeSwgbW9kcylcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBjbGVhclN0YXRlKGV2KSB7XG4gICAgaGFuZGxlRXZlbnQoMCwgZXYpXG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVCbHVyKCkge1xuICAgIGlmKGJ1dHRvblN0YXRlIHx8XG4gICAgICB4IHx8XG4gICAgICB5IHx8XG4gICAgICBtb2RzLnNoaWZ0IHx8XG4gICAgICBtb2RzLmFsdCB8fFxuICAgICAgbW9kcy5tZXRhIHx8XG4gICAgICBtb2RzLmNvbnRyb2wpIHtcblxuICAgICAgeCA9IHkgPSAwXG4gICAgICBidXR0b25TdGF0ZSA9IDBcbiAgICAgIG1vZHMuc2hpZnQgPSBtb2RzLmFsdCA9IG1vZHMuY29udHJvbCA9IG1vZHMubWV0YSA9IGZhbHNlXG4gICAgICBjYWxsYmFjayAmJiBjYWxsYmFjaygwLCAwLCAwLCBtb2RzKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZU1vZHMoZXYpIHtcbiAgICBpZih1cGRhdGVNb2RzKGV2KSkge1xuICAgICAgY2FsbGJhY2sgJiYgY2FsbGJhY2soYnV0dG9uU3RhdGUsIHgsIHksIG1vZHMpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaGFuZGxlTW91c2VNb3ZlKGV2KSB7XG4gICAgaWYobW91c2UuYnV0dG9ucyhldikgPT09IDApIHtcbiAgICAgIGhhbmRsZUV2ZW50KDAsIGV2KVxuICAgIH0gZWxzZSB7XG4gICAgICBoYW5kbGVFdmVudChidXR0b25TdGF0ZSwgZXYpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaGFuZGxlTW91c2VEb3duKGV2KSB7XG4gICAgaGFuZGxlRXZlbnQoYnV0dG9uU3RhdGUgfCBtb3VzZS5idXR0b25zKGV2KSwgZXYpXG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVNb3VzZVVwKGV2KSB7XG4gICAgaGFuZGxlRXZlbnQoYnV0dG9uU3RhdGUgJiB+bW91c2UuYnV0dG9ucyhldiksIGV2KVxuICB9XG5cbiAgZnVuY3Rpb24gYXR0YWNoTGlzdGVuZXJzKCkge1xuICAgIGlmKGF0dGFjaGVkKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgYXR0YWNoZWQgPSB0cnVlXG5cbiAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIGhhbmRsZU1vdXNlTW92ZSlcblxuICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgaGFuZGxlTW91c2VEb3duKVxuXG4gICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZXVwJywgaGFuZGxlTW91c2VVcClcblxuICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VsZWF2ZScsIGNsZWFyU3RhdGUpXG4gICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWVudGVyJywgY2xlYXJTdGF0ZSlcbiAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlb3V0JywgY2xlYXJTdGF0ZSlcbiAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlb3ZlcicsIGNsZWFyU3RhdGUpXG5cbiAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2JsdXInLCBoYW5kbGVCbHVyKVxuXG4gICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXl1cCcsIGhhbmRsZU1vZHMpXG4gICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgaGFuZGxlTW9kcylcbiAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXByZXNzJywgaGFuZGxlTW9kcylcblxuICAgIGlmKGVsZW1lbnQgIT09IHdpbmRvdykge1xuICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2JsdXInLCBoYW5kbGVCbHVyKVxuXG4gICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5dXAnLCBoYW5kbGVNb2RzKVxuICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBoYW5kbGVNb2RzKVxuICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXByZXNzJywgaGFuZGxlTW9kcylcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBkZXRhY2hMaXN0ZW5lcnMoKSB7XG4gICAgaWYoIWF0dGFjaGVkKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgYXR0YWNoZWQgPSBmYWxzZVxuXG4gICAgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCBoYW5kbGVNb3VzZU1vdmUpXG5cbiAgICBlbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIGhhbmRsZU1vdXNlRG93bilcblxuICAgIGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW91c2V1cCcsIGhhbmRsZU1vdXNlVXApXG5cbiAgICBlbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNlbGVhdmUnLCBjbGVhclN0YXRlKVxuICAgIGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW91c2VlbnRlcicsIGNsZWFyU3RhdGUpXG4gICAgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZW91dCcsIGNsZWFyU3RhdGUpXG4gICAgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZW92ZXInLCBjbGVhclN0YXRlKVxuXG4gICAgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdibHVyJywgaGFuZGxlQmx1cilcblxuICAgIGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcigna2V5dXAnLCBoYW5kbGVNb2RzKVxuICAgIGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIGhhbmRsZU1vZHMpXG4gICAgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdrZXlwcmVzcycsIGhhbmRsZU1vZHMpXG5cbiAgICBpZihlbGVtZW50ICE9PSB3aW5kb3cpIHtcbiAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdibHVyJywgaGFuZGxlQmx1cilcblxuICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleXVwJywgaGFuZGxlTW9kcylcbiAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdrZXlkb3duJywgaGFuZGxlTW9kcylcbiAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdrZXlwcmVzcycsIGhhbmRsZU1vZHMpXG4gICAgfVxuICB9XG5cbiAgLy9BdHRhY2ggbGlzdGVuZXJzXG4gIGF0dGFjaExpc3RlbmVycygpXG5cbiAgdmFyIHJlc3VsdCA9IHtcbiAgICBlbGVtZW50OiBlbGVtZW50XG4gIH1cblxuICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyhyZXN1bHQsIHtcbiAgICBlbmFibGVkOiB7XG4gICAgICBnZXQ6IGZ1bmN0aW9uKCkgeyByZXR1cm4gYXR0YWNoZWQgfSxcbiAgICAgIHNldDogZnVuY3Rpb24oZikge1xuICAgICAgICBpZihmKSB7XG4gICAgICAgICAgYXR0YWNoTGlzdGVuZXJzKClcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBkZXRhY2hMaXN0ZW5lcnNcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIGVudW1lcmFibGU6IHRydWVcbiAgICB9LFxuICAgIGJ1dHRvbnM6IHtcbiAgICAgIGdldDogZnVuY3Rpb24oKSB7IHJldHVybiBidXR0b25TdGF0ZSB9LFxuICAgICAgZW51bWVyYWJsZTogdHJ1ZVxuICAgIH0sXG4gICAgeDoge1xuICAgICAgZ2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIHggfSxcbiAgICAgIGVudW1lcmFibGU6IHRydWVcbiAgICB9LFxuICAgIHk6IHtcbiAgICAgIGdldDogZnVuY3Rpb24oKSB7IHJldHVybiB5IH0sXG4gICAgICBlbnVtZXJhYmxlOiB0cnVlXG4gICAgfSxcbiAgICBtb2RzOiB7XG4gICAgICBnZXQ6IGZ1bmN0aW9uKCkgeyByZXR1cm4gbW9kcyB9LFxuICAgICAgZW51bWVyYWJsZTogdHJ1ZVxuICAgIH1cbiAgfSlcblxuICByZXR1cm4gcmVzdWx0XG59XG4iLCIndXNlIHN0cmljdCdcblxuZnVuY3Rpb24gbW91c2VCdXR0b25zKGV2KSB7XG4gIGlmKHR5cGVvZiBldiA9PT0gJ29iamVjdCcpIHtcbiAgICBpZignYnV0dG9ucycgaW4gZXYpIHtcbiAgICAgIHJldHVybiBldi5idXR0b25zXG4gICAgfSBlbHNlIGlmKCd3aGljaCcgaW4gZXYpIHtcbiAgICAgIHZhciBiID0gZXYud2hpY2hcbiAgICAgIGlmKGIgPT09IDIpIHtcbiAgICAgICAgcmV0dXJuIDRcbiAgICAgIH0gZWxzZSBpZihiID09PSAzKSB7XG4gICAgICAgIHJldHVybiAyXG4gICAgICB9IGVsc2UgaWYoYiA+IDApIHtcbiAgICAgICAgcmV0dXJuIDE8PChiLTEpXG4gICAgICB9XG4gICAgfSBlbHNlIGlmKCdidXR0b24nIGluIGV2KSB7XG4gICAgICB2YXIgYiA9IGV2LmJ1dHRvblxuICAgICAgaWYoYiA9PT0gMSkge1xuICAgICAgICByZXR1cm4gNFxuICAgICAgfSBlbHNlIGlmKGIgPT09IDIpIHtcbiAgICAgICAgcmV0dXJuIDJcbiAgICAgIH0gZWxzZSBpZihiID49IDApIHtcbiAgICAgICAgcmV0dXJuIDE8PGJcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIDBcbn1cbmV4cG9ydHMuYnV0dG9ucyA9IG1vdXNlQnV0dG9uc1xuXG5mdW5jdGlvbiBtb3VzZUVsZW1lbnQoZXYpIHtcbiAgcmV0dXJuIGV2LnRhcmdldCB8fCBldi5zcmNFbGVtZW50IHx8IHdpbmRvd1xufVxuZXhwb3J0cy5lbGVtZW50ID0gbW91c2VFbGVtZW50XG5cbmZ1bmN0aW9uIG1vdXNlUmVsYXRpdmVYKGV2KSB7XG4gIGlmKHR5cGVvZiBldiA9PT0gJ29iamVjdCcpIHtcbiAgICBpZignb2Zmc2V0WCcgaW4gZXYpIHtcbiAgICAgIHJldHVybiBldi5vZmZzZXRYXG4gICAgfVxuICAgIHZhciB0YXJnZXQgPSBtb3VzZUVsZW1lbnQoZXYpXG4gICAgdmFyIGJvdW5kcyA9IHRhcmdldC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKVxuICAgIHJldHVybiBldi5jbGllbnRYIC0gYm91bmRzLmxlZnRcbiAgfVxuICByZXR1cm4gMFxufVxuZXhwb3J0cy54ID0gbW91c2VSZWxhdGl2ZVhcblxuZnVuY3Rpb24gbW91c2VSZWxhdGl2ZVkoZXYpIHtcbiAgaWYodHlwZW9mIGV2ID09PSAnb2JqZWN0Jykge1xuICAgIGlmKCdvZmZzZXRZJyBpbiBldikge1xuICAgICAgcmV0dXJuIGV2Lm9mZnNldFlcbiAgICB9XG4gICAgdmFyIHRhcmdldCA9IG1vdXNlRWxlbWVudChldilcbiAgICB2YXIgYm91bmRzID0gdGFyZ2V0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpXG4gICAgcmV0dXJuIGV2LmNsaWVudFkgLSBib3VuZHMudG9wXG4gIH1cbiAgcmV0dXJuIDBcbn1cbmV4cG9ydHMueSA9IG1vdXNlUmVsYXRpdmVZXG4iLCJcbnZhciBleHRlbmQgPSByZXF1aXJlKCcuL2xpYi91dGlsL2V4dGVuZCcpXG52YXIgZHluYW1pYyA9IHJlcXVpcmUoJy4vbGliL2R5bmFtaWMnKVxudmFyIHJhZiA9IHJlcXVpcmUoJy4vbGliL3V0aWwvcmFmJylcbnZhciBjbG9jayA9IHJlcXVpcmUoJy4vbGliL3V0aWwvY2xvY2snKVxudmFyIGNyZWF0ZVN0cmluZ1N0b3JlID0gcmVxdWlyZSgnLi9saWIvc3RyaW5ncycpXG52YXIgaW5pdFdlYkdMID0gcmVxdWlyZSgnLi9saWIvd2ViZ2wnKVxudmFyIHdyYXBFeHRlbnNpb25zID0gcmVxdWlyZSgnLi9saWIvZXh0ZW5zaW9uJylcbnZhciB3cmFwTGltaXRzID0gcmVxdWlyZSgnLi9saWIvbGltaXRzJylcbnZhciB3cmFwQnVmZmVycyA9IHJlcXVpcmUoJy4vbGliL2J1ZmZlcicpXG52YXIgd3JhcEVsZW1lbnRzID0gcmVxdWlyZSgnLi9saWIvZWxlbWVudHMnKVxudmFyIHdyYXBUZXh0dXJlcyA9IHJlcXVpcmUoJy4vbGliL3RleHR1cmUnKVxudmFyIHdyYXBSZW5kZXJidWZmZXJzID0gcmVxdWlyZSgnLi9saWIvcmVuZGVyYnVmZmVyJylcbnZhciB3cmFwRnJhbWVidWZmZXJzID0gcmVxdWlyZSgnLi9saWIvZnJhbWVidWZmZXInKVxudmFyIHdyYXBBdHRyaWJ1dGVzID0gcmVxdWlyZSgnLi9saWIvYXR0cmlidXRlJylcbnZhciB3cmFwU2hhZGVycyA9IHJlcXVpcmUoJy4vbGliL3NoYWRlcicpXG52YXIgd3JhcFJlYWQgPSByZXF1aXJlKCcuL2xpYi9yZWFkJylcbnZhciBjcmVhdGVDb3JlID0gcmVxdWlyZSgnLi9saWIvY29yZScpXG5cbnZhciBHTF9DT0xPUl9CVUZGRVJfQklUID0gMTYzODRcbnZhciBHTF9ERVBUSF9CVUZGRVJfQklUID0gMjU2XG52YXIgR0xfU1RFTkNJTF9CVUZGRVJfQklUID0gMTAyNFxuXG52YXIgR0xfQVJSQVlfQlVGRkVSID0gMzQ5NjJcbnZhciBHTF9URVhUVVJFXzJEID0gMHgwREUxXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUCA9IDB4ODUxM1xuXG52YXIgQ09OVEVYVF9MT1NUX0VWRU5UID0gJ3dlYmdsY29udGV4dGxvc3QnXG52YXIgQ09OVEVYVF9SRVNUT1JFRF9FVkVOVCA9ICd3ZWJnbGNvbnRleHRyZXN0b3JlZCdcblxudmFyIERZTl9QUk9QID0gMVxudmFyIERZTl9DT05URVhUID0gMlxudmFyIERZTl9TVEFURSA9IDNcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwUkVHTCAoKSB7XG4gIHZhciBhcmdzID0gaW5pdFdlYkdMKEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cykpXG4gIHZhciBnbCA9IGFyZ3MuZ2xcbiAgdmFyIG9wdGlvbnMgPSBhcmdzLm9wdGlvbnNcblxuICB2YXIgc3RyaW5nU3RvcmUgPSBjcmVhdGVTdHJpbmdTdG9yZSgpXG5cbiAgdmFyIGV4dGVuc2lvblN0YXRlID0gd3JhcEV4dGVuc2lvbnMoZ2wpXG4gIHZhciBleHRlbnNpb25zID0gZXh0ZW5zaW9uU3RhdGUuZXh0ZW5zaW9uc1xuXG4gIHZhciBTVEFSVF9USU1FID0gY2xvY2soKVxuICB2YXIgTEFTVF9USU1FID0gU1RBUlRfVElNRVxuICB2YXIgV0lEVEggPSBnbC5kcmF3aW5nQnVmZmVyV2lkdGhcbiAgdmFyIEhFSUdIVCA9IGdsLmRyYXdpbmdCdWZmZXJIZWlnaHRcblxuICB2YXIgY29udGV4dFN0YXRlID0ge1xuICAgIGNvdW50OiAwLFxuICAgIGRlbHRhVGltZTogMCxcbiAgICB0aW1lOiAwLFxuICAgIHZpZXdwb3J0V2lkdGg6IFdJRFRILFxuICAgIHZpZXdwb3J0SGVpZ2h0OiBIRUlHSFQsXG4gICAgZnJhbWVidWZmZXJXaWR0aDogV0lEVEgsXG4gICAgZnJhbWVidWZmZXJIZWlnaHQ6IEhFSUdIVCxcbiAgICBkcmF3aW5nQnVmZmVyV2lkdGg6IFdJRFRILFxuICAgIGRyYXdpbmdCdWZmZXJIZWlnaHQ6IEhFSUdIVCxcbiAgICBwaXhlbFJhdGlvOiBvcHRpb25zLnBpeGVsUmF0aW9cbiAgfVxuICB2YXIgdW5pZm9ybVN0YXRlID0ge31cbiAgdmFyIGRyYXdTdGF0ZSA9IHtcbiAgICBlbGVtZW50czogbnVsbCxcbiAgICBwcmltaXRpdmU6IDQsIC8vIEdMX1RSSUFOR0xFU1xuICAgIGNvdW50OiAtMSxcbiAgICBvZmZzZXQ6IDAsXG4gICAgaW5zdGFuY2VzOiAtMVxuICB9XG5cbiAgdmFyIGxpbWl0cyA9IHdyYXBMaW1pdHMoZ2wsIGV4dGVuc2lvbnMpXG4gIHZhciBidWZmZXJTdGF0ZSA9IHdyYXBCdWZmZXJzKGdsKVxuICB2YXIgZWxlbWVudFN0YXRlID0gd3JhcEVsZW1lbnRzKGdsLCBleHRlbnNpb25zLCBidWZmZXJTdGF0ZSlcbiAgdmFyIGF0dHJpYnV0ZVN0YXRlID0gd3JhcEF0dHJpYnV0ZXMoXG4gICAgZ2wsXG4gICAgZXh0ZW5zaW9ucyxcbiAgICBsaW1pdHMsXG4gICAgYnVmZmVyU3RhdGUsXG4gICAgc3RyaW5nU3RvcmUpXG4gIHZhciBzaGFkZXJTdGF0ZSA9IHdyYXBTaGFkZXJzKGdsLCBzdHJpbmdTdG9yZSlcbiAgdmFyIHRleHR1cmVTdGF0ZSA9IHdyYXBUZXh0dXJlcyhcbiAgICBnbCxcbiAgICBleHRlbnNpb25zLFxuICAgIGxpbWl0cyxcbiAgICBwb2xsLFxuICAgIGNvbnRleHRTdGF0ZSlcbiAgdmFyIHJlbmRlcmJ1ZmZlclN0YXRlID0gd3JhcFJlbmRlcmJ1ZmZlcnMoZ2wsIGV4dGVuc2lvbnMsIGxpbWl0cylcbiAgdmFyIGZyYW1lYnVmZmVyU3RhdGUgPSB3cmFwRnJhbWVidWZmZXJzKFxuICAgIGdsLFxuICAgIGV4dGVuc2lvbnMsXG4gICAgbGltaXRzLFxuICAgIHRleHR1cmVTdGF0ZSxcbiAgICByZW5kZXJidWZmZXJTdGF0ZSlcbiAgdmFyIHJlYWRQaXhlbHMgPSB3cmFwUmVhZChnbCwgcG9sbCwgY29udGV4dFN0YXRlKVxuXG4gIHZhciBjb3JlID0gY3JlYXRlQ29yZShcbiAgICBnbCxcbiAgICBzdHJpbmdTdG9yZSxcbiAgICBleHRlbnNpb25zLFxuICAgIGxpbWl0cyxcbiAgICBidWZmZXJTdGF0ZSxcbiAgICBlbGVtZW50U3RhdGUsXG4gICAgdGV4dHVyZVN0YXRlLFxuICAgIGZyYW1lYnVmZmVyU3RhdGUsXG4gICAgdW5pZm9ybVN0YXRlLFxuICAgIGF0dHJpYnV0ZVN0YXRlLFxuICAgIHNoYWRlclN0YXRlLFxuICAgIGRyYXdTdGF0ZSxcbiAgICBjb250ZXh0U3RhdGUpXG5cbiAgdmFyIG5leHRTdGF0ZSA9IGNvcmUubmV4dFxuICB2YXIgY2FudmFzID0gZ2wuY2FudmFzXG5cbiAgdmFyIHJhZkNhbGxiYWNrcyA9IFtdXG4gIHZhciBhY3RpdmVSQUYgPSAwXG4gIGZ1bmN0aW9uIGhhbmRsZVJBRiAoKSB7XG4gICAgLy8gc2NoZWR1bGUgbmV4dCBhbmltYXRpb24gZnJhbWVcbiAgICBhY3RpdmVSQUYgPSByYWYubmV4dChoYW5kbGVSQUYpXG5cbiAgICAvLyBpbmNyZW1lbnQgZnJhbWUgY291blxuICAgIGNvbnRleHRTdGF0ZS5jb3VudCArPSAxXG5cbiAgICAvLyByZXNldCB2aWV3cG9ydFxuICAgIHZhciB2aWV3cG9ydCA9IG5leHRTdGF0ZS52aWV3cG9ydFxuICAgIHZhciBzY2lzc29yQm94ID0gbmV4dFN0YXRlLnNjaXNzb3JfYm94XG4gICAgdmlld3BvcnRbMF0gPSB2aWV3cG9ydFsxXSA9IHNjaXNzb3JCb3hbMF0gPSBzY2lzc29yQm94WzFdID0gMFxuXG4gICAgY29udGV4dFN0YXRlLnZpZXdwb3J0V2lkdGggPVxuICAgICAgY29udGV4dFN0YXRlLmZyYW1lQnVmZmVyV2lkdGggPVxuICAgICAgY29udGV4dFN0YXRlLmRyYXdpbmdCdWZmZXJXaWR0aCA9XG4gICAgICB2aWV3cG9ydFsyXSA9XG4gICAgICBzY2lzc29yQm94WzJdID0gZ2wuZHJhd2luZ0J1ZmZlcldpZHRoXG4gICAgY29udGV4dFN0YXRlLnZpZXdwb3J0SGVpZ2h0ID1cbiAgICAgIGNvbnRleHRTdGF0ZS5mcmFtZUJ1ZmZlcldpZHRoID1cbiAgICAgIGNvbnRleHRTdGF0ZS5kcmF3aW5nQnVmZmVySGVpZ2h0ID1cbiAgICAgIHZpZXdwb3J0WzNdID1cbiAgICAgIHNjaXNzb3JCb3hbM10gPSBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0XG5cbiAgICB2YXIgbm93ID0gY2xvY2soKVxuICAgIGNvbnRleHRTdGF0ZS5kZWx0YVRpbWUgPSAobm93IC0gTEFTVF9USU1FKSAvIDEwMDAuMFxuICAgIGNvbnRleHRTdGF0ZS50aW1lID0gKG5vdyAtIFNUQVJUX1RJTUUpIC8gMTAwMC4wXG4gICAgTEFTVF9USU1FID0gbm93XG5cbiAgICBjb3JlLnByb2NzLnJlZnJlc2goKVxuICAgIHRleHR1cmVTdGF0ZS5wb2xsKClcblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmFmQ2FsbGJhY2tzLmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgY2IgPSByYWZDYWxsYmFja3NbaV1cbiAgICAgIGNiKGNvbnRleHRTdGF0ZSwgbnVsbCwgMClcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzdGFydFJBRiAoKSB7XG4gICAgaWYgKCFhY3RpdmVSQUYgJiYgcmFmQ2FsbGJhY2tzLmxlbmd0aCA+IDApIHtcbiAgICAgIGhhbmRsZVJBRigpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc3RvcFJBRiAoKSB7XG4gICAgaWYgKGFjdGl2ZVJBRikge1xuICAgICAgcmFmLmNhbmNlbChoYW5kbGVSQUYpXG4gICAgICBhY3RpdmVSQUYgPSAwXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaGFuZGxlQ29udGV4dExvc3MgKGV2ZW50KSB7XG4gICAgc3RvcFJBRigpXG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKVxuICAgIGlmIChvcHRpb25zLm9uQ29udGV4dExvc3QpIHtcbiAgICAgIG9wdGlvbnMub25Db250ZXh0TG9zdCgpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaGFuZGxlQ29udGV4dFJlc3RvcmVkIChldmVudCkge1xuICAgIGdsLmdldEVycm9yKClcbiAgICBleHRlbnNpb25TdGF0ZS5yZWZyZXNoKClcbiAgICBjb3JlLnByb2NzLnJlZnJlc2goKVxuICAgIGJ1ZmZlclN0YXRlLnJlZnJlc2goKVxuICAgIHRleHR1cmVTdGF0ZS5yZWZyZXNoKClcbiAgICByZW5kZXJidWZmZXJTdGF0ZS5yZWZyZXNoKClcbiAgICBmcmFtZWJ1ZmZlclN0YXRlLnJlZnJlc2goKVxuICAgIHNoYWRlclN0YXRlLnJlZnJlc2goKVxuICAgIGlmIChvcHRpb25zLm9uQ29udGV4dFJlc3RvcmVkKSB7XG4gICAgICBvcHRpb25zLm9uQ29udGV4dFJlc3RvcmVkKClcbiAgICB9XG4gICAgaGFuZGxlUkFGKClcbiAgfVxuXG4gIGlmIChjYW52YXMpIHtcbiAgICBjYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihDT05URVhUX0xPU1RfRVZFTlQsIGhhbmRsZUNvbnRleHRMb3NzLCBmYWxzZSlcbiAgICBjYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihDT05URVhUX1JFU1RPUkVEX0VWRU5ULCBoYW5kbGVDb250ZXh0UmVzdG9yZWQsIGZhbHNlKVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSAoKSB7XG4gICAgc3RvcFJBRigpXG5cbiAgICBpZiAoY2FudmFzKSB7XG4gICAgICBjYW52YXMucmVtb3ZlRXZlbnRMaXN0ZW5lcihDT05URVhUX0xPU1RfRVZFTlQsIGhhbmRsZUNvbnRleHRMb3NzKVxuICAgICAgY2FudmFzLnJlbW92ZUV2ZW50TGlzdGVuZXIoQ09OVEVYVF9SRVNUT1JFRF9FVkVOVCwgaGFuZGxlQ29udGV4dFJlc3RvcmVkKVxuICAgIH1cblxuICAgIHNoYWRlclN0YXRlLmNsZWFyKClcbiAgICBmcmFtZWJ1ZmZlclN0YXRlLmNsZWFyKClcbiAgICByZW5kZXJidWZmZXJTdGF0ZS5jbGVhcigpXG4gICAgdGV4dHVyZVN0YXRlLmNsZWFyKClcbiAgICBidWZmZXJTdGF0ZS5jbGVhcigpXG5cbiAgICBpZiAob3B0aW9ucy5vbkRlc3Ryb3kpIHtcbiAgICAgIG9wdGlvbnMub25EZXN0cm95KClcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBjb21waWxlUHJvY2VkdXJlIChvcHRpb25zKSB7XG4gICAgXG4gICAgXG5cbiAgICBmdW5jdGlvbiBmbGF0dGVuTmVzdGVkT3B0aW9ucyAob3B0aW9ucykge1xuICAgICAgdmFyIHJlc3VsdCA9IGV4dGVuZCh7fSwgb3B0aW9ucylcbiAgICAgIGRlbGV0ZSByZXN1bHQudW5pZm9ybXNcbiAgICAgIGRlbGV0ZSByZXN1bHQuYXR0cmlidXRlc1xuICAgICAgZGVsZXRlIHJlc3VsdC5jb250ZXh0XG5cbiAgICAgIGZ1bmN0aW9uIG1lcmdlIChuYW1lKSB7XG4gICAgICAgIGlmIChuYW1lIGluIHJlc3VsdCkge1xuICAgICAgICAgIHZhciBjaGlsZCA9IHJlc3VsdFtuYW1lXVxuICAgICAgICAgIGRlbGV0ZSByZXN1bHRbbmFtZV1cbiAgICAgICAgICBPYmplY3Qua2V5cyhjaGlsZCkuZm9yRWFjaChmdW5jdGlvbiAocHJvcCkge1xuICAgICAgICAgICAgcmVzdWx0W25hbWUgKyAnLicgKyBwcm9wXSA9IGNoaWxkW3Byb3BdXG4gICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgbWVyZ2UoJ2JsZW5kJylcbiAgICAgIG1lcmdlKCdkZXB0aCcpXG4gICAgICBtZXJnZSgnY3VsbCcpXG4gICAgICBtZXJnZSgnc3RlbmNpbCcpXG4gICAgICBtZXJnZSgncG9seWdvbk9mZnNldCcpXG4gICAgICBtZXJnZSgnc2Npc3NvcicpXG4gICAgICBtZXJnZSgnc2FtcGxlJylcblxuICAgICAgcmV0dXJuIHJlc3VsdFxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHNlcGFyYXRlRHluYW1pYyAob2JqZWN0KSB7XG4gICAgICB2YXIgc3RhdGljSXRlbXMgPSB7fVxuICAgICAgdmFyIGR5bmFtaWNJdGVtcyA9IHt9XG4gICAgICBPYmplY3Qua2V5cyhvYmplY3QpLmZvckVhY2goZnVuY3Rpb24gKG9wdGlvbikge1xuICAgICAgICB2YXIgdmFsdWUgPSBvYmplY3Rbb3B0aW9uXVxuICAgICAgICBpZiAoZHluYW1pYy5pc0R5bmFtaWModmFsdWUpKSB7XG4gICAgICAgICAgZHluYW1pY0l0ZW1zW29wdGlvbl0gPSBkeW5hbWljLnVuYm94KHZhbHVlLCBvcHRpb24pXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc3RhdGljSXRlbXNbb3B0aW9uXSA9IHZhbHVlXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICByZXR1cm4ge1xuICAgICAgICBkeW5hbWljOiBkeW5hbWljSXRlbXMsXG4gICAgICAgIHN0YXRpYzogc3RhdGljSXRlbXNcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBUcmVhdCBjb250ZXh0IHZhcmlhYmxlcyBzZXBhcmF0ZSBmcm9tIG90aGVyIGR5bmFtaWMgdmFyaWFibGVzXG4gICAgdmFyIGNvbnRleHQgPSBzZXBhcmF0ZUR5bmFtaWMob3B0aW9ucy5jb250ZXh0IHx8IHt9KVxuICAgIHZhciB1bmlmb3JtcyA9IHNlcGFyYXRlRHluYW1pYyhvcHRpb25zLnVuaWZvcm1zIHx8IHt9KVxuICAgIHZhciBhdHRyaWJ1dGVzID0gc2VwYXJhdGVEeW5hbWljKG9wdGlvbnMuYXR0cmlidXRlcyB8fCB7fSlcbiAgICB2YXIgb3B0cyA9IHNlcGFyYXRlRHluYW1pYyhmbGF0dGVuTmVzdGVkT3B0aW9ucyhvcHRpb25zKSlcblxuICAgIHZhciBjb21waWxlZCA9IGNvcmUuY29tcGlsZShvcHRzLCBhdHRyaWJ1dGVzLCB1bmlmb3JtcywgY29udGV4dClcblxuICAgIHZhciBkcmF3ID0gY29tcGlsZWQuZHJhd1xuICAgIHZhciBiYXRjaCA9IGNvbXBpbGVkLmJhdGNoXG4gICAgdmFyIHNjb3BlID0gY29tcGlsZWQuc2NvcGVcblxuICAgIHZhciBFTVBUWV9BUlJBWSA9IFtdXG4gICAgZnVuY3Rpb24gcmVzZXJ2ZSAoY291bnQpIHtcbiAgICAgIHdoaWxlIChFTVBUWV9BUlJBWS5sZW5ndGggPCBjb3VudCkge1xuICAgICAgICBFTVBUWV9BUlJBWS5wdXNoKG51bGwpXG4gICAgICB9XG4gICAgICByZXR1cm4gRU1QVFlfQVJSQVlcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBSRUdMQ29tbWFuZCAoYXJncywgYm9keSkge1xuICAgICAgdmFyIGlcbiAgICAgIGlmICh0eXBlb2YgYXJncyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICByZXR1cm4gc2NvcGUuY2FsbCh0aGlzLCBudWxsLCBhcmdzLCAwKVxuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgYm9keSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBpZiAodHlwZW9mIGFyZ3MgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgZm9yIChpID0gMDsgaSA8IGFyZ3M7ICsraSkge1xuICAgICAgICAgICAgc2NvcGUuY2FsbCh0aGlzLCBudWxsLCBib2R5LCBpKVxuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGFyZ3MpKSB7XG4gICAgICAgICAgZm9yIChpID0gMDsgaSA8IGFyZ3MubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICAgIHNjb3BlLmNhbGwodGhpcywgYXJnc1tpXSwgYm9keSwgaSlcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIHNjb3BlLmNhbGwodGhpcywgYXJncywgYm9keSwgMClcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgYXJncyA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgaWYgKGFyZ3MgPiAwKSB7XG4gICAgICAgICAgcmV0dXJuIGJhdGNoLmNhbGwodGhpcywgcmVzZXJ2ZShhcmdzIHwgMCksIGFyZ3MgfCAwKVxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoYXJncykpIHtcbiAgICAgICAgaWYgKGFyZ3MubGVuZ3RoKSB7XG4gICAgICAgICAgcmV0dXJuIGJhdGNoLmNhbGwodGhpcywgYXJncywgYXJncy5sZW5ndGgpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBkcmF3LmNhbGwodGhpcywgYXJncylcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gUkVHTENvbW1hbmRcbiAgfVxuXG4gIGZ1bmN0aW9uIHBvbGwgKCkge1xuICAgIGNvcmUucHJvY3MucG9sbCgpXG4gIH1cblxuICBmdW5jdGlvbiBjbGVhciAob3B0aW9ucykge1xuICAgIHZhciBjbGVhckZsYWdzID0gMFxuXG4gICAgcG9sbCgpXG5cbiAgICB2YXIgYyA9IG9wdGlvbnMuY29sb3JcbiAgICBpZiAoYykge1xuICAgICAgZ2wuY2xlYXJDb2xvcigrY1swXSB8fCAwLCArY1sxXSB8fCAwLCArY1syXSB8fCAwLCArY1szXSB8fCAwKVxuICAgICAgY2xlYXJGbGFncyB8PSBHTF9DT0xPUl9CVUZGRVJfQklUXG4gICAgfVxuICAgIGlmICgnZGVwdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgIGdsLmNsZWFyRGVwdGgoK29wdGlvbnMuZGVwdGgpXG4gICAgICBjbGVhckZsYWdzIHw9IEdMX0RFUFRIX0JVRkZFUl9CSVRcbiAgICB9XG4gICAgaWYgKCdzdGVuY2lsJyBpbiBvcHRpb25zKSB7XG4gICAgICBnbC5jbGVhclN0ZW5jaWwob3B0aW9ucy5zdGVuY2lsIHwgMClcbiAgICAgIGNsZWFyRmxhZ3MgfD0gR0xfU1RFTkNJTF9CVUZGRVJfQklUXG4gICAgfVxuXG4gICAgXG4gICAgZ2wuY2xlYXIoY2xlYXJGbGFncylcbiAgfVxuXG4gIGZ1bmN0aW9uIGZyYW1lIChjYikge1xuICAgIHJhZkNhbGxiYWNrcy5wdXNoKGNiKVxuXG4gICAgZnVuY3Rpb24gY2FuY2VsICgpIHtcbiAgICAgIHZhciBpbmRleCA9IHJhZkNhbGxiYWNrcy5maW5kKGZ1bmN0aW9uIChpdGVtKSB7XG4gICAgICAgIHJldHVybiBpdGVtID09PSBjYlxuICAgICAgfSlcbiAgICAgIGlmIChpbmRleCA8IDApIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICByYWZDYWxsYmFja3Muc3BsaWNlKGluZGV4LCAxKVxuICAgICAgaWYgKHJhZkNhbGxiYWNrcy5sZW5ndGggPD0gMCkge1xuICAgICAgICBzdG9wUkFGKClcbiAgICAgIH1cbiAgICB9XG5cbiAgICBzdGFydFJBRigpXG5cbiAgICByZXR1cm4ge1xuICAgICAgY2FuY2VsOiBjYW5jZWxcbiAgICB9XG4gIH1cblxuICBjb3JlLnByb2NzLnJlZnJlc2goKVxuXG4gIHJldHVybiBleHRlbmQoY29tcGlsZVByb2NlZHVyZSwge1xuICAgIC8vIENsZWFyIGN1cnJlbnQgRkJPXG4gICAgY2xlYXI6IGNsZWFyLFxuXG4gICAgLy8gU2hvcnQgY3V0cyBmb3IgZHluYW1pYyB2YXJpYWJsZXNcbiAgICBwcm9wOiBkeW5hbWljLmRlZmluZS5iaW5kKG51bGwsIERZTl9QUk9QKSxcbiAgICBjb250ZXh0OiBkeW5hbWljLmRlZmluZS5iaW5kKG51bGwsIERZTl9DT05URVhUKSxcbiAgICB0aGlzOiBkeW5hbWljLmRlZmluZS5iaW5kKG51bGwsIERZTl9TVEFURSksXG5cbiAgICAvLyBleGVjdXRlcyBhbiBlbXB0eSBkcmF3IGNvbW1hbmRcbiAgICBkcmF3OiBjb21waWxlUHJvY2VkdXJlKHt9KSxcblxuICAgIC8vIFJlc291cmNlc1xuICAgIGVsZW1lbnRzOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgcmV0dXJuIGVsZW1lbnRTdGF0ZS5jcmVhdGUob3B0aW9ucylcbiAgICB9LFxuICAgIGJ1ZmZlcjogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgIHJldHVybiBidWZmZXJTdGF0ZS5jcmVhdGUob3B0aW9ucywgR0xfQVJSQVlfQlVGRkVSKVxuICAgIH0sXG4gICAgdGV4dHVyZTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgIHJldHVybiB0ZXh0dXJlU3RhdGUuY3JlYXRlKG9wdGlvbnMsIEdMX1RFWFRVUkVfMkQpXG4gICAgfSxcbiAgICBjdWJlOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDYpIHtcbiAgICAgICAgcmV0dXJuIHRleHR1cmVTdGF0ZS5jcmVhdGUoXG4gICAgICAgICAgQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKSxcbiAgICAgICAgICBHTF9URVhUVVJFX0NVQkVfTUFQKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHRleHR1cmVTdGF0ZS5jcmVhdGUob3B0aW9ucywgR0xfVEVYVFVSRV9DVUJFX01BUClcbiAgICAgIH1cbiAgICB9LFxuICAgIHJlbmRlcmJ1ZmZlcjogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgIHJldHVybiByZW5kZXJidWZmZXJTdGF0ZS5jcmVhdGUob3B0aW9ucylcbiAgICB9LFxuICAgIGZyYW1lYnVmZmVyOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgcmV0dXJuIGZyYW1lYnVmZmVyU3RhdGUuY3JlYXRlKG9wdGlvbnMpXG4gICAgfSxcbiAgICBmcmFtZWJ1ZmZlckN1YmU6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICBcbiAgICB9LFxuXG4gICAgLy8gRXhwb3NlIGNvbnRleHQgYXR0cmlidXRlc1xuICAgIGF0dHJpYnV0ZXM6IGdsLmdldENvbnRleHRBdHRyaWJ1dGVzKCksXG5cbiAgICAvLyBGcmFtZSByZW5kZXJpbmdcbiAgICBmcmFtZTogZnJhbWUsXG5cbiAgICAvLyBTeXN0ZW0gbGltaXRzXG4gICAgbGltaXRzOiBsaW1pdHMsXG5cbiAgICAvLyBSZWFkIHBpeGVsc1xuICAgIHJlYWQ6IHJlYWRQaXhlbHMsXG5cbiAgICAvLyBEZXN0cm95IHJlZ2wgYW5kIGFsbCBhc3NvY2lhdGVkIHJlc291cmNlc1xuICAgIGRlc3Ryb3k6IGRlc3Ryb3ksXG5cbiAgICAvLyBEaXJlY3QgR0wgc3RhdGUgbWFuaXB1bGF0aW9uXG4gICAgX2dsOiBnbCxcbiAgICBfcmVmcmVzaDogZnVuY3Rpb24gKCkge1xuICAgICAgY29yZS5wcm9jcy5yZWZyZXNoKClcbiAgICB9XG4gIH0pXG59XG4iXX0=
