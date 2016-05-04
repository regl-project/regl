(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var regl = require('../regl')()

regl.clear({
  color: [1, 0, 0, 1]
})

var drawTriangle = regl({
  frag: `
    void main() {
      gl_FragColor = vec4(0, 0, 1, 1);
    }`,

  vert: `
    attribute vec4 position;
    void main() {
      gl_Position = position;
    }`,

  attributes: {
    position: regl.buffer([
      [2, 2, 0, 1],
      [2, -2, 0, 1],
      [-2, -2, 0, 1]
    ])
  },

  count: 3
})

drawTriangle()

},{"../regl":32}],2:[function(require,module,exports){
var glTypes = require('./constants/dtypes.json')

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

Object.assign(AttributeRecord.prototype, {
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

module.exports = function wrapAttributeState (gl, extensions, limits, bufferState) {
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

  Object.assign(AttributeStack.prototype, {
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
    if (name in attributeState) {
      return
    }
    attributeState[name] = new AttributeStack()
  }

  return {
    bindings: attributeBindings,
    attributes: attributeState,
    bind: bindAttribute,
    def: defAttribute
  }
}

},{"./constants/dtypes.json":9}],3:[function(require,module,exports){
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

},{"./check":4,"./constants/arraytypes.json":8,"./constants/dtypes.json":9,"./is-ndarray":17,"./is-typed-array":18,"./values":31}],4:[function(require,module,exports){
// Error checking and parameter validation
var isTypedArray = require('./is-typed-array')

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

module.exports = Object.assign(check, {
  raise: raise,
  parameter: checkParameter,
  type: checkTypeOf,
  isTypedArray: checkIsTypedArray,
  nni: checkNonNegativeInt,
  oneOf: checkOneOf
})

},{"./is-typed-array":18}],5:[function(require,module,exports){
/* globals performance */
module.exports =
  (typeof performance !== 'undefined' && performance.now)
  ? function () { return performance.now() }
  : function () { return +(new Date()) }

},{}],6:[function(require,module,exports){
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

    return Object.assign(push, {
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

    var result = procedures[name] = Object.assign(body, {
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

},{}],7:[function(require,module,exports){
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
      var STACK = link(attributeState.attributes[attribute.name])
      draw(BIND_ATTRIBUTE, '(',
        attribute.location, ',',
        link(attributeState.bindings[attribute.location]), ',',
        STACK, '.records[', STACK, '.top]', ',',
        typeLength(attribute.info.type), ');')
    })

    // set up uniforms
    program.uniforms.forEach(function (uniform) {
      var LOCATION = link(uniform.location)
      var STACK = link(uniformState.uniforms[uniform.name])
      var TOP = STACK + '[' + STACK + '.length-1]'
      if (uniform.info.type === GL_SAMPLER_2D ||
        uniform.info.type === GL_SAMPLER_CUBE) {
        var TEX_VALUE = def(TOP + '._texture')
        TEXTURE_UNIFORMS.push(TEX_VALUE)
        draw(setUniformString(GL, GL_INT, LOCATION, TEX_VALUE + '.bind()'))
      } else {
        draw(setUniformString(GL, uniform.info.type, LOCATION, TOP))
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
      var STACK = link(uniformState.uniforms[uniform.name])
      var TOP = STACK + '[' + STACK + '.length-1]'
      if (uniform.info.type === GL_SAMPLER_2D ||
        uniform.info.type === GL_SAMPLER_CUBE) {
        var TEX_VALUE = def(TOP + '._texture')
        batch(setUniformString(GL, GL_INT, LOCATION, TEX_VALUE + '.bind()'))
        exit(TEX_VALUE, '.unbind();')
      } else {
        batch(setUniformString(GL, uniform.info.type, LOCATION, TOP))
      }
    })

    // -------------------------------
    // set static attributes
    // -------------------------------
    program.attributes.forEach(function (attribute) {
      if (attributes.name in attributes) {
        return
      }
      var STACK = link(attributeState.attributes[attribute.name])
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
          entry(FRAG_SHADER_STATE, '.push(', link(value), ');')
          exit(FRAG_SHADER_STATE, '.pop();')
          break

        case 'vert':
          hasShader = true
          entry(VERT_SHADER_STATE, '.push(', link(value), ');')
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
          link(shaderState.create(vertSrc, fragSrc)), ');')
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
      uniformState.def(uniform)
      var STACK = link(uniformState.uniforms[uniform])
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
      attributeState.def(attribute)
      var ATTRIBUTE = link(attributeState.attributes[attribute])

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
      uniformState.def(uniform)
      var STACK = link(uniformState.uniforms[uniform])
      var VALUE = dyn(dynamicUniforms[uniform])
      dynamicEntry(STACK, '.push(', VALUE, ');')
      dynamicExit(STACK, '.pop();')
    })

    // -------------------------------
    // dynamic attributes
    // -------------------------------
    Object.keys(dynamicAttributes).forEach(function (attribute) {
      attributeState.def(attribute)
      var ATTRIBUTE = link(attributeState.attributes[attribute])
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

function createCanvas (element, options) {
  var canvas = document.createElement('canvas')
  var args = getContext(canvas, options)

  Object.assign(canvas.style, {
    border: 0,
    margin: 0,
    padding: 0,
    top: 0,
    left: 0
  })
  element.appendChild(canvas)

  if (element === document.body) {
    canvas.style.position = 'absolute'
    Object.assign(element.style, {
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
    Object.assign(canvas.style, {
      width: w + 'px',
      height: h + 'px'
    })
  }

  window.addEventListener('resize', resize, false)

  var prevDestroy = args.options.onDestroy
  args.options = Object.assign({}, args.options, {
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
    options: Object.assign({
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
        options: Object.assign({
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

},{"./check":4}],12:[function(require,module,exports){
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

    Object.assign(reglElements, {
      _reglType: 'elements',
      _elements: elements,
      destroy: function () {
        check(elements.buffer !== null, 'must not double destroy elements')
        buffer.destroy()
        elements.buffer = null
      }
    })

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

},{"./check":4,"./constants/primitives.json":10,"./is-ndarray":17,"./is-typed-array":18}],15:[function(require,module,exports){
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

},{}],16:[function(require,module,exports){
var check = require('./check')
var values = require('./values')

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

  var colorFormats = Object.assign({},
    colorTextureFormats,
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

    Object.assign(reglFramebuffer, {
      _reglType: 'framebuffer',
      _framebuffer: framebuffer,
      destroy: function () {
        destroy(framebuffer)
      }
    })

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

},{"./check":4,"./values":31}],17:[function(require,module,exports){
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

},{"./is-typed-array":18}],18:[function(require,module,exports){
var dtypes = require('./constants/arraytypes.json')
module.exports = function (x) {
  return Object.prototype.toString.call(x) in dtypes
}

},{"./constants/arraytypes.json":8}],19:[function(require,module,exports){
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

},{}],20:[function(require,module,exports){
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

},{}],21:[function(require,module,exports){
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

},{"./check":4}],22:[function(require,module,exports){
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

},{}],23:[function(require,module,exports){
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

},{"./check":4,"./is-typed-array":18}],24:[function(require,module,exports){
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

    Object.assign(reglRenderbuffer, {
      _reglType: 'renderbuffer',
      _renderbuffer: renderbuffer,
      destroy: function () {
        renderbuffer.decRef()
      }
    })

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

},{"./check":4,"./values":31}],25:[function(require,module,exports){
var check = require('./check')

var DEFAULT_FRAG_SHADER = 'void main(){gl_FragColor=vec4(0,0,0,0);}'
var DEFAULT_VERT_SHADER = 'void main(){gl_Position=vec4(0,0,0,0);}'

var GL_FRAGMENT_SHADER = 35632
var GL_VERTEX_SHADER = 35633

function ActiveInfo (name, location, info) {
  this.name = name
  this.location = location
  this.info = info
}

module.exports = function wrapShaderState (
  gl,
  attributeState,
  uniformState,
  compileShaderDraw) {
  // ===================================================
  // glsl compilation and linking
  // ===================================================
  var shaders = {}

  var fragShaders = [DEFAULT_FRAG_SHADER]
  var vertShaders = [DEFAULT_VERT_SHADER]

  function getShader (type, source) {
    var cache = shaders[type]
    var shader = cache[source]

    if (!shader) {
      shader = gl.createShader(type)
      gl.shaderSource(shader, source)
      gl.compileShader(shader)

      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        var errLog = gl.getShaderInfoLog(shader)
        check.raise('Error compiling shader:\n' + errLog)
      }
      cache[source] = shader
    }

    return shader
  }

  function refreshShaders () {
    shaders[GL_FRAGMENT_SHADER] = {}
    shaders[GL_VERTEX_SHADER] = {}
  }

  function clearShaders () {
    Object.keys(shaders).forEach(function (type) {
      Object.keys(shaders[type]).forEach(function (shader) {
        gl.deleteShader(shaders[type][shader])
      })
    })
    shaders[GL_FRAGMENT_SHADER] = {}
    shaders[GL_VERTEX_SHADER] = {}
  }

  // ===================================================
  // program linking
  // ===================================================
  var programCache = {}
  var programList = []

  function REGLProgram (fragSrc, vertSrc) {
    this.fragSrc = fragSrc
    this.vertSrc = vertSrc
    this.program = null
    this.uniforms = []
    this.attributes = []
    this.draw = function () {}
    this.batchCache = {}
  }

  Object.assign(REGLProgram.prototype, {
    link: function () {
      var i, info

      // -------------------------------
      // compile & link
      // -------------------------------
      var fragShader = getShader(gl.FRAGMENT_SHADER, this.fragSrc)
      var vertShader = getShader(gl.VERTEX_SHADER, this.vertSrc)

      var program = this.program = gl.createProgram()
      gl.attachShader(program, fragShader)
      gl.attachShader(program, vertShader)
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        var errLog = gl.getProgramInfoLog(program)
        check.raise('Error linking program:\n' + errLog)
      }

      // -------------------------------
      // grab uniforms
      // -------------------------------
      var numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS)
      var uniforms = this.uniforms = []
      for (i = 0; i < numUniforms; ++i) {
        info = gl.getActiveUniform(program, i)
        if (info) {
          if (info.size > 1) {
            for (var j = 0; j < info.size; ++j) {
              var name = info.name.replace('[0]', '[' + j + ']')
              uniforms.push(new ActiveInfo(
                name,
                gl.getUniformLocation(program, name),
                info))
              uniformState.def(name)
            }
          } else {
            uniforms.push(new ActiveInfo(
              info.name,
              gl.getUniformLocation(program, info.name),
              info))
            uniformState.def(info.name)
          }
        }
      }

      // -------------------------------
      // grab attributes
      // -------------------------------
      var numAttributes = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES)
      var attributes = this.attributes = []
      for (i = 0; i < numAttributes; ++i) {
        info = gl.getActiveAttrib(program, i)
        if (info) {
          attributes.push(new ActiveInfo(
            info.name,
            gl.getAttribLocation(program, info.name),
            info))
          attributeState.def(info.name)
        }
      }

      // -------------------------------
      // clear cached rendering methods
      // -------------------------------
      this.draw = compileShaderDraw(this)
      this.batchCache = {}
    },

    destroy: function () {
      gl.deleteProgram(this.program)
    }
  })

  function getProgram (vertSource, fragSource) {
    var cache = programCache[fragSource]
    if (!cache) {
      cache = programCache[fragSource] = {}
    }
    var program = cache[vertSource]
    if (!program) {
      program = new REGLProgram(fragSource, vertSource)
      program.link()
      cache[vertSource] = program
      programList.push(program)
    }
    return program
  }

  function clearPrograms () {
    programList.forEach(function (program) {
      program.destroy()
    })
    programList.length = 0
    programCache = {}
  }

  function refreshPrograms () {
    programList.forEach(function (program) {
      program.link()
    })
  }

  // ===================================================
  // program state
  // ===================================================
  var programState = [null]

  // ===================================================
  // context management
  // ===================================================
  function clear () {
    clearShaders()
    clearPrograms()
  }

  function refresh () {
    refreshShaders()
    refreshPrograms()
  }

  // We call clear once to initialize all data structures
  clear()

  return {
    create: getProgram,
    clear: clear,
    refresh: refresh,
    programs: programState,
    fragShaders: fragShaders,
    vertShaders: vertShaders
  }
}

},{"./check":4}],26:[function(require,module,exports){
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

},{}],27:[function(require,module,exports){
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

},{"./codegen":6,"./stack":26}],28:[function(require,module,exports){
var check = require('./check')
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

  var minFilters = Object.assign({
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
    Object.assign(textureFormats, {
      'depth': GL_DEPTH_COMPONENT,
      'depth stencil': GL_DEPTH_STENCIL
    })

    Object.assign(textureTypes, {
      'uint16': GL_UNSIGNED_SHORT,
      'uint32': GL_UNSIGNED_INT,
      'depth stencil': GL_UNSIGNED_INT_24_8_WEBGL
    })
  }

  if (extensions.webgl_compressed_texture_s3tc) {
    Object.assign(compressedTextureFormats, {
      'rgb s3tc dxt1': GL_COMPRESSED_RGB_S3TC_DXT1_EXT,
      'rgba s3tc dxt1': GL_COMPRESSED_RGBA_S3TC_DXT1_EXT,
      'rgba s3tc dxt3': GL_COMPRESSED_RGBA_S3TC_DXT3_EXT,
      'rgba s3tc dxt5': GL_COMPRESSED_RGBA_S3TC_DXT5_EXT
    })
  }

  if (extensions.webgl_compressed_texture_atc) {
    Object.assign(compressedTextureFormats, {
      'rgb arc': GL_COMPRESSED_RGB_ATC_WEBGL,
      'rgba atc explicit alpha': GL_COMPRESSED_RGBA_ATC_EXPLICIT_ALPHA_WEBGL,
      'rgba atc interpolated alpha': GL_COMPRESSED_RGBA_ATC_INTERPOLATED_ALPHA_WEBGL
    })
  }

  if (extensions.webgl_compressed_texture_pvrtc) {
    Object.assign(compressedTextureFormats, {
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

  Object.assign(PixelInfo.prototype, {
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

  Object.assign(TexParams.prototype, {
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

  Object.assign(REGLTexture.prototype, {
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

    Object.assign(reglTexture, {
      _reglType: 'texture',
      _texture: texture,
      destroy: function () {
        texture.decRef()
      }
    })

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

},{"./check":4,"./is-ndarray":17,"./is-typed-array":18,"./load-texture":20,"./parse-dds":21,"./to-half-float":29,"./values":31}],29:[function(require,module,exports){
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

},{}],30:[function(require,module,exports){
module.exports = function wrapUniformState () {
  var uniformState = {}

  function defUniform (name) {
    if (name in uniformState) {
      return
    }
    uniformState[name] = [ [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] ]
  }

  return {
    uniforms: uniformState,
    def: defUniform
  }
}

},{}],31:[function(require,module,exports){
module.exports = function (obj) {
  return Object.keys(obj).map(function (key) { return obj[key] })
}

},{}],32:[function(require,module,exports){
var check = require('./lib/check')
var getContext = require('./lib/context')
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

  var uniformState = wrapUniforms()

  var attributeState = wrapAttributes(
    gl,
    extensions,
    limits,
    bufferState)

  var shaderState = wrapShaders(
    gl,
    attributeState,
    uniformState,
    function (program) {
      return compiler.draw(program)
    })

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
      var result = Object.assign({}, options)
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

  return Object.assign(compileProcedure, {
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

},{"./lib/attribute":2,"./lib/buffer":3,"./lib/check":4,"./lib/clock":5,"./lib/compile":7,"./lib/context":11,"./lib/draw":12,"./lib/dynamic":13,"./lib/elements":14,"./lib/extension":15,"./lib/framebuffer":16,"./lib/limits":19,"./lib/raf":22,"./lib/read":23,"./lib/renderbuffer":24,"./lib/shader":25,"./lib/state":27,"./lib/texture":28,"./lib/uniform":30}]},{},[1])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJleGFtcGxlL3RyaWFuZ2xlLmpzIiwibGliL2F0dHJpYnV0ZS5qcyIsImxpYi9idWZmZXIuanMiLCJsaWIvY2hlY2suanMiLCJsaWIvY2xvY2suanMiLCJsaWIvY29kZWdlbi5qcyIsImxpYi9jb21waWxlLmpzIiwibGliL2NvbnN0YW50cy9hcnJheXR5cGVzLmpzb24iLCJsaWIvY29uc3RhbnRzL2R0eXBlcy5qc29uIiwibGliL2NvbnN0YW50cy9wcmltaXRpdmVzLmpzb24iLCJsaWIvY29udGV4dC5qcyIsImxpYi9kcmF3LmpzIiwibGliL2R5bmFtaWMuanMiLCJsaWIvZWxlbWVudHMuanMiLCJsaWIvZXh0ZW5zaW9uLmpzIiwibGliL2ZyYW1lYnVmZmVyLmpzIiwibGliL2lzLW5kYXJyYXkuanMiLCJsaWIvaXMtdHlwZWQtYXJyYXkuanMiLCJsaWIvbGltaXRzLmpzIiwibGliL2xvYWQtdGV4dHVyZS5qcyIsImxpYi9wYXJzZS1kZHMuanMiLCJsaWIvcmFmLmpzIiwibGliL3JlYWQuanMiLCJsaWIvcmVuZGVyYnVmZmVyLmpzIiwibGliL3NoYWRlci5qcyIsImxpYi9zdGFjay5qcyIsImxpYi9zdGF0ZS5qcyIsImxpYi90ZXh0dXJlLmpzIiwibGliL3RvLWhhbGYtZmxvYXQuanMiLCJsaWIvdW5pZm9ybS5qcyIsImxpYi92YWx1ZXMuanMiLCJyZWdsLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5TUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2UEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0bURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2SEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5dUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkxBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDak1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMzVDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2ZBO0FBQ0E7QUFDQTtBQUNBOztBQ0hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwidmFyIHJlZ2wgPSByZXF1aXJlKCcuLi9yZWdsJykoKVxuXG5yZWdsLmNsZWFyKHtcbiAgY29sb3I6IFsxLCAwLCAwLCAxXVxufSlcblxudmFyIGRyYXdUcmlhbmdsZSA9IHJlZ2woe1xuICBmcmFnOiBgXG4gICAgdm9pZCBtYWluKCkge1xuICAgICAgZ2xfRnJhZ0NvbG9yID0gdmVjNCgwLCAwLCAxLCAxKTtcbiAgICB9YCxcblxuICB2ZXJ0OiBgXG4gICAgYXR0cmlidXRlIHZlYzQgcG9zaXRpb247XG4gICAgdm9pZCBtYWluKCkge1xuICAgICAgZ2xfUG9zaXRpb24gPSBwb3NpdGlvbjtcbiAgICB9YCxcblxuICBhdHRyaWJ1dGVzOiB7XG4gICAgcG9zaXRpb246IHJlZ2wuYnVmZmVyKFtcbiAgICAgIFsyLCAyLCAwLCAxXSxcbiAgICAgIFsyLCAtMiwgMCwgMV0sXG4gICAgICBbLTIsIC0yLCAwLCAxXVxuICAgIF0pXG4gIH0sXG5cbiAgY291bnQ6IDNcbn0pXG5cbmRyYXdUcmlhbmdsZSgpXG4iLCJ2YXIgZ2xUeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL2R0eXBlcy5qc29uJylcblxudmFyIEdMX0ZMT0FUID0gNTEyNlxuXG5mdW5jdGlvbiBBdHRyaWJ1dGVSZWNvcmQgKCkge1xuICB0aGlzLnBvaW50ZXIgPSBmYWxzZVxuXG4gIHRoaXMueCA9IDAuMFxuICB0aGlzLnkgPSAwLjBcbiAgdGhpcy56ID0gMC4wXG4gIHRoaXMudyA9IDAuMFxuXG4gIHRoaXMuYnVmZmVyID0gbnVsbFxuICB0aGlzLnNpemUgPSAwXG4gIHRoaXMubm9ybWFsaXplZCA9IGZhbHNlXG4gIHRoaXMudHlwZSA9IEdMX0ZMT0FUXG4gIHRoaXMub2Zmc2V0ID0gMFxuICB0aGlzLnN0cmlkZSA9IDBcbiAgdGhpcy5kaXZpc29yID0gMFxufVxuXG5PYmplY3QuYXNzaWduKEF0dHJpYnV0ZVJlY29yZC5wcm90b3R5cGUsIHtcbiAgZXF1YWxzOiBmdW5jdGlvbiAob3RoZXIsIHNpemUpIHtcbiAgICBpZiAoIXRoaXMucG9pbnRlcikge1xuICAgICAgcmV0dXJuICFvdGhlci5wb2ludGVyICYmXG4gICAgICAgIHRoaXMueCA9PT0gb3RoZXIueCAmJlxuICAgICAgICB0aGlzLnkgPT09IG90aGVyLnkgJiZcbiAgICAgICAgdGhpcy56ID09PSBvdGhlci56ICYmXG4gICAgICAgIHRoaXMudyA9PT0gb3RoZXIud1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gb3RoZXIucG9pbnRlciAmJlxuICAgICAgICB0aGlzLmJ1ZmZlciA9PT0gb3RoZXIuYnVmZmVyICYmXG4gICAgICAgIHRoaXMuc2l6ZSA9PT0gc2l6ZSAmJlxuICAgICAgICB0aGlzLm5vcm1hbGl6ZWQgPT09IG90aGVyLm5vcm1hbGl6ZWQgJiZcbiAgICAgICAgdGhpcy50eXBlID09PSBvdGhlci50eXBlICYmXG4gICAgICAgIHRoaXMub2Zmc2V0ID09PSBvdGhlci5vZmZzZXQgJiZcbiAgICAgICAgdGhpcy5zdHJpZGUgPT09IG90aGVyLnN0cmlkZSAmJlxuICAgICAgICB0aGlzLmRpdmlzb3IgPT09IG90aGVyLmRpdmlzb3JcbiAgICB9XG4gIH0sXG5cbiAgc2V0OiBmdW5jdGlvbiAob3RoZXIsIHNpemUpIHtcbiAgICB2YXIgcG9pbnRlciA9IHRoaXMucG9pbnRlciA9IG90aGVyLnBvaW50ZXJcbiAgICBpZiAocG9pbnRlcikge1xuICAgICAgdGhpcy5idWZmZXIgPSBvdGhlci5idWZmZXJcbiAgICAgIHRoaXMuc2l6ZSA9IHNpemVcbiAgICAgIHRoaXMubm9ybWFsaXplZCA9IG90aGVyLm5vcm1hbGl6ZWRcbiAgICAgIHRoaXMudHlwZSA9IG90aGVyLnR5cGVcbiAgICAgIHRoaXMub2Zmc2V0ID0gb3RoZXIub2Zmc2V0XG4gICAgICB0aGlzLnN0cmlkZSA9IG90aGVyLnN0cmlkZVxuICAgICAgdGhpcy5kaXZpc29yID0gb3RoZXIuZGl2aXNvclxuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnggPSBvdGhlci54XG4gICAgICB0aGlzLnkgPSBvdGhlci55XG4gICAgICB0aGlzLnogPSBvdGhlci56XG4gICAgICB0aGlzLncgPSBvdGhlci53XG4gICAgfVxuICB9XG59KVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBBdHRyaWJ1dGVTdGF0ZSAoZ2wsIGV4dGVuc2lvbnMsIGxpbWl0cywgYnVmZmVyU3RhdGUpIHtcbiAgdmFyIGF0dHJpYnV0ZVN0YXRlID0ge31cblxuICB2YXIgTlVNX0FUVFJJQlVURVMgPSBsaW1pdHMubWF4QXR0cmlidXRlc1xuICB2YXIgYXR0cmlidXRlQmluZGluZ3MgPSBuZXcgQXJyYXkoTlVNX0FUVFJJQlVURVMpXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgTlVNX0FUVFJJQlVURVM7ICsraSkge1xuICAgIGF0dHJpYnV0ZUJpbmRpbmdzW2ldID0gbmV3IEF0dHJpYnV0ZVJlY29yZCgpXG4gIH1cblxuICBmdW5jdGlvbiBBdHRyaWJ1dGVTdGFjayAoKSB7XG4gICAgdmFyIHJlY29yZHMgPSBuZXcgQXJyYXkoMTYpXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCAxNjsgKytpKSB7XG4gICAgICByZWNvcmRzW2ldID0gbmV3IEF0dHJpYnV0ZVJlY29yZCgpXG4gICAgfVxuICAgIHRoaXMucmVjb3JkcyA9IHJlY29yZHNcbiAgICB0aGlzLnRvcCA9IDBcbiAgfVxuXG4gIGZ1bmN0aW9uIHB1c2hBdHRyaWJ1dGVTdGFjayAoc3RhY2spIHtcbiAgICB2YXIgcmVjb3JkcyA9IHN0YWNrLnJlY29yZHNcbiAgICB2YXIgdG9wID0gc3RhY2sudG9wXG5cbiAgICB3aGlsZSAocmVjb3Jkcy5sZW5ndGggLSAxIDw9IHRvcCkge1xuICAgICAgcmVjb3Jkcy5wdXNoKG5ldyBBdHRyaWJ1dGVSZWNvcmQoKSlcbiAgICB9XG5cbiAgICByZXR1cm4gcmVjb3Jkc1srK3N0YWNrLnRvcF1cbiAgfVxuXG4gIE9iamVjdC5hc3NpZ24oQXR0cmlidXRlU3RhY2sucHJvdG90eXBlLCB7XG4gICAgcHVzaFZlYzogZnVuY3Rpb24gKHgsIHksIHosIHcpIHtcbiAgICAgIHZhciBoZWFkID0gcHVzaEF0dHJpYnV0ZVN0YWNrKHRoaXMpXG4gICAgICBoZWFkLnBvaW50ZXIgPSBmYWxzZVxuICAgICAgaGVhZC54ID0geFxuICAgICAgaGVhZC55ID0geVxuICAgICAgaGVhZC56ID0gelxuICAgICAgaGVhZC53ID0gd1xuICAgIH0sXG5cbiAgICBwdXNoUHRyOiBmdW5jdGlvbiAoXG4gICAgICBidWZmZXIsXG4gICAgICBzaXplLFxuICAgICAgb2Zmc2V0LFxuICAgICAgc3RyaWRlLFxuICAgICAgZGl2aXNvcixcbiAgICAgIG5vcm1hbGl6ZWQsXG4gICAgICB0eXBlKSB7XG4gICAgICB2YXIgaGVhZCA9IHB1c2hBdHRyaWJ1dGVTdGFjayh0aGlzKVxuICAgICAgaGVhZC5wb2ludGVyID0gdHJ1ZVxuICAgICAgaGVhZC5idWZmZXIgPSBidWZmZXJcbiAgICAgIGhlYWQuc2l6ZSA9IHNpemVcbiAgICAgIGhlYWQub2Zmc2V0ID0gb2Zmc2V0XG4gICAgICBoZWFkLnN0cmlkZSA9IHN0cmlkZVxuICAgICAgaGVhZC5kaXZpc29yID0gZGl2aXNvclxuICAgICAgaGVhZC5ub3JtYWxpemVkID0gbm9ybWFsaXplZFxuICAgICAgaGVhZC50eXBlID0gdHlwZVxuICAgIH0sXG5cbiAgICBwdXNoRHluOiBmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgaWYgKHR5cGVvZiBkYXRhID09PSAnbnVtYmVyJykge1xuICAgICAgICB0aGlzLnB1c2hWZWMoZGF0YSwgMCwgMCwgMClcbiAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShkYXRhKSkge1xuICAgICAgICB0aGlzLnB1c2hWZWMoZGF0YVswXSwgZGF0YVsxXSwgZGF0YVsyXSwgZGF0YVszXSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBidWZmZXIgPSBidWZmZXJTdGF0ZS5nZXRCdWZmZXIoZGF0YSlcbiAgICAgICAgdmFyIHNpemUgPSAwXG4gICAgICAgIHZhciBzdHJpZGUgPSAwXG4gICAgICAgIHZhciBvZmZzZXQgPSAwXG4gICAgICAgIHZhciBkaXZpc29yID0gMFxuICAgICAgICB2YXIgbm9ybWFsaXplZCA9IGZhbHNlXG4gICAgICAgIHZhciB0eXBlID0gR0xfRkxPQVRcbiAgICAgICAgaWYgKCFidWZmZXIpIHtcbiAgICAgICAgICBidWZmZXIgPSBidWZmZXJTdGF0ZS5nZXRCdWZmZXIoZGF0YS5idWZmZXIpXG4gICAgICAgICAgc2l6ZSA9IGRhdGEuc2l6ZSB8fCAwXG4gICAgICAgICAgc3RyaWRlID0gZGF0YS5zdHJpZGUgfHwgMFxuICAgICAgICAgIG9mZnNldCA9IGRhdGEub2Zmc2V0IHx8IDBcbiAgICAgICAgICBkaXZpc29yID0gZGF0YS5kaXZpc29yIHx8IDBcbiAgICAgICAgICBub3JtYWxpemVkID0gZGF0YS5ub3JtYWxpemVkIHx8IGZhbHNlXG4gICAgICAgICAgdHlwZSA9IGJ1ZmZlci5kdHlwZVxuICAgICAgICAgIGlmICgndHlwZScgaW4gZGF0YSkge1xuICAgICAgICAgICAgdHlwZSA9IGdsVHlwZXNbZGF0YS50eXBlXVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0eXBlID0gYnVmZmVyLmR0eXBlXG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5wdXNoUHRyKGJ1ZmZlciwgc2l6ZSwgb2Zmc2V0LCBzdHJpZGUsIGRpdmlzb3IsIG5vcm1hbGl6ZWQsIHR5cGUpXG4gICAgICB9XG4gICAgfSxcblxuICAgIHBvcDogZnVuY3Rpb24gKCkge1xuICAgICAgdGhpcy50b3AgLT0gMVxuICAgIH1cbiAgfSlcblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gQklORCBBTiBBVFRSSUJVVEVcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIGJpbmRBdHRyaWJ1dGUgKGluZGV4LCBjdXJyZW50LCBuZXh0LCBzaXplKSB7XG4gICAgc2l6ZSA9IG5leHQuc2l6ZSB8fCBzaXplXG4gICAgaWYgKGN1cnJlbnQuZXF1YWxzKG5leHQsIHNpemUpKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgaWYgKCFuZXh0LnBvaW50ZXIpIHtcbiAgICAgIGlmIChjdXJyZW50LnBvaW50ZXIpIHtcbiAgICAgICAgZ2wuZGlzYWJsZVZlcnRleEF0dHJpYkFycmF5KGluZGV4KVxuICAgICAgfVxuICAgICAgZ2wudmVydGV4QXR0cmliNGYoaW5kZXgsIG5leHQueCwgbmV4dC55LCBuZXh0LnosIG5leHQudylcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKCFjdXJyZW50LnBvaW50ZXIpIHtcbiAgICAgICAgZ2wuZW5hYmxlVmVydGV4QXR0cmliQXJyYXkoaW5kZXgpXG4gICAgICB9XG4gICAgICBpZiAoY3VycmVudC5idWZmZXIgIT09IG5leHQuYnVmZmVyKSB7XG4gICAgICAgIG5leHQuYnVmZmVyLmJpbmQoKVxuICAgICAgfVxuICAgICAgZ2wudmVydGV4QXR0cmliUG9pbnRlcihcbiAgICAgICAgaW5kZXgsXG4gICAgICAgIHNpemUsXG4gICAgICAgIG5leHQudHlwZSxcbiAgICAgICAgbmV4dC5ub3JtYWxpemVkLFxuICAgICAgICBuZXh0LnN0cmlkZSxcbiAgICAgICAgbmV4dC5vZmZzZXQpXG4gICAgICB2YXIgZXh0SW5zdGFuY2luZyA9IGV4dGVuc2lvbnMuYW5nbGVfaW5zdGFuY2VkX2FycmF5c1xuICAgICAgaWYgKGV4dEluc3RhbmNpbmcpIHtcbiAgICAgICAgZXh0SW5zdGFuY2luZy52ZXJ0ZXhBdHRyaWJEaXZpc29yQU5HTEUoaW5kZXgsIG5leHQuZGl2aXNvcilcbiAgICAgIH1cbiAgICB9XG4gICAgY3VycmVudC5zZXQobmV4dCwgc2l6ZSlcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBERUZJTkUgQSBORVcgQVRUUklCVVRFXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICBmdW5jdGlvbiBkZWZBdHRyaWJ1dGUgKG5hbWUpIHtcbiAgICBpZiAobmFtZSBpbiBhdHRyaWJ1dGVTdGF0ZSkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIGF0dHJpYnV0ZVN0YXRlW25hbWVdID0gbmV3IEF0dHJpYnV0ZVN0YWNrKClcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgYmluZGluZ3M6IGF0dHJpYnV0ZUJpbmRpbmdzLFxuICAgIGF0dHJpYnV0ZXM6IGF0dHJpYnV0ZVN0YXRlLFxuICAgIGJpbmQ6IGJpbmRBdHRyaWJ1dGUsXG4gICAgZGVmOiBkZWZBdHRyaWJ1dGVcbiAgfVxufVxuIiwiLy8gQXJyYXkgYW5kIGVsZW1lbnQgYnVmZmVyIGNyZWF0aW9uXG52YXIgY2hlY2sgPSByZXF1aXJlKCcuL2NoZWNrJylcbnZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL2lzLXR5cGVkLWFycmF5JylcbnZhciBpc05EQXJyYXlMaWtlID0gcmVxdWlyZSgnLi9pcy1uZGFycmF5JylcbnZhciBhcnJheVR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvYXJyYXl0eXBlcy5qc29uJylcbnZhciBidWZmZXJUeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL2R0eXBlcy5qc29uJylcbnZhciB2YWx1ZXMgPSByZXF1aXJlKCcuL3ZhbHVlcycpXG5cbnZhciBHTF9TVEFUSUNfRFJBVyA9IDM1MDQ0XG5cbnZhciBHTF9CWVRFID0gNTEyMFxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSA1MTIxXG52YXIgR0xfU0hPUlQgPSA1MTIyXG52YXIgR0xfVU5TSUdORURfU0hPUlQgPSA1MTIzXG52YXIgR0xfSU5UID0gNTEyNFxudmFyIEdMX1VOU0lHTkVEX0lOVCA9IDUxMjVcbnZhciBHTF9GTE9BVCA9IDUxMjZcblxudmFyIHVzYWdlVHlwZXMgPSB7XG4gICdzdGF0aWMnOiAzNTA0NCxcbiAgJ2R5bmFtaWMnOiAzNTA0OCxcbiAgJ3N0cmVhbSc6IDM1MDQwXG59XG5cbmZ1bmN0aW9uIHR5cGVkQXJyYXlDb2RlIChkYXRhKSB7XG4gIHJldHVybiBhcnJheVR5cGVzW09iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChkYXRhKV0gfCAwXG59XG5cbmZ1bmN0aW9uIG1ha2VUeXBlZEFycmF5IChkdHlwZSwgYXJncykge1xuICBzd2l0Y2ggKGR0eXBlKSB7XG4gICAgY2FzZSBHTF9VTlNJR05FRF9CWVRFOlxuICAgICAgcmV0dXJuIG5ldyBVaW50OEFycmF5KGFyZ3MpXG4gICAgY2FzZSBHTF9VTlNJR05FRF9TSE9SVDpcbiAgICAgIHJldHVybiBuZXcgVWludDE2QXJyYXkoYXJncylcbiAgICBjYXNlIEdMX1VOU0lHTkVEX0lOVDpcbiAgICAgIHJldHVybiBuZXcgVWludDMyQXJyYXkoYXJncylcbiAgICBjYXNlIEdMX0JZVEU6XG4gICAgICByZXR1cm4gbmV3IEludDhBcnJheShhcmdzKVxuICAgIGNhc2UgR0xfU0hPUlQ6XG4gICAgICByZXR1cm4gbmV3IEludDE2QXJyYXkoYXJncylcbiAgICBjYXNlIEdMX0lOVDpcbiAgICAgIHJldHVybiBuZXcgSW50MzJBcnJheShhcmdzKVxuICAgIGNhc2UgR0xfRkxPQVQ6XG4gICAgICByZXR1cm4gbmV3IEZsb2F0MzJBcnJheShhcmdzKVxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gbnVsbFxuICB9XG59XG5cbmZ1bmN0aW9uIGZsYXR0ZW4gKHJlc3VsdCwgZGF0YSwgZGltZW5zaW9uKSB7XG4gIHZhciBwdHIgPSAwXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgZGF0YS5sZW5ndGg7ICsraSkge1xuICAgIHZhciB2ID0gZGF0YVtpXVxuICAgIGZvciAodmFyIGogPSAwOyBqIDwgZGltZW5zaW9uOyArK2opIHtcbiAgICAgIHJlc3VsdFtwdHIrK10gPSB2W2pdXG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHRyYW5zcG9zZSAocmVzdWx0LCBkYXRhLCBzaGFwZVgsIHNoYXBlWSwgc3RyaWRlWCwgc3RyaWRlWSwgb2Zmc2V0KSB7XG4gIHZhciBwdHIgPSAwXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc2hhcGVYOyArK2kpIHtcbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IHNoYXBlWTsgKytqKSB7XG4gICAgICByZXN1bHRbcHRyKytdID0gZGF0YVtzdHJpZGVYICogaSArIHN0cmlkZVkgKiBqICsgb2Zmc2V0XVxuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcEJ1ZmZlclN0YXRlIChnbCkge1xuICB2YXIgYnVmZmVyQ291bnQgPSAwXG4gIHZhciBidWZmZXJTZXQgPSB7fVxuXG4gIGZ1bmN0aW9uIFJFR0xCdWZmZXIgKGJ1ZmZlciwgdHlwZSkge1xuICAgIHRoaXMuaWQgPSBidWZmZXJDb3VudCsrXG4gICAgdGhpcy5idWZmZXIgPSBidWZmZXJcbiAgICB0aGlzLnR5cGUgPSB0eXBlXG4gICAgdGhpcy51c2FnZSA9IEdMX1NUQVRJQ19EUkFXXG4gICAgdGhpcy5ieXRlTGVuZ3RoID0gMFxuICAgIHRoaXMuZGltZW5zaW9uID0gMVxuICAgIHRoaXMuZGF0YSA9IG51bGxcbiAgICB0aGlzLmR0eXBlID0gR0xfVU5TSUdORURfQllURVxuICB9XG5cbiAgUkVHTEJ1ZmZlci5wcm90b3R5cGUuYmluZCA9IGZ1bmN0aW9uICgpIHtcbiAgICBnbC5iaW5kQnVmZmVyKHRoaXMudHlwZSwgdGhpcy5idWZmZXIpXG4gIH1cblxuICBmdW5jdGlvbiByZWZyZXNoIChidWZmZXIpIHtcbiAgICBpZiAoIWdsLmlzQnVmZmVyKGJ1ZmZlci5idWZmZXIpKSB7XG4gICAgICBidWZmZXIuYnVmZmVyID0gZ2wuY3JlYXRlQnVmZmVyKClcbiAgICB9XG4gICAgYnVmZmVyLmJpbmQoKVxuICAgIGdsLmJ1ZmZlckRhdGEoYnVmZmVyLnR5cGUsIGJ1ZmZlci5kYXRhIHx8IGJ1ZmZlci5ieXRlTGVuZ3RoLCBidWZmZXIudXNhZ2UpXG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95IChidWZmZXIpIHtcbiAgICB2YXIgaGFuZGxlID0gYnVmZmVyLmJ1ZmZlclxuICAgIGNoZWNrKGhhbmRsZSwgJ2J1ZmZlciBtdXN0IG5vdCBiZSBkZWxldGVkIGFscmVhZHknKVxuICAgIGlmIChnbC5pc0J1ZmZlcihoYW5kbGUpKSB7XG4gICAgICBnbC5kZWxldGVCdWZmZXIoaGFuZGxlKVxuICAgIH1cbiAgICBidWZmZXIuYnVmZmVyID0gbnVsbFxuICAgIGRlbGV0ZSBidWZmZXJTZXRbYnVmZmVyLmlkXVxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlQnVmZmVyIChvcHRpb25zLCB0eXBlLCBkZWZlckluaXQpIHtcbiAgICB2YXIgaGFuZGxlID0gZ2wuY3JlYXRlQnVmZmVyKClcblxuICAgIHZhciBidWZmZXIgPSBuZXcgUkVHTEJ1ZmZlcihoYW5kbGUsIHR5cGUpXG4gICAgYnVmZmVyU2V0W2J1ZmZlci5pZF0gPSBidWZmZXJcblxuICAgIGZ1bmN0aW9uIHJlZ2xCdWZmZXIgKGlucHV0KSB7XG4gICAgICB2YXIgb3B0aW9ucyA9IGlucHV0IHx8IHt9XG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShvcHRpb25zKSB8fFxuICAgICAgICAgIGlzVHlwZWRBcnJheShvcHRpb25zKSB8fFxuICAgICAgICAgIGlzTkRBcnJheUxpa2Uob3B0aW9ucykpIHtcbiAgICAgICAgb3B0aW9ucyA9IHtcbiAgICAgICAgICBkYXRhOiBvcHRpb25zXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIG9wdGlvbnMgPT09ICdudW1iZXInKSB7XG4gICAgICAgIG9wdGlvbnMgPSB7XG4gICAgICAgICAgbGVuZ3RoOiBvcHRpb25zIHwgMFxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKG9wdGlvbnMgPT09IG51bGwgfHwgb3B0aW9ucyA9PT0gdm9pZCAwKSB7XG4gICAgICAgIG9wdGlvbnMgPSB7fVxuICAgICAgfVxuXG4gICAgICBjaGVjay50eXBlKFxuICAgICAgICBvcHRpb25zLCAnb2JqZWN0JyxcbiAgICAgICAgJ2J1ZmZlciBhcmd1bWVudHMgbXVzdCBiZSBhbiBvYmplY3QsIGEgbnVtYmVyIG9yIGFuIGFycmF5JylcblxuICAgICAgaWYgKCd1c2FnZScgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgdXNhZ2UgPSBvcHRpb25zLnVzYWdlXG4gICAgICAgIGNoZWNrLnBhcmFtZXRlcih1c2FnZSwgdXNhZ2VUeXBlcywgJ2ludmFsaWQgYnVmZmVyIHVzYWdlJylcbiAgICAgICAgYnVmZmVyLnVzYWdlID0gdXNhZ2VUeXBlc1tvcHRpb25zLnVzYWdlXVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYnVmZmVyLnVzYWdlID0gR0xfU1RBVElDX0RSQVdcbiAgICAgIH1cblxuICAgICAgdmFyIGR0eXBlID0gMFxuICAgICAgaWYgKCd0eXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIGNoZWNrLnBhcmFtZXRlcihvcHRpb25zLnR5cGUsIGJ1ZmZlclR5cGVzLCAnaW52YWxpZCBidWZmZXIgdHlwZScpXG4gICAgICAgIGR0eXBlID0gYnVmZmVyVHlwZXNbb3B0aW9ucy50eXBlXVxuICAgICAgfVxuXG4gICAgICB2YXIgZGltZW5zaW9uID0gKG9wdGlvbnMuZGltZW5zaW9uIHwgMCkgfHwgMVxuICAgICAgdmFyIGJ5dGVMZW5ndGggPSAwXG4gICAgICB2YXIgZGF0YSA9IG51bGxcbiAgICAgIGlmICgnZGF0YScgaW4gb3B0aW9ucykge1xuICAgICAgICBkYXRhID0gb3B0aW9ucy5kYXRhXG4gICAgICAgIGlmIChkYXRhID09PSBudWxsKSB7XG4gICAgICAgICAgYnl0ZUxlbmd0aCA9IG9wdGlvbnMubGVuZ3RoIHwgMFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmIChpc05EQXJyYXlMaWtlKGRhdGEpKSB7XG4gICAgICAgICAgICB2YXIgc2hhcGUgPSBkYXRhLnNoYXBlXG4gICAgICAgICAgICB2YXIgc3RyaWRlID0gZGF0YS5zdHJpZGVcbiAgICAgICAgICAgIHZhciBvZmZzZXQgPSBkYXRhLm9mZnNldFxuXG4gICAgICAgICAgICB2YXIgc2hhcGVYID0gMFxuICAgICAgICAgICAgdmFyIHNoYXBlWSA9IDBcbiAgICAgICAgICAgIHZhciBzdHJpZGVYID0gMFxuICAgICAgICAgICAgdmFyIHN0cmlkZVkgPSAwXG4gICAgICAgICAgICBpZiAoc2hhcGUubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICAgIHNoYXBlWCA9IHNoYXBlWzBdXG4gICAgICAgICAgICAgIHNoYXBlWSA9IDFcbiAgICAgICAgICAgICAgc3RyaWRlWCA9IHN0cmlkZVswXVxuICAgICAgICAgICAgICBzdHJpZGVZID0gMFxuICAgICAgICAgICAgfSBlbHNlIGlmIChzaGFwZS5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgICAgICAgc2hhcGVYID0gc2hhcGVbMF1cbiAgICAgICAgICAgICAgc2hhcGVZID0gc2hhcGVbMV1cbiAgICAgICAgICAgICAgc3RyaWRlWCA9IHN0cmlkZVswXVxuICAgICAgICAgICAgICBzdHJpZGVZID0gc3RyaWRlWzFdXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBjaGVjay5yYWlzZSgnaW52YWxpZCBzaGFwZScpXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGR0eXBlID0gZHR5cGUgfHwgdHlwZWRBcnJheUNvZGUoZGF0YSkgfHwgR0xfRkxPQVRcbiAgICAgICAgICAgIGRpbWVuc2lvbiA9IHNoYXBlWVxuICAgICAgICAgICAgZGF0YSA9IHRyYW5zcG9zZShcbiAgICAgICAgICAgICAgbWFrZVR5cGVkQXJyYXkoZHR5cGUsIHNoYXBlWCAqIHNoYXBlWSksXG4gICAgICAgICAgICAgIGRhdGEuZGF0YSxcbiAgICAgICAgICAgICAgc2hhcGVYLCBzaGFwZVksXG4gICAgICAgICAgICAgIHN0cmlkZVgsIHN0cmlkZVksXG4gICAgICAgICAgICAgIG9mZnNldClcbiAgICAgICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoZGF0YSkpIHtcbiAgICAgICAgICAgIGlmIChkYXRhLmxlbmd0aCA+IDAgJiYgQXJyYXkuaXNBcnJheShkYXRhWzBdKSkge1xuICAgICAgICAgICAgICBkaW1lbnNpb24gPSBkYXRhWzBdLmxlbmd0aFxuICAgICAgICAgICAgICBkdHlwZSA9IGR0eXBlIHx8IEdMX0ZMT0FUXG4gICAgICAgICAgICAgIHZhciByZXN1bHQgPSBtYWtlVHlwZWRBcnJheShkdHlwZSwgZGF0YS5sZW5ndGggKiBkaW1lbnNpb24pXG4gICAgICAgICAgICAgIGRhdGEgPSBmbGF0dGVuKHJlc3VsdCwgZGF0YSwgZGltZW5zaW9uKVxuICAgICAgICAgICAgICBkYXRhID0gcmVzdWx0XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBkdHlwZSA9IGR0eXBlIHx8IEdMX0ZMT0FUXG4gICAgICAgICAgICAgIGRhdGEgPSBtYWtlVHlwZWRBcnJheShkdHlwZSwgZGF0YSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY2hlY2suaXNUeXBlZEFycmF5KGRhdGEsICdpbnZhbGlkIGRhdGEgdHlwZSBidWZmZXIgZGF0YScpXG4gICAgICAgICAgICBkdHlwZSA9IGR0eXBlIHx8IHR5cGVkQXJyYXlDb2RlKGRhdGEpXG4gICAgICAgICAgfVxuICAgICAgICAgIGJ5dGVMZW5ndGggPSBkYXRhLmJ5dGVMZW5ndGhcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICgnbGVuZ3RoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIGJ5dGVMZW5ndGggPSBvcHRpb25zLmxlbmd0aCB8IDBcbiAgICAgICAgY2hlY2subm5pKGJ5dGVMZW5ndGgsICdidWZmZXIgbGVuZ3RoIG11c3QgYmUgYSBub25uZWdhdGl2ZSBpbnRlZ2VyJylcbiAgICAgIH1cblxuICAgICAgYnVmZmVyLmRhdGEgPSBkYXRhXG4gICAgICBidWZmZXIuZHR5cGUgPSBkdHlwZSB8fCBHTF9VTlNJR05FRF9CWVRFXG4gICAgICBidWZmZXIuYnl0ZUxlbmd0aCA9IGJ5dGVMZW5ndGhcbiAgICAgIGJ1ZmZlci5kaW1lbnNpb24gPSBkaW1lbnNpb25cblxuICAgICAgcmVmcmVzaChidWZmZXIpXG5cbiAgICAgIHJldHVybiByZWdsQnVmZmVyXG4gICAgfVxuXG4gICAgaWYgKCFkZWZlckluaXQpIHtcbiAgICAgIHJlZ2xCdWZmZXIob3B0aW9ucylcbiAgICB9XG5cbiAgICByZWdsQnVmZmVyLl9yZWdsVHlwZSA9ICdidWZmZXInXG4gICAgcmVnbEJ1ZmZlci5fYnVmZmVyID0gYnVmZmVyXG4gICAgcmVnbEJ1ZmZlci5kZXN0cm95ID0gZnVuY3Rpb24gKCkgeyBkZXN0cm95KGJ1ZmZlcikgfVxuXG4gICAgcmV0dXJuIHJlZ2xCdWZmZXJcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY3JlYXRlOiBjcmVhdGVCdWZmZXIsXG5cbiAgICBjbGVhcjogZnVuY3Rpb24gKCkge1xuICAgICAgdmFsdWVzKGJ1ZmZlclNldCkuZm9yRWFjaChkZXN0cm95KVxuICAgIH0sXG5cbiAgICByZWZyZXNoOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YWx1ZXMoYnVmZmVyU2V0KS5mb3JFYWNoKHJlZnJlc2gpXG4gICAgfSxcblxuICAgIGdldEJ1ZmZlcjogZnVuY3Rpb24gKHdyYXBwZXIpIHtcbiAgICAgIGlmICh3cmFwcGVyICYmIHdyYXBwZXIuX2J1ZmZlciBpbnN0YW5jZW9mIFJFR0xCdWZmZXIpIHtcbiAgICAgICAgcmV0dXJuIHdyYXBwZXIuX2J1ZmZlclxuICAgICAgfVxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG4gIH1cbn1cbiIsIi8vIEVycm9yIGNoZWNraW5nIGFuZCBwYXJhbWV0ZXIgdmFsaWRhdGlvblxudmFyIGlzVHlwZWRBcnJheSA9IHJlcXVpcmUoJy4vaXMtdHlwZWQtYXJyYXknKVxuXG5mdW5jdGlvbiByYWlzZSAobWVzc2FnZSkge1xuICB2YXIgZXJyb3IgPSBuZXcgRXJyb3IoJyhyZWdsKSAnICsgbWVzc2FnZSlcbiAgY29uc29sZS5lcnJvcihlcnJvcilcbiAgdGhyb3cgZXJyb3Jcbn1cblxuZnVuY3Rpb24gY2hlY2sgKHByZWQsIG1lc3NhZ2UpIHtcbiAgaWYgKCFwcmVkKSB7XG4gICAgcmFpc2UobWVzc2FnZSlcbiAgfVxufVxuXG5mdW5jdGlvbiBlbmNvbG9uIChtZXNzYWdlKSB7XG4gIGlmIChtZXNzYWdlKSB7XG4gICAgcmV0dXJuICc6ICcgKyBtZXNzYWdlXG4gIH1cbiAgcmV0dXJuICcnXG59XG5cbmZ1bmN0aW9uIGNoZWNrUGFyYW1ldGVyIChwYXJhbSwgcG9zc2liaWxpdGllcywgbWVzc2FnZSkge1xuICBpZiAoIShwYXJhbSBpbiBwb3NzaWJpbGl0aWVzKSkge1xuICAgIHJhaXNlKCd1bmtub3duIHBhcmFtZXRlciAoJyArIHBhcmFtICsgJyknICsgZW5jb2xvbihtZXNzYWdlKSArXG4gICAgICAgICAgJy4gcG9zc2libGUgdmFsdWVzOiAnICsgT2JqZWN0LmtleXMocG9zc2liaWxpdGllcykuam9pbigpKVxuICB9XG59XG5cbmZ1bmN0aW9uIGNoZWNrSXNUeXBlZEFycmF5IChkYXRhLCBtZXNzYWdlKSB7XG4gIGlmICghaXNUeXBlZEFycmF5KGRhdGEpKSB7XG4gICAgcmFpc2UoXG4gICAgICAnaW52YWxpZCBwYXJhbWV0ZXIgdHlwZScgKyBlbmNvbG9uKG1lc3NhZ2UpICtcbiAgICAgICcuIG11c3QgYmUgYSB0eXBlZCBhcnJheScpXG4gIH1cbn1cblxuZnVuY3Rpb24gY2hlY2tUeXBlT2YgKHZhbHVlLCB0eXBlLCBtZXNzYWdlKSB7XG4gIGlmICh0eXBlb2YgdmFsdWUgIT09IHR5cGUpIHtcbiAgICByYWlzZShcbiAgICAgICdpbnZhbGlkIHBhcmFtZXRlciB0eXBlJyArIGVuY29sb24obWVzc2FnZSkgK1xuICAgICAgJy4gZXhwZWN0ZWQgJyArIHR5cGUgKyAnLCBnb3QgJyArICh0eXBlb2YgdmFsdWUpKVxuICB9XG59XG5cbmZ1bmN0aW9uIGNoZWNrTm9uTmVnYXRpdmVJbnQgKHZhbHVlLCBtZXNzYWdlKSB7XG4gIGlmICghKCh2YWx1ZSA+PSAwKSAmJlxuICAgICAgICAoKHZhbHVlIHwgMCkgPT09IHZhbHVlKSkpIHtcbiAgICByYWlzZSgnaW52YWxpZCBwYXJhbWV0ZXIgdHlwZSwgKCcgKyB2YWx1ZSArICcpJyArIGVuY29sb24obWVzc2FnZSkgK1xuICAgICAgICAgICcuIG11c3QgYmUgYSBub25uZWdhdGl2ZSBpbnRlZ2VyJylcbiAgfVxufVxuXG5mdW5jdGlvbiBjaGVja09uZU9mICh2YWx1ZSwgbGlzdCwgbWVzc2FnZSkge1xuICBpZiAobGlzdC5pbmRleE9mKHZhbHVlKSA8IDApIHtcbiAgICByYWlzZSgnaW52YWxpZCB2YWx1ZScgKyBlbmNvbG9uKG1lc3NhZ2UpICsgJy4gbXVzdCBiZSBvbmUgb2Y6ICcgKyBsaXN0KVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gT2JqZWN0LmFzc2lnbihjaGVjaywge1xuICByYWlzZTogcmFpc2UsXG4gIHBhcmFtZXRlcjogY2hlY2tQYXJhbWV0ZXIsXG4gIHR5cGU6IGNoZWNrVHlwZU9mLFxuICBpc1R5cGVkQXJyYXk6IGNoZWNrSXNUeXBlZEFycmF5LFxuICBubmk6IGNoZWNrTm9uTmVnYXRpdmVJbnQsXG4gIG9uZU9mOiBjaGVja09uZU9mXG59KVxuIiwiLyogZ2xvYmFscyBwZXJmb3JtYW5jZSAqL1xubW9kdWxlLmV4cG9ydHMgPVxuICAodHlwZW9mIHBlcmZvcm1hbmNlICE9PSAndW5kZWZpbmVkJyAmJiBwZXJmb3JtYW5jZS5ub3cpXG4gID8gZnVuY3Rpb24gKCkgeyByZXR1cm4gcGVyZm9ybWFuY2Uubm93KCkgfVxuICA6IGZ1bmN0aW9uICgpIHsgcmV0dXJuICsobmV3IERhdGUoKSkgfVxuIiwiZnVuY3Rpb24gc2xpY2UgKHgpIHtcbiAgcmV0dXJuIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKHgpXG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY3JlYXRlRW52aXJvbm1lbnQgKCkge1xuICAvLyBVbmlxdWUgdmFyaWFibGUgaWQgY291bnRlclxuICB2YXIgdmFyQ291bnRlciA9IDBcblxuICAvLyBMaW5rZWQgdmFsdWVzIGFyZSBwYXNzZWQgZnJvbSB0aGlzIHNjb3BlIGludG8gdGhlIGdlbmVyYXRlZCBjb2RlIGJsb2NrXG4gIC8vIENhbGxpbmcgbGluaygpIHBhc3NlcyBhIHZhbHVlIGludG8gdGhlIGdlbmVyYXRlZCBzY29wZSBhbmQgcmV0dXJuc1xuICAvLyB0aGUgdmFyaWFibGUgbmFtZSB3aGljaCBpdCBpcyBib3VuZCB0b1xuICB2YXIgbGlua2VkTmFtZXMgPSBbXVxuICB2YXIgbGlua2VkVmFsdWVzID0gW11cbiAgZnVuY3Rpb24gbGluayAodmFsdWUpIHtcbiAgICB2YXIgbmFtZSA9ICdnJyArICh2YXJDb3VudGVyKyspXG4gICAgbGlua2VkTmFtZXMucHVzaChuYW1lKVxuICAgIGxpbmtlZFZhbHVlcy5wdXNoKHZhbHVlKVxuICAgIHJldHVybiBuYW1lXG4gIH1cblxuICAvLyBjcmVhdGUgYSBjb2RlIGJsb2NrXG4gIGZ1bmN0aW9uIGJsb2NrICgpIHtcbiAgICB2YXIgY29kZSA9IFtdXG4gICAgZnVuY3Rpb24gcHVzaCAoKSB7XG4gICAgICBjb2RlLnB1c2guYXBwbHkoY29kZSwgc2xpY2UoYXJndW1lbnRzKSlcbiAgICB9XG5cbiAgICB2YXIgdmFycyA9IFtdXG4gICAgZnVuY3Rpb24gZGVmICgpIHtcbiAgICAgIHZhciBuYW1lID0gJ3YnICsgKHZhckNvdW50ZXIrKylcbiAgICAgIHZhcnMucHVzaChuYW1lKVxuXG4gICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29kZS5wdXNoKG5hbWUsICc9JylcbiAgICAgICAgY29kZS5wdXNoLmFwcGx5KGNvZGUsIHNsaWNlKGFyZ3VtZW50cykpXG4gICAgICAgIGNvZGUucHVzaCgnOycpXG4gICAgICB9XG5cbiAgICAgIHJldHVybiBuYW1lXG4gICAgfVxuXG4gICAgcmV0dXJuIE9iamVjdC5hc3NpZ24ocHVzaCwge1xuICAgICAgZGVmOiBkZWYsXG4gICAgICB0b1N0cmluZzogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICh2YXJzLmxlbmd0aCA+IDAgPyAndmFyICcgKyB2YXJzICsgJzsnIDogJycpLFxuICAgICAgICAgIGNvZGUuam9pbignJylcbiAgICAgICAgXS5qb2luKCcnKVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICAvLyBwcm9jZWR1cmUgbGlzdFxuICB2YXIgcHJvY2VkdXJlcyA9IHt9XG4gIGZ1bmN0aW9uIHByb2MgKG5hbWUpIHtcbiAgICB2YXIgYXJncyA9IFtdXG4gICAgZnVuY3Rpb24gYXJnICgpIHtcbiAgICAgIHZhciBuYW1lID0gJ2EnICsgKHZhckNvdW50ZXIrKylcbiAgICAgIGFyZ3MucHVzaChuYW1lKVxuICAgICAgcmV0dXJuIG5hbWVcbiAgICB9XG5cbiAgICB2YXIgYm9keSA9IGJsb2NrKClcbiAgICB2YXIgYm9keVRvU3RyaW5nID0gYm9keS50b1N0cmluZ1xuXG4gICAgdmFyIHJlc3VsdCA9IHByb2NlZHVyZXNbbmFtZV0gPSBPYmplY3QuYXNzaWduKGJvZHksIHtcbiAgICAgIGFyZzogYXJnLFxuICAgICAgdG9TdHJpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAnZnVuY3Rpb24oJywgYXJncy5qb2luKCksICcpeycsXG4gICAgICAgICAgYm9keVRvU3RyaW5nKCksXG4gICAgICAgICAgJ30nXG4gICAgICAgIF0uam9pbignJylcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG5cbiAgZnVuY3Rpb24gY29tcGlsZSAoKSB7XG4gICAgdmFyIGNvZGUgPSBbJ1widXNlIHN0cmljdFwiO3JldHVybiB7J11cbiAgICBPYmplY3Qua2V5cyhwcm9jZWR1cmVzKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICBjb2RlLnB1c2goJ1wiJywgbmFtZSwgJ1wiOicsIHByb2NlZHVyZXNbbmFtZV0udG9TdHJpbmcoKSwgJywnKVxuICAgIH0pXG4gICAgY29kZS5wdXNoKCd9JylcbiAgICB2YXIgcHJvYyA9IEZ1bmN0aW9uLmFwcGx5KG51bGwsIGxpbmtlZE5hbWVzLmNvbmNhdChbY29kZS5qb2luKCcnKV0pKVxuICAgIHJldHVybiBwcm9jLmFwcGx5KG51bGwsIGxpbmtlZFZhbHVlcylcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgbGluazogbGluayxcbiAgICBibG9jazogYmxvY2ssXG4gICAgcHJvYzogcHJvYyxcbiAgICBjb21waWxlOiBjb21waWxlXG4gIH1cbn1cbiIsInZhciBjaGVjayA9IHJlcXVpcmUoJy4vY2hlY2snKVxudmFyIGNyZWF0ZUVudmlyb25tZW50ID0gcmVxdWlyZSgnLi9jb2RlZ2VuJylcblxudmFyIHByaW1UeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL3ByaW1pdGl2ZXMuanNvbicpXG52YXIgZ2xUeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL2R0eXBlcy5qc29uJylcblxudmFyIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSID0gMzQ5NjNcblxudmFyIEdMX0ZMT0FUID0gNTEyNlxudmFyIEdMX0ZMT0FUX1ZFQzIgPSAzNTY2NFxudmFyIEdMX0ZMT0FUX1ZFQzMgPSAzNTY2NVxudmFyIEdMX0ZMT0FUX1ZFQzQgPSAzNTY2NlxudmFyIEdMX0lOVCA9IDUxMjRcbnZhciBHTF9JTlRfVkVDMiA9IDM1NjY3XG52YXIgR0xfSU5UX1ZFQzMgPSAzNTY2OFxudmFyIEdMX0lOVF9WRUM0ID0gMzU2NjlcbnZhciBHTF9CT09MID0gMzU2NzBcbnZhciBHTF9CT09MX1ZFQzIgPSAzNTY3MVxudmFyIEdMX0JPT0xfVkVDMyA9IDM1NjcyXG52YXIgR0xfQk9PTF9WRUM0ID0gMzU2NzNcbnZhciBHTF9GTE9BVF9NQVQyID0gMzU2NzRcbnZhciBHTF9GTE9BVF9NQVQzID0gMzU2NzVcbnZhciBHTF9GTE9BVF9NQVQ0ID0gMzU2NzZcbnZhciBHTF9TQU1QTEVSXzJEID0gMzU2NzhcbnZhciBHTF9TQU1QTEVSX0NVQkUgPSAzNTY4MFxuXG52YXIgR0xfVFJJQU5HTEVTID0gNFxuXG52YXIgR0xfQ1VMTF9GQUNFID0gMHgwQjQ0XG52YXIgR0xfQkxFTkQgPSAweDBCRTJcbnZhciBHTF9ESVRIRVIgPSAweDBCRDBcbnZhciBHTF9TVEVOQ0lMX1RFU1QgPSAweDBCOTBcbnZhciBHTF9ERVBUSF9URVNUID0gMHgwQjcxXG52YXIgR0xfU0NJU1NPUl9URVNUID0gMHgwQzExXG52YXIgR0xfUE9MWUdPTl9PRkZTRVRfRklMTCA9IDB4ODAzN1xudmFyIEdMX1NBTVBMRV9BTFBIQV9UT19DT1ZFUkFHRSA9IDB4ODA5RVxudmFyIEdMX1NBTVBMRV9DT1ZFUkFHRSA9IDB4ODBBMFxuXG52YXIgR0xfRlJPTlQgPSAxMDI4XG52YXIgR0xfQkFDSyA9IDEwMjlcblxudmFyIEdMX0NXID0gMHgwOTAwXG52YXIgR0xfQ0NXID0gMHgwOTAxXG5cbnZhciBHTF9NSU5fRVhUID0gMHg4MDA3XG52YXIgR0xfTUFYX0VYVCA9IDB4ODAwOFxuXG52YXIgYmxlbmRGdW5jcyA9IHtcbiAgJzAnOiAwLFxuICAnMSc6IDEsXG4gICd6ZXJvJzogMCxcbiAgJ29uZSc6IDEsXG4gICdzcmMgY29sb3InOiA3NjgsXG4gICdvbmUgbWludXMgc3JjIGNvbG9yJzogNzY5LFxuICAnc3JjIGFscGhhJzogNzcwLFxuICAnb25lIG1pbnVzIHNyYyBhbHBoYSc6IDc3MSxcbiAgJ2RzdCBjb2xvcic6IDc3NCxcbiAgJ29uZSBtaW51cyBkc3QgY29sb3InOiA3NzUsXG4gICdkc3QgYWxwaGEnOiA3NzIsXG4gICdvbmUgbWludXMgZHN0IGFscGhhJzogNzczLFxuICAnY29uc3RhbnQgY29sb3InOiAzMjc2OSxcbiAgJ29uZSBtaW51cyBjb25zdGFudCBjb2xvcic6IDMyNzcwLFxuICAnY29uc3RhbnQgYWxwaGEnOiAzMjc3MSxcbiAgJ29uZSBtaW51cyBjb25zdGFudCBhbHBoYSc6IDMyNzcyLFxuICAnc3JjIGFscGhhIHNhdHVyYXRlJzogNzc2XG59XG5cbnZhciBjb21wYXJlRnVuY3MgPSB7XG4gICduZXZlcic6IDUxMixcbiAgJ2xlc3MnOiA1MTMsXG4gICc8JzogNTEzLFxuICAnZXF1YWwnOiA1MTQsXG4gICc9JzogNTE0LFxuICAnPT0nOiA1MTQsXG4gICc9PT0nOiA1MTQsXG4gICdsZXF1YWwnOiA1MTUsXG4gICc8PSc6IDUxNSxcbiAgJ2dyZWF0ZXInOiA1MTYsXG4gICc+JzogNTE2LFxuICAnbm90ZXF1YWwnOiA1MTcsXG4gICchPSc6IDUxNyxcbiAgJyE9PSc6IDUxNyxcbiAgJ2dlcXVhbCc6IDUxOCxcbiAgJz49JzogNTE4LFxuICAnYWx3YXlzJzogNTE5XG59XG5cbnZhciBzdGVuY2lsT3BzID0ge1xuICAnMCc6IDAsXG4gICd6ZXJvJzogMCxcbiAgJ2tlZXAnOiA3NjgwLFxuICAncmVwbGFjZSc6IDc2ODEsXG4gICdpbmNyZW1lbnQnOiA3NjgyLFxuICAnZGVjcmVtZW50JzogNzY4MyxcbiAgJ2luY3JlbWVudCB3cmFwJzogMzQwNTUsXG4gICdkZWNyZW1lbnQgd3JhcCc6IDM0MDU2LFxuICAnaW52ZXJ0JzogNTM4NlxufVxuXG5mdW5jdGlvbiB0eXBlTGVuZ3RoICh4KSB7XG4gIHN3aXRjaCAoeCkge1xuICAgIGNhc2UgR0xfRkxPQVRfVkVDMjpcbiAgICBjYXNlIEdMX0lOVF9WRUMyOlxuICAgIGNhc2UgR0xfQk9PTF9WRUMyOlxuICAgICAgcmV0dXJuIDJcbiAgICBjYXNlIEdMX0ZMT0FUX1ZFQzM6XG4gICAgY2FzZSBHTF9JTlRfVkVDMzpcbiAgICBjYXNlIEdMX0JPT0xfVkVDMzpcbiAgICAgIHJldHVybiAzXG4gICAgY2FzZSBHTF9GTE9BVF9WRUM0OlxuICAgIGNhc2UgR0xfSU5UX1ZFQzQ6XG4gICAgY2FzZSBHTF9CT09MX1ZFQzQ6XG4gICAgICByZXR1cm4gNFxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gMVxuICB9XG59XG5cbmZ1bmN0aW9uIHNldFVuaWZvcm1TdHJpbmcgKGdsLCB0eXBlLCBsb2NhdGlvbiwgdmFsdWUpIHtcbiAgdmFyIGluZml4XG4gIHZhciBzZXBhcmF0b3IgPSAnLCdcbiAgc3dpdGNoICh0eXBlKSB7XG4gICAgY2FzZSBHTF9GTE9BVDpcbiAgICAgIGluZml4ID0gJzFmJ1xuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX0ZMT0FUX1ZFQzI6XG4gICAgICBpbmZpeCA9ICcyZnYnXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfRkxPQVRfVkVDMzpcbiAgICAgIGluZml4ID0gJzNmdidcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9GTE9BVF9WRUM0OlxuICAgICAgaW5maXggPSAnNGZ2J1xuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX0JPT0w6XG4gICAgY2FzZSBHTF9JTlQ6XG4gICAgICBpbmZpeCA9ICcxaSdcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9CT09MX1ZFQzI6XG4gICAgY2FzZSBHTF9JTlRfVkVDMjpcbiAgICAgIGluZml4ID0gJzJpdidcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9CT09MX1ZFQzM6XG4gICAgY2FzZSBHTF9JTlRfVkVDMzpcbiAgICAgIGluZml4ID0gJzNpdidcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9CT09MX1ZFQzQ6XG4gICAgY2FzZSBHTF9JTlRfVkVDNDpcbiAgICAgIGluZml4ID0gJzRpdidcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9GTE9BVF9NQVQyOlxuICAgICAgaW5maXggPSAnTWF0cml4MmZ2J1xuICAgICAgc2VwYXJhdG9yID0gJyxmYWxzZSwnXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfRkxPQVRfTUFUMzpcbiAgICAgIGluZml4ID0gJ01hdHJpeDNmdidcbiAgICAgIHNlcGFyYXRvciA9ICcsZmFsc2UsJ1xuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX0ZMT0FUX01BVDQ6XG4gICAgICBpbmZpeCA9ICdNYXRyaXg0ZnYnXG4gICAgICBzZXBhcmF0b3IgPSAnLGZhbHNlLCdcbiAgICAgIGJyZWFrXG4gICAgZGVmYXVsdDpcbiAgICAgIGNoZWNrLnJhaXNlKCd1bnN1cHBvcnRlZCB1bmlmb3JtIHR5cGUnKVxuICB9XG4gIHJldHVybiBnbCArICcudW5pZm9ybScgKyBpbmZpeCArICcoJyArIGxvY2F0aW9uICsgc2VwYXJhdG9yICsgdmFsdWUgKyAnKTsnXG59XG5cbmZ1bmN0aW9uIHN0YWNrVG9wICh4KSB7XG4gIHJldHVybiB4ICsgJ1snICsgeCArICcubGVuZ3RoLTFdJ1xufVxuXG4vLyBOZWVkIHRvIHByb2Nlc3MgZnJhbWVidWZmZXIgZmlyc3QgaW4gb3B0aW9ucyBsaXN0XG5mdW5jdGlvbiBvcHRpb25Qcmlvcml0eSAoYSwgYikge1xuICBpZiAoYSA9PT0gJ2ZyYW1lYnVmZmVyJykge1xuICAgIHJldHVybiAtMVxuICB9XG4gIGlmIChhIDwgYikge1xuICAgIHJldHVybiAtMVxuICB9IGVsc2UgaWYgKGEgPiBiKSB7XG4gICAgcmV0dXJuIDFcbiAgfVxuICByZXR1cm4gMFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHJlZ2xDb21waWxlciAoXG4gIGdsLFxuICBleHRlbnNpb25zLFxuICBsaW1pdHMsXG4gIGJ1ZmZlclN0YXRlLFxuICBlbGVtZW50U3RhdGUsXG4gIHRleHR1cmVTdGF0ZSxcbiAgZnJhbWVidWZmZXJTdGF0ZSxcbiAgZ2xTdGF0ZSxcbiAgdW5pZm9ybVN0YXRlLFxuICBhdHRyaWJ1dGVTdGF0ZSxcbiAgc2hhZGVyU3RhdGUsXG4gIGRyYXdTdGF0ZSxcbiAgZnJhbWVTdGF0ZSxcbiAgcmVnbFBvbGwpIHtcbiAgdmFyIGNvbnRleHRTdGF0ZSA9IGdsU3RhdGUuY29udGV4dFN0YXRlXG5cbiAgdmFyIGJsZW5kRXF1YXRpb25zID0ge1xuICAgICdhZGQnOiAzMjc3NCxcbiAgICAnc3VidHJhY3QnOiAzMjc3OCxcbiAgICAncmV2ZXJzZSBzdWJ0cmFjdCc6IDMyNzc5XG4gIH1cbiAgaWYgKGV4dGVuc2lvbnMuZXh0X2JsZW5kX21pbm1heCkge1xuICAgIGJsZW5kRXF1YXRpb25zLm1pbiA9IEdMX01JTl9FWFRcbiAgICBibGVuZEVxdWF0aW9ucy5tYXggPSBHTF9NQVhfRVhUXG4gIH1cblxuICB2YXIgZHJhd0NhbGxDb3VudGVyID0gMFxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gU0hBREVSIFNJTkdMRSBEUkFXIE9QRVJBVElPTlxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIGNvbXBpbGVTaGFkZXJEcmF3IChwcm9ncmFtKSB7XG4gICAgdmFyIGVudiA9IGNyZWF0ZUVudmlyb25tZW50KClcbiAgICB2YXIgbGluayA9IGVudi5saW5rXG4gICAgdmFyIGRyYXcgPSBlbnYucHJvYygnZHJhdycpXG4gICAgdmFyIGRlZiA9IGRyYXcuZGVmXG5cbiAgICB2YXIgR0wgPSBsaW5rKGdsKVxuICAgIHZhciBQUk9HUkFNID0gbGluayhwcm9ncmFtLnByb2dyYW0pXG4gICAgdmFyIEJJTkRfQVRUUklCVVRFID0gbGluayhhdHRyaWJ1dGVTdGF0ZS5iaW5kKVxuICAgIHZhciBEUkFXX1NUQVRFID0ge1xuICAgICAgY291bnQ6IGxpbmsoZHJhd1N0YXRlLmNvdW50KSxcbiAgICAgIG9mZnNldDogbGluayhkcmF3U3RhdGUub2Zmc2V0KSxcbiAgICAgIGluc3RhbmNlczogbGluayhkcmF3U3RhdGUuaW5zdGFuY2VzKSxcbiAgICAgIHByaW1pdGl2ZTogbGluayhkcmF3U3RhdGUucHJpbWl0aXZlKVxuICAgIH1cbiAgICB2YXIgRUxFTUVOVF9TVEFURSA9IGxpbmsoZWxlbWVudFN0YXRlLmVsZW1lbnRzKVxuICAgIHZhciBURVhUVVJFX1VOSUZPUk1TID0gW11cblxuICAgIC8vIGJpbmQgdGhlIHByb2dyYW1cbiAgICBkcmF3KEdMLCAnLnVzZVByb2dyYW0oJywgUFJPR1JBTSwgJyk7JylcblxuICAgIC8vIHNldCB1cCBhdHRyaWJ1dGUgc3RhdGVcbiAgICBwcm9ncmFtLmF0dHJpYnV0ZXMuZm9yRWFjaChmdW5jdGlvbiAoYXR0cmlidXRlKSB7XG4gICAgICB2YXIgU1RBQ0sgPSBsaW5rKGF0dHJpYnV0ZVN0YXRlLmF0dHJpYnV0ZXNbYXR0cmlidXRlLm5hbWVdKVxuICAgICAgZHJhdyhCSU5EX0FUVFJJQlVURSwgJygnLFxuICAgICAgICBhdHRyaWJ1dGUubG9jYXRpb24sICcsJyxcbiAgICAgICAgbGluayhhdHRyaWJ1dGVTdGF0ZS5iaW5kaW5nc1thdHRyaWJ1dGUubG9jYXRpb25dKSwgJywnLFxuICAgICAgICBTVEFDSywgJy5yZWNvcmRzWycsIFNUQUNLLCAnLnRvcF0nLCAnLCcsXG4gICAgICAgIHR5cGVMZW5ndGgoYXR0cmlidXRlLmluZm8udHlwZSksICcpOycpXG4gICAgfSlcblxuICAgIC8vIHNldCB1cCB1bmlmb3Jtc1xuICAgIHByb2dyYW0udW5pZm9ybXMuZm9yRWFjaChmdW5jdGlvbiAodW5pZm9ybSkge1xuICAgICAgdmFyIExPQ0FUSU9OID0gbGluayh1bmlmb3JtLmxvY2F0aW9uKVxuICAgICAgdmFyIFNUQUNLID0gbGluayh1bmlmb3JtU3RhdGUudW5pZm9ybXNbdW5pZm9ybS5uYW1lXSlcbiAgICAgIHZhciBUT1AgPSBTVEFDSyArICdbJyArIFNUQUNLICsgJy5sZW5ndGgtMV0nXG4gICAgICBpZiAodW5pZm9ybS5pbmZvLnR5cGUgPT09IEdMX1NBTVBMRVJfMkQgfHxcbiAgICAgICAgdW5pZm9ybS5pbmZvLnR5cGUgPT09IEdMX1NBTVBMRVJfQ1VCRSkge1xuICAgICAgICB2YXIgVEVYX1ZBTFVFID0gZGVmKFRPUCArICcuX3RleHR1cmUnKVxuICAgICAgICBURVhUVVJFX1VOSUZPUk1TLnB1c2goVEVYX1ZBTFVFKVxuICAgICAgICBkcmF3KHNldFVuaWZvcm1TdHJpbmcoR0wsIEdMX0lOVCwgTE9DQVRJT04sIFRFWF9WQUxVRSArICcuYmluZCgpJykpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkcmF3KHNldFVuaWZvcm1TdHJpbmcoR0wsIHVuaWZvcm0uaW5mby50eXBlLCBMT0NBVElPTiwgVE9QKSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8gdW5iaW5kIHRleHR1cmVzIGltbWVkaWF0ZWx5XG4gICAgVEVYVFVSRV9VTklGT1JNUy5mb3JFYWNoKGZ1bmN0aW9uIChURVhfVkFMVUUpIHtcbiAgICAgIGRyYXcoVEVYX1ZBTFVFLCAnLnVuYmluZCgpOycpXG4gICAgfSlcblxuICAgIC8vIEV4ZWN1dGUgZHJhdyBjb21tYW5kXG4gICAgdmFyIENVUl9QUklNSVRJVkUgPSBkZWYoc3RhY2tUb3AoRFJBV19TVEFURS5wcmltaXRpdmUpKVxuICAgIHZhciBDVVJfQ09VTlQgPSBkZWYoc3RhY2tUb3AoRFJBV19TVEFURS5jb3VudCkpXG4gICAgdmFyIENVUl9PRkZTRVQgPSBkZWYoc3RhY2tUb3AoRFJBV19TVEFURS5vZmZzZXQpKVxuICAgIHZhciBDVVJfRUxFTUVOVFMgPSBkZWYoc3RhY2tUb3AoRUxFTUVOVF9TVEFURSkpXG5cbiAgICAvLyBPbmx5IGV4ZWN1dGUgZHJhdyBjb21tYW5kIGlmIG51bWJlciBlbGVtZW50cyBpcyA+IDBcbiAgICBkcmF3KCdpZignLCBDVVJfQ09VTlQsICcpeycpXG5cbiAgICB2YXIgaW5zdGFuY2luZyA9IGV4dGVuc2lvbnMuYW5nbGVfaW5zdGFuY2VkX2FycmF5c1xuICAgIGlmIChpbnN0YW5jaW5nKSB7XG4gICAgICB2YXIgQ1VSX0lOU1RBTkNFUyA9IGRlZihzdGFja1RvcChEUkFXX1NUQVRFLmluc3RhbmNlcykpXG4gICAgICB2YXIgSU5TVEFOQ0VfRVhUID0gbGluayhpbnN0YW5jaW5nKVxuICAgICAgZHJhdyhcbiAgICAgICAgJ2lmKCcsIENVUl9FTEVNRU5UUywgJyl7JyxcbiAgICAgICAgQ1VSX0VMRU1FTlRTLCAnLmJpbmQoKTsnLFxuICAgICAgICAnaWYoJywgQ1VSX0lOU1RBTkNFUywgJz4wKXsnLFxuICAgICAgICBJTlNUQU5DRV9FWFQsICcuZHJhd0VsZW1lbnRzSW5zdGFuY2VkQU5HTEUoJyxcbiAgICAgICAgQ1VSX1BSSU1JVElWRSwgJywnLFxuICAgICAgICBDVVJfQ09VTlQsICcsJyxcbiAgICAgICAgQ1VSX0VMRU1FTlRTLCAnLnR5cGUsJyxcbiAgICAgICAgQ1VSX09GRlNFVCwgJywnLFxuICAgICAgICBDVVJfSU5TVEFOQ0VTLCAnKTt9ZWxzZXsnLFxuICAgICAgICBHTCwgJy5kcmF3RWxlbWVudHMoJyxcbiAgICAgICAgQ1VSX1BSSU1JVElWRSwgJywnLFxuICAgICAgICBDVVJfQ09VTlQsICcsJyxcbiAgICAgICAgQ1VSX0VMRU1FTlRTLCAnLnR5cGUsJyxcbiAgICAgICAgQ1VSX09GRlNFVCwgJyk7fScsXG4gICAgICAgICd9ZWxzZSBpZignLCBDVVJfSU5TVEFOQ0VTLCAnPjApeycsXG4gICAgICAgIElOU1RBTkNFX0VYVCwgJy5kcmF3QXJyYXlzSW5zdGFuY2VkQU5HTEUoJyxcbiAgICAgICAgQ1VSX1BSSU1JVElWRSwgJywnLFxuICAgICAgICBDVVJfT0ZGU0VULCAnLCcsXG4gICAgICAgIENVUl9DT1VOVCwgJywnLFxuICAgICAgICBDVVJfSU5TVEFOQ0VTLCAnKTt9ZWxzZXsnLFxuICAgICAgICBHTCwgJy5kcmF3QXJyYXlzKCcsXG4gICAgICAgIENVUl9QUklNSVRJVkUsICcsJyxcbiAgICAgICAgQ1VSX09GRlNFVCwgJywnLFxuICAgICAgICBDVVJfQ09VTlQsICcpO319JylcbiAgICB9IGVsc2Uge1xuICAgICAgZHJhdyhcbiAgICAgICAgJ2lmKCcsIENVUl9FTEVNRU5UUywgJyl7JyxcbiAgICAgICAgR0wsICcuZHJhd0VsZW1lbnRzKCcsXG4gICAgICAgIENVUl9QUklNSVRJVkUsICcsJyxcbiAgICAgICAgQ1VSX0NPVU5ULCAnLCcsXG4gICAgICAgIENVUl9FTEVNRU5UUywgJy50eXBlLCcsXG4gICAgICAgIENVUl9PRkZTRVQsICcpO30nLFxuICAgICAgICAnfWVsc2V7JyxcbiAgICAgICAgR0wsICcuZHJhd0FycmF5cygnLFxuICAgICAgICBDVVJfUFJJTUlUSVZFLCAnLCcsXG4gICAgICAgIENVUl9PRkZTRVQsICcsJyxcbiAgICAgICAgQ1VSX0NPVU5ULCAnKTt9JylcbiAgICB9XG5cbiAgICByZXR1cm4gZW52LmNvbXBpbGUoKS5kcmF3XG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIEJBVENIIERSQVcgT1BFUkFUSU9OXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgZnVuY3Rpb24gY29tcGlsZUJhdGNoIChcbiAgICBwcm9ncmFtLCBvcHRpb25zLCB1bmlmb3JtcywgYXR0cmlidXRlcywgc3RhdGljT3B0aW9ucykge1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBjb2RlIGdlbmVyYXRpb24gaGVscGVyc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICB2YXIgZW52ID0gY3JlYXRlRW52aXJvbm1lbnQoKVxuICAgIHZhciBsaW5rID0gZW52LmxpbmtcbiAgICB2YXIgYmF0Y2ggPSBlbnYucHJvYygnYmF0Y2gnKVxuICAgIHZhciBleGl0ID0gZW52LmJsb2NrKClcbiAgICB2YXIgZGVmID0gYmF0Y2guZGVmXG4gICAgdmFyIGFyZyA9IGJhdGNoLmFyZ1xuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHJlZ2wgc3RhdGVcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgdmFyIEdMID0gbGluayhnbClcbiAgICB2YXIgUFJPR1JBTSA9IGxpbmsocHJvZ3JhbS5wcm9ncmFtKVxuICAgIHZhciBCSU5EX0FUVFJJQlVURSA9IGxpbmsoYXR0cmlidXRlU3RhdGUuYmluZClcbiAgICB2YXIgRlJBTUVfU1RBVEUgPSBsaW5rKGZyYW1lU3RhdGUpXG4gICAgdmFyIEZSQU1FQlVGRkVSX1NUQVRFID0gbGluayhmcmFtZWJ1ZmZlclN0YXRlKVxuICAgIHZhciBEUkFXX1NUQVRFID0ge1xuICAgICAgY291bnQ6IGxpbmsoZHJhd1N0YXRlLmNvdW50KSxcbiAgICAgIG9mZnNldDogbGluayhkcmF3U3RhdGUub2Zmc2V0KSxcbiAgICAgIGluc3RhbmNlczogbGluayhkcmF3U3RhdGUuaW5zdGFuY2VzKSxcbiAgICAgIHByaW1pdGl2ZTogbGluayhkcmF3U3RhdGUucHJpbWl0aXZlKVxuICAgIH1cbiAgICB2YXIgQ09OVEVYVF9TVEFURSA9IHt9XG4gICAgdmFyIEVMRU1FTlRTID0gbGluayhlbGVtZW50U3RhdGUuZWxlbWVudHMpXG4gICAgdmFyIENVUl9DT1VOVCA9IGRlZihzdGFja1RvcChEUkFXX1NUQVRFLmNvdW50KSlcbiAgICB2YXIgQ1VSX09GRlNFVCA9IGRlZihzdGFja1RvcChEUkFXX1NUQVRFLm9mZnNldCkpXG4gICAgdmFyIENVUl9QUklNSVRJVkUgPSBkZWYoc3RhY2tUb3AoRFJBV19TVEFURS5wcmltaXRpdmUpKVxuICAgIHZhciBDVVJfRUxFTUVOVFMgPSBkZWYoc3RhY2tUb3AoRUxFTUVOVFMpKVxuICAgIHZhciBDVVJfSU5TVEFOQ0VTXG4gICAgdmFyIElOU1RBTkNFX0VYVFxuICAgIHZhciBpbnN0YW5jaW5nID0gZXh0ZW5zaW9ucy5hbmdsZV9pbnN0YW5jZWRfYXJyYXlzXG4gICAgaWYgKGluc3RhbmNpbmcpIHtcbiAgICAgIENVUl9JTlNUQU5DRVMgPSBkZWYoc3RhY2tUb3AoRFJBV19TVEFURS5pbnN0YW5jZXMpKVxuICAgICAgSU5TVEFOQ0VfRVhUID0gbGluayhpbnN0YW5jaW5nKVxuICAgIH1cbiAgICB2YXIgaGFzRHluYW1pY0VsZW1lbnRzID0gJ2VsZW1lbnRzJyBpbiBvcHRpb25zXG5cbiAgICBmdW5jdGlvbiBsaW5rQ29udGV4dCAoeCkge1xuICAgICAgdmFyIHJlc3VsdCA9IENPTlRFWFRfU1RBVEVbeF1cbiAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgfVxuICAgICAgcmVzdWx0ID0gQ09OVEVYVF9TVEFURVt4XSA9IGxpbmsoY29udGV4dFN0YXRlW3hdKVxuICAgICAgcmV0dXJuIHJlc3VsdFxuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBiYXRjaC9hcmd1bWVudCB2YXJzXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHZhciBOVU1fQVJHUyA9IGFyZygpXG4gICAgdmFyIEFSR1MgPSBhcmcoKVxuICAgIHZhciBBUkcgPSBkZWYoKVxuICAgIHZhciBCQVRDSF9JRCA9IGRlZigpXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gbG9hZCBhIGR5bmFtaWMgdmFyaWFibGVcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgdmFyIGR5bmFtaWNWYXJzID0ge31cbiAgICBmdW5jdGlvbiBkeW4gKHgpIHtcbiAgICAgIHZhciBpZCA9IHguaWRcbiAgICAgIHZhciByZXN1bHQgPSBkeW5hbWljVmFyc1tpZF1cbiAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgfVxuICAgICAgaWYgKHguZnVuYykge1xuICAgICAgICByZXN1bHQgPSBiYXRjaC5kZWYoXG4gICAgICAgICAgbGluayh4LmRhdGEpLCAnKCcsIEFSRywgJywnLCBCQVRDSF9JRCwgJywnLCBGUkFNRV9TVEFURSwgJyknKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzdWx0ID0gYmF0Y2guZGVmKEFSRywgJy4nLCB4LmRhdGEpXG4gICAgICB9XG4gICAgICBkeW5hbWljVmFyc1tpZF0gPSByZXN1bHRcbiAgICAgIHJldHVybiByZXN1bHRcbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gcmV0cmlldmVzIHRoZSBmaXJzdCBuYW1lLW1hdGNoaW5nIHJlY29yZCBmcm9tIGFuIEFjdGl2ZUluZm8gbGlzdFxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBmdW5jdGlvbiBmaW5kSW5mbyAobGlzdCwgbmFtZSkge1xuICAgICAgcmV0dXJuIGxpc3QuZmluZChmdW5jdGlvbiAoaXRlbSkge1xuICAgICAgICByZXR1cm4gaXRlbS5uYW1lID09PSBuYW1lXG4gICAgICB9KVxuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBiaW5kIHNoYWRlclxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBiYXRjaChHTCwgJy51c2VQcm9ncmFtKCcsIFBST0dSQU0sICcpOycpXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gc2V0IHN0YXRpYyB1bmlmb3Jtc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBwcm9ncmFtLnVuaWZvcm1zLmZvckVhY2goZnVuY3Rpb24gKHVuaWZvcm0pIHtcbiAgICAgIGlmICh1bmlmb3JtLm5hbWUgaW4gdW5pZm9ybXMpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICB2YXIgTE9DQVRJT04gPSBsaW5rKHVuaWZvcm0ubG9jYXRpb24pXG4gICAgICB2YXIgU1RBQ0sgPSBsaW5rKHVuaWZvcm1TdGF0ZS51bmlmb3Jtc1t1bmlmb3JtLm5hbWVdKVxuICAgICAgdmFyIFRPUCA9IFNUQUNLICsgJ1snICsgU1RBQ0sgKyAnLmxlbmd0aC0xXSdcbiAgICAgIGlmICh1bmlmb3JtLmluZm8udHlwZSA9PT0gR0xfU0FNUExFUl8yRCB8fFxuICAgICAgICB1bmlmb3JtLmluZm8udHlwZSA9PT0gR0xfU0FNUExFUl9DVUJFKSB7XG4gICAgICAgIHZhciBURVhfVkFMVUUgPSBkZWYoVE9QICsgJy5fdGV4dHVyZScpXG4gICAgICAgIGJhdGNoKHNldFVuaWZvcm1TdHJpbmcoR0wsIEdMX0lOVCwgTE9DQVRJT04sIFRFWF9WQUxVRSArICcuYmluZCgpJykpXG4gICAgICAgIGV4aXQoVEVYX1ZBTFVFLCAnLnVuYmluZCgpOycpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBiYXRjaChzZXRVbmlmb3JtU3RyaW5nKEdMLCB1bmlmb3JtLmluZm8udHlwZSwgTE9DQVRJT04sIFRPUCkpXG4gICAgICB9XG4gICAgfSlcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBzZXQgc3RhdGljIGF0dHJpYnV0ZXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgcHJvZ3JhbS5hdHRyaWJ1dGVzLmZvckVhY2goZnVuY3Rpb24gKGF0dHJpYnV0ZSkge1xuICAgICAgaWYgKGF0dHJpYnV0ZXMubmFtZSBpbiBhdHRyaWJ1dGVzKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgdmFyIFNUQUNLID0gbGluayhhdHRyaWJ1dGVTdGF0ZS5hdHRyaWJ1dGVzW2F0dHJpYnV0ZS5uYW1lXSlcbiAgICAgIGJhdGNoKEJJTkRfQVRUUklCVVRFLCAnKCcsXG4gICAgICAgIGF0dHJpYnV0ZS5sb2NhdGlvbiwgJywnLFxuICAgICAgICBsaW5rKGF0dHJpYnV0ZVN0YXRlLmJpbmRpbmdzW2F0dHJpYnV0ZS5sb2NhdGlvbl0pLCAnLCcsXG4gICAgICAgIFNUQUNLLCAnLnJlY29yZHNbJywgU1RBQ0ssICcudG9wXScsICcsJyxcbiAgICAgICAgdHlwZUxlbmd0aChhdHRyaWJ1dGUuaW5mby50eXBlKSwgJyk7JylcbiAgICB9KVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHNldCBzdGF0aWMgZWxlbWVudCBidWZmZXJcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgaWYgKCFoYXNEeW5hbWljRWxlbWVudHMpIHtcbiAgICAgIGJhdGNoKFxuICAgICAgICAnaWYoJywgQ1VSX0VMRU1FTlRTLCAnKXsnLFxuICAgICAgICBHTCwgJy5iaW5kQnVmZmVyKCcsIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSLCAnLCcsIENVUl9FTEVNRU5UUywgJy5idWZmZXIuYnVmZmVyKTsnLFxuICAgICAgICAnfWVsc2V7JyxcbiAgICAgICAgR0wsICcuYmluZEJ1ZmZlcignLCBHTF9FTEVNRU5UX0FSUkFZX0JVRkZFUiwgJyxudWxsKTsnLFxuICAgICAgICAnfScpXG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGxvb3Agb3ZlciBhbGwgYXJndW1lbnRzXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIGJhdGNoKFxuICAgICAgJ2ZvcignLCBCQVRDSF9JRCwgJz0wOycsIEJBVENIX0lELCAnPCcsIE5VTV9BUkdTLCAnOysrJywgQkFUQ0hfSUQsICcpeycsXG4gICAgICBBUkcsICc9JywgQVJHUywgJ1snLCBCQVRDSF9JRCwgJ107JylcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBzZXQgZHluYW1pYyBmbGFnc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBPYmplY3Qua2V5cyhvcHRpb25zKS5zb3J0KG9wdGlvblByaW9yaXR5KS5mb3JFYWNoKGZ1bmN0aW9uIChvcHRpb24pIHtcbiAgICAgIHZhciBWQUxVRSA9IGR5bihvcHRpb25zW29wdGlvbl0pXG5cbiAgICAgIGZ1bmN0aW9uIHNldENhcCAoZmxhZykge1xuICAgICAgICBiYXRjaChcbiAgICAgICAgICAnaWYoJywgVkFMVUUsICcpeycsXG4gICAgICAgICAgR0wsICcuZW5hYmxlKCcsIGZsYWcsICcpO31lbHNleycsXG4gICAgICAgICAgR0wsICcuZGlzYWJsZSgnLCBmbGFnLCAnKTt9JylcbiAgICAgIH1cblxuICAgICAgc3dpdGNoIChvcHRpb24pIHtcbiAgICAgICAgY2FzZSAnZnJhbWVidWZmZXInOlxuICAgICAgICAgIHZhciBWSUVXUE9SVF9TVEFURSA9IGxpbmtDb250ZXh0KCd2aWV3cG9ydCcpXG4gICAgICAgICAgdmFyIFNDSVNTT1JfU1RBVEUgPSBsaW5rQ29udGV4dCgnc2Npc3Nvci5ib3gnKVxuICAgICAgICAgIGJhdGNoKFxuICAgICAgICAgICAgJ2lmKCcsIEZSQU1FQlVGRkVSX1NUQVRFLCAnLnB1c2goJyxcbiAgICAgICAgICAgIFZBTFVFLCAnJiYnLCBWQUxVRSwgJy5fZnJhbWVidWZmZXIpKXsnLFxuICAgICAgICAgICAgRlJBTUVCVUZGRVJfU1RBVEUsICcucG9sbCgpOycsXG4gICAgICAgICAgICBWSUVXUE9SVF9TVEFURSwgJy5zZXREaXJ0eSgpOycsXG4gICAgICAgICAgICBTQ0lTU09SX1NUQVRFLCAnLnNldERpcnR5KCk7JyxcbiAgICAgICAgICAgICd9JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIC8vIENhcHNcbiAgICAgICAgY2FzZSAnY3VsbC5lbmFibGUnOlxuICAgICAgICAgIHNldENhcChHTF9DVUxMX0ZBQ0UpXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSAnYmxlbmQuZW5hYmxlJzpcbiAgICAgICAgICBzZXRDYXAoR0xfQkxFTkQpXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSAnZGl0aGVyJzpcbiAgICAgICAgICBzZXRDYXAoR0xfRElUSEVSKVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgJ3N0ZW5jaWwuZW5hYmxlJzpcbiAgICAgICAgICBzZXRDYXAoR0xfU1RFTkNJTF9URVNUKVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgJ2RlcHRoLmVuYWJsZSc6XG4gICAgICAgICAgc2V0Q2FwKEdMX0RFUFRIX1RFU1QpXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSAnc2Npc3Nvci5lbmFibGUnOlxuICAgICAgICAgIHNldENhcChHTF9TQ0lTU09SX1RFU1QpXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSAncG9seWdvbk9mZnNldC5lbmFibGUnOlxuICAgICAgICAgIHNldENhcChHTF9QT0xZR09OX09GRlNFVF9GSUxMKVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgJ3NhbXBsZS5hbHBoYSc6XG4gICAgICAgICAgc2V0Q2FwKEdMX1NBTVBMRV9BTFBIQV9UT19DT1ZFUkFHRSlcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlICdzYW1wbGUuZW5hYmxlJzpcbiAgICAgICAgICBzZXRDYXAoR0xfU0FNUExFX0NPVkVSQUdFKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnZGVwdGgubWFzayc6XG4gICAgICAgICAgYmF0Y2goR0wsICcuZGVwdGhNYXNrKCcsIFZBTFVFLCAnKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnZGVwdGguZnVuYyc6XG4gICAgICAgICAgdmFyIERFUFRIX0ZVTkNTID0gbGluayhjb21wYXJlRnVuY3MpXG4gICAgICAgICAgYmF0Y2goR0wsICcuZGVwdGhGdW5jKCcsIERFUFRIX0ZVTkNTLCAnWycsIFZBTFVFLCAnXSk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2RlcHRoLnJhbmdlJzpcbiAgICAgICAgICBiYXRjaChHTCwgJy5kZXB0aFJhbmdlKCcsIFZBTFVFLCAnWzBdLCcsIFZBTFVFLCAnWzFdKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnYmxlbmQuY29sb3InOlxuICAgICAgICAgIGJhdGNoKEdMLCAnLmJsZW5kQ29sb3IoJyxcbiAgICAgICAgICAgIFZBTFVFLCAnWzBdLCcsXG4gICAgICAgICAgICBWQUxVRSwgJ1sxXSwnLFxuICAgICAgICAgICAgVkFMVUUsICdbMl0sJyxcbiAgICAgICAgICAgIFZBTFVFLCAnWzNdKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnYmxlbmQuZXF1YXRpb24nOlxuICAgICAgICAgIHZhciBCTEVORF9FUVVBVElPTlMgPSBsaW5rKGJsZW5kRXF1YXRpb25zKVxuICAgICAgICAgIGJhdGNoKFxuICAgICAgICAgICAgJ2lmKHR5cGVvZiAnLCBWQUxVRSwgJz09PVwic3RyaW5nXCIpeycsXG4gICAgICAgICAgICBHTCwgJy5ibGVuZEVxdWF0aW9uKCcsIEJMRU5EX0VRVUFUSU9OUywgJ1snLCBWQUxVRSwgJ10pOycsXG4gICAgICAgICAgICAnfWVsc2V7JyxcbiAgICAgICAgICAgIEdMLCAnLmJsZW5kRXF1YXRpb25TZXBhcmF0ZSgnLFxuICAgICAgICAgICAgQkxFTkRfRVFVQVRJT05TLCAnWycsIFZBTFVFLCAnLnJnYl0sJyxcbiAgICAgICAgICAgIEJMRU5EX0VRVUFUSU9OUywgJ1snLCBWQUxVRSwgJy5hbHBoYV0pOycsXG4gICAgICAgICAgICAnfScpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdibGVuZC5mdW5jJzpcbiAgICAgICAgICB2YXIgQkxFTkRfRlVOQ1MgPSBsaW5rKGJsZW5kRnVuY3MpXG4gICAgICAgICAgYmF0Y2goXG4gICAgICAgICAgICBHTCwgJy5ibGVuZEZ1bmNTZXBhcmF0ZSgnLFxuICAgICAgICAgICAgQkxFTkRfRlVOQ1MsXG4gICAgICAgICAgICAnW1wic3JjUkdCXCIgaW4gJywgVkFMVUUsICc/JywgVkFMVUUsICcuc3JjUkdCOicsIFZBTFVFLCAnLnNyY10sJyxcbiAgICAgICAgICAgIEJMRU5EX0ZVTkNTLFxuICAgICAgICAgICAgJ1tcImRzdFJHQlwiIGluICcsIFZBTFVFLCAnPycsIFZBTFVFLCAnLmRzdFJHQjonLCBWQUxVRSwgJy5kc3RdLCcsXG4gICAgICAgICAgICBCTEVORF9GVU5DUyxcbiAgICAgICAgICAgICdbXCJzcmNBbHBoYVwiIGluICcsIFZBTFVFLCAnPycsIFZBTFVFLCAnLnNyY0FscGhhOicsIFZBTFVFLCAnLnNyY10sJyxcbiAgICAgICAgICAgIEJMRU5EX0ZVTkNTLFxuICAgICAgICAgICAgJ1tcImRzdEFscGhhXCIgaW4gJywgVkFMVUUsICc/JywgVkFMVUUsICcuZHN0QWxwaGE6JywgVkFMVUUsICcuZHN0XSk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3N0ZW5jaWwubWFzayc6XG4gICAgICAgICAgYmF0Y2goR0wsICcuc3RlbmNpbE1hc2soJywgVkFMVUUsICcpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdzdGVuY2lsLmZ1bmMnOlxuICAgICAgICAgIHZhciBTVEVOQ0lMX0ZVTkNTID0gbGluayhjb21wYXJlRnVuY3MpXG4gICAgICAgICAgYmF0Y2goR0wsICcuc3RlbmNpbEZ1bmMoJyxcbiAgICAgICAgICAgIFNURU5DSUxfRlVOQ1MsICdbJywgVkFMVUUsICcuY21wfHxcImFsd2F5c1wiXSwnLFxuICAgICAgICAgICAgVkFMVUUsICcucmVmfDAsJyxcbiAgICAgICAgICAgICdcIm1hc2tcIiBpbiAnLCBWQUxVRSwgJz8nLCBWQUxVRSwgJy5tYXNrOi0xKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnc3RlbmNpbC5vcEZyb250JzpcbiAgICAgICAgY2FzZSAnc3RlbmNpbC5vcEJhY2snOlxuICAgICAgICAgIHZhciBTVEVOQ0lMX09QUyA9IGxpbmsoc3RlbmNpbE9wcylcbiAgICAgICAgICBiYXRjaChHTCwgJy5zdGVuY2lsT3BTZXBhcmF0ZSgnLFxuICAgICAgICAgICAgb3B0aW9uID09PSAnc3RlbmNpbC5vcEZyb250JyA/IEdMX0ZST05UIDogR0xfQkFDSywgJywnLFxuICAgICAgICAgICAgU1RFTkNJTF9PUFMsICdbJywgVkFMVUUsICcuZmFpbHx8XCJrZWVwXCJdLCcsXG4gICAgICAgICAgICBTVEVOQ0lMX09QUywgJ1snLCBWQUxVRSwgJy56ZmFpbHx8XCJrZWVwXCJdLCcsXG4gICAgICAgICAgICBTVEVOQ0lMX09QUywgJ1snLCBWQUxVRSwgJy5wYXNzfHxcImtlZXBcIl0pOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdwb2x5Z29uT2Zmc2V0Lm9mZnNldCc6XG4gICAgICAgICAgYmF0Y2goR0wsICcucG9seWdvbk9mZnNldCgnLFxuICAgICAgICAgICAgVkFMVUUsICcuZmFjdG9yfHwwLCcsXG4gICAgICAgICAgICBWQUxVRSwgJy51bml0c3x8MCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2N1bGwuZmFjZSc6XG4gICAgICAgICAgYmF0Y2goR0wsICcuY3VsbEZhY2UoJyxcbiAgICAgICAgICAgIFZBTFVFLCAnPT09XCJmcm9udFwiPycsIEdMX0ZST05ULCAnOicsIEdMX0JBQ0ssICcpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdsaW5lV2lkdGgnOlxuICAgICAgICAgIGJhdGNoKEdMLCAnLmxpbmVXaWR0aCgnLCBWQUxVRSwgJyk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2Zyb250RmFjZSc6XG4gICAgICAgICAgYmF0Y2goR0wsICcuZnJvbnRGYWNlKCcsXG4gICAgICAgICAgICBWQUxVRSwgJz09PVwiY3dcIj8nLCBHTF9DVywgJzonLCBHTF9DQ1csICcpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdjb2xvck1hc2snOlxuICAgICAgICAgIGJhdGNoKEdMLCAnLmNvbG9yTWFzaygnLFxuICAgICAgICAgICAgVkFMVUUsICdbMF0sJyxcbiAgICAgICAgICAgIFZBTFVFLCAnWzFdLCcsXG4gICAgICAgICAgICBWQUxVRSwgJ1syXSwnLFxuICAgICAgICAgICAgVkFMVUUsICdbM10pOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdzYW1wbGUuY292ZXJhZ2UnOlxuICAgICAgICAgIGJhdGNoKEdMLCAnLnNhbXBsZUNvdmVyYWdlKCcsXG4gICAgICAgICAgICBWQUxVRSwgJy52YWx1ZSwnLFxuICAgICAgICAgICAgVkFMVUUsICcuaW52ZXJ0KTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnc2Npc3Nvci5ib3gnOlxuICAgICAgICBjYXNlICd2aWV3cG9ydCc6XG4gICAgICAgICAgdmFyIEJPWF9TVEFURSA9IGxpbmtDb250ZXh0KG9wdGlvbilcbiAgICAgICAgICBiYXRjaChCT1hfU1RBVEUsICcucHVzaCgnLFxuICAgICAgICAgICAgVkFMVUUsICcueHx8MCwnLFxuICAgICAgICAgICAgVkFMVUUsICcueXx8MCwnLFxuICAgICAgICAgICAgVkFMVUUsICcud3x8LTEsJyxcbiAgICAgICAgICAgIFZBTFVFLCAnLmh8fC0xKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAncHJpbWl0aXZlcyc6XG4gICAgICAgIGNhc2UgJ29mZnNldCc6XG4gICAgICAgIGNhc2UgJ2NvdW50JzpcbiAgICAgICAgY2FzZSAnZWxlbWVudHMnOlxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICBjaGVjay5yYWlzZSgndW5zdXBwb3J0ZWQgb3B0aW9uIGZvciBiYXRjaCcsIG9wdGlvbilcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8gdXBkYXRlIHZpZXdwb3J0L3NjaXNzb3IgYm94IHN0YXRlIGFuZCByZXN0b3JlIGZyYW1lYnVmZmVyXG4gICAgaWYgKCd2aWV3cG9ydCcgaW4gb3B0aW9ucyB8fCAnZnJhbWVidWZmZXInIGluIG9wdGlvbnMpIHtcbiAgICAgIGJhdGNoKGxpbmtDb250ZXh0KCd2aWV3cG9ydCcpLCAnLnBvbGwoKTsnKVxuICAgIH1cbiAgICBpZiAoJ3NjaXNzb3IuYm94JyBpbiBvcHRpb25zIHx8ICdmcmFtZWJ1ZmZlcicgaW4gb3B0aW9ucykge1xuICAgICAgYmF0Y2gobGlua0NvbnRleHQoJ3NjaXNzb3IuYm94JyksICcucG9sbCgpOycpXG4gICAgfVxuICAgIGlmICgnZnJhbWVidWZmZXInIGluIG9wdGlvbnMpIHtcbiAgICAgIGJhdGNoKEZSQU1FQlVGRkVSX1NUQVRFLCAnLnBvcCgpOycpXG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHNldCBkeW5hbWljIHVuaWZvcm1zXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHZhciBwcm9ncmFtVW5pZm9ybXMgPSBwcm9ncmFtLnVuaWZvcm1zXG4gICAgdmFyIERZTkFNSUNfVEVYVFVSRVMgPSBbXVxuICAgIE9iamVjdC5rZXlzKHVuaWZvcm1zKS5mb3JFYWNoKGZ1bmN0aW9uICh1bmlmb3JtKSB7XG4gICAgICB2YXIgZGF0YSA9IGZpbmRJbmZvKHByb2dyYW1Vbmlmb3JtcywgdW5pZm9ybSlcbiAgICAgIGlmICghZGF0YSkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIHZhciBUWVBFID0gZGF0YS5pbmZvLnR5cGVcbiAgICAgIHZhciBMT0NBVElPTiA9IGxpbmsoZGF0YS5sb2NhdGlvbilcbiAgICAgIHZhciBWQUxVRSA9IGR5bih1bmlmb3Jtc1t1bmlmb3JtXSlcbiAgICAgIGlmIChkYXRhLmluZm8udHlwZSA9PT0gR0xfU0FNUExFUl8yRCB8fFxuICAgICAgICAgIGRhdGEuaW5mby50eXBlID09PSBHTF9TQU1QTEVSX0NVQkUpIHtcbiAgICAgICAgdmFyIFRFWF9WQUxVRSA9IGRlZihWQUxVRSArICcuX3RleHR1cmUnKVxuICAgICAgICBEWU5BTUlDX1RFWFRVUkVTLnB1c2goVEVYX1ZBTFVFKVxuICAgICAgICBiYXRjaChzZXRVbmlmb3JtU3RyaW5nKEdMLCBHTF9JTlQsIExPQ0FUSU9OLCBURVhfVkFMVUUgKyAnLmJpbmQoKScpKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYmF0Y2goc2V0VW5pZm9ybVN0cmluZyhHTCwgVFlQRSwgTE9DQVRJT04sIFZBTFVFKSlcbiAgICAgIH1cbiAgICB9KVxuICAgIERZTkFNSUNfVEVYVFVSRVMuZm9yRWFjaChmdW5jdGlvbiAoVkFMVUUpIHtcbiAgICAgIGJhdGNoKFZBTFVFLCAnLnVuYmluZCgpOycpXG4gICAgfSlcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBzZXQgZHluYW1pYyBhdHRyaWJ1dGVzXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHZhciBwcm9ncmFtQXR0cmlidXRlcyA9IHByb2dyYW0uYXR0cmlidXRlc1xuICAgIE9iamVjdC5rZXlzKGF0dHJpYnV0ZXMpLmZvckVhY2goZnVuY3Rpb24gKGF0dHJpYnV0ZSkge1xuICAgICAgdmFyIGRhdGEgPSBmaW5kSW5mbyhwcm9ncmFtQXR0cmlidXRlcywgYXR0cmlidXRlKVxuICAgICAgaWYgKCFkYXRhKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgYmF0Y2goQklORF9BVFRSSUJVVEUsICcoJyxcbiAgICAgICAgZGF0YS5sb2NhdGlvbiwgJywnLFxuICAgICAgICBsaW5rKGF0dHJpYnV0ZS5iaW5kaW5nc1tkYXRhLmxvY2F0aW9uXSksICcsJyxcbiAgICAgICAgZHluKGF0dHJpYnV0ZXNbYXR0cmlidXRlXSksICcsJyxcbiAgICAgICAgdHlwZUxlbmd0aChkYXRhLmluZm8udHlwZSksICcpOycpXG4gICAgfSlcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBzZXQgZHluYW1pYyBhdHRyaWJ1dGVzXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gICAgaWYgKG9wdGlvbnMuY291bnQpIHtcbiAgICAgIGJhdGNoKENVUl9DT1VOVCwgJz0nLCBkeW4ob3B0aW9ucy5jb3VudCksICc7JylcbiAgICB9IGVsc2UgaWYgKCF1c2VFbGVtZW50T3B0aW9uKCdjb3VudCcpKSB7XG4gICAgICBiYXRjaCgnaWYoJywgQ1VSX0NPVU5ULCAnKXsnKVxuICAgIH1cbiAgICBpZiAob3B0aW9ucy5vZmZzZXQpIHtcbiAgICAgIGJhdGNoKENVUl9PRkZTRVQsICc9JywgZHluKG9wdGlvbnMub2Zmc2V0KSwgJzsnKVxuICAgIH1cbiAgICBpZiAob3B0aW9ucy5wcmltaXRpdmUpIHtcbiAgICAgIHZhciBQUklNX1RZUEVTID0gbGluayhwcmltVHlwZXMpXG4gICAgICBiYXRjaChDVVJfUFJJTUlUSVZFLCAnPScsIFBSSU1fVFlQRVMsICdbJywgZHluKG9wdGlvbnMucHJpbWl0aXZlKSwgJ107JylcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB1c2VFbGVtZW50T3B0aW9uICh4KSB7XG4gICAgICByZXR1cm4gaGFzRHluYW1pY0VsZW1lbnRzICYmICEoeCBpbiBvcHRpb25zIHx8IHggaW4gc3RhdGljT3B0aW9ucylcbiAgICB9XG4gICAgaWYgKGhhc0R5bmFtaWNFbGVtZW50cykge1xuICAgICAgdmFyIGR5bkVsZW1lbnRzID0gZHluKG9wdGlvbnMuZWxlbWVudHMpXG4gICAgICBiYXRjaChDVVJfRUxFTUVOVFMsICc9JyxcbiAgICAgICAgZHluRWxlbWVudHMsICc/JywgZHluRWxlbWVudHMsICcuX2VsZW1lbnRzOm51bGw7JylcbiAgICB9XG4gICAgaWYgKHVzZUVsZW1lbnRPcHRpb24oJ29mZnNldCcpKSB7XG4gICAgICBiYXRjaChDVVJfT0ZGU0VULCAnPTA7JylcbiAgICB9XG5cbiAgICAvLyBFbWl0IGRyYXcgY29tbWFuZFxuICAgIGJhdGNoKCdpZignLCBDVVJfRUxFTUVOVFMsICcpeycpXG4gICAgaWYgKHVzZUVsZW1lbnRPcHRpb24oJ2NvdW50JykpIHtcbiAgICAgIGJhdGNoKENVUl9DT1VOVCwgJz0nLCBDVVJfRUxFTUVOVFMsICcudmVydENvdW50OycsXG4gICAgICAgICdpZignLCBDVVJfQ09VTlQsICc+MCl7JylcbiAgICB9XG4gICAgaWYgKHVzZUVsZW1lbnRPcHRpb24oJ3ByaW1pdGl2ZScpKSB7XG4gICAgICBiYXRjaChDVVJfUFJJTUlUSVZFLCAnPScsIENVUl9FTEVNRU5UUywgJy5wcmltVHlwZTsnKVxuICAgIH1cbiAgICBpZiAoaGFzRHluYW1pY0VsZW1lbnRzKSB7XG4gICAgICBiYXRjaChcbiAgICAgICAgR0wsXG4gICAgICAgICcuYmluZEJ1ZmZlcignLFxuICAgICAgICBHTF9FTEVNRU5UX0FSUkFZX0JVRkZFUiwgJywnLFxuICAgICAgICBDVVJfRUxFTUVOVFMsICcuYnVmZmVyLmJ1ZmZlcik7JylcbiAgICB9XG4gICAgaWYgKGluc3RhbmNpbmcpIHtcbiAgICAgIGlmIChvcHRpb25zLmluc3RhbmNlcykge1xuICAgICAgICBiYXRjaChDVVJfSU5TVEFOQ0VTLCAnPScsIGR5bihvcHRpb25zLmluc3RhbmNlcyksICc7JylcbiAgICAgIH1cbiAgICAgIGJhdGNoKFxuICAgICAgICAnaWYoJywgQ1VSX0lOU1RBTkNFUywgJz4wKXsnLFxuICAgICAgICBJTlNUQU5DRV9FWFQsICcuZHJhd0VsZW1lbnRzSW5zdGFuY2VkQU5HTEUoJyxcbiAgICAgICAgQ1VSX1BSSU1JVElWRSwgJywnLFxuICAgICAgICBDVVJfQ09VTlQsICcsJyxcbiAgICAgICAgQ1VSX0VMRU1FTlRTLCAnLnR5cGUsJyxcbiAgICAgICAgQ1VSX09GRlNFVCwgJywnLFxuICAgICAgICBDVVJfSU5TVEFOQ0VTLCAnKTt9ZWxzZXsnKVxuICAgIH1cbiAgICBiYXRjaChcbiAgICAgIEdMLCAnLmRyYXdFbGVtZW50cygnLFxuICAgICAgQ1VSX1BSSU1JVElWRSwgJywnLFxuICAgICAgQ1VSX0NPVU5ULCAnLCcsXG4gICAgICBDVVJfRUxFTUVOVFMsICcudHlwZSwnLFxuICAgICAgQ1VSX09GRlNFVCwgJyk7JylcbiAgICBpZiAoaW5zdGFuY2luZykge1xuICAgICAgYmF0Y2goJ30nKVxuICAgIH1cbiAgICBpZiAodXNlRWxlbWVudE9wdGlvbignY291bnQnKSkge1xuICAgICAgYmF0Y2goJ30nKVxuICAgIH1cbiAgICBiYXRjaCgnfWVsc2V7JylcbiAgICBpZiAoIXVzZUVsZW1lbnRPcHRpb24oJ2NvdW50JykpIHtcbiAgICAgIGlmICh1c2VFbGVtZW50T3B0aW9uKCdwcmltaXRpdmUnKSkge1xuICAgICAgICBiYXRjaChDVVJfUFJJTUlUSVZFLCAnPScsIEdMX1RSSUFOR0xFUywgJzsnKVxuICAgICAgfVxuICAgICAgaWYgKGluc3RhbmNpbmcpIHtcbiAgICAgICAgYmF0Y2goXG4gICAgICAgICAgJ2lmKCcsIENVUl9JTlNUQU5DRVMsICc+MCl7JyxcbiAgICAgICAgICBJTlNUQU5DRV9FWFQsICcuZHJhd0FycmF5c0luc3RhbmNlZEFOR0xFKCcsXG4gICAgICAgICAgQ1VSX1BSSU1JVElWRSwgJywnLFxuICAgICAgICAgIENVUl9PRkZTRVQsICcsJyxcbiAgICAgICAgICBDVVJfQ09VTlQsICcsJyxcbiAgICAgICAgICBDVVJfSU5TVEFOQ0VTLCAnKTt9ZWxzZXsnKVxuICAgICAgfVxuICAgICAgYmF0Y2goXG4gICAgICAgIEdMLCAnLmRyYXdBcnJheXMoJyxcbiAgICAgICAgQ1VSX1BSSU1JVElWRSwgJywnLFxuICAgICAgICBDVVJfT0ZGU0VULCAnLCcsXG4gICAgICAgIENVUl9DT1VOVCwgJyk7fScpXG4gICAgICBpZiAoaW5zdGFuY2luZykge1xuICAgICAgICBiYXRjaCgnfScpXG4gICAgICB9XG4gICAgfVxuICAgIGJhdGNoKCd9fScsIGV4aXQpXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gY29tcGlsZSBhbmQgcmV0dXJuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHJldHVybiBlbnYuY29tcGlsZSgpLmJhdGNoXG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIE1BSU4gRFJBVyBDT01NQU5EXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgZnVuY3Rpb24gY29tcGlsZUNvbW1hbmQgKFxuICAgIHN0YXRpY09wdGlvbnMsIHN0YXRpY1VuaWZvcm1zLCBzdGF0aWNBdHRyaWJ1dGVzLFxuICAgIGR5bmFtaWNPcHRpb25zLCBkeW5hbWljVW5pZm9ybXMsIGR5bmFtaWNBdHRyaWJ1dGVzLFxuICAgIGhhc0R5bmFtaWMpIHtcbiAgICAvLyBDcmVhdGUgY29kZSBnZW5lcmF0aW9uIGVudmlyb25tZW50XG4gICAgdmFyIGVudiA9IGNyZWF0ZUVudmlyb25tZW50KClcbiAgICB2YXIgbGluayA9IGVudi5saW5rXG4gICAgdmFyIGJsb2NrID0gZW52LmJsb2NrXG4gICAgdmFyIHByb2MgPSBlbnYucHJvY1xuXG4gICAgdmFyIGNhbGxJZCA9IGRyYXdDYWxsQ291bnRlcisrXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gQ29tbW9uIHN0YXRlIHZhcmlhYmxlc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICB2YXIgR0xfUE9MTCA9IGxpbmsocmVnbFBvbGwpXG4gICAgdmFyIEZSQUdfU0hBREVSX1NUQVRFID0gbGluayhzaGFkZXJTdGF0ZS5mcmFnU2hhZGVycylcbiAgICB2YXIgVkVSVF9TSEFERVJfU1RBVEUgPSBsaW5rKHNoYWRlclN0YXRlLnZlcnRTaGFkZXJzKVxuICAgIHZhciBQUk9HUkFNX1NUQVRFID0gbGluayhzaGFkZXJTdGF0ZS5wcm9ncmFtcylcbiAgICB2YXIgRlJBTUVCVUZGRVJfU1RBVEUgPSBsaW5rKGZyYW1lYnVmZmVyU3RhdGUpXG4gICAgdmFyIERSQVdfU1RBVEUgPSB7XG4gICAgICBjb3VudDogbGluayhkcmF3U3RhdGUuY291bnQpLFxuICAgICAgb2Zmc2V0OiBsaW5rKGRyYXdTdGF0ZS5vZmZzZXQpLFxuICAgICAgaW5zdGFuY2VzOiBsaW5rKGRyYXdTdGF0ZS5pbnN0YW5jZXMpLFxuICAgICAgcHJpbWl0aXZlOiBsaW5rKGRyYXdTdGF0ZS5wcmltaXRpdmUpXG4gICAgfVxuICAgIHZhciBFTEVNRU5UX1NUQVRFID0gbGluayhlbGVtZW50U3RhdGUuZWxlbWVudHMpXG4gICAgdmFyIFBSSU1fVFlQRVMgPSBsaW5rKHByaW1UeXBlcylcbiAgICB2YXIgQ09NUEFSRV9GVU5DUyA9IGxpbmsoY29tcGFyZUZ1bmNzKVxuICAgIHZhciBTVEVOQ0lMX09QUyA9IGxpbmsoc3RlbmNpbE9wcylcblxuICAgIHZhciBDT05URVhUX1NUQVRFID0ge31cbiAgICBmdW5jdGlvbiBsaW5rQ29udGV4dCAoeCkge1xuICAgICAgdmFyIHJlc3VsdCA9IENPTlRFWFRfU1RBVEVbeF1cbiAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgfVxuICAgICAgcmVzdWx0ID0gQ09OVEVYVF9TVEFURVt4XSA9IGxpbmsoY29udGV4dFN0YXRlW3hdKVxuICAgICAgcmV0dXJuIHJlc3VsdFxuICAgIH1cblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBTVEFUSUMgU1RBVEVcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gQ29kZSBibG9ja3MgZm9yIHRoZSBzdGF0aWMgc2VjdGlvbnNcbiAgICB2YXIgZW50cnkgPSBibG9jaygpXG4gICAgdmFyIGV4aXQgPSBibG9jaygpXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gdXBkYXRlIGRlZmF1bHQgY29udGV4dCBzdGF0ZSB2YXJpYWJsZXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgZnVuY3Rpb24gaGFuZGxlU3RhdGljT3B0aW9uIChwYXJhbSwgdmFsdWUpIHtcbiAgICAgIHZhciBTVEFURV9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgZW50cnkoU1RBVEVfU1RBQ0ssICcucHVzaCgnLCB2YWx1ZSwgJyk7JylcbiAgICAgIGV4aXQoU1RBVEVfU1RBQ0ssICcucG9wKCk7JylcbiAgICB9XG5cbiAgICB2YXIgaGFzU2hhZGVyID0gZmFsc2VcbiAgICBPYmplY3Qua2V5cyhzdGF0aWNPcHRpb25zKS5zb3J0KG9wdGlvblByaW9yaXR5KS5mb3JFYWNoKGZ1bmN0aW9uIChwYXJhbSkge1xuICAgICAgdmFyIHZhbHVlID0gc3RhdGljT3B0aW9uc1twYXJhbV1cbiAgICAgIHN3aXRjaCAocGFyYW0pIHtcbiAgICAgICAgY2FzZSAnZnJhZyc6XG4gICAgICAgICAgaGFzU2hhZGVyID0gdHJ1ZVxuICAgICAgICAgIGVudHJ5KEZSQUdfU0hBREVSX1NUQVRFLCAnLnB1c2goJywgbGluayh2YWx1ZSksICcpOycpXG4gICAgICAgICAgZXhpdChGUkFHX1NIQURFUl9TVEFURSwgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAndmVydCc6XG4gICAgICAgICAgaGFzU2hhZGVyID0gdHJ1ZVxuICAgICAgICAgIGVudHJ5KFZFUlRfU0hBREVSX1NUQVRFLCAnLnB1c2goJywgbGluayh2YWx1ZSksICcpOycpXG4gICAgICAgICAgZXhpdChWRVJUX1NIQURFUl9TVEFURSwgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnZnJhbWVidWZmZXInOlxuICAgICAgICAgIHZhciBmYm8gPSBmcmFtZWJ1ZmZlclN0YXRlLmdldEZyYW1lYnVmZmVyKHZhbHVlKVxuICAgICAgICAgIGNoZWNrKHZhbHVlID09PSBudWxsIHx8IGZibywgJ2ludmFsaWQgZnJhbWVidWZmZXIgb2JqZWN0JylcbiAgICAgICAgICB2YXIgVklFV1BPUlRfU1RBVEUgPSBsaW5rQ29udGV4dCgndmlld3BvcnQnKVxuICAgICAgICAgIHZhciBTQ0lTU09SX1NUQVRFID0gbGlua0NvbnRleHQoJ3NjaXNzb3IuYm94JylcbiAgICAgICAgICBlbnRyeSgnaWYoJywgRlJBTUVCVUZGRVJfU1RBVEUsICcucHVzaCgnLCBsaW5rKFxuICAgICAgICAgICAgdmFsdWUgJiYgdmFsdWUuX2ZyYW1lYnVmZmVyKSwgJykpeycsXG4gICAgICAgICAgICBWSUVXUE9SVF9TVEFURSwgJy5zZXREaXJ0eSgpOycsXG4gICAgICAgICAgICBTQ0lTU09SX1NUQVRFLCAnLnNldERpcnR5KCk7JyxcbiAgICAgICAgICAgICd9JylcbiAgICAgICAgICBleGl0KCdpZignLCBGUkFNRUJVRkZFUl9TVEFURSwgJy5wb3AoKSl7JyxcbiAgICAgICAgICAgIFZJRVdQT1JUX1NUQVRFLCAnLnNldERpcnR5KCk7JyxcbiAgICAgICAgICAgIFNDSVNTT1JfU1RBVEUsICcuc2V0RGlydHkoKTsnLFxuICAgICAgICAgICAgJ30nKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgLy8gVXBkYXRlIGRyYXcgc3RhdGVcbiAgICAgICAgY2FzZSAnY291bnQnOlxuICAgICAgICBjYXNlICdvZmZzZXQnOlxuICAgICAgICBjYXNlICdpbnN0YW5jZXMnOlxuICAgICAgICAgIGNoZWNrLm5uaSh2YWx1ZSwgcGFyYW0pXG4gICAgICAgICAgZW50cnkoRFJBV19TVEFURVtwYXJhbV0sICcucHVzaCgnLCB2YWx1ZSwgJyk7JylcbiAgICAgICAgICBleGl0KERSQVdfU1RBVEVbcGFyYW1dLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICAvLyBVcGRhdGUgcHJpbWl0aXZlIHR5cGVcbiAgICAgICAgY2FzZSAncHJpbWl0aXZlJzpcbiAgICAgICAgICBjaGVjay5wYXJhbWV0ZXIodmFsdWUsIHByaW1UeXBlcywgJ25vdCBhIHZhbGlkIGRyYXdpbmcgcHJpbWl0aXZlJylcbiAgICAgICAgICB2YXIgcHJpbVR5cGUgPSBwcmltVHlwZXNbdmFsdWVdXG4gICAgICAgICAgZW50cnkoRFJBV19TVEFURS5wcmltaXRpdmUsICcucHVzaCgnLCBwcmltVHlwZSwgJyk7JylcbiAgICAgICAgICBleGl0KERSQVdfU1RBVEUucHJpbWl0aXZlLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICAvLyBVcGRhdGUgZWxlbWVudCBidWZmZXJcbiAgICAgICAgY2FzZSAnZWxlbWVudHMnOlxuICAgICAgICAgIHZhciBlbGVtZW50cyA9IGVsZW1lbnRTdGF0ZS5nZXRFbGVtZW50cyh2YWx1ZSlcbiAgICAgICAgICB2YXIgaGFzUHJpbWl0aXZlID0gISgncHJpbWl0aXZlJyBpbiBzdGF0aWNPcHRpb25zKVxuICAgICAgICAgIHZhciBoYXNDb3VudCA9ICEoJ2NvdW50JyBpbiBzdGF0aWNPcHRpb25zKVxuICAgICAgICAgIGlmIChlbGVtZW50cykge1xuICAgICAgICAgICAgdmFyIEVMRU1FTlRTID0gbGluayhlbGVtZW50cylcbiAgICAgICAgICAgIGVudHJ5KEVMRU1FTlRfU1RBVEUsICcucHVzaCgnLCBFTEVNRU5UUywgJyk7JylcbiAgICAgICAgICAgIGlmIChoYXNQcmltaXRpdmUpIHtcbiAgICAgICAgICAgICAgZW50cnkoRFJBV19TVEFURS5wcmltaXRpdmUsICcucHVzaCgnLCBFTEVNRU5UUywgJy5wcmltVHlwZSk7JylcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChoYXNDb3VudCkge1xuICAgICAgICAgICAgICBlbnRyeShEUkFXX1NUQVRFLmNvdW50LCAnLnB1c2goJywgRUxFTUVOVFMsICcudmVydENvdW50KTsnKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBlbnRyeShFTEVNRU5UX1NUQVRFLCAnLnB1c2gobnVsbCk7JylcbiAgICAgICAgICAgIGlmIChoYXNQcmltaXRpdmUpIHtcbiAgICAgICAgICAgICAgZW50cnkoRFJBV19TVEFURS5wcmltaXRpdmUsICcucHVzaCgnLCBHTF9UUklBTkdMRVMsICcpOycpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaGFzQ291bnQpIHtcbiAgICAgICAgICAgICAgZW50cnkoRFJBV19TVEFURS5jb3VudCwgJy5wdXNoKDApOycpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChoYXNQcmltaXRpdmUpIHtcbiAgICAgICAgICAgIGV4aXQoRFJBV19TVEFURS5wcmltaXRpdmUsICcucG9wKCk7JylcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGhhc0NvdW50KSB7XG4gICAgICAgICAgICBleGl0KERSQVdfU1RBVEUuY291bnQsICcucG9wKCk7JylcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCEoJ29mZnNldCcgaW4gc3RhdGljT3B0aW9ucykpIHtcbiAgICAgICAgICAgIGVudHJ5KERSQVdfU1RBVEUub2Zmc2V0LCAnLnB1c2goMCk7JylcbiAgICAgICAgICAgIGV4aXQoRFJBV19TVEFURS5vZmZzZXQsICcucG9wKCk7JylcbiAgICAgICAgICB9XG4gICAgICAgICAgZXhpdChFTEVNRU5UX1NUQVRFLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdjdWxsLmVuYWJsZSc6XG4gICAgICAgIGNhc2UgJ2JsZW5kLmVuYWJsZSc6XG4gICAgICAgIGNhc2UgJ2RpdGhlcic6XG4gICAgICAgIGNhc2UgJ3N0ZW5jaWwuZW5hYmxlJzpcbiAgICAgICAgY2FzZSAnZGVwdGguZW5hYmxlJzpcbiAgICAgICAgY2FzZSAnc2Npc3Nvci5lbmFibGUnOlxuICAgICAgICBjYXNlICdwb2x5Z29uT2Zmc2V0LmVuYWJsZSc6XG4gICAgICAgIGNhc2UgJ3NhbXBsZS5hbHBoYSc6XG4gICAgICAgIGNhc2UgJ3NhbXBsZS5lbmFibGUnOlxuICAgICAgICBjYXNlICdkZXB0aC5tYXNrJzpcbiAgICAgICAgICBjaGVjay50eXBlKHZhbHVlLCAnYm9vbGVhbicsIHBhcmFtKVxuICAgICAgICAgIGhhbmRsZVN0YXRpY09wdGlvbihwYXJhbSwgdmFsdWUpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdkZXB0aC5mdW5jJzpcbiAgICAgICAgICBjaGVjay5wYXJhbWV0ZXIodmFsdWUsIGNvbXBhcmVGdW5jcywgcGFyYW0pXG4gICAgICAgICAgaGFuZGxlU3RhdGljT3B0aW9uKHBhcmFtLCBjb21wYXJlRnVuY3NbdmFsdWVdKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnZGVwdGgucmFuZ2UnOlxuICAgICAgICAgIGNoZWNrKFxuICAgICAgICAgICAgQXJyYXkuaXNBcnJheSh2YWx1ZSkgJiZcbiAgICAgICAgICAgIHZhbHVlLmxlbmd0aCA9PT0gMiAmJlxuICAgICAgICAgICAgdmFsdWVbMF0gPD0gdmFsdWVbMV0sXG4gICAgICAgICAgICAnZGVwdGggcmFuZ2UgaXMgMmQgYXJyYXknKVxuICAgICAgICAgIHZhciBERVBUSF9SQU5HRV9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGVudHJ5KERFUFRIX1JBTkdFX1NUQUNLLCAnLnB1c2goJywgdmFsdWVbMF0sICcsJywgdmFsdWVbMV0sICcpOycpXG4gICAgICAgICAgZXhpdChERVBUSF9SQU5HRV9TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnYmxlbmQuZnVuYyc6XG4gICAgICAgICAgdmFyIEJMRU5EX0ZVTkNfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBjaGVjay50eXBlKHZhbHVlLCAnb2JqZWN0JywgJ2JsZW5kIGZ1bmMgbXVzdCBiZSBhbiBvYmplY3QnKVxuICAgICAgICAgIHZhciBzcmNSR0IgPSAoJ3NyY1JHQicgaW4gdmFsdWUgPyB2YWx1ZS5zcmNSR0IgOiB2YWx1ZS5zcmMpXG4gICAgICAgICAgdmFyIHNyY0FscGhhID0gKCdzcmNBbHBoYScgaW4gdmFsdWUgPyB2YWx1ZS5zcmNBbHBoYSA6IHZhbHVlLnNyYylcbiAgICAgICAgICB2YXIgZHN0UkdCID0gKCdkc3RSR0InIGluIHZhbHVlID8gdmFsdWUuZHN0UkdCIDogdmFsdWUuZHN0KVxuICAgICAgICAgIHZhciBkc3RBbHBoYSA9ICgnZHN0QWxwaGEnIGluIHZhbHVlID8gdmFsdWUuZHN0QWxwaGEgOiB2YWx1ZS5kc3QpXG4gICAgICAgICAgY2hlY2sucGFyYW1ldGVyKHNyY1JHQiwgYmxlbmRGdW5jcylcbiAgICAgICAgICBjaGVjay5wYXJhbWV0ZXIoc3JjQWxwaGEsIGJsZW5kRnVuY3MpXG4gICAgICAgICAgY2hlY2sucGFyYW1ldGVyKGRzdFJHQiwgYmxlbmRGdW5jcylcbiAgICAgICAgICBjaGVjay5wYXJhbWV0ZXIoZHN0QWxwaGEsIGJsZW5kRnVuY3MpXG4gICAgICAgICAgZW50cnkoQkxFTkRfRlVOQ19TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICBibGVuZEZ1bmNzW3NyY1JHQl0sICcsJyxcbiAgICAgICAgICAgIGJsZW5kRnVuY3NbZHN0UkdCXSwgJywnLFxuICAgICAgICAgICAgYmxlbmRGdW5jc1tzcmNBbHBoYV0sICcsJyxcbiAgICAgICAgICAgIGJsZW5kRnVuY3NbZHN0QWxwaGFdLCAnKTsnKVxuICAgICAgICAgIGV4aXQoQkxFTkRfRlVOQ19TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnYmxlbmQuZXF1YXRpb24nOlxuICAgICAgICAgIHZhciBCTEVORF9FUVVBVElPTl9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICBjaGVjay5wYXJhbWV0ZXIodmFsdWUsIGJsZW5kRXF1YXRpb25zLCAnaW52YWxpZCBibGVuZCBlcXVhdGlvbicpXG4gICAgICAgICAgICBlbnRyeShCTEVORF9FUVVBVElPTl9TVEFDSyxcbiAgICAgICAgICAgICAgJy5wdXNoKCcsXG4gICAgICAgICAgICAgIGJsZW5kRXF1YXRpb25zW3ZhbHVlXSwgJywnLFxuICAgICAgICAgICAgICBibGVuZEVxdWF0aW9uc1t2YWx1ZV0sICcpOycpXG4gICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICBjaGVjay5wYXJhbWV0ZXIoXG4gICAgICAgICAgICAgIHZhbHVlLnJnYiwgYmxlbmRFcXVhdGlvbnMsICdpbnZhbGlkIGJsZW5kIGVxdWF0aW9uIHJnYicpXG4gICAgICAgICAgICBjaGVjay5wYXJhbWV0ZXIoXG4gICAgICAgICAgICAgIHZhbHVlLmFscGhhLCBibGVuZEVxdWF0aW9ucywgJ2ludmFsaWQgYmxlbmQgZXF1YXRpb24gYWxwaGEnKVxuICAgICAgICAgICAgZW50cnkoQkxFTkRfRVFVQVRJT05fU1RBQ0ssXG4gICAgICAgICAgICAgICcucHVzaCgnLFxuICAgICAgICAgICAgICBibGVuZEVxdWF0aW9uc1t2YWx1ZS5yZ2JdLCAnLCcsXG4gICAgICAgICAgICAgIGJsZW5kRXF1YXRpb25zW3ZhbHVlLmFscGhhXSwgJyk7JylcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY2hlY2sucmFpc2UoJ2ludmFsaWQgYmxlbmQgZXF1YXRpb24nKVxuICAgICAgICAgIH1cbiAgICAgICAgICBleGl0KEJMRU5EX0VRVUFUSU9OX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdibGVuZC5jb2xvcic6XG4gICAgICAgICAgY2hlY2soXG4gICAgICAgICAgICBBcnJheS5pc0FycmF5KHZhbHVlKSAmJlxuICAgICAgICAgICAgdmFsdWUubGVuZ3RoID09PSA0LFxuICAgICAgICAgICAgJ2JsZW5kIGNvbG9yIGlzIGEgNGQgYXJyYXknKVxuICAgICAgICAgIHZhciBCTEVORF9DT0xPUl9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGVudHJ5KEJMRU5EX0NPTE9SX1NUQUNLLFxuICAgICAgICAgICAgJy5wdXNoKCcsXG4gICAgICAgICAgICB2YWx1ZVswXSwgJywnLFxuICAgICAgICAgICAgdmFsdWVbMV0sICcsJyxcbiAgICAgICAgICAgIHZhbHVlWzJdLCAnLCcsXG4gICAgICAgICAgICB2YWx1ZVszXSwgJyk7JylcbiAgICAgICAgICBleGl0KEJMRU5EX0NPTE9SX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdzdGVuY2lsLm1hc2snOlxuICAgICAgICAgIGNoZWNrLnR5cGUodmFsdWUsICdudW1iZXInLCAnc3RlbmNpbCBtYXNrIG11c3QgYmUgYW4gaW50ZWdlcicpXG4gICAgICAgICAgdmFyIFNURU5DSUxfTUFTS19TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGVudHJ5KFNURU5DSUxfTUFTS19TVEFDSywgJy5wdXNoKCcsIHZhbHVlLCAnKTsnKVxuICAgICAgICAgIGV4aXQoU1RFTkNJTF9NQVNLX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdzdGVuY2lsLmZ1bmMnOlxuICAgICAgICAgIGNoZWNrLnR5cGUodmFsdWUsICdvYmplY3QnLCAnc3RlbmNpbCBmdW5jIG11c3QgYmUgYW4gb2JqZWN0JylcbiAgICAgICAgICB2YXIgY21wID0gdmFsdWUuY21wIHx8ICdrZWVwJ1xuICAgICAgICAgIHZhciByZWYgPSB2YWx1ZS5yZWYgfHwgMFxuICAgICAgICAgIHZhciBtYXNrID0gJ21hc2snIGluIHZhbHVlID8gdmFsdWUubWFzayA6IC0xXG4gICAgICAgICAgY2hlY2sucGFyYW1ldGVyKGNtcCwgY29tcGFyZUZ1bmNzLCAnaW52YWxpZCBzdGVuY2lsIGZ1bmMgY21wJylcbiAgICAgICAgICBjaGVjay50eXBlKHJlZiwgJ251bWJlcicsICdzdGVuY2lsIGZ1bmMgcmVmJylcbiAgICAgICAgICBjaGVjay50eXBlKG1hc2ssICdudW1iZXInLCAnc3RlbmNpbCBmdW5jIG1hc2snKVxuICAgICAgICAgIHZhciBTVEVOQ0lMX0ZVTkNfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBlbnRyeShTVEVOQ0lMX0ZVTkNfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgY29tcGFyZUZ1bmNzW2NtcF0sICcsJyxcbiAgICAgICAgICAgIHJlZiwgJywnLFxuICAgICAgICAgICAgbWFzaywgJyk7JylcbiAgICAgICAgICBleGl0KFNURU5DSUxfRlVOQ19TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnc3RlbmNpbC5vcEZyb250JzpcbiAgICAgICAgY2FzZSAnc3RlbmNpbC5vcEJhY2snOlxuICAgICAgICAgIGNoZWNrLnR5cGUodmFsdWUsICdvYmplY3QnLCBwYXJhbSlcbiAgICAgICAgICB2YXIgZmFpbCA9IHZhbHVlLmZhaWwgfHwgJ2tlZXAnXG4gICAgICAgICAgdmFyIHpmYWlsID0gdmFsdWUuemZhaWwgfHwgJ2tlZXAnXG4gICAgICAgICAgdmFyIHBhc3MgPSB2YWx1ZS5wYXNzIHx8ICdrZWVwJ1xuICAgICAgICAgIGNoZWNrLnBhcmFtZXRlcihmYWlsLCBzdGVuY2lsT3BzLCBwYXJhbSlcbiAgICAgICAgICBjaGVjay5wYXJhbWV0ZXIoemZhaWwsIHN0ZW5jaWxPcHMsIHBhcmFtKVxuICAgICAgICAgIGNoZWNrLnBhcmFtZXRlcihwYXNzLCBzdGVuY2lsT3BzLCBwYXJhbSlcbiAgICAgICAgICB2YXIgU1RFTkNJTF9PUF9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGVudHJ5KFNURU5DSUxfT1BfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgc3RlbmNpbE9wc1tmYWlsXSwgJywnLFxuICAgICAgICAgICAgc3RlbmNpbE9wc1t6ZmFpbF0sICcsJyxcbiAgICAgICAgICAgIHN0ZW5jaWxPcHNbcGFzc10sICcpOycpXG4gICAgICAgICAgZXhpdChTVEVOQ0lMX09QX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdwb2x5Z29uT2Zmc2V0Lm9mZnNldCc6XG4gICAgICAgICAgY2hlY2sudHlwZSh2YWx1ZSwgJ29iamVjdCcsIHBhcmFtKVxuICAgICAgICAgIHZhciBmYWN0b3IgPSB2YWx1ZS5mYWN0b3IgfHwgMFxuICAgICAgICAgIHZhciB1bml0cyA9IHZhbHVlLnVuaXRzIHx8IDBcbiAgICAgICAgICBjaGVjay50eXBlKGZhY3RvciwgJ251bWJlcicsICdvZmZzZXQuZmFjdG9yJylcbiAgICAgICAgICBjaGVjay50eXBlKHVuaXRzLCAnbnVtYmVyJywgJ29mZnNldC51bml0cycpXG4gICAgICAgICAgdmFyIFBPTFlHT05fT0ZGU0VUX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZW50cnkoUE9MWUdPTl9PRkZTRVRfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgZmFjdG9yLCAnLCcsIHVuaXRzLCAnKTsnKVxuICAgICAgICAgIGV4aXQoUE9MWUdPTl9PRkZTRVRfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2N1bGwuZmFjZSc6XG4gICAgICAgICAgdmFyIGZhY2UgPSAwXG4gICAgICAgICAgaWYgKHZhbHVlID09PSAnZnJvbnQnKSB7XG4gICAgICAgICAgICBmYWNlID0gR0xfRlJPTlRcbiAgICAgICAgICB9IGVsc2UgaWYgKHZhbHVlID09PSAnYmFjaycpIHtcbiAgICAgICAgICAgIGZhY2UgPSBHTF9CQUNLXG4gICAgICAgICAgfVxuICAgICAgICAgIGNoZWNrKCEhZmFjZSwgJ2N1bGwuZmFjZScpXG4gICAgICAgICAgdmFyIENVTExfRkFDRV9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGVudHJ5KENVTExfRkFDRV9TVEFDSywgJy5wdXNoKCcsIGZhY2UsICcpOycpXG4gICAgICAgICAgZXhpdChDVUxMX0ZBQ0VfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2xpbmVXaWR0aCc6XG4gICAgICAgICAgdmFyIGxpbmVXaWR0aERpbXMgPSBsaW1pdHMubGluZVdpZHRoRGltc1xuICAgICAgICAgIGNoZWNrKFxuICAgICAgICAgICAgdHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyAmJlxuICAgICAgICAgICAgdmFsdWUgPj0gbGluZVdpZHRoRGltc1swXSAmJlxuICAgICAgICAgICAgdmFsdWUgPD0gbGluZVdpZHRoRGltc1sxXSxcbiAgICAgICAgICAgICdpbnZhbGlkIGxpbmUgd2lkdGgsIG11c3QgcG9zaXRpdmUgbnVtYmVyIGJldHdlZW4gJyArXG4gICAgICAgICAgICBsaW5lV2lkdGhEaW1zWzBdICsgJyBhbmQgJyArIGxpbmVXaWR0aERpbXNbMV0pXG4gICAgICAgICAgaGFuZGxlU3RhdGljT3B0aW9uKHBhcmFtLCB2YWx1ZSlcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2Zyb250RmFjZSc6XG4gICAgICAgICAgdmFyIG9yaWVudGF0aW9uID0gMFxuICAgICAgICAgIGlmICh2YWx1ZSA9PT0gJ2N3Jykge1xuICAgICAgICAgICAgb3JpZW50YXRpb24gPSBHTF9DV1xuICAgICAgICAgIH0gZWxzZSBpZiAodmFsdWUgPT09ICdjY3cnKSB7XG4gICAgICAgICAgICBvcmllbnRhdGlvbiA9IEdMX0NDV1xuICAgICAgICAgIH1cbiAgICAgICAgICBjaGVjayghIW9yaWVudGF0aW9uLCAnZnJvbnRGYWNlJylcbiAgICAgICAgICB2YXIgRlJPTlRfRkFDRV9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGVudHJ5KEZST05UX0ZBQ0VfU1RBQ0ssICcucHVzaCgnLCBvcmllbnRhdGlvbiwgJyk7JylcbiAgICAgICAgICBleGl0KEZST05UX0ZBQ0VfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2NvbG9yTWFzayc6XG4gICAgICAgICAgY2hlY2soQXJyYXkuaXNBcnJheSh2YWx1ZSkgJiYgdmFsdWUubGVuZ3RoID09PSA0LCAnY29sb3IgbWFzayBtdXN0IGJlIGxlbmd0aCA0IGFycmF5JylcbiAgICAgICAgICB2YXIgQ09MT1JfTUFTS19TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGVudHJ5KENPTE9SX01BU0tfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgdmFsdWUubWFwKGZ1bmN0aW9uICh2KSB7IHJldHVybiAhIXYgfSkuam9pbigpLFxuICAgICAgICAgICAgJyk7JylcbiAgICAgICAgICBleGl0KENPTE9SX01BU0tfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3NhbXBsZS5jb3ZlcmFnZSc6XG4gICAgICAgICAgY2hlY2sudHlwZSh2YWx1ZSwgJ29iamVjdCcsIHBhcmFtKVxuICAgICAgICAgIHZhciBzYW1wbGVWYWx1ZSA9ICd2YWx1ZScgaW4gdmFsdWUgPyB2YWx1ZS52YWx1ZSA6IDFcbiAgICAgICAgICB2YXIgc2FtcGxlSW52ZXJ0ID0gISF2YWx1ZS5pbnZlcnRcbiAgICAgICAgICBjaGVjayhcbiAgICAgICAgICAgIHR5cGVvZiBzYW1wbGVWYWx1ZSA9PT0gJ251bWJlcicgJiZcbiAgICAgICAgICAgIHNhbXBsZVZhbHVlID49IDAgJiYgc2FtcGxlVmFsdWUgPD0gMSxcbiAgICAgICAgICAgICdzYW1wbGUgdmFsdWUnKVxuICAgICAgICAgIHZhciBTQU1QTEVfQ09WRVJBR0VfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBlbnRyeShTQU1QTEVfQ09WRVJBR0VfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgc2FtcGxlVmFsdWUsICcsJywgc2FtcGxlSW52ZXJ0LCAnKTsnKVxuICAgICAgICAgIGV4aXQoU0FNUExFX0NPVkVSQUdFX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICd2aWV3cG9ydCc6XG4gICAgICAgIGNhc2UgJ3NjaXNzb3IuYm94JzpcbiAgICAgICAgICBjaGVjayh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlLCBwYXJhbSArICcgaXMgYW4gb2JqZWN0JylcbiAgICAgICAgICB2YXIgWCA9IHZhbHVlLnggfHwgMFxuICAgICAgICAgIHZhciBZID0gdmFsdWUueSB8fCAwXG4gICAgICAgICAgdmFyIFcgPSAtMVxuICAgICAgICAgIHZhciBIID0gLTFcbiAgICAgICAgICBjaGVjayh0eXBlb2YgWCA9PT0gJ251bWJlcicgJiYgWCA+PSAwLCBwYXJhbSArICcueCBtdXN0IGJlIGEgcG9zaXRpdmUgaW50JylcbiAgICAgICAgICBjaGVjayh0eXBlb2YgWSA9PT0gJ251bWJlcicgJiYgWSA+PSAwLCBwYXJhbSArICcueSBtdXN0IGJlIGEgcG9zaXRpdmUgaW50JylcbiAgICAgICAgICBpZiAoJ3cnIGluIHZhbHVlKSB7XG4gICAgICAgICAgICBXID0gdmFsdWUud1xuICAgICAgICAgICAgY2hlY2sodHlwZW9mIFcgPT09ICdudW1iZXInICYmIFcgPj0gMCwgcGFyYW0gKyAnLncgbXVzdCBiZSBhIHBvc2l0aXZlIGludCcpXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgnaCcgaW4gdmFsdWUpIHtcbiAgICAgICAgICAgIEggPSB2YWx1ZS5oXG4gICAgICAgICAgICBjaGVjayh0eXBlb2YgSCA9PT0gJ251bWJlcicgJiYgSCA+PSAwLCBwYXJhbSArICcuaCBtdXN0IGJlIGEgcG9zaXRpdmUgaW50JylcbiAgICAgICAgICB9XG4gICAgICAgICAgdmFyIEJPWF9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGVudHJ5KEJPWF9TVEFDSywgJy5wdXNoKCcsIFgsICcsJywgWSwgJywnLCBXLCAnLCcsIEgsICcpOycpXG4gICAgICAgICAgZXhpdChCT1hfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgLy8gVE9ETyBTaG91bGQgdGhpcyBqdXN0IGJlIGEgd2FybmluZyBpbnN0ZWFkP1xuICAgICAgICAgIGNoZWNrLnJhaXNlKCd1bnN1cHBvcnRlZCBwYXJhbWV0ZXIgJyArIHBhcmFtKVxuICAgICAgICAgIGJyZWFrXG4gICAgICB9XG4gICAgfSlcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyB1cGRhdGUgc2hhZGVyIHByb2dyYW1cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgaWYgKGhhc1NoYWRlcikge1xuICAgICAgaWYgKHN0YXRpY09wdGlvbnMuZnJhZyAmJiBzdGF0aWNPcHRpb25zLnZlcnQpIHtcbiAgICAgICAgdmFyIGZyYWdTcmMgPSBzdGF0aWNPcHRpb25zLmZyYWdcbiAgICAgICAgdmFyIHZlcnRTcmMgPSBzdGF0aWNPcHRpb25zLnZlcnRcbiAgICAgICAgZW50cnkoUFJPR1JBTV9TVEFURSwgJy5wdXNoKCcsXG4gICAgICAgICAgbGluayhzaGFkZXJTdGF0ZS5jcmVhdGUodmVydFNyYywgZnJhZ1NyYykpLCAnKTsnKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIEZSQUdfU1JDID0gZW50cnkuZGVmKFxuICAgICAgICAgIEZSQUdfU0hBREVSX1NUQVRFLCAnWycsIEZSQUdfU0hBREVSX1NUQVRFLCAnLmxlbmd0aC0xXScpXG4gICAgICAgIHZhciBWRVJUX1NSQyA9IGVudHJ5LmRlZihcbiAgICAgICAgICBWRVJUX1NIQURFUl9TVEFURSwgJ1snLCBWRVJUX1NIQURFUl9TVEFURSwgJy5sZW5ndGgtMV0nKVxuICAgICAgICB2YXIgTElOS19QUk9HID0gbGluayhzaGFkZXJTdGF0ZS5jcmVhdGUpXG4gICAgICAgIGVudHJ5KFxuICAgICAgICAgIFBST0dSQU1fU1RBVEUsICcucHVzaCgnLFxuICAgICAgICAgIExJTktfUFJPRywgJygnLCBWRVJUX1NSQywgJywnLCBGUkFHX1NSQywgJykpOycpXG4gICAgICB9XG4gICAgICBleGl0KFBST0dSQU1fU1RBVEUsICcucG9wKCk7JylcbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gdXBkYXRlIHN0YXRpYyB1bmlmb3Jtc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBPYmplY3Qua2V5cyhzdGF0aWNVbmlmb3JtcykuZm9yRWFjaChmdW5jdGlvbiAodW5pZm9ybSkge1xuICAgICAgdW5pZm9ybVN0YXRlLmRlZih1bmlmb3JtKVxuICAgICAgdmFyIFNUQUNLID0gbGluayh1bmlmb3JtU3RhdGUudW5pZm9ybXNbdW5pZm9ybV0pXG4gICAgICB2YXIgVkFMVUVcbiAgICAgIHZhciB2YWx1ZSA9IHN0YXRpY1VuaWZvcm1zW3VuaWZvcm1dXG4gICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nICYmIHZhbHVlLl9yZWdsVHlwZSkge1xuICAgICAgICBWQUxVRSA9IGxpbmsodmFsdWUpXG4gICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG4gICAgICAgIFZBTFVFID0gbGluayh2YWx1ZS5zbGljZSgpKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgVkFMVUUgPSArdmFsdWVcbiAgICAgIH1cbiAgICAgIGVudHJ5KFNUQUNLLCAnLnB1c2goJywgVkFMVUUsICcpOycpXG4gICAgICBleGl0KFNUQUNLLCAnLnBvcCgpOycpXG4gICAgfSlcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyB1cGRhdGUgZGVmYXVsdCBhdHRyaWJ1dGVzXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIE9iamVjdC5rZXlzKHN0YXRpY0F0dHJpYnV0ZXMpLmZvckVhY2goZnVuY3Rpb24gKGF0dHJpYnV0ZSkge1xuICAgICAgYXR0cmlidXRlU3RhdGUuZGVmKGF0dHJpYnV0ZSlcbiAgICAgIHZhciBBVFRSSUJVVEUgPSBsaW5rKGF0dHJpYnV0ZVN0YXRlLmF0dHJpYnV0ZXNbYXR0cmlidXRlXSlcblxuICAgICAgdmFyIGRhdGEgPSBzdGF0aWNBdHRyaWJ1dGVzW2F0dHJpYnV0ZV1cbiAgICAgIGlmICh0eXBlb2YgZGF0YSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgZW50cnkoQVRUUklCVVRFLCAnLnB1c2hWZWMoJywgK2RhdGEsICcsMCwwLDApOycpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjaGVjayghIWRhdGEsICdpbnZhbGlkIGF0dHJpYnV0ZTogJyArIGF0dHJpYnV0ZSlcblxuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShkYXRhKSkge1xuICAgICAgICAgIGVudHJ5KFxuICAgICAgICAgICAgQVRUUklCVVRFLCAnLnB1c2hWZWMoJyxcbiAgICAgICAgICAgIFtkYXRhWzBdIHx8IDAsIGRhdGFbMV0gfHwgMCwgZGF0YVsyXSB8fCAwLCBkYXRhWzNdIHx8IDBdLCAnKTsnKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHZhciBidWZmZXIgPSBidWZmZXJTdGF0ZS5nZXRCdWZmZXIoZGF0YSlcbiAgICAgICAgICB2YXIgc2l6ZSA9IDBcbiAgICAgICAgICB2YXIgc3RyaWRlID0gMFxuICAgICAgICAgIHZhciBvZmZzZXQgPSAwXG4gICAgICAgICAgdmFyIGRpdmlzb3IgPSAwXG4gICAgICAgICAgdmFyIG5vcm1hbGl6ZWQgPSBmYWxzZVxuICAgICAgICAgIHZhciB0eXBlID0gR0xfRkxPQVRcblxuICAgICAgICAgIGlmICghYnVmZmVyKSB7XG4gICAgICAgICAgICBjaGVjay50eXBlKGRhdGEsICdvYmplY3QnLCAnaW52YWxpZCBhdHRyaWJ1dGUgXCInICsgYXR0cmlidXRlICsgJ1wiJylcblxuICAgICAgICAgICAgYnVmZmVyID0gYnVmZmVyU3RhdGUuZ2V0QnVmZmVyKGRhdGEuYnVmZmVyKVxuICAgICAgICAgICAgc2l6ZSA9IGRhdGEuc2l6ZSB8fCAwXG4gICAgICAgICAgICBzdHJpZGUgPSBkYXRhLnN0cmlkZSB8fCAwXG4gICAgICAgICAgICBvZmZzZXQgPSBkYXRhLm9mZnNldCB8fCAwXG4gICAgICAgICAgICBkaXZpc29yID0gZGF0YS5kaXZpc29yIHx8IDBcbiAgICAgICAgICAgIG5vcm1hbGl6ZWQgPSBkYXRhLm5vcm1hbGl6ZWQgfHwgZmFsc2VcblxuICAgICAgICAgICAgY2hlY2soISFidWZmZXIsICdpbnZhbGlkIGF0dHJpYnV0ZSAnICsgYXR0cmlidXRlICsgJy5idWZmZXInKVxuXG4gICAgICAgICAgICAvLyBDaGVjayBmb3IgdXNlciBkZWZpbmVkIHR5cGUgb3ZlcmxvYWRpbmdcbiAgICAgICAgICAgIHR5cGUgPSBidWZmZXIuZHR5cGVcbiAgICAgICAgICAgIGlmICgndHlwZScgaW4gZGF0YSkge1xuICAgICAgICAgICAgICBjaGVjay5wYXJhbWV0ZXIoZGF0YS50eXBlLCBnbFR5cGVzLCAnYXR0cmlidXRlIHR5cGUnKVxuICAgICAgICAgICAgICB0eXBlID0gZ2xUeXBlc1tkYXRhLnR5cGVdXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHR5cGUgPSBidWZmZXIuZHR5cGVcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjaGVjayghIWJ1ZmZlciwgJ2ludmFsaWQgYXR0cmlidXRlICcgKyBhdHRyaWJ1dGUgKyAnLmJ1ZmZlcicpXG4gICAgICAgICAgY2hlY2subm5pKHN0cmlkZSwgYXR0cmlidXRlICsgJy5zdHJpZGUnKVxuICAgICAgICAgIGNoZWNrLm5uaShvZmZzZXQsIGF0dHJpYnV0ZSArICcub2Zmc2V0JylcbiAgICAgICAgICBjaGVjay5ubmkoZGl2aXNvciwgYXR0cmlidXRlICsgJy5kaXZpc29yJylcbiAgICAgICAgICBjaGVjay50eXBlKG5vcm1hbGl6ZWQsICdib29sZWFuJywgYXR0cmlidXRlICsgJy5ub3JtYWxpemVkJylcbiAgICAgICAgICBjaGVjay5vbmVPZihzaXplLCBbMCwgMSwgMiwgMywgNF0sIGF0dHJpYnV0ZSArICcuc2l6ZScpXG5cbiAgICAgICAgICBlbnRyeShcbiAgICAgICAgICAgIEFUVFJJQlVURSwgJy5wdXNoUHRyKCcsIFtcbiAgICAgICAgICAgICAgbGluayhidWZmZXIpLCBzaXplLCBvZmZzZXQsIHN0cmlkZSxcbiAgICAgICAgICAgICAgZGl2aXNvciwgbm9ybWFsaXplZCwgdHlwZVxuICAgICAgICAgICAgXS5qb2luKCksICcpOycpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGV4aXQoQVRUUklCVVRFLCAnLnBvcCgpOycpXG4gICAgfSlcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBEWU5BTUlDIFNUQVRFIChmb3Igc2NvcGUgYW5kIGRyYXcpXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIEdlbmVyYXRlZCBjb2RlIGJsb2NrcyBmb3IgZHluYW1pYyBzdGF0ZSBmbGFnc1xuICAgIHZhciBkeW5hbWljRW50cnkgPSBlbnYuYmxvY2soKVxuICAgIHZhciBkeW5hbWljRXhpdCA9IGVudi5ibG9jaygpXG5cbiAgICB2YXIgRlJBTUVTVEFURVxuICAgIHZhciBEWU5BUkdTXG4gICAgaWYgKGhhc0R5bmFtaWMpIHtcbiAgICAgIEZSQU1FU1RBVEUgPSBsaW5rKGZyYW1lU3RhdGUpXG4gICAgICBEWU5BUkdTID0gZW50cnkuZGVmKClcbiAgICB9XG5cbiAgICB2YXIgZHluYW1pY1ZhcnMgPSB7fVxuICAgIGZ1bmN0aW9uIGR5biAoeCkge1xuICAgICAgdmFyIGlkID0geC5pZFxuICAgICAgdmFyIHJlc3VsdCA9IGR5bmFtaWNWYXJzW2lkXVxuICAgICAgaWYgKHJlc3VsdCkge1xuICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICB9XG4gICAgICBpZiAoeC5mdW5jKSB7XG4gICAgICAgIHJlc3VsdCA9IGR5bmFtaWNFbnRyeS5kZWYoXG4gICAgICAgICAgbGluayh4LmRhdGEpLCAnKCcsIERZTkFSR1MsICcsMCwnLCBGUkFNRVNUQVRFLCAnKScpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXN1bHQgPSBkeW5hbWljRW50cnkuZGVmKERZTkFSR1MsICcuJywgeC5kYXRhKVxuICAgICAgfVxuICAgICAgZHluYW1pY1ZhcnNbaWRdID0gcmVzdWx0XG4gICAgICByZXR1cm4gcmVzdWx0XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGR5bmFtaWMgY29udGV4dCBzdGF0ZSB2YXJpYWJsZXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgT2JqZWN0LmtleXMoZHluYW1pY09wdGlvbnMpLnNvcnQob3B0aW9uUHJpb3JpdHkpLmZvckVhY2goZnVuY3Rpb24gKHBhcmFtKSB7XG4gICAgICAvLyBMaW5rIGluIGR5bmFtaWMgdmFyaWFibGVcbiAgICAgIHZhciB2YXJpYWJsZSA9IGR5bihkeW5hbWljT3B0aW9uc1twYXJhbV0pXG5cbiAgICAgIHN3aXRjaCAocGFyYW0pIHtcbiAgICAgICAgY2FzZSAnZnJhbWVidWZmZXInOlxuICAgICAgICAgIHZhciBWSUVXUE9SVF9TVEFURSA9IGxpbmtDb250ZXh0KCd2aWV3cG9ydCcpXG4gICAgICAgICAgdmFyIFNDSVNTT1JfU1RBVEUgPSBsaW5rQ29udGV4dCgnc2Npc3Nvci5ib3gnKVxuICAgICAgICAgIGR5bmFtaWNFbnRyeSgnaWYoJyxcbiAgICAgICAgICAgIEZSQU1FQlVGRkVSX1NUQVRFLCAnLnB1c2goJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnJiYnLCB2YXJpYWJsZSwgJy5fZnJhbWVidWZmZXIpKXsnLFxuICAgICAgICAgICAgVklFV1BPUlRfU1RBVEUsICcuc2V0RGlydHkoKTsnLFxuICAgICAgICAgICAgU0NJU1NPUl9TVEFURSwgJy5zZXREaXJ0eSgpOycsXG4gICAgICAgICAgICAnfScpXG4gICAgICAgICAgZHluYW1pY0V4aXQoJ2lmKCcsXG4gICAgICAgICAgICBGUkFNRUJVRkZFUl9TVEFURSwgJy5wb3AoKSl7JyxcbiAgICAgICAgICAgIFZJRVdQT1JUX1NUQVRFLCAnLnNldERpcnR5KCk7JyxcbiAgICAgICAgICAgIFNDSVNTT1JfU1RBVEUsICcuc2V0RGlydHkoKTsnLFxuICAgICAgICAgICAgJ30nKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnY3VsbC5lbmFibGUnOlxuICAgICAgICBjYXNlICdibGVuZC5lbmFibGUnOlxuICAgICAgICBjYXNlICdkaXRoZXInOlxuICAgICAgICBjYXNlICdzdGVuY2lsLmVuYWJsZSc6XG4gICAgICAgIGNhc2UgJ2RlcHRoLmVuYWJsZSc6XG4gICAgICAgIGNhc2UgJ3NjaXNzb3IuZW5hYmxlJzpcbiAgICAgICAgY2FzZSAncG9seWdvbk9mZnNldC5lbmFibGUnOlxuICAgICAgICBjYXNlICdzYW1wbGUuYWxwaGEnOlxuICAgICAgICBjYXNlICdzYW1wbGUuZW5hYmxlJzpcbiAgICAgICAgY2FzZSAnbGluZVdpZHRoJzpcbiAgICAgICAgY2FzZSAnZGVwdGgubWFzayc6XG4gICAgICAgICAgdmFyIFNUQVRFX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZHluYW1pY0VudHJ5KFNUQVRFX1NUQUNLLCAnLnB1c2goJywgdmFyaWFibGUsICcpOycpXG4gICAgICAgICAgZHluYW1pY0V4aXQoU1RBVEVfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIC8vIERyYXcgY2FsbHNcbiAgICAgICAgY2FzZSAnY291bnQnOlxuICAgICAgICBjYXNlICdvZmZzZXQnOlxuICAgICAgICBjYXNlICdpbnN0YW5jZXMnOlxuICAgICAgICAgIHZhciBEUkFXX1NUQUNLID0gRFJBV19TVEFURVtwYXJhbV1cbiAgICAgICAgICBkeW5hbWljRW50cnkoRFJBV19TVEFDSywgJy5wdXNoKCcsIHZhcmlhYmxlLCAnKTsnKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KERSQVdfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3ByaW1pdGl2ZSc6XG4gICAgICAgICAgdmFyIFBSSU1fU1RBQ0sgPSBEUkFXX1NUQVRFLnByaW1pdGl2ZVxuICAgICAgICAgIGR5bmFtaWNFbnRyeShQUklNX1NUQUNLLCAnLnB1c2goJywgUFJJTV9UWVBFUywgJ1snLCB2YXJpYWJsZSwgJ10pOycpXG4gICAgICAgICAgZHluYW1pY0V4aXQoUFJJTV9TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnZGVwdGguZnVuYyc6XG4gICAgICAgICAgdmFyIERFUFRIX0ZVTkNfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBkeW5hbWljRW50cnkoREVQVEhfRlVOQ19TVEFDSywgJy5wdXNoKCcsIENPTVBBUkVfRlVOQ1MsICdbJywgdmFyaWFibGUsICddKTsnKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KERFUFRIX0ZVTkNfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2JsZW5kLmZ1bmMnOlxuICAgICAgICAgIHZhciBCTEVORF9GVU5DX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgdmFyIEJMRU5EX0ZVTkNTID0gbGluayhibGVuZEZ1bmNzKVxuICAgICAgICAgIGR5bmFtaWNFbnRyeShcbiAgICAgICAgICAgIEJMRU5EX0ZVTkNfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgQkxFTkRfRlVOQ1MsXG4gICAgICAgICAgICAnW1wic3JjUkdCXCIgaW4gJywgdmFyaWFibGUsICc/JywgdmFyaWFibGUsICcuc3JjUkdCOicsIHZhcmlhYmxlLCAnLnNyY10sJyxcbiAgICAgICAgICAgIEJMRU5EX0ZVTkNTLFxuICAgICAgICAgICAgJ1tcImRzdFJHQlwiIGluICcsIHZhcmlhYmxlLCAnPycsIHZhcmlhYmxlLCAnLmRzdFJHQjonLCB2YXJpYWJsZSwgJy5kc3RdLCcsXG4gICAgICAgICAgICBCTEVORF9GVU5DUyxcbiAgICAgICAgICAgICdbXCJzcmNBbHBoYVwiIGluICcsIHZhcmlhYmxlLCAnPycsIHZhcmlhYmxlLCAnLnNyY0FscGhhOicsIHZhcmlhYmxlLCAnLnNyY10sJyxcbiAgICAgICAgICAgIEJMRU5EX0ZVTkNTLFxuICAgICAgICAgICAgJ1tcImRzdEFscGhhXCIgaW4gJywgdmFyaWFibGUsICc/JywgdmFyaWFibGUsICcuZHN0QWxwaGE6JywgdmFyaWFibGUsICcuZHN0XSk7JylcbiAgICAgICAgICBkeW5hbWljRXhpdChCTEVORF9GVU5DX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdibGVuZC5lcXVhdGlvbic6XG4gICAgICAgICAgdmFyIEJMRU5EX0VRVUFUSU9OX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgdmFyIEJMRU5EX0VRVUFUSU9OUyA9IGxpbmsoYmxlbmRFcXVhdGlvbnMpXG4gICAgICAgICAgZHluYW1pY0VudHJ5KFxuICAgICAgICAgICAgJ2lmKHR5cGVvZiAnLCB2YXJpYWJsZSwgJz09PVwic3RyaW5nXCIpeycsXG4gICAgICAgICAgICBCTEVORF9FUVVBVElPTl9TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICBCTEVORF9FUVVBVElPTlMsICdbJywgdmFyaWFibGUsICddLCcsXG4gICAgICAgICAgICBCTEVORF9FUVVBVElPTlMsICdbJywgdmFyaWFibGUsICddKTsnLFxuICAgICAgICAgICAgJ31lbHNleycsXG4gICAgICAgICAgICBCTEVORF9FUVVBVElPTl9TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICBCTEVORF9FUVVBVElPTlMsICdbJywgdmFyaWFibGUsICcucmdiXSwnLFxuICAgICAgICAgICAgQkxFTkRfRVFVQVRJT05TLCAnWycsIHZhcmlhYmxlLCAnLmFscGhhXSk7JyxcbiAgICAgICAgICAgICd9JylcbiAgICAgICAgICBkeW5hbWljRXhpdChCTEVORF9FUVVBVElPTl9TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnYmxlbmQuY29sb3InOlxuICAgICAgICAgIHZhciBCTEVORF9DT0xPUl9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGR5bmFtaWNFbnRyeShCTEVORF9DT0xPUl9TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJ1swXSwnLFxuICAgICAgICAgICAgdmFyaWFibGUsICdbMV0sJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnWzJdLCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJ1szXSk7JylcbiAgICAgICAgICBkeW5hbWljRXhpdChCTEVORF9DT0xPUl9TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnc3RlbmNpbC5tYXNrJzpcbiAgICAgICAgICB2YXIgU1RFTkNJTF9NQVNLX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZHluYW1pY0VudHJ5KFNURU5DSUxfTUFTS19TVEFDSywgJy5wdXNoKCcsIHZhcmlhYmxlLCAnKTsnKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KFNURU5DSUxfTUFTS19TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnc3RlbmNpbC5mdW5jJzpcbiAgICAgICAgICB2YXIgU1RFTkNJTF9GVU5DX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZHluYW1pY0VudHJ5KFNURU5DSUxfRlVOQ19TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICBDT01QQVJFX0ZVTkNTLCAnWycsIHZhcmlhYmxlLCAnLmNtcF0sJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnLnJlZnwwLCcsXG4gICAgICAgICAgICAnXCJtYXNrXCIgaW4gJywgdmFyaWFibGUsICc/JywgdmFyaWFibGUsICcubWFzazotMSk7JylcbiAgICAgICAgICBkeW5hbWljRXhpdChTVEVOQ0lMX0ZVTkNfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3N0ZW5jaWwub3BGcm9udCc6XG4gICAgICAgIGNhc2UgJ3N0ZW5jaWwub3BCYWNrJzpcbiAgICAgICAgICB2YXIgU1RFTkNJTF9PUF9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGR5bmFtaWNFbnRyeShTVEVOQ0lMX09QX1NUQUNLLCAnLnB1c2goJyxcbiAgICAgICAgICAgIFNURU5DSUxfT1BTLCAnWycsIHZhcmlhYmxlLCAnLmZhaWx8fFwia2VlcFwiXSwnLFxuICAgICAgICAgICAgU1RFTkNJTF9PUFMsICdbJywgdmFyaWFibGUsICcuemZhaWx8fFwia2VlcFwiXSwnLFxuICAgICAgICAgICAgU1RFTkNJTF9PUFMsICdbJywgdmFyaWFibGUsICcucGFzc3x8XCJrZWVwXCJdKTsnKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KFNURU5DSUxfT1BfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3BvbHlnb25PZmZzZXQub2Zmc2V0JzpcbiAgICAgICAgICB2YXIgUE9MWUdPTl9PRkZTRVRfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBkeW5hbWljRW50cnkoUE9MWUdPTl9PRkZTRVRfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgdmFyaWFibGUsICcuZmFjdG9yfHwwLCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJy51bml0c3x8MCk7JylcbiAgICAgICAgICBkeW5hbWljRXhpdChQT0xZR09OX09GRlNFVF9TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnY3VsbC5mYWNlJzpcbiAgICAgICAgICB2YXIgQ1VMTF9GQUNFX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZHluYW1pY0VudHJ5KENVTExfRkFDRV9TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJz09PVwiZnJvbnRcIj8nLCBHTF9GUk9OVCwgJzonLCBHTF9CQUNLLCAnKTsnKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KENVTExfRkFDRV9TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnZnJvbnRGYWNlJzpcbiAgICAgICAgICB2YXIgRlJPTlRfRkFDRV9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGR5bmFtaWNFbnRyeShGUk9OVF9GQUNFX1NUQUNLLCAnLnB1c2goJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnPT09XCJjd1wiPycsIEdMX0NXLCAnOicsIEdMX0NDVywgJyk7JylcbiAgICAgICAgICBkeW5hbWljRXhpdChGUk9OVF9GQUNFX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdjb2xvck1hc2snOlxuICAgICAgICAgIHZhciBDT0xPUl9NQVNLX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZHluYW1pY0VudHJ5KENPTE9SX01BU0tfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgdmFyaWFibGUsICdbMF0sJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnWzFdLCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJ1syXSwnLFxuICAgICAgICAgICAgdmFyaWFibGUsICdbM10pOycpXG4gICAgICAgICAgZHluYW1pY0V4aXQoQ09MT1JfTUFTS19TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnc2FtcGxlLmNvdmVyYWdlJzpcbiAgICAgICAgICB2YXIgU0FNUExFX0NPVkVSQUdFX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZHluYW1pY0VudHJ5KFNBTVBMRV9DT1ZFUkFHRV9TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJy52YWx1ZSwnLFxuICAgICAgICAgICAgdmFyaWFibGUsICcuaW52ZXJ0KTsnKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KFNBTVBMRV9DT1ZFUkFHRV9TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnc2Npc3Nvci5ib3gnOlxuICAgICAgICBjYXNlICd2aWV3cG9ydCc6XG4gICAgICAgICAgdmFyIEJPWF9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGR5bmFtaWNFbnRyeShCT1hfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgdmFyaWFibGUsICcueHx8MCwnLFxuICAgICAgICAgICAgdmFyaWFibGUsICcueXx8MCwnLFxuICAgICAgICAgICAgJ1wid1wiIGluICcsIHZhcmlhYmxlLCAnPycsIHZhcmlhYmxlLCAnLnc6LTEsJyxcbiAgICAgICAgICAgICdcImhcIiBpbiAnLCB2YXJpYWJsZSwgJz8nLCB2YXJpYWJsZSwgJy5oOi0xKTsnKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KEJPWF9TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnZWxlbWVudHMnOlxuICAgICAgICAgIHZhciBoYXNQcmltaXRpdmUgPVxuICAgICAgICAgICEoJ3ByaW1pdGl2ZScgaW4gZHluYW1pY09wdGlvbnMpICYmXG4gICAgICAgICAgICAhKCdwcmltaXRpdmUnIGluIHN0YXRpY09wdGlvbnMpXG4gICAgICAgICAgdmFyIGhhc0NvdW50ID1cbiAgICAgICAgICAhKCdjb3VudCcgaW4gZHluYW1pY09wdGlvbnMpICYmXG4gICAgICAgICAgICAhKCdjb3VudCcgaW4gc3RhdGljT3B0aW9ucylcbiAgICAgICAgICB2YXIgaGFzT2Zmc2V0ID1cbiAgICAgICAgICAhKCdvZmZzZXQnIGluIGR5bmFtaWNPcHRpb25zKSAmJlxuICAgICAgICAgICAgISgnb2Zmc2V0JyBpbiBzdGF0aWNPcHRpb25zKVxuICAgICAgICAgIHZhciBFTEVNRU5UUyA9IGR5bmFtaWNFbnRyeS5kZWYoKVxuICAgICAgICAgIGR5bmFtaWNFbnRyeShcbiAgICAgICAgICAgICdpZignLCB2YXJpYWJsZSwgJyl7JyxcbiAgICAgICAgICAgIEVMRU1FTlRTLCAnPScsIHZhcmlhYmxlLCAnLl9lbGVtZW50czsnLFxuICAgICAgICAgICAgRUxFTUVOVF9TVEFURSwgJy5wdXNoKCcsIEVMRU1FTlRTLCAnKTsnLFxuICAgICAgICAgICAgIWhhc1ByaW1pdGl2ZSA/ICcnXG4gICAgICAgICAgICAgIDogRFJBV19TVEFURS5wcmltaXRpdmUgKyAnLnB1c2goJyArIEVMRU1FTlRTICsgJy5wcmltVHlwZSk7JyxcbiAgICAgICAgICAgICFoYXNDb3VudCA/ICcnXG4gICAgICAgICAgICAgIDogRFJBV19TVEFURS5jb3VudCArICcucHVzaCgnICsgRUxFTUVOVFMgKyAnLnZlcnRDb3VudCk7JyxcbiAgICAgICAgICAgICFoYXNPZmZzZXQgPyAnJ1xuICAgICAgICAgICAgICA6IERSQVdfU1RBVEUub2Zmc2V0ICsgJy5wdXNoKCcgKyBFTEVNRU5UUyArICcub2Zmc2V0KTsnLFxuICAgICAgICAgICAgJ31lbHNleycsXG4gICAgICAgICAgICBFTEVNRU5UX1NUQVRFLCAnLnB1c2gobnVsbCk7JyxcbiAgICAgICAgICAgICd9JylcbiAgICAgICAgICBkeW5hbWljRXhpdChcbiAgICAgICAgICAgIEVMRU1FTlRfU1RBVEUsICcucG9wKCk7JyxcbiAgICAgICAgICAgICdpZignLCB2YXJpYWJsZSwgJyl7JyxcbiAgICAgICAgICAgIGhhc1ByaW1pdGl2ZSA/IERSQVdfU1RBVEUucHJpbWl0aXZlICsgJy5wb3AoKTsnIDogJycsXG4gICAgICAgICAgICBoYXNDb3VudCA/IERSQVdfU1RBVEUuY291bnQgKyAnLnBvcCgpOycgOiAnJyxcbiAgICAgICAgICAgIGhhc09mZnNldCA/IERSQVdfU1RBVEUub2Zmc2V0ICsgJy5wb3AoKTsnIDogJycsXG4gICAgICAgICAgICAnfScpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIGNoZWNrLnJhaXNlKCd1bnN1cHBvcnRlZCBkeW5hbWljIG9wdGlvbjogJyArIHBhcmFtKVxuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gZHluYW1pYyB1bmlmb3Jtc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBPYmplY3Qua2V5cyhkeW5hbWljVW5pZm9ybXMpLmZvckVhY2goZnVuY3Rpb24gKHVuaWZvcm0pIHtcbiAgICAgIHVuaWZvcm1TdGF0ZS5kZWYodW5pZm9ybSlcbiAgICAgIHZhciBTVEFDSyA9IGxpbmsodW5pZm9ybVN0YXRlLnVuaWZvcm1zW3VuaWZvcm1dKVxuICAgICAgdmFyIFZBTFVFID0gZHluKGR5bmFtaWNVbmlmb3Jtc1t1bmlmb3JtXSlcbiAgICAgIGR5bmFtaWNFbnRyeShTVEFDSywgJy5wdXNoKCcsIFZBTFVFLCAnKTsnKVxuICAgICAgZHluYW1pY0V4aXQoU1RBQ0ssICcucG9wKCk7JylcbiAgICB9KVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGR5bmFtaWMgYXR0cmlidXRlc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBPYmplY3Qua2V5cyhkeW5hbWljQXR0cmlidXRlcykuZm9yRWFjaChmdW5jdGlvbiAoYXR0cmlidXRlKSB7XG4gICAgICBhdHRyaWJ1dGVTdGF0ZS5kZWYoYXR0cmlidXRlKVxuICAgICAgdmFyIEFUVFJJQlVURSA9IGxpbmsoYXR0cmlidXRlU3RhdGUuYXR0cmlidXRlc1thdHRyaWJ1dGVdKVxuICAgICAgdmFyIFZBTFVFID0gZHluKGR5bmFtaWNBdHRyaWJ1dGVzW2F0dHJpYnV0ZV0pXG4gICAgICBkeW5hbWljRW50cnkoQVRUUklCVVRFLCAnLnB1c2hEeW4oJywgVkFMVUUsICcpOycpXG4gICAgICBkeW5hbWljRXhpdChBVFRSSUJVVEUsICcucG9wKCk7JylcbiAgICB9KVxuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIFNDT1BFIFBST0NFRFVSRVxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICB2YXIgc2NvcGUgPSBwcm9jKCdzY29wZScpXG4gICAgdmFyIFNDT1BFX0FSR1MgPSBzY29wZS5hcmcoKVxuICAgIHZhciBTQ09QRV9CT0RZID0gc2NvcGUuYXJnKClcbiAgICBzY29wZShlbnRyeSlcbiAgICBpZiAoaGFzRHluYW1pYykge1xuICAgICAgc2NvcGUoXG4gICAgICAgIERZTkFSR1MsICc9JywgU0NPUEVfQVJHUywgJzsnLFxuICAgICAgICBkeW5hbWljRW50cnkpXG4gICAgfVxuICAgIHNjb3BlKFxuICAgICAgU0NPUEVfQk9EWSwgJygpOycsXG4gICAgICBoYXNEeW5hbWljID8gZHluYW1pY0V4aXQgOiAnJyxcbiAgICAgIGV4aXQpXG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gRFJBVyBQUk9DRURVUkVcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgdmFyIGRyYXcgPSBwcm9jKCdkcmF3JylcbiAgICBkcmF3KGVudHJ5KVxuICAgIGlmIChoYXNEeW5hbWljKSB7XG4gICAgICBkcmF3KFxuICAgICAgICBEWU5BUkdTLCAnPScsIGRyYXcuYXJnKCksICc7JyxcbiAgICAgICAgZHluYW1pY0VudHJ5KVxuICAgIH1cbiAgICB2YXIgQ1VSUkVOVF9TSEFERVIgPSBzdGFja1RvcChQUk9HUkFNX1NUQVRFKVxuICAgIGRyYXcoXG4gICAgICBHTF9QT0xMLCAnKCk7JyxcbiAgICAgICdpZignLCBDVVJSRU5UX1NIQURFUiwgJyknLFxuICAgICAgQ1VSUkVOVF9TSEFERVIsICcuZHJhdygnLCBoYXNEeW5hbWljID8gRFlOQVJHUyA6ICcnLCAnKTsnLFxuICAgICAgaGFzRHluYW1pYyA/IGR5bmFtaWNFeGl0IDogJycsXG4gICAgICBleGl0KVxuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIEJBVENIIERSQVdcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgdmFyIGJhdGNoID0gcHJvYygnYmF0Y2gnKVxuICAgIGJhdGNoKGVudHJ5KVxuICAgIHZhciBDVVJfU0hBREVSID0gYmF0Y2guZGVmKHN0YWNrVG9wKFBST0dSQU1fU1RBVEUpKVxuICAgIHZhciBFWEVDX0JBVENIID0gbGluayhmdW5jdGlvbiAocHJvZ3JhbSwgY291bnQsIGFyZ3MpIHtcbiAgICAgIHZhciBwcm9jID0gcHJvZ3JhbS5iYXRjaENhY2hlW2NhbGxJZF1cbiAgICAgIGlmICghcHJvYykge1xuICAgICAgICBwcm9jID0gcHJvZ3JhbS5iYXRjaENhY2hlW2NhbGxJZF0gPSBjb21waWxlQmF0Y2goXG4gICAgICAgICAgcHJvZ3JhbSwgZHluYW1pY09wdGlvbnMsIGR5bmFtaWNVbmlmb3JtcywgZHluYW1pY0F0dHJpYnV0ZXMsXG4gICAgICAgICAgc3RhdGljT3B0aW9ucylcbiAgICAgIH1cbiAgICAgIHJldHVybiBwcm9jKGNvdW50LCBhcmdzKVxuICAgIH0pXG4gICAgYmF0Y2goXG4gICAgICAnaWYoJywgQ1VSX1NIQURFUiwgJyl7JyxcbiAgICAgIEdMX1BPTEwsICcoKTsnLFxuICAgICAgRVhFQ19CQVRDSCwgJygnLFxuICAgICAgQ1VSX1NIQURFUiwgJywnLFxuICAgICAgYmF0Y2guYXJnKCksICcsJyxcbiAgICAgIGJhdGNoLmFyZygpLCAnKTsnKVxuICAgIC8vIFNldCBkaXJ0eSBvbiBhbGwgZHluYW1pYyBmbGFnc1xuICAgIE9iamVjdC5rZXlzKGR5bmFtaWNPcHRpb25zKS5mb3JFYWNoKGZ1bmN0aW9uIChvcHRpb24pIHtcbiAgICAgIHZhciBTVEFURSA9IENPTlRFWFRfU1RBVEVbb3B0aW9uXVxuICAgICAgaWYgKFNUQVRFKSB7XG4gICAgICAgIGJhdGNoKFNUQVRFLCAnLnNldERpcnR5KCk7JylcbiAgICAgIH1cbiAgICB9KVxuICAgIGJhdGNoKCd9JywgZXhpdClcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBldmFsIGFuZCBiaW5kXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHJldHVybiBlbnYuY29tcGlsZSgpXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGRyYXc6IGNvbXBpbGVTaGFkZXJEcmF3LFxuICAgIGNvbW1hbmQ6IGNvbXBpbGVDb21tYW5kXG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgXCJbb2JqZWN0IEludDhBcnJheV1cIjogNTEyMFxuLCBcIltvYmplY3QgSW50MTZBcnJheV1cIjogNTEyMlxuLCBcIltvYmplY3QgSW50MzJBcnJheV1cIjogNTEyNFxuLCBcIltvYmplY3QgVWludDhBcnJheV1cIjogNTEyMVxuLCBcIltvYmplY3QgVWludDhDbGFtcGVkQXJyYXldXCI6IDUxMjFcbiwgXCJbb2JqZWN0IFVpbnQxNkFycmF5XVwiOiA1MTIzXG4sIFwiW29iamVjdCBVaW50MzJBcnJheV1cIjogNTEyNVxuLCBcIltvYmplY3QgRmxvYXQzMkFycmF5XVwiOiA1MTI2XG4sIFwiW29iamVjdCBGbG9hdDY0QXJyYXldXCI6IDUxMjFcbiwgXCJbb2JqZWN0IEFycmF5QnVmZmVyXVwiOiA1MTIxXG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gIFwiaW50OFwiOiA1MTIwXG4sIFwiaW50MTZcIjogNTEyMlxuLCBcImludDMyXCI6IDUxMjRcbiwgXCJ1aW50OFwiOiA1MTIxXG4sIFwidWludDE2XCI6IDUxMjNcbiwgXCJ1aW50MzJcIjogNTEyNVxuLCBcImZsb2F0XCI6IDUxMjZcbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgXCJwb2ludHNcIjogMCxcbiAgXCJsaW5lc1wiOiAxLFxuICBcImxpbmUgbG9vcFwiOiAyLFxuICBcImxpbmUgc3RyaXBcIjogMyxcbiAgXCJ0cmlhbmdsZXNcIjogNCxcbiAgXCJ0cmlhbmdsZSBzdHJpcFwiOiA1LFxuICBcInRyaWFuZ2xlIGZhblwiOiA2XG59XG4iLCIvLyBDb250ZXh0IGFuZCBjYW52YXMgY3JlYXRpb24gaGVscGVyIGZ1bmN0aW9uc1xuLypnbG9iYWxzIEhUTUxFbGVtZW50LFdlYkdMUmVuZGVyaW5nQ29udGV4dCovXG5cbnZhciBjaGVjayA9IHJlcXVpcmUoJy4vY2hlY2snKVxuXG5mdW5jdGlvbiBjcmVhdGVDYW52YXMgKGVsZW1lbnQsIG9wdGlvbnMpIHtcbiAgdmFyIGNhbnZhcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpXG4gIHZhciBhcmdzID0gZ2V0Q29udGV4dChjYW52YXMsIG9wdGlvbnMpXG5cbiAgT2JqZWN0LmFzc2lnbihjYW52YXMuc3R5bGUsIHtcbiAgICBib3JkZXI6IDAsXG4gICAgbWFyZ2luOiAwLFxuICAgIHBhZGRpbmc6IDAsXG4gICAgdG9wOiAwLFxuICAgIGxlZnQ6IDBcbiAgfSlcbiAgZWxlbWVudC5hcHBlbmRDaGlsZChjYW52YXMpXG5cbiAgaWYgKGVsZW1lbnQgPT09IGRvY3VtZW50LmJvZHkpIHtcbiAgICBjYW52YXMuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnXG4gICAgT2JqZWN0LmFzc2lnbihlbGVtZW50LnN0eWxlLCB7XG4gICAgICBtYXJnaW46IDAsXG4gICAgICBwYWRkaW5nOiAwXG4gICAgfSlcbiAgfVxuXG4gIHZhciBzY2FsZSA9ICthcmdzLm9wdGlvbnMucGl4ZWxSYXRpb1xuICBmdW5jdGlvbiByZXNpemUgKCkge1xuICAgIHZhciB3ID0gd2luZG93LmlubmVyV2lkdGhcbiAgICB2YXIgaCA9IHdpbmRvdy5pbm5lckhlaWdodFxuICAgIGlmIChlbGVtZW50ICE9PSBkb2N1bWVudC5ib2R5KSB7XG4gICAgICB2YXIgYm91bmRzID0gZWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKVxuICAgICAgdyA9IGJvdW5kcy5yaWdodCAtIGJvdW5kcy5sZWZ0XG4gICAgICBoID0gYm91bmRzLnRvcCAtIGJvdW5kcy5ib3R0b21cbiAgICB9XG4gICAgY2FudmFzLndpZHRoID0gc2NhbGUgKiB3XG4gICAgY2FudmFzLmhlaWdodCA9IHNjYWxlICogaFxuICAgIE9iamVjdC5hc3NpZ24oY2FudmFzLnN0eWxlLCB7XG4gICAgICB3aWR0aDogdyArICdweCcsXG4gICAgICBoZWlnaHQ6IGggKyAncHgnXG4gICAgfSlcbiAgfVxuXG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdyZXNpemUnLCByZXNpemUsIGZhbHNlKVxuXG4gIHZhciBwcmV2RGVzdHJveSA9IGFyZ3Mub3B0aW9ucy5vbkRlc3Ryb3lcbiAgYXJncy5vcHRpb25zID0gT2JqZWN0LmFzc2lnbih7fSwgYXJncy5vcHRpb25zLCB7XG4gICAgb25EZXN0cm95OiBmdW5jdGlvbiAoKSB7XG4gICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigncmVzaXplJywgcmVzaXplKVxuICAgICAgZWxlbWVudC5yZW1vdmVDaGlsZChjYW52YXMpXG4gICAgICBwcmV2RGVzdHJveSAmJiBwcmV2RGVzdHJveSgpXG4gICAgfVxuICB9KVxuXG4gIHJlc2l6ZSgpXG5cbiAgcmV0dXJuIGFyZ3Ncbn1cblxuZnVuY3Rpb24gZ2V0Q29udGV4dCAoY2FudmFzLCBvcHRpb25zKSB7XG4gIHZhciBnbE9wdGlvbnMgPSBvcHRpb25zLmdsT3B0aW9ucyB8fCB7fVxuXG4gIGZ1bmN0aW9uIGdldCAobmFtZSkge1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gY2FudmFzLmdldENvbnRleHQobmFtZSwgZ2xPcHRpb25zKVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuICB9XG5cbiAgdmFyIGdsID0gZ2V0KCd3ZWJnbCcpIHx8XG4gICAgICAgICAgIGdldCgnZXhwZXJpbWVudGFsLXdlYmdsJykgfHxcbiAgICAgICAgICAgZ2V0KCd3ZWJnbC1leHBlcmltZW50YWwnKVxuXG4gIGNoZWNrKGdsLCAnd2ViZ2wgbm90IHN1cHBvcnRlZCcpXG5cbiAgcmV0dXJuIHtcbiAgICBnbDogZ2wsXG4gICAgb3B0aW9uczogT2JqZWN0LmFzc2lnbih7XG4gICAgICBwaXhlbFJhdGlvOiB3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpb1xuICAgIH0sIG9wdGlvbnMpXG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBwYXJzZUFyZ3MgKGFyZ3MpIHtcbiAgaWYgKHR5cGVvZiBkb2N1bWVudCA9PT0gJ3VuZGVmaW5lZCcgfHxcbiAgICAgIHR5cGVvZiBIVE1MRWxlbWVudCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICByZXR1cm4ge1xuICAgICAgZ2w6IGFyZ3NbMF0sXG4gICAgICBvcHRpb25zOiBhcmdzWzFdIHx8IHt9XG4gICAgfVxuICB9XG5cbiAgdmFyIGVsZW1lbnQgPSBkb2N1bWVudC5ib2R5XG4gIHZhciBvcHRpb25zID0gYXJnc1sxXSB8fCB7fVxuXG4gIGlmICh0eXBlb2YgYXJnc1swXSA9PT0gJ3N0cmluZycpIHtcbiAgICBlbGVtZW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihhcmdzWzBdKSB8fCBkb2N1bWVudC5ib2R5XG4gIH0gZWxzZSBpZiAodHlwZW9mIGFyZ3NbMF0gPT09ICdvYmplY3QnKSB7XG4gICAgaWYgKGFyZ3NbMF0gaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkge1xuICAgICAgZWxlbWVudCA9IGFyZ3NbMF1cbiAgICB9IGVsc2UgaWYgKGFyZ3NbMF0gaW5zdGFuY2VvZiBXZWJHTFJlbmRlcmluZ0NvbnRleHQpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGdsOiBhcmdzWzBdLFxuICAgICAgICBvcHRpb25zOiBPYmplY3QuYXNzaWduKHtcbiAgICAgICAgICBwaXhlbFJhdGlvOiAxXG4gICAgICAgIH0sIG9wdGlvbnMpXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIG9wdGlvbnMgPSBhcmdzWzBdXG4gICAgfVxuICB9XG5cbiAgaWYgKGVsZW1lbnQubm9kZU5hbWUgJiYgZWxlbWVudC5ub2RlTmFtZS50b1VwcGVyQ2FzZSgpID09PSAnQ0FOVkFTJykge1xuICAgIHJldHVybiBnZXRDb250ZXh0KGVsZW1lbnQsIG9wdGlvbnMpXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGNyZWF0ZUNhbnZhcyhlbGVtZW50LCBvcHRpb25zKVxuICB9XG59XG4iLCJ2YXIgR0xfVFJJQU5HTEVTID0gNFxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBEcmF3U3RhdGUgKGdsKSB7XG4gIHZhciBwcmltaXRpdmUgPSBbIEdMX1RSSUFOR0xFUyBdXG4gIHZhciBjb3VudCA9IFsgMCBdXG4gIHZhciBvZmZzZXQgPSBbIDAgXVxuICB2YXIgaW5zdGFuY2VzID0gWyAwIF1cblxuICByZXR1cm4ge1xuICAgIHByaW1pdGl2ZTogcHJpbWl0aXZlLFxuICAgIGNvdW50OiBjb3VudCxcbiAgICBvZmZzZXQ6IG9mZnNldCxcbiAgICBpbnN0YW5jZXM6IGluc3RhbmNlc1xuICB9XG59XG4iLCJ2YXIgVkFSSUFCTEVfQ09VTlRFUiA9IDBcblxuZnVuY3Rpb24gRHluYW1pY1ZhcmlhYmxlIChpc0Z1bmMsIGRhdGEpIHtcbiAgdGhpcy5pZCA9IChWQVJJQUJMRV9DT1VOVEVSKyspXG4gIHRoaXMuZnVuYyA9IGlzRnVuY1xuICB0aGlzLmRhdGEgPSBkYXRhXG59XG5cbmZ1bmN0aW9uIGRlZmluZUR5bmFtaWMgKGRhdGEsIHBhdGgpIHtcbiAgc3dpdGNoICh0eXBlb2YgZGF0YSkge1xuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgIGNhc2UgJ251bWJlcic6XG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgIHJldHVybiBuZXcgRHluYW1pY1ZhcmlhYmxlKGZhbHNlLCBkYXRhKVxuICAgIGNhc2UgJ2Z1bmN0aW9uJzpcbiAgICAgIHJldHVybiBuZXcgRHluYW1pY1ZhcmlhYmxlKHRydWUsIGRhdGEpXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBkZWZpbmVEeW5hbWljXG4gIH1cbn1cblxuZnVuY3Rpb24gaXNEeW5hbWljICh4KSB7XG4gIHJldHVybiAodHlwZW9mIHggPT09ICdmdW5jdGlvbicgJiYgIXguX3JlZ2xUeXBlKSB8fFxuICAgICAgICAgeCBpbnN0YW5jZW9mIER5bmFtaWNWYXJpYWJsZVxufVxuXG5mdW5jdGlvbiB1bmJveCAoeCwgcGF0aCkge1xuICBpZiAoeCBpbnN0YW5jZW9mIER5bmFtaWNWYXJpYWJsZSkge1xuICAgIHJldHVybiB4XG4gIH0gZWxzZSBpZiAodHlwZW9mIHggPT09ICdmdW5jdGlvbicgJiZcbiAgICAgICAgICAgICB4ICE9PSBkZWZpbmVEeW5hbWljKSB7XG4gICAgcmV0dXJuIG5ldyBEeW5hbWljVmFyaWFibGUodHJ1ZSwgeClcbiAgfVxuICByZXR1cm4gbmV3IER5bmFtaWNWYXJpYWJsZShmYWxzZSwgcGF0aClcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGRlZmluZTogZGVmaW5lRHluYW1pYyxcbiAgaXNEeW5hbWljOiBpc0R5bmFtaWMsXG4gIHVuYm94OiB1bmJveFxufVxuIiwidmFyIGNoZWNrID0gcmVxdWlyZSgnLi9jaGVjaycpXG52YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi9pcy10eXBlZC1hcnJheScpXG52YXIgaXNOREFycmF5TGlrZSA9IHJlcXVpcmUoJy4vaXMtbmRhcnJheScpXG52YXIgcHJpbVR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvcHJpbWl0aXZlcy5qc29uJylcblxudmFyIEdMX1BPSU5UUyA9IDBcbnZhciBHTF9MSU5FUyA9IDFcbnZhciBHTF9UUklBTkdMRVMgPSA0XG5cbnZhciBHTF9CWVRFID0gNTEyMFxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSA1MTIxXG52YXIgR0xfU0hPUlQgPSA1MTIyXG52YXIgR0xfVU5TSUdORURfU0hPUlQgPSA1MTIzXG52YXIgR0xfSU5UID0gNTEyNFxudmFyIEdMX1VOU0lHTkVEX0lOVCA9IDUxMjVcblxudmFyIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSID0gMzQ5NjNcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwRWxlbWVudHNTdGF0ZSAoZ2wsIGV4dGVuc2lvbnMsIGJ1ZmZlclN0YXRlKSB7XG4gIHZhciBlbGVtZW50cyA9IFsgbnVsbCBdXG5cbiAgZnVuY3Rpb24gUkVHTEVsZW1lbnRCdWZmZXIgKCkge1xuICAgIHRoaXMuYnVmZmVyID0gbnVsbFxuICAgIHRoaXMucHJpbVR5cGUgPSBHTF9UUklBTkdMRVNcbiAgICB0aGlzLnZlcnRDb3VudCA9IDBcbiAgICB0aGlzLnR5cGUgPSAwXG4gIH1cblxuICBSRUdMRWxlbWVudEJ1ZmZlci5wcm90b3R5cGUuYmluZCA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmJ1ZmZlci5iaW5kKClcbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZUVsZW1lbnRzIChvcHRpb25zKSB7XG4gICAgdmFyIGVsZW1lbnRzID0gbmV3IFJFR0xFbGVtZW50QnVmZmVyKClcbiAgICB2YXIgYnVmZmVyID0gYnVmZmVyU3RhdGUuY3JlYXRlKG51bGwsIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSLCB0cnVlKVxuICAgIGVsZW1lbnRzLmJ1ZmZlciA9IGJ1ZmZlci5fYnVmZmVyXG5cbiAgICBmdW5jdGlvbiByZWdsRWxlbWVudHMgKGlucHV0KSB7XG4gICAgICB2YXIgb3B0aW9ucyA9IGlucHV0XG4gICAgICB2YXIgZXh0MzJiaXQgPSBleHRlbnNpb25zLm9lc19lbGVtZW50X2luZGV4X3VpbnRcblxuICAgICAgLy8gVXBsb2FkIGRhdGEgdG8gdmVydGV4IGJ1ZmZlclxuICAgICAgaWYgKCFvcHRpb25zKSB7XG4gICAgICAgIGJ1ZmZlcigpXG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBvcHRpb25zID09PSAnbnVtYmVyJykge1xuICAgICAgICBidWZmZXIob3B0aW9ucylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBkYXRhID0gbnVsbFxuICAgICAgICB2YXIgdXNhZ2UgPSAnc3RhdGljJ1xuICAgICAgICB2YXIgYnl0ZUxlbmd0aCA9IDBcbiAgICAgICAgaWYgKFxuICAgICAgICAgIEFycmF5LmlzQXJyYXkob3B0aW9ucykgfHxcbiAgICAgICAgICBpc1R5cGVkQXJyYXkob3B0aW9ucykgfHxcbiAgICAgICAgICBpc05EQXJyYXlMaWtlKG9wdGlvbnMpKSB7XG4gICAgICAgICAgZGF0YSA9IG9wdGlvbnNcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjaGVjay50eXBlKG9wdGlvbnMsICdvYmplY3QnLCAnaW52YWxpZCBhcmd1bWVudHMgZm9yIGVsZW1lbnRzJylcbiAgICAgICAgICBpZiAoJ2RhdGEnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGRhdGEgPSBvcHRpb25zLmRhdGFcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCd1c2FnZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgdXNhZ2UgPSBvcHRpb25zLnVzYWdlXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgnbGVuZ3RoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBieXRlTGVuZ3RoID0gb3B0aW9ucy5sZW5ndGhcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YSkgfHxcbiAgICAgICAgICAgIChpc05EQXJyYXlMaWtlKGRhdGEpICYmIGRhdGEuZHR5cGUgPT09ICdhcnJheScpIHx8XG4gICAgICAgICAgICAndHlwZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGJ1ZmZlcih7XG4gICAgICAgICAgICB0eXBlOiBvcHRpb25zLnR5cGUgfHxcbiAgICAgICAgICAgICAgKGV4dDMyYml0XG4gICAgICAgICAgICAgICAgPyAndWludDMyJ1xuICAgICAgICAgICAgICAgIDogJ3VpbnQxNicpLFxuICAgICAgICAgICAgdXNhZ2U6IHVzYWdlLFxuICAgICAgICAgICAgZGF0YTogZGF0YSxcbiAgICAgICAgICAgIGxlbmd0aDogYnl0ZUxlbmd0aFxuICAgICAgICAgIH0pXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYnVmZmVyKHtcbiAgICAgICAgICAgIHVzYWdlOiB1c2FnZSxcbiAgICAgICAgICAgIGRhdGE6IGRhdGEsXG4gICAgICAgICAgICBsZW5ndGg6IGJ5dGVMZW5ndGhcbiAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KGRhdGEpIHx8IGlzVHlwZWRBcnJheShkYXRhKSkge1xuICAgICAgICAgIGJ1ZmZlci5kaW1lbnNpb24gPSAzXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gdHJ5IHRvIGd1ZXNzIGRlZmF1bHQgcHJpbWl0aXZlIHR5cGUgYW5kIGFyZ3VtZW50c1xuICAgICAgdmFyIHZlcnRDb3VudCA9IGVsZW1lbnRzLmJ1ZmZlci5ieXRlTGVuZ3RoXG4gICAgICB2YXIgdHlwZSA9IDBcbiAgICAgIHN3aXRjaCAoZWxlbWVudHMuYnVmZmVyLmR0eXBlKSB7XG4gICAgICAgIGNhc2UgR0xfVU5TSUdORURfQllURTpcbiAgICAgICAgY2FzZSBHTF9CWVRFOlxuICAgICAgICAgIHR5cGUgPSBHTF9VTlNJR05FRF9CWVRFXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUOlxuICAgICAgICBjYXNlIEdMX1NIT1JUOlxuICAgICAgICAgIHR5cGUgPSBHTF9VTlNJR05FRF9TSE9SVFxuICAgICAgICAgIHZlcnRDb3VudCA+Pj0gMVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9JTlQ6XG4gICAgICAgIGNhc2UgR0xfSU5UOlxuICAgICAgICAgIGNoZWNrKGV4dDMyYml0LCAnMzIgYml0IGVsZW1lbnQgYnVmZmVycyBub3Qgc3VwcG9ydGVkJylcbiAgICAgICAgICB0eXBlID0gR0xfVU5TSUdORURfSU5UXG4gICAgICAgICAgdmVydENvdW50ID4+PSAyXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIGNoZWNrLnJhaXNlKCdpbnZhbGlkIGVsZW1lbnQgYnVmZmVyIHR5cGUnKVxuICAgICAgfVxuXG4gICAgICAvLyB0cnkgdG8gZ3Vlc3MgcHJpbWl0aXZlIHR5cGUgZnJvbSBjZWxsIGRpbWVuc2lvblxuICAgICAgdmFyIHByaW1UeXBlID0gR0xfVFJJQU5HTEVTXG4gICAgICB2YXIgZGltZW5zaW9uID0gZWxlbWVudHMuYnVmZmVyLmRpbWVuc2lvblxuICAgICAgaWYgKGRpbWVuc2lvbiA9PT0gMSkgcHJpbVR5cGUgPSBHTF9QT0lOVFNcbiAgICAgIGlmIChkaW1lbnNpb24gPT09IDIpIHByaW1UeXBlID0gR0xfTElORVNcbiAgICAgIGlmIChkaW1lbnNpb24gPT09IDMpIHByaW1UeXBlID0gR0xfVFJJQU5HTEVTXG5cbiAgICAgIC8vIGlmIG1hbnVhbCBvdmVycmlkZSBwcmVzZW50LCB1c2UgdGhhdFxuICAgICAgaWYgKHR5cGVvZiBvcHRpb25zID09PSAnb2JqZWN0Jykge1xuICAgICAgICBpZiAoJ3ByaW1pdGl2ZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHZhciBwcmltaXRpdmUgPSBvcHRpb25zLnByaW1pdGl2ZVxuICAgICAgICAgIGNoZWNrLnBhcmFtZXRlcihwcmltaXRpdmUsIHByaW1UeXBlcylcbiAgICAgICAgICBwcmltVHlwZSA9IHByaW1UeXBlc1twcmltaXRpdmVdXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ2NvdW50JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgdmVydENvdW50ID0gb3B0aW9ucy52ZXJ0Q291bnQgfCAwXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gdXBkYXRlIHByb3BlcnRpZXMgZm9yIGVsZW1lbnQgYnVmZmVyXG4gICAgICBlbGVtZW50cy5wcmltVHlwZSA9IHByaW1UeXBlXG4gICAgICBlbGVtZW50cy52ZXJ0Q291bnQgPSB2ZXJ0Q291bnRcbiAgICAgIGVsZW1lbnRzLnR5cGUgPSB0eXBlXG5cbiAgICAgIHJldHVybiByZWdsRWxlbWVudHNcbiAgICB9XG5cbiAgICByZWdsRWxlbWVudHMob3B0aW9ucylcblxuICAgIE9iamVjdC5hc3NpZ24ocmVnbEVsZW1lbnRzLCB7XG4gICAgICBfcmVnbFR5cGU6ICdlbGVtZW50cycsXG4gICAgICBfZWxlbWVudHM6IGVsZW1lbnRzLFxuICAgICAgZGVzdHJveTogZnVuY3Rpb24gKCkge1xuICAgICAgICBjaGVjayhlbGVtZW50cy5idWZmZXIgIT09IG51bGwsICdtdXN0IG5vdCBkb3VibGUgZGVzdHJveSBlbGVtZW50cycpXG4gICAgICAgIGJ1ZmZlci5kZXN0cm95KClcbiAgICAgICAgZWxlbWVudHMuYnVmZmVyID0gbnVsbFxuICAgICAgfVxuICAgIH0pXG5cbiAgICByZXR1cm4gcmVnbEVsZW1lbnRzXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNyZWF0ZTogY3JlYXRlRWxlbWVudHMsXG4gICAgZWxlbWVudHM6IGVsZW1lbnRzLFxuICAgIGdldEVsZW1lbnRzOiBmdW5jdGlvbiAoZWxlbWVudHMpIHtcbiAgICAgIGlmIChlbGVtZW50cyAmJiBlbGVtZW50cy5fZWxlbWVudHMgaW5zdGFuY2VvZiBSRUdMRWxlbWVudEJ1ZmZlcikge1xuICAgICAgICByZXR1cm4gZWxlbWVudHMuX2VsZW1lbnRzXG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cbiAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjcmVhdGVFeHRlbnNpb25DYWNoZSAoZ2wpIHtcbiAgdmFyIGV4dGVuc2lvbnMgPSB7fVxuXG4gIGZ1bmN0aW9uIHJlZnJlc2hFeHRlbnNpb25zICgpIHtcbiAgICBbXG4gICAgICAnb2VzX3RleHR1cmVfZmxvYXQnLFxuICAgICAgJ29lc190ZXh0dXJlX2Zsb2F0X2xpbmVhcicsXG4gICAgICAnb2VzX3RleHR1cmVfaGFsZl9mbG9hdCcsXG4gICAgICAnb2VzX3RleHR1cmVfaGFsZl9mbG9hdF9saW5lYXInLFxuICAgICAgJ29lc19zdGFuZGFyZF9kZXJpdmF0aXZlcycsXG4gICAgICAnb2VzX2VsZW1lbnRfaW5kZXhfdWludCcsXG4gICAgICAnb2VzX2Zib19yZW5kZXJfbWlwbWFwJyxcblxuICAgICAgJ3dlYmdsX2RlcHRoX3RleHR1cmUnLFxuICAgICAgJ3dlYmdsX2RyYXdfYnVmZmVycycsXG4gICAgICAnd2ViZ2xfY29sb3JfYnVmZmVyX2Zsb2F0JyxcblxuICAgICAgJ2V4dF90ZXh0dXJlX2ZpbHRlcl9hbmlzb3Ryb3BpYycsXG4gICAgICAnZXh0X2ZyYWdfZGVwdGgnLFxuICAgICAgJ2V4dF9ibGVuZF9taW5tYXgnLFxuICAgICAgJ2V4dF9zaGFkZXJfdGV4dHVyZV9sb2QnLFxuICAgICAgJ2V4dF9jb2xvcl9idWZmZXJfaGFsZl9mbG9hdCcsXG4gICAgICAnZXh0X3NyZ2InLFxuXG4gICAgICAnYW5nbGVfaW5zdGFuY2VkX2FycmF5cycsXG5cbiAgICAgICd3ZWJnbF9jb21wcmVzc2VkX3RleHR1cmVfczN0YycsXG4gICAgICAnd2ViZ2xfY29tcHJlc3NlZF90ZXh0dXJlX2F0YycsXG4gICAgICAnd2ViZ2xfY29tcHJlc3NlZF90ZXh0dXJlX3B2cnRjJyxcbiAgICAgICd3ZWJnbF9jb21wcmVzc2VkX3RleHR1cmVfZXRjMSdcbiAgICBdLmZvckVhY2goZnVuY3Rpb24gKGV4dCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgZXh0ZW5zaW9uc1tleHRdID0gZ2wuZ2V0RXh0ZW5zaW9uKGV4dClcbiAgICAgIH0gY2F0Y2ggKGUpIHt9XG4gICAgfSlcbiAgfVxuXG4gIHJlZnJlc2hFeHRlbnNpb25zKClcblxuICByZXR1cm4ge1xuICAgIGV4dGVuc2lvbnM6IGV4dGVuc2lvbnMsXG4gICAgcmVmcmVzaDogcmVmcmVzaEV4dGVuc2lvbnNcbiAgfVxufVxuIiwidmFyIGNoZWNrID0gcmVxdWlyZSgnLi9jaGVjaycpXG52YXIgdmFsdWVzID0gcmVxdWlyZSgnLi92YWx1ZXMnKVxuXG4vLyBXZSBzdG9yZSB0aGVzZSBjb25zdGFudHMgc28gdGhhdCB0aGUgbWluaWZpZXIgY2FuIGlubGluZSB0aGVtXG52YXIgR0xfRlJBTUVCVUZGRVIgPSAweDhENDBcbnZhciBHTF9SRU5ERVJCVUZGRVIgPSAweDhENDFcblxudmFyIEdMX1RFWFRVUkVfMkQgPSAweDBERTFcbnZhciBHTF9URVhUVVJFX0NVQkVfTUFQID0gMHg4NTEzXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YID0gMHg4NTE1XG5cbnZhciBHTF9DT0xPUl9BVFRBQ0hNRU5UMCA9IDB4OENFMFxudmFyIEdMX0RFUFRIX0FUVEFDSE1FTlQgPSAweDhEMDBcbnZhciBHTF9TVEVOQ0lMX0FUVEFDSE1FTlQgPSAweDhEMjBcbnZhciBHTF9ERVBUSF9TVEVOQ0lMX0FUVEFDSE1FTlQgPSAweDgyMUFcblxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSAweDE0MDFcbnZhciBHTF9GTE9BVCA9IDB4MTQwNlxuXG52YXIgR0xfSEFMRl9GTE9BVF9PRVMgPSAweDhENjFcblxudmFyIEdMX0FMUEhBID0gMHgxOTA2XG52YXIgR0xfTFVNSU5BTkNFID0gMHgxOTA5XG52YXIgR0xfTFVNSU5BTkNFX0FMUEhBID0gMHgxOTBBXG52YXIgR0xfUkdCID0gMHgxOTA3XG52YXIgR0xfUkdCQSA9IDB4MTkwOFxuXG52YXIgR0xfUkdCQTQgPSAweDgwNTZcbnZhciBHTF9SR0I1X0ExID0gMHg4MDU3XG52YXIgR0xfUkdCNTY1ID0gMHg4RDYyXG52YXIgR0xfREVQVEhfQ09NUE9ORU5UMTYgPSAweDgxQTVcbnZhciBHTF9TVEVOQ0lMX0lOREVYOCA9IDB4OEQ0OFxuXG52YXIgR0xfREVQVEhfQ09NUE9ORU5UID0gMHgxOTAyXG52YXIgR0xfREVQVEhfU1RFTkNJTCA9IDB4ODRGOVxuXG52YXIgR0xfU1JHQjhfQUxQSEE4X0VYVCA9IDB4OEM0M1xuXG52YXIgR0xfUkdCQTMyRl9FWFQgPSAweDg4MTRcblxudmFyIEdMX1JHQkExNkZfRVhUID0gMHg4ODFBXG52YXIgR0xfUkdCMTZGX0VYVCA9IDB4ODgxQlxuXG52YXIgR0xfRlJBTUVCVUZGRVJfQ09NUExFVEUgPSAweDhDRDVcbnZhciBHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX0FUVEFDSE1FTlQgPSAweDhDRDZcbnZhciBHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX01JU1NJTkdfQVRUQUNITUVOVCA9IDB4OENEN1xudmFyIEdMX0ZSQU1FQlVGRkVSX0lOQ09NUExFVEVfRElNRU5TSU9OUyA9IDB4OENEOVxudmFyIEdMX0ZSQU1FQlVGRkVSX1VOU1VQUE9SVEVEID0gMHg4Q0REXG5cbnZhciBHTF9CQUNLID0gMTAyOVxuXG52YXIgQkFDS19CVUZGRVIgPSBbR0xfQkFDS11cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwRkJPU3RhdGUgKFxuICBnbCxcbiAgZXh0ZW5zaW9ucyxcbiAgbGltaXRzLFxuICB0ZXh0dXJlU3RhdGUsXG4gIHJlbmRlcmJ1ZmZlclN0YXRlKSB7XG4gIHZhciBzdGF0dXNDb2RlID0ge31cbiAgc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9DT01QTEVURV0gPSAnY29tcGxldGUnXG4gIHN0YXR1c0NvZGVbR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9BVFRBQ0hNRU5UXSA9ICdpbmNvbXBsZXRlIGF0dGFjaG1lbnQnXG4gIHN0YXR1c0NvZGVbR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9ESU1FTlNJT05TXSA9ICdpbmNvbXBsZXRlIGRpbWVuc2lvbnMnXG4gIHN0YXR1c0NvZGVbR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9NSVNTSU5HX0FUVEFDSE1FTlRdID0gJ2luY29tcGxldGUsIG1pc3NpbmcgYXR0YWNobWVudCdcbiAgc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9VTlNVUFBPUlRFRF0gPSAndW5zdXBwb3J0ZWQnXG5cbiAgdmFyIGNvbG9yVGV4dHVyZUZvcm1hdHMgPSB7XG4gICAgJ3JnYmEnOiBHTF9SR0JBXG4gIH1cblxuICB2YXIgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzID0ge1xuICAgICdyZ2JhNCc6IEdMX1JHQkE0LFxuICAgICdyZ2I1NjUnOiBHTF9SR0I1NjUsXG4gICAgJ3JnYjUgYTEnOiBHTF9SR0I1X0ExXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5leHRfc3JnYikge1xuICAgIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0c1snc3JnYmEnXSA9IEdMX1NSR0I4X0FMUEhBOF9FWFRcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLmV4dF9jb2xvcl9idWZmZXJfaGFsZl9mbG9hdCkge1xuICAgIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0c1sncmdiYTE2ZiddID0gR0xfUkdCQTE2Rl9FWFRcbiAgICBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHNbJ3JnYjE2ZiddID0gR0xfUkdCMTZGX0VYVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29sb3JfYnVmZmVyX2Zsb2F0KSB7XG4gICAgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzWydyZ2JhMzJmJ10gPSBHTF9SR0JBMzJGX0VYVFxuICB9XG5cbiAgdmFyIGRlcHRoUmVuZGVyYnVmZmVyRm9ybWF0RW51bXMgPSBbR0xfREVQVEhfQ09NUE9ORU5UMTZdXG4gIHZhciBzdGVuY2lsUmVuZGVyYnVmZmVyRm9ybWF0RW51bXMgPSBbR0xfU1RFTkNJTF9JTkRFWDhdXG4gIHZhciBkZXB0aFN0ZW5jaWxSZW5kZXJidWZmZXJGb3JtYXRFbnVtcyA9IFtHTF9ERVBUSF9TVEVOQ0lMXVxuXG4gIHZhciBkZXB0aFRleHR1cmVGb3JtYXRFbnVtcyA9IFtdXG4gIHZhciBzdGVuY2lsVGV4dHVyZUZvcm1hdEVudW1zID0gW11cbiAgdmFyIGRlcHRoU3RlbmNpbFRleHR1cmVGb3JtYXRFbnVtcyA9IFtdXG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfZGVwdGhfdGV4dHVyZSkge1xuICAgIGRlcHRoVGV4dHVyZUZvcm1hdEVudW1zLnB1c2goR0xfREVQVEhfQ09NUE9ORU5UKVxuICAgIGRlcHRoU3RlbmNpbFRleHR1cmVGb3JtYXRFbnVtcy5wdXNoKEdMX0RFUFRIX1NURU5DSUwpXG4gIH1cblxuICB2YXIgY29sb3JGb3JtYXRzID0gT2JqZWN0LmFzc2lnbih7fSxcbiAgICBjb2xvclRleHR1cmVGb3JtYXRzLFxuICAgIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0cylcblxuICB2YXIgY29sb3JUZXh0dXJlRm9ybWF0RW51bXMgPSB2YWx1ZXMoY29sb3JUZXh0dXJlRm9ybWF0cylcbiAgdmFyIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0RW51bXMgPSB2YWx1ZXMoY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzKVxuXG4gIHZhciBoaWdoZXN0UHJlY2lzaW9uID0gR0xfVU5TSUdORURfQllURVxuICB2YXIgY29sb3JUeXBlcyA9IHtcbiAgICAndWludDgnOiBHTF9VTlNJR05FRF9CWVRFXG4gIH1cbiAgaWYgKGV4dGVuc2lvbnMub2VzX3RleHR1cmVfaGFsZl9mbG9hdCkge1xuICAgIGhpZ2hlc3RQcmVjaXNpb24gPSBjb2xvclR5cGVzWydoYWxmIGZsb2F0J10gPSBHTF9IQUxGX0ZMT0FUX09FU1xuICB9XG4gIGlmIChleHRlbnNpb25zLm9lc190ZXh0dXJlX2Zsb2F0KSB7XG4gICAgaGlnaGVzdFByZWNpc2lvbiA9IGNvbG9yVHlwZXMuZmxvYXQgPSBHTF9GTE9BVFxuICB9XG4gIGNvbG9yVHlwZXMuYmVzdCA9IGhpZ2hlc3RQcmVjaXNpb25cblxuICB2YXIgRFJBV19CVUZGRVJTID0gKGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgcmVzdWx0ID0gbmV3IEFycmF5KGxpbWl0cy5tYXhEcmF3YnVmZmVycylcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8PSBsaW1pdHMubWF4RHJhd2J1ZmZlcnM7ICsraSkge1xuICAgICAgdmFyIHJvdyA9IHJlc3VsdFtpXSA9IG5ldyBBcnJheShpKVxuICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBpOyArK2opIHtcbiAgICAgICAgcm93W2pdID0gR0xfQ09MT1JfQVRUQUNITUVOVDAgKyBqXG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHRcbiAgfSkoKVxuXG4gIGZ1bmN0aW9uIEZyYW1lYnVmZmVyQXR0YWNobWVudCAodGFyZ2V0LCBsZXZlbCwgdGV4dHVyZSwgcmVuZGVyYnVmZmVyKSB7XG4gICAgdGhpcy50YXJnZXQgPSB0YXJnZXRcbiAgICB0aGlzLmxldmVsID0gbGV2ZWxcbiAgICB0aGlzLnRleHR1cmUgPSB0ZXh0dXJlXG4gICAgdGhpcy5yZW5kZXJidWZmZXIgPSByZW5kZXJidWZmZXJcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlY1JlZiAoYXR0YWNobWVudCkge1xuICAgIGlmIChhdHRhY2htZW50KSB7XG4gICAgICBpZiAoYXR0YWNobWVudC50ZXh0dXJlKSB7XG4gICAgICAgIGF0dGFjaG1lbnQudGV4dHVyZS5fdGV4dHVyZS5kZWNSZWYoKVxuICAgICAgfVxuICAgICAgaWYgKGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyKSB7XG4gICAgICAgIGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXIuZGVjUmVmKClcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBjaGVja0Zvcm1hdCAoYXR0YWNobWVudCwgdGV4Rm9ybWF0cywgcmJGb3JtYXRzKSB7XG4gICAgaWYgKGF0dGFjaG1lbnQudGV4dHVyZSkge1xuICAgICAgY2hlY2sub25lT2YoYXR0YWNobWVudC50ZXh0dXJlLl90ZXh0dXJlLnBhcmFtcy5pbnRlcm5hbGZvcm1hdCwgdGV4Rm9ybWF0cyxcbiAgICAgICAgJ3Vuc3VwcG9ydGVkIHRleHR1cmUgZm9ybWF0IGZvciBhdHRhY2htZW50JylcbiAgICB9IGVsc2Uge1xuICAgICAgY2hlY2sub25lT2YoYXR0YWNobWVudC5yZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlci5mb3JtYXQsIHJiRm9ybWF0cyxcbiAgICAgICAgJ3Vuc3VwcG9ydGVkIHJlbmRlcmJ1ZmZlciBmb3JtYXQgZm9yIGF0dGFjaG1lbnQnKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGluY1JlZkFuZENoZWNrU2hhcGUgKGF0dGFjaG1lbnQsIGZyYW1lYnVmZmVyKSB7XG4gICAgdmFyIHdpZHRoID0gZnJhbWVidWZmZXIud2lkdGhcbiAgICB2YXIgaGVpZ2h0ID0gZnJhbWVidWZmZXIuaGVpZ2h0XG4gICAgaWYgKGF0dGFjaG1lbnQudGV4dHVyZSkge1xuICAgICAgdmFyIHRleHR1cmUgPSBhdHRhY2htZW50LnRleHR1cmUuX3RleHR1cmVcbiAgICAgIHZhciB0dyA9IE1hdGgubWF4KDEsIHRleHR1cmUucGFyYW1zLndpZHRoID4+IGF0dGFjaG1lbnQubGV2ZWwpXG4gICAgICB2YXIgdGggPSBNYXRoLm1heCgxLCB0ZXh0dXJlLnBhcmFtcy5oZWlnaHQgPj4gYXR0YWNobWVudC5sZXZlbClcbiAgICAgIHdpZHRoID0gd2lkdGggfHwgdHdcbiAgICAgIGhlaWdodCA9IGhlaWdodCB8fCB0aFxuICAgICAgY2hlY2sodHcgPT09IHdpZHRoICYmIHRoID09PSBoZWlnaHQsXG4gICAgICAgICdpbmNvbnNpc3RlbnQgd2lkdGgvaGVpZ2h0IGZvciBzdXBwbGllZCB0ZXh0dXJlJylcbiAgICAgIGNoZWNrKHRleHR1cmUucG9sbElkIDwgMCxcbiAgICAgICAgJ3BvbGxpbmcgZmJvIHRleHR1cmVzIG5vdCBzdXBwb3J0ZWQnKVxuICAgICAgdGV4dHVyZS5yZWZDb3VudCArPSAxXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciByZW5kZXJidWZmZXIgPSBhdHRhY2htZW50LnJlbmRlcmJ1ZmZlci5fcmVuZGVyYnVmZmVyXG4gICAgICB3aWR0aCA9IHdpZHRoIHx8IHJlbmRlcmJ1ZmZlci53aWR0aFxuICAgICAgaGVpZ2h0ID0gaGVpZ2h0IHx8IHJlbmRlcmJ1ZmZlci5oZWlnaHRcbiAgICAgIGNoZWNrKFxuICAgICAgICByZW5kZXJidWZmZXIud2lkdGggPT09IHdpZHRoICYmIHJlbmRlcmJ1ZmZlci5oZWlnaHQgPT09IGhlaWdodCxcbiAgICAgICAgJ2luY29uc2lzdGVudCB3aWR0aC9oZWlnaHQgZm9yIHJlbmRlcmJ1ZmZlcicpXG4gICAgICBjaGVjayhcbiAgICAgICAgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRFbnVtcy5pbmRleE9mKHJlbmRlcmJ1ZmZlci5mb3JtYXQpID49IDAsXG4gICAgICAgICdyZW5kZXJidWZmZXIgZm9ybWF0IG5vdCBjb21wYXRpYmxlIHdpdGggY29sb3IgY2hhbm5lbHMnKVxuICAgICAgcmVuZGVyYnVmZmVyLnJlZkNvdW50ICs9IDFcbiAgICB9XG4gICAgZnJhbWVidWZmZXIud2lkdGggPSB3aWR0aFxuICAgIGZyYW1lYnVmZmVyLmhlaWdodCA9IGhlaWdodFxuICB9XG5cbiAgZnVuY3Rpb24gYXR0YWNoIChsb2NhdGlvbiwgYXR0YWNobWVudCkge1xuICAgIGlmIChhdHRhY2htZW50KSB7XG4gICAgICBpZiAoYXR0YWNobWVudC50ZXh0dXJlKSB7XG4gICAgICAgIGdsLmZyYW1lYnVmZmVyVGV4dHVyZTJEKFxuICAgICAgICAgIEdMX0ZSQU1FQlVGRkVSLFxuICAgICAgICAgIGxvY2F0aW9uLFxuICAgICAgICAgIGF0dGFjaG1lbnQudGFyZ2V0LFxuICAgICAgICAgIGF0dGFjaG1lbnQudGV4dHVyZS5fdGV4dHVyZS50ZXh0dXJlLFxuICAgICAgICAgIGF0dGFjaG1lbnQubGV2ZWwpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBnbC5mcmFtZWJ1ZmZlclJlbmRlcmJ1ZmZlcihcbiAgICAgICAgICBHTF9GUkFNRUJVRkZFUixcbiAgICAgICAgICBsb2NhdGlvbixcbiAgICAgICAgICBHTF9SRU5ERVJCVUZGRVIsXG4gICAgICAgICAgYXR0YWNobWVudC5yZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlci5yZW5kZXJidWZmZXIpXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGdsLmZyYW1lYnVmZmVyVGV4dHVyZTJEKFxuICAgICAgICBHTF9GUkFNRUJVRkZFUixcbiAgICAgICAgbG9jYXRpb24sXG4gICAgICAgIEdMX1RFWFRVUkVfMkQsXG4gICAgICAgIG51bGwsXG4gICAgICAgIDApXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gdHJ5VXBkYXRlQXR0YWNobWVudCAoXG4gICAgYXR0YWNobWVudCxcbiAgICBpc1RleHR1cmUsXG4gICAgZm9ybWF0LFxuICAgIHR5cGUsXG4gICAgd2lkdGgsXG4gICAgaGVpZ2h0KSB7XG4gICAgaWYgKGF0dGFjaG1lbnQudGV4dHVyZSkge1xuICAgICAgdmFyIHRleHR1cmUgPSBhdHRhY2htZW50LnRleHR1cmVcbiAgICAgIGlmIChpc1RleHR1cmUpIHtcbiAgICAgICAgdGV4dHVyZSh7XG4gICAgICAgICAgZm9ybWF0OiBmb3JtYXQsXG4gICAgICAgICAgdHlwZTogdHlwZSxcbiAgICAgICAgICB3aWR0aDogd2lkdGgsXG4gICAgICAgICAgaGVpZ2h0OiBoZWlnaHRcbiAgICAgICAgfSlcbiAgICAgICAgdGV4dHVyZS5fdGV4dHVyZS5yZWZDb3VudCArPSAxXG4gICAgICAgIHJldHVybiB0cnVlXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciByZW5kZXJidWZmZXIgPSBhdHRhY2htZW50LnJlbmRlcmJ1ZmZlclxuICAgICAgaWYgKCFpc1RleHR1cmUpIHtcbiAgICAgICAgcmVuZGVyYnVmZmVyKHtcbiAgICAgICAgICBmb3JtYXQ6IGZvcm1hdCxcbiAgICAgICAgICB3aWR0aDogd2lkdGgsXG4gICAgICAgICAgaGVpZ2h0OiBoZWlnaHRcbiAgICAgICAgfSlcbiAgICAgICAgcmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXIucmVmQ291bnQgKz0gMVxuICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgfVxuICAgIH1cbiAgICBkZWNSZWYoYXR0YWNobWVudClcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlQXR0YWNobWVudCAoYXR0YWNobWVudCkge1xuICAgIHZhciB0YXJnZXQgPSBHTF9URVhUVVJFXzJEXG4gICAgdmFyIGxldmVsID0gMFxuICAgIHZhciB0ZXh0dXJlID0gbnVsbFxuICAgIHZhciByZW5kZXJidWZmZXIgPSBudWxsXG5cbiAgICB2YXIgZGF0YSA9IGF0dGFjaG1lbnRcbiAgICBpZiAodHlwZW9mIGF0dGFjaG1lbnQgPT09ICdvYmplY3QnKSB7XG4gICAgICBkYXRhID0gYXR0YWNobWVudC5kYXRhXG4gICAgICBpZiAoJ2xldmVsJyBpbiBhdHRhY2htZW50KSB7XG4gICAgICAgIGxldmVsID0gYXR0YWNobWVudC5sZXZlbCB8IDBcbiAgICAgIH1cbiAgICAgIGlmICgndGFyZ2V0JyBpbiBhdHRhY2htZW50KSB7XG4gICAgICAgIHRhcmdldCA9IGF0dGFjaG1lbnQudGFyZ2V0IHwgMFxuICAgICAgfVxuICAgIH1cblxuICAgIGNoZWNrLnR5cGUoZGF0YSwgJ2Z1bmN0aW9uJywgJ2ludmFsaWQgYXR0YWNobWVudCBkYXRhJylcblxuICAgIHZhciB0eXBlID0gYXR0YWNobWVudC5fcmVnbFR5cGVcbiAgICBpZiAodHlwZSA9PT0gJ3RleHR1cmUnKSB7XG4gICAgICB0ZXh0dXJlID0gYXR0YWNobWVudFxuICAgICAgaWYgKHRleHR1cmUuX3RleHR1cmUudGFyZ2V0ID09PSBHTF9URVhUVVJFX0NVQkVfTUFQKSB7XG4gICAgICAgIGNoZWNrKFxuICAgICAgICAgIHRhcmdldCA+PSBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1ggJiZcbiAgICAgICAgICB0YXJnZXQgPCBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1ggKyA2LFxuICAgICAgICAgICdpbnZhbGlkIGN1YmUgbWFwIHRhcmdldCcpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjaGVjayh0YXJnZXQgPT09IEdMX1RFWFRVUkVfMkQpXG4gICAgICB9XG4gICAgICAvLyBUT0RPIGNoZWNrIG1pcGxldmVsIGlzIGNvbnNpc3RlbnRcbiAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICdyZW5kZXJidWZmZXInKSB7XG4gICAgICByZW5kZXJidWZmZXIgPSBhdHRhY2htZW50XG4gICAgICB0YXJnZXQgPSBHTF9SRU5ERVJCVUZGRVJcbiAgICAgIGxldmVsID0gMFxuICAgIH0gZWxzZSB7XG4gICAgICBjaGVjay5yYWlzZSgnaW52YWxpZCByZWdsIG9iamVjdCBmb3IgYXR0YWNobWVudCcpXG4gICAgfVxuXG4gICAgcmV0dXJuIG5ldyBGcmFtZWJ1ZmZlckF0dGFjaG1lbnQodGFyZ2V0LCBsZXZlbCwgdGV4dHVyZSwgcmVuZGVyYnVmZmVyKVxuICB9XG5cbiAgZnVuY3Rpb24gdW53cmFwQXR0YWNobWVudCAoYXR0YWNobWVudCkge1xuICAgIHJldHVybiBhdHRhY2htZW50ICYmIChhdHRhY2htZW50LnRleHR1cmUgfHwgYXR0YWNobWVudC5yZW5kZXJidWZmZXIpXG4gIH1cblxuICB2YXIgZnJhbWVidWZmZXJDb3VudCA9IDBcbiAgdmFyIGZyYW1lYnVmZmVyU2V0ID0ge31cbiAgdmFyIGZyYW1lYnVmZmVyU3RhY2sgPSBbbnVsbF1cbiAgdmFyIGZyYW1lYnVmZmVyRGlydHkgPSB0cnVlXG5cbiAgZnVuY3Rpb24gUkVHTEZyYW1lYnVmZmVyICgpIHtcbiAgICB0aGlzLmlkID0gZnJhbWVidWZmZXJDb3VudCsrXG4gICAgZnJhbWVidWZmZXJTZXRbdGhpcy5pZF0gPSB0aGlzXG5cbiAgICB0aGlzLmZyYW1lYnVmZmVyID0gbnVsbFxuICAgIHRoaXMud2lkdGggPSAwXG4gICAgdGhpcy5oZWlnaHQgPSAwXG5cbiAgICB0aGlzLmNvbG9yQXR0YWNobWVudHMgPSBbXVxuICAgIHRoaXMuZGVwdGhBdHRhY2htZW50ID0gbnVsbFxuICAgIHRoaXMuc3RlbmNpbEF0dGFjaG1lbnQgPSBudWxsXG4gICAgdGhpcy5kZXB0aFN0ZW5jaWxBdHRhY2htZW50ID0gbnVsbFxuXG4gICAgdGhpcy5vd25zQ29sb3IgPSBmYWxzZVxuICAgIHRoaXMub3duc0RlcHRoU3RlbmNpbCA9IGZhbHNlXG4gIH1cblxuICBmdW5jdGlvbiByZWZyZXNoIChmcmFtZWJ1ZmZlcikge1xuICAgIGlmICghZ2wuaXNGcmFtZWJ1ZmZlcihmcmFtZWJ1ZmZlci5mcmFtZWJ1ZmZlcikpIHtcbiAgICAgIGZyYW1lYnVmZmVyLmZyYW1lYnVmZmVyID0gZ2wuY3JlYXRlRnJhbWVidWZmZXIoKVxuICAgIH1cbiAgICBmcmFtZWJ1ZmZlckRpcnR5ID0gdHJ1ZVxuICAgIGdsLmJpbmRGcmFtZWJ1ZmZlcihHTF9GUkFNRUJVRkZFUiwgZnJhbWVidWZmZXIuZnJhbWVidWZmZXIpXG5cbiAgICB2YXIgY29sb3JBdHRhY2htZW50cyA9IGZyYW1lYnVmZmVyLmNvbG9yQXR0YWNobWVudHNcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNvbG9yQXR0YWNobWVudHMubGVuZ3RoOyArK2kpIHtcbiAgICAgIGF0dGFjaChHTF9DT0xPUl9BVFRBQ0hNRU5UMCArIGksIGNvbG9yQXR0YWNobWVudHNbaV0pXG4gICAgfVxuICAgIGZvciAoaSA9IGNvbG9yQXR0YWNobWVudHMubGVuZ3RoOyBpIDwgbGltaXRzLm1heENvbG9yQXR0YWNobWVudHM7ICsraSkge1xuICAgICAgYXR0YWNoKEdMX0NPTE9SX0FUVEFDSE1FTlQwICsgaSwgbnVsbClcbiAgICB9XG4gICAgYXR0YWNoKEdMX0RFUFRIX0FUVEFDSE1FTlQsIGZyYW1lYnVmZmVyLmRlcHRoQXR0YWNobWVudClcbiAgICBhdHRhY2goR0xfU1RFTkNJTF9BVFRBQ0hNRU5ULCBmcmFtZWJ1ZmZlci5zdGVuY2lsQXR0YWNobWVudClcbiAgICBhdHRhY2goR0xfREVQVEhfU1RFTkNJTF9BVFRBQ0hNRU5ULCBmcmFtZWJ1ZmZlci5kZXB0aFN0ZW5jaWxBdHRhY2htZW50KVxuXG4gICAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfZHJhd19idWZmZXJzKSB7XG4gICAgICBleHRlbnNpb25zLndlYmdsX2RyYXdfYnVmZmVycy5kcmF3QnVmZmVyc1dFQkdMKFxuICAgICAgICBEUkFXX0JVRkZFUlNbY29sb3JBdHRhY2htZW50cy5sZW5ndGhdKVxuICAgIH1cblxuICAgIC8vIENoZWNrIHN0YXR1cyBjb2RlXG4gICAgdmFyIHN0YXR1cyA9IGdsLmNoZWNrRnJhbWVidWZmZXJTdGF0dXMoR0xfRlJBTUVCVUZGRVIpXG4gICAgaWYgKHN0YXR1cyAhPT0gR0xfRlJBTUVCVUZGRVJfQ09NUExFVEUpIHtcbiAgICAgIGNoZWNrLnJhaXNlKCdmcmFtZWJ1ZmZlciBjb25maWd1cmF0aW9uIG5vdCBzdXBwb3J0ZWQsIHN0YXR1cyA9ICcgK1xuICAgICAgICBzdGF0dXNDb2RlW3N0YXR1c10pXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZGVjRkJPUmVmcyAoZnJhbWVidWZmZXIpIHtcbiAgICBmcmFtZWJ1ZmZlci5jb2xvckF0dGFjaG1lbnRzLmZvckVhY2goZGVjUmVmKVxuICAgIGRlY1JlZihmcmFtZWJ1ZmZlci5kZXB0aEF0dGFjaG1lbnQpXG4gICAgZGVjUmVmKGZyYW1lYnVmZmVyLnN0ZW5jaWxBdHRhY2htZW50KVxuICAgIGRlY1JlZihmcmFtZWJ1ZmZlci5kZXB0aFN0ZW5jaWxBdHRhY2htZW50KVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSAoZnJhbWVidWZmZXIpIHtcbiAgICB2YXIgaGFuZGxlID0gZnJhbWVidWZmZXIuZnJhbWVidWZmZXJcbiAgICBjaGVjayhoYW5kbGUsICdtdXN0IG5vdCBkb3VibGUgZGVzdHJveSBmcmFtZWJ1ZmZlcicpXG4gICAgaWYgKGdsLmlzRnJhbWVidWZmZXIoaGFuZGxlKSkge1xuICAgICAgZ2wuZGVsZXRlRnJhbWVidWZmZXIoaGFuZGxlKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZUZCTyAob3B0aW9ucykge1xuICAgIHZhciBmcmFtZWJ1ZmZlciA9IG5ldyBSRUdMRnJhbWVidWZmZXIoKVxuXG4gICAgZnVuY3Rpb24gcmVnbEZyYW1lYnVmZmVyIChpbnB1dCkge1xuICAgICAgdmFyIGlcbiAgICAgIHZhciBvcHRpb25zID0gaW5wdXQgfHwge31cblxuICAgICAgdmFyIGV4dERyYXdCdWZmZXJzID0gZXh0ZW5zaW9ucy53ZWJnbF9kcmF3X2J1ZmZlcnNcblxuICAgICAgdmFyIHdpZHRoID0gMFxuICAgICAgdmFyIGhlaWdodCA9IDBcbiAgICAgIGlmICgnc2hhcGUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIHNoYXBlID0gb3B0aW9ucy5zaGFwZVxuICAgICAgICBjaGVjayhBcnJheS5pc0FycmF5KHNoYXBlKSAmJiBzaGFwZS5sZW5ndGggPj0gMixcbiAgICAgICAgICAnaW52YWxpZCBzaGFwZSBmb3IgZnJhbWVidWZmZXInKVxuICAgICAgICB3aWR0aCA9IHNoYXBlWzBdXG4gICAgICAgIGhlaWdodCA9IHNoYXBlWzFdXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoJ3JhZGl1cycgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHdpZHRoID0gaGVpZ2h0ID0gb3B0aW9ucy5yYWRpdXNcbiAgICAgICAgfVxuICAgICAgICBpZiAoJ3dpZHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgd2lkdGggPSBvcHRpb25zLndpZHRoXG4gICAgICAgIH1cbiAgICAgICAgaWYgKCdoZWlnaHQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBoZWlnaHQgPSBvcHRpb25zLmhlaWdodFxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIGNvbG9yVHlwZSwgbnVtQ29sb3JzXG4gICAgICB2YXIgY29sb3JCdWZmZXJzID0gbnVsbFxuICAgICAgdmFyIG93bnNDb2xvciA9IGZhbHNlXG4gICAgICBpZiAoJ2NvbG9yQnVmZmVycycgaW4gb3B0aW9ucyB8fCAnY29sb3JCdWZmZXInIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGNvbG9ySW5wdXRzID0gb3B0aW9ucy5jb2xvckJ1ZmZlcnMgfHwgb3B0aW9ucy5jb2xvckJ1ZmZlclxuICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkoY29sb3JJbnB1dHMpKSB7XG4gICAgICAgICAgY29sb3JJbnB1dHMgPSBbY29sb3JJbnB1dHNdXG4gICAgICAgIH1cblxuICAgICAgICBmcmFtZWJ1ZmZlci53aWR0aCA9IHdpZHRoXG4gICAgICAgIGZyYW1lYnVmZmVyLmhlaWdodCA9IGhlaWdodFxuXG4gICAgICAgIGlmIChjb2xvcklucHV0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgY2hlY2soZXh0RHJhd0J1ZmZlcnMsICdtdWx0aXBsZSByZW5kZXIgdGFyZ2V0cyBub3Qgc3VwcG9ydGVkJylcbiAgICAgICAgfVxuICAgICAgICBjaGVjayhjb2xvcklucHV0cy5sZW5ndGggPj0gMCxcbiAgICAgICAgICAnbXVzdCBzcGVjaWZ5IGF0IGxlYXN0IG9uZSBjb2xvciBhdHRhY2htZW50JylcblxuICAgICAgICAvLyBXcmFwIGNvbG9yIGF0dGFjaG1lbnRzXG4gICAgICAgIGNvbG9yQnVmZmVycyA9IGNvbG9ySW5wdXRzLm1hcChwYXJzZUF0dGFjaG1lbnQpXG5cbiAgICAgICAgLy8gQ2hlY2sgaGVhZCBub2RlXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xvckJ1ZmZlcnMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICB2YXIgY29sb3JBdHRhY2htZW50ID0gY29sb3JCdWZmZXJzW2ldXG4gICAgICAgICAgY2hlY2tGb3JtYXQoXG4gICAgICAgICAgICBjb2xvckF0dGFjaG1lbnQsXG4gICAgICAgICAgICBjb2xvclRleHR1cmVGb3JtYXRFbnVtcyxcbiAgICAgICAgICAgIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0RW51bXMpXG4gICAgICAgICAgaW5jUmVmQW5kQ2hlY2tTaGFwZShcbiAgICAgICAgICAgIGNvbG9yQXR0YWNobWVudCxcbiAgICAgICAgICAgIGZyYW1lYnVmZmVyKVxuICAgICAgICB9XG5cbiAgICAgICAgd2lkdGggPSBmcmFtZWJ1ZmZlci53aWR0aFxuICAgICAgICBoZWlnaHQgPSBmcmFtZWJ1ZmZlci5oZWlnaHRcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBjb2xvclRleHR1cmUgPSB0cnVlXG4gICAgICAgIHZhciBjb2xvckZvcm1hdCA9ICdyZ2JhJ1xuICAgICAgICB2YXIgY29sb3JUeXBlID0gJ3VpbnQ4J1xuICAgICAgICB2YXIgY29sb3JDb3VudCA9IDFcbiAgICAgICAgb3duc0NvbG9yID0gdHJ1ZVxuXG4gICAgICAgIGZyYW1lYnVmZmVyLndpZHRoID0gd2lkdGggfHwgZ2wuZHJhd2luZ0J1ZmZlcldpZHRoXG4gICAgICAgIGZyYW1lYnVmZmVyLmhlaWdodCA9IGhlaWdodCB8fCBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0XG5cbiAgICAgICAgaWYgKCdmb3JtYXQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBjb2xvckZvcm1hdCA9IG9wdGlvbnMuZm9ybWF0XG4gICAgICAgICAgY2hlY2sucGFyYW1ldGVyKGNvbG9yRm9ybWF0LCBjb2xvckZvcm1hdHMsICdpbnZhbGlkIGNvbG9yIGZvcm1hdCcpXG4gICAgICAgICAgY29sb3JUZXh0dXJlID0gY29sb3JGb3JtYXQgaW4gY29sb3JUZXh0dXJlRm9ybWF0c1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCd0eXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgY2hlY2soY29sb3JUZXh0dXJlLFxuICAgICAgICAgICAgJ2NvbG9yVHlwZSBjYW4gbm90IGJlIHNldCBmb3IgcmVuZGVyYnVmZmVyIHRhcmdldHMnKVxuICAgICAgICAgIGNvbG9yVHlwZSA9IG9wdGlvbnMudHlwZVxuICAgICAgICAgIGNoZWNrLnBhcmFtZXRlcihjb2xvclR5cGUsIGNvbG9yVHlwZXMsICdpbnZhbGlkIGNvbG9yIHR5cGUnKVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdjb2xvckNvdW50JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgY29sb3JDb3VudCA9IG9wdGlvbnMuY29sb3JDb3VudCB8IDBcbiAgICAgICAgICBjaGVjayhjb2xvckNvdW50ID49IDAsICdjb2xvciBjb3VudCBtdXN0IGJlIHBvc2l0aXZlJylcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFJldXNlIGNvbG9yIGJ1ZmZlciBhcnJheSBpZiB3ZSBvd24gaXRcbiAgICAgICAgaWYgKGZyYW1lYnVmZmVyLm93bnNDb2xvcikge1xuICAgICAgICAgIGNvbG9yQnVmZmVycyA9IGZyYW1lYnVmZmVyLmNvbG9yQXR0YWNobWVudHNcbiAgICAgICAgICB3aGlsZSAoY29sb3JCdWZmZXJzLmxlbmd0aCA+IGNvbG9yQ291bnQpIHtcbiAgICAgICAgICAgIGRlY1JlZihjb2xvckJ1ZmZlcnMucG9wKCkpXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbG9yQnVmZmVycyA9IFtdXG4gICAgICAgIH1cblxuICAgICAgICAvLyB1cGRhdGUgYnVmZmVycyBpbiBwbGFjZSwgcmVtb3ZlIGluY29tcGF0aWJsZSBidWZmZXJzXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xvckJ1ZmZlcnMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICBpZiAoIXRyeVVwZGF0ZUF0dGFjaG1lbnQoXG4gICAgICAgICAgICAgIGNvbG9yQnVmZmVyc1tpXSxcbiAgICAgICAgICAgICAgY29sb3JUZXh0dXJlLFxuICAgICAgICAgICAgICBjb2xvckZvcm1hdCxcbiAgICAgICAgICAgICAgY29sb3JUeXBlLFxuICAgICAgICAgICAgICB3aWR0aCxcbiAgICAgICAgICAgICAgaGVpZ2h0KSkge1xuICAgICAgICAgICAgY29sb3JCdWZmZXJzW2ktLV0gPSBjb2xvckJ1ZmZlcnNbY29sb3JCdWZmZXJzLmxlbmd0aCAtIDFdXG4gICAgICAgICAgICBjb2xvckJ1ZmZlcnMucG9wKClcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBUaGVuIGFwcGVuZCBuZXcgYnVmZmVyc1xuICAgICAgICB3aGlsZSAoY29sb3JCdWZmZXJzLmxlbmd0aCA8IGNvbG9yQ291bnQpIHtcbiAgICAgICAgICBpZiAoY29sb3JUZXh0dXJlKSB7XG4gICAgICAgICAgICBjb2xvckJ1ZmZlcnMucHVzaChuZXcgRnJhbWVidWZmZXJBdHRhY2htZW50KFxuICAgICAgICAgICAgICBHTF9URVhUVVJFXzJELFxuICAgICAgICAgICAgICAwLFxuICAgICAgICAgICAgICB0ZXh0dXJlU3RhdGUuY3JlYXRlKHtcbiAgICAgICAgICAgICAgICBmb3JtYXQ6IGNvbG9yRm9ybWF0LFxuICAgICAgICAgICAgICAgIHR5cGU6IGNvbG9yVHlwZSxcbiAgICAgICAgICAgICAgICB3aWR0aDogd2lkdGgsXG4gICAgICAgICAgICAgICAgaGVpZ2h0OiBoZWlnaHRcbiAgICAgICAgICAgICAgfSwgR0xfVEVYVFVSRV8yRCksXG4gICAgICAgICAgICAgIG51bGwpKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb2xvckJ1ZmZlcnMucHVzaChuZXcgRnJhbWVidWZmZXJBdHRhY2htZW50KFxuICAgICAgICAgICAgICBHTF9SRU5ERVJCVUZGRVIsXG4gICAgICAgICAgICAgIDAsXG4gICAgICAgICAgICAgIG51bGwsXG4gICAgICAgICAgICAgIHJlbmRlcmJ1ZmZlclN0YXRlLmNyZWF0ZSh7XG4gICAgICAgICAgICAgICAgZm9ybWF0OiBjb2xvckZvcm1hdCxcbiAgICAgICAgICAgICAgICB3aWR0aDogd2lkdGgsXG4gICAgICAgICAgICAgICAgaGVpZ2h0OiBoZWlnaHRcbiAgICAgICAgICAgICAgfSkpKVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjaGVjayhjb2xvckJ1ZmZlcnMubGVuZ3RoID4gMCwgJ211c3Qgc3BlY2lmeSBhdCBsZWFzdCBvbmUgY29sb3IgYnVmZmVyJylcblxuICAgICAgZnJhbWVidWZmZXIud2lkdGggPSB3aWR0aFxuICAgICAgZnJhbWVidWZmZXIuaGVpZ2h0ID0gaGVpZ2h0XG5cbiAgICAgIHZhciBkZXB0aEJ1ZmZlciA9IG51bGxcbiAgICAgIHZhciBzdGVuY2lsQnVmZmVyID0gbnVsbFxuICAgICAgdmFyIGRlcHRoU3RlbmNpbEJ1ZmZlciA9IG51bGxcbiAgICAgIHZhciBvd25zRGVwdGhTdGVuY2lsID0gZmFsc2VcbiAgICAgIHZhciBkZXB0aFN0ZW5jaWxDb3VudCA9IDBcblxuICAgICAgaWYgKCdkZXB0aEJ1ZmZlcicgaW4gb3B0aW9ucykge1xuICAgICAgICBkZXB0aEJ1ZmZlciA9IHBhcnNlQXR0YWNobWVudChvcHRpb25zLmRlcHRoQnVmZmVyKVxuICAgICAgICBjaGVja0Zvcm1hdChcbiAgICAgICAgICBkZXB0aEJ1ZmZlcixcbiAgICAgICAgICBkZXB0aFRleHR1cmVGb3JtYXRFbnVtcyxcbiAgICAgICAgICBkZXB0aFJlbmRlcmJ1ZmZlckZvcm1hdEVudW1zKVxuICAgICAgICBkZXB0aFN0ZW5jaWxDb3VudCArPSAxXG4gICAgICB9XG4gICAgICBpZiAoJ3N0ZW5jaWxCdWZmZXInIGluIG9wdGlvbnMpIHtcbiAgICAgICAgc3RlbmNpbEJ1ZmZlciA9IHBhcnNlQXR0YWNobWVudChvcHRpb25zLnN0ZW5jaWxCdWZmZXIpXG4gICAgICAgIGNoZWNrRm9ybWF0KFxuICAgICAgICAgIHN0ZW5jaWxCdWZmZXIsXG4gICAgICAgICAgc3RlbmNpbFRleHR1cmVGb3JtYXRFbnVtcyxcbiAgICAgICAgICBzdGVuY2lsUmVuZGVyYnVmZmVyRm9ybWF0RW51bXMpXG4gICAgICAgIGRlcHRoU3RlbmNpbENvdW50ICs9IDFcbiAgICAgIH1cbiAgICAgIGlmICgnZGVwdGhTdGVuY2lsQnVmZmVyJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIGRlcHRoU3RlbmNpbEJ1ZmZlciA9IHBhcnNlQXR0YWNobWVudChvcHRpb25zLmRlcHRoU3RlbmNpbEJ1ZmZlcilcbiAgICAgICAgY2hlY2tGb3JtYXQoXG4gICAgICAgICAgZGVwdGhTdGVuY2lsQnVmZmVyLFxuICAgICAgICAgIGRlcHRoU3RlbmNpbFRleHR1cmVGb3JtYXRFbnVtcyxcbiAgICAgICAgICBkZXB0aFN0ZW5jaWxSZW5kZXJidWZmZXJGb3JtYXRFbnVtcylcbiAgICAgICAgZGVwdGhTdGVuY2lsQ291bnQgKz0gMVxuICAgICAgfVxuXG4gICAgICBpZiAoIShkZXB0aEJ1ZmZlciB8fCBzdGVuY2lsQnVmZmVyIHx8IGRlcHRoU3RlbmNpbEJ1ZmZlcikpIHtcbiAgICAgICAgdmFyIGRlcHRoID0gdHJ1ZVxuICAgICAgICB2YXIgc3RlbmNpbCA9IGZhbHNlXG4gICAgICAgIHZhciB1c2VUZXh0dXJlID0gZmFsc2VcblxuICAgICAgICBpZiAoJ2RlcHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgZGVwdGggPSAhIW9wdGlvbnMuZGVwdGhcbiAgICAgICAgfVxuICAgICAgICBpZiAoJ3N0ZW5jaWwnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBzdGVuY2lsID0gISFvcHRpb25zLnN0ZW5jaWxcbiAgICAgICAgfVxuICAgICAgICBpZiAoJ2RlcHRoVGV4dHVyZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHVzZVRleHR1cmUgPSAhIW9wdGlvbnMuZGVwdGhUZXh0dXJlXG4gICAgICAgIH1cblxuICAgICAgICB2YXIgY3VyRGVwdGhTdGVuY2lsID1cbiAgICAgICAgICBmcmFtZWJ1ZmZlci5kZXB0aEF0dGFjaG1lbnQgfHxcbiAgICAgICAgICBmcmFtZWJ1ZmZlci5zdGVuY2lsQXR0YWNobWVudCB8fFxuICAgICAgICAgIGZyYW1lYnVmZmVyLmRlcHRoU3RlbmNpbEF0dGFjaG1lbnRcbiAgICAgICAgdmFyIG5leHREZXB0aFN0ZW5jaWwgPSBudWxsXG5cbiAgICAgICAgaWYgKGRlcHRoIHx8IHN0ZW5jaWwpIHtcbiAgICAgICAgICBvd25zRGVwdGhTdGVuY2lsID0gdHJ1ZVxuXG4gICAgICAgICAgaWYgKHVzZVRleHR1cmUpIHtcbiAgICAgICAgICAgIGNoZWNrKGV4dGVuc2lvbnMud2ViZ2xfZGVwdGhfdGV4dHVyZSxcbiAgICAgICAgICAgICAgJ2RlcHRoIHRleHR1cmUgZXh0ZW5zaW9uIG5vdCBzdXBwb3J0ZWQnKVxuICAgICAgICAgICAgdmFyIGRlcHRoVGV4dHVyZUZvcm1hdFxuICAgICAgICAgICAgY2hlY2soZGVwdGgsICdzdGVuY2lsIG9ubHkgdGV4dHVyZXMgbm90IHN1cHBvcnRlZCcpXG4gICAgICAgICAgICBpZiAoc3RlbmNpbCkge1xuICAgICAgICAgICAgICBkZXB0aFRleHR1cmVGb3JtYXQgPSAnZGVwdGggc3RlbmNpbCdcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGRlcHRoVGV4dHVyZUZvcm1hdCA9ICdkZXB0aCdcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChmcmFtZWJ1ZmZlci5vd25zRGVwdGhTdGVuY2lsICYmIGN1ckRlcHRoU3RlbmNpbC50ZXh0dXJlKSB7XG4gICAgICAgICAgICAgIGN1ckRlcHRoU3RlbmNpbC50ZXh0dXJlKHtcbiAgICAgICAgICAgICAgICBmb3JtYXQ6IGRlcHRoVGV4dHVyZUZvcm1hdCxcbiAgICAgICAgICAgICAgICB3aWR0aDogd2lkdGgsXG4gICAgICAgICAgICAgICAgaGVpZ2h0OiBoZWlnaHRcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgY3VyRGVwdGhTdGVuY2lsLnRleHR1cmUuX3RleHR1cmUucmVmQ291bnQgKz0gMVxuICAgICAgICAgICAgICBuZXh0RGVwdGhTdGVuY2lsID0gY3VyRGVwdGhTdGVuY2lsXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBuZXh0RGVwdGhTdGVuY2lsID0gbmV3IEZyYW1lYnVmZmVyQXR0YWNobWVudChcbiAgICAgICAgICAgICAgICBHTF9URVhUVVJFXzJELFxuICAgICAgICAgICAgICAgIDAsXG4gICAgICAgICAgICAgICAgdGV4dHVyZVN0YXRlLmNyZWF0ZSh7XG4gICAgICAgICAgICAgICAgICBmb3JtYXQ6IGRlcHRoVGV4dHVyZUZvcm1hdCxcbiAgICAgICAgICAgICAgICAgIHdpZHRoOiB3aWR0aCxcbiAgICAgICAgICAgICAgICAgIGhlaWdodDogaGVpZ2h0XG4gICAgICAgICAgICAgICAgfSwgR0xfVEVYVFVSRV8yRCksXG4gICAgICAgICAgICAgICAgbnVsbClcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFyIGRlcHRoUmVuZGVyYnVmZmVyRm9ybWF0XG4gICAgICAgICAgICBpZiAoZGVwdGgpIHtcbiAgICAgICAgICAgICAgaWYgKHN0ZW5jaWwpIHtcbiAgICAgICAgICAgICAgICBkZXB0aFJlbmRlcmJ1ZmZlckZvcm1hdCA9ICdkZXB0aCBzdGVuY2lsJ1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGRlcHRoUmVuZGVyYnVmZmVyRm9ybWF0ID0gJ2RlcHRoJ1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBkZXB0aFJlbmRlcmJ1ZmZlckZvcm1hdCA9ICdzdGVuY2lsJ1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGZyYW1lYnVmZmVyLm93bnNEZXB0aFN0ZW5jaWwgJiYgY3VyRGVwdGhTdGVuY2lsLnJlbmRlcmJ1ZmZlcikge1xuICAgICAgICAgICAgICBjdXJEZXB0aFN0ZW5jaWwucmVuZGVyYnVmZmVyKHtcbiAgICAgICAgICAgICAgICBmb3JtYXQ6IGRlcHRoUmVuZGVyYnVmZmVyRm9ybWF0LFxuICAgICAgICAgICAgICAgIHdpZHRoOiB3aWR0aCxcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IGhlaWdodFxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICBjdXJEZXB0aFN0ZW5jaWwucmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXIucmVmQ291bnQgKz0gMVxuICAgICAgICAgICAgICBuZXh0RGVwdGhTdGVuY2lsID0gY3VyRGVwdGhTdGVuY2lsXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBuZXh0RGVwdGhTdGVuY2lsID0gbmV3IEZyYW1lYnVmZmVyQXR0YWNobWVudChcbiAgICAgICAgICAgICAgICBHTF9SRU5ERVJCVUZGRVIsXG4gICAgICAgICAgICAgICAgMCxcbiAgICAgICAgICAgICAgICBudWxsLFxuICAgICAgICAgICAgICAgIHJlbmRlcmJ1ZmZlclN0YXRlLmNyZWF0ZSh7XG4gICAgICAgICAgICAgICAgICBmb3JtYXQ6IGRlcHRoUmVuZGVyYnVmZmVyRm9ybWF0LFxuICAgICAgICAgICAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICAgICAgICAgICAgaGVpZ2h0OiBoZWlnaHRcbiAgICAgICAgICAgICAgICB9KSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoZGVwdGgpIHtcbiAgICAgICAgICAgIGlmIChzdGVuY2lsKSB7XG4gICAgICAgICAgICAgIGRlcHRoU3RlbmNpbEJ1ZmZlciA9IG5leHREZXB0aFN0ZW5jaWxcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGRlcHRoQnVmZmVyID0gbmV4dERlcHRoU3RlbmNpbFxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzdGVuY2lsQnVmZmVyID0gbmV4dERlcHRoU3RlbmNpbFxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY2hlY2soZGVwdGhTdGVuY2lsQ291bnQgPT09IDEsXG4gICAgICAgICAgJ2NhbiBzcGVjaWZ5IG9ubHkgb25lIG9mIGRlcHRoLCBzdGVuY2lsIG9yIGRlcHRoU3RlbmNpbCBhdHRhY2htZW50JylcblxuICAgICAgICBpbmNSZWZBbmRDaGVja1NoYXBlKFxuICAgICAgICAgIGRlcHRoQnVmZmVyIHx8XG4gICAgICAgICAgc3RlbmNpbEJ1ZmZlciB8fFxuICAgICAgICAgIGRlcHRoU3RlbmNpbEJ1ZmZlcixcbiAgICAgICAgICBmcmFtZWJ1ZmZlcilcbiAgICAgIH1cblxuICAgICAgZGVjRkJPUmVmcyhmcmFtZWJ1ZmZlcilcblxuICAgICAgZnJhbWVidWZmZXIuY29sb3JBdHRhY2htZW50cyA9IGNvbG9yQnVmZmVyc1xuICAgICAgZnJhbWVidWZmZXIuZGVwdGhBdHRhY2htZW50ID0gZGVwdGhCdWZmZXJcbiAgICAgIGZyYW1lYnVmZmVyLnN0ZW5jaWxBdHRhY2htZW50ID0gc3RlbmNpbEJ1ZmZlclxuICAgICAgZnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsQXR0YWNobWVudCA9IGRlcHRoU3RlbmNpbEJ1ZmZlclxuICAgICAgZnJhbWVidWZmZXIub3duc0NvbG9yID0gb3duc0NvbG9yXG4gICAgICBmcmFtZWJ1ZmZlci5vd25zRGVwdGhTdGVuY2lsID0gb3duc0RlcHRoU3RlbmNpbFxuXG4gICAgICByZWdsRnJhbWVidWZmZXIuY29sb3IgPSBjb2xvckJ1ZmZlcnMubWFwKHVud3JhcEF0dGFjaG1lbnQpXG4gICAgICByZWdsRnJhbWVidWZmZXIuZGVwdGggPSB1bndyYXBBdHRhY2htZW50KGRlcHRoQnVmZmVyKVxuICAgICAgcmVnbEZyYW1lYnVmZmVyLnN0ZW5jaWwgPSB1bndyYXBBdHRhY2htZW50KHN0ZW5jaWxCdWZmZXIpXG4gICAgICByZWdsRnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsID0gdW53cmFwQXR0YWNobWVudChkZXB0aFN0ZW5jaWxCdWZmZXIpXG5cbiAgICAgIHJlZnJlc2goZnJhbWVidWZmZXIpXG5cbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci53aWR0aCA9IGZyYW1lYnVmZmVyLndpZHRoXG4gICAgICByZWdsRnJhbWVidWZmZXIuaGVpZ2h0ID0gZnJhbWVidWZmZXIuaGVpZ2h0XG5cbiAgICAgIHJldHVybiByZWdsRnJhbWVidWZmZXJcbiAgICB9XG5cbiAgICByZWdsRnJhbWVidWZmZXIob3B0aW9ucylcblxuICAgIE9iamVjdC5hc3NpZ24ocmVnbEZyYW1lYnVmZmVyLCB7XG4gICAgICBfcmVnbFR5cGU6ICdmcmFtZWJ1ZmZlcicsXG4gICAgICBfZnJhbWVidWZmZXI6IGZyYW1lYnVmZmVyLFxuICAgICAgZGVzdHJveTogZnVuY3Rpb24gKCkge1xuICAgICAgICBkZXN0cm95KGZyYW1lYnVmZmVyKVxuICAgICAgfVxuICAgIH0pXG5cbiAgICByZXR1cm4gcmVnbEZyYW1lYnVmZmVyXG4gIH1cblxuICBmdW5jdGlvbiByZWZyZXNoQ2FjaGUgKCkge1xuICAgIHZhbHVlcyhmcmFtZWJ1ZmZlclNldCkuZm9yRWFjaChyZWZyZXNoKVxuICB9XG5cbiAgZnVuY3Rpb24gY2xlYXJDYWNoZSAoKSB7XG4gICAgdmFsdWVzKGZyYW1lYnVmZmVyU2V0KS5mb3JFYWNoKGRlc3Ryb3kpXG4gIH1cblxuICBmdW5jdGlvbiBwb2xsICgpIHtcbiAgICBpZiAoZnJhbWVidWZmZXJEaXJ0eSkge1xuICAgICAgdmFyIHRvcCA9IGZyYW1lYnVmZmVyU3RhY2tbZnJhbWVidWZmZXJTdGFjay5sZW5ndGggLSAxXVxuICAgICAgdmFyIGV4dF9kcmF3YnVmZmVycyA9IGV4dGVuc2lvbnMud2ViZ2xfZHJhd19idWZmZXJzXG5cbiAgICAgIGlmICh0b3ApIHtcbiAgICAgICAgZ2wuYmluZEZyYW1lYnVmZmVyKEdMX0ZSQU1FQlVGRkVSLCB0b3AuZnJhbWVidWZmZXIpXG4gICAgICAgIGlmIChleHRfZHJhd2J1ZmZlcnMpIHtcbiAgICAgICAgICBleHRfZHJhd2J1ZmZlcnMuZHJhd0J1ZmZlcnNXRUJHTChEUkFXX0JVRkZFUlNbdG9wLmNvbG9yQXR0YWNobWVudHMubGVuZ3RoXSlcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZ2wuYmluZEZyYW1lYnVmZmVyKEdMX0ZSQU1FQlVGRkVSLCBudWxsKVxuICAgICAgICBpZiAoZXh0X2RyYXdidWZmZXJzKSB7XG4gICAgICAgICAgZXh0X2RyYXdidWZmZXJzLmRyYXdCdWZmZXJzV0VCR0woQkFDS19CVUZGRVIpXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgZnJhbWVidWZmZXJEaXJ0eSA9IGZhbHNlXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gY3VycmVudEZyYW1lYnVmZmVyICgpIHtcbiAgICByZXR1cm4gZnJhbWVidWZmZXJTdGFja1tmcmFtZWJ1ZmZlclN0YWNrLmxlbmd0aCAtIDFdXG4gIH1cblxuICByZXR1cm4ge1xuICAgIHRvcDogY3VycmVudEZyYW1lYnVmZmVyLFxuICAgIGRpcnR5OiBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gZnJhbWVidWZmZXJEaXJ0eVxuICAgIH0sXG4gICAgcHVzaDogZnVuY3Rpb24gKG5leHRfKSB7XG4gICAgICB2YXIgbmV4dCA9IG5leHRfIHx8IG51bGxcbiAgICAgIGZyYW1lYnVmZmVyRGlydHkgPSBmcmFtZWJ1ZmZlckRpcnR5IHx8IChuZXh0ICE9PSBjdXJyZW50RnJhbWVidWZmZXIoKSlcbiAgICAgIGZyYW1lYnVmZmVyU3RhY2sucHVzaChuZXh0KVxuICAgICAgcmV0dXJuIGZyYW1lYnVmZmVyRGlydHlcbiAgICB9LFxuICAgIHBvcDogZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIHByZXYgPSBjdXJyZW50RnJhbWVidWZmZXIoKVxuICAgICAgZnJhbWVidWZmZXJTdGFjay5wb3AoKVxuICAgICAgZnJhbWVidWZmZXJEaXJ0eSA9IGZyYW1lYnVmZmVyRGlydHkgfHwgKHByZXYgIT09IGN1cnJlbnRGcmFtZWJ1ZmZlcigpKVxuICAgICAgcmV0dXJuIGZyYW1lYnVmZmVyRGlydHlcbiAgICB9LFxuICAgIGdldEZyYW1lYnVmZmVyOiBmdW5jdGlvbiAob2JqZWN0KSB7XG4gICAgICBpZiAodHlwZW9mIG9iamVjdCA9PT0gJ2Z1bmN0aW9uJyAmJiBvYmplY3QuX3JlZ2xUeXBlID09PSAnZnJhbWVidWZmZXInKSB7XG4gICAgICAgIHZhciBmYm8gPSBvYmplY3QuX2ZyYW1lYnVmZmVyXG4gICAgICAgIGlmIChmYm8gaW5zdGFuY2VvZiBSRUdMRnJhbWVidWZmZXIpIHtcbiAgICAgICAgICByZXR1cm4gZmJvXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsXG4gICAgfSxcbiAgICBwb2xsOiBwb2xsLFxuICAgIGNyZWF0ZTogY3JlYXRlRkJPLFxuICAgIGNsZWFyOiBjbGVhckNhY2hlLFxuICAgIHJlZnJlc2g6IHJlZnJlc2hDYWNoZVxuICB9XG59XG4iLCJ2YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi9pcy10eXBlZC1hcnJheScpXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaXNOREFycmF5TGlrZSAob2JqKSB7XG4gIHJldHVybiAoXG4gICAgdHlwZW9mIG9iaiA9PT0gJ29iamVjdCcgJiZcbiAgICBBcnJheS5pc0FycmF5KG9iai5zaGFwZSkgJiZcbiAgICBBcnJheS5pc0FycmF5KG9iai5zdHJpZGUpICYmXG4gICAgdHlwZW9mIG9iai5vZmZzZXQgPT09ICdudW1iZXInICYmXG4gICAgb2JqLnNoYXBlLmxlbmd0aCA9PT0gb2JqLnN0cmlkZS5sZW5ndGggJiZcbiAgICAoQXJyYXkuaXNBcnJheShvYmouZGF0YSkgfHxcbiAgICAgIGlzVHlwZWRBcnJheShvYmouZGF0YSkpKVxufVxuIiwidmFyIGR0eXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL2FycmF5dHlwZXMuanNvbicpXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uICh4KSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoeCkgaW4gZHR5cGVzXG59XG4iLCJ2YXIgR0xfU1VCUElYRUxfQklUUyA9IDB4MEQ1MFxudmFyIEdMX1JFRF9CSVRTID0gMHgwRDUyXG52YXIgR0xfR1JFRU5fQklUUyA9IDB4MEQ1M1xudmFyIEdMX0JMVUVfQklUUyA9IDB4MEQ1NFxudmFyIEdMX0FMUEhBX0JJVFMgPSAweDBENTVcbnZhciBHTF9ERVBUSF9CSVRTID0gMHgwRDU2XG52YXIgR0xfU1RFTkNJTF9CSVRTID0gMHgwRDU3XG5cbnZhciBHTF9BTElBU0VEX1BPSU5UX1NJWkVfUkFOR0UgPSAweDg0NkRcbnZhciBHTF9BTElBU0VEX0xJTkVfV0lEVEhfUkFOR0UgPSAweDg0NkVcblxudmFyIEdMX01BWF9URVhUVVJFX1NJWkUgPSAweDBEMzNcbnZhciBHTF9NQVhfVklFV1BPUlRfRElNUyA9IDB4MEQzQVxudmFyIEdMX01BWF9WRVJURVhfQVRUUklCUyA9IDB4ODg2OVxudmFyIEdMX01BWF9WRVJURVhfVU5JRk9STV9WRUNUT1JTID0gMHg4REZCXG52YXIgR0xfTUFYX1ZBUllJTkdfVkVDVE9SUyA9IDB4OERGQ1xudmFyIEdMX01BWF9DT01CSU5FRF9URVhUVVJFX0lNQUdFX1VOSVRTID0gMHg4QjREXG52YXIgR0xfTUFYX1ZFUlRFWF9URVhUVVJFX0lNQUdFX1VOSVRTID0gMHg4QjRDXG52YXIgR0xfTUFYX1RFWFRVUkVfSU1BR0VfVU5JVFMgPSAweDg4NzJcbnZhciBHTF9NQVhfRlJBR01FTlRfVU5JRk9STV9WRUNUT1JTID0gMHg4REZEXG52YXIgR0xfTUFYX0NVQkVfTUFQX1RFWFRVUkVfU0laRSA9IDB4ODUxQ1xudmFyIEdMX01BWF9SRU5ERVJCVUZGRVJfU0laRSA9IDB4ODRFOFxuXG52YXIgR0xfVkVORE9SID0gMHgxRjAwXG52YXIgR0xfUkVOREVSRVIgPSAweDFGMDFcbnZhciBHTF9WRVJTSU9OID0gMHgxRjAyXG52YXIgR0xfU0hBRElOR19MQU5HVUFHRV9WRVJTSU9OID0gMHg4QjhDXG5cbnZhciBHTF9NQVhfVEVYVFVSRV9NQVhfQU5JU09UUk9QWV9FWFQgPSAweDg0RkZcblxudmFyIEdMX01BWF9DT0xPUl9BVFRBQ0hNRU5UU19XRUJHTCA9IDB4OENERlxudmFyIEdMX01BWF9EUkFXX0JVRkZFUlNfV0VCR0wgPSAweDg4MjRcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoZ2wsIGV4dGVuc2lvbnMpIHtcbiAgdmFyIG1heEFuaXNvdHJvcGljID0gMVxuICBpZiAoZXh0ZW5zaW9ucy5leHRfdGV4dHVyZV9maWx0ZXJfYW5pc290cm9waWMpIHtcbiAgICBtYXhBbmlzb3Ryb3BpYyA9IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVEVYVFVSRV9NQVhfQU5JU09UUk9QWV9FWFQpXG4gIH1cblxuICB2YXIgbWF4RHJhd2J1ZmZlcnMgPSAxXG4gIHZhciBtYXhDb2xvckF0dGFjaG1lbnRzID0gMVxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9kcmF3X2J1ZmZlcnMpIHtcbiAgICBtYXhEcmF3YnVmZmVycyA9IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfRFJBV19CVUZGRVJTX1dFQkdMKVxuICAgIG1heENvbG9yQXR0YWNobWVudHMgPSBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0NPTE9SX0FUVEFDSE1FTlRTX1dFQkdMKVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICAvLyBkcmF3aW5nIGJ1ZmZlciBiaXQgZGVwdGhcbiAgICBjb2xvckJpdHM6IFtcbiAgICAgIGdsLmdldFBhcmFtZXRlcihHTF9SRURfQklUUyksXG4gICAgICBnbC5nZXRQYXJhbWV0ZXIoR0xfR1JFRU5fQklUUyksXG4gICAgICBnbC5nZXRQYXJhbWV0ZXIoR0xfQkxVRV9CSVRTKSxcbiAgICAgIGdsLmdldFBhcmFtZXRlcihHTF9BTFBIQV9CSVRTKVxuICAgIF0sXG4gICAgZGVwdGhCaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfREVQVEhfQklUUyksXG4gICAgc3RlbmNpbEJpdHM6IGdsLmdldFBhcmFtZXRlcihHTF9TVEVOQ0lMX0JJVFMpLFxuICAgIHN1YnBpeGVsQml0czogZ2wuZ2V0UGFyYW1ldGVyKEdMX1NVQlBJWEVMX0JJVFMpLFxuXG4gICAgLy8gc3VwcG9ydGVkIGV4dGVuc2lvbnNcbiAgICBleHRlbnNpb25zOiBPYmplY3Qua2V5cyhleHRlbnNpb25zKS5maWx0ZXIoZnVuY3Rpb24gKGV4dCkge1xuICAgICAgcmV0dXJuICEhZXh0ZW5zaW9uc1tleHRdXG4gICAgfSksXG5cbiAgICAvLyBtYXggYW5pc28gc2FtcGxlc1xuICAgIG1heEFuaXNvdHJvcGljOiBtYXhBbmlzb3Ryb3BpYyxcblxuICAgIC8vIG1heCBkcmF3IGJ1ZmZlcnNcbiAgICBtYXhEcmF3YnVmZmVyczogbWF4RHJhd2J1ZmZlcnMsXG4gICAgbWF4Q29sb3JBdHRhY2htZW50czogbWF4Q29sb3JBdHRhY2htZW50cyxcblxuICAgIC8vIHBvaW50IGFuZCBsaW5lIHNpemUgcmFuZ2VzXG4gICAgcG9pbnRTaXplRGltczogZ2wuZ2V0UGFyYW1ldGVyKEdMX0FMSUFTRURfUE9JTlRfU0laRV9SQU5HRSksXG4gICAgbGluZVdpZHRoRGltczogZ2wuZ2V0UGFyYW1ldGVyKEdMX0FMSUFTRURfTElORV9XSURUSF9SQU5HRSksXG4gICAgbWF4Vmlld3BvcnREaW1zOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1ZJRVdQT1JUX0RJTVMpLFxuICAgIG1heENvbWJpbmVkVGV4dHVyZVVuaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0NPTUJJTkVEX1RFWFRVUkVfSU1BR0VfVU5JVFMpLFxuICAgIG1heEN1YmVNYXBTaXplOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0NVQkVfTUFQX1RFWFRVUkVfU0laRSksXG4gICAgbWF4UmVuZGVyYnVmZmVyU2l6ZTogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9SRU5ERVJCVUZGRVJfU0laRSksXG4gICAgbWF4VGV4dHVyZVVuaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1RFWFRVUkVfSU1BR0VfVU5JVFMpLFxuICAgIG1heFRleHR1cmVTaXplOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1RFWFRVUkVfU0laRSksXG4gICAgbWF4QXR0cmlidXRlczogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9WRVJURVhfQVRUUklCUyksXG4gICAgbWF4VmVydGV4VW5pZm9ybXM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVkVSVEVYX1VOSUZPUk1fVkVDVE9SUyksXG4gICAgbWF4VmVydGV4VGV4dHVyZVVuaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1ZFUlRFWF9URVhUVVJFX0lNQUdFX1VOSVRTKSxcbiAgICBtYXhWYXJ5aW5nVmVjdG9yczogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9WQVJZSU5HX1ZFQ1RPUlMpLFxuICAgIG1heEZyYWdtZW50VW5pZm9ybXM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfRlJBR01FTlRfVU5JRk9STV9WRUNUT1JTKSxcblxuICAgIC8vIHZlbmRvciBpbmZvXG4gICAgZ2xzbDogZ2wuZ2V0UGFyYW1ldGVyKEdMX1NIQURJTkdfTEFOR1VBR0VfVkVSU0lPTiksXG4gICAgcmVuZGVyZXI6IGdsLmdldFBhcmFtZXRlcihHTF9SRU5ERVJFUiksXG4gICAgdmVuZG9yOiBnbC5nZXRQYXJhbWV0ZXIoR0xfVkVORE9SKSxcbiAgICB2ZXJzaW9uOiBnbC5nZXRQYXJhbWV0ZXIoR0xfVkVSU0lPTilcbiAgfVxufVxuIiwiLyogZ2xvYmFscyBkb2N1bWVudCwgSW1hZ2UsIFhNTEh0dHBSZXF1ZXN0ICovXG5cbm1vZHVsZS5leHBvcnRzID0gbG9hZFRleHR1cmVcblxuZnVuY3Rpb24gZ2V0RXh0ZW5zaW9uICh1cmwpIHtcbiAgdmFyIHBhcnRzID0gL1xcLihcXHcrKShcXD8uKik/JC8uZXhlYyh1cmwpXG4gIGlmIChwYXJ0cyAmJiBwYXJ0c1sxXSkge1xuICAgIHJldHVybiBwYXJ0c1sxXS50b0xvd2VyQ2FzZSgpXG4gIH1cbn1cblxuZnVuY3Rpb24gaXNWaWRlb0V4dGVuc2lvbiAodXJsKSB7XG4gIHJldHVybiBbXG4gICAgJ2F2aScsXG4gICAgJ2FzZicsXG4gICAgJ2dpZnYnLFxuICAgICdtb3YnLFxuICAgICdxdCcsXG4gICAgJ3l1dicsXG4gICAgJ21wZycsXG4gICAgJ21wZWcnLFxuICAgICdtMnYnLFxuICAgICdtcDQnLFxuICAgICdtNHAnLFxuICAgICdtNHYnLFxuICAgICdvZ2cnLFxuICAgICdvZ3YnLFxuICAgICd2b2InLFxuICAgICd3ZWJtJyxcbiAgICAnd212J1xuICBdLmluZGV4T2YodXJsKSA+PSAwXG59XG5cbmZ1bmN0aW9uIGlzQ29tcHJlc3NlZEV4dGVuc2lvbiAodXJsKSB7XG4gIHJldHVybiBbXG4gICAgJ2RkcydcbiAgXS5pbmRleE9mKHVybCkgPj0gMFxufVxuXG5mdW5jdGlvbiBsb2FkVmlkZW8gKHVybCwgY3Jvc3NPcmlnaW4pIHtcbiAgdmFyIHZpZGVvID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndmlkZW8nKVxuICB2aWRlby5hdXRvcGxheSA9IHRydWVcbiAgdmlkZW8ubG9vcCA9IHRydWVcbiAgaWYgKGNyb3NzT3JpZ2luKSB7XG4gICAgdmlkZW8uY3Jvc3NPcmlnaW4gPSBjcm9zc09yaWdpblxuICB9XG4gIHZpZGVvLnNyYyA9IHVybFxuICByZXR1cm4gdmlkZW9cbn1cblxuZnVuY3Rpb24gbG9hZENvbXByZXNzZWRUZXh0dXJlICh1cmwsIGV4dCwgY3Jvc3NPcmlnaW4pIHtcbiAgdmFyIHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpXG4gIHhoci5yZXNwb25zZVR5cGUgPSAnYXJyYXlidWZmZXInXG4gIHhoci5vcGVuKCdHRVQnLCB1cmwsIHRydWUpXG4gIHhoci5zZW5kKClcbiAgcmV0dXJuIHhoclxufVxuXG5mdW5jdGlvbiBsb2FkSW1hZ2UgKHVybCwgY3Jvc3NPcmlnaW4pIHtcbiAgdmFyIGltYWdlID0gbmV3IEltYWdlKClcbiAgaWYgKGNyb3NzT3JpZ2luKSB7XG4gICAgaW1hZ2UuY3Jvc3NPcmlnaW4gPSBjcm9zc09yaWdpblxuICB9XG4gIGltYWdlLnNyYyA9IHVybFxuICByZXR1cm4gaW1hZ2Vcbn1cblxuLy8gQ3VycmVudGx5IHRoaXMgc3R1ZmYgb25seSB3b3JrcyBpbiBhIERPTSBlbnZpcm9ubWVudFxuZnVuY3Rpb24gbG9hZFRleHR1cmUgKHVybCwgY3Jvc3NPcmlnaW4pIHtcbiAgaWYgKHR5cGVvZiBkb2N1bWVudCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICB2YXIgZXh0ID0gZ2V0RXh0ZW5zaW9uKHVybClcbiAgICBpZiAoaXNWaWRlb0V4dGVuc2lvbihleHQpKSB7XG4gICAgICByZXR1cm4gbG9hZFZpZGVvKHVybCwgY3Jvc3NPcmlnaW4pXG4gICAgfVxuICAgIGlmIChpc0NvbXByZXNzZWRFeHRlbnNpb24oZXh0KSkge1xuICAgICAgcmV0dXJuIGxvYWRDb21wcmVzc2VkVGV4dHVyZSh1cmwsIGV4dCwgY3Jvc3NPcmlnaW4pXG4gICAgfVxuICAgIHJldHVybiBsb2FkSW1hZ2UodXJsLCBjcm9zc09yaWdpbilcbiAgfVxuICByZXR1cm4gbnVsbFxufVxuIiwiLy8gUmVmZXJlbmNlczpcbi8vXG4vLyBodHRwOi8vbXNkbi5taWNyb3NvZnQuY29tL2VuLXVzL2xpYnJhcnkvYmI5NDM5OTEuYXNweC9cbi8vIGh0dHA6Ly9ibG9nLnRvamljb2RlLmNvbS8yMDExLzEyL2NvbXByZXNzZWQtdGV4dHVyZXMtaW4td2ViZ2wuaHRtbFxuLy9cbnZhciBjaGVjayA9IHJlcXVpcmUoJy4vY2hlY2snKVxuXG5tb2R1bGUuZXhwb3J0cyA9IHBhcnNlRERTXG5cbnZhciBERFNfTUFHSUMgPSAweDIwNTM0NDQ0XG5cbnZhciBHTF9URVhUVVJFXzJEID0gMHgwREUxXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YID0gMHg4NTE1XG5cbnZhciBHTF9DT01QUkVTU0VEX1JHQl9TM1RDX0RYVDFfRVhUID0gMHg4M0YwXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUMV9FWFQgPSAweDgzRjFcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQzX0VYVCA9IDB4ODNGMlxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDVfRVhUID0gMHg4M0YzXG5cbnZhciBHTF9DT01QUkVTU0VEX1JHQl9FVEMxX1dFQkdMID0gMHg4RDY0XG5cbnZhciBHTF9VTlNJR05FRF9CWVRFID0gMHgxNDAxXG4vLyB2YXIgR0xfSEFMRl9GTE9BVF9PRVMgPSAweDhENjFcbi8vIHZhciBHTF9GTE9BVCA9IDB4MTQwNlxuXG52YXIgRERTRF9NSVBNQVBDT1VOVCA9IDB4MjAwMDBcblxudmFyIEREU0NBUFMyX0NVQkVNQVAgPSAweDIwMFxudmFyIEREU0NBUFMyX0NVQkVNQVBfUE9TSVRJVkVYID0gMHg0MDBcbnZhciBERFNDQVBTMl9DVUJFTUFQX05FR0FUSVZFWCA9IDB4ODAwXG52YXIgRERTQ0FQUzJfQ1VCRU1BUF9QT1NJVElWRVkgPSAweDEwMDBcbnZhciBERFNDQVBTMl9DVUJFTUFQX05FR0FUSVZFWSA9IDB4MjAwMFxudmFyIEREU0NBUFMyX0NVQkVNQVBfUE9TSVRJVkVaID0gMHg0MDAwXG52YXIgRERTQ0FQUzJfQ1VCRU1BUF9ORUdBVElWRVogPSAweDgwMDBcblxudmFyIENVQkVNQVBfQ09NUExFVEVfRkFDRVMgPSAoXG4gIEREU0NBUFMyX0NVQkVNQVBfUE9TSVRJVkVYIHxcbiAgRERTQ0FQUzJfQ1VCRU1BUF9ORUdBVElWRVggfFxuICBERFNDQVBTMl9DVUJFTUFQX1BPU0lUSVZFWSB8XG4gIEREU0NBUFMyX0NVQkVNQVBfTkVHQVRJVkVZIHxcbiAgRERTQ0FQUzJfQ1VCRU1BUF9QT1NJVElWRVogfFxuICBERFNDQVBTMl9DVUJFTUFQX05FR0FUSVZFWilcblxudmFyIEREUEZfRk9VUkNDID0gMHg0XG52YXIgRERQRl9SR0IgPSAweDQwXG5cbnZhciBGT1VSQ0NfRFhUMSA9IDB4MzE1NDU4NDRcbnZhciBGT1VSQ0NfRFhUMyA9IDB4MzM1NDU4NDRcbnZhciBGT1VSQ0NfRFhUNSA9IDB4MzU1NDU4NDRcbnZhciBGT1VSQ0NfRVRDMSA9IDB4MzE0MzU0NDVcblxuLy8gRERTX0hFQURFUiB7XG52YXIgT0ZGX1NJWkUgPSAxICAgICAgICAvLyBpbnQzMiBkd1NpemVcbnZhciBPRkZfRkxBR1MgPSAyICAgICAgIC8vIGludDMyIGR3RmxhZ3NcbnZhciBPRkZfSEVJR0hUID0gMyAgICAgIC8vIGludDMyIGR3SGVpZ2h0XG52YXIgT0ZGX1dJRFRIID0gNCAgICAgICAvLyBpbnQzMiBkd1dpZHRoXG4vLyB2YXIgT0ZGX1BJVENIID0gNSAgICAgICAvLyBpbnQzMiBkd1BpdGNoT3JMaW5lYXJTaXplXG4vLyB2YXIgT0ZGX0RFUFRIID0gNiAgICAgICAvLyBpbnQzMiBkd0RlcHRoXG52YXIgT0ZGX01JUE1BUCA9IDcgICAgICAvLyBpbnQzMiBkd01pcE1hcENvdW50OyAvLyBvZmZzZXQ6IDdcbi8vIGludDMyWzExXSBkd1Jlc2VydmVkMVxuLy8gRERTX1BJWEVMRk9STUFUIHtcbi8vIHZhciBPRkZfUEZfU0laRSA9IDE5ICAgIC8vIGludDMyIGR3U2l6ZTsgLy8gb2Zmc2V0OiAxOVxudmFyIE9GRl9QRl9GTEFHUyA9IDIwICAgLy8gaW50MzIgZHdGbGFnc1xudmFyIE9GRl9GT1VSQ0MgPSAyMSAgICAgLy8gY2hhcls0XSBkd0ZvdXJDQ1xuLy8gdmFyIE9GRl9SR0JBX0JJVFMgPSAyMiAgLy8gaW50MzIgZHdSR0JCaXRDb3VudFxuLy8gdmFyIE9GRl9SRURfTUFTSyA9IDIzICAgLy8gaW50MzIgZHdSQml0TWFza1xuLy8gdmFyIE9GRl9HUkVFTl9NQVNLID0gMjQgLy8gaW50MzIgZHdHQml0TWFza1xuLy8gdmFyIE9GRl9CTFVFX01BU0sgPSAyNSAgLy8gaW50MzIgZHdCQml0TWFza1xuLy8gdmFyIE9GRl9BTFBIQV9NQVNLID0gMjYgLy8gaW50MzIgZHdBQml0TWFzazsgLy8gb2Zmc2V0OiAyNlxuLy8gfVxuLy8gdmFyIE9GRl9DQVBTID0gMjcgICAgICAgLy8gaW50MzIgZHdDYXBzOyAvLyBvZmZzZXQ6IDI3XG52YXIgT0ZGX0NBUFMyID0gMjggICAgICAvLyBpbnQzMiBkd0NhcHMyXG4vLyB2YXIgT0ZGX0NBUFMzID0gMjkgICAgICAvLyBpbnQzMiBkd0NhcHMzXG4vLyB2YXIgT0ZGX0NBUFM0ID0gMzAgICAgICAvLyBpbnQzMiBkd0NhcHM0XG4vLyBpbnQzMiBkd1Jlc2VydmVkMiAvLyBvZmZzZXQgMzFcblxuZnVuY3Rpb24gcGFyc2VERFMgKGFycmF5QnVmZmVyKSB7XG4gIHZhciBoZWFkZXIgPSBuZXcgSW50MzJBcnJheShhcnJheUJ1ZmZlcilcbiAgY2hlY2soaGVhZGVyWzBdID09PSBERFNfTUFHSUMsXG4gICAgJ2ludmFsaWQgbWFnaWMgbnVtYmVyIGZvciBkZHMgaGVhZGVyJylcblxuICB2YXIgZmxhZ3MgPSBoZWFkZXJbT0ZGX0ZMQUdTXVxuICBjaGVjayhmbGFncyAmIEREUEZfRk9VUkNDLFxuICAgICd1bnN1cHBvcnRlZCBkZHMgZm9ybWF0JylcblxuICB2YXIgd2lkdGggPSBoZWFkZXJbT0ZGX1dJRFRIXVxuICB2YXIgaGVpZ2h0ID0gaGVhZGVyW09GRl9IRUlHSFRdXG5cbiAgdmFyIHR5cGUgPSBHTF9VTlNJR05FRF9CWVRFXG4gIHZhciBmb3JtYXQgPSAwXG4gIHZhciBibG9ja0J5dGVzID0gMFxuICB2YXIgY2hhbm5lbHMgPSA0XG4gIHN3aXRjaCAoaGVhZGVyW09GRl9GT1VSQ0NdKSB7XG4gICAgY2FzZSBGT1VSQ0NfRFhUMTpcbiAgICAgIGJsb2NrQnl0ZXMgPSA4XG4gICAgICBpZiAoZmxhZ3MgJiBERFBGX1JHQikge1xuICAgICAgICBjaGFubmVscyA9IDNcbiAgICAgICAgZm9ybWF0ID0gR0xfQ09NUFJFU1NFRF9SR0JfUzNUQ19EWFQxX0VYVFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZm9ybWF0ID0gR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUMV9FWFRcbiAgICAgIH1cbiAgICAgIGJyZWFrXG5cbiAgICBjYXNlIEZPVVJDQ19EWFQzOlxuICAgICAgYmxvY2tCeXRlcyA9IDE2XG4gICAgICBmb3JtYXQgPSBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQzX0VYVFxuICAgICAgYnJlYWtcblxuICAgIGNhc2UgRk9VUkNDX0RYVDU6XG4gICAgICBibG9ja0J5dGVzID0gMTZcbiAgICAgIGZvcm1hdCA9IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDVfRVhUXG4gICAgICBicmVha1xuXG4gICAgY2FzZSBGT1VSQ0NfRVRDMTpcbiAgICAgIGJsb2NrQnl0ZXMgPSA4XG4gICAgICBmb3JtYXQgPSBHTF9DT01QUkVTU0VEX1JHQl9FVEMxX1dFQkdMXG4gICAgICBicmVha1xuXG4gICAgLy8gVE9ETzogSW1wbGVtZW50IGhkciBhbmQgdW5jb21wcmVzc2VkIHRleHR1cmVzXG5cbiAgICBkZWZhdWx0OlxuICAgICAgLy8gSGFuZGxlIHVuY29tcHJlc3NlZCBkYXRhIGhlcmVcbiAgICAgIGNoZWNrLnJhaXNlKCd1bnN1cHBvcnRlZCBkZHMgdGV4dHVyZSBmb3JtYXQnKVxuICB9XG5cbiAgdmFyIHBpeGVsRmxhZ3MgPSBoZWFkZXJbT0ZGX1BGX0ZMQUdTXVxuXG4gIHZhciBtaXBtYXBDb3VudCA9IDFcbiAgaWYgKHBpeGVsRmxhZ3MgJiBERFNEX01JUE1BUENPVU5UKSB7XG4gICAgbWlwbWFwQ291bnQgPSBNYXRoLm1heCgxLCBoZWFkZXJbT0ZGX01JUE1BUF0pXG4gIH1cblxuICB2YXIgcHRyID0gaGVhZGVyW09GRl9TSVpFXSArIDRcblxuICB2YXIgcmVzdWx0ID0ge1xuICAgIHdpZHRoOiB3aWR0aCxcbiAgICBoZWlnaHQ6IGhlaWdodCxcbiAgICBjaGFubmVsczogY2hhbm5lbHMsXG4gICAgZm9ybWF0OiBmb3JtYXQsXG4gICAgdHlwZTogdHlwZSxcbiAgICBjb21wcmVzc2VkOiB0cnVlLFxuICAgIGN1YmU6IGZhbHNlLFxuICAgIHBpeGVsczogW11cbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlTWlwcyAodGFyZ2V0KSB7XG4gICAgdmFyIG1pcFdpZHRoID0gd2lkdGhcbiAgICB2YXIgbWlwSGVpZ2h0ID0gaGVpZ2h0XG5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG1pcG1hcENvdW50OyArK2kpIHtcbiAgICAgIHZhciBzaXplID1cbiAgICAgICAgTWF0aC5tYXgoMSwgKG1pcFdpZHRoICsgMykgPj4gMikgKlxuICAgICAgICBNYXRoLm1heCgxLCAobWlwSGVpZ2h0ICsgMykgPj4gMikgKlxuICAgICAgICBibG9ja0J5dGVzXG4gICAgICByZXN1bHQucGl4ZWxzLnB1c2goe1xuICAgICAgICB0YXJnZXQ6IHRhcmdldCxcbiAgICAgICAgbWlwbGV2ZWw6IGksXG4gICAgICAgIHdpZHRoOiBtaXBXaWR0aCxcbiAgICAgICAgaGVpZ2h0OiBtaXBIZWlnaHQsXG4gICAgICAgIGRhdGE6IG5ldyBVaW50OEFycmF5KGFycmF5QnVmZmVyLCBwdHIsIHNpemUpXG4gICAgICB9KVxuICAgICAgcHRyICs9IHNpemVcbiAgICAgIG1pcFdpZHRoID4+PSAxXG4gICAgICBtaXBIZWlnaHQgPj49IDFcbiAgICB9XG4gIH1cblxuICB2YXIgY2FwczIgPSBoZWFkZXJbT0ZGX0NBUFMyXVxuICB2YXIgY3ViZW1hcCA9ICEhKGNhcHMyICYgRERTQ0FQUzJfQ1VCRU1BUClcbiAgaWYgKGN1YmVtYXApIHtcbiAgICBjaGVjayhcbiAgICAgIChjYXBzMiAmIENVQkVNQVBfQ09NUExFVEVfRkFDRVMpID09PSBDVUJFTUFQX0NPTVBMRVRFX0ZBQ0VTLFxuICAgICAgJ21pc3NpbmcgY3ViZW1hcCBmYWNlcycpXG4gICAgcmVzdWx0LmN1YmUgPSB0cnVlXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCA2OyArK2kpIHtcbiAgICAgIHBhcnNlTWlwcyhHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1ggKyBpKVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBwYXJzZU1pcHMoR0xfVEVYVFVSRV8yRClcbiAgfVxuXG4gIHJldHVybiByZXN1bHRcbn1cbiIsIi8qIGdsb2JhbHMgcmVxdWVzdEFuaW1hdGlvbkZyYW1lLCBjYW5jZWxBbmltYXRpb25GcmFtZSAqL1xuaWYgKHR5cGVvZiByZXF1ZXN0QW5pbWF0aW9uRnJhbWUgPT09ICdmdW5jdGlvbicgJiZcbiAgICB0eXBlb2YgY2FuY2VsQW5pbWF0aW9uRnJhbWUgPT09ICdmdW5jdGlvbicpIHtcbiAgbW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgbmV4dDogZnVuY3Rpb24gKHgpIHsgcmV0dXJuIHJlcXVlc3RBbmltYXRpb25GcmFtZSh4KSB9LFxuICAgIGNhbmNlbDogZnVuY3Rpb24gKHgpIHsgcmV0dXJuIGNhbmNlbEFuaW1hdGlvbkZyYW1lKHgpIH1cbiAgfVxufSBlbHNlIHtcbiAgbW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgbmV4dDogZnVuY3Rpb24gKGNiKSB7XG4gICAgICBzZXRUaW1lb3V0KGNiLCAzMClcbiAgICB9LFxuICAgIGNhbmNlbDogY2xlYXJUaW1lb3V0XG4gIH1cbn1cbiIsInZhciBjaGVjayA9IHJlcXVpcmUoJy4vY2hlY2snKVxudmFyIGlzVHlwZWRBcnJheSA9IHJlcXVpcmUoJy4vaXMtdHlwZWQtYXJyYXknKVxuXG52YXIgR0xfUkdCQSA9IDY0MDhcbnZhciBHTF9VTlNJR05FRF9CWVRFID0gNTEyMVxudmFyIEdMX1BBQ0tfQUxJR05NRU5UID0gMHgwRDA1XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcFJlYWRQaXhlbHMgKGdsLCByZWdsUG9sbCwgdmlld3BvcnRTdGF0ZSkge1xuICBmdW5jdGlvbiByZWFkUGl4ZWxzIChpbnB1dCkge1xuICAgIHZhciBvcHRpb25zID0gaW5wdXQgfHwge31cbiAgICBpZiAoaXNUeXBlZEFycmF5KGlucHV0KSkge1xuICAgICAgb3B0aW9ucyA9IHtcbiAgICAgICAgZGF0YTogb3B0aW9uc1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMikge1xuICAgICAgb3B0aW9ucyA9IHtcbiAgICAgICAgd2lkdGg6IGFyZ3VtZW50c1swXSB8IDAsXG4gICAgICAgIGhlaWdodDogYXJndW1lbnRzWzFdIHwgMFxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAodHlwZW9mIGlucHV0ICE9PSAnb2JqZWN0Jykge1xuICAgICAgb3B0aW9ucyA9IHt9XG4gICAgfVxuXG4gICAgLy8gVXBkYXRlIFdlYkdMIHN0YXRlXG4gICAgcmVnbFBvbGwoKVxuXG4gICAgLy8gUmVhZCB2aWV3cG9ydCBzdGF0ZVxuICAgIHZhciB4ID0gb3B0aW9ucy54IHx8IDBcbiAgICB2YXIgeSA9IG9wdGlvbnMueSB8fCAwXG4gICAgdmFyIHdpZHRoID0gb3B0aW9ucy53aWR0aCB8fCB2aWV3cG9ydFN0YXRlLndpZHRoXG4gICAgdmFyIGhlaWdodCA9IG9wdGlvbnMuaGVpZ2h0IHx8IHZpZXdwb3J0U3RhdGUuaGVpZ2h0XG5cbiAgICAvLyBDb21wdXRlIHNpemVcbiAgICB2YXIgc2l6ZSA9IHdpZHRoICogaGVpZ2h0ICogNFxuXG4gICAgLy8gQWxsb2NhdGUgZGF0YVxuICAgIHZhciBkYXRhID0gb3B0aW9ucy5kYXRhIHx8IG5ldyBVaW50OEFycmF5KHNpemUpXG5cbiAgICAvLyBUeXBlIGNoZWNrXG4gICAgY2hlY2suaXNUeXBlZEFycmF5KGRhdGEpXG4gICAgY2hlY2soZGF0YS5ieXRlTGVuZ3RoID49IHNpemUsICdkYXRhIGJ1ZmZlciB0b28gc21hbGwnKVxuXG4gICAgLy8gUnVuIHJlYWQgcGl4ZWxzXG4gICAgZ2wucGl4ZWxTdG9yZWkoR0xfUEFDS19BTElHTk1FTlQsIDQpXG4gICAgZ2wucmVhZFBpeGVscyh4LCB5LCB3aWR0aCwgaGVpZ2h0LCBHTF9SR0JBLCBHTF9VTlNJR05FRF9CWVRFLCBkYXRhKVxuXG4gICAgcmV0dXJuIGRhdGFcbiAgfVxuXG4gIHJldHVybiByZWFkUGl4ZWxzXG59XG4iLCJ2YXIgY2hlY2sgPSByZXF1aXJlKCcuL2NoZWNrJylcbnZhciB2YWx1ZXMgPSByZXF1aXJlKCcuL3ZhbHVlcycpXG5cbnZhciBHTF9SRU5ERVJCVUZGRVIgPSAweDhENDFcblxudmFyIEdMX1JHQkE0ID0gMHg4MDU2XG52YXIgR0xfUkdCNV9BMSA9IDB4ODA1N1xudmFyIEdMX1JHQjU2NSA9IDB4OEQ2MlxudmFyIEdMX0RFUFRIX0NPTVBPTkVOVDE2ID0gMHg4MUE1XG52YXIgR0xfU1RFTkNJTF9JTkRFWDggPSAweDhENDhcbnZhciBHTF9ERVBUSF9TVEVOQ0lMID0gMHg4NEY5XG5cbnZhciBHTF9TUkdCOF9BTFBIQThfRVhUID0gMHg4QzQzXG5cbnZhciBHTF9SR0JBMzJGX0VYVCA9IDB4ODgxNFxuXG52YXIgR0xfUkdCQTE2Rl9FWFQgPSAweDg4MUFcbnZhciBHTF9SR0IxNkZfRVhUID0gMHg4ODFCXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGdsLCBleHRlbnNpb25zLCBsaW1pdHMpIHtcbiAgdmFyIGZvcm1hdFR5cGVzID0ge1xuICAgICdyZ2JhNCc6IEdMX1JHQkE0LFxuICAgICdyZ2I1NjUnOiBHTF9SR0I1NjUsXG4gICAgJ3JnYjUgYTEnOiBHTF9SR0I1X0ExLFxuICAgICdkZXB0aCc6IEdMX0RFUFRIX0NPTVBPTkVOVDE2LFxuICAgICdzdGVuY2lsJzogR0xfU1RFTkNJTF9JTkRFWDgsXG4gICAgJ2RlcHRoIHN0ZW5jaWwnOiBHTF9ERVBUSF9TVEVOQ0lMXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5leHRfc3JnYikge1xuICAgIGZvcm1hdFR5cGVzWydzcmdiYSddID0gR0xfU1JHQjhfQUxQSEE4X0VYVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMuZXh0X2NvbG9yX2J1ZmZlcl9oYWxmX2Zsb2F0KSB7XG4gICAgZm9ybWF0VHlwZXNbJ3JnYmExNmYnXSA9IEdMX1JHQkExNkZfRVhUXG4gICAgZm9ybWF0VHlwZXNbJ3JnYjE2ZiddID0gR0xfUkdCMTZGX0VYVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29sb3JfYnVmZmVyX2Zsb2F0KSB7XG4gICAgZm9ybWF0VHlwZXNbJ3JnYmEzMmYnXSA9IEdMX1JHQkEzMkZfRVhUXG4gIH1cblxuICB2YXIgcmVuZGVyYnVmZmVyQ291bnQgPSAwXG4gIHZhciByZW5kZXJidWZmZXJTZXQgPSB7fVxuXG4gIGZ1bmN0aW9uIFJFR0xSZW5kZXJidWZmZXIgKCkge1xuICAgIHRoaXMuaWQgPSByZW5kZXJidWZmZXJDb3VudCsrXG4gICAgdGhpcy5yZWZDb3VudCA9IDFcblxuICAgIHRoaXMucmVuZGVyYnVmZmVyID0gbnVsbFxuXG4gICAgdGhpcy5mb3JtYXQgPSBHTF9SR0JBNFxuICAgIHRoaXMud2lkdGggPSAwXG4gICAgdGhpcy5oZWlnaHQgPSAwXG4gIH1cblxuICBSRUdMUmVuZGVyYnVmZmVyLnByb3RvdHlwZS5kZWNSZWYgPSBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKC0tdGhpcy5yZWZDb3VudCA9PT0gMCkge1xuICAgICAgZGVzdHJveSh0aGlzKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHJlZnJlc2ggKHJiKSB7XG4gICAgaWYgKCFnbC5pc1JlbmRlcmJ1ZmZlcihyYi5yZW5kZXJidWZmZXIpKSB7XG4gICAgICByYi5yZW5kZXJidWZmZXIgPSBnbC5jcmVhdGVSZW5kZXJidWZmZXIoKVxuICAgIH1cbiAgICBnbC5iaW5kUmVuZGVyYnVmZmVyKEdMX1JFTkRFUkJVRkZFUiwgcmIucmVuZGVyYnVmZmVyKVxuICAgIGdsLnJlbmRlcmJ1ZmZlclN0b3JhZ2UoXG4gICAgICBHTF9SRU5ERVJCVUZGRVIsXG4gICAgICByYi5mb3JtYXQsXG4gICAgICByYi53aWR0aCxcbiAgICAgIHJiLmhlaWdodClcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3kgKHJiKSB7XG4gICAgdmFyIGhhbmRsZSA9IHJiLnJlbmRlcmJ1ZmZlclxuICAgIGNoZWNrKGhhbmRsZSwgJ211c3Qgbm90IGRvdWJsZSBkZXN0cm95IHJlbmRlcmJ1ZmZlcicpXG4gICAgZ2wuYmluZFJlbmRlcmJ1ZmZlcihHTF9SRU5ERVJCVUZGRVIsIG51bGwpXG4gICAgaWYgKGdsLmlzUmVuZGVyYnVmZmVyKGhhbmRsZSkpIHtcbiAgICAgIGdsLmRlbGV0ZVJlbmRlcmJ1ZmZlcihoYW5kbGUpXG4gICAgfVxuICAgIHJiLnJlbmRlcmJ1ZmZlciA9IG51bGxcbiAgICByYi5yZWZDb3VudCA9IDBcbiAgICBkZWxldGUgcmVuZGVyYnVmZmVyU2V0W3JiLmlkXVxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlUmVuZGVyYnVmZmVyIChpbnB1dCkge1xuICAgIHZhciByZW5kZXJidWZmZXIgPSBuZXcgUkVHTFJlbmRlcmJ1ZmZlcigpXG4gICAgcmVuZGVyYnVmZmVyU2V0W3JlbmRlcmJ1ZmZlci5pZF0gPSByZW5kZXJidWZmZXJcblxuICAgIGZ1bmN0aW9uIHJlZ2xSZW5kZXJidWZmZXIgKGlucHV0KSB7XG4gICAgICB2YXIgb3B0aW9ucyA9IGlucHV0IHx8IHt9XG5cbiAgICAgIHZhciB3ID0gMFxuICAgICAgdmFyIGggPSAwXG4gICAgICBpZiAoJ3NoYXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBzaGFwZSA9IG9wdGlvbnMuc2hhcGVcbiAgICAgICAgY2hlY2soQXJyYXkuaXNBcnJheShzaGFwZSkgJiYgc2hhcGUubGVuZ3RoID49IDIsXG4gICAgICAgICAgJ2ludmFsaWQgcmVuZGVyYnVmZmVyIHNoYXBlJylcbiAgICAgICAgdyA9IHNoYXBlWzBdIHwgMFxuICAgICAgICBoID0gc2hhcGVbMV0gfCAwXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoJ3JhZGl1cycgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHcgPSBoID0gb3B0aW9ucy5yYWRpdXMgfCAwXG4gICAgICAgIH1cbiAgICAgICAgaWYgKCd3aWR0aCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHcgPSBvcHRpb25zLndpZHRoIHwgMFxuICAgICAgICB9XG4gICAgICAgIGlmICgnaGVpZ2h0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgaCA9IG9wdGlvbnMuaGVpZ2h0IHwgMFxuICAgICAgICB9XG4gICAgICB9XG4gICAgICB2YXIgcyA9IGxpbWl0cy5tYXhSZW5kZXJidWZmZXJTaXplXG4gICAgICBjaGVjayh3ID49IDAgJiYgaCA+PSAwICYmIHcgPD0gcyAmJiBoIDw9IHMsXG4gICAgICAgICdpbnZhbGlkIHJlbmRlcmJ1ZmZlciBzaXplJylcbiAgICAgIHJlZ2xSZW5kZXJidWZmZXIud2lkdGggPSByZW5kZXJidWZmZXIud2lkdGggPSBNYXRoLm1heCh3LCAxKVxuICAgICAgcmVnbFJlbmRlcmJ1ZmZlci5oZWlnaHQgPSByZW5kZXJidWZmZXIuaGVpZ2h0ID0gTWF0aC5tYXgoaCwgMSlcblxuICAgICAgcmVuZGVyYnVmZmVyLmZvcm1hdCA9IEdMX1JHQkE0XG4gICAgICBpZiAoJ2Zvcm1hdCcgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgZm9ybWF0ID0gb3B0aW9ucy5mb3JtYXRcbiAgICAgICAgY2hlY2sucGFyYW1ldGVyKGZvcm1hdCwgZm9ybWF0VHlwZXMsICdpbnZhbGlkIHJlbmRlciBidWZmZXIgZm9ybWF0JylcbiAgICAgICAgcmVuZGVyYnVmZmVyLmZvcm1hdCA9IGZvcm1hdFR5cGVzW2Zvcm1hdF1cbiAgICAgIH1cblxuICAgICAgcmVmcmVzaChyZW5kZXJidWZmZXIpXG5cbiAgICAgIHJldHVybiByZWdsUmVuZGVyYnVmZmVyXG4gICAgfVxuXG4gICAgcmVnbFJlbmRlcmJ1ZmZlcihpbnB1dClcblxuICAgIE9iamVjdC5hc3NpZ24ocmVnbFJlbmRlcmJ1ZmZlciwge1xuICAgICAgX3JlZ2xUeXBlOiAncmVuZGVyYnVmZmVyJyxcbiAgICAgIF9yZW5kZXJidWZmZXI6IHJlbmRlcmJ1ZmZlcixcbiAgICAgIGRlc3Ryb3k6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmVuZGVyYnVmZmVyLmRlY1JlZigpXG4gICAgICB9XG4gICAgfSlcblxuICAgIHJldHVybiByZWdsUmVuZGVyYnVmZmVyXG4gIH1cblxuICBmdW5jdGlvbiByZWZyZXNoUmVuZGVyYnVmZmVycyAoKSB7XG4gICAgdmFsdWVzKHJlbmRlcmJ1ZmZlclNldCkuZm9yRWFjaChyZWZyZXNoKVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveVJlbmRlcmJ1ZmZlcnMgKCkge1xuICAgIHZhbHVlcyhyZW5kZXJidWZmZXJTZXQpLmZvckVhY2goZGVzdHJveSlcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY3JlYXRlOiBjcmVhdGVSZW5kZXJidWZmZXIsXG4gICAgcmVmcmVzaDogcmVmcmVzaFJlbmRlcmJ1ZmZlcnMsXG4gICAgY2xlYXI6IGRlc3Ryb3lSZW5kZXJidWZmZXJzXG4gIH1cbn1cbiIsInZhciBjaGVjayA9IHJlcXVpcmUoJy4vY2hlY2snKVxuXG52YXIgREVGQVVMVF9GUkFHX1NIQURFUiA9ICd2b2lkIG1haW4oKXtnbF9GcmFnQ29sb3I9dmVjNCgwLDAsMCwwKTt9J1xudmFyIERFRkFVTFRfVkVSVF9TSEFERVIgPSAndm9pZCBtYWluKCl7Z2xfUG9zaXRpb249dmVjNCgwLDAsMCwwKTt9J1xuXG52YXIgR0xfRlJBR01FTlRfU0hBREVSID0gMzU2MzJcbnZhciBHTF9WRVJURVhfU0hBREVSID0gMzU2MzNcblxuZnVuY3Rpb24gQWN0aXZlSW5mbyAobmFtZSwgbG9jYXRpb24sIGluZm8pIHtcbiAgdGhpcy5uYW1lID0gbmFtZVxuICB0aGlzLmxvY2F0aW9uID0gbG9jYXRpb25cbiAgdGhpcy5pbmZvID0gaW5mb1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBTaGFkZXJTdGF0ZSAoXG4gIGdsLFxuICBhdHRyaWJ1dGVTdGF0ZSxcbiAgdW5pZm9ybVN0YXRlLFxuICBjb21waWxlU2hhZGVyRHJhdykge1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gZ2xzbCBjb21waWxhdGlvbiBhbmQgbGlua2luZ1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgdmFyIHNoYWRlcnMgPSB7fVxuXG4gIHZhciBmcmFnU2hhZGVycyA9IFtERUZBVUxUX0ZSQUdfU0hBREVSXVxuICB2YXIgdmVydFNoYWRlcnMgPSBbREVGQVVMVF9WRVJUX1NIQURFUl1cblxuICBmdW5jdGlvbiBnZXRTaGFkZXIgKHR5cGUsIHNvdXJjZSkge1xuICAgIHZhciBjYWNoZSA9IHNoYWRlcnNbdHlwZV1cbiAgICB2YXIgc2hhZGVyID0gY2FjaGVbc291cmNlXVxuXG4gICAgaWYgKCFzaGFkZXIpIHtcbiAgICAgIHNoYWRlciA9IGdsLmNyZWF0ZVNoYWRlcih0eXBlKVxuICAgICAgZ2wuc2hhZGVyU291cmNlKHNoYWRlciwgc291cmNlKVxuICAgICAgZ2wuY29tcGlsZVNoYWRlcihzaGFkZXIpXG5cbiAgICAgIGlmICghZ2wuZ2V0U2hhZGVyUGFyYW1ldGVyKHNoYWRlciwgZ2wuQ09NUElMRV9TVEFUVVMpKSB7XG4gICAgICAgIHZhciBlcnJMb2cgPSBnbC5nZXRTaGFkZXJJbmZvTG9nKHNoYWRlcilcbiAgICAgICAgY2hlY2sucmFpc2UoJ0Vycm9yIGNvbXBpbGluZyBzaGFkZXI6XFxuJyArIGVyckxvZylcbiAgICAgIH1cbiAgICAgIGNhY2hlW3NvdXJjZV0gPSBzaGFkZXJcbiAgICB9XG5cbiAgICByZXR1cm4gc2hhZGVyXG4gIH1cblxuICBmdW5jdGlvbiByZWZyZXNoU2hhZGVycyAoKSB7XG4gICAgc2hhZGVyc1tHTF9GUkFHTUVOVF9TSEFERVJdID0ge31cbiAgICBzaGFkZXJzW0dMX1ZFUlRFWF9TSEFERVJdID0ge31cbiAgfVxuXG4gIGZ1bmN0aW9uIGNsZWFyU2hhZGVycyAoKSB7XG4gICAgT2JqZWN0LmtleXMoc2hhZGVycykuZm9yRWFjaChmdW5jdGlvbiAodHlwZSkge1xuICAgICAgT2JqZWN0LmtleXMoc2hhZGVyc1t0eXBlXSkuZm9yRWFjaChmdW5jdGlvbiAoc2hhZGVyKSB7XG4gICAgICAgIGdsLmRlbGV0ZVNoYWRlcihzaGFkZXJzW3R5cGVdW3NoYWRlcl0pXG4gICAgICB9KVxuICAgIH0pXG4gICAgc2hhZGVyc1tHTF9GUkFHTUVOVF9TSEFERVJdID0ge31cbiAgICBzaGFkZXJzW0dMX1ZFUlRFWF9TSEFERVJdID0ge31cbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBwcm9ncmFtIGxpbmtpbmdcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIHZhciBwcm9ncmFtQ2FjaGUgPSB7fVxuICB2YXIgcHJvZ3JhbUxpc3QgPSBbXVxuXG4gIGZ1bmN0aW9uIFJFR0xQcm9ncmFtIChmcmFnU3JjLCB2ZXJ0U3JjKSB7XG4gICAgdGhpcy5mcmFnU3JjID0gZnJhZ1NyY1xuICAgIHRoaXMudmVydFNyYyA9IHZlcnRTcmNcbiAgICB0aGlzLnByb2dyYW0gPSBudWxsXG4gICAgdGhpcy51bmlmb3JtcyA9IFtdXG4gICAgdGhpcy5hdHRyaWJ1dGVzID0gW11cbiAgICB0aGlzLmRyYXcgPSBmdW5jdGlvbiAoKSB7fVxuICAgIHRoaXMuYmF0Y2hDYWNoZSA9IHt9XG4gIH1cblxuICBPYmplY3QuYXNzaWduKFJFR0xQcm9ncmFtLnByb3RvdHlwZSwge1xuICAgIGxpbms6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBpLCBpbmZvXG5cbiAgICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAgIC8vIGNvbXBpbGUgJiBsaW5rXG4gICAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgICB2YXIgZnJhZ1NoYWRlciA9IGdldFNoYWRlcihnbC5GUkFHTUVOVF9TSEFERVIsIHRoaXMuZnJhZ1NyYylcbiAgICAgIHZhciB2ZXJ0U2hhZGVyID0gZ2V0U2hhZGVyKGdsLlZFUlRFWF9TSEFERVIsIHRoaXMudmVydFNyYylcblxuICAgICAgdmFyIHByb2dyYW0gPSB0aGlzLnByb2dyYW0gPSBnbC5jcmVhdGVQcm9ncmFtKClcbiAgICAgIGdsLmF0dGFjaFNoYWRlcihwcm9ncmFtLCBmcmFnU2hhZGVyKVxuICAgICAgZ2wuYXR0YWNoU2hhZGVyKHByb2dyYW0sIHZlcnRTaGFkZXIpXG4gICAgICBnbC5saW5rUHJvZ3JhbShwcm9ncmFtKVxuICAgICAgaWYgKCFnbC5nZXRQcm9ncmFtUGFyYW1ldGVyKHByb2dyYW0sIGdsLkxJTktfU1RBVFVTKSkge1xuICAgICAgICB2YXIgZXJyTG9nID0gZ2wuZ2V0UHJvZ3JhbUluZm9Mb2cocHJvZ3JhbSlcbiAgICAgICAgY2hlY2sucmFpc2UoJ0Vycm9yIGxpbmtpbmcgcHJvZ3JhbTpcXG4nICsgZXJyTG9nKVxuICAgICAgfVxuXG4gICAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgICAvLyBncmFiIHVuaWZvcm1zXG4gICAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgICB2YXIgbnVtVW5pZm9ybXMgPSBnbC5nZXRQcm9ncmFtUGFyYW1ldGVyKHByb2dyYW0sIGdsLkFDVElWRV9VTklGT1JNUylcbiAgICAgIHZhciB1bmlmb3JtcyA9IHRoaXMudW5pZm9ybXMgPSBbXVxuICAgICAgZm9yIChpID0gMDsgaSA8IG51bVVuaWZvcm1zOyArK2kpIHtcbiAgICAgICAgaW5mbyA9IGdsLmdldEFjdGl2ZVVuaWZvcm0ocHJvZ3JhbSwgaSlcbiAgICAgICAgaWYgKGluZm8pIHtcbiAgICAgICAgICBpZiAoaW5mby5zaXplID4gMSkge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBpbmZvLnNpemU7ICsraikge1xuICAgICAgICAgICAgICB2YXIgbmFtZSA9IGluZm8ubmFtZS5yZXBsYWNlKCdbMF0nLCAnWycgKyBqICsgJ10nKVxuICAgICAgICAgICAgICB1bmlmb3Jtcy5wdXNoKG5ldyBBY3RpdmVJbmZvKFxuICAgICAgICAgICAgICAgIG5hbWUsXG4gICAgICAgICAgICAgICAgZ2wuZ2V0VW5pZm9ybUxvY2F0aW9uKHByb2dyYW0sIG5hbWUpLFxuICAgICAgICAgICAgICAgIGluZm8pKVxuICAgICAgICAgICAgICB1bmlmb3JtU3RhdGUuZGVmKG5hbWUpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHVuaWZvcm1zLnB1c2gobmV3IEFjdGl2ZUluZm8oXG4gICAgICAgICAgICAgIGluZm8ubmFtZSxcbiAgICAgICAgICAgICAgZ2wuZ2V0VW5pZm9ybUxvY2F0aW9uKHByb2dyYW0sIGluZm8ubmFtZSksXG4gICAgICAgICAgICAgIGluZm8pKVxuICAgICAgICAgICAgdW5pZm9ybVN0YXRlLmRlZihpbmZvLm5hbWUpXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAgIC8vIGdyYWIgYXR0cmlidXRlc1xuICAgICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgICAgdmFyIG51bUF0dHJpYnV0ZXMgPSBnbC5nZXRQcm9ncmFtUGFyYW1ldGVyKHByb2dyYW0sIGdsLkFDVElWRV9BVFRSSUJVVEVTKVxuICAgICAgdmFyIGF0dHJpYnV0ZXMgPSB0aGlzLmF0dHJpYnV0ZXMgPSBbXVxuICAgICAgZm9yIChpID0gMDsgaSA8IG51bUF0dHJpYnV0ZXM7ICsraSkge1xuICAgICAgICBpbmZvID0gZ2wuZ2V0QWN0aXZlQXR0cmliKHByb2dyYW0sIGkpXG4gICAgICAgIGlmIChpbmZvKSB7XG4gICAgICAgICAgYXR0cmlidXRlcy5wdXNoKG5ldyBBY3RpdmVJbmZvKFxuICAgICAgICAgICAgaW5mby5uYW1lLFxuICAgICAgICAgICAgZ2wuZ2V0QXR0cmliTG9jYXRpb24ocHJvZ3JhbSwgaW5mby5uYW1lKSxcbiAgICAgICAgICAgIGluZm8pKVxuICAgICAgICAgIGF0dHJpYnV0ZVN0YXRlLmRlZihpbmZvLm5hbWUpXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgICAgLy8gY2xlYXIgY2FjaGVkIHJlbmRlcmluZyBtZXRob2RzXG4gICAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgICB0aGlzLmRyYXcgPSBjb21waWxlU2hhZGVyRHJhdyh0aGlzKVxuICAgICAgdGhpcy5iYXRjaENhY2hlID0ge31cbiAgICB9LFxuXG4gICAgZGVzdHJveTogZnVuY3Rpb24gKCkge1xuICAgICAgZ2wuZGVsZXRlUHJvZ3JhbSh0aGlzLnByb2dyYW0pXG4gICAgfVxuICB9KVxuXG4gIGZ1bmN0aW9uIGdldFByb2dyYW0gKHZlcnRTb3VyY2UsIGZyYWdTb3VyY2UpIHtcbiAgICB2YXIgY2FjaGUgPSBwcm9ncmFtQ2FjaGVbZnJhZ1NvdXJjZV1cbiAgICBpZiAoIWNhY2hlKSB7XG4gICAgICBjYWNoZSA9IHByb2dyYW1DYWNoZVtmcmFnU291cmNlXSA9IHt9XG4gICAgfVxuICAgIHZhciBwcm9ncmFtID0gY2FjaGVbdmVydFNvdXJjZV1cbiAgICBpZiAoIXByb2dyYW0pIHtcbiAgICAgIHByb2dyYW0gPSBuZXcgUkVHTFByb2dyYW0oZnJhZ1NvdXJjZSwgdmVydFNvdXJjZSlcbiAgICAgIHByb2dyYW0ubGluaygpXG4gICAgICBjYWNoZVt2ZXJ0U291cmNlXSA9IHByb2dyYW1cbiAgICAgIHByb2dyYW1MaXN0LnB1c2gocHJvZ3JhbSlcbiAgICB9XG4gICAgcmV0dXJuIHByb2dyYW1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNsZWFyUHJvZ3JhbXMgKCkge1xuICAgIHByb2dyYW1MaXN0LmZvckVhY2goZnVuY3Rpb24gKHByb2dyYW0pIHtcbiAgICAgIHByb2dyYW0uZGVzdHJveSgpXG4gICAgfSlcbiAgICBwcm9ncmFtTGlzdC5sZW5ndGggPSAwXG4gICAgcHJvZ3JhbUNhY2hlID0ge31cbiAgfVxuXG4gIGZ1bmN0aW9uIHJlZnJlc2hQcm9ncmFtcyAoKSB7XG4gICAgcHJvZ3JhbUxpc3QuZm9yRWFjaChmdW5jdGlvbiAocHJvZ3JhbSkge1xuICAgICAgcHJvZ3JhbS5saW5rKClcbiAgICB9KVxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIHByb2dyYW0gc3RhdGVcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIHZhciBwcm9ncmFtU3RhdGUgPSBbbnVsbF1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gY29udGV4dCBtYW5hZ2VtZW50XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICBmdW5jdGlvbiBjbGVhciAoKSB7XG4gICAgY2xlYXJTaGFkZXJzKClcbiAgICBjbGVhclByb2dyYW1zKClcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlZnJlc2ggKCkge1xuICAgIHJlZnJlc2hTaGFkZXJzKClcbiAgICByZWZyZXNoUHJvZ3JhbXMoKVxuICB9XG5cbiAgLy8gV2UgY2FsbCBjbGVhciBvbmNlIHRvIGluaXRpYWxpemUgYWxsIGRhdGEgc3RydWN0dXJlc1xuICBjbGVhcigpXG5cbiAgcmV0dXJuIHtcbiAgICBjcmVhdGU6IGdldFByb2dyYW0sXG4gICAgY2xlYXI6IGNsZWFyLFxuICAgIHJlZnJlc2g6IHJlZnJlc2gsXG4gICAgcHJvZ3JhbXM6IHByb2dyYW1TdGF0ZSxcbiAgICBmcmFnU2hhZGVyczogZnJhZ1NoYWRlcnMsXG4gICAgdmVydFNoYWRlcnM6IHZlcnRTaGFkZXJzXG4gIH1cbn1cbiIsIi8vIEEgc3RhY2sgZm9yIG1hbmFnaW5nIHRoZSBzdGF0ZSBvZiBhIHNjYWxhci92ZWN0b3IgcGFyYW1ldGVyXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY3JlYXRlU3RhY2sgKGluaXQsIG9uQ2hhbmdlKSB7XG4gIHZhciBuID0gaW5pdC5sZW5ndGhcbiAgdmFyIHN0YWNrID0gaW5pdC5zbGljZSgpXG4gIHZhciBjdXJyZW50ID0gaW5pdC5zbGljZSgpXG4gIHZhciBkaXJ0eSA9IGZhbHNlXG4gIHZhciBmb3JjZURpcnR5ID0gdHJ1ZVxuXG4gIGZ1bmN0aW9uIHBvbGwgKCkge1xuICAgIHZhciBwdHIgPSBzdGFjay5sZW5ndGggLSBuXG4gICAgaWYgKGRpcnR5IHx8IGZvcmNlRGlydHkpIHtcbiAgICAgIHN3aXRjaCAobikge1xuICAgICAgICBjYXNlIDE6XG4gICAgICAgICAgb25DaGFuZ2Uoc3RhY2tbcHRyXSlcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlIDI6XG4gICAgICAgICAgb25DaGFuZ2Uoc3RhY2tbcHRyXSwgc3RhY2tbcHRyICsgMV0pXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSAzOlxuICAgICAgICAgIG9uQ2hhbmdlKHN0YWNrW3B0cl0sIHN0YWNrW3B0ciArIDFdLCBzdGFja1twdHIgKyAyXSlcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlIDQ6XG4gICAgICAgICAgb25DaGFuZ2Uoc3RhY2tbcHRyXSwgc3RhY2tbcHRyICsgMV0sIHN0YWNrW3B0ciArIDJdLCBzdGFja1twdHIgKyAzXSlcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlIDU6XG4gICAgICAgICAgb25DaGFuZ2Uoc3RhY2tbcHRyXSwgc3RhY2tbcHRyICsgMV0sIHN0YWNrW3B0ciArIDJdLCBzdGFja1twdHIgKyAzXSwgc3RhY2tbcHRyICsgNF0pXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSA2OlxuICAgICAgICAgIG9uQ2hhbmdlKHN0YWNrW3B0cl0sIHN0YWNrW3B0ciArIDFdLCBzdGFja1twdHIgKyAyXSwgc3RhY2tbcHRyICsgM10sIHN0YWNrW3B0ciArIDRdLCBzdGFja1twdHIgKyA1XSlcbiAgICAgICAgICBicmVha1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIG9uQ2hhbmdlLmFwcGx5KG51bGwsIHN0YWNrLnNsaWNlKHB0ciwgc3RhY2subGVuZ3RoKSlcbiAgICAgIH1cbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbjsgKytpKSB7XG4gICAgICAgIGN1cnJlbnRbaV0gPSBzdGFja1twdHIgKyBpXVxuICAgICAgfVxuICAgICAgZm9yY2VEaXJ0eSA9IGRpcnR5ID0gZmFsc2VcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIHB1c2g6IGZ1bmN0aW9uICgpIHtcbiAgICAgIGRpcnR5ID0gZmFsc2VcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbjsgKytpKSB7XG4gICAgICAgIHZhciB4ID0gYXJndW1lbnRzW2ldXG4gICAgICAgIGRpcnR5ID0gZGlydHkgfHwgKHggIT09IGN1cnJlbnRbaV0pXG4gICAgICAgIHN0YWNrLnB1c2goeClcbiAgICAgIH1cbiAgICB9LFxuXG4gICAgcG9wOiBmdW5jdGlvbiAoKSB7XG4gICAgICBkaXJ0eSA9IGZhbHNlXG4gICAgICBzdGFjay5sZW5ndGggLT0gblxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuOyArK2kpIHtcbiAgICAgICAgZGlydHkgPSBkaXJ0eSB8fCAoc3RhY2tbc3RhY2subGVuZ3RoIC0gbiArIGldICE9PSBjdXJyZW50W2ldKVxuICAgICAgfVxuICAgIH0sXG5cbiAgICBwb2xsOiBwb2xsLFxuXG4gICAgc2V0RGlydHk6IGZ1bmN0aW9uICgpIHtcbiAgICAgIGZvcmNlRGlydHkgPSB0cnVlXG4gICAgfVxuICB9XG59XG4iLCJ2YXIgY3JlYXRlU3RhY2sgPSByZXF1aXJlKCcuL3N0YWNrJylcbnZhciBjcmVhdGVFbnZpcm9ubWVudCA9IHJlcXVpcmUoJy4vY29kZWdlbicpXG5cbi8vIFdlYkdMIGNvbnN0YW50c1xudmFyIEdMX0NVTExfRkFDRSA9IDB4MEI0NFxudmFyIEdMX0JMRU5EID0gMHgwQkUyXG52YXIgR0xfRElUSEVSID0gMHgwQkQwXG52YXIgR0xfU1RFTkNJTF9URVNUID0gMHgwQjkwXG52YXIgR0xfREVQVEhfVEVTVCA9IDB4MEI3MVxudmFyIEdMX1NDSVNTT1JfVEVTVCA9IDB4MEMxMVxudmFyIEdMX1BPTFlHT05fT0ZGU0VUX0ZJTEwgPSAweDgwMzdcbnZhciBHTF9TQU1QTEVfQUxQSEFfVE9fQ09WRVJBR0UgPSAweDgwOUVcbnZhciBHTF9TQU1QTEVfQ09WRVJBR0UgPSAweDgwQTBcbnZhciBHTF9GVU5DX0FERCA9IDB4ODAwNlxudmFyIEdMX1pFUk8gPSAwXG52YXIgR0xfT05FID0gMVxudmFyIEdMX0ZST05UID0gMTAyOFxudmFyIEdMX0JBQ0sgPSAxMDI5XG52YXIgR0xfTEVTUyA9IDUxM1xudmFyIEdMX0NDVyA9IDIzMDVcbnZhciBHTF9BTFdBWVMgPSA1MTlcbnZhciBHTF9LRUVQID0gNzY4MFxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBDb250ZXh0U3RhdGUgKGdsLCBmcmFtZWJ1ZmZlclN0YXRlLCB2aWV3cG9ydFN0YXRlKSB7XG4gIGZ1bmN0aW9uIGNhcFN0YWNrIChjYXAsIGRmbHQpIHtcbiAgICB2YXIgcmVzdWx0ID0gY3JlYXRlU3RhY2soWyEhZGZsdF0sIGZ1bmN0aW9uIChmbGFnKSB7XG4gICAgICBpZiAoZmxhZykge1xuICAgICAgICBnbC5lbmFibGUoY2FwKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZ2wuZGlzYWJsZShjYXApXG4gICAgICB9XG4gICAgfSlcbiAgICByZXN1bHQuZmxhZyA9IGNhcFxuICAgIHJldHVybiByZXN1bHRcbiAgfVxuXG4gIC8vIENhcHMsIGZsYWdzIGFuZCBvdGhlciByYW5kb20gV2ViR0wgY29udGV4dCBzdGF0ZVxuICB2YXIgY29udGV4dFN0YXRlID0ge1xuICAgIC8vIERpdGhlcmluZ1xuICAgICdkaXRoZXInOiBjYXBTdGFjayhHTF9ESVRIRVIpLFxuXG4gICAgLy8gQmxlbmRpbmdcbiAgICAnYmxlbmQuZW5hYmxlJzogY2FwU3RhY2soR0xfQkxFTkQpLFxuICAgICdibGVuZC5jb2xvcic6IGNyZWF0ZVN0YWNrKFswLCAwLCAwLCAwXSwgZnVuY3Rpb24gKHIsIGcsIGIsIGEpIHtcbiAgICAgIGdsLmJsZW5kQ29sb3IociwgZywgYiwgYSlcbiAgICB9KSxcbiAgICAnYmxlbmQuZXF1YXRpb24nOiBjcmVhdGVTdGFjayhbR0xfRlVOQ19BREQsIEdMX0ZVTkNfQUREXSwgZnVuY3Rpb24gKHJnYiwgYSkge1xuICAgICAgZ2wuYmxlbmRFcXVhdGlvblNlcGFyYXRlKHJnYiwgYSlcbiAgICB9KSxcbiAgICAnYmxlbmQuZnVuYyc6IGNyZWF0ZVN0YWNrKFtcbiAgICAgIEdMX09ORSwgR0xfWkVSTywgR0xfT05FLCBHTF9aRVJPXG4gICAgXSwgZnVuY3Rpb24gKHNyY1JHQiwgZHN0UkdCLCBzcmNBbHBoYSwgZHN0QWxwaGEpIHtcbiAgICAgIGdsLmJsZW5kRnVuY1NlcGFyYXRlKHNyY1JHQiwgZHN0UkdCLCBzcmNBbHBoYSwgZHN0QWxwaGEpXG4gICAgfSksXG5cbiAgICAvLyBEZXB0aFxuICAgICdkZXB0aC5lbmFibGUnOiBjYXBTdGFjayhHTF9ERVBUSF9URVNULCB0cnVlKSxcbiAgICAnZGVwdGguZnVuYyc6IGNyZWF0ZVN0YWNrKFtHTF9MRVNTXSwgZnVuY3Rpb24gKGZ1bmMpIHtcbiAgICAgIGdsLmRlcHRoRnVuYyhmdW5jKVxuICAgIH0pLFxuICAgICdkZXB0aC5yYW5nZSc6IGNyZWF0ZVN0YWNrKFswLCAxXSwgZnVuY3Rpb24gKG5lYXIsIGZhcikge1xuICAgICAgZ2wuZGVwdGhSYW5nZShuZWFyLCBmYXIpXG4gICAgfSksXG4gICAgJ2RlcHRoLm1hc2snOiBjcmVhdGVTdGFjayhbdHJ1ZV0sIGZ1bmN0aW9uIChtKSB7XG4gICAgICBnbC5kZXB0aE1hc2sobSlcbiAgICB9KSxcblxuICAgIC8vIEZhY2UgY3VsbGluZ1xuICAgICdjdWxsLmVuYWJsZSc6IGNhcFN0YWNrKEdMX0NVTExfRkFDRSksXG4gICAgJ2N1bGwuZmFjZSc6IGNyZWF0ZVN0YWNrKFtHTF9CQUNLXSwgZnVuY3Rpb24gKG1vZGUpIHtcbiAgICAgIGdsLmN1bGxGYWNlKG1vZGUpXG4gICAgfSksXG5cbiAgICAvLyBGcm9udCBmYWNlIG9yaWVudGF0aW9uXG4gICAgJ2Zyb250RmFjZSc6IGNyZWF0ZVN0YWNrKFtHTF9DQ1ddLCBmdW5jdGlvbiAobW9kZSkge1xuICAgICAgZ2wuZnJvbnRGYWNlKG1vZGUpXG4gICAgfSksXG5cbiAgICAvLyBXcml0ZSBtYXNrc1xuICAgICdjb2xvck1hc2snOiBjcmVhdGVTdGFjayhbdHJ1ZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZV0sIGZ1bmN0aW9uIChyLCBnLCBiLCBhKSB7XG4gICAgICBnbC5jb2xvck1hc2sociwgZywgYiwgYSlcbiAgICB9KSxcblxuICAgIC8vIExpbmUgd2lkdGhcbiAgICAnbGluZVdpZHRoJzogY3JlYXRlU3RhY2soWzFdLCBmdW5jdGlvbiAodykge1xuICAgICAgZ2wubGluZVdpZHRoKHcpXG4gICAgfSksXG5cbiAgICAvLyBQb2x5Z29uIG9mZnNldFxuICAgICdwb2x5Z29uT2Zmc2V0LmVuYWJsZSc6IGNhcFN0YWNrKEdMX1BPTFlHT05fT0ZGU0VUX0ZJTEwpLFxuICAgICdwb2x5Z29uT2Zmc2V0Lm9mZnNldCc6IGNyZWF0ZVN0YWNrKFswLCAwXSwgZnVuY3Rpb24gKGZhY3RvciwgdW5pdHMpIHtcbiAgICAgIGdsLnBvbHlnb25PZmZzZXQoZmFjdG9yLCB1bml0cylcbiAgICB9KSxcblxuICAgIC8vIFNhbXBsZSBjb3ZlcmFnZVxuICAgICdzYW1wbGUuYWxwaGEnOiBjYXBTdGFjayhHTF9TQU1QTEVfQUxQSEFfVE9fQ09WRVJBR0UpLFxuICAgICdzYW1wbGUuZW5hYmxlJzogY2FwU3RhY2soR0xfU0FNUExFX0NPVkVSQUdFKSxcbiAgICAnc2FtcGxlLmNvdmVyYWdlJzogY3JlYXRlU3RhY2soWzEsIGZhbHNlXSwgZnVuY3Rpb24gKHZhbHVlLCBpbnZlcnQpIHtcbiAgICAgIGdsLnNhbXBsZUNvdmVyYWdlKHZhbHVlLCBpbnZlcnQpXG4gICAgfSksXG5cbiAgICAvLyBTdGVuY2lsXG4gICAgJ3N0ZW5jaWwuZW5hYmxlJzogY2FwU3RhY2soR0xfU1RFTkNJTF9URVNUKSxcbiAgICAnc3RlbmNpbC5tYXNrJzogY3JlYXRlU3RhY2soWy0xXSwgZnVuY3Rpb24gKG1hc2spIHtcbiAgICAgIGdsLnN0ZW5jaWxNYXNrKG1hc2spXG4gICAgfSksXG4gICAgJ3N0ZW5jaWwuZnVuYyc6IGNyZWF0ZVN0YWNrKFtcbiAgICAgIEdMX0FMV0FZUywgMCwgLTFcbiAgICBdLCBmdW5jdGlvbiAoZnVuYywgcmVmLCBtYXNrKSB7XG4gICAgICBnbC5zdGVuY2lsRnVuYyhmdW5jLCByZWYsIG1hc2spXG4gICAgfSksXG4gICAgJ3N0ZW5jaWwub3BGcm9udCc6IGNyZWF0ZVN0YWNrKFtcbiAgICAgIEdMX0tFRVAsIEdMX0tFRVAsIEdMX0tFRVBcbiAgICBdLCBmdW5jdGlvbiAoZmFpbCwgemZhaWwsIHBhc3MpIHtcbiAgICAgIGdsLnN0ZW5jaWxPcFNlcGFyYXRlKEdMX0ZST05ULCBmYWlsLCB6ZmFpbCwgcGFzcylcbiAgICB9KSxcbiAgICAnc3RlbmNpbC5vcEJhY2snOiBjcmVhdGVTdGFjayhbXG4gICAgICBHTF9LRUVQLCBHTF9LRUVQLCBHTF9LRUVQXG4gICAgXSwgZnVuY3Rpb24gKGZhaWwsIHpmYWlsLCBwYXNzKSB7XG4gICAgICBnbC5zdGVuY2lsT3BTZXBhcmF0ZShHTF9CQUNLLCBmYWlsLCB6ZmFpbCwgcGFzcylcbiAgICB9KSxcblxuICAgIC8vIFNjaXNzb3JcbiAgICAnc2Npc3Nvci5lbmFibGUnOiBjYXBTdGFjayhHTF9TQ0lTU09SX1RFU1QpLFxuICAgICdzY2lzc29yLmJveCc6IGNyZWF0ZVN0YWNrKFswLCAwLCAtMSwgLTFdLCBmdW5jdGlvbiAoeCwgeSwgdywgaCkge1xuICAgICAgdmFyIHdfID0gd1xuICAgICAgdmFyIGZibyA9IGZyYW1lYnVmZmVyU3RhdGUudG9wKClcbiAgICAgIGlmICh3IDwgMCkge1xuICAgICAgICBpZiAoZmJvKSB7XG4gICAgICAgICAgd18gPSBmYm8ud2lkdGggLSB4XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgd18gPSBnbC5kcmF3aW5nQnVmZmVyV2lkdGggLSB4XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHZhciBoXyA9IGhcbiAgICAgIGlmIChoIDwgMCkge1xuICAgICAgICBpZiAoZmJvKSB7XG4gICAgICAgICAgaF8gPSBmYm8uaGVpZ2h0IC0geVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGhfID0gZ2wuZHJhd2luZ0J1ZmZlckhlaWdodCAtIHlcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgZ2wuc2Npc3Nvcih4LCB5LCB3XywgaF8pXG4gICAgfSksXG5cbiAgICAvLyBWaWV3cG9ydFxuICAgICd2aWV3cG9ydCc6IGNyZWF0ZVN0YWNrKFswLCAwLCAtMSwgLTFdLCBmdW5jdGlvbiAoeCwgeSwgdywgaCkge1xuICAgICAgdmFyIHdfID0gd1xuICAgICAgdmFyIGZibyA9IGZyYW1lYnVmZmVyU3RhdGUudG9wKClcbiAgICAgIGlmICh3IDwgMCkge1xuICAgICAgICBpZiAoZmJvKSB7XG4gICAgICAgICAgd18gPSBmYm8ud2lkdGggLSB4XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgd18gPSBnbC5kcmF3aW5nQnVmZmVyV2lkdGggLSB4XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHZhciBoXyA9IGhcbiAgICAgIGlmIChoIDwgMCkge1xuICAgICAgICBpZiAoZmJvKSB7XG4gICAgICAgICAgaF8gPSBmYm8uaGVpZ2h0IC0geVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGhfID0gZ2wuZHJhd2luZ0J1ZmZlckhlaWdodCAtIHlcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgZ2wudmlld3BvcnQoeCwgeSwgd18sIGhfKVxuICAgICAgdmlld3BvcnRTdGF0ZS53aWR0aCA9IHdfXG4gICAgICB2aWV3cG9ydFN0YXRlLmhlaWdodCA9IGhfXG4gICAgfSlcbiAgfVxuXG4gIHZhciBlbnYgPSBjcmVhdGVFbnZpcm9ubWVudCgpXG4gIHZhciBwb2xsID0gZW52LnByb2MoJ3BvbGwnKVxuICB2YXIgcmVmcmVzaCA9IGVudi5wcm9jKCdyZWZyZXNoJylcbiAgT2JqZWN0LmtleXMoY29udGV4dFN0YXRlKS5mb3JFYWNoKGZ1bmN0aW9uIChwcm9wKSB7XG4gICAgdmFyIFNUQUNLID0gZW52LmxpbmsoY29udGV4dFN0YXRlW3Byb3BdKVxuICAgIHBvbGwoU1RBQ0ssICcucG9sbCgpOycpXG4gICAgcmVmcmVzaChTVEFDSywgJy5zZXREaXJ0eSgpOycpXG4gIH0pXG5cbiAgdmFyIHByb2NzID0gZW52LmNvbXBpbGUoKVxuXG4gIHJldHVybiB7XG4gICAgY29udGV4dFN0YXRlOiBjb250ZXh0U3RhdGUsXG4gICAgdmlld3BvcnQ6IHZpZXdwb3J0U3RhdGUsXG4gICAgcG9sbDogcHJvY3MucG9sbCxcbiAgICByZWZyZXNoOiBwcm9jcy5yZWZyZXNoLFxuXG4gICAgbm90aWZ5Vmlld3BvcnRDaGFuZ2VkOiBmdW5jdGlvbiAoKSB7XG4gICAgICBjb250ZXh0U3RhdGUudmlld3BvcnQuc2V0RGlydHkoKVxuICAgICAgY29udGV4dFN0YXRlWydzY2lzc29yLmJveCddLnNldERpcnR5KClcbiAgICB9XG4gIH1cbn1cbiIsInZhciBjaGVjayA9IHJlcXVpcmUoJy4vY2hlY2snKVxudmFyIHZhbHVlcyA9IHJlcXVpcmUoJy4vdmFsdWVzJylcbnZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL2lzLXR5cGVkLWFycmF5JylcbnZhciBpc05EQXJyYXlMaWtlID0gcmVxdWlyZSgnLi9pcy1uZGFycmF5JylcbnZhciBsb2FkVGV4dHVyZSA9IHJlcXVpcmUoJy4vbG9hZC10ZXh0dXJlJylcbnZhciBjb252ZXJ0VG9IYWxmRmxvYXQgPSByZXF1aXJlKCcuL3RvLWhhbGYtZmxvYXQnKVxudmFyIHBhcnNlRERTID0gcmVxdWlyZSgnLi9wYXJzZS1kZHMnKVxuXG52YXIgR0xfQ09NUFJFU1NFRF9URVhUVVJFX0ZPUk1BVFMgPSAweDg2QTNcblxudmFyIEdMX1RFWFRVUkVfMkQgPSAweDBERTFcbnZhciBHTF9URVhUVVJFX0NVQkVfTUFQID0gMHg4NTEzXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YID0gMHg4NTE1XG5cbnZhciBHTF9SR0JBID0gMHgxOTA4XG52YXIgR0xfQUxQSEEgPSAweDE5MDZcbnZhciBHTF9SR0IgPSAweDE5MDdcbnZhciBHTF9MVU1JTkFOQ0UgPSAweDE5MDlcbnZhciBHTF9MVU1JTkFOQ0VfQUxQSEEgPSAweDE5MEFcblxudmFyIEdMX1JHQkE0ID0gMHg4MDU2XG52YXIgR0xfUkdCNV9BMSA9IDB4ODA1N1xudmFyIEdMX1JHQjU2NSA9IDB4OEQ2MlxuXG52YXIgR0xfVU5TSUdORURfU0hPUlRfNF80XzRfNCA9IDB4ODAzM1xudmFyIEdMX1VOU0lHTkVEX1NIT1JUXzVfNV81XzEgPSAweDgwMzRcbnZhciBHTF9VTlNJR05FRF9TSE9SVF81XzZfNSA9IDB4ODM2M1xudmFyIEdMX1VOU0lHTkVEX0lOVF8yNF84X1dFQkdMID0gMHg4NEZBXG5cbnZhciBHTF9ERVBUSF9DT01QT05FTlQgPSAweDE5MDJcbnZhciBHTF9ERVBUSF9TVEVOQ0lMID0gMHg4NEY5XG5cbnZhciBHTF9TUkdCX0VYVCA9IDB4OEM0MFxudmFyIEdMX1NSR0JfQUxQSEFfRVhUID0gMHg4QzQyXG5cbnZhciBHTF9IQUxGX0ZMT0FUX09FUyA9IDB4OEQ2MVxuXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfUzNUQ19EWFQxX0VYVCA9IDB4ODNGMFxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDFfRVhUID0gMHg4M0YxXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUM19FWFQgPSAweDgzRjJcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQ1X0VYVCA9IDB4ODNGM1xuXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfQVRDX1dFQkdMID0gMHg4QzkyXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19FWFBMSUNJVF9BTFBIQV9XRUJHTCA9IDB4OEM5M1xudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9BVENfSU5URVJQT0xBVEVEX0FMUEhBX1dFQkdMID0gMHg4N0VFXG5cbnZhciBHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ180QlBQVjFfSU1HID0gMHg4QzAwXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfUFZSVENfMkJQUFYxX0lNRyA9IDB4OEMwMVxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9QVlJUQ180QlBQVjFfSU1HID0gMHg4QzAyXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1BWUlRDXzJCUFBWMV9JTUcgPSAweDhDMDNcblxudmFyIEdMX0NPTVBSRVNTRURfUkdCX0VUQzFfV0VCR0wgPSAweDhENjRcblxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSAweDE0MDFcbnZhciBHTF9VTlNJR05FRF9TSE9SVCA9IDB4MTQwM1xudmFyIEdMX1VOU0lHTkVEX0lOVCA9IDB4MTQwNVxudmFyIEdMX0ZMT0FUID0gMHgxNDA2XG5cbnZhciBHTF9URVhUVVJFX1dSQVBfUyA9IDB4MjgwMlxudmFyIEdMX1RFWFRVUkVfV1JBUF9UID0gMHgyODAzXG5cbnZhciBHTF9SRVBFQVQgPSAweDI5MDFcbnZhciBHTF9DTEFNUF9UT19FREdFID0gMHg4MTJGXG52YXIgR0xfTUlSUk9SRURfUkVQRUFUID0gMHg4MzcwXG5cbnZhciBHTF9URVhUVVJFX01BR19GSUxURVIgPSAweDI4MDBcbnZhciBHTF9URVhUVVJFX01JTl9GSUxURVIgPSAweDI4MDFcblxudmFyIEdMX05FQVJFU1QgPSAweDI2MDBcbnZhciBHTF9MSU5FQVIgPSAweDI2MDFcbnZhciBHTF9ORUFSRVNUX01JUE1BUF9ORUFSRVNUID0gMHgyNzAwXG52YXIgR0xfTElORUFSX01JUE1BUF9ORUFSRVNUID0gMHgyNzAxXG52YXIgR0xfTkVBUkVTVF9NSVBNQVBfTElORUFSID0gMHgyNzAyXG52YXIgR0xfTElORUFSX01JUE1BUF9MSU5FQVIgPSAweDI3MDNcblxudmFyIEdMX0dFTkVSQVRFX01JUE1BUF9ISU5UID0gMHg4MTkyXG52YXIgR0xfRE9OVF9DQVJFID0gMHgxMTAwXG52YXIgR0xfRkFTVEVTVCA9IDB4MTEwMVxudmFyIEdMX05JQ0VTVCA9IDB4MTEwMlxuXG52YXIgR0xfVEVYVFVSRV9NQVhfQU5JU09UUk9QWV9FWFQgPSAweDg0RkVcblxudmFyIEdMX1VOUEFDS19BTElHTk1FTlQgPSAweDBDRjVcbnZhciBHTF9VTlBBQ0tfRkxJUF9ZX1dFQkdMID0gMHg5MjQwXG52YXIgR0xfVU5QQUNLX1BSRU1VTFRJUExZX0FMUEhBX1dFQkdMID0gMHg5MjQxXG52YXIgR0xfVU5QQUNLX0NPTE9SU1BBQ0VfQ09OVkVSU0lPTl9XRUJHTCA9IDB4OTI0M1xuXG52YXIgR0xfQlJPV1NFUl9ERUZBVUxUX1dFQkdMID0gMHg5MjQ0XG5cbnZhciBHTF9URVhUVVJFMCA9IDB4ODRDMFxuXG52YXIgTUlQTUFQX0ZJTFRFUlMgPSBbXG4gIEdMX05FQVJFU1RfTUlQTUFQX05FQVJFU1QsXG4gIEdMX05FQVJFU1RfTUlQTUFQX0xJTkVBUixcbiAgR0xfTElORUFSX01JUE1BUF9ORUFSRVNULFxuICBHTF9MSU5FQVJfTUlQTUFQX0xJTkVBUlxuXVxuXG5mdW5jdGlvbiBpc1BvdzIgKHYpIHtcbiAgcmV0dXJuICEodiAmICh2IC0gMSkpICYmICghIXYpXG59XG5cbmZ1bmN0aW9uIGlzTnVtZXJpY0FycmF5IChhcnIpIHtcbiAgcmV0dXJuIChcbiAgICBBcnJheS5pc0FycmF5KGFycikgJiZcbiAgICAoYXJyLmxlbmd0aCA9PT0gMCB8fFxuICAgIHR5cGVvZiBhcnJbMF0gPT09ICdudW1iZXInKSlcbn1cblxuZnVuY3Rpb24gaXNSZWN0QXJyYXkgKGFycikge1xuICBpZiAoIUFycmF5LmlzQXJyYXkoYXJyKSkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG5cbiAgdmFyIHdpZHRoID0gYXJyLmxlbmd0aFxuICBpZiAod2lkdGggPT09IDAgfHwgIUFycmF5LmlzQXJyYXkoYXJyWzBdKSkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG5cbiAgdmFyIGhlaWdodCA9IGFyclswXS5sZW5ndGhcbiAgZm9yICh2YXIgaSA9IDE7IGkgPCB3aWR0aDsgKytpKSB7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGFycltpXSkgfHwgYXJyW2ldLmxlbmd0aCAhPT0gaGVpZ2h0KSB7XG4gICAgICByZXR1cm4gZmFsc2VcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRydWVcbn1cblxuZnVuY3Rpb24gY2xhc3NTdHJpbmcgKHgpIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh4KVxufVxuXG5mdW5jdGlvbiBpc0NhbnZhc0VsZW1lbnQgKG9iamVjdCkge1xuICByZXR1cm4gY2xhc3NTdHJpbmcob2JqZWN0KSA9PT0gJ1tvYmplY3QgSFRNTENhbnZhc0VsZW1lbnRdJ1xufVxuXG5mdW5jdGlvbiBpc0NvbnRleHQyRCAob2JqZWN0KSB7XG4gIHJldHVybiBjbGFzc1N0cmluZyhvYmplY3QpID09PSAnW29iamVjdCBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkRdJ1xufVxuXG5mdW5jdGlvbiBpc0ltYWdlRWxlbWVudCAob2JqZWN0KSB7XG4gIHJldHVybiBjbGFzc1N0cmluZyhvYmplY3QpID09PSAnW29iamVjdCBIVE1MSW1hZ2VFbGVtZW50XSdcbn1cblxuZnVuY3Rpb24gaXNWaWRlb0VsZW1lbnQgKG9iamVjdCkge1xuICByZXR1cm4gY2xhc3NTdHJpbmcob2JqZWN0KSA9PT0gJ1tvYmplY3QgSFRNTFZpZGVvRWxlbWVudF0nXG59XG5cbmZ1bmN0aW9uIGlzUGVuZGluZ1hIUiAob2JqZWN0KSB7XG4gIHJldHVybiBjbGFzc1N0cmluZyhvYmplY3QpID09PSAnW29iamVjdCBYTUxIdHRwUmVxdWVzdF0nXG59XG5cbmZ1bmN0aW9uIGlzUGl4ZWxEYXRhIChvYmplY3QpIHtcbiAgcmV0dXJuIChcbiAgICB0eXBlb2Ygb2JqZWN0ID09PSAnc3RyaW5nJyB8fFxuICAgICghIW9iamVjdCAmJiAoXG4gICAgICBpc1R5cGVkQXJyYXkob2JqZWN0KSB8fFxuICAgICAgaXNOdW1lcmljQXJyYXkob2JqZWN0KSB8fFxuICAgICAgaXNOREFycmF5TGlrZShvYmplY3QpIHx8XG4gICAgICBpc0NhbnZhc0VsZW1lbnQob2JqZWN0KSB8fFxuICAgICAgaXNDb250ZXh0MkQob2JqZWN0KSB8fFxuICAgICAgaXNJbWFnZUVsZW1lbnQob2JqZWN0KSB8fFxuICAgICAgaXNWaWRlb0VsZW1lbnQob2JqZWN0KSB8fFxuICAgICAgaXNSZWN0QXJyYXkob2JqZWN0KSkpKVxufVxuXG4vLyBUcmFuc3Bvc2UgYW4gYXJyYXkgb2YgcGl4ZWxzXG5mdW5jdGlvbiB0cmFuc3Bvc2VQaXhlbHMgKGRhdGEsIG54LCBueSwgbmMsIHN4LCBzeSwgc2MsIG9mZikge1xuICB2YXIgcmVzdWx0ID0gbmV3IGRhdGEuY29uc3RydWN0b3IobnggKiBueSAqIG5jKVxuICB2YXIgcHRyID0gMFxuICBmb3IgKHZhciBpID0gMDsgaSA8IG55OyArK2kpIHtcbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IG54OyArK2opIHtcbiAgICAgIGZvciAodmFyIGsgPSAwOyBrIDwgbmM7ICsraykge1xuICAgICAgICByZXN1bHRbcHRyKytdID0gZGF0YVtzeSAqIGkgKyBzeCAqIGogKyBzYyAqIGsgKyBvZmZdXG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHRcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjcmVhdGVUZXh0dXJlU2V0IChnbCwgZXh0ZW5zaW9ucywgbGltaXRzLCByZWdsUG9sbCwgdmlld3BvcnRTdGF0ZSkge1xuICB2YXIgbWlwbWFwSGludCA9IHtcbiAgICBcImRvbid0IGNhcmVcIjogR0xfRE9OVF9DQVJFLFxuICAgICdkb250IGNhcmUnOiBHTF9ET05UX0NBUkUsXG4gICAgJ25pY2UnOiBHTF9OSUNFU1QsXG4gICAgJ2Zhc3QnOiBHTF9GQVNURVNUXG4gIH1cblxuICB2YXIgd3JhcE1vZGVzID0ge1xuICAgICdyZXBlYXQnOiBHTF9SRVBFQVQsXG4gICAgJ2NsYW1wJzogR0xfQ0xBTVBfVE9fRURHRSxcbiAgICAnbWlycm9yJzogR0xfTUlSUk9SRURfUkVQRUFUXG4gIH1cblxuICB2YXIgbWFnRmlsdGVycyA9IHtcbiAgICAnbmVhcmVzdCc6IEdMX05FQVJFU1QsXG4gICAgJ2xpbmVhcic6IEdMX0xJTkVBUlxuICB9XG5cbiAgdmFyIG1pbkZpbHRlcnMgPSBPYmplY3QuYXNzaWduKHtcbiAgICAnbmVhcmVzdCBtaXBtYXAgbmVhcmVzdCc6IEdMX05FQVJFU1RfTUlQTUFQX05FQVJFU1QsXG4gICAgJ2xpbmVhciBtaXBtYXAgbmVhcmVzdCc6IEdMX0xJTkVBUl9NSVBNQVBfTkVBUkVTVCxcbiAgICAnbmVhcmVzdCBtaXBtYXAgbGluZWFyJzogR0xfTkVBUkVTVF9NSVBNQVBfTElORUFSLFxuICAgICdsaW5lYXIgbWlwbWFwIGxpbmVhcic6IEdMX0xJTkVBUl9NSVBNQVBfTElORUFSLFxuICAgICdtaXBtYXAnOiBHTF9MSU5FQVJfTUlQTUFQX0xJTkVBUlxuICB9LCBtYWdGaWx0ZXJzKVxuXG4gIHZhciBjb2xvclNwYWNlID0ge1xuICAgICdub25lJzogMCxcbiAgICAnYnJvd3Nlcic6IEdMX0JST1dTRVJfREVGQVVMVF9XRUJHTFxuICB9XG5cbiAgdmFyIHRleHR1cmVUeXBlcyA9IHtcbiAgICAndWludDgnOiBHTF9VTlNJR05FRF9CWVRFLFxuICAgICdyZ2JhNCc6IEdMX1VOU0lHTkVEX1NIT1JUXzRfNF80XzQsXG4gICAgJ3JnYjU2NSc6IEdMX1VOU0lHTkVEX1NIT1JUXzVfNl81LFxuICAgICdyZ2I1IGExJzogR0xfVU5TSUdORURfU0hPUlRfNV81XzVfMVxuICB9XG5cbiAgdmFyIHRleHR1cmVGb3JtYXRzID0ge1xuICAgICdhbHBoYSc6IEdMX0FMUEhBLFxuICAgICdsdW1pbmFuY2UnOiBHTF9MVU1JTkFOQ0UsXG4gICAgJ2x1bWluYW5jZSBhbHBoYSc6IEdMX0xVTUlOQU5DRV9BTFBIQSxcbiAgICAncmdiJzogR0xfUkdCLFxuICAgICdyZ2JhJzogR0xfUkdCQSxcbiAgICAncmdiYTQnOiBHTF9SR0JBNCxcbiAgICAncmdiNSBhMSc6IEdMX1JHQjVfQTEsXG4gICAgJ3JnYjU2NSc6IEdMX1JHQjU2NVxuICB9XG5cbiAgdmFyIGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cyA9IHt9XG5cbiAgaWYgKGV4dGVuc2lvbnMuZXh0X3NyZ2IpIHtcbiAgICB0ZXh0dXJlRm9ybWF0cy5zcmdiID0gR0xfU1JHQl9FWFRcbiAgICB0ZXh0dXJlRm9ybWF0cy5zcmdiYSA9IEdMX1NSR0JfQUxQSEFfRVhUXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9mbG9hdCkge1xuICAgIHRleHR1cmVUeXBlcy5mbG9hdCA9IEdMX0ZMT0FUXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9oYWxmX2Zsb2F0KSB7XG4gICAgdGV4dHVyZVR5cGVzWydoYWxmIGZsb2F0J10gPSBHTF9IQUxGX0ZMT0FUX09FU1xuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfZGVwdGhfdGV4dHVyZSkge1xuICAgIE9iamVjdC5hc3NpZ24odGV4dHVyZUZvcm1hdHMsIHtcbiAgICAgICdkZXB0aCc6IEdMX0RFUFRIX0NPTVBPTkVOVCxcbiAgICAgICdkZXB0aCBzdGVuY2lsJzogR0xfREVQVEhfU1RFTkNJTFxuICAgIH0pXG5cbiAgICBPYmplY3QuYXNzaWduKHRleHR1cmVUeXBlcywge1xuICAgICAgJ3VpbnQxNic6IEdMX1VOU0lHTkVEX1NIT1JULFxuICAgICAgJ3VpbnQzMic6IEdMX1VOU0lHTkVEX0lOVCxcbiAgICAgICdkZXB0aCBzdGVuY2lsJzogR0xfVU5TSUdORURfSU5UXzI0XzhfV0VCR0xcbiAgICB9KVxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29tcHJlc3NlZF90ZXh0dXJlX3MzdGMpIHtcbiAgICBPYmplY3QuYXNzaWduKGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cywge1xuICAgICAgJ3JnYiBzM3RjIGR4dDEnOiBHTF9DT01QUkVTU0VEX1JHQl9TM1RDX0RYVDFfRVhULFxuICAgICAgJ3JnYmEgczN0YyBkeHQxJzogR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUMV9FWFQsXG4gICAgICAncmdiYSBzM3RjIGR4dDMnOiBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQzX0VYVCxcbiAgICAgICdyZ2JhIHMzdGMgZHh0NSc6IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDVfRVhUXG4gICAgfSlcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9hdGMpIHtcbiAgICBPYmplY3QuYXNzaWduKGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cywge1xuICAgICAgJ3JnYiBhcmMnOiBHTF9DT01QUkVTU0VEX1JHQl9BVENfV0VCR0wsXG4gICAgICAncmdiYSBhdGMgZXhwbGljaXQgYWxwaGEnOiBHTF9DT01QUkVTU0VEX1JHQkFfQVRDX0VYUExJQ0lUX0FMUEhBX1dFQkdMLFxuICAgICAgJ3JnYmEgYXRjIGludGVycG9sYXRlZCBhbHBoYSc6IEdMX0NPTVBSRVNTRURfUkdCQV9BVENfSU5URVJQT0xBVEVEX0FMUEhBX1dFQkdMXG4gICAgfSlcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9wdnJ0Yykge1xuICAgIE9iamVjdC5hc3NpZ24oY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzLCB7XG4gICAgICAncmdiIHB2cnRjIDRicHB2MSc6IEdMX0NPTVBSRVNTRURfUkdCX1BWUlRDXzRCUFBWMV9JTUcsXG4gICAgICAncmdiIHB2cnRjIDJicHB2MSc6IEdMX0NPTVBSRVNTRURfUkdCX1BWUlRDXzJCUFBWMV9JTUcsXG4gICAgICAncmdiYSBwdnJ0YyA0YnBwdjEnOiBHTF9DT01QUkVTU0VEX1JHQkFfUFZSVENfNEJQUFYxX0lNRyxcbiAgICAgICdyZ2JhIHB2cnRjIDJicHB2MSc6IEdMX0NPTVBSRVNTRURfUkdCQV9QVlJUQ18yQlBQVjFfSU1HXG4gICAgfSlcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9ldGMxKSB7XG4gICAgY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzWydyZ2IgZXRjMSddID0gR0xfQ09NUFJFU1NFRF9SR0JfRVRDMV9XRUJHTFxuICB9XG5cbiAgLy8gQ29weSBvdmVyIGFsbCB0ZXh0dXJlIGZvcm1hdHNcbiAgdmFyIHN1cHBvcnRlZENvbXByZXNzZWRGb3JtYXRzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoXG4gICAgZ2wuZ2V0UGFyYW1ldGVyKEdMX0NPTVBSRVNTRURfVEVYVFVSRV9GT1JNQVRTKSlcbiAgT2JqZWN0LmtleXMoY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdmFyIGZvcm1hdCA9IGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0c1tuYW1lXVxuICAgIGlmIChzdXBwb3J0ZWRDb21wcmVzc2VkRm9ybWF0cy5pbmRleE9mKGZvcm1hdCkgPj0gMCkge1xuICAgICAgdGV4dHVyZUZvcm1hdHNbbmFtZV0gPSBmb3JtYXRcbiAgICB9XG4gIH0pXG5cbiAgdmFyIHN1cHBvcnRlZEZvcm1hdHMgPSBPYmplY3Qua2V5cyh0ZXh0dXJlRm9ybWF0cylcbiAgbGltaXRzLnRleHR1cmVGb3JtYXRzID0gc3VwcG9ydGVkRm9ybWF0c1xuXG4gIHZhciBjb2xvckZvcm1hdHMgPSBzdXBwb3J0ZWRGb3JtYXRzLnJlZHVjZShmdW5jdGlvbiAoY29sb3IsIGtleSkge1xuICAgIHZhciBnbGVudW0gPSB0ZXh0dXJlRm9ybWF0c1trZXldXG4gICAgaWYgKGdsZW51bSA9PT0gR0xfTFVNSU5BTkNFIHx8XG4gICAgICAgIGdsZW51bSA9PT0gR0xfQUxQSEEgfHxcbiAgICAgICAgZ2xlbnVtID09PSBHTF9MVU1JTkFOQ0UgfHxcbiAgICAgICAgZ2xlbnVtID09PSBHTF9MVU1JTkFOQ0VfQUxQSEEgfHxcbiAgICAgICAgZ2xlbnVtID09PSBHTF9ERVBUSF9DT01QT05FTlQgfHxcbiAgICAgICAgZ2xlbnVtID09PSBHTF9ERVBUSF9TVEVOQ0lMKSB7XG4gICAgICBjb2xvcltnbGVudW1dID0gZ2xlbnVtXG4gICAgfSBlbHNlIGlmIChnbGVudW0gPT09IEdMX1JHQjVfQTEgfHwga2V5LmluZGV4T2YoJ3JnYmEnKSA+PSAwKSB7XG4gICAgICBjb2xvcltnbGVudW1dID0gR0xfUkdCQVxuICAgIH0gZWxzZSB7XG4gICAgICBjb2xvcltnbGVudW1dID0gR0xfUkdCXG4gICAgfVxuICAgIHJldHVybiBjb2xvclxuICB9LCB7fSlcblxuICAvLyBQaXhlbCBzdG9yYWdlIHBhcnNpbmdcbiAgZnVuY3Rpb24gUGl4ZWxJbmZvICh0YXJnZXQpIHtcbiAgICAvLyB0ZXggdGFyZ2V0XG4gICAgdGhpcy50YXJnZXQgPSB0YXJnZXRcblxuICAgIC8vIHBpeGVsU3RvcmVpIGluZm9cbiAgICB0aGlzLmZsaXBZID0gZmFsc2VcbiAgICB0aGlzLnByZW11bHRpcGx5QWxwaGEgPSBmYWxzZVxuICAgIHRoaXMudW5wYWNrQWxpZ25tZW50ID0gMVxuICAgIHRoaXMuY29sb3JTcGFjZSA9IDBcblxuICAgIC8vIHNoYXBlXG4gICAgdGhpcy53aWR0aCA9IDBcbiAgICB0aGlzLmhlaWdodCA9IDBcbiAgICB0aGlzLmNoYW5uZWxzID0gMFxuXG4gICAgLy8gZm9ybWF0IGFuZCB0eXBlXG4gICAgdGhpcy5mb3JtYXQgPSAwXG4gICAgdGhpcy5pbnRlcm5hbGZvcm1hdCA9IDBcbiAgICB0aGlzLnR5cGUgPSAwXG4gICAgdGhpcy5jb21wcmVzc2VkID0gZmFsc2VcblxuICAgIC8vIG1pcCBsZXZlbFxuICAgIHRoaXMubWlwbGV2ZWwgPSAwXG5cbiAgICAvLyBuZGFycmF5LWxpa2UgcGFyYW1ldGVyc1xuICAgIHRoaXMuc3RyaWRlWCA9IDBcbiAgICB0aGlzLnN0cmlkZVkgPSAwXG4gICAgdGhpcy5zdHJpZGVDID0gMFxuICAgIHRoaXMub2Zmc2V0ID0gMFxuXG4gICAgLy8gY29weSBwaXhlbHMgaW5mb1xuICAgIHRoaXMueCA9IDBcbiAgICB0aGlzLnkgPSAwXG4gICAgdGhpcy5jb3B5ID0gZmFsc2VcblxuICAgIC8vIGRhdGEgc291cmNlc1xuICAgIHRoaXMuZGF0YSA9IG51bGxcbiAgICB0aGlzLmltYWdlID0gbnVsbFxuICAgIHRoaXMudmlkZW8gPSBudWxsXG4gICAgdGhpcy5jYW52YXMgPSBudWxsXG4gICAgdGhpcy54aHIgPSBudWxsXG5cbiAgICAvLyBDT1JTXG4gICAgdGhpcy5jcm9zc09yaWdpbiA9IG51bGxcblxuICAgIC8vIGhvcnJpYmxlIHN0YXRlIGZsYWdzXG4gICAgdGhpcy5uZWVkc1BvbGwgPSBmYWxzZVxuICAgIHRoaXMubmVlZHNMaXN0ZW5lcnMgPSBmYWxzZVxuICB9XG5cbiAgT2JqZWN0LmFzc2lnbihQaXhlbEluZm8ucHJvdG90eXBlLCB7XG4gICAgcGFyc2VGbGFnczogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucyAhPT0gJ29iamVjdCcgfHwgIW9wdGlvbnMpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG5cbiAgICAgIGlmICgncHJlbXVsdGlwbHlBbHBoYScgaW4gb3B0aW9ucykge1xuICAgICAgICBjaGVjay50eXBlKG9wdGlvbnMucHJlbXVsdGlwbHlBbHBoYSwgJ2Jvb2xlYW4nLFxuICAgICAgICAgICdpbnZhbGlkIHByZW11bHRpcGx5QWxwaGEnKVxuICAgICAgICB0aGlzLnByZW11bHRpcGx5QWxwaGEgPSBvcHRpb25zLnByZW11bHRpcGx5QWxwaGFcbiAgICAgIH1cblxuICAgICAgaWYgKCdmbGlwWScgaW4gb3B0aW9ucykge1xuICAgICAgICBjaGVjay50eXBlKG9wdGlvbnMuZmxpcFksICdib29sZWFuJyxcbiAgICAgICAgICAnaW52YWxpZCB0ZXh0dXJlIGZsaXAnKVxuICAgICAgICB0aGlzLmZsaXBZID0gb3B0aW9ucy5mbGlwWVxuICAgICAgfVxuXG4gICAgICBpZiAoJ2FsaWdubWVudCcgaW4gb3B0aW9ucykge1xuICAgICAgICBjaGVjay5vbmVPZihvcHRpb25zLmFsaWdubWVudCwgWzEsIDIsIDQsIDhdLFxuICAgICAgICAgICdpbnZhbGlkIHRleHR1cmUgdW5wYWNrIGFsaWdubWVudCcpXG4gICAgICAgIHRoaXMudW5wYWNrQWxpZ25tZW50ID0gb3B0aW9ucy5hbGlnbm1lbnRcbiAgICAgIH1cblxuICAgICAgaWYgKCdjb2xvclNwYWNlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIGNoZWNrLnBhcmFtZXRlcihvcHRpb25zLmNvbG9yU3BhY2UsIGNvbG9yU3BhY2UsXG4gICAgICAgICAgJ2ludmFsaWQgY29sb3JTcGFjZScpXG4gICAgICAgIHRoaXMuY29sb3JTcGFjZSA9IGNvbG9yU3BhY2Vbb3B0aW9ucy5jb2xvclNwYWNlXVxuICAgICAgfVxuXG4gICAgICBpZiAoJ2Zvcm1hdCcgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgZm9ybWF0ID0gb3B0aW9ucy5mb3JtYXRcbiAgICAgICAgY2hlY2sucGFyYW1ldGVyKGZvcm1hdCwgdGV4dHVyZUZvcm1hdHMsXG4gICAgICAgICAgJ2ludmFsaWQgdGV4dHVyZSBmb3JtYXQnKVxuICAgICAgICB0aGlzLmludGVybmFsZm9ybWF0ID0gdGV4dHVyZUZvcm1hdHNbZm9ybWF0XVxuICAgICAgICBpZiAoZm9ybWF0IGluIHRleHR1cmVUeXBlcykge1xuICAgICAgICAgIHRoaXMudHlwZSA9IHRleHR1cmVUeXBlc1tmb3JtYXRdXG4gICAgICAgIH1cbiAgICAgICAgaWYgKGZvcm1hdCBpbiBjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHMpIHtcbiAgICAgICAgICB0aGlzLmNvbXByZXNzZWQgPSB0cnVlXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKCd0eXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciB0eXBlID0gb3B0aW9ucy50eXBlXG4gICAgICAgIGNoZWNrLnBhcmFtZXRlcih0eXBlLCB0ZXh0dXJlVHlwZXMsXG4gICAgICAgICAgJ2ludmFsaWQgdGV4dHVyZSB0eXBlJylcbiAgICAgICAgdGhpcy50eXBlID0gdGV4dHVyZVR5cGVzW3R5cGVdXG4gICAgICB9XG5cbiAgICAgIHZhciB3ID0gdGhpcy53aWR0aFxuICAgICAgdmFyIGggPSB0aGlzLmhlaWdodFxuICAgICAgdmFyIGMgPSB0aGlzLmNoYW5uZWxzXG4gICAgICBpZiAoJ3NoYXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIGNoZWNrKEFycmF5LmlzQXJyYXkob3B0aW9ucy5zaGFwZSkgJiYgb3B0aW9ucy5zaGFwZS5sZW5ndGggPj0gMixcbiAgICAgICAgICAnc2hhcGUgbXVzdCBiZSBhbiBhcnJheScpXG4gICAgICAgIHcgPSBvcHRpb25zLnNoYXBlWzBdXG4gICAgICAgIGggPSBvcHRpb25zLnNoYXBlWzFdXG4gICAgICAgIGlmIChvcHRpb25zLnNoYXBlLmxlbmd0aCA9PT0gMykge1xuICAgICAgICAgIGMgPSBvcHRpb25zLnNoYXBlWzJdXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmICgncmFkaXVzJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgdyA9IGggPSBvcHRpb25zLnJhZGl1c1xuICAgICAgICB9XG4gICAgICAgIGlmICgnd2lkdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB3ID0gb3B0aW9ucy53aWR0aFxuICAgICAgICB9XG4gICAgICAgIGlmICgnaGVpZ2h0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgaCA9IG9wdGlvbnMuaGVpZ2h0XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCdjaGFubmVscycgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGMgPSBvcHRpb25zLmNoYW5uZWxzXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHRoaXMud2lkdGggPSB3IHwgMFxuICAgICAgdGhpcy5oZWlnaHQgPSBoIHwgMFxuICAgICAgdGhpcy5jaGFubmVscyA9IGMgfCAwXG5cbiAgICAgIGlmICgnc3RyaWRlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBzdHJpZGUgPSBvcHRpb25zLnN0cmlkZVxuICAgICAgICBjaGVjayhBcnJheS5pc0FycmF5KHN0cmlkZSkgJiYgc3RyaWRlLmxlbmd0aCA+PSAyLFxuICAgICAgICAgICdpbnZhbGlkIHN0cmlkZSB2ZWN0b3InKVxuICAgICAgICB0aGlzLnN0cmlkZVggPSBzdHJpZGVbMF1cbiAgICAgICAgdGhpcy5zdHJpZGVZID0gc3RyaWRlWzFdXG4gICAgICAgIGlmIChzdHJpZGUubGVuZ3RoID09PSAzKSB7XG4gICAgICAgICAgdGhpcy5zdHJpZGVDID0gc3RyaWRlWzJdXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5zdHJpZGVDID0gMVxuICAgICAgICB9XG4gICAgICAgIHRoaXMubmVlZHNUcmFuc3Bvc2UgPSB0cnVlXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLnN0cmlkZUMgPSAxXG4gICAgICAgIHRoaXMuc3RyaWRlWCA9IHRoaXMuc3RyaWRlQyAqIGNcbiAgICAgICAgdGhpcy5zdHJpZGVZID0gdGhpcy5zdHJpZGVYICogd1xuICAgICAgfVxuXG4gICAgICBpZiAoJ29mZnNldCcgaW4gb3B0aW9ucykge1xuICAgICAgICB0aGlzLm9mZnNldCA9IG9wdGlvbnMub2Zmc2V0IHwgMFxuICAgICAgICB0aGlzLm5lZWRzVHJhbnNwb3NlID0gdHJ1ZVxuICAgICAgfVxuXG4gICAgICBpZiAoJ2Nyb3NzT3JpZ2luJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHRoaXMuY3Jvc3NPcmlnaW4gPSBvcHRpb25zLmNyb3NzT3JpZ2luXG4gICAgICB9XG4gICAgfSxcbiAgICBwYXJzZTogZnVuY3Rpb24gKG9wdGlvbnMsIG1pcGxldmVsKSB7XG4gICAgICB0aGlzLm1pcGxldmVsID0gbWlwbGV2ZWxcbiAgICAgIHRoaXMud2lkdGggPSB0aGlzLndpZHRoID4+IG1pcGxldmVsXG4gICAgICB0aGlzLmhlaWdodCA9IHRoaXMuaGVpZ2h0ID4+IG1pcGxldmVsXG5cbiAgICAgIHZhciBkYXRhID0gb3B0aW9uc1xuICAgICAgc3dpdGNoICh0eXBlb2Ygb3B0aW9ucykge1xuICAgICAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICAgICAgaWYgKCFvcHRpb25zKSB7XG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICB9XG4gICAgICAgICAgdGhpcy5wYXJzZUZsYWdzKG9wdGlvbnMpXG4gICAgICAgICAgaWYgKGlzUGl4ZWxEYXRhKG9wdGlvbnMuZGF0YSkpIHtcbiAgICAgICAgICAgIGRhdGEgPSBvcHRpb25zLmRhdGFcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSAndW5kZWZpbmVkJzpcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICBjaGVjay5yYWlzZSgnaW52YWxpZCBwaXhlbCBkYXRhIHR5cGUnKVxuICAgICAgfVxuXG4gICAgICBpZiAodHlwZW9mIGRhdGEgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGRhdGEgPSBsb2FkVGV4dHVyZShkYXRhLCB0aGlzLmNyb3NzT3JpZ2luKVxuICAgICAgfVxuXG4gICAgICB2YXIgYXJyYXkgPSBudWxsXG4gICAgICB2YXIgbmVlZHNDb252ZXJ0ID0gZmFsc2VcblxuICAgICAgaWYgKHRoaXMuY29tcHJlc3NlZCkge1xuICAgICAgICBjaGVjayhkYXRhIGluc3RhbmNlb2YgVWludDhBcnJheSB8fCBpc1BlbmRpbmdYSFIoZGF0YSksXG4gICAgICAgICAgJ2NvbXByZXNzZWQgdGV4dHVyZSBkYXRhIG11c3QgYmUgc3RvcmVkIGluIGEgdWludDhhcnJheScpXG4gICAgICB9XG5cbiAgICAgIGlmIChkYXRhID09PSBudWxsKSB7XG4gICAgICAgIC8vIFRPRE9cbiAgICAgIH0gZWxzZSBpZiAoaXNUeXBlZEFycmF5KGRhdGEpKSB7XG4gICAgICAgIHRoaXMuZGF0YSA9IGRhdGFcbiAgICAgIH0gZWxzZSBpZiAoaXNOdW1lcmljQXJyYXkoZGF0YSkpIHtcbiAgICAgICAgYXJyYXkgPSBkYXRhXG4gICAgICAgIG5lZWRzQ29udmVydCA9IHRydWVcbiAgICAgIH0gZWxzZSBpZiAoaXNOREFycmF5TGlrZShkYXRhKSkge1xuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShkYXRhLmRhdGEpKSB7XG4gICAgICAgICAgYXJyYXkgPSBkYXRhLmRhdGFcbiAgICAgICAgICBuZWVkc0NvbnZlcnQgPSB0cnVlXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5kYXRhID0gZGF0YS5kYXRhXG4gICAgICAgIH1cbiAgICAgICAgdmFyIHNoYXBlID0gZGF0YS5zaGFwZVxuICAgICAgICB0aGlzLndpZHRoID0gc2hhcGVbMF1cbiAgICAgICAgdGhpcy5oZWlnaHQgPSBzaGFwZVsxXVxuICAgICAgICBpZiAoc2hhcGUubGVuZ3RoID09PSAzKSB7XG4gICAgICAgICAgdGhpcy5jaGFubmVscyA9IHNoYXBlWzJdXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5jaGFubmVscyA9IDFcbiAgICAgICAgfVxuICAgICAgICB2YXIgc3RyaWRlID0gZGF0YS5zdHJpZGVcbiAgICAgICAgdGhpcy5zdHJpZGVYID0gZGF0YS5zdHJpZGVbMF1cbiAgICAgICAgdGhpcy5zdHJpZGVZID0gZGF0YS5zdHJpZGVbMV1cbiAgICAgICAgaWYgKHN0cmlkZS5sZW5ndGggPT09IDMpIHtcbiAgICAgICAgICB0aGlzLnN0cmlkZUMgPSBkYXRhLnN0cmlkZVsyXVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMuc3RyaWRlQyA9IDFcbiAgICAgICAgfVxuICAgICAgICB0aGlzLm9mZnNldCA9IGRhdGEub2Zmc2V0XG4gICAgICAgIHRoaXMubmVlZHNUcmFuc3Bvc2UgPSB0cnVlXG4gICAgICB9IGVsc2UgaWYgKGlzQ2FudmFzRWxlbWVudChkYXRhKSB8fCBpc0NvbnRleHQyRChkYXRhKSkge1xuICAgICAgICBpZiAoaXNDYW52YXNFbGVtZW50KGRhdGEpKSB7XG4gICAgICAgICAgdGhpcy5jYW52YXMgPSBkYXRhXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5jYW52YXMgPSBkYXRhLmNhbnZhc1xuICAgICAgICB9XG4gICAgICAgIHRoaXMud2lkdGggPSB0aGlzLmNhbnZhcy53aWR0aFxuICAgICAgICB0aGlzLmhlaWdodCA9IHRoaXMuY2FudmFzLmhlaWdodFxuICAgICAgICB0aGlzLnNldERlZmF1bHRGb3JtYXQoKVxuICAgICAgfSBlbHNlIGlmIChpc0ltYWdlRWxlbWVudChkYXRhKSkge1xuICAgICAgICB0aGlzLmltYWdlID0gZGF0YVxuICAgICAgICBpZiAoIWRhdGEuY29tcGxldGUpIHtcbiAgICAgICAgICB0aGlzLndpZHRoID0gdGhpcy53aWR0aCB8fCBkYXRhLm5hdHVyYWxXaWR0aFxuICAgICAgICAgIHRoaXMuaGVpZ2h0ID0gdGhpcy5oZWlnaHQgfHwgZGF0YS5uYXR1cmFsSGVpZ2h0XG4gICAgICAgICAgdGhpcy5uZWVkc0xpc3RlbmVycyA9IHRydWVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLndpZHRoID0gZGF0YS5uYXR1cmFsV2lkdGhcbiAgICAgICAgICB0aGlzLmhlaWdodCA9IGRhdGEubmF0dXJhbEhlaWdodFxuICAgICAgICB9XG4gICAgICAgIHRoaXMuc2V0RGVmYXVsdEZvcm1hdCgpXG4gICAgICB9IGVsc2UgaWYgKGlzVmlkZW9FbGVtZW50KGRhdGEpKSB7XG4gICAgICAgIHRoaXMudmlkZW8gPSBkYXRhXG4gICAgICAgIGlmIChkYXRhLnJlYWR5U3RhdGUgPiAxKSB7XG4gICAgICAgICAgdGhpcy53aWR0aCA9IGRhdGEud2lkdGhcbiAgICAgICAgICB0aGlzLmhlaWdodCA9IGRhdGEuaGVpZ2h0XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy53aWR0aCA9IHRoaXMud2lkdGggfHwgZGF0YS53aWR0aFxuICAgICAgICAgIHRoaXMuaGVpZ2h0ID0gdGhpcy5oZWlnaHQgfHwgZGF0YS5oZWlnaHRcbiAgICAgICAgICB0aGlzLm5lZWRzTGlzdGVuZXJzID0gdHJ1ZVxuICAgICAgICB9XG4gICAgICAgIHRoaXMubmVlZHNQb2xsID0gdHJ1ZVxuICAgICAgICB0aGlzLnNldERlZmF1bHRGb3JtYXQoKVxuICAgICAgfSBlbHNlIGlmIChpc1BlbmRpbmdYSFIoZGF0YSkpIHtcbiAgICAgICAgdGhpcy54aHIgPSBkYXRhXG4gICAgICAgIHRoaXMubmVlZHNMaXN0ZW5lcnMgPSB0cnVlXG4gICAgICB9IGVsc2UgaWYgKGlzUmVjdEFycmF5KGRhdGEpKSB7XG4gICAgICAgIHZhciB3ID0gZGF0YS5sZW5ndGhcbiAgICAgICAgdmFyIGggPSBkYXRhWzBdLmxlbmd0aFxuICAgICAgICB2YXIgYyA9IDFcbiAgICAgICAgdmFyIGksIGosIGssIHBcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YVswXVswXSkpIHtcbiAgICAgICAgICBjID0gZGF0YVswXVswXS5sZW5ndGhcbiAgICAgICAgICBjaGVjayhjID49IDAgJiYgYyA8PSA0LCAnaW52YWxpZCBudW1iZXIgb2YgY2hhbm5lbHMgZm9yIGltYWdlIGRhdGEnKVxuICAgICAgICAgIGFycmF5ID0gQXJyYXkodyAqIGggKiBjKVxuICAgICAgICAgIHAgPSAwXG4gICAgICAgICAgZm9yIChqID0gMDsgaiA8IGg7ICsraikge1xuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IHc7ICsraSkge1xuICAgICAgICAgICAgICBmb3IgKGsgPSAwOyBrIDwgYzsgKytrKSB7XG4gICAgICAgICAgICAgICAgYXJyYXlbcCsrXSA9IGRhdGFbaV1bal1ba11cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBhcnJheSA9IEFycmF5KHcgKiBoKVxuICAgICAgICAgIHAgPSAwXG4gICAgICAgICAgZm9yIChqID0gMDsgaiA8IGg7ICsraikge1xuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IHc7ICsraSkge1xuICAgICAgICAgICAgICBhcnJheVtwKytdID0gZGF0YVtpXVtqXVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLndpZHRoID0gd1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhcbiAgICAgICAgdGhpcy5jaGFubmVscyA9IGNcbiAgICAgICAgbmVlZHNDb252ZXJ0ID0gdHJ1ZVxuICAgICAgfSBlbHNlIGlmIChvcHRpb25zLmNvcHkpIHtcbiAgICAgICAgdGhpcy5jb3B5ID0gdHJ1ZVxuICAgICAgICB0aGlzLnggPSB0aGlzLnggfCAwXG4gICAgICAgIHRoaXMueSA9IHRoaXMueSB8IDBcbiAgICAgICAgdGhpcy53aWR0aCA9ICh0aGlzLndpZHRoIHx8IHZpZXdwb3J0U3RhdGUud2lkdGgpIHwgMFxuICAgICAgICB0aGlzLmhlaWdodCA9ICh0aGlzLmhlaWdodCB8fCB2aWV3cG9ydFN0YXRlLmhlaWdodCkgfCAwXG4gICAgICAgIHRoaXMuc2V0RGVmYXVsdEZvcm1hdCgpXG4gICAgICB9XG5cbiAgICAgIC8vIEZpeCB1cCBtaXNzaW5nIHR5cGUgaW5mbyBmb3IgdHlwZWQgYXJyYXlzXG4gICAgICBpZiAoIXRoaXMudHlwZSAmJiB0aGlzLmRhdGEpIHtcbiAgICAgICAgaWYgKHRoaXMuZm9ybWF0ID09PSBHTF9ERVBUSF9DT01QT05FTlQpIHtcbiAgICAgICAgICBpZiAodGhpcy5kYXRhIGluc3RhbmNlb2YgVWludDE2QXJyYXkpIHtcbiAgICAgICAgICAgIHRoaXMudHlwZSA9IEdMX1VOU0lHTkVEX1NIT1JUXG4gICAgICAgICAgfSBlbHNlIGlmICh0aGlzLmRhdGEgaW5zdGFuY2VvZiBVaW50MzJBcnJheSkge1xuICAgICAgICAgICAgdGhpcy50eXBlID0gR0xfVU5TSUdORURfSU5UXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuZGF0YSBpbnN0YW5jZW9mIEZsb2F0MzJBcnJheSkge1xuICAgICAgICAgIHRoaXMudHlwZSA9IEdMX0ZMT0FUXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gSW5mZXIgZGVmYXVsdCBmb3JtYXRcbiAgICAgIGlmICghdGhpcy5pbnRlcm5hbGZvcm1hdCkge1xuICAgICAgICB2YXIgY2hhbm5lbHMgPSB0aGlzLmNoYW5uZWxzID0gdGhpcy5jaGFubmVscyB8fCA0XG4gICAgICAgIHRoaXMuaW50ZXJuYWxmb3JtYXQgPSBbXG4gICAgICAgICAgR0xfTFVNSU5BTkNFLFxuICAgICAgICAgIEdMX0xVTUlOQU5DRV9BTFBIQSxcbiAgICAgICAgICBHTF9SR0IsXG4gICAgICAgICAgR0xfUkdCQV1bY2hhbm5lbHMgLSAxXVxuICAgICAgICBjaGVjayh0aGlzLmludGVybmFsZm9ybWF0LCAnaW52YWxpZCBudW1iZXIgb2YgY2hhbm5lbHMnKVxuICAgICAgfVxuXG4gICAgICB2YXIgZm9ybWF0ID0gdGhpcy5pbnRlcm5hbGZvcm1hdFxuICAgICAgaWYgKGZvcm1hdCA9PT0gR0xfREVQVEhfQ09NUE9ORU5UIHx8IGZvcm1hdCA9PT0gR0xfREVQVEhfU1RFTkNJTCkge1xuICAgICAgICBjaGVjayhleHRlbnNpb25zLndlYmdsX2RlcHRoX3RleHR1cmUsXG4gICAgICAgICAgJ2RlcHRoL3N0ZW5jaWwgdGV4dHVyZSBub3Qgc3VwcG9ydGVkJylcbiAgICAgICAgaWYgKGZvcm1hdCA9PT0gR0xfREVQVEhfQ09NUE9ORU5UKSB7XG4gICAgICAgICAgY2hlY2sodGhpcy50eXBlID09PSBHTF9VTlNJR05FRF9TSE9SVCB8fCBHTF9VTlNJR05FRF9JTlQsXG4gICAgICAgICAgICAnZGVwdGggdGV4dHVyZSB0eXBlIG11c3QgYmUgdWludDE2IG9yIHVpbnQzMicpXG4gICAgICAgIH1cbiAgICAgICAgaWYgKGZvcm1hdCA9PT0gR0xfREVQVEhfU1RFTkNJTCkge1xuICAgICAgICAgIGNoZWNrKHRoaXMudHlwZSA9PT0gR0xfVU5TSUdORURfSU5UXzI0XzhfV0VCR0wsXG4gICAgICAgICAgICAnZGVwdGggc3RlbmNpbCB0ZXh0dXJlIGZvcm1hdCBtdXN0IG1hdGNoIHR5cGUnKVxuICAgICAgICB9XG4gICAgICAgIGNoZWNrKFxuICAgICAgICAgICF0aGlzLmRhdGEgJiYgIWFycmF5ICYmICF0aGlzLmltYWdlICYmICF0aGlzLnZpZGVvICYmICF0aGlzLmNhbnZhcyxcbiAgICAgICAgICAnZGVwdGgvc3RlbmNpbCB0ZXh0dXJlcyBhcmUgZm9yIHJlbmRlcmluZyBvbmx5JylcbiAgICAgIH1cblxuICAgICAgLy8gQ29tcHV0ZSBjb2xvciBmb3JtYXQgYW5kIG51bWJlciBvZiBjaGFubmVsc1xuICAgICAgdmFyIGNvbG9yRm9ybWF0ID0gdGhpcy5mb3JtYXQgPSBjb2xvckZvcm1hdHNbZm9ybWF0XVxuICAgICAgaWYgKCF0aGlzLmNoYW5uZWxzKSB7XG4gICAgICAgIHN3aXRjaCAoY29sb3JGb3JtYXQpIHtcbiAgICAgICAgICBjYXNlIEdMX0xVTUlOQU5DRTpcbiAgICAgICAgICBjYXNlIEdMX0FMUEhBOlxuICAgICAgICAgIGNhc2UgR0xfREVQVEhfQ09NUE9ORU5UOlxuICAgICAgICAgICAgdGhpcy5jaGFubmVscyA9IDFcbiAgICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgICBjYXNlIEdMX0RFUFRIX1NURU5DSUw6XG4gICAgICAgICAgY2FzZSBHTF9MVU1JTkFOQ0VfQUxQSEE6XG4gICAgICAgICAgICB0aGlzLmNoYW5uZWxzID0gMlxuICAgICAgICAgICAgYnJlYWtcblxuICAgICAgICAgIGNhc2UgR0xfUkdCOlxuICAgICAgICAgICAgdGhpcy5jaGFubmVscyA9IDNcbiAgICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgdGhpcy5jaGFubmVscyA9IDRcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBDaGVjayB0aGF0IHRleHR1cmUgdHlwZSBpcyBzdXBwb3J0ZWRcbiAgICAgIHZhciB0eXBlID0gdGhpcy50eXBlXG4gICAgICBpZiAodHlwZSA9PT0gR0xfRkxPQVQpIHtcbiAgICAgICAgY2hlY2soZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9mbG9hdCxcbiAgICAgICAgICAnZmxvYXQgdGV4dHVyZSBub3Qgc3VwcG9ydGVkJylcbiAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gR0xfSEFMRl9GTE9BVF9PRVMpIHtcbiAgICAgICAgY2hlY2soZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9oYWxmX2Zsb2F0LFxuICAgICAgICAgICdoYWxmIGZsb2F0IHRleHR1cmUgbm90IHN1cHBvcnRlZCcpXG4gICAgICB9IGVsc2UgaWYgKCF0eXBlKSB7XG4gICAgICAgIGlmIChmb3JtYXQgPT09IEdMX0RFUFRIX0NPTVBPTkVOVCkge1xuICAgICAgICAgIHR5cGUgPSBHTF9VTlNJR05FRF9JTlRcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0eXBlID0gR0xfVU5TSUdORURfQllURVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICB0aGlzLnR5cGUgPSB0eXBlXG5cbiAgICAgIC8vIGFwcGx5IGNvbnZlcnNpb25cbiAgICAgIGlmIChuZWVkc0NvbnZlcnQpIHtcbiAgICAgICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9CWVRFOlxuICAgICAgICAgICAgdGhpcy5kYXRhID0gbmV3IFVpbnQ4QXJyYXkoYXJyYXkpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlQ6XG4gICAgICAgICAgICB0aGlzLmRhdGEgPSBuZXcgVWludDE2QXJyYXkoYXJyYXkpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfSU5UOlxuICAgICAgICAgICAgdGhpcy5kYXRhID0gbmV3IFVpbnQzMkFycmF5KGFycmF5KVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlIEdMX0ZMT0FUOlxuICAgICAgICAgICAgdGhpcy5kYXRhID0gbmV3IEZsb2F0MzJBcnJheShhcnJheSlcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSBHTF9IQUxGX0ZMT0FUX09FUzpcbiAgICAgICAgICAgIHRoaXMuZGF0YSA9IGNvbnZlcnRUb0hhbGZGbG9hdChhcnJheSlcbiAgICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUXzVfNl81OlxuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlRfNV81XzVfMTpcbiAgICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUXzRfNF80XzQ6XG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9JTlRfMjRfOF9XRUJHTDpcbiAgICAgICAgICAgIGNoZWNrLnJhaXNlKCd1bnN1cHBvcnRlZCBmb3JtYXQgZm9yIGF1dG9tYXRpYyBjb252ZXJzaW9uJylcbiAgICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgY2hlY2sucmFpc2UoJ3Vuc3VwcG9ydGVkIHR5cGUgY29udmVyc2lvbicpXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMuZGF0YSkge1xuICAgICAgICAvLyBhcHBseSB0cmFuc3Bvc2VcbiAgICAgICAgaWYgKHRoaXMubmVlZHNUcmFuc3Bvc2UpIHtcbiAgICAgICAgICB0aGlzLmRhdGEgPSB0cmFuc3Bvc2VQaXhlbHMoXG4gICAgICAgICAgICB0aGlzLmRhdGEsXG4gICAgICAgICAgICB0aGlzLndpZHRoLFxuICAgICAgICAgICAgdGhpcy5oZWlnaHQsXG4gICAgICAgICAgICB0aGlzLmNoYW5uZWxzLFxuICAgICAgICAgICAgdGhpcy5zdHJpZGVYLFxuICAgICAgICAgICAgdGhpcy5zdHJpZGVZLFxuICAgICAgICAgICAgdGhpcy5zdHJpZGVDLFxuICAgICAgICAgICAgdGhpcy5vZmZzZXQpXG4gICAgICAgIH1cbiAgICAgICAgLy8gY2hlY2sgZGF0YSB0eXBlXG4gICAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfQllURTpcbiAgICAgICAgICAgIGNoZWNrKHRoaXMuZGF0YSBpbnN0YW5jZW9mIFVpbnQ4QXJyYXkgfHxcbiAgICAgICAgICAgICAgICAgIHRoaXMuZGF0YSBpbnN0YW5jZW9mIFVpbnQ4Q2xhbXBlZEFycmF5LFxuICAgICAgICAgICAgICAgICAgJ2luY29tcGF0aWJsZSBwaXhlbCB0eXBlJylcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9TSE9SVF81XzZfNTpcbiAgICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUXzVfNV81XzE6XG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9TSE9SVF80XzRfNF80OlxuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlQ6XG4gICAgICAgICAgY2FzZSBHTF9IQUxGX0ZMT0FUX09FUzpcbiAgICAgICAgICAgIGNoZWNrKHRoaXMuZGF0YSBpbnN0YW5jZW9mIFVpbnQxNkFycmF5LFxuICAgICAgICAgICAgICAgICAgJ2luY29tcGF0aWJsZSBwaXhlbCB0eXBlJylcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9JTlQ6XG4gICAgICAgICAgICBjaGVjayh0aGlzLmRhdGEgaW5zdGFuY2VvZiBVaW50MzJBcnJheSxcbiAgICAgICAgICAgICAgICAgICdpbmNvbXBhdGlibGUgcGl4ZWwgdHlwZScpXG4gICAgICAgICAgICBicmVha1xuXG4gICAgICAgICAgY2FzZSBHTF9GTE9BVDpcbiAgICAgICAgICAgIGNoZWNrKHRoaXMuZGF0YSBpbnN0YW5jZW9mIEZsb2F0MzJBcnJheSxcbiAgICAgICAgICAgICAgICAgICdpbmNvbXBhdGlibGUgcGl4ZWwgdHlwZScpXG4gICAgICAgICAgICBicmVha1xuXG4gICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIGNoZWNrLnJhaXNlKCdiYWQgb3IgbWlzc2luZyBwaXhlbCB0eXBlJylcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICB0aGlzLm5lZWRzVHJhbnNwb3NlID0gZmFsc2VcbiAgICB9LFxuXG4gICAgc2V0RGVmYXVsdEZvcm1hdDogZnVuY3Rpb24gKCkge1xuICAgICAgdGhpcy5mb3JtYXQgPSB0aGlzLmludGVybmFsZm9ybWF0ID0gR0xfUkdCQVxuICAgICAgdGhpcy50eXBlID0gR0xfVU5TSUdORURfQllURVxuICAgICAgdGhpcy5jaGFubmVscyA9IDRcbiAgICAgIHRoaXMuY29tcHJlc3NlZCA9IGZhbHNlXG4gICAgfSxcblxuICAgIHVwbG9hZDogZnVuY3Rpb24gKHBhcmFtcykge1xuICAgICAgZ2wucGl4ZWxTdG9yZWkoR0xfVU5QQUNLX0ZMSVBfWV9XRUJHTCwgdGhpcy5mbGlwWSlcbiAgICAgIGdsLnBpeGVsU3RvcmVpKEdMX1VOUEFDS19QUkVNVUxUSVBMWV9BTFBIQV9XRUJHTCwgdGhpcy5wcmVtdWx0aXBseUFscGhhKVxuICAgICAgZ2wucGl4ZWxTdG9yZWkoR0xfVU5QQUNLX0NPTE9SU1BBQ0VfQ09OVkVSU0lPTl9XRUJHTCwgdGhpcy5jb2xvclNwYWNlKVxuICAgICAgZ2wucGl4ZWxTdG9yZWkoR0xfVU5QQUNLX0FMSUdOTUVOVCwgdGhpcy51bnBhY2tBbGlnbm1lbnQpXG5cbiAgICAgIHZhciB0YXJnZXQgPSB0aGlzLnRhcmdldFxuICAgICAgdmFyIG1pcGxldmVsID0gdGhpcy5taXBsZXZlbFxuICAgICAgdmFyIGltYWdlID0gdGhpcy5pbWFnZVxuICAgICAgdmFyIGNhbnZhcyA9IHRoaXMuY2FudmFzXG4gICAgICB2YXIgdmlkZW8gPSB0aGlzLnZpZGVvXG4gICAgICB2YXIgZGF0YSA9IHRoaXMuZGF0YVxuICAgICAgdmFyIGludGVybmFsZm9ybWF0ID0gdGhpcy5pbnRlcm5hbGZvcm1hdFxuICAgICAgdmFyIGZvcm1hdCA9IHRoaXMuZm9ybWF0XG4gICAgICB2YXIgdHlwZSA9IHRoaXMudHlwZVxuICAgICAgdmFyIHdpZHRoID0gdGhpcy53aWR0aCB8fCBNYXRoLm1heCgxLCBwYXJhbXMud2lkdGggPj4gbWlwbGV2ZWwpXG4gICAgICB2YXIgaGVpZ2h0ID0gdGhpcy5oZWlnaHQgfHwgTWF0aC5tYXgoMSwgcGFyYW1zLmhlaWdodCA+PiBtaXBsZXZlbClcbiAgICAgIGlmICh2aWRlbyAmJiB2aWRlby5yZWFkeVN0YXRlID4gMikge1xuICAgICAgICBnbC50ZXhJbWFnZTJEKHRhcmdldCwgbWlwbGV2ZWwsIGZvcm1hdCwgZm9ybWF0LCB0eXBlLCB2aWRlbylcbiAgICAgIH0gZWxzZSBpZiAoaW1hZ2UgJiYgaW1hZ2UuY29tcGxldGUpIHtcbiAgICAgICAgZ2wudGV4SW1hZ2UyRCh0YXJnZXQsIG1pcGxldmVsLCBmb3JtYXQsIGZvcm1hdCwgdHlwZSwgaW1hZ2UpXG4gICAgICB9IGVsc2UgaWYgKGNhbnZhcykge1xuICAgICAgICBnbC50ZXhJbWFnZTJEKHRhcmdldCwgbWlwbGV2ZWwsIGZvcm1hdCwgZm9ybWF0LCB0eXBlLCBjYW52YXMpXG4gICAgICB9IGVsc2UgaWYgKHRoaXMuY29tcHJlc3NlZCkge1xuICAgICAgICBnbC5jb21wcmVzc2VkVGV4SW1hZ2UyRCh0YXJnZXQsIG1pcGxldmVsLCBpbnRlcm5hbGZvcm1hdCwgd2lkdGgsIGhlaWdodCwgMCwgZGF0YSlcbiAgICAgIH0gZWxzZSBpZiAodGhpcy5jb3B5KSB7XG4gICAgICAgIHJlZ2xQb2xsKClcbiAgICAgICAgZ2wuY29weVRleEltYWdlMkQodGFyZ2V0LCBtaXBsZXZlbCwgZm9ybWF0LCB0aGlzLngsIHRoaXMueSwgd2lkdGgsIGhlaWdodCwgMClcbiAgICAgIH0gZWxzZSBpZiAoZGF0YSkge1xuICAgICAgICBnbC50ZXhJbWFnZTJEKHRhcmdldCwgbWlwbGV2ZWwsIGZvcm1hdCwgd2lkdGgsIGhlaWdodCwgMCwgZm9ybWF0LCB0eXBlLCBkYXRhKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZ2wudGV4SW1hZ2UyRCh0YXJnZXQsIG1pcGxldmVsLCBmb3JtYXQsIHdpZHRoIHx8IDEsIGhlaWdodCB8fCAxLCAwLCBmb3JtYXQsIHR5cGUsIG51bGwpXG4gICAgICB9XG4gICAgfVxuICB9KVxuXG4gIGZ1bmN0aW9uIFRleFBhcmFtcyAodGFyZ2V0KSB7XG4gICAgdGhpcy50YXJnZXQgPSB0YXJnZXRcblxuICAgIC8vIERlZmF1bHQgaW1hZ2Ugc2hhcGUgaW5mb1xuICAgIHRoaXMud2lkdGggPSAwXG4gICAgdGhpcy5oZWlnaHQgPSAwXG4gICAgdGhpcy5mb3JtYXQgPSAwXG4gICAgdGhpcy5pbnRlcm5hbGZvcm1hdCA9IDBcbiAgICB0aGlzLnR5cGUgPSAwXG5cbiAgICAvLyB3cmFwIG1vZGVcbiAgICB0aGlzLndyYXBTID0gR0xfQ0xBTVBfVE9fRURHRVxuICAgIHRoaXMud3JhcFQgPSBHTF9DTEFNUF9UT19FREdFXG5cbiAgICAvLyBmaWx0ZXJpbmdcbiAgICB0aGlzLm1pbkZpbHRlciA9IDBcbiAgICB0aGlzLm1hZ0ZpbHRlciA9IEdMX05FQVJFU1RcbiAgICB0aGlzLmFuaXNvdHJvcGljID0gMVxuXG4gICAgLy8gbWlwbWFwc1xuICAgIHRoaXMuZ2VuTWlwbWFwcyA9IGZhbHNlXG4gICAgdGhpcy5taXBtYXBIaW50ID0gR0xfRE9OVF9DQVJFXG4gIH1cblxuICBPYmplY3QuYXNzaWduKFRleFBhcmFtcy5wcm90b3R5cGUsIHtcbiAgICBwYXJzZTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucyAhPT0gJ29iamVjdCcgfHwgIW9wdGlvbnMpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG5cbiAgICAgIGlmICgnbWluJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBtaW5GaWx0ZXIgPSBvcHRpb25zLm1pblxuICAgICAgICBjaGVjay5wYXJhbWV0ZXIobWluRmlsdGVyLCBtaW5GaWx0ZXJzKVxuICAgICAgICB0aGlzLm1pbkZpbHRlciA9IG1pbkZpbHRlcnNbbWluRmlsdGVyXVxuICAgICAgfVxuXG4gICAgICBpZiAoJ21hZycgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgbWFnRmlsdGVyID0gb3B0aW9ucy5tYWdcbiAgICAgICAgY2hlY2sucGFyYW1ldGVyKG1hZ0ZpbHRlciwgbWFnRmlsdGVycylcbiAgICAgICAgdGhpcy5tYWdGaWx0ZXIgPSBtYWdGaWx0ZXJzW21hZ0ZpbHRlcl1cbiAgICAgIH1cblxuICAgICAgdmFyIHdyYXBTID0gdGhpcy53cmFwU1xuICAgICAgdmFyIHdyYXBUID0gdGhpcy53cmFwVFxuICAgICAgaWYgKCd3cmFwJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciB3cmFwID0gb3B0aW9ucy53cmFwXG4gICAgICAgIGlmICh0eXBlb2Ygd3JhcCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICBjaGVjay5wYXJhbWV0ZXIod3JhcCwgd3JhcE1vZGVzKVxuICAgICAgICAgIHdyYXBTID0gd3JhcFQgPSB3cmFwTW9kZXNbd3JhcF1cbiAgICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KHdyYXApKSB7XG4gICAgICAgICAgY2hlY2sucGFyYW1ldGVyKHdyYXBbMF0sIHdyYXBNb2RlcylcbiAgICAgICAgICBjaGVjay5wYXJhbWV0ZXIod3JhcFsxXSwgd3JhcE1vZGVzKVxuICAgICAgICAgIHdyYXBTID0gd3JhcE1vZGVzW3dyYXBbMF1dXG4gICAgICAgICAgd3JhcFQgPSB3cmFwTW9kZXNbd3JhcFsxXV1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKCd3cmFwUycgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHZhciBvcHRXcmFwUyA9IG9wdGlvbnMud3JhcFNcbiAgICAgICAgICBjaGVjay5wYXJhbWV0ZXIob3B0V3JhcFMsIHdyYXBNb2RlcylcbiAgICAgICAgICB3cmFwUyA9IHdyYXBNb2Rlc1tvcHRXcmFwU11cbiAgICAgICAgfVxuICAgICAgICBpZiAoJ3dyYXBUJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgdmFyIG9wdFdyYXBUID0gb3B0aW9ucy53cmFwVFxuICAgICAgICAgIGNoZWNrLnBhcmFtZXRlcihvcHRXcmFwVCwgd3JhcE1vZGVzKVxuICAgICAgICAgIHdyYXBUID0gd3JhcE1vZGVzW29wdFdyYXBUXVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICB0aGlzLndyYXBTID0gd3JhcFNcbiAgICAgIHRoaXMud3JhcFQgPSB3cmFwVFxuXG4gICAgICBpZiAoJ2FuaXNvdHJvcGljJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBhbmlzb3Ryb3BpYyA9IG9wdGlvbnMuYW5pc290cm9waWNcbiAgICAgICAgY2hlY2sodHlwZW9mIGFuaXNvdHJvcGljID09PSAnbnVtYmVyJyAmJlxuICAgICAgICAgICBhbmlzb3Ryb3BpYyA+PSAxICYmIGFuaXNvdHJvcGljIDw9IGxpbWl0cy5tYXhBbmlzb3Ryb3BpYyxcbiAgICAgICAgICAnYW5pc28gc2FtcGxlcyBtdXN0IGJlIGJldHdlZW4gMSBhbmQgJylcbiAgICAgICAgdGhpcy5hbmlzb3Ryb3BpYyA9IG9wdGlvbnMuYW5pc290cm9waWNcbiAgICAgIH1cblxuICAgICAgaWYgKCdtaXBtYXAnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIG1pcG1hcCA9IG9wdGlvbnMubWlwbWFwXG4gICAgICAgIHN3aXRjaCAodHlwZW9mIG1pcG1hcCkge1xuICAgICAgICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICAgICAgICBjaGVjay5wYXJhbWV0ZXIobWlwbWFwLCBtaXBtYXBIaW50LFxuICAgICAgICAgICAgICAnaW52YWxpZCBtaXBtYXAgaGludCcpXG4gICAgICAgICAgICB0aGlzLm1pcG1hcEhpbnQgPSBtaXBtYXBIaW50W21pcG1hcF1cbiAgICAgICAgICAgIHRoaXMuZ2VuTWlwbWFwcyA9IHRydWVcbiAgICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgICBjYXNlICdib29sZWFuJzpcbiAgICAgICAgICAgIHRoaXMuZ2VuTWlwbWFwcyA9ICEhbWlwbWFwXG4gICAgICAgICAgICBicmVha1xuXG4gICAgICAgICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgY2hlY2sucmFpc2UoJ2ludmFsaWQgbWlwbWFwIHR5cGUnKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcblxuICAgIHVwbG9hZDogZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIHRhcmdldCA9IHRoaXMudGFyZ2V0XG4gICAgICBnbC50ZXhQYXJhbWV0ZXJpKHRhcmdldCwgR0xfVEVYVFVSRV9NSU5fRklMVEVSLCB0aGlzLm1pbkZpbHRlcilcbiAgICAgIGdsLnRleFBhcmFtZXRlcmkodGFyZ2V0LCBHTF9URVhUVVJFX01BR19GSUxURVIsIHRoaXMubWFnRmlsdGVyKVxuICAgICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfV1JBUF9TLCB0aGlzLndyYXBTKVxuICAgICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfV1JBUF9ULCB0aGlzLndyYXBUKVxuICAgICAgaWYgKGV4dGVuc2lvbnMuZXh0X3RleHR1cmVfZmlsdGVyX2FuaXNvdHJvcGljKSB7XG4gICAgICAgIGdsLnRleFBhcmFtZXRlcmkodGFyZ2V0LCBHTF9URVhUVVJFX01BWF9BTklTT1RST1BZX0VYVCwgdGhpcy5hbmlzb3Ryb3BpYylcbiAgICAgIH1cbiAgICAgIGlmICh0aGlzLmdlbk1pcG1hcHMpIHtcbiAgICAgICAgZ2wuaGludChHTF9HRU5FUkFURV9NSVBNQVBfSElOVCwgdGhpcy5taXBtYXBIaW50KVxuICAgICAgICBnbC5nZW5lcmF0ZU1pcG1hcCh0YXJnZXQpXG4gICAgICB9XG4gICAgfVxuICB9KVxuXG4gIC8vIEZpbmFsIHBhc3MgdG8gbWVyZ2UgcGFyYW1zIGFuZCBwaXhlbCBkYXRhXG4gIGZ1bmN0aW9uIGNoZWNrVGV4dHVyZUNvbXBsZXRlIChwYXJhbXMsIHBpeGVscykge1xuICAgIHZhciBpLCBwaXhtYXBcblxuICAgIHZhciB0eXBlID0gMFxuICAgIHZhciBmb3JtYXQgPSAwXG4gICAgdmFyIGludGVybmFsZm9ybWF0ID0gMFxuICAgIHZhciB3aWR0aCA9IDBcbiAgICB2YXIgaGVpZ2h0ID0gMFxuICAgIHZhciBjaGFubmVscyA9IDBcbiAgICB2YXIgY29tcHJlc3NlZCA9IGZhbHNlXG4gICAgdmFyIG5lZWRzUG9sbCA9IGZhbHNlXG4gICAgdmFyIG5lZWRzTGlzdGVuZXJzID0gZmFsc2VcbiAgICB2YXIgbWlwTWFzazJEID0gMFxuICAgIHZhciBtaXBNYXNrQ3ViZSA9IFswLCAwLCAwLCAwLCAwLCAwXVxuICAgIHZhciBjdWJlTWFzayA9IDBcbiAgICB2YXIgaGFzTWlwID0gZmFsc2VcbiAgICBmb3IgKGkgPSAwOyBpIDwgcGl4ZWxzLmxlbmd0aDsgKytpKSB7XG4gICAgICBwaXhtYXAgPSBwaXhlbHNbaV1cbiAgICAgIHdpZHRoID0gd2lkdGggfHwgKHBpeG1hcC53aWR0aCA8PCBwaXhtYXAubWlwbGV2ZWwpXG4gICAgICBoZWlnaHQgPSBoZWlnaHQgfHwgKHBpeG1hcC5oZWlnaHQgPDwgcGl4bWFwLm1pcGxldmVsKVxuICAgICAgdHlwZSA9IHR5cGUgfHwgcGl4bWFwLnR5cGVcbiAgICAgIGZvcm1hdCA9IGZvcm1hdCB8fCBwaXhtYXAuZm9ybWF0XG4gICAgICBpbnRlcm5hbGZvcm1hdCA9IGludGVybmFsZm9ybWF0IHx8IHBpeG1hcC5pbnRlcm5hbGZvcm1hdFxuICAgICAgY2hhbm5lbHMgPSBjaGFubmVscyB8fCBwaXhtYXAuY2hhbm5lbHNcbiAgICAgIG5lZWRzUG9sbCA9IG5lZWRzUG9sbCB8fCBwaXhtYXAubmVlZHNQb2xsXG4gICAgICBuZWVkc0xpc3RlbmVycyA9IG5lZWRzTGlzdGVuZXJzIHx8IHBpeG1hcC5uZWVkc0xpc3RlbmVyc1xuICAgICAgY29tcHJlc3NlZCA9IGNvbXByZXNzZWQgfHwgcGl4bWFwLmNvbXByZXNzZWRcblxuICAgICAgdmFyIG1pcGxldmVsID0gcGl4bWFwLm1pcGxldmVsXG4gICAgICB2YXIgdGFyZ2V0ID0gcGl4bWFwLnRhcmdldFxuICAgICAgaGFzTWlwID0gaGFzTWlwIHx8IChtaXBsZXZlbCA+IDApXG4gICAgICBpZiAodGFyZ2V0ID09PSBHTF9URVhUVVJFXzJEKSB7XG4gICAgICAgIG1pcE1hc2syRCB8PSAoMSA8PCBtaXBsZXZlbClcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBmYWNlID0gdGFyZ2V0IC0gR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YXG4gICAgICAgIG1pcE1hc2tDdWJlW2ZhY2VdIHw9ICgxIDw8IG1pcGxldmVsKVxuICAgICAgICBjdWJlTWFzayB8PSAoMSA8PCBmYWNlKVxuICAgICAgfVxuICAgIH1cblxuICAgIHBhcmFtcy5uZWVkc1BvbGwgPSBuZWVkc1BvbGxcbiAgICBwYXJhbXMubmVlZHNMaXN0ZW5lcnMgPSBuZWVkc0xpc3RlbmVyc1xuICAgIHBhcmFtcy53aWR0aCA9IHdpZHRoXG4gICAgcGFyYW1zLmhlaWdodCA9IGhlaWdodFxuICAgIHBhcmFtcy5mb3JtYXQgPSBmb3JtYXRcbiAgICBwYXJhbXMuaW50ZXJuYWxmb3JtYXQgPSBpbnRlcm5hbGZvcm1hdFxuICAgIHBhcmFtcy50eXBlID0gdHlwZVxuXG4gICAgdmFyIG1pcE1hc2sgPSBoYXNNaXAgPyAod2lkdGggPDwgMSkgLSAxIDogMVxuICAgIGlmIChwYXJhbXMudGFyZ2V0ID09PSBHTF9URVhUVVJFXzJEKSB7XG4gICAgICBjaGVjayhjdWJlTWFzayA9PT0gMCxcbiAgICAgICAgJ3BpeG1hcCB0eXBlIG11c3Qgbm90IGNvbnRhaW4gY3ViZW1hcCBmYWNlcycpXG4gICAgICBjaGVjayhtaXBNYXNrMkQgPT09IG1pcE1hc2ssICdtaXNzaW5nIG1pcCBtYXAgZGF0YScpXG4gICAgfSBlbHNlIHtcbiAgICAgIGNoZWNrKGN1YmVNYXNrID09PSAoKDEgPDwgNikgLSAxKSwgJ21pc3NpbmcgY3ViZW1hcCBmYWNlcycpXG4gICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgIGNoZWNrKG1pcE1hc2tDdWJlW2ldID09PSBtaXBNYXNrLCAnbWlzc2luZyBtaXAgbWFwIGRhdGEnKVxuICAgICAgfVxuICAgIH1cblxuICAgIHZhciBtaXBGaWx0ZXIgPSAoTUlQTUFQX0ZJTFRFUlMuaW5kZXhPZihwYXJhbXMubWluRmlsdGVyKSA+PSAwKVxuICAgIHBhcmFtcy5nZW5NaXBtYXBzID0gIWhhc01pcCAmJiAocGFyYW1zLmdlbk1pcG1hcHMgfHwgbWlwRmlsdGVyKVxuICAgIHZhciB1c2VNaXBtYXBzID0gaGFzTWlwIHx8IHBhcmFtcy5nZW5NaXBtYXBzXG5cbiAgICBpZiAoIXBhcmFtcy5taW5GaWx0ZXIpIHtcbiAgICAgIHBhcmFtcy5taW5GaWx0ZXIgPSB1c2VNaXBtYXBzXG4gICAgICAgID8gR0xfTElORUFSX01JUE1BUF9MSU5FQVJcbiAgICAgICAgOiBHTF9ORUFSRVNUXG4gICAgfSBlbHNlIHtcbiAgICAgIGNoZWNrKHVzZU1pcG1hcHMgPT09IG1pcEZpbHRlcixcbiAgICAgICAgJ21pbiBmaWx0ZXIgaW5jb25zaXN0ZW50IHdpdGggbWlwbWFwIGRhdGEnKVxuICAgIH1cblxuICAgIGlmICh1c2VNaXBtYXBzKSB7XG4gICAgICBjaGVjayh3aWR0aCA9PT0gaGVpZ2h0ICYmIGlzUG93Mih3aWR0aCksXG4gICAgICAgICdtdXN0IGJlIGEgc3F1YXJlIHBvd2VyIG9mIDIgdG8gc3VwcG9ydCBtaXBtYXBzJylcbiAgICB9XG5cbiAgICBpZiAocGFyYW1zLmdlbk1pcG1hcHMpIHtcbiAgICAgIGNoZWNrKCFjb21wcmVzc2VkLCAnbWlwbWFwIGdlbmVyYXRpb24gbm90IHN1cHBvcnRlZCBmb3IgY29tcHJlc3NlZCB0ZXh0dXJlcycpXG4gICAgfVxuXG4gICAgcGFyYW1zLndyYXBTID0gcGFyYW1zLndyYXBTIHx8IEdMX0NMQU1QX1RPX0VER0VcbiAgICBwYXJhbXMud3JhcFQgPSBwYXJhbXMud3JhcFQgfHwgR0xfQ0xBTVBfVE9fRURHRVxuICAgIGlmIChwYXJhbXMud3JhcFMgIT09IEdMX0NMQU1QX1RPX0VER0UgfHxcbiAgICAgICAgcGFyYW1zLndyYXBUICE9PSBHTF9DTEFNUF9UT19FREdFKSB7XG4gICAgICBjaGVjayhpc1BvdzIod2lkdGgpICYmIGlzUG93MihoZWlnaHQpICYmICFjdWJlTWFzayxcbiAgICAgICAgJ2luY29tcGF0aWJsZSBzaXplIGZvciB3cmFwIG1vZGUsIGltYWdlIG11c3QgYmUgYSBwb3dlciBvZiAyJylcbiAgICB9XG5cbiAgICBpZiAoKHR5cGUgPT09IEdMX0ZMT0FUICYmICFleHRlbnNpb25zLm9lc190ZXh0dXJlX2Zsb2F0X2xpbmVhcikgfHxcbiAgICAgICAgKHR5cGUgPT09IEdMX0hBTEZfRkxPQVRfT0VTICYmXG4gICAgICAgICAgIWV4dGVuc2lvbnMub2VzX3RleHR1cmVfaGFsZl9mbG9hdF9saW5lYXIpKSB7XG4gICAgICBjaGVjayh0aGlzLm1hZ0ZpbHRlciA9PT0gR0xfTkVBUkVTVCAmJiB0aGlzLm1pbkZpbHRlciA9PT0gR0xfTkVBUkVTVCxcbiAgICAgICAgJ3Vuc3VwcG9ydGVkIGZpbHRlciBtb2RlIGZvciBmbG9hdCB0ZXh0dXJlJylcbiAgICB9XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgcGl4ZWxzLmxlbmd0aDsgKytpKSB7XG4gICAgICBwaXhtYXAgPSBwaXhlbHNbaV1cbiAgICAgIHZhciBsZXZlbCA9IHBpeG1hcC5taXBsZXZlbFxuICAgICAgaWYgKHBpeG1hcC53aWR0aCkge1xuICAgICAgICBjaGVjayhwaXhtYXAud2lkdGggPDwgbGV2ZWwgPT09IHdpZHRoLCAnaW5jb25zaXN0ZW50IHdpZHRoJylcbiAgICAgIH1cbiAgICAgIGlmIChwaXhtYXAuaGVpZ2h0KSB7XG4gICAgICAgIGNoZWNrKHBpeG1hcC5oZWlnaHQgPDwgbGV2ZWwgPT09IGhlaWdodCwgJ2luY29uc2lzdGVudCB3aWR0aCcpXG4gICAgICB9XG4gICAgICBpZiAocGl4bWFwLmNoYW5uZWxzKSB7XG4gICAgICAgIGNoZWNrKHBpeG1hcC5jaGFubmVscyA9PT0gY2hhbm5lbHMsICdpbmNvbnNpc3RlbnQgY2hhbm5lbHMnKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGl4bWFwLmNoYW5uZWxzID0gY2hhbm5lbHNcbiAgICAgIH1cbiAgICAgIGlmIChwaXhtYXAuZm9ybWF0KSB7XG4gICAgICAgIGNoZWNrKHBpeG1hcC5mb3JtYXQgPT09IGZvcm1hdCwgJ2luY29uc2lzdGVudCBmb3JtYXQnKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGl4bWFwLmZvcm1hdCA9IGZvcm1hdFxuICAgICAgfVxuICAgICAgaWYgKHBpeG1hcC5pbnRlcm5hbGZvcm1hdCkge1xuICAgICAgICBjaGVjayhwaXhtYXAuaW50ZXJuYWxmb3JtYXQgPT09IGludGVybmFsZm9ybWF0LCAnaW5jb25zaXN0ZW50IGludGVybmFsZm9ybWF0JylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBpeG1hcC5pbnRlcm5hbGZvcm1hdCA9IGludGVybmFsZm9ybWF0XG4gICAgICB9XG4gICAgICBpZiAocGl4bWFwLnR5cGUpIHtcbiAgICAgICAgY2hlY2socGl4bWFwLnR5cGUgPT09IHR5cGUsICdpbmNvbnNpc3RlbnQgdHlwZScpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwaXhtYXAudHlwZSA9IHR5cGVcbiAgICAgIH1cbiAgICAgIGlmIChwaXhtYXAuY29weSkge1xuICAgICAgICBjaGVjayhwaXhtYXAudHlwZSA9PT0gR0xfVU5TSUdORURfQllURSAmJlxuICAgICAgICAgIHBpeG1hcC5pbnRlcm5hbGZvcm1hdCA9PT0gR0xfUkdCQSxcbiAgICAgICAgICAnaW5jb21wYXRpYmxlIGZvcm1hdC90eXBlIGZvciBjb3B5VGV4SW1hZ2UyRCcpXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgdmFyIGFjdGl2ZVRleHR1cmUgPSAwXG4gIHZhciB0ZXh0dXJlQ291bnQgPSAwXG4gIHZhciB0ZXh0dXJlU2V0ID0ge31cbiAgdmFyIHBvbGxTZXQgPSBbXVxuICB2YXIgbnVtVGV4VW5pdHMgPSBsaW1pdHMubWF4VGV4dHVyZVVuaXRzXG4gIHZhciB0ZXh0dXJlVW5pdHMgPSBBcnJheShudW1UZXhVbml0cykubWFwKGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gbnVsbFxuICB9KVxuXG4gIGZ1bmN0aW9uIFJFR0xUZXh0dXJlICh0YXJnZXQpIHtcbiAgICB0aGlzLmlkID0gdGV4dHVyZUNvdW50KytcbiAgICB0aGlzLnJlZkNvdW50ID0gMVxuXG4gICAgdGhpcy50YXJnZXQgPSB0YXJnZXRcbiAgICB0aGlzLnRleHR1cmUgPSBudWxsXG5cbiAgICB0aGlzLnBvbGxJZCA9IC0xXG5cbiAgICB0aGlzLnVuaXQgPSAtMVxuICAgIHRoaXMuYmluZENvdW50ID0gMFxuXG4gICAgLy8gY2FuY2VscyBhbGwgcGVuZGluZyBjYWxsYmFja3NcbiAgICB0aGlzLmNhbmNlbFBlbmRpbmcgPSBudWxsXG5cbiAgICAvLyBwYXJzZWQgdXNlciBpbnB1dHNcbiAgICB0aGlzLnBhcmFtcyA9IG5ldyBUZXhQYXJhbXModGFyZ2V0KVxuICAgIHRoaXMucGl4ZWxzID0gW11cbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZSAodGV4dHVyZSwgb3B0aW9ucykge1xuICAgIHZhciBpXG4gICAgY2xlYXJMaXN0ZW5lcnModGV4dHVyZSlcblxuICAgIC8vIENsZWFyIHBhcmFtZXRlcnMgYW5kIHBpeGVsIGRhdGFcbiAgICB2YXIgcGFyYW1zID0gdGV4dHVyZS5wYXJhbXNcbiAgICBUZXhQYXJhbXMuY2FsbChwYXJhbXMsIHRleHR1cmUudGFyZ2V0KVxuICAgIHZhciBwaXhlbHMgPSB0ZXh0dXJlLnBpeGVsc1xuICAgIHBpeGVscy5sZW5ndGggPSAwXG5cbiAgICAvLyBwYXJzZSBwYXJhbWV0ZXJzXG4gICAgcGFyYW1zLnBhcnNlKG9wdGlvbnMpXG5cbiAgICAvLyBwYXJzZSBwaXhlbCBkYXRhXG4gICAgZnVuY3Rpb24gcGFyc2VNaXAgKHRhcmdldCwgZGF0YSkge1xuICAgICAgdmFyIG1pcG1hcCA9IGRhdGEubWlwbWFwXG4gICAgICB2YXIgcGl4bWFwXG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShtaXBtYXApKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbWlwbWFwLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgcGl4bWFwID0gbmV3IFBpeGVsSW5mbyh0YXJnZXQpXG4gICAgICAgICAgcGl4bWFwLnBhcnNlRmxhZ3Mob3B0aW9ucylcbiAgICAgICAgICBwaXhtYXAucGFyc2VGbGFncyhkYXRhKVxuICAgICAgICAgIHBpeG1hcC5wYXJzZShtaXBtYXBbaV0sIGkpXG4gICAgICAgICAgcGl4ZWxzLnB1c2gocGl4bWFwKVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwaXhtYXAgPSBuZXcgUGl4ZWxJbmZvKHRhcmdldClcbiAgICAgICAgcGl4bWFwLnBhcnNlRmxhZ3Mob3B0aW9ucylcbiAgICAgICAgcGl4bWFwLnBhcnNlKGRhdGEsIDApXG4gICAgICAgIHBpeGVscy5wdXNoKHBpeG1hcClcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKHRleHR1cmUudGFyZ2V0ID09PSBHTF9URVhUVVJFXzJEKSB7XG4gICAgICBwYXJzZU1pcChHTF9URVhUVVJFXzJELCBvcHRpb25zKVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgZmFjZXMgPSBvcHRpb25zLmZhY2VzIHx8IG9wdGlvbnNcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KGZhY2VzKSkge1xuICAgICAgICBjaGVjayhmYWNlcy5sZW5ndGggPT09IDYsXG4gICAgICAgICAgJ2ludmFsaWQgbnVtYmVyIG9mIGZhY2VzIGluIGN1YmUgbWFwJylcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICAgIHBhcnNlTWlwKEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCArIGksIGZhY2VzW2ldKVxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmYWNlcyA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgLy8gVE9ETyBSZWFkIGRkc1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gSW5pdGlhbGl6ZSB0byBhbGwgZW1wdHkgdGV4dHVyZXNcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICAgIHBhcnNlTWlwKEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCArIGksIHt9KVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gZG8gYSBzZWNvbmQgcGFzcyB0byByZWNvbmNpbGUgZGVmYXVsdHNcbiAgICBjaGVja1RleHR1cmVDb21wbGV0ZShwYXJhbXMsIHBpeGVscylcblxuICAgIGlmIChwYXJhbXMubmVlZHNMaXN0ZW5lcnMpIHtcbiAgICAgIGhvb2tMaXN0ZW5lcnModGV4dHVyZSlcbiAgICB9XG5cbiAgICBpZiAocGFyYW1zLm5lZWRzUG9sbCkge1xuICAgICAgdGV4dHVyZS5wb2xsSWQgPSBwb2xsU2V0Lmxlbmd0aFxuICAgICAgcG9sbFNldC5wdXNoKHRleHR1cmUpXG4gICAgfVxuXG4gICAgcmVmcmVzaCh0ZXh0dXJlKVxuICB9XG5cbiAgZnVuY3Rpb24gcmVmcmVzaCAodGV4dHVyZSkge1xuICAgIGlmICghZ2wuaXNUZXh0dXJlKHRleHR1cmUudGV4dHVyZSkpIHtcbiAgICAgIHRleHR1cmUudGV4dHVyZSA9IGdsLmNyZWF0ZVRleHR1cmUoKVxuICAgIH1cblxuICAgIC8vIExhenkgYmluZFxuICAgIHZhciB0YXJnZXQgPSB0ZXh0dXJlLnRhcmdldFxuICAgIHZhciB1bml0ID0gdGV4dHVyZS51bml0XG4gICAgaWYgKHVuaXQgPj0gMCkge1xuICAgICAgZ2wuYWN0aXZlVGV4dHVyZShHTF9URVhUVVJFMCArIHVuaXQpXG4gICAgICBhY3RpdmVUZXh0dXJlID0gdW5pdFxuICAgIH0gZWxzZSB7XG4gICAgICBnbC5iaW5kVGV4dHVyZSh0YXJnZXQsIHRleHR1cmUudGV4dHVyZSlcbiAgICB9XG5cbiAgICAvLyBVcGxvYWRcbiAgICB2YXIgcGl4ZWxzID0gdGV4dHVyZS5waXhlbHNcbiAgICB2YXIgcGFyYW1zID0gdGV4dHVyZS5wYXJhbXNcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHBpeGVscy5sZW5ndGg7ICsraSkge1xuICAgICAgcGl4ZWxzW2ldLnVwbG9hZChwYXJhbXMpXG4gICAgfVxuICAgIHBhcmFtcy51cGxvYWQoKVxuXG4gICAgLy8gTGF6eSB1bmJpbmRcbiAgICBpZiAodW5pdCA8IDApIHtcbiAgICAgIHZhciBhY3RpdmUgPSB0ZXh0dXJlVW5pdHNbYWN0aXZlVGV4dHVyZV1cbiAgICAgIGlmIChhY3RpdmUpIHtcbiAgICAgICAgLy8gcmVzdG9yZSBiaW5kaW5nIHN0YXRlXG4gICAgICAgIGdsLmJpbmRUZXh0dXJlKGFjdGl2ZS50YXJnZXQsIGFjdGl2ZS50ZXh0dXJlKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gb3RoZXJ3aXNlIGJlY29tZSBuZXcgYWN0aXZlXG4gICAgICAgIHRleHR1cmUudW5pdCA9IGFjdGl2ZVRleHR1cmVcbiAgICAgICAgdGV4dHVyZVVuaXRzW2FjdGl2ZVRleHR1cmVdID0gdGV4dHVyZVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGhvb2tMaXN0ZW5lcnMgKHRleHR1cmUpIHtcbiAgICB2YXIgcGFyYW1zID0gdGV4dHVyZS5wYXJhbXNcbiAgICB2YXIgcGl4ZWxzID0gdGV4dHVyZS5waXhlbHNcblxuICAgIC8vIEFwcGVuZHMgYWxsIHRoZSB0ZXh0dXJlIGRhdGEgZnJvbSB0aGUgYnVmZmVyIHRvIHRoZSBjdXJyZW50XG4gICAgZnVuY3Rpb24gYXBwZW5kRERTICh0YXJnZXQsIG1pcGxldmVsLCBidWZmZXIpIHtcbiAgICAgIHZhciBkZHMgPSBwYXJzZUREUyhidWZmZXIpXG5cbiAgICAgIGNoZWNrKGRkcy5mb3JtYXQgaW4gY29sb3JGb3JtYXRzLCAndW5zdXBwb3J0ZWQgZGRzIHRleHR1cmUgZm9ybWF0JylcblxuICAgICAgaWYgKGRkcy5jdWJlKSB7XG4gICAgICAgIGNoZWNrKHRleHR1cmUudGFyZ2V0ID09PSBHTF9URVhUVVJFX0NVQkVfTUFQKVxuXG4gICAgICAgIC8vIFRPRE8gaGFuZGxlIGN1YmUgbWFwIEREU1xuICAgICAgICBjaGVjay5yYWlzZSgnY3ViZSBtYXAgRERTIG5vdCB5ZXQgaW1wbGVtZW50ZWQnKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY2hlY2sodGV4dHVyZS50YXJnZXQgPT09IEdMX1RFWFRVUkVfMkQpXG4gICAgICB9XG5cbiAgICAgIGlmIChtaXBsZXZlbCkge1xuICAgICAgICBjaGVjayhkZHMucGl4ZWxzLmxlbmd0aCA9PT0gMSwgJ251bWJlciBvZiBtaXAgbGV2ZWxzIGluY29uc2lzdGVudCcpXG4gICAgICB9XG5cbiAgICAgIGRkcy5waXhlbHMuZm9yRWFjaChmdW5jdGlvbiAocGl4bWFwKSB7XG4gICAgICAgIHZhciBpbmZvID0gbmV3IFBpeGVsSW5mbyhkZHMuY3ViZSA/IHBpeG1hcC50YXJnZXQgOiB0YXJnZXQpXG5cbiAgICAgICAgaW5mby5jaGFubmVscyA9IGRkcy5jaGFubmVsc1xuICAgICAgICBpbmZvLmNvbXByZXNzZWQgPSBkZHMuY29tcHJlc3NlZFxuICAgICAgICBpbmZvLnR5cGUgPSBkZHMudHlwZVxuICAgICAgICBpbmZvLmludGVybmFsZm9ybWF0ID0gZGRzLmZvcm1hdFxuICAgICAgICBpbmZvLmZvcm1hdCA9IGNvbG9yRm9ybWF0c1tkZHMuZm9ybWF0XVxuXG4gICAgICAgIGluZm8ud2lkdGggPSBwaXhtYXAud2lkdGhcbiAgICAgICAgaW5mby5oZWlnaHQgPSBwaXhtYXAuaGVpZ2h0XG4gICAgICAgIGluZm8ubWlwbGV2ZWwgPSBwaXhtYXAubWlwbGV2ZWwgfHwgbWlwbGV2ZWxcbiAgICAgICAgaW5mby5kYXRhID0gcGl4bWFwLmRhdGFcblxuICAgICAgICBwaXhlbHMucHVzaChpbmZvKVxuICAgICAgfSlcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBvbkRhdGEgKCkge1xuICAgICAgLy8gVXBkYXRlIHNpemUgb2YgYW55IG5ld2x5IGxvYWRlZCBwaXhlbHNcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcGl4ZWxzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgIHZhciBwaXhlbERhdGEgPSBwaXhlbHNbaV1cbiAgICAgICAgdmFyIGltYWdlID0gcGl4ZWxEYXRhLmltYWdlXG4gICAgICAgIHZhciB2aWRlbyA9IHBpeGVsRGF0YS52aWRlb1xuICAgICAgICB2YXIgeGhyID0gcGl4ZWxEYXRhLnhoclxuICAgICAgICBpZiAoaW1hZ2UgJiYgaW1hZ2UuY29tcGxldGUpIHtcbiAgICAgICAgICBwaXhlbERhdGEud2lkdGggPSBpbWFnZS5uYXR1cmFsV2lkdGhcbiAgICAgICAgICBwaXhlbERhdGEuaGVpZ2h0ID0gaW1hZ2UubmF0dXJhbEhlaWdodFxuICAgICAgICB9IGVsc2UgaWYgKHZpZGVvICYmIHZpZGVvLnJlYWR5U3RhdGUgPiAyKSB7XG4gICAgICAgICAgcGl4ZWxEYXRhLndpZHRoID0gdmlkZW8ud2lkdGhcbiAgICAgICAgICBwaXhlbERhdGEuaGVpZ2h0ID0gdmlkZW8uaGVpZ2h0XG4gICAgICAgIH0gZWxzZSBpZiAoeGhyICYmIHhoci5yZWFkeVN0YXRlID09PSA0KSB7XG4gICAgICAgICAgcGl4ZWxzW2ldID0gcGl4ZWxzW3BpeGVscy5sZW5ndGggLSAxXVxuICAgICAgICAgIHBpeGVscy5wb3AoKVxuICAgICAgICAgIHhoci5yZW1vdmVFdmVudExpc3RlbmVyKCdyZWFkeXN0YXRlY2hhbmdlJywgcmVmcmVzaClcbiAgICAgICAgICBhcHBlbmRERFMocGl4ZWxEYXRhLnRhcmdldCwgcGl4ZWxEYXRhLm1pcGxldmVsLCB4aHIucmVzcG9uc2UpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGNoZWNrVGV4dHVyZUNvbXBsZXRlKHBhcmFtcywgcGl4ZWxzKVxuICAgICAgcmVmcmVzaCh0ZXh0dXJlKVxuICAgIH1cblxuICAgIHBpeGVscy5mb3JFYWNoKGZ1bmN0aW9uIChwaXhlbERhdGEpIHtcbiAgICAgIGlmIChwaXhlbERhdGEuaW1hZ2UgJiYgIXBpeGVsRGF0YS5pbWFnZS5jb21wbGV0ZSkge1xuICAgICAgICBwaXhlbERhdGEuaW1hZ2UuYWRkRXZlbnRMaXN0ZW5lcignbG9hZCcsIG9uRGF0YSlcbiAgICAgIH0gZWxzZSBpZiAocGl4ZWxEYXRhLnZpZGVvICYmIHBpeGVsRGF0YS5yZWFkeVN0YXRlIDwgMSkge1xuICAgICAgICBwaXhlbERhdGEudmlkZW8uYWRkRXZlbnRMaXN0ZW5lcigncHJvZ3Jlc3MnLCBvbkRhdGEpXG4gICAgICB9IGVsc2UgaWYgKHBpeGVsRGF0YS54aHIpIHtcbiAgICAgICAgcGl4ZWxEYXRhLnhoci5hZGRFdmVudExpc3RlbmVyKCdyZWFkeXN0YXRlY2hhbmdlJywgb25EYXRhKVxuICAgICAgfVxuICAgIH0pXG5cbiAgICB0ZXh0dXJlLmNhbmNlbFBlbmRpbmcgPSBmdW5jdGlvbiBkZXRhY2hMaXN0ZW5lcnMgKCkge1xuICAgICAgcGl4ZWxzLmZvckVhY2goZnVuY3Rpb24gKHBpeGVsRGF0YSkge1xuICAgICAgICBpZiAocGl4ZWxEYXRhLmltYWdlKSB7XG4gICAgICAgICAgcGl4ZWxEYXRhLmltYWdlLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2xvYWQnLCBvbkRhdGEpXG4gICAgICAgIH0gZWxzZSBpZiAocGl4ZWxEYXRhLnZpZGVvKSB7XG4gICAgICAgICAgcGl4ZWxEYXRhLnZpZGVvLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3Byb2dyZXNzJywgb25EYXRhKVxuICAgICAgICB9IGVsc2UgaWYgKHBpeGVsRGF0YS54aHIpIHtcbiAgICAgICAgICBwaXhlbERhdGEueGhyLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3JlYWR5c3RhdGVjaGFuZ2UnLCBvbkRhdGEpXG4gICAgICAgICAgcGl4ZWxEYXRhLnhoci5hYm9ydCgpXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gY2xlYXJMaXN0ZW5lcnMgKHRleHR1cmUpIHtcbiAgICB2YXIgY2FuY2VsUGVuZGluZyA9IHRleHR1cmUuY2FuY2VsUGVuZGluZ1xuICAgIGlmIChjYW5jZWxQZW5kaW5nKSB7XG4gICAgICBjYW5jZWxQZW5kaW5nKClcbiAgICAgIHRleHR1cmUuY2FuY2VsUGVuZGluZyA9IG51bGxcbiAgICB9XG4gICAgdmFyIGlkID0gdGV4dHVyZS5wb2xsSWRcbiAgICBpZiAoaWQgPj0gMCkge1xuICAgICAgdmFyIG90aGVyID0gcG9sbFNldFtpZF0gPSBwb2xsU2V0W3BvbGxTZXQubGVuZ3RoIC0gMV1cbiAgICAgIG90aGVyLmlkID0gaWRcbiAgICAgIHBvbGxTZXQucG9wKClcbiAgICAgIHRleHR1cmUucG9sbElkID0gLTFcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95ICh0ZXh0dXJlKSB7XG4gICAgdmFyIGhhbmRsZSA9IHRleHR1cmUudGV4dHVyZVxuICAgIGNoZWNrKGhhbmRsZSwgJ211c3Qgbm90IGRvdWJsZSBkZXN0cm95IHRleHR1cmUnKVxuICAgIHZhciB1bml0ID0gdGV4dHVyZS51bml0XG4gICAgdmFyIHRhcmdldCA9IHRleHR1cmUudGFyZ2V0XG4gICAgaWYgKHVuaXQgPj0gMCkge1xuICAgICAgZ2wuYWN0aXZlVGV4dHVyZShHTF9URVhUVVJFMCArIHVuaXQpXG4gICAgICBhY3RpdmVUZXh0dXJlID0gdW5pdFxuICAgICAgZ2wuYmluZFRleHR1cmUodGFyZ2V0LCBudWxsKVxuICAgICAgdGV4dHVyZVVuaXRzW3VuaXRdID0gbnVsbFxuICAgIH1cbiAgICBjbGVhckxpc3RlbmVycyh0ZXh0dXJlKVxuICAgIGlmIChnbC5pc1RleHR1cmUoaGFuZGxlKSkge1xuICAgICAgZ2wuZGVsZXRlVGV4dHVyZShoYW5kbGUpXG4gICAgfVxuICAgIHRleHR1cmUudGV4dHVyZSA9IG51bGxcbiAgICB0ZXh0dXJlLnBhcmFtcyA9IG51bGxcbiAgICB0ZXh0dXJlLnBpeGVscyA9IG51bGxcbiAgICB0ZXh0dXJlLnJlZkNvdW50ID0gMFxuICAgIGRlbGV0ZSB0ZXh0dXJlU2V0W3RleHR1cmUuaWRdXG4gIH1cblxuICBPYmplY3QuYXNzaWduKFJFR0xUZXh0dXJlLnByb3RvdHlwZSwge1xuICAgIGJpbmQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciB0ZXh0dXJlID0gdGhpc1xuICAgICAgdGV4dHVyZS5iaW5kQ291bnQgKz0gMVxuICAgICAgdmFyIHVuaXQgPSB0ZXh0dXJlLnVuaXRcbiAgICAgIGlmICh1bml0IDwgMCkge1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG51bVRleFVuaXRzOyArK2kpIHtcbiAgICAgICAgICB2YXIgb3RoZXIgPSB0ZXh0dXJlVW5pdHNbaV1cbiAgICAgICAgICBpZiAob3RoZXIpIHtcbiAgICAgICAgICAgIGlmIChvdGhlci5iaW5kQ291bnQgPiAwKSB7XG4gICAgICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBvdGhlci51bml0ID0gLTFcbiAgICAgICAgICB9XG4gICAgICAgICAgdGV4dHVyZVVuaXRzW2ldID0gdGV4dHVyZVxuICAgICAgICAgIHVuaXQgPSBpXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgfVxuICAgICAgICBpZiAodW5pdCA+PSBudW1UZXhVbml0cykge1xuICAgICAgICAgIGNoZWNrLnJhaXNlKCdpbnN1ZmZpY2llbnQgbnVtYmVyIG9mIHRleHR1cmUgdW5pdHMnKVxuICAgICAgICB9XG4gICAgICAgIHRleHR1cmUudW5pdCA9IHVuaXRcbiAgICAgICAgZ2wuYWN0aXZlVGV4dHVyZShHTF9URVhUVVJFMCArIHVuaXQpXG4gICAgICAgIGdsLmJpbmRUZXh0dXJlKHRleHR1cmUudGFyZ2V0LCB0ZXh0dXJlLnRleHR1cmUpXG4gICAgICAgIGFjdGl2ZVRleHR1cmUgPSB1bml0XG4gICAgICB9XG4gICAgICByZXR1cm4gdW5pdFxuICAgIH0sXG5cbiAgICB1bmJpbmQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHRoaXMuYmluZENvdW50IC09IDFcbiAgICB9LFxuXG4gICAgZGVjUmVmOiBmdW5jdGlvbiAoKSB7XG4gICAgICBpZiAoLS10aGlzLnJlZkNvdW50ID09PSAwKSB7XG4gICAgICAgIGRlc3Ryb3kodGhpcylcbiAgICAgIH1cbiAgICB9XG4gIH0pXG5cbiAgZnVuY3Rpb24gY3JlYXRlVGV4dHVyZSAob3B0aW9ucywgdGFyZ2V0KSB7XG4gICAgdmFyIHRleHR1cmUgPSBuZXcgUkVHTFRleHR1cmUodGFyZ2V0KVxuICAgIHRleHR1cmVTZXRbdGV4dHVyZS5pZF0gPSB0ZXh0dXJlXG5cbiAgICBmdW5jdGlvbiByZWdsVGV4dHVyZSAoYTAsIGExLCBhMiwgYTMsIGE0LCBhNSkge1xuICAgICAgdmFyIG9wdGlvbnMgPSBhMCB8fCB7fVxuICAgICAgaWYgKHRhcmdldCA9PT0gR0xfVEVYVFVSRV9DVUJFX01BUCAmJiBhcmd1bWVudHMubGVuZ3RoID09PSA2KSB7XG4gICAgICAgIG9wdGlvbnMgPSBbYTAsIGExLCBhMiwgYTMsIGE0LCBhNV1cbiAgICAgIH1cbiAgICAgIHVwZGF0ZSh0ZXh0dXJlLCBvcHRpb25zKVxuICAgICAgcmVnbFRleHR1cmUud2lkdGggPSB0ZXh0dXJlLnBhcmFtcy53aWR0aFxuICAgICAgcmVnbFRleHR1cmUuaGVpZ2h0ID0gdGV4dHVyZS5wYXJhbXMuaGVpZ2h0XG4gICAgICByZXR1cm4gcmVnbFRleHR1cmVcbiAgICB9XG5cbiAgICByZWdsVGV4dHVyZShvcHRpb25zKVxuXG4gICAgT2JqZWN0LmFzc2lnbihyZWdsVGV4dHVyZSwge1xuICAgICAgX3JlZ2xUeXBlOiAndGV4dHVyZScsXG4gICAgICBfdGV4dHVyZTogdGV4dHVyZSxcbiAgICAgIGRlc3Ryb3k6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGV4dHVyZS5kZWNSZWYoKVxuICAgICAgfVxuICAgIH0pXG5cbiAgICByZXR1cm4gcmVnbFRleHR1cmVcbiAgfVxuXG4gIC8vIENhbGxlZCBhZnRlciBjb250ZXh0IHJlc3RvcmVcbiAgZnVuY3Rpb24gcmVmcmVzaFRleHR1cmVzICgpIHtcbiAgICB2YWx1ZXModGV4dHVyZVNldCkuZm9yRWFjaChyZWZyZXNoKVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbnVtVGV4VW5pdHM7ICsraSkge1xuICAgICAgdGV4dHVyZVVuaXRzW2ldID0gbnVsbFxuICAgIH1cbiAgICBhY3RpdmVUZXh0dXJlID0gMFxuICAgIGdsLmFjdGl2ZVRleHR1cmUoR0xfVEVYVFVSRTApXG4gIH1cblxuICAvLyBDYWxsZWQgd2hlbiByZWdsIGlzIGRlc3Ryb3llZFxuICBmdW5jdGlvbiBkZXN0cm95VGV4dHVyZXMgKCkge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbnVtVGV4VW5pdHM7ICsraSkge1xuICAgICAgZ2wuYWN0aXZlVGV4dHVyZShHTF9URVhUVVJFMCArIGkpXG4gICAgICBnbC5iaW5kVGV4dHVyZShHTF9URVhUVVJFXzJELCBudWxsKVxuICAgICAgdGV4dHVyZVVuaXRzW2ldID0gbnVsbFxuICAgIH1cbiAgICBnbC5hY3RpdmVUZXh0dXJlKEdMX1RFWFRVUkUwKVxuICAgIGFjdGl2ZVRleHR1cmUgPSAwXG4gICAgdmFsdWVzKHRleHR1cmVTZXQpLmZvckVhY2goZGVzdHJveSlcbiAgfVxuXG4gIC8vIENhbGxlZCBvbmNlIHBlciByYWYsIHVwZGF0ZXMgdmlkZW8gdGV4dHVyZXNcbiAgZnVuY3Rpb24gcG9sbFRleHR1cmVzICgpIHtcbiAgICBwb2xsU2V0LmZvckVhY2gocmVmcmVzaClcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY3JlYXRlOiBjcmVhdGVUZXh0dXJlLFxuICAgIHJlZnJlc2g6IHJlZnJlc2hUZXh0dXJlcyxcbiAgICBjbGVhcjogZGVzdHJveVRleHR1cmVzLFxuICAgIHBvbGw6IHBvbGxUZXh0dXJlcyxcbiAgICBnZXRUZXh0dXJlOiBmdW5jdGlvbiAod3JhcHBlcikge1xuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY29udmVydFRvSGFsZkZsb2F0IChhcnJheSkge1xuICB2YXIgZmxvYXRzID0gbmV3IEZsb2F0MzJBcnJheShhcnJheSlcbiAgdmFyIHVpbnRzID0gbmV3IFVpbnQzMkFycmF5KGZsb2F0cy5idWZmZXIpXG4gIHZhciB1c2hvcnRzID0gbmV3IFVpbnQxNkFycmF5KGFycmF5Lmxlbmd0aClcblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGFycmF5Lmxlbmd0aDsgKytpKSB7XG4gICAgaWYgKGlzTmFOKGFycmF5W2ldKSkge1xuICAgICAgdXNob3J0c1tpXSA9IDB4ZmZmZlxuICAgIH0gZWxzZSBpZiAoYXJyYXlbaV0gPT09IEluZmluaXR5KSB7XG4gICAgICB1c2hvcnRzW2ldID0gMHg3YzAwXG4gICAgfSBlbHNlIGlmIChhcnJheVtpXSA9PT0gLUluZmluaXR5KSB7XG4gICAgICB1c2hvcnRzW2ldID0gMHhmYzAwXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciB4ID0gdWludHNbaV1cblxuICAgICAgdmFyIHNnbiA9ICh4ID4+PiAzMSkgPDwgMTVcbiAgICAgIHZhciBleHAgPSAoKHggPDwgMSkgPj4+IDI0KSAtIDEyN1xuICAgICAgdmFyIGZyYWMgPSAoeCA+PiAxMykgJiAoKDEgPDwgMTApIC0gMSlcblxuICAgICAgaWYgKGV4cCA8IC0yNCkge1xuICAgICAgICAvLyByb3VuZCBub24tcmVwcmVzZW50YWJsZSBkZW5vcm1hbHMgdG8gMFxuICAgICAgICB1c2hvcnRzW2ldID0gc2duXG4gICAgICB9IGVsc2UgaWYgKGV4cCA8IC0xNCkge1xuICAgICAgICAvLyBoYW5kbGUgZGVub3JtYWxzXG4gICAgICAgIHZhciBzID0gLTE0IC0gZXhwXG4gICAgICAgIHVzaG9ydHNbaV0gPSBzZ24gKyAoKGZyYWMgKyAoMSA8PCAxMCkpID4+IHMpXG4gICAgICB9IGVsc2UgaWYgKGV4cCA+IDE1KSB7XG4gICAgICAgIC8vIHJvdW5kIG92ZXJmbG93IHRvICsvLSBJbmZpbml0eVxuICAgICAgICB1c2hvcnRzW2ldID0gc2duICsgMHg3YzAwXG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBvdGhlcndpc2UgY29udmVydCBkaXJlY3RseVxuICAgICAgICB1c2hvcnRzW2ldID0gc2duICsgKChleHAgKyAxNSkgPDwgMTApICsgZnJhY1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB1c2hvcnRzXG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBVbmlmb3JtU3RhdGUgKCkge1xuICB2YXIgdW5pZm9ybVN0YXRlID0ge31cblxuICBmdW5jdGlvbiBkZWZVbmlmb3JtIChuYW1lKSB7XG4gICAgaWYgKG5hbWUgaW4gdW5pZm9ybVN0YXRlKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgdW5pZm9ybVN0YXRlW25hbWVdID0gWyBbMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMF0gXVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICB1bmlmb3JtczogdW5pZm9ybVN0YXRlLFxuICAgIGRlZjogZGVmVW5pZm9ybVxuICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChvYmopIHtcbiAgcmV0dXJuIE9iamVjdC5rZXlzKG9iaikubWFwKGZ1bmN0aW9uIChrZXkpIHsgcmV0dXJuIG9ialtrZXldIH0pXG59XG4iLCJ2YXIgY2hlY2sgPSByZXF1aXJlKCcuL2xpYi9jaGVjaycpXG52YXIgZ2V0Q29udGV4dCA9IHJlcXVpcmUoJy4vbGliL2NvbnRleHQnKVxudmFyIHdyYXBFeHRlbnNpb25zID0gcmVxdWlyZSgnLi9saWIvZXh0ZW5zaW9uJylcbnZhciB3cmFwTGltaXRzID0gcmVxdWlyZSgnLi9saWIvbGltaXRzJylcbnZhciB3cmFwQnVmZmVycyA9IHJlcXVpcmUoJy4vbGliL2J1ZmZlcicpXG52YXIgd3JhcEVsZW1lbnRzID0gcmVxdWlyZSgnLi9saWIvZWxlbWVudHMnKVxudmFyIHdyYXBUZXh0dXJlcyA9IHJlcXVpcmUoJy4vbGliL3RleHR1cmUnKVxudmFyIHdyYXBSZW5kZXJidWZmZXJzID0gcmVxdWlyZSgnLi9saWIvcmVuZGVyYnVmZmVyJylcbnZhciB3cmFwRnJhbWVidWZmZXJzID0gcmVxdWlyZSgnLi9saWIvZnJhbWVidWZmZXInKVxudmFyIHdyYXBVbmlmb3JtcyA9IHJlcXVpcmUoJy4vbGliL3VuaWZvcm0nKVxudmFyIHdyYXBBdHRyaWJ1dGVzID0gcmVxdWlyZSgnLi9saWIvYXR0cmlidXRlJylcbnZhciB3cmFwU2hhZGVycyA9IHJlcXVpcmUoJy4vbGliL3NoYWRlcicpXG52YXIgd3JhcERyYXcgPSByZXF1aXJlKCcuL2xpYi9kcmF3JylcbnZhciB3cmFwQ29udGV4dCA9IHJlcXVpcmUoJy4vbGliL3N0YXRlJylcbnZhciBjcmVhdGVDb21waWxlciA9IHJlcXVpcmUoJy4vbGliL2NvbXBpbGUnKVxudmFyIHdyYXBSZWFkID0gcmVxdWlyZSgnLi9saWIvcmVhZCcpXG52YXIgZHluYW1pYyA9IHJlcXVpcmUoJy4vbGliL2R5bmFtaWMnKVxudmFyIHJhZiA9IHJlcXVpcmUoJy4vbGliL3JhZicpXG52YXIgY2xvY2sgPSByZXF1aXJlKCcuL2xpYi9jbG9jaycpXG5cbnZhciBHTF9DT0xPUl9CVUZGRVJfQklUID0gMTYzODRcbnZhciBHTF9ERVBUSF9CVUZGRVJfQklUID0gMjU2XG52YXIgR0xfU1RFTkNJTF9CVUZGRVJfQklUID0gMTAyNFxuXG52YXIgR0xfQVJSQVlfQlVGRkVSID0gMzQ5NjJcbnZhciBHTF9URVhUVVJFXzJEID0gMHgwREUxXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUCA9IDB4ODUxM1xuXG52YXIgQ09OVEVYVF9MT1NUX0VWRU5UID0gJ3dlYmdsY29udGV4dGxvc3QnXG52YXIgQ09OVEVYVF9SRVNUT1JFRF9FVkVOVCA9ICd3ZWJnbGNvbnRleHRyZXN0b3JlZCdcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwUkVHTCAoKSB7XG4gIHZhciBhcmdzID0gZ2V0Q29udGV4dChBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpKVxuICB2YXIgZ2wgPSBhcmdzLmdsXG4gIHZhciBvcHRpb25zID0gYXJncy5vcHRpb25zXG5cbiAgdmFyIGV4dGVuc2lvblN0YXRlID0gd3JhcEV4dGVuc2lvbnMoZ2wpXG4gIHZhciBleHRlbnNpb25zID0gZXh0ZW5zaW9uU3RhdGUuZXh0ZW5zaW9uc1xuXG4gIHZhciB2aWV3cG9ydFN0YXRlID0ge1xuICAgIHdpZHRoOiBnbC5kcmF3aW5nQnVmZmVyV2lkdGgsXG4gICAgaGVpZ2h0OiBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0XG4gIH1cblxuICB2YXIgbGltaXRzID0gd3JhcExpbWl0cyhcbiAgICBnbCxcbiAgICBleHRlbnNpb25zKVxuXG4gIHZhciBidWZmZXJTdGF0ZSA9IHdyYXBCdWZmZXJzKGdsKVxuXG4gIHZhciBlbGVtZW50U3RhdGUgPSB3cmFwRWxlbWVudHMoXG4gICAgZ2wsXG4gICAgZXh0ZW5zaW9ucyxcbiAgICBidWZmZXJTdGF0ZSlcblxuICB2YXIgdW5pZm9ybVN0YXRlID0gd3JhcFVuaWZvcm1zKClcblxuICB2YXIgYXR0cmlidXRlU3RhdGUgPSB3cmFwQXR0cmlidXRlcyhcbiAgICBnbCxcbiAgICBleHRlbnNpb25zLFxuICAgIGxpbWl0cyxcbiAgICBidWZmZXJTdGF0ZSlcblxuICB2YXIgc2hhZGVyU3RhdGUgPSB3cmFwU2hhZGVycyhcbiAgICBnbCxcbiAgICBhdHRyaWJ1dGVTdGF0ZSxcbiAgICB1bmlmb3JtU3RhdGUsXG4gICAgZnVuY3Rpb24gKHByb2dyYW0pIHtcbiAgICAgIHJldHVybiBjb21waWxlci5kcmF3KHByb2dyYW0pXG4gICAgfSlcblxuICB2YXIgZHJhd1N0YXRlID0gd3JhcERyYXcoXG4gICAgZ2wsXG4gICAgZXh0ZW5zaW9ucyxcbiAgICBidWZmZXJTdGF0ZSlcblxuICB2YXIgdGV4dHVyZVN0YXRlID0gd3JhcFRleHR1cmVzKFxuICAgIGdsLFxuICAgIGV4dGVuc2lvbnMsXG4gICAgbGltaXRzLFxuICAgIHBvbGwsXG4gICAgdmlld3BvcnRTdGF0ZSlcblxuICB2YXIgcmVuZGVyYnVmZmVyU3RhdGUgPSB3cmFwUmVuZGVyYnVmZmVycyhcbiAgICBnbCxcbiAgICBleHRlbnNpb25zLFxuICAgIGxpbWl0cylcblxuICB2YXIgZnJhbWVidWZmZXJTdGF0ZSA9IHdyYXBGcmFtZWJ1ZmZlcnMoXG4gICAgZ2wsXG4gICAgZXh0ZW5zaW9ucyxcbiAgICBsaW1pdHMsXG4gICAgdGV4dHVyZVN0YXRlLFxuICAgIHJlbmRlcmJ1ZmZlclN0YXRlKVxuXG4gIHZhciBmcmFtZVN0YXRlID0ge1xuICAgIGNvdW50OiAwLFxuICAgIHN0YXJ0OiBjbG9jaygpLFxuICAgIGR0OiAwLFxuICAgIHQ6IGNsb2NrKCksXG4gICAgcmVuZGVyVGltZTogMCxcbiAgICB3aWR0aDogZ2wuZHJhd2luZ0J1ZmZlcldpZHRoLFxuICAgIGhlaWdodDogZ2wuZHJhd2luZ0J1ZmZlckhlaWdodCxcbiAgICBwaXhlbFJhdGlvOiBvcHRpb25zLnBpeGVsUmF0aW9cbiAgfVxuXG4gIHZhciBnbFN0YXRlID0gd3JhcENvbnRleHQoXG4gICAgZ2wsXG4gICAgZnJhbWVidWZmZXJTdGF0ZSxcbiAgICB2aWV3cG9ydFN0YXRlKVxuXG4gIHZhciByZWFkUGl4ZWxzID0gd3JhcFJlYWQoZ2wsIHBvbGwsIHZpZXdwb3J0U3RhdGUpXG5cbiAgdmFyIGNvbXBpbGVyID0gY3JlYXRlQ29tcGlsZXIoXG4gICAgZ2wsXG4gICAgZXh0ZW5zaW9ucyxcbiAgICBsaW1pdHMsXG4gICAgYnVmZmVyU3RhdGUsXG4gICAgZWxlbWVudFN0YXRlLFxuICAgIHRleHR1cmVTdGF0ZSxcbiAgICBmcmFtZWJ1ZmZlclN0YXRlLFxuICAgIGdsU3RhdGUsXG4gICAgdW5pZm9ybVN0YXRlLFxuICAgIGF0dHJpYnV0ZVN0YXRlLFxuICAgIHNoYWRlclN0YXRlLFxuICAgIGRyYXdTdGF0ZSxcbiAgICBmcmFtZVN0YXRlLFxuICAgIHBvbGwpXG5cbiAgdmFyIGNhbnZhcyA9IGdsLmNhbnZhc1xuXG4gIC8vIHJhZiBzdHVmZlxuICB2YXIgcmFmQ2FsbGJhY2tzID0gW11cbiAgdmFyIGFjdGl2ZVJBRiA9IDBcbiAgZnVuY3Rpb24gaGFuZGxlUkFGICgpIHtcbiAgICBhY3RpdmVSQUYgPSByYWYubmV4dChoYW5kbGVSQUYpXG4gICAgZnJhbWVTdGF0ZS5jb3VudCArPSAxXG5cbiAgICBpZiAoZnJhbWVTdGF0ZS53aWR0aCAhPT0gZ2wuZHJhd2luZ0J1ZmZlcldpZHRoIHx8XG4gICAgICAgIGZyYW1lU3RhdGUuaGVpZ2h0ICE9PSBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0KSB7XG4gICAgICBmcmFtZVN0YXRlLndpZHRoID0gZ2wuZHJhd2luZ0J1ZmZlcldpZHRoXG4gICAgICBmcmFtZVN0YXRlLmhlaWdodCA9IGdsLmRyYXdpbmdCdWZmZXJIZWlnaHRcbiAgICAgIGdsU3RhdGUubm90aWZ5Vmlld3BvcnRDaGFuZ2VkKClcbiAgICB9XG5cbiAgICB2YXIgbm93ID0gY2xvY2soKVxuICAgIGZyYW1lU3RhdGUuZHQgPSBub3cgLSBmcmFtZVN0YXRlLnRcbiAgICBmcmFtZVN0YXRlLnQgPSBub3dcblxuICAgIHRleHR1cmVTdGF0ZS5wb2xsKClcblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmFmQ2FsbGJhY2tzLmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgY2IgPSByYWZDYWxsYmFja3NbaV1cbiAgICAgIGNiKGZyYW1lU3RhdGUuY291bnQsIGZyYW1lU3RhdGUudCwgZnJhbWVTdGF0ZS5kdClcbiAgICB9XG4gICAgZnJhbWVTdGF0ZS5yZW5kZXJUaW1lID0gY2xvY2soKSAtIG5vd1xuICB9XG5cbiAgZnVuY3Rpb24gc3RhcnRSQUYgKCkge1xuICAgIGlmICghYWN0aXZlUkFGICYmIHJhZkNhbGxiYWNrcy5sZW5ndGggPiAwKSB7XG4gICAgICBoYW5kbGVSQUYoKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHN0b3BSQUYgKCkge1xuICAgIGlmIChhY3RpdmVSQUYpIHtcbiAgICAgIHJhZi5jYW5jZWwoaGFuZGxlUkFGKVxuICAgICAgYWN0aXZlUkFGID0gMFxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZUNvbnRleHRMb3NzIChldmVudCkge1xuICAgIHN0b3BSQUYoKVxuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KClcbiAgICBpZiAob3B0aW9ucy5vbkNvbnRleHRMb3N0KSB7XG4gICAgICBvcHRpb25zLm9uQ29udGV4dExvc3QoKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZUNvbnRleHRSZXN0b3JlZCAoZXZlbnQpIHtcbiAgICBnbC5nZXRFcnJvcigpXG4gICAgZXh0ZW5zaW9uU3RhdGUucmVmcmVzaCgpXG4gICAgYnVmZmVyU3RhdGUucmVmcmVzaCgpXG4gICAgdGV4dHVyZVN0YXRlLnJlZnJlc2goKVxuICAgIHJlbmRlcmJ1ZmZlclN0YXRlLnJlZnJlc2goKVxuICAgIGZyYW1lYnVmZmVyU3RhdGUucmVmcmVzaCgpXG4gICAgc2hhZGVyU3RhdGUucmVmcmVzaCgpXG4gICAgZ2xTdGF0ZS5yZWZyZXNoKClcbiAgICBpZiAob3B0aW9ucy5vbkNvbnRleHRSZXN0b3JlZCkge1xuICAgICAgb3B0aW9ucy5vbkNvbnRleHRSZXN0b3JlZCgpXG4gICAgfVxuICAgIGhhbmRsZVJBRigpXG4gIH1cblxuICBpZiAoY2FudmFzKSB7XG4gICAgY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoQ09OVEVYVF9MT1NUX0VWRU5ULCBoYW5kbGVDb250ZXh0TG9zcywgZmFsc2UpXG4gICAgY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoQ09OVEVYVF9SRVNUT1JFRF9FVkVOVCwgaGFuZGxlQ29udGV4dFJlc3RvcmVkLCBmYWxzZSlcbiAgfVxuXG4gIC8vIFJlc291cmNlIGRlc3RydWN0dWlvblxuICBmdW5jdGlvbiBkZXN0cm95ICgpIHtcbiAgICBzdG9wUkFGKClcblxuICAgIGlmIChjYW52YXMpIHtcbiAgICAgIGNhbnZhcy5yZW1vdmVFdmVudExpc3RlbmVyKENPTlRFWFRfTE9TVF9FVkVOVCwgaGFuZGxlQ29udGV4dExvc3MpXG4gICAgICBjYW52YXMucmVtb3ZlRXZlbnRMaXN0ZW5lcihDT05URVhUX1JFU1RPUkVEX0VWRU5ULCBoYW5kbGVDb250ZXh0UmVzdG9yZWQpXG4gICAgfVxuXG4gICAgc2hhZGVyU3RhdGUuY2xlYXIoKVxuICAgIGZyYW1lYnVmZmVyU3RhdGUuY2xlYXIoKVxuICAgIHJlbmRlcmJ1ZmZlclN0YXRlLmNsZWFyKClcbiAgICB0ZXh0dXJlU3RhdGUuY2xlYXIoKVxuICAgIGJ1ZmZlclN0YXRlLmNsZWFyKClcblxuICAgIGlmIChvcHRpb25zLm9uRGVzdHJveSkge1xuICAgICAgb3B0aW9ucy5vbkRlc3Ryb3koKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNvbXBpbGVQcm9jZWR1cmUgKG9wdGlvbnMpIHtcbiAgICBjaGVjayghIW9wdGlvbnMsICdpbnZhbGlkIGFyZ3MgdG8gcmVnbCh7Li4ufSknKVxuICAgIGNoZWNrLnR5cGUob3B0aW9ucywgJ29iamVjdCcsICdpbnZhbGlkIGFyZ3MgdG8gcmVnbCh7Li4ufSknKVxuXG4gICAgdmFyIGhhc0R5bmFtaWMgPSBmYWxzZVxuXG4gICAgZnVuY3Rpb24gZmxhdHRlbk5lc3RlZE9wdGlvbnMgKG9wdGlvbnMpIHtcbiAgICAgIHZhciByZXN1bHQgPSBPYmplY3QuYXNzaWduKHt9LCBvcHRpb25zKVxuICAgICAgZGVsZXRlIHJlc3VsdC51bmlmb3Jtc1xuICAgICAgZGVsZXRlIHJlc3VsdC5hdHRyaWJ1dGVzXG5cbiAgICAgIGZ1bmN0aW9uIG1lcmdlIChuYW1lKSB7XG4gICAgICAgIGlmIChuYW1lIGluIHJlc3VsdCkge1xuICAgICAgICAgIHZhciBjaGlsZCA9IHJlc3VsdFtuYW1lXVxuICAgICAgICAgIGRlbGV0ZSByZXN1bHRbbmFtZV1cbiAgICAgICAgICBPYmplY3Qua2V5cyhjaGlsZCkuZm9yRWFjaChmdW5jdGlvbiAocHJvcCkge1xuICAgICAgICAgICAgcmVzdWx0W25hbWUgKyAnLicgKyBwcm9wXSA9IGNoaWxkW3Byb3BdXG4gICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgbWVyZ2UoJ2JsZW5kJylcbiAgICAgIG1lcmdlKCdkZXB0aCcpXG4gICAgICBtZXJnZSgnY3VsbCcpXG4gICAgICBtZXJnZSgnc3RlbmNpbCcpXG4gICAgICBtZXJnZSgncG9seWdvbk9mZnNldCcpXG4gICAgICBtZXJnZSgnc2Npc3NvcicpXG4gICAgICBtZXJnZSgnc2FtcGxlJylcblxuICAgICAgcmV0dXJuIHJlc3VsdFxuICAgIH1cblxuICAgIC8vIEZpcnN0IHdlIHNlcGFyYXRlIHRoZSBvcHRpb25zIGludG8gc3RhdGljIGFuZCBkeW5hbWljIGNvbXBvbmVudHNcbiAgICBmdW5jdGlvbiBzZXBhcmF0ZUR5bmFtaWMgKG9iamVjdCkge1xuICAgICAgdmFyIHN0YXRpY0l0ZW1zID0ge31cbiAgICAgIHZhciBkeW5hbWljSXRlbXMgPSB7fVxuICAgICAgT2JqZWN0LmtleXMob2JqZWN0KS5mb3JFYWNoKGZ1bmN0aW9uIChvcHRpb24pIHtcbiAgICAgICAgdmFyIHZhbHVlID0gb2JqZWN0W29wdGlvbl1cbiAgICAgICAgaWYgKGR5bmFtaWMuaXNEeW5hbWljKHZhbHVlKSkge1xuICAgICAgICAgIGhhc0R5bmFtaWMgPSB0cnVlXG4gICAgICAgICAgZHluYW1pY0l0ZW1zW29wdGlvbl0gPSBkeW5hbWljLnVuYm94KHZhbHVlLCBvcHRpb24pXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc3RhdGljSXRlbXNbb3B0aW9uXSA9IHZhbHVlXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICByZXR1cm4ge1xuICAgICAgICBkeW5hbWljOiBkeW5hbWljSXRlbXMsXG4gICAgICAgIHN0YXRpYzogc3RhdGljSXRlbXNcbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgdW5pZm9ybXMgPSBzZXBhcmF0ZUR5bmFtaWMob3B0aW9ucy51bmlmb3JtcyB8fCB7fSlcbiAgICB2YXIgYXR0cmlidXRlcyA9IHNlcGFyYXRlRHluYW1pYyhvcHRpb25zLmF0dHJpYnV0ZXMgfHwge30pXG4gICAgdmFyIG9wdHMgPSBzZXBhcmF0ZUR5bmFtaWMoZmxhdHRlbk5lc3RlZE9wdGlvbnMob3B0aW9ucykpXG5cbiAgICB2YXIgY29tcGlsZWQgPSBjb21waWxlci5jb21tYW5kKFxuICAgICAgb3B0cy5zdGF0aWMsIHVuaWZvcm1zLnN0YXRpYywgYXR0cmlidXRlcy5zdGF0aWMsXG4gICAgICBvcHRzLmR5bmFtaWMsIHVuaWZvcm1zLmR5bmFtaWMsIGF0dHJpYnV0ZXMuZHluYW1pYyxcbiAgICAgIGhhc0R5bmFtaWMpXG5cbiAgICB2YXIgZHJhdyA9IGNvbXBpbGVkLmRyYXdcbiAgICB2YXIgYmF0Y2ggPSBjb21waWxlZC5iYXRjaFxuICAgIHZhciBzY29wZSA9IGNvbXBpbGVkLnNjb3BlXG5cbiAgICB2YXIgRU1QVFlfQVJSQVkgPSBbXVxuICAgIGZ1bmN0aW9uIHJlc2VydmUgKGNvdW50KSB7XG4gICAgICB3aGlsZSAoRU1QVFlfQVJSQVkubGVuZ3RoIDwgY291bnQpIHtcbiAgICAgICAgRU1QVFlfQVJSQVkucHVzaChudWxsKVxuICAgICAgfVxuICAgICAgcmV0dXJuIEVNUFRZX0FSUkFZXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gUkVHTENvbW1hbmQgKGFyZ3MsIGJvZHkpIHtcbiAgICAgIGlmICh0eXBlb2YgYXJncyA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgcmV0dXJuIGJhdGNoKGFyZ3MgfCAwLCByZXNlcnZlKGFyZ3MgfCAwKSlcbiAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShhcmdzKSkge1xuICAgICAgICByZXR1cm4gYmF0Y2goYXJncy5sZW5ndGgsIGFyZ3MpXG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBhcmdzID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHJldHVybiBzY29wZShudWxsLCBhcmdzKVxuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgYm9keSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICByZXR1cm4gc2NvcGUoYXJncywgYm9keSlcbiAgICAgIH1cbiAgICAgIHJldHVybiBkcmF3KGFyZ3MpXG4gICAgfVxuXG4gICAgcmV0dXJuIFJFR0xDb21tYW5kXG4gIH1cblxuICBmdW5jdGlvbiBwb2xsICgpIHtcbiAgICBmcmFtZWJ1ZmZlclN0YXRlLnBvbGwoKVxuICAgIGdsU3RhdGUucG9sbCgpXG4gIH1cblxuICBmdW5jdGlvbiBjbGVhciAob3B0aW9ucykge1xuICAgIHZhciBjbGVhckZsYWdzID0gMFxuXG4gICAgLy8gVXBkYXRlIGNvbnRleHQgc3RhdGVcbiAgICBwb2xsKClcblxuICAgIHZhciBjID0gb3B0aW9ucy5jb2xvclxuICAgIGlmIChjKSB7XG4gICAgICBnbC5jbGVhckNvbG9yKCtjWzBdIHx8IDAsICtjWzFdIHx8IDAsICtjWzJdIHx8IDAsICtjWzNdIHx8IDApXG4gICAgICBjbGVhckZsYWdzIHw9IEdMX0NPTE9SX0JVRkZFUl9CSVRcbiAgICB9XG4gICAgaWYgKCdkZXB0aCcgaW4gb3B0aW9ucykge1xuICAgICAgZ2wuY2xlYXJEZXB0aCgrb3B0aW9ucy5kZXB0aClcbiAgICAgIGNsZWFyRmxhZ3MgfD0gR0xfREVQVEhfQlVGRkVSX0JJVFxuICAgIH1cbiAgICBpZiAoJ3N0ZW5jaWwnIGluIG9wdGlvbnMpIHtcbiAgICAgIGdsLmNsZWFyU3RlbmNpbChvcHRpb25zLnN0ZW5jaWwgfCAwKVxuICAgICAgY2xlYXJGbGFncyB8PSBHTF9TVEVOQ0lMX0JVRkZFUl9CSVRcbiAgICB9XG5cbiAgICBjaGVjayghIWNsZWFyRmxhZ3MsICdjYWxsZWQgcmVnbC5jbGVhciB3aXRoIG5vIGJ1ZmZlciBzcGVjaWZpZWQnKVxuICAgIGdsLmNsZWFyKGNsZWFyRmxhZ3MpXG4gIH1cblxuICAvLyBSZWdpc3RlcnMgYW5vdGhlciByZXF1ZXN0QW5pbWF0aW9uRnJhbWUgY2FsbGJhY2tcbiAgZnVuY3Rpb24gZnJhbWUgKGNiKSB7XG4gICAgcmFmQ2FsbGJhY2tzLnB1c2goY2IpXG5cbiAgICBmdW5jdGlvbiBjYW5jZWwgKCkge1xuICAgICAgdmFyIGluZGV4ID0gcmFmQ2FsbGJhY2tzLmZpbmQoZnVuY3Rpb24gKGl0ZW0pIHtcbiAgICAgICAgcmV0dXJuIGl0ZW0gPT09IGNiXG4gICAgICB9KVxuICAgICAgaWYgKGluZGV4IDwgMCkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIHJhZkNhbGxiYWNrcy5zcGxpY2UoaW5kZXgsIDEpXG4gICAgICBpZiAocmFmQ2FsbGJhY2tzLmxlbmd0aCA8PSAwKSB7XG4gICAgICAgIHN0b3BSQUYoKVxuICAgICAgfVxuICAgIH1cblxuICAgIHN0YXJ0UkFGKClcblxuICAgIHJldHVybiB7XG4gICAgICBjYW5jZWw6IGNhbmNlbFxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBPYmplY3QuYXNzaWduKGNvbXBpbGVQcm9jZWR1cmUsIHtcbiAgICAvLyBDbGVhciBjdXJyZW50IEZCT1xuICAgIGNsZWFyOiBjbGVhcixcblxuICAgIC8vIFNob3J0IGN1dCBmb3IgcHJvcCBiaW5kaW5nXG4gICAgcHJvcDogZHluYW1pYy5kZWZpbmUsXG5cbiAgICAvLyBleGVjdXRlcyBhbiBlbXB0eSBkcmF3IGNvbW1hbmRcbiAgICBkcmF3OiBjb21waWxlUHJvY2VkdXJlKHt9KSxcblxuICAgIC8vIFJlc291cmNlc1xuICAgIGVsZW1lbnRzOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgcmV0dXJuIGVsZW1lbnRTdGF0ZS5jcmVhdGUob3B0aW9ucylcbiAgICB9LFxuICAgIGJ1ZmZlcjogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgIHJldHVybiBidWZmZXJTdGF0ZS5jcmVhdGUob3B0aW9ucywgR0xfQVJSQVlfQlVGRkVSKVxuICAgIH0sXG4gICAgdGV4dHVyZTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgIHJldHVybiB0ZXh0dXJlU3RhdGUuY3JlYXRlKG9wdGlvbnMsIEdMX1RFWFRVUkVfMkQpXG4gICAgfSxcbiAgICBjdWJlOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDYpIHtcbiAgICAgICAgcmV0dXJuIHRleHR1cmVTdGF0ZS5jcmVhdGUoXG4gICAgICAgICAgQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKSxcbiAgICAgICAgICBHTF9URVhUVVJFX0NVQkVfTUFQKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHRleHR1cmVTdGF0ZS5jcmVhdGUob3B0aW9ucywgR0xfVEVYVFVSRV9DVUJFX01BUClcbiAgICAgIH1cbiAgICB9LFxuICAgIHJlbmRlcmJ1ZmZlcjogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgIHJldHVybiByZW5kZXJidWZmZXJTdGF0ZS5jcmVhdGUob3B0aW9ucylcbiAgICB9LFxuICAgIGZyYW1lYnVmZmVyOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgcmV0dXJuIGZyYW1lYnVmZmVyU3RhdGUuY3JlYXRlKG9wdGlvbnMpXG4gICAgfSxcbiAgICBmcmFtZWJ1ZmZlckN1YmU6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICBjaGVjay5yYWlzZSgnZnJhbWVidWZmZXIgY3ViZSBub3QgeWV0IGltcGxlbWVudGVkJylcbiAgICB9LFxuXG4gICAgLy8gRnJhbWUgcmVuZGVyaW5nXG4gICAgZnJhbWU6IGZyYW1lLFxuICAgIHN0YXRzOiBmcmFtZVN0YXRlLFxuXG4gICAgLy8gU3lzdGVtIGxpbWl0c1xuICAgIGxpbWl0czogbGltaXRzLFxuXG4gICAgLy8gUmVhZCBwaXhlbHNcbiAgICByZWFkOiByZWFkUGl4ZWxzLFxuXG4gICAgLy8gRGVzdHJveSByZWdsIGFuZCBhbGwgYXNzb2NpYXRlZCByZXNvdXJjZXNcbiAgICBkZXN0cm95OiBkZXN0cm95XG4gIH0pXG59XG4iXX0=
