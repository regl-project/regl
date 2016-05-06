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

},{"../regl":33}],2:[function(require,module,exports){
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

},{"./constants/dtypes.json":8,"./extend":14}],3:[function(require,module,exports){
// Array and element buffer creation

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

},{"./constants/arraytypes.json":7,"./constants/dtypes.json":8,"./is-ndarray":17,"./is-typed-array":18,"./values":32}],4:[function(require,module,exports){
/* globals performance */
module.exports =
  (typeof performance !== 'undefined' && performance.now)
  ? function () { return performance.now() }
  : function () { return +(new Date()) }

},{}],5:[function(require,module,exports){
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

},{"./extend":14}],6:[function(require,module,exports){

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
          
          entry(DRAW_STATE[param], '.push(', value, ');')
          exit(DRAW_STATE[param], '.pop();')
          break

        // Update primitive type
        case 'primitive':
          
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
          
          handleStaticOption(param, value)
          break

        case 'depth.func':
          
          handleStaticOption(param, compareFuncs[value])
          break

        case 'depth.range':
          
          var DEPTH_RANGE_STACK = linkContext(param)
          entry(DEPTH_RANGE_STACK, '.push(', value[0], ',', value[1], ');')
          exit(DEPTH_RANGE_STACK, '.pop();')
          break

        case 'blend.func':
          var BLEND_FUNC_STACK = linkContext(param)
          
          var srcRGB = ('srcRGB' in value ? value.srcRGB : value.src)
          var srcAlpha = ('srcAlpha' in value ? value.srcAlpha : value.src)
          var dstRGB = ('dstRGB' in value ? value.dstRGB : value.dst)
          var dstAlpha = ('dstAlpha' in value ? value.dstAlpha : value.dst)
          
          
          
          
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
            
            entry(BLEND_EQUATION_STACK,
              '.push(',
              blendEquations[value], ',',
              blendEquations[value], ');')
          } else if (typeof value === 'object') {
            
            
            entry(BLEND_EQUATION_STACK,
              '.push(',
              blendEquations[value.rgb], ',',
              blendEquations[value.alpha], ');')
          } else {
            
          }
          exit(BLEND_EQUATION_STACK, '.pop();')
          break

        case 'blend.color':
          
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
          
          var STENCIL_MASK_STACK = linkContext(param)
          entry(STENCIL_MASK_STACK, '.push(', value, ');')
          exit(STENCIL_MASK_STACK, '.pop();')
          break

        case 'stencil.func':
          
          var cmp = value.cmp || 'keep'
          var ref = value.ref || 0
          var mask = 'mask' in value ? value.mask : -1
          
          
          
          var STENCIL_FUNC_STACK = linkContext(param)
          entry(STENCIL_FUNC_STACK, '.push(',
            compareFuncs[cmp], ',',
            ref, ',',
            mask, ');')
          exit(STENCIL_FUNC_STACK, '.pop();')
          break

        case 'stencil.opFront':
        case 'stencil.opBack':
          
          var fail = value.fail || 'keep'
          var zfail = value.zfail || 'keep'
          var pass = value.pass || 'keep'
          
          
          
          var STENCIL_OP_STACK = linkContext(param)
          entry(STENCIL_OP_STACK, '.push(',
            stencilOps[fail], ',',
            stencilOps[zfail], ',',
            stencilOps[pass], ');')
          exit(STENCIL_OP_STACK, '.pop();')
          break

        case 'polygonOffset.offset':
          
          var factor = value.factor || 0
          var units = value.units || 0
          
          
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
          
          var CULL_FACE_STACK = linkContext(param)
          entry(CULL_FACE_STACK, '.push(', face, ');')
          exit(CULL_FACE_STACK, '.pop();')
          break

        case 'lineWidth':
          var lineWidthDims = limits.lineWidthDims
          
          handleStaticOption(param, value)
          break

        case 'frontFace':
          var orientation = 0
          if (value === 'cw') {
            orientation = GL_CW
          } else if (value === 'ccw') {
            orientation = GL_CCW
          }
          
          var FRONT_FACE_STACK = linkContext(param)
          entry(FRONT_FACE_STACK, '.push(', orientation, ');')
          exit(FRONT_FACE_STACK, '.pop();')
          break

        case 'colorMask':
          
          var COLOR_MASK_STACK = linkContext(param)
          entry(COLOR_MASK_STACK, '.push(',
            value.map(function (v) { return !!v }).join(),
            ');')
          exit(COLOR_MASK_STACK, '.pop();')
          break

        case 'sample.coverage':
          
          var sampleValue = 'value' in value ? value.value : 1
          var sampleInvert = !!value.invert
          
          var SAMPLE_COVERAGE_STACK = linkContext(param)
          entry(SAMPLE_COVERAGE_STACK, '.push(',
            sampleValue, ',', sampleInvert, ');')
          exit(SAMPLE_COVERAGE_STACK, '.pop();')
          break

        case 'viewport':
        case 'scissor.box':
          
          var X = value.x || 0
          var Y = value.y || 0
          var W = -1
          var H = -1
          
          
          if ('w' in value) {
            W = value.w
            
          }
          if ('h' in value) {
            H = value.h
            
          }
          var BOX_STACK = linkContext(param)
          entry(BOX_STACK, '.push(', X, ',', Y, ',', W, ',', H, ');')
          exit(BOX_STACK, '.pop();')
          break

        default:
          // TODO Should this just be a warning instead?
          
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
            

            buffer = bufferState.getBuffer(data.buffer)
            size = data.size || 0
            stride = data.stride || 0
            offset = data.offset || 0
            divisor = data.divisor || 0
            normalized = data.normalized || false

            

            // Check for user defined type overloading
            type = buffer.dtype
            if ('type' in data) {
              
              type = glTypes[data.type]
            }
          } else {
            type = buffer.dtype
          }

          
          
          
          
          
          

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

},{"./codegen":5,"./constants/dtypes.json":8,"./constants/primitives.json":9}],7:[function(require,module,exports){
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

},{}],8:[function(require,module,exports){
module.exports={
  "int8": 5120
, "int16": 5122
, "int32": 5124
, "uint8": 5121
, "uint16": 5123
, "uint32": 5125
, "float": 5126
}

},{}],9:[function(require,module,exports){
module.exports={
  "points": 0,
  "lines": 1,
  "line loop": 2,
  "line strip": 3,
  "triangles": 4,
  "triangle strip": 5,
  "triangle fan": 6
}

},{}],10:[function(require,module,exports){
// Context and canvas creation helper functions
/*globals HTMLElement,WebGLRenderingContext*/


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

},{"./extend":14}],11:[function(require,module,exports){
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

},{}],12:[function(require,module,exports){
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

},{}],13:[function(require,module,exports){

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

},{"./constants/primitives.json":9,"./is-ndarray":17,"./is-typed-array":18}],14:[function(require,module,exports){
module.exports = function (base, opts) {
  var keys = Object.keys(opts)
  for (var i = 0; i < keys.length; ++i) {
    base[keys[i]] = opts[keys[i]]
  }
  return base
}

},{}],15:[function(require,module,exports){
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
      
    } else {
      
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

},{"./extend":14,"./values":32}],17:[function(require,module,exports){
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

},{"./constants/arraytypes.json":7}],19:[function(require,module,exports){
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

},{}],22:[function(require,module,exports){
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
    
    

    // Run read pixels
    gl.pixelStorei(GL_PACK_ALIGNMENT, 4)
    gl.readPixels(x, y, width, height, GL_RGBA, GL_UNSIGNED_BYTE, data)

    return data
  }

  return readPixels
}

},{"./is-typed-array":18}],24:[function(require,module,exports){

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

},{"./values":32}],25:[function(require,module,exports){

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

},{"./values":32}],26:[function(require,module,exports){
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

},{"./codegen":5,"./stack":26}],28:[function(require,module,exports){
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

},{}],29:[function(require,module,exports){

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
        var w = data.length
        var h = data[0].length
        var c = 1
        var i, j, k, p
        if (Array.isArray(data[0][0])) {
          c = data[0][0].length
          
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

},{"./extend":14,"./is-ndarray":17,"./is-typed-array":18,"./load-texture":20,"./parse-dds":21,"./to-half-float":30,"./values":32}],30:[function(require,module,exports){
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

},{}],31:[function(require,module,exports){
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

},{}],32:[function(require,module,exports){
module.exports = function (obj) {
  return Object.keys(obj).map(function (key) { return obj[key] })
}

},{}],33:[function(require,module,exports){

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

},{"./lib/attribute":2,"./lib/buffer":3,"./lib/clock":4,"./lib/compile":6,"./lib/context":10,"./lib/draw":11,"./lib/dynamic":12,"./lib/elements":13,"./lib/extend":14,"./lib/extension":15,"./lib/framebuffer":16,"./lib/limits":19,"./lib/raf":22,"./lib/read":23,"./lib/renderbuffer":24,"./lib/shader":25,"./lib/state":27,"./lib/strings":28,"./lib/texture":29,"./lib/uniform":31}]},{},[1])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJleGFtcGxlL2R5bmFtaWMuanMiLCJsaWIvYXR0cmlidXRlLmpzIiwibGliL2J1ZmZlci5qcyIsImxpYi9jbG9jay5qcyIsImxpYi9jb2RlZ2VuLmpzIiwibGliL2NvbXBpbGUuanMiLCJsaWIvY29uc3RhbnRzL2FycmF5dHlwZXMuanNvbiIsImxpYi9jb25zdGFudHMvZHR5cGVzLmpzb24iLCJsaWIvY29uc3RhbnRzL3ByaW1pdGl2ZXMuanNvbiIsImxpYi9jb250ZXh0LmpzIiwibGliL2RyYXcuanMiLCJsaWIvZHluYW1pYy5qcyIsImxpYi9lbGVtZW50cy5qcyIsImxpYi9leHRlbmQuanMiLCJsaWIvZXh0ZW5zaW9uLmpzIiwibGliL2ZyYW1lYnVmZmVyLmpzIiwibGliL2lzLW5kYXJyYXkuanMiLCJsaWIvaXMtdHlwZWQtYXJyYXkuanMiLCJsaWIvbGltaXRzLmpzIiwibGliL2xvYWQtdGV4dHVyZS5qcyIsImxpYi9wYXJzZS1kZHMuanMiLCJsaWIvcmFmLmpzIiwibGliL3JlYWQuanMiLCJsaWIvcmVuZGVyYnVmZmVyLmpzIiwibGliL3NoYWRlci5qcyIsImxpYi9zdGFjay5qcyIsImxpYi9zdGF0ZS5qcyIsImxpYi9zdHJpbmdzLmpzIiwibGliL3RleHR1cmUuanMiLCJsaWIvdG8taGFsZi1mbG9hdC5qcyIsImxpYi91bmlmb3JtLmpzIiwibGliL3ZhbHVlcy5qcyIsInJlZ2wuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ROQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDclBBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcmxEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNaQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4SEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNXRCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNaQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDak1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMTNDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xCQTtBQUNBO0FBQ0E7QUFDQTs7QUNIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJ2YXIgcmVnbCA9IHJlcXVpcmUoJy4uL3JlZ2wnKSgpXG5cbnZhciBkcmF3ID0gcmVnbCh7XG4gIGZyYWc6IGBcbiAgICBwcmVjaXNpb24gbWVkaXVtcCBmbG9hdDtcbiAgICB1bmlmb3JtIHZlYzQgY29sb3I7XG4gICAgdm9pZCBtYWluKCkge1xuICAgICAgZ2xfRnJhZ0NvbG9yID0gY29sb3I7XG4gICAgfWAsXG5cbiAgdmVydDogYFxuICAgIHByZWNpc2lvbiBtZWRpdW1wIGZsb2F0O1xuICAgIGF0dHJpYnV0ZSB2ZWMyIHBvc2l0aW9uO1xuICAgIHVuaWZvcm0gZmxvYXQgYW5nbGU7XG4gICAgdm9pZCBtYWluKCkge1xuICAgICAgZ2xfUG9zaXRpb24gPSB2ZWM0KFxuICAgICAgICBjb3MoYW5nbGUpICogcG9zaXRpb24ueCArIHNpbihhbmdsZSkgKiBwb3NpdGlvbi55LFxuICAgICAgICAtc2luKGFuZ2xlKSAqIHBvc2l0aW9uLnggKyBjb3MoYW5nbGUpICogcG9zaXRpb24ueSwgMCwgMSk7XG4gICAgfWAsXG5cbiAgYXR0cmlidXRlczoge1xuICAgIHBvc2l0aW9uOiByZWdsLmJ1ZmZlcihbXG4gICAgICAtMSwgMCxcbiAgICAgIDAsIC0xLFxuICAgICAgMSwgMV0pXG4gIH0sXG5cbiAgdW5pZm9ybXM6IHtcbiAgICBjb2xvcjogcmVnbC5wcm9wKCdjb2xvcicpLFxuICAgIGFuZ2xlOiBmdW5jdGlvbiAoYXJncywgYmF0Y2hJZCwgc3RhdHMpIHtcbiAgICAgIHJldHVybiAwLjAxICogc3RhdHMuY291bnRcbiAgICB9XG4gIH0sXG5cbiAgZGVwdGg6IHtcbiAgICBlbmFibGU6IGZhbHNlXG4gIH0sXG5cbiAgY291bnQ6IDNcbn0pXG5cbnJlZ2wuZnJhbWUoZnVuY3Rpb24gKGNvdW50KSB7XG4gIHJlZ2wuY2xlYXIoe1xuICAgIGNvbG9yOiBbMCwgMCwgMCwgMV1cbiAgfSlcblxuICBkcmF3KHtcbiAgICBjb2xvcjogW1xuICAgICAgTWF0aC5zaW4oMC4wMDEgKiBjb3VudCksXG4gICAgICBNYXRoLmNvcygwLjAyICogY291bnQpLFxuICAgICAgTWF0aC5zaW4oMC4zICogY291bnQpLFxuICAgICAgMVxuICAgIF1cbiAgfSlcbn0pXG4iLCJ2YXIgZ2xUeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL2R0eXBlcy5qc29uJylcbnZhciBleHRlbmQgPSByZXF1aXJlKCcuL2V4dGVuZCcpXG5cbnZhciBHTF9GTE9BVCA9IDUxMjZcblxuZnVuY3Rpb24gQXR0cmlidXRlUmVjb3JkICgpIHtcbiAgdGhpcy5wb2ludGVyID0gZmFsc2VcblxuICB0aGlzLnggPSAwLjBcbiAgdGhpcy55ID0gMC4wXG4gIHRoaXMueiA9IDAuMFxuICB0aGlzLncgPSAwLjBcblxuICB0aGlzLmJ1ZmZlciA9IG51bGxcbiAgdGhpcy5zaXplID0gMFxuICB0aGlzLm5vcm1hbGl6ZWQgPSBmYWxzZVxuICB0aGlzLnR5cGUgPSBHTF9GTE9BVFxuICB0aGlzLm9mZnNldCA9IDBcbiAgdGhpcy5zdHJpZGUgPSAwXG4gIHRoaXMuZGl2aXNvciA9IDBcbn1cblxuZXh0ZW5kKEF0dHJpYnV0ZVJlY29yZC5wcm90b3R5cGUsIHtcbiAgZXF1YWxzOiBmdW5jdGlvbiAob3RoZXIsIHNpemUpIHtcbiAgICBpZiAoIXRoaXMucG9pbnRlcikge1xuICAgICAgcmV0dXJuICFvdGhlci5wb2ludGVyICYmXG4gICAgICAgIHRoaXMueCA9PT0gb3RoZXIueCAmJlxuICAgICAgICB0aGlzLnkgPT09IG90aGVyLnkgJiZcbiAgICAgICAgdGhpcy56ID09PSBvdGhlci56ICYmXG4gICAgICAgIHRoaXMudyA9PT0gb3RoZXIud1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gb3RoZXIucG9pbnRlciAmJlxuICAgICAgICB0aGlzLmJ1ZmZlciA9PT0gb3RoZXIuYnVmZmVyICYmXG4gICAgICAgIHRoaXMuc2l6ZSA9PT0gc2l6ZSAmJlxuICAgICAgICB0aGlzLm5vcm1hbGl6ZWQgPT09IG90aGVyLm5vcm1hbGl6ZWQgJiZcbiAgICAgICAgdGhpcy50eXBlID09PSBvdGhlci50eXBlICYmXG4gICAgICAgIHRoaXMub2Zmc2V0ID09PSBvdGhlci5vZmZzZXQgJiZcbiAgICAgICAgdGhpcy5zdHJpZGUgPT09IG90aGVyLnN0cmlkZSAmJlxuICAgICAgICB0aGlzLmRpdmlzb3IgPT09IG90aGVyLmRpdmlzb3JcbiAgICB9XG4gIH0sXG5cbiAgc2V0OiBmdW5jdGlvbiAob3RoZXIsIHNpemUpIHtcbiAgICB2YXIgcG9pbnRlciA9IHRoaXMucG9pbnRlciA9IG90aGVyLnBvaW50ZXJcbiAgICBpZiAocG9pbnRlcikge1xuICAgICAgdGhpcy5idWZmZXIgPSBvdGhlci5idWZmZXJcbiAgICAgIHRoaXMuc2l6ZSA9IHNpemVcbiAgICAgIHRoaXMubm9ybWFsaXplZCA9IG90aGVyLm5vcm1hbGl6ZWRcbiAgICAgIHRoaXMudHlwZSA9IG90aGVyLnR5cGVcbiAgICAgIHRoaXMub2Zmc2V0ID0gb3RoZXIub2Zmc2V0XG4gICAgICB0aGlzLnN0cmlkZSA9IG90aGVyLnN0cmlkZVxuICAgICAgdGhpcy5kaXZpc29yID0gb3RoZXIuZGl2aXNvclxuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnggPSBvdGhlci54XG4gICAgICB0aGlzLnkgPSBvdGhlci55XG4gICAgICB0aGlzLnogPSBvdGhlci56XG4gICAgICB0aGlzLncgPSBvdGhlci53XG4gICAgfVxuICB9XG59KVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBBdHRyaWJ1dGVTdGF0ZSAoXG4gIGdsLFxuICBleHRlbnNpb25zLFxuICBsaW1pdHMsXG4gIGJ1ZmZlclN0YXRlLFxuICBzdHJpbmdTdG9yZSkge1xuXG4gIHZhciBhdHRyaWJ1dGVTdGF0ZSA9IHt9XG5cbiAgdmFyIE5VTV9BVFRSSUJVVEVTID0gbGltaXRzLm1heEF0dHJpYnV0ZXNcbiAgdmFyIGF0dHJpYnV0ZUJpbmRpbmdzID0gbmV3IEFycmF5KE5VTV9BVFRSSUJVVEVTKVxuICBmb3IgKHZhciBpID0gMDsgaSA8IE5VTV9BVFRSSUJVVEVTOyArK2kpIHtcbiAgICBhdHRyaWJ1dGVCaW5kaW5nc1tpXSA9IG5ldyBBdHRyaWJ1dGVSZWNvcmQoKVxuICB9XG5cbiAgZnVuY3Rpb24gQXR0cmlidXRlU3RhY2sgKCkge1xuICAgIHZhciByZWNvcmRzID0gbmV3IEFycmF5KDE2KVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgMTY7ICsraSkge1xuICAgICAgcmVjb3Jkc1tpXSA9IG5ldyBBdHRyaWJ1dGVSZWNvcmQoKVxuICAgIH1cbiAgICB0aGlzLnJlY29yZHMgPSByZWNvcmRzXG4gICAgdGhpcy50b3AgPSAwXG4gIH1cblxuICBmdW5jdGlvbiBwdXNoQXR0cmlidXRlU3RhY2sgKHN0YWNrKSB7XG4gICAgdmFyIHJlY29yZHMgPSBzdGFjay5yZWNvcmRzXG4gICAgdmFyIHRvcCA9IHN0YWNrLnRvcFxuXG4gICAgd2hpbGUgKHJlY29yZHMubGVuZ3RoIC0gMSA8PSB0b3ApIHtcbiAgICAgIHJlY29yZHMucHVzaChuZXcgQXR0cmlidXRlUmVjb3JkKCkpXG4gICAgfVxuXG4gICAgcmV0dXJuIHJlY29yZHNbKytzdGFjay50b3BdXG4gIH1cblxuICBleHRlbmQoQXR0cmlidXRlU3RhY2sucHJvdG90eXBlLCB7XG4gICAgcHVzaFZlYzogZnVuY3Rpb24gKHgsIHksIHosIHcpIHtcbiAgICAgIHZhciBoZWFkID0gcHVzaEF0dHJpYnV0ZVN0YWNrKHRoaXMpXG4gICAgICBoZWFkLnBvaW50ZXIgPSBmYWxzZVxuICAgICAgaGVhZC54ID0geFxuICAgICAgaGVhZC55ID0geVxuICAgICAgaGVhZC56ID0gelxuICAgICAgaGVhZC53ID0gd1xuICAgIH0sXG5cbiAgICBwdXNoUHRyOiBmdW5jdGlvbiAoXG4gICAgICBidWZmZXIsXG4gICAgICBzaXplLFxuICAgICAgb2Zmc2V0LFxuICAgICAgc3RyaWRlLFxuICAgICAgZGl2aXNvcixcbiAgICAgIG5vcm1hbGl6ZWQsXG4gICAgICB0eXBlKSB7XG4gICAgICB2YXIgaGVhZCA9IHB1c2hBdHRyaWJ1dGVTdGFjayh0aGlzKVxuICAgICAgaGVhZC5wb2ludGVyID0gdHJ1ZVxuICAgICAgaGVhZC5idWZmZXIgPSBidWZmZXJcbiAgICAgIGhlYWQuc2l6ZSA9IHNpemVcbiAgICAgIGhlYWQub2Zmc2V0ID0gb2Zmc2V0XG4gICAgICBoZWFkLnN0cmlkZSA9IHN0cmlkZVxuICAgICAgaGVhZC5kaXZpc29yID0gZGl2aXNvclxuICAgICAgaGVhZC5ub3JtYWxpemVkID0gbm9ybWFsaXplZFxuICAgICAgaGVhZC50eXBlID0gdHlwZVxuICAgIH0sXG5cbiAgICBwdXNoRHluOiBmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgaWYgKHR5cGVvZiBkYXRhID09PSAnbnVtYmVyJykge1xuICAgICAgICB0aGlzLnB1c2hWZWMoZGF0YSwgMCwgMCwgMClcbiAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShkYXRhKSkge1xuICAgICAgICB0aGlzLnB1c2hWZWMoZGF0YVswXSwgZGF0YVsxXSwgZGF0YVsyXSwgZGF0YVszXSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBidWZmZXIgPSBidWZmZXJTdGF0ZS5nZXRCdWZmZXIoZGF0YSlcbiAgICAgICAgdmFyIHNpemUgPSAwXG4gICAgICAgIHZhciBzdHJpZGUgPSAwXG4gICAgICAgIHZhciBvZmZzZXQgPSAwXG4gICAgICAgIHZhciBkaXZpc29yID0gMFxuICAgICAgICB2YXIgbm9ybWFsaXplZCA9IGZhbHNlXG4gICAgICAgIHZhciB0eXBlID0gR0xfRkxPQVRcbiAgICAgICAgaWYgKCFidWZmZXIpIHtcbiAgICAgICAgICBidWZmZXIgPSBidWZmZXJTdGF0ZS5nZXRCdWZmZXIoZGF0YS5idWZmZXIpXG4gICAgICAgICAgc2l6ZSA9IGRhdGEuc2l6ZSB8fCAwXG4gICAgICAgICAgc3RyaWRlID0gZGF0YS5zdHJpZGUgfHwgMFxuICAgICAgICAgIG9mZnNldCA9IGRhdGEub2Zmc2V0IHx8IDBcbiAgICAgICAgICBkaXZpc29yID0gZGF0YS5kaXZpc29yIHx8IDBcbiAgICAgICAgICBub3JtYWxpemVkID0gZGF0YS5ub3JtYWxpemVkIHx8IGZhbHNlXG4gICAgICAgICAgdHlwZSA9IGJ1ZmZlci5kdHlwZVxuICAgICAgICAgIGlmICgndHlwZScgaW4gZGF0YSkge1xuICAgICAgICAgICAgdHlwZSA9IGdsVHlwZXNbZGF0YS50eXBlXVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0eXBlID0gYnVmZmVyLmR0eXBlXG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5wdXNoUHRyKGJ1ZmZlciwgc2l6ZSwgb2Zmc2V0LCBzdHJpZGUsIGRpdmlzb3IsIG5vcm1hbGl6ZWQsIHR5cGUpXG4gICAgICB9XG4gICAgfSxcblxuICAgIHBvcDogZnVuY3Rpb24gKCkge1xuICAgICAgdGhpcy50b3AgLT0gMVxuICAgIH1cbiAgfSlcblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gQklORCBBTiBBVFRSSUJVVEVcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIGJpbmRBdHRyaWJ1dGUgKGluZGV4LCBjdXJyZW50LCBuZXh0LCBzaXplKSB7XG4gICAgc2l6ZSA9IG5leHQuc2l6ZSB8fCBzaXplXG4gICAgaWYgKGN1cnJlbnQuZXF1YWxzKG5leHQsIHNpemUpKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgaWYgKCFuZXh0LnBvaW50ZXIpIHtcbiAgICAgIGlmIChjdXJyZW50LnBvaW50ZXIpIHtcbiAgICAgICAgZ2wuZGlzYWJsZVZlcnRleEF0dHJpYkFycmF5KGluZGV4KVxuICAgICAgfVxuICAgICAgZ2wudmVydGV4QXR0cmliNGYoaW5kZXgsIG5leHQueCwgbmV4dC55LCBuZXh0LnosIG5leHQudylcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKCFjdXJyZW50LnBvaW50ZXIpIHtcbiAgICAgICAgZ2wuZW5hYmxlVmVydGV4QXR0cmliQXJyYXkoaW5kZXgpXG4gICAgICB9XG4gICAgICBpZiAoY3VycmVudC5idWZmZXIgIT09IG5leHQuYnVmZmVyKSB7XG4gICAgICAgIG5leHQuYnVmZmVyLmJpbmQoKVxuICAgICAgfVxuICAgICAgZ2wudmVydGV4QXR0cmliUG9pbnRlcihcbiAgICAgICAgaW5kZXgsXG4gICAgICAgIHNpemUsXG4gICAgICAgIG5leHQudHlwZSxcbiAgICAgICAgbmV4dC5ub3JtYWxpemVkLFxuICAgICAgICBuZXh0LnN0cmlkZSxcbiAgICAgICAgbmV4dC5vZmZzZXQpXG4gICAgICB2YXIgZXh0SW5zdGFuY2luZyA9IGV4dGVuc2lvbnMuYW5nbGVfaW5zdGFuY2VkX2FycmF5c1xuICAgICAgaWYgKGV4dEluc3RhbmNpbmcpIHtcbiAgICAgICAgZXh0SW5zdGFuY2luZy52ZXJ0ZXhBdHRyaWJEaXZpc29yQU5HTEUoaW5kZXgsIG5leHQuZGl2aXNvcilcbiAgICAgIH1cbiAgICB9XG4gICAgY3VycmVudC5zZXQobmV4dCwgc2l6ZSlcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBERUZJTkUgQSBORVcgQVRUUklCVVRFXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICBmdW5jdGlvbiBkZWZBdHRyaWJ1dGUgKG5hbWUpIHtcbiAgICB2YXIgaWQgPSBzdHJpbmdTdG9yZS5pZChuYW1lKVxuICAgIHZhciByZXN1bHQgPSBhdHRyaWJ1dGVTdGF0ZVtpZF1cbiAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgcmVzdWx0ID0gYXR0cmlidXRlU3RhdGVbaWRdID0gbmV3IEF0dHJpYnV0ZVN0YWNrKClcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBiaW5kaW5nczogYXR0cmlidXRlQmluZGluZ3MsXG4gICAgYmluZDogYmluZEF0dHJpYnV0ZSxcbiAgICBkZWY6IGRlZkF0dHJpYnV0ZVxuICB9XG59XG4iLCIvLyBBcnJheSBhbmQgZWxlbWVudCBidWZmZXIgY3JlYXRpb25cblxudmFyIGlzVHlwZWRBcnJheSA9IHJlcXVpcmUoJy4vaXMtdHlwZWQtYXJyYXknKVxudmFyIGlzTkRBcnJheUxpa2UgPSByZXF1aXJlKCcuL2lzLW5kYXJyYXknKVxudmFyIGFycmF5VHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9hcnJheXR5cGVzLmpzb24nKVxudmFyIGJ1ZmZlclR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvZHR5cGVzLmpzb24nKVxudmFyIHZhbHVlcyA9IHJlcXVpcmUoJy4vdmFsdWVzJylcblxudmFyIEdMX1NUQVRJQ19EUkFXID0gMzUwNDRcblxudmFyIEdMX0JZVEUgPSA1MTIwXG52YXIgR0xfVU5TSUdORURfQllURSA9IDUxMjFcbnZhciBHTF9TSE9SVCA9IDUxMjJcbnZhciBHTF9VTlNJR05FRF9TSE9SVCA9IDUxMjNcbnZhciBHTF9JTlQgPSA1MTI0XG52YXIgR0xfVU5TSUdORURfSU5UID0gNTEyNVxudmFyIEdMX0ZMT0FUID0gNTEyNlxuXG52YXIgdXNhZ2VUeXBlcyA9IHtcbiAgJ3N0YXRpYyc6IDM1MDQ0LFxuICAnZHluYW1pYyc6IDM1MDQ4LFxuICAnc3RyZWFtJzogMzUwNDBcbn1cblxuZnVuY3Rpb24gdHlwZWRBcnJheUNvZGUgKGRhdGEpIHtcbiAgcmV0dXJuIGFycmF5VHlwZXNbT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGRhdGEpXSB8IDBcbn1cblxuZnVuY3Rpb24gbWFrZVR5cGVkQXJyYXkgKGR0eXBlLCBhcmdzKSB7XG4gIHN3aXRjaCAoZHR5cGUpIHtcbiAgICBjYXNlIEdMX1VOU0lHTkVEX0JZVEU6XG4gICAgICByZXR1cm4gbmV3IFVpbnQ4QXJyYXkoYXJncylcbiAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUOlxuICAgICAgcmV0dXJuIG5ldyBVaW50MTZBcnJheShhcmdzKVxuICAgIGNhc2UgR0xfVU5TSUdORURfSU5UOlxuICAgICAgcmV0dXJuIG5ldyBVaW50MzJBcnJheShhcmdzKVxuICAgIGNhc2UgR0xfQllURTpcbiAgICAgIHJldHVybiBuZXcgSW50OEFycmF5KGFyZ3MpXG4gICAgY2FzZSBHTF9TSE9SVDpcbiAgICAgIHJldHVybiBuZXcgSW50MTZBcnJheShhcmdzKVxuICAgIGNhc2UgR0xfSU5UOlxuICAgICAgcmV0dXJuIG5ldyBJbnQzMkFycmF5KGFyZ3MpXG4gICAgY2FzZSBHTF9GTE9BVDpcbiAgICAgIHJldHVybiBuZXcgRmxvYXQzMkFycmF5KGFyZ3MpXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBudWxsXG4gIH1cbn1cblxuZnVuY3Rpb24gZmxhdHRlbiAocmVzdWx0LCBkYXRhLCBkaW1lbnNpb24pIHtcbiAgdmFyIHB0ciA9IDBcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBkYXRhLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIHYgPSBkYXRhW2ldXG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBkaW1lbnNpb247ICsraikge1xuICAgICAgcmVzdWx0W3B0cisrXSA9IHZbal1cbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gdHJhbnNwb3NlIChyZXN1bHQsIGRhdGEsIHNoYXBlWCwgc2hhcGVZLCBzdHJpZGVYLCBzdHJpZGVZLCBvZmZzZXQpIHtcbiAgdmFyIHB0ciA9IDBcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzaGFwZVg7ICsraSkge1xuICAgIGZvciAodmFyIGogPSAwOyBqIDwgc2hhcGVZOyArK2opIHtcbiAgICAgIHJlc3VsdFtwdHIrK10gPSBkYXRhW3N0cmlkZVggKiBpICsgc3RyaWRlWSAqIGogKyBvZmZzZXRdXG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHRcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwQnVmZmVyU3RhdGUgKGdsKSB7XG4gIHZhciBidWZmZXJDb3VudCA9IDBcbiAgdmFyIGJ1ZmZlclNldCA9IHt9XG5cbiAgZnVuY3Rpb24gUkVHTEJ1ZmZlciAoYnVmZmVyLCB0eXBlKSB7XG4gICAgdGhpcy5pZCA9IGJ1ZmZlckNvdW50KytcbiAgICB0aGlzLmJ1ZmZlciA9IGJ1ZmZlclxuICAgIHRoaXMudHlwZSA9IHR5cGVcbiAgICB0aGlzLnVzYWdlID0gR0xfU1RBVElDX0RSQVdcbiAgICB0aGlzLmJ5dGVMZW5ndGggPSAwXG4gICAgdGhpcy5kaW1lbnNpb24gPSAxXG4gICAgdGhpcy5kYXRhID0gbnVsbFxuICAgIHRoaXMuZHR5cGUgPSBHTF9VTlNJR05FRF9CWVRFXG4gIH1cblxuICBSRUdMQnVmZmVyLnByb3RvdHlwZS5iaW5kID0gZnVuY3Rpb24gKCkge1xuICAgIGdsLmJpbmRCdWZmZXIodGhpcy50eXBlLCB0aGlzLmJ1ZmZlcilcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlZnJlc2ggKGJ1ZmZlcikge1xuICAgIGlmICghZ2wuaXNCdWZmZXIoYnVmZmVyLmJ1ZmZlcikpIHtcbiAgICAgIGJ1ZmZlci5idWZmZXIgPSBnbC5jcmVhdGVCdWZmZXIoKVxuICAgIH1cbiAgICBidWZmZXIuYmluZCgpXG4gICAgZ2wuYnVmZmVyRGF0YShidWZmZXIudHlwZSwgYnVmZmVyLmRhdGEgfHwgYnVmZmVyLmJ5dGVMZW5ndGgsIGJ1ZmZlci51c2FnZSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3kgKGJ1ZmZlcikge1xuICAgIHZhciBoYW5kbGUgPSBidWZmZXIuYnVmZmVyXG4gICAgXG4gICAgaWYgKGdsLmlzQnVmZmVyKGhhbmRsZSkpIHtcbiAgICAgIGdsLmRlbGV0ZUJ1ZmZlcihoYW5kbGUpXG4gICAgfVxuICAgIGJ1ZmZlci5idWZmZXIgPSBudWxsXG4gICAgZGVsZXRlIGJ1ZmZlclNldFtidWZmZXIuaWRdXG4gIH1cblxuICBmdW5jdGlvbiBjcmVhdGVCdWZmZXIgKG9wdGlvbnMsIHR5cGUsIGRlZmVySW5pdCkge1xuICAgIHZhciBoYW5kbGUgPSBnbC5jcmVhdGVCdWZmZXIoKVxuXG4gICAgdmFyIGJ1ZmZlciA9IG5ldyBSRUdMQnVmZmVyKGhhbmRsZSwgdHlwZSlcbiAgICBidWZmZXJTZXRbYnVmZmVyLmlkXSA9IGJ1ZmZlclxuXG4gICAgZnVuY3Rpb24gcmVnbEJ1ZmZlciAoaW5wdXQpIHtcbiAgICAgIHZhciBvcHRpb25zID0gaW5wdXQgfHwge31cbiAgICAgIGlmIChBcnJheS5pc0FycmF5KG9wdGlvbnMpIHx8XG4gICAgICAgICAgaXNUeXBlZEFycmF5KG9wdGlvbnMpIHx8XG4gICAgICAgICAgaXNOREFycmF5TGlrZShvcHRpb25zKSkge1xuICAgICAgICBvcHRpb25zID0ge1xuICAgICAgICAgIGRhdGE6IG9wdGlvbnNcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICh0eXBlb2Ygb3B0aW9ucyA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgb3B0aW9ucyA9IHtcbiAgICAgICAgICBsZW5ndGg6IG9wdGlvbnMgfCAwXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAob3B0aW9ucyA9PT0gbnVsbCB8fCBvcHRpb25zID09PSB2b2lkIDApIHtcbiAgICAgICAgb3B0aW9ucyA9IHt9XG4gICAgICB9XG5cbiAgICAgIFxuXG4gICAgICBpZiAoJ3VzYWdlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciB1c2FnZSA9IG9wdGlvbnMudXNhZ2VcbiAgICAgICAgXG4gICAgICAgIGJ1ZmZlci51c2FnZSA9IHVzYWdlVHlwZXNbb3B0aW9ucy51c2FnZV1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGJ1ZmZlci51c2FnZSA9IEdMX1NUQVRJQ19EUkFXXG4gICAgICB9XG5cbiAgICAgIHZhciBkdHlwZSA9IDBcbiAgICAgIGlmICgndHlwZScgaW4gb3B0aW9ucykge1xuICAgICAgICBcbiAgICAgICAgZHR5cGUgPSBidWZmZXJUeXBlc1tvcHRpb25zLnR5cGVdXG4gICAgICB9XG5cbiAgICAgIHZhciBkaW1lbnNpb24gPSAob3B0aW9ucy5kaW1lbnNpb24gfCAwKSB8fCAxXG4gICAgICB2YXIgYnl0ZUxlbmd0aCA9IDBcbiAgICAgIHZhciBkYXRhID0gbnVsbFxuICAgICAgaWYgKCdkYXRhJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIGRhdGEgPSBvcHRpb25zLmRhdGFcbiAgICAgICAgaWYgKGRhdGEgPT09IG51bGwpIHtcbiAgICAgICAgICBieXRlTGVuZ3RoID0gb3B0aW9ucy5sZW5ndGggfCAwXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWYgKGlzTkRBcnJheUxpa2UoZGF0YSkpIHtcbiAgICAgICAgICAgIHZhciBzaGFwZSA9IGRhdGEuc2hhcGVcbiAgICAgICAgICAgIHZhciBzdHJpZGUgPSBkYXRhLnN0cmlkZVxuICAgICAgICAgICAgdmFyIG9mZnNldCA9IGRhdGEub2Zmc2V0XG5cbiAgICAgICAgICAgIHZhciBzaGFwZVggPSAwXG4gICAgICAgICAgICB2YXIgc2hhcGVZID0gMFxuICAgICAgICAgICAgdmFyIHN0cmlkZVggPSAwXG4gICAgICAgICAgICB2YXIgc3RyaWRlWSA9IDBcbiAgICAgICAgICAgIGlmIChzaGFwZS5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgICAgc2hhcGVYID0gc2hhcGVbMF1cbiAgICAgICAgICAgICAgc2hhcGVZID0gMVxuICAgICAgICAgICAgICBzdHJpZGVYID0gc3RyaWRlWzBdXG4gICAgICAgICAgICAgIHN0cmlkZVkgPSAwXG4gICAgICAgICAgICB9IGVsc2UgaWYgKHNoYXBlLmxlbmd0aCA9PT0gMikge1xuICAgICAgICAgICAgICBzaGFwZVggPSBzaGFwZVswXVxuICAgICAgICAgICAgICBzaGFwZVkgPSBzaGFwZVsxXVxuICAgICAgICAgICAgICBzdHJpZGVYID0gc3RyaWRlWzBdXG4gICAgICAgICAgICAgIHN0cmlkZVkgPSBzdHJpZGVbMV1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBkdHlwZSA9IGR0eXBlIHx8IHR5cGVkQXJyYXlDb2RlKGRhdGEpIHx8IEdMX0ZMT0FUXG4gICAgICAgICAgICBkaW1lbnNpb24gPSBzaGFwZVlcbiAgICAgICAgICAgIGRhdGEgPSB0cmFuc3Bvc2UoXG4gICAgICAgICAgICAgIG1ha2VUeXBlZEFycmF5KGR0eXBlLCBzaGFwZVggKiBzaGFwZVkpLFxuICAgICAgICAgICAgICBkYXRhLmRhdGEsXG4gICAgICAgICAgICAgIHNoYXBlWCwgc2hhcGVZLFxuICAgICAgICAgICAgICBzdHJpZGVYLCBzdHJpZGVZLFxuICAgICAgICAgICAgICBvZmZzZXQpXG4gICAgICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XG4gICAgICAgICAgICBpZiAoZGF0YS5sZW5ndGggPiAwICYmIEFycmF5LmlzQXJyYXkoZGF0YVswXSkpIHtcbiAgICAgICAgICAgICAgZGltZW5zaW9uID0gZGF0YVswXS5sZW5ndGhcbiAgICAgICAgICAgICAgZHR5cGUgPSBkdHlwZSB8fCBHTF9GTE9BVFxuICAgICAgICAgICAgICB2YXIgcmVzdWx0ID0gbWFrZVR5cGVkQXJyYXkoZHR5cGUsIGRhdGEubGVuZ3RoICogZGltZW5zaW9uKVxuICAgICAgICAgICAgICBkYXRhID0gZmxhdHRlbihyZXN1bHQsIGRhdGEsIGRpbWVuc2lvbilcbiAgICAgICAgICAgICAgZGF0YSA9IHJlc3VsdFxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgZHR5cGUgPSBkdHlwZSB8fCBHTF9GTE9BVFxuICAgICAgICAgICAgICBkYXRhID0gbWFrZVR5cGVkQXJyYXkoZHR5cGUsIGRhdGEpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZHR5cGUgPSBkdHlwZSB8fCB0eXBlZEFycmF5Q29kZShkYXRhKVxuICAgICAgICAgIH1cbiAgICAgICAgICBieXRlTGVuZ3RoID0gZGF0YS5ieXRlTGVuZ3RoXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoJ2xlbmd0aCcgaW4gb3B0aW9ucykge1xuICAgICAgICBieXRlTGVuZ3RoID0gb3B0aW9ucy5sZW5ndGggfCAwXG4gICAgICAgIFxuICAgICAgfVxuXG4gICAgICBidWZmZXIuZGF0YSA9IGRhdGFcbiAgICAgIGJ1ZmZlci5kdHlwZSA9IGR0eXBlIHx8IEdMX1VOU0lHTkVEX0JZVEVcbiAgICAgIGJ1ZmZlci5ieXRlTGVuZ3RoID0gYnl0ZUxlbmd0aFxuICAgICAgYnVmZmVyLmRpbWVuc2lvbiA9IGRpbWVuc2lvblxuXG4gICAgICByZWZyZXNoKGJ1ZmZlcilcblxuICAgICAgcmV0dXJuIHJlZ2xCdWZmZXJcbiAgICB9XG5cbiAgICBpZiAoIWRlZmVySW5pdCkge1xuICAgICAgcmVnbEJ1ZmZlcihvcHRpb25zKVxuICAgIH1cblxuICAgIHJlZ2xCdWZmZXIuX3JlZ2xUeXBlID0gJ2J1ZmZlcidcbiAgICByZWdsQnVmZmVyLl9idWZmZXIgPSBidWZmZXJcbiAgICByZWdsQnVmZmVyLmRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7IGRlc3Ryb3koYnVmZmVyKSB9XG5cbiAgICByZXR1cm4gcmVnbEJ1ZmZlclxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjcmVhdGU6IGNyZWF0ZUJ1ZmZlcixcblxuICAgIGNsZWFyOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YWx1ZXMoYnVmZmVyU2V0KS5mb3JFYWNoKGRlc3Ryb3kpXG4gICAgfSxcblxuICAgIHJlZnJlc2g6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhbHVlcyhidWZmZXJTZXQpLmZvckVhY2gocmVmcmVzaClcbiAgICB9LFxuXG4gICAgZ2V0QnVmZmVyOiBmdW5jdGlvbiAod3JhcHBlcikge1xuICAgICAgaWYgKHdyYXBwZXIgJiYgd3JhcHBlci5fYnVmZmVyIGluc3RhbmNlb2YgUkVHTEJ1ZmZlcikge1xuICAgICAgICByZXR1cm4gd3JhcHBlci5fYnVmZmVyXG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cbiAgfVxufVxuIiwiLyogZ2xvYmFscyBwZXJmb3JtYW5jZSAqL1xubW9kdWxlLmV4cG9ydHMgPVxuICAodHlwZW9mIHBlcmZvcm1hbmNlICE9PSAndW5kZWZpbmVkJyAmJiBwZXJmb3JtYW5jZS5ub3cpXG4gID8gZnVuY3Rpb24gKCkgeyByZXR1cm4gcGVyZm9ybWFuY2Uubm93KCkgfVxuICA6IGZ1bmN0aW9uICgpIHsgcmV0dXJuICsobmV3IERhdGUoKSkgfVxuIiwidmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vZXh0ZW5kJylcblxuZnVuY3Rpb24gc2xpY2UgKHgpIHtcbiAgcmV0dXJuIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKHgpXG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY3JlYXRlRW52aXJvbm1lbnQgKCkge1xuICAvLyBVbmlxdWUgdmFyaWFibGUgaWQgY291bnRlclxuICB2YXIgdmFyQ291bnRlciA9IDBcblxuICAvLyBMaW5rZWQgdmFsdWVzIGFyZSBwYXNzZWQgZnJvbSB0aGlzIHNjb3BlIGludG8gdGhlIGdlbmVyYXRlZCBjb2RlIGJsb2NrXG4gIC8vIENhbGxpbmcgbGluaygpIHBhc3NlcyBhIHZhbHVlIGludG8gdGhlIGdlbmVyYXRlZCBzY29wZSBhbmQgcmV0dXJuc1xuICAvLyB0aGUgdmFyaWFibGUgbmFtZSB3aGljaCBpdCBpcyBib3VuZCB0b1xuICB2YXIgbGlua2VkTmFtZXMgPSBbXVxuICB2YXIgbGlua2VkVmFsdWVzID0gW11cbiAgZnVuY3Rpb24gbGluayAodmFsdWUpIHtcbiAgICB2YXIgbmFtZSA9ICdnJyArICh2YXJDb3VudGVyKyspXG4gICAgbGlua2VkTmFtZXMucHVzaChuYW1lKVxuICAgIGxpbmtlZFZhbHVlcy5wdXNoKHZhbHVlKVxuICAgIHJldHVybiBuYW1lXG4gIH1cblxuICAvLyBjcmVhdGUgYSBjb2RlIGJsb2NrXG4gIGZ1bmN0aW9uIGJsb2NrICgpIHtcbiAgICB2YXIgY29kZSA9IFtdXG4gICAgZnVuY3Rpb24gcHVzaCAoKSB7XG4gICAgICBjb2RlLnB1c2guYXBwbHkoY29kZSwgc2xpY2UoYXJndW1lbnRzKSlcbiAgICB9XG5cbiAgICB2YXIgdmFycyA9IFtdXG4gICAgZnVuY3Rpb24gZGVmICgpIHtcbiAgICAgIHZhciBuYW1lID0gJ3YnICsgKHZhckNvdW50ZXIrKylcbiAgICAgIHZhcnMucHVzaChuYW1lKVxuXG4gICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29kZS5wdXNoKG5hbWUsICc9JylcbiAgICAgICAgY29kZS5wdXNoLmFwcGx5KGNvZGUsIHNsaWNlKGFyZ3VtZW50cykpXG4gICAgICAgIGNvZGUucHVzaCgnOycpXG4gICAgICB9XG5cbiAgICAgIHJldHVybiBuYW1lXG4gICAgfVxuXG4gICAgcmV0dXJuIGV4dGVuZChwdXNoLCB7XG4gICAgICBkZWY6IGRlZixcbiAgICAgIHRvU3RyaW5nOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgKHZhcnMubGVuZ3RoID4gMCA/ICd2YXIgJyArIHZhcnMgKyAnOycgOiAnJyksXG4gICAgICAgICAgY29kZS5qb2luKCcnKVxuICAgICAgICBdLmpvaW4oJycpXG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIC8vIHByb2NlZHVyZSBsaXN0XG4gIHZhciBwcm9jZWR1cmVzID0ge31cbiAgZnVuY3Rpb24gcHJvYyAobmFtZSkge1xuICAgIHZhciBhcmdzID0gW11cbiAgICBmdW5jdGlvbiBhcmcgKCkge1xuICAgICAgdmFyIG5hbWUgPSAnYScgKyAodmFyQ291bnRlcisrKVxuICAgICAgYXJncy5wdXNoKG5hbWUpXG4gICAgICByZXR1cm4gbmFtZVxuICAgIH1cblxuICAgIHZhciBib2R5ID0gYmxvY2soKVxuICAgIHZhciBib2R5VG9TdHJpbmcgPSBib2R5LnRvU3RyaW5nXG5cbiAgICB2YXIgcmVzdWx0ID0gcHJvY2VkdXJlc1tuYW1lXSA9IGV4dGVuZChib2R5LCB7XG4gICAgICBhcmc6IGFyZyxcbiAgICAgIHRvU3RyaW5nOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgJ2Z1bmN0aW9uKCcsIGFyZ3Muam9pbigpLCAnKXsnLFxuICAgICAgICAgIGJvZHlUb1N0cmluZygpLFxuICAgICAgICAgICd9J1xuICAgICAgICBdLmpvaW4oJycpXG4gICAgICB9XG4gICAgfSlcblxuICAgIHJldHVybiByZXN1bHRcbiAgfVxuXG4gIGZ1bmN0aW9uIGNvbXBpbGUgKCkge1xuICAgIHZhciBjb2RlID0gWydcInVzZSBzdHJpY3RcIjtyZXR1cm4geyddXG4gICAgT2JqZWN0LmtleXMocHJvY2VkdXJlcykuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgY29kZS5wdXNoKCdcIicsIG5hbWUsICdcIjonLCBwcm9jZWR1cmVzW25hbWVdLnRvU3RyaW5nKCksICcsJylcbiAgICB9KVxuICAgIGNvZGUucHVzaCgnfScpXG4gICAgdmFyIHByb2MgPSBGdW5jdGlvbi5hcHBseShudWxsLCBsaW5rZWROYW1lcy5jb25jYXQoW2NvZGUuam9pbignJyldKSlcbiAgICByZXR1cm4gcHJvYy5hcHBseShudWxsLCBsaW5rZWRWYWx1ZXMpXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGxpbms6IGxpbmssXG4gICAgYmxvY2s6IGJsb2NrLFxuICAgIHByb2M6IHByb2MsXG4gICAgY29tcGlsZTogY29tcGlsZVxuICB9XG59XG4iLCJcbnZhciBjcmVhdGVFbnZpcm9ubWVudCA9IHJlcXVpcmUoJy4vY29kZWdlbicpXG5cbnZhciBwcmltVHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9wcmltaXRpdmVzLmpzb24nKVxudmFyIGdsVHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9kdHlwZXMuanNvbicpXG5cbnZhciBHTF9FTEVNRU5UX0FSUkFZX0JVRkZFUiA9IDM0OTYzXG5cbnZhciBHTF9GTE9BVCA9IDUxMjZcbnZhciBHTF9GTE9BVF9WRUMyID0gMzU2NjRcbnZhciBHTF9GTE9BVF9WRUMzID0gMzU2NjVcbnZhciBHTF9GTE9BVF9WRUM0ID0gMzU2NjZcbnZhciBHTF9JTlQgPSA1MTI0XG52YXIgR0xfSU5UX1ZFQzIgPSAzNTY2N1xudmFyIEdMX0lOVF9WRUMzID0gMzU2NjhcbnZhciBHTF9JTlRfVkVDNCA9IDM1NjY5XG52YXIgR0xfQk9PTCA9IDM1NjcwXG52YXIgR0xfQk9PTF9WRUMyID0gMzU2NzFcbnZhciBHTF9CT09MX1ZFQzMgPSAzNTY3MlxudmFyIEdMX0JPT0xfVkVDNCA9IDM1NjczXG52YXIgR0xfRkxPQVRfTUFUMiA9IDM1Njc0XG52YXIgR0xfRkxPQVRfTUFUMyA9IDM1Njc1XG52YXIgR0xfRkxPQVRfTUFUNCA9IDM1Njc2XG52YXIgR0xfU0FNUExFUl8yRCA9IDM1Njc4XG52YXIgR0xfU0FNUExFUl9DVUJFID0gMzU2ODBcblxudmFyIEdMX1RSSUFOR0xFUyA9IDRcblxudmFyIEdMX0NVTExfRkFDRSA9IDB4MEI0NFxudmFyIEdMX0JMRU5EID0gMHgwQkUyXG52YXIgR0xfRElUSEVSID0gMHgwQkQwXG52YXIgR0xfU1RFTkNJTF9URVNUID0gMHgwQjkwXG52YXIgR0xfREVQVEhfVEVTVCA9IDB4MEI3MVxudmFyIEdMX1NDSVNTT1JfVEVTVCA9IDB4MEMxMVxudmFyIEdMX1BPTFlHT05fT0ZGU0VUX0ZJTEwgPSAweDgwMzdcbnZhciBHTF9TQU1QTEVfQUxQSEFfVE9fQ09WRVJBR0UgPSAweDgwOUVcbnZhciBHTF9TQU1QTEVfQ09WRVJBR0UgPSAweDgwQTBcblxudmFyIEdMX0ZST05UID0gMTAyOFxudmFyIEdMX0JBQ0sgPSAxMDI5XG5cbnZhciBHTF9DVyA9IDB4MDkwMFxudmFyIEdMX0NDVyA9IDB4MDkwMVxuXG52YXIgR0xfTUlOX0VYVCA9IDB4ODAwN1xudmFyIEdMX01BWF9FWFQgPSAweDgwMDhcblxudmFyIGJsZW5kRnVuY3MgPSB7XG4gICcwJzogMCxcbiAgJzEnOiAxLFxuICAnemVybyc6IDAsXG4gICdvbmUnOiAxLFxuICAnc3JjIGNvbG9yJzogNzY4LFxuICAnb25lIG1pbnVzIHNyYyBjb2xvcic6IDc2OSxcbiAgJ3NyYyBhbHBoYSc6IDc3MCxcbiAgJ29uZSBtaW51cyBzcmMgYWxwaGEnOiA3NzEsXG4gICdkc3QgY29sb3InOiA3NzQsXG4gICdvbmUgbWludXMgZHN0IGNvbG9yJzogNzc1LFxuICAnZHN0IGFscGhhJzogNzcyLFxuICAnb25lIG1pbnVzIGRzdCBhbHBoYSc6IDc3MyxcbiAgJ2NvbnN0YW50IGNvbG9yJzogMzI3NjksXG4gICdvbmUgbWludXMgY29uc3RhbnQgY29sb3InOiAzMjc3MCxcbiAgJ2NvbnN0YW50IGFscGhhJzogMzI3NzEsXG4gICdvbmUgbWludXMgY29uc3RhbnQgYWxwaGEnOiAzMjc3MixcbiAgJ3NyYyBhbHBoYSBzYXR1cmF0ZSc6IDc3NlxufVxuXG52YXIgY29tcGFyZUZ1bmNzID0ge1xuICAnbmV2ZXInOiA1MTIsXG4gICdsZXNzJzogNTEzLFxuICAnPCc6IDUxMyxcbiAgJ2VxdWFsJzogNTE0LFxuICAnPSc6IDUxNCxcbiAgJz09JzogNTE0LFxuICAnPT09JzogNTE0LFxuICAnbGVxdWFsJzogNTE1LFxuICAnPD0nOiA1MTUsXG4gICdncmVhdGVyJzogNTE2LFxuICAnPic6IDUxNixcbiAgJ25vdGVxdWFsJzogNTE3LFxuICAnIT0nOiA1MTcsXG4gICchPT0nOiA1MTcsXG4gICdnZXF1YWwnOiA1MTgsXG4gICc+PSc6IDUxOCxcbiAgJ2Fsd2F5cyc6IDUxOVxufVxuXG52YXIgc3RlbmNpbE9wcyA9IHtcbiAgJzAnOiAwLFxuICAnemVybyc6IDAsXG4gICdrZWVwJzogNzY4MCxcbiAgJ3JlcGxhY2UnOiA3NjgxLFxuICAnaW5jcmVtZW50JzogNzY4MixcbiAgJ2RlY3JlbWVudCc6IDc2ODMsXG4gICdpbmNyZW1lbnQgd3JhcCc6IDM0MDU1LFxuICAnZGVjcmVtZW50IHdyYXAnOiAzNDA1NixcbiAgJ2ludmVydCc6IDUzODZcbn1cblxuZnVuY3Rpb24gdHlwZUxlbmd0aCAoeCkge1xuICBzd2l0Y2ggKHgpIHtcbiAgICBjYXNlIEdMX0ZMT0FUX1ZFQzI6XG4gICAgY2FzZSBHTF9JTlRfVkVDMjpcbiAgICBjYXNlIEdMX0JPT0xfVkVDMjpcbiAgICAgIHJldHVybiAyXG4gICAgY2FzZSBHTF9GTE9BVF9WRUMzOlxuICAgIGNhc2UgR0xfSU5UX1ZFQzM6XG4gICAgY2FzZSBHTF9CT09MX1ZFQzM6XG4gICAgICByZXR1cm4gM1xuICAgIGNhc2UgR0xfRkxPQVRfVkVDNDpcbiAgICBjYXNlIEdMX0lOVF9WRUM0OlxuICAgIGNhc2UgR0xfQk9PTF9WRUM0OlxuICAgICAgcmV0dXJuIDRcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIDFcbiAgfVxufVxuXG5mdW5jdGlvbiBzZXRVbmlmb3JtU3RyaW5nIChnbCwgdHlwZSwgbG9jYXRpb24sIHZhbHVlKSB7XG4gIHZhciBpbmZpeFxuICB2YXIgc2VwYXJhdG9yID0gJywnXG4gIHN3aXRjaCAodHlwZSkge1xuICAgIGNhc2UgR0xfRkxPQVQ6XG4gICAgICBpbmZpeCA9ICcxZidcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9GTE9BVF9WRUMyOlxuICAgICAgaW5maXggPSAnMmZ2J1xuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX0ZMT0FUX1ZFQzM6XG4gICAgICBpbmZpeCA9ICczZnYnXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfRkxPQVRfVkVDNDpcbiAgICAgIGluZml4ID0gJzRmdidcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9CT09MOlxuICAgIGNhc2UgR0xfSU5UOlxuICAgICAgaW5maXggPSAnMWknXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfQk9PTF9WRUMyOlxuICAgIGNhc2UgR0xfSU5UX1ZFQzI6XG4gICAgICBpbmZpeCA9ICcyaXYnXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfQk9PTF9WRUMzOlxuICAgIGNhc2UgR0xfSU5UX1ZFQzM6XG4gICAgICBpbmZpeCA9ICczaXYnXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfQk9PTF9WRUM0OlxuICAgIGNhc2UgR0xfSU5UX1ZFQzQ6XG4gICAgICBpbmZpeCA9ICc0aXYnXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfRkxPQVRfTUFUMjpcbiAgICAgIGluZml4ID0gJ01hdHJpeDJmdidcbiAgICAgIHNlcGFyYXRvciA9ICcsZmFsc2UsJ1xuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX0ZMT0FUX01BVDM6XG4gICAgICBpbmZpeCA9ICdNYXRyaXgzZnYnXG4gICAgICBzZXBhcmF0b3IgPSAnLGZhbHNlLCdcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9GTE9BVF9NQVQ0OlxuICAgICAgaW5maXggPSAnTWF0cml4NGZ2J1xuICAgICAgc2VwYXJhdG9yID0gJyxmYWxzZSwnXG4gICAgICBicmVha1xuICAgIGRlZmF1bHQ6XG4gICAgICBcbiAgfVxuICByZXR1cm4gZ2wgKyAnLnVuaWZvcm0nICsgaW5maXggKyAnKCcgKyBsb2NhdGlvbiArIHNlcGFyYXRvciArIHZhbHVlICsgJyk7J1xufVxuXG5mdW5jdGlvbiBzdGFja1RvcCAoeCkge1xuICByZXR1cm4geCArICdbJyArIHggKyAnLmxlbmd0aC0xXSdcbn1cblxuLy8gTmVlZCB0byBwcm9jZXNzIGZyYW1lYnVmZmVyIGZpcnN0IGluIG9wdGlvbnMgbGlzdFxuZnVuY3Rpb24gb3B0aW9uUHJpb3JpdHkgKGEsIGIpIHtcbiAgaWYgKGEgPT09ICdmcmFtZWJ1ZmZlcicpIHtcbiAgICByZXR1cm4gLTFcbiAgfVxuICBpZiAoYSA8IGIpIHtcbiAgICByZXR1cm4gLTFcbiAgfSBlbHNlIGlmIChhID4gYikge1xuICAgIHJldHVybiAxXG4gIH1cbiAgcmV0dXJuIDBcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiByZWdsQ29tcGlsZXIgKFxuICBnbCxcbiAgc3RyaW5nU3RvcmUsXG4gIGV4dGVuc2lvbnMsXG4gIGxpbWl0cyxcbiAgYnVmZmVyU3RhdGUsXG4gIGVsZW1lbnRTdGF0ZSxcbiAgdGV4dHVyZVN0YXRlLFxuICBmcmFtZWJ1ZmZlclN0YXRlLFxuICBnbFN0YXRlLFxuICB1bmlmb3JtU3RhdGUsXG4gIGF0dHJpYnV0ZVN0YXRlLFxuICBzaGFkZXJTdGF0ZSxcbiAgZHJhd1N0YXRlLFxuICBmcmFtZVN0YXRlLFxuICByZWdsUG9sbCkge1xuICB2YXIgY29udGV4dFN0YXRlID0gZ2xTdGF0ZS5jb250ZXh0U3RhdGVcblxuICB2YXIgYmxlbmRFcXVhdGlvbnMgPSB7XG4gICAgJ2FkZCc6IDMyNzc0LFxuICAgICdzdWJ0cmFjdCc6IDMyNzc4LFxuICAgICdyZXZlcnNlIHN1YnRyYWN0JzogMzI3NzlcbiAgfVxuICBpZiAoZXh0ZW5zaW9ucy5leHRfYmxlbmRfbWlubWF4KSB7XG4gICAgYmxlbmRFcXVhdGlvbnMubWluID0gR0xfTUlOX0VYVFxuICAgIGJsZW5kRXF1YXRpb25zLm1heCA9IEdMX01BWF9FWFRcbiAgfVxuXG4gIHZhciBkcmF3Q2FsbENvdW50ZXIgPSAwXG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBTSEFERVIgU0lOR0xFIERSQVcgT1BFUkFUSU9OXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgZnVuY3Rpb24gY29tcGlsZVNoYWRlckRyYXcgKHByb2dyYW0pIHtcbiAgICB2YXIgZW52ID0gY3JlYXRlRW52aXJvbm1lbnQoKVxuICAgIHZhciBsaW5rID0gZW52LmxpbmtcbiAgICB2YXIgZHJhdyA9IGVudi5wcm9jKCdkcmF3JylcbiAgICB2YXIgZGVmID0gZHJhdy5kZWZcblxuICAgIHZhciBHTCA9IGxpbmsoZ2wpXG4gICAgdmFyIFBST0dSQU0gPSBsaW5rKHByb2dyYW0ucHJvZ3JhbSlcbiAgICB2YXIgQklORF9BVFRSSUJVVEUgPSBsaW5rKGF0dHJpYnV0ZVN0YXRlLmJpbmQpXG4gICAgdmFyIERSQVdfU1RBVEUgPSB7XG4gICAgICBjb3VudDogbGluayhkcmF3U3RhdGUuY291bnQpLFxuICAgICAgb2Zmc2V0OiBsaW5rKGRyYXdTdGF0ZS5vZmZzZXQpLFxuICAgICAgaW5zdGFuY2VzOiBsaW5rKGRyYXdTdGF0ZS5pbnN0YW5jZXMpLFxuICAgICAgcHJpbWl0aXZlOiBsaW5rKGRyYXdTdGF0ZS5wcmltaXRpdmUpXG4gICAgfVxuICAgIHZhciBFTEVNRU5UX1NUQVRFID0gbGluayhlbGVtZW50U3RhdGUuZWxlbWVudHMpXG4gICAgdmFyIFRFWFRVUkVfVU5JRk9STVMgPSBbXVxuXG4gICAgLy8gYmluZCB0aGUgcHJvZ3JhbVxuICAgIGRyYXcoR0wsICcudXNlUHJvZ3JhbSgnLCBQUk9HUkFNLCAnKTsnKVxuXG4gICAgLy8gc2V0IHVwIGF0dHJpYnV0ZSBzdGF0ZVxuICAgIHByb2dyYW0uYXR0cmlidXRlcy5mb3JFYWNoKGZ1bmN0aW9uIChhdHRyaWJ1dGUpIHtcbiAgICAgIHZhciBTVEFDSyA9IGxpbmsoYXR0cmlidXRlU3RhdGUuZGVmKGF0dHJpYnV0ZS5uYW1lKSlcbiAgICAgIGRyYXcoQklORF9BVFRSSUJVVEUsICcoJyxcbiAgICAgICAgYXR0cmlidXRlLmxvY2F0aW9uLCAnLCcsXG4gICAgICAgIGxpbmsoYXR0cmlidXRlU3RhdGUuYmluZGluZ3NbYXR0cmlidXRlLmxvY2F0aW9uXSksICcsJyxcbiAgICAgICAgU1RBQ0ssICcucmVjb3Jkc1snLCBTVEFDSywgJy50b3BdJywgJywnLFxuICAgICAgICB0eXBlTGVuZ3RoKGF0dHJpYnV0ZS5pbmZvLnR5cGUpLCAnKTsnKVxuICAgIH0pXG5cbiAgICAvLyBzZXQgdXAgdW5pZm9ybXNcbiAgICBwcm9ncmFtLnVuaWZvcm1zLmZvckVhY2goZnVuY3Rpb24gKHVuaWZvcm0pIHtcbiAgICAgIHZhciBMT0NBVElPTiA9IGxpbmsodW5pZm9ybS5sb2NhdGlvbilcbiAgICAgIHZhciBTVEFDSyA9IGxpbmsodW5pZm9ybVN0YXRlLmRlZih1bmlmb3JtLm5hbWUpKVxuICAgICAgdmFyIFRPUCA9IFNUQUNLICsgJ1snICsgU1RBQ0sgKyAnLmxlbmd0aC0xXSdcbiAgICAgIHZhciB0eXBlID0gdW5pZm9ybS5pbmZvLnR5cGVcbiAgICAgIGlmICh0eXBlID09PSBHTF9TQU1QTEVSXzJEIHx8IHR5cGUgPT09IEdMX1NBTVBMRVJfQ1VCRSkge1xuICAgICAgICB2YXIgVEVYX1ZBTFVFID0gZGVmKFRPUCArICcuX3RleHR1cmUnKVxuICAgICAgICBURVhUVVJFX1VOSUZPUk1TLnB1c2goVEVYX1ZBTFVFKVxuICAgICAgICBkcmF3KHNldFVuaWZvcm1TdHJpbmcoR0wsIEdMX0lOVCwgTE9DQVRJT04sIFRFWF9WQUxVRSArICcuYmluZCgpJykpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkcmF3KHNldFVuaWZvcm1TdHJpbmcoR0wsIHR5cGUsIExPQ0FUSU9OLCBUT1ApKVxuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyB1bmJpbmQgdGV4dHVyZXMgaW1tZWRpYXRlbHlcbiAgICBURVhUVVJFX1VOSUZPUk1TLmZvckVhY2goZnVuY3Rpb24gKFRFWF9WQUxVRSkge1xuICAgICAgZHJhdyhURVhfVkFMVUUsICcudW5iaW5kKCk7JylcbiAgICB9KVxuXG4gICAgLy8gRXhlY3V0ZSBkcmF3IGNvbW1hbmRcbiAgICB2YXIgQ1VSX1BSSU1JVElWRSA9IGRlZihzdGFja1RvcChEUkFXX1NUQVRFLnByaW1pdGl2ZSkpXG4gICAgdmFyIENVUl9DT1VOVCA9IGRlZihzdGFja1RvcChEUkFXX1NUQVRFLmNvdW50KSlcbiAgICB2YXIgQ1VSX09GRlNFVCA9IGRlZihzdGFja1RvcChEUkFXX1NUQVRFLm9mZnNldCkpXG4gICAgdmFyIENVUl9FTEVNRU5UUyA9IGRlZihzdGFja1RvcChFTEVNRU5UX1NUQVRFKSlcblxuICAgIC8vIE9ubHkgZXhlY3V0ZSBkcmF3IGNvbW1hbmQgaWYgbnVtYmVyIGVsZW1lbnRzIGlzID4gMFxuICAgIGRyYXcoJ2lmKCcsIENVUl9DT1VOVCwgJyl7JylcblxuICAgIHZhciBpbnN0YW5jaW5nID0gZXh0ZW5zaW9ucy5hbmdsZV9pbnN0YW5jZWRfYXJyYXlzXG4gICAgaWYgKGluc3RhbmNpbmcpIHtcbiAgICAgIHZhciBDVVJfSU5TVEFOQ0VTID0gZGVmKHN0YWNrVG9wKERSQVdfU1RBVEUuaW5zdGFuY2VzKSlcbiAgICAgIHZhciBJTlNUQU5DRV9FWFQgPSBsaW5rKGluc3RhbmNpbmcpXG4gICAgICBkcmF3KFxuICAgICAgICAnaWYoJywgQ1VSX0VMRU1FTlRTLCAnKXsnLFxuICAgICAgICBDVVJfRUxFTUVOVFMsICcuYmluZCgpOycsXG4gICAgICAgICdpZignLCBDVVJfSU5TVEFOQ0VTLCAnPjApeycsXG4gICAgICAgIElOU1RBTkNFX0VYVCwgJy5kcmF3RWxlbWVudHNJbnN0YW5jZWRBTkdMRSgnLFxuICAgICAgICBDVVJfUFJJTUlUSVZFLCAnLCcsXG4gICAgICAgIENVUl9DT1VOVCwgJywnLFxuICAgICAgICBDVVJfRUxFTUVOVFMsICcudHlwZSwnLFxuICAgICAgICBDVVJfT0ZGU0VULCAnLCcsXG4gICAgICAgIENVUl9JTlNUQU5DRVMsICcpO31lbHNleycsXG4gICAgICAgIEdMLCAnLmRyYXdFbGVtZW50cygnLFxuICAgICAgICBDVVJfUFJJTUlUSVZFLCAnLCcsXG4gICAgICAgIENVUl9DT1VOVCwgJywnLFxuICAgICAgICBDVVJfRUxFTUVOVFMsICcudHlwZSwnLFxuICAgICAgICBDVVJfT0ZGU0VULCAnKTt9JyxcbiAgICAgICAgJ31lbHNlIGlmKCcsIENVUl9JTlNUQU5DRVMsICc+MCl7JyxcbiAgICAgICAgSU5TVEFOQ0VfRVhULCAnLmRyYXdBcnJheXNJbnN0YW5jZWRBTkdMRSgnLFxuICAgICAgICBDVVJfUFJJTUlUSVZFLCAnLCcsXG4gICAgICAgIENVUl9PRkZTRVQsICcsJyxcbiAgICAgICAgQ1VSX0NPVU5ULCAnLCcsXG4gICAgICAgIENVUl9JTlNUQU5DRVMsICcpO31lbHNleycsXG4gICAgICAgIEdMLCAnLmRyYXdBcnJheXMoJyxcbiAgICAgICAgQ1VSX1BSSU1JVElWRSwgJywnLFxuICAgICAgICBDVVJfT0ZGU0VULCAnLCcsXG4gICAgICAgIENVUl9DT1VOVCwgJyk7fX0nKVxuICAgIH0gZWxzZSB7XG4gICAgICBkcmF3KFxuICAgICAgICAnaWYoJywgQ1VSX0VMRU1FTlRTLCAnKXsnLFxuICAgICAgICBHTCwgJy5kcmF3RWxlbWVudHMoJyxcbiAgICAgICAgQ1VSX1BSSU1JVElWRSwgJywnLFxuICAgICAgICBDVVJfQ09VTlQsICcsJyxcbiAgICAgICAgQ1VSX0VMRU1FTlRTLCAnLnR5cGUsJyxcbiAgICAgICAgQ1VSX09GRlNFVCwgJyk7fScsXG4gICAgICAgICd9ZWxzZXsnLFxuICAgICAgICBHTCwgJy5kcmF3QXJyYXlzKCcsXG4gICAgICAgIENVUl9QUklNSVRJVkUsICcsJyxcbiAgICAgICAgQ1VSX09GRlNFVCwgJywnLFxuICAgICAgICBDVVJfQ09VTlQsICcpO30nKVxuICAgIH1cblxuICAgIHJldHVybiBlbnYuY29tcGlsZSgpLmRyYXdcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gQkFUQ0ggRFJBVyBPUEVSQVRJT05cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICBmdW5jdGlvbiBjb21waWxlQmF0Y2ggKFxuICAgIHByb2dyYW0sIG9wdGlvbnMsIHVuaWZvcm1zLCBhdHRyaWJ1dGVzLCBzdGF0aWNPcHRpb25zKSB7XG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGNvZGUgZ2VuZXJhdGlvbiBoZWxwZXJzXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHZhciBlbnYgPSBjcmVhdGVFbnZpcm9ubWVudCgpXG4gICAgdmFyIGxpbmsgPSBlbnYubGlua1xuICAgIHZhciBiYXRjaCA9IGVudi5wcm9jKCdiYXRjaCcpXG4gICAgdmFyIGV4aXQgPSBlbnYuYmxvY2soKVxuICAgIHZhciBkZWYgPSBiYXRjaC5kZWZcbiAgICB2YXIgYXJnID0gYmF0Y2guYXJnXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gcmVnbCBzdGF0ZVxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICB2YXIgR0wgPSBsaW5rKGdsKVxuICAgIHZhciBQUk9HUkFNID0gbGluayhwcm9ncmFtLnByb2dyYW0pXG4gICAgdmFyIEJJTkRfQVRUUklCVVRFID0gbGluayhhdHRyaWJ1dGVTdGF0ZS5iaW5kKVxuICAgIHZhciBGUkFNRV9TVEFURSA9IGxpbmsoZnJhbWVTdGF0ZSlcbiAgICB2YXIgRlJBTUVCVUZGRVJfU1RBVEUgPSBsaW5rKGZyYW1lYnVmZmVyU3RhdGUpXG4gICAgdmFyIERSQVdfU1RBVEUgPSB7XG4gICAgICBjb3VudDogbGluayhkcmF3U3RhdGUuY291bnQpLFxuICAgICAgb2Zmc2V0OiBsaW5rKGRyYXdTdGF0ZS5vZmZzZXQpLFxuICAgICAgaW5zdGFuY2VzOiBsaW5rKGRyYXdTdGF0ZS5pbnN0YW5jZXMpLFxuICAgICAgcHJpbWl0aXZlOiBsaW5rKGRyYXdTdGF0ZS5wcmltaXRpdmUpXG4gICAgfVxuICAgIHZhciBDT05URVhUX1NUQVRFID0ge31cbiAgICB2YXIgRUxFTUVOVFMgPSBsaW5rKGVsZW1lbnRTdGF0ZS5lbGVtZW50cylcbiAgICB2YXIgQ1VSX0NPVU5UID0gZGVmKHN0YWNrVG9wKERSQVdfU1RBVEUuY291bnQpKVxuICAgIHZhciBDVVJfT0ZGU0VUID0gZGVmKHN0YWNrVG9wKERSQVdfU1RBVEUub2Zmc2V0KSlcbiAgICB2YXIgQ1VSX1BSSU1JVElWRSA9IGRlZihzdGFja1RvcChEUkFXX1NUQVRFLnByaW1pdGl2ZSkpXG4gICAgdmFyIENVUl9FTEVNRU5UUyA9IGRlZihzdGFja1RvcChFTEVNRU5UUykpXG4gICAgdmFyIENVUl9JTlNUQU5DRVNcbiAgICB2YXIgSU5TVEFOQ0VfRVhUXG4gICAgdmFyIGluc3RhbmNpbmcgPSBleHRlbnNpb25zLmFuZ2xlX2luc3RhbmNlZF9hcnJheXNcbiAgICBpZiAoaW5zdGFuY2luZykge1xuICAgICAgQ1VSX0lOU1RBTkNFUyA9IGRlZihzdGFja1RvcChEUkFXX1NUQVRFLmluc3RhbmNlcykpXG4gICAgICBJTlNUQU5DRV9FWFQgPSBsaW5rKGluc3RhbmNpbmcpXG4gICAgfVxuICAgIHZhciBoYXNEeW5hbWljRWxlbWVudHMgPSAnZWxlbWVudHMnIGluIG9wdGlvbnNcblxuICAgIGZ1bmN0aW9uIGxpbmtDb250ZXh0ICh4KSB7XG4gICAgICB2YXIgcmVzdWx0ID0gQ09OVEVYVF9TVEFURVt4XVxuICAgICAgaWYgKHJlc3VsdCkge1xuICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICB9XG4gICAgICByZXN1bHQgPSBDT05URVhUX1NUQVRFW3hdID0gbGluayhjb250ZXh0U3RhdGVbeF0pXG4gICAgICByZXR1cm4gcmVzdWx0XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGJhdGNoL2FyZ3VtZW50IHZhcnNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgdmFyIE5VTV9BUkdTID0gYXJnKClcbiAgICB2YXIgQVJHUyA9IGFyZygpXG4gICAgdmFyIEFSRyA9IGRlZigpXG4gICAgdmFyIEJBVENIX0lEID0gZGVmKClcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBsb2FkIGEgZHluYW1pYyB2YXJpYWJsZVxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICB2YXIgZHluYW1pY1ZhcnMgPSB7fVxuICAgIGZ1bmN0aW9uIGR5biAoeCkge1xuICAgICAgdmFyIGlkID0geC5pZFxuICAgICAgdmFyIHJlc3VsdCA9IGR5bmFtaWNWYXJzW2lkXVxuICAgICAgaWYgKHJlc3VsdCkge1xuICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICB9XG4gICAgICBpZiAoeC5mdW5jKSB7XG4gICAgICAgIHJlc3VsdCA9IGJhdGNoLmRlZihcbiAgICAgICAgICBsaW5rKHguZGF0YSksICcoJywgQVJHLCAnLCcsIEJBVENIX0lELCAnLCcsIEZSQU1FX1NUQVRFLCAnKScpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXN1bHQgPSBiYXRjaC5kZWYoQVJHLCAnLicsIHguZGF0YSlcbiAgICAgIH1cbiAgICAgIGR5bmFtaWNWYXJzW2lkXSA9IHJlc3VsdFxuICAgICAgcmV0dXJuIHJlc3VsdFxuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyByZXRyaWV2ZXMgdGhlIGZpcnN0IG5hbWUtbWF0Y2hpbmcgcmVjb3JkIGZyb20gYW4gQWN0aXZlSW5mbyBsaXN0XG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIGZ1bmN0aW9uIGZpbmRJbmZvIChsaXN0LCBuYW1lKSB7XG4gICAgICByZXR1cm4gbGlzdC5maW5kKGZ1bmN0aW9uIChpdGVtKSB7XG4gICAgICAgIHJldHVybiBpdGVtLm5hbWUgPT09IG5hbWVcbiAgICAgIH0pXG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGJpbmQgc2hhZGVyXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIGJhdGNoKEdMLCAnLnVzZVByb2dyYW0oJywgUFJPR1JBTSwgJyk7JylcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBzZXQgc3RhdGljIHVuaWZvcm1zXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHByb2dyYW0udW5pZm9ybXMuZm9yRWFjaChmdW5jdGlvbiAodW5pZm9ybSkge1xuICAgICAgaWYgKHVuaWZvcm0ubmFtZSBpbiB1bmlmb3Jtcykge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIHZhciBMT0NBVElPTiA9IGxpbmsodW5pZm9ybS5sb2NhdGlvbilcbiAgICAgIHZhciBTVEFDSyA9IGxpbmsodW5pZm9ybVN0YXRlLmRlZih1bmlmb3JtLm5hbWUpKVxuICAgICAgdmFyIFRPUCA9IFNUQUNLICsgJ1snICsgU1RBQ0sgKyAnLmxlbmd0aC0xXSdcbiAgICAgIHZhciB0eXBlID0gdW5pZm9ybS5pbmZvLnR5cGVcbiAgICAgIGlmICh0eXBlID09PSBHTF9TQU1QTEVSXzJEIHx8IHR5cGUgPT09IEdMX1NBTVBMRVJfQ1VCRSkge1xuICAgICAgICB2YXIgVEVYX1ZBTFVFID0gZGVmKFRPUCArICcuX3RleHR1cmUnKVxuICAgICAgICBiYXRjaChzZXRVbmlmb3JtU3RyaW5nKEdMLCBHTF9JTlQsIExPQ0FUSU9OLCBURVhfVkFMVUUgKyAnLmJpbmQoKScpKVxuICAgICAgICBleGl0KFRFWF9WQUxVRSwgJy51bmJpbmQoKTsnKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYmF0Y2goc2V0VW5pZm9ybVN0cmluZyhHTCwgdHlwZSwgTE9DQVRJT04sIFRPUCkpXG4gICAgICB9XG4gICAgfSlcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBzZXQgc3RhdGljIGF0dHJpYnV0ZXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgcHJvZ3JhbS5hdHRyaWJ1dGVzLmZvckVhY2goZnVuY3Rpb24gKGF0dHJpYnV0ZSkge1xuICAgICAgaWYgKGF0dHJpYnV0ZXMubmFtZSBpbiBhdHRyaWJ1dGVzKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgdmFyIFNUQUNLID0gbGluayhhdHRyaWJ1dGVTdGF0ZS5kZWYoYXR0cmlidXRlLm5hbWUpKVxuICAgICAgYmF0Y2goQklORF9BVFRSSUJVVEUsICcoJyxcbiAgICAgICAgYXR0cmlidXRlLmxvY2F0aW9uLCAnLCcsXG4gICAgICAgIGxpbmsoYXR0cmlidXRlU3RhdGUuYmluZGluZ3NbYXR0cmlidXRlLmxvY2F0aW9uXSksICcsJyxcbiAgICAgICAgU1RBQ0ssICcucmVjb3Jkc1snLCBTVEFDSywgJy50b3BdJywgJywnLFxuICAgICAgICB0eXBlTGVuZ3RoKGF0dHJpYnV0ZS5pbmZvLnR5cGUpLCAnKTsnKVxuICAgIH0pXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gc2V0IHN0YXRpYyBlbGVtZW50IGJ1ZmZlclxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBpZiAoIWhhc0R5bmFtaWNFbGVtZW50cykge1xuICAgICAgYmF0Y2goXG4gICAgICAgICdpZignLCBDVVJfRUxFTUVOVFMsICcpeycsXG4gICAgICAgIEdMLCAnLmJpbmRCdWZmZXIoJywgR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIsICcsJywgQ1VSX0VMRU1FTlRTLCAnLmJ1ZmZlci5idWZmZXIpOycsXG4gICAgICAgICd9ZWxzZXsnLFxuICAgICAgICBHTCwgJy5iaW5kQnVmZmVyKCcsIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSLCAnLG51bGwpOycsXG4gICAgICAgICd9JylcbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gbG9vcCBvdmVyIGFsbCBhcmd1bWVudHNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgYmF0Y2goXG4gICAgICAnZm9yKCcsIEJBVENIX0lELCAnPTA7JywgQkFUQ0hfSUQsICc8JywgTlVNX0FSR1MsICc7KysnLCBCQVRDSF9JRCwgJyl7JyxcbiAgICAgIEFSRywgJz0nLCBBUkdTLCAnWycsIEJBVENIX0lELCAnXTsnKVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHNldCBkeW5hbWljIGZsYWdzXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIE9iamVjdC5rZXlzKG9wdGlvbnMpLnNvcnQob3B0aW9uUHJpb3JpdHkpLmZvckVhY2goZnVuY3Rpb24gKG9wdGlvbikge1xuICAgICAgdmFyIFZBTFVFID0gZHluKG9wdGlvbnNbb3B0aW9uXSlcblxuICAgICAgZnVuY3Rpb24gc2V0Q2FwIChmbGFnKSB7XG4gICAgICAgIGJhdGNoKFxuICAgICAgICAgICdpZignLCBWQUxVRSwgJyl7JyxcbiAgICAgICAgICBHTCwgJy5lbmFibGUoJywgZmxhZywgJyk7fWVsc2V7JyxcbiAgICAgICAgICBHTCwgJy5kaXNhYmxlKCcsIGZsYWcsICcpO30nKVxuICAgICAgfVxuXG4gICAgICBzd2l0Y2ggKG9wdGlvbikge1xuICAgICAgICBjYXNlICdmcmFtZWJ1ZmZlcic6XG4gICAgICAgICAgdmFyIFZJRVdQT1JUX1NUQVRFID0gbGlua0NvbnRleHQoJ3ZpZXdwb3J0JylcbiAgICAgICAgICB2YXIgU0NJU1NPUl9TVEFURSA9IGxpbmtDb250ZXh0KCdzY2lzc29yLmJveCcpXG4gICAgICAgICAgYmF0Y2goXG4gICAgICAgICAgICAnaWYoJywgRlJBTUVCVUZGRVJfU1RBVEUsICcucHVzaCgnLFxuICAgICAgICAgICAgVkFMVUUsICcmJicsIFZBTFVFLCAnLl9mcmFtZWJ1ZmZlcikpeycsXG4gICAgICAgICAgICBGUkFNRUJVRkZFUl9TVEFURSwgJy5wb2xsKCk7JyxcbiAgICAgICAgICAgIFZJRVdQT1JUX1NUQVRFLCAnLnNldERpcnR5KCk7JyxcbiAgICAgICAgICAgIFNDSVNTT1JfU1RBVEUsICcuc2V0RGlydHkoKTsnLFxuICAgICAgICAgICAgJ30nKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgLy8gQ2Fwc1xuICAgICAgICBjYXNlICdjdWxsLmVuYWJsZSc6XG4gICAgICAgICAgc2V0Q2FwKEdMX0NVTExfRkFDRSlcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlICdibGVuZC5lbmFibGUnOlxuICAgICAgICAgIHNldENhcChHTF9CTEVORClcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlICdkaXRoZXInOlxuICAgICAgICAgIHNldENhcChHTF9ESVRIRVIpXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSAnc3RlbmNpbC5lbmFibGUnOlxuICAgICAgICAgIHNldENhcChHTF9TVEVOQ0lMX1RFU1QpXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSAnZGVwdGguZW5hYmxlJzpcbiAgICAgICAgICBzZXRDYXAoR0xfREVQVEhfVEVTVClcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlICdzY2lzc29yLmVuYWJsZSc6XG4gICAgICAgICAgc2V0Q2FwKEdMX1NDSVNTT1JfVEVTVClcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlICdwb2x5Z29uT2Zmc2V0LmVuYWJsZSc6XG4gICAgICAgICAgc2V0Q2FwKEdMX1BPTFlHT05fT0ZGU0VUX0ZJTEwpXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSAnc2FtcGxlLmFscGhhJzpcbiAgICAgICAgICBzZXRDYXAoR0xfU0FNUExFX0FMUEhBX1RPX0NPVkVSQUdFKVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgJ3NhbXBsZS5lbmFibGUnOlxuICAgICAgICAgIHNldENhcChHTF9TQU1QTEVfQ09WRVJBR0UpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdkZXB0aC5tYXNrJzpcbiAgICAgICAgICBiYXRjaChHTCwgJy5kZXB0aE1hc2soJywgVkFMVUUsICcpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdkZXB0aC5mdW5jJzpcbiAgICAgICAgICB2YXIgREVQVEhfRlVOQ1MgPSBsaW5rKGNvbXBhcmVGdW5jcylcbiAgICAgICAgICBiYXRjaChHTCwgJy5kZXB0aEZ1bmMoJywgREVQVEhfRlVOQ1MsICdbJywgVkFMVUUsICddKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnZGVwdGgucmFuZ2UnOlxuICAgICAgICAgIGJhdGNoKEdMLCAnLmRlcHRoUmFuZ2UoJywgVkFMVUUsICdbMF0sJywgVkFMVUUsICdbMV0pOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdibGVuZC5jb2xvcic6XG4gICAgICAgICAgYmF0Y2goR0wsICcuYmxlbmRDb2xvcignLFxuICAgICAgICAgICAgVkFMVUUsICdbMF0sJyxcbiAgICAgICAgICAgIFZBTFVFLCAnWzFdLCcsXG4gICAgICAgICAgICBWQUxVRSwgJ1syXSwnLFxuICAgICAgICAgICAgVkFMVUUsICdbM10pOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdibGVuZC5lcXVhdGlvbic6XG4gICAgICAgICAgdmFyIEJMRU5EX0VRVUFUSU9OUyA9IGxpbmsoYmxlbmRFcXVhdGlvbnMpXG4gICAgICAgICAgYmF0Y2goXG4gICAgICAgICAgICAnaWYodHlwZW9mICcsIFZBTFVFLCAnPT09XCJzdHJpbmdcIil7JyxcbiAgICAgICAgICAgIEdMLCAnLmJsZW5kRXF1YXRpb24oJywgQkxFTkRfRVFVQVRJT05TLCAnWycsIFZBTFVFLCAnXSk7JyxcbiAgICAgICAgICAgICd9ZWxzZXsnLFxuICAgICAgICAgICAgR0wsICcuYmxlbmRFcXVhdGlvblNlcGFyYXRlKCcsXG4gICAgICAgICAgICBCTEVORF9FUVVBVElPTlMsICdbJywgVkFMVUUsICcucmdiXSwnLFxuICAgICAgICAgICAgQkxFTkRfRVFVQVRJT05TLCAnWycsIFZBTFVFLCAnLmFscGhhXSk7JyxcbiAgICAgICAgICAgICd9JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2JsZW5kLmZ1bmMnOlxuICAgICAgICAgIHZhciBCTEVORF9GVU5DUyA9IGxpbmsoYmxlbmRGdW5jcylcbiAgICAgICAgICBiYXRjaChcbiAgICAgICAgICAgIEdMLCAnLmJsZW5kRnVuY1NlcGFyYXRlKCcsXG4gICAgICAgICAgICBCTEVORF9GVU5DUyxcbiAgICAgICAgICAgICdbXCJzcmNSR0JcIiBpbiAnLCBWQUxVRSwgJz8nLCBWQUxVRSwgJy5zcmNSR0I6JywgVkFMVUUsICcuc3JjXSwnLFxuICAgICAgICAgICAgQkxFTkRfRlVOQ1MsXG4gICAgICAgICAgICAnW1wiZHN0UkdCXCIgaW4gJywgVkFMVUUsICc/JywgVkFMVUUsICcuZHN0UkdCOicsIFZBTFVFLCAnLmRzdF0sJyxcbiAgICAgICAgICAgIEJMRU5EX0ZVTkNTLFxuICAgICAgICAgICAgJ1tcInNyY0FscGhhXCIgaW4gJywgVkFMVUUsICc/JywgVkFMVUUsICcuc3JjQWxwaGE6JywgVkFMVUUsICcuc3JjXSwnLFxuICAgICAgICAgICAgQkxFTkRfRlVOQ1MsXG4gICAgICAgICAgICAnW1wiZHN0QWxwaGFcIiBpbiAnLCBWQUxVRSwgJz8nLCBWQUxVRSwgJy5kc3RBbHBoYTonLCBWQUxVRSwgJy5kc3RdKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnc3RlbmNpbC5tYXNrJzpcbiAgICAgICAgICBiYXRjaChHTCwgJy5zdGVuY2lsTWFzaygnLCBWQUxVRSwgJyk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3N0ZW5jaWwuZnVuYyc6XG4gICAgICAgICAgdmFyIFNURU5DSUxfRlVOQ1MgPSBsaW5rKGNvbXBhcmVGdW5jcylcbiAgICAgICAgICBiYXRjaChHTCwgJy5zdGVuY2lsRnVuYygnLFxuICAgICAgICAgICAgU1RFTkNJTF9GVU5DUywgJ1snLCBWQUxVRSwgJy5jbXB8fFwiYWx3YXlzXCJdLCcsXG4gICAgICAgICAgICBWQUxVRSwgJy5yZWZ8MCwnLFxuICAgICAgICAgICAgJ1wibWFza1wiIGluICcsIFZBTFVFLCAnPycsIFZBTFVFLCAnLm1hc2s6LTEpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdzdGVuY2lsLm9wRnJvbnQnOlxuICAgICAgICBjYXNlICdzdGVuY2lsLm9wQmFjayc6XG4gICAgICAgICAgdmFyIFNURU5DSUxfT1BTID0gbGluayhzdGVuY2lsT3BzKVxuICAgICAgICAgIGJhdGNoKEdMLCAnLnN0ZW5jaWxPcFNlcGFyYXRlKCcsXG4gICAgICAgICAgICBvcHRpb24gPT09ICdzdGVuY2lsLm9wRnJvbnQnID8gR0xfRlJPTlQgOiBHTF9CQUNLLCAnLCcsXG4gICAgICAgICAgICBTVEVOQ0lMX09QUywgJ1snLCBWQUxVRSwgJy5mYWlsfHxcImtlZXBcIl0sJyxcbiAgICAgICAgICAgIFNURU5DSUxfT1BTLCAnWycsIFZBTFVFLCAnLnpmYWlsfHxcImtlZXBcIl0sJyxcbiAgICAgICAgICAgIFNURU5DSUxfT1BTLCAnWycsIFZBTFVFLCAnLnBhc3N8fFwia2VlcFwiXSk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3BvbHlnb25PZmZzZXQub2Zmc2V0JzpcbiAgICAgICAgICBiYXRjaChHTCwgJy5wb2x5Z29uT2Zmc2V0KCcsXG4gICAgICAgICAgICBWQUxVRSwgJy5mYWN0b3J8fDAsJyxcbiAgICAgICAgICAgIFZBTFVFLCAnLnVuaXRzfHwwKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnY3VsbC5mYWNlJzpcbiAgICAgICAgICBiYXRjaChHTCwgJy5jdWxsRmFjZSgnLFxuICAgICAgICAgICAgVkFMVUUsICc9PT1cImZyb250XCI/JywgR0xfRlJPTlQsICc6JywgR0xfQkFDSywgJyk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2xpbmVXaWR0aCc6XG4gICAgICAgICAgYmF0Y2goR0wsICcubGluZVdpZHRoKCcsIFZBTFVFLCAnKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnZnJvbnRGYWNlJzpcbiAgICAgICAgICBiYXRjaChHTCwgJy5mcm9udEZhY2UoJyxcbiAgICAgICAgICAgIFZBTFVFLCAnPT09XCJjd1wiPycsIEdMX0NXLCAnOicsIEdMX0NDVywgJyk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2NvbG9yTWFzayc6XG4gICAgICAgICAgYmF0Y2goR0wsICcuY29sb3JNYXNrKCcsXG4gICAgICAgICAgICBWQUxVRSwgJ1swXSwnLFxuICAgICAgICAgICAgVkFMVUUsICdbMV0sJyxcbiAgICAgICAgICAgIFZBTFVFLCAnWzJdLCcsXG4gICAgICAgICAgICBWQUxVRSwgJ1szXSk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3NhbXBsZS5jb3ZlcmFnZSc6XG4gICAgICAgICAgYmF0Y2goR0wsICcuc2FtcGxlQ292ZXJhZ2UoJyxcbiAgICAgICAgICAgIFZBTFVFLCAnLnZhbHVlLCcsXG4gICAgICAgICAgICBWQUxVRSwgJy5pbnZlcnQpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdzY2lzc29yLmJveCc6XG4gICAgICAgIGNhc2UgJ3ZpZXdwb3J0JzpcbiAgICAgICAgICB2YXIgQk9YX1NUQVRFID0gbGlua0NvbnRleHQob3B0aW9uKVxuICAgICAgICAgIGJhdGNoKEJPWF9TVEFURSwgJy5wdXNoKCcsXG4gICAgICAgICAgICBWQUxVRSwgJy54fHwwLCcsXG4gICAgICAgICAgICBWQUxVRSwgJy55fHwwLCcsXG4gICAgICAgICAgICBWQUxVRSwgJy53fHwtMSwnLFxuICAgICAgICAgICAgVkFMVUUsICcuaHx8LTEpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdwcmltaXRpdmVzJzpcbiAgICAgICAgY2FzZSAnb2Zmc2V0JzpcbiAgICAgICAgY2FzZSAnY291bnQnOlxuICAgICAgICBjYXNlICdlbGVtZW50cyc6XG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIFxuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyB1cGRhdGUgdmlld3BvcnQvc2Npc3NvciBib3ggc3RhdGUgYW5kIHJlc3RvcmUgZnJhbWVidWZmZXJcbiAgICBpZiAoJ3ZpZXdwb3J0JyBpbiBvcHRpb25zIHx8ICdmcmFtZWJ1ZmZlcicgaW4gb3B0aW9ucykge1xuICAgICAgYmF0Y2gobGlua0NvbnRleHQoJ3ZpZXdwb3J0JyksICcucG9sbCgpOycpXG4gICAgfVxuICAgIGlmICgnc2Npc3Nvci5ib3gnIGluIG9wdGlvbnMgfHwgJ2ZyYW1lYnVmZmVyJyBpbiBvcHRpb25zKSB7XG4gICAgICBiYXRjaChsaW5rQ29udGV4dCgnc2Npc3Nvci5ib3gnKSwgJy5wb2xsKCk7JylcbiAgICB9XG4gICAgaWYgKCdmcmFtZWJ1ZmZlcicgaW4gb3B0aW9ucykge1xuICAgICAgYmF0Y2goRlJBTUVCVUZGRVJfU1RBVEUsICcucG9wKCk7JylcbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gc2V0IGR5bmFtaWMgdW5pZm9ybXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgdmFyIHByb2dyYW1Vbmlmb3JtcyA9IHByb2dyYW0udW5pZm9ybXNcbiAgICB2YXIgRFlOQU1JQ19URVhUVVJFUyA9IFtdXG4gICAgT2JqZWN0LmtleXModW5pZm9ybXMpLmZvckVhY2goZnVuY3Rpb24gKHVuaWZvcm0pIHtcbiAgICAgIHZhciBkYXRhID0gZmluZEluZm8ocHJvZ3JhbVVuaWZvcm1zLCB1bmlmb3JtKVxuICAgICAgaWYgKCFkYXRhKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgdmFyIFRZUEUgPSBkYXRhLmluZm8udHlwZVxuICAgICAgdmFyIExPQ0FUSU9OID0gbGluayhkYXRhLmxvY2F0aW9uKVxuICAgICAgdmFyIFZBTFVFID0gZHluKHVuaWZvcm1zW3VuaWZvcm1dKVxuICAgICAgaWYgKGRhdGEuaW5mby50eXBlID09PSBHTF9TQU1QTEVSXzJEIHx8XG4gICAgICAgICAgZGF0YS5pbmZvLnR5cGUgPT09IEdMX1NBTVBMRVJfQ1VCRSkge1xuICAgICAgICB2YXIgVEVYX1ZBTFVFID0gZGVmKFZBTFVFICsgJy5fdGV4dHVyZScpXG4gICAgICAgIERZTkFNSUNfVEVYVFVSRVMucHVzaChURVhfVkFMVUUpXG4gICAgICAgIGJhdGNoKHNldFVuaWZvcm1TdHJpbmcoR0wsIEdMX0lOVCwgTE9DQVRJT04sIFRFWF9WQUxVRSArICcuYmluZCgpJykpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBiYXRjaChzZXRVbmlmb3JtU3RyaW5nKEdMLCBUWVBFLCBMT0NBVElPTiwgVkFMVUUpKVxuICAgICAgfVxuICAgIH0pXG4gICAgRFlOQU1JQ19URVhUVVJFUy5mb3JFYWNoKGZ1bmN0aW9uIChWQUxVRSkge1xuICAgICAgYmF0Y2goVkFMVUUsICcudW5iaW5kKCk7JylcbiAgICB9KVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHNldCBkeW5hbWljIGF0dHJpYnV0ZXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgdmFyIHByb2dyYW1BdHRyaWJ1dGVzID0gcHJvZ3JhbS5hdHRyaWJ1dGVzXG4gICAgT2JqZWN0LmtleXMoYXR0cmlidXRlcykuZm9yRWFjaChmdW5jdGlvbiAoYXR0cmlidXRlKSB7XG4gICAgICB2YXIgZGF0YSA9IGZpbmRJbmZvKHByb2dyYW1BdHRyaWJ1dGVzLCBhdHRyaWJ1dGUpXG4gICAgICBpZiAoIWRhdGEpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICBiYXRjaChCSU5EX0FUVFJJQlVURSwgJygnLFxuICAgICAgICBkYXRhLmxvY2F0aW9uLCAnLCcsXG4gICAgICAgIGxpbmsoYXR0cmlidXRlLmJpbmRpbmdzW2RhdGEubG9jYXRpb25dKSwgJywnLFxuICAgICAgICBkeW4oYXR0cmlidXRlc1thdHRyaWJ1dGVdKSwgJywnLFxuICAgICAgICB0eXBlTGVuZ3RoKGRhdGEuaW5mby50eXBlKSwgJyk7JylcbiAgICB9KVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHNldCBkeW5hbWljIGF0dHJpYnV0ZXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICBpZiAob3B0aW9ucy5jb3VudCkge1xuICAgICAgYmF0Y2goQ1VSX0NPVU5ULCAnPScsIGR5bihvcHRpb25zLmNvdW50KSwgJzsnKVxuICAgIH0gZWxzZSBpZiAoIXVzZUVsZW1lbnRPcHRpb24oJ2NvdW50JykpIHtcbiAgICAgIGJhdGNoKCdpZignLCBDVVJfQ09VTlQsICcpeycpXG4gICAgfVxuICAgIGlmIChvcHRpb25zLm9mZnNldCkge1xuICAgICAgYmF0Y2goQ1VSX09GRlNFVCwgJz0nLCBkeW4ob3B0aW9ucy5vZmZzZXQpLCAnOycpXG4gICAgfVxuICAgIGlmIChvcHRpb25zLnByaW1pdGl2ZSkge1xuICAgICAgdmFyIFBSSU1fVFlQRVMgPSBsaW5rKHByaW1UeXBlcylcbiAgICAgIGJhdGNoKENVUl9QUklNSVRJVkUsICc9JywgUFJJTV9UWVBFUywgJ1snLCBkeW4ob3B0aW9ucy5wcmltaXRpdmUpLCAnXTsnKVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHVzZUVsZW1lbnRPcHRpb24gKHgpIHtcbiAgICAgIHJldHVybiBoYXNEeW5hbWljRWxlbWVudHMgJiYgISh4IGluIG9wdGlvbnMgfHwgeCBpbiBzdGF0aWNPcHRpb25zKVxuICAgIH1cbiAgICBpZiAoaGFzRHluYW1pY0VsZW1lbnRzKSB7XG4gICAgICB2YXIgZHluRWxlbWVudHMgPSBkeW4ob3B0aW9ucy5lbGVtZW50cylcbiAgICAgIGJhdGNoKENVUl9FTEVNRU5UUywgJz0nLFxuICAgICAgICBkeW5FbGVtZW50cywgJz8nLCBkeW5FbGVtZW50cywgJy5fZWxlbWVudHM6bnVsbDsnKVxuICAgIH1cbiAgICBpZiAodXNlRWxlbWVudE9wdGlvbignb2Zmc2V0JykpIHtcbiAgICAgIGJhdGNoKENVUl9PRkZTRVQsICc9MDsnKVxuICAgIH1cblxuICAgIC8vIEVtaXQgZHJhdyBjb21tYW5kXG4gICAgYmF0Y2goJ2lmKCcsIENVUl9FTEVNRU5UUywgJyl7JylcbiAgICBpZiAodXNlRWxlbWVudE9wdGlvbignY291bnQnKSkge1xuICAgICAgYmF0Y2goQ1VSX0NPVU5ULCAnPScsIENVUl9FTEVNRU5UUywgJy52ZXJ0Q291bnQ7JyxcbiAgICAgICAgJ2lmKCcsIENVUl9DT1VOVCwgJz4wKXsnKVxuICAgIH1cbiAgICBpZiAodXNlRWxlbWVudE9wdGlvbigncHJpbWl0aXZlJykpIHtcbiAgICAgIGJhdGNoKENVUl9QUklNSVRJVkUsICc9JywgQ1VSX0VMRU1FTlRTLCAnLnByaW1UeXBlOycpXG4gICAgfVxuICAgIGlmIChoYXNEeW5hbWljRWxlbWVudHMpIHtcbiAgICAgIGJhdGNoKFxuICAgICAgICBHTCxcbiAgICAgICAgJy5iaW5kQnVmZmVyKCcsXG4gICAgICAgIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSLCAnLCcsXG4gICAgICAgIENVUl9FTEVNRU5UUywgJy5idWZmZXIuYnVmZmVyKTsnKVxuICAgIH1cbiAgICBpZiAoaW5zdGFuY2luZykge1xuICAgICAgaWYgKG9wdGlvbnMuaW5zdGFuY2VzKSB7XG4gICAgICAgIGJhdGNoKENVUl9JTlNUQU5DRVMsICc9JywgZHluKG9wdGlvbnMuaW5zdGFuY2VzKSwgJzsnKVxuICAgICAgfVxuICAgICAgYmF0Y2goXG4gICAgICAgICdpZignLCBDVVJfSU5TVEFOQ0VTLCAnPjApeycsXG4gICAgICAgIElOU1RBTkNFX0VYVCwgJy5kcmF3RWxlbWVudHNJbnN0YW5jZWRBTkdMRSgnLFxuICAgICAgICBDVVJfUFJJTUlUSVZFLCAnLCcsXG4gICAgICAgIENVUl9DT1VOVCwgJywnLFxuICAgICAgICBDVVJfRUxFTUVOVFMsICcudHlwZSwnLFxuICAgICAgICBDVVJfT0ZGU0VULCAnLCcsXG4gICAgICAgIENVUl9JTlNUQU5DRVMsICcpO31lbHNleycpXG4gICAgfVxuICAgIGJhdGNoKFxuICAgICAgR0wsICcuZHJhd0VsZW1lbnRzKCcsXG4gICAgICBDVVJfUFJJTUlUSVZFLCAnLCcsXG4gICAgICBDVVJfQ09VTlQsICcsJyxcbiAgICAgIENVUl9FTEVNRU5UUywgJy50eXBlLCcsXG4gICAgICBDVVJfT0ZGU0VULCAnKTsnKVxuICAgIGlmIChpbnN0YW5jaW5nKSB7XG4gICAgICBiYXRjaCgnfScpXG4gICAgfVxuICAgIGlmICh1c2VFbGVtZW50T3B0aW9uKCdjb3VudCcpKSB7XG4gICAgICBiYXRjaCgnfScpXG4gICAgfVxuICAgIGJhdGNoKCd9ZWxzZXsnKVxuICAgIGlmICghdXNlRWxlbWVudE9wdGlvbignY291bnQnKSkge1xuICAgICAgaWYgKHVzZUVsZW1lbnRPcHRpb24oJ3ByaW1pdGl2ZScpKSB7XG4gICAgICAgIGJhdGNoKENVUl9QUklNSVRJVkUsICc9JywgR0xfVFJJQU5HTEVTLCAnOycpXG4gICAgICB9XG4gICAgICBpZiAoaW5zdGFuY2luZykge1xuICAgICAgICBiYXRjaChcbiAgICAgICAgICAnaWYoJywgQ1VSX0lOU1RBTkNFUywgJz4wKXsnLFxuICAgICAgICAgIElOU1RBTkNFX0VYVCwgJy5kcmF3QXJyYXlzSW5zdGFuY2VkQU5HTEUoJyxcbiAgICAgICAgICBDVVJfUFJJTUlUSVZFLCAnLCcsXG4gICAgICAgICAgQ1VSX09GRlNFVCwgJywnLFxuICAgICAgICAgIENVUl9DT1VOVCwgJywnLFxuICAgICAgICAgIENVUl9JTlNUQU5DRVMsICcpO31lbHNleycpXG4gICAgICB9XG4gICAgICBiYXRjaChcbiAgICAgICAgR0wsICcuZHJhd0FycmF5cygnLFxuICAgICAgICBDVVJfUFJJTUlUSVZFLCAnLCcsXG4gICAgICAgIENVUl9PRkZTRVQsICcsJyxcbiAgICAgICAgQ1VSX0NPVU5ULCAnKTt9JylcbiAgICAgIGlmIChpbnN0YW5jaW5nKSB7XG4gICAgICAgIGJhdGNoKCd9JylcbiAgICAgIH1cbiAgICB9XG4gICAgYmF0Y2goJ319JywgZXhpdClcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBjb21waWxlIGFuZCByZXR1cm5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgcmV0dXJuIGVudi5jb21waWxlKCkuYmF0Y2hcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gTUFJTiBEUkFXIENPTU1BTkRcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICBmdW5jdGlvbiBjb21waWxlQ29tbWFuZCAoXG4gICAgc3RhdGljT3B0aW9ucywgc3RhdGljVW5pZm9ybXMsIHN0YXRpY0F0dHJpYnV0ZXMsXG4gICAgZHluYW1pY09wdGlvbnMsIGR5bmFtaWNVbmlmb3JtcywgZHluYW1pY0F0dHJpYnV0ZXMsXG4gICAgaGFzRHluYW1pYykge1xuICAgIC8vIENyZWF0ZSBjb2RlIGdlbmVyYXRpb24gZW52aXJvbm1lbnRcbiAgICB2YXIgZW52ID0gY3JlYXRlRW52aXJvbm1lbnQoKVxuICAgIHZhciBsaW5rID0gZW52LmxpbmtcbiAgICB2YXIgYmxvY2sgPSBlbnYuYmxvY2tcbiAgICB2YXIgcHJvYyA9IGVudi5wcm9jXG5cbiAgICB2YXIgY2FsbElkID0gZHJhd0NhbGxDb3VudGVyKytcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBDb21tb24gc3RhdGUgdmFyaWFibGVzXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHZhciBHTF9QT0xMID0gbGluayhyZWdsUG9sbClcbiAgICB2YXIgU1RSSU5HX1NUT1JFID0gbGluayhzdHJpbmdTdG9yZSlcbiAgICB2YXIgRlJBR19TSEFERVJfU1RBVEUgPSBsaW5rKHNoYWRlclN0YXRlLmZyYWdTaGFkZXJzKVxuICAgIHZhciBWRVJUX1NIQURFUl9TVEFURSA9IGxpbmsoc2hhZGVyU3RhdGUudmVydFNoYWRlcnMpXG4gICAgdmFyIFBST0dSQU1fU1RBVEUgPSBsaW5rKHNoYWRlclN0YXRlLnByb2dyYW1zKVxuICAgIHZhciBGUkFNRUJVRkZFUl9TVEFURSA9IGxpbmsoZnJhbWVidWZmZXJTdGF0ZSlcbiAgICB2YXIgRFJBV19TVEFURSA9IHtcbiAgICAgIGNvdW50OiBsaW5rKGRyYXdTdGF0ZS5jb3VudCksXG4gICAgICBvZmZzZXQ6IGxpbmsoZHJhd1N0YXRlLm9mZnNldCksXG4gICAgICBpbnN0YW5jZXM6IGxpbmsoZHJhd1N0YXRlLmluc3RhbmNlcyksXG4gICAgICBwcmltaXRpdmU6IGxpbmsoZHJhd1N0YXRlLnByaW1pdGl2ZSlcbiAgICB9XG4gICAgdmFyIEVMRU1FTlRfU1RBVEUgPSBsaW5rKGVsZW1lbnRTdGF0ZS5lbGVtZW50cylcbiAgICB2YXIgUFJJTV9UWVBFUyA9IGxpbmsocHJpbVR5cGVzKVxuICAgIHZhciBDT01QQVJFX0ZVTkNTID0gbGluayhjb21wYXJlRnVuY3MpXG4gICAgdmFyIFNURU5DSUxfT1BTID0gbGluayhzdGVuY2lsT3BzKVxuXG4gICAgdmFyIENPTlRFWFRfU1RBVEUgPSB7fVxuICAgIGZ1bmN0aW9uIGxpbmtDb250ZXh0ICh4KSB7XG4gICAgICB2YXIgcmVzdWx0ID0gQ09OVEVYVF9TVEFURVt4XVxuICAgICAgaWYgKHJlc3VsdCkge1xuICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICB9XG4gICAgICByZXN1bHQgPSBDT05URVhUX1NUQVRFW3hdID0gbGluayhjb250ZXh0U3RhdGVbeF0pXG4gICAgICByZXR1cm4gcmVzdWx0XG4gICAgfVxuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIFNUQVRJQyBTVEFURVxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBDb2RlIGJsb2NrcyBmb3IgdGhlIHN0YXRpYyBzZWN0aW9uc1xuICAgIHZhciBlbnRyeSA9IGJsb2NrKClcbiAgICB2YXIgZXhpdCA9IGJsb2NrKClcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyB1cGRhdGUgZGVmYXVsdCBjb250ZXh0IHN0YXRlIHZhcmlhYmxlc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBmdW5jdGlvbiBoYW5kbGVTdGF0aWNPcHRpb24gKHBhcmFtLCB2YWx1ZSkge1xuICAgICAgdmFyIFNUQVRFX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICBlbnRyeShTVEFURV9TVEFDSywgJy5wdXNoKCcsIHZhbHVlLCAnKTsnKVxuICAgICAgZXhpdChTVEFURV9TVEFDSywgJy5wb3AoKTsnKVxuICAgIH1cblxuICAgIHZhciBoYXNTaGFkZXIgPSBmYWxzZVxuICAgIE9iamVjdC5rZXlzKHN0YXRpY09wdGlvbnMpLnNvcnQob3B0aW9uUHJpb3JpdHkpLmZvckVhY2goZnVuY3Rpb24gKHBhcmFtKSB7XG4gICAgICB2YXIgdmFsdWUgPSBzdGF0aWNPcHRpb25zW3BhcmFtXVxuICAgICAgc3dpdGNoIChwYXJhbSkge1xuICAgICAgICBjYXNlICdmcmFnJzpcbiAgICAgICAgICBoYXNTaGFkZXIgPSB0cnVlXG4gICAgICAgICAgZW50cnkoRlJBR19TSEFERVJfU1RBVEUsICcucHVzaCgnLCBsaW5rKHN0cmluZ1N0b3JlLmlkKHZhbHVlKSksICcpOycpXG4gICAgICAgICAgZXhpdChGUkFHX1NIQURFUl9TVEFURSwgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAndmVydCc6XG4gICAgICAgICAgaGFzU2hhZGVyID0gdHJ1ZVxuICAgICAgICAgIGVudHJ5KFZFUlRfU0hBREVSX1NUQVRFLCAnLnB1c2goJywgbGluayhzdHJpbmdTdG9yZS5pZCh2YWx1ZSkpLCAnKTsnKVxuICAgICAgICAgIGV4aXQoVkVSVF9TSEFERVJfU1RBVEUsICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2ZyYW1lYnVmZmVyJzpcbiAgICAgICAgICB2YXIgZmJvID0gZnJhbWVidWZmZXJTdGF0ZS5nZXRGcmFtZWJ1ZmZlcih2YWx1ZSlcbiAgICAgICAgICBcbiAgICAgICAgICB2YXIgVklFV1BPUlRfU1RBVEUgPSBsaW5rQ29udGV4dCgndmlld3BvcnQnKVxuICAgICAgICAgIHZhciBTQ0lTU09SX1NUQVRFID0gbGlua0NvbnRleHQoJ3NjaXNzb3IuYm94JylcbiAgICAgICAgICBlbnRyeSgnaWYoJywgRlJBTUVCVUZGRVJfU1RBVEUsICcucHVzaCgnLCBsaW5rKFxuICAgICAgICAgICAgdmFsdWUgJiYgdmFsdWUuX2ZyYW1lYnVmZmVyKSwgJykpeycsXG4gICAgICAgICAgICBWSUVXUE9SVF9TVEFURSwgJy5zZXREaXJ0eSgpOycsXG4gICAgICAgICAgICBTQ0lTU09SX1NUQVRFLCAnLnNldERpcnR5KCk7JyxcbiAgICAgICAgICAgICd9JylcbiAgICAgICAgICBleGl0KCdpZignLCBGUkFNRUJVRkZFUl9TVEFURSwgJy5wb3AoKSl7JyxcbiAgICAgICAgICAgIFZJRVdQT1JUX1NUQVRFLCAnLnNldERpcnR5KCk7JyxcbiAgICAgICAgICAgIFNDSVNTT1JfU1RBVEUsICcuc2V0RGlydHkoKTsnLFxuICAgICAgICAgICAgJ30nKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgLy8gVXBkYXRlIGRyYXcgc3RhdGVcbiAgICAgICAgY2FzZSAnY291bnQnOlxuICAgICAgICBjYXNlICdvZmZzZXQnOlxuICAgICAgICBjYXNlICdpbnN0YW5jZXMnOlxuICAgICAgICAgIFxuICAgICAgICAgIGVudHJ5KERSQVdfU1RBVEVbcGFyYW1dLCAnLnB1c2goJywgdmFsdWUsICcpOycpXG4gICAgICAgICAgZXhpdChEUkFXX1NUQVRFW3BhcmFtXSwgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgLy8gVXBkYXRlIHByaW1pdGl2ZSB0eXBlXG4gICAgICAgIGNhc2UgJ3ByaW1pdGl2ZSc6XG4gICAgICAgICAgXG4gICAgICAgICAgdmFyIHByaW1UeXBlID0gcHJpbVR5cGVzW3ZhbHVlXVxuICAgICAgICAgIGVudHJ5KERSQVdfU1RBVEUucHJpbWl0aXZlLCAnLnB1c2goJywgcHJpbVR5cGUsICcpOycpXG4gICAgICAgICAgZXhpdChEUkFXX1NUQVRFLnByaW1pdGl2ZSwgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgLy8gVXBkYXRlIGVsZW1lbnQgYnVmZmVyXG4gICAgICAgIGNhc2UgJ2VsZW1lbnRzJzpcbiAgICAgICAgICB2YXIgZWxlbWVudHMgPSBlbGVtZW50U3RhdGUuZ2V0RWxlbWVudHModmFsdWUpXG4gICAgICAgICAgdmFyIGhhc1ByaW1pdGl2ZSA9ICEoJ3ByaW1pdGl2ZScgaW4gc3RhdGljT3B0aW9ucylcbiAgICAgICAgICB2YXIgaGFzQ291bnQgPSAhKCdjb3VudCcgaW4gc3RhdGljT3B0aW9ucylcbiAgICAgICAgICBpZiAoZWxlbWVudHMpIHtcbiAgICAgICAgICAgIHZhciBFTEVNRU5UUyA9IGxpbmsoZWxlbWVudHMpXG4gICAgICAgICAgICBlbnRyeShFTEVNRU5UX1NUQVRFLCAnLnB1c2goJywgRUxFTUVOVFMsICcpOycpXG4gICAgICAgICAgICBpZiAoaGFzUHJpbWl0aXZlKSB7XG4gICAgICAgICAgICAgIGVudHJ5KERSQVdfU1RBVEUucHJpbWl0aXZlLCAnLnB1c2goJywgRUxFTUVOVFMsICcucHJpbVR5cGUpOycpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaGFzQ291bnQpIHtcbiAgICAgICAgICAgICAgZW50cnkoRFJBV19TVEFURS5jb3VudCwgJy5wdXNoKCcsIEVMRU1FTlRTLCAnLnZlcnRDb3VudCk7JylcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZW50cnkoRUxFTUVOVF9TVEFURSwgJy5wdXNoKG51bGwpOycpXG4gICAgICAgICAgICBpZiAoaGFzUHJpbWl0aXZlKSB7XG4gICAgICAgICAgICAgIGVudHJ5KERSQVdfU1RBVEUucHJpbWl0aXZlLCAnLnB1c2goJywgR0xfVFJJQU5HTEVTLCAnKTsnKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGhhc0NvdW50KSB7XG4gICAgICAgICAgICAgIGVudHJ5KERSQVdfU1RBVEUuY291bnQsICcucHVzaCgwKTsnKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoaGFzUHJpbWl0aXZlKSB7XG4gICAgICAgICAgICBleGl0KERSQVdfU1RBVEUucHJpbWl0aXZlLCAnLnBvcCgpOycpXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChoYXNDb3VudCkge1xuICAgICAgICAgICAgZXhpdChEUkFXX1NUQVRFLmNvdW50LCAnLnBvcCgpOycpXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICghKCdvZmZzZXQnIGluIHN0YXRpY09wdGlvbnMpKSB7XG4gICAgICAgICAgICBlbnRyeShEUkFXX1NUQVRFLm9mZnNldCwgJy5wdXNoKDApOycpXG4gICAgICAgICAgICBleGl0KERSQVdfU1RBVEUub2Zmc2V0LCAnLnBvcCgpOycpXG4gICAgICAgICAgfVxuICAgICAgICAgIGV4aXQoRUxFTUVOVF9TVEFURSwgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnY3VsbC5lbmFibGUnOlxuICAgICAgICBjYXNlICdibGVuZC5lbmFibGUnOlxuICAgICAgICBjYXNlICdkaXRoZXInOlxuICAgICAgICBjYXNlICdzdGVuY2lsLmVuYWJsZSc6XG4gICAgICAgIGNhc2UgJ2RlcHRoLmVuYWJsZSc6XG4gICAgICAgIGNhc2UgJ3NjaXNzb3IuZW5hYmxlJzpcbiAgICAgICAgY2FzZSAncG9seWdvbk9mZnNldC5lbmFibGUnOlxuICAgICAgICBjYXNlICdzYW1wbGUuYWxwaGEnOlxuICAgICAgICBjYXNlICdzYW1wbGUuZW5hYmxlJzpcbiAgICAgICAgY2FzZSAnZGVwdGgubWFzayc6XG4gICAgICAgICAgXG4gICAgICAgICAgaGFuZGxlU3RhdGljT3B0aW9uKHBhcmFtLCB2YWx1ZSlcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2RlcHRoLmZ1bmMnOlxuICAgICAgICAgIFxuICAgICAgICAgIGhhbmRsZVN0YXRpY09wdGlvbihwYXJhbSwgY29tcGFyZUZ1bmNzW3ZhbHVlXSlcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2RlcHRoLnJhbmdlJzpcbiAgICAgICAgICBcbiAgICAgICAgICB2YXIgREVQVEhfUkFOR0VfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBlbnRyeShERVBUSF9SQU5HRV9TVEFDSywgJy5wdXNoKCcsIHZhbHVlWzBdLCAnLCcsIHZhbHVlWzFdLCAnKTsnKVxuICAgICAgICAgIGV4aXQoREVQVEhfUkFOR0VfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2JsZW5kLmZ1bmMnOlxuICAgICAgICAgIHZhciBCTEVORF9GVU5DX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgXG4gICAgICAgICAgdmFyIHNyY1JHQiA9ICgnc3JjUkdCJyBpbiB2YWx1ZSA/IHZhbHVlLnNyY1JHQiA6IHZhbHVlLnNyYylcbiAgICAgICAgICB2YXIgc3JjQWxwaGEgPSAoJ3NyY0FscGhhJyBpbiB2YWx1ZSA/IHZhbHVlLnNyY0FscGhhIDogdmFsdWUuc3JjKVxuICAgICAgICAgIHZhciBkc3RSR0IgPSAoJ2RzdFJHQicgaW4gdmFsdWUgPyB2YWx1ZS5kc3RSR0IgOiB2YWx1ZS5kc3QpXG4gICAgICAgICAgdmFyIGRzdEFscGhhID0gKCdkc3RBbHBoYScgaW4gdmFsdWUgPyB2YWx1ZS5kc3RBbHBoYSA6IHZhbHVlLmRzdClcbiAgICAgICAgICBcbiAgICAgICAgICBcbiAgICAgICAgICBcbiAgICAgICAgICBcbiAgICAgICAgICBlbnRyeShCTEVORF9GVU5DX1NUQUNLLCAnLnB1c2goJyxcbiAgICAgICAgICAgIGJsZW5kRnVuY3Nbc3JjUkdCXSwgJywnLFxuICAgICAgICAgICAgYmxlbmRGdW5jc1tkc3RSR0JdLCAnLCcsXG4gICAgICAgICAgICBibGVuZEZ1bmNzW3NyY0FscGhhXSwgJywnLFxuICAgICAgICAgICAgYmxlbmRGdW5jc1tkc3RBbHBoYV0sICcpOycpXG4gICAgICAgICAgZXhpdChCTEVORF9GVU5DX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdibGVuZC5lcXVhdGlvbic6XG4gICAgICAgICAgdmFyIEJMRU5EX0VRVUFUSU9OX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZW50cnkoQkxFTkRfRVFVQVRJT05fU1RBQ0ssXG4gICAgICAgICAgICAgICcucHVzaCgnLFxuICAgICAgICAgICAgICBibGVuZEVxdWF0aW9uc1t2YWx1ZV0sICcsJyxcbiAgICAgICAgICAgICAgYmxlbmRFcXVhdGlvbnNbdmFsdWVdLCAnKTsnKVxuICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGVudHJ5KEJMRU5EX0VRVUFUSU9OX1NUQUNLLFxuICAgICAgICAgICAgICAnLnB1c2goJyxcbiAgICAgICAgICAgICAgYmxlbmRFcXVhdGlvbnNbdmFsdWUucmdiXSwgJywnLFxuICAgICAgICAgICAgICBibGVuZEVxdWF0aW9uc1t2YWx1ZS5hbHBoYV0sICcpOycpXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgIH1cbiAgICAgICAgICBleGl0KEJMRU5EX0VRVUFUSU9OX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdibGVuZC5jb2xvcic6XG4gICAgICAgICAgXG4gICAgICAgICAgdmFyIEJMRU5EX0NPTE9SX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZW50cnkoQkxFTkRfQ09MT1JfU1RBQ0ssXG4gICAgICAgICAgICAnLnB1c2goJyxcbiAgICAgICAgICAgIHZhbHVlWzBdLCAnLCcsXG4gICAgICAgICAgICB2YWx1ZVsxXSwgJywnLFxuICAgICAgICAgICAgdmFsdWVbMl0sICcsJyxcbiAgICAgICAgICAgIHZhbHVlWzNdLCAnKTsnKVxuICAgICAgICAgIGV4aXQoQkxFTkRfQ09MT1JfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3N0ZW5jaWwubWFzayc6XG4gICAgICAgICAgXG4gICAgICAgICAgdmFyIFNURU5DSUxfTUFTS19TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGVudHJ5KFNURU5DSUxfTUFTS19TVEFDSywgJy5wdXNoKCcsIHZhbHVlLCAnKTsnKVxuICAgICAgICAgIGV4aXQoU1RFTkNJTF9NQVNLX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdzdGVuY2lsLmZ1bmMnOlxuICAgICAgICAgIFxuICAgICAgICAgIHZhciBjbXAgPSB2YWx1ZS5jbXAgfHwgJ2tlZXAnXG4gICAgICAgICAgdmFyIHJlZiA9IHZhbHVlLnJlZiB8fCAwXG4gICAgICAgICAgdmFyIG1hc2sgPSAnbWFzaycgaW4gdmFsdWUgPyB2YWx1ZS5tYXNrIDogLTFcbiAgICAgICAgICBcbiAgICAgICAgICBcbiAgICAgICAgICBcbiAgICAgICAgICB2YXIgU1RFTkNJTF9GVU5DX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZW50cnkoU1RFTkNJTF9GVU5DX1NUQUNLLCAnLnB1c2goJyxcbiAgICAgICAgICAgIGNvbXBhcmVGdW5jc1tjbXBdLCAnLCcsXG4gICAgICAgICAgICByZWYsICcsJyxcbiAgICAgICAgICAgIG1hc2ssICcpOycpXG4gICAgICAgICAgZXhpdChTVEVOQ0lMX0ZVTkNfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3N0ZW5jaWwub3BGcm9udCc6XG4gICAgICAgIGNhc2UgJ3N0ZW5jaWwub3BCYWNrJzpcbiAgICAgICAgICBcbiAgICAgICAgICB2YXIgZmFpbCA9IHZhbHVlLmZhaWwgfHwgJ2tlZXAnXG4gICAgICAgICAgdmFyIHpmYWlsID0gdmFsdWUuemZhaWwgfHwgJ2tlZXAnXG4gICAgICAgICAgdmFyIHBhc3MgPSB2YWx1ZS5wYXNzIHx8ICdrZWVwJ1xuICAgICAgICAgIFxuICAgICAgICAgIFxuICAgICAgICAgIFxuICAgICAgICAgIHZhciBTVEVOQ0lMX09QX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZW50cnkoU1RFTkNJTF9PUF9TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICBzdGVuY2lsT3BzW2ZhaWxdLCAnLCcsXG4gICAgICAgICAgICBzdGVuY2lsT3BzW3pmYWlsXSwgJywnLFxuICAgICAgICAgICAgc3RlbmNpbE9wc1twYXNzXSwgJyk7JylcbiAgICAgICAgICBleGl0KFNURU5DSUxfT1BfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3BvbHlnb25PZmZzZXQub2Zmc2V0JzpcbiAgICAgICAgICBcbiAgICAgICAgICB2YXIgZmFjdG9yID0gdmFsdWUuZmFjdG9yIHx8IDBcbiAgICAgICAgICB2YXIgdW5pdHMgPSB2YWx1ZS51bml0cyB8fCAwXG4gICAgICAgICAgXG4gICAgICAgICAgXG4gICAgICAgICAgdmFyIFBPTFlHT05fT0ZGU0VUX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZW50cnkoUE9MWUdPTl9PRkZTRVRfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgZmFjdG9yLCAnLCcsIHVuaXRzLCAnKTsnKVxuICAgICAgICAgIGV4aXQoUE9MWUdPTl9PRkZTRVRfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2N1bGwuZmFjZSc6XG4gICAgICAgICAgdmFyIGZhY2UgPSAwXG4gICAgICAgICAgaWYgKHZhbHVlID09PSAnZnJvbnQnKSB7XG4gICAgICAgICAgICBmYWNlID0gR0xfRlJPTlRcbiAgICAgICAgICB9IGVsc2UgaWYgKHZhbHVlID09PSAnYmFjaycpIHtcbiAgICAgICAgICAgIGZhY2UgPSBHTF9CQUNLXG4gICAgICAgICAgfVxuICAgICAgICAgIFxuICAgICAgICAgIHZhciBDVUxMX0ZBQ0VfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBlbnRyeShDVUxMX0ZBQ0VfU1RBQ0ssICcucHVzaCgnLCBmYWNlLCAnKTsnKVxuICAgICAgICAgIGV4aXQoQ1VMTF9GQUNFX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdsaW5lV2lkdGgnOlxuICAgICAgICAgIHZhciBsaW5lV2lkdGhEaW1zID0gbGltaXRzLmxpbmVXaWR0aERpbXNcbiAgICAgICAgICBcbiAgICAgICAgICBoYW5kbGVTdGF0aWNPcHRpb24ocGFyYW0sIHZhbHVlKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnZnJvbnRGYWNlJzpcbiAgICAgICAgICB2YXIgb3JpZW50YXRpb24gPSAwXG4gICAgICAgICAgaWYgKHZhbHVlID09PSAnY3cnKSB7XG4gICAgICAgICAgICBvcmllbnRhdGlvbiA9IEdMX0NXXG4gICAgICAgICAgfSBlbHNlIGlmICh2YWx1ZSA9PT0gJ2NjdycpIHtcbiAgICAgICAgICAgIG9yaWVudGF0aW9uID0gR0xfQ0NXXG4gICAgICAgICAgfVxuICAgICAgICAgIFxuICAgICAgICAgIHZhciBGUk9OVF9GQUNFX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZW50cnkoRlJPTlRfRkFDRV9TVEFDSywgJy5wdXNoKCcsIG9yaWVudGF0aW9uLCAnKTsnKVxuICAgICAgICAgIGV4aXQoRlJPTlRfRkFDRV9TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnY29sb3JNYXNrJzpcbiAgICAgICAgICBcbiAgICAgICAgICB2YXIgQ09MT1JfTUFTS19TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGVudHJ5KENPTE9SX01BU0tfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgdmFsdWUubWFwKGZ1bmN0aW9uICh2KSB7IHJldHVybiAhIXYgfSkuam9pbigpLFxuICAgICAgICAgICAgJyk7JylcbiAgICAgICAgICBleGl0KENPTE9SX01BU0tfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3NhbXBsZS5jb3ZlcmFnZSc6XG4gICAgICAgICAgXG4gICAgICAgICAgdmFyIHNhbXBsZVZhbHVlID0gJ3ZhbHVlJyBpbiB2YWx1ZSA/IHZhbHVlLnZhbHVlIDogMVxuICAgICAgICAgIHZhciBzYW1wbGVJbnZlcnQgPSAhIXZhbHVlLmludmVydFxuICAgICAgICAgIFxuICAgICAgICAgIHZhciBTQU1QTEVfQ09WRVJBR0VfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBlbnRyeShTQU1QTEVfQ09WRVJBR0VfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgc2FtcGxlVmFsdWUsICcsJywgc2FtcGxlSW52ZXJ0LCAnKTsnKVxuICAgICAgICAgIGV4aXQoU0FNUExFX0NPVkVSQUdFX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICd2aWV3cG9ydCc6XG4gICAgICAgIGNhc2UgJ3NjaXNzb3IuYm94JzpcbiAgICAgICAgICBcbiAgICAgICAgICB2YXIgWCA9IHZhbHVlLnggfHwgMFxuICAgICAgICAgIHZhciBZID0gdmFsdWUueSB8fCAwXG4gICAgICAgICAgdmFyIFcgPSAtMVxuICAgICAgICAgIHZhciBIID0gLTFcbiAgICAgICAgICBcbiAgICAgICAgICBcbiAgICAgICAgICBpZiAoJ3cnIGluIHZhbHVlKSB7XG4gICAgICAgICAgICBXID0gdmFsdWUud1xuICAgICAgICAgICAgXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgnaCcgaW4gdmFsdWUpIHtcbiAgICAgICAgICAgIEggPSB2YWx1ZS5oXG4gICAgICAgICAgICBcbiAgICAgICAgICB9XG4gICAgICAgICAgdmFyIEJPWF9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGVudHJ5KEJPWF9TVEFDSywgJy5wdXNoKCcsIFgsICcsJywgWSwgJywnLCBXLCAnLCcsIEgsICcpOycpXG4gICAgICAgICAgZXhpdChCT1hfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgLy8gVE9ETyBTaG91bGQgdGhpcyBqdXN0IGJlIGEgd2FybmluZyBpbnN0ZWFkP1xuICAgICAgICAgIFxuICAgICAgICAgIGJyZWFrXG4gICAgICB9XG4gICAgfSlcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyB1cGRhdGUgc2hhZGVyIHByb2dyYW1cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgaWYgKGhhc1NoYWRlcikge1xuICAgICAgaWYgKHN0YXRpY09wdGlvbnMuZnJhZyAmJiBzdGF0aWNPcHRpb25zLnZlcnQpIHtcbiAgICAgICAgdmFyIGZyYWdTcmMgPSBzdGF0aWNPcHRpb25zLmZyYWdcbiAgICAgICAgdmFyIHZlcnRTcmMgPSBzdGF0aWNPcHRpb25zLnZlcnRcbiAgICAgICAgZW50cnkoUFJPR1JBTV9TVEFURSwgJy5wdXNoKCcsXG4gICAgICAgICAgbGluayhzaGFkZXJTdGF0ZS5jcmVhdGUoXG4gICAgICAgICAgICBzdHJpbmdTdG9yZS5pZCh2ZXJ0U3JjKSxcbiAgICAgICAgICAgIHN0cmluZ1N0b3JlLmlkKGZyYWdTcmMpKSksICcpOycpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgRlJBR19TUkMgPSBlbnRyeS5kZWYoXG4gICAgICAgICAgRlJBR19TSEFERVJfU1RBVEUsICdbJywgRlJBR19TSEFERVJfU1RBVEUsICcubGVuZ3RoLTFdJylcbiAgICAgICAgdmFyIFZFUlRfU1JDID0gZW50cnkuZGVmKFxuICAgICAgICAgIFZFUlRfU0hBREVSX1NUQVRFLCAnWycsIFZFUlRfU0hBREVSX1NUQVRFLCAnLmxlbmd0aC0xXScpXG4gICAgICAgIHZhciBMSU5LX1BST0cgPSBsaW5rKHNoYWRlclN0YXRlLmNyZWF0ZSlcbiAgICAgICAgZW50cnkoXG4gICAgICAgICAgUFJPR1JBTV9TVEFURSwgJy5wdXNoKCcsXG4gICAgICAgICAgTElOS19QUk9HLCAnKCcsIFZFUlRfU1JDLCAnLCcsIEZSQUdfU1JDLCAnKSk7JylcbiAgICAgIH1cbiAgICAgIGV4aXQoUFJPR1JBTV9TVEFURSwgJy5wb3AoKTsnKVxuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyB1cGRhdGUgc3RhdGljIHVuaWZvcm1zXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIE9iamVjdC5rZXlzKHN0YXRpY1VuaWZvcm1zKS5mb3JFYWNoKGZ1bmN0aW9uICh1bmlmb3JtKSB7XG4gICAgICB2YXIgU1RBQ0sgPSBsaW5rKHVuaWZvcm1TdGF0ZS5kZWYodW5pZm9ybSkpXG4gICAgICB2YXIgVkFMVUVcbiAgICAgIHZhciB2YWx1ZSA9IHN0YXRpY1VuaWZvcm1zW3VuaWZvcm1dXG4gICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nICYmIHZhbHVlLl9yZWdsVHlwZSkge1xuICAgICAgICBWQUxVRSA9IGxpbmsodmFsdWUpXG4gICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG4gICAgICAgIFZBTFVFID0gbGluayh2YWx1ZS5zbGljZSgpKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgVkFMVUUgPSArdmFsdWVcbiAgICAgIH1cbiAgICAgIGVudHJ5KFNUQUNLLCAnLnB1c2goJywgVkFMVUUsICcpOycpXG4gICAgICBleGl0KFNUQUNLLCAnLnBvcCgpOycpXG4gICAgfSlcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyB1cGRhdGUgZGVmYXVsdCBhdHRyaWJ1dGVzXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIE9iamVjdC5rZXlzKHN0YXRpY0F0dHJpYnV0ZXMpLmZvckVhY2goZnVuY3Rpb24gKGF0dHJpYnV0ZSkge1xuICAgICAgdmFyIEFUVFJJQlVURSA9IGxpbmsoYXR0cmlidXRlU3RhdGUuZGVmKGF0dHJpYnV0ZSkpXG5cbiAgICAgIHZhciBkYXRhID0gc3RhdGljQXR0cmlidXRlc1thdHRyaWJ1dGVdXG4gICAgICBpZiAodHlwZW9mIGRhdGEgPT09ICdudW1iZXInKSB7XG4gICAgICAgIGVudHJ5KEFUVFJJQlVURSwgJy5wdXNoVmVjKCcsICtkYXRhLCAnLDAsMCwwKTsnKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgXG5cbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YSkpIHtcbiAgICAgICAgICBlbnRyeShcbiAgICAgICAgICAgIEFUVFJJQlVURSwgJy5wdXNoVmVjKCcsXG4gICAgICAgICAgICBbZGF0YVswXSB8fCAwLCBkYXRhWzFdIHx8IDAsIGRhdGFbMl0gfHwgMCwgZGF0YVszXSB8fCAwXSwgJyk7JylcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB2YXIgYnVmZmVyID0gYnVmZmVyU3RhdGUuZ2V0QnVmZmVyKGRhdGEpXG4gICAgICAgICAgdmFyIHNpemUgPSAwXG4gICAgICAgICAgdmFyIHN0cmlkZSA9IDBcbiAgICAgICAgICB2YXIgb2Zmc2V0ID0gMFxuICAgICAgICAgIHZhciBkaXZpc29yID0gMFxuICAgICAgICAgIHZhciBub3JtYWxpemVkID0gZmFsc2VcbiAgICAgICAgICB2YXIgdHlwZSA9IEdMX0ZMT0FUXG5cbiAgICAgICAgICBpZiAoIWJ1ZmZlcikge1xuICAgICAgICAgICAgXG5cbiAgICAgICAgICAgIGJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmdldEJ1ZmZlcihkYXRhLmJ1ZmZlcilcbiAgICAgICAgICAgIHNpemUgPSBkYXRhLnNpemUgfHwgMFxuICAgICAgICAgICAgc3RyaWRlID0gZGF0YS5zdHJpZGUgfHwgMFxuICAgICAgICAgICAgb2Zmc2V0ID0gZGF0YS5vZmZzZXQgfHwgMFxuICAgICAgICAgICAgZGl2aXNvciA9IGRhdGEuZGl2aXNvciB8fCAwXG4gICAgICAgICAgICBub3JtYWxpemVkID0gZGF0YS5ub3JtYWxpemVkIHx8IGZhbHNlXG5cbiAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAvLyBDaGVjayBmb3IgdXNlciBkZWZpbmVkIHR5cGUgb3ZlcmxvYWRpbmdcbiAgICAgICAgICAgIHR5cGUgPSBidWZmZXIuZHR5cGVcbiAgICAgICAgICAgIGlmICgndHlwZScgaW4gZGF0YSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgdHlwZSA9IGdsVHlwZXNbZGF0YS50eXBlXVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0eXBlID0gYnVmZmVyLmR0eXBlXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgXG4gICAgICAgICAgXG4gICAgICAgICAgXG4gICAgICAgICAgXG4gICAgICAgICAgXG4gICAgICAgICAgXG5cbiAgICAgICAgICBlbnRyeShcbiAgICAgICAgICAgIEFUVFJJQlVURSwgJy5wdXNoUHRyKCcsIFtcbiAgICAgICAgICAgICAgbGluayhidWZmZXIpLCBzaXplLCBvZmZzZXQsIHN0cmlkZSxcbiAgICAgICAgICAgICAgZGl2aXNvciwgbm9ybWFsaXplZCwgdHlwZVxuICAgICAgICAgICAgXS5qb2luKCksICcpOycpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGV4aXQoQVRUUklCVVRFLCAnLnBvcCgpOycpXG4gICAgfSlcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBEWU5BTUlDIFNUQVRFIChmb3Igc2NvcGUgYW5kIGRyYXcpXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIEdlbmVyYXRlZCBjb2RlIGJsb2NrcyBmb3IgZHluYW1pYyBzdGF0ZSBmbGFnc1xuICAgIHZhciBkeW5hbWljRW50cnkgPSBlbnYuYmxvY2soKVxuICAgIHZhciBkeW5hbWljRXhpdCA9IGVudi5ibG9jaygpXG5cbiAgICB2YXIgRlJBTUVTVEFURVxuICAgIHZhciBEWU5BUkdTXG4gICAgaWYgKGhhc0R5bmFtaWMpIHtcbiAgICAgIEZSQU1FU1RBVEUgPSBsaW5rKGZyYW1lU3RhdGUpXG4gICAgICBEWU5BUkdTID0gZW50cnkuZGVmKClcbiAgICB9XG5cbiAgICB2YXIgZHluYW1pY1ZhcnMgPSB7fVxuICAgIGZ1bmN0aW9uIGR5biAoeCkge1xuICAgICAgdmFyIGlkID0geC5pZFxuICAgICAgdmFyIHJlc3VsdCA9IGR5bmFtaWNWYXJzW2lkXVxuICAgICAgaWYgKHJlc3VsdCkge1xuICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICB9XG4gICAgICBpZiAoeC5mdW5jKSB7XG4gICAgICAgIHJlc3VsdCA9IGR5bmFtaWNFbnRyeS5kZWYoXG4gICAgICAgICAgbGluayh4LmRhdGEpLCAnKCcsIERZTkFSR1MsICcsMCwnLCBGUkFNRVNUQVRFLCAnKScpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXN1bHQgPSBkeW5hbWljRW50cnkuZGVmKERZTkFSR1MsICcuJywgeC5kYXRhKVxuICAgICAgfVxuICAgICAgZHluYW1pY1ZhcnNbaWRdID0gcmVzdWx0XG4gICAgICByZXR1cm4gcmVzdWx0XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGR5bmFtaWMgY29udGV4dCBzdGF0ZSB2YXJpYWJsZXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgT2JqZWN0LmtleXMoZHluYW1pY09wdGlvbnMpLnNvcnQob3B0aW9uUHJpb3JpdHkpLmZvckVhY2goZnVuY3Rpb24gKHBhcmFtKSB7XG4gICAgICAvLyBMaW5rIGluIGR5bmFtaWMgdmFyaWFibGVcbiAgICAgIHZhciB2YXJpYWJsZSA9IGR5bihkeW5hbWljT3B0aW9uc1twYXJhbV0pXG5cbiAgICAgIHN3aXRjaCAocGFyYW0pIHtcbiAgICAgICAgY2FzZSAnZnJhbWVidWZmZXInOlxuICAgICAgICAgIHZhciBWSUVXUE9SVF9TVEFURSA9IGxpbmtDb250ZXh0KCd2aWV3cG9ydCcpXG4gICAgICAgICAgdmFyIFNDSVNTT1JfU1RBVEUgPSBsaW5rQ29udGV4dCgnc2Npc3Nvci5ib3gnKVxuICAgICAgICAgIGR5bmFtaWNFbnRyeSgnaWYoJyxcbiAgICAgICAgICAgIEZSQU1FQlVGRkVSX1NUQVRFLCAnLnB1c2goJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnJiYnLCB2YXJpYWJsZSwgJy5fZnJhbWVidWZmZXIpKXsnLFxuICAgICAgICAgICAgVklFV1BPUlRfU1RBVEUsICcuc2V0RGlydHkoKTsnLFxuICAgICAgICAgICAgU0NJU1NPUl9TVEFURSwgJy5zZXREaXJ0eSgpOycsXG4gICAgICAgICAgICAnfScpXG4gICAgICAgICAgZHluYW1pY0V4aXQoJ2lmKCcsXG4gICAgICAgICAgICBGUkFNRUJVRkZFUl9TVEFURSwgJy5wb3AoKSl7JyxcbiAgICAgICAgICAgIFZJRVdQT1JUX1NUQVRFLCAnLnNldERpcnR5KCk7JyxcbiAgICAgICAgICAgIFNDSVNTT1JfU1RBVEUsICcuc2V0RGlydHkoKTsnLFxuICAgICAgICAgICAgJ30nKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnY3VsbC5lbmFibGUnOlxuICAgICAgICBjYXNlICdibGVuZC5lbmFibGUnOlxuICAgICAgICBjYXNlICdkaXRoZXInOlxuICAgICAgICBjYXNlICdzdGVuY2lsLmVuYWJsZSc6XG4gICAgICAgIGNhc2UgJ2RlcHRoLmVuYWJsZSc6XG4gICAgICAgIGNhc2UgJ3NjaXNzb3IuZW5hYmxlJzpcbiAgICAgICAgY2FzZSAncG9seWdvbk9mZnNldC5lbmFibGUnOlxuICAgICAgICBjYXNlICdzYW1wbGUuYWxwaGEnOlxuICAgICAgICBjYXNlICdzYW1wbGUuZW5hYmxlJzpcbiAgICAgICAgY2FzZSAnbGluZVdpZHRoJzpcbiAgICAgICAgY2FzZSAnZGVwdGgubWFzayc6XG4gICAgICAgICAgdmFyIFNUQVRFX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZHluYW1pY0VudHJ5KFNUQVRFX1NUQUNLLCAnLnB1c2goJywgdmFyaWFibGUsICcpOycpXG4gICAgICAgICAgZHluYW1pY0V4aXQoU1RBVEVfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIC8vIERyYXcgY2FsbHNcbiAgICAgICAgY2FzZSAnY291bnQnOlxuICAgICAgICBjYXNlICdvZmZzZXQnOlxuICAgICAgICBjYXNlICdpbnN0YW5jZXMnOlxuICAgICAgICAgIHZhciBEUkFXX1NUQUNLID0gRFJBV19TVEFURVtwYXJhbV1cbiAgICAgICAgICBkeW5hbWljRW50cnkoRFJBV19TVEFDSywgJy5wdXNoKCcsIHZhcmlhYmxlLCAnKTsnKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KERSQVdfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3ByaW1pdGl2ZSc6XG4gICAgICAgICAgdmFyIFBSSU1fU1RBQ0sgPSBEUkFXX1NUQVRFLnByaW1pdGl2ZVxuICAgICAgICAgIGR5bmFtaWNFbnRyeShQUklNX1NUQUNLLCAnLnB1c2goJywgUFJJTV9UWVBFUywgJ1snLCB2YXJpYWJsZSwgJ10pOycpXG4gICAgICAgICAgZHluYW1pY0V4aXQoUFJJTV9TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnZGVwdGguZnVuYyc6XG4gICAgICAgICAgdmFyIERFUFRIX0ZVTkNfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBkeW5hbWljRW50cnkoREVQVEhfRlVOQ19TVEFDSywgJy5wdXNoKCcsIENPTVBBUkVfRlVOQ1MsICdbJywgdmFyaWFibGUsICddKTsnKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KERFUFRIX0ZVTkNfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2JsZW5kLmZ1bmMnOlxuICAgICAgICAgIHZhciBCTEVORF9GVU5DX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgdmFyIEJMRU5EX0ZVTkNTID0gbGluayhibGVuZEZ1bmNzKVxuICAgICAgICAgIGR5bmFtaWNFbnRyeShcbiAgICAgICAgICAgIEJMRU5EX0ZVTkNfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgQkxFTkRfRlVOQ1MsXG4gICAgICAgICAgICAnW1wic3JjUkdCXCIgaW4gJywgdmFyaWFibGUsICc/JywgdmFyaWFibGUsICcuc3JjUkdCOicsIHZhcmlhYmxlLCAnLnNyY10sJyxcbiAgICAgICAgICAgIEJMRU5EX0ZVTkNTLFxuICAgICAgICAgICAgJ1tcImRzdFJHQlwiIGluICcsIHZhcmlhYmxlLCAnPycsIHZhcmlhYmxlLCAnLmRzdFJHQjonLCB2YXJpYWJsZSwgJy5kc3RdLCcsXG4gICAgICAgICAgICBCTEVORF9GVU5DUyxcbiAgICAgICAgICAgICdbXCJzcmNBbHBoYVwiIGluICcsIHZhcmlhYmxlLCAnPycsIHZhcmlhYmxlLCAnLnNyY0FscGhhOicsIHZhcmlhYmxlLCAnLnNyY10sJyxcbiAgICAgICAgICAgIEJMRU5EX0ZVTkNTLFxuICAgICAgICAgICAgJ1tcImRzdEFscGhhXCIgaW4gJywgdmFyaWFibGUsICc/JywgdmFyaWFibGUsICcuZHN0QWxwaGE6JywgdmFyaWFibGUsICcuZHN0XSk7JylcbiAgICAgICAgICBkeW5hbWljRXhpdChCTEVORF9GVU5DX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdibGVuZC5lcXVhdGlvbic6XG4gICAgICAgICAgdmFyIEJMRU5EX0VRVUFUSU9OX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgdmFyIEJMRU5EX0VRVUFUSU9OUyA9IGxpbmsoYmxlbmRFcXVhdGlvbnMpXG4gICAgICAgICAgZHluYW1pY0VudHJ5KFxuICAgICAgICAgICAgJ2lmKHR5cGVvZiAnLCB2YXJpYWJsZSwgJz09PVwic3RyaW5nXCIpeycsXG4gICAgICAgICAgICBCTEVORF9FUVVBVElPTl9TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICBCTEVORF9FUVVBVElPTlMsICdbJywgdmFyaWFibGUsICddLCcsXG4gICAgICAgICAgICBCTEVORF9FUVVBVElPTlMsICdbJywgdmFyaWFibGUsICddKTsnLFxuICAgICAgICAgICAgJ31lbHNleycsXG4gICAgICAgICAgICBCTEVORF9FUVVBVElPTl9TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICBCTEVORF9FUVVBVElPTlMsICdbJywgdmFyaWFibGUsICcucmdiXSwnLFxuICAgICAgICAgICAgQkxFTkRfRVFVQVRJT05TLCAnWycsIHZhcmlhYmxlLCAnLmFscGhhXSk7JyxcbiAgICAgICAgICAgICd9JylcbiAgICAgICAgICBkeW5hbWljRXhpdChCTEVORF9FUVVBVElPTl9TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnYmxlbmQuY29sb3InOlxuICAgICAgICAgIHZhciBCTEVORF9DT0xPUl9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGR5bmFtaWNFbnRyeShCTEVORF9DT0xPUl9TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJ1swXSwnLFxuICAgICAgICAgICAgdmFyaWFibGUsICdbMV0sJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnWzJdLCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJ1szXSk7JylcbiAgICAgICAgICBkeW5hbWljRXhpdChCTEVORF9DT0xPUl9TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnc3RlbmNpbC5tYXNrJzpcbiAgICAgICAgICB2YXIgU1RFTkNJTF9NQVNLX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZHluYW1pY0VudHJ5KFNURU5DSUxfTUFTS19TVEFDSywgJy5wdXNoKCcsIHZhcmlhYmxlLCAnKTsnKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KFNURU5DSUxfTUFTS19TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnc3RlbmNpbC5mdW5jJzpcbiAgICAgICAgICB2YXIgU1RFTkNJTF9GVU5DX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZHluYW1pY0VudHJ5KFNURU5DSUxfRlVOQ19TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICBDT01QQVJFX0ZVTkNTLCAnWycsIHZhcmlhYmxlLCAnLmNtcF0sJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnLnJlZnwwLCcsXG4gICAgICAgICAgICAnXCJtYXNrXCIgaW4gJywgdmFyaWFibGUsICc/JywgdmFyaWFibGUsICcubWFzazotMSk7JylcbiAgICAgICAgICBkeW5hbWljRXhpdChTVEVOQ0lMX0ZVTkNfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3N0ZW5jaWwub3BGcm9udCc6XG4gICAgICAgIGNhc2UgJ3N0ZW5jaWwub3BCYWNrJzpcbiAgICAgICAgICB2YXIgU1RFTkNJTF9PUF9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGR5bmFtaWNFbnRyeShTVEVOQ0lMX09QX1NUQUNLLCAnLnB1c2goJyxcbiAgICAgICAgICAgIFNURU5DSUxfT1BTLCAnWycsIHZhcmlhYmxlLCAnLmZhaWx8fFwia2VlcFwiXSwnLFxuICAgICAgICAgICAgU1RFTkNJTF9PUFMsICdbJywgdmFyaWFibGUsICcuemZhaWx8fFwia2VlcFwiXSwnLFxuICAgICAgICAgICAgU1RFTkNJTF9PUFMsICdbJywgdmFyaWFibGUsICcucGFzc3x8XCJrZWVwXCJdKTsnKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KFNURU5DSUxfT1BfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3BvbHlnb25PZmZzZXQub2Zmc2V0JzpcbiAgICAgICAgICB2YXIgUE9MWUdPTl9PRkZTRVRfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBkeW5hbWljRW50cnkoUE9MWUdPTl9PRkZTRVRfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgdmFyaWFibGUsICcuZmFjdG9yfHwwLCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJy51bml0c3x8MCk7JylcbiAgICAgICAgICBkeW5hbWljRXhpdChQT0xZR09OX09GRlNFVF9TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnY3VsbC5mYWNlJzpcbiAgICAgICAgICB2YXIgQ1VMTF9GQUNFX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZHluYW1pY0VudHJ5KENVTExfRkFDRV9TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJz09PVwiZnJvbnRcIj8nLCBHTF9GUk9OVCwgJzonLCBHTF9CQUNLLCAnKTsnKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KENVTExfRkFDRV9TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnZnJvbnRGYWNlJzpcbiAgICAgICAgICB2YXIgRlJPTlRfRkFDRV9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGR5bmFtaWNFbnRyeShGUk9OVF9GQUNFX1NUQUNLLCAnLnB1c2goJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnPT09XCJjd1wiPycsIEdMX0NXLCAnOicsIEdMX0NDVywgJyk7JylcbiAgICAgICAgICBkeW5hbWljRXhpdChGUk9OVF9GQUNFX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdjb2xvck1hc2snOlxuICAgICAgICAgIHZhciBDT0xPUl9NQVNLX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZHluYW1pY0VudHJ5KENPTE9SX01BU0tfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgdmFyaWFibGUsICdbMF0sJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnWzFdLCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJ1syXSwnLFxuICAgICAgICAgICAgdmFyaWFibGUsICdbM10pOycpXG4gICAgICAgICAgZHluYW1pY0V4aXQoQ09MT1JfTUFTS19TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnc2FtcGxlLmNvdmVyYWdlJzpcbiAgICAgICAgICB2YXIgU0FNUExFX0NPVkVSQUdFX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZHluYW1pY0VudHJ5KFNBTVBMRV9DT1ZFUkFHRV9TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJy52YWx1ZSwnLFxuICAgICAgICAgICAgdmFyaWFibGUsICcuaW52ZXJ0KTsnKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KFNBTVBMRV9DT1ZFUkFHRV9TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnc2Npc3Nvci5ib3gnOlxuICAgICAgICBjYXNlICd2aWV3cG9ydCc6XG4gICAgICAgICAgdmFyIEJPWF9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGR5bmFtaWNFbnRyeShCT1hfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgdmFyaWFibGUsICcueHx8MCwnLFxuICAgICAgICAgICAgdmFyaWFibGUsICcueXx8MCwnLFxuICAgICAgICAgICAgJ1wid1wiIGluICcsIHZhcmlhYmxlLCAnPycsIHZhcmlhYmxlLCAnLnc6LTEsJyxcbiAgICAgICAgICAgICdcImhcIiBpbiAnLCB2YXJpYWJsZSwgJz8nLCB2YXJpYWJsZSwgJy5oOi0xKTsnKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KEJPWF9TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnZWxlbWVudHMnOlxuICAgICAgICAgIHZhciBoYXNQcmltaXRpdmUgPVxuICAgICAgICAgICEoJ3ByaW1pdGl2ZScgaW4gZHluYW1pY09wdGlvbnMpICYmXG4gICAgICAgICAgICAhKCdwcmltaXRpdmUnIGluIHN0YXRpY09wdGlvbnMpXG4gICAgICAgICAgdmFyIGhhc0NvdW50ID1cbiAgICAgICAgICAhKCdjb3VudCcgaW4gZHluYW1pY09wdGlvbnMpICYmXG4gICAgICAgICAgICAhKCdjb3VudCcgaW4gc3RhdGljT3B0aW9ucylcbiAgICAgICAgICB2YXIgaGFzT2Zmc2V0ID1cbiAgICAgICAgICAhKCdvZmZzZXQnIGluIGR5bmFtaWNPcHRpb25zKSAmJlxuICAgICAgICAgICAgISgnb2Zmc2V0JyBpbiBzdGF0aWNPcHRpb25zKVxuICAgICAgICAgIHZhciBFTEVNRU5UUyA9IGR5bmFtaWNFbnRyeS5kZWYoKVxuICAgICAgICAgIGR5bmFtaWNFbnRyeShcbiAgICAgICAgICAgICdpZignLCB2YXJpYWJsZSwgJyl7JyxcbiAgICAgICAgICAgIEVMRU1FTlRTLCAnPScsIHZhcmlhYmxlLCAnLl9lbGVtZW50czsnLFxuICAgICAgICAgICAgRUxFTUVOVF9TVEFURSwgJy5wdXNoKCcsIEVMRU1FTlRTLCAnKTsnLFxuICAgICAgICAgICAgIWhhc1ByaW1pdGl2ZSA/ICcnXG4gICAgICAgICAgICAgIDogRFJBV19TVEFURS5wcmltaXRpdmUgKyAnLnB1c2goJyArIEVMRU1FTlRTICsgJy5wcmltVHlwZSk7JyxcbiAgICAgICAgICAgICFoYXNDb3VudCA/ICcnXG4gICAgICAgICAgICAgIDogRFJBV19TVEFURS5jb3VudCArICcucHVzaCgnICsgRUxFTUVOVFMgKyAnLnZlcnRDb3VudCk7JyxcbiAgICAgICAgICAgICFoYXNPZmZzZXQgPyAnJ1xuICAgICAgICAgICAgICA6IERSQVdfU1RBVEUub2Zmc2V0ICsgJy5wdXNoKCcgKyBFTEVNRU5UUyArICcub2Zmc2V0KTsnLFxuICAgICAgICAgICAgJ31lbHNleycsXG4gICAgICAgICAgICBFTEVNRU5UX1NUQVRFLCAnLnB1c2gobnVsbCk7JyxcbiAgICAgICAgICAgICd9JylcbiAgICAgICAgICBkeW5hbWljRXhpdChcbiAgICAgICAgICAgIEVMRU1FTlRfU1RBVEUsICcucG9wKCk7JyxcbiAgICAgICAgICAgICdpZignLCB2YXJpYWJsZSwgJyl7JyxcbiAgICAgICAgICAgIGhhc1ByaW1pdGl2ZSA/IERSQVdfU1RBVEUucHJpbWl0aXZlICsgJy5wb3AoKTsnIDogJycsXG4gICAgICAgICAgICBoYXNDb3VudCA/IERSQVdfU1RBVEUuY291bnQgKyAnLnBvcCgpOycgOiAnJyxcbiAgICAgICAgICAgIGhhc09mZnNldCA/IERSQVdfU1RBVEUub2Zmc2V0ICsgJy5wb3AoKTsnIDogJycsXG4gICAgICAgICAgICAnfScpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIFxuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gZHluYW1pYyB1bmlmb3Jtc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBPYmplY3Qua2V5cyhkeW5hbWljVW5pZm9ybXMpLmZvckVhY2goZnVuY3Rpb24gKHVuaWZvcm0pIHtcbiAgICAgIHZhciBTVEFDSyA9IGxpbmsodW5pZm9ybVN0YXRlLmRlZih1bmlmb3JtKSlcbiAgICAgIHZhciBWQUxVRSA9IGR5bihkeW5hbWljVW5pZm9ybXNbdW5pZm9ybV0pXG4gICAgICBkeW5hbWljRW50cnkoU1RBQ0ssICcucHVzaCgnLCBWQUxVRSwgJyk7JylcbiAgICAgIGR5bmFtaWNFeGl0KFNUQUNLLCAnLnBvcCgpOycpXG4gICAgfSlcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBkeW5hbWljIGF0dHJpYnV0ZXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgT2JqZWN0LmtleXMoZHluYW1pY0F0dHJpYnV0ZXMpLmZvckVhY2goZnVuY3Rpb24gKGF0dHJpYnV0ZSkge1xuICAgICAgdmFyIEFUVFJJQlVURSA9IGxpbmsoYXR0cmlidXRlU3RhdGUuZGVmKGF0dHJpYnV0ZSkpXG4gICAgICB2YXIgVkFMVUUgPSBkeW4oZHluYW1pY0F0dHJpYnV0ZXNbYXR0cmlidXRlXSlcbiAgICAgIGR5bmFtaWNFbnRyeShBVFRSSUJVVEUsICcucHVzaER5bignLCBWQUxVRSwgJyk7JylcbiAgICAgIGR5bmFtaWNFeGl0KEFUVFJJQlVURSwgJy5wb3AoKTsnKVxuICAgIH0pXG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gU0NPUEUgUFJPQ0VEVVJFXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIHZhciBzY29wZSA9IHByb2MoJ3Njb3BlJylcbiAgICB2YXIgU0NPUEVfQVJHUyA9IHNjb3BlLmFyZygpXG4gICAgdmFyIFNDT1BFX0JPRFkgPSBzY29wZS5hcmcoKVxuICAgIHNjb3BlKGVudHJ5KVxuICAgIGlmIChoYXNEeW5hbWljKSB7XG4gICAgICBzY29wZShcbiAgICAgICAgRFlOQVJHUywgJz0nLCBTQ09QRV9BUkdTLCAnOycsXG4gICAgICAgIGR5bmFtaWNFbnRyeSlcbiAgICB9XG4gICAgc2NvcGUoXG4gICAgICBTQ09QRV9CT0RZLCAnKCk7JyxcbiAgICAgIGhhc0R5bmFtaWMgPyBkeW5hbWljRXhpdCA6ICcnLFxuICAgICAgZXhpdClcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBEUkFXIFBST0NFRFVSRVxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICB2YXIgZHJhdyA9IHByb2MoJ2RyYXcnKVxuICAgIGRyYXcoZW50cnkpXG4gICAgaWYgKGhhc0R5bmFtaWMpIHtcbiAgICAgIGRyYXcoXG4gICAgICAgIERZTkFSR1MsICc9JywgZHJhdy5hcmcoKSwgJzsnLFxuICAgICAgICBkeW5hbWljRW50cnkpXG4gICAgfVxuICAgIHZhciBDVVJSRU5UX1NIQURFUiA9IHN0YWNrVG9wKFBST0dSQU1fU1RBVEUpXG4gICAgZHJhdyhcbiAgICAgIEdMX1BPTEwsICcoKTsnLFxuICAgICAgJ2lmKCcsIENVUlJFTlRfU0hBREVSLCAnKScsXG4gICAgICBDVVJSRU5UX1NIQURFUiwgJy5kcmF3KCcsIGhhc0R5bmFtaWMgPyBEWU5BUkdTIDogJycsICcpOycsXG4gICAgICBoYXNEeW5hbWljID8gZHluYW1pY0V4aXQgOiAnJyxcbiAgICAgIGV4aXQpXG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gQkFUQ0ggRFJBV1xuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICB2YXIgYmF0Y2ggPSBwcm9jKCdiYXRjaCcpXG4gICAgYmF0Y2goZW50cnkpXG4gICAgdmFyIENVUl9TSEFERVIgPSBiYXRjaC5kZWYoc3RhY2tUb3AoUFJPR1JBTV9TVEFURSkpXG4gICAgdmFyIEVYRUNfQkFUQ0ggPSBsaW5rKGZ1bmN0aW9uIChwcm9ncmFtLCBjb3VudCwgYXJncykge1xuICAgICAgdmFyIHByb2MgPSBwcm9ncmFtLmJhdGNoQ2FjaGVbY2FsbElkXVxuICAgICAgaWYgKCFwcm9jKSB7XG4gICAgICAgIHByb2MgPSBwcm9ncmFtLmJhdGNoQ2FjaGVbY2FsbElkXSA9IGNvbXBpbGVCYXRjaChcbiAgICAgICAgICBwcm9ncmFtLCBkeW5hbWljT3B0aW9ucywgZHluYW1pY1VuaWZvcm1zLCBkeW5hbWljQXR0cmlidXRlcyxcbiAgICAgICAgICBzdGF0aWNPcHRpb25zKVxuICAgICAgfVxuICAgICAgcmV0dXJuIHByb2MoY291bnQsIGFyZ3MpXG4gICAgfSlcbiAgICBiYXRjaChcbiAgICAgICdpZignLCBDVVJfU0hBREVSLCAnKXsnLFxuICAgICAgR0xfUE9MTCwgJygpOycsXG4gICAgICBFWEVDX0JBVENILCAnKCcsXG4gICAgICBDVVJfU0hBREVSLCAnLCcsXG4gICAgICBiYXRjaC5hcmcoKSwgJywnLFxuICAgICAgYmF0Y2guYXJnKCksICcpOycpXG4gICAgLy8gU2V0IGRpcnR5IG9uIGFsbCBkeW5hbWljIGZsYWdzXG4gICAgT2JqZWN0LmtleXMoZHluYW1pY09wdGlvbnMpLmZvckVhY2goZnVuY3Rpb24gKG9wdGlvbikge1xuICAgICAgdmFyIFNUQVRFID0gQ09OVEVYVF9TVEFURVtvcHRpb25dXG4gICAgICBpZiAoU1RBVEUpIHtcbiAgICAgICAgYmF0Y2goU1RBVEUsICcuc2V0RGlydHkoKTsnKVxuICAgICAgfVxuICAgIH0pXG4gICAgYmF0Y2goJ30nLCBleGl0KVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGV2YWwgYW5kIGJpbmRcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgcmV0dXJuIGVudi5jb21waWxlKClcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgZHJhdzogY29tcGlsZVNoYWRlckRyYXcsXG4gICAgY29tbWFuZDogY29tcGlsZUNvbW1hbmRcbiAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICBcIltvYmplY3QgSW50OEFycmF5XVwiOiA1MTIwXG4sIFwiW29iamVjdCBJbnQxNkFycmF5XVwiOiA1MTIyXG4sIFwiW29iamVjdCBJbnQzMkFycmF5XVwiOiA1MTI0XG4sIFwiW29iamVjdCBVaW50OEFycmF5XVwiOiA1MTIxXG4sIFwiW29iamVjdCBVaW50OENsYW1wZWRBcnJheV1cIjogNTEyMVxuLCBcIltvYmplY3QgVWludDE2QXJyYXldXCI6IDUxMjNcbiwgXCJbb2JqZWN0IFVpbnQzMkFycmF5XVwiOiA1MTI1XG4sIFwiW29iamVjdCBGbG9hdDMyQXJyYXldXCI6IDUxMjZcbiwgXCJbb2JqZWN0IEZsb2F0NjRBcnJheV1cIjogNTEyMVxuLCBcIltvYmplY3QgQXJyYXlCdWZmZXJdXCI6IDUxMjFcbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgXCJpbnQ4XCI6IDUxMjBcbiwgXCJpbnQxNlwiOiA1MTIyXG4sIFwiaW50MzJcIjogNTEyNFxuLCBcInVpbnQ4XCI6IDUxMjFcbiwgXCJ1aW50MTZcIjogNTEyM1xuLCBcInVpbnQzMlwiOiA1MTI1XG4sIFwiZmxvYXRcIjogNTEyNlxufVxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICBcInBvaW50c1wiOiAwLFxuICBcImxpbmVzXCI6IDEsXG4gIFwibGluZSBsb29wXCI6IDIsXG4gIFwibGluZSBzdHJpcFwiOiAzLFxuICBcInRyaWFuZ2xlc1wiOiA0LFxuICBcInRyaWFuZ2xlIHN0cmlwXCI6IDUsXG4gIFwidHJpYW5nbGUgZmFuXCI6IDZcbn1cbiIsIi8vIENvbnRleHQgYW5kIGNhbnZhcyBjcmVhdGlvbiBoZWxwZXIgZnVuY3Rpb25zXG4vKmdsb2JhbHMgSFRNTEVsZW1lbnQsV2ViR0xSZW5kZXJpbmdDb250ZXh0Ki9cblxuXG52YXIgZXh0ZW5kID0gcmVxdWlyZSgnLi9leHRlbmQnKVxuXG5mdW5jdGlvbiBjcmVhdGVDYW52YXMgKGVsZW1lbnQsIG9wdGlvbnMpIHtcbiAgdmFyIGNhbnZhcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpXG4gIHZhciBhcmdzID0gZ2V0Q29udGV4dChjYW52YXMsIG9wdGlvbnMpXG5cbiAgZXh0ZW5kKGNhbnZhcy5zdHlsZSwge1xuICAgIGJvcmRlcjogMCxcbiAgICBtYXJnaW46IDAsXG4gICAgcGFkZGluZzogMCxcbiAgICB0b3A6IDAsXG4gICAgbGVmdDogMFxuICB9KVxuICBlbGVtZW50LmFwcGVuZENoaWxkKGNhbnZhcylcblxuICBpZiAoZWxlbWVudCA9PT0gZG9jdW1lbnQuYm9keSkge1xuICAgIGNhbnZhcy5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSdcbiAgICBleHRlbmQoZWxlbWVudC5zdHlsZSwge1xuICAgICAgbWFyZ2luOiAwLFxuICAgICAgcGFkZGluZzogMFxuICAgIH0pXG4gIH1cblxuICB2YXIgc2NhbGUgPSArYXJncy5vcHRpb25zLnBpeGVsUmF0aW9cbiAgZnVuY3Rpb24gcmVzaXplICgpIHtcbiAgICB2YXIgdyA9IHdpbmRvdy5pbm5lcldpZHRoXG4gICAgdmFyIGggPSB3aW5kb3cuaW5uZXJIZWlnaHRcbiAgICBpZiAoZWxlbWVudCAhPT0gZG9jdW1lbnQuYm9keSkge1xuICAgICAgdmFyIGJvdW5kcyA9IGVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KClcbiAgICAgIHcgPSBib3VuZHMucmlnaHQgLSBib3VuZHMubGVmdFxuICAgICAgaCA9IGJvdW5kcy50b3AgLSBib3VuZHMuYm90dG9tXG4gICAgfVxuICAgIGNhbnZhcy53aWR0aCA9IHNjYWxlICogd1xuICAgIGNhbnZhcy5oZWlnaHQgPSBzY2FsZSAqIGhcbiAgICBleHRlbmQoY2FudmFzLnN0eWxlLCB7XG4gICAgICB3aWR0aDogdyArICdweCcsXG4gICAgICBoZWlnaHQ6IGggKyAncHgnXG4gICAgfSlcbiAgfVxuXG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdyZXNpemUnLCByZXNpemUsIGZhbHNlKVxuXG4gIHZhciBwcmV2RGVzdHJveSA9IGFyZ3Mub3B0aW9ucy5vbkRlc3Ryb3lcbiAgYXJncy5vcHRpb25zID0gZXh0ZW5kKGV4dGVuZCh7fSwgYXJncy5vcHRpb25zKSwge1xuICAgIG9uRGVzdHJveTogZnVuY3Rpb24gKCkge1xuICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIHJlc2l6ZSlcbiAgICAgIGVsZW1lbnQucmVtb3ZlQ2hpbGQoY2FudmFzKVxuICAgICAgcHJldkRlc3Ryb3kgJiYgcHJldkRlc3Ryb3koKVxuICAgIH1cbiAgfSlcblxuICByZXNpemUoKVxuXG4gIHJldHVybiBhcmdzXG59XG5cbmZ1bmN0aW9uIGdldENvbnRleHQgKGNhbnZhcywgb3B0aW9ucykge1xuICB2YXIgZ2xPcHRpb25zID0gb3B0aW9ucy5nbE9wdGlvbnMgfHwge31cblxuICBmdW5jdGlvbiBnZXQgKG5hbWUpIHtcbiAgICB0cnkge1xuICAgICAgcmV0dXJuIGNhbnZhcy5nZXRDb250ZXh0KG5hbWUsIGdsT3B0aW9ucylcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cbiAgfVxuXG4gIHZhciBnbCA9IGdldCgnd2ViZ2wnKSB8fFxuICAgICAgICAgICBnZXQoJ2V4cGVyaW1lbnRhbC13ZWJnbCcpIHx8XG4gICAgICAgICAgIGdldCgnd2ViZ2wtZXhwZXJpbWVudGFsJylcblxuICBcblxuICByZXR1cm4ge1xuICAgIGdsOiBnbCxcbiAgICBvcHRpb25zOiBleHRlbmQoe1xuICAgICAgcGl4ZWxSYXRpbzogd2luZG93LmRldmljZVBpeGVsUmF0aW9cbiAgICB9LCBvcHRpb25zKVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcGFyc2VBcmdzIChhcmdzKSB7XG4gIGlmICh0eXBlb2YgZG9jdW1lbnQgPT09ICd1bmRlZmluZWQnIHx8XG4gICAgICB0eXBlb2YgSFRNTEVsZW1lbnQgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGdsOiBhcmdzWzBdLFxuICAgICAgb3B0aW9uczogYXJnc1sxXSB8fCB7fVxuICAgIH1cbiAgfVxuXG4gIHZhciBlbGVtZW50ID0gZG9jdW1lbnQuYm9keVxuICB2YXIgb3B0aW9ucyA9IGFyZ3NbMV0gfHwge31cblxuICBpZiAodHlwZW9mIGFyZ3NbMF0gPT09ICdzdHJpbmcnKSB7XG4gICAgZWxlbWVudCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYXJnc1swXSkgfHwgZG9jdW1lbnQuYm9keVxuICB9IGVsc2UgaWYgKHR5cGVvZiBhcmdzWzBdID09PSAnb2JqZWN0Jykge1xuICAgIGlmIChhcmdzWzBdIGluc3RhbmNlb2YgSFRNTEVsZW1lbnQpIHtcbiAgICAgIGVsZW1lbnQgPSBhcmdzWzBdXG4gICAgfSBlbHNlIGlmIChhcmdzWzBdIGluc3RhbmNlb2YgV2ViR0xSZW5kZXJpbmdDb250ZXh0KSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBnbDogYXJnc1swXSxcbiAgICAgICAgb3B0aW9uczogZXh0ZW5kKHtcbiAgICAgICAgICBwaXhlbFJhdGlvOiAxXG4gICAgICAgIH0sIG9wdGlvbnMpXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIG9wdGlvbnMgPSBhcmdzWzBdXG4gICAgfVxuICB9XG5cbiAgaWYgKGVsZW1lbnQubm9kZU5hbWUgJiYgZWxlbWVudC5ub2RlTmFtZS50b1VwcGVyQ2FzZSgpID09PSAnQ0FOVkFTJykge1xuICAgIHJldHVybiBnZXRDb250ZXh0KGVsZW1lbnQsIG9wdGlvbnMpXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGNyZWF0ZUNhbnZhcyhlbGVtZW50LCBvcHRpb25zKVxuICB9XG59XG4iLCJ2YXIgR0xfVFJJQU5HTEVTID0gNFxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBEcmF3U3RhdGUgKGdsKSB7XG4gIHZhciBwcmltaXRpdmUgPSBbIEdMX1RSSUFOR0xFUyBdXG4gIHZhciBjb3VudCA9IFsgMCBdXG4gIHZhciBvZmZzZXQgPSBbIDAgXVxuICB2YXIgaW5zdGFuY2VzID0gWyAwIF1cblxuICByZXR1cm4ge1xuICAgIHByaW1pdGl2ZTogcHJpbWl0aXZlLFxuICAgIGNvdW50OiBjb3VudCxcbiAgICBvZmZzZXQ6IG9mZnNldCxcbiAgICBpbnN0YW5jZXM6IGluc3RhbmNlc1xuICB9XG59XG4iLCJ2YXIgVkFSSUFCTEVfQ09VTlRFUiA9IDBcblxuZnVuY3Rpb24gRHluYW1pY1ZhcmlhYmxlIChpc0Z1bmMsIGRhdGEpIHtcbiAgdGhpcy5pZCA9IChWQVJJQUJMRV9DT1VOVEVSKyspXG4gIHRoaXMuZnVuYyA9IGlzRnVuY1xuICB0aGlzLmRhdGEgPSBkYXRhXG59XG5cbmZ1bmN0aW9uIGRlZmluZUR5bmFtaWMgKGRhdGEsIHBhdGgpIHtcbiAgc3dpdGNoICh0eXBlb2YgZGF0YSkge1xuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgIGNhc2UgJ251bWJlcic6XG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgIHJldHVybiBuZXcgRHluYW1pY1ZhcmlhYmxlKGZhbHNlLCBkYXRhKVxuICAgIGNhc2UgJ2Z1bmN0aW9uJzpcbiAgICAgIHJldHVybiBuZXcgRHluYW1pY1ZhcmlhYmxlKHRydWUsIGRhdGEpXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBkZWZpbmVEeW5hbWljXG4gIH1cbn1cblxuZnVuY3Rpb24gaXNEeW5hbWljICh4KSB7XG4gIHJldHVybiAodHlwZW9mIHggPT09ICdmdW5jdGlvbicgJiYgIXguX3JlZ2xUeXBlKSB8fFxuICAgICAgICAgeCBpbnN0YW5jZW9mIER5bmFtaWNWYXJpYWJsZVxufVxuXG5mdW5jdGlvbiB1bmJveCAoeCwgcGF0aCkge1xuICBpZiAoeCBpbnN0YW5jZW9mIER5bmFtaWNWYXJpYWJsZSkge1xuICAgIHJldHVybiB4XG4gIH0gZWxzZSBpZiAodHlwZW9mIHggPT09ICdmdW5jdGlvbicgJiZcbiAgICAgICAgICAgICB4ICE9PSBkZWZpbmVEeW5hbWljKSB7XG4gICAgcmV0dXJuIG5ldyBEeW5hbWljVmFyaWFibGUodHJ1ZSwgeClcbiAgfVxuICByZXR1cm4gbmV3IER5bmFtaWNWYXJpYWJsZShmYWxzZSwgcGF0aClcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGRlZmluZTogZGVmaW5lRHluYW1pYyxcbiAgaXNEeW5hbWljOiBpc0R5bmFtaWMsXG4gIHVuYm94OiB1bmJveFxufVxuIiwiXG52YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi9pcy10eXBlZC1hcnJheScpXG52YXIgaXNOREFycmF5TGlrZSA9IHJlcXVpcmUoJy4vaXMtbmRhcnJheScpXG52YXIgcHJpbVR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvcHJpbWl0aXZlcy5qc29uJylcblxudmFyIEdMX1BPSU5UUyA9IDBcbnZhciBHTF9MSU5FUyA9IDFcbnZhciBHTF9UUklBTkdMRVMgPSA0XG5cbnZhciBHTF9CWVRFID0gNTEyMFxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSA1MTIxXG52YXIgR0xfU0hPUlQgPSA1MTIyXG52YXIgR0xfVU5TSUdORURfU0hPUlQgPSA1MTIzXG52YXIgR0xfSU5UID0gNTEyNFxudmFyIEdMX1VOU0lHTkVEX0lOVCA9IDUxMjVcblxudmFyIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSID0gMzQ5NjNcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwRWxlbWVudHNTdGF0ZSAoZ2wsIGV4dGVuc2lvbnMsIGJ1ZmZlclN0YXRlKSB7XG4gIHZhciBlbGVtZW50cyA9IFsgbnVsbCBdXG5cbiAgZnVuY3Rpb24gUkVHTEVsZW1lbnRCdWZmZXIgKCkge1xuICAgIHRoaXMuYnVmZmVyID0gbnVsbFxuICAgIHRoaXMucHJpbVR5cGUgPSBHTF9UUklBTkdMRVNcbiAgICB0aGlzLnZlcnRDb3VudCA9IDBcbiAgICB0aGlzLnR5cGUgPSAwXG4gIH1cblxuICBSRUdMRWxlbWVudEJ1ZmZlci5wcm90b3R5cGUuYmluZCA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmJ1ZmZlci5iaW5kKClcbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZUVsZW1lbnRzIChvcHRpb25zKSB7XG4gICAgdmFyIGVsZW1lbnRzID0gbmV3IFJFR0xFbGVtZW50QnVmZmVyKClcbiAgICB2YXIgYnVmZmVyID0gYnVmZmVyU3RhdGUuY3JlYXRlKG51bGwsIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSLCB0cnVlKVxuICAgIGVsZW1lbnRzLmJ1ZmZlciA9IGJ1ZmZlci5fYnVmZmVyXG5cbiAgICBmdW5jdGlvbiByZWdsRWxlbWVudHMgKGlucHV0KSB7XG4gICAgICB2YXIgb3B0aW9ucyA9IGlucHV0XG4gICAgICB2YXIgZXh0MzJiaXQgPSBleHRlbnNpb25zLm9lc19lbGVtZW50X2luZGV4X3VpbnRcblxuICAgICAgLy8gVXBsb2FkIGRhdGEgdG8gdmVydGV4IGJ1ZmZlclxuICAgICAgaWYgKCFvcHRpb25zKSB7XG4gICAgICAgIGJ1ZmZlcigpXG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBvcHRpb25zID09PSAnbnVtYmVyJykge1xuICAgICAgICBidWZmZXIob3B0aW9ucylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBkYXRhID0gbnVsbFxuICAgICAgICB2YXIgdXNhZ2UgPSAnc3RhdGljJ1xuICAgICAgICB2YXIgYnl0ZUxlbmd0aCA9IDBcbiAgICAgICAgaWYgKFxuICAgICAgICAgIEFycmF5LmlzQXJyYXkob3B0aW9ucykgfHxcbiAgICAgICAgICBpc1R5cGVkQXJyYXkob3B0aW9ucykgfHxcbiAgICAgICAgICBpc05EQXJyYXlMaWtlKG9wdGlvbnMpKSB7XG4gICAgICAgICAgZGF0YSA9IG9wdGlvbnNcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBcbiAgICAgICAgICBpZiAoJ2RhdGEnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGRhdGEgPSBvcHRpb25zLmRhdGFcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCd1c2FnZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgdXNhZ2UgPSBvcHRpb25zLnVzYWdlXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgnbGVuZ3RoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBieXRlTGVuZ3RoID0gb3B0aW9ucy5sZW5ndGhcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YSkgfHxcbiAgICAgICAgICAgIChpc05EQXJyYXlMaWtlKGRhdGEpICYmIGRhdGEuZHR5cGUgPT09ICdhcnJheScpIHx8XG4gICAgICAgICAgICAndHlwZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGJ1ZmZlcih7XG4gICAgICAgICAgICB0eXBlOiBvcHRpb25zLnR5cGUgfHxcbiAgICAgICAgICAgICAgKGV4dDMyYml0XG4gICAgICAgICAgICAgICAgPyAndWludDMyJ1xuICAgICAgICAgICAgICAgIDogJ3VpbnQxNicpLFxuICAgICAgICAgICAgdXNhZ2U6IHVzYWdlLFxuICAgICAgICAgICAgZGF0YTogZGF0YSxcbiAgICAgICAgICAgIGxlbmd0aDogYnl0ZUxlbmd0aFxuICAgICAgICAgIH0pXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYnVmZmVyKHtcbiAgICAgICAgICAgIHVzYWdlOiB1c2FnZSxcbiAgICAgICAgICAgIGRhdGE6IGRhdGEsXG4gICAgICAgICAgICBsZW5ndGg6IGJ5dGVMZW5ndGhcbiAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KGRhdGEpIHx8IGlzVHlwZWRBcnJheShkYXRhKSkge1xuICAgICAgICAgIGJ1ZmZlci5kaW1lbnNpb24gPSAzXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gdHJ5IHRvIGd1ZXNzIGRlZmF1bHQgcHJpbWl0aXZlIHR5cGUgYW5kIGFyZ3VtZW50c1xuICAgICAgdmFyIHZlcnRDb3VudCA9IGVsZW1lbnRzLmJ1ZmZlci5ieXRlTGVuZ3RoXG4gICAgICB2YXIgdHlwZSA9IDBcbiAgICAgIHN3aXRjaCAoZWxlbWVudHMuYnVmZmVyLmR0eXBlKSB7XG4gICAgICAgIGNhc2UgR0xfVU5TSUdORURfQllURTpcbiAgICAgICAgY2FzZSBHTF9CWVRFOlxuICAgICAgICAgIHR5cGUgPSBHTF9VTlNJR05FRF9CWVRFXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUOlxuICAgICAgICBjYXNlIEdMX1NIT1JUOlxuICAgICAgICAgIHR5cGUgPSBHTF9VTlNJR05FRF9TSE9SVFxuICAgICAgICAgIHZlcnRDb3VudCA+Pj0gMVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9JTlQ6XG4gICAgICAgIGNhc2UgR0xfSU5UOlxuICAgICAgICAgIFxuICAgICAgICAgIHR5cGUgPSBHTF9VTlNJR05FRF9JTlRcbiAgICAgICAgICB2ZXJ0Q291bnQgPj49IDJcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgXG4gICAgICB9XG5cbiAgICAgIC8vIHRyeSB0byBndWVzcyBwcmltaXRpdmUgdHlwZSBmcm9tIGNlbGwgZGltZW5zaW9uXG4gICAgICB2YXIgcHJpbVR5cGUgPSBHTF9UUklBTkdMRVNcbiAgICAgIHZhciBkaW1lbnNpb24gPSBlbGVtZW50cy5idWZmZXIuZGltZW5zaW9uXG4gICAgICBpZiAoZGltZW5zaW9uID09PSAxKSBwcmltVHlwZSA9IEdMX1BPSU5UU1xuICAgICAgaWYgKGRpbWVuc2lvbiA9PT0gMikgcHJpbVR5cGUgPSBHTF9MSU5FU1xuICAgICAgaWYgKGRpbWVuc2lvbiA9PT0gMykgcHJpbVR5cGUgPSBHTF9UUklBTkdMRVNcblxuICAgICAgLy8gaWYgbWFudWFsIG92ZXJyaWRlIHByZXNlbnQsIHVzZSB0aGF0XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbnMgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIGlmICgncHJpbWl0aXZlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgdmFyIHByaW1pdGl2ZSA9IG9wdGlvbnMucHJpbWl0aXZlXG4gICAgICAgICAgXG4gICAgICAgICAgcHJpbVR5cGUgPSBwcmltVHlwZXNbcHJpbWl0aXZlXVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdjb3VudCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHZlcnRDb3VudCA9IG9wdGlvbnMudmVydENvdW50IHwgMFxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIHVwZGF0ZSBwcm9wZXJ0aWVzIGZvciBlbGVtZW50IGJ1ZmZlclxuICAgICAgZWxlbWVudHMucHJpbVR5cGUgPSBwcmltVHlwZVxuICAgICAgZWxlbWVudHMudmVydENvdW50ID0gdmVydENvdW50XG4gICAgICBlbGVtZW50cy50eXBlID0gdHlwZVxuXG4gICAgICByZXR1cm4gcmVnbEVsZW1lbnRzXG4gICAgfVxuXG4gICAgcmVnbEVsZW1lbnRzKG9wdGlvbnMpXG5cbiAgICByZWdsRWxlbWVudHMuX3JlZ2xUeXBlID0gJ2VsZW1lbnRzJ1xuICAgIHJlZ2xFbGVtZW50cy5fZWxlbWVudHMgPSBlbGVtZW50c1xuICAgIHJlZ2xFbGVtZW50cy5kZXN0cm95ID0gZnVuY3Rpb24gKCkge1xuICAgICAgXG4gICAgICBidWZmZXIuZGVzdHJveSgpXG4gICAgICBlbGVtZW50cy5idWZmZXIgPSBudWxsXG4gICAgfVxuXG4gICAgcmV0dXJuIHJlZ2xFbGVtZW50c1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjcmVhdGU6IGNyZWF0ZUVsZW1lbnRzLFxuICAgIGVsZW1lbnRzOiBlbGVtZW50cyxcbiAgICBnZXRFbGVtZW50czogZnVuY3Rpb24gKGVsZW1lbnRzKSB7XG4gICAgICBpZiAoZWxlbWVudHMgJiYgZWxlbWVudHMuX2VsZW1lbnRzIGluc3RhbmNlb2YgUkVHTEVsZW1lbnRCdWZmZXIpIHtcbiAgICAgICAgcmV0dXJuIGVsZW1lbnRzLl9lbGVtZW50c1xuICAgICAgfVxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGJhc2UsIG9wdHMpIHtcbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhvcHRzKVxuICBmb3IgKHZhciBpID0gMDsgaSA8IGtleXMubGVuZ3RoOyArK2kpIHtcbiAgICBiYXNlW2tleXNbaV1dID0gb3B0c1trZXlzW2ldXVxuICB9XG4gIHJldHVybiBiYXNlXG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNyZWF0ZUV4dGVuc2lvbkNhY2hlIChnbCkge1xuICB2YXIgZXh0ZW5zaW9ucyA9IHt9XG5cbiAgZnVuY3Rpb24gcmVmcmVzaEV4dGVuc2lvbnMgKCkge1xuICAgIFtcbiAgICAgICdvZXNfdGV4dHVyZV9mbG9hdCcsXG4gICAgICAnb2VzX3RleHR1cmVfZmxvYXRfbGluZWFyJyxcbiAgICAgICdvZXNfdGV4dHVyZV9oYWxmX2Zsb2F0JyxcbiAgICAgICdvZXNfdGV4dHVyZV9oYWxmX2Zsb2F0X2xpbmVhcicsXG4gICAgICAnb2VzX3N0YW5kYXJkX2Rlcml2YXRpdmVzJyxcbiAgICAgICdvZXNfZWxlbWVudF9pbmRleF91aW50JyxcbiAgICAgICdvZXNfZmJvX3JlbmRlcl9taXBtYXAnLFxuXG4gICAgICAnd2ViZ2xfZGVwdGhfdGV4dHVyZScsXG4gICAgICAnd2ViZ2xfZHJhd19idWZmZXJzJyxcbiAgICAgICd3ZWJnbF9jb2xvcl9idWZmZXJfZmxvYXQnLFxuXG4gICAgICAnZXh0X3RleHR1cmVfZmlsdGVyX2FuaXNvdHJvcGljJyxcbiAgICAgICdleHRfZnJhZ19kZXB0aCcsXG4gICAgICAnZXh0X2JsZW5kX21pbm1heCcsXG4gICAgICAnZXh0X3NoYWRlcl90ZXh0dXJlX2xvZCcsXG4gICAgICAnZXh0X2NvbG9yX2J1ZmZlcl9oYWxmX2Zsb2F0JyxcbiAgICAgICdleHRfc3JnYicsXG5cbiAgICAgICdhbmdsZV9pbnN0YW5jZWRfYXJyYXlzJyxcblxuICAgICAgJ3dlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9zM3RjJyxcbiAgICAgICd3ZWJnbF9jb21wcmVzc2VkX3RleHR1cmVfYXRjJyxcbiAgICAgICd3ZWJnbF9jb21wcmVzc2VkX3RleHR1cmVfcHZydGMnLFxuICAgICAgJ3dlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9ldGMxJ1xuICAgIF0uZm9yRWFjaChmdW5jdGlvbiAoZXh0KSB7XG4gICAgICB0cnkge1xuICAgICAgICBleHRlbnNpb25zW2V4dF0gPSBnbC5nZXRFeHRlbnNpb24oZXh0KVxuICAgICAgfSBjYXRjaCAoZSkge31cbiAgICB9KVxuICB9XG5cbiAgcmVmcmVzaEV4dGVuc2lvbnMoKVxuXG4gIHJldHVybiB7XG4gICAgZXh0ZW5zaW9uczogZXh0ZW5zaW9ucyxcbiAgICByZWZyZXNoOiByZWZyZXNoRXh0ZW5zaW9uc1xuICB9XG59XG4iLCJcbnZhciB2YWx1ZXMgPSByZXF1aXJlKCcuL3ZhbHVlcycpXG52YXIgZXh0ZW5kID0gcmVxdWlyZSgnLi9leHRlbmQnKVxuXG4vLyBXZSBzdG9yZSB0aGVzZSBjb25zdGFudHMgc28gdGhhdCB0aGUgbWluaWZpZXIgY2FuIGlubGluZSB0aGVtXG52YXIgR0xfRlJBTUVCVUZGRVIgPSAweDhENDBcbnZhciBHTF9SRU5ERVJCVUZGRVIgPSAweDhENDFcblxudmFyIEdMX1RFWFRVUkVfMkQgPSAweDBERTFcbnZhciBHTF9URVhUVVJFX0NVQkVfTUFQID0gMHg4NTEzXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YID0gMHg4NTE1XG5cbnZhciBHTF9DT0xPUl9BVFRBQ0hNRU5UMCA9IDB4OENFMFxudmFyIEdMX0RFUFRIX0FUVEFDSE1FTlQgPSAweDhEMDBcbnZhciBHTF9TVEVOQ0lMX0FUVEFDSE1FTlQgPSAweDhEMjBcbnZhciBHTF9ERVBUSF9TVEVOQ0lMX0FUVEFDSE1FTlQgPSAweDgyMUFcblxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSAweDE0MDFcbnZhciBHTF9GTE9BVCA9IDB4MTQwNlxuXG52YXIgR0xfSEFMRl9GTE9BVF9PRVMgPSAweDhENjFcblxudmFyIEdMX0FMUEhBID0gMHgxOTA2XG52YXIgR0xfTFVNSU5BTkNFID0gMHgxOTA5XG52YXIgR0xfTFVNSU5BTkNFX0FMUEhBID0gMHgxOTBBXG52YXIgR0xfUkdCID0gMHgxOTA3XG52YXIgR0xfUkdCQSA9IDB4MTkwOFxuXG52YXIgR0xfUkdCQTQgPSAweDgwNTZcbnZhciBHTF9SR0I1X0ExID0gMHg4MDU3XG52YXIgR0xfUkdCNTY1ID0gMHg4RDYyXG52YXIgR0xfREVQVEhfQ09NUE9ORU5UMTYgPSAweDgxQTVcbnZhciBHTF9TVEVOQ0lMX0lOREVYOCA9IDB4OEQ0OFxuXG52YXIgR0xfREVQVEhfQ09NUE9ORU5UID0gMHgxOTAyXG52YXIgR0xfREVQVEhfU1RFTkNJTCA9IDB4ODRGOVxuXG52YXIgR0xfU1JHQjhfQUxQSEE4X0VYVCA9IDB4OEM0M1xuXG52YXIgR0xfUkdCQTMyRl9FWFQgPSAweDg4MTRcblxudmFyIEdMX1JHQkExNkZfRVhUID0gMHg4ODFBXG52YXIgR0xfUkdCMTZGX0VYVCA9IDB4ODgxQlxuXG52YXIgR0xfRlJBTUVCVUZGRVJfQ09NUExFVEUgPSAweDhDRDVcbnZhciBHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX0FUVEFDSE1FTlQgPSAweDhDRDZcbnZhciBHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX01JU1NJTkdfQVRUQUNITUVOVCA9IDB4OENEN1xudmFyIEdMX0ZSQU1FQlVGRkVSX0lOQ09NUExFVEVfRElNRU5TSU9OUyA9IDB4OENEOVxudmFyIEdMX0ZSQU1FQlVGRkVSX1VOU1VQUE9SVEVEID0gMHg4Q0REXG5cbnZhciBHTF9CQUNLID0gMTAyOVxuXG52YXIgQkFDS19CVUZGRVIgPSBbR0xfQkFDS11cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwRkJPU3RhdGUgKFxuICBnbCxcbiAgZXh0ZW5zaW9ucyxcbiAgbGltaXRzLFxuICB0ZXh0dXJlU3RhdGUsXG4gIHJlbmRlcmJ1ZmZlclN0YXRlKSB7XG4gIHZhciBzdGF0dXNDb2RlID0ge31cbiAgc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9DT01QTEVURV0gPSAnY29tcGxldGUnXG4gIHN0YXR1c0NvZGVbR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9BVFRBQ0hNRU5UXSA9ICdpbmNvbXBsZXRlIGF0dGFjaG1lbnQnXG4gIHN0YXR1c0NvZGVbR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9ESU1FTlNJT05TXSA9ICdpbmNvbXBsZXRlIGRpbWVuc2lvbnMnXG4gIHN0YXR1c0NvZGVbR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9NSVNTSU5HX0FUVEFDSE1FTlRdID0gJ2luY29tcGxldGUsIG1pc3NpbmcgYXR0YWNobWVudCdcbiAgc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9VTlNVUFBPUlRFRF0gPSAndW5zdXBwb3J0ZWQnXG5cbiAgdmFyIGNvbG9yVGV4dHVyZUZvcm1hdHMgPSB7XG4gICAgJ3JnYmEnOiBHTF9SR0JBXG4gIH1cblxuICB2YXIgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzID0ge1xuICAgICdyZ2JhNCc6IEdMX1JHQkE0LFxuICAgICdyZ2I1NjUnOiBHTF9SR0I1NjUsXG4gICAgJ3JnYjUgYTEnOiBHTF9SR0I1X0ExXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5leHRfc3JnYikge1xuICAgIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0c1snc3JnYmEnXSA9IEdMX1NSR0I4X0FMUEhBOF9FWFRcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLmV4dF9jb2xvcl9idWZmZXJfaGFsZl9mbG9hdCkge1xuICAgIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0c1sncmdiYTE2ZiddID0gR0xfUkdCQTE2Rl9FWFRcbiAgICBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHNbJ3JnYjE2ZiddID0gR0xfUkdCMTZGX0VYVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29sb3JfYnVmZmVyX2Zsb2F0KSB7XG4gICAgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzWydyZ2JhMzJmJ10gPSBHTF9SR0JBMzJGX0VYVFxuICB9XG5cbiAgdmFyIGRlcHRoUmVuZGVyYnVmZmVyRm9ybWF0RW51bXMgPSBbR0xfREVQVEhfQ09NUE9ORU5UMTZdXG4gIHZhciBzdGVuY2lsUmVuZGVyYnVmZmVyRm9ybWF0RW51bXMgPSBbR0xfU1RFTkNJTF9JTkRFWDhdXG4gIHZhciBkZXB0aFN0ZW5jaWxSZW5kZXJidWZmZXJGb3JtYXRFbnVtcyA9IFtHTF9ERVBUSF9TVEVOQ0lMXVxuXG4gIHZhciBkZXB0aFRleHR1cmVGb3JtYXRFbnVtcyA9IFtdXG4gIHZhciBzdGVuY2lsVGV4dHVyZUZvcm1hdEVudW1zID0gW11cbiAgdmFyIGRlcHRoU3RlbmNpbFRleHR1cmVGb3JtYXRFbnVtcyA9IFtdXG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfZGVwdGhfdGV4dHVyZSkge1xuICAgIGRlcHRoVGV4dHVyZUZvcm1hdEVudW1zLnB1c2goR0xfREVQVEhfQ09NUE9ORU5UKVxuICAgIGRlcHRoU3RlbmNpbFRleHR1cmVGb3JtYXRFbnVtcy5wdXNoKEdMX0RFUFRIX1NURU5DSUwpXG4gIH1cblxuICB2YXIgY29sb3JGb3JtYXRzID0gZXh0ZW5kKGV4dGVuZCh7fSxcbiAgICBjb2xvclRleHR1cmVGb3JtYXRzKSxcbiAgICBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHMpXG5cbiAgdmFyIGNvbG9yVGV4dHVyZUZvcm1hdEVudW1zID0gdmFsdWVzKGNvbG9yVGV4dHVyZUZvcm1hdHMpXG4gIHZhciBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdEVudW1zID0gdmFsdWVzKGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0cylcblxuICB2YXIgaGlnaGVzdFByZWNpc2lvbiA9IEdMX1VOU0lHTkVEX0JZVEVcbiAgdmFyIGNvbG9yVHlwZXMgPSB7XG4gICAgJ3VpbnQ4JzogR0xfVU5TSUdORURfQllURVxuICB9XG4gIGlmIChleHRlbnNpb25zLm9lc190ZXh0dXJlX2hhbGZfZmxvYXQpIHtcbiAgICBoaWdoZXN0UHJlY2lzaW9uID0gY29sb3JUeXBlc1snaGFsZiBmbG9hdCddID0gR0xfSEFMRl9GTE9BVF9PRVNcbiAgfVxuICBpZiAoZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9mbG9hdCkge1xuICAgIGhpZ2hlc3RQcmVjaXNpb24gPSBjb2xvclR5cGVzLmZsb2F0ID0gR0xfRkxPQVRcbiAgfVxuICBjb2xvclR5cGVzLmJlc3QgPSBoaWdoZXN0UHJlY2lzaW9uXG5cbiAgdmFyIERSQVdfQlVGRkVSUyA9IChmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHJlc3VsdCA9IG5ldyBBcnJheShsaW1pdHMubWF4RHJhd2J1ZmZlcnMpXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPD0gbGltaXRzLm1heERyYXdidWZmZXJzOyArK2kpIHtcbiAgICAgIHZhciByb3cgPSByZXN1bHRbaV0gPSBuZXcgQXJyYXkoaSlcbiAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgaTsgKytqKSB7XG4gICAgICAgIHJvd1tqXSA9IEdMX0NPTE9SX0FUVEFDSE1FTlQwICsgalxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0XG4gIH0pKClcblxuICBmdW5jdGlvbiBGcmFtZWJ1ZmZlckF0dGFjaG1lbnQgKHRhcmdldCwgbGV2ZWwsIHRleHR1cmUsIHJlbmRlcmJ1ZmZlcikge1xuICAgIHRoaXMudGFyZ2V0ID0gdGFyZ2V0XG4gICAgdGhpcy5sZXZlbCA9IGxldmVsXG4gICAgdGhpcy50ZXh0dXJlID0gdGV4dHVyZVxuICAgIHRoaXMucmVuZGVyYnVmZmVyID0gcmVuZGVyYnVmZmVyXG4gIH1cblxuICBmdW5jdGlvbiBkZWNSZWYgKGF0dGFjaG1lbnQpIHtcbiAgICBpZiAoYXR0YWNobWVudCkge1xuICAgICAgaWYgKGF0dGFjaG1lbnQudGV4dHVyZSkge1xuICAgICAgICBhdHRhY2htZW50LnRleHR1cmUuX3RleHR1cmUuZGVjUmVmKClcbiAgICAgIH1cbiAgICAgIGlmIChhdHRhY2htZW50LnJlbmRlcmJ1ZmZlcikge1xuICAgICAgICBhdHRhY2htZW50LnJlbmRlcmJ1ZmZlci5fcmVuZGVyYnVmZmVyLmRlY1JlZigpXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gY2hlY2tGb3JtYXQgKGF0dGFjaG1lbnQsIHRleEZvcm1hdHMsIHJiRm9ybWF0cykge1xuICAgIGlmIChhdHRhY2htZW50LnRleHR1cmUpIHtcbiAgICAgIFxuICAgIH0gZWxzZSB7XG4gICAgICBcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBpbmNSZWZBbmRDaGVja1NoYXBlIChhdHRhY2htZW50LCBmcmFtZWJ1ZmZlcikge1xuICAgIHZhciB3aWR0aCA9IGZyYW1lYnVmZmVyLndpZHRoXG4gICAgdmFyIGhlaWdodCA9IGZyYW1lYnVmZmVyLmhlaWdodFxuICAgIGlmIChhdHRhY2htZW50LnRleHR1cmUpIHtcbiAgICAgIHZhciB0ZXh0dXJlID0gYXR0YWNobWVudC50ZXh0dXJlLl90ZXh0dXJlXG4gICAgICB2YXIgdHcgPSBNYXRoLm1heCgxLCB0ZXh0dXJlLnBhcmFtcy53aWR0aCA+PiBhdHRhY2htZW50LmxldmVsKVxuICAgICAgdmFyIHRoID0gTWF0aC5tYXgoMSwgdGV4dHVyZS5wYXJhbXMuaGVpZ2h0ID4+IGF0dGFjaG1lbnQubGV2ZWwpXG4gICAgICB3aWR0aCA9IHdpZHRoIHx8IHR3XG4gICAgICBoZWlnaHQgPSBoZWlnaHQgfHwgdGhcbiAgICAgIFxuICAgICAgXG4gICAgICB0ZXh0dXJlLnJlZkNvdW50ICs9IDFcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIHJlbmRlcmJ1ZmZlciA9IGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXJcbiAgICAgIHdpZHRoID0gd2lkdGggfHwgcmVuZGVyYnVmZmVyLndpZHRoXG4gICAgICBoZWlnaHQgPSBoZWlnaHQgfHwgcmVuZGVyYnVmZmVyLmhlaWdodFxuICAgICAgXG4gICAgICBcbiAgICAgIHJlbmRlcmJ1ZmZlci5yZWZDb3VudCArPSAxXG4gICAgfVxuICAgIGZyYW1lYnVmZmVyLndpZHRoID0gd2lkdGhcbiAgICBmcmFtZWJ1ZmZlci5oZWlnaHQgPSBoZWlnaHRcbiAgfVxuXG4gIGZ1bmN0aW9uIGF0dGFjaCAobG9jYXRpb24sIGF0dGFjaG1lbnQpIHtcbiAgICBpZiAoYXR0YWNobWVudCkge1xuICAgICAgaWYgKGF0dGFjaG1lbnQudGV4dHVyZSkge1xuICAgICAgICBnbC5mcmFtZWJ1ZmZlclRleHR1cmUyRChcbiAgICAgICAgICBHTF9GUkFNRUJVRkZFUixcbiAgICAgICAgICBsb2NhdGlvbixcbiAgICAgICAgICBhdHRhY2htZW50LnRhcmdldCxcbiAgICAgICAgICBhdHRhY2htZW50LnRleHR1cmUuX3RleHR1cmUudGV4dHVyZSxcbiAgICAgICAgICBhdHRhY2htZW50LmxldmVsKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZ2wuZnJhbWVidWZmZXJSZW5kZXJidWZmZXIoXG4gICAgICAgICAgR0xfRlJBTUVCVUZGRVIsXG4gICAgICAgICAgbG9jYXRpb24sXG4gICAgICAgICAgR0xfUkVOREVSQlVGRkVSLFxuICAgICAgICAgIGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXIucmVuZGVyYnVmZmVyKVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBnbC5mcmFtZWJ1ZmZlclRleHR1cmUyRChcbiAgICAgICAgR0xfRlJBTUVCVUZGRVIsXG4gICAgICAgIGxvY2F0aW9uLFxuICAgICAgICBHTF9URVhUVVJFXzJELFxuICAgICAgICBudWxsLFxuICAgICAgICAwKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHRyeVVwZGF0ZUF0dGFjaG1lbnQgKFxuICAgIGF0dGFjaG1lbnQsXG4gICAgaXNUZXh0dXJlLFxuICAgIGZvcm1hdCxcbiAgICB0eXBlLFxuICAgIHdpZHRoLFxuICAgIGhlaWdodCkge1xuICAgIGlmIChhdHRhY2htZW50LnRleHR1cmUpIHtcbiAgICAgIHZhciB0ZXh0dXJlID0gYXR0YWNobWVudC50ZXh0dXJlXG4gICAgICBpZiAoaXNUZXh0dXJlKSB7XG4gICAgICAgIHRleHR1cmUoe1xuICAgICAgICAgIGZvcm1hdDogZm9ybWF0LFxuICAgICAgICAgIHR5cGU6IHR5cGUsXG4gICAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICAgIGhlaWdodDogaGVpZ2h0XG4gICAgICAgIH0pXG4gICAgICAgIHRleHR1cmUuX3RleHR1cmUucmVmQ291bnQgKz0gMVxuICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgcmVuZGVyYnVmZmVyID0gYXR0YWNobWVudC5yZW5kZXJidWZmZXJcbiAgICAgIGlmICghaXNUZXh0dXJlKSB7XG4gICAgICAgIHJlbmRlcmJ1ZmZlcih7XG4gICAgICAgICAgZm9ybWF0OiBmb3JtYXQsXG4gICAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICAgIGhlaWdodDogaGVpZ2h0XG4gICAgICAgIH0pXG4gICAgICAgIHJlbmRlcmJ1ZmZlci5fcmVuZGVyYnVmZmVyLnJlZkNvdW50ICs9IDFcbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgIH1cbiAgICB9XG4gICAgZGVjUmVmKGF0dGFjaG1lbnQpXG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZUF0dGFjaG1lbnQgKGF0dGFjaG1lbnQpIHtcbiAgICB2YXIgdGFyZ2V0ID0gR0xfVEVYVFVSRV8yRFxuICAgIHZhciBsZXZlbCA9IDBcbiAgICB2YXIgdGV4dHVyZSA9IG51bGxcbiAgICB2YXIgcmVuZGVyYnVmZmVyID0gbnVsbFxuXG4gICAgdmFyIGRhdGEgPSBhdHRhY2htZW50XG4gICAgaWYgKHR5cGVvZiBhdHRhY2htZW50ID09PSAnb2JqZWN0Jykge1xuICAgICAgZGF0YSA9IGF0dGFjaG1lbnQuZGF0YVxuICAgICAgaWYgKCdsZXZlbCcgaW4gYXR0YWNobWVudCkge1xuICAgICAgICBsZXZlbCA9IGF0dGFjaG1lbnQubGV2ZWwgfCAwXG4gICAgICB9XG4gICAgICBpZiAoJ3RhcmdldCcgaW4gYXR0YWNobWVudCkge1xuICAgICAgICB0YXJnZXQgPSBhdHRhY2htZW50LnRhcmdldCB8IDBcbiAgICAgIH1cbiAgICB9XG5cbiAgICBcblxuICAgIHZhciB0eXBlID0gYXR0YWNobWVudC5fcmVnbFR5cGVcbiAgICBpZiAodHlwZSA9PT0gJ3RleHR1cmUnKSB7XG4gICAgICB0ZXh0dXJlID0gYXR0YWNobWVudFxuICAgICAgaWYgKHRleHR1cmUuX3RleHR1cmUudGFyZ2V0ID09PSBHTF9URVhUVVJFX0NVQkVfTUFQKSB7XG4gICAgICAgIFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgXG4gICAgICB9XG4gICAgICAvLyBUT0RPIGNoZWNrIG1pcGxldmVsIGlzIGNvbnNpc3RlbnRcbiAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICdyZW5kZXJidWZmZXInKSB7XG4gICAgICByZW5kZXJidWZmZXIgPSBhdHRhY2htZW50XG4gICAgICB0YXJnZXQgPSBHTF9SRU5ERVJCVUZGRVJcbiAgICAgIGxldmVsID0gMFxuICAgIH0gZWxzZSB7XG4gICAgICBcbiAgICB9XG5cbiAgICByZXR1cm4gbmV3IEZyYW1lYnVmZmVyQXR0YWNobWVudCh0YXJnZXQsIGxldmVsLCB0ZXh0dXJlLCByZW5kZXJidWZmZXIpXG4gIH1cblxuICBmdW5jdGlvbiB1bndyYXBBdHRhY2htZW50IChhdHRhY2htZW50KSB7XG4gICAgcmV0dXJuIGF0dGFjaG1lbnQgJiYgKGF0dGFjaG1lbnQudGV4dHVyZSB8fCBhdHRhY2htZW50LnJlbmRlcmJ1ZmZlcilcbiAgfVxuXG4gIHZhciBmcmFtZWJ1ZmZlckNvdW50ID0gMFxuICB2YXIgZnJhbWVidWZmZXJTZXQgPSB7fVxuICB2YXIgZnJhbWVidWZmZXJTdGFjayA9IFtudWxsXVxuICB2YXIgZnJhbWVidWZmZXJEaXJ0eSA9IHRydWVcblxuICBmdW5jdGlvbiBSRUdMRnJhbWVidWZmZXIgKCkge1xuICAgIHRoaXMuaWQgPSBmcmFtZWJ1ZmZlckNvdW50KytcbiAgICBmcmFtZWJ1ZmZlclNldFt0aGlzLmlkXSA9IHRoaXNcblxuICAgIHRoaXMuZnJhbWVidWZmZXIgPSBudWxsXG4gICAgdGhpcy53aWR0aCA9IDBcbiAgICB0aGlzLmhlaWdodCA9IDBcblxuICAgIHRoaXMuY29sb3JBdHRhY2htZW50cyA9IFtdXG4gICAgdGhpcy5kZXB0aEF0dGFjaG1lbnQgPSBudWxsXG4gICAgdGhpcy5zdGVuY2lsQXR0YWNobWVudCA9IG51bGxcbiAgICB0aGlzLmRlcHRoU3RlbmNpbEF0dGFjaG1lbnQgPSBudWxsXG5cbiAgICB0aGlzLm93bnNDb2xvciA9IGZhbHNlXG4gICAgdGhpcy5vd25zRGVwdGhTdGVuY2lsID0gZmFsc2VcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlZnJlc2ggKGZyYW1lYnVmZmVyKSB7XG4gICAgaWYgKCFnbC5pc0ZyYW1lYnVmZmVyKGZyYW1lYnVmZmVyLmZyYW1lYnVmZmVyKSkge1xuICAgICAgZnJhbWVidWZmZXIuZnJhbWVidWZmZXIgPSBnbC5jcmVhdGVGcmFtZWJ1ZmZlcigpXG4gICAgfVxuICAgIGZyYW1lYnVmZmVyRGlydHkgPSB0cnVlXG4gICAgZ2wuYmluZEZyYW1lYnVmZmVyKEdMX0ZSQU1FQlVGRkVSLCBmcmFtZWJ1ZmZlci5mcmFtZWJ1ZmZlcilcblxuICAgIHZhciBjb2xvckF0dGFjaG1lbnRzID0gZnJhbWVidWZmZXIuY29sb3JBdHRhY2htZW50c1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY29sb3JBdHRhY2htZW50cy5sZW5ndGg7ICsraSkge1xuICAgICAgYXR0YWNoKEdMX0NPTE9SX0FUVEFDSE1FTlQwICsgaSwgY29sb3JBdHRhY2htZW50c1tpXSlcbiAgICB9XG4gICAgZm9yIChpID0gY29sb3JBdHRhY2htZW50cy5sZW5ndGg7IGkgPCBsaW1pdHMubWF4Q29sb3JBdHRhY2htZW50czsgKytpKSB7XG4gICAgICBhdHRhY2goR0xfQ09MT1JfQVRUQUNITUVOVDAgKyBpLCBudWxsKVxuICAgIH1cbiAgICBhdHRhY2goR0xfREVQVEhfQVRUQUNITUVOVCwgZnJhbWVidWZmZXIuZGVwdGhBdHRhY2htZW50KVxuICAgIGF0dGFjaChHTF9TVEVOQ0lMX0FUVEFDSE1FTlQsIGZyYW1lYnVmZmVyLnN0ZW5jaWxBdHRhY2htZW50KVxuICAgIGF0dGFjaChHTF9ERVBUSF9TVEVOQ0lMX0FUVEFDSE1FTlQsIGZyYW1lYnVmZmVyLmRlcHRoU3RlbmNpbEF0dGFjaG1lbnQpXG5cbiAgICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9kcmF3X2J1ZmZlcnMpIHtcbiAgICAgIGV4dGVuc2lvbnMud2ViZ2xfZHJhd19idWZmZXJzLmRyYXdCdWZmZXJzV0VCR0woXG4gICAgICAgIERSQVdfQlVGRkVSU1tjb2xvckF0dGFjaG1lbnRzLmxlbmd0aF0pXG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgc3RhdHVzIGNvZGVcbiAgICB2YXIgc3RhdHVzID0gZ2wuY2hlY2tGcmFtZWJ1ZmZlclN0YXR1cyhHTF9GUkFNRUJVRkZFUilcbiAgICBpZiAoc3RhdHVzICE9PSBHTF9GUkFNRUJVRkZFUl9DT01QTEVURSkge1xuICAgICAgXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZGVjRkJPUmVmcyAoZnJhbWVidWZmZXIpIHtcbiAgICBmcmFtZWJ1ZmZlci5jb2xvckF0dGFjaG1lbnRzLmZvckVhY2goZGVjUmVmKVxuICAgIGRlY1JlZihmcmFtZWJ1ZmZlci5kZXB0aEF0dGFjaG1lbnQpXG4gICAgZGVjUmVmKGZyYW1lYnVmZmVyLnN0ZW5jaWxBdHRhY2htZW50KVxuICAgIGRlY1JlZihmcmFtZWJ1ZmZlci5kZXB0aFN0ZW5jaWxBdHRhY2htZW50KVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSAoZnJhbWVidWZmZXIpIHtcbiAgICB2YXIgaGFuZGxlID0gZnJhbWVidWZmZXIuZnJhbWVidWZmZXJcbiAgICBcbiAgICBpZiAoZ2wuaXNGcmFtZWJ1ZmZlcihoYW5kbGUpKSB7XG4gICAgICBnbC5kZWxldGVGcmFtZWJ1ZmZlcihoYW5kbGUpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlRkJPIChvcHRpb25zKSB7XG4gICAgdmFyIGZyYW1lYnVmZmVyID0gbmV3IFJFR0xGcmFtZWJ1ZmZlcigpXG5cbiAgICBmdW5jdGlvbiByZWdsRnJhbWVidWZmZXIgKGlucHV0KSB7XG4gICAgICB2YXIgaVxuICAgICAgdmFyIG9wdGlvbnMgPSBpbnB1dCB8fCB7fVxuXG4gICAgICB2YXIgZXh0RHJhd0J1ZmZlcnMgPSBleHRlbnNpb25zLndlYmdsX2RyYXdfYnVmZmVyc1xuXG4gICAgICB2YXIgd2lkdGggPSAwXG4gICAgICB2YXIgaGVpZ2h0ID0gMFxuICAgICAgaWYgKCdzaGFwZScgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgc2hhcGUgPSBvcHRpb25zLnNoYXBlXG4gICAgICAgIFxuICAgICAgICB3aWR0aCA9IHNoYXBlWzBdXG4gICAgICAgIGhlaWdodCA9IHNoYXBlWzFdXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoJ3JhZGl1cycgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHdpZHRoID0gaGVpZ2h0ID0gb3B0aW9ucy5yYWRpdXNcbiAgICAgICAgfVxuICAgICAgICBpZiAoJ3dpZHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgd2lkdGggPSBvcHRpb25zLndpZHRoXG4gICAgICAgIH1cbiAgICAgICAgaWYgKCdoZWlnaHQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBoZWlnaHQgPSBvcHRpb25zLmhlaWdodFxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIGNvbG9yVHlwZSwgbnVtQ29sb3JzXG4gICAgICB2YXIgY29sb3JCdWZmZXJzID0gbnVsbFxuICAgICAgdmFyIG93bnNDb2xvciA9IGZhbHNlXG4gICAgICBpZiAoJ2NvbG9yQnVmZmVycycgaW4gb3B0aW9ucyB8fCAnY29sb3JCdWZmZXInIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGNvbG9ySW5wdXRzID0gb3B0aW9ucy5jb2xvckJ1ZmZlcnMgfHwgb3B0aW9ucy5jb2xvckJ1ZmZlclxuICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkoY29sb3JJbnB1dHMpKSB7XG4gICAgICAgICAgY29sb3JJbnB1dHMgPSBbY29sb3JJbnB1dHNdXG4gICAgICAgIH1cblxuICAgICAgICBmcmFtZWJ1ZmZlci53aWR0aCA9IHdpZHRoXG4gICAgICAgIGZyYW1lYnVmZmVyLmhlaWdodCA9IGhlaWdodFxuXG4gICAgICAgIGlmIChjb2xvcklucHV0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgXG4gICAgICAgIH1cbiAgICAgICAgXG5cbiAgICAgICAgLy8gV3JhcCBjb2xvciBhdHRhY2htZW50c1xuICAgICAgICBjb2xvckJ1ZmZlcnMgPSBjb2xvcklucHV0cy5tYXAocGFyc2VBdHRhY2htZW50KVxuXG4gICAgICAgIC8vIENoZWNrIGhlYWQgbm9kZVxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY29sb3JCdWZmZXJzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgdmFyIGNvbG9yQXR0YWNobWVudCA9IGNvbG9yQnVmZmVyc1tpXVxuICAgICAgICAgIGNoZWNrRm9ybWF0KFxuICAgICAgICAgICAgY29sb3JBdHRhY2htZW50LFxuICAgICAgICAgICAgY29sb3JUZXh0dXJlRm9ybWF0RW51bXMsXG4gICAgICAgICAgICBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdEVudW1zKVxuICAgICAgICAgIGluY1JlZkFuZENoZWNrU2hhcGUoXG4gICAgICAgICAgICBjb2xvckF0dGFjaG1lbnQsXG4gICAgICAgICAgICBmcmFtZWJ1ZmZlcilcbiAgICAgICAgfVxuXG4gICAgICAgIHdpZHRoID0gZnJhbWVidWZmZXIud2lkdGhcbiAgICAgICAgaGVpZ2h0ID0gZnJhbWVidWZmZXIuaGVpZ2h0XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgY29sb3JUZXh0dXJlID0gdHJ1ZVxuICAgICAgICB2YXIgY29sb3JGb3JtYXQgPSAncmdiYSdcbiAgICAgICAgdmFyIGNvbG9yVHlwZSA9ICd1aW50OCdcbiAgICAgICAgdmFyIGNvbG9yQ291bnQgPSAxXG4gICAgICAgIG93bnNDb2xvciA9IHRydWVcblxuICAgICAgICBmcmFtZWJ1ZmZlci53aWR0aCA9IHdpZHRoIHx8IGdsLmRyYXdpbmdCdWZmZXJXaWR0aFxuICAgICAgICBmcmFtZWJ1ZmZlci5oZWlnaHQgPSBoZWlnaHQgfHwgZ2wuZHJhd2luZ0J1ZmZlckhlaWdodFxuXG4gICAgICAgIGlmICgnZm9ybWF0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgY29sb3JGb3JtYXQgPSBvcHRpb25zLmZvcm1hdFxuICAgICAgICAgIFxuICAgICAgICAgIGNvbG9yVGV4dHVyZSA9IGNvbG9yRm9ybWF0IGluIGNvbG9yVGV4dHVyZUZvcm1hdHNcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgndHlwZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgIFxuICAgICAgICAgIGNvbG9yVHlwZSA9IG9wdGlvbnMudHlwZVxuICAgICAgICAgIFxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdjb2xvckNvdW50JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgY29sb3JDb3VudCA9IG9wdGlvbnMuY29sb3JDb3VudCB8IDBcbiAgICAgICAgICBcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFJldXNlIGNvbG9yIGJ1ZmZlciBhcnJheSBpZiB3ZSBvd24gaXRcbiAgICAgICAgaWYgKGZyYW1lYnVmZmVyLm93bnNDb2xvcikge1xuICAgICAgICAgIGNvbG9yQnVmZmVycyA9IGZyYW1lYnVmZmVyLmNvbG9yQXR0YWNobWVudHNcbiAgICAgICAgICB3aGlsZSAoY29sb3JCdWZmZXJzLmxlbmd0aCA+IGNvbG9yQ291bnQpIHtcbiAgICAgICAgICAgIGRlY1JlZihjb2xvckJ1ZmZlcnMucG9wKCkpXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbG9yQnVmZmVycyA9IFtdXG4gICAgICAgIH1cblxuICAgICAgICAvLyB1cGRhdGUgYnVmZmVycyBpbiBwbGFjZSwgcmVtb3ZlIGluY29tcGF0aWJsZSBidWZmZXJzXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xvckJ1ZmZlcnMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICBpZiAoIXRyeVVwZGF0ZUF0dGFjaG1lbnQoXG4gICAgICAgICAgICAgIGNvbG9yQnVmZmVyc1tpXSxcbiAgICAgICAgICAgICAgY29sb3JUZXh0dXJlLFxuICAgICAgICAgICAgICBjb2xvckZvcm1hdCxcbiAgICAgICAgICAgICAgY29sb3JUeXBlLFxuICAgICAgICAgICAgICB3aWR0aCxcbiAgICAgICAgICAgICAgaGVpZ2h0KSkge1xuICAgICAgICAgICAgY29sb3JCdWZmZXJzW2ktLV0gPSBjb2xvckJ1ZmZlcnNbY29sb3JCdWZmZXJzLmxlbmd0aCAtIDFdXG4gICAgICAgICAgICBjb2xvckJ1ZmZlcnMucG9wKClcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBUaGVuIGFwcGVuZCBuZXcgYnVmZmVyc1xuICAgICAgICB3aGlsZSAoY29sb3JCdWZmZXJzLmxlbmd0aCA8IGNvbG9yQ291bnQpIHtcbiAgICAgICAgICBpZiAoY29sb3JUZXh0dXJlKSB7XG4gICAgICAgICAgICBjb2xvckJ1ZmZlcnMucHVzaChuZXcgRnJhbWVidWZmZXJBdHRhY2htZW50KFxuICAgICAgICAgICAgICBHTF9URVhUVVJFXzJELFxuICAgICAgICAgICAgICAwLFxuICAgICAgICAgICAgICB0ZXh0dXJlU3RhdGUuY3JlYXRlKHtcbiAgICAgICAgICAgICAgICBmb3JtYXQ6IGNvbG9yRm9ybWF0LFxuICAgICAgICAgICAgICAgIHR5cGU6IGNvbG9yVHlwZSxcbiAgICAgICAgICAgICAgICB3aWR0aDogd2lkdGgsXG4gICAgICAgICAgICAgICAgaGVpZ2h0OiBoZWlnaHRcbiAgICAgICAgICAgICAgfSwgR0xfVEVYVFVSRV8yRCksXG4gICAgICAgICAgICAgIG51bGwpKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb2xvckJ1ZmZlcnMucHVzaChuZXcgRnJhbWVidWZmZXJBdHRhY2htZW50KFxuICAgICAgICAgICAgICBHTF9SRU5ERVJCVUZGRVIsXG4gICAgICAgICAgICAgIDAsXG4gICAgICAgICAgICAgIG51bGwsXG4gICAgICAgICAgICAgIHJlbmRlcmJ1ZmZlclN0YXRlLmNyZWF0ZSh7XG4gICAgICAgICAgICAgICAgZm9ybWF0OiBjb2xvckZvcm1hdCxcbiAgICAgICAgICAgICAgICB3aWR0aDogd2lkdGgsXG4gICAgICAgICAgICAgICAgaGVpZ2h0OiBoZWlnaHRcbiAgICAgICAgICAgICAgfSkpKVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBcblxuICAgICAgZnJhbWVidWZmZXIud2lkdGggPSB3aWR0aFxuICAgICAgZnJhbWVidWZmZXIuaGVpZ2h0ID0gaGVpZ2h0XG5cbiAgICAgIHZhciBkZXB0aEJ1ZmZlciA9IG51bGxcbiAgICAgIHZhciBzdGVuY2lsQnVmZmVyID0gbnVsbFxuICAgICAgdmFyIGRlcHRoU3RlbmNpbEJ1ZmZlciA9IG51bGxcbiAgICAgIHZhciBvd25zRGVwdGhTdGVuY2lsID0gZmFsc2VcbiAgICAgIHZhciBkZXB0aFN0ZW5jaWxDb3VudCA9IDBcblxuICAgICAgaWYgKCdkZXB0aEJ1ZmZlcicgaW4gb3B0aW9ucykge1xuICAgICAgICBkZXB0aEJ1ZmZlciA9IHBhcnNlQXR0YWNobWVudChvcHRpb25zLmRlcHRoQnVmZmVyKVxuICAgICAgICBjaGVja0Zvcm1hdChcbiAgICAgICAgICBkZXB0aEJ1ZmZlcixcbiAgICAgICAgICBkZXB0aFRleHR1cmVGb3JtYXRFbnVtcyxcbiAgICAgICAgICBkZXB0aFJlbmRlcmJ1ZmZlckZvcm1hdEVudW1zKVxuICAgICAgICBkZXB0aFN0ZW5jaWxDb3VudCArPSAxXG4gICAgICB9XG4gICAgICBpZiAoJ3N0ZW5jaWxCdWZmZXInIGluIG9wdGlvbnMpIHtcbiAgICAgICAgc3RlbmNpbEJ1ZmZlciA9IHBhcnNlQXR0YWNobWVudChvcHRpb25zLnN0ZW5jaWxCdWZmZXIpXG4gICAgICAgIGNoZWNrRm9ybWF0KFxuICAgICAgICAgIHN0ZW5jaWxCdWZmZXIsXG4gICAgICAgICAgc3RlbmNpbFRleHR1cmVGb3JtYXRFbnVtcyxcbiAgICAgICAgICBzdGVuY2lsUmVuZGVyYnVmZmVyRm9ybWF0RW51bXMpXG4gICAgICAgIGRlcHRoU3RlbmNpbENvdW50ICs9IDFcbiAgICAgIH1cbiAgICAgIGlmICgnZGVwdGhTdGVuY2lsQnVmZmVyJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIGRlcHRoU3RlbmNpbEJ1ZmZlciA9IHBhcnNlQXR0YWNobWVudChvcHRpb25zLmRlcHRoU3RlbmNpbEJ1ZmZlcilcbiAgICAgICAgY2hlY2tGb3JtYXQoXG4gICAgICAgICAgZGVwdGhTdGVuY2lsQnVmZmVyLFxuICAgICAgICAgIGRlcHRoU3RlbmNpbFRleHR1cmVGb3JtYXRFbnVtcyxcbiAgICAgICAgICBkZXB0aFN0ZW5jaWxSZW5kZXJidWZmZXJGb3JtYXRFbnVtcylcbiAgICAgICAgZGVwdGhTdGVuY2lsQ291bnQgKz0gMVxuICAgICAgfVxuXG4gICAgICBpZiAoIShkZXB0aEJ1ZmZlciB8fCBzdGVuY2lsQnVmZmVyIHx8IGRlcHRoU3RlbmNpbEJ1ZmZlcikpIHtcbiAgICAgICAgdmFyIGRlcHRoID0gdHJ1ZVxuICAgICAgICB2YXIgc3RlbmNpbCA9IGZhbHNlXG4gICAgICAgIHZhciB1c2VUZXh0dXJlID0gZmFsc2VcblxuICAgICAgICBpZiAoJ2RlcHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgZGVwdGggPSAhIW9wdGlvbnMuZGVwdGhcbiAgICAgICAgfVxuICAgICAgICBpZiAoJ3N0ZW5jaWwnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBzdGVuY2lsID0gISFvcHRpb25zLnN0ZW5jaWxcbiAgICAgICAgfVxuICAgICAgICBpZiAoJ2RlcHRoVGV4dHVyZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHVzZVRleHR1cmUgPSAhIW9wdGlvbnMuZGVwdGhUZXh0dXJlXG4gICAgICAgIH1cblxuICAgICAgICB2YXIgY3VyRGVwdGhTdGVuY2lsID1cbiAgICAgICAgICBmcmFtZWJ1ZmZlci5kZXB0aEF0dGFjaG1lbnQgfHxcbiAgICAgICAgICBmcmFtZWJ1ZmZlci5zdGVuY2lsQXR0YWNobWVudCB8fFxuICAgICAgICAgIGZyYW1lYnVmZmVyLmRlcHRoU3RlbmNpbEF0dGFjaG1lbnRcbiAgICAgICAgdmFyIG5leHREZXB0aFN0ZW5jaWwgPSBudWxsXG5cbiAgICAgICAgaWYgKGRlcHRoIHx8IHN0ZW5jaWwpIHtcbiAgICAgICAgICBvd25zRGVwdGhTdGVuY2lsID0gdHJ1ZVxuXG4gICAgICAgICAgaWYgKHVzZVRleHR1cmUpIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdmFyIGRlcHRoVGV4dHVyZUZvcm1hdFxuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAoc3RlbmNpbCkge1xuICAgICAgICAgICAgICBkZXB0aFRleHR1cmVGb3JtYXQgPSAnZGVwdGggc3RlbmNpbCdcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGRlcHRoVGV4dHVyZUZvcm1hdCA9ICdkZXB0aCdcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChmcmFtZWJ1ZmZlci5vd25zRGVwdGhTdGVuY2lsICYmIGN1ckRlcHRoU3RlbmNpbC50ZXh0dXJlKSB7XG4gICAgICAgICAgICAgIGN1ckRlcHRoU3RlbmNpbC50ZXh0dXJlKHtcbiAgICAgICAgICAgICAgICBmb3JtYXQ6IGRlcHRoVGV4dHVyZUZvcm1hdCxcbiAgICAgICAgICAgICAgICB3aWR0aDogd2lkdGgsXG4gICAgICAgICAgICAgICAgaGVpZ2h0OiBoZWlnaHRcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgY3VyRGVwdGhTdGVuY2lsLnRleHR1cmUuX3RleHR1cmUucmVmQ291bnQgKz0gMVxuICAgICAgICAgICAgICBuZXh0RGVwdGhTdGVuY2lsID0gY3VyRGVwdGhTdGVuY2lsXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBuZXh0RGVwdGhTdGVuY2lsID0gbmV3IEZyYW1lYnVmZmVyQXR0YWNobWVudChcbiAgICAgICAgICAgICAgICBHTF9URVhUVVJFXzJELFxuICAgICAgICAgICAgICAgIDAsXG4gICAgICAgICAgICAgICAgdGV4dHVyZVN0YXRlLmNyZWF0ZSh7XG4gICAgICAgICAgICAgICAgICBmb3JtYXQ6IGRlcHRoVGV4dHVyZUZvcm1hdCxcbiAgICAgICAgICAgICAgICAgIHdpZHRoOiB3aWR0aCxcbiAgICAgICAgICAgICAgICAgIGhlaWdodDogaGVpZ2h0XG4gICAgICAgICAgICAgICAgfSwgR0xfVEVYVFVSRV8yRCksXG4gICAgICAgICAgICAgICAgbnVsbClcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFyIGRlcHRoUmVuZGVyYnVmZmVyRm9ybWF0XG4gICAgICAgICAgICBpZiAoZGVwdGgpIHtcbiAgICAgICAgICAgICAgaWYgKHN0ZW5jaWwpIHtcbiAgICAgICAgICAgICAgICBkZXB0aFJlbmRlcmJ1ZmZlckZvcm1hdCA9ICdkZXB0aCBzdGVuY2lsJ1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGRlcHRoUmVuZGVyYnVmZmVyRm9ybWF0ID0gJ2RlcHRoJ1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBkZXB0aFJlbmRlcmJ1ZmZlckZvcm1hdCA9ICdzdGVuY2lsJ1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGZyYW1lYnVmZmVyLm93bnNEZXB0aFN0ZW5jaWwgJiYgY3VyRGVwdGhTdGVuY2lsLnJlbmRlcmJ1ZmZlcikge1xuICAgICAgICAgICAgICBjdXJEZXB0aFN0ZW5jaWwucmVuZGVyYnVmZmVyKHtcbiAgICAgICAgICAgICAgICBmb3JtYXQ6IGRlcHRoUmVuZGVyYnVmZmVyRm9ybWF0LFxuICAgICAgICAgICAgICAgIHdpZHRoOiB3aWR0aCxcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IGhlaWdodFxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICBjdXJEZXB0aFN0ZW5jaWwucmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXIucmVmQ291bnQgKz0gMVxuICAgICAgICAgICAgICBuZXh0RGVwdGhTdGVuY2lsID0gY3VyRGVwdGhTdGVuY2lsXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBuZXh0RGVwdGhTdGVuY2lsID0gbmV3IEZyYW1lYnVmZmVyQXR0YWNobWVudChcbiAgICAgICAgICAgICAgICBHTF9SRU5ERVJCVUZGRVIsXG4gICAgICAgICAgICAgICAgMCxcbiAgICAgICAgICAgICAgICBudWxsLFxuICAgICAgICAgICAgICAgIHJlbmRlcmJ1ZmZlclN0YXRlLmNyZWF0ZSh7XG4gICAgICAgICAgICAgICAgICBmb3JtYXQ6IGRlcHRoUmVuZGVyYnVmZmVyRm9ybWF0LFxuICAgICAgICAgICAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICAgICAgICAgICAgaGVpZ2h0OiBoZWlnaHRcbiAgICAgICAgICAgICAgICB9KSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoZGVwdGgpIHtcbiAgICAgICAgICAgIGlmIChzdGVuY2lsKSB7XG4gICAgICAgICAgICAgIGRlcHRoU3RlbmNpbEJ1ZmZlciA9IG5leHREZXB0aFN0ZW5jaWxcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGRlcHRoQnVmZmVyID0gbmV4dERlcHRoU3RlbmNpbFxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzdGVuY2lsQnVmZmVyID0gbmV4dERlcHRoU3RlbmNpbFxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgXG5cbiAgICAgICAgaW5jUmVmQW5kQ2hlY2tTaGFwZShcbiAgICAgICAgICBkZXB0aEJ1ZmZlciB8fFxuICAgICAgICAgIHN0ZW5jaWxCdWZmZXIgfHxcbiAgICAgICAgICBkZXB0aFN0ZW5jaWxCdWZmZXIsXG4gICAgICAgICAgZnJhbWVidWZmZXIpXG4gICAgICB9XG5cbiAgICAgIGRlY0ZCT1JlZnMoZnJhbWVidWZmZXIpXG5cbiAgICAgIGZyYW1lYnVmZmVyLmNvbG9yQXR0YWNobWVudHMgPSBjb2xvckJ1ZmZlcnNcbiAgICAgIGZyYW1lYnVmZmVyLmRlcHRoQXR0YWNobWVudCA9IGRlcHRoQnVmZmVyXG4gICAgICBmcmFtZWJ1ZmZlci5zdGVuY2lsQXR0YWNobWVudCA9IHN0ZW5jaWxCdWZmZXJcbiAgICAgIGZyYW1lYnVmZmVyLmRlcHRoU3RlbmNpbEF0dGFjaG1lbnQgPSBkZXB0aFN0ZW5jaWxCdWZmZXJcbiAgICAgIGZyYW1lYnVmZmVyLm93bnNDb2xvciA9IG93bnNDb2xvclxuICAgICAgZnJhbWVidWZmZXIub3duc0RlcHRoU3RlbmNpbCA9IG93bnNEZXB0aFN0ZW5jaWxcblxuICAgICAgcmVnbEZyYW1lYnVmZmVyLmNvbG9yID0gY29sb3JCdWZmZXJzLm1hcCh1bndyYXBBdHRhY2htZW50KVxuICAgICAgcmVnbEZyYW1lYnVmZmVyLmRlcHRoID0gdW53cmFwQXR0YWNobWVudChkZXB0aEJ1ZmZlcilcbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci5zdGVuY2lsID0gdW53cmFwQXR0YWNobWVudChzdGVuY2lsQnVmZmVyKVxuICAgICAgcmVnbEZyYW1lYnVmZmVyLmRlcHRoU3RlbmNpbCA9IHVud3JhcEF0dGFjaG1lbnQoZGVwdGhTdGVuY2lsQnVmZmVyKVxuXG4gICAgICByZWZyZXNoKGZyYW1lYnVmZmVyKVxuXG4gICAgICByZWdsRnJhbWVidWZmZXIud2lkdGggPSBmcmFtZWJ1ZmZlci53aWR0aFxuICAgICAgcmVnbEZyYW1lYnVmZmVyLmhlaWdodCA9IGZyYW1lYnVmZmVyLmhlaWdodFxuXG4gICAgICByZXR1cm4gcmVnbEZyYW1lYnVmZmVyXG4gICAgfVxuXG4gICAgcmVnbEZyYW1lYnVmZmVyKG9wdGlvbnMpXG5cbiAgICByZWdsRnJhbWVidWZmZXIuX3JlZ2xUeXBlID0gJ2ZyYW1lYnVmZmVyJ1xuICAgIHJlZ2xGcmFtZWJ1ZmZlci5fZnJhbWVidWZmZXIgPSBmcmFtZWJ1ZmZlclxuICAgIHJlZ2xGcmFtZWJ1ZmZlci5fZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIGRlc3Ryb3koZnJhbWVidWZmZXIpXG4gICAgfVxuXG4gICAgcmV0dXJuIHJlZ2xGcmFtZWJ1ZmZlclxuICB9XG5cbiAgZnVuY3Rpb24gcmVmcmVzaENhY2hlICgpIHtcbiAgICB2YWx1ZXMoZnJhbWVidWZmZXJTZXQpLmZvckVhY2gocmVmcmVzaClcbiAgfVxuXG4gIGZ1bmN0aW9uIGNsZWFyQ2FjaGUgKCkge1xuICAgIHZhbHVlcyhmcmFtZWJ1ZmZlclNldCkuZm9yRWFjaChkZXN0cm95KVxuICB9XG5cbiAgZnVuY3Rpb24gcG9sbCAoKSB7XG4gICAgaWYgKGZyYW1lYnVmZmVyRGlydHkpIHtcbiAgICAgIHZhciB0b3AgPSBmcmFtZWJ1ZmZlclN0YWNrW2ZyYW1lYnVmZmVyU3RhY2subGVuZ3RoIC0gMV1cbiAgICAgIHZhciBleHRfZHJhd2J1ZmZlcnMgPSBleHRlbnNpb25zLndlYmdsX2RyYXdfYnVmZmVyc1xuXG4gICAgICBpZiAodG9wKSB7XG4gICAgICAgIGdsLmJpbmRGcmFtZWJ1ZmZlcihHTF9GUkFNRUJVRkZFUiwgdG9wLmZyYW1lYnVmZmVyKVxuICAgICAgICBpZiAoZXh0X2RyYXdidWZmZXJzKSB7XG4gICAgICAgICAgZXh0X2RyYXdidWZmZXJzLmRyYXdCdWZmZXJzV0VCR0woRFJBV19CVUZGRVJTW3RvcC5jb2xvckF0dGFjaG1lbnRzLmxlbmd0aF0pXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGdsLmJpbmRGcmFtZWJ1ZmZlcihHTF9GUkFNRUJVRkZFUiwgbnVsbClcbiAgICAgICAgaWYgKGV4dF9kcmF3YnVmZmVycykge1xuICAgICAgICAgIGV4dF9kcmF3YnVmZmVycy5kcmF3QnVmZmVyc1dFQkdMKEJBQ0tfQlVGRkVSKVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGZyYW1lYnVmZmVyRGlydHkgPSBmYWxzZVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGN1cnJlbnRGcmFtZWJ1ZmZlciAoKSB7XG4gICAgcmV0dXJuIGZyYW1lYnVmZmVyU3RhY2tbZnJhbWVidWZmZXJTdGFjay5sZW5ndGggLSAxXVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICB0b3A6IGN1cnJlbnRGcmFtZWJ1ZmZlcixcbiAgICBkaXJ0eTogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIGZyYW1lYnVmZmVyRGlydHlcbiAgICB9LFxuICAgIHB1c2g6IGZ1bmN0aW9uIChuZXh0Xykge1xuICAgICAgdmFyIG5leHQgPSBuZXh0XyB8fCBudWxsXG4gICAgICBmcmFtZWJ1ZmZlckRpcnR5ID0gZnJhbWVidWZmZXJEaXJ0eSB8fCAobmV4dCAhPT0gY3VycmVudEZyYW1lYnVmZmVyKCkpXG4gICAgICBmcmFtZWJ1ZmZlclN0YWNrLnB1c2gobmV4dClcbiAgICAgIHJldHVybiBmcmFtZWJ1ZmZlckRpcnR5XG4gICAgfSxcbiAgICBwb3A6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBwcmV2ID0gY3VycmVudEZyYW1lYnVmZmVyKClcbiAgICAgIGZyYW1lYnVmZmVyU3RhY2sucG9wKClcbiAgICAgIGZyYW1lYnVmZmVyRGlydHkgPSBmcmFtZWJ1ZmZlckRpcnR5IHx8IChwcmV2ICE9PSBjdXJyZW50RnJhbWVidWZmZXIoKSlcbiAgICAgIHJldHVybiBmcmFtZWJ1ZmZlckRpcnR5XG4gICAgfSxcbiAgICBnZXRGcmFtZWJ1ZmZlcjogZnVuY3Rpb24gKG9iamVjdCkge1xuICAgICAgaWYgKHR5cGVvZiBvYmplY3QgPT09ICdmdW5jdGlvbicgJiYgb2JqZWN0Ll9yZWdsVHlwZSA9PT0gJ2ZyYW1lYnVmZmVyJykge1xuICAgICAgICB2YXIgZmJvID0gb2JqZWN0Ll9mcmFtZWJ1ZmZlclxuICAgICAgICBpZiAoZmJvIGluc3RhbmNlb2YgUkVHTEZyYW1lYnVmZmVyKSB7XG4gICAgICAgICAgcmV0dXJuIGZib1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH0sXG4gICAgcG9sbDogcG9sbCxcbiAgICBjcmVhdGU6IGNyZWF0ZUZCTyxcbiAgICBjbGVhcjogY2xlYXJDYWNoZSxcbiAgICByZWZyZXNoOiByZWZyZXNoQ2FjaGVcbiAgfVxufVxuIiwidmFyIGlzVHlwZWRBcnJheSA9IHJlcXVpcmUoJy4vaXMtdHlwZWQtYXJyYXknKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGlzTkRBcnJheUxpa2UgKG9iaikge1xuICByZXR1cm4gKFxuICAgIHR5cGVvZiBvYmogPT09ICdvYmplY3QnICYmXG4gICAgQXJyYXkuaXNBcnJheShvYmouc2hhcGUpICYmXG4gICAgQXJyYXkuaXNBcnJheShvYmouc3RyaWRlKSAmJlxuICAgIHR5cGVvZiBvYmoub2Zmc2V0ID09PSAnbnVtYmVyJyAmJlxuICAgIG9iai5zaGFwZS5sZW5ndGggPT09IG9iai5zdHJpZGUubGVuZ3RoICYmXG4gICAgKEFycmF5LmlzQXJyYXkob2JqLmRhdGEpIHx8XG4gICAgICBpc1R5cGVkQXJyYXkob2JqLmRhdGEpKSlcbn1cbiIsInZhciBkdHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9hcnJheXR5cGVzLmpzb24nKVxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoeCkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHgpIGluIGR0eXBlc1xufVxuIiwidmFyIEdMX1NVQlBJWEVMX0JJVFMgPSAweDBENTBcbnZhciBHTF9SRURfQklUUyA9IDB4MEQ1MlxudmFyIEdMX0dSRUVOX0JJVFMgPSAweDBENTNcbnZhciBHTF9CTFVFX0JJVFMgPSAweDBENTRcbnZhciBHTF9BTFBIQV9CSVRTID0gMHgwRDU1XG52YXIgR0xfREVQVEhfQklUUyA9IDB4MEQ1NlxudmFyIEdMX1NURU5DSUxfQklUUyA9IDB4MEQ1N1xuXG52YXIgR0xfQUxJQVNFRF9QT0lOVF9TSVpFX1JBTkdFID0gMHg4NDZEXG52YXIgR0xfQUxJQVNFRF9MSU5FX1dJRFRIX1JBTkdFID0gMHg4NDZFXG5cbnZhciBHTF9NQVhfVEVYVFVSRV9TSVpFID0gMHgwRDMzXG52YXIgR0xfTUFYX1ZJRVdQT1JUX0RJTVMgPSAweDBEM0FcbnZhciBHTF9NQVhfVkVSVEVYX0FUVFJJQlMgPSAweDg4NjlcbnZhciBHTF9NQVhfVkVSVEVYX1VOSUZPUk1fVkVDVE9SUyA9IDB4OERGQlxudmFyIEdMX01BWF9WQVJZSU5HX1ZFQ1RPUlMgPSAweDhERkNcbnZhciBHTF9NQVhfQ09NQklORURfVEVYVFVSRV9JTUFHRV9VTklUUyA9IDB4OEI0RFxudmFyIEdMX01BWF9WRVJURVhfVEVYVFVSRV9JTUFHRV9VTklUUyA9IDB4OEI0Q1xudmFyIEdMX01BWF9URVhUVVJFX0lNQUdFX1VOSVRTID0gMHg4ODcyXG52YXIgR0xfTUFYX0ZSQUdNRU5UX1VOSUZPUk1fVkVDVE9SUyA9IDB4OERGRFxudmFyIEdMX01BWF9DVUJFX01BUF9URVhUVVJFX1NJWkUgPSAweDg1MUNcbnZhciBHTF9NQVhfUkVOREVSQlVGRkVSX1NJWkUgPSAweDg0RThcblxudmFyIEdMX1ZFTkRPUiA9IDB4MUYwMFxudmFyIEdMX1JFTkRFUkVSID0gMHgxRjAxXG52YXIgR0xfVkVSU0lPTiA9IDB4MUYwMlxudmFyIEdMX1NIQURJTkdfTEFOR1VBR0VfVkVSU0lPTiA9IDB4OEI4Q1xuXG52YXIgR0xfTUFYX1RFWFRVUkVfTUFYX0FOSVNPVFJPUFlfRVhUID0gMHg4NEZGXG5cbnZhciBHTF9NQVhfQ09MT1JfQVRUQUNITUVOVFNfV0VCR0wgPSAweDhDREZcbnZhciBHTF9NQVhfRFJBV19CVUZGRVJTX1dFQkdMID0gMHg4ODI0XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGdsLCBleHRlbnNpb25zKSB7XG4gIHZhciBtYXhBbmlzb3Ryb3BpYyA9IDFcbiAgaWYgKGV4dGVuc2lvbnMuZXh0X3RleHR1cmVfZmlsdGVyX2FuaXNvdHJvcGljKSB7XG4gICAgbWF4QW5pc290cm9waWMgPSBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1RFWFRVUkVfTUFYX0FOSVNPVFJPUFlfRVhUKVxuICB9XG5cbiAgdmFyIG1heERyYXdidWZmZXJzID0gMVxuICB2YXIgbWF4Q29sb3JBdHRhY2htZW50cyA9IDFcbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfZHJhd19idWZmZXJzKSB7XG4gICAgbWF4RHJhd2J1ZmZlcnMgPSBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0RSQVdfQlVGRkVSU19XRUJHTClcbiAgICBtYXhDb2xvckF0dGFjaG1lbnRzID0gZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9DT0xPUl9BVFRBQ0hNRU5UU19XRUJHTClcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgLy8gZHJhd2luZyBidWZmZXIgYml0IGRlcHRoXG4gICAgY29sb3JCaXRzOiBbXG4gICAgICBnbC5nZXRQYXJhbWV0ZXIoR0xfUkVEX0JJVFMpLFxuICAgICAgZ2wuZ2V0UGFyYW1ldGVyKEdMX0dSRUVOX0JJVFMpLFxuICAgICAgZ2wuZ2V0UGFyYW1ldGVyKEdMX0JMVUVfQklUUyksXG4gICAgICBnbC5nZXRQYXJhbWV0ZXIoR0xfQUxQSEFfQklUUylcbiAgICBdLFxuICAgIGRlcHRoQml0czogZ2wuZ2V0UGFyYW1ldGVyKEdMX0RFUFRIX0JJVFMpLFxuICAgIHN0ZW5jaWxCaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfU1RFTkNJTF9CSVRTKSxcbiAgICBzdWJwaXhlbEJpdHM6IGdsLmdldFBhcmFtZXRlcihHTF9TVUJQSVhFTF9CSVRTKSxcblxuICAgIC8vIHN1cHBvcnRlZCBleHRlbnNpb25zXG4gICAgZXh0ZW5zaW9uczogT2JqZWN0LmtleXMoZXh0ZW5zaW9ucykuZmlsdGVyKGZ1bmN0aW9uIChleHQpIHtcbiAgICAgIHJldHVybiAhIWV4dGVuc2lvbnNbZXh0XVxuICAgIH0pLFxuXG4gICAgLy8gbWF4IGFuaXNvIHNhbXBsZXNcbiAgICBtYXhBbmlzb3Ryb3BpYzogbWF4QW5pc290cm9waWMsXG5cbiAgICAvLyBtYXggZHJhdyBidWZmZXJzXG4gICAgbWF4RHJhd2J1ZmZlcnM6IG1heERyYXdidWZmZXJzLFxuICAgIG1heENvbG9yQXR0YWNobWVudHM6IG1heENvbG9yQXR0YWNobWVudHMsXG5cbiAgICAvLyBwb2ludCBhbmQgbGluZSBzaXplIHJhbmdlc1xuICAgIHBvaW50U2l6ZURpbXM6IGdsLmdldFBhcmFtZXRlcihHTF9BTElBU0VEX1BPSU5UX1NJWkVfUkFOR0UpLFxuICAgIGxpbmVXaWR0aERpbXM6IGdsLmdldFBhcmFtZXRlcihHTF9BTElBU0VEX0xJTkVfV0lEVEhfUkFOR0UpLFxuICAgIG1heFZpZXdwb3J0RGltczogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9WSUVXUE9SVF9ESU1TKSxcbiAgICBtYXhDb21iaW5lZFRleHR1cmVVbml0czogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9DT01CSU5FRF9URVhUVVJFX0lNQUdFX1VOSVRTKSxcbiAgICBtYXhDdWJlTWFwU2l6ZTogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9DVUJFX01BUF9URVhUVVJFX1NJWkUpLFxuICAgIG1heFJlbmRlcmJ1ZmZlclNpemU6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfUkVOREVSQlVGRkVSX1NJWkUpLFxuICAgIG1heFRleHR1cmVVbml0czogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9URVhUVVJFX0lNQUdFX1VOSVRTKSxcbiAgICBtYXhUZXh0dXJlU2l6ZTogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9URVhUVVJFX1NJWkUpLFxuICAgIG1heEF0dHJpYnV0ZXM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVkVSVEVYX0FUVFJJQlMpLFxuICAgIG1heFZlcnRleFVuaWZvcm1zOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1ZFUlRFWF9VTklGT1JNX1ZFQ1RPUlMpLFxuICAgIG1heFZlcnRleFRleHR1cmVVbml0czogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9WRVJURVhfVEVYVFVSRV9JTUFHRV9VTklUUyksXG4gICAgbWF4VmFyeWluZ1ZlY3RvcnM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVkFSWUlOR19WRUNUT1JTKSxcbiAgICBtYXhGcmFnbWVudFVuaWZvcm1zOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0ZSQUdNRU5UX1VOSUZPUk1fVkVDVE9SUyksXG5cbiAgICAvLyB2ZW5kb3IgaW5mb1xuICAgIGdsc2w6IGdsLmdldFBhcmFtZXRlcihHTF9TSEFESU5HX0xBTkdVQUdFX1ZFUlNJT04pLFxuICAgIHJlbmRlcmVyOiBnbC5nZXRQYXJhbWV0ZXIoR0xfUkVOREVSRVIpLFxuICAgIHZlbmRvcjogZ2wuZ2V0UGFyYW1ldGVyKEdMX1ZFTkRPUiksXG4gICAgdmVyc2lvbjogZ2wuZ2V0UGFyYW1ldGVyKEdMX1ZFUlNJT04pXG4gIH1cbn1cbiIsIi8qIGdsb2JhbHMgZG9jdW1lbnQsIEltYWdlLCBYTUxIdHRwUmVxdWVzdCAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGxvYWRUZXh0dXJlXG5cbmZ1bmN0aW9uIGdldEV4dGVuc2lvbiAodXJsKSB7XG4gIHZhciBwYXJ0cyA9IC9cXC4oXFx3KykoXFw/LiopPyQvLmV4ZWModXJsKVxuICBpZiAocGFydHMgJiYgcGFydHNbMV0pIHtcbiAgICByZXR1cm4gcGFydHNbMV0udG9Mb3dlckNhc2UoKVxuICB9XG59XG5cbmZ1bmN0aW9uIGlzVmlkZW9FeHRlbnNpb24gKHVybCkge1xuICByZXR1cm4gW1xuICAgICdhdmknLFxuICAgICdhc2YnLFxuICAgICdnaWZ2JyxcbiAgICAnbW92JyxcbiAgICAncXQnLFxuICAgICd5dXYnLFxuICAgICdtcGcnLFxuICAgICdtcGVnJyxcbiAgICAnbTJ2JyxcbiAgICAnbXA0JyxcbiAgICAnbTRwJyxcbiAgICAnbTR2JyxcbiAgICAnb2dnJyxcbiAgICAnb2d2JyxcbiAgICAndm9iJyxcbiAgICAnd2VibScsXG4gICAgJ3dtdidcbiAgXS5pbmRleE9mKHVybCkgPj0gMFxufVxuXG5mdW5jdGlvbiBpc0NvbXByZXNzZWRFeHRlbnNpb24gKHVybCkge1xuICByZXR1cm4gW1xuICAgICdkZHMnXG4gIF0uaW5kZXhPZih1cmwpID49IDBcbn1cblxuZnVuY3Rpb24gbG9hZFZpZGVvICh1cmwsIGNyb3NzT3JpZ2luKSB7XG4gIHZhciB2aWRlbyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3ZpZGVvJylcbiAgdmlkZW8uYXV0b3BsYXkgPSB0cnVlXG4gIHZpZGVvLmxvb3AgPSB0cnVlXG4gIGlmIChjcm9zc09yaWdpbikge1xuICAgIHZpZGVvLmNyb3NzT3JpZ2luID0gY3Jvc3NPcmlnaW5cbiAgfVxuICB2aWRlby5zcmMgPSB1cmxcbiAgcmV0dXJuIHZpZGVvXG59XG5cbmZ1bmN0aW9uIGxvYWRDb21wcmVzc2VkVGV4dHVyZSAodXJsLCBleHQsIGNyb3NzT3JpZ2luKSB7XG4gIHZhciB4aHIgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKVxuICB4aHIucmVzcG9uc2VUeXBlID0gJ2FycmF5YnVmZmVyJ1xuICB4aHIub3BlbignR0VUJywgdXJsLCB0cnVlKVxuICB4aHIuc2VuZCgpXG4gIHJldHVybiB4aHJcbn1cblxuZnVuY3Rpb24gbG9hZEltYWdlICh1cmwsIGNyb3NzT3JpZ2luKSB7XG4gIHZhciBpbWFnZSA9IG5ldyBJbWFnZSgpXG4gIGlmIChjcm9zc09yaWdpbikge1xuICAgIGltYWdlLmNyb3NzT3JpZ2luID0gY3Jvc3NPcmlnaW5cbiAgfVxuICBpbWFnZS5zcmMgPSB1cmxcbiAgcmV0dXJuIGltYWdlXG59XG5cbi8vIEN1cnJlbnRseSB0aGlzIHN0dWZmIG9ubHkgd29ya3MgaW4gYSBET00gZW52aXJvbm1lbnRcbmZ1bmN0aW9uIGxvYWRUZXh0dXJlICh1cmwsIGNyb3NzT3JpZ2luKSB7XG4gIGlmICh0eXBlb2YgZG9jdW1lbnQgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgdmFyIGV4dCA9IGdldEV4dGVuc2lvbih1cmwpXG4gICAgaWYgKGlzVmlkZW9FeHRlbnNpb24oZXh0KSkge1xuICAgICAgcmV0dXJuIGxvYWRWaWRlbyh1cmwsIGNyb3NzT3JpZ2luKVxuICAgIH1cbiAgICBpZiAoaXNDb21wcmVzc2VkRXh0ZW5zaW9uKGV4dCkpIHtcbiAgICAgIHJldHVybiBsb2FkQ29tcHJlc3NlZFRleHR1cmUodXJsLCBleHQsIGNyb3NzT3JpZ2luKVxuICAgIH1cbiAgICByZXR1cm4gbG9hZEltYWdlKHVybCwgY3Jvc3NPcmlnaW4pXG4gIH1cbiAgcmV0dXJuIG51bGxcbn1cbiIsIi8vIFJlZmVyZW5jZXM6XG4vL1xuLy8gaHR0cDovL21zZG4ubWljcm9zb2Z0LmNvbS9lbi11cy9saWJyYXJ5L2JiOTQzOTkxLmFzcHgvXG4vLyBodHRwOi8vYmxvZy50b2ppY29kZS5jb20vMjAxMS8xMi9jb21wcmVzc2VkLXRleHR1cmVzLWluLXdlYmdsLmh0bWxcbi8vXG5cblxubW9kdWxlLmV4cG9ydHMgPSBwYXJzZUREU1xuXG52YXIgRERTX01BR0lDID0gMHgyMDUzNDQ0NFxuXG52YXIgR0xfVEVYVFVSRV8yRCA9IDB4MERFMVxudmFyIEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCA9IDB4ODUxNVxuXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfUzNUQ19EWFQxX0VYVCA9IDB4ODNGMFxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDFfRVhUID0gMHg4M0YxXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUM19FWFQgPSAweDgzRjJcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQ1X0VYVCA9IDB4ODNGM1xuXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfRVRDMV9XRUJHTCA9IDB4OEQ2NFxuXG52YXIgR0xfVU5TSUdORURfQllURSA9IDB4MTQwMVxuLy8gdmFyIEdMX0hBTEZfRkxPQVRfT0VTID0gMHg4RDYxXG4vLyB2YXIgR0xfRkxPQVQgPSAweDE0MDZcblxudmFyIEREU0RfTUlQTUFQQ09VTlQgPSAweDIwMDAwXG5cbnZhciBERFNDQVBTMl9DVUJFTUFQID0gMHgyMDBcbnZhciBERFNDQVBTMl9DVUJFTUFQX1BPU0lUSVZFWCA9IDB4NDAwXG52YXIgRERTQ0FQUzJfQ1VCRU1BUF9ORUdBVElWRVggPSAweDgwMFxudmFyIEREU0NBUFMyX0NVQkVNQVBfUE9TSVRJVkVZID0gMHgxMDAwXG52YXIgRERTQ0FQUzJfQ1VCRU1BUF9ORUdBVElWRVkgPSAweDIwMDBcbnZhciBERFNDQVBTMl9DVUJFTUFQX1BPU0lUSVZFWiA9IDB4NDAwMFxudmFyIEREU0NBUFMyX0NVQkVNQVBfTkVHQVRJVkVaID0gMHg4MDAwXG5cbnZhciBDVUJFTUFQX0NPTVBMRVRFX0ZBQ0VTID0gKFxuICBERFNDQVBTMl9DVUJFTUFQX1BPU0lUSVZFWCB8XG4gIEREU0NBUFMyX0NVQkVNQVBfTkVHQVRJVkVYIHxcbiAgRERTQ0FQUzJfQ1VCRU1BUF9QT1NJVElWRVkgfFxuICBERFNDQVBTMl9DVUJFTUFQX05FR0FUSVZFWSB8XG4gIEREU0NBUFMyX0NVQkVNQVBfUE9TSVRJVkVaIHxcbiAgRERTQ0FQUzJfQ1VCRU1BUF9ORUdBVElWRVopXG5cbnZhciBERFBGX0ZPVVJDQyA9IDB4NFxudmFyIEREUEZfUkdCID0gMHg0MFxuXG52YXIgRk9VUkNDX0RYVDEgPSAweDMxNTQ1ODQ0XG52YXIgRk9VUkNDX0RYVDMgPSAweDMzNTQ1ODQ0XG52YXIgRk9VUkNDX0RYVDUgPSAweDM1NTQ1ODQ0XG52YXIgRk9VUkNDX0VUQzEgPSAweDMxNDM1NDQ1XG5cbi8vIEREU19IRUFERVIge1xudmFyIE9GRl9TSVpFID0gMSAgICAgICAgLy8gaW50MzIgZHdTaXplXG52YXIgT0ZGX0ZMQUdTID0gMiAgICAgICAvLyBpbnQzMiBkd0ZsYWdzXG52YXIgT0ZGX0hFSUdIVCA9IDMgICAgICAvLyBpbnQzMiBkd0hlaWdodFxudmFyIE9GRl9XSURUSCA9IDQgICAgICAgLy8gaW50MzIgZHdXaWR0aFxuLy8gdmFyIE9GRl9QSVRDSCA9IDUgICAgICAgLy8gaW50MzIgZHdQaXRjaE9yTGluZWFyU2l6ZVxuLy8gdmFyIE9GRl9ERVBUSCA9IDYgICAgICAgLy8gaW50MzIgZHdEZXB0aFxudmFyIE9GRl9NSVBNQVAgPSA3ICAgICAgLy8gaW50MzIgZHdNaXBNYXBDb3VudDsgLy8gb2Zmc2V0OiA3XG4vLyBpbnQzMlsxMV0gZHdSZXNlcnZlZDFcbi8vIEREU19QSVhFTEZPUk1BVCB7XG4vLyB2YXIgT0ZGX1BGX1NJWkUgPSAxOSAgICAvLyBpbnQzMiBkd1NpemU7IC8vIG9mZnNldDogMTlcbnZhciBPRkZfUEZfRkxBR1MgPSAyMCAgIC8vIGludDMyIGR3RmxhZ3NcbnZhciBPRkZfRk9VUkNDID0gMjEgICAgIC8vIGNoYXJbNF0gZHdGb3VyQ0Ncbi8vIHZhciBPRkZfUkdCQV9CSVRTID0gMjIgIC8vIGludDMyIGR3UkdCQml0Q291bnRcbi8vIHZhciBPRkZfUkVEX01BU0sgPSAyMyAgIC8vIGludDMyIGR3UkJpdE1hc2tcbi8vIHZhciBPRkZfR1JFRU5fTUFTSyA9IDI0IC8vIGludDMyIGR3R0JpdE1hc2tcbi8vIHZhciBPRkZfQkxVRV9NQVNLID0gMjUgIC8vIGludDMyIGR3QkJpdE1hc2tcbi8vIHZhciBPRkZfQUxQSEFfTUFTSyA9IDI2IC8vIGludDMyIGR3QUJpdE1hc2s7IC8vIG9mZnNldDogMjZcbi8vIH1cbi8vIHZhciBPRkZfQ0FQUyA9IDI3ICAgICAgIC8vIGludDMyIGR3Q2FwczsgLy8gb2Zmc2V0OiAyN1xudmFyIE9GRl9DQVBTMiA9IDI4ICAgICAgLy8gaW50MzIgZHdDYXBzMlxuLy8gdmFyIE9GRl9DQVBTMyA9IDI5ICAgICAgLy8gaW50MzIgZHdDYXBzM1xuLy8gdmFyIE9GRl9DQVBTNCA9IDMwICAgICAgLy8gaW50MzIgZHdDYXBzNFxuLy8gaW50MzIgZHdSZXNlcnZlZDIgLy8gb2Zmc2V0IDMxXG5cbmZ1bmN0aW9uIHBhcnNlRERTIChhcnJheUJ1ZmZlcikge1xuICB2YXIgaGVhZGVyID0gbmV3IEludDMyQXJyYXkoYXJyYXlCdWZmZXIpXG4gIFxuXG4gIHZhciBmbGFncyA9IGhlYWRlcltPRkZfRkxBR1NdXG4gIFxuXG4gIHZhciB3aWR0aCA9IGhlYWRlcltPRkZfV0lEVEhdXG4gIHZhciBoZWlnaHQgPSBoZWFkZXJbT0ZGX0hFSUdIVF1cblxuICB2YXIgdHlwZSA9IEdMX1VOU0lHTkVEX0JZVEVcbiAgdmFyIGZvcm1hdCA9IDBcbiAgdmFyIGJsb2NrQnl0ZXMgPSAwXG4gIHZhciBjaGFubmVscyA9IDRcbiAgc3dpdGNoIChoZWFkZXJbT0ZGX0ZPVVJDQ10pIHtcbiAgICBjYXNlIEZPVVJDQ19EWFQxOlxuICAgICAgYmxvY2tCeXRlcyA9IDhcbiAgICAgIGlmIChmbGFncyAmIEREUEZfUkdCKSB7XG4gICAgICAgIGNoYW5uZWxzID0gM1xuICAgICAgICBmb3JtYXQgPSBHTF9DT01QUkVTU0VEX1JHQl9TM1RDX0RYVDFfRVhUXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBmb3JtYXQgPSBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQxX0VYVFxuICAgICAgfVxuICAgICAgYnJlYWtcblxuICAgIGNhc2UgRk9VUkNDX0RYVDM6XG4gICAgICBibG9ja0J5dGVzID0gMTZcbiAgICAgIGZvcm1hdCA9IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDNfRVhUXG4gICAgICBicmVha1xuXG4gICAgY2FzZSBGT1VSQ0NfRFhUNTpcbiAgICAgIGJsb2NrQnl0ZXMgPSAxNlxuICAgICAgZm9ybWF0ID0gR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUNV9FWFRcbiAgICAgIGJyZWFrXG5cbiAgICBjYXNlIEZPVVJDQ19FVEMxOlxuICAgICAgYmxvY2tCeXRlcyA9IDhcbiAgICAgIGZvcm1hdCA9IEdMX0NPTVBSRVNTRURfUkdCX0VUQzFfV0VCR0xcbiAgICAgIGJyZWFrXG5cbiAgICAvLyBUT0RPOiBJbXBsZW1lbnQgaGRyIGFuZCB1bmNvbXByZXNzZWQgdGV4dHVyZXNcblxuICAgIGRlZmF1bHQ6XG4gICAgICAvLyBIYW5kbGUgdW5jb21wcmVzc2VkIGRhdGEgaGVyZVxuICAgICAgXG4gIH1cblxuICB2YXIgcGl4ZWxGbGFncyA9IGhlYWRlcltPRkZfUEZfRkxBR1NdXG5cbiAgdmFyIG1pcG1hcENvdW50ID0gMVxuICBpZiAocGl4ZWxGbGFncyAmIEREU0RfTUlQTUFQQ09VTlQpIHtcbiAgICBtaXBtYXBDb3VudCA9IE1hdGgubWF4KDEsIGhlYWRlcltPRkZfTUlQTUFQXSlcbiAgfVxuXG4gIHZhciBwdHIgPSBoZWFkZXJbT0ZGX1NJWkVdICsgNFxuXG4gIHZhciByZXN1bHQgPSB7XG4gICAgd2lkdGg6IHdpZHRoLFxuICAgIGhlaWdodDogaGVpZ2h0LFxuICAgIGNoYW5uZWxzOiBjaGFubmVscyxcbiAgICBmb3JtYXQ6IGZvcm1hdCxcbiAgICB0eXBlOiB0eXBlLFxuICAgIGNvbXByZXNzZWQ6IHRydWUsXG4gICAgY3ViZTogZmFsc2UsXG4gICAgcGl4ZWxzOiBbXVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VNaXBzICh0YXJnZXQpIHtcbiAgICB2YXIgbWlwV2lkdGggPSB3aWR0aFxuICAgIHZhciBtaXBIZWlnaHQgPSBoZWlnaHRcblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbWlwbWFwQ291bnQ7ICsraSkge1xuICAgICAgdmFyIHNpemUgPVxuICAgICAgICBNYXRoLm1heCgxLCAobWlwV2lkdGggKyAzKSA+PiAyKSAqXG4gICAgICAgIE1hdGgubWF4KDEsIChtaXBIZWlnaHQgKyAzKSA+PiAyKSAqXG4gICAgICAgIGJsb2NrQnl0ZXNcbiAgICAgIHJlc3VsdC5waXhlbHMucHVzaCh7XG4gICAgICAgIHRhcmdldDogdGFyZ2V0LFxuICAgICAgICBtaXBsZXZlbDogaSxcbiAgICAgICAgd2lkdGg6IG1pcFdpZHRoLFxuICAgICAgICBoZWlnaHQ6IG1pcEhlaWdodCxcbiAgICAgICAgZGF0YTogbmV3IFVpbnQ4QXJyYXkoYXJyYXlCdWZmZXIsIHB0ciwgc2l6ZSlcbiAgICAgIH0pXG4gICAgICBwdHIgKz0gc2l6ZVxuICAgICAgbWlwV2lkdGggPj49IDFcbiAgICAgIG1pcEhlaWdodCA+Pj0gMVxuICAgIH1cbiAgfVxuXG4gIHZhciBjYXBzMiA9IGhlYWRlcltPRkZfQ0FQUzJdXG4gIHZhciBjdWJlbWFwID0gISEoY2FwczIgJiBERFNDQVBTMl9DVUJFTUFQKVxuICBpZiAoY3ViZW1hcCkge1xuICAgIFxuICAgIHJlc3VsdC5jdWJlID0gdHJ1ZVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICBwYXJzZU1pcHMoR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YICsgaSlcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgcGFyc2VNaXBzKEdMX1RFWFRVUkVfMkQpXG4gIH1cblxuICByZXR1cm4gcmVzdWx0XG59XG4iLCIvKiBnbG9iYWxzIHJlcXVlc3RBbmltYXRpb25GcmFtZSwgY2FuY2VsQW5pbWF0aW9uRnJhbWUgKi9cbmlmICh0eXBlb2YgcmVxdWVzdEFuaW1hdGlvbkZyYW1lID09PSAnZnVuY3Rpb24nICYmXG4gICAgdHlwZW9mIGNhbmNlbEFuaW1hdGlvbkZyYW1lID09PSAnZnVuY3Rpb24nKSB7XG4gIG1vZHVsZS5leHBvcnRzID0ge1xuICAgIG5leHQ6IGZ1bmN0aW9uICh4KSB7IHJldHVybiByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoeCkgfSxcbiAgICBjYW5jZWw6IGZ1bmN0aW9uICh4KSB7IHJldHVybiBjYW5jZWxBbmltYXRpb25GcmFtZSh4KSB9XG4gIH1cbn0gZWxzZSB7XG4gIG1vZHVsZS5leHBvcnRzID0ge1xuICAgIG5leHQ6IGZ1bmN0aW9uIChjYikge1xuICAgICAgc2V0VGltZW91dChjYiwgMzApXG4gICAgfSxcbiAgICBjYW5jZWw6IGNsZWFyVGltZW91dFxuICB9XG59XG4iLCJcbnZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL2lzLXR5cGVkLWFycmF5JylcblxudmFyIEdMX1JHQkEgPSA2NDA4XG52YXIgR0xfVU5TSUdORURfQllURSA9IDUxMjFcbnZhciBHTF9QQUNLX0FMSUdOTUVOVCA9IDB4MEQwNVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBSZWFkUGl4ZWxzIChnbCwgcmVnbFBvbGwsIHZpZXdwb3J0U3RhdGUpIHtcbiAgZnVuY3Rpb24gcmVhZFBpeGVscyAoaW5wdXQpIHtcbiAgICB2YXIgb3B0aW9ucyA9IGlucHV0IHx8IHt9XG4gICAgaWYgKGlzVHlwZWRBcnJheShpbnB1dCkpIHtcbiAgICAgIG9wdGlvbnMgPSB7XG4gICAgICAgIGRhdGE6IG9wdGlvbnNcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDIpIHtcbiAgICAgIG9wdGlvbnMgPSB7XG4gICAgICAgIHdpZHRoOiBhcmd1bWVudHNbMF0gfCAwLFxuICAgICAgICBoZWlnaHQ6IGFyZ3VtZW50c1sxXSB8IDBcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBpbnB1dCAhPT0gJ29iamVjdCcpIHtcbiAgICAgIG9wdGlvbnMgPSB7fVxuICAgIH1cblxuICAgIC8vIFVwZGF0ZSBXZWJHTCBzdGF0ZVxuICAgIHJlZ2xQb2xsKClcblxuICAgIC8vIFJlYWQgdmlld3BvcnQgc3RhdGVcbiAgICB2YXIgeCA9IG9wdGlvbnMueCB8fCAwXG4gICAgdmFyIHkgPSBvcHRpb25zLnkgfHwgMFxuICAgIHZhciB3aWR0aCA9IG9wdGlvbnMud2lkdGggfHwgdmlld3BvcnRTdGF0ZS53aWR0aFxuICAgIHZhciBoZWlnaHQgPSBvcHRpb25zLmhlaWdodCB8fCB2aWV3cG9ydFN0YXRlLmhlaWdodFxuXG4gICAgLy8gQ29tcHV0ZSBzaXplXG4gICAgdmFyIHNpemUgPSB3aWR0aCAqIGhlaWdodCAqIDRcblxuICAgIC8vIEFsbG9jYXRlIGRhdGFcbiAgICB2YXIgZGF0YSA9IG9wdGlvbnMuZGF0YSB8fCBuZXcgVWludDhBcnJheShzaXplKVxuXG4gICAgLy8gVHlwZSBjaGVja1xuICAgIFxuICAgIFxuXG4gICAgLy8gUnVuIHJlYWQgcGl4ZWxzXG4gICAgZ2wucGl4ZWxTdG9yZWkoR0xfUEFDS19BTElHTk1FTlQsIDQpXG4gICAgZ2wucmVhZFBpeGVscyh4LCB5LCB3aWR0aCwgaGVpZ2h0LCBHTF9SR0JBLCBHTF9VTlNJR05FRF9CWVRFLCBkYXRhKVxuXG4gICAgcmV0dXJuIGRhdGFcbiAgfVxuXG4gIHJldHVybiByZWFkUGl4ZWxzXG59XG4iLCJcbnZhciB2YWx1ZXMgPSByZXF1aXJlKCcuL3ZhbHVlcycpXG5cbnZhciBHTF9SRU5ERVJCVUZGRVIgPSAweDhENDFcblxudmFyIEdMX1JHQkE0ID0gMHg4MDU2XG52YXIgR0xfUkdCNV9BMSA9IDB4ODA1N1xudmFyIEdMX1JHQjU2NSA9IDB4OEQ2MlxudmFyIEdMX0RFUFRIX0NPTVBPTkVOVDE2ID0gMHg4MUE1XG52YXIgR0xfU1RFTkNJTF9JTkRFWDggPSAweDhENDhcbnZhciBHTF9ERVBUSF9TVEVOQ0lMID0gMHg4NEY5XG5cbnZhciBHTF9TUkdCOF9BTFBIQThfRVhUID0gMHg4QzQzXG5cbnZhciBHTF9SR0JBMzJGX0VYVCA9IDB4ODgxNFxuXG52YXIgR0xfUkdCQTE2Rl9FWFQgPSAweDg4MUFcbnZhciBHTF9SR0IxNkZfRVhUID0gMHg4ODFCXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGdsLCBleHRlbnNpb25zLCBsaW1pdHMpIHtcbiAgdmFyIGZvcm1hdFR5cGVzID0ge1xuICAgICdyZ2JhNCc6IEdMX1JHQkE0LFxuICAgICdyZ2I1NjUnOiBHTF9SR0I1NjUsXG4gICAgJ3JnYjUgYTEnOiBHTF9SR0I1X0ExLFxuICAgICdkZXB0aCc6IEdMX0RFUFRIX0NPTVBPTkVOVDE2LFxuICAgICdzdGVuY2lsJzogR0xfU1RFTkNJTF9JTkRFWDgsXG4gICAgJ2RlcHRoIHN0ZW5jaWwnOiBHTF9ERVBUSF9TVEVOQ0lMXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5leHRfc3JnYikge1xuICAgIGZvcm1hdFR5cGVzWydzcmdiYSddID0gR0xfU1JHQjhfQUxQSEE4X0VYVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMuZXh0X2NvbG9yX2J1ZmZlcl9oYWxmX2Zsb2F0KSB7XG4gICAgZm9ybWF0VHlwZXNbJ3JnYmExNmYnXSA9IEdMX1JHQkExNkZfRVhUXG4gICAgZm9ybWF0VHlwZXNbJ3JnYjE2ZiddID0gR0xfUkdCMTZGX0VYVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29sb3JfYnVmZmVyX2Zsb2F0KSB7XG4gICAgZm9ybWF0VHlwZXNbJ3JnYmEzMmYnXSA9IEdMX1JHQkEzMkZfRVhUXG4gIH1cblxuICB2YXIgcmVuZGVyYnVmZmVyQ291bnQgPSAwXG4gIHZhciByZW5kZXJidWZmZXJTZXQgPSB7fVxuXG4gIGZ1bmN0aW9uIFJFR0xSZW5kZXJidWZmZXIgKCkge1xuICAgIHRoaXMuaWQgPSByZW5kZXJidWZmZXJDb3VudCsrXG4gICAgdGhpcy5yZWZDb3VudCA9IDFcblxuICAgIHRoaXMucmVuZGVyYnVmZmVyID0gbnVsbFxuXG4gICAgdGhpcy5mb3JtYXQgPSBHTF9SR0JBNFxuICAgIHRoaXMud2lkdGggPSAwXG4gICAgdGhpcy5oZWlnaHQgPSAwXG4gIH1cblxuICBSRUdMUmVuZGVyYnVmZmVyLnByb3RvdHlwZS5kZWNSZWYgPSBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKC0tdGhpcy5yZWZDb3VudCA9PT0gMCkge1xuICAgICAgZGVzdHJveSh0aGlzKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHJlZnJlc2ggKHJiKSB7XG4gICAgaWYgKCFnbC5pc1JlbmRlcmJ1ZmZlcihyYi5yZW5kZXJidWZmZXIpKSB7XG4gICAgICByYi5yZW5kZXJidWZmZXIgPSBnbC5jcmVhdGVSZW5kZXJidWZmZXIoKVxuICAgIH1cbiAgICBnbC5iaW5kUmVuZGVyYnVmZmVyKEdMX1JFTkRFUkJVRkZFUiwgcmIucmVuZGVyYnVmZmVyKVxuICAgIGdsLnJlbmRlcmJ1ZmZlclN0b3JhZ2UoXG4gICAgICBHTF9SRU5ERVJCVUZGRVIsXG4gICAgICByYi5mb3JtYXQsXG4gICAgICByYi53aWR0aCxcbiAgICAgIHJiLmhlaWdodClcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3kgKHJiKSB7XG4gICAgdmFyIGhhbmRsZSA9IHJiLnJlbmRlcmJ1ZmZlclxuICAgIFxuICAgIGdsLmJpbmRSZW5kZXJidWZmZXIoR0xfUkVOREVSQlVGRkVSLCBudWxsKVxuICAgIGlmIChnbC5pc1JlbmRlcmJ1ZmZlcihoYW5kbGUpKSB7XG4gICAgICBnbC5kZWxldGVSZW5kZXJidWZmZXIoaGFuZGxlKVxuICAgIH1cbiAgICByYi5yZW5kZXJidWZmZXIgPSBudWxsXG4gICAgcmIucmVmQ291bnQgPSAwXG4gICAgZGVsZXRlIHJlbmRlcmJ1ZmZlclNldFtyYi5pZF1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZVJlbmRlcmJ1ZmZlciAoaW5wdXQpIHtcbiAgICB2YXIgcmVuZGVyYnVmZmVyID0gbmV3IFJFR0xSZW5kZXJidWZmZXIoKVxuICAgIHJlbmRlcmJ1ZmZlclNldFtyZW5kZXJidWZmZXIuaWRdID0gcmVuZGVyYnVmZmVyXG5cbiAgICBmdW5jdGlvbiByZWdsUmVuZGVyYnVmZmVyIChpbnB1dCkge1xuICAgICAgdmFyIG9wdGlvbnMgPSBpbnB1dCB8fCB7fVxuXG4gICAgICB2YXIgdyA9IDBcbiAgICAgIHZhciBoID0gMFxuICAgICAgaWYgKCdzaGFwZScgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgc2hhcGUgPSBvcHRpb25zLnNoYXBlXG4gICAgICAgIFxuICAgICAgICB3ID0gc2hhcGVbMF0gfCAwXG4gICAgICAgIGggPSBzaGFwZVsxXSB8IDBcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmICgncmFkaXVzJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgdyA9IGggPSBvcHRpb25zLnJhZGl1cyB8IDBcbiAgICAgICAgfVxuICAgICAgICBpZiAoJ3dpZHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgdyA9IG9wdGlvbnMud2lkdGggfCAwXG4gICAgICAgIH1cbiAgICAgICAgaWYgKCdoZWlnaHQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBoID0gb3B0aW9ucy5oZWlnaHQgfCAwXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHZhciBzID0gbGltaXRzLm1heFJlbmRlcmJ1ZmZlclNpemVcbiAgICAgIFxuICAgICAgcmVnbFJlbmRlcmJ1ZmZlci53aWR0aCA9IHJlbmRlcmJ1ZmZlci53aWR0aCA9IE1hdGgubWF4KHcsIDEpXG4gICAgICByZWdsUmVuZGVyYnVmZmVyLmhlaWdodCA9IHJlbmRlcmJ1ZmZlci5oZWlnaHQgPSBNYXRoLm1heChoLCAxKVxuXG4gICAgICByZW5kZXJidWZmZXIuZm9ybWF0ID0gR0xfUkdCQTRcbiAgICAgIGlmICgnZm9ybWF0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBmb3JtYXQgPSBvcHRpb25zLmZvcm1hdFxuICAgICAgICBcbiAgICAgICAgcmVuZGVyYnVmZmVyLmZvcm1hdCA9IGZvcm1hdFR5cGVzW2Zvcm1hdF1cbiAgICAgIH1cblxuICAgICAgcmVmcmVzaChyZW5kZXJidWZmZXIpXG5cbiAgICAgIHJldHVybiByZWdsUmVuZGVyYnVmZmVyXG4gICAgfVxuXG4gICAgcmVnbFJlbmRlcmJ1ZmZlcihpbnB1dClcblxuICAgIHJlZ2xSZW5kZXJidWZmZXIuX3JlZ2xUeXBlID0gJ3JlbmRlcmJ1ZmZlcidcbiAgICByZWdsUmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXIgPSByZW5kZXJidWZmZXJcbiAgICByZWdsUmVuZGVyYnVmZmVyLmRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7XG4gICAgICByZW5kZXJidWZmZXIuZGVjUmVmKClcbiAgICB9XG5cbiAgICByZXR1cm4gcmVnbFJlbmRlcmJ1ZmZlclxuICB9XG5cbiAgZnVuY3Rpb24gcmVmcmVzaFJlbmRlcmJ1ZmZlcnMgKCkge1xuICAgIHZhbHVlcyhyZW5kZXJidWZmZXJTZXQpLmZvckVhY2gocmVmcmVzaClcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3lSZW5kZXJidWZmZXJzICgpIHtcbiAgICB2YWx1ZXMocmVuZGVyYnVmZmVyU2V0KS5mb3JFYWNoKGRlc3Ryb3kpXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNyZWF0ZTogY3JlYXRlUmVuZGVyYnVmZmVyLFxuICAgIHJlZnJlc2g6IHJlZnJlc2hSZW5kZXJidWZmZXJzLFxuICAgIGNsZWFyOiBkZXN0cm95UmVuZGVyYnVmZmVyc1xuICB9XG59XG4iLCJcbnZhciB2YWx1ZXMgPSByZXF1aXJlKCcuL3ZhbHVlcycpXG5cbnZhciBERUZBVUxUX0ZSQUdfU0hBREVSID0gJ3ZvaWQgbWFpbigpe2dsX0ZyYWdDb2xvcj12ZWM0KDAsMCwwLDApO30nXG52YXIgREVGQVVMVF9WRVJUX1NIQURFUiA9ICd2b2lkIG1haW4oKXtnbF9Qb3NpdGlvbj12ZWM0KDAsMCwwLDApO30nXG5cbnZhciBHTF9GUkFHTUVOVF9TSEFERVIgPSAzNTYzMlxudmFyIEdMX1ZFUlRFWF9TSEFERVIgPSAzNTYzM1xuXG52YXIgR0xfQUNUSVZFX1VOSUZPUk1TID0gMHg4Qjg2XG52YXIgR0xfQUNUSVZFX0FUVFJJQlVURVMgPSAweDhCODlcblxuZnVuY3Rpb24gQWN0aXZlSW5mbyAobmFtZSwgbG9jYXRpb24sIGluZm8pIHtcbiAgdGhpcy5uYW1lID0gbmFtZVxuICB0aGlzLmxvY2F0aW9uID0gbG9jYXRpb25cbiAgdGhpcy5pbmZvID0gaW5mb1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBTaGFkZXJTdGF0ZSAoXG4gIGdsLFxuICBhdHRyaWJ1dGVTdGF0ZSxcbiAgdW5pZm9ybVN0YXRlLFxuICBjb21waWxlU2hhZGVyRHJhdyxcbiAgc3RyaW5nU3RvcmUpIHtcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIGdsc2wgY29tcGlsYXRpb24gYW5kIGxpbmtpbmdcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIHZhciBmcmFnU2hhZGVycyA9IHt9XG4gIHZhciB2ZXJ0U2hhZGVycyA9IHt9XG5cbiAgZnVuY3Rpb24gZ2V0U2hhZGVyICh0eXBlLCBpZCkge1xuICAgIHZhciBjYWNoZSA9IHR5cGUgPT09IEdMX0ZSQUdNRU5UX1NIQURFUiA/IGZyYWdTaGFkZXJzIDogdmVydFNoYWRlcnNcbiAgICB2YXIgc2hhZGVyID0gY2FjaGVbaWRdXG5cbiAgICBpZiAoIXNoYWRlcikge1xuICAgICAgdmFyIHNvdXJjZSA9IHN0cmluZ1N0b3JlLnN0cihpZClcbiAgICAgIHNoYWRlciA9IGdsLmNyZWF0ZVNoYWRlcih0eXBlKVxuICAgICAgZ2wuc2hhZGVyU291cmNlKHNoYWRlciwgc291cmNlKVxuICAgICAgZ2wuY29tcGlsZVNoYWRlcihzaGFkZXIpXG4gICAgICBcbiAgICAgIGNhY2hlW2lkXSA9IHNoYWRlclxuICAgIH1cblxuICAgIHJldHVybiBzaGFkZXJcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBwcm9ncmFtIGxpbmtpbmdcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIHZhciBwcm9ncmFtQ2FjaGUgPSB7fVxuICB2YXIgcHJvZ3JhbUxpc3QgPSBbXVxuXG4gIGZ1bmN0aW9uIFJFR0xQcm9ncmFtIChmcmFnSWQsIHZlcnRJZCkge1xuICAgIHRoaXMuZnJhZ0lkID0gZnJhZ0lkXG4gICAgdGhpcy52ZXJ0SWQgPSB2ZXJ0SWRcbiAgICB0aGlzLnByb2dyYW0gPSBudWxsXG4gICAgdGhpcy51bmlmb3JtcyA9IFtdXG4gICAgdGhpcy5hdHRyaWJ1dGVzID0gW11cbiAgICB0aGlzLmRyYXcgPSBmdW5jdGlvbiAoKSB7fVxuICAgIHRoaXMuYmF0Y2hDYWNoZSA9IHt9XG4gIH1cblxuICBmdW5jdGlvbiBsaW5rUHJvZ3JhbSAoZGVzYykge1xuICAgIHZhciBpLCBpbmZvXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gY29tcGlsZSAmIGxpbmtcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgdmFyIGZyYWdTaGFkZXIgPSBnZXRTaGFkZXIoR0xfRlJBR01FTlRfU0hBREVSLCBkZXNjLmZyYWdJZClcbiAgICB2YXIgdmVydFNoYWRlciA9IGdldFNoYWRlcihHTF9WRVJURVhfU0hBREVSLCBkZXNjLnZlcnRJZClcblxuICAgIHZhciBwcm9ncmFtID0gZGVzYy5wcm9ncmFtID0gZ2wuY3JlYXRlUHJvZ3JhbSgpXG4gICAgZ2wuYXR0YWNoU2hhZGVyKHByb2dyYW0sIGZyYWdTaGFkZXIpXG4gICAgZ2wuYXR0YWNoU2hhZGVyKHByb2dyYW0sIHZlcnRTaGFkZXIpXG4gICAgZ2wubGlua1Byb2dyYW0ocHJvZ3JhbSlcbiAgICBcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBncmFiIHVuaWZvcm1zXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHZhciBudW1Vbmlmb3JtcyA9IGdsLmdldFByb2dyYW1QYXJhbWV0ZXIocHJvZ3JhbSwgR0xfQUNUSVZFX1VOSUZPUk1TKVxuICAgIHZhciB1bmlmb3JtcyA9IGRlc2MudW5pZm9ybXMgPSBbXVxuXG4gICAgZm9yIChpID0gMDsgaSA8IG51bVVuaWZvcm1zOyArK2kpIHtcbiAgICAgIGluZm8gPSBnbC5nZXRBY3RpdmVVbmlmb3JtKHByb2dyYW0sIGkpXG4gICAgICBpZiAoaW5mbykge1xuICAgICAgICBpZiAoaW5mby5zaXplID4gMSkge1xuICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgaW5mby5zaXplOyArK2opIHtcbiAgICAgICAgICAgIHZhciBuYW1lID0gaW5mby5uYW1lLnJlcGxhY2UoJ1swXScsICdbJyArIGogKyAnXScpXG4gICAgICAgICAgICB1bmlmb3JtU3RhdGUuZGVmKG5hbWUpXG4gICAgICAgICAgICB1bmlmb3Jtcy5wdXNoKG5ldyBBY3RpdmVJbmZvKFxuICAgICAgICAgICAgICBuYW1lLFxuICAgICAgICAgICAgICBnbC5nZXRVbmlmb3JtTG9jYXRpb24ocHJvZ3JhbSwgbmFtZSksXG4gICAgICAgICAgICAgIGluZm8pKVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB1bmlmb3JtU3RhdGUuZGVmKGluZm8ubmFtZSlcbiAgICAgICAgICB1bmlmb3Jtcy5wdXNoKG5ldyBBY3RpdmVJbmZvKFxuICAgICAgICAgICAgaW5mby5uYW1lLFxuICAgICAgICAgICAgZ2wuZ2V0VW5pZm9ybUxvY2F0aW9uKHByb2dyYW0sIGluZm8ubmFtZSksXG4gICAgICAgICAgICBpbmZvKSlcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBncmFiIGF0dHJpYnV0ZXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgdmFyIG51bUF0dHJpYnV0ZXMgPSBnbC5nZXRQcm9ncmFtUGFyYW1ldGVyKHByb2dyYW0sIEdMX0FDVElWRV9BVFRSSUJVVEVTKVxuICAgIHZhciBhdHRyaWJ1dGVzID0gZGVzYy5hdHRyaWJ1dGVzID0gW11cbiAgICBmb3IgKGkgPSAwOyBpIDwgbnVtQXR0cmlidXRlczsgKytpKSB7XG4gICAgICBpbmZvID0gZ2wuZ2V0QWN0aXZlQXR0cmliKHByb2dyYW0sIGkpXG4gICAgICBpZiAoaW5mbykge1xuICAgICAgICBhdHRyaWJ1dGVTdGF0ZS5kZWYoaW5mby5uYW1lKVxuICAgICAgICBhdHRyaWJ1dGVzLnB1c2gobmV3IEFjdGl2ZUluZm8oXG4gICAgICAgICAgaW5mby5uYW1lLFxuICAgICAgICAgIGdsLmdldEF0dHJpYkxvY2F0aW9uKHByb2dyYW0sIGluZm8ubmFtZSksXG4gICAgICAgICAgaW5mbykpXG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGNsZWFyIGNhY2hlZCByZW5kZXJpbmcgbWV0aG9kc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBkZXNjLmRyYXcgPSBjb21waWxlU2hhZGVyRHJhdyhkZXNjKVxuICAgIGRlc2MuYmF0Y2hDYWNoZSA9IHt9XG4gIH1cblxuICBmdW5jdGlvbiBnZXRQcm9ncmFtICh2ZXJ0SWQsIGZyYWdJZCkge1xuICAgIHZhciBjYWNoZSA9IHByb2dyYW1DYWNoZVtmcmFnSWRdXG4gICAgaWYgKCFjYWNoZSkge1xuICAgICAgY2FjaGUgPSBwcm9ncmFtQ2FjaGVbZnJhZ0lkXSA9IHt9XG4gICAgfVxuICAgIHZhciBwcm9ncmFtID0gY2FjaGVbdmVydElkXVxuICAgIGlmICghcHJvZ3JhbSkge1xuICAgICAgcHJvZ3JhbSA9IG5ldyBSRUdMUHJvZ3JhbShmcmFnSWQsIHZlcnRJZClcbiAgICAgIGxpbmtQcm9ncmFtKHByb2dyYW0pXG4gICAgICBjYWNoZVt2ZXJ0SWRdID0gcHJvZ3JhbVxuICAgICAgcHJvZ3JhbUxpc3QucHVzaChwcm9ncmFtKVxuICAgIH1cbiAgICByZXR1cm4gcHJvZ3JhbVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjcmVhdGU6IGdldFByb2dyYW0sXG5cbiAgICBjbGVhcjogZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIGRlbGV0ZVNoYWRlciA9IGdsLmRlbGV0ZVNoYWRlci5iaW5kKGdsKVxuICAgICAgdmFsdWVzKGZyYWdTaGFkZXJzKS5mb3JFYWNoKGRlbGV0ZVNoYWRlcilcbiAgICAgIGZyYWdTaGFkZXJzID0ge31cbiAgICAgIHZhbHVlcyh2ZXJ0U2hhZGVycykuZm9yRWFjaChkZWxldGVTaGFkZXIpXG4gICAgICB2ZXJ0U2hhZGVycyA9IHt9XG5cbiAgICAgIHByb2dyYW1MaXN0LmZvckVhY2goZnVuY3Rpb24gKGRlc2MpIHtcbiAgICAgICAgZ2wuZGVsZXRlUHJvZ3JhbShkZXNjLnByb2dyYW0pXG4gICAgICB9KVxuICAgICAgcHJvZ3JhbUxpc3QubGVuZ3RoID0gMFxuICAgICAgcHJvZ3JhbUNhY2hlID0ge31cbiAgICB9LFxuXG4gICAgcmVmcmVzaDogZnVuY3Rpb24gKCkge1xuICAgICAgZnJhZ1NoYWRlcnMgPSB7fVxuICAgICAgdmVydFNoYWRlcnMgPSB7fVxuICAgICAgcHJvZ3JhbUxpc3QuZm9yRWFjaChsaW5rUHJvZ3JhbSlcbiAgICB9LFxuXG4gICAgcHJvZ3JhbXM6IFsgbnVsbCBdLFxuICAgIGZyYWdTaGFkZXJzOiBbIHN0cmluZ1N0b3JlLmlkKERFRkFVTFRfRlJBR19TSEFERVIpIF0sXG4gICAgdmVydFNoYWRlcnM6IFsgc3RyaW5nU3RvcmUuaWQoREVGQVVMVF9WRVJUX1NIQURFUikgXVxuICB9XG59XG4iLCIvLyBBIHN0YWNrIGZvciBtYW5hZ2luZyB0aGUgc3RhdGUgb2YgYSBzY2FsYXIvdmVjdG9yIHBhcmFtZXRlclxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNyZWF0ZVN0YWNrIChpbml0LCBvbkNoYW5nZSkge1xuICB2YXIgbiA9IGluaXQubGVuZ3RoXG4gIHZhciBzdGFjayA9IGluaXQuc2xpY2UoKVxuICB2YXIgY3VycmVudCA9IGluaXQuc2xpY2UoKVxuICB2YXIgZGlydHkgPSBmYWxzZVxuICB2YXIgZm9yY2VEaXJ0eSA9IHRydWVcblxuICBmdW5jdGlvbiBwb2xsICgpIHtcbiAgICB2YXIgcHRyID0gc3RhY2subGVuZ3RoIC0gblxuICAgIGlmIChkaXJ0eSB8fCBmb3JjZURpcnR5KSB7XG4gICAgICBzd2l0Y2ggKG4pIHtcbiAgICAgICAgY2FzZSAxOlxuICAgICAgICAgIG9uQ2hhbmdlKHN0YWNrW3B0cl0pXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSAyOlxuICAgICAgICAgIG9uQ2hhbmdlKHN0YWNrW3B0cl0sIHN0YWNrW3B0ciArIDFdKVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgMzpcbiAgICAgICAgICBvbkNoYW5nZShzdGFja1twdHJdLCBzdGFja1twdHIgKyAxXSwgc3RhY2tbcHRyICsgMl0pXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSA0OlxuICAgICAgICAgIG9uQ2hhbmdlKHN0YWNrW3B0cl0sIHN0YWNrW3B0ciArIDFdLCBzdGFja1twdHIgKyAyXSwgc3RhY2tbcHRyICsgM10pXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSA1OlxuICAgICAgICAgIG9uQ2hhbmdlKHN0YWNrW3B0cl0sIHN0YWNrW3B0ciArIDFdLCBzdGFja1twdHIgKyAyXSwgc3RhY2tbcHRyICsgM10sIHN0YWNrW3B0ciArIDRdKVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgNjpcbiAgICAgICAgICBvbkNoYW5nZShzdGFja1twdHJdLCBzdGFja1twdHIgKyAxXSwgc3RhY2tbcHRyICsgMl0sIHN0YWNrW3B0ciArIDNdLCBzdGFja1twdHIgKyA0XSwgc3RhY2tbcHRyICsgNV0pXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICBvbkNoYW5nZS5hcHBseShudWxsLCBzdGFjay5zbGljZShwdHIsIHN0YWNrLmxlbmd0aCkpXG4gICAgICB9XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG47ICsraSkge1xuICAgICAgICBjdXJyZW50W2ldID0gc3RhY2tbcHRyICsgaV1cbiAgICAgIH1cbiAgICAgIGZvcmNlRGlydHkgPSBkaXJ0eSA9IGZhbHNlXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBwdXNoOiBmdW5jdGlvbiAoKSB7XG4gICAgICBkaXJ0eSA9IGZhbHNlXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG47ICsraSkge1xuICAgICAgICB2YXIgeCA9IGFyZ3VtZW50c1tpXVxuICAgICAgICBkaXJ0eSA9IGRpcnR5IHx8ICh4ICE9PSBjdXJyZW50W2ldKVxuICAgICAgICBzdGFjay5wdXNoKHgpXG4gICAgICB9XG4gICAgfSxcblxuICAgIHBvcDogZnVuY3Rpb24gKCkge1xuICAgICAgZGlydHkgPSBmYWxzZVxuICAgICAgc3RhY2subGVuZ3RoIC09IG5cbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbjsgKytpKSB7XG4gICAgICAgIGRpcnR5ID0gZGlydHkgfHwgKHN0YWNrW3N0YWNrLmxlbmd0aCAtIG4gKyBpXSAhPT0gY3VycmVudFtpXSlcbiAgICAgIH1cbiAgICB9LFxuXG4gICAgcG9sbDogcG9sbCxcblxuICAgIHNldERpcnR5OiBmdW5jdGlvbiAoKSB7XG4gICAgICBmb3JjZURpcnR5ID0gdHJ1ZVxuICAgIH1cbiAgfVxufVxuIiwidmFyIGNyZWF0ZVN0YWNrID0gcmVxdWlyZSgnLi9zdGFjaycpXG52YXIgY3JlYXRlRW52aXJvbm1lbnQgPSByZXF1aXJlKCcuL2NvZGVnZW4nKVxuXG4vLyBXZWJHTCBjb25zdGFudHNcbnZhciBHTF9DVUxMX0ZBQ0UgPSAweDBCNDRcbnZhciBHTF9CTEVORCA9IDB4MEJFMlxudmFyIEdMX0RJVEhFUiA9IDB4MEJEMFxudmFyIEdMX1NURU5DSUxfVEVTVCA9IDB4MEI5MFxudmFyIEdMX0RFUFRIX1RFU1QgPSAweDBCNzFcbnZhciBHTF9TQ0lTU09SX1RFU1QgPSAweDBDMTFcbnZhciBHTF9QT0xZR09OX09GRlNFVF9GSUxMID0gMHg4MDM3XG52YXIgR0xfU0FNUExFX0FMUEhBX1RPX0NPVkVSQUdFID0gMHg4MDlFXG52YXIgR0xfU0FNUExFX0NPVkVSQUdFID0gMHg4MEEwXG52YXIgR0xfRlVOQ19BREQgPSAweDgwMDZcbnZhciBHTF9aRVJPID0gMFxudmFyIEdMX09ORSA9IDFcbnZhciBHTF9GUk9OVCA9IDEwMjhcbnZhciBHTF9CQUNLID0gMTAyOVxudmFyIEdMX0xFU1MgPSA1MTNcbnZhciBHTF9DQ1cgPSAyMzA1XG52YXIgR0xfQUxXQVlTID0gNTE5XG52YXIgR0xfS0VFUCA9IDc2ODBcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwQ29udGV4dFN0YXRlIChnbCwgZnJhbWVidWZmZXJTdGF0ZSwgdmlld3BvcnRTdGF0ZSkge1xuICBmdW5jdGlvbiBjYXBTdGFjayAoY2FwLCBkZmx0KSB7XG4gICAgdmFyIHJlc3VsdCA9IGNyZWF0ZVN0YWNrKFshIWRmbHRdLCBmdW5jdGlvbiAoZmxhZykge1xuICAgICAgaWYgKGZsYWcpIHtcbiAgICAgICAgZ2wuZW5hYmxlKGNhcClcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGdsLmRpc2FibGUoY2FwKVxuICAgICAgfVxuICAgIH0pXG4gICAgcmVzdWx0LmZsYWcgPSBjYXBcbiAgICByZXR1cm4gcmVzdWx0XG4gIH1cblxuICAvLyBDYXBzLCBmbGFncyBhbmQgb3RoZXIgcmFuZG9tIFdlYkdMIGNvbnRleHQgc3RhdGVcbiAgdmFyIGNvbnRleHRTdGF0ZSA9IHtcbiAgICAvLyBEaXRoZXJpbmdcbiAgICAnZGl0aGVyJzogY2FwU3RhY2soR0xfRElUSEVSKSxcblxuICAgIC8vIEJsZW5kaW5nXG4gICAgJ2JsZW5kLmVuYWJsZSc6IGNhcFN0YWNrKEdMX0JMRU5EKSxcbiAgICAnYmxlbmQuY29sb3InOiBjcmVhdGVTdGFjayhbMCwgMCwgMCwgMF0sIGZ1bmN0aW9uIChyLCBnLCBiLCBhKSB7XG4gICAgICBnbC5ibGVuZENvbG9yKHIsIGcsIGIsIGEpXG4gICAgfSksXG4gICAgJ2JsZW5kLmVxdWF0aW9uJzogY3JlYXRlU3RhY2soW0dMX0ZVTkNfQURELCBHTF9GVU5DX0FERF0sIGZ1bmN0aW9uIChyZ2IsIGEpIHtcbiAgICAgIGdsLmJsZW5kRXF1YXRpb25TZXBhcmF0ZShyZ2IsIGEpXG4gICAgfSksXG4gICAgJ2JsZW5kLmZ1bmMnOiBjcmVhdGVTdGFjayhbXG4gICAgICBHTF9PTkUsIEdMX1pFUk8sIEdMX09ORSwgR0xfWkVST1xuICAgIF0sIGZ1bmN0aW9uIChzcmNSR0IsIGRzdFJHQiwgc3JjQWxwaGEsIGRzdEFscGhhKSB7XG4gICAgICBnbC5ibGVuZEZ1bmNTZXBhcmF0ZShzcmNSR0IsIGRzdFJHQiwgc3JjQWxwaGEsIGRzdEFscGhhKVxuICAgIH0pLFxuXG4gICAgLy8gRGVwdGhcbiAgICAnZGVwdGguZW5hYmxlJzogY2FwU3RhY2soR0xfREVQVEhfVEVTVCwgdHJ1ZSksXG4gICAgJ2RlcHRoLmZ1bmMnOiBjcmVhdGVTdGFjayhbR0xfTEVTU10sIGZ1bmN0aW9uIChmdW5jKSB7XG4gICAgICBnbC5kZXB0aEZ1bmMoZnVuYylcbiAgICB9KSxcbiAgICAnZGVwdGgucmFuZ2UnOiBjcmVhdGVTdGFjayhbMCwgMV0sIGZ1bmN0aW9uIChuZWFyLCBmYXIpIHtcbiAgICAgIGdsLmRlcHRoUmFuZ2UobmVhciwgZmFyKVxuICAgIH0pLFxuICAgICdkZXB0aC5tYXNrJzogY3JlYXRlU3RhY2soW3RydWVdLCBmdW5jdGlvbiAobSkge1xuICAgICAgZ2wuZGVwdGhNYXNrKG0pXG4gICAgfSksXG5cbiAgICAvLyBGYWNlIGN1bGxpbmdcbiAgICAnY3VsbC5lbmFibGUnOiBjYXBTdGFjayhHTF9DVUxMX0ZBQ0UpLFxuICAgICdjdWxsLmZhY2UnOiBjcmVhdGVTdGFjayhbR0xfQkFDS10sIGZ1bmN0aW9uIChtb2RlKSB7XG4gICAgICBnbC5jdWxsRmFjZShtb2RlKVxuICAgIH0pLFxuXG4gICAgLy8gRnJvbnQgZmFjZSBvcmllbnRhdGlvblxuICAgICdmcm9udEZhY2UnOiBjcmVhdGVTdGFjayhbR0xfQ0NXXSwgZnVuY3Rpb24gKG1vZGUpIHtcbiAgICAgIGdsLmZyb250RmFjZShtb2RlKVxuICAgIH0pLFxuXG4gICAgLy8gV3JpdGUgbWFza3NcbiAgICAnY29sb3JNYXNrJzogY3JlYXRlU3RhY2soW3RydWUsIHRydWUsIHRydWUsIHRydWVdLCBmdW5jdGlvbiAociwgZywgYiwgYSkge1xuICAgICAgZ2wuY29sb3JNYXNrKHIsIGcsIGIsIGEpXG4gICAgfSksXG5cbiAgICAvLyBMaW5lIHdpZHRoXG4gICAgJ2xpbmVXaWR0aCc6IGNyZWF0ZVN0YWNrKFsxXSwgZnVuY3Rpb24gKHcpIHtcbiAgICAgIGdsLmxpbmVXaWR0aCh3KVxuICAgIH0pLFxuXG4gICAgLy8gUG9seWdvbiBvZmZzZXRcbiAgICAncG9seWdvbk9mZnNldC5lbmFibGUnOiBjYXBTdGFjayhHTF9QT0xZR09OX09GRlNFVF9GSUxMKSxcbiAgICAncG9seWdvbk9mZnNldC5vZmZzZXQnOiBjcmVhdGVTdGFjayhbMCwgMF0sIGZ1bmN0aW9uIChmYWN0b3IsIHVuaXRzKSB7XG4gICAgICBnbC5wb2x5Z29uT2Zmc2V0KGZhY3RvciwgdW5pdHMpXG4gICAgfSksXG5cbiAgICAvLyBTYW1wbGUgY292ZXJhZ2VcbiAgICAnc2FtcGxlLmFscGhhJzogY2FwU3RhY2soR0xfU0FNUExFX0FMUEhBX1RPX0NPVkVSQUdFKSxcbiAgICAnc2FtcGxlLmVuYWJsZSc6IGNhcFN0YWNrKEdMX1NBTVBMRV9DT1ZFUkFHRSksXG4gICAgJ3NhbXBsZS5jb3ZlcmFnZSc6IGNyZWF0ZVN0YWNrKFsxLCBmYWxzZV0sIGZ1bmN0aW9uICh2YWx1ZSwgaW52ZXJ0KSB7XG4gICAgICBnbC5zYW1wbGVDb3ZlcmFnZSh2YWx1ZSwgaW52ZXJ0KVxuICAgIH0pLFxuXG4gICAgLy8gU3RlbmNpbFxuICAgICdzdGVuY2lsLmVuYWJsZSc6IGNhcFN0YWNrKEdMX1NURU5DSUxfVEVTVCksXG4gICAgJ3N0ZW5jaWwubWFzayc6IGNyZWF0ZVN0YWNrKFstMV0sIGZ1bmN0aW9uIChtYXNrKSB7XG4gICAgICBnbC5zdGVuY2lsTWFzayhtYXNrKVxuICAgIH0pLFxuICAgICdzdGVuY2lsLmZ1bmMnOiBjcmVhdGVTdGFjayhbXG4gICAgICBHTF9BTFdBWVMsIDAsIC0xXG4gICAgXSwgZnVuY3Rpb24gKGZ1bmMsIHJlZiwgbWFzaykge1xuICAgICAgZ2wuc3RlbmNpbEZ1bmMoZnVuYywgcmVmLCBtYXNrKVxuICAgIH0pLFxuICAgICdzdGVuY2lsLm9wRnJvbnQnOiBjcmVhdGVTdGFjayhbXG4gICAgICBHTF9LRUVQLCBHTF9LRUVQLCBHTF9LRUVQXG4gICAgXSwgZnVuY3Rpb24gKGZhaWwsIHpmYWlsLCBwYXNzKSB7XG4gICAgICBnbC5zdGVuY2lsT3BTZXBhcmF0ZShHTF9GUk9OVCwgZmFpbCwgemZhaWwsIHBhc3MpXG4gICAgfSksXG4gICAgJ3N0ZW5jaWwub3BCYWNrJzogY3JlYXRlU3RhY2soW1xuICAgICAgR0xfS0VFUCwgR0xfS0VFUCwgR0xfS0VFUFxuICAgIF0sIGZ1bmN0aW9uIChmYWlsLCB6ZmFpbCwgcGFzcykge1xuICAgICAgZ2wuc3RlbmNpbE9wU2VwYXJhdGUoR0xfQkFDSywgZmFpbCwgemZhaWwsIHBhc3MpXG4gICAgfSksXG5cbiAgICAvLyBTY2lzc29yXG4gICAgJ3NjaXNzb3IuZW5hYmxlJzogY2FwU3RhY2soR0xfU0NJU1NPUl9URVNUKSxcbiAgICAnc2Npc3Nvci5ib3gnOiBjcmVhdGVTdGFjayhbMCwgMCwgLTEsIC0xXSwgZnVuY3Rpb24gKHgsIHksIHcsIGgpIHtcbiAgICAgIHZhciB3XyA9IHdcbiAgICAgIHZhciBmYm8gPSBmcmFtZWJ1ZmZlclN0YXRlLnRvcCgpXG4gICAgICBpZiAodyA8IDApIHtcbiAgICAgICAgaWYgKGZibykge1xuICAgICAgICAgIHdfID0gZmJvLndpZHRoIC0geFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHdfID0gZ2wuZHJhd2luZ0J1ZmZlcldpZHRoIC0geFxuICAgICAgICB9XG4gICAgICB9XG4gICAgICB2YXIgaF8gPSBoXG4gICAgICBpZiAoaCA8IDApIHtcbiAgICAgICAgaWYgKGZibykge1xuICAgICAgICAgIGhfID0gZmJvLmhlaWdodCAtIHlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBoXyA9IGdsLmRyYXdpbmdCdWZmZXJIZWlnaHQgLSB5XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGdsLnNjaXNzb3IoeCwgeSwgd18sIGhfKVxuICAgIH0pLFxuXG4gICAgLy8gVmlld3BvcnRcbiAgICAndmlld3BvcnQnOiBjcmVhdGVTdGFjayhbMCwgMCwgLTEsIC0xXSwgZnVuY3Rpb24gKHgsIHksIHcsIGgpIHtcbiAgICAgIHZhciB3XyA9IHdcbiAgICAgIHZhciBmYm8gPSBmcmFtZWJ1ZmZlclN0YXRlLnRvcCgpXG4gICAgICBpZiAodyA8IDApIHtcbiAgICAgICAgaWYgKGZibykge1xuICAgICAgICAgIHdfID0gZmJvLndpZHRoIC0geFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHdfID0gZ2wuZHJhd2luZ0J1ZmZlcldpZHRoIC0geFxuICAgICAgICB9XG4gICAgICB9XG4gICAgICB2YXIgaF8gPSBoXG4gICAgICBpZiAoaCA8IDApIHtcbiAgICAgICAgaWYgKGZibykge1xuICAgICAgICAgIGhfID0gZmJvLmhlaWdodCAtIHlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBoXyA9IGdsLmRyYXdpbmdCdWZmZXJIZWlnaHQgLSB5XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGdsLnZpZXdwb3J0KHgsIHksIHdfLCBoXylcbiAgICAgIHZpZXdwb3J0U3RhdGUud2lkdGggPSB3X1xuICAgICAgdmlld3BvcnRTdGF0ZS5oZWlnaHQgPSBoX1xuICAgIH0pXG4gIH1cblxuICB2YXIgZW52ID0gY3JlYXRlRW52aXJvbm1lbnQoKVxuICB2YXIgcG9sbCA9IGVudi5wcm9jKCdwb2xsJylcbiAgdmFyIHJlZnJlc2ggPSBlbnYucHJvYygncmVmcmVzaCcpXG4gIE9iamVjdC5rZXlzKGNvbnRleHRTdGF0ZSkuZm9yRWFjaChmdW5jdGlvbiAocHJvcCkge1xuICAgIHZhciBTVEFDSyA9IGVudi5saW5rKGNvbnRleHRTdGF0ZVtwcm9wXSlcbiAgICBwb2xsKFNUQUNLLCAnLnBvbGwoKTsnKVxuICAgIHJlZnJlc2goU1RBQ0ssICcuc2V0RGlydHkoKTsnKVxuICB9KVxuXG4gIHZhciBwcm9jcyA9IGVudi5jb21waWxlKClcblxuICByZXR1cm4ge1xuICAgIGNvbnRleHRTdGF0ZTogY29udGV4dFN0YXRlLFxuICAgIHZpZXdwb3J0OiB2aWV3cG9ydFN0YXRlLFxuICAgIHBvbGw6IHByb2NzLnBvbGwsXG4gICAgcmVmcmVzaDogcHJvY3MucmVmcmVzaCxcblxuICAgIG5vdGlmeVZpZXdwb3J0Q2hhbmdlZDogZnVuY3Rpb24gKCkge1xuICAgICAgY29udGV4dFN0YXRlLnZpZXdwb3J0LnNldERpcnR5KClcbiAgICAgIGNvbnRleHRTdGF0ZVsnc2Npc3Nvci5ib3gnXS5zZXREaXJ0eSgpXG4gICAgfVxuICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNyZWF0ZVN0cmluZ1N0b3JlKCkge1xuICB2YXIgc3RyaW5nSWRzID0ge31cbiAgdmFyIHN0cmluZ1ZhbHVlcyA9IFsnJ11cbiAgcmV0dXJuIHtcbiAgICBpZDogZnVuY3Rpb24gKHN0cikge1xuICAgICAgdmFyIHJlc3VsdCA9IHN0cmluZ0lkc1tzdHJdXG4gICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH1cbiAgICAgIHJlc3VsdCA9IHN0cmluZ0lkc1tzdHJdID0gc3RyaW5nVmFsdWVzLmxlbmd0aFxuICAgICAgc3RyaW5nVmFsdWVzLnB1c2goc3RyKVxuICAgICAgcmV0dXJuIHJlc3VsdFxuICAgIH0sXG5cbiAgICBzdHI6IGZ1bmN0aW9uIChpZCkge1xuICAgICAgcmV0dXJuIHN0cmluZ1ZhbHVlc1tpZF1cbiAgICB9XG4gIH1cbn1cbiIsIlxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vZXh0ZW5kJylcbnZhciB2YWx1ZXMgPSByZXF1aXJlKCcuL3ZhbHVlcycpXG52YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi9pcy10eXBlZC1hcnJheScpXG52YXIgaXNOREFycmF5TGlrZSA9IHJlcXVpcmUoJy4vaXMtbmRhcnJheScpXG52YXIgbG9hZFRleHR1cmUgPSByZXF1aXJlKCcuL2xvYWQtdGV4dHVyZScpXG52YXIgY29udmVydFRvSGFsZkZsb2F0ID0gcmVxdWlyZSgnLi90by1oYWxmLWZsb2F0JylcbnZhciBwYXJzZUREUyA9IHJlcXVpcmUoJy4vcGFyc2UtZGRzJylcblxudmFyIEdMX0NPTVBSRVNTRURfVEVYVFVSRV9GT1JNQVRTID0gMHg4NkEzXG5cbnZhciBHTF9URVhUVVJFXzJEID0gMHgwREUxXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUCA9IDB4ODUxM1xudmFyIEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCA9IDB4ODUxNVxuXG52YXIgR0xfUkdCQSA9IDB4MTkwOFxudmFyIEdMX0FMUEhBID0gMHgxOTA2XG52YXIgR0xfUkdCID0gMHgxOTA3XG52YXIgR0xfTFVNSU5BTkNFID0gMHgxOTA5XG52YXIgR0xfTFVNSU5BTkNFX0FMUEhBID0gMHgxOTBBXG5cbnZhciBHTF9SR0JBNCA9IDB4ODA1NlxudmFyIEdMX1JHQjVfQTEgPSAweDgwNTdcbnZhciBHTF9SR0I1NjUgPSAweDhENjJcblxudmFyIEdMX1VOU0lHTkVEX1NIT1JUXzRfNF80XzQgPSAweDgwMzNcbnZhciBHTF9VTlNJR05FRF9TSE9SVF81XzVfNV8xID0gMHg4MDM0XG52YXIgR0xfVU5TSUdORURfU0hPUlRfNV82XzUgPSAweDgzNjNcbnZhciBHTF9VTlNJR05FRF9JTlRfMjRfOF9XRUJHTCA9IDB4ODRGQVxuXG52YXIgR0xfREVQVEhfQ09NUE9ORU5UID0gMHgxOTAyXG52YXIgR0xfREVQVEhfU1RFTkNJTCA9IDB4ODRGOVxuXG52YXIgR0xfU1JHQl9FWFQgPSAweDhDNDBcbnZhciBHTF9TUkdCX0FMUEhBX0VYVCA9IDB4OEM0MlxuXG52YXIgR0xfSEFMRl9GTE9BVF9PRVMgPSAweDhENjFcblxudmFyIEdMX0NPTVBSRVNTRURfUkdCX1MzVENfRFhUMV9FWFQgPSAweDgzRjBcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQxX0VYVCA9IDB4ODNGMVxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDNfRVhUID0gMHg4M0YyXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUNV9FWFQgPSAweDgzRjNcblxudmFyIEdMX0NPTVBSRVNTRURfUkdCX0FUQ19XRUJHTCA9IDB4OEM5MlxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9BVENfRVhQTElDSVRfQUxQSEFfV0VCR0wgPSAweDhDOTNcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfQVRDX0lOVEVSUE9MQVRFRF9BTFBIQV9XRUJHTCA9IDB4ODdFRVxuXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfUFZSVENfNEJQUFYxX0lNRyA9IDB4OEMwMFxudmFyIEdMX0NPTVBSRVNTRURfUkdCX1BWUlRDXzJCUFBWMV9JTUcgPSAweDhDMDFcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUFZSVENfNEJQUFYxX0lNRyA9IDB4OEMwMlxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9QVlJUQ18yQlBQVjFfSU1HID0gMHg4QzAzXG5cbnZhciBHTF9DT01QUkVTU0VEX1JHQl9FVEMxX1dFQkdMID0gMHg4RDY0XG5cbnZhciBHTF9VTlNJR05FRF9CWVRFID0gMHgxNDAxXG52YXIgR0xfVU5TSUdORURfU0hPUlQgPSAweDE0MDNcbnZhciBHTF9VTlNJR05FRF9JTlQgPSAweDE0MDVcbnZhciBHTF9GTE9BVCA9IDB4MTQwNlxuXG52YXIgR0xfVEVYVFVSRV9XUkFQX1MgPSAweDI4MDJcbnZhciBHTF9URVhUVVJFX1dSQVBfVCA9IDB4MjgwM1xuXG52YXIgR0xfUkVQRUFUID0gMHgyOTAxXG52YXIgR0xfQ0xBTVBfVE9fRURHRSA9IDB4ODEyRlxudmFyIEdMX01JUlJPUkVEX1JFUEVBVCA9IDB4ODM3MFxuXG52YXIgR0xfVEVYVFVSRV9NQUdfRklMVEVSID0gMHgyODAwXG52YXIgR0xfVEVYVFVSRV9NSU5fRklMVEVSID0gMHgyODAxXG5cbnZhciBHTF9ORUFSRVNUID0gMHgyNjAwXG52YXIgR0xfTElORUFSID0gMHgyNjAxXG52YXIgR0xfTkVBUkVTVF9NSVBNQVBfTkVBUkVTVCA9IDB4MjcwMFxudmFyIEdMX0xJTkVBUl9NSVBNQVBfTkVBUkVTVCA9IDB4MjcwMVxudmFyIEdMX05FQVJFU1RfTUlQTUFQX0xJTkVBUiA9IDB4MjcwMlxudmFyIEdMX0xJTkVBUl9NSVBNQVBfTElORUFSID0gMHgyNzAzXG5cbnZhciBHTF9HRU5FUkFURV9NSVBNQVBfSElOVCA9IDB4ODE5MlxudmFyIEdMX0RPTlRfQ0FSRSA9IDB4MTEwMFxudmFyIEdMX0ZBU1RFU1QgPSAweDExMDFcbnZhciBHTF9OSUNFU1QgPSAweDExMDJcblxudmFyIEdMX1RFWFRVUkVfTUFYX0FOSVNPVFJPUFlfRVhUID0gMHg4NEZFXG5cbnZhciBHTF9VTlBBQ0tfQUxJR05NRU5UID0gMHgwQ0Y1XG52YXIgR0xfVU5QQUNLX0ZMSVBfWV9XRUJHTCA9IDB4OTI0MFxudmFyIEdMX1VOUEFDS19QUkVNVUxUSVBMWV9BTFBIQV9XRUJHTCA9IDB4OTI0MVxudmFyIEdMX1VOUEFDS19DT0xPUlNQQUNFX0NPTlZFUlNJT05fV0VCR0wgPSAweDkyNDNcblxudmFyIEdMX0JST1dTRVJfREVGQVVMVF9XRUJHTCA9IDB4OTI0NFxuXG52YXIgR0xfVEVYVFVSRTAgPSAweDg0QzBcblxudmFyIE1JUE1BUF9GSUxURVJTID0gW1xuICBHTF9ORUFSRVNUX01JUE1BUF9ORUFSRVNULFxuICBHTF9ORUFSRVNUX01JUE1BUF9MSU5FQVIsXG4gIEdMX0xJTkVBUl9NSVBNQVBfTkVBUkVTVCxcbiAgR0xfTElORUFSX01JUE1BUF9MSU5FQVJcbl1cblxuZnVuY3Rpb24gaXNQb3cyICh2KSB7XG4gIHJldHVybiAhKHYgJiAodiAtIDEpKSAmJiAoISF2KVxufVxuXG5mdW5jdGlvbiBpc051bWVyaWNBcnJheSAoYXJyKSB7XG4gIHJldHVybiAoXG4gICAgQXJyYXkuaXNBcnJheShhcnIpICYmXG4gICAgKGFyci5sZW5ndGggPT09IDAgfHxcbiAgICB0eXBlb2YgYXJyWzBdID09PSAnbnVtYmVyJykpXG59XG5cbmZ1bmN0aW9uIGlzUmVjdEFycmF5IChhcnIpIHtcbiAgaWYgKCFBcnJheS5pc0FycmF5KGFycikpIHtcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxuXG4gIHZhciB3aWR0aCA9IGFyci5sZW5ndGhcbiAgaWYgKHdpZHRoID09PSAwIHx8ICFBcnJheS5pc0FycmF5KGFyclswXSkpIHtcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxuXG4gIHZhciBoZWlnaHQgPSBhcnJbMF0ubGVuZ3RoXG4gIGZvciAodmFyIGkgPSAxOyBpIDwgd2lkdGg7ICsraSkge1xuICAgIGlmICghQXJyYXkuaXNBcnJheShhcnJbaV0pIHx8IGFycltpXS5sZW5ndGggIT09IGhlaWdodCkge1xuICAgICAgcmV0dXJuIGZhbHNlXG4gICAgfVxuICB9XG4gIHJldHVybiB0cnVlXG59XG5cbmZ1bmN0aW9uIGNsYXNzU3RyaW5nICh4KSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoeClcbn1cblxuZnVuY3Rpb24gaXNDYW52YXNFbGVtZW50IChvYmplY3QpIHtcbiAgcmV0dXJuIGNsYXNzU3RyaW5nKG9iamVjdCkgPT09ICdbb2JqZWN0IEhUTUxDYW52YXNFbGVtZW50XSdcbn1cblxuZnVuY3Rpb24gaXNDb250ZXh0MkQgKG9iamVjdCkge1xuICByZXR1cm4gY2xhc3NTdHJpbmcob2JqZWN0KSA9PT0gJ1tvYmplY3QgQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEXSdcbn1cblxuZnVuY3Rpb24gaXNJbWFnZUVsZW1lbnQgKG9iamVjdCkge1xuICByZXR1cm4gY2xhc3NTdHJpbmcob2JqZWN0KSA9PT0gJ1tvYmplY3QgSFRNTEltYWdlRWxlbWVudF0nXG59XG5cbmZ1bmN0aW9uIGlzVmlkZW9FbGVtZW50IChvYmplY3QpIHtcbiAgcmV0dXJuIGNsYXNzU3RyaW5nKG9iamVjdCkgPT09ICdbb2JqZWN0IEhUTUxWaWRlb0VsZW1lbnRdJ1xufVxuXG5mdW5jdGlvbiBpc1BlbmRpbmdYSFIgKG9iamVjdCkge1xuICByZXR1cm4gY2xhc3NTdHJpbmcob2JqZWN0KSA9PT0gJ1tvYmplY3QgWE1MSHR0cFJlcXVlc3RdJ1xufVxuXG5mdW5jdGlvbiBpc1BpeGVsRGF0YSAob2JqZWN0KSB7XG4gIHJldHVybiAoXG4gICAgdHlwZW9mIG9iamVjdCA9PT0gJ3N0cmluZycgfHxcbiAgICAoISFvYmplY3QgJiYgKFxuICAgICAgaXNUeXBlZEFycmF5KG9iamVjdCkgfHxcbiAgICAgIGlzTnVtZXJpY0FycmF5KG9iamVjdCkgfHxcbiAgICAgIGlzTkRBcnJheUxpa2Uob2JqZWN0KSB8fFxuICAgICAgaXNDYW52YXNFbGVtZW50KG9iamVjdCkgfHxcbiAgICAgIGlzQ29udGV4dDJEKG9iamVjdCkgfHxcbiAgICAgIGlzSW1hZ2VFbGVtZW50KG9iamVjdCkgfHxcbiAgICAgIGlzVmlkZW9FbGVtZW50KG9iamVjdCkgfHxcbiAgICAgIGlzUmVjdEFycmF5KG9iamVjdCkpKSlcbn1cblxuLy8gVHJhbnNwb3NlIGFuIGFycmF5IG9mIHBpeGVsc1xuZnVuY3Rpb24gdHJhbnNwb3NlUGl4ZWxzIChkYXRhLCBueCwgbnksIG5jLCBzeCwgc3ksIHNjLCBvZmYpIHtcbiAgdmFyIHJlc3VsdCA9IG5ldyBkYXRhLmNvbnN0cnVjdG9yKG54ICogbnkgKiBuYylcbiAgdmFyIHB0ciA9IDBcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBueTsgKytpKSB7XG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBueDsgKytqKSB7XG4gICAgICBmb3IgKHZhciBrID0gMDsgayA8IG5jOyArK2spIHtcbiAgICAgICAgcmVzdWx0W3B0cisrXSA9IGRhdGFbc3kgKiBpICsgc3ggKiBqICsgc2MgKiBrICsgb2ZmXVxuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY3JlYXRlVGV4dHVyZVNldCAoZ2wsIGV4dGVuc2lvbnMsIGxpbWl0cywgcmVnbFBvbGwsIHZpZXdwb3J0U3RhdGUpIHtcbiAgdmFyIG1pcG1hcEhpbnQgPSB7XG4gICAgXCJkb24ndCBjYXJlXCI6IEdMX0RPTlRfQ0FSRSxcbiAgICAnZG9udCBjYXJlJzogR0xfRE9OVF9DQVJFLFxuICAgICduaWNlJzogR0xfTklDRVNULFxuICAgICdmYXN0JzogR0xfRkFTVEVTVFxuICB9XG5cbiAgdmFyIHdyYXBNb2RlcyA9IHtcbiAgICAncmVwZWF0JzogR0xfUkVQRUFULFxuICAgICdjbGFtcCc6IEdMX0NMQU1QX1RPX0VER0UsXG4gICAgJ21pcnJvcic6IEdMX01JUlJPUkVEX1JFUEVBVFxuICB9XG5cbiAgdmFyIG1hZ0ZpbHRlcnMgPSB7XG4gICAgJ25lYXJlc3QnOiBHTF9ORUFSRVNULFxuICAgICdsaW5lYXInOiBHTF9MSU5FQVJcbiAgfVxuXG4gIHZhciBtaW5GaWx0ZXJzID0gZXh0ZW5kKHtcbiAgICAnbmVhcmVzdCBtaXBtYXAgbmVhcmVzdCc6IEdMX05FQVJFU1RfTUlQTUFQX05FQVJFU1QsXG4gICAgJ2xpbmVhciBtaXBtYXAgbmVhcmVzdCc6IEdMX0xJTkVBUl9NSVBNQVBfTkVBUkVTVCxcbiAgICAnbmVhcmVzdCBtaXBtYXAgbGluZWFyJzogR0xfTkVBUkVTVF9NSVBNQVBfTElORUFSLFxuICAgICdsaW5lYXIgbWlwbWFwIGxpbmVhcic6IEdMX0xJTkVBUl9NSVBNQVBfTElORUFSLFxuICAgICdtaXBtYXAnOiBHTF9MSU5FQVJfTUlQTUFQX0xJTkVBUlxuICB9LCBtYWdGaWx0ZXJzKVxuXG4gIHZhciBjb2xvclNwYWNlID0ge1xuICAgICdub25lJzogMCxcbiAgICAnYnJvd3Nlcic6IEdMX0JST1dTRVJfREVGQVVMVF9XRUJHTFxuICB9XG5cbiAgdmFyIHRleHR1cmVUeXBlcyA9IHtcbiAgICAndWludDgnOiBHTF9VTlNJR05FRF9CWVRFLFxuICAgICdyZ2JhNCc6IEdMX1VOU0lHTkVEX1NIT1JUXzRfNF80XzQsXG4gICAgJ3JnYjU2NSc6IEdMX1VOU0lHTkVEX1NIT1JUXzVfNl81LFxuICAgICdyZ2I1IGExJzogR0xfVU5TSUdORURfU0hPUlRfNV81XzVfMVxuICB9XG5cbiAgdmFyIHRleHR1cmVGb3JtYXRzID0ge1xuICAgICdhbHBoYSc6IEdMX0FMUEhBLFxuICAgICdsdW1pbmFuY2UnOiBHTF9MVU1JTkFOQ0UsXG4gICAgJ2x1bWluYW5jZSBhbHBoYSc6IEdMX0xVTUlOQU5DRV9BTFBIQSxcbiAgICAncmdiJzogR0xfUkdCLFxuICAgICdyZ2JhJzogR0xfUkdCQSxcbiAgICAncmdiYTQnOiBHTF9SR0JBNCxcbiAgICAncmdiNSBhMSc6IEdMX1JHQjVfQTEsXG4gICAgJ3JnYjU2NSc6IEdMX1JHQjU2NVxuICB9XG5cbiAgdmFyIGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cyA9IHt9XG5cbiAgaWYgKGV4dGVuc2lvbnMuZXh0X3NyZ2IpIHtcbiAgICB0ZXh0dXJlRm9ybWF0cy5zcmdiID0gR0xfU1JHQl9FWFRcbiAgICB0ZXh0dXJlRm9ybWF0cy5zcmdiYSA9IEdMX1NSR0JfQUxQSEFfRVhUXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9mbG9hdCkge1xuICAgIHRleHR1cmVUeXBlcy5mbG9hdCA9IEdMX0ZMT0FUXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9oYWxmX2Zsb2F0KSB7XG4gICAgdGV4dHVyZVR5cGVzWydoYWxmIGZsb2F0J10gPSBHTF9IQUxGX0ZMT0FUX09FU1xuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfZGVwdGhfdGV4dHVyZSkge1xuICAgIGV4dGVuZCh0ZXh0dXJlRm9ybWF0cywge1xuICAgICAgJ2RlcHRoJzogR0xfREVQVEhfQ09NUE9ORU5ULFxuICAgICAgJ2RlcHRoIHN0ZW5jaWwnOiBHTF9ERVBUSF9TVEVOQ0lMXG4gICAgfSlcblxuICAgIGV4dGVuZCh0ZXh0dXJlVHlwZXMsIHtcbiAgICAgICd1aW50MTYnOiBHTF9VTlNJR05FRF9TSE9SVCxcbiAgICAgICd1aW50MzInOiBHTF9VTlNJR05FRF9JTlQsXG4gICAgICAnZGVwdGggc3RlbmNpbCc6IEdMX1VOU0lHTkVEX0lOVF8yNF84X1dFQkdMXG4gICAgfSlcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9zM3RjKSB7XG4gICAgZXh0ZW5kKGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cywge1xuICAgICAgJ3JnYiBzM3RjIGR4dDEnOiBHTF9DT01QUkVTU0VEX1JHQl9TM1RDX0RYVDFfRVhULFxuICAgICAgJ3JnYmEgczN0YyBkeHQxJzogR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUMV9FWFQsXG4gICAgICAncmdiYSBzM3RjIGR4dDMnOiBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQzX0VYVCxcbiAgICAgICdyZ2JhIHMzdGMgZHh0NSc6IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDVfRVhUXG4gICAgfSlcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9hdGMpIHtcbiAgICBleHRlbmQoY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzLCB7XG4gICAgICAncmdiIGFyYyc6IEdMX0NPTVBSRVNTRURfUkdCX0FUQ19XRUJHTCxcbiAgICAgICdyZ2JhIGF0YyBleHBsaWNpdCBhbHBoYSc6IEdMX0NPTVBSRVNTRURfUkdCQV9BVENfRVhQTElDSVRfQUxQSEFfV0VCR0wsXG4gICAgICAncmdiYSBhdGMgaW50ZXJwb2xhdGVkIGFscGhhJzogR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19JTlRFUlBPTEFURURfQUxQSEFfV0VCR0xcbiAgICB9KVxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29tcHJlc3NlZF90ZXh0dXJlX3B2cnRjKSB7XG4gICAgZXh0ZW5kKGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cywge1xuICAgICAgJ3JnYiBwdnJ0YyA0YnBwdjEnOiBHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ180QlBQVjFfSU1HLFxuICAgICAgJ3JnYiBwdnJ0YyAyYnBwdjEnOiBHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ18yQlBQVjFfSU1HLFxuICAgICAgJ3JnYmEgcHZydGMgNGJwcHYxJzogR0xfQ09NUFJFU1NFRF9SR0JBX1BWUlRDXzRCUFBWMV9JTUcsXG4gICAgICAncmdiYSBwdnJ0YyAyYnBwdjEnOiBHTF9DT01QUkVTU0VEX1JHQkFfUFZSVENfMkJQUFYxX0lNR1xuICAgIH0pXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb21wcmVzc2VkX3RleHR1cmVfZXRjMSkge1xuICAgIGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0c1sncmdiIGV0YzEnXSA9IEdMX0NPTVBSRVNTRURfUkdCX0VUQzFfV0VCR0xcbiAgfVxuXG4gIC8vIENvcHkgb3ZlciBhbGwgdGV4dHVyZSBmb3JtYXRzXG4gIHZhciBzdXBwb3J0ZWRDb21wcmVzc2VkRm9ybWF0cyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKFxuICAgIGdsLmdldFBhcmFtZXRlcihHTF9DT01QUkVTU0VEX1RFWFRVUkVfRk9STUFUUykpXG4gIE9iamVjdC5rZXlzKGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cykuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgIHZhciBmb3JtYXQgPSBjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHNbbmFtZV1cbiAgICBpZiAoc3VwcG9ydGVkQ29tcHJlc3NlZEZvcm1hdHMuaW5kZXhPZihmb3JtYXQpID49IDApIHtcbiAgICAgIHRleHR1cmVGb3JtYXRzW25hbWVdID0gZm9ybWF0XG4gICAgfVxuICB9KVxuXG4gIHZhciBzdXBwb3J0ZWRGb3JtYXRzID0gT2JqZWN0LmtleXModGV4dHVyZUZvcm1hdHMpXG4gIGxpbWl0cy50ZXh0dXJlRm9ybWF0cyA9IHN1cHBvcnRlZEZvcm1hdHNcblxuICB2YXIgY29sb3JGb3JtYXRzID0gc3VwcG9ydGVkRm9ybWF0cy5yZWR1Y2UoZnVuY3Rpb24gKGNvbG9yLCBrZXkpIHtcbiAgICB2YXIgZ2xlbnVtID0gdGV4dHVyZUZvcm1hdHNba2V5XVxuICAgIGlmIChnbGVudW0gPT09IEdMX0xVTUlOQU5DRSB8fFxuICAgICAgICBnbGVudW0gPT09IEdMX0FMUEhBIHx8XG4gICAgICAgIGdsZW51bSA9PT0gR0xfTFVNSU5BTkNFIHx8XG4gICAgICAgIGdsZW51bSA9PT0gR0xfTFVNSU5BTkNFX0FMUEhBIHx8XG4gICAgICAgIGdsZW51bSA9PT0gR0xfREVQVEhfQ09NUE9ORU5UIHx8XG4gICAgICAgIGdsZW51bSA9PT0gR0xfREVQVEhfU1RFTkNJTCkge1xuICAgICAgY29sb3JbZ2xlbnVtXSA9IGdsZW51bVxuICAgIH0gZWxzZSBpZiAoZ2xlbnVtID09PSBHTF9SR0I1X0ExIHx8IGtleS5pbmRleE9mKCdyZ2JhJykgPj0gMCkge1xuICAgICAgY29sb3JbZ2xlbnVtXSA9IEdMX1JHQkFcbiAgICB9IGVsc2Uge1xuICAgICAgY29sb3JbZ2xlbnVtXSA9IEdMX1JHQlxuICAgIH1cbiAgICByZXR1cm4gY29sb3JcbiAgfSwge30pXG5cbiAgLy8gUGl4ZWwgc3RvcmFnZSBwYXJzaW5nXG4gIGZ1bmN0aW9uIFBpeGVsSW5mbyAodGFyZ2V0KSB7XG4gICAgLy8gdGV4IHRhcmdldFxuICAgIHRoaXMudGFyZ2V0ID0gdGFyZ2V0XG5cbiAgICAvLyBwaXhlbFN0b3JlaSBpbmZvXG4gICAgdGhpcy5mbGlwWSA9IGZhbHNlXG4gICAgdGhpcy5wcmVtdWx0aXBseUFscGhhID0gZmFsc2VcbiAgICB0aGlzLnVucGFja0FsaWdubWVudCA9IDFcbiAgICB0aGlzLmNvbG9yU3BhY2UgPSAwXG5cbiAgICAvLyBzaGFwZVxuICAgIHRoaXMud2lkdGggPSAwXG4gICAgdGhpcy5oZWlnaHQgPSAwXG4gICAgdGhpcy5jaGFubmVscyA9IDBcblxuICAgIC8vIGZvcm1hdCBhbmQgdHlwZVxuICAgIHRoaXMuZm9ybWF0ID0gMFxuICAgIHRoaXMuaW50ZXJuYWxmb3JtYXQgPSAwXG4gICAgdGhpcy50eXBlID0gMFxuICAgIHRoaXMuY29tcHJlc3NlZCA9IGZhbHNlXG5cbiAgICAvLyBtaXAgbGV2ZWxcbiAgICB0aGlzLm1pcGxldmVsID0gMFxuXG4gICAgLy8gbmRhcnJheS1saWtlIHBhcmFtZXRlcnNcbiAgICB0aGlzLnN0cmlkZVggPSAwXG4gICAgdGhpcy5zdHJpZGVZID0gMFxuICAgIHRoaXMuc3RyaWRlQyA9IDBcbiAgICB0aGlzLm9mZnNldCA9IDBcblxuICAgIC8vIGNvcHkgcGl4ZWxzIGluZm9cbiAgICB0aGlzLnggPSAwXG4gICAgdGhpcy55ID0gMFxuICAgIHRoaXMuY29weSA9IGZhbHNlXG5cbiAgICAvLyBkYXRhIHNvdXJjZXNcbiAgICB0aGlzLmRhdGEgPSBudWxsXG4gICAgdGhpcy5pbWFnZSA9IG51bGxcbiAgICB0aGlzLnZpZGVvID0gbnVsbFxuICAgIHRoaXMuY2FudmFzID0gbnVsbFxuICAgIHRoaXMueGhyID0gbnVsbFxuXG4gICAgLy8gQ09SU1xuICAgIHRoaXMuY3Jvc3NPcmlnaW4gPSBudWxsXG5cbiAgICAvLyBob3JyaWJsZSBzdGF0ZSBmbGFnc1xuICAgIHRoaXMubmVlZHNQb2xsID0gZmFsc2VcbiAgICB0aGlzLm5lZWRzTGlzdGVuZXJzID0gZmFsc2VcbiAgfVxuXG4gIGV4dGVuZChQaXhlbEluZm8ucHJvdG90eXBlLCB7XG4gICAgcGFyc2VGbGFnczogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucyAhPT0gJ29iamVjdCcgfHwgIW9wdGlvbnMpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG5cbiAgICAgIGlmICgncHJlbXVsdGlwbHlBbHBoYScgaW4gb3B0aW9ucykge1xuICAgICAgICBcbiAgICAgICAgdGhpcy5wcmVtdWx0aXBseUFscGhhID0gb3B0aW9ucy5wcmVtdWx0aXBseUFscGhhXG4gICAgICB9XG5cbiAgICAgIGlmICgnZmxpcFknIGluIG9wdGlvbnMpIHtcbiAgICAgICAgXG4gICAgICAgIHRoaXMuZmxpcFkgPSBvcHRpb25zLmZsaXBZXG4gICAgICB9XG5cbiAgICAgIGlmICgnYWxpZ25tZW50JyBpbiBvcHRpb25zKSB7XG4gICAgICAgIFxuICAgICAgICB0aGlzLnVucGFja0FsaWdubWVudCA9IG9wdGlvbnMuYWxpZ25tZW50XG4gICAgICB9XG5cbiAgICAgIGlmICgnY29sb3JTcGFjZScgaW4gb3B0aW9ucykge1xuICAgICAgICBcbiAgICAgICAgdGhpcy5jb2xvclNwYWNlID0gY29sb3JTcGFjZVtvcHRpb25zLmNvbG9yU3BhY2VdXG4gICAgICB9XG5cbiAgICAgIGlmICgnZm9ybWF0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBmb3JtYXQgPSBvcHRpb25zLmZvcm1hdFxuICAgICAgICBcbiAgICAgICAgdGhpcy5pbnRlcm5hbGZvcm1hdCA9IHRleHR1cmVGb3JtYXRzW2Zvcm1hdF1cbiAgICAgICAgaWYgKGZvcm1hdCBpbiB0ZXh0dXJlVHlwZXMpIHtcbiAgICAgICAgICB0aGlzLnR5cGUgPSB0ZXh0dXJlVHlwZXNbZm9ybWF0XVxuICAgICAgICB9XG4gICAgICAgIGlmIChmb3JtYXQgaW4gY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzKSB7XG4gICAgICAgICAgdGhpcy5jb21wcmVzc2VkID0gdHJ1ZVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmICgndHlwZScgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgdHlwZSA9IG9wdGlvbnMudHlwZVxuICAgICAgICBcbiAgICAgICAgdGhpcy50eXBlID0gdGV4dHVyZVR5cGVzW3R5cGVdXG4gICAgICB9XG5cbiAgICAgIHZhciB3ID0gdGhpcy53aWR0aFxuICAgICAgdmFyIGggPSB0aGlzLmhlaWdodFxuICAgICAgdmFyIGMgPSB0aGlzLmNoYW5uZWxzXG4gICAgICBpZiAoJ3NoYXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIFxuICAgICAgICB3ID0gb3B0aW9ucy5zaGFwZVswXVxuICAgICAgICBoID0gb3B0aW9ucy5zaGFwZVsxXVxuICAgICAgICBpZiAob3B0aW9ucy5zaGFwZS5sZW5ndGggPT09IDMpIHtcbiAgICAgICAgICBjID0gb3B0aW9ucy5zaGFwZVsyXVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoJ3JhZGl1cycgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHcgPSBoID0gb3B0aW9ucy5yYWRpdXNcbiAgICAgICAgfVxuICAgICAgICBpZiAoJ3dpZHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgdyA9IG9wdGlvbnMud2lkdGhcbiAgICAgICAgfVxuICAgICAgICBpZiAoJ2hlaWdodCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGggPSBvcHRpb25zLmhlaWdodFxuICAgICAgICB9XG4gICAgICAgIGlmICgnY2hhbm5lbHMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBjID0gb3B0aW9ucy5jaGFubmVsc1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICB0aGlzLndpZHRoID0gdyB8IDBcbiAgICAgIHRoaXMuaGVpZ2h0ID0gaCB8IDBcbiAgICAgIHRoaXMuY2hhbm5lbHMgPSBjIHwgMFxuXG4gICAgICBpZiAoJ3N0cmlkZScgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgc3RyaWRlID0gb3B0aW9ucy5zdHJpZGVcbiAgICAgICAgXG4gICAgICAgIHRoaXMuc3RyaWRlWCA9IHN0cmlkZVswXVxuICAgICAgICB0aGlzLnN0cmlkZVkgPSBzdHJpZGVbMV1cbiAgICAgICAgaWYgKHN0cmlkZS5sZW5ndGggPT09IDMpIHtcbiAgICAgICAgICB0aGlzLnN0cmlkZUMgPSBzdHJpZGVbMl1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLnN0cmlkZUMgPSAxXG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5uZWVkc1RyYW5zcG9zZSA9IHRydWVcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuc3RyaWRlQyA9IDFcbiAgICAgICAgdGhpcy5zdHJpZGVYID0gdGhpcy5zdHJpZGVDICogY1xuICAgICAgICB0aGlzLnN0cmlkZVkgPSB0aGlzLnN0cmlkZVggKiB3XG4gICAgICB9XG5cbiAgICAgIGlmICgnb2Zmc2V0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHRoaXMub2Zmc2V0ID0gb3B0aW9ucy5vZmZzZXQgfCAwXG4gICAgICAgIHRoaXMubmVlZHNUcmFuc3Bvc2UgPSB0cnVlXG4gICAgICB9XG5cbiAgICAgIGlmICgnY3Jvc3NPcmlnaW4nIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdGhpcy5jcm9zc09yaWdpbiA9IG9wdGlvbnMuY3Jvc3NPcmlnaW5cbiAgICAgIH1cbiAgICB9LFxuICAgIHBhcnNlOiBmdW5jdGlvbiAob3B0aW9ucywgbWlwbGV2ZWwpIHtcbiAgICAgIHRoaXMubWlwbGV2ZWwgPSBtaXBsZXZlbFxuICAgICAgdGhpcy53aWR0aCA9IHRoaXMud2lkdGggPj4gbWlwbGV2ZWxcbiAgICAgIHRoaXMuaGVpZ2h0ID0gdGhpcy5oZWlnaHQgPj4gbWlwbGV2ZWxcblxuICAgICAgdmFyIGRhdGEgPSBvcHRpb25zXG4gICAgICBzd2l0Y2ggKHR5cGVvZiBvcHRpb25zKSB7XG4gICAgICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgICAgICBpZiAoIW9wdGlvbnMpIHtcbiAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgIH1cbiAgICAgICAgICB0aGlzLnBhcnNlRmxhZ3Mob3B0aW9ucylcbiAgICAgICAgICBpZiAoaXNQaXhlbERhdGEob3B0aW9ucy5kYXRhKSkge1xuICAgICAgICAgICAgZGF0YSA9IG9wdGlvbnMuZGF0YVxuICAgICAgICAgIH1cbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlICd1bmRlZmluZWQnOlxuICAgICAgICAgIHJldHVyblxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIFxuICAgICAgfVxuXG4gICAgICBpZiAodHlwZW9mIGRhdGEgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGRhdGEgPSBsb2FkVGV4dHVyZShkYXRhLCB0aGlzLmNyb3NzT3JpZ2luKVxuICAgICAgfVxuXG4gICAgICB2YXIgYXJyYXkgPSBudWxsXG4gICAgICB2YXIgbmVlZHNDb252ZXJ0ID0gZmFsc2VcblxuICAgICAgaWYgKHRoaXMuY29tcHJlc3NlZCkge1xuICAgICAgICBcbiAgICAgIH1cblxuICAgICAgaWYgKGRhdGEgPT09IG51bGwpIHtcbiAgICAgICAgLy8gVE9ET1xuICAgICAgfSBlbHNlIGlmIChpc1R5cGVkQXJyYXkoZGF0YSkpIHtcbiAgICAgICAgdGhpcy5kYXRhID0gZGF0YVxuICAgICAgfSBlbHNlIGlmIChpc051bWVyaWNBcnJheShkYXRhKSkge1xuICAgICAgICBhcnJheSA9IGRhdGFcbiAgICAgICAgbmVlZHNDb252ZXJ0ID0gdHJ1ZVxuICAgICAgfSBlbHNlIGlmIChpc05EQXJyYXlMaWtlKGRhdGEpKSB7XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KGRhdGEuZGF0YSkpIHtcbiAgICAgICAgICBhcnJheSA9IGRhdGEuZGF0YVxuICAgICAgICAgIG5lZWRzQ29udmVydCA9IHRydWVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLmRhdGEgPSBkYXRhLmRhdGFcbiAgICAgICAgfVxuICAgICAgICB2YXIgc2hhcGUgPSBkYXRhLnNoYXBlXG4gICAgICAgIHRoaXMud2lkdGggPSBzaGFwZVswXVxuICAgICAgICB0aGlzLmhlaWdodCA9IHNoYXBlWzFdXG4gICAgICAgIGlmIChzaGFwZS5sZW5ndGggPT09IDMpIHtcbiAgICAgICAgICB0aGlzLmNoYW5uZWxzID0gc2hhcGVbMl1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLmNoYW5uZWxzID0gMVxuICAgICAgICB9XG4gICAgICAgIHZhciBzdHJpZGUgPSBkYXRhLnN0cmlkZVxuICAgICAgICB0aGlzLnN0cmlkZVggPSBkYXRhLnN0cmlkZVswXVxuICAgICAgICB0aGlzLnN0cmlkZVkgPSBkYXRhLnN0cmlkZVsxXVxuICAgICAgICBpZiAoc3RyaWRlLmxlbmd0aCA9PT0gMykge1xuICAgICAgICAgIHRoaXMuc3RyaWRlQyA9IGRhdGEuc3RyaWRlWzJdXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5zdHJpZGVDID0gMVxuICAgICAgICB9XG4gICAgICAgIHRoaXMub2Zmc2V0ID0gZGF0YS5vZmZzZXRcbiAgICAgICAgdGhpcy5uZWVkc1RyYW5zcG9zZSA9IHRydWVcbiAgICAgIH0gZWxzZSBpZiAoaXNDYW52YXNFbGVtZW50KGRhdGEpIHx8IGlzQ29udGV4dDJEKGRhdGEpKSB7XG4gICAgICAgIGlmIChpc0NhbnZhc0VsZW1lbnQoZGF0YSkpIHtcbiAgICAgICAgICB0aGlzLmNhbnZhcyA9IGRhdGFcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLmNhbnZhcyA9IGRhdGEuY2FudmFzXG4gICAgICAgIH1cbiAgICAgICAgdGhpcy53aWR0aCA9IHRoaXMuY2FudmFzLndpZHRoXG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gdGhpcy5jYW52YXMuaGVpZ2h0XG4gICAgICAgIHRoaXMuc2V0RGVmYXVsdEZvcm1hdCgpXG4gICAgICB9IGVsc2UgaWYgKGlzSW1hZ2VFbGVtZW50KGRhdGEpKSB7XG4gICAgICAgIHRoaXMuaW1hZ2UgPSBkYXRhXG4gICAgICAgIGlmICghZGF0YS5jb21wbGV0ZSkge1xuICAgICAgICAgIHRoaXMud2lkdGggPSB0aGlzLndpZHRoIHx8IGRhdGEubmF0dXJhbFdpZHRoXG4gICAgICAgICAgdGhpcy5oZWlnaHQgPSB0aGlzLmhlaWdodCB8fCBkYXRhLm5hdHVyYWxIZWlnaHRcbiAgICAgICAgICB0aGlzLm5lZWRzTGlzdGVuZXJzID0gdHJ1ZVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMud2lkdGggPSBkYXRhLm5hdHVyYWxXaWR0aFxuICAgICAgICAgIHRoaXMuaGVpZ2h0ID0gZGF0YS5uYXR1cmFsSGVpZ2h0XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zZXREZWZhdWx0Rm9ybWF0KClcbiAgICAgIH0gZWxzZSBpZiAoaXNWaWRlb0VsZW1lbnQoZGF0YSkpIHtcbiAgICAgICAgdGhpcy52aWRlbyA9IGRhdGFcbiAgICAgICAgaWYgKGRhdGEucmVhZHlTdGF0ZSA+IDEpIHtcbiAgICAgICAgICB0aGlzLndpZHRoID0gZGF0YS53aWR0aFxuICAgICAgICAgIHRoaXMuaGVpZ2h0ID0gZGF0YS5oZWlnaHRcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLndpZHRoID0gdGhpcy53aWR0aCB8fCBkYXRhLndpZHRoXG4gICAgICAgICAgdGhpcy5oZWlnaHQgPSB0aGlzLmhlaWdodCB8fCBkYXRhLmhlaWdodFxuICAgICAgICAgIHRoaXMubmVlZHNMaXN0ZW5lcnMgPSB0cnVlXG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5uZWVkc1BvbGwgPSB0cnVlXG4gICAgICAgIHRoaXMuc2V0RGVmYXVsdEZvcm1hdCgpXG4gICAgICB9IGVsc2UgaWYgKGlzUGVuZGluZ1hIUihkYXRhKSkge1xuICAgICAgICB0aGlzLnhociA9IGRhdGFcbiAgICAgICAgdGhpcy5uZWVkc0xpc3RlbmVycyA9IHRydWVcbiAgICAgIH0gZWxzZSBpZiAoaXNSZWN0QXJyYXkoZGF0YSkpIHtcbiAgICAgICAgdmFyIHcgPSBkYXRhLmxlbmd0aFxuICAgICAgICB2YXIgaCA9IGRhdGFbMF0ubGVuZ3RoXG4gICAgICAgIHZhciBjID0gMVxuICAgICAgICB2YXIgaSwgaiwgaywgcFxuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShkYXRhWzBdWzBdKSkge1xuICAgICAgICAgIGMgPSBkYXRhWzBdWzBdLmxlbmd0aFxuICAgICAgICAgIFxuICAgICAgICAgIGFycmF5ID0gQXJyYXkodyAqIGggKiBjKVxuICAgICAgICAgIHAgPSAwXG4gICAgICAgICAgZm9yIChqID0gMDsgaiA8IGg7ICsraikge1xuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IHc7ICsraSkge1xuICAgICAgICAgICAgICBmb3IgKGsgPSAwOyBrIDwgYzsgKytrKSB7XG4gICAgICAgICAgICAgICAgYXJyYXlbcCsrXSA9IGRhdGFbaV1bal1ba11cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBhcnJheSA9IEFycmF5KHcgKiBoKVxuICAgICAgICAgIHAgPSAwXG4gICAgICAgICAgZm9yIChqID0gMDsgaiA8IGg7ICsraikge1xuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IHc7ICsraSkge1xuICAgICAgICAgICAgICBhcnJheVtwKytdID0gZGF0YVtpXVtqXVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLndpZHRoID0gd1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhcbiAgICAgICAgdGhpcy5jaGFubmVscyA9IGNcbiAgICAgICAgbmVlZHNDb252ZXJ0ID0gdHJ1ZVxuICAgICAgfSBlbHNlIGlmIChvcHRpb25zLmNvcHkpIHtcbiAgICAgICAgdGhpcy5jb3B5ID0gdHJ1ZVxuICAgICAgICB0aGlzLnggPSB0aGlzLnggfCAwXG4gICAgICAgIHRoaXMueSA9IHRoaXMueSB8IDBcbiAgICAgICAgdGhpcy53aWR0aCA9ICh0aGlzLndpZHRoIHx8IHZpZXdwb3J0U3RhdGUud2lkdGgpIHwgMFxuICAgICAgICB0aGlzLmhlaWdodCA9ICh0aGlzLmhlaWdodCB8fCB2aWV3cG9ydFN0YXRlLmhlaWdodCkgfCAwXG4gICAgICAgIHRoaXMuc2V0RGVmYXVsdEZvcm1hdCgpXG4gICAgICB9XG5cbiAgICAgIC8vIEZpeCB1cCBtaXNzaW5nIHR5cGUgaW5mbyBmb3IgdHlwZWQgYXJyYXlzXG4gICAgICBpZiAoIXRoaXMudHlwZSAmJiB0aGlzLmRhdGEpIHtcbiAgICAgICAgaWYgKHRoaXMuZm9ybWF0ID09PSBHTF9ERVBUSF9DT01QT05FTlQpIHtcbiAgICAgICAgICBpZiAodGhpcy5kYXRhIGluc3RhbmNlb2YgVWludDE2QXJyYXkpIHtcbiAgICAgICAgICAgIHRoaXMudHlwZSA9IEdMX1VOU0lHTkVEX1NIT1JUXG4gICAgICAgICAgfSBlbHNlIGlmICh0aGlzLmRhdGEgaW5zdGFuY2VvZiBVaW50MzJBcnJheSkge1xuICAgICAgICAgICAgdGhpcy50eXBlID0gR0xfVU5TSUdORURfSU5UXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuZGF0YSBpbnN0YW5jZW9mIEZsb2F0MzJBcnJheSkge1xuICAgICAgICAgIHRoaXMudHlwZSA9IEdMX0ZMT0FUXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gSW5mZXIgZGVmYXVsdCBmb3JtYXRcbiAgICAgIGlmICghdGhpcy5pbnRlcm5hbGZvcm1hdCkge1xuICAgICAgICB2YXIgY2hhbm5lbHMgPSB0aGlzLmNoYW5uZWxzID0gdGhpcy5jaGFubmVscyB8fCA0XG4gICAgICAgIHRoaXMuaW50ZXJuYWxmb3JtYXQgPSBbXG4gICAgICAgICAgR0xfTFVNSU5BTkNFLFxuICAgICAgICAgIEdMX0xVTUlOQU5DRV9BTFBIQSxcbiAgICAgICAgICBHTF9SR0IsXG4gICAgICAgICAgR0xfUkdCQV1bY2hhbm5lbHMgLSAxXVxuICAgICAgICBcbiAgICAgIH1cblxuICAgICAgdmFyIGZvcm1hdCA9IHRoaXMuaW50ZXJuYWxmb3JtYXRcbiAgICAgIGlmIChmb3JtYXQgPT09IEdMX0RFUFRIX0NPTVBPTkVOVCB8fCBmb3JtYXQgPT09IEdMX0RFUFRIX1NURU5DSUwpIHtcbiAgICAgICAgXG4gICAgICAgIGlmIChmb3JtYXQgPT09IEdMX0RFUFRIX0NPTVBPTkVOVCkge1xuICAgICAgICAgIFxuICAgICAgICB9XG4gICAgICAgIGlmIChmb3JtYXQgPT09IEdMX0RFUFRIX1NURU5DSUwpIHtcbiAgICAgICAgICBcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgIH1cblxuICAgICAgLy8gQ29tcHV0ZSBjb2xvciBmb3JtYXQgYW5kIG51bWJlciBvZiBjaGFubmVsc1xuICAgICAgdmFyIGNvbG9yRm9ybWF0ID0gdGhpcy5mb3JtYXQgPSBjb2xvckZvcm1hdHNbZm9ybWF0XVxuICAgICAgaWYgKCF0aGlzLmNoYW5uZWxzKSB7XG4gICAgICAgIHN3aXRjaCAoY29sb3JGb3JtYXQpIHtcbiAgICAgICAgICBjYXNlIEdMX0xVTUlOQU5DRTpcbiAgICAgICAgICBjYXNlIEdMX0FMUEhBOlxuICAgICAgICAgIGNhc2UgR0xfREVQVEhfQ09NUE9ORU5UOlxuICAgICAgICAgICAgdGhpcy5jaGFubmVscyA9IDFcbiAgICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgICBjYXNlIEdMX0RFUFRIX1NURU5DSUw6XG4gICAgICAgICAgY2FzZSBHTF9MVU1JTkFOQ0VfQUxQSEE6XG4gICAgICAgICAgICB0aGlzLmNoYW5uZWxzID0gMlxuICAgICAgICAgICAgYnJlYWtcblxuICAgICAgICAgIGNhc2UgR0xfUkdCOlxuICAgICAgICAgICAgdGhpcy5jaGFubmVscyA9IDNcbiAgICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgdGhpcy5jaGFubmVscyA9IDRcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBDaGVjayB0aGF0IHRleHR1cmUgdHlwZSBpcyBzdXBwb3J0ZWRcbiAgICAgIHZhciB0eXBlID0gdGhpcy50eXBlXG4gICAgICBpZiAodHlwZSA9PT0gR0xfRkxPQVQpIHtcbiAgICAgICAgXG4gICAgICB9IGVsc2UgaWYgKHR5cGUgPT09IEdMX0hBTEZfRkxPQVRfT0VTKSB7XG4gICAgICAgIFxuICAgICAgfSBlbHNlIGlmICghdHlwZSkge1xuICAgICAgICBpZiAoZm9ybWF0ID09PSBHTF9ERVBUSF9DT01QT05FTlQpIHtcbiAgICAgICAgICB0eXBlID0gR0xfVU5TSUdORURfSU5UXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdHlwZSA9IEdMX1VOU0lHTkVEX0JZVEVcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgdGhpcy50eXBlID0gdHlwZVxuXG4gICAgICAvLyBhcHBseSBjb252ZXJzaW9uXG4gICAgICBpZiAobmVlZHNDb252ZXJ0KSB7XG4gICAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfQllURTpcbiAgICAgICAgICAgIHRoaXMuZGF0YSA9IG5ldyBVaW50OEFycmF5KGFycmF5KVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUOlxuICAgICAgICAgICAgdGhpcy5kYXRhID0gbmV3IFVpbnQxNkFycmF5KGFycmF5KVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX0lOVDpcbiAgICAgICAgICAgIHRoaXMuZGF0YSA9IG5ldyBVaW50MzJBcnJheShhcnJheSlcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSBHTF9GTE9BVDpcbiAgICAgICAgICAgIHRoaXMuZGF0YSA9IG5ldyBGbG9hdDMyQXJyYXkoYXJyYXkpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgR0xfSEFMRl9GTE9BVF9PRVM6XG4gICAgICAgICAgICB0aGlzLmRhdGEgPSBjb252ZXJ0VG9IYWxmRmxvYXQoYXJyYXkpXG4gICAgICAgICAgICBicmVha1xuXG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9TSE9SVF81XzZfNTpcbiAgICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUXzVfNV81XzE6XG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9TSE9SVF80XzRfNF80OlxuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfSU5UXzI0XzhfV0VCR0w6XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMuZGF0YSkge1xuICAgICAgICAvLyBhcHBseSB0cmFuc3Bvc2VcbiAgICAgICAgaWYgKHRoaXMubmVlZHNUcmFuc3Bvc2UpIHtcbiAgICAgICAgICB0aGlzLmRhdGEgPSB0cmFuc3Bvc2VQaXhlbHMoXG4gICAgICAgICAgICB0aGlzLmRhdGEsXG4gICAgICAgICAgICB0aGlzLndpZHRoLFxuICAgICAgICAgICAgdGhpcy5oZWlnaHQsXG4gICAgICAgICAgICB0aGlzLmNoYW5uZWxzLFxuICAgICAgICAgICAgdGhpcy5zdHJpZGVYLFxuICAgICAgICAgICAgdGhpcy5zdHJpZGVZLFxuICAgICAgICAgICAgdGhpcy5zdHJpZGVDLFxuICAgICAgICAgICAgdGhpcy5vZmZzZXQpXG4gICAgICAgIH1cbiAgICAgICAgLy8gY2hlY2sgZGF0YSB0eXBlXG4gICAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfQllURTpcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUXzVfNl81OlxuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlRfNV81XzVfMTpcbiAgICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUXzRfNF80XzQ6XG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9TSE9SVDpcbiAgICAgICAgICBjYXNlIEdMX0hBTEZfRkxPQVRfT0VTOlxuICAgICAgICAgICAgXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfSU5UOlxuICAgICAgICAgICAgXG4gICAgICAgICAgICBicmVha1xuXG4gICAgICAgICAgY2FzZSBHTF9GTE9BVDpcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgYnJlYWtcblxuICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICBcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICB0aGlzLm5lZWRzVHJhbnNwb3NlID0gZmFsc2VcbiAgICB9LFxuXG4gICAgc2V0RGVmYXVsdEZvcm1hdDogZnVuY3Rpb24gKCkge1xuICAgICAgdGhpcy5mb3JtYXQgPSB0aGlzLmludGVybmFsZm9ybWF0ID0gR0xfUkdCQVxuICAgICAgdGhpcy50eXBlID0gR0xfVU5TSUdORURfQllURVxuICAgICAgdGhpcy5jaGFubmVscyA9IDRcbiAgICAgIHRoaXMuY29tcHJlc3NlZCA9IGZhbHNlXG4gICAgfSxcblxuICAgIHVwbG9hZDogZnVuY3Rpb24gKHBhcmFtcykge1xuICAgICAgZ2wucGl4ZWxTdG9yZWkoR0xfVU5QQUNLX0ZMSVBfWV9XRUJHTCwgdGhpcy5mbGlwWSlcbiAgICAgIGdsLnBpeGVsU3RvcmVpKEdMX1VOUEFDS19QUkVNVUxUSVBMWV9BTFBIQV9XRUJHTCwgdGhpcy5wcmVtdWx0aXBseUFscGhhKVxuICAgICAgZ2wucGl4ZWxTdG9yZWkoR0xfVU5QQUNLX0NPTE9SU1BBQ0VfQ09OVkVSU0lPTl9XRUJHTCwgdGhpcy5jb2xvclNwYWNlKVxuICAgICAgZ2wucGl4ZWxTdG9yZWkoR0xfVU5QQUNLX0FMSUdOTUVOVCwgdGhpcy51bnBhY2tBbGlnbm1lbnQpXG5cbiAgICAgIHZhciB0YXJnZXQgPSB0aGlzLnRhcmdldFxuICAgICAgdmFyIG1pcGxldmVsID0gdGhpcy5taXBsZXZlbFxuICAgICAgdmFyIGltYWdlID0gdGhpcy5pbWFnZVxuICAgICAgdmFyIGNhbnZhcyA9IHRoaXMuY2FudmFzXG4gICAgICB2YXIgdmlkZW8gPSB0aGlzLnZpZGVvXG4gICAgICB2YXIgZGF0YSA9IHRoaXMuZGF0YVxuICAgICAgdmFyIGludGVybmFsZm9ybWF0ID0gdGhpcy5pbnRlcm5hbGZvcm1hdFxuICAgICAgdmFyIGZvcm1hdCA9IHRoaXMuZm9ybWF0XG4gICAgICB2YXIgdHlwZSA9IHRoaXMudHlwZVxuICAgICAgdmFyIHdpZHRoID0gdGhpcy53aWR0aCB8fCBNYXRoLm1heCgxLCBwYXJhbXMud2lkdGggPj4gbWlwbGV2ZWwpXG4gICAgICB2YXIgaGVpZ2h0ID0gdGhpcy5oZWlnaHQgfHwgTWF0aC5tYXgoMSwgcGFyYW1zLmhlaWdodCA+PiBtaXBsZXZlbClcbiAgICAgIGlmICh2aWRlbyAmJiB2aWRlby5yZWFkeVN0YXRlID4gMikge1xuICAgICAgICBnbC50ZXhJbWFnZTJEKHRhcmdldCwgbWlwbGV2ZWwsIGZvcm1hdCwgZm9ybWF0LCB0eXBlLCB2aWRlbylcbiAgICAgIH0gZWxzZSBpZiAoaW1hZ2UgJiYgaW1hZ2UuY29tcGxldGUpIHtcbiAgICAgICAgZ2wudGV4SW1hZ2UyRCh0YXJnZXQsIG1pcGxldmVsLCBmb3JtYXQsIGZvcm1hdCwgdHlwZSwgaW1hZ2UpXG4gICAgICB9IGVsc2UgaWYgKGNhbnZhcykge1xuICAgICAgICBnbC50ZXhJbWFnZTJEKHRhcmdldCwgbWlwbGV2ZWwsIGZvcm1hdCwgZm9ybWF0LCB0eXBlLCBjYW52YXMpXG4gICAgICB9IGVsc2UgaWYgKHRoaXMuY29tcHJlc3NlZCkge1xuICAgICAgICBnbC5jb21wcmVzc2VkVGV4SW1hZ2UyRCh0YXJnZXQsIG1pcGxldmVsLCBpbnRlcm5hbGZvcm1hdCwgd2lkdGgsIGhlaWdodCwgMCwgZGF0YSlcbiAgICAgIH0gZWxzZSBpZiAodGhpcy5jb3B5KSB7XG4gICAgICAgIHJlZ2xQb2xsKClcbiAgICAgICAgZ2wuY29weVRleEltYWdlMkQodGFyZ2V0LCBtaXBsZXZlbCwgZm9ybWF0LCB0aGlzLngsIHRoaXMueSwgd2lkdGgsIGhlaWdodCwgMClcbiAgICAgIH0gZWxzZSBpZiAoZGF0YSkge1xuICAgICAgICBnbC50ZXhJbWFnZTJEKHRhcmdldCwgbWlwbGV2ZWwsIGZvcm1hdCwgd2lkdGgsIGhlaWdodCwgMCwgZm9ybWF0LCB0eXBlLCBkYXRhKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZ2wudGV4SW1hZ2UyRCh0YXJnZXQsIG1pcGxldmVsLCBmb3JtYXQsIHdpZHRoIHx8IDEsIGhlaWdodCB8fCAxLCAwLCBmb3JtYXQsIHR5cGUsIG51bGwpXG4gICAgICB9XG4gICAgfVxuICB9KVxuXG4gIGZ1bmN0aW9uIFRleFBhcmFtcyAodGFyZ2V0KSB7XG4gICAgdGhpcy50YXJnZXQgPSB0YXJnZXRcblxuICAgIC8vIERlZmF1bHQgaW1hZ2Ugc2hhcGUgaW5mb1xuICAgIHRoaXMud2lkdGggPSAwXG4gICAgdGhpcy5oZWlnaHQgPSAwXG4gICAgdGhpcy5mb3JtYXQgPSAwXG4gICAgdGhpcy5pbnRlcm5hbGZvcm1hdCA9IDBcbiAgICB0aGlzLnR5cGUgPSAwXG5cbiAgICAvLyB3cmFwIG1vZGVcbiAgICB0aGlzLndyYXBTID0gR0xfQ0xBTVBfVE9fRURHRVxuICAgIHRoaXMud3JhcFQgPSBHTF9DTEFNUF9UT19FREdFXG5cbiAgICAvLyBmaWx0ZXJpbmdcbiAgICB0aGlzLm1pbkZpbHRlciA9IDBcbiAgICB0aGlzLm1hZ0ZpbHRlciA9IEdMX05FQVJFU1RcbiAgICB0aGlzLmFuaXNvdHJvcGljID0gMVxuXG4gICAgLy8gbWlwbWFwc1xuICAgIHRoaXMuZ2VuTWlwbWFwcyA9IGZhbHNlXG4gICAgdGhpcy5taXBtYXBIaW50ID0gR0xfRE9OVF9DQVJFXG4gIH1cblxuICBleHRlbmQoVGV4UGFyYW1zLnByb3RvdHlwZSwge1xuICAgIHBhcnNlOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgaWYgKHR5cGVvZiBvcHRpb25zICE9PSAnb2JqZWN0JyB8fCAhb3B0aW9ucykge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgaWYgKCdtaW4nIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIG1pbkZpbHRlciA9IG9wdGlvbnMubWluXG4gICAgICAgIFxuICAgICAgICB0aGlzLm1pbkZpbHRlciA9IG1pbkZpbHRlcnNbbWluRmlsdGVyXVxuICAgICAgfVxuXG4gICAgICBpZiAoJ21hZycgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgbWFnRmlsdGVyID0gb3B0aW9ucy5tYWdcbiAgICAgICAgXG4gICAgICAgIHRoaXMubWFnRmlsdGVyID0gbWFnRmlsdGVyc1ttYWdGaWx0ZXJdXG4gICAgICB9XG5cbiAgICAgIHZhciB3cmFwUyA9IHRoaXMud3JhcFNcbiAgICAgIHZhciB3cmFwVCA9IHRoaXMud3JhcFRcbiAgICAgIGlmICgnd3JhcCcgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgd3JhcCA9IG9wdGlvbnMud3JhcFxuICAgICAgICBpZiAodHlwZW9mIHdyYXAgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgXG4gICAgICAgICAgd3JhcFMgPSB3cmFwVCA9IHdyYXBNb2Rlc1t3cmFwXVxuICAgICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkod3JhcCkpIHtcbiAgICAgICAgICBcbiAgICAgICAgICBcbiAgICAgICAgICB3cmFwUyA9IHdyYXBNb2Rlc1t3cmFwWzBdXVxuICAgICAgICAgIHdyYXBUID0gd3JhcE1vZGVzW3dyYXBbMV1dXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmICgnd3JhcFMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB2YXIgb3B0V3JhcFMgPSBvcHRpb25zLndyYXBTXG4gICAgICAgICAgXG4gICAgICAgICAgd3JhcFMgPSB3cmFwTW9kZXNbb3B0V3JhcFNdXG4gICAgICAgIH1cbiAgICAgICAgaWYgKCd3cmFwVCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHZhciBvcHRXcmFwVCA9IG9wdGlvbnMud3JhcFRcbiAgICAgICAgICBcbiAgICAgICAgICB3cmFwVCA9IHdyYXBNb2Rlc1tvcHRXcmFwVF1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgdGhpcy53cmFwUyA9IHdyYXBTXG4gICAgICB0aGlzLndyYXBUID0gd3JhcFRcblxuICAgICAgaWYgKCdhbmlzb3Ryb3BpYycgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgYW5pc290cm9waWMgPSBvcHRpb25zLmFuaXNvdHJvcGljXG4gICAgICAgIFxuICAgICAgICB0aGlzLmFuaXNvdHJvcGljID0gb3B0aW9ucy5hbmlzb3Ryb3BpY1xuICAgICAgfVxuXG4gICAgICBpZiAoJ21pcG1hcCcgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgbWlwbWFwID0gb3B0aW9ucy5taXBtYXBcbiAgICAgICAgc3dpdGNoICh0eXBlb2YgbWlwbWFwKSB7XG4gICAgICAgICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdGhpcy5taXBtYXBIaW50ID0gbWlwbWFwSGludFttaXBtYXBdXG4gICAgICAgICAgICB0aGlzLmdlbk1pcG1hcHMgPSB0cnVlXG4gICAgICAgICAgICBicmVha1xuXG4gICAgICAgICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICAgICAgICB0aGlzLmdlbk1pcG1hcHMgPSAhIW1pcG1hcFxuICAgICAgICAgICAgYnJlYWtcblxuICAgICAgICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICAgICAgICBicmVha1xuXG4gICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIFxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcblxuICAgIHVwbG9hZDogZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIHRhcmdldCA9IHRoaXMudGFyZ2V0XG4gICAgICBnbC50ZXhQYXJhbWV0ZXJpKHRhcmdldCwgR0xfVEVYVFVSRV9NSU5fRklMVEVSLCB0aGlzLm1pbkZpbHRlcilcbiAgICAgIGdsLnRleFBhcmFtZXRlcmkodGFyZ2V0LCBHTF9URVhUVVJFX01BR19GSUxURVIsIHRoaXMubWFnRmlsdGVyKVxuICAgICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfV1JBUF9TLCB0aGlzLndyYXBTKVxuICAgICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfV1JBUF9ULCB0aGlzLndyYXBUKVxuICAgICAgaWYgKGV4dGVuc2lvbnMuZXh0X3RleHR1cmVfZmlsdGVyX2FuaXNvdHJvcGljKSB7XG4gICAgICAgIGdsLnRleFBhcmFtZXRlcmkodGFyZ2V0LCBHTF9URVhUVVJFX01BWF9BTklTT1RST1BZX0VYVCwgdGhpcy5hbmlzb3Ryb3BpYylcbiAgICAgIH1cbiAgICAgIGlmICh0aGlzLmdlbk1pcG1hcHMpIHtcbiAgICAgICAgZ2wuaGludChHTF9HRU5FUkFURV9NSVBNQVBfSElOVCwgdGhpcy5taXBtYXBIaW50KVxuICAgICAgICBnbC5nZW5lcmF0ZU1pcG1hcCh0YXJnZXQpXG4gICAgICB9XG4gICAgfVxuICB9KVxuXG4gIC8vIEZpbmFsIHBhc3MgdG8gbWVyZ2UgcGFyYW1zIGFuZCBwaXhlbCBkYXRhXG4gIGZ1bmN0aW9uIGNoZWNrVGV4dHVyZUNvbXBsZXRlIChwYXJhbXMsIHBpeGVscykge1xuICAgIHZhciBpLCBwaXhtYXBcblxuICAgIHZhciB0eXBlID0gMFxuICAgIHZhciBmb3JtYXQgPSAwXG4gICAgdmFyIGludGVybmFsZm9ybWF0ID0gMFxuICAgIHZhciB3aWR0aCA9IDBcbiAgICB2YXIgaGVpZ2h0ID0gMFxuICAgIHZhciBjaGFubmVscyA9IDBcbiAgICB2YXIgY29tcHJlc3NlZCA9IGZhbHNlXG4gICAgdmFyIG5lZWRzUG9sbCA9IGZhbHNlXG4gICAgdmFyIG5lZWRzTGlzdGVuZXJzID0gZmFsc2VcbiAgICB2YXIgbWlwTWFzazJEID0gMFxuICAgIHZhciBtaXBNYXNrQ3ViZSA9IFswLCAwLCAwLCAwLCAwLCAwXVxuICAgIHZhciBjdWJlTWFzayA9IDBcbiAgICB2YXIgaGFzTWlwID0gZmFsc2VcbiAgICBmb3IgKGkgPSAwOyBpIDwgcGl4ZWxzLmxlbmd0aDsgKytpKSB7XG4gICAgICBwaXhtYXAgPSBwaXhlbHNbaV1cbiAgICAgIHdpZHRoID0gd2lkdGggfHwgKHBpeG1hcC53aWR0aCA8PCBwaXhtYXAubWlwbGV2ZWwpXG4gICAgICBoZWlnaHQgPSBoZWlnaHQgfHwgKHBpeG1hcC5oZWlnaHQgPDwgcGl4bWFwLm1pcGxldmVsKVxuICAgICAgdHlwZSA9IHR5cGUgfHwgcGl4bWFwLnR5cGVcbiAgICAgIGZvcm1hdCA9IGZvcm1hdCB8fCBwaXhtYXAuZm9ybWF0XG4gICAgICBpbnRlcm5hbGZvcm1hdCA9IGludGVybmFsZm9ybWF0IHx8IHBpeG1hcC5pbnRlcm5hbGZvcm1hdFxuICAgICAgY2hhbm5lbHMgPSBjaGFubmVscyB8fCBwaXhtYXAuY2hhbm5lbHNcbiAgICAgIG5lZWRzUG9sbCA9IG5lZWRzUG9sbCB8fCBwaXhtYXAubmVlZHNQb2xsXG4gICAgICBuZWVkc0xpc3RlbmVycyA9IG5lZWRzTGlzdGVuZXJzIHx8IHBpeG1hcC5uZWVkc0xpc3RlbmVyc1xuICAgICAgY29tcHJlc3NlZCA9IGNvbXByZXNzZWQgfHwgcGl4bWFwLmNvbXByZXNzZWRcblxuICAgICAgdmFyIG1pcGxldmVsID0gcGl4bWFwLm1pcGxldmVsXG4gICAgICB2YXIgdGFyZ2V0ID0gcGl4bWFwLnRhcmdldFxuICAgICAgaGFzTWlwID0gaGFzTWlwIHx8IChtaXBsZXZlbCA+IDApXG4gICAgICBpZiAodGFyZ2V0ID09PSBHTF9URVhUVVJFXzJEKSB7XG4gICAgICAgIG1pcE1hc2syRCB8PSAoMSA8PCBtaXBsZXZlbClcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBmYWNlID0gdGFyZ2V0IC0gR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YXG4gICAgICAgIG1pcE1hc2tDdWJlW2ZhY2VdIHw9ICgxIDw8IG1pcGxldmVsKVxuICAgICAgICBjdWJlTWFzayB8PSAoMSA8PCBmYWNlKVxuICAgICAgfVxuICAgIH1cblxuICAgIHBhcmFtcy5uZWVkc1BvbGwgPSBuZWVkc1BvbGxcbiAgICBwYXJhbXMubmVlZHNMaXN0ZW5lcnMgPSBuZWVkc0xpc3RlbmVyc1xuICAgIHBhcmFtcy53aWR0aCA9IHdpZHRoXG4gICAgcGFyYW1zLmhlaWdodCA9IGhlaWdodFxuICAgIHBhcmFtcy5mb3JtYXQgPSBmb3JtYXRcbiAgICBwYXJhbXMuaW50ZXJuYWxmb3JtYXQgPSBpbnRlcm5hbGZvcm1hdFxuICAgIHBhcmFtcy50eXBlID0gdHlwZVxuXG4gICAgdmFyIG1pcE1hc2sgPSBoYXNNaXAgPyAod2lkdGggPDwgMSkgLSAxIDogMVxuICAgIGlmIChwYXJhbXMudGFyZ2V0ID09PSBHTF9URVhUVVJFXzJEKSB7XG4gICAgICBcbiAgICAgIFxuICAgIH0gZWxzZSB7XG4gICAgICBcbiAgICAgIGZvciAoaSA9IDA7IGkgPCA2OyArK2kpIHtcbiAgICAgICAgXG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFyIG1pcEZpbHRlciA9IChNSVBNQVBfRklMVEVSUy5pbmRleE9mKHBhcmFtcy5taW5GaWx0ZXIpID49IDApXG4gICAgcGFyYW1zLmdlbk1pcG1hcHMgPSAhaGFzTWlwICYmIChwYXJhbXMuZ2VuTWlwbWFwcyB8fCBtaXBGaWx0ZXIpXG4gICAgdmFyIHVzZU1pcG1hcHMgPSBoYXNNaXAgfHwgcGFyYW1zLmdlbk1pcG1hcHNcblxuICAgIGlmICghcGFyYW1zLm1pbkZpbHRlcikge1xuICAgICAgcGFyYW1zLm1pbkZpbHRlciA9IHVzZU1pcG1hcHNcbiAgICAgICAgPyBHTF9MSU5FQVJfTUlQTUFQX0xJTkVBUlxuICAgICAgICA6IEdMX05FQVJFU1RcbiAgICB9IGVsc2Uge1xuICAgICAgXG4gICAgfVxuXG4gICAgaWYgKHVzZU1pcG1hcHMpIHtcbiAgICAgIFxuICAgIH1cblxuICAgIGlmIChwYXJhbXMuZ2VuTWlwbWFwcykge1xuICAgICAgXG4gICAgfVxuXG4gICAgcGFyYW1zLndyYXBTID0gcGFyYW1zLndyYXBTIHx8IEdMX0NMQU1QX1RPX0VER0VcbiAgICBwYXJhbXMud3JhcFQgPSBwYXJhbXMud3JhcFQgfHwgR0xfQ0xBTVBfVE9fRURHRVxuICAgIGlmIChwYXJhbXMud3JhcFMgIT09IEdMX0NMQU1QX1RPX0VER0UgfHxcbiAgICAgICAgcGFyYW1zLndyYXBUICE9PSBHTF9DTEFNUF9UT19FREdFKSB7XG4gICAgICBcbiAgICB9XG5cbiAgICBpZiAoKHR5cGUgPT09IEdMX0ZMT0FUICYmICFleHRlbnNpb25zLm9lc190ZXh0dXJlX2Zsb2F0X2xpbmVhcikgfHxcbiAgICAgICAgKHR5cGUgPT09IEdMX0hBTEZfRkxPQVRfT0VTICYmXG4gICAgICAgICAgIWV4dGVuc2lvbnMub2VzX3RleHR1cmVfaGFsZl9mbG9hdF9saW5lYXIpKSB7XG4gICAgICBcbiAgICB9XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgcGl4ZWxzLmxlbmd0aDsgKytpKSB7XG4gICAgICBwaXhtYXAgPSBwaXhlbHNbaV1cbiAgICAgIHZhciBsZXZlbCA9IHBpeG1hcC5taXBsZXZlbFxuICAgICAgaWYgKHBpeG1hcC53aWR0aCkge1xuICAgICAgICBcbiAgICAgIH1cbiAgICAgIGlmIChwaXhtYXAuaGVpZ2h0KSB7XG4gICAgICAgIFxuICAgICAgfVxuICAgICAgaWYgKHBpeG1hcC5jaGFubmVscykge1xuICAgICAgICBcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBpeG1hcC5jaGFubmVscyA9IGNoYW5uZWxzXG4gICAgICB9XG4gICAgICBpZiAocGl4bWFwLmZvcm1hdCkge1xuICAgICAgICBcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBpeG1hcC5mb3JtYXQgPSBmb3JtYXRcbiAgICAgIH1cbiAgICAgIGlmIChwaXhtYXAuaW50ZXJuYWxmb3JtYXQpIHtcbiAgICAgICAgXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwaXhtYXAuaW50ZXJuYWxmb3JtYXQgPSBpbnRlcm5hbGZvcm1hdFxuICAgICAgfVxuICAgICAgaWYgKHBpeG1hcC50eXBlKSB7XG4gICAgICAgIFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGl4bWFwLnR5cGUgPSB0eXBlXG4gICAgICB9XG4gICAgICBpZiAocGl4bWFwLmNvcHkpIHtcbiAgICAgICAgXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgdmFyIGFjdGl2ZVRleHR1cmUgPSAwXG4gIHZhciB0ZXh0dXJlQ291bnQgPSAwXG4gIHZhciB0ZXh0dXJlU2V0ID0ge31cbiAgdmFyIHBvbGxTZXQgPSBbXVxuICB2YXIgbnVtVGV4VW5pdHMgPSBsaW1pdHMubWF4VGV4dHVyZVVuaXRzXG4gIHZhciB0ZXh0dXJlVW5pdHMgPSBBcnJheShudW1UZXhVbml0cykubWFwKGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gbnVsbFxuICB9KVxuXG4gIGZ1bmN0aW9uIFJFR0xUZXh0dXJlICh0YXJnZXQpIHtcbiAgICB0aGlzLmlkID0gdGV4dHVyZUNvdW50KytcbiAgICB0aGlzLnJlZkNvdW50ID0gMVxuXG4gICAgdGhpcy50YXJnZXQgPSB0YXJnZXRcbiAgICB0aGlzLnRleHR1cmUgPSBudWxsXG5cbiAgICB0aGlzLnBvbGxJZCA9IC0xXG5cbiAgICB0aGlzLnVuaXQgPSAtMVxuICAgIHRoaXMuYmluZENvdW50ID0gMFxuXG4gICAgLy8gY2FuY2VscyBhbGwgcGVuZGluZyBjYWxsYmFja3NcbiAgICB0aGlzLmNhbmNlbFBlbmRpbmcgPSBudWxsXG5cbiAgICAvLyBwYXJzZWQgdXNlciBpbnB1dHNcbiAgICB0aGlzLnBhcmFtcyA9IG5ldyBUZXhQYXJhbXModGFyZ2V0KVxuICAgIHRoaXMucGl4ZWxzID0gW11cbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZSAodGV4dHVyZSwgb3B0aW9ucykge1xuICAgIHZhciBpXG4gICAgY2xlYXJMaXN0ZW5lcnModGV4dHVyZSlcblxuICAgIC8vIENsZWFyIHBhcmFtZXRlcnMgYW5kIHBpeGVsIGRhdGFcbiAgICB2YXIgcGFyYW1zID0gdGV4dHVyZS5wYXJhbXNcbiAgICBUZXhQYXJhbXMuY2FsbChwYXJhbXMsIHRleHR1cmUudGFyZ2V0KVxuICAgIHZhciBwaXhlbHMgPSB0ZXh0dXJlLnBpeGVsc1xuICAgIHBpeGVscy5sZW5ndGggPSAwXG5cbiAgICAvLyBwYXJzZSBwYXJhbWV0ZXJzXG4gICAgcGFyYW1zLnBhcnNlKG9wdGlvbnMpXG5cbiAgICAvLyBwYXJzZSBwaXhlbCBkYXRhXG4gICAgZnVuY3Rpb24gcGFyc2VNaXAgKHRhcmdldCwgZGF0YSkge1xuICAgICAgdmFyIG1pcG1hcCA9IGRhdGEubWlwbWFwXG4gICAgICB2YXIgcGl4bWFwXG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShtaXBtYXApKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbWlwbWFwLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgcGl4bWFwID0gbmV3IFBpeGVsSW5mbyh0YXJnZXQpXG4gICAgICAgICAgcGl4bWFwLnBhcnNlRmxhZ3Mob3B0aW9ucylcbiAgICAgICAgICBwaXhtYXAucGFyc2VGbGFncyhkYXRhKVxuICAgICAgICAgIHBpeG1hcC5wYXJzZShtaXBtYXBbaV0sIGkpXG4gICAgICAgICAgcGl4ZWxzLnB1c2gocGl4bWFwKVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwaXhtYXAgPSBuZXcgUGl4ZWxJbmZvKHRhcmdldClcbiAgICAgICAgcGl4bWFwLnBhcnNlRmxhZ3Mob3B0aW9ucylcbiAgICAgICAgcGl4bWFwLnBhcnNlKGRhdGEsIDApXG4gICAgICAgIHBpeGVscy5wdXNoKHBpeG1hcClcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKHRleHR1cmUudGFyZ2V0ID09PSBHTF9URVhUVVJFXzJEKSB7XG4gICAgICBwYXJzZU1pcChHTF9URVhUVVJFXzJELCBvcHRpb25zKVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgZmFjZXMgPSBvcHRpb25zLmZhY2VzIHx8IG9wdGlvbnNcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KGZhY2VzKSkge1xuICAgICAgICBcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICAgIHBhcnNlTWlwKEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCArIGksIGZhY2VzW2ldKVxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmYWNlcyA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgLy8gVE9ETyBSZWFkIGRkc1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gSW5pdGlhbGl6ZSB0byBhbGwgZW1wdHkgdGV4dHVyZXNcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICAgIHBhcnNlTWlwKEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCArIGksIHt9KVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gZG8gYSBzZWNvbmQgcGFzcyB0byByZWNvbmNpbGUgZGVmYXVsdHNcbiAgICBjaGVja1RleHR1cmVDb21wbGV0ZShwYXJhbXMsIHBpeGVscylcblxuICAgIGlmIChwYXJhbXMubmVlZHNMaXN0ZW5lcnMpIHtcbiAgICAgIGhvb2tMaXN0ZW5lcnModGV4dHVyZSlcbiAgICB9XG5cbiAgICBpZiAocGFyYW1zLm5lZWRzUG9sbCkge1xuICAgICAgdGV4dHVyZS5wb2xsSWQgPSBwb2xsU2V0Lmxlbmd0aFxuICAgICAgcG9sbFNldC5wdXNoKHRleHR1cmUpXG4gICAgfVxuXG4gICAgcmVmcmVzaCh0ZXh0dXJlKVxuICB9XG5cbiAgZnVuY3Rpb24gcmVmcmVzaCAodGV4dHVyZSkge1xuICAgIGlmICghZ2wuaXNUZXh0dXJlKHRleHR1cmUudGV4dHVyZSkpIHtcbiAgICAgIHRleHR1cmUudGV4dHVyZSA9IGdsLmNyZWF0ZVRleHR1cmUoKVxuICAgIH1cblxuICAgIC8vIExhenkgYmluZFxuICAgIHZhciB0YXJnZXQgPSB0ZXh0dXJlLnRhcmdldFxuICAgIHZhciB1bml0ID0gdGV4dHVyZS51bml0XG4gICAgaWYgKHVuaXQgPj0gMCkge1xuICAgICAgZ2wuYWN0aXZlVGV4dHVyZShHTF9URVhUVVJFMCArIHVuaXQpXG4gICAgICBhY3RpdmVUZXh0dXJlID0gdW5pdFxuICAgIH0gZWxzZSB7XG4gICAgICBnbC5iaW5kVGV4dHVyZSh0YXJnZXQsIHRleHR1cmUudGV4dHVyZSlcbiAgICB9XG5cbiAgICAvLyBVcGxvYWRcbiAgICB2YXIgcGl4ZWxzID0gdGV4dHVyZS5waXhlbHNcbiAgICB2YXIgcGFyYW1zID0gdGV4dHVyZS5wYXJhbXNcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHBpeGVscy5sZW5ndGg7ICsraSkge1xuICAgICAgcGl4ZWxzW2ldLnVwbG9hZChwYXJhbXMpXG4gICAgfVxuICAgIHBhcmFtcy51cGxvYWQoKVxuXG4gICAgLy8gTGF6eSB1bmJpbmRcbiAgICBpZiAodW5pdCA8IDApIHtcbiAgICAgIHZhciBhY3RpdmUgPSB0ZXh0dXJlVW5pdHNbYWN0aXZlVGV4dHVyZV1cbiAgICAgIGlmIChhY3RpdmUpIHtcbiAgICAgICAgLy8gcmVzdG9yZSBiaW5kaW5nIHN0YXRlXG4gICAgICAgIGdsLmJpbmRUZXh0dXJlKGFjdGl2ZS50YXJnZXQsIGFjdGl2ZS50ZXh0dXJlKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gb3RoZXJ3aXNlIGJlY29tZSBuZXcgYWN0aXZlXG4gICAgICAgIHRleHR1cmUudW5pdCA9IGFjdGl2ZVRleHR1cmVcbiAgICAgICAgdGV4dHVyZVVuaXRzW2FjdGl2ZVRleHR1cmVdID0gdGV4dHVyZVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGhvb2tMaXN0ZW5lcnMgKHRleHR1cmUpIHtcbiAgICB2YXIgcGFyYW1zID0gdGV4dHVyZS5wYXJhbXNcbiAgICB2YXIgcGl4ZWxzID0gdGV4dHVyZS5waXhlbHNcblxuICAgIC8vIEFwcGVuZHMgYWxsIHRoZSB0ZXh0dXJlIGRhdGEgZnJvbSB0aGUgYnVmZmVyIHRvIHRoZSBjdXJyZW50XG4gICAgZnVuY3Rpb24gYXBwZW5kRERTICh0YXJnZXQsIG1pcGxldmVsLCBidWZmZXIpIHtcbiAgICAgIHZhciBkZHMgPSBwYXJzZUREUyhidWZmZXIpXG5cbiAgICAgIFxuXG4gICAgICBpZiAoZGRzLmN1YmUpIHtcbiAgICAgICAgXG5cbiAgICAgICAgLy8gVE9ETyBoYW5kbGUgY3ViZSBtYXAgRERTXG4gICAgICAgIFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgXG4gICAgICB9XG5cbiAgICAgIGlmIChtaXBsZXZlbCkge1xuICAgICAgICBcbiAgICAgIH1cblxuICAgICAgZGRzLnBpeGVscy5mb3JFYWNoKGZ1bmN0aW9uIChwaXhtYXApIHtcbiAgICAgICAgdmFyIGluZm8gPSBuZXcgUGl4ZWxJbmZvKGRkcy5jdWJlID8gcGl4bWFwLnRhcmdldCA6IHRhcmdldClcblxuICAgICAgICBpbmZvLmNoYW5uZWxzID0gZGRzLmNoYW5uZWxzXG4gICAgICAgIGluZm8uY29tcHJlc3NlZCA9IGRkcy5jb21wcmVzc2VkXG4gICAgICAgIGluZm8udHlwZSA9IGRkcy50eXBlXG4gICAgICAgIGluZm8uaW50ZXJuYWxmb3JtYXQgPSBkZHMuZm9ybWF0XG4gICAgICAgIGluZm8uZm9ybWF0ID0gY29sb3JGb3JtYXRzW2Rkcy5mb3JtYXRdXG5cbiAgICAgICAgaW5mby53aWR0aCA9IHBpeG1hcC53aWR0aFxuICAgICAgICBpbmZvLmhlaWdodCA9IHBpeG1hcC5oZWlnaHRcbiAgICAgICAgaW5mby5taXBsZXZlbCA9IHBpeG1hcC5taXBsZXZlbCB8fCBtaXBsZXZlbFxuICAgICAgICBpbmZvLmRhdGEgPSBwaXhtYXAuZGF0YVxuXG4gICAgICAgIHBpeGVscy5wdXNoKGluZm8pXG4gICAgICB9KVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIG9uRGF0YSAoKSB7XG4gICAgICAvLyBVcGRhdGUgc2l6ZSBvZiBhbnkgbmV3bHkgbG9hZGVkIHBpeGVsc1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwaXhlbHMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgdmFyIHBpeGVsRGF0YSA9IHBpeGVsc1tpXVxuICAgICAgICB2YXIgaW1hZ2UgPSBwaXhlbERhdGEuaW1hZ2VcbiAgICAgICAgdmFyIHZpZGVvID0gcGl4ZWxEYXRhLnZpZGVvXG4gICAgICAgIHZhciB4aHIgPSBwaXhlbERhdGEueGhyXG4gICAgICAgIGlmIChpbWFnZSAmJiBpbWFnZS5jb21wbGV0ZSkge1xuICAgICAgICAgIHBpeGVsRGF0YS53aWR0aCA9IGltYWdlLm5hdHVyYWxXaWR0aFxuICAgICAgICAgIHBpeGVsRGF0YS5oZWlnaHQgPSBpbWFnZS5uYXR1cmFsSGVpZ2h0XG4gICAgICAgIH0gZWxzZSBpZiAodmlkZW8gJiYgdmlkZW8ucmVhZHlTdGF0ZSA+IDIpIHtcbiAgICAgICAgICBwaXhlbERhdGEud2lkdGggPSB2aWRlby53aWR0aFxuICAgICAgICAgIHBpeGVsRGF0YS5oZWlnaHQgPSB2aWRlby5oZWlnaHRcbiAgICAgICAgfSBlbHNlIGlmICh4aHIgJiYgeGhyLnJlYWR5U3RhdGUgPT09IDQpIHtcbiAgICAgICAgICBwaXhlbHNbaV0gPSBwaXhlbHNbcGl4ZWxzLmxlbmd0aCAtIDFdXG4gICAgICAgICAgcGl4ZWxzLnBvcCgpXG4gICAgICAgICAgeGhyLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3JlYWR5c3RhdGVjaGFuZ2UnLCByZWZyZXNoKVxuICAgICAgICAgIGFwcGVuZEREUyhwaXhlbERhdGEudGFyZ2V0LCBwaXhlbERhdGEubWlwbGV2ZWwsIHhoci5yZXNwb25zZSlcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgY2hlY2tUZXh0dXJlQ29tcGxldGUocGFyYW1zLCBwaXhlbHMpXG4gICAgICByZWZyZXNoKHRleHR1cmUpXG4gICAgfVxuXG4gICAgcGl4ZWxzLmZvckVhY2goZnVuY3Rpb24gKHBpeGVsRGF0YSkge1xuICAgICAgaWYgKHBpeGVsRGF0YS5pbWFnZSAmJiAhcGl4ZWxEYXRhLmltYWdlLmNvbXBsZXRlKSB7XG4gICAgICAgIHBpeGVsRGF0YS5pbWFnZS5hZGRFdmVudExpc3RlbmVyKCdsb2FkJywgb25EYXRhKVxuICAgICAgfSBlbHNlIGlmIChwaXhlbERhdGEudmlkZW8gJiYgcGl4ZWxEYXRhLnJlYWR5U3RhdGUgPCAxKSB7XG4gICAgICAgIHBpeGVsRGF0YS52aWRlby5hZGRFdmVudExpc3RlbmVyKCdwcm9ncmVzcycsIG9uRGF0YSlcbiAgICAgIH0gZWxzZSBpZiAocGl4ZWxEYXRhLnhocikge1xuICAgICAgICBwaXhlbERhdGEueGhyLmFkZEV2ZW50TGlzdGVuZXIoJ3JlYWR5c3RhdGVjaGFuZ2UnLCBvbkRhdGEpXG4gICAgICB9XG4gICAgfSlcblxuICAgIHRleHR1cmUuY2FuY2VsUGVuZGluZyA9IGZ1bmN0aW9uIGRldGFjaExpc3RlbmVycyAoKSB7XG4gICAgICBwaXhlbHMuZm9yRWFjaChmdW5jdGlvbiAocGl4ZWxEYXRhKSB7XG4gICAgICAgIGlmIChwaXhlbERhdGEuaW1hZ2UpIHtcbiAgICAgICAgICBwaXhlbERhdGEuaW1hZ2UucmVtb3ZlRXZlbnRMaXN0ZW5lcignbG9hZCcsIG9uRGF0YSlcbiAgICAgICAgfSBlbHNlIGlmIChwaXhlbERhdGEudmlkZW8pIHtcbiAgICAgICAgICBwaXhlbERhdGEudmlkZW8ucmVtb3ZlRXZlbnRMaXN0ZW5lcigncHJvZ3Jlc3MnLCBvbkRhdGEpXG4gICAgICAgIH0gZWxzZSBpZiAocGl4ZWxEYXRhLnhocikge1xuICAgICAgICAgIHBpeGVsRGF0YS54aHIucmVtb3ZlRXZlbnRMaXN0ZW5lcigncmVhZHlzdGF0ZWNoYW5nZScsIG9uRGF0YSlcbiAgICAgICAgICBwaXhlbERhdGEueGhyLmFib3J0KClcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBjbGVhckxpc3RlbmVycyAodGV4dHVyZSkge1xuICAgIHZhciBjYW5jZWxQZW5kaW5nID0gdGV4dHVyZS5jYW5jZWxQZW5kaW5nXG4gICAgaWYgKGNhbmNlbFBlbmRpbmcpIHtcbiAgICAgIGNhbmNlbFBlbmRpbmcoKVxuICAgICAgdGV4dHVyZS5jYW5jZWxQZW5kaW5nID0gbnVsbFxuICAgIH1cbiAgICB2YXIgaWQgPSB0ZXh0dXJlLnBvbGxJZFxuICAgIGlmIChpZCA+PSAwKSB7XG4gICAgICB2YXIgb3RoZXIgPSBwb2xsU2V0W2lkXSA9IHBvbGxTZXRbcG9sbFNldC5sZW5ndGggLSAxXVxuICAgICAgb3RoZXIuaWQgPSBpZFxuICAgICAgcG9sbFNldC5wb3AoKVxuICAgICAgdGV4dHVyZS5wb2xsSWQgPSAtMVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3kgKHRleHR1cmUpIHtcbiAgICB2YXIgaGFuZGxlID0gdGV4dHVyZS50ZXh0dXJlXG4gICAgXG4gICAgdmFyIHVuaXQgPSB0ZXh0dXJlLnVuaXRcbiAgICB2YXIgdGFyZ2V0ID0gdGV4dHVyZS50YXJnZXRcbiAgICBpZiAodW5pdCA+PSAwKSB7XG4gICAgICBnbC5hY3RpdmVUZXh0dXJlKEdMX1RFWFRVUkUwICsgdW5pdClcbiAgICAgIGFjdGl2ZVRleHR1cmUgPSB1bml0XG4gICAgICBnbC5iaW5kVGV4dHVyZSh0YXJnZXQsIG51bGwpXG4gICAgICB0ZXh0dXJlVW5pdHNbdW5pdF0gPSBudWxsXG4gICAgfVxuICAgIGNsZWFyTGlzdGVuZXJzKHRleHR1cmUpXG4gICAgaWYgKGdsLmlzVGV4dHVyZShoYW5kbGUpKSB7XG4gICAgICBnbC5kZWxldGVUZXh0dXJlKGhhbmRsZSlcbiAgICB9XG4gICAgdGV4dHVyZS50ZXh0dXJlID0gbnVsbFxuICAgIHRleHR1cmUucGFyYW1zID0gbnVsbFxuICAgIHRleHR1cmUucGl4ZWxzID0gbnVsbFxuICAgIHRleHR1cmUucmVmQ291bnQgPSAwXG4gICAgZGVsZXRlIHRleHR1cmVTZXRbdGV4dHVyZS5pZF1cbiAgfVxuXG4gIGV4dGVuZChSRUdMVGV4dHVyZS5wcm90b3R5cGUsIHtcbiAgICBiaW5kOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgdGV4dHVyZSA9IHRoaXNcbiAgICAgIHRleHR1cmUuYmluZENvdW50ICs9IDFcbiAgICAgIHZhciB1bml0ID0gdGV4dHVyZS51bml0XG4gICAgICBpZiAodW5pdCA8IDApIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBudW1UZXhVbml0czsgKytpKSB7XG4gICAgICAgICAgdmFyIG90aGVyID0gdGV4dHVyZVVuaXRzW2ldXG4gICAgICAgICAgaWYgKG90aGVyKSB7XG4gICAgICAgICAgICBpZiAob3RoZXIuYmluZENvdW50ID4gMCkge1xuICAgICAgICAgICAgICBjb250aW51ZVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgb3RoZXIudW5pdCA9IC0xXG4gICAgICAgICAgfVxuICAgICAgICAgIHRleHR1cmVVbml0c1tpXSA9IHRleHR1cmVcbiAgICAgICAgICB1bml0ID0gaVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIH1cbiAgICAgICAgaWYgKHVuaXQgPj0gbnVtVGV4VW5pdHMpIHtcbiAgICAgICAgICBcbiAgICAgICAgfVxuICAgICAgICB0ZXh0dXJlLnVuaXQgPSB1bml0XG4gICAgICAgIGdsLmFjdGl2ZVRleHR1cmUoR0xfVEVYVFVSRTAgKyB1bml0KVxuICAgICAgICBnbC5iaW5kVGV4dHVyZSh0ZXh0dXJlLnRhcmdldCwgdGV4dHVyZS50ZXh0dXJlKVxuICAgICAgICBhY3RpdmVUZXh0dXJlID0gdW5pdFxuICAgICAgfVxuICAgICAgcmV0dXJuIHVuaXRcbiAgICB9LFxuXG4gICAgdW5iaW5kOiBmdW5jdGlvbiAoKSB7XG4gICAgICB0aGlzLmJpbmRDb3VudCAtPSAxXG4gICAgfSxcblxuICAgIGRlY1JlZjogZnVuY3Rpb24gKCkge1xuICAgICAgaWYgKC0tdGhpcy5yZWZDb3VudCA9PT0gMCkge1xuICAgICAgICBkZXN0cm95KHRoaXMpXG4gICAgICB9XG4gICAgfVxuICB9KVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZVRleHR1cmUgKG9wdGlvbnMsIHRhcmdldCkge1xuICAgIHZhciB0ZXh0dXJlID0gbmV3IFJFR0xUZXh0dXJlKHRhcmdldClcbiAgICB0ZXh0dXJlU2V0W3RleHR1cmUuaWRdID0gdGV4dHVyZVxuXG4gICAgZnVuY3Rpb24gcmVnbFRleHR1cmUgKGEwLCBhMSwgYTIsIGEzLCBhNCwgYTUpIHtcbiAgICAgIHZhciBvcHRpb25zID0gYTAgfHwge31cbiAgICAgIGlmICh0YXJnZXQgPT09IEdMX1RFWFRVUkVfQ1VCRV9NQVAgJiYgYXJndW1lbnRzLmxlbmd0aCA9PT0gNikge1xuICAgICAgICBvcHRpb25zID0gW2EwLCBhMSwgYTIsIGEzLCBhNCwgYTVdXG4gICAgICB9XG4gICAgICB1cGRhdGUodGV4dHVyZSwgb3B0aW9ucylcbiAgICAgIHJlZ2xUZXh0dXJlLndpZHRoID0gdGV4dHVyZS5wYXJhbXMud2lkdGhcbiAgICAgIHJlZ2xUZXh0dXJlLmhlaWdodCA9IHRleHR1cmUucGFyYW1zLmhlaWdodFxuICAgICAgcmV0dXJuIHJlZ2xUZXh0dXJlXG4gICAgfVxuXG4gICAgcmVnbFRleHR1cmUob3B0aW9ucylcblxuICAgIHJlZ2xUZXh0dXJlLl9yZWdsVHlwZSA9ICd0ZXh0dXJlJ1xuICAgIHJlZ2xUZXh0dXJlLl90ZXh0dXJlID0gdGV4dHVyZVxuICAgIHJlZ2xUZXh0dXJlLmRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB0ZXh0dXJlLmRlY1JlZigpXG4gICAgfVxuICBcbiAgICByZXR1cm4gcmVnbFRleHR1cmVcbiAgfVxuXG4gIC8vIENhbGxlZCBhZnRlciBjb250ZXh0IHJlc3RvcmVcbiAgZnVuY3Rpb24gcmVmcmVzaFRleHR1cmVzICgpIHtcbiAgICB2YWx1ZXModGV4dHVyZVNldCkuZm9yRWFjaChyZWZyZXNoKVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbnVtVGV4VW5pdHM7ICsraSkge1xuICAgICAgdGV4dHVyZVVuaXRzW2ldID0gbnVsbFxuICAgIH1cbiAgICBhY3RpdmVUZXh0dXJlID0gMFxuICAgIGdsLmFjdGl2ZVRleHR1cmUoR0xfVEVYVFVSRTApXG4gIH1cblxuICAvLyBDYWxsZWQgd2hlbiByZWdsIGlzIGRlc3Ryb3llZFxuICBmdW5jdGlvbiBkZXN0cm95VGV4dHVyZXMgKCkge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbnVtVGV4VW5pdHM7ICsraSkge1xuICAgICAgZ2wuYWN0aXZlVGV4dHVyZShHTF9URVhUVVJFMCArIGkpXG4gICAgICBnbC5iaW5kVGV4dHVyZShHTF9URVhUVVJFXzJELCBudWxsKVxuICAgICAgdGV4dHVyZVVuaXRzW2ldID0gbnVsbFxuICAgIH1cbiAgICBnbC5hY3RpdmVUZXh0dXJlKEdMX1RFWFRVUkUwKVxuICAgIGFjdGl2ZVRleHR1cmUgPSAwXG4gICAgdmFsdWVzKHRleHR1cmVTZXQpLmZvckVhY2goZGVzdHJveSlcbiAgfVxuXG4gIC8vIENhbGxlZCBvbmNlIHBlciByYWYsIHVwZGF0ZXMgdmlkZW8gdGV4dHVyZXNcbiAgZnVuY3Rpb24gcG9sbFRleHR1cmVzICgpIHtcbiAgICBwb2xsU2V0LmZvckVhY2gocmVmcmVzaClcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY3JlYXRlOiBjcmVhdGVUZXh0dXJlLFxuICAgIHJlZnJlc2g6IHJlZnJlc2hUZXh0dXJlcyxcbiAgICBjbGVhcjogZGVzdHJveVRleHR1cmVzLFxuICAgIHBvbGw6IHBvbGxUZXh0dXJlcyxcbiAgICBnZXRUZXh0dXJlOiBmdW5jdGlvbiAod3JhcHBlcikge1xuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY29udmVydFRvSGFsZkZsb2F0IChhcnJheSkge1xuICB2YXIgZmxvYXRzID0gbmV3IEZsb2F0MzJBcnJheShhcnJheSlcbiAgdmFyIHVpbnRzID0gbmV3IFVpbnQzMkFycmF5KGZsb2F0cy5idWZmZXIpXG4gIHZhciB1c2hvcnRzID0gbmV3IFVpbnQxNkFycmF5KGFycmF5Lmxlbmd0aClcblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGFycmF5Lmxlbmd0aDsgKytpKSB7XG4gICAgaWYgKGlzTmFOKGFycmF5W2ldKSkge1xuICAgICAgdXNob3J0c1tpXSA9IDB4ZmZmZlxuICAgIH0gZWxzZSBpZiAoYXJyYXlbaV0gPT09IEluZmluaXR5KSB7XG4gICAgICB1c2hvcnRzW2ldID0gMHg3YzAwXG4gICAgfSBlbHNlIGlmIChhcnJheVtpXSA9PT0gLUluZmluaXR5KSB7XG4gICAgICB1c2hvcnRzW2ldID0gMHhmYzAwXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciB4ID0gdWludHNbaV1cblxuICAgICAgdmFyIHNnbiA9ICh4ID4+PiAzMSkgPDwgMTVcbiAgICAgIHZhciBleHAgPSAoKHggPDwgMSkgPj4+IDI0KSAtIDEyN1xuICAgICAgdmFyIGZyYWMgPSAoeCA+PiAxMykgJiAoKDEgPDwgMTApIC0gMSlcblxuICAgICAgaWYgKGV4cCA8IC0yNCkge1xuICAgICAgICAvLyByb3VuZCBub24tcmVwcmVzZW50YWJsZSBkZW5vcm1hbHMgdG8gMFxuICAgICAgICB1c2hvcnRzW2ldID0gc2duXG4gICAgICB9IGVsc2UgaWYgKGV4cCA8IC0xNCkge1xuICAgICAgICAvLyBoYW5kbGUgZGVub3JtYWxzXG4gICAgICAgIHZhciBzID0gLTE0IC0gZXhwXG4gICAgICAgIHVzaG9ydHNbaV0gPSBzZ24gKyAoKGZyYWMgKyAoMSA8PCAxMCkpID4+IHMpXG4gICAgICB9IGVsc2UgaWYgKGV4cCA+IDE1KSB7XG4gICAgICAgIC8vIHJvdW5kIG92ZXJmbG93IHRvICsvLSBJbmZpbml0eVxuICAgICAgICB1c2hvcnRzW2ldID0gc2duICsgMHg3YzAwXG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBvdGhlcndpc2UgY29udmVydCBkaXJlY3RseVxuICAgICAgICB1c2hvcnRzW2ldID0gc2duICsgKChleHAgKyAxNSkgPDwgMTApICsgZnJhY1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB1c2hvcnRzXG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBVbmlmb3JtU3RhdGUgKHN0cmluZ1N0b3JlKSB7XG4gIHZhciB1bmlmb3JtU3RhdGUgPSB7fVxuXG4gIGZ1bmN0aW9uIGRlZlVuaWZvcm0gKG5hbWUpIHtcbiAgICB2YXIgaWQgPSBzdHJpbmdTdG9yZS5pZChuYW1lKVxuICAgIHZhciByZXN1bHQgPSB1bmlmb3JtU3RhdGVbaWRdXG4gICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgIHJlc3VsdCA9IHVuaWZvcm1TdGF0ZVtpZF0gPSBbXG4gICAgICAgIFswLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwXVxuICAgICAgXVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGRlZjogZGVmVW5pZm9ybVxuICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChvYmopIHtcbiAgcmV0dXJuIE9iamVjdC5rZXlzKG9iaikubWFwKGZ1bmN0aW9uIChrZXkpIHsgcmV0dXJuIG9ialtrZXldIH0pXG59XG4iLCJcbnZhciBleHRlbmQgPSByZXF1aXJlKCcuL2xpYi9leHRlbmQnKVxudmFyIGdldENvbnRleHQgPSByZXF1aXJlKCcuL2xpYi9jb250ZXh0JylcbnZhciBjcmVhdGVTdHJpbmdTdG9yZSA9IHJlcXVpcmUoJy4vbGliL3N0cmluZ3MnKVxudmFyIHdyYXBFeHRlbnNpb25zID0gcmVxdWlyZSgnLi9saWIvZXh0ZW5zaW9uJylcbnZhciB3cmFwTGltaXRzID0gcmVxdWlyZSgnLi9saWIvbGltaXRzJylcbnZhciB3cmFwQnVmZmVycyA9IHJlcXVpcmUoJy4vbGliL2J1ZmZlcicpXG52YXIgd3JhcEVsZW1lbnRzID0gcmVxdWlyZSgnLi9saWIvZWxlbWVudHMnKVxudmFyIHdyYXBUZXh0dXJlcyA9IHJlcXVpcmUoJy4vbGliL3RleHR1cmUnKVxudmFyIHdyYXBSZW5kZXJidWZmZXJzID0gcmVxdWlyZSgnLi9saWIvcmVuZGVyYnVmZmVyJylcbnZhciB3cmFwRnJhbWVidWZmZXJzID0gcmVxdWlyZSgnLi9saWIvZnJhbWVidWZmZXInKVxudmFyIHdyYXBVbmlmb3JtcyA9IHJlcXVpcmUoJy4vbGliL3VuaWZvcm0nKVxudmFyIHdyYXBBdHRyaWJ1dGVzID0gcmVxdWlyZSgnLi9saWIvYXR0cmlidXRlJylcbnZhciB3cmFwU2hhZGVycyA9IHJlcXVpcmUoJy4vbGliL3NoYWRlcicpXG52YXIgd3JhcERyYXcgPSByZXF1aXJlKCcuL2xpYi9kcmF3JylcbnZhciB3cmFwQ29udGV4dCA9IHJlcXVpcmUoJy4vbGliL3N0YXRlJylcbnZhciBjcmVhdGVDb21waWxlciA9IHJlcXVpcmUoJy4vbGliL2NvbXBpbGUnKVxudmFyIHdyYXBSZWFkID0gcmVxdWlyZSgnLi9saWIvcmVhZCcpXG52YXIgZHluYW1pYyA9IHJlcXVpcmUoJy4vbGliL2R5bmFtaWMnKVxudmFyIHJhZiA9IHJlcXVpcmUoJy4vbGliL3JhZicpXG52YXIgY2xvY2sgPSByZXF1aXJlKCcuL2xpYi9jbG9jaycpXG5cbnZhciBHTF9DT0xPUl9CVUZGRVJfQklUID0gMTYzODRcbnZhciBHTF9ERVBUSF9CVUZGRVJfQklUID0gMjU2XG52YXIgR0xfU1RFTkNJTF9CVUZGRVJfQklUID0gMTAyNFxuXG52YXIgR0xfQVJSQVlfQlVGRkVSID0gMzQ5NjJcbnZhciBHTF9URVhUVVJFXzJEID0gMHgwREUxXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUCA9IDB4ODUxM1xuXG52YXIgQ09OVEVYVF9MT1NUX0VWRU5UID0gJ3dlYmdsY29udGV4dGxvc3QnXG52YXIgQ09OVEVYVF9SRVNUT1JFRF9FVkVOVCA9ICd3ZWJnbGNvbnRleHRyZXN0b3JlZCdcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwUkVHTCAoKSB7XG4gIHZhciBhcmdzID0gZ2V0Q29udGV4dChBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpKVxuICB2YXIgZ2wgPSBhcmdzLmdsXG4gIHZhciBvcHRpb25zID0gYXJncy5vcHRpb25zXG5cbiAgLy8gVXNlIHN0cmluZyBzdG9yZSB0byB0cmFjayBzdHJpbmcgaWRzXG4gIHZhciBzdHJpbmdTdG9yZSA9IGNyZWF0ZVN0cmluZ1N0b3JlKClcblxuICB2YXIgZXh0ZW5zaW9uU3RhdGUgPSB3cmFwRXh0ZW5zaW9ucyhnbClcbiAgdmFyIGV4dGVuc2lvbnMgPSBleHRlbnNpb25TdGF0ZS5leHRlbnNpb25zXG5cbiAgdmFyIHZpZXdwb3J0U3RhdGUgPSB7XG4gICAgd2lkdGg6IGdsLmRyYXdpbmdCdWZmZXJXaWR0aCxcbiAgICBoZWlnaHQ6IGdsLmRyYXdpbmdCdWZmZXJIZWlnaHRcbiAgfVxuXG4gIHZhciBsaW1pdHMgPSB3cmFwTGltaXRzKFxuICAgIGdsLFxuICAgIGV4dGVuc2lvbnMpXG5cbiAgdmFyIGJ1ZmZlclN0YXRlID0gd3JhcEJ1ZmZlcnMoZ2wpXG5cbiAgdmFyIGVsZW1lbnRTdGF0ZSA9IHdyYXBFbGVtZW50cyhcbiAgICBnbCxcbiAgICBleHRlbnNpb25zLFxuICAgIGJ1ZmZlclN0YXRlKVxuXG4gIHZhciB1bmlmb3JtU3RhdGUgPSB3cmFwVW5pZm9ybXMoc3RyaW5nU3RvcmUpXG5cbiAgdmFyIGF0dHJpYnV0ZVN0YXRlID0gd3JhcEF0dHJpYnV0ZXMoXG4gICAgZ2wsXG4gICAgZXh0ZW5zaW9ucyxcbiAgICBsaW1pdHMsXG4gICAgYnVmZmVyU3RhdGUsXG4gICAgc3RyaW5nU3RvcmUpXG5cbiAgdmFyIHNoYWRlclN0YXRlID0gd3JhcFNoYWRlcnMoXG4gICAgZ2wsXG4gICAgYXR0cmlidXRlU3RhdGUsXG4gICAgdW5pZm9ybVN0YXRlLFxuICAgIGZ1bmN0aW9uIChwcm9ncmFtKSB7XG4gICAgICByZXR1cm4gY29tcGlsZXIuZHJhdyhwcm9ncmFtKVxuICAgIH0sXG4gICAgc3RyaW5nU3RvcmUpXG5cbiAgdmFyIGRyYXdTdGF0ZSA9IHdyYXBEcmF3KFxuICAgIGdsLFxuICAgIGV4dGVuc2lvbnMsXG4gICAgYnVmZmVyU3RhdGUpXG5cbiAgdmFyIHRleHR1cmVTdGF0ZSA9IHdyYXBUZXh0dXJlcyhcbiAgICBnbCxcbiAgICBleHRlbnNpb25zLFxuICAgIGxpbWl0cyxcbiAgICBwb2xsLFxuICAgIHZpZXdwb3J0U3RhdGUpXG5cbiAgdmFyIHJlbmRlcmJ1ZmZlclN0YXRlID0gd3JhcFJlbmRlcmJ1ZmZlcnMoXG4gICAgZ2wsXG4gICAgZXh0ZW5zaW9ucyxcbiAgICBsaW1pdHMpXG5cbiAgdmFyIGZyYW1lYnVmZmVyU3RhdGUgPSB3cmFwRnJhbWVidWZmZXJzKFxuICAgIGdsLFxuICAgIGV4dGVuc2lvbnMsXG4gICAgbGltaXRzLFxuICAgIHRleHR1cmVTdGF0ZSxcbiAgICByZW5kZXJidWZmZXJTdGF0ZSlcblxuICB2YXIgZnJhbWVTdGF0ZSA9IHtcbiAgICBjb3VudDogMCxcbiAgICBzdGFydDogY2xvY2soKSxcbiAgICBkdDogMCxcbiAgICB0OiBjbG9jaygpLFxuICAgIHJlbmRlclRpbWU6IDAsXG4gICAgd2lkdGg6IGdsLmRyYXdpbmdCdWZmZXJXaWR0aCxcbiAgICBoZWlnaHQ6IGdsLmRyYXdpbmdCdWZmZXJIZWlnaHQsXG4gICAgcGl4ZWxSYXRpbzogb3B0aW9ucy5waXhlbFJhdGlvXG4gIH1cblxuICB2YXIgZ2xTdGF0ZSA9IHdyYXBDb250ZXh0KFxuICAgIGdsLFxuICAgIGZyYW1lYnVmZmVyU3RhdGUsXG4gICAgdmlld3BvcnRTdGF0ZSlcblxuICB2YXIgcmVhZFBpeGVscyA9IHdyYXBSZWFkKGdsLCBwb2xsLCB2aWV3cG9ydFN0YXRlKVxuXG4gIHZhciBjb21waWxlciA9IGNyZWF0ZUNvbXBpbGVyKFxuICAgIGdsLFxuICAgIHN0cmluZ1N0b3JlLFxuICAgIGV4dGVuc2lvbnMsXG4gICAgbGltaXRzLFxuICAgIGJ1ZmZlclN0YXRlLFxuICAgIGVsZW1lbnRTdGF0ZSxcbiAgICB0ZXh0dXJlU3RhdGUsXG4gICAgZnJhbWVidWZmZXJTdGF0ZSxcbiAgICBnbFN0YXRlLFxuICAgIHVuaWZvcm1TdGF0ZSxcbiAgICBhdHRyaWJ1dGVTdGF0ZSxcbiAgICBzaGFkZXJTdGF0ZSxcbiAgICBkcmF3U3RhdGUsXG4gICAgZnJhbWVTdGF0ZSxcbiAgICBwb2xsKVxuXG4gIHZhciBjYW52YXMgPSBnbC5jYW52YXNcblxuICAvLyByYWYgc3R1ZmZcbiAgdmFyIHJhZkNhbGxiYWNrcyA9IFtdXG4gIHZhciBhY3RpdmVSQUYgPSAwXG4gIGZ1bmN0aW9uIGhhbmRsZVJBRiAoKSB7XG4gICAgYWN0aXZlUkFGID0gcmFmLm5leHQoaGFuZGxlUkFGKVxuICAgIGZyYW1lU3RhdGUuY291bnQgKz0gMVxuXG4gICAgaWYgKGZyYW1lU3RhdGUud2lkdGggIT09IGdsLmRyYXdpbmdCdWZmZXJXaWR0aCB8fFxuICAgICAgICBmcmFtZVN0YXRlLmhlaWdodCAhPT0gZ2wuZHJhd2luZ0J1ZmZlckhlaWdodCkge1xuICAgICAgZnJhbWVTdGF0ZS53aWR0aCA9IGdsLmRyYXdpbmdCdWZmZXJXaWR0aFxuICAgICAgZnJhbWVTdGF0ZS5oZWlnaHQgPSBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0XG4gICAgICBnbFN0YXRlLm5vdGlmeVZpZXdwb3J0Q2hhbmdlZCgpXG4gICAgfVxuXG4gICAgdmFyIG5vdyA9IGNsb2NrKClcbiAgICBmcmFtZVN0YXRlLmR0ID0gbm93IC0gZnJhbWVTdGF0ZS50XG4gICAgZnJhbWVTdGF0ZS50ID0gbm93XG5cbiAgICB0ZXh0dXJlU3RhdGUucG9sbCgpXG5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJhZkNhbGxiYWNrcy5sZW5ndGg7ICsraSkge1xuICAgICAgdmFyIGNiID0gcmFmQ2FsbGJhY2tzW2ldXG4gICAgICBjYihmcmFtZVN0YXRlLmNvdW50LCBmcmFtZVN0YXRlLnQsIGZyYW1lU3RhdGUuZHQpXG4gICAgfVxuICAgIGZyYW1lU3RhdGUucmVuZGVyVGltZSA9IGNsb2NrKCkgLSBub3dcbiAgfVxuXG4gIGZ1bmN0aW9uIHN0YXJ0UkFGICgpIHtcbiAgICBpZiAoIWFjdGl2ZVJBRiAmJiByYWZDYWxsYmFja3MubGVuZ3RoID4gMCkge1xuICAgICAgaGFuZGxlUkFGKClcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzdG9wUkFGICgpIHtcbiAgICBpZiAoYWN0aXZlUkFGKSB7XG4gICAgICByYWYuY2FuY2VsKGhhbmRsZVJBRilcbiAgICAgIGFjdGl2ZVJBRiA9IDBcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVDb250ZXh0TG9zcyAoZXZlbnQpIHtcbiAgICBzdG9wUkFGKClcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpXG4gICAgaWYgKG9wdGlvbnMub25Db250ZXh0TG9zdCkge1xuICAgICAgb3B0aW9ucy5vbkNvbnRleHRMb3N0KClcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVDb250ZXh0UmVzdG9yZWQgKGV2ZW50KSB7XG4gICAgZ2wuZ2V0RXJyb3IoKVxuICAgIGV4dGVuc2lvblN0YXRlLnJlZnJlc2goKVxuICAgIGJ1ZmZlclN0YXRlLnJlZnJlc2goKVxuICAgIHRleHR1cmVTdGF0ZS5yZWZyZXNoKClcbiAgICByZW5kZXJidWZmZXJTdGF0ZS5yZWZyZXNoKClcbiAgICBmcmFtZWJ1ZmZlclN0YXRlLnJlZnJlc2goKVxuICAgIHNoYWRlclN0YXRlLnJlZnJlc2goKVxuICAgIGdsU3RhdGUucmVmcmVzaCgpXG4gICAgaWYgKG9wdGlvbnMub25Db250ZXh0UmVzdG9yZWQpIHtcbiAgICAgIG9wdGlvbnMub25Db250ZXh0UmVzdG9yZWQoKVxuICAgIH1cbiAgICBoYW5kbGVSQUYoKVxuICB9XG5cbiAgaWYgKGNhbnZhcykge1xuICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKENPTlRFWFRfTE9TVF9FVkVOVCwgaGFuZGxlQ29udGV4dExvc3MsIGZhbHNlKVxuICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKENPTlRFWFRfUkVTVE9SRURfRVZFTlQsIGhhbmRsZUNvbnRleHRSZXN0b3JlZCwgZmFsc2UpXG4gIH1cblxuICAvLyBSZXNvdXJjZSBkZXN0cnVjdHVpb25cbiAgZnVuY3Rpb24gZGVzdHJveSAoKSB7XG4gICAgc3RvcFJBRigpXG5cbiAgICBpZiAoY2FudmFzKSB7XG4gICAgICBjYW52YXMucmVtb3ZlRXZlbnRMaXN0ZW5lcihDT05URVhUX0xPU1RfRVZFTlQsIGhhbmRsZUNvbnRleHRMb3NzKVxuICAgICAgY2FudmFzLnJlbW92ZUV2ZW50TGlzdGVuZXIoQ09OVEVYVF9SRVNUT1JFRF9FVkVOVCwgaGFuZGxlQ29udGV4dFJlc3RvcmVkKVxuICAgIH1cblxuICAgIHNoYWRlclN0YXRlLmNsZWFyKClcbiAgICBmcmFtZWJ1ZmZlclN0YXRlLmNsZWFyKClcbiAgICByZW5kZXJidWZmZXJTdGF0ZS5jbGVhcigpXG4gICAgdGV4dHVyZVN0YXRlLmNsZWFyKClcbiAgICBidWZmZXJTdGF0ZS5jbGVhcigpXG5cbiAgICBpZiAob3B0aW9ucy5vbkRlc3Ryb3kpIHtcbiAgICAgIG9wdGlvbnMub25EZXN0cm95KClcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBjb21waWxlUHJvY2VkdXJlIChvcHRpb25zKSB7XG4gICAgXG4gICAgXG5cbiAgICB2YXIgaGFzRHluYW1pYyA9IGZhbHNlXG5cbiAgICBmdW5jdGlvbiBmbGF0dGVuTmVzdGVkT3B0aW9ucyAob3B0aW9ucykge1xuICAgICAgdmFyIHJlc3VsdCA9IGV4dGVuZCh7fSwgb3B0aW9ucylcbiAgICAgIGRlbGV0ZSByZXN1bHQudW5pZm9ybXNcbiAgICAgIGRlbGV0ZSByZXN1bHQuYXR0cmlidXRlc1xuXG4gICAgICBmdW5jdGlvbiBtZXJnZSAobmFtZSkge1xuICAgICAgICBpZiAobmFtZSBpbiByZXN1bHQpIHtcbiAgICAgICAgICB2YXIgY2hpbGQgPSByZXN1bHRbbmFtZV1cbiAgICAgICAgICBkZWxldGUgcmVzdWx0W25hbWVdXG4gICAgICAgICAgT2JqZWN0LmtleXMoY2hpbGQpLmZvckVhY2goZnVuY3Rpb24gKHByb3ApIHtcbiAgICAgICAgICAgIHJlc3VsdFtuYW1lICsgJy4nICsgcHJvcF0gPSBjaGlsZFtwcm9wXVxuICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIG1lcmdlKCdibGVuZCcpXG4gICAgICBtZXJnZSgnZGVwdGgnKVxuICAgICAgbWVyZ2UoJ2N1bGwnKVxuICAgICAgbWVyZ2UoJ3N0ZW5jaWwnKVxuICAgICAgbWVyZ2UoJ3BvbHlnb25PZmZzZXQnKVxuICAgICAgbWVyZ2UoJ3NjaXNzb3InKVxuICAgICAgbWVyZ2UoJ3NhbXBsZScpXG5cbiAgICAgIHJldHVybiByZXN1bHRcbiAgICB9XG5cbiAgICAvLyBGaXJzdCB3ZSBzZXBhcmF0ZSB0aGUgb3B0aW9ucyBpbnRvIHN0YXRpYyBhbmQgZHluYW1pYyBjb21wb25lbnRzXG4gICAgZnVuY3Rpb24gc2VwYXJhdGVEeW5hbWljIChvYmplY3QpIHtcbiAgICAgIHZhciBzdGF0aWNJdGVtcyA9IHt9XG4gICAgICB2YXIgZHluYW1pY0l0ZW1zID0ge31cbiAgICAgIE9iamVjdC5rZXlzKG9iamVjdCkuZm9yRWFjaChmdW5jdGlvbiAob3B0aW9uKSB7XG4gICAgICAgIHZhciB2YWx1ZSA9IG9iamVjdFtvcHRpb25dXG4gICAgICAgIGlmIChkeW5hbWljLmlzRHluYW1pYyh2YWx1ZSkpIHtcbiAgICAgICAgICBoYXNEeW5hbWljID0gdHJ1ZVxuICAgICAgICAgIGR5bmFtaWNJdGVtc1tvcHRpb25dID0gZHluYW1pYy51bmJveCh2YWx1ZSwgb3B0aW9uKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHN0YXRpY0l0ZW1zW29wdGlvbl0gPSB2YWx1ZVxuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgZHluYW1pYzogZHluYW1pY0l0ZW1zLFxuICAgICAgICBzdGF0aWM6IHN0YXRpY0l0ZW1zXG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFyIHVuaWZvcm1zID0gc2VwYXJhdGVEeW5hbWljKG9wdGlvbnMudW5pZm9ybXMgfHwge30pXG4gICAgdmFyIGF0dHJpYnV0ZXMgPSBzZXBhcmF0ZUR5bmFtaWMob3B0aW9ucy5hdHRyaWJ1dGVzIHx8IHt9KVxuICAgIHZhciBvcHRzID0gc2VwYXJhdGVEeW5hbWljKGZsYXR0ZW5OZXN0ZWRPcHRpb25zKG9wdGlvbnMpKVxuXG4gICAgdmFyIGNvbXBpbGVkID0gY29tcGlsZXIuY29tbWFuZChcbiAgICAgIG9wdHMuc3RhdGljLCB1bmlmb3Jtcy5zdGF0aWMsIGF0dHJpYnV0ZXMuc3RhdGljLFxuICAgICAgb3B0cy5keW5hbWljLCB1bmlmb3Jtcy5keW5hbWljLCBhdHRyaWJ1dGVzLmR5bmFtaWMsXG4gICAgICBoYXNEeW5hbWljKVxuXG4gICAgdmFyIGRyYXcgPSBjb21waWxlZC5kcmF3XG4gICAgdmFyIGJhdGNoID0gY29tcGlsZWQuYmF0Y2hcbiAgICB2YXIgc2NvcGUgPSBjb21waWxlZC5zY29wZVxuXG4gICAgdmFyIEVNUFRZX0FSUkFZID0gW11cbiAgICBmdW5jdGlvbiByZXNlcnZlIChjb3VudCkge1xuICAgICAgd2hpbGUgKEVNUFRZX0FSUkFZLmxlbmd0aCA8IGNvdW50KSB7XG4gICAgICAgIEVNUFRZX0FSUkFZLnB1c2gobnVsbClcbiAgICAgIH1cbiAgICAgIHJldHVybiBFTVBUWV9BUlJBWVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIFJFR0xDb21tYW5kIChhcmdzLCBib2R5KSB7XG4gICAgICBpZiAodHlwZW9mIGFyZ3MgPT09ICdudW1iZXInKSB7XG4gICAgICAgIHJldHVybiBiYXRjaChhcmdzIHwgMCwgcmVzZXJ2ZShhcmdzIHwgMCkpXG4gICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoYXJncykpIHtcbiAgICAgICAgcmV0dXJuIGJhdGNoKGFyZ3MubGVuZ3RoLCBhcmdzKVxuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgYXJncyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICByZXR1cm4gc2NvcGUobnVsbCwgYXJncylcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGJvZHkgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgcmV0dXJuIHNjb3BlKGFyZ3MsIGJvZHkpXG4gICAgICB9XG4gICAgICByZXR1cm4gZHJhdyhhcmdzKVxuICAgIH1cblxuICAgIHJldHVybiBSRUdMQ29tbWFuZFxuICB9XG5cbiAgZnVuY3Rpb24gcG9sbCAoKSB7XG4gICAgZnJhbWVidWZmZXJTdGF0ZS5wb2xsKClcbiAgICBnbFN0YXRlLnBvbGwoKVxuICB9XG5cbiAgZnVuY3Rpb24gY2xlYXIgKG9wdGlvbnMpIHtcbiAgICB2YXIgY2xlYXJGbGFncyA9IDBcblxuICAgIC8vIFVwZGF0ZSBjb250ZXh0IHN0YXRlXG4gICAgcG9sbCgpXG5cbiAgICB2YXIgYyA9IG9wdGlvbnMuY29sb3JcbiAgICBpZiAoYykge1xuICAgICAgZ2wuY2xlYXJDb2xvcigrY1swXSB8fCAwLCArY1sxXSB8fCAwLCArY1syXSB8fCAwLCArY1szXSB8fCAwKVxuICAgICAgY2xlYXJGbGFncyB8PSBHTF9DT0xPUl9CVUZGRVJfQklUXG4gICAgfVxuICAgIGlmICgnZGVwdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgIGdsLmNsZWFyRGVwdGgoK29wdGlvbnMuZGVwdGgpXG4gICAgICBjbGVhckZsYWdzIHw9IEdMX0RFUFRIX0JVRkZFUl9CSVRcbiAgICB9XG4gICAgaWYgKCdzdGVuY2lsJyBpbiBvcHRpb25zKSB7XG4gICAgICBnbC5jbGVhclN0ZW5jaWwob3B0aW9ucy5zdGVuY2lsIHwgMClcbiAgICAgIGNsZWFyRmxhZ3MgfD0gR0xfU1RFTkNJTF9CVUZGRVJfQklUXG4gICAgfVxuXG4gICAgXG4gICAgZ2wuY2xlYXIoY2xlYXJGbGFncylcbiAgfVxuXG4gIC8vIFJlZ2lzdGVycyBhbm90aGVyIHJlcXVlc3RBbmltYXRpb25GcmFtZSBjYWxsYmFja1xuICBmdW5jdGlvbiBmcmFtZSAoY2IpIHtcbiAgICByYWZDYWxsYmFja3MucHVzaChjYilcblxuICAgIGZ1bmN0aW9uIGNhbmNlbCAoKSB7XG4gICAgICB2YXIgaW5kZXggPSByYWZDYWxsYmFja3MuZmluZChmdW5jdGlvbiAoaXRlbSkge1xuICAgICAgICByZXR1cm4gaXRlbSA9PT0gY2JcbiAgICAgIH0pXG4gICAgICBpZiAoaW5kZXggPCAwKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgcmFmQ2FsbGJhY2tzLnNwbGljZShpbmRleCwgMSlcbiAgICAgIGlmIChyYWZDYWxsYmFja3MubGVuZ3RoIDw9IDApIHtcbiAgICAgICAgc3RvcFJBRigpXG4gICAgICB9XG4gICAgfVxuXG4gICAgc3RhcnRSQUYoKVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGNhbmNlbDogY2FuY2VsXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGV4dGVuZChjb21waWxlUHJvY2VkdXJlLCB7XG4gICAgLy8gQ2xlYXIgY3VycmVudCBGQk9cbiAgICBjbGVhcjogY2xlYXIsXG5cbiAgICAvLyBTaG9ydCBjdXQgZm9yIHByb3AgYmluZGluZ1xuICAgIHByb3A6IGR5bmFtaWMuZGVmaW5lLFxuXG4gICAgLy8gZXhlY3V0ZXMgYW4gZW1wdHkgZHJhdyBjb21tYW5kXG4gICAgZHJhdzogY29tcGlsZVByb2NlZHVyZSh7fSksXG5cbiAgICAvLyBSZXNvdXJjZXNcbiAgICBlbGVtZW50czogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgIHJldHVybiBlbGVtZW50U3RhdGUuY3JlYXRlKG9wdGlvbnMpXG4gICAgfSxcbiAgICBidWZmZXI6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICByZXR1cm4gYnVmZmVyU3RhdGUuY3JlYXRlKG9wdGlvbnMsIEdMX0FSUkFZX0JVRkZFUilcbiAgICB9LFxuICAgIHRleHR1cmU6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICByZXR1cm4gdGV4dHVyZVN0YXRlLmNyZWF0ZShvcHRpb25zLCBHTF9URVhUVVJFXzJEKVxuICAgIH0sXG4gICAgY3ViZTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSA2KSB7XG4gICAgICAgIHJldHVybiB0ZXh0dXJlU3RhdGUuY3JlYXRlKFxuICAgICAgICAgIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyksXG4gICAgICAgICAgR0xfVEVYVFVSRV9DVUJFX01BUClcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB0ZXh0dXJlU3RhdGUuY3JlYXRlKG9wdGlvbnMsIEdMX1RFWFRVUkVfQ1VCRV9NQVApXG4gICAgICB9XG4gICAgfSxcbiAgICByZW5kZXJidWZmZXI6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICByZXR1cm4gcmVuZGVyYnVmZmVyU3RhdGUuY3JlYXRlKG9wdGlvbnMpXG4gICAgfSxcbiAgICBmcmFtZWJ1ZmZlcjogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgIHJldHVybiBmcmFtZWJ1ZmZlclN0YXRlLmNyZWF0ZShvcHRpb25zKVxuICAgIH0sXG4gICAgZnJhbWVidWZmZXJDdWJlOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgXG4gICAgfSxcblxuICAgIC8vIEZyYW1lIHJlbmRlcmluZ1xuICAgIGZyYW1lOiBmcmFtZSxcbiAgICBzdGF0czogZnJhbWVTdGF0ZSxcblxuICAgIC8vIFN5c3RlbSBsaW1pdHNcbiAgICBsaW1pdHM6IGxpbWl0cyxcblxuICAgIC8vIFJlYWQgcGl4ZWxzXG4gICAgcmVhZDogcmVhZFBpeGVscyxcblxuICAgIC8vIERlc3Ryb3kgcmVnbCBhbmQgYWxsIGFzc29jaWF0ZWQgcmVzb3VyY2VzXG4gICAgZGVzdHJveTogZGVzdHJveVxuICB9KVxufVxuIl19
