(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
const regl = require('../regl')()

const drawDoggie = regl({
  frag: `
  precision mediump float;
  uniform sampler2D texture;
  uniform vec2 screenShape;
  uniform float time;

  varying vec2 uv;

  vec4 background () {
    vec2 pos = 0.5 - gl_FragCoord.xy / screenShape;
    float r = length(pos);
    float theta = atan(pos.y, pos.x);
    return vec4(
      cos(pos.x * time) + sin(pos.y * pos.x * time),
      cos(100.0 * r * cos(0.3 * time) + theta),
      sin(time / r + pos.x * cos(10.0 * time + 3.0)),
      1);
  }

  void main () {
    vec4 color = texture2D(texture, uv);
    float chromakey = step(0.15 + max(color.r, color.b), color.g);
    gl_FragColor = mix(color, background(), chromakey);
  }`,

  vert: `
  precision mediump float;
  attribute vec2 position;
  varying vec2 uv;
  void main () {
    uv = position;
    gl_Position = vec4(1.0 - 2.0 * position, 0, 1);
  }`,

  attributes: {
    position: regl.buffer([
      -2, 0,
      0, -2,
      2, 2])
  },

  uniforms: {
    texture: regl.texture('assets/doggie-chromakey.ogv'),

    screenShape: function (args, batchId, stats) {
      return [stats.width, stats.height]
    },

    time: function (args, batchId, stats) {
      return 0.01 * stats.count
    }
  },

  count: 3
})

regl.frame(() => {
  drawDoggie()
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJleGFtcGxlL3ZpZGVvLmpzIiwibGliL2F0dHJpYnV0ZS5qcyIsImxpYi9idWZmZXIuanMiLCJsaWIvY2xvY2suanMiLCJsaWIvY29kZWdlbi5qcyIsImxpYi9jb21waWxlLmpzIiwibGliL2NvbnN0YW50cy9hcnJheXR5cGVzLmpzb24iLCJsaWIvY29uc3RhbnRzL2R0eXBlcy5qc29uIiwibGliL2NvbnN0YW50cy9wcmltaXRpdmVzLmpzb24iLCJsaWIvY29udGV4dC5qcyIsImxpYi9kcmF3LmpzIiwibGliL2R5bmFtaWMuanMiLCJsaWIvZWxlbWVudHMuanMiLCJsaWIvZXh0ZW5kLmpzIiwibGliL2V4dGVuc2lvbi5qcyIsImxpYi9mcmFtZWJ1ZmZlci5qcyIsImxpYi9pcy1uZGFycmF5LmpzIiwibGliL2lzLXR5cGVkLWFycmF5LmpzIiwibGliL2xpbWl0cy5qcyIsImxpYi9sb2FkLXRleHR1cmUuanMiLCJsaWIvcGFyc2UtZGRzLmpzIiwibGliL3JhZi5qcyIsImxpYi9yZWFkLmpzIiwibGliL3JlbmRlcmJ1ZmZlci5qcyIsImxpYi9zaGFkZXIuanMiLCJsaWIvc3RhY2suanMiLCJsaWIvc3RhdGUuanMiLCJsaWIvc3RyaW5ncy5qcyIsImxpYi90ZXh0dXJlLmpzIiwibGliL3RvLWhhbGYtZmxvYXQuanMiLCJsaWIvdW5pZm9ybS5qcyIsImxpYi92YWx1ZXMuanMiLCJyZWdsLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ROQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDclBBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcmxEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNaQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4SEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNXRCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNaQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDak1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMTNDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xCQTtBQUNBO0FBQ0E7QUFDQTs7QUNIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJjb25zdCByZWdsID0gcmVxdWlyZSgnLi4vcmVnbCcpKClcblxuY29uc3QgZHJhd0RvZ2dpZSA9IHJlZ2woe1xuICBmcmFnOiBgXG4gIHByZWNpc2lvbiBtZWRpdW1wIGZsb2F0O1xuICB1bmlmb3JtIHNhbXBsZXIyRCB0ZXh0dXJlO1xuICB1bmlmb3JtIHZlYzIgc2NyZWVuU2hhcGU7XG4gIHVuaWZvcm0gZmxvYXQgdGltZTtcblxuICB2YXJ5aW5nIHZlYzIgdXY7XG5cbiAgdmVjNCBiYWNrZ3JvdW5kICgpIHtcbiAgICB2ZWMyIHBvcyA9IDAuNSAtIGdsX0ZyYWdDb29yZC54eSAvIHNjcmVlblNoYXBlO1xuICAgIGZsb2F0IHIgPSBsZW5ndGgocG9zKTtcbiAgICBmbG9hdCB0aGV0YSA9IGF0YW4ocG9zLnksIHBvcy54KTtcbiAgICByZXR1cm4gdmVjNChcbiAgICAgIGNvcyhwb3MueCAqIHRpbWUpICsgc2luKHBvcy55ICogcG9zLnggKiB0aW1lKSxcbiAgICAgIGNvcygxMDAuMCAqIHIgKiBjb3MoMC4zICogdGltZSkgKyB0aGV0YSksXG4gICAgICBzaW4odGltZSAvIHIgKyBwb3MueCAqIGNvcygxMC4wICogdGltZSArIDMuMCkpLFxuICAgICAgMSk7XG4gIH1cblxuICB2b2lkIG1haW4gKCkge1xuICAgIHZlYzQgY29sb3IgPSB0ZXh0dXJlMkQodGV4dHVyZSwgdXYpO1xuICAgIGZsb2F0IGNocm9tYWtleSA9IHN0ZXAoMC4xNSArIG1heChjb2xvci5yLCBjb2xvci5iKSwgY29sb3IuZyk7XG4gICAgZ2xfRnJhZ0NvbG9yID0gbWl4KGNvbG9yLCBiYWNrZ3JvdW5kKCksIGNocm9tYWtleSk7XG4gIH1gLFxuXG4gIHZlcnQ6IGBcbiAgcHJlY2lzaW9uIG1lZGl1bXAgZmxvYXQ7XG4gIGF0dHJpYnV0ZSB2ZWMyIHBvc2l0aW9uO1xuICB2YXJ5aW5nIHZlYzIgdXY7XG4gIHZvaWQgbWFpbiAoKSB7XG4gICAgdXYgPSBwb3NpdGlvbjtcbiAgICBnbF9Qb3NpdGlvbiA9IHZlYzQoMS4wIC0gMi4wICogcG9zaXRpb24sIDAsIDEpO1xuICB9YCxcblxuICBhdHRyaWJ1dGVzOiB7XG4gICAgcG9zaXRpb246IHJlZ2wuYnVmZmVyKFtcbiAgICAgIC0yLCAwLFxuICAgICAgMCwgLTIsXG4gICAgICAyLCAyXSlcbiAgfSxcblxuICB1bmlmb3Jtczoge1xuICAgIHRleHR1cmU6IHJlZ2wudGV4dHVyZSgnYXNzZXRzL2RvZ2dpZS1jaHJvbWFrZXkub2d2JyksXG5cbiAgICBzY3JlZW5TaGFwZTogZnVuY3Rpb24gKGFyZ3MsIGJhdGNoSWQsIHN0YXRzKSB7XG4gICAgICByZXR1cm4gW3N0YXRzLndpZHRoLCBzdGF0cy5oZWlnaHRdXG4gICAgfSxcblxuICAgIHRpbWU6IGZ1bmN0aW9uIChhcmdzLCBiYXRjaElkLCBzdGF0cykge1xuICAgICAgcmV0dXJuIDAuMDEgKiBzdGF0cy5jb3VudFxuICAgIH1cbiAgfSxcblxuICBjb3VudDogM1xufSlcblxucmVnbC5mcmFtZSgoKSA9PiB7XG4gIGRyYXdEb2dnaWUoKVxufSlcbiIsInZhciBnbFR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvZHR5cGVzLmpzb24nKVxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vZXh0ZW5kJylcblxudmFyIEdMX0ZMT0FUID0gNTEyNlxuXG5mdW5jdGlvbiBBdHRyaWJ1dGVSZWNvcmQgKCkge1xuICB0aGlzLnBvaW50ZXIgPSBmYWxzZVxuXG4gIHRoaXMueCA9IDAuMFxuICB0aGlzLnkgPSAwLjBcbiAgdGhpcy56ID0gMC4wXG4gIHRoaXMudyA9IDAuMFxuXG4gIHRoaXMuYnVmZmVyID0gbnVsbFxuICB0aGlzLnNpemUgPSAwXG4gIHRoaXMubm9ybWFsaXplZCA9IGZhbHNlXG4gIHRoaXMudHlwZSA9IEdMX0ZMT0FUXG4gIHRoaXMub2Zmc2V0ID0gMFxuICB0aGlzLnN0cmlkZSA9IDBcbiAgdGhpcy5kaXZpc29yID0gMFxufVxuXG5leHRlbmQoQXR0cmlidXRlUmVjb3JkLnByb3RvdHlwZSwge1xuICBlcXVhbHM6IGZ1bmN0aW9uIChvdGhlciwgc2l6ZSkge1xuICAgIGlmICghdGhpcy5wb2ludGVyKSB7XG4gICAgICByZXR1cm4gIW90aGVyLnBvaW50ZXIgJiZcbiAgICAgICAgdGhpcy54ID09PSBvdGhlci54ICYmXG4gICAgICAgIHRoaXMueSA9PT0gb3RoZXIueSAmJlxuICAgICAgICB0aGlzLnogPT09IG90aGVyLnogJiZcbiAgICAgICAgdGhpcy53ID09PSBvdGhlci53XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBvdGhlci5wb2ludGVyICYmXG4gICAgICAgIHRoaXMuYnVmZmVyID09PSBvdGhlci5idWZmZXIgJiZcbiAgICAgICAgdGhpcy5zaXplID09PSBzaXplICYmXG4gICAgICAgIHRoaXMubm9ybWFsaXplZCA9PT0gb3RoZXIubm9ybWFsaXplZCAmJlxuICAgICAgICB0aGlzLnR5cGUgPT09IG90aGVyLnR5cGUgJiZcbiAgICAgICAgdGhpcy5vZmZzZXQgPT09IG90aGVyLm9mZnNldCAmJlxuICAgICAgICB0aGlzLnN0cmlkZSA9PT0gb3RoZXIuc3RyaWRlICYmXG4gICAgICAgIHRoaXMuZGl2aXNvciA9PT0gb3RoZXIuZGl2aXNvclxuICAgIH1cbiAgfSxcblxuICBzZXQ6IGZ1bmN0aW9uIChvdGhlciwgc2l6ZSkge1xuICAgIHZhciBwb2ludGVyID0gdGhpcy5wb2ludGVyID0gb3RoZXIucG9pbnRlclxuICAgIGlmIChwb2ludGVyKSB7XG4gICAgICB0aGlzLmJ1ZmZlciA9IG90aGVyLmJ1ZmZlclxuICAgICAgdGhpcy5zaXplID0gc2l6ZVxuICAgICAgdGhpcy5ub3JtYWxpemVkID0gb3RoZXIubm9ybWFsaXplZFxuICAgICAgdGhpcy50eXBlID0gb3RoZXIudHlwZVxuICAgICAgdGhpcy5vZmZzZXQgPSBvdGhlci5vZmZzZXRcbiAgICAgIHRoaXMuc3RyaWRlID0gb3RoZXIuc3RyaWRlXG4gICAgICB0aGlzLmRpdmlzb3IgPSBvdGhlci5kaXZpc29yXG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMueCA9IG90aGVyLnhcbiAgICAgIHRoaXMueSA9IG90aGVyLnlcbiAgICAgIHRoaXMueiA9IG90aGVyLnpcbiAgICAgIHRoaXMudyA9IG90aGVyLndcbiAgICB9XG4gIH1cbn0pXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcEF0dHJpYnV0ZVN0YXRlIChcbiAgZ2wsXG4gIGV4dGVuc2lvbnMsXG4gIGxpbWl0cyxcbiAgYnVmZmVyU3RhdGUsXG4gIHN0cmluZ1N0b3JlKSB7XG5cbiAgdmFyIGF0dHJpYnV0ZVN0YXRlID0ge31cblxuICB2YXIgTlVNX0FUVFJJQlVURVMgPSBsaW1pdHMubWF4QXR0cmlidXRlc1xuICB2YXIgYXR0cmlidXRlQmluZGluZ3MgPSBuZXcgQXJyYXkoTlVNX0FUVFJJQlVURVMpXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgTlVNX0FUVFJJQlVURVM7ICsraSkge1xuICAgIGF0dHJpYnV0ZUJpbmRpbmdzW2ldID0gbmV3IEF0dHJpYnV0ZVJlY29yZCgpXG4gIH1cblxuICBmdW5jdGlvbiBBdHRyaWJ1dGVTdGFjayAoKSB7XG4gICAgdmFyIHJlY29yZHMgPSBuZXcgQXJyYXkoMTYpXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCAxNjsgKytpKSB7XG4gICAgICByZWNvcmRzW2ldID0gbmV3IEF0dHJpYnV0ZVJlY29yZCgpXG4gICAgfVxuICAgIHRoaXMucmVjb3JkcyA9IHJlY29yZHNcbiAgICB0aGlzLnRvcCA9IDBcbiAgfVxuXG4gIGZ1bmN0aW9uIHB1c2hBdHRyaWJ1dGVTdGFjayAoc3RhY2spIHtcbiAgICB2YXIgcmVjb3JkcyA9IHN0YWNrLnJlY29yZHNcbiAgICB2YXIgdG9wID0gc3RhY2sudG9wXG5cbiAgICB3aGlsZSAocmVjb3Jkcy5sZW5ndGggLSAxIDw9IHRvcCkge1xuICAgICAgcmVjb3Jkcy5wdXNoKG5ldyBBdHRyaWJ1dGVSZWNvcmQoKSlcbiAgICB9XG5cbiAgICByZXR1cm4gcmVjb3Jkc1srK3N0YWNrLnRvcF1cbiAgfVxuXG4gIGV4dGVuZChBdHRyaWJ1dGVTdGFjay5wcm90b3R5cGUsIHtcbiAgICBwdXNoVmVjOiBmdW5jdGlvbiAoeCwgeSwgeiwgdykge1xuICAgICAgdmFyIGhlYWQgPSBwdXNoQXR0cmlidXRlU3RhY2sodGhpcylcbiAgICAgIGhlYWQucG9pbnRlciA9IGZhbHNlXG4gICAgICBoZWFkLnggPSB4XG4gICAgICBoZWFkLnkgPSB5XG4gICAgICBoZWFkLnogPSB6XG4gICAgICBoZWFkLncgPSB3XG4gICAgfSxcblxuICAgIHB1c2hQdHI6IGZ1bmN0aW9uIChcbiAgICAgIGJ1ZmZlcixcbiAgICAgIHNpemUsXG4gICAgICBvZmZzZXQsXG4gICAgICBzdHJpZGUsXG4gICAgICBkaXZpc29yLFxuICAgICAgbm9ybWFsaXplZCxcbiAgICAgIHR5cGUpIHtcbiAgICAgIHZhciBoZWFkID0gcHVzaEF0dHJpYnV0ZVN0YWNrKHRoaXMpXG4gICAgICBoZWFkLnBvaW50ZXIgPSB0cnVlXG4gICAgICBoZWFkLmJ1ZmZlciA9IGJ1ZmZlclxuICAgICAgaGVhZC5zaXplID0gc2l6ZVxuICAgICAgaGVhZC5vZmZzZXQgPSBvZmZzZXRcbiAgICAgIGhlYWQuc3RyaWRlID0gc3RyaWRlXG4gICAgICBoZWFkLmRpdmlzb3IgPSBkaXZpc29yXG4gICAgICBoZWFkLm5vcm1hbGl6ZWQgPSBub3JtYWxpemVkXG4gICAgICBoZWFkLnR5cGUgPSB0eXBlXG4gICAgfSxcblxuICAgIHB1c2hEeW46IGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICBpZiAodHlwZW9mIGRhdGEgPT09ICdudW1iZXInKSB7XG4gICAgICAgIHRoaXMucHVzaFZlYyhkYXRhLCAwLCAwLCAwKVxuICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XG4gICAgICAgIHRoaXMucHVzaFZlYyhkYXRhWzBdLCBkYXRhWzFdLCBkYXRhWzJdLCBkYXRhWzNdKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIGJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmdldEJ1ZmZlcihkYXRhKVxuICAgICAgICB2YXIgc2l6ZSA9IDBcbiAgICAgICAgdmFyIHN0cmlkZSA9IDBcbiAgICAgICAgdmFyIG9mZnNldCA9IDBcbiAgICAgICAgdmFyIGRpdmlzb3IgPSAwXG4gICAgICAgIHZhciBub3JtYWxpemVkID0gZmFsc2VcbiAgICAgICAgdmFyIHR5cGUgPSBHTF9GTE9BVFxuICAgICAgICBpZiAoIWJ1ZmZlcikge1xuICAgICAgICAgIGJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmdldEJ1ZmZlcihkYXRhLmJ1ZmZlcilcbiAgICAgICAgICBzaXplID0gZGF0YS5zaXplIHx8IDBcbiAgICAgICAgICBzdHJpZGUgPSBkYXRhLnN0cmlkZSB8fCAwXG4gICAgICAgICAgb2Zmc2V0ID0gZGF0YS5vZmZzZXQgfHwgMFxuICAgICAgICAgIGRpdmlzb3IgPSBkYXRhLmRpdmlzb3IgfHwgMFxuICAgICAgICAgIG5vcm1hbGl6ZWQgPSBkYXRhLm5vcm1hbGl6ZWQgfHwgZmFsc2VcbiAgICAgICAgICB0eXBlID0gYnVmZmVyLmR0eXBlXG4gICAgICAgICAgaWYgKCd0eXBlJyBpbiBkYXRhKSB7XG4gICAgICAgICAgICB0eXBlID0gZ2xUeXBlc1tkYXRhLnR5cGVdXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHR5cGUgPSBidWZmZXIuZHR5cGVcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnB1c2hQdHIoYnVmZmVyLCBzaXplLCBvZmZzZXQsIHN0cmlkZSwgZGl2aXNvciwgbm9ybWFsaXplZCwgdHlwZSlcbiAgICAgIH1cbiAgICB9LFxuXG4gICAgcG9wOiBmdW5jdGlvbiAoKSB7XG4gICAgICB0aGlzLnRvcCAtPSAxXG4gICAgfVxuICB9KVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBCSU5EIEFOIEFUVFJJQlVURVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgZnVuY3Rpb24gYmluZEF0dHJpYnV0ZSAoaW5kZXgsIGN1cnJlbnQsIG5leHQsIHNpemUpIHtcbiAgICBzaXplID0gbmV4dC5zaXplIHx8IHNpemVcbiAgICBpZiAoY3VycmVudC5lcXVhbHMobmV4dCwgc2l6ZSkpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBpZiAoIW5leHQucG9pbnRlcikge1xuICAgICAgaWYgKGN1cnJlbnQucG9pbnRlcikge1xuICAgICAgICBnbC5kaXNhYmxlVmVydGV4QXR0cmliQXJyYXkoaW5kZXgpXG4gICAgICB9XG4gICAgICBnbC52ZXJ0ZXhBdHRyaWI0ZihpbmRleCwgbmV4dC54LCBuZXh0LnksIG5leHQueiwgbmV4dC53KVxuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoIWN1cnJlbnQucG9pbnRlcikge1xuICAgICAgICBnbC5lbmFibGVWZXJ0ZXhBdHRyaWJBcnJheShpbmRleClcbiAgICAgIH1cbiAgICAgIGlmIChjdXJyZW50LmJ1ZmZlciAhPT0gbmV4dC5idWZmZXIpIHtcbiAgICAgICAgbmV4dC5idWZmZXIuYmluZCgpXG4gICAgICB9XG4gICAgICBnbC52ZXJ0ZXhBdHRyaWJQb2ludGVyKFxuICAgICAgICBpbmRleCxcbiAgICAgICAgc2l6ZSxcbiAgICAgICAgbmV4dC50eXBlLFxuICAgICAgICBuZXh0Lm5vcm1hbGl6ZWQsXG4gICAgICAgIG5leHQuc3RyaWRlLFxuICAgICAgICBuZXh0Lm9mZnNldClcbiAgICAgIHZhciBleHRJbnN0YW5jaW5nID0gZXh0ZW5zaW9ucy5hbmdsZV9pbnN0YW5jZWRfYXJyYXlzXG4gICAgICBpZiAoZXh0SW5zdGFuY2luZykge1xuICAgICAgICBleHRJbnN0YW5jaW5nLnZlcnRleEF0dHJpYkRpdmlzb3JBTkdMRShpbmRleCwgbmV4dC5kaXZpc29yKVxuICAgICAgfVxuICAgIH1cbiAgICBjdXJyZW50LnNldChuZXh0LCBzaXplKVxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIERFRklORSBBIE5FVyBBVFRSSUJVVEVcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIGRlZkF0dHJpYnV0ZSAobmFtZSkge1xuICAgIHZhciBpZCA9IHN0cmluZ1N0b3JlLmlkKG5hbWUpXG4gICAgdmFyIHJlc3VsdCA9IGF0dHJpYnV0ZVN0YXRlW2lkXVxuICAgIGlmICghcmVzdWx0KSB7XG4gICAgICByZXN1bHQgPSBhdHRyaWJ1dGVTdGF0ZVtpZF0gPSBuZXcgQXR0cmlidXRlU3RhY2soKVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGJpbmRpbmdzOiBhdHRyaWJ1dGVCaW5kaW5ncyxcbiAgICBiaW5kOiBiaW5kQXR0cmlidXRlLFxuICAgIGRlZjogZGVmQXR0cmlidXRlXG4gIH1cbn1cbiIsIi8vIEFycmF5IGFuZCBlbGVtZW50IGJ1ZmZlciBjcmVhdGlvblxuXG52YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi9pcy10eXBlZC1hcnJheScpXG52YXIgaXNOREFycmF5TGlrZSA9IHJlcXVpcmUoJy4vaXMtbmRhcnJheScpXG52YXIgYXJyYXlUeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL2FycmF5dHlwZXMuanNvbicpXG52YXIgYnVmZmVyVHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9kdHlwZXMuanNvbicpXG52YXIgdmFsdWVzID0gcmVxdWlyZSgnLi92YWx1ZXMnKVxuXG52YXIgR0xfU1RBVElDX0RSQVcgPSAzNTA0NFxuXG52YXIgR0xfQllURSA9IDUxMjBcbnZhciBHTF9VTlNJR05FRF9CWVRFID0gNTEyMVxudmFyIEdMX1NIT1JUID0gNTEyMlxudmFyIEdMX1VOU0lHTkVEX1NIT1JUID0gNTEyM1xudmFyIEdMX0lOVCA9IDUxMjRcbnZhciBHTF9VTlNJR05FRF9JTlQgPSA1MTI1XG52YXIgR0xfRkxPQVQgPSA1MTI2XG5cbnZhciB1c2FnZVR5cGVzID0ge1xuICAnc3RhdGljJzogMzUwNDQsXG4gICdkeW5hbWljJzogMzUwNDgsXG4gICdzdHJlYW0nOiAzNTA0MFxufVxuXG5mdW5jdGlvbiB0eXBlZEFycmF5Q29kZSAoZGF0YSkge1xuICByZXR1cm4gYXJyYXlUeXBlc1tPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoZGF0YSldIHwgMFxufVxuXG5mdW5jdGlvbiBtYWtlVHlwZWRBcnJheSAoZHR5cGUsIGFyZ3MpIHtcbiAgc3dpdGNoIChkdHlwZSkge1xuICAgIGNhc2UgR0xfVU5TSUdORURfQllURTpcbiAgICAgIHJldHVybiBuZXcgVWludDhBcnJheShhcmdzKVxuICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlQ6XG4gICAgICByZXR1cm4gbmV3IFVpbnQxNkFycmF5KGFyZ3MpXG4gICAgY2FzZSBHTF9VTlNJR05FRF9JTlQ6XG4gICAgICByZXR1cm4gbmV3IFVpbnQzMkFycmF5KGFyZ3MpXG4gICAgY2FzZSBHTF9CWVRFOlxuICAgICAgcmV0dXJuIG5ldyBJbnQ4QXJyYXkoYXJncylcbiAgICBjYXNlIEdMX1NIT1JUOlxuICAgICAgcmV0dXJuIG5ldyBJbnQxNkFycmF5KGFyZ3MpXG4gICAgY2FzZSBHTF9JTlQ6XG4gICAgICByZXR1cm4gbmV3IEludDMyQXJyYXkoYXJncylcbiAgICBjYXNlIEdMX0ZMT0FUOlxuICAgICAgcmV0dXJuIG5ldyBGbG9hdDMyQXJyYXkoYXJncylcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIG51bGxcbiAgfVxufVxuXG5mdW5jdGlvbiBmbGF0dGVuIChyZXN1bHQsIGRhdGEsIGRpbWVuc2lvbikge1xuICB2YXIgcHRyID0gMFxuICBmb3IgKHZhciBpID0gMDsgaSA8IGRhdGEubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgdiA9IGRhdGFbaV1cbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IGRpbWVuc2lvbjsgKytqKSB7XG4gICAgICByZXN1bHRbcHRyKytdID0gdltqXVxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiB0cmFuc3Bvc2UgKHJlc3VsdCwgZGF0YSwgc2hhcGVYLCBzaGFwZVksIHN0cmlkZVgsIHN0cmlkZVksIG9mZnNldCkge1xuICB2YXIgcHRyID0gMFxuICBmb3IgKHZhciBpID0gMDsgaSA8IHNoYXBlWDsgKytpKSB7XG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBzaGFwZVk7ICsraikge1xuICAgICAgcmVzdWx0W3B0cisrXSA9IGRhdGFbc3RyaWRlWCAqIGkgKyBzdHJpZGVZICogaiArIG9mZnNldF1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBCdWZmZXJTdGF0ZSAoZ2wpIHtcbiAgdmFyIGJ1ZmZlckNvdW50ID0gMFxuICB2YXIgYnVmZmVyU2V0ID0ge31cblxuICBmdW5jdGlvbiBSRUdMQnVmZmVyIChidWZmZXIsIHR5cGUpIHtcbiAgICB0aGlzLmlkID0gYnVmZmVyQ291bnQrK1xuICAgIHRoaXMuYnVmZmVyID0gYnVmZmVyXG4gICAgdGhpcy50eXBlID0gdHlwZVxuICAgIHRoaXMudXNhZ2UgPSBHTF9TVEFUSUNfRFJBV1xuICAgIHRoaXMuYnl0ZUxlbmd0aCA9IDBcbiAgICB0aGlzLmRpbWVuc2lvbiA9IDFcbiAgICB0aGlzLmRhdGEgPSBudWxsXG4gICAgdGhpcy5kdHlwZSA9IEdMX1VOU0lHTkVEX0JZVEVcbiAgfVxuXG4gIFJFR0xCdWZmZXIucHJvdG90eXBlLmJpbmQgPSBmdW5jdGlvbiAoKSB7XG4gICAgZ2wuYmluZEJ1ZmZlcih0aGlzLnR5cGUsIHRoaXMuYnVmZmVyKVxuICB9XG5cbiAgZnVuY3Rpb24gcmVmcmVzaCAoYnVmZmVyKSB7XG4gICAgaWYgKCFnbC5pc0J1ZmZlcihidWZmZXIuYnVmZmVyKSkge1xuICAgICAgYnVmZmVyLmJ1ZmZlciA9IGdsLmNyZWF0ZUJ1ZmZlcigpXG4gICAgfVxuICAgIGJ1ZmZlci5iaW5kKClcbiAgICBnbC5idWZmZXJEYXRhKGJ1ZmZlci50eXBlLCBidWZmZXIuZGF0YSB8fCBidWZmZXIuYnl0ZUxlbmd0aCwgYnVmZmVyLnVzYWdlKVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSAoYnVmZmVyKSB7XG4gICAgdmFyIGhhbmRsZSA9IGJ1ZmZlci5idWZmZXJcbiAgICBcbiAgICBpZiAoZ2wuaXNCdWZmZXIoaGFuZGxlKSkge1xuICAgICAgZ2wuZGVsZXRlQnVmZmVyKGhhbmRsZSlcbiAgICB9XG4gICAgYnVmZmVyLmJ1ZmZlciA9IG51bGxcbiAgICBkZWxldGUgYnVmZmVyU2V0W2J1ZmZlci5pZF1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZUJ1ZmZlciAob3B0aW9ucywgdHlwZSwgZGVmZXJJbml0KSB7XG4gICAgdmFyIGhhbmRsZSA9IGdsLmNyZWF0ZUJ1ZmZlcigpXG5cbiAgICB2YXIgYnVmZmVyID0gbmV3IFJFR0xCdWZmZXIoaGFuZGxlLCB0eXBlKVxuICAgIGJ1ZmZlclNldFtidWZmZXIuaWRdID0gYnVmZmVyXG5cbiAgICBmdW5jdGlvbiByZWdsQnVmZmVyIChpbnB1dCkge1xuICAgICAgdmFyIG9wdGlvbnMgPSBpbnB1dCB8fCB7fVxuICAgICAgaWYgKEFycmF5LmlzQXJyYXkob3B0aW9ucykgfHxcbiAgICAgICAgICBpc1R5cGVkQXJyYXkob3B0aW9ucykgfHxcbiAgICAgICAgICBpc05EQXJyYXlMaWtlKG9wdGlvbnMpKSB7XG4gICAgICAgIG9wdGlvbnMgPSB7XG4gICAgICAgICAgZGF0YTogb3B0aW9uc1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBvcHRpb25zID09PSAnbnVtYmVyJykge1xuICAgICAgICBvcHRpb25zID0ge1xuICAgICAgICAgIGxlbmd0aDogb3B0aW9ucyB8IDBcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChvcHRpb25zID09PSBudWxsIHx8IG9wdGlvbnMgPT09IHZvaWQgMCkge1xuICAgICAgICBvcHRpb25zID0ge31cbiAgICAgIH1cblxuICAgICAgXG5cbiAgICAgIGlmICgndXNhZ2UnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIHVzYWdlID0gb3B0aW9ucy51c2FnZVxuICAgICAgICBcbiAgICAgICAgYnVmZmVyLnVzYWdlID0gdXNhZ2VUeXBlc1tvcHRpb25zLnVzYWdlXVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYnVmZmVyLnVzYWdlID0gR0xfU1RBVElDX0RSQVdcbiAgICAgIH1cblxuICAgICAgdmFyIGR0eXBlID0gMFxuICAgICAgaWYgKCd0eXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIFxuICAgICAgICBkdHlwZSA9IGJ1ZmZlclR5cGVzW29wdGlvbnMudHlwZV1cbiAgICAgIH1cblxuICAgICAgdmFyIGRpbWVuc2lvbiA9IChvcHRpb25zLmRpbWVuc2lvbiB8IDApIHx8IDFcbiAgICAgIHZhciBieXRlTGVuZ3RoID0gMFxuICAgICAgdmFyIGRhdGEgPSBudWxsXG4gICAgICBpZiAoJ2RhdGEnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgZGF0YSA9IG9wdGlvbnMuZGF0YVxuICAgICAgICBpZiAoZGF0YSA9PT0gbnVsbCkge1xuICAgICAgICAgIGJ5dGVMZW5ndGggPSBvcHRpb25zLmxlbmd0aCB8IDBcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAoaXNOREFycmF5TGlrZShkYXRhKSkge1xuICAgICAgICAgICAgdmFyIHNoYXBlID0gZGF0YS5zaGFwZVxuICAgICAgICAgICAgdmFyIHN0cmlkZSA9IGRhdGEuc3RyaWRlXG4gICAgICAgICAgICB2YXIgb2Zmc2V0ID0gZGF0YS5vZmZzZXRcblxuICAgICAgICAgICAgdmFyIHNoYXBlWCA9IDBcbiAgICAgICAgICAgIHZhciBzaGFwZVkgPSAwXG4gICAgICAgICAgICB2YXIgc3RyaWRlWCA9IDBcbiAgICAgICAgICAgIHZhciBzdHJpZGVZID0gMFxuICAgICAgICAgICAgaWYgKHNoYXBlLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgICBzaGFwZVggPSBzaGFwZVswXVxuICAgICAgICAgICAgICBzaGFwZVkgPSAxXG4gICAgICAgICAgICAgIHN0cmlkZVggPSBzdHJpZGVbMF1cbiAgICAgICAgICAgICAgc3RyaWRlWSA9IDBcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc2hhcGUubGVuZ3RoID09PSAyKSB7XG4gICAgICAgICAgICAgIHNoYXBlWCA9IHNoYXBlWzBdXG4gICAgICAgICAgICAgIHNoYXBlWSA9IHNoYXBlWzFdXG4gICAgICAgICAgICAgIHN0cmlkZVggPSBzdHJpZGVbMF1cbiAgICAgICAgICAgICAgc3RyaWRlWSA9IHN0cmlkZVsxXVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGR0eXBlID0gZHR5cGUgfHwgdHlwZWRBcnJheUNvZGUoZGF0YSkgfHwgR0xfRkxPQVRcbiAgICAgICAgICAgIGRpbWVuc2lvbiA9IHNoYXBlWVxuICAgICAgICAgICAgZGF0YSA9IHRyYW5zcG9zZShcbiAgICAgICAgICAgICAgbWFrZVR5cGVkQXJyYXkoZHR5cGUsIHNoYXBlWCAqIHNoYXBlWSksXG4gICAgICAgICAgICAgIGRhdGEuZGF0YSxcbiAgICAgICAgICAgICAgc2hhcGVYLCBzaGFwZVksXG4gICAgICAgICAgICAgIHN0cmlkZVgsIHN0cmlkZVksXG4gICAgICAgICAgICAgIG9mZnNldClcbiAgICAgICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoZGF0YSkpIHtcbiAgICAgICAgICAgIGlmIChkYXRhLmxlbmd0aCA+IDAgJiYgQXJyYXkuaXNBcnJheShkYXRhWzBdKSkge1xuICAgICAgICAgICAgICBkaW1lbnNpb24gPSBkYXRhWzBdLmxlbmd0aFxuICAgICAgICAgICAgICBkdHlwZSA9IGR0eXBlIHx8IEdMX0ZMT0FUXG4gICAgICAgICAgICAgIHZhciByZXN1bHQgPSBtYWtlVHlwZWRBcnJheShkdHlwZSwgZGF0YS5sZW5ndGggKiBkaW1lbnNpb24pXG4gICAgICAgICAgICAgIGRhdGEgPSBmbGF0dGVuKHJlc3VsdCwgZGF0YSwgZGltZW5zaW9uKVxuICAgICAgICAgICAgICBkYXRhID0gcmVzdWx0XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBkdHlwZSA9IGR0eXBlIHx8IEdMX0ZMT0FUXG4gICAgICAgICAgICAgIGRhdGEgPSBtYWtlVHlwZWRBcnJheShkdHlwZSwgZGF0YSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBkdHlwZSA9IGR0eXBlIHx8IHR5cGVkQXJyYXlDb2RlKGRhdGEpXG4gICAgICAgICAgfVxuICAgICAgICAgIGJ5dGVMZW5ndGggPSBkYXRhLmJ5dGVMZW5ndGhcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICgnbGVuZ3RoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIGJ5dGVMZW5ndGggPSBvcHRpb25zLmxlbmd0aCB8IDBcbiAgICAgICAgXG4gICAgICB9XG5cbiAgICAgIGJ1ZmZlci5kYXRhID0gZGF0YVxuICAgICAgYnVmZmVyLmR0eXBlID0gZHR5cGUgfHwgR0xfVU5TSUdORURfQllURVxuICAgICAgYnVmZmVyLmJ5dGVMZW5ndGggPSBieXRlTGVuZ3RoXG4gICAgICBidWZmZXIuZGltZW5zaW9uID0gZGltZW5zaW9uXG5cbiAgICAgIHJlZnJlc2goYnVmZmVyKVxuXG4gICAgICByZXR1cm4gcmVnbEJ1ZmZlclxuICAgIH1cblxuICAgIGlmICghZGVmZXJJbml0KSB7XG4gICAgICByZWdsQnVmZmVyKG9wdGlvbnMpXG4gICAgfVxuXG4gICAgcmVnbEJ1ZmZlci5fcmVnbFR5cGUgPSAnYnVmZmVyJ1xuICAgIHJlZ2xCdWZmZXIuX2J1ZmZlciA9IGJ1ZmZlclxuICAgIHJlZ2xCdWZmZXIuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHsgZGVzdHJveShidWZmZXIpIH1cblxuICAgIHJldHVybiByZWdsQnVmZmVyXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNyZWF0ZTogY3JlYXRlQnVmZmVyLFxuXG4gICAgY2xlYXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhbHVlcyhidWZmZXJTZXQpLmZvckVhY2goZGVzdHJveSlcbiAgICB9LFxuXG4gICAgcmVmcmVzaDogZnVuY3Rpb24gKCkge1xuICAgICAgdmFsdWVzKGJ1ZmZlclNldCkuZm9yRWFjaChyZWZyZXNoKVxuICAgIH0sXG5cbiAgICBnZXRCdWZmZXI6IGZ1bmN0aW9uICh3cmFwcGVyKSB7XG4gICAgICBpZiAod3JhcHBlciAmJiB3cmFwcGVyLl9idWZmZXIgaW5zdGFuY2VvZiBSRUdMQnVmZmVyKSB7XG4gICAgICAgIHJldHVybiB3cmFwcGVyLl9idWZmZXJcbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuICB9XG59XG4iLCIvKiBnbG9iYWxzIHBlcmZvcm1hbmNlICovXG5tb2R1bGUuZXhwb3J0cyA9XG4gICh0eXBlb2YgcGVyZm9ybWFuY2UgIT09ICd1bmRlZmluZWQnICYmIHBlcmZvcm1hbmNlLm5vdylcbiAgPyBmdW5jdGlvbiAoKSB7IHJldHVybiBwZXJmb3JtYW5jZS5ub3coKSB9XG4gIDogZnVuY3Rpb24gKCkgeyByZXR1cm4gKyhuZXcgRGF0ZSgpKSB9XG4iLCJ2YXIgZXh0ZW5kID0gcmVxdWlyZSgnLi9leHRlbmQnKVxuXG5mdW5jdGlvbiBzbGljZSAoeCkge1xuICByZXR1cm4gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoeClcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjcmVhdGVFbnZpcm9ubWVudCAoKSB7XG4gIC8vIFVuaXF1ZSB2YXJpYWJsZSBpZCBjb3VudGVyXG4gIHZhciB2YXJDb3VudGVyID0gMFxuXG4gIC8vIExpbmtlZCB2YWx1ZXMgYXJlIHBhc3NlZCBmcm9tIHRoaXMgc2NvcGUgaW50byB0aGUgZ2VuZXJhdGVkIGNvZGUgYmxvY2tcbiAgLy8gQ2FsbGluZyBsaW5rKCkgcGFzc2VzIGEgdmFsdWUgaW50byB0aGUgZ2VuZXJhdGVkIHNjb3BlIGFuZCByZXR1cm5zXG4gIC8vIHRoZSB2YXJpYWJsZSBuYW1lIHdoaWNoIGl0IGlzIGJvdW5kIHRvXG4gIHZhciBsaW5rZWROYW1lcyA9IFtdXG4gIHZhciBsaW5rZWRWYWx1ZXMgPSBbXVxuICBmdW5jdGlvbiBsaW5rICh2YWx1ZSkge1xuICAgIHZhciBuYW1lID0gJ2cnICsgKHZhckNvdW50ZXIrKylcbiAgICBsaW5rZWROYW1lcy5wdXNoKG5hbWUpXG4gICAgbGlua2VkVmFsdWVzLnB1c2godmFsdWUpXG4gICAgcmV0dXJuIG5hbWVcbiAgfVxuXG4gIC8vIGNyZWF0ZSBhIGNvZGUgYmxvY2tcbiAgZnVuY3Rpb24gYmxvY2sgKCkge1xuICAgIHZhciBjb2RlID0gW11cbiAgICBmdW5jdGlvbiBwdXNoICgpIHtcbiAgICAgIGNvZGUucHVzaC5hcHBseShjb2RlLCBzbGljZShhcmd1bWVudHMpKVxuICAgIH1cblxuICAgIHZhciB2YXJzID0gW11cbiAgICBmdW5jdGlvbiBkZWYgKCkge1xuICAgICAgdmFyIG5hbWUgPSAndicgKyAodmFyQ291bnRlcisrKVxuICAgICAgdmFycy5wdXNoKG5hbWUpXG5cbiAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb2RlLnB1c2gobmFtZSwgJz0nKVxuICAgICAgICBjb2RlLnB1c2guYXBwbHkoY29kZSwgc2xpY2UoYXJndW1lbnRzKSlcbiAgICAgICAgY29kZS5wdXNoKCc7JylcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG5hbWVcbiAgICB9XG5cbiAgICByZXR1cm4gZXh0ZW5kKHB1c2gsIHtcbiAgICAgIGRlZjogZGVmLFxuICAgICAgdG9TdHJpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAodmFycy5sZW5ndGggPiAwID8gJ3ZhciAnICsgdmFycyArICc7JyA6ICcnKSxcbiAgICAgICAgICBjb2RlLmpvaW4oJycpXG4gICAgICAgIF0uam9pbignJylcbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgLy8gcHJvY2VkdXJlIGxpc3RcbiAgdmFyIHByb2NlZHVyZXMgPSB7fVxuICBmdW5jdGlvbiBwcm9jIChuYW1lKSB7XG4gICAgdmFyIGFyZ3MgPSBbXVxuICAgIGZ1bmN0aW9uIGFyZyAoKSB7XG4gICAgICB2YXIgbmFtZSA9ICdhJyArICh2YXJDb3VudGVyKyspXG4gICAgICBhcmdzLnB1c2gobmFtZSlcbiAgICAgIHJldHVybiBuYW1lXG4gICAgfVxuXG4gICAgdmFyIGJvZHkgPSBibG9jaygpXG4gICAgdmFyIGJvZHlUb1N0cmluZyA9IGJvZHkudG9TdHJpbmdcblxuICAgIHZhciByZXN1bHQgPSBwcm9jZWR1cmVzW25hbWVdID0gZXh0ZW5kKGJvZHksIHtcbiAgICAgIGFyZzogYXJnLFxuICAgICAgdG9TdHJpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAnZnVuY3Rpb24oJywgYXJncy5qb2luKCksICcpeycsXG4gICAgICAgICAgYm9keVRvU3RyaW5nKCksXG4gICAgICAgICAgJ30nXG4gICAgICAgIF0uam9pbignJylcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG5cbiAgZnVuY3Rpb24gY29tcGlsZSAoKSB7XG4gICAgdmFyIGNvZGUgPSBbJ1widXNlIHN0cmljdFwiO3JldHVybiB7J11cbiAgICBPYmplY3Qua2V5cyhwcm9jZWR1cmVzKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICBjb2RlLnB1c2goJ1wiJywgbmFtZSwgJ1wiOicsIHByb2NlZHVyZXNbbmFtZV0udG9TdHJpbmcoKSwgJywnKVxuICAgIH0pXG4gICAgY29kZS5wdXNoKCd9JylcbiAgICB2YXIgcHJvYyA9IEZ1bmN0aW9uLmFwcGx5KG51bGwsIGxpbmtlZE5hbWVzLmNvbmNhdChbY29kZS5qb2luKCcnKV0pKVxuICAgIHJldHVybiBwcm9jLmFwcGx5KG51bGwsIGxpbmtlZFZhbHVlcylcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgbGluazogbGluayxcbiAgICBibG9jazogYmxvY2ssXG4gICAgcHJvYzogcHJvYyxcbiAgICBjb21waWxlOiBjb21waWxlXG4gIH1cbn1cbiIsIlxudmFyIGNyZWF0ZUVudmlyb25tZW50ID0gcmVxdWlyZSgnLi9jb2RlZ2VuJylcblxudmFyIHByaW1UeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL3ByaW1pdGl2ZXMuanNvbicpXG52YXIgZ2xUeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL2R0eXBlcy5qc29uJylcblxudmFyIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSID0gMzQ5NjNcblxudmFyIEdMX0ZMT0FUID0gNTEyNlxudmFyIEdMX0ZMT0FUX1ZFQzIgPSAzNTY2NFxudmFyIEdMX0ZMT0FUX1ZFQzMgPSAzNTY2NVxudmFyIEdMX0ZMT0FUX1ZFQzQgPSAzNTY2NlxudmFyIEdMX0lOVCA9IDUxMjRcbnZhciBHTF9JTlRfVkVDMiA9IDM1NjY3XG52YXIgR0xfSU5UX1ZFQzMgPSAzNTY2OFxudmFyIEdMX0lOVF9WRUM0ID0gMzU2NjlcbnZhciBHTF9CT09MID0gMzU2NzBcbnZhciBHTF9CT09MX1ZFQzIgPSAzNTY3MVxudmFyIEdMX0JPT0xfVkVDMyA9IDM1NjcyXG52YXIgR0xfQk9PTF9WRUM0ID0gMzU2NzNcbnZhciBHTF9GTE9BVF9NQVQyID0gMzU2NzRcbnZhciBHTF9GTE9BVF9NQVQzID0gMzU2NzVcbnZhciBHTF9GTE9BVF9NQVQ0ID0gMzU2NzZcbnZhciBHTF9TQU1QTEVSXzJEID0gMzU2NzhcbnZhciBHTF9TQU1QTEVSX0NVQkUgPSAzNTY4MFxuXG52YXIgR0xfVFJJQU5HTEVTID0gNFxuXG52YXIgR0xfQ1VMTF9GQUNFID0gMHgwQjQ0XG52YXIgR0xfQkxFTkQgPSAweDBCRTJcbnZhciBHTF9ESVRIRVIgPSAweDBCRDBcbnZhciBHTF9TVEVOQ0lMX1RFU1QgPSAweDBCOTBcbnZhciBHTF9ERVBUSF9URVNUID0gMHgwQjcxXG52YXIgR0xfU0NJU1NPUl9URVNUID0gMHgwQzExXG52YXIgR0xfUE9MWUdPTl9PRkZTRVRfRklMTCA9IDB4ODAzN1xudmFyIEdMX1NBTVBMRV9BTFBIQV9UT19DT1ZFUkFHRSA9IDB4ODA5RVxudmFyIEdMX1NBTVBMRV9DT1ZFUkFHRSA9IDB4ODBBMFxuXG52YXIgR0xfRlJPTlQgPSAxMDI4XG52YXIgR0xfQkFDSyA9IDEwMjlcblxudmFyIEdMX0NXID0gMHgwOTAwXG52YXIgR0xfQ0NXID0gMHgwOTAxXG5cbnZhciBHTF9NSU5fRVhUID0gMHg4MDA3XG52YXIgR0xfTUFYX0VYVCA9IDB4ODAwOFxuXG52YXIgYmxlbmRGdW5jcyA9IHtcbiAgJzAnOiAwLFxuICAnMSc6IDEsXG4gICd6ZXJvJzogMCxcbiAgJ29uZSc6IDEsXG4gICdzcmMgY29sb3InOiA3NjgsXG4gICdvbmUgbWludXMgc3JjIGNvbG9yJzogNzY5LFxuICAnc3JjIGFscGhhJzogNzcwLFxuICAnb25lIG1pbnVzIHNyYyBhbHBoYSc6IDc3MSxcbiAgJ2RzdCBjb2xvcic6IDc3NCxcbiAgJ29uZSBtaW51cyBkc3QgY29sb3InOiA3NzUsXG4gICdkc3QgYWxwaGEnOiA3NzIsXG4gICdvbmUgbWludXMgZHN0IGFscGhhJzogNzczLFxuICAnY29uc3RhbnQgY29sb3InOiAzMjc2OSxcbiAgJ29uZSBtaW51cyBjb25zdGFudCBjb2xvcic6IDMyNzcwLFxuICAnY29uc3RhbnQgYWxwaGEnOiAzMjc3MSxcbiAgJ29uZSBtaW51cyBjb25zdGFudCBhbHBoYSc6IDMyNzcyLFxuICAnc3JjIGFscGhhIHNhdHVyYXRlJzogNzc2XG59XG5cbnZhciBjb21wYXJlRnVuY3MgPSB7XG4gICduZXZlcic6IDUxMixcbiAgJ2xlc3MnOiA1MTMsXG4gICc8JzogNTEzLFxuICAnZXF1YWwnOiA1MTQsXG4gICc9JzogNTE0LFxuICAnPT0nOiA1MTQsXG4gICc9PT0nOiA1MTQsXG4gICdsZXF1YWwnOiA1MTUsXG4gICc8PSc6IDUxNSxcbiAgJ2dyZWF0ZXInOiA1MTYsXG4gICc+JzogNTE2LFxuICAnbm90ZXF1YWwnOiA1MTcsXG4gICchPSc6IDUxNyxcbiAgJyE9PSc6IDUxNyxcbiAgJ2dlcXVhbCc6IDUxOCxcbiAgJz49JzogNTE4LFxuICAnYWx3YXlzJzogNTE5XG59XG5cbnZhciBzdGVuY2lsT3BzID0ge1xuICAnMCc6IDAsXG4gICd6ZXJvJzogMCxcbiAgJ2tlZXAnOiA3NjgwLFxuICAncmVwbGFjZSc6IDc2ODEsXG4gICdpbmNyZW1lbnQnOiA3NjgyLFxuICAnZGVjcmVtZW50JzogNzY4MyxcbiAgJ2luY3JlbWVudCB3cmFwJzogMzQwNTUsXG4gICdkZWNyZW1lbnQgd3JhcCc6IDM0MDU2LFxuICAnaW52ZXJ0JzogNTM4NlxufVxuXG5mdW5jdGlvbiB0eXBlTGVuZ3RoICh4KSB7XG4gIHN3aXRjaCAoeCkge1xuICAgIGNhc2UgR0xfRkxPQVRfVkVDMjpcbiAgICBjYXNlIEdMX0lOVF9WRUMyOlxuICAgIGNhc2UgR0xfQk9PTF9WRUMyOlxuICAgICAgcmV0dXJuIDJcbiAgICBjYXNlIEdMX0ZMT0FUX1ZFQzM6XG4gICAgY2FzZSBHTF9JTlRfVkVDMzpcbiAgICBjYXNlIEdMX0JPT0xfVkVDMzpcbiAgICAgIHJldHVybiAzXG4gICAgY2FzZSBHTF9GTE9BVF9WRUM0OlxuICAgIGNhc2UgR0xfSU5UX1ZFQzQ6XG4gICAgY2FzZSBHTF9CT09MX1ZFQzQ6XG4gICAgICByZXR1cm4gNFxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gMVxuICB9XG59XG5cbmZ1bmN0aW9uIHNldFVuaWZvcm1TdHJpbmcgKGdsLCB0eXBlLCBsb2NhdGlvbiwgdmFsdWUpIHtcbiAgdmFyIGluZml4XG4gIHZhciBzZXBhcmF0b3IgPSAnLCdcbiAgc3dpdGNoICh0eXBlKSB7XG4gICAgY2FzZSBHTF9GTE9BVDpcbiAgICAgIGluZml4ID0gJzFmJ1xuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX0ZMT0FUX1ZFQzI6XG4gICAgICBpbmZpeCA9ICcyZnYnXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfRkxPQVRfVkVDMzpcbiAgICAgIGluZml4ID0gJzNmdidcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9GTE9BVF9WRUM0OlxuICAgICAgaW5maXggPSAnNGZ2J1xuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX0JPT0w6XG4gICAgY2FzZSBHTF9JTlQ6XG4gICAgICBpbmZpeCA9ICcxaSdcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9CT09MX1ZFQzI6XG4gICAgY2FzZSBHTF9JTlRfVkVDMjpcbiAgICAgIGluZml4ID0gJzJpdidcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9CT09MX1ZFQzM6XG4gICAgY2FzZSBHTF9JTlRfVkVDMzpcbiAgICAgIGluZml4ID0gJzNpdidcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9CT09MX1ZFQzQ6XG4gICAgY2FzZSBHTF9JTlRfVkVDNDpcbiAgICAgIGluZml4ID0gJzRpdidcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9GTE9BVF9NQVQyOlxuICAgICAgaW5maXggPSAnTWF0cml4MmZ2J1xuICAgICAgc2VwYXJhdG9yID0gJyxmYWxzZSwnXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfRkxPQVRfTUFUMzpcbiAgICAgIGluZml4ID0gJ01hdHJpeDNmdidcbiAgICAgIHNlcGFyYXRvciA9ICcsZmFsc2UsJ1xuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX0ZMT0FUX01BVDQ6XG4gICAgICBpbmZpeCA9ICdNYXRyaXg0ZnYnXG4gICAgICBzZXBhcmF0b3IgPSAnLGZhbHNlLCdcbiAgICAgIGJyZWFrXG4gICAgZGVmYXVsdDpcbiAgICAgIFxuICB9XG4gIHJldHVybiBnbCArICcudW5pZm9ybScgKyBpbmZpeCArICcoJyArIGxvY2F0aW9uICsgc2VwYXJhdG9yICsgdmFsdWUgKyAnKTsnXG59XG5cbmZ1bmN0aW9uIHN0YWNrVG9wICh4KSB7XG4gIHJldHVybiB4ICsgJ1snICsgeCArICcubGVuZ3RoLTFdJ1xufVxuXG4vLyBOZWVkIHRvIHByb2Nlc3MgZnJhbWVidWZmZXIgZmlyc3QgaW4gb3B0aW9ucyBsaXN0XG5mdW5jdGlvbiBvcHRpb25Qcmlvcml0eSAoYSwgYikge1xuICBpZiAoYSA9PT0gJ2ZyYW1lYnVmZmVyJykge1xuICAgIHJldHVybiAtMVxuICB9XG4gIGlmIChhIDwgYikge1xuICAgIHJldHVybiAtMVxuICB9IGVsc2UgaWYgKGEgPiBiKSB7XG4gICAgcmV0dXJuIDFcbiAgfVxuICByZXR1cm4gMFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHJlZ2xDb21waWxlciAoXG4gIGdsLFxuICBzdHJpbmdTdG9yZSxcbiAgZXh0ZW5zaW9ucyxcbiAgbGltaXRzLFxuICBidWZmZXJTdGF0ZSxcbiAgZWxlbWVudFN0YXRlLFxuICB0ZXh0dXJlU3RhdGUsXG4gIGZyYW1lYnVmZmVyU3RhdGUsXG4gIGdsU3RhdGUsXG4gIHVuaWZvcm1TdGF0ZSxcbiAgYXR0cmlidXRlU3RhdGUsXG4gIHNoYWRlclN0YXRlLFxuICBkcmF3U3RhdGUsXG4gIGZyYW1lU3RhdGUsXG4gIHJlZ2xQb2xsKSB7XG4gIHZhciBjb250ZXh0U3RhdGUgPSBnbFN0YXRlLmNvbnRleHRTdGF0ZVxuXG4gIHZhciBibGVuZEVxdWF0aW9ucyA9IHtcbiAgICAnYWRkJzogMzI3NzQsXG4gICAgJ3N1YnRyYWN0JzogMzI3NzgsXG4gICAgJ3JldmVyc2Ugc3VidHJhY3QnOiAzMjc3OVxuICB9XG4gIGlmIChleHRlbnNpb25zLmV4dF9ibGVuZF9taW5tYXgpIHtcbiAgICBibGVuZEVxdWF0aW9ucy5taW4gPSBHTF9NSU5fRVhUXG4gICAgYmxlbmRFcXVhdGlvbnMubWF4ID0gR0xfTUFYX0VYVFxuICB9XG5cbiAgdmFyIGRyYXdDYWxsQ291bnRlciA9IDBcblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIFNIQURFUiBTSU5HTEUgRFJBVyBPUEVSQVRJT05cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICBmdW5jdGlvbiBjb21waWxlU2hhZGVyRHJhdyAocHJvZ3JhbSkge1xuICAgIHZhciBlbnYgPSBjcmVhdGVFbnZpcm9ubWVudCgpXG4gICAgdmFyIGxpbmsgPSBlbnYubGlua1xuICAgIHZhciBkcmF3ID0gZW52LnByb2MoJ2RyYXcnKVxuICAgIHZhciBkZWYgPSBkcmF3LmRlZlxuXG4gICAgdmFyIEdMID0gbGluayhnbClcbiAgICB2YXIgUFJPR1JBTSA9IGxpbmsocHJvZ3JhbS5wcm9ncmFtKVxuICAgIHZhciBCSU5EX0FUVFJJQlVURSA9IGxpbmsoYXR0cmlidXRlU3RhdGUuYmluZClcbiAgICB2YXIgRFJBV19TVEFURSA9IHtcbiAgICAgIGNvdW50OiBsaW5rKGRyYXdTdGF0ZS5jb3VudCksXG4gICAgICBvZmZzZXQ6IGxpbmsoZHJhd1N0YXRlLm9mZnNldCksXG4gICAgICBpbnN0YW5jZXM6IGxpbmsoZHJhd1N0YXRlLmluc3RhbmNlcyksXG4gICAgICBwcmltaXRpdmU6IGxpbmsoZHJhd1N0YXRlLnByaW1pdGl2ZSlcbiAgICB9XG4gICAgdmFyIEVMRU1FTlRfU1RBVEUgPSBsaW5rKGVsZW1lbnRTdGF0ZS5lbGVtZW50cylcbiAgICB2YXIgVEVYVFVSRV9VTklGT1JNUyA9IFtdXG5cbiAgICAvLyBiaW5kIHRoZSBwcm9ncmFtXG4gICAgZHJhdyhHTCwgJy51c2VQcm9ncmFtKCcsIFBST0dSQU0sICcpOycpXG5cbiAgICAvLyBzZXQgdXAgYXR0cmlidXRlIHN0YXRlXG4gICAgcHJvZ3JhbS5hdHRyaWJ1dGVzLmZvckVhY2goZnVuY3Rpb24gKGF0dHJpYnV0ZSkge1xuICAgICAgdmFyIFNUQUNLID0gbGluayhhdHRyaWJ1dGVTdGF0ZS5kZWYoYXR0cmlidXRlLm5hbWUpKVxuICAgICAgZHJhdyhCSU5EX0FUVFJJQlVURSwgJygnLFxuICAgICAgICBhdHRyaWJ1dGUubG9jYXRpb24sICcsJyxcbiAgICAgICAgbGluayhhdHRyaWJ1dGVTdGF0ZS5iaW5kaW5nc1thdHRyaWJ1dGUubG9jYXRpb25dKSwgJywnLFxuICAgICAgICBTVEFDSywgJy5yZWNvcmRzWycsIFNUQUNLLCAnLnRvcF0nLCAnLCcsXG4gICAgICAgIHR5cGVMZW5ndGgoYXR0cmlidXRlLmluZm8udHlwZSksICcpOycpXG4gICAgfSlcblxuICAgIC8vIHNldCB1cCB1bmlmb3Jtc1xuICAgIHByb2dyYW0udW5pZm9ybXMuZm9yRWFjaChmdW5jdGlvbiAodW5pZm9ybSkge1xuICAgICAgdmFyIExPQ0FUSU9OID0gbGluayh1bmlmb3JtLmxvY2F0aW9uKVxuICAgICAgdmFyIFNUQUNLID0gbGluayh1bmlmb3JtU3RhdGUuZGVmKHVuaWZvcm0ubmFtZSkpXG4gICAgICB2YXIgVE9QID0gU1RBQ0sgKyAnWycgKyBTVEFDSyArICcubGVuZ3RoLTFdJ1xuICAgICAgdmFyIHR5cGUgPSB1bmlmb3JtLmluZm8udHlwZVxuICAgICAgaWYgKHR5cGUgPT09IEdMX1NBTVBMRVJfMkQgfHwgdHlwZSA9PT0gR0xfU0FNUExFUl9DVUJFKSB7XG4gICAgICAgIHZhciBURVhfVkFMVUUgPSBkZWYoVE9QICsgJy5fdGV4dHVyZScpXG4gICAgICAgIFRFWFRVUkVfVU5JRk9STVMucHVzaChURVhfVkFMVUUpXG4gICAgICAgIGRyYXcoc2V0VW5pZm9ybVN0cmluZyhHTCwgR0xfSU5ULCBMT0NBVElPTiwgVEVYX1ZBTFVFICsgJy5iaW5kKCknKSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRyYXcoc2V0VW5pZm9ybVN0cmluZyhHTCwgdHlwZSwgTE9DQVRJT04sIFRPUCkpXG4gICAgICB9XG4gICAgfSlcblxuICAgIC8vIHVuYmluZCB0ZXh0dXJlcyBpbW1lZGlhdGVseVxuICAgIFRFWFRVUkVfVU5JRk9STVMuZm9yRWFjaChmdW5jdGlvbiAoVEVYX1ZBTFVFKSB7XG4gICAgICBkcmF3KFRFWF9WQUxVRSwgJy51bmJpbmQoKTsnKVxuICAgIH0pXG5cbiAgICAvLyBFeGVjdXRlIGRyYXcgY29tbWFuZFxuICAgIHZhciBDVVJfUFJJTUlUSVZFID0gZGVmKHN0YWNrVG9wKERSQVdfU1RBVEUucHJpbWl0aXZlKSlcbiAgICB2YXIgQ1VSX0NPVU5UID0gZGVmKHN0YWNrVG9wKERSQVdfU1RBVEUuY291bnQpKVxuICAgIHZhciBDVVJfT0ZGU0VUID0gZGVmKHN0YWNrVG9wKERSQVdfU1RBVEUub2Zmc2V0KSlcbiAgICB2YXIgQ1VSX0VMRU1FTlRTID0gZGVmKHN0YWNrVG9wKEVMRU1FTlRfU1RBVEUpKVxuXG4gICAgLy8gT25seSBleGVjdXRlIGRyYXcgY29tbWFuZCBpZiBudW1iZXIgZWxlbWVudHMgaXMgPiAwXG4gICAgZHJhdygnaWYoJywgQ1VSX0NPVU5ULCAnKXsnKVxuXG4gICAgdmFyIGluc3RhbmNpbmcgPSBleHRlbnNpb25zLmFuZ2xlX2luc3RhbmNlZF9hcnJheXNcbiAgICBpZiAoaW5zdGFuY2luZykge1xuICAgICAgdmFyIENVUl9JTlNUQU5DRVMgPSBkZWYoc3RhY2tUb3AoRFJBV19TVEFURS5pbnN0YW5jZXMpKVxuICAgICAgdmFyIElOU1RBTkNFX0VYVCA9IGxpbmsoaW5zdGFuY2luZylcbiAgICAgIGRyYXcoXG4gICAgICAgICdpZignLCBDVVJfRUxFTUVOVFMsICcpeycsXG4gICAgICAgIENVUl9FTEVNRU5UUywgJy5iaW5kKCk7JyxcbiAgICAgICAgJ2lmKCcsIENVUl9JTlNUQU5DRVMsICc+MCl7JyxcbiAgICAgICAgSU5TVEFOQ0VfRVhULCAnLmRyYXdFbGVtZW50c0luc3RhbmNlZEFOR0xFKCcsXG4gICAgICAgIENVUl9QUklNSVRJVkUsICcsJyxcbiAgICAgICAgQ1VSX0NPVU5ULCAnLCcsXG4gICAgICAgIENVUl9FTEVNRU5UUywgJy50eXBlLCcsXG4gICAgICAgIENVUl9PRkZTRVQsICcsJyxcbiAgICAgICAgQ1VSX0lOU1RBTkNFUywgJyk7fWVsc2V7JyxcbiAgICAgICAgR0wsICcuZHJhd0VsZW1lbnRzKCcsXG4gICAgICAgIENVUl9QUklNSVRJVkUsICcsJyxcbiAgICAgICAgQ1VSX0NPVU5ULCAnLCcsXG4gICAgICAgIENVUl9FTEVNRU5UUywgJy50eXBlLCcsXG4gICAgICAgIENVUl9PRkZTRVQsICcpO30nLFxuICAgICAgICAnfWVsc2UgaWYoJywgQ1VSX0lOU1RBTkNFUywgJz4wKXsnLFxuICAgICAgICBJTlNUQU5DRV9FWFQsICcuZHJhd0FycmF5c0luc3RhbmNlZEFOR0xFKCcsXG4gICAgICAgIENVUl9QUklNSVRJVkUsICcsJyxcbiAgICAgICAgQ1VSX09GRlNFVCwgJywnLFxuICAgICAgICBDVVJfQ09VTlQsICcsJyxcbiAgICAgICAgQ1VSX0lOU1RBTkNFUywgJyk7fWVsc2V7JyxcbiAgICAgICAgR0wsICcuZHJhd0FycmF5cygnLFxuICAgICAgICBDVVJfUFJJTUlUSVZFLCAnLCcsXG4gICAgICAgIENVUl9PRkZTRVQsICcsJyxcbiAgICAgICAgQ1VSX0NPVU5ULCAnKTt9fScpXG4gICAgfSBlbHNlIHtcbiAgICAgIGRyYXcoXG4gICAgICAgICdpZignLCBDVVJfRUxFTUVOVFMsICcpeycsXG4gICAgICAgIEdMLCAnLmRyYXdFbGVtZW50cygnLFxuICAgICAgICBDVVJfUFJJTUlUSVZFLCAnLCcsXG4gICAgICAgIENVUl9DT1VOVCwgJywnLFxuICAgICAgICBDVVJfRUxFTUVOVFMsICcudHlwZSwnLFxuICAgICAgICBDVVJfT0ZGU0VULCAnKTt9JyxcbiAgICAgICAgJ31lbHNleycsXG4gICAgICAgIEdMLCAnLmRyYXdBcnJheXMoJyxcbiAgICAgICAgQ1VSX1BSSU1JVElWRSwgJywnLFxuICAgICAgICBDVVJfT0ZGU0VULCAnLCcsXG4gICAgICAgIENVUl9DT1VOVCwgJyk7fScpXG4gICAgfVxuXG4gICAgcmV0dXJuIGVudi5jb21waWxlKCkuZHJhd1xuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBCQVRDSCBEUkFXIE9QRVJBVElPTlxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIGNvbXBpbGVCYXRjaCAoXG4gICAgcHJvZ3JhbSwgb3B0aW9ucywgdW5pZm9ybXMsIGF0dHJpYnV0ZXMsIHN0YXRpY09wdGlvbnMpIHtcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gY29kZSBnZW5lcmF0aW9uIGhlbHBlcnNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgdmFyIGVudiA9IGNyZWF0ZUVudmlyb25tZW50KClcbiAgICB2YXIgbGluayA9IGVudi5saW5rXG4gICAgdmFyIGJhdGNoID0gZW52LnByb2MoJ2JhdGNoJylcbiAgICB2YXIgZXhpdCA9IGVudi5ibG9jaygpXG4gICAgdmFyIGRlZiA9IGJhdGNoLmRlZlxuICAgIHZhciBhcmcgPSBiYXRjaC5hcmdcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyByZWdsIHN0YXRlXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHZhciBHTCA9IGxpbmsoZ2wpXG4gICAgdmFyIFBST0dSQU0gPSBsaW5rKHByb2dyYW0ucHJvZ3JhbSlcbiAgICB2YXIgQklORF9BVFRSSUJVVEUgPSBsaW5rKGF0dHJpYnV0ZVN0YXRlLmJpbmQpXG4gICAgdmFyIEZSQU1FX1NUQVRFID0gbGluayhmcmFtZVN0YXRlKVxuICAgIHZhciBGUkFNRUJVRkZFUl9TVEFURSA9IGxpbmsoZnJhbWVidWZmZXJTdGF0ZSlcbiAgICB2YXIgRFJBV19TVEFURSA9IHtcbiAgICAgIGNvdW50OiBsaW5rKGRyYXdTdGF0ZS5jb3VudCksXG4gICAgICBvZmZzZXQ6IGxpbmsoZHJhd1N0YXRlLm9mZnNldCksXG4gICAgICBpbnN0YW5jZXM6IGxpbmsoZHJhd1N0YXRlLmluc3RhbmNlcyksXG4gICAgICBwcmltaXRpdmU6IGxpbmsoZHJhd1N0YXRlLnByaW1pdGl2ZSlcbiAgICB9XG4gICAgdmFyIENPTlRFWFRfU1RBVEUgPSB7fVxuICAgIHZhciBFTEVNRU5UUyA9IGxpbmsoZWxlbWVudFN0YXRlLmVsZW1lbnRzKVxuICAgIHZhciBDVVJfQ09VTlQgPSBkZWYoc3RhY2tUb3AoRFJBV19TVEFURS5jb3VudCkpXG4gICAgdmFyIENVUl9PRkZTRVQgPSBkZWYoc3RhY2tUb3AoRFJBV19TVEFURS5vZmZzZXQpKVxuICAgIHZhciBDVVJfUFJJTUlUSVZFID0gZGVmKHN0YWNrVG9wKERSQVdfU1RBVEUucHJpbWl0aXZlKSlcbiAgICB2YXIgQ1VSX0VMRU1FTlRTID0gZGVmKHN0YWNrVG9wKEVMRU1FTlRTKSlcbiAgICB2YXIgQ1VSX0lOU1RBTkNFU1xuICAgIHZhciBJTlNUQU5DRV9FWFRcbiAgICB2YXIgaW5zdGFuY2luZyA9IGV4dGVuc2lvbnMuYW5nbGVfaW5zdGFuY2VkX2FycmF5c1xuICAgIGlmIChpbnN0YW5jaW5nKSB7XG4gICAgICBDVVJfSU5TVEFOQ0VTID0gZGVmKHN0YWNrVG9wKERSQVdfU1RBVEUuaW5zdGFuY2VzKSlcbiAgICAgIElOU1RBTkNFX0VYVCA9IGxpbmsoaW5zdGFuY2luZylcbiAgICB9XG4gICAgdmFyIGhhc0R5bmFtaWNFbGVtZW50cyA9ICdlbGVtZW50cycgaW4gb3B0aW9uc1xuXG4gICAgZnVuY3Rpb24gbGlua0NvbnRleHQgKHgpIHtcbiAgICAgIHZhciByZXN1bHQgPSBDT05URVhUX1NUQVRFW3hdXG4gICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH1cbiAgICAgIHJlc3VsdCA9IENPTlRFWFRfU1RBVEVbeF0gPSBsaW5rKGNvbnRleHRTdGF0ZVt4XSlcbiAgICAgIHJldHVybiByZXN1bHRcbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gYmF0Y2gvYXJndW1lbnQgdmFyc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICB2YXIgTlVNX0FSR1MgPSBhcmcoKVxuICAgIHZhciBBUkdTID0gYXJnKClcbiAgICB2YXIgQVJHID0gZGVmKClcbiAgICB2YXIgQkFUQ0hfSUQgPSBkZWYoKVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGxvYWQgYSBkeW5hbWljIHZhcmlhYmxlXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHZhciBkeW5hbWljVmFycyA9IHt9XG4gICAgZnVuY3Rpb24gZHluICh4KSB7XG4gICAgICB2YXIgaWQgPSB4LmlkXG4gICAgICB2YXIgcmVzdWx0ID0gZHluYW1pY1ZhcnNbaWRdXG4gICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH1cbiAgICAgIGlmICh4LmZ1bmMpIHtcbiAgICAgICAgcmVzdWx0ID0gYmF0Y2guZGVmKFxuICAgICAgICAgIGxpbmsoeC5kYXRhKSwgJygnLCBBUkcsICcsJywgQkFUQ0hfSUQsICcsJywgRlJBTUVfU1RBVEUsICcpJylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlc3VsdCA9IGJhdGNoLmRlZihBUkcsICcuJywgeC5kYXRhKVxuICAgICAgfVxuICAgICAgZHluYW1pY1ZhcnNbaWRdID0gcmVzdWx0XG4gICAgICByZXR1cm4gcmVzdWx0XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHJldHJpZXZlcyB0aGUgZmlyc3QgbmFtZS1tYXRjaGluZyByZWNvcmQgZnJvbSBhbiBBY3RpdmVJbmZvIGxpc3RcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgZnVuY3Rpb24gZmluZEluZm8gKGxpc3QsIG5hbWUpIHtcbiAgICAgIHJldHVybiBsaXN0LmZpbmQoZnVuY3Rpb24gKGl0ZW0pIHtcbiAgICAgICAgcmV0dXJuIGl0ZW0ubmFtZSA9PT0gbmFtZVxuICAgICAgfSlcbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gYmluZCBzaGFkZXJcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgYmF0Y2goR0wsICcudXNlUHJvZ3JhbSgnLCBQUk9HUkFNLCAnKTsnKVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHNldCBzdGF0aWMgdW5pZm9ybXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgcHJvZ3JhbS51bmlmb3Jtcy5mb3JFYWNoKGZ1bmN0aW9uICh1bmlmb3JtKSB7XG4gICAgICBpZiAodW5pZm9ybS5uYW1lIGluIHVuaWZvcm1zKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgdmFyIExPQ0FUSU9OID0gbGluayh1bmlmb3JtLmxvY2F0aW9uKVxuICAgICAgdmFyIFNUQUNLID0gbGluayh1bmlmb3JtU3RhdGUuZGVmKHVuaWZvcm0ubmFtZSkpXG4gICAgICB2YXIgVE9QID0gU1RBQ0sgKyAnWycgKyBTVEFDSyArICcubGVuZ3RoLTFdJ1xuICAgICAgdmFyIHR5cGUgPSB1bmlmb3JtLmluZm8udHlwZVxuICAgICAgaWYgKHR5cGUgPT09IEdMX1NBTVBMRVJfMkQgfHwgdHlwZSA9PT0gR0xfU0FNUExFUl9DVUJFKSB7XG4gICAgICAgIHZhciBURVhfVkFMVUUgPSBkZWYoVE9QICsgJy5fdGV4dHVyZScpXG4gICAgICAgIGJhdGNoKHNldFVuaWZvcm1TdHJpbmcoR0wsIEdMX0lOVCwgTE9DQVRJT04sIFRFWF9WQUxVRSArICcuYmluZCgpJykpXG4gICAgICAgIGV4aXQoVEVYX1ZBTFVFLCAnLnVuYmluZCgpOycpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBiYXRjaChzZXRVbmlmb3JtU3RyaW5nKEdMLCB0eXBlLCBMT0NBVElPTiwgVE9QKSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHNldCBzdGF0aWMgYXR0cmlidXRlc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBwcm9ncmFtLmF0dHJpYnV0ZXMuZm9yRWFjaChmdW5jdGlvbiAoYXR0cmlidXRlKSB7XG4gICAgICBpZiAoYXR0cmlidXRlcy5uYW1lIGluIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICB2YXIgU1RBQ0sgPSBsaW5rKGF0dHJpYnV0ZVN0YXRlLmRlZihhdHRyaWJ1dGUubmFtZSkpXG4gICAgICBiYXRjaChCSU5EX0FUVFJJQlVURSwgJygnLFxuICAgICAgICBhdHRyaWJ1dGUubG9jYXRpb24sICcsJyxcbiAgICAgICAgbGluayhhdHRyaWJ1dGVTdGF0ZS5iaW5kaW5nc1thdHRyaWJ1dGUubG9jYXRpb25dKSwgJywnLFxuICAgICAgICBTVEFDSywgJy5yZWNvcmRzWycsIFNUQUNLLCAnLnRvcF0nLCAnLCcsXG4gICAgICAgIHR5cGVMZW5ndGgoYXR0cmlidXRlLmluZm8udHlwZSksICcpOycpXG4gICAgfSlcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBzZXQgc3RhdGljIGVsZW1lbnQgYnVmZmVyXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIGlmICghaGFzRHluYW1pY0VsZW1lbnRzKSB7XG4gICAgICBiYXRjaChcbiAgICAgICAgJ2lmKCcsIENVUl9FTEVNRU5UUywgJyl7JyxcbiAgICAgICAgR0wsICcuYmluZEJ1ZmZlcignLCBHTF9FTEVNRU5UX0FSUkFZX0JVRkZFUiwgJywnLCBDVVJfRUxFTUVOVFMsICcuYnVmZmVyLmJ1ZmZlcik7JyxcbiAgICAgICAgJ31lbHNleycsXG4gICAgICAgIEdMLCAnLmJpbmRCdWZmZXIoJywgR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIsICcsbnVsbCk7JyxcbiAgICAgICAgJ30nKVxuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBsb29wIG92ZXIgYWxsIGFyZ3VtZW50c1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBiYXRjaChcbiAgICAgICdmb3IoJywgQkFUQ0hfSUQsICc9MDsnLCBCQVRDSF9JRCwgJzwnLCBOVU1fQVJHUywgJzsrKycsIEJBVENIX0lELCAnKXsnLFxuICAgICAgQVJHLCAnPScsIEFSR1MsICdbJywgQkFUQ0hfSUQsICddOycpXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gc2V0IGR5bmFtaWMgZmxhZ3NcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgT2JqZWN0LmtleXMob3B0aW9ucykuc29ydChvcHRpb25Qcmlvcml0eSkuZm9yRWFjaChmdW5jdGlvbiAob3B0aW9uKSB7XG4gICAgICB2YXIgVkFMVUUgPSBkeW4ob3B0aW9uc1tvcHRpb25dKVxuXG4gICAgICBmdW5jdGlvbiBzZXRDYXAgKGZsYWcpIHtcbiAgICAgICAgYmF0Y2goXG4gICAgICAgICAgJ2lmKCcsIFZBTFVFLCAnKXsnLFxuICAgICAgICAgIEdMLCAnLmVuYWJsZSgnLCBmbGFnLCAnKTt9ZWxzZXsnLFxuICAgICAgICAgIEdMLCAnLmRpc2FibGUoJywgZmxhZywgJyk7fScpXG4gICAgICB9XG5cbiAgICAgIHN3aXRjaCAob3B0aW9uKSB7XG4gICAgICAgIGNhc2UgJ2ZyYW1lYnVmZmVyJzpcbiAgICAgICAgICB2YXIgVklFV1BPUlRfU1RBVEUgPSBsaW5rQ29udGV4dCgndmlld3BvcnQnKVxuICAgICAgICAgIHZhciBTQ0lTU09SX1NUQVRFID0gbGlua0NvbnRleHQoJ3NjaXNzb3IuYm94JylcbiAgICAgICAgICBiYXRjaChcbiAgICAgICAgICAgICdpZignLCBGUkFNRUJVRkZFUl9TVEFURSwgJy5wdXNoKCcsXG4gICAgICAgICAgICBWQUxVRSwgJyYmJywgVkFMVUUsICcuX2ZyYW1lYnVmZmVyKSl7JyxcbiAgICAgICAgICAgIEZSQU1FQlVGRkVSX1NUQVRFLCAnLnBvbGwoKTsnLFxuICAgICAgICAgICAgVklFV1BPUlRfU1RBVEUsICcuc2V0RGlydHkoKTsnLFxuICAgICAgICAgICAgU0NJU1NPUl9TVEFURSwgJy5zZXREaXJ0eSgpOycsXG4gICAgICAgICAgICAnfScpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICAvLyBDYXBzXG4gICAgICAgIGNhc2UgJ2N1bGwuZW5hYmxlJzpcbiAgICAgICAgICBzZXRDYXAoR0xfQ1VMTF9GQUNFKVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgJ2JsZW5kLmVuYWJsZSc6XG4gICAgICAgICAgc2V0Q2FwKEdMX0JMRU5EKVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgJ2RpdGhlcic6XG4gICAgICAgICAgc2V0Q2FwKEdMX0RJVEhFUilcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlICdzdGVuY2lsLmVuYWJsZSc6XG4gICAgICAgICAgc2V0Q2FwKEdMX1NURU5DSUxfVEVTVClcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlICdkZXB0aC5lbmFibGUnOlxuICAgICAgICAgIHNldENhcChHTF9ERVBUSF9URVNUKVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgJ3NjaXNzb3IuZW5hYmxlJzpcbiAgICAgICAgICBzZXRDYXAoR0xfU0NJU1NPUl9URVNUKVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgJ3BvbHlnb25PZmZzZXQuZW5hYmxlJzpcbiAgICAgICAgICBzZXRDYXAoR0xfUE9MWUdPTl9PRkZTRVRfRklMTClcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlICdzYW1wbGUuYWxwaGEnOlxuICAgICAgICAgIHNldENhcChHTF9TQU1QTEVfQUxQSEFfVE9fQ09WRVJBR0UpXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSAnc2FtcGxlLmVuYWJsZSc6XG4gICAgICAgICAgc2V0Q2FwKEdMX1NBTVBMRV9DT1ZFUkFHRSlcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2RlcHRoLm1hc2snOlxuICAgICAgICAgIGJhdGNoKEdMLCAnLmRlcHRoTWFzaygnLCBWQUxVRSwgJyk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2RlcHRoLmZ1bmMnOlxuICAgICAgICAgIHZhciBERVBUSF9GVU5DUyA9IGxpbmsoY29tcGFyZUZ1bmNzKVxuICAgICAgICAgIGJhdGNoKEdMLCAnLmRlcHRoRnVuYygnLCBERVBUSF9GVU5DUywgJ1snLCBWQUxVRSwgJ10pOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdkZXB0aC5yYW5nZSc6XG4gICAgICAgICAgYmF0Y2goR0wsICcuZGVwdGhSYW5nZSgnLCBWQUxVRSwgJ1swXSwnLCBWQUxVRSwgJ1sxXSk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2JsZW5kLmNvbG9yJzpcbiAgICAgICAgICBiYXRjaChHTCwgJy5ibGVuZENvbG9yKCcsXG4gICAgICAgICAgICBWQUxVRSwgJ1swXSwnLFxuICAgICAgICAgICAgVkFMVUUsICdbMV0sJyxcbiAgICAgICAgICAgIFZBTFVFLCAnWzJdLCcsXG4gICAgICAgICAgICBWQUxVRSwgJ1szXSk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2JsZW5kLmVxdWF0aW9uJzpcbiAgICAgICAgICB2YXIgQkxFTkRfRVFVQVRJT05TID0gbGluayhibGVuZEVxdWF0aW9ucylcbiAgICAgICAgICBiYXRjaChcbiAgICAgICAgICAgICdpZih0eXBlb2YgJywgVkFMVUUsICc9PT1cInN0cmluZ1wiKXsnLFxuICAgICAgICAgICAgR0wsICcuYmxlbmRFcXVhdGlvbignLCBCTEVORF9FUVVBVElPTlMsICdbJywgVkFMVUUsICddKTsnLFxuICAgICAgICAgICAgJ31lbHNleycsXG4gICAgICAgICAgICBHTCwgJy5ibGVuZEVxdWF0aW9uU2VwYXJhdGUoJyxcbiAgICAgICAgICAgIEJMRU5EX0VRVUFUSU9OUywgJ1snLCBWQUxVRSwgJy5yZ2JdLCcsXG4gICAgICAgICAgICBCTEVORF9FUVVBVElPTlMsICdbJywgVkFMVUUsICcuYWxwaGFdKTsnLFxuICAgICAgICAgICAgJ30nKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnYmxlbmQuZnVuYyc6XG4gICAgICAgICAgdmFyIEJMRU5EX0ZVTkNTID0gbGluayhibGVuZEZ1bmNzKVxuICAgICAgICAgIGJhdGNoKFxuICAgICAgICAgICAgR0wsICcuYmxlbmRGdW5jU2VwYXJhdGUoJyxcbiAgICAgICAgICAgIEJMRU5EX0ZVTkNTLFxuICAgICAgICAgICAgJ1tcInNyY1JHQlwiIGluICcsIFZBTFVFLCAnPycsIFZBTFVFLCAnLnNyY1JHQjonLCBWQUxVRSwgJy5zcmNdLCcsXG4gICAgICAgICAgICBCTEVORF9GVU5DUyxcbiAgICAgICAgICAgICdbXCJkc3RSR0JcIiBpbiAnLCBWQUxVRSwgJz8nLCBWQUxVRSwgJy5kc3RSR0I6JywgVkFMVUUsICcuZHN0XSwnLFxuICAgICAgICAgICAgQkxFTkRfRlVOQ1MsXG4gICAgICAgICAgICAnW1wic3JjQWxwaGFcIiBpbiAnLCBWQUxVRSwgJz8nLCBWQUxVRSwgJy5zcmNBbHBoYTonLCBWQUxVRSwgJy5zcmNdLCcsXG4gICAgICAgICAgICBCTEVORF9GVU5DUyxcbiAgICAgICAgICAgICdbXCJkc3RBbHBoYVwiIGluICcsIFZBTFVFLCAnPycsIFZBTFVFLCAnLmRzdEFscGhhOicsIFZBTFVFLCAnLmRzdF0pOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdzdGVuY2lsLm1hc2snOlxuICAgICAgICAgIGJhdGNoKEdMLCAnLnN0ZW5jaWxNYXNrKCcsIFZBTFVFLCAnKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnc3RlbmNpbC5mdW5jJzpcbiAgICAgICAgICB2YXIgU1RFTkNJTF9GVU5DUyA9IGxpbmsoY29tcGFyZUZ1bmNzKVxuICAgICAgICAgIGJhdGNoKEdMLCAnLnN0ZW5jaWxGdW5jKCcsXG4gICAgICAgICAgICBTVEVOQ0lMX0ZVTkNTLCAnWycsIFZBTFVFLCAnLmNtcHx8XCJhbHdheXNcIl0sJyxcbiAgICAgICAgICAgIFZBTFVFLCAnLnJlZnwwLCcsXG4gICAgICAgICAgICAnXCJtYXNrXCIgaW4gJywgVkFMVUUsICc/JywgVkFMVUUsICcubWFzazotMSk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3N0ZW5jaWwub3BGcm9udCc6XG4gICAgICAgIGNhc2UgJ3N0ZW5jaWwub3BCYWNrJzpcbiAgICAgICAgICB2YXIgU1RFTkNJTF9PUFMgPSBsaW5rKHN0ZW5jaWxPcHMpXG4gICAgICAgICAgYmF0Y2goR0wsICcuc3RlbmNpbE9wU2VwYXJhdGUoJyxcbiAgICAgICAgICAgIG9wdGlvbiA9PT0gJ3N0ZW5jaWwub3BGcm9udCcgPyBHTF9GUk9OVCA6IEdMX0JBQ0ssICcsJyxcbiAgICAgICAgICAgIFNURU5DSUxfT1BTLCAnWycsIFZBTFVFLCAnLmZhaWx8fFwia2VlcFwiXSwnLFxuICAgICAgICAgICAgU1RFTkNJTF9PUFMsICdbJywgVkFMVUUsICcuemZhaWx8fFwia2VlcFwiXSwnLFxuICAgICAgICAgICAgU1RFTkNJTF9PUFMsICdbJywgVkFMVUUsICcucGFzc3x8XCJrZWVwXCJdKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAncG9seWdvbk9mZnNldC5vZmZzZXQnOlxuICAgICAgICAgIGJhdGNoKEdMLCAnLnBvbHlnb25PZmZzZXQoJyxcbiAgICAgICAgICAgIFZBTFVFLCAnLmZhY3Rvcnx8MCwnLFxuICAgICAgICAgICAgVkFMVUUsICcudW5pdHN8fDApOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdjdWxsLmZhY2UnOlxuICAgICAgICAgIGJhdGNoKEdMLCAnLmN1bGxGYWNlKCcsXG4gICAgICAgICAgICBWQUxVRSwgJz09PVwiZnJvbnRcIj8nLCBHTF9GUk9OVCwgJzonLCBHTF9CQUNLLCAnKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnbGluZVdpZHRoJzpcbiAgICAgICAgICBiYXRjaChHTCwgJy5saW5lV2lkdGgoJywgVkFMVUUsICcpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdmcm9udEZhY2UnOlxuICAgICAgICAgIGJhdGNoKEdMLCAnLmZyb250RmFjZSgnLFxuICAgICAgICAgICAgVkFMVUUsICc9PT1cImN3XCI/JywgR0xfQ1csICc6JywgR0xfQ0NXLCAnKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnY29sb3JNYXNrJzpcbiAgICAgICAgICBiYXRjaChHTCwgJy5jb2xvck1hc2soJyxcbiAgICAgICAgICAgIFZBTFVFLCAnWzBdLCcsXG4gICAgICAgICAgICBWQUxVRSwgJ1sxXSwnLFxuICAgICAgICAgICAgVkFMVUUsICdbMl0sJyxcbiAgICAgICAgICAgIFZBTFVFLCAnWzNdKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnc2FtcGxlLmNvdmVyYWdlJzpcbiAgICAgICAgICBiYXRjaChHTCwgJy5zYW1wbGVDb3ZlcmFnZSgnLFxuICAgICAgICAgICAgVkFMVUUsICcudmFsdWUsJyxcbiAgICAgICAgICAgIFZBTFVFLCAnLmludmVydCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3NjaXNzb3IuYm94JzpcbiAgICAgICAgY2FzZSAndmlld3BvcnQnOlxuICAgICAgICAgIHZhciBCT1hfU1RBVEUgPSBsaW5rQ29udGV4dChvcHRpb24pXG4gICAgICAgICAgYmF0Y2goQk9YX1NUQVRFLCAnLnB1c2goJyxcbiAgICAgICAgICAgIFZBTFVFLCAnLnh8fDAsJyxcbiAgICAgICAgICAgIFZBTFVFLCAnLnl8fDAsJyxcbiAgICAgICAgICAgIFZBTFVFLCAnLnd8fC0xLCcsXG4gICAgICAgICAgICBWQUxVRSwgJy5ofHwtMSk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3ByaW1pdGl2ZXMnOlxuICAgICAgICBjYXNlICdvZmZzZXQnOlxuICAgICAgICBjYXNlICdjb3VudCc6XG4gICAgICAgIGNhc2UgJ2VsZW1lbnRzJzpcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgXG4gICAgICB9XG4gICAgfSlcblxuICAgIC8vIHVwZGF0ZSB2aWV3cG9ydC9zY2lzc29yIGJveCBzdGF0ZSBhbmQgcmVzdG9yZSBmcmFtZWJ1ZmZlclxuICAgIGlmICgndmlld3BvcnQnIGluIG9wdGlvbnMgfHwgJ2ZyYW1lYnVmZmVyJyBpbiBvcHRpb25zKSB7XG4gICAgICBiYXRjaChsaW5rQ29udGV4dCgndmlld3BvcnQnKSwgJy5wb2xsKCk7JylcbiAgICB9XG4gICAgaWYgKCdzY2lzc29yLmJveCcgaW4gb3B0aW9ucyB8fCAnZnJhbWVidWZmZXInIGluIG9wdGlvbnMpIHtcbiAgICAgIGJhdGNoKGxpbmtDb250ZXh0KCdzY2lzc29yLmJveCcpLCAnLnBvbGwoKTsnKVxuICAgIH1cbiAgICBpZiAoJ2ZyYW1lYnVmZmVyJyBpbiBvcHRpb25zKSB7XG4gICAgICBiYXRjaChGUkFNRUJVRkZFUl9TVEFURSwgJy5wb3AoKTsnKVxuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBzZXQgZHluYW1pYyB1bmlmb3Jtc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICB2YXIgcHJvZ3JhbVVuaWZvcm1zID0gcHJvZ3JhbS51bmlmb3Jtc1xuICAgIHZhciBEWU5BTUlDX1RFWFRVUkVTID0gW11cbiAgICBPYmplY3Qua2V5cyh1bmlmb3JtcykuZm9yRWFjaChmdW5jdGlvbiAodW5pZm9ybSkge1xuICAgICAgdmFyIGRhdGEgPSBmaW5kSW5mbyhwcm9ncmFtVW5pZm9ybXMsIHVuaWZvcm0pXG4gICAgICBpZiAoIWRhdGEpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICB2YXIgVFlQRSA9IGRhdGEuaW5mby50eXBlXG4gICAgICB2YXIgTE9DQVRJT04gPSBsaW5rKGRhdGEubG9jYXRpb24pXG4gICAgICB2YXIgVkFMVUUgPSBkeW4odW5pZm9ybXNbdW5pZm9ybV0pXG4gICAgICBpZiAoZGF0YS5pbmZvLnR5cGUgPT09IEdMX1NBTVBMRVJfMkQgfHxcbiAgICAgICAgICBkYXRhLmluZm8udHlwZSA9PT0gR0xfU0FNUExFUl9DVUJFKSB7XG4gICAgICAgIHZhciBURVhfVkFMVUUgPSBkZWYoVkFMVUUgKyAnLl90ZXh0dXJlJylcbiAgICAgICAgRFlOQU1JQ19URVhUVVJFUy5wdXNoKFRFWF9WQUxVRSlcbiAgICAgICAgYmF0Y2goc2V0VW5pZm9ybVN0cmluZyhHTCwgR0xfSU5ULCBMT0NBVElPTiwgVEVYX1ZBTFVFICsgJy5iaW5kKCknKSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGJhdGNoKHNldFVuaWZvcm1TdHJpbmcoR0wsIFRZUEUsIExPQ0FUSU9OLCBWQUxVRSkpXG4gICAgICB9XG4gICAgfSlcbiAgICBEWU5BTUlDX1RFWFRVUkVTLmZvckVhY2goZnVuY3Rpb24gKFZBTFVFKSB7XG4gICAgICBiYXRjaChWQUxVRSwgJy51bmJpbmQoKTsnKVxuICAgIH0pXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gc2V0IGR5bmFtaWMgYXR0cmlidXRlc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICB2YXIgcHJvZ3JhbUF0dHJpYnV0ZXMgPSBwcm9ncmFtLmF0dHJpYnV0ZXNcbiAgICBPYmplY3Qua2V5cyhhdHRyaWJ1dGVzKS5mb3JFYWNoKGZ1bmN0aW9uIChhdHRyaWJ1dGUpIHtcbiAgICAgIHZhciBkYXRhID0gZmluZEluZm8ocHJvZ3JhbUF0dHJpYnV0ZXMsIGF0dHJpYnV0ZSlcbiAgICAgIGlmICghZGF0YSkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIGJhdGNoKEJJTkRfQVRUUklCVVRFLCAnKCcsXG4gICAgICAgIGRhdGEubG9jYXRpb24sICcsJyxcbiAgICAgICAgbGluayhhdHRyaWJ1dGUuYmluZGluZ3NbZGF0YS5sb2NhdGlvbl0pLCAnLCcsXG4gICAgICAgIGR5bihhdHRyaWJ1dGVzW2F0dHJpYnV0ZV0pLCAnLCcsXG4gICAgICAgIHR5cGVMZW5ndGgoZGF0YS5pbmZvLnR5cGUpLCAnKTsnKVxuICAgIH0pXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gc2V0IGR5bmFtaWMgYXR0cmlidXRlc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAgIGlmIChvcHRpb25zLmNvdW50KSB7XG4gICAgICBiYXRjaChDVVJfQ09VTlQsICc9JywgZHluKG9wdGlvbnMuY291bnQpLCAnOycpXG4gICAgfSBlbHNlIGlmICghdXNlRWxlbWVudE9wdGlvbignY291bnQnKSkge1xuICAgICAgYmF0Y2goJ2lmKCcsIENVUl9DT1VOVCwgJyl7JylcbiAgICB9XG4gICAgaWYgKG9wdGlvbnMub2Zmc2V0KSB7XG4gICAgICBiYXRjaChDVVJfT0ZGU0VULCAnPScsIGR5bihvcHRpb25zLm9mZnNldCksICc7JylcbiAgICB9XG4gICAgaWYgKG9wdGlvbnMucHJpbWl0aXZlKSB7XG4gICAgICB2YXIgUFJJTV9UWVBFUyA9IGxpbmsocHJpbVR5cGVzKVxuICAgICAgYmF0Y2goQ1VSX1BSSU1JVElWRSwgJz0nLCBQUklNX1RZUEVTLCAnWycsIGR5bihvcHRpb25zLnByaW1pdGl2ZSksICddOycpXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdXNlRWxlbWVudE9wdGlvbiAoeCkge1xuICAgICAgcmV0dXJuIGhhc0R5bmFtaWNFbGVtZW50cyAmJiAhKHggaW4gb3B0aW9ucyB8fCB4IGluIHN0YXRpY09wdGlvbnMpXG4gICAgfVxuICAgIGlmIChoYXNEeW5hbWljRWxlbWVudHMpIHtcbiAgICAgIHZhciBkeW5FbGVtZW50cyA9IGR5bihvcHRpb25zLmVsZW1lbnRzKVxuICAgICAgYmF0Y2goQ1VSX0VMRU1FTlRTLCAnPScsXG4gICAgICAgIGR5bkVsZW1lbnRzLCAnPycsIGR5bkVsZW1lbnRzLCAnLl9lbGVtZW50czpudWxsOycpXG4gICAgfVxuICAgIGlmICh1c2VFbGVtZW50T3B0aW9uKCdvZmZzZXQnKSkge1xuICAgICAgYmF0Y2goQ1VSX09GRlNFVCwgJz0wOycpXG4gICAgfVxuXG4gICAgLy8gRW1pdCBkcmF3IGNvbW1hbmRcbiAgICBiYXRjaCgnaWYoJywgQ1VSX0VMRU1FTlRTLCAnKXsnKVxuICAgIGlmICh1c2VFbGVtZW50T3B0aW9uKCdjb3VudCcpKSB7XG4gICAgICBiYXRjaChDVVJfQ09VTlQsICc9JywgQ1VSX0VMRU1FTlRTLCAnLnZlcnRDb3VudDsnLFxuICAgICAgICAnaWYoJywgQ1VSX0NPVU5ULCAnPjApeycpXG4gICAgfVxuICAgIGlmICh1c2VFbGVtZW50T3B0aW9uKCdwcmltaXRpdmUnKSkge1xuICAgICAgYmF0Y2goQ1VSX1BSSU1JVElWRSwgJz0nLCBDVVJfRUxFTUVOVFMsICcucHJpbVR5cGU7JylcbiAgICB9XG4gICAgaWYgKGhhc0R5bmFtaWNFbGVtZW50cykge1xuICAgICAgYmF0Y2goXG4gICAgICAgIEdMLFxuICAgICAgICAnLmJpbmRCdWZmZXIoJyxcbiAgICAgICAgR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIsICcsJyxcbiAgICAgICAgQ1VSX0VMRU1FTlRTLCAnLmJ1ZmZlci5idWZmZXIpOycpXG4gICAgfVxuICAgIGlmIChpbnN0YW5jaW5nKSB7XG4gICAgICBpZiAob3B0aW9ucy5pbnN0YW5jZXMpIHtcbiAgICAgICAgYmF0Y2goQ1VSX0lOU1RBTkNFUywgJz0nLCBkeW4ob3B0aW9ucy5pbnN0YW5jZXMpLCAnOycpXG4gICAgICB9XG4gICAgICBiYXRjaChcbiAgICAgICAgJ2lmKCcsIENVUl9JTlNUQU5DRVMsICc+MCl7JyxcbiAgICAgICAgSU5TVEFOQ0VfRVhULCAnLmRyYXdFbGVtZW50c0luc3RhbmNlZEFOR0xFKCcsXG4gICAgICAgIENVUl9QUklNSVRJVkUsICcsJyxcbiAgICAgICAgQ1VSX0NPVU5ULCAnLCcsXG4gICAgICAgIENVUl9FTEVNRU5UUywgJy50eXBlLCcsXG4gICAgICAgIENVUl9PRkZTRVQsICcsJyxcbiAgICAgICAgQ1VSX0lOU1RBTkNFUywgJyk7fWVsc2V7JylcbiAgICB9XG4gICAgYmF0Y2goXG4gICAgICBHTCwgJy5kcmF3RWxlbWVudHMoJyxcbiAgICAgIENVUl9QUklNSVRJVkUsICcsJyxcbiAgICAgIENVUl9DT1VOVCwgJywnLFxuICAgICAgQ1VSX0VMRU1FTlRTLCAnLnR5cGUsJyxcbiAgICAgIENVUl9PRkZTRVQsICcpOycpXG4gICAgaWYgKGluc3RhbmNpbmcpIHtcbiAgICAgIGJhdGNoKCd9JylcbiAgICB9XG4gICAgaWYgKHVzZUVsZW1lbnRPcHRpb24oJ2NvdW50JykpIHtcbiAgICAgIGJhdGNoKCd9JylcbiAgICB9XG4gICAgYmF0Y2goJ31lbHNleycpXG4gICAgaWYgKCF1c2VFbGVtZW50T3B0aW9uKCdjb3VudCcpKSB7XG4gICAgICBpZiAodXNlRWxlbWVudE9wdGlvbigncHJpbWl0aXZlJykpIHtcbiAgICAgICAgYmF0Y2goQ1VSX1BSSU1JVElWRSwgJz0nLCBHTF9UUklBTkdMRVMsICc7JylcbiAgICAgIH1cbiAgICAgIGlmIChpbnN0YW5jaW5nKSB7XG4gICAgICAgIGJhdGNoKFxuICAgICAgICAgICdpZignLCBDVVJfSU5TVEFOQ0VTLCAnPjApeycsXG4gICAgICAgICAgSU5TVEFOQ0VfRVhULCAnLmRyYXdBcnJheXNJbnN0YW5jZWRBTkdMRSgnLFxuICAgICAgICAgIENVUl9QUklNSVRJVkUsICcsJyxcbiAgICAgICAgICBDVVJfT0ZGU0VULCAnLCcsXG4gICAgICAgICAgQ1VSX0NPVU5ULCAnLCcsXG4gICAgICAgICAgQ1VSX0lOU1RBTkNFUywgJyk7fWVsc2V7JylcbiAgICAgIH1cbiAgICAgIGJhdGNoKFxuICAgICAgICBHTCwgJy5kcmF3QXJyYXlzKCcsXG4gICAgICAgIENVUl9QUklNSVRJVkUsICcsJyxcbiAgICAgICAgQ1VSX09GRlNFVCwgJywnLFxuICAgICAgICBDVVJfQ09VTlQsICcpO30nKVxuICAgICAgaWYgKGluc3RhbmNpbmcpIHtcbiAgICAgICAgYmF0Y2goJ30nKVxuICAgICAgfVxuICAgIH1cbiAgICBiYXRjaCgnfX0nLCBleGl0KVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGNvbXBpbGUgYW5kIHJldHVyblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICByZXR1cm4gZW52LmNvbXBpbGUoKS5iYXRjaFxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBNQUlOIERSQVcgQ09NTUFORFxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIGNvbXBpbGVDb21tYW5kIChcbiAgICBzdGF0aWNPcHRpb25zLCBzdGF0aWNVbmlmb3Jtcywgc3RhdGljQXR0cmlidXRlcyxcbiAgICBkeW5hbWljT3B0aW9ucywgZHluYW1pY1VuaWZvcm1zLCBkeW5hbWljQXR0cmlidXRlcyxcbiAgICBoYXNEeW5hbWljKSB7XG4gICAgLy8gQ3JlYXRlIGNvZGUgZ2VuZXJhdGlvbiBlbnZpcm9ubWVudFxuICAgIHZhciBlbnYgPSBjcmVhdGVFbnZpcm9ubWVudCgpXG4gICAgdmFyIGxpbmsgPSBlbnYubGlua1xuICAgIHZhciBibG9jayA9IGVudi5ibG9ja1xuICAgIHZhciBwcm9jID0gZW52LnByb2NcblxuICAgIHZhciBjYWxsSWQgPSBkcmF3Q2FsbENvdW50ZXIrK1xuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIENvbW1vbiBzdGF0ZSB2YXJpYWJsZXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgdmFyIEdMX1BPTEwgPSBsaW5rKHJlZ2xQb2xsKVxuICAgIHZhciBTVFJJTkdfU1RPUkUgPSBsaW5rKHN0cmluZ1N0b3JlKVxuICAgIHZhciBGUkFHX1NIQURFUl9TVEFURSA9IGxpbmsoc2hhZGVyU3RhdGUuZnJhZ1NoYWRlcnMpXG4gICAgdmFyIFZFUlRfU0hBREVSX1NUQVRFID0gbGluayhzaGFkZXJTdGF0ZS52ZXJ0U2hhZGVycylcbiAgICB2YXIgUFJPR1JBTV9TVEFURSA9IGxpbmsoc2hhZGVyU3RhdGUucHJvZ3JhbXMpXG4gICAgdmFyIEZSQU1FQlVGRkVSX1NUQVRFID0gbGluayhmcmFtZWJ1ZmZlclN0YXRlKVxuICAgIHZhciBEUkFXX1NUQVRFID0ge1xuICAgICAgY291bnQ6IGxpbmsoZHJhd1N0YXRlLmNvdW50KSxcbiAgICAgIG9mZnNldDogbGluayhkcmF3U3RhdGUub2Zmc2V0KSxcbiAgICAgIGluc3RhbmNlczogbGluayhkcmF3U3RhdGUuaW5zdGFuY2VzKSxcbiAgICAgIHByaW1pdGl2ZTogbGluayhkcmF3U3RhdGUucHJpbWl0aXZlKVxuICAgIH1cbiAgICB2YXIgRUxFTUVOVF9TVEFURSA9IGxpbmsoZWxlbWVudFN0YXRlLmVsZW1lbnRzKVxuICAgIHZhciBQUklNX1RZUEVTID0gbGluayhwcmltVHlwZXMpXG4gICAgdmFyIENPTVBBUkVfRlVOQ1MgPSBsaW5rKGNvbXBhcmVGdW5jcylcbiAgICB2YXIgU1RFTkNJTF9PUFMgPSBsaW5rKHN0ZW5jaWxPcHMpXG5cbiAgICB2YXIgQ09OVEVYVF9TVEFURSA9IHt9XG4gICAgZnVuY3Rpb24gbGlua0NvbnRleHQgKHgpIHtcbiAgICAgIHZhciByZXN1bHQgPSBDT05URVhUX1NUQVRFW3hdXG4gICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH1cbiAgICAgIHJlc3VsdCA9IENPTlRFWFRfU1RBVEVbeF0gPSBsaW5rKGNvbnRleHRTdGF0ZVt4XSlcbiAgICAgIHJldHVybiByZXN1bHRcbiAgICB9XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gU1RBVElDIFNUQVRFXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIENvZGUgYmxvY2tzIGZvciB0aGUgc3RhdGljIHNlY3Rpb25zXG4gICAgdmFyIGVudHJ5ID0gYmxvY2soKVxuICAgIHZhciBleGl0ID0gYmxvY2soKVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHVwZGF0ZSBkZWZhdWx0IGNvbnRleHQgc3RhdGUgdmFyaWFibGVzXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIGZ1bmN0aW9uIGhhbmRsZVN0YXRpY09wdGlvbiAocGFyYW0sIHZhbHVlKSB7XG4gICAgICB2YXIgU1RBVEVfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgIGVudHJ5KFNUQVRFX1NUQUNLLCAnLnB1c2goJywgdmFsdWUsICcpOycpXG4gICAgICBleGl0KFNUQVRFX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgfVxuXG4gICAgdmFyIGhhc1NoYWRlciA9IGZhbHNlXG4gICAgT2JqZWN0LmtleXMoc3RhdGljT3B0aW9ucykuc29ydChvcHRpb25Qcmlvcml0eSkuZm9yRWFjaChmdW5jdGlvbiAocGFyYW0pIHtcbiAgICAgIHZhciB2YWx1ZSA9IHN0YXRpY09wdGlvbnNbcGFyYW1dXG4gICAgICBzd2l0Y2ggKHBhcmFtKSB7XG4gICAgICAgIGNhc2UgJ2ZyYWcnOlxuICAgICAgICAgIGhhc1NoYWRlciA9IHRydWVcbiAgICAgICAgICBlbnRyeShGUkFHX1NIQURFUl9TVEFURSwgJy5wdXNoKCcsIGxpbmsoc3RyaW5nU3RvcmUuaWQodmFsdWUpKSwgJyk7JylcbiAgICAgICAgICBleGl0KEZSQUdfU0hBREVSX1NUQVRFLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICd2ZXJ0JzpcbiAgICAgICAgICBoYXNTaGFkZXIgPSB0cnVlXG4gICAgICAgICAgZW50cnkoVkVSVF9TSEFERVJfU1RBVEUsICcucHVzaCgnLCBsaW5rKHN0cmluZ1N0b3JlLmlkKHZhbHVlKSksICcpOycpXG4gICAgICAgICAgZXhpdChWRVJUX1NIQURFUl9TVEFURSwgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnZnJhbWVidWZmZXInOlxuICAgICAgICAgIHZhciBmYm8gPSBmcmFtZWJ1ZmZlclN0YXRlLmdldEZyYW1lYnVmZmVyKHZhbHVlKVxuICAgICAgICAgIFxuICAgICAgICAgIHZhciBWSUVXUE9SVF9TVEFURSA9IGxpbmtDb250ZXh0KCd2aWV3cG9ydCcpXG4gICAgICAgICAgdmFyIFNDSVNTT1JfU1RBVEUgPSBsaW5rQ29udGV4dCgnc2Npc3Nvci5ib3gnKVxuICAgICAgICAgIGVudHJ5KCdpZignLCBGUkFNRUJVRkZFUl9TVEFURSwgJy5wdXNoKCcsIGxpbmsoXG4gICAgICAgICAgICB2YWx1ZSAmJiB2YWx1ZS5fZnJhbWVidWZmZXIpLCAnKSl7JyxcbiAgICAgICAgICAgIFZJRVdQT1JUX1NUQVRFLCAnLnNldERpcnR5KCk7JyxcbiAgICAgICAgICAgIFNDSVNTT1JfU1RBVEUsICcuc2V0RGlydHkoKTsnLFxuICAgICAgICAgICAgJ30nKVxuICAgICAgICAgIGV4aXQoJ2lmKCcsIEZSQU1FQlVGRkVSX1NUQVRFLCAnLnBvcCgpKXsnLFxuICAgICAgICAgICAgVklFV1BPUlRfU1RBVEUsICcuc2V0RGlydHkoKTsnLFxuICAgICAgICAgICAgU0NJU1NPUl9TVEFURSwgJy5zZXREaXJ0eSgpOycsXG4gICAgICAgICAgICAnfScpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICAvLyBVcGRhdGUgZHJhdyBzdGF0ZVxuICAgICAgICBjYXNlICdjb3VudCc6XG4gICAgICAgIGNhc2UgJ29mZnNldCc6XG4gICAgICAgIGNhc2UgJ2luc3RhbmNlcyc6XG4gICAgICAgICAgXG4gICAgICAgICAgZW50cnkoRFJBV19TVEFURVtwYXJhbV0sICcucHVzaCgnLCB2YWx1ZSwgJyk7JylcbiAgICAgICAgICBleGl0KERSQVdfU1RBVEVbcGFyYW1dLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICAvLyBVcGRhdGUgcHJpbWl0aXZlIHR5cGVcbiAgICAgICAgY2FzZSAncHJpbWl0aXZlJzpcbiAgICAgICAgICBcbiAgICAgICAgICB2YXIgcHJpbVR5cGUgPSBwcmltVHlwZXNbdmFsdWVdXG4gICAgICAgICAgZW50cnkoRFJBV19TVEFURS5wcmltaXRpdmUsICcucHVzaCgnLCBwcmltVHlwZSwgJyk7JylcbiAgICAgICAgICBleGl0KERSQVdfU1RBVEUucHJpbWl0aXZlLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICAvLyBVcGRhdGUgZWxlbWVudCBidWZmZXJcbiAgICAgICAgY2FzZSAnZWxlbWVudHMnOlxuICAgICAgICAgIHZhciBlbGVtZW50cyA9IGVsZW1lbnRTdGF0ZS5nZXRFbGVtZW50cyh2YWx1ZSlcbiAgICAgICAgICB2YXIgaGFzUHJpbWl0aXZlID0gISgncHJpbWl0aXZlJyBpbiBzdGF0aWNPcHRpb25zKVxuICAgICAgICAgIHZhciBoYXNDb3VudCA9ICEoJ2NvdW50JyBpbiBzdGF0aWNPcHRpb25zKVxuICAgICAgICAgIGlmIChlbGVtZW50cykge1xuICAgICAgICAgICAgdmFyIEVMRU1FTlRTID0gbGluayhlbGVtZW50cylcbiAgICAgICAgICAgIGVudHJ5KEVMRU1FTlRfU1RBVEUsICcucHVzaCgnLCBFTEVNRU5UUywgJyk7JylcbiAgICAgICAgICAgIGlmIChoYXNQcmltaXRpdmUpIHtcbiAgICAgICAgICAgICAgZW50cnkoRFJBV19TVEFURS5wcmltaXRpdmUsICcucHVzaCgnLCBFTEVNRU5UUywgJy5wcmltVHlwZSk7JylcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChoYXNDb3VudCkge1xuICAgICAgICAgICAgICBlbnRyeShEUkFXX1NUQVRFLmNvdW50LCAnLnB1c2goJywgRUxFTUVOVFMsICcudmVydENvdW50KTsnKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBlbnRyeShFTEVNRU5UX1NUQVRFLCAnLnB1c2gobnVsbCk7JylcbiAgICAgICAgICAgIGlmIChoYXNQcmltaXRpdmUpIHtcbiAgICAgICAgICAgICAgZW50cnkoRFJBV19TVEFURS5wcmltaXRpdmUsICcucHVzaCgnLCBHTF9UUklBTkdMRVMsICcpOycpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaGFzQ291bnQpIHtcbiAgICAgICAgICAgICAgZW50cnkoRFJBV19TVEFURS5jb3VudCwgJy5wdXNoKDApOycpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChoYXNQcmltaXRpdmUpIHtcbiAgICAgICAgICAgIGV4aXQoRFJBV19TVEFURS5wcmltaXRpdmUsICcucG9wKCk7JylcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGhhc0NvdW50KSB7XG4gICAgICAgICAgICBleGl0KERSQVdfU1RBVEUuY291bnQsICcucG9wKCk7JylcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCEoJ29mZnNldCcgaW4gc3RhdGljT3B0aW9ucykpIHtcbiAgICAgICAgICAgIGVudHJ5KERSQVdfU1RBVEUub2Zmc2V0LCAnLnB1c2goMCk7JylcbiAgICAgICAgICAgIGV4aXQoRFJBV19TVEFURS5vZmZzZXQsICcucG9wKCk7JylcbiAgICAgICAgICB9XG4gICAgICAgICAgZXhpdChFTEVNRU5UX1NUQVRFLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdjdWxsLmVuYWJsZSc6XG4gICAgICAgIGNhc2UgJ2JsZW5kLmVuYWJsZSc6XG4gICAgICAgIGNhc2UgJ2RpdGhlcic6XG4gICAgICAgIGNhc2UgJ3N0ZW5jaWwuZW5hYmxlJzpcbiAgICAgICAgY2FzZSAnZGVwdGguZW5hYmxlJzpcbiAgICAgICAgY2FzZSAnc2Npc3Nvci5lbmFibGUnOlxuICAgICAgICBjYXNlICdwb2x5Z29uT2Zmc2V0LmVuYWJsZSc6XG4gICAgICAgIGNhc2UgJ3NhbXBsZS5hbHBoYSc6XG4gICAgICAgIGNhc2UgJ3NhbXBsZS5lbmFibGUnOlxuICAgICAgICBjYXNlICdkZXB0aC5tYXNrJzpcbiAgICAgICAgICBcbiAgICAgICAgICBoYW5kbGVTdGF0aWNPcHRpb24ocGFyYW0sIHZhbHVlKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnZGVwdGguZnVuYyc6XG4gICAgICAgICAgXG4gICAgICAgICAgaGFuZGxlU3RhdGljT3B0aW9uKHBhcmFtLCBjb21wYXJlRnVuY3NbdmFsdWVdKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnZGVwdGgucmFuZ2UnOlxuICAgICAgICAgIFxuICAgICAgICAgIHZhciBERVBUSF9SQU5HRV9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGVudHJ5KERFUFRIX1JBTkdFX1NUQUNLLCAnLnB1c2goJywgdmFsdWVbMF0sICcsJywgdmFsdWVbMV0sICcpOycpXG4gICAgICAgICAgZXhpdChERVBUSF9SQU5HRV9TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnYmxlbmQuZnVuYyc6XG4gICAgICAgICAgdmFyIEJMRU5EX0ZVTkNfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBcbiAgICAgICAgICB2YXIgc3JjUkdCID0gKCdzcmNSR0InIGluIHZhbHVlID8gdmFsdWUuc3JjUkdCIDogdmFsdWUuc3JjKVxuICAgICAgICAgIHZhciBzcmNBbHBoYSA9ICgnc3JjQWxwaGEnIGluIHZhbHVlID8gdmFsdWUuc3JjQWxwaGEgOiB2YWx1ZS5zcmMpXG4gICAgICAgICAgdmFyIGRzdFJHQiA9ICgnZHN0UkdCJyBpbiB2YWx1ZSA/IHZhbHVlLmRzdFJHQiA6IHZhbHVlLmRzdClcbiAgICAgICAgICB2YXIgZHN0QWxwaGEgPSAoJ2RzdEFscGhhJyBpbiB2YWx1ZSA/IHZhbHVlLmRzdEFscGhhIDogdmFsdWUuZHN0KVxuICAgICAgICAgIFxuICAgICAgICAgIFxuICAgICAgICAgIFxuICAgICAgICAgIFxuICAgICAgICAgIGVudHJ5KEJMRU5EX0ZVTkNfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgYmxlbmRGdW5jc1tzcmNSR0JdLCAnLCcsXG4gICAgICAgICAgICBibGVuZEZ1bmNzW2RzdFJHQl0sICcsJyxcbiAgICAgICAgICAgIGJsZW5kRnVuY3Nbc3JjQWxwaGFdLCAnLCcsXG4gICAgICAgICAgICBibGVuZEZ1bmNzW2RzdEFscGhhXSwgJyk7JylcbiAgICAgICAgICBleGl0KEJMRU5EX0ZVTkNfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2JsZW5kLmVxdWF0aW9uJzpcbiAgICAgICAgICB2YXIgQkxFTkRfRVFVQVRJT05fU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBlbnRyeShCTEVORF9FUVVBVElPTl9TVEFDSyxcbiAgICAgICAgICAgICAgJy5wdXNoKCcsXG4gICAgICAgICAgICAgIGJsZW5kRXF1YXRpb25zW3ZhbHVlXSwgJywnLFxuICAgICAgICAgICAgICBibGVuZEVxdWF0aW9uc1t2YWx1ZV0sICcpOycpXG4gICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZW50cnkoQkxFTkRfRVFVQVRJT05fU1RBQ0ssXG4gICAgICAgICAgICAgICcucHVzaCgnLFxuICAgICAgICAgICAgICBibGVuZEVxdWF0aW9uc1t2YWx1ZS5yZ2JdLCAnLCcsXG4gICAgICAgICAgICAgIGJsZW5kRXF1YXRpb25zW3ZhbHVlLmFscGhhXSwgJyk7JylcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgXG4gICAgICAgICAgfVxuICAgICAgICAgIGV4aXQoQkxFTkRfRVFVQVRJT05fU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2JsZW5kLmNvbG9yJzpcbiAgICAgICAgICBcbiAgICAgICAgICB2YXIgQkxFTkRfQ09MT1JfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBlbnRyeShCTEVORF9DT0xPUl9TVEFDSyxcbiAgICAgICAgICAgICcucHVzaCgnLFxuICAgICAgICAgICAgdmFsdWVbMF0sICcsJyxcbiAgICAgICAgICAgIHZhbHVlWzFdLCAnLCcsXG4gICAgICAgICAgICB2YWx1ZVsyXSwgJywnLFxuICAgICAgICAgICAgdmFsdWVbM10sICcpOycpXG4gICAgICAgICAgZXhpdChCTEVORF9DT0xPUl9TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnc3RlbmNpbC5tYXNrJzpcbiAgICAgICAgICBcbiAgICAgICAgICB2YXIgU1RFTkNJTF9NQVNLX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZW50cnkoU1RFTkNJTF9NQVNLX1NUQUNLLCAnLnB1c2goJywgdmFsdWUsICcpOycpXG4gICAgICAgICAgZXhpdChTVEVOQ0lMX01BU0tfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3N0ZW5jaWwuZnVuYyc6XG4gICAgICAgICAgXG4gICAgICAgICAgdmFyIGNtcCA9IHZhbHVlLmNtcCB8fCAna2VlcCdcbiAgICAgICAgICB2YXIgcmVmID0gdmFsdWUucmVmIHx8IDBcbiAgICAgICAgICB2YXIgbWFzayA9ICdtYXNrJyBpbiB2YWx1ZSA/IHZhbHVlLm1hc2sgOiAtMVxuICAgICAgICAgIFxuICAgICAgICAgIFxuICAgICAgICAgIFxuICAgICAgICAgIHZhciBTVEVOQ0lMX0ZVTkNfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBlbnRyeShTVEVOQ0lMX0ZVTkNfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgY29tcGFyZUZ1bmNzW2NtcF0sICcsJyxcbiAgICAgICAgICAgIHJlZiwgJywnLFxuICAgICAgICAgICAgbWFzaywgJyk7JylcbiAgICAgICAgICBleGl0KFNURU5DSUxfRlVOQ19TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnc3RlbmNpbC5vcEZyb250JzpcbiAgICAgICAgY2FzZSAnc3RlbmNpbC5vcEJhY2snOlxuICAgICAgICAgIFxuICAgICAgICAgIHZhciBmYWlsID0gdmFsdWUuZmFpbCB8fCAna2VlcCdcbiAgICAgICAgICB2YXIgemZhaWwgPSB2YWx1ZS56ZmFpbCB8fCAna2VlcCdcbiAgICAgICAgICB2YXIgcGFzcyA9IHZhbHVlLnBhc3MgfHwgJ2tlZXAnXG4gICAgICAgICAgXG4gICAgICAgICAgXG4gICAgICAgICAgXG4gICAgICAgICAgdmFyIFNURU5DSUxfT1BfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBlbnRyeShTVEVOQ0lMX09QX1NUQUNLLCAnLnB1c2goJyxcbiAgICAgICAgICAgIHN0ZW5jaWxPcHNbZmFpbF0sICcsJyxcbiAgICAgICAgICAgIHN0ZW5jaWxPcHNbemZhaWxdLCAnLCcsXG4gICAgICAgICAgICBzdGVuY2lsT3BzW3Bhc3NdLCAnKTsnKVxuICAgICAgICAgIGV4aXQoU1RFTkNJTF9PUF9TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAncG9seWdvbk9mZnNldC5vZmZzZXQnOlxuICAgICAgICAgIFxuICAgICAgICAgIHZhciBmYWN0b3IgPSB2YWx1ZS5mYWN0b3IgfHwgMFxuICAgICAgICAgIHZhciB1bml0cyA9IHZhbHVlLnVuaXRzIHx8IDBcbiAgICAgICAgICBcbiAgICAgICAgICBcbiAgICAgICAgICB2YXIgUE9MWUdPTl9PRkZTRVRfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBlbnRyeShQT0xZR09OX09GRlNFVF9TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICBmYWN0b3IsICcsJywgdW5pdHMsICcpOycpXG4gICAgICAgICAgZXhpdChQT0xZR09OX09GRlNFVF9TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnY3VsbC5mYWNlJzpcbiAgICAgICAgICB2YXIgZmFjZSA9IDBcbiAgICAgICAgICBpZiAodmFsdWUgPT09ICdmcm9udCcpIHtcbiAgICAgICAgICAgIGZhY2UgPSBHTF9GUk9OVFxuICAgICAgICAgIH0gZWxzZSBpZiAodmFsdWUgPT09ICdiYWNrJykge1xuICAgICAgICAgICAgZmFjZSA9IEdMX0JBQ0tcbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgdmFyIENVTExfRkFDRV9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGVudHJ5KENVTExfRkFDRV9TVEFDSywgJy5wdXNoKCcsIGZhY2UsICcpOycpXG4gICAgICAgICAgZXhpdChDVUxMX0ZBQ0VfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2xpbmVXaWR0aCc6XG4gICAgICAgICAgdmFyIGxpbmVXaWR0aERpbXMgPSBsaW1pdHMubGluZVdpZHRoRGltc1xuICAgICAgICAgIFxuICAgICAgICAgIGhhbmRsZVN0YXRpY09wdGlvbihwYXJhbSwgdmFsdWUpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdmcm9udEZhY2UnOlxuICAgICAgICAgIHZhciBvcmllbnRhdGlvbiA9IDBcbiAgICAgICAgICBpZiAodmFsdWUgPT09ICdjdycpIHtcbiAgICAgICAgICAgIG9yaWVudGF0aW9uID0gR0xfQ1dcbiAgICAgICAgICB9IGVsc2UgaWYgKHZhbHVlID09PSAnY2N3Jykge1xuICAgICAgICAgICAgb3JpZW50YXRpb24gPSBHTF9DQ1dcbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgdmFyIEZST05UX0ZBQ0VfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBlbnRyeShGUk9OVF9GQUNFX1NUQUNLLCAnLnB1c2goJywgb3JpZW50YXRpb24sICcpOycpXG4gICAgICAgICAgZXhpdChGUk9OVF9GQUNFX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdjb2xvck1hc2snOlxuICAgICAgICAgIFxuICAgICAgICAgIHZhciBDT0xPUl9NQVNLX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZW50cnkoQ09MT1JfTUFTS19TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICB2YWx1ZS5tYXAoZnVuY3Rpb24gKHYpIHsgcmV0dXJuICEhdiB9KS5qb2luKCksXG4gICAgICAgICAgICAnKTsnKVxuICAgICAgICAgIGV4aXQoQ09MT1JfTUFTS19TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnc2FtcGxlLmNvdmVyYWdlJzpcbiAgICAgICAgICBcbiAgICAgICAgICB2YXIgc2FtcGxlVmFsdWUgPSAndmFsdWUnIGluIHZhbHVlID8gdmFsdWUudmFsdWUgOiAxXG4gICAgICAgICAgdmFyIHNhbXBsZUludmVydCA9ICEhdmFsdWUuaW52ZXJ0XG4gICAgICAgICAgXG4gICAgICAgICAgdmFyIFNBTVBMRV9DT1ZFUkFHRV9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGVudHJ5KFNBTVBMRV9DT1ZFUkFHRV9TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICBzYW1wbGVWYWx1ZSwgJywnLCBzYW1wbGVJbnZlcnQsICcpOycpXG4gICAgICAgICAgZXhpdChTQU1QTEVfQ09WRVJBR0VfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3ZpZXdwb3J0JzpcbiAgICAgICAgY2FzZSAnc2Npc3Nvci5ib3gnOlxuICAgICAgICAgIFxuICAgICAgICAgIHZhciBYID0gdmFsdWUueCB8fCAwXG4gICAgICAgICAgdmFyIFkgPSB2YWx1ZS55IHx8IDBcbiAgICAgICAgICB2YXIgVyA9IC0xXG4gICAgICAgICAgdmFyIEggPSAtMVxuICAgICAgICAgIFxuICAgICAgICAgIFxuICAgICAgICAgIGlmICgndycgaW4gdmFsdWUpIHtcbiAgICAgICAgICAgIFcgPSB2YWx1ZS53XG4gICAgICAgICAgICBcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCdoJyBpbiB2YWx1ZSkge1xuICAgICAgICAgICAgSCA9IHZhbHVlLmhcbiAgICAgICAgICAgIFxuICAgICAgICAgIH1cbiAgICAgICAgICB2YXIgQk9YX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZW50cnkoQk9YX1NUQUNLLCAnLnB1c2goJywgWCwgJywnLCBZLCAnLCcsIFcsICcsJywgSCwgJyk7JylcbiAgICAgICAgICBleGl0KEJPWF9TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAvLyBUT0RPIFNob3VsZCB0aGlzIGp1c3QgYmUgYSB3YXJuaW5nIGluc3RlYWQ/XG4gICAgICAgICAgXG4gICAgICAgICAgYnJlYWtcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHVwZGF0ZSBzaGFkZXIgcHJvZ3JhbVxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBpZiAoaGFzU2hhZGVyKSB7XG4gICAgICBpZiAoc3RhdGljT3B0aW9ucy5mcmFnICYmIHN0YXRpY09wdGlvbnMudmVydCkge1xuICAgICAgICB2YXIgZnJhZ1NyYyA9IHN0YXRpY09wdGlvbnMuZnJhZ1xuICAgICAgICB2YXIgdmVydFNyYyA9IHN0YXRpY09wdGlvbnMudmVydFxuICAgICAgICBlbnRyeShQUk9HUkFNX1NUQVRFLCAnLnB1c2goJyxcbiAgICAgICAgICBsaW5rKHNoYWRlclN0YXRlLmNyZWF0ZShcbiAgICAgICAgICAgIHN0cmluZ1N0b3JlLmlkKHZlcnRTcmMpLFxuICAgICAgICAgICAgc3RyaW5nU3RvcmUuaWQoZnJhZ1NyYykpKSwgJyk7JylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBGUkFHX1NSQyA9IGVudHJ5LmRlZihcbiAgICAgICAgICBGUkFHX1NIQURFUl9TVEFURSwgJ1snLCBGUkFHX1NIQURFUl9TVEFURSwgJy5sZW5ndGgtMV0nKVxuICAgICAgICB2YXIgVkVSVF9TUkMgPSBlbnRyeS5kZWYoXG4gICAgICAgICAgVkVSVF9TSEFERVJfU1RBVEUsICdbJywgVkVSVF9TSEFERVJfU1RBVEUsICcubGVuZ3RoLTFdJylcbiAgICAgICAgdmFyIExJTktfUFJPRyA9IGxpbmsoc2hhZGVyU3RhdGUuY3JlYXRlKVxuICAgICAgICBlbnRyeShcbiAgICAgICAgICBQUk9HUkFNX1NUQVRFLCAnLnB1c2goJyxcbiAgICAgICAgICBMSU5LX1BST0csICcoJywgVkVSVF9TUkMsICcsJywgRlJBR19TUkMsICcpKTsnKVxuICAgICAgfVxuICAgICAgZXhpdChQUk9HUkFNX1NUQVRFLCAnLnBvcCgpOycpXG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHVwZGF0ZSBzdGF0aWMgdW5pZm9ybXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgT2JqZWN0LmtleXMoc3RhdGljVW5pZm9ybXMpLmZvckVhY2goZnVuY3Rpb24gKHVuaWZvcm0pIHtcbiAgICAgIHZhciBTVEFDSyA9IGxpbmsodW5pZm9ybVN0YXRlLmRlZih1bmlmb3JtKSlcbiAgICAgIHZhciBWQUxVRVxuICAgICAgdmFyIHZhbHVlID0gc3RhdGljVW5pZm9ybXNbdW5pZm9ybV1cbiAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdmdW5jdGlvbicgJiYgdmFsdWUuX3JlZ2xUeXBlKSB7XG4gICAgICAgIFZBTFVFID0gbGluayh2YWx1ZSlcbiAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcbiAgICAgICAgVkFMVUUgPSBsaW5rKHZhbHVlLnNsaWNlKCkpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBWQUxVRSA9ICt2YWx1ZVxuICAgICAgfVxuICAgICAgZW50cnkoU1RBQ0ssICcucHVzaCgnLCBWQUxVRSwgJyk7JylcbiAgICAgIGV4aXQoU1RBQ0ssICcucG9wKCk7JylcbiAgICB9KVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHVwZGF0ZSBkZWZhdWx0IGF0dHJpYnV0ZXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgT2JqZWN0LmtleXMoc3RhdGljQXR0cmlidXRlcykuZm9yRWFjaChmdW5jdGlvbiAoYXR0cmlidXRlKSB7XG4gICAgICB2YXIgQVRUUklCVVRFID0gbGluayhhdHRyaWJ1dGVTdGF0ZS5kZWYoYXR0cmlidXRlKSlcblxuICAgICAgdmFyIGRhdGEgPSBzdGF0aWNBdHRyaWJ1dGVzW2F0dHJpYnV0ZV1cbiAgICAgIGlmICh0eXBlb2YgZGF0YSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgZW50cnkoQVRUUklCVVRFLCAnLnB1c2hWZWMoJywgK2RhdGEsICcsMCwwLDApOycpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBcblxuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShkYXRhKSkge1xuICAgICAgICAgIGVudHJ5KFxuICAgICAgICAgICAgQVRUUklCVVRFLCAnLnB1c2hWZWMoJyxcbiAgICAgICAgICAgIFtkYXRhWzBdIHx8IDAsIGRhdGFbMV0gfHwgMCwgZGF0YVsyXSB8fCAwLCBkYXRhWzNdIHx8IDBdLCAnKTsnKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHZhciBidWZmZXIgPSBidWZmZXJTdGF0ZS5nZXRCdWZmZXIoZGF0YSlcbiAgICAgICAgICB2YXIgc2l6ZSA9IDBcbiAgICAgICAgICB2YXIgc3RyaWRlID0gMFxuICAgICAgICAgIHZhciBvZmZzZXQgPSAwXG4gICAgICAgICAgdmFyIGRpdmlzb3IgPSAwXG4gICAgICAgICAgdmFyIG5vcm1hbGl6ZWQgPSBmYWxzZVxuICAgICAgICAgIHZhciB0eXBlID0gR0xfRkxPQVRcblxuICAgICAgICAgIGlmICghYnVmZmVyKSB7XG4gICAgICAgICAgICBcblxuICAgICAgICAgICAgYnVmZmVyID0gYnVmZmVyU3RhdGUuZ2V0QnVmZmVyKGRhdGEuYnVmZmVyKVxuICAgICAgICAgICAgc2l6ZSA9IGRhdGEuc2l6ZSB8fCAwXG4gICAgICAgICAgICBzdHJpZGUgPSBkYXRhLnN0cmlkZSB8fCAwXG4gICAgICAgICAgICBvZmZzZXQgPSBkYXRhLm9mZnNldCB8fCAwXG4gICAgICAgICAgICBkaXZpc29yID0gZGF0YS5kaXZpc29yIHx8IDBcbiAgICAgICAgICAgIG5vcm1hbGl6ZWQgPSBkYXRhLm5vcm1hbGl6ZWQgfHwgZmFsc2VcblxuICAgICAgICAgICAgXG5cbiAgICAgICAgICAgIC8vIENoZWNrIGZvciB1c2VyIGRlZmluZWQgdHlwZSBvdmVybG9hZGluZ1xuICAgICAgICAgICAgdHlwZSA9IGJ1ZmZlci5kdHlwZVxuICAgICAgICAgICAgaWYgKCd0eXBlJyBpbiBkYXRhKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICB0eXBlID0gZ2xUeXBlc1tkYXRhLnR5cGVdXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHR5cGUgPSBidWZmZXIuZHR5cGVcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBcbiAgICAgICAgICBcbiAgICAgICAgICBcbiAgICAgICAgICBcbiAgICAgICAgICBcbiAgICAgICAgICBcblxuICAgICAgICAgIGVudHJ5KFxuICAgICAgICAgICAgQVRUUklCVVRFLCAnLnB1c2hQdHIoJywgW1xuICAgICAgICAgICAgICBsaW5rKGJ1ZmZlciksIHNpemUsIG9mZnNldCwgc3RyaWRlLFxuICAgICAgICAgICAgICBkaXZpc29yLCBub3JtYWxpemVkLCB0eXBlXG4gICAgICAgICAgICBdLmpvaW4oKSwgJyk7JylcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgZXhpdChBVFRSSUJVVEUsICcucG9wKCk7JylcbiAgICB9KVxuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIERZTkFNSUMgU1RBVEUgKGZvciBzY29wZSBhbmQgZHJhdylcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gR2VuZXJhdGVkIGNvZGUgYmxvY2tzIGZvciBkeW5hbWljIHN0YXRlIGZsYWdzXG4gICAgdmFyIGR5bmFtaWNFbnRyeSA9IGVudi5ibG9jaygpXG4gICAgdmFyIGR5bmFtaWNFeGl0ID0gZW52LmJsb2NrKClcblxuICAgIHZhciBGUkFNRVNUQVRFXG4gICAgdmFyIERZTkFSR1NcbiAgICBpZiAoaGFzRHluYW1pYykge1xuICAgICAgRlJBTUVTVEFURSA9IGxpbmsoZnJhbWVTdGF0ZSlcbiAgICAgIERZTkFSR1MgPSBlbnRyeS5kZWYoKVxuICAgIH1cblxuICAgIHZhciBkeW5hbWljVmFycyA9IHt9XG4gICAgZnVuY3Rpb24gZHluICh4KSB7XG4gICAgICB2YXIgaWQgPSB4LmlkXG4gICAgICB2YXIgcmVzdWx0ID0gZHluYW1pY1ZhcnNbaWRdXG4gICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH1cbiAgICAgIGlmICh4LmZ1bmMpIHtcbiAgICAgICAgcmVzdWx0ID0gZHluYW1pY0VudHJ5LmRlZihcbiAgICAgICAgICBsaW5rKHguZGF0YSksICcoJywgRFlOQVJHUywgJywwLCcsIEZSQU1FU1RBVEUsICcpJylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlc3VsdCA9IGR5bmFtaWNFbnRyeS5kZWYoRFlOQVJHUywgJy4nLCB4LmRhdGEpXG4gICAgICB9XG4gICAgICBkeW5hbWljVmFyc1tpZF0gPSByZXN1bHRcbiAgICAgIHJldHVybiByZXN1bHRcbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gZHluYW1pYyBjb250ZXh0IHN0YXRlIHZhcmlhYmxlc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBPYmplY3Qua2V5cyhkeW5hbWljT3B0aW9ucykuc29ydChvcHRpb25Qcmlvcml0eSkuZm9yRWFjaChmdW5jdGlvbiAocGFyYW0pIHtcbiAgICAgIC8vIExpbmsgaW4gZHluYW1pYyB2YXJpYWJsZVxuICAgICAgdmFyIHZhcmlhYmxlID0gZHluKGR5bmFtaWNPcHRpb25zW3BhcmFtXSlcblxuICAgICAgc3dpdGNoIChwYXJhbSkge1xuICAgICAgICBjYXNlICdmcmFtZWJ1ZmZlcic6XG4gICAgICAgICAgdmFyIFZJRVdQT1JUX1NUQVRFID0gbGlua0NvbnRleHQoJ3ZpZXdwb3J0JylcbiAgICAgICAgICB2YXIgU0NJU1NPUl9TVEFURSA9IGxpbmtDb250ZXh0KCdzY2lzc29yLmJveCcpXG4gICAgICAgICAgZHluYW1pY0VudHJ5KCdpZignLFxuICAgICAgICAgICAgRlJBTUVCVUZGRVJfU1RBVEUsICcucHVzaCgnLFxuICAgICAgICAgICAgdmFyaWFibGUsICcmJicsIHZhcmlhYmxlLCAnLl9mcmFtZWJ1ZmZlcikpeycsXG4gICAgICAgICAgICBWSUVXUE9SVF9TVEFURSwgJy5zZXREaXJ0eSgpOycsXG4gICAgICAgICAgICBTQ0lTU09SX1NUQVRFLCAnLnNldERpcnR5KCk7JyxcbiAgICAgICAgICAgICd9JylcbiAgICAgICAgICBkeW5hbWljRXhpdCgnaWYoJyxcbiAgICAgICAgICAgIEZSQU1FQlVGRkVSX1NUQVRFLCAnLnBvcCgpKXsnLFxuICAgICAgICAgICAgVklFV1BPUlRfU1RBVEUsICcuc2V0RGlydHkoKTsnLFxuICAgICAgICAgICAgU0NJU1NPUl9TVEFURSwgJy5zZXREaXJ0eSgpOycsXG4gICAgICAgICAgICAnfScpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdjdWxsLmVuYWJsZSc6XG4gICAgICAgIGNhc2UgJ2JsZW5kLmVuYWJsZSc6XG4gICAgICAgIGNhc2UgJ2RpdGhlcic6XG4gICAgICAgIGNhc2UgJ3N0ZW5jaWwuZW5hYmxlJzpcbiAgICAgICAgY2FzZSAnZGVwdGguZW5hYmxlJzpcbiAgICAgICAgY2FzZSAnc2Npc3Nvci5lbmFibGUnOlxuICAgICAgICBjYXNlICdwb2x5Z29uT2Zmc2V0LmVuYWJsZSc6XG4gICAgICAgIGNhc2UgJ3NhbXBsZS5hbHBoYSc6XG4gICAgICAgIGNhc2UgJ3NhbXBsZS5lbmFibGUnOlxuICAgICAgICBjYXNlICdsaW5lV2lkdGgnOlxuICAgICAgICBjYXNlICdkZXB0aC5tYXNrJzpcbiAgICAgICAgICB2YXIgU1RBVEVfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBkeW5hbWljRW50cnkoU1RBVEVfU1RBQ0ssICcucHVzaCgnLCB2YXJpYWJsZSwgJyk7JylcbiAgICAgICAgICBkeW5hbWljRXhpdChTVEFURV9TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgLy8gRHJhdyBjYWxsc1xuICAgICAgICBjYXNlICdjb3VudCc6XG4gICAgICAgIGNhc2UgJ29mZnNldCc6XG4gICAgICAgIGNhc2UgJ2luc3RhbmNlcyc6XG4gICAgICAgICAgdmFyIERSQVdfU1RBQ0sgPSBEUkFXX1NUQVRFW3BhcmFtXVxuICAgICAgICAgIGR5bmFtaWNFbnRyeShEUkFXX1NUQUNLLCAnLnB1c2goJywgdmFyaWFibGUsICcpOycpXG4gICAgICAgICAgZHluYW1pY0V4aXQoRFJBV19TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAncHJpbWl0aXZlJzpcbiAgICAgICAgICB2YXIgUFJJTV9TVEFDSyA9IERSQVdfU1RBVEUucHJpbWl0aXZlXG4gICAgICAgICAgZHluYW1pY0VudHJ5KFBSSU1fU1RBQ0ssICcucHVzaCgnLCBQUklNX1RZUEVTLCAnWycsIHZhcmlhYmxlLCAnXSk7JylcbiAgICAgICAgICBkeW5hbWljRXhpdChQUklNX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdkZXB0aC5mdW5jJzpcbiAgICAgICAgICB2YXIgREVQVEhfRlVOQ19TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGR5bmFtaWNFbnRyeShERVBUSF9GVU5DX1NUQUNLLCAnLnB1c2goJywgQ09NUEFSRV9GVU5DUywgJ1snLCB2YXJpYWJsZSwgJ10pOycpXG4gICAgICAgICAgZHluYW1pY0V4aXQoREVQVEhfRlVOQ19TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnYmxlbmQuZnVuYyc6XG4gICAgICAgICAgdmFyIEJMRU5EX0ZVTkNfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICB2YXIgQkxFTkRfRlVOQ1MgPSBsaW5rKGJsZW5kRnVuY3MpXG4gICAgICAgICAgZHluYW1pY0VudHJ5KFxuICAgICAgICAgICAgQkxFTkRfRlVOQ19TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICBCTEVORF9GVU5DUyxcbiAgICAgICAgICAgICdbXCJzcmNSR0JcIiBpbiAnLCB2YXJpYWJsZSwgJz8nLCB2YXJpYWJsZSwgJy5zcmNSR0I6JywgdmFyaWFibGUsICcuc3JjXSwnLFxuICAgICAgICAgICAgQkxFTkRfRlVOQ1MsXG4gICAgICAgICAgICAnW1wiZHN0UkdCXCIgaW4gJywgdmFyaWFibGUsICc/JywgdmFyaWFibGUsICcuZHN0UkdCOicsIHZhcmlhYmxlLCAnLmRzdF0sJyxcbiAgICAgICAgICAgIEJMRU5EX0ZVTkNTLFxuICAgICAgICAgICAgJ1tcInNyY0FscGhhXCIgaW4gJywgdmFyaWFibGUsICc/JywgdmFyaWFibGUsICcuc3JjQWxwaGE6JywgdmFyaWFibGUsICcuc3JjXSwnLFxuICAgICAgICAgICAgQkxFTkRfRlVOQ1MsXG4gICAgICAgICAgICAnW1wiZHN0QWxwaGFcIiBpbiAnLCB2YXJpYWJsZSwgJz8nLCB2YXJpYWJsZSwgJy5kc3RBbHBoYTonLCB2YXJpYWJsZSwgJy5kc3RdKTsnKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KEJMRU5EX0ZVTkNfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2JsZW5kLmVxdWF0aW9uJzpcbiAgICAgICAgICB2YXIgQkxFTkRfRVFVQVRJT05fU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICB2YXIgQkxFTkRfRVFVQVRJT05TID0gbGluayhibGVuZEVxdWF0aW9ucylcbiAgICAgICAgICBkeW5hbWljRW50cnkoXG4gICAgICAgICAgICAnaWYodHlwZW9mICcsIHZhcmlhYmxlLCAnPT09XCJzdHJpbmdcIil7JyxcbiAgICAgICAgICAgIEJMRU5EX0VRVUFUSU9OX1NUQUNLLCAnLnB1c2goJyxcbiAgICAgICAgICAgIEJMRU5EX0VRVUFUSU9OUywgJ1snLCB2YXJpYWJsZSwgJ10sJyxcbiAgICAgICAgICAgIEJMRU5EX0VRVUFUSU9OUywgJ1snLCB2YXJpYWJsZSwgJ10pOycsXG4gICAgICAgICAgICAnfWVsc2V7JyxcbiAgICAgICAgICAgIEJMRU5EX0VRVUFUSU9OX1NUQUNLLCAnLnB1c2goJyxcbiAgICAgICAgICAgIEJMRU5EX0VRVUFUSU9OUywgJ1snLCB2YXJpYWJsZSwgJy5yZ2JdLCcsXG4gICAgICAgICAgICBCTEVORF9FUVVBVElPTlMsICdbJywgdmFyaWFibGUsICcuYWxwaGFdKTsnLFxuICAgICAgICAgICAgJ30nKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KEJMRU5EX0VRVUFUSU9OX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdibGVuZC5jb2xvcic6XG4gICAgICAgICAgdmFyIEJMRU5EX0NPTE9SX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZHluYW1pY0VudHJ5KEJMRU5EX0NPTE9SX1NUQUNLLCAnLnB1c2goJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnWzBdLCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJ1sxXSwnLFxuICAgICAgICAgICAgdmFyaWFibGUsICdbMl0sJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnWzNdKTsnKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KEJMRU5EX0NPTE9SX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdzdGVuY2lsLm1hc2snOlxuICAgICAgICAgIHZhciBTVEVOQ0lMX01BU0tfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBkeW5hbWljRW50cnkoU1RFTkNJTF9NQVNLX1NUQUNLLCAnLnB1c2goJywgdmFyaWFibGUsICcpOycpXG4gICAgICAgICAgZHluYW1pY0V4aXQoU1RFTkNJTF9NQVNLX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdzdGVuY2lsLmZ1bmMnOlxuICAgICAgICAgIHZhciBTVEVOQ0lMX0ZVTkNfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBkeW5hbWljRW50cnkoU1RFTkNJTF9GVU5DX1NUQUNLLCAnLnB1c2goJyxcbiAgICAgICAgICAgIENPTVBBUkVfRlVOQ1MsICdbJywgdmFyaWFibGUsICcuY21wXSwnLFxuICAgICAgICAgICAgdmFyaWFibGUsICcucmVmfDAsJyxcbiAgICAgICAgICAgICdcIm1hc2tcIiBpbiAnLCB2YXJpYWJsZSwgJz8nLCB2YXJpYWJsZSwgJy5tYXNrOi0xKTsnKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KFNURU5DSUxfRlVOQ19TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnc3RlbmNpbC5vcEZyb250JzpcbiAgICAgICAgY2FzZSAnc3RlbmNpbC5vcEJhY2snOlxuICAgICAgICAgIHZhciBTVEVOQ0lMX09QX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZHluYW1pY0VudHJ5KFNURU5DSUxfT1BfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgU1RFTkNJTF9PUFMsICdbJywgdmFyaWFibGUsICcuZmFpbHx8XCJrZWVwXCJdLCcsXG4gICAgICAgICAgICBTVEVOQ0lMX09QUywgJ1snLCB2YXJpYWJsZSwgJy56ZmFpbHx8XCJrZWVwXCJdLCcsXG4gICAgICAgICAgICBTVEVOQ0lMX09QUywgJ1snLCB2YXJpYWJsZSwgJy5wYXNzfHxcImtlZXBcIl0pOycpXG4gICAgICAgICAgZHluYW1pY0V4aXQoU1RFTkNJTF9PUF9TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAncG9seWdvbk9mZnNldC5vZmZzZXQnOlxuICAgICAgICAgIHZhciBQT0xZR09OX09GRlNFVF9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGR5bmFtaWNFbnRyeShQT0xZR09OX09GRlNFVF9TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJy5mYWN0b3J8fDAsJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnLnVuaXRzfHwwKTsnKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KFBPTFlHT05fT0ZGU0VUX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdjdWxsLmZhY2UnOlxuICAgICAgICAgIHZhciBDVUxMX0ZBQ0VfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBkeW5hbWljRW50cnkoQ1VMTF9GQUNFX1NUQUNLLCAnLnB1c2goJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnPT09XCJmcm9udFwiPycsIEdMX0ZST05ULCAnOicsIEdMX0JBQ0ssICcpOycpXG4gICAgICAgICAgZHluYW1pY0V4aXQoQ1VMTF9GQUNFX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdmcm9udEZhY2UnOlxuICAgICAgICAgIHZhciBGUk9OVF9GQUNFX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZHluYW1pY0VudHJ5KEZST05UX0ZBQ0VfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgdmFyaWFibGUsICc9PT1cImN3XCI/JywgR0xfQ1csICc6JywgR0xfQ0NXLCAnKTsnKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KEZST05UX0ZBQ0VfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2NvbG9yTWFzayc6XG4gICAgICAgICAgdmFyIENPTE9SX01BU0tfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBkeW5hbWljRW50cnkoQ09MT1JfTUFTS19TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJ1swXSwnLFxuICAgICAgICAgICAgdmFyaWFibGUsICdbMV0sJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnWzJdLCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJ1szXSk7JylcbiAgICAgICAgICBkeW5hbWljRXhpdChDT0xPUl9NQVNLX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdzYW1wbGUuY292ZXJhZ2UnOlxuICAgICAgICAgIHZhciBTQU1QTEVfQ09WRVJBR0VfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBkeW5hbWljRW50cnkoU0FNUExFX0NPVkVSQUdFX1NUQUNLLCAnLnB1c2goJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnLnZhbHVlLCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJy5pbnZlcnQpOycpXG4gICAgICAgICAgZHluYW1pY0V4aXQoU0FNUExFX0NPVkVSQUdFX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdzY2lzc29yLmJveCc6XG4gICAgICAgIGNhc2UgJ3ZpZXdwb3J0JzpcbiAgICAgICAgICB2YXIgQk9YX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZHluYW1pY0VudHJ5KEJPWF9TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJy54fHwwLCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJy55fHwwLCcsXG4gICAgICAgICAgICAnXCJ3XCIgaW4gJywgdmFyaWFibGUsICc/JywgdmFyaWFibGUsICcudzotMSwnLFxuICAgICAgICAgICAgJ1wiaFwiIGluICcsIHZhcmlhYmxlLCAnPycsIHZhcmlhYmxlLCAnLmg6LTEpOycpXG4gICAgICAgICAgZHluYW1pY0V4aXQoQk9YX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdlbGVtZW50cyc6XG4gICAgICAgICAgdmFyIGhhc1ByaW1pdGl2ZSA9XG4gICAgICAgICAgISgncHJpbWl0aXZlJyBpbiBkeW5hbWljT3B0aW9ucykgJiZcbiAgICAgICAgICAgICEoJ3ByaW1pdGl2ZScgaW4gc3RhdGljT3B0aW9ucylcbiAgICAgICAgICB2YXIgaGFzQ291bnQgPVxuICAgICAgICAgICEoJ2NvdW50JyBpbiBkeW5hbWljT3B0aW9ucykgJiZcbiAgICAgICAgICAgICEoJ2NvdW50JyBpbiBzdGF0aWNPcHRpb25zKVxuICAgICAgICAgIHZhciBoYXNPZmZzZXQgPVxuICAgICAgICAgICEoJ29mZnNldCcgaW4gZHluYW1pY09wdGlvbnMpICYmXG4gICAgICAgICAgICAhKCdvZmZzZXQnIGluIHN0YXRpY09wdGlvbnMpXG4gICAgICAgICAgdmFyIEVMRU1FTlRTID0gZHluYW1pY0VudHJ5LmRlZigpXG4gICAgICAgICAgZHluYW1pY0VudHJ5KFxuICAgICAgICAgICAgJ2lmKCcsIHZhcmlhYmxlLCAnKXsnLFxuICAgICAgICAgICAgRUxFTUVOVFMsICc9JywgdmFyaWFibGUsICcuX2VsZW1lbnRzOycsXG4gICAgICAgICAgICBFTEVNRU5UX1NUQVRFLCAnLnB1c2goJywgRUxFTUVOVFMsICcpOycsXG4gICAgICAgICAgICAhaGFzUHJpbWl0aXZlID8gJydcbiAgICAgICAgICAgICAgOiBEUkFXX1NUQVRFLnByaW1pdGl2ZSArICcucHVzaCgnICsgRUxFTUVOVFMgKyAnLnByaW1UeXBlKTsnLFxuICAgICAgICAgICAgIWhhc0NvdW50ID8gJydcbiAgICAgICAgICAgICAgOiBEUkFXX1NUQVRFLmNvdW50ICsgJy5wdXNoKCcgKyBFTEVNRU5UUyArICcudmVydENvdW50KTsnLFxuICAgICAgICAgICAgIWhhc09mZnNldCA/ICcnXG4gICAgICAgICAgICAgIDogRFJBV19TVEFURS5vZmZzZXQgKyAnLnB1c2goJyArIEVMRU1FTlRTICsgJy5vZmZzZXQpOycsXG4gICAgICAgICAgICAnfWVsc2V7JyxcbiAgICAgICAgICAgIEVMRU1FTlRfU1RBVEUsICcucHVzaChudWxsKTsnLFxuICAgICAgICAgICAgJ30nKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KFxuICAgICAgICAgICAgRUxFTUVOVF9TVEFURSwgJy5wb3AoKTsnLFxuICAgICAgICAgICAgJ2lmKCcsIHZhcmlhYmxlLCAnKXsnLFxuICAgICAgICAgICAgaGFzUHJpbWl0aXZlID8gRFJBV19TVEFURS5wcmltaXRpdmUgKyAnLnBvcCgpOycgOiAnJyxcbiAgICAgICAgICAgIGhhc0NvdW50ID8gRFJBV19TVEFURS5jb3VudCArICcucG9wKCk7JyA6ICcnLFxuICAgICAgICAgICAgaGFzT2Zmc2V0ID8gRFJBV19TVEFURS5vZmZzZXQgKyAnLnBvcCgpOycgOiAnJyxcbiAgICAgICAgICAgICd9JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgXG4gICAgICB9XG4gICAgfSlcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBkeW5hbWljIHVuaWZvcm1zXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIE9iamVjdC5rZXlzKGR5bmFtaWNVbmlmb3JtcykuZm9yRWFjaChmdW5jdGlvbiAodW5pZm9ybSkge1xuICAgICAgdmFyIFNUQUNLID0gbGluayh1bmlmb3JtU3RhdGUuZGVmKHVuaWZvcm0pKVxuICAgICAgdmFyIFZBTFVFID0gZHluKGR5bmFtaWNVbmlmb3Jtc1t1bmlmb3JtXSlcbiAgICAgIGR5bmFtaWNFbnRyeShTVEFDSywgJy5wdXNoKCcsIFZBTFVFLCAnKTsnKVxuICAgICAgZHluYW1pY0V4aXQoU1RBQ0ssICcucG9wKCk7JylcbiAgICB9KVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGR5bmFtaWMgYXR0cmlidXRlc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBPYmplY3Qua2V5cyhkeW5hbWljQXR0cmlidXRlcykuZm9yRWFjaChmdW5jdGlvbiAoYXR0cmlidXRlKSB7XG4gICAgICB2YXIgQVRUUklCVVRFID0gbGluayhhdHRyaWJ1dGVTdGF0ZS5kZWYoYXR0cmlidXRlKSlcbiAgICAgIHZhciBWQUxVRSA9IGR5bihkeW5hbWljQXR0cmlidXRlc1thdHRyaWJ1dGVdKVxuICAgICAgZHluYW1pY0VudHJ5KEFUVFJJQlVURSwgJy5wdXNoRHluKCcsIFZBTFVFLCAnKTsnKVxuICAgICAgZHluYW1pY0V4aXQoQVRUUklCVVRFLCAnLnBvcCgpOycpXG4gICAgfSlcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBTQ09QRSBQUk9DRURVUkVcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgdmFyIHNjb3BlID0gcHJvYygnc2NvcGUnKVxuICAgIHZhciBTQ09QRV9BUkdTID0gc2NvcGUuYXJnKClcbiAgICB2YXIgU0NPUEVfQk9EWSA9IHNjb3BlLmFyZygpXG4gICAgc2NvcGUoZW50cnkpXG4gICAgaWYgKGhhc0R5bmFtaWMpIHtcbiAgICAgIHNjb3BlKFxuICAgICAgICBEWU5BUkdTLCAnPScsIFNDT1BFX0FSR1MsICc7JyxcbiAgICAgICAgZHluYW1pY0VudHJ5KVxuICAgIH1cbiAgICBzY29wZShcbiAgICAgIFNDT1BFX0JPRFksICcoKTsnLFxuICAgICAgaGFzRHluYW1pYyA/IGR5bmFtaWNFeGl0IDogJycsXG4gICAgICBleGl0KVxuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIERSQVcgUFJPQ0VEVVJFXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIHZhciBkcmF3ID0gcHJvYygnZHJhdycpXG4gICAgZHJhdyhlbnRyeSlcbiAgICBpZiAoaGFzRHluYW1pYykge1xuICAgICAgZHJhdyhcbiAgICAgICAgRFlOQVJHUywgJz0nLCBkcmF3LmFyZygpLCAnOycsXG4gICAgICAgIGR5bmFtaWNFbnRyeSlcbiAgICB9XG4gICAgdmFyIENVUlJFTlRfU0hBREVSID0gc3RhY2tUb3AoUFJPR1JBTV9TVEFURSlcbiAgICBkcmF3KFxuICAgICAgR0xfUE9MTCwgJygpOycsXG4gICAgICAnaWYoJywgQ1VSUkVOVF9TSEFERVIsICcpJyxcbiAgICAgIENVUlJFTlRfU0hBREVSLCAnLmRyYXcoJywgaGFzRHluYW1pYyA/IERZTkFSR1MgOiAnJywgJyk7JyxcbiAgICAgIGhhc0R5bmFtaWMgPyBkeW5hbWljRXhpdCA6ICcnLFxuICAgICAgZXhpdClcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBCQVRDSCBEUkFXXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIHZhciBiYXRjaCA9IHByb2MoJ2JhdGNoJylcbiAgICBiYXRjaChlbnRyeSlcbiAgICB2YXIgQ1VSX1NIQURFUiA9IGJhdGNoLmRlZihzdGFja1RvcChQUk9HUkFNX1NUQVRFKSlcbiAgICB2YXIgRVhFQ19CQVRDSCA9IGxpbmsoZnVuY3Rpb24gKHByb2dyYW0sIGNvdW50LCBhcmdzKSB7XG4gICAgICB2YXIgcHJvYyA9IHByb2dyYW0uYmF0Y2hDYWNoZVtjYWxsSWRdXG4gICAgICBpZiAoIXByb2MpIHtcbiAgICAgICAgcHJvYyA9IHByb2dyYW0uYmF0Y2hDYWNoZVtjYWxsSWRdID0gY29tcGlsZUJhdGNoKFxuICAgICAgICAgIHByb2dyYW0sIGR5bmFtaWNPcHRpb25zLCBkeW5hbWljVW5pZm9ybXMsIGR5bmFtaWNBdHRyaWJ1dGVzLFxuICAgICAgICAgIHN0YXRpY09wdGlvbnMpXG4gICAgICB9XG4gICAgICByZXR1cm4gcHJvYyhjb3VudCwgYXJncylcbiAgICB9KVxuICAgIGJhdGNoKFxuICAgICAgJ2lmKCcsIENVUl9TSEFERVIsICcpeycsXG4gICAgICBHTF9QT0xMLCAnKCk7JyxcbiAgICAgIEVYRUNfQkFUQ0gsICcoJyxcbiAgICAgIENVUl9TSEFERVIsICcsJyxcbiAgICAgIGJhdGNoLmFyZygpLCAnLCcsXG4gICAgICBiYXRjaC5hcmcoKSwgJyk7JylcbiAgICAvLyBTZXQgZGlydHkgb24gYWxsIGR5bmFtaWMgZmxhZ3NcbiAgICBPYmplY3Qua2V5cyhkeW5hbWljT3B0aW9ucykuZm9yRWFjaChmdW5jdGlvbiAob3B0aW9uKSB7XG4gICAgICB2YXIgU1RBVEUgPSBDT05URVhUX1NUQVRFW29wdGlvbl1cbiAgICAgIGlmIChTVEFURSkge1xuICAgICAgICBiYXRjaChTVEFURSwgJy5zZXREaXJ0eSgpOycpXG4gICAgICB9XG4gICAgfSlcbiAgICBiYXRjaCgnfScsIGV4aXQpXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gZXZhbCBhbmQgYmluZFxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICByZXR1cm4gZW52LmNvbXBpbGUoKVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBkcmF3OiBjb21waWxlU2hhZGVyRHJhdyxcbiAgICBjb21tYW5kOiBjb21waWxlQ29tbWFuZFxuICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gIFwiW29iamVjdCBJbnQ4QXJyYXldXCI6IDUxMjBcbiwgXCJbb2JqZWN0IEludDE2QXJyYXldXCI6IDUxMjJcbiwgXCJbb2JqZWN0IEludDMyQXJyYXldXCI6IDUxMjRcbiwgXCJbb2JqZWN0IFVpbnQ4QXJyYXldXCI6IDUxMjFcbiwgXCJbb2JqZWN0IFVpbnQ4Q2xhbXBlZEFycmF5XVwiOiA1MTIxXG4sIFwiW29iamVjdCBVaW50MTZBcnJheV1cIjogNTEyM1xuLCBcIltvYmplY3QgVWludDMyQXJyYXldXCI6IDUxMjVcbiwgXCJbb2JqZWN0IEZsb2F0MzJBcnJheV1cIjogNTEyNlxuLCBcIltvYmplY3QgRmxvYXQ2NEFycmF5XVwiOiA1MTIxXG4sIFwiW29iamVjdCBBcnJheUJ1ZmZlcl1cIjogNTEyMVxufVxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICBcImludDhcIjogNTEyMFxuLCBcImludDE2XCI6IDUxMjJcbiwgXCJpbnQzMlwiOiA1MTI0XG4sIFwidWludDhcIjogNTEyMVxuLCBcInVpbnQxNlwiOiA1MTIzXG4sIFwidWludDMyXCI6IDUxMjVcbiwgXCJmbG9hdFwiOiA1MTI2XG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gIFwicG9pbnRzXCI6IDAsXG4gIFwibGluZXNcIjogMSxcbiAgXCJsaW5lIGxvb3BcIjogMixcbiAgXCJsaW5lIHN0cmlwXCI6IDMsXG4gIFwidHJpYW5nbGVzXCI6IDQsXG4gIFwidHJpYW5nbGUgc3RyaXBcIjogNSxcbiAgXCJ0cmlhbmdsZSBmYW5cIjogNlxufVxuIiwiLy8gQ29udGV4dCBhbmQgY2FudmFzIGNyZWF0aW9uIGhlbHBlciBmdW5jdGlvbnNcbi8qZ2xvYmFscyBIVE1MRWxlbWVudCxXZWJHTFJlbmRlcmluZ0NvbnRleHQqL1xuXG5cbnZhciBleHRlbmQgPSByZXF1aXJlKCcuL2V4dGVuZCcpXG5cbmZ1bmN0aW9uIGNyZWF0ZUNhbnZhcyAoZWxlbWVudCwgb3B0aW9ucykge1xuICB2YXIgY2FudmFzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJylcbiAgdmFyIGFyZ3MgPSBnZXRDb250ZXh0KGNhbnZhcywgb3B0aW9ucylcblxuICBleHRlbmQoY2FudmFzLnN0eWxlLCB7XG4gICAgYm9yZGVyOiAwLFxuICAgIG1hcmdpbjogMCxcbiAgICBwYWRkaW5nOiAwLFxuICAgIHRvcDogMCxcbiAgICBsZWZ0OiAwXG4gIH0pXG4gIGVsZW1lbnQuYXBwZW5kQ2hpbGQoY2FudmFzKVxuXG4gIGlmIChlbGVtZW50ID09PSBkb2N1bWVudC5ib2R5KSB7XG4gICAgY2FudmFzLnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJ1xuICAgIGV4dGVuZChlbGVtZW50LnN0eWxlLCB7XG4gICAgICBtYXJnaW46IDAsXG4gICAgICBwYWRkaW5nOiAwXG4gICAgfSlcbiAgfVxuXG4gIHZhciBzY2FsZSA9ICthcmdzLm9wdGlvbnMucGl4ZWxSYXRpb1xuICBmdW5jdGlvbiByZXNpemUgKCkge1xuICAgIHZhciB3ID0gd2luZG93LmlubmVyV2lkdGhcbiAgICB2YXIgaCA9IHdpbmRvdy5pbm5lckhlaWdodFxuICAgIGlmIChlbGVtZW50ICE9PSBkb2N1bWVudC5ib2R5KSB7XG4gICAgICB2YXIgYm91bmRzID0gZWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKVxuICAgICAgdyA9IGJvdW5kcy5yaWdodCAtIGJvdW5kcy5sZWZ0XG4gICAgICBoID0gYm91bmRzLnRvcCAtIGJvdW5kcy5ib3R0b21cbiAgICB9XG4gICAgY2FudmFzLndpZHRoID0gc2NhbGUgKiB3XG4gICAgY2FudmFzLmhlaWdodCA9IHNjYWxlICogaFxuICAgIGV4dGVuZChjYW52YXMuc3R5bGUsIHtcbiAgICAgIHdpZHRoOiB3ICsgJ3B4JyxcbiAgICAgIGhlaWdodDogaCArICdweCdcbiAgICB9KVxuICB9XG5cbiAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIHJlc2l6ZSwgZmFsc2UpXG5cbiAgdmFyIHByZXZEZXN0cm95ID0gYXJncy5vcHRpb25zLm9uRGVzdHJveVxuICBhcmdzLm9wdGlvbnMgPSBleHRlbmQoZXh0ZW5kKHt9LCBhcmdzLm9wdGlvbnMpLCB7XG4gICAgb25EZXN0cm95OiBmdW5jdGlvbiAoKSB7XG4gICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigncmVzaXplJywgcmVzaXplKVxuICAgICAgZWxlbWVudC5yZW1vdmVDaGlsZChjYW52YXMpXG4gICAgICBwcmV2RGVzdHJveSAmJiBwcmV2RGVzdHJveSgpXG4gICAgfVxuICB9KVxuXG4gIHJlc2l6ZSgpXG5cbiAgcmV0dXJuIGFyZ3Ncbn1cblxuZnVuY3Rpb24gZ2V0Q29udGV4dCAoY2FudmFzLCBvcHRpb25zKSB7XG4gIHZhciBnbE9wdGlvbnMgPSBvcHRpb25zLmdsT3B0aW9ucyB8fCB7fVxuXG4gIGZ1bmN0aW9uIGdldCAobmFtZSkge1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gY2FudmFzLmdldENvbnRleHQobmFtZSwgZ2xPcHRpb25zKVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuICB9XG5cbiAgdmFyIGdsID0gZ2V0KCd3ZWJnbCcpIHx8XG4gICAgICAgICAgIGdldCgnZXhwZXJpbWVudGFsLXdlYmdsJykgfHxcbiAgICAgICAgICAgZ2V0KCd3ZWJnbC1leHBlcmltZW50YWwnKVxuXG4gIFxuXG4gIHJldHVybiB7XG4gICAgZ2w6IGdsLFxuICAgIG9wdGlvbnM6IGV4dGVuZCh7XG4gICAgICBwaXhlbFJhdGlvOiB3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpb1xuICAgIH0sIG9wdGlvbnMpXG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBwYXJzZUFyZ3MgKGFyZ3MpIHtcbiAgaWYgKHR5cGVvZiBkb2N1bWVudCA9PT0gJ3VuZGVmaW5lZCcgfHxcbiAgICAgIHR5cGVvZiBIVE1MRWxlbWVudCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICByZXR1cm4ge1xuICAgICAgZ2w6IGFyZ3NbMF0sXG4gICAgICBvcHRpb25zOiBhcmdzWzFdIHx8IHt9XG4gICAgfVxuICB9XG5cbiAgdmFyIGVsZW1lbnQgPSBkb2N1bWVudC5ib2R5XG4gIHZhciBvcHRpb25zID0gYXJnc1sxXSB8fCB7fVxuXG4gIGlmICh0eXBlb2YgYXJnc1swXSA9PT0gJ3N0cmluZycpIHtcbiAgICBlbGVtZW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihhcmdzWzBdKSB8fCBkb2N1bWVudC5ib2R5XG4gIH0gZWxzZSBpZiAodHlwZW9mIGFyZ3NbMF0gPT09ICdvYmplY3QnKSB7XG4gICAgaWYgKGFyZ3NbMF0gaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkge1xuICAgICAgZWxlbWVudCA9IGFyZ3NbMF1cbiAgICB9IGVsc2UgaWYgKGFyZ3NbMF0gaW5zdGFuY2VvZiBXZWJHTFJlbmRlcmluZ0NvbnRleHQpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGdsOiBhcmdzWzBdLFxuICAgICAgICBvcHRpb25zOiBleHRlbmQoe1xuICAgICAgICAgIHBpeGVsUmF0aW86IDFcbiAgICAgICAgfSwgb3B0aW9ucylcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgb3B0aW9ucyA9IGFyZ3NbMF1cbiAgICB9XG4gIH1cblxuICBpZiAoZWxlbWVudC5ub2RlTmFtZSAmJiBlbGVtZW50Lm5vZGVOYW1lLnRvVXBwZXJDYXNlKCkgPT09ICdDQU5WQVMnKSB7XG4gICAgcmV0dXJuIGdldENvbnRleHQoZWxlbWVudCwgb3B0aW9ucylcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gY3JlYXRlQ2FudmFzKGVsZW1lbnQsIG9wdGlvbnMpXG4gIH1cbn1cbiIsInZhciBHTF9UUklBTkdMRVMgPSA0XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcERyYXdTdGF0ZSAoZ2wpIHtcbiAgdmFyIHByaW1pdGl2ZSA9IFsgR0xfVFJJQU5HTEVTIF1cbiAgdmFyIGNvdW50ID0gWyAwIF1cbiAgdmFyIG9mZnNldCA9IFsgMCBdXG4gIHZhciBpbnN0YW5jZXMgPSBbIDAgXVxuXG4gIHJldHVybiB7XG4gICAgcHJpbWl0aXZlOiBwcmltaXRpdmUsXG4gICAgY291bnQ6IGNvdW50LFxuICAgIG9mZnNldDogb2Zmc2V0LFxuICAgIGluc3RhbmNlczogaW5zdGFuY2VzXG4gIH1cbn1cbiIsInZhciBWQVJJQUJMRV9DT1VOVEVSID0gMFxuXG5mdW5jdGlvbiBEeW5hbWljVmFyaWFibGUgKGlzRnVuYywgZGF0YSkge1xuICB0aGlzLmlkID0gKFZBUklBQkxFX0NPVU5URVIrKylcbiAgdGhpcy5mdW5jID0gaXNGdW5jXG4gIHRoaXMuZGF0YSA9IGRhdGFcbn1cblxuZnVuY3Rpb24gZGVmaW5lRHluYW1pYyAoZGF0YSwgcGF0aCkge1xuICBzd2l0Y2ggKHR5cGVvZiBkYXRhKSB7XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgcmV0dXJuIG5ldyBEeW5hbWljVmFyaWFibGUoZmFsc2UsIGRhdGEpXG4gICAgY2FzZSAnZnVuY3Rpb24nOlxuICAgICAgcmV0dXJuIG5ldyBEeW5hbWljVmFyaWFibGUodHJ1ZSwgZGF0YSlcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIGRlZmluZUR5bmFtaWNcbiAgfVxufVxuXG5mdW5jdGlvbiBpc0R5bmFtaWMgKHgpIHtcbiAgcmV0dXJuICh0eXBlb2YgeCA9PT0gJ2Z1bmN0aW9uJyAmJiAheC5fcmVnbFR5cGUpIHx8XG4gICAgICAgICB4IGluc3RhbmNlb2YgRHluYW1pY1ZhcmlhYmxlXG59XG5cbmZ1bmN0aW9uIHVuYm94ICh4LCBwYXRoKSB7XG4gIGlmICh4IGluc3RhbmNlb2YgRHluYW1pY1ZhcmlhYmxlKSB7XG4gICAgcmV0dXJuIHhcbiAgfSBlbHNlIGlmICh0eXBlb2YgeCA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgICAgICAgIHggIT09IGRlZmluZUR5bmFtaWMpIHtcbiAgICByZXR1cm4gbmV3IER5bmFtaWNWYXJpYWJsZSh0cnVlLCB4KVxuICB9XG4gIHJldHVybiBuZXcgRHluYW1pY1ZhcmlhYmxlKGZhbHNlLCBwYXRoKVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgZGVmaW5lOiBkZWZpbmVEeW5hbWljLFxuICBpc0R5bmFtaWM6IGlzRHluYW1pYyxcbiAgdW5ib3g6IHVuYm94XG59XG4iLCJcbnZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL2lzLXR5cGVkLWFycmF5JylcbnZhciBpc05EQXJyYXlMaWtlID0gcmVxdWlyZSgnLi9pcy1uZGFycmF5JylcbnZhciBwcmltVHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9wcmltaXRpdmVzLmpzb24nKVxuXG52YXIgR0xfUE9JTlRTID0gMFxudmFyIEdMX0xJTkVTID0gMVxudmFyIEdMX1RSSUFOR0xFUyA9IDRcblxudmFyIEdMX0JZVEUgPSA1MTIwXG52YXIgR0xfVU5TSUdORURfQllURSA9IDUxMjFcbnZhciBHTF9TSE9SVCA9IDUxMjJcbnZhciBHTF9VTlNJR05FRF9TSE9SVCA9IDUxMjNcbnZhciBHTF9JTlQgPSA1MTI0XG52YXIgR0xfVU5TSUdORURfSU5UID0gNTEyNVxuXG52YXIgR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIgPSAzNDk2M1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBFbGVtZW50c1N0YXRlIChnbCwgZXh0ZW5zaW9ucywgYnVmZmVyU3RhdGUpIHtcbiAgdmFyIGVsZW1lbnRzID0gWyBudWxsIF1cblxuICBmdW5jdGlvbiBSRUdMRWxlbWVudEJ1ZmZlciAoKSB7XG4gICAgdGhpcy5idWZmZXIgPSBudWxsXG4gICAgdGhpcy5wcmltVHlwZSA9IEdMX1RSSUFOR0xFU1xuICAgIHRoaXMudmVydENvdW50ID0gMFxuICAgIHRoaXMudHlwZSA9IDBcbiAgfVxuXG4gIFJFR0xFbGVtZW50QnVmZmVyLnByb3RvdHlwZS5iaW5kID0gZnVuY3Rpb24gKCkge1xuICAgIHRoaXMuYnVmZmVyLmJpbmQoKVxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlRWxlbWVudHMgKG9wdGlvbnMpIHtcbiAgICB2YXIgZWxlbWVudHMgPSBuZXcgUkVHTEVsZW1lbnRCdWZmZXIoKVxuICAgIHZhciBidWZmZXIgPSBidWZmZXJTdGF0ZS5jcmVhdGUobnVsbCwgR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIsIHRydWUpXG4gICAgZWxlbWVudHMuYnVmZmVyID0gYnVmZmVyLl9idWZmZXJcblxuICAgIGZ1bmN0aW9uIHJlZ2xFbGVtZW50cyAoaW5wdXQpIHtcbiAgICAgIHZhciBvcHRpb25zID0gaW5wdXRcbiAgICAgIHZhciBleHQzMmJpdCA9IGV4dGVuc2lvbnMub2VzX2VsZW1lbnRfaW5kZXhfdWludFxuXG4gICAgICAvLyBVcGxvYWQgZGF0YSB0byB2ZXJ0ZXggYnVmZmVyXG4gICAgICBpZiAoIW9wdGlvbnMpIHtcbiAgICAgICAgYnVmZmVyKClcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIG9wdGlvbnMgPT09ICdudW1iZXInKSB7XG4gICAgICAgIGJ1ZmZlcihvcHRpb25zKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIGRhdGEgPSBudWxsXG4gICAgICAgIHZhciB1c2FnZSA9ICdzdGF0aWMnXG4gICAgICAgIHZhciBieXRlTGVuZ3RoID0gMFxuICAgICAgICBpZiAoXG4gICAgICAgICAgQXJyYXkuaXNBcnJheShvcHRpb25zKSB8fFxuICAgICAgICAgIGlzVHlwZWRBcnJheShvcHRpb25zKSB8fFxuICAgICAgICAgIGlzTkRBcnJheUxpa2Uob3B0aW9ucykpIHtcbiAgICAgICAgICBkYXRhID0gb3B0aW9uc1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIFxuICAgICAgICAgIGlmICgnZGF0YScgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgZGF0YSA9IG9wdGlvbnMuZGF0YVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoJ3VzYWdlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICB1c2FnZSA9IG9wdGlvbnMudXNhZ2VcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCdsZW5ndGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGJ5dGVMZW5ndGggPSBvcHRpb25zLmxlbmd0aFxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShkYXRhKSB8fFxuICAgICAgICAgICAgKGlzTkRBcnJheUxpa2UoZGF0YSkgJiYgZGF0YS5kdHlwZSA9PT0gJ2FycmF5JykgfHxcbiAgICAgICAgICAgICd0eXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgYnVmZmVyKHtcbiAgICAgICAgICAgIHR5cGU6IG9wdGlvbnMudHlwZSB8fFxuICAgICAgICAgICAgICAoZXh0MzJiaXRcbiAgICAgICAgICAgICAgICA/ICd1aW50MzInXG4gICAgICAgICAgICAgICAgOiAndWludDE2JyksXG4gICAgICAgICAgICB1c2FnZTogdXNhZ2UsXG4gICAgICAgICAgICBkYXRhOiBkYXRhLFxuICAgICAgICAgICAgbGVuZ3RoOiBieXRlTGVuZ3RoXG4gICAgICAgICAgfSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBidWZmZXIoe1xuICAgICAgICAgICAgdXNhZ2U6IHVzYWdlLFxuICAgICAgICAgICAgZGF0YTogZGF0YSxcbiAgICAgICAgICAgIGxlbmd0aDogYnl0ZUxlbmd0aFxuICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YSkgfHwgaXNUeXBlZEFycmF5KGRhdGEpKSB7XG4gICAgICAgICAgYnVmZmVyLmRpbWVuc2lvbiA9IDNcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyB0cnkgdG8gZ3Vlc3MgZGVmYXVsdCBwcmltaXRpdmUgdHlwZSBhbmQgYXJndW1lbnRzXG4gICAgICB2YXIgdmVydENvdW50ID0gZWxlbWVudHMuYnVmZmVyLmJ5dGVMZW5ndGhcbiAgICAgIHZhciB0eXBlID0gMFxuICAgICAgc3dpdGNoIChlbGVtZW50cy5idWZmZXIuZHR5cGUpIHtcbiAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9CWVRFOlxuICAgICAgICBjYXNlIEdMX0JZVEU6XG4gICAgICAgICAgdHlwZSA9IEdMX1VOU0lHTkVEX0JZVEVcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlQ6XG4gICAgICAgIGNhc2UgR0xfU0hPUlQ6XG4gICAgICAgICAgdHlwZSA9IEdMX1VOU0lHTkVEX1NIT1JUXG4gICAgICAgICAgdmVydENvdW50ID4+PSAxXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX0lOVDpcbiAgICAgICAgY2FzZSBHTF9JTlQ6XG4gICAgICAgICAgXG4gICAgICAgICAgdHlwZSA9IEdMX1VOU0lHTkVEX0lOVFxuICAgICAgICAgIHZlcnRDb3VudCA+Pj0gMlxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICBcbiAgICAgIH1cblxuICAgICAgLy8gdHJ5IHRvIGd1ZXNzIHByaW1pdGl2ZSB0eXBlIGZyb20gY2VsbCBkaW1lbnNpb25cbiAgICAgIHZhciBwcmltVHlwZSA9IEdMX1RSSUFOR0xFU1xuICAgICAgdmFyIGRpbWVuc2lvbiA9IGVsZW1lbnRzLmJ1ZmZlci5kaW1lbnNpb25cbiAgICAgIGlmIChkaW1lbnNpb24gPT09IDEpIHByaW1UeXBlID0gR0xfUE9JTlRTXG4gICAgICBpZiAoZGltZW5zaW9uID09PSAyKSBwcmltVHlwZSA9IEdMX0xJTkVTXG4gICAgICBpZiAoZGltZW5zaW9uID09PSAzKSBwcmltVHlwZSA9IEdMX1RSSUFOR0xFU1xuXG4gICAgICAvLyBpZiBtYW51YWwgb3ZlcnJpZGUgcHJlc2VudCwgdXNlIHRoYXRcbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucyA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgaWYgKCdwcmltaXRpdmUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB2YXIgcHJpbWl0aXZlID0gb3B0aW9ucy5wcmltaXRpdmVcbiAgICAgICAgICBcbiAgICAgICAgICBwcmltVHlwZSA9IHByaW1UeXBlc1twcmltaXRpdmVdXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ2NvdW50JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgdmVydENvdW50ID0gb3B0aW9ucy52ZXJ0Q291bnQgfCAwXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gdXBkYXRlIHByb3BlcnRpZXMgZm9yIGVsZW1lbnQgYnVmZmVyXG4gICAgICBlbGVtZW50cy5wcmltVHlwZSA9IHByaW1UeXBlXG4gICAgICBlbGVtZW50cy52ZXJ0Q291bnQgPSB2ZXJ0Q291bnRcbiAgICAgIGVsZW1lbnRzLnR5cGUgPSB0eXBlXG5cbiAgICAgIHJldHVybiByZWdsRWxlbWVudHNcbiAgICB9XG5cbiAgICByZWdsRWxlbWVudHMob3B0aW9ucylcblxuICAgIHJlZ2xFbGVtZW50cy5fcmVnbFR5cGUgPSAnZWxlbWVudHMnXG4gICAgcmVnbEVsZW1lbnRzLl9lbGVtZW50cyA9IGVsZW1lbnRzXG4gICAgcmVnbEVsZW1lbnRzLmRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7XG4gICAgICBcbiAgICAgIGJ1ZmZlci5kZXN0cm95KClcbiAgICAgIGVsZW1lbnRzLmJ1ZmZlciA9IG51bGxcbiAgICB9XG5cbiAgICByZXR1cm4gcmVnbEVsZW1lbnRzXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNyZWF0ZTogY3JlYXRlRWxlbWVudHMsXG4gICAgZWxlbWVudHM6IGVsZW1lbnRzLFxuICAgIGdldEVsZW1lbnRzOiBmdW5jdGlvbiAoZWxlbWVudHMpIHtcbiAgICAgIGlmIChlbGVtZW50cyAmJiBlbGVtZW50cy5fZWxlbWVudHMgaW5zdGFuY2VvZiBSRUdMRWxlbWVudEJ1ZmZlcikge1xuICAgICAgICByZXR1cm4gZWxlbWVudHMuX2VsZW1lbnRzXG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cbiAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoYmFzZSwgb3B0cykge1xuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKG9wdHMpXG4gIGZvciAodmFyIGkgPSAwOyBpIDwga2V5cy5sZW5ndGg7ICsraSkge1xuICAgIGJhc2Vba2V5c1tpXV0gPSBvcHRzW2tleXNbaV1dXG4gIH1cbiAgcmV0dXJuIGJhc2Vcbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY3JlYXRlRXh0ZW5zaW9uQ2FjaGUgKGdsKSB7XG4gIHZhciBleHRlbnNpb25zID0ge31cblxuICBmdW5jdGlvbiByZWZyZXNoRXh0ZW5zaW9ucyAoKSB7XG4gICAgW1xuICAgICAgJ29lc190ZXh0dXJlX2Zsb2F0JyxcbiAgICAgICdvZXNfdGV4dHVyZV9mbG9hdF9saW5lYXInLFxuICAgICAgJ29lc190ZXh0dXJlX2hhbGZfZmxvYXQnLFxuICAgICAgJ29lc190ZXh0dXJlX2hhbGZfZmxvYXRfbGluZWFyJyxcbiAgICAgICdvZXNfc3RhbmRhcmRfZGVyaXZhdGl2ZXMnLFxuICAgICAgJ29lc19lbGVtZW50X2luZGV4X3VpbnQnLFxuICAgICAgJ29lc19mYm9fcmVuZGVyX21pcG1hcCcsXG5cbiAgICAgICd3ZWJnbF9kZXB0aF90ZXh0dXJlJyxcbiAgICAgICd3ZWJnbF9kcmF3X2J1ZmZlcnMnLFxuICAgICAgJ3dlYmdsX2NvbG9yX2J1ZmZlcl9mbG9hdCcsXG5cbiAgICAgICdleHRfdGV4dHVyZV9maWx0ZXJfYW5pc290cm9waWMnLFxuICAgICAgJ2V4dF9mcmFnX2RlcHRoJyxcbiAgICAgICdleHRfYmxlbmRfbWlubWF4JyxcbiAgICAgICdleHRfc2hhZGVyX3RleHR1cmVfbG9kJyxcbiAgICAgICdleHRfY29sb3JfYnVmZmVyX2hhbGZfZmxvYXQnLFxuICAgICAgJ2V4dF9zcmdiJyxcblxuICAgICAgJ2FuZ2xlX2luc3RhbmNlZF9hcnJheXMnLFxuXG4gICAgICAnd2ViZ2xfY29tcHJlc3NlZF90ZXh0dXJlX3MzdGMnLFxuICAgICAgJ3dlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9hdGMnLFxuICAgICAgJ3dlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9wdnJ0YycsXG4gICAgICAnd2ViZ2xfY29tcHJlc3NlZF90ZXh0dXJlX2V0YzEnXG4gICAgXS5mb3JFYWNoKGZ1bmN0aW9uIChleHQpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGV4dGVuc2lvbnNbZXh0XSA9IGdsLmdldEV4dGVuc2lvbihleHQpXG4gICAgICB9IGNhdGNoIChlKSB7fVxuICAgIH0pXG4gIH1cblxuICByZWZyZXNoRXh0ZW5zaW9ucygpXG5cbiAgcmV0dXJuIHtcbiAgICBleHRlbnNpb25zOiBleHRlbnNpb25zLFxuICAgIHJlZnJlc2g6IHJlZnJlc2hFeHRlbnNpb25zXG4gIH1cbn1cbiIsIlxudmFyIHZhbHVlcyA9IHJlcXVpcmUoJy4vdmFsdWVzJylcbnZhciBleHRlbmQgPSByZXF1aXJlKCcuL2V4dGVuZCcpXG5cbi8vIFdlIHN0b3JlIHRoZXNlIGNvbnN0YW50cyBzbyB0aGF0IHRoZSBtaW5pZmllciBjYW4gaW5saW5lIHRoZW1cbnZhciBHTF9GUkFNRUJVRkZFUiA9IDB4OEQ0MFxudmFyIEdMX1JFTkRFUkJVRkZFUiA9IDB4OEQ0MVxuXG52YXIgR0xfVEVYVFVSRV8yRCA9IDB4MERFMVxudmFyIEdMX1RFWFRVUkVfQ1VCRV9NQVAgPSAweDg1MTNcbnZhciBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1ggPSAweDg1MTVcblxudmFyIEdMX0NPTE9SX0FUVEFDSE1FTlQwID0gMHg4Q0UwXG52YXIgR0xfREVQVEhfQVRUQUNITUVOVCA9IDB4OEQwMFxudmFyIEdMX1NURU5DSUxfQVRUQUNITUVOVCA9IDB4OEQyMFxudmFyIEdMX0RFUFRIX1NURU5DSUxfQVRUQUNITUVOVCA9IDB4ODIxQVxuXG52YXIgR0xfVU5TSUdORURfQllURSA9IDB4MTQwMVxudmFyIEdMX0ZMT0FUID0gMHgxNDA2XG5cbnZhciBHTF9IQUxGX0ZMT0FUX09FUyA9IDB4OEQ2MVxuXG52YXIgR0xfQUxQSEEgPSAweDE5MDZcbnZhciBHTF9MVU1JTkFOQ0UgPSAweDE5MDlcbnZhciBHTF9MVU1JTkFOQ0VfQUxQSEEgPSAweDE5MEFcbnZhciBHTF9SR0IgPSAweDE5MDdcbnZhciBHTF9SR0JBID0gMHgxOTA4XG5cbnZhciBHTF9SR0JBNCA9IDB4ODA1NlxudmFyIEdMX1JHQjVfQTEgPSAweDgwNTdcbnZhciBHTF9SR0I1NjUgPSAweDhENjJcbnZhciBHTF9ERVBUSF9DT01QT05FTlQxNiA9IDB4ODFBNVxudmFyIEdMX1NURU5DSUxfSU5ERVg4ID0gMHg4RDQ4XG5cbnZhciBHTF9ERVBUSF9DT01QT05FTlQgPSAweDE5MDJcbnZhciBHTF9ERVBUSF9TVEVOQ0lMID0gMHg4NEY5XG5cbnZhciBHTF9TUkdCOF9BTFBIQThfRVhUID0gMHg4QzQzXG5cbnZhciBHTF9SR0JBMzJGX0VYVCA9IDB4ODgxNFxuXG52YXIgR0xfUkdCQTE2Rl9FWFQgPSAweDg4MUFcbnZhciBHTF9SR0IxNkZfRVhUID0gMHg4ODFCXG5cbnZhciBHTF9GUkFNRUJVRkZFUl9DT01QTEVURSA9IDB4OENENVxudmFyIEdMX0ZSQU1FQlVGRkVSX0lOQ09NUExFVEVfQVRUQUNITUVOVCA9IDB4OENENlxudmFyIEdMX0ZSQU1FQlVGRkVSX0lOQ09NUExFVEVfTUlTU0lOR19BVFRBQ0hNRU5UID0gMHg4Q0Q3XG52YXIgR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9ESU1FTlNJT05TID0gMHg4Q0Q5XG52YXIgR0xfRlJBTUVCVUZGRVJfVU5TVVBQT1JURUQgPSAweDhDRERcblxudmFyIEdMX0JBQ0sgPSAxMDI5XG5cbnZhciBCQUNLX0JVRkZFUiA9IFtHTF9CQUNLXVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBGQk9TdGF0ZSAoXG4gIGdsLFxuICBleHRlbnNpb25zLFxuICBsaW1pdHMsXG4gIHRleHR1cmVTdGF0ZSxcbiAgcmVuZGVyYnVmZmVyU3RhdGUpIHtcbiAgdmFyIHN0YXR1c0NvZGUgPSB7fVxuICBzdGF0dXNDb2RlW0dMX0ZSQU1FQlVGRkVSX0NPTVBMRVRFXSA9ICdjb21wbGV0ZSdcbiAgc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX0FUVEFDSE1FTlRdID0gJ2luY29tcGxldGUgYXR0YWNobWVudCdcbiAgc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX0RJTUVOU0lPTlNdID0gJ2luY29tcGxldGUgZGltZW5zaW9ucydcbiAgc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX01JU1NJTkdfQVRUQUNITUVOVF0gPSAnaW5jb21wbGV0ZSwgbWlzc2luZyBhdHRhY2htZW50J1xuICBzdGF0dXNDb2RlW0dMX0ZSQU1FQlVGRkVSX1VOU1VQUE9SVEVEXSA9ICd1bnN1cHBvcnRlZCdcblxuICB2YXIgY29sb3JUZXh0dXJlRm9ybWF0cyA9IHtcbiAgICAncmdiYSc6IEdMX1JHQkFcbiAgfVxuXG4gIHZhciBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHMgPSB7XG4gICAgJ3JnYmE0JzogR0xfUkdCQTQsXG4gICAgJ3JnYjU2NSc6IEdMX1JHQjU2NSxcbiAgICAncmdiNSBhMSc6IEdMX1JHQjVfQTFcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLmV4dF9zcmdiKSB7XG4gICAgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzWydzcmdiYSddID0gR0xfU1JHQjhfQUxQSEE4X0VYVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMuZXh0X2NvbG9yX2J1ZmZlcl9oYWxmX2Zsb2F0KSB7XG4gICAgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzWydyZ2JhMTZmJ10gPSBHTF9SR0JBMTZGX0VYVFxuICAgIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0c1sncmdiMTZmJ10gPSBHTF9SR0IxNkZfRVhUXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb2xvcl9idWZmZXJfZmxvYXQpIHtcbiAgICBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHNbJ3JnYmEzMmYnXSA9IEdMX1JHQkEzMkZfRVhUXG4gIH1cblxuICB2YXIgZGVwdGhSZW5kZXJidWZmZXJGb3JtYXRFbnVtcyA9IFtHTF9ERVBUSF9DT01QT05FTlQxNl1cbiAgdmFyIHN0ZW5jaWxSZW5kZXJidWZmZXJGb3JtYXRFbnVtcyA9IFtHTF9TVEVOQ0lMX0lOREVYOF1cbiAgdmFyIGRlcHRoU3RlbmNpbFJlbmRlcmJ1ZmZlckZvcm1hdEVudW1zID0gW0dMX0RFUFRIX1NURU5DSUxdXG5cbiAgdmFyIGRlcHRoVGV4dHVyZUZvcm1hdEVudW1zID0gW11cbiAgdmFyIHN0ZW5jaWxUZXh0dXJlRm9ybWF0RW51bXMgPSBbXVxuICB2YXIgZGVwdGhTdGVuY2lsVGV4dHVyZUZvcm1hdEVudW1zID0gW11cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9kZXB0aF90ZXh0dXJlKSB7XG4gICAgZGVwdGhUZXh0dXJlRm9ybWF0RW51bXMucHVzaChHTF9ERVBUSF9DT01QT05FTlQpXG4gICAgZGVwdGhTdGVuY2lsVGV4dHVyZUZvcm1hdEVudW1zLnB1c2goR0xfREVQVEhfU1RFTkNJTClcbiAgfVxuXG4gIHZhciBjb2xvckZvcm1hdHMgPSBleHRlbmQoZXh0ZW5kKHt9LFxuICAgIGNvbG9yVGV4dHVyZUZvcm1hdHMpLFxuICAgIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0cylcblxuICB2YXIgY29sb3JUZXh0dXJlRm9ybWF0RW51bXMgPSB2YWx1ZXMoY29sb3JUZXh0dXJlRm9ybWF0cylcbiAgdmFyIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0RW51bXMgPSB2YWx1ZXMoY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzKVxuXG4gIHZhciBoaWdoZXN0UHJlY2lzaW9uID0gR0xfVU5TSUdORURfQllURVxuICB2YXIgY29sb3JUeXBlcyA9IHtcbiAgICAndWludDgnOiBHTF9VTlNJR05FRF9CWVRFXG4gIH1cbiAgaWYgKGV4dGVuc2lvbnMub2VzX3RleHR1cmVfaGFsZl9mbG9hdCkge1xuICAgIGhpZ2hlc3RQcmVjaXNpb24gPSBjb2xvclR5cGVzWydoYWxmIGZsb2F0J10gPSBHTF9IQUxGX0ZMT0FUX09FU1xuICB9XG4gIGlmIChleHRlbnNpb25zLm9lc190ZXh0dXJlX2Zsb2F0KSB7XG4gICAgaGlnaGVzdFByZWNpc2lvbiA9IGNvbG9yVHlwZXMuZmxvYXQgPSBHTF9GTE9BVFxuICB9XG4gIGNvbG9yVHlwZXMuYmVzdCA9IGhpZ2hlc3RQcmVjaXNpb25cblxuICB2YXIgRFJBV19CVUZGRVJTID0gKGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgcmVzdWx0ID0gbmV3IEFycmF5KGxpbWl0cy5tYXhEcmF3YnVmZmVycylcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8PSBsaW1pdHMubWF4RHJhd2J1ZmZlcnM7ICsraSkge1xuICAgICAgdmFyIHJvdyA9IHJlc3VsdFtpXSA9IG5ldyBBcnJheShpKVxuICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBpOyArK2opIHtcbiAgICAgICAgcm93W2pdID0gR0xfQ09MT1JfQVRUQUNITUVOVDAgKyBqXG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHRcbiAgfSkoKVxuXG4gIGZ1bmN0aW9uIEZyYW1lYnVmZmVyQXR0YWNobWVudCAodGFyZ2V0LCBsZXZlbCwgdGV4dHVyZSwgcmVuZGVyYnVmZmVyKSB7XG4gICAgdGhpcy50YXJnZXQgPSB0YXJnZXRcbiAgICB0aGlzLmxldmVsID0gbGV2ZWxcbiAgICB0aGlzLnRleHR1cmUgPSB0ZXh0dXJlXG4gICAgdGhpcy5yZW5kZXJidWZmZXIgPSByZW5kZXJidWZmZXJcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlY1JlZiAoYXR0YWNobWVudCkge1xuICAgIGlmIChhdHRhY2htZW50KSB7XG4gICAgICBpZiAoYXR0YWNobWVudC50ZXh0dXJlKSB7XG4gICAgICAgIGF0dGFjaG1lbnQudGV4dHVyZS5fdGV4dHVyZS5kZWNSZWYoKVxuICAgICAgfVxuICAgICAgaWYgKGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyKSB7XG4gICAgICAgIGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXIuZGVjUmVmKClcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBjaGVja0Zvcm1hdCAoYXR0YWNobWVudCwgdGV4Rm9ybWF0cywgcmJGb3JtYXRzKSB7XG4gICAgaWYgKGF0dGFjaG1lbnQudGV4dHVyZSkge1xuICAgICAgXG4gICAgfSBlbHNlIHtcbiAgICAgIFxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGluY1JlZkFuZENoZWNrU2hhcGUgKGF0dGFjaG1lbnQsIGZyYW1lYnVmZmVyKSB7XG4gICAgdmFyIHdpZHRoID0gZnJhbWVidWZmZXIud2lkdGhcbiAgICB2YXIgaGVpZ2h0ID0gZnJhbWVidWZmZXIuaGVpZ2h0XG4gICAgaWYgKGF0dGFjaG1lbnQudGV4dHVyZSkge1xuICAgICAgdmFyIHRleHR1cmUgPSBhdHRhY2htZW50LnRleHR1cmUuX3RleHR1cmVcbiAgICAgIHZhciB0dyA9IE1hdGgubWF4KDEsIHRleHR1cmUucGFyYW1zLndpZHRoID4+IGF0dGFjaG1lbnQubGV2ZWwpXG4gICAgICB2YXIgdGggPSBNYXRoLm1heCgxLCB0ZXh0dXJlLnBhcmFtcy5oZWlnaHQgPj4gYXR0YWNobWVudC5sZXZlbClcbiAgICAgIHdpZHRoID0gd2lkdGggfHwgdHdcbiAgICAgIGhlaWdodCA9IGhlaWdodCB8fCB0aFxuICAgICAgXG4gICAgICBcbiAgICAgIHRleHR1cmUucmVmQ291bnQgKz0gMVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgcmVuZGVyYnVmZmVyID0gYXR0YWNobWVudC5yZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlclxuICAgICAgd2lkdGggPSB3aWR0aCB8fCByZW5kZXJidWZmZXIud2lkdGhcbiAgICAgIGhlaWdodCA9IGhlaWdodCB8fCByZW5kZXJidWZmZXIuaGVpZ2h0XG4gICAgICBcbiAgICAgIFxuICAgICAgcmVuZGVyYnVmZmVyLnJlZkNvdW50ICs9IDFcbiAgICB9XG4gICAgZnJhbWVidWZmZXIud2lkdGggPSB3aWR0aFxuICAgIGZyYW1lYnVmZmVyLmhlaWdodCA9IGhlaWdodFxuICB9XG5cbiAgZnVuY3Rpb24gYXR0YWNoIChsb2NhdGlvbiwgYXR0YWNobWVudCkge1xuICAgIGlmIChhdHRhY2htZW50KSB7XG4gICAgICBpZiAoYXR0YWNobWVudC50ZXh0dXJlKSB7XG4gICAgICAgIGdsLmZyYW1lYnVmZmVyVGV4dHVyZTJEKFxuICAgICAgICAgIEdMX0ZSQU1FQlVGRkVSLFxuICAgICAgICAgIGxvY2F0aW9uLFxuICAgICAgICAgIGF0dGFjaG1lbnQudGFyZ2V0LFxuICAgICAgICAgIGF0dGFjaG1lbnQudGV4dHVyZS5fdGV4dHVyZS50ZXh0dXJlLFxuICAgICAgICAgIGF0dGFjaG1lbnQubGV2ZWwpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBnbC5mcmFtZWJ1ZmZlclJlbmRlcmJ1ZmZlcihcbiAgICAgICAgICBHTF9GUkFNRUJVRkZFUixcbiAgICAgICAgICBsb2NhdGlvbixcbiAgICAgICAgICBHTF9SRU5ERVJCVUZGRVIsXG4gICAgICAgICAgYXR0YWNobWVudC5yZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlci5yZW5kZXJidWZmZXIpXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGdsLmZyYW1lYnVmZmVyVGV4dHVyZTJEKFxuICAgICAgICBHTF9GUkFNRUJVRkZFUixcbiAgICAgICAgbG9jYXRpb24sXG4gICAgICAgIEdMX1RFWFRVUkVfMkQsXG4gICAgICAgIG51bGwsXG4gICAgICAgIDApXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gdHJ5VXBkYXRlQXR0YWNobWVudCAoXG4gICAgYXR0YWNobWVudCxcbiAgICBpc1RleHR1cmUsXG4gICAgZm9ybWF0LFxuICAgIHR5cGUsXG4gICAgd2lkdGgsXG4gICAgaGVpZ2h0KSB7XG4gICAgaWYgKGF0dGFjaG1lbnQudGV4dHVyZSkge1xuICAgICAgdmFyIHRleHR1cmUgPSBhdHRhY2htZW50LnRleHR1cmVcbiAgICAgIGlmIChpc1RleHR1cmUpIHtcbiAgICAgICAgdGV4dHVyZSh7XG4gICAgICAgICAgZm9ybWF0OiBmb3JtYXQsXG4gICAgICAgICAgdHlwZTogdHlwZSxcbiAgICAgICAgICB3aWR0aDogd2lkdGgsXG4gICAgICAgICAgaGVpZ2h0OiBoZWlnaHRcbiAgICAgICAgfSlcbiAgICAgICAgdGV4dHVyZS5fdGV4dHVyZS5yZWZDb3VudCArPSAxXG4gICAgICAgIHJldHVybiB0cnVlXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciByZW5kZXJidWZmZXIgPSBhdHRhY2htZW50LnJlbmRlcmJ1ZmZlclxuICAgICAgaWYgKCFpc1RleHR1cmUpIHtcbiAgICAgICAgcmVuZGVyYnVmZmVyKHtcbiAgICAgICAgICBmb3JtYXQ6IGZvcm1hdCxcbiAgICAgICAgICB3aWR0aDogd2lkdGgsXG4gICAgICAgICAgaGVpZ2h0OiBoZWlnaHRcbiAgICAgICAgfSlcbiAgICAgICAgcmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXIucmVmQ291bnQgKz0gMVxuICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgfVxuICAgIH1cbiAgICBkZWNSZWYoYXR0YWNobWVudClcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlQXR0YWNobWVudCAoYXR0YWNobWVudCkge1xuICAgIHZhciB0YXJnZXQgPSBHTF9URVhUVVJFXzJEXG4gICAgdmFyIGxldmVsID0gMFxuICAgIHZhciB0ZXh0dXJlID0gbnVsbFxuICAgIHZhciByZW5kZXJidWZmZXIgPSBudWxsXG5cbiAgICB2YXIgZGF0YSA9IGF0dGFjaG1lbnRcbiAgICBpZiAodHlwZW9mIGF0dGFjaG1lbnQgPT09ICdvYmplY3QnKSB7XG4gICAgICBkYXRhID0gYXR0YWNobWVudC5kYXRhXG4gICAgICBpZiAoJ2xldmVsJyBpbiBhdHRhY2htZW50KSB7XG4gICAgICAgIGxldmVsID0gYXR0YWNobWVudC5sZXZlbCB8IDBcbiAgICAgIH1cbiAgICAgIGlmICgndGFyZ2V0JyBpbiBhdHRhY2htZW50KSB7XG4gICAgICAgIHRhcmdldCA9IGF0dGFjaG1lbnQudGFyZ2V0IHwgMFxuICAgICAgfVxuICAgIH1cblxuICAgIFxuXG4gICAgdmFyIHR5cGUgPSBhdHRhY2htZW50Ll9yZWdsVHlwZVxuICAgIGlmICh0eXBlID09PSAndGV4dHVyZScpIHtcbiAgICAgIHRleHR1cmUgPSBhdHRhY2htZW50XG4gICAgICBpZiAodGV4dHVyZS5fdGV4dHVyZS50YXJnZXQgPT09IEdMX1RFWFRVUkVfQ1VCRV9NQVApIHtcbiAgICAgICAgXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBcbiAgICAgIH1cbiAgICAgIC8vIFRPRE8gY2hlY2sgbWlwbGV2ZWwgaXMgY29uc2lzdGVudFxuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3JlbmRlcmJ1ZmZlcicpIHtcbiAgICAgIHJlbmRlcmJ1ZmZlciA9IGF0dGFjaG1lbnRcbiAgICAgIHRhcmdldCA9IEdMX1JFTkRFUkJVRkZFUlxuICAgICAgbGV2ZWwgPSAwXG4gICAgfSBlbHNlIHtcbiAgICAgIFxuICAgIH1cblxuICAgIHJldHVybiBuZXcgRnJhbWVidWZmZXJBdHRhY2htZW50KHRhcmdldCwgbGV2ZWwsIHRleHR1cmUsIHJlbmRlcmJ1ZmZlcilcbiAgfVxuXG4gIGZ1bmN0aW9uIHVud3JhcEF0dGFjaG1lbnQgKGF0dGFjaG1lbnQpIHtcbiAgICByZXR1cm4gYXR0YWNobWVudCAmJiAoYXR0YWNobWVudC50ZXh0dXJlIHx8IGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyKVxuICB9XG5cbiAgdmFyIGZyYW1lYnVmZmVyQ291bnQgPSAwXG4gIHZhciBmcmFtZWJ1ZmZlclNldCA9IHt9XG4gIHZhciBmcmFtZWJ1ZmZlclN0YWNrID0gW251bGxdXG4gIHZhciBmcmFtZWJ1ZmZlckRpcnR5ID0gdHJ1ZVxuXG4gIGZ1bmN0aW9uIFJFR0xGcmFtZWJ1ZmZlciAoKSB7XG4gICAgdGhpcy5pZCA9IGZyYW1lYnVmZmVyQ291bnQrK1xuICAgIGZyYW1lYnVmZmVyU2V0W3RoaXMuaWRdID0gdGhpc1xuXG4gICAgdGhpcy5mcmFtZWJ1ZmZlciA9IG51bGxcbiAgICB0aGlzLndpZHRoID0gMFxuICAgIHRoaXMuaGVpZ2h0ID0gMFxuXG4gICAgdGhpcy5jb2xvckF0dGFjaG1lbnRzID0gW11cbiAgICB0aGlzLmRlcHRoQXR0YWNobWVudCA9IG51bGxcbiAgICB0aGlzLnN0ZW5jaWxBdHRhY2htZW50ID0gbnVsbFxuICAgIHRoaXMuZGVwdGhTdGVuY2lsQXR0YWNobWVudCA9IG51bGxcblxuICAgIHRoaXMub3duc0NvbG9yID0gZmFsc2VcbiAgICB0aGlzLm93bnNEZXB0aFN0ZW5jaWwgPSBmYWxzZVxuICB9XG5cbiAgZnVuY3Rpb24gcmVmcmVzaCAoZnJhbWVidWZmZXIpIHtcbiAgICBpZiAoIWdsLmlzRnJhbWVidWZmZXIoZnJhbWVidWZmZXIuZnJhbWVidWZmZXIpKSB7XG4gICAgICBmcmFtZWJ1ZmZlci5mcmFtZWJ1ZmZlciA9IGdsLmNyZWF0ZUZyYW1lYnVmZmVyKClcbiAgICB9XG4gICAgZnJhbWVidWZmZXJEaXJ0eSA9IHRydWVcbiAgICBnbC5iaW5kRnJhbWVidWZmZXIoR0xfRlJBTUVCVUZGRVIsIGZyYW1lYnVmZmVyLmZyYW1lYnVmZmVyKVxuXG4gICAgdmFyIGNvbG9yQXR0YWNobWVudHMgPSBmcmFtZWJ1ZmZlci5jb2xvckF0dGFjaG1lbnRzXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjb2xvckF0dGFjaG1lbnRzLmxlbmd0aDsgKytpKSB7XG4gICAgICBhdHRhY2goR0xfQ09MT1JfQVRUQUNITUVOVDAgKyBpLCBjb2xvckF0dGFjaG1lbnRzW2ldKVxuICAgIH1cbiAgICBmb3IgKGkgPSBjb2xvckF0dGFjaG1lbnRzLmxlbmd0aDsgaSA8IGxpbWl0cy5tYXhDb2xvckF0dGFjaG1lbnRzOyArK2kpIHtcbiAgICAgIGF0dGFjaChHTF9DT0xPUl9BVFRBQ0hNRU5UMCArIGksIG51bGwpXG4gICAgfVxuICAgIGF0dGFjaChHTF9ERVBUSF9BVFRBQ0hNRU5ULCBmcmFtZWJ1ZmZlci5kZXB0aEF0dGFjaG1lbnQpXG4gICAgYXR0YWNoKEdMX1NURU5DSUxfQVRUQUNITUVOVCwgZnJhbWVidWZmZXIuc3RlbmNpbEF0dGFjaG1lbnQpXG4gICAgYXR0YWNoKEdMX0RFUFRIX1NURU5DSUxfQVRUQUNITUVOVCwgZnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsQXR0YWNobWVudClcblxuICAgIGlmIChleHRlbnNpb25zLndlYmdsX2RyYXdfYnVmZmVycykge1xuICAgICAgZXh0ZW5zaW9ucy53ZWJnbF9kcmF3X2J1ZmZlcnMuZHJhd0J1ZmZlcnNXRUJHTChcbiAgICAgICAgRFJBV19CVUZGRVJTW2NvbG9yQXR0YWNobWVudHMubGVuZ3RoXSlcbiAgICB9XG5cbiAgICAvLyBDaGVjayBzdGF0dXMgY29kZVxuICAgIHZhciBzdGF0dXMgPSBnbC5jaGVja0ZyYW1lYnVmZmVyU3RhdHVzKEdMX0ZSQU1FQlVGRkVSKVxuICAgIGlmIChzdGF0dXMgIT09IEdMX0ZSQU1FQlVGRkVSX0NPTVBMRVRFKSB7XG4gICAgICBcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBkZWNGQk9SZWZzIChmcmFtZWJ1ZmZlcikge1xuICAgIGZyYW1lYnVmZmVyLmNvbG9yQXR0YWNobWVudHMuZm9yRWFjaChkZWNSZWYpXG4gICAgZGVjUmVmKGZyYW1lYnVmZmVyLmRlcHRoQXR0YWNobWVudClcbiAgICBkZWNSZWYoZnJhbWVidWZmZXIuc3RlbmNpbEF0dGFjaG1lbnQpXG4gICAgZGVjUmVmKGZyYW1lYnVmZmVyLmRlcHRoU3RlbmNpbEF0dGFjaG1lbnQpXG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95IChmcmFtZWJ1ZmZlcikge1xuICAgIHZhciBoYW5kbGUgPSBmcmFtZWJ1ZmZlci5mcmFtZWJ1ZmZlclxuICAgIFxuICAgIGlmIChnbC5pc0ZyYW1lYnVmZmVyKGhhbmRsZSkpIHtcbiAgICAgIGdsLmRlbGV0ZUZyYW1lYnVmZmVyKGhhbmRsZSlcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBjcmVhdGVGQk8gKG9wdGlvbnMpIHtcbiAgICB2YXIgZnJhbWVidWZmZXIgPSBuZXcgUkVHTEZyYW1lYnVmZmVyKClcblxuICAgIGZ1bmN0aW9uIHJlZ2xGcmFtZWJ1ZmZlciAoaW5wdXQpIHtcbiAgICAgIHZhciBpXG4gICAgICB2YXIgb3B0aW9ucyA9IGlucHV0IHx8IHt9XG5cbiAgICAgIHZhciBleHREcmF3QnVmZmVycyA9IGV4dGVuc2lvbnMud2ViZ2xfZHJhd19idWZmZXJzXG5cbiAgICAgIHZhciB3aWR0aCA9IDBcbiAgICAgIHZhciBoZWlnaHQgPSAwXG4gICAgICBpZiAoJ3NoYXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBzaGFwZSA9IG9wdGlvbnMuc2hhcGVcbiAgICAgICAgXG4gICAgICAgIHdpZHRoID0gc2hhcGVbMF1cbiAgICAgICAgaGVpZ2h0ID0gc2hhcGVbMV1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmICgncmFkaXVzJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgd2lkdGggPSBoZWlnaHQgPSBvcHRpb25zLnJhZGl1c1xuICAgICAgICB9XG4gICAgICAgIGlmICgnd2lkdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB3aWR0aCA9IG9wdGlvbnMud2lkdGhcbiAgICAgICAgfVxuICAgICAgICBpZiAoJ2hlaWdodCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGhlaWdodCA9IG9wdGlvbnMuaGVpZ2h0XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gY29sb3JUeXBlLCBudW1Db2xvcnNcbiAgICAgIHZhciBjb2xvckJ1ZmZlcnMgPSBudWxsXG4gICAgICB2YXIgb3duc0NvbG9yID0gZmFsc2VcbiAgICAgIGlmICgnY29sb3JCdWZmZXJzJyBpbiBvcHRpb25zIHx8ICdjb2xvckJ1ZmZlcicgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgY29sb3JJbnB1dHMgPSBvcHRpb25zLmNvbG9yQnVmZmVycyB8fCBvcHRpb25zLmNvbG9yQnVmZmVyXG4gICAgICAgIGlmICghQXJyYXkuaXNBcnJheShjb2xvcklucHV0cykpIHtcbiAgICAgICAgICBjb2xvcklucHV0cyA9IFtjb2xvcklucHV0c11cbiAgICAgICAgfVxuXG4gICAgICAgIGZyYW1lYnVmZmVyLndpZHRoID0gd2lkdGhcbiAgICAgICAgZnJhbWVidWZmZXIuaGVpZ2h0ID0gaGVpZ2h0XG5cbiAgICAgICAgaWYgKGNvbG9ySW5wdXRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICBcbiAgICAgICAgfVxuICAgICAgICBcblxuICAgICAgICAvLyBXcmFwIGNvbG9yIGF0dGFjaG1lbnRzXG4gICAgICAgIGNvbG9yQnVmZmVycyA9IGNvbG9ySW5wdXRzLm1hcChwYXJzZUF0dGFjaG1lbnQpXG5cbiAgICAgICAgLy8gQ2hlY2sgaGVhZCBub2RlXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xvckJ1ZmZlcnMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICB2YXIgY29sb3JBdHRhY2htZW50ID0gY29sb3JCdWZmZXJzW2ldXG4gICAgICAgICAgY2hlY2tGb3JtYXQoXG4gICAgICAgICAgICBjb2xvckF0dGFjaG1lbnQsXG4gICAgICAgICAgICBjb2xvclRleHR1cmVGb3JtYXRFbnVtcyxcbiAgICAgICAgICAgIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0RW51bXMpXG4gICAgICAgICAgaW5jUmVmQW5kQ2hlY2tTaGFwZShcbiAgICAgICAgICAgIGNvbG9yQXR0YWNobWVudCxcbiAgICAgICAgICAgIGZyYW1lYnVmZmVyKVxuICAgICAgICB9XG5cbiAgICAgICAgd2lkdGggPSBmcmFtZWJ1ZmZlci53aWR0aFxuICAgICAgICBoZWlnaHQgPSBmcmFtZWJ1ZmZlci5oZWlnaHRcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBjb2xvclRleHR1cmUgPSB0cnVlXG4gICAgICAgIHZhciBjb2xvckZvcm1hdCA9ICdyZ2JhJ1xuICAgICAgICB2YXIgY29sb3JUeXBlID0gJ3VpbnQ4J1xuICAgICAgICB2YXIgY29sb3JDb3VudCA9IDFcbiAgICAgICAgb3duc0NvbG9yID0gdHJ1ZVxuXG4gICAgICAgIGZyYW1lYnVmZmVyLndpZHRoID0gd2lkdGggfHwgZ2wuZHJhd2luZ0J1ZmZlcldpZHRoXG4gICAgICAgIGZyYW1lYnVmZmVyLmhlaWdodCA9IGhlaWdodCB8fCBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0XG5cbiAgICAgICAgaWYgKCdmb3JtYXQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBjb2xvckZvcm1hdCA9IG9wdGlvbnMuZm9ybWF0XG4gICAgICAgICAgXG4gICAgICAgICAgY29sb3JUZXh0dXJlID0gY29sb3JGb3JtYXQgaW4gY29sb3JUZXh0dXJlRm9ybWF0c1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCd0eXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgXG4gICAgICAgICAgY29sb3JUeXBlID0gb3B0aW9ucy50eXBlXG4gICAgICAgICAgXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ2NvbG9yQ291bnQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBjb2xvckNvdW50ID0gb3B0aW9ucy5jb2xvckNvdW50IHwgMFxuICAgICAgICAgIFxuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmV1c2UgY29sb3IgYnVmZmVyIGFycmF5IGlmIHdlIG93biBpdFxuICAgICAgICBpZiAoZnJhbWVidWZmZXIub3duc0NvbG9yKSB7XG4gICAgICAgICAgY29sb3JCdWZmZXJzID0gZnJhbWVidWZmZXIuY29sb3JBdHRhY2htZW50c1xuICAgICAgICAgIHdoaWxlIChjb2xvckJ1ZmZlcnMubGVuZ3RoID4gY29sb3JDb3VudCkge1xuICAgICAgICAgICAgZGVjUmVmKGNvbG9yQnVmZmVycy5wb3AoKSlcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29sb3JCdWZmZXJzID0gW11cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHVwZGF0ZSBidWZmZXJzIGluIHBsYWNlLCByZW1vdmUgaW5jb21wYXRpYmxlIGJ1ZmZlcnNcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGNvbG9yQnVmZmVycy5sZW5ndGg7ICsraSkge1xuICAgICAgICAgIGlmICghdHJ5VXBkYXRlQXR0YWNobWVudChcbiAgICAgICAgICAgICAgY29sb3JCdWZmZXJzW2ldLFxuICAgICAgICAgICAgICBjb2xvclRleHR1cmUsXG4gICAgICAgICAgICAgIGNvbG9yRm9ybWF0LFxuICAgICAgICAgICAgICBjb2xvclR5cGUsXG4gICAgICAgICAgICAgIHdpZHRoLFxuICAgICAgICAgICAgICBoZWlnaHQpKSB7XG4gICAgICAgICAgICBjb2xvckJ1ZmZlcnNbaS0tXSA9IGNvbG9yQnVmZmVyc1tjb2xvckJ1ZmZlcnMubGVuZ3RoIC0gMV1cbiAgICAgICAgICAgIGNvbG9yQnVmZmVycy5wb3AoKVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFRoZW4gYXBwZW5kIG5ldyBidWZmZXJzXG4gICAgICAgIHdoaWxlIChjb2xvckJ1ZmZlcnMubGVuZ3RoIDwgY29sb3JDb3VudCkge1xuICAgICAgICAgIGlmIChjb2xvclRleHR1cmUpIHtcbiAgICAgICAgICAgIGNvbG9yQnVmZmVycy5wdXNoKG5ldyBGcmFtZWJ1ZmZlckF0dGFjaG1lbnQoXG4gICAgICAgICAgICAgIEdMX1RFWFRVUkVfMkQsXG4gICAgICAgICAgICAgIDAsXG4gICAgICAgICAgICAgIHRleHR1cmVTdGF0ZS5jcmVhdGUoe1xuICAgICAgICAgICAgICAgIGZvcm1hdDogY29sb3JGb3JtYXQsXG4gICAgICAgICAgICAgICAgdHlwZTogY29sb3JUeXBlLFxuICAgICAgICAgICAgICAgIHdpZHRoOiB3aWR0aCxcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IGhlaWdodFxuICAgICAgICAgICAgICB9LCBHTF9URVhUVVJFXzJEKSxcbiAgICAgICAgICAgICAgbnVsbCkpXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbG9yQnVmZmVycy5wdXNoKG5ldyBGcmFtZWJ1ZmZlckF0dGFjaG1lbnQoXG4gICAgICAgICAgICAgIEdMX1JFTkRFUkJVRkZFUixcbiAgICAgICAgICAgICAgMCxcbiAgICAgICAgICAgICAgbnVsbCxcbiAgICAgICAgICAgICAgcmVuZGVyYnVmZmVyU3RhdGUuY3JlYXRlKHtcbiAgICAgICAgICAgICAgICBmb3JtYXQ6IGNvbG9yRm9ybWF0LFxuICAgICAgICAgICAgICAgIHdpZHRoOiB3aWR0aCxcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IGhlaWdodFxuICAgICAgICAgICAgICB9KSkpXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIFxuXG4gICAgICBmcmFtZWJ1ZmZlci53aWR0aCA9IHdpZHRoXG4gICAgICBmcmFtZWJ1ZmZlci5oZWlnaHQgPSBoZWlnaHRcblxuICAgICAgdmFyIGRlcHRoQnVmZmVyID0gbnVsbFxuICAgICAgdmFyIHN0ZW5jaWxCdWZmZXIgPSBudWxsXG4gICAgICB2YXIgZGVwdGhTdGVuY2lsQnVmZmVyID0gbnVsbFxuICAgICAgdmFyIG93bnNEZXB0aFN0ZW5jaWwgPSBmYWxzZVxuICAgICAgdmFyIGRlcHRoU3RlbmNpbENvdW50ID0gMFxuXG4gICAgICBpZiAoJ2RlcHRoQnVmZmVyJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIGRlcHRoQnVmZmVyID0gcGFyc2VBdHRhY2htZW50KG9wdGlvbnMuZGVwdGhCdWZmZXIpXG4gICAgICAgIGNoZWNrRm9ybWF0KFxuICAgICAgICAgIGRlcHRoQnVmZmVyLFxuICAgICAgICAgIGRlcHRoVGV4dHVyZUZvcm1hdEVudW1zLFxuICAgICAgICAgIGRlcHRoUmVuZGVyYnVmZmVyRm9ybWF0RW51bXMpXG4gICAgICAgIGRlcHRoU3RlbmNpbENvdW50ICs9IDFcbiAgICAgIH1cbiAgICAgIGlmICgnc3RlbmNpbEJ1ZmZlcicgaW4gb3B0aW9ucykge1xuICAgICAgICBzdGVuY2lsQnVmZmVyID0gcGFyc2VBdHRhY2htZW50KG9wdGlvbnMuc3RlbmNpbEJ1ZmZlcilcbiAgICAgICAgY2hlY2tGb3JtYXQoXG4gICAgICAgICAgc3RlbmNpbEJ1ZmZlcixcbiAgICAgICAgICBzdGVuY2lsVGV4dHVyZUZvcm1hdEVudW1zLFxuICAgICAgICAgIHN0ZW5jaWxSZW5kZXJidWZmZXJGb3JtYXRFbnVtcylcbiAgICAgICAgZGVwdGhTdGVuY2lsQ291bnQgKz0gMVxuICAgICAgfVxuICAgICAgaWYgKCdkZXB0aFN0ZW5jaWxCdWZmZXInIGluIG9wdGlvbnMpIHtcbiAgICAgICAgZGVwdGhTdGVuY2lsQnVmZmVyID0gcGFyc2VBdHRhY2htZW50KG9wdGlvbnMuZGVwdGhTdGVuY2lsQnVmZmVyKVxuICAgICAgICBjaGVja0Zvcm1hdChcbiAgICAgICAgICBkZXB0aFN0ZW5jaWxCdWZmZXIsXG4gICAgICAgICAgZGVwdGhTdGVuY2lsVGV4dHVyZUZvcm1hdEVudW1zLFxuICAgICAgICAgIGRlcHRoU3RlbmNpbFJlbmRlcmJ1ZmZlckZvcm1hdEVudW1zKVxuICAgICAgICBkZXB0aFN0ZW5jaWxDb3VudCArPSAxXG4gICAgICB9XG5cbiAgICAgIGlmICghKGRlcHRoQnVmZmVyIHx8IHN0ZW5jaWxCdWZmZXIgfHwgZGVwdGhTdGVuY2lsQnVmZmVyKSkge1xuICAgICAgICB2YXIgZGVwdGggPSB0cnVlXG4gICAgICAgIHZhciBzdGVuY2lsID0gZmFsc2VcbiAgICAgICAgdmFyIHVzZVRleHR1cmUgPSBmYWxzZVxuXG4gICAgICAgIGlmICgnZGVwdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBkZXB0aCA9ICEhb3B0aW9ucy5kZXB0aFxuICAgICAgICB9XG4gICAgICAgIGlmICgnc3RlbmNpbCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHN0ZW5jaWwgPSAhIW9wdGlvbnMuc3RlbmNpbFxuICAgICAgICB9XG4gICAgICAgIGlmICgnZGVwdGhUZXh0dXJlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgdXNlVGV4dHVyZSA9ICEhb3B0aW9ucy5kZXB0aFRleHR1cmVcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBjdXJEZXB0aFN0ZW5jaWwgPVxuICAgICAgICAgIGZyYW1lYnVmZmVyLmRlcHRoQXR0YWNobWVudCB8fFxuICAgICAgICAgIGZyYW1lYnVmZmVyLnN0ZW5jaWxBdHRhY2htZW50IHx8XG4gICAgICAgICAgZnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsQXR0YWNobWVudFxuICAgICAgICB2YXIgbmV4dERlcHRoU3RlbmNpbCA9IG51bGxcblxuICAgICAgICBpZiAoZGVwdGggfHwgc3RlbmNpbCkge1xuICAgICAgICAgIG93bnNEZXB0aFN0ZW5jaWwgPSB0cnVlXG5cbiAgICAgICAgICBpZiAodXNlVGV4dHVyZSkge1xuICAgICAgICAgICAgXG4gICAgICAgICAgICB2YXIgZGVwdGhUZXh0dXJlRm9ybWF0XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIChzdGVuY2lsKSB7XG4gICAgICAgICAgICAgIGRlcHRoVGV4dHVyZUZvcm1hdCA9ICdkZXB0aCBzdGVuY2lsJ1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgZGVwdGhUZXh0dXJlRm9ybWF0ID0gJ2RlcHRoJ1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGZyYW1lYnVmZmVyLm93bnNEZXB0aFN0ZW5jaWwgJiYgY3VyRGVwdGhTdGVuY2lsLnRleHR1cmUpIHtcbiAgICAgICAgICAgICAgY3VyRGVwdGhTdGVuY2lsLnRleHR1cmUoe1xuICAgICAgICAgICAgICAgIGZvcm1hdDogZGVwdGhUZXh0dXJlRm9ybWF0LFxuICAgICAgICAgICAgICAgIHdpZHRoOiB3aWR0aCxcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IGhlaWdodFxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICBjdXJEZXB0aFN0ZW5jaWwudGV4dHVyZS5fdGV4dHVyZS5yZWZDb3VudCArPSAxXG4gICAgICAgICAgICAgIG5leHREZXB0aFN0ZW5jaWwgPSBjdXJEZXB0aFN0ZW5jaWxcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIG5leHREZXB0aFN0ZW5jaWwgPSBuZXcgRnJhbWVidWZmZXJBdHRhY2htZW50KFxuICAgICAgICAgICAgICAgIEdMX1RFWFRVUkVfMkQsXG4gICAgICAgICAgICAgICAgMCxcbiAgICAgICAgICAgICAgICB0ZXh0dXJlU3RhdGUuY3JlYXRlKHtcbiAgICAgICAgICAgICAgICAgIGZvcm1hdDogZGVwdGhUZXh0dXJlRm9ybWF0LFxuICAgICAgICAgICAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICAgICAgICAgICAgaGVpZ2h0OiBoZWlnaHRcbiAgICAgICAgICAgICAgICB9LCBHTF9URVhUVVJFXzJEKSxcbiAgICAgICAgICAgICAgICBudWxsKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgZGVwdGhSZW5kZXJidWZmZXJGb3JtYXRcbiAgICAgICAgICAgIGlmIChkZXB0aCkge1xuICAgICAgICAgICAgICBpZiAoc3RlbmNpbCkge1xuICAgICAgICAgICAgICAgIGRlcHRoUmVuZGVyYnVmZmVyRm9ybWF0ID0gJ2RlcHRoIHN0ZW5jaWwnXG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZGVwdGhSZW5kZXJidWZmZXJGb3JtYXQgPSAnZGVwdGgnXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGRlcHRoUmVuZGVyYnVmZmVyRm9ybWF0ID0gJ3N0ZW5jaWwnXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoZnJhbWVidWZmZXIub3duc0RlcHRoU3RlbmNpbCAmJiBjdXJEZXB0aFN0ZW5jaWwucmVuZGVyYnVmZmVyKSB7XG4gICAgICAgICAgICAgIGN1ckRlcHRoU3RlbmNpbC5yZW5kZXJidWZmZXIoe1xuICAgICAgICAgICAgICAgIGZvcm1hdDogZGVwdGhSZW5kZXJidWZmZXJGb3JtYXQsXG4gICAgICAgICAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICAgICAgICAgIGhlaWdodDogaGVpZ2h0XG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIGN1ckRlcHRoU3RlbmNpbC5yZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlci5yZWZDb3VudCArPSAxXG4gICAgICAgICAgICAgIG5leHREZXB0aFN0ZW5jaWwgPSBjdXJEZXB0aFN0ZW5jaWxcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIG5leHREZXB0aFN0ZW5jaWwgPSBuZXcgRnJhbWVidWZmZXJBdHRhY2htZW50KFxuICAgICAgICAgICAgICAgIEdMX1JFTkRFUkJVRkZFUixcbiAgICAgICAgICAgICAgICAwLFxuICAgICAgICAgICAgICAgIG51bGwsXG4gICAgICAgICAgICAgICAgcmVuZGVyYnVmZmVyU3RhdGUuY3JlYXRlKHtcbiAgICAgICAgICAgICAgICAgIGZvcm1hdDogZGVwdGhSZW5kZXJidWZmZXJGb3JtYXQsXG4gICAgICAgICAgICAgICAgICB3aWR0aDogd2lkdGgsXG4gICAgICAgICAgICAgICAgICBoZWlnaHQ6IGhlaWdodFxuICAgICAgICAgICAgICAgIH0pKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChkZXB0aCkge1xuICAgICAgICAgICAgaWYgKHN0ZW5jaWwpIHtcbiAgICAgICAgICAgICAgZGVwdGhTdGVuY2lsQnVmZmVyID0gbmV4dERlcHRoU3RlbmNpbFxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgZGVwdGhCdWZmZXIgPSBuZXh0RGVwdGhTdGVuY2lsXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHN0ZW5jaWxCdWZmZXIgPSBuZXh0RGVwdGhTdGVuY2lsXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBcblxuICAgICAgICBpbmNSZWZBbmRDaGVja1NoYXBlKFxuICAgICAgICAgIGRlcHRoQnVmZmVyIHx8XG4gICAgICAgICAgc3RlbmNpbEJ1ZmZlciB8fFxuICAgICAgICAgIGRlcHRoU3RlbmNpbEJ1ZmZlcixcbiAgICAgICAgICBmcmFtZWJ1ZmZlcilcbiAgICAgIH1cblxuICAgICAgZGVjRkJPUmVmcyhmcmFtZWJ1ZmZlcilcblxuICAgICAgZnJhbWVidWZmZXIuY29sb3JBdHRhY2htZW50cyA9IGNvbG9yQnVmZmVyc1xuICAgICAgZnJhbWVidWZmZXIuZGVwdGhBdHRhY2htZW50ID0gZGVwdGhCdWZmZXJcbiAgICAgIGZyYW1lYnVmZmVyLnN0ZW5jaWxBdHRhY2htZW50ID0gc3RlbmNpbEJ1ZmZlclxuICAgICAgZnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsQXR0YWNobWVudCA9IGRlcHRoU3RlbmNpbEJ1ZmZlclxuICAgICAgZnJhbWVidWZmZXIub3duc0NvbG9yID0gb3duc0NvbG9yXG4gICAgICBmcmFtZWJ1ZmZlci5vd25zRGVwdGhTdGVuY2lsID0gb3duc0RlcHRoU3RlbmNpbFxuXG4gICAgICByZWdsRnJhbWVidWZmZXIuY29sb3IgPSBjb2xvckJ1ZmZlcnMubWFwKHVud3JhcEF0dGFjaG1lbnQpXG4gICAgICByZWdsRnJhbWVidWZmZXIuZGVwdGggPSB1bndyYXBBdHRhY2htZW50KGRlcHRoQnVmZmVyKVxuICAgICAgcmVnbEZyYW1lYnVmZmVyLnN0ZW5jaWwgPSB1bndyYXBBdHRhY2htZW50KHN0ZW5jaWxCdWZmZXIpXG4gICAgICByZWdsRnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsID0gdW53cmFwQXR0YWNobWVudChkZXB0aFN0ZW5jaWxCdWZmZXIpXG5cbiAgICAgIHJlZnJlc2goZnJhbWVidWZmZXIpXG5cbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci53aWR0aCA9IGZyYW1lYnVmZmVyLndpZHRoXG4gICAgICByZWdsRnJhbWVidWZmZXIuaGVpZ2h0ID0gZnJhbWVidWZmZXIuaGVpZ2h0XG5cbiAgICAgIHJldHVybiByZWdsRnJhbWVidWZmZXJcbiAgICB9XG5cbiAgICByZWdsRnJhbWVidWZmZXIob3B0aW9ucylcblxuICAgIHJlZ2xGcmFtZWJ1ZmZlci5fcmVnbFR5cGUgPSAnZnJhbWVidWZmZXInXG4gICAgcmVnbEZyYW1lYnVmZmVyLl9mcmFtZWJ1ZmZlciA9IGZyYW1lYnVmZmVyXG4gICAgcmVnbEZyYW1lYnVmZmVyLl9kZXN0cm95ID0gZnVuY3Rpb24gKCkge1xuICAgICAgZGVzdHJveShmcmFtZWJ1ZmZlcilcbiAgICB9XG5cbiAgICByZXR1cm4gcmVnbEZyYW1lYnVmZmVyXG4gIH1cblxuICBmdW5jdGlvbiByZWZyZXNoQ2FjaGUgKCkge1xuICAgIHZhbHVlcyhmcmFtZWJ1ZmZlclNldCkuZm9yRWFjaChyZWZyZXNoKVxuICB9XG5cbiAgZnVuY3Rpb24gY2xlYXJDYWNoZSAoKSB7XG4gICAgdmFsdWVzKGZyYW1lYnVmZmVyU2V0KS5mb3JFYWNoKGRlc3Ryb3kpXG4gIH1cblxuICBmdW5jdGlvbiBwb2xsICgpIHtcbiAgICBpZiAoZnJhbWVidWZmZXJEaXJ0eSkge1xuICAgICAgdmFyIHRvcCA9IGZyYW1lYnVmZmVyU3RhY2tbZnJhbWVidWZmZXJTdGFjay5sZW5ndGggLSAxXVxuICAgICAgdmFyIGV4dF9kcmF3YnVmZmVycyA9IGV4dGVuc2lvbnMud2ViZ2xfZHJhd19idWZmZXJzXG5cbiAgICAgIGlmICh0b3ApIHtcbiAgICAgICAgZ2wuYmluZEZyYW1lYnVmZmVyKEdMX0ZSQU1FQlVGRkVSLCB0b3AuZnJhbWVidWZmZXIpXG4gICAgICAgIGlmIChleHRfZHJhd2J1ZmZlcnMpIHtcbiAgICAgICAgICBleHRfZHJhd2J1ZmZlcnMuZHJhd0J1ZmZlcnNXRUJHTChEUkFXX0JVRkZFUlNbdG9wLmNvbG9yQXR0YWNobWVudHMubGVuZ3RoXSlcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZ2wuYmluZEZyYW1lYnVmZmVyKEdMX0ZSQU1FQlVGRkVSLCBudWxsKVxuICAgICAgICBpZiAoZXh0X2RyYXdidWZmZXJzKSB7XG4gICAgICAgICAgZXh0X2RyYXdidWZmZXJzLmRyYXdCdWZmZXJzV0VCR0woQkFDS19CVUZGRVIpXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgZnJhbWVidWZmZXJEaXJ0eSA9IGZhbHNlXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gY3VycmVudEZyYW1lYnVmZmVyICgpIHtcbiAgICByZXR1cm4gZnJhbWVidWZmZXJTdGFja1tmcmFtZWJ1ZmZlclN0YWNrLmxlbmd0aCAtIDFdXG4gIH1cblxuICByZXR1cm4ge1xuICAgIHRvcDogY3VycmVudEZyYW1lYnVmZmVyLFxuICAgIGRpcnR5OiBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gZnJhbWVidWZmZXJEaXJ0eVxuICAgIH0sXG4gICAgcHVzaDogZnVuY3Rpb24gKG5leHRfKSB7XG4gICAgICB2YXIgbmV4dCA9IG5leHRfIHx8IG51bGxcbiAgICAgIGZyYW1lYnVmZmVyRGlydHkgPSBmcmFtZWJ1ZmZlckRpcnR5IHx8IChuZXh0ICE9PSBjdXJyZW50RnJhbWVidWZmZXIoKSlcbiAgICAgIGZyYW1lYnVmZmVyU3RhY2sucHVzaChuZXh0KVxuICAgICAgcmV0dXJuIGZyYW1lYnVmZmVyRGlydHlcbiAgICB9LFxuICAgIHBvcDogZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIHByZXYgPSBjdXJyZW50RnJhbWVidWZmZXIoKVxuICAgICAgZnJhbWVidWZmZXJTdGFjay5wb3AoKVxuICAgICAgZnJhbWVidWZmZXJEaXJ0eSA9IGZyYW1lYnVmZmVyRGlydHkgfHwgKHByZXYgIT09IGN1cnJlbnRGcmFtZWJ1ZmZlcigpKVxuICAgICAgcmV0dXJuIGZyYW1lYnVmZmVyRGlydHlcbiAgICB9LFxuICAgIGdldEZyYW1lYnVmZmVyOiBmdW5jdGlvbiAob2JqZWN0KSB7XG4gICAgICBpZiAodHlwZW9mIG9iamVjdCA9PT0gJ2Z1bmN0aW9uJyAmJiBvYmplY3QuX3JlZ2xUeXBlID09PSAnZnJhbWVidWZmZXInKSB7XG4gICAgICAgIHZhciBmYm8gPSBvYmplY3QuX2ZyYW1lYnVmZmVyXG4gICAgICAgIGlmIChmYm8gaW5zdGFuY2VvZiBSRUdMRnJhbWVidWZmZXIpIHtcbiAgICAgICAgICByZXR1cm4gZmJvXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsXG4gICAgfSxcbiAgICBwb2xsOiBwb2xsLFxuICAgIGNyZWF0ZTogY3JlYXRlRkJPLFxuICAgIGNsZWFyOiBjbGVhckNhY2hlLFxuICAgIHJlZnJlc2g6IHJlZnJlc2hDYWNoZVxuICB9XG59XG4iLCJ2YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi9pcy10eXBlZC1hcnJheScpXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaXNOREFycmF5TGlrZSAob2JqKSB7XG4gIHJldHVybiAoXG4gICAgdHlwZW9mIG9iaiA9PT0gJ29iamVjdCcgJiZcbiAgICBBcnJheS5pc0FycmF5KG9iai5zaGFwZSkgJiZcbiAgICBBcnJheS5pc0FycmF5KG9iai5zdHJpZGUpICYmXG4gICAgdHlwZW9mIG9iai5vZmZzZXQgPT09ICdudW1iZXInICYmXG4gICAgb2JqLnNoYXBlLmxlbmd0aCA9PT0gb2JqLnN0cmlkZS5sZW5ndGggJiZcbiAgICAoQXJyYXkuaXNBcnJheShvYmouZGF0YSkgfHxcbiAgICAgIGlzVHlwZWRBcnJheShvYmouZGF0YSkpKVxufVxuIiwidmFyIGR0eXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL2FycmF5dHlwZXMuanNvbicpXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uICh4KSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoeCkgaW4gZHR5cGVzXG59XG4iLCJ2YXIgR0xfU1VCUElYRUxfQklUUyA9IDB4MEQ1MFxudmFyIEdMX1JFRF9CSVRTID0gMHgwRDUyXG52YXIgR0xfR1JFRU5fQklUUyA9IDB4MEQ1M1xudmFyIEdMX0JMVUVfQklUUyA9IDB4MEQ1NFxudmFyIEdMX0FMUEhBX0JJVFMgPSAweDBENTVcbnZhciBHTF9ERVBUSF9CSVRTID0gMHgwRDU2XG52YXIgR0xfU1RFTkNJTF9CSVRTID0gMHgwRDU3XG5cbnZhciBHTF9BTElBU0VEX1BPSU5UX1NJWkVfUkFOR0UgPSAweDg0NkRcbnZhciBHTF9BTElBU0VEX0xJTkVfV0lEVEhfUkFOR0UgPSAweDg0NkVcblxudmFyIEdMX01BWF9URVhUVVJFX1NJWkUgPSAweDBEMzNcbnZhciBHTF9NQVhfVklFV1BPUlRfRElNUyA9IDB4MEQzQVxudmFyIEdMX01BWF9WRVJURVhfQVRUUklCUyA9IDB4ODg2OVxudmFyIEdMX01BWF9WRVJURVhfVU5JRk9STV9WRUNUT1JTID0gMHg4REZCXG52YXIgR0xfTUFYX1ZBUllJTkdfVkVDVE9SUyA9IDB4OERGQ1xudmFyIEdMX01BWF9DT01CSU5FRF9URVhUVVJFX0lNQUdFX1VOSVRTID0gMHg4QjREXG52YXIgR0xfTUFYX1ZFUlRFWF9URVhUVVJFX0lNQUdFX1VOSVRTID0gMHg4QjRDXG52YXIgR0xfTUFYX1RFWFRVUkVfSU1BR0VfVU5JVFMgPSAweDg4NzJcbnZhciBHTF9NQVhfRlJBR01FTlRfVU5JRk9STV9WRUNUT1JTID0gMHg4REZEXG52YXIgR0xfTUFYX0NVQkVfTUFQX1RFWFRVUkVfU0laRSA9IDB4ODUxQ1xudmFyIEdMX01BWF9SRU5ERVJCVUZGRVJfU0laRSA9IDB4ODRFOFxuXG52YXIgR0xfVkVORE9SID0gMHgxRjAwXG52YXIgR0xfUkVOREVSRVIgPSAweDFGMDFcbnZhciBHTF9WRVJTSU9OID0gMHgxRjAyXG52YXIgR0xfU0hBRElOR19MQU5HVUFHRV9WRVJTSU9OID0gMHg4QjhDXG5cbnZhciBHTF9NQVhfVEVYVFVSRV9NQVhfQU5JU09UUk9QWV9FWFQgPSAweDg0RkZcblxudmFyIEdMX01BWF9DT0xPUl9BVFRBQ0hNRU5UU19XRUJHTCA9IDB4OENERlxudmFyIEdMX01BWF9EUkFXX0JVRkZFUlNfV0VCR0wgPSAweDg4MjRcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoZ2wsIGV4dGVuc2lvbnMpIHtcbiAgdmFyIG1heEFuaXNvdHJvcGljID0gMVxuICBpZiAoZXh0ZW5zaW9ucy5leHRfdGV4dHVyZV9maWx0ZXJfYW5pc290cm9waWMpIHtcbiAgICBtYXhBbmlzb3Ryb3BpYyA9IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVEVYVFVSRV9NQVhfQU5JU09UUk9QWV9FWFQpXG4gIH1cblxuICB2YXIgbWF4RHJhd2J1ZmZlcnMgPSAxXG4gIHZhciBtYXhDb2xvckF0dGFjaG1lbnRzID0gMVxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9kcmF3X2J1ZmZlcnMpIHtcbiAgICBtYXhEcmF3YnVmZmVycyA9IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfRFJBV19CVUZGRVJTX1dFQkdMKVxuICAgIG1heENvbG9yQXR0YWNobWVudHMgPSBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0NPTE9SX0FUVEFDSE1FTlRTX1dFQkdMKVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICAvLyBkcmF3aW5nIGJ1ZmZlciBiaXQgZGVwdGhcbiAgICBjb2xvckJpdHM6IFtcbiAgICAgIGdsLmdldFBhcmFtZXRlcihHTF9SRURfQklUUyksXG4gICAgICBnbC5nZXRQYXJhbWV0ZXIoR0xfR1JFRU5fQklUUyksXG4gICAgICBnbC5nZXRQYXJhbWV0ZXIoR0xfQkxVRV9CSVRTKSxcbiAgICAgIGdsLmdldFBhcmFtZXRlcihHTF9BTFBIQV9CSVRTKVxuICAgIF0sXG4gICAgZGVwdGhCaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfREVQVEhfQklUUyksXG4gICAgc3RlbmNpbEJpdHM6IGdsLmdldFBhcmFtZXRlcihHTF9TVEVOQ0lMX0JJVFMpLFxuICAgIHN1YnBpeGVsQml0czogZ2wuZ2V0UGFyYW1ldGVyKEdMX1NVQlBJWEVMX0JJVFMpLFxuXG4gICAgLy8gc3VwcG9ydGVkIGV4dGVuc2lvbnNcbiAgICBleHRlbnNpb25zOiBPYmplY3Qua2V5cyhleHRlbnNpb25zKS5maWx0ZXIoZnVuY3Rpb24gKGV4dCkge1xuICAgICAgcmV0dXJuICEhZXh0ZW5zaW9uc1tleHRdXG4gICAgfSksXG5cbiAgICAvLyBtYXggYW5pc28gc2FtcGxlc1xuICAgIG1heEFuaXNvdHJvcGljOiBtYXhBbmlzb3Ryb3BpYyxcblxuICAgIC8vIG1heCBkcmF3IGJ1ZmZlcnNcbiAgICBtYXhEcmF3YnVmZmVyczogbWF4RHJhd2J1ZmZlcnMsXG4gICAgbWF4Q29sb3JBdHRhY2htZW50czogbWF4Q29sb3JBdHRhY2htZW50cyxcblxuICAgIC8vIHBvaW50IGFuZCBsaW5lIHNpemUgcmFuZ2VzXG4gICAgcG9pbnRTaXplRGltczogZ2wuZ2V0UGFyYW1ldGVyKEdMX0FMSUFTRURfUE9JTlRfU0laRV9SQU5HRSksXG4gICAgbGluZVdpZHRoRGltczogZ2wuZ2V0UGFyYW1ldGVyKEdMX0FMSUFTRURfTElORV9XSURUSF9SQU5HRSksXG4gICAgbWF4Vmlld3BvcnREaW1zOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1ZJRVdQT1JUX0RJTVMpLFxuICAgIG1heENvbWJpbmVkVGV4dHVyZVVuaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0NPTUJJTkVEX1RFWFRVUkVfSU1BR0VfVU5JVFMpLFxuICAgIG1heEN1YmVNYXBTaXplOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0NVQkVfTUFQX1RFWFRVUkVfU0laRSksXG4gICAgbWF4UmVuZGVyYnVmZmVyU2l6ZTogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9SRU5ERVJCVUZGRVJfU0laRSksXG4gICAgbWF4VGV4dHVyZVVuaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1RFWFRVUkVfSU1BR0VfVU5JVFMpLFxuICAgIG1heFRleHR1cmVTaXplOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1RFWFRVUkVfU0laRSksXG4gICAgbWF4QXR0cmlidXRlczogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9WRVJURVhfQVRUUklCUyksXG4gICAgbWF4VmVydGV4VW5pZm9ybXM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVkVSVEVYX1VOSUZPUk1fVkVDVE9SUyksXG4gICAgbWF4VmVydGV4VGV4dHVyZVVuaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1ZFUlRFWF9URVhUVVJFX0lNQUdFX1VOSVRTKSxcbiAgICBtYXhWYXJ5aW5nVmVjdG9yczogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9WQVJZSU5HX1ZFQ1RPUlMpLFxuICAgIG1heEZyYWdtZW50VW5pZm9ybXM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfRlJBR01FTlRfVU5JRk9STV9WRUNUT1JTKSxcblxuICAgIC8vIHZlbmRvciBpbmZvXG4gICAgZ2xzbDogZ2wuZ2V0UGFyYW1ldGVyKEdMX1NIQURJTkdfTEFOR1VBR0VfVkVSU0lPTiksXG4gICAgcmVuZGVyZXI6IGdsLmdldFBhcmFtZXRlcihHTF9SRU5ERVJFUiksXG4gICAgdmVuZG9yOiBnbC5nZXRQYXJhbWV0ZXIoR0xfVkVORE9SKSxcbiAgICB2ZXJzaW9uOiBnbC5nZXRQYXJhbWV0ZXIoR0xfVkVSU0lPTilcbiAgfVxufVxuIiwiLyogZ2xvYmFscyBkb2N1bWVudCwgSW1hZ2UsIFhNTEh0dHBSZXF1ZXN0ICovXG5cbm1vZHVsZS5leHBvcnRzID0gbG9hZFRleHR1cmVcblxuZnVuY3Rpb24gZ2V0RXh0ZW5zaW9uICh1cmwpIHtcbiAgdmFyIHBhcnRzID0gL1xcLihcXHcrKShcXD8uKik/JC8uZXhlYyh1cmwpXG4gIGlmIChwYXJ0cyAmJiBwYXJ0c1sxXSkge1xuICAgIHJldHVybiBwYXJ0c1sxXS50b0xvd2VyQ2FzZSgpXG4gIH1cbn1cblxuZnVuY3Rpb24gaXNWaWRlb0V4dGVuc2lvbiAodXJsKSB7XG4gIHJldHVybiBbXG4gICAgJ2F2aScsXG4gICAgJ2FzZicsXG4gICAgJ2dpZnYnLFxuICAgICdtb3YnLFxuICAgICdxdCcsXG4gICAgJ3l1dicsXG4gICAgJ21wZycsXG4gICAgJ21wZWcnLFxuICAgICdtMnYnLFxuICAgICdtcDQnLFxuICAgICdtNHAnLFxuICAgICdtNHYnLFxuICAgICdvZ2cnLFxuICAgICdvZ3YnLFxuICAgICd2b2InLFxuICAgICd3ZWJtJyxcbiAgICAnd212J1xuICBdLmluZGV4T2YodXJsKSA+PSAwXG59XG5cbmZ1bmN0aW9uIGlzQ29tcHJlc3NlZEV4dGVuc2lvbiAodXJsKSB7XG4gIHJldHVybiBbXG4gICAgJ2RkcydcbiAgXS5pbmRleE9mKHVybCkgPj0gMFxufVxuXG5mdW5jdGlvbiBsb2FkVmlkZW8gKHVybCwgY3Jvc3NPcmlnaW4pIHtcbiAgdmFyIHZpZGVvID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndmlkZW8nKVxuICB2aWRlby5hdXRvcGxheSA9IHRydWVcbiAgdmlkZW8ubG9vcCA9IHRydWVcbiAgaWYgKGNyb3NzT3JpZ2luKSB7XG4gICAgdmlkZW8uY3Jvc3NPcmlnaW4gPSBjcm9zc09yaWdpblxuICB9XG4gIHZpZGVvLnNyYyA9IHVybFxuICByZXR1cm4gdmlkZW9cbn1cblxuZnVuY3Rpb24gbG9hZENvbXByZXNzZWRUZXh0dXJlICh1cmwsIGV4dCwgY3Jvc3NPcmlnaW4pIHtcbiAgdmFyIHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpXG4gIHhoci5yZXNwb25zZVR5cGUgPSAnYXJyYXlidWZmZXInXG4gIHhoci5vcGVuKCdHRVQnLCB1cmwsIHRydWUpXG4gIHhoci5zZW5kKClcbiAgcmV0dXJuIHhoclxufVxuXG5mdW5jdGlvbiBsb2FkSW1hZ2UgKHVybCwgY3Jvc3NPcmlnaW4pIHtcbiAgdmFyIGltYWdlID0gbmV3IEltYWdlKClcbiAgaWYgKGNyb3NzT3JpZ2luKSB7XG4gICAgaW1hZ2UuY3Jvc3NPcmlnaW4gPSBjcm9zc09yaWdpblxuICB9XG4gIGltYWdlLnNyYyA9IHVybFxuICByZXR1cm4gaW1hZ2Vcbn1cblxuLy8gQ3VycmVudGx5IHRoaXMgc3R1ZmYgb25seSB3b3JrcyBpbiBhIERPTSBlbnZpcm9ubWVudFxuZnVuY3Rpb24gbG9hZFRleHR1cmUgKHVybCwgY3Jvc3NPcmlnaW4pIHtcbiAgaWYgKHR5cGVvZiBkb2N1bWVudCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICB2YXIgZXh0ID0gZ2V0RXh0ZW5zaW9uKHVybClcbiAgICBpZiAoaXNWaWRlb0V4dGVuc2lvbihleHQpKSB7XG4gICAgICByZXR1cm4gbG9hZFZpZGVvKHVybCwgY3Jvc3NPcmlnaW4pXG4gICAgfVxuICAgIGlmIChpc0NvbXByZXNzZWRFeHRlbnNpb24oZXh0KSkge1xuICAgICAgcmV0dXJuIGxvYWRDb21wcmVzc2VkVGV4dHVyZSh1cmwsIGV4dCwgY3Jvc3NPcmlnaW4pXG4gICAgfVxuICAgIHJldHVybiBsb2FkSW1hZ2UodXJsLCBjcm9zc09yaWdpbilcbiAgfVxuICByZXR1cm4gbnVsbFxufVxuIiwiLy8gUmVmZXJlbmNlczpcbi8vXG4vLyBodHRwOi8vbXNkbi5taWNyb3NvZnQuY29tL2VuLXVzL2xpYnJhcnkvYmI5NDM5OTEuYXNweC9cbi8vIGh0dHA6Ly9ibG9nLnRvamljb2RlLmNvbS8yMDExLzEyL2NvbXByZXNzZWQtdGV4dHVyZXMtaW4td2ViZ2wuaHRtbFxuLy9cblxuXG5tb2R1bGUuZXhwb3J0cyA9IHBhcnNlRERTXG5cbnZhciBERFNfTUFHSUMgPSAweDIwNTM0NDQ0XG5cbnZhciBHTF9URVhUVVJFXzJEID0gMHgwREUxXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YID0gMHg4NTE1XG5cbnZhciBHTF9DT01QUkVTU0VEX1JHQl9TM1RDX0RYVDFfRVhUID0gMHg4M0YwXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUMV9FWFQgPSAweDgzRjFcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQzX0VYVCA9IDB4ODNGMlxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDVfRVhUID0gMHg4M0YzXG5cbnZhciBHTF9DT01QUkVTU0VEX1JHQl9FVEMxX1dFQkdMID0gMHg4RDY0XG5cbnZhciBHTF9VTlNJR05FRF9CWVRFID0gMHgxNDAxXG4vLyB2YXIgR0xfSEFMRl9GTE9BVF9PRVMgPSAweDhENjFcbi8vIHZhciBHTF9GTE9BVCA9IDB4MTQwNlxuXG52YXIgRERTRF9NSVBNQVBDT1VOVCA9IDB4MjAwMDBcblxudmFyIEREU0NBUFMyX0NVQkVNQVAgPSAweDIwMFxudmFyIEREU0NBUFMyX0NVQkVNQVBfUE9TSVRJVkVYID0gMHg0MDBcbnZhciBERFNDQVBTMl9DVUJFTUFQX05FR0FUSVZFWCA9IDB4ODAwXG52YXIgRERTQ0FQUzJfQ1VCRU1BUF9QT1NJVElWRVkgPSAweDEwMDBcbnZhciBERFNDQVBTMl9DVUJFTUFQX05FR0FUSVZFWSA9IDB4MjAwMFxudmFyIEREU0NBUFMyX0NVQkVNQVBfUE9TSVRJVkVaID0gMHg0MDAwXG52YXIgRERTQ0FQUzJfQ1VCRU1BUF9ORUdBVElWRVogPSAweDgwMDBcblxudmFyIENVQkVNQVBfQ09NUExFVEVfRkFDRVMgPSAoXG4gIEREU0NBUFMyX0NVQkVNQVBfUE9TSVRJVkVYIHxcbiAgRERTQ0FQUzJfQ1VCRU1BUF9ORUdBVElWRVggfFxuICBERFNDQVBTMl9DVUJFTUFQX1BPU0lUSVZFWSB8XG4gIEREU0NBUFMyX0NVQkVNQVBfTkVHQVRJVkVZIHxcbiAgRERTQ0FQUzJfQ1VCRU1BUF9QT1NJVElWRVogfFxuICBERFNDQVBTMl9DVUJFTUFQX05FR0FUSVZFWilcblxudmFyIEREUEZfRk9VUkNDID0gMHg0XG52YXIgRERQRl9SR0IgPSAweDQwXG5cbnZhciBGT1VSQ0NfRFhUMSA9IDB4MzE1NDU4NDRcbnZhciBGT1VSQ0NfRFhUMyA9IDB4MzM1NDU4NDRcbnZhciBGT1VSQ0NfRFhUNSA9IDB4MzU1NDU4NDRcbnZhciBGT1VSQ0NfRVRDMSA9IDB4MzE0MzU0NDVcblxuLy8gRERTX0hFQURFUiB7XG52YXIgT0ZGX1NJWkUgPSAxICAgICAgICAvLyBpbnQzMiBkd1NpemVcbnZhciBPRkZfRkxBR1MgPSAyICAgICAgIC8vIGludDMyIGR3RmxhZ3NcbnZhciBPRkZfSEVJR0hUID0gMyAgICAgIC8vIGludDMyIGR3SGVpZ2h0XG52YXIgT0ZGX1dJRFRIID0gNCAgICAgICAvLyBpbnQzMiBkd1dpZHRoXG4vLyB2YXIgT0ZGX1BJVENIID0gNSAgICAgICAvLyBpbnQzMiBkd1BpdGNoT3JMaW5lYXJTaXplXG4vLyB2YXIgT0ZGX0RFUFRIID0gNiAgICAgICAvLyBpbnQzMiBkd0RlcHRoXG52YXIgT0ZGX01JUE1BUCA9IDcgICAgICAvLyBpbnQzMiBkd01pcE1hcENvdW50OyAvLyBvZmZzZXQ6IDdcbi8vIGludDMyWzExXSBkd1Jlc2VydmVkMVxuLy8gRERTX1BJWEVMRk9STUFUIHtcbi8vIHZhciBPRkZfUEZfU0laRSA9IDE5ICAgIC8vIGludDMyIGR3U2l6ZTsgLy8gb2Zmc2V0OiAxOVxudmFyIE9GRl9QRl9GTEFHUyA9IDIwICAgLy8gaW50MzIgZHdGbGFnc1xudmFyIE9GRl9GT1VSQ0MgPSAyMSAgICAgLy8gY2hhcls0XSBkd0ZvdXJDQ1xuLy8gdmFyIE9GRl9SR0JBX0JJVFMgPSAyMiAgLy8gaW50MzIgZHdSR0JCaXRDb3VudFxuLy8gdmFyIE9GRl9SRURfTUFTSyA9IDIzICAgLy8gaW50MzIgZHdSQml0TWFza1xuLy8gdmFyIE9GRl9HUkVFTl9NQVNLID0gMjQgLy8gaW50MzIgZHdHQml0TWFza1xuLy8gdmFyIE9GRl9CTFVFX01BU0sgPSAyNSAgLy8gaW50MzIgZHdCQml0TWFza1xuLy8gdmFyIE9GRl9BTFBIQV9NQVNLID0gMjYgLy8gaW50MzIgZHdBQml0TWFzazsgLy8gb2Zmc2V0OiAyNlxuLy8gfVxuLy8gdmFyIE9GRl9DQVBTID0gMjcgICAgICAgLy8gaW50MzIgZHdDYXBzOyAvLyBvZmZzZXQ6IDI3XG52YXIgT0ZGX0NBUFMyID0gMjggICAgICAvLyBpbnQzMiBkd0NhcHMyXG4vLyB2YXIgT0ZGX0NBUFMzID0gMjkgICAgICAvLyBpbnQzMiBkd0NhcHMzXG4vLyB2YXIgT0ZGX0NBUFM0ID0gMzAgICAgICAvLyBpbnQzMiBkd0NhcHM0XG4vLyBpbnQzMiBkd1Jlc2VydmVkMiAvLyBvZmZzZXQgMzFcblxuZnVuY3Rpb24gcGFyc2VERFMgKGFycmF5QnVmZmVyKSB7XG4gIHZhciBoZWFkZXIgPSBuZXcgSW50MzJBcnJheShhcnJheUJ1ZmZlcilcbiAgXG5cbiAgdmFyIGZsYWdzID0gaGVhZGVyW09GRl9GTEFHU11cbiAgXG5cbiAgdmFyIHdpZHRoID0gaGVhZGVyW09GRl9XSURUSF1cbiAgdmFyIGhlaWdodCA9IGhlYWRlcltPRkZfSEVJR0hUXVxuXG4gIHZhciB0eXBlID0gR0xfVU5TSUdORURfQllURVxuICB2YXIgZm9ybWF0ID0gMFxuICB2YXIgYmxvY2tCeXRlcyA9IDBcbiAgdmFyIGNoYW5uZWxzID0gNFxuICBzd2l0Y2ggKGhlYWRlcltPRkZfRk9VUkNDXSkge1xuICAgIGNhc2UgRk9VUkNDX0RYVDE6XG4gICAgICBibG9ja0J5dGVzID0gOFxuICAgICAgaWYgKGZsYWdzICYgRERQRl9SR0IpIHtcbiAgICAgICAgY2hhbm5lbHMgPSAzXG4gICAgICAgIGZvcm1hdCA9IEdMX0NPTVBSRVNTRURfUkdCX1MzVENfRFhUMV9FWFRcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGZvcm1hdCA9IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDFfRVhUXG4gICAgICB9XG4gICAgICBicmVha1xuXG4gICAgY2FzZSBGT1VSQ0NfRFhUMzpcbiAgICAgIGJsb2NrQnl0ZXMgPSAxNlxuICAgICAgZm9ybWF0ID0gR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUM19FWFRcbiAgICAgIGJyZWFrXG5cbiAgICBjYXNlIEZPVVJDQ19EWFQ1OlxuICAgICAgYmxvY2tCeXRlcyA9IDE2XG4gICAgICBmb3JtYXQgPSBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQ1X0VYVFxuICAgICAgYnJlYWtcblxuICAgIGNhc2UgRk9VUkNDX0VUQzE6XG4gICAgICBibG9ja0J5dGVzID0gOFxuICAgICAgZm9ybWF0ID0gR0xfQ09NUFJFU1NFRF9SR0JfRVRDMV9XRUJHTFxuICAgICAgYnJlYWtcblxuICAgIC8vIFRPRE86IEltcGxlbWVudCBoZHIgYW5kIHVuY29tcHJlc3NlZCB0ZXh0dXJlc1xuXG4gICAgZGVmYXVsdDpcbiAgICAgIC8vIEhhbmRsZSB1bmNvbXByZXNzZWQgZGF0YSBoZXJlXG4gICAgICBcbiAgfVxuXG4gIHZhciBwaXhlbEZsYWdzID0gaGVhZGVyW09GRl9QRl9GTEFHU11cblxuICB2YXIgbWlwbWFwQ291bnQgPSAxXG4gIGlmIChwaXhlbEZsYWdzICYgRERTRF9NSVBNQVBDT1VOVCkge1xuICAgIG1pcG1hcENvdW50ID0gTWF0aC5tYXgoMSwgaGVhZGVyW09GRl9NSVBNQVBdKVxuICB9XG5cbiAgdmFyIHB0ciA9IGhlYWRlcltPRkZfU0laRV0gKyA0XG5cbiAgdmFyIHJlc3VsdCA9IHtcbiAgICB3aWR0aDogd2lkdGgsXG4gICAgaGVpZ2h0OiBoZWlnaHQsXG4gICAgY2hhbm5lbHM6IGNoYW5uZWxzLFxuICAgIGZvcm1hdDogZm9ybWF0LFxuICAgIHR5cGU6IHR5cGUsXG4gICAgY29tcHJlc3NlZDogdHJ1ZSxcbiAgICBjdWJlOiBmYWxzZSxcbiAgICBwaXhlbHM6IFtdXG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZU1pcHMgKHRhcmdldCkge1xuICAgIHZhciBtaXBXaWR0aCA9IHdpZHRoXG4gICAgdmFyIG1pcEhlaWdodCA9IGhlaWdodFxuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBtaXBtYXBDb3VudDsgKytpKSB7XG4gICAgICB2YXIgc2l6ZSA9XG4gICAgICAgIE1hdGgubWF4KDEsIChtaXBXaWR0aCArIDMpID4+IDIpICpcbiAgICAgICAgTWF0aC5tYXgoMSwgKG1pcEhlaWdodCArIDMpID4+IDIpICpcbiAgICAgICAgYmxvY2tCeXRlc1xuICAgICAgcmVzdWx0LnBpeGVscy5wdXNoKHtcbiAgICAgICAgdGFyZ2V0OiB0YXJnZXQsXG4gICAgICAgIG1pcGxldmVsOiBpLFxuICAgICAgICB3aWR0aDogbWlwV2lkdGgsXG4gICAgICAgIGhlaWdodDogbWlwSGVpZ2h0LFxuICAgICAgICBkYXRhOiBuZXcgVWludDhBcnJheShhcnJheUJ1ZmZlciwgcHRyLCBzaXplKVxuICAgICAgfSlcbiAgICAgIHB0ciArPSBzaXplXG4gICAgICBtaXBXaWR0aCA+Pj0gMVxuICAgICAgbWlwSGVpZ2h0ID4+PSAxXG4gICAgfVxuICB9XG5cbiAgdmFyIGNhcHMyID0gaGVhZGVyW09GRl9DQVBTMl1cbiAgdmFyIGN1YmVtYXAgPSAhIShjYXBzMiAmIEREU0NBUFMyX0NVQkVNQVApXG4gIGlmIChjdWJlbWFwKSB7XG4gICAgXG4gICAgcmVzdWx0LmN1YmUgPSB0cnVlXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCA2OyArK2kpIHtcbiAgICAgIHBhcnNlTWlwcyhHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1ggKyBpKVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBwYXJzZU1pcHMoR0xfVEVYVFVSRV8yRClcbiAgfVxuXG4gIHJldHVybiByZXN1bHRcbn1cbiIsIi8qIGdsb2JhbHMgcmVxdWVzdEFuaW1hdGlvbkZyYW1lLCBjYW5jZWxBbmltYXRpb25GcmFtZSAqL1xuaWYgKHR5cGVvZiByZXF1ZXN0QW5pbWF0aW9uRnJhbWUgPT09ICdmdW5jdGlvbicgJiZcbiAgICB0eXBlb2YgY2FuY2VsQW5pbWF0aW9uRnJhbWUgPT09ICdmdW5jdGlvbicpIHtcbiAgbW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgbmV4dDogZnVuY3Rpb24gKHgpIHsgcmV0dXJuIHJlcXVlc3RBbmltYXRpb25GcmFtZSh4KSB9LFxuICAgIGNhbmNlbDogZnVuY3Rpb24gKHgpIHsgcmV0dXJuIGNhbmNlbEFuaW1hdGlvbkZyYW1lKHgpIH1cbiAgfVxufSBlbHNlIHtcbiAgbW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgbmV4dDogZnVuY3Rpb24gKGNiKSB7XG4gICAgICBzZXRUaW1lb3V0KGNiLCAzMClcbiAgICB9LFxuICAgIGNhbmNlbDogY2xlYXJUaW1lb3V0XG4gIH1cbn1cbiIsIlxudmFyIGlzVHlwZWRBcnJheSA9IHJlcXVpcmUoJy4vaXMtdHlwZWQtYXJyYXknKVxuXG52YXIgR0xfUkdCQSA9IDY0MDhcbnZhciBHTF9VTlNJR05FRF9CWVRFID0gNTEyMVxudmFyIEdMX1BBQ0tfQUxJR05NRU5UID0gMHgwRDA1XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcFJlYWRQaXhlbHMgKGdsLCByZWdsUG9sbCwgdmlld3BvcnRTdGF0ZSkge1xuICBmdW5jdGlvbiByZWFkUGl4ZWxzIChpbnB1dCkge1xuICAgIHZhciBvcHRpb25zID0gaW5wdXQgfHwge31cbiAgICBpZiAoaXNUeXBlZEFycmF5KGlucHV0KSkge1xuICAgICAgb3B0aW9ucyA9IHtcbiAgICAgICAgZGF0YTogb3B0aW9uc1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMikge1xuICAgICAgb3B0aW9ucyA9IHtcbiAgICAgICAgd2lkdGg6IGFyZ3VtZW50c1swXSB8IDAsXG4gICAgICAgIGhlaWdodDogYXJndW1lbnRzWzFdIHwgMFxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAodHlwZW9mIGlucHV0ICE9PSAnb2JqZWN0Jykge1xuICAgICAgb3B0aW9ucyA9IHt9XG4gICAgfVxuXG4gICAgLy8gVXBkYXRlIFdlYkdMIHN0YXRlXG4gICAgcmVnbFBvbGwoKVxuXG4gICAgLy8gUmVhZCB2aWV3cG9ydCBzdGF0ZVxuICAgIHZhciB4ID0gb3B0aW9ucy54IHx8IDBcbiAgICB2YXIgeSA9IG9wdGlvbnMueSB8fCAwXG4gICAgdmFyIHdpZHRoID0gb3B0aW9ucy53aWR0aCB8fCB2aWV3cG9ydFN0YXRlLndpZHRoXG4gICAgdmFyIGhlaWdodCA9IG9wdGlvbnMuaGVpZ2h0IHx8IHZpZXdwb3J0U3RhdGUuaGVpZ2h0XG5cbiAgICAvLyBDb21wdXRlIHNpemVcbiAgICB2YXIgc2l6ZSA9IHdpZHRoICogaGVpZ2h0ICogNFxuXG4gICAgLy8gQWxsb2NhdGUgZGF0YVxuICAgIHZhciBkYXRhID0gb3B0aW9ucy5kYXRhIHx8IG5ldyBVaW50OEFycmF5KHNpemUpXG5cbiAgICAvLyBUeXBlIGNoZWNrXG4gICAgXG4gICAgXG5cbiAgICAvLyBSdW4gcmVhZCBwaXhlbHNcbiAgICBnbC5waXhlbFN0b3JlaShHTF9QQUNLX0FMSUdOTUVOVCwgNClcbiAgICBnbC5yZWFkUGl4ZWxzKHgsIHksIHdpZHRoLCBoZWlnaHQsIEdMX1JHQkEsIEdMX1VOU0lHTkVEX0JZVEUsIGRhdGEpXG5cbiAgICByZXR1cm4gZGF0YVxuICB9XG5cbiAgcmV0dXJuIHJlYWRQaXhlbHNcbn1cbiIsIlxudmFyIHZhbHVlcyA9IHJlcXVpcmUoJy4vdmFsdWVzJylcblxudmFyIEdMX1JFTkRFUkJVRkZFUiA9IDB4OEQ0MVxuXG52YXIgR0xfUkdCQTQgPSAweDgwNTZcbnZhciBHTF9SR0I1X0ExID0gMHg4MDU3XG52YXIgR0xfUkdCNTY1ID0gMHg4RDYyXG52YXIgR0xfREVQVEhfQ09NUE9ORU5UMTYgPSAweDgxQTVcbnZhciBHTF9TVEVOQ0lMX0lOREVYOCA9IDB4OEQ0OFxudmFyIEdMX0RFUFRIX1NURU5DSUwgPSAweDg0RjlcblxudmFyIEdMX1NSR0I4X0FMUEhBOF9FWFQgPSAweDhDNDNcblxudmFyIEdMX1JHQkEzMkZfRVhUID0gMHg4ODE0XG5cbnZhciBHTF9SR0JBMTZGX0VYVCA9IDB4ODgxQVxudmFyIEdMX1JHQjE2Rl9FWFQgPSAweDg4MUJcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoZ2wsIGV4dGVuc2lvbnMsIGxpbWl0cykge1xuICB2YXIgZm9ybWF0VHlwZXMgPSB7XG4gICAgJ3JnYmE0JzogR0xfUkdCQTQsXG4gICAgJ3JnYjU2NSc6IEdMX1JHQjU2NSxcbiAgICAncmdiNSBhMSc6IEdMX1JHQjVfQTEsXG4gICAgJ2RlcHRoJzogR0xfREVQVEhfQ09NUE9ORU5UMTYsXG4gICAgJ3N0ZW5jaWwnOiBHTF9TVEVOQ0lMX0lOREVYOCxcbiAgICAnZGVwdGggc3RlbmNpbCc6IEdMX0RFUFRIX1NURU5DSUxcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLmV4dF9zcmdiKSB7XG4gICAgZm9ybWF0VHlwZXNbJ3NyZ2JhJ10gPSBHTF9TUkdCOF9BTFBIQThfRVhUXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5leHRfY29sb3JfYnVmZmVyX2hhbGZfZmxvYXQpIHtcbiAgICBmb3JtYXRUeXBlc1sncmdiYTE2ZiddID0gR0xfUkdCQTE2Rl9FWFRcbiAgICBmb3JtYXRUeXBlc1sncmdiMTZmJ10gPSBHTF9SR0IxNkZfRVhUXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb2xvcl9idWZmZXJfZmxvYXQpIHtcbiAgICBmb3JtYXRUeXBlc1sncmdiYTMyZiddID0gR0xfUkdCQTMyRl9FWFRcbiAgfVxuXG4gIHZhciByZW5kZXJidWZmZXJDb3VudCA9IDBcbiAgdmFyIHJlbmRlcmJ1ZmZlclNldCA9IHt9XG5cbiAgZnVuY3Rpb24gUkVHTFJlbmRlcmJ1ZmZlciAoKSB7XG4gICAgdGhpcy5pZCA9IHJlbmRlcmJ1ZmZlckNvdW50KytcbiAgICB0aGlzLnJlZkNvdW50ID0gMVxuXG4gICAgdGhpcy5yZW5kZXJidWZmZXIgPSBudWxsXG5cbiAgICB0aGlzLmZvcm1hdCA9IEdMX1JHQkE0XG4gICAgdGhpcy53aWR0aCA9IDBcbiAgICB0aGlzLmhlaWdodCA9IDBcbiAgfVxuXG4gIFJFR0xSZW5kZXJidWZmZXIucHJvdG90eXBlLmRlY1JlZiA9IGZ1bmN0aW9uICgpIHtcbiAgICBpZiAoLS10aGlzLnJlZkNvdW50ID09PSAwKSB7XG4gICAgICBkZXN0cm95KHRoaXMpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcmVmcmVzaCAocmIpIHtcbiAgICBpZiAoIWdsLmlzUmVuZGVyYnVmZmVyKHJiLnJlbmRlcmJ1ZmZlcikpIHtcbiAgICAgIHJiLnJlbmRlcmJ1ZmZlciA9IGdsLmNyZWF0ZVJlbmRlcmJ1ZmZlcigpXG4gICAgfVxuICAgIGdsLmJpbmRSZW5kZXJidWZmZXIoR0xfUkVOREVSQlVGRkVSLCByYi5yZW5kZXJidWZmZXIpXG4gICAgZ2wucmVuZGVyYnVmZmVyU3RvcmFnZShcbiAgICAgIEdMX1JFTkRFUkJVRkZFUixcbiAgICAgIHJiLmZvcm1hdCxcbiAgICAgIHJiLndpZHRoLFxuICAgICAgcmIuaGVpZ2h0KVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSAocmIpIHtcbiAgICB2YXIgaGFuZGxlID0gcmIucmVuZGVyYnVmZmVyXG4gICAgXG4gICAgZ2wuYmluZFJlbmRlcmJ1ZmZlcihHTF9SRU5ERVJCVUZGRVIsIG51bGwpXG4gICAgaWYgKGdsLmlzUmVuZGVyYnVmZmVyKGhhbmRsZSkpIHtcbiAgICAgIGdsLmRlbGV0ZVJlbmRlcmJ1ZmZlcihoYW5kbGUpXG4gICAgfVxuICAgIHJiLnJlbmRlcmJ1ZmZlciA9IG51bGxcbiAgICByYi5yZWZDb3VudCA9IDBcbiAgICBkZWxldGUgcmVuZGVyYnVmZmVyU2V0W3JiLmlkXVxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlUmVuZGVyYnVmZmVyIChpbnB1dCkge1xuICAgIHZhciByZW5kZXJidWZmZXIgPSBuZXcgUkVHTFJlbmRlcmJ1ZmZlcigpXG4gICAgcmVuZGVyYnVmZmVyU2V0W3JlbmRlcmJ1ZmZlci5pZF0gPSByZW5kZXJidWZmZXJcblxuICAgIGZ1bmN0aW9uIHJlZ2xSZW5kZXJidWZmZXIgKGlucHV0KSB7XG4gICAgICB2YXIgb3B0aW9ucyA9IGlucHV0IHx8IHt9XG5cbiAgICAgIHZhciB3ID0gMFxuICAgICAgdmFyIGggPSAwXG4gICAgICBpZiAoJ3NoYXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBzaGFwZSA9IG9wdGlvbnMuc2hhcGVcbiAgICAgICAgXG4gICAgICAgIHcgPSBzaGFwZVswXSB8IDBcbiAgICAgICAgaCA9IHNoYXBlWzFdIHwgMFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKCdyYWRpdXMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB3ID0gaCA9IG9wdGlvbnMucmFkaXVzIHwgMFxuICAgICAgICB9XG4gICAgICAgIGlmICgnd2lkdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB3ID0gb3B0aW9ucy53aWR0aCB8IDBcbiAgICAgICAgfVxuICAgICAgICBpZiAoJ2hlaWdodCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGggPSBvcHRpb25zLmhlaWdodCB8IDBcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgdmFyIHMgPSBsaW1pdHMubWF4UmVuZGVyYnVmZmVyU2l6ZVxuICAgICAgXG4gICAgICByZWdsUmVuZGVyYnVmZmVyLndpZHRoID0gcmVuZGVyYnVmZmVyLndpZHRoID0gTWF0aC5tYXgodywgMSlcbiAgICAgIHJlZ2xSZW5kZXJidWZmZXIuaGVpZ2h0ID0gcmVuZGVyYnVmZmVyLmhlaWdodCA9IE1hdGgubWF4KGgsIDEpXG5cbiAgICAgIHJlbmRlcmJ1ZmZlci5mb3JtYXQgPSBHTF9SR0JBNFxuICAgICAgaWYgKCdmb3JtYXQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGZvcm1hdCA9IG9wdGlvbnMuZm9ybWF0XG4gICAgICAgIFxuICAgICAgICByZW5kZXJidWZmZXIuZm9ybWF0ID0gZm9ybWF0VHlwZXNbZm9ybWF0XVxuICAgICAgfVxuXG4gICAgICByZWZyZXNoKHJlbmRlcmJ1ZmZlcilcblxuICAgICAgcmV0dXJuIHJlZ2xSZW5kZXJidWZmZXJcbiAgICB9XG5cbiAgICByZWdsUmVuZGVyYnVmZmVyKGlucHV0KVxuXG4gICAgcmVnbFJlbmRlcmJ1ZmZlci5fcmVnbFR5cGUgPSAncmVuZGVyYnVmZmVyJ1xuICAgIHJlZ2xSZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlciA9IHJlbmRlcmJ1ZmZlclxuICAgIHJlZ2xSZW5kZXJidWZmZXIuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJlbmRlcmJ1ZmZlci5kZWNSZWYoKVxuICAgIH1cblxuICAgIHJldHVybiByZWdsUmVuZGVyYnVmZmVyXG4gIH1cblxuICBmdW5jdGlvbiByZWZyZXNoUmVuZGVyYnVmZmVycyAoKSB7XG4gICAgdmFsdWVzKHJlbmRlcmJ1ZmZlclNldCkuZm9yRWFjaChyZWZyZXNoKVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveVJlbmRlcmJ1ZmZlcnMgKCkge1xuICAgIHZhbHVlcyhyZW5kZXJidWZmZXJTZXQpLmZvckVhY2goZGVzdHJveSlcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY3JlYXRlOiBjcmVhdGVSZW5kZXJidWZmZXIsXG4gICAgcmVmcmVzaDogcmVmcmVzaFJlbmRlcmJ1ZmZlcnMsXG4gICAgY2xlYXI6IGRlc3Ryb3lSZW5kZXJidWZmZXJzXG4gIH1cbn1cbiIsIlxudmFyIHZhbHVlcyA9IHJlcXVpcmUoJy4vdmFsdWVzJylcblxudmFyIERFRkFVTFRfRlJBR19TSEFERVIgPSAndm9pZCBtYWluKCl7Z2xfRnJhZ0NvbG9yPXZlYzQoMCwwLDAsMCk7fSdcbnZhciBERUZBVUxUX1ZFUlRfU0hBREVSID0gJ3ZvaWQgbWFpbigpe2dsX1Bvc2l0aW9uPXZlYzQoMCwwLDAsMCk7fSdcblxudmFyIEdMX0ZSQUdNRU5UX1NIQURFUiA9IDM1NjMyXG52YXIgR0xfVkVSVEVYX1NIQURFUiA9IDM1NjMzXG5cbnZhciBHTF9BQ1RJVkVfVU5JRk9STVMgPSAweDhCODZcbnZhciBHTF9BQ1RJVkVfQVRUUklCVVRFUyA9IDB4OEI4OVxuXG5mdW5jdGlvbiBBY3RpdmVJbmZvIChuYW1lLCBsb2NhdGlvbiwgaW5mbykge1xuICB0aGlzLm5hbWUgPSBuYW1lXG4gIHRoaXMubG9jYXRpb24gPSBsb2NhdGlvblxuICB0aGlzLmluZm8gPSBpbmZvXG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcFNoYWRlclN0YXRlIChcbiAgZ2wsXG4gIGF0dHJpYnV0ZVN0YXRlLFxuICB1bmlmb3JtU3RhdGUsXG4gIGNvbXBpbGVTaGFkZXJEcmF3LFxuICBzdHJpbmdTdG9yZSkge1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gZ2xzbCBjb21waWxhdGlvbiBhbmQgbGlua2luZ1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgdmFyIGZyYWdTaGFkZXJzID0ge31cbiAgdmFyIHZlcnRTaGFkZXJzID0ge31cblxuICBmdW5jdGlvbiBnZXRTaGFkZXIgKHR5cGUsIGlkKSB7XG4gICAgdmFyIGNhY2hlID0gdHlwZSA9PT0gR0xfRlJBR01FTlRfU0hBREVSID8gZnJhZ1NoYWRlcnMgOiB2ZXJ0U2hhZGVyc1xuICAgIHZhciBzaGFkZXIgPSBjYWNoZVtpZF1cblxuICAgIGlmICghc2hhZGVyKSB7XG4gICAgICB2YXIgc291cmNlID0gc3RyaW5nU3RvcmUuc3RyKGlkKVxuICAgICAgc2hhZGVyID0gZ2wuY3JlYXRlU2hhZGVyKHR5cGUpXG4gICAgICBnbC5zaGFkZXJTb3VyY2Uoc2hhZGVyLCBzb3VyY2UpXG4gICAgICBnbC5jb21waWxlU2hhZGVyKHNoYWRlcilcbiAgICAgIFxuICAgICAgY2FjaGVbaWRdID0gc2hhZGVyXG4gICAgfVxuXG4gICAgcmV0dXJuIHNoYWRlclxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIHByb2dyYW0gbGlua2luZ1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgdmFyIHByb2dyYW1DYWNoZSA9IHt9XG4gIHZhciBwcm9ncmFtTGlzdCA9IFtdXG5cbiAgZnVuY3Rpb24gUkVHTFByb2dyYW0gKGZyYWdJZCwgdmVydElkKSB7XG4gICAgdGhpcy5mcmFnSWQgPSBmcmFnSWRcbiAgICB0aGlzLnZlcnRJZCA9IHZlcnRJZFxuICAgIHRoaXMucHJvZ3JhbSA9IG51bGxcbiAgICB0aGlzLnVuaWZvcm1zID0gW11cbiAgICB0aGlzLmF0dHJpYnV0ZXMgPSBbXVxuICAgIHRoaXMuZHJhdyA9IGZ1bmN0aW9uICgpIHt9XG4gICAgdGhpcy5iYXRjaENhY2hlID0ge31cbiAgfVxuXG4gIGZ1bmN0aW9uIGxpbmtQcm9ncmFtIChkZXNjKSB7XG4gICAgdmFyIGksIGluZm9cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBjb21waWxlICYgbGlua1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICB2YXIgZnJhZ1NoYWRlciA9IGdldFNoYWRlcihHTF9GUkFHTUVOVF9TSEFERVIsIGRlc2MuZnJhZ0lkKVxuICAgIHZhciB2ZXJ0U2hhZGVyID0gZ2V0U2hhZGVyKEdMX1ZFUlRFWF9TSEFERVIsIGRlc2MudmVydElkKVxuXG4gICAgdmFyIHByb2dyYW0gPSBkZXNjLnByb2dyYW0gPSBnbC5jcmVhdGVQcm9ncmFtKClcbiAgICBnbC5hdHRhY2hTaGFkZXIocHJvZ3JhbSwgZnJhZ1NoYWRlcilcbiAgICBnbC5hdHRhY2hTaGFkZXIocHJvZ3JhbSwgdmVydFNoYWRlcilcbiAgICBnbC5saW5rUHJvZ3JhbShwcm9ncmFtKVxuICAgIFxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGdyYWIgdW5pZm9ybXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgdmFyIG51bVVuaWZvcm1zID0gZ2wuZ2V0UHJvZ3JhbVBhcmFtZXRlcihwcm9ncmFtLCBHTF9BQ1RJVkVfVU5JRk9STVMpXG4gICAgdmFyIHVuaWZvcm1zID0gZGVzYy51bmlmb3JtcyA9IFtdXG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgbnVtVW5pZm9ybXM7ICsraSkge1xuICAgICAgaW5mbyA9IGdsLmdldEFjdGl2ZVVuaWZvcm0ocHJvZ3JhbSwgaSlcbiAgICAgIGlmIChpbmZvKSB7XG4gICAgICAgIGlmIChpbmZvLnNpemUgPiAxKSB7XG4gICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBpbmZvLnNpemU7ICsraikge1xuICAgICAgICAgICAgdmFyIG5hbWUgPSBpbmZvLm5hbWUucmVwbGFjZSgnWzBdJywgJ1snICsgaiArICddJylcbiAgICAgICAgICAgIHVuaWZvcm1TdGF0ZS5kZWYobmFtZSlcbiAgICAgICAgICAgIHVuaWZvcm1zLnB1c2gobmV3IEFjdGl2ZUluZm8oXG4gICAgICAgICAgICAgIG5hbWUsXG4gICAgICAgICAgICAgIGdsLmdldFVuaWZvcm1Mb2NhdGlvbihwcm9ncmFtLCBuYW1lKSxcbiAgICAgICAgICAgICAgaW5mbykpXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHVuaWZvcm1TdGF0ZS5kZWYoaW5mby5uYW1lKVxuICAgICAgICAgIHVuaWZvcm1zLnB1c2gobmV3IEFjdGl2ZUluZm8oXG4gICAgICAgICAgICBpbmZvLm5hbWUsXG4gICAgICAgICAgICBnbC5nZXRVbmlmb3JtTG9jYXRpb24ocHJvZ3JhbSwgaW5mby5uYW1lKSxcbiAgICAgICAgICAgIGluZm8pKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGdyYWIgYXR0cmlidXRlc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICB2YXIgbnVtQXR0cmlidXRlcyA9IGdsLmdldFByb2dyYW1QYXJhbWV0ZXIocHJvZ3JhbSwgR0xfQUNUSVZFX0FUVFJJQlVURVMpXG4gICAgdmFyIGF0dHJpYnV0ZXMgPSBkZXNjLmF0dHJpYnV0ZXMgPSBbXVxuICAgIGZvciAoaSA9IDA7IGkgPCBudW1BdHRyaWJ1dGVzOyArK2kpIHtcbiAgICAgIGluZm8gPSBnbC5nZXRBY3RpdmVBdHRyaWIocHJvZ3JhbSwgaSlcbiAgICAgIGlmIChpbmZvKSB7XG4gICAgICAgIGF0dHJpYnV0ZVN0YXRlLmRlZihpbmZvLm5hbWUpXG4gICAgICAgIGF0dHJpYnV0ZXMucHVzaChuZXcgQWN0aXZlSW5mbyhcbiAgICAgICAgICBpbmZvLm5hbWUsXG4gICAgICAgICAgZ2wuZ2V0QXR0cmliTG9jYXRpb24ocHJvZ3JhbSwgaW5mby5uYW1lKSxcbiAgICAgICAgICBpbmZvKSlcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gY2xlYXIgY2FjaGVkIHJlbmRlcmluZyBtZXRob2RzXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIGRlc2MuZHJhdyA9IGNvbXBpbGVTaGFkZXJEcmF3KGRlc2MpXG4gICAgZGVzYy5iYXRjaENhY2hlID0ge31cbiAgfVxuXG4gIGZ1bmN0aW9uIGdldFByb2dyYW0gKHZlcnRJZCwgZnJhZ0lkKSB7XG4gICAgdmFyIGNhY2hlID0gcHJvZ3JhbUNhY2hlW2ZyYWdJZF1cbiAgICBpZiAoIWNhY2hlKSB7XG4gICAgICBjYWNoZSA9IHByb2dyYW1DYWNoZVtmcmFnSWRdID0ge31cbiAgICB9XG4gICAgdmFyIHByb2dyYW0gPSBjYWNoZVt2ZXJ0SWRdXG4gICAgaWYgKCFwcm9ncmFtKSB7XG4gICAgICBwcm9ncmFtID0gbmV3IFJFR0xQcm9ncmFtKGZyYWdJZCwgdmVydElkKVxuICAgICAgbGlua1Byb2dyYW0ocHJvZ3JhbSlcbiAgICAgIGNhY2hlW3ZlcnRJZF0gPSBwcm9ncmFtXG4gICAgICBwcm9ncmFtTGlzdC5wdXNoKHByb2dyYW0pXG4gICAgfVxuICAgIHJldHVybiBwcm9ncmFtXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNyZWF0ZTogZ2V0UHJvZ3JhbSxcblxuICAgIGNsZWFyOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgZGVsZXRlU2hhZGVyID0gZ2wuZGVsZXRlU2hhZGVyLmJpbmQoZ2wpXG4gICAgICB2YWx1ZXMoZnJhZ1NoYWRlcnMpLmZvckVhY2goZGVsZXRlU2hhZGVyKVxuICAgICAgZnJhZ1NoYWRlcnMgPSB7fVxuICAgICAgdmFsdWVzKHZlcnRTaGFkZXJzKS5mb3JFYWNoKGRlbGV0ZVNoYWRlcilcbiAgICAgIHZlcnRTaGFkZXJzID0ge31cblxuICAgICAgcHJvZ3JhbUxpc3QuZm9yRWFjaChmdW5jdGlvbiAoZGVzYykge1xuICAgICAgICBnbC5kZWxldGVQcm9ncmFtKGRlc2MucHJvZ3JhbSlcbiAgICAgIH0pXG4gICAgICBwcm9ncmFtTGlzdC5sZW5ndGggPSAwXG4gICAgICBwcm9ncmFtQ2FjaGUgPSB7fVxuICAgIH0sXG5cbiAgICByZWZyZXNoOiBmdW5jdGlvbiAoKSB7XG4gICAgICBmcmFnU2hhZGVycyA9IHt9XG4gICAgICB2ZXJ0U2hhZGVycyA9IHt9XG4gICAgICBwcm9ncmFtTGlzdC5mb3JFYWNoKGxpbmtQcm9ncmFtKVxuICAgIH0sXG5cbiAgICBwcm9ncmFtczogWyBudWxsIF0sXG4gICAgZnJhZ1NoYWRlcnM6IFsgc3RyaW5nU3RvcmUuaWQoREVGQVVMVF9GUkFHX1NIQURFUikgXSxcbiAgICB2ZXJ0U2hhZGVyczogWyBzdHJpbmdTdG9yZS5pZChERUZBVUxUX1ZFUlRfU0hBREVSKSBdXG4gIH1cbn1cbiIsIi8vIEEgc3RhY2sgZm9yIG1hbmFnaW5nIHRoZSBzdGF0ZSBvZiBhIHNjYWxhci92ZWN0b3IgcGFyYW1ldGVyXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY3JlYXRlU3RhY2sgKGluaXQsIG9uQ2hhbmdlKSB7XG4gIHZhciBuID0gaW5pdC5sZW5ndGhcbiAgdmFyIHN0YWNrID0gaW5pdC5zbGljZSgpXG4gIHZhciBjdXJyZW50ID0gaW5pdC5zbGljZSgpXG4gIHZhciBkaXJ0eSA9IGZhbHNlXG4gIHZhciBmb3JjZURpcnR5ID0gdHJ1ZVxuXG4gIGZ1bmN0aW9uIHBvbGwgKCkge1xuICAgIHZhciBwdHIgPSBzdGFjay5sZW5ndGggLSBuXG4gICAgaWYgKGRpcnR5IHx8IGZvcmNlRGlydHkpIHtcbiAgICAgIHN3aXRjaCAobikge1xuICAgICAgICBjYXNlIDE6XG4gICAgICAgICAgb25DaGFuZ2Uoc3RhY2tbcHRyXSlcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlIDI6XG4gICAgICAgICAgb25DaGFuZ2Uoc3RhY2tbcHRyXSwgc3RhY2tbcHRyICsgMV0pXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSAzOlxuICAgICAgICAgIG9uQ2hhbmdlKHN0YWNrW3B0cl0sIHN0YWNrW3B0ciArIDFdLCBzdGFja1twdHIgKyAyXSlcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlIDQ6XG4gICAgICAgICAgb25DaGFuZ2Uoc3RhY2tbcHRyXSwgc3RhY2tbcHRyICsgMV0sIHN0YWNrW3B0ciArIDJdLCBzdGFja1twdHIgKyAzXSlcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlIDU6XG4gICAgICAgICAgb25DaGFuZ2Uoc3RhY2tbcHRyXSwgc3RhY2tbcHRyICsgMV0sIHN0YWNrW3B0ciArIDJdLCBzdGFja1twdHIgKyAzXSwgc3RhY2tbcHRyICsgNF0pXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSA2OlxuICAgICAgICAgIG9uQ2hhbmdlKHN0YWNrW3B0cl0sIHN0YWNrW3B0ciArIDFdLCBzdGFja1twdHIgKyAyXSwgc3RhY2tbcHRyICsgM10sIHN0YWNrW3B0ciArIDRdLCBzdGFja1twdHIgKyA1XSlcbiAgICAgICAgICBicmVha1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIG9uQ2hhbmdlLmFwcGx5KG51bGwsIHN0YWNrLnNsaWNlKHB0ciwgc3RhY2subGVuZ3RoKSlcbiAgICAgIH1cbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbjsgKytpKSB7XG4gICAgICAgIGN1cnJlbnRbaV0gPSBzdGFja1twdHIgKyBpXVxuICAgICAgfVxuICAgICAgZm9yY2VEaXJ0eSA9IGRpcnR5ID0gZmFsc2VcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIHB1c2g6IGZ1bmN0aW9uICgpIHtcbiAgICAgIGRpcnR5ID0gZmFsc2VcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbjsgKytpKSB7XG4gICAgICAgIHZhciB4ID0gYXJndW1lbnRzW2ldXG4gICAgICAgIGRpcnR5ID0gZGlydHkgfHwgKHggIT09IGN1cnJlbnRbaV0pXG4gICAgICAgIHN0YWNrLnB1c2goeClcbiAgICAgIH1cbiAgICB9LFxuXG4gICAgcG9wOiBmdW5jdGlvbiAoKSB7XG4gICAgICBkaXJ0eSA9IGZhbHNlXG4gICAgICBzdGFjay5sZW5ndGggLT0gblxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuOyArK2kpIHtcbiAgICAgICAgZGlydHkgPSBkaXJ0eSB8fCAoc3RhY2tbc3RhY2subGVuZ3RoIC0gbiArIGldICE9PSBjdXJyZW50W2ldKVxuICAgICAgfVxuICAgIH0sXG5cbiAgICBwb2xsOiBwb2xsLFxuXG4gICAgc2V0RGlydHk6IGZ1bmN0aW9uICgpIHtcbiAgICAgIGZvcmNlRGlydHkgPSB0cnVlXG4gICAgfVxuICB9XG59XG4iLCJ2YXIgY3JlYXRlU3RhY2sgPSByZXF1aXJlKCcuL3N0YWNrJylcbnZhciBjcmVhdGVFbnZpcm9ubWVudCA9IHJlcXVpcmUoJy4vY29kZWdlbicpXG5cbi8vIFdlYkdMIGNvbnN0YW50c1xudmFyIEdMX0NVTExfRkFDRSA9IDB4MEI0NFxudmFyIEdMX0JMRU5EID0gMHgwQkUyXG52YXIgR0xfRElUSEVSID0gMHgwQkQwXG52YXIgR0xfU1RFTkNJTF9URVNUID0gMHgwQjkwXG52YXIgR0xfREVQVEhfVEVTVCA9IDB4MEI3MVxudmFyIEdMX1NDSVNTT1JfVEVTVCA9IDB4MEMxMVxudmFyIEdMX1BPTFlHT05fT0ZGU0VUX0ZJTEwgPSAweDgwMzdcbnZhciBHTF9TQU1QTEVfQUxQSEFfVE9fQ09WRVJBR0UgPSAweDgwOUVcbnZhciBHTF9TQU1QTEVfQ09WRVJBR0UgPSAweDgwQTBcbnZhciBHTF9GVU5DX0FERCA9IDB4ODAwNlxudmFyIEdMX1pFUk8gPSAwXG52YXIgR0xfT05FID0gMVxudmFyIEdMX0ZST05UID0gMTAyOFxudmFyIEdMX0JBQ0sgPSAxMDI5XG52YXIgR0xfTEVTUyA9IDUxM1xudmFyIEdMX0NDVyA9IDIzMDVcbnZhciBHTF9BTFdBWVMgPSA1MTlcbnZhciBHTF9LRUVQID0gNzY4MFxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBDb250ZXh0U3RhdGUgKGdsLCBmcmFtZWJ1ZmZlclN0YXRlLCB2aWV3cG9ydFN0YXRlKSB7XG4gIGZ1bmN0aW9uIGNhcFN0YWNrIChjYXAsIGRmbHQpIHtcbiAgICB2YXIgcmVzdWx0ID0gY3JlYXRlU3RhY2soWyEhZGZsdF0sIGZ1bmN0aW9uIChmbGFnKSB7XG4gICAgICBpZiAoZmxhZykge1xuICAgICAgICBnbC5lbmFibGUoY2FwKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZ2wuZGlzYWJsZShjYXApXG4gICAgICB9XG4gICAgfSlcbiAgICByZXN1bHQuZmxhZyA9IGNhcFxuICAgIHJldHVybiByZXN1bHRcbiAgfVxuXG4gIC8vIENhcHMsIGZsYWdzIGFuZCBvdGhlciByYW5kb20gV2ViR0wgY29udGV4dCBzdGF0ZVxuICB2YXIgY29udGV4dFN0YXRlID0ge1xuICAgIC8vIERpdGhlcmluZ1xuICAgICdkaXRoZXInOiBjYXBTdGFjayhHTF9ESVRIRVIpLFxuXG4gICAgLy8gQmxlbmRpbmdcbiAgICAnYmxlbmQuZW5hYmxlJzogY2FwU3RhY2soR0xfQkxFTkQpLFxuICAgICdibGVuZC5jb2xvcic6IGNyZWF0ZVN0YWNrKFswLCAwLCAwLCAwXSwgZnVuY3Rpb24gKHIsIGcsIGIsIGEpIHtcbiAgICAgIGdsLmJsZW5kQ29sb3IociwgZywgYiwgYSlcbiAgICB9KSxcbiAgICAnYmxlbmQuZXF1YXRpb24nOiBjcmVhdGVTdGFjayhbR0xfRlVOQ19BREQsIEdMX0ZVTkNfQUREXSwgZnVuY3Rpb24gKHJnYiwgYSkge1xuICAgICAgZ2wuYmxlbmRFcXVhdGlvblNlcGFyYXRlKHJnYiwgYSlcbiAgICB9KSxcbiAgICAnYmxlbmQuZnVuYyc6IGNyZWF0ZVN0YWNrKFtcbiAgICAgIEdMX09ORSwgR0xfWkVSTywgR0xfT05FLCBHTF9aRVJPXG4gICAgXSwgZnVuY3Rpb24gKHNyY1JHQiwgZHN0UkdCLCBzcmNBbHBoYSwgZHN0QWxwaGEpIHtcbiAgICAgIGdsLmJsZW5kRnVuY1NlcGFyYXRlKHNyY1JHQiwgZHN0UkdCLCBzcmNBbHBoYSwgZHN0QWxwaGEpXG4gICAgfSksXG5cbiAgICAvLyBEZXB0aFxuICAgICdkZXB0aC5lbmFibGUnOiBjYXBTdGFjayhHTF9ERVBUSF9URVNULCB0cnVlKSxcbiAgICAnZGVwdGguZnVuYyc6IGNyZWF0ZVN0YWNrKFtHTF9MRVNTXSwgZnVuY3Rpb24gKGZ1bmMpIHtcbiAgICAgIGdsLmRlcHRoRnVuYyhmdW5jKVxuICAgIH0pLFxuICAgICdkZXB0aC5yYW5nZSc6IGNyZWF0ZVN0YWNrKFswLCAxXSwgZnVuY3Rpb24gKG5lYXIsIGZhcikge1xuICAgICAgZ2wuZGVwdGhSYW5nZShuZWFyLCBmYXIpXG4gICAgfSksXG4gICAgJ2RlcHRoLm1hc2snOiBjcmVhdGVTdGFjayhbdHJ1ZV0sIGZ1bmN0aW9uIChtKSB7XG4gICAgICBnbC5kZXB0aE1hc2sobSlcbiAgICB9KSxcblxuICAgIC8vIEZhY2UgY3VsbGluZ1xuICAgICdjdWxsLmVuYWJsZSc6IGNhcFN0YWNrKEdMX0NVTExfRkFDRSksXG4gICAgJ2N1bGwuZmFjZSc6IGNyZWF0ZVN0YWNrKFtHTF9CQUNLXSwgZnVuY3Rpb24gKG1vZGUpIHtcbiAgICAgIGdsLmN1bGxGYWNlKG1vZGUpXG4gICAgfSksXG5cbiAgICAvLyBGcm9udCBmYWNlIG9yaWVudGF0aW9uXG4gICAgJ2Zyb250RmFjZSc6IGNyZWF0ZVN0YWNrKFtHTF9DQ1ddLCBmdW5jdGlvbiAobW9kZSkge1xuICAgICAgZ2wuZnJvbnRGYWNlKG1vZGUpXG4gICAgfSksXG5cbiAgICAvLyBXcml0ZSBtYXNrc1xuICAgICdjb2xvck1hc2snOiBjcmVhdGVTdGFjayhbdHJ1ZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZV0sIGZ1bmN0aW9uIChyLCBnLCBiLCBhKSB7XG4gICAgICBnbC5jb2xvck1hc2sociwgZywgYiwgYSlcbiAgICB9KSxcblxuICAgIC8vIExpbmUgd2lkdGhcbiAgICAnbGluZVdpZHRoJzogY3JlYXRlU3RhY2soWzFdLCBmdW5jdGlvbiAodykge1xuICAgICAgZ2wubGluZVdpZHRoKHcpXG4gICAgfSksXG5cbiAgICAvLyBQb2x5Z29uIG9mZnNldFxuICAgICdwb2x5Z29uT2Zmc2V0LmVuYWJsZSc6IGNhcFN0YWNrKEdMX1BPTFlHT05fT0ZGU0VUX0ZJTEwpLFxuICAgICdwb2x5Z29uT2Zmc2V0Lm9mZnNldCc6IGNyZWF0ZVN0YWNrKFswLCAwXSwgZnVuY3Rpb24gKGZhY3RvciwgdW5pdHMpIHtcbiAgICAgIGdsLnBvbHlnb25PZmZzZXQoZmFjdG9yLCB1bml0cylcbiAgICB9KSxcblxuICAgIC8vIFNhbXBsZSBjb3ZlcmFnZVxuICAgICdzYW1wbGUuYWxwaGEnOiBjYXBTdGFjayhHTF9TQU1QTEVfQUxQSEFfVE9fQ09WRVJBR0UpLFxuICAgICdzYW1wbGUuZW5hYmxlJzogY2FwU3RhY2soR0xfU0FNUExFX0NPVkVSQUdFKSxcbiAgICAnc2FtcGxlLmNvdmVyYWdlJzogY3JlYXRlU3RhY2soWzEsIGZhbHNlXSwgZnVuY3Rpb24gKHZhbHVlLCBpbnZlcnQpIHtcbiAgICAgIGdsLnNhbXBsZUNvdmVyYWdlKHZhbHVlLCBpbnZlcnQpXG4gICAgfSksXG5cbiAgICAvLyBTdGVuY2lsXG4gICAgJ3N0ZW5jaWwuZW5hYmxlJzogY2FwU3RhY2soR0xfU1RFTkNJTF9URVNUKSxcbiAgICAnc3RlbmNpbC5tYXNrJzogY3JlYXRlU3RhY2soWy0xXSwgZnVuY3Rpb24gKG1hc2spIHtcbiAgICAgIGdsLnN0ZW5jaWxNYXNrKG1hc2spXG4gICAgfSksXG4gICAgJ3N0ZW5jaWwuZnVuYyc6IGNyZWF0ZVN0YWNrKFtcbiAgICAgIEdMX0FMV0FZUywgMCwgLTFcbiAgICBdLCBmdW5jdGlvbiAoZnVuYywgcmVmLCBtYXNrKSB7XG4gICAgICBnbC5zdGVuY2lsRnVuYyhmdW5jLCByZWYsIG1hc2spXG4gICAgfSksXG4gICAgJ3N0ZW5jaWwub3BGcm9udCc6IGNyZWF0ZVN0YWNrKFtcbiAgICAgIEdMX0tFRVAsIEdMX0tFRVAsIEdMX0tFRVBcbiAgICBdLCBmdW5jdGlvbiAoZmFpbCwgemZhaWwsIHBhc3MpIHtcbiAgICAgIGdsLnN0ZW5jaWxPcFNlcGFyYXRlKEdMX0ZST05ULCBmYWlsLCB6ZmFpbCwgcGFzcylcbiAgICB9KSxcbiAgICAnc3RlbmNpbC5vcEJhY2snOiBjcmVhdGVTdGFjayhbXG4gICAgICBHTF9LRUVQLCBHTF9LRUVQLCBHTF9LRUVQXG4gICAgXSwgZnVuY3Rpb24gKGZhaWwsIHpmYWlsLCBwYXNzKSB7XG4gICAgICBnbC5zdGVuY2lsT3BTZXBhcmF0ZShHTF9CQUNLLCBmYWlsLCB6ZmFpbCwgcGFzcylcbiAgICB9KSxcblxuICAgIC8vIFNjaXNzb3JcbiAgICAnc2Npc3Nvci5lbmFibGUnOiBjYXBTdGFjayhHTF9TQ0lTU09SX1RFU1QpLFxuICAgICdzY2lzc29yLmJveCc6IGNyZWF0ZVN0YWNrKFswLCAwLCAtMSwgLTFdLCBmdW5jdGlvbiAoeCwgeSwgdywgaCkge1xuICAgICAgdmFyIHdfID0gd1xuICAgICAgdmFyIGZibyA9IGZyYW1lYnVmZmVyU3RhdGUudG9wKClcbiAgICAgIGlmICh3IDwgMCkge1xuICAgICAgICBpZiAoZmJvKSB7XG4gICAgICAgICAgd18gPSBmYm8ud2lkdGggLSB4XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgd18gPSBnbC5kcmF3aW5nQnVmZmVyV2lkdGggLSB4XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHZhciBoXyA9IGhcbiAgICAgIGlmIChoIDwgMCkge1xuICAgICAgICBpZiAoZmJvKSB7XG4gICAgICAgICAgaF8gPSBmYm8uaGVpZ2h0IC0geVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGhfID0gZ2wuZHJhd2luZ0J1ZmZlckhlaWdodCAtIHlcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgZ2wuc2Npc3Nvcih4LCB5LCB3XywgaF8pXG4gICAgfSksXG5cbiAgICAvLyBWaWV3cG9ydFxuICAgICd2aWV3cG9ydCc6IGNyZWF0ZVN0YWNrKFswLCAwLCAtMSwgLTFdLCBmdW5jdGlvbiAoeCwgeSwgdywgaCkge1xuICAgICAgdmFyIHdfID0gd1xuICAgICAgdmFyIGZibyA9IGZyYW1lYnVmZmVyU3RhdGUudG9wKClcbiAgICAgIGlmICh3IDwgMCkge1xuICAgICAgICBpZiAoZmJvKSB7XG4gICAgICAgICAgd18gPSBmYm8ud2lkdGggLSB4XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgd18gPSBnbC5kcmF3aW5nQnVmZmVyV2lkdGggLSB4XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHZhciBoXyA9IGhcbiAgICAgIGlmIChoIDwgMCkge1xuICAgICAgICBpZiAoZmJvKSB7XG4gICAgICAgICAgaF8gPSBmYm8uaGVpZ2h0IC0geVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGhfID0gZ2wuZHJhd2luZ0J1ZmZlckhlaWdodCAtIHlcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgZ2wudmlld3BvcnQoeCwgeSwgd18sIGhfKVxuICAgICAgdmlld3BvcnRTdGF0ZS53aWR0aCA9IHdfXG4gICAgICB2aWV3cG9ydFN0YXRlLmhlaWdodCA9IGhfXG4gICAgfSlcbiAgfVxuXG4gIHZhciBlbnYgPSBjcmVhdGVFbnZpcm9ubWVudCgpXG4gIHZhciBwb2xsID0gZW52LnByb2MoJ3BvbGwnKVxuICB2YXIgcmVmcmVzaCA9IGVudi5wcm9jKCdyZWZyZXNoJylcbiAgT2JqZWN0LmtleXMoY29udGV4dFN0YXRlKS5mb3JFYWNoKGZ1bmN0aW9uIChwcm9wKSB7XG4gICAgdmFyIFNUQUNLID0gZW52LmxpbmsoY29udGV4dFN0YXRlW3Byb3BdKVxuICAgIHBvbGwoU1RBQ0ssICcucG9sbCgpOycpXG4gICAgcmVmcmVzaChTVEFDSywgJy5zZXREaXJ0eSgpOycpXG4gIH0pXG5cbiAgdmFyIHByb2NzID0gZW52LmNvbXBpbGUoKVxuXG4gIHJldHVybiB7XG4gICAgY29udGV4dFN0YXRlOiBjb250ZXh0U3RhdGUsXG4gICAgdmlld3BvcnQ6IHZpZXdwb3J0U3RhdGUsXG4gICAgcG9sbDogcHJvY3MucG9sbCxcbiAgICByZWZyZXNoOiBwcm9jcy5yZWZyZXNoLFxuXG4gICAgbm90aWZ5Vmlld3BvcnRDaGFuZ2VkOiBmdW5jdGlvbiAoKSB7XG4gICAgICBjb250ZXh0U3RhdGUudmlld3BvcnQuc2V0RGlydHkoKVxuICAgICAgY29udGV4dFN0YXRlWydzY2lzc29yLmJveCddLnNldERpcnR5KClcbiAgICB9XG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY3JlYXRlU3RyaW5nU3RvcmUoKSB7XG4gIHZhciBzdHJpbmdJZHMgPSB7fVxuICB2YXIgc3RyaW5nVmFsdWVzID0gWycnXVxuICByZXR1cm4ge1xuICAgIGlkOiBmdW5jdGlvbiAoc3RyKSB7XG4gICAgICB2YXIgcmVzdWx0ID0gc3RyaW5nSWRzW3N0cl1cbiAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgfVxuICAgICAgcmVzdWx0ID0gc3RyaW5nSWRzW3N0cl0gPSBzdHJpbmdWYWx1ZXMubGVuZ3RoXG4gICAgICBzdHJpbmdWYWx1ZXMucHVzaChzdHIpXG4gICAgICByZXR1cm4gcmVzdWx0XG4gICAgfSxcblxuICAgIHN0cjogZnVuY3Rpb24gKGlkKSB7XG4gICAgICByZXR1cm4gc3RyaW5nVmFsdWVzW2lkXVxuICAgIH1cbiAgfVxufVxuIiwiXG52YXIgZXh0ZW5kID0gcmVxdWlyZSgnLi9leHRlbmQnKVxudmFyIHZhbHVlcyA9IHJlcXVpcmUoJy4vdmFsdWVzJylcbnZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL2lzLXR5cGVkLWFycmF5JylcbnZhciBpc05EQXJyYXlMaWtlID0gcmVxdWlyZSgnLi9pcy1uZGFycmF5JylcbnZhciBsb2FkVGV4dHVyZSA9IHJlcXVpcmUoJy4vbG9hZC10ZXh0dXJlJylcbnZhciBjb252ZXJ0VG9IYWxmRmxvYXQgPSByZXF1aXJlKCcuL3RvLWhhbGYtZmxvYXQnKVxudmFyIHBhcnNlRERTID0gcmVxdWlyZSgnLi9wYXJzZS1kZHMnKVxuXG52YXIgR0xfQ09NUFJFU1NFRF9URVhUVVJFX0ZPUk1BVFMgPSAweDg2QTNcblxudmFyIEdMX1RFWFRVUkVfMkQgPSAweDBERTFcbnZhciBHTF9URVhUVVJFX0NVQkVfTUFQID0gMHg4NTEzXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YID0gMHg4NTE1XG5cbnZhciBHTF9SR0JBID0gMHgxOTA4XG52YXIgR0xfQUxQSEEgPSAweDE5MDZcbnZhciBHTF9SR0IgPSAweDE5MDdcbnZhciBHTF9MVU1JTkFOQ0UgPSAweDE5MDlcbnZhciBHTF9MVU1JTkFOQ0VfQUxQSEEgPSAweDE5MEFcblxudmFyIEdMX1JHQkE0ID0gMHg4MDU2XG52YXIgR0xfUkdCNV9BMSA9IDB4ODA1N1xudmFyIEdMX1JHQjU2NSA9IDB4OEQ2MlxuXG52YXIgR0xfVU5TSUdORURfU0hPUlRfNF80XzRfNCA9IDB4ODAzM1xudmFyIEdMX1VOU0lHTkVEX1NIT1JUXzVfNV81XzEgPSAweDgwMzRcbnZhciBHTF9VTlNJR05FRF9TSE9SVF81XzZfNSA9IDB4ODM2M1xudmFyIEdMX1VOU0lHTkVEX0lOVF8yNF84X1dFQkdMID0gMHg4NEZBXG5cbnZhciBHTF9ERVBUSF9DT01QT05FTlQgPSAweDE5MDJcbnZhciBHTF9ERVBUSF9TVEVOQ0lMID0gMHg4NEY5XG5cbnZhciBHTF9TUkdCX0VYVCA9IDB4OEM0MFxudmFyIEdMX1NSR0JfQUxQSEFfRVhUID0gMHg4QzQyXG5cbnZhciBHTF9IQUxGX0ZMT0FUX09FUyA9IDB4OEQ2MVxuXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfUzNUQ19EWFQxX0VYVCA9IDB4ODNGMFxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDFfRVhUID0gMHg4M0YxXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUM19FWFQgPSAweDgzRjJcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQ1X0VYVCA9IDB4ODNGM1xuXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfQVRDX1dFQkdMID0gMHg4QzkyXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19FWFBMSUNJVF9BTFBIQV9XRUJHTCA9IDB4OEM5M1xudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9BVENfSU5URVJQT0xBVEVEX0FMUEhBX1dFQkdMID0gMHg4N0VFXG5cbnZhciBHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ180QlBQVjFfSU1HID0gMHg4QzAwXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfUFZSVENfMkJQUFYxX0lNRyA9IDB4OEMwMVxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9QVlJUQ180QlBQVjFfSU1HID0gMHg4QzAyXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1BWUlRDXzJCUFBWMV9JTUcgPSAweDhDMDNcblxudmFyIEdMX0NPTVBSRVNTRURfUkdCX0VUQzFfV0VCR0wgPSAweDhENjRcblxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSAweDE0MDFcbnZhciBHTF9VTlNJR05FRF9TSE9SVCA9IDB4MTQwM1xudmFyIEdMX1VOU0lHTkVEX0lOVCA9IDB4MTQwNVxudmFyIEdMX0ZMT0FUID0gMHgxNDA2XG5cbnZhciBHTF9URVhUVVJFX1dSQVBfUyA9IDB4MjgwMlxudmFyIEdMX1RFWFRVUkVfV1JBUF9UID0gMHgyODAzXG5cbnZhciBHTF9SRVBFQVQgPSAweDI5MDFcbnZhciBHTF9DTEFNUF9UT19FREdFID0gMHg4MTJGXG52YXIgR0xfTUlSUk9SRURfUkVQRUFUID0gMHg4MzcwXG5cbnZhciBHTF9URVhUVVJFX01BR19GSUxURVIgPSAweDI4MDBcbnZhciBHTF9URVhUVVJFX01JTl9GSUxURVIgPSAweDI4MDFcblxudmFyIEdMX05FQVJFU1QgPSAweDI2MDBcbnZhciBHTF9MSU5FQVIgPSAweDI2MDFcbnZhciBHTF9ORUFSRVNUX01JUE1BUF9ORUFSRVNUID0gMHgyNzAwXG52YXIgR0xfTElORUFSX01JUE1BUF9ORUFSRVNUID0gMHgyNzAxXG52YXIgR0xfTkVBUkVTVF9NSVBNQVBfTElORUFSID0gMHgyNzAyXG52YXIgR0xfTElORUFSX01JUE1BUF9MSU5FQVIgPSAweDI3MDNcblxudmFyIEdMX0dFTkVSQVRFX01JUE1BUF9ISU5UID0gMHg4MTkyXG52YXIgR0xfRE9OVF9DQVJFID0gMHgxMTAwXG52YXIgR0xfRkFTVEVTVCA9IDB4MTEwMVxudmFyIEdMX05JQ0VTVCA9IDB4MTEwMlxuXG52YXIgR0xfVEVYVFVSRV9NQVhfQU5JU09UUk9QWV9FWFQgPSAweDg0RkVcblxudmFyIEdMX1VOUEFDS19BTElHTk1FTlQgPSAweDBDRjVcbnZhciBHTF9VTlBBQ0tfRkxJUF9ZX1dFQkdMID0gMHg5MjQwXG52YXIgR0xfVU5QQUNLX1BSRU1VTFRJUExZX0FMUEhBX1dFQkdMID0gMHg5MjQxXG52YXIgR0xfVU5QQUNLX0NPTE9SU1BBQ0VfQ09OVkVSU0lPTl9XRUJHTCA9IDB4OTI0M1xuXG52YXIgR0xfQlJPV1NFUl9ERUZBVUxUX1dFQkdMID0gMHg5MjQ0XG5cbnZhciBHTF9URVhUVVJFMCA9IDB4ODRDMFxuXG52YXIgTUlQTUFQX0ZJTFRFUlMgPSBbXG4gIEdMX05FQVJFU1RfTUlQTUFQX05FQVJFU1QsXG4gIEdMX05FQVJFU1RfTUlQTUFQX0xJTkVBUixcbiAgR0xfTElORUFSX01JUE1BUF9ORUFSRVNULFxuICBHTF9MSU5FQVJfTUlQTUFQX0xJTkVBUlxuXVxuXG5mdW5jdGlvbiBpc1BvdzIgKHYpIHtcbiAgcmV0dXJuICEodiAmICh2IC0gMSkpICYmICghIXYpXG59XG5cbmZ1bmN0aW9uIGlzTnVtZXJpY0FycmF5IChhcnIpIHtcbiAgcmV0dXJuIChcbiAgICBBcnJheS5pc0FycmF5KGFycikgJiZcbiAgICAoYXJyLmxlbmd0aCA9PT0gMCB8fFxuICAgIHR5cGVvZiBhcnJbMF0gPT09ICdudW1iZXInKSlcbn1cblxuZnVuY3Rpb24gaXNSZWN0QXJyYXkgKGFycikge1xuICBpZiAoIUFycmF5LmlzQXJyYXkoYXJyKSkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG5cbiAgdmFyIHdpZHRoID0gYXJyLmxlbmd0aFxuICBpZiAod2lkdGggPT09IDAgfHwgIUFycmF5LmlzQXJyYXkoYXJyWzBdKSkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG5cbiAgdmFyIGhlaWdodCA9IGFyclswXS5sZW5ndGhcbiAgZm9yICh2YXIgaSA9IDE7IGkgPCB3aWR0aDsgKytpKSB7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGFycltpXSkgfHwgYXJyW2ldLmxlbmd0aCAhPT0gaGVpZ2h0KSB7XG4gICAgICByZXR1cm4gZmFsc2VcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRydWVcbn1cblxuZnVuY3Rpb24gY2xhc3NTdHJpbmcgKHgpIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh4KVxufVxuXG5mdW5jdGlvbiBpc0NhbnZhc0VsZW1lbnQgKG9iamVjdCkge1xuICByZXR1cm4gY2xhc3NTdHJpbmcob2JqZWN0KSA9PT0gJ1tvYmplY3QgSFRNTENhbnZhc0VsZW1lbnRdJ1xufVxuXG5mdW5jdGlvbiBpc0NvbnRleHQyRCAob2JqZWN0KSB7XG4gIHJldHVybiBjbGFzc1N0cmluZyhvYmplY3QpID09PSAnW29iamVjdCBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkRdJ1xufVxuXG5mdW5jdGlvbiBpc0ltYWdlRWxlbWVudCAob2JqZWN0KSB7XG4gIHJldHVybiBjbGFzc1N0cmluZyhvYmplY3QpID09PSAnW29iamVjdCBIVE1MSW1hZ2VFbGVtZW50XSdcbn1cblxuZnVuY3Rpb24gaXNWaWRlb0VsZW1lbnQgKG9iamVjdCkge1xuICByZXR1cm4gY2xhc3NTdHJpbmcob2JqZWN0KSA9PT0gJ1tvYmplY3QgSFRNTFZpZGVvRWxlbWVudF0nXG59XG5cbmZ1bmN0aW9uIGlzUGVuZGluZ1hIUiAob2JqZWN0KSB7XG4gIHJldHVybiBjbGFzc1N0cmluZyhvYmplY3QpID09PSAnW29iamVjdCBYTUxIdHRwUmVxdWVzdF0nXG59XG5cbmZ1bmN0aW9uIGlzUGl4ZWxEYXRhIChvYmplY3QpIHtcbiAgcmV0dXJuIChcbiAgICB0eXBlb2Ygb2JqZWN0ID09PSAnc3RyaW5nJyB8fFxuICAgICghIW9iamVjdCAmJiAoXG4gICAgICBpc1R5cGVkQXJyYXkob2JqZWN0KSB8fFxuICAgICAgaXNOdW1lcmljQXJyYXkob2JqZWN0KSB8fFxuICAgICAgaXNOREFycmF5TGlrZShvYmplY3QpIHx8XG4gICAgICBpc0NhbnZhc0VsZW1lbnQob2JqZWN0KSB8fFxuICAgICAgaXNDb250ZXh0MkQob2JqZWN0KSB8fFxuICAgICAgaXNJbWFnZUVsZW1lbnQob2JqZWN0KSB8fFxuICAgICAgaXNWaWRlb0VsZW1lbnQob2JqZWN0KSB8fFxuICAgICAgaXNSZWN0QXJyYXkob2JqZWN0KSkpKVxufVxuXG4vLyBUcmFuc3Bvc2UgYW4gYXJyYXkgb2YgcGl4ZWxzXG5mdW5jdGlvbiB0cmFuc3Bvc2VQaXhlbHMgKGRhdGEsIG54LCBueSwgbmMsIHN4LCBzeSwgc2MsIG9mZikge1xuICB2YXIgcmVzdWx0ID0gbmV3IGRhdGEuY29uc3RydWN0b3IobnggKiBueSAqIG5jKVxuICB2YXIgcHRyID0gMFxuICBmb3IgKHZhciBpID0gMDsgaSA8IG55OyArK2kpIHtcbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IG54OyArK2opIHtcbiAgICAgIGZvciAodmFyIGsgPSAwOyBrIDwgbmM7ICsraykge1xuICAgICAgICByZXN1bHRbcHRyKytdID0gZGF0YVtzeSAqIGkgKyBzeCAqIGogKyBzYyAqIGsgKyBvZmZdXG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHRcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjcmVhdGVUZXh0dXJlU2V0IChnbCwgZXh0ZW5zaW9ucywgbGltaXRzLCByZWdsUG9sbCwgdmlld3BvcnRTdGF0ZSkge1xuICB2YXIgbWlwbWFwSGludCA9IHtcbiAgICBcImRvbid0IGNhcmVcIjogR0xfRE9OVF9DQVJFLFxuICAgICdkb250IGNhcmUnOiBHTF9ET05UX0NBUkUsXG4gICAgJ25pY2UnOiBHTF9OSUNFU1QsXG4gICAgJ2Zhc3QnOiBHTF9GQVNURVNUXG4gIH1cblxuICB2YXIgd3JhcE1vZGVzID0ge1xuICAgICdyZXBlYXQnOiBHTF9SRVBFQVQsXG4gICAgJ2NsYW1wJzogR0xfQ0xBTVBfVE9fRURHRSxcbiAgICAnbWlycm9yJzogR0xfTUlSUk9SRURfUkVQRUFUXG4gIH1cblxuICB2YXIgbWFnRmlsdGVycyA9IHtcbiAgICAnbmVhcmVzdCc6IEdMX05FQVJFU1QsXG4gICAgJ2xpbmVhcic6IEdMX0xJTkVBUlxuICB9XG5cbiAgdmFyIG1pbkZpbHRlcnMgPSBleHRlbmQoe1xuICAgICduZWFyZXN0IG1pcG1hcCBuZWFyZXN0JzogR0xfTkVBUkVTVF9NSVBNQVBfTkVBUkVTVCxcbiAgICAnbGluZWFyIG1pcG1hcCBuZWFyZXN0JzogR0xfTElORUFSX01JUE1BUF9ORUFSRVNULFxuICAgICduZWFyZXN0IG1pcG1hcCBsaW5lYXInOiBHTF9ORUFSRVNUX01JUE1BUF9MSU5FQVIsXG4gICAgJ2xpbmVhciBtaXBtYXAgbGluZWFyJzogR0xfTElORUFSX01JUE1BUF9MSU5FQVIsXG4gICAgJ21pcG1hcCc6IEdMX0xJTkVBUl9NSVBNQVBfTElORUFSXG4gIH0sIG1hZ0ZpbHRlcnMpXG5cbiAgdmFyIGNvbG9yU3BhY2UgPSB7XG4gICAgJ25vbmUnOiAwLFxuICAgICdicm93c2VyJzogR0xfQlJPV1NFUl9ERUZBVUxUX1dFQkdMXG4gIH1cblxuICB2YXIgdGV4dHVyZVR5cGVzID0ge1xuICAgICd1aW50OCc6IEdMX1VOU0lHTkVEX0JZVEUsXG4gICAgJ3JnYmE0JzogR0xfVU5TSUdORURfU0hPUlRfNF80XzRfNCxcbiAgICAncmdiNTY1JzogR0xfVU5TSUdORURfU0hPUlRfNV82XzUsXG4gICAgJ3JnYjUgYTEnOiBHTF9VTlNJR05FRF9TSE9SVF81XzVfNV8xXG4gIH1cblxuICB2YXIgdGV4dHVyZUZvcm1hdHMgPSB7XG4gICAgJ2FscGhhJzogR0xfQUxQSEEsXG4gICAgJ2x1bWluYW5jZSc6IEdMX0xVTUlOQU5DRSxcbiAgICAnbHVtaW5hbmNlIGFscGhhJzogR0xfTFVNSU5BTkNFX0FMUEhBLFxuICAgICdyZ2InOiBHTF9SR0IsXG4gICAgJ3JnYmEnOiBHTF9SR0JBLFxuICAgICdyZ2JhNCc6IEdMX1JHQkE0LFxuICAgICdyZ2I1IGExJzogR0xfUkdCNV9BMSxcbiAgICAncmdiNTY1JzogR0xfUkdCNTY1XG4gIH1cblxuICB2YXIgY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzID0ge31cblxuICBpZiAoZXh0ZW5zaW9ucy5leHRfc3JnYikge1xuICAgIHRleHR1cmVGb3JtYXRzLnNyZ2IgPSBHTF9TUkdCX0VYVFxuICAgIHRleHR1cmVGb3JtYXRzLnNyZ2JhID0gR0xfU1JHQl9BTFBIQV9FWFRcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLm9lc190ZXh0dXJlX2Zsb2F0KSB7XG4gICAgdGV4dHVyZVR5cGVzLmZsb2F0ID0gR0xfRkxPQVRcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLm9lc190ZXh0dXJlX2hhbGZfZmxvYXQpIHtcbiAgICB0ZXh0dXJlVHlwZXNbJ2hhbGYgZmxvYXQnXSA9IEdMX0hBTEZfRkxPQVRfT0VTXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9kZXB0aF90ZXh0dXJlKSB7XG4gICAgZXh0ZW5kKHRleHR1cmVGb3JtYXRzLCB7XG4gICAgICAnZGVwdGgnOiBHTF9ERVBUSF9DT01QT05FTlQsXG4gICAgICAnZGVwdGggc3RlbmNpbCc6IEdMX0RFUFRIX1NURU5DSUxcbiAgICB9KVxuXG4gICAgZXh0ZW5kKHRleHR1cmVUeXBlcywge1xuICAgICAgJ3VpbnQxNic6IEdMX1VOU0lHTkVEX1NIT1JULFxuICAgICAgJ3VpbnQzMic6IEdMX1VOU0lHTkVEX0lOVCxcbiAgICAgICdkZXB0aCBzdGVuY2lsJzogR0xfVU5TSUdORURfSU5UXzI0XzhfV0VCR0xcbiAgICB9KVxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29tcHJlc3NlZF90ZXh0dXJlX3MzdGMpIHtcbiAgICBleHRlbmQoY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzLCB7XG4gICAgICAncmdiIHMzdGMgZHh0MSc6IEdMX0NPTVBSRVNTRURfUkdCX1MzVENfRFhUMV9FWFQsXG4gICAgICAncmdiYSBzM3RjIGR4dDEnOiBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQxX0VYVCxcbiAgICAgICdyZ2JhIHMzdGMgZHh0Myc6IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDNfRVhULFxuICAgICAgJ3JnYmEgczN0YyBkeHQ1JzogR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUNV9FWFRcbiAgICB9KVxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29tcHJlc3NlZF90ZXh0dXJlX2F0Yykge1xuICAgIGV4dGVuZChjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHMsIHtcbiAgICAgICdyZ2IgYXJjJzogR0xfQ09NUFJFU1NFRF9SR0JfQVRDX1dFQkdMLFxuICAgICAgJ3JnYmEgYXRjIGV4cGxpY2l0IGFscGhhJzogR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19FWFBMSUNJVF9BTFBIQV9XRUJHTCxcbiAgICAgICdyZ2JhIGF0YyBpbnRlcnBvbGF0ZWQgYWxwaGEnOiBHTF9DT01QUkVTU0VEX1JHQkFfQVRDX0lOVEVSUE9MQVRFRF9BTFBIQV9XRUJHTFxuICAgIH0pXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb21wcmVzc2VkX3RleHR1cmVfcHZydGMpIHtcbiAgICBleHRlbmQoY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzLCB7XG4gICAgICAncmdiIHB2cnRjIDRicHB2MSc6IEdMX0NPTVBSRVNTRURfUkdCX1BWUlRDXzRCUFBWMV9JTUcsXG4gICAgICAncmdiIHB2cnRjIDJicHB2MSc6IEdMX0NPTVBSRVNTRURfUkdCX1BWUlRDXzJCUFBWMV9JTUcsXG4gICAgICAncmdiYSBwdnJ0YyA0YnBwdjEnOiBHTF9DT01QUkVTU0VEX1JHQkFfUFZSVENfNEJQUFYxX0lNRyxcbiAgICAgICdyZ2JhIHB2cnRjIDJicHB2MSc6IEdMX0NPTVBSRVNTRURfUkdCQV9QVlJUQ18yQlBQVjFfSU1HXG4gICAgfSlcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9ldGMxKSB7XG4gICAgY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzWydyZ2IgZXRjMSddID0gR0xfQ09NUFJFU1NFRF9SR0JfRVRDMV9XRUJHTFxuICB9XG5cbiAgLy8gQ29weSBvdmVyIGFsbCB0ZXh0dXJlIGZvcm1hdHNcbiAgdmFyIHN1cHBvcnRlZENvbXByZXNzZWRGb3JtYXRzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoXG4gICAgZ2wuZ2V0UGFyYW1ldGVyKEdMX0NPTVBSRVNTRURfVEVYVFVSRV9GT1JNQVRTKSlcbiAgT2JqZWN0LmtleXMoY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdmFyIGZvcm1hdCA9IGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0c1tuYW1lXVxuICAgIGlmIChzdXBwb3J0ZWRDb21wcmVzc2VkRm9ybWF0cy5pbmRleE9mKGZvcm1hdCkgPj0gMCkge1xuICAgICAgdGV4dHVyZUZvcm1hdHNbbmFtZV0gPSBmb3JtYXRcbiAgICB9XG4gIH0pXG5cbiAgdmFyIHN1cHBvcnRlZEZvcm1hdHMgPSBPYmplY3Qua2V5cyh0ZXh0dXJlRm9ybWF0cylcbiAgbGltaXRzLnRleHR1cmVGb3JtYXRzID0gc3VwcG9ydGVkRm9ybWF0c1xuXG4gIHZhciBjb2xvckZvcm1hdHMgPSBzdXBwb3J0ZWRGb3JtYXRzLnJlZHVjZShmdW5jdGlvbiAoY29sb3IsIGtleSkge1xuICAgIHZhciBnbGVudW0gPSB0ZXh0dXJlRm9ybWF0c1trZXldXG4gICAgaWYgKGdsZW51bSA9PT0gR0xfTFVNSU5BTkNFIHx8XG4gICAgICAgIGdsZW51bSA9PT0gR0xfQUxQSEEgfHxcbiAgICAgICAgZ2xlbnVtID09PSBHTF9MVU1JTkFOQ0UgfHxcbiAgICAgICAgZ2xlbnVtID09PSBHTF9MVU1JTkFOQ0VfQUxQSEEgfHxcbiAgICAgICAgZ2xlbnVtID09PSBHTF9ERVBUSF9DT01QT05FTlQgfHxcbiAgICAgICAgZ2xlbnVtID09PSBHTF9ERVBUSF9TVEVOQ0lMKSB7XG4gICAgICBjb2xvcltnbGVudW1dID0gZ2xlbnVtXG4gICAgfSBlbHNlIGlmIChnbGVudW0gPT09IEdMX1JHQjVfQTEgfHwga2V5LmluZGV4T2YoJ3JnYmEnKSA+PSAwKSB7XG4gICAgICBjb2xvcltnbGVudW1dID0gR0xfUkdCQVxuICAgIH0gZWxzZSB7XG4gICAgICBjb2xvcltnbGVudW1dID0gR0xfUkdCXG4gICAgfVxuICAgIHJldHVybiBjb2xvclxuICB9LCB7fSlcblxuICAvLyBQaXhlbCBzdG9yYWdlIHBhcnNpbmdcbiAgZnVuY3Rpb24gUGl4ZWxJbmZvICh0YXJnZXQpIHtcbiAgICAvLyB0ZXggdGFyZ2V0XG4gICAgdGhpcy50YXJnZXQgPSB0YXJnZXRcblxuICAgIC8vIHBpeGVsU3RvcmVpIGluZm9cbiAgICB0aGlzLmZsaXBZID0gZmFsc2VcbiAgICB0aGlzLnByZW11bHRpcGx5QWxwaGEgPSBmYWxzZVxuICAgIHRoaXMudW5wYWNrQWxpZ25tZW50ID0gMVxuICAgIHRoaXMuY29sb3JTcGFjZSA9IDBcblxuICAgIC8vIHNoYXBlXG4gICAgdGhpcy53aWR0aCA9IDBcbiAgICB0aGlzLmhlaWdodCA9IDBcbiAgICB0aGlzLmNoYW5uZWxzID0gMFxuXG4gICAgLy8gZm9ybWF0IGFuZCB0eXBlXG4gICAgdGhpcy5mb3JtYXQgPSAwXG4gICAgdGhpcy5pbnRlcm5hbGZvcm1hdCA9IDBcbiAgICB0aGlzLnR5cGUgPSAwXG4gICAgdGhpcy5jb21wcmVzc2VkID0gZmFsc2VcblxuICAgIC8vIG1pcCBsZXZlbFxuICAgIHRoaXMubWlwbGV2ZWwgPSAwXG5cbiAgICAvLyBuZGFycmF5LWxpa2UgcGFyYW1ldGVyc1xuICAgIHRoaXMuc3RyaWRlWCA9IDBcbiAgICB0aGlzLnN0cmlkZVkgPSAwXG4gICAgdGhpcy5zdHJpZGVDID0gMFxuICAgIHRoaXMub2Zmc2V0ID0gMFxuXG4gICAgLy8gY29weSBwaXhlbHMgaW5mb1xuICAgIHRoaXMueCA9IDBcbiAgICB0aGlzLnkgPSAwXG4gICAgdGhpcy5jb3B5ID0gZmFsc2VcblxuICAgIC8vIGRhdGEgc291cmNlc1xuICAgIHRoaXMuZGF0YSA9IG51bGxcbiAgICB0aGlzLmltYWdlID0gbnVsbFxuICAgIHRoaXMudmlkZW8gPSBudWxsXG4gICAgdGhpcy5jYW52YXMgPSBudWxsXG4gICAgdGhpcy54aHIgPSBudWxsXG5cbiAgICAvLyBDT1JTXG4gICAgdGhpcy5jcm9zc09yaWdpbiA9IG51bGxcblxuICAgIC8vIGhvcnJpYmxlIHN0YXRlIGZsYWdzXG4gICAgdGhpcy5uZWVkc1BvbGwgPSBmYWxzZVxuICAgIHRoaXMubmVlZHNMaXN0ZW5lcnMgPSBmYWxzZVxuICB9XG5cbiAgZXh0ZW5kKFBpeGVsSW5mby5wcm90b3R5cGUsIHtcbiAgICBwYXJzZUZsYWdzOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgaWYgKHR5cGVvZiBvcHRpb25zICE9PSAnb2JqZWN0JyB8fCAhb3B0aW9ucykge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgaWYgKCdwcmVtdWx0aXBseUFscGhhJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIFxuICAgICAgICB0aGlzLnByZW11bHRpcGx5QWxwaGEgPSBvcHRpb25zLnByZW11bHRpcGx5QWxwaGFcbiAgICAgIH1cblxuICAgICAgaWYgKCdmbGlwWScgaW4gb3B0aW9ucykge1xuICAgICAgICBcbiAgICAgICAgdGhpcy5mbGlwWSA9IG9wdGlvbnMuZmxpcFlcbiAgICAgIH1cblxuICAgICAgaWYgKCdhbGlnbm1lbnQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgXG4gICAgICAgIHRoaXMudW5wYWNrQWxpZ25tZW50ID0gb3B0aW9ucy5hbGlnbm1lbnRcbiAgICAgIH1cblxuICAgICAgaWYgKCdjb2xvclNwYWNlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIFxuICAgICAgICB0aGlzLmNvbG9yU3BhY2UgPSBjb2xvclNwYWNlW29wdGlvbnMuY29sb3JTcGFjZV1cbiAgICAgIH1cblxuICAgICAgaWYgKCdmb3JtYXQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGZvcm1hdCA9IG9wdGlvbnMuZm9ybWF0XG4gICAgICAgIFxuICAgICAgICB0aGlzLmludGVybmFsZm9ybWF0ID0gdGV4dHVyZUZvcm1hdHNbZm9ybWF0XVxuICAgICAgICBpZiAoZm9ybWF0IGluIHRleHR1cmVUeXBlcykge1xuICAgICAgICAgIHRoaXMudHlwZSA9IHRleHR1cmVUeXBlc1tmb3JtYXRdXG4gICAgICAgIH1cbiAgICAgICAgaWYgKGZvcm1hdCBpbiBjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHMpIHtcbiAgICAgICAgICB0aGlzLmNvbXByZXNzZWQgPSB0cnVlXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKCd0eXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciB0eXBlID0gb3B0aW9ucy50eXBlXG4gICAgICAgIFxuICAgICAgICB0aGlzLnR5cGUgPSB0ZXh0dXJlVHlwZXNbdHlwZV1cbiAgICAgIH1cblxuICAgICAgdmFyIHcgPSB0aGlzLndpZHRoXG4gICAgICB2YXIgaCA9IHRoaXMuaGVpZ2h0XG4gICAgICB2YXIgYyA9IHRoaXMuY2hhbm5lbHNcbiAgICAgIGlmICgnc2hhcGUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgXG4gICAgICAgIHcgPSBvcHRpb25zLnNoYXBlWzBdXG4gICAgICAgIGggPSBvcHRpb25zLnNoYXBlWzFdXG4gICAgICAgIGlmIChvcHRpb25zLnNoYXBlLmxlbmd0aCA9PT0gMykge1xuICAgICAgICAgIGMgPSBvcHRpb25zLnNoYXBlWzJdXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmICgncmFkaXVzJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgdyA9IGggPSBvcHRpb25zLnJhZGl1c1xuICAgICAgICB9XG4gICAgICAgIGlmICgnd2lkdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB3ID0gb3B0aW9ucy53aWR0aFxuICAgICAgICB9XG4gICAgICAgIGlmICgnaGVpZ2h0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgaCA9IG9wdGlvbnMuaGVpZ2h0XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCdjaGFubmVscycgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGMgPSBvcHRpb25zLmNoYW5uZWxzXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHRoaXMud2lkdGggPSB3IHwgMFxuICAgICAgdGhpcy5oZWlnaHQgPSBoIHwgMFxuICAgICAgdGhpcy5jaGFubmVscyA9IGMgfCAwXG5cbiAgICAgIGlmICgnc3RyaWRlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBzdHJpZGUgPSBvcHRpb25zLnN0cmlkZVxuICAgICAgICBcbiAgICAgICAgdGhpcy5zdHJpZGVYID0gc3RyaWRlWzBdXG4gICAgICAgIHRoaXMuc3RyaWRlWSA9IHN0cmlkZVsxXVxuICAgICAgICBpZiAoc3RyaWRlLmxlbmd0aCA9PT0gMykge1xuICAgICAgICAgIHRoaXMuc3RyaWRlQyA9IHN0cmlkZVsyXVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMuc3RyaWRlQyA9IDFcbiAgICAgICAgfVxuICAgICAgICB0aGlzLm5lZWRzVHJhbnNwb3NlID0gdHJ1ZVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5zdHJpZGVDID0gMVxuICAgICAgICB0aGlzLnN0cmlkZVggPSB0aGlzLnN0cmlkZUMgKiBjXG4gICAgICAgIHRoaXMuc3RyaWRlWSA9IHRoaXMuc3RyaWRlWCAqIHdcbiAgICAgIH1cblxuICAgICAgaWYgKCdvZmZzZXQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdGhpcy5vZmZzZXQgPSBvcHRpb25zLm9mZnNldCB8IDBcbiAgICAgICAgdGhpcy5uZWVkc1RyYW5zcG9zZSA9IHRydWVcbiAgICAgIH1cblxuICAgICAgaWYgKCdjcm9zc09yaWdpbicgaW4gb3B0aW9ucykge1xuICAgICAgICB0aGlzLmNyb3NzT3JpZ2luID0gb3B0aW9ucy5jcm9zc09yaWdpblxuICAgICAgfVxuICAgIH0sXG4gICAgcGFyc2U6IGZ1bmN0aW9uIChvcHRpb25zLCBtaXBsZXZlbCkge1xuICAgICAgdGhpcy5taXBsZXZlbCA9IG1pcGxldmVsXG4gICAgICB0aGlzLndpZHRoID0gdGhpcy53aWR0aCA+PiBtaXBsZXZlbFxuICAgICAgdGhpcy5oZWlnaHQgPSB0aGlzLmhlaWdodCA+PiBtaXBsZXZlbFxuXG4gICAgICB2YXIgZGF0YSA9IG9wdGlvbnNcbiAgICAgIHN3aXRjaCAodHlwZW9mIG9wdGlvbnMpIHtcbiAgICAgICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlICdvYmplY3QnOlxuICAgICAgICAgIGlmICghb3B0aW9ucykge1xuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgfVxuICAgICAgICAgIHRoaXMucGFyc2VGbGFncyhvcHRpb25zKVxuICAgICAgICAgIGlmIChpc1BpeGVsRGF0YShvcHRpb25zLmRhdGEpKSB7XG4gICAgICAgICAgICBkYXRhID0gb3B0aW9ucy5kYXRhXG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgJ3VuZGVmaW5lZCc6XG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgXG4gICAgICB9XG5cbiAgICAgIGlmICh0eXBlb2YgZGF0YSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgZGF0YSA9IGxvYWRUZXh0dXJlKGRhdGEsIHRoaXMuY3Jvc3NPcmlnaW4pXG4gICAgICB9XG5cbiAgICAgIHZhciBhcnJheSA9IG51bGxcbiAgICAgIHZhciBuZWVkc0NvbnZlcnQgPSBmYWxzZVxuXG4gICAgICBpZiAodGhpcy5jb21wcmVzc2VkKSB7XG4gICAgICAgIFxuICAgICAgfVxuXG4gICAgICBpZiAoZGF0YSA9PT0gbnVsbCkge1xuICAgICAgICAvLyBUT0RPXG4gICAgICB9IGVsc2UgaWYgKGlzVHlwZWRBcnJheShkYXRhKSkge1xuICAgICAgICB0aGlzLmRhdGEgPSBkYXRhXG4gICAgICB9IGVsc2UgaWYgKGlzTnVtZXJpY0FycmF5KGRhdGEpKSB7XG4gICAgICAgIGFycmF5ID0gZGF0YVxuICAgICAgICBuZWVkc0NvbnZlcnQgPSB0cnVlXG4gICAgICB9IGVsc2UgaWYgKGlzTkRBcnJheUxpa2UoZGF0YSkpIHtcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YS5kYXRhKSkge1xuICAgICAgICAgIGFycmF5ID0gZGF0YS5kYXRhXG4gICAgICAgICAgbmVlZHNDb252ZXJ0ID0gdHJ1ZVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMuZGF0YSA9IGRhdGEuZGF0YVxuICAgICAgICB9XG4gICAgICAgIHZhciBzaGFwZSA9IGRhdGEuc2hhcGVcbiAgICAgICAgdGhpcy53aWR0aCA9IHNoYXBlWzBdXG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gc2hhcGVbMV1cbiAgICAgICAgaWYgKHNoYXBlLmxlbmd0aCA9PT0gMykge1xuICAgICAgICAgIHRoaXMuY2hhbm5lbHMgPSBzaGFwZVsyXVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMuY2hhbm5lbHMgPSAxXG4gICAgICAgIH1cbiAgICAgICAgdmFyIHN0cmlkZSA9IGRhdGEuc3RyaWRlXG4gICAgICAgIHRoaXMuc3RyaWRlWCA9IGRhdGEuc3RyaWRlWzBdXG4gICAgICAgIHRoaXMuc3RyaWRlWSA9IGRhdGEuc3RyaWRlWzFdXG4gICAgICAgIGlmIChzdHJpZGUubGVuZ3RoID09PSAzKSB7XG4gICAgICAgICAgdGhpcy5zdHJpZGVDID0gZGF0YS5zdHJpZGVbMl1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLnN0cmlkZUMgPSAxXG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5vZmZzZXQgPSBkYXRhLm9mZnNldFxuICAgICAgICB0aGlzLm5lZWRzVHJhbnNwb3NlID0gdHJ1ZVxuICAgICAgfSBlbHNlIGlmIChpc0NhbnZhc0VsZW1lbnQoZGF0YSkgfHwgaXNDb250ZXh0MkQoZGF0YSkpIHtcbiAgICAgICAgaWYgKGlzQ2FudmFzRWxlbWVudChkYXRhKSkge1xuICAgICAgICAgIHRoaXMuY2FudmFzID0gZGF0YVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMuY2FudmFzID0gZGF0YS5jYW52YXNcbiAgICAgICAgfVxuICAgICAgICB0aGlzLndpZHRoID0gdGhpcy5jYW52YXMud2lkdGhcbiAgICAgICAgdGhpcy5oZWlnaHQgPSB0aGlzLmNhbnZhcy5oZWlnaHRcbiAgICAgICAgdGhpcy5zZXREZWZhdWx0Rm9ybWF0KClcbiAgICAgIH0gZWxzZSBpZiAoaXNJbWFnZUVsZW1lbnQoZGF0YSkpIHtcbiAgICAgICAgdGhpcy5pbWFnZSA9IGRhdGFcbiAgICAgICAgaWYgKCFkYXRhLmNvbXBsZXRlKSB7XG4gICAgICAgICAgdGhpcy53aWR0aCA9IHRoaXMud2lkdGggfHwgZGF0YS5uYXR1cmFsV2lkdGhcbiAgICAgICAgICB0aGlzLmhlaWdodCA9IHRoaXMuaGVpZ2h0IHx8IGRhdGEubmF0dXJhbEhlaWdodFxuICAgICAgICAgIHRoaXMubmVlZHNMaXN0ZW5lcnMgPSB0cnVlXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy53aWR0aCA9IGRhdGEubmF0dXJhbFdpZHRoXG4gICAgICAgICAgdGhpcy5oZWlnaHQgPSBkYXRhLm5hdHVyYWxIZWlnaHRcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNldERlZmF1bHRGb3JtYXQoKVxuICAgICAgfSBlbHNlIGlmIChpc1ZpZGVvRWxlbWVudChkYXRhKSkge1xuICAgICAgICB0aGlzLnZpZGVvID0gZGF0YVxuICAgICAgICBpZiAoZGF0YS5yZWFkeVN0YXRlID4gMSkge1xuICAgICAgICAgIHRoaXMud2lkdGggPSBkYXRhLndpZHRoXG4gICAgICAgICAgdGhpcy5oZWlnaHQgPSBkYXRhLmhlaWdodFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMud2lkdGggPSB0aGlzLndpZHRoIHx8IGRhdGEud2lkdGhcbiAgICAgICAgICB0aGlzLmhlaWdodCA9IHRoaXMuaGVpZ2h0IHx8IGRhdGEuaGVpZ2h0XG4gICAgICAgICAgdGhpcy5uZWVkc0xpc3RlbmVycyA9IHRydWVcbiAgICAgICAgfVxuICAgICAgICB0aGlzLm5lZWRzUG9sbCA9IHRydWVcbiAgICAgICAgdGhpcy5zZXREZWZhdWx0Rm9ybWF0KClcbiAgICAgIH0gZWxzZSBpZiAoaXNQZW5kaW5nWEhSKGRhdGEpKSB7XG4gICAgICAgIHRoaXMueGhyID0gZGF0YVxuICAgICAgICB0aGlzLm5lZWRzTGlzdGVuZXJzID0gdHJ1ZVxuICAgICAgfSBlbHNlIGlmIChpc1JlY3RBcnJheShkYXRhKSkge1xuICAgICAgICB2YXIgdyA9IGRhdGEubGVuZ3RoXG4gICAgICAgIHZhciBoID0gZGF0YVswXS5sZW5ndGhcbiAgICAgICAgdmFyIGMgPSAxXG4gICAgICAgIHZhciBpLCBqLCBrLCBwXG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KGRhdGFbMF1bMF0pKSB7XG4gICAgICAgICAgYyA9IGRhdGFbMF1bMF0ubGVuZ3RoXG4gICAgICAgICAgXG4gICAgICAgICAgYXJyYXkgPSBBcnJheSh3ICogaCAqIGMpXG4gICAgICAgICAgcCA9IDBcbiAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgaDsgKytqKSB7XG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgdzsgKytpKSB7XG4gICAgICAgICAgICAgIGZvciAoayA9IDA7IGsgPCBjOyArK2spIHtcbiAgICAgICAgICAgICAgICBhcnJheVtwKytdID0gZGF0YVtpXVtqXVtrXVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGFycmF5ID0gQXJyYXkodyAqIGgpXG4gICAgICAgICAgcCA9IDBcbiAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgaDsgKytqKSB7XG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgdzsgKytpKSB7XG4gICAgICAgICAgICAgIGFycmF5W3ArK10gPSBkYXRhW2ldW2pdXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMud2lkdGggPSB3XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaFxuICAgICAgICB0aGlzLmNoYW5uZWxzID0gY1xuICAgICAgICBuZWVkc0NvbnZlcnQgPSB0cnVlXG4gICAgICB9IGVsc2UgaWYgKG9wdGlvbnMuY29weSkge1xuICAgICAgICB0aGlzLmNvcHkgPSB0cnVlXG4gICAgICAgIHRoaXMueCA9IHRoaXMueCB8IDBcbiAgICAgICAgdGhpcy55ID0gdGhpcy55IHwgMFxuICAgICAgICB0aGlzLndpZHRoID0gKHRoaXMud2lkdGggfHwgdmlld3BvcnRTdGF0ZS53aWR0aCkgfCAwXG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gKHRoaXMuaGVpZ2h0IHx8IHZpZXdwb3J0U3RhdGUuaGVpZ2h0KSB8IDBcbiAgICAgICAgdGhpcy5zZXREZWZhdWx0Rm9ybWF0KClcbiAgICAgIH1cblxuICAgICAgLy8gRml4IHVwIG1pc3NpbmcgdHlwZSBpbmZvIGZvciB0eXBlZCBhcnJheXNcbiAgICAgIGlmICghdGhpcy50eXBlICYmIHRoaXMuZGF0YSkge1xuICAgICAgICBpZiAodGhpcy5mb3JtYXQgPT09IEdMX0RFUFRIX0NPTVBPTkVOVCkge1xuICAgICAgICAgIGlmICh0aGlzLmRhdGEgaW5zdGFuY2VvZiBVaW50MTZBcnJheSkge1xuICAgICAgICAgICAgdGhpcy50eXBlID0gR0xfVU5TSUdORURfU0hPUlRcbiAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMuZGF0YSBpbnN0YW5jZW9mIFVpbnQzMkFycmF5KSB7XG4gICAgICAgICAgICB0aGlzLnR5cGUgPSBHTF9VTlNJR05FRF9JTlRcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5kYXRhIGluc3RhbmNlb2YgRmxvYXQzMkFycmF5KSB7XG4gICAgICAgICAgdGhpcy50eXBlID0gR0xfRkxPQVRcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBJbmZlciBkZWZhdWx0IGZvcm1hdFxuICAgICAgaWYgKCF0aGlzLmludGVybmFsZm9ybWF0KSB7XG4gICAgICAgIHZhciBjaGFubmVscyA9IHRoaXMuY2hhbm5lbHMgPSB0aGlzLmNoYW5uZWxzIHx8IDRcbiAgICAgICAgdGhpcy5pbnRlcm5hbGZvcm1hdCA9IFtcbiAgICAgICAgICBHTF9MVU1JTkFOQ0UsXG4gICAgICAgICAgR0xfTFVNSU5BTkNFX0FMUEhBLFxuICAgICAgICAgIEdMX1JHQixcbiAgICAgICAgICBHTF9SR0JBXVtjaGFubmVscyAtIDFdXG4gICAgICAgIFxuICAgICAgfVxuXG4gICAgICB2YXIgZm9ybWF0ID0gdGhpcy5pbnRlcm5hbGZvcm1hdFxuICAgICAgaWYgKGZvcm1hdCA9PT0gR0xfREVQVEhfQ09NUE9ORU5UIHx8IGZvcm1hdCA9PT0gR0xfREVQVEhfU1RFTkNJTCkge1xuICAgICAgICBcbiAgICAgICAgaWYgKGZvcm1hdCA9PT0gR0xfREVQVEhfQ09NUE9ORU5UKSB7XG4gICAgICAgICAgXG4gICAgICAgIH1cbiAgICAgICAgaWYgKGZvcm1hdCA9PT0gR0xfREVQVEhfU1RFTkNJTCkge1xuICAgICAgICAgIFxuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgfVxuXG4gICAgICAvLyBDb21wdXRlIGNvbG9yIGZvcm1hdCBhbmQgbnVtYmVyIG9mIGNoYW5uZWxzXG4gICAgICB2YXIgY29sb3JGb3JtYXQgPSB0aGlzLmZvcm1hdCA9IGNvbG9yRm9ybWF0c1tmb3JtYXRdXG4gICAgICBpZiAoIXRoaXMuY2hhbm5lbHMpIHtcbiAgICAgICAgc3dpdGNoIChjb2xvckZvcm1hdCkge1xuICAgICAgICAgIGNhc2UgR0xfTFVNSU5BTkNFOlxuICAgICAgICAgIGNhc2UgR0xfQUxQSEE6XG4gICAgICAgICAgY2FzZSBHTF9ERVBUSF9DT01QT05FTlQ6XG4gICAgICAgICAgICB0aGlzLmNoYW5uZWxzID0gMVxuICAgICAgICAgICAgYnJlYWtcblxuICAgICAgICAgIGNhc2UgR0xfREVQVEhfU1RFTkNJTDpcbiAgICAgICAgICBjYXNlIEdMX0xVTUlOQU5DRV9BTFBIQTpcbiAgICAgICAgICAgIHRoaXMuY2hhbm5lbHMgPSAyXG4gICAgICAgICAgICBicmVha1xuXG4gICAgICAgICAgY2FzZSBHTF9SR0I6XG4gICAgICAgICAgICB0aGlzLmNoYW5uZWxzID0gM1xuICAgICAgICAgICAgYnJlYWtcblxuICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICB0aGlzLmNoYW5uZWxzID0gNFxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIENoZWNrIHRoYXQgdGV4dHVyZSB0eXBlIGlzIHN1cHBvcnRlZFxuICAgICAgdmFyIHR5cGUgPSB0aGlzLnR5cGVcbiAgICAgIGlmICh0eXBlID09PSBHTF9GTE9BVCkge1xuICAgICAgICBcbiAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gR0xfSEFMRl9GTE9BVF9PRVMpIHtcbiAgICAgICAgXG4gICAgICB9IGVsc2UgaWYgKCF0eXBlKSB7XG4gICAgICAgIGlmIChmb3JtYXQgPT09IEdMX0RFUFRIX0NPTVBPTkVOVCkge1xuICAgICAgICAgIHR5cGUgPSBHTF9VTlNJR05FRF9JTlRcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0eXBlID0gR0xfVU5TSUdORURfQllURVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICB0aGlzLnR5cGUgPSB0eXBlXG5cbiAgICAgIC8vIGFwcGx5IGNvbnZlcnNpb25cbiAgICAgIGlmIChuZWVkc0NvbnZlcnQpIHtcbiAgICAgICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9CWVRFOlxuICAgICAgICAgICAgdGhpcy5kYXRhID0gbmV3IFVpbnQ4QXJyYXkoYXJyYXkpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlQ6XG4gICAgICAgICAgICB0aGlzLmRhdGEgPSBuZXcgVWludDE2QXJyYXkoYXJyYXkpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfSU5UOlxuICAgICAgICAgICAgdGhpcy5kYXRhID0gbmV3IFVpbnQzMkFycmF5KGFycmF5KVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlIEdMX0ZMT0FUOlxuICAgICAgICAgICAgdGhpcy5kYXRhID0gbmV3IEZsb2F0MzJBcnJheShhcnJheSlcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSBHTF9IQUxGX0ZMT0FUX09FUzpcbiAgICAgICAgICAgIHRoaXMuZGF0YSA9IGNvbnZlcnRUb0hhbGZGbG9hdChhcnJheSlcbiAgICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUXzVfNl81OlxuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlRfNV81XzVfMTpcbiAgICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUXzRfNF80XzQ6XG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9JTlRfMjRfOF9XRUJHTDpcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgYnJlYWtcblxuICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICBcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5kYXRhKSB7XG4gICAgICAgIC8vIGFwcGx5IHRyYW5zcG9zZVxuICAgICAgICBpZiAodGhpcy5uZWVkc1RyYW5zcG9zZSkge1xuICAgICAgICAgIHRoaXMuZGF0YSA9IHRyYW5zcG9zZVBpeGVscyhcbiAgICAgICAgICAgIHRoaXMuZGF0YSxcbiAgICAgICAgICAgIHRoaXMud2lkdGgsXG4gICAgICAgICAgICB0aGlzLmhlaWdodCxcbiAgICAgICAgICAgIHRoaXMuY2hhbm5lbHMsXG4gICAgICAgICAgICB0aGlzLnN0cmlkZVgsXG4gICAgICAgICAgICB0aGlzLnN0cmlkZVksXG4gICAgICAgICAgICB0aGlzLnN0cmlkZUMsXG4gICAgICAgICAgICB0aGlzLm9mZnNldClcbiAgICAgICAgfVxuICAgICAgICAvLyBjaGVjayBkYXRhIHR5cGVcbiAgICAgICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9CWVRFOlxuICAgICAgICAgICAgXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlRfNV82XzU6XG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9TSE9SVF81XzVfNV8xOlxuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlRfNF80XzRfNDpcbiAgICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUOlxuICAgICAgICAgIGNhc2UgR0xfSEFMRl9GTE9BVF9PRVM6XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9JTlQ6XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgICBjYXNlIEdMX0ZMT0FUOlxuICAgICAgICAgICAgXG4gICAgICAgICAgICBicmVha1xuXG4gICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIFxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHRoaXMubmVlZHNUcmFuc3Bvc2UgPSBmYWxzZVxuICAgIH0sXG5cbiAgICBzZXREZWZhdWx0Rm9ybWF0OiBmdW5jdGlvbiAoKSB7XG4gICAgICB0aGlzLmZvcm1hdCA9IHRoaXMuaW50ZXJuYWxmb3JtYXQgPSBHTF9SR0JBXG4gICAgICB0aGlzLnR5cGUgPSBHTF9VTlNJR05FRF9CWVRFXG4gICAgICB0aGlzLmNoYW5uZWxzID0gNFxuICAgICAgdGhpcy5jb21wcmVzc2VkID0gZmFsc2VcbiAgICB9LFxuXG4gICAgdXBsb2FkOiBmdW5jdGlvbiAocGFyYW1zKSB7XG4gICAgICBnbC5waXhlbFN0b3JlaShHTF9VTlBBQ0tfRkxJUF9ZX1dFQkdMLCB0aGlzLmZsaXBZKVxuICAgICAgZ2wucGl4ZWxTdG9yZWkoR0xfVU5QQUNLX1BSRU1VTFRJUExZX0FMUEhBX1dFQkdMLCB0aGlzLnByZW11bHRpcGx5QWxwaGEpXG4gICAgICBnbC5waXhlbFN0b3JlaShHTF9VTlBBQ0tfQ09MT1JTUEFDRV9DT05WRVJTSU9OX1dFQkdMLCB0aGlzLmNvbG9yU3BhY2UpXG4gICAgICBnbC5waXhlbFN0b3JlaShHTF9VTlBBQ0tfQUxJR05NRU5ULCB0aGlzLnVucGFja0FsaWdubWVudClcblxuICAgICAgdmFyIHRhcmdldCA9IHRoaXMudGFyZ2V0XG4gICAgICB2YXIgbWlwbGV2ZWwgPSB0aGlzLm1pcGxldmVsXG4gICAgICB2YXIgaW1hZ2UgPSB0aGlzLmltYWdlXG4gICAgICB2YXIgY2FudmFzID0gdGhpcy5jYW52YXNcbiAgICAgIHZhciB2aWRlbyA9IHRoaXMudmlkZW9cbiAgICAgIHZhciBkYXRhID0gdGhpcy5kYXRhXG4gICAgICB2YXIgaW50ZXJuYWxmb3JtYXQgPSB0aGlzLmludGVybmFsZm9ybWF0XG4gICAgICB2YXIgZm9ybWF0ID0gdGhpcy5mb3JtYXRcbiAgICAgIHZhciB0eXBlID0gdGhpcy50eXBlXG4gICAgICB2YXIgd2lkdGggPSB0aGlzLndpZHRoIHx8IE1hdGgubWF4KDEsIHBhcmFtcy53aWR0aCA+PiBtaXBsZXZlbClcbiAgICAgIHZhciBoZWlnaHQgPSB0aGlzLmhlaWdodCB8fCBNYXRoLm1heCgxLCBwYXJhbXMuaGVpZ2h0ID4+IG1pcGxldmVsKVxuICAgICAgaWYgKHZpZGVvICYmIHZpZGVvLnJlYWR5U3RhdGUgPiAyKSB7XG4gICAgICAgIGdsLnRleEltYWdlMkQodGFyZ2V0LCBtaXBsZXZlbCwgZm9ybWF0LCBmb3JtYXQsIHR5cGUsIHZpZGVvKVxuICAgICAgfSBlbHNlIGlmIChpbWFnZSAmJiBpbWFnZS5jb21wbGV0ZSkge1xuICAgICAgICBnbC50ZXhJbWFnZTJEKHRhcmdldCwgbWlwbGV2ZWwsIGZvcm1hdCwgZm9ybWF0LCB0eXBlLCBpbWFnZSlcbiAgICAgIH0gZWxzZSBpZiAoY2FudmFzKSB7XG4gICAgICAgIGdsLnRleEltYWdlMkQodGFyZ2V0LCBtaXBsZXZlbCwgZm9ybWF0LCBmb3JtYXQsIHR5cGUsIGNhbnZhcylcbiAgICAgIH0gZWxzZSBpZiAodGhpcy5jb21wcmVzc2VkKSB7XG4gICAgICAgIGdsLmNvbXByZXNzZWRUZXhJbWFnZTJEKHRhcmdldCwgbWlwbGV2ZWwsIGludGVybmFsZm9ybWF0LCB3aWR0aCwgaGVpZ2h0LCAwLCBkYXRhKVxuICAgICAgfSBlbHNlIGlmICh0aGlzLmNvcHkpIHtcbiAgICAgICAgcmVnbFBvbGwoKVxuICAgICAgICBnbC5jb3B5VGV4SW1hZ2UyRCh0YXJnZXQsIG1pcGxldmVsLCBmb3JtYXQsIHRoaXMueCwgdGhpcy55LCB3aWR0aCwgaGVpZ2h0LCAwKVxuICAgICAgfSBlbHNlIGlmIChkYXRhKSB7XG4gICAgICAgIGdsLnRleEltYWdlMkQodGFyZ2V0LCBtaXBsZXZlbCwgZm9ybWF0LCB3aWR0aCwgaGVpZ2h0LCAwLCBmb3JtYXQsIHR5cGUsIGRhdGEpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBnbC50ZXhJbWFnZTJEKHRhcmdldCwgbWlwbGV2ZWwsIGZvcm1hdCwgd2lkdGggfHwgMSwgaGVpZ2h0IHx8IDEsIDAsIGZvcm1hdCwgdHlwZSwgbnVsbClcbiAgICAgIH1cbiAgICB9XG4gIH0pXG5cbiAgZnVuY3Rpb24gVGV4UGFyYW1zICh0YXJnZXQpIHtcbiAgICB0aGlzLnRhcmdldCA9IHRhcmdldFxuXG4gICAgLy8gRGVmYXVsdCBpbWFnZSBzaGFwZSBpbmZvXG4gICAgdGhpcy53aWR0aCA9IDBcbiAgICB0aGlzLmhlaWdodCA9IDBcbiAgICB0aGlzLmZvcm1hdCA9IDBcbiAgICB0aGlzLmludGVybmFsZm9ybWF0ID0gMFxuICAgIHRoaXMudHlwZSA9IDBcblxuICAgIC8vIHdyYXAgbW9kZVxuICAgIHRoaXMud3JhcFMgPSBHTF9DTEFNUF9UT19FREdFXG4gICAgdGhpcy53cmFwVCA9IEdMX0NMQU1QX1RPX0VER0VcblxuICAgIC8vIGZpbHRlcmluZ1xuICAgIHRoaXMubWluRmlsdGVyID0gMFxuICAgIHRoaXMubWFnRmlsdGVyID0gR0xfTkVBUkVTVFxuICAgIHRoaXMuYW5pc290cm9waWMgPSAxXG5cbiAgICAvLyBtaXBtYXBzXG4gICAgdGhpcy5nZW5NaXBtYXBzID0gZmFsc2VcbiAgICB0aGlzLm1pcG1hcEhpbnQgPSBHTF9ET05UX0NBUkVcbiAgfVxuXG4gIGV4dGVuZChUZXhQYXJhbXMucHJvdG90eXBlLCB7XG4gICAgcGFyc2U6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbnMgIT09ICdvYmplY3QnIHx8ICFvcHRpb25zKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuXG4gICAgICBpZiAoJ21pbicgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgbWluRmlsdGVyID0gb3B0aW9ucy5taW5cbiAgICAgICAgXG4gICAgICAgIHRoaXMubWluRmlsdGVyID0gbWluRmlsdGVyc1ttaW5GaWx0ZXJdXG4gICAgICB9XG5cbiAgICAgIGlmICgnbWFnJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBtYWdGaWx0ZXIgPSBvcHRpb25zLm1hZ1xuICAgICAgICBcbiAgICAgICAgdGhpcy5tYWdGaWx0ZXIgPSBtYWdGaWx0ZXJzW21hZ0ZpbHRlcl1cbiAgICAgIH1cblxuICAgICAgdmFyIHdyYXBTID0gdGhpcy53cmFwU1xuICAgICAgdmFyIHdyYXBUID0gdGhpcy53cmFwVFxuICAgICAgaWYgKCd3cmFwJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciB3cmFwID0gb3B0aW9ucy53cmFwXG4gICAgICAgIGlmICh0eXBlb2Ygd3JhcCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICBcbiAgICAgICAgICB3cmFwUyA9IHdyYXBUID0gd3JhcE1vZGVzW3dyYXBdXG4gICAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheSh3cmFwKSkge1xuICAgICAgICAgIFxuICAgICAgICAgIFxuICAgICAgICAgIHdyYXBTID0gd3JhcE1vZGVzW3dyYXBbMF1dXG4gICAgICAgICAgd3JhcFQgPSB3cmFwTW9kZXNbd3JhcFsxXV1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKCd3cmFwUycgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHZhciBvcHRXcmFwUyA9IG9wdGlvbnMud3JhcFNcbiAgICAgICAgICBcbiAgICAgICAgICB3cmFwUyA9IHdyYXBNb2Rlc1tvcHRXcmFwU11cbiAgICAgICAgfVxuICAgICAgICBpZiAoJ3dyYXBUJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgdmFyIG9wdFdyYXBUID0gb3B0aW9ucy53cmFwVFxuICAgICAgICAgIFxuICAgICAgICAgIHdyYXBUID0gd3JhcE1vZGVzW29wdFdyYXBUXVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICB0aGlzLndyYXBTID0gd3JhcFNcbiAgICAgIHRoaXMud3JhcFQgPSB3cmFwVFxuXG4gICAgICBpZiAoJ2FuaXNvdHJvcGljJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBhbmlzb3Ryb3BpYyA9IG9wdGlvbnMuYW5pc290cm9waWNcbiAgICAgICAgXG4gICAgICAgIHRoaXMuYW5pc290cm9waWMgPSBvcHRpb25zLmFuaXNvdHJvcGljXG4gICAgICB9XG5cbiAgICAgIGlmICgnbWlwbWFwJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBtaXBtYXAgPSBvcHRpb25zLm1pcG1hcFxuICAgICAgICBzd2l0Y2ggKHR5cGVvZiBtaXBtYXApIHtcbiAgICAgICAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgICAgICAgXG4gICAgICAgICAgICB0aGlzLm1pcG1hcEhpbnQgPSBtaXBtYXBIaW50W21pcG1hcF1cbiAgICAgICAgICAgIHRoaXMuZ2VuTWlwbWFwcyA9IHRydWVcbiAgICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgICBjYXNlICdib29sZWFuJzpcbiAgICAgICAgICAgIHRoaXMuZ2VuTWlwbWFwcyA9ICEhbWlwbWFwXG4gICAgICAgICAgICBicmVha1xuXG4gICAgICAgICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuXG4gICAgdXBsb2FkOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgdGFyZ2V0ID0gdGhpcy50YXJnZXRcbiAgICAgIGdsLnRleFBhcmFtZXRlcmkodGFyZ2V0LCBHTF9URVhUVVJFX01JTl9GSUxURVIsIHRoaXMubWluRmlsdGVyKVxuICAgICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfTUFHX0ZJTFRFUiwgdGhpcy5tYWdGaWx0ZXIpXG4gICAgICBnbC50ZXhQYXJhbWV0ZXJpKHRhcmdldCwgR0xfVEVYVFVSRV9XUkFQX1MsIHRoaXMud3JhcFMpXG4gICAgICBnbC50ZXhQYXJhbWV0ZXJpKHRhcmdldCwgR0xfVEVYVFVSRV9XUkFQX1QsIHRoaXMud3JhcFQpXG4gICAgICBpZiAoZXh0ZW5zaW9ucy5leHRfdGV4dHVyZV9maWx0ZXJfYW5pc290cm9waWMpIHtcbiAgICAgICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfTUFYX0FOSVNPVFJPUFlfRVhULCB0aGlzLmFuaXNvdHJvcGljKVxuICAgICAgfVxuICAgICAgaWYgKHRoaXMuZ2VuTWlwbWFwcykge1xuICAgICAgICBnbC5oaW50KEdMX0dFTkVSQVRFX01JUE1BUF9ISU5ULCB0aGlzLm1pcG1hcEhpbnQpXG4gICAgICAgIGdsLmdlbmVyYXRlTWlwbWFwKHRhcmdldClcbiAgICAgIH1cbiAgICB9XG4gIH0pXG5cbiAgLy8gRmluYWwgcGFzcyB0byBtZXJnZSBwYXJhbXMgYW5kIHBpeGVsIGRhdGFcbiAgZnVuY3Rpb24gY2hlY2tUZXh0dXJlQ29tcGxldGUgKHBhcmFtcywgcGl4ZWxzKSB7XG4gICAgdmFyIGksIHBpeG1hcFxuXG4gICAgdmFyIHR5cGUgPSAwXG4gICAgdmFyIGZvcm1hdCA9IDBcbiAgICB2YXIgaW50ZXJuYWxmb3JtYXQgPSAwXG4gICAgdmFyIHdpZHRoID0gMFxuICAgIHZhciBoZWlnaHQgPSAwXG4gICAgdmFyIGNoYW5uZWxzID0gMFxuICAgIHZhciBjb21wcmVzc2VkID0gZmFsc2VcbiAgICB2YXIgbmVlZHNQb2xsID0gZmFsc2VcbiAgICB2YXIgbmVlZHNMaXN0ZW5lcnMgPSBmYWxzZVxuICAgIHZhciBtaXBNYXNrMkQgPSAwXG4gICAgdmFyIG1pcE1hc2tDdWJlID0gWzAsIDAsIDAsIDAsIDAsIDBdXG4gICAgdmFyIGN1YmVNYXNrID0gMFxuICAgIHZhciBoYXNNaXAgPSBmYWxzZVxuICAgIGZvciAoaSA9IDA7IGkgPCBwaXhlbHMubGVuZ3RoOyArK2kpIHtcbiAgICAgIHBpeG1hcCA9IHBpeGVsc1tpXVxuICAgICAgd2lkdGggPSB3aWR0aCB8fCAocGl4bWFwLndpZHRoIDw8IHBpeG1hcC5taXBsZXZlbClcbiAgICAgIGhlaWdodCA9IGhlaWdodCB8fCAocGl4bWFwLmhlaWdodCA8PCBwaXhtYXAubWlwbGV2ZWwpXG4gICAgICB0eXBlID0gdHlwZSB8fCBwaXhtYXAudHlwZVxuICAgICAgZm9ybWF0ID0gZm9ybWF0IHx8IHBpeG1hcC5mb3JtYXRcbiAgICAgIGludGVybmFsZm9ybWF0ID0gaW50ZXJuYWxmb3JtYXQgfHwgcGl4bWFwLmludGVybmFsZm9ybWF0XG4gICAgICBjaGFubmVscyA9IGNoYW5uZWxzIHx8IHBpeG1hcC5jaGFubmVsc1xuICAgICAgbmVlZHNQb2xsID0gbmVlZHNQb2xsIHx8IHBpeG1hcC5uZWVkc1BvbGxcbiAgICAgIG5lZWRzTGlzdGVuZXJzID0gbmVlZHNMaXN0ZW5lcnMgfHwgcGl4bWFwLm5lZWRzTGlzdGVuZXJzXG4gICAgICBjb21wcmVzc2VkID0gY29tcHJlc3NlZCB8fCBwaXhtYXAuY29tcHJlc3NlZFxuXG4gICAgICB2YXIgbWlwbGV2ZWwgPSBwaXhtYXAubWlwbGV2ZWxcbiAgICAgIHZhciB0YXJnZXQgPSBwaXhtYXAudGFyZ2V0XG4gICAgICBoYXNNaXAgPSBoYXNNaXAgfHwgKG1pcGxldmVsID4gMClcbiAgICAgIGlmICh0YXJnZXQgPT09IEdMX1RFWFRVUkVfMkQpIHtcbiAgICAgICAgbWlwTWFzazJEIHw9ICgxIDw8IG1pcGxldmVsKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIGZhY2UgPSB0YXJnZXQgLSBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1hcbiAgICAgICAgbWlwTWFza0N1YmVbZmFjZV0gfD0gKDEgPDwgbWlwbGV2ZWwpXG4gICAgICAgIGN1YmVNYXNrIHw9ICgxIDw8IGZhY2UpXG4gICAgICB9XG4gICAgfVxuXG4gICAgcGFyYW1zLm5lZWRzUG9sbCA9IG5lZWRzUG9sbFxuICAgIHBhcmFtcy5uZWVkc0xpc3RlbmVycyA9IG5lZWRzTGlzdGVuZXJzXG4gICAgcGFyYW1zLndpZHRoID0gd2lkdGhcbiAgICBwYXJhbXMuaGVpZ2h0ID0gaGVpZ2h0XG4gICAgcGFyYW1zLmZvcm1hdCA9IGZvcm1hdFxuICAgIHBhcmFtcy5pbnRlcm5hbGZvcm1hdCA9IGludGVybmFsZm9ybWF0XG4gICAgcGFyYW1zLnR5cGUgPSB0eXBlXG5cbiAgICB2YXIgbWlwTWFzayA9IGhhc01pcCA/ICh3aWR0aCA8PCAxKSAtIDEgOiAxXG4gICAgaWYgKHBhcmFtcy50YXJnZXQgPT09IEdMX1RFWFRVUkVfMkQpIHtcbiAgICAgIFxuICAgICAgXG4gICAgfSBlbHNlIHtcbiAgICAgIFxuICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICBcbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgbWlwRmlsdGVyID0gKE1JUE1BUF9GSUxURVJTLmluZGV4T2YocGFyYW1zLm1pbkZpbHRlcikgPj0gMClcbiAgICBwYXJhbXMuZ2VuTWlwbWFwcyA9ICFoYXNNaXAgJiYgKHBhcmFtcy5nZW5NaXBtYXBzIHx8IG1pcEZpbHRlcilcbiAgICB2YXIgdXNlTWlwbWFwcyA9IGhhc01pcCB8fCBwYXJhbXMuZ2VuTWlwbWFwc1xuXG4gICAgaWYgKCFwYXJhbXMubWluRmlsdGVyKSB7XG4gICAgICBwYXJhbXMubWluRmlsdGVyID0gdXNlTWlwbWFwc1xuICAgICAgICA/IEdMX0xJTkVBUl9NSVBNQVBfTElORUFSXG4gICAgICAgIDogR0xfTkVBUkVTVFxuICAgIH0gZWxzZSB7XG4gICAgICBcbiAgICB9XG5cbiAgICBpZiAodXNlTWlwbWFwcykge1xuICAgICAgXG4gICAgfVxuXG4gICAgaWYgKHBhcmFtcy5nZW5NaXBtYXBzKSB7XG4gICAgICBcbiAgICB9XG5cbiAgICBwYXJhbXMud3JhcFMgPSBwYXJhbXMud3JhcFMgfHwgR0xfQ0xBTVBfVE9fRURHRVxuICAgIHBhcmFtcy53cmFwVCA9IHBhcmFtcy53cmFwVCB8fCBHTF9DTEFNUF9UT19FREdFXG4gICAgaWYgKHBhcmFtcy53cmFwUyAhPT0gR0xfQ0xBTVBfVE9fRURHRSB8fFxuICAgICAgICBwYXJhbXMud3JhcFQgIT09IEdMX0NMQU1QX1RPX0VER0UpIHtcbiAgICAgIFxuICAgIH1cblxuICAgIGlmICgodHlwZSA9PT0gR0xfRkxPQVQgJiYgIWV4dGVuc2lvbnMub2VzX3RleHR1cmVfZmxvYXRfbGluZWFyKSB8fFxuICAgICAgICAodHlwZSA9PT0gR0xfSEFMRl9GTE9BVF9PRVMgJiZcbiAgICAgICAgICAhZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9oYWxmX2Zsb2F0X2xpbmVhcikpIHtcbiAgICAgIFxuICAgIH1cblxuICAgIGZvciAoaSA9IDA7IGkgPCBwaXhlbHMubGVuZ3RoOyArK2kpIHtcbiAgICAgIHBpeG1hcCA9IHBpeGVsc1tpXVxuICAgICAgdmFyIGxldmVsID0gcGl4bWFwLm1pcGxldmVsXG4gICAgICBpZiAocGl4bWFwLndpZHRoKSB7XG4gICAgICAgIFxuICAgICAgfVxuICAgICAgaWYgKHBpeG1hcC5oZWlnaHQpIHtcbiAgICAgICAgXG4gICAgICB9XG4gICAgICBpZiAocGl4bWFwLmNoYW5uZWxzKSB7XG4gICAgICAgIFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGl4bWFwLmNoYW5uZWxzID0gY2hhbm5lbHNcbiAgICAgIH1cbiAgICAgIGlmIChwaXhtYXAuZm9ybWF0KSB7XG4gICAgICAgIFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGl4bWFwLmZvcm1hdCA9IGZvcm1hdFxuICAgICAgfVxuICAgICAgaWYgKHBpeG1hcC5pbnRlcm5hbGZvcm1hdCkge1xuICAgICAgICBcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBpeG1hcC5pbnRlcm5hbGZvcm1hdCA9IGludGVybmFsZm9ybWF0XG4gICAgICB9XG4gICAgICBpZiAocGl4bWFwLnR5cGUpIHtcbiAgICAgICAgXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwaXhtYXAudHlwZSA9IHR5cGVcbiAgICAgIH1cbiAgICAgIGlmIChwaXhtYXAuY29weSkge1xuICAgICAgICBcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICB2YXIgYWN0aXZlVGV4dHVyZSA9IDBcbiAgdmFyIHRleHR1cmVDb3VudCA9IDBcbiAgdmFyIHRleHR1cmVTZXQgPSB7fVxuICB2YXIgcG9sbFNldCA9IFtdXG4gIHZhciBudW1UZXhVbml0cyA9IGxpbWl0cy5tYXhUZXh0dXJlVW5pdHNcbiAgdmFyIHRleHR1cmVVbml0cyA9IEFycmF5KG51bVRleFVuaXRzKS5tYXAoZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBudWxsXG4gIH0pXG5cbiAgZnVuY3Rpb24gUkVHTFRleHR1cmUgKHRhcmdldCkge1xuICAgIHRoaXMuaWQgPSB0ZXh0dXJlQ291bnQrK1xuICAgIHRoaXMucmVmQ291bnQgPSAxXG5cbiAgICB0aGlzLnRhcmdldCA9IHRhcmdldFxuICAgIHRoaXMudGV4dHVyZSA9IG51bGxcblxuICAgIHRoaXMucG9sbElkID0gLTFcblxuICAgIHRoaXMudW5pdCA9IC0xXG4gICAgdGhpcy5iaW5kQ291bnQgPSAwXG5cbiAgICAvLyBjYW5jZWxzIGFsbCBwZW5kaW5nIGNhbGxiYWNrc1xuICAgIHRoaXMuY2FuY2VsUGVuZGluZyA9IG51bGxcblxuICAgIC8vIHBhcnNlZCB1c2VyIGlucHV0c1xuICAgIHRoaXMucGFyYW1zID0gbmV3IFRleFBhcmFtcyh0YXJnZXQpXG4gICAgdGhpcy5waXhlbHMgPSBbXVxuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlICh0ZXh0dXJlLCBvcHRpb25zKSB7XG4gICAgdmFyIGlcbiAgICBjbGVhckxpc3RlbmVycyh0ZXh0dXJlKVxuXG4gICAgLy8gQ2xlYXIgcGFyYW1ldGVycyBhbmQgcGl4ZWwgZGF0YVxuICAgIHZhciBwYXJhbXMgPSB0ZXh0dXJlLnBhcmFtc1xuICAgIFRleFBhcmFtcy5jYWxsKHBhcmFtcywgdGV4dHVyZS50YXJnZXQpXG4gICAgdmFyIHBpeGVscyA9IHRleHR1cmUucGl4ZWxzXG4gICAgcGl4ZWxzLmxlbmd0aCA9IDBcblxuICAgIC8vIHBhcnNlIHBhcmFtZXRlcnNcbiAgICBwYXJhbXMucGFyc2Uob3B0aW9ucylcblxuICAgIC8vIHBhcnNlIHBpeGVsIGRhdGFcbiAgICBmdW5jdGlvbiBwYXJzZU1pcCAodGFyZ2V0LCBkYXRhKSB7XG4gICAgICB2YXIgbWlwbWFwID0gZGF0YS5taXBtYXBcbiAgICAgIHZhciBwaXhtYXBcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KG1pcG1hcCkpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBtaXBtYXAubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICBwaXhtYXAgPSBuZXcgUGl4ZWxJbmZvKHRhcmdldClcbiAgICAgICAgICBwaXhtYXAucGFyc2VGbGFncyhvcHRpb25zKVxuICAgICAgICAgIHBpeG1hcC5wYXJzZUZsYWdzKGRhdGEpXG4gICAgICAgICAgcGl4bWFwLnBhcnNlKG1pcG1hcFtpXSwgaSlcbiAgICAgICAgICBwaXhlbHMucHVzaChwaXhtYXApXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBpeG1hcCA9IG5ldyBQaXhlbEluZm8odGFyZ2V0KVxuICAgICAgICBwaXhtYXAucGFyc2VGbGFncyhvcHRpb25zKVxuICAgICAgICBwaXhtYXAucGFyc2UoZGF0YSwgMClcbiAgICAgICAgcGl4ZWxzLnB1c2gocGl4bWFwKVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAodGV4dHVyZS50YXJnZXQgPT09IEdMX1RFWFRVUkVfMkQpIHtcbiAgICAgIHBhcnNlTWlwKEdMX1RFWFRVUkVfMkQsIG9wdGlvbnMpXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBmYWNlcyA9IG9wdGlvbnMuZmFjZXMgfHwgb3B0aW9uc1xuICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZmFjZXMpKSB7XG4gICAgICAgIFxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgICAgcGFyc2VNaXAoR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YICsgaSwgZmFjZXNbaV0pXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZhY2VzID09PSAnc3RyaW5nJykge1xuICAgICAgICAvLyBUT0RPIFJlYWQgZGRzXG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBJbml0aWFsaXplIHRvIGFsbCBlbXB0eSB0ZXh0dXJlc1xuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgICAgcGFyc2VNaXAoR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YICsgaSwge30pXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBkbyBhIHNlY29uZCBwYXNzIHRvIHJlY29uY2lsZSBkZWZhdWx0c1xuICAgIGNoZWNrVGV4dHVyZUNvbXBsZXRlKHBhcmFtcywgcGl4ZWxzKVxuXG4gICAgaWYgKHBhcmFtcy5uZWVkc0xpc3RlbmVycykge1xuICAgICAgaG9va0xpc3RlbmVycyh0ZXh0dXJlKVxuICAgIH1cblxuICAgIGlmIChwYXJhbXMubmVlZHNQb2xsKSB7XG4gICAgICB0ZXh0dXJlLnBvbGxJZCA9IHBvbGxTZXQubGVuZ3RoXG4gICAgICBwb2xsU2V0LnB1c2godGV4dHVyZSlcbiAgICB9XG5cbiAgICByZWZyZXNoKHRleHR1cmUpXG4gIH1cblxuICBmdW5jdGlvbiByZWZyZXNoICh0ZXh0dXJlKSB7XG4gICAgaWYgKCFnbC5pc1RleHR1cmUodGV4dHVyZS50ZXh0dXJlKSkge1xuICAgICAgdGV4dHVyZS50ZXh0dXJlID0gZ2wuY3JlYXRlVGV4dHVyZSgpXG4gICAgfVxuXG4gICAgLy8gTGF6eSBiaW5kXG4gICAgdmFyIHRhcmdldCA9IHRleHR1cmUudGFyZ2V0XG4gICAgdmFyIHVuaXQgPSB0ZXh0dXJlLnVuaXRcbiAgICBpZiAodW5pdCA+PSAwKSB7XG4gICAgICBnbC5hY3RpdmVUZXh0dXJlKEdMX1RFWFRVUkUwICsgdW5pdClcbiAgICAgIGFjdGl2ZVRleHR1cmUgPSB1bml0XG4gICAgfSBlbHNlIHtcbiAgICAgIGdsLmJpbmRUZXh0dXJlKHRhcmdldCwgdGV4dHVyZS50ZXh0dXJlKVxuICAgIH1cblxuICAgIC8vIFVwbG9hZFxuICAgIHZhciBwaXhlbHMgPSB0ZXh0dXJlLnBpeGVsc1xuICAgIHZhciBwYXJhbXMgPSB0ZXh0dXJlLnBhcmFtc1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcGl4ZWxzLmxlbmd0aDsgKytpKSB7XG4gICAgICBwaXhlbHNbaV0udXBsb2FkKHBhcmFtcylcbiAgICB9XG4gICAgcGFyYW1zLnVwbG9hZCgpXG5cbiAgICAvLyBMYXp5IHVuYmluZFxuICAgIGlmICh1bml0IDwgMCkge1xuICAgICAgdmFyIGFjdGl2ZSA9IHRleHR1cmVVbml0c1thY3RpdmVUZXh0dXJlXVxuICAgICAgaWYgKGFjdGl2ZSkge1xuICAgICAgICAvLyByZXN0b3JlIGJpbmRpbmcgc3RhdGVcbiAgICAgICAgZ2wuYmluZFRleHR1cmUoYWN0aXZlLnRhcmdldCwgYWN0aXZlLnRleHR1cmUpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBvdGhlcndpc2UgYmVjb21lIG5ldyBhY3RpdmVcbiAgICAgICAgdGV4dHVyZS51bml0ID0gYWN0aXZlVGV4dHVyZVxuICAgICAgICB0ZXh0dXJlVW5pdHNbYWN0aXZlVGV4dHVyZV0gPSB0ZXh0dXJlXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaG9va0xpc3RlbmVycyAodGV4dHVyZSkge1xuICAgIHZhciBwYXJhbXMgPSB0ZXh0dXJlLnBhcmFtc1xuICAgIHZhciBwaXhlbHMgPSB0ZXh0dXJlLnBpeGVsc1xuXG4gICAgLy8gQXBwZW5kcyBhbGwgdGhlIHRleHR1cmUgZGF0YSBmcm9tIHRoZSBidWZmZXIgdG8gdGhlIGN1cnJlbnRcbiAgICBmdW5jdGlvbiBhcHBlbmRERFMgKHRhcmdldCwgbWlwbGV2ZWwsIGJ1ZmZlcikge1xuICAgICAgdmFyIGRkcyA9IHBhcnNlRERTKGJ1ZmZlcilcblxuICAgICAgXG5cbiAgICAgIGlmIChkZHMuY3ViZSkge1xuICAgICAgICBcblxuICAgICAgICAvLyBUT0RPIGhhbmRsZSBjdWJlIG1hcCBERFNcbiAgICAgICAgXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBcbiAgICAgIH1cblxuICAgICAgaWYgKG1pcGxldmVsKSB7XG4gICAgICAgIFxuICAgICAgfVxuXG4gICAgICBkZHMucGl4ZWxzLmZvckVhY2goZnVuY3Rpb24gKHBpeG1hcCkge1xuICAgICAgICB2YXIgaW5mbyA9IG5ldyBQaXhlbEluZm8oZGRzLmN1YmUgPyBwaXhtYXAudGFyZ2V0IDogdGFyZ2V0KVxuXG4gICAgICAgIGluZm8uY2hhbm5lbHMgPSBkZHMuY2hhbm5lbHNcbiAgICAgICAgaW5mby5jb21wcmVzc2VkID0gZGRzLmNvbXByZXNzZWRcbiAgICAgICAgaW5mby50eXBlID0gZGRzLnR5cGVcbiAgICAgICAgaW5mby5pbnRlcm5hbGZvcm1hdCA9IGRkcy5mb3JtYXRcbiAgICAgICAgaW5mby5mb3JtYXQgPSBjb2xvckZvcm1hdHNbZGRzLmZvcm1hdF1cblxuICAgICAgICBpbmZvLndpZHRoID0gcGl4bWFwLndpZHRoXG4gICAgICAgIGluZm8uaGVpZ2h0ID0gcGl4bWFwLmhlaWdodFxuICAgICAgICBpbmZvLm1pcGxldmVsID0gcGl4bWFwLm1pcGxldmVsIHx8IG1pcGxldmVsXG4gICAgICAgIGluZm8uZGF0YSA9IHBpeG1hcC5kYXRhXG5cbiAgICAgICAgcGl4ZWxzLnB1c2goaW5mbylcbiAgICAgIH0pXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gb25EYXRhICgpIHtcbiAgICAgIC8vIFVwZGF0ZSBzaXplIG9mIGFueSBuZXdseSBsb2FkZWQgcGl4ZWxzXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHBpeGVscy5sZW5ndGg7ICsraSkge1xuICAgICAgICB2YXIgcGl4ZWxEYXRhID0gcGl4ZWxzW2ldXG4gICAgICAgIHZhciBpbWFnZSA9IHBpeGVsRGF0YS5pbWFnZVxuICAgICAgICB2YXIgdmlkZW8gPSBwaXhlbERhdGEudmlkZW9cbiAgICAgICAgdmFyIHhociA9IHBpeGVsRGF0YS54aHJcbiAgICAgICAgaWYgKGltYWdlICYmIGltYWdlLmNvbXBsZXRlKSB7XG4gICAgICAgICAgcGl4ZWxEYXRhLndpZHRoID0gaW1hZ2UubmF0dXJhbFdpZHRoXG4gICAgICAgICAgcGl4ZWxEYXRhLmhlaWdodCA9IGltYWdlLm5hdHVyYWxIZWlnaHRcbiAgICAgICAgfSBlbHNlIGlmICh2aWRlbyAmJiB2aWRlby5yZWFkeVN0YXRlID4gMikge1xuICAgICAgICAgIHBpeGVsRGF0YS53aWR0aCA9IHZpZGVvLndpZHRoXG4gICAgICAgICAgcGl4ZWxEYXRhLmhlaWdodCA9IHZpZGVvLmhlaWdodFxuICAgICAgICB9IGVsc2UgaWYgKHhociAmJiB4aHIucmVhZHlTdGF0ZSA9PT0gNCkge1xuICAgICAgICAgIHBpeGVsc1tpXSA9IHBpeGVsc1twaXhlbHMubGVuZ3RoIC0gMV1cbiAgICAgICAgICBwaXhlbHMucG9wKClcbiAgICAgICAgICB4aHIucmVtb3ZlRXZlbnRMaXN0ZW5lcigncmVhZHlzdGF0ZWNoYW5nZScsIHJlZnJlc2gpXG4gICAgICAgICAgYXBwZW5kRERTKHBpeGVsRGF0YS50YXJnZXQsIHBpeGVsRGF0YS5taXBsZXZlbCwgeGhyLnJlc3BvbnNlKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjaGVja1RleHR1cmVDb21wbGV0ZShwYXJhbXMsIHBpeGVscylcbiAgICAgIHJlZnJlc2godGV4dHVyZSlcbiAgICB9XG5cbiAgICBwaXhlbHMuZm9yRWFjaChmdW5jdGlvbiAocGl4ZWxEYXRhKSB7XG4gICAgICBpZiAocGl4ZWxEYXRhLmltYWdlICYmICFwaXhlbERhdGEuaW1hZ2UuY29tcGxldGUpIHtcbiAgICAgICAgcGl4ZWxEYXRhLmltYWdlLmFkZEV2ZW50TGlzdGVuZXIoJ2xvYWQnLCBvbkRhdGEpXG4gICAgICB9IGVsc2UgaWYgKHBpeGVsRGF0YS52aWRlbyAmJiBwaXhlbERhdGEucmVhZHlTdGF0ZSA8IDEpIHtcbiAgICAgICAgcGl4ZWxEYXRhLnZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ3Byb2dyZXNzJywgb25EYXRhKVxuICAgICAgfSBlbHNlIGlmIChwaXhlbERhdGEueGhyKSB7XG4gICAgICAgIHBpeGVsRGF0YS54aHIuYWRkRXZlbnRMaXN0ZW5lcigncmVhZHlzdGF0ZWNoYW5nZScsIG9uRGF0YSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgdGV4dHVyZS5jYW5jZWxQZW5kaW5nID0gZnVuY3Rpb24gZGV0YWNoTGlzdGVuZXJzICgpIHtcbiAgICAgIHBpeGVscy5mb3JFYWNoKGZ1bmN0aW9uIChwaXhlbERhdGEpIHtcbiAgICAgICAgaWYgKHBpeGVsRGF0YS5pbWFnZSkge1xuICAgICAgICAgIHBpeGVsRGF0YS5pbWFnZS5yZW1vdmVFdmVudExpc3RlbmVyKCdsb2FkJywgb25EYXRhKVxuICAgICAgICB9IGVsc2UgaWYgKHBpeGVsRGF0YS52aWRlbykge1xuICAgICAgICAgIHBpeGVsRGF0YS52aWRlby5yZW1vdmVFdmVudExpc3RlbmVyKCdwcm9ncmVzcycsIG9uRGF0YSlcbiAgICAgICAgfSBlbHNlIGlmIChwaXhlbERhdGEueGhyKSB7XG4gICAgICAgICAgcGl4ZWxEYXRhLnhoci5yZW1vdmVFdmVudExpc3RlbmVyKCdyZWFkeXN0YXRlY2hhbmdlJywgb25EYXRhKVxuICAgICAgICAgIHBpeGVsRGF0YS54aHIuYWJvcnQoKVxuICAgICAgICB9XG4gICAgICB9KVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNsZWFyTGlzdGVuZXJzICh0ZXh0dXJlKSB7XG4gICAgdmFyIGNhbmNlbFBlbmRpbmcgPSB0ZXh0dXJlLmNhbmNlbFBlbmRpbmdcbiAgICBpZiAoY2FuY2VsUGVuZGluZykge1xuICAgICAgY2FuY2VsUGVuZGluZygpXG4gICAgICB0ZXh0dXJlLmNhbmNlbFBlbmRpbmcgPSBudWxsXG4gICAgfVxuICAgIHZhciBpZCA9IHRleHR1cmUucG9sbElkXG4gICAgaWYgKGlkID49IDApIHtcbiAgICAgIHZhciBvdGhlciA9IHBvbGxTZXRbaWRdID0gcG9sbFNldFtwb2xsU2V0Lmxlbmd0aCAtIDFdXG4gICAgICBvdGhlci5pZCA9IGlkXG4gICAgICBwb2xsU2V0LnBvcCgpXG4gICAgICB0ZXh0dXJlLnBvbGxJZCA9IC0xXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSAodGV4dHVyZSkge1xuICAgIHZhciBoYW5kbGUgPSB0ZXh0dXJlLnRleHR1cmVcbiAgICBcbiAgICB2YXIgdW5pdCA9IHRleHR1cmUudW5pdFxuICAgIHZhciB0YXJnZXQgPSB0ZXh0dXJlLnRhcmdldFxuICAgIGlmICh1bml0ID49IDApIHtcbiAgICAgIGdsLmFjdGl2ZVRleHR1cmUoR0xfVEVYVFVSRTAgKyB1bml0KVxuICAgICAgYWN0aXZlVGV4dHVyZSA9IHVuaXRcbiAgICAgIGdsLmJpbmRUZXh0dXJlKHRhcmdldCwgbnVsbClcbiAgICAgIHRleHR1cmVVbml0c1t1bml0XSA9IG51bGxcbiAgICB9XG4gICAgY2xlYXJMaXN0ZW5lcnModGV4dHVyZSlcbiAgICBpZiAoZ2wuaXNUZXh0dXJlKGhhbmRsZSkpIHtcbiAgICAgIGdsLmRlbGV0ZVRleHR1cmUoaGFuZGxlKVxuICAgIH1cbiAgICB0ZXh0dXJlLnRleHR1cmUgPSBudWxsXG4gICAgdGV4dHVyZS5wYXJhbXMgPSBudWxsXG4gICAgdGV4dHVyZS5waXhlbHMgPSBudWxsXG4gICAgdGV4dHVyZS5yZWZDb3VudCA9IDBcbiAgICBkZWxldGUgdGV4dHVyZVNldFt0ZXh0dXJlLmlkXVxuICB9XG5cbiAgZXh0ZW5kKFJFR0xUZXh0dXJlLnByb3RvdHlwZSwge1xuICAgIGJpbmQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciB0ZXh0dXJlID0gdGhpc1xuICAgICAgdGV4dHVyZS5iaW5kQ291bnQgKz0gMVxuICAgICAgdmFyIHVuaXQgPSB0ZXh0dXJlLnVuaXRcbiAgICAgIGlmICh1bml0IDwgMCkge1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG51bVRleFVuaXRzOyArK2kpIHtcbiAgICAgICAgICB2YXIgb3RoZXIgPSB0ZXh0dXJlVW5pdHNbaV1cbiAgICAgICAgICBpZiAob3RoZXIpIHtcbiAgICAgICAgICAgIGlmIChvdGhlci5iaW5kQ291bnQgPiAwKSB7XG4gICAgICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBvdGhlci51bml0ID0gLTFcbiAgICAgICAgICB9XG4gICAgICAgICAgdGV4dHVyZVVuaXRzW2ldID0gdGV4dHVyZVxuICAgICAgICAgIHVuaXQgPSBpXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgfVxuICAgICAgICBpZiAodW5pdCA+PSBudW1UZXhVbml0cykge1xuICAgICAgICAgIFxuICAgICAgICB9XG4gICAgICAgIHRleHR1cmUudW5pdCA9IHVuaXRcbiAgICAgICAgZ2wuYWN0aXZlVGV4dHVyZShHTF9URVhUVVJFMCArIHVuaXQpXG4gICAgICAgIGdsLmJpbmRUZXh0dXJlKHRleHR1cmUudGFyZ2V0LCB0ZXh0dXJlLnRleHR1cmUpXG4gICAgICAgIGFjdGl2ZVRleHR1cmUgPSB1bml0XG4gICAgICB9XG4gICAgICByZXR1cm4gdW5pdFxuICAgIH0sXG5cbiAgICB1bmJpbmQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHRoaXMuYmluZENvdW50IC09IDFcbiAgICB9LFxuXG4gICAgZGVjUmVmOiBmdW5jdGlvbiAoKSB7XG4gICAgICBpZiAoLS10aGlzLnJlZkNvdW50ID09PSAwKSB7XG4gICAgICAgIGRlc3Ryb3kodGhpcylcbiAgICAgIH1cbiAgICB9XG4gIH0pXG5cbiAgZnVuY3Rpb24gY3JlYXRlVGV4dHVyZSAob3B0aW9ucywgdGFyZ2V0KSB7XG4gICAgdmFyIHRleHR1cmUgPSBuZXcgUkVHTFRleHR1cmUodGFyZ2V0KVxuICAgIHRleHR1cmVTZXRbdGV4dHVyZS5pZF0gPSB0ZXh0dXJlXG5cbiAgICBmdW5jdGlvbiByZWdsVGV4dHVyZSAoYTAsIGExLCBhMiwgYTMsIGE0LCBhNSkge1xuICAgICAgdmFyIG9wdGlvbnMgPSBhMCB8fCB7fVxuICAgICAgaWYgKHRhcmdldCA9PT0gR0xfVEVYVFVSRV9DVUJFX01BUCAmJiBhcmd1bWVudHMubGVuZ3RoID09PSA2KSB7XG4gICAgICAgIG9wdGlvbnMgPSBbYTAsIGExLCBhMiwgYTMsIGE0LCBhNV1cbiAgICAgIH1cbiAgICAgIHVwZGF0ZSh0ZXh0dXJlLCBvcHRpb25zKVxuICAgICAgcmVnbFRleHR1cmUud2lkdGggPSB0ZXh0dXJlLnBhcmFtcy53aWR0aFxuICAgICAgcmVnbFRleHR1cmUuaGVpZ2h0ID0gdGV4dHVyZS5wYXJhbXMuaGVpZ2h0XG4gICAgICByZXR1cm4gcmVnbFRleHR1cmVcbiAgICB9XG5cbiAgICByZWdsVGV4dHVyZShvcHRpb25zKVxuXG4gICAgcmVnbFRleHR1cmUuX3JlZ2xUeXBlID0gJ3RleHR1cmUnXG4gICAgcmVnbFRleHR1cmUuX3RleHR1cmUgPSB0ZXh0dXJlXG4gICAgcmVnbFRleHR1cmUuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHRleHR1cmUuZGVjUmVmKClcbiAgICB9XG4gIFxuICAgIHJldHVybiByZWdsVGV4dHVyZVxuICB9XG5cbiAgLy8gQ2FsbGVkIGFmdGVyIGNvbnRleHQgcmVzdG9yZVxuICBmdW5jdGlvbiByZWZyZXNoVGV4dHVyZXMgKCkge1xuICAgIHZhbHVlcyh0ZXh0dXJlU2V0KS5mb3JFYWNoKHJlZnJlc2gpXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBudW1UZXhVbml0czsgKytpKSB7XG4gICAgICB0ZXh0dXJlVW5pdHNbaV0gPSBudWxsXG4gICAgfVxuICAgIGFjdGl2ZVRleHR1cmUgPSAwXG4gICAgZ2wuYWN0aXZlVGV4dHVyZShHTF9URVhUVVJFMClcbiAgfVxuXG4gIC8vIENhbGxlZCB3aGVuIHJlZ2wgaXMgZGVzdHJveWVkXG4gIGZ1bmN0aW9uIGRlc3Ryb3lUZXh0dXJlcyAoKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBudW1UZXhVbml0czsgKytpKSB7XG4gICAgICBnbC5hY3RpdmVUZXh0dXJlKEdMX1RFWFRVUkUwICsgaSlcbiAgICAgIGdsLmJpbmRUZXh0dXJlKEdMX1RFWFRVUkVfMkQsIG51bGwpXG4gICAgICB0ZXh0dXJlVW5pdHNbaV0gPSBudWxsXG4gICAgfVxuICAgIGdsLmFjdGl2ZVRleHR1cmUoR0xfVEVYVFVSRTApXG4gICAgYWN0aXZlVGV4dHVyZSA9IDBcbiAgICB2YWx1ZXModGV4dHVyZVNldCkuZm9yRWFjaChkZXN0cm95KVxuICB9XG5cbiAgLy8gQ2FsbGVkIG9uY2UgcGVyIHJhZiwgdXBkYXRlcyB2aWRlbyB0ZXh0dXJlc1xuICBmdW5jdGlvbiBwb2xsVGV4dHVyZXMgKCkge1xuICAgIHBvbGxTZXQuZm9yRWFjaChyZWZyZXNoKVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjcmVhdGU6IGNyZWF0ZVRleHR1cmUsXG4gICAgcmVmcmVzaDogcmVmcmVzaFRleHR1cmVzLFxuICAgIGNsZWFyOiBkZXN0cm95VGV4dHVyZXMsXG4gICAgcG9sbDogcG9sbFRleHR1cmVzLFxuICAgIGdldFRleHR1cmU6IGZ1bmN0aW9uICh3cmFwcGVyKSB7XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cbiAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjb252ZXJ0VG9IYWxmRmxvYXQgKGFycmF5KSB7XG4gIHZhciBmbG9hdHMgPSBuZXcgRmxvYXQzMkFycmF5KGFycmF5KVxuICB2YXIgdWludHMgPSBuZXcgVWludDMyQXJyYXkoZmxvYXRzLmJ1ZmZlcilcbiAgdmFyIHVzaG9ydHMgPSBuZXcgVWludDE2QXJyYXkoYXJyYXkubGVuZ3RoKVxuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgYXJyYXkubGVuZ3RoOyArK2kpIHtcbiAgICBpZiAoaXNOYU4oYXJyYXlbaV0pKSB7XG4gICAgICB1c2hvcnRzW2ldID0gMHhmZmZmXG4gICAgfSBlbHNlIGlmIChhcnJheVtpXSA9PT0gSW5maW5pdHkpIHtcbiAgICAgIHVzaG9ydHNbaV0gPSAweDdjMDBcbiAgICB9IGVsc2UgaWYgKGFycmF5W2ldID09PSAtSW5maW5pdHkpIHtcbiAgICAgIHVzaG9ydHNbaV0gPSAweGZjMDBcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIHggPSB1aW50c1tpXVxuXG4gICAgICB2YXIgc2duID0gKHggPj4+IDMxKSA8PCAxNVxuICAgICAgdmFyIGV4cCA9ICgoeCA8PCAxKSA+Pj4gMjQpIC0gMTI3XG4gICAgICB2YXIgZnJhYyA9ICh4ID4+IDEzKSAmICgoMSA8PCAxMCkgLSAxKVxuXG4gICAgICBpZiAoZXhwIDwgLTI0KSB7XG4gICAgICAgIC8vIHJvdW5kIG5vbi1yZXByZXNlbnRhYmxlIGRlbm9ybWFscyB0byAwXG4gICAgICAgIHVzaG9ydHNbaV0gPSBzZ25cbiAgICAgIH0gZWxzZSBpZiAoZXhwIDwgLTE0KSB7XG4gICAgICAgIC8vIGhhbmRsZSBkZW5vcm1hbHNcbiAgICAgICAgdmFyIHMgPSAtMTQgLSBleHBcbiAgICAgICAgdXNob3J0c1tpXSA9IHNnbiArICgoZnJhYyArICgxIDw8IDEwKSkgPj4gcylcbiAgICAgIH0gZWxzZSBpZiAoZXhwID4gMTUpIHtcbiAgICAgICAgLy8gcm91bmQgb3ZlcmZsb3cgdG8gKy8tIEluZmluaXR5XG4gICAgICAgIHVzaG9ydHNbaV0gPSBzZ24gKyAweDdjMDBcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIG90aGVyd2lzZSBjb252ZXJ0IGRpcmVjdGx5XG4gICAgICAgIHVzaG9ydHNbaV0gPSBzZ24gKyAoKGV4cCArIDE1KSA8PCAxMCkgKyBmcmFjXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHVzaG9ydHNcbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcFVuaWZvcm1TdGF0ZSAoc3RyaW5nU3RvcmUpIHtcbiAgdmFyIHVuaWZvcm1TdGF0ZSA9IHt9XG5cbiAgZnVuY3Rpb24gZGVmVW5pZm9ybSAobmFtZSkge1xuICAgIHZhciBpZCA9IHN0cmluZ1N0b3JlLmlkKG5hbWUpXG4gICAgdmFyIHJlc3VsdCA9IHVuaWZvcm1TdGF0ZVtpZF1cbiAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgcmVzdWx0ID0gdW5pZm9ybVN0YXRlW2lkXSA9IFtcbiAgICAgICAgWzAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDBdXG4gICAgICBdXG4gICAgfVxuICAgIHJldHVybiByZXN1bHRcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgZGVmOiBkZWZVbmlmb3JtXG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKG9iaikge1xuICByZXR1cm4gT2JqZWN0LmtleXMob2JqKS5tYXAoZnVuY3Rpb24gKGtleSkgeyByZXR1cm4gb2JqW2tleV0gfSlcbn1cbiIsIlxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vbGliL2V4dGVuZCcpXG52YXIgZ2V0Q29udGV4dCA9IHJlcXVpcmUoJy4vbGliL2NvbnRleHQnKVxudmFyIGNyZWF0ZVN0cmluZ1N0b3JlID0gcmVxdWlyZSgnLi9saWIvc3RyaW5ncycpXG52YXIgd3JhcEV4dGVuc2lvbnMgPSByZXF1aXJlKCcuL2xpYi9leHRlbnNpb24nKVxudmFyIHdyYXBMaW1pdHMgPSByZXF1aXJlKCcuL2xpYi9saW1pdHMnKVxudmFyIHdyYXBCdWZmZXJzID0gcmVxdWlyZSgnLi9saWIvYnVmZmVyJylcbnZhciB3cmFwRWxlbWVudHMgPSByZXF1aXJlKCcuL2xpYi9lbGVtZW50cycpXG52YXIgd3JhcFRleHR1cmVzID0gcmVxdWlyZSgnLi9saWIvdGV4dHVyZScpXG52YXIgd3JhcFJlbmRlcmJ1ZmZlcnMgPSByZXF1aXJlKCcuL2xpYi9yZW5kZXJidWZmZXInKVxudmFyIHdyYXBGcmFtZWJ1ZmZlcnMgPSByZXF1aXJlKCcuL2xpYi9mcmFtZWJ1ZmZlcicpXG52YXIgd3JhcFVuaWZvcm1zID0gcmVxdWlyZSgnLi9saWIvdW5pZm9ybScpXG52YXIgd3JhcEF0dHJpYnV0ZXMgPSByZXF1aXJlKCcuL2xpYi9hdHRyaWJ1dGUnKVxudmFyIHdyYXBTaGFkZXJzID0gcmVxdWlyZSgnLi9saWIvc2hhZGVyJylcbnZhciB3cmFwRHJhdyA9IHJlcXVpcmUoJy4vbGliL2RyYXcnKVxudmFyIHdyYXBDb250ZXh0ID0gcmVxdWlyZSgnLi9saWIvc3RhdGUnKVxudmFyIGNyZWF0ZUNvbXBpbGVyID0gcmVxdWlyZSgnLi9saWIvY29tcGlsZScpXG52YXIgd3JhcFJlYWQgPSByZXF1aXJlKCcuL2xpYi9yZWFkJylcbnZhciBkeW5hbWljID0gcmVxdWlyZSgnLi9saWIvZHluYW1pYycpXG52YXIgcmFmID0gcmVxdWlyZSgnLi9saWIvcmFmJylcbnZhciBjbG9jayA9IHJlcXVpcmUoJy4vbGliL2Nsb2NrJylcblxudmFyIEdMX0NPTE9SX0JVRkZFUl9CSVQgPSAxNjM4NFxudmFyIEdMX0RFUFRIX0JVRkZFUl9CSVQgPSAyNTZcbnZhciBHTF9TVEVOQ0lMX0JVRkZFUl9CSVQgPSAxMDI0XG5cbnZhciBHTF9BUlJBWV9CVUZGRVIgPSAzNDk2MlxudmFyIEdMX1RFWFRVUkVfMkQgPSAweDBERTFcbnZhciBHTF9URVhUVVJFX0NVQkVfTUFQID0gMHg4NTEzXG5cbnZhciBDT05URVhUX0xPU1RfRVZFTlQgPSAnd2ViZ2xjb250ZXh0bG9zdCdcbnZhciBDT05URVhUX1JFU1RPUkVEX0VWRU5UID0gJ3dlYmdsY29udGV4dHJlc3RvcmVkJ1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBSRUdMICgpIHtcbiAgdmFyIGFyZ3MgPSBnZXRDb250ZXh0KEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cykpXG4gIHZhciBnbCA9IGFyZ3MuZ2xcbiAgdmFyIG9wdGlvbnMgPSBhcmdzLm9wdGlvbnNcblxuICAvLyBVc2Ugc3RyaW5nIHN0b3JlIHRvIHRyYWNrIHN0cmluZyBpZHNcbiAgdmFyIHN0cmluZ1N0b3JlID0gY3JlYXRlU3RyaW5nU3RvcmUoKVxuXG4gIHZhciBleHRlbnNpb25TdGF0ZSA9IHdyYXBFeHRlbnNpb25zKGdsKVxuICB2YXIgZXh0ZW5zaW9ucyA9IGV4dGVuc2lvblN0YXRlLmV4dGVuc2lvbnNcblxuICB2YXIgdmlld3BvcnRTdGF0ZSA9IHtcbiAgICB3aWR0aDogZ2wuZHJhd2luZ0J1ZmZlcldpZHRoLFxuICAgIGhlaWdodDogZ2wuZHJhd2luZ0J1ZmZlckhlaWdodFxuICB9XG5cbiAgdmFyIGxpbWl0cyA9IHdyYXBMaW1pdHMoXG4gICAgZ2wsXG4gICAgZXh0ZW5zaW9ucylcblxuICB2YXIgYnVmZmVyU3RhdGUgPSB3cmFwQnVmZmVycyhnbClcblxuICB2YXIgZWxlbWVudFN0YXRlID0gd3JhcEVsZW1lbnRzKFxuICAgIGdsLFxuICAgIGV4dGVuc2lvbnMsXG4gICAgYnVmZmVyU3RhdGUpXG5cbiAgdmFyIHVuaWZvcm1TdGF0ZSA9IHdyYXBVbmlmb3JtcyhzdHJpbmdTdG9yZSlcblxuICB2YXIgYXR0cmlidXRlU3RhdGUgPSB3cmFwQXR0cmlidXRlcyhcbiAgICBnbCxcbiAgICBleHRlbnNpb25zLFxuICAgIGxpbWl0cyxcbiAgICBidWZmZXJTdGF0ZSxcbiAgICBzdHJpbmdTdG9yZSlcblxuICB2YXIgc2hhZGVyU3RhdGUgPSB3cmFwU2hhZGVycyhcbiAgICBnbCxcbiAgICBhdHRyaWJ1dGVTdGF0ZSxcbiAgICB1bmlmb3JtU3RhdGUsXG4gICAgZnVuY3Rpb24gKHByb2dyYW0pIHtcbiAgICAgIHJldHVybiBjb21waWxlci5kcmF3KHByb2dyYW0pXG4gICAgfSxcbiAgICBzdHJpbmdTdG9yZSlcblxuICB2YXIgZHJhd1N0YXRlID0gd3JhcERyYXcoXG4gICAgZ2wsXG4gICAgZXh0ZW5zaW9ucyxcbiAgICBidWZmZXJTdGF0ZSlcblxuICB2YXIgdGV4dHVyZVN0YXRlID0gd3JhcFRleHR1cmVzKFxuICAgIGdsLFxuICAgIGV4dGVuc2lvbnMsXG4gICAgbGltaXRzLFxuICAgIHBvbGwsXG4gICAgdmlld3BvcnRTdGF0ZSlcblxuICB2YXIgcmVuZGVyYnVmZmVyU3RhdGUgPSB3cmFwUmVuZGVyYnVmZmVycyhcbiAgICBnbCxcbiAgICBleHRlbnNpb25zLFxuICAgIGxpbWl0cylcblxuICB2YXIgZnJhbWVidWZmZXJTdGF0ZSA9IHdyYXBGcmFtZWJ1ZmZlcnMoXG4gICAgZ2wsXG4gICAgZXh0ZW5zaW9ucyxcbiAgICBsaW1pdHMsXG4gICAgdGV4dHVyZVN0YXRlLFxuICAgIHJlbmRlcmJ1ZmZlclN0YXRlKVxuXG4gIHZhciBmcmFtZVN0YXRlID0ge1xuICAgIGNvdW50OiAwLFxuICAgIHN0YXJ0OiBjbG9jaygpLFxuICAgIGR0OiAwLFxuICAgIHQ6IGNsb2NrKCksXG4gICAgcmVuZGVyVGltZTogMCxcbiAgICB3aWR0aDogZ2wuZHJhd2luZ0J1ZmZlcldpZHRoLFxuICAgIGhlaWdodDogZ2wuZHJhd2luZ0J1ZmZlckhlaWdodCxcbiAgICBwaXhlbFJhdGlvOiBvcHRpb25zLnBpeGVsUmF0aW9cbiAgfVxuXG4gIHZhciBnbFN0YXRlID0gd3JhcENvbnRleHQoXG4gICAgZ2wsXG4gICAgZnJhbWVidWZmZXJTdGF0ZSxcbiAgICB2aWV3cG9ydFN0YXRlKVxuXG4gIHZhciByZWFkUGl4ZWxzID0gd3JhcFJlYWQoZ2wsIHBvbGwsIHZpZXdwb3J0U3RhdGUpXG5cbiAgdmFyIGNvbXBpbGVyID0gY3JlYXRlQ29tcGlsZXIoXG4gICAgZ2wsXG4gICAgc3RyaW5nU3RvcmUsXG4gICAgZXh0ZW5zaW9ucyxcbiAgICBsaW1pdHMsXG4gICAgYnVmZmVyU3RhdGUsXG4gICAgZWxlbWVudFN0YXRlLFxuICAgIHRleHR1cmVTdGF0ZSxcbiAgICBmcmFtZWJ1ZmZlclN0YXRlLFxuICAgIGdsU3RhdGUsXG4gICAgdW5pZm9ybVN0YXRlLFxuICAgIGF0dHJpYnV0ZVN0YXRlLFxuICAgIHNoYWRlclN0YXRlLFxuICAgIGRyYXdTdGF0ZSxcbiAgICBmcmFtZVN0YXRlLFxuICAgIHBvbGwpXG5cbiAgdmFyIGNhbnZhcyA9IGdsLmNhbnZhc1xuXG4gIC8vIHJhZiBzdHVmZlxuICB2YXIgcmFmQ2FsbGJhY2tzID0gW11cbiAgdmFyIGFjdGl2ZVJBRiA9IDBcbiAgZnVuY3Rpb24gaGFuZGxlUkFGICgpIHtcbiAgICBhY3RpdmVSQUYgPSByYWYubmV4dChoYW5kbGVSQUYpXG4gICAgZnJhbWVTdGF0ZS5jb3VudCArPSAxXG5cbiAgICBpZiAoZnJhbWVTdGF0ZS53aWR0aCAhPT0gZ2wuZHJhd2luZ0J1ZmZlcldpZHRoIHx8XG4gICAgICAgIGZyYW1lU3RhdGUuaGVpZ2h0ICE9PSBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0KSB7XG4gICAgICBmcmFtZVN0YXRlLndpZHRoID0gZ2wuZHJhd2luZ0J1ZmZlcldpZHRoXG4gICAgICBmcmFtZVN0YXRlLmhlaWdodCA9IGdsLmRyYXdpbmdCdWZmZXJIZWlnaHRcbiAgICAgIGdsU3RhdGUubm90aWZ5Vmlld3BvcnRDaGFuZ2VkKClcbiAgICB9XG5cbiAgICB2YXIgbm93ID0gY2xvY2soKVxuICAgIGZyYW1lU3RhdGUuZHQgPSBub3cgLSBmcmFtZVN0YXRlLnRcbiAgICBmcmFtZVN0YXRlLnQgPSBub3dcblxuICAgIHRleHR1cmVTdGF0ZS5wb2xsKClcblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmFmQ2FsbGJhY2tzLmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgY2IgPSByYWZDYWxsYmFja3NbaV1cbiAgICAgIGNiKGZyYW1lU3RhdGUuY291bnQsIGZyYW1lU3RhdGUudCwgZnJhbWVTdGF0ZS5kdClcbiAgICB9XG4gICAgZnJhbWVTdGF0ZS5yZW5kZXJUaW1lID0gY2xvY2soKSAtIG5vd1xuICB9XG5cbiAgZnVuY3Rpb24gc3RhcnRSQUYgKCkge1xuICAgIGlmICghYWN0aXZlUkFGICYmIHJhZkNhbGxiYWNrcy5sZW5ndGggPiAwKSB7XG4gICAgICBoYW5kbGVSQUYoKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHN0b3BSQUYgKCkge1xuICAgIGlmIChhY3RpdmVSQUYpIHtcbiAgICAgIHJhZi5jYW5jZWwoaGFuZGxlUkFGKVxuICAgICAgYWN0aXZlUkFGID0gMFxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZUNvbnRleHRMb3NzIChldmVudCkge1xuICAgIHN0b3BSQUYoKVxuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KClcbiAgICBpZiAob3B0aW9ucy5vbkNvbnRleHRMb3N0KSB7XG4gICAgICBvcHRpb25zLm9uQ29udGV4dExvc3QoKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZUNvbnRleHRSZXN0b3JlZCAoZXZlbnQpIHtcbiAgICBnbC5nZXRFcnJvcigpXG4gICAgZXh0ZW5zaW9uU3RhdGUucmVmcmVzaCgpXG4gICAgYnVmZmVyU3RhdGUucmVmcmVzaCgpXG4gICAgdGV4dHVyZVN0YXRlLnJlZnJlc2goKVxuICAgIHJlbmRlcmJ1ZmZlclN0YXRlLnJlZnJlc2goKVxuICAgIGZyYW1lYnVmZmVyU3RhdGUucmVmcmVzaCgpXG4gICAgc2hhZGVyU3RhdGUucmVmcmVzaCgpXG4gICAgZ2xTdGF0ZS5yZWZyZXNoKClcbiAgICBpZiAob3B0aW9ucy5vbkNvbnRleHRSZXN0b3JlZCkge1xuICAgICAgb3B0aW9ucy5vbkNvbnRleHRSZXN0b3JlZCgpXG4gICAgfVxuICAgIGhhbmRsZVJBRigpXG4gIH1cblxuICBpZiAoY2FudmFzKSB7XG4gICAgY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoQ09OVEVYVF9MT1NUX0VWRU5ULCBoYW5kbGVDb250ZXh0TG9zcywgZmFsc2UpXG4gICAgY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoQ09OVEVYVF9SRVNUT1JFRF9FVkVOVCwgaGFuZGxlQ29udGV4dFJlc3RvcmVkLCBmYWxzZSlcbiAgfVxuXG4gIC8vIFJlc291cmNlIGRlc3RydWN0dWlvblxuICBmdW5jdGlvbiBkZXN0cm95ICgpIHtcbiAgICBzdG9wUkFGKClcblxuICAgIGlmIChjYW52YXMpIHtcbiAgICAgIGNhbnZhcy5yZW1vdmVFdmVudExpc3RlbmVyKENPTlRFWFRfTE9TVF9FVkVOVCwgaGFuZGxlQ29udGV4dExvc3MpXG4gICAgICBjYW52YXMucmVtb3ZlRXZlbnRMaXN0ZW5lcihDT05URVhUX1JFU1RPUkVEX0VWRU5ULCBoYW5kbGVDb250ZXh0UmVzdG9yZWQpXG4gICAgfVxuXG4gICAgc2hhZGVyU3RhdGUuY2xlYXIoKVxuICAgIGZyYW1lYnVmZmVyU3RhdGUuY2xlYXIoKVxuICAgIHJlbmRlcmJ1ZmZlclN0YXRlLmNsZWFyKClcbiAgICB0ZXh0dXJlU3RhdGUuY2xlYXIoKVxuICAgIGJ1ZmZlclN0YXRlLmNsZWFyKClcblxuICAgIGlmIChvcHRpb25zLm9uRGVzdHJveSkge1xuICAgICAgb3B0aW9ucy5vbkRlc3Ryb3koKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNvbXBpbGVQcm9jZWR1cmUgKG9wdGlvbnMpIHtcbiAgICBcbiAgICBcblxuICAgIHZhciBoYXNEeW5hbWljID0gZmFsc2VcblxuICAgIGZ1bmN0aW9uIGZsYXR0ZW5OZXN0ZWRPcHRpb25zIChvcHRpb25zKSB7XG4gICAgICB2YXIgcmVzdWx0ID0gZXh0ZW5kKHt9LCBvcHRpb25zKVxuICAgICAgZGVsZXRlIHJlc3VsdC51bmlmb3Jtc1xuICAgICAgZGVsZXRlIHJlc3VsdC5hdHRyaWJ1dGVzXG5cbiAgICAgIGZ1bmN0aW9uIG1lcmdlIChuYW1lKSB7XG4gICAgICAgIGlmIChuYW1lIGluIHJlc3VsdCkge1xuICAgICAgICAgIHZhciBjaGlsZCA9IHJlc3VsdFtuYW1lXVxuICAgICAgICAgIGRlbGV0ZSByZXN1bHRbbmFtZV1cbiAgICAgICAgICBPYmplY3Qua2V5cyhjaGlsZCkuZm9yRWFjaChmdW5jdGlvbiAocHJvcCkge1xuICAgICAgICAgICAgcmVzdWx0W25hbWUgKyAnLicgKyBwcm9wXSA9IGNoaWxkW3Byb3BdXG4gICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgbWVyZ2UoJ2JsZW5kJylcbiAgICAgIG1lcmdlKCdkZXB0aCcpXG4gICAgICBtZXJnZSgnY3VsbCcpXG4gICAgICBtZXJnZSgnc3RlbmNpbCcpXG4gICAgICBtZXJnZSgncG9seWdvbk9mZnNldCcpXG4gICAgICBtZXJnZSgnc2Npc3NvcicpXG4gICAgICBtZXJnZSgnc2FtcGxlJylcblxuICAgICAgcmV0dXJuIHJlc3VsdFxuICAgIH1cblxuICAgIC8vIEZpcnN0IHdlIHNlcGFyYXRlIHRoZSBvcHRpb25zIGludG8gc3RhdGljIGFuZCBkeW5hbWljIGNvbXBvbmVudHNcbiAgICBmdW5jdGlvbiBzZXBhcmF0ZUR5bmFtaWMgKG9iamVjdCkge1xuICAgICAgdmFyIHN0YXRpY0l0ZW1zID0ge31cbiAgICAgIHZhciBkeW5hbWljSXRlbXMgPSB7fVxuICAgICAgT2JqZWN0LmtleXMob2JqZWN0KS5mb3JFYWNoKGZ1bmN0aW9uIChvcHRpb24pIHtcbiAgICAgICAgdmFyIHZhbHVlID0gb2JqZWN0W29wdGlvbl1cbiAgICAgICAgaWYgKGR5bmFtaWMuaXNEeW5hbWljKHZhbHVlKSkge1xuICAgICAgICAgIGhhc0R5bmFtaWMgPSB0cnVlXG4gICAgICAgICAgZHluYW1pY0l0ZW1zW29wdGlvbl0gPSBkeW5hbWljLnVuYm94KHZhbHVlLCBvcHRpb24pXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc3RhdGljSXRlbXNbb3B0aW9uXSA9IHZhbHVlXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICByZXR1cm4ge1xuICAgICAgICBkeW5hbWljOiBkeW5hbWljSXRlbXMsXG4gICAgICAgIHN0YXRpYzogc3RhdGljSXRlbXNcbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgdW5pZm9ybXMgPSBzZXBhcmF0ZUR5bmFtaWMob3B0aW9ucy51bmlmb3JtcyB8fCB7fSlcbiAgICB2YXIgYXR0cmlidXRlcyA9IHNlcGFyYXRlRHluYW1pYyhvcHRpb25zLmF0dHJpYnV0ZXMgfHwge30pXG4gICAgdmFyIG9wdHMgPSBzZXBhcmF0ZUR5bmFtaWMoZmxhdHRlbk5lc3RlZE9wdGlvbnMob3B0aW9ucykpXG5cbiAgICB2YXIgY29tcGlsZWQgPSBjb21waWxlci5jb21tYW5kKFxuICAgICAgb3B0cy5zdGF0aWMsIHVuaWZvcm1zLnN0YXRpYywgYXR0cmlidXRlcy5zdGF0aWMsXG4gICAgICBvcHRzLmR5bmFtaWMsIHVuaWZvcm1zLmR5bmFtaWMsIGF0dHJpYnV0ZXMuZHluYW1pYyxcbiAgICAgIGhhc0R5bmFtaWMpXG5cbiAgICB2YXIgZHJhdyA9IGNvbXBpbGVkLmRyYXdcbiAgICB2YXIgYmF0Y2ggPSBjb21waWxlZC5iYXRjaFxuICAgIHZhciBzY29wZSA9IGNvbXBpbGVkLnNjb3BlXG5cbiAgICB2YXIgRU1QVFlfQVJSQVkgPSBbXVxuICAgIGZ1bmN0aW9uIHJlc2VydmUgKGNvdW50KSB7XG4gICAgICB3aGlsZSAoRU1QVFlfQVJSQVkubGVuZ3RoIDwgY291bnQpIHtcbiAgICAgICAgRU1QVFlfQVJSQVkucHVzaChudWxsKVxuICAgICAgfVxuICAgICAgcmV0dXJuIEVNUFRZX0FSUkFZXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gUkVHTENvbW1hbmQgKGFyZ3MsIGJvZHkpIHtcbiAgICAgIGlmICh0eXBlb2YgYXJncyA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgcmV0dXJuIGJhdGNoKGFyZ3MgfCAwLCByZXNlcnZlKGFyZ3MgfCAwKSlcbiAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShhcmdzKSkge1xuICAgICAgICByZXR1cm4gYmF0Y2goYXJncy5sZW5ndGgsIGFyZ3MpXG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBhcmdzID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHJldHVybiBzY29wZShudWxsLCBhcmdzKVxuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgYm9keSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICByZXR1cm4gc2NvcGUoYXJncywgYm9keSlcbiAgICAgIH1cbiAgICAgIHJldHVybiBkcmF3KGFyZ3MpXG4gICAgfVxuXG4gICAgcmV0dXJuIFJFR0xDb21tYW5kXG4gIH1cblxuICBmdW5jdGlvbiBwb2xsICgpIHtcbiAgICBmcmFtZWJ1ZmZlclN0YXRlLnBvbGwoKVxuICAgIGdsU3RhdGUucG9sbCgpXG4gIH1cblxuICBmdW5jdGlvbiBjbGVhciAob3B0aW9ucykge1xuICAgIHZhciBjbGVhckZsYWdzID0gMFxuXG4gICAgLy8gVXBkYXRlIGNvbnRleHQgc3RhdGVcbiAgICBwb2xsKClcblxuICAgIHZhciBjID0gb3B0aW9ucy5jb2xvclxuICAgIGlmIChjKSB7XG4gICAgICBnbC5jbGVhckNvbG9yKCtjWzBdIHx8IDAsICtjWzFdIHx8IDAsICtjWzJdIHx8IDAsICtjWzNdIHx8IDApXG4gICAgICBjbGVhckZsYWdzIHw9IEdMX0NPTE9SX0JVRkZFUl9CSVRcbiAgICB9XG4gICAgaWYgKCdkZXB0aCcgaW4gb3B0aW9ucykge1xuICAgICAgZ2wuY2xlYXJEZXB0aCgrb3B0aW9ucy5kZXB0aClcbiAgICAgIGNsZWFyRmxhZ3MgfD0gR0xfREVQVEhfQlVGRkVSX0JJVFxuICAgIH1cbiAgICBpZiAoJ3N0ZW5jaWwnIGluIG9wdGlvbnMpIHtcbiAgICAgIGdsLmNsZWFyU3RlbmNpbChvcHRpb25zLnN0ZW5jaWwgfCAwKVxuICAgICAgY2xlYXJGbGFncyB8PSBHTF9TVEVOQ0lMX0JVRkZFUl9CSVRcbiAgICB9XG5cbiAgICBcbiAgICBnbC5jbGVhcihjbGVhckZsYWdzKVxuICB9XG5cbiAgLy8gUmVnaXN0ZXJzIGFub3RoZXIgcmVxdWVzdEFuaW1hdGlvbkZyYW1lIGNhbGxiYWNrXG4gIGZ1bmN0aW9uIGZyYW1lIChjYikge1xuICAgIHJhZkNhbGxiYWNrcy5wdXNoKGNiKVxuXG4gICAgZnVuY3Rpb24gY2FuY2VsICgpIHtcbiAgICAgIHZhciBpbmRleCA9IHJhZkNhbGxiYWNrcy5maW5kKGZ1bmN0aW9uIChpdGVtKSB7XG4gICAgICAgIHJldHVybiBpdGVtID09PSBjYlxuICAgICAgfSlcbiAgICAgIGlmIChpbmRleCA8IDApIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICByYWZDYWxsYmFja3Muc3BsaWNlKGluZGV4LCAxKVxuICAgICAgaWYgKHJhZkNhbGxiYWNrcy5sZW5ndGggPD0gMCkge1xuICAgICAgICBzdG9wUkFGKClcbiAgICAgIH1cbiAgICB9XG5cbiAgICBzdGFydFJBRigpXG5cbiAgICByZXR1cm4ge1xuICAgICAgY2FuY2VsOiBjYW5jZWxcbiAgICB9XG4gIH1cblxuICByZXR1cm4gZXh0ZW5kKGNvbXBpbGVQcm9jZWR1cmUsIHtcbiAgICAvLyBDbGVhciBjdXJyZW50IEZCT1xuICAgIGNsZWFyOiBjbGVhcixcblxuICAgIC8vIFNob3J0IGN1dCBmb3IgcHJvcCBiaW5kaW5nXG4gICAgcHJvcDogZHluYW1pYy5kZWZpbmUsXG5cbiAgICAvLyBleGVjdXRlcyBhbiBlbXB0eSBkcmF3IGNvbW1hbmRcbiAgICBkcmF3OiBjb21waWxlUHJvY2VkdXJlKHt9KSxcblxuICAgIC8vIFJlc291cmNlc1xuICAgIGVsZW1lbnRzOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgcmV0dXJuIGVsZW1lbnRTdGF0ZS5jcmVhdGUob3B0aW9ucylcbiAgICB9LFxuICAgIGJ1ZmZlcjogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgIHJldHVybiBidWZmZXJTdGF0ZS5jcmVhdGUob3B0aW9ucywgR0xfQVJSQVlfQlVGRkVSKVxuICAgIH0sXG4gICAgdGV4dHVyZTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgIHJldHVybiB0ZXh0dXJlU3RhdGUuY3JlYXRlKG9wdGlvbnMsIEdMX1RFWFRVUkVfMkQpXG4gICAgfSxcbiAgICBjdWJlOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDYpIHtcbiAgICAgICAgcmV0dXJuIHRleHR1cmVTdGF0ZS5jcmVhdGUoXG4gICAgICAgICAgQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKSxcbiAgICAgICAgICBHTF9URVhUVVJFX0NVQkVfTUFQKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHRleHR1cmVTdGF0ZS5jcmVhdGUob3B0aW9ucywgR0xfVEVYVFVSRV9DVUJFX01BUClcbiAgICAgIH1cbiAgICB9LFxuICAgIHJlbmRlcmJ1ZmZlcjogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgIHJldHVybiByZW5kZXJidWZmZXJTdGF0ZS5jcmVhdGUob3B0aW9ucylcbiAgICB9LFxuICAgIGZyYW1lYnVmZmVyOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgcmV0dXJuIGZyYW1lYnVmZmVyU3RhdGUuY3JlYXRlKG9wdGlvbnMpXG4gICAgfSxcbiAgICBmcmFtZWJ1ZmZlckN1YmU6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICBcbiAgICB9LFxuXG4gICAgLy8gRnJhbWUgcmVuZGVyaW5nXG4gICAgZnJhbWU6IGZyYW1lLFxuICAgIHN0YXRzOiBmcmFtZVN0YXRlLFxuXG4gICAgLy8gU3lzdGVtIGxpbWl0c1xuICAgIGxpbWl0czogbGltaXRzLFxuXG4gICAgLy8gUmVhZCBwaXhlbHNcbiAgICByZWFkOiByZWFkUGl4ZWxzLFxuXG4gICAgLy8gRGVzdHJveSByZWdsIGFuZCBhbGwgYXNzb2NpYXRlZCByZXNvdXJjZXNcbiAgICBkZXN0cm95OiBkZXN0cm95XG4gIH0pXG59XG4iXX0=
