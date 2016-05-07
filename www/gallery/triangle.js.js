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

},{"../regl":33}],2:[function(require,module,exports){
var glTypes = require('./constants/dtypes.json')

var extend = require('./util/extend')

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

  function AttributeStack (name) {
    var records = new Array(16)
    for (var i = 0; i < 16; ++i) {
      records[i] = new AttributeRecord()
    }
    this.records = records
    this.top = -1
    this.name = name
    
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
  function bindAttribute (index, current, attribStack, size) {
    
    var next = attribStack.records[attribStack.top]
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
      result = attributeState[id] = new AttributeStack(name)
    }
    return result
  }

  return {
    bindings: attributeBindings,
    bind: bindAttribute,
    def: defAttribute
  }
}

},{"./constants/dtypes.json":6,"./util/extend":24}],3:[function(require,module,exports){
// Array and element buffer creation

var isTypedArray = require('./util/is-typed-array')
var isNDArrayLike = require('./util/is-ndarray')
var arrayTypes = require('./constants/arraytypes.json')
var bufferTypes = require('./constants/dtypes.json')
var values = require('./util/values')

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

},{"./constants/arraytypes.json":5,"./constants/dtypes.json":6,"./util/is-ndarray":25,"./util/is-typed-array":26,"./util/values":32}],4:[function(require,module,exports){

var createEnvironment = require('./util/codegen')

var primTypes = require('./constants/primitives.json')
var glTypes = require('./constants/dtypes.json')

var GL_ELEMENT_ARRAY_BUFFER = 34963

var GL_FRAGMENT_SHADER = 35632
var GL_VERTEX_SHADER = 35633

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
        STACK, ',',
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
        STACK, ',',
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
    var SHADER_STATE = link(shaderState)
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
        case 'vert':
          hasShader = true
          var shaderId = stringStore.id(value)
          shaderState.shader(
            param === 'frag' ? GL_FRAGMENT_SHADER : GL_VERTEX_SHADER,
            shaderId)
          entry(SHADER_STATE, '.', param, '.push(', shaderId, ');')
          exit(SHADER_STATE, '.', param, '.pop();')
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

    // -------------------------------
    // update shader program only for DRAW and batch
    // -------------------------------
    var commonDraw = block()
    var CURRENT_PROGRAM = commonDraw.def()
    if (staticOptions.frag && staticOptions.vert) {
      var fragSrc = staticOptions.frag
      var vertSrc = staticOptions.vert
      commonDraw(CURRENT_PROGRAM, '=', link(
        shaderState.program(
          stringStore.id(vertSrc),
          stringStore.id(fragSrc))), ';')
    } else {
      commonDraw(CURRENT_PROGRAM, '=',
        SHADER_STATE, '.program', '(',
        SHADER_STATE, '.vert[', SHADER_STATE, '.vert.length-1]', ',',
        SHADER_STATE, '.frag[', SHADER_STATE, '.frag.length-1]', ');')
    }

    // ==========================================================
    // DRAW PROCEDURE
    // ==========================================================
    var draw = proc('draw')
    draw(entry, commonDraw)
    if (hasDynamic) {
      draw(
        DYNARGS, '=', draw.arg(), ';',
        dynamicEntry)
    }
    draw(
      GL_POLL, '();',
      'if(', CURRENT_PROGRAM, ')',
      CURRENT_PROGRAM, '.draw(', hasDynamic ? DYNARGS : '', ');',
      hasDynamic ? dynamicExit : '',
      exit)

    // ==========================================================
    // BATCH DRAW
    // ==========================================================
    var batch = proc('batch')
    batch(entry, commonDraw)
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
      'if(', CURRENT_PROGRAM, '){',
      GL_POLL, '();',
      EXEC_BATCH, '(',
      CURRENT_PROGRAM, ',',
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

},{"./constants/dtypes.json":6,"./constants/primitives.json":7,"./util/codegen":23}],5:[function(require,module,exports){
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
  "lines": 1,
  "line loop": 2,
  "line strip": 3,
  "triangles": 4,
  "triangle strip": 5,
  "triangle fan": 6
}

},{}],8:[function(require,module,exports){
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

},{"./util/extend":24}],9:[function(require,module,exports){
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

},{}],10:[function(require,module,exports){
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

},{}],11:[function(require,module,exports){

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

},{"./constants/primitives.json":7,"./util/is-ndarray":25,"./util/is-typed-array":26}],12:[function(require,module,exports){
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

},{}],13:[function(require,module,exports){

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

},{"./util/extend":24,"./util/values":32}],14:[function(require,module,exports){
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

},{}],15:[function(require,module,exports){

var isTypedArray = require('./util/is-typed-array')

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

},{"./util/is-typed-array":26}],16:[function(require,module,exports){

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

},{"./util/values":32}],17:[function(require,module,exports){

var values = require('./util/values')

var DEFAULT_FRAG_SHADER = 'void main(){gl_FragColor=vec4(0,0,0,0);}'
var DEFAULT_VERT_SHADER = 'void main(){gl_Position=vec4(0,0,0,0);}'

var GL_FRAGMENT_SHADER = 35632
var GL_VERTEX_SHADER = 35633

var GL_ACTIVE_UNIFORMS = 0x8B86
var GL_ACTIVE_ATTRIBUTES = 0x8B89

function ActiveInfo (name, id, location, info) {
  this.name = name
  this.id = id
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
              stringStore.id(name),
              gl.getUniformLocation(program, name),
              info))
          }
        } else {
          uniformState.def(info.name)
          uniforms.push(new ActiveInfo(
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
    var attributes = desc.attributes = []
    for (i = 0; i < numAttributes; ++i) {
      info = gl.getActiveAttrib(program, i)
      if (info) {
        attributeState.def(info.name)
        attributes.push(new ActiveInfo(
          info.name,
          stringStore.id(info.name),
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

  var fragShaderStack = [ -1 ]
  var vertShaderStack = [ -1 ]

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

    program: function (vertId, fragId) {
      
      

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
    },

    shader: getShader,

    frag: fragShaderStack,
    vert: vertShaderStack
  }
}

},{"./util/values":32}],18:[function(require,module,exports){
var createStack = require('./util/stack')
var createEnvironment = require('./util/codegen')

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

},{"./util/codegen":23,"./util/stack":30}],19:[function(require,module,exports){
module.exports = function createStringStore() {
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

},{}],20:[function(require,module,exports){

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

},{"./util/extend":24,"./util/is-ndarray":25,"./util/is-typed-array":26,"./util/load-texture":27,"./util/parse-dds":28,"./util/to-half-float":31,"./util/values":32}],21:[function(require,module,exports){
module.exports = function wrapUniformState (stringStore) {
  var uniformState = {}

  function defUniform (name) {
    var id = stringStore.id(name)
    var result = uniformState[id]
    if (!result) {
      result = uniformState[id] = []
    }
    return result
  }

  return {
    def: defUniform,
    uniforms: uniformState
  }
}

},{}],22:[function(require,module,exports){
/* globals performance */
module.exports =
  (typeof performance !== 'undefined' && performance.now)
  ? function () { return performance.now() }
  : function () { return +(new Date()) }

},{}],23:[function(require,module,exports){
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

},{"./extend":24}],24:[function(require,module,exports){
module.exports = function (base, opts) {
  var keys = Object.keys(opts)
  for (var i = 0; i < keys.length; ++i) {
    base[keys[i]] = opts[keys[i]]
  }
  return base
}

},{}],25:[function(require,module,exports){
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

},{"./is-typed-array":26}],26:[function(require,module,exports){
var dtypes = require('../constants/arraytypes.json')
module.exports = function (x) {
  return Object.prototype.toString.call(x) in dtypes
}

},{"../constants/arraytypes.json":5}],27:[function(require,module,exports){
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

},{}],28:[function(require,module,exports){
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

},{}],29:[function(require,module,exports){
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

},{}],30:[function(require,module,exports){
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

},{}],31:[function(require,module,exports){
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
module.exports = function (obj) {
  return Object.keys(obj).map(function (key) { return obj[key] })
}

},{}],33:[function(require,module,exports){

var extend = require('./lib/util/extend')
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
      if (typeof args === 'function') {
        return scope(null, args)
      } else if (typeof body === 'function') {
        return scope(args, body)
      }

      // Runtime shader check.  Removed in production builds
      

      if (typeof args === 'number') {
        return batch(args | 0, reserve(args | 0))
      } else if (Array.isArray(args)) {
        return batch(args.length, args)
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

},{"./lib/attribute":2,"./lib/buffer":3,"./lib/compile":4,"./lib/context":8,"./lib/draw":9,"./lib/dynamic":10,"./lib/elements":11,"./lib/extension":12,"./lib/framebuffer":13,"./lib/limits":14,"./lib/read":15,"./lib/renderbuffer":16,"./lib/shader":17,"./lib/state":18,"./lib/strings":19,"./lib/texture":20,"./lib/uniform":21,"./lib/util/clock":22,"./lib/util/extend":24,"./lib/util/raf":29}]},{},[1])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJleGFtcGxlL3RyaWFuZ2xlLmpzIiwibGliL2F0dHJpYnV0ZS5qcyIsImxpYi9idWZmZXIuanMiLCJsaWIvY29tcGlsZS5qcyIsImxpYi9jb25zdGFudHMvYXJyYXl0eXBlcy5qc29uIiwibGliL2NvbnN0YW50cy9kdHlwZXMuanNvbiIsImxpYi9jb25zdGFudHMvcHJpbWl0aXZlcy5qc29uIiwibGliL2NvbnRleHQuanMiLCJsaWIvZHJhdy5qcyIsImxpYi9keW5hbWljLmpzIiwibGliL2VsZW1lbnRzLmpzIiwibGliL2V4dGVuc2lvbi5qcyIsImxpYi9mcmFtZWJ1ZmZlci5qcyIsImxpYi9saW1pdHMuanMiLCJsaWIvcmVhZC5qcyIsImxpYi9yZW5kZXJidWZmZXIuanMiLCJsaWIvc2hhZGVyLmpzIiwibGliL3N0YXRlLmpzIiwibGliL3N0cmluZ3MuanMiLCJsaWIvdGV4dHVyZS5qcyIsImxpYi91bmlmb3JtLmpzIiwibGliL3V0aWwvY2xvY2suanMiLCJsaWIvdXRpbC9jb2RlZ2VuLmpzIiwibGliL3V0aWwvZXh0ZW5kLmpzIiwibGliL3V0aWwvaXMtbmRhcnJheS5qcyIsImxpYi91dGlsL2lzLXR5cGVkLWFycmF5LmpzIiwibGliL3V0aWwvbG9hZC10ZXh0dXJlLmpzIiwibGliL3V0aWwvcGFyc2UtZGRzLmpzIiwibGliL3V0aWwvcmFmLmpzIiwibGliL3V0aWwvc3RhY2suanMiLCJsaWIvdXRpbC90by1oYWxmLWZsb2F0LmpzIiwibGliL3V0aWwvdmFsdWVzLmpzIiwicmVnbC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5a0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDektBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNXRCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6SkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcExBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDak1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMTNDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25MQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RDQTtBQUNBO0FBQ0E7QUFDQTs7QUNIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsInZhciByZWdsID0gcmVxdWlyZSgnLi4vcmVnbCcpKClcblxucmVnbC5jbGVhcih7XG4gIGNvbG9yOiBbMSwgMCwgMCwgMV1cbn0pXG5cbnZhciBkcmF3VHJpYW5nbGUgPSByZWdsKHtcbiAgZnJhZzogYFxuICAgIHZvaWQgbWFpbigpIHtcbiAgICAgIGdsX0ZyYWdDb2xvciA9IHZlYzQoMCwgMCwgMSwgMSk7XG4gICAgfWAsXG5cbiAgdmVydDogYFxuICAgIGF0dHJpYnV0ZSB2ZWM0IHBvc2l0aW9uO1xuICAgIHZvaWQgbWFpbigpIHtcbiAgICAgIGdsX1Bvc2l0aW9uID0gcG9zaXRpb247XG4gICAgfWAsXG5cbiAgYXR0cmlidXRlczoge1xuICAgIHBvc2l0aW9uOiByZWdsLmJ1ZmZlcihbXG4gICAgICBbMiwgMiwgMCwgMV0sXG4gICAgICBbMiwgLTIsIDAsIDFdLFxuICAgICAgWy0yLCAtMiwgMCwgMV1cbiAgICBdKVxuICB9LFxuXG4gIGNvdW50OiAzXG59KVxuXG5kcmF3VHJpYW5nbGUoKVxuIiwidmFyIGdsVHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9kdHlwZXMuanNvbicpXG5cbnZhciBleHRlbmQgPSByZXF1aXJlKCcuL3V0aWwvZXh0ZW5kJylcblxudmFyIEdMX0ZMT0FUID0gNTEyNlxuXG5mdW5jdGlvbiBBdHRyaWJ1dGVSZWNvcmQgKCkge1xuICB0aGlzLnBvaW50ZXIgPSBmYWxzZVxuXG4gIHRoaXMueCA9IDAuMFxuICB0aGlzLnkgPSAwLjBcbiAgdGhpcy56ID0gMC4wXG4gIHRoaXMudyA9IDAuMFxuXG4gIHRoaXMuYnVmZmVyID0gbnVsbFxuICB0aGlzLnNpemUgPSAwXG4gIHRoaXMubm9ybWFsaXplZCA9IGZhbHNlXG4gIHRoaXMudHlwZSA9IEdMX0ZMT0FUXG4gIHRoaXMub2Zmc2V0ID0gMFxuICB0aGlzLnN0cmlkZSA9IDBcbiAgdGhpcy5kaXZpc29yID0gMFxufVxuXG5leHRlbmQoQXR0cmlidXRlUmVjb3JkLnByb3RvdHlwZSwge1xuICBlcXVhbHM6IGZ1bmN0aW9uIChvdGhlciwgc2l6ZSkge1xuICAgIGlmICghdGhpcy5wb2ludGVyKSB7XG4gICAgICByZXR1cm4gIW90aGVyLnBvaW50ZXIgJiZcbiAgICAgICAgdGhpcy54ID09PSBvdGhlci54ICYmXG4gICAgICAgIHRoaXMueSA9PT0gb3RoZXIueSAmJlxuICAgICAgICB0aGlzLnogPT09IG90aGVyLnogJiZcbiAgICAgICAgdGhpcy53ID09PSBvdGhlci53XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBvdGhlci5wb2ludGVyICYmXG4gICAgICAgIHRoaXMuYnVmZmVyID09PSBvdGhlci5idWZmZXIgJiZcbiAgICAgICAgdGhpcy5zaXplID09PSBzaXplICYmXG4gICAgICAgIHRoaXMubm9ybWFsaXplZCA9PT0gb3RoZXIubm9ybWFsaXplZCAmJlxuICAgICAgICB0aGlzLnR5cGUgPT09IG90aGVyLnR5cGUgJiZcbiAgICAgICAgdGhpcy5vZmZzZXQgPT09IG90aGVyLm9mZnNldCAmJlxuICAgICAgICB0aGlzLnN0cmlkZSA9PT0gb3RoZXIuc3RyaWRlICYmXG4gICAgICAgIHRoaXMuZGl2aXNvciA9PT0gb3RoZXIuZGl2aXNvclxuICAgIH1cbiAgfSxcblxuICBzZXQ6IGZ1bmN0aW9uIChvdGhlciwgc2l6ZSkge1xuICAgIHZhciBwb2ludGVyID0gdGhpcy5wb2ludGVyID0gb3RoZXIucG9pbnRlclxuICAgIGlmIChwb2ludGVyKSB7XG4gICAgICB0aGlzLmJ1ZmZlciA9IG90aGVyLmJ1ZmZlclxuICAgICAgdGhpcy5zaXplID0gc2l6ZVxuICAgICAgdGhpcy5ub3JtYWxpemVkID0gb3RoZXIubm9ybWFsaXplZFxuICAgICAgdGhpcy50eXBlID0gb3RoZXIudHlwZVxuICAgICAgdGhpcy5vZmZzZXQgPSBvdGhlci5vZmZzZXRcbiAgICAgIHRoaXMuc3RyaWRlID0gb3RoZXIuc3RyaWRlXG4gICAgICB0aGlzLmRpdmlzb3IgPSBvdGhlci5kaXZpc29yXG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMueCA9IG90aGVyLnhcbiAgICAgIHRoaXMueSA9IG90aGVyLnlcbiAgICAgIHRoaXMueiA9IG90aGVyLnpcbiAgICAgIHRoaXMudyA9IG90aGVyLndcbiAgICB9XG4gIH1cbn0pXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcEF0dHJpYnV0ZVN0YXRlIChcbiAgZ2wsXG4gIGV4dGVuc2lvbnMsXG4gIGxpbWl0cyxcbiAgYnVmZmVyU3RhdGUsXG4gIHN0cmluZ1N0b3JlKSB7XG5cbiAgdmFyIGF0dHJpYnV0ZVN0YXRlID0ge31cblxuICB2YXIgTlVNX0FUVFJJQlVURVMgPSBsaW1pdHMubWF4QXR0cmlidXRlc1xuICB2YXIgYXR0cmlidXRlQmluZGluZ3MgPSBuZXcgQXJyYXkoTlVNX0FUVFJJQlVURVMpXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgTlVNX0FUVFJJQlVURVM7ICsraSkge1xuICAgIGF0dHJpYnV0ZUJpbmRpbmdzW2ldID0gbmV3IEF0dHJpYnV0ZVJlY29yZCgpXG4gIH1cblxuICBmdW5jdGlvbiBBdHRyaWJ1dGVTdGFjayAobmFtZSkge1xuICAgIHZhciByZWNvcmRzID0gbmV3IEFycmF5KDE2KVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgMTY7ICsraSkge1xuICAgICAgcmVjb3Jkc1tpXSA9IG5ldyBBdHRyaWJ1dGVSZWNvcmQoKVxuICAgIH1cbiAgICB0aGlzLnJlY29yZHMgPSByZWNvcmRzXG4gICAgdGhpcy50b3AgPSAtMVxuICAgIHRoaXMubmFtZSA9IG5hbWVcbiAgICBcbiAgfVxuXG4gIGZ1bmN0aW9uIHB1c2hBdHRyaWJ1dGVTdGFjayAoc3RhY2spIHtcbiAgICB2YXIgcmVjb3JkcyA9IHN0YWNrLnJlY29yZHNcbiAgICB2YXIgdG9wID0gc3RhY2sudG9wXG5cbiAgICB3aGlsZSAocmVjb3Jkcy5sZW5ndGggLSAxIDw9IHRvcCkge1xuICAgICAgcmVjb3Jkcy5wdXNoKG5ldyBBdHRyaWJ1dGVSZWNvcmQoKSlcbiAgICB9XG5cbiAgICByZXR1cm4gcmVjb3Jkc1srK3N0YWNrLnRvcF1cbiAgfVxuXG4gIGV4dGVuZChBdHRyaWJ1dGVTdGFjay5wcm90b3R5cGUsIHtcbiAgICBwdXNoVmVjOiBmdW5jdGlvbiAoeCwgeSwgeiwgdykge1xuICAgICAgdmFyIGhlYWQgPSBwdXNoQXR0cmlidXRlU3RhY2sodGhpcylcbiAgICAgIGhlYWQucG9pbnRlciA9IGZhbHNlXG4gICAgICBoZWFkLnggPSB4XG4gICAgICBoZWFkLnkgPSB5XG4gICAgICBoZWFkLnogPSB6XG4gICAgICBoZWFkLncgPSB3XG4gICAgfSxcblxuICAgIHB1c2hQdHI6IGZ1bmN0aW9uIChcbiAgICAgIGJ1ZmZlcixcbiAgICAgIHNpemUsXG4gICAgICBvZmZzZXQsXG4gICAgICBzdHJpZGUsXG4gICAgICBkaXZpc29yLFxuICAgICAgbm9ybWFsaXplZCxcbiAgICAgIHR5cGUpIHtcbiAgICAgIHZhciBoZWFkID0gcHVzaEF0dHJpYnV0ZVN0YWNrKHRoaXMpXG4gICAgICBoZWFkLnBvaW50ZXIgPSB0cnVlXG4gICAgICBoZWFkLmJ1ZmZlciA9IGJ1ZmZlclxuICAgICAgaGVhZC5zaXplID0gc2l6ZVxuICAgICAgaGVhZC5vZmZzZXQgPSBvZmZzZXRcbiAgICAgIGhlYWQuc3RyaWRlID0gc3RyaWRlXG4gICAgICBoZWFkLmRpdmlzb3IgPSBkaXZpc29yXG4gICAgICBoZWFkLm5vcm1hbGl6ZWQgPSBub3JtYWxpemVkXG4gICAgICBoZWFkLnR5cGUgPSB0eXBlXG4gICAgfSxcblxuICAgIHB1c2hEeW46IGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICBpZiAodHlwZW9mIGRhdGEgPT09ICdudW1iZXInKSB7XG4gICAgICAgIHRoaXMucHVzaFZlYyhkYXRhLCAwLCAwLCAwKVxuICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XG4gICAgICAgIHRoaXMucHVzaFZlYyhkYXRhWzBdLCBkYXRhWzFdLCBkYXRhWzJdLCBkYXRhWzNdKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIGJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmdldEJ1ZmZlcihkYXRhKVxuICAgICAgICB2YXIgc2l6ZSA9IDBcbiAgICAgICAgdmFyIHN0cmlkZSA9IDBcbiAgICAgICAgdmFyIG9mZnNldCA9IDBcbiAgICAgICAgdmFyIGRpdmlzb3IgPSAwXG4gICAgICAgIHZhciBub3JtYWxpemVkID0gZmFsc2VcbiAgICAgICAgdmFyIHR5cGUgPSBHTF9GTE9BVFxuICAgICAgICBpZiAoIWJ1ZmZlcikge1xuICAgICAgICAgIGJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmdldEJ1ZmZlcihkYXRhLmJ1ZmZlcilcbiAgICAgICAgICBzaXplID0gZGF0YS5zaXplIHx8IDBcbiAgICAgICAgICBzdHJpZGUgPSBkYXRhLnN0cmlkZSB8fCAwXG4gICAgICAgICAgb2Zmc2V0ID0gZGF0YS5vZmZzZXQgfHwgMFxuICAgICAgICAgIGRpdmlzb3IgPSBkYXRhLmRpdmlzb3IgfHwgMFxuICAgICAgICAgIG5vcm1hbGl6ZWQgPSBkYXRhLm5vcm1hbGl6ZWQgfHwgZmFsc2VcbiAgICAgICAgICB0eXBlID0gYnVmZmVyLmR0eXBlXG4gICAgICAgICAgaWYgKCd0eXBlJyBpbiBkYXRhKSB7XG4gICAgICAgICAgICB0eXBlID0gZ2xUeXBlc1tkYXRhLnR5cGVdXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHR5cGUgPSBidWZmZXIuZHR5cGVcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnB1c2hQdHIoYnVmZmVyLCBzaXplLCBvZmZzZXQsIHN0cmlkZSwgZGl2aXNvciwgbm9ybWFsaXplZCwgdHlwZSlcbiAgICAgIH1cbiAgICB9LFxuXG4gICAgcG9wOiBmdW5jdGlvbiAoKSB7XG4gICAgICB0aGlzLnRvcCAtPSAxXG4gICAgfVxuICB9KVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBCSU5EIEFOIEFUVFJJQlVURVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgZnVuY3Rpb24gYmluZEF0dHJpYnV0ZSAoaW5kZXgsIGN1cnJlbnQsIGF0dHJpYlN0YWNrLCBzaXplKSB7XG4gICAgXG4gICAgdmFyIG5leHQgPSBhdHRyaWJTdGFjay5yZWNvcmRzW2F0dHJpYlN0YWNrLnRvcF1cbiAgICBzaXplID0gbmV4dC5zaXplIHx8IHNpemVcbiAgICBpZiAoY3VycmVudC5lcXVhbHMobmV4dCwgc2l6ZSkpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBpZiAoIW5leHQucG9pbnRlcikge1xuICAgICAgaWYgKGN1cnJlbnQucG9pbnRlcikge1xuICAgICAgICBnbC5kaXNhYmxlVmVydGV4QXR0cmliQXJyYXkoaW5kZXgpXG4gICAgICB9XG4gICAgICBnbC52ZXJ0ZXhBdHRyaWI0ZihpbmRleCwgbmV4dC54LCBuZXh0LnksIG5leHQueiwgbmV4dC53KVxuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoIWN1cnJlbnQucG9pbnRlcikge1xuICAgICAgICBnbC5lbmFibGVWZXJ0ZXhBdHRyaWJBcnJheShpbmRleClcbiAgICAgIH1cbiAgICAgIGlmIChjdXJyZW50LmJ1ZmZlciAhPT0gbmV4dC5idWZmZXIpIHtcbiAgICAgICAgbmV4dC5idWZmZXIuYmluZCgpXG4gICAgICB9XG4gICAgICBnbC52ZXJ0ZXhBdHRyaWJQb2ludGVyKFxuICAgICAgICBpbmRleCxcbiAgICAgICAgc2l6ZSxcbiAgICAgICAgbmV4dC50eXBlLFxuICAgICAgICBuZXh0Lm5vcm1hbGl6ZWQsXG4gICAgICAgIG5leHQuc3RyaWRlLFxuICAgICAgICBuZXh0Lm9mZnNldClcbiAgICAgIHZhciBleHRJbnN0YW5jaW5nID0gZXh0ZW5zaW9ucy5hbmdsZV9pbnN0YW5jZWRfYXJyYXlzXG4gICAgICBpZiAoZXh0SW5zdGFuY2luZykge1xuICAgICAgICBleHRJbnN0YW5jaW5nLnZlcnRleEF0dHJpYkRpdmlzb3JBTkdMRShpbmRleCwgbmV4dC5kaXZpc29yKVxuICAgICAgfVxuICAgIH1cbiAgICBjdXJyZW50LnNldChuZXh0LCBzaXplKVxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIERFRklORSBBIE5FVyBBVFRSSUJVVEVcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIGRlZkF0dHJpYnV0ZSAobmFtZSkge1xuICAgIHZhciBpZCA9IHN0cmluZ1N0b3JlLmlkKG5hbWUpXG4gICAgdmFyIHJlc3VsdCA9IGF0dHJpYnV0ZVN0YXRlW2lkXVxuICAgIGlmICghcmVzdWx0KSB7XG4gICAgICByZXN1bHQgPSBhdHRyaWJ1dGVTdGF0ZVtpZF0gPSBuZXcgQXR0cmlidXRlU3RhY2sobmFtZSlcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBiaW5kaW5nczogYXR0cmlidXRlQmluZGluZ3MsXG4gICAgYmluZDogYmluZEF0dHJpYnV0ZSxcbiAgICBkZWY6IGRlZkF0dHJpYnV0ZVxuICB9XG59XG4iLCIvLyBBcnJheSBhbmQgZWxlbWVudCBidWZmZXIgY3JlYXRpb25cblxudmFyIGlzVHlwZWRBcnJheSA9IHJlcXVpcmUoJy4vdXRpbC9pcy10eXBlZC1hcnJheScpXG52YXIgaXNOREFycmF5TGlrZSA9IHJlcXVpcmUoJy4vdXRpbC9pcy1uZGFycmF5JylcbnZhciBhcnJheVR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvYXJyYXl0eXBlcy5qc29uJylcbnZhciBidWZmZXJUeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL2R0eXBlcy5qc29uJylcbnZhciB2YWx1ZXMgPSByZXF1aXJlKCcuL3V0aWwvdmFsdWVzJylcblxudmFyIEdMX1NUQVRJQ19EUkFXID0gMzUwNDRcblxudmFyIEdMX0JZVEUgPSA1MTIwXG52YXIgR0xfVU5TSUdORURfQllURSA9IDUxMjFcbnZhciBHTF9TSE9SVCA9IDUxMjJcbnZhciBHTF9VTlNJR05FRF9TSE9SVCA9IDUxMjNcbnZhciBHTF9JTlQgPSA1MTI0XG52YXIgR0xfVU5TSUdORURfSU5UID0gNTEyNVxudmFyIEdMX0ZMT0FUID0gNTEyNlxuXG52YXIgdXNhZ2VUeXBlcyA9IHtcbiAgJ3N0YXRpYyc6IDM1MDQ0LFxuICAnZHluYW1pYyc6IDM1MDQ4LFxuICAnc3RyZWFtJzogMzUwNDBcbn1cblxuZnVuY3Rpb24gdHlwZWRBcnJheUNvZGUgKGRhdGEpIHtcbiAgcmV0dXJuIGFycmF5VHlwZXNbT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGRhdGEpXSB8IDBcbn1cblxuZnVuY3Rpb24gbWFrZVR5cGVkQXJyYXkgKGR0eXBlLCBhcmdzKSB7XG4gIHN3aXRjaCAoZHR5cGUpIHtcbiAgICBjYXNlIEdMX1VOU0lHTkVEX0JZVEU6XG4gICAgICByZXR1cm4gbmV3IFVpbnQ4QXJyYXkoYXJncylcbiAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUOlxuICAgICAgcmV0dXJuIG5ldyBVaW50MTZBcnJheShhcmdzKVxuICAgIGNhc2UgR0xfVU5TSUdORURfSU5UOlxuICAgICAgcmV0dXJuIG5ldyBVaW50MzJBcnJheShhcmdzKVxuICAgIGNhc2UgR0xfQllURTpcbiAgICAgIHJldHVybiBuZXcgSW50OEFycmF5KGFyZ3MpXG4gICAgY2FzZSBHTF9TSE9SVDpcbiAgICAgIHJldHVybiBuZXcgSW50MTZBcnJheShhcmdzKVxuICAgIGNhc2UgR0xfSU5UOlxuICAgICAgcmV0dXJuIG5ldyBJbnQzMkFycmF5KGFyZ3MpXG4gICAgY2FzZSBHTF9GTE9BVDpcbiAgICAgIHJldHVybiBuZXcgRmxvYXQzMkFycmF5KGFyZ3MpXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBudWxsXG4gIH1cbn1cblxuZnVuY3Rpb24gZmxhdHRlbiAocmVzdWx0LCBkYXRhLCBkaW1lbnNpb24pIHtcbiAgdmFyIHB0ciA9IDBcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBkYXRhLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIHYgPSBkYXRhW2ldXG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBkaW1lbnNpb247ICsraikge1xuICAgICAgcmVzdWx0W3B0cisrXSA9IHZbal1cbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gdHJhbnNwb3NlIChyZXN1bHQsIGRhdGEsIHNoYXBlWCwgc2hhcGVZLCBzdHJpZGVYLCBzdHJpZGVZLCBvZmZzZXQpIHtcbiAgdmFyIHB0ciA9IDBcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzaGFwZVg7ICsraSkge1xuICAgIGZvciAodmFyIGogPSAwOyBqIDwgc2hhcGVZOyArK2opIHtcbiAgICAgIHJlc3VsdFtwdHIrK10gPSBkYXRhW3N0cmlkZVggKiBpICsgc3RyaWRlWSAqIGogKyBvZmZzZXRdXG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHRcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwQnVmZmVyU3RhdGUgKGdsKSB7XG4gIHZhciBidWZmZXJDb3VudCA9IDBcbiAgdmFyIGJ1ZmZlclNldCA9IHt9XG5cbiAgZnVuY3Rpb24gUkVHTEJ1ZmZlciAoYnVmZmVyLCB0eXBlKSB7XG4gICAgdGhpcy5pZCA9IGJ1ZmZlckNvdW50KytcbiAgICB0aGlzLmJ1ZmZlciA9IGJ1ZmZlclxuICAgIHRoaXMudHlwZSA9IHR5cGVcbiAgICB0aGlzLnVzYWdlID0gR0xfU1RBVElDX0RSQVdcbiAgICB0aGlzLmJ5dGVMZW5ndGggPSAwXG4gICAgdGhpcy5kaW1lbnNpb24gPSAxXG4gICAgdGhpcy5kYXRhID0gbnVsbFxuICAgIHRoaXMuZHR5cGUgPSBHTF9VTlNJR05FRF9CWVRFXG4gIH1cblxuICBSRUdMQnVmZmVyLnByb3RvdHlwZS5iaW5kID0gZnVuY3Rpb24gKCkge1xuICAgIGdsLmJpbmRCdWZmZXIodGhpcy50eXBlLCB0aGlzLmJ1ZmZlcilcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlZnJlc2ggKGJ1ZmZlcikge1xuICAgIGlmICghZ2wuaXNCdWZmZXIoYnVmZmVyLmJ1ZmZlcikpIHtcbiAgICAgIGJ1ZmZlci5idWZmZXIgPSBnbC5jcmVhdGVCdWZmZXIoKVxuICAgIH1cbiAgICBidWZmZXIuYmluZCgpXG4gICAgZ2wuYnVmZmVyRGF0YShidWZmZXIudHlwZSwgYnVmZmVyLmRhdGEgfHwgYnVmZmVyLmJ5dGVMZW5ndGgsIGJ1ZmZlci51c2FnZSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3kgKGJ1ZmZlcikge1xuICAgIHZhciBoYW5kbGUgPSBidWZmZXIuYnVmZmVyXG4gICAgXG4gICAgaWYgKGdsLmlzQnVmZmVyKGhhbmRsZSkpIHtcbiAgICAgIGdsLmRlbGV0ZUJ1ZmZlcihoYW5kbGUpXG4gICAgfVxuICAgIGJ1ZmZlci5idWZmZXIgPSBudWxsXG4gICAgZGVsZXRlIGJ1ZmZlclNldFtidWZmZXIuaWRdXG4gIH1cblxuICBmdW5jdGlvbiBjcmVhdGVCdWZmZXIgKG9wdGlvbnMsIHR5cGUsIGRlZmVySW5pdCkge1xuICAgIHZhciBoYW5kbGUgPSBnbC5jcmVhdGVCdWZmZXIoKVxuXG4gICAgdmFyIGJ1ZmZlciA9IG5ldyBSRUdMQnVmZmVyKGhhbmRsZSwgdHlwZSlcbiAgICBidWZmZXJTZXRbYnVmZmVyLmlkXSA9IGJ1ZmZlclxuXG4gICAgZnVuY3Rpb24gcmVnbEJ1ZmZlciAoaW5wdXQpIHtcbiAgICAgIHZhciBvcHRpb25zID0gaW5wdXQgfHwge31cbiAgICAgIGlmIChBcnJheS5pc0FycmF5KG9wdGlvbnMpIHx8XG4gICAgICAgICAgaXNUeXBlZEFycmF5KG9wdGlvbnMpIHx8XG4gICAgICAgICAgaXNOREFycmF5TGlrZShvcHRpb25zKSkge1xuICAgICAgICBvcHRpb25zID0ge1xuICAgICAgICAgIGRhdGE6IG9wdGlvbnNcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICh0eXBlb2Ygb3B0aW9ucyA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgb3B0aW9ucyA9IHtcbiAgICAgICAgICBsZW5ndGg6IG9wdGlvbnMgfCAwXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAob3B0aW9ucyA9PT0gbnVsbCB8fCBvcHRpb25zID09PSB2b2lkIDApIHtcbiAgICAgICAgb3B0aW9ucyA9IHt9XG4gICAgICB9XG5cbiAgICAgIFxuXG4gICAgICBpZiAoJ3VzYWdlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciB1c2FnZSA9IG9wdGlvbnMudXNhZ2VcbiAgICAgICAgXG4gICAgICAgIGJ1ZmZlci51c2FnZSA9IHVzYWdlVHlwZXNbb3B0aW9ucy51c2FnZV1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGJ1ZmZlci51c2FnZSA9IEdMX1NUQVRJQ19EUkFXXG4gICAgICB9XG5cbiAgICAgIHZhciBkdHlwZSA9IDBcbiAgICAgIGlmICgndHlwZScgaW4gb3B0aW9ucykge1xuICAgICAgICBcbiAgICAgICAgZHR5cGUgPSBidWZmZXJUeXBlc1tvcHRpb25zLnR5cGVdXG4gICAgICB9XG5cbiAgICAgIHZhciBkaW1lbnNpb24gPSAob3B0aW9ucy5kaW1lbnNpb24gfCAwKSB8fCAxXG4gICAgICB2YXIgYnl0ZUxlbmd0aCA9IDBcbiAgICAgIHZhciBkYXRhID0gbnVsbFxuICAgICAgaWYgKCdkYXRhJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIGRhdGEgPSBvcHRpb25zLmRhdGFcbiAgICAgICAgaWYgKGRhdGEgPT09IG51bGwpIHtcbiAgICAgICAgICBieXRlTGVuZ3RoID0gb3B0aW9ucy5sZW5ndGggfCAwXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWYgKGlzTkRBcnJheUxpa2UoZGF0YSkpIHtcbiAgICAgICAgICAgIHZhciBzaGFwZSA9IGRhdGEuc2hhcGVcbiAgICAgICAgICAgIHZhciBzdHJpZGUgPSBkYXRhLnN0cmlkZVxuICAgICAgICAgICAgdmFyIG9mZnNldCA9IGRhdGEub2Zmc2V0XG5cbiAgICAgICAgICAgIHZhciBzaGFwZVggPSAwXG4gICAgICAgICAgICB2YXIgc2hhcGVZID0gMFxuICAgICAgICAgICAgdmFyIHN0cmlkZVggPSAwXG4gICAgICAgICAgICB2YXIgc3RyaWRlWSA9IDBcbiAgICAgICAgICAgIGlmIChzaGFwZS5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgICAgc2hhcGVYID0gc2hhcGVbMF1cbiAgICAgICAgICAgICAgc2hhcGVZID0gMVxuICAgICAgICAgICAgICBzdHJpZGVYID0gc3RyaWRlWzBdXG4gICAgICAgICAgICAgIHN0cmlkZVkgPSAwXG4gICAgICAgICAgICB9IGVsc2UgaWYgKHNoYXBlLmxlbmd0aCA9PT0gMikge1xuICAgICAgICAgICAgICBzaGFwZVggPSBzaGFwZVswXVxuICAgICAgICAgICAgICBzaGFwZVkgPSBzaGFwZVsxXVxuICAgICAgICAgICAgICBzdHJpZGVYID0gc3RyaWRlWzBdXG4gICAgICAgICAgICAgIHN0cmlkZVkgPSBzdHJpZGVbMV1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBkdHlwZSA9IGR0eXBlIHx8IHR5cGVkQXJyYXlDb2RlKGRhdGEpIHx8IEdMX0ZMT0FUXG4gICAgICAgICAgICBkaW1lbnNpb24gPSBzaGFwZVlcbiAgICAgICAgICAgIGRhdGEgPSB0cmFuc3Bvc2UoXG4gICAgICAgICAgICAgIG1ha2VUeXBlZEFycmF5KGR0eXBlLCBzaGFwZVggKiBzaGFwZVkpLFxuICAgICAgICAgICAgICBkYXRhLmRhdGEsXG4gICAgICAgICAgICAgIHNoYXBlWCwgc2hhcGVZLFxuICAgICAgICAgICAgICBzdHJpZGVYLCBzdHJpZGVZLFxuICAgICAgICAgICAgICBvZmZzZXQpXG4gICAgICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XG4gICAgICAgICAgICBpZiAoZGF0YS5sZW5ndGggPiAwICYmIEFycmF5LmlzQXJyYXkoZGF0YVswXSkpIHtcbiAgICAgICAgICAgICAgZGltZW5zaW9uID0gZGF0YVswXS5sZW5ndGhcbiAgICAgICAgICAgICAgZHR5cGUgPSBkdHlwZSB8fCBHTF9GTE9BVFxuICAgICAgICAgICAgICB2YXIgcmVzdWx0ID0gbWFrZVR5cGVkQXJyYXkoZHR5cGUsIGRhdGEubGVuZ3RoICogZGltZW5zaW9uKVxuICAgICAgICAgICAgICBkYXRhID0gZmxhdHRlbihyZXN1bHQsIGRhdGEsIGRpbWVuc2lvbilcbiAgICAgICAgICAgICAgZGF0YSA9IHJlc3VsdFxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgZHR5cGUgPSBkdHlwZSB8fCBHTF9GTE9BVFxuICAgICAgICAgICAgICBkYXRhID0gbWFrZVR5cGVkQXJyYXkoZHR5cGUsIGRhdGEpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZHR5cGUgPSBkdHlwZSB8fCB0eXBlZEFycmF5Q29kZShkYXRhKVxuICAgICAgICAgIH1cbiAgICAgICAgICBieXRlTGVuZ3RoID0gZGF0YS5ieXRlTGVuZ3RoXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoJ2xlbmd0aCcgaW4gb3B0aW9ucykge1xuICAgICAgICBieXRlTGVuZ3RoID0gb3B0aW9ucy5sZW5ndGggfCAwXG4gICAgICAgIFxuICAgICAgfVxuXG4gICAgICBidWZmZXIuZGF0YSA9IGRhdGFcbiAgICAgIGJ1ZmZlci5kdHlwZSA9IGR0eXBlIHx8IEdMX1VOU0lHTkVEX0JZVEVcbiAgICAgIGJ1ZmZlci5ieXRlTGVuZ3RoID0gYnl0ZUxlbmd0aFxuICAgICAgYnVmZmVyLmRpbWVuc2lvbiA9IGRpbWVuc2lvblxuXG4gICAgICByZWZyZXNoKGJ1ZmZlcilcblxuICAgICAgcmV0dXJuIHJlZ2xCdWZmZXJcbiAgICB9XG5cbiAgICBpZiAoIWRlZmVySW5pdCkge1xuICAgICAgcmVnbEJ1ZmZlcihvcHRpb25zKVxuICAgIH1cblxuICAgIHJlZ2xCdWZmZXIuX3JlZ2xUeXBlID0gJ2J1ZmZlcidcbiAgICByZWdsQnVmZmVyLl9idWZmZXIgPSBidWZmZXJcbiAgICByZWdsQnVmZmVyLmRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7IGRlc3Ryb3koYnVmZmVyKSB9XG5cbiAgICByZXR1cm4gcmVnbEJ1ZmZlclxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjcmVhdGU6IGNyZWF0ZUJ1ZmZlcixcblxuICAgIGNsZWFyOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YWx1ZXMoYnVmZmVyU2V0KS5mb3JFYWNoKGRlc3Ryb3kpXG4gICAgfSxcblxuICAgIHJlZnJlc2g6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhbHVlcyhidWZmZXJTZXQpLmZvckVhY2gocmVmcmVzaClcbiAgICB9LFxuXG4gICAgZ2V0QnVmZmVyOiBmdW5jdGlvbiAod3JhcHBlcikge1xuICAgICAgaWYgKHdyYXBwZXIgJiYgd3JhcHBlci5fYnVmZmVyIGluc3RhbmNlb2YgUkVHTEJ1ZmZlcikge1xuICAgICAgICByZXR1cm4gd3JhcHBlci5fYnVmZmVyXG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cbiAgfVxufVxuIiwiXG52YXIgY3JlYXRlRW52aXJvbm1lbnQgPSByZXF1aXJlKCcuL3V0aWwvY29kZWdlbicpXG5cbnZhciBwcmltVHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9wcmltaXRpdmVzLmpzb24nKVxudmFyIGdsVHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9kdHlwZXMuanNvbicpXG5cbnZhciBHTF9FTEVNRU5UX0FSUkFZX0JVRkZFUiA9IDM0OTYzXG5cbnZhciBHTF9GUkFHTUVOVF9TSEFERVIgPSAzNTYzMlxudmFyIEdMX1ZFUlRFWF9TSEFERVIgPSAzNTYzM1xuXG52YXIgR0xfRkxPQVQgPSA1MTI2XG52YXIgR0xfRkxPQVRfVkVDMiA9IDM1NjY0XG52YXIgR0xfRkxPQVRfVkVDMyA9IDM1NjY1XG52YXIgR0xfRkxPQVRfVkVDNCA9IDM1NjY2XG52YXIgR0xfSU5UID0gNTEyNFxudmFyIEdMX0lOVF9WRUMyID0gMzU2NjdcbnZhciBHTF9JTlRfVkVDMyA9IDM1NjY4XG52YXIgR0xfSU5UX1ZFQzQgPSAzNTY2OVxudmFyIEdMX0JPT0wgPSAzNTY3MFxudmFyIEdMX0JPT0xfVkVDMiA9IDM1NjcxXG52YXIgR0xfQk9PTF9WRUMzID0gMzU2NzJcbnZhciBHTF9CT09MX1ZFQzQgPSAzNTY3M1xudmFyIEdMX0ZMT0FUX01BVDIgPSAzNTY3NFxudmFyIEdMX0ZMT0FUX01BVDMgPSAzNTY3NVxudmFyIEdMX0ZMT0FUX01BVDQgPSAzNTY3NlxudmFyIEdMX1NBTVBMRVJfMkQgPSAzNTY3OFxudmFyIEdMX1NBTVBMRVJfQ1VCRSA9IDM1NjgwXG5cbnZhciBHTF9UUklBTkdMRVMgPSA0XG5cbnZhciBHTF9DVUxMX0ZBQ0UgPSAweDBCNDRcbnZhciBHTF9CTEVORCA9IDB4MEJFMlxudmFyIEdMX0RJVEhFUiA9IDB4MEJEMFxudmFyIEdMX1NURU5DSUxfVEVTVCA9IDB4MEI5MFxudmFyIEdMX0RFUFRIX1RFU1QgPSAweDBCNzFcbnZhciBHTF9TQ0lTU09SX1RFU1QgPSAweDBDMTFcbnZhciBHTF9QT0xZR09OX09GRlNFVF9GSUxMID0gMHg4MDM3XG52YXIgR0xfU0FNUExFX0FMUEhBX1RPX0NPVkVSQUdFID0gMHg4MDlFXG52YXIgR0xfU0FNUExFX0NPVkVSQUdFID0gMHg4MEEwXG5cbnZhciBHTF9GUk9OVCA9IDEwMjhcbnZhciBHTF9CQUNLID0gMTAyOVxuXG52YXIgR0xfQ1cgPSAweDA5MDBcbnZhciBHTF9DQ1cgPSAweDA5MDFcblxudmFyIEdMX01JTl9FWFQgPSAweDgwMDdcbnZhciBHTF9NQVhfRVhUID0gMHg4MDA4XG5cbnZhciBibGVuZEZ1bmNzID0ge1xuICAnMCc6IDAsXG4gICcxJzogMSxcbiAgJ3plcm8nOiAwLFxuICAnb25lJzogMSxcbiAgJ3NyYyBjb2xvcic6IDc2OCxcbiAgJ29uZSBtaW51cyBzcmMgY29sb3InOiA3NjksXG4gICdzcmMgYWxwaGEnOiA3NzAsXG4gICdvbmUgbWludXMgc3JjIGFscGhhJzogNzcxLFxuICAnZHN0IGNvbG9yJzogNzc0LFxuICAnb25lIG1pbnVzIGRzdCBjb2xvcic6IDc3NSxcbiAgJ2RzdCBhbHBoYSc6IDc3MixcbiAgJ29uZSBtaW51cyBkc3QgYWxwaGEnOiA3NzMsXG4gICdjb25zdGFudCBjb2xvcic6IDMyNzY5LFxuICAnb25lIG1pbnVzIGNvbnN0YW50IGNvbG9yJzogMzI3NzAsXG4gICdjb25zdGFudCBhbHBoYSc6IDMyNzcxLFxuICAnb25lIG1pbnVzIGNvbnN0YW50IGFscGhhJzogMzI3NzIsXG4gICdzcmMgYWxwaGEgc2F0dXJhdGUnOiA3NzZcbn1cblxudmFyIGNvbXBhcmVGdW5jcyA9IHtcbiAgJ25ldmVyJzogNTEyLFxuICAnbGVzcyc6IDUxMyxcbiAgJzwnOiA1MTMsXG4gICdlcXVhbCc6IDUxNCxcbiAgJz0nOiA1MTQsXG4gICc9PSc6IDUxNCxcbiAgJz09PSc6IDUxNCxcbiAgJ2xlcXVhbCc6IDUxNSxcbiAgJzw9JzogNTE1LFxuICAnZ3JlYXRlcic6IDUxNixcbiAgJz4nOiA1MTYsXG4gICdub3RlcXVhbCc6IDUxNyxcbiAgJyE9JzogNTE3LFxuICAnIT09JzogNTE3LFxuICAnZ2VxdWFsJzogNTE4LFxuICAnPj0nOiA1MTgsXG4gICdhbHdheXMnOiA1MTlcbn1cblxudmFyIHN0ZW5jaWxPcHMgPSB7XG4gICcwJzogMCxcbiAgJ3plcm8nOiAwLFxuICAna2VlcCc6IDc2ODAsXG4gICdyZXBsYWNlJzogNzY4MSxcbiAgJ2luY3JlbWVudCc6IDc2ODIsXG4gICdkZWNyZW1lbnQnOiA3NjgzLFxuICAnaW5jcmVtZW50IHdyYXAnOiAzNDA1NSxcbiAgJ2RlY3JlbWVudCB3cmFwJzogMzQwNTYsXG4gICdpbnZlcnQnOiA1Mzg2XG59XG5cbmZ1bmN0aW9uIHR5cGVMZW5ndGggKHgpIHtcbiAgc3dpdGNoICh4KSB7XG4gICAgY2FzZSBHTF9GTE9BVF9WRUMyOlxuICAgIGNhc2UgR0xfSU5UX1ZFQzI6XG4gICAgY2FzZSBHTF9CT09MX1ZFQzI6XG4gICAgICByZXR1cm4gMlxuICAgIGNhc2UgR0xfRkxPQVRfVkVDMzpcbiAgICBjYXNlIEdMX0lOVF9WRUMzOlxuICAgIGNhc2UgR0xfQk9PTF9WRUMzOlxuICAgICAgcmV0dXJuIDNcbiAgICBjYXNlIEdMX0ZMT0FUX1ZFQzQ6XG4gICAgY2FzZSBHTF9JTlRfVkVDNDpcbiAgICBjYXNlIEdMX0JPT0xfVkVDNDpcbiAgICAgIHJldHVybiA0XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiAxXG4gIH1cbn1cblxuZnVuY3Rpb24gc2V0VW5pZm9ybVN0cmluZyAoZ2wsIHR5cGUsIGxvY2F0aW9uLCB2YWx1ZSkge1xuICB2YXIgaW5maXhcbiAgdmFyIHNlcGFyYXRvciA9ICcsJ1xuICBzd2l0Y2ggKHR5cGUpIHtcbiAgICBjYXNlIEdMX0ZMT0FUOlxuICAgICAgaW5maXggPSAnMWYnXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfRkxPQVRfVkVDMjpcbiAgICAgIGluZml4ID0gJzJmdidcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9GTE9BVF9WRUMzOlxuICAgICAgaW5maXggPSAnM2Z2J1xuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX0ZMT0FUX1ZFQzQ6XG4gICAgICBpbmZpeCA9ICc0ZnYnXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfQk9PTDpcbiAgICBjYXNlIEdMX0lOVDpcbiAgICAgIGluZml4ID0gJzFpJ1xuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX0JPT0xfVkVDMjpcbiAgICBjYXNlIEdMX0lOVF9WRUMyOlxuICAgICAgaW5maXggPSAnMml2J1xuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX0JPT0xfVkVDMzpcbiAgICBjYXNlIEdMX0lOVF9WRUMzOlxuICAgICAgaW5maXggPSAnM2l2J1xuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX0JPT0xfVkVDNDpcbiAgICBjYXNlIEdMX0lOVF9WRUM0OlxuICAgICAgaW5maXggPSAnNGl2J1xuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX0ZMT0FUX01BVDI6XG4gICAgICBpbmZpeCA9ICdNYXRyaXgyZnYnXG4gICAgICBzZXBhcmF0b3IgPSAnLGZhbHNlLCdcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9GTE9BVF9NQVQzOlxuICAgICAgaW5maXggPSAnTWF0cml4M2Z2J1xuICAgICAgc2VwYXJhdG9yID0gJyxmYWxzZSwnXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfRkxPQVRfTUFUNDpcbiAgICAgIGluZml4ID0gJ01hdHJpeDRmdidcbiAgICAgIHNlcGFyYXRvciA9ICcsZmFsc2UsJ1xuICAgICAgYnJlYWtcbiAgICBkZWZhdWx0OlxuICAgICAgXG4gIH1cbiAgcmV0dXJuIGdsICsgJy51bmlmb3JtJyArIGluZml4ICsgJygnICsgbG9jYXRpb24gKyBzZXBhcmF0b3IgKyB2YWx1ZSArICcpOydcbn1cblxuZnVuY3Rpb24gc3RhY2tUb3AgKHgpIHtcbiAgcmV0dXJuIHggKyAnWycgKyB4ICsgJy5sZW5ndGgtMV0nXG59XG5cbi8vIE5lZWQgdG8gcHJvY2VzcyBmcmFtZWJ1ZmZlciBmaXJzdCBpbiBvcHRpb25zIGxpc3RcbmZ1bmN0aW9uIG9wdGlvblByaW9yaXR5IChhLCBiKSB7XG4gIGlmIChhID09PSAnZnJhbWVidWZmZXInKSB7XG4gICAgcmV0dXJuIC0xXG4gIH1cbiAgaWYgKGEgPCBiKSB7XG4gICAgcmV0dXJuIC0xXG4gIH0gZWxzZSBpZiAoYSA+IGIpIHtcbiAgICByZXR1cm4gMVxuICB9XG4gIHJldHVybiAwXG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcmVnbENvbXBpbGVyIChcbiAgZ2wsXG4gIHN0cmluZ1N0b3JlLFxuICBleHRlbnNpb25zLFxuICBsaW1pdHMsXG4gIGJ1ZmZlclN0YXRlLFxuICBlbGVtZW50U3RhdGUsXG4gIHRleHR1cmVTdGF0ZSxcbiAgZnJhbWVidWZmZXJTdGF0ZSxcbiAgZ2xTdGF0ZSxcbiAgdW5pZm9ybVN0YXRlLFxuICBhdHRyaWJ1dGVTdGF0ZSxcbiAgc2hhZGVyU3RhdGUsXG4gIGRyYXdTdGF0ZSxcbiAgZnJhbWVTdGF0ZSxcbiAgcmVnbFBvbGwpIHtcbiAgdmFyIGNvbnRleHRTdGF0ZSA9IGdsU3RhdGUuY29udGV4dFN0YXRlXG5cbiAgdmFyIGJsZW5kRXF1YXRpb25zID0ge1xuICAgICdhZGQnOiAzMjc3NCxcbiAgICAnc3VidHJhY3QnOiAzMjc3OCxcbiAgICAncmV2ZXJzZSBzdWJ0cmFjdCc6IDMyNzc5XG4gIH1cbiAgaWYgKGV4dGVuc2lvbnMuZXh0X2JsZW5kX21pbm1heCkge1xuICAgIGJsZW5kRXF1YXRpb25zLm1pbiA9IEdMX01JTl9FWFRcbiAgICBibGVuZEVxdWF0aW9ucy5tYXggPSBHTF9NQVhfRVhUXG4gIH1cblxuICB2YXIgZHJhd0NhbGxDb3VudGVyID0gMFxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gU0hBREVSIFNJTkdMRSBEUkFXIE9QRVJBVElPTlxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIGNvbXBpbGVTaGFkZXJEcmF3IChwcm9ncmFtKSB7XG4gICAgdmFyIGVudiA9IGNyZWF0ZUVudmlyb25tZW50KClcbiAgICB2YXIgbGluayA9IGVudi5saW5rXG4gICAgdmFyIGRyYXcgPSBlbnYucHJvYygnZHJhdycpXG4gICAgdmFyIGRlZiA9IGRyYXcuZGVmXG5cbiAgICB2YXIgR0wgPSBsaW5rKGdsKVxuICAgIHZhciBQUk9HUkFNID0gbGluayhwcm9ncmFtLnByb2dyYW0pXG4gICAgdmFyIEJJTkRfQVRUUklCVVRFID0gbGluayhhdHRyaWJ1dGVTdGF0ZS5iaW5kKVxuICAgIHZhciBEUkFXX1NUQVRFID0ge1xuICAgICAgY291bnQ6IGxpbmsoZHJhd1N0YXRlLmNvdW50KSxcbiAgICAgIG9mZnNldDogbGluayhkcmF3U3RhdGUub2Zmc2V0KSxcbiAgICAgIGluc3RhbmNlczogbGluayhkcmF3U3RhdGUuaW5zdGFuY2VzKSxcbiAgICAgIHByaW1pdGl2ZTogbGluayhkcmF3U3RhdGUucHJpbWl0aXZlKVxuICAgIH1cbiAgICB2YXIgRUxFTUVOVF9TVEFURSA9IGxpbmsoZWxlbWVudFN0YXRlLmVsZW1lbnRzKVxuICAgIHZhciBURVhUVVJFX1VOSUZPUk1TID0gW11cblxuICAgIC8vIGJpbmQgdGhlIHByb2dyYW1cbiAgICBkcmF3KEdMLCAnLnVzZVByb2dyYW0oJywgUFJPR1JBTSwgJyk7JylcblxuICAgIC8vIHNldCB1cCBhdHRyaWJ1dGUgc3RhdGVcbiAgICBwcm9ncmFtLmF0dHJpYnV0ZXMuZm9yRWFjaChmdW5jdGlvbiAoYXR0cmlidXRlKSB7XG4gICAgICB2YXIgU1RBQ0sgPSBsaW5rKGF0dHJpYnV0ZVN0YXRlLmRlZihhdHRyaWJ1dGUubmFtZSkpXG4gICAgICBkcmF3KEJJTkRfQVRUUklCVVRFLCAnKCcsXG4gICAgICAgIGF0dHJpYnV0ZS5sb2NhdGlvbiwgJywnLFxuICAgICAgICBsaW5rKGF0dHJpYnV0ZVN0YXRlLmJpbmRpbmdzW2F0dHJpYnV0ZS5sb2NhdGlvbl0pLCAnLCcsXG4gICAgICAgIFNUQUNLLCAnLCcsXG4gICAgICAgIHR5cGVMZW5ndGgoYXR0cmlidXRlLmluZm8udHlwZSksICcpOycpXG4gICAgfSlcblxuICAgIC8vIHNldCB1cCB1bmlmb3Jtc1xuICAgIHByb2dyYW0udW5pZm9ybXMuZm9yRWFjaChmdW5jdGlvbiAodW5pZm9ybSkge1xuICAgICAgdmFyIExPQ0FUSU9OID0gbGluayh1bmlmb3JtLmxvY2F0aW9uKVxuICAgICAgdmFyIFNUQUNLID0gbGluayh1bmlmb3JtU3RhdGUuZGVmKHVuaWZvcm0ubmFtZSkpXG4gICAgICB2YXIgVE9QID0gU1RBQ0sgKyAnWycgKyBTVEFDSyArICcubGVuZ3RoLTFdJ1xuICAgICAgdmFyIHR5cGUgPSB1bmlmb3JtLmluZm8udHlwZVxuICAgICAgaWYgKHR5cGUgPT09IEdMX1NBTVBMRVJfMkQgfHwgdHlwZSA9PT0gR0xfU0FNUExFUl9DVUJFKSB7XG4gICAgICAgIHZhciBURVhfVkFMVUUgPSBkZWYoVE9QICsgJy5fdGV4dHVyZScpXG4gICAgICAgIFRFWFRVUkVfVU5JRk9STVMucHVzaChURVhfVkFMVUUpXG4gICAgICAgIGRyYXcoc2V0VW5pZm9ybVN0cmluZyhHTCwgR0xfSU5ULCBMT0NBVElPTiwgVEVYX1ZBTFVFICsgJy5iaW5kKCknKSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRyYXcoc2V0VW5pZm9ybVN0cmluZyhHTCwgdHlwZSwgTE9DQVRJT04sIFRPUCkpXG4gICAgICB9XG4gICAgfSlcblxuICAgIC8vIHVuYmluZCB0ZXh0dXJlcyBpbW1lZGlhdGVseVxuICAgIFRFWFRVUkVfVU5JRk9STVMuZm9yRWFjaChmdW5jdGlvbiAoVEVYX1ZBTFVFKSB7XG4gICAgICBkcmF3KFRFWF9WQUxVRSwgJy51bmJpbmQoKTsnKVxuICAgIH0pXG5cbiAgICAvLyBFeGVjdXRlIGRyYXcgY29tbWFuZFxuICAgIHZhciBDVVJfUFJJTUlUSVZFID0gZGVmKHN0YWNrVG9wKERSQVdfU1RBVEUucHJpbWl0aXZlKSlcbiAgICB2YXIgQ1VSX0NPVU5UID0gZGVmKHN0YWNrVG9wKERSQVdfU1RBVEUuY291bnQpKVxuICAgIHZhciBDVVJfT0ZGU0VUID0gZGVmKHN0YWNrVG9wKERSQVdfU1RBVEUub2Zmc2V0KSlcbiAgICB2YXIgQ1VSX0VMRU1FTlRTID0gZGVmKHN0YWNrVG9wKEVMRU1FTlRfU1RBVEUpKVxuXG4gICAgLy8gT25seSBleGVjdXRlIGRyYXcgY29tbWFuZCBpZiBudW1iZXIgZWxlbWVudHMgaXMgPiAwXG4gICAgZHJhdygnaWYoJywgQ1VSX0NPVU5ULCAnKXsnKVxuXG4gICAgdmFyIGluc3RhbmNpbmcgPSBleHRlbnNpb25zLmFuZ2xlX2luc3RhbmNlZF9hcnJheXNcbiAgICBpZiAoaW5zdGFuY2luZykge1xuICAgICAgdmFyIENVUl9JTlNUQU5DRVMgPSBkZWYoc3RhY2tUb3AoRFJBV19TVEFURS5pbnN0YW5jZXMpKVxuICAgICAgdmFyIElOU1RBTkNFX0VYVCA9IGxpbmsoaW5zdGFuY2luZylcbiAgICAgIGRyYXcoXG4gICAgICAgICdpZignLCBDVVJfRUxFTUVOVFMsICcpeycsXG4gICAgICAgIENVUl9FTEVNRU5UUywgJy5iaW5kKCk7JyxcbiAgICAgICAgJ2lmKCcsIENVUl9JTlNUQU5DRVMsICc+MCl7JyxcbiAgICAgICAgSU5TVEFOQ0VfRVhULCAnLmRyYXdFbGVtZW50c0luc3RhbmNlZEFOR0xFKCcsXG4gICAgICAgIENVUl9QUklNSVRJVkUsICcsJyxcbiAgICAgICAgQ1VSX0NPVU5ULCAnLCcsXG4gICAgICAgIENVUl9FTEVNRU5UUywgJy50eXBlLCcsXG4gICAgICAgIENVUl9PRkZTRVQsICcsJyxcbiAgICAgICAgQ1VSX0lOU1RBTkNFUywgJyk7fWVsc2V7JyxcbiAgICAgICAgR0wsICcuZHJhd0VsZW1lbnRzKCcsXG4gICAgICAgIENVUl9QUklNSVRJVkUsICcsJyxcbiAgICAgICAgQ1VSX0NPVU5ULCAnLCcsXG4gICAgICAgIENVUl9FTEVNRU5UUywgJy50eXBlLCcsXG4gICAgICAgIENVUl9PRkZTRVQsICcpO30nLFxuICAgICAgICAnfWVsc2UgaWYoJywgQ1VSX0lOU1RBTkNFUywgJz4wKXsnLFxuICAgICAgICBJTlNUQU5DRV9FWFQsICcuZHJhd0FycmF5c0luc3RhbmNlZEFOR0xFKCcsXG4gICAgICAgIENVUl9QUklNSVRJVkUsICcsJyxcbiAgICAgICAgQ1VSX09GRlNFVCwgJywnLFxuICAgICAgICBDVVJfQ09VTlQsICcsJyxcbiAgICAgICAgQ1VSX0lOU1RBTkNFUywgJyk7fWVsc2V7JyxcbiAgICAgICAgR0wsICcuZHJhd0FycmF5cygnLFxuICAgICAgICBDVVJfUFJJTUlUSVZFLCAnLCcsXG4gICAgICAgIENVUl9PRkZTRVQsICcsJyxcbiAgICAgICAgQ1VSX0NPVU5ULCAnKTt9fScpXG4gICAgfSBlbHNlIHtcbiAgICAgIGRyYXcoXG4gICAgICAgICdpZignLCBDVVJfRUxFTUVOVFMsICcpeycsXG4gICAgICAgIEdMLCAnLmRyYXdFbGVtZW50cygnLFxuICAgICAgICBDVVJfUFJJTUlUSVZFLCAnLCcsXG4gICAgICAgIENVUl9DT1VOVCwgJywnLFxuICAgICAgICBDVVJfRUxFTUVOVFMsICcudHlwZSwnLFxuICAgICAgICBDVVJfT0ZGU0VULCAnKTt9JyxcbiAgICAgICAgJ31lbHNleycsXG4gICAgICAgIEdMLCAnLmRyYXdBcnJheXMoJyxcbiAgICAgICAgQ1VSX1BSSU1JVElWRSwgJywnLFxuICAgICAgICBDVVJfT0ZGU0VULCAnLCcsXG4gICAgICAgIENVUl9DT1VOVCwgJyk7fScpXG4gICAgfVxuXG4gICAgcmV0dXJuIGVudi5jb21waWxlKCkuZHJhd1xuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBCQVRDSCBEUkFXIE9QRVJBVElPTlxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIGNvbXBpbGVCYXRjaCAoXG4gICAgcHJvZ3JhbSwgb3B0aW9ucywgdW5pZm9ybXMsIGF0dHJpYnV0ZXMsIHN0YXRpY09wdGlvbnMpIHtcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gY29kZSBnZW5lcmF0aW9uIGhlbHBlcnNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgdmFyIGVudiA9IGNyZWF0ZUVudmlyb25tZW50KClcbiAgICB2YXIgbGluayA9IGVudi5saW5rXG4gICAgdmFyIGJhdGNoID0gZW52LnByb2MoJ2JhdGNoJylcbiAgICB2YXIgZXhpdCA9IGVudi5ibG9jaygpXG4gICAgdmFyIGRlZiA9IGJhdGNoLmRlZlxuICAgIHZhciBhcmcgPSBiYXRjaC5hcmdcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyByZWdsIHN0YXRlXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHZhciBHTCA9IGxpbmsoZ2wpXG4gICAgdmFyIFBST0dSQU0gPSBsaW5rKHByb2dyYW0ucHJvZ3JhbSlcbiAgICB2YXIgQklORF9BVFRSSUJVVEUgPSBsaW5rKGF0dHJpYnV0ZVN0YXRlLmJpbmQpXG4gICAgdmFyIEZSQU1FX1NUQVRFID0gbGluayhmcmFtZVN0YXRlKVxuICAgIHZhciBGUkFNRUJVRkZFUl9TVEFURSA9IGxpbmsoZnJhbWVidWZmZXJTdGF0ZSlcbiAgICB2YXIgRFJBV19TVEFURSA9IHtcbiAgICAgIGNvdW50OiBsaW5rKGRyYXdTdGF0ZS5jb3VudCksXG4gICAgICBvZmZzZXQ6IGxpbmsoZHJhd1N0YXRlLm9mZnNldCksXG4gICAgICBpbnN0YW5jZXM6IGxpbmsoZHJhd1N0YXRlLmluc3RhbmNlcyksXG4gICAgICBwcmltaXRpdmU6IGxpbmsoZHJhd1N0YXRlLnByaW1pdGl2ZSlcbiAgICB9XG4gICAgdmFyIENPTlRFWFRfU1RBVEUgPSB7fVxuICAgIHZhciBFTEVNRU5UUyA9IGxpbmsoZWxlbWVudFN0YXRlLmVsZW1lbnRzKVxuICAgIHZhciBDVVJfQ09VTlQgPSBkZWYoc3RhY2tUb3AoRFJBV19TVEFURS5jb3VudCkpXG4gICAgdmFyIENVUl9PRkZTRVQgPSBkZWYoc3RhY2tUb3AoRFJBV19TVEFURS5vZmZzZXQpKVxuICAgIHZhciBDVVJfUFJJTUlUSVZFID0gZGVmKHN0YWNrVG9wKERSQVdfU1RBVEUucHJpbWl0aXZlKSlcbiAgICB2YXIgQ1VSX0VMRU1FTlRTID0gZGVmKHN0YWNrVG9wKEVMRU1FTlRTKSlcbiAgICB2YXIgQ1VSX0lOU1RBTkNFU1xuICAgIHZhciBJTlNUQU5DRV9FWFRcbiAgICB2YXIgaW5zdGFuY2luZyA9IGV4dGVuc2lvbnMuYW5nbGVfaW5zdGFuY2VkX2FycmF5c1xuICAgIGlmIChpbnN0YW5jaW5nKSB7XG4gICAgICBDVVJfSU5TVEFOQ0VTID0gZGVmKHN0YWNrVG9wKERSQVdfU1RBVEUuaW5zdGFuY2VzKSlcbiAgICAgIElOU1RBTkNFX0VYVCA9IGxpbmsoaW5zdGFuY2luZylcbiAgICB9XG4gICAgdmFyIGhhc0R5bmFtaWNFbGVtZW50cyA9ICdlbGVtZW50cycgaW4gb3B0aW9uc1xuXG4gICAgZnVuY3Rpb24gbGlua0NvbnRleHQgKHgpIHtcbiAgICAgIHZhciByZXN1bHQgPSBDT05URVhUX1NUQVRFW3hdXG4gICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH1cbiAgICAgIHJlc3VsdCA9IENPTlRFWFRfU1RBVEVbeF0gPSBsaW5rKGNvbnRleHRTdGF0ZVt4XSlcbiAgICAgIHJldHVybiByZXN1bHRcbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gYmF0Y2gvYXJndW1lbnQgdmFyc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICB2YXIgTlVNX0FSR1MgPSBhcmcoKVxuICAgIHZhciBBUkdTID0gYXJnKClcbiAgICB2YXIgQVJHID0gZGVmKClcbiAgICB2YXIgQkFUQ0hfSUQgPSBkZWYoKVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGxvYWQgYSBkeW5hbWljIHZhcmlhYmxlXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHZhciBkeW5hbWljVmFycyA9IHt9XG4gICAgZnVuY3Rpb24gZHluICh4KSB7XG4gICAgICB2YXIgaWQgPSB4LmlkXG4gICAgICB2YXIgcmVzdWx0ID0gZHluYW1pY1ZhcnNbaWRdXG4gICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH1cbiAgICAgIGlmICh4LmZ1bmMpIHtcbiAgICAgICAgcmVzdWx0ID0gYmF0Y2guZGVmKFxuICAgICAgICAgIGxpbmsoeC5kYXRhKSwgJygnLCBBUkcsICcsJywgQkFUQ0hfSUQsICcsJywgRlJBTUVfU1RBVEUsICcpJylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlc3VsdCA9IGJhdGNoLmRlZihBUkcsICcuJywgeC5kYXRhKVxuICAgICAgfVxuICAgICAgZHluYW1pY1ZhcnNbaWRdID0gcmVzdWx0XG4gICAgICByZXR1cm4gcmVzdWx0XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHJldHJpZXZlcyB0aGUgZmlyc3QgbmFtZS1tYXRjaGluZyByZWNvcmQgZnJvbSBhbiBBY3RpdmVJbmZvIGxpc3RcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgZnVuY3Rpb24gZmluZEluZm8gKGxpc3QsIG5hbWUpIHtcbiAgICAgIHJldHVybiBsaXN0LmZpbmQoZnVuY3Rpb24gKGl0ZW0pIHtcbiAgICAgICAgcmV0dXJuIGl0ZW0ubmFtZSA9PT0gbmFtZVxuICAgICAgfSlcbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gYmluZCBzaGFkZXJcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgYmF0Y2goR0wsICcudXNlUHJvZ3JhbSgnLCBQUk9HUkFNLCAnKTsnKVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHNldCBzdGF0aWMgdW5pZm9ybXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgcHJvZ3JhbS51bmlmb3Jtcy5mb3JFYWNoKGZ1bmN0aW9uICh1bmlmb3JtKSB7XG4gICAgICBpZiAodW5pZm9ybS5uYW1lIGluIHVuaWZvcm1zKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgdmFyIExPQ0FUSU9OID0gbGluayh1bmlmb3JtLmxvY2F0aW9uKVxuICAgICAgdmFyIFNUQUNLID0gbGluayh1bmlmb3JtU3RhdGUuZGVmKHVuaWZvcm0ubmFtZSkpXG4gICAgICB2YXIgVE9QID0gU1RBQ0sgKyAnWycgKyBTVEFDSyArICcubGVuZ3RoLTFdJ1xuICAgICAgdmFyIHR5cGUgPSB1bmlmb3JtLmluZm8udHlwZVxuICAgICAgaWYgKHR5cGUgPT09IEdMX1NBTVBMRVJfMkQgfHwgdHlwZSA9PT0gR0xfU0FNUExFUl9DVUJFKSB7XG4gICAgICAgIHZhciBURVhfVkFMVUUgPSBkZWYoVE9QICsgJy5fdGV4dHVyZScpXG4gICAgICAgIGJhdGNoKHNldFVuaWZvcm1TdHJpbmcoR0wsIEdMX0lOVCwgTE9DQVRJT04sIFRFWF9WQUxVRSArICcuYmluZCgpJykpXG4gICAgICAgIGV4aXQoVEVYX1ZBTFVFLCAnLnVuYmluZCgpOycpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBiYXRjaChzZXRVbmlmb3JtU3RyaW5nKEdMLCB0eXBlLCBMT0NBVElPTiwgVE9QKSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHNldCBzdGF0aWMgYXR0cmlidXRlc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBwcm9ncmFtLmF0dHJpYnV0ZXMuZm9yRWFjaChmdW5jdGlvbiAoYXR0cmlidXRlKSB7XG4gICAgICBpZiAoYXR0cmlidXRlcy5uYW1lIGluIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICB2YXIgU1RBQ0sgPSBsaW5rKGF0dHJpYnV0ZVN0YXRlLmRlZihhdHRyaWJ1dGUubmFtZSkpXG4gICAgICBiYXRjaChCSU5EX0FUVFJJQlVURSwgJygnLFxuICAgICAgICBhdHRyaWJ1dGUubG9jYXRpb24sICcsJyxcbiAgICAgICAgbGluayhhdHRyaWJ1dGVTdGF0ZS5iaW5kaW5nc1thdHRyaWJ1dGUubG9jYXRpb25dKSwgJywnLFxuICAgICAgICBTVEFDSywgJywnLFxuICAgICAgICB0eXBlTGVuZ3RoKGF0dHJpYnV0ZS5pbmZvLnR5cGUpLCAnKTsnKVxuICAgIH0pXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gc2V0IHN0YXRpYyBlbGVtZW50IGJ1ZmZlclxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBpZiAoIWhhc0R5bmFtaWNFbGVtZW50cykge1xuICAgICAgYmF0Y2goXG4gICAgICAgICdpZignLCBDVVJfRUxFTUVOVFMsICcpeycsXG4gICAgICAgIEdMLCAnLmJpbmRCdWZmZXIoJywgR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIsICcsJywgQ1VSX0VMRU1FTlRTLCAnLmJ1ZmZlci5idWZmZXIpOycsXG4gICAgICAgICd9ZWxzZXsnLFxuICAgICAgICBHTCwgJy5iaW5kQnVmZmVyKCcsIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSLCAnLG51bGwpOycsXG4gICAgICAgICd9JylcbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gbG9vcCBvdmVyIGFsbCBhcmd1bWVudHNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgYmF0Y2goXG4gICAgICAnZm9yKCcsIEJBVENIX0lELCAnPTA7JywgQkFUQ0hfSUQsICc8JywgTlVNX0FSR1MsICc7KysnLCBCQVRDSF9JRCwgJyl7JyxcbiAgICAgIEFSRywgJz0nLCBBUkdTLCAnWycsIEJBVENIX0lELCAnXTsnKVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHNldCBkeW5hbWljIGZsYWdzXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIE9iamVjdC5rZXlzKG9wdGlvbnMpLnNvcnQob3B0aW9uUHJpb3JpdHkpLmZvckVhY2goZnVuY3Rpb24gKG9wdGlvbikge1xuICAgICAgdmFyIFZBTFVFID0gZHluKG9wdGlvbnNbb3B0aW9uXSlcblxuICAgICAgZnVuY3Rpb24gc2V0Q2FwIChmbGFnKSB7XG4gICAgICAgIGJhdGNoKFxuICAgICAgICAgICdpZignLCBWQUxVRSwgJyl7JyxcbiAgICAgICAgICBHTCwgJy5lbmFibGUoJywgZmxhZywgJyk7fWVsc2V7JyxcbiAgICAgICAgICBHTCwgJy5kaXNhYmxlKCcsIGZsYWcsICcpO30nKVxuICAgICAgfVxuXG4gICAgICBzd2l0Y2ggKG9wdGlvbikge1xuICAgICAgICBjYXNlICdmcmFtZWJ1ZmZlcic6XG4gICAgICAgICAgdmFyIFZJRVdQT1JUX1NUQVRFID0gbGlua0NvbnRleHQoJ3ZpZXdwb3J0JylcbiAgICAgICAgICB2YXIgU0NJU1NPUl9TVEFURSA9IGxpbmtDb250ZXh0KCdzY2lzc29yLmJveCcpXG4gICAgICAgICAgYmF0Y2goXG4gICAgICAgICAgICAnaWYoJywgRlJBTUVCVUZGRVJfU1RBVEUsICcucHVzaCgnLFxuICAgICAgICAgICAgVkFMVUUsICcmJicsIFZBTFVFLCAnLl9mcmFtZWJ1ZmZlcikpeycsXG4gICAgICAgICAgICBGUkFNRUJVRkZFUl9TVEFURSwgJy5wb2xsKCk7JyxcbiAgICAgICAgICAgIFZJRVdQT1JUX1NUQVRFLCAnLnNldERpcnR5KCk7JyxcbiAgICAgICAgICAgIFNDSVNTT1JfU1RBVEUsICcuc2V0RGlydHkoKTsnLFxuICAgICAgICAgICAgJ30nKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgLy8gQ2Fwc1xuICAgICAgICBjYXNlICdjdWxsLmVuYWJsZSc6XG4gICAgICAgICAgc2V0Q2FwKEdMX0NVTExfRkFDRSlcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlICdibGVuZC5lbmFibGUnOlxuICAgICAgICAgIHNldENhcChHTF9CTEVORClcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlICdkaXRoZXInOlxuICAgICAgICAgIHNldENhcChHTF9ESVRIRVIpXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSAnc3RlbmNpbC5lbmFibGUnOlxuICAgICAgICAgIHNldENhcChHTF9TVEVOQ0lMX1RFU1QpXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSAnZGVwdGguZW5hYmxlJzpcbiAgICAgICAgICBzZXRDYXAoR0xfREVQVEhfVEVTVClcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlICdzY2lzc29yLmVuYWJsZSc6XG4gICAgICAgICAgc2V0Q2FwKEdMX1NDSVNTT1JfVEVTVClcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlICdwb2x5Z29uT2Zmc2V0LmVuYWJsZSc6XG4gICAgICAgICAgc2V0Q2FwKEdMX1BPTFlHT05fT0ZGU0VUX0ZJTEwpXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSAnc2FtcGxlLmFscGhhJzpcbiAgICAgICAgICBzZXRDYXAoR0xfU0FNUExFX0FMUEhBX1RPX0NPVkVSQUdFKVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgJ3NhbXBsZS5lbmFibGUnOlxuICAgICAgICAgIHNldENhcChHTF9TQU1QTEVfQ09WRVJBR0UpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdkZXB0aC5tYXNrJzpcbiAgICAgICAgICBiYXRjaChHTCwgJy5kZXB0aE1hc2soJywgVkFMVUUsICcpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdkZXB0aC5mdW5jJzpcbiAgICAgICAgICB2YXIgREVQVEhfRlVOQ1MgPSBsaW5rKGNvbXBhcmVGdW5jcylcbiAgICAgICAgICBiYXRjaChHTCwgJy5kZXB0aEZ1bmMoJywgREVQVEhfRlVOQ1MsICdbJywgVkFMVUUsICddKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnZGVwdGgucmFuZ2UnOlxuICAgICAgICAgIGJhdGNoKEdMLCAnLmRlcHRoUmFuZ2UoJywgVkFMVUUsICdbMF0sJywgVkFMVUUsICdbMV0pOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdibGVuZC5jb2xvcic6XG4gICAgICAgICAgYmF0Y2goR0wsICcuYmxlbmRDb2xvcignLFxuICAgICAgICAgICAgVkFMVUUsICdbMF0sJyxcbiAgICAgICAgICAgIFZBTFVFLCAnWzFdLCcsXG4gICAgICAgICAgICBWQUxVRSwgJ1syXSwnLFxuICAgICAgICAgICAgVkFMVUUsICdbM10pOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdibGVuZC5lcXVhdGlvbic6XG4gICAgICAgICAgdmFyIEJMRU5EX0VRVUFUSU9OUyA9IGxpbmsoYmxlbmRFcXVhdGlvbnMpXG4gICAgICAgICAgYmF0Y2goXG4gICAgICAgICAgICAnaWYodHlwZW9mICcsIFZBTFVFLCAnPT09XCJzdHJpbmdcIil7JyxcbiAgICAgICAgICAgIEdMLCAnLmJsZW5kRXF1YXRpb24oJywgQkxFTkRfRVFVQVRJT05TLCAnWycsIFZBTFVFLCAnXSk7JyxcbiAgICAgICAgICAgICd9ZWxzZXsnLFxuICAgICAgICAgICAgR0wsICcuYmxlbmRFcXVhdGlvblNlcGFyYXRlKCcsXG4gICAgICAgICAgICBCTEVORF9FUVVBVElPTlMsICdbJywgVkFMVUUsICcucmdiXSwnLFxuICAgICAgICAgICAgQkxFTkRfRVFVQVRJT05TLCAnWycsIFZBTFVFLCAnLmFscGhhXSk7JyxcbiAgICAgICAgICAgICd9JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2JsZW5kLmZ1bmMnOlxuICAgICAgICAgIHZhciBCTEVORF9GVU5DUyA9IGxpbmsoYmxlbmRGdW5jcylcbiAgICAgICAgICBiYXRjaChcbiAgICAgICAgICAgIEdMLCAnLmJsZW5kRnVuY1NlcGFyYXRlKCcsXG4gICAgICAgICAgICBCTEVORF9GVU5DUyxcbiAgICAgICAgICAgICdbXCJzcmNSR0JcIiBpbiAnLCBWQUxVRSwgJz8nLCBWQUxVRSwgJy5zcmNSR0I6JywgVkFMVUUsICcuc3JjXSwnLFxuICAgICAgICAgICAgQkxFTkRfRlVOQ1MsXG4gICAgICAgICAgICAnW1wiZHN0UkdCXCIgaW4gJywgVkFMVUUsICc/JywgVkFMVUUsICcuZHN0UkdCOicsIFZBTFVFLCAnLmRzdF0sJyxcbiAgICAgICAgICAgIEJMRU5EX0ZVTkNTLFxuICAgICAgICAgICAgJ1tcInNyY0FscGhhXCIgaW4gJywgVkFMVUUsICc/JywgVkFMVUUsICcuc3JjQWxwaGE6JywgVkFMVUUsICcuc3JjXSwnLFxuICAgICAgICAgICAgQkxFTkRfRlVOQ1MsXG4gICAgICAgICAgICAnW1wiZHN0QWxwaGFcIiBpbiAnLCBWQUxVRSwgJz8nLCBWQUxVRSwgJy5kc3RBbHBoYTonLCBWQUxVRSwgJy5kc3RdKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnc3RlbmNpbC5tYXNrJzpcbiAgICAgICAgICBiYXRjaChHTCwgJy5zdGVuY2lsTWFzaygnLCBWQUxVRSwgJyk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3N0ZW5jaWwuZnVuYyc6XG4gICAgICAgICAgdmFyIFNURU5DSUxfRlVOQ1MgPSBsaW5rKGNvbXBhcmVGdW5jcylcbiAgICAgICAgICBiYXRjaChHTCwgJy5zdGVuY2lsRnVuYygnLFxuICAgICAgICAgICAgU1RFTkNJTF9GVU5DUywgJ1snLCBWQUxVRSwgJy5jbXB8fFwiYWx3YXlzXCJdLCcsXG4gICAgICAgICAgICBWQUxVRSwgJy5yZWZ8MCwnLFxuICAgICAgICAgICAgJ1wibWFza1wiIGluICcsIFZBTFVFLCAnPycsIFZBTFVFLCAnLm1hc2s6LTEpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdzdGVuY2lsLm9wRnJvbnQnOlxuICAgICAgICBjYXNlICdzdGVuY2lsLm9wQmFjayc6XG4gICAgICAgICAgdmFyIFNURU5DSUxfT1BTID0gbGluayhzdGVuY2lsT3BzKVxuICAgICAgICAgIGJhdGNoKEdMLCAnLnN0ZW5jaWxPcFNlcGFyYXRlKCcsXG4gICAgICAgICAgICBvcHRpb24gPT09ICdzdGVuY2lsLm9wRnJvbnQnID8gR0xfRlJPTlQgOiBHTF9CQUNLLCAnLCcsXG4gICAgICAgICAgICBTVEVOQ0lMX09QUywgJ1snLCBWQUxVRSwgJy5mYWlsfHxcImtlZXBcIl0sJyxcbiAgICAgICAgICAgIFNURU5DSUxfT1BTLCAnWycsIFZBTFVFLCAnLnpmYWlsfHxcImtlZXBcIl0sJyxcbiAgICAgICAgICAgIFNURU5DSUxfT1BTLCAnWycsIFZBTFVFLCAnLnBhc3N8fFwia2VlcFwiXSk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3BvbHlnb25PZmZzZXQub2Zmc2V0JzpcbiAgICAgICAgICBiYXRjaChHTCwgJy5wb2x5Z29uT2Zmc2V0KCcsXG4gICAgICAgICAgICBWQUxVRSwgJy5mYWN0b3J8fDAsJyxcbiAgICAgICAgICAgIFZBTFVFLCAnLnVuaXRzfHwwKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnY3VsbC5mYWNlJzpcbiAgICAgICAgICBiYXRjaChHTCwgJy5jdWxsRmFjZSgnLFxuICAgICAgICAgICAgVkFMVUUsICc9PT1cImZyb250XCI/JywgR0xfRlJPTlQsICc6JywgR0xfQkFDSywgJyk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2xpbmVXaWR0aCc6XG4gICAgICAgICAgYmF0Y2goR0wsICcubGluZVdpZHRoKCcsIFZBTFVFLCAnKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnZnJvbnRGYWNlJzpcbiAgICAgICAgICBiYXRjaChHTCwgJy5mcm9udEZhY2UoJyxcbiAgICAgICAgICAgIFZBTFVFLCAnPT09XCJjd1wiPycsIEdMX0NXLCAnOicsIEdMX0NDVywgJyk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2NvbG9yTWFzayc6XG4gICAgICAgICAgYmF0Y2goR0wsICcuY29sb3JNYXNrKCcsXG4gICAgICAgICAgICBWQUxVRSwgJ1swXSwnLFxuICAgICAgICAgICAgVkFMVUUsICdbMV0sJyxcbiAgICAgICAgICAgIFZBTFVFLCAnWzJdLCcsXG4gICAgICAgICAgICBWQUxVRSwgJ1szXSk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3NhbXBsZS5jb3ZlcmFnZSc6XG4gICAgICAgICAgYmF0Y2goR0wsICcuc2FtcGxlQ292ZXJhZ2UoJyxcbiAgICAgICAgICAgIFZBTFVFLCAnLnZhbHVlLCcsXG4gICAgICAgICAgICBWQUxVRSwgJy5pbnZlcnQpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdzY2lzc29yLmJveCc6XG4gICAgICAgIGNhc2UgJ3ZpZXdwb3J0JzpcbiAgICAgICAgICB2YXIgQk9YX1NUQVRFID0gbGlua0NvbnRleHQob3B0aW9uKVxuICAgICAgICAgIGJhdGNoKEJPWF9TVEFURSwgJy5wdXNoKCcsXG4gICAgICAgICAgICBWQUxVRSwgJy54fHwwLCcsXG4gICAgICAgICAgICBWQUxVRSwgJy55fHwwLCcsXG4gICAgICAgICAgICBWQUxVRSwgJy53fHwtMSwnLFxuICAgICAgICAgICAgVkFMVUUsICcuaHx8LTEpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdwcmltaXRpdmVzJzpcbiAgICAgICAgY2FzZSAnb2Zmc2V0JzpcbiAgICAgICAgY2FzZSAnY291bnQnOlxuICAgICAgICBjYXNlICdlbGVtZW50cyc6XG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIFxuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyB1cGRhdGUgdmlld3BvcnQvc2Npc3NvciBib3ggc3RhdGUgYW5kIHJlc3RvcmUgZnJhbWVidWZmZXJcbiAgICBpZiAoJ3ZpZXdwb3J0JyBpbiBvcHRpb25zIHx8ICdmcmFtZWJ1ZmZlcicgaW4gb3B0aW9ucykge1xuICAgICAgYmF0Y2gobGlua0NvbnRleHQoJ3ZpZXdwb3J0JyksICcucG9sbCgpOycpXG4gICAgfVxuICAgIGlmICgnc2Npc3Nvci5ib3gnIGluIG9wdGlvbnMgfHwgJ2ZyYW1lYnVmZmVyJyBpbiBvcHRpb25zKSB7XG4gICAgICBiYXRjaChsaW5rQ29udGV4dCgnc2Npc3Nvci5ib3gnKSwgJy5wb2xsKCk7JylcbiAgICB9XG4gICAgaWYgKCdmcmFtZWJ1ZmZlcicgaW4gb3B0aW9ucykge1xuICAgICAgYmF0Y2goRlJBTUVCVUZGRVJfU1RBVEUsICcucG9wKCk7JylcbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gc2V0IGR5bmFtaWMgdW5pZm9ybXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgdmFyIHByb2dyYW1Vbmlmb3JtcyA9IHByb2dyYW0udW5pZm9ybXNcbiAgICB2YXIgRFlOQU1JQ19URVhUVVJFUyA9IFtdXG4gICAgT2JqZWN0LmtleXModW5pZm9ybXMpLmZvckVhY2goZnVuY3Rpb24gKHVuaWZvcm0pIHtcbiAgICAgIHZhciBkYXRhID0gZmluZEluZm8ocHJvZ3JhbVVuaWZvcm1zLCB1bmlmb3JtKVxuICAgICAgaWYgKCFkYXRhKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgdmFyIFRZUEUgPSBkYXRhLmluZm8udHlwZVxuICAgICAgdmFyIExPQ0FUSU9OID0gbGluayhkYXRhLmxvY2F0aW9uKVxuICAgICAgdmFyIFZBTFVFID0gZHluKHVuaWZvcm1zW3VuaWZvcm1dKVxuICAgICAgaWYgKGRhdGEuaW5mby50eXBlID09PSBHTF9TQU1QTEVSXzJEIHx8XG4gICAgICAgICAgZGF0YS5pbmZvLnR5cGUgPT09IEdMX1NBTVBMRVJfQ1VCRSkge1xuICAgICAgICB2YXIgVEVYX1ZBTFVFID0gZGVmKFZBTFVFICsgJy5fdGV4dHVyZScpXG4gICAgICAgIERZTkFNSUNfVEVYVFVSRVMucHVzaChURVhfVkFMVUUpXG4gICAgICAgIGJhdGNoKHNldFVuaWZvcm1TdHJpbmcoR0wsIEdMX0lOVCwgTE9DQVRJT04sIFRFWF9WQUxVRSArICcuYmluZCgpJykpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBiYXRjaChzZXRVbmlmb3JtU3RyaW5nKEdMLCBUWVBFLCBMT0NBVElPTiwgVkFMVUUpKVxuICAgICAgfVxuICAgIH0pXG4gICAgRFlOQU1JQ19URVhUVVJFUy5mb3JFYWNoKGZ1bmN0aW9uIChWQUxVRSkge1xuICAgICAgYmF0Y2goVkFMVUUsICcudW5iaW5kKCk7JylcbiAgICB9KVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHNldCBkeW5hbWljIGF0dHJpYnV0ZXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgdmFyIHByb2dyYW1BdHRyaWJ1dGVzID0gcHJvZ3JhbS5hdHRyaWJ1dGVzXG4gICAgT2JqZWN0LmtleXMoYXR0cmlidXRlcykuZm9yRWFjaChmdW5jdGlvbiAoYXR0cmlidXRlKSB7XG4gICAgICB2YXIgZGF0YSA9IGZpbmRJbmZvKHByb2dyYW1BdHRyaWJ1dGVzLCBhdHRyaWJ1dGUpXG4gICAgICBpZiAoIWRhdGEpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICBiYXRjaChCSU5EX0FUVFJJQlVURSwgJygnLFxuICAgICAgICBkYXRhLmxvY2F0aW9uLCAnLCcsXG4gICAgICAgIGxpbmsoYXR0cmlidXRlLmJpbmRpbmdzW2RhdGEubG9jYXRpb25dKSwgJywnLFxuICAgICAgICBkeW4oYXR0cmlidXRlc1thdHRyaWJ1dGVdKSwgJywnLFxuICAgICAgICB0eXBlTGVuZ3RoKGRhdGEuaW5mby50eXBlKSwgJyk7JylcbiAgICB9KVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHNldCBkeW5hbWljIGF0dHJpYnV0ZXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICBpZiAob3B0aW9ucy5jb3VudCkge1xuICAgICAgYmF0Y2goQ1VSX0NPVU5ULCAnPScsIGR5bihvcHRpb25zLmNvdW50KSwgJzsnKVxuICAgIH0gZWxzZSBpZiAoIXVzZUVsZW1lbnRPcHRpb24oJ2NvdW50JykpIHtcbiAgICAgIGJhdGNoKCdpZignLCBDVVJfQ09VTlQsICcpeycpXG4gICAgfVxuICAgIGlmIChvcHRpb25zLm9mZnNldCkge1xuICAgICAgYmF0Y2goQ1VSX09GRlNFVCwgJz0nLCBkeW4ob3B0aW9ucy5vZmZzZXQpLCAnOycpXG4gICAgfVxuICAgIGlmIChvcHRpb25zLnByaW1pdGl2ZSkge1xuICAgICAgdmFyIFBSSU1fVFlQRVMgPSBsaW5rKHByaW1UeXBlcylcbiAgICAgIGJhdGNoKENVUl9QUklNSVRJVkUsICc9JywgUFJJTV9UWVBFUywgJ1snLCBkeW4ob3B0aW9ucy5wcmltaXRpdmUpLCAnXTsnKVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHVzZUVsZW1lbnRPcHRpb24gKHgpIHtcbiAgICAgIHJldHVybiBoYXNEeW5hbWljRWxlbWVudHMgJiYgISh4IGluIG9wdGlvbnMgfHwgeCBpbiBzdGF0aWNPcHRpb25zKVxuICAgIH1cbiAgICBpZiAoaGFzRHluYW1pY0VsZW1lbnRzKSB7XG4gICAgICB2YXIgZHluRWxlbWVudHMgPSBkeW4ob3B0aW9ucy5lbGVtZW50cylcbiAgICAgIGJhdGNoKENVUl9FTEVNRU5UUywgJz0nLFxuICAgICAgICBkeW5FbGVtZW50cywgJz8nLCBkeW5FbGVtZW50cywgJy5fZWxlbWVudHM6bnVsbDsnKVxuICAgIH1cbiAgICBpZiAodXNlRWxlbWVudE9wdGlvbignb2Zmc2V0JykpIHtcbiAgICAgIGJhdGNoKENVUl9PRkZTRVQsICc9MDsnKVxuICAgIH1cblxuICAgIC8vIEVtaXQgZHJhdyBjb21tYW5kXG4gICAgYmF0Y2goJ2lmKCcsIENVUl9FTEVNRU5UUywgJyl7JylcbiAgICBpZiAodXNlRWxlbWVudE9wdGlvbignY291bnQnKSkge1xuICAgICAgYmF0Y2goQ1VSX0NPVU5ULCAnPScsIENVUl9FTEVNRU5UUywgJy52ZXJ0Q291bnQ7JyxcbiAgICAgICAgJ2lmKCcsIENVUl9DT1VOVCwgJz4wKXsnKVxuICAgIH1cbiAgICBpZiAodXNlRWxlbWVudE9wdGlvbigncHJpbWl0aXZlJykpIHtcbiAgICAgIGJhdGNoKENVUl9QUklNSVRJVkUsICc9JywgQ1VSX0VMRU1FTlRTLCAnLnByaW1UeXBlOycpXG4gICAgfVxuICAgIGlmIChoYXNEeW5hbWljRWxlbWVudHMpIHtcbiAgICAgIGJhdGNoKFxuICAgICAgICBHTCxcbiAgICAgICAgJy5iaW5kQnVmZmVyKCcsXG4gICAgICAgIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSLCAnLCcsXG4gICAgICAgIENVUl9FTEVNRU5UUywgJy5idWZmZXIuYnVmZmVyKTsnKVxuICAgIH1cbiAgICBpZiAoaW5zdGFuY2luZykge1xuICAgICAgaWYgKG9wdGlvbnMuaW5zdGFuY2VzKSB7XG4gICAgICAgIGJhdGNoKENVUl9JTlNUQU5DRVMsICc9JywgZHluKG9wdGlvbnMuaW5zdGFuY2VzKSwgJzsnKVxuICAgICAgfVxuICAgICAgYmF0Y2goXG4gICAgICAgICdpZignLCBDVVJfSU5TVEFOQ0VTLCAnPjApeycsXG4gICAgICAgIElOU1RBTkNFX0VYVCwgJy5kcmF3RWxlbWVudHNJbnN0YW5jZWRBTkdMRSgnLFxuICAgICAgICBDVVJfUFJJTUlUSVZFLCAnLCcsXG4gICAgICAgIENVUl9DT1VOVCwgJywnLFxuICAgICAgICBDVVJfRUxFTUVOVFMsICcudHlwZSwnLFxuICAgICAgICBDVVJfT0ZGU0VULCAnLCcsXG4gICAgICAgIENVUl9JTlNUQU5DRVMsICcpO31lbHNleycpXG4gICAgfVxuICAgIGJhdGNoKFxuICAgICAgR0wsICcuZHJhd0VsZW1lbnRzKCcsXG4gICAgICBDVVJfUFJJTUlUSVZFLCAnLCcsXG4gICAgICBDVVJfQ09VTlQsICcsJyxcbiAgICAgIENVUl9FTEVNRU5UUywgJy50eXBlLCcsXG4gICAgICBDVVJfT0ZGU0VULCAnKTsnKVxuICAgIGlmIChpbnN0YW5jaW5nKSB7XG4gICAgICBiYXRjaCgnfScpXG4gICAgfVxuICAgIGlmICh1c2VFbGVtZW50T3B0aW9uKCdjb3VudCcpKSB7XG4gICAgICBiYXRjaCgnfScpXG4gICAgfVxuICAgIGJhdGNoKCd9ZWxzZXsnKVxuICAgIGlmICghdXNlRWxlbWVudE9wdGlvbignY291bnQnKSkge1xuICAgICAgaWYgKHVzZUVsZW1lbnRPcHRpb24oJ3ByaW1pdGl2ZScpKSB7XG4gICAgICAgIGJhdGNoKENVUl9QUklNSVRJVkUsICc9JywgR0xfVFJJQU5HTEVTLCAnOycpXG4gICAgICB9XG4gICAgICBpZiAoaW5zdGFuY2luZykge1xuICAgICAgICBiYXRjaChcbiAgICAgICAgICAnaWYoJywgQ1VSX0lOU1RBTkNFUywgJz4wKXsnLFxuICAgICAgICAgIElOU1RBTkNFX0VYVCwgJy5kcmF3QXJyYXlzSW5zdGFuY2VkQU5HTEUoJyxcbiAgICAgICAgICBDVVJfUFJJTUlUSVZFLCAnLCcsXG4gICAgICAgICAgQ1VSX09GRlNFVCwgJywnLFxuICAgICAgICAgIENVUl9DT1VOVCwgJywnLFxuICAgICAgICAgIENVUl9JTlNUQU5DRVMsICcpO31lbHNleycpXG4gICAgICB9XG4gICAgICBiYXRjaChcbiAgICAgICAgR0wsICcuZHJhd0FycmF5cygnLFxuICAgICAgICBDVVJfUFJJTUlUSVZFLCAnLCcsXG4gICAgICAgIENVUl9PRkZTRVQsICcsJyxcbiAgICAgICAgQ1VSX0NPVU5ULCAnKTt9JylcbiAgICAgIGlmIChpbnN0YW5jaW5nKSB7XG4gICAgICAgIGJhdGNoKCd9JylcbiAgICAgIH1cbiAgICB9XG4gICAgYmF0Y2goJ319JywgZXhpdClcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBjb21waWxlIGFuZCByZXR1cm5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgcmV0dXJuIGVudi5jb21waWxlKCkuYmF0Y2hcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gTUFJTiBEUkFXIENPTU1BTkRcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICBmdW5jdGlvbiBjb21waWxlQ29tbWFuZCAoXG4gICAgc3RhdGljT3B0aW9ucywgc3RhdGljVW5pZm9ybXMsIHN0YXRpY0F0dHJpYnV0ZXMsXG4gICAgZHluYW1pY09wdGlvbnMsIGR5bmFtaWNVbmlmb3JtcywgZHluYW1pY0F0dHJpYnV0ZXMsXG4gICAgaGFzRHluYW1pYykge1xuICAgIC8vIENyZWF0ZSBjb2RlIGdlbmVyYXRpb24gZW52aXJvbm1lbnRcbiAgICB2YXIgZW52ID0gY3JlYXRlRW52aXJvbm1lbnQoKVxuICAgIHZhciBsaW5rID0gZW52LmxpbmtcbiAgICB2YXIgYmxvY2sgPSBlbnYuYmxvY2tcbiAgICB2YXIgcHJvYyA9IGVudi5wcm9jXG5cbiAgICB2YXIgY2FsbElkID0gZHJhd0NhbGxDb3VudGVyKytcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBDb21tb24gc3RhdGUgdmFyaWFibGVzXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHZhciBHTF9QT0xMID0gbGluayhyZWdsUG9sbClcbiAgICB2YXIgU1RSSU5HX1NUT1JFID0gbGluayhzdHJpbmdTdG9yZSlcbiAgICB2YXIgU0hBREVSX1NUQVRFID0gbGluayhzaGFkZXJTdGF0ZSlcbiAgICB2YXIgRlJBTUVCVUZGRVJfU1RBVEUgPSBsaW5rKGZyYW1lYnVmZmVyU3RhdGUpXG4gICAgdmFyIERSQVdfU1RBVEUgPSB7XG4gICAgICBjb3VudDogbGluayhkcmF3U3RhdGUuY291bnQpLFxuICAgICAgb2Zmc2V0OiBsaW5rKGRyYXdTdGF0ZS5vZmZzZXQpLFxuICAgICAgaW5zdGFuY2VzOiBsaW5rKGRyYXdTdGF0ZS5pbnN0YW5jZXMpLFxuICAgICAgcHJpbWl0aXZlOiBsaW5rKGRyYXdTdGF0ZS5wcmltaXRpdmUpXG4gICAgfVxuICAgIHZhciBFTEVNRU5UX1NUQVRFID0gbGluayhlbGVtZW50U3RhdGUuZWxlbWVudHMpXG4gICAgdmFyIFBSSU1fVFlQRVMgPSBsaW5rKHByaW1UeXBlcylcbiAgICB2YXIgQ09NUEFSRV9GVU5DUyA9IGxpbmsoY29tcGFyZUZ1bmNzKVxuICAgIHZhciBTVEVOQ0lMX09QUyA9IGxpbmsoc3RlbmNpbE9wcylcblxuICAgIHZhciBDT05URVhUX1NUQVRFID0ge31cbiAgICBmdW5jdGlvbiBsaW5rQ29udGV4dCAoeCkge1xuICAgICAgdmFyIHJlc3VsdCA9IENPTlRFWFRfU1RBVEVbeF1cbiAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgfVxuICAgICAgcmVzdWx0ID0gQ09OVEVYVF9TVEFURVt4XSA9IGxpbmsoY29udGV4dFN0YXRlW3hdKVxuICAgICAgcmV0dXJuIHJlc3VsdFxuICAgIH1cblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBTVEFUSUMgU1RBVEVcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gQ29kZSBibG9ja3MgZm9yIHRoZSBzdGF0aWMgc2VjdGlvbnNcbiAgICB2YXIgZW50cnkgPSBibG9jaygpXG4gICAgdmFyIGV4aXQgPSBibG9jaygpXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gdXBkYXRlIGRlZmF1bHQgY29udGV4dCBzdGF0ZSB2YXJpYWJsZXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgZnVuY3Rpb24gaGFuZGxlU3RhdGljT3B0aW9uIChwYXJhbSwgdmFsdWUpIHtcbiAgICAgIHZhciBTVEFURV9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgZW50cnkoU1RBVEVfU1RBQ0ssICcucHVzaCgnLCB2YWx1ZSwgJyk7JylcbiAgICAgIGV4aXQoU1RBVEVfU1RBQ0ssICcucG9wKCk7JylcbiAgICB9XG5cbiAgICB2YXIgaGFzU2hhZGVyID0gZmFsc2VcbiAgICBPYmplY3Qua2V5cyhzdGF0aWNPcHRpb25zKS5zb3J0KG9wdGlvblByaW9yaXR5KS5mb3JFYWNoKGZ1bmN0aW9uIChwYXJhbSkge1xuICAgICAgdmFyIHZhbHVlID0gc3RhdGljT3B0aW9uc1twYXJhbV1cbiAgICAgIHN3aXRjaCAocGFyYW0pIHtcbiAgICAgICAgY2FzZSAnZnJhZyc6XG4gICAgICAgIGNhc2UgJ3ZlcnQnOlxuICAgICAgICAgIGhhc1NoYWRlciA9IHRydWVcbiAgICAgICAgICB2YXIgc2hhZGVySWQgPSBzdHJpbmdTdG9yZS5pZCh2YWx1ZSlcbiAgICAgICAgICBzaGFkZXJTdGF0ZS5zaGFkZXIoXG4gICAgICAgICAgICBwYXJhbSA9PT0gJ2ZyYWcnID8gR0xfRlJBR01FTlRfU0hBREVSIDogR0xfVkVSVEVYX1NIQURFUixcbiAgICAgICAgICAgIHNoYWRlcklkKVxuICAgICAgICAgIGVudHJ5KFNIQURFUl9TVEFURSwgJy4nLCBwYXJhbSwgJy5wdXNoKCcsIHNoYWRlcklkLCAnKTsnKVxuICAgICAgICAgIGV4aXQoU0hBREVSX1NUQVRFLCAnLicsIHBhcmFtLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdmcmFtZWJ1ZmZlcic6XG4gICAgICAgICAgdmFyIGZibyA9IGZyYW1lYnVmZmVyU3RhdGUuZ2V0RnJhbWVidWZmZXIodmFsdWUpXG4gICAgICAgICAgXG4gICAgICAgICAgdmFyIFZJRVdQT1JUX1NUQVRFID0gbGlua0NvbnRleHQoJ3ZpZXdwb3J0JylcbiAgICAgICAgICB2YXIgU0NJU1NPUl9TVEFURSA9IGxpbmtDb250ZXh0KCdzY2lzc29yLmJveCcpXG4gICAgICAgICAgZW50cnkoJ2lmKCcsIEZSQU1FQlVGRkVSX1NUQVRFLCAnLnB1c2goJywgbGluayhcbiAgICAgICAgICAgIHZhbHVlICYmIHZhbHVlLl9mcmFtZWJ1ZmZlciksICcpKXsnLFxuICAgICAgICAgICAgVklFV1BPUlRfU1RBVEUsICcuc2V0RGlydHkoKTsnLFxuICAgICAgICAgICAgU0NJU1NPUl9TVEFURSwgJy5zZXREaXJ0eSgpOycsXG4gICAgICAgICAgICAnfScpXG4gICAgICAgICAgZXhpdCgnaWYoJywgRlJBTUVCVUZGRVJfU1RBVEUsICcucG9wKCkpeycsXG4gICAgICAgICAgICBWSUVXUE9SVF9TVEFURSwgJy5zZXREaXJ0eSgpOycsXG4gICAgICAgICAgICBTQ0lTU09SX1NUQVRFLCAnLnNldERpcnR5KCk7JyxcbiAgICAgICAgICAgICd9JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIC8vIFVwZGF0ZSBkcmF3IHN0YXRlXG4gICAgICAgIGNhc2UgJ2NvdW50JzpcbiAgICAgICAgY2FzZSAnb2Zmc2V0JzpcbiAgICAgICAgY2FzZSAnaW5zdGFuY2VzJzpcbiAgICAgICAgICBcbiAgICAgICAgICBlbnRyeShEUkFXX1NUQVRFW3BhcmFtXSwgJy5wdXNoKCcsIHZhbHVlLCAnKTsnKVxuICAgICAgICAgIGV4aXQoRFJBV19TVEFURVtwYXJhbV0sICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIC8vIFVwZGF0ZSBwcmltaXRpdmUgdHlwZVxuICAgICAgICBjYXNlICdwcmltaXRpdmUnOlxuICAgICAgICAgIFxuICAgICAgICAgIHZhciBwcmltVHlwZSA9IHByaW1UeXBlc1t2YWx1ZV1cbiAgICAgICAgICBlbnRyeShEUkFXX1NUQVRFLnByaW1pdGl2ZSwgJy5wdXNoKCcsIHByaW1UeXBlLCAnKTsnKVxuICAgICAgICAgIGV4aXQoRFJBV19TVEFURS5wcmltaXRpdmUsICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIC8vIFVwZGF0ZSBlbGVtZW50IGJ1ZmZlclxuICAgICAgICBjYXNlICdlbGVtZW50cyc6XG4gICAgICAgICAgdmFyIGVsZW1lbnRzID0gZWxlbWVudFN0YXRlLmdldEVsZW1lbnRzKHZhbHVlKVxuICAgICAgICAgIHZhciBoYXNQcmltaXRpdmUgPSAhKCdwcmltaXRpdmUnIGluIHN0YXRpY09wdGlvbnMpXG4gICAgICAgICAgdmFyIGhhc0NvdW50ID0gISgnY291bnQnIGluIHN0YXRpY09wdGlvbnMpXG4gICAgICAgICAgaWYgKGVsZW1lbnRzKSB7XG4gICAgICAgICAgICB2YXIgRUxFTUVOVFMgPSBsaW5rKGVsZW1lbnRzKVxuICAgICAgICAgICAgZW50cnkoRUxFTUVOVF9TVEFURSwgJy5wdXNoKCcsIEVMRU1FTlRTLCAnKTsnKVxuICAgICAgICAgICAgaWYgKGhhc1ByaW1pdGl2ZSkge1xuICAgICAgICAgICAgICBlbnRyeShEUkFXX1NUQVRFLnByaW1pdGl2ZSwgJy5wdXNoKCcsIEVMRU1FTlRTLCAnLnByaW1UeXBlKTsnKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGhhc0NvdW50KSB7XG4gICAgICAgICAgICAgIGVudHJ5KERSQVdfU1RBVEUuY291bnQsICcucHVzaCgnLCBFTEVNRU5UUywgJy52ZXJ0Q291bnQpOycpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGVudHJ5KEVMRU1FTlRfU1RBVEUsICcucHVzaChudWxsKTsnKVxuICAgICAgICAgICAgaWYgKGhhc1ByaW1pdGl2ZSkge1xuICAgICAgICAgICAgICBlbnRyeShEUkFXX1NUQVRFLnByaW1pdGl2ZSwgJy5wdXNoKCcsIEdMX1RSSUFOR0xFUywgJyk7JylcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChoYXNDb3VudCkge1xuICAgICAgICAgICAgICBlbnRyeShEUkFXX1NUQVRFLmNvdW50LCAnLnB1c2goMCk7JylcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGhhc1ByaW1pdGl2ZSkge1xuICAgICAgICAgICAgZXhpdChEUkFXX1NUQVRFLnByaW1pdGl2ZSwgJy5wb3AoKTsnKVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoaGFzQ291bnQpIHtcbiAgICAgICAgICAgIGV4aXQoRFJBV19TVEFURS5jb3VudCwgJy5wb3AoKTsnKVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoISgnb2Zmc2V0JyBpbiBzdGF0aWNPcHRpb25zKSkge1xuICAgICAgICAgICAgZW50cnkoRFJBV19TVEFURS5vZmZzZXQsICcucHVzaCgwKTsnKVxuICAgICAgICAgICAgZXhpdChEUkFXX1NUQVRFLm9mZnNldCwgJy5wb3AoKTsnKVxuICAgICAgICAgIH1cbiAgICAgICAgICBleGl0KEVMRU1FTlRfU1RBVEUsICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2N1bGwuZW5hYmxlJzpcbiAgICAgICAgY2FzZSAnYmxlbmQuZW5hYmxlJzpcbiAgICAgICAgY2FzZSAnZGl0aGVyJzpcbiAgICAgICAgY2FzZSAnc3RlbmNpbC5lbmFibGUnOlxuICAgICAgICBjYXNlICdkZXB0aC5lbmFibGUnOlxuICAgICAgICBjYXNlICdzY2lzc29yLmVuYWJsZSc6XG4gICAgICAgIGNhc2UgJ3BvbHlnb25PZmZzZXQuZW5hYmxlJzpcbiAgICAgICAgY2FzZSAnc2FtcGxlLmFscGhhJzpcbiAgICAgICAgY2FzZSAnc2FtcGxlLmVuYWJsZSc6XG4gICAgICAgIGNhc2UgJ2RlcHRoLm1hc2snOlxuICAgICAgICAgIFxuICAgICAgICAgIGhhbmRsZVN0YXRpY09wdGlvbihwYXJhbSwgdmFsdWUpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdkZXB0aC5mdW5jJzpcbiAgICAgICAgICBcbiAgICAgICAgICBoYW5kbGVTdGF0aWNPcHRpb24ocGFyYW0sIGNvbXBhcmVGdW5jc1t2YWx1ZV0pXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdkZXB0aC5yYW5nZSc6XG4gICAgICAgICAgXG4gICAgICAgICAgdmFyIERFUFRIX1JBTkdFX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZW50cnkoREVQVEhfUkFOR0VfU1RBQ0ssICcucHVzaCgnLCB2YWx1ZVswXSwgJywnLCB2YWx1ZVsxXSwgJyk7JylcbiAgICAgICAgICBleGl0KERFUFRIX1JBTkdFX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdibGVuZC5mdW5jJzpcbiAgICAgICAgICB2YXIgQkxFTkRfRlVOQ19TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIFxuICAgICAgICAgIHZhciBzcmNSR0IgPSAoJ3NyY1JHQicgaW4gdmFsdWUgPyB2YWx1ZS5zcmNSR0IgOiB2YWx1ZS5zcmMpXG4gICAgICAgICAgdmFyIHNyY0FscGhhID0gKCdzcmNBbHBoYScgaW4gdmFsdWUgPyB2YWx1ZS5zcmNBbHBoYSA6IHZhbHVlLnNyYylcbiAgICAgICAgICB2YXIgZHN0UkdCID0gKCdkc3RSR0InIGluIHZhbHVlID8gdmFsdWUuZHN0UkdCIDogdmFsdWUuZHN0KVxuICAgICAgICAgIHZhciBkc3RBbHBoYSA9ICgnZHN0QWxwaGEnIGluIHZhbHVlID8gdmFsdWUuZHN0QWxwaGEgOiB2YWx1ZS5kc3QpXG4gICAgICAgICAgXG4gICAgICAgICAgXG4gICAgICAgICAgXG4gICAgICAgICAgXG4gICAgICAgICAgZW50cnkoQkxFTkRfRlVOQ19TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICBibGVuZEZ1bmNzW3NyY1JHQl0sICcsJyxcbiAgICAgICAgICAgIGJsZW5kRnVuY3NbZHN0UkdCXSwgJywnLFxuICAgICAgICAgICAgYmxlbmRGdW5jc1tzcmNBbHBoYV0sICcsJyxcbiAgICAgICAgICAgIGJsZW5kRnVuY3NbZHN0QWxwaGFdLCAnKTsnKVxuICAgICAgICAgIGV4aXQoQkxFTkRfRlVOQ19TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnYmxlbmQuZXF1YXRpb24nOlxuICAgICAgICAgIHZhciBCTEVORF9FUVVBVElPTl9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGVudHJ5KEJMRU5EX0VRVUFUSU9OX1NUQUNLLFxuICAgICAgICAgICAgICAnLnB1c2goJyxcbiAgICAgICAgICAgICAgYmxlbmRFcXVhdGlvbnNbdmFsdWVdLCAnLCcsXG4gICAgICAgICAgICAgIGJsZW5kRXF1YXRpb25zW3ZhbHVlXSwgJyk7JylcbiAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgXG4gICAgICAgICAgICBlbnRyeShCTEVORF9FUVVBVElPTl9TVEFDSyxcbiAgICAgICAgICAgICAgJy5wdXNoKCcsXG4gICAgICAgICAgICAgIGJsZW5kRXF1YXRpb25zW3ZhbHVlLnJnYl0sICcsJyxcbiAgICAgICAgICAgICAgYmxlbmRFcXVhdGlvbnNbdmFsdWUuYWxwaGFdLCAnKTsnKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICB9XG4gICAgICAgICAgZXhpdChCTEVORF9FUVVBVElPTl9TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnYmxlbmQuY29sb3InOlxuICAgICAgICAgIFxuICAgICAgICAgIHZhciBCTEVORF9DT0xPUl9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGVudHJ5KEJMRU5EX0NPTE9SX1NUQUNLLFxuICAgICAgICAgICAgJy5wdXNoKCcsXG4gICAgICAgICAgICB2YWx1ZVswXSwgJywnLFxuICAgICAgICAgICAgdmFsdWVbMV0sICcsJyxcbiAgICAgICAgICAgIHZhbHVlWzJdLCAnLCcsXG4gICAgICAgICAgICB2YWx1ZVszXSwgJyk7JylcbiAgICAgICAgICBleGl0KEJMRU5EX0NPTE9SX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdzdGVuY2lsLm1hc2snOlxuICAgICAgICAgIFxuICAgICAgICAgIHZhciBTVEVOQ0lMX01BU0tfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBlbnRyeShTVEVOQ0lMX01BU0tfU1RBQ0ssICcucHVzaCgnLCB2YWx1ZSwgJyk7JylcbiAgICAgICAgICBleGl0KFNURU5DSUxfTUFTS19TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnc3RlbmNpbC5mdW5jJzpcbiAgICAgICAgICBcbiAgICAgICAgICB2YXIgY21wID0gdmFsdWUuY21wIHx8ICdrZWVwJ1xuICAgICAgICAgIHZhciByZWYgPSB2YWx1ZS5yZWYgfHwgMFxuICAgICAgICAgIHZhciBtYXNrID0gJ21hc2snIGluIHZhbHVlID8gdmFsdWUubWFzayA6IC0xXG4gICAgICAgICAgXG4gICAgICAgICAgXG4gICAgICAgICAgXG4gICAgICAgICAgdmFyIFNURU5DSUxfRlVOQ19TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGVudHJ5KFNURU5DSUxfRlVOQ19TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICBjb21wYXJlRnVuY3NbY21wXSwgJywnLFxuICAgICAgICAgICAgcmVmLCAnLCcsXG4gICAgICAgICAgICBtYXNrLCAnKTsnKVxuICAgICAgICAgIGV4aXQoU1RFTkNJTF9GVU5DX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdzdGVuY2lsLm9wRnJvbnQnOlxuICAgICAgICBjYXNlICdzdGVuY2lsLm9wQmFjayc6XG4gICAgICAgICAgXG4gICAgICAgICAgdmFyIGZhaWwgPSB2YWx1ZS5mYWlsIHx8ICdrZWVwJ1xuICAgICAgICAgIHZhciB6ZmFpbCA9IHZhbHVlLnpmYWlsIHx8ICdrZWVwJ1xuICAgICAgICAgIHZhciBwYXNzID0gdmFsdWUucGFzcyB8fCAna2VlcCdcbiAgICAgICAgICBcbiAgICAgICAgICBcbiAgICAgICAgICBcbiAgICAgICAgICB2YXIgU1RFTkNJTF9PUF9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGVudHJ5KFNURU5DSUxfT1BfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgc3RlbmNpbE9wc1tmYWlsXSwgJywnLFxuICAgICAgICAgICAgc3RlbmNpbE9wc1t6ZmFpbF0sICcsJyxcbiAgICAgICAgICAgIHN0ZW5jaWxPcHNbcGFzc10sICcpOycpXG4gICAgICAgICAgZXhpdChTVEVOQ0lMX09QX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdwb2x5Z29uT2Zmc2V0Lm9mZnNldCc6XG4gICAgICAgICAgXG4gICAgICAgICAgdmFyIGZhY3RvciA9IHZhbHVlLmZhY3RvciB8fCAwXG4gICAgICAgICAgdmFyIHVuaXRzID0gdmFsdWUudW5pdHMgfHwgMFxuICAgICAgICAgIFxuICAgICAgICAgIFxuICAgICAgICAgIHZhciBQT0xZR09OX09GRlNFVF9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGVudHJ5KFBPTFlHT05fT0ZGU0VUX1NUQUNLLCAnLnB1c2goJyxcbiAgICAgICAgICAgIGZhY3RvciwgJywnLCB1bml0cywgJyk7JylcbiAgICAgICAgICBleGl0KFBPTFlHT05fT0ZGU0VUX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdjdWxsLmZhY2UnOlxuICAgICAgICAgIHZhciBmYWNlID0gMFxuICAgICAgICAgIGlmICh2YWx1ZSA9PT0gJ2Zyb250Jykge1xuICAgICAgICAgICAgZmFjZSA9IEdMX0ZST05UXG4gICAgICAgICAgfSBlbHNlIGlmICh2YWx1ZSA9PT0gJ2JhY2snKSB7XG4gICAgICAgICAgICBmYWNlID0gR0xfQkFDS1xuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICB2YXIgQ1VMTF9GQUNFX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZW50cnkoQ1VMTF9GQUNFX1NUQUNLLCAnLnB1c2goJywgZmFjZSwgJyk7JylcbiAgICAgICAgICBleGl0KENVTExfRkFDRV9TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnbGluZVdpZHRoJzpcbiAgICAgICAgICB2YXIgbGluZVdpZHRoRGltcyA9IGxpbWl0cy5saW5lV2lkdGhEaW1zXG4gICAgICAgICAgXG4gICAgICAgICAgaGFuZGxlU3RhdGljT3B0aW9uKHBhcmFtLCB2YWx1ZSlcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2Zyb250RmFjZSc6XG4gICAgICAgICAgdmFyIG9yaWVudGF0aW9uID0gMFxuICAgICAgICAgIGlmICh2YWx1ZSA9PT0gJ2N3Jykge1xuICAgICAgICAgICAgb3JpZW50YXRpb24gPSBHTF9DV1xuICAgICAgICAgIH0gZWxzZSBpZiAodmFsdWUgPT09ICdjY3cnKSB7XG4gICAgICAgICAgICBvcmllbnRhdGlvbiA9IEdMX0NDV1xuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICB2YXIgRlJPTlRfRkFDRV9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGVudHJ5KEZST05UX0ZBQ0VfU1RBQ0ssICcucHVzaCgnLCBvcmllbnRhdGlvbiwgJyk7JylcbiAgICAgICAgICBleGl0KEZST05UX0ZBQ0VfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2NvbG9yTWFzayc6XG4gICAgICAgICAgXG4gICAgICAgICAgdmFyIENPTE9SX01BU0tfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBlbnRyeShDT0xPUl9NQVNLX1NUQUNLLCAnLnB1c2goJyxcbiAgICAgICAgICAgIHZhbHVlLm1hcChmdW5jdGlvbiAodikgeyByZXR1cm4gISF2IH0pLmpvaW4oKSxcbiAgICAgICAgICAgICcpOycpXG4gICAgICAgICAgZXhpdChDT0xPUl9NQVNLX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdzYW1wbGUuY292ZXJhZ2UnOlxuICAgICAgICAgIFxuICAgICAgICAgIHZhciBzYW1wbGVWYWx1ZSA9ICd2YWx1ZScgaW4gdmFsdWUgPyB2YWx1ZS52YWx1ZSA6IDFcbiAgICAgICAgICB2YXIgc2FtcGxlSW52ZXJ0ID0gISF2YWx1ZS5pbnZlcnRcbiAgICAgICAgICBcbiAgICAgICAgICB2YXIgU0FNUExFX0NPVkVSQUdFX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZW50cnkoU0FNUExFX0NPVkVSQUdFX1NUQUNLLCAnLnB1c2goJyxcbiAgICAgICAgICAgIHNhbXBsZVZhbHVlLCAnLCcsIHNhbXBsZUludmVydCwgJyk7JylcbiAgICAgICAgICBleGl0KFNBTVBMRV9DT1ZFUkFHRV9TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAndmlld3BvcnQnOlxuICAgICAgICBjYXNlICdzY2lzc29yLmJveCc6XG4gICAgICAgICAgXG4gICAgICAgICAgdmFyIFggPSB2YWx1ZS54IHx8IDBcbiAgICAgICAgICB2YXIgWSA9IHZhbHVlLnkgfHwgMFxuICAgICAgICAgIHZhciBXID0gLTFcbiAgICAgICAgICB2YXIgSCA9IC0xXG4gICAgICAgICAgXG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKCd3JyBpbiB2YWx1ZSkge1xuICAgICAgICAgICAgVyA9IHZhbHVlLndcbiAgICAgICAgICAgIFxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoJ2gnIGluIHZhbHVlKSB7XG4gICAgICAgICAgICBIID0gdmFsdWUuaFxuICAgICAgICAgICAgXG4gICAgICAgICAgfVxuICAgICAgICAgIHZhciBCT1hfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBlbnRyeShCT1hfU1RBQ0ssICcucHVzaCgnLCBYLCAnLCcsIFksICcsJywgVywgJywnLCBILCAnKTsnKVxuICAgICAgICAgIGV4aXQoQk9YX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIC8vIFRPRE8gU2hvdWxkIHRoaXMganVzdCBiZSBhIHdhcm5pbmcgaW5zdGVhZD9cbiAgICAgICAgICBcbiAgICAgICAgICBicmVha1xuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gdXBkYXRlIHN0YXRpYyB1bmlmb3Jtc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBPYmplY3Qua2V5cyhzdGF0aWNVbmlmb3JtcykuZm9yRWFjaChmdW5jdGlvbiAodW5pZm9ybSkge1xuICAgICAgdmFyIFNUQUNLID0gbGluayh1bmlmb3JtU3RhdGUuZGVmKHVuaWZvcm0pKVxuICAgICAgdmFyIFZBTFVFXG4gICAgICB2YXIgdmFsdWUgPSBzdGF0aWNVbmlmb3Jtc1t1bmlmb3JtXVxuICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJyAmJiB2YWx1ZS5fcmVnbFR5cGUpIHtcbiAgICAgICAgVkFMVUUgPSBsaW5rKHZhbHVlKVxuICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuICAgICAgICBWQUxVRSA9IGxpbmsodmFsdWUuc2xpY2UoKSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIFZBTFVFID0gK3ZhbHVlXG4gICAgICB9XG4gICAgICBlbnRyeShTVEFDSywgJy5wdXNoKCcsIFZBTFVFLCAnKTsnKVxuICAgICAgZXhpdChTVEFDSywgJy5wb3AoKTsnKVxuICAgIH0pXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gdXBkYXRlIGRlZmF1bHQgYXR0cmlidXRlc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBPYmplY3Qua2V5cyhzdGF0aWNBdHRyaWJ1dGVzKS5mb3JFYWNoKGZ1bmN0aW9uIChhdHRyaWJ1dGUpIHtcbiAgICAgIHZhciBBVFRSSUJVVEUgPSBsaW5rKGF0dHJpYnV0ZVN0YXRlLmRlZihhdHRyaWJ1dGUpKVxuXG4gICAgICB2YXIgZGF0YSA9IHN0YXRpY0F0dHJpYnV0ZXNbYXR0cmlidXRlXVxuICAgICAgaWYgKHR5cGVvZiBkYXRhID09PSAnbnVtYmVyJykge1xuICAgICAgICBlbnRyeShBVFRSSUJVVEUsICcucHVzaFZlYygnLCArZGF0YSwgJywwLDAsMCk7JylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIFxuXG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XG4gICAgICAgICAgZW50cnkoXG4gICAgICAgICAgICBBVFRSSUJVVEUsICcucHVzaFZlYygnLFxuICAgICAgICAgICAgW2RhdGFbMF0gfHwgMCwgZGF0YVsxXSB8fCAwLCBkYXRhWzJdIHx8IDAsIGRhdGFbM10gfHwgMF0sICcpOycpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdmFyIGJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmdldEJ1ZmZlcihkYXRhKVxuICAgICAgICAgIHZhciBzaXplID0gMFxuICAgICAgICAgIHZhciBzdHJpZGUgPSAwXG4gICAgICAgICAgdmFyIG9mZnNldCA9IDBcbiAgICAgICAgICB2YXIgZGl2aXNvciA9IDBcbiAgICAgICAgICB2YXIgbm9ybWFsaXplZCA9IGZhbHNlXG4gICAgICAgICAgdmFyIHR5cGUgPSBHTF9GTE9BVFxuXG4gICAgICAgICAgaWYgKCFidWZmZXIpIHtcbiAgICAgICAgICAgIFxuXG4gICAgICAgICAgICBidWZmZXIgPSBidWZmZXJTdGF0ZS5nZXRCdWZmZXIoZGF0YS5idWZmZXIpXG4gICAgICAgICAgICBzaXplID0gZGF0YS5zaXplIHx8IDBcbiAgICAgICAgICAgIHN0cmlkZSA9IGRhdGEuc3RyaWRlIHx8IDBcbiAgICAgICAgICAgIG9mZnNldCA9IGRhdGEub2Zmc2V0IHx8IDBcbiAgICAgICAgICAgIGRpdmlzb3IgPSBkYXRhLmRpdmlzb3IgfHwgMFxuICAgICAgICAgICAgbm9ybWFsaXplZCA9IGRhdGEubm9ybWFsaXplZCB8fCBmYWxzZVxuXG4gICAgICAgICAgICBcblxuICAgICAgICAgICAgLy8gQ2hlY2sgZm9yIHVzZXIgZGVmaW5lZCB0eXBlIG92ZXJsb2FkaW5nXG4gICAgICAgICAgICB0eXBlID0gYnVmZmVyLmR0eXBlXG4gICAgICAgICAgICBpZiAoJ3R5cGUnIGluIGRhdGEpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHR5cGUgPSBnbFR5cGVzW2RhdGEudHlwZV1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdHlwZSA9IGJ1ZmZlci5kdHlwZVxuICAgICAgICAgIH1cblxuICAgICAgICAgIFxuICAgICAgICAgIFxuICAgICAgICAgIFxuICAgICAgICAgIFxuICAgICAgICAgIFxuICAgICAgICAgIFxuXG4gICAgICAgICAgZW50cnkoXG4gICAgICAgICAgICBBVFRSSUJVVEUsICcucHVzaFB0cignLCBbXG4gICAgICAgICAgICAgIGxpbmsoYnVmZmVyKSwgc2l6ZSwgb2Zmc2V0LCBzdHJpZGUsXG4gICAgICAgICAgICAgIGRpdmlzb3IsIG5vcm1hbGl6ZWQsIHR5cGVcbiAgICAgICAgICAgIF0uam9pbigpLCAnKTsnKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBleGl0KEFUVFJJQlVURSwgJy5wb3AoKTsnKVxuICAgIH0pXG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gRFlOQU1JQyBTVEFURSAoZm9yIHNjb3BlIGFuZCBkcmF3KVxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBHZW5lcmF0ZWQgY29kZSBibG9ja3MgZm9yIGR5bmFtaWMgc3RhdGUgZmxhZ3NcbiAgICB2YXIgZHluYW1pY0VudHJ5ID0gZW52LmJsb2NrKClcbiAgICB2YXIgZHluYW1pY0V4aXQgPSBlbnYuYmxvY2soKVxuXG4gICAgdmFyIEZSQU1FU1RBVEVcbiAgICB2YXIgRFlOQVJHU1xuICAgIGlmIChoYXNEeW5hbWljKSB7XG4gICAgICBGUkFNRVNUQVRFID0gbGluayhmcmFtZVN0YXRlKVxuICAgICAgRFlOQVJHUyA9IGVudHJ5LmRlZigpXG4gICAgfVxuXG4gICAgdmFyIGR5bmFtaWNWYXJzID0ge31cbiAgICBmdW5jdGlvbiBkeW4gKHgpIHtcbiAgICAgIHZhciBpZCA9IHguaWRcbiAgICAgIHZhciByZXN1bHQgPSBkeW5hbWljVmFyc1tpZF1cbiAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgfVxuICAgICAgaWYgKHguZnVuYykge1xuICAgICAgICByZXN1bHQgPSBkeW5hbWljRW50cnkuZGVmKFxuICAgICAgICAgIGxpbmsoeC5kYXRhKSwgJygnLCBEWU5BUkdTLCAnLDAsJywgRlJBTUVTVEFURSwgJyknKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzdWx0ID0gZHluYW1pY0VudHJ5LmRlZihEWU5BUkdTLCAnLicsIHguZGF0YSlcbiAgICAgIH1cbiAgICAgIGR5bmFtaWNWYXJzW2lkXSA9IHJlc3VsdFxuICAgICAgcmV0dXJuIHJlc3VsdFxuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBkeW5hbWljIGNvbnRleHQgc3RhdGUgdmFyaWFibGVzXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIE9iamVjdC5rZXlzKGR5bmFtaWNPcHRpb25zKS5zb3J0KG9wdGlvblByaW9yaXR5KS5mb3JFYWNoKGZ1bmN0aW9uIChwYXJhbSkge1xuICAgICAgLy8gTGluayBpbiBkeW5hbWljIHZhcmlhYmxlXG4gICAgICB2YXIgdmFyaWFibGUgPSBkeW4oZHluYW1pY09wdGlvbnNbcGFyYW1dKVxuXG4gICAgICBzd2l0Y2ggKHBhcmFtKSB7XG4gICAgICAgIGNhc2UgJ2ZyYW1lYnVmZmVyJzpcbiAgICAgICAgICB2YXIgVklFV1BPUlRfU1RBVEUgPSBsaW5rQ29udGV4dCgndmlld3BvcnQnKVxuICAgICAgICAgIHZhciBTQ0lTU09SX1NUQVRFID0gbGlua0NvbnRleHQoJ3NjaXNzb3IuYm94JylcbiAgICAgICAgICBkeW5hbWljRW50cnkoJ2lmKCcsXG4gICAgICAgICAgICBGUkFNRUJVRkZFUl9TVEFURSwgJy5wdXNoKCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJyYmJywgdmFyaWFibGUsICcuX2ZyYW1lYnVmZmVyKSl7JyxcbiAgICAgICAgICAgIFZJRVdQT1JUX1NUQVRFLCAnLnNldERpcnR5KCk7JyxcbiAgICAgICAgICAgIFNDSVNTT1JfU1RBVEUsICcuc2V0RGlydHkoKTsnLFxuICAgICAgICAgICAgJ30nKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KCdpZignLFxuICAgICAgICAgICAgRlJBTUVCVUZGRVJfU1RBVEUsICcucG9wKCkpeycsXG4gICAgICAgICAgICBWSUVXUE9SVF9TVEFURSwgJy5zZXREaXJ0eSgpOycsXG4gICAgICAgICAgICBTQ0lTU09SX1NUQVRFLCAnLnNldERpcnR5KCk7JyxcbiAgICAgICAgICAgICd9JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2N1bGwuZW5hYmxlJzpcbiAgICAgICAgY2FzZSAnYmxlbmQuZW5hYmxlJzpcbiAgICAgICAgY2FzZSAnZGl0aGVyJzpcbiAgICAgICAgY2FzZSAnc3RlbmNpbC5lbmFibGUnOlxuICAgICAgICBjYXNlICdkZXB0aC5lbmFibGUnOlxuICAgICAgICBjYXNlICdzY2lzc29yLmVuYWJsZSc6XG4gICAgICAgIGNhc2UgJ3BvbHlnb25PZmZzZXQuZW5hYmxlJzpcbiAgICAgICAgY2FzZSAnc2FtcGxlLmFscGhhJzpcbiAgICAgICAgY2FzZSAnc2FtcGxlLmVuYWJsZSc6XG4gICAgICAgIGNhc2UgJ2xpbmVXaWR0aCc6XG4gICAgICAgIGNhc2UgJ2RlcHRoLm1hc2snOlxuICAgICAgICAgIHZhciBTVEFURV9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGR5bmFtaWNFbnRyeShTVEFURV9TVEFDSywgJy5wdXNoKCcsIHZhcmlhYmxlLCAnKTsnKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KFNUQVRFX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICAvLyBEcmF3IGNhbGxzXG4gICAgICAgIGNhc2UgJ2NvdW50JzpcbiAgICAgICAgY2FzZSAnb2Zmc2V0JzpcbiAgICAgICAgY2FzZSAnaW5zdGFuY2VzJzpcbiAgICAgICAgICB2YXIgRFJBV19TVEFDSyA9IERSQVdfU1RBVEVbcGFyYW1dXG4gICAgICAgICAgZHluYW1pY0VudHJ5KERSQVdfU1RBQ0ssICcucHVzaCgnLCB2YXJpYWJsZSwgJyk7JylcbiAgICAgICAgICBkeW5hbWljRXhpdChEUkFXX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdwcmltaXRpdmUnOlxuICAgICAgICAgIHZhciBQUklNX1NUQUNLID0gRFJBV19TVEFURS5wcmltaXRpdmVcbiAgICAgICAgICBkeW5hbWljRW50cnkoUFJJTV9TVEFDSywgJy5wdXNoKCcsIFBSSU1fVFlQRVMsICdbJywgdmFyaWFibGUsICddKTsnKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KFBSSU1fU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2RlcHRoLmZ1bmMnOlxuICAgICAgICAgIHZhciBERVBUSF9GVU5DX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZHluYW1pY0VudHJ5KERFUFRIX0ZVTkNfU1RBQ0ssICcucHVzaCgnLCBDT01QQVJFX0ZVTkNTLCAnWycsIHZhcmlhYmxlLCAnXSk7JylcbiAgICAgICAgICBkeW5hbWljRXhpdChERVBUSF9GVU5DX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdibGVuZC5mdW5jJzpcbiAgICAgICAgICB2YXIgQkxFTkRfRlVOQ19TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIHZhciBCTEVORF9GVU5DUyA9IGxpbmsoYmxlbmRGdW5jcylcbiAgICAgICAgICBkeW5hbWljRW50cnkoXG4gICAgICAgICAgICBCTEVORF9GVU5DX1NUQUNLLCAnLnB1c2goJyxcbiAgICAgICAgICAgIEJMRU5EX0ZVTkNTLFxuICAgICAgICAgICAgJ1tcInNyY1JHQlwiIGluICcsIHZhcmlhYmxlLCAnPycsIHZhcmlhYmxlLCAnLnNyY1JHQjonLCB2YXJpYWJsZSwgJy5zcmNdLCcsXG4gICAgICAgICAgICBCTEVORF9GVU5DUyxcbiAgICAgICAgICAgICdbXCJkc3RSR0JcIiBpbiAnLCB2YXJpYWJsZSwgJz8nLCB2YXJpYWJsZSwgJy5kc3RSR0I6JywgdmFyaWFibGUsICcuZHN0XSwnLFxuICAgICAgICAgICAgQkxFTkRfRlVOQ1MsXG4gICAgICAgICAgICAnW1wic3JjQWxwaGFcIiBpbiAnLCB2YXJpYWJsZSwgJz8nLCB2YXJpYWJsZSwgJy5zcmNBbHBoYTonLCB2YXJpYWJsZSwgJy5zcmNdLCcsXG4gICAgICAgICAgICBCTEVORF9GVU5DUyxcbiAgICAgICAgICAgICdbXCJkc3RBbHBoYVwiIGluICcsIHZhcmlhYmxlLCAnPycsIHZhcmlhYmxlLCAnLmRzdEFscGhhOicsIHZhcmlhYmxlLCAnLmRzdF0pOycpXG4gICAgICAgICAgZHluYW1pY0V4aXQoQkxFTkRfRlVOQ19TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnYmxlbmQuZXF1YXRpb24nOlxuICAgICAgICAgIHZhciBCTEVORF9FUVVBVElPTl9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIHZhciBCTEVORF9FUVVBVElPTlMgPSBsaW5rKGJsZW5kRXF1YXRpb25zKVxuICAgICAgICAgIGR5bmFtaWNFbnRyeShcbiAgICAgICAgICAgICdpZih0eXBlb2YgJywgdmFyaWFibGUsICc9PT1cInN0cmluZ1wiKXsnLFxuICAgICAgICAgICAgQkxFTkRfRVFVQVRJT05fU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgQkxFTkRfRVFVQVRJT05TLCAnWycsIHZhcmlhYmxlLCAnXSwnLFxuICAgICAgICAgICAgQkxFTkRfRVFVQVRJT05TLCAnWycsIHZhcmlhYmxlLCAnXSk7JyxcbiAgICAgICAgICAgICd9ZWxzZXsnLFxuICAgICAgICAgICAgQkxFTkRfRVFVQVRJT05fU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgQkxFTkRfRVFVQVRJT05TLCAnWycsIHZhcmlhYmxlLCAnLnJnYl0sJyxcbiAgICAgICAgICAgIEJMRU5EX0VRVUFUSU9OUywgJ1snLCB2YXJpYWJsZSwgJy5hbHBoYV0pOycsXG4gICAgICAgICAgICAnfScpXG4gICAgICAgICAgZHluYW1pY0V4aXQoQkxFTkRfRVFVQVRJT05fU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2JsZW5kLmNvbG9yJzpcbiAgICAgICAgICB2YXIgQkxFTkRfQ09MT1JfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBkeW5hbWljRW50cnkoQkxFTkRfQ09MT1JfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgdmFyaWFibGUsICdbMF0sJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnWzFdLCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJ1syXSwnLFxuICAgICAgICAgICAgdmFyaWFibGUsICdbM10pOycpXG4gICAgICAgICAgZHluYW1pY0V4aXQoQkxFTkRfQ09MT1JfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3N0ZW5jaWwubWFzayc6XG4gICAgICAgICAgdmFyIFNURU5DSUxfTUFTS19TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGR5bmFtaWNFbnRyeShTVEVOQ0lMX01BU0tfU1RBQ0ssICcucHVzaCgnLCB2YXJpYWJsZSwgJyk7JylcbiAgICAgICAgICBkeW5hbWljRXhpdChTVEVOQ0lMX01BU0tfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3N0ZW5jaWwuZnVuYyc6XG4gICAgICAgICAgdmFyIFNURU5DSUxfRlVOQ19TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGR5bmFtaWNFbnRyeShTVEVOQ0lMX0ZVTkNfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgQ09NUEFSRV9GVU5DUywgJ1snLCB2YXJpYWJsZSwgJy5jbXBdLCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJy5yZWZ8MCwnLFxuICAgICAgICAgICAgJ1wibWFza1wiIGluICcsIHZhcmlhYmxlLCAnPycsIHZhcmlhYmxlLCAnLm1hc2s6LTEpOycpXG4gICAgICAgICAgZHluYW1pY0V4aXQoU1RFTkNJTF9GVU5DX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdzdGVuY2lsLm9wRnJvbnQnOlxuICAgICAgICBjYXNlICdzdGVuY2lsLm9wQmFjayc6XG4gICAgICAgICAgdmFyIFNURU5DSUxfT1BfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBkeW5hbWljRW50cnkoU1RFTkNJTF9PUF9TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICBTVEVOQ0lMX09QUywgJ1snLCB2YXJpYWJsZSwgJy5mYWlsfHxcImtlZXBcIl0sJyxcbiAgICAgICAgICAgIFNURU5DSUxfT1BTLCAnWycsIHZhcmlhYmxlLCAnLnpmYWlsfHxcImtlZXBcIl0sJyxcbiAgICAgICAgICAgIFNURU5DSUxfT1BTLCAnWycsIHZhcmlhYmxlLCAnLnBhc3N8fFwia2VlcFwiXSk7JylcbiAgICAgICAgICBkeW5hbWljRXhpdChTVEVOQ0lMX09QX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdwb2x5Z29uT2Zmc2V0Lm9mZnNldCc6XG4gICAgICAgICAgdmFyIFBPTFlHT05fT0ZGU0VUX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZHluYW1pY0VudHJ5KFBPTFlHT05fT0ZGU0VUX1NUQUNLLCAnLnB1c2goJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnLmZhY3Rvcnx8MCwnLFxuICAgICAgICAgICAgdmFyaWFibGUsICcudW5pdHN8fDApOycpXG4gICAgICAgICAgZHluYW1pY0V4aXQoUE9MWUdPTl9PRkZTRVRfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2N1bGwuZmFjZSc6XG4gICAgICAgICAgdmFyIENVTExfRkFDRV9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGR5bmFtaWNFbnRyeShDVUxMX0ZBQ0VfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgdmFyaWFibGUsICc9PT1cImZyb250XCI/JywgR0xfRlJPTlQsICc6JywgR0xfQkFDSywgJyk7JylcbiAgICAgICAgICBkeW5hbWljRXhpdChDVUxMX0ZBQ0VfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2Zyb250RmFjZSc6XG4gICAgICAgICAgdmFyIEZST05UX0ZBQ0VfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBkeW5hbWljRW50cnkoRlJPTlRfRkFDRV9TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJz09PVwiY3dcIj8nLCBHTF9DVywgJzonLCBHTF9DQ1csICcpOycpXG4gICAgICAgICAgZHluYW1pY0V4aXQoRlJPTlRfRkFDRV9TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnY29sb3JNYXNrJzpcbiAgICAgICAgICB2YXIgQ09MT1JfTUFTS19TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGR5bmFtaWNFbnRyeShDT0xPUl9NQVNLX1NUQUNLLCAnLnB1c2goJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnWzBdLCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJ1sxXSwnLFxuICAgICAgICAgICAgdmFyaWFibGUsICdbMl0sJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnWzNdKTsnKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KENPTE9SX01BU0tfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3NhbXBsZS5jb3ZlcmFnZSc6XG4gICAgICAgICAgdmFyIFNBTVBMRV9DT1ZFUkFHRV9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGR5bmFtaWNFbnRyeShTQU1QTEVfQ09WRVJBR0VfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgdmFyaWFibGUsICcudmFsdWUsJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnLmludmVydCk7JylcbiAgICAgICAgICBkeW5hbWljRXhpdChTQU1QTEVfQ09WRVJBR0VfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3NjaXNzb3IuYm94JzpcbiAgICAgICAgY2FzZSAndmlld3BvcnQnOlxuICAgICAgICAgIHZhciBCT1hfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBkeW5hbWljRW50cnkoQk9YX1NUQUNLLCAnLnB1c2goJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnLnh8fDAsJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnLnl8fDAsJyxcbiAgICAgICAgICAgICdcIndcIiBpbiAnLCB2YXJpYWJsZSwgJz8nLCB2YXJpYWJsZSwgJy53Oi0xLCcsXG4gICAgICAgICAgICAnXCJoXCIgaW4gJywgdmFyaWFibGUsICc/JywgdmFyaWFibGUsICcuaDotMSk7JylcbiAgICAgICAgICBkeW5hbWljRXhpdChCT1hfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2VsZW1lbnRzJzpcbiAgICAgICAgICB2YXIgaGFzUHJpbWl0aXZlID1cbiAgICAgICAgICAhKCdwcmltaXRpdmUnIGluIGR5bmFtaWNPcHRpb25zKSAmJlxuICAgICAgICAgICAgISgncHJpbWl0aXZlJyBpbiBzdGF0aWNPcHRpb25zKVxuICAgICAgICAgIHZhciBoYXNDb3VudCA9XG4gICAgICAgICAgISgnY291bnQnIGluIGR5bmFtaWNPcHRpb25zKSAmJlxuICAgICAgICAgICAgISgnY291bnQnIGluIHN0YXRpY09wdGlvbnMpXG4gICAgICAgICAgdmFyIGhhc09mZnNldCA9XG4gICAgICAgICAgISgnb2Zmc2V0JyBpbiBkeW5hbWljT3B0aW9ucykgJiZcbiAgICAgICAgICAgICEoJ29mZnNldCcgaW4gc3RhdGljT3B0aW9ucylcbiAgICAgICAgICB2YXIgRUxFTUVOVFMgPSBkeW5hbWljRW50cnkuZGVmKClcbiAgICAgICAgICBkeW5hbWljRW50cnkoXG4gICAgICAgICAgICAnaWYoJywgdmFyaWFibGUsICcpeycsXG4gICAgICAgICAgICBFTEVNRU5UUywgJz0nLCB2YXJpYWJsZSwgJy5fZWxlbWVudHM7JyxcbiAgICAgICAgICAgIEVMRU1FTlRfU1RBVEUsICcucHVzaCgnLCBFTEVNRU5UUywgJyk7JyxcbiAgICAgICAgICAgICFoYXNQcmltaXRpdmUgPyAnJ1xuICAgICAgICAgICAgICA6IERSQVdfU1RBVEUucHJpbWl0aXZlICsgJy5wdXNoKCcgKyBFTEVNRU5UUyArICcucHJpbVR5cGUpOycsXG4gICAgICAgICAgICAhaGFzQ291bnQgPyAnJ1xuICAgICAgICAgICAgICA6IERSQVdfU1RBVEUuY291bnQgKyAnLnB1c2goJyArIEVMRU1FTlRTICsgJy52ZXJ0Q291bnQpOycsXG4gICAgICAgICAgICAhaGFzT2Zmc2V0ID8gJydcbiAgICAgICAgICAgICAgOiBEUkFXX1NUQVRFLm9mZnNldCArICcucHVzaCgnICsgRUxFTUVOVFMgKyAnLm9mZnNldCk7JyxcbiAgICAgICAgICAgICd9ZWxzZXsnLFxuICAgICAgICAgICAgRUxFTUVOVF9TVEFURSwgJy5wdXNoKG51bGwpOycsXG4gICAgICAgICAgICAnfScpXG4gICAgICAgICAgZHluYW1pY0V4aXQoXG4gICAgICAgICAgICBFTEVNRU5UX1NUQVRFLCAnLnBvcCgpOycsXG4gICAgICAgICAgICAnaWYoJywgdmFyaWFibGUsICcpeycsXG4gICAgICAgICAgICBoYXNQcmltaXRpdmUgPyBEUkFXX1NUQVRFLnByaW1pdGl2ZSArICcucG9wKCk7JyA6ICcnLFxuICAgICAgICAgICAgaGFzQ291bnQgPyBEUkFXX1NUQVRFLmNvdW50ICsgJy5wb3AoKTsnIDogJycsXG4gICAgICAgICAgICBoYXNPZmZzZXQgPyBEUkFXX1NUQVRFLm9mZnNldCArICcucG9wKCk7JyA6ICcnLFxuICAgICAgICAgICAgJ30nKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICBcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGR5bmFtaWMgdW5pZm9ybXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgT2JqZWN0LmtleXMoZHluYW1pY1VuaWZvcm1zKS5mb3JFYWNoKGZ1bmN0aW9uICh1bmlmb3JtKSB7XG4gICAgICB2YXIgU1RBQ0sgPSBsaW5rKHVuaWZvcm1TdGF0ZS5kZWYodW5pZm9ybSkpXG4gICAgICB2YXIgVkFMVUUgPSBkeW4oZHluYW1pY1VuaWZvcm1zW3VuaWZvcm1dKVxuICAgICAgZHluYW1pY0VudHJ5KFNUQUNLLCAnLnB1c2goJywgVkFMVUUsICcpOycpXG4gICAgICBkeW5hbWljRXhpdChTVEFDSywgJy5wb3AoKTsnKVxuICAgIH0pXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gZHluYW1pYyBhdHRyaWJ1dGVzXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIE9iamVjdC5rZXlzKGR5bmFtaWNBdHRyaWJ1dGVzKS5mb3JFYWNoKGZ1bmN0aW9uIChhdHRyaWJ1dGUpIHtcbiAgICAgIHZhciBBVFRSSUJVVEUgPSBsaW5rKGF0dHJpYnV0ZVN0YXRlLmRlZihhdHRyaWJ1dGUpKVxuICAgICAgdmFyIFZBTFVFID0gZHluKGR5bmFtaWNBdHRyaWJ1dGVzW2F0dHJpYnV0ZV0pXG4gICAgICBkeW5hbWljRW50cnkoQVRUUklCVVRFLCAnLnB1c2hEeW4oJywgVkFMVUUsICcpOycpXG4gICAgICBkeW5hbWljRXhpdChBVFRSSUJVVEUsICcucG9wKCk7JylcbiAgICB9KVxuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIFNDT1BFIFBST0NFRFVSRVxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICB2YXIgc2NvcGUgPSBwcm9jKCdzY29wZScpXG4gICAgdmFyIFNDT1BFX0FSR1MgPSBzY29wZS5hcmcoKVxuICAgIHZhciBTQ09QRV9CT0RZID0gc2NvcGUuYXJnKClcbiAgICBzY29wZShlbnRyeSlcbiAgICBpZiAoaGFzRHluYW1pYykge1xuICAgICAgc2NvcGUoXG4gICAgICAgIERZTkFSR1MsICc9JywgU0NPUEVfQVJHUywgJzsnLFxuICAgICAgICBkeW5hbWljRW50cnkpXG4gICAgfVxuICAgIHNjb3BlKFxuICAgICAgU0NPUEVfQk9EWSwgJygpOycsXG4gICAgICBoYXNEeW5hbWljID8gZHluYW1pY0V4aXQgOiAnJyxcbiAgICAgIGV4aXQpXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gdXBkYXRlIHNoYWRlciBwcm9ncmFtIG9ubHkgZm9yIERSQVcgYW5kIGJhdGNoXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHZhciBjb21tb25EcmF3ID0gYmxvY2soKVxuICAgIHZhciBDVVJSRU5UX1BST0dSQU0gPSBjb21tb25EcmF3LmRlZigpXG4gICAgaWYgKHN0YXRpY09wdGlvbnMuZnJhZyAmJiBzdGF0aWNPcHRpb25zLnZlcnQpIHtcbiAgICAgIHZhciBmcmFnU3JjID0gc3RhdGljT3B0aW9ucy5mcmFnXG4gICAgICB2YXIgdmVydFNyYyA9IHN0YXRpY09wdGlvbnMudmVydFxuICAgICAgY29tbW9uRHJhdyhDVVJSRU5UX1BST0dSQU0sICc9JywgbGluayhcbiAgICAgICAgc2hhZGVyU3RhdGUucHJvZ3JhbShcbiAgICAgICAgICBzdHJpbmdTdG9yZS5pZCh2ZXJ0U3JjKSxcbiAgICAgICAgICBzdHJpbmdTdG9yZS5pZChmcmFnU3JjKSkpLCAnOycpXG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbW1vbkRyYXcoQ1VSUkVOVF9QUk9HUkFNLCAnPScsXG4gICAgICAgIFNIQURFUl9TVEFURSwgJy5wcm9ncmFtJywgJygnLFxuICAgICAgICBTSEFERVJfU1RBVEUsICcudmVydFsnLCBTSEFERVJfU1RBVEUsICcudmVydC5sZW5ndGgtMV0nLCAnLCcsXG4gICAgICAgIFNIQURFUl9TVEFURSwgJy5mcmFnWycsIFNIQURFUl9TVEFURSwgJy5mcmFnLmxlbmd0aC0xXScsICcpOycpXG4gICAgfVxuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIERSQVcgUFJPQ0VEVVJFXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIHZhciBkcmF3ID0gcHJvYygnZHJhdycpXG4gICAgZHJhdyhlbnRyeSwgY29tbW9uRHJhdylcbiAgICBpZiAoaGFzRHluYW1pYykge1xuICAgICAgZHJhdyhcbiAgICAgICAgRFlOQVJHUywgJz0nLCBkcmF3LmFyZygpLCAnOycsXG4gICAgICAgIGR5bmFtaWNFbnRyeSlcbiAgICB9XG4gICAgZHJhdyhcbiAgICAgIEdMX1BPTEwsICcoKTsnLFxuICAgICAgJ2lmKCcsIENVUlJFTlRfUFJPR1JBTSwgJyknLFxuICAgICAgQ1VSUkVOVF9QUk9HUkFNLCAnLmRyYXcoJywgaGFzRHluYW1pYyA/IERZTkFSR1MgOiAnJywgJyk7JyxcbiAgICAgIGhhc0R5bmFtaWMgPyBkeW5hbWljRXhpdCA6ICcnLFxuICAgICAgZXhpdClcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBCQVRDSCBEUkFXXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIHZhciBiYXRjaCA9IHByb2MoJ2JhdGNoJylcbiAgICBiYXRjaChlbnRyeSwgY29tbW9uRHJhdylcbiAgICB2YXIgRVhFQ19CQVRDSCA9IGxpbmsoZnVuY3Rpb24gKHByb2dyYW0sIGNvdW50LCBhcmdzKSB7XG4gICAgICB2YXIgcHJvYyA9IHByb2dyYW0uYmF0Y2hDYWNoZVtjYWxsSWRdXG4gICAgICBpZiAoIXByb2MpIHtcbiAgICAgICAgcHJvYyA9IHByb2dyYW0uYmF0Y2hDYWNoZVtjYWxsSWRdID0gY29tcGlsZUJhdGNoKFxuICAgICAgICAgIHByb2dyYW0sIGR5bmFtaWNPcHRpb25zLCBkeW5hbWljVW5pZm9ybXMsIGR5bmFtaWNBdHRyaWJ1dGVzLFxuICAgICAgICAgIHN0YXRpY09wdGlvbnMpXG4gICAgICB9XG4gICAgICByZXR1cm4gcHJvYyhjb3VudCwgYXJncylcbiAgICB9KVxuICAgIGJhdGNoKFxuICAgICAgJ2lmKCcsIENVUlJFTlRfUFJPR1JBTSwgJyl7JyxcbiAgICAgIEdMX1BPTEwsICcoKTsnLFxuICAgICAgRVhFQ19CQVRDSCwgJygnLFxuICAgICAgQ1VSUkVOVF9QUk9HUkFNLCAnLCcsXG4gICAgICBiYXRjaC5hcmcoKSwgJywnLFxuICAgICAgYmF0Y2guYXJnKCksICcpOycpXG4gICAgLy8gU2V0IGRpcnR5IG9uIGFsbCBkeW5hbWljIGZsYWdzXG4gICAgT2JqZWN0LmtleXMoZHluYW1pY09wdGlvbnMpLmZvckVhY2goZnVuY3Rpb24gKG9wdGlvbikge1xuICAgICAgdmFyIFNUQVRFID0gQ09OVEVYVF9TVEFURVtvcHRpb25dXG4gICAgICBpZiAoU1RBVEUpIHtcbiAgICAgICAgYmF0Y2goU1RBVEUsICcuc2V0RGlydHkoKTsnKVxuICAgICAgfVxuICAgIH0pXG4gICAgYmF0Y2goJ30nLCBleGl0KVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGV2YWwgYW5kIGJpbmRcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgcmV0dXJuIGVudi5jb21waWxlKClcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgZHJhdzogY29tcGlsZVNoYWRlckRyYXcsXG4gICAgY29tbWFuZDogY29tcGlsZUNvbW1hbmRcbiAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICBcIltvYmplY3QgSW50OEFycmF5XVwiOiA1MTIwXG4sIFwiW29iamVjdCBJbnQxNkFycmF5XVwiOiA1MTIyXG4sIFwiW29iamVjdCBJbnQzMkFycmF5XVwiOiA1MTI0XG4sIFwiW29iamVjdCBVaW50OEFycmF5XVwiOiA1MTIxXG4sIFwiW29iamVjdCBVaW50OENsYW1wZWRBcnJheV1cIjogNTEyMVxuLCBcIltvYmplY3QgVWludDE2QXJyYXldXCI6IDUxMjNcbiwgXCJbb2JqZWN0IFVpbnQzMkFycmF5XVwiOiA1MTI1XG4sIFwiW29iamVjdCBGbG9hdDMyQXJyYXldXCI6IDUxMjZcbiwgXCJbb2JqZWN0IEZsb2F0NjRBcnJheV1cIjogNTEyMVxuLCBcIltvYmplY3QgQXJyYXlCdWZmZXJdXCI6IDUxMjFcbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgXCJpbnQ4XCI6IDUxMjBcbiwgXCJpbnQxNlwiOiA1MTIyXG4sIFwiaW50MzJcIjogNTEyNFxuLCBcInVpbnQ4XCI6IDUxMjFcbiwgXCJ1aW50MTZcIjogNTEyM1xuLCBcInVpbnQzMlwiOiA1MTI1XG4sIFwiZmxvYXRcIjogNTEyNlxufVxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICBcInBvaW50c1wiOiAwLFxuICBcImxpbmVzXCI6IDEsXG4gIFwibGluZSBsb29wXCI6IDIsXG4gIFwibGluZSBzdHJpcFwiOiAzLFxuICBcInRyaWFuZ2xlc1wiOiA0LFxuICBcInRyaWFuZ2xlIHN0cmlwXCI6IDUsXG4gIFwidHJpYW5nbGUgZmFuXCI6IDZcbn1cbiIsIi8vIENvbnRleHQgYW5kIGNhbnZhcyBjcmVhdGlvbiBoZWxwZXIgZnVuY3Rpb25zXG4vKmdsb2JhbHMgSFRNTEVsZW1lbnQsV2ViR0xSZW5kZXJpbmdDb250ZXh0Ki9cblxuXG52YXIgZXh0ZW5kID0gcmVxdWlyZSgnLi91dGlsL2V4dGVuZCcpXG5cbmZ1bmN0aW9uIGNyZWF0ZUNhbnZhcyAoZWxlbWVudCwgb3B0aW9ucykge1xuICB2YXIgY2FudmFzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJylcbiAgdmFyIGFyZ3MgPSBnZXRDb250ZXh0KGNhbnZhcywgb3B0aW9ucylcblxuICBleHRlbmQoY2FudmFzLnN0eWxlLCB7XG4gICAgYm9yZGVyOiAwLFxuICAgIG1hcmdpbjogMCxcbiAgICBwYWRkaW5nOiAwLFxuICAgIHRvcDogMCxcbiAgICBsZWZ0OiAwXG4gIH0pXG4gIGVsZW1lbnQuYXBwZW5kQ2hpbGQoY2FudmFzKVxuXG4gIGlmIChlbGVtZW50ID09PSBkb2N1bWVudC5ib2R5KSB7XG4gICAgY2FudmFzLnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJ1xuICAgIGV4dGVuZChlbGVtZW50LnN0eWxlLCB7XG4gICAgICBtYXJnaW46IDAsXG4gICAgICBwYWRkaW5nOiAwXG4gICAgfSlcbiAgfVxuXG4gIHZhciBzY2FsZSA9ICthcmdzLm9wdGlvbnMucGl4ZWxSYXRpb1xuICBmdW5jdGlvbiByZXNpemUgKCkge1xuICAgIHZhciB3ID0gd2luZG93LmlubmVyV2lkdGhcbiAgICB2YXIgaCA9IHdpbmRvdy5pbm5lckhlaWdodFxuICAgIGlmIChlbGVtZW50ICE9PSBkb2N1bWVudC5ib2R5KSB7XG4gICAgICB2YXIgYm91bmRzID0gZWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKVxuICAgICAgdyA9IGJvdW5kcy5yaWdodCAtIGJvdW5kcy5sZWZ0XG4gICAgICBoID0gYm91bmRzLnRvcCAtIGJvdW5kcy5ib3R0b21cbiAgICB9XG4gICAgY2FudmFzLndpZHRoID0gc2NhbGUgKiB3XG4gICAgY2FudmFzLmhlaWdodCA9IHNjYWxlICogaFxuICAgIGV4dGVuZChjYW52YXMuc3R5bGUsIHtcbiAgICAgIHdpZHRoOiB3ICsgJ3B4JyxcbiAgICAgIGhlaWdodDogaCArICdweCdcbiAgICB9KVxuICB9XG5cbiAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIHJlc2l6ZSwgZmFsc2UpXG5cbiAgdmFyIHByZXZEZXN0cm95ID0gYXJncy5vcHRpb25zLm9uRGVzdHJveVxuICBhcmdzLm9wdGlvbnMgPSBleHRlbmQoZXh0ZW5kKHt9LCBhcmdzLm9wdGlvbnMpLCB7XG4gICAgb25EZXN0cm95OiBmdW5jdGlvbiAoKSB7XG4gICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigncmVzaXplJywgcmVzaXplKVxuICAgICAgZWxlbWVudC5yZW1vdmVDaGlsZChjYW52YXMpXG4gICAgICBwcmV2RGVzdHJveSAmJiBwcmV2RGVzdHJveSgpXG4gICAgfVxuICB9KVxuXG4gIHJlc2l6ZSgpXG5cbiAgcmV0dXJuIGFyZ3Ncbn1cblxuZnVuY3Rpb24gZ2V0Q29udGV4dCAoY2FudmFzLCBvcHRpb25zKSB7XG4gIHZhciBnbE9wdGlvbnMgPSBvcHRpb25zLmdsT3B0aW9ucyB8fCB7fVxuXG4gIGZ1bmN0aW9uIGdldCAobmFtZSkge1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gY2FudmFzLmdldENvbnRleHQobmFtZSwgZ2xPcHRpb25zKVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuICB9XG5cbiAgdmFyIGdsID0gZ2V0KCd3ZWJnbCcpIHx8XG4gICAgICAgICAgIGdldCgnZXhwZXJpbWVudGFsLXdlYmdsJykgfHxcbiAgICAgICAgICAgZ2V0KCd3ZWJnbC1leHBlcmltZW50YWwnKVxuXG4gIFxuXG4gIHJldHVybiB7XG4gICAgZ2w6IGdsLFxuICAgIG9wdGlvbnM6IGV4dGVuZCh7XG4gICAgICBwaXhlbFJhdGlvOiB3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpb1xuICAgIH0sIG9wdGlvbnMpXG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBwYXJzZUFyZ3MgKGFyZ3MpIHtcbiAgaWYgKHR5cGVvZiBkb2N1bWVudCA9PT0gJ3VuZGVmaW5lZCcgfHxcbiAgICAgIHR5cGVvZiBIVE1MRWxlbWVudCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICByZXR1cm4ge1xuICAgICAgZ2w6IGFyZ3NbMF0sXG4gICAgICBvcHRpb25zOiBhcmdzWzFdIHx8IHt9XG4gICAgfVxuICB9XG5cbiAgdmFyIGVsZW1lbnQgPSBkb2N1bWVudC5ib2R5XG4gIHZhciBvcHRpb25zID0gYXJnc1sxXSB8fCB7fVxuXG4gIGlmICh0eXBlb2YgYXJnc1swXSA9PT0gJ3N0cmluZycpIHtcbiAgICBlbGVtZW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihhcmdzWzBdKSB8fCBkb2N1bWVudC5ib2R5XG4gIH0gZWxzZSBpZiAodHlwZW9mIGFyZ3NbMF0gPT09ICdvYmplY3QnKSB7XG4gICAgaWYgKGFyZ3NbMF0gaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkge1xuICAgICAgZWxlbWVudCA9IGFyZ3NbMF1cbiAgICB9IGVsc2UgaWYgKGFyZ3NbMF0gaW5zdGFuY2VvZiBXZWJHTFJlbmRlcmluZ0NvbnRleHQpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGdsOiBhcmdzWzBdLFxuICAgICAgICBvcHRpb25zOiBleHRlbmQoe1xuICAgICAgICAgIHBpeGVsUmF0aW86IDFcbiAgICAgICAgfSwgb3B0aW9ucylcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgb3B0aW9ucyA9IGFyZ3NbMF1cbiAgICB9XG4gIH1cblxuICBpZiAoZWxlbWVudC5ub2RlTmFtZSAmJiBlbGVtZW50Lm5vZGVOYW1lLnRvVXBwZXJDYXNlKCkgPT09ICdDQU5WQVMnKSB7XG4gICAgcmV0dXJuIGdldENvbnRleHQoZWxlbWVudCwgb3B0aW9ucylcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gY3JlYXRlQ2FudmFzKGVsZW1lbnQsIG9wdGlvbnMpXG4gIH1cbn1cbiIsInZhciBHTF9UUklBTkdMRVMgPSA0XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcERyYXdTdGF0ZSAoZ2wpIHtcbiAgdmFyIHByaW1pdGl2ZSA9IFsgR0xfVFJJQU5HTEVTIF1cbiAgdmFyIGNvdW50ID0gWyAwIF1cbiAgdmFyIG9mZnNldCA9IFsgMCBdXG4gIHZhciBpbnN0YW5jZXMgPSBbIDAgXVxuXG4gIHJldHVybiB7XG4gICAgcHJpbWl0aXZlOiBwcmltaXRpdmUsXG4gICAgY291bnQ6IGNvdW50LFxuICAgIG9mZnNldDogb2Zmc2V0LFxuICAgIGluc3RhbmNlczogaW5zdGFuY2VzXG4gIH1cbn1cbiIsInZhciBWQVJJQUJMRV9DT1VOVEVSID0gMFxuXG5mdW5jdGlvbiBEeW5hbWljVmFyaWFibGUgKGlzRnVuYywgZGF0YSkge1xuICB0aGlzLmlkID0gKFZBUklBQkxFX0NPVU5URVIrKylcbiAgdGhpcy5mdW5jID0gaXNGdW5jXG4gIHRoaXMuZGF0YSA9IGRhdGFcbn1cblxuZnVuY3Rpb24gZGVmaW5lRHluYW1pYyAoZGF0YSwgcGF0aCkge1xuICBzd2l0Y2ggKHR5cGVvZiBkYXRhKSB7XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgcmV0dXJuIG5ldyBEeW5hbWljVmFyaWFibGUoZmFsc2UsIGRhdGEpXG4gICAgY2FzZSAnZnVuY3Rpb24nOlxuICAgICAgcmV0dXJuIG5ldyBEeW5hbWljVmFyaWFibGUodHJ1ZSwgZGF0YSlcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIGRlZmluZUR5bmFtaWNcbiAgfVxufVxuXG5mdW5jdGlvbiBpc0R5bmFtaWMgKHgpIHtcbiAgcmV0dXJuICh0eXBlb2YgeCA9PT0gJ2Z1bmN0aW9uJyAmJiAheC5fcmVnbFR5cGUpIHx8XG4gICAgICAgICB4IGluc3RhbmNlb2YgRHluYW1pY1ZhcmlhYmxlXG59XG5cbmZ1bmN0aW9uIHVuYm94ICh4LCBwYXRoKSB7XG4gIGlmICh4IGluc3RhbmNlb2YgRHluYW1pY1ZhcmlhYmxlKSB7XG4gICAgcmV0dXJuIHhcbiAgfSBlbHNlIGlmICh0eXBlb2YgeCA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgICAgICAgIHggIT09IGRlZmluZUR5bmFtaWMpIHtcbiAgICByZXR1cm4gbmV3IER5bmFtaWNWYXJpYWJsZSh0cnVlLCB4KVxuICB9XG4gIHJldHVybiBuZXcgRHluYW1pY1ZhcmlhYmxlKGZhbHNlLCBwYXRoKVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgZGVmaW5lOiBkZWZpbmVEeW5hbWljLFxuICBpc0R5bmFtaWM6IGlzRHluYW1pYyxcbiAgdW5ib3g6IHVuYm94XG59XG4iLCJcbnZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL3V0aWwvaXMtdHlwZWQtYXJyYXknKVxudmFyIGlzTkRBcnJheUxpa2UgPSByZXF1aXJlKCcuL3V0aWwvaXMtbmRhcnJheScpXG52YXIgcHJpbVR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvcHJpbWl0aXZlcy5qc29uJylcblxudmFyIEdMX1BPSU5UUyA9IDBcbnZhciBHTF9MSU5FUyA9IDFcbnZhciBHTF9UUklBTkdMRVMgPSA0XG5cbnZhciBHTF9CWVRFID0gNTEyMFxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSA1MTIxXG52YXIgR0xfU0hPUlQgPSA1MTIyXG52YXIgR0xfVU5TSUdORURfU0hPUlQgPSA1MTIzXG52YXIgR0xfSU5UID0gNTEyNFxudmFyIEdMX1VOU0lHTkVEX0lOVCA9IDUxMjVcblxudmFyIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSID0gMzQ5NjNcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwRWxlbWVudHNTdGF0ZSAoZ2wsIGV4dGVuc2lvbnMsIGJ1ZmZlclN0YXRlKSB7XG4gIHZhciBlbGVtZW50cyA9IFsgbnVsbCBdXG5cbiAgZnVuY3Rpb24gUkVHTEVsZW1lbnRCdWZmZXIgKCkge1xuICAgIHRoaXMuYnVmZmVyID0gbnVsbFxuICAgIHRoaXMucHJpbVR5cGUgPSBHTF9UUklBTkdMRVNcbiAgICB0aGlzLnZlcnRDb3VudCA9IDBcbiAgICB0aGlzLnR5cGUgPSAwXG4gIH1cblxuICBSRUdMRWxlbWVudEJ1ZmZlci5wcm90b3R5cGUuYmluZCA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmJ1ZmZlci5iaW5kKClcbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZUVsZW1lbnRzIChvcHRpb25zKSB7XG4gICAgdmFyIGVsZW1lbnRzID0gbmV3IFJFR0xFbGVtZW50QnVmZmVyKClcbiAgICB2YXIgYnVmZmVyID0gYnVmZmVyU3RhdGUuY3JlYXRlKG51bGwsIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSLCB0cnVlKVxuICAgIGVsZW1lbnRzLmJ1ZmZlciA9IGJ1ZmZlci5fYnVmZmVyXG5cbiAgICBmdW5jdGlvbiByZWdsRWxlbWVudHMgKGlucHV0KSB7XG4gICAgICB2YXIgb3B0aW9ucyA9IGlucHV0XG4gICAgICB2YXIgZXh0MzJiaXQgPSBleHRlbnNpb25zLm9lc19lbGVtZW50X2luZGV4X3VpbnRcblxuICAgICAgLy8gVXBsb2FkIGRhdGEgdG8gdmVydGV4IGJ1ZmZlclxuICAgICAgaWYgKCFvcHRpb25zKSB7XG4gICAgICAgIGJ1ZmZlcigpXG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBvcHRpb25zID09PSAnbnVtYmVyJykge1xuICAgICAgICBidWZmZXIob3B0aW9ucylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBkYXRhID0gbnVsbFxuICAgICAgICB2YXIgdXNhZ2UgPSAnc3RhdGljJ1xuICAgICAgICB2YXIgYnl0ZUxlbmd0aCA9IDBcbiAgICAgICAgaWYgKFxuICAgICAgICAgIEFycmF5LmlzQXJyYXkob3B0aW9ucykgfHxcbiAgICAgICAgICBpc1R5cGVkQXJyYXkob3B0aW9ucykgfHxcbiAgICAgICAgICBpc05EQXJyYXlMaWtlKG9wdGlvbnMpKSB7XG4gICAgICAgICAgZGF0YSA9IG9wdGlvbnNcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBcbiAgICAgICAgICBpZiAoJ2RhdGEnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGRhdGEgPSBvcHRpb25zLmRhdGFcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCd1c2FnZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgdXNhZ2UgPSBvcHRpb25zLnVzYWdlXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgnbGVuZ3RoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBieXRlTGVuZ3RoID0gb3B0aW9ucy5sZW5ndGhcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YSkgfHxcbiAgICAgICAgICAgIChpc05EQXJyYXlMaWtlKGRhdGEpICYmIGRhdGEuZHR5cGUgPT09ICdhcnJheScpIHx8XG4gICAgICAgICAgICAndHlwZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGJ1ZmZlcih7XG4gICAgICAgICAgICB0eXBlOiBvcHRpb25zLnR5cGUgfHxcbiAgICAgICAgICAgICAgKGV4dDMyYml0XG4gICAgICAgICAgICAgICAgPyAndWludDMyJ1xuICAgICAgICAgICAgICAgIDogJ3VpbnQxNicpLFxuICAgICAgICAgICAgdXNhZ2U6IHVzYWdlLFxuICAgICAgICAgICAgZGF0YTogZGF0YSxcbiAgICAgICAgICAgIGxlbmd0aDogYnl0ZUxlbmd0aFxuICAgICAgICAgIH0pXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYnVmZmVyKHtcbiAgICAgICAgICAgIHVzYWdlOiB1c2FnZSxcbiAgICAgICAgICAgIGRhdGE6IGRhdGEsXG4gICAgICAgICAgICBsZW5ndGg6IGJ5dGVMZW5ndGhcbiAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KGRhdGEpIHx8IGlzVHlwZWRBcnJheShkYXRhKSkge1xuICAgICAgICAgIGJ1ZmZlci5kaW1lbnNpb24gPSAzXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gdHJ5IHRvIGd1ZXNzIGRlZmF1bHQgcHJpbWl0aXZlIHR5cGUgYW5kIGFyZ3VtZW50c1xuICAgICAgdmFyIHZlcnRDb3VudCA9IGVsZW1lbnRzLmJ1ZmZlci5ieXRlTGVuZ3RoXG4gICAgICB2YXIgdHlwZSA9IDBcbiAgICAgIHN3aXRjaCAoZWxlbWVudHMuYnVmZmVyLmR0eXBlKSB7XG4gICAgICAgIGNhc2UgR0xfVU5TSUdORURfQllURTpcbiAgICAgICAgY2FzZSBHTF9CWVRFOlxuICAgICAgICAgIHR5cGUgPSBHTF9VTlNJR05FRF9CWVRFXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUOlxuICAgICAgICBjYXNlIEdMX1NIT1JUOlxuICAgICAgICAgIHR5cGUgPSBHTF9VTlNJR05FRF9TSE9SVFxuICAgICAgICAgIHZlcnRDb3VudCA+Pj0gMVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9JTlQ6XG4gICAgICAgIGNhc2UgR0xfSU5UOlxuICAgICAgICAgIFxuICAgICAgICAgIHR5cGUgPSBHTF9VTlNJR05FRF9JTlRcbiAgICAgICAgICB2ZXJ0Q291bnQgPj49IDJcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgXG4gICAgICB9XG5cbiAgICAgIC8vIHRyeSB0byBndWVzcyBwcmltaXRpdmUgdHlwZSBmcm9tIGNlbGwgZGltZW5zaW9uXG4gICAgICB2YXIgcHJpbVR5cGUgPSBHTF9UUklBTkdMRVNcbiAgICAgIHZhciBkaW1lbnNpb24gPSBlbGVtZW50cy5idWZmZXIuZGltZW5zaW9uXG4gICAgICBpZiAoZGltZW5zaW9uID09PSAxKSBwcmltVHlwZSA9IEdMX1BPSU5UU1xuICAgICAgaWYgKGRpbWVuc2lvbiA9PT0gMikgcHJpbVR5cGUgPSBHTF9MSU5FU1xuICAgICAgaWYgKGRpbWVuc2lvbiA9PT0gMykgcHJpbVR5cGUgPSBHTF9UUklBTkdMRVNcblxuICAgICAgLy8gaWYgbWFudWFsIG92ZXJyaWRlIHByZXNlbnQsIHVzZSB0aGF0XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbnMgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIGlmICgncHJpbWl0aXZlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgdmFyIHByaW1pdGl2ZSA9IG9wdGlvbnMucHJpbWl0aXZlXG4gICAgICAgICAgXG4gICAgICAgICAgcHJpbVR5cGUgPSBwcmltVHlwZXNbcHJpbWl0aXZlXVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdjb3VudCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHZlcnRDb3VudCA9IG9wdGlvbnMudmVydENvdW50IHwgMFxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIHVwZGF0ZSBwcm9wZXJ0aWVzIGZvciBlbGVtZW50IGJ1ZmZlclxuICAgICAgZWxlbWVudHMucHJpbVR5cGUgPSBwcmltVHlwZVxuICAgICAgZWxlbWVudHMudmVydENvdW50ID0gdmVydENvdW50XG4gICAgICBlbGVtZW50cy50eXBlID0gdHlwZVxuXG4gICAgICByZXR1cm4gcmVnbEVsZW1lbnRzXG4gICAgfVxuXG4gICAgcmVnbEVsZW1lbnRzKG9wdGlvbnMpXG5cbiAgICByZWdsRWxlbWVudHMuX3JlZ2xUeXBlID0gJ2VsZW1lbnRzJ1xuICAgIHJlZ2xFbGVtZW50cy5fZWxlbWVudHMgPSBlbGVtZW50c1xuICAgIHJlZ2xFbGVtZW50cy5kZXN0cm95ID0gZnVuY3Rpb24gKCkge1xuICAgICAgXG4gICAgICBidWZmZXIuZGVzdHJveSgpXG4gICAgICBlbGVtZW50cy5idWZmZXIgPSBudWxsXG4gICAgfVxuXG4gICAgcmV0dXJuIHJlZ2xFbGVtZW50c1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjcmVhdGU6IGNyZWF0ZUVsZW1lbnRzLFxuICAgIGVsZW1lbnRzOiBlbGVtZW50cyxcbiAgICBnZXRFbGVtZW50czogZnVuY3Rpb24gKGVsZW1lbnRzKSB7XG4gICAgICBpZiAoZWxlbWVudHMgJiYgZWxlbWVudHMuX2VsZW1lbnRzIGluc3RhbmNlb2YgUkVHTEVsZW1lbnRCdWZmZXIpIHtcbiAgICAgICAgcmV0dXJuIGVsZW1lbnRzLl9lbGVtZW50c1xuICAgICAgfVxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY3JlYXRlRXh0ZW5zaW9uQ2FjaGUgKGdsKSB7XG4gIHZhciBleHRlbnNpb25zID0ge31cblxuICBmdW5jdGlvbiByZWZyZXNoRXh0ZW5zaW9ucyAoKSB7XG4gICAgW1xuICAgICAgJ29lc190ZXh0dXJlX2Zsb2F0JyxcbiAgICAgICdvZXNfdGV4dHVyZV9mbG9hdF9saW5lYXInLFxuICAgICAgJ29lc190ZXh0dXJlX2hhbGZfZmxvYXQnLFxuICAgICAgJ29lc190ZXh0dXJlX2hhbGZfZmxvYXRfbGluZWFyJyxcbiAgICAgICdvZXNfc3RhbmRhcmRfZGVyaXZhdGl2ZXMnLFxuICAgICAgJ29lc19lbGVtZW50X2luZGV4X3VpbnQnLFxuICAgICAgJ29lc19mYm9fcmVuZGVyX21pcG1hcCcsXG5cbiAgICAgICd3ZWJnbF9kZXB0aF90ZXh0dXJlJyxcbiAgICAgICd3ZWJnbF9kcmF3X2J1ZmZlcnMnLFxuICAgICAgJ3dlYmdsX2NvbG9yX2J1ZmZlcl9mbG9hdCcsXG5cbiAgICAgICdleHRfdGV4dHVyZV9maWx0ZXJfYW5pc290cm9waWMnLFxuICAgICAgJ2V4dF9mcmFnX2RlcHRoJyxcbiAgICAgICdleHRfYmxlbmRfbWlubWF4JyxcbiAgICAgICdleHRfc2hhZGVyX3RleHR1cmVfbG9kJyxcbiAgICAgICdleHRfY29sb3JfYnVmZmVyX2hhbGZfZmxvYXQnLFxuICAgICAgJ2V4dF9zcmdiJyxcblxuICAgICAgJ2FuZ2xlX2luc3RhbmNlZF9hcnJheXMnLFxuXG4gICAgICAnd2ViZ2xfY29tcHJlc3NlZF90ZXh0dXJlX3MzdGMnLFxuICAgICAgJ3dlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9hdGMnLFxuICAgICAgJ3dlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9wdnJ0YycsXG4gICAgICAnd2ViZ2xfY29tcHJlc3NlZF90ZXh0dXJlX2V0YzEnXG4gICAgXS5mb3JFYWNoKGZ1bmN0aW9uIChleHQpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGV4dGVuc2lvbnNbZXh0XSA9IGdsLmdldEV4dGVuc2lvbihleHQpXG4gICAgICB9IGNhdGNoIChlKSB7fVxuICAgIH0pXG4gIH1cblxuICByZWZyZXNoRXh0ZW5zaW9ucygpXG5cbiAgcmV0dXJuIHtcbiAgICBleHRlbnNpb25zOiBleHRlbnNpb25zLFxuICAgIHJlZnJlc2g6IHJlZnJlc2hFeHRlbnNpb25zXG4gIH1cbn1cbiIsIlxudmFyIHZhbHVlcyA9IHJlcXVpcmUoJy4vdXRpbC92YWx1ZXMnKVxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vdXRpbC9leHRlbmQnKVxuXG4vLyBXZSBzdG9yZSB0aGVzZSBjb25zdGFudHMgc28gdGhhdCB0aGUgbWluaWZpZXIgY2FuIGlubGluZSB0aGVtXG52YXIgR0xfRlJBTUVCVUZGRVIgPSAweDhENDBcbnZhciBHTF9SRU5ERVJCVUZGRVIgPSAweDhENDFcblxudmFyIEdMX1RFWFRVUkVfMkQgPSAweDBERTFcbnZhciBHTF9URVhUVVJFX0NVQkVfTUFQID0gMHg4NTEzXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YID0gMHg4NTE1XG5cbnZhciBHTF9DT0xPUl9BVFRBQ0hNRU5UMCA9IDB4OENFMFxudmFyIEdMX0RFUFRIX0FUVEFDSE1FTlQgPSAweDhEMDBcbnZhciBHTF9TVEVOQ0lMX0FUVEFDSE1FTlQgPSAweDhEMjBcbnZhciBHTF9ERVBUSF9TVEVOQ0lMX0FUVEFDSE1FTlQgPSAweDgyMUFcblxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSAweDE0MDFcbnZhciBHTF9GTE9BVCA9IDB4MTQwNlxuXG52YXIgR0xfSEFMRl9GTE9BVF9PRVMgPSAweDhENjFcblxudmFyIEdMX0FMUEhBID0gMHgxOTA2XG52YXIgR0xfTFVNSU5BTkNFID0gMHgxOTA5XG52YXIgR0xfTFVNSU5BTkNFX0FMUEhBID0gMHgxOTBBXG52YXIgR0xfUkdCID0gMHgxOTA3XG52YXIgR0xfUkdCQSA9IDB4MTkwOFxuXG52YXIgR0xfUkdCQTQgPSAweDgwNTZcbnZhciBHTF9SR0I1X0ExID0gMHg4MDU3XG52YXIgR0xfUkdCNTY1ID0gMHg4RDYyXG52YXIgR0xfREVQVEhfQ09NUE9ORU5UMTYgPSAweDgxQTVcbnZhciBHTF9TVEVOQ0lMX0lOREVYOCA9IDB4OEQ0OFxuXG52YXIgR0xfREVQVEhfQ09NUE9ORU5UID0gMHgxOTAyXG52YXIgR0xfREVQVEhfU1RFTkNJTCA9IDB4ODRGOVxuXG52YXIgR0xfU1JHQjhfQUxQSEE4X0VYVCA9IDB4OEM0M1xuXG52YXIgR0xfUkdCQTMyRl9FWFQgPSAweDg4MTRcblxudmFyIEdMX1JHQkExNkZfRVhUID0gMHg4ODFBXG52YXIgR0xfUkdCMTZGX0VYVCA9IDB4ODgxQlxuXG52YXIgR0xfRlJBTUVCVUZGRVJfQ09NUExFVEUgPSAweDhDRDVcbnZhciBHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX0FUVEFDSE1FTlQgPSAweDhDRDZcbnZhciBHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX01JU1NJTkdfQVRUQUNITUVOVCA9IDB4OENEN1xudmFyIEdMX0ZSQU1FQlVGRkVSX0lOQ09NUExFVEVfRElNRU5TSU9OUyA9IDB4OENEOVxudmFyIEdMX0ZSQU1FQlVGRkVSX1VOU1VQUE9SVEVEID0gMHg4Q0REXG5cbnZhciBHTF9CQUNLID0gMTAyOVxuXG52YXIgQkFDS19CVUZGRVIgPSBbR0xfQkFDS11cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwRkJPU3RhdGUgKFxuICBnbCxcbiAgZXh0ZW5zaW9ucyxcbiAgbGltaXRzLFxuICB0ZXh0dXJlU3RhdGUsXG4gIHJlbmRlcmJ1ZmZlclN0YXRlKSB7XG4gIHZhciBzdGF0dXNDb2RlID0ge31cbiAgc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9DT01QTEVURV0gPSAnY29tcGxldGUnXG4gIHN0YXR1c0NvZGVbR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9BVFRBQ0hNRU5UXSA9ICdpbmNvbXBsZXRlIGF0dGFjaG1lbnQnXG4gIHN0YXR1c0NvZGVbR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9ESU1FTlNJT05TXSA9ICdpbmNvbXBsZXRlIGRpbWVuc2lvbnMnXG4gIHN0YXR1c0NvZGVbR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9NSVNTSU5HX0FUVEFDSE1FTlRdID0gJ2luY29tcGxldGUsIG1pc3NpbmcgYXR0YWNobWVudCdcbiAgc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9VTlNVUFBPUlRFRF0gPSAndW5zdXBwb3J0ZWQnXG5cbiAgdmFyIGNvbG9yVGV4dHVyZUZvcm1hdHMgPSB7XG4gICAgJ3JnYmEnOiBHTF9SR0JBXG4gIH1cblxuICB2YXIgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzID0ge1xuICAgICdyZ2JhNCc6IEdMX1JHQkE0LFxuICAgICdyZ2I1NjUnOiBHTF9SR0I1NjUsXG4gICAgJ3JnYjUgYTEnOiBHTF9SR0I1X0ExXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5leHRfc3JnYikge1xuICAgIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0c1snc3JnYmEnXSA9IEdMX1NSR0I4X0FMUEhBOF9FWFRcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLmV4dF9jb2xvcl9idWZmZXJfaGFsZl9mbG9hdCkge1xuICAgIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0c1sncmdiYTE2ZiddID0gR0xfUkdCQTE2Rl9FWFRcbiAgICBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHNbJ3JnYjE2ZiddID0gR0xfUkdCMTZGX0VYVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29sb3JfYnVmZmVyX2Zsb2F0KSB7XG4gICAgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzWydyZ2JhMzJmJ10gPSBHTF9SR0JBMzJGX0VYVFxuICB9XG5cbiAgdmFyIGRlcHRoUmVuZGVyYnVmZmVyRm9ybWF0RW51bXMgPSBbR0xfREVQVEhfQ09NUE9ORU5UMTZdXG4gIHZhciBzdGVuY2lsUmVuZGVyYnVmZmVyRm9ybWF0RW51bXMgPSBbR0xfU1RFTkNJTF9JTkRFWDhdXG4gIHZhciBkZXB0aFN0ZW5jaWxSZW5kZXJidWZmZXJGb3JtYXRFbnVtcyA9IFtHTF9ERVBUSF9TVEVOQ0lMXVxuXG4gIHZhciBkZXB0aFRleHR1cmVGb3JtYXRFbnVtcyA9IFtdXG4gIHZhciBzdGVuY2lsVGV4dHVyZUZvcm1hdEVudW1zID0gW11cbiAgdmFyIGRlcHRoU3RlbmNpbFRleHR1cmVGb3JtYXRFbnVtcyA9IFtdXG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfZGVwdGhfdGV4dHVyZSkge1xuICAgIGRlcHRoVGV4dHVyZUZvcm1hdEVudW1zLnB1c2goR0xfREVQVEhfQ09NUE9ORU5UKVxuICAgIGRlcHRoU3RlbmNpbFRleHR1cmVGb3JtYXRFbnVtcy5wdXNoKEdMX0RFUFRIX1NURU5DSUwpXG4gIH1cblxuICB2YXIgY29sb3JGb3JtYXRzID0gZXh0ZW5kKGV4dGVuZCh7fSxcbiAgICBjb2xvclRleHR1cmVGb3JtYXRzKSxcbiAgICBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHMpXG5cbiAgdmFyIGNvbG9yVGV4dHVyZUZvcm1hdEVudW1zID0gdmFsdWVzKGNvbG9yVGV4dHVyZUZvcm1hdHMpXG4gIHZhciBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdEVudW1zID0gdmFsdWVzKGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0cylcblxuICB2YXIgaGlnaGVzdFByZWNpc2lvbiA9IEdMX1VOU0lHTkVEX0JZVEVcbiAgdmFyIGNvbG9yVHlwZXMgPSB7XG4gICAgJ3VpbnQ4JzogR0xfVU5TSUdORURfQllURVxuICB9XG4gIGlmIChleHRlbnNpb25zLm9lc190ZXh0dXJlX2hhbGZfZmxvYXQpIHtcbiAgICBoaWdoZXN0UHJlY2lzaW9uID0gY29sb3JUeXBlc1snaGFsZiBmbG9hdCddID0gR0xfSEFMRl9GTE9BVF9PRVNcbiAgfVxuICBpZiAoZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9mbG9hdCkge1xuICAgIGhpZ2hlc3RQcmVjaXNpb24gPSBjb2xvclR5cGVzLmZsb2F0ID0gR0xfRkxPQVRcbiAgfVxuICBjb2xvclR5cGVzLmJlc3QgPSBoaWdoZXN0UHJlY2lzaW9uXG5cbiAgdmFyIERSQVdfQlVGRkVSUyA9IChmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHJlc3VsdCA9IG5ldyBBcnJheShsaW1pdHMubWF4RHJhd2J1ZmZlcnMpXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPD0gbGltaXRzLm1heERyYXdidWZmZXJzOyArK2kpIHtcbiAgICAgIHZhciByb3cgPSByZXN1bHRbaV0gPSBuZXcgQXJyYXkoaSlcbiAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgaTsgKytqKSB7XG4gICAgICAgIHJvd1tqXSA9IEdMX0NPTE9SX0FUVEFDSE1FTlQwICsgalxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0XG4gIH0pKClcblxuICBmdW5jdGlvbiBGcmFtZWJ1ZmZlckF0dGFjaG1lbnQgKHRhcmdldCwgbGV2ZWwsIHRleHR1cmUsIHJlbmRlcmJ1ZmZlcikge1xuICAgIHRoaXMudGFyZ2V0ID0gdGFyZ2V0XG4gICAgdGhpcy5sZXZlbCA9IGxldmVsXG4gICAgdGhpcy50ZXh0dXJlID0gdGV4dHVyZVxuICAgIHRoaXMucmVuZGVyYnVmZmVyID0gcmVuZGVyYnVmZmVyXG4gIH1cblxuICBmdW5jdGlvbiBkZWNSZWYgKGF0dGFjaG1lbnQpIHtcbiAgICBpZiAoYXR0YWNobWVudCkge1xuICAgICAgaWYgKGF0dGFjaG1lbnQudGV4dHVyZSkge1xuICAgICAgICBhdHRhY2htZW50LnRleHR1cmUuX3RleHR1cmUuZGVjUmVmKClcbiAgICAgIH1cbiAgICAgIGlmIChhdHRhY2htZW50LnJlbmRlcmJ1ZmZlcikge1xuICAgICAgICBhdHRhY2htZW50LnJlbmRlcmJ1ZmZlci5fcmVuZGVyYnVmZmVyLmRlY1JlZigpXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gY2hlY2tGb3JtYXQgKGF0dGFjaG1lbnQsIHRleEZvcm1hdHMsIHJiRm9ybWF0cykge1xuICAgIGlmIChhdHRhY2htZW50LnRleHR1cmUpIHtcbiAgICAgIFxuICAgIH0gZWxzZSB7XG4gICAgICBcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBpbmNSZWZBbmRDaGVja1NoYXBlIChhdHRhY2htZW50LCBmcmFtZWJ1ZmZlcikge1xuICAgIHZhciB3aWR0aCA9IGZyYW1lYnVmZmVyLndpZHRoXG4gICAgdmFyIGhlaWdodCA9IGZyYW1lYnVmZmVyLmhlaWdodFxuICAgIGlmIChhdHRhY2htZW50LnRleHR1cmUpIHtcbiAgICAgIHZhciB0ZXh0dXJlID0gYXR0YWNobWVudC50ZXh0dXJlLl90ZXh0dXJlXG4gICAgICB2YXIgdHcgPSBNYXRoLm1heCgxLCB0ZXh0dXJlLnBhcmFtcy53aWR0aCA+PiBhdHRhY2htZW50LmxldmVsKVxuICAgICAgdmFyIHRoID0gTWF0aC5tYXgoMSwgdGV4dHVyZS5wYXJhbXMuaGVpZ2h0ID4+IGF0dGFjaG1lbnQubGV2ZWwpXG4gICAgICB3aWR0aCA9IHdpZHRoIHx8IHR3XG4gICAgICBoZWlnaHQgPSBoZWlnaHQgfHwgdGhcbiAgICAgIFxuICAgICAgXG4gICAgICB0ZXh0dXJlLnJlZkNvdW50ICs9IDFcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIHJlbmRlcmJ1ZmZlciA9IGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXJcbiAgICAgIHdpZHRoID0gd2lkdGggfHwgcmVuZGVyYnVmZmVyLndpZHRoXG4gICAgICBoZWlnaHQgPSBoZWlnaHQgfHwgcmVuZGVyYnVmZmVyLmhlaWdodFxuICAgICAgXG4gICAgICBcbiAgICAgIHJlbmRlcmJ1ZmZlci5yZWZDb3VudCArPSAxXG4gICAgfVxuICAgIGZyYW1lYnVmZmVyLndpZHRoID0gd2lkdGhcbiAgICBmcmFtZWJ1ZmZlci5oZWlnaHQgPSBoZWlnaHRcbiAgfVxuXG4gIGZ1bmN0aW9uIGF0dGFjaCAobG9jYXRpb24sIGF0dGFjaG1lbnQpIHtcbiAgICBpZiAoYXR0YWNobWVudCkge1xuICAgICAgaWYgKGF0dGFjaG1lbnQudGV4dHVyZSkge1xuICAgICAgICBnbC5mcmFtZWJ1ZmZlclRleHR1cmUyRChcbiAgICAgICAgICBHTF9GUkFNRUJVRkZFUixcbiAgICAgICAgICBsb2NhdGlvbixcbiAgICAgICAgICBhdHRhY2htZW50LnRhcmdldCxcbiAgICAgICAgICBhdHRhY2htZW50LnRleHR1cmUuX3RleHR1cmUudGV4dHVyZSxcbiAgICAgICAgICBhdHRhY2htZW50LmxldmVsKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZ2wuZnJhbWVidWZmZXJSZW5kZXJidWZmZXIoXG4gICAgICAgICAgR0xfRlJBTUVCVUZGRVIsXG4gICAgICAgICAgbG9jYXRpb24sXG4gICAgICAgICAgR0xfUkVOREVSQlVGRkVSLFxuICAgICAgICAgIGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXIucmVuZGVyYnVmZmVyKVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBnbC5mcmFtZWJ1ZmZlclRleHR1cmUyRChcbiAgICAgICAgR0xfRlJBTUVCVUZGRVIsXG4gICAgICAgIGxvY2F0aW9uLFxuICAgICAgICBHTF9URVhUVVJFXzJELFxuICAgICAgICBudWxsLFxuICAgICAgICAwKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHRyeVVwZGF0ZUF0dGFjaG1lbnQgKFxuICAgIGF0dGFjaG1lbnQsXG4gICAgaXNUZXh0dXJlLFxuICAgIGZvcm1hdCxcbiAgICB0eXBlLFxuICAgIHdpZHRoLFxuICAgIGhlaWdodCkge1xuICAgIGlmIChhdHRhY2htZW50LnRleHR1cmUpIHtcbiAgICAgIHZhciB0ZXh0dXJlID0gYXR0YWNobWVudC50ZXh0dXJlXG4gICAgICBpZiAoaXNUZXh0dXJlKSB7XG4gICAgICAgIHRleHR1cmUoe1xuICAgICAgICAgIGZvcm1hdDogZm9ybWF0LFxuICAgICAgICAgIHR5cGU6IHR5cGUsXG4gICAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICAgIGhlaWdodDogaGVpZ2h0XG4gICAgICAgIH0pXG4gICAgICAgIHRleHR1cmUuX3RleHR1cmUucmVmQ291bnQgKz0gMVxuICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgcmVuZGVyYnVmZmVyID0gYXR0YWNobWVudC5yZW5kZXJidWZmZXJcbiAgICAgIGlmICghaXNUZXh0dXJlKSB7XG4gICAgICAgIHJlbmRlcmJ1ZmZlcih7XG4gICAgICAgICAgZm9ybWF0OiBmb3JtYXQsXG4gICAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICAgIGhlaWdodDogaGVpZ2h0XG4gICAgICAgIH0pXG4gICAgICAgIHJlbmRlcmJ1ZmZlci5fcmVuZGVyYnVmZmVyLnJlZkNvdW50ICs9IDFcbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgIH1cbiAgICB9XG4gICAgZGVjUmVmKGF0dGFjaG1lbnQpXG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZUF0dGFjaG1lbnQgKGF0dGFjaG1lbnQpIHtcbiAgICB2YXIgdGFyZ2V0ID0gR0xfVEVYVFVSRV8yRFxuICAgIHZhciBsZXZlbCA9IDBcbiAgICB2YXIgdGV4dHVyZSA9IG51bGxcbiAgICB2YXIgcmVuZGVyYnVmZmVyID0gbnVsbFxuXG4gICAgdmFyIGRhdGEgPSBhdHRhY2htZW50XG4gICAgaWYgKHR5cGVvZiBhdHRhY2htZW50ID09PSAnb2JqZWN0Jykge1xuICAgICAgZGF0YSA9IGF0dGFjaG1lbnQuZGF0YVxuICAgICAgaWYgKCdsZXZlbCcgaW4gYXR0YWNobWVudCkge1xuICAgICAgICBsZXZlbCA9IGF0dGFjaG1lbnQubGV2ZWwgfCAwXG4gICAgICB9XG4gICAgICBpZiAoJ3RhcmdldCcgaW4gYXR0YWNobWVudCkge1xuICAgICAgICB0YXJnZXQgPSBhdHRhY2htZW50LnRhcmdldCB8IDBcbiAgICAgIH1cbiAgICB9XG5cbiAgICBcblxuICAgIHZhciB0eXBlID0gYXR0YWNobWVudC5fcmVnbFR5cGVcbiAgICBpZiAodHlwZSA9PT0gJ3RleHR1cmUnKSB7XG4gICAgICB0ZXh0dXJlID0gYXR0YWNobWVudFxuICAgICAgaWYgKHRleHR1cmUuX3RleHR1cmUudGFyZ2V0ID09PSBHTF9URVhUVVJFX0NVQkVfTUFQKSB7XG4gICAgICAgIFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgXG4gICAgICB9XG4gICAgICAvLyBUT0RPIGNoZWNrIG1pcGxldmVsIGlzIGNvbnNpc3RlbnRcbiAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICdyZW5kZXJidWZmZXInKSB7XG4gICAgICByZW5kZXJidWZmZXIgPSBhdHRhY2htZW50XG4gICAgICB0YXJnZXQgPSBHTF9SRU5ERVJCVUZGRVJcbiAgICAgIGxldmVsID0gMFxuICAgIH0gZWxzZSB7XG4gICAgICBcbiAgICB9XG5cbiAgICByZXR1cm4gbmV3IEZyYW1lYnVmZmVyQXR0YWNobWVudCh0YXJnZXQsIGxldmVsLCB0ZXh0dXJlLCByZW5kZXJidWZmZXIpXG4gIH1cblxuICBmdW5jdGlvbiB1bndyYXBBdHRhY2htZW50IChhdHRhY2htZW50KSB7XG4gICAgcmV0dXJuIGF0dGFjaG1lbnQgJiYgKGF0dGFjaG1lbnQudGV4dHVyZSB8fCBhdHRhY2htZW50LnJlbmRlcmJ1ZmZlcilcbiAgfVxuXG4gIHZhciBmcmFtZWJ1ZmZlckNvdW50ID0gMFxuICB2YXIgZnJhbWVidWZmZXJTZXQgPSB7fVxuICB2YXIgZnJhbWVidWZmZXJTdGFjayA9IFtudWxsXVxuICB2YXIgZnJhbWVidWZmZXJEaXJ0eSA9IHRydWVcblxuICBmdW5jdGlvbiBSRUdMRnJhbWVidWZmZXIgKCkge1xuICAgIHRoaXMuaWQgPSBmcmFtZWJ1ZmZlckNvdW50KytcbiAgICBmcmFtZWJ1ZmZlclNldFt0aGlzLmlkXSA9IHRoaXNcblxuICAgIHRoaXMuZnJhbWVidWZmZXIgPSBudWxsXG4gICAgdGhpcy53aWR0aCA9IDBcbiAgICB0aGlzLmhlaWdodCA9IDBcblxuICAgIHRoaXMuY29sb3JBdHRhY2htZW50cyA9IFtdXG4gICAgdGhpcy5kZXB0aEF0dGFjaG1lbnQgPSBudWxsXG4gICAgdGhpcy5zdGVuY2lsQXR0YWNobWVudCA9IG51bGxcbiAgICB0aGlzLmRlcHRoU3RlbmNpbEF0dGFjaG1lbnQgPSBudWxsXG5cbiAgICB0aGlzLm93bnNDb2xvciA9IGZhbHNlXG4gICAgdGhpcy5vd25zRGVwdGhTdGVuY2lsID0gZmFsc2VcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlZnJlc2ggKGZyYW1lYnVmZmVyKSB7XG4gICAgaWYgKCFnbC5pc0ZyYW1lYnVmZmVyKGZyYW1lYnVmZmVyLmZyYW1lYnVmZmVyKSkge1xuICAgICAgZnJhbWVidWZmZXIuZnJhbWVidWZmZXIgPSBnbC5jcmVhdGVGcmFtZWJ1ZmZlcigpXG4gICAgfVxuICAgIGZyYW1lYnVmZmVyRGlydHkgPSB0cnVlXG4gICAgZ2wuYmluZEZyYW1lYnVmZmVyKEdMX0ZSQU1FQlVGRkVSLCBmcmFtZWJ1ZmZlci5mcmFtZWJ1ZmZlcilcblxuICAgIHZhciBjb2xvckF0dGFjaG1lbnRzID0gZnJhbWVidWZmZXIuY29sb3JBdHRhY2htZW50c1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY29sb3JBdHRhY2htZW50cy5sZW5ndGg7ICsraSkge1xuICAgICAgYXR0YWNoKEdMX0NPTE9SX0FUVEFDSE1FTlQwICsgaSwgY29sb3JBdHRhY2htZW50c1tpXSlcbiAgICB9XG4gICAgZm9yIChpID0gY29sb3JBdHRhY2htZW50cy5sZW5ndGg7IGkgPCBsaW1pdHMubWF4Q29sb3JBdHRhY2htZW50czsgKytpKSB7XG4gICAgICBhdHRhY2goR0xfQ09MT1JfQVRUQUNITUVOVDAgKyBpLCBudWxsKVxuICAgIH1cbiAgICBhdHRhY2goR0xfREVQVEhfQVRUQUNITUVOVCwgZnJhbWVidWZmZXIuZGVwdGhBdHRhY2htZW50KVxuICAgIGF0dGFjaChHTF9TVEVOQ0lMX0FUVEFDSE1FTlQsIGZyYW1lYnVmZmVyLnN0ZW5jaWxBdHRhY2htZW50KVxuICAgIGF0dGFjaChHTF9ERVBUSF9TVEVOQ0lMX0FUVEFDSE1FTlQsIGZyYW1lYnVmZmVyLmRlcHRoU3RlbmNpbEF0dGFjaG1lbnQpXG5cbiAgICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9kcmF3X2J1ZmZlcnMpIHtcbiAgICAgIGV4dGVuc2lvbnMud2ViZ2xfZHJhd19idWZmZXJzLmRyYXdCdWZmZXJzV0VCR0woXG4gICAgICAgIERSQVdfQlVGRkVSU1tjb2xvckF0dGFjaG1lbnRzLmxlbmd0aF0pXG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgc3RhdHVzIGNvZGVcbiAgICB2YXIgc3RhdHVzID0gZ2wuY2hlY2tGcmFtZWJ1ZmZlclN0YXR1cyhHTF9GUkFNRUJVRkZFUilcbiAgICBpZiAoc3RhdHVzICE9PSBHTF9GUkFNRUJVRkZFUl9DT01QTEVURSkge1xuICAgICAgXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZGVjRkJPUmVmcyAoZnJhbWVidWZmZXIpIHtcbiAgICBmcmFtZWJ1ZmZlci5jb2xvckF0dGFjaG1lbnRzLmZvckVhY2goZGVjUmVmKVxuICAgIGRlY1JlZihmcmFtZWJ1ZmZlci5kZXB0aEF0dGFjaG1lbnQpXG4gICAgZGVjUmVmKGZyYW1lYnVmZmVyLnN0ZW5jaWxBdHRhY2htZW50KVxuICAgIGRlY1JlZihmcmFtZWJ1ZmZlci5kZXB0aFN0ZW5jaWxBdHRhY2htZW50KVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSAoZnJhbWVidWZmZXIpIHtcbiAgICB2YXIgaGFuZGxlID0gZnJhbWVidWZmZXIuZnJhbWVidWZmZXJcbiAgICBcbiAgICBpZiAoZ2wuaXNGcmFtZWJ1ZmZlcihoYW5kbGUpKSB7XG4gICAgICBnbC5kZWxldGVGcmFtZWJ1ZmZlcihoYW5kbGUpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlRkJPIChvcHRpb25zKSB7XG4gICAgdmFyIGZyYW1lYnVmZmVyID0gbmV3IFJFR0xGcmFtZWJ1ZmZlcigpXG5cbiAgICBmdW5jdGlvbiByZWdsRnJhbWVidWZmZXIgKGlucHV0KSB7XG4gICAgICB2YXIgaVxuICAgICAgdmFyIG9wdGlvbnMgPSBpbnB1dCB8fCB7fVxuXG4gICAgICB2YXIgZXh0RHJhd0J1ZmZlcnMgPSBleHRlbnNpb25zLndlYmdsX2RyYXdfYnVmZmVyc1xuXG4gICAgICB2YXIgd2lkdGggPSAwXG4gICAgICB2YXIgaGVpZ2h0ID0gMFxuICAgICAgaWYgKCdzaGFwZScgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgc2hhcGUgPSBvcHRpb25zLnNoYXBlXG4gICAgICAgIFxuICAgICAgICB3aWR0aCA9IHNoYXBlWzBdXG4gICAgICAgIGhlaWdodCA9IHNoYXBlWzFdXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoJ3JhZGl1cycgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHdpZHRoID0gaGVpZ2h0ID0gb3B0aW9ucy5yYWRpdXNcbiAgICAgICAgfVxuICAgICAgICBpZiAoJ3dpZHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgd2lkdGggPSBvcHRpb25zLndpZHRoXG4gICAgICAgIH1cbiAgICAgICAgaWYgKCdoZWlnaHQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBoZWlnaHQgPSBvcHRpb25zLmhlaWdodFxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIGNvbG9yVHlwZSwgbnVtQ29sb3JzXG4gICAgICB2YXIgY29sb3JCdWZmZXJzID0gbnVsbFxuICAgICAgdmFyIG93bnNDb2xvciA9IGZhbHNlXG4gICAgICBpZiAoJ2NvbG9yQnVmZmVycycgaW4gb3B0aW9ucyB8fCAnY29sb3JCdWZmZXInIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGNvbG9ySW5wdXRzID0gb3B0aW9ucy5jb2xvckJ1ZmZlcnMgfHwgb3B0aW9ucy5jb2xvckJ1ZmZlclxuICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkoY29sb3JJbnB1dHMpKSB7XG4gICAgICAgICAgY29sb3JJbnB1dHMgPSBbY29sb3JJbnB1dHNdXG4gICAgICAgIH1cblxuICAgICAgICBmcmFtZWJ1ZmZlci53aWR0aCA9IHdpZHRoXG4gICAgICAgIGZyYW1lYnVmZmVyLmhlaWdodCA9IGhlaWdodFxuXG4gICAgICAgIGlmIChjb2xvcklucHV0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgXG4gICAgICAgIH1cbiAgICAgICAgXG5cbiAgICAgICAgLy8gV3JhcCBjb2xvciBhdHRhY2htZW50c1xuICAgICAgICBjb2xvckJ1ZmZlcnMgPSBjb2xvcklucHV0cy5tYXAocGFyc2VBdHRhY2htZW50KVxuXG4gICAgICAgIC8vIENoZWNrIGhlYWQgbm9kZVxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY29sb3JCdWZmZXJzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgdmFyIGNvbG9yQXR0YWNobWVudCA9IGNvbG9yQnVmZmVyc1tpXVxuICAgICAgICAgIGNoZWNrRm9ybWF0KFxuICAgICAgICAgICAgY29sb3JBdHRhY2htZW50LFxuICAgICAgICAgICAgY29sb3JUZXh0dXJlRm9ybWF0RW51bXMsXG4gICAgICAgICAgICBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdEVudW1zKVxuICAgICAgICAgIGluY1JlZkFuZENoZWNrU2hhcGUoXG4gICAgICAgICAgICBjb2xvckF0dGFjaG1lbnQsXG4gICAgICAgICAgICBmcmFtZWJ1ZmZlcilcbiAgICAgICAgfVxuXG4gICAgICAgIHdpZHRoID0gZnJhbWVidWZmZXIud2lkdGhcbiAgICAgICAgaGVpZ2h0ID0gZnJhbWVidWZmZXIuaGVpZ2h0XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgY29sb3JUZXh0dXJlID0gdHJ1ZVxuICAgICAgICB2YXIgY29sb3JGb3JtYXQgPSAncmdiYSdcbiAgICAgICAgdmFyIGNvbG9yVHlwZSA9ICd1aW50OCdcbiAgICAgICAgdmFyIGNvbG9yQ291bnQgPSAxXG4gICAgICAgIG93bnNDb2xvciA9IHRydWVcblxuICAgICAgICBmcmFtZWJ1ZmZlci53aWR0aCA9IHdpZHRoID0gd2lkdGggfHwgZ2wuZHJhd2luZ0J1ZmZlcldpZHRoXG4gICAgICAgIGZyYW1lYnVmZmVyLmhlaWdodCA9IGhlaWdodCA9IGhlaWdodCB8fCBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0XG5cbiAgICAgICAgaWYgKCdmb3JtYXQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBjb2xvckZvcm1hdCA9IG9wdGlvbnMuZm9ybWF0XG4gICAgICAgICAgXG4gICAgICAgICAgY29sb3JUZXh0dXJlID0gY29sb3JGb3JtYXQgaW4gY29sb3JUZXh0dXJlRm9ybWF0c1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCd0eXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgXG4gICAgICAgICAgY29sb3JUeXBlID0gb3B0aW9ucy50eXBlXG4gICAgICAgICAgXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ2NvbG9yQ291bnQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBjb2xvckNvdW50ID0gb3B0aW9ucy5jb2xvckNvdW50IHwgMFxuICAgICAgICAgIFxuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmV1c2UgY29sb3IgYnVmZmVyIGFycmF5IGlmIHdlIG93biBpdFxuICAgICAgICBpZiAoZnJhbWVidWZmZXIub3duc0NvbG9yKSB7XG4gICAgICAgICAgY29sb3JCdWZmZXJzID0gZnJhbWVidWZmZXIuY29sb3JBdHRhY2htZW50c1xuICAgICAgICAgIHdoaWxlIChjb2xvckJ1ZmZlcnMubGVuZ3RoID4gY29sb3JDb3VudCkge1xuICAgICAgICAgICAgZGVjUmVmKGNvbG9yQnVmZmVycy5wb3AoKSlcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29sb3JCdWZmZXJzID0gW11cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHVwZGF0ZSBidWZmZXJzIGluIHBsYWNlLCByZW1vdmUgaW5jb21wYXRpYmxlIGJ1ZmZlcnNcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGNvbG9yQnVmZmVycy5sZW5ndGg7ICsraSkge1xuICAgICAgICAgIGlmICghdHJ5VXBkYXRlQXR0YWNobWVudChcbiAgICAgICAgICAgICAgY29sb3JCdWZmZXJzW2ldLFxuICAgICAgICAgICAgICBjb2xvclRleHR1cmUsXG4gICAgICAgICAgICAgIGNvbG9yRm9ybWF0LFxuICAgICAgICAgICAgICBjb2xvclR5cGUsXG4gICAgICAgICAgICAgIHdpZHRoLFxuICAgICAgICAgICAgICBoZWlnaHQpKSB7XG4gICAgICAgICAgICBjb2xvckJ1ZmZlcnNbaS0tXSA9IGNvbG9yQnVmZmVyc1tjb2xvckJ1ZmZlcnMubGVuZ3RoIC0gMV1cbiAgICAgICAgICAgIGNvbG9yQnVmZmVycy5wb3AoKVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFRoZW4gYXBwZW5kIG5ldyBidWZmZXJzXG4gICAgICAgIHdoaWxlIChjb2xvckJ1ZmZlcnMubGVuZ3RoIDwgY29sb3JDb3VudCkge1xuICAgICAgICAgIGlmIChjb2xvclRleHR1cmUpIHtcbiAgICAgICAgICAgIGNvbG9yQnVmZmVycy5wdXNoKG5ldyBGcmFtZWJ1ZmZlckF0dGFjaG1lbnQoXG4gICAgICAgICAgICAgIEdMX1RFWFRVUkVfMkQsXG4gICAgICAgICAgICAgIDAsXG4gICAgICAgICAgICAgIHRleHR1cmVTdGF0ZS5jcmVhdGUoe1xuICAgICAgICAgICAgICAgIGZvcm1hdDogY29sb3JGb3JtYXQsXG4gICAgICAgICAgICAgICAgdHlwZTogY29sb3JUeXBlLFxuICAgICAgICAgICAgICAgIHdpZHRoOiB3aWR0aCxcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IGhlaWdodFxuICAgICAgICAgICAgICB9LCBHTF9URVhUVVJFXzJEKSxcbiAgICAgICAgICAgICAgbnVsbCkpXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbG9yQnVmZmVycy5wdXNoKG5ldyBGcmFtZWJ1ZmZlckF0dGFjaG1lbnQoXG4gICAgICAgICAgICAgIEdMX1JFTkRFUkJVRkZFUixcbiAgICAgICAgICAgICAgMCxcbiAgICAgICAgICAgICAgbnVsbCxcbiAgICAgICAgICAgICAgcmVuZGVyYnVmZmVyU3RhdGUuY3JlYXRlKHtcbiAgICAgICAgICAgICAgICBmb3JtYXQ6IGNvbG9yRm9ybWF0LFxuICAgICAgICAgICAgICAgIHdpZHRoOiB3aWR0aCxcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IGhlaWdodFxuICAgICAgICAgICAgICB9KSkpXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIFxuXG4gICAgICBmcmFtZWJ1ZmZlci53aWR0aCA9IHdpZHRoXG4gICAgICBmcmFtZWJ1ZmZlci5oZWlnaHQgPSBoZWlnaHRcblxuICAgICAgdmFyIGRlcHRoQnVmZmVyID0gbnVsbFxuICAgICAgdmFyIHN0ZW5jaWxCdWZmZXIgPSBudWxsXG4gICAgICB2YXIgZGVwdGhTdGVuY2lsQnVmZmVyID0gbnVsbFxuICAgICAgdmFyIG93bnNEZXB0aFN0ZW5jaWwgPSBmYWxzZVxuICAgICAgdmFyIGRlcHRoU3RlbmNpbENvdW50ID0gMFxuXG4gICAgICBpZiAoJ2RlcHRoQnVmZmVyJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIGRlcHRoQnVmZmVyID0gcGFyc2VBdHRhY2htZW50KG9wdGlvbnMuZGVwdGhCdWZmZXIpXG4gICAgICAgIGNoZWNrRm9ybWF0KFxuICAgICAgICAgIGRlcHRoQnVmZmVyLFxuICAgICAgICAgIGRlcHRoVGV4dHVyZUZvcm1hdEVudW1zLFxuICAgICAgICAgIGRlcHRoUmVuZGVyYnVmZmVyRm9ybWF0RW51bXMpXG4gICAgICAgIGRlcHRoU3RlbmNpbENvdW50ICs9IDFcbiAgICAgIH1cbiAgICAgIGlmICgnc3RlbmNpbEJ1ZmZlcicgaW4gb3B0aW9ucykge1xuICAgICAgICBzdGVuY2lsQnVmZmVyID0gcGFyc2VBdHRhY2htZW50KG9wdGlvbnMuc3RlbmNpbEJ1ZmZlcilcbiAgICAgICAgY2hlY2tGb3JtYXQoXG4gICAgICAgICAgc3RlbmNpbEJ1ZmZlcixcbiAgICAgICAgICBzdGVuY2lsVGV4dHVyZUZvcm1hdEVudW1zLFxuICAgICAgICAgIHN0ZW5jaWxSZW5kZXJidWZmZXJGb3JtYXRFbnVtcylcbiAgICAgICAgZGVwdGhTdGVuY2lsQ291bnQgKz0gMVxuICAgICAgfVxuICAgICAgaWYgKCdkZXB0aFN0ZW5jaWxCdWZmZXInIGluIG9wdGlvbnMpIHtcbiAgICAgICAgZGVwdGhTdGVuY2lsQnVmZmVyID0gcGFyc2VBdHRhY2htZW50KG9wdGlvbnMuZGVwdGhTdGVuY2lsQnVmZmVyKVxuICAgICAgICBjaGVja0Zvcm1hdChcbiAgICAgICAgICBkZXB0aFN0ZW5jaWxCdWZmZXIsXG4gICAgICAgICAgZGVwdGhTdGVuY2lsVGV4dHVyZUZvcm1hdEVudW1zLFxuICAgICAgICAgIGRlcHRoU3RlbmNpbFJlbmRlcmJ1ZmZlckZvcm1hdEVudW1zKVxuICAgICAgICBkZXB0aFN0ZW5jaWxDb3VudCArPSAxXG4gICAgICB9XG5cbiAgICAgIGlmICghKGRlcHRoQnVmZmVyIHx8IHN0ZW5jaWxCdWZmZXIgfHwgZGVwdGhTdGVuY2lsQnVmZmVyKSkge1xuICAgICAgICB2YXIgZGVwdGggPSB0cnVlXG4gICAgICAgIHZhciBzdGVuY2lsID0gZmFsc2VcbiAgICAgICAgdmFyIHVzZVRleHR1cmUgPSBmYWxzZVxuXG4gICAgICAgIGlmICgnZGVwdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBkZXB0aCA9ICEhb3B0aW9ucy5kZXB0aFxuICAgICAgICB9XG4gICAgICAgIGlmICgnc3RlbmNpbCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHN0ZW5jaWwgPSAhIW9wdGlvbnMuc3RlbmNpbFxuICAgICAgICB9XG4gICAgICAgIGlmICgnZGVwdGhUZXh0dXJlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgdXNlVGV4dHVyZSA9ICEhb3B0aW9ucy5kZXB0aFRleHR1cmVcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBjdXJEZXB0aFN0ZW5jaWwgPVxuICAgICAgICAgIGZyYW1lYnVmZmVyLmRlcHRoQXR0YWNobWVudCB8fFxuICAgICAgICAgIGZyYW1lYnVmZmVyLnN0ZW5jaWxBdHRhY2htZW50IHx8XG4gICAgICAgICAgZnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsQXR0YWNobWVudFxuICAgICAgICB2YXIgbmV4dERlcHRoU3RlbmNpbCA9IG51bGxcblxuICAgICAgICBpZiAoZGVwdGggfHwgc3RlbmNpbCkge1xuICAgICAgICAgIG93bnNEZXB0aFN0ZW5jaWwgPSB0cnVlXG5cbiAgICAgICAgICBpZiAodXNlVGV4dHVyZSkge1xuICAgICAgICAgICAgXG4gICAgICAgICAgICB2YXIgZGVwdGhUZXh0dXJlRm9ybWF0XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIChzdGVuY2lsKSB7XG4gICAgICAgICAgICAgIGRlcHRoVGV4dHVyZUZvcm1hdCA9ICdkZXB0aCBzdGVuY2lsJ1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgZGVwdGhUZXh0dXJlRm9ybWF0ID0gJ2RlcHRoJ1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGZyYW1lYnVmZmVyLm93bnNEZXB0aFN0ZW5jaWwgJiYgY3VyRGVwdGhTdGVuY2lsLnRleHR1cmUpIHtcbiAgICAgICAgICAgICAgY3VyRGVwdGhTdGVuY2lsLnRleHR1cmUoe1xuICAgICAgICAgICAgICAgIGZvcm1hdDogZGVwdGhUZXh0dXJlRm9ybWF0LFxuICAgICAgICAgICAgICAgIHdpZHRoOiB3aWR0aCxcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IGhlaWdodFxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICBjdXJEZXB0aFN0ZW5jaWwudGV4dHVyZS5fdGV4dHVyZS5yZWZDb3VudCArPSAxXG4gICAgICAgICAgICAgIG5leHREZXB0aFN0ZW5jaWwgPSBjdXJEZXB0aFN0ZW5jaWxcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIG5leHREZXB0aFN0ZW5jaWwgPSBuZXcgRnJhbWVidWZmZXJBdHRhY2htZW50KFxuICAgICAgICAgICAgICAgIEdMX1RFWFRVUkVfMkQsXG4gICAgICAgICAgICAgICAgMCxcbiAgICAgICAgICAgICAgICB0ZXh0dXJlU3RhdGUuY3JlYXRlKHtcbiAgICAgICAgICAgICAgICAgIGZvcm1hdDogZGVwdGhUZXh0dXJlRm9ybWF0LFxuICAgICAgICAgICAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICAgICAgICAgICAgaGVpZ2h0OiBoZWlnaHRcbiAgICAgICAgICAgICAgICB9LCBHTF9URVhUVVJFXzJEKSxcbiAgICAgICAgICAgICAgICBudWxsKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgZGVwdGhSZW5kZXJidWZmZXJGb3JtYXRcbiAgICAgICAgICAgIGlmIChkZXB0aCkge1xuICAgICAgICAgICAgICBpZiAoc3RlbmNpbCkge1xuICAgICAgICAgICAgICAgIGRlcHRoUmVuZGVyYnVmZmVyRm9ybWF0ID0gJ2RlcHRoIHN0ZW5jaWwnXG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZGVwdGhSZW5kZXJidWZmZXJGb3JtYXQgPSAnZGVwdGgnXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGRlcHRoUmVuZGVyYnVmZmVyRm9ybWF0ID0gJ3N0ZW5jaWwnXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoZnJhbWVidWZmZXIub3duc0RlcHRoU3RlbmNpbCAmJiBjdXJEZXB0aFN0ZW5jaWwucmVuZGVyYnVmZmVyKSB7XG4gICAgICAgICAgICAgIGN1ckRlcHRoU3RlbmNpbC5yZW5kZXJidWZmZXIoe1xuICAgICAgICAgICAgICAgIGZvcm1hdDogZGVwdGhSZW5kZXJidWZmZXJGb3JtYXQsXG4gICAgICAgICAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICAgICAgICAgIGhlaWdodDogaGVpZ2h0XG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIGN1ckRlcHRoU3RlbmNpbC5yZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlci5yZWZDb3VudCArPSAxXG4gICAgICAgICAgICAgIG5leHREZXB0aFN0ZW5jaWwgPSBjdXJEZXB0aFN0ZW5jaWxcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIG5leHREZXB0aFN0ZW5jaWwgPSBuZXcgRnJhbWVidWZmZXJBdHRhY2htZW50KFxuICAgICAgICAgICAgICAgIEdMX1JFTkRFUkJVRkZFUixcbiAgICAgICAgICAgICAgICAwLFxuICAgICAgICAgICAgICAgIG51bGwsXG4gICAgICAgICAgICAgICAgcmVuZGVyYnVmZmVyU3RhdGUuY3JlYXRlKHtcbiAgICAgICAgICAgICAgICAgIGZvcm1hdDogZGVwdGhSZW5kZXJidWZmZXJGb3JtYXQsXG4gICAgICAgICAgICAgICAgICB3aWR0aDogd2lkdGgsXG4gICAgICAgICAgICAgICAgICBoZWlnaHQ6IGhlaWdodFxuICAgICAgICAgICAgICAgIH0pKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChkZXB0aCkge1xuICAgICAgICAgICAgaWYgKHN0ZW5jaWwpIHtcbiAgICAgICAgICAgICAgZGVwdGhTdGVuY2lsQnVmZmVyID0gbmV4dERlcHRoU3RlbmNpbFxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgZGVwdGhCdWZmZXIgPSBuZXh0RGVwdGhTdGVuY2lsXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHN0ZW5jaWxCdWZmZXIgPSBuZXh0RGVwdGhTdGVuY2lsXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBcblxuICAgICAgICBpbmNSZWZBbmRDaGVja1NoYXBlKFxuICAgICAgICAgIGRlcHRoQnVmZmVyIHx8XG4gICAgICAgICAgc3RlbmNpbEJ1ZmZlciB8fFxuICAgICAgICAgIGRlcHRoU3RlbmNpbEJ1ZmZlcixcbiAgICAgICAgICBmcmFtZWJ1ZmZlcilcbiAgICAgIH1cblxuICAgICAgZGVjRkJPUmVmcyhmcmFtZWJ1ZmZlcilcblxuICAgICAgZnJhbWVidWZmZXIuY29sb3JBdHRhY2htZW50cyA9IGNvbG9yQnVmZmVyc1xuICAgICAgZnJhbWVidWZmZXIuZGVwdGhBdHRhY2htZW50ID0gZGVwdGhCdWZmZXJcbiAgICAgIGZyYW1lYnVmZmVyLnN0ZW5jaWxBdHRhY2htZW50ID0gc3RlbmNpbEJ1ZmZlclxuICAgICAgZnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsQXR0YWNobWVudCA9IGRlcHRoU3RlbmNpbEJ1ZmZlclxuICAgICAgZnJhbWVidWZmZXIub3duc0NvbG9yID0gb3duc0NvbG9yXG4gICAgICBmcmFtZWJ1ZmZlci5vd25zRGVwdGhTdGVuY2lsID0gb3duc0RlcHRoU3RlbmNpbFxuXG4gICAgICByZWdsRnJhbWVidWZmZXIuY29sb3IgPSBjb2xvckJ1ZmZlcnMubWFwKHVud3JhcEF0dGFjaG1lbnQpXG4gICAgICByZWdsRnJhbWVidWZmZXIuZGVwdGggPSB1bndyYXBBdHRhY2htZW50KGRlcHRoQnVmZmVyKVxuICAgICAgcmVnbEZyYW1lYnVmZmVyLnN0ZW5jaWwgPSB1bndyYXBBdHRhY2htZW50KHN0ZW5jaWxCdWZmZXIpXG4gICAgICByZWdsRnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsID0gdW53cmFwQXR0YWNobWVudChkZXB0aFN0ZW5jaWxCdWZmZXIpXG5cbiAgICAgIHJlZnJlc2goZnJhbWVidWZmZXIpXG5cbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci53aWR0aCA9IGZyYW1lYnVmZmVyLndpZHRoXG4gICAgICByZWdsRnJhbWVidWZmZXIuaGVpZ2h0ID0gZnJhbWVidWZmZXIuaGVpZ2h0XG5cbiAgICAgIHJldHVybiByZWdsRnJhbWVidWZmZXJcbiAgICB9XG5cbiAgICByZWdsRnJhbWVidWZmZXIob3B0aW9ucylcblxuICAgIHJlZ2xGcmFtZWJ1ZmZlci5fcmVnbFR5cGUgPSAnZnJhbWVidWZmZXInXG4gICAgcmVnbEZyYW1lYnVmZmVyLl9mcmFtZWJ1ZmZlciA9IGZyYW1lYnVmZmVyXG4gICAgcmVnbEZyYW1lYnVmZmVyLl9kZXN0cm95ID0gZnVuY3Rpb24gKCkge1xuICAgICAgZGVzdHJveShmcmFtZWJ1ZmZlcilcbiAgICB9XG5cbiAgICByZXR1cm4gcmVnbEZyYW1lYnVmZmVyXG4gIH1cblxuICBmdW5jdGlvbiByZWZyZXNoQ2FjaGUgKCkge1xuICAgIHZhbHVlcyhmcmFtZWJ1ZmZlclNldCkuZm9yRWFjaChyZWZyZXNoKVxuICB9XG5cbiAgZnVuY3Rpb24gY2xlYXJDYWNoZSAoKSB7XG4gICAgdmFsdWVzKGZyYW1lYnVmZmVyU2V0KS5mb3JFYWNoKGRlc3Ryb3kpXG4gIH1cblxuICBmdW5jdGlvbiBwb2xsICgpIHtcbiAgICBpZiAoZnJhbWVidWZmZXJEaXJ0eSkge1xuICAgICAgdmFyIHRvcCA9IGZyYW1lYnVmZmVyU3RhY2tbZnJhbWVidWZmZXJTdGFjay5sZW5ndGggLSAxXVxuICAgICAgdmFyIGV4dF9kcmF3YnVmZmVycyA9IGV4dGVuc2lvbnMud2ViZ2xfZHJhd19idWZmZXJzXG5cbiAgICAgIGlmICh0b3ApIHtcbiAgICAgICAgZ2wuYmluZEZyYW1lYnVmZmVyKEdMX0ZSQU1FQlVGRkVSLCB0b3AuZnJhbWVidWZmZXIpXG4gICAgICAgIGlmIChleHRfZHJhd2J1ZmZlcnMpIHtcbiAgICAgICAgICBleHRfZHJhd2J1ZmZlcnMuZHJhd0J1ZmZlcnNXRUJHTChEUkFXX0JVRkZFUlNbdG9wLmNvbG9yQXR0YWNobWVudHMubGVuZ3RoXSlcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZ2wuYmluZEZyYW1lYnVmZmVyKEdMX0ZSQU1FQlVGRkVSLCBudWxsKVxuICAgICAgICBpZiAoZXh0X2RyYXdidWZmZXJzKSB7XG4gICAgICAgICAgZXh0X2RyYXdidWZmZXJzLmRyYXdCdWZmZXJzV0VCR0woQkFDS19CVUZGRVIpXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgZnJhbWVidWZmZXJEaXJ0eSA9IGZhbHNlXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gY3VycmVudEZyYW1lYnVmZmVyICgpIHtcbiAgICByZXR1cm4gZnJhbWVidWZmZXJTdGFja1tmcmFtZWJ1ZmZlclN0YWNrLmxlbmd0aCAtIDFdXG4gIH1cblxuICByZXR1cm4ge1xuICAgIHRvcDogY3VycmVudEZyYW1lYnVmZmVyLFxuICAgIGRpcnR5OiBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gZnJhbWVidWZmZXJEaXJ0eVxuICAgIH0sXG4gICAgcHVzaDogZnVuY3Rpb24gKG5leHRfKSB7XG4gICAgICB2YXIgbmV4dCA9IG5leHRfIHx8IG51bGxcbiAgICAgIGZyYW1lYnVmZmVyRGlydHkgPSBmcmFtZWJ1ZmZlckRpcnR5IHx8IChuZXh0ICE9PSBjdXJyZW50RnJhbWVidWZmZXIoKSlcbiAgICAgIGZyYW1lYnVmZmVyU3RhY2sucHVzaChuZXh0KVxuICAgICAgcmV0dXJuIGZyYW1lYnVmZmVyRGlydHlcbiAgICB9LFxuICAgIHBvcDogZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIHByZXYgPSBjdXJyZW50RnJhbWVidWZmZXIoKVxuICAgICAgZnJhbWVidWZmZXJTdGFjay5wb3AoKVxuICAgICAgZnJhbWVidWZmZXJEaXJ0eSA9IGZyYW1lYnVmZmVyRGlydHkgfHwgKHByZXYgIT09IGN1cnJlbnRGcmFtZWJ1ZmZlcigpKVxuICAgICAgcmV0dXJuIGZyYW1lYnVmZmVyRGlydHlcbiAgICB9LFxuICAgIGdldEZyYW1lYnVmZmVyOiBmdW5jdGlvbiAob2JqZWN0KSB7XG4gICAgICBpZiAodHlwZW9mIG9iamVjdCA9PT0gJ2Z1bmN0aW9uJyAmJiBvYmplY3QuX3JlZ2xUeXBlID09PSAnZnJhbWVidWZmZXInKSB7XG4gICAgICAgIHZhciBmYm8gPSBvYmplY3QuX2ZyYW1lYnVmZmVyXG4gICAgICAgIGlmIChmYm8gaW5zdGFuY2VvZiBSRUdMRnJhbWVidWZmZXIpIHtcbiAgICAgICAgICByZXR1cm4gZmJvXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsXG4gICAgfSxcbiAgICBwb2xsOiBwb2xsLFxuICAgIGNyZWF0ZTogY3JlYXRlRkJPLFxuICAgIGNsZWFyOiBjbGVhckNhY2hlLFxuICAgIHJlZnJlc2g6IHJlZnJlc2hDYWNoZVxuICB9XG59XG4iLCJ2YXIgR0xfU1VCUElYRUxfQklUUyA9IDB4MEQ1MFxudmFyIEdMX1JFRF9CSVRTID0gMHgwRDUyXG52YXIgR0xfR1JFRU5fQklUUyA9IDB4MEQ1M1xudmFyIEdMX0JMVUVfQklUUyA9IDB4MEQ1NFxudmFyIEdMX0FMUEhBX0JJVFMgPSAweDBENTVcbnZhciBHTF9ERVBUSF9CSVRTID0gMHgwRDU2XG52YXIgR0xfU1RFTkNJTF9CSVRTID0gMHgwRDU3XG5cbnZhciBHTF9BTElBU0VEX1BPSU5UX1NJWkVfUkFOR0UgPSAweDg0NkRcbnZhciBHTF9BTElBU0VEX0xJTkVfV0lEVEhfUkFOR0UgPSAweDg0NkVcblxudmFyIEdMX01BWF9URVhUVVJFX1NJWkUgPSAweDBEMzNcbnZhciBHTF9NQVhfVklFV1BPUlRfRElNUyA9IDB4MEQzQVxudmFyIEdMX01BWF9WRVJURVhfQVRUUklCUyA9IDB4ODg2OVxudmFyIEdMX01BWF9WRVJURVhfVU5JRk9STV9WRUNUT1JTID0gMHg4REZCXG52YXIgR0xfTUFYX1ZBUllJTkdfVkVDVE9SUyA9IDB4OERGQ1xudmFyIEdMX01BWF9DT01CSU5FRF9URVhUVVJFX0lNQUdFX1VOSVRTID0gMHg4QjREXG52YXIgR0xfTUFYX1ZFUlRFWF9URVhUVVJFX0lNQUdFX1VOSVRTID0gMHg4QjRDXG52YXIgR0xfTUFYX1RFWFRVUkVfSU1BR0VfVU5JVFMgPSAweDg4NzJcbnZhciBHTF9NQVhfRlJBR01FTlRfVU5JRk9STV9WRUNUT1JTID0gMHg4REZEXG52YXIgR0xfTUFYX0NVQkVfTUFQX1RFWFRVUkVfU0laRSA9IDB4ODUxQ1xudmFyIEdMX01BWF9SRU5ERVJCVUZGRVJfU0laRSA9IDB4ODRFOFxuXG52YXIgR0xfVkVORE9SID0gMHgxRjAwXG52YXIgR0xfUkVOREVSRVIgPSAweDFGMDFcbnZhciBHTF9WRVJTSU9OID0gMHgxRjAyXG52YXIgR0xfU0hBRElOR19MQU5HVUFHRV9WRVJTSU9OID0gMHg4QjhDXG5cbnZhciBHTF9NQVhfVEVYVFVSRV9NQVhfQU5JU09UUk9QWV9FWFQgPSAweDg0RkZcblxudmFyIEdMX01BWF9DT0xPUl9BVFRBQ0hNRU5UU19XRUJHTCA9IDB4OENERlxudmFyIEdMX01BWF9EUkFXX0JVRkZFUlNfV0VCR0wgPSAweDg4MjRcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoZ2wsIGV4dGVuc2lvbnMpIHtcbiAgdmFyIG1heEFuaXNvdHJvcGljID0gMVxuICBpZiAoZXh0ZW5zaW9ucy5leHRfdGV4dHVyZV9maWx0ZXJfYW5pc290cm9waWMpIHtcbiAgICBtYXhBbmlzb3Ryb3BpYyA9IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVEVYVFVSRV9NQVhfQU5JU09UUk9QWV9FWFQpXG4gIH1cblxuICB2YXIgbWF4RHJhd2J1ZmZlcnMgPSAxXG4gIHZhciBtYXhDb2xvckF0dGFjaG1lbnRzID0gMVxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9kcmF3X2J1ZmZlcnMpIHtcbiAgICBtYXhEcmF3YnVmZmVycyA9IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfRFJBV19CVUZGRVJTX1dFQkdMKVxuICAgIG1heENvbG9yQXR0YWNobWVudHMgPSBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0NPTE9SX0FUVEFDSE1FTlRTX1dFQkdMKVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICAvLyBkcmF3aW5nIGJ1ZmZlciBiaXQgZGVwdGhcbiAgICBjb2xvckJpdHM6IFtcbiAgICAgIGdsLmdldFBhcmFtZXRlcihHTF9SRURfQklUUyksXG4gICAgICBnbC5nZXRQYXJhbWV0ZXIoR0xfR1JFRU5fQklUUyksXG4gICAgICBnbC5nZXRQYXJhbWV0ZXIoR0xfQkxVRV9CSVRTKSxcbiAgICAgIGdsLmdldFBhcmFtZXRlcihHTF9BTFBIQV9CSVRTKVxuICAgIF0sXG4gICAgZGVwdGhCaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfREVQVEhfQklUUyksXG4gICAgc3RlbmNpbEJpdHM6IGdsLmdldFBhcmFtZXRlcihHTF9TVEVOQ0lMX0JJVFMpLFxuICAgIHN1YnBpeGVsQml0czogZ2wuZ2V0UGFyYW1ldGVyKEdMX1NVQlBJWEVMX0JJVFMpLFxuXG4gICAgLy8gc3VwcG9ydGVkIGV4dGVuc2lvbnNcbiAgICBleHRlbnNpb25zOiBPYmplY3Qua2V5cyhleHRlbnNpb25zKS5maWx0ZXIoZnVuY3Rpb24gKGV4dCkge1xuICAgICAgcmV0dXJuICEhZXh0ZW5zaW9uc1tleHRdXG4gICAgfSksXG5cbiAgICAvLyBtYXggYW5pc28gc2FtcGxlc1xuICAgIG1heEFuaXNvdHJvcGljOiBtYXhBbmlzb3Ryb3BpYyxcblxuICAgIC8vIG1heCBkcmF3IGJ1ZmZlcnNcbiAgICBtYXhEcmF3YnVmZmVyczogbWF4RHJhd2J1ZmZlcnMsXG4gICAgbWF4Q29sb3JBdHRhY2htZW50czogbWF4Q29sb3JBdHRhY2htZW50cyxcblxuICAgIC8vIHBvaW50IGFuZCBsaW5lIHNpemUgcmFuZ2VzXG4gICAgcG9pbnRTaXplRGltczogZ2wuZ2V0UGFyYW1ldGVyKEdMX0FMSUFTRURfUE9JTlRfU0laRV9SQU5HRSksXG4gICAgbGluZVdpZHRoRGltczogZ2wuZ2V0UGFyYW1ldGVyKEdMX0FMSUFTRURfTElORV9XSURUSF9SQU5HRSksXG4gICAgbWF4Vmlld3BvcnREaW1zOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1ZJRVdQT1JUX0RJTVMpLFxuICAgIG1heENvbWJpbmVkVGV4dHVyZVVuaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0NPTUJJTkVEX1RFWFRVUkVfSU1BR0VfVU5JVFMpLFxuICAgIG1heEN1YmVNYXBTaXplOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0NVQkVfTUFQX1RFWFRVUkVfU0laRSksXG4gICAgbWF4UmVuZGVyYnVmZmVyU2l6ZTogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9SRU5ERVJCVUZGRVJfU0laRSksXG4gICAgbWF4VGV4dHVyZVVuaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1RFWFRVUkVfSU1BR0VfVU5JVFMpLFxuICAgIG1heFRleHR1cmVTaXplOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1RFWFRVUkVfU0laRSksXG4gICAgbWF4QXR0cmlidXRlczogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9WRVJURVhfQVRUUklCUyksXG4gICAgbWF4VmVydGV4VW5pZm9ybXM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVkVSVEVYX1VOSUZPUk1fVkVDVE9SUyksXG4gICAgbWF4VmVydGV4VGV4dHVyZVVuaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1ZFUlRFWF9URVhUVVJFX0lNQUdFX1VOSVRTKSxcbiAgICBtYXhWYXJ5aW5nVmVjdG9yczogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9WQVJZSU5HX1ZFQ1RPUlMpLFxuICAgIG1heEZyYWdtZW50VW5pZm9ybXM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfRlJBR01FTlRfVU5JRk9STV9WRUNUT1JTKSxcblxuICAgIC8vIHZlbmRvciBpbmZvXG4gICAgZ2xzbDogZ2wuZ2V0UGFyYW1ldGVyKEdMX1NIQURJTkdfTEFOR1VBR0VfVkVSU0lPTiksXG4gICAgcmVuZGVyZXI6IGdsLmdldFBhcmFtZXRlcihHTF9SRU5ERVJFUiksXG4gICAgdmVuZG9yOiBnbC5nZXRQYXJhbWV0ZXIoR0xfVkVORE9SKSxcbiAgICB2ZXJzaW9uOiBnbC5nZXRQYXJhbWV0ZXIoR0xfVkVSU0lPTilcbiAgfVxufVxuIiwiXG52YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi91dGlsL2lzLXR5cGVkLWFycmF5JylcblxudmFyIEdMX1JHQkEgPSA2NDA4XG52YXIgR0xfVU5TSUdORURfQllURSA9IDUxMjFcbnZhciBHTF9QQUNLX0FMSUdOTUVOVCA9IDB4MEQwNVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBSZWFkUGl4ZWxzIChnbCwgcmVnbFBvbGwsIHZpZXdwb3J0U3RhdGUpIHtcbiAgZnVuY3Rpb24gcmVhZFBpeGVscyAoaW5wdXQpIHtcbiAgICB2YXIgb3B0aW9ucyA9IGlucHV0IHx8IHt9XG4gICAgaWYgKGlzVHlwZWRBcnJheShpbnB1dCkpIHtcbiAgICAgIG9wdGlvbnMgPSB7XG4gICAgICAgIGRhdGE6IG9wdGlvbnNcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDIpIHtcbiAgICAgIG9wdGlvbnMgPSB7XG4gICAgICAgIHdpZHRoOiBhcmd1bWVudHNbMF0gfCAwLFxuICAgICAgICBoZWlnaHQ6IGFyZ3VtZW50c1sxXSB8IDBcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBpbnB1dCAhPT0gJ29iamVjdCcpIHtcbiAgICAgIG9wdGlvbnMgPSB7fVxuICAgIH1cblxuICAgIC8vIFVwZGF0ZSBXZWJHTCBzdGF0ZVxuICAgIHJlZ2xQb2xsKClcblxuICAgIC8vIFJlYWQgdmlld3BvcnQgc3RhdGVcbiAgICB2YXIgeCA9IG9wdGlvbnMueCB8fCAwXG4gICAgdmFyIHkgPSBvcHRpb25zLnkgfHwgMFxuICAgIHZhciB3aWR0aCA9IG9wdGlvbnMud2lkdGggfHwgdmlld3BvcnRTdGF0ZS53aWR0aFxuICAgIHZhciBoZWlnaHQgPSBvcHRpb25zLmhlaWdodCB8fCB2aWV3cG9ydFN0YXRlLmhlaWdodFxuXG4gICAgLy8gQ29tcHV0ZSBzaXplXG4gICAgdmFyIHNpemUgPSB3aWR0aCAqIGhlaWdodCAqIDRcblxuICAgIC8vIEFsbG9jYXRlIGRhdGFcbiAgICB2YXIgZGF0YSA9IG9wdGlvbnMuZGF0YSB8fCBuZXcgVWludDhBcnJheShzaXplKVxuXG4gICAgLy8gVHlwZSBjaGVja1xuICAgIFxuICAgIFxuXG4gICAgLy8gUnVuIHJlYWQgcGl4ZWxzXG4gICAgZ2wucGl4ZWxTdG9yZWkoR0xfUEFDS19BTElHTk1FTlQsIDQpXG4gICAgZ2wucmVhZFBpeGVscyh4LCB5LCB3aWR0aCwgaGVpZ2h0LCBHTF9SR0JBLCBHTF9VTlNJR05FRF9CWVRFLCBkYXRhKVxuXG4gICAgcmV0dXJuIGRhdGFcbiAgfVxuXG4gIHJldHVybiByZWFkUGl4ZWxzXG59XG4iLCJcbnZhciB2YWx1ZXMgPSByZXF1aXJlKCcuL3V0aWwvdmFsdWVzJylcblxudmFyIEdMX1JFTkRFUkJVRkZFUiA9IDB4OEQ0MVxuXG52YXIgR0xfUkdCQTQgPSAweDgwNTZcbnZhciBHTF9SR0I1X0ExID0gMHg4MDU3XG52YXIgR0xfUkdCNTY1ID0gMHg4RDYyXG52YXIgR0xfREVQVEhfQ09NUE9ORU5UMTYgPSAweDgxQTVcbnZhciBHTF9TVEVOQ0lMX0lOREVYOCA9IDB4OEQ0OFxudmFyIEdMX0RFUFRIX1NURU5DSUwgPSAweDg0RjlcblxudmFyIEdMX1NSR0I4X0FMUEhBOF9FWFQgPSAweDhDNDNcblxudmFyIEdMX1JHQkEzMkZfRVhUID0gMHg4ODE0XG5cbnZhciBHTF9SR0JBMTZGX0VYVCA9IDB4ODgxQVxudmFyIEdMX1JHQjE2Rl9FWFQgPSAweDg4MUJcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoZ2wsIGV4dGVuc2lvbnMsIGxpbWl0cykge1xuICB2YXIgZm9ybWF0VHlwZXMgPSB7XG4gICAgJ3JnYmE0JzogR0xfUkdCQTQsXG4gICAgJ3JnYjU2NSc6IEdMX1JHQjU2NSxcbiAgICAncmdiNSBhMSc6IEdMX1JHQjVfQTEsXG4gICAgJ2RlcHRoJzogR0xfREVQVEhfQ09NUE9ORU5UMTYsXG4gICAgJ3N0ZW5jaWwnOiBHTF9TVEVOQ0lMX0lOREVYOCxcbiAgICAnZGVwdGggc3RlbmNpbCc6IEdMX0RFUFRIX1NURU5DSUxcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLmV4dF9zcmdiKSB7XG4gICAgZm9ybWF0VHlwZXNbJ3NyZ2JhJ10gPSBHTF9TUkdCOF9BTFBIQThfRVhUXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5leHRfY29sb3JfYnVmZmVyX2hhbGZfZmxvYXQpIHtcbiAgICBmb3JtYXRUeXBlc1sncmdiYTE2ZiddID0gR0xfUkdCQTE2Rl9FWFRcbiAgICBmb3JtYXRUeXBlc1sncmdiMTZmJ10gPSBHTF9SR0IxNkZfRVhUXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb2xvcl9idWZmZXJfZmxvYXQpIHtcbiAgICBmb3JtYXRUeXBlc1sncmdiYTMyZiddID0gR0xfUkdCQTMyRl9FWFRcbiAgfVxuXG4gIHZhciByZW5kZXJidWZmZXJDb3VudCA9IDBcbiAgdmFyIHJlbmRlcmJ1ZmZlclNldCA9IHt9XG5cbiAgZnVuY3Rpb24gUkVHTFJlbmRlcmJ1ZmZlciAoKSB7XG4gICAgdGhpcy5pZCA9IHJlbmRlcmJ1ZmZlckNvdW50KytcbiAgICB0aGlzLnJlZkNvdW50ID0gMVxuXG4gICAgdGhpcy5yZW5kZXJidWZmZXIgPSBudWxsXG5cbiAgICB0aGlzLmZvcm1hdCA9IEdMX1JHQkE0XG4gICAgdGhpcy53aWR0aCA9IDBcbiAgICB0aGlzLmhlaWdodCA9IDBcbiAgfVxuXG4gIFJFR0xSZW5kZXJidWZmZXIucHJvdG90eXBlLmRlY1JlZiA9IGZ1bmN0aW9uICgpIHtcbiAgICBpZiAoLS10aGlzLnJlZkNvdW50ID09PSAwKSB7XG4gICAgICBkZXN0cm95KHRoaXMpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcmVmcmVzaCAocmIpIHtcbiAgICBpZiAoIWdsLmlzUmVuZGVyYnVmZmVyKHJiLnJlbmRlcmJ1ZmZlcikpIHtcbiAgICAgIHJiLnJlbmRlcmJ1ZmZlciA9IGdsLmNyZWF0ZVJlbmRlcmJ1ZmZlcigpXG4gICAgfVxuICAgIGdsLmJpbmRSZW5kZXJidWZmZXIoR0xfUkVOREVSQlVGRkVSLCByYi5yZW5kZXJidWZmZXIpXG4gICAgZ2wucmVuZGVyYnVmZmVyU3RvcmFnZShcbiAgICAgIEdMX1JFTkRFUkJVRkZFUixcbiAgICAgIHJiLmZvcm1hdCxcbiAgICAgIHJiLndpZHRoLFxuICAgICAgcmIuaGVpZ2h0KVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSAocmIpIHtcbiAgICB2YXIgaGFuZGxlID0gcmIucmVuZGVyYnVmZmVyXG4gICAgXG4gICAgZ2wuYmluZFJlbmRlcmJ1ZmZlcihHTF9SRU5ERVJCVUZGRVIsIG51bGwpXG4gICAgaWYgKGdsLmlzUmVuZGVyYnVmZmVyKGhhbmRsZSkpIHtcbiAgICAgIGdsLmRlbGV0ZVJlbmRlcmJ1ZmZlcihoYW5kbGUpXG4gICAgfVxuICAgIHJiLnJlbmRlcmJ1ZmZlciA9IG51bGxcbiAgICByYi5yZWZDb3VudCA9IDBcbiAgICBkZWxldGUgcmVuZGVyYnVmZmVyU2V0W3JiLmlkXVxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlUmVuZGVyYnVmZmVyIChpbnB1dCkge1xuICAgIHZhciByZW5kZXJidWZmZXIgPSBuZXcgUkVHTFJlbmRlcmJ1ZmZlcigpXG4gICAgcmVuZGVyYnVmZmVyU2V0W3JlbmRlcmJ1ZmZlci5pZF0gPSByZW5kZXJidWZmZXJcblxuICAgIGZ1bmN0aW9uIHJlZ2xSZW5kZXJidWZmZXIgKGlucHV0KSB7XG4gICAgICB2YXIgb3B0aW9ucyA9IGlucHV0IHx8IHt9XG5cbiAgICAgIHZhciB3ID0gMFxuICAgICAgdmFyIGggPSAwXG4gICAgICBpZiAoJ3NoYXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBzaGFwZSA9IG9wdGlvbnMuc2hhcGVcbiAgICAgICAgXG4gICAgICAgIHcgPSBzaGFwZVswXSB8IDBcbiAgICAgICAgaCA9IHNoYXBlWzFdIHwgMFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKCdyYWRpdXMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB3ID0gaCA9IG9wdGlvbnMucmFkaXVzIHwgMFxuICAgICAgICB9XG4gICAgICAgIGlmICgnd2lkdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB3ID0gb3B0aW9ucy53aWR0aCB8IDBcbiAgICAgICAgfVxuICAgICAgICBpZiAoJ2hlaWdodCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGggPSBvcHRpb25zLmhlaWdodCB8IDBcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgdmFyIHMgPSBsaW1pdHMubWF4UmVuZGVyYnVmZmVyU2l6ZVxuICAgICAgXG4gICAgICByZWdsUmVuZGVyYnVmZmVyLndpZHRoID0gcmVuZGVyYnVmZmVyLndpZHRoID0gTWF0aC5tYXgodywgMSlcbiAgICAgIHJlZ2xSZW5kZXJidWZmZXIuaGVpZ2h0ID0gcmVuZGVyYnVmZmVyLmhlaWdodCA9IE1hdGgubWF4KGgsIDEpXG5cbiAgICAgIHJlbmRlcmJ1ZmZlci5mb3JtYXQgPSBHTF9SR0JBNFxuICAgICAgaWYgKCdmb3JtYXQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGZvcm1hdCA9IG9wdGlvbnMuZm9ybWF0XG4gICAgICAgIFxuICAgICAgICByZW5kZXJidWZmZXIuZm9ybWF0ID0gZm9ybWF0VHlwZXNbZm9ybWF0XVxuICAgICAgfVxuXG4gICAgICByZWZyZXNoKHJlbmRlcmJ1ZmZlcilcblxuICAgICAgcmV0dXJuIHJlZ2xSZW5kZXJidWZmZXJcbiAgICB9XG5cbiAgICByZWdsUmVuZGVyYnVmZmVyKGlucHV0KVxuXG4gICAgcmVnbFJlbmRlcmJ1ZmZlci5fcmVnbFR5cGUgPSAncmVuZGVyYnVmZmVyJ1xuICAgIHJlZ2xSZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlciA9IHJlbmRlcmJ1ZmZlclxuICAgIHJlZ2xSZW5kZXJidWZmZXIuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJlbmRlcmJ1ZmZlci5kZWNSZWYoKVxuICAgIH1cblxuICAgIHJldHVybiByZWdsUmVuZGVyYnVmZmVyXG4gIH1cblxuICBmdW5jdGlvbiByZWZyZXNoUmVuZGVyYnVmZmVycyAoKSB7XG4gICAgdmFsdWVzKHJlbmRlcmJ1ZmZlclNldCkuZm9yRWFjaChyZWZyZXNoKVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveVJlbmRlcmJ1ZmZlcnMgKCkge1xuICAgIHZhbHVlcyhyZW5kZXJidWZmZXJTZXQpLmZvckVhY2goZGVzdHJveSlcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY3JlYXRlOiBjcmVhdGVSZW5kZXJidWZmZXIsXG4gICAgcmVmcmVzaDogcmVmcmVzaFJlbmRlcmJ1ZmZlcnMsXG4gICAgY2xlYXI6IGRlc3Ryb3lSZW5kZXJidWZmZXJzXG4gIH1cbn1cbiIsIlxudmFyIHZhbHVlcyA9IHJlcXVpcmUoJy4vdXRpbC92YWx1ZXMnKVxuXG52YXIgREVGQVVMVF9GUkFHX1NIQURFUiA9ICd2b2lkIG1haW4oKXtnbF9GcmFnQ29sb3I9dmVjNCgwLDAsMCwwKTt9J1xudmFyIERFRkFVTFRfVkVSVF9TSEFERVIgPSAndm9pZCBtYWluKCl7Z2xfUG9zaXRpb249dmVjNCgwLDAsMCwwKTt9J1xuXG52YXIgR0xfRlJBR01FTlRfU0hBREVSID0gMzU2MzJcbnZhciBHTF9WRVJURVhfU0hBREVSID0gMzU2MzNcblxudmFyIEdMX0FDVElWRV9VTklGT1JNUyA9IDB4OEI4NlxudmFyIEdMX0FDVElWRV9BVFRSSUJVVEVTID0gMHg4Qjg5XG5cbmZ1bmN0aW9uIEFjdGl2ZUluZm8gKG5hbWUsIGlkLCBsb2NhdGlvbiwgaW5mbykge1xuICB0aGlzLm5hbWUgPSBuYW1lXG4gIHRoaXMuaWQgPSBpZFxuICB0aGlzLmxvY2F0aW9uID0gbG9jYXRpb25cbiAgdGhpcy5pbmZvID0gaW5mb1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBTaGFkZXJTdGF0ZSAoXG4gIGdsLFxuICBhdHRyaWJ1dGVTdGF0ZSxcbiAgdW5pZm9ybVN0YXRlLFxuICBjb21waWxlU2hhZGVyRHJhdyxcbiAgc3RyaW5nU3RvcmUpIHtcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIGdsc2wgY29tcGlsYXRpb24gYW5kIGxpbmtpbmdcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIHZhciBmcmFnU2hhZGVycyA9IHt9XG4gIHZhciB2ZXJ0U2hhZGVycyA9IHt9XG5cbiAgZnVuY3Rpb24gZ2V0U2hhZGVyICh0eXBlLCBpZCkge1xuICAgIHZhciBjYWNoZSA9IHR5cGUgPT09IEdMX0ZSQUdNRU5UX1NIQURFUiA/IGZyYWdTaGFkZXJzIDogdmVydFNoYWRlcnNcbiAgICB2YXIgc2hhZGVyID0gY2FjaGVbaWRdXG5cbiAgICBpZiAoIXNoYWRlcikge1xuICAgICAgdmFyIHNvdXJjZSA9IHN0cmluZ1N0b3JlLnN0cihpZClcbiAgICAgIHNoYWRlciA9IGdsLmNyZWF0ZVNoYWRlcih0eXBlKVxuICAgICAgZ2wuc2hhZGVyU291cmNlKHNoYWRlciwgc291cmNlKVxuICAgICAgZ2wuY29tcGlsZVNoYWRlcihzaGFkZXIpXG4gICAgICBcbiAgICAgIGNhY2hlW2lkXSA9IHNoYWRlclxuICAgIH1cblxuICAgIHJldHVybiBzaGFkZXJcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBwcm9ncmFtIGxpbmtpbmdcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIHZhciBwcm9ncmFtQ2FjaGUgPSB7fVxuICB2YXIgcHJvZ3JhbUxpc3QgPSBbXVxuXG4gIGZ1bmN0aW9uIFJFR0xQcm9ncmFtIChmcmFnSWQsIHZlcnRJZCkge1xuICAgIHRoaXMuZnJhZ0lkID0gZnJhZ0lkXG4gICAgdGhpcy52ZXJ0SWQgPSB2ZXJ0SWRcbiAgICB0aGlzLnByb2dyYW0gPSBudWxsXG4gICAgdGhpcy51bmlmb3JtcyA9IFtdXG4gICAgdGhpcy5hdHRyaWJ1dGVzID0gW11cbiAgICB0aGlzLmRyYXcgPSBmdW5jdGlvbiAoKSB7fVxuICAgIHRoaXMuYmF0Y2hDYWNoZSA9IHt9XG4gIH1cblxuICBmdW5jdGlvbiBsaW5rUHJvZ3JhbSAoZGVzYykge1xuICAgIHZhciBpLCBpbmZvXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gY29tcGlsZSAmIGxpbmtcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgdmFyIGZyYWdTaGFkZXIgPSBnZXRTaGFkZXIoR0xfRlJBR01FTlRfU0hBREVSLCBkZXNjLmZyYWdJZClcbiAgICB2YXIgdmVydFNoYWRlciA9IGdldFNoYWRlcihHTF9WRVJURVhfU0hBREVSLCBkZXNjLnZlcnRJZClcblxuICAgIHZhciBwcm9ncmFtID0gZGVzYy5wcm9ncmFtID0gZ2wuY3JlYXRlUHJvZ3JhbSgpXG4gICAgZ2wuYXR0YWNoU2hhZGVyKHByb2dyYW0sIGZyYWdTaGFkZXIpXG4gICAgZ2wuYXR0YWNoU2hhZGVyKHByb2dyYW0sIHZlcnRTaGFkZXIpXG4gICAgZ2wubGlua1Byb2dyYW0ocHJvZ3JhbSlcbiAgICBcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBncmFiIHVuaWZvcm1zXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHZhciBudW1Vbmlmb3JtcyA9IGdsLmdldFByb2dyYW1QYXJhbWV0ZXIocHJvZ3JhbSwgR0xfQUNUSVZFX1VOSUZPUk1TKVxuICAgIHZhciB1bmlmb3JtcyA9IGRlc2MudW5pZm9ybXMgPSBbXVxuXG4gICAgZm9yIChpID0gMDsgaSA8IG51bVVuaWZvcm1zOyArK2kpIHtcbiAgICAgIGluZm8gPSBnbC5nZXRBY3RpdmVVbmlmb3JtKHByb2dyYW0sIGkpXG4gICAgICBpZiAoaW5mbykge1xuICAgICAgICBpZiAoaW5mby5zaXplID4gMSkge1xuICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgaW5mby5zaXplOyArK2opIHtcbiAgICAgICAgICAgIHZhciBuYW1lID0gaW5mby5uYW1lLnJlcGxhY2UoJ1swXScsICdbJyArIGogKyAnXScpXG4gICAgICAgICAgICB1bmlmb3JtU3RhdGUuZGVmKG5hbWUpXG4gICAgICAgICAgICB1bmlmb3Jtcy5wdXNoKG5ldyBBY3RpdmVJbmZvKFxuICAgICAgICAgICAgICBuYW1lLFxuICAgICAgICAgICAgICBzdHJpbmdTdG9yZS5pZChuYW1lKSxcbiAgICAgICAgICAgICAgZ2wuZ2V0VW5pZm9ybUxvY2F0aW9uKHByb2dyYW0sIG5hbWUpLFxuICAgICAgICAgICAgICBpbmZvKSlcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdW5pZm9ybVN0YXRlLmRlZihpbmZvLm5hbWUpXG4gICAgICAgICAgdW5pZm9ybXMucHVzaChuZXcgQWN0aXZlSW5mbyhcbiAgICAgICAgICAgIGluZm8ubmFtZSxcbiAgICAgICAgICAgIHN0cmluZ1N0b3JlLmlkKGluZm8ubmFtZSksXG4gICAgICAgICAgICBnbC5nZXRVbmlmb3JtTG9jYXRpb24ocHJvZ3JhbSwgaW5mby5uYW1lKSxcbiAgICAgICAgICAgIGluZm8pKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGdyYWIgYXR0cmlidXRlc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICB2YXIgbnVtQXR0cmlidXRlcyA9IGdsLmdldFByb2dyYW1QYXJhbWV0ZXIocHJvZ3JhbSwgR0xfQUNUSVZFX0FUVFJJQlVURVMpXG4gICAgdmFyIGF0dHJpYnV0ZXMgPSBkZXNjLmF0dHJpYnV0ZXMgPSBbXVxuICAgIGZvciAoaSA9IDA7IGkgPCBudW1BdHRyaWJ1dGVzOyArK2kpIHtcbiAgICAgIGluZm8gPSBnbC5nZXRBY3RpdmVBdHRyaWIocHJvZ3JhbSwgaSlcbiAgICAgIGlmIChpbmZvKSB7XG4gICAgICAgIGF0dHJpYnV0ZVN0YXRlLmRlZihpbmZvLm5hbWUpXG4gICAgICAgIGF0dHJpYnV0ZXMucHVzaChuZXcgQWN0aXZlSW5mbyhcbiAgICAgICAgICBpbmZvLm5hbWUsXG4gICAgICAgICAgc3RyaW5nU3RvcmUuaWQoaW5mby5uYW1lKSxcbiAgICAgICAgICBnbC5nZXRBdHRyaWJMb2NhdGlvbihwcm9ncmFtLCBpbmZvLm5hbWUpLFxuICAgICAgICAgIGluZm8pKVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBjbGVhciBjYWNoZWQgcmVuZGVyaW5nIG1ldGhvZHNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgZGVzYy5kcmF3ID0gY29tcGlsZVNoYWRlckRyYXcoZGVzYylcbiAgICBkZXNjLmJhdGNoQ2FjaGUgPSB7fVxuICB9XG5cbiAgdmFyIGZyYWdTaGFkZXJTdGFjayA9IFsgLTEgXVxuICB2YXIgdmVydFNoYWRlclN0YWNrID0gWyAtMSBdXG5cbiAgcmV0dXJuIHtcbiAgICBjbGVhcjogZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIGRlbGV0ZVNoYWRlciA9IGdsLmRlbGV0ZVNoYWRlci5iaW5kKGdsKVxuICAgICAgdmFsdWVzKGZyYWdTaGFkZXJzKS5mb3JFYWNoKGRlbGV0ZVNoYWRlcilcbiAgICAgIGZyYWdTaGFkZXJzID0ge31cbiAgICAgIHZhbHVlcyh2ZXJ0U2hhZGVycykuZm9yRWFjaChkZWxldGVTaGFkZXIpXG4gICAgICB2ZXJ0U2hhZGVycyA9IHt9XG5cbiAgICAgIHByb2dyYW1MaXN0LmZvckVhY2goZnVuY3Rpb24gKGRlc2MpIHtcbiAgICAgICAgZ2wuZGVsZXRlUHJvZ3JhbShkZXNjLnByb2dyYW0pXG4gICAgICB9KVxuICAgICAgcHJvZ3JhbUxpc3QubGVuZ3RoID0gMFxuICAgICAgcHJvZ3JhbUNhY2hlID0ge31cbiAgICB9LFxuXG4gICAgcmVmcmVzaDogZnVuY3Rpb24gKCkge1xuICAgICAgZnJhZ1NoYWRlcnMgPSB7fVxuICAgICAgdmVydFNoYWRlcnMgPSB7fVxuICAgICAgcHJvZ3JhbUxpc3QuZm9yRWFjaChsaW5rUHJvZ3JhbSlcbiAgICB9LFxuXG4gICAgcHJvZ3JhbTogZnVuY3Rpb24gKHZlcnRJZCwgZnJhZ0lkKSB7XG4gICAgICBcbiAgICAgIFxuXG4gICAgICB2YXIgY2FjaGUgPSBwcm9ncmFtQ2FjaGVbZnJhZ0lkXVxuICAgICAgaWYgKCFjYWNoZSkge1xuICAgICAgICBjYWNoZSA9IHByb2dyYW1DYWNoZVtmcmFnSWRdID0ge31cbiAgICAgIH1cbiAgICAgIHZhciBwcm9ncmFtID0gY2FjaGVbdmVydElkXVxuICAgICAgaWYgKCFwcm9ncmFtKSB7XG4gICAgICAgIHByb2dyYW0gPSBuZXcgUkVHTFByb2dyYW0oZnJhZ0lkLCB2ZXJ0SWQpXG4gICAgICAgIGxpbmtQcm9ncmFtKHByb2dyYW0pXG4gICAgICAgIGNhY2hlW3ZlcnRJZF0gPSBwcm9ncmFtXG4gICAgICAgIHByb2dyYW1MaXN0LnB1c2gocHJvZ3JhbSlcbiAgICAgIH1cbiAgICAgIHJldHVybiBwcm9ncmFtXG4gICAgfSxcblxuICAgIHNoYWRlcjogZ2V0U2hhZGVyLFxuXG4gICAgZnJhZzogZnJhZ1NoYWRlclN0YWNrLFxuICAgIHZlcnQ6IHZlcnRTaGFkZXJTdGFja1xuICB9XG59XG4iLCJ2YXIgY3JlYXRlU3RhY2sgPSByZXF1aXJlKCcuL3V0aWwvc3RhY2snKVxudmFyIGNyZWF0ZUVudmlyb25tZW50ID0gcmVxdWlyZSgnLi91dGlsL2NvZGVnZW4nKVxuXG4vLyBXZWJHTCBjb25zdGFudHNcbnZhciBHTF9DVUxMX0ZBQ0UgPSAweDBCNDRcbnZhciBHTF9CTEVORCA9IDB4MEJFMlxudmFyIEdMX0RJVEhFUiA9IDB4MEJEMFxudmFyIEdMX1NURU5DSUxfVEVTVCA9IDB4MEI5MFxudmFyIEdMX0RFUFRIX1RFU1QgPSAweDBCNzFcbnZhciBHTF9TQ0lTU09SX1RFU1QgPSAweDBDMTFcbnZhciBHTF9QT0xZR09OX09GRlNFVF9GSUxMID0gMHg4MDM3XG52YXIgR0xfU0FNUExFX0FMUEhBX1RPX0NPVkVSQUdFID0gMHg4MDlFXG52YXIgR0xfU0FNUExFX0NPVkVSQUdFID0gMHg4MEEwXG52YXIgR0xfRlVOQ19BREQgPSAweDgwMDZcbnZhciBHTF9aRVJPID0gMFxudmFyIEdMX09ORSA9IDFcbnZhciBHTF9GUk9OVCA9IDEwMjhcbnZhciBHTF9CQUNLID0gMTAyOVxudmFyIEdMX0xFU1MgPSA1MTNcbnZhciBHTF9DQ1cgPSAyMzA1XG52YXIgR0xfQUxXQVlTID0gNTE5XG52YXIgR0xfS0VFUCA9IDc2ODBcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwQ29udGV4dFN0YXRlIChnbCwgZnJhbWVidWZmZXJTdGF0ZSwgdmlld3BvcnRTdGF0ZSkge1xuICBmdW5jdGlvbiBjYXBTdGFjayAoY2FwLCBkZmx0KSB7XG4gICAgdmFyIHJlc3VsdCA9IGNyZWF0ZVN0YWNrKFshIWRmbHRdLCBmdW5jdGlvbiAoZmxhZykge1xuICAgICAgaWYgKGZsYWcpIHtcbiAgICAgICAgZ2wuZW5hYmxlKGNhcClcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGdsLmRpc2FibGUoY2FwKVxuICAgICAgfVxuICAgIH0pXG4gICAgcmVzdWx0LmZsYWcgPSBjYXBcbiAgICByZXR1cm4gcmVzdWx0XG4gIH1cblxuICAvLyBDYXBzLCBmbGFncyBhbmQgb3RoZXIgcmFuZG9tIFdlYkdMIGNvbnRleHQgc3RhdGVcbiAgdmFyIGNvbnRleHRTdGF0ZSA9IHtcbiAgICAvLyBEaXRoZXJpbmdcbiAgICAnZGl0aGVyJzogY2FwU3RhY2soR0xfRElUSEVSKSxcblxuICAgIC8vIEJsZW5kaW5nXG4gICAgJ2JsZW5kLmVuYWJsZSc6IGNhcFN0YWNrKEdMX0JMRU5EKSxcbiAgICAnYmxlbmQuY29sb3InOiBjcmVhdGVTdGFjayhbMCwgMCwgMCwgMF0sIGZ1bmN0aW9uIChyLCBnLCBiLCBhKSB7XG4gICAgICBnbC5ibGVuZENvbG9yKHIsIGcsIGIsIGEpXG4gICAgfSksXG4gICAgJ2JsZW5kLmVxdWF0aW9uJzogY3JlYXRlU3RhY2soW0dMX0ZVTkNfQURELCBHTF9GVU5DX0FERF0sIGZ1bmN0aW9uIChyZ2IsIGEpIHtcbiAgICAgIGdsLmJsZW5kRXF1YXRpb25TZXBhcmF0ZShyZ2IsIGEpXG4gICAgfSksXG4gICAgJ2JsZW5kLmZ1bmMnOiBjcmVhdGVTdGFjayhbXG4gICAgICBHTF9PTkUsIEdMX1pFUk8sIEdMX09ORSwgR0xfWkVST1xuICAgIF0sIGZ1bmN0aW9uIChzcmNSR0IsIGRzdFJHQiwgc3JjQWxwaGEsIGRzdEFscGhhKSB7XG4gICAgICBnbC5ibGVuZEZ1bmNTZXBhcmF0ZShzcmNSR0IsIGRzdFJHQiwgc3JjQWxwaGEsIGRzdEFscGhhKVxuICAgIH0pLFxuXG4gICAgLy8gRGVwdGhcbiAgICAnZGVwdGguZW5hYmxlJzogY2FwU3RhY2soR0xfREVQVEhfVEVTVCwgdHJ1ZSksXG4gICAgJ2RlcHRoLmZ1bmMnOiBjcmVhdGVTdGFjayhbR0xfTEVTU10sIGZ1bmN0aW9uIChmdW5jKSB7XG4gICAgICBnbC5kZXB0aEZ1bmMoZnVuYylcbiAgICB9KSxcbiAgICAnZGVwdGgucmFuZ2UnOiBjcmVhdGVTdGFjayhbMCwgMV0sIGZ1bmN0aW9uIChuZWFyLCBmYXIpIHtcbiAgICAgIGdsLmRlcHRoUmFuZ2UobmVhciwgZmFyKVxuICAgIH0pLFxuICAgICdkZXB0aC5tYXNrJzogY3JlYXRlU3RhY2soW3RydWVdLCBmdW5jdGlvbiAobSkge1xuICAgICAgZ2wuZGVwdGhNYXNrKG0pXG4gICAgfSksXG5cbiAgICAvLyBGYWNlIGN1bGxpbmdcbiAgICAnY3VsbC5lbmFibGUnOiBjYXBTdGFjayhHTF9DVUxMX0ZBQ0UpLFxuICAgICdjdWxsLmZhY2UnOiBjcmVhdGVTdGFjayhbR0xfQkFDS10sIGZ1bmN0aW9uIChtb2RlKSB7XG4gICAgICBnbC5jdWxsRmFjZShtb2RlKVxuICAgIH0pLFxuXG4gICAgLy8gRnJvbnQgZmFjZSBvcmllbnRhdGlvblxuICAgICdmcm9udEZhY2UnOiBjcmVhdGVTdGFjayhbR0xfQ0NXXSwgZnVuY3Rpb24gKG1vZGUpIHtcbiAgICAgIGdsLmZyb250RmFjZShtb2RlKVxuICAgIH0pLFxuXG4gICAgLy8gV3JpdGUgbWFza3NcbiAgICAnY29sb3JNYXNrJzogY3JlYXRlU3RhY2soW3RydWUsIHRydWUsIHRydWUsIHRydWVdLCBmdW5jdGlvbiAociwgZywgYiwgYSkge1xuICAgICAgZ2wuY29sb3JNYXNrKHIsIGcsIGIsIGEpXG4gICAgfSksXG5cbiAgICAvLyBMaW5lIHdpZHRoXG4gICAgJ2xpbmVXaWR0aCc6IGNyZWF0ZVN0YWNrKFsxXSwgZnVuY3Rpb24gKHcpIHtcbiAgICAgIGdsLmxpbmVXaWR0aCh3KVxuICAgIH0pLFxuXG4gICAgLy8gUG9seWdvbiBvZmZzZXRcbiAgICAncG9seWdvbk9mZnNldC5lbmFibGUnOiBjYXBTdGFjayhHTF9QT0xZR09OX09GRlNFVF9GSUxMKSxcbiAgICAncG9seWdvbk9mZnNldC5vZmZzZXQnOiBjcmVhdGVTdGFjayhbMCwgMF0sIGZ1bmN0aW9uIChmYWN0b3IsIHVuaXRzKSB7XG4gICAgICBnbC5wb2x5Z29uT2Zmc2V0KGZhY3RvciwgdW5pdHMpXG4gICAgfSksXG5cbiAgICAvLyBTYW1wbGUgY292ZXJhZ2VcbiAgICAnc2FtcGxlLmFscGhhJzogY2FwU3RhY2soR0xfU0FNUExFX0FMUEhBX1RPX0NPVkVSQUdFKSxcbiAgICAnc2FtcGxlLmVuYWJsZSc6IGNhcFN0YWNrKEdMX1NBTVBMRV9DT1ZFUkFHRSksXG4gICAgJ3NhbXBsZS5jb3ZlcmFnZSc6IGNyZWF0ZVN0YWNrKFsxLCBmYWxzZV0sIGZ1bmN0aW9uICh2YWx1ZSwgaW52ZXJ0KSB7XG4gICAgICBnbC5zYW1wbGVDb3ZlcmFnZSh2YWx1ZSwgaW52ZXJ0KVxuICAgIH0pLFxuXG4gICAgLy8gU3RlbmNpbFxuICAgICdzdGVuY2lsLmVuYWJsZSc6IGNhcFN0YWNrKEdMX1NURU5DSUxfVEVTVCksXG4gICAgJ3N0ZW5jaWwubWFzayc6IGNyZWF0ZVN0YWNrKFstMV0sIGZ1bmN0aW9uIChtYXNrKSB7XG4gICAgICBnbC5zdGVuY2lsTWFzayhtYXNrKVxuICAgIH0pLFxuICAgICdzdGVuY2lsLmZ1bmMnOiBjcmVhdGVTdGFjayhbXG4gICAgICBHTF9BTFdBWVMsIDAsIC0xXG4gICAgXSwgZnVuY3Rpb24gKGZ1bmMsIHJlZiwgbWFzaykge1xuICAgICAgZ2wuc3RlbmNpbEZ1bmMoZnVuYywgcmVmLCBtYXNrKVxuICAgIH0pLFxuICAgICdzdGVuY2lsLm9wRnJvbnQnOiBjcmVhdGVTdGFjayhbXG4gICAgICBHTF9LRUVQLCBHTF9LRUVQLCBHTF9LRUVQXG4gICAgXSwgZnVuY3Rpb24gKGZhaWwsIHpmYWlsLCBwYXNzKSB7XG4gICAgICBnbC5zdGVuY2lsT3BTZXBhcmF0ZShHTF9GUk9OVCwgZmFpbCwgemZhaWwsIHBhc3MpXG4gICAgfSksXG4gICAgJ3N0ZW5jaWwub3BCYWNrJzogY3JlYXRlU3RhY2soW1xuICAgICAgR0xfS0VFUCwgR0xfS0VFUCwgR0xfS0VFUFxuICAgIF0sIGZ1bmN0aW9uIChmYWlsLCB6ZmFpbCwgcGFzcykge1xuICAgICAgZ2wuc3RlbmNpbE9wU2VwYXJhdGUoR0xfQkFDSywgZmFpbCwgemZhaWwsIHBhc3MpXG4gICAgfSksXG5cbiAgICAvLyBTY2lzc29yXG4gICAgJ3NjaXNzb3IuZW5hYmxlJzogY2FwU3RhY2soR0xfU0NJU1NPUl9URVNUKSxcbiAgICAnc2Npc3Nvci5ib3gnOiBjcmVhdGVTdGFjayhbMCwgMCwgLTEsIC0xXSwgZnVuY3Rpb24gKHgsIHksIHcsIGgpIHtcbiAgICAgIHZhciB3XyA9IHdcbiAgICAgIHZhciBmYm8gPSBmcmFtZWJ1ZmZlclN0YXRlLnRvcCgpXG4gICAgICBpZiAodyA8IDApIHtcbiAgICAgICAgaWYgKGZibykge1xuICAgICAgICAgIHdfID0gZmJvLndpZHRoIC0geFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHdfID0gZ2wuZHJhd2luZ0J1ZmZlcldpZHRoIC0geFxuICAgICAgICB9XG4gICAgICB9XG4gICAgICB2YXIgaF8gPSBoXG4gICAgICBpZiAoaCA8IDApIHtcbiAgICAgICAgaWYgKGZibykge1xuICAgICAgICAgIGhfID0gZmJvLmhlaWdodCAtIHlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBoXyA9IGdsLmRyYXdpbmdCdWZmZXJIZWlnaHQgLSB5XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGdsLnNjaXNzb3IoeCwgeSwgd18sIGhfKVxuICAgIH0pLFxuXG4gICAgLy8gVmlld3BvcnRcbiAgICAndmlld3BvcnQnOiBjcmVhdGVTdGFjayhbMCwgMCwgLTEsIC0xXSwgZnVuY3Rpb24gKHgsIHksIHcsIGgpIHtcbiAgICAgIHZhciB3XyA9IHdcbiAgICAgIHZhciBmYm8gPSBmcmFtZWJ1ZmZlclN0YXRlLnRvcCgpXG4gICAgICBpZiAodyA8IDApIHtcbiAgICAgICAgaWYgKGZibykge1xuICAgICAgICAgIHdfID0gZmJvLndpZHRoIC0geFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHdfID0gZ2wuZHJhd2luZ0J1ZmZlcldpZHRoIC0geFxuICAgICAgICB9XG4gICAgICB9XG4gICAgICB2YXIgaF8gPSBoXG4gICAgICBpZiAoaCA8IDApIHtcbiAgICAgICAgaWYgKGZibykge1xuICAgICAgICAgIGhfID0gZmJvLmhlaWdodCAtIHlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBoXyA9IGdsLmRyYXdpbmdCdWZmZXJIZWlnaHQgLSB5XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGdsLnZpZXdwb3J0KHgsIHksIHdfLCBoXylcbiAgICAgIHZpZXdwb3J0U3RhdGUud2lkdGggPSB3X1xuICAgICAgdmlld3BvcnRTdGF0ZS5oZWlnaHQgPSBoX1xuICAgIH0pXG4gIH1cblxuICB2YXIgZW52ID0gY3JlYXRlRW52aXJvbm1lbnQoKVxuICB2YXIgcG9sbCA9IGVudi5wcm9jKCdwb2xsJylcbiAgdmFyIHJlZnJlc2ggPSBlbnYucHJvYygncmVmcmVzaCcpXG4gIE9iamVjdC5rZXlzKGNvbnRleHRTdGF0ZSkuZm9yRWFjaChmdW5jdGlvbiAocHJvcCkge1xuICAgIHZhciBTVEFDSyA9IGVudi5saW5rKGNvbnRleHRTdGF0ZVtwcm9wXSlcbiAgICBwb2xsKFNUQUNLLCAnLnBvbGwoKTsnKVxuICAgIHJlZnJlc2goU1RBQ0ssICcuc2V0RGlydHkoKTsnKVxuICB9KVxuXG4gIHZhciBwcm9jcyA9IGVudi5jb21waWxlKClcblxuICByZXR1cm4ge1xuICAgIGNvbnRleHRTdGF0ZTogY29udGV4dFN0YXRlLFxuICAgIHZpZXdwb3J0OiB2aWV3cG9ydFN0YXRlLFxuICAgIHBvbGw6IHByb2NzLnBvbGwsXG4gICAgcmVmcmVzaDogcHJvY3MucmVmcmVzaCxcblxuICAgIG5vdGlmeVZpZXdwb3J0Q2hhbmdlZDogZnVuY3Rpb24gKCkge1xuICAgICAgY29udGV4dFN0YXRlLnZpZXdwb3J0LnNldERpcnR5KClcbiAgICAgIGNvbnRleHRTdGF0ZVsnc2Npc3Nvci5ib3gnXS5zZXREaXJ0eSgpXG4gICAgfVxuICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNyZWF0ZVN0cmluZ1N0b3JlKCkge1xuICB2YXIgc3RyaW5nSWRzID0geycnOiAwfVxuICB2YXIgc3RyaW5nVmFsdWVzID0gWycnXVxuICByZXR1cm4ge1xuICAgIGlkOiBmdW5jdGlvbiAoc3RyKSB7XG4gICAgICB2YXIgcmVzdWx0ID0gc3RyaW5nSWRzW3N0cl1cbiAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgfVxuICAgICAgcmVzdWx0ID0gc3RyaW5nSWRzW3N0cl0gPSBzdHJpbmdWYWx1ZXMubGVuZ3RoXG4gICAgICBzdHJpbmdWYWx1ZXMucHVzaChzdHIpXG4gICAgICByZXR1cm4gcmVzdWx0XG4gICAgfSxcblxuICAgIHN0cjogZnVuY3Rpb24gKGlkKSB7XG4gICAgICByZXR1cm4gc3RyaW5nVmFsdWVzW2lkXVxuICAgIH1cbiAgfVxufVxuIiwiXG52YXIgZXh0ZW5kID0gcmVxdWlyZSgnLi91dGlsL2V4dGVuZCcpXG52YXIgdmFsdWVzID0gcmVxdWlyZSgnLi91dGlsL3ZhbHVlcycpXG52YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi91dGlsL2lzLXR5cGVkLWFycmF5JylcbnZhciBpc05EQXJyYXlMaWtlID0gcmVxdWlyZSgnLi91dGlsL2lzLW5kYXJyYXknKVxudmFyIGxvYWRUZXh0dXJlID0gcmVxdWlyZSgnLi91dGlsL2xvYWQtdGV4dHVyZScpXG52YXIgY29udmVydFRvSGFsZkZsb2F0ID0gcmVxdWlyZSgnLi91dGlsL3RvLWhhbGYtZmxvYXQnKVxudmFyIHBhcnNlRERTID0gcmVxdWlyZSgnLi91dGlsL3BhcnNlLWRkcycpXG5cbnZhciBHTF9DT01QUkVTU0VEX1RFWFRVUkVfRk9STUFUUyA9IDB4ODZBM1xuXG52YXIgR0xfVEVYVFVSRV8yRCA9IDB4MERFMVxudmFyIEdMX1RFWFRVUkVfQ1VCRV9NQVAgPSAweDg1MTNcbnZhciBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1ggPSAweDg1MTVcblxudmFyIEdMX1JHQkEgPSAweDE5MDhcbnZhciBHTF9BTFBIQSA9IDB4MTkwNlxudmFyIEdMX1JHQiA9IDB4MTkwN1xudmFyIEdMX0xVTUlOQU5DRSA9IDB4MTkwOVxudmFyIEdMX0xVTUlOQU5DRV9BTFBIQSA9IDB4MTkwQVxuXG52YXIgR0xfUkdCQTQgPSAweDgwNTZcbnZhciBHTF9SR0I1X0ExID0gMHg4MDU3XG52YXIgR0xfUkdCNTY1ID0gMHg4RDYyXG5cbnZhciBHTF9VTlNJR05FRF9TSE9SVF80XzRfNF80ID0gMHg4MDMzXG52YXIgR0xfVU5TSUdORURfU0hPUlRfNV81XzVfMSA9IDB4ODAzNFxudmFyIEdMX1VOU0lHTkVEX1NIT1JUXzVfNl81ID0gMHg4MzYzXG52YXIgR0xfVU5TSUdORURfSU5UXzI0XzhfV0VCR0wgPSAweDg0RkFcblxudmFyIEdMX0RFUFRIX0NPTVBPTkVOVCA9IDB4MTkwMlxudmFyIEdMX0RFUFRIX1NURU5DSUwgPSAweDg0RjlcblxudmFyIEdMX1NSR0JfRVhUID0gMHg4QzQwXG52YXIgR0xfU1JHQl9BTFBIQV9FWFQgPSAweDhDNDJcblxudmFyIEdMX0hBTEZfRkxPQVRfT0VTID0gMHg4RDYxXG5cbnZhciBHTF9DT01QUkVTU0VEX1JHQl9TM1RDX0RYVDFfRVhUID0gMHg4M0YwXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUMV9FWFQgPSAweDgzRjFcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQzX0VYVCA9IDB4ODNGMlxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDVfRVhUID0gMHg4M0YzXG5cbnZhciBHTF9DT01QUkVTU0VEX1JHQl9BVENfV0VCR0wgPSAweDhDOTJcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfQVRDX0VYUExJQ0lUX0FMUEhBX1dFQkdMID0gMHg4QzkzXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19JTlRFUlBPTEFURURfQUxQSEFfV0VCR0wgPSAweDg3RUVcblxudmFyIEdMX0NPTVBSRVNTRURfUkdCX1BWUlRDXzRCUFBWMV9JTUcgPSAweDhDMDBcbnZhciBHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ18yQlBQVjFfSU1HID0gMHg4QzAxXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1BWUlRDXzRCUFBWMV9JTUcgPSAweDhDMDJcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUFZSVENfMkJQUFYxX0lNRyA9IDB4OEMwM1xuXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfRVRDMV9XRUJHTCA9IDB4OEQ2NFxuXG52YXIgR0xfVU5TSUdORURfQllURSA9IDB4MTQwMVxudmFyIEdMX1VOU0lHTkVEX1NIT1JUID0gMHgxNDAzXG52YXIgR0xfVU5TSUdORURfSU5UID0gMHgxNDA1XG52YXIgR0xfRkxPQVQgPSAweDE0MDZcblxudmFyIEdMX1RFWFRVUkVfV1JBUF9TID0gMHgyODAyXG52YXIgR0xfVEVYVFVSRV9XUkFQX1QgPSAweDI4MDNcblxudmFyIEdMX1JFUEVBVCA9IDB4MjkwMVxudmFyIEdMX0NMQU1QX1RPX0VER0UgPSAweDgxMkZcbnZhciBHTF9NSVJST1JFRF9SRVBFQVQgPSAweDgzNzBcblxudmFyIEdMX1RFWFRVUkVfTUFHX0ZJTFRFUiA9IDB4MjgwMFxudmFyIEdMX1RFWFRVUkVfTUlOX0ZJTFRFUiA9IDB4MjgwMVxuXG52YXIgR0xfTkVBUkVTVCA9IDB4MjYwMFxudmFyIEdMX0xJTkVBUiA9IDB4MjYwMVxudmFyIEdMX05FQVJFU1RfTUlQTUFQX05FQVJFU1QgPSAweDI3MDBcbnZhciBHTF9MSU5FQVJfTUlQTUFQX05FQVJFU1QgPSAweDI3MDFcbnZhciBHTF9ORUFSRVNUX01JUE1BUF9MSU5FQVIgPSAweDI3MDJcbnZhciBHTF9MSU5FQVJfTUlQTUFQX0xJTkVBUiA9IDB4MjcwM1xuXG52YXIgR0xfR0VORVJBVEVfTUlQTUFQX0hJTlQgPSAweDgxOTJcbnZhciBHTF9ET05UX0NBUkUgPSAweDExMDBcbnZhciBHTF9GQVNURVNUID0gMHgxMTAxXG52YXIgR0xfTklDRVNUID0gMHgxMTAyXG5cbnZhciBHTF9URVhUVVJFX01BWF9BTklTT1RST1BZX0VYVCA9IDB4ODRGRVxuXG52YXIgR0xfVU5QQUNLX0FMSUdOTUVOVCA9IDB4MENGNVxudmFyIEdMX1VOUEFDS19GTElQX1lfV0VCR0wgPSAweDkyNDBcbnZhciBHTF9VTlBBQ0tfUFJFTVVMVElQTFlfQUxQSEFfV0VCR0wgPSAweDkyNDFcbnZhciBHTF9VTlBBQ0tfQ09MT1JTUEFDRV9DT05WRVJTSU9OX1dFQkdMID0gMHg5MjQzXG5cbnZhciBHTF9CUk9XU0VSX0RFRkFVTFRfV0VCR0wgPSAweDkyNDRcblxudmFyIEdMX1RFWFRVUkUwID0gMHg4NEMwXG5cbnZhciBNSVBNQVBfRklMVEVSUyA9IFtcbiAgR0xfTkVBUkVTVF9NSVBNQVBfTkVBUkVTVCxcbiAgR0xfTkVBUkVTVF9NSVBNQVBfTElORUFSLFxuICBHTF9MSU5FQVJfTUlQTUFQX05FQVJFU1QsXG4gIEdMX0xJTkVBUl9NSVBNQVBfTElORUFSXG5dXG5cbmZ1bmN0aW9uIGlzUG93MiAodikge1xuICByZXR1cm4gISh2ICYgKHYgLSAxKSkgJiYgKCEhdilcbn1cblxuZnVuY3Rpb24gaXNOdW1lcmljQXJyYXkgKGFycikge1xuICByZXR1cm4gKFxuICAgIEFycmF5LmlzQXJyYXkoYXJyKSAmJlxuICAgIChhcnIubGVuZ3RoID09PSAwIHx8XG4gICAgdHlwZW9mIGFyclswXSA9PT0gJ251bWJlcicpKVxufVxuXG5mdW5jdGlvbiBpc1JlY3RBcnJheSAoYXJyKSB7XG4gIGlmICghQXJyYXkuaXNBcnJheShhcnIpKSB7XG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cblxuICB2YXIgd2lkdGggPSBhcnIubGVuZ3RoXG4gIGlmICh3aWR0aCA9PT0gMCB8fCAhQXJyYXkuaXNBcnJheShhcnJbMF0pKSB7XG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cblxuICB2YXIgaGVpZ2h0ID0gYXJyWzBdLmxlbmd0aFxuICBmb3IgKHZhciBpID0gMTsgaSA8IHdpZHRoOyArK2kpIHtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkoYXJyW2ldKSB8fCBhcnJbaV0ubGVuZ3RoICE9PSBoZWlnaHQpIHtcbiAgICAgIHJldHVybiBmYWxzZVxuICAgIH1cbiAgfVxuICByZXR1cm4gdHJ1ZVxufVxuXG5mdW5jdGlvbiBjbGFzc1N0cmluZyAoeCkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHgpXG59XG5cbmZ1bmN0aW9uIGlzQ2FudmFzRWxlbWVudCAob2JqZWN0KSB7XG4gIHJldHVybiBjbGFzc1N0cmluZyhvYmplY3QpID09PSAnW29iamVjdCBIVE1MQ2FudmFzRWxlbWVudF0nXG59XG5cbmZ1bmN0aW9uIGlzQ29udGV4dDJEIChvYmplY3QpIHtcbiAgcmV0dXJuIGNsYXNzU3RyaW5nKG9iamVjdCkgPT09ICdbb2JqZWN0IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRF0nXG59XG5cbmZ1bmN0aW9uIGlzSW1hZ2VFbGVtZW50IChvYmplY3QpIHtcbiAgcmV0dXJuIGNsYXNzU3RyaW5nKG9iamVjdCkgPT09ICdbb2JqZWN0IEhUTUxJbWFnZUVsZW1lbnRdJ1xufVxuXG5mdW5jdGlvbiBpc1ZpZGVvRWxlbWVudCAob2JqZWN0KSB7XG4gIHJldHVybiBjbGFzc1N0cmluZyhvYmplY3QpID09PSAnW29iamVjdCBIVE1MVmlkZW9FbGVtZW50XSdcbn1cblxuZnVuY3Rpb24gaXNQZW5kaW5nWEhSIChvYmplY3QpIHtcbiAgcmV0dXJuIGNsYXNzU3RyaW5nKG9iamVjdCkgPT09ICdbb2JqZWN0IFhNTEh0dHBSZXF1ZXN0XSdcbn1cblxuZnVuY3Rpb24gaXNQaXhlbERhdGEgKG9iamVjdCkge1xuICByZXR1cm4gKFxuICAgIHR5cGVvZiBvYmplY3QgPT09ICdzdHJpbmcnIHx8XG4gICAgKCEhb2JqZWN0ICYmIChcbiAgICAgIGlzVHlwZWRBcnJheShvYmplY3QpIHx8XG4gICAgICBpc051bWVyaWNBcnJheShvYmplY3QpIHx8XG4gICAgICBpc05EQXJyYXlMaWtlKG9iamVjdCkgfHxcbiAgICAgIGlzQ2FudmFzRWxlbWVudChvYmplY3QpIHx8XG4gICAgICBpc0NvbnRleHQyRChvYmplY3QpIHx8XG4gICAgICBpc0ltYWdlRWxlbWVudChvYmplY3QpIHx8XG4gICAgICBpc1ZpZGVvRWxlbWVudChvYmplY3QpIHx8XG4gICAgICBpc1JlY3RBcnJheShvYmplY3QpKSkpXG59XG5cbi8vIFRyYW5zcG9zZSBhbiBhcnJheSBvZiBwaXhlbHNcbmZ1bmN0aW9uIHRyYW5zcG9zZVBpeGVscyAoZGF0YSwgbngsIG55LCBuYywgc3gsIHN5LCBzYywgb2ZmKSB7XG4gIHZhciByZXN1bHQgPSBuZXcgZGF0YS5jb25zdHJ1Y3RvcihueCAqIG55ICogbmMpXG4gIHZhciBwdHIgPSAwXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbnk7ICsraSkge1xuICAgIGZvciAodmFyIGogPSAwOyBqIDwgbng7ICsraikge1xuICAgICAgZm9yICh2YXIgayA9IDA7IGsgPCBuYzsgKytrKSB7XG4gICAgICAgIHJlc3VsdFtwdHIrK10gPSBkYXRhW3N5ICogaSArIHN4ICogaiArIHNjICogayArIG9mZl1cbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNyZWF0ZVRleHR1cmVTZXQgKGdsLCBleHRlbnNpb25zLCBsaW1pdHMsIHJlZ2xQb2xsLCB2aWV3cG9ydFN0YXRlKSB7XG4gIHZhciBtaXBtYXBIaW50ID0ge1xuICAgIFwiZG9uJ3QgY2FyZVwiOiBHTF9ET05UX0NBUkUsXG4gICAgJ2RvbnQgY2FyZSc6IEdMX0RPTlRfQ0FSRSxcbiAgICAnbmljZSc6IEdMX05JQ0VTVCxcbiAgICAnZmFzdCc6IEdMX0ZBU1RFU1RcbiAgfVxuXG4gIHZhciB3cmFwTW9kZXMgPSB7XG4gICAgJ3JlcGVhdCc6IEdMX1JFUEVBVCxcbiAgICAnY2xhbXAnOiBHTF9DTEFNUF9UT19FREdFLFxuICAgICdtaXJyb3InOiBHTF9NSVJST1JFRF9SRVBFQVRcbiAgfVxuXG4gIHZhciBtYWdGaWx0ZXJzID0ge1xuICAgICduZWFyZXN0JzogR0xfTkVBUkVTVCxcbiAgICAnbGluZWFyJzogR0xfTElORUFSXG4gIH1cblxuICB2YXIgbWluRmlsdGVycyA9IGV4dGVuZCh7XG4gICAgJ25lYXJlc3QgbWlwbWFwIG5lYXJlc3QnOiBHTF9ORUFSRVNUX01JUE1BUF9ORUFSRVNULFxuICAgICdsaW5lYXIgbWlwbWFwIG5lYXJlc3QnOiBHTF9MSU5FQVJfTUlQTUFQX05FQVJFU1QsXG4gICAgJ25lYXJlc3QgbWlwbWFwIGxpbmVhcic6IEdMX05FQVJFU1RfTUlQTUFQX0xJTkVBUixcbiAgICAnbGluZWFyIG1pcG1hcCBsaW5lYXInOiBHTF9MSU5FQVJfTUlQTUFQX0xJTkVBUixcbiAgICAnbWlwbWFwJzogR0xfTElORUFSX01JUE1BUF9MSU5FQVJcbiAgfSwgbWFnRmlsdGVycylcblxuICB2YXIgY29sb3JTcGFjZSA9IHtcbiAgICAnbm9uZSc6IDAsXG4gICAgJ2Jyb3dzZXInOiBHTF9CUk9XU0VSX0RFRkFVTFRfV0VCR0xcbiAgfVxuXG4gIHZhciB0ZXh0dXJlVHlwZXMgPSB7XG4gICAgJ3VpbnQ4JzogR0xfVU5TSUdORURfQllURSxcbiAgICAncmdiYTQnOiBHTF9VTlNJR05FRF9TSE9SVF80XzRfNF80LFxuICAgICdyZ2I1NjUnOiBHTF9VTlNJR05FRF9TSE9SVF81XzZfNSxcbiAgICAncmdiNSBhMSc6IEdMX1VOU0lHTkVEX1NIT1JUXzVfNV81XzFcbiAgfVxuXG4gIHZhciB0ZXh0dXJlRm9ybWF0cyA9IHtcbiAgICAnYWxwaGEnOiBHTF9BTFBIQSxcbiAgICAnbHVtaW5hbmNlJzogR0xfTFVNSU5BTkNFLFxuICAgICdsdW1pbmFuY2UgYWxwaGEnOiBHTF9MVU1JTkFOQ0VfQUxQSEEsXG4gICAgJ3JnYic6IEdMX1JHQixcbiAgICAncmdiYSc6IEdMX1JHQkEsXG4gICAgJ3JnYmE0JzogR0xfUkdCQTQsXG4gICAgJ3JnYjUgYTEnOiBHTF9SR0I1X0ExLFxuICAgICdyZ2I1NjUnOiBHTF9SR0I1NjVcbiAgfVxuXG4gIHZhciBjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHMgPSB7fVxuXG4gIGlmIChleHRlbnNpb25zLmV4dF9zcmdiKSB7XG4gICAgdGV4dHVyZUZvcm1hdHMuc3JnYiA9IEdMX1NSR0JfRVhUXG4gICAgdGV4dHVyZUZvcm1hdHMuc3JnYmEgPSBHTF9TUkdCX0FMUEhBX0VYVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMub2VzX3RleHR1cmVfZmxvYXQpIHtcbiAgICB0ZXh0dXJlVHlwZXMuZmxvYXQgPSBHTF9GTE9BVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMub2VzX3RleHR1cmVfaGFsZl9mbG9hdCkge1xuICAgIHRleHR1cmVUeXBlc1snaGFsZiBmbG9hdCddID0gR0xfSEFMRl9GTE9BVF9PRVNcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2RlcHRoX3RleHR1cmUpIHtcbiAgICBleHRlbmQodGV4dHVyZUZvcm1hdHMsIHtcbiAgICAgICdkZXB0aCc6IEdMX0RFUFRIX0NPTVBPTkVOVCxcbiAgICAgICdkZXB0aCBzdGVuY2lsJzogR0xfREVQVEhfU1RFTkNJTFxuICAgIH0pXG5cbiAgICBleHRlbmQodGV4dHVyZVR5cGVzLCB7XG4gICAgICAndWludDE2JzogR0xfVU5TSUdORURfU0hPUlQsXG4gICAgICAndWludDMyJzogR0xfVU5TSUdORURfSU5ULFxuICAgICAgJ2RlcHRoIHN0ZW5jaWwnOiBHTF9VTlNJR05FRF9JTlRfMjRfOF9XRUJHTFxuICAgIH0pXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb21wcmVzc2VkX3RleHR1cmVfczN0Yykge1xuICAgIGV4dGVuZChjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHMsIHtcbiAgICAgICdyZ2IgczN0YyBkeHQxJzogR0xfQ09NUFJFU1NFRF9SR0JfUzNUQ19EWFQxX0VYVCxcbiAgICAgICdyZ2JhIHMzdGMgZHh0MSc6IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDFfRVhULFxuICAgICAgJ3JnYmEgczN0YyBkeHQzJzogR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUM19FWFQsXG4gICAgICAncmdiYSBzM3RjIGR4dDUnOiBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQ1X0VYVFxuICAgIH0pXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb21wcmVzc2VkX3RleHR1cmVfYXRjKSB7XG4gICAgZXh0ZW5kKGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cywge1xuICAgICAgJ3JnYiBhcmMnOiBHTF9DT01QUkVTU0VEX1JHQl9BVENfV0VCR0wsXG4gICAgICAncmdiYSBhdGMgZXhwbGljaXQgYWxwaGEnOiBHTF9DT01QUkVTU0VEX1JHQkFfQVRDX0VYUExJQ0lUX0FMUEhBX1dFQkdMLFxuICAgICAgJ3JnYmEgYXRjIGludGVycG9sYXRlZCBhbHBoYSc6IEdMX0NPTVBSRVNTRURfUkdCQV9BVENfSU5URVJQT0xBVEVEX0FMUEhBX1dFQkdMXG4gICAgfSlcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9wdnJ0Yykge1xuICAgIGV4dGVuZChjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHMsIHtcbiAgICAgICdyZ2IgcHZydGMgNGJwcHYxJzogR0xfQ09NUFJFU1NFRF9SR0JfUFZSVENfNEJQUFYxX0lNRyxcbiAgICAgICdyZ2IgcHZydGMgMmJwcHYxJzogR0xfQ09NUFJFU1NFRF9SR0JfUFZSVENfMkJQUFYxX0lNRyxcbiAgICAgICdyZ2JhIHB2cnRjIDRicHB2MSc6IEdMX0NPTVBSRVNTRURfUkdCQV9QVlJUQ180QlBQVjFfSU1HLFxuICAgICAgJ3JnYmEgcHZydGMgMmJwcHYxJzogR0xfQ09NUFJFU1NFRF9SR0JBX1BWUlRDXzJCUFBWMV9JTUdcbiAgICB9KVxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29tcHJlc3NlZF90ZXh0dXJlX2V0YzEpIHtcbiAgICBjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHNbJ3JnYiBldGMxJ10gPSBHTF9DT01QUkVTU0VEX1JHQl9FVEMxX1dFQkdMXG4gIH1cblxuICAvLyBDb3B5IG92ZXIgYWxsIHRleHR1cmUgZm9ybWF0c1xuICB2YXIgc3VwcG9ydGVkQ29tcHJlc3NlZEZvcm1hdHMgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChcbiAgICBnbC5nZXRQYXJhbWV0ZXIoR0xfQ09NUFJFU1NFRF9URVhUVVJFX0ZPUk1BVFMpKVxuICBPYmplY3Qua2V5cyhjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHMpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB2YXIgZm9ybWF0ID0gY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzW25hbWVdXG4gICAgaWYgKHN1cHBvcnRlZENvbXByZXNzZWRGb3JtYXRzLmluZGV4T2YoZm9ybWF0KSA+PSAwKSB7XG4gICAgICB0ZXh0dXJlRm9ybWF0c1tuYW1lXSA9IGZvcm1hdFxuICAgIH1cbiAgfSlcblxuICB2YXIgc3VwcG9ydGVkRm9ybWF0cyA9IE9iamVjdC5rZXlzKHRleHR1cmVGb3JtYXRzKVxuICBsaW1pdHMudGV4dHVyZUZvcm1hdHMgPSBzdXBwb3J0ZWRGb3JtYXRzXG5cbiAgdmFyIGNvbG9yRm9ybWF0cyA9IHN1cHBvcnRlZEZvcm1hdHMucmVkdWNlKGZ1bmN0aW9uIChjb2xvciwga2V5KSB7XG4gICAgdmFyIGdsZW51bSA9IHRleHR1cmVGb3JtYXRzW2tleV1cbiAgICBpZiAoZ2xlbnVtID09PSBHTF9MVU1JTkFOQ0UgfHxcbiAgICAgICAgZ2xlbnVtID09PSBHTF9BTFBIQSB8fFxuICAgICAgICBnbGVudW0gPT09IEdMX0xVTUlOQU5DRSB8fFxuICAgICAgICBnbGVudW0gPT09IEdMX0xVTUlOQU5DRV9BTFBIQSB8fFxuICAgICAgICBnbGVudW0gPT09IEdMX0RFUFRIX0NPTVBPTkVOVCB8fFxuICAgICAgICBnbGVudW0gPT09IEdMX0RFUFRIX1NURU5DSUwpIHtcbiAgICAgIGNvbG9yW2dsZW51bV0gPSBnbGVudW1cbiAgICB9IGVsc2UgaWYgKGdsZW51bSA9PT0gR0xfUkdCNV9BMSB8fCBrZXkuaW5kZXhPZigncmdiYScpID49IDApIHtcbiAgICAgIGNvbG9yW2dsZW51bV0gPSBHTF9SR0JBXG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbG9yW2dsZW51bV0gPSBHTF9SR0JcbiAgICB9XG4gICAgcmV0dXJuIGNvbG9yXG4gIH0sIHt9KVxuXG4gIC8vIFBpeGVsIHN0b3JhZ2UgcGFyc2luZ1xuICBmdW5jdGlvbiBQaXhlbEluZm8gKHRhcmdldCkge1xuICAgIC8vIHRleCB0YXJnZXRcbiAgICB0aGlzLnRhcmdldCA9IHRhcmdldFxuXG4gICAgLy8gcGl4ZWxTdG9yZWkgaW5mb1xuICAgIHRoaXMuZmxpcFkgPSBmYWxzZVxuICAgIHRoaXMucHJlbXVsdGlwbHlBbHBoYSA9IGZhbHNlXG4gICAgdGhpcy51bnBhY2tBbGlnbm1lbnQgPSAxXG4gICAgdGhpcy5jb2xvclNwYWNlID0gMFxuXG4gICAgLy8gc2hhcGVcbiAgICB0aGlzLndpZHRoID0gMFxuICAgIHRoaXMuaGVpZ2h0ID0gMFxuICAgIHRoaXMuY2hhbm5lbHMgPSAwXG5cbiAgICAvLyBmb3JtYXQgYW5kIHR5cGVcbiAgICB0aGlzLmZvcm1hdCA9IDBcbiAgICB0aGlzLmludGVybmFsZm9ybWF0ID0gMFxuICAgIHRoaXMudHlwZSA9IDBcbiAgICB0aGlzLmNvbXByZXNzZWQgPSBmYWxzZVxuXG4gICAgLy8gbWlwIGxldmVsXG4gICAgdGhpcy5taXBsZXZlbCA9IDBcblxuICAgIC8vIG5kYXJyYXktbGlrZSBwYXJhbWV0ZXJzXG4gICAgdGhpcy5zdHJpZGVYID0gMFxuICAgIHRoaXMuc3RyaWRlWSA9IDBcbiAgICB0aGlzLnN0cmlkZUMgPSAwXG4gICAgdGhpcy5vZmZzZXQgPSAwXG5cbiAgICAvLyBjb3B5IHBpeGVscyBpbmZvXG4gICAgdGhpcy54ID0gMFxuICAgIHRoaXMueSA9IDBcbiAgICB0aGlzLmNvcHkgPSBmYWxzZVxuXG4gICAgLy8gZGF0YSBzb3VyY2VzXG4gICAgdGhpcy5kYXRhID0gbnVsbFxuICAgIHRoaXMuaW1hZ2UgPSBudWxsXG4gICAgdGhpcy52aWRlbyA9IG51bGxcbiAgICB0aGlzLmNhbnZhcyA9IG51bGxcbiAgICB0aGlzLnhociA9IG51bGxcblxuICAgIC8vIENPUlNcbiAgICB0aGlzLmNyb3NzT3JpZ2luID0gbnVsbFxuXG4gICAgLy8gaG9ycmlibGUgc3RhdGUgZmxhZ3NcbiAgICB0aGlzLm5lZWRzUG9sbCA9IGZhbHNlXG4gICAgdGhpcy5uZWVkc0xpc3RlbmVycyA9IGZhbHNlXG4gIH1cblxuICBleHRlbmQoUGl4ZWxJbmZvLnByb3RvdHlwZSwge1xuICAgIHBhcnNlRmxhZ3M6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbnMgIT09ICdvYmplY3QnIHx8ICFvcHRpb25zKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuXG4gICAgICBpZiAoJ3ByZW11bHRpcGx5QWxwaGEnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgXG4gICAgICAgIHRoaXMucHJlbXVsdGlwbHlBbHBoYSA9IG9wdGlvbnMucHJlbXVsdGlwbHlBbHBoYVxuICAgICAgfVxuXG4gICAgICBpZiAoJ2ZsaXBZJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIFxuICAgICAgICB0aGlzLmZsaXBZID0gb3B0aW9ucy5mbGlwWVxuICAgICAgfVxuXG4gICAgICBpZiAoJ2FsaWdubWVudCcgaW4gb3B0aW9ucykge1xuICAgICAgICBcbiAgICAgICAgdGhpcy51bnBhY2tBbGlnbm1lbnQgPSBvcHRpb25zLmFsaWdubWVudFxuICAgICAgfVxuXG4gICAgICBpZiAoJ2NvbG9yU3BhY2UnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgXG4gICAgICAgIHRoaXMuY29sb3JTcGFjZSA9IGNvbG9yU3BhY2Vbb3B0aW9ucy5jb2xvclNwYWNlXVxuICAgICAgfVxuXG4gICAgICBpZiAoJ2Zvcm1hdCcgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgZm9ybWF0ID0gb3B0aW9ucy5mb3JtYXRcbiAgICAgICAgXG4gICAgICAgIHRoaXMuaW50ZXJuYWxmb3JtYXQgPSB0ZXh0dXJlRm9ybWF0c1tmb3JtYXRdXG4gICAgICAgIGlmIChmb3JtYXQgaW4gdGV4dHVyZVR5cGVzKSB7XG4gICAgICAgICAgdGhpcy50eXBlID0gdGV4dHVyZVR5cGVzW2Zvcm1hdF1cbiAgICAgICAgfVxuICAgICAgICBpZiAoZm9ybWF0IGluIGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cykge1xuICAgICAgICAgIHRoaXMuY29tcHJlc3NlZCA9IHRydWVcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoJ3R5cGUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIHR5cGUgPSBvcHRpb25zLnR5cGVcbiAgICAgICAgXG4gICAgICAgIHRoaXMudHlwZSA9IHRleHR1cmVUeXBlc1t0eXBlXVxuICAgICAgfVxuXG4gICAgICB2YXIgdyA9IHRoaXMud2lkdGhcbiAgICAgIHZhciBoID0gdGhpcy5oZWlnaHRcbiAgICAgIHZhciBjID0gdGhpcy5jaGFubmVsc1xuICAgICAgaWYgKCdzaGFwZScgaW4gb3B0aW9ucykge1xuICAgICAgICBcbiAgICAgICAgdyA9IG9wdGlvbnMuc2hhcGVbMF1cbiAgICAgICAgaCA9IG9wdGlvbnMuc2hhcGVbMV1cbiAgICAgICAgaWYgKG9wdGlvbnMuc2hhcGUubGVuZ3RoID09PSAzKSB7XG4gICAgICAgICAgYyA9IG9wdGlvbnMuc2hhcGVbMl1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKCdyYWRpdXMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB3ID0gaCA9IG9wdGlvbnMucmFkaXVzXG4gICAgICAgIH1cbiAgICAgICAgaWYgKCd3aWR0aCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHcgPSBvcHRpb25zLndpZHRoXG4gICAgICAgIH1cbiAgICAgICAgaWYgKCdoZWlnaHQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBoID0gb3B0aW9ucy5oZWlnaHRcbiAgICAgICAgfVxuICAgICAgICBpZiAoJ2NoYW5uZWxzJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgYyA9IG9wdGlvbnMuY2hhbm5lbHNcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgdGhpcy53aWR0aCA9IHcgfCAwXG4gICAgICB0aGlzLmhlaWdodCA9IGggfCAwXG4gICAgICB0aGlzLmNoYW5uZWxzID0gYyB8IDBcblxuICAgICAgaWYgKCdzdHJpZGUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIHN0cmlkZSA9IG9wdGlvbnMuc3RyaWRlXG4gICAgICAgIFxuICAgICAgICB0aGlzLnN0cmlkZVggPSBzdHJpZGVbMF1cbiAgICAgICAgdGhpcy5zdHJpZGVZID0gc3RyaWRlWzFdXG4gICAgICAgIGlmIChzdHJpZGUubGVuZ3RoID09PSAzKSB7XG4gICAgICAgICAgdGhpcy5zdHJpZGVDID0gc3RyaWRlWzJdXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5zdHJpZGVDID0gMVxuICAgICAgICB9XG4gICAgICAgIHRoaXMubmVlZHNUcmFuc3Bvc2UgPSB0cnVlXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLnN0cmlkZUMgPSAxXG4gICAgICAgIHRoaXMuc3RyaWRlWCA9IHRoaXMuc3RyaWRlQyAqIGNcbiAgICAgICAgdGhpcy5zdHJpZGVZID0gdGhpcy5zdHJpZGVYICogd1xuICAgICAgfVxuXG4gICAgICBpZiAoJ29mZnNldCcgaW4gb3B0aW9ucykge1xuICAgICAgICB0aGlzLm9mZnNldCA9IG9wdGlvbnMub2Zmc2V0IHwgMFxuICAgICAgICB0aGlzLm5lZWRzVHJhbnNwb3NlID0gdHJ1ZVxuICAgICAgfVxuXG4gICAgICBpZiAoJ2Nyb3NzT3JpZ2luJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHRoaXMuY3Jvc3NPcmlnaW4gPSBvcHRpb25zLmNyb3NzT3JpZ2luXG4gICAgICB9XG4gICAgfSxcbiAgICBwYXJzZTogZnVuY3Rpb24gKG9wdGlvbnMsIG1pcGxldmVsKSB7XG4gICAgICB0aGlzLm1pcGxldmVsID0gbWlwbGV2ZWxcbiAgICAgIHRoaXMud2lkdGggPSB0aGlzLndpZHRoID4+IG1pcGxldmVsXG4gICAgICB0aGlzLmhlaWdodCA9IHRoaXMuaGVpZ2h0ID4+IG1pcGxldmVsXG5cbiAgICAgIHZhciBkYXRhID0gb3B0aW9uc1xuICAgICAgc3dpdGNoICh0eXBlb2Ygb3B0aW9ucykge1xuICAgICAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICAgICAgaWYgKCFvcHRpb25zKSB7XG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICB9XG4gICAgICAgICAgdGhpcy5wYXJzZUZsYWdzKG9wdGlvbnMpXG4gICAgICAgICAgaWYgKGlzUGl4ZWxEYXRhKG9wdGlvbnMuZGF0YSkpIHtcbiAgICAgICAgICAgIGRhdGEgPSBvcHRpb25zLmRhdGFcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSAndW5kZWZpbmVkJzpcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICBcbiAgICAgIH1cblxuICAgICAgaWYgKHR5cGVvZiBkYXRhID09PSAnc3RyaW5nJykge1xuICAgICAgICBkYXRhID0gbG9hZFRleHR1cmUoZGF0YSwgdGhpcy5jcm9zc09yaWdpbilcbiAgICAgIH1cblxuICAgICAgdmFyIGFycmF5ID0gbnVsbFxuICAgICAgdmFyIG5lZWRzQ29udmVydCA9IGZhbHNlXG5cbiAgICAgIGlmICh0aGlzLmNvbXByZXNzZWQpIHtcbiAgICAgICAgXG4gICAgICB9XG5cbiAgICAgIGlmIChkYXRhID09PSBudWxsKSB7XG4gICAgICAgIC8vIFRPRE9cbiAgICAgIH0gZWxzZSBpZiAoaXNUeXBlZEFycmF5KGRhdGEpKSB7XG4gICAgICAgIHRoaXMuZGF0YSA9IGRhdGFcbiAgICAgIH0gZWxzZSBpZiAoaXNOdW1lcmljQXJyYXkoZGF0YSkpIHtcbiAgICAgICAgYXJyYXkgPSBkYXRhXG4gICAgICAgIG5lZWRzQ29udmVydCA9IHRydWVcbiAgICAgIH0gZWxzZSBpZiAoaXNOREFycmF5TGlrZShkYXRhKSkge1xuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShkYXRhLmRhdGEpKSB7XG4gICAgICAgICAgYXJyYXkgPSBkYXRhLmRhdGFcbiAgICAgICAgICBuZWVkc0NvbnZlcnQgPSB0cnVlXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5kYXRhID0gZGF0YS5kYXRhXG4gICAgICAgIH1cbiAgICAgICAgdmFyIHNoYXBlID0gZGF0YS5zaGFwZVxuICAgICAgICB0aGlzLndpZHRoID0gc2hhcGVbMF1cbiAgICAgICAgdGhpcy5oZWlnaHQgPSBzaGFwZVsxXVxuICAgICAgICBpZiAoc2hhcGUubGVuZ3RoID09PSAzKSB7XG4gICAgICAgICAgdGhpcy5jaGFubmVscyA9IHNoYXBlWzJdXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5jaGFubmVscyA9IDFcbiAgICAgICAgfVxuICAgICAgICB2YXIgc3RyaWRlID0gZGF0YS5zdHJpZGVcbiAgICAgICAgdGhpcy5zdHJpZGVYID0gZGF0YS5zdHJpZGVbMF1cbiAgICAgICAgdGhpcy5zdHJpZGVZID0gZGF0YS5zdHJpZGVbMV1cbiAgICAgICAgaWYgKHN0cmlkZS5sZW5ndGggPT09IDMpIHtcbiAgICAgICAgICB0aGlzLnN0cmlkZUMgPSBkYXRhLnN0cmlkZVsyXVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMuc3RyaWRlQyA9IDFcbiAgICAgICAgfVxuICAgICAgICB0aGlzLm9mZnNldCA9IGRhdGEub2Zmc2V0XG4gICAgICAgIHRoaXMubmVlZHNUcmFuc3Bvc2UgPSB0cnVlXG4gICAgICB9IGVsc2UgaWYgKGlzQ2FudmFzRWxlbWVudChkYXRhKSB8fCBpc0NvbnRleHQyRChkYXRhKSkge1xuICAgICAgICBpZiAoaXNDYW52YXNFbGVtZW50KGRhdGEpKSB7XG4gICAgICAgICAgdGhpcy5jYW52YXMgPSBkYXRhXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5jYW52YXMgPSBkYXRhLmNhbnZhc1xuICAgICAgICB9XG4gICAgICAgIHRoaXMud2lkdGggPSB0aGlzLmNhbnZhcy53aWR0aFxuICAgICAgICB0aGlzLmhlaWdodCA9IHRoaXMuY2FudmFzLmhlaWdodFxuICAgICAgICB0aGlzLnNldERlZmF1bHRGb3JtYXQoKVxuICAgICAgfSBlbHNlIGlmIChpc0ltYWdlRWxlbWVudChkYXRhKSkge1xuICAgICAgICB0aGlzLmltYWdlID0gZGF0YVxuICAgICAgICBpZiAoIWRhdGEuY29tcGxldGUpIHtcbiAgICAgICAgICB0aGlzLndpZHRoID0gdGhpcy53aWR0aCB8fCBkYXRhLm5hdHVyYWxXaWR0aFxuICAgICAgICAgIHRoaXMuaGVpZ2h0ID0gdGhpcy5oZWlnaHQgfHwgZGF0YS5uYXR1cmFsSGVpZ2h0XG4gICAgICAgICAgdGhpcy5uZWVkc0xpc3RlbmVycyA9IHRydWVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLndpZHRoID0gZGF0YS5uYXR1cmFsV2lkdGhcbiAgICAgICAgICB0aGlzLmhlaWdodCA9IGRhdGEubmF0dXJhbEhlaWdodFxuICAgICAgICB9XG4gICAgICAgIHRoaXMuc2V0RGVmYXVsdEZvcm1hdCgpXG4gICAgICB9IGVsc2UgaWYgKGlzVmlkZW9FbGVtZW50KGRhdGEpKSB7XG4gICAgICAgIHRoaXMudmlkZW8gPSBkYXRhXG4gICAgICAgIGlmIChkYXRhLnJlYWR5U3RhdGUgPiAxKSB7XG4gICAgICAgICAgdGhpcy53aWR0aCA9IGRhdGEud2lkdGhcbiAgICAgICAgICB0aGlzLmhlaWdodCA9IGRhdGEuaGVpZ2h0XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy53aWR0aCA9IHRoaXMud2lkdGggfHwgZGF0YS53aWR0aFxuICAgICAgICAgIHRoaXMuaGVpZ2h0ID0gdGhpcy5oZWlnaHQgfHwgZGF0YS5oZWlnaHRcbiAgICAgICAgICB0aGlzLm5lZWRzTGlzdGVuZXJzID0gdHJ1ZVxuICAgICAgICB9XG4gICAgICAgIHRoaXMubmVlZHNQb2xsID0gdHJ1ZVxuICAgICAgICB0aGlzLnNldERlZmF1bHRGb3JtYXQoKVxuICAgICAgfSBlbHNlIGlmIChpc1BlbmRpbmdYSFIoZGF0YSkpIHtcbiAgICAgICAgdGhpcy54aHIgPSBkYXRhXG4gICAgICAgIHRoaXMubmVlZHNMaXN0ZW5lcnMgPSB0cnVlXG4gICAgICB9IGVsc2UgaWYgKGlzUmVjdEFycmF5KGRhdGEpKSB7XG4gICAgICAgIHZhciB3ID0gZGF0YVswXS5sZW5ndGhcbiAgICAgICAgdmFyIGggPSBkYXRhLmxlbmd0aFxuICAgICAgICB2YXIgYyA9IDFcbiAgICAgICAgdmFyIGksIGosIGssIHBcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YVswXVswXSkpIHtcbiAgICAgICAgICBjID0gZGF0YVswXVswXS5sZW5ndGhcbiAgICAgICAgICBcbiAgICAgICAgICBhcnJheSA9IEFycmF5KHcgKiBoICogYylcbiAgICAgICAgICBwID0gMFxuICAgICAgICAgIGZvciAoaiA9IDA7IGogPCBoOyArK2opIHtcbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCB3OyArK2kpIHtcbiAgICAgICAgICAgICAgZm9yIChrID0gMDsgayA8IGM7ICsraykge1xuICAgICAgICAgICAgICAgIGFycmF5W3ArK10gPSBkYXRhW2pdW2ldW2tdXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYXJyYXkgPSBBcnJheSh3ICogaClcbiAgICAgICAgICBwID0gMFxuICAgICAgICAgIGZvciAoaiA9IDA7IGogPCBoOyArK2opIHtcbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCB3OyArK2kpIHtcbiAgICAgICAgICAgICAgYXJyYXlbcCsrXSA9IGRhdGFbal1baV1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy53aWR0aCA9IHdcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoXG4gICAgICAgIHRoaXMuY2hhbm5lbHMgPSBjXG4gICAgICAgIG5lZWRzQ29udmVydCA9IHRydWVcbiAgICAgIH0gZWxzZSBpZiAob3B0aW9ucy5jb3B5KSB7XG4gICAgICAgIHRoaXMuY29weSA9IHRydWVcbiAgICAgICAgdGhpcy54ID0gdGhpcy54IHwgMFxuICAgICAgICB0aGlzLnkgPSB0aGlzLnkgfCAwXG4gICAgICAgIHRoaXMud2lkdGggPSAodGhpcy53aWR0aCB8fCB2aWV3cG9ydFN0YXRlLndpZHRoKSB8IDBcbiAgICAgICAgdGhpcy5oZWlnaHQgPSAodGhpcy5oZWlnaHQgfHwgdmlld3BvcnRTdGF0ZS5oZWlnaHQpIHwgMFxuICAgICAgICB0aGlzLnNldERlZmF1bHRGb3JtYXQoKVxuICAgICAgfVxuXG4gICAgICAvLyBGaXggdXAgbWlzc2luZyB0eXBlIGluZm8gZm9yIHR5cGVkIGFycmF5c1xuICAgICAgaWYgKCF0aGlzLnR5cGUgJiYgdGhpcy5kYXRhKSB7XG4gICAgICAgIGlmICh0aGlzLmZvcm1hdCA9PT0gR0xfREVQVEhfQ09NUE9ORU5UKSB7XG4gICAgICAgICAgaWYgKHRoaXMuZGF0YSBpbnN0YW5jZW9mIFVpbnQxNkFycmF5KSB7XG4gICAgICAgICAgICB0aGlzLnR5cGUgPSBHTF9VTlNJR05FRF9TSE9SVFxuICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5kYXRhIGluc3RhbmNlb2YgVWludDMyQXJyYXkpIHtcbiAgICAgICAgICAgIHRoaXMudHlwZSA9IEdMX1VOU0lHTkVEX0lOVFxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmRhdGEgaW5zdGFuY2VvZiBGbG9hdDMyQXJyYXkpIHtcbiAgICAgICAgICB0aGlzLnR5cGUgPSBHTF9GTE9BVFxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIEluZmVyIGRlZmF1bHQgZm9ybWF0XG4gICAgICBpZiAoIXRoaXMuaW50ZXJuYWxmb3JtYXQpIHtcbiAgICAgICAgdmFyIGNoYW5uZWxzID0gdGhpcy5jaGFubmVscyA9IHRoaXMuY2hhbm5lbHMgfHwgNFxuICAgICAgICB0aGlzLmludGVybmFsZm9ybWF0ID0gW1xuICAgICAgICAgIEdMX0xVTUlOQU5DRSxcbiAgICAgICAgICBHTF9MVU1JTkFOQ0VfQUxQSEEsXG4gICAgICAgICAgR0xfUkdCLFxuICAgICAgICAgIEdMX1JHQkFdW2NoYW5uZWxzIC0gMV1cbiAgICAgICAgXG4gICAgICB9XG5cbiAgICAgIHZhciBmb3JtYXQgPSB0aGlzLmludGVybmFsZm9ybWF0XG4gICAgICBpZiAoZm9ybWF0ID09PSBHTF9ERVBUSF9DT01QT05FTlQgfHwgZm9ybWF0ID09PSBHTF9ERVBUSF9TVEVOQ0lMKSB7XG4gICAgICAgIFxuICAgICAgICBpZiAoZm9ybWF0ID09PSBHTF9ERVBUSF9DT01QT05FTlQpIHtcbiAgICAgICAgICBcbiAgICAgICAgfVxuICAgICAgICBpZiAoZm9ybWF0ID09PSBHTF9ERVBUSF9TVEVOQ0lMKSB7XG4gICAgICAgICAgXG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICB9XG5cbiAgICAgIC8vIENvbXB1dGUgY29sb3IgZm9ybWF0IGFuZCBudW1iZXIgb2YgY2hhbm5lbHNcbiAgICAgIHZhciBjb2xvckZvcm1hdCA9IHRoaXMuZm9ybWF0ID0gY29sb3JGb3JtYXRzW2Zvcm1hdF1cbiAgICAgIGlmICghdGhpcy5jaGFubmVscykge1xuICAgICAgICBzd2l0Y2ggKGNvbG9yRm9ybWF0KSB7XG4gICAgICAgICAgY2FzZSBHTF9MVU1JTkFOQ0U6XG4gICAgICAgICAgY2FzZSBHTF9BTFBIQTpcbiAgICAgICAgICBjYXNlIEdMX0RFUFRIX0NPTVBPTkVOVDpcbiAgICAgICAgICAgIHRoaXMuY2hhbm5lbHMgPSAxXG4gICAgICAgICAgICBicmVha1xuXG4gICAgICAgICAgY2FzZSBHTF9ERVBUSF9TVEVOQ0lMOlxuICAgICAgICAgIGNhc2UgR0xfTFVNSU5BTkNFX0FMUEhBOlxuICAgICAgICAgICAgdGhpcy5jaGFubmVscyA9IDJcbiAgICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgICBjYXNlIEdMX1JHQjpcbiAgICAgICAgICAgIHRoaXMuY2hhbm5lbHMgPSAzXG4gICAgICAgICAgICBicmVha1xuXG4gICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIHRoaXMuY2hhbm5lbHMgPSA0XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gQ2hlY2sgdGhhdCB0ZXh0dXJlIHR5cGUgaXMgc3VwcG9ydGVkXG4gICAgICB2YXIgdHlwZSA9IHRoaXMudHlwZVxuICAgICAgaWYgKHR5cGUgPT09IEdMX0ZMT0FUKSB7XG4gICAgICAgIFxuICAgICAgfSBlbHNlIGlmICh0eXBlID09PSBHTF9IQUxGX0ZMT0FUX09FUykge1xuICAgICAgICBcbiAgICAgIH0gZWxzZSBpZiAoIXR5cGUpIHtcbiAgICAgICAgaWYgKGZvcm1hdCA9PT0gR0xfREVQVEhfQ09NUE9ORU5UKSB7XG4gICAgICAgICAgdHlwZSA9IEdMX1VOU0lHTkVEX0lOVFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHR5cGUgPSBHTF9VTlNJR05FRF9CWVRFXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHRoaXMudHlwZSA9IHR5cGVcblxuICAgICAgLy8gYXBwbHkgY29udmVyc2lvblxuICAgICAgaWYgKG5lZWRzQ29udmVydCkge1xuICAgICAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX0JZVEU6XG4gICAgICAgICAgICB0aGlzLmRhdGEgPSBuZXcgVWludDhBcnJheShhcnJheSlcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9TSE9SVDpcbiAgICAgICAgICAgIHRoaXMuZGF0YSA9IG5ldyBVaW50MTZBcnJheShhcnJheSlcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9JTlQ6XG4gICAgICAgICAgICB0aGlzLmRhdGEgPSBuZXcgVWludDMyQXJyYXkoYXJyYXkpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgR0xfRkxPQVQ6XG4gICAgICAgICAgICB0aGlzLmRhdGEgPSBuZXcgRmxvYXQzMkFycmF5KGFycmF5KVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlIEdMX0hBTEZfRkxPQVRfT0VTOlxuICAgICAgICAgICAgdGhpcy5kYXRhID0gY29udmVydFRvSGFsZkZsb2F0KGFycmF5KVxuICAgICAgICAgICAgYnJlYWtcblxuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlRfNV82XzU6XG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9TSE9SVF81XzVfNV8xOlxuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlRfNF80XzRfNDpcbiAgICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX0lOVF8yNF84X1dFQkdMOlxuICAgICAgICAgICAgXG4gICAgICAgICAgICBicmVha1xuXG4gICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIFxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLmRhdGEpIHtcbiAgICAgICAgLy8gYXBwbHkgdHJhbnNwb3NlXG4gICAgICAgIGlmICh0aGlzLm5lZWRzVHJhbnNwb3NlKSB7XG4gICAgICAgICAgdGhpcy5kYXRhID0gdHJhbnNwb3NlUGl4ZWxzKFxuICAgICAgICAgICAgdGhpcy5kYXRhLFxuICAgICAgICAgICAgdGhpcy53aWR0aCxcbiAgICAgICAgICAgIHRoaXMuaGVpZ2h0LFxuICAgICAgICAgICAgdGhpcy5jaGFubmVscyxcbiAgICAgICAgICAgIHRoaXMuc3RyaWRlWCxcbiAgICAgICAgICAgIHRoaXMuc3RyaWRlWSxcbiAgICAgICAgICAgIHRoaXMuc3RyaWRlQyxcbiAgICAgICAgICAgIHRoaXMub2Zmc2V0KVxuICAgICAgICB9XG4gICAgICAgIC8vIGNoZWNrIGRhdGEgdHlwZVxuICAgICAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX0JZVEU6XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9TSE9SVF81XzZfNTpcbiAgICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUXzVfNV81XzE6XG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9TSE9SVF80XzRfNF80OlxuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlQ6XG4gICAgICAgICAgY2FzZSBHTF9IQUxGX0ZMT0FUX09FUzpcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX0lOVDpcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgYnJlYWtcblxuICAgICAgICAgIGNhc2UgR0xfRkxPQVQ6XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgdGhpcy5uZWVkc1RyYW5zcG9zZSA9IGZhbHNlXG4gICAgfSxcblxuICAgIHNldERlZmF1bHRGb3JtYXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHRoaXMuZm9ybWF0ID0gdGhpcy5pbnRlcm5hbGZvcm1hdCA9IEdMX1JHQkFcbiAgICAgIHRoaXMudHlwZSA9IEdMX1VOU0lHTkVEX0JZVEVcbiAgICAgIHRoaXMuY2hhbm5lbHMgPSA0XG4gICAgICB0aGlzLmNvbXByZXNzZWQgPSBmYWxzZVxuICAgIH0sXG5cbiAgICB1cGxvYWQ6IGZ1bmN0aW9uIChwYXJhbXMpIHtcbiAgICAgIGdsLnBpeGVsU3RvcmVpKEdMX1VOUEFDS19GTElQX1lfV0VCR0wsIHRoaXMuZmxpcFkpXG4gICAgICBnbC5waXhlbFN0b3JlaShHTF9VTlBBQ0tfUFJFTVVMVElQTFlfQUxQSEFfV0VCR0wsIHRoaXMucHJlbXVsdGlwbHlBbHBoYSlcbiAgICAgIGdsLnBpeGVsU3RvcmVpKEdMX1VOUEFDS19DT0xPUlNQQUNFX0NPTlZFUlNJT05fV0VCR0wsIHRoaXMuY29sb3JTcGFjZSlcbiAgICAgIGdsLnBpeGVsU3RvcmVpKEdMX1VOUEFDS19BTElHTk1FTlQsIHRoaXMudW5wYWNrQWxpZ25tZW50KVxuXG4gICAgICB2YXIgdGFyZ2V0ID0gdGhpcy50YXJnZXRcbiAgICAgIHZhciBtaXBsZXZlbCA9IHRoaXMubWlwbGV2ZWxcbiAgICAgIHZhciBpbWFnZSA9IHRoaXMuaW1hZ2VcbiAgICAgIHZhciBjYW52YXMgPSB0aGlzLmNhbnZhc1xuICAgICAgdmFyIHZpZGVvID0gdGhpcy52aWRlb1xuICAgICAgdmFyIGRhdGEgPSB0aGlzLmRhdGFcbiAgICAgIHZhciBpbnRlcm5hbGZvcm1hdCA9IHRoaXMuaW50ZXJuYWxmb3JtYXRcbiAgICAgIHZhciBmb3JtYXQgPSB0aGlzLmZvcm1hdFxuICAgICAgdmFyIHR5cGUgPSB0aGlzLnR5cGVcbiAgICAgIHZhciB3aWR0aCA9IHRoaXMud2lkdGggfHwgTWF0aC5tYXgoMSwgcGFyYW1zLndpZHRoID4+IG1pcGxldmVsKVxuICAgICAgdmFyIGhlaWdodCA9IHRoaXMuaGVpZ2h0IHx8IE1hdGgubWF4KDEsIHBhcmFtcy5oZWlnaHQgPj4gbWlwbGV2ZWwpXG4gICAgICBpZiAodmlkZW8gJiYgdmlkZW8ucmVhZHlTdGF0ZSA+IDIpIHtcbiAgICAgICAgZ2wudGV4SW1hZ2UyRCh0YXJnZXQsIG1pcGxldmVsLCBmb3JtYXQsIGZvcm1hdCwgdHlwZSwgdmlkZW8pXG4gICAgICB9IGVsc2UgaWYgKGltYWdlICYmIGltYWdlLmNvbXBsZXRlKSB7XG4gICAgICAgIGdsLnRleEltYWdlMkQodGFyZ2V0LCBtaXBsZXZlbCwgZm9ybWF0LCBmb3JtYXQsIHR5cGUsIGltYWdlKVxuICAgICAgfSBlbHNlIGlmIChjYW52YXMpIHtcbiAgICAgICAgZ2wudGV4SW1hZ2UyRCh0YXJnZXQsIG1pcGxldmVsLCBmb3JtYXQsIGZvcm1hdCwgdHlwZSwgY2FudmFzKVxuICAgICAgfSBlbHNlIGlmICh0aGlzLmNvbXByZXNzZWQpIHtcbiAgICAgICAgZ2wuY29tcHJlc3NlZFRleEltYWdlMkQodGFyZ2V0LCBtaXBsZXZlbCwgaW50ZXJuYWxmb3JtYXQsIHdpZHRoLCBoZWlnaHQsIDAsIGRhdGEpXG4gICAgICB9IGVsc2UgaWYgKHRoaXMuY29weSkge1xuICAgICAgICByZWdsUG9sbCgpXG4gICAgICAgIGdsLmNvcHlUZXhJbWFnZTJEKHRhcmdldCwgbWlwbGV2ZWwsIGZvcm1hdCwgdGhpcy54LCB0aGlzLnksIHdpZHRoLCBoZWlnaHQsIDApXG4gICAgICB9IGVsc2UgaWYgKGRhdGEpIHtcbiAgICAgICAgZ2wudGV4SW1hZ2UyRCh0YXJnZXQsIG1pcGxldmVsLCBmb3JtYXQsIHdpZHRoLCBoZWlnaHQsIDAsIGZvcm1hdCwgdHlwZSwgZGF0YSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGdsLnRleEltYWdlMkQodGFyZ2V0LCBtaXBsZXZlbCwgZm9ybWF0LCB3aWR0aCB8fCAxLCBoZWlnaHQgfHwgMSwgMCwgZm9ybWF0LCB0eXBlLCBudWxsKVxuICAgICAgfVxuICAgIH1cbiAgfSlcblxuICBmdW5jdGlvbiBUZXhQYXJhbXMgKHRhcmdldCkge1xuICAgIHRoaXMudGFyZ2V0ID0gdGFyZ2V0XG5cbiAgICAvLyBEZWZhdWx0IGltYWdlIHNoYXBlIGluZm9cbiAgICB0aGlzLndpZHRoID0gMFxuICAgIHRoaXMuaGVpZ2h0ID0gMFxuICAgIHRoaXMuZm9ybWF0ID0gMFxuICAgIHRoaXMuaW50ZXJuYWxmb3JtYXQgPSAwXG4gICAgdGhpcy50eXBlID0gMFxuXG4gICAgLy8gd3JhcCBtb2RlXG4gICAgdGhpcy53cmFwUyA9IEdMX0NMQU1QX1RPX0VER0VcbiAgICB0aGlzLndyYXBUID0gR0xfQ0xBTVBfVE9fRURHRVxuXG4gICAgLy8gZmlsdGVyaW5nXG4gICAgdGhpcy5taW5GaWx0ZXIgPSAwXG4gICAgdGhpcy5tYWdGaWx0ZXIgPSBHTF9ORUFSRVNUXG4gICAgdGhpcy5hbmlzb3Ryb3BpYyA9IDFcblxuICAgIC8vIG1pcG1hcHNcbiAgICB0aGlzLmdlbk1pcG1hcHMgPSBmYWxzZVxuICAgIHRoaXMubWlwbWFwSGludCA9IEdMX0RPTlRfQ0FSRVxuICB9XG5cbiAgZXh0ZW5kKFRleFBhcmFtcy5wcm90b3R5cGUsIHtcbiAgICBwYXJzZTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucyAhPT0gJ29iamVjdCcgfHwgIW9wdGlvbnMpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG5cbiAgICAgIGlmICgnbWluJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBtaW5GaWx0ZXIgPSBvcHRpb25zLm1pblxuICAgICAgICBcbiAgICAgICAgdGhpcy5taW5GaWx0ZXIgPSBtaW5GaWx0ZXJzW21pbkZpbHRlcl1cbiAgICAgIH1cblxuICAgICAgaWYgKCdtYWcnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIG1hZ0ZpbHRlciA9IG9wdGlvbnMubWFnXG4gICAgICAgIFxuICAgICAgICB0aGlzLm1hZ0ZpbHRlciA9IG1hZ0ZpbHRlcnNbbWFnRmlsdGVyXVxuICAgICAgfVxuXG4gICAgICB2YXIgd3JhcFMgPSB0aGlzLndyYXBTXG4gICAgICB2YXIgd3JhcFQgPSB0aGlzLndyYXBUXG4gICAgICBpZiAoJ3dyYXAnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIHdyYXAgPSBvcHRpb25zLndyYXBcbiAgICAgICAgaWYgKHR5cGVvZiB3cmFwID09PSAnc3RyaW5nJykge1xuICAgICAgICAgIFxuICAgICAgICAgIHdyYXBTID0gd3JhcFQgPSB3cmFwTW9kZXNbd3JhcF1cbiAgICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KHdyYXApKSB7XG4gICAgICAgICAgXG4gICAgICAgICAgXG4gICAgICAgICAgd3JhcFMgPSB3cmFwTW9kZXNbd3JhcFswXV1cbiAgICAgICAgICB3cmFwVCA9IHdyYXBNb2Rlc1t3cmFwWzFdXVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoJ3dyYXBTJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgdmFyIG9wdFdyYXBTID0gb3B0aW9ucy53cmFwU1xuICAgICAgICAgIFxuICAgICAgICAgIHdyYXBTID0gd3JhcE1vZGVzW29wdFdyYXBTXVxuICAgICAgICB9XG4gICAgICAgIGlmICgnd3JhcFQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB2YXIgb3B0V3JhcFQgPSBvcHRpb25zLndyYXBUXG4gICAgICAgICAgXG4gICAgICAgICAgd3JhcFQgPSB3cmFwTW9kZXNbb3B0V3JhcFRdXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHRoaXMud3JhcFMgPSB3cmFwU1xuICAgICAgdGhpcy53cmFwVCA9IHdyYXBUXG5cbiAgICAgIGlmICgnYW5pc290cm9waWMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGFuaXNvdHJvcGljID0gb3B0aW9ucy5hbmlzb3Ryb3BpY1xuICAgICAgICBcbiAgICAgICAgdGhpcy5hbmlzb3Ryb3BpYyA9IG9wdGlvbnMuYW5pc290cm9waWNcbiAgICAgIH1cblxuICAgICAgaWYgKCdtaXBtYXAnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIG1pcG1hcCA9IG9wdGlvbnMubWlwbWFwXG4gICAgICAgIHN3aXRjaCAodHlwZW9mIG1pcG1hcCkge1xuICAgICAgICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHRoaXMubWlwbWFwSGludCA9IG1pcG1hcEhpbnRbbWlwbWFwXVxuICAgICAgICAgICAgdGhpcy5nZW5NaXBtYXBzID0gdHJ1ZVxuICAgICAgICAgICAgYnJlYWtcblxuICAgICAgICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgICAgICAgdGhpcy5nZW5NaXBtYXBzID0gISFtaXBtYXBcbiAgICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgICBjYXNlICdvYmplY3QnOlxuICAgICAgICAgICAgYnJlYWtcblxuICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICBcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG5cbiAgICB1cGxvYWQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciB0YXJnZXQgPSB0aGlzLnRhcmdldFxuICAgICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfTUlOX0ZJTFRFUiwgdGhpcy5taW5GaWx0ZXIpXG4gICAgICBnbC50ZXhQYXJhbWV0ZXJpKHRhcmdldCwgR0xfVEVYVFVSRV9NQUdfRklMVEVSLCB0aGlzLm1hZ0ZpbHRlcilcbiAgICAgIGdsLnRleFBhcmFtZXRlcmkodGFyZ2V0LCBHTF9URVhUVVJFX1dSQVBfUywgdGhpcy53cmFwUylcbiAgICAgIGdsLnRleFBhcmFtZXRlcmkodGFyZ2V0LCBHTF9URVhUVVJFX1dSQVBfVCwgdGhpcy53cmFwVClcbiAgICAgIGlmIChleHRlbnNpb25zLmV4dF90ZXh0dXJlX2ZpbHRlcl9hbmlzb3Ryb3BpYykge1xuICAgICAgICBnbC50ZXhQYXJhbWV0ZXJpKHRhcmdldCwgR0xfVEVYVFVSRV9NQVhfQU5JU09UUk9QWV9FWFQsIHRoaXMuYW5pc290cm9waWMpXG4gICAgICB9XG4gICAgICBpZiAodGhpcy5nZW5NaXBtYXBzKSB7XG4gICAgICAgIGdsLmhpbnQoR0xfR0VORVJBVEVfTUlQTUFQX0hJTlQsIHRoaXMubWlwbWFwSGludClcbiAgICAgICAgZ2wuZ2VuZXJhdGVNaXBtYXAodGFyZ2V0KVxuICAgICAgfVxuICAgIH1cbiAgfSlcblxuICAvLyBGaW5hbCBwYXNzIHRvIG1lcmdlIHBhcmFtcyBhbmQgcGl4ZWwgZGF0YVxuICBmdW5jdGlvbiBjaGVja1RleHR1cmVDb21wbGV0ZSAocGFyYW1zLCBwaXhlbHMpIHtcbiAgICB2YXIgaSwgcGl4bWFwXG5cbiAgICB2YXIgdHlwZSA9IDBcbiAgICB2YXIgZm9ybWF0ID0gMFxuICAgIHZhciBpbnRlcm5hbGZvcm1hdCA9IDBcbiAgICB2YXIgd2lkdGggPSAwXG4gICAgdmFyIGhlaWdodCA9IDBcbiAgICB2YXIgY2hhbm5lbHMgPSAwXG4gICAgdmFyIGNvbXByZXNzZWQgPSBmYWxzZVxuICAgIHZhciBuZWVkc1BvbGwgPSBmYWxzZVxuICAgIHZhciBuZWVkc0xpc3RlbmVycyA9IGZhbHNlXG4gICAgdmFyIG1pcE1hc2syRCA9IDBcbiAgICB2YXIgbWlwTWFza0N1YmUgPSBbMCwgMCwgMCwgMCwgMCwgMF1cbiAgICB2YXIgY3ViZU1hc2sgPSAwXG4gICAgdmFyIGhhc01pcCA9IGZhbHNlXG4gICAgZm9yIChpID0gMDsgaSA8IHBpeGVscy5sZW5ndGg7ICsraSkge1xuICAgICAgcGl4bWFwID0gcGl4ZWxzW2ldXG4gICAgICB3aWR0aCA9IHdpZHRoIHx8IChwaXhtYXAud2lkdGggPDwgcGl4bWFwLm1pcGxldmVsKVxuICAgICAgaGVpZ2h0ID0gaGVpZ2h0IHx8IChwaXhtYXAuaGVpZ2h0IDw8IHBpeG1hcC5taXBsZXZlbClcbiAgICAgIHR5cGUgPSB0eXBlIHx8IHBpeG1hcC50eXBlXG4gICAgICBmb3JtYXQgPSBmb3JtYXQgfHwgcGl4bWFwLmZvcm1hdFxuICAgICAgaW50ZXJuYWxmb3JtYXQgPSBpbnRlcm5hbGZvcm1hdCB8fCBwaXhtYXAuaW50ZXJuYWxmb3JtYXRcbiAgICAgIGNoYW5uZWxzID0gY2hhbm5lbHMgfHwgcGl4bWFwLmNoYW5uZWxzXG4gICAgICBuZWVkc1BvbGwgPSBuZWVkc1BvbGwgfHwgcGl4bWFwLm5lZWRzUG9sbFxuICAgICAgbmVlZHNMaXN0ZW5lcnMgPSBuZWVkc0xpc3RlbmVycyB8fCBwaXhtYXAubmVlZHNMaXN0ZW5lcnNcbiAgICAgIGNvbXByZXNzZWQgPSBjb21wcmVzc2VkIHx8IHBpeG1hcC5jb21wcmVzc2VkXG5cbiAgICAgIHZhciBtaXBsZXZlbCA9IHBpeG1hcC5taXBsZXZlbFxuICAgICAgdmFyIHRhcmdldCA9IHBpeG1hcC50YXJnZXRcbiAgICAgIGhhc01pcCA9IGhhc01pcCB8fCAobWlwbGV2ZWwgPiAwKVxuICAgICAgaWYgKHRhcmdldCA9PT0gR0xfVEVYVFVSRV8yRCkge1xuICAgICAgICBtaXBNYXNrMkQgfD0gKDEgPDwgbWlwbGV2ZWwpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgZmFjZSA9IHRhcmdldCAtIEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWFxuICAgICAgICBtaXBNYXNrQ3ViZVtmYWNlXSB8PSAoMSA8PCBtaXBsZXZlbClcbiAgICAgICAgY3ViZU1hc2sgfD0gKDEgPDwgZmFjZSlcbiAgICAgIH1cbiAgICB9XG5cbiAgICBwYXJhbXMubmVlZHNQb2xsID0gbmVlZHNQb2xsXG4gICAgcGFyYW1zLm5lZWRzTGlzdGVuZXJzID0gbmVlZHNMaXN0ZW5lcnNcbiAgICBwYXJhbXMud2lkdGggPSB3aWR0aFxuICAgIHBhcmFtcy5oZWlnaHQgPSBoZWlnaHRcbiAgICBwYXJhbXMuZm9ybWF0ID0gZm9ybWF0XG4gICAgcGFyYW1zLmludGVybmFsZm9ybWF0ID0gaW50ZXJuYWxmb3JtYXRcbiAgICBwYXJhbXMudHlwZSA9IHR5cGVcblxuICAgIHZhciBtaXBNYXNrID0gaGFzTWlwID8gKHdpZHRoIDw8IDEpIC0gMSA6IDFcbiAgICBpZiAocGFyYW1zLnRhcmdldCA9PT0gR0xfVEVYVFVSRV8yRCkge1xuICAgICAgXG4gICAgICBcbiAgICB9IGVsc2Uge1xuICAgICAgXG4gICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgIFxuICAgICAgfVxuICAgIH1cblxuICAgIHZhciBtaXBGaWx0ZXIgPSAoTUlQTUFQX0ZJTFRFUlMuaW5kZXhPZihwYXJhbXMubWluRmlsdGVyKSA+PSAwKVxuICAgIHBhcmFtcy5nZW5NaXBtYXBzID0gIWhhc01pcCAmJiAocGFyYW1zLmdlbk1pcG1hcHMgfHwgbWlwRmlsdGVyKVxuICAgIHZhciB1c2VNaXBtYXBzID0gaGFzTWlwIHx8IHBhcmFtcy5nZW5NaXBtYXBzXG5cbiAgICBpZiAoIXBhcmFtcy5taW5GaWx0ZXIpIHtcbiAgICAgIHBhcmFtcy5taW5GaWx0ZXIgPSB1c2VNaXBtYXBzXG4gICAgICAgID8gR0xfTElORUFSX01JUE1BUF9MSU5FQVJcbiAgICAgICAgOiBHTF9ORUFSRVNUXG4gICAgfSBlbHNlIHtcbiAgICAgIFxuICAgIH1cblxuICAgIGlmICh1c2VNaXBtYXBzKSB7XG4gICAgICBcbiAgICB9XG5cbiAgICBpZiAocGFyYW1zLmdlbk1pcG1hcHMpIHtcbiAgICAgIFxuICAgIH1cblxuICAgIHBhcmFtcy53cmFwUyA9IHBhcmFtcy53cmFwUyB8fCBHTF9DTEFNUF9UT19FREdFXG4gICAgcGFyYW1zLndyYXBUID0gcGFyYW1zLndyYXBUIHx8IEdMX0NMQU1QX1RPX0VER0VcbiAgICBpZiAocGFyYW1zLndyYXBTICE9PSBHTF9DTEFNUF9UT19FREdFIHx8XG4gICAgICAgIHBhcmFtcy53cmFwVCAhPT0gR0xfQ0xBTVBfVE9fRURHRSkge1xuICAgICAgXG4gICAgfVxuXG4gICAgaWYgKCh0eXBlID09PSBHTF9GTE9BVCAmJiAhZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9mbG9hdF9saW5lYXIpIHx8XG4gICAgICAgICh0eXBlID09PSBHTF9IQUxGX0ZMT0FUX09FUyAmJlxuICAgICAgICAgICFleHRlbnNpb25zLm9lc190ZXh0dXJlX2hhbGZfZmxvYXRfbGluZWFyKSkge1xuICAgICAgXG4gICAgfVxuXG4gICAgZm9yIChpID0gMDsgaSA8IHBpeGVscy5sZW5ndGg7ICsraSkge1xuICAgICAgcGl4bWFwID0gcGl4ZWxzW2ldXG4gICAgICB2YXIgbGV2ZWwgPSBwaXhtYXAubWlwbGV2ZWxcbiAgICAgIGlmIChwaXhtYXAud2lkdGgpIHtcbiAgICAgICAgXG4gICAgICB9XG4gICAgICBpZiAocGl4bWFwLmhlaWdodCkge1xuICAgICAgICBcbiAgICAgIH1cbiAgICAgIGlmIChwaXhtYXAuY2hhbm5lbHMpIHtcbiAgICAgICAgXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwaXhtYXAuY2hhbm5lbHMgPSBjaGFubmVsc1xuICAgICAgfVxuICAgICAgaWYgKHBpeG1hcC5mb3JtYXQpIHtcbiAgICAgICAgXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwaXhtYXAuZm9ybWF0ID0gZm9ybWF0XG4gICAgICB9XG4gICAgICBpZiAocGl4bWFwLmludGVybmFsZm9ybWF0KSB7XG4gICAgICAgIFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGl4bWFwLmludGVybmFsZm9ybWF0ID0gaW50ZXJuYWxmb3JtYXRcbiAgICAgIH1cbiAgICAgIGlmIChwaXhtYXAudHlwZSkge1xuICAgICAgICBcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBpeG1hcC50eXBlID0gdHlwZVxuICAgICAgfVxuICAgICAgaWYgKHBpeG1hcC5jb3B5KSB7XG4gICAgICAgIFxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHZhciBhY3RpdmVUZXh0dXJlID0gMFxuICB2YXIgdGV4dHVyZUNvdW50ID0gMFxuICB2YXIgdGV4dHVyZVNldCA9IHt9XG4gIHZhciBwb2xsU2V0ID0gW11cbiAgdmFyIG51bVRleFVuaXRzID0gbGltaXRzLm1heFRleHR1cmVVbml0c1xuICB2YXIgdGV4dHVyZVVuaXRzID0gQXJyYXkobnVtVGV4VW5pdHMpLm1hcChmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIG51bGxcbiAgfSlcblxuICBmdW5jdGlvbiBSRUdMVGV4dHVyZSAodGFyZ2V0KSB7XG4gICAgdGhpcy5pZCA9IHRleHR1cmVDb3VudCsrXG4gICAgdGhpcy5yZWZDb3VudCA9IDFcblxuICAgIHRoaXMudGFyZ2V0ID0gdGFyZ2V0XG4gICAgdGhpcy50ZXh0dXJlID0gbnVsbFxuXG4gICAgdGhpcy5wb2xsSWQgPSAtMVxuXG4gICAgdGhpcy51bml0ID0gLTFcbiAgICB0aGlzLmJpbmRDb3VudCA9IDBcblxuICAgIC8vIGNhbmNlbHMgYWxsIHBlbmRpbmcgY2FsbGJhY2tzXG4gICAgdGhpcy5jYW5jZWxQZW5kaW5nID0gbnVsbFxuXG4gICAgLy8gcGFyc2VkIHVzZXIgaW5wdXRzXG4gICAgdGhpcy5wYXJhbXMgPSBuZXcgVGV4UGFyYW1zKHRhcmdldClcbiAgICB0aGlzLnBpeGVscyA9IFtdXG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGUgKHRleHR1cmUsIG9wdGlvbnMpIHtcbiAgICB2YXIgaVxuICAgIGNsZWFyTGlzdGVuZXJzKHRleHR1cmUpXG5cbiAgICAvLyBDbGVhciBwYXJhbWV0ZXJzIGFuZCBwaXhlbCBkYXRhXG4gICAgdmFyIHBhcmFtcyA9IHRleHR1cmUucGFyYW1zXG4gICAgVGV4UGFyYW1zLmNhbGwocGFyYW1zLCB0ZXh0dXJlLnRhcmdldClcbiAgICB2YXIgcGl4ZWxzID0gdGV4dHVyZS5waXhlbHNcbiAgICBwaXhlbHMubGVuZ3RoID0gMFxuXG4gICAgLy8gcGFyc2UgcGFyYW1ldGVyc1xuICAgIHBhcmFtcy5wYXJzZShvcHRpb25zKVxuXG4gICAgLy8gcGFyc2UgcGl4ZWwgZGF0YVxuICAgIGZ1bmN0aW9uIHBhcnNlTWlwICh0YXJnZXQsIGRhdGEpIHtcbiAgICAgIHZhciBtaXBtYXAgPSBkYXRhLm1pcG1hcFxuICAgICAgdmFyIHBpeG1hcFxuICAgICAgaWYgKEFycmF5LmlzQXJyYXkobWlwbWFwKSkge1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG1pcG1hcC5sZW5ndGg7ICsraSkge1xuICAgICAgICAgIHBpeG1hcCA9IG5ldyBQaXhlbEluZm8odGFyZ2V0KVxuICAgICAgICAgIHBpeG1hcC5wYXJzZUZsYWdzKG9wdGlvbnMpXG4gICAgICAgICAgcGl4bWFwLnBhcnNlRmxhZ3MoZGF0YSlcbiAgICAgICAgICBwaXhtYXAucGFyc2UobWlwbWFwW2ldLCBpKVxuICAgICAgICAgIHBpeGVscy5wdXNoKHBpeG1hcClcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGl4bWFwID0gbmV3IFBpeGVsSW5mbyh0YXJnZXQpXG4gICAgICAgIHBpeG1hcC5wYXJzZUZsYWdzKG9wdGlvbnMpXG4gICAgICAgIHBpeG1hcC5wYXJzZShkYXRhLCAwKVxuICAgICAgICBwaXhlbHMucHVzaChwaXhtYXApXG4gICAgICB9XG4gICAgfVxuICAgIGlmICh0ZXh0dXJlLnRhcmdldCA9PT0gR0xfVEVYVFVSRV8yRCkge1xuICAgICAgcGFyc2VNaXAoR0xfVEVYVFVSRV8yRCwgb3B0aW9ucylcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGZhY2VzID0gb3B0aW9ucy5mYWNlcyB8fCBvcHRpb25zXG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShmYWNlcykpIHtcbiAgICAgICAgXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCA2OyArK2kpIHtcbiAgICAgICAgICBwYXJzZU1pcChHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1ggKyBpLCBmYWNlc1tpXSlcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZmFjZXMgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIC8vIFRPRE8gUmVhZCBkZHNcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIEluaXRpYWxpemUgdG8gYWxsIGVtcHR5IHRleHR1cmVzXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCA2OyArK2kpIHtcbiAgICAgICAgICBwYXJzZU1pcChHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1ggKyBpLCB7fSlcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIGRvIGEgc2Vjb25kIHBhc3MgdG8gcmVjb25jaWxlIGRlZmF1bHRzXG4gICAgY2hlY2tUZXh0dXJlQ29tcGxldGUocGFyYW1zLCBwaXhlbHMpXG5cbiAgICBpZiAocGFyYW1zLm5lZWRzTGlzdGVuZXJzKSB7XG4gICAgICBob29rTGlzdGVuZXJzKHRleHR1cmUpXG4gICAgfVxuXG4gICAgaWYgKHBhcmFtcy5uZWVkc1BvbGwpIHtcbiAgICAgIHRleHR1cmUucG9sbElkID0gcG9sbFNldC5sZW5ndGhcbiAgICAgIHBvbGxTZXQucHVzaCh0ZXh0dXJlKVxuICAgIH1cblxuICAgIHJlZnJlc2godGV4dHVyZSlcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlZnJlc2ggKHRleHR1cmUpIHtcbiAgICBpZiAoIWdsLmlzVGV4dHVyZSh0ZXh0dXJlLnRleHR1cmUpKSB7XG4gICAgICB0ZXh0dXJlLnRleHR1cmUgPSBnbC5jcmVhdGVUZXh0dXJlKClcbiAgICB9XG5cbiAgICAvLyBMYXp5IGJpbmRcbiAgICB2YXIgdGFyZ2V0ID0gdGV4dHVyZS50YXJnZXRcbiAgICB2YXIgdW5pdCA9IHRleHR1cmUudW5pdFxuICAgIGlmICh1bml0ID49IDApIHtcbiAgICAgIGdsLmFjdGl2ZVRleHR1cmUoR0xfVEVYVFVSRTAgKyB1bml0KVxuICAgICAgYWN0aXZlVGV4dHVyZSA9IHVuaXRcbiAgICB9IGVsc2Uge1xuICAgICAgZ2wuYmluZFRleHR1cmUodGFyZ2V0LCB0ZXh0dXJlLnRleHR1cmUpXG4gICAgfVxuXG4gICAgLy8gVXBsb2FkXG4gICAgdmFyIHBpeGVscyA9IHRleHR1cmUucGl4ZWxzXG4gICAgdmFyIHBhcmFtcyA9IHRleHR1cmUucGFyYW1zXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwaXhlbHMubGVuZ3RoOyArK2kpIHtcbiAgICAgIHBpeGVsc1tpXS51cGxvYWQocGFyYW1zKVxuICAgIH1cbiAgICBwYXJhbXMudXBsb2FkKClcblxuICAgIC8vIExhenkgdW5iaW5kXG4gICAgaWYgKHVuaXQgPCAwKSB7XG4gICAgICB2YXIgYWN0aXZlID0gdGV4dHVyZVVuaXRzW2FjdGl2ZVRleHR1cmVdXG4gICAgICBpZiAoYWN0aXZlKSB7XG4gICAgICAgIC8vIHJlc3RvcmUgYmluZGluZyBzdGF0ZVxuICAgICAgICBnbC5iaW5kVGV4dHVyZShhY3RpdmUudGFyZ2V0LCBhY3RpdmUudGV4dHVyZSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIG90aGVyd2lzZSBiZWNvbWUgbmV3IGFjdGl2ZVxuICAgICAgICB0ZXh0dXJlLnVuaXQgPSBhY3RpdmVUZXh0dXJlXG4gICAgICAgIHRleHR1cmVVbml0c1thY3RpdmVUZXh0dXJlXSA9IHRleHR1cmVcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBob29rTGlzdGVuZXJzICh0ZXh0dXJlKSB7XG4gICAgdmFyIHBhcmFtcyA9IHRleHR1cmUucGFyYW1zXG4gICAgdmFyIHBpeGVscyA9IHRleHR1cmUucGl4ZWxzXG5cbiAgICAvLyBBcHBlbmRzIGFsbCB0aGUgdGV4dHVyZSBkYXRhIGZyb20gdGhlIGJ1ZmZlciB0byB0aGUgY3VycmVudFxuICAgIGZ1bmN0aW9uIGFwcGVuZEREUyAodGFyZ2V0LCBtaXBsZXZlbCwgYnVmZmVyKSB7XG4gICAgICB2YXIgZGRzID0gcGFyc2VERFMoYnVmZmVyKVxuXG4gICAgICBcblxuICAgICAgaWYgKGRkcy5jdWJlKSB7XG4gICAgICAgIFxuXG4gICAgICAgIC8vIFRPRE8gaGFuZGxlIGN1YmUgbWFwIEREU1xuICAgICAgICBcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIFxuICAgICAgfVxuXG4gICAgICBpZiAobWlwbGV2ZWwpIHtcbiAgICAgICAgXG4gICAgICB9XG5cbiAgICAgIGRkcy5waXhlbHMuZm9yRWFjaChmdW5jdGlvbiAocGl4bWFwKSB7XG4gICAgICAgIHZhciBpbmZvID0gbmV3IFBpeGVsSW5mbyhkZHMuY3ViZSA/IHBpeG1hcC50YXJnZXQgOiB0YXJnZXQpXG5cbiAgICAgICAgaW5mby5jaGFubmVscyA9IGRkcy5jaGFubmVsc1xuICAgICAgICBpbmZvLmNvbXByZXNzZWQgPSBkZHMuY29tcHJlc3NlZFxuICAgICAgICBpbmZvLnR5cGUgPSBkZHMudHlwZVxuICAgICAgICBpbmZvLmludGVybmFsZm9ybWF0ID0gZGRzLmZvcm1hdFxuICAgICAgICBpbmZvLmZvcm1hdCA9IGNvbG9yRm9ybWF0c1tkZHMuZm9ybWF0XVxuXG4gICAgICAgIGluZm8ud2lkdGggPSBwaXhtYXAud2lkdGhcbiAgICAgICAgaW5mby5oZWlnaHQgPSBwaXhtYXAuaGVpZ2h0XG4gICAgICAgIGluZm8ubWlwbGV2ZWwgPSBwaXhtYXAubWlwbGV2ZWwgfHwgbWlwbGV2ZWxcbiAgICAgICAgaW5mby5kYXRhID0gcGl4bWFwLmRhdGFcblxuICAgICAgICBwaXhlbHMucHVzaChpbmZvKVxuICAgICAgfSlcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBvbkRhdGEgKCkge1xuICAgICAgLy8gVXBkYXRlIHNpemUgb2YgYW55IG5ld2x5IGxvYWRlZCBwaXhlbHNcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcGl4ZWxzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgIHZhciBwaXhlbERhdGEgPSBwaXhlbHNbaV1cbiAgICAgICAgdmFyIGltYWdlID0gcGl4ZWxEYXRhLmltYWdlXG4gICAgICAgIHZhciB2aWRlbyA9IHBpeGVsRGF0YS52aWRlb1xuICAgICAgICB2YXIgeGhyID0gcGl4ZWxEYXRhLnhoclxuICAgICAgICBpZiAoaW1hZ2UgJiYgaW1hZ2UuY29tcGxldGUpIHtcbiAgICAgICAgICBwaXhlbERhdGEud2lkdGggPSBpbWFnZS5uYXR1cmFsV2lkdGhcbiAgICAgICAgICBwaXhlbERhdGEuaGVpZ2h0ID0gaW1hZ2UubmF0dXJhbEhlaWdodFxuICAgICAgICB9IGVsc2UgaWYgKHZpZGVvICYmIHZpZGVvLnJlYWR5U3RhdGUgPiAyKSB7XG4gICAgICAgICAgcGl4ZWxEYXRhLndpZHRoID0gdmlkZW8ud2lkdGhcbiAgICAgICAgICBwaXhlbERhdGEuaGVpZ2h0ID0gdmlkZW8uaGVpZ2h0XG4gICAgICAgIH0gZWxzZSBpZiAoeGhyICYmIHhoci5yZWFkeVN0YXRlID09PSA0KSB7XG4gICAgICAgICAgcGl4ZWxzW2ldID0gcGl4ZWxzW3BpeGVscy5sZW5ndGggLSAxXVxuICAgICAgICAgIHBpeGVscy5wb3AoKVxuICAgICAgICAgIHhoci5yZW1vdmVFdmVudExpc3RlbmVyKCdyZWFkeXN0YXRlY2hhbmdlJywgcmVmcmVzaClcbiAgICAgICAgICBhcHBlbmRERFMocGl4ZWxEYXRhLnRhcmdldCwgcGl4ZWxEYXRhLm1pcGxldmVsLCB4aHIucmVzcG9uc2UpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGNoZWNrVGV4dHVyZUNvbXBsZXRlKHBhcmFtcywgcGl4ZWxzKVxuICAgICAgcmVmcmVzaCh0ZXh0dXJlKVxuICAgIH1cblxuICAgIHBpeGVscy5mb3JFYWNoKGZ1bmN0aW9uIChwaXhlbERhdGEpIHtcbiAgICAgIGlmIChwaXhlbERhdGEuaW1hZ2UgJiYgIXBpeGVsRGF0YS5pbWFnZS5jb21wbGV0ZSkge1xuICAgICAgICBwaXhlbERhdGEuaW1hZ2UuYWRkRXZlbnRMaXN0ZW5lcignbG9hZCcsIG9uRGF0YSlcbiAgICAgIH0gZWxzZSBpZiAocGl4ZWxEYXRhLnZpZGVvICYmIHBpeGVsRGF0YS5yZWFkeVN0YXRlIDwgMSkge1xuICAgICAgICBwaXhlbERhdGEudmlkZW8uYWRkRXZlbnRMaXN0ZW5lcigncHJvZ3Jlc3MnLCBvbkRhdGEpXG4gICAgICB9IGVsc2UgaWYgKHBpeGVsRGF0YS54aHIpIHtcbiAgICAgICAgcGl4ZWxEYXRhLnhoci5hZGRFdmVudExpc3RlbmVyKCdyZWFkeXN0YXRlY2hhbmdlJywgb25EYXRhKVxuICAgICAgfVxuICAgIH0pXG5cbiAgICB0ZXh0dXJlLmNhbmNlbFBlbmRpbmcgPSBmdW5jdGlvbiBkZXRhY2hMaXN0ZW5lcnMgKCkge1xuICAgICAgcGl4ZWxzLmZvckVhY2goZnVuY3Rpb24gKHBpeGVsRGF0YSkge1xuICAgICAgICBpZiAocGl4ZWxEYXRhLmltYWdlKSB7XG4gICAgICAgICAgcGl4ZWxEYXRhLmltYWdlLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2xvYWQnLCBvbkRhdGEpXG4gICAgICAgIH0gZWxzZSBpZiAocGl4ZWxEYXRhLnZpZGVvKSB7XG4gICAgICAgICAgcGl4ZWxEYXRhLnZpZGVvLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3Byb2dyZXNzJywgb25EYXRhKVxuICAgICAgICB9IGVsc2UgaWYgKHBpeGVsRGF0YS54aHIpIHtcbiAgICAgICAgICBwaXhlbERhdGEueGhyLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3JlYWR5c3RhdGVjaGFuZ2UnLCBvbkRhdGEpXG4gICAgICAgICAgcGl4ZWxEYXRhLnhoci5hYm9ydCgpXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gY2xlYXJMaXN0ZW5lcnMgKHRleHR1cmUpIHtcbiAgICB2YXIgY2FuY2VsUGVuZGluZyA9IHRleHR1cmUuY2FuY2VsUGVuZGluZ1xuICAgIGlmIChjYW5jZWxQZW5kaW5nKSB7XG4gICAgICBjYW5jZWxQZW5kaW5nKClcbiAgICAgIHRleHR1cmUuY2FuY2VsUGVuZGluZyA9IG51bGxcbiAgICB9XG4gICAgdmFyIGlkID0gdGV4dHVyZS5wb2xsSWRcbiAgICBpZiAoaWQgPj0gMCkge1xuICAgICAgdmFyIG90aGVyID0gcG9sbFNldFtpZF0gPSBwb2xsU2V0W3BvbGxTZXQubGVuZ3RoIC0gMV1cbiAgICAgIG90aGVyLmlkID0gaWRcbiAgICAgIHBvbGxTZXQucG9wKClcbiAgICAgIHRleHR1cmUucG9sbElkID0gLTFcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95ICh0ZXh0dXJlKSB7XG4gICAgdmFyIGhhbmRsZSA9IHRleHR1cmUudGV4dHVyZVxuICAgIFxuICAgIHZhciB1bml0ID0gdGV4dHVyZS51bml0XG4gICAgdmFyIHRhcmdldCA9IHRleHR1cmUudGFyZ2V0XG4gICAgaWYgKHVuaXQgPj0gMCkge1xuICAgICAgZ2wuYWN0aXZlVGV4dHVyZShHTF9URVhUVVJFMCArIHVuaXQpXG4gICAgICBhY3RpdmVUZXh0dXJlID0gdW5pdFxuICAgICAgZ2wuYmluZFRleHR1cmUodGFyZ2V0LCBudWxsKVxuICAgICAgdGV4dHVyZVVuaXRzW3VuaXRdID0gbnVsbFxuICAgIH1cbiAgICBjbGVhckxpc3RlbmVycyh0ZXh0dXJlKVxuICAgIGlmIChnbC5pc1RleHR1cmUoaGFuZGxlKSkge1xuICAgICAgZ2wuZGVsZXRlVGV4dHVyZShoYW5kbGUpXG4gICAgfVxuICAgIHRleHR1cmUudGV4dHVyZSA9IG51bGxcbiAgICB0ZXh0dXJlLnBhcmFtcyA9IG51bGxcbiAgICB0ZXh0dXJlLnBpeGVscyA9IG51bGxcbiAgICB0ZXh0dXJlLnJlZkNvdW50ID0gMFxuICAgIGRlbGV0ZSB0ZXh0dXJlU2V0W3RleHR1cmUuaWRdXG4gIH1cblxuICBleHRlbmQoUkVHTFRleHR1cmUucHJvdG90eXBlLCB7XG4gICAgYmluZDogZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIHRleHR1cmUgPSB0aGlzXG4gICAgICB0ZXh0dXJlLmJpbmRDb3VudCArPSAxXG4gICAgICB2YXIgdW5pdCA9IHRleHR1cmUudW5pdFxuICAgICAgaWYgKHVuaXQgPCAwKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbnVtVGV4VW5pdHM7ICsraSkge1xuICAgICAgICAgIHZhciBvdGhlciA9IHRleHR1cmVVbml0c1tpXVxuICAgICAgICAgIGlmIChvdGhlcikge1xuICAgICAgICAgICAgaWYgKG90aGVyLmJpbmRDb3VudCA+IDApIHtcbiAgICAgICAgICAgICAgY29udGludWVcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG90aGVyLnVuaXQgPSAtMVxuICAgICAgICAgIH1cbiAgICAgICAgICB0ZXh0dXJlVW5pdHNbaV0gPSB0ZXh0dXJlXG4gICAgICAgICAgdW5pdCA9IGlcbiAgICAgICAgICBicmVha1xuICAgICAgICB9XG4gICAgICAgIGlmICh1bml0ID49IG51bVRleFVuaXRzKSB7XG4gICAgICAgICAgXG4gICAgICAgIH1cbiAgICAgICAgdGV4dHVyZS51bml0ID0gdW5pdFxuICAgICAgICBnbC5hY3RpdmVUZXh0dXJlKEdMX1RFWFRVUkUwICsgdW5pdClcbiAgICAgICAgZ2wuYmluZFRleHR1cmUodGV4dHVyZS50YXJnZXQsIHRleHR1cmUudGV4dHVyZSlcbiAgICAgICAgYWN0aXZlVGV4dHVyZSA9IHVuaXRcbiAgICAgIH1cbiAgICAgIHJldHVybiB1bml0XG4gICAgfSxcblxuICAgIHVuYmluZDogZnVuY3Rpb24gKCkge1xuICAgICAgdGhpcy5iaW5kQ291bnQgLT0gMVxuICAgIH0sXG5cbiAgICBkZWNSZWY6IGZ1bmN0aW9uICgpIHtcbiAgICAgIGlmICgtLXRoaXMucmVmQ291bnQgPT09IDApIHtcbiAgICAgICAgZGVzdHJveSh0aGlzKVxuICAgICAgfVxuICAgIH1cbiAgfSlcblxuICBmdW5jdGlvbiBjcmVhdGVUZXh0dXJlIChvcHRpb25zLCB0YXJnZXQpIHtcbiAgICB2YXIgdGV4dHVyZSA9IG5ldyBSRUdMVGV4dHVyZSh0YXJnZXQpXG4gICAgdGV4dHVyZVNldFt0ZXh0dXJlLmlkXSA9IHRleHR1cmVcblxuICAgIGZ1bmN0aW9uIHJlZ2xUZXh0dXJlIChhMCwgYTEsIGEyLCBhMywgYTQsIGE1KSB7XG4gICAgICB2YXIgb3B0aW9ucyA9IGEwIHx8IHt9XG4gICAgICBpZiAodGFyZ2V0ID09PSBHTF9URVhUVVJFX0NVQkVfTUFQICYmIGFyZ3VtZW50cy5sZW5ndGggPT09IDYpIHtcbiAgICAgICAgb3B0aW9ucyA9IFthMCwgYTEsIGEyLCBhMywgYTQsIGE1XVxuICAgICAgfVxuICAgICAgdXBkYXRlKHRleHR1cmUsIG9wdGlvbnMpXG4gICAgICByZWdsVGV4dHVyZS53aWR0aCA9IHRleHR1cmUucGFyYW1zLndpZHRoXG4gICAgICByZWdsVGV4dHVyZS5oZWlnaHQgPSB0ZXh0dXJlLnBhcmFtcy5oZWlnaHRcbiAgICAgIHJldHVybiByZWdsVGV4dHVyZVxuICAgIH1cblxuICAgIHJlZ2xUZXh0dXJlKG9wdGlvbnMpXG5cbiAgICByZWdsVGV4dHVyZS5fcmVnbFR5cGUgPSAndGV4dHVyZSdcbiAgICByZWdsVGV4dHVyZS5fdGV4dHVyZSA9IHRleHR1cmVcbiAgICByZWdsVGV4dHVyZS5kZXN0cm95ID0gZnVuY3Rpb24gKCkge1xuICAgICAgdGV4dHVyZS5kZWNSZWYoKVxuICAgIH1cblxuICAgIHJldHVybiByZWdsVGV4dHVyZVxuICB9XG5cbiAgLy8gQ2FsbGVkIGFmdGVyIGNvbnRleHQgcmVzdG9yZVxuICBmdW5jdGlvbiByZWZyZXNoVGV4dHVyZXMgKCkge1xuICAgIHZhbHVlcyh0ZXh0dXJlU2V0KS5mb3JFYWNoKHJlZnJlc2gpXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBudW1UZXhVbml0czsgKytpKSB7XG4gICAgICB0ZXh0dXJlVW5pdHNbaV0gPSBudWxsXG4gICAgfVxuICAgIGFjdGl2ZVRleHR1cmUgPSAwXG4gICAgZ2wuYWN0aXZlVGV4dHVyZShHTF9URVhUVVJFMClcbiAgfVxuXG4gIC8vIENhbGxlZCB3aGVuIHJlZ2wgaXMgZGVzdHJveWVkXG4gIGZ1bmN0aW9uIGRlc3Ryb3lUZXh0dXJlcyAoKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBudW1UZXhVbml0czsgKytpKSB7XG4gICAgICBnbC5hY3RpdmVUZXh0dXJlKEdMX1RFWFRVUkUwICsgaSlcbiAgICAgIGdsLmJpbmRUZXh0dXJlKEdMX1RFWFRVUkVfMkQsIG51bGwpXG4gICAgICB0ZXh0dXJlVW5pdHNbaV0gPSBudWxsXG4gICAgfVxuICAgIGdsLmFjdGl2ZVRleHR1cmUoR0xfVEVYVFVSRTApXG4gICAgYWN0aXZlVGV4dHVyZSA9IDBcbiAgICB2YWx1ZXModGV4dHVyZVNldCkuZm9yRWFjaChkZXN0cm95KVxuICB9XG5cbiAgLy8gQ2FsbGVkIG9uY2UgcGVyIHJhZiwgdXBkYXRlcyB2aWRlbyB0ZXh0dXJlc1xuICBmdW5jdGlvbiBwb2xsVGV4dHVyZXMgKCkge1xuICAgIHBvbGxTZXQuZm9yRWFjaChyZWZyZXNoKVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjcmVhdGU6IGNyZWF0ZVRleHR1cmUsXG4gICAgcmVmcmVzaDogcmVmcmVzaFRleHR1cmVzLFxuICAgIGNsZWFyOiBkZXN0cm95VGV4dHVyZXMsXG4gICAgcG9sbDogcG9sbFRleHR1cmVzLFxuICAgIGdldFRleHR1cmU6IGZ1bmN0aW9uICh3cmFwcGVyKSB7XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cbiAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwVW5pZm9ybVN0YXRlIChzdHJpbmdTdG9yZSkge1xuICB2YXIgdW5pZm9ybVN0YXRlID0ge31cblxuICBmdW5jdGlvbiBkZWZVbmlmb3JtIChuYW1lKSB7XG4gICAgdmFyIGlkID0gc3RyaW5nU3RvcmUuaWQobmFtZSlcbiAgICB2YXIgcmVzdWx0ID0gdW5pZm9ybVN0YXRlW2lkXVxuICAgIGlmICghcmVzdWx0KSB7XG4gICAgICByZXN1bHQgPSB1bmlmb3JtU3RhdGVbaWRdID0gW11cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBkZWY6IGRlZlVuaWZvcm0sXG4gICAgdW5pZm9ybXM6IHVuaWZvcm1TdGF0ZVxuICB9XG59XG4iLCIvKiBnbG9iYWxzIHBlcmZvcm1hbmNlICovXG5tb2R1bGUuZXhwb3J0cyA9XG4gICh0eXBlb2YgcGVyZm9ybWFuY2UgIT09ICd1bmRlZmluZWQnICYmIHBlcmZvcm1hbmNlLm5vdylcbiAgPyBmdW5jdGlvbiAoKSB7IHJldHVybiBwZXJmb3JtYW5jZS5ub3coKSB9XG4gIDogZnVuY3Rpb24gKCkgeyByZXR1cm4gKyhuZXcgRGF0ZSgpKSB9XG4iLCJ2YXIgZXh0ZW5kID0gcmVxdWlyZSgnLi9leHRlbmQnKVxuXG5mdW5jdGlvbiBzbGljZSAoeCkge1xuICByZXR1cm4gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoeClcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjcmVhdGVFbnZpcm9ubWVudCAoKSB7XG4gIC8vIFVuaXF1ZSB2YXJpYWJsZSBpZCBjb3VudGVyXG4gIHZhciB2YXJDb3VudGVyID0gMFxuXG4gIC8vIExpbmtlZCB2YWx1ZXMgYXJlIHBhc3NlZCBmcm9tIHRoaXMgc2NvcGUgaW50byB0aGUgZ2VuZXJhdGVkIGNvZGUgYmxvY2tcbiAgLy8gQ2FsbGluZyBsaW5rKCkgcGFzc2VzIGEgdmFsdWUgaW50byB0aGUgZ2VuZXJhdGVkIHNjb3BlIGFuZCByZXR1cm5zXG4gIC8vIHRoZSB2YXJpYWJsZSBuYW1lIHdoaWNoIGl0IGlzIGJvdW5kIHRvXG4gIHZhciBsaW5rZWROYW1lcyA9IFtdXG4gIHZhciBsaW5rZWRWYWx1ZXMgPSBbXVxuICBmdW5jdGlvbiBsaW5rICh2YWx1ZSkge1xuICAgIHZhciBuYW1lID0gJ2cnICsgKHZhckNvdW50ZXIrKylcbiAgICBsaW5rZWROYW1lcy5wdXNoKG5hbWUpXG4gICAgbGlua2VkVmFsdWVzLnB1c2godmFsdWUpXG4gICAgcmV0dXJuIG5hbWVcbiAgfVxuXG4gIC8vIGNyZWF0ZSBhIGNvZGUgYmxvY2tcbiAgZnVuY3Rpb24gYmxvY2sgKCkge1xuICAgIHZhciBjb2RlID0gW11cbiAgICBmdW5jdGlvbiBwdXNoICgpIHtcbiAgICAgIGNvZGUucHVzaC5hcHBseShjb2RlLCBzbGljZShhcmd1bWVudHMpKVxuICAgIH1cblxuICAgIHZhciB2YXJzID0gW11cbiAgICBmdW5jdGlvbiBkZWYgKCkge1xuICAgICAgdmFyIG5hbWUgPSAndicgKyAodmFyQ291bnRlcisrKVxuICAgICAgdmFycy5wdXNoKG5hbWUpXG5cbiAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb2RlLnB1c2gobmFtZSwgJz0nKVxuICAgICAgICBjb2RlLnB1c2guYXBwbHkoY29kZSwgc2xpY2UoYXJndW1lbnRzKSlcbiAgICAgICAgY29kZS5wdXNoKCc7JylcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG5hbWVcbiAgICB9XG5cbiAgICByZXR1cm4gZXh0ZW5kKHB1c2gsIHtcbiAgICAgIGRlZjogZGVmLFxuICAgICAgdG9TdHJpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAodmFycy5sZW5ndGggPiAwID8gJ3ZhciAnICsgdmFycyArICc7JyA6ICcnKSxcbiAgICAgICAgICBjb2RlLmpvaW4oJycpXG4gICAgICAgIF0uam9pbignJylcbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgLy8gcHJvY2VkdXJlIGxpc3RcbiAgdmFyIHByb2NlZHVyZXMgPSB7fVxuICBmdW5jdGlvbiBwcm9jIChuYW1lKSB7XG4gICAgdmFyIGFyZ3MgPSBbXVxuICAgIGZ1bmN0aW9uIGFyZyAoKSB7XG4gICAgICB2YXIgbmFtZSA9ICdhJyArICh2YXJDb3VudGVyKyspXG4gICAgICBhcmdzLnB1c2gobmFtZSlcbiAgICAgIHJldHVybiBuYW1lXG4gICAgfVxuXG4gICAgdmFyIGJvZHkgPSBibG9jaygpXG4gICAgdmFyIGJvZHlUb1N0cmluZyA9IGJvZHkudG9TdHJpbmdcblxuICAgIHZhciByZXN1bHQgPSBwcm9jZWR1cmVzW25hbWVdID0gZXh0ZW5kKGJvZHksIHtcbiAgICAgIGFyZzogYXJnLFxuICAgICAgdG9TdHJpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAnZnVuY3Rpb24oJywgYXJncy5qb2luKCksICcpeycsXG4gICAgICAgICAgYm9keVRvU3RyaW5nKCksXG4gICAgICAgICAgJ30nXG4gICAgICAgIF0uam9pbignJylcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG5cbiAgZnVuY3Rpb24gY29tcGlsZSAoKSB7XG4gICAgdmFyIGNvZGUgPSBbJ1widXNlIHN0cmljdFwiO3JldHVybiB7J11cbiAgICBPYmplY3Qua2V5cyhwcm9jZWR1cmVzKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICBjb2RlLnB1c2goJ1wiJywgbmFtZSwgJ1wiOicsIHByb2NlZHVyZXNbbmFtZV0udG9TdHJpbmcoKSwgJywnKVxuICAgIH0pXG4gICAgY29kZS5wdXNoKCd9JylcbiAgICB2YXIgcHJvYyA9IEZ1bmN0aW9uLmFwcGx5KG51bGwsIGxpbmtlZE5hbWVzLmNvbmNhdChbY29kZS5qb2luKCcnKV0pKVxuICAgIHJldHVybiBwcm9jLmFwcGx5KG51bGwsIGxpbmtlZFZhbHVlcylcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgbGluazogbGluayxcbiAgICBibG9jazogYmxvY2ssXG4gICAgcHJvYzogcHJvYyxcbiAgICBjb21waWxlOiBjb21waWxlXG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGJhc2UsIG9wdHMpIHtcbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhvcHRzKVxuICBmb3IgKHZhciBpID0gMDsgaSA8IGtleXMubGVuZ3RoOyArK2kpIHtcbiAgICBiYXNlW2tleXNbaV1dID0gb3B0c1trZXlzW2ldXVxuICB9XG4gIHJldHVybiBiYXNlXG59XG4iLCJ2YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi9pcy10eXBlZC1hcnJheScpXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaXNOREFycmF5TGlrZSAob2JqKSB7XG4gIHJldHVybiAoXG4gICAgdHlwZW9mIG9iaiA9PT0gJ29iamVjdCcgJiZcbiAgICBBcnJheS5pc0FycmF5KG9iai5zaGFwZSkgJiZcbiAgICBBcnJheS5pc0FycmF5KG9iai5zdHJpZGUpICYmXG4gICAgdHlwZW9mIG9iai5vZmZzZXQgPT09ICdudW1iZXInICYmXG4gICAgb2JqLnNoYXBlLmxlbmd0aCA9PT0gb2JqLnN0cmlkZS5sZW5ndGggJiZcbiAgICAoQXJyYXkuaXNBcnJheShvYmouZGF0YSkgfHxcbiAgICAgIGlzVHlwZWRBcnJheShvYmouZGF0YSkpKVxufVxuIiwidmFyIGR0eXBlcyA9IHJlcXVpcmUoJy4uL2NvbnN0YW50cy9hcnJheXR5cGVzLmpzb24nKVxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoeCkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHgpIGluIGR0eXBlc1xufVxuIiwiLyogZ2xvYmFscyBkb2N1bWVudCwgSW1hZ2UsIFhNTEh0dHBSZXF1ZXN0ICovXG5cbm1vZHVsZS5leHBvcnRzID0gbG9hZFRleHR1cmVcblxuZnVuY3Rpb24gZ2V0RXh0ZW5zaW9uICh1cmwpIHtcbiAgdmFyIHBhcnRzID0gL1xcLihcXHcrKShcXD8uKik/JC8uZXhlYyh1cmwpXG4gIGlmIChwYXJ0cyAmJiBwYXJ0c1sxXSkge1xuICAgIHJldHVybiBwYXJ0c1sxXS50b0xvd2VyQ2FzZSgpXG4gIH1cbn1cblxuZnVuY3Rpb24gaXNWaWRlb0V4dGVuc2lvbiAodXJsKSB7XG4gIHJldHVybiBbXG4gICAgJ2F2aScsXG4gICAgJ2FzZicsXG4gICAgJ2dpZnYnLFxuICAgICdtb3YnLFxuICAgICdxdCcsXG4gICAgJ3l1dicsXG4gICAgJ21wZycsXG4gICAgJ21wZWcnLFxuICAgICdtMnYnLFxuICAgICdtcDQnLFxuICAgICdtNHAnLFxuICAgICdtNHYnLFxuICAgICdvZ2cnLFxuICAgICdvZ3YnLFxuICAgICd2b2InLFxuICAgICd3ZWJtJyxcbiAgICAnd212J1xuICBdLmluZGV4T2YodXJsKSA+PSAwXG59XG5cbmZ1bmN0aW9uIGlzQ29tcHJlc3NlZEV4dGVuc2lvbiAodXJsKSB7XG4gIHJldHVybiBbXG4gICAgJ2RkcydcbiAgXS5pbmRleE9mKHVybCkgPj0gMFxufVxuXG5mdW5jdGlvbiBsb2FkVmlkZW8gKHVybCwgY3Jvc3NPcmlnaW4pIHtcbiAgdmFyIHZpZGVvID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndmlkZW8nKVxuICB2aWRlby5hdXRvcGxheSA9IHRydWVcbiAgdmlkZW8ubG9vcCA9IHRydWVcbiAgaWYgKGNyb3NzT3JpZ2luKSB7XG4gICAgdmlkZW8uY3Jvc3NPcmlnaW4gPSBjcm9zc09yaWdpblxuICB9XG4gIHZpZGVvLnNyYyA9IHVybFxuICByZXR1cm4gdmlkZW9cbn1cblxuZnVuY3Rpb24gbG9hZENvbXByZXNzZWRUZXh0dXJlICh1cmwsIGV4dCwgY3Jvc3NPcmlnaW4pIHtcbiAgdmFyIHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpXG4gIHhoci5yZXNwb25zZVR5cGUgPSAnYXJyYXlidWZmZXInXG4gIHhoci5vcGVuKCdHRVQnLCB1cmwsIHRydWUpXG4gIHhoci5zZW5kKClcbiAgcmV0dXJuIHhoclxufVxuXG5mdW5jdGlvbiBsb2FkSW1hZ2UgKHVybCwgY3Jvc3NPcmlnaW4pIHtcbiAgdmFyIGltYWdlID0gbmV3IEltYWdlKClcbiAgaWYgKGNyb3NzT3JpZ2luKSB7XG4gICAgaW1hZ2UuY3Jvc3NPcmlnaW4gPSBjcm9zc09yaWdpblxuICB9XG4gIGltYWdlLnNyYyA9IHVybFxuICByZXR1cm4gaW1hZ2Vcbn1cblxuLy8gQ3VycmVudGx5IHRoaXMgc3R1ZmYgb25seSB3b3JrcyBpbiBhIERPTSBlbnZpcm9ubWVudFxuZnVuY3Rpb24gbG9hZFRleHR1cmUgKHVybCwgY3Jvc3NPcmlnaW4pIHtcbiAgaWYgKHR5cGVvZiBkb2N1bWVudCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICB2YXIgZXh0ID0gZ2V0RXh0ZW5zaW9uKHVybClcbiAgICBpZiAoaXNWaWRlb0V4dGVuc2lvbihleHQpKSB7XG4gICAgICByZXR1cm4gbG9hZFZpZGVvKHVybCwgY3Jvc3NPcmlnaW4pXG4gICAgfVxuICAgIGlmIChpc0NvbXByZXNzZWRFeHRlbnNpb24oZXh0KSkge1xuICAgICAgcmV0dXJuIGxvYWRDb21wcmVzc2VkVGV4dHVyZSh1cmwsIGV4dCwgY3Jvc3NPcmlnaW4pXG4gICAgfVxuICAgIHJldHVybiBsb2FkSW1hZ2UodXJsLCBjcm9zc09yaWdpbilcbiAgfVxuICByZXR1cm4gbnVsbFxufVxuIiwiLy8gUmVmZXJlbmNlczpcbi8vXG4vLyBodHRwOi8vbXNkbi5taWNyb3NvZnQuY29tL2VuLXVzL2xpYnJhcnkvYmI5NDM5OTEuYXNweC9cbi8vIGh0dHA6Ly9ibG9nLnRvamljb2RlLmNvbS8yMDExLzEyL2NvbXByZXNzZWQtdGV4dHVyZXMtaW4td2ViZ2wuaHRtbFxuLy9cblxuXG5tb2R1bGUuZXhwb3J0cyA9IHBhcnNlRERTXG5cbnZhciBERFNfTUFHSUMgPSAweDIwNTM0NDQ0XG5cbnZhciBHTF9URVhUVVJFXzJEID0gMHgwREUxXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YID0gMHg4NTE1XG5cbnZhciBHTF9DT01QUkVTU0VEX1JHQl9TM1RDX0RYVDFfRVhUID0gMHg4M0YwXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUMV9FWFQgPSAweDgzRjFcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQzX0VYVCA9IDB4ODNGMlxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDVfRVhUID0gMHg4M0YzXG5cbnZhciBHTF9DT01QUkVTU0VEX1JHQl9FVEMxX1dFQkdMID0gMHg4RDY0XG5cbnZhciBHTF9VTlNJR05FRF9CWVRFID0gMHgxNDAxXG4vLyB2YXIgR0xfSEFMRl9GTE9BVF9PRVMgPSAweDhENjFcbi8vIHZhciBHTF9GTE9BVCA9IDB4MTQwNlxuXG52YXIgRERTRF9NSVBNQVBDT1VOVCA9IDB4MjAwMDBcblxudmFyIEREU0NBUFMyX0NVQkVNQVAgPSAweDIwMFxudmFyIEREU0NBUFMyX0NVQkVNQVBfUE9TSVRJVkVYID0gMHg0MDBcbnZhciBERFNDQVBTMl9DVUJFTUFQX05FR0FUSVZFWCA9IDB4ODAwXG52YXIgRERTQ0FQUzJfQ1VCRU1BUF9QT1NJVElWRVkgPSAweDEwMDBcbnZhciBERFNDQVBTMl9DVUJFTUFQX05FR0FUSVZFWSA9IDB4MjAwMFxudmFyIEREU0NBUFMyX0NVQkVNQVBfUE9TSVRJVkVaID0gMHg0MDAwXG52YXIgRERTQ0FQUzJfQ1VCRU1BUF9ORUdBVElWRVogPSAweDgwMDBcblxudmFyIENVQkVNQVBfQ09NUExFVEVfRkFDRVMgPSAoXG4gIEREU0NBUFMyX0NVQkVNQVBfUE9TSVRJVkVYIHxcbiAgRERTQ0FQUzJfQ1VCRU1BUF9ORUdBVElWRVggfFxuICBERFNDQVBTMl9DVUJFTUFQX1BPU0lUSVZFWSB8XG4gIEREU0NBUFMyX0NVQkVNQVBfTkVHQVRJVkVZIHxcbiAgRERTQ0FQUzJfQ1VCRU1BUF9QT1NJVElWRVogfFxuICBERFNDQVBTMl9DVUJFTUFQX05FR0FUSVZFWilcblxudmFyIEREUEZfRk9VUkNDID0gMHg0XG52YXIgRERQRl9SR0IgPSAweDQwXG5cbnZhciBGT1VSQ0NfRFhUMSA9IDB4MzE1NDU4NDRcbnZhciBGT1VSQ0NfRFhUMyA9IDB4MzM1NDU4NDRcbnZhciBGT1VSQ0NfRFhUNSA9IDB4MzU1NDU4NDRcbnZhciBGT1VSQ0NfRVRDMSA9IDB4MzE0MzU0NDVcblxuLy8gRERTX0hFQURFUiB7XG52YXIgT0ZGX1NJWkUgPSAxICAgICAgICAvLyBpbnQzMiBkd1NpemVcbnZhciBPRkZfRkxBR1MgPSAyICAgICAgIC8vIGludDMyIGR3RmxhZ3NcbnZhciBPRkZfSEVJR0hUID0gMyAgICAgIC8vIGludDMyIGR3SGVpZ2h0XG52YXIgT0ZGX1dJRFRIID0gNCAgICAgICAvLyBpbnQzMiBkd1dpZHRoXG4vLyB2YXIgT0ZGX1BJVENIID0gNSAgICAgICAvLyBpbnQzMiBkd1BpdGNoT3JMaW5lYXJTaXplXG4vLyB2YXIgT0ZGX0RFUFRIID0gNiAgICAgICAvLyBpbnQzMiBkd0RlcHRoXG52YXIgT0ZGX01JUE1BUCA9IDcgICAgICAvLyBpbnQzMiBkd01pcE1hcENvdW50OyAvLyBvZmZzZXQ6IDdcbi8vIGludDMyWzExXSBkd1Jlc2VydmVkMVxuLy8gRERTX1BJWEVMRk9STUFUIHtcbi8vIHZhciBPRkZfUEZfU0laRSA9IDE5ICAgIC8vIGludDMyIGR3U2l6ZTsgLy8gb2Zmc2V0OiAxOVxudmFyIE9GRl9QRl9GTEFHUyA9IDIwICAgLy8gaW50MzIgZHdGbGFnc1xudmFyIE9GRl9GT1VSQ0MgPSAyMSAgICAgLy8gY2hhcls0XSBkd0ZvdXJDQ1xuLy8gdmFyIE9GRl9SR0JBX0JJVFMgPSAyMiAgLy8gaW50MzIgZHdSR0JCaXRDb3VudFxuLy8gdmFyIE9GRl9SRURfTUFTSyA9IDIzICAgLy8gaW50MzIgZHdSQml0TWFza1xuLy8gdmFyIE9GRl9HUkVFTl9NQVNLID0gMjQgLy8gaW50MzIgZHdHQml0TWFza1xuLy8gdmFyIE9GRl9CTFVFX01BU0sgPSAyNSAgLy8gaW50MzIgZHdCQml0TWFza1xuLy8gdmFyIE9GRl9BTFBIQV9NQVNLID0gMjYgLy8gaW50MzIgZHdBQml0TWFzazsgLy8gb2Zmc2V0OiAyNlxuLy8gfVxuLy8gdmFyIE9GRl9DQVBTID0gMjcgICAgICAgLy8gaW50MzIgZHdDYXBzOyAvLyBvZmZzZXQ6IDI3XG52YXIgT0ZGX0NBUFMyID0gMjggICAgICAvLyBpbnQzMiBkd0NhcHMyXG4vLyB2YXIgT0ZGX0NBUFMzID0gMjkgICAgICAvLyBpbnQzMiBkd0NhcHMzXG4vLyB2YXIgT0ZGX0NBUFM0ID0gMzAgICAgICAvLyBpbnQzMiBkd0NhcHM0XG4vLyBpbnQzMiBkd1Jlc2VydmVkMiAvLyBvZmZzZXQgMzFcblxuZnVuY3Rpb24gcGFyc2VERFMgKGFycmF5QnVmZmVyKSB7XG4gIHZhciBoZWFkZXIgPSBuZXcgSW50MzJBcnJheShhcnJheUJ1ZmZlcilcbiAgXG5cbiAgdmFyIGZsYWdzID0gaGVhZGVyW09GRl9GTEFHU11cbiAgXG5cbiAgdmFyIHdpZHRoID0gaGVhZGVyW09GRl9XSURUSF1cbiAgdmFyIGhlaWdodCA9IGhlYWRlcltPRkZfSEVJR0hUXVxuXG4gIHZhciB0eXBlID0gR0xfVU5TSUdORURfQllURVxuICB2YXIgZm9ybWF0ID0gMFxuICB2YXIgYmxvY2tCeXRlcyA9IDBcbiAgdmFyIGNoYW5uZWxzID0gNFxuICBzd2l0Y2ggKGhlYWRlcltPRkZfRk9VUkNDXSkge1xuICAgIGNhc2UgRk9VUkNDX0RYVDE6XG4gICAgICBibG9ja0J5dGVzID0gOFxuICAgICAgaWYgKGZsYWdzICYgRERQRl9SR0IpIHtcbiAgICAgICAgY2hhbm5lbHMgPSAzXG4gICAgICAgIGZvcm1hdCA9IEdMX0NPTVBSRVNTRURfUkdCX1MzVENfRFhUMV9FWFRcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGZvcm1hdCA9IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDFfRVhUXG4gICAgICB9XG4gICAgICBicmVha1xuXG4gICAgY2FzZSBGT1VSQ0NfRFhUMzpcbiAgICAgIGJsb2NrQnl0ZXMgPSAxNlxuICAgICAgZm9ybWF0ID0gR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUM19FWFRcbiAgICAgIGJyZWFrXG5cbiAgICBjYXNlIEZPVVJDQ19EWFQ1OlxuICAgICAgYmxvY2tCeXRlcyA9IDE2XG4gICAgICBmb3JtYXQgPSBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQ1X0VYVFxuICAgICAgYnJlYWtcblxuICAgIGNhc2UgRk9VUkNDX0VUQzE6XG4gICAgICBibG9ja0J5dGVzID0gOFxuICAgICAgZm9ybWF0ID0gR0xfQ09NUFJFU1NFRF9SR0JfRVRDMV9XRUJHTFxuICAgICAgYnJlYWtcblxuICAgIC8vIFRPRE86IEltcGxlbWVudCBoZHIgYW5kIHVuY29tcHJlc3NlZCB0ZXh0dXJlc1xuXG4gICAgZGVmYXVsdDpcbiAgICAgIC8vIEhhbmRsZSB1bmNvbXByZXNzZWQgZGF0YSBoZXJlXG4gICAgICBcbiAgfVxuXG4gIHZhciBwaXhlbEZsYWdzID0gaGVhZGVyW09GRl9QRl9GTEFHU11cblxuICB2YXIgbWlwbWFwQ291bnQgPSAxXG4gIGlmIChwaXhlbEZsYWdzICYgRERTRF9NSVBNQVBDT1VOVCkge1xuICAgIG1pcG1hcENvdW50ID0gTWF0aC5tYXgoMSwgaGVhZGVyW09GRl9NSVBNQVBdKVxuICB9XG5cbiAgdmFyIHB0ciA9IGhlYWRlcltPRkZfU0laRV0gKyA0XG5cbiAgdmFyIHJlc3VsdCA9IHtcbiAgICB3aWR0aDogd2lkdGgsXG4gICAgaGVpZ2h0OiBoZWlnaHQsXG4gICAgY2hhbm5lbHM6IGNoYW5uZWxzLFxuICAgIGZvcm1hdDogZm9ybWF0LFxuICAgIHR5cGU6IHR5cGUsXG4gICAgY29tcHJlc3NlZDogdHJ1ZSxcbiAgICBjdWJlOiBmYWxzZSxcbiAgICBwaXhlbHM6IFtdXG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZU1pcHMgKHRhcmdldCkge1xuICAgIHZhciBtaXBXaWR0aCA9IHdpZHRoXG4gICAgdmFyIG1pcEhlaWdodCA9IGhlaWdodFxuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBtaXBtYXBDb3VudDsgKytpKSB7XG4gICAgICB2YXIgc2l6ZSA9XG4gICAgICAgIE1hdGgubWF4KDEsIChtaXBXaWR0aCArIDMpID4+IDIpICpcbiAgICAgICAgTWF0aC5tYXgoMSwgKG1pcEhlaWdodCArIDMpID4+IDIpICpcbiAgICAgICAgYmxvY2tCeXRlc1xuICAgICAgcmVzdWx0LnBpeGVscy5wdXNoKHtcbiAgICAgICAgdGFyZ2V0OiB0YXJnZXQsXG4gICAgICAgIG1pcGxldmVsOiBpLFxuICAgICAgICB3aWR0aDogbWlwV2lkdGgsXG4gICAgICAgIGhlaWdodDogbWlwSGVpZ2h0LFxuICAgICAgICBkYXRhOiBuZXcgVWludDhBcnJheShhcnJheUJ1ZmZlciwgcHRyLCBzaXplKVxuICAgICAgfSlcbiAgICAgIHB0ciArPSBzaXplXG4gICAgICBtaXBXaWR0aCA+Pj0gMVxuICAgICAgbWlwSGVpZ2h0ID4+PSAxXG4gICAgfVxuICB9XG5cbiAgdmFyIGNhcHMyID0gaGVhZGVyW09GRl9DQVBTMl1cbiAgdmFyIGN1YmVtYXAgPSAhIShjYXBzMiAmIEREU0NBUFMyX0NVQkVNQVApXG4gIGlmIChjdWJlbWFwKSB7XG4gICAgXG4gICAgcmVzdWx0LmN1YmUgPSB0cnVlXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCA2OyArK2kpIHtcbiAgICAgIHBhcnNlTWlwcyhHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1ggKyBpKVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBwYXJzZU1pcHMoR0xfVEVYVFVSRV8yRClcbiAgfVxuXG4gIHJldHVybiByZXN1bHRcbn1cbiIsIi8qIGdsb2JhbHMgcmVxdWVzdEFuaW1hdGlvbkZyYW1lLCBjYW5jZWxBbmltYXRpb25GcmFtZSAqL1xuaWYgKHR5cGVvZiByZXF1ZXN0QW5pbWF0aW9uRnJhbWUgPT09ICdmdW5jdGlvbicgJiZcbiAgICB0eXBlb2YgY2FuY2VsQW5pbWF0aW9uRnJhbWUgPT09ICdmdW5jdGlvbicpIHtcbiAgbW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgbmV4dDogZnVuY3Rpb24gKHgpIHsgcmV0dXJuIHJlcXVlc3RBbmltYXRpb25GcmFtZSh4KSB9LFxuICAgIGNhbmNlbDogZnVuY3Rpb24gKHgpIHsgcmV0dXJuIGNhbmNlbEFuaW1hdGlvbkZyYW1lKHgpIH1cbiAgfVxufSBlbHNlIHtcbiAgbW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgbmV4dDogZnVuY3Rpb24gKGNiKSB7XG4gICAgICBzZXRUaW1lb3V0KGNiLCAzMClcbiAgICB9LFxuICAgIGNhbmNlbDogY2xlYXJUaW1lb3V0XG4gIH1cbn1cbiIsIi8vIEEgc3RhY2sgZm9yIG1hbmFnaW5nIHRoZSBzdGF0ZSBvZiBhIHNjYWxhci92ZWN0b3IgcGFyYW1ldGVyXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY3JlYXRlU3RhY2sgKGluaXQsIG9uQ2hhbmdlKSB7XG4gIHZhciBuID0gaW5pdC5sZW5ndGhcbiAgdmFyIHN0YWNrID0gaW5pdC5zbGljZSgpXG4gIHZhciBjdXJyZW50ID0gaW5pdC5zbGljZSgpXG4gIHZhciBkaXJ0eSA9IGZhbHNlXG4gIHZhciBmb3JjZURpcnR5ID0gdHJ1ZVxuXG4gIGZ1bmN0aW9uIHBvbGwgKCkge1xuICAgIHZhciBwdHIgPSBzdGFjay5sZW5ndGggLSBuXG4gICAgaWYgKGRpcnR5IHx8IGZvcmNlRGlydHkpIHtcbiAgICAgIHN3aXRjaCAobikge1xuICAgICAgICBjYXNlIDE6XG4gICAgICAgICAgb25DaGFuZ2Uoc3RhY2tbcHRyXSlcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlIDI6XG4gICAgICAgICAgb25DaGFuZ2Uoc3RhY2tbcHRyXSwgc3RhY2tbcHRyICsgMV0pXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSAzOlxuICAgICAgICAgIG9uQ2hhbmdlKHN0YWNrW3B0cl0sIHN0YWNrW3B0ciArIDFdLCBzdGFja1twdHIgKyAyXSlcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlIDQ6XG4gICAgICAgICAgb25DaGFuZ2Uoc3RhY2tbcHRyXSwgc3RhY2tbcHRyICsgMV0sIHN0YWNrW3B0ciArIDJdLCBzdGFja1twdHIgKyAzXSlcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlIDU6XG4gICAgICAgICAgb25DaGFuZ2Uoc3RhY2tbcHRyXSwgc3RhY2tbcHRyICsgMV0sIHN0YWNrW3B0ciArIDJdLCBzdGFja1twdHIgKyAzXSwgc3RhY2tbcHRyICsgNF0pXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSA2OlxuICAgICAgICAgIG9uQ2hhbmdlKHN0YWNrW3B0cl0sIHN0YWNrW3B0ciArIDFdLCBzdGFja1twdHIgKyAyXSwgc3RhY2tbcHRyICsgM10sIHN0YWNrW3B0ciArIDRdLCBzdGFja1twdHIgKyA1XSlcbiAgICAgICAgICBicmVha1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIG9uQ2hhbmdlLmFwcGx5KG51bGwsIHN0YWNrLnNsaWNlKHB0ciwgc3RhY2subGVuZ3RoKSlcbiAgICAgIH1cbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbjsgKytpKSB7XG4gICAgICAgIGN1cnJlbnRbaV0gPSBzdGFja1twdHIgKyBpXVxuICAgICAgfVxuICAgICAgZm9yY2VEaXJ0eSA9IGRpcnR5ID0gZmFsc2VcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIHB1c2g6IGZ1bmN0aW9uICgpIHtcbiAgICAgIGRpcnR5ID0gZmFsc2VcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbjsgKytpKSB7XG4gICAgICAgIHZhciB4ID0gYXJndW1lbnRzW2ldXG4gICAgICAgIGRpcnR5ID0gZGlydHkgfHwgKHggIT09IGN1cnJlbnRbaV0pXG4gICAgICAgIHN0YWNrLnB1c2goeClcbiAgICAgIH1cbiAgICB9LFxuXG4gICAgcG9wOiBmdW5jdGlvbiAoKSB7XG4gICAgICBkaXJ0eSA9IGZhbHNlXG4gICAgICBzdGFjay5sZW5ndGggLT0gblxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuOyArK2kpIHtcbiAgICAgICAgZGlydHkgPSBkaXJ0eSB8fCAoc3RhY2tbc3RhY2subGVuZ3RoIC0gbiArIGldICE9PSBjdXJyZW50W2ldKVxuICAgICAgfVxuICAgIH0sXG5cbiAgICBwb2xsOiBwb2xsLFxuXG4gICAgc2V0RGlydHk6IGZ1bmN0aW9uICgpIHtcbiAgICAgIGZvcmNlRGlydHkgPSB0cnVlXG4gICAgfVxuICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNvbnZlcnRUb0hhbGZGbG9hdCAoYXJyYXkpIHtcbiAgdmFyIGZsb2F0cyA9IG5ldyBGbG9hdDMyQXJyYXkoYXJyYXkpXG4gIHZhciB1aW50cyA9IG5ldyBVaW50MzJBcnJheShmbG9hdHMuYnVmZmVyKVxuICB2YXIgdXNob3J0cyA9IG5ldyBVaW50MTZBcnJheShhcnJheS5sZW5ndGgpXG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnJheS5sZW5ndGg7ICsraSkge1xuICAgIGlmIChpc05hTihhcnJheVtpXSkpIHtcbiAgICAgIHVzaG9ydHNbaV0gPSAweGZmZmZcbiAgICB9IGVsc2UgaWYgKGFycmF5W2ldID09PSBJbmZpbml0eSkge1xuICAgICAgdXNob3J0c1tpXSA9IDB4N2MwMFxuICAgIH0gZWxzZSBpZiAoYXJyYXlbaV0gPT09IC1JbmZpbml0eSkge1xuICAgICAgdXNob3J0c1tpXSA9IDB4ZmMwMFxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgeCA9IHVpbnRzW2ldXG5cbiAgICAgIHZhciBzZ24gPSAoeCA+Pj4gMzEpIDw8IDE1XG4gICAgICB2YXIgZXhwID0gKCh4IDw8IDEpID4+PiAyNCkgLSAxMjdcbiAgICAgIHZhciBmcmFjID0gKHggPj4gMTMpICYgKCgxIDw8IDEwKSAtIDEpXG5cbiAgICAgIGlmIChleHAgPCAtMjQpIHtcbiAgICAgICAgLy8gcm91bmQgbm9uLXJlcHJlc2VudGFibGUgZGVub3JtYWxzIHRvIDBcbiAgICAgICAgdXNob3J0c1tpXSA9IHNnblxuICAgICAgfSBlbHNlIGlmIChleHAgPCAtMTQpIHtcbiAgICAgICAgLy8gaGFuZGxlIGRlbm9ybWFsc1xuICAgICAgICB2YXIgcyA9IC0xNCAtIGV4cFxuICAgICAgICB1c2hvcnRzW2ldID0gc2duICsgKChmcmFjICsgKDEgPDwgMTApKSA+PiBzKVxuICAgICAgfSBlbHNlIGlmIChleHAgPiAxNSkge1xuICAgICAgICAvLyByb3VuZCBvdmVyZmxvdyB0byArLy0gSW5maW5pdHlcbiAgICAgICAgdXNob3J0c1tpXSA9IHNnbiArIDB4N2MwMFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gb3RoZXJ3aXNlIGNvbnZlcnQgZGlyZWN0bHlcbiAgICAgICAgdXNob3J0c1tpXSA9IHNnbiArICgoZXhwICsgMTUpIDw8IDEwKSArIGZyYWNcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gdXNob3J0c1xufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAob2JqKSB7XG4gIHJldHVybiBPYmplY3Qua2V5cyhvYmopLm1hcChmdW5jdGlvbiAoa2V5KSB7IHJldHVybiBvYmpba2V5XSB9KVxufVxuIiwiXG52YXIgZXh0ZW5kID0gcmVxdWlyZSgnLi9saWIvdXRpbC9leHRlbmQnKVxudmFyIGdldENvbnRleHQgPSByZXF1aXJlKCcuL2xpYi9jb250ZXh0JylcbnZhciBjcmVhdGVTdHJpbmdTdG9yZSA9IHJlcXVpcmUoJy4vbGliL3N0cmluZ3MnKVxudmFyIHdyYXBFeHRlbnNpb25zID0gcmVxdWlyZSgnLi9saWIvZXh0ZW5zaW9uJylcbnZhciB3cmFwTGltaXRzID0gcmVxdWlyZSgnLi9saWIvbGltaXRzJylcbnZhciB3cmFwQnVmZmVycyA9IHJlcXVpcmUoJy4vbGliL2J1ZmZlcicpXG52YXIgd3JhcEVsZW1lbnRzID0gcmVxdWlyZSgnLi9saWIvZWxlbWVudHMnKVxudmFyIHdyYXBUZXh0dXJlcyA9IHJlcXVpcmUoJy4vbGliL3RleHR1cmUnKVxudmFyIHdyYXBSZW5kZXJidWZmZXJzID0gcmVxdWlyZSgnLi9saWIvcmVuZGVyYnVmZmVyJylcbnZhciB3cmFwRnJhbWVidWZmZXJzID0gcmVxdWlyZSgnLi9saWIvZnJhbWVidWZmZXInKVxudmFyIHdyYXBVbmlmb3JtcyA9IHJlcXVpcmUoJy4vbGliL3VuaWZvcm0nKVxudmFyIHdyYXBBdHRyaWJ1dGVzID0gcmVxdWlyZSgnLi9saWIvYXR0cmlidXRlJylcbnZhciB3cmFwU2hhZGVycyA9IHJlcXVpcmUoJy4vbGliL3NoYWRlcicpXG52YXIgd3JhcERyYXcgPSByZXF1aXJlKCcuL2xpYi9kcmF3JylcbnZhciB3cmFwQ29udGV4dCA9IHJlcXVpcmUoJy4vbGliL3N0YXRlJylcbnZhciBjcmVhdGVDb21waWxlciA9IHJlcXVpcmUoJy4vbGliL2NvbXBpbGUnKVxudmFyIHdyYXBSZWFkID0gcmVxdWlyZSgnLi9saWIvcmVhZCcpXG52YXIgZHluYW1pYyA9IHJlcXVpcmUoJy4vbGliL2R5bmFtaWMnKVxudmFyIHJhZiA9IHJlcXVpcmUoJy4vbGliL3V0aWwvcmFmJylcbnZhciBjbG9jayA9IHJlcXVpcmUoJy4vbGliL3V0aWwvY2xvY2snKVxuXG52YXIgR0xfQ09MT1JfQlVGRkVSX0JJVCA9IDE2Mzg0XG52YXIgR0xfREVQVEhfQlVGRkVSX0JJVCA9IDI1NlxudmFyIEdMX1NURU5DSUxfQlVGRkVSX0JJVCA9IDEwMjRcblxudmFyIEdMX0FSUkFZX0JVRkZFUiA9IDM0OTYyXG52YXIgR0xfVEVYVFVSRV8yRCA9IDB4MERFMVxudmFyIEdMX1RFWFRVUkVfQ1VCRV9NQVAgPSAweDg1MTNcblxudmFyIENPTlRFWFRfTE9TVF9FVkVOVCA9ICd3ZWJnbGNvbnRleHRsb3N0J1xudmFyIENPTlRFWFRfUkVTVE9SRURfRVZFTlQgPSAnd2ViZ2xjb250ZXh0cmVzdG9yZWQnXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcFJFR0wgKCkge1xuICB2YXIgYXJncyA9IGdldENvbnRleHQoQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKSlcbiAgdmFyIGdsID0gYXJncy5nbFxuICB2YXIgb3B0aW9ucyA9IGFyZ3Mub3B0aW9uc1xuXG4gIC8vIFVzZSBzdHJpbmcgc3RvcmUgdG8gdHJhY2sgc3RyaW5nIGlkc1xuICB2YXIgc3RyaW5nU3RvcmUgPSBjcmVhdGVTdHJpbmdTdG9yZSgpXG5cbiAgdmFyIGV4dGVuc2lvblN0YXRlID0gd3JhcEV4dGVuc2lvbnMoZ2wpXG4gIHZhciBleHRlbnNpb25zID0gZXh0ZW5zaW9uU3RhdGUuZXh0ZW5zaW9uc1xuXG4gIHZhciB2aWV3cG9ydFN0YXRlID0ge1xuICAgIHdpZHRoOiBnbC5kcmF3aW5nQnVmZmVyV2lkdGgsXG4gICAgaGVpZ2h0OiBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0XG4gIH1cblxuICB2YXIgbGltaXRzID0gd3JhcExpbWl0cyhcbiAgICBnbCxcbiAgICBleHRlbnNpb25zKVxuXG4gIHZhciBidWZmZXJTdGF0ZSA9IHdyYXBCdWZmZXJzKGdsKVxuXG4gIHZhciBlbGVtZW50U3RhdGUgPSB3cmFwRWxlbWVudHMoXG4gICAgZ2wsXG4gICAgZXh0ZW5zaW9ucyxcbiAgICBidWZmZXJTdGF0ZSlcblxuICB2YXIgdW5pZm9ybVN0YXRlID0gd3JhcFVuaWZvcm1zKHN0cmluZ1N0b3JlKVxuXG4gIHZhciBhdHRyaWJ1dGVTdGF0ZSA9IHdyYXBBdHRyaWJ1dGVzKFxuICAgIGdsLFxuICAgIGV4dGVuc2lvbnMsXG4gICAgbGltaXRzLFxuICAgIGJ1ZmZlclN0YXRlLFxuICAgIHN0cmluZ1N0b3JlKVxuXG4gIHZhciBzaGFkZXJTdGF0ZSA9IHdyYXBTaGFkZXJzKFxuICAgIGdsLFxuICAgIGF0dHJpYnV0ZVN0YXRlLFxuICAgIHVuaWZvcm1TdGF0ZSxcbiAgICBmdW5jdGlvbiAocHJvZ3JhbSkge1xuICAgICAgcmV0dXJuIGNvbXBpbGVyLmRyYXcocHJvZ3JhbSlcbiAgICB9LFxuICAgIHN0cmluZ1N0b3JlKVxuXG4gIHZhciBkcmF3U3RhdGUgPSB3cmFwRHJhdyhcbiAgICBnbCxcbiAgICBleHRlbnNpb25zLFxuICAgIGJ1ZmZlclN0YXRlKVxuXG4gIHZhciB0ZXh0dXJlU3RhdGUgPSB3cmFwVGV4dHVyZXMoXG4gICAgZ2wsXG4gICAgZXh0ZW5zaW9ucyxcbiAgICBsaW1pdHMsXG4gICAgcG9sbCxcbiAgICB2aWV3cG9ydFN0YXRlKVxuXG4gIHZhciByZW5kZXJidWZmZXJTdGF0ZSA9IHdyYXBSZW5kZXJidWZmZXJzKFxuICAgIGdsLFxuICAgIGV4dGVuc2lvbnMsXG4gICAgbGltaXRzKVxuXG4gIHZhciBmcmFtZWJ1ZmZlclN0YXRlID0gd3JhcEZyYW1lYnVmZmVycyhcbiAgICBnbCxcbiAgICBleHRlbnNpb25zLFxuICAgIGxpbWl0cyxcbiAgICB0ZXh0dXJlU3RhdGUsXG4gICAgcmVuZGVyYnVmZmVyU3RhdGUpXG5cbiAgdmFyIGZyYW1lU3RhdGUgPSB7XG4gICAgY291bnQ6IDAsXG4gICAgc3RhcnQ6IGNsb2NrKCksXG4gICAgZHQ6IDAsXG4gICAgdDogY2xvY2soKSxcbiAgICByZW5kZXJUaW1lOiAwLFxuICAgIHdpZHRoOiBnbC5kcmF3aW5nQnVmZmVyV2lkdGgsXG4gICAgaGVpZ2h0OiBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0LFxuICAgIHBpeGVsUmF0aW86IG9wdGlvbnMucGl4ZWxSYXRpb1xuICB9XG5cbiAgdmFyIGdsU3RhdGUgPSB3cmFwQ29udGV4dChcbiAgICBnbCxcbiAgICBmcmFtZWJ1ZmZlclN0YXRlLFxuICAgIHZpZXdwb3J0U3RhdGUpXG5cbiAgdmFyIHJlYWRQaXhlbHMgPSB3cmFwUmVhZChnbCwgcG9sbCwgdmlld3BvcnRTdGF0ZSlcblxuICB2YXIgY29tcGlsZXIgPSBjcmVhdGVDb21waWxlcihcbiAgICBnbCxcbiAgICBzdHJpbmdTdG9yZSxcbiAgICBleHRlbnNpb25zLFxuICAgIGxpbWl0cyxcbiAgICBidWZmZXJTdGF0ZSxcbiAgICBlbGVtZW50U3RhdGUsXG4gICAgdGV4dHVyZVN0YXRlLFxuICAgIGZyYW1lYnVmZmVyU3RhdGUsXG4gICAgZ2xTdGF0ZSxcbiAgICB1bmlmb3JtU3RhdGUsXG4gICAgYXR0cmlidXRlU3RhdGUsXG4gICAgc2hhZGVyU3RhdGUsXG4gICAgZHJhd1N0YXRlLFxuICAgIGZyYW1lU3RhdGUsXG4gICAgcG9sbClcblxuICB2YXIgY2FudmFzID0gZ2wuY2FudmFzXG5cbiAgLy8gcmFmIHN0dWZmXG4gIHZhciByYWZDYWxsYmFja3MgPSBbXVxuICB2YXIgYWN0aXZlUkFGID0gMFxuICBmdW5jdGlvbiBoYW5kbGVSQUYgKCkge1xuICAgIGFjdGl2ZVJBRiA9IHJhZi5uZXh0KGhhbmRsZVJBRilcbiAgICBmcmFtZVN0YXRlLmNvdW50ICs9IDFcblxuICAgIGlmIChmcmFtZVN0YXRlLndpZHRoICE9PSBnbC5kcmF3aW5nQnVmZmVyV2lkdGggfHxcbiAgICAgICAgZnJhbWVTdGF0ZS5oZWlnaHQgIT09IGdsLmRyYXdpbmdCdWZmZXJIZWlnaHQpIHtcbiAgICAgIGZyYW1lU3RhdGUud2lkdGggPSBnbC5kcmF3aW5nQnVmZmVyV2lkdGhcbiAgICAgIGZyYW1lU3RhdGUuaGVpZ2h0ID0gZ2wuZHJhd2luZ0J1ZmZlckhlaWdodFxuICAgICAgZ2xTdGF0ZS5ub3RpZnlWaWV3cG9ydENoYW5nZWQoKVxuICAgIH1cblxuICAgIHZhciBub3cgPSBjbG9jaygpXG4gICAgZnJhbWVTdGF0ZS5kdCA9IG5vdyAtIGZyYW1lU3RhdGUudFxuICAgIGZyYW1lU3RhdGUudCA9IG5vd1xuXG4gICAgdGV4dHVyZVN0YXRlLnBvbGwoKVxuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCByYWZDYWxsYmFja3MubGVuZ3RoOyArK2kpIHtcbiAgICAgIHZhciBjYiA9IHJhZkNhbGxiYWNrc1tpXVxuICAgICAgY2IoZnJhbWVTdGF0ZS5jb3VudCwgZnJhbWVTdGF0ZS50LCBmcmFtZVN0YXRlLmR0KVxuICAgIH1cbiAgICBmcmFtZVN0YXRlLnJlbmRlclRpbWUgPSBjbG9jaygpIC0gbm93XG4gIH1cblxuICBmdW5jdGlvbiBzdGFydFJBRiAoKSB7XG4gICAgaWYgKCFhY3RpdmVSQUYgJiYgcmFmQ2FsbGJhY2tzLmxlbmd0aCA+IDApIHtcbiAgICAgIGhhbmRsZVJBRigpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc3RvcFJBRiAoKSB7XG4gICAgaWYgKGFjdGl2ZVJBRikge1xuICAgICAgcmFmLmNhbmNlbChoYW5kbGVSQUYpXG4gICAgICBhY3RpdmVSQUYgPSAwXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaGFuZGxlQ29udGV4dExvc3MgKGV2ZW50KSB7XG4gICAgc3RvcFJBRigpXG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKVxuICAgIGlmIChvcHRpb25zLm9uQ29udGV4dExvc3QpIHtcbiAgICAgIG9wdGlvbnMub25Db250ZXh0TG9zdCgpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaGFuZGxlQ29udGV4dFJlc3RvcmVkIChldmVudCkge1xuICAgIGdsLmdldEVycm9yKClcbiAgICBleHRlbnNpb25TdGF0ZS5yZWZyZXNoKClcbiAgICBidWZmZXJTdGF0ZS5yZWZyZXNoKClcbiAgICB0ZXh0dXJlU3RhdGUucmVmcmVzaCgpXG4gICAgcmVuZGVyYnVmZmVyU3RhdGUucmVmcmVzaCgpXG4gICAgZnJhbWVidWZmZXJTdGF0ZS5yZWZyZXNoKClcbiAgICBzaGFkZXJTdGF0ZS5yZWZyZXNoKClcbiAgICBnbFN0YXRlLnJlZnJlc2goKVxuICAgIGlmIChvcHRpb25zLm9uQ29udGV4dFJlc3RvcmVkKSB7XG4gICAgICBvcHRpb25zLm9uQ29udGV4dFJlc3RvcmVkKClcbiAgICB9XG4gICAgaGFuZGxlUkFGKClcbiAgfVxuXG4gIGlmIChjYW52YXMpIHtcbiAgICBjYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihDT05URVhUX0xPU1RfRVZFTlQsIGhhbmRsZUNvbnRleHRMb3NzLCBmYWxzZSlcbiAgICBjYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihDT05URVhUX1JFU1RPUkVEX0VWRU5ULCBoYW5kbGVDb250ZXh0UmVzdG9yZWQsIGZhbHNlKVxuICB9XG5cbiAgLy8gUmVzb3VyY2UgZGVzdHJ1Y3R1aW9uXG4gIGZ1bmN0aW9uIGRlc3Ryb3kgKCkge1xuICAgIHN0b3BSQUYoKVxuXG4gICAgaWYgKGNhbnZhcykge1xuICAgICAgY2FudmFzLnJlbW92ZUV2ZW50TGlzdGVuZXIoQ09OVEVYVF9MT1NUX0VWRU5ULCBoYW5kbGVDb250ZXh0TG9zcylcbiAgICAgIGNhbnZhcy5yZW1vdmVFdmVudExpc3RlbmVyKENPTlRFWFRfUkVTVE9SRURfRVZFTlQsIGhhbmRsZUNvbnRleHRSZXN0b3JlZClcbiAgICB9XG5cbiAgICBzaGFkZXJTdGF0ZS5jbGVhcigpXG4gICAgZnJhbWVidWZmZXJTdGF0ZS5jbGVhcigpXG4gICAgcmVuZGVyYnVmZmVyU3RhdGUuY2xlYXIoKVxuICAgIHRleHR1cmVTdGF0ZS5jbGVhcigpXG4gICAgYnVmZmVyU3RhdGUuY2xlYXIoKVxuXG4gICAgaWYgKG9wdGlvbnMub25EZXN0cm95KSB7XG4gICAgICBvcHRpb25zLm9uRGVzdHJveSgpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gY29tcGlsZVByb2NlZHVyZSAob3B0aW9ucykge1xuICAgIFxuICAgIFxuXG4gICAgdmFyIGhhc0R5bmFtaWMgPSBmYWxzZVxuXG4gICAgZnVuY3Rpb24gZmxhdHRlbk5lc3RlZE9wdGlvbnMgKG9wdGlvbnMpIHtcbiAgICAgIHZhciByZXN1bHQgPSBleHRlbmQoe30sIG9wdGlvbnMpXG4gICAgICBkZWxldGUgcmVzdWx0LnVuaWZvcm1zXG4gICAgICBkZWxldGUgcmVzdWx0LmF0dHJpYnV0ZXNcblxuICAgICAgZnVuY3Rpb24gbWVyZ2UgKG5hbWUpIHtcbiAgICAgICAgaWYgKG5hbWUgaW4gcmVzdWx0KSB7XG4gICAgICAgICAgdmFyIGNoaWxkID0gcmVzdWx0W25hbWVdXG4gICAgICAgICAgZGVsZXRlIHJlc3VsdFtuYW1lXVxuICAgICAgICAgIE9iamVjdC5rZXlzKGNoaWxkKS5mb3JFYWNoKGZ1bmN0aW9uIChwcm9wKSB7XG4gICAgICAgICAgICByZXN1bHRbbmFtZSArICcuJyArIHByb3BdID0gY2hpbGRbcHJvcF1cbiAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBtZXJnZSgnYmxlbmQnKVxuICAgICAgbWVyZ2UoJ2RlcHRoJylcbiAgICAgIG1lcmdlKCdjdWxsJylcbiAgICAgIG1lcmdlKCdzdGVuY2lsJylcbiAgICAgIG1lcmdlKCdwb2x5Z29uT2Zmc2V0JylcbiAgICAgIG1lcmdlKCdzY2lzc29yJylcbiAgICAgIG1lcmdlKCdzYW1wbGUnKVxuXG4gICAgICByZXR1cm4gcmVzdWx0XG4gICAgfVxuXG4gICAgLy8gRmlyc3Qgd2Ugc2VwYXJhdGUgdGhlIG9wdGlvbnMgaW50byBzdGF0aWMgYW5kIGR5bmFtaWMgY29tcG9uZW50c1xuICAgIGZ1bmN0aW9uIHNlcGFyYXRlRHluYW1pYyAob2JqZWN0KSB7XG4gICAgICB2YXIgc3RhdGljSXRlbXMgPSB7fVxuICAgICAgdmFyIGR5bmFtaWNJdGVtcyA9IHt9XG4gICAgICBPYmplY3Qua2V5cyhvYmplY3QpLmZvckVhY2goZnVuY3Rpb24gKG9wdGlvbikge1xuICAgICAgICB2YXIgdmFsdWUgPSBvYmplY3Rbb3B0aW9uXVxuICAgICAgICBpZiAoZHluYW1pYy5pc0R5bmFtaWModmFsdWUpKSB7XG4gICAgICAgICAgaGFzRHluYW1pYyA9IHRydWVcbiAgICAgICAgICBkeW5hbWljSXRlbXNbb3B0aW9uXSA9IGR5bmFtaWMudW5ib3godmFsdWUsIG9wdGlvbilcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzdGF0aWNJdGVtc1tvcHRpb25dID0gdmFsdWVcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGR5bmFtaWM6IGR5bmFtaWNJdGVtcyxcbiAgICAgICAgc3RhdGljOiBzdGF0aWNJdGVtc1xuICAgICAgfVxuICAgIH1cblxuICAgIHZhciB1bmlmb3JtcyA9IHNlcGFyYXRlRHluYW1pYyhvcHRpb25zLnVuaWZvcm1zIHx8IHt9KVxuICAgIHZhciBhdHRyaWJ1dGVzID0gc2VwYXJhdGVEeW5hbWljKG9wdGlvbnMuYXR0cmlidXRlcyB8fCB7fSlcbiAgICB2YXIgb3B0cyA9IHNlcGFyYXRlRHluYW1pYyhmbGF0dGVuTmVzdGVkT3B0aW9ucyhvcHRpb25zKSlcblxuICAgIHZhciBjb21waWxlZCA9IGNvbXBpbGVyLmNvbW1hbmQoXG4gICAgICBvcHRzLnN0YXRpYywgdW5pZm9ybXMuc3RhdGljLCBhdHRyaWJ1dGVzLnN0YXRpYyxcbiAgICAgIG9wdHMuZHluYW1pYywgdW5pZm9ybXMuZHluYW1pYywgYXR0cmlidXRlcy5keW5hbWljLFxuICAgICAgaGFzRHluYW1pYylcblxuICAgIHZhciBkcmF3ID0gY29tcGlsZWQuZHJhd1xuICAgIHZhciBiYXRjaCA9IGNvbXBpbGVkLmJhdGNoXG4gICAgdmFyIHNjb3BlID0gY29tcGlsZWQuc2NvcGVcblxuICAgIHZhciBFTVBUWV9BUlJBWSA9IFtdXG4gICAgZnVuY3Rpb24gcmVzZXJ2ZSAoY291bnQpIHtcbiAgICAgIHdoaWxlIChFTVBUWV9BUlJBWS5sZW5ndGggPCBjb3VudCkge1xuICAgICAgICBFTVBUWV9BUlJBWS5wdXNoKG51bGwpXG4gICAgICB9XG4gICAgICByZXR1cm4gRU1QVFlfQVJSQVlcbiAgICB9XG5cbiAgICBcblxuICAgIGZ1bmN0aW9uIFJFR0xDb21tYW5kIChhcmdzLCBib2R5KSB7XG4gICAgICBpZiAodHlwZW9mIGFyZ3MgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgcmV0dXJuIHNjb3BlKG51bGwsIGFyZ3MpXG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBib2R5ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHJldHVybiBzY29wZShhcmdzLCBib2R5KVxuICAgICAgfVxuXG4gICAgICAvLyBSdW50aW1lIHNoYWRlciBjaGVjay4gIFJlbW92ZWQgaW4gcHJvZHVjdGlvbiBidWlsZHNcbiAgICAgIFxuXG4gICAgICBpZiAodHlwZW9mIGFyZ3MgPT09ICdudW1iZXInKSB7XG4gICAgICAgIHJldHVybiBiYXRjaChhcmdzIHwgMCwgcmVzZXJ2ZShhcmdzIHwgMCkpXG4gICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoYXJncykpIHtcbiAgICAgICAgcmV0dXJuIGJhdGNoKGFyZ3MubGVuZ3RoLCBhcmdzKVxuICAgICAgfVxuICAgICAgcmV0dXJuIGRyYXcoYXJncylcbiAgICB9XG5cbiAgICByZXR1cm4gUkVHTENvbW1hbmRcbiAgfVxuXG4gIGZ1bmN0aW9uIHBvbGwgKCkge1xuICAgIGZyYW1lYnVmZmVyU3RhdGUucG9sbCgpXG4gICAgZ2xTdGF0ZS5wb2xsKClcbiAgfVxuXG4gIGZ1bmN0aW9uIGNsZWFyIChvcHRpb25zKSB7XG4gICAgdmFyIGNsZWFyRmxhZ3MgPSAwXG5cbiAgICAvLyBVcGRhdGUgY29udGV4dCBzdGF0ZVxuICAgIHBvbGwoKVxuXG4gICAgdmFyIGMgPSBvcHRpb25zLmNvbG9yXG4gICAgaWYgKGMpIHtcbiAgICAgIGdsLmNsZWFyQ29sb3IoK2NbMF0gfHwgMCwgK2NbMV0gfHwgMCwgK2NbMl0gfHwgMCwgK2NbM10gfHwgMClcbiAgICAgIGNsZWFyRmxhZ3MgfD0gR0xfQ09MT1JfQlVGRkVSX0JJVFxuICAgIH1cbiAgICBpZiAoJ2RlcHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICBnbC5jbGVhckRlcHRoKCtvcHRpb25zLmRlcHRoKVxuICAgICAgY2xlYXJGbGFncyB8PSBHTF9ERVBUSF9CVUZGRVJfQklUXG4gICAgfVxuICAgIGlmICgnc3RlbmNpbCcgaW4gb3B0aW9ucykge1xuICAgICAgZ2wuY2xlYXJTdGVuY2lsKG9wdGlvbnMuc3RlbmNpbCB8IDApXG4gICAgICBjbGVhckZsYWdzIHw9IEdMX1NURU5DSUxfQlVGRkVSX0JJVFxuICAgIH1cblxuICAgIFxuICAgIGdsLmNsZWFyKGNsZWFyRmxhZ3MpXG4gIH1cblxuICAvLyBSZWdpc3RlcnMgYW5vdGhlciByZXF1ZXN0QW5pbWF0aW9uRnJhbWUgY2FsbGJhY2tcbiAgZnVuY3Rpb24gZnJhbWUgKGNiKSB7XG4gICAgcmFmQ2FsbGJhY2tzLnB1c2goY2IpXG5cbiAgICBmdW5jdGlvbiBjYW5jZWwgKCkge1xuICAgICAgdmFyIGluZGV4ID0gcmFmQ2FsbGJhY2tzLmZpbmQoZnVuY3Rpb24gKGl0ZW0pIHtcbiAgICAgICAgcmV0dXJuIGl0ZW0gPT09IGNiXG4gICAgICB9KVxuICAgICAgaWYgKGluZGV4IDwgMCkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIHJhZkNhbGxiYWNrcy5zcGxpY2UoaW5kZXgsIDEpXG4gICAgICBpZiAocmFmQ2FsbGJhY2tzLmxlbmd0aCA8PSAwKSB7XG4gICAgICAgIHN0b3BSQUYoKVxuICAgICAgfVxuICAgIH1cblxuICAgIHN0YXJ0UkFGKClcblxuICAgIHJldHVybiB7XG4gICAgICBjYW5jZWw6IGNhbmNlbFxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBleHRlbmQoY29tcGlsZVByb2NlZHVyZSwge1xuICAgIC8vIENsZWFyIGN1cnJlbnQgRkJPXG4gICAgY2xlYXI6IGNsZWFyLFxuXG4gICAgLy8gU2hvcnQgY3V0IGZvciBwcm9wIGJpbmRpbmdcbiAgICBwcm9wOiBkeW5hbWljLmRlZmluZSxcblxuICAgIC8vIGV4ZWN1dGVzIGFuIGVtcHR5IGRyYXcgY29tbWFuZFxuICAgIGRyYXc6IGNvbXBpbGVQcm9jZWR1cmUoe30pLFxuXG4gICAgLy8gUmVzb3VyY2VzXG4gICAgZWxlbWVudHM6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICByZXR1cm4gZWxlbWVudFN0YXRlLmNyZWF0ZShvcHRpb25zKVxuICAgIH0sXG4gICAgYnVmZmVyOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgcmV0dXJuIGJ1ZmZlclN0YXRlLmNyZWF0ZShvcHRpb25zLCBHTF9BUlJBWV9CVUZGRVIpXG4gICAgfSxcbiAgICB0ZXh0dXJlOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgcmV0dXJuIHRleHR1cmVTdGF0ZS5jcmVhdGUob3B0aW9ucywgR0xfVEVYVFVSRV8yRClcbiAgICB9LFxuICAgIGN1YmU6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gNikge1xuICAgICAgICByZXR1cm4gdGV4dHVyZVN0YXRlLmNyZWF0ZShcbiAgICAgICAgICBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpLFxuICAgICAgICAgIEdMX1RFWFRVUkVfQ1VCRV9NQVApXG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gdGV4dHVyZVN0YXRlLmNyZWF0ZShvcHRpb25zLCBHTF9URVhUVVJFX0NVQkVfTUFQKVxuICAgICAgfVxuICAgIH0sXG4gICAgcmVuZGVyYnVmZmVyOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgcmV0dXJuIHJlbmRlcmJ1ZmZlclN0YXRlLmNyZWF0ZShvcHRpb25zKVxuICAgIH0sXG4gICAgZnJhbWVidWZmZXI6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICByZXR1cm4gZnJhbWVidWZmZXJTdGF0ZS5jcmVhdGUob3B0aW9ucylcbiAgICB9LFxuICAgIGZyYW1lYnVmZmVyQ3ViZTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgIFxuICAgIH0sXG5cbiAgICAvLyBGcmFtZSByZW5kZXJpbmdcbiAgICBmcmFtZTogZnJhbWUsXG4gICAgc3RhdHM6IGZyYW1lU3RhdGUsXG5cbiAgICAvLyBTeXN0ZW0gbGltaXRzXG4gICAgbGltaXRzOiBsaW1pdHMsXG5cbiAgICAvLyBSZWFkIHBpeGVsc1xuICAgIHJlYWQ6IHJlYWRQaXhlbHMsXG5cbiAgICAvLyBEZXN0cm95IHJlZ2wgYW5kIGFsbCBhc3NvY2lhdGVkIHJlc291cmNlc1xuICAgIGRlc3Ryb3k6IGRlc3Ryb3lcbiAgfSlcbn1cbiJdfQ==
