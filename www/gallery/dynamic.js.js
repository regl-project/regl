(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var regl = require('../regl')()

var draw = regl({
  frag: `
    precision mediump float;
    uniform vec4 color;
    void main() {
      gl_FragColor = color;
    }`,

  vert: `
    precision mediump float;
    attribute vec2 position;
    uniform float angle;
    void main() {
      gl_Position = vec4(
        cos(angle) * position.x + sin(angle) * position.y,
        -sin(angle) * position.x + cos(angle) * position.y, 0, 1);
    }`,

  attributes: {
    position: regl.buffer([
      -1, 0,
      0, -1,
      1, 1])
  },

  uniforms: {
    color: regl.prop('color'),
    angle: function (args, batchId, stats) {
      return 0.01 * stats.count
    }
  },

  depth: {
    enable: false
  },

  count: 3
})

regl.frame(function (count) {
  regl.clear({
    color: [0, 0, 0, 1]
  })

  draw({
    color: [
      Math.sin(0.001 * count),
      Math.cos(0.02 * count),
      Math.sin(0.3 * count),
      1
    ]
  })
})

},{"../regl":34}],2:[function(require,module,exports){
var glTypes = require('./constants/dtypes.json')
var extend = require('./extend')

var GL_FLOAT = 5126

function AttributeRecord () {
  this.pointer = false

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

extend(AttributeRecord.prototype, {
  equals: function (other, size) {
    if (!this.pointer) {
      return !other.pointer &&
        this.x === other.x &&
        this.y === other.y &&
        this.z === other.z &&
        this.w === other.w
    } else {
      return other.pointer &&
        this.buffer === other.buffer &&
        this.size === size &&
        this.normalized === other.normalized &&
        this.type === other.type &&
        this.offset === other.offset &&
        this.stride === other.stride &&
        this.divisor === other.divisor
    }
  },

  set: function (other, size) {
    var pointer = this.pointer = other.pointer
    if (pointer) {
      this.buffer = other.buffer
      this.size = size
      this.normalized = other.normalized
      this.type = other.type
      this.offset = other.offset
      this.stride = other.stride
      this.divisor = other.divisor
    } else {
      this.x = other.x
      this.y = other.y
      this.z = other.z
      this.w = other.w
    }
  }
})

module.exports = function wrapAttributeState (
  gl,
  extensions,
  limits,
  bufferState,
  stringStore) {

  var attributeState = {}

  var NUM_ATTRIBUTES = limits.maxAttributes
  var attributeBindings = new Array(NUM_ATTRIBUTES)
  for (var i = 0; i < NUM_ATTRIBUTES; ++i) {
    attributeBindings[i] = new AttributeRecord()
  }

  function AttributeStack () {
    var records = new Array(16)
    for (var i = 0; i < 16; ++i) {
      records[i] = new AttributeRecord()
    }
    this.records = records
    this.top = 0
  }

  function pushAttributeStack (stack) {
    var records = stack.records
    var top = stack.top

    while (records.length - 1 <= top) {
      records.push(new AttributeRecord())
    }

    return records[++stack.top]
  }

  extend(AttributeStack.prototype, {
    pushVec: function (x, y, z, w) {
      var head = pushAttributeStack(this)
      head.pointer = false
      head.x = x
      head.y = y
      head.z = z
      head.w = w
    },

    pushPtr: function (
      buffer,
      size,
      offset,
      stride,
      divisor,
      normalized,
      type) {
      var head = pushAttributeStack(this)
      head.pointer = true
      head.buffer = buffer
      head.size = size
      head.offset = offset
      head.stride = stride
      head.divisor = divisor
      head.normalized = normalized
      head.type = type
    },

    pushDyn: function (data) {
      if (typeof data === 'number') {
        this.pushVec(data, 0, 0, 0)
      } else if (Array.isArray(data)) {
        this.pushVec(data[0], data[1], data[2], data[3])
      } else {
        var buffer = bufferState.getBuffer(data)
        var size = 0
        var stride = 0
        var offset = 0
        var divisor = 0
        var normalized = false
        var type = GL_FLOAT
        if (!buffer) {
          buffer = bufferState.getBuffer(data.buffer)
          size = data.size || 0
          stride = data.stride || 0
          offset = data.offset || 0
          divisor = data.divisor || 0
          normalized = data.normalized || false
          type = buffer.dtype
          if ('type' in data) {
            type = glTypes[data.type]
          }
        } else {
          type = buffer.dtype
        }
        this.pushPtr(buffer, size, offset, stride, divisor, normalized, type)
      }
    },

    pop: function () {
      this.top -= 1
    }
  })

  // ===================================================
  // BIND AN ATTRIBUTE
  // ===================================================
  function bindAttribute (index, current, next, size) {
    size = next.size || size
    if (current.equals(next, size)) {
      return
    }
    if (!next.pointer) {
      if (current.pointer) {
        gl.disableVertexAttribArray(index)
      }
      gl.vertexAttrib4f(index, next.x, next.y, next.z, next.w)
    } else {
      if (!current.pointer) {
        gl.enableVertexAttribArray(index)
      }
      if (current.buffer !== next.buffer) {
        next.buffer.bind()
      }
      gl.vertexAttribPointer(
        index,
        size,
        next.type,
        next.normalized,
        next.stride,
        next.offset)
      var extInstancing = extensions.angle_instanced_arrays
      if (extInstancing) {
        extInstancing.vertexAttribDivisorANGLE(index, next.divisor)
      }
    }
    current.set(next, size)
  }

  // ===================================================
  // DEFINE A NEW ATTRIBUTE
  // ===================================================
  function defAttribute (name) {
    var id = stringStore.id(name)
    var result = attributeState[id]
    if (!result) {
      result = attributeState[id] = new AttributeStack()
    }
    return result
  }

  return {
    bindings: attributeBindings,
    bind: bindAttribute,
    def: defAttribute
  }
}

},{"./constants/dtypes.json":9,"./extend":15}],3:[function(require,module,exports){
// Array and element buffer creation
var check = require('./check')
var isTypedArray = require('./is-typed-array')
var isNDArrayLike = require('./is-ndarray')
var arrayTypes = require('./constants/arraytypes.json')
var bufferTypes = require('./constants/dtypes.json')
var values = require('./values')

var GL_STATIC_DRAW = 35044

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

  function REGLBuffer (buffer, type) {
    this.id = bufferCount++
    this.buffer = buffer
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
    check(handle, 'buffer must not be deleted already')
    if (gl.isBuffer(handle)) {
      gl.deleteBuffer(handle)
    }
    buffer.buffer = null
    delete bufferSet[buffer.id]
  }

  function createBuffer (options, type, deferInit) {
    var handle = gl.createBuffer()

    var buffer = new REGLBuffer(handle, type)
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

      check.type(
        options, 'object',
        'buffer arguments must be an object, a number or an array')

      if ('usage' in options) {
        var usage = options.usage
        check.parameter(usage, usageTypes, 'invalid buffer usage')
        buffer.usage = usageTypes[options.usage]
      } else {
        buffer.usage = GL_STATIC_DRAW
      }

      var dtype = 0
      if ('type' in options) {
        check.parameter(options.type, bufferTypes, 'invalid buffer type')
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
              check.raise('invalid shape')
            }

            dtype = dtype || typedArrayCode(data) || GL_FLOAT
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
            check.isTypedArray(data, 'invalid data type buffer data')
            dtype = dtype || typedArrayCode(data)
          }
          byteLength = data.byteLength
        }
      } else if ('length' in options) {
        byteLength = options.length | 0
        check.nni(byteLength, 'buffer length must be a nonnegative integer')
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

},{"./check":4,"./constants/arraytypes.json":8,"./constants/dtypes.json":9,"./is-ndarray":18,"./is-typed-array":19,"./values":33}],4:[function(require,module,exports){
// Error checking and parameter validation
var isTypedArray = require('./is-typed-array')
var extend = require('./extend')

function raise (message) {
  var error = new Error('(regl) ' + message)
  console.error(error)
  throw error
}

function check (pred, message) {
  if (!pred) {
    raise(message)
  }
}

function encolon (message) {
  if (message) {
    return ': ' + message
  }
  return ''
}

function checkParameter (param, possibilities, message) {
  if (!(param in possibilities)) {
    raise('unknown parameter (' + param + ')' + encolon(message) +
          '. possible values: ' + Object.keys(possibilities).join())
  }
}

function checkIsTypedArray (data, message) {
  if (!isTypedArray(data)) {
    raise(
      'invalid parameter type' + encolon(message) +
      '. must be a typed array')
  }
}

function checkTypeOf (value, type, message) {
  if (typeof value !== type) {
    raise(
      'invalid parameter type' + encolon(message) +
      '. expected ' + type + ', got ' + (typeof value))
  }
}

function checkNonNegativeInt (value, message) {
  if (!((value >= 0) &&
        ((value | 0) === value))) {
    raise('invalid parameter type, (' + value + ')' + encolon(message) +
          '. must be a nonnegative integer')
  }
}

function checkOneOf (value, list, message) {
  if (list.indexOf(value) < 0) {
    raise('invalid value' + encolon(message) + '. must be one of: ' + list)
  }
}

function checkShaderError (gl, shader, source, type) {
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    var errLog = gl.getShaderInfoLog(shader)
    check.raise('Error compiling shader:\n' + errLog)
  }
}

function checkLinkError (gl, program) {
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    var errLog = gl.getProgramInfoLog(program)
    check.raise('Error linking program:\n' + errLog)
  }
}

module.exports = extend(check, {
  raise: raise,
  parameter: checkParameter,
  type: checkTypeOf,
  isTypedArray: checkIsTypedArray,
  nni: checkNonNegativeInt,
  oneOf: checkOneOf,
  shaderError: checkShaderError,
  linkError: checkLinkError
})

},{"./extend":15,"./is-typed-array":19}],5:[function(require,module,exports){
/* globals performance */
module.exports =
  (typeof performance !== 'undefined' && performance.now)
  ? function () { return performance.now() }
  : function () { return +(new Date()) }

},{}],6:[function(require,module,exports){
var extend = require('./extend')

function slice (x) {
  return Array.prototype.slice.call(x)
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
        return [
          (vars.length > 0 ? 'var ' + vars + ';' : ''),
          code.join('')
        ].join('')
      }
    })
  }

  // procedure list
  var procedures = {}
  function proc (name) {
    var args = []
    function arg () {
      var name = 'a' + (varCounter++)
      args.push(name)
      return name
    }

    var body = block()
    var bodyToString = body.toString

    var result = procedures[name] = extend(body, {
      arg: arg,
      toString: function () {
        return [
          'function(', args.join(), '){',
          bodyToString(),
          '}'
        ].join('')
      }
    })

    return result
  }

  function compile () {
    var code = ['"use strict";return {']
    Object.keys(procedures).forEach(function (name) {
      code.push('"', name, '":', procedures[name].toString(), ',')
    })
    code.push('}')
    var proc = Function.apply(null, linkedNames.concat([code.join('')]))
    return proc.apply(null, linkedValues)
  }

  return {
    link: link,
    block: block,
    proc: proc,
    compile: compile
  }
}

},{"./extend":15}],7:[function(require,module,exports){
var check = require('./check')
var createEnvironment = require('./codegen')

var primTypes = require('./constants/primitives.json')
var glTypes = require('./constants/dtypes.json')

var GL_ELEMENT_ARRAY_BUFFER = 34963

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

var GL_CULL_FACE = 0x0B44
var GL_BLEND = 0x0BE2
var GL_DITHER = 0x0BD0
var GL_STENCIL_TEST = 0x0B90
var GL_DEPTH_TEST = 0x0B71
var GL_SCISSOR_TEST = 0x0C11
var GL_POLYGON_OFFSET_FILL = 0x8037
var GL_SAMPLE_ALPHA_TO_COVERAGE = 0x809E
var GL_SAMPLE_COVERAGE = 0x80A0

var GL_FRONT = 1028
var GL_BACK = 1029

var GL_CW = 0x0900
var GL_CCW = 0x0901

var GL_MIN_EXT = 0x8007
var GL_MAX_EXT = 0x8008

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

function setUniformString (gl, type, location, value) {
  var infix
  var separator = ','
  switch (type) {
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
    case GL_BOOL:
    case GL_INT:
      infix = '1i'
      break
    case GL_BOOL_VEC2:
    case GL_INT_VEC2:
      infix = '2iv'
      break
    case GL_BOOL_VEC3:
    case GL_INT_VEC3:
      infix = '3iv'
      break
    case GL_BOOL_VEC4:
    case GL_INT_VEC4:
      infix = '4iv'
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
    default:
      check.raise('unsupported uniform type')
  }
  return gl + '.uniform' + infix + '(' + location + separator + value + ');'
}

function stackTop (x) {
  return x + '[' + x + '.length-1]'
}

// Need to process framebuffer first in options list
function optionPriority (a, b) {
  if (a === 'framebuffer') {
    return -1
  }
  if (a < b) {
    return -1
  } else if (a > b) {
    return 1
  }
  return 0
}

module.exports = function reglCompiler (
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
  frameState,
  reglPoll) {
  var contextState = glState.contextState

  var blendEquations = {
    'add': 32774,
    'subtract': 32778,
    'reverse subtract': 32779
  }
  if (extensions.ext_blend_minmax) {
    blendEquations.min = GL_MIN_EXT
    blendEquations.max = GL_MAX_EXT
  }

  var drawCallCounter = 0

  // ===================================================
  // ===================================================
  // SHADER SINGLE DRAW OPERATION
  // ===================================================
  // ===================================================
  function compileShaderDraw (program) {
    var env = createEnvironment()
    var link = env.link
    var draw = env.proc('draw')
    var def = draw.def

    var GL = link(gl)
    var PROGRAM = link(program.program)
    var BIND_ATTRIBUTE = link(attributeState.bind)
    var DRAW_STATE = {
      count: link(drawState.count),
      offset: link(drawState.offset),
      instances: link(drawState.instances),
      primitive: link(drawState.primitive)
    }
    var ELEMENT_STATE = link(elementState.elements)
    var TEXTURE_UNIFORMS = []

    // bind the program
    draw(GL, '.useProgram(', PROGRAM, ');')

    // set up attribute state
    program.attributes.forEach(function (attribute) {
      var STACK = link(attributeState.def(attribute.name))
      draw(BIND_ATTRIBUTE, '(',
        attribute.location, ',',
        link(attributeState.bindings[attribute.location]), ',',
        STACK, '.records[', STACK, '.top]', ',',
        typeLength(attribute.info.type), ');')
    })

    // set up uniforms
    program.uniforms.forEach(function (uniform) {
      var LOCATION = link(uniform.location)
      var STACK = link(uniformState.def(uniform.name))
      var TOP = STACK + '[' + STACK + '.length-1]'
      var type = uniform.info.type
      if (type === GL_SAMPLER_2D || type === GL_SAMPLER_CUBE) {
        var TEX_VALUE = def(TOP + '._texture')
        TEXTURE_UNIFORMS.push(TEX_VALUE)
        draw(setUniformString(GL, GL_INT, LOCATION, TEX_VALUE + '.bind()'))
      } else {
        draw(setUniformString(GL, type, LOCATION, TOP))
      }
    })

    // unbind textures immediately
    TEXTURE_UNIFORMS.forEach(function (TEX_VALUE) {
      draw(TEX_VALUE, '.unbind();')
    })

    // Execute draw command
    var CUR_PRIMITIVE = def(stackTop(DRAW_STATE.primitive))
    var CUR_COUNT = def(stackTop(DRAW_STATE.count))
    var CUR_OFFSET = def(stackTop(DRAW_STATE.offset))
    var CUR_ELEMENTS = def(stackTop(ELEMENT_STATE))

    // Only execute draw command if number elements is > 0
    draw('if(', CUR_COUNT, '){')

    var instancing = extensions.angle_instanced_arrays
    if (instancing) {
      var CUR_INSTANCES = def(stackTop(DRAW_STATE.instances))
      var INSTANCE_EXT = link(instancing)
      draw(
        'if(', CUR_ELEMENTS, '){',
        CUR_ELEMENTS, '.bind();',
        'if(', CUR_INSTANCES, '>0){',
        INSTANCE_EXT, '.drawElementsInstancedANGLE(',
        CUR_PRIMITIVE, ',',
        CUR_COUNT, ',',
        CUR_ELEMENTS, '.type,',
        CUR_OFFSET, ',',
        CUR_INSTANCES, ');}else{',
        GL, '.drawElements(',
        CUR_PRIMITIVE, ',',
        CUR_COUNT, ',',
        CUR_ELEMENTS, '.type,',
        CUR_OFFSET, ');}',
        '}else if(', CUR_INSTANCES, '>0){',
        INSTANCE_EXT, '.drawArraysInstancedANGLE(',
        CUR_PRIMITIVE, ',',
        CUR_OFFSET, ',',
        CUR_COUNT, ',',
        CUR_INSTANCES, ');}else{',
        GL, '.drawArrays(',
        CUR_PRIMITIVE, ',',
        CUR_OFFSET, ',',
        CUR_COUNT, ');}}')
    } else {
      draw(
        'if(', CUR_ELEMENTS, '){',
        GL, '.drawElements(',
        CUR_PRIMITIVE, ',',
        CUR_COUNT, ',',
        CUR_ELEMENTS, '.type,',
        CUR_OFFSET, ');}',
        '}else{',
        GL, '.drawArrays(',
        CUR_PRIMITIVE, ',',
        CUR_OFFSET, ',',
        CUR_COUNT, ');}')
    }

    return env.compile().draw
  }

  // ===================================================
  // ===================================================
  // BATCH DRAW OPERATION
  // ===================================================
  // ===================================================
  function compileBatch (
    program, options, uniforms, attributes, staticOptions) {
    // -------------------------------
    // code generation helpers
    // -------------------------------
    var env = createEnvironment()
    var link = env.link
    var batch = env.proc('batch')
    var exit = env.block()
    var def = batch.def
    var arg = batch.arg

    // -------------------------------
    // regl state
    // -------------------------------
    var GL = link(gl)
    var PROGRAM = link(program.program)
    var BIND_ATTRIBUTE = link(attributeState.bind)
    var FRAME_STATE = link(frameState)
    var FRAMEBUFFER_STATE = link(framebufferState)
    var DRAW_STATE = {
      count: link(drawState.count),
      offset: link(drawState.offset),
      instances: link(drawState.instances),
      primitive: link(drawState.primitive)
    }
    var CONTEXT_STATE = {}
    var ELEMENTS = link(elementState.elements)
    var CUR_COUNT = def(stackTop(DRAW_STATE.count))
    var CUR_OFFSET = def(stackTop(DRAW_STATE.offset))
    var CUR_PRIMITIVE = def(stackTop(DRAW_STATE.primitive))
    var CUR_ELEMENTS = def(stackTop(ELEMENTS))
    var CUR_INSTANCES
    var INSTANCE_EXT
    var instancing = extensions.angle_instanced_arrays
    if (instancing) {
      CUR_INSTANCES = def(stackTop(DRAW_STATE.instances))
      INSTANCE_EXT = link(instancing)
    }
    var hasDynamicElements = 'elements' in options

    function linkContext (x) {
      var result = CONTEXT_STATE[x]
      if (result) {
        return result
      }
      result = CONTEXT_STATE[x] = link(contextState[x])
      return result
    }

    // -------------------------------
    // batch/argument vars
    // -------------------------------
    var NUM_ARGS = arg()
    var ARGS = arg()
    var ARG = def()
    var BATCH_ID = def()

    // -------------------------------
    // load a dynamic variable
    // -------------------------------
    var dynamicVars = {}
    function dyn (x) {
      var id = x.id
      var result = dynamicVars[id]
      if (result) {
        return result
      }
      if (x.func) {
        result = batch.def(
          link(x.data), '(', ARG, ',', BATCH_ID, ',', FRAME_STATE, ')')
      } else {
        result = batch.def(ARG, '.', x.data)
      }
      dynamicVars[id] = result
      return result
    }

    // -------------------------------
    // retrieves the first name-matching record from an ActiveInfo list
    // -------------------------------
    function findInfo (list, name) {
      return list.find(function (item) {
        return item.name === name
      })
    }

    // -------------------------------
    // bind shader
    // -------------------------------
    batch(GL, '.useProgram(', PROGRAM, ');')

    // -------------------------------
    // set static uniforms
    // -------------------------------
    program.uniforms.forEach(function (uniform) {
      if (uniform.name in uniforms) {
        return
      }
      var LOCATION = link(uniform.location)
      var STACK = link(uniformState.def(uniform.name))
      var TOP = STACK + '[' + STACK + '.length-1]'
      var type = uniform.info.type
      if (type === GL_SAMPLER_2D || type === GL_SAMPLER_CUBE) {
        var TEX_VALUE = def(TOP + '._texture')
        batch(setUniformString(GL, GL_INT, LOCATION, TEX_VALUE + '.bind()'))
        exit(TEX_VALUE, '.unbind();')
      } else {
        batch(setUniformString(GL, type, LOCATION, TOP))
      }
    })

    // -------------------------------
    // set static attributes
    // -------------------------------
    program.attributes.forEach(function (attribute) {
      if (attributes.name in attributes) {
        return
      }
      var STACK = link(attributeState.def(attribute.name))
      batch(BIND_ATTRIBUTE, '(',
        attribute.location, ',',
        link(attributeState.bindings[attribute.location]), ',',
        STACK, '.records[', STACK, '.top]', ',',
        typeLength(attribute.info.type), ');')
    })

    // -------------------------------
    // set static element buffer
    // -------------------------------
    if (!hasDynamicElements) {
      batch(
        'if(', CUR_ELEMENTS, '){',
        GL, '.bindBuffer(', GL_ELEMENT_ARRAY_BUFFER, ',', CUR_ELEMENTS, '.buffer.buffer);',
        '}else{',
        GL, '.bindBuffer(', GL_ELEMENT_ARRAY_BUFFER, ',null);',
        '}')
    }

    // -------------------------------
    // loop over all arguments
    // -------------------------------
    batch(
      'for(', BATCH_ID, '=0;', BATCH_ID, '<', NUM_ARGS, ';++', BATCH_ID, '){',
      ARG, '=', ARGS, '[', BATCH_ID, '];')

    // -------------------------------
    // set dynamic flags
    // -------------------------------
    Object.keys(options).sort(optionPriority).forEach(function (option) {
      var VALUE = dyn(options[option])

      function setCap (flag) {
        batch(
          'if(', VALUE, '){',
          GL, '.enable(', flag, ');}else{',
          GL, '.disable(', flag, ');}')
      }

      switch (option) {
        case 'framebuffer':
          var VIEWPORT_STATE = linkContext('viewport')
          var SCISSOR_STATE = linkContext('scissor.box')
          batch(
            'if(', FRAMEBUFFER_STATE, '.push(',
            VALUE, '&&', VALUE, '._framebuffer)){',
            FRAMEBUFFER_STATE, '.poll();',
            VIEWPORT_STATE, '.setDirty();',
            SCISSOR_STATE, '.setDirty();',
            '}')
          break

        // Caps
        case 'cull.enable':
          setCap(GL_CULL_FACE)
          break
        case 'blend.enable':
          setCap(GL_BLEND)
          break
        case 'dither':
          setCap(GL_DITHER)
          break
        case 'stencil.enable':
          setCap(GL_STENCIL_TEST)
          break
        case 'depth.enable':
          setCap(GL_DEPTH_TEST)
          break
        case 'scissor.enable':
          setCap(GL_SCISSOR_TEST)
          break
        case 'polygonOffset.enable':
          setCap(GL_POLYGON_OFFSET_FILL)
          break
        case 'sample.alpha':
          setCap(GL_SAMPLE_ALPHA_TO_COVERAGE)
          break
        case 'sample.enable':
          setCap(GL_SAMPLE_COVERAGE)
          break

        case 'depth.mask':
          batch(GL, '.depthMask(', VALUE, ');')
          break

        case 'depth.func':
          var DEPTH_FUNCS = link(compareFuncs)
          batch(GL, '.depthFunc(', DEPTH_FUNCS, '[', VALUE, ']);')
          break

        case 'depth.range':
          batch(GL, '.depthRange(', VALUE, '[0],', VALUE, '[1]);')
          break

        case 'blend.color':
          batch(GL, '.blendColor(',
            VALUE, '[0],',
            VALUE, '[1],',
            VALUE, '[2],',
            VALUE, '[3]);')
          break

        case 'blend.equation':
          var BLEND_EQUATIONS = link(blendEquations)
          batch(
            'if(typeof ', VALUE, '==="string"){',
            GL, '.blendEquation(', BLEND_EQUATIONS, '[', VALUE, ']);',
            '}else{',
            GL, '.blendEquationSeparate(',
            BLEND_EQUATIONS, '[', VALUE, '.rgb],',
            BLEND_EQUATIONS, '[', VALUE, '.alpha]);',
            '}')
          break

        case 'blend.func':
          var BLEND_FUNCS = link(blendFuncs)
          batch(
            GL, '.blendFuncSeparate(',
            BLEND_FUNCS,
            '["srcRGB" in ', VALUE, '?', VALUE, '.srcRGB:', VALUE, '.src],',
            BLEND_FUNCS,
            '["dstRGB" in ', VALUE, '?', VALUE, '.dstRGB:', VALUE, '.dst],',
            BLEND_FUNCS,
            '["srcAlpha" in ', VALUE, '?', VALUE, '.srcAlpha:', VALUE, '.src],',
            BLEND_FUNCS,
            '["dstAlpha" in ', VALUE, '?', VALUE, '.dstAlpha:', VALUE, '.dst]);')
          break

        case 'stencil.mask':
          batch(GL, '.stencilMask(', VALUE, ');')
          break

        case 'stencil.func':
          var STENCIL_FUNCS = link(compareFuncs)
          batch(GL, '.stencilFunc(',
            STENCIL_FUNCS, '[', VALUE, '.cmp||"always"],',
            VALUE, '.ref|0,',
            '"mask" in ', VALUE, '?', VALUE, '.mask:-1);')
          break

        case 'stencil.opFront':
        case 'stencil.opBack':
          var STENCIL_OPS = link(stencilOps)
          batch(GL, '.stencilOpSeparate(',
            option === 'stencil.opFront' ? GL_FRONT : GL_BACK, ',',
            STENCIL_OPS, '[', VALUE, '.fail||"keep"],',
            STENCIL_OPS, '[', VALUE, '.zfail||"keep"],',
            STENCIL_OPS, '[', VALUE, '.pass||"keep"]);')
          break

        case 'polygonOffset.offset':
          batch(GL, '.polygonOffset(',
            VALUE, '.factor||0,',
            VALUE, '.units||0);')
          break

        case 'cull.face':
          batch(GL, '.cullFace(',
            VALUE, '==="front"?', GL_FRONT, ':', GL_BACK, ');')
          break

        case 'lineWidth':
          batch(GL, '.lineWidth(', VALUE, ');')
          break

        case 'frontFace':
          batch(GL, '.frontFace(',
            VALUE, '==="cw"?', GL_CW, ':', GL_CCW, ');')
          break

        case 'colorMask':
          batch(GL, '.colorMask(',
            VALUE, '[0],',
            VALUE, '[1],',
            VALUE, '[2],',
            VALUE, '[3]);')
          break

        case 'sample.coverage':
          batch(GL, '.sampleCoverage(',
            VALUE, '.value,',
            VALUE, '.invert);')
          break

        case 'scissor.box':
        case 'viewport':
          var BOX_STATE = linkContext(option)
          batch(BOX_STATE, '.push(',
            VALUE, '.x||0,',
            VALUE, '.y||0,',
            VALUE, '.w||-1,',
            VALUE, '.h||-1);')
          break

        case 'primitives':
        case 'offset':
        case 'count':
        case 'elements':
          break

        default:
          check.raise('unsupported option for batch', option)
      }
    })

    // update viewport/scissor box state and restore framebuffer
    if ('viewport' in options || 'framebuffer' in options) {
      batch(linkContext('viewport'), '.poll();')
    }
    if ('scissor.box' in options || 'framebuffer' in options) {
      batch(linkContext('scissor.box'), '.poll();')
    }
    if ('framebuffer' in options) {
      batch(FRAMEBUFFER_STATE, '.pop();')
    }

    // -------------------------------
    // set dynamic uniforms
    // -------------------------------
    var programUniforms = program.uniforms
    var DYNAMIC_TEXTURES = []
    Object.keys(uniforms).forEach(function (uniform) {
      var data = findInfo(programUniforms, uniform)
      if (!data) {
        return
      }
      var TYPE = data.info.type
      var LOCATION = link(data.location)
      var VALUE = dyn(uniforms[uniform])
      if (data.info.type === GL_SAMPLER_2D ||
          data.info.type === GL_SAMPLER_CUBE) {
        var TEX_VALUE = def(VALUE + '._texture')
        DYNAMIC_TEXTURES.push(TEX_VALUE)
        batch(setUniformString(GL, GL_INT, LOCATION, TEX_VALUE + '.bind()'))
      } else {
        batch(setUniformString(GL, TYPE, LOCATION, VALUE))
      }
    })
    DYNAMIC_TEXTURES.forEach(function (VALUE) {
      batch(VALUE, '.unbind();')
    })

    // -------------------------------
    // set dynamic attributes
    // -------------------------------
    var programAttributes = program.attributes
    Object.keys(attributes).forEach(function (attribute) {
      var data = findInfo(programAttributes, attribute)
      if (!data) {
        return
      }
      batch(BIND_ATTRIBUTE, '(',
        data.location, ',',
        link(attribute.bindings[data.location]), ',',
        dyn(attributes[attribute]), ',',
        typeLength(data.info.type), ');')
    })

    // -------------------------------
    // set dynamic attributes
    // -------------------------------

    if (options.count) {
      batch(CUR_COUNT, '=', dyn(options.count), ';')
    } else if (!useElementOption('count')) {
      batch('if(', CUR_COUNT, '){')
    }
    if (options.offset) {
      batch(CUR_OFFSET, '=', dyn(options.offset), ';')
    }
    if (options.primitive) {
      var PRIM_TYPES = link(primTypes)
      batch(CUR_PRIMITIVE, '=', PRIM_TYPES, '[', dyn(options.primitive), '];')
    }

    function useElementOption (x) {
      return hasDynamicElements && !(x in options || x in staticOptions)
    }
    if (hasDynamicElements) {
      var dynElements = dyn(options.elements)
      batch(CUR_ELEMENTS, '=',
        dynElements, '?', dynElements, '._elements:null;')
    }
    if (useElementOption('offset')) {
      batch(CUR_OFFSET, '=0;')
    }

    // Emit draw command
    batch('if(', CUR_ELEMENTS, '){')
    if (useElementOption('count')) {
      batch(CUR_COUNT, '=', CUR_ELEMENTS, '.vertCount;',
        'if(', CUR_COUNT, '>0){')
    }
    if (useElementOption('primitive')) {
      batch(CUR_PRIMITIVE, '=', CUR_ELEMENTS, '.primType;')
    }
    if (hasDynamicElements) {
      batch(
        GL,
        '.bindBuffer(',
        GL_ELEMENT_ARRAY_BUFFER, ',',
        CUR_ELEMENTS, '.buffer.buffer);')
    }
    if (instancing) {
      if (options.instances) {
        batch(CUR_INSTANCES, '=', dyn(options.instances), ';')
      }
      batch(
        'if(', CUR_INSTANCES, '>0){',
        INSTANCE_EXT, '.drawElementsInstancedANGLE(',
        CUR_PRIMITIVE, ',',
        CUR_COUNT, ',',
        CUR_ELEMENTS, '.type,',
        CUR_OFFSET, ',',
        CUR_INSTANCES, ');}else{')
    }
    batch(
      GL, '.drawElements(',
      CUR_PRIMITIVE, ',',
      CUR_COUNT, ',',
      CUR_ELEMENTS, '.type,',
      CUR_OFFSET, ');')
    if (instancing) {
      batch('}')
    }
    if (useElementOption('count')) {
      batch('}')
    }
    batch('}else{')
    if (!useElementOption('count')) {
      if (useElementOption('primitive')) {
        batch(CUR_PRIMITIVE, '=', GL_TRIANGLES, ';')
      }
      if (instancing) {
        batch(
          'if(', CUR_INSTANCES, '>0){',
          INSTANCE_EXT, '.drawArraysInstancedANGLE(',
          CUR_PRIMITIVE, ',',
          CUR_OFFSET, ',',
          CUR_COUNT, ',',
          CUR_INSTANCES, ');}else{')
      }
      batch(
        GL, '.drawArrays(',
        CUR_PRIMITIVE, ',',
        CUR_OFFSET, ',',
        CUR_COUNT, ');}')
      if (instancing) {
        batch('}')
      }
    }
    batch('}}', exit)

    // -------------------------------
    // compile and return
    // -------------------------------
    return env.compile().batch
  }

  // ===================================================
  // ===================================================
  // MAIN DRAW COMMAND
  // ===================================================
  // ===================================================
  function compileCommand (
    staticOptions, staticUniforms, staticAttributes,
    dynamicOptions, dynamicUniforms, dynamicAttributes,
    hasDynamic) {
    // Create code generation environment
    var env = createEnvironment()
    var link = env.link
    var block = env.block
    var proc = env.proc

    var callId = drawCallCounter++

    // -------------------------------
    // Common state variables
    // -------------------------------
    var GL_POLL = link(reglPoll)
    var STRING_STORE = link(stringStore)
    var FRAG_SHADER_STATE = link(shaderState.fragShaders)
    var VERT_SHADER_STATE = link(shaderState.vertShaders)
    var PROGRAM_STATE = link(shaderState.programs)
    var FRAMEBUFFER_STATE = link(framebufferState)
    var DRAW_STATE = {
      count: link(drawState.count),
      offset: link(drawState.offset),
      instances: link(drawState.instances),
      primitive: link(drawState.primitive)
    }
    var ELEMENT_STATE = link(elementState.elements)
    var PRIM_TYPES = link(primTypes)
    var COMPARE_FUNCS = link(compareFuncs)
    var STENCIL_OPS = link(stencilOps)

    var CONTEXT_STATE = {}
    function linkContext (x) {
      var result = CONTEXT_STATE[x]
      if (result) {
        return result
      }
      result = CONTEXT_STATE[x] = link(contextState[x])
      return result
    }

    // ==========================================================
    // STATIC STATE
    // ==========================================================
    // Code blocks for the static sections
    var entry = block()
    var exit = block()

    // -------------------------------
    // update default context state variables
    // -------------------------------
    function handleStaticOption (param, value) {
      var STATE_STACK = linkContext(param)
      entry(STATE_STACK, '.push(', value, ');')
      exit(STATE_STACK, '.pop();')
    }

    var hasShader = false
    Object.keys(staticOptions).sort(optionPriority).forEach(function (param) {
      var value = staticOptions[param]
      switch (param) {
        case 'frag':
          hasShader = true
          entry(FRAG_SHADER_STATE, '.push(', link(stringStore.id(value)), ');')
          exit(FRAG_SHADER_STATE, '.pop();')
          break

        case 'vert':
          hasShader = true
          entry(VERT_SHADER_STATE, '.push(', link(stringStore.id(value)), ');')
          exit(VERT_SHADER_STATE, '.pop();')
          break

        case 'framebuffer':
          var fbo = framebufferState.getFramebuffer(value)
          check(value === null || fbo, 'invalid framebuffer object')
          var VIEWPORT_STATE = linkContext('viewport')
          var SCISSOR_STATE = linkContext('scissor.box')
          entry('if(', FRAMEBUFFER_STATE, '.push(', link(
            value && value._framebuffer), ')){',
            VIEWPORT_STATE, '.setDirty();',
            SCISSOR_STATE, '.setDirty();',
            '}')
          exit('if(', FRAMEBUFFER_STATE, '.pop()){',
            VIEWPORT_STATE, '.setDirty();',
            SCISSOR_STATE, '.setDirty();',
            '}')
          break

        // Update draw state
        case 'count':
        case 'offset':
        case 'instances':
          check.nni(value, param)
          entry(DRAW_STATE[param], '.push(', value, ');')
          exit(DRAW_STATE[param], '.pop();')
          break

        // Update primitive type
        case 'primitive':
          check.parameter(value, primTypes, 'not a valid drawing primitive')
          var primType = primTypes[value]
          entry(DRAW_STATE.primitive, '.push(', primType, ');')
          exit(DRAW_STATE.primitive, '.pop();')
          break

        // Update element buffer
        case 'elements':
          var elements = elementState.getElements(value)
          var hasPrimitive = !('primitive' in staticOptions)
          var hasCount = !('count' in staticOptions)
          if (elements) {
            var ELEMENTS = link(elements)
            entry(ELEMENT_STATE, '.push(', ELEMENTS, ');')
            if (hasPrimitive) {
              entry(DRAW_STATE.primitive, '.push(', ELEMENTS, '.primType);')
            }
            if (hasCount) {
              entry(DRAW_STATE.count, '.push(', ELEMENTS, '.vertCount);')
            }
          } else {
            entry(ELEMENT_STATE, '.push(null);')
            if (hasPrimitive) {
              entry(DRAW_STATE.primitive, '.push(', GL_TRIANGLES, ');')
            }
            if (hasCount) {
              entry(DRAW_STATE.count, '.push(0);')
            }
          }
          if (hasPrimitive) {
            exit(DRAW_STATE.primitive, '.pop();')
          }
          if (hasCount) {
            exit(DRAW_STATE.count, '.pop();')
          }
          if (!('offset' in staticOptions)) {
            entry(DRAW_STATE.offset, '.push(0);')
            exit(DRAW_STATE.offset, '.pop();')
          }
          exit(ELEMENT_STATE, '.pop();')
          break

        case 'cull.enable':
        case 'blend.enable':
        case 'dither':
        case 'stencil.enable':
        case 'depth.enable':
        case 'scissor.enable':
        case 'polygonOffset.enable':
        case 'sample.alpha':
        case 'sample.enable':
        case 'depth.mask':
          check.type(value, 'boolean', param)
          handleStaticOption(param, value)
          break

        case 'depth.func':
          check.parameter(value, compareFuncs, param)
          handleStaticOption(param, compareFuncs[value])
          break

        case 'depth.range':
          check(
            Array.isArray(value) &&
            value.length === 2 &&
            value[0] <= value[1],
            'depth range is 2d array')
          var DEPTH_RANGE_STACK = linkContext(param)
          entry(DEPTH_RANGE_STACK, '.push(', value[0], ',', value[1], ');')
          exit(DEPTH_RANGE_STACK, '.pop();')
          break

        case 'blend.func':
          var BLEND_FUNC_STACK = linkContext(param)
          check.type(value, 'object', 'blend func must be an object')
          var srcRGB = ('srcRGB' in value ? value.srcRGB : value.src)
          var srcAlpha = ('srcAlpha' in value ? value.srcAlpha : value.src)
          var dstRGB = ('dstRGB' in value ? value.dstRGB : value.dst)
          var dstAlpha = ('dstAlpha' in value ? value.dstAlpha : value.dst)
          check.parameter(srcRGB, blendFuncs)
          check.parameter(srcAlpha, blendFuncs)
          check.parameter(dstRGB, blendFuncs)
          check.parameter(dstAlpha, blendFuncs)
          entry(BLEND_FUNC_STACK, '.push(',
            blendFuncs[srcRGB], ',',
            blendFuncs[dstRGB], ',',
            blendFuncs[srcAlpha], ',',
            blendFuncs[dstAlpha], ');')
          exit(BLEND_FUNC_STACK, '.pop();')
          break

        case 'blend.equation':
          var BLEND_EQUATION_STACK = linkContext(param)
          if (typeof value === 'string') {
            check.parameter(value, blendEquations, 'invalid blend equation')
            entry(BLEND_EQUATION_STACK,
              '.push(',
              blendEquations[value], ',',
              blendEquations[value], ');')
          } else if (typeof value === 'object') {
            check.parameter(
              value.rgb, blendEquations, 'invalid blend equation rgb')
            check.parameter(
              value.alpha, blendEquations, 'invalid blend equation alpha')
            entry(BLEND_EQUATION_STACK,
              '.push(',
              blendEquations[value.rgb], ',',
              blendEquations[value.alpha], ');')
          } else {
            check.raise('invalid blend equation')
          }
          exit(BLEND_EQUATION_STACK, '.pop();')
          break

        case 'blend.color':
          check(
            Array.isArray(value) &&
            value.length === 4,
            'blend color is a 4d array')
          var BLEND_COLOR_STACK = linkContext(param)
          entry(BLEND_COLOR_STACK,
            '.push(',
            value[0], ',',
            value[1], ',',
            value[2], ',',
            value[3], ');')
          exit(BLEND_COLOR_STACK, '.pop();')
          break

        case 'stencil.mask':
          check.type(value, 'number', 'stencil mask must be an integer')
          var STENCIL_MASK_STACK = linkContext(param)
          entry(STENCIL_MASK_STACK, '.push(', value, ');')
          exit(STENCIL_MASK_STACK, '.pop();')
          break

        case 'stencil.func':
          check.type(value, 'object', 'stencil func must be an object')
          var cmp = value.cmp || 'keep'
          var ref = value.ref || 0
          var mask = 'mask' in value ? value.mask : -1
          check.parameter(cmp, compareFuncs, 'invalid stencil func cmp')
          check.type(ref, 'number', 'stencil func ref')
          check.type(mask, 'number', 'stencil func mask')
          var STENCIL_FUNC_STACK = linkContext(param)
          entry(STENCIL_FUNC_STACK, '.push(',
            compareFuncs[cmp], ',',
            ref, ',',
            mask, ');')
          exit(STENCIL_FUNC_STACK, '.pop();')
          break

        case 'stencil.opFront':
        case 'stencil.opBack':
          check.type(value, 'object', param)
          var fail = value.fail || 'keep'
          var zfail = value.zfail || 'keep'
          var pass = value.pass || 'keep'
          check.parameter(fail, stencilOps, param)
          check.parameter(zfail, stencilOps, param)
          check.parameter(pass, stencilOps, param)
          var STENCIL_OP_STACK = linkContext(param)
          entry(STENCIL_OP_STACK, '.push(',
            stencilOps[fail], ',',
            stencilOps[zfail], ',',
            stencilOps[pass], ');')
          exit(STENCIL_OP_STACK, '.pop();')
          break

        case 'polygonOffset.offset':
          check.type(value, 'object', param)
          var factor = value.factor || 0
          var units = value.units || 0
          check.type(factor, 'number', 'offset.factor')
          check.type(units, 'number', 'offset.units')
          var POLYGON_OFFSET_STACK = linkContext(param)
          entry(POLYGON_OFFSET_STACK, '.push(',
            factor, ',', units, ');')
          exit(POLYGON_OFFSET_STACK, '.pop();')
          break

        case 'cull.face':
          var face = 0
          if (value === 'front') {
            face = GL_FRONT
          } else if (value === 'back') {
            face = GL_BACK
          }
          check(!!face, 'cull.face')
          var CULL_FACE_STACK = linkContext(param)
          entry(CULL_FACE_STACK, '.push(', face, ');')
          exit(CULL_FACE_STACK, '.pop();')
          break

        case 'lineWidth':
          var lineWidthDims = limits.lineWidthDims
          check(
            typeof value === 'number' &&
            value >= lineWidthDims[0] &&
            value <= lineWidthDims[1],
            'invalid line width, must positive number between ' +
            lineWidthDims[0] + ' and ' + lineWidthDims[1])
          handleStaticOption(param, value)
          break

        case 'frontFace':
          var orientation = 0
          if (value === 'cw') {
            orientation = GL_CW
          } else if (value === 'ccw') {
            orientation = GL_CCW
          }
          check(!!orientation, 'frontFace')
          var FRONT_FACE_STACK = linkContext(param)
          entry(FRONT_FACE_STACK, '.push(', orientation, ');')
          exit(FRONT_FACE_STACK, '.pop();')
          break

        case 'colorMask':
          check(Array.isArray(value) && value.length === 4, 'color mask must be length 4 array')
          var COLOR_MASK_STACK = linkContext(param)
          entry(COLOR_MASK_STACK, '.push(',
            value.map(function (v) { return !!v }).join(),
            ');')
          exit(COLOR_MASK_STACK, '.pop();')
          break

        case 'sample.coverage':
          check.type(value, 'object', param)
          var sampleValue = 'value' in value ? value.value : 1
          var sampleInvert = !!value.invert
          check(
            typeof sampleValue === 'number' &&
            sampleValue >= 0 && sampleValue <= 1,
            'sample value')
          var SAMPLE_COVERAGE_STACK = linkContext(param)
          entry(SAMPLE_COVERAGE_STACK, '.push(',
            sampleValue, ',', sampleInvert, ');')
          exit(SAMPLE_COVERAGE_STACK, '.pop();')
          break

        case 'viewport':
        case 'scissor.box':
          check(typeof value === 'object' && value, param + ' is an object')
          var X = value.x || 0
          var Y = value.y || 0
          var W = -1
          var H = -1
          check(typeof X === 'number' && X >= 0, param + '.x must be a positive int')
          check(typeof Y === 'number' && Y >= 0, param + '.y must be a positive int')
          if ('w' in value) {
            W = value.w
            check(typeof W === 'number' && W >= 0, param + '.w must be a positive int')
          }
          if ('h' in value) {
            H = value.h
            check(typeof H === 'number' && H >= 0, param + '.h must be a positive int')
          }
          var BOX_STACK = linkContext(param)
          entry(BOX_STACK, '.push(', X, ',', Y, ',', W, ',', H, ');')
          exit(BOX_STACK, '.pop();')
          break

        default:
          // TODO Should this just be a warning instead?
          check.raise('unsupported parameter ' + param)
          break
      }
    })

    // -------------------------------
    // update shader program
    // -------------------------------
    if (hasShader) {
      if (staticOptions.frag && staticOptions.vert) {
        var fragSrc = staticOptions.frag
        var vertSrc = staticOptions.vert
        entry(PROGRAM_STATE, '.push(',
          link(shaderState.create(
            stringStore.id(vertSrc),
            stringStore.id(fragSrc))), ');')
      } else {
        var FRAG_SRC = entry.def(
          FRAG_SHADER_STATE, '[', FRAG_SHADER_STATE, '.length-1]')
        var VERT_SRC = entry.def(
          VERT_SHADER_STATE, '[', VERT_SHADER_STATE, '.length-1]')
        var LINK_PROG = link(shaderState.create)
        entry(
          PROGRAM_STATE, '.push(',
          LINK_PROG, '(', VERT_SRC, ',', FRAG_SRC, '));')
      }
      exit(PROGRAM_STATE, '.pop();')
    }

    // -------------------------------
    // update static uniforms
    // -------------------------------
    Object.keys(staticUniforms).forEach(function (uniform) {
      var STACK = link(uniformState.def(uniform))
      var VALUE
      var value = staticUniforms[uniform]
      if (typeof value === 'function' && value._reglType) {
        VALUE = link(value)
      } else if (Array.isArray(value)) {
        VALUE = link(value.slice())
      } else {
        VALUE = +value
      }
      entry(STACK, '.push(', VALUE, ');')
      exit(STACK, '.pop();')
    })

    // -------------------------------
    // update default attributes
    // -------------------------------
    Object.keys(staticAttributes).forEach(function (attribute) {
      var ATTRIBUTE = link(attributeState.def(attribute))

      var data = staticAttributes[attribute]
      if (typeof data === 'number') {
        entry(ATTRIBUTE, '.pushVec(', +data, ',0,0,0);')
      } else {
        check(!!data, 'invalid attribute: ' + attribute)

        if (Array.isArray(data)) {
          entry(
            ATTRIBUTE, '.pushVec(',
            [data[0] || 0, data[1] || 0, data[2] || 0, data[3] || 0], ');')
        } else {
          var buffer = bufferState.getBuffer(data)
          var size = 0
          var stride = 0
          var offset = 0
          var divisor = 0
          var normalized = false
          var type = GL_FLOAT

          if (!buffer) {
            check.type(data, 'object', 'invalid attribute "' + attribute + '"')

            buffer = bufferState.getBuffer(data.buffer)
            size = data.size || 0
            stride = data.stride || 0
            offset = data.offset || 0
            divisor = data.divisor || 0
            normalized = data.normalized || false

            check(!!buffer, 'invalid attribute ' + attribute + '.buffer')

            // Check for user defined type overloading
            type = buffer.dtype
            if ('type' in data) {
              check.parameter(data.type, glTypes, 'attribute type')
              type = glTypes[data.type]
            }
          } else {
            type = buffer.dtype
          }

          check(!!buffer, 'invalid attribute ' + attribute + '.buffer')
          check.nni(stride, attribute + '.stride')
          check.nni(offset, attribute + '.offset')
          check.nni(divisor, attribute + '.divisor')
          check.type(normalized, 'boolean', attribute + '.normalized')
          check.oneOf(size, [0, 1, 2, 3, 4], attribute + '.size')

          entry(
            ATTRIBUTE, '.pushPtr(', [
              link(buffer), size, offset, stride,
              divisor, normalized, type
            ].join(), ');')
        }
      }
      exit(ATTRIBUTE, '.pop();')
    })

    // ==========================================================
    // DYNAMIC STATE (for scope and draw)
    // ==========================================================
    // Generated code blocks for dynamic state flags
    var dynamicEntry = env.block()
    var dynamicExit = env.block()

    var FRAMESTATE
    var DYNARGS
    if (hasDynamic) {
      FRAMESTATE = link(frameState)
      DYNARGS = entry.def()
    }

    var dynamicVars = {}
    function dyn (x) {
      var id = x.id
      var result = dynamicVars[id]
      if (result) {
        return result
      }
      if (x.func) {
        result = dynamicEntry.def(
          link(x.data), '(', DYNARGS, ',0,', FRAMESTATE, ')')
      } else {
        result = dynamicEntry.def(DYNARGS, '.', x.data)
      }
      dynamicVars[id] = result
      return result
    }

    // -------------------------------
    // dynamic context state variables
    // -------------------------------
    Object.keys(dynamicOptions).sort(optionPriority).forEach(function (param) {
      // Link in dynamic variable
      var variable = dyn(dynamicOptions[param])

      switch (param) {
        case 'framebuffer':
          var VIEWPORT_STATE = linkContext('viewport')
          var SCISSOR_STATE = linkContext('scissor.box')
          dynamicEntry('if(',
            FRAMEBUFFER_STATE, '.push(',
            variable, '&&', variable, '._framebuffer)){',
            VIEWPORT_STATE, '.setDirty();',
            SCISSOR_STATE, '.setDirty();',
            '}')
          dynamicExit('if(',
            FRAMEBUFFER_STATE, '.pop()){',
            VIEWPORT_STATE, '.setDirty();',
            SCISSOR_STATE, '.setDirty();',
            '}')
          break

        case 'cull.enable':
        case 'blend.enable':
        case 'dither':
        case 'stencil.enable':
        case 'depth.enable':
        case 'scissor.enable':
        case 'polygonOffset.enable':
        case 'sample.alpha':
        case 'sample.enable':
        case 'lineWidth':
        case 'depth.mask':
          var STATE_STACK = linkContext(param)
          dynamicEntry(STATE_STACK, '.push(', variable, ');')
          dynamicExit(STATE_STACK, '.pop();')
          break

        // Draw calls
        case 'count':
        case 'offset':
        case 'instances':
          var DRAW_STACK = DRAW_STATE[param]
          dynamicEntry(DRAW_STACK, '.push(', variable, ');')
          dynamicExit(DRAW_STACK, '.pop();')
          break

        case 'primitive':
          var PRIM_STACK = DRAW_STATE.primitive
          dynamicEntry(PRIM_STACK, '.push(', PRIM_TYPES, '[', variable, ']);')
          dynamicExit(PRIM_STACK, '.pop();')
          break

        case 'depth.func':
          var DEPTH_FUNC_STACK = linkContext(param)
          dynamicEntry(DEPTH_FUNC_STACK, '.push(', COMPARE_FUNCS, '[', variable, ']);')
          dynamicExit(DEPTH_FUNC_STACK, '.pop();')
          break

        case 'blend.func':
          var BLEND_FUNC_STACK = linkContext(param)
          var BLEND_FUNCS = link(blendFuncs)
          dynamicEntry(
            BLEND_FUNC_STACK, '.push(',
            BLEND_FUNCS,
            '["srcRGB" in ', variable, '?', variable, '.srcRGB:', variable, '.src],',
            BLEND_FUNCS,
            '["dstRGB" in ', variable, '?', variable, '.dstRGB:', variable, '.dst],',
            BLEND_FUNCS,
            '["srcAlpha" in ', variable, '?', variable, '.srcAlpha:', variable, '.src],',
            BLEND_FUNCS,
            '["dstAlpha" in ', variable, '?', variable, '.dstAlpha:', variable, '.dst]);')
          dynamicExit(BLEND_FUNC_STACK, '.pop();')
          break

        case 'blend.equation':
          var BLEND_EQUATION_STACK = linkContext(param)
          var BLEND_EQUATIONS = link(blendEquations)
          dynamicEntry(
            'if(typeof ', variable, '==="string"){',
            BLEND_EQUATION_STACK, '.push(',
            BLEND_EQUATIONS, '[', variable, '],',
            BLEND_EQUATIONS, '[', variable, ']);',
            '}else{',
            BLEND_EQUATION_STACK, '.push(',
            BLEND_EQUATIONS, '[', variable, '.rgb],',
            BLEND_EQUATIONS, '[', variable, '.alpha]);',
            '}')
          dynamicExit(BLEND_EQUATION_STACK, '.pop();')
          break

        case 'blend.color':
          var BLEND_COLOR_STACK = linkContext(param)
          dynamicEntry(BLEND_COLOR_STACK, '.push(',
            variable, '[0],',
            variable, '[1],',
            variable, '[2],',
            variable, '[3]);')
          dynamicExit(BLEND_COLOR_STACK, '.pop();')
          break

        case 'stencil.mask':
          var STENCIL_MASK_STACK = linkContext(param)
          dynamicEntry(STENCIL_MASK_STACK, '.push(', variable, ');')
          dynamicExit(STENCIL_MASK_STACK, '.pop();')
          break

        case 'stencil.func':
          var STENCIL_FUNC_STACK = linkContext(param)
          dynamicEntry(STENCIL_FUNC_STACK, '.push(',
            COMPARE_FUNCS, '[', variable, '.cmp],',
            variable, '.ref|0,',
            '"mask" in ', variable, '?', variable, '.mask:-1);')
          dynamicExit(STENCIL_FUNC_STACK, '.pop();')
          break

        case 'stencil.opFront':
        case 'stencil.opBack':
          var STENCIL_OP_STACK = linkContext(param)
          dynamicEntry(STENCIL_OP_STACK, '.push(',
            STENCIL_OPS, '[', variable, '.fail||"keep"],',
            STENCIL_OPS, '[', variable, '.zfail||"keep"],',
            STENCIL_OPS, '[', variable, '.pass||"keep"]);')
          dynamicExit(STENCIL_OP_STACK, '.pop();')
          break

        case 'polygonOffset.offset':
          var POLYGON_OFFSET_STACK = linkContext(param)
          dynamicEntry(POLYGON_OFFSET_STACK, '.push(',
            variable, '.factor||0,',
            variable, '.units||0);')
          dynamicExit(POLYGON_OFFSET_STACK, '.pop();')
          break

        case 'cull.face':
          var CULL_FACE_STACK = linkContext(param)
          dynamicEntry(CULL_FACE_STACK, '.push(',
            variable, '==="front"?', GL_FRONT, ':', GL_BACK, ');')
          dynamicExit(CULL_FACE_STACK, '.pop();')
          break

        case 'frontFace':
          var FRONT_FACE_STACK = linkContext(param)
          dynamicEntry(FRONT_FACE_STACK, '.push(',
            variable, '==="cw"?', GL_CW, ':', GL_CCW, ');')
          dynamicExit(FRONT_FACE_STACK, '.pop();')
          break

        case 'colorMask':
          var COLOR_MASK_STACK = linkContext(param)
          dynamicEntry(COLOR_MASK_STACK, '.push(',
            variable, '[0],',
            variable, '[1],',
            variable, '[2],',
            variable, '[3]);')
          dynamicExit(COLOR_MASK_STACK, '.pop();')
          break

        case 'sample.coverage':
          var SAMPLE_COVERAGE_STACK = linkContext(param)
          dynamicEntry(SAMPLE_COVERAGE_STACK, '.push(',
            variable, '.value,',
            variable, '.invert);')
          dynamicExit(SAMPLE_COVERAGE_STACK, '.pop();')
          break

        case 'scissor.box':
        case 'viewport':
          var BOX_STACK = linkContext(param)
          dynamicEntry(BOX_STACK, '.push(',
            variable, '.x||0,',
            variable, '.y||0,',
            '"w" in ', variable, '?', variable, '.w:-1,',
            '"h" in ', variable, '?', variable, '.h:-1);')
          dynamicExit(BOX_STACK, '.pop();')
          break

        case 'elements':
          var hasPrimitive =
          !('primitive' in dynamicOptions) &&
            !('primitive' in staticOptions)
          var hasCount =
          !('count' in dynamicOptions) &&
            !('count' in staticOptions)
          var hasOffset =
          !('offset' in dynamicOptions) &&
            !('offset' in staticOptions)
          var ELEMENTS = dynamicEntry.def()
          dynamicEntry(
            'if(', variable, '){',
            ELEMENTS, '=', variable, '._elements;',
            ELEMENT_STATE, '.push(', ELEMENTS, ');',
            !hasPrimitive ? ''
              : DRAW_STATE.primitive + '.push(' + ELEMENTS + '.primType);',
            !hasCount ? ''
              : DRAW_STATE.count + '.push(' + ELEMENTS + '.vertCount);',
            !hasOffset ? ''
              : DRAW_STATE.offset + '.push(' + ELEMENTS + '.offset);',
            '}else{',
            ELEMENT_STATE, '.push(null);',
            '}')
          dynamicExit(
            ELEMENT_STATE, '.pop();',
            'if(', variable, '){',
            hasPrimitive ? DRAW_STATE.primitive + '.pop();' : '',
            hasCount ? DRAW_STATE.count + '.pop();' : '',
            hasOffset ? DRAW_STATE.offset + '.pop();' : '',
            '}')
          break

        default:
          check.raise('unsupported dynamic option: ' + param)
      }
    })

    // -------------------------------
    // dynamic uniforms
    // -------------------------------
    Object.keys(dynamicUniforms).forEach(function (uniform) {
      var STACK = link(uniformState.def(uniform))
      var VALUE = dyn(dynamicUniforms[uniform])
      dynamicEntry(STACK, '.push(', VALUE, ');')
      dynamicExit(STACK, '.pop();')
    })

    // -------------------------------
    // dynamic attributes
    // -------------------------------
    Object.keys(dynamicAttributes).forEach(function (attribute) {
      var ATTRIBUTE = link(attributeState.def(attribute))
      var VALUE = dyn(dynamicAttributes[attribute])
      dynamicEntry(ATTRIBUTE, '.pushDyn(', VALUE, ');')
      dynamicExit(ATTRIBUTE, '.pop();')
    })

    // ==========================================================
    // SCOPE PROCEDURE
    // ==========================================================
    var scope = proc('scope')
    var SCOPE_ARGS = scope.arg()
    var SCOPE_BODY = scope.arg()
    scope(entry)
    if (hasDynamic) {
      scope(
        DYNARGS, '=', SCOPE_ARGS, ';',
        dynamicEntry)
    }
    scope(
      SCOPE_BODY, '();',
      hasDynamic ? dynamicExit : '',
      exit)

    // ==========================================================
    // DRAW PROCEDURE
    // ==========================================================
    var draw = proc('draw')
    draw(entry)
    if (hasDynamic) {
      draw(
        DYNARGS, '=', draw.arg(), ';',
        dynamicEntry)
    }
    var CURRENT_SHADER = stackTop(PROGRAM_STATE)
    draw(
      GL_POLL, '();',
      'if(', CURRENT_SHADER, ')',
      CURRENT_SHADER, '.draw(', hasDynamic ? DYNARGS : '', ');',
      hasDynamic ? dynamicExit : '',
      exit)

    // ==========================================================
    // BATCH DRAW
    // ==========================================================
    var batch = proc('batch')
    batch(entry)
    var CUR_SHADER = batch.def(stackTop(PROGRAM_STATE))
    var EXEC_BATCH = link(function (program, count, args) {
      var proc = program.batchCache[callId]
      if (!proc) {
        proc = program.batchCache[callId] = compileBatch(
          program, dynamicOptions, dynamicUniforms, dynamicAttributes,
          staticOptions)
      }
      return proc(count, args)
    })
    batch(
      'if(', CUR_SHADER, '){',
      GL_POLL, '();',
      EXEC_BATCH, '(',
      CUR_SHADER, ',',
      batch.arg(), ',',
      batch.arg(), ');')
    // Set dirty on all dynamic flags
    Object.keys(dynamicOptions).forEach(function (option) {
      var STATE = CONTEXT_STATE[option]
      if (STATE) {
        batch(STATE, '.setDirty();')
      }
    })
    batch('}', exit)

    // -------------------------------
    // eval and bind
    // -------------------------------
    return env.compile()
  }

  return {
    draw: compileShaderDraw,
    command: compileCommand
  }
}

},{"./check":4,"./codegen":6,"./constants/dtypes.json":9,"./constants/primitives.json":10}],8:[function(require,module,exports){
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

},{}],9:[function(require,module,exports){
module.exports={
  "int8": 5120
, "int16": 5122
, "int32": 5124
, "uint8": 5121
, "uint16": 5123
, "uint32": 5125
, "float": 5126
}

},{}],10:[function(require,module,exports){
module.exports={
  "points": 0,
  "lines": 1,
  "line loop": 2,
  "line strip": 3,
  "triangles": 4,
  "triangle strip": 5,
  "triangle fan": 6
}

},{}],11:[function(require,module,exports){
// Context and canvas creation helper functions
/*globals HTMLElement,WebGLRenderingContext*/

var check = require('./check')
var extend = require('./extend')

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

  check(gl, 'webgl not supported')

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

},{"./check":4,"./extend":15}],12:[function(require,module,exports){
var GL_TRIANGLES = 4

module.exports = function wrapDrawState (gl) {
  var primitive = [ GL_TRIANGLES ]
  var count = [ 0 ]
  var offset = [ 0 ]
  var instances = [ 0 ]

  return {
    primitive: primitive,
    count: count,
    offset: offset,
    instances: instances
  }
}

},{}],13:[function(require,module,exports){
var VARIABLE_COUNTER = 0

function DynamicVariable (isFunc, data) {
  this.id = (VARIABLE_COUNTER++)
  this.func = isFunc
  this.data = data
}

function defineDynamic (data, path) {
  switch (typeof data) {
    case 'boolean':
    case 'number':
    case 'string':
      return new DynamicVariable(false, data)
    case 'function':
      return new DynamicVariable(true, data)
    default:
      return defineDynamic
  }
}

function isDynamic (x) {
  return (typeof x === 'function' && !x._reglType) ||
         x instanceof DynamicVariable
}

function unbox (x, path) {
  if (x instanceof DynamicVariable) {
    return x
  } else if (typeof x === 'function' &&
             x !== defineDynamic) {
    return new DynamicVariable(true, x)
  }
  return new DynamicVariable(false, path)
}

module.exports = {
  define: defineDynamic,
  isDynamic: isDynamic,
  unbox: unbox
}

},{}],14:[function(require,module,exports){
var check = require('./check')
var isTypedArray = require('./is-typed-array')
var isNDArrayLike = require('./is-ndarray')
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
  var elements = [ null ]

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
        var byteLength = 0
        if (
          Array.isArray(options) ||
          isTypedArray(options) ||
          isNDArrayLike(options)) {
          data = options
        } else {
          check.type(options, 'object', 'invalid arguments for elements')
          if ('data' in options) {
            data = options.data
          }
          if ('usage' in options) {
            usage = options.usage
          }
          if ('length' in options) {
            byteLength = options.length
          }
        }
        if (Array.isArray(data) ||
            (isNDArrayLike(data) && data.dtype === 'array') ||
            'type' in options) {
          buffer({
            type: options.type ||
              (ext32bit
                ? 'uint32'
                : 'uint16'),
            usage: usage,
            data: data,
            length: byteLength
          })
        } else {
          buffer({
            usage: usage,
            data: data,
            length: byteLength
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
          check(ext32bit, '32 bit element buffers not supported')
          type = GL_UNSIGNED_INT
          vertCount >>= 2
          break

        default:
          check.raise('invalid element buffer type')
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
          check.parameter(primitive, primTypes)
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
      check(elements.buffer !== null, 'must not double destroy elements')
      buffer.destroy()
      elements.buffer = null
    }

    return reglElements
  }

  return {
    create: createElements,
    elements: elements,
    getElements: function (elements) {
      if (elements && elements._elements instanceof REGLElementBuffer) {
        return elements._elements
      }
      return null
    }
  }
}

},{"./check":4,"./constants/primitives.json":10,"./is-ndarray":18,"./is-typed-array":19}],15:[function(require,module,exports){
module.exports = function (base, opts) {
  var keys = Object.keys(opts)
  for (var i = 0; i < keys.length; ++i) {
    base[keys[i]] = opts[keys[i]]
  }
  return base
}

},{}],16:[function(require,module,exports){
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

},{}],17:[function(require,module,exports){
var check = require('./check')
var values = require('./values')
var extend = require('./extend')

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

var GL_ALPHA = 0x1906
var GL_LUMINANCE = 0x1909
var GL_LUMINANCE_ALPHA = 0x190A
var GL_RGB = 0x1907
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

var GL_BACK = 1029

var BACK_BUFFER = [GL_BACK]

module.exports = function wrapFBOState (
  gl,
  extensions,
  limits,
  textureState,
  renderbufferState) {
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

  function checkFormat (attachment, texFormats, rbFormats) {
    if (attachment.texture) {
      check.oneOf(attachment.texture._texture.params.internalformat, texFormats,
        'unsupported texture format for attachment')
    } else {
      check.oneOf(attachment.renderbuffer._renderbuffer.format, rbFormats,
        'unsupported renderbuffer format for attachment')
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
      check(tw === width && th === height,
        'inconsistent width/height for supplied texture')
      check(texture.pollId < 0,
        'polling fbo textures not supported')
      texture.refCount += 1
    } else {
      var renderbuffer = attachment.renderbuffer._renderbuffer
      width = width || renderbuffer.width
      height = height || renderbuffer.height
      check(
        renderbuffer.width === width && renderbuffer.height === height,
        'inconsistent width/height for renderbuffer')
      check(
        colorRenderbufferFormatEnums.indexOf(renderbuffer.format) >= 0,
        'renderbuffer format not compatible with color channels')
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

    check.type(data, 'function', 'invalid attachment data')

    var type = attachment._reglType
    if (type === 'texture') {
      texture = attachment
      if (texture._texture.target === GL_TEXTURE_CUBE_MAP) {
        check(
          target >= GL_TEXTURE_CUBE_MAP_POSITIVE_X &&
          target < GL_TEXTURE_CUBE_MAP_POSITIVE_X + 6,
          'invalid cube map target')
      } else {
        check(target === GL_TEXTURE_2D)
      }
      // TODO check miplevel is consistent
    } else if (type === 'renderbuffer') {
      renderbuffer = attachment
      target = GL_RENDERBUFFER
      level = 0
    } else {
      check.raise('invalid regl object for attachment')
    }

    return new FramebufferAttachment(target, level, texture, renderbuffer)
  }

  function unwrapAttachment (attachment) {
    return attachment && (attachment.texture || attachment.renderbuffer)
  }

  var framebufferCount = 0
  var framebufferSet = {}
  var framebufferStack = [null]
  var framebufferDirty = true

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
    framebufferDirty = true
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
      check.raise('framebuffer configuration not supported, status = ' +
        statusCode[status])
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
    check(handle, 'must not double destroy framebuffer')
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
        check(Array.isArray(shape) && shape.length >= 2,
          'invalid shape for framebuffer')
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
          check(extDrawBuffers, 'multiple render targets not supported')
        }
        check(colorInputs.length >= 0,
          'must specify at least one color attachment')

        // Wrap color attachments
        colorBuffers = colorInputs.map(parseAttachment)

        // Check head node
        for (i = 0; i < colorBuffers.length; ++i) {
          var colorAttachment = colorBuffers[i]
          checkFormat(
            colorAttachment,
            colorTextureFormatEnums,
            colorRenderbufferFormatEnums)
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

        framebuffer.width = width || gl.drawingBufferWidth
        framebuffer.height = height || gl.drawingBufferHeight

        if ('format' in options) {
          colorFormat = options.format
          check.parameter(colorFormat, colorFormats, 'invalid color format')
          colorTexture = colorFormat in colorTextureFormats
        }

        if ('type' in options) {
          check(colorTexture,
            'colorType can not be set for renderbuffer targets')
          colorType = options.type
          check.parameter(colorType, colorTypes, 'invalid color type')
        }

        if ('colorCount' in options) {
          colorCount = options.colorCount | 0
          check(colorCount >= 0, 'color count must be positive')
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

      check(colorBuffers.length > 0, 'must specify at least one color buffer')

      framebuffer.width = width
      framebuffer.height = height

      var depthBuffer = null
      var stencilBuffer = null
      var depthStencilBuffer = null
      var ownsDepthStencil = false
      var depthStencilCount = 0

      if ('depthBuffer' in options) {
        depthBuffer = parseAttachment(options.depthBuffer)
        checkFormat(
          depthBuffer,
          depthTextureFormatEnums,
          depthRenderbufferFormatEnums)
        depthStencilCount += 1
      }
      if ('stencilBuffer' in options) {
        stencilBuffer = parseAttachment(options.stencilBuffer)
        checkFormat(
          stencilBuffer,
          stencilTextureFormatEnums,
          stencilRenderbufferFormatEnums)
        depthStencilCount += 1
      }
      if ('depthStencilBuffer' in options) {
        depthStencilBuffer = parseAttachment(options.depthStencilBuffer)
        checkFormat(
          depthStencilBuffer,
          depthStencilTextureFormatEnums,
          depthStencilRenderbufferFormatEnums)
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
            check(extensions.webgl_depth_texture,
              'depth texture extension not supported')
            var depthTextureFormat
            check(depth, 'stencil only textures not supported')
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
        check(depthStencilCount === 1,
          'can specify only one of depth, stencil or depthStencil attachment')

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

  function poll () {
    if (framebufferDirty) {
      var top = framebufferStack[framebufferStack.length - 1]
      var ext_drawbuffers = extensions.webgl_draw_buffers

      if (top) {
        gl.bindFramebuffer(GL_FRAMEBUFFER, top.framebuffer)
        if (ext_drawbuffers) {
          ext_drawbuffers.drawBuffersWEBGL(DRAW_BUFFERS[top.colorAttachments.length])
        }
      } else {
        gl.bindFramebuffer(GL_FRAMEBUFFER, null)
        if (ext_drawbuffers) {
          ext_drawbuffers.drawBuffersWEBGL(BACK_BUFFER)
        }
      }

      framebufferDirty = false
    }
  }

  function currentFramebuffer () {
    return framebufferStack[framebufferStack.length - 1]
  }

  return {
    top: currentFramebuffer,
    dirty: function () {
      return framebufferDirty
    },
    push: function (next_) {
      var next = next_ || null
      framebufferDirty = framebufferDirty || (next !== currentFramebuffer())
      framebufferStack.push(next)
      return framebufferDirty
    },
    pop: function () {
      var prev = currentFramebuffer()
      framebufferStack.pop()
      framebufferDirty = framebufferDirty || (prev !== currentFramebuffer())
      return framebufferDirty
    },
    getFramebuffer: function (object) {
      if (typeof object === 'function' && object._reglType === 'framebuffer') {
        var fbo = object._framebuffer
        if (fbo instanceof REGLFramebuffer) {
          return fbo
        }
      }
      return null
    },
    poll: poll,
    create: createFBO,
    clear: clearCache,
    refresh: refreshCache
  }
}

},{"./check":4,"./extend":15,"./values":33}],18:[function(require,module,exports){
var isTypedArray = require('./is-typed-array')

module.exports = function isNDArrayLike (obj) {
  return (
    typeof obj === 'object' &&
    Array.isArray(obj.shape) &&
    Array.isArray(obj.stride) &&
    typeof obj.offset === 'number' &&
    obj.shape.length === obj.stride.length &&
    (Array.isArray(obj.data) ||
      isTypedArray(obj.data)))
}

},{"./is-typed-array":19}],19:[function(require,module,exports){
var dtypes = require('./constants/arraytypes.json')
module.exports = function (x) {
  return Object.prototype.toString.call(x) in dtypes
}

},{"./constants/arraytypes.json":8}],20:[function(require,module,exports){
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

},{}],21:[function(require,module,exports){
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

},{}],22:[function(require,module,exports){
// References:
//
// http://msdn.microsoft.com/en-us/library/bb943991.aspx/
// http://blog.tojicode.com/2011/12/compressed-textures-in-webgl.html
//
var check = require('./check')

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
  check(header[0] === DDS_MAGIC,
    'invalid magic number for dds header')

  var flags = header[OFF_FLAGS]
  check(flags & DDPF_FOURCC,
    'unsupported dds format')

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
      check.raise('unsupported dds texture format')
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
    check(
      (caps2 & CUBEMAP_COMPLETE_FACES) === CUBEMAP_COMPLETE_FACES,
      'missing cubemap faces')
    result.cube = true
    for (var i = 0; i < 6; ++i) {
      parseMips(GL_TEXTURE_CUBE_MAP_POSITIVE_X + i)
    }
  } else {
    parseMips(GL_TEXTURE_2D)
  }

  return result
}

},{"./check":4}],23:[function(require,module,exports){
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

},{}],24:[function(require,module,exports){
var check = require('./check')
var isTypedArray = require('./is-typed-array')

var GL_RGBA = 6408
var GL_UNSIGNED_BYTE = 5121
var GL_PACK_ALIGNMENT = 0x0D05

module.exports = function wrapReadPixels (gl, reglPoll, viewportState) {
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
    var width = options.width || viewportState.width
    var height = options.height || viewportState.height

    // Compute size
    var size = width * height * 4

    // Allocate data
    var data = options.data || new Uint8Array(size)

    // Type check
    check.isTypedArray(data)
    check(data.byteLength >= size, 'data buffer too small')

    // Run read pixels
    gl.pixelStorei(GL_PACK_ALIGNMENT, 4)
    gl.readPixels(x, y, width, height, GL_RGBA, GL_UNSIGNED_BYTE, data)

    return data
  }

  return readPixels
}

},{"./check":4,"./is-typed-array":19}],25:[function(require,module,exports){
var check = require('./check')
var values = require('./values')

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
    check(handle, 'must not double destroy renderbuffer')
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
        check(Array.isArray(shape) && shape.length >= 2,
          'invalid renderbuffer shape')
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
      check(w >= 0 && h >= 0 && w <= s && h <= s,
        'invalid renderbuffer size')
      reglRenderbuffer.width = renderbuffer.width = Math.max(w, 1)
      reglRenderbuffer.height = renderbuffer.height = Math.max(h, 1)

      renderbuffer.format = GL_RGBA4
      if ('format' in options) {
        var format = options.format
        check.parameter(format, formatTypes, 'invalid render buffer format')
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

},{"./check":4,"./values":33}],26:[function(require,module,exports){
var check = require('./check')
var values = require('./values')

var DEFAULT_FRAG_SHADER = 'void main(){gl_FragColor=vec4(0,0,0,0);}'
var DEFAULT_VERT_SHADER = 'void main(){gl_Position=vec4(0,0,0,0);}'

var GL_FRAGMENT_SHADER = 35632
var GL_VERTEX_SHADER = 35633

var GL_ACTIVE_UNIFORMS = 0x8B86
var GL_ACTIVE_ATTRIBUTES = 0x8B89

function ActiveInfo (name, location, info) {
  this.name = name
  this.location = location
  this.info = info
}

module.exports = function wrapShaderState (
  gl,
  attributeState,
  uniformState,
  compileShaderDraw,
  stringStore) {
  // ===================================================
  // glsl compilation and linking
  // ===================================================
  var fragShaders = {}
  var vertShaders = {}

  function getShader (type, id) {
    var cache = type === GL_FRAGMENT_SHADER ? fragShaders : vertShaders
    var shader = cache[id]

    if (!shader) {
      var source = stringStore.str(id)
      shader = gl.createShader(type)
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      check.shaderError(gl, shader, source, type)
      cache[id] = shader
    }

    return shader
  }

  // ===================================================
  // program linking
  // ===================================================
  var programCache = {}
  var programList = []

  function REGLProgram (fragId, vertId) {
    this.fragId = fragId
    this.vertId = vertId
    this.program = null
    this.uniforms = []
    this.attributes = []
    this.draw = function () {}
    this.batchCache = {}
  }

  function linkProgram (desc) {
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
    check.linkError(gl, program)

    // -------------------------------
    // grab uniforms
    // -------------------------------
    var numUniforms = gl.getProgramParameter(program, GL_ACTIVE_UNIFORMS)
    var uniforms = desc.uniforms = []

    for (i = 0; i < numUniforms; ++i) {
      info = gl.getActiveUniform(program, i)
      if (info) {
        if (info.size > 1) {
          for (var j = 0; j < info.size; ++j) {
            var name = info.name.replace('[0]', '[' + j + ']')
            uniformState.def(name)
            uniforms.push(new ActiveInfo(
              name,
              gl.getUniformLocation(program, name),
              info))
          }
        } else {
          uniformState.def(info.name)
          uniforms.push(new ActiveInfo(
            info.name,
            gl.getUniformLocation(program, info.name),
            info))
        }
      }
    }

    // -------------------------------
    // grab attributes
    // -------------------------------
    var numAttributes = gl.getProgramParameter(program, GL_ACTIVE_ATTRIBUTES)
    var attributes = desc.attributes = []
    for (i = 0; i < numAttributes; ++i) {
      info = gl.getActiveAttrib(program, i)
      if (info) {
        attributeState.def(info.name)
        attributes.push(new ActiveInfo(
          info.name,
          gl.getAttribLocation(program, info.name),
          info))
      }
    }

    // -------------------------------
    // clear cached rendering methods
    // -------------------------------
    desc.draw = compileShaderDraw(desc)
    desc.batchCache = {}
  }

  function getProgram (vertId, fragId) {
    var cache = programCache[fragId]
    if (!cache) {
      cache = programCache[fragId] = {}
    }
    var program = cache[vertId]
    if (!program) {
      program = new REGLProgram(fragId, vertId)
      linkProgram(program)
      cache[vertId] = program
      programList.push(program)
    }
    return program
  }

  return {
    create: getProgram,

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

    programs: [ null ],
    fragShaders: [ stringStore.id(DEFAULT_FRAG_SHADER) ],
    vertShaders: [ stringStore.id(DEFAULT_VERT_SHADER) ]
  }
}

},{"./check":4,"./values":33}],27:[function(require,module,exports){
// A stack for managing the state of a scalar/vector parameter

module.exports = function createStack (init, onChange) {
  var n = init.length
  var stack = init.slice()
  var current = init.slice()
  var dirty = false
  var forceDirty = true

  function poll () {
    var ptr = stack.length - n
    if (dirty || forceDirty) {
      switch (n) {
        case 1:
          onChange(stack[ptr])
          break
        case 2:
          onChange(stack[ptr], stack[ptr + 1])
          break
        case 3:
          onChange(stack[ptr], stack[ptr + 1], stack[ptr + 2])
          break
        case 4:
          onChange(stack[ptr], stack[ptr + 1], stack[ptr + 2], stack[ptr + 3])
          break
        case 5:
          onChange(stack[ptr], stack[ptr + 1], stack[ptr + 2], stack[ptr + 3], stack[ptr + 4])
          break
        case 6:
          onChange(stack[ptr], stack[ptr + 1], stack[ptr + 2], stack[ptr + 3], stack[ptr + 4], stack[ptr + 5])
          break
        default:
          onChange.apply(null, stack.slice(ptr, stack.length))
      }
      for (var i = 0; i < n; ++i) {
        current[i] = stack[ptr + i]
      }
      forceDirty = dirty = false
    }
  }

  return {
    push: function () {
      dirty = false
      for (var i = 0; i < n; ++i) {
        var x = arguments[i]
        dirty = dirty || (x !== current[i])
        stack.push(x)
      }
    },

    pop: function () {
      dirty = false
      stack.length -= n
      for (var i = 0; i < n; ++i) {
        dirty = dirty || (stack[stack.length - n + i] !== current[i])
      }
    },

    poll: poll,

    setDirty: function () {
      forceDirty = true
    }
  }
}

},{}],28:[function(require,module,exports){
var createStack = require('./stack')
var createEnvironment = require('./codegen')

// WebGL constants
var GL_CULL_FACE = 0x0B44
var GL_BLEND = 0x0BE2
var GL_DITHER = 0x0BD0
var GL_STENCIL_TEST = 0x0B90
var GL_DEPTH_TEST = 0x0B71
var GL_SCISSOR_TEST = 0x0C11
var GL_POLYGON_OFFSET_FILL = 0x8037
var GL_SAMPLE_ALPHA_TO_COVERAGE = 0x809E
var GL_SAMPLE_COVERAGE = 0x80A0
var GL_FUNC_ADD = 0x8006
var GL_ZERO = 0
var GL_ONE = 1
var GL_FRONT = 1028
var GL_BACK = 1029
var GL_LESS = 513
var GL_CCW = 2305
var GL_ALWAYS = 519
var GL_KEEP = 7680

module.exports = function wrapContextState (gl, framebufferState, viewportState) {
  function capStack (cap, dflt) {
    var result = createStack([!!dflt], function (flag) {
      if (flag) {
        gl.enable(cap)
      } else {
        gl.disable(cap)
      }
    })
    result.flag = cap
    return result
  }

  // Caps, flags and other random WebGL context state
  var contextState = {
    // Dithering
    'dither': capStack(GL_DITHER),

    // Blending
    'blend.enable': capStack(GL_BLEND),
    'blend.color': createStack([0, 0, 0, 0], function (r, g, b, a) {
      gl.blendColor(r, g, b, a)
    }),
    'blend.equation': createStack([GL_FUNC_ADD, GL_FUNC_ADD], function (rgb, a) {
      gl.blendEquationSeparate(rgb, a)
    }),
    'blend.func': createStack([
      GL_ONE, GL_ZERO, GL_ONE, GL_ZERO
    ], function (srcRGB, dstRGB, srcAlpha, dstAlpha) {
      gl.blendFuncSeparate(srcRGB, dstRGB, srcAlpha, dstAlpha)
    }),

    // Depth
    'depth.enable': capStack(GL_DEPTH_TEST, true),
    'depth.func': createStack([GL_LESS], function (func) {
      gl.depthFunc(func)
    }),
    'depth.range': createStack([0, 1], function (near, far) {
      gl.depthRange(near, far)
    }),
    'depth.mask': createStack([true], function (m) {
      gl.depthMask(m)
    }),

    // Face culling
    'cull.enable': capStack(GL_CULL_FACE),
    'cull.face': createStack([GL_BACK], function (mode) {
      gl.cullFace(mode)
    }),

    // Front face orientation
    'frontFace': createStack([GL_CCW], function (mode) {
      gl.frontFace(mode)
    }),

    // Write masks
    'colorMask': createStack([true, true, true, true], function (r, g, b, a) {
      gl.colorMask(r, g, b, a)
    }),

    // Line width
    'lineWidth': createStack([1], function (w) {
      gl.lineWidth(w)
    }),

    // Polygon offset
    'polygonOffset.enable': capStack(GL_POLYGON_OFFSET_FILL),
    'polygonOffset.offset': createStack([0, 0], function (factor, units) {
      gl.polygonOffset(factor, units)
    }),

    // Sample coverage
    'sample.alpha': capStack(GL_SAMPLE_ALPHA_TO_COVERAGE),
    'sample.enable': capStack(GL_SAMPLE_COVERAGE),
    'sample.coverage': createStack([1, false], function (value, invert) {
      gl.sampleCoverage(value, invert)
    }),

    // Stencil
    'stencil.enable': capStack(GL_STENCIL_TEST),
    'stencil.mask': createStack([-1], function (mask) {
      gl.stencilMask(mask)
    }),
    'stencil.func': createStack([
      GL_ALWAYS, 0, -1
    ], function (func, ref, mask) {
      gl.stencilFunc(func, ref, mask)
    }),
    'stencil.opFront': createStack([
      GL_KEEP, GL_KEEP, GL_KEEP
    ], function (fail, zfail, pass) {
      gl.stencilOpSeparate(GL_FRONT, fail, zfail, pass)
    }),
    'stencil.opBack': createStack([
      GL_KEEP, GL_KEEP, GL_KEEP
    ], function (fail, zfail, pass) {
      gl.stencilOpSeparate(GL_BACK, fail, zfail, pass)
    }),

    // Scissor
    'scissor.enable': capStack(GL_SCISSOR_TEST),
    'scissor.box': createStack([0, 0, -1, -1], function (x, y, w, h) {
      var w_ = w
      var fbo = framebufferState.top()
      if (w < 0) {
        if (fbo) {
          w_ = fbo.width - x
        } else {
          w_ = gl.drawingBufferWidth - x
        }
      }
      var h_ = h
      if (h < 0) {
        if (fbo) {
          h_ = fbo.height - y
        } else {
          h_ = gl.drawingBufferHeight - y
        }
      }
      gl.scissor(x, y, w_, h_)
    }),

    // Viewport
    'viewport': createStack([0, 0, -1, -1], function (x, y, w, h) {
      var w_ = w
      var fbo = framebufferState.top()
      if (w < 0) {
        if (fbo) {
          w_ = fbo.width - x
        } else {
          w_ = gl.drawingBufferWidth - x
        }
      }
      var h_ = h
      if (h < 0) {
        if (fbo) {
          h_ = fbo.height - y
        } else {
          h_ = gl.drawingBufferHeight - y
        }
      }
      gl.viewport(x, y, w_, h_)
      viewportState.width = w_
      viewportState.height = h_
    })
  }

  var env = createEnvironment()
  var poll = env.proc('poll')
  var refresh = env.proc('refresh')
  Object.keys(contextState).forEach(function (prop) {
    var STACK = env.link(contextState[prop])
    poll(STACK, '.poll();')
    refresh(STACK, '.setDirty();')
  })

  var procs = env.compile()

  return {
    contextState: contextState,
    viewport: viewportState,
    poll: procs.poll,
    refresh: procs.refresh,

    notifyViewportChanged: function () {
      contextState.viewport.setDirty()
      contextState['scissor.box'].setDirty()
    }
  }
}

},{"./codegen":6,"./stack":27}],29:[function(require,module,exports){
module.exports = function createStringStore() {
  var stringIds = {}
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

},{}],30:[function(require,module,exports){
var check = require('./check')
var extend = require('./extend')
var values = require('./values')
var isTypedArray = require('./is-typed-array')
var isNDArrayLike = require('./is-ndarray')
var loadTexture = require('./load-texture')
var convertToHalfFloat = require('./to-half-float')
var parseDDS = require('./parse-dds')

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

module.exports = function createTextureSet (gl, extensions, limits, reglPoll, viewportState) {
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
        check.type(options.premultiplyAlpha, 'boolean',
          'invalid premultiplyAlpha')
        this.premultiplyAlpha = options.premultiplyAlpha
      }

      if ('flipY' in options) {
        check.type(options.flipY, 'boolean',
          'invalid texture flip')
        this.flipY = options.flipY
      }

      if ('alignment' in options) {
        check.oneOf(options.alignment, [1, 2, 4, 8],
          'invalid texture unpack alignment')
        this.unpackAlignment = options.alignment
      }

      if ('colorSpace' in options) {
        check.parameter(options.colorSpace, colorSpace,
          'invalid colorSpace')
        this.colorSpace = colorSpace[options.colorSpace]
      }

      if ('format' in options) {
        var format = options.format
        check.parameter(format, textureFormats,
          'invalid texture format')
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
        check.parameter(type, textureTypes,
          'invalid texture type')
        this.type = textureTypes[type]
      }

      var w = this.width
      var h = this.height
      var c = this.channels
      if ('shape' in options) {
        check(Array.isArray(options.shape) && options.shape.length >= 2,
          'shape must be an array')
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
        check(Array.isArray(stride) && stride.length >= 2,
          'invalid stride vector')
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
          check.raise('invalid pixel data type')
      }

      if (typeof data === 'string') {
        data = loadTexture(data, this.crossOrigin)
      }

      var array = null
      var needsConvert = false

      if (this.compressed) {
        check(data instanceof Uint8Array || isPendingXHR(data),
          'compressed texture data must be stored in a uint8array')
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
        var w = data.length
        var h = data[0].length
        var c = 1
        var i, j, k, p
        if (Array.isArray(data[0][0])) {
          c = data[0][0].length
          check(c >= 0 && c <= 4, 'invalid number of channels for image data')
          array = Array(w * h * c)
          p = 0
          for (j = 0; j < h; ++j) {
            for (i = 0; i < w; ++i) {
              for (k = 0; k < c; ++k) {
                array[p++] = data[i][j][k]
              }
            }
          }
        } else {
          array = Array(w * h)
          p = 0
          for (j = 0; j < h; ++j) {
            for (i = 0; i < w; ++i) {
              array[p++] = data[i][j]
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
        this.width = (this.width || viewportState.width) | 0
        this.height = (this.height || viewportState.height) | 0
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
        check(this.internalformat, 'invalid number of channels')
      }

      var format = this.internalformat
      if (format === GL_DEPTH_COMPONENT || format === GL_DEPTH_STENCIL) {
        check(extensions.webgl_depth_texture,
          'depth/stencil texture not supported')
        if (format === GL_DEPTH_COMPONENT) {
          check(this.type === GL_UNSIGNED_SHORT || GL_UNSIGNED_INT,
            'depth texture type must be uint16 or uint32')
        }
        if (format === GL_DEPTH_STENCIL) {
          check(this.type === GL_UNSIGNED_INT_24_8_WEBGL,
            'depth stencil texture format must match type')
        }
        check(
          !this.data && !array && !this.image && !this.video && !this.canvas,
          'depth/stencil textures are for rendering only')
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
        check(extensions.oes_texture_float,
          'float texture not supported')
      } else if (type === GL_HALF_FLOAT_OES) {
        check(extensions.oes_texture_half_float,
          'half float texture not supported')
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
            check.raise('unsupported format for automatic conversion')
            break

          default:
            check.raise('unsupported type conversion')
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
            check(this.data instanceof Uint8Array ||
                  this.data instanceof Uint8ClampedArray,
                  'incompatible pixel type')
            break
          case GL_UNSIGNED_SHORT_5_6_5:
          case GL_UNSIGNED_SHORT_5_5_5_1:
          case GL_UNSIGNED_SHORT_4_4_4_4:
          case GL_UNSIGNED_SHORT:
          case GL_HALF_FLOAT_OES:
            check(this.data instanceof Uint16Array,
                  'incompatible pixel type')
            break
          case GL_UNSIGNED_INT:
            check(this.data instanceof Uint32Array,
                  'incompatible pixel type')
            break

          case GL_FLOAT:
            check(this.data instanceof Float32Array,
                  'incompatible pixel type')
            break

          default:
            check.raise('bad or missing pixel type')
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
        check.parameter(minFilter, minFilters)
        this.minFilter = minFilters[minFilter]
      }

      if ('mag' in options) {
        var magFilter = options.mag
        check.parameter(magFilter, magFilters)
        this.magFilter = magFilters[magFilter]
      }

      var wrapS = this.wrapS
      var wrapT = this.wrapT
      if ('wrap' in options) {
        var wrap = options.wrap
        if (typeof wrap === 'string') {
          check.parameter(wrap, wrapModes)
          wrapS = wrapT = wrapModes[wrap]
        } else if (Array.isArray(wrap)) {
          check.parameter(wrap[0], wrapModes)
          check.parameter(wrap[1], wrapModes)
          wrapS = wrapModes[wrap[0]]
          wrapT = wrapModes[wrap[1]]
        }
      } else {
        if ('wrapS' in options) {
          var optWrapS = options.wrapS
          check.parameter(optWrapS, wrapModes)
          wrapS = wrapModes[optWrapS]
        }
        if ('wrapT' in options) {
          var optWrapT = options.wrapT
          check.parameter(optWrapT, wrapModes)
          wrapT = wrapModes[optWrapT]
        }
      }
      this.wrapS = wrapS
      this.wrapT = wrapT

      if ('anisotropic' in options) {
        var anisotropic = options.anisotropic
        check(typeof anisotropic === 'number' &&
           anisotropic >= 1 && anisotropic <= limits.maxAnisotropic,
          'aniso samples must be between 1 and ')
        this.anisotropic = options.anisotropic
      }

      if ('mipmap' in options) {
        var mipmap = options.mipmap
        switch (typeof mipmap) {
          case 'string':
            check.parameter(mipmap, mipmapHint,
              'invalid mipmap hint')
            this.mipmapHint = mipmapHint[mipmap]
            this.genMipmaps = true
            break

          case 'boolean':
            this.genMipmaps = !!mipmap
            break

          case 'object':
            break

          default:
            check.raise('invalid mipmap type')
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
      check(cubeMask === 0,
        'pixmap type must not contain cubemap faces')
      check(mipMask2D === mipMask, 'missing mip map data')
    } else {
      check(cubeMask === ((1 << 6) - 1), 'missing cubemap faces')
      for (i = 0; i < 6; ++i) {
        check(mipMaskCube[i] === mipMask, 'missing mip map data')
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
      check(useMipmaps === mipFilter,
        'min filter inconsistent with mipmap data')
    }

    if (useMipmaps) {
      check(width === height && isPow2(width),
        'must be a square power of 2 to support mipmaps')
    }

    if (params.genMipmaps) {
      check(!compressed, 'mipmap generation not supported for compressed textures')
    }

    params.wrapS = params.wrapS || GL_CLAMP_TO_EDGE
    params.wrapT = params.wrapT || GL_CLAMP_TO_EDGE
    if (params.wrapS !== GL_CLAMP_TO_EDGE ||
        params.wrapT !== GL_CLAMP_TO_EDGE) {
      check(isPow2(width) && isPow2(height) && !cubeMask,
        'incompatible size for wrap mode, image must be a power of 2')
    }

    if ((type === GL_FLOAT && !extensions.oes_texture_float_linear) ||
        (type === GL_HALF_FLOAT_OES &&
          !extensions.oes_texture_half_float_linear)) {
      check(this.magFilter === GL_NEAREST && this.minFilter === GL_NEAREST,
        'unsupported filter mode for float texture')
    }

    for (i = 0; i < pixels.length; ++i) {
      pixmap = pixels[i]
      var level = pixmap.miplevel
      if (pixmap.width) {
        check(pixmap.width << level === width, 'inconsistent width')
      }
      if (pixmap.height) {
        check(pixmap.height << level === height, 'inconsistent width')
      }
      if (pixmap.channels) {
        check(pixmap.channels === channels, 'inconsistent channels')
      } else {
        pixmap.channels = channels
      }
      if (pixmap.format) {
        check(pixmap.format === format, 'inconsistent format')
      } else {
        pixmap.format = format
      }
      if (pixmap.internalformat) {
        check(pixmap.internalformat === internalformat, 'inconsistent internalformat')
      } else {
        pixmap.internalformat = internalformat
      }
      if (pixmap.type) {
        check(pixmap.type === type, 'inconsistent type')
      } else {
        pixmap.type = type
      }
      if (pixmap.copy) {
        check(pixmap.type === GL_UNSIGNED_BYTE &&
          pixmap.internalformat === GL_RGBA,
          'incompatible format/type for copyTexImage2D')
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
        check(faces.length === 6,
          'invalid number of faces in cube map')
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

      check(dds.format in colorFormats, 'unsupported dds texture format')

      if (dds.cube) {
        check(texture.target === GL_TEXTURE_CUBE_MAP)

        // TODO handle cube map DDS
        check.raise('cube map DDS not yet implemented')
      } else {
        check(texture.target === GL_TEXTURE_2D)
      }

      if (miplevel) {
        check(dds.pixels.length === 1, 'number of mip levels inconsistent')
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
    check(handle, 'must not double destroy texture')
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
          check.raise('insufficient number of texture units')
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

},{"./check":4,"./extend":15,"./is-ndarray":18,"./is-typed-array":19,"./load-texture":21,"./parse-dds":22,"./to-half-float":31,"./values":33}],31:[function(require,module,exports){
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

},{}],32:[function(require,module,exports){
module.exports = function wrapUniformState (stringStore) {
  var uniformState = {}

  function defUniform (name) {
    var id = stringStore.id(name)
    var result = uniformState[id]
    if (!result) {
      result = uniformState[id] = [
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
      ]
    }
    return result
  }

  return {
    def: defUniform
  }
}

},{}],33:[function(require,module,exports){
module.exports = function (obj) {
  return Object.keys(obj).map(function (key) { return obj[key] })
}

},{}],34:[function(require,module,exports){
var check = require('./lib/check')
var extend = require('./lib/extend')
var getContext = require('./lib/context')
var createStringStore = require('./lib/strings')
var wrapExtensions = require('./lib/extension')
var wrapLimits = require('./lib/limits')
var wrapBuffers = require('./lib/buffer')
var wrapElements = require('./lib/elements')
var wrapTextures = require('./lib/texture')
var wrapRenderbuffers = require('./lib/renderbuffer')
var wrapFramebuffers = require('./lib/framebuffer')
var wrapUniforms = require('./lib/uniform')
var wrapAttributes = require('./lib/attribute')
var wrapShaders = require('./lib/shader')
var wrapDraw = require('./lib/draw')
var wrapContext = require('./lib/state')
var createCompiler = require('./lib/compile')
var wrapRead = require('./lib/read')
var dynamic = require('./lib/dynamic')
var raf = require('./lib/raf')
var clock = require('./lib/clock')

var GL_COLOR_BUFFER_BIT = 16384
var GL_DEPTH_BUFFER_BIT = 256
var GL_STENCIL_BUFFER_BIT = 1024

var GL_ARRAY_BUFFER = 34962
var GL_TEXTURE_2D = 0x0DE1
var GL_TEXTURE_CUBE_MAP = 0x8513

var CONTEXT_LOST_EVENT = 'webglcontextlost'
var CONTEXT_RESTORED_EVENT = 'webglcontextrestored'

module.exports = function wrapREGL () {
  var args = getContext(Array.prototype.slice.call(arguments))
  var gl = args.gl
  var options = args.options

  // Use string store to track string ids
  var stringStore = createStringStore()

  var extensionState = wrapExtensions(gl)
  var extensions = extensionState.extensions

  var viewportState = {
    width: gl.drawingBufferWidth,
    height: gl.drawingBufferHeight
  }

  var limits = wrapLimits(
    gl,
    extensions)

  var bufferState = wrapBuffers(gl)

  var elementState = wrapElements(
    gl,
    extensions,
    bufferState)

  var uniformState = wrapUniforms(stringStore)

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
    function (program) {
      return compiler.draw(program)
    },
    stringStore)

  var drawState = wrapDraw(
    gl,
    extensions,
    bufferState)

  var textureState = wrapTextures(
    gl,
    extensions,
    limits,
    poll,
    viewportState)

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

  var frameState = {
    count: 0,
    start: clock(),
    dt: 0,
    t: clock(),
    renderTime: 0,
    width: gl.drawingBufferWidth,
    height: gl.drawingBufferHeight,
    pixelRatio: options.pixelRatio
  }

  var glState = wrapContext(
    gl,
    framebufferState,
    viewportState)

  var readPixels = wrapRead(gl, poll, viewportState)

  var compiler = createCompiler(
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
    frameState,
    poll)

  var canvas = gl.canvas

  // raf stuff
  var rafCallbacks = []
  var activeRAF = 0
  function handleRAF () {
    activeRAF = raf.next(handleRAF)
    frameState.count += 1

    if (frameState.width !== gl.drawingBufferWidth ||
        frameState.height !== gl.drawingBufferHeight) {
      frameState.width = gl.drawingBufferWidth
      frameState.height = gl.drawingBufferHeight
      glState.notifyViewportChanged()
    }

    var now = clock()
    frameState.dt = now - frameState.t
    frameState.t = now

    textureState.poll()

    for (var i = 0; i < rafCallbacks.length; ++i) {
      var cb = rafCallbacks[i]
      cb(frameState.count, frameState.t, frameState.dt)
    }
    frameState.renderTime = clock() - now
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

  // Resource destructuion
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

    var hasDynamic = false

    function flattenNestedOptions (options) {
      var result = extend({}, options)
      delete result.uniforms
      delete result.attributes

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
    var opts = separateDynamic(flattenNestedOptions(options))

    var compiled = compiler.command(
      opts.static, uniforms.static, attributes.static,
      opts.dynamic, uniforms.dynamic, attributes.dynamic,
      hasDynamic)

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
      if (typeof args === 'number') {
        return batch(args | 0, reserve(args | 0))
      } else if (Array.isArray(args)) {
        return batch(args.length, args)
      } else if (typeof args === 'function') {
        return scope(null, args)
      } else if (typeof body === 'function') {
        return scope(args, body)
      }
      return draw(args)
    }

    return REGLCommand
  }

  function poll () {
    framebufferState.poll()
    glState.poll()
  }

  function clear (options) {
    var clearFlags = 0

    // Update context state
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

  // Registers another requestAnimationFrame callback
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

    // Short cut for prop binding
    prop: dynamic.define,

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
    stats: frameState,

    // System limits
    limits: limits,

    // Read pixels
    read: readPixels,

    // Destroy regl and all associated resources
    destroy: destroy
  })
}

},{"./lib/attribute":2,"./lib/buffer":3,"./lib/check":4,"./lib/clock":5,"./lib/compile":7,"./lib/context":11,"./lib/draw":12,"./lib/dynamic":13,"./lib/elements":14,"./lib/extend":15,"./lib/extension":16,"./lib/framebuffer":17,"./lib/limits":20,"./lib/raf":23,"./lib/read":24,"./lib/renderbuffer":25,"./lib/shader":26,"./lib/state":28,"./lib/strings":29,"./lib/texture":30,"./lib/uniform":32}]},{},[1])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJleGFtcGxlL2R5bmFtaWMuanMiLCJsaWIvYXR0cmlidXRlLmpzIiwibGliL2J1ZmZlci5qcyIsImxpYi9jaGVjay5qcyIsImxpYi9jbG9jay5qcyIsImxpYi9jb2RlZ2VuLmpzIiwibGliL2NvbXBpbGUuanMiLCJsaWIvY29uc3RhbnRzL2FycmF5dHlwZXMuanNvbiIsImxpYi9jb25zdGFudHMvZHR5cGVzLmpzb24iLCJsaWIvY29uc3RhbnRzL3ByaW1pdGl2ZXMuanNvbiIsImxpYi9jb250ZXh0LmpzIiwibGliL2RyYXcuanMiLCJsaWIvZHluYW1pYy5qcyIsImxpYi9lbGVtZW50cy5qcyIsImxpYi9leHRlbmQuanMiLCJsaWIvZXh0ZW5zaW9uLmpzIiwibGliL2ZyYW1lYnVmZmVyLmpzIiwibGliL2lzLW5kYXJyYXkuanMiLCJsaWIvaXMtdHlwZWQtYXJyYXkuanMiLCJsaWIvbGltaXRzLmpzIiwibGliL2xvYWQtdGV4dHVyZS5qcyIsImxpYi9wYXJzZS1kZHMuanMiLCJsaWIvcmFmLmpzIiwibGliL3JlYWQuanMiLCJsaWIvcmVuZGVyYnVmZmVyLmpzIiwibGliL3NoYWRlci5qcyIsImxpYi9zdGFjay5qcyIsImxpYi9zdGF0ZS5qcyIsImxpYi9zdHJpbmdzLmpzIiwibGliL3RleHR1cmUuanMiLCJsaWIvdG8taGFsZi1mbG9hdC5qcyIsImxpYi91bmlmb3JtLmpzIiwibGliL3ZhbHVlcy5qcyIsInJlZ2wuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ROQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdG1EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNaQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4SEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzd1QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2TEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0tBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxNUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEJBO0FBQ0E7QUFDQTtBQUNBOztBQ0hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsInZhciByZWdsID0gcmVxdWlyZSgnLi4vcmVnbCcpKClcblxudmFyIGRyYXcgPSByZWdsKHtcbiAgZnJhZzogYFxuICAgIHByZWNpc2lvbiBtZWRpdW1wIGZsb2F0O1xuICAgIHVuaWZvcm0gdmVjNCBjb2xvcjtcbiAgICB2b2lkIG1haW4oKSB7XG4gICAgICBnbF9GcmFnQ29sb3IgPSBjb2xvcjtcbiAgICB9YCxcblxuICB2ZXJ0OiBgXG4gICAgcHJlY2lzaW9uIG1lZGl1bXAgZmxvYXQ7XG4gICAgYXR0cmlidXRlIHZlYzIgcG9zaXRpb247XG4gICAgdW5pZm9ybSBmbG9hdCBhbmdsZTtcbiAgICB2b2lkIG1haW4oKSB7XG4gICAgICBnbF9Qb3NpdGlvbiA9IHZlYzQoXG4gICAgICAgIGNvcyhhbmdsZSkgKiBwb3NpdGlvbi54ICsgc2luKGFuZ2xlKSAqIHBvc2l0aW9uLnksXG4gICAgICAgIC1zaW4oYW5nbGUpICogcG9zaXRpb24ueCArIGNvcyhhbmdsZSkgKiBwb3NpdGlvbi55LCAwLCAxKTtcbiAgICB9YCxcblxuICBhdHRyaWJ1dGVzOiB7XG4gICAgcG9zaXRpb246IHJlZ2wuYnVmZmVyKFtcbiAgICAgIC0xLCAwLFxuICAgICAgMCwgLTEsXG4gICAgICAxLCAxXSlcbiAgfSxcblxuICB1bmlmb3Jtczoge1xuICAgIGNvbG9yOiByZWdsLnByb3AoJ2NvbG9yJyksXG4gICAgYW5nbGU6IGZ1bmN0aW9uIChhcmdzLCBiYXRjaElkLCBzdGF0cykge1xuICAgICAgcmV0dXJuIDAuMDEgKiBzdGF0cy5jb3VudFxuICAgIH1cbiAgfSxcblxuICBkZXB0aDoge1xuICAgIGVuYWJsZTogZmFsc2VcbiAgfSxcblxuICBjb3VudDogM1xufSlcblxucmVnbC5mcmFtZShmdW5jdGlvbiAoY291bnQpIHtcbiAgcmVnbC5jbGVhcih7XG4gICAgY29sb3I6IFswLCAwLCAwLCAxXVxuICB9KVxuXG4gIGRyYXcoe1xuICAgIGNvbG9yOiBbXG4gICAgICBNYXRoLnNpbigwLjAwMSAqIGNvdW50KSxcbiAgICAgIE1hdGguY29zKDAuMDIgKiBjb3VudCksXG4gICAgICBNYXRoLnNpbigwLjMgKiBjb3VudCksXG4gICAgICAxXG4gICAgXVxuICB9KVxufSlcbiIsInZhciBnbFR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvZHR5cGVzLmpzb24nKVxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vZXh0ZW5kJylcblxudmFyIEdMX0ZMT0FUID0gNTEyNlxuXG5mdW5jdGlvbiBBdHRyaWJ1dGVSZWNvcmQgKCkge1xuICB0aGlzLnBvaW50ZXIgPSBmYWxzZVxuXG4gIHRoaXMueCA9IDAuMFxuICB0aGlzLnkgPSAwLjBcbiAgdGhpcy56ID0gMC4wXG4gIHRoaXMudyA9IDAuMFxuXG4gIHRoaXMuYnVmZmVyID0gbnVsbFxuICB0aGlzLnNpemUgPSAwXG4gIHRoaXMubm9ybWFsaXplZCA9IGZhbHNlXG4gIHRoaXMudHlwZSA9IEdMX0ZMT0FUXG4gIHRoaXMub2Zmc2V0ID0gMFxuICB0aGlzLnN0cmlkZSA9IDBcbiAgdGhpcy5kaXZpc29yID0gMFxufVxuXG5leHRlbmQoQXR0cmlidXRlUmVjb3JkLnByb3RvdHlwZSwge1xuICBlcXVhbHM6IGZ1bmN0aW9uIChvdGhlciwgc2l6ZSkge1xuICAgIGlmICghdGhpcy5wb2ludGVyKSB7XG4gICAgICByZXR1cm4gIW90aGVyLnBvaW50ZXIgJiZcbiAgICAgICAgdGhpcy54ID09PSBvdGhlci54ICYmXG4gICAgICAgIHRoaXMueSA9PT0gb3RoZXIueSAmJlxuICAgICAgICB0aGlzLnogPT09IG90aGVyLnogJiZcbiAgICAgICAgdGhpcy53ID09PSBvdGhlci53XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBvdGhlci5wb2ludGVyICYmXG4gICAgICAgIHRoaXMuYnVmZmVyID09PSBvdGhlci5idWZmZXIgJiZcbiAgICAgICAgdGhpcy5zaXplID09PSBzaXplICYmXG4gICAgICAgIHRoaXMubm9ybWFsaXplZCA9PT0gb3RoZXIubm9ybWFsaXplZCAmJlxuICAgICAgICB0aGlzLnR5cGUgPT09IG90aGVyLnR5cGUgJiZcbiAgICAgICAgdGhpcy5vZmZzZXQgPT09IG90aGVyLm9mZnNldCAmJlxuICAgICAgICB0aGlzLnN0cmlkZSA9PT0gb3RoZXIuc3RyaWRlICYmXG4gICAgICAgIHRoaXMuZGl2aXNvciA9PT0gb3RoZXIuZGl2aXNvclxuICAgIH1cbiAgfSxcblxuICBzZXQ6IGZ1bmN0aW9uIChvdGhlciwgc2l6ZSkge1xuICAgIHZhciBwb2ludGVyID0gdGhpcy5wb2ludGVyID0gb3RoZXIucG9pbnRlclxuICAgIGlmIChwb2ludGVyKSB7XG4gICAgICB0aGlzLmJ1ZmZlciA9IG90aGVyLmJ1ZmZlclxuICAgICAgdGhpcy5zaXplID0gc2l6ZVxuICAgICAgdGhpcy5ub3JtYWxpemVkID0gb3RoZXIubm9ybWFsaXplZFxuICAgICAgdGhpcy50eXBlID0gb3RoZXIudHlwZVxuICAgICAgdGhpcy5vZmZzZXQgPSBvdGhlci5vZmZzZXRcbiAgICAgIHRoaXMuc3RyaWRlID0gb3RoZXIuc3RyaWRlXG4gICAgICB0aGlzLmRpdmlzb3IgPSBvdGhlci5kaXZpc29yXG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMueCA9IG90aGVyLnhcbiAgICAgIHRoaXMueSA9IG90aGVyLnlcbiAgICAgIHRoaXMueiA9IG90aGVyLnpcbiAgICAgIHRoaXMudyA9IG90aGVyLndcbiAgICB9XG4gIH1cbn0pXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcEF0dHJpYnV0ZVN0YXRlIChcbiAgZ2wsXG4gIGV4dGVuc2lvbnMsXG4gIGxpbWl0cyxcbiAgYnVmZmVyU3RhdGUsXG4gIHN0cmluZ1N0b3JlKSB7XG5cbiAgdmFyIGF0dHJpYnV0ZVN0YXRlID0ge31cblxuICB2YXIgTlVNX0FUVFJJQlVURVMgPSBsaW1pdHMubWF4QXR0cmlidXRlc1xuICB2YXIgYXR0cmlidXRlQmluZGluZ3MgPSBuZXcgQXJyYXkoTlVNX0FUVFJJQlVURVMpXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgTlVNX0FUVFJJQlVURVM7ICsraSkge1xuICAgIGF0dHJpYnV0ZUJpbmRpbmdzW2ldID0gbmV3IEF0dHJpYnV0ZVJlY29yZCgpXG4gIH1cblxuICBmdW5jdGlvbiBBdHRyaWJ1dGVTdGFjayAoKSB7XG4gICAgdmFyIHJlY29yZHMgPSBuZXcgQXJyYXkoMTYpXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCAxNjsgKytpKSB7XG4gICAgICByZWNvcmRzW2ldID0gbmV3IEF0dHJpYnV0ZVJlY29yZCgpXG4gICAgfVxuICAgIHRoaXMucmVjb3JkcyA9IHJlY29yZHNcbiAgICB0aGlzLnRvcCA9IDBcbiAgfVxuXG4gIGZ1bmN0aW9uIHB1c2hBdHRyaWJ1dGVTdGFjayAoc3RhY2spIHtcbiAgICB2YXIgcmVjb3JkcyA9IHN0YWNrLnJlY29yZHNcbiAgICB2YXIgdG9wID0gc3RhY2sudG9wXG5cbiAgICB3aGlsZSAocmVjb3Jkcy5sZW5ndGggLSAxIDw9IHRvcCkge1xuICAgICAgcmVjb3Jkcy5wdXNoKG5ldyBBdHRyaWJ1dGVSZWNvcmQoKSlcbiAgICB9XG5cbiAgICByZXR1cm4gcmVjb3Jkc1srK3N0YWNrLnRvcF1cbiAgfVxuXG4gIGV4dGVuZChBdHRyaWJ1dGVTdGFjay5wcm90b3R5cGUsIHtcbiAgICBwdXNoVmVjOiBmdW5jdGlvbiAoeCwgeSwgeiwgdykge1xuICAgICAgdmFyIGhlYWQgPSBwdXNoQXR0cmlidXRlU3RhY2sodGhpcylcbiAgICAgIGhlYWQucG9pbnRlciA9IGZhbHNlXG4gICAgICBoZWFkLnggPSB4XG4gICAgICBoZWFkLnkgPSB5XG4gICAgICBoZWFkLnogPSB6XG4gICAgICBoZWFkLncgPSB3XG4gICAgfSxcblxuICAgIHB1c2hQdHI6IGZ1bmN0aW9uIChcbiAgICAgIGJ1ZmZlcixcbiAgICAgIHNpemUsXG4gICAgICBvZmZzZXQsXG4gICAgICBzdHJpZGUsXG4gICAgICBkaXZpc29yLFxuICAgICAgbm9ybWFsaXplZCxcbiAgICAgIHR5cGUpIHtcbiAgICAgIHZhciBoZWFkID0gcHVzaEF0dHJpYnV0ZVN0YWNrKHRoaXMpXG4gICAgICBoZWFkLnBvaW50ZXIgPSB0cnVlXG4gICAgICBoZWFkLmJ1ZmZlciA9IGJ1ZmZlclxuICAgICAgaGVhZC5zaXplID0gc2l6ZVxuICAgICAgaGVhZC5vZmZzZXQgPSBvZmZzZXRcbiAgICAgIGhlYWQuc3RyaWRlID0gc3RyaWRlXG4gICAgICBoZWFkLmRpdmlzb3IgPSBkaXZpc29yXG4gICAgICBoZWFkLm5vcm1hbGl6ZWQgPSBub3JtYWxpemVkXG4gICAgICBoZWFkLnR5cGUgPSB0eXBlXG4gICAgfSxcblxuICAgIHB1c2hEeW46IGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICBpZiAodHlwZW9mIGRhdGEgPT09ICdudW1iZXInKSB7XG4gICAgICAgIHRoaXMucHVzaFZlYyhkYXRhLCAwLCAwLCAwKVxuICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XG4gICAgICAgIHRoaXMucHVzaFZlYyhkYXRhWzBdLCBkYXRhWzFdLCBkYXRhWzJdLCBkYXRhWzNdKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIGJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmdldEJ1ZmZlcihkYXRhKVxuICAgICAgICB2YXIgc2l6ZSA9IDBcbiAgICAgICAgdmFyIHN0cmlkZSA9IDBcbiAgICAgICAgdmFyIG9mZnNldCA9IDBcbiAgICAgICAgdmFyIGRpdmlzb3IgPSAwXG4gICAgICAgIHZhciBub3JtYWxpemVkID0gZmFsc2VcbiAgICAgICAgdmFyIHR5cGUgPSBHTF9GTE9BVFxuICAgICAgICBpZiAoIWJ1ZmZlcikge1xuICAgICAgICAgIGJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmdldEJ1ZmZlcihkYXRhLmJ1ZmZlcilcbiAgICAgICAgICBzaXplID0gZGF0YS5zaXplIHx8IDBcbiAgICAgICAgICBzdHJpZGUgPSBkYXRhLnN0cmlkZSB8fCAwXG4gICAgICAgICAgb2Zmc2V0ID0gZGF0YS5vZmZzZXQgfHwgMFxuICAgICAgICAgIGRpdmlzb3IgPSBkYXRhLmRpdmlzb3IgfHwgMFxuICAgICAgICAgIG5vcm1hbGl6ZWQgPSBkYXRhLm5vcm1hbGl6ZWQgfHwgZmFsc2VcbiAgICAgICAgICB0eXBlID0gYnVmZmVyLmR0eXBlXG4gICAgICAgICAgaWYgKCd0eXBlJyBpbiBkYXRhKSB7XG4gICAgICAgICAgICB0eXBlID0gZ2xUeXBlc1tkYXRhLnR5cGVdXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHR5cGUgPSBidWZmZXIuZHR5cGVcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnB1c2hQdHIoYnVmZmVyLCBzaXplLCBvZmZzZXQsIHN0cmlkZSwgZGl2aXNvciwgbm9ybWFsaXplZCwgdHlwZSlcbiAgICAgIH1cbiAgICB9LFxuXG4gICAgcG9wOiBmdW5jdGlvbiAoKSB7XG4gICAgICB0aGlzLnRvcCAtPSAxXG4gICAgfVxuICB9KVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBCSU5EIEFOIEFUVFJJQlVURVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgZnVuY3Rpb24gYmluZEF0dHJpYnV0ZSAoaW5kZXgsIGN1cnJlbnQsIG5leHQsIHNpemUpIHtcbiAgICBzaXplID0gbmV4dC5zaXplIHx8IHNpemVcbiAgICBpZiAoY3VycmVudC5lcXVhbHMobmV4dCwgc2l6ZSkpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBpZiAoIW5leHQucG9pbnRlcikge1xuICAgICAgaWYgKGN1cnJlbnQucG9pbnRlcikge1xuICAgICAgICBnbC5kaXNhYmxlVmVydGV4QXR0cmliQXJyYXkoaW5kZXgpXG4gICAgICB9XG4gICAgICBnbC52ZXJ0ZXhBdHRyaWI0ZihpbmRleCwgbmV4dC54LCBuZXh0LnksIG5leHQueiwgbmV4dC53KVxuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoIWN1cnJlbnQucG9pbnRlcikge1xuICAgICAgICBnbC5lbmFibGVWZXJ0ZXhBdHRyaWJBcnJheShpbmRleClcbiAgICAgIH1cbiAgICAgIGlmIChjdXJyZW50LmJ1ZmZlciAhPT0gbmV4dC5idWZmZXIpIHtcbiAgICAgICAgbmV4dC5idWZmZXIuYmluZCgpXG4gICAgICB9XG4gICAgICBnbC52ZXJ0ZXhBdHRyaWJQb2ludGVyKFxuICAgICAgICBpbmRleCxcbiAgICAgICAgc2l6ZSxcbiAgICAgICAgbmV4dC50eXBlLFxuICAgICAgICBuZXh0Lm5vcm1hbGl6ZWQsXG4gICAgICAgIG5leHQuc3RyaWRlLFxuICAgICAgICBuZXh0Lm9mZnNldClcbiAgICAgIHZhciBleHRJbnN0YW5jaW5nID0gZXh0ZW5zaW9ucy5hbmdsZV9pbnN0YW5jZWRfYXJyYXlzXG4gICAgICBpZiAoZXh0SW5zdGFuY2luZykge1xuICAgICAgICBleHRJbnN0YW5jaW5nLnZlcnRleEF0dHJpYkRpdmlzb3JBTkdMRShpbmRleCwgbmV4dC5kaXZpc29yKVxuICAgICAgfVxuICAgIH1cbiAgICBjdXJyZW50LnNldChuZXh0LCBzaXplKVxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIERFRklORSBBIE5FVyBBVFRSSUJVVEVcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIGRlZkF0dHJpYnV0ZSAobmFtZSkge1xuICAgIHZhciBpZCA9IHN0cmluZ1N0b3JlLmlkKG5hbWUpXG4gICAgdmFyIHJlc3VsdCA9IGF0dHJpYnV0ZVN0YXRlW2lkXVxuICAgIGlmICghcmVzdWx0KSB7XG4gICAgICByZXN1bHQgPSBhdHRyaWJ1dGVTdGF0ZVtpZF0gPSBuZXcgQXR0cmlidXRlU3RhY2soKVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGJpbmRpbmdzOiBhdHRyaWJ1dGVCaW5kaW5ncyxcbiAgICBiaW5kOiBiaW5kQXR0cmlidXRlLFxuICAgIGRlZjogZGVmQXR0cmlidXRlXG4gIH1cbn1cbiIsIi8vIEFycmF5IGFuZCBlbGVtZW50IGJ1ZmZlciBjcmVhdGlvblxudmFyIGNoZWNrID0gcmVxdWlyZSgnLi9jaGVjaycpXG52YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi9pcy10eXBlZC1hcnJheScpXG52YXIgaXNOREFycmF5TGlrZSA9IHJlcXVpcmUoJy4vaXMtbmRhcnJheScpXG52YXIgYXJyYXlUeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL2FycmF5dHlwZXMuanNvbicpXG52YXIgYnVmZmVyVHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9kdHlwZXMuanNvbicpXG52YXIgdmFsdWVzID0gcmVxdWlyZSgnLi92YWx1ZXMnKVxuXG52YXIgR0xfU1RBVElDX0RSQVcgPSAzNTA0NFxuXG52YXIgR0xfQllURSA9IDUxMjBcbnZhciBHTF9VTlNJR05FRF9CWVRFID0gNTEyMVxudmFyIEdMX1NIT1JUID0gNTEyMlxudmFyIEdMX1VOU0lHTkVEX1NIT1JUID0gNTEyM1xudmFyIEdMX0lOVCA9IDUxMjRcbnZhciBHTF9VTlNJR05FRF9JTlQgPSA1MTI1XG52YXIgR0xfRkxPQVQgPSA1MTI2XG5cbnZhciB1c2FnZVR5cGVzID0ge1xuICAnc3RhdGljJzogMzUwNDQsXG4gICdkeW5hbWljJzogMzUwNDgsXG4gICdzdHJlYW0nOiAzNTA0MFxufVxuXG5mdW5jdGlvbiB0eXBlZEFycmF5Q29kZSAoZGF0YSkge1xuICByZXR1cm4gYXJyYXlUeXBlc1tPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoZGF0YSldIHwgMFxufVxuXG5mdW5jdGlvbiBtYWtlVHlwZWRBcnJheSAoZHR5cGUsIGFyZ3MpIHtcbiAgc3dpdGNoIChkdHlwZSkge1xuICAgIGNhc2UgR0xfVU5TSUdORURfQllURTpcbiAgICAgIHJldHVybiBuZXcgVWludDhBcnJheShhcmdzKVxuICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlQ6XG4gICAgICByZXR1cm4gbmV3IFVpbnQxNkFycmF5KGFyZ3MpXG4gICAgY2FzZSBHTF9VTlNJR05FRF9JTlQ6XG4gICAgICByZXR1cm4gbmV3IFVpbnQzMkFycmF5KGFyZ3MpXG4gICAgY2FzZSBHTF9CWVRFOlxuICAgICAgcmV0dXJuIG5ldyBJbnQ4QXJyYXkoYXJncylcbiAgICBjYXNlIEdMX1NIT1JUOlxuICAgICAgcmV0dXJuIG5ldyBJbnQxNkFycmF5KGFyZ3MpXG4gICAgY2FzZSBHTF9JTlQ6XG4gICAgICByZXR1cm4gbmV3IEludDMyQXJyYXkoYXJncylcbiAgICBjYXNlIEdMX0ZMT0FUOlxuICAgICAgcmV0dXJuIG5ldyBGbG9hdDMyQXJyYXkoYXJncylcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIG51bGxcbiAgfVxufVxuXG5mdW5jdGlvbiBmbGF0dGVuIChyZXN1bHQsIGRhdGEsIGRpbWVuc2lvbikge1xuICB2YXIgcHRyID0gMFxuICBmb3IgKHZhciBpID0gMDsgaSA8IGRhdGEubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgdiA9IGRhdGFbaV1cbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IGRpbWVuc2lvbjsgKytqKSB7XG4gICAgICByZXN1bHRbcHRyKytdID0gdltqXVxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiB0cmFuc3Bvc2UgKHJlc3VsdCwgZGF0YSwgc2hhcGVYLCBzaGFwZVksIHN0cmlkZVgsIHN0cmlkZVksIG9mZnNldCkge1xuICB2YXIgcHRyID0gMFxuICBmb3IgKHZhciBpID0gMDsgaSA8IHNoYXBlWDsgKytpKSB7XG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBzaGFwZVk7ICsraikge1xuICAgICAgcmVzdWx0W3B0cisrXSA9IGRhdGFbc3RyaWRlWCAqIGkgKyBzdHJpZGVZICogaiArIG9mZnNldF1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBCdWZmZXJTdGF0ZSAoZ2wpIHtcbiAgdmFyIGJ1ZmZlckNvdW50ID0gMFxuICB2YXIgYnVmZmVyU2V0ID0ge31cblxuICBmdW5jdGlvbiBSRUdMQnVmZmVyIChidWZmZXIsIHR5cGUpIHtcbiAgICB0aGlzLmlkID0gYnVmZmVyQ291bnQrK1xuICAgIHRoaXMuYnVmZmVyID0gYnVmZmVyXG4gICAgdGhpcy50eXBlID0gdHlwZVxuICAgIHRoaXMudXNhZ2UgPSBHTF9TVEFUSUNfRFJBV1xuICAgIHRoaXMuYnl0ZUxlbmd0aCA9IDBcbiAgICB0aGlzLmRpbWVuc2lvbiA9IDFcbiAgICB0aGlzLmRhdGEgPSBudWxsXG4gICAgdGhpcy5kdHlwZSA9IEdMX1VOU0lHTkVEX0JZVEVcbiAgfVxuXG4gIFJFR0xCdWZmZXIucHJvdG90eXBlLmJpbmQgPSBmdW5jdGlvbiAoKSB7XG4gICAgZ2wuYmluZEJ1ZmZlcih0aGlzLnR5cGUsIHRoaXMuYnVmZmVyKVxuICB9XG5cbiAgZnVuY3Rpb24gcmVmcmVzaCAoYnVmZmVyKSB7XG4gICAgaWYgKCFnbC5pc0J1ZmZlcihidWZmZXIuYnVmZmVyKSkge1xuICAgICAgYnVmZmVyLmJ1ZmZlciA9IGdsLmNyZWF0ZUJ1ZmZlcigpXG4gICAgfVxuICAgIGJ1ZmZlci5iaW5kKClcbiAgICBnbC5idWZmZXJEYXRhKGJ1ZmZlci50eXBlLCBidWZmZXIuZGF0YSB8fCBidWZmZXIuYnl0ZUxlbmd0aCwgYnVmZmVyLnVzYWdlKVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSAoYnVmZmVyKSB7XG4gICAgdmFyIGhhbmRsZSA9IGJ1ZmZlci5idWZmZXJcbiAgICBjaGVjayhoYW5kbGUsICdidWZmZXIgbXVzdCBub3QgYmUgZGVsZXRlZCBhbHJlYWR5JylcbiAgICBpZiAoZ2wuaXNCdWZmZXIoaGFuZGxlKSkge1xuICAgICAgZ2wuZGVsZXRlQnVmZmVyKGhhbmRsZSlcbiAgICB9XG4gICAgYnVmZmVyLmJ1ZmZlciA9IG51bGxcbiAgICBkZWxldGUgYnVmZmVyU2V0W2J1ZmZlci5pZF1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZUJ1ZmZlciAob3B0aW9ucywgdHlwZSwgZGVmZXJJbml0KSB7XG4gICAgdmFyIGhhbmRsZSA9IGdsLmNyZWF0ZUJ1ZmZlcigpXG5cbiAgICB2YXIgYnVmZmVyID0gbmV3IFJFR0xCdWZmZXIoaGFuZGxlLCB0eXBlKVxuICAgIGJ1ZmZlclNldFtidWZmZXIuaWRdID0gYnVmZmVyXG5cbiAgICBmdW5jdGlvbiByZWdsQnVmZmVyIChpbnB1dCkge1xuICAgICAgdmFyIG9wdGlvbnMgPSBpbnB1dCB8fCB7fVxuICAgICAgaWYgKEFycmF5LmlzQXJyYXkob3B0aW9ucykgfHxcbiAgICAgICAgICBpc1R5cGVkQXJyYXkob3B0aW9ucykgfHxcbiAgICAgICAgICBpc05EQXJyYXlMaWtlKG9wdGlvbnMpKSB7XG4gICAgICAgIG9wdGlvbnMgPSB7XG4gICAgICAgICAgZGF0YTogb3B0aW9uc1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBvcHRpb25zID09PSAnbnVtYmVyJykge1xuICAgICAgICBvcHRpb25zID0ge1xuICAgICAgICAgIGxlbmd0aDogb3B0aW9ucyB8IDBcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChvcHRpb25zID09PSBudWxsIHx8IG9wdGlvbnMgPT09IHZvaWQgMCkge1xuICAgICAgICBvcHRpb25zID0ge31cbiAgICAgIH1cblxuICAgICAgY2hlY2sudHlwZShcbiAgICAgICAgb3B0aW9ucywgJ29iamVjdCcsXG4gICAgICAgICdidWZmZXIgYXJndW1lbnRzIG11c3QgYmUgYW4gb2JqZWN0LCBhIG51bWJlciBvciBhbiBhcnJheScpXG5cbiAgICAgIGlmICgndXNhZ2UnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIHVzYWdlID0gb3B0aW9ucy51c2FnZVxuICAgICAgICBjaGVjay5wYXJhbWV0ZXIodXNhZ2UsIHVzYWdlVHlwZXMsICdpbnZhbGlkIGJ1ZmZlciB1c2FnZScpXG4gICAgICAgIGJ1ZmZlci51c2FnZSA9IHVzYWdlVHlwZXNbb3B0aW9ucy51c2FnZV1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGJ1ZmZlci51c2FnZSA9IEdMX1NUQVRJQ19EUkFXXG4gICAgICB9XG5cbiAgICAgIHZhciBkdHlwZSA9IDBcbiAgICAgIGlmICgndHlwZScgaW4gb3B0aW9ucykge1xuICAgICAgICBjaGVjay5wYXJhbWV0ZXIob3B0aW9ucy50eXBlLCBidWZmZXJUeXBlcywgJ2ludmFsaWQgYnVmZmVyIHR5cGUnKVxuICAgICAgICBkdHlwZSA9IGJ1ZmZlclR5cGVzW29wdGlvbnMudHlwZV1cbiAgICAgIH1cblxuICAgICAgdmFyIGRpbWVuc2lvbiA9IChvcHRpb25zLmRpbWVuc2lvbiB8IDApIHx8IDFcbiAgICAgIHZhciBieXRlTGVuZ3RoID0gMFxuICAgICAgdmFyIGRhdGEgPSBudWxsXG4gICAgICBpZiAoJ2RhdGEnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgZGF0YSA9IG9wdGlvbnMuZGF0YVxuICAgICAgICBpZiAoZGF0YSA9PT0gbnVsbCkge1xuICAgICAgICAgIGJ5dGVMZW5ndGggPSBvcHRpb25zLmxlbmd0aCB8IDBcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAoaXNOREFycmF5TGlrZShkYXRhKSkge1xuICAgICAgICAgICAgdmFyIHNoYXBlID0gZGF0YS5zaGFwZVxuICAgICAgICAgICAgdmFyIHN0cmlkZSA9IGRhdGEuc3RyaWRlXG4gICAgICAgICAgICB2YXIgb2Zmc2V0ID0gZGF0YS5vZmZzZXRcblxuICAgICAgICAgICAgdmFyIHNoYXBlWCA9IDBcbiAgICAgICAgICAgIHZhciBzaGFwZVkgPSAwXG4gICAgICAgICAgICB2YXIgc3RyaWRlWCA9IDBcbiAgICAgICAgICAgIHZhciBzdHJpZGVZID0gMFxuICAgICAgICAgICAgaWYgKHNoYXBlLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgICBzaGFwZVggPSBzaGFwZVswXVxuICAgICAgICAgICAgICBzaGFwZVkgPSAxXG4gICAgICAgICAgICAgIHN0cmlkZVggPSBzdHJpZGVbMF1cbiAgICAgICAgICAgICAgc3RyaWRlWSA9IDBcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc2hhcGUubGVuZ3RoID09PSAyKSB7XG4gICAgICAgICAgICAgIHNoYXBlWCA9IHNoYXBlWzBdXG4gICAgICAgICAgICAgIHNoYXBlWSA9IHNoYXBlWzFdXG4gICAgICAgICAgICAgIHN0cmlkZVggPSBzdHJpZGVbMF1cbiAgICAgICAgICAgICAgc3RyaWRlWSA9IHN0cmlkZVsxXVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgY2hlY2sucmFpc2UoJ2ludmFsaWQgc2hhcGUnKVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBkdHlwZSA9IGR0eXBlIHx8IHR5cGVkQXJyYXlDb2RlKGRhdGEpIHx8IEdMX0ZMT0FUXG4gICAgICAgICAgICBkaW1lbnNpb24gPSBzaGFwZVlcbiAgICAgICAgICAgIGRhdGEgPSB0cmFuc3Bvc2UoXG4gICAgICAgICAgICAgIG1ha2VUeXBlZEFycmF5KGR0eXBlLCBzaGFwZVggKiBzaGFwZVkpLFxuICAgICAgICAgICAgICBkYXRhLmRhdGEsXG4gICAgICAgICAgICAgIHNoYXBlWCwgc2hhcGVZLFxuICAgICAgICAgICAgICBzdHJpZGVYLCBzdHJpZGVZLFxuICAgICAgICAgICAgICBvZmZzZXQpXG4gICAgICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XG4gICAgICAgICAgICBpZiAoZGF0YS5sZW5ndGggPiAwICYmIEFycmF5LmlzQXJyYXkoZGF0YVswXSkpIHtcbiAgICAgICAgICAgICAgZGltZW5zaW9uID0gZGF0YVswXS5sZW5ndGhcbiAgICAgICAgICAgICAgZHR5cGUgPSBkdHlwZSB8fCBHTF9GTE9BVFxuICAgICAgICAgICAgICB2YXIgcmVzdWx0ID0gbWFrZVR5cGVkQXJyYXkoZHR5cGUsIGRhdGEubGVuZ3RoICogZGltZW5zaW9uKVxuICAgICAgICAgICAgICBkYXRhID0gZmxhdHRlbihyZXN1bHQsIGRhdGEsIGRpbWVuc2lvbilcbiAgICAgICAgICAgICAgZGF0YSA9IHJlc3VsdFxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgZHR5cGUgPSBkdHlwZSB8fCBHTF9GTE9BVFxuICAgICAgICAgICAgICBkYXRhID0gbWFrZVR5cGVkQXJyYXkoZHR5cGUsIGRhdGEpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNoZWNrLmlzVHlwZWRBcnJheShkYXRhLCAnaW52YWxpZCBkYXRhIHR5cGUgYnVmZmVyIGRhdGEnKVxuICAgICAgICAgICAgZHR5cGUgPSBkdHlwZSB8fCB0eXBlZEFycmF5Q29kZShkYXRhKVxuICAgICAgICAgIH1cbiAgICAgICAgICBieXRlTGVuZ3RoID0gZGF0YS5ieXRlTGVuZ3RoXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoJ2xlbmd0aCcgaW4gb3B0aW9ucykge1xuICAgICAgICBieXRlTGVuZ3RoID0gb3B0aW9ucy5sZW5ndGggfCAwXG4gICAgICAgIGNoZWNrLm5uaShieXRlTGVuZ3RoLCAnYnVmZmVyIGxlbmd0aCBtdXN0IGJlIGEgbm9ubmVnYXRpdmUgaW50ZWdlcicpXG4gICAgICB9XG5cbiAgICAgIGJ1ZmZlci5kYXRhID0gZGF0YVxuICAgICAgYnVmZmVyLmR0eXBlID0gZHR5cGUgfHwgR0xfVU5TSUdORURfQllURVxuICAgICAgYnVmZmVyLmJ5dGVMZW5ndGggPSBieXRlTGVuZ3RoXG4gICAgICBidWZmZXIuZGltZW5zaW9uID0gZGltZW5zaW9uXG5cbiAgICAgIHJlZnJlc2goYnVmZmVyKVxuXG4gICAgICByZXR1cm4gcmVnbEJ1ZmZlclxuICAgIH1cblxuICAgIGlmICghZGVmZXJJbml0KSB7XG4gICAgICByZWdsQnVmZmVyKG9wdGlvbnMpXG4gICAgfVxuXG4gICAgcmVnbEJ1ZmZlci5fcmVnbFR5cGUgPSAnYnVmZmVyJ1xuICAgIHJlZ2xCdWZmZXIuX2J1ZmZlciA9IGJ1ZmZlclxuICAgIHJlZ2xCdWZmZXIuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHsgZGVzdHJveShidWZmZXIpIH1cblxuICAgIHJldHVybiByZWdsQnVmZmVyXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNyZWF0ZTogY3JlYXRlQnVmZmVyLFxuXG4gICAgY2xlYXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhbHVlcyhidWZmZXJTZXQpLmZvckVhY2goZGVzdHJveSlcbiAgICB9LFxuXG4gICAgcmVmcmVzaDogZnVuY3Rpb24gKCkge1xuICAgICAgdmFsdWVzKGJ1ZmZlclNldCkuZm9yRWFjaChyZWZyZXNoKVxuICAgIH0sXG5cbiAgICBnZXRCdWZmZXI6IGZ1bmN0aW9uICh3cmFwcGVyKSB7XG4gICAgICBpZiAod3JhcHBlciAmJiB3cmFwcGVyLl9idWZmZXIgaW5zdGFuY2VvZiBSRUdMQnVmZmVyKSB7XG4gICAgICAgIHJldHVybiB3cmFwcGVyLl9idWZmZXJcbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuICB9XG59XG4iLCIvLyBFcnJvciBjaGVja2luZyBhbmQgcGFyYW1ldGVyIHZhbGlkYXRpb25cbnZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL2lzLXR5cGVkLWFycmF5JylcbnZhciBleHRlbmQgPSByZXF1aXJlKCcuL2V4dGVuZCcpXG5cbmZ1bmN0aW9uIHJhaXNlIChtZXNzYWdlKSB7XG4gIHZhciBlcnJvciA9IG5ldyBFcnJvcignKHJlZ2wpICcgKyBtZXNzYWdlKVxuICBjb25zb2xlLmVycm9yKGVycm9yKVxuICB0aHJvdyBlcnJvclxufVxuXG5mdW5jdGlvbiBjaGVjayAocHJlZCwgbWVzc2FnZSkge1xuICBpZiAoIXByZWQpIHtcbiAgICByYWlzZShtZXNzYWdlKVxuICB9XG59XG5cbmZ1bmN0aW9uIGVuY29sb24gKG1lc3NhZ2UpIHtcbiAgaWYgKG1lc3NhZ2UpIHtcbiAgICByZXR1cm4gJzogJyArIG1lc3NhZ2VcbiAgfVxuICByZXR1cm4gJydcbn1cblxuZnVuY3Rpb24gY2hlY2tQYXJhbWV0ZXIgKHBhcmFtLCBwb3NzaWJpbGl0aWVzLCBtZXNzYWdlKSB7XG4gIGlmICghKHBhcmFtIGluIHBvc3NpYmlsaXRpZXMpKSB7XG4gICAgcmFpc2UoJ3Vua25vd24gcGFyYW1ldGVyICgnICsgcGFyYW0gKyAnKScgKyBlbmNvbG9uKG1lc3NhZ2UpICtcbiAgICAgICAgICAnLiBwb3NzaWJsZSB2YWx1ZXM6ICcgKyBPYmplY3Qua2V5cyhwb3NzaWJpbGl0aWVzKS5qb2luKCkpXG4gIH1cbn1cblxuZnVuY3Rpb24gY2hlY2tJc1R5cGVkQXJyYXkgKGRhdGEsIG1lc3NhZ2UpIHtcbiAgaWYgKCFpc1R5cGVkQXJyYXkoZGF0YSkpIHtcbiAgICByYWlzZShcbiAgICAgICdpbnZhbGlkIHBhcmFtZXRlciB0eXBlJyArIGVuY29sb24obWVzc2FnZSkgK1xuICAgICAgJy4gbXVzdCBiZSBhIHR5cGVkIGFycmF5JylcbiAgfVxufVxuXG5mdW5jdGlvbiBjaGVja1R5cGVPZiAodmFsdWUsIHR5cGUsIG1lc3NhZ2UpIHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gdHlwZSkge1xuICAgIHJhaXNlKFxuICAgICAgJ2ludmFsaWQgcGFyYW1ldGVyIHR5cGUnICsgZW5jb2xvbihtZXNzYWdlKSArXG4gICAgICAnLiBleHBlY3RlZCAnICsgdHlwZSArICcsIGdvdCAnICsgKHR5cGVvZiB2YWx1ZSkpXG4gIH1cbn1cblxuZnVuY3Rpb24gY2hlY2tOb25OZWdhdGl2ZUludCAodmFsdWUsIG1lc3NhZ2UpIHtcbiAgaWYgKCEoKHZhbHVlID49IDApICYmXG4gICAgICAgICgodmFsdWUgfCAwKSA9PT0gdmFsdWUpKSkge1xuICAgIHJhaXNlKCdpbnZhbGlkIHBhcmFtZXRlciB0eXBlLCAoJyArIHZhbHVlICsgJyknICsgZW5jb2xvbihtZXNzYWdlKSArXG4gICAgICAgICAgJy4gbXVzdCBiZSBhIG5vbm5lZ2F0aXZlIGludGVnZXInKVxuICB9XG59XG5cbmZ1bmN0aW9uIGNoZWNrT25lT2YgKHZhbHVlLCBsaXN0LCBtZXNzYWdlKSB7XG4gIGlmIChsaXN0LmluZGV4T2YodmFsdWUpIDwgMCkge1xuICAgIHJhaXNlKCdpbnZhbGlkIHZhbHVlJyArIGVuY29sb24obWVzc2FnZSkgKyAnLiBtdXN0IGJlIG9uZSBvZjogJyArIGxpc3QpXG4gIH1cbn1cblxuZnVuY3Rpb24gY2hlY2tTaGFkZXJFcnJvciAoZ2wsIHNoYWRlciwgc291cmNlLCB0eXBlKSB7XG4gIGlmICghZ2wuZ2V0U2hhZGVyUGFyYW1ldGVyKHNoYWRlciwgZ2wuQ09NUElMRV9TVEFUVVMpKSB7XG4gICAgdmFyIGVyckxvZyA9IGdsLmdldFNoYWRlckluZm9Mb2coc2hhZGVyKVxuICAgIGNoZWNrLnJhaXNlKCdFcnJvciBjb21waWxpbmcgc2hhZGVyOlxcbicgKyBlcnJMb2cpXG4gIH1cbn1cblxuZnVuY3Rpb24gY2hlY2tMaW5rRXJyb3IgKGdsLCBwcm9ncmFtKSB7XG4gIGlmICghZ2wuZ2V0UHJvZ3JhbVBhcmFtZXRlcihwcm9ncmFtLCBnbC5MSU5LX1NUQVRVUykpIHtcbiAgICB2YXIgZXJyTG9nID0gZ2wuZ2V0UHJvZ3JhbUluZm9Mb2cocHJvZ3JhbSlcbiAgICBjaGVjay5yYWlzZSgnRXJyb3IgbGlua2luZyBwcm9ncmFtOlxcbicgKyBlcnJMb2cpXG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBleHRlbmQoY2hlY2ssIHtcbiAgcmFpc2U6IHJhaXNlLFxuICBwYXJhbWV0ZXI6IGNoZWNrUGFyYW1ldGVyLFxuICB0eXBlOiBjaGVja1R5cGVPZixcbiAgaXNUeXBlZEFycmF5OiBjaGVja0lzVHlwZWRBcnJheSxcbiAgbm5pOiBjaGVja05vbk5lZ2F0aXZlSW50LFxuICBvbmVPZjogY2hlY2tPbmVPZixcbiAgc2hhZGVyRXJyb3I6IGNoZWNrU2hhZGVyRXJyb3IsXG4gIGxpbmtFcnJvcjogY2hlY2tMaW5rRXJyb3Jcbn0pXG4iLCIvKiBnbG9iYWxzIHBlcmZvcm1hbmNlICovXG5tb2R1bGUuZXhwb3J0cyA9XG4gICh0eXBlb2YgcGVyZm9ybWFuY2UgIT09ICd1bmRlZmluZWQnICYmIHBlcmZvcm1hbmNlLm5vdylcbiAgPyBmdW5jdGlvbiAoKSB7IHJldHVybiBwZXJmb3JtYW5jZS5ub3coKSB9XG4gIDogZnVuY3Rpb24gKCkgeyByZXR1cm4gKyhuZXcgRGF0ZSgpKSB9XG4iLCJ2YXIgZXh0ZW5kID0gcmVxdWlyZSgnLi9leHRlbmQnKVxuXG5mdW5jdGlvbiBzbGljZSAoeCkge1xuICByZXR1cm4gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoeClcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjcmVhdGVFbnZpcm9ubWVudCAoKSB7XG4gIC8vIFVuaXF1ZSB2YXJpYWJsZSBpZCBjb3VudGVyXG4gIHZhciB2YXJDb3VudGVyID0gMFxuXG4gIC8vIExpbmtlZCB2YWx1ZXMgYXJlIHBhc3NlZCBmcm9tIHRoaXMgc2NvcGUgaW50byB0aGUgZ2VuZXJhdGVkIGNvZGUgYmxvY2tcbiAgLy8gQ2FsbGluZyBsaW5rKCkgcGFzc2VzIGEgdmFsdWUgaW50byB0aGUgZ2VuZXJhdGVkIHNjb3BlIGFuZCByZXR1cm5zXG4gIC8vIHRoZSB2YXJpYWJsZSBuYW1lIHdoaWNoIGl0IGlzIGJvdW5kIHRvXG4gIHZhciBsaW5rZWROYW1lcyA9IFtdXG4gIHZhciBsaW5rZWRWYWx1ZXMgPSBbXVxuICBmdW5jdGlvbiBsaW5rICh2YWx1ZSkge1xuICAgIHZhciBuYW1lID0gJ2cnICsgKHZhckNvdW50ZXIrKylcbiAgICBsaW5rZWROYW1lcy5wdXNoKG5hbWUpXG4gICAgbGlua2VkVmFsdWVzLnB1c2godmFsdWUpXG4gICAgcmV0dXJuIG5hbWVcbiAgfVxuXG4gIC8vIGNyZWF0ZSBhIGNvZGUgYmxvY2tcbiAgZnVuY3Rpb24gYmxvY2sgKCkge1xuICAgIHZhciBjb2RlID0gW11cbiAgICBmdW5jdGlvbiBwdXNoICgpIHtcbiAgICAgIGNvZGUucHVzaC5hcHBseShjb2RlLCBzbGljZShhcmd1bWVudHMpKVxuICAgIH1cblxuICAgIHZhciB2YXJzID0gW11cbiAgICBmdW5jdGlvbiBkZWYgKCkge1xuICAgICAgdmFyIG5hbWUgPSAndicgKyAodmFyQ291bnRlcisrKVxuICAgICAgdmFycy5wdXNoKG5hbWUpXG5cbiAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb2RlLnB1c2gobmFtZSwgJz0nKVxuICAgICAgICBjb2RlLnB1c2guYXBwbHkoY29kZSwgc2xpY2UoYXJndW1lbnRzKSlcbiAgICAgICAgY29kZS5wdXNoKCc7JylcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG5hbWVcbiAgICB9XG5cbiAgICByZXR1cm4gZXh0ZW5kKHB1c2gsIHtcbiAgICAgIGRlZjogZGVmLFxuICAgICAgdG9TdHJpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAodmFycy5sZW5ndGggPiAwID8gJ3ZhciAnICsgdmFycyArICc7JyA6ICcnKSxcbiAgICAgICAgICBjb2RlLmpvaW4oJycpXG4gICAgICAgIF0uam9pbignJylcbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgLy8gcHJvY2VkdXJlIGxpc3RcbiAgdmFyIHByb2NlZHVyZXMgPSB7fVxuICBmdW5jdGlvbiBwcm9jIChuYW1lKSB7XG4gICAgdmFyIGFyZ3MgPSBbXVxuICAgIGZ1bmN0aW9uIGFyZyAoKSB7XG4gICAgICB2YXIgbmFtZSA9ICdhJyArICh2YXJDb3VudGVyKyspXG4gICAgICBhcmdzLnB1c2gobmFtZSlcbiAgICAgIHJldHVybiBuYW1lXG4gICAgfVxuXG4gICAgdmFyIGJvZHkgPSBibG9jaygpXG4gICAgdmFyIGJvZHlUb1N0cmluZyA9IGJvZHkudG9TdHJpbmdcblxuICAgIHZhciByZXN1bHQgPSBwcm9jZWR1cmVzW25hbWVdID0gZXh0ZW5kKGJvZHksIHtcbiAgICAgIGFyZzogYXJnLFxuICAgICAgdG9TdHJpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAnZnVuY3Rpb24oJywgYXJncy5qb2luKCksICcpeycsXG4gICAgICAgICAgYm9keVRvU3RyaW5nKCksXG4gICAgICAgICAgJ30nXG4gICAgICAgIF0uam9pbignJylcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG5cbiAgZnVuY3Rpb24gY29tcGlsZSAoKSB7XG4gICAgdmFyIGNvZGUgPSBbJ1widXNlIHN0cmljdFwiO3JldHVybiB7J11cbiAgICBPYmplY3Qua2V5cyhwcm9jZWR1cmVzKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICBjb2RlLnB1c2goJ1wiJywgbmFtZSwgJ1wiOicsIHByb2NlZHVyZXNbbmFtZV0udG9TdHJpbmcoKSwgJywnKVxuICAgIH0pXG4gICAgY29kZS5wdXNoKCd9JylcbiAgICB2YXIgcHJvYyA9IEZ1bmN0aW9uLmFwcGx5KG51bGwsIGxpbmtlZE5hbWVzLmNvbmNhdChbY29kZS5qb2luKCcnKV0pKVxuICAgIHJldHVybiBwcm9jLmFwcGx5KG51bGwsIGxpbmtlZFZhbHVlcylcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgbGluazogbGluayxcbiAgICBibG9jazogYmxvY2ssXG4gICAgcHJvYzogcHJvYyxcbiAgICBjb21waWxlOiBjb21waWxlXG4gIH1cbn1cbiIsInZhciBjaGVjayA9IHJlcXVpcmUoJy4vY2hlY2snKVxudmFyIGNyZWF0ZUVudmlyb25tZW50ID0gcmVxdWlyZSgnLi9jb2RlZ2VuJylcblxudmFyIHByaW1UeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL3ByaW1pdGl2ZXMuanNvbicpXG52YXIgZ2xUeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL2R0eXBlcy5qc29uJylcblxudmFyIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSID0gMzQ5NjNcblxudmFyIEdMX0ZMT0FUID0gNTEyNlxudmFyIEdMX0ZMT0FUX1ZFQzIgPSAzNTY2NFxudmFyIEdMX0ZMT0FUX1ZFQzMgPSAzNTY2NVxudmFyIEdMX0ZMT0FUX1ZFQzQgPSAzNTY2NlxudmFyIEdMX0lOVCA9IDUxMjRcbnZhciBHTF9JTlRfVkVDMiA9IDM1NjY3XG52YXIgR0xfSU5UX1ZFQzMgPSAzNTY2OFxudmFyIEdMX0lOVF9WRUM0ID0gMzU2NjlcbnZhciBHTF9CT09MID0gMzU2NzBcbnZhciBHTF9CT09MX1ZFQzIgPSAzNTY3MVxudmFyIEdMX0JPT0xfVkVDMyA9IDM1NjcyXG52YXIgR0xfQk9PTF9WRUM0ID0gMzU2NzNcbnZhciBHTF9GTE9BVF9NQVQyID0gMzU2NzRcbnZhciBHTF9GTE9BVF9NQVQzID0gMzU2NzVcbnZhciBHTF9GTE9BVF9NQVQ0ID0gMzU2NzZcbnZhciBHTF9TQU1QTEVSXzJEID0gMzU2NzhcbnZhciBHTF9TQU1QTEVSX0NVQkUgPSAzNTY4MFxuXG52YXIgR0xfVFJJQU5HTEVTID0gNFxuXG52YXIgR0xfQ1VMTF9GQUNFID0gMHgwQjQ0XG52YXIgR0xfQkxFTkQgPSAweDBCRTJcbnZhciBHTF9ESVRIRVIgPSAweDBCRDBcbnZhciBHTF9TVEVOQ0lMX1RFU1QgPSAweDBCOTBcbnZhciBHTF9ERVBUSF9URVNUID0gMHgwQjcxXG52YXIgR0xfU0NJU1NPUl9URVNUID0gMHgwQzExXG52YXIgR0xfUE9MWUdPTl9PRkZTRVRfRklMTCA9IDB4ODAzN1xudmFyIEdMX1NBTVBMRV9BTFBIQV9UT19DT1ZFUkFHRSA9IDB4ODA5RVxudmFyIEdMX1NBTVBMRV9DT1ZFUkFHRSA9IDB4ODBBMFxuXG52YXIgR0xfRlJPTlQgPSAxMDI4XG52YXIgR0xfQkFDSyA9IDEwMjlcblxudmFyIEdMX0NXID0gMHgwOTAwXG52YXIgR0xfQ0NXID0gMHgwOTAxXG5cbnZhciBHTF9NSU5fRVhUID0gMHg4MDA3XG52YXIgR0xfTUFYX0VYVCA9IDB4ODAwOFxuXG52YXIgYmxlbmRGdW5jcyA9IHtcbiAgJzAnOiAwLFxuICAnMSc6IDEsXG4gICd6ZXJvJzogMCxcbiAgJ29uZSc6IDEsXG4gICdzcmMgY29sb3InOiA3NjgsXG4gICdvbmUgbWludXMgc3JjIGNvbG9yJzogNzY5LFxuICAnc3JjIGFscGhhJzogNzcwLFxuICAnb25lIG1pbnVzIHNyYyBhbHBoYSc6IDc3MSxcbiAgJ2RzdCBjb2xvcic6IDc3NCxcbiAgJ29uZSBtaW51cyBkc3QgY29sb3InOiA3NzUsXG4gICdkc3QgYWxwaGEnOiA3NzIsXG4gICdvbmUgbWludXMgZHN0IGFscGhhJzogNzczLFxuICAnY29uc3RhbnQgY29sb3InOiAzMjc2OSxcbiAgJ29uZSBtaW51cyBjb25zdGFudCBjb2xvcic6IDMyNzcwLFxuICAnY29uc3RhbnQgYWxwaGEnOiAzMjc3MSxcbiAgJ29uZSBtaW51cyBjb25zdGFudCBhbHBoYSc6IDMyNzcyLFxuICAnc3JjIGFscGhhIHNhdHVyYXRlJzogNzc2XG59XG5cbnZhciBjb21wYXJlRnVuY3MgPSB7XG4gICduZXZlcic6IDUxMixcbiAgJ2xlc3MnOiA1MTMsXG4gICc8JzogNTEzLFxuICAnZXF1YWwnOiA1MTQsXG4gICc9JzogNTE0LFxuICAnPT0nOiA1MTQsXG4gICc9PT0nOiA1MTQsXG4gICdsZXF1YWwnOiA1MTUsXG4gICc8PSc6IDUxNSxcbiAgJ2dyZWF0ZXInOiA1MTYsXG4gICc+JzogNTE2LFxuICAnbm90ZXF1YWwnOiA1MTcsXG4gICchPSc6IDUxNyxcbiAgJyE9PSc6IDUxNyxcbiAgJ2dlcXVhbCc6IDUxOCxcbiAgJz49JzogNTE4LFxuICAnYWx3YXlzJzogNTE5XG59XG5cbnZhciBzdGVuY2lsT3BzID0ge1xuICAnMCc6IDAsXG4gICd6ZXJvJzogMCxcbiAgJ2tlZXAnOiA3NjgwLFxuICAncmVwbGFjZSc6IDc2ODEsXG4gICdpbmNyZW1lbnQnOiA3NjgyLFxuICAnZGVjcmVtZW50JzogNzY4MyxcbiAgJ2luY3JlbWVudCB3cmFwJzogMzQwNTUsXG4gICdkZWNyZW1lbnQgd3JhcCc6IDM0MDU2LFxuICAnaW52ZXJ0JzogNTM4NlxufVxuXG5mdW5jdGlvbiB0eXBlTGVuZ3RoICh4KSB7XG4gIHN3aXRjaCAoeCkge1xuICAgIGNhc2UgR0xfRkxPQVRfVkVDMjpcbiAgICBjYXNlIEdMX0lOVF9WRUMyOlxuICAgIGNhc2UgR0xfQk9PTF9WRUMyOlxuICAgICAgcmV0dXJuIDJcbiAgICBjYXNlIEdMX0ZMT0FUX1ZFQzM6XG4gICAgY2FzZSBHTF9JTlRfVkVDMzpcbiAgICBjYXNlIEdMX0JPT0xfVkVDMzpcbiAgICAgIHJldHVybiAzXG4gICAgY2FzZSBHTF9GTE9BVF9WRUM0OlxuICAgIGNhc2UgR0xfSU5UX1ZFQzQ6XG4gICAgY2FzZSBHTF9CT09MX1ZFQzQ6XG4gICAgICByZXR1cm4gNFxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gMVxuICB9XG59XG5cbmZ1bmN0aW9uIHNldFVuaWZvcm1TdHJpbmcgKGdsLCB0eXBlLCBsb2NhdGlvbiwgdmFsdWUpIHtcbiAgdmFyIGluZml4XG4gIHZhciBzZXBhcmF0b3IgPSAnLCdcbiAgc3dpdGNoICh0eXBlKSB7XG4gICAgY2FzZSBHTF9GTE9BVDpcbiAgICAgIGluZml4ID0gJzFmJ1xuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX0ZMT0FUX1ZFQzI6XG4gICAgICBpbmZpeCA9ICcyZnYnXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfRkxPQVRfVkVDMzpcbiAgICAgIGluZml4ID0gJzNmdidcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9GTE9BVF9WRUM0OlxuICAgICAgaW5maXggPSAnNGZ2J1xuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX0JPT0w6XG4gICAgY2FzZSBHTF9JTlQ6XG4gICAgICBpbmZpeCA9ICcxaSdcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9CT09MX1ZFQzI6XG4gICAgY2FzZSBHTF9JTlRfVkVDMjpcbiAgICAgIGluZml4ID0gJzJpdidcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9CT09MX1ZFQzM6XG4gICAgY2FzZSBHTF9JTlRfVkVDMzpcbiAgICAgIGluZml4ID0gJzNpdidcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9CT09MX1ZFQzQ6XG4gICAgY2FzZSBHTF9JTlRfVkVDNDpcbiAgICAgIGluZml4ID0gJzRpdidcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9GTE9BVF9NQVQyOlxuICAgICAgaW5maXggPSAnTWF0cml4MmZ2J1xuICAgICAgc2VwYXJhdG9yID0gJyxmYWxzZSwnXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfRkxPQVRfTUFUMzpcbiAgICAgIGluZml4ID0gJ01hdHJpeDNmdidcbiAgICAgIHNlcGFyYXRvciA9ICcsZmFsc2UsJ1xuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX0ZMT0FUX01BVDQ6XG4gICAgICBpbmZpeCA9ICdNYXRyaXg0ZnYnXG4gICAgICBzZXBhcmF0b3IgPSAnLGZhbHNlLCdcbiAgICAgIGJyZWFrXG4gICAgZGVmYXVsdDpcbiAgICAgIGNoZWNrLnJhaXNlKCd1bnN1cHBvcnRlZCB1bmlmb3JtIHR5cGUnKVxuICB9XG4gIHJldHVybiBnbCArICcudW5pZm9ybScgKyBpbmZpeCArICcoJyArIGxvY2F0aW9uICsgc2VwYXJhdG9yICsgdmFsdWUgKyAnKTsnXG59XG5cbmZ1bmN0aW9uIHN0YWNrVG9wICh4KSB7XG4gIHJldHVybiB4ICsgJ1snICsgeCArICcubGVuZ3RoLTFdJ1xufVxuXG4vLyBOZWVkIHRvIHByb2Nlc3MgZnJhbWVidWZmZXIgZmlyc3QgaW4gb3B0aW9ucyBsaXN0XG5mdW5jdGlvbiBvcHRpb25Qcmlvcml0eSAoYSwgYikge1xuICBpZiAoYSA9PT0gJ2ZyYW1lYnVmZmVyJykge1xuICAgIHJldHVybiAtMVxuICB9XG4gIGlmIChhIDwgYikge1xuICAgIHJldHVybiAtMVxuICB9IGVsc2UgaWYgKGEgPiBiKSB7XG4gICAgcmV0dXJuIDFcbiAgfVxuICByZXR1cm4gMFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHJlZ2xDb21waWxlciAoXG4gIGdsLFxuICBzdHJpbmdTdG9yZSxcbiAgZXh0ZW5zaW9ucyxcbiAgbGltaXRzLFxuICBidWZmZXJTdGF0ZSxcbiAgZWxlbWVudFN0YXRlLFxuICB0ZXh0dXJlU3RhdGUsXG4gIGZyYW1lYnVmZmVyU3RhdGUsXG4gIGdsU3RhdGUsXG4gIHVuaWZvcm1TdGF0ZSxcbiAgYXR0cmlidXRlU3RhdGUsXG4gIHNoYWRlclN0YXRlLFxuICBkcmF3U3RhdGUsXG4gIGZyYW1lU3RhdGUsXG4gIHJlZ2xQb2xsKSB7XG4gIHZhciBjb250ZXh0U3RhdGUgPSBnbFN0YXRlLmNvbnRleHRTdGF0ZVxuXG4gIHZhciBibGVuZEVxdWF0aW9ucyA9IHtcbiAgICAnYWRkJzogMzI3NzQsXG4gICAgJ3N1YnRyYWN0JzogMzI3NzgsXG4gICAgJ3JldmVyc2Ugc3VidHJhY3QnOiAzMjc3OVxuICB9XG4gIGlmIChleHRlbnNpb25zLmV4dF9ibGVuZF9taW5tYXgpIHtcbiAgICBibGVuZEVxdWF0aW9ucy5taW4gPSBHTF9NSU5fRVhUXG4gICAgYmxlbmRFcXVhdGlvbnMubWF4ID0gR0xfTUFYX0VYVFxuICB9XG5cbiAgdmFyIGRyYXdDYWxsQ291bnRlciA9IDBcblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIFNIQURFUiBTSU5HTEUgRFJBVyBPUEVSQVRJT05cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICBmdW5jdGlvbiBjb21waWxlU2hhZGVyRHJhdyAocHJvZ3JhbSkge1xuICAgIHZhciBlbnYgPSBjcmVhdGVFbnZpcm9ubWVudCgpXG4gICAgdmFyIGxpbmsgPSBlbnYubGlua1xuICAgIHZhciBkcmF3ID0gZW52LnByb2MoJ2RyYXcnKVxuICAgIHZhciBkZWYgPSBkcmF3LmRlZlxuXG4gICAgdmFyIEdMID0gbGluayhnbClcbiAgICB2YXIgUFJPR1JBTSA9IGxpbmsocHJvZ3JhbS5wcm9ncmFtKVxuICAgIHZhciBCSU5EX0FUVFJJQlVURSA9IGxpbmsoYXR0cmlidXRlU3RhdGUuYmluZClcbiAgICB2YXIgRFJBV19TVEFURSA9IHtcbiAgICAgIGNvdW50OiBsaW5rKGRyYXdTdGF0ZS5jb3VudCksXG4gICAgICBvZmZzZXQ6IGxpbmsoZHJhd1N0YXRlLm9mZnNldCksXG4gICAgICBpbnN0YW5jZXM6IGxpbmsoZHJhd1N0YXRlLmluc3RhbmNlcyksXG4gICAgICBwcmltaXRpdmU6IGxpbmsoZHJhd1N0YXRlLnByaW1pdGl2ZSlcbiAgICB9XG4gICAgdmFyIEVMRU1FTlRfU1RBVEUgPSBsaW5rKGVsZW1lbnRTdGF0ZS5lbGVtZW50cylcbiAgICB2YXIgVEVYVFVSRV9VTklGT1JNUyA9IFtdXG5cbiAgICAvLyBiaW5kIHRoZSBwcm9ncmFtXG4gICAgZHJhdyhHTCwgJy51c2VQcm9ncmFtKCcsIFBST0dSQU0sICcpOycpXG5cbiAgICAvLyBzZXQgdXAgYXR0cmlidXRlIHN0YXRlXG4gICAgcHJvZ3JhbS5hdHRyaWJ1dGVzLmZvckVhY2goZnVuY3Rpb24gKGF0dHJpYnV0ZSkge1xuICAgICAgdmFyIFNUQUNLID0gbGluayhhdHRyaWJ1dGVTdGF0ZS5kZWYoYXR0cmlidXRlLm5hbWUpKVxuICAgICAgZHJhdyhCSU5EX0FUVFJJQlVURSwgJygnLFxuICAgICAgICBhdHRyaWJ1dGUubG9jYXRpb24sICcsJyxcbiAgICAgICAgbGluayhhdHRyaWJ1dGVTdGF0ZS5iaW5kaW5nc1thdHRyaWJ1dGUubG9jYXRpb25dKSwgJywnLFxuICAgICAgICBTVEFDSywgJy5yZWNvcmRzWycsIFNUQUNLLCAnLnRvcF0nLCAnLCcsXG4gICAgICAgIHR5cGVMZW5ndGgoYXR0cmlidXRlLmluZm8udHlwZSksICcpOycpXG4gICAgfSlcblxuICAgIC8vIHNldCB1cCB1bmlmb3Jtc1xuICAgIHByb2dyYW0udW5pZm9ybXMuZm9yRWFjaChmdW5jdGlvbiAodW5pZm9ybSkge1xuICAgICAgdmFyIExPQ0FUSU9OID0gbGluayh1bmlmb3JtLmxvY2F0aW9uKVxuICAgICAgdmFyIFNUQUNLID0gbGluayh1bmlmb3JtU3RhdGUuZGVmKHVuaWZvcm0ubmFtZSkpXG4gICAgICB2YXIgVE9QID0gU1RBQ0sgKyAnWycgKyBTVEFDSyArICcubGVuZ3RoLTFdJ1xuICAgICAgdmFyIHR5cGUgPSB1bmlmb3JtLmluZm8udHlwZVxuICAgICAgaWYgKHR5cGUgPT09IEdMX1NBTVBMRVJfMkQgfHwgdHlwZSA9PT0gR0xfU0FNUExFUl9DVUJFKSB7XG4gICAgICAgIHZhciBURVhfVkFMVUUgPSBkZWYoVE9QICsgJy5fdGV4dHVyZScpXG4gICAgICAgIFRFWFRVUkVfVU5JRk9STVMucHVzaChURVhfVkFMVUUpXG4gICAgICAgIGRyYXcoc2V0VW5pZm9ybVN0cmluZyhHTCwgR0xfSU5ULCBMT0NBVElPTiwgVEVYX1ZBTFVFICsgJy5iaW5kKCknKSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRyYXcoc2V0VW5pZm9ybVN0cmluZyhHTCwgdHlwZSwgTE9DQVRJT04sIFRPUCkpXG4gICAgICB9XG4gICAgfSlcblxuICAgIC8vIHVuYmluZCB0ZXh0dXJlcyBpbW1lZGlhdGVseVxuICAgIFRFWFRVUkVfVU5JRk9STVMuZm9yRWFjaChmdW5jdGlvbiAoVEVYX1ZBTFVFKSB7XG4gICAgICBkcmF3KFRFWF9WQUxVRSwgJy51bmJpbmQoKTsnKVxuICAgIH0pXG5cbiAgICAvLyBFeGVjdXRlIGRyYXcgY29tbWFuZFxuICAgIHZhciBDVVJfUFJJTUlUSVZFID0gZGVmKHN0YWNrVG9wKERSQVdfU1RBVEUucHJpbWl0aXZlKSlcbiAgICB2YXIgQ1VSX0NPVU5UID0gZGVmKHN0YWNrVG9wKERSQVdfU1RBVEUuY291bnQpKVxuICAgIHZhciBDVVJfT0ZGU0VUID0gZGVmKHN0YWNrVG9wKERSQVdfU1RBVEUub2Zmc2V0KSlcbiAgICB2YXIgQ1VSX0VMRU1FTlRTID0gZGVmKHN0YWNrVG9wKEVMRU1FTlRfU1RBVEUpKVxuXG4gICAgLy8gT25seSBleGVjdXRlIGRyYXcgY29tbWFuZCBpZiBudW1iZXIgZWxlbWVudHMgaXMgPiAwXG4gICAgZHJhdygnaWYoJywgQ1VSX0NPVU5ULCAnKXsnKVxuXG4gICAgdmFyIGluc3RhbmNpbmcgPSBleHRlbnNpb25zLmFuZ2xlX2luc3RhbmNlZF9hcnJheXNcbiAgICBpZiAoaW5zdGFuY2luZykge1xuICAgICAgdmFyIENVUl9JTlNUQU5DRVMgPSBkZWYoc3RhY2tUb3AoRFJBV19TVEFURS5pbnN0YW5jZXMpKVxuICAgICAgdmFyIElOU1RBTkNFX0VYVCA9IGxpbmsoaW5zdGFuY2luZylcbiAgICAgIGRyYXcoXG4gICAgICAgICdpZignLCBDVVJfRUxFTUVOVFMsICcpeycsXG4gICAgICAgIENVUl9FTEVNRU5UUywgJy5iaW5kKCk7JyxcbiAgICAgICAgJ2lmKCcsIENVUl9JTlNUQU5DRVMsICc+MCl7JyxcbiAgICAgICAgSU5TVEFOQ0VfRVhULCAnLmRyYXdFbGVtZW50c0luc3RhbmNlZEFOR0xFKCcsXG4gICAgICAgIENVUl9QUklNSVRJVkUsICcsJyxcbiAgICAgICAgQ1VSX0NPVU5ULCAnLCcsXG4gICAgICAgIENVUl9FTEVNRU5UUywgJy50eXBlLCcsXG4gICAgICAgIENVUl9PRkZTRVQsICcsJyxcbiAgICAgICAgQ1VSX0lOU1RBTkNFUywgJyk7fWVsc2V7JyxcbiAgICAgICAgR0wsICcuZHJhd0VsZW1lbnRzKCcsXG4gICAgICAgIENVUl9QUklNSVRJVkUsICcsJyxcbiAgICAgICAgQ1VSX0NPVU5ULCAnLCcsXG4gICAgICAgIENVUl9FTEVNRU5UUywgJy50eXBlLCcsXG4gICAgICAgIENVUl9PRkZTRVQsICcpO30nLFxuICAgICAgICAnfWVsc2UgaWYoJywgQ1VSX0lOU1RBTkNFUywgJz4wKXsnLFxuICAgICAgICBJTlNUQU5DRV9FWFQsICcuZHJhd0FycmF5c0luc3RhbmNlZEFOR0xFKCcsXG4gICAgICAgIENVUl9QUklNSVRJVkUsICcsJyxcbiAgICAgICAgQ1VSX09GRlNFVCwgJywnLFxuICAgICAgICBDVVJfQ09VTlQsICcsJyxcbiAgICAgICAgQ1VSX0lOU1RBTkNFUywgJyk7fWVsc2V7JyxcbiAgICAgICAgR0wsICcuZHJhd0FycmF5cygnLFxuICAgICAgICBDVVJfUFJJTUlUSVZFLCAnLCcsXG4gICAgICAgIENVUl9PRkZTRVQsICcsJyxcbiAgICAgICAgQ1VSX0NPVU5ULCAnKTt9fScpXG4gICAgfSBlbHNlIHtcbiAgICAgIGRyYXcoXG4gICAgICAgICdpZignLCBDVVJfRUxFTUVOVFMsICcpeycsXG4gICAgICAgIEdMLCAnLmRyYXdFbGVtZW50cygnLFxuICAgICAgICBDVVJfUFJJTUlUSVZFLCAnLCcsXG4gICAgICAgIENVUl9DT1VOVCwgJywnLFxuICAgICAgICBDVVJfRUxFTUVOVFMsICcudHlwZSwnLFxuICAgICAgICBDVVJfT0ZGU0VULCAnKTt9JyxcbiAgICAgICAgJ31lbHNleycsXG4gICAgICAgIEdMLCAnLmRyYXdBcnJheXMoJyxcbiAgICAgICAgQ1VSX1BSSU1JVElWRSwgJywnLFxuICAgICAgICBDVVJfT0ZGU0VULCAnLCcsXG4gICAgICAgIENVUl9DT1VOVCwgJyk7fScpXG4gICAgfVxuXG4gICAgcmV0dXJuIGVudi5jb21waWxlKCkuZHJhd1xuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBCQVRDSCBEUkFXIE9QRVJBVElPTlxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIGNvbXBpbGVCYXRjaCAoXG4gICAgcHJvZ3JhbSwgb3B0aW9ucywgdW5pZm9ybXMsIGF0dHJpYnV0ZXMsIHN0YXRpY09wdGlvbnMpIHtcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gY29kZSBnZW5lcmF0aW9uIGhlbHBlcnNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgdmFyIGVudiA9IGNyZWF0ZUVudmlyb25tZW50KClcbiAgICB2YXIgbGluayA9IGVudi5saW5rXG4gICAgdmFyIGJhdGNoID0gZW52LnByb2MoJ2JhdGNoJylcbiAgICB2YXIgZXhpdCA9IGVudi5ibG9jaygpXG4gICAgdmFyIGRlZiA9IGJhdGNoLmRlZlxuICAgIHZhciBhcmcgPSBiYXRjaC5hcmdcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyByZWdsIHN0YXRlXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHZhciBHTCA9IGxpbmsoZ2wpXG4gICAgdmFyIFBST0dSQU0gPSBsaW5rKHByb2dyYW0ucHJvZ3JhbSlcbiAgICB2YXIgQklORF9BVFRSSUJVVEUgPSBsaW5rKGF0dHJpYnV0ZVN0YXRlLmJpbmQpXG4gICAgdmFyIEZSQU1FX1NUQVRFID0gbGluayhmcmFtZVN0YXRlKVxuICAgIHZhciBGUkFNRUJVRkZFUl9TVEFURSA9IGxpbmsoZnJhbWVidWZmZXJTdGF0ZSlcbiAgICB2YXIgRFJBV19TVEFURSA9IHtcbiAgICAgIGNvdW50OiBsaW5rKGRyYXdTdGF0ZS5jb3VudCksXG4gICAgICBvZmZzZXQ6IGxpbmsoZHJhd1N0YXRlLm9mZnNldCksXG4gICAgICBpbnN0YW5jZXM6IGxpbmsoZHJhd1N0YXRlLmluc3RhbmNlcyksXG4gICAgICBwcmltaXRpdmU6IGxpbmsoZHJhd1N0YXRlLnByaW1pdGl2ZSlcbiAgICB9XG4gICAgdmFyIENPTlRFWFRfU1RBVEUgPSB7fVxuICAgIHZhciBFTEVNRU5UUyA9IGxpbmsoZWxlbWVudFN0YXRlLmVsZW1lbnRzKVxuICAgIHZhciBDVVJfQ09VTlQgPSBkZWYoc3RhY2tUb3AoRFJBV19TVEFURS5jb3VudCkpXG4gICAgdmFyIENVUl9PRkZTRVQgPSBkZWYoc3RhY2tUb3AoRFJBV19TVEFURS5vZmZzZXQpKVxuICAgIHZhciBDVVJfUFJJTUlUSVZFID0gZGVmKHN0YWNrVG9wKERSQVdfU1RBVEUucHJpbWl0aXZlKSlcbiAgICB2YXIgQ1VSX0VMRU1FTlRTID0gZGVmKHN0YWNrVG9wKEVMRU1FTlRTKSlcbiAgICB2YXIgQ1VSX0lOU1RBTkNFU1xuICAgIHZhciBJTlNUQU5DRV9FWFRcbiAgICB2YXIgaW5zdGFuY2luZyA9IGV4dGVuc2lvbnMuYW5nbGVfaW5zdGFuY2VkX2FycmF5c1xuICAgIGlmIChpbnN0YW5jaW5nKSB7XG4gICAgICBDVVJfSU5TVEFOQ0VTID0gZGVmKHN0YWNrVG9wKERSQVdfU1RBVEUuaW5zdGFuY2VzKSlcbiAgICAgIElOU1RBTkNFX0VYVCA9IGxpbmsoaW5zdGFuY2luZylcbiAgICB9XG4gICAgdmFyIGhhc0R5bmFtaWNFbGVtZW50cyA9ICdlbGVtZW50cycgaW4gb3B0aW9uc1xuXG4gICAgZnVuY3Rpb24gbGlua0NvbnRleHQgKHgpIHtcbiAgICAgIHZhciByZXN1bHQgPSBDT05URVhUX1NUQVRFW3hdXG4gICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH1cbiAgICAgIHJlc3VsdCA9IENPTlRFWFRfU1RBVEVbeF0gPSBsaW5rKGNvbnRleHRTdGF0ZVt4XSlcbiAgICAgIHJldHVybiByZXN1bHRcbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gYmF0Y2gvYXJndW1lbnQgdmFyc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICB2YXIgTlVNX0FSR1MgPSBhcmcoKVxuICAgIHZhciBBUkdTID0gYXJnKClcbiAgICB2YXIgQVJHID0gZGVmKClcbiAgICB2YXIgQkFUQ0hfSUQgPSBkZWYoKVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGxvYWQgYSBkeW5hbWljIHZhcmlhYmxlXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHZhciBkeW5hbWljVmFycyA9IHt9XG4gICAgZnVuY3Rpb24gZHluICh4KSB7XG4gICAgICB2YXIgaWQgPSB4LmlkXG4gICAgICB2YXIgcmVzdWx0ID0gZHluYW1pY1ZhcnNbaWRdXG4gICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH1cbiAgICAgIGlmICh4LmZ1bmMpIHtcbiAgICAgICAgcmVzdWx0ID0gYmF0Y2guZGVmKFxuICAgICAgICAgIGxpbmsoeC5kYXRhKSwgJygnLCBBUkcsICcsJywgQkFUQ0hfSUQsICcsJywgRlJBTUVfU1RBVEUsICcpJylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlc3VsdCA9IGJhdGNoLmRlZihBUkcsICcuJywgeC5kYXRhKVxuICAgICAgfVxuICAgICAgZHluYW1pY1ZhcnNbaWRdID0gcmVzdWx0XG4gICAgICByZXR1cm4gcmVzdWx0XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHJldHJpZXZlcyB0aGUgZmlyc3QgbmFtZS1tYXRjaGluZyByZWNvcmQgZnJvbSBhbiBBY3RpdmVJbmZvIGxpc3RcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgZnVuY3Rpb24gZmluZEluZm8gKGxpc3QsIG5hbWUpIHtcbiAgICAgIHJldHVybiBsaXN0LmZpbmQoZnVuY3Rpb24gKGl0ZW0pIHtcbiAgICAgICAgcmV0dXJuIGl0ZW0ubmFtZSA9PT0gbmFtZVxuICAgICAgfSlcbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gYmluZCBzaGFkZXJcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgYmF0Y2goR0wsICcudXNlUHJvZ3JhbSgnLCBQUk9HUkFNLCAnKTsnKVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHNldCBzdGF0aWMgdW5pZm9ybXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgcHJvZ3JhbS51bmlmb3Jtcy5mb3JFYWNoKGZ1bmN0aW9uICh1bmlmb3JtKSB7XG4gICAgICBpZiAodW5pZm9ybS5uYW1lIGluIHVuaWZvcm1zKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgdmFyIExPQ0FUSU9OID0gbGluayh1bmlmb3JtLmxvY2F0aW9uKVxuICAgICAgdmFyIFNUQUNLID0gbGluayh1bmlmb3JtU3RhdGUuZGVmKHVuaWZvcm0ubmFtZSkpXG4gICAgICB2YXIgVE9QID0gU1RBQ0sgKyAnWycgKyBTVEFDSyArICcubGVuZ3RoLTFdJ1xuICAgICAgdmFyIHR5cGUgPSB1bmlmb3JtLmluZm8udHlwZVxuICAgICAgaWYgKHR5cGUgPT09IEdMX1NBTVBMRVJfMkQgfHwgdHlwZSA9PT0gR0xfU0FNUExFUl9DVUJFKSB7XG4gICAgICAgIHZhciBURVhfVkFMVUUgPSBkZWYoVE9QICsgJy5fdGV4dHVyZScpXG4gICAgICAgIGJhdGNoKHNldFVuaWZvcm1TdHJpbmcoR0wsIEdMX0lOVCwgTE9DQVRJT04sIFRFWF9WQUxVRSArICcuYmluZCgpJykpXG4gICAgICAgIGV4aXQoVEVYX1ZBTFVFLCAnLnVuYmluZCgpOycpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBiYXRjaChzZXRVbmlmb3JtU3RyaW5nKEdMLCB0eXBlLCBMT0NBVElPTiwgVE9QKSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHNldCBzdGF0aWMgYXR0cmlidXRlc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBwcm9ncmFtLmF0dHJpYnV0ZXMuZm9yRWFjaChmdW5jdGlvbiAoYXR0cmlidXRlKSB7XG4gICAgICBpZiAoYXR0cmlidXRlcy5uYW1lIGluIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICB2YXIgU1RBQ0sgPSBsaW5rKGF0dHJpYnV0ZVN0YXRlLmRlZihhdHRyaWJ1dGUubmFtZSkpXG4gICAgICBiYXRjaChCSU5EX0FUVFJJQlVURSwgJygnLFxuICAgICAgICBhdHRyaWJ1dGUubG9jYXRpb24sICcsJyxcbiAgICAgICAgbGluayhhdHRyaWJ1dGVTdGF0ZS5iaW5kaW5nc1thdHRyaWJ1dGUubG9jYXRpb25dKSwgJywnLFxuICAgICAgICBTVEFDSywgJy5yZWNvcmRzWycsIFNUQUNLLCAnLnRvcF0nLCAnLCcsXG4gICAgICAgIHR5cGVMZW5ndGgoYXR0cmlidXRlLmluZm8udHlwZSksICcpOycpXG4gICAgfSlcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBzZXQgc3RhdGljIGVsZW1lbnQgYnVmZmVyXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIGlmICghaGFzRHluYW1pY0VsZW1lbnRzKSB7XG4gICAgICBiYXRjaChcbiAgICAgICAgJ2lmKCcsIENVUl9FTEVNRU5UUywgJyl7JyxcbiAgICAgICAgR0wsICcuYmluZEJ1ZmZlcignLCBHTF9FTEVNRU5UX0FSUkFZX0JVRkZFUiwgJywnLCBDVVJfRUxFTUVOVFMsICcuYnVmZmVyLmJ1ZmZlcik7JyxcbiAgICAgICAgJ31lbHNleycsXG4gICAgICAgIEdMLCAnLmJpbmRCdWZmZXIoJywgR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIsICcsbnVsbCk7JyxcbiAgICAgICAgJ30nKVxuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBsb29wIG92ZXIgYWxsIGFyZ3VtZW50c1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBiYXRjaChcbiAgICAgICdmb3IoJywgQkFUQ0hfSUQsICc9MDsnLCBCQVRDSF9JRCwgJzwnLCBOVU1fQVJHUywgJzsrKycsIEJBVENIX0lELCAnKXsnLFxuICAgICAgQVJHLCAnPScsIEFSR1MsICdbJywgQkFUQ0hfSUQsICddOycpXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gc2V0IGR5bmFtaWMgZmxhZ3NcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgT2JqZWN0LmtleXMob3B0aW9ucykuc29ydChvcHRpb25Qcmlvcml0eSkuZm9yRWFjaChmdW5jdGlvbiAob3B0aW9uKSB7XG4gICAgICB2YXIgVkFMVUUgPSBkeW4ob3B0aW9uc1tvcHRpb25dKVxuXG4gICAgICBmdW5jdGlvbiBzZXRDYXAgKGZsYWcpIHtcbiAgICAgICAgYmF0Y2goXG4gICAgICAgICAgJ2lmKCcsIFZBTFVFLCAnKXsnLFxuICAgICAgICAgIEdMLCAnLmVuYWJsZSgnLCBmbGFnLCAnKTt9ZWxzZXsnLFxuICAgICAgICAgIEdMLCAnLmRpc2FibGUoJywgZmxhZywgJyk7fScpXG4gICAgICB9XG5cbiAgICAgIHN3aXRjaCAob3B0aW9uKSB7XG4gICAgICAgIGNhc2UgJ2ZyYW1lYnVmZmVyJzpcbiAgICAgICAgICB2YXIgVklFV1BPUlRfU1RBVEUgPSBsaW5rQ29udGV4dCgndmlld3BvcnQnKVxuICAgICAgICAgIHZhciBTQ0lTU09SX1NUQVRFID0gbGlua0NvbnRleHQoJ3NjaXNzb3IuYm94JylcbiAgICAgICAgICBiYXRjaChcbiAgICAgICAgICAgICdpZignLCBGUkFNRUJVRkZFUl9TVEFURSwgJy5wdXNoKCcsXG4gICAgICAgICAgICBWQUxVRSwgJyYmJywgVkFMVUUsICcuX2ZyYW1lYnVmZmVyKSl7JyxcbiAgICAgICAgICAgIEZSQU1FQlVGRkVSX1NUQVRFLCAnLnBvbGwoKTsnLFxuICAgICAgICAgICAgVklFV1BPUlRfU1RBVEUsICcuc2V0RGlydHkoKTsnLFxuICAgICAgICAgICAgU0NJU1NPUl9TVEFURSwgJy5zZXREaXJ0eSgpOycsXG4gICAgICAgICAgICAnfScpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICAvLyBDYXBzXG4gICAgICAgIGNhc2UgJ2N1bGwuZW5hYmxlJzpcbiAgICAgICAgICBzZXRDYXAoR0xfQ1VMTF9GQUNFKVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgJ2JsZW5kLmVuYWJsZSc6XG4gICAgICAgICAgc2V0Q2FwKEdMX0JMRU5EKVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgJ2RpdGhlcic6XG4gICAgICAgICAgc2V0Q2FwKEdMX0RJVEhFUilcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlICdzdGVuY2lsLmVuYWJsZSc6XG4gICAgICAgICAgc2V0Q2FwKEdMX1NURU5DSUxfVEVTVClcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlICdkZXB0aC5lbmFibGUnOlxuICAgICAgICAgIHNldENhcChHTF9ERVBUSF9URVNUKVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgJ3NjaXNzb3IuZW5hYmxlJzpcbiAgICAgICAgICBzZXRDYXAoR0xfU0NJU1NPUl9URVNUKVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgJ3BvbHlnb25PZmZzZXQuZW5hYmxlJzpcbiAgICAgICAgICBzZXRDYXAoR0xfUE9MWUdPTl9PRkZTRVRfRklMTClcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlICdzYW1wbGUuYWxwaGEnOlxuICAgICAgICAgIHNldENhcChHTF9TQU1QTEVfQUxQSEFfVE9fQ09WRVJBR0UpXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSAnc2FtcGxlLmVuYWJsZSc6XG4gICAgICAgICAgc2V0Q2FwKEdMX1NBTVBMRV9DT1ZFUkFHRSlcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2RlcHRoLm1hc2snOlxuICAgICAgICAgIGJhdGNoKEdMLCAnLmRlcHRoTWFzaygnLCBWQUxVRSwgJyk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2RlcHRoLmZ1bmMnOlxuICAgICAgICAgIHZhciBERVBUSF9GVU5DUyA9IGxpbmsoY29tcGFyZUZ1bmNzKVxuICAgICAgICAgIGJhdGNoKEdMLCAnLmRlcHRoRnVuYygnLCBERVBUSF9GVU5DUywgJ1snLCBWQUxVRSwgJ10pOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdkZXB0aC5yYW5nZSc6XG4gICAgICAgICAgYmF0Y2goR0wsICcuZGVwdGhSYW5nZSgnLCBWQUxVRSwgJ1swXSwnLCBWQUxVRSwgJ1sxXSk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2JsZW5kLmNvbG9yJzpcbiAgICAgICAgICBiYXRjaChHTCwgJy5ibGVuZENvbG9yKCcsXG4gICAgICAgICAgICBWQUxVRSwgJ1swXSwnLFxuICAgICAgICAgICAgVkFMVUUsICdbMV0sJyxcbiAgICAgICAgICAgIFZBTFVFLCAnWzJdLCcsXG4gICAgICAgICAgICBWQUxVRSwgJ1szXSk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2JsZW5kLmVxdWF0aW9uJzpcbiAgICAgICAgICB2YXIgQkxFTkRfRVFVQVRJT05TID0gbGluayhibGVuZEVxdWF0aW9ucylcbiAgICAgICAgICBiYXRjaChcbiAgICAgICAgICAgICdpZih0eXBlb2YgJywgVkFMVUUsICc9PT1cInN0cmluZ1wiKXsnLFxuICAgICAgICAgICAgR0wsICcuYmxlbmRFcXVhdGlvbignLCBCTEVORF9FUVVBVElPTlMsICdbJywgVkFMVUUsICddKTsnLFxuICAgICAgICAgICAgJ31lbHNleycsXG4gICAgICAgICAgICBHTCwgJy5ibGVuZEVxdWF0aW9uU2VwYXJhdGUoJyxcbiAgICAgICAgICAgIEJMRU5EX0VRVUFUSU9OUywgJ1snLCBWQUxVRSwgJy5yZ2JdLCcsXG4gICAgICAgICAgICBCTEVORF9FUVVBVElPTlMsICdbJywgVkFMVUUsICcuYWxwaGFdKTsnLFxuICAgICAgICAgICAgJ30nKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnYmxlbmQuZnVuYyc6XG4gICAgICAgICAgdmFyIEJMRU5EX0ZVTkNTID0gbGluayhibGVuZEZ1bmNzKVxuICAgICAgICAgIGJhdGNoKFxuICAgICAgICAgICAgR0wsICcuYmxlbmRGdW5jU2VwYXJhdGUoJyxcbiAgICAgICAgICAgIEJMRU5EX0ZVTkNTLFxuICAgICAgICAgICAgJ1tcInNyY1JHQlwiIGluICcsIFZBTFVFLCAnPycsIFZBTFVFLCAnLnNyY1JHQjonLCBWQUxVRSwgJy5zcmNdLCcsXG4gICAgICAgICAgICBCTEVORF9GVU5DUyxcbiAgICAgICAgICAgICdbXCJkc3RSR0JcIiBpbiAnLCBWQUxVRSwgJz8nLCBWQUxVRSwgJy5kc3RSR0I6JywgVkFMVUUsICcuZHN0XSwnLFxuICAgICAgICAgICAgQkxFTkRfRlVOQ1MsXG4gICAgICAgICAgICAnW1wic3JjQWxwaGFcIiBpbiAnLCBWQUxVRSwgJz8nLCBWQUxVRSwgJy5zcmNBbHBoYTonLCBWQUxVRSwgJy5zcmNdLCcsXG4gICAgICAgICAgICBCTEVORF9GVU5DUyxcbiAgICAgICAgICAgICdbXCJkc3RBbHBoYVwiIGluICcsIFZBTFVFLCAnPycsIFZBTFVFLCAnLmRzdEFscGhhOicsIFZBTFVFLCAnLmRzdF0pOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdzdGVuY2lsLm1hc2snOlxuICAgICAgICAgIGJhdGNoKEdMLCAnLnN0ZW5jaWxNYXNrKCcsIFZBTFVFLCAnKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnc3RlbmNpbC5mdW5jJzpcbiAgICAgICAgICB2YXIgU1RFTkNJTF9GVU5DUyA9IGxpbmsoY29tcGFyZUZ1bmNzKVxuICAgICAgICAgIGJhdGNoKEdMLCAnLnN0ZW5jaWxGdW5jKCcsXG4gICAgICAgICAgICBTVEVOQ0lMX0ZVTkNTLCAnWycsIFZBTFVFLCAnLmNtcHx8XCJhbHdheXNcIl0sJyxcbiAgICAgICAgICAgIFZBTFVFLCAnLnJlZnwwLCcsXG4gICAgICAgICAgICAnXCJtYXNrXCIgaW4gJywgVkFMVUUsICc/JywgVkFMVUUsICcubWFzazotMSk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3N0ZW5jaWwub3BGcm9udCc6XG4gICAgICAgIGNhc2UgJ3N0ZW5jaWwub3BCYWNrJzpcbiAgICAgICAgICB2YXIgU1RFTkNJTF9PUFMgPSBsaW5rKHN0ZW5jaWxPcHMpXG4gICAgICAgICAgYmF0Y2goR0wsICcuc3RlbmNpbE9wU2VwYXJhdGUoJyxcbiAgICAgICAgICAgIG9wdGlvbiA9PT0gJ3N0ZW5jaWwub3BGcm9udCcgPyBHTF9GUk9OVCA6IEdMX0JBQ0ssICcsJyxcbiAgICAgICAgICAgIFNURU5DSUxfT1BTLCAnWycsIFZBTFVFLCAnLmZhaWx8fFwia2VlcFwiXSwnLFxuICAgICAgICAgICAgU1RFTkNJTF9PUFMsICdbJywgVkFMVUUsICcuemZhaWx8fFwia2VlcFwiXSwnLFxuICAgICAgICAgICAgU1RFTkNJTF9PUFMsICdbJywgVkFMVUUsICcucGFzc3x8XCJrZWVwXCJdKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAncG9seWdvbk9mZnNldC5vZmZzZXQnOlxuICAgICAgICAgIGJhdGNoKEdMLCAnLnBvbHlnb25PZmZzZXQoJyxcbiAgICAgICAgICAgIFZBTFVFLCAnLmZhY3Rvcnx8MCwnLFxuICAgICAgICAgICAgVkFMVUUsICcudW5pdHN8fDApOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdjdWxsLmZhY2UnOlxuICAgICAgICAgIGJhdGNoKEdMLCAnLmN1bGxGYWNlKCcsXG4gICAgICAgICAgICBWQUxVRSwgJz09PVwiZnJvbnRcIj8nLCBHTF9GUk9OVCwgJzonLCBHTF9CQUNLLCAnKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnbGluZVdpZHRoJzpcbiAgICAgICAgICBiYXRjaChHTCwgJy5saW5lV2lkdGgoJywgVkFMVUUsICcpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdmcm9udEZhY2UnOlxuICAgICAgICAgIGJhdGNoKEdMLCAnLmZyb250RmFjZSgnLFxuICAgICAgICAgICAgVkFMVUUsICc9PT1cImN3XCI/JywgR0xfQ1csICc6JywgR0xfQ0NXLCAnKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnY29sb3JNYXNrJzpcbiAgICAgICAgICBiYXRjaChHTCwgJy5jb2xvck1hc2soJyxcbiAgICAgICAgICAgIFZBTFVFLCAnWzBdLCcsXG4gICAgICAgICAgICBWQUxVRSwgJ1sxXSwnLFxuICAgICAgICAgICAgVkFMVUUsICdbMl0sJyxcbiAgICAgICAgICAgIFZBTFVFLCAnWzNdKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnc2FtcGxlLmNvdmVyYWdlJzpcbiAgICAgICAgICBiYXRjaChHTCwgJy5zYW1wbGVDb3ZlcmFnZSgnLFxuICAgICAgICAgICAgVkFMVUUsICcudmFsdWUsJyxcbiAgICAgICAgICAgIFZBTFVFLCAnLmludmVydCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3NjaXNzb3IuYm94JzpcbiAgICAgICAgY2FzZSAndmlld3BvcnQnOlxuICAgICAgICAgIHZhciBCT1hfU1RBVEUgPSBsaW5rQ29udGV4dChvcHRpb24pXG4gICAgICAgICAgYmF0Y2goQk9YX1NUQVRFLCAnLnB1c2goJyxcbiAgICAgICAgICAgIFZBTFVFLCAnLnh8fDAsJyxcbiAgICAgICAgICAgIFZBTFVFLCAnLnl8fDAsJyxcbiAgICAgICAgICAgIFZBTFVFLCAnLnd8fC0xLCcsXG4gICAgICAgICAgICBWQUxVRSwgJy5ofHwtMSk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3ByaW1pdGl2ZXMnOlxuICAgICAgICBjYXNlICdvZmZzZXQnOlxuICAgICAgICBjYXNlICdjb3VudCc6XG4gICAgICAgIGNhc2UgJ2VsZW1lbnRzJzpcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgY2hlY2sucmFpc2UoJ3Vuc3VwcG9ydGVkIG9wdGlvbiBmb3IgYmF0Y2gnLCBvcHRpb24pXG4gICAgICB9XG4gICAgfSlcblxuICAgIC8vIHVwZGF0ZSB2aWV3cG9ydC9zY2lzc29yIGJveCBzdGF0ZSBhbmQgcmVzdG9yZSBmcmFtZWJ1ZmZlclxuICAgIGlmICgndmlld3BvcnQnIGluIG9wdGlvbnMgfHwgJ2ZyYW1lYnVmZmVyJyBpbiBvcHRpb25zKSB7XG4gICAgICBiYXRjaChsaW5rQ29udGV4dCgndmlld3BvcnQnKSwgJy5wb2xsKCk7JylcbiAgICB9XG4gICAgaWYgKCdzY2lzc29yLmJveCcgaW4gb3B0aW9ucyB8fCAnZnJhbWVidWZmZXInIGluIG9wdGlvbnMpIHtcbiAgICAgIGJhdGNoKGxpbmtDb250ZXh0KCdzY2lzc29yLmJveCcpLCAnLnBvbGwoKTsnKVxuICAgIH1cbiAgICBpZiAoJ2ZyYW1lYnVmZmVyJyBpbiBvcHRpb25zKSB7XG4gICAgICBiYXRjaChGUkFNRUJVRkZFUl9TVEFURSwgJy5wb3AoKTsnKVxuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBzZXQgZHluYW1pYyB1bmlmb3Jtc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICB2YXIgcHJvZ3JhbVVuaWZvcm1zID0gcHJvZ3JhbS51bmlmb3Jtc1xuICAgIHZhciBEWU5BTUlDX1RFWFRVUkVTID0gW11cbiAgICBPYmplY3Qua2V5cyh1bmlmb3JtcykuZm9yRWFjaChmdW5jdGlvbiAodW5pZm9ybSkge1xuICAgICAgdmFyIGRhdGEgPSBmaW5kSW5mbyhwcm9ncmFtVW5pZm9ybXMsIHVuaWZvcm0pXG4gICAgICBpZiAoIWRhdGEpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICB2YXIgVFlQRSA9IGRhdGEuaW5mby50eXBlXG4gICAgICB2YXIgTE9DQVRJT04gPSBsaW5rKGRhdGEubG9jYXRpb24pXG4gICAgICB2YXIgVkFMVUUgPSBkeW4odW5pZm9ybXNbdW5pZm9ybV0pXG4gICAgICBpZiAoZGF0YS5pbmZvLnR5cGUgPT09IEdMX1NBTVBMRVJfMkQgfHxcbiAgICAgICAgICBkYXRhLmluZm8udHlwZSA9PT0gR0xfU0FNUExFUl9DVUJFKSB7XG4gICAgICAgIHZhciBURVhfVkFMVUUgPSBkZWYoVkFMVUUgKyAnLl90ZXh0dXJlJylcbiAgICAgICAgRFlOQU1JQ19URVhUVVJFUy5wdXNoKFRFWF9WQUxVRSlcbiAgICAgICAgYmF0Y2goc2V0VW5pZm9ybVN0cmluZyhHTCwgR0xfSU5ULCBMT0NBVElPTiwgVEVYX1ZBTFVFICsgJy5iaW5kKCknKSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGJhdGNoKHNldFVuaWZvcm1TdHJpbmcoR0wsIFRZUEUsIExPQ0FUSU9OLCBWQUxVRSkpXG4gICAgICB9XG4gICAgfSlcbiAgICBEWU5BTUlDX1RFWFRVUkVTLmZvckVhY2goZnVuY3Rpb24gKFZBTFVFKSB7XG4gICAgICBiYXRjaChWQUxVRSwgJy51bmJpbmQoKTsnKVxuICAgIH0pXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gc2V0IGR5bmFtaWMgYXR0cmlidXRlc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICB2YXIgcHJvZ3JhbUF0dHJpYnV0ZXMgPSBwcm9ncmFtLmF0dHJpYnV0ZXNcbiAgICBPYmplY3Qua2V5cyhhdHRyaWJ1dGVzKS5mb3JFYWNoKGZ1bmN0aW9uIChhdHRyaWJ1dGUpIHtcbiAgICAgIHZhciBkYXRhID0gZmluZEluZm8ocHJvZ3JhbUF0dHJpYnV0ZXMsIGF0dHJpYnV0ZSlcbiAgICAgIGlmICghZGF0YSkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIGJhdGNoKEJJTkRfQVRUUklCVVRFLCAnKCcsXG4gICAgICAgIGRhdGEubG9jYXRpb24sICcsJyxcbiAgICAgICAgbGluayhhdHRyaWJ1dGUuYmluZGluZ3NbZGF0YS5sb2NhdGlvbl0pLCAnLCcsXG4gICAgICAgIGR5bihhdHRyaWJ1dGVzW2F0dHJpYnV0ZV0pLCAnLCcsXG4gICAgICAgIHR5cGVMZW5ndGgoZGF0YS5pbmZvLnR5cGUpLCAnKTsnKVxuICAgIH0pXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gc2V0IGR5bmFtaWMgYXR0cmlidXRlc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAgIGlmIChvcHRpb25zLmNvdW50KSB7XG4gICAgICBiYXRjaChDVVJfQ09VTlQsICc9JywgZHluKG9wdGlvbnMuY291bnQpLCAnOycpXG4gICAgfSBlbHNlIGlmICghdXNlRWxlbWVudE9wdGlvbignY291bnQnKSkge1xuICAgICAgYmF0Y2goJ2lmKCcsIENVUl9DT1VOVCwgJyl7JylcbiAgICB9XG4gICAgaWYgKG9wdGlvbnMub2Zmc2V0KSB7XG4gICAgICBiYXRjaChDVVJfT0ZGU0VULCAnPScsIGR5bihvcHRpb25zLm9mZnNldCksICc7JylcbiAgICB9XG4gICAgaWYgKG9wdGlvbnMucHJpbWl0aXZlKSB7XG4gICAgICB2YXIgUFJJTV9UWVBFUyA9IGxpbmsocHJpbVR5cGVzKVxuICAgICAgYmF0Y2goQ1VSX1BSSU1JVElWRSwgJz0nLCBQUklNX1RZUEVTLCAnWycsIGR5bihvcHRpb25zLnByaW1pdGl2ZSksICddOycpXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdXNlRWxlbWVudE9wdGlvbiAoeCkge1xuICAgICAgcmV0dXJuIGhhc0R5bmFtaWNFbGVtZW50cyAmJiAhKHggaW4gb3B0aW9ucyB8fCB4IGluIHN0YXRpY09wdGlvbnMpXG4gICAgfVxuICAgIGlmIChoYXNEeW5hbWljRWxlbWVudHMpIHtcbiAgICAgIHZhciBkeW5FbGVtZW50cyA9IGR5bihvcHRpb25zLmVsZW1lbnRzKVxuICAgICAgYmF0Y2goQ1VSX0VMRU1FTlRTLCAnPScsXG4gICAgICAgIGR5bkVsZW1lbnRzLCAnPycsIGR5bkVsZW1lbnRzLCAnLl9lbGVtZW50czpudWxsOycpXG4gICAgfVxuICAgIGlmICh1c2VFbGVtZW50T3B0aW9uKCdvZmZzZXQnKSkge1xuICAgICAgYmF0Y2goQ1VSX09GRlNFVCwgJz0wOycpXG4gICAgfVxuXG4gICAgLy8gRW1pdCBkcmF3IGNvbW1hbmRcbiAgICBiYXRjaCgnaWYoJywgQ1VSX0VMRU1FTlRTLCAnKXsnKVxuICAgIGlmICh1c2VFbGVtZW50T3B0aW9uKCdjb3VudCcpKSB7XG4gICAgICBiYXRjaChDVVJfQ09VTlQsICc9JywgQ1VSX0VMRU1FTlRTLCAnLnZlcnRDb3VudDsnLFxuICAgICAgICAnaWYoJywgQ1VSX0NPVU5ULCAnPjApeycpXG4gICAgfVxuICAgIGlmICh1c2VFbGVtZW50T3B0aW9uKCdwcmltaXRpdmUnKSkge1xuICAgICAgYmF0Y2goQ1VSX1BSSU1JVElWRSwgJz0nLCBDVVJfRUxFTUVOVFMsICcucHJpbVR5cGU7JylcbiAgICB9XG4gICAgaWYgKGhhc0R5bmFtaWNFbGVtZW50cykge1xuICAgICAgYmF0Y2goXG4gICAgICAgIEdMLFxuICAgICAgICAnLmJpbmRCdWZmZXIoJyxcbiAgICAgICAgR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIsICcsJyxcbiAgICAgICAgQ1VSX0VMRU1FTlRTLCAnLmJ1ZmZlci5idWZmZXIpOycpXG4gICAgfVxuICAgIGlmIChpbnN0YW5jaW5nKSB7XG4gICAgICBpZiAob3B0aW9ucy5pbnN0YW5jZXMpIHtcbiAgICAgICAgYmF0Y2goQ1VSX0lOU1RBTkNFUywgJz0nLCBkeW4ob3B0aW9ucy5pbnN0YW5jZXMpLCAnOycpXG4gICAgICB9XG4gICAgICBiYXRjaChcbiAgICAgICAgJ2lmKCcsIENVUl9JTlNUQU5DRVMsICc+MCl7JyxcbiAgICAgICAgSU5TVEFOQ0VfRVhULCAnLmRyYXdFbGVtZW50c0luc3RhbmNlZEFOR0xFKCcsXG4gICAgICAgIENVUl9QUklNSVRJVkUsICcsJyxcbiAgICAgICAgQ1VSX0NPVU5ULCAnLCcsXG4gICAgICAgIENVUl9FTEVNRU5UUywgJy50eXBlLCcsXG4gICAgICAgIENVUl9PRkZTRVQsICcsJyxcbiAgICAgICAgQ1VSX0lOU1RBTkNFUywgJyk7fWVsc2V7JylcbiAgICB9XG4gICAgYmF0Y2goXG4gICAgICBHTCwgJy5kcmF3RWxlbWVudHMoJyxcbiAgICAgIENVUl9QUklNSVRJVkUsICcsJyxcbiAgICAgIENVUl9DT1VOVCwgJywnLFxuICAgICAgQ1VSX0VMRU1FTlRTLCAnLnR5cGUsJyxcbiAgICAgIENVUl9PRkZTRVQsICcpOycpXG4gICAgaWYgKGluc3RhbmNpbmcpIHtcbiAgICAgIGJhdGNoKCd9JylcbiAgICB9XG4gICAgaWYgKHVzZUVsZW1lbnRPcHRpb24oJ2NvdW50JykpIHtcbiAgICAgIGJhdGNoKCd9JylcbiAgICB9XG4gICAgYmF0Y2goJ31lbHNleycpXG4gICAgaWYgKCF1c2VFbGVtZW50T3B0aW9uKCdjb3VudCcpKSB7XG4gICAgICBpZiAodXNlRWxlbWVudE9wdGlvbigncHJpbWl0aXZlJykpIHtcbiAgICAgICAgYmF0Y2goQ1VSX1BSSU1JVElWRSwgJz0nLCBHTF9UUklBTkdMRVMsICc7JylcbiAgICAgIH1cbiAgICAgIGlmIChpbnN0YW5jaW5nKSB7XG4gICAgICAgIGJhdGNoKFxuICAgICAgICAgICdpZignLCBDVVJfSU5TVEFOQ0VTLCAnPjApeycsXG4gICAgICAgICAgSU5TVEFOQ0VfRVhULCAnLmRyYXdBcnJheXNJbnN0YW5jZWRBTkdMRSgnLFxuICAgICAgICAgIENVUl9QUklNSVRJVkUsICcsJyxcbiAgICAgICAgICBDVVJfT0ZGU0VULCAnLCcsXG4gICAgICAgICAgQ1VSX0NPVU5ULCAnLCcsXG4gICAgICAgICAgQ1VSX0lOU1RBTkNFUywgJyk7fWVsc2V7JylcbiAgICAgIH1cbiAgICAgIGJhdGNoKFxuICAgICAgICBHTCwgJy5kcmF3QXJyYXlzKCcsXG4gICAgICAgIENVUl9QUklNSVRJVkUsICcsJyxcbiAgICAgICAgQ1VSX09GRlNFVCwgJywnLFxuICAgICAgICBDVVJfQ09VTlQsICcpO30nKVxuICAgICAgaWYgKGluc3RhbmNpbmcpIHtcbiAgICAgICAgYmF0Y2goJ30nKVxuICAgICAgfVxuICAgIH1cbiAgICBiYXRjaCgnfX0nLCBleGl0KVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGNvbXBpbGUgYW5kIHJldHVyblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICByZXR1cm4gZW52LmNvbXBpbGUoKS5iYXRjaFxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBNQUlOIERSQVcgQ09NTUFORFxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIGNvbXBpbGVDb21tYW5kIChcbiAgICBzdGF0aWNPcHRpb25zLCBzdGF0aWNVbmlmb3Jtcywgc3RhdGljQXR0cmlidXRlcyxcbiAgICBkeW5hbWljT3B0aW9ucywgZHluYW1pY1VuaWZvcm1zLCBkeW5hbWljQXR0cmlidXRlcyxcbiAgICBoYXNEeW5hbWljKSB7XG4gICAgLy8gQ3JlYXRlIGNvZGUgZ2VuZXJhdGlvbiBlbnZpcm9ubWVudFxuICAgIHZhciBlbnYgPSBjcmVhdGVFbnZpcm9ubWVudCgpXG4gICAgdmFyIGxpbmsgPSBlbnYubGlua1xuICAgIHZhciBibG9jayA9IGVudi5ibG9ja1xuICAgIHZhciBwcm9jID0gZW52LnByb2NcblxuICAgIHZhciBjYWxsSWQgPSBkcmF3Q2FsbENvdW50ZXIrK1xuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIENvbW1vbiBzdGF0ZSB2YXJpYWJsZXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgdmFyIEdMX1BPTEwgPSBsaW5rKHJlZ2xQb2xsKVxuICAgIHZhciBTVFJJTkdfU1RPUkUgPSBsaW5rKHN0cmluZ1N0b3JlKVxuICAgIHZhciBGUkFHX1NIQURFUl9TVEFURSA9IGxpbmsoc2hhZGVyU3RhdGUuZnJhZ1NoYWRlcnMpXG4gICAgdmFyIFZFUlRfU0hBREVSX1NUQVRFID0gbGluayhzaGFkZXJTdGF0ZS52ZXJ0U2hhZGVycylcbiAgICB2YXIgUFJPR1JBTV9TVEFURSA9IGxpbmsoc2hhZGVyU3RhdGUucHJvZ3JhbXMpXG4gICAgdmFyIEZSQU1FQlVGRkVSX1NUQVRFID0gbGluayhmcmFtZWJ1ZmZlclN0YXRlKVxuICAgIHZhciBEUkFXX1NUQVRFID0ge1xuICAgICAgY291bnQ6IGxpbmsoZHJhd1N0YXRlLmNvdW50KSxcbiAgICAgIG9mZnNldDogbGluayhkcmF3U3RhdGUub2Zmc2V0KSxcbiAgICAgIGluc3RhbmNlczogbGluayhkcmF3U3RhdGUuaW5zdGFuY2VzKSxcbiAgICAgIHByaW1pdGl2ZTogbGluayhkcmF3U3RhdGUucHJpbWl0aXZlKVxuICAgIH1cbiAgICB2YXIgRUxFTUVOVF9TVEFURSA9IGxpbmsoZWxlbWVudFN0YXRlLmVsZW1lbnRzKVxuICAgIHZhciBQUklNX1RZUEVTID0gbGluayhwcmltVHlwZXMpXG4gICAgdmFyIENPTVBBUkVfRlVOQ1MgPSBsaW5rKGNvbXBhcmVGdW5jcylcbiAgICB2YXIgU1RFTkNJTF9PUFMgPSBsaW5rKHN0ZW5jaWxPcHMpXG5cbiAgICB2YXIgQ09OVEVYVF9TVEFURSA9IHt9XG4gICAgZnVuY3Rpb24gbGlua0NvbnRleHQgKHgpIHtcbiAgICAgIHZhciByZXN1bHQgPSBDT05URVhUX1NUQVRFW3hdXG4gICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH1cbiAgICAgIHJlc3VsdCA9IENPTlRFWFRfU1RBVEVbeF0gPSBsaW5rKGNvbnRleHRTdGF0ZVt4XSlcbiAgICAgIHJldHVybiByZXN1bHRcbiAgICB9XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gU1RBVElDIFNUQVRFXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIENvZGUgYmxvY2tzIGZvciB0aGUgc3RhdGljIHNlY3Rpb25zXG4gICAgdmFyIGVudHJ5ID0gYmxvY2soKVxuICAgIHZhciBleGl0ID0gYmxvY2soKVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHVwZGF0ZSBkZWZhdWx0IGNvbnRleHQgc3RhdGUgdmFyaWFibGVzXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIGZ1bmN0aW9uIGhhbmRsZVN0YXRpY09wdGlvbiAocGFyYW0sIHZhbHVlKSB7XG4gICAgICB2YXIgU1RBVEVfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgIGVudHJ5KFNUQVRFX1NUQUNLLCAnLnB1c2goJywgdmFsdWUsICcpOycpXG4gICAgICBleGl0KFNUQVRFX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgfVxuXG4gICAgdmFyIGhhc1NoYWRlciA9IGZhbHNlXG4gICAgT2JqZWN0LmtleXMoc3RhdGljT3B0aW9ucykuc29ydChvcHRpb25Qcmlvcml0eSkuZm9yRWFjaChmdW5jdGlvbiAocGFyYW0pIHtcbiAgICAgIHZhciB2YWx1ZSA9IHN0YXRpY09wdGlvbnNbcGFyYW1dXG4gICAgICBzd2l0Y2ggKHBhcmFtKSB7XG4gICAgICAgIGNhc2UgJ2ZyYWcnOlxuICAgICAgICAgIGhhc1NoYWRlciA9IHRydWVcbiAgICAgICAgICBlbnRyeShGUkFHX1NIQURFUl9TVEFURSwgJy5wdXNoKCcsIGxpbmsoc3RyaW5nU3RvcmUuaWQodmFsdWUpKSwgJyk7JylcbiAgICAgICAgICBleGl0KEZSQUdfU0hBREVSX1NUQVRFLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICd2ZXJ0JzpcbiAgICAgICAgICBoYXNTaGFkZXIgPSB0cnVlXG4gICAgICAgICAgZW50cnkoVkVSVF9TSEFERVJfU1RBVEUsICcucHVzaCgnLCBsaW5rKHN0cmluZ1N0b3JlLmlkKHZhbHVlKSksICcpOycpXG4gICAgICAgICAgZXhpdChWRVJUX1NIQURFUl9TVEFURSwgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnZnJhbWVidWZmZXInOlxuICAgICAgICAgIHZhciBmYm8gPSBmcmFtZWJ1ZmZlclN0YXRlLmdldEZyYW1lYnVmZmVyKHZhbHVlKVxuICAgICAgICAgIGNoZWNrKHZhbHVlID09PSBudWxsIHx8IGZibywgJ2ludmFsaWQgZnJhbWVidWZmZXIgb2JqZWN0JylcbiAgICAgICAgICB2YXIgVklFV1BPUlRfU1RBVEUgPSBsaW5rQ29udGV4dCgndmlld3BvcnQnKVxuICAgICAgICAgIHZhciBTQ0lTU09SX1NUQVRFID0gbGlua0NvbnRleHQoJ3NjaXNzb3IuYm94JylcbiAgICAgICAgICBlbnRyeSgnaWYoJywgRlJBTUVCVUZGRVJfU1RBVEUsICcucHVzaCgnLCBsaW5rKFxuICAgICAgICAgICAgdmFsdWUgJiYgdmFsdWUuX2ZyYW1lYnVmZmVyKSwgJykpeycsXG4gICAgICAgICAgICBWSUVXUE9SVF9TVEFURSwgJy5zZXREaXJ0eSgpOycsXG4gICAgICAgICAgICBTQ0lTU09SX1NUQVRFLCAnLnNldERpcnR5KCk7JyxcbiAgICAgICAgICAgICd9JylcbiAgICAgICAgICBleGl0KCdpZignLCBGUkFNRUJVRkZFUl9TVEFURSwgJy5wb3AoKSl7JyxcbiAgICAgICAgICAgIFZJRVdQT1JUX1NUQVRFLCAnLnNldERpcnR5KCk7JyxcbiAgICAgICAgICAgIFNDSVNTT1JfU1RBVEUsICcuc2V0RGlydHkoKTsnLFxuICAgICAgICAgICAgJ30nKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgLy8gVXBkYXRlIGRyYXcgc3RhdGVcbiAgICAgICAgY2FzZSAnY291bnQnOlxuICAgICAgICBjYXNlICdvZmZzZXQnOlxuICAgICAgICBjYXNlICdpbnN0YW5jZXMnOlxuICAgICAgICAgIGNoZWNrLm5uaSh2YWx1ZSwgcGFyYW0pXG4gICAgICAgICAgZW50cnkoRFJBV19TVEFURVtwYXJhbV0sICcucHVzaCgnLCB2YWx1ZSwgJyk7JylcbiAgICAgICAgICBleGl0KERSQVdfU1RBVEVbcGFyYW1dLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICAvLyBVcGRhdGUgcHJpbWl0aXZlIHR5cGVcbiAgICAgICAgY2FzZSAncHJpbWl0aXZlJzpcbiAgICAgICAgICBjaGVjay5wYXJhbWV0ZXIodmFsdWUsIHByaW1UeXBlcywgJ25vdCBhIHZhbGlkIGRyYXdpbmcgcHJpbWl0aXZlJylcbiAgICAgICAgICB2YXIgcHJpbVR5cGUgPSBwcmltVHlwZXNbdmFsdWVdXG4gICAgICAgICAgZW50cnkoRFJBV19TVEFURS5wcmltaXRpdmUsICcucHVzaCgnLCBwcmltVHlwZSwgJyk7JylcbiAgICAgICAgICBleGl0KERSQVdfU1RBVEUucHJpbWl0aXZlLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICAvLyBVcGRhdGUgZWxlbWVudCBidWZmZXJcbiAgICAgICAgY2FzZSAnZWxlbWVudHMnOlxuICAgICAgICAgIHZhciBlbGVtZW50cyA9IGVsZW1lbnRTdGF0ZS5nZXRFbGVtZW50cyh2YWx1ZSlcbiAgICAgICAgICB2YXIgaGFzUHJpbWl0aXZlID0gISgncHJpbWl0aXZlJyBpbiBzdGF0aWNPcHRpb25zKVxuICAgICAgICAgIHZhciBoYXNDb3VudCA9ICEoJ2NvdW50JyBpbiBzdGF0aWNPcHRpb25zKVxuICAgICAgICAgIGlmIChlbGVtZW50cykge1xuICAgICAgICAgICAgdmFyIEVMRU1FTlRTID0gbGluayhlbGVtZW50cylcbiAgICAgICAgICAgIGVudHJ5KEVMRU1FTlRfU1RBVEUsICcucHVzaCgnLCBFTEVNRU5UUywgJyk7JylcbiAgICAgICAgICAgIGlmIChoYXNQcmltaXRpdmUpIHtcbiAgICAgICAgICAgICAgZW50cnkoRFJBV19TVEFURS5wcmltaXRpdmUsICcucHVzaCgnLCBFTEVNRU5UUywgJy5wcmltVHlwZSk7JylcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChoYXNDb3VudCkge1xuICAgICAgICAgICAgICBlbnRyeShEUkFXX1NUQVRFLmNvdW50LCAnLnB1c2goJywgRUxFTUVOVFMsICcudmVydENvdW50KTsnKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBlbnRyeShFTEVNRU5UX1NUQVRFLCAnLnB1c2gobnVsbCk7JylcbiAgICAgICAgICAgIGlmIChoYXNQcmltaXRpdmUpIHtcbiAgICAgICAgICAgICAgZW50cnkoRFJBV19TVEFURS5wcmltaXRpdmUsICcucHVzaCgnLCBHTF9UUklBTkdMRVMsICcpOycpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaGFzQ291bnQpIHtcbiAgICAgICAgICAgICAgZW50cnkoRFJBV19TVEFURS5jb3VudCwgJy5wdXNoKDApOycpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChoYXNQcmltaXRpdmUpIHtcbiAgICAgICAgICAgIGV4aXQoRFJBV19TVEFURS5wcmltaXRpdmUsICcucG9wKCk7JylcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGhhc0NvdW50KSB7XG4gICAgICAgICAgICBleGl0KERSQVdfU1RBVEUuY291bnQsICcucG9wKCk7JylcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCEoJ29mZnNldCcgaW4gc3RhdGljT3B0aW9ucykpIHtcbiAgICAgICAgICAgIGVudHJ5KERSQVdfU1RBVEUub2Zmc2V0LCAnLnB1c2goMCk7JylcbiAgICAgICAgICAgIGV4aXQoRFJBV19TVEFURS5vZmZzZXQsICcucG9wKCk7JylcbiAgICAgICAgICB9XG4gICAgICAgICAgZXhpdChFTEVNRU5UX1NUQVRFLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdjdWxsLmVuYWJsZSc6XG4gICAgICAgIGNhc2UgJ2JsZW5kLmVuYWJsZSc6XG4gICAgICAgIGNhc2UgJ2RpdGhlcic6XG4gICAgICAgIGNhc2UgJ3N0ZW5jaWwuZW5hYmxlJzpcbiAgICAgICAgY2FzZSAnZGVwdGguZW5hYmxlJzpcbiAgICAgICAgY2FzZSAnc2Npc3Nvci5lbmFibGUnOlxuICAgICAgICBjYXNlICdwb2x5Z29uT2Zmc2V0LmVuYWJsZSc6XG4gICAgICAgIGNhc2UgJ3NhbXBsZS5hbHBoYSc6XG4gICAgICAgIGNhc2UgJ3NhbXBsZS5lbmFibGUnOlxuICAgICAgICBjYXNlICdkZXB0aC5tYXNrJzpcbiAgICAgICAgICBjaGVjay50eXBlKHZhbHVlLCAnYm9vbGVhbicsIHBhcmFtKVxuICAgICAgICAgIGhhbmRsZVN0YXRpY09wdGlvbihwYXJhbSwgdmFsdWUpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdkZXB0aC5mdW5jJzpcbiAgICAgICAgICBjaGVjay5wYXJhbWV0ZXIodmFsdWUsIGNvbXBhcmVGdW5jcywgcGFyYW0pXG4gICAgICAgICAgaGFuZGxlU3RhdGljT3B0aW9uKHBhcmFtLCBjb21wYXJlRnVuY3NbdmFsdWVdKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnZGVwdGgucmFuZ2UnOlxuICAgICAgICAgIGNoZWNrKFxuICAgICAgICAgICAgQXJyYXkuaXNBcnJheSh2YWx1ZSkgJiZcbiAgICAgICAgICAgIHZhbHVlLmxlbmd0aCA9PT0gMiAmJlxuICAgICAgICAgICAgdmFsdWVbMF0gPD0gdmFsdWVbMV0sXG4gICAgICAgICAgICAnZGVwdGggcmFuZ2UgaXMgMmQgYXJyYXknKVxuICAgICAgICAgIHZhciBERVBUSF9SQU5HRV9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGVudHJ5KERFUFRIX1JBTkdFX1NUQUNLLCAnLnB1c2goJywgdmFsdWVbMF0sICcsJywgdmFsdWVbMV0sICcpOycpXG4gICAgICAgICAgZXhpdChERVBUSF9SQU5HRV9TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnYmxlbmQuZnVuYyc6XG4gICAgICAgICAgdmFyIEJMRU5EX0ZVTkNfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBjaGVjay50eXBlKHZhbHVlLCAnb2JqZWN0JywgJ2JsZW5kIGZ1bmMgbXVzdCBiZSBhbiBvYmplY3QnKVxuICAgICAgICAgIHZhciBzcmNSR0IgPSAoJ3NyY1JHQicgaW4gdmFsdWUgPyB2YWx1ZS5zcmNSR0IgOiB2YWx1ZS5zcmMpXG4gICAgICAgICAgdmFyIHNyY0FscGhhID0gKCdzcmNBbHBoYScgaW4gdmFsdWUgPyB2YWx1ZS5zcmNBbHBoYSA6IHZhbHVlLnNyYylcbiAgICAgICAgICB2YXIgZHN0UkdCID0gKCdkc3RSR0InIGluIHZhbHVlID8gdmFsdWUuZHN0UkdCIDogdmFsdWUuZHN0KVxuICAgICAgICAgIHZhciBkc3RBbHBoYSA9ICgnZHN0QWxwaGEnIGluIHZhbHVlID8gdmFsdWUuZHN0QWxwaGEgOiB2YWx1ZS5kc3QpXG4gICAgICAgICAgY2hlY2sucGFyYW1ldGVyKHNyY1JHQiwgYmxlbmRGdW5jcylcbiAgICAgICAgICBjaGVjay5wYXJhbWV0ZXIoc3JjQWxwaGEsIGJsZW5kRnVuY3MpXG4gICAgICAgICAgY2hlY2sucGFyYW1ldGVyKGRzdFJHQiwgYmxlbmRGdW5jcylcbiAgICAgICAgICBjaGVjay5wYXJhbWV0ZXIoZHN0QWxwaGEsIGJsZW5kRnVuY3MpXG4gICAgICAgICAgZW50cnkoQkxFTkRfRlVOQ19TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICBibGVuZEZ1bmNzW3NyY1JHQl0sICcsJyxcbiAgICAgICAgICAgIGJsZW5kRnVuY3NbZHN0UkdCXSwgJywnLFxuICAgICAgICAgICAgYmxlbmRGdW5jc1tzcmNBbHBoYV0sICcsJyxcbiAgICAgICAgICAgIGJsZW5kRnVuY3NbZHN0QWxwaGFdLCAnKTsnKVxuICAgICAgICAgIGV4aXQoQkxFTkRfRlVOQ19TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnYmxlbmQuZXF1YXRpb24nOlxuICAgICAgICAgIHZhciBCTEVORF9FUVVBVElPTl9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICBjaGVjay5wYXJhbWV0ZXIodmFsdWUsIGJsZW5kRXF1YXRpb25zLCAnaW52YWxpZCBibGVuZCBlcXVhdGlvbicpXG4gICAgICAgICAgICBlbnRyeShCTEVORF9FUVVBVElPTl9TVEFDSyxcbiAgICAgICAgICAgICAgJy5wdXNoKCcsXG4gICAgICAgICAgICAgIGJsZW5kRXF1YXRpb25zW3ZhbHVlXSwgJywnLFxuICAgICAgICAgICAgICBibGVuZEVxdWF0aW9uc1t2YWx1ZV0sICcpOycpXG4gICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICBjaGVjay5wYXJhbWV0ZXIoXG4gICAgICAgICAgICAgIHZhbHVlLnJnYiwgYmxlbmRFcXVhdGlvbnMsICdpbnZhbGlkIGJsZW5kIGVxdWF0aW9uIHJnYicpXG4gICAgICAgICAgICBjaGVjay5wYXJhbWV0ZXIoXG4gICAgICAgICAgICAgIHZhbHVlLmFscGhhLCBibGVuZEVxdWF0aW9ucywgJ2ludmFsaWQgYmxlbmQgZXF1YXRpb24gYWxwaGEnKVxuICAgICAgICAgICAgZW50cnkoQkxFTkRfRVFVQVRJT05fU1RBQ0ssXG4gICAgICAgICAgICAgICcucHVzaCgnLFxuICAgICAgICAgICAgICBibGVuZEVxdWF0aW9uc1t2YWx1ZS5yZ2JdLCAnLCcsXG4gICAgICAgICAgICAgIGJsZW5kRXF1YXRpb25zW3ZhbHVlLmFscGhhXSwgJyk7JylcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY2hlY2sucmFpc2UoJ2ludmFsaWQgYmxlbmQgZXF1YXRpb24nKVxuICAgICAgICAgIH1cbiAgICAgICAgICBleGl0KEJMRU5EX0VRVUFUSU9OX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdibGVuZC5jb2xvcic6XG4gICAgICAgICAgY2hlY2soXG4gICAgICAgICAgICBBcnJheS5pc0FycmF5KHZhbHVlKSAmJlxuICAgICAgICAgICAgdmFsdWUubGVuZ3RoID09PSA0LFxuICAgICAgICAgICAgJ2JsZW5kIGNvbG9yIGlzIGEgNGQgYXJyYXknKVxuICAgICAgICAgIHZhciBCTEVORF9DT0xPUl9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGVudHJ5KEJMRU5EX0NPTE9SX1NUQUNLLFxuICAgICAgICAgICAgJy5wdXNoKCcsXG4gICAgICAgICAgICB2YWx1ZVswXSwgJywnLFxuICAgICAgICAgICAgdmFsdWVbMV0sICcsJyxcbiAgICAgICAgICAgIHZhbHVlWzJdLCAnLCcsXG4gICAgICAgICAgICB2YWx1ZVszXSwgJyk7JylcbiAgICAgICAgICBleGl0KEJMRU5EX0NPTE9SX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdzdGVuY2lsLm1hc2snOlxuICAgICAgICAgIGNoZWNrLnR5cGUodmFsdWUsICdudW1iZXInLCAnc3RlbmNpbCBtYXNrIG11c3QgYmUgYW4gaW50ZWdlcicpXG4gICAgICAgICAgdmFyIFNURU5DSUxfTUFTS19TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGVudHJ5KFNURU5DSUxfTUFTS19TVEFDSywgJy5wdXNoKCcsIHZhbHVlLCAnKTsnKVxuICAgICAgICAgIGV4aXQoU1RFTkNJTF9NQVNLX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdzdGVuY2lsLmZ1bmMnOlxuICAgICAgICAgIGNoZWNrLnR5cGUodmFsdWUsICdvYmplY3QnLCAnc3RlbmNpbCBmdW5jIG11c3QgYmUgYW4gb2JqZWN0JylcbiAgICAgICAgICB2YXIgY21wID0gdmFsdWUuY21wIHx8ICdrZWVwJ1xuICAgICAgICAgIHZhciByZWYgPSB2YWx1ZS5yZWYgfHwgMFxuICAgICAgICAgIHZhciBtYXNrID0gJ21hc2snIGluIHZhbHVlID8gdmFsdWUubWFzayA6IC0xXG4gICAgICAgICAgY2hlY2sucGFyYW1ldGVyKGNtcCwgY29tcGFyZUZ1bmNzLCAnaW52YWxpZCBzdGVuY2lsIGZ1bmMgY21wJylcbiAgICAgICAgICBjaGVjay50eXBlKHJlZiwgJ251bWJlcicsICdzdGVuY2lsIGZ1bmMgcmVmJylcbiAgICAgICAgICBjaGVjay50eXBlKG1hc2ssICdudW1iZXInLCAnc3RlbmNpbCBmdW5jIG1hc2snKVxuICAgICAgICAgIHZhciBTVEVOQ0lMX0ZVTkNfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBlbnRyeShTVEVOQ0lMX0ZVTkNfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgY29tcGFyZUZ1bmNzW2NtcF0sICcsJyxcbiAgICAgICAgICAgIHJlZiwgJywnLFxuICAgICAgICAgICAgbWFzaywgJyk7JylcbiAgICAgICAgICBleGl0KFNURU5DSUxfRlVOQ19TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnc3RlbmNpbC5vcEZyb250JzpcbiAgICAgICAgY2FzZSAnc3RlbmNpbC5vcEJhY2snOlxuICAgICAgICAgIGNoZWNrLnR5cGUodmFsdWUsICdvYmplY3QnLCBwYXJhbSlcbiAgICAgICAgICB2YXIgZmFpbCA9IHZhbHVlLmZhaWwgfHwgJ2tlZXAnXG4gICAgICAgICAgdmFyIHpmYWlsID0gdmFsdWUuemZhaWwgfHwgJ2tlZXAnXG4gICAgICAgICAgdmFyIHBhc3MgPSB2YWx1ZS5wYXNzIHx8ICdrZWVwJ1xuICAgICAgICAgIGNoZWNrLnBhcmFtZXRlcihmYWlsLCBzdGVuY2lsT3BzLCBwYXJhbSlcbiAgICAgICAgICBjaGVjay5wYXJhbWV0ZXIoemZhaWwsIHN0ZW5jaWxPcHMsIHBhcmFtKVxuICAgICAgICAgIGNoZWNrLnBhcmFtZXRlcihwYXNzLCBzdGVuY2lsT3BzLCBwYXJhbSlcbiAgICAgICAgICB2YXIgU1RFTkNJTF9PUF9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGVudHJ5KFNURU5DSUxfT1BfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgc3RlbmNpbE9wc1tmYWlsXSwgJywnLFxuICAgICAgICAgICAgc3RlbmNpbE9wc1t6ZmFpbF0sICcsJyxcbiAgICAgICAgICAgIHN0ZW5jaWxPcHNbcGFzc10sICcpOycpXG4gICAgICAgICAgZXhpdChTVEVOQ0lMX09QX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdwb2x5Z29uT2Zmc2V0Lm9mZnNldCc6XG4gICAgICAgICAgY2hlY2sudHlwZSh2YWx1ZSwgJ29iamVjdCcsIHBhcmFtKVxuICAgICAgICAgIHZhciBmYWN0b3IgPSB2YWx1ZS5mYWN0b3IgfHwgMFxuICAgICAgICAgIHZhciB1bml0cyA9IHZhbHVlLnVuaXRzIHx8IDBcbiAgICAgICAgICBjaGVjay50eXBlKGZhY3RvciwgJ251bWJlcicsICdvZmZzZXQuZmFjdG9yJylcbiAgICAgICAgICBjaGVjay50eXBlKHVuaXRzLCAnbnVtYmVyJywgJ29mZnNldC51bml0cycpXG4gICAgICAgICAgdmFyIFBPTFlHT05fT0ZGU0VUX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZW50cnkoUE9MWUdPTl9PRkZTRVRfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgZmFjdG9yLCAnLCcsIHVuaXRzLCAnKTsnKVxuICAgICAgICAgIGV4aXQoUE9MWUdPTl9PRkZTRVRfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2N1bGwuZmFjZSc6XG4gICAgICAgICAgdmFyIGZhY2UgPSAwXG4gICAgICAgICAgaWYgKHZhbHVlID09PSAnZnJvbnQnKSB7XG4gICAgICAgICAgICBmYWNlID0gR0xfRlJPTlRcbiAgICAgICAgICB9IGVsc2UgaWYgKHZhbHVlID09PSAnYmFjaycpIHtcbiAgICAgICAgICAgIGZhY2UgPSBHTF9CQUNLXG4gICAgICAgICAgfVxuICAgICAgICAgIGNoZWNrKCEhZmFjZSwgJ2N1bGwuZmFjZScpXG4gICAgICAgICAgdmFyIENVTExfRkFDRV9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGVudHJ5KENVTExfRkFDRV9TVEFDSywgJy5wdXNoKCcsIGZhY2UsICcpOycpXG4gICAgICAgICAgZXhpdChDVUxMX0ZBQ0VfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2xpbmVXaWR0aCc6XG4gICAgICAgICAgdmFyIGxpbmVXaWR0aERpbXMgPSBsaW1pdHMubGluZVdpZHRoRGltc1xuICAgICAgICAgIGNoZWNrKFxuICAgICAgICAgICAgdHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyAmJlxuICAgICAgICAgICAgdmFsdWUgPj0gbGluZVdpZHRoRGltc1swXSAmJlxuICAgICAgICAgICAgdmFsdWUgPD0gbGluZVdpZHRoRGltc1sxXSxcbiAgICAgICAgICAgICdpbnZhbGlkIGxpbmUgd2lkdGgsIG11c3QgcG9zaXRpdmUgbnVtYmVyIGJldHdlZW4gJyArXG4gICAgICAgICAgICBsaW5lV2lkdGhEaW1zWzBdICsgJyBhbmQgJyArIGxpbmVXaWR0aERpbXNbMV0pXG4gICAgICAgICAgaGFuZGxlU3RhdGljT3B0aW9uKHBhcmFtLCB2YWx1ZSlcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2Zyb250RmFjZSc6XG4gICAgICAgICAgdmFyIG9yaWVudGF0aW9uID0gMFxuICAgICAgICAgIGlmICh2YWx1ZSA9PT0gJ2N3Jykge1xuICAgICAgICAgICAgb3JpZW50YXRpb24gPSBHTF9DV1xuICAgICAgICAgIH0gZWxzZSBpZiAodmFsdWUgPT09ICdjY3cnKSB7XG4gICAgICAgICAgICBvcmllbnRhdGlvbiA9IEdMX0NDV1xuICAgICAgICAgIH1cbiAgICAgICAgICBjaGVjayghIW9yaWVudGF0aW9uLCAnZnJvbnRGYWNlJylcbiAgICAgICAgICB2YXIgRlJPTlRfRkFDRV9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGVudHJ5KEZST05UX0ZBQ0VfU1RBQ0ssICcucHVzaCgnLCBvcmllbnRhdGlvbiwgJyk7JylcbiAgICAgICAgICBleGl0KEZST05UX0ZBQ0VfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2NvbG9yTWFzayc6XG4gICAgICAgICAgY2hlY2soQXJyYXkuaXNBcnJheSh2YWx1ZSkgJiYgdmFsdWUubGVuZ3RoID09PSA0LCAnY29sb3IgbWFzayBtdXN0IGJlIGxlbmd0aCA0IGFycmF5JylcbiAgICAgICAgICB2YXIgQ09MT1JfTUFTS19TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGVudHJ5KENPTE9SX01BU0tfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgdmFsdWUubWFwKGZ1bmN0aW9uICh2KSB7IHJldHVybiAhIXYgfSkuam9pbigpLFxuICAgICAgICAgICAgJyk7JylcbiAgICAgICAgICBleGl0KENPTE9SX01BU0tfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3NhbXBsZS5jb3ZlcmFnZSc6XG4gICAgICAgICAgY2hlY2sudHlwZSh2YWx1ZSwgJ29iamVjdCcsIHBhcmFtKVxuICAgICAgICAgIHZhciBzYW1wbGVWYWx1ZSA9ICd2YWx1ZScgaW4gdmFsdWUgPyB2YWx1ZS52YWx1ZSA6IDFcbiAgICAgICAgICB2YXIgc2FtcGxlSW52ZXJ0ID0gISF2YWx1ZS5pbnZlcnRcbiAgICAgICAgICBjaGVjayhcbiAgICAgICAgICAgIHR5cGVvZiBzYW1wbGVWYWx1ZSA9PT0gJ251bWJlcicgJiZcbiAgICAgICAgICAgIHNhbXBsZVZhbHVlID49IDAgJiYgc2FtcGxlVmFsdWUgPD0gMSxcbiAgICAgICAgICAgICdzYW1wbGUgdmFsdWUnKVxuICAgICAgICAgIHZhciBTQU1QTEVfQ09WRVJBR0VfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBlbnRyeShTQU1QTEVfQ09WRVJBR0VfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgc2FtcGxlVmFsdWUsICcsJywgc2FtcGxlSW52ZXJ0LCAnKTsnKVxuICAgICAgICAgIGV4aXQoU0FNUExFX0NPVkVSQUdFX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICd2aWV3cG9ydCc6XG4gICAgICAgIGNhc2UgJ3NjaXNzb3IuYm94JzpcbiAgICAgICAgICBjaGVjayh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlLCBwYXJhbSArICcgaXMgYW4gb2JqZWN0JylcbiAgICAgICAgICB2YXIgWCA9IHZhbHVlLnggfHwgMFxuICAgICAgICAgIHZhciBZID0gdmFsdWUueSB8fCAwXG4gICAgICAgICAgdmFyIFcgPSAtMVxuICAgICAgICAgIHZhciBIID0gLTFcbiAgICAgICAgICBjaGVjayh0eXBlb2YgWCA9PT0gJ251bWJlcicgJiYgWCA+PSAwLCBwYXJhbSArICcueCBtdXN0IGJlIGEgcG9zaXRpdmUgaW50JylcbiAgICAgICAgICBjaGVjayh0eXBlb2YgWSA9PT0gJ251bWJlcicgJiYgWSA+PSAwLCBwYXJhbSArICcueSBtdXN0IGJlIGEgcG9zaXRpdmUgaW50JylcbiAgICAgICAgICBpZiAoJ3cnIGluIHZhbHVlKSB7XG4gICAgICAgICAgICBXID0gdmFsdWUud1xuICAgICAgICAgICAgY2hlY2sodHlwZW9mIFcgPT09ICdudW1iZXInICYmIFcgPj0gMCwgcGFyYW0gKyAnLncgbXVzdCBiZSBhIHBvc2l0aXZlIGludCcpXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgnaCcgaW4gdmFsdWUpIHtcbiAgICAgICAgICAgIEggPSB2YWx1ZS5oXG4gICAgICAgICAgICBjaGVjayh0eXBlb2YgSCA9PT0gJ251bWJlcicgJiYgSCA+PSAwLCBwYXJhbSArICcuaCBtdXN0IGJlIGEgcG9zaXRpdmUgaW50JylcbiAgICAgICAgICB9XG4gICAgICAgICAgdmFyIEJPWF9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGVudHJ5KEJPWF9TVEFDSywgJy5wdXNoKCcsIFgsICcsJywgWSwgJywnLCBXLCAnLCcsIEgsICcpOycpXG4gICAgICAgICAgZXhpdChCT1hfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgLy8gVE9ETyBTaG91bGQgdGhpcyBqdXN0IGJlIGEgd2FybmluZyBpbnN0ZWFkP1xuICAgICAgICAgIGNoZWNrLnJhaXNlKCd1bnN1cHBvcnRlZCBwYXJhbWV0ZXIgJyArIHBhcmFtKVxuICAgICAgICAgIGJyZWFrXG4gICAgICB9XG4gICAgfSlcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyB1cGRhdGUgc2hhZGVyIHByb2dyYW1cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgaWYgKGhhc1NoYWRlcikge1xuICAgICAgaWYgKHN0YXRpY09wdGlvbnMuZnJhZyAmJiBzdGF0aWNPcHRpb25zLnZlcnQpIHtcbiAgICAgICAgdmFyIGZyYWdTcmMgPSBzdGF0aWNPcHRpb25zLmZyYWdcbiAgICAgICAgdmFyIHZlcnRTcmMgPSBzdGF0aWNPcHRpb25zLnZlcnRcbiAgICAgICAgZW50cnkoUFJPR1JBTV9TVEFURSwgJy5wdXNoKCcsXG4gICAgICAgICAgbGluayhzaGFkZXJTdGF0ZS5jcmVhdGUoXG4gICAgICAgICAgICBzdHJpbmdTdG9yZS5pZCh2ZXJ0U3JjKSxcbiAgICAgICAgICAgIHN0cmluZ1N0b3JlLmlkKGZyYWdTcmMpKSksICcpOycpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgRlJBR19TUkMgPSBlbnRyeS5kZWYoXG4gICAgICAgICAgRlJBR19TSEFERVJfU1RBVEUsICdbJywgRlJBR19TSEFERVJfU1RBVEUsICcubGVuZ3RoLTFdJylcbiAgICAgICAgdmFyIFZFUlRfU1JDID0gZW50cnkuZGVmKFxuICAgICAgICAgIFZFUlRfU0hBREVSX1NUQVRFLCAnWycsIFZFUlRfU0hBREVSX1NUQVRFLCAnLmxlbmd0aC0xXScpXG4gICAgICAgIHZhciBMSU5LX1BST0cgPSBsaW5rKHNoYWRlclN0YXRlLmNyZWF0ZSlcbiAgICAgICAgZW50cnkoXG4gICAgICAgICAgUFJPR1JBTV9TVEFURSwgJy5wdXNoKCcsXG4gICAgICAgICAgTElOS19QUk9HLCAnKCcsIFZFUlRfU1JDLCAnLCcsIEZSQUdfU1JDLCAnKSk7JylcbiAgICAgIH1cbiAgICAgIGV4aXQoUFJPR1JBTV9TVEFURSwgJy5wb3AoKTsnKVxuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyB1cGRhdGUgc3RhdGljIHVuaWZvcm1zXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIE9iamVjdC5rZXlzKHN0YXRpY1VuaWZvcm1zKS5mb3JFYWNoKGZ1bmN0aW9uICh1bmlmb3JtKSB7XG4gICAgICB2YXIgU1RBQ0sgPSBsaW5rKHVuaWZvcm1TdGF0ZS5kZWYodW5pZm9ybSkpXG4gICAgICB2YXIgVkFMVUVcbiAgICAgIHZhciB2YWx1ZSA9IHN0YXRpY1VuaWZvcm1zW3VuaWZvcm1dXG4gICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nICYmIHZhbHVlLl9yZWdsVHlwZSkge1xuICAgICAgICBWQUxVRSA9IGxpbmsodmFsdWUpXG4gICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG4gICAgICAgIFZBTFVFID0gbGluayh2YWx1ZS5zbGljZSgpKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgVkFMVUUgPSArdmFsdWVcbiAgICAgIH1cbiAgICAgIGVudHJ5KFNUQUNLLCAnLnB1c2goJywgVkFMVUUsICcpOycpXG4gICAgICBleGl0KFNUQUNLLCAnLnBvcCgpOycpXG4gICAgfSlcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyB1cGRhdGUgZGVmYXVsdCBhdHRyaWJ1dGVzXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIE9iamVjdC5rZXlzKHN0YXRpY0F0dHJpYnV0ZXMpLmZvckVhY2goZnVuY3Rpb24gKGF0dHJpYnV0ZSkge1xuICAgICAgdmFyIEFUVFJJQlVURSA9IGxpbmsoYXR0cmlidXRlU3RhdGUuZGVmKGF0dHJpYnV0ZSkpXG5cbiAgICAgIHZhciBkYXRhID0gc3RhdGljQXR0cmlidXRlc1thdHRyaWJ1dGVdXG4gICAgICBpZiAodHlwZW9mIGRhdGEgPT09ICdudW1iZXInKSB7XG4gICAgICAgIGVudHJ5KEFUVFJJQlVURSwgJy5wdXNoVmVjKCcsICtkYXRhLCAnLDAsMCwwKTsnKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY2hlY2soISFkYXRhLCAnaW52YWxpZCBhdHRyaWJ1dGU6ICcgKyBhdHRyaWJ1dGUpXG5cbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YSkpIHtcbiAgICAgICAgICBlbnRyeShcbiAgICAgICAgICAgIEFUVFJJQlVURSwgJy5wdXNoVmVjKCcsXG4gICAgICAgICAgICBbZGF0YVswXSB8fCAwLCBkYXRhWzFdIHx8IDAsIGRhdGFbMl0gfHwgMCwgZGF0YVszXSB8fCAwXSwgJyk7JylcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB2YXIgYnVmZmVyID0gYnVmZmVyU3RhdGUuZ2V0QnVmZmVyKGRhdGEpXG4gICAgICAgICAgdmFyIHNpemUgPSAwXG4gICAgICAgICAgdmFyIHN0cmlkZSA9IDBcbiAgICAgICAgICB2YXIgb2Zmc2V0ID0gMFxuICAgICAgICAgIHZhciBkaXZpc29yID0gMFxuICAgICAgICAgIHZhciBub3JtYWxpemVkID0gZmFsc2VcbiAgICAgICAgICB2YXIgdHlwZSA9IEdMX0ZMT0FUXG5cbiAgICAgICAgICBpZiAoIWJ1ZmZlcikge1xuICAgICAgICAgICAgY2hlY2sudHlwZShkYXRhLCAnb2JqZWN0JywgJ2ludmFsaWQgYXR0cmlidXRlIFwiJyArIGF0dHJpYnV0ZSArICdcIicpXG5cbiAgICAgICAgICAgIGJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmdldEJ1ZmZlcihkYXRhLmJ1ZmZlcilcbiAgICAgICAgICAgIHNpemUgPSBkYXRhLnNpemUgfHwgMFxuICAgICAgICAgICAgc3RyaWRlID0gZGF0YS5zdHJpZGUgfHwgMFxuICAgICAgICAgICAgb2Zmc2V0ID0gZGF0YS5vZmZzZXQgfHwgMFxuICAgICAgICAgICAgZGl2aXNvciA9IGRhdGEuZGl2aXNvciB8fCAwXG4gICAgICAgICAgICBub3JtYWxpemVkID0gZGF0YS5ub3JtYWxpemVkIHx8IGZhbHNlXG5cbiAgICAgICAgICAgIGNoZWNrKCEhYnVmZmVyLCAnaW52YWxpZCBhdHRyaWJ1dGUgJyArIGF0dHJpYnV0ZSArICcuYnVmZmVyJylcblxuICAgICAgICAgICAgLy8gQ2hlY2sgZm9yIHVzZXIgZGVmaW5lZCB0eXBlIG92ZXJsb2FkaW5nXG4gICAgICAgICAgICB0eXBlID0gYnVmZmVyLmR0eXBlXG4gICAgICAgICAgICBpZiAoJ3R5cGUnIGluIGRhdGEpIHtcbiAgICAgICAgICAgICAgY2hlY2sucGFyYW1ldGVyKGRhdGEudHlwZSwgZ2xUeXBlcywgJ2F0dHJpYnV0ZSB0eXBlJylcbiAgICAgICAgICAgICAgdHlwZSA9IGdsVHlwZXNbZGF0YS50eXBlXVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0eXBlID0gYnVmZmVyLmR0eXBlXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY2hlY2soISFidWZmZXIsICdpbnZhbGlkIGF0dHJpYnV0ZSAnICsgYXR0cmlidXRlICsgJy5idWZmZXInKVxuICAgICAgICAgIGNoZWNrLm5uaShzdHJpZGUsIGF0dHJpYnV0ZSArICcuc3RyaWRlJylcbiAgICAgICAgICBjaGVjay5ubmkob2Zmc2V0LCBhdHRyaWJ1dGUgKyAnLm9mZnNldCcpXG4gICAgICAgICAgY2hlY2subm5pKGRpdmlzb3IsIGF0dHJpYnV0ZSArICcuZGl2aXNvcicpXG4gICAgICAgICAgY2hlY2sudHlwZShub3JtYWxpemVkLCAnYm9vbGVhbicsIGF0dHJpYnV0ZSArICcubm9ybWFsaXplZCcpXG4gICAgICAgICAgY2hlY2sub25lT2Yoc2l6ZSwgWzAsIDEsIDIsIDMsIDRdLCBhdHRyaWJ1dGUgKyAnLnNpemUnKVxuXG4gICAgICAgICAgZW50cnkoXG4gICAgICAgICAgICBBVFRSSUJVVEUsICcucHVzaFB0cignLCBbXG4gICAgICAgICAgICAgIGxpbmsoYnVmZmVyKSwgc2l6ZSwgb2Zmc2V0LCBzdHJpZGUsXG4gICAgICAgICAgICAgIGRpdmlzb3IsIG5vcm1hbGl6ZWQsIHR5cGVcbiAgICAgICAgICAgIF0uam9pbigpLCAnKTsnKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBleGl0KEFUVFJJQlVURSwgJy5wb3AoKTsnKVxuICAgIH0pXG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gRFlOQU1JQyBTVEFURSAoZm9yIHNjb3BlIGFuZCBkcmF3KVxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBHZW5lcmF0ZWQgY29kZSBibG9ja3MgZm9yIGR5bmFtaWMgc3RhdGUgZmxhZ3NcbiAgICB2YXIgZHluYW1pY0VudHJ5ID0gZW52LmJsb2NrKClcbiAgICB2YXIgZHluYW1pY0V4aXQgPSBlbnYuYmxvY2soKVxuXG4gICAgdmFyIEZSQU1FU1RBVEVcbiAgICB2YXIgRFlOQVJHU1xuICAgIGlmIChoYXNEeW5hbWljKSB7XG4gICAgICBGUkFNRVNUQVRFID0gbGluayhmcmFtZVN0YXRlKVxuICAgICAgRFlOQVJHUyA9IGVudHJ5LmRlZigpXG4gICAgfVxuXG4gICAgdmFyIGR5bmFtaWNWYXJzID0ge31cbiAgICBmdW5jdGlvbiBkeW4gKHgpIHtcbiAgICAgIHZhciBpZCA9IHguaWRcbiAgICAgIHZhciByZXN1bHQgPSBkeW5hbWljVmFyc1tpZF1cbiAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgfVxuICAgICAgaWYgKHguZnVuYykge1xuICAgICAgICByZXN1bHQgPSBkeW5hbWljRW50cnkuZGVmKFxuICAgICAgICAgIGxpbmsoeC5kYXRhKSwgJygnLCBEWU5BUkdTLCAnLDAsJywgRlJBTUVTVEFURSwgJyknKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzdWx0ID0gZHluYW1pY0VudHJ5LmRlZihEWU5BUkdTLCAnLicsIHguZGF0YSlcbiAgICAgIH1cbiAgICAgIGR5bmFtaWNWYXJzW2lkXSA9IHJlc3VsdFxuICAgICAgcmV0dXJuIHJlc3VsdFxuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBkeW5hbWljIGNvbnRleHQgc3RhdGUgdmFyaWFibGVzXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIE9iamVjdC5rZXlzKGR5bmFtaWNPcHRpb25zKS5zb3J0KG9wdGlvblByaW9yaXR5KS5mb3JFYWNoKGZ1bmN0aW9uIChwYXJhbSkge1xuICAgICAgLy8gTGluayBpbiBkeW5hbWljIHZhcmlhYmxlXG4gICAgICB2YXIgdmFyaWFibGUgPSBkeW4oZHluYW1pY09wdGlvbnNbcGFyYW1dKVxuXG4gICAgICBzd2l0Y2ggKHBhcmFtKSB7XG4gICAgICAgIGNhc2UgJ2ZyYW1lYnVmZmVyJzpcbiAgICAgICAgICB2YXIgVklFV1BPUlRfU1RBVEUgPSBsaW5rQ29udGV4dCgndmlld3BvcnQnKVxuICAgICAgICAgIHZhciBTQ0lTU09SX1NUQVRFID0gbGlua0NvbnRleHQoJ3NjaXNzb3IuYm94JylcbiAgICAgICAgICBkeW5hbWljRW50cnkoJ2lmKCcsXG4gICAgICAgICAgICBGUkFNRUJVRkZFUl9TVEFURSwgJy5wdXNoKCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJyYmJywgdmFyaWFibGUsICcuX2ZyYW1lYnVmZmVyKSl7JyxcbiAgICAgICAgICAgIFZJRVdQT1JUX1NUQVRFLCAnLnNldERpcnR5KCk7JyxcbiAgICAgICAgICAgIFNDSVNTT1JfU1RBVEUsICcuc2V0RGlydHkoKTsnLFxuICAgICAgICAgICAgJ30nKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KCdpZignLFxuICAgICAgICAgICAgRlJBTUVCVUZGRVJfU1RBVEUsICcucG9wKCkpeycsXG4gICAgICAgICAgICBWSUVXUE9SVF9TVEFURSwgJy5zZXREaXJ0eSgpOycsXG4gICAgICAgICAgICBTQ0lTU09SX1NUQVRFLCAnLnNldERpcnR5KCk7JyxcbiAgICAgICAgICAgICd9JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2N1bGwuZW5hYmxlJzpcbiAgICAgICAgY2FzZSAnYmxlbmQuZW5hYmxlJzpcbiAgICAgICAgY2FzZSAnZGl0aGVyJzpcbiAgICAgICAgY2FzZSAnc3RlbmNpbC5lbmFibGUnOlxuICAgICAgICBjYXNlICdkZXB0aC5lbmFibGUnOlxuICAgICAgICBjYXNlICdzY2lzc29yLmVuYWJsZSc6XG4gICAgICAgIGNhc2UgJ3BvbHlnb25PZmZzZXQuZW5hYmxlJzpcbiAgICAgICAgY2FzZSAnc2FtcGxlLmFscGhhJzpcbiAgICAgICAgY2FzZSAnc2FtcGxlLmVuYWJsZSc6XG4gICAgICAgIGNhc2UgJ2xpbmVXaWR0aCc6XG4gICAgICAgIGNhc2UgJ2RlcHRoLm1hc2snOlxuICAgICAgICAgIHZhciBTVEFURV9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGR5bmFtaWNFbnRyeShTVEFURV9TVEFDSywgJy5wdXNoKCcsIHZhcmlhYmxlLCAnKTsnKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KFNUQVRFX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICAvLyBEcmF3IGNhbGxzXG4gICAgICAgIGNhc2UgJ2NvdW50JzpcbiAgICAgICAgY2FzZSAnb2Zmc2V0JzpcbiAgICAgICAgY2FzZSAnaW5zdGFuY2VzJzpcbiAgICAgICAgICB2YXIgRFJBV19TVEFDSyA9IERSQVdfU1RBVEVbcGFyYW1dXG4gICAgICAgICAgZHluYW1pY0VudHJ5KERSQVdfU1RBQ0ssICcucHVzaCgnLCB2YXJpYWJsZSwgJyk7JylcbiAgICAgICAgICBkeW5hbWljRXhpdChEUkFXX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdwcmltaXRpdmUnOlxuICAgICAgICAgIHZhciBQUklNX1NUQUNLID0gRFJBV19TVEFURS5wcmltaXRpdmVcbiAgICAgICAgICBkeW5hbWljRW50cnkoUFJJTV9TVEFDSywgJy5wdXNoKCcsIFBSSU1fVFlQRVMsICdbJywgdmFyaWFibGUsICddKTsnKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KFBSSU1fU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2RlcHRoLmZ1bmMnOlxuICAgICAgICAgIHZhciBERVBUSF9GVU5DX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZHluYW1pY0VudHJ5KERFUFRIX0ZVTkNfU1RBQ0ssICcucHVzaCgnLCBDT01QQVJFX0ZVTkNTLCAnWycsIHZhcmlhYmxlLCAnXSk7JylcbiAgICAgICAgICBkeW5hbWljRXhpdChERVBUSF9GVU5DX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdibGVuZC5mdW5jJzpcbiAgICAgICAgICB2YXIgQkxFTkRfRlVOQ19TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIHZhciBCTEVORF9GVU5DUyA9IGxpbmsoYmxlbmRGdW5jcylcbiAgICAgICAgICBkeW5hbWljRW50cnkoXG4gICAgICAgICAgICBCTEVORF9GVU5DX1NUQUNLLCAnLnB1c2goJyxcbiAgICAgICAgICAgIEJMRU5EX0ZVTkNTLFxuICAgICAgICAgICAgJ1tcInNyY1JHQlwiIGluICcsIHZhcmlhYmxlLCAnPycsIHZhcmlhYmxlLCAnLnNyY1JHQjonLCB2YXJpYWJsZSwgJy5zcmNdLCcsXG4gICAgICAgICAgICBCTEVORF9GVU5DUyxcbiAgICAgICAgICAgICdbXCJkc3RSR0JcIiBpbiAnLCB2YXJpYWJsZSwgJz8nLCB2YXJpYWJsZSwgJy5kc3RSR0I6JywgdmFyaWFibGUsICcuZHN0XSwnLFxuICAgICAgICAgICAgQkxFTkRfRlVOQ1MsXG4gICAgICAgICAgICAnW1wic3JjQWxwaGFcIiBpbiAnLCB2YXJpYWJsZSwgJz8nLCB2YXJpYWJsZSwgJy5zcmNBbHBoYTonLCB2YXJpYWJsZSwgJy5zcmNdLCcsXG4gICAgICAgICAgICBCTEVORF9GVU5DUyxcbiAgICAgICAgICAgICdbXCJkc3RBbHBoYVwiIGluICcsIHZhcmlhYmxlLCAnPycsIHZhcmlhYmxlLCAnLmRzdEFscGhhOicsIHZhcmlhYmxlLCAnLmRzdF0pOycpXG4gICAgICAgICAgZHluYW1pY0V4aXQoQkxFTkRfRlVOQ19TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnYmxlbmQuZXF1YXRpb24nOlxuICAgICAgICAgIHZhciBCTEVORF9FUVVBVElPTl9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIHZhciBCTEVORF9FUVVBVElPTlMgPSBsaW5rKGJsZW5kRXF1YXRpb25zKVxuICAgICAgICAgIGR5bmFtaWNFbnRyeShcbiAgICAgICAgICAgICdpZih0eXBlb2YgJywgdmFyaWFibGUsICc9PT1cInN0cmluZ1wiKXsnLFxuICAgICAgICAgICAgQkxFTkRfRVFVQVRJT05fU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgQkxFTkRfRVFVQVRJT05TLCAnWycsIHZhcmlhYmxlLCAnXSwnLFxuICAgICAgICAgICAgQkxFTkRfRVFVQVRJT05TLCAnWycsIHZhcmlhYmxlLCAnXSk7JyxcbiAgICAgICAgICAgICd9ZWxzZXsnLFxuICAgICAgICAgICAgQkxFTkRfRVFVQVRJT05fU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgQkxFTkRfRVFVQVRJT05TLCAnWycsIHZhcmlhYmxlLCAnLnJnYl0sJyxcbiAgICAgICAgICAgIEJMRU5EX0VRVUFUSU9OUywgJ1snLCB2YXJpYWJsZSwgJy5hbHBoYV0pOycsXG4gICAgICAgICAgICAnfScpXG4gICAgICAgICAgZHluYW1pY0V4aXQoQkxFTkRfRVFVQVRJT05fU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2JsZW5kLmNvbG9yJzpcbiAgICAgICAgICB2YXIgQkxFTkRfQ09MT1JfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBkeW5hbWljRW50cnkoQkxFTkRfQ09MT1JfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgdmFyaWFibGUsICdbMF0sJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnWzFdLCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJ1syXSwnLFxuICAgICAgICAgICAgdmFyaWFibGUsICdbM10pOycpXG4gICAgICAgICAgZHluYW1pY0V4aXQoQkxFTkRfQ09MT1JfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3N0ZW5jaWwubWFzayc6XG4gICAgICAgICAgdmFyIFNURU5DSUxfTUFTS19TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGR5bmFtaWNFbnRyeShTVEVOQ0lMX01BU0tfU1RBQ0ssICcucHVzaCgnLCB2YXJpYWJsZSwgJyk7JylcbiAgICAgICAgICBkeW5hbWljRXhpdChTVEVOQ0lMX01BU0tfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3N0ZW5jaWwuZnVuYyc6XG4gICAgICAgICAgdmFyIFNURU5DSUxfRlVOQ19TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGR5bmFtaWNFbnRyeShTVEVOQ0lMX0ZVTkNfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgQ09NUEFSRV9GVU5DUywgJ1snLCB2YXJpYWJsZSwgJy5jbXBdLCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJy5yZWZ8MCwnLFxuICAgICAgICAgICAgJ1wibWFza1wiIGluICcsIHZhcmlhYmxlLCAnPycsIHZhcmlhYmxlLCAnLm1hc2s6LTEpOycpXG4gICAgICAgICAgZHluYW1pY0V4aXQoU1RFTkNJTF9GVU5DX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdzdGVuY2lsLm9wRnJvbnQnOlxuICAgICAgICBjYXNlICdzdGVuY2lsLm9wQmFjayc6XG4gICAgICAgICAgdmFyIFNURU5DSUxfT1BfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBkeW5hbWljRW50cnkoU1RFTkNJTF9PUF9TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICBTVEVOQ0lMX09QUywgJ1snLCB2YXJpYWJsZSwgJy5mYWlsfHxcImtlZXBcIl0sJyxcbiAgICAgICAgICAgIFNURU5DSUxfT1BTLCAnWycsIHZhcmlhYmxlLCAnLnpmYWlsfHxcImtlZXBcIl0sJyxcbiAgICAgICAgICAgIFNURU5DSUxfT1BTLCAnWycsIHZhcmlhYmxlLCAnLnBhc3N8fFwia2VlcFwiXSk7JylcbiAgICAgICAgICBkeW5hbWljRXhpdChTVEVOQ0lMX09QX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdwb2x5Z29uT2Zmc2V0Lm9mZnNldCc6XG4gICAgICAgICAgdmFyIFBPTFlHT05fT0ZGU0VUX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZHluYW1pY0VudHJ5KFBPTFlHT05fT0ZGU0VUX1NUQUNLLCAnLnB1c2goJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnLmZhY3Rvcnx8MCwnLFxuICAgICAgICAgICAgdmFyaWFibGUsICcudW5pdHN8fDApOycpXG4gICAgICAgICAgZHluYW1pY0V4aXQoUE9MWUdPTl9PRkZTRVRfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2N1bGwuZmFjZSc6XG4gICAgICAgICAgdmFyIENVTExfRkFDRV9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGR5bmFtaWNFbnRyeShDVUxMX0ZBQ0VfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgdmFyaWFibGUsICc9PT1cImZyb250XCI/JywgR0xfRlJPTlQsICc6JywgR0xfQkFDSywgJyk7JylcbiAgICAgICAgICBkeW5hbWljRXhpdChDVUxMX0ZBQ0VfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2Zyb250RmFjZSc6XG4gICAgICAgICAgdmFyIEZST05UX0ZBQ0VfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBkeW5hbWljRW50cnkoRlJPTlRfRkFDRV9TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJz09PVwiY3dcIj8nLCBHTF9DVywgJzonLCBHTF9DQ1csICcpOycpXG4gICAgICAgICAgZHluYW1pY0V4aXQoRlJPTlRfRkFDRV9TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnY29sb3JNYXNrJzpcbiAgICAgICAgICB2YXIgQ09MT1JfTUFTS19TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGR5bmFtaWNFbnRyeShDT0xPUl9NQVNLX1NUQUNLLCAnLnB1c2goJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnWzBdLCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJ1sxXSwnLFxuICAgICAgICAgICAgdmFyaWFibGUsICdbMl0sJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnWzNdKTsnKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KENPTE9SX01BU0tfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3NhbXBsZS5jb3ZlcmFnZSc6XG4gICAgICAgICAgdmFyIFNBTVBMRV9DT1ZFUkFHRV9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGR5bmFtaWNFbnRyeShTQU1QTEVfQ09WRVJBR0VfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgdmFyaWFibGUsICcudmFsdWUsJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnLmludmVydCk7JylcbiAgICAgICAgICBkeW5hbWljRXhpdChTQU1QTEVfQ09WRVJBR0VfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3NjaXNzb3IuYm94JzpcbiAgICAgICAgY2FzZSAndmlld3BvcnQnOlxuICAgICAgICAgIHZhciBCT1hfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBkeW5hbWljRW50cnkoQk9YX1NUQUNLLCAnLnB1c2goJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnLnh8fDAsJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnLnl8fDAsJyxcbiAgICAgICAgICAgICdcIndcIiBpbiAnLCB2YXJpYWJsZSwgJz8nLCB2YXJpYWJsZSwgJy53Oi0xLCcsXG4gICAgICAgICAgICAnXCJoXCIgaW4gJywgdmFyaWFibGUsICc/JywgdmFyaWFibGUsICcuaDotMSk7JylcbiAgICAgICAgICBkeW5hbWljRXhpdChCT1hfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2VsZW1lbnRzJzpcbiAgICAgICAgICB2YXIgaGFzUHJpbWl0aXZlID1cbiAgICAgICAgICAhKCdwcmltaXRpdmUnIGluIGR5bmFtaWNPcHRpb25zKSAmJlxuICAgICAgICAgICAgISgncHJpbWl0aXZlJyBpbiBzdGF0aWNPcHRpb25zKVxuICAgICAgICAgIHZhciBoYXNDb3VudCA9XG4gICAgICAgICAgISgnY291bnQnIGluIGR5bmFtaWNPcHRpb25zKSAmJlxuICAgICAgICAgICAgISgnY291bnQnIGluIHN0YXRpY09wdGlvbnMpXG4gICAgICAgICAgdmFyIGhhc09mZnNldCA9XG4gICAgICAgICAgISgnb2Zmc2V0JyBpbiBkeW5hbWljT3B0aW9ucykgJiZcbiAgICAgICAgICAgICEoJ29mZnNldCcgaW4gc3RhdGljT3B0aW9ucylcbiAgICAgICAgICB2YXIgRUxFTUVOVFMgPSBkeW5hbWljRW50cnkuZGVmKClcbiAgICAgICAgICBkeW5hbWljRW50cnkoXG4gICAgICAgICAgICAnaWYoJywgdmFyaWFibGUsICcpeycsXG4gICAgICAgICAgICBFTEVNRU5UUywgJz0nLCB2YXJpYWJsZSwgJy5fZWxlbWVudHM7JyxcbiAgICAgICAgICAgIEVMRU1FTlRfU1RBVEUsICcucHVzaCgnLCBFTEVNRU5UUywgJyk7JyxcbiAgICAgICAgICAgICFoYXNQcmltaXRpdmUgPyAnJ1xuICAgICAgICAgICAgICA6IERSQVdfU1RBVEUucHJpbWl0aXZlICsgJy5wdXNoKCcgKyBFTEVNRU5UUyArICcucHJpbVR5cGUpOycsXG4gICAgICAgICAgICAhaGFzQ291bnQgPyAnJ1xuICAgICAgICAgICAgICA6IERSQVdfU1RBVEUuY291bnQgKyAnLnB1c2goJyArIEVMRU1FTlRTICsgJy52ZXJ0Q291bnQpOycsXG4gICAgICAgICAgICAhaGFzT2Zmc2V0ID8gJydcbiAgICAgICAgICAgICAgOiBEUkFXX1NUQVRFLm9mZnNldCArICcucHVzaCgnICsgRUxFTUVOVFMgKyAnLm9mZnNldCk7JyxcbiAgICAgICAgICAgICd9ZWxzZXsnLFxuICAgICAgICAgICAgRUxFTUVOVF9TVEFURSwgJy5wdXNoKG51bGwpOycsXG4gICAgICAgICAgICAnfScpXG4gICAgICAgICAgZHluYW1pY0V4aXQoXG4gICAgICAgICAgICBFTEVNRU5UX1NUQVRFLCAnLnBvcCgpOycsXG4gICAgICAgICAgICAnaWYoJywgdmFyaWFibGUsICcpeycsXG4gICAgICAgICAgICBoYXNQcmltaXRpdmUgPyBEUkFXX1NUQVRFLnByaW1pdGl2ZSArICcucG9wKCk7JyA6ICcnLFxuICAgICAgICAgICAgaGFzQ291bnQgPyBEUkFXX1NUQVRFLmNvdW50ICsgJy5wb3AoKTsnIDogJycsXG4gICAgICAgICAgICBoYXNPZmZzZXQgPyBEUkFXX1NUQVRFLm9mZnNldCArICcucG9wKCk7JyA6ICcnLFxuICAgICAgICAgICAgJ30nKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICBjaGVjay5yYWlzZSgndW5zdXBwb3J0ZWQgZHluYW1pYyBvcHRpb246ICcgKyBwYXJhbSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGR5bmFtaWMgdW5pZm9ybXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgT2JqZWN0LmtleXMoZHluYW1pY1VuaWZvcm1zKS5mb3JFYWNoKGZ1bmN0aW9uICh1bmlmb3JtKSB7XG4gICAgICB2YXIgU1RBQ0sgPSBsaW5rKHVuaWZvcm1TdGF0ZS5kZWYodW5pZm9ybSkpXG4gICAgICB2YXIgVkFMVUUgPSBkeW4oZHluYW1pY1VuaWZvcm1zW3VuaWZvcm1dKVxuICAgICAgZHluYW1pY0VudHJ5KFNUQUNLLCAnLnB1c2goJywgVkFMVUUsICcpOycpXG4gICAgICBkeW5hbWljRXhpdChTVEFDSywgJy5wb3AoKTsnKVxuICAgIH0pXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gZHluYW1pYyBhdHRyaWJ1dGVzXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIE9iamVjdC5rZXlzKGR5bmFtaWNBdHRyaWJ1dGVzKS5mb3JFYWNoKGZ1bmN0aW9uIChhdHRyaWJ1dGUpIHtcbiAgICAgIHZhciBBVFRSSUJVVEUgPSBsaW5rKGF0dHJpYnV0ZVN0YXRlLmRlZihhdHRyaWJ1dGUpKVxuICAgICAgdmFyIFZBTFVFID0gZHluKGR5bmFtaWNBdHRyaWJ1dGVzW2F0dHJpYnV0ZV0pXG4gICAgICBkeW5hbWljRW50cnkoQVRUUklCVVRFLCAnLnB1c2hEeW4oJywgVkFMVUUsICcpOycpXG4gICAgICBkeW5hbWljRXhpdChBVFRSSUJVVEUsICcucG9wKCk7JylcbiAgICB9KVxuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIFNDT1BFIFBST0NFRFVSRVxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICB2YXIgc2NvcGUgPSBwcm9jKCdzY29wZScpXG4gICAgdmFyIFNDT1BFX0FSR1MgPSBzY29wZS5hcmcoKVxuICAgIHZhciBTQ09QRV9CT0RZID0gc2NvcGUuYXJnKClcbiAgICBzY29wZShlbnRyeSlcbiAgICBpZiAoaGFzRHluYW1pYykge1xuICAgICAgc2NvcGUoXG4gICAgICAgIERZTkFSR1MsICc9JywgU0NPUEVfQVJHUywgJzsnLFxuICAgICAgICBkeW5hbWljRW50cnkpXG4gICAgfVxuICAgIHNjb3BlKFxuICAgICAgU0NPUEVfQk9EWSwgJygpOycsXG4gICAgICBoYXNEeW5hbWljID8gZHluYW1pY0V4aXQgOiAnJyxcbiAgICAgIGV4aXQpXG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gRFJBVyBQUk9DRURVUkVcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgdmFyIGRyYXcgPSBwcm9jKCdkcmF3JylcbiAgICBkcmF3KGVudHJ5KVxuICAgIGlmIChoYXNEeW5hbWljKSB7XG4gICAgICBkcmF3KFxuICAgICAgICBEWU5BUkdTLCAnPScsIGRyYXcuYXJnKCksICc7JyxcbiAgICAgICAgZHluYW1pY0VudHJ5KVxuICAgIH1cbiAgICB2YXIgQ1VSUkVOVF9TSEFERVIgPSBzdGFja1RvcChQUk9HUkFNX1NUQVRFKVxuICAgIGRyYXcoXG4gICAgICBHTF9QT0xMLCAnKCk7JyxcbiAgICAgICdpZignLCBDVVJSRU5UX1NIQURFUiwgJyknLFxuICAgICAgQ1VSUkVOVF9TSEFERVIsICcuZHJhdygnLCBoYXNEeW5hbWljID8gRFlOQVJHUyA6ICcnLCAnKTsnLFxuICAgICAgaGFzRHluYW1pYyA/IGR5bmFtaWNFeGl0IDogJycsXG4gICAgICBleGl0KVxuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIEJBVENIIERSQVdcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgdmFyIGJhdGNoID0gcHJvYygnYmF0Y2gnKVxuICAgIGJhdGNoKGVudHJ5KVxuICAgIHZhciBDVVJfU0hBREVSID0gYmF0Y2guZGVmKHN0YWNrVG9wKFBST0dSQU1fU1RBVEUpKVxuICAgIHZhciBFWEVDX0JBVENIID0gbGluayhmdW5jdGlvbiAocHJvZ3JhbSwgY291bnQsIGFyZ3MpIHtcbiAgICAgIHZhciBwcm9jID0gcHJvZ3JhbS5iYXRjaENhY2hlW2NhbGxJZF1cbiAgICAgIGlmICghcHJvYykge1xuICAgICAgICBwcm9jID0gcHJvZ3JhbS5iYXRjaENhY2hlW2NhbGxJZF0gPSBjb21waWxlQmF0Y2goXG4gICAgICAgICAgcHJvZ3JhbSwgZHluYW1pY09wdGlvbnMsIGR5bmFtaWNVbmlmb3JtcywgZHluYW1pY0F0dHJpYnV0ZXMsXG4gICAgICAgICAgc3RhdGljT3B0aW9ucylcbiAgICAgIH1cbiAgICAgIHJldHVybiBwcm9jKGNvdW50LCBhcmdzKVxuICAgIH0pXG4gICAgYmF0Y2goXG4gICAgICAnaWYoJywgQ1VSX1NIQURFUiwgJyl7JyxcbiAgICAgIEdMX1BPTEwsICcoKTsnLFxuICAgICAgRVhFQ19CQVRDSCwgJygnLFxuICAgICAgQ1VSX1NIQURFUiwgJywnLFxuICAgICAgYmF0Y2guYXJnKCksICcsJyxcbiAgICAgIGJhdGNoLmFyZygpLCAnKTsnKVxuICAgIC8vIFNldCBkaXJ0eSBvbiBhbGwgZHluYW1pYyBmbGFnc1xuICAgIE9iamVjdC5rZXlzKGR5bmFtaWNPcHRpb25zKS5mb3JFYWNoKGZ1bmN0aW9uIChvcHRpb24pIHtcbiAgICAgIHZhciBTVEFURSA9IENPTlRFWFRfU1RBVEVbb3B0aW9uXVxuICAgICAgaWYgKFNUQVRFKSB7XG4gICAgICAgIGJhdGNoKFNUQVRFLCAnLnNldERpcnR5KCk7JylcbiAgICAgIH1cbiAgICB9KVxuICAgIGJhdGNoKCd9JywgZXhpdClcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBldmFsIGFuZCBiaW5kXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHJldHVybiBlbnYuY29tcGlsZSgpXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGRyYXc6IGNvbXBpbGVTaGFkZXJEcmF3LFxuICAgIGNvbW1hbmQ6IGNvbXBpbGVDb21tYW5kXG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgXCJbb2JqZWN0IEludDhBcnJheV1cIjogNTEyMFxuLCBcIltvYmplY3QgSW50MTZBcnJheV1cIjogNTEyMlxuLCBcIltvYmplY3QgSW50MzJBcnJheV1cIjogNTEyNFxuLCBcIltvYmplY3QgVWludDhBcnJheV1cIjogNTEyMVxuLCBcIltvYmplY3QgVWludDhDbGFtcGVkQXJyYXldXCI6IDUxMjFcbiwgXCJbb2JqZWN0IFVpbnQxNkFycmF5XVwiOiA1MTIzXG4sIFwiW29iamVjdCBVaW50MzJBcnJheV1cIjogNTEyNVxuLCBcIltvYmplY3QgRmxvYXQzMkFycmF5XVwiOiA1MTI2XG4sIFwiW29iamVjdCBGbG9hdDY0QXJyYXldXCI6IDUxMjFcbiwgXCJbb2JqZWN0IEFycmF5QnVmZmVyXVwiOiA1MTIxXG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gIFwiaW50OFwiOiA1MTIwXG4sIFwiaW50MTZcIjogNTEyMlxuLCBcImludDMyXCI6IDUxMjRcbiwgXCJ1aW50OFwiOiA1MTIxXG4sIFwidWludDE2XCI6IDUxMjNcbiwgXCJ1aW50MzJcIjogNTEyNVxuLCBcImZsb2F0XCI6IDUxMjZcbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgXCJwb2ludHNcIjogMCxcbiAgXCJsaW5lc1wiOiAxLFxuICBcImxpbmUgbG9vcFwiOiAyLFxuICBcImxpbmUgc3RyaXBcIjogMyxcbiAgXCJ0cmlhbmdsZXNcIjogNCxcbiAgXCJ0cmlhbmdsZSBzdHJpcFwiOiA1LFxuICBcInRyaWFuZ2xlIGZhblwiOiA2XG59XG4iLCIvLyBDb250ZXh0IGFuZCBjYW52YXMgY3JlYXRpb24gaGVscGVyIGZ1bmN0aW9uc1xuLypnbG9iYWxzIEhUTUxFbGVtZW50LFdlYkdMUmVuZGVyaW5nQ29udGV4dCovXG5cbnZhciBjaGVjayA9IHJlcXVpcmUoJy4vY2hlY2snKVxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vZXh0ZW5kJylcblxuZnVuY3Rpb24gY3JlYXRlQ2FudmFzIChlbGVtZW50LCBvcHRpb25zKSB7XG4gIHZhciBjYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKVxuICB2YXIgYXJncyA9IGdldENvbnRleHQoY2FudmFzLCBvcHRpb25zKVxuXG4gIGV4dGVuZChjYW52YXMuc3R5bGUsIHtcbiAgICBib3JkZXI6IDAsXG4gICAgbWFyZ2luOiAwLFxuICAgIHBhZGRpbmc6IDAsXG4gICAgdG9wOiAwLFxuICAgIGxlZnQ6IDBcbiAgfSlcbiAgZWxlbWVudC5hcHBlbmRDaGlsZChjYW52YXMpXG5cbiAgaWYgKGVsZW1lbnQgPT09IGRvY3VtZW50LmJvZHkpIHtcbiAgICBjYW52YXMuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnXG4gICAgZXh0ZW5kKGVsZW1lbnQuc3R5bGUsIHtcbiAgICAgIG1hcmdpbjogMCxcbiAgICAgIHBhZGRpbmc6IDBcbiAgICB9KVxuICB9XG5cbiAgdmFyIHNjYWxlID0gK2FyZ3Mub3B0aW9ucy5waXhlbFJhdGlvXG4gIGZ1bmN0aW9uIHJlc2l6ZSAoKSB7XG4gICAgdmFyIHcgPSB3aW5kb3cuaW5uZXJXaWR0aFxuICAgIHZhciBoID0gd2luZG93LmlubmVySGVpZ2h0XG4gICAgaWYgKGVsZW1lbnQgIT09IGRvY3VtZW50LmJvZHkpIHtcbiAgICAgIHZhciBib3VuZHMgPSBlbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpXG4gICAgICB3ID0gYm91bmRzLnJpZ2h0IC0gYm91bmRzLmxlZnRcbiAgICAgIGggPSBib3VuZHMudG9wIC0gYm91bmRzLmJvdHRvbVxuICAgIH1cbiAgICBjYW52YXMud2lkdGggPSBzY2FsZSAqIHdcbiAgICBjYW52YXMuaGVpZ2h0ID0gc2NhbGUgKiBoXG4gICAgZXh0ZW5kKGNhbnZhcy5zdHlsZSwge1xuICAgICAgd2lkdGg6IHcgKyAncHgnLFxuICAgICAgaGVpZ2h0OiBoICsgJ3B4J1xuICAgIH0pXG4gIH1cblxuICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgcmVzaXplLCBmYWxzZSlcblxuICB2YXIgcHJldkRlc3Ryb3kgPSBhcmdzLm9wdGlvbnMub25EZXN0cm95XG4gIGFyZ3Mub3B0aW9ucyA9IGV4dGVuZChleHRlbmQoe30sIGFyZ3Mub3B0aW9ucyksIHtcbiAgICBvbkRlc3Ryb3k6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdyZXNpemUnLCByZXNpemUpXG4gICAgICBlbGVtZW50LnJlbW92ZUNoaWxkKGNhbnZhcylcbiAgICAgIHByZXZEZXN0cm95ICYmIHByZXZEZXN0cm95KClcbiAgICB9XG4gIH0pXG5cbiAgcmVzaXplKClcblxuICByZXR1cm4gYXJnc1xufVxuXG5mdW5jdGlvbiBnZXRDb250ZXh0IChjYW52YXMsIG9wdGlvbnMpIHtcbiAgdmFyIGdsT3B0aW9ucyA9IG9wdGlvbnMuZ2xPcHRpb25zIHx8IHt9XG5cbiAgZnVuY3Rpb24gZ2V0IChuYW1lKSB7XG4gICAgdHJ5IHtcbiAgICAgIHJldHVybiBjYW52YXMuZ2V0Q29udGV4dChuYW1lLCBnbE9wdGlvbnMpXG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG4gIH1cblxuICB2YXIgZ2wgPSBnZXQoJ3dlYmdsJykgfHxcbiAgICAgICAgICAgZ2V0KCdleHBlcmltZW50YWwtd2ViZ2wnKSB8fFxuICAgICAgICAgICBnZXQoJ3dlYmdsLWV4cGVyaW1lbnRhbCcpXG5cbiAgY2hlY2soZ2wsICd3ZWJnbCBub3Qgc3VwcG9ydGVkJylcblxuICByZXR1cm4ge1xuICAgIGdsOiBnbCxcbiAgICBvcHRpb25zOiBleHRlbmQoe1xuICAgICAgcGl4ZWxSYXRpbzogd2luZG93LmRldmljZVBpeGVsUmF0aW9cbiAgICB9LCBvcHRpb25zKVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcGFyc2VBcmdzIChhcmdzKSB7XG4gIGlmICh0eXBlb2YgZG9jdW1lbnQgPT09ICd1bmRlZmluZWQnIHx8XG4gICAgICB0eXBlb2YgSFRNTEVsZW1lbnQgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGdsOiBhcmdzWzBdLFxuICAgICAgb3B0aW9uczogYXJnc1sxXSB8fCB7fVxuICAgIH1cbiAgfVxuXG4gIHZhciBlbGVtZW50ID0gZG9jdW1lbnQuYm9keVxuICB2YXIgb3B0aW9ucyA9IGFyZ3NbMV0gfHwge31cblxuICBpZiAodHlwZW9mIGFyZ3NbMF0gPT09ICdzdHJpbmcnKSB7XG4gICAgZWxlbWVudCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYXJnc1swXSkgfHwgZG9jdW1lbnQuYm9keVxuICB9IGVsc2UgaWYgKHR5cGVvZiBhcmdzWzBdID09PSAnb2JqZWN0Jykge1xuICAgIGlmIChhcmdzWzBdIGluc3RhbmNlb2YgSFRNTEVsZW1lbnQpIHtcbiAgICAgIGVsZW1lbnQgPSBhcmdzWzBdXG4gICAgfSBlbHNlIGlmIChhcmdzWzBdIGluc3RhbmNlb2YgV2ViR0xSZW5kZXJpbmdDb250ZXh0KSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBnbDogYXJnc1swXSxcbiAgICAgICAgb3B0aW9uczogZXh0ZW5kKHtcbiAgICAgICAgICBwaXhlbFJhdGlvOiAxXG4gICAgICAgIH0sIG9wdGlvbnMpXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIG9wdGlvbnMgPSBhcmdzWzBdXG4gICAgfVxuICB9XG5cbiAgaWYgKGVsZW1lbnQubm9kZU5hbWUgJiYgZWxlbWVudC5ub2RlTmFtZS50b1VwcGVyQ2FzZSgpID09PSAnQ0FOVkFTJykge1xuICAgIHJldHVybiBnZXRDb250ZXh0KGVsZW1lbnQsIG9wdGlvbnMpXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGNyZWF0ZUNhbnZhcyhlbGVtZW50LCBvcHRpb25zKVxuICB9XG59XG4iLCJ2YXIgR0xfVFJJQU5HTEVTID0gNFxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBEcmF3U3RhdGUgKGdsKSB7XG4gIHZhciBwcmltaXRpdmUgPSBbIEdMX1RSSUFOR0xFUyBdXG4gIHZhciBjb3VudCA9IFsgMCBdXG4gIHZhciBvZmZzZXQgPSBbIDAgXVxuICB2YXIgaW5zdGFuY2VzID0gWyAwIF1cblxuICByZXR1cm4ge1xuICAgIHByaW1pdGl2ZTogcHJpbWl0aXZlLFxuICAgIGNvdW50OiBjb3VudCxcbiAgICBvZmZzZXQ6IG9mZnNldCxcbiAgICBpbnN0YW5jZXM6IGluc3RhbmNlc1xuICB9XG59XG4iLCJ2YXIgVkFSSUFCTEVfQ09VTlRFUiA9IDBcblxuZnVuY3Rpb24gRHluYW1pY1ZhcmlhYmxlIChpc0Z1bmMsIGRhdGEpIHtcbiAgdGhpcy5pZCA9IChWQVJJQUJMRV9DT1VOVEVSKyspXG4gIHRoaXMuZnVuYyA9IGlzRnVuY1xuICB0aGlzLmRhdGEgPSBkYXRhXG59XG5cbmZ1bmN0aW9uIGRlZmluZUR5bmFtaWMgKGRhdGEsIHBhdGgpIHtcbiAgc3dpdGNoICh0eXBlb2YgZGF0YSkge1xuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgIGNhc2UgJ251bWJlcic6XG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgIHJldHVybiBuZXcgRHluYW1pY1ZhcmlhYmxlKGZhbHNlLCBkYXRhKVxuICAgIGNhc2UgJ2Z1bmN0aW9uJzpcbiAgICAgIHJldHVybiBuZXcgRHluYW1pY1ZhcmlhYmxlKHRydWUsIGRhdGEpXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBkZWZpbmVEeW5hbWljXG4gIH1cbn1cblxuZnVuY3Rpb24gaXNEeW5hbWljICh4KSB7XG4gIHJldHVybiAodHlwZW9mIHggPT09ICdmdW5jdGlvbicgJiYgIXguX3JlZ2xUeXBlKSB8fFxuICAgICAgICAgeCBpbnN0YW5jZW9mIER5bmFtaWNWYXJpYWJsZVxufVxuXG5mdW5jdGlvbiB1bmJveCAoeCwgcGF0aCkge1xuICBpZiAoeCBpbnN0YW5jZW9mIER5bmFtaWNWYXJpYWJsZSkge1xuICAgIHJldHVybiB4XG4gIH0gZWxzZSBpZiAodHlwZW9mIHggPT09ICdmdW5jdGlvbicgJiZcbiAgICAgICAgICAgICB4ICE9PSBkZWZpbmVEeW5hbWljKSB7XG4gICAgcmV0dXJuIG5ldyBEeW5hbWljVmFyaWFibGUodHJ1ZSwgeClcbiAgfVxuICByZXR1cm4gbmV3IER5bmFtaWNWYXJpYWJsZShmYWxzZSwgcGF0aClcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGRlZmluZTogZGVmaW5lRHluYW1pYyxcbiAgaXNEeW5hbWljOiBpc0R5bmFtaWMsXG4gIHVuYm94OiB1bmJveFxufVxuIiwidmFyIGNoZWNrID0gcmVxdWlyZSgnLi9jaGVjaycpXG52YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi9pcy10eXBlZC1hcnJheScpXG52YXIgaXNOREFycmF5TGlrZSA9IHJlcXVpcmUoJy4vaXMtbmRhcnJheScpXG52YXIgcHJpbVR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvcHJpbWl0aXZlcy5qc29uJylcblxudmFyIEdMX1BPSU5UUyA9IDBcbnZhciBHTF9MSU5FUyA9IDFcbnZhciBHTF9UUklBTkdMRVMgPSA0XG5cbnZhciBHTF9CWVRFID0gNTEyMFxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSA1MTIxXG52YXIgR0xfU0hPUlQgPSA1MTIyXG52YXIgR0xfVU5TSUdORURfU0hPUlQgPSA1MTIzXG52YXIgR0xfSU5UID0gNTEyNFxudmFyIEdMX1VOU0lHTkVEX0lOVCA9IDUxMjVcblxudmFyIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSID0gMzQ5NjNcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwRWxlbWVudHNTdGF0ZSAoZ2wsIGV4dGVuc2lvbnMsIGJ1ZmZlclN0YXRlKSB7XG4gIHZhciBlbGVtZW50cyA9IFsgbnVsbCBdXG5cbiAgZnVuY3Rpb24gUkVHTEVsZW1lbnRCdWZmZXIgKCkge1xuICAgIHRoaXMuYnVmZmVyID0gbnVsbFxuICAgIHRoaXMucHJpbVR5cGUgPSBHTF9UUklBTkdMRVNcbiAgICB0aGlzLnZlcnRDb3VudCA9IDBcbiAgICB0aGlzLnR5cGUgPSAwXG4gIH1cblxuICBSRUdMRWxlbWVudEJ1ZmZlci5wcm90b3R5cGUuYmluZCA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmJ1ZmZlci5iaW5kKClcbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZUVsZW1lbnRzIChvcHRpb25zKSB7XG4gICAgdmFyIGVsZW1lbnRzID0gbmV3IFJFR0xFbGVtZW50QnVmZmVyKClcbiAgICB2YXIgYnVmZmVyID0gYnVmZmVyU3RhdGUuY3JlYXRlKG51bGwsIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSLCB0cnVlKVxuICAgIGVsZW1lbnRzLmJ1ZmZlciA9IGJ1ZmZlci5fYnVmZmVyXG5cbiAgICBmdW5jdGlvbiByZWdsRWxlbWVudHMgKGlucHV0KSB7XG4gICAgICB2YXIgb3B0aW9ucyA9IGlucHV0XG4gICAgICB2YXIgZXh0MzJiaXQgPSBleHRlbnNpb25zLm9lc19lbGVtZW50X2luZGV4X3VpbnRcblxuICAgICAgLy8gVXBsb2FkIGRhdGEgdG8gdmVydGV4IGJ1ZmZlclxuICAgICAgaWYgKCFvcHRpb25zKSB7XG4gICAgICAgIGJ1ZmZlcigpXG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBvcHRpb25zID09PSAnbnVtYmVyJykge1xuICAgICAgICBidWZmZXIob3B0aW9ucylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBkYXRhID0gbnVsbFxuICAgICAgICB2YXIgdXNhZ2UgPSAnc3RhdGljJ1xuICAgICAgICB2YXIgYnl0ZUxlbmd0aCA9IDBcbiAgICAgICAgaWYgKFxuICAgICAgICAgIEFycmF5LmlzQXJyYXkob3B0aW9ucykgfHxcbiAgICAgICAgICBpc1R5cGVkQXJyYXkob3B0aW9ucykgfHxcbiAgICAgICAgICBpc05EQXJyYXlMaWtlKG9wdGlvbnMpKSB7XG4gICAgICAgICAgZGF0YSA9IG9wdGlvbnNcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjaGVjay50eXBlKG9wdGlvbnMsICdvYmplY3QnLCAnaW52YWxpZCBhcmd1bWVudHMgZm9yIGVsZW1lbnRzJylcbiAgICAgICAgICBpZiAoJ2RhdGEnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGRhdGEgPSBvcHRpb25zLmRhdGFcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCd1c2FnZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgdXNhZ2UgPSBvcHRpb25zLnVzYWdlXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgnbGVuZ3RoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBieXRlTGVuZ3RoID0gb3B0aW9ucy5sZW5ndGhcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YSkgfHxcbiAgICAgICAgICAgIChpc05EQXJyYXlMaWtlKGRhdGEpICYmIGRhdGEuZHR5cGUgPT09ICdhcnJheScpIHx8XG4gICAgICAgICAgICAndHlwZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGJ1ZmZlcih7XG4gICAgICAgICAgICB0eXBlOiBvcHRpb25zLnR5cGUgfHxcbiAgICAgICAgICAgICAgKGV4dDMyYml0XG4gICAgICAgICAgICAgICAgPyAndWludDMyJ1xuICAgICAgICAgICAgICAgIDogJ3VpbnQxNicpLFxuICAgICAgICAgICAgdXNhZ2U6IHVzYWdlLFxuICAgICAgICAgICAgZGF0YTogZGF0YSxcbiAgICAgICAgICAgIGxlbmd0aDogYnl0ZUxlbmd0aFxuICAgICAgICAgIH0pXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYnVmZmVyKHtcbiAgICAgICAgICAgIHVzYWdlOiB1c2FnZSxcbiAgICAgICAgICAgIGRhdGE6IGRhdGEsXG4gICAgICAgICAgICBsZW5ndGg6IGJ5dGVMZW5ndGhcbiAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KGRhdGEpIHx8IGlzVHlwZWRBcnJheShkYXRhKSkge1xuICAgICAgICAgIGJ1ZmZlci5kaW1lbnNpb24gPSAzXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gdHJ5IHRvIGd1ZXNzIGRlZmF1bHQgcHJpbWl0aXZlIHR5cGUgYW5kIGFyZ3VtZW50c1xuICAgICAgdmFyIHZlcnRDb3VudCA9IGVsZW1lbnRzLmJ1ZmZlci5ieXRlTGVuZ3RoXG4gICAgICB2YXIgdHlwZSA9IDBcbiAgICAgIHN3aXRjaCAoZWxlbWVudHMuYnVmZmVyLmR0eXBlKSB7XG4gICAgICAgIGNhc2UgR0xfVU5TSUdORURfQllURTpcbiAgICAgICAgY2FzZSBHTF9CWVRFOlxuICAgICAgICAgIHR5cGUgPSBHTF9VTlNJR05FRF9CWVRFXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUOlxuICAgICAgICBjYXNlIEdMX1NIT1JUOlxuICAgICAgICAgIHR5cGUgPSBHTF9VTlNJR05FRF9TSE9SVFxuICAgICAgICAgIHZlcnRDb3VudCA+Pj0gMVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9JTlQ6XG4gICAgICAgIGNhc2UgR0xfSU5UOlxuICAgICAgICAgIGNoZWNrKGV4dDMyYml0LCAnMzIgYml0IGVsZW1lbnQgYnVmZmVycyBub3Qgc3VwcG9ydGVkJylcbiAgICAgICAgICB0eXBlID0gR0xfVU5TSUdORURfSU5UXG4gICAgICAgICAgdmVydENvdW50ID4+PSAyXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIGNoZWNrLnJhaXNlKCdpbnZhbGlkIGVsZW1lbnQgYnVmZmVyIHR5cGUnKVxuICAgICAgfVxuXG4gICAgICAvLyB0cnkgdG8gZ3Vlc3MgcHJpbWl0aXZlIHR5cGUgZnJvbSBjZWxsIGRpbWVuc2lvblxuICAgICAgdmFyIHByaW1UeXBlID0gR0xfVFJJQU5HTEVTXG4gICAgICB2YXIgZGltZW5zaW9uID0gZWxlbWVudHMuYnVmZmVyLmRpbWVuc2lvblxuICAgICAgaWYgKGRpbWVuc2lvbiA9PT0gMSkgcHJpbVR5cGUgPSBHTF9QT0lOVFNcbiAgICAgIGlmIChkaW1lbnNpb24gPT09IDIpIHByaW1UeXBlID0gR0xfTElORVNcbiAgICAgIGlmIChkaW1lbnNpb24gPT09IDMpIHByaW1UeXBlID0gR0xfVFJJQU5HTEVTXG5cbiAgICAgIC8vIGlmIG1hbnVhbCBvdmVycmlkZSBwcmVzZW50LCB1c2UgdGhhdFxuICAgICAgaWYgKHR5cGVvZiBvcHRpb25zID09PSAnb2JqZWN0Jykge1xuICAgICAgICBpZiAoJ3ByaW1pdGl2ZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHZhciBwcmltaXRpdmUgPSBvcHRpb25zLnByaW1pdGl2ZVxuICAgICAgICAgIGNoZWNrLnBhcmFtZXRlcihwcmltaXRpdmUsIHByaW1UeXBlcylcbiAgICAgICAgICBwcmltVHlwZSA9IHByaW1UeXBlc1twcmltaXRpdmVdXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ2NvdW50JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgdmVydENvdW50ID0gb3B0aW9ucy52ZXJ0Q291bnQgfCAwXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gdXBkYXRlIHByb3BlcnRpZXMgZm9yIGVsZW1lbnQgYnVmZmVyXG4gICAgICBlbGVtZW50cy5wcmltVHlwZSA9IHByaW1UeXBlXG4gICAgICBlbGVtZW50cy52ZXJ0Q291bnQgPSB2ZXJ0Q291bnRcbiAgICAgIGVsZW1lbnRzLnR5cGUgPSB0eXBlXG5cbiAgICAgIHJldHVybiByZWdsRWxlbWVudHNcbiAgICB9XG5cbiAgICByZWdsRWxlbWVudHMob3B0aW9ucylcblxuICAgIHJlZ2xFbGVtZW50cy5fcmVnbFR5cGUgPSAnZWxlbWVudHMnXG4gICAgcmVnbEVsZW1lbnRzLl9lbGVtZW50cyA9IGVsZW1lbnRzXG4gICAgcmVnbEVsZW1lbnRzLmRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7XG4gICAgICBjaGVjayhlbGVtZW50cy5idWZmZXIgIT09IG51bGwsICdtdXN0IG5vdCBkb3VibGUgZGVzdHJveSBlbGVtZW50cycpXG4gICAgICBidWZmZXIuZGVzdHJveSgpXG4gICAgICBlbGVtZW50cy5idWZmZXIgPSBudWxsXG4gICAgfVxuXG4gICAgcmV0dXJuIHJlZ2xFbGVtZW50c1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjcmVhdGU6IGNyZWF0ZUVsZW1lbnRzLFxuICAgIGVsZW1lbnRzOiBlbGVtZW50cyxcbiAgICBnZXRFbGVtZW50czogZnVuY3Rpb24gKGVsZW1lbnRzKSB7XG4gICAgICBpZiAoZWxlbWVudHMgJiYgZWxlbWVudHMuX2VsZW1lbnRzIGluc3RhbmNlb2YgUkVHTEVsZW1lbnRCdWZmZXIpIHtcbiAgICAgICAgcmV0dXJuIGVsZW1lbnRzLl9lbGVtZW50c1xuICAgICAgfVxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGJhc2UsIG9wdHMpIHtcbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhvcHRzKVxuICBmb3IgKHZhciBpID0gMDsgaSA8IGtleXMubGVuZ3RoOyArK2kpIHtcbiAgICBiYXNlW2tleXNbaV1dID0gb3B0c1trZXlzW2ldXVxuICB9XG4gIHJldHVybiBiYXNlXG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNyZWF0ZUV4dGVuc2lvbkNhY2hlIChnbCkge1xuICB2YXIgZXh0ZW5zaW9ucyA9IHt9XG5cbiAgZnVuY3Rpb24gcmVmcmVzaEV4dGVuc2lvbnMgKCkge1xuICAgIFtcbiAgICAgICdvZXNfdGV4dHVyZV9mbG9hdCcsXG4gICAgICAnb2VzX3RleHR1cmVfZmxvYXRfbGluZWFyJyxcbiAgICAgICdvZXNfdGV4dHVyZV9oYWxmX2Zsb2F0JyxcbiAgICAgICdvZXNfdGV4dHVyZV9oYWxmX2Zsb2F0X2xpbmVhcicsXG4gICAgICAnb2VzX3N0YW5kYXJkX2Rlcml2YXRpdmVzJyxcbiAgICAgICdvZXNfZWxlbWVudF9pbmRleF91aW50JyxcbiAgICAgICdvZXNfZmJvX3JlbmRlcl9taXBtYXAnLFxuXG4gICAgICAnd2ViZ2xfZGVwdGhfdGV4dHVyZScsXG4gICAgICAnd2ViZ2xfZHJhd19idWZmZXJzJyxcbiAgICAgICd3ZWJnbF9jb2xvcl9idWZmZXJfZmxvYXQnLFxuXG4gICAgICAnZXh0X3RleHR1cmVfZmlsdGVyX2FuaXNvdHJvcGljJyxcbiAgICAgICdleHRfZnJhZ19kZXB0aCcsXG4gICAgICAnZXh0X2JsZW5kX21pbm1heCcsXG4gICAgICAnZXh0X3NoYWRlcl90ZXh0dXJlX2xvZCcsXG4gICAgICAnZXh0X2NvbG9yX2J1ZmZlcl9oYWxmX2Zsb2F0JyxcbiAgICAgICdleHRfc3JnYicsXG5cbiAgICAgICdhbmdsZV9pbnN0YW5jZWRfYXJyYXlzJyxcblxuICAgICAgJ3dlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9zM3RjJyxcbiAgICAgICd3ZWJnbF9jb21wcmVzc2VkX3RleHR1cmVfYXRjJyxcbiAgICAgICd3ZWJnbF9jb21wcmVzc2VkX3RleHR1cmVfcHZydGMnLFxuICAgICAgJ3dlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9ldGMxJ1xuICAgIF0uZm9yRWFjaChmdW5jdGlvbiAoZXh0KSB7XG4gICAgICB0cnkge1xuICAgICAgICBleHRlbnNpb25zW2V4dF0gPSBnbC5nZXRFeHRlbnNpb24oZXh0KVxuICAgICAgfSBjYXRjaCAoZSkge31cbiAgICB9KVxuICB9XG5cbiAgcmVmcmVzaEV4dGVuc2lvbnMoKVxuXG4gIHJldHVybiB7XG4gICAgZXh0ZW5zaW9uczogZXh0ZW5zaW9ucyxcbiAgICByZWZyZXNoOiByZWZyZXNoRXh0ZW5zaW9uc1xuICB9XG59XG4iLCJ2YXIgY2hlY2sgPSByZXF1aXJlKCcuL2NoZWNrJylcbnZhciB2YWx1ZXMgPSByZXF1aXJlKCcuL3ZhbHVlcycpXG52YXIgZXh0ZW5kID0gcmVxdWlyZSgnLi9leHRlbmQnKVxuXG4vLyBXZSBzdG9yZSB0aGVzZSBjb25zdGFudHMgc28gdGhhdCB0aGUgbWluaWZpZXIgY2FuIGlubGluZSB0aGVtXG52YXIgR0xfRlJBTUVCVUZGRVIgPSAweDhENDBcbnZhciBHTF9SRU5ERVJCVUZGRVIgPSAweDhENDFcblxudmFyIEdMX1RFWFRVUkVfMkQgPSAweDBERTFcbnZhciBHTF9URVhUVVJFX0NVQkVfTUFQID0gMHg4NTEzXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YID0gMHg4NTE1XG5cbnZhciBHTF9DT0xPUl9BVFRBQ0hNRU5UMCA9IDB4OENFMFxudmFyIEdMX0RFUFRIX0FUVEFDSE1FTlQgPSAweDhEMDBcbnZhciBHTF9TVEVOQ0lMX0FUVEFDSE1FTlQgPSAweDhEMjBcbnZhciBHTF9ERVBUSF9TVEVOQ0lMX0FUVEFDSE1FTlQgPSAweDgyMUFcblxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSAweDE0MDFcbnZhciBHTF9GTE9BVCA9IDB4MTQwNlxuXG52YXIgR0xfSEFMRl9GTE9BVF9PRVMgPSAweDhENjFcblxudmFyIEdMX0FMUEhBID0gMHgxOTA2XG52YXIgR0xfTFVNSU5BTkNFID0gMHgxOTA5XG52YXIgR0xfTFVNSU5BTkNFX0FMUEhBID0gMHgxOTBBXG52YXIgR0xfUkdCID0gMHgxOTA3XG52YXIgR0xfUkdCQSA9IDB4MTkwOFxuXG52YXIgR0xfUkdCQTQgPSAweDgwNTZcbnZhciBHTF9SR0I1X0ExID0gMHg4MDU3XG52YXIgR0xfUkdCNTY1ID0gMHg4RDYyXG52YXIgR0xfREVQVEhfQ09NUE9ORU5UMTYgPSAweDgxQTVcbnZhciBHTF9TVEVOQ0lMX0lOREVYOCA9IDB4OEQ0OFxuXG52YXIgR0xfREVQVEhfQ09NUE9ORU5UID0gMHgxOTAyXG52YXIgR0xfREVQVEhfU1RFTkNJTCA9IDB4ODRGOVxuXG52YXIgR0xfU1JHQjhfQUxQSEE4X0VYVCA9IDB4OEM0M1xuXG52YXIgR0xfUkdCQTMyRl9FWFQgPSAweDg4MTRcblxudmFyIEdMX1JHQkExNkZfRVhUID0gMHg4ODFBXG52YXIgR0xfUkdCMTZGX0VYVCA9IDB4ODgxQlxuXG52YXIgR0xfRlJBTUVCVUZGRVJfQ09NUExFVEUgPSAweDhDRDVcbnZhciBHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX0FUVEFDSE1FTlQgPSAweDhDRDZcbnZhciBHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX01JU1NJTkdfQVRUQUNITUVOVCA9IDB4OENEN1xudmFyIEdMX0ZSQU1FQlVGRkVSX0lOQ09NUExFVEVfRElNRU5TSU9OUyA9IDB4OENEOVxudmFyIEdMX0ZSQU1FQlVGRkVSX1VOU1VQUE9SVEVEID0gMHg4Q0REXG5cbnZhciBHTF9CQUNLID0gMTAyOVxuXG52YXIgQkFDS19CVUZGRVIgPSBbR0xfQkFDS11cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwRkJPU3RhdGUgKFxuICBnbCxcbiAgZXh0ZW5zaW9ucyxcbiAgbGltaXRzLFxuICB0ZXh0dXJlU3RhdGUsXG4gIHJlbmRlcmJ1ZmZlclN0YXRlKSB7XG4gIHZhciBzdGF0dXNDb2RlID0ge31cbiAgc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9DT01QTEVURV0gPSAnY29tcGxldGUnXG4gIHN0YXR1c0NvZGVbR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9BVFRBQ0hNRU5UXSA9ICdpbmNvbXBsZXRlIGF0dGFjaG1lbnQnXG4gIHN0YXR1c0NvZGVbR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9ESU1FTlNJT05TXSA9ICdpbmNvbXBsZXRlIGRpbWVuc2lvbnMnXG4gIHN0YXR1c0NvZGVbR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9NSVNTSU5HX0FUVEFDSE1FTlRdID0gJ2luY29tcGxldGUsIG1pc3NpbmcgYXR0YWNobWVudCdcbiAgc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9VTlNVUFBPUlRFRF0gPSAndW5zdXBwb3J0ZWQnXG5cbiAgdmFyIGNvbG9yVGV4dHVyZUZvcm1hdHMgPSB7XG4gICAgJ3JnYmEnOiBHTF9SR0JBXG4gIH1cblxuICB2YXIgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzID0ge1xuICAgICdyZ2JhNCc6IEdMX1JHQkE0LFxuICAgICdyZ2I1NjUnOiBHTF9SR0I1NjUsXG4gICAgJ3JnYjUgYTEnOiBHTF9SR0I1X0ExXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5leHRfc3JnYikge1xuICAgIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0c1snc3JnYmEnXSA9IEdMX1NSR0I4X0FMUEhBOF9FWFRcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLmV4dF9jb2xvcl9idWZmZXJfaGFsZl9mbG9hdCkge1xuICAgIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0c1sncmdiYTE2ZiddID0gR0xfUkdCQTE2Rl9FWFRcbiAgICBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHNbJ3JnYjE2ZiddID0gR0xfUkdCMTZGX0VYVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29sb3JfYnVmZmVyX2Zsb2F0KSB7XG4gICAgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzWydyZ2JhMzJmJ10gPSBHTF9SR0JBMzJGX0VYVFxuICB9XG5cbiAgdmFyIGRlcHRoUmVuZGVyYnVmZmVyRm9ybWF0RW51bXMgPSBbR0xfREVQVEhfQ09NUE9ORU5UMTZdXG4gIHZhciBzdGVuY2lsUmVuZGVyYnVmZmVyRm9ybWF0RW51bXMgPSBbR0xfU1RFTkNJTF9JTkRFWDhdXG4gIHZhciBkZXB0aFN0ZW5jaWxSZW5kZXJidWZmZXJGb3JtYXRFbnVtcyA9IFtHTF9ERVBUSF9TVEVOQ0lMXVxuXG4gIHZhciBkZXB0aFRleHR1cmVGb3JtYXRFbnVtcyA9IFtdXG4gIHZhciBzdGVuY2lsVGV4dHVyZUZvcm1hdEVudW1zID0gW11cbiAgdmFyIGRlcHRoU3RlbmNpbFRleHR1cmVGb3JtYXRFbnVtcyA9IFtdXG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfZGVwdGhfdGV4dHVyZSkge1xuICAgIGRlcHRoVGV4dHVyZUZvcm1hdEVudW1zLnB1c2goR0xfREVQVEhfQ09NUE9ORU5UKVxuICAgIGRlcHRoU3RlbmNpbFRleHR1cmVGb3JtYXRFbnVtcy5wdXNoKEdMX0RFUFRIX1NURU5DSUwpXG4gIH1cblxuICB2YXIgY29sb3JGb3JtYXRzID0gZXh0ZW5kKGV4dGVuZCh7fSxcbiAgICBjb2xvclRleHR1cmVGb3JtYXRzKSxcbiAgICBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHMpXG5cbiAgdmFyIGNvbG9yVGV4dHVyZUZvcm1hdEVudW1zID0gdmFsdWVzKGNvbG9yVGV4dHVyZUZvcm1hdHMpXG4gIHZhciBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdEVudW1zID0gdmFsdWVzKGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0cylcblxuICB2YXIgaGlnaGVzdFByZWNpc2lvbiA9IEdMX1VOU0lHTkVEX0JZVEVcbiAgdmFyIGNvbG9yVHlwZXMgPSB7XG4gICAgJ3VpbnQ4JzogR0xfVU5TSUdORURfQllURVxuICB9XG4gIGlmIChleHRlbnNpb25zLm9lc190ZXh0dXJlX2hhbGZfZmxvYXQpIHtcbiAgICBoaWdoZXN0UHJlY2lzaW9uID0gY29sb3JUeXBlc1snaGFsZiBmbG9hdCddID0gR0xfSEFMRl9GTE9BVF9PRVNcbiAgfVxuICBpZiAoZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9mbG9hdCkge1xuICAgIGhpZ2hlc3RQcmVjaXNpb24gPSBjb2xvclR5cGVzLmZsb2F0ID0gR0xfRkxPQVRcbiAgfVxuICBjb2xvclR5cGVzLmJlc3QgPSBoaWdoZXN0UHJlY2lzaW9uXG5cbiAgdmFyIERSQVdfQlVGRkVSUyA9IChmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHJlc3VsdCA9IG5ldyBBcnJheShsaW1pdHMubWF4RHJhd2J1ZmZlcnMpXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPD0gbGltaXRzLm1heERyYXdidWZmZXJzOyArK2kpIHtcbiAgICAgIHZhciByb3cgPSByZXN1bHRbaV0gPSBuZXcgQXJyYXkoaSlcbiAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgaTsgKytqKSB7XG4gICAgICAgIHJvd1tqXSA9IEdMX0NPTE9SX0FUVEFDSE1FTlQwICsgalxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0XG4gIH0pKClcblxuICBmdW5jdGlvbiBGcmFtZWJ1ZmZlckF0dGFjaG1lbnQgKHRhcmdldCwgbGV2ZWwsIHRleHR1cmUsIHJlbmRlcmJ1ZmZlcikge1xuICAgIHRoaXMudGFyZ2V0ID0gdGFyZ2V0XG4gICAgdGhpcy5sZXZlbCA9IGxldmVsXG4gICAgdGhpcy50ZXh0dXJlID0gdGV4dHVyZVxuICAgIHRoaXMucmVuZGVyYnVmZmVyID0gcmVuZGVyYnVmZmVyXG4gIH1cblxuICBmdW5jdGlvbiBkZWNSZWYgKGF0dGFjaG1lbnQpIHtcbiAgICBpZiAoYXR0YWNobWVudCkge1xuICAgICAgaWYgKGF0dGFjaG1lbnQudGV4dHVyZSkge1xuICAgICAgICBhdHRhY2htZW50LnRleHR1cmUuX3RleHR1cmUuZGVjUmVmKClcbiAgICAgIH1cbiAgICAgIGlmIChhdHRhY2htZW50LnJlbmRlcmJ1ZmZlcikge1xuICAgICAgICBhdHRhY2htZW50LnJlbmRlcmJ1ZmZlci5fcmVuZGVyYnVmZmVyLmRlY1JlZigpXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gY2hlY2tGb3JtYXQgKGF0dGFjaG1lbnQsIHRleEZvcm1hdHMsIHJiRm9ybWF0cykge1xuICAgIGlmIChhdHRhY2htZW50LnRleHR1cmUpIHtcbiAgICAgIGNoZWNrLm9uZU9mKGF0dGFjaG1lbnQudGV4dHVyZS5fdGV4dHVyZS5wYXJhbXMuaW50ZXJuYWxmb3JtYXQsIHRleEZvcm1hdHMsXG4gICAgICAgICd1bnN1cHBvcnRlZCB0ZXh0dXJlIGZvcm1hdCBmb3IgYXR0YWNobWVudCcpXG4gICAgfSBlbHNlIHtcbiAgICAgIGNoZWNrLm9uZU9mKGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXIuZm9ybWF0LCByYkZvcm1hdHMsXG4gICAgICAgICd1bnN1cHBvcnRlZCByZW5kZXJidWZmZXIgZm9ybWF0IGZvciBhdHRhY2htZW50JylcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBpbmNSZWZBbmRDaGVja1NoYXBlIChhdHRhY2htZW50LCBmcmFtZWJ1ZmZlcikge1xuICAgIHZhciB3aWR0aCA9IGZyYW1lYnVmZmVyLndpZHRoXG4gICAgdmFyIGhlaWdodCA9IGZyYW1lYnVmZmVyLmhlaWdodFxuICAgIGlmIChhdHRhY2htZW50LnRleHR1cmUpIHtcbiAgICAgIHZhciB0ZXh0dXJlID0gYXR0YWNobWVudC50ZXh0dXJlLl90ZXh0dXJlXG4gICAgICB2YXIgdHcgPSBNYXRoLm1heCgxLCB0ZXh0dXJlLnBhcmFtcy53aWR0aCA+PiBhdHRhY2htZW50LmxldmVsKVxuICAgICAgdmFyIHRoID0gTWF0aC5tYXgoMSwgdGV4dHVyZS5wYXJhbXMuaGVpZ2h0ID4+IGF0dGFjaG1lbnQubGV2ZWwpXG4gICAgICB3aWR0aCA9IHdpZHRoIHx8IHR3XG4gICAgICBoZWlnaHQgPSBoZWlnaHQgfHwgdGhcbiAgICAgIGNoZWNrKHR3ID09PSB3aWR0aCAmJiB0aCA9PT0gaGVpZ2h0LFxuICAgICAgICAnaW5jb25zaXN0ZW50IHdpZHRoL2hlaWdodCBmb3Igc3VwcGxpZWQgdGV4dHVyZScpXG4gICAgICBjaGVjayh0ZXh0dXJlLnBvbGxJZCA8IDAsXG4gICAgICAgICdwb2xsaW5nIGZibyB0ZXh0dXJlcyBub3Qgc3VwcG9ydGVkJylcbiAgICAgIHRleHR1cmUucmVmQ291bnQgKz0gMVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgcmVuZGVyYnVmZmVyID0gYXR0YWNobWVudC5yZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlclxuICAgICAgd2lkdGggPSB3aWR0aCB8fCByZW5kZXJidWZmZXIud2lkdGhcbiAgICAgIGhlaWdodCA9IGhlaWdodCB8fCByZW5kZXJidWZmZXIuaGVpZ2h0XG4gICAgICBjaGVjayhcbiAgICAgICAgcmVuZGVyYnVmZmVyLndpZHRoID09PSB3aWR0aCAmJiByZW5kZXJidWZmZXIuaGVpZ2h0ID09PSBoZWlnaHQsXG4gICAgICAgICdpbmNvbnNpc3RlbnQgd2lkdGgvaGVpZ2h0IGZvciByZW5kZXJidWZmZXInKVxuICAgICAgY2hlY2soXG4gICAgICAgIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0RW51bXMuaW5kZXhPZihyZW5kZXJidWZmZXIuZm9ybWF0KSA+PSAwLFxuICAgICAgICAncmVuZGVyYnVmZmVyIGZvcm1hdCBub3QgY29tcGF0aWJsZSB3aXRoIGNvbG9yIGNoYW5uZWxzJylcbiAgICAgIHJlbmRlcmJ1ZmZlci5yZWZDb3VudCArPSAxXG4gICAgfVxuICAgIGZyYW1lYnVmZmVyLndpZHRoID0gd2lkdGhcbiAgICBmcmFtZWJ1ZmZlci5oZWlnaHQgPSBoZWlnaHRcbiAgfVxuXG4gIGZ1bmN0aW9uIGF0dGFjaCAobG9jYXRpb24sIGF0dGFjaG1lbnQpIHtcbiAgICBpZiAoYXR0YWNobWVudCkge1xuICAgICAgaWYgKGF0dGFjaG1lbnQudGV4dHVyZSkge1xuICAgICAgICBnbC5mcmFtZWJ1ZmZlclRleHR1cmUyRChcbiAgICAgICAgICBHTF9GUkFNRUJVRkZFUixcbiAgICAgICAgICBsb2NhdGlvbixcbiAgICAgICAgICBhdHRhY2htZW50LnRhcmdldCxcbiAgICAgICAgICBhdHRhY2htZW50LnRleHR1cmUuX3RleHR1cmUudGV4dHVyZSxcbiAgICAgICAgICBhdHRhY2htZW50LmxldmVsKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZ2wuZnJhbWVidWZmZXJSZW5kZXJidWZmZXIoXG4gICAgICAgICAgR0xfRlJBTUVCVUZGRVIsXG4gICAgICAgICAgbG9jYXRpb24sXG4gICAgICAgICAgR0xfUkVOREVSQlVGRkVSLFxuICAgICAgICAgIGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXIucmVuZGVyYnVmZmVyKVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBnbC5mcmFtZWJ1ZmZlclRleHR1cmUyRChcbiAgICAgICAgR0xfRlJBTUVCVUZGRVIsXG4gICAgICAgIGxvY2F0aW9uLFxuICAgICAgICBHTF9URVhUVVJFXzJELFxuICAgICAgICBudWxsLFxuICAgICAgICAwKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHRyeVVwZGF0ZUF0dGFjaG1lbnQgKFxuICAgIGF0dGFjaG1lbnQsXG4gICAgaXNUZXh0dXJlLFxuICAgIGZvcm1hdCxcbiAgICB0eXBlLFxuICAgIHdpZHRoLFxuICAgIGhlaWdodCkge1xuICAgIGlmIChhdHRhY2htZW50LnRleHR1cmUpIHtcbiAgICAgIHZhciB0ZXh0dXJlID0gYXR0YWNobWVudC50ZXh0dXJlXG4gICAgICBpZiAoaXNUZXh0dXJlKSB7XG4gICAgICAgIHRleHR1cmUoe1xuICAgICAgICAgIGZvcm1hdDogZm9ybWF0LFxuICAgICAgICAgIHR5cGU6IHR5cGUsXG4gICAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICAgIGhlaWdodDogaGVpZ2h0XG4gICAgICAgIH0pXG4gICAgICAgIHRleHR1cmUuX3RleHR1cmUucmVmQ291bnQgKz0gMVxuICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgcmVuZGVyYnVmZmVyID0gYXR0YWNobWVudC5yZW5kZXJidWZmZXJcbiAgICAgIGlmICghaXNUZXh0dXJlKSB7XG4gICAgICAgIHJlbmRlcmJ1ZmZlcih7XG4gICAgICAgICAgZm9ybWF0OiBmb3JtYXQsXG4gICAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICAgIGhlaWdodDogaGVpZ2h0XG4gICAgICAgIH0pXG4gICAgICAgIHJlbmRlcmJ1ZmZlci5fcmVuZGVyYnVmZmVyLnJlZkNvdW50ICs9IDFcbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgIH1cbiAgICB9XG4gICAgZGVjUmVmKGF0dGFjaG1lbnQpXG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZUF0dGFjaG1lbnQgKGF0dGFjaG1lbnQpIHtcbiAgICB2YXIgdGFyZ2V0ID0gR0xfVEVYVFVSRV8yRFxuICAgIHZhciBsZXZlbCA9IDBcbiAgICB2YXIgdGV4dHVyZSA9IG51bGxcbiAgICB2YXIgcmVuZGVyYnVmZmVyID0gbnVsbFxuXG4gICAgdmFyIGRhdGEgPSBhdHRhY2htZW50XG4gICAgaWYgKHR5cGVvZiBhdHRhY2htZW50ID09PSAnb2JqZWN0Jykge1xuICAgICAgZGF0YSA9IGF0dGFjaG1lbnQuZGF0YVxuICAgICAgaWYgKCdsZXZlbCcgaW4gYXR0YWNobWVudCkge1xuICAgICAgICBsZXZlbCA9IGF0dGFjaG1lbnQubGV2ZWwgfCAwXG4gICAgICB9XG4gICAgICBpZiAoJ3RhcmdldCcgaW4gYXR0YWNobWVudCkge1xuICAgICAgICB0YXJnZXQgPSBhdHRhY2htZW50LnRhcmdldCB8IDBcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjaGVjay50eXBlKGRhdGEsICdmdW5jdGlvbicsICdpbnZhbGlkIGF0dGFjaG1lbnQgZGF0YScpXG5cbiAgICB2YXIgdHlwZSA9IGF0dGFjaG1lbnQuX3JlZ2xUeXBlXG4gICAgaWYgKHR5cGUgPT09ICd0ZXh0dXJlJykge1xuICAgICAgdGV4dHVyZSA9IGF0dGFjaG1lbnRcbiAgICAgIGlmICh0ZXh0dXJlLl90ZXh0dXJlLnRhcmdldCA9PT0gR0xfVEVYVFVSRV9DVUJFX01BUCkge1xuICAgICAgICBjaGVjayhcbiAgICAgICAgICB0YXJnZXQgPj0gR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YICYmXG4gICAgICAgICAgdGFyZ2V0IDwgR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YICsgNixcbiAgICAgICAgICAnaW52YWxpZCBjdWJlIG1hcCB0YXJnZXQnKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY2hlY2sodGFyZ2V0ID09PSBHTF9URVhUVVJFXzJEKVxuICAgICAgfVxuICAgICAgLy8gVE9ETyBjaGVjayBtaXBsZXZlbCBpcyBjb25zaXN0ZW50XG4gICAgfSBlbHNlIGlmICh0eXBlID09PSAncmVuZGVyYnVmZmVyJykge1xuICAgICAgcmVuZGVyYnVmZmVyID0gYXR0YWNobWVudFxuICAgICAgdGFyZ2V0ID0gR0xfUkVOREVSQlVGRkVSXG4gICAgICBsZXZlbCA9IDBcbiAgICB9IGVsc2Uge1xuICAgICAgY2hlY2sucmFpc2UoJ2ludmFsaWQgcmVnbCBvYmplY3QgZm9yIGF0dGFjaG1lbnQnKVxuICAgIH1cblxuICAgIHJldHVybiBuZXcgRnJhbWVidWZmZXJBdHRhY2htZW50KHRhcmdldCwgbGV2ZWwsIHRleHR1cmUsIHJlbmRlcmJ1ZmZlcilcbiAgfVxuXG4gIGZ1bmN0aW9uIHVud3JhcEF0dGFjaG1lbnQgKGF0dGFjaG1lbnQpIHtcbiAgICByZXR1cm4gYXR0YWNobWVudCAmJiAoYXR0YWNobWVudC50ZXh0dXJlIHx8IGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyKVxuICB9XG5cbiAgdmFyIGZyYW1lYnVmZmVyQ291bnQgPSAwXG4gIHZhciBmcmFtZWJ1ZmZlclNldCA9IHt9XG4gIHZhciBmcmFtZWJ1ZmZlclN0YWNrID0gW251bGxdXG4gIHZhciBmcmFtZWJ1ZmZlckRpcnR5ID0gdHJ1ZVxuXG4gIGZ1bmN0aW9uIFJFR0xGcmFtZWJ1ZmZlciAoKSB7XG4gICAgdGhpcy5pZCA9IGZyYW1lYnVmZmVyQ291bnQrK1xuICAgIGZyYW1lYnVmZmVyU2V0W3RoaXMuaWRdID0gdGhpc1xuXG4gICAgdGhpcy5mcmFtZWJ1ZmZlciA9IG51bGxcbiAgICB0aGlzLndpZHRoID0gMFxuICAgIHRoaXMuaGVpZ2h0ID0gMFxuXG4gICAgdGhpcy5jb2xvckF0dGFjaG1lbnRzID0gW11cbiAgICB0aGlzLmRlcHRoQXR0YWNobWVudCA9IG51bGxcbiAgICB0aGlzLnN0ZW5jaWxBdHRhY2htZW50ID0gbnVsbFxuICAgIHRoaXMuZGVwdGhTdGVuY2lsQXR0YWNobWVudCA9IG51bGxcblxuICAgIHRoaXMub3duc0NvbG9yID0gZmFsc2VcbiAgICB0aGlzLm93bnNEZXB0aFN0ZW5jaWwgPSBmYWxzZVxuICB9XG5cbiAgZnVuY3Rpb24gcmVmcmVzaCAoZnJhbWVidWZmZXIpIHtcbiAgICBpZiAoIWdsLmlzRnJhbWVidWZmZXIoZnJhbWVidWZmZXIuZnJhbWVidWZmZXIpKSB7XG4gICAgICBmcmFtZWJ1ZmZlci5mcmFtZWJ1ZmZlciA9IGdsLmNyZWF0ZUZyYW1lYnVmZmVyKClcbiAgICB9XG4gICAgZnJhbWVidWZmZXJEaXJ0eSA9IHRydWVcbiAgICBnbC5iaW5kRnJhbWVidWZmZXIoR0xfRlJBTUVCVUZGRVIsIGZyYW1lYnVmZmVyLmZyYW1lYnVmZmVyKVxuXG4gICAgdmFyIGNvbG9yQXR0YWNobWVudHMgPSBmcmFtZWJ1ZmZlci5jb2xvckF0dGFjaG1lbnRzXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjb2xvckF0dGFjaG1lbnRzLmxlbmd0aDsgKytpKSB7XG4gICAgICBhdHRhY2goR0xfQ09MT1JfQVRUQUNITUVOVDAgKyBpLCBjb2xvckF0dGFjaG1lbnRzW2ldKVxuICAgIH1cbiAgICBmb3IgKGkgPSBjb2xvckF0dGFjaG1lbnRzLmxlbmd0aDsgaSA8IGxpbWl0cy5tYXhDb2xvckF0dGFjaG1lbnRzOyArK2kpIHtcbiAgICAgIGF0dGFjaChHTF9DT0xPUl9BVFRBQ0hNRU5UMCArIGksIG51bGwpXG4gICAgfVxuICAgIGF0dGFjaChHTF9ERVBUSF9BVFRBQ0hNRU5ULCBmcmFtZWJ1ZmZlci5kZXB0aEF0dGFjaG1lbnQpXG4gICAgYXR0YWNoKEdMX1NURU5DSUxfQVRUQUNITUVOVCwgZnJhbWVidWZmZXIuc3RlbmNpbEF0dGFjaG1lbnQpXG4gICAgYXR0YWNoKEdMX0RFUFRIX1NURU5DSUxfQVRUQUNITUVOVCwgZnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsQXR0YWNobWVudClcblxuICAgIGlmIChleHRlbnNpb25zLndlYmdsX2RyYXdfYnVmZmVycykge1xuICAgICAgZXh0ZW5zaW9ucy53ZWJnbF9kcmF3X2J1ZmZlcnMuZHJhd0J1ZmZlcnNXRUJHTChcbiAgICAgICAgRFJBV19CVUZGRVJTW2NvbG9yQXR0YWNobWVudHMubGVuZ3RoXSlcbiAgICB9XG5cbiAgICAvLyBDaGVjayBzdGF0dXMgY29kZVxuICAgIHZhciBzdGF0dXMgPSBnbC5jaGVja0ZyYW1lYnVmZmVyU3RhdHVzKEdMX0ZSQU1FQlVGRkVSKVxuICAgIGlmIChzdGF0dXMgIT09IEdMX0ZSQU1FQlVGRkVSX0NPTVBMRVRFKSB7XG4gICAgICBjaGVjay5yYWlzZSgnZnJhbWVidWZmZXIgY29uZmlndXJhdGlvbiBub3Qgc3VwcG9ydGVkLCBzdGF0dXMgPSAnICtcbiAgICAgICAgc3RhdHVzQ29kZVtzdGF0dXNdKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGRlY0ZCT1JlZnMgKGZyYW1lYnVmZmVyKSB7XG4gICAgZnJhbWVidWZmZXIuY29sb3JBdHRhY2htZW50cy5mb3JFYWNoKGRlY1JlZilcbiAgICBkZWNSZWYoZnJhbWVidWZmZXIuZGVwdGhBdHRhY2htZW50KVxuICAgIGRlY1JlZihmcmFtZWJ1ZmZlci5zdGVuY2lsQXR0YWNobWVudClcbiAgICBkZWNSZWYoZnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsQXR0YWNobWVudClcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3kgKGZyYW1lYnVmZmVyKSB7XG4gICAgdmFyIGhhbmRsZSA9IGZyYW1lYnVmZmVyLmZyYW1lYnVmZmVyXG4gICAgY2hlY2soaGFuZGxlLCAnbXVzdCBub3QgZG91YmxlIGRlc3Ryb3kgZnJhbWVidWZmZXInKVxuICAgIGlmIChnbC5pc0ZyYW1lYnVmZmVyKGhhbmRsZSkpIHtcbiAgICAgIGdsLmRlbGV0ZUZyYW1lYnVmZmVyKGhhbmRsZSlcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBjcmVhdGVGQk8gKG9wdGlvbnMpIHtcbiAgICB2YXIgZnJhbWVidWZmZXIgPSBuZXcgUkVHTEZyYW1lYnVmZmVyKClcblxuICAgIGZ1bmN0aW9uIHJlZ2xGcmFtZWJ1ZmZlciAoaW5wdXQpIHtcbiAgICAgIHZhciBpXG4gICAgICB2YXIgb3B0aW9ucyA9IGlucHV0IHx8IHt9XG5cbiAgICAgIHZhciBleHREcmF3QnVmZmVycyA9IGV4dGVuc2lvbnMud2ViZ2xfZHJhd19idWZmZXJzXG5cbiAgICAgIHZhciB3aWR0aCA9IDBcbiAgICAgIHZhciBoZWlnaHQgPSAwXG4gICAgICBpZiAoJ3NoYXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBzaGFwZSA9IG9wdGlvbnMuc2hhcGVcbiAgICAgICAgY2hlY2soQXJyYXkuaXNBcnJheShzaGFwZSkgJiYgc2hhcGUubGVuZ3RoID49IDIsXG4gICAgICAgICAgJ2ludmFsaWQgc2hhcGUgZm9yIGZyYW1lYnVmZmVyJylcbiAgICAgICAgd2lkdGggPSBzaGFwZVswXVxuICAgICAgICBoZWlnaHQgPSBzaGFwZVsxXVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKCdyYWRpdXMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB3aWR0aCA9IGhlaWdodCA9IG9wdGlvbnMucmFkaXVzXG4gICAgICAgIH1cbiAgICAgICAgaWYgKCd3aWR0aCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHdpZHRoID0gb3B0aW9ucy53aWR0aFxuICAgICAgICB9XG4gICAgICAgIGlmICgnaGVpZ2h0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgaGVpZ2h0ID0gb3B0aW9ucy5oZWlnaHRcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBjb2xvclR5cGUsIG51bUNvbG9yc1xuICAgICAgdmFyIGNvbG9yQnVmZmVycyA9IG51bGxcbiAgICAgIHZhciBvd25zQ29sb3IgPSBmYWxzZVxuICAgICAgaWYgKCdjb2xvckJ1ZmZlcnMnIGluIG9wdGlvbnMgfHwgJ2NvbG9yQnVmZmVyJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBjb2xvcklucHV0cyA9IG9wdGlvbnMuY29sb3JCdWZmZXJzIHx8IG9wdGlvbnMuY29sb3JCdWZmZXJcbiAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KGNvbG9ySW5wdXRzKSkge1xuICAgICAgICAgIGNvbG9ySW5wdXRzID0gW2NvbG9ySW5wdXRzXVxuICAgICAgICB9XG5cbiAgICAgICAgZnJhbWVidWZmZXIud2lkdGggPSB3aWR0aFxuICAgICAgICBmcmFtZWJ1ZmZlci5oZWlnaHQgPSBoZWlnaHRcblxuICAgICAgICBpZiAoY29sb3JJbnB1dHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgIGNoZWNrKGV4dERyYXdCdWZmZXJzLCAnbXVsdGlwbGUgcmVuZGVyIHRhcmdldHMgbm90IHN1cHBvcnRlZCcpXG4gICAgICAgIH1cbiAgICAgICAgY2hlY2soY29sb3JJbnB1dHMubGVuZ3RoID49IDAsXG4gICAgICAgICAgJ211c3Qgc3BlY2lmeSBhdCBsZWFzdCBvbmUgY29sb3IgYXR0YWNobWVudCcpXG5cbiAgICAgICAgLy8gV3JhcCBjb2xvciBhdHRhY2htZW50c1xuICAgICAgICBjb2xvckJ1ZmZlcnMgPSBjb2xvcklucHV0cy5tYXAocGFyc2VBdHRhY2htZW50KVxuXG4gICAgICAgIC8vIENoZWNrIGhlYWQgbm9kZVxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY29sb3JCdWZmZXJzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgdmFyIGNvbG9yQXR0YWNobWVudCA9IGNvbG9yQnVmZmVyc1tpXVxuICAgICAgICAgIGNoZWNrRm9ybWF0KFxuICAgICAgICAgICAgY29sb3JBdHRhY2htZW50LFxuICAgICAgICAgICAgY29sb3JUZXh0dXJlRm9ybWF0RW51bXMsXG4gICAgICAgICAgICBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdEVudW1zKVxuICAgICAgICAgIGluY1JlZkFuZENoZWNrU2hhcGUoXG4gICAgICAgICAgICBjb2xvckF0dGFjaG1lbnQsXG4gICAgICAgICAgICBmcmFtZWJ1ZmZlcilcbiAgICAgICAgfVxuXG4gICAgICAgIHdpZHRoID0gZnJhbWVidWZmZXIud2lkdGhcbiAgICAgICAgaGVpZ2h0ID0gZnJhbWVidWZmZXIuaGVpZ2h0XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgY29sb3JUZXh0dXJlID0gdHJ1ZVxuICAgICAgICB2YXIgY29sb3JGb3JtYXQgPSAncmdiYSdcbiAgICAgICAgdmFyIGNvbG9yVHlwZSA9ICd1aW50OCdcbiAgICAgICAgdmFyIGNvbG9yQ291bnQgPSAxXG4gICAgICAgIG93bnNDb2xvciA9IHRydWVcblxuICAgICAgICBmcmFtZWJ1ZmZlci53aWR0aCA9IHdpZHRoIHx8IGdsLmRyYXdpbmdCdWZmZXJXaWR0aFxuICAgICAgICBmcmFtZWJ1ZmZlci5oZWlnaHQgPSBoZWlnaHQgfHwgZ2wuZHJhd2luZ0J1ZmZlckhlaWdodFxuXG4gICAgICAgIGlmICgnZm9ybWF0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgY29sb3JGb3JtYXQgPSBvcHRpb25zLmZvcm1hdFxuICAgICAgICAgIGNoZWNrLnBhcmFtZXRlcihjb2xvckZvcm1hdCwgY29sb3JGb3JtYXRzLCAnaW52YWxpZCBjb2xvciBmb3JtYXQnKVxuICAgICAgICAgIGNvbG9yVGV4dHVyZSA9IGNvbG9yRm9ybWF0IGluIGNvbG9yVGV4dHVyZUZvcm1hdHNcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgndHlwZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGNoZWNrKGNvbG9yVGV4dHVyZSxcbiAgICAgICAgICAgICdjb2xvclR5cGUgY2FuIG5vdCBiZSBzZXQgZm9yIHJlbmRlcmJ1ZmZlciB0YXJnZXRzJylcbiAgICAgICAgICBjb2xvclR5cGUgPSBvcHRpb25zLnR5cGVcbiAgICAgICAgICBjaGVjay5wYXJhbWV0ZXIoY29sb3JUeXBlLCBjb2xvclR5cGVzLCAnaW52YWxpZCBjb2xvciB0eXBlJylcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnY29sb3JDb3VudCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGNvbG9yQ291bnQgPSBvcHRpb25zLmNvbG9yQ291bnQgfCAwXG4gICAgICAgICAgY2hlY2soY29sb3JDb3VudCA+PSAwLCAnY29sb3IgY291bnQgbXVzdCBiZSBwb3NpdGl2ZScpXG4gICAgICAgIH1cblxuICAgICAgICAvLyBSZXVzZSBjb2xvciBidWZmZXIgYXJyYXkgaWYgd2Ugb3duIGl0XG4gICAgICAgIGlmIChmcmFtZWJ1ZmZlci5vd25zQ29sb3IpIHtcbiAgICAgICAgICBjb2xvckJ1ZmZlcnMgPSBmcmFtZWJ1ZmZlci5jb2xvckF0dGFjaG1lbnRzXG4gICAgICAgICAgd2hpbGUgKGNvbG9yQnVmZmVycy5sZW5ndGggPiBjb2xvckNvdW50KSB7XG4gICAgICAgICAgICBkZWNSZWYoY29sb3JCdWZmZXJzLnBvcCgpKVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb2xvckJ1ZmZlcnMgPSBbXVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gdXBkYXRlIGJ1ZmZlcnMgaW4gcGxhY2UsIHJlbW92ZSBpbmNvbXBhdGlibGUgYnVmZmVyc1xuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY29sb3JCdWZmZXJzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgaWYgKCF0cnlVcGRhdGVBdHRhY2htZW50KFxuICAgICAgICAgICAgICBjb2xvckJ1ZmZlcnNbaV0sXG4gICAgICAgICAgICAgIGNvbG9yVGV4dHVyZSxcbiAgICAgICAgICAgICAgY29sb3JGb3JtYXQsXG4gICAgICAgICAgICAgIGNvbG9yVHlwZSxcbiAgICAgICAgICAgICAgd2lkdGgsXG4gICAgICAgICAgICAgIGhlaWdodCkpIHtcbiAgICAgICAgICAgIGNvbG9yQnVmZmVyc1tpLS1dID0gY29sb3JCdWZmZXJzW2NvbG9yQnVmZmVycy5sZW5ndGggLSAxXVxuICAgICAgICAgICAgY29sb3JCdWZmZXJzLnBvcCgpXG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gVGhlbiBhcHBlbmQgbmV3IGJ1ZmZlcnNcbiAgICAgICAgd2hpbGUgKGNvbG9yQnVmZmVycy5sZW5ndGggPCBjb2xvckNvdW50KSB7XG4gICAgICAgICAgaWYgKGNvbG9yVGV4dHVyZSkge1xuICAgICAgICAgICAgY29sb3JCdWZmZXJzLnB1c2gobmV3IEZyYW1lYnVmZmVyQXR0YWNobWVudChcbiAgICAgICAgICAgICAgR0xfVEVYVFVSRV8yRCxcbiAgICAgICAgICAgICAgMCxcbiAgICAgICAgICAgICAgdGV4dHVyZVN0YXRlLmNyZWF0ZSh7XG4gICAgICAgICAgICAgICAgZm9ybWF0OiBjb2xvckZvcm1hdCxcbiAgICAgICAgICAgICAgICB0eXBlOiBjb2xvclR5cGUsXG4gICAgICAgICAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICAgICAgICAgIGhlaWdodDogaGVpZ2h0XG4gICAgICAgICAgICAgIH0sIEdMX1RFWFRVUkVfMkQpLFxuICAgICAgICAgICAgICBudWxsKSlcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29sb3JCdWZmZXJzLnB1c2gobmV3IEZyYW1lYnVmZmVyQXR0YWNobWVudChcbiAgICAgICAgICAgICAgR0xfUkVOREVSQlVGRkVSLFxuICAgICAgICAgICAgICAwLFxuICAgICAgICAgICAgICBudWxsLFxuICAgICAgICAgICAgICByZW5kZXJidWZmZXJTdGF0ZS5jcmVhdGUoe1xuICAgICAgICAgICAgICAgIGZvcm1hdDogY29sb3JGb3JtYXQsXG4gICAgICAgICAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICAgICAgICAgIGhlaWdodDogaGVpZ2h0XG4gICAgICAgICAgICAgIH0pKSlcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY2hlY2soY29sb3JCdWZmZXJzLmxlbmd0aCA+IDAsICdtdXN0IHNwZWNpZnkgYXQgbGVhc3Qgb25lIGNvbG9yIGJ1ZmZlcicpXG5cbiAgICAgIGZyYW1lYnVmZmVyLndpZHRoID0gd2lkdGhcbiAgICAgIGZyYW1lYnVmZmVyLmhlaWdodCA9IGhlaWdodFxuXG4gICAgICB2YXIgZGVwdGhCdWZmZXIgPSBudWxsXG4gICAgICB2YXIgc3RlbmNpbEJ1ZmZlciA9IG51bGxcbiAgICAgIHZhciBkZXB0aFN0ZW5jaWxCdWZmZXIgPSBudWxsXG4gICAgICB2YXIgb3duc0RlcHRoU3RlbmNpbCA9IGZhbHNlXG4gICAgICB2YXIgZGVwdGhTdGVuY2lsQ291bnQgPSAwXG5cbiAgICAgIGlmICgnZGVwdGhCdWZmZXInIGluIG9wdGlvbnMpIHtcbiAgICAgICAgZGVwdGhCdWZmZXIgPSBwYXJzZUF0dGFjaG1lbnQob3B0aW9ucy5kZXB0aEJ1ZmZlcilcbiAgICAgICAgY2hlY2tGb3JtYXQoXG4gICAgICAgICAgZGVwdGhCdWZmZXIsXG4gICAgICAgICAgZGVwdGhUZXh0dXJlRm9ybWF0RW51bXMsXG4gICAgICAgICAgZGVwdGhSZW5kZXJidWZmZXJGb3JtYXRFbnVtcylcbiAgICAgICAgZGVwdGhTdGVuY2lsQ291bnQgKz0gMVxuICAgICAgfVxuICAgICAgaWYgKCdzdGVuY2lsQnVmZmVyJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHN0ZW5jaWxCdWZmZXIgPSBwYXJzZUF0dGFjaG1lbnQob3B0aW9ucy5zdGVuY2lsQnVmZmVyKVxuICAgICAgICBjaGVja0Zvcm1hdChcbiAgICAgICAgICBzdGVuY2lsQnVmZmVyLFxuICAgICAgICAgIHN0ZW5jaWxUZXh0dXJlRm9ybWF0RW51bXMsXG4gICAgICAgICAgc3RlbmNpbFJlbmRlcmJ1ZmZlckZvcm1hdEVudW1zKVxuICAgICAgICBkZXB0aFN0ZW5jaWxDb3VudCArPSAxXG4gICAgICB9XG4gICAgICBpZiAoJ2RlcHRoU3RlbmNpbEJ1ZmZlcicgaW4gb3B0aW9ucykge1xuICAgICAgICBkZXB0aFN0ZW5jaWxCdWZmZXIgPSBwYXJzZUF0dGFjaG1lbnQob3B0aW9ucy5kZXB0aFN0ZW5jaWxCdWZmZXIpXG4gICAgICAgIGNoZWNrRm9ybWF0KFxuICAgICAgICAgIGRlcHRoU3RlbmNpbEJ1ZmZlcixcbiAgICAgICAgICBkZXB0aFN0ZW5jaWxUZXh0dXJlRm9ybWF0RW51bXMsXG4gICAgICAgICAgZGVwdGhTdGVuY2lsUmVuZGVyYnVmZmVyRm9ybWF0RW51bXMpXG4gICAgICAgIGRlcHRoU3RlbmNpbENvdW50ICs9IDFcbiAgICAgIH1cblxuICAgICAgaWYgKCEoZGVwdGhCdWZmZXIgfHwgc3RlbmNpbEJ1ZmZlciB8fCBkZXB0aFN0ZW5jaWxCdWZmZXIpKSB7XG4gICAgICAgIHZhciBkZXB0aCA9IHRydWVcbiAgICAgICAgdmFyIHN0ZW5jaWwgPSBmYWxzZVxuICAgICAgICB2YXIgdXNlVGV4dHVyZSA9IGZhbHNlXG5cbiAgICAgICAgaWYgKCdkZXB0aCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGRlcHRoID0gISFvcHRpb25zLmRlcHRoXG4gICAgICAgIH1cbiAgICAgICAgaWYgKCdzdGVuY2lsJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgc3RlbmNpbCA9ICEhb3B0aW9ucy5zdGVuY2lsXG4gICAgICAgIH1cbiAgICAgICAgaWYgKCdkZXB0aFRleHR1cmUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB1c2VUZXh0dXJlID0gISFvcHRpb25zLmRlcHRoVGV4dHVyZVxuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGN1ckRlcHRoU3RlbmNpbCA9XG4gICAgICAgICAgZnJhbWVidWZmZXIuZGVwdGhBdHRhY2htZW50IHx8XG4gICAgICAgICAgZnJhbWVidWZmZXIuc3RlbmNpbEF0dGFjaG1lbnQgfHxcbiAgICAgICAgICBmcmFtZWJ1ZmZlci5kZXB0aFN0ZW5jaWxBdHRhY2htZW50XG4gICAgICAgIHZhciBuZXh0RGVwdGhTdGVuY2lsID0gbnVsbFxuXG4gICAgICAgIGlmIChkZXB0aCB8fCBzdGVuY2lsKSB7XG4gICAgICAgICAgb3duc0RlcHRoU3RlbmNpbCA9IHRydWVcblxuICAgICAgICAgIGlmICh1c2VUZXh0dXJlKSB7XG4gICAgICAgICAgICBjaGVjayhleHRlbnNpb25zLndlYmdsX2RlcHRoX3RleHR1cmUsXG4gICAgICAgICAgICAgICdkZXB0aCB0ZXh0dXJlIGV4dGVuc2lvbiBub3Qgc3VwcG9ydGVkJylcbiAgICAgICAgICAgIHZhciBkZXB0aFRleHR1cmVGb3JtYXRcbiAgICAgICAgICAgIGNoZWNrKGRlcHRoLCAnc3RlbmNpbCBvbmx5IHRleHR1cmVzIG5vdCBzdXBwb3J0ZWQnKVxuICAgICAgICAgICAgaWYgKHN0ZW5jaWwpIHtcbiAgICAgICAgICAgICAgZGVwdGhUZXh0dXJlRm9ybWF0ID0gJ2RlcHRoIHN0ZW5jaWwnXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBkZXB0aFRleHR1cmVGb3JtYXQgPSAnZGVwdGgnXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoZnJhbWVidWZmZXIub3duc0RlcHRoU3RlbmNpbCAmJiBjdXJEZXB0aFN0ZW5jaWwudGV4dHVyZSkge1xuICAgICAgICAgICAgICBjdXJEZXB0aFN0ZW5jaWwudGV4dHVyZSh7XG4gICAgICAgICAgICAgICAgZm9ybWF0OiBkZXB0aFRleHR1cmVGb3JtYXQsXG4gICAgICAgICAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICAgICAgICAgIGhlaWdodDogaGVpZ2h0XG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIGN1ckRlcHRoU3RlbmNpbC50ZXh0dXJlLl90ZXh0dXJlLnJlZkNvdW50ICs9IDFcbiAgICAgICAgICAgICAgbmV4dERlcHRoU3RlbmNpbCA9IGN1ckRlcHRoU3RlbmNpbFxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgbmV4dERlcHRoU3RlbmNpbCA9IG5ldyBGcmFtZWJ1ZmZlckF0dGFjaG1lbnQoXG4gICAgICAgICAgICAgICAgR0xfVEVYVFVSRV8yRCxcbiAgICAgICAgICAgICAgICAwLFxuICAgICAgICAgICAgICAgIHRleHR1cmVTdGF0ZS5jcmVhdGUoe1xuICAgICAgICAgICAgICAgICAgZm9ybWF0OiBkZXB0aFRleHR1cmVGb3JtYXQsXG4gICAgICAgICAgICAgICAgICB3aWR0aDogd2lkdGgsXG4gICAgICAgICAgICAgICAgICBoZWlnaHQ6IGhlaWdodFxuICAgICAgICAgICAgICAgIH0sIEdMX1RFWFRVUkVfMkQpLFxuICAgICAgICAgICAgICAgIG51bGwpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciBkZXB0aFJlbmRlcmJ1ZmZlckZvcm1hdFxuICAgICAgICAgICAgaWYgKGRlcHRoKSB7XG4gICAgICAgICAgICAgIGlmIChzdGVuY2lsKSB7XG4gICAgICAgICAgICAgICAgZGVwdGhSZW5kZXJidWZmZXJGb3JtYXQgPSAnZGVwdGggc3RlbmNpbCdcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZXB0aFJlbmRlcmJ1ZmZlckZvcm1hdCA9ICdkZXB0aCdcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgZGVwdGhSZW5kZXJidWZmZXJGb3JtYXQgPSAnc3RlbmNpbCdcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChmcmFtZWJ1ZmZlci5vd25zRGVwdGhTdGVuY2lsICYmIGN1ckRlcHRoU3RlbmNpbC5yZW5kZXJidWZmZXIpIHtcbiAgICAgICAgICAgICAgY3VyRGVwdGhTdGVuY2lsLnJlbmRlcmJ1ZmZlcih7XG4gICAgICAgICAgICAgICAgZm9ybWF0OiBkZXB0aFJlbmRlcmJ1ZmZlckZvcm1hdCxcbiAgICAgICAgICAgICAgICB3aWR0aDogd2lkdGgsXG4gICAgICAgICAgICAgICAgaGVpZ2h0OiBoZWlnaHRcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgY3VyRGVwdGhTdGVuY2lsLnJlbmRlcmJ1ZmZlci5fcmVuZGVyYnVmZmVyLnJlZkNvdW50ICs9IDFcbiAgICAgICAgICAgICAgbmV4dERlcHRoU3RlbmNpbCA9IGN1ckRlcHRoU3RlbmNpbFxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgbmV4dERlcHRoU3RlbmNpbCA9IG5ldyBGcmFtZWJ1ZmZlckF0dGFjaG1lbnQoXG4gICAgICAgICAgICAgICAgR0xfUkVOREVSQlVGRkVSLFxuICAgICAgICAgICAgICAgIDAsXG4gICAgICAgICAgICAgICAgbnVsbCxcbiAgICAgICAgICAgICAgICByZW5kZXJidWZmZXJTdGF0ZS5jcmVhdGUoe1xuICAgICAgICAgICAgICAgICAgZm9ybWF0OiBkZXB0aFJlbmRlcmJ1ZmZlckZvcm1hdCxcbiAgICAgICAgICAgICAgICAgIHdpZHRoOiB3aWR0aCxcbiAgICAgICAgICAgICAgICAgIGhlaWdodDogaGVpZ2h0XG4gICAgICAgICAgICAgICAgfSkpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKGRlcHRoKSB7XG4gICAgICAgICAgICBpZiAoc3RlbmNpbCkge1xuICAgICAgICAgICAgICBkZXB0aFN0ZW5jaWxCdWZmZXIgPSBuZXh0RGVwdGhTdGVuY2lsXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBkZXB0aEJ1ZmZlciA9IG5leHREZXB0aFN0ZW5jaWxcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc3RlbmNpbEJ1ZmZlciA9IG5leHREZXB0aFN0ZW5jaWxcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNoZWNrKGRlcHRoU3RlbmNpbENvdW50ID09PSAxLFxuICAgICAgICAgICdjYW4gc3BlY2lmeSBvbmx5IG9uZSBvZiBkZXB0aCwgc3RlbmNpbCBvciBkZXB0aFN0ZW5jaWwgYXR0YWNobWVudCcpXG5cbiAgICAgICAgaW5jUmVmQW5kQ2hlY2tTaGFwZShcbiAgICAgICAgICBkZXB0aEJ1ZmZlciB8fFxuICAgICAgICAgIHN0ZW5jaWxCdWZmZXIgfHxcbiAgICAgICAgICBkZXB0aFN0ZW5jaWxCdWZmZXIsXG4gICAgICAgICAgZnJhbWVidWZmZXIpXG4gICAgICB9XG5cbiAgICAgIGRlY0ZCT1JlZnMoZnJhbWVidWZmZXIpXG5cbiAgICAgIGZyYW1lYnVmZmVyLmNvbG9yQXR0YWNobWVudHMgPSBjb2xvckJ1ZmZlcnNcbiAgICAgIGZyYW1lYnVmZmVyLmRlcHRoQXR0YWNobWVudCA9IGRlcHRoQnVmZmVyXG4gICAgICBmcmFtZWJ1ZmZlci5zdGVuY2lsQXR0YWNobWVudCA9IHN0ZW5jaWxCdWZmZXJcbiAgICAgIGZyYW1lYnVmZmVyLmRlcHRoU3RlbmNpbEF0dGFjaG1lbnQgPSBkZXB0aFN0ZW5jaWxCdWZmZXJcbiAgICAgIGZyYW1lYnVmZmVyLm93bnNDb2xvciA9IG93bnNDb2xvclxuICAgICAgZnJhbWVidWZmZXIub3duc0RlcHRoU3RlbmNpbCA9IG93bnNEZXB0aFN0ZW5jaWxcblxuICAgICAgcmVnbEZyYW1lYnVmZmVyLmNvbG9yID0gY29sb3JCdWZmZXJzLm1hcCh1bndyYXBBdHRhY2htZW50KVxuICAgICAgcmVnbEZyYW1lYnVmZmVyLmRlcHRoID0gdW53cmFwQXR0YWNobWVudChkZXB0aEJ1ZmZlcilcbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci5zdGVuY2lsID0gdW53cmFwQXR0YWNobWVudChzdGVuY2lsQnVmZmVyKVxuICAgICAgcmVnbEZyYW1lYnVmZmVyLmRlcHRoU3RlbmNpbCA9IHVud3JhcEF0dGFjaG1lbnQoZGVwdGhTdGVuY2lsQnVmZmVyKVxuXG4gICAgICByZWZyZXNoKGZyYW1lYnVmZmVyKVxuXG4gICAgICByZWdsRnJhbWVidWZmZXIud2lkdGggPSBmcmFtZWJ1ZmZlci53aWR0aFxuICAgICAgcmVnbEZyYW1lYnVmZmVyLmhlaWdodCA9IGZyYW1lYnVmZmVyLmhlaWdodFxuXG4gICAgICByZXR1cm4gcmVnbEZyYW1lYnVmZmVyXG4gICAgfVxuXG4gICAgcmVnbEZyYW1lYnVmZmVyKG9wdGlvbnMpXG5cbiAgICByZWdsRnJhbWVidWZmZXIuX3JlZ2xUeXBlID0gJ2ZyYW1lYnVmZmVyJ1xuICAgIHJlZ2xGcmFtZWJ1ZmZlci5fZnJhbWVidWZmZXIgPSBmcmFtZWJ1ZmZlclxuICAgIHJlZ2xGcmFtZWJ1ZmZlci5fZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIGRlc3Ryb3koZnJhbWVidWZmZXIpXG4gICAgfVxuXG4gICAgcmV0dXJuIHJlZ2xGcmFtZWJ1ZmZlclxuICB9XG5cbiAgZnVuY3Rpb24gcmVmcmVzaENhY2hlICgpIHtcbiAgICB2YWx1ZXMoZnJhbWVidWZmZXJTZXQpLmZvckVhY2gocmVmcmVzaClcbiAgfVxuXG4gIGZ1bmN0aW9uIGNsZWFyQ2FjaGUgKCkge1xuICAgIHZhbHVlcyhmcmFtZWJ1ZmZlclNldCkuZm9yRWFjaChkZXN0cm95KVxuICB9XG5cbiAgZnVuY3Rpb24gcG9sbCAoKSB7XG4gICAgaWYgKGZyYW1lYnVmZmVyRGlydHkpIHtcbiAgICAgIHZhciB0b3AgPSBmcmFtZWJ1ZmZlclN0YWNrW2ZyYW1lYnVmZmVyU3RhY2subGVuZ3RoIC0gMV1cbiAgICAgIHZhciBleHRfZHJhd2J1ZmZlcnMgPSBleHRlbnNpb25zLndlYmdsX2RyYXdfYnVmZmVyc1xuXG4gICAgICBpZiAodG9wKSB7XG4gICAgICAgIGdsLmJpbmRGcmFtZWJ1ZmZlcihHTF9GUkFNRUJVRkZFUiwgdG9wLmZyYW1lYnVmZmVyKVxuICAgICAgICBpZiAoZXh0X2RyYXdidWZmZXJzKSB7XG4gICAgICAgICAgZXh0X2RyYXdidWZmZXJzLmRyYXdCdWZmZXJzV0VCR0woRFJBV19CVUZGRVJTW3RvcC5jb2xvckF0dGFjaG1lbnRzLmxlbmd0aF0pXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGdsLmJpbmRGcmFtZWJ1ZmZlcihHTF9GUkFNRUJVRkZFUiwgbnVsbClcbiAgICAgICAgaWYgKGV4dF9kcmF3YnVmZmVycykge1xuICAgICAgICAgIGV4dF9kcmF3YnVmZmVycy5kcmF3QnVmZmVyc1dFQkdMKEJBQ0tfQlVGRkVSKVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGZyYW1lYnVmZmVyRGlydHkgPSBmYWxzZVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGN1cnJlbnRGcmFtZWJ1ZmZlciAoKSB7XG4gICAgcmV0dXJuIGZyYW1lYnVmZmVyU3RhY2tbZnJhbWVidWZmZXJTdGFjay5sZW5ndGggLSAxXVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICB0b3A6IGN1cnJlbnRGcmFtZWJ1ZmZlcixcbiAgICBkaXJ0eTogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIGZyYW1lYnVmZmVyRGlydHlcbiAgICB9LFxuICAgIHB1c2g6IGZ1bmN0aW9uIChuZXh0Xykge1xuICAgICAgdmFyIG5leHQgPSBuZXh0XyB8fCBudWxsXG4gICAgICBmcmFtZWJ1ZmZlckRpcnR5ID0gZnJhbWVidWZmZXJEaXJ0eSB8fCAobmV4dCAhPT0gY3VycmVudEZyYW1lYnVmZmVyKCkpXG4gICAgICBmcmFtZWJ1ZmZlclN0YWNrLnB1c2gobmV4dClcbiAgICAgIHJldHVybiBmcmFtZWJ1ZmZlckRpcnR5XG4gICAgfSxcbiAgICBwb3A6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBwcmV2ID0gY3VycmVudEZyYW1lYnVmZmVyKClcbiAgICAgIGZyYW1lYnVmZmVyU3RhY2sucG9wKClcbiAgICAgIGZyYW1lYnVmZmVyRGlydHkgPSBmcmFtZWJ1ZmZlckRpcnR5IHx8IChwcmV2ICE9PSBjdXJyZW50RnJhbWVidWZmZXIoKSlcbiAgICAgIHJldHVybiBmcmFtZWJ1ZmZlckRpcnR5XG4gICAgfSxcbiAgICBnZXRGcmFtZWJ1ZmZlcjogZnVuY3Rpb24gKG9iamVjdCkge1xuICAgICAgaWYgKHR5cGVvZiBvYmplY3QgPT09ICdmdW5jdGlvbicgJiYgb2JqZWN0Ll9yZWdsVHlwZSA9PT0gJ2ZyYW1lYnVmZmVyJykge1xuICAgICAgICB2YXIgZmJvID0gb2JqZWN0Ll9mcmFtZWJ1ZmZlclxuICAgICAgICBpZiAoZmJvIGluc3RhbmNlb2YgUkVHTEZyYW1lYnVmZmVyKSB7XG4gICAgICAgICAgcmV0dXJuIGZib1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH0sXG4gICAgcG9sbDogcG9sbCxcbiAgICBjcmVhdGU6IGNyZWF0ZUZCTyxcbiAgICBjbGVhcjogY2xlYXJDYWNoZSxcbiAgICByZWZyZXNoOiByZWZyZXNoQ2FjaGVcbiAgfVxufVxuIiwidmFyIGlzVHlwZWRBcnJheSA9IHJlcXVpcmUoJy4vaXMtdHlwZWQtYXJyYXknKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGlzTkRBcnJheUxpa2UgKG9iaikge1xuICByZXR1cm4gKFxuICAgIHR5cGVvZiBvYmogPT09ICdvYmplY3QnICYmXG4gICAgQXJyYXkuaXNBcnJheShvYmouc2hhcGUpICYmXG4gICAgQXJyYXkuaXNBcnJheShvYmouc3RyaWRlKSAmJlxuICAgIHR5cGVvZiBvYmoub2Zmc2V0ID09PSAnbnVtYmVyJyAmJlxuICAgIG9iai5zaGFwZS5sZW5ndGggPT09IG9iai5zdHJpZGUubGVuZ3RoICYmXG4gICAgKEFycmF5LmlzQXJyYXkob2JqLmRhdGEpIHx8XG4gICAgICBpc1R5cGVkQXJyYXkob2JqLmRhdGEpKSlcbn1cbiIsInZhciBkdHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9hcnJheXR5cGVzLmpzb24nKVxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoeCkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHgpIGluIGR0eXBlc1xufVxuIiwidmFyIEdMX1NVQlBJWEVMX0JJVFMgPSAweDBENTBcbnZhciBHTF9SRURfQklUUyA9IDB4MEQ1MlxudmFyIEdMX0dSRUVOX0JJVFMgPSAweDBENTNcbnZhciBHTF9CTFVFX0JJVFMgPSAweDBENTRcbnZhciBHTF9BTFBIQV9CSVRTID0gMHgwRDU1XG52YXIgR0xfREVQVEhfQklUUyA9IDB4MEQ1NlxudmFyIEdMX1NURU5DSUxfQklUUyA9IDB4MEQ1N1xuXG52YXIgR0xfQUxJQVNFRF9QT0lOVF9TSVpFX1JBTkdFID0gMHg4NDZEXG52YXIgR0xfQUxJQVNFRF9MSU5FX1dJRFRIX1JBTkdFID0gMHg4NDZFXG5cbnZhciBHTF9NQVhfVEVYVFVSRV9TSVpFID0gMHgwRDMzXG52YXIgR0xfTUFYX1ZJRVdQT1JUX0RJTVMgPSAweDBEM0FcbnZhciBHTF9NQVhfVkVSVEVYX0FUVFJJQlMgPSAweDg4NjlcbnZhciBHTF9NQVhfVkVSVEVYX1VOSUZPUk1fVkVDVE9SUyA9IDB4OERGQlxudmFyIEdMX01BWF9WQVJZSU5HX1ZFQ1RPUlMgPSAweDhERkNcbnZhciBHTF9NQVhfQ09NQklORURfVEVYVFVSRV9JTUFHRV9VTklUUyA9IDB4OEI0RFxudmFyIEdMX01BWF9WRVJURVhfVEVYVFVSRV9JTUFHRV9VTklUUyA9IDB4OEI0Q1xudmFyIEdMX01BWF9URVhUVVJFX0lNQUdFX1VOSVRTID0gMHg4ODcyXG52YXIgR0xfTUFYX0ZSQUdNRU5UX1VOSUZPUk1fVkVDVE9SUyA9IDB4OERGRFxudmFyIEdMX01BWF9DVUJFX01BUF9URVhUVVJFX1NJWkUgPSAweDg1MUNcbnZhciBHTF9NQVhfUkVOREVSQlVGRkVSX1NJWkUgPSAweDg0RThcblxudmFyIEdMX1ZFTkRPUiA9IDB4MUYwMFxudmFyIEdMX1JFTkRFUkVSID0gMHgxRjAxXG52YXIgR0xfVkVSU0lPTiA9IDB4MUYwMlxudmFyIEdMX1NIQURJTkdfTEFOR1VBR0VfVkVSU0lPTiA9IDB4OEI4Q1xuXG52YXIgR0xfTUFYX1RFWFRVUkVfTUFYX0FOSVNPVFJPUFlfRVhUID0gMHg4NEZGXG5cbnZhciBHTF9NQVhfQ09MT1JfQVRUQUNITUVOVFNfV0VCR0wgPSAweDhDREZcbnZhciBHTF9NQVhfRFJBV19CVUZGRVJTX1dFQkdMID0gMHg4ODI0XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGdsLCBleHRlbnNpb25zKSB7XG4gIHZhciBtYXhBbmlzb3Ryb3BpYyA9IDFcbiAgaWYgKGV4dGVuc2lvbnMuZXh0X3RleHR1cmVfZmlsdGVyX2FuaXNvdHJvcGljKSB7XG4gICAgbWF4QW5pc290cm9waWMgPSBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1RFWFRVUkVfTUFYX0FOSVNPVFJPUFlfRVhUKVxuICB9XG5cbiAgdmFyIG1heERyYXdidWZmZXJzID0gMVxuICB2YXIgbWF4Q29sb3JBdHRhY2htZW50cyA9IDFcbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfZHJhd19idWZmZXJzKSB7XG4gICAgbWF4RHJhd2J1ZmZlcnMgPSBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0RSQVdfQlVGRkVSU19XRUJHTClcbiAgICBtYXhDb2xvckF0dGFjaG1lbnRzID0gZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9DT0xPUl9BVFRBQ0hNRU5UU19XRUJHTClcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgLy8gZHJhd2luZyBidWZmZXIgYml0IGRlcHRoXG4gICAgY29sb3JCaXRzOiBbXG4gICAgICBnbC5nZXRQYXJhbWV0ZXIoR0xfUkVEX0JJVFMpLFxuICAgICAgZ2wuZ2V0UGFyYW1ldGVyKEdMX0dSRUVOX0JJVFMpLFxuICAgICAgZ2wuZ2V0UGFyYW1ldGVyKEdMX0JMVUVfQklUUyksXG4gICAgICBnbC5nZXRQYXJhbWV0ZXIoR0xfQUxQSEFfQklUUylcbiAgICBdLFxuICAgIGRlcHRoQml0czogZ2wuZ2V0UGFyYW1ldGVyKEdMX0RFUFRIX0JJVFMpLFxuICAgIHN0ZW5jaWxCaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfU1RFTkNJTF9CSVRTKSxcbiAgICBzdWJwaXhlbEJpdHM6IGdsLmdldFBhcmFtZXRlcihHTF9TVUJQSVhFTF9CSVRTKSxcblxuICAgIC8vIHN1cHBvcnRlZCBleHRlbnNpb25zXG4gICAgZXh0ZW5zaW9uczogT2JqZWN0LmtleXMoZXh0ZW5zaW9ucykuZmlsdGVyKGZ1bmN0aW9uIChleHQpIHtcbiAgICAgIHJldHVybiAhIWV4dGVuc2lvbnNbZXh0XVxuICAgIH0pLFxuXG4gICAgLy8gbWF4IGFuaXNvIHNhbXBsZXNcbiAgICBtYXhBbmlzb3Ryb3BpYzogbWF4QW5pc290cm9waWMsXG5cbiAgICAvLyBtYXggZHJhdyBidWZmZXJzXG4gICAgbWF4RHJhd2J1ZmZlcnM6IG1heERyYXdidWZmZXJzLFxuICAgIG1heENvbG9yQXR0YWNobWVudHM6IG1heENvbG9yQXR0YWNobWVudHMsXG5cbiAgICAvLyBwb2ludCBhbmQgbGluZSBzaXplIHJhbmdlc1xuICAgIHBvaW50U2l6ZURpbXM6IGdsLmdldFBhcmFtZXRlcihHTF9BTElBU0VEX1BPSU5UX1NJWkVfUkFOR0UpLFxuICAgIGxpbmVXaWR0aERpbXM6IGdsLmdldFBhcmFtZXRlcihHTF9BTElBU0VEX0xJTkVfV0lEVEhfUkFOR0UpLFxuICAgIG1heFZpZXdwb3J0RGltczogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9WSUVXUE9SVF9ESU1TKSxcbiAgICBtYXhDb21iaW5lZFRleHR1cmVVbml0czogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9DT01CSU5FRF9URVhUVVJFX0lNQUdFX1VOSVRTKSxcbiAgICBtYXhDdWJlTWFwU2l6ZTogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9DVUJFX01BUF9URVhUVVJFX1NJWkUpLFxuICAgIG1heFJlbmRlcmJ1ZmZlclNpemU6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfUkVOREVSQlVGRkVSX1NJWkUpLFxuICAgIG1heFRleHR1cmVVbml0czogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9URVhUVVJFX0lNQUdFX1VOSVRTKSxcbiAgICBtYXhUZXh0dXJlU2l6ZTogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9URVhUVVJFX1NJWkUpLFxuICAgIG1heEF0dHJpYnV0ZXM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVkVSVEVYX0FUVFJJQlMpLFxuICAgIG1heFZlcnRleFVuaWZvcm1zOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1ZFUlRFWF9VTklGT1JNX1ZFQ1RPUlMpLFxuICAgIG1heFZlcnRleFRleHR1cmVVbml0czogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9WRVJURVhfVEVYVFVSRV9JTUFHRV9VTklUUyksXG4gICAgbWF4VmFyeWluZ1ZlY3RvcnM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVkFSWUlOR19WRUNUT1JTKSxcbiAgICBtYXhGcmFnbWVudFVuaWZvcm1zOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0ZSQUdNRU5UX1VOSUZPUk1fVkVDVE9SUyksXG5cbiAgICAvLyB2ZW5kb3IgaW5mb1xuICAgIGdsc2w6IGdsLmdldFBhcmFtZXRlcihHTF9TSEFESU5HX0xBTkdVQUdFX1ZFUlNJT04pLFxuICAgIHJlbmRlcmVyOiBnbC5nZXRQYXJhbWV0ZXIoR0xfUkVOREVSRVIpLFxuICAgIHZlbmRvcjogZ2wuZ2V0UGFyYW1ldGVyKEdMX1ZFTkRPUiksXG4gICAgdmVyc2lvbjogZ2wuZ2V0UGFyYW1ldGVyKEdMX1ZFUlNJT04pXG4gIH1cbn1cbiIsIi8qIGdsb2JhbHMgZG9jdW1lbnQsIEltYWdlLCBYTUxIdHRwUmVxdWVzdCAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGxvYWRUZXh0dXJlXG5cbmZ1bmN0aW9uIGdldEV4dGVuc2lvbiAodXJsKSB7XG4gIHZhciBwYXJ0cyA9IC9cXC4oXFx3KykoXFw/LiopPyQvLmV4ZWModXJsKVxuICBpZiAocGFydHMgJiYgcGFydHNbMV0pIHtcbiAgICByZXR1cm4gcGFydHNbMV0udG9Mb3dlckNhc2UoKVxuICB9XG59XG5cbmZ1bmN0aW9uIGlzVmlkZW9FeHRlbnNpb24gKHVybCkge1xuICByZXR1cm4gW1xuICAgICdhdmknLFxuICAgICdhc2YnLFxuICAgICdnaWZ2JyxcbiAgICAnbW92JyxcbiAgICAncXQnLFxuICAgICd5dXYnLFxuICAgICdtcGcnLFxuICAgICdtcGVnJyxcbiAgICAnbTJ2JyxcbiAgICAnbXA0JyxcbiAgICAnbTRwJyxcbiAgICAnbTR2JyxcbiAgICAnb2dnJyxcbiAgICAnb2d2JyxcbiAgICAndm9iJyxcbiAgICAnd2VibScsXG4gICAgJ3dtdidcbiAgXS5pbmRleE9mKHVybCkgPj0gMFxufVxuXG5mdW5jdGlvbiBpc0NvbXByZXNzZWRFeHRlbnNpb24gKHVybCkge1xuICByZXR1cm4gW1xuICAgICdkZHMnXG4gIF0uaW5kZXhPZih1cmwpID49IDBcbn1cblxuZnVuY3Rpb24gbG9hZFZpZGVvICh1cmwsIGNyb3NzT3JpZ2luKSB7XG4gIHZhciB2aWRlbyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3ZpZGVvJylcbiAgdmlkZW8uYXV0b3BsYXkgPSB0cnVlXG4gIHZpZGVvLmxvb3AgPSB0cnVlXG4gIGlmIChjcm9zc09yaWdpbikge1xuICAgIHZpZGVvLmNyb3NzT3JpZ2luID0gY3Jvc3NPcmlnaW5cbiAgfVxuICB2aWRlby5zcmMgPSB1cmxcbiAgcmV0dXJuIHZpZGVvXG59XG5cbmZ1bmN0aW9uIGxvYWRDb21wcmVzc2VkVGV4dHVyZSAodXJsLCBleHQsIGNyb3NzT3JpZ2luKSB7XG4gIHZhciB4aHIgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKVxuICB4aHIucmVzcG9uc2VUeXBlID0gJ2FycmF5YnVmZmVyJ1xuICB4aHIub3BlbignR0VUJywgdXJsLCB0cnVlKVxuICB4aHIuc2VuZCgpXG4gIHJldHVybiB4aHJcbn1cblxuZnVuY3Rpb24gbG9hZEltYWdlICh1cmwsIGNyb3NzT3JpZ2luKSB7XG4gIHZhciBpbWFnZSA9IG5ldyBJbWFnZSgpXG4gIGlmIChjcm9zc09yaWdpbikge1xuICAgIGltYWdlLmNyb3NzT3JpZ2luID0gY3Jvc3NPcmlnaW5cbiAgfVxuICBpbWFnZS5zcmMgPSB1cmxcbiAgcmV0dXJuIGltYWdlXG59XG5cbi8vIEN1cnJlbnRseSB0aGlzIHN0dWZmIG9ubHkgd29ya3MgaW4gYSBET00gZW52aXJvbm1lbnRcbmZ1bmN0aW9uIGxvYWRUZXh0dXJlICh1cmwsIGNyb3NzT3JpZ2luKSB7XG4gIGlmICh0eXBlb2YgZG9jdW1lbnQgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgdmFyIGV4dCA9IGdldEV4dGVuc2lvbih1cmwpXG4gICAgaWYgKGlzVmlkZW9FeHRlbnNpb24oZXh0KSkge1xuICAgICAgcmV0dXJuIGxvYWRWaWRlbyh1cmwsIGNyb3NzT3JpZ2luKVxuICAgIH1cbiAgICBpZiAoaXNDb21wcmVzc2VkRXh0ZW5zaW9uKGV4dCkpIHtcbiAgICAgIHJldHVybiBsb2FkQ29tcHJlc3NlZFRleHR1cmUodXJsLCBleHQsIGNyb3NzT3JpZ2luKVxuICAgIH1cbiAgICByZXR1cm4gbG9hZEltYWdlKHVybCwgY3Jvc3NPcmlnaW4pXG4gIH1cbiAgcmV0dXJuIG51bGxcbn1cbiIsIi8vIFJlZmVyZW5jZXM6XG4vL1xuLy8gaHR0cDovL21zZG4ubWljcm9zb2Z0LmNvbS9lbi11cy9saWJyYXJ5L2JiOTQzOTkxLmFzcHgvXG4vLyBodHRwOi8vYmxvZy50b2ppY29kZS5jb20vMjAxMS8xMi9jb21wcmVzc2VkLXRleHR1cmVzLWluLXdlYmdsLmh0bWxcbi8vXG52YXIgY2hlY2sgPSByZXF1aXJlKCcuL2NoZWNrJylcblxubW9kdWxlLmV4cG9ydHMgPSBwYXJzZUREU1xuXG52YXIgRERTX01BR0lDID0gMHgyMDUzNDQ0NFxuXG52YXIgR0xfVEVYVFVSRV8yRCA9IDB4MERFMVxudmFyIEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCA9IDB4ODUxNVxuXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfUzNUQ19EWFQxX0VYVCA9IDB4ODNGMFxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDFfRVhUID0gMHg4M0YxXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUM19FWFQgPSAweDgzRjJcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQ1X0VYVCA9IDB4ODNGM1xuXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfRVRDMV9XRUJHTCA9IDB4OEQ2NFxuXG52YXIgR0xfVU5TSUdORURfQllURSA9IDB4MTQwMVxuLy8gdmFyIEdMX0hBTEZfRkxPQVRfT0VTID0gMHg4RDYxXG4vLyB2YXIgR0xfRkxPQVQgPSAweDE0MDZcblxudmFyIEREU0RfTUlQTUFQQ09VTlQgPSAweDIwMDAwXG5cbnZhciBERFNDQVBTMl9DVUJFTUFQID0gMHgyMDBcbnZhciBERFNDQVBTMl9DVUJFTUFQX1BPU0lUSVZFWCA9IDB4NDAwXG52YXIgRERTQ0FQUzJfQ1VCRU1BUF9ORUdBVElWRVggPSAweDgwMFxudmFyIEREU0NBUFMyX0NVQkVNQVBfUE9TSVRJVkVZID0gMHgxMDAwXG52YXIgRERTQ0FQUzJfQ1VCRU1BUF9ORUdBVElWRVkgPSAweDIwMDBcbnZhciBERFNDQVBTMl9DVUJFTUFQX1BPU0lUSVZFWiA9IDB4NDAwMFxudmFyIEREU0NBUFMyX0NVQkVNQVBfTkVHQVRJVkVaID0gMHg4MDAwXG5cbnZhciBDVUJFTUFQX0NPTVBMRVRFX0ZBQ0VTID0gKFxuICBERFNDQVBTMl9DVUJFTUFQX1BPU0lUSVZFWCB8XG4gIEREU0NBUFMyX0NVQkVNQVBfTkVHQVRJVkVYIHxcbiAgRERTQ0FQUzJfQ1VCRU1BUF9QT1NJVElWRVkgfFxuICBERFNDQVBTMl9DVUJFTUFQX05FR0FUSVZFWSB8XG4gIEREU0NBUFMyX0NVQkVNQVBfUE9TSVRJVkVaIHxcbiAgRERTQ0FQUzJfQ1VCRU1BUF9ORUdBVElWRVopXG5cbnZhciBERFBGX0ZPVVJDQyA9IDB4NFxudmFyIEREUEZfUkdCID0gMHg0MFxuXG52YXIgRk9VUkNDX0RYVDEgPSAweDMxNTQ1ODQ0XG52YXIgRk9VUkNDX0RYVDMgPSAweDMzNTQ1ODQ0XG52YXIgRk9VUkNDX0RYVDUgPSAweDM1NTQ1ODQ0XG52YXIgRk9VUkNDX0VUQzEgPSAweDMxNDM1NDQ1XG5cbi8vIEREU19IRUFERVIge1xudmFyIE9GRl9TSVpFID0gMSAgICAgICAgLy8gaW50MzIgZHdTaXplXG52YXIgT0ZGX0ZMQUdTID0gMiAgICAgICAvLyBpbnQzMiBkd0ZsYWdzXG52YXIgT0ZGX0hFSUdIVCA9IDMgICAgICAvLyBpbnQzMiBkd0hlaWdodFxudmFyIE9GRl9XSURUSCA9IDQgICAgICAgLy8gaW50MzIgZHdXaWR0aFxuLy8gdmFyIE9GRl9QSVRDSCA9IDUgICAgICAgLy8gaW50MzIgZHdQaXRjaE9yTGluZWFyU2l6ZVxuLy8gdmFyIE9GRl9ERVBUSCA9IDYgICAgICAgLy8gaW50MzIgZHdEZXB0aFxudmFyIE9GRl9NSVBNQVAgPSA3ICAgICAgLy8gaW50MzIgZHdNaXBNYXBDb3VudDsgLy8gb2Zmc2V0OiA3XG4vLyBpbnQzMlsxMV0gZHdSZXNlcnZlZDFcbi8vIEREU19QSVhFTEZPUk1BVCB7XG4vLyB2YXIgT0ZGX1BGX1NJWkUgPSAxOSAgICAvLyBpbnQzMiBkd1NpemU7IC8vIG9mZnNldDogMTlcbnZhciBPRkZfUEZfRkxBR1MgPSAyMCAgIC8vIGludDMyIGR3RmxhZ3NcbnZhciBPRkZfRk9VUkNDID0gMjEgICAgIC8vIGNoYXJbNF0gZHdGb3VyQ0Ncbi8vIHZhciBPRkZfUkdCQV9CSVRTID0gMjIgIC8vIGludDMyIGR3UkdCQml0Q291bnRcbi8vIHZhciBPRkZfUkVEX01BU0sgPSAyMyAgIC8vIGludDMyIGR3UkJpdE1hc2tcbi8vIHZhciBPRkZfR1JFRU5fTUFTSyA9IDI0IC8vIGludDMyIGR3R0JpdE1hc2tcbi8vIHZhciBPRkZfQkxVRV9NQVNLID0gMjUgIC8vIGludDMyIGR3QkJpdE1hc2tcbi8vIHZhciBPRkZfQUxQSEFfTUFTSyA9IDI2IC8vIGludDMyIGR3QUJpdE1hc2s7IC8vIG9mZnNldDogMjZcbi8vIH1cbi8vIHZhciBPRkZfQ0FQUyA9IDI3ICAgICAgIC8vIGludDMyIGR3Q2FwczsgLy8gb2Zmc2V0OiAyN1xudmFyIE9GRl9DQVBTMiA9IDI4ICAgICAgLy8gaW50MzIgZHdDYXBzMlxuLy8gdmFyIE9GRl9DQVBTMyA9IDI5ICAgICAgLy8gaW50MzIgZHdDYXBzM1xuLy8gdmFyIE9GRl9DQVBTNCA9IDMwICAgICAgLy8gaW50MzIgZHdDYXBzNFxuLy8gaW50MzIgZHdSZXNlcnZlZDIgLy8gb2Zmc2V0IDMxXG5cbmZ1bmN0aW9uIHBhcnNlRERTIChhcnJheUJ1ZmZlcikge1xuICB2YXIgaGVhZGVyID0gbmV3IEludDMyQXJyYXkoYXJyYXlCdWZmZXIpXG4gIGNoZWNrKGhlYWRlclswXSA9PT0gRERTX01BR0lDLFxuICAgICdpbnZhbGlkIG1hZ2ljIG51bWJlciBmb3IgZGRzIGhlYWRlcicpXG5cbiAgdmFyIGZsYWdzID0gaGVhZGVyW09GRl9GTEFHU11cbiAgY2hlY2soZmxhZ3MgJiBERFBGX0ZPVVJDQyxcbiAgICAndW5zdXBwb3J0ZWQgZGRzIGZvcm1hdCcpXG5cbiAgdmFyIHdpZHRoID0gaGVhZGVyW09GRl9XSURUSF1cbiAgdmFyIGhlaWdodCA9IGhlYWRlcltPRkZfSEVJR0hUXVxuXG4gIHZhciB0eXBlID0gR0xfVU5TSUdORURfQllURVxuICB2YXIgZm9ybWF0ID0gMFxuICB2YXIgYmxvY2tCeXRlcyA9IDBcbiAgdmFyIGNoYW5uZWxzID0gNFxuICBzd2l0Y2ggKGhlYWRlcltPRkZfRk9VUkNDXSkge1xuICAgIGNhc2UgRk9VUkNDX0RYVDE6XG4gICAgICBibG9ja0J5dGVzID0gOFxuICAgICAgaWYgKGZsYWdzICYgRERQRl9SR0IpIHtcbiAgICAgICAgY2hhbm5lbHMgPSAzXG4gICAgICAgIGZvcm1hdCA9IEdMX0NPTVBSRVNTRURfUkdCX1MzVENfRFhUMV9FWFRcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGZvcm1hdCA9IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDFfRVhUXG4gICAgICB9XG4gICAgICBicmVha1xuXG4gICAgY2FzZSBGT1VSQ0NfRFhUMzpcbiAgICAgIGJsb2NrQnl0ZXMgPSAxNlxuICAgICAgZm9ybWF0ID0gR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUM19FWFRcbiAgICAgIGJyZWFrXG5cbiAgICBjYXNlIEZPVVJDQ19EWFQ1OlxuICAgICAgYmxvY2tCeXRlcyA9IDE2XG4gICAgICBmb3JtYXQgPSBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQ1X0VYVFxuICAgICAgYnJlYWtcblxuICAgIGNhc2UgRk9VUkNDX0VUQzE6XG4gICAgICBibG9ja0J5dGVzID0gOFxuICAgICAgZm9ybWF0ID0gR0xfQ09NUFJFU1NFRF9SR0JfRVRDMV9XRUJHTFxuICAgICAgYnJlYWtcblxuICAgIC8vIFRPRE86IEltcGxlbWVudCBoZHIgYW5kIHVuY29tcHJlc3NlZCB0ZXh0dXJlc1xuXG4gICAgZGVmYXVsdDpcbiAgICAgIC8vIEhhbmRsZSB1bmNvbXByZXNzZWQgZGF0YSBoZXJlXG4gICAgICBjaGVjay5yYWlzZSgndW5zdXBwb3J0ZWQgZGRzIHRleHR1cmUgZm9ybWF0JylcbiAgfVxuXG4gIHZhciBwaXhlbEZsYWdzID0gaGVhZGVyW09GRl9QRl9GTEFHU11cblxuICB2YXIgbWlwbWFwQ291bnQgPSAxXG4gIGlmIChwaXhlbEZsYWdzICYgRERTRF9NSVBNQVBDT1VOVCkge1xuICAgIG1pcG1hcENvdW50ID0gTWF0aC5tYXgoMSwgaGVhZGVyW09GRl9NSVBNQVBdKVxuICB9XG5cbiAgdmFyIHB0ciA9IGhlYWRlcltPRkZfU0laRV0gKyA0XG5cbiAgdmFyIHJlc3VsdCA9IHtcbiAgICB3aWR0aDogd2lkdGgsXG4gICAgaGVpZ2h0OiBoZWlnaHQsXG4gICAgY2hhbm5lbHM6IGNoYW5uZWxzLFxuICAgIGZvcm1hdDogZm9ybWF0LFxuICAgIHR5cGU6IHR5cGUsXG4gICAgY29tcHJlc3NlZDogdHJ1ZSxcbiAgICBjdWJlOiBmYWxzZSxcbiAgICBwaXhlbHM6IFtdXG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZU1pcHMgKHRhcmdldCkge1xuICAgIHZhciBtaXBXaWR0aCA9IHdpZHRoXG4gICAgdmFyIG1pcEhlaWdodCA9IGhlaWdodFxuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBtaXBtYXBDb3VudDsgKytpKSB7XG4gICAgICB2YXIgc2l6ZSA9XG4gICAgICAgIE1hdGgubWF4KDEsIChtaXBXaWR0aCArIDMpID4+IDIpICpcbiAgICAgICAgTWF0aC5tYXgoMSwgKG1pcEhlaWdodCArIDMpID4+IDIpICpcbiAgICAgICAgYmxvY2tCeXRlc1xuICAgICAgcmVzdWx0LnBpeGVscy5wdXNoKHtcbiAgICAgICAgdGFyZ2V0OiB0YXJnZXQsXG4gICAgICAgIG1pcGxldmVsOiBpLFxuICAgICAgICB3aWR0aDogbWlwV2lkdGgsXG4gICAgICAgIGhlaWdodDogbWlwSGVpZ2h0LFxuICAgICAgICBkYXRhOiBuZXcgVWludDhBcnJheShhcnJheUJ1ZmZlciwgcHRyLCBzaXplKVxuICAgICAgfSlcbiAgICAgIHB0ciArPSBzaXplXG4gICAgICBtaXBXaWR0aCA+Pj0gMVxuICAgICAgbWlwSGVpZ2h0ID4+PSAxXG4gICAgfVxuICB9XG5cbiAgdmFyIGNhcHMyID0gaGVhZGVyW09GRl9DQVBTMl1cbiAgdmFyIGN1YmVtYXAgPSAhIShjYXBzMiAmIEREU0NBUFMyX0NVQkVNQVApXG4gIGlmIChjdWJlbWFwKSB7XG4gICAgY2hlY2soXG4gICAgICAoY2FwczIgJiBDVUJFTUFQX0NPTVBMRVRFX0ZBQ0VTKSA9PT0gQ1VCRU1BUF9DT01QTEVURV9GQUNFUyxcbiAgICAgICdtaXNzaW5nIGN1YmVtYXAgZmFjZXMnKVxuICAgIHJlc3VsdC5jdWJlID0gdHJ1ZVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICBwYXJzZU1pcHMoR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YICsgaSlcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgcGFyc2VNaXBzKEdMX1RFWFRVUkVfMkQpXG4gIH1cblxuICByZXR1cm4gcmVzdWx0XG59XG4iLCIvKiBnbG9iYWxzIHJlcXVlc3RBbmltYXRpb25GcmFtZSwgY2FuY2VsQW5pbWF0aW9uRnJhbWUgKi9cbmlmICh0eXBlb2YgcmVxdWVzdEFuaW1hdGlvbkZyYW1lID09PSAnZnVuY3Rpb24nICYmXG4gICAgdHlwZW9mIGNhbmNlbEFuaW1hdGlvbkZyYW1lID09PSAnZnVuY3Rpb24nKSB7XG4gIG1vZHVsZS5leHBvcnRzID0ge1xuICAgIG5leHQ6IGZ1bmN0aW9uICh4KSB7IHJldHVybiByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoeCkgfSxcbiAgICBjYW5jZWw6IGZ1bmN0aW9uICh4KSB7IHJldHVybiBjYW5jZWxBbmltYXRpb25GcmFtZSh4KSB9XG4gIH1cbn0gZWxzZSB7XG4gIG1vZHVsZS5leHBvcnRzID0ge1xuICAgIG5leHQ6IGZ1bmN0aW9uIChjYikge1xuICAgICAgc2V0VGltZW91dChjYiwgMzApXG4gICAgfSxcbiAgICBjYW5jZWw6IGNsZWFyVGltZW91dFxuICB9XG59XG4iLCJ2YXIgY2hlY2sgPSByZXF1aXJlKCcuL2NoZWNrJylcbnZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL2lzLXR5cGVkLWFycmF5JylcblxudmFyIEdMX1JHQkEgPSA2NDA4XG52YXIgR0xfVU5TSUdORURfQllURSA9IDUxMjFcbnZhciBHTF9QQUNLX0FMSUdOTUVOVCA9IDB4MEQwNVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBSZWFkUGl4ZWxzIChnbCwgcmVnbFBvbGwsIHZpZXdwb3J0U3RhdGUpIHtcbiAgZnVuY3Rpb24gcmVhZFBpeGVscyAoaW5wdXQpIHtcbiAgICB2YXIgb3B0aW9ucyA9IGlucHV0IHx8IHt9XG4gICAgaWYgKGlzVHlwZWRBcnJheShpbnB1dCkpIHtcbiAgICAgIG9wdGlvbnMgPSB7XG4gICAgICAgIGRhdGE6IG9wdGlvbnNcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDIpIHtcbiAgICAgIG9wdGlvbnMgPSB7XG4gICAgICAgIHdpZHRoOiBhcmd1bWVudHNbMF0gfCAwLFxuICAgICAgICBoZWlnaHQ6IGFyZ3VtZW50c1sxXSB8IDBcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBpbnB1dCAhPT0gJ29iamVjdCcpIHtcbiAgICAgIG9wdGlvbnMgPSB7fVxuICAgIH1cblxuICAgIC8vIFVwZGF0ZSBXZWJHTCBzdGF0ZVxuICAgIHJlZ2xQb2xsKClcblxuICAgIC8vIFJlYWQgdmlld3BvcnQgc3RhdGVcbiAgICB2YXIgeCA9IG9wdGlvbnMueCB8fCAwXG4gICAgdmFyIHkgPSBvcHRpb25zLnkgfHwgMFxuICAgIHZhciB3aWR0aCA9IG9wdGlvbnMud2lkdGggfHwgdmlld3BvcnRTdGF0ZS53aWR0aFxuICAgIHZhciBoZWlnaHQgPSBvcHRpb25zLmhlaWdodCB8fCB2aWV3cG9ydFN0YXRlLmhlaWdodFxuXG4gICAgLy8gQ29tcHV0ZSBzaXplXG4gICAgdmFyIHNpemUgPSB3aWR0aCAqIGhlaWdodCAqIDRcblxuICAgIC8vIEFsbG9jYXRlIGRhdGFcbiAgICB2YXIgZGF0YSA9IG9wdGlvbnMuZGF0YSB8fCBuZXcgVWludDhBcnJheShzaXplKVxuXG4gICAgLy8gVHlwZSBjaGVja1xuICAgIGNoZWNrLmlzVHlwZWRBcnJheShkYXRhKVxuICAgIGNoZWNrKGRhdGEuYnl0ZUxlbmd0aCA+PSBzaXplLCAnZGF0YSBidWZmZXIgdG9vIHNtYWxsJylcblxuICAgIC8vIFJ1biByZWFkIHBpeGVsc1xuICAgIGdsLnBpeGVsU3RvcmVpKEdMX1BBQ0tfQUxJR05NRU5ULCA0KVxuICAgIGdsLnJlYWRQaXhlbHMoeCwgeSwgd2lkdGgsIGhlaWdodCwgR0xfUkdCQSwgR0xfVU5TSUdORURfQllURSwgZGF0YSlcblxuICAgIHJldHVybiBkYXRhXG4gIH1cblxuICByZXR1cm4gcmVhZFBpeGVsc1xufVxuIiwidmFyIGNoZWNrID0gcmVxdWlyZSgnLi9jaGVjaycpXG52YXIgdmFsdWVzID0gcmVxdWlyZSgnLi92YWx1ZXMnKVxuXG52YXIgR0xfUkVOREVSQlVGRkVSID0gMHg4RDQxXG5cbnZhciBHTF9SR0JBNCA9IDB4ODA1NlxudmFyIEdMX1JHQjVfQTEgPSAweDgwNTdcbnZhciBHTF9SR0I1NjUgPSAweDhENjJcbnZhciBHTF9ERVBUSF9DT01QT05FTlQxNiA9IDB4ODFBNVxudmFyIEdMX1NURU5DSUxfSU5ERVg4ID0gMHg4RDQ4XG52YXIgR0xfREVQVEhfU1RFTkNJTCA9IDB4ODRGOVxuXG52YXIgR0xfU1JHQjhfQUxQSEE4X0VYVCA9IDB4OEM0M1xuXG52YXIgR0xfUkdCQTMyRl9FWFQgPSAweDg4MTRcblxudmFyIEdMX1JHQkExNkZfRVhUID0gMHg4ODFBXG52YXIgR0xfUkdCMTZGX0VYVCA9IDB4ODgxQlxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChnbCwgZXh0ZW5zaW9ucywgbGltaXRzKSB7XG4gIHZhciBmb3JtYXRUeXBlcyA9IHtcbiAgICAncmdiYTQnOiBHTF9SR0JBNCxcbiAgICAncmdiNTY1JzogR0xfUkdCNTY1LFxuICAgICdyZ2I1IGExJzogR0xfUkdCNV9BMSxcbiAgICAnZGVwdGgnOiBHTF9ERVBUSF9DT01QT05FTlQxNixcbiAgICAnc3RlbmNpbCc6IEdMX1NURU5DSUxfSU5ERVg4LFxuICAgICdkZXB0aCBzdGVuY2lsJzogR0xfREVQVEhfU1RFTkNJTFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMuZXh0X3NyZ2IpIHtcbiAgICBmb3JtYXRUeXBlc1snc3JnYmEnXSA9IEdMX1NSR0I4X0FMUEhBOF9FWFRcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLmV4dF9jb2xvcl9idWZmZXJfaGFsZl9mbG9hdCkge1xuICAgIGZvcm1hdFR5cGVzWydyZ2JhMTZmJ10gPSBHTF9SR0JBMTZGX0VYVFxuICAgIGZvcm1hdFR5cGVzWydyZ2IxNmYnXSA9IEdMX1JHQjE2Rl9FWFRcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2NvbG9yX2J1ZmZlcl9mbG9hdCkge1xuICAgIGZvcm1hdFR5cGVzWydyZ2JhMzJmJ10gPSBHTF9SR0JBMzJGX0VYVFxuICB9XG5cbiAgdmFyIHJlbmRlcmJ1ZmZlckNvdW50ID0gMFxuICB2YXIgcmVuZGVyYnVmZmVyU2V0ID0ge31cblxuICBmdW5jdGlvbiBSRUdMUmVuZGVyYnVmZmVyICgpIHtcbiAgICB0aGlzLmlkID0gcmVuZGVyYnVmZmVyQ291bnQrK1xuICAgIHRoaXMucmVmQ291bnQgPSAxXG5cbiAgICB0aGlzLnJlbmRlcmJ1ZmZlciA9IG51bGxcblxuICAgIHRoaXMuZm9ybWF0ID0gR0xfUkdCQTRcbiAgICB0aGlzLndpZHRoID0gMFxuICAgIHRoaXMuaGVpZ2h0ID0gMFxuICB9XG5cbiAgUkVHTFJlbmRlcmJ1ZmZlci5wcm90b3R5cGUuZGVjUmVmID0gZnVuY3Rpb24gKCkge1xuICAgIGlmICgtLXRoaXMucmVmQ291bnQgPT09IDApIHtcbiAgICAgIGRlc3Ryb3kodGhpcylcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiByZWZyZXNoIChyYikge1xuICAgIGlmICghZ2wuaXNSZW5kZXJidWZmZXIocmIucmVuZGVyYnVmZmVyKSkge1xuICAgICAgcmIucmVuZGVyYnVmZmVyID0gZ2wuY3JlYXRlUmVuZGVyYnVmZmVyKClcbiAgICB9XG4gICAgZ2wuYmluZFJlbmRlcmJ1ZmZlcihHTF9SRU5ERVJCVUZGRVIsIHJiLnJlbmRlcmJ1ZmZlcilcbiAgICBnbC5yZW5kZXJidWZmZXJTdG9yYWdlKFxuICAgICAgR0xfUkVOREVSQlVGRkVSLFxuICAgICAgcmIuZm9ybWF0LFxuICAgICAgcmIud2lkdGgsXG4gICAgICByYi5oZWlnaHQpXG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95IChyYikge1xuICAgIHZhciBoYW5kbGUgPSByYi5yZW5kZXJidWZmZXJcbiAgICBjaGVjayhoYW5kbGUsICdtdXN0IG5vdCBkb3VibGUgZGVzdHJveSByZW5kZXJidWZmZXInKVxuICAgIGdsLmJpbmRSZW5kZXJidWZmZXIoR0xfUkVOREVSQlVGRkVSLCBudWxsKVxuICAgIGlmIChnbC5pc1JlbmRlcmJ1ZmZlcihoYW5kbGUpKSB7XG4gICAgICBnbC5kZWxldGVSZW5kZXJidWZmZXIoaGFuZGxlKVxuICAgIH1cbiAgICByYi5yZW5kZXJidWZmZXIgPSBudWxsXG4gICAgcmIucmVmQ291bnQgPSAwXG4gICAgZGVsZXRlIHJlbmRlcmJ1ZmZlclNldFtyYi5pZF1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZVJlbmRlcmJ1ZmZlciAoaW5wdXQpIHtcbiAgICB2YXIgcmVuZGVyYnVmZmVyID0gbmV3IFJFR0xSZW5kZXJidWZmZXIoKVxuICAgIHJlbmRlcmJ1ZmZlclNldFtyZW5kZXJidWZmZXIuaWRdID0gcmVuZGVyYnVmZmVyXG5cbiAgICBmdW5jdGlvbiByZWdsUmVuZGVyYnVmZmVyIChpbnB1dCkge1xuICAgICAgdmFyIG9wdGlvbnMgPSBpbnB1dCB8fCB7fVxuXG4gICAgICB2YXIgdyA9IDBcbiAgICAgIHZhciBoID0gMFxuICAgICAgaWYgKCdzaGFwZScgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgc2hhcGUgPSBvcHRpb25zLnNoYXBlXG4gICAgICAgIGNoZWNrKEFycmF5LmlzQXJyYXkoc2hhcGUpICYmIHNoYXBlLmxlbmd0aCA+PSAyLFxuICAgICAgICAgICdpbnZhbGlkIHJlbmRlcmJ1ZmZlciBzaGFwZScpXG4gICAgICAgIHcgPSBzaGFwZVswXSB8IDBcbiAgICAgICAgaCA9IHNoYXBlWzFdIHwgMFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKCdyYWRpdXMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB3ID0gaCA9IG9wdGlvbnMucmFkaXVzIHwgMFxuICAgICAgICB9XG4gICAgICAgIGlmICgnd2lkdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB3ID0gb3B0aW9ucy53aWR0aCB8IDBcbiAgICAgICAgfVxuICAgICAgICBpZiAoJ2hlaWdodCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGggPSBvcHRpb25zLmhlaWdodCB8IDBcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgdmFyIHMgPSBsaW1pdHMubWF4UmVuZGVyYnVmZmVyU2l6ZVxuICAgICAgY2hlY2sodyA+PSAwICYmIGggPj0gMCAmJiB3IDw9IHMgJiYgaCA8PSBzLFxuICAgICAgICAnaW52YWxpZCByZW5kZXJidWZmZXIgc2l6ZScpXG4gICAgICByZWdsUmVuZGVyYnVmZmVyLndpZHRoID0gcmVuZGVyYnVmZmVyLndpZHRoID0gTWF0aC5tYXgodywgMSlcbiAgICAgIHJlZ2xSZW5kZXJidWZmZXIuaGVpZ2h0ID0gcmVuZGVyYnVmZmVyLmhlaWdodCA9IE1hdGgubWF4KGgsIDEpXG5cbiAgICAgIHJlbmRlcmJ1ZmZlci5mb3JtYXQgPSBHTF9SR0JBNFxuICAgICAgaWYgKCdmb3JtYXQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGZvcm1hdCA9IG9wdGlvbnMuZm9ybWF0XG4gICAgICAgIGNoZWNrLnBhcmFtZXRlcihmb3JtYXQsIGZvcm1hdFR5cGVzLCAnaW52YWxpZCByZW5kZXIgYnVmZmVyIGZvcm1hdCcpXG4gICAgICAgIHJlbmRlcmJ1ZmZlci5mb3JtYXQgPSBmb3JtYXRUeXBlc1tmb3JtYXRdXG4gICAgICB9XG5cbiAgICAgIHJlZnJlc2gocmVuZGVyYnVmZmVyKVxuXG4gICAgICByZXR1cm4gcmVnbFJlbmRlcmJ1ZmZlclxuICAgIH1cblxuICAgIHJlZ2xSZW5kZXJidWZmZXIoaW5wdXQpXG5cbiAgICByZWdsUmVuZGVyYnVmZmVyLl9yZWdsVHlwZSA9ICdyZW5kZXJidWZmZXInXG4gICAgcmVnbFJlbmRlcmJ1ZmZlci5fcmVuZGVyYnVmZmVyID0gcmVuZGVyYnVmZmVyXG4gICAgcmVnbFJlbmRlcmJ1ZmZlci5kZXN0cm95ID0gZnVuY3Rpb24gKCkge1xuICAgICAgcmVuZGVyYnVmZmVyLmRlY1JlZigpXG4gICAgfVxuXG4gICAgcmV0dXJuIHJlZ2xSZW5kZXJidWZmZXJcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlZnJlc2hSZW5kZXJidWZmZXJzICgpIHtcbiAgICB2YWx1ZXMocmVuZGVyYnVmZmVyU2V0KS5mb3JFYWNoKHJlZnJlc2gpXG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95UmVuZGVyYnVmZmVycyAoKSB7XG4gICAgdmFsdWVzKHJlbmRlcmJ1ZmZlclNldCkuZm9yRWFjaChkZXN0cm95KVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjcmVhdGU6IGNyZWF0ZVJlbmRlcmJ1ZmZlcixcbiAgICByZWZyZXNoOiByZWZyZXNoUmVuZGVyYnVmZmVycyxcbiAgICBjbGVhcjogZGVzdHJveVJlbmRlcmJ1ZmZlcnNcbiAgfVxufVxuIiwidmFyIGNoZWNrID0gcmVxdWlyZSgnLi9jaGVjaycpXG52YXIgdmFsdWVzID0gcmVxdWlyZSgnLi92YWx1ZXMnKVxuXG52YXIgREVGQVVMVF9GUkFHX1NIQURFUiA9ICd2b2lkIG1haW4oKXtnbF9GcmFnQ29sb3I9dmVjNCgwLDAsMCwwKTt9J1xudmFyIERFRkFVTFRfVkVSVF9TSEFERVIgPSAndm9pZCBtYWluKCl7Z2xfUG9zaXRpb249dmVjNCgwLDAsMCwwKTt9J1xuXG52YXIgR0xfRlJBR01FTlRfU0hBREVSID0gMzU2MzJcbnZhciBHTF9WRVJURVhfU0hBREVSID0gMzU2MzNcblxudmFyIEdMX0FDVElWRV9VTklGT1JNUyA9IDB4OEI4NlxudmFyIEdMX0FDVElWRV9BVFRSSUJVVEVTID0gMHg4Qjg5XG5cbmZ1bmN0aW9uIEFjdGl2ZUluZm8gKG5hbWUsIGxvY2F0aW9uLCBpbmZvKSB7XG4gIHRoaXMubmFtZSA9IG5hbWVcbiAgdGhpcy5sb2NhdGlvbiA9IGxvY2F0aW9uXG4gIHRoaXMuaW5mbyA9IGluZm9cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwU2hhZGVyU3RhdGUgKFxuICBnbCxcbiAgYXR0cmlidXRlU3RhdGUsXG4gIHVuaWZvcm1TdGF0ZSxcbiAgY29tcGlsZVNoYWRlckRyYXcsXG4gIHN0cmluZ1N0b3JlKSB7XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBnbHNsIGNvbXBpbGF0aW9uIGFuZCBsaW5raW5nXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICB2YXIgZnJhZ1NoYWRlcnMgPSB7fVxuICB2YXIgdmVydFNoYWRlcnMgPSB7fVxuXG4gIGZ1bmN0aW9uIGdldFNoYWRlciAodHlwZSwgaWQpIHtcbiAgICB2YXIgY2FjaGUgPSB0eXBlID09PSBHTF9GUkFHTUVOVF9TSEFERVIgPyBmcmFnU2hhZGVycyA6IHZlcnRTaGFkZXJzXG4gICAgdmFyIHNoYWRlciA9IGNhY2hlW2lkXVxuXG4gICAgaWYgKCFzaGFkZXIpIHtcbiAgICAgIHZhciBzb3VyY2UgPSBzdHJpbmdTdG9yZS5zdHIoaWQpXG4gICAgICBzaGFkZXIgPSBnbC5jcmVhdGVTaGFkZXIodHlwZSlcbiAgICAgIGdsLnNoYWRlclNvdXJjZShzaGFkZXIsIHNvdXJjZSlcbiAgICAgIGdsLmNvbXBpbGVTaGFkZXIoc2hhZGVyKVxuICAgICAgY2hlY2suc2hhZGVyRXJyb3IoZ2wsIHNoYWRlciwgc291cmNlLCB0eXBlKVxuICAgICAgY2FjaGVbaWRdID0gc2hhZGVyXG4gICAgfVxuXG4gICAgcmV0dXJuIHNoYWRlclxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIHByb2dyYW0gbGlua2luZ1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgdmFyIHByb2dyYW1DYWNoZSA9IHt9XG4gIHZhciBwcm9ncmFtTGlzdCA9IFtdXG5cbiAgZnVuY3Rpb24gUkVHTFByb2dyYW0gKGZyYWdJZCwgdmVydElkKSB7XG4gICAgdGhpcy5mcmFnSWQgPSBmcmFnSWRcbiAgICB0aGlzLnZlcnRJZCA9IHZlcnRJZFxuICAgIHRoaXMucHJvZ3JhbSA9IG51bGxcbiAgICB0aGlzLnVuaWZvcm1zID0gW11cbiAgICB0aGlzLmF0dHJpYnV0ZXMgPSBbXVxuICAgIHRoaXMuZHJhdyA9IGZ1bmN0aW9uICgpIHt9XG4gICAgdGhpcy5iYXRjaENhY2hlID0ge31cbiAgfVxuXG4gIGZ1bmN0aW9uIGxpbmtQcm9ncmFtIChkZXNjKSB7XG4gICAgdmFyIGksIGluZm9cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBjb21waWxlICYgbGlua1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICB2YXIgZnJhZ1NoYWRlciA9IGdldFNoYWRlcihHTF9GUkFHTUVOVF9TSEFERVIsIGRlc2MuZnJhZ0lkKVxuICAgIHZhciB2ZXJ0U2hhZGVyID0gZ2V0U2hhZGVyKEdMX1ZFUlRFWF9TSEFERVIsIGRlc2MudmVydElkKVxuXG4gICAgdmFyIHByb2dyYW0gPSBkZXNjLnByb2dyYW0gPSBnbC5jcmVhdGVQcm9ncmFtKClcbiAgICBnbC5hdHRhY2hTaGFkZXIocHJvZ3JhbSwgZnJhZ1NoYWRlcilcbiAgICBnbC5hdHRhY2hTaGFkZXIocHJvZ3JhbSwgdmVydFNoYWRlcilcbiAgICBnbC5saW5rUHJvZ3JhbShwcm9ncmFtKVxuICAgIGNoZWNrLmxpbmtFcnJvcihnbCwgcHJvZ3JhbSlcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBncmFiIHVuaWZvcm1zXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHZhciBudW1Vbmlmb3JtcyA9IGdsLmdldFByb2dyYW1QYXJhbWV0ZXIocHJvZ3JhbSwgR0xfQUNUSVZFX1VOSUZPUk1TKVxuICAgIHZhciB1bmlmb3JtcyA9IGRlc2MudW5pZm9ybXMgPSBbXVxuXG4gICAgZm9yIChpID0gMDsgaSA8IG51bVVuaWZvcm1zOyArK2kpIHtcbiAgICAgIGluZm8gPSBnbC5nZXRBY3RpdmVVbmlmb3JtKHByb2dyYW0sIGkpXG4gICAgICBpZiAoaW5mbykge1xuICAgICAgICBpZiAoaW5mby5zaXplID4gMSkge1xuICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgaW5mby5zaXplOyArK2opIHtcbiAgICAgICAgICAgIHZhciBuYW1lID0gaW5mby5uYW1lLnJlcGxhY2UoJ1swXScsICdbJyArIGogKyAnXScpXG4gICAgICAgICAgICB1bmlmb3JtU3RhdGUuZGVmKG5hbWUpXG4gICAgICAgICAgICB1bmlmb3Jtcy5wdXNoKG5ldyBBY3RpdmVJbmZvKFxuICAgICAgICAgICAgICBuYW1lLFxuICAgICAgICAgICAgICBnbC5nZXRVbmlmb3JtTG9jYXRpb24ocHJvZ3JhbSwgbmFtZSksXG4gICAgICAgICAgICAgIGluZm8pKVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB1bmlmb3JtU3RhdGUuZGVmKGluZm8ubmFtZSlcbiAgICAgICAgICB1bmlmb3Jtcy5wdXNoKG5ldyBBY3RpdmVJbmZvKFxuICAgICAgICAgICAgaW5mby5uYW1lLFxuICAgICAgICAgICAgZ2wuZ2V0VW5pZm9ybUxvY2F0aW9uKHByb2dyYW0sIGluZm8ubmFtZSksXG4gICAgICAgICAgICBpbmZvKSlcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBncmFiIGF0dHJpYnV0ZXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgdmFyIG51bUF0dHJpYnV0ZXMgPSBnbC5nZXRQcm9ncmFtUGFyYW1ldGVyKHByb2dyYW0sIEdMX0FDVElWRV9BVFRSSUJVVEVTKVxuICAgIHZhciBhdHRyaWJ1dGVzID0gZGVzYy5hdHRyaWJ1dGVzID0gW11cbiAgICBmb3IgKGkgPSAwOyBpIDwgbnVtQXR0cmlidXRlczsgKytpKSB7XG4gICAgICBpbmZvID0gZ2wuZ2V0QWN0aXZlQXR0cmliKHByb2dyYW0sIGkpXG4gICAgICBpZiAoaW5mbykge1xuICAgICAgICBhdHRyaWJ1dGVTdGF0ZS5kZWYoaW5mby5uYW1lKVxuICAgICAgICBhdHRyaWJ1dGVzLnB1c2gobmV3IEFjdGl2ZUluZm8oXG4gICAgICAgICAgaW5mby5uYW1lLFxuICAgICAgICAgIGdsLmdldEF0dHJpYkxvY2F0aW9uKHByb2dyYW0sIGluZm8ubmFtZSksXG4gICAgICAgICAgaW5mbykpXG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGNsZWFyIGNhY2hlZCByZW5kZXJpbmcgbWV0aG9kc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBkZXNjLmRyYXcgPSBjb21waWxlU2hhZGVyRHJhdyhkZXNjKVxuICAgIGRlc2MuYmF0Y2hDYWNoZSA9IHt9XG4gIH1cblxuICBmdW5jdGlvbiBnZXRQcm9ncmFtICh2ZXJ0SWQsIGZyYWdJZCkge1xuICAgIHZhciBjYWNoZSA9IHByb2dyYW1DYWNoZVtmcmFnSWRdXG4gICAgaWYgKCFjYWNoZSkge1xuICAgICAgY2FjaGUgPSBwcm9ncmFtQ2FjaGVbZnJhZ0lkXSA9IHt9XG4gICAgfVxuICAgIHZhciBwcm9ncmFtID0gY2FjaGVbdmVydElkXVxuICAgIGlmICghcHJvZ3JhbSkge1xuICAgICAgcHJvZ3JhbSA9IG5ldyBSRUdMUHJvZ3JhbShmcmFnSWQsIHZlcnRJZClcbiAgICAgIGxpbmtQcm9ncmFtKHByb2dyYW0pXG4gICAgICBjYWNoZVt2ZXJ0SWRdID0gcHJvZ3JhbVxuICAgICAgcHJvZ3JhbUxpc3QucHVzaChwcm9ncmFtKVxuICAgIH1cbiAgICByZXR1cm4gcHJvZ3JhbVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjcmVhdGU6IGdldFByb2dyYW0sXG5cbiAgICBjbGVhcjogZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIGRlbGV0ZVNoYWRlciA9IGdsLmRlbGV0ZVNoYWRlci5iaW5kKGdsKVxuICAgICAgdmFsdWVzKGZyYWdTaGFkZXJzKS5mb3JFYWNoKGRlbGV0ZVNoYWRlcilcbiAgICAgIGZyYWdTaGFkZXJzID0ge31cbiAgICAgIHZhbHVlcyh2ZXJ0U2hhZGVycykuZm9yRWFjaChkZWxldGVTaGFkZXIpXG4gICAgICB2ZXJ0U2hhZGVycyA9IHt9XG5cbiAgICAgIHByb2dyYW1MaXN0LmZvckVhY2goZnVuY3Rpb24gKGRlc2MpIHtcbiAgICAgICAgZ2wuZGVsZXRlUHJvZ3JhbShkZXNjLnByb2dyYW0pXG4gICAgICB9KVxuICAgICAgcHJvZ3JhbUxpc3QubGVuZ3RoID0gMFxuICAgICAgcHJvZ3JhbUNhY2hlID0ge31cbiAgICB9LFxuXG4gICAgcmVmcmVzaDogZnVuY3Rpb24gKCkge1xuICAgICAgZnJhZ1NoYWRlcnMgPSB7fVxuICAgICAgdmVydFNoYWRlcnMgPSB7fVxuICAgICAgcHJvZ3JhbUxpc3QuZm9yRWFjaChsaW5rUHJvZ3JhbSlcbiAgICB9LFxuXG4gICAgcHJvZ3JhbXM6IFsgbnVsbCBdLFxuICAgIGZyYWdTaGFkZXJzOiBbIHN0cmluZ1N0b3JlLmlkKERFRkFVTFRfRlJBR19TSEFERVIpIF0sXG4gICAgdmVydFNoYWRlcnM6IFsgc3RyaW5nU3RvcmUuaWQoREVGQVVMVF9WRVJUX1NIQURFUikgXVxuICB9XG59XG4iLCIvLyBBIHN0YWNrIGZvciBtYW5hZ2luZyB0aGUgc3RhdGUgb2YgYSBzY2FsYXIvdmVjdG9yIHBhcmFtZXRlclxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNyZWF0ZVN0YWNrIChpbml0LCBvbkNoYW5nZSkge1xuICB2YXIgbiA9IGluaXQubGVuZ3RoXG4gIHZhciBzdGFjayA9IGluaXQuc2xpY2UoKVxuICB2YXIgY3VycmVudCA9IGluaXQuc2xpY2UoKVxuICB2YXIgZGlydHkgPSBmYWxzZVxuICB2YXIgZm9yY2VEaXJ0eSA9IHRydWVcblxuICBmdW5jdGlvbiBwb2xsICgpIHtcbiAgICB2YXIgcHRyID0gc3RhY2subGVuZ3RoIC0gblxuICAgIGlmIChkaXJ0eSB8fCBmb3JjZURpcnR5KSB7XG4gICAgICBzd2l0Y2ggKG4pIHtcbiAgICAgICAgY2FzZSAxOlxuICAgICAgICAgIG9uQ2hhbmdlKHN0YWNrW3B0cl0pXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSAyOlxuICAgICAgICAgIG9uQ2hhbmdlKHN0YWNrW3B0cl0sIHN0YWNrW3B0ciArIDFdKVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgMzpcbiAgICAgICAgICBvbkNoYW5nZShzdGFja1twdHJdLCBzdGFja1twdHIgKyAxXSwgc3RhY2tbcHRyICsgMl0pXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSA0OlxuICAgICAgICAgIG9uQ2hhbmdlKHN0YWNrW3B0cl0sIHN0YWNrW3B0ciArIDFdLCBzdGFja1twdHIgKyAyXSwgc3RhY2tbcHRyICsgM10pXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSA1OlxuICAgICAgICAgIG9uQ2hhbmdlKHN0YWNrW3B0cl0sIHN0YWNrW3B0ciArIDFdLCBzdGFja1twdHIgKyAyXSwgc3RhY2tbcHRyICsgM10sIHN0YWNrW3B0ciArIDRdKVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgNjpcbiAgICAgICAgICBvbkNoYW5nZShzdGFja1twdHJdLCBzdGFja1twdHIgKyAxXSwgc3RhY2tbcHRyICsgMl0sIHN0YWNrW3B0ciArIDNdLCBzdGFja1twdHIgKyA0XSwgc3RhY2tbcHRyICsgNV0pXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICBvbkNoYW5nZS5hcHBseShudWxsLCBzdGFjay5zbGljZShwdHIsIHN0YWNrLmxlbmd0aCkpXG4gICAgICB9XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG47ICsraSkge1xuICAgICAgICBjdXJyZW50W2ldID0gc3RhY2tbcHRyICsgaV1cbiAgICAgIH1cbiAgICAgIGZvcmNlRGlydHkgPSBkaXJ0eSA9IGZhbHNlXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBwdXNoOiBmdW5jdGlvbiAoKSB7XG4gICAgICBkaXJ0eSA9IGZhbHNlXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG47ICsraSkge1xuICAgICAgICB2YXIgeCA9IGFyZ3VtZW50c1tpXVxuICAgICAgICBkaXJ0eSA9IGRpcnR5IHx8ICh4ICE9PSBjdXJyZW50W2ldKVxuICAgICAgICBzdGFjay5wdXNoKHgpXG4gICAgICB9XG4gICAgfSxcblxuICAgIHBvcDogZnVuY3Rpb24gKCkge1xuICAgICAgZGlydHkgPSBmYWxzZVxuICAgICAgc3RhY2subGVuZ3RoIC09IG5cbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbjsgKytpKSB7XG4gICAgICAgIGRpcnR5ID0gZGlydHkgfHwgKHN0YWNrW3N0YWNrLmxlbmd0aCAtIG4gKyBpXSAhPT0gY3VycmVudFtpXSlcbiAgICAgIH1cbiAgICB9LFxuXG4gICAgcG9sbDogcG9sbCxcblxuICAgIHNldERpcnR5OiBmdW5jdGlvbiAoKSB7XG4gICAgICBmb3JjZURpcnR5ID0gdHJ1ZVxuICAgIH1cbiAgfVxufVxuIiwidmFyIGNyZWF0ZVN0YWNrID0gcmVxdWlyZSgnLi9zdGFjaycpXG52YXIgY3JlYXRlRW52aXJvbm1lbnQgPSByZXF1aXJlKCcuL2NvZGVnZW4nKVxuXG4vLyBXZWJHTCBjb25zdGFudHNcbnZhciBHTF9DVUxMX0ZBQ0UgPSAweDBCNDRcbnZhciBHTF9CTEVORCA9IDB4MEJFMlxudmFyIEdMX0RJVEhFUiA9IDB4MEJEMFxudmFyIEdMX1NURU5DSUxfVEVTVCA9IDB4MEI5MFxudmFyIEdMX0RFUFRIX1RFU1QgPSAweDBCNzFcbnZhciBHTF9TQ0lTU09SX1RFU1QgPSAweDBDMTFcbnZhciBHTF9QT0xZR09OX09GRlNFVF9GSUxMID0gMHg4MDM3XG52YXIgR0xfU0FNUExFX0FMUEhBX1RPX0NPVkVSQUdFID0gMHg4MDlFXG52YXIgR0xfU0FNUExFX0NPVkVSQUdFID0gMHg4MEEwXG52YXIgR0xfRlVOQ19BREQgPSAweDgwMDZcbnZhciBHTF9aRVJPID0gMFxudmFyIEdMX09ORSA9IDFcbnZhciBHTF9GUk9OVCA9IDEwMjhcbnZhciBHTF9CQUNLID0gMTAyOVxudmFyIEdMX0xFU1MgPSA1MTNcbnZhciBHTF9DQ1cgPSAyMzA1XG52YXIgR0xfQUxXQVlTID0gNTE5XG52YXIgR0xfS0VFUCA9IDc2ODBcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwQ29udGV4dFN0YXRlIChnbCwgZnJhbWVidWZmZXJTdGF0ZSwgdmlld3BvcnRTdGF0ZSkge1xuICBmdW5jdGlvbiBjYXBTdGFjayAoY2FwLCBkZmx0KSB7XG4gICAgdmFyIHJlc3VsdCA9IGNyZWF0ZVN0YWNrKFshIWRmbHRdLCBmdW5jdGlvbiAoZmxhZykge1xuICAgICAgaWYgKGZsYWcpIHtcbiAgICAgICAgZ2wuZW5hYmxlKGNhcClcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGdsLmRpc2FibGUoY2FwKVxuICAgICAgfVxuICAgIH0pXG4gICAgcmVzdWx0LmZsYWcgPSBjYXBcbiAgICByZXR1cm4gcmVzdWx0XG4gIH1cblxuICAvLyBDYXBzLCBmbGFncyBhbmQgb3RoZXIgcmFuZG9tIFdlYkdMIGNvbnRleHQgc3RhdGVcbiAgdmFyIGNvbnRleHRTdGF0ZSA9IHtcbiAgICAvLyBEaXRoZXJpbmdcbiAgICAnZGl0aGVyJzogY2FwU3RhY2soR0xfRElUSEVSKSxcblxuICAgIC8vIEJsZW5kaW5nXG4gICAgJ2JsZW5kLmVuYWJsZSc6IGNhcFN0YWNrKEdMX0JMRU5EKSxcbiAgICAnYmxlbmQuY29sb3InOiBjcmVhdGVTdGFjayhbMCwgMCwgMCwgMF0sIGZ1bmN0aW9uIChyLCBnLCBiLCBhKSB7XG4gICAgICBnbC5ibGVuZENvbG9yKHIsIGcsIGIsIGEpXG4gICAgfSksXG4gICAgJ2JsZW5kLmVxdWF0aW9uJzogY3JlYXRlU3RhY2soW0dMX0ZVTkNfQURELCBHTF9GVU5DX0FERF0sIGZ1bmN0aW9uIChyZ2IsIGEpIHtcbiAgICAgIGdsLmJsZW5kRXF1YXRpb25TZXBhcmF0ZShyZ2IsIGEpXG4gICAgfSksXG4gICAgJ2JsZW5kLmZ1bmMnOiBjcmVhdGVTdGFjayhbXG4gICAgICBHTF9PTkUsIEdMX1pFUk8sIEdMX09ORSwgR0xfWkVST1xuICAgIF0sIGZ1bmN0aW9uIChzcmNSR0IsIGRzdFJHQiwgc3JjQWxwaGEsIGRzdEFscGhhKSB7XG4gICAgICBnbC5ibGVuZEZ1bmNTZXBhcmF0ZShzcmNSR0IsIGRzdFJHQiwgc3JjQWxwaGEsIGRzdEFscGhhKVxuICAgIH0pLFxuXG4gICAgLy8gRGVwdGhcbiAgICAnZGVwdGguZW5hYmxlJzogY2FwU3RhY2soR0xfREVQVEhfVEVTVCwgdHJ1ZSksXG4gICAgJ2RlcHRoLmZ1bmMnOiBjcmVhdGVTdGFjayhbR0xfTEVTU10sIGZ1bmN0aW9uIChmdW5jKSB7XG4gICAgICBnbC5kZXB0aEZ1bmMoZnVuYylcbiAgICB9KSxcbiAgICAnZGVwdGgucmFuZ2UnOiBjcmVhdGVTdGFjayhbMCwgMV0sIGZ1bmN0aW9uIChuZWFyLCBmYXIpIHtcbiAgICAgIGdsLmRlcHRoUmFuZ2UobmVhciwgZmFyKVxuICAgIH0pLFxuICAgICdkZXB0aC5tYXNrJzogY3JlYXRlU3RhY2soW3RydWVdLCBmdW5jdGlvbiAobSkge1xuICAgICAgZ2wuZGVwdGhNYXNrKG0pXG4gICAgfSksXG5cbiAgICAvLyBGYWNlIGN1bGxpbmdcbiAgICAnY3VsbC5lbmFibGUnOiBjYXBTdGFjayhHTF9DVUxMX0ZBQ0UpLFxuICAgICdjdWxsLmZhY2UnOiBjcmVhdGVTdGFjayhbR0xfQkFDS10sIGZ1bmN0aW9uIChtb2RlKSB7XG4gICAgICBnbC5jdWxsRmFjZShtb2RlKVxuICAgIH0pLFxuXG4gICAgLy8gRnJvbnQgZmFjZSBvcmllbnRhdGlvblxuICAgICdmcm9udEZhY2UnOiBjcmVhdGVTdGFjayhbR0xfQ0NXXSwgZnVuY3Rpb24gKG1vZGUpIHtcbiAgICAgIGdsLmZyb250RmFjZShtb2RlKVxuICAgIH0pLFxuXG4gICAgLy8gV3JpdGUgbWFza3NcbiAgICAnY29sb3JNYXNrJzogY3JlYXRlU3RhY2soW3RydWUsIHRydWUsIHRydWUsIHRydWVdLCBmdW5jdGlvbiAociwgZywgYiwgYSkge1xuICAgICAgZ2wuY29sb3JNYXNrKHIsIGcsIGIsIGEpXG4gICAgfSksXG5cbiAgICAvLyBMaW5lIHdpZHRoXG4gICAgJ2xpbmVXaWR0aCc6IGNyZWF0ZVN0YWNrKFsxXSwgZnVuY3Rpb24gKHcpIHtcbiAgICAgIGdsLmxpbmVXaWR0aCh3KVxuICAgIH0pLFxuXG4gICAgLy8gUG9seWdvbiBvZmZzZXRcbiAgICAncG9seWdvbk9mZnNldC5lbmFibGUnOiBjYXBTdGFjayhHTF9QT0xZR09OX09GRlNFVF9GSUxMKSxcbiAgICAncG9seWdvbk9mZnNldC5vZmZzZXQnOiBjcmVhdGVTdGFjayhbMCwgMF0sIGZ1bmN0aW9uIChmYWN0b3IsIHVuaXRzKSB7XG4gICAgICBnbC5wb2x5Z29uT2Zmc2V0KGZhY3RvciwgdW5pdHMpXG4gICAgfSksXG5cbiAgICAvLyBTYW1wbGUgY292ZXJhZ2VcbiAgICAnc2FtcGxlLmFscGhhJzogY2FwU3RhY2soR0xfU0FNUExFX0FMUEhBX1RPX0NPVkVSQUdFKSxcbiAgICAnc2FtcGxlLmVuYWJsZSc6IGNhcFN0YWNrKEdMX1NBTVBMRV9DT1ZFUkFHRSksXG4gICAgJ3NhbXBsZS5jb3ZlcmFnZSc6IGNyZWF0ZVN0YWNrKFsxLCBmYWxzZV0sIGZ1bmN0aW9uICh2YWx1ZSwgaW52ZXJ0KSB7XG4gICAgICBnbC5zYW1wbGVDb3ZlcmFnZSh2YWx1ZSwgaW52ZXJ0KVxuICAgIH0pLFxuXG4gICAgLy8gU3RlbmNpbFxuICAgICdzdGVuY2lsLmVuYWJsZSc6IGNhcFN0YWNrKEdMX1NURU5DSUxfVEVTVCksXG4gICAgJ3N0ZW5jaWwubWFzayc6IGNyZWF0ZVN0YWNrKFstMV0sIGZ1bmN0aW9uIChtYXNrKSB7XG4gICAgICBnbC5zdGVuY2lsTWFzayhtYXNrKVxuICAgIH0pLFxuICAgICdzdGVuY2lsLmZ1bmMnOiBjcmVhdGVTdGFjayhbXG4gICAgICBHTF9BTFdBWVMsIDAsIC0xXG4gICAgXSwgZnVuY3Rpb24gKGZ1bmMsIHJlZiwgbWFzaykge1xuICAgICAgZ2wuc3RlbmNpbEZ1bmMoZnVuYywgcmVmLCBtYXNrKVxuICAgIH0pLFxuICAgICdzdGVuY2lsLm9wRnJvbnQnOiBjcmVhdGVTdGFjayhbXG4gICAgICBHTF9LRUVQLCBHTF9LRUVQLCBHTF9LRUVQXG4gICAgXSwgZnVuY3Rpb24gKGZhaWwsIHpmYWlsLCBwYXNzKSB7XG4gICAgICBnbC5zdGVuY2lsT3BTZXBhcmF0ZShHTF9GUk9OVCwgZmFpbCwgemZhaWwsIHBhc3MpXG4gICAgfSksXG4gICAgJ3N0ZW5jaWwub3BCYWNrJzogY3JlYXRlU3RhY2soW1xuICAgICAgR0xfS0VFUCwgR0xfS0VFUCwgR0xfS0VFUFxuICAgIF0sIGZ1bmN0aW9uIChmYWlsLCB6ZmFpbCwgcGFzcykge1xuICAgICAgZ2wuc3RlbmNpbE9wU2VwYXJhdGUoR0xfQkFDSywgZmFpbCwgemZhaWwsIHBhc3MpXG4gICAgfSksXG5cbiAgICAvLyBTY2lzc29yXG4gICAgJ3NjaXNzb3IuZW5hYmxlJzogY2FwU3RhY2soR0xfU0NJU1NPUl9URVNUKSxcbiAgICAnc2Npc3Nvci5ib3gnOiBjcmVhdGVTdGFjayhbMCwgMCwgLTEsIC0xXSwgZnVuY3Rpb24gKHgsIHksIHcsIGgpIHtcbiAgICAgIHZhciB3XyA9IHdcbiAgICAgIHZhciBmYm8gPSBmcmFtZWJ1ZmZlclN0YXRlLnRvcCgpXG4gICAgICBpZiAodyA8IDApIHtcbiAgICAgICAgaWYgKGZibykge1xuICAgICAgICAgIHdfID0gZmJvLndpZHRoIC0geFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHdfID0gZ2wuZHJhd2luZ0J1ZmZlcldpZHRoIC0geFxuICAgICAgICB9XG4gICAgICB9XG4gICAgICB2YXIgaF8gPSBoXG4gICAgICBpZiAoaCA8IDApIHtcbiAgICAgICAgaWYgKGZibykge1xuICAgICAgICAgIGhfID0gZmJvLmhlaWdodCAtIHlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBoXyA9IGdsLmRyYXdpbmdCdWZmZXJIZWlnaHQgLSB5XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGdsLnNjaXNzb3IoeCwgeSwgd18sIGhfKVxuICAgIH0pLFxuXG4gICAgLy8gVmlld3BvcnRcbiAgICAndmlld3BvcnQnOiBjcmVhdGVTdGFjayhbMCwgMCwgLTEsIC0xXSwgZnVuY3Rpb24gKHgsIHksIHcsIGgpIHtcbiAgICAgIHZhciB3XyA9IHdcbiAgICAgIHZhciBmYm8gPSBmcmFtZWJ1ZmZlclN0YXRlLnRvcCgpXG4gICAgICBpZiAodyA8IDApIHtcbiAgICAgICAgaWYgKGZibykge1xuICAgICAgICAgIHdfID0gZmJvLndpZHRoIC0geFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHdfID0gZ2wuZHJhd2luZ0J1ZmZlcldpZHRoIC0geFxuICAgICAgICB9XG4gICAgICB9XG4gICAgICB2YXIgaF8gPSBoXG4gICAgICBpZiAoaCA8IDApIHtcbiAgICAgICAgaWYgKGZibykge1xuICAgICAgICAgIGhfID0gZmJvLmhlaWdodCAtIHlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBoXyA9IGdsLmRyYXdpbmdCdWZmZXJIZWlnaHQgLSB5XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGdsLnZpZXdwb3J0KHgsIHksIHdfLCBoXylcbiAgICAgIHZpZXdwb3J0U3RhdGUud2lkdGggPSB3X1xuICAgICAgdmlld3BvcnRTdGF0ZS5oZWlnaHQgPSBoX1xuICAgIH0pXG4gIH1cblxuICB2YXIgZW52ID0gY3JlYXRlRW52aXJvbm1lbnQoKVxuICB2YXIgcG9sbCA9IGVudi5wcm9jKCdwb2xsJylcbiAgdmFyIHJlZnJlc2ggPSBlbnYucHJvYygncmVmcmVzaCcpXG4gIE9iamVjdC5rZXlzKGNvbnRleHRTdGF0ZSkuZm9yRWFjaChmdW5jdGlvbiAocHJvcCkge1xuICAgIHZhciBTVEFDSyA9IGVudi5saW5rKGNvbnRleHRTdGF0ZVtwcm9wXSlcbiAgICBwb2xsKFNUQUNLLCAnLnBvbGwoKTsnKVxuICAgIHJlZnJlc2goU1RBQ0ssICcuc2V0RGlydHkoKTsnKVxuICB9KVxuXG4gIHZhciBwcm9jcyA9IGVudi5jb21waWxlKClcblxuICByZXR1cm4ge1xuICAgIGNvbnRleHRTdGF0ZTogY29udGV4dFN0YXRlLFxuICAgIHZpZXdwb3J0OiB2aWV3cG9ydFN0YXRlLFxuICAgIHBvbGw6IHByb2NzLnBvbGwsXG4gICAgcmVmcmVzaDogcHJvY3MucmVmcmVzaCxcblxuICAgIG5vdGlmeVZpZXdwb3J0Q2hhbmdlZDogZnVuY3Rpb24gKCkge1xuICAgICAgY29udGV4dFN0YXRlLnZpZXdwb3J0LnNldERpcnR5KClcbiAgICAgIGNvbnRleHRTdGF0ZVsnc2Npc3Nvci5ib3gnXS5zZXREaXJ0eSgpXG4gICAgfVxuICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNyZWF0ZVN0cmluZ1N0b3JlKCkge1xuICB2YXIgc3RyaW5nSWRzID0ge31cbiAgdmFyIHN0cmluZ1ZhbHVlcyA9IFsnJ11cbiAgcmV0dXJuIHtcbiAgICBpZDogZnVuY3Rpb24gKHN0cikge1xuICAgICAgdmFyIHJlc3VsdCA9IHN0cmluZ0lkc1tzdHJdXG4gICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH1cbiAgICAgIHJlc3VsdCA9IHN0cmluZ0lkc1tzdHJdID0gc3RyaW5nVmFsdWVzLmxlbmd0aFxuICAgICAgc3RyaW5nVmFsdWVzLnB1c2goc3RyKVxuICAgICAgcmV0dXJuIHJlc3VsdFxuICAgIH0sXG5cbiAgICBzdHI6IGZ1bmN0aW9uIChpZCkge1xuICAgICAgcmV0dXJuIHN0cmluZ1ZhbHVlc1tpZF1cbiAgICB9XG4gIH1cbn1cbiIsInZhciBjaGVjayA9IHJlcXVpcmUoJy4vY2hlY2snKVxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vZXh0ZW5kJylcbnZhciB2YWx1ZXMgPSByZXF1aXJlKCcuL3ZhbHVlcycpXG52YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi9pcy10eXBlZC1hcnJheScpXG52YXIgaXNOREFycmF5TGlrZSA9IHJlcXVpcmUoJy4vaXMtbmRhcnJheScpXG52YXIgbG9hZFRleHR1cmUgPSByZXF1aXJlKCcuL2xvYWQtdGV4dHVyZScpXG52YXIgY29udmVydFRvSGFsZkZsb2F0ID0gcmVxdWlyZSgnLi90by1oYWxmLWZsb2F0JylcbnZhciBwYXJzZUREUyA9IHJlcXVpcmUoJy4vcGFyc2UtZGRzJylcblxudmFyIEdMX0NPTVBSRVNTRURfVEVYVFVSRV9GT1JNQVRTID0gMHg4NkEzXG5cbnZhciBHTF9URVhUVVJFXzJEID0gMHgwREUxXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUCA9IDB4ODUxM1xudmFyIEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCA9IDB4ODUxNVxuXG52YXIgR0xfUkdCQSA9IDB4MTkwOFxudmFyIEdMX0FMUEhBID0gMHgxOTA2XG52YXIgR0xfUkdCID0gMHgxOTA3XG52YXIgR0xfTFVNSU5BTkNFID0gMHgxOTA5XG52YXIgR0xfTFVNSU5BTkNFX0FMUEhBID0gMHgxOTBBXG5cbnZhciBHTF9SR0JBNCA9IDB4ODA1NlxudmFyIEdMX1JHQjVfQTEgPSAweDgwNTdcbnZhciBHTF9SR0I1NjUgPSAweDhENjJcblxudmFyIEdMX1VOU0lHTkVEX1NIT1JUXzRfNF80XzQgPSAweDgwMzNcbnZhciBHTF9VTlNJR05FRF9TSE9SVF81XzVfNV8xID0gMHg4MDM0XG52YXIgR0xfVU5TSUdORURfU0hPUlRfNV82XzUgPSAweDgzNjNcbnZhciBHTF9VTlNJR05FRF9JTlRfMjRfOF9XRUJHTCA9IDB4ODRGQVxuXG52YXIgR0xfREVQVEhfQ09NUE9ORU5UID0gMHgxOTAyXG52YXIgR0xfREVQVEhfU1RFTkNJTCA9IDB4ODRGOVxuXG52YXIgR0xfU1JHQl9FWFQgPSAweDhDNDBcbnZhciBHTF9TUkdCX0FMUEhBX0VYVCA9IDB4OEM0MlxuXG52YXIgR0xfSEFMRl9GTE9BVF9PRVMgPSAweDhENjFcblxudmFyIEdMX0NPTVBSRVNTRURfUkdCX1MzVENfRFhUMV9FWFQgPSAweDgzRjBcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQxX0VYVCA9IDB4ODNGMVxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDNfRVhUID0gMHg4M0YyXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUNV9FWFQgPSAweDgzRjNcblxudmFyIEdMX0NPTVBSRVNTRURfUkdCX0FUQ19XRUJHTCA9IDB4OEM5MlxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9BVENfRVhQTElDSVRfQUxQSEFfV0VCR0wgPSAweDhDOTNcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfQVRDX0lOVEVSUE9MQVRFRF9BTFBIQV9XRUJHTCA9IDB4ODdFRVxuXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfUFZSVENfNEJQUFYxX0lNRyA9IDB4OEMwMFxudmFyIEdMX0NPTVBSRVNTRURfUkdCX1BWUlRDXzJCUFBWMV9JTUcgPSAweDhDMDFcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUFZSVENfNEJQUFYxX0lNRyA9IDB4OEMwMlxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9QVlJUQ18yQlBQVjFfSU1HID0gMHg4QzAzXG5cbnZhciBHTF9DT01QUkVTU0VEX1JHQl9FVEMxX1dFQkdMID0gMHg4RDY0XG5cbnZhciBHTF9VTlNJR05FRF9CWVRFID0gMHgxNDAxXG52YXIgR0xfVU5TSUdORURfU0hPUlQgPSAweDE0MDNcbnZhciBHTF9VTlNJR05FRF9JTlQgPSAweDE0MDVcbnZhciBHTF9GTE9BVCA9IDB4MTQwNlxuXG52YXIgR0xfVEVYVFVSRV9XUkFQX1MgPSAweDI4MDJcbnZhciBHTF9URVhUVVJFX1dSQVBfVCA9IDB4MjgwM1xuXG52YXIgR0xfUkVQRUFUID0gMHgyOTAxXG52YXIgR0xfQ0xBTVBfVE9fRURHRSA9IDB4ODEyRlxudmFyIEdMX01JUlJPUkVEX1JFUEVBVCA9IDB4ODM3MFxuXG52YXIgR0xfVEVYVFVSRV9NQUdfRklMVEVSID0gMHgyODAwXG52YXIgR0xfVEVYVFVSRV9NSU5fRklMVEVSID0gMHgyODAxXG5cbnZhciBHTF9ORUFSRVNUID0gMHgyNjAwXG52YXIgR0xfTElORUFSID0gMHgyNjAxXG52YXIgR0xfTkVBUkVTVF9NSVBNQVBfTkVBUkVTVCA9IDB4MjcwMFxudmFyIEdMX0xJTkVBUl9NSVBNQVBfTkVBUkVTVCA9IDB4MjcwMVxudmFyIEdMX05FQVJFU1RfTUlQTUFQX0xJTkVBUiA9IDB4MjcwMlxudmFyIEdMX0xJTkVBUl9NSVBNQVBfTElORUFSID0gMHgyNzAzXG5cbnZhciBHTF9HRU5FUkFURV9NSVBNQVBfSElOVCA9IDB4ODE5MlxudmFyIEdMX0RPTlRfQ0FSRSA9IDB4MTEwMFxudmFyIEdMX0ZBU1RFU1QgPSAweDExMDFcbnZhciBHTF9OSUNFU1QgPSAweDExMDJcblxudmFyIEdMX1RFWFRVUkVfTUFYX0FOSVNPVFJPUFlfRVhUID0gMHg4NEZFXG5cbnZhciBHTF9VTlBBQ0tfQUxJR05NRU5UID0gMHgwQ0Y1XG52YXIgR0xfVU5QQUNLX0ZMSVBfWV9XRUJHTCA9IDB4OTI0MFxudmFyIEdMX1VOUEFDS19QUkVNVUxUSVBMWV9BTFBIQV9XRUJHTCA9IDB4OTI0MVxudmFyIEdMX1VOUEFDS19DT0xPUlNQQUNFX0NPTlZFUlNJT05fV0VCR0wgPSAweDkyNDNcblxudmFyIEdMX0JST1dTRVJfREVGQVVMVF9XRUJHTCA9IDB4OTI0NFxuXG52YXIgR0xfVEVYVFVSRTAgPSAweDg0QzBcblxudmFyIE1JUE1BUF9GSUxURVJTID0gW1xuICBHTF9ORUFSRVNUX01JUE1BUF9ORUFSRVNULFxuICBHTF9ORUFSRVNUX01JUE1BUF9MSU5FQVIsXG4gIEdMX0xJTkVBUl9NSVBNQVBfTkVBUkVTVCxcbiAgR0xfTElORUFSX01JUE1BUF9MSU5FQVJcbl1cblxuZnVuY3Rpb24gaXNQb3cyICh2KSB7XG4gIHJldHVybiAhKHYgJiAodiAtIDEpKSAmJiAoISF2KVxufVxuXG5mdW5jdGlvbiBpc051bWVyaWNBcnJheSAoYXJyKSB7XG4gIHJldHVybiAoXG4gICAgQXJyYXkuaXNBcnJheShhcnIpICYmXG4gICAgKGFyci5sZW5ndGggPT09IDAgfHxcbiAgICB0eXBlb2YgYXJyWzBdID09PSAnbnVtYmVyJykpXG59XG5cbmZ1bmN0aW9uIGlzUmVjdEFycmF5IChhcnIpIHtcbiAgaWYgKCFBcnJheS5pc0FycmF5KGFycikpIHtcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxuXG4gIHZhciB3aWR0aCA9IGFyci5sZW5ndGhcbiAgaWYgKHdpZHRoID09PSAwIHx8ICFBcnJheS5pc0FycmF5KGFyclswXSkpIHtcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxuXG4gIHZhciBoZWlnaHQgPSBhcnJbMF0ubGVuZ3RoXG4gIGZvciAodmFyIGkgPSAxOyBpIDwgd2lkdGg7ICsraSkge1xuICAgIGlmICghQXJyYXkuaXNBcnJheShhcnJbaV0pIHx8IGFycltpXS5sZW5ndGggIT09IGhlaWdodCkge1xuICAgICAgcmV0dXJuIGZhbHNlXG4gICAgfVxuICB9XG4gIHJldHVybiB0cnVlXG59XG5cbmZ1bmN0aW9uIGNsYXNzU3RyaW5nICh4KSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoeClcbn1cblxuZnVuY3Rpb24gaXNDYW52YXNFbGVtZW50IChvYmplY3QpIHtcbiAgcmV0dXJuIGNsYXNzU3RyaW5nKG9iamVjdCkgPT09ICdbb2JqZWN0IEhUTUxDYW52YXNFbGVtZW50XSdcbn1cblxuZnVuY3Rpb24gaXNDb250ZXh0MkQgKG9iamVjdCkge1xuICByZXR1cm4gY2xhc3NTdHJpbmcob2JqZWN0KSA9PT0gJ1tvYmplY3QgQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEXSdcbn1cblxuZnVuY3Rpb24gaXNJbWFnZUVsZW1lbnQgKG9iamVjdCkge1xuICByZXR1cm4gY2xhc3NTdHJpbmcob2JqZWN0KSA9PT0gJ1tvYmplY3QgSFRNTEltYWdlRWxlbWVudF0nXG59XG5cbmZ1bmN0aW9uIGlzVmlkZW9FbGVtZW50IChvYmplY3QpIHtcbiAgcmV0dXJuIGNsYXNzU3RyaW5nKG9iamVjdCkgPT09ICdbb2JqZWN0IEhUTUxWaWRlb0VsZW1lbnRdJ1xufVxuXG5mdW5jdGlvbiBpc1BlbmRpbmdYSFIgKG9iamVjdCkge1xuICByZXR1cm4gY2xhc3NTdHJpbmcob2JqZWN0KSA9PT0gJ1tvYmplY3QgWE1MSHR0cFJlcXVlc3RdJ1xufVxuXG5mdW5jdGlvbiBpc1BpeGVsRGF0YSAob2JqZWN0KSB7XG4gIHJldHVybiAoXG4gICAgdHlwZW9mIG9iamVjdCA9PT0gJ3N0cmluZycgfHxcbiAgICAoISFvYmplY3QgJiYgKFxuICAgICAgaXNUeXBlZEFycmF5KG9iamVjdCkgfHxcbiAgICAgIGlzTnVtZXJpY0FycmF5KG9iamVjdCkgfHxcbiAgICAgIGlzTkRBcnJheUxpa2Uob2JqZWN0KSB8fFxuICAgICAgaXNDYW52YXNFbGVtZW50KG9iamVjdCkgfHxcbiAgICAgIGlzQ29udGV4dDJEKG9iamVjdCkgfHxcbiAgICAgIGlzSW1hZ2VFbGVtZW50KG9iamVjdCkgfHxcbiAgICAgIGlzVmlkZW9FbGVtZW50KG9iamVjdCkgfHxcbiAgICAgIGlzUmVjdEFycmF5KG9iamVjdCkpKSlcbn1cblxuLy8gVHJhbnNwb3NlIGFuIGFycmF5IG9mIHBpeGVsc1xuZnVuY3Rpb24gdHJhbnNwb3NlUGl4ZWxzIChkYXRhLCBueCwgbnksIG5jLCBzeCwgc3ksIHNjLCBvZmYpIHtcbiAgdmFyIHJlc3VsdCA9IG5ldyBkYXRhLmNvbnN0cnVjdG9yKG54ICogbnkgKiBuYylcbiAgdmFyIHB0ciA9IDBcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBueTsgKytpKSB7XG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBueDsgKytqKSB7XG4gICAgICBmb3IgKHZhciBrID0gMDsgayA8IG5jOyArK2spIHtcbiAgICAgICAgcmVzdWx0W3B0cisrXSA9IGRhdGFbc3kgKiBpICsgc3ggKiBqICsgc2MgKiBrICsgb2ZmXVxuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY3JlYXRlVGV4dHVyZVNldCAoZ2wsIGV4dGVuc2lvbnMsIGxpbWl0cywgcmVnbFBvbGwsIHZpZXdwb3J0U3RhdGUpIHtcbiAgdmFyIG1pcG1hcEhpbnQgPSB7XG4gICAgXCJkb24ndCBjYXJlXCI6IEdMX0RPTlRfQ0FSRSxcbiAgICAnZG9udCBjYXJlJzogR0xfRE9OVF9DQVJFLFxuICAgICduaWNlJzogR0xfTklDRVNULFxuICAgICdmYXN0JzogR0xfRkFTVEVTVFxuICB9XG5cbiAgdmFyIHdyYXBNb2RlcyA9IHtcbiAgICAncmVwZWF0JzogR0xfUkVQRUFULFxuICAgICdjbGFtcCc6IEdMX0NMQU1QX1RPX0VER0UsXG4gICAgJ21pcnJvcic6IEdMX01JUlJPUkVEX1JFUEVBVFxuICB9XG5cbiAgdmFyIG1hZ0ZpbHRlcnMgPSB7XG4gICAgJ25lYXJlc3QnOiBHTF9ORUFSRVNULFxuICAgICdsaW5lYXInOiBHTF9MSU5FQVJcbiAgfVxuXG4gIHZhciBtaW5GaWx0ZXJzID0gZXh0ZW5kKHtcbiAgICAnbmVhcmVzdCBtaXBtYXAgbmVhcmVzdCc6IEdMX05FQVJFU1RfTUlQTUFQX05FQVJFU1QsXG4gICAgJ2xpbmVhciBtaXBtYXAgbmVhcmVzdCc6IEdMX0xJTkVBUl9NSVBNQVBfTkVBUkVTVCxcbiAgICAnbmVhcmVzdCBtaXBtYXAgbGluZWFyJzogR0xfTkVBUkVTVF9NSVBNQVBfTElORUFSLFxuICAgICdsaW5lYXIgbWlwbWFwIGxpbmVhcic6IEdMX0xJTkVBUl9NSVBNQVBfTElORUFSLFxuICAgICdtaXBtYXAnOiBHTF9MSU5FQVJfTUlQTUFQX0xJTkVBUlxuICB9LCBtYWdGaWx0ZXJzKVxuXG4gIHZhciBjb2xvclNwYWNlID0ge1xuICAgICdub25lJzogMCxcbiAgICAnYnJvd3Nlcic6IEdMX0JST1dTRVJfREVGQVVMVF9XRUJHTFxuICB9XG5cbiAgdmFyIHRleHR1cmVUeXBlcyA9IHtcbiAgICAndWludDgnOiBHTF9VTlNJR05FRF9CWVRFLFxuICAgICdyZ2JhNCc6IEdMX1VOU0lHTkVEX1NIT1JUXzRfNF80XzQsXG4gICAgJ3JnYjU2NSc6IEdMX1VOU0lHTkVEX1NIT1JUXzVfNl81LFxuICAgICdyZ2I1IGExJzogR0xfVU5TSUdORURfU0hPUlRfNV81XzVfMVxuICB9XG5cbiAgdmFyIHRleHR1cmVGb3JtYXRzID0ge1xuICAgICdhbHBoYSc6IEdMX0FMUEhBLFxuICAgICdsdW1pbmFuY2UnOiBHTF9MVU1JTkFOQ0UsXG4gICAgJ2x1bWluYW5jZSBhbHBoYSc6IEdMX0xVTUlOQU5DRV9BTFBIQSxcbiAgICAncmdiJzogR0xfUkdCLFxuICAgICdyZ2JhJzogR0xfUkdCQSxcbiAgICAncmdiYTQnOiBHTF9SR0JBNCxcbiAgICAncmdiNSBhMSc6IEdMX1JHQjVfQTEsXG4gICAgJ3JnYjU2NSc6IEdMX1JHQjU2NVxuICB9XG5cbiAgdmFyIGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cyA9IHt9XG5cbiAgaWYgKGV4dGVuc2lvbnMuZXh0X3NyZ2IpIHtcbiAgICB0ZXh0dXJlRm9ybWF0cy5zcmdiID0gR0xfU1JHQl9FWFRcbiAgICB0ZXh0dXJlRm9ybWF0cy5zcmdiYSA9IEdMX1NSR0JfQUxQSEFfRVhUXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9mbG9hdCkge1xuICAgIHRleHR1cmVUeXBlcy5mbG9hdCA9IEdMX0ZMT0FUXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9oYWxmX2Zsb2F0KSB7XG4gICAgdGV4dHVyZVR5cGVzWydoYWxmIGZsb2F0J10gPSBHTF9IQUxGX0ZMT0FUX09FU1xuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfZGVwdGhfdGV4dHVyZSkge1xuICAgIGV4dGVuZCh0ZXh0dXJlRm9ybWF0cywge1xuICAgICAgJ2RlcHRoJzogR0xfREVQVEhfQ09NUE9ORU5ULFxuICAgICAgJ2RlcHRoIHN0ZW5jaWwnOiBHTF9ERVBUSF9TVEVOQ0lMXG4gICAgfSlcblxuICAgIGV4dGVuZCh0ZXh0dXJlVHlwZXMsIHtcbiAgICAgICd1aW50MTYnOiBHTF9VTlNJR05FRF9TSE9SVCxcbiAgICAgICd1aW50MzInOiBHTF9VTlNJR05FRF9JTlQsXG4gICAgICAnZGVwdGggc3RlbmNpbCc6IEdMX1VOU0lHTkVEX0lOVF8yNF84X1dFQkdMXG4gICAgfSlcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9zM3RjKSB7XG4gICAgZXh0ZW5kKGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cywge1xuICAgICAgJ3JnYiBzM3RjIGR4dDEnOiBHTF9DT01QUkVTU0VEX1JHQl9TM1RDX0RYVDFfRVhULFxuICAgICAgJ3JnYmEgczN0YyBkeHQxJzogR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUMV9FWFQsXG4gICAgICAncmdiYSBzM3RjIGR4dDMnOiBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQzX0VYVCxcbiAgICAgICdyZ2JhIHMzdGMgZHh0NSc6IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDVfRVhUXG4gICAgfSlcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9hdGMpIHtcbiAgICBleHRlbmQoY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzLCB7XG4gICAgICAncmdiIGFyYyc6IEdMX0NPTVBSRVNTRURfUkdCX0FUQ19XRUJHTCxcbiAgICAgICdyZ2JhIGF0YyBleHBsaWNpdCBhbHBoYSc6IEdMX0NPTVBSRVNTRURfUkdCQV9BVENfRVhQTElDSVRfQUxQSEFfV0VCR0wsXG4gICAgICAncmdiYSBhdGMgaW50ZXJwb2xhdGVkIGFscGhhJzogR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19JTlRFUlBPTEFURURfQUxQSEFfV0VCR0xcbiAgICB9KVxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29tcHJlc3NlZF90ZXh0dXJlX3B2cnRjKSB7XG4gICAgZXh0ZW5kKGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cywge1xuICAgICAgJ3JnYiBwdnJ0YyA0YnBwdjEnOiBHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ180QlBQVjFfSU1HLFxuICAgICAgJ3JnYiBwdnJ0YyAyYnBwdjEnOiBHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ18yQlBQVjFfSU1HLFxuICAgICAgJ3JnYmEgcHZydGMgNGJwcHYxJzogR0xfQ09NUFJFU1NFRF9SR0JBX1BWUlRDXzRCUFBWMV9JTUcsXG4gICAgICAncmdiYSBwdnJ0YyAyYnBwdjEnOiBHTF9DT01QUkVTU0VEX1JHQkFfUFZSVENfMkJQUFYxX0lNR1xuICAgIH0pXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb21wcmVzc2VkX3RleHR1cmVfZXRjMSkge1xuICAgIGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0c1sncmdiIGV0YzEnXSA9IEdMX0NPTVBSRVNTRURfUkdCX0VUQzFfV0VCR0xcbiAgfVxuXG4gIC8vIENvcHkgb3ZlciBhbGwgdGV4dHVyZSBmb3JtYXRzXG4gIHZhciBzdXBwb3J0ZWRDb21wcmVzc2VkRm9ybWF0cyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKFxuICAgIGdsLmdldFBhcmFtZXRlcihHTF9DT01QUkVTU0VEX1RFWFRVUkVfRk9STUFUUykpXG4gIE9iamVjdC5rZXlzKGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cykuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgIHZhciBmb3JtYXQgPSBjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHNbbmFtZV1cbiAgICBpZiAoc3VwcG9ydGVkQ29tcHJlc3NlZEZvcm1hdHMuaW5kZXhPZihmb3JtYXQpID49IDApIHtcbiAgICAgIHRleHR1cmVGb3JtYXRzW25hbWVdID0gZm9ybWF0XG4gICAgfVxuICB9KVxuXG4gIHZhciBzdXBwb3J0ZWRGb3JtYXRzID0gT2JqZWN0LmtleXModGV4dHVyZUZvcm1hdHMpXG4gIGxpbWl0cy50ZXh0dXJlRm9ybWF0cyA9IHN1cHBvcnRlZEZvcm1hdHNcblxuICB2YXIgY29sb3JGb3JtYXRzID0gc3VwcG9ydGVkRm9ybWF0cy5yZWR1Y2UoZnVuY3Rpb24gKGNvbG9yLCBrZXkpIHtcbiAgICB2YXIgZ2xlbnVtID0gdGV4dHVyZUZvcm1hdHNba2V5XVxuICAgIGlmIChnbGVudW0gPT09IEdMX0xVTUlOQU5DRSB8fFxuICAgICAgICBnbGVudW0gPT09IEdMX0FMUEhBIHx8XG4gICAgICAgIGdsZW51bSA9PT0gR0xfTFVNSU5BTkNFIHx8XG4gICAgICAgIGdsZW51bSA9PT0gR0xfTFVNSU5BTkNFX0FMUEhBIHx8XG4gICAgICAgIGdsZW51bSA9PT0gR0xfREVQVEhfQ09NUE9ORU5UIHx8XG4gICAgICAgIGdsZW51bSA9PT0gR0xfREVQVEhfU1RFTkNJTCkge1xuICAgICAgY29sb3JbZ2xlbnVtXSA9IGdsZW51bVxuICAgIH0gZWxzZSBpZiAoZ2xlbnVtID09PSBHTF9SR0I1X0ExIHx8IGtleS5pbmRleE9mKCdyZ2JhJykgPj0gMCkge1xuICAgICAgY29sb3JbZ2xlbnVtXSA9IEdMX1JHQkFcbiAgICB9IGVsc2Uge1xuICAgICAgY29sb3JbZ2xlbnVtXSA9IEdMX1JHQlxuICAgIH1cbiAgICByZXR1cm4gY29sb3JcbiAgfSwge30pXG5cbiAgLy8gUGl4ZWwgc3RvcmFnZSBwYXJzaW5nXG4gIGZ1bmN0aW9uIFBpeGVsSW5mbyAodGFyZ2V0KSB7XG4gICAgLy8gdGV4IHRhcmdldFxuICAgIHRoaXMudGFyZ2V0ID0gdGFyZ2V0XG5cbiAgICAvLyBwaXhlbFN0b3JlaSBpbmZvXG4gICAgdGhpcy5mbGlwWSA9IGZhbHNlXG4gICAgdGhpcy5wcmVtdWx0aXBseUFscGhhID0gZmFsc2VcbiAgICB0aGlzLnVucGFja0FsaWdubWVudCA9IDFcbiAgICB0aGlzLmNvbG9yU3BhY2UgPSAwXG5cbiAgICAvLyBzaGFwZVxuICAgIHRoaXMud2lkdGggPSAwXG4gICAgdGhpcy5oZWlnaHQgPSAwXG4gICAgdGhpcy5jaGFubmVscyA9IDBcblxuICAgIC8vIGZvcm1hdCBhbmQgdHlwZVxuICAgIHRoaXMuZm9ybWF0ID0gMFxuICAgIHRoaXMuaW50ZXJuYWxmb3JtYXQgPSAwXG4gICAgdGhpcy50eXBlID0gMFxuICAgIHRoaXMuY29tcHJlc3NlZCA9IGZhbHNlXG5cbiAgICAvLyBtaXAgbGV2ZWxcbiAgICB0aGlzLm1pcGxldmVsID0gMFxuXG4gICAgLy8gbmRhcnJheS1saWtlIHBhcmFtZXRlcnNcbiAgICB0aGlzLnN0cmlkZVggPSAwXG4gICAgdGhpcy5zdHJpZGVZID0gMFxuICAgIHRoaXMuc3RyaWRlQyA9IDBcbiAgICB0aGlzLm9mZnNldCA9IDBcblxuICAgIC8vIGNvcHkgcGl4ZWxzIGluZm9cbiAgICB0aGlzLnggPSAwXG4gICAgdGhpcy55ID0gMFxuICAgIHRoaXMuY29weSA9IGZhbHNlXG5cbiAgICAvLyBkYXRhIHNvdXJjZXNcbiAgICB0aGlzLmRhdGEgPSBudWxsXG4gICAgdGhpcy5pbWFnZSA9IG51bGxcbiAgICB0aGlzLnZpZGVvID0gbnVsbFxuICAgIHRoaXMuY2FudmFzID0gbnVsbFxuICAgIHRoaXMueGhyID0gbnVsbFxuXG4gICAgLy8gQ09SU1xuICAgIHRoaXMuY3Jvc3NPcmlnaW4gPSBudWxsXG5cbiAgICAvLyBob3JyaWJsZSBzdGF0ZSBmbGFnc1xuICAgIHRoaXMubmVlZHNQb2xsID0gZmFsc2VcbiAgICB0aGlzLm5lZWRzTGlzdGVuZXJzID0gZmFsc2VcbiAgfVxuXG4gIGV4dGVuZChQaXhlbEluZm8ucHJvdG90eXBlLCB7XG4gICAgcGFyc2VGbGFnczogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucyAhPT0gJ29iamVjdCcgfHwgIW9wdGlvbnMpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG5cbiAgICAgIGlmICgncHJlbXVsdGlwbHlBbHBoYScgaW4gb3B0aW9ucykge1xuICAgICAgICBjaGVjay50eXBlKG9wdGlvbnMucHJlbXVsdGlwbHlBbHBoYSwgJ2Jvb2xlYW4nLFxuICAgICAgICAgICdpbnZhbGlkIHByZW11bHRpcGx5QWxwaGEnKVxuICAgICAgICB0aGlzLnByZW11bHRpcGx5QWxwaGEgPSBvcHRpb25zLnByZW11bHRpcGx5QWxwaGFcbiAgICAgIH1cblxuICAgICAgaWYgKCdmbGlwWScgaW4gb3B0aW9ucykge1xuICAgICAgICBjaGVjay50eXBlKG9wdGlvbnMuZmxpcFksICdib29sZWFuJyxcbiAgICAgICAgICAnaW52YWxpZCB0ZXh0dXJlIGZsaXAnKVxuICAgICAgICB0aGlzLmZsaXBZID0gb3B0aW9ucy5mbGlwWVxuICAgICAgfVxuXG4gICAgICBpZiAoJ2FsaWdubWVudCcgaW4gb3B0aW9ucykge1xuICAgICAgICBjaGVjay5vbmVPZihvcHRpb25zLmFsaWdubWVudCwgWzEsIDIsIDQsIDhdLFxuICAgICAgICAgICdpbnZhbGlkIHRleHR1cmUgdW5wYWNrIGFsaWdubWVudCcpXG4gICAgICAgIHRoaXMudW5wYWNrQWxpZ25tZW50ID0gb3B0aW9ucy5hbGlnbm1lbnRcbiAgICAgIH1cblxuICAgICAgaWYgKCdjb2xvclNwYWNlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIGNoZWNrLnBhcmFtZXRlcihvcHRpb25zLmNvbG9yU3BhY2UsIGNvbG9yU3BhY2UsXG4gICAgICAgICAgJ2ludmFsaWQgY29sb3JTcGFjZScpXG4gICAgICAgIHRoaXMuY29sb3JTcGFjZSA9IGNvbG9yU3BhY2Vbb3B0aW9ucy5jb2xvclNwYWNlXVxuICAgICAgfVxuXG4gICAgICBpZiAoJ2Zvcm1hdCcgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgZm9ybWF0ID0gb3B0aW9ucy5mb3JtYXRcbiAgICAgICAgY2hlY2sucGFyYW1ldGVyKGZvcm1hdCwgdGV4dHVyZUZvcm1hdHMsXG4gICAgICAgICAgJ2ludmFsaWQgdGV4dHVyZSBmb3JtYXQnKVxuICAgICAgICB0aGlzLmludGVybmFsZm9ybWF0ID0gdGV4dHVyZUZvcm1hdHNbZm9ybWF0XVxuICAgICAgICBpZiAoZm9ybWF0IGluIHRleHR1cmVUeXBlcykge1xuICAgICAgICAgIHRoaXMudHlwZSA9IHRleHR1cmVUeXBlc1tmb3JtYXRdXG4gICAgICAgIH1cbiAgICAgICAgaWYgKGZvcm1hdCBpbiBjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHMpIHtcbiAgICAgICAgICB0aGlzLmNvbXByZXNzZWQgPSB0cnVlXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKCd0eXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciB0eXBlID0gb3B0aW9ucy50eXBlXG4gICAgICAgIGNoZWNrLnBhcmFtZXRlcih0eXBlLCB0ZXh0dXJlVHlwZXMsXG4gICAgICAgICAgJ2ludmFsaWQgdGV4dHVyZSB0eXBlJylcbiAgICAgICAgdGhpcy50eXBlID0gdGV4dHVyZVR5cGVzW3R5cGVdXG4gICAgICB9XG5cbiAgICAgIHZhciB3ID0gdGhpcy53aWR0aFxuICAgICAgdmFyIGggPSB0aGlzLmhlaWdodFxuICAgICAgdmFyIGMgPSB0aGlzLmNoYW5uZWxzXG4gICAgICBpZiAoJ3NoYXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIGNoZWNrKEFycmF5LmlzQXJyYXkob3B0aW9ucy5zaGFwZSkgJiYgb3B0aW9ucy5zaGFwZS5sZW5ndGggPj0gMixcbiAgICAgICAgICAnc2hhcGUgbXVzdCBiZSBhbiBhcnJheScpXG4gICAgICAgIHcgPSBvcHRpb25zLnNoYXBlWzBdXG4gICAgICAgIGggPSBvcHRpb25zLnNoYXBlWzFdXG4gICAgICAgIGlmIChvcHRpb25zLnNoYXBlLmxlbmd0aCA9PT0gMykge1xuICAgICAgICAgIGMgPSBvcHRpb25zLnNoYXBlWzJdXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmICgncmFkaXVzJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgdyA9IGggPSBvcHRpb25zLnJhZGl1c1xuICAgICAgICB9XG4gICAgICAgIGlmICgnd2lkdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB3ID0gb3B0aW9ucy53aWR0aFxuICAgICAgICB9XG4gICAgICAgIGlmICgnaGVpZ2h0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgaCA9IG9wdGlvbnMuaGVpZ2h0XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCdjaGFubmVscycgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGMgPSBvcHRpb25zLmNoYW5uZWxzXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHRoaXMud2lkdGggPSB3IHwgMFxuICAgICAgdGhpcy5oZWlnaHQgPSBoIHwgMFxuICAgICAgdGhpcy5jaGFubmVscyA9IGMgfCAwXG5cbiAgICAgIGlmICgnc3RyaWRlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBzdHJpZGUgPSBvcHRpb25zLnN0cmlkZVxuICAgICAgICBjaGVjayhBcnJheS5pc0FycmF5KHN0cmlkZSkgJiYgc3RyaWRlLmxlbmd0aCA+PSAyLFxuICAgICAgICAgICdpbnZhbGlkIHN0cmlkZSB2ZWN0b3InKVxuICAgICAgICB0aGlzLnN0cmlkZVggPSBzdHJpZGVbMF1cbiAgICAgICAgdGhpcy5zdHJpZGVZID0gc3RyaWRlWzFdXG4gICAgICAgIGlmIChzdHJpZGUubGVuZ3RoID09PSAzKSB7XG4gICAgICAgICAgdGhpcy5zdHJpZGVDID0gc3RyaWRlWzJdXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5zdHJpZGVDID0gMVxuICAgICAgICB9XG4gICAgICAgIHRoaXMubmVlZHNUcmFuc3Bvc2UgPSB0cnVlXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLnN0cmlkZUMgPSAxXG4gICAgICAgIHRoaXMuc3RyaWRlWCA9IHRoaXMuc3RyaWRlQyAqIGNcbiAgICAgICAgdGhpcy5zdHJpZGVZID0gdGhpcy5zdHJpZGVYICogd1xuICAgICAgfVxuXG4gICAgICBpZiAoJ29mZnNldCcgaW4gb3B0aW9ucykge1xuICAgICAgICB0aGlzLm9mZnNldCA9IG9wdGlvbnMub2Zmc2V0IHwgMFxuICAgICAgICB0aGlzLm5lZWRzVHJhbnNwb3NlID0gdHJ1ZVxuICAgICAgfVxuXG4gICAgICBpZiAoJ2Nyb3NzT3JpZ2luJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHRoaXMuY3Jvc3NPcmlnaW4gPSBvcHRpb25zLmNyb3NzT3JpZ2luXG4gICAgICB9XG4gICAgfSxcbiAgICBwYXJzZTogZnVuY3Rpb24gKG9wdGlvbnMsIG1pcGxldmVsKSB7XG4gICAgICB0aGlzLm1pcGxldmVsID0gbWlwbGV2ZWxcbiAgICAgIHRoaXMud2lkdGggPSB0aGlzLndpZHRoID4+IG1pcGxldmVsXG4gICAgICB0aGlzLmhlaWdodCA9IHRoaXMuaGVpZ2h0ID4+IG1pcGxldmVsXG5cbiAgICAgIHZhciBkYXRhID0gb3B0aW9uc1xuICAgICAgc3dpdGNoICh0eXBlb2Ygb3B0aW9ucykge1xuICAgICAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICAgICAgaWYgKCFvcHRpb25zKSB7XG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICB9XG4gICAgICAgICAgdGhpcy5wYXJzZUZsYWdzKG9wdGlvbnMpXG4gICAgICAgICAgaWYgKGlzUGl4ZWxEYXRhKG9wdGlvbnMuZGF0YSkpIHtcbiAgICAgICAgICAgIGRhdGEgPSBvcHRpb25zLmRhdGFcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSAndW5kZWZpbmVkJzpcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICBjaGVjay5yYWlzZSgnaW52YWxpZCBwaXhlbCBkYXRhIHR5cGUnKVxuICAgICAgfVxuXG4gICAgICBpZiAodHlwZW9mIGRhdGEgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGRhdGEgPSBsb2FkVGV4dHVyZShkYXRhLCB0aGlzLmNyb3NzT3JpZ2luKVxuICAgICAgfVxuXG4gICAgICB2YXIgYXJyYXkgPSBudWxsXG4gICAgICB2YXIgbmVlZHNDb252ZXJ0ID0gZmFsc2VcblxuICAgICAgaWYgKHRoaXMuY29tcHJlc3NlZCkge1xuICAgICAgICBjaGVjayhkYXRhIGluc3RhbmNlb2YgVWludDhBcnJheSB8fCBpc1BlbmRpbmdYSFIoZGF0YSksXG4gICAgICAgICAgJ2NvbXByZXNzZWQgdGV4dHVyZSBkYXRhIG11c3QgYmUgc3RvcmVkIGluIGEgdWludDhhcnJheScpXG4gICAgICB9XG5cbiAgICAgIGlmIChkYXRhID09PSBudWxsKSB7XG4gICAgICAgIC8vIFRPRE9cbiAgICAgIH0gZWxzZSBpZiAoaXNUeXBlZEFycmF5KGRhdGEpKSB7XG4gICAgICAgIHRoaXMuZGF0YSA9IGRhdGFcbiAgICAgIH0gZWxzZSBpZiAoaXNOdW1lcmljQXJyYXkoZGF0YSkpIHtcbiAgICAgICAgYXJyYXkgPSBkYXRhXG4gICAgICAgIG5lZWRzQ29udmVydCA9IHRydWVcbiAgICAgIH0gZWxzZSBpZiAoaXNOREFycmF5TGlrZShkYXRhKSkge1xuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShkYXRhLmRhdGEpKSB7XG4gICAgICAgICAgYXJyYXkgPSBkYXRhLmRhdGFcbiAgICAgICAgICBuZWVkc0NvbnZlcnQgPSB0cnVlXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5kYXRhID0gZGF0YS5kYXRhXG4gICAgICAgIH1cbiAgICAgICAgdmFyIHNoYXBlID0gZGF0YS5zaGFwZVxuICAgICAgICB0aGlzLndpZHRoID0gc2hhcGVbMF1cbiAgICAgICAgdGhpcy5oZWlnaHQgPSBzaGFwZVsxXVxuICAgICAgICBpZiAoc2hhcGUubGVuZ3RoID09PSAzKSB7XG4gICAgICAgICAgdGhpcy5jaGFubmVscyA9IHNoYXBlWzJdXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5jaGFubmVscyA9IDFcbiAgICAgICAgfVxuICAgICAgICB2YXIgc3RyaWRlID0gZGF0YS5zdHJpZGVcbiAgICAgICAgdGhpcy5zdHJpZGVYID0gZGF0YS5zdHJpZGVbMF1cbiAgICAgICAgdGhpcy5zdHJpZGVZID0gZGF0YS5zdHJpZGVbMV1cbiAgICAgICAgaWYgKHN0cmlkZS5sZW5ndGggPT09IDMpIHtcbiAgICAgICAgICB0aGlzLnN0cmlkZUMgPSBkYXRhLnN0cmlkZVsyXVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMuc3RyaWRlQyA9IDFcbiAgICAgICAgfVxuICAgICAgICB0aGlzLm9mZnNldCA9IGRhdGEub2Zmc2V0XG4gICAgICAgIHRoaXMubmVlZHNUcmFuc3Bvc2UgPSB0cnVlXG4gICAgICB9IGVsc2UgaWYgKGlzQ2FudmFzRWxlbWVudChkYXRhKSB8fCBpc0NvbnRleHQyRChkYXRhKSkge1xuICAgICAgICBpZiAoaXNDYW52YXNFbGVtZW50KGRhdGEpKSB7XG4gICAgICAgICAgdGhpcy5jYW52YXMgPSBkYXRhXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5jYW52YXMgPSBkYXRhLmNhbnZhc1xuICAgICAgICB9XG4gICAgICAgIHRoaXMud2lkdGggPSB0aGlzLmNhbnZhcy53aWR0aFxuICAgICAgICB0aGlzLmhlaWdodCA9IHRoaXMuY2FudmFzLmhlaWdodFxuICAgICAgICB0aGlzLnNldERlZmF1bHRGb3JtYXQoKVxuICAgICAgfSBlbHNlIGlmIChpc0ltYWdlRWxlbWVudChkYXRhKSkge1xuICAgICAgICB0aGlzLmltYWdlID0gZGF0YVxuICAgICAgICBpZiAoIWRhdGEuY29tcGxldGUpIHtcbiAgICAgICAgICB0aGlzLndpZHRoID0gdGhpcy53aWR0aCB8fCBkYXRhLm5hdHVyYWxXaWR0aFxuICAgICAgICAgIHRoaXMuaGVpZ2h0ID0gdGhpcy5oZWlnaHQgfHwgZGF0YS5uYXR1cmFsSGVpZ2h0XG4gICAgICAgICAgdGhpcy5uZWVkc0xpc3RlbmVycyA9IHRydWVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLndpZHRoID0gZGF0YS5uYXR1cmFsV2lkdGhcbiAgICAgICAgICB0aGlzLmhlaWdodCA9IGRhdGEubmF0dXJhbEhlaWdodFxuICAgICAgICB9XG4gICAgICAgIHRoaXMuc2V0RGVmYXVsdEZvcm1hdCgpXG4gICAgICB9IGVsc2UgaWYgKGlzVmlkZW9FbGVtZW50KGRhdGEpKSB7XG4gICAgICAgIHRoaXMudmlkZW8gPSBkYXRhXG4gICAgICAgIGlmIChkYXRhLnJlYWR5U3RhdGUgPiAxKSB7XG4gICAgICAgICAgdGhpcy53aWR0aCA9IGRhdGEud2lkdGhcbiAgICAgICAgICB0aGlzLmhlaWdodCA9IGRhdGEuaGVpZ2h0XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy53aWR0aCA9IHRoaXMud2lkdGggfHwgZGF0YS53aWR0aFxuICAgICAgICAgIHRoaXMuaGVpZ2h0ID0gdGhpcy5oZWlnaHQgfHwgZGF0YS5oZWlnaHRcbiAgICAgICAgICB0aGlzLm5lZWRzTGlzdGVuZXJzID0gdHJ1ZVxuICAgICAgICB9XG4gICAgICAgIHRoaXMubmVlZHNQb2xsID0gdHJ1ZVxuICAgICAgICB0aGlzLnNldERlZmF1bHRGb3JtYXQoKVxuICAgICAgfSBlbHNlIGlmIChpc1BlbmRpbmdYSFIoZGF0YSkpIHtcbiAgICAgICAgdGhpcy54aHIgPSBkYXRhXG4gICAgICAgIHRoaXMubmVlZHNMaXN0ZW5lcnMgPSB0cnVlXG4gICAgICB9IGVsc2UgaWYgKGlzUmVjdEFycmF5KGRhdGEpKSB7XG4gICAgICAgIHZhciB3ID0gZGF0YS5sZW5ndGhcbiAgICAgICAgdmFyIGggPSBkYXRhWzBdLmxlbmd0aFxuICAgICAgICB2YXIgYyA9IDFcbiAgICAgICAgdmFyIGksIGosIGssIHBcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YVswXVswXSkpIHtcbiAgICAgICAgICBjID0gZGF0YVswXVswXS5sZW5ndGhcbiAgICAgICAgICBjaGVjayhjID49IDAgJiYgYyA8PSA0LCAnaW52YWxpZCBudW1iZXIgb2YgY2hhbm5lbHMgZm9yIGltYWdlIGRhdGEnKVxuICAgICAgICAgIGFycmF5ID0gQXJyYXkodyAqIGggKiBjKVxuICAgICAgICAgIHAgPSAwXG4gICAgICAgICAgZm9yIChqID0gMDsgaiA8IGg7ICsraikge1xuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IHc7ICsraSkge1xuICAgICAgICAgICAgICBmb3IgKGsgPSAwOyBrIDwgYzsgKytrKSB7XG4gICAgICAgICAgICAgICAgYXJyYXlbcCsrXSA9IGRhdGFbaV1bal1ba11cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBhcnJheSA9IEFycmF5KHcgKiBoKVxuICAgICAgICAgIHAgPSAwXG4gICAgICAgICAgZm9yIChqID0gMDsgaiA8IGg7ICsraikge1xuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IHc7ICsraSkge1xuICAgICAgICAgICAgICBhcnJheVtwKytdID0gZGF0YVtpXVtqXVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLndpZHRoID0gd1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhcbiAgICAgICAgdGhpcy5jaGFubmVscyA9IGNcbiAgICAgICAgbmVlZHNDb252ZXJ0ID0gdHJ1ZVxuICAgICAgfSBlbHNlIGlmIChvcHRpb25zLmNvcHkpIHtcbiAgICAgICAgdGhpcy5jb3B5ID0gdHJ1ZVxuICAgICAgICB0aGlzLnggPSB0aGlzLnggfCAwXG4gICAgICAgIHRoaXMueSA9IHRoaXMueSB8IDBcbiAgICAgICAgdGhpcy53aWR0aCA9ICh0aGlzLndpZHRoIHx8IHZpZXdwb3J0U3RhdGUud2lkdGgpIHwgMFxuICAgICAgICB0aGlzLmhlaWdodCA9ICh0aGlzLmhlaWdodCB8fCB2aWV3cG9ydFN0YXRlLmhlaWdodCkgfCAwXG4gICAgICAgIHRoaXMuc2V0RGVmYXVsdEZvcm1hdCgpXG4gICAgICB9XG5cbiAgICAgIC8vIEZpeCB1cCBtaXNzaW5nIHR5cGUgaW5mbyBmb3IgdHlwZWQgYXJyYXlzXG4gICAgICBpZiAoIXRoaXMudHlwZSAmJiB0aGlzLmRhdGEpIHtcbiAgICAgICAgaWYgKHRoaXMuZm9ybWF0ID09PSBHTF9ERVBUSF9DT01QT05FTlQpIHtcbiAgICAgICAgICBpZiAodGhpcy5kYXRhIGluc3RhbmNlb2YgVWludDE2QXJyYXkpIHtcbiAgICAgICAgICAgIHRoaXMudHlwZSA9IEdMX1VOU0lHTkVEX1NIT1JUXG4gICAgICAgICAgfSBlbHNlIGlmICh0aGlzLmRhdGEgaW5zdGFuY2VvZiBVaW50MzJBcnJheSkge1xuICAgICAgICAgICAgdGhpcy50eXBlID0gR0xfVU5TSUdORURfSU5UXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuZGF0YSBpbnN0YW5jZW9mIEZsb2F0MzJBcnJheSkge1xuICAgICAgICAgIHRoaXMudHlwZSA9IEdMX0ZMT0FUXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gSW5mZXIgZGVmYXVsdCBmb3JtYXRcbiAgICAgIGlmICghdGhpcy5pbnRlcm5hbGZvcm1hdCkge1xuICAgICAgICB2YXIgY2hhbm5lbHMgPSB0aGlzLmNoYW5uZWxzID0gdGhpcy5jaGFubmVscyB8fCA0XG4gICAgICAgIHRoaXMuaW50ZXJuYWxmb3JtYXQgPSBbXG4gICAgICAgICAgR0xfTFVNSU5BTkNFLFxuICAgICAgICAgIEdMX0xVTUlOQU5DRV9BTFBIQSxcbiAgICAgICAgICBHTF9SR0IsXG4gICAgICAgICAgR0xfUkdCQV1bY2hhbm5lbHMgLSAxXVxuICAgICAgICBjaGVjayh0aGlzLmludGVybmFsZm9ybWF0LCAnaW52YWxpZCBudW1iZXIgb2YgY2hhbm5lbHMnKVxuICAgICAgfVxuXG4gICAgICB2YXIgZm9ybWF0ID0gdGhpcy5pbnRlcm5hbGZvcm1hdFxuICAgICAgaWYgKGZvcm1hdCA9PT0gR0xfREVQVEhfQ09NUE9ORU5UIHx8IGZvcm1hdCA9PT0gR0xfREVQVEhfU1RFTkNJTCkge1xuICAgICAgICBjaGVjayhleHRlbnNpb25zLndlYmdsX2RlcHRoX3RleHR1cmUsXG4gICAgICAgICAgJ2RlcHRoL3N0ZW5jaWwgdGV4dHVyZSBub3Qgc3VwcG9ydGVkJylcbiAgICAgICAgaWYgKGZvcm1hdCA9PT0gR0xfREVQVEhfQ09NUE9ORU5UKSB7XG4gICAgICAgICAgY2hlY2sodGhpcy50eXBlID09PSBHTF9VTlNJR05FRF9TSE9SVCB8fCBHTF9VTlNJR05FRF9JTlQsXG4gICAgICAgICAgICAnZGVwdGggdGV4dHVyZSB0eXBlIG11c3QgYmUgdWludDE2IG9yIHVpbnQzMicpXG4gICAgICAgIH1cbiAgICAgICAgaWYgKGZvcm1hdCA9PT0gR0xfREVQVEhfU1RFTkNJTCkge1xuICAgICAgICAgIGNoZWNrKHRoaXMudHlwZSA9PT0gR0xfVU5TSUdORURfSU5UXzI0XzhfV0VCR0wsXG4gICAgICAgICAgICAnZGVwdGggc3RlbmNpbCB0ZXh0dXJlIGZvcm1hdCBtdXN0IG1hdGNoIHR5cGUnKVxuICAgICAgICB9XG4gICAgICAgIGNoZWNrKFxuICAgICAgICAgICF0aGlzLmRhdGEgJiYgIWFycmF5ICYmICF0aGlzLmltYWdlICYmICF0aGlzLnZpZGVvICYmICF0aGlzLmNhbnZhcyxcbiAgICAgICAgICAnZGVwdGgvc3RlbmNpbCB0ZXh0dXJlcyBhcmUgZm9yIHJlbmRlcmluZyBvbmx5JylcbiAgICAgIH1cblxuICAgICAgLy8gQ29tcHV0ZSBjb2xvciBmb3JtYXQgYW5kIG51bWJlciBvZiBjaGFubmVsc1xuICAgICAgdmFyIGNvbG9yRm9ybWF0ID0gdGhpcy5mb3JtYXQgPSBjb2xvckZvcm1hdHNbZm9ybWF0XVxuICAgICAgaWYgKCF0aGlzLmNoYW5uZWxzKSB7XG4gICAgICAgIHN3aXRjaCAoY29sb3JGb3JtYXQpIHtcbiAgICAgICAgICBjYXNlIEdMX0xVTUlOQU5DRTpcbiAgICAgICAgICBjYXNlIEdMX0FMUEhBOlxuICAgICAgICAgIGNhc2UgR0xfREVQVEhfQ09NUE9ORU5UOlxuICAgICAgICAgICAgdGhpcy5jaGFubmVscyA9IDFcbiAgICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgICBjYXNlIEdMX0RFUFRIX1NURU5DSUw6XG4gICAgICAgICAgY2FzZSBHTF9MVU1JTkFOQ0VfQUxQSEE6XG4gICAgICAgICAgICB0aGlzLmNoYW5uZWxzID0gMlxuICAgICAgICAgICAgYnJlYWtcblxuICAgICAgICAgIGNhc2UgR0xfUkdCOlxuICAgICAgICAgICAgdGhpcy5jaGFubmVscyA9IDNcbiAgICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgdGhpcy5jaGFubmVscyA9IDRcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBDaGVjayB0aGF0IHRleHR1cmUgdHlwZSBpcyBzdXBwb3J0ZWRcbiAgICAgIHZhciB0eXBlID0gdGhpcy50eXBlXG4gICAgICBpZiAodHlwZSA9PT0gR0xfRkxPQVQpIHtcbiAgICAgICAgY2hlY2soZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9mbG9hdCxcbiAgICAgICAgICAnZmxvYXQgdGV4dHVyZSBub3Qgc3VwcG9ydGVkJylcbiAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gR0xfSEFMRl9GTE9BVF9PRVMpIHtcbiAgICAgICAgY2hlY2soZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9oYWxmX2Zsb2F0LFxuICAgICAgICAgICdoYWxmIGZsb2F0IHRleHR1cmUgbm90IHN1cHBvcnRlZCcpXG4gICAgICB9IGVsc2UgaWYgKCF0eXBlKSB7XG4gICAgICAgIGlmIChmb3JtYXQgPT09IEdMX0RFUFRIX0NPTVBPTkVOVCkge1xuICAgICAgICAgIHR5cGUgPSBHTF9VTlNJR05FRF9JTlRcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0eXBlID0gR0xfVU5TSUdORURfQllURVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICB0aGlzLnR5cGUgPSB0eXBlXG5cbiAgICAgIC8vIGFwcGx5IGNvbnZlcnNpb25cbiAgICAgIGlmIChuZWVkc0NvbnZlcnQpIHtcbiAgICAgICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9CWVRFOlxuICAgICAgICAgICAgdGhpcy5kYXRhID0gbmV3IFVpbnQ4QXJyYXkoYXJyYXkpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlQ6XG4gICAgICAgICAgICB0aGlzLmRhdGEgPSBuZXcgVWludDE2QXJyYXkoYXJyYXkpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfSU5UOlxuICAgICAgICAgICAgdGhpcy5kYXRhID0gbmV3IFVpbnQzMkFycmF5KGFycmF5KVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlIEdMX0ZMT0FUOlxuICAgICAgICAgICAgdGhpcy5kYXRhID0gbmV3IEZsb2F0MzJBcnJheShhcnJheSlcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSBHTF9IQUxGX0ZMT0FUX09FUzpcbiAgICAgICAgICAgIHRoaXMuZGF0YSA9IGNvbnZlcnRUb0hhbGZGbG9hdChhcnJheSlcbiAgICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUXzVfNl81OlxuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlRfNV81XzVfMTpcbiAgICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUXzRfNF80XzQ6XG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9JTlRfMjRfOF9XRUJHTDpcbiAgICAgICAgICAgIGNoZWNrLnJhaXNlKCd1bnN1cHBvcnRlZCBmb3JtYXQgZm9yIGF1dG9tYXRpYyBjb252ZXJzaW9uJylcbiAgICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgY2hlY2sucmFpc2UoJ3Vuc3VwcG9ydGVkIHR5cGUgY29udmVyc2lvbicpXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMuZGF0YSkge1xuICAgICAgICAvLyBhcHBseSB0cmFuc3Bvc2VcbiAgICAgICAgaWYgKHRoaXMubmVlZHNUcmFuc3Bvc2UpIHtcbiAgICAgICAgICB0aGlzLmRhdGEgPSB0cmFuc3Bvc2VQaXhlbHMoXG4gICAgICAgICAgICB0aGlzLmRhdGEsXG4gICAgICAgICAgICB0aGlzLndpZHRoLFxuICAgICAgICAgICAgdGhpcy5oZWlnaHQsXG4gICAgICAgICAgICB0aGlzLmNoYW5uZWxzLFxuICAgICAgICAgICAgdGhpcy5zdHJpZGVYLFxuICAgICAgICAgICAgdGhpcy5zdHJpZGVZLFxuICAgICAgICAgICAgdGhpcy5zdHJpZGVDLFxuICAgICAgICAgICAgdGhpcy5vZmZzZXQpXG4gICAgICAgIH1cbiAgICAgICAgLy8gY2hlY2sgZGF0YSB0eXBlXG4gICAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfQllURTpcbiAgICAgICAgICAgIGNoZWNrKHRoaXMuZGF0YSBpbnN0YW5jZW9mIFVpbnQ4QXJyYXkgfHxcbiAgICAgICAgICAgICAgICAgIHRoaXMuZGF0YSBpbnN0YW5jZW9mIFVpbnQ4Q2xhbXBlZEFycmF5LFxuICAgICAgICAgICAgICAgICAgJ2luY29tcGF0aWJsZSBwaXhlbCB0eXBlJylcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9TSE9SVF81XzZfNTpcbiAgICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUXzVfNV81XzE6XG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9TSE9SVF80XzRfNF80OlxuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlQ6XG4gICAgICAgICAgY2FzZSBHTF9IQUxGX0ZMT0FUX09FUzpcbiAgICAgICAgICAgIGNoZWNrKHRoaXMuZGF0YSBpbnN0YW5jZW9mIFVpbnQxNkFycmF5LFxuICAgICAgICAgICAgICAgICAgJ2luY29tcGF0aWJsZSBwaXhlbCB0eXBlJylcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9JTlQ6XG4gICAgICAgICAgICBjaGVjayh0aGlzLmRhdGEgaW5zdGFuY2VvZiBVaW50MzJBcnJheSxcbiAgICAgICAgICAgICAgICAgICdpbmNvbXBhdGlibGUgcGl4ZWwgdHlwZScpXG4gICAgICAgICAgICBicmVha1xuXG4gICAgICAgICAgY2FzZSBHTF9GTE9BVDpcbiAgICAgICAgICAgIGNoZWNrKHRoaXMuZGF0YSBpbnN0YW5jZW9mIEZsb2F0MzJBcnJheSxcbiAgICAgICAgICAgICAgICAgICdpbmNvbXBhdGlibGUgcGl4ZWwgdHlwZScpXG4gICAgICAgICAgICBicmVha1xuXG4gICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIGNoZWNrLnJhaXNlKCdiYWQgb3IgbWlzc2luZyBwaXhlbCB0eXBlJylcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICB0aGlzLm5lZWRzVHJhbnNwb3NlID0gZmFsc2VcbiAgICB9LFxuXG4gICAgc2V0RGVmYXVsdEZvcm1hdDogZnVuY3Rpb24gKCkge1xuICAgICAgdGhpcy5mb3JtYXQgPSB0aGlzLmludGVybmFsZm9ybWF0ID0gR0xfUkdCQVxuICAgICAgdGhpcy50eXBlID0gR0xfVU5TSUdORURfQllURVxuICAgICAgdGhpcy5jaGFubmVscyA9IDRcbiAgICAgIHRoaXMuY29tcHJlc3NlZCA9IGZhbHNlXG4gICAgfSxcblxuICAgIHVwbG9hZDogZnVuY3Rpb24gKHBhcmFtcykge1xuICAgICAgZ2wucGl4ZWxTdG9yZWkoR0xfVU5QQUNLX0ZMSVBfWV9XRUJHTCwgdGhpcy5mbGlwWSlcbiAgICAgIGdsLnBpeGVsU3RvcmVpKEdMX1VOUEFDS19QUkVNVUxUSVBMWV9BTFBIQV9XRUJHTCwgdGhpcy5wcmVtdWx0aXBseUFscGhhKVxuICAgICAgZ2wucGl4ZWxTdG9yZWkoR0xfVU5QQUNLX0NPTE9SU1BBQ0VfQ09OVkVSU0lPTl9XRUJHTCwgdGhpcy5jb2xvclNwYWNlKVxuICAgICAgZ2wucGl4ZWxTdG9yZWkoR0xfVU5QQUNLX0FMSUdOTUVOVCwgdGhpcy51bnBhY2tBbGlnbm1lbnQpXG5cbiAgICAgIHZhciB0YXJnZXQgPSB0aGlzLnRhcmdldFxuICAgICAgdmFyIG1pcGxldmVsID0gdGhpcy5taXBsZXZlbFxuICAgICAgdmFyIGltYWdlID0gdGhpcy5pbWFnZVxuICAgICAgdmFyIGNhbnZhcyA9IHRoaXMuY2FudmFzXG4gICAgICB2YXIgdmlkZW8gPSB0aGlzLnZpZGVvXG4gICAgICB2YXIgZGF0YSA9IHRoaXMuZGF0YVxuICAgICAgdmFyIGludGVybmFsZm9ybWF0ID0gdGhpcy5pbnRlcm5hbGZvcm1hdFxuICAgICAgdmFyIGZvcm1hdCA9IHRoaXMuZm9ybWF0XG4gICAgICB2YXIgdHlwZSA9IHRoaXMudHlwZVxuICAgICAgdmFyIHdpZHRoID0gdGhpcy53aWR0aCB8fCBNYXRoLm1heCgxLCBwYXJhbXMud2lkdGggPj4gbWlwbGV2ZWwpXG4gICAgICB2YXIgaGVpZ2h0ID0gdGhpcy5oZWlnaHQgfHwgTWF0aC5tYXgoMSwgcGFyYW1zLmhlaWdodCA+PiBtaXBsZXZlbClcbiAgICAgIGlmICh2aWRlbyAmJiB2aWRlby5yZWFkeVN0YXRlID4gMikge1xuICAgICAgICBnbC50ZXhJbWFnZTJEKHRhcmdldCwgbWlwbGV2ZWwsIGZvcm1hdCwgZm9ybWF0LCB0eXBlLCB2aWRlbylcbiAgICAgIH0gZWxzZSBpZiAoaW1hZ2UgJiYgaW1hZ2UuY29tcGxldGUpIHtcbiAgICAgICAgZ2wudGV4SW1hZ2UyRCh0YXJnZXQsIG1pcGxldmVsLCBmb3JtYXQsIGZvcm1hdCwgdHlwZSwgaW1hZ2UpXG4gICAgICB9IGVsc2UgaWYgKGNhbnZhcykge1xuICAgICAgICBnbC50ZXhJbWFnZTJEKHRhcmdldCwgbWlwbGV2ZWwsIGZvcm1hdCwgZm9ybWF0LCB0eXBlLCBjYW52YXMpXG4gICAgICB9IGVsc2UgaWYgKHRoaXMuY29tcHJlc3NlZCkge1xuICAgICAgICBnbC5jb21wcmVzc2VkVGV4SW1hZ2UyRCh0YXJnZXQsIG1pcGxldmVsLCBpbnRlcm5hbGZvcm1hdCwgd2lkdGgsIGhlaWdodCwgMCwgZGF0YSlcbiAgICAgIH0gZWxzZSBpZiAodGhpcy5jb3B5KSB7XG4gICAgICAgIHJlZ2xQb2xsKClcbiAgICAgICAgZ2wuY29weVRleEltYWdlMkQodGFyZ2V0LCBtaXBsZXZlbCwgZm9ybWF0LCB0aGlzLngsIHRoaXMueSwgd2lkdGgsIGhlaWdodCwgMClcbiAgICAgIH0gZWxzZSBpZiAoZGF0YSkge1xuICAgICAgICBnbC50ZXhJbWFnZTJEKHRhcmdldCwgbWlwbGV2ZWwsIGZvcm1hdCwgd2lkdGgsIGhlaWdodCwgMCwgZm9ybWF0LCB0eXBlLCBkYXRhKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZ2wudGV4SW1hZ2UyRCh0YXJnZXQsIG1pcGxldmVsLCBmb3JtYXQsIHdpZHRoIHx8IDEsIGhlaWdodCB8fCAxLCAwLCBmb3JtYXQsIHR5cGUsIG51bGwpXG4gICAgICB9XG4gICAgfVxuICB9KVxuXG4gIGZ1bmN0aW9uIFRleFBhcmFtcyAodGFyZ2V0KSB7XG4gICAgdGhpcy50YXJnZXQgPSB0YXJnZXRcblxuICAgIC8vIERlZmF1bHQgaW1hZ2Ugc2hhcGUgaW5mb1xuICAgIHRoaXMud2lkdGggPSAwXG4gICAgdGhpcy5oZWlnaHQgPSAwXG4gICAgdGhpcy5mb3JtYXQgPSAwXG4gICAgdGhpcy5pbnRlcm5hbGZvcm1hdCA9IDBcbiAgICB0aGlzLnR5cGUgPSAwXG5cbiAgICAvLyB3cmFwIG1vZGVcbiAgICB0aGlzLndyYXBTID0gR0xfQ0xBTVBfVE9fRURHRVxuICAgIHRoaXMud3JhcFQgPSBHTF9DTEFNUF9UT19FREdFXG5cbiAgICAvLyBmaWx0ZXJpbmdcbiAgICB0aGlzLm1pbkZpbHRlciA9IDBcbiAgICB0aGlzLm1hZ0ZpbHRlciA9IEdMX05FQVJFU1RcbiAgICB0aGlzLmFuaXNvdHJvcGljID0gMVxuXG4gICAgLy8gbWlwbWFwc1xuICAgIHRoaXMuZ2VuTWlwbWFwcyA9IGZhbHNlXG4gICAgdGhpcy5taXBtYXBIaW50ID0gR0xfRE9OVF9DQVJFXG4gIH1cblxuICBleHRlbmQoVGV4UGFyYW1zLnByb3RvdHlwZSwge1xuICAgIHBhcnNlOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgaWYgKHR5cGVvZiBvcHRpb25zICE9PSAnb2JqZWN0JyB8fCAhb3B0aW9ucykge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgaWYgKCdtaW4nIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIG1pbkZpbHRlciA9IG9wdGlvbnMubWluXG4gICAgICAgIGNoZWNrLnBhcmFtZXRlcihtaW5GaWx0ZXIsIG1pbkZpbHRlcnMpXG4gICAgICAgIHRoaXMubWluRmlsdGVyID0gbWluRmlsdGVyc1ttaW5GaWx0ZXJdXG4gICAgICB9XG5cbiAgICAgIGlmICgnbWFnJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBtYWdGaWx0ZXIgPSBvcHRpb25zLm1hZ1xuICAgICAgICBjaGVjay5wYXJhbWV0ZXIobWFnRmlsdGVyLCBtYWdGaWx0ZXJzKVxuICAgICAgICB0aGlzLm1hZ0ZpbHRlciA9IG1hZ0ZpbHRlcnNbbWFnRmlsdGVyXVxuICAgICAgfVxuXG4gICAgICB2YXIgd3JhcFMgPSB0aGlzLndyYXBTXG4gICAgICB2YXIgd3JhcFQgPSB0aGlzLndyYXBUXG4gICAgICBpZiAoJ3dyYXAnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIHdyYXAgPSBvcHRpb25zLndyYXBcbiAgICAgICAgaWYgKHR5cGVvZiB3cmFwID09PSAnc3RyaW5nJykge1xuICAgICAgICAgIGNoZWNrLnBhcmFtZXRlcih3cmFwLCB3cmFwTW9kZXMpXG4gICAgICAgICAgd3JhcFMgPSB3cmFwVCA9IHdyYXBNb2Rlc1t3cmFwXVxuICAgICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkod3JhcCkpIHtcbiAgICAgICAgICBjaGVjay5wYXJhbWV0ZXIod3JhcFswXSwgd3JhcE1vZGVzKVxuICAgICAgICAgIGNoZWNrLnBhcmFtZXRlcih3cmFwWzFdLCB3cmFwTW9kZXMpXG4gICAgICAgICAgd3JhcFMgPSB3cmFwTW9kZXNbd3JhcFswXV1cbiAgICAgICAgICB3cmFwVCA9IHdyYXBNb2Rlc1t3cmFwWzFdXVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoJ3dyYXBTJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgdmFyIG9wdFdyYXBTID0gb3B0aW9ucy53cmFwU1xuICAgICAgICAgIGNoZWNrLnBhcmFtZXRlcihvcHRXcmFwUywgd3JhcE1vZGVzKVxuICAgICAgICAgIHdyYXBTID0gd3JhcE1vZGVzW29wdFdyYXBTXVxuICAgICAgICB9XG4gICAgICAgIGlmICgnd3JhcFQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB2YXIgb3B0V3JhcFQgPSBvcHRpb25zLndyYXBUXG4gICAgICAgICAgY2hlY2sucGFyYW1ldGVyKG9wdFdyYXBULCB3cmFwTW9kZXMpXG4gICAgICAgICAgd3JhcFQgPSB3cmFwTW9kZXNbb3B0V3JhcFRdXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHRoaXMud3JhcFMgPSB3cmFwU1xuICAgICAgdGhpcy53cmFwVCA9IHdyYXBUXG5cbiAgICAgIGlmICgnYW5pc290cm9waWMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGFuaXNvdHJvcGljID0gb3B0aW9ucy5hbmlzb3Ryb3BpY1xuICAgICAgICBjaGVjayh0eXBlb2YgYW5pc290cm9waWMgPT09ICdudW1iZXInICYmXG4gICAgICAgICAgIGFuaXNvdHJvcGljID49IDEgJiYgYW5pc290cm9waWMgPD0gbGltaXRzLm1heEFuaXNvdHJvcGljLFxuICAgICAgICAgICdhbmlzbyBzYW1wbGVzIG11c3QgYmUgYmV0d2VlbiAxIGFuZCAnKVxuICAgICAgICB0aGlzLmFuaXNvdHJvcGljID0gb3B0aW9ucy5hbmlzb3Ryb3BpY1xuICAgICAgfVxuXG4gICAgICBpZiAoJ21pcG1hcCcgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgbWlwbWFwID0gb3B0aW9ucy5taXBtYXBcbiAgICAgICAgc3dpdGNoICh0eXBlb2YgbWlwbWFwKSB7XG4gICAgICAgICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgICAgICAgIGNoZWNrLnBhcmFtZXRlcihtaXBtYXAsIG1pcG1hcEhpbnQsXG4gICAgICAgICAgICAgICdpbnZhbGlkIG1pcG1hcCBoaW50JylcbiAgICAgICAgICAgIHRoaXMubWlwbWFwSGludCA9IG1pcG1hcEhpbnRbbWlwbWFwXVxuICAgICAgICAgICAgdGhpcy5nZW5NaXBtYXBzID0gdHJ1ZVxuICAgICAgICAgICAgYnJlYWtcblxuICAgICAgICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgICAgICAgdGhpcy5nZW5NaXBtYXBzID0gISFtaXBtYXBcbiAgICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgICBjYXNlICdvYmplY3QnOlxuICAgICAgICAgICAgYnJlYWtcblxuICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICBjaGVjay5yYWlzZSgnaW52YWxpZCBtaXBtYXAgdHlwZScpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuXG4gICAgdXBsb2FkOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgdGFyZ2V0ID0gdGhpcy50YXJnZXRcbiAgICAgIGdsLnRleFBhcmFtZXRlcmkodGFyZ2V0LCBHTF9URVhUVVJFX01JTl9GSUxURVIsIHRoaXMubWluRmlsdGVyKVxuICAgICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfTUFHX0ZJTFRFUiwgdGhpcy5tYWdGaWx0ZXIpXG4gICAgICBnbC50ZXhQYXJhbWV0ZXJpKHRhcmdldCwgR0xfVEVYVFVSRV9XUkFQX1MsIHRoaXMud3JhcFMpXG4gICAgICBnbC50ZXhQYXJhbWV0ZXJpKHRhcmdldCwgR0xfVEVYVFVSRV9XUkFQX1QsIHRoaXMud3JhcFQpXG4gICAgICBpZiAoZXh0ZW5zaW9ucy5leHRfdGV4dHVyZV9maWx0ZXJfYW5pc290cm9waWMpIHtcbiAgICAgICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfTUFYX0FOSVNPVFJPUFlfRVhULCB0aGlzLmFuaXNvdHJvcGljKVxuICAgICAgfVxuICAgICAgaWYgKHRoaXMuZ2VuTWlwbWFwcykge1xuICAgICAgICBnbC5oaW50KEdMX0dFTkVSQVRFX01JUE1BUF9ISU5ULCB0aGlzLm1pcG1hcEhpbnQpXG4gICAgICAgIGdsLmdlbmVyYXRlTWlwbWFwKHRhcmdldClcbiAgICAgIH1cbiAgICB9XG4gIH0pXG5cbiAgLy8gRmluYWwgcGFzcyB0byBtZXJnZSBwYXJhbXMgYW5kIHBpeGVsIGRhdGFcbiAgZnVuY3Rpb24gY2hlY2tUZXh0dXJlQ29tcGxldGUgKHBhcmFtcywgcGl4ZWxzKSB7XG4gICAgdmFyIGksIHBpeG1hcFxuXG4gICAgdmFyIHR5cGUgPSAwXG4gICAgdmFyIGZvcm1hdCA9IDBcbiAgICB2YXIgaW50ZXJuYWxmb3JtYXQgPSAwXG4gICAgdmFyIHdpZHRoID0gMFxuICAgIHZhciBoZWlnaHQgPSAwXG4gICAgdmFyIGNoYW5uZWxzID0gMFxuICAgIHZhciBjb21wcmVzc2VkID0gZmFsc2VcbiAgICB2YXIgbmVlZHNQb2xsID0gZmFsc2VcbiAgICB2YXIgbmVlZHNMaXN0ZW5lcnMgPSBmYWxzZVxuICAgIHZhciBtaXBNYXNrMkQgPSAwXG4gICAgdmFyIG1pcE1hc2tDdWJlID0gWzAsIDAsIDAsIDAsIDAsIDBdXG4gICAgdmFyIGN1YmVNYXNrID0gMFxuICAgIHZhciBoYXNNaXAgPSBmYWxzZVxuICAgIGZvciAoaSA9IDA7IGkgPCBwaXhlbHMubGVuZ3RoOyArK2kpIHtcbiAgICAgIHBpeG1hcCA9IHBpeGVsc1tpXVxuICAgICAgd2lkdGggPSB3aWR0aCB8fCAocGl4bWFwLndpZHRoIDw8IHBpeG1hcC5taXBsZXZlbClcbiAgICAgIGhlaWdodCA9IGhlaWdodCB8fCAocGl4bWFwLmhlaWdodCA8PCBwaXhtYXAubWlwbGV2ZWwpXG4gICAgICB0eXBlID0gdHlwZSB8fCBwaXhtYXAudHlwZVxuICAgICAgZm9ybWF0ID0gZm9ybWF0IHx8IHBpeG1hcC5mb3JtYXRcbiAgICAgIGludGVybmFsZm9ybWF0ID0gaW50ZXJuYWxmb3JtYXQgfHwgcGl4bWFwLmludGVybmFsZm9ybWF0XG4gICAgICBjaGFubmVscyA9IGNoYW5uZWxzIHx8IHBpeG1hcC5jaGFubmVsc1xuICAgICAgbmVlZHNQb2xsID0gbmVlZHNQb2xsIHx8IHBpeG1hcC5uZWVkc1BvbGxcbiAgICAgIG5lZWRzTGlzdGVuZXJzID0gbmVlZHNMaXN0ZW5lcnMgfHwgcGl4bWFwLm5lZWRzTGlzdGVuZXJzXG4gICAgICBjb21wcmVzc2VkID0gY29tcHJlc3NlZCB8fCBwaXhtYXAuY29tcHJlc3NlZFxuXG4gICAgICB2YXIgbWlwbGV2ZWwgPSBwaXhtYXAubWlwbGV2ZWxcbiAgICAgIHZhciB0YXJnZXQgPSBwaXhtYXAudGFyZ2V0XG4gICAgICBoYXNNaXAgPSBoYXNNaXAgfHwgKG1pcGxldmVsID4gMClcbiAgICAgIGlmICh0YXJnZXQgPT09IEdMX1RFWFRVUkVfMkQpIHtcbiAgICAgICAgbWlwTWFzazJEIHw9ICgxIDw8IG1pcGxldmVsKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIGZhY2UgPSB0YXJnZXQgLSBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1hcbiAgICAgICAgbWlwTWFza0N1YmVbZmFjZV0gfD0gKDEgPDwgbWlwbGV2ZWwpXG4gICAgICAgIGN1YmVNYXNrIHw9ICgxIDw8IGZhY2UpXG4gICAgICB9XG4gICAgfVxuXG4gICAgcGFyYW1zLm5lZWRzUG9sbCA9IG5lZWRzUG9sbFxuICAgIHBhcmFtcy5uZWVkc0xpc3RlbmVycyA9IG5lZWRzTGlzdGVuZXJzXG4gICAgcGFyYW1zLndpZHRoID0gd2lkdGhcbiAgICBwYXJhbXMuaGVpZ2h0ID0gaGVpZ2h0XG4gICAgcGFyYW1zLmZvcm1hdCA9IGZvcm1hdFxuICAgIHBhcmFtcy5pbnRlcm5hbGZvcm1hdCA9IGludGVybmFsZm9ybWF0XG4gICAgcGFyYW1zLnR5cGUgPSB0eXBlXG5cbiAgICB2YXIgbWlwTWFzayA9IGhhc01pcCA/ICh3aWR0aCA8PCAxKSAtIDEgOiAxXG4gICAgaWYgKHBhcmFtcy50YXJnZXQgPT09IEdMX1RFWFRVUkVfMkQpIHtcbiAgICAgIGNoZWNrKGN1YmVNYXNrID09PSAwLFxuICAgICAgICAncGl4bWFwIHR5cGUgbXVzdCBub3QgY29udGFpbiBjdWJlbWFwIGZhY2VzJylcbiAgICAgIGNoZWNrKG1pcE1hc2syRCA9PT0gbWlwTWFzaywgJ21pc3NpbmcgbWlwIG1hcCBkYXRhJylcbiAgICB9IGVsc2Uge1xuICAgICAgY2hlY2soY3ViZU1hc2sgPT09ICgoMSA8PCA2KSAtIDEpLCAnbWlzc2luZyBjdWJlbWFwIGZhY2VzJylcbiAgICAgIGZvciAoaSA9IDA7IGkgPCA2OyArK2kpIHtcbiAgICAgICAgY2hlY2sobWlwTWFza0N1YmVbaV0gPT09IG1pcE1hc2ssICdtaXNzaW5nIG1pcCBtYXAgZGF0YScpXG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFyIG1pcEZpbHRlciA9IChNSVBNQVBfRklMVEVSUy5pbmRleE9mKHBhcmFtcy5taW5GaWx0ZXIpID49IDApXG4gICAgcGFyYW1zLmdlbk1pcG1hcHMgPSAhaGFzTWlwICYmIChwYXJhbXMuZ2VuTWlwbWFwcyB8fCBtaXBGaWx0ZXIpXG4gICAgdmFyIHVzZU1pcG1hcHMgPSBoYXNNaXAgfHwgcGFyYW1zLmdlbk1pcG1hcHNcblxuICAgIGlmICghcGFyYW1zLm1pbkZpbHRlcikge1xuICAgICAgcGFyYW1zLm1pbkZpbHRlciA9IHVzZU1pcG1hcHNcbiAgICAgICAgPyBHTF9MSU5FQVJfTUlQTUFQX0xJTkVBUlxuICAgICAgICA6IEdMX05FQVJFU1RcbiAgICB9IGVsc2Uge1xuICAgICAgY2hlY2sodXNlTWlwbWFwcyA9PT0gbWlwRmlsdGVyLFxuICAgICAgICAnbWluIGZpbHRlciBpbmNvbnNpc3RlbnQgd2l0aCBtaXBtYXAgZGF0YScpXG4gICAgfVxuXG4gICAgaWYgKHVzZU1pcG1hcHMpIHtcbiAgICAgIGNoZWNrKHdpZHRoID09PSBoZWlnaHQgJiYgaXNQb3cyKHdpZHRoKSxcbiAgICAgICAgJ211c3QgYmUgYSBzcXVhcmUgcG93ZXIgb2YgMiB0byBzdXBwb3J0IG1pcG1hcHMnKVxuICAgIH1cblxuICAgIGlmIChwYXJhbXMuZ2VuTWlwbWFwcykge1xuICAgICAgY2hlY2soIWNvbXByZXNzZWQsICdtaXBtYXAgZ2VuZXJhdGlvbiBub3Qgc3VwcG9ydGVkIGZvciBjb21wcmVzc2VkIHRleHR1cmVzJylcbiAgICB9XG5cbiAgICBwYXJhbXMud3JhcFMgPSBwYXJhbXMud3JhcFMgfHwgR0xfQ0xBTVBfVE9fRURHRVxuICAgIHBhcmFtcy53cmFwVCA9IHBhcmFtcy53cmFwVCB8fCBHTF9DTEFNUF9UT19FREdFXG4gICAgaWYgKHBhcmFtcy53cmFwUyAhPT0gR0xfQ0xBTVBfVE9fRURHRSB8fFxuICAgICAgICBwYXJhbXMud3JhcFQgIT09IEdMX0NMQU1QX1RPX0VER0UpIHtcbiAgICAgIGNoZWNrKGlzUG93Mih3aWR0aCkgJiYgaXNQb3cyKGhlaWdodCkgJiYgIWN1YmVNYXNrLFxuICAgICAgICAnaW5jb21wYXRpYmxlIHNpemUgZm9yIHdyYXAgbW9kZSwgaW1hZ2UgbXVzdCBiZSBhIHBvd2VyIG9mIDInKVxuICAgIH1cblxuICAgIGlmICgodHlwZSA9PT0gR0xfRkxPQVQgJiYgIWV4dGVuc2lvbnMub2VzX3RleHR1cmVfZmxvYXRfbGluZWFyKSB8fFxuICAgICAgICAodHlwZSA9PT0gR0xfSEFMRl9GTE9BVF9PRVMgJiZcbiAgICAgICAgICAhZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9oYWxmX2Zsb2F0X2xpbmVhcikpIHtcbiAgICAgIGNoZWNrKHRoaXMubWFnRmlsdGVyID09PSBHTF9ORUFSRVNUICYmIHRoaXMubWluRmlsdGVyID09PSBHTF9ORUFSRVNULFxuICAgICAgICAndW5zdXBwb3J0ZWQgZmlsdGVyIG1vZGUgZm9yIGZsb2F0IHRleHR1cmUnKVxuICAgIH1cblxuICAgIGZvciAoaSA9IDA7IGkgPCBwaXhlbHMubGVuZ3RoOyArK2kpIHtcbiAgICAgIHBpeG1hcCA9IHBpeGVsc1tpXVxuICAgICAgdmFyIGxldmVsID0gcGl4bWFwLm1pcGxldmVsXG4gICAgICBpZiAocGl4bWFwLndpZHRoKSB7XG4gICAgICAgIGNoZWNrKHBpeG1hcC53aWR0aCA8PCBsZXZlbCA9PT0gd2lkdGgsICdpbmNvbnNpc3RlbnQgd2lkdGgnKVxuICAgICAgfVxuICAgICAgaWYgKHBpeG1hcC5oZWlnaHQpIHtcbiAgICAgICAgY2hlY2socGl4bWFwLmhlaWdodCA8PCBsZXZlbCA9PT0gaGVpZ2h0LCAnaW5jb25zaXN0ZW50IHdpZHRoJylcbiAgICAgIH1cbiAgICAgIGlmIChwaXhtYXAuY2hhbm5lbHMpIHtcbiAgICAgICAgY2hlY2socGl4bWFwLmNoYW5uZWxzID09PSBjaGFubmVscywgJ2luY29uc2lzdGVudCBjaGFubmVscycpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwaXhtYXAuY2hhbm5lbHMgPSBjaGFubmVsc1xuICAgICAgfVxuICAgICAgaWYgKHBpeG1hcC5mb3JtYXQpIHtcbiAgICAgICAgY2hlY2socGl4bWFwLmZvcm1hdCA9PT0gZm9ybWF0LCAnaW5jb25zaXN0ZW50IGZvcm1hdCcpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwaXhtYXAuZm9ybWF0ID0gZm9ybWF0XG4gICAgICB9XG4gICAgICBpZiAocGl4bWFwLmludGVybmFsZm9ybWF0KSB7XG4gICAgICAgIGNoZWNrKHBpeG1hcC5pbnRlcm5hbGZvcm1hdCA9PT0gaW50ZXJuYWxmb3JtYXQsICdpbmNvbnNpc3RlbnQgaW50ZXJuYWxmb3JtYXQnKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGl4bWFwLmludGVybmFsZm9ybWF0ID0gaW50ZXJuYWxmb3JtYXRcbiAgICAgIH1cbiAgICAgIGlmIChwaXhtYXAudHlwZSkge1xuICAgICAgICBjaGVjayhwaXhtYXAudHlwZSA9PT0gdHlwZSwgJ2luY29uc2lzdGVudCB0eXBlJylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBpeG1hcC50eXBlID0gdHlwZVxuICAgICAgfVxuICAgICAgaWYgKHBpeG1hcC5jb3B5KSB7XG4gICAgICAgIGNoZWNrKHBpeG1hcC50eXBlID09PSBHTF9VTlNJR05FRF9CWVRFICYmXG4gICAgICAgICAgcGl4bWFwLmludGVybmFsZm9ybWF0ID09PSBHTF9SR0JBLFxuICAgICAgICAgICdpbmNvbXBhdGlibGUgZm9ybWF0L3R5cGUgZm9yIGNvcHlUZXhJbWFnZTJEJylcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICB2YXIgYWN0aXZlVGV4dHVyZSA9IDBcbiAgdmFyIHRleHR1cmVDb3VudCA9IDBcbiAgdmFyIHRleHR1cmVTZXQgPSB7fVxuICB2YXIgcG9sbFNldCA9IFtdXG4gIHZhciBudW1UZXhVbml0cyA9IGxpbWl0cy5tYXhUZXh0dXJlVW5pdHNcbiAgdmFyIHRleHR1cmVVbml0cyA9IEFycmF5KG51bVRleFVuaXRzKS5tYXAoZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBudWxsXG4gIH0pXG5cbiAgZnVuY3Rpb24gUkVHTFRleHR1cmUgKHRhcmdldCkge1xuICAgIHRoaXMuaWQgPSB0ZXh0dXJlQ291bnQrK1xuICAgIHRoaXMucmVmQ291bnQgPSAxXG5cbiAgICB0aGlzLnRhcmdldCA9IHRhcmdldFxuICAgIHRoaXMudGV4dHVyZSA9IG51bGxcblxuICAgIHRoaXMucG9sbElkID0gLTFcblxuICAgIHRoaXMudW5pdCA9IC0xXG4gICAgdGhpcy5iaW5kQ291bnQgPSAwXG5cbiAgICAvLyBjYW5jZWxzIGFsbCBwZW5kaW5nIGNhbGxiYWNrc1xuICAgIHRoaXMuY2FuY2VsUGVuZGluZyA9IG51bGxcblxuICAgIC8vIHBhcnNlZCB1c2VyIGlucHV0c1xuICAgIHRoaXMucGFyYW1zID0gbmV3IFRleFBhcmFtcyh0YXJnZXQpXG4gICAgdGhpcy5waXhlbHMgPSBbXVxuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlICh0ZXh0dXJlLCBvcHRpb25zKSB7XG4gICAgdmFyIGlcbiAgICBjbGVhckxpc3RlbmVycyh0ZXh0dXJlKVxuXG4gICAgLy8gQ2xlYXIgcGFyYW1ldGVycyBhbmQgcGl4ZWwgZGF0YVxuICAgIHZhciBwYXJhbXMgPSB0ZXh0dXJlLnBhcmFtc1xuICAgIFRleFBhcmFtcy5jYWxsKHBhcmFtcywgdGV4dHVyZS50YXJnZXQpXG4gICAgdmFyIHBpeGVscyA9IHRleHR1cmUucGl4ZWxzXG4gICAgcGl4ZWxzLmxlbmd0aCA9IDBcblxuICAgIC8vIHBhcnNlIHBhcmFtZXRlcnNcbiAgICBwYXJhbXMucGFyc2Uob3B0aW9ucylcblxuICAgIC8vIHBhcnNlIHBpeGVsIGRhdGFcbiAgICBmdW5jdGlvbiBwYXJzZU1pcCAodGFyZ2V0LCBkYXRhKSB7XG4gICAgICB2YXIgbWlwbWFwID0gZGF0YS5taXBtYXBcbiAgICAgIHZhciBwaXhtYXBcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KG1pcG1hcCkpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBtaXBtYXAubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICBwaXhtYXAgPSBuZXcgUGl4ZWxJbmZvKHRhcmdldClcbiAgICAgICAgICBwaXhtYXAucGFyc2VGbGFncyhvcHRpb25zKVxuICAgICAgICAgIHBpeG1hcC5wYXJzZUZsYWdzKGRhdGEpXG4gICAgICAgICAgcGl4bWFwLnBhcnNlKG1pcG1hcFtpXSwgaSlcbiAgICAgICAgICBwaXhlbHMucHVzaChwaXhtYXApXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBpeG1hcCA9IG5ldyBQaXhlbEluZm8odGFyZ2V0KVxuICAgICAgICBwaXhtYXAucGFyc2VGbGFncyhvcHRpb25zKVxuICAgICAgICBwaXhtYXAucGFyc2UoZGF0YSwgMClcbiAgICAgICAgcGl4ZWxzLnB1c2gocGl4bWFwKVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAodGV4dHVyZS50YXJnZXQgPT09IEdMX1RFWFRVUkVfMkQpIHtcbiAgICAgIHBhcnNlTWlwKEdMX1RFWFRVUkVfMkQsIG9wdGlvbnMpXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBmYWNlcyA9IG9wdGlvbnMuZmFjZXMgfHwgb3B0aW9uc1xuICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZmFjZXMpKSB7XG4gICAgICAgIGNoZWNrKGZhY2VzLmxlbmd0aCA9PT0gNixcbiAgICAgICAgICAnaW52YWxpZCBudW1iZXIgb2YgZmFjZXMgaW4gY3ViZSBtYXAnKVxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgICAgcGFyc2VNaXAoR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YICsgaSwgZmFjZXNbaV0pXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZhY2VzID09PSAnc3RyaW5nJykge1xuICAgICAgICAvLyBUT0RPIFJlYWQgZGRzXG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBJbml0aWFsaXplIHRvIGFsbCBlbXB0eSB0ZXh0dXJlc1xuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgICAgcGFyc2VNaXAoR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YICsgaSwge30pXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBkbyBhIHNlY29uZCBwYXNzIHRvIHJlY29uY2lsZSBkZWZhdWx0c1xuICAgIGNoZWNrVGV4dHVyZUNvbXBsZXRlKHBhcmFtcywgcGl4ZWxzKVxuXG4gICAgaWYgKHBhcmFtcy5uZWVkc0xpc3RlbmVycykge1xuICAgICAgaG9va0xpc3RlbmVycyh0ZXh0dXJlKVxuICAgIH1cblxuICAgIGlmIChwYXJhbXMubmVlZHNQb2xsKSB7XG4gICAgICB0ZXh0dXJlLnBvbGxJZCA9IHBvbGxTZXQubGVuZ3RoXG4gICAgICBwb2xsU2V0LnB1c2godGV4dHVyZSlcbiAgICB9XG5cbiAgICByZWZyZXNoKHRleHR1cmUpXG4gIH1cblxuICBmdW5jdGlvbiByZWZyZXNoICh0ZXh0dXJlKSB7XG4gICAgaWYgKCFnbC5pc1RleHR1cmUodGV4dHVyZS50ZXh0dXJlKSkge1xuICAgICAgdGV4dHVyZS50ZXh0dXJlID0gZ2wuY3JlYXRlVGV4dHVyZSgpXG4gICAgfVxuXG4gICAgLy8gTGF6eSBiaW5kXG4gICAgdmFyIHRhcmdldCA9IHRleHR1cmUudGFyZ2V0XG4gICAgdmFyIHVuaXQgPSB0ZXh0dXJlLnVuaXRcbiAgICBpZiAodW5pdCA+PSAwKSB7XG4gICAgICBnbC5hY3RpdmVUZXh0dXJlKEdMX1RFWFRVUkUwICsgdW5pdClcbiAgICAgIGFjdGl2ZVRleHR1cmUgPSB1bml0XG4gICAgfSBlbHNlIHtcbiAgICAgIGdsLmJpbmRUZXh0dXJlKHRhcmdldCwgdGV4dHVyZS50ZXh0dXJlKVxuICAgIH1cblxuICAgIC8vIFVwbG9hZFxuICAgIHZhciBwaXhlbHMgPSB0ZXh0dXJlLnBpeGVsc1xuICAgIHZhciBwYXJhbXMgPSB0ZXh0dXJlLnBhcmFtc1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcGl4ZWxzLmxlbmd0aDsgKytpKSB7XG4gICAgICBwaXhlbHNbaV0udXBsb2FkKHBhcmFtcylcbiAgICB9XG4gICAgcGFyYW1zLnVwbG9hZCgpXG5cbiAgICAvLyBMYXp5IHVuYmluZFxuICAgIGlmICh1bml0IDwgMCkge1xuICAgICAgdmFyIGFjdGl2ZSA9IHRleHR1cmVVbml0c1thY3RpdmVUZXh0dXJlXVxuICAgICAgaWYgKGFjdGl2ZSkge1xuICAgICAgICAvLyByZXN0b3JlIGJpbmRpbmcgc3RhdGVcbiAgICAgICAgZ2wuYmluZFRleHR1cmUoYWN0aXZlLnRhcmdldCwgYWN0aXZlLnRleHR1cmUpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBvdGhlcndpc2UgYmVjb21lIG5ldyBhY3RpdmVcbiAgICAgICAgdGV4dHVyZS51bml0ID0gYWN0aXZlVGV4dHVyZVxuICAgICAgICB0ZXh0dXJlVW5pdHNbYWN0aXZlVGV4dHVyZV0gPSB0ZXh0dXJlXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaG9va0xpc3RlbmVycyAodGV4dHVyZSkge1xuICAgIHZhciBwYXJhbXMgPSB0ZXh0dXJlLnBhcmFtc1xuICAgIHZhciBwaXhlbHMgPSB0ZXh0dXJlLnBpeGVsc1xuXG4gICAgLy8gQXBwZW5kcyBhbGwgdGhlIHRleHR1cmUgZGF0YSBmcm9tIHRoZSBidWZmZXIgdG8gdGhlIGN1cnJlbnRcbiAgICBmdW5jdGlvbiBhcHBlbmRERFMgKHRhcmdldCwgbWlwbGV2ZWwsIGJ1ZmZlcikge1xuICAgICAgdmFyIGRkcyA9IHBhcnNlRERTKGJ1ZmZlcilcblxuICAgICAgY2hlY2soZGRzLmZvcm1hdCBpbiBjb2xvckZvcm1hdHMsICd1bnN1cHBvcnRlZCBkZHMgdGV4dHVyZSBmb3JtYXQnKVxuXG4gICAgICBpZiAoZGRzLmN1YmUpIHtcbiAgICAgICAgY2hlY2sodGV4dHVyZS50YXJnZXQgPT09IEdMX1RFWFRVUkVfQ1VCRV9NQVApXG5cbiAgICAgICAgLy8gVE9ETyBoYW5kbGUgY3ViZSBtYXAgRERTXG4gICAgICAgIGNoZWNrLnJhaXNlKCdjdWJlIG1hcCBERFMgbm90IHlldCBpbXBsZW1lbnRlZCcpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjaGVjayh0ZXh0dXJlLnRhcmdldCA9PT0gR0xfVEVYVFVSRV8yRClcbiAgICAgIH1cblxuICAgICAgaWYgKG1pcGxldmVsKSB7XG4gICAgICAgIGNoZWNrKGRkcy5waXhlbHMubGVuZ3RoID09PSAxLCAnbnVtYmVyIG9mIG1pcCBsZXZlbHMgaW5jb25zaXN0ZW50JylcbiAgICAgIH1cblxuICAgICAgZGRzLnBpeGVscy5mb3JFYWNoKGZ1bmN0aW9uIChwaXhtYXApIHtcbiAgICAgICAgdmFyIGluZm8gPSBuZXcgUGl4ZWxJbmZvKGRkcy5jdWJlID8gcGl4bWFwLnRhcmdldCA6IHRhcmdldClcblxuICAgICAgICBpbmZvLmNoYW5uZWxzID0gZGRzLmNoYW5uZWxzXG4gICAgICAgIGluZm8uY29tcHJlc3NlZCA9IGRkcy5jb21wcmVzc2VkXG4gICAgICAgIGluZm8udHlwZSA9IGRkcy50eXBlXG4gICAgICAgIGluZm8uaW50ZXJuYWxmb3JtYXQgPSBkZHMuZm9ybWF0XG4gICAgICAgIGluZm8uZm9ybWF0ID0gY29sb3JGb3JtYXRzW2Rkcy5mb3JtYXRdXG5cbiAgICAgICAgaW5mby53aWR0aCA9IHBpeG1hcC53aWR0aFxuICAgICAgICBpbmZvLmhlaWdodCA9IHBpeG1hcC5oZWlnaHRcbiAgICAgICAgaW5mby5taXBsZXZlbCA9IHBpeG1hcC5taXBsZXZlbCB8fCBtaXBsZXZlbFxuICAgICAgICBpbmZvLmRhdGEgPSBwaXhtYXAuZGF0YVxuXG4gICAgICAgIHBpeGVscy5wdXNoKGluZm8pXG4gICAgICB9KVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIG9uRGF0YSAoKSB7XG4gICAgICAvLyBVcGRhdGUgc2l6ZSBvZiBhbnkgbmV3bHkgbG9hZGVkIHBpeGVsc1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwaXhlbHMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgdmFyIHBpeGVsRGF0YSA9IHBpeGVsc1tpXVxuICAgICAgICB2YXIgaW1hZ2UgPSBwaXhlbERhdGEuaW1hZ2VcbiAgICAgICAgdmFyIHZpZGVvID0gcGl4ZWxEYXRhLnZpZGVvXG4gICAgICAgIHZhciB4aHIgPSBwaXhlbERhdGEueGhyXG4gICAgICAgIGlmIChpbWFnZSAmJiBpbWFnZS5jb21wbGV0ZSkge1xuICAgICAgICAgIHBpeGVsRGF0YS53aWR0aCA9IGltYWdlLm5hdHVyYWxXaWR0aFxuICAgICAgICAgIHBpeGVsRGF0YS5oZWlnaHQgPSBpbWFnZS5uYXR1cmFsSGVpZ2h0XG4gICAgICAgIH0gZWxzZSBpZiAodmlkZW8gJiYgdmlkZW8ucmVhZHlTdGF0ZSA+IDIpIHtcbiAgICAgICAgICBwaXhlbERhdGEud2lkdGggPSB2aWRlby53aWR0aFxuICAgICAgICAgIHBpeGVsRGF0YS5oZWlnaHQgPSB2aWRlby5oZWlnaHRcbiAgICAgICAgfSBlbHNlIGlmICh4aHIgJiYgeGhyLnJlYWR5U3RhdGUgPT09IDQpIHtcbiAgICAgICAgICBwaXhlbHNbaV0gPSBwaXhlbHNbcGl4ZWxzLmxlbmd0aCAtIDFdXG4gICAgICAgICAgcGl4ZWxzLnBvcCgpXG4gICAgICAgICAgeGhyLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3JlYWR5c3RhdGVjaGFuZ2UnLCByZWZyZXNoKVxuICAgICAgICAgIGFwcGVuZEREUyhwaXhlbERhdGEudGFyZ2V0LCBwaXhlbERhdGEubWlwbGV2ZWwsIHhoci5yZXNwb25zZSlcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgY2hlY2tUZXh0dXJlQ29tcGxldGUocGFyYW1zLCBwaXhlbHMpXG4gICAgICByZWZyZXNoKHRleHR1cmUpXG4gICAgfVxuXG4gICAgcGl4ZWxzLmZvckVhY2goZnVuY3Rpb24gKHBpeGVsRGF0YSkge1xuICAgICAgaWYgKHBpeGVsRGF0YS5pbWFnZSAmJiAhcGl4ZWxEYXRhLmltYWdlLmNvbXBsZXRlKSB7XG4gICAgICAgIHBpeGVsRGF0YS5pbWFnZS5hZGRFdmVudExpc3RlbmVyKCdsb2FkJywgb25EYXRhKVxuICAgICAgfSBlbHNlIGlmIChwaXhlbERhdGEudmlkZW8gJiYgcGl4ZWxEYXRhLnJlYWR5U3RhdGUgPCAxKSB7XG4gICAgICAgIHBpeGVsRGF0YS52aWRlby5hZGRFdmVudExpc3RlbmVyKCdwcm9ncmVzcycsIG9uRGF0YSlcbiAgICAgIH0gZWxzZSBpZiAocGl4ZWxEYXRhLnhocikge1xuICAgICAgICBwaXhlbERhdGEueGhyLmFkZEV2ZW50TGlzdGVuZXIoJ3JlYWR5c3RhdGVjaGFuZ2UnLCBvbkRhdGEpXG4gICAgICB9XG4gICAgfSlcblxuICAgIHRleHR1cmUuY2FuY2VsUGVuZGluZyA9IGZ1bmN0aW9uIGRldGFjaExpc3RlbmVycyAoKSB7XG4gICAgICBwaXhlbHMuZm9yRWFjaChmdW5jdGlvbiAocGl4ZWxEYXRhKSB7XG4gICAgICAgIGlmIChwaXhlbERhdGEuaW1hZ2UpIHtcbiAgICAgICAgICBwaXhlbERhdGEuaW1hZ2UucmVtb3ZlRXZlbnRMaXN0ZW5lcignbG9hZCcsIG9uRGF0YSlcbiAgICAgICAgfSBlbHNlIGlmIChwaXhlbERhdGEudmlkZW8pIHtcbiAgICAgICAgICBwaXhlbERhdGEudmlkZW8ucmVtb3ZlRXZlbnRMaXN0ZW5lcigncHJvZ3Jlc3MnLCBvbkRhdGEpXG4gICAgICAgIH0gZWxzZSBpZiAocGl4ZWxEYXRhLnhocikge1xuICAgICAgICAgIHBpeGVsRGF0YS54aHIucmVtb3ZlRXZlbnRMaXN0ZW5lcigncmVhZHlzdGF0ZWNoYW5nZScsIG9uRGF0YSlcbiAgICAgICAgICBwaXhlbERhdGEueGhyLmFib3J0KClcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBjbGVhckxpc3RlbmVycyAodGV4dHVyZSkge1xuICAgIHZhciBjYW5jZWxQZW5kaW5nID0gdGV4dHVyZS5jYW5jZWxQZW5kaW5nXG4gICAgaWYgKGNhbmNlbFBlbmRpbmcpIHtcbiAgICAgIGNhbmNlbFBlbmRpbmcoKVxuICAgICAgdGV4dHVyZS5jYW5jZWxQZW5kaW5nID0gbnVsbFxuICAgIH1cbiAgICB2YXIgaWQgPSB0ZXh0dXJlLnBvbGxJZFxuICAgIGlmIChpZCA+PSAwKSB7XG4gICAgICB2YXIgb3RoZXIgPSBwb2xsU2V0W2lkXSA9IHBvbGxTZXRbcG9sbFNldC5sZW5ndGggLSAxXVxuICAgICAgb3RoZXIuaWQgPSBpZFxuICAgICAgcG9sbFNldC5wb3AoKVxuICAgICAgdGV4dHVyZS5wb2xsSWQgPSAtMVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3kgKHRleHR1cmUpIHtcbiAgICB2YXIgaGFuZGxlID0gdGV4dHVyZS50ZXh0dXJlXG4gICAgY2hlY2soaGFuZGxlLCAnbXVzdCBub3QgZG91YmxlIGRlc3Ryb3kgdGV4dHVyZScpXG4gICAgdmFyIHVuaXQgPSB0ZXh0dXJlLnVuaXRcbiAgICB2YXIgdGFyZ2V0ID0gdGV4dHVyZS50YXJnZXRcbiAgICBpZiAodW5pdCA+PSAwKSB7XG4gICAgICBnbC5hY3RpdmVUZXh0dXJlKEdMX1RFWFRVUkUwICsgdW5pdClcbiAgICAgIGFjdGl2ZVRleHR1cmUgPSB1bml0XG4gICAgICBnbC5iaW5kVGV4dHVyZSh0YXJnZXQsIG51bGwpXG4gICAgICB0ZXh0dXJlVW5pdHNbdW5pdF0gPSBudWxsXG4gICAgfVxuICAgIGNsZWFyTGlzdGVuZXJzKHRleHR1cmUpXG4gICAgaWYgKGdsLmlzVGV4dHVyZShoYW5kbGUpKSB7XG4gICAgICBnbC5kZWxldGVUZXh0dXJlKGhhbmRsZSlcbiAgICB9XG4gICAgdGV4dHVyZS50ZXh0dXJlID0gbnVsbFxuICAgIHRleHR1cmUucGFyYW1zID0gbnVsbFxuICAgIHRleHR1cmUucGl4ZWxzID0gbnVsbFxuICAgIHRleHR1cmUucmVmQ291bnQgPSAwXG4gICAgZGVsZXRlIHRleHR1cmVTZXRbdGV4dHVyZS5pZF1cbiAgfVxuXG4gIGV4dGVuZChSRUdMVGV4dHVyZS5wcm90b3R5cGUsIHtcbiAgICBiaW5kOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgdGV4dHVyZSA9IHRoaXNcbiAgICAgIHRleHR1cmUuYmluZENvdW50ICs9IDFcbiAgICAgIHZhciB1bml0ID0gdGV4dHVyZS51bml0XG4gICAgICBpZiAodW5pdCA8IDApIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBudW1UZXhVbml0czsgKytpKSB7XG4gICAgICAgICAgdmFyIG90aGVyID0gdGV4dHVyZVVuaXRzW2ldXG4gICAgICAgICAgaWYgKG90aGVyKSB7XG4gICAgICAgICAgICBpZiAob3RoZXIuYmluZENvdW50ID4gMCkge1xuICAgICAgICAgICAgICBjb250aW51ZVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgb3RoZXIudW5pdCA9IC0xXG4gICAgICAgICAgfVxuICAgICAgICAgIHRleHR1cmVVbml0c1tpXSA9IHRleHR1cmVcbiAgICAgICAgICB1bml0ID0gaVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIH1cbiAgICAgICAgaWYgKHVuaXQgPj0gbnVtVGV4VW5pdHMpIHtcbiAgICAgICAgICBjaGVjay5yYWlzZSgnaW5zdWZmaWNpZW50IG51bWJlciBvZiB0ZXh0dXJlIHVuaXRzJylcbiAgICAgICAgfVxuICAgICAgICB0ZXh0dXJlLnVuaXQgPSB1bml0XG4gICAgICAgIGdsLmFjdGl2ZVRleHR1cmUoR0xfVEVYVFVSRTAgKyB1bml0KVxuICAgICAgICBnbC5iaW5kVGV4dHVyZSh0ZXh0dXJlLnRhcmdldCwgdGV4dHVyZS50ZXh0dXJlKVxuICAgICAgICBhY3RpdmVUZXh0dXJlID0gdW5pdFxuICAgICAgfVxuICAgICAgcmV0dXJuIHVuaXRcbiAgICB9LFxuXG4gICAgdW5iaW5kOiBmdW5jdGlvbiAoKSB7XG4gICAgICB0aGlzLmJpbmRDb3VudCAtPSAxXG4gICAgfSxcblxuICAgIGRlY1JlZjogZnVuY3Rpb24gKCkge1xuICAgICAgaWYgKC0tdGhpcy5yZWZDb3VudCA9PT0gMCkge1xuICAgICAgICBkZXN0cm95KHRoaXMpXG4gICAgICB9XG4gICAgfVxuICB9KVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZVRleHR1cmUgKG9wdGlvbnMsIHRhcmdldCkge1xuICAgIHZhciB0ZXh0dXJlID0gbmV3IFJFR0xUZXh0dXJlKHRhcmdldClcbiAgICB0ZXh0dXJlU2V0W3RleHR1cmUuaWRdID0gdGV4dHVyZVxuXG4gICAgZnVuY3Rpb24gcmVnbFRleHR1cmUgKGEwLCBhMSwgYTIsIGEzLCBhNCwgYTUpIHtcbiAgICAgIHZhciBvcHRpb25zID0gYTAgfHwge31cbiAgICAgIGlmICh0YXJnZXQgPT09IEdMX1RFWFRVUkVfQ1VCRV9NQVAgJiYgYXJndW1lbnRzLmxlbmd0aCA9PT0gNikge1xuICAgICAgICBvcHRpb25zID0gW2EwLCBhMSwgYTIsIGEzLCBhNCwgYTVdXG4gICAgICB9XG4gICAgICB1cGRhdGUodGV4dHVyZSwgb3B0aW9ucylcbiAgICAgIHJlZ2xUZXh0dXJlLndpZHRoID0gdGV4dHVyZS5wYXJhbXMud2lkdGhcbiAgICAgIHJlZ2xUZXh0dXJlLmhlaWdodCA9IHRleHR1cmUucGFyYW1zLmhlaWdodFxuICAgICAgcmV0dXJuIHJlZ2xUZXh0dXJlXG4gICAgfVxuXG4gICAgcmVnbFRleHR1cmUob3B0aW9ucylcblxuICAgIHJlZ2xUZXh0dXJlLl9yZWdsVHlwZSA9ICd0ZXh0dXJlJ1xuICAgIHJlZ2xUZXh0dXJlLl90ZXh0dXJlID0gdGV4dHVyZVxuICAgIHJlZ2xUZXh0dXJlLmRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB0ZXh0dXJlLmRlY1JlZigpXG4gICAgfVxuICBcbiAgICByZXR1cm4gcmVnbFRleHR1cmVcbiAgfVxuXG4gIC8vIENhbGxlZCBhZnRlciBjb250ZXh0IHJlc3RvcmVcbiAgZnVuY3Rpb24gcmVmcmVzaFRleHR1cmVzICgpIHtcbiAgICB2YWx1ZXModGV4dHVyZVNldCkuZm9yRWFjaChyZWZyZXNoKVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbnVtVGV4VW5pdHM7ICsraSkge1xuICAgICAgdGV4dHVyZVVuaXRzW2ldID0gbnVsbFxuICAgIH1cbiAgICBhY3RpdmVUZXh0dXJlID0gMFxuICAgIGdsLmFjdGl2ZVRleHR1cmUoR0xfVEVYVFVSRTApXG4gIH1cblxuICAvLyBDYWxsZWQgd2hlbiByZWdsIGlzIGRlc3Ryb3llZFxuICBmdW5jdGlvbiBkZXN0cm95VGV4dHVyZXMgKCkge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbnVtVGV4VW5pdHM7ICsraSkge1xuICAgICAgZ2wuYWN0aXZlVGV4dHVyZShHTF9URVhUVVJFMCArIGkpXG4gICAgICBnbC5iaW5kVGV4dHVyZShHTF9URVhUVVJFXzJELCBudWxsKVxuICAgICAgdGV4dHVyZVVuaXRzW2ldID0gbnVsbFxuICAgIH1cbiAgICBnbC5hY3RpdmVUZXh0dXJlKEdMX1RFWFRVUkUwKVxuICAgIGFjdGl2ZVRleHR1cmUgPSAwXG4gICAgdmFsdWVzKHRleHR1cmVTZXQpLmZvckVhY2goZGVzdHJveSlcbiAgfVxuXG4gIC8vIENhbGxlZCBvbmNlIHBlciByYWYsIHVwZGF0ZXMgdmlkZW8gdGV4dHVyZXNcbiAgZnVuY3Rpb24gcG9sbFRleHR1cmVzICgpIHtcbiAgICBwb2xsU2V0LmZvckVhY2gocmVmcmVzaClcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY3JlYXRlOiBjcmVhdGVUZXh0dXJlLFxuICAgIHJlZnJlc2g6IHJlZnJlc2hUZXh0dXJlcyxcbiAgICBjbGVhcjogZGVzdHJveVRleHR1cmVzLFxuICAgIHBvbGw6IHBvbGxUZXh0dXJlcyxcbiAgICBnZXRUZXh0dXJlOiBmdW5jdGlvbiAod3JhcHBlcikge1xuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY29udmVydFRvSGFsZkZsb2F0IChhcnJheSkge1xuICB2YXIgZmxvYXRzID0gbmV3IEZsb2F0MzJBcnJheShhcnJheSlcbiAgdmFyIHVpbnRzID0gbmV3IFVpbnQzMkFycmF5KGZsb2F0cy5idWZmZXIpXG4gIHZhciB1c2hvcnRzID0gbmV3IFVpbnQxNkFycmF5KGFycmF5Lmxlbmd0aClcblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGFycmF5Lmxlbmd0aDsgKytpKSB7XG4gICAgaWYgKGlzTmFOKGFycmF5W2ldKSkge1xuICAgICAgdXNob3J0c1tpXSA9IDB4ZmZmZlxuICAgIH0gZWxzZSBpZiAoYXJyYXlbaV0gPT09IEluZmluaXR5KSB7XG4gICAgICB1c2hvcnRzW2ldID0gMHg3YzAwXG4gICAgfSBlbHNlIGlmIChhcnJheVtpXSA9PT0gLUluZmluaXR5KSB7XG4gICAgICB1c2hvcnRzW2ldID0gMHhmYzAwXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciB4ID0gdWludHNbaV1cblxuICAgICAgdmFyIHNnbiA9ICh4ID4+PiAzMSkgPDwgMTVcbiAgICAgIHZhciBleHAgPSAoKHggPDwgMSkgPj4+IDI0KSAtIDEyN1xuICAgICAgdmFyIGZyYWMgPSAoeCA+PiAxMykgJiAoKDEgPDwgMTApIC0gMSlcblxuICAgICAgaWYgKGV4cCA8IC0yNCkge1xuICAgICAgICAvLyByb3VuZCBub24tcmVwcmVzZW50YWJsZSBkZW5vcm1hbHMgdG8gMFxuICAgICAgICB1c2hvcnRzW2ldID0gc2duXG4gICAgICB9IGVsc2UgaWYgKGV4cCA8IC0xNCkge1xuICAgICAgICAvLyBoYW5kbGUgZGVub3JtYWxzXG4gICAgICAgIHZhciBzID0gLTE0IC0gZXhwXG4gICAgICAgIHVzaG9ydHNbaV0gPSBzZ24gKyAoKGZyYWMgKyAoMSA8PCAxMCkpID4+IHMpXG4gICAgICB9IGVsc2UgaWYgKGV4cCA+IDE1KSB7XG4gICAgICAgIC8vIHJvdW5kIG92ZXJmbG93IHRvICsvLSBJbmZpbml0eVxuICAgICAgICB1c2hvcnRzW2ldID0gc2duICsgMHg3YzAwXG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBvdGhlcndpc2UgY29udmVydCBkaXJlY3RseVxuICAgICAgICB1c2hvcnRzW2ldID0gc2duICsgKChleHAgKyAxNSkgPDwgMTApICsgZnJhY1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB1c2hvcnRzXG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBVbmlmb3JtU3RhdGUgKHN0cmluZ1N0b3JlKSB7XG4gIHZhciB1bmlmb3JtU3RhdGUgPSB7fVxuXG4gIGZ1bmN0aW9uIGRlZlVuaWZvcm0gKG5hbWUpIHtcbiAgICB2YXIgaWQgPSBzdHJpbmdTdG9yZS5pZChuYW1lKVxuICAgIHZhciByZXN1bHQgPSB1bmlmb3JtU3RhdGVbaWRdXG4gICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgIHJlc3VsdCA9IHVuaWZvcm1TdGF0ZVtpZF0gPSBbXG4gICAgICAgIFswLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwXVxuICAgICAgXVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGRlZjogZGVmVW5pZm9ybVxuICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChvYmopIHtcbiAgcmV0dXJuIE9iamVjdC5rZXlzKG9iaikubWFwKGZ1bmN0aW9uIChrZXkpIHsgcmV0dXJuIG9ialtrZXldIH0pXG59XG4iLCJ2YXIgY2hlY2sgPSByZXF1aXJlKCcuL2xpYi9jaGVjaycpXG52YXIgZXh0ZW5kID0gcmVxdWlyZSgnLi9saWIvZXh0ZW5kJylcbnZhciBnZXRDb250ZXh0ID0gcmVxdWlyZSgnLi9saWIvY29udGV4dCcpXG52YXIgY3JlYXRlU3RyaW5nU3RvcmUgPSByZXF1aXJlKCcuL2xpYi9zdHJpbmdzJylcbnZhciB3cmFwRXh0ZW5zaW9ucyA9IHJlcXVpcmUoJy4vbGliL2V4dGVuc2lvbicpXG52YXIgd3JhcExpbWl0cyA9IHJlcXVpcmUoJy4vbGliL2xpbWl0cycpXG52YXIgd3JhcEJ1ZmZlcnMgPSByZXF1aXJlKCcuL2xpYi9idWZmZXInKVxudmFyIHdyYXBFbGVtZW50cyA9IHJlcXVpcmUoJy4vbGliL2VsZW1lbnRzJylcbnZhciB3cmFwVGV4dHVyZXMgPSByZXF1aXJlKCcuL2xpYi90ZXh0dXJlJylcbnZhciB3cmFwUmVuZGVyYnVmZmVycyA9IHJlcXVpcmUoJy4vbGliL3JlbmRlcmJ1ZmZlcicpXG52YXIgd3JhcEZyYW1lYnVmZmVycyA9IHJlcXVpcmUoJy4vbGliL2ZyYW1lYnVmZmVyJylcbnZhciB3cmFwVW5pZm9ybXMgPSByZXF1aXJlKCcuL2xpYi91bmlmb3JtJylcbnZhciB3cmFwQXR0cmlidXRlcyA9IHJlcXVpcmUoJy4vbGliL2F0dHJpYnV0ZScpXG52YXIgd3JhcFNoYWRlcnMgPSByZXF1aXJlKCcuL2xpYi9zaGFkZXInKVxudmFyIHdyYXBEcmF3ID0gcmVxdWlyZSgnLi9saWIvZHJhdycpXG52YXIgd3JhcENvbnRleHQgPSByZXF1aXJlKCcuL2xpYi9zdGF0ZScpXG52YXIgY3JlYXRlQ29tcGlsZXIgPSByZXF1aXJlKCcuL2xpYi9jb21waWxlJylcbnZhciB3cmFwUmVhZCA9IHJlcXVpcmUoJy4vbGliL3JlYWQnKVxudmFyIGR5bmFtaWMgPSByZXF1aXJlKCcuL2xpYi9keW5hbWljJylcbnZhciByYWYgPSByZXF1aXJlKCcuL2xpYi9yYWYnKVxudmFyIGNsb2NrID0gcmVxdWlyZSgnLi9saWIvY2xvY2snKVxuXG52YXIgR0xfQ09MT1JfQlVGRkVSX0JJVCA9IDE2Mzg0XG52YXIgR0xfREVQVEhfQlVGRkVSX0JJVCA9IDI1NlxudmFyIEdMX1NURU5DSUxfQlVGRkVSX0JJVCA9IDEwMjRcblxudmFyIEdMX0FSUkFZX0JVRkZFUiA9IDM0OTYyXG52YXIgR0xfVEVYVFVSRV8yRCA9IDB4MERFMVxudmFyIEdMX1RFWFRVUkVfQ1VCRV9NQVAgPSAweDg1MTNcblxudmFyIENPTlRFWFRfTE9TVF9FVkVOVCA9ICd3ZWJnbGNvbnRleHRsb3N0J1xudmFyIENPTlRFWFRfUkVTVE9SRURfRVZFTlQgPSAnd2ViZ2xjb250ZXh0cmVzdG9yZWQnXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcFJFR0wgKCkge1xuICB2YXIgYXJncyA9IGdldENvbnRleHQoQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKSlcbiAgdmFyIGdsID0gYXJncy5nbFxuICB2YXIgb3B0aW9ucyA9IGFyZ3Mub3B0aW9uc1xuXG4gIC8vIFVzZSBzdHJpbmcgc3RvcmUgdG8gdHJhY2sgc3RyaW5nIGlkc1xuICB2YXIgc3RyaW5nU3RvcmUgPSBjcmVhdGVTdHJpbmdTdG9yZSgpXG5cbiAgdmFyIGV4dGVuc2lvblN0YXRlID0gd3JhcEV4dGVuc2lvbnMoZ2wpXG4gIHZhciBleHRlbnNpb25zID0gZXh0ZW5zaW9uU3RhdGUuZXh0ZW5zaW9uc1xuXG4gIHZhciB2aWV3cG9ydFN0YXRlID0ge1xuICAgIHdpZHRoOiBnbC5kcmF3aW5nQnVmZmVyV2lkdGgsXG4gICAgaGVpZ2h0OiBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0XG4gIH1cblxuICB2YXIgbGltaXRzID0gd3JhcExpbWl0cyhcbiAgICBnbCxcbiAgICBleHRlbnNpb25zKVxuXG4gIHZhciBidWZmZXJTdGF0ZSA9IHdyYXBCdWZmZXJzKGdsKVxuXG4gIHZhciBlbGVtZW50U3RhdGUgPSB3cmFwRWxlbWVudHMoXG4gICAgZ2wsXG4gICAgZXh0ZW5zaW9ucyxcbiAgICBidWZmZXJTdGF0ZSlcblxuICB2YXIgdW5pZm9ybVN0YXRlID0gd3JhcFVuaWZvcm1zKHN0cmluZ1N0b3JlKVxuXG4gIHZhciBhdHRyaWJ1dGVTdGF0ZSA9IHdyYXBBdHRyaWJ1dGVzKFxuICAgIGdsLFxuICAgIGV4dGVuc2lvbnMsXG4gICAgbGltaXRzLFxuICAgIGJ1ZmZlclN0YXRlLFxuICAgIHN0cmluZ1N0b3JlKVxuXG4gIHZhciBzaGFkZXJTdGF0ZSA9IHdyYXBTaGFkZXJzKFxuICAgIGdsLFxuICAgIGF0dHJpYnV0ZVN0YXRlLFxuICAgIHVuaWZvcm1TdGF0ZSxcbiAgICBmdW5jdGlvbiAocHJvZ3JhbSkge1xuICAgICAgcmV0dXJuIGNvbXBpbGVyLmRyYXcocHJvZ3JhbSlcbiAgICB9LFxuICAgIHN0cmluZ1N0b3JlKVxuXG4gIHZhciBkcmF3U3RhdGUgPSB3cmFwRHJhdyhcbiAgICBnbCxcbiAgICBleHRlbnNpb25zLFxuICAgIGJ1ZmZlclN0YXRlKVxuXG4gIHZhciB0ZXh0dXJlU3RhdGUgPSB3cmFwVGV4dHVyZXMoXG4gICAgZ2wsXG4gICAgZXh0ZW5zaW9ucyxcbiAgICBsaW1pdHMsXG4gICAgcG9sbCxcbiAgICB2aWV3cG9ydFN0YXRlKVxuXG4gIHZhciByZW5kZXJidWZmZXJTdGF0ZSA9IHdyYXBSZW5kZXJidWZmZXJzKFxuICAgIGdsLFxuICAgIGV4dGVuc2lvbnMsXG4gICAgbGltaXRzKVxuXG4gIHZhciBmcmFtZWJ1ZmZlclN0YXRlID0gd3JhcEZyYW1lYnVmZmVycyhcbiAgICBnbCxcbiAgICBleHRlbnNpb25zLFxuICAgIGxpbWl0cyxcbiAgICB0ZXh0dXJlU3RhdGUsXG4gICAgcmVuZGVyYnVmZmVyU3RhdGUpXG5cbiAgdmFyIGZyYW1lU3RhdGUgPSB7XG4gICAgY291bnQ6IDAsXG4gICAgc3RhcnQ6IGNsb2NrKCksXG4gICAgZHQ6IDAsXG4gICAgdDogY2xvY2soKSxcbiAgICByZW5kZXJUaW1lOiAwLFxuICAgIHdpZHRoOiBnbC5kcmF3aW5nQnVmZmVyV2lkdGgsXG4gICAgaGVpZ2h0OiBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0LFxuICAgIHBpeGVsUmF0aW86IG9wdGlvbnMucGl4ZWxSYXRpb1xuICB9XG5cbiAgdmFyIGdsU3RhdGUgPSB3cmFwQ29udGV4dChcbiAgICBnbCxcbiAgICBmcmFtZWJ1ZmZlclN0YXRlLFxuICAgIHZpZXdwb3J0U3RhdGUpXG5cbiAgdmFyIHJlYWRQaXhlbHMgPSB3cmFwUmVhZChnbCwgcG9sbCwgdmlld3BvcnRTdGF0ZSlcblxuICB2YXIgY29tcGlsZXIgPSBjcmVhdGVDb21waWxlcihcbiAgICBnbCxcbiAgICBzdHJpbmdTdG9yZSxcbiAgICBleHRlbnNpb25zLFxuICAgIGxpbWl0cyxcbiAgICBidWZmZXJTdGF0ZSxcbiAgICBlbGVtZW50U3RhdGUsXG4gICAgdGV4dHVyZVN0YXRlLFxuICAgIGZyYW1lYnVmZmVyU3RhdGUsXG4gICAgZ2xTdGF0ZSxcbiAgICB1bmlmb3JtU3RhdGUsXG4gICAgYXR0cmlidXRlU3RhdGUsXG4gICAgc2hhZGVyU3RhdGUsXG4gICAgZHJhd1N0YXRlLFxuICAgIGZyYW1lU3RhdGUsXG4gICAgcG9sbClcblxuICB2YXIgY2FudmFzID0gZ2wuY2FudmFzXG5cbiAgLy8gcmFmIHN0dWZmXG4gIHZhciByYWZDYWxsYmFja3MgPSBbXVxuICB2YXIgYWN0aXZlUkFGID0gMFxuICBmdW5jdGlvbiBoYW5kbGVSQUYgKCkge1xuICAgIGFjdGl2ZVJBRiA9IHJhZi5uZXh0KGhhbmRsZVJBRilcbiAgICBmcmFtZVN0YXRlLmNvdW50ICs9IDFcblxuICAgIGlmIChmcmFtZVN0YXRlLndpZHRoICE9PSBnbC5kcmF3aW5nQnVmZmVyV2lkdGggfHxcbiAgICAgICAgZnJhbWVTdGF0ZS5oZWlnaHQgIT09IGdsLmRyYXdpbmdCdWZmZXJIZWlnaHQpIHtcbiAgICAgIGZyYW1lU3RhdGUud2lkdGggPSBnbC5kcmF3aW5nQnVmZmVyV2lkdGhcbiAgICAgIGZyYW1lU3RhdGUuaGVpZ2h0ID0gZ2wuZHJhd2luZ0J1ZmZlckhlaWdodFxuICAgICAgZ2xTdGF0ZS5ub3RpZnlWaWV3cG9ydENoYW5nZWQoKVxuICAgIH1cblxuICAgIHZhciBub3cgPSBjbG9jaygpXG4gICAgZnJhbWVTdGF0ZS5kdCA9IG5vdyAtIGZyYW1lU3RhdGUudFxuICAgIGZyYW1lU3RhdGUudCA9IG5vd1xuXG4gICAgdGV4dHVyZVN0YXRlLnBvbGwoKVxuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCByYWZDYWxsYmFja3MubGVuZ3RoOyArK2kpIHtcbiAgICAgIHZhciBjYiA9IHJhZkNhbGxiYWNrc1tpXVxuICAgICAgY2IoZnJhbWVTdGF0ZS5jb3VudCwgZnJhbWVTdGF0ZS50LCBmcmFtZVN0YXRlLmR0KVxuICAgIH1cbiAgICBmcmFtZVN0YXRlLnJlbmRlclRpbWUgPSBjbG9jaygpIC0gbm93XG4gIH1cblxuICBmdW5jdGlvbiBzdGFydFJBRiAoKSB7XG4gICAgaWYgKCFhY3RpdmVSQUYgJiYgcmFmQ2FsbGJhY2tzLmxlbmd0aCA+IDApIHtcbiAgICAgIGhhbmRsZVJBRigpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc3RvcFJBRiAoKSB7XG4gICAgaWYgKGFjdGl2ZVJBRikge1xuICAgICAgcmFmLmNhbmNlbChoYW5kbGVSQUYpXG4gICAgICBhY3RpdmVSQUYgPSAwXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaGFuZGxlQ29udGV4dExvc3MgKGV2ZW50KSB7XG4gICAgc3RvcFJBRigpXG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKVxuICAgIGlmIChvcHRpb25zLm9uQ29udGV4dExvc3QpIHtcbiAgICAgIG9wdGlvbnMub25Db250ZXh0TG9zdCgpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaGFuZGxlQ29udGV4dFJlc3RvcmVkIChldmVudCkge1xuICAgIGdsLmdldEVycm9yKClcbiAgICBleHRlbnNpb25TdGF0ZS5yZWZyZXNoKClcbiAgICBidWZmZXJTdGF0ZS5yZWZyZXNoKClcbiAgICB0ZXh0dXJlU3RhdGUucmVmcmVzaCgpXG4gICAgcmVuZGVyYnVmZmVyU3RhdGUucmVmcmVzaCgpXG4gICAgZnJhbWVidWZmZXJTdGF0ZS5yZWZyZXNoKClcbiAgICBzaGFkZXJTdGF0ZS5yZWZyZXNoKClcbiAgICBnbFN0YXRlLnJlZnJlc2goKVxuICAgIGlmIChvcHRpb25zLm9uQ29udGV4dFJlc3RvcmVkKSB7XG4gICAgICBvcHRpb25zLm9uQ29udGV4dFJlc3RvcmVkKClcbiAgICB9XG4gICAgaGFuZGxlUkFGKClcbiAgfVxuXG4gIGlmIChjYW52YXMpIHtcbiAgICBjYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihDT05URVhUX0xPU1RfRVZFTlQsIGhhbmRsZUNvbnRleHRMb3NzLCBmYWxzZSlcbiAgICBjYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihDT05URVhUX1JFU1RPUkVEX0VWRU5ULCBoYW5kbGVDb250ZXh0UmVzdG9yZWQsIGZhbHNlKVxuICB9XG5cbiAgLy8gUmVzb3VyY2UgZGVzdHJ1Y3R1aW9uXG4gIGZ1bmN0aW9uIGRlc3Ryb3kgKCkge1xuICAgIHN0b3BSQUYoKVxuXG4gICAgaWYgKGNhbnZhcykge1xuICAgICAgY2FudmFzLnJlbW92ZUV2ZW50TGlzdGVuZXIoQ09OVEVYVF9MT1NUX0VWRU5ULCBoYW5kbGVDb250ZXh0TG9zcylcbiAgICAgIGNhbnZhcy5yZW1vdmVFdmVudExpc3RlbmVyKENPTlRFWFRfUkVTVE9SRURfRVZFTlQsIGhhbmRsZUNvbnRleHRSZXN0b3JlZClcbiAgICB9XG5cbiAgICBzaGFkZXJTdGF0ZS5jbGVhcigpXG4gICAgZnJhbWVidWZmZXJTdGF0ZS5jbGVhcigpXG4gICAgcmVuZGVyYnVmZmVyU3RhdGUuY2xlYXIoKVxuICAgIHRleHR1cmVTdGF0ZS5jbGVhcigpXG4gICAgYnVmZmVyU3RhdGUuY2xlYXIoKVxuXG4gICAgaWYgKG9wdGlvbnMub25EZXN0cm95KSB7XG4gICAgICBvcHRpb25zLm9uRGVzdHJveSgpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gY29tcGlsZVByb2NlZHVyZSAob3B0aW9ucykge1xuICAgIGNoZWNrKCEhb3B0aW9ucywgJ2ludmFsaWQgYXJncyB0byByZWdsKHsuLi59KScpXG4gICAgY2hlY2sudHlwZShvcHRpb25zLCAnb2JqZWN0JywgJ2ludmFsaWQgYXJncyB0byByZWdsKHsuLi59KScpXG5cbiAgICB2YXIgaGFzRHluYW1pYyA9IGZhbHNlXG5cbiAgICBmdW5jdGlvbiBmbGF0dGVuTmVzdGVkT3B0aW9ucyAob3B0aW9ucykge1xuICAgICAgdmFyIHJlc3VsdCA9IGV4dGVuZCh7fSwgb3B0aW9ucylcbiAgICAgIGRlbGV0ZSByZXN1bHQudW5pZm9ybXNcbiAgICAgIGRlbGV0ZSByZXN1bHQuYXR0cmlidXRlc1xuXG4gICAgICBmdW5jdGlvbiBtZXJnZSAobmFtZSkge1xuICAgICAgICBpZiAobmFtZSBpbiByZXN1bHQpIHtcbiAgICAgICAgICB2YXIgY2hpbGQgPSByZXN1bHRbbmFtZV1cbiAgICAgICAgICBkZWxldGUgcmVzdWx0W25hbWVdXG4gICAgICAgICAgT2JqZWN0LmtleXMoY2hpbGQpLmZvckVhY2goZnVuY3Rpb24gKHByb3ApIHtcbiAgICAgICAgICAgIHJlc3VsdFtuYW1lICsgJy4nICsgcHJvcF0gPSBjaGlsZFtwcm9wXVxuICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIG1lcmdlKCdibGVuZCcpXG4gICAgICBtZXJnZSgnZGVwdGgnKVxuICAgICAgbWVyZ2UoJ2N1bGwnKVxuICAgICAgbWVyZ2UoJ3N0ZW5jaWwnKVxuICAgICAgbWVyZ2UoJ3BvbHlnb25PZmZzZXQnKVxuICAgICAgbWVyZ2UoJ3NjaXNzb3InKVxuICAgICAgbWVyZ2UoJ3NhbXBsZScpXG5cbiAgICAgIHJldHVybiByZXN1bHRcbiAgICB9XG5cbiAgICAvLyBGaXJzdCB3ZSBzZXBhcmF0ZSB0aGUgb3B0aW9ucyBpbnRvIHN0YXRpYyBhbmQgZHluYW1pYyBjb21wb25lbnRzXG4gICAgZnVuY3Rpb24gc2VwYXJhdGVEeW5hbWljIChvYmplY3QpIHtcbiAgICAgIHZhciBzdGF0aWNJdGVtcyA9IHt9XG4gICAgICB2YXIgZHluYW1pY0l0ZW1zID0ge31cbiAgICAgIE9iamVjdC5rZXlzKG9iamVjdCkuZm9yRWFjaChmdW5jdGlvbiAob3B0aW9uKSB7XG4gICAgICAgIHZhciB2YWx1ZSA9IG9iamVjdFtvcHRpb25dXG4gICAgICAgIGlmIChkeW5hbWljLmlzRHluYW1pYyh2YWx1ZSkpIHtcbiAgICAgICAgICBoYXNEeW5hbWljID0gdHJ1ZVxuICAgICAgICAgIGR5bmFtaWNJdGVtc1tvcHRpb25dID0gZHluYW1pYy51bmJveCh2YWx1ZSwgb3B0aW9uKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHN0YXRpY0l0ZW1zW29wdGlvbl0gPSB2YWx1ZVxuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgZHluYW1pYzogZHluYW1pY0l0ZW1zLFxuICAgICAgICBzdGF0aWM6IHN0YXRpY0l0ZW1zXG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFyIHVuaWZvcm1zID0gc2VwYXJhdGVEeW5hbWljKG9wdGlvbnMudW5pZm9ybXMgfHwge30pXG4gICAgdmFyIGF0dHJpYnV0ZXMgPSBzZXBhcmF0ZUR5bmFtaWMob3B0aW9ucy5hdHRyaWJ1dGVzIHx8IHt9KVxuICAgIHZhciBvcHRzID0gc2VwYXJhdGVEeW5hbWljKGZsYXR0ZW5OZXN0ZWRPcHRpb25zKG9wdGlvbnMpKVxuXG4gICAgdmFyIGNvbXBpbGVkID0gY29tcGlsZXIuY29tbWFuZChcbiAgICAgIG9wdHMuc3RhdGljLCB1bmlmb3Jtcy5zdGF0aWMsIGF0dHJpYnV0ZXMuc3RhdGljLFxuICAgICAgb3B0cy5keW5hbWljLCB1bmlmb3Jtcy5keW5hbWljLCBhdHRyaWJ1dGVzLmR5bmFtaWMsXG4gICAgICBoYXNEeW5hbWljKVxuXG4gICAgdmFyIGRyYXcgPSBjb21waWxlZC5kcmF3XG4gICAgdmFyIGJhdGNoID0gY29tcGlsZWQuYmF0Y2hcbiAgICB2YXIgc2NvcGUgPSBjb21waWxlZC5zY29wZVxuXG4gICAgdmFyIEVNUFRZX0FSUkFZID0gW11cbiAgICBmdW5jdGlvbiByZXNlcnZlIChjb3VudCkge1xuICAgICAgd2hpbGUgKEVNUFRZX0FSUkFZLmxlbmd0aCA8IGNvdW50KSB7XG4gICAgICAgIEVNUFRZX0FSUkFZLnB1c2gobnVsbClcbiAgICAgIH1cbiAgICAgIHJldHVybiBFTVBUWV9BUlJBWVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIFJFR0xDb21tYW5kIChhcmdzLCBib2R5KSB7XG4gICAgICBpZiAodHlwZW9mIGFyZ3MgPT09ICdudW1iZXInKSB7XG4gICAgICAgIHJldHVybiBiYXRjaChhcmdzIHwgMCwgcmVzZXJ2ZShhcmdzIHwgMCkpXG4gICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoYXJncykpIHtcbiAgICAgICAgcmV0dXJuIGJhdGNoKGFyZ3MubGVuZ3RoLCBhcmdzKVxuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgYXJncyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICByZXR1cm4gc2NvcGUobnVsbCwgYXJncylcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGJvZHkgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgcmV0dXJuIHNjb3BlKGFyZ3MsIGJvZHkpXG4gICAgICB9XG4gICAgICByZXR1cm4gZHJhdyhhcmdzKVxuICAgIH1cblxuICAgIHJldHVybiBSRUdMQ29tbWFuZFxuICB9XG5cbiAgZnVuY3Rpb24gcG9sbCAoKSB7XG4gICAgZnJhbWVidWZmZXJTdGF0ZS5wb2xsKClcbiAgICBnbFN0YXRlLnBvbGwoKVxuICB9XG5cbiAgZnVuY3Rpb24gY2xlYXIgKG9wdGlvbnMpIHtcbiAgICB2YXIgY2xlYXJGbGFncyA9IDBcblxuICAgIC8vIFVwZGF0ZSBjb250ZXh0IHN0YXRlXG4gICAgcG9sbCgpXG5cbiAgICB2YXIgYyA9IG9wdGlvbnMuY29sb3JcbiAgICBpZiAoYykge1xuICAgICAgZ2wuY2xlYXJDb2xvcigrY1swXSB8fCAwLCArY1sxXSB8fCAwLCArY1syXSB8fCAwLCArY1szXSB8fCAwKVxuICAgICAgY2xlYXJGbGFncyB8PSBHTF9DT0xPUl9CVUZGRVJfQklUXG4gICAgfVxuICAgIGlmICgnZGVwdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgIGdsLmNsZWFyRGVwdGgoK29wdGlvbnMuZGVwdGgpXG4gICAgICBjbGVhckZsYWdzIHw9IEdMX0RFUFRIX0JVRkZFUl9CSVRcbiAgICB9XG4gICAgaWYgKCdzdGVuY2lsJyBpbiBvcHRpb25zKSB7XG4gICAgICBnbC5jbGVhclN0ZW5jaWwob3B0aW9ucy5zdGVuY2lsIHwgMClcbiAgICAgIGNsZWFyRmxhZ3MgfD0gR0xfU1RFTkNJTF9CVUZGRVJfQklUXG4gICAgfVxuXG4gICAgY2hlY2soISFjbGVhckZsYWdzLCAnY2FsbGVkIHJlZ2wuY2xlYXIgd2l0aCBubyBidWZmZXIgc3BlY2lmaWVkJylcbiAgICBnbC5jbGVhcihjbGVhckZsYWdzKVxuICB9XG5cbiAgLy8gUmVnaXN0ZXJzIGFub3RoZXIgcmVxdWVzdEFuaW1hdGlvbkZyYW1lIGNhbGxiYWNrXG4gIGZ1bmN0aW9uIGZyYW1lIChjYikge1xuICAgIHJhZkNhbGxiYWNrcy5wdXNoKGNiKVxuXG4gICAgZnVuY3Rpb24gY2FuY2VsICgpIHtcbiAgICAgIHZhciBpbmRleCA9IHJhZkNhbGxiYWNrcy5maW5kKGZ1bmN0aW9uIChpdGVtKSB7XG4gICAgICAgIHJldHVybiBpdGVtID09PSBjYlxuICAgICAgfSlcbiAgICAgIGlmIChpbmRleCA8IDApIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICByYWZDYWxsYmFja3Muc3BsaWNlKGluZGV4LCAxKVxuICAgICAgaWYgKHJhZkNhbGxiYWNrcy5sZW5ndGggPD0gMCkge1xuICAgICAgICBzdG9wUkFGKClcbiAgICAgIH1cbiAgICB9XG5cbiAgICBzdGFydFJBRigpXG5cbiAgICByZXR1cm4ge1xuICAgICAgY2FuY2VsOiBjYW5jZWxcbiAgICB9XG4gIH1cblxuICByZXR1cm4gZXh0ZW5kKGNvbXBpbGVQcm9jZWR1cmUsIHtcbiAgICAvLyBDbGVhciBjdXJyZW50IEZCT1xuICAgIGNsZWFyOiBjbGVhcixcblxuICAgIC8vIFNob3J0IGN1dCBmb3IgcHJvcCBiaW5kaW5nXG4gICAgcHJvcDogZHluYW1pYy5kZWZpbmUsXG5cbiAgICAvLyBleGVjdXRlcyBhbiBlbXB0eSBkcmF3IGNvbW1hbmRcbiAgICBkcmF3OiBjb21waWxlUHJvY2VkdXJlKHt9KSxcblxuICAgIC8vIFJlc291cmNlc1xuICAgIGVsZW1lbnRzOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgcmV0dXJuIGVsZW1lbnRTdGF0ZS5jcmVhdGUob3B0aW9ucylcbiAgICB9LFxuICAgIGJ1ZmZlcjogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgIHJldHVybiBidWZmZXJTdGF0ZS5jcmVhdGUob3B0aW9ucywgR0xfQVJSQVlfQlVGRkVSKVxuICAgIH0sXG4gICAgdGV4dHVyZTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgIHJldHVybiB0ZXh0dXJlU3RhdGUuY3JlYXRlKG9wdGlvbnMsIEdMX1RFWFRVUkVfMkQpXG4gICAgfSxcbiAgICBjdWJlOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDYpIHtcbiAgICAgICAgcmV0dXJuIHRleHR1cmVTdGF0ZS5jcmVhdGUoXG4gICAgICAgICAgQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKSxcbiAgICAgICAgICBHTF9URVhUVVJFX0NVQkVfTUFQKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHRleHR1cmVTdGF0ZS5jcmVhdGUob3B0aW9ucywgR0xfVEVYVFVSRV9DVUJFX01BUClcbiAgICAgIH1cbiAgICB9LFxuICAgIHJlbmRlcmJ1ZmZlcjogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgIHJldHVybiByZW5kZXJidWZmZXJTdGF0ZS5jcmVhdGUob3B0aW9ucylcbiAgICB9LFxuICAgIGZyYW1lYnVmZmVyOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgcmV0dXJuIGZyYW1lYnVmZmVyU3RhdGUuY3JlYXRlKG9wdGlvbnMpXG4gICAgfSxcbiAgICBmcmFtZWJ1ZmZlckN1YmU6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICBjaGVjay5yYWlzZSgnZnJhbWVidWZmZXIgY3ViZSBub3QgeWV0IGltcGxlbWVudGVkJylcbiAgICB9LFxuXG4gICAgLy8gRnJhbWUgcmVuZGVyaW5nXG4gICAgZnJhbWU6IGZyYW1lLFxuICAgIHN0YXRzOiBmcmFtZVN0YXRlLFxuXG4gICAgLy8gU3lzdGVtIGxpbWl0c1xuICAgIGxpbWl0czogbGltaXRzLFxuXG4gICAgLy8gUmVhZCBwaXhlbHNcbiAgICByZWFkOiByZWFkUGl4ZWxzLFxuXG4gICAgLy8gRGVzdHJveSByZWdsIGFuZCBhbGwgYXNzb2NpYXRlZCByZXNvdXJjZXNcbiAgICBkZXN0cm95OiBkZXN0cm95XG4gIH0pXG59XG4iXX0=
