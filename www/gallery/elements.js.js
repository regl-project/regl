(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var regl = require('../regl')()

regl.clear({
  color: [0, 0, 0, 1],
  depth: 1
})

regl({
  frag: `
    precision mediump float;
    uniform vec4 color;
    void main() {
      gl_FragColor = color;
    }`,

  vert: `
    precision mediump float;
    attribute vec2 position;
    void main() {
      gl_Position = vec4(position, 0, 1);
    }`,

  attributes: {
    position: regl.buffer((new Array(5)).fill().map(function (x, i) {
      var theta = 2.0 * Math.PI * i / 5
      return [ Math.sin(theta), Math.cos(theta) ]
    }))
  },

  uniforms: {
    color: [1, 0, 0, 1]
  },

  elements: regl.elements([
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 4],
    [1, 2],
    [1, 3],
    [1, 4],
    [2, 3],
    [2, 4],
    [3, 4]
  ]),

  lineWidth: 3
})()

},{"../regl":33}],2:[function(require,module,exports){
var glTypes = require('./constants/dtypes.json')


var GL_FLOAT = 5126

module.exports = function wrapAttributeState (
  gl,
  extensions,
  limits,
  bufferState,
  stringStore) {
  var attributeState = {}

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

  function attributeRecordsEqual (left, right, size) {
    if (!left.pointer) {
      return !right.pointer &&
        left.x === right.x &&
        left.y === right.y &&
        left.z === right.z &&
        left.w === right.w
    } else {
      return right.pointer &&
        left.buffer === right.buffer &&
        left.size === size &&
        left.normalized === right.normalized &&
        left.type === right.type &&
        left.offset === right.offset &&
        left.stride === right.stride &&
        left.divisor === right.divisor
    }
  }

  function setAttributeRecord (left, right, size) {
    var pointer = left.pointer = right.pointer
    if (pointer) {
      left.buffer = right.buffer
      left.size = size
      left.normalized = right.normalized
      left.type = right.type
      left.offset = right.offset
      left.stride = right.stride
      left.divisor = right.divisor
    } else {
      left.x = right.x
      left.y = right.y
      left.z = right.z
      left.w = right.w
    }
  }

  var NUM_ATTRIBUTES = limits.maxAttributes
  var attributeBindings = new Array(NUM_ATTRIBUTES)
  for (var i = 0; i < NUM_ATTRIBUTES; ++i) {
    attributeBindings[i] = new AttributeRecord()
  }

  function AttributeStack (name) {
    this.records = []
    this.name = name
  }

  function stackTop (stack) {
    var records = stack.records
    return records[records.length - 1]
  }

  // ===================================================
  // BIND AN ATTRIBUTE
  // ===================================================
  function bindAttributeRecord (index, current, next, insize) {
    var size = next.size || insize
    if (attributeRecordsEqual(current, next, size)) {
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
    setAttributeRecord(current, next, size)
  }

  function bindAttribute (index, current, attribStack, size) {
    bindAttributeRecord(index, current, stackTop(attribStack), size)
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

  function createAttributeBox (name) {
    var stack = [new AttributeRecord()]
    

    function alloc (data) {
      var box
      if (stack.length <= 0) {
        box = new AttributeRecord()
      } else {
        box = stack.pop()
      }
      if (typeof data === 'number') {
        box.pointer = false
        box.x = data
        box.y = 0
        box.z = 0
        box.w = 0
      } else if (Array.isArray(data)) {
        box.pointer = false
        box.x = data[0]
        box.y = data[1]
        box.z = data[2]
        box.w = data[3]
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
        box.pointer = true
        box.buffer = buffer
        box.size = size
        box.offset = offset
        box.stride = stride
        box.divisor = divisor
        box.normalized = normalized
        box.type = type
      }
      return box
    }

    function free (box) {
      stack.push(box)
    }

    return {
      alloc: alloc,
      free: free
    }
  }

  return {
    bindings: attributeBindings,
    bind: bindAttribute,
    bindRecord: bindAttributeRecord,
    def: defAttribute,
    box: createAttributeBox,
    state: attributeState
  }
}

},{"./constants/dtypes.json":6}],3:[function(require,module,exports){
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
        CUR_ELEMENTS, '.bind();',
        GL, '.drawElements(',
        CUR_PRIMITIVE, ',',
        CUR_COUNT, ',',
        CUR_ELEMENTS, '.type,',
        CUR_OFFSET, ');',
        '}else{',
        GL, '.drawArrays(',
        CUR_PRIMITIVE, ',',
        CUR_OFFSET, ',',
        CUR_COUNT, ');}}')
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
    var BIND_ATTRIBUTE_RECORD = link(attributeState.bindRecord)
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
      for (var i = 0; i < list.length; ++i) {
        if (list[i].name === name) {
          return list[i]
        }
      }
      return null
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
      if (attribute.name in attributes) {
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
        'if(', CUR_ELEMENTS, ')',
        GL, '.bindBuffer(', GL_ELEMENT_ARRAY_BUFFER, ',', CUR_ELEMENTS, '.buffer.buffer);')
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

        case 'primitive':
        case 'offset':
        case 'count':
        case 'elements':
        case 'instances':
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
      var BOX = link(attributeState.box(attribute))
      var ATTRIB_VALUE = dyn(attributes[attribute])
      var RECORD = def(BOX + '.alloc(' + ATTRIB_VALUE + ')')
      batch(BIND_ATTRIBUTE_RECORD, '(',
        data.location, ',',
        link(attributeState.bindings[data.location]), ',',
        RECORD, ',',
        typeLength(data.info.type), ');')
      exit(BOX, '.free(', RECORD, ');')
    })

    // -------------------------------
    // set dynamic attributes
    // -------------------------------

    if (options.count) {
      batch(CUR_COUNT, '=', dyn(options.count), ';')
    }
    if (options.offset) {
      batch(CUR_OFFSET, '=', dyn(options.offset), ';')
    }
    if (options.primitive) {
      batch(
        CUR_PRIMITIVE, '=', link(primTypes), '[', dyn(options.primitive), '];')
    }
    if (instancing && options.instances) {
      batch(CUR_INSTANCES, '=', dyn(options.instances), ';')
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
      batch(CUR_COUNT, '=', CUR_ELEMENTS, '.vertCount;')
    }
    batch('if(', CUR_COUNT, '>0){')
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
      batch(
        'if(', CUR_INSTANCES, '>0){',
        INSTANCE_EXT, '.drawElementsInstancedANGLE(',
        CUR_PRIMITIVE, ',',
        CUR_COUNT, ',',
        CUR_ELEMENTS, '.type,',
        CUR_OFFSET, ',',
        CUR_INSTANCES, ');}else ')
    }
    batch(
      GL, '.drawElements(',
      CUR_PRIMITIVE, ',',
      CUR_COUNT, ',',
      CUR_ELEMENTS, '.type,',
      CUR_OFFSET, ');')
    batch('}}else if(', CUR_COUNT, '>0){')
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
        CUR_COUNT, ');')
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

    Object.keys(staticOptions).sort(optionPriority).forEach(function (param) {
      var value = staticOptions[param]
      switch (param) {
        case 'frag':
        case 'vert':
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
      var data = staticAttributes[attribute]
      var ATTRIBUTE = link(attributeState.def(attribute))
      var BOX = link(attributeState.box(attribute).alloc(data))
      entry(ATTRIBUTE, '.records.push(', BOX, ');')
      exit(ATTRIBUTE, '.records.pop();')
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
      var BOX = link(attributeState.box(attribute))
      dynamicEntry(ATTRIBUTE, '.records.push(',
        BOX, '.alloc(', VALUE, '));')
      dynamicExit(BOX, '.free(', ATTRIBUTE, '.records.pop());')
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

},{"./constants/primitives.json":7,"./util/codegen":23}],5:[function(require,module,exports){
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
  var count = [ -1 ]
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJleGFtcGxlL2VsZW1lbnRzLmpzIiwibGliL2F0dHJpYnV0ZS5qcyIsImxpYi9idWZmZXIuanMiLCJsaWIvY29tcGlsZS5qcyIsImxpYi9jb25zdGFudHMvYXJyYXl0eXBlcy5qc29uIiwibGliL2NvbnN0YW50cy9kdHlwZXMuanNvbiIsImxpYi9jb25zdGFudHMvcHJpbWl0aXZlcy5qc29uIiwibGliL2NvbnRleHQuanMiLCJsaWIvZHJhdy5qcyIsImxpYi9keW5hbWljLmpzIiwibGliL2VsZW1lbnRzLmpzIiwibGliL2V4dGVuc2lvbi5qcyIsImxpYi9mcmFtZWJ1ZmZlci5qcyIsImxpYi9saW1pdHMuanMiLCJsaWIvcmVhZC5qcyIsImxpYi9yZW5kZXJidWZmZXIuanMiLCJsaWIvc2hhZGVyLmpzIiwibGliL3N0YXRlLmpzIiwibGliL3N0cmluZ3MuanMiLCJsaWIvdGV4dHVyZS5qcyIsImxpYi91bmlmb3JtLmpzIiwibGliL3V0aWwvY2xvY2suanMiLCJsaWIvdXRpbC9jb2RlZ2VuLmpzIiwibGliL3V0aWwvZXh0ZW5kLmpzIiwibGliL3V0aWwvaXMtbmRhcnJheS5qcyIsImxpYi91dGlsL2lzLXR5cGVkLWFycmF5LmpzIiwibGliL3V0aWwvbG9hZC10ZXh0dXJlLmpzIiwibGliL3V0aWwvcGFyc2UtZGRzLmpzIiwibGliL3V0aWwvcmFmLmpzIiwibGliL3V0aWwvc3RhY2suanMiLCJsaWIvdXRpbC90by1oYWxmLWZsb2F0LmpzIiwibGliL3V0aWwvdmFsdWVzLmpzIiwicmVnbC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25OQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDclBBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdGhEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNaQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4SEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4dEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxM0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNaQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkxBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdENBO0FBQ0E7QUFDQTtBQUNBOztBQ0hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwidmFyIHJlZ2wgPSByZXF1aXJlKCcuLi9yZWdsJykoKVxuXG5yZWdsLmNsZWFyKHtcbiAgY29sb3I6IFswLCAwLCAwLCAxXSxcbiAgZGVwdGg6IDFcbn0pXG5cbnJlZ2woe1xuICBmcmFnOiBgXG4gICAgcHJlY2lzaW9uIG1lZGl1bXAgZmxvYXQ7XG4gICAgdW5pZm9ybSB2ZWM0IGNvbG9yO1xuICAgIHZvaWQgbWFpbigpIHtcbiAgICAgIGdsX0ZyYWdDb2xvciA9IGNvbG9yO1xuICAgIH1gLFxuXG4gIHZlcnQ6IGBcbiAgICBwcmVjaXNpb24gbWVkaXVtcCBmbG9hdDtcbiAgICBhdHRyaWJ1dGUgdmVjMiBwb3NpdGlvbjtcbiAgICB2b2lkIG1haW4oKSB7XG4gICAgICBnbF9Qb3NpdGlvbiA9IHZlYzQocG9zaXRpb24sIDAsIDEpO1xuICAgIH1gLFxuXG4gIGF0dHJpYnV0ZXM6IHtcbiAgICBwb3NpdGlvbjogcmVnbC5idWZmZXIoKG5ldyBBcnJheSg1KSkuZmlsbCgpLm1hcChmdW5jdGlvbiAoeCwgaSkge1xuICAgICAgdmFyIHRoZXRhID0gMi4wICogTWF0aC5QSSAqIGkgLyA1XG4gICAgICByZXR1cm4gWyBNYXRoLnNpbih0aGV0YSksIE1hdGguY29zKHRoZXRhKSBdXG4gICAgfSkpXG4gIH0sXG5cbiAgdW5pZm9ybXM6IHtcbiAgICBjb2xvcjogWzEsIDAsIDAsIDFdXG4gIH0sXG5cbiAgZWxlbWVudHM6IHJlZ2wuZWxlbWVudHMoW1xuICAgIFswLCAxXSxcbiAgICBbMCwgMl0sXG4gICAgWzAsIDNdLFxuICAgIFswLCA0XSxcbiAgICBbMSwgMl0sXG4gICAgWzEsIDNdLFxuICAgIFsxLCA0XSxcbiAgICBbMiwgM10sXG4gICAgWzIsIDRdLFxuICAgIFszLCA0XVxuICBdKSxcblxuICBsaW5lV2lkdGg6IDNcbn0pKClcbiIsInZhciBnbFR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvZHR5cGVzLmpzb24nKVxuXG5cbnZhciBHTF9GTE9BVCA9IDUxMjZcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwQXR0cmlidXRlU3RhdGUgKFxuICBnbCxcbiAgZXh0ZW5zaW9ucyxcbiAgbGltaXRzLFxuICBidWZmZXJTdGF0ZSxcbiAgc3RyaW5nU3RvcmUpIHtcbiAgdmFyIGF0dHJpYnV0ZVN0YXRlID0ge31cblxuICBmdW5jdGlvbiBBdHRyaWJ1dGVSZWNvcmQgKCkge1xuICAgIHRoaXMucG9pbnRlciA9IGZhbHNlXG5cbiAgICB0aGlzLnggPSAwLjBcbiAgICB0aGlzLnkgPSAwLjBcbiAgICB0aGlzLnogPSAwLjBcbiAgICB0aGlzLncgPSAwLjBcblxuICAgIHRoaXMuYnVmZmVyID0gbnVsbFxuICAgIHRoaXMuc2l6ZSA9IDBcbiAgICB0aGlzLm5vcm1hbGl6ZWQgPSBmYWxzZVxuICAgIHRoaXMudHlwZSA9IEdMX0ZMT0FUXG4gICAgdGhpcy5vZmZzZXQgPSAwXG4gICAgdGhpcy5zdHJpZGUgPSAwXG4gICAgdGhpcy5kaXZpc29yID0gMFxuICB9XG5cbiAgZnVuY3Rpb24gYXR0cmlidXRlUmVjb3Jkc0VxdWFsIChsZWZ0LCByaWdodCwgc2l6ZSkge1xuICAgIGlmICghbGVmdC5wb2ludGVyKSB7XG4gICAgICByZXR1cm4gIXJpZ2h0LnBvaW50ZXIgJiZcbiAgICAgICAgbGVmdC54ID09PSByaWdodC54ICYmXG4gICAgICAgIGxlZnQueSA9PT0gcmlnaHQueSAmJlxuICAgICAgICBsZWZ0LnogPT09IHJpZ2h0LnogJiZcbiAgICAgICAgbGVmdC53ID09PSByaWdodC53XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiByaWdodC5wb2ludGVyICYmXG4gICAgICAgIGxlZnQuYnVmZmVyID09PSByaWdodC5idWZmZXIgJiZcbiAgICAgICAgbGVmdC5zaXplID09PSBzaXplICYmXG4gICAgICAgIGxlZnQubm9ybWFsaXplZCA9PT0gcmlnaHQubm9ybWFsaXplZCAmJlxuICAgICAgICBsZWZ0LnR5cGUgPT09IHJpZ2h0LnR5cGUgJiZcbiAgICAgICAgbGVmdC5vZmZzZXQgPT09IHJpZ2h0Lm9mZnNldCAmJlxuICAgICAgICBsZWZ0LnN0cmlkZSA9PT0gcmlnaHQuc3RyaWRlICYmXG4gICAgICAgIGxlZnQuZGl2aXNvciA9PT0gcmlnaHQuZGl2aXNvclxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHNldEF0dHJpYnV0ZVJlY29yZCAobGVmdCwgcmlnaHQsIHNpemUpIHtcbiAgICB2YXIgcG9pbnRlciA9IGxlZnQucG9pbnRlciA9IHJpZ2h0LnBvaW50ZXJcbiAgICBpZiAocG9pbnRlcikge1xuICAgICAgbGVmdC5idWZmZXIgPSByaWdodC5idWZmZXJcbiAgICAgIGxlZnQuc2l6ZSA9IHNpemVcbiAgICAgIGxlZnQubm9ybWFsaXplZCA9IHJpZ2h0Lm5vcm1hbGl6ZWRcbiAgICAgIGxlZnQudHlwZSA9IHJpZ2h0LnR5cGVcbiAgICAgIGxlZnQub2Zmc2V0ID0gcmlnaHQub2Zmc2V0XG4gICAgICBsZWZ0LnN0cmlkZSA9IHJpZ2h0LnN0cmlkZVxuICAgICAgbGVmdC5kaXZpc29yID0gcmlnaHQuZGl2aXNvclxuICAgIH0gZWxzZSB7XG4gICAgICBsZWZ0LnggPSByaWdodC54XG4gICAgICBsZWZ0LnkgPSByaWdodC55XG4gICAgICBsZWZ0LnogPSByaWdodC56XG4gICAgICBsZWZ0LncgPSByaWdodC53XG4gICAgfVxuICB9XG5cbiAgdmFyIE5VTV9BVFRSSUJVVEVTID0gbGltaXRzLm1heEF0dHJpYnV0ZXNcbiAgdmFyIGF0dHJpYnV0ZUJpbmRpbmdzID0gbmV3IEFycmF5KE5VTV9BVFRSSUJVVEVTKVxuICBmb3IgKHZhciBpID0gMDsgaSA8IE5VTV9BVFRSSUJVVEVTOyArK2kpIHtcbiAgICBhdHRyaWJ1dGVCaW5kaW5nc1tpXSA9IG5ldyBBdHRyaWJ1dGVSZWNvcmQoKVxuICB9XG5cbiAgZnVuY3Rpb24gQXR0cmlidXRlU3RhY2sgKG5hbWUpIHtcbiAgICB0aGlzLnJlY29yZHMgPSBbXVxuICAgIHRoaXMubmFtZSA9IG5hbWVcbiAgfVxuXG4gIGZ1bmN0aW9uIHN0YWNrVG9wIChzdGFjaykge1xuICAgIHZhciByZWNvcmRzID0gc3RhY2sucmVjb3Jkc1xuICAgIHJldHVybiByZWNvcmRzW3JlY29yZHMubGVuZ3RoIC0gMV1cbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBCSU5EIEFOIEFUVFJJQlVURVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgZnVuY3Rpb24gYmluZEF0dHJpYnV0ZVJlY29yZCAoaW5kZXgsIGN1cnJlbnQsIG5leHQsIGluc2l6ZSkge1xuICAgIHZhciBzaXplID0gbmV4dC5zaXplIHx8IGluc2l6ZVxuICAgIGlmIChhdHRyaWJ1dGVSZWNvcmRzRXF1YWwoY3VycmVudCwgbmV4dCwgc2l6ZSkpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBpZiAoIW5leHQucG9pbnRlcikge1xuICAgICAgaWYgKGN1cnJlbnQucG9pbnRlcikge1xuICAgICAgICBnbC5kaXNhYmxlVmVydGV4QXR0cmliQXJyYXkoaW5kZXgpXG4gICAgICB9XG4gICAgICBnbC52ZXJ0ZXhBdHRyaWI0ZihpbmRleCwgbmV4dC54LCBuZXh0LnksIG5leHQueiwgbmV4dC53KVxuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoIWN1cnJlbnQucG9pbnRlcikge1xuICAgICAgICBnbC5lbmFibGVWZXJ0ZXhBdHRyaWJBcnJheShpbmRleClcbiAgICAgIH1cbiAgICAgIGlmIChjdXJyZW50LmJ1ZmZlciAhPT0gbmV4dC5idWZmZXIpIHtcbiAgICAgICAgbmV4dC5idWZmZXIuYmluZCgpXG4gICAgICB9XG4gICAgICBnbC52ZXJ0ZXhBdHRyaWJQb2ludGVyKFxuICAgICAgICBpbmRleCxcbiAgICAgICAgc2l6ZSxcbiAgICAgICAgbmV4dC50eXBlLFxuICAgICAgICBuZXh0Lm5vcm1hbGl6ZWQsXG4gICAgICAgIG5leHQuc3RyaWRlLFxuICAgICAgICBuZXh0Lm9mZnNldClcbiAgICAgIHZhciBleHRJbnN0YW5jaW5nID0gZXh0ZW5zaW9ucy5hbmdsZV9pbnN0YW5jZWRfYXJyYXlzXG4gICAgICBpZiAoZXh0SW5zdGFuY2luZykge1xuICAgICAgICBleHRJbnN0YW5jaW5nLnZlcnRleEF0dHJpYkRpdmlzb3JBTkdMRShpbmRleCwgbmV4dC5kaXZpc29yKVxuICAgICAgfVxuICAgIH1cbiAgICBzZXRBdHRyaWJ1dGVSZWNvcmQoY3VycmVudCwgbmV4dCwgc2l6ZSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGJpbmRBdHRyaWJ1dGUgKGluZGV4LCBjdXJyZW50LCBhdHRyaWJTdGFjaywgc2l6ZSkge1xuICAgIGJpbmRBdHRyaWJ1dGVSZWNvcmQoaW5kZXgsIGN1cnJlbnQsIHN0YWNrVG9wKGF0dHJpYlN0YWNrKSwgc2l6ZSlcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBERUZJTkUgQSBORVcgQVRUUklCVVRFXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICBmdW5jdGlvbiBkZWZBdHRyaWJ1dGUgKG5hbWUpIHtcbiAgICB2YXIgaWQgPSBzdHJpbmdTdG9yZS5pZChuYW1lKVxuICAgIHZhciByZXN1bHQgPSBhdHRyaWJ1dGVTdGF0ZVtpZF1cbiAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgcmVzdWx0ID0gYXR0cmlidXRlU3RhdGVbaWRdID0gbmV3IEF0dHJpYnV0ZVN0YWNrKG5hbWUpXG4gICAgfVxuICAgIHJldHVybiByZXN1bHRcbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZUF0dHJpYnV0ZUJveCAobmFtZSkge1xuICAgIHZhciBzdGFjayA9IFtuZXcgQXR0cmlidXRlUmVjb3JkKCldXG4gICAgXG5cbiAgICBmdW5jdGlvbiBhbGxvYyAoZGF0YSkge1xuICAgICAgdmFyIGJveFxuICAgICAgaWYgKHN0YWNrLmxlbmd0aCA8PSAwKSB7XG4gICAgICAgIGJveCA9IG5ldyBBdHRyaWJ1dGVSZWNvcmQoKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYm94ID0gc3RhY2sucG9wKClcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlb2YgZGF0YSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgYm94LnBvaW50ZXIgPSBmYWxzZVxuICAgICAgICBib3gueCA9IGRhdGFcbiAgICAgICAgYm94LnkgPSAwXG4gICAgICAgIGJveC56ID0gMFxuICAgICAgICBib3gudyA9IDBcbiAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShkYXRhKSkge1xuICAgICAgICBib3gucG9pbnRlciA9IGZhbHNlXG4gICAgICAgIGJveC54ID0gZGF0YVswXVxuICAgICAgICBib3gueSA9IGRhdGFbMV1cbiAgICAgICAgYm94LnogPSBkYXRhWzJdXG4gICAgICAgIGJveC53ID0gZGF0YVszXVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIGJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmdldEJ1ZmZlcihkYXRhKVxuICAgICAgICB2YXIgc2l6ZSA9IDBcbiAgICAgICAgdmFyIHN0cmlkZSA9IDBcbiAgICAgICAgdmFyIG9mZnNldCA9IDBcbiAgICAgICAgdmFyIGRpdmlzb3IgPSAwXG4gICAgICAgIHZhciBub3JtYWxpemVkID0gZmFsc2VcbiAgICAgICAgdmFyIHR5cGUgPSBHTF9GTE9BVFxuICAgICAgICBpZiAoIWJ1ZmZlcikge1xuICAgICAgICAgIGJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmdldEJ1ZmZlcihkYXRhLmJ1ZmZlcilcbiAgICAgICAgICBcbiAgICAgICAgICBzaXplID0gZGF0YS5zaXplIHx8IDBcbiAgICAgICAgICBzdHJpZGUgPSBkYXRhLnN0cmlkZSB8fCAwXG4gICAgICAgICAgb2Zmc2V0ID0gZGF0YS5vZmZzZXQgfHwgMFxuICAgICAgICAgIGRpdmlzb3IgPSBkYXRhLmRpdmlzb3IgfHwgMFxuICAgICAgICAgIG5vcm1hbGl6ZWQgPSBkYXRhLm5vcm1hbGl6ZWQgfHwgZmFsc2VcbiAgICAgICAgICB0eXBlID0gYnVmZmVyLmR0eXBlXG4gICAgICAgICAgaWYgKCd0eXBlJyBpbiBkYXRhKSB7XG4gICAgICAgICAgICB0eXBlID0gZ2xUeXBlc1tkYXRhLnR5cGVdXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHR5cGUgPSBidWZmZXIuZHR5cGVcbiAgICAgICAgfVxuICAgICAgICBib3gucG9pbnRlciA9IHRydWVcbiAgICAgICAgYm94LmJ1ZmZlciA9IGJ1ZmZlclxuICAgICAgICBib3guc2l6ZSA9IHNpemVcbiAgICAgICAgYm94Lm9mZnNldCA9IG9mZnNldFxuICAgICAgICBib3guc3RyaWRlID0gc3RyaWRlXG4gICAgICAgIGJveC5kaXZpc29yID0gZGl2aXNvclxuICAgICAgICBib3gubm9ybWFsaXplZCA9IG5vcm1hbGl6ZWRcbiAgICAgICAgYm94LnR5cGUgPSB0eXBlXG4gICAgICB9XG4gICAgICByZXR1cm4gYm94XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZnJlZSAoYm94KSB7XG4gICAgICBzdGFjay5wdXNoKGJveClcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgYWxsb2M6IGFsbG9jLFxuICAgICAgZnJlZTogZnJlZVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgYmluZGluZ3M6IGF0dHJpYnV0ZUJpbmRpbmdzLFxuICAgIGJpbmQ6IGJpbmRBdHRyaWJ1dGUsXG4gICAgYmluZFJlY29yZDogYmluZEF0dHJpYnV0ZVJlY29yZCxcbiAgICBkZWY6IGRlZkF0dHJpYnV0ZSxcbiAgICBib3g6IGNyZWF0ZUF0dHJpYnV0ZUJveCxcbiAgICBzdGF0ZTogYXR0cmlidXRlU3RhdGVcbiAgfVxufVxuIiwiLy8gQXJyYXkgYW5kIGVsZW1lbnQgYnVmZmVyIGNyZWF0aW9uXG5cbnZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL3V0aWwvaXMtdHlwZWQtYXJyYXknKVxudmFyIGlzTkRBcnJheUxpa2UgPSByZXF1aXJlKCcuL3V0aWwvaXMtbmRhcnJheScpXG52YXIgYXJyYXlUeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL2FycmF5dHlwZXMuanNvbicpXG52YXIgYnVmZmVyVHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9kdHlwZXMuanNvbicpXG52YXIgdmFsdWVzID0gcmVxdWlyZSgnLi91dGlsL3ZhbHVlcycpXG5cbnZhciBHTF9TVEFUSUNfRFJBVyA9IDM1MDQ0XG5cbnZhciBHTF9CWVRFID0gNTEyMFxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSA1MTIxXG52YXIgR0xfU0hPUlQgPSA1MTIyXG52YXIgR0xfVU5TSUdORURfU0hPUlQgPSA1MTIzXG52YXIgR0xfSU5UID0gNTEyNFxudmFyIEdMX1VOU0lHTkVEX0lOVCA9IDUxMjVcbnZhciBHTF9GTE9BVCA9IDUxMjZcblxudmFyIHVzYWdlVHlwZXMgPSB7XG4gICdzdGF0aWMnOiAzNTA0NCxcbiAgJ2R5bmFtaWMnOiAzNTA0OCxcbiAgJ3N0cmVhbSc6IDM1MDQwXG59XG5cbmZ1bmN0aW9uIHR5cGVkQXJyYXlDb2RlIChkYXRhKSB7XG4gIHJldHVybiBhcnJheVR5cGVzW09iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChkYXRhKV0gfCAwXG59XG5cbmZ1bmN0aW9uIG1ha2VUeXBlZEFycmF5IChkdHlwZSwgYXJncykge1xuICBzd2l0Y2ggKGR0eXBlKSB7XG4gICAgY2FzZSBHTF9VTlNJR05FRF9CWVRFOlxuICAgICAgcmV0dXJuIG5ldyBVaW50OEFycmF5KGFyZ3MpXG4gICAgY2FzZSBHTF9VTlNJR05FRF9TSE9SVDpcbiAgICAgIHJldHVybiBuZXcgVWludDE2QXJyYXkoYXJncylcbiAgICBjYXNlIEdMX1VOU0lHTkVEX0lOVDpcbiAgICAgIHJldHVybiBuZXcgVWludDMyQXJyYXkoYXJncylcbiAgICBjYXNlIEdMX0JZVEU6XG4gICAgICByZXR1cm4gbmV3IEludDhBcnJheShhcmdzKVxuICAgIGNhc2UgR0xfU0hPUlQ6XG4gICAgICByZXR1cm4gbmV3IEludDE2QXJyYXkoYXJncylcbiAgICBjYXNlIEdMX0lOVDpcbiAgICAgIHJldHVybiBuZXcgSW50MzJBcnJheShhcmdzKVxuICAgIGNhc2UgR0xfRkxPQVQ6XG4gICAgICByZXR1cm4gbmV3IEZsb2F0MzJBcnJheShhcmdzKVxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gbnVsbFxuICB9XG59XG5cbmZ1bmN0aW9uIGZsYXR0ZW4gKHJlc3VsdCwgZGF0YSwgZGltZW5zaW9uKSB7XG4gIHZhciBwdHIgPSAwXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgZGF0YS5sZW5ndGg7ICsraSkge1xuICAgIHZhciB2ID0gZGF0YVtpXVxuICAgIGZvciAodmFyIGogPSAwOyBqIDwgZGltZW5zaW9uOyArK2opIHtcbiAgICAgIHJlc3VsdFtwdHIrK10gPSB2W2pdXG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHRyYW5zcG9zZSAocmVzdWx0LCBkYXRhLCBzaGFwZVgsIHNoYXBlWSwgc3RyaWRlWCwgc3RyaWRlWSwgb2Zmc2V0KSB7XG4gIHZhciBwdHIgPSAwXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc2hhcGVYOyArK2kpIHtcbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IHNoYXBlWTsgKytqKSB7XG4gICAgICByZXN1bHRbcHRyKytdID0gZGF0YVtzdHJpZGVYICogaSArIHN0cmlkZVkgKiBqICsgb2Zmc2V0XVxuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcEJ1ZmZlclN0YXRlIChnbCkge1xuICB2YXIgYnVmZmVyQ291bnQgPSAwXG4gIHZhciBidWZmZXJTZXQgPSB7fVxuXG4gIGZ1bmN0aW9uIFJFR0xCdWZmZXIgKGJ1ZmZlciwgdHlwZSkge1xuICAgIHRoaXMuaWQgPSBidWZmZXJDb3VudCsrXG4gICAgdGhpcy5idWZmZXIgPSBidWZmZXJcbiAgICB0aGlzLnR5cGUgPSB0eXBlXG4gICAgdGhpcy51c2FnZSA9IEdMX1NUQVRJQ19EUkFXXG4gICAgdGhpcy5ieXRlTGVuZ3RoID0gMFxuICAgIHRoaXMuZGltZW5zaW9uID0gMVxuICAgIHRoaXMuZGF0YSA9IG51bGxcbiAgICB0aGlzLmR0eXBlID0gR0xfVU5TSUdORURfQllURVxuICB9XG5cbiAgUkVHTEJ1ZmZlci5wcm90b3R5cGUuYmluZCA9IGZ1bmN0aW9uICgpIHtcbiAgICBnbC5iaW5kQnVmZmVyKHRoaXMudHlwZSwgdGhpcy5idWZmZXIpXG4gIH1cblxuICBmdW5jdGlvbiByZWZyZXNoIChidWZmZXIpIHtcbiAgICBpZiAoIWdsLmlzQnVmZmVyKGJ1ZmZlci5idWZmZXIpKSB7XG4gICAgICBidWZmZXIuYnVmZmVyID0gZ2wuY3JlYXRlQnVmZmVyKClcbiAgICB9XG4gICAgYnVmZmVyLmJpbmQoKVxuICAgIGdsLmJ1ZmZlckRhdGEoYnVmZmVyLnR5cGUsIGJ1ZmZlci5kYXRhIHx8IGJ1ZmZlci5ieXRlTGVuZ3RoLCBidWZmZXIudXNhZ2UpXG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95IChidWZmZXIpIHtcbiAgICB2YXIgaGFuZGxlID0gYnVmZmVyLmJ1ZmZlclxuICAgIFxuICAgIGlmIChnbC5pc0J1ZmZlcihoYW5kbGUpKSB7XG4gICAgICBnbC5kZWxldGVCdWZmZXIoaGFuZGxlKVxuICAgIH1cbiAgICBidWZmZXIuYnVmZmVyID0gbnVsbFxuICAgIGRlbGV0ZSBidWZmZXJTZXRbYnVmZmVyLmlkXVxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlQnVmZmVyIChvcHRpb25zLCB0eXBlLCBkZWZlckluaXQpIHtcbiAgICB2YXIgaGFuZGxlID0gZ2wuY3JlYXRlQnVmZmVyKClcblxuICAgIHZhciBidWZmZXIgPSBuZXcgUkVHTEJ1ZmZlcihoYW5kbGUsIHR5cGUpXG4gICAgYnVmZmVyU2V0W2J1ZmZlci5pZF0gPSBidWZmZXJcblxuICAgIGZ1bmN0aW9uIHJlZ2xCdWZmZXIgKGlucHV0KSB7XG4gICAgICB2YXIgb3B0aW9ucyA9IGlucHV0IHx8IHt9XG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShvcHRpb25zKSB8fFxuICAgICAgICAgIGlzVHlwZWRBcnJheShvcHRpb25zKSB8fFxuICAgICAgICAgIGlzTkRBcnJheUxpa2Uob3B0aW9ucykpIHtcbiAgICAgICAgb3B0aW9ucyA9IHtcbiAgICAgICAgICBkYXRhOiBvcHRpb25zXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIG9wdGlvbnMgPT09ICdudW1iZXInKSB7XG4gICAgICAgIG9wdGlvbnMgPSB7XG4gICAgICAgICAgbGVuZ3RoOiBvcHRpb25zIHwgMFxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKG9wdGlvbnMgPT09IG51bGwgfHwgb3B0aW9ucyA9PT0gdm9pZCAwKSB7XG4gICAgICAgIG9wdGlvbnMgPSB7fVxuICAgICAgfVxuXG4gICAgICBcblxuICAgICAgaWYgKCd1c2FnZScgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgdXNhZ2UgPSBvcHRpb25zLnVzYWdlXG4gICAgICAgIFxuICAgICAgICBidWZmZXIudXNhZ2UgPSB1c2FnZVR5cGVzW29wdGlvbnMudXNhZ2VdXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBidWZmZXIudXNhZ2UgPSBHTF9TVEFUSUNfRFJBV1xuICAgICAgfVxuXG4gICAgICB2YXIgZHR5cGUgPSAwXG4gICAgICBpZiAoJ3R5cGUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgXG4gICAgICAgIGR0eXBlID0gYnVmZmVyVHlwZXNbb3B0aW9ucy50eXBlXVxuICAgICAgfVxuXG4gICAgICB2YXIgZGltZW5zaW9uID0gKG9wdGlvbnMuZGltZW5zaW9uIHwgMCkgfHwgMVxuICAgICAgdmFyIGJ5dGVMZW5ndGggPSAwXG4gICAgICB2YXIgZGF0YSA9IG51bGxcbiAgICAgIGlmICgnZGF0YScgaW4gb3B0aW9ucykge1xuICAgICAgICBkYXRhID0gb3B0aW9ucy5kYXRhXG4gICAgICAgIGlmIChkYXRhID09PSBudWxsKSB7XG4gICAgICAgICAgYnl0ZUxlbmd0aCA9IG9wdGlvbnMubGVuZ3RoIHwgMFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmIChpc05EQXJyYXlMaWtlKGRhdGEpKSB7XG4gICAgICAgICAgICB2YXIgc2hhcGUgPSBkYXRhLnNoYXBlXG4gICAgICAgICAgICB2YXIgc3RyaWRlID0gZGF0YS5zdHJpZGVcbiAgICAgICAgICAgIHZhciBvZmZzZXQgPSBkYXRhLm9mZnNldFxuXG4gICAgICAgICAgICB2YXIgc2hhcGVYID0gMFxuICAgICAgICAgICAgdmFyIHNoYXBlWSA9IDBcbiAgICAgICAgICAgIHZhciBzdHJpZGVYID0gMFxuICAgICAgICAgICAgdmFyIHN0cmlkZVkgPSAwXG4gICAgICAgICAgICBpZiAoc2hhcGUubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICAgIHNoYXBlWCA9IHNoYXBlWzBdXG4gICAgICAgICAgICAgIHNoYXBlWSA9IDFcbiAgICAgICAgICAgICAgc3RyaWRlWCA9IHN0cmlkZVswXVxuICAgICAgICAgICAgICBzdHJpZGVZID0gMFxuICAgICAgICAgICAgfSBlbHNlIGlmIChzaGFwZS5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgICAgICAgc2hhcGVYID0gc2hhcGVbMF1cbiAgICAgICAgICAgICAgc2hhcGVZID0gc2hhcGVbMV1cbiAgICAgICAgICAgICAgc3RyaWRlWCA9IHN0cmlkZVswXVxuICAgICAgICAgICAgICBzdHJpZGVZID0gc3RyaWRlWzFdXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZHR5cGUgPSBkdHlwZSB8fCB0eXBlZEFycmF5Q29kZShkYXRhKSB8fCBHTF9GTE9BVFxuICAgICAgICAgICAgZGltZW5zaW9uID0gc2hhcGVZXG4gICAgICAgICAgICBkYXRhID0gdHJhbnNwb3NlKFxuICAgICAgICAgICAgICBtYWtlVHlwZWRBcnJheShkdHlwZSwgc2hhcGVYICogc2hhcGVZKSxcbiAgICAgICAgICAgICAgZGF0YS5kYXRhLFxuICAgICAgICAgICAgICBzaGFwZVgsIHNoYXBlWSxcbiAgICAgICAgICAgICAgc3RyaWRlWCwgc3RyaWRlWSxcbiAgICAgICAgICAgICAgb2Zmc2V0KVxuICAgICAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShkYXRhKSkge1xuICAgICAgICAgICAgaWYgKGRhdGEubGVuZ3RoID4gMCAmJiBBcnJheS5pc0FycmF5KGRhdGFbMF0pKSB7XG4gICAgICAgICAgICAgIGRpbWVuc2lvbiA9IGRhdGFbMF0ubGVuZ3RoXG4gICAgICAgICAgICAgIGR0eXBlID0gZHR5cGUgfHwgR0xfRkxPQVRcbiAgICAgICAgICAgICAgdmFyIHJlc3VsdCA9IG1ha2VUeXBlZEFycmF5KGR0eXBlLCBkYXRhLmxlbmd0aCAqIGRpbWVuc2lvbilcbiAgICAgICAgICAgICAgZGF0YSA9IGZsYXR0ZW4ocmVzdWx0LCBkYXRhLCBkaW1lbnNpb24pXG4gICAgICAgICAgICAgIGRhdGEgPSByZXN1bHRcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGR0eXBlID0gZHR5cGUgfHwgR0xfRkxPQVRcbiAgICAgICAgICAgICAgZGF0YSA9IG1ha2VUeXBlZEFycmF5KGR0eXBlLCBkYXRhKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGR0eXBlID0gZHR5cGUgfHwgdHlwZWRBcnJheUNvZGUoZGF0YSlcbiAgICAgICAgICB9XG4gICAgICAgICAgYnl0ZUxlbmd0aCA9IGRhdGEuYnl0ZUxlbmd0aFxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKCdsZW5ndGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgYnl0ZUxlbmd0aCA9IG9wdGlvbnMubGVuZ3RoIHwgMFxuICAgICAgICBcbiAgICAgIH1cblxuICAgICAgYnVmZmVyLmRhdGEgPSBkYXRhXG4gICAgICBidWZmZXIuZHR5cGUgPSBkdHlwZSB8fCBHTF9VTlNJR05FRF9CWVRFXG4gICAgICBidWZmZXIuYnl0ZUxlbmd0aCA9IGJ5dGVMZW5ndGhcbiAgICAgIGJ1ZmZlci5kaW1lbnNpb24gPSBkaW1lbnNpb25cblxuICAgICAgcmVmcmVzaChidWZmZXIpXG5cbiAgICAgIHJldHVybiByZWdsQnVmZmVyXG4gICAgfVxuXG4gICAgaWYgKCFkZWZlckluaXQpIHtcbiAgICAgIHJlZ2xCdWZmZXIob3B0aW9ucylcbiAgICB9XG5cbiAgICByZWdsQnVmZmVyLl9yZWdsVHlwZSA9ICdidWZmZXInXG4gICAgcmVnbEJ1ZmZlci5fYnVmZmVyID0gYnVmZmVyXG4gICAgcmVnbEJ1ZmZlci5kZXN0cm95ID0gZnVuY3Rpb24gKCkgeyBkZXN0cm95KGJ1ZmZlcikgfVxuXG4gICAgcmV0dXJuIHJlZ2xCdWZmZXJcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY3JlYXRlOiBjcmVhdGVCdWZmZXIsXG5cbiAgICBjbGVhcjogZnVuY3Rpb24gKCkge1xuICAgICAgdmFsdWVzKGJ1ZmZlclNldCkuZm9yRWFjaChkZXN0cm95KVxuICAgIH0sXG5cbiAgICByZWZyZXNoOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YWx1ZXMoYnVmZmVyU2V0KS5mb3JFYWNoKHJlZnJlc2gpXG4gICAgfSxcblxuICAgIGdldEJ1ZmZlcjogZnVuY3Rpb24gKHdyYXBwZXIpIHtcbiAgICAgIGlmICh3cmFwcGVyICYmIHdyYXBwZXIuX2J1ZmZlciBpbnN0YW5jZW9mIFJFR0xCdWZmZXIpIHtcbiAgICAgICAgcmV0dXJuIHdyYXBwZXIuX2J1ZmZlclxuICAgICAgfVxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG4gIH1cbn1cbiIsIlxudmFyIGNyZWF0ZUVudmlyb25tZW50ID0gcmVxdWlyZSgnLi91dGlsL2NvZGVnZW4nKVxuXG52YXIgcHJpbVR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvcHJpbWl0aXZlcy5qc29uJylcblxudmFyIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSID0gMzQ5NjNcblxudmFyIEdMX0ZSQUdNRU5UX1NIQURFUiA9IDM1NjMyXG52YXIgR0xfVkVSVEVYX1NIQURFUiA9IDM1NjMzXG5cbnZhciBHTF9GTE9BVCA9IDUxMjZcbnZhciBHTF9GTE9BVF9WRUMyID0gMzU2NjRcbnZhciBHTF9GTE9BVF9WRUMzID0gMzU2NjVcbnZhciBHTF9GTE9BVF9WRUM0ID0gMzU2NjZcbnZhciBHTF9JTlQgPSA1MTI0XG52YXIgR0xfSU5UX1ZFQzIgPSAzNTY2N1xudmFyIEdMX0lOVF9WRUMzID0gMzU2NjhcbnZhciBHTF9JTlRfVkVDNCA9IDM1NjY5XG52YXIgR0xfQk9PTCA9IDM1NjcwXG52YXIgR0xfQk9PTF9WRUMyID0gMzU2NzFcbnZhciBHTF9CT09MX1ZFQzMgPSAzNTY3MlxudmFyIEdMX0JPT0xfVkVDNCA9IDM1NjczXG52YXIgR0xfRkxPQVRfTUFUMiA9IDM1Njc0XG52YXIgR0xfRkxPQVRfTUFUMyA9IDM1Njc1XG52YXIgR0xfRkxPQVRfTUFUNCA9IDM1Njc2XG52YXIgR0xfU0FNUExFUl8yRCA9IDM1Njc4XG52YXIgR0xfU0FNUExFUl9DVUJFID0gMzU2ODBcblxudmFyIEdMX1RSSUFOR0xFUyA9IDRcblxudmFyIEdMX0NVTExfRkFDRSA9IDB4MEI0NFxudmFyIEdMX0JMRU5EID0gMHgwQkUyXG52YXIgR0xfRElUSEVSID0gMHgwQkQwXG52YXIgR0xfU1RFTkNJTF9URVNUID0gMHgwQjkwXG52YXIgR0xfREVQVEhfVEVTVCA9IDB4MEI3MVxudmFyIEdMX1NDSVNTT1JfVEVTVCA9IDB4MEMxMVxudmFyIEdMX1BPTFlHT05fT0ZGU0VUX0ZJTEwgPSAweDgwMzdcbnZhciBHTF9TQU1QTEVfQUxQSEFfVE9fQ09WRVJBR0UgPSAweDgwOUVcbnZhciBHTF9TQU1QTEVfQ09WRVJBR0UgPSAweDgwQTBcblxudmFyIEdMX0ZST05UID0gMTAyOFxudmFyIEdMX0JBQ0sgPSAxMDI5XG5cbnZhciBHTF9DVyA9IDB4MDkwMFxudmFyIEdMX0NDVyA9IDB4MDkwMVxuXG52YXIgR0xfTUlOX0VYVCA9IDB4ODAwN1xudmFyIEdMX01BWF9FWFQgPSAweDgwMDhcblxudmFyIGJsZW5kRnVuY3MgPSB7XG4gICcwJzogMCxcbiAgJzEnOiAxLFxuICAnemVybyc6IDAsXG4gICdvbmUnOiAxLFxuICAnc3JjIGNvbG9yJzogNzY4LFxuICAnb25lIG1pbnVzIHNyYyBjb2xvcic6IDc2OSxcbiAgJ3NyYyBhbHBoYSc6IDc3MCxcbiAgJ29uZSBtaW51cyBzcmMgYWxwaGEnOiA3NzEsXG4gICdkc3QgY29sb3InOiA3NzQsXG4gICdvbmUgbWludXMgZHN0IGNvbG9yJzogNzc1LFxuICAnZHN0IGFscGhhJzogNzcyLFxuICAnb25lIG1pbnVzIGRzdCBhbHBoYSc6IDc3MyxcbiAgJ2NvbnN0YW50IGNvbG9yJzogMzI3NjksXG4gICdvbmUgbWludXMgY29uc3RhbnQgY29sb3InOiAzMjc3MCxcbiAgJ2NvbnN0YW50IGFscGhhJzogMzI3NzEsXG4gICdvbmUgbWludXMgY29uc3RhbnQgYWxwaGEnOiAzMjc3MixcbiAgJ3NyYyBhbHBoYSBzYXR1cmF0ZSc6IDc3NlxufVxuXG52YXIgY29tcGFyZUZ1bmNzID0ge1xuICAnbmV2ZXInOiA1MTIsXG4gICdsZXNzJzogNTEzLFxuICAnPCc6IDUxMyxcbiAgJ2VxdWFsJzogNTE0LFxuICAnPSc6IDUxNCxcbiAgJz09JzogNTE0LFxuICAnPT09JzogNTE0LFxuICAnbGVxdWFsJzogNTE1LFxuICAnPD0nOiA1MTUsXG4gICdncmVhdGVyJzogNTE2LFxuICAnPic6IDUxNixcbiAgJ25vdGVxdWFsJzogNTE3LFxuICAnIT0nOiA1MTcsXG4gICchPT0nOiA1MTcsXG4gICdnZXF1YWwnOiA1MTgsXG4gICc+PSc6IDUxOCxcbiAgJ2Fsd2F5cyc6IDUxOVxufVxuXG52YXIgc3RlbmNpbE9wcyA9IHtcbiAgJzAnOiAwLFxuICAnemVybyc6IDAsXG4gICdrZWVwJzogNzY4MCxcbiAgJ3JlcGxhY2UnOiA3NjgxLFxuICAnaW5jcmVtZW50JzogNzY4MixcbiAgJ2RlY3JlbWVudCc6IDc2ODMsXG4gICdpbmNyZW1lbnQgd3JhcCc6IDM0MDU1LFxuICAnZGVjcmVtZW50IHdyYXAnOiAzNDA1NixcbiAgJ2ludmVydCc6IDUzODZcbn1cblxuZnVuY3Rpb24gdHlwZUxlbmd0aCAoeCkge1xuICBzd2l0Y2ggKHgpIHtcbiAgICBjYXNlIEdMX0ZMT0FUX1ZFQzI6XG4gICAgY2FzZSBHTF9JTlRfVkVDMjpcbiAgICBjYXNlIEdMX0JPT0xfVkVDMjpcbiAgICAgIHJldHVybiAyXG4gICAgY2FzZSBHTF9GTE9BVF9WRUMzOlxuICAgIGNhc2UgR0xfSU5UX1ZFQzM6XG4gICAgY2FzZSBHTF9CT09MX1ZFQzM6XG4gICAgICByZXR1cm4gM1xuICAgIGNhc2UgR0xfRkxPQVRfVkVDNDpcbiAgICBjYXNlIEdMX0lOVF9WRUM0OlxuICAgIGNhc2UgR0xfQk9PTF9WRUM0OlxuICAgICAgcmV0dXJuIDRcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIDFcbiAgfVxufVxuXG5mdW5jdGlvbiBzZXRVbmlmb3JtU3RyaW5nIChnbCwgdHlwZSwgbG9jYXRpb24sIHZhbHVlKSB7XG4gIHZhciBpbmZpeFxuICB2YXIgc2VwYXJhdG9yID0gJywnXG4gIHN3aXRjaCAodHlwZSkge1xuICAgIGNhc2UgR0xfRkxPQVQ6XG4gICAgICBpbmZpeCA9ICcxZidcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9GTE9BVF9WRUMyOlxuICAgICAgaW5maXggPSAnMmZ2J1xuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX0ZMT0FUX1ZFQzM6XG4gICAgICBpbmZpeCA9ICczZnYnXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfRkxPQVRfVkVDNDpcbiAgICAgIGluZml4ID0gJzRmdidcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9CT09MOlxuICAgIGNhc2UgR0xfSU5UOlxuICAgICAgaW5maXggPSAnMWknXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfQk9PTF9WRUMyOlxuICAgIGNhc2UgR0xfSU5UX1ZFQzI6XG4gICAgICBpbmZpeCA9ICcyaXYnXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfQk9PTF9WRUMzOlxuICAgIGNhc2UgR0xfSU5UX1ZFQzM6XG4gICAgICBpbmZpeCA9ICczaXYnXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfQk9PTF9WRUM0OlxuICAgIGNhc2UgR0xfSU5UX1ZFQzQ6XG4gICAgICBpbmZpeCA9ICc0aXYnXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfRkxPQVRfTUFUMjpcbiAgICAgIGluZml4ID0gJ01hdHJpeDJmdidcbiAgICAgIHNlcGFyYXRvciA9ICcsZmFsc2UsJ1xuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX0ZMT0FUX01BVDM6XG4gICAgICBpbmZpeCA9ICdNYXRyaXgzZnYnXG4gICAgICBzZXBhcmF0b3IgPSAnLGZhbHNlLCdcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9GTE9BVF9NQVQ0OlxuICAgICAgaW5maXggPSAnTWF0cml4NGZ2J1xuICAgICAgc2VwYXJhdG9yID0gJyxmYWxzZSwnXG4gICAgICBicmVha1xuICAgIGRlZmF1bHQ6XG4gICAgICBcbiAgfVxuICByZXR1cm4gZ2wgKyAnLnVuaWZvcm0nICsgaW5maXggKyAnKCcgKyBsb2NhdGlvbiArIHNlcGFyYXRvciArIHZhbHVlICsgJyk7J1xufVxuXG5mdW5jdGlvbiBzdGFja1RvcCAoeCkge1xuICByZXR1cm4geCArICdbJyArIHggKyAnLmxlbmd0aC0xXSdcbn1cblxuLy8gTmVlZCB0byBwcm9jZXNzIGZyYW1lYnVmZmVyIGZpcnN0IGluIG9wdGlvbnMgbGlzdFxuZnVuY3Rpb24gb3B0aW9uUHJpb3JpdHkgKGEsIGIpIHtcbiAgaWYgKGEgPT09ICdmcmFtZWJ1ZmZlcicpIHtcbiAgICByZXR1cm4gLTFcbiAgfVxuICBpZiAoYSA8IGIpIHtcbiAgICByZXR1cm4gLTFcbiAgfSBlbHNlIGlmIChhID4gYikge1xuICAgIHJldHVybiAxXG4gIH1cbiAgcmV0dXJuIDBcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiByZWdsQ29tcGlsZXIgKFxuICBnbCxcbiAgc3RyaW5nU3RvcmUsXG4gIGV4dGVuc2lvbnMsXG4gIGxpbWl0cyxcbiAgYnVmZmVyU3RhdGUsXG4gIGVsZW1lbnRTdGF0ZSxcbiAgdGV4dHVyZVN0YXRlLFxuICBmcmFtZWJ1ZmZlclN0YXRlLFxuICBnbFN0YXRlLFxuICB1bmlmb3JtU3RhdGUsXG4gIGF0dHJpYnV0ZVN0YXRlLFxuICBzaGFkZXJTdGF0ZSxcbiAgZHJhd1N0YXRlLFxuICBmcmFtZVN0YXRlLFxuICByZWdsUG9sbCkge1xuICB2YXIgY29udGV4dFN0YXRlID0gZ2xTdGF0ZS5jb250ZXh0U3RhdGVcblxuICB2YXIgYmxlbmRFcXVhdGlvbnMgPSB7XG4gICAgJ2FkZCc6IDMyNzc0LFxuICAgICdzdWJ0cmFjdCc6IDMyNzc4LFxuICAgICdyZXZlcnNlIHN1YnRyYWN0JzogMzI3NzlcbiAgfVxuICBpZiAoZXh0ZW5zaW9ucy5leHRfYmxlbmRfbWlubWF4KSB7XG4gICAgYmxlbmRFcXVhdGlvbnMubWluID0gR0xfTUlOX0VYVFxuICAgIGJsZW5kRXF1YXRpb25zLm1heCA9IEdMX01BWF9FWFRcbiAgfVxuXG4gIHZhciBkcmF3Q2FsbENvdW50ZXIgPSAwXG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBTSEFERVIgU0lOR0xFIERSQVcgT1BFUkFUSU9OXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgZnVuY3Rpb24gY29tcGlsZVNoYWRlckRyYXcgKHByb2dyYW0pIHtcbiAgICB2YXIgZW52ID0gY3JlYXRlRW52aXJvbm1lbnQoKVxuICAgIHZhciBsaW5rID0gZW52LmxpbmtcbiAgICB2YXIgZHJhdyA9IGVudi5wcm9jKCdkcmF3JylcbiAgICB2YXIgZGVmID0gZHJhdy5kZWZcblxuICAgIHZhciBHTCA9IGxpbmsoZ2wpXG4gICAgdmFyIFBST0dSQU0gPSBsaW5rKHByb2dyYW0ucHJvZ3JhbSlcbiAgICB2YXIgQklORF9BVFRSSUJVVEUgPSBsaW5rKGF0dHJpYnV0ZVN0YXRlLmJpbmQpXG4gICAgdmFyIERSQVdfU1RBVEUgPSB7XG4gICAgICBjb3VudDogbGluayhkcmF3U3RhdGUuY291bnQpLFxuICAgICAgb2Zmc2V0OiBsaW5rKGRyYXdTdGF0ZS5vZmZzZXQpLFxuICAgICAgaW5zdGFuY2VzOiBsaW5rKGRyYXdTdGF0ZS5pbnN0YW5jZXMpLFxuICAgICAgcHJpbWl0aXZlOiBsaW5rKGRyYXdTdGF0ZS5wcmltaXRpdmUpXG4gICAgfVxuICAgIHZhciBFTEVNRU5UX1NUQVRFID0gbGluayhlbGVtZW50U3RhdGUuZWxlbWVudHMpXG4gICAgdmFyIFRFWFRVUkVfVU5JRk9STVMgPSBbXVxuXG4gICAgLy8gYmluZCB0aGUgcHJvZ3JhbVxuICAgIGRyYXcoR0wsICcudXNlUHJvZ3JhbSgnLCBQUk9HUkFNLCAnKTsnKVxuXG4gICAgLy8gc2V0IHVwIGF0dHJpYnV0ZSBzdGF0ZVxuICAgIHByb2dyYW0uYXR0cmlidXRlcy5mb3JFYWNoKGZ1bmN0aW9uIChhdHRyaWJ1dGUpIHtcbiAgICAgIHZhciBTVEFDSyA9IGxpbmsoYXR0cmlidXRlU3RhdGUuZGVmKGF0dHJpYnV0ZS5uYW1lKSlcbiAgICAgIGRyYXcoQklORF9BVFRSSUJVVEUsICcoJyxcbiAgICAgICAgYXR0cmlidXRlLmxvY2F0aW9uLCAnLCcsXG4gICAgICAgIGxpbmsoYXR0cmlidXRlU3RhdGUuYmluZGluZ3NbYXR0cmlidXRlLmxvY2F0aW9uXSksICcsJyxcbiAgICAgICAgU1RBQ0ssICcsJyxcbiAgICAgICAgdHlwZUxlbmd0aChhdHRyaWJ1dGUuaW5mby50eXBlKSwgJyk7JylcbiAgICB9KVxuXG4gICAgLy8gc2V0IHVwIHVuaWZvcm1zXG4gICAgcHJvZ3JhbS51bmlmb3Jtcy5mb3JFYWNoKGZ1bmN0aW9uICh1bmlmb3JtKSB7XG4gICAgICB2YXIgTE9DQVRJT04gPSBsaW5rKHVuaWZvcm0ubG9jYXRpb24pXG4gICAgICB2YXIgU1RBQ0sgPSBsaW5rKHVuaWZvcm1TdGF0ZS5kZWYodW5pZm9ybS5uYW1lKSlcbiAgICAgIHZhciBUT1AgPSBTVEFDSyArICdbJyArIFNUQUNLICsgJy5sZW5ndGgtMV0nXG4gICAgICB2YXIgdHlwZSA9IHVuaWZvcm0uaW5mby50eXBlXG4gICAgICBpZiAodHlwZSA9PT0gR0xfU0FNUExFUl8yRCB8fCB0eXBlID09PSBHTF9TQU1QTEVSX0NVQkUpIHtcbiAgICAgICAgdmFyIFRFWF9WQUxVRSA9IGRlZihUT1AgKyAnLl90ZXh0dXJlJylcbiAgICAgICAgVEVYVFVSRV9VTklGT1JNUy5wdXNoKFRFWF9WQUxVRSlcbiAgICAgICAgZHJhdyhzZXRVbmlmb3JtU3RyaW5nKEdMLCBHTF9JTlQsIExPQ0FUSU9OLCBURVhfVkFMVUUgKyAnLmJpbmQoKScpKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZHJhdyhzZXRVbmlmb3JtU3RyaW5nKEdMLCB0eXBlLCBMT0NBVElPTiwgVE9QKSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8gdW5iaW5kIHRleHR1cmVzIGltbWVkaWF0ZWx5XG4gICAgVEVYVFVSRV9VTklGT1JNUy5mb3JFYWNoKGZ1bmN0aW9uIChURVhfVkFMVUUpIHtcbiAgICAgIGRyYXcoVEVYX1ZBTFVFLCAnLnVuYmluZCgpOycpXG4gICAgfSlcblxuICAgIC8vIEV4ZWN1dGUgZHJhdyBjb21tYW5kXG4gICAgdmFyIENVUl9QUklNSVRJVkUgPSBkZWYoc3RhY2tUb3AoRFJBV19TVEFURS5wcmltaXRpdmUpKVxuICAgIHZhciBDVVJfQ09VTlQgPSBkZWYoc3RhY2tUb3AoRFJBV19TVEFURS5jb3VudCkpXG4gICAgdmFyIENVUl9PRkZTRVQgPSBkZWYoc3RhY2tUb3AoRFJBV19TVEFURS5vZmZzZXQpKVxuICAgIHZhciBDVVJfRUxFTUVOVFMgPSBkZWYoc3RhY2tUb3AoRUxFTUVOVF9TVEFURSkpXG5cbiAgICAvLyBPbmx5IGV4ZWN1dGUgZHJhdyBjb21tYW5kIGlmIG51bWJlciBlbGVtZW50cyBpcyA+IDBcbiAgICBkcmF3KCdpZignLCBDVVJfQ09VTlQsICcpeycpXG5cbiAgICB2YXIgaW5zdGFuY2luZyA9IGV4dGVuc2lvbnMuYW5nbGVfaW5zdGFuY2VkX2FycmF5c1xuICAgIGlmIChpbnN0YW5jaW5nKSB7XG4gICAgICB2YXIgQ1VSX0lOU1RBTkNFUyA9IGRlZihzdGFja1RvcChEUkFXX1NUQVRFLmluc3RhbmNlcykpXG4gICAgICB2YXIgSU5TVEFOQ0VfRVhUID0gbGluayhpbnN0YW5jaW5nKVxuICAgICAgZHJhdyhcbiAgICAgICAgJ2lmKCcsIENVUl9FTEVNRU5UUywgJyl7JyxcbiAgICAgICAgQ1VSX0VMRU1FTlRTLCAnLmJpbmQoKTsnLFxuICAgICAgICAnaWYoJywgQ1VSX0lOU1RBTkNFUywgJz4wKXsnLFxuICAgICAgICBJTlNUQU5DRV9FWFQsICcuZHJhd0VsZW1lbnRzSW5zdGFuY2VkQU5HTEUoJyxcbiAgICAgICAgQ1VSX1BSSU1JVElWRSwgJywnLFxuICAgICAgICBDVVJfQ09VTlQsICcsJyxcbiAgICAgICAgQ1VSX0VMRU1FTlRTLCAnLnR5cGUsJyxcbiAgICAgICAgQ1VSX09GRlNFVCwgJywnLFxuICAgICAgICBDVVJfSU5TVEFOQ0VTLCAnKTt9ZWxzZXsnLFxuICAgICAgICBHTCwgJy5kcmF3RWxlbWVudHMoJyxcbiAgICAgICAgQ1VSX1BSSU1JVElWRSwgJywnLFxuICAgICAgICBDVVJfQ09VTlQsICcsJyxcbiAgICAgICAgQ1VSX0VMRU1FTlRTLCAnLnR5cGUsJyxcbiAgICAgICAgQ1VSX09GRlNFVCwgJyk7fScsXG4gICAgICAgICd9ZWxzZSBpZignLCBDVVJfSU5TVEFOQ0VTLCAnPjApeycsXG4gICAgICAgIElOU1RBTkNFX0VYVCwgJy5kcmF3QXJyYXlzSW5zdGFuY2VkQU5HTEUoJyxcbiAgICAgICAgQ1VSX1BSSU1JVElWRSwgJywnLFxuICAgICAgICBDVVJfT0ZGU0VULCAnLCcsXG4gICAgICAgIENVUl9DT1VOVCwgJywnLFxuICAgICAgICBDVVJfSU5TVEFOQ0VTLCAnKTt9ZWxzZXsnLFxuICAgICAgICBHTCwgJy5kcmF3QXJyYXlzKCcsXG4gICAgICAgIENVUl9QUklNSVRJVkUsICcsJyxcbiAgICAgICAgQ1VSX09GRlNFVCwgJywnLFxuICAgICAgICBDVVJfQ09VTlQsICcpO319JylcbiAgICB9IGVsc2Uge1xuICAgICAgZHJhdyhcbiAgICAgICAgJ2lmKCcsIENVUl9FTEVNRU5UUywgJyl7JyxcbiAgICAgICAgQ1VSX0VMRU1FTlRTLCAnLmJpbmQoKTsnLFxuICAgICAgICBHTCwgJy5kcmF3RWxlbWVudHMoJyxcbiAgICAgICAgQ1VSX1BSSU1JVElWRSwgJywnLFxuICAgICAgICBDVVJfQ09VTlQsICcsJyxcbiAgICAgICAgQ1VSX0VMRU1FTlRTLCAnLnR5cGUsJyxcbiAgICAgICAgQ1VSX09GRlNFVCwgJyk7JyxcbiAgICAgICAgJ31lbHNleycsXG4gICAgICAgIEdMLCAnLmRyYXdBcnJheXMoJyxcbiAgICAgICAgQ1VSX1BSSU1JVElWRSwgJywnLFxuICAgICAgICBDVVJfT0ZGU0VULCAnLCcsXG4gICAgICAgIENVUl9DT1VOVCwgJyk7fX0nKVxuICAgIH1cblxuICAgIHJldHVybiBlbnYuY29tcGlsZSgpLmRyYXdcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gQkFUQ0ggRFJBVyBPUEVSQVRJT05cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICBmdW5jdGlvbiBjb21waWxlQmF0Y2ggKFxuICAgIHByb2dyYW0sIG9wdGlvbnMsIHVuaWZvcm1zLCBhdHRyaWJ1dGVzLCBzdGF0aWNPcHRpb25zKSB7XG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGNvZGUgZ2VuZXJhdGlvbiBoZWxwZXJzXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHZhciBlbnYgPSBjcmVhdGVFbnZpcm9ubWVudCgpXG4gICAgdmFyIGxpbmsgPSBlbnYubGlua1xuICAgIHZhciBiYXRjaCA9IGVudi5wcm9jKCdiYXRjaCcpXG4gICAgdmFyIGV4aXQgPSBlbnYuYmxvY2soKVxuICAgIHZhciBkZWYgPSBiYXRjaC5kZWZcbiAgICB2YXIgYXJnID0gYmF0Y2guYXJnXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gcmVnbCBzdGF0ZVxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICB2YXIgR0wgPSBsaW5rKGdsKVxuICAgIHZhciBQUk9HUkFNID0gbGluayhwcm9ncmFtLnByb2dyYW0pXG4gICAgdmFyIEJJTkRfQVRUUklCVVRFID0gbGluayhhdHRyaWJ1dGVTdGF0ZS5iaW5kKVxuICAgIHZhciBCSU5EX0FUVFJJQlVURV9SRUNPUkQgPSBsaW5rKGF0dHJpYnV0ZVN0YXRlLmJpbmRSZWNvcmQpXG4gICAgdmFyIEZSQU1FX1NUQVRFID0gbGluayhmcmFtZVN0YXRlKVxuICAgIHZhciBGUkFNRUJVRkZFUl9TVEFURSA9IGxpbmsoZnJhbWVidWZmZXJTdGF0ZSlcbiAgICB2YXIgRFJBV19TVEFURSA9IHtcbiAgICAgIGNvdW50OiBsaW5rKGRyYXdTdGF0ZS5jb3VudCksXG4gICAgICBvZmZzZXQ6IGxpbmsoZHJhd1N0YXRlLm9mZnNldCksXG4gICAgICBpbnN0YW5jZXM6IGxpbmsoZHJhd1N0YXRlLmluc3RhbmNlcyksXG4gICAgICBwcmltaXRpdmU6IGxpbmsoZHJhd1N0YXRlLnByaW1pdGl2ZSlcbiAgICB9XG4gICAgdmFyIENPTlRFWFRfU1RBVEUgPSB7fVxuICAgIHZhciBFTEVNRU5UUyA9IGxpbmsoZWxlbWVudFN0YXRlLmVsZW1lbnRzKVxuICAgIHZhciBDVVJfQ09VTlQgPSBkZWYoc3RhY2tUb3AoRFJBV19TVEFURS5jb3VudCkpXG4gICAgdmFyIENVUl9PRkZTRVQgPSBkZWYoc3RhY2tUb3AoRFJBV19TVEFURS5vZmZzZXQpKVxuICAgIHZhciBDVVJfUFJJTUlUSVZFID0gZGVmKHN0YWNrVG9wKERSQVdfU1RBVEUucHJpbWl0aXZlKSlcbiAgICB2YXIgQ1VSX0VMRU1FTlRTID0gZGVmKHN0YWNrVG9wKEVMRU1FTlRTKSlcbiAgICB2YXIgQ1VSX0lOU1RBTkNFU1xuICAgIHZhciBJTlNUQU5DRV9FWFRcbiAgICB2YXIgaW5zdGFuY2luZyA9IGV4dGVuc2lvbnMuYW5nbGVfaW5zdGFuY2VkX2FycmF5c1xuICAgIGlmIChpbnN0YW5jaW5nKSB7XG4gICAgICBDVVJfSU5TVEFOQ0VTID0gZGVmKHN0YWNrVG9wKERSQVdfU1RBVEUuaW5zdGFuY2VzKSlcbiAgICAgIElOU1RBTkNFX0VYVCA9IGxpbmsoaW5zdGFuY2luZylcbiAgICB9XG4gICAgdmFyIGhhc0R5bmFtaWNFbGVtZW50cyA9ICdlbGVtZW50cycgaW4gb3B0aW9uc1xuXG4gICAgZnVuY3Rpb24gbGlua0NvbnRleHQgKHgpIHtcbiAgICAgIHZhciByZXN1bHQgPSBDT05URVhUX1NUQVRFW3hdXG4gICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH1cbiAgICAgIHJlc3VsdCA9IENPTlRFWFRfU1RBVEVbeF0gPSBsaW5rKGNvbnRleHRTdGF0ZVt4XSlcbiAgICAgIHJldHVybiByZXN1bHRcbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gYmF0Y2gvYXJndW1lbnQgdmFyc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICB2YXIgTlVNX0FSR1MgPSBhcmcoKVxuICAgIHZhciBBUkdTID0gYXJnKClcbiAgICB2YXIgQVJHID0gZGVmKClcbiAgICB2YXIgQkFUQ0hfSUQgPSBkZWYoKVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGxvYWQgYSBkeW5hbWljIHZhcmlhYmxlXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHZhciBkeW5hbWljVmFycyA9IHt9XG4gICAgZnVuY3Rpb24gZHluICh4KSB7XG4gICAgICB2YXIgaWQgPSB4LmlkXG4gICAgICB2YXIgcmVzdWx0ID0gZHluYW1pY1ZhcnNbaWRdXG4gICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH1cbiAgICAgIGlmICh4LmZ1bmMpIHtcbiAgICAgICAgcmVzdWx0ID0gYmF0Y2guZGVmKFxuICAgICAgICAgIGxpbmsoeC5kYXRhKSwgJygnLCBBUkcsICcsJywgQkFUQ0hfSUQsICcsJywgRlJBTUVfU1RBVEUsICcpJylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlc3VsdCA9IGJhdGNoLmRlZihBUkcsICcuJywgeC5kYXRhKVxuICAgICAgfVxuICAgICAgZHluYW1pY1ZhcnNbaWRdID0gcmVzdWx0XG4gICAgICByZXR1cm4gcmVzdWx0XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHJldHJpZXZlcyB0aGUgZmlyc3QgbmFtZS1tYXRjaGluZyByZWNvcmQgZnJvbSBhbiBBY3RpdmVJbmZvIGxpc3RcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgZnVuY3Rpb24gZmluZEluZm8gKGxpc3QsIG5hbWUpIHtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGlzdC5sZW5ndGg7ICsraSkge1xuICAgICAgICBpZiAobGlzdFtpXS5uYW1lID09PSBuYW1lKSB7XG4gICAgICAgICAgcmV0dXJuIGxpc3RbaV1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gYmluZCBzaGFkZXJcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgYmF0Y2goR0wsICcudXNlUHJvZ3JhbSgnLCBQUk9HUkFNLCAnKTsnKVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHNldCBzdGF0aWMgdW5pZm9ybXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgcHJvZ3JhbS51bmlmb3Jtcy5mb3JFYWNoKGZ1bmN0aW9uICh1bmlmb3JtKSB7XG4gICAgICBpZiAodW5pZm9ybS5uYW1lIGluIHVuaWZvcm1zKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgdmFyIExPQ0FUSU9OID0gbGluayh1bmlmb3JtLmxvY2F0aW9uKVxuICAgICAgdmFyIFNUQUNLID0gbGluayh1bmlmb3JtU3RhdGUuZGVmKHVuaWZvcm0ubmFtZSkpXG4gICAgICB2YXIgVE9QID0gU1RBQ0sgKyAnWycgKyBTVEFDSyArICcubGVuZ3RoLTFdJ1xuICAgICAgdmFyIHR5cGUgPSB1bmlmb3JtLmluZm8udHlwZVxuICAgICAgaWYgKHR5cGUgPT09IEdMX1NBTVBMRVJfMkQgfHwgdHlwZSA9PT0gR0xfU0FNUExFUl9DVUJFKSB7XG4gICAgICAgIHZhciBURVhfVkFMVUUgPSBkZWYoVE9QICsgJy5fdGV4dHVyZScpXG4gICAgICAgIGJhdGNoKHNldFVuaWZvcm1TdHJpbmcoR0wsIEdMX0lOVCwgTE9DQVRJT04sIFRFWF9WQUxVRSArICcuYmluZCgpJykpXG4gICAgICAgIGV4aXQoVEVYX1ZBTFVFLCAnLnVuYmluZCgpOycpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBiYXRjaChzZXRVbmlmb3JtU3RyaW5nKEdMLCB0eXBlLCBMT0NBVElPTiwgVE9QKSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHNldCBzdGF0aWMgYXR0cmlidXRlc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBwcm9ncmFtLmF0dHJpYnV0ZXMuZm9yRWFjaChmdW5jdGlvbiAoYXR0cmlidXRlKSB7XG4gICAgICBpZiAoYXR0cmlidXRlLm5hbWUgaW4gYXR0cmlidXRlcykge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIHZhciBTVEFDSyA9IGxpbmsoYXR0cmlidXRlU3RhdGUuZGVmKGF0dHJpYnV0ZS5uYW1lKSlcbiAgICAgIGJhdGNoKEJJTkRfQVRUUklCVVRFLCAnKCcsXG4gICAgICAgIGF0dHJpYnV0ZS5sb2NhdGlvbiwgJywnLFxuICAgICAgICBsaW5rKGF0dHJpYnV0ZVN0YXRlLmJpbmRpbmdzW2F0dHJpYnV0ZS5sb2NhdGlvbl0pLCAnLCcsXG4gICAgICAgIFNUQUNLLCAnLCcsXG4gICAgICAgIHR5cGVMZW5ndGgoYXR0cmlidXRlLmluZm8udHlwZSksICcpOycpXG4gICAgfSlcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBzZXQgc3RhdGljIGVsZW1lbnQgYnVmZmVyXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIGlmICghaGFzRHluYW1pY0VsZW1lbnRzKSB7XG4gICAgICBiYXRjaChcbiAgICAgICAgJ2lmKCcsIENVUl9FTEVNRU5UUywgJyknLFxuICAgICAgICBHTCwgJy5iaW5kQnVmZmVyKCcsIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSLCAnLCcsIENVUl9FTEVNRU5UUywgJy5idWZmZXIuYnVmZmVyKTsnKVxuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBsb29wIG92ZXIgYWxsIGFyZ3VtZW50c1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBiYXRjaChcbiAgICAgICdmb3IoJywgQkFUQ0hfSUQsICc9MDsnLCBCQVRDSF9JRCwgJzwnLCBOVU1fQVJHUywgJzsrKycsIEJBVENIX0lELCAnKXsnLFxuICAgICAgQVJHLCAnPScsIEFSR1MsICdbJywgQkFUQ0hfSUQsICddOycpXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gc2V0IGR5bmFtaWMgZmxhZ3NcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgT2JqZWN0LmtleXMob3B0aW9ucykuc29ydChvcHRpb25Qcmlvcml0eSkuZm9yRWFjaChmdW5jdGlvbiAob3B0aW9uKSB7XG4gICAgICB2YXIgVkFMVUUgPSBkeW4ob3B0aW9uc1tvcHRpb25dKVxuXG4gICAgICBmdW5jdGlvbiBzZXRDYXAgKGZsYWcpIHtcbiAgICAgICAgYmF0Y2goXG4gICAgICAgICAgJ2lmKCcsIFZBTFVFLCAnKXsnLFxuICAgICAgICAgIEdMLCAnLmVuYWJsZSgnLCBmbGFnLCAnKTt9ZWxzZXsnLFxuICAgICAgICAgIEdMLCAnLmRpc2FibGUoJywgZmxhZywgJyk7fScpXG4gICAgICB9XG5cbiAgICAgIHN3aXRjaCAob3B0aW9uKSB7XG4gICAgICAgIGNhc2UgJ2ZyYW1lYnVmZmVyJzpcbiAgICAgICAgICB2YXIgVklFV1BPUlRfU1RBVEUgPSBsaW5rQ29udGV4dCgndmlld3BvcnQnKVxuICAgICAgICAgIHZhciBTQ0lTU09SX1NUQVRFID0gbGlua0NvbnRleHQoJ3NjaXNzb3IuYm94JylcbiAgICAgICAgICBiYXRjaChcbiAgICAgICAgICAgICdpZignLCBGUkFNRUJVRkZFUl9TVEFURSwgJy5wdXNoKCcsXG4gICAgICAgICAgICBWQUxVRSwgJyYmJywgVkFMVUUsICcuX2ZyYW1lYnVmZmVyKSl7JyxcbiAgICAgICAgICAgIEZSQU1FQlVGRkVSX1NUQVRFLCAnLnBvbGwoKTsnLFxuICAgICAgICAgICAgVklFV1BPUlRfU1RBVEUsICcuc2V0RGlydHkoKTsnLFxuICAgICAgICAgICAgU0NJU1NPUl9TVEFURSwgJy5zZXREaXJ0eSgpOycsXG4gICAgICAgICAgICAnfScpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICAvLyBDYXBzXG4gICAgICAgIGNhc2UgJ2N1bGwuZW5hYmxlJzpcbiAgICAgICAgICBzZXRDYXAoR0xfQ1VMTF9GQUNFKVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgJ2JsZW5kLmVuYWJsZSc6XG4gICAgICAgICAgc2V0Q2FwKEdMX0JMRU5EKVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgJ2RpdGhlcic6XG4gICAgICAgICAgc2V0Q2FwKEdMX0RJVEhFUilcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlICdzdGVuY2lsLmVuYWJsZSc6XG4gICAgICAgICAgc2V0Q2FwKEdMX1NURU5DSUxfVEVTVClcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlICdkZXB0aC5lbmFibGUnOlxuICAgICAgICAgIHNldENhcChHTF9ERVBUSF9URVNUKVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgJ3NjaXNzb3IuZW5hYmxlJzpcbiAgICAgICAgICBzZXRDYXAoR0xfU0NJU1NPUl9URVNUKVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgJ3BvbHlnb25PZmZzZXQuZW5hYmxlJzpcbiAgICAgICAgICBzZXRDYXAoR0xfUE9MWUdPTl9PRkZTRVRfRklMTClcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlICdzYW1wbGUuYWxwaGEnOlxuICAgICAgICAgIHNldENhcChHTF9TQU1QTEVfQUxQSEFfVE9fQ09WRVJBR0UpXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSAnc2FtcGxlLmVuYWJsZSc6XG4gICAgICAgICAgc2V0Q2FwKEdMX1NBTVBMRV9DT1ZFUkFHRSlcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2RlcHRoLm1hc2snOlxuICAgICAgICAgIGJhdGNoKEdMLCAnLmRlcHRoTWFzaygnLCBWQUxVRSwgJyk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2RlcHRoLmZ1bmMnOlxuICAgICAgICAgIHZhciBERVBUSF9GVU5DUyA9IGxpbmsoY29tcGFyZUZ1bmNzKVxuICAgICAgICAgIGJhdGNoKEdMLCAnLmRlcHRoRnVuYygnLCBERVBUSF9GVU5DUywgJ1snLCBWQUxVRSwgJ10pOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdkZXB0aC5yYW5nZSc6XG4gICAgICAgICAgYmF0Y2goR0wsICcuZGVwdGhSYW5nZSgnLCBWQUxVRSwgJ1swXSwnLCBWQUxVRSwgJ1sxXSk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2JsZW5kLmNvbG9yJzpcbiAgICAgICAgICBiYXRjaChHTCwgJy5ibGVuZENvbG9yKCcsXG4gICAgICAgICAgICBWQUxVRSwgJ1swXSwnLFxuICAgICAgICAgICAgVkFMVUUsICdbMV0sJyxcbiAgICAgICAgICAgIFZBTFVFLCAnWzJdLCcsXG4gICAgICAgICAgICBWQUxVRSwgJ1szXSk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2JsZW5kLmVxdWF0aW9uJzpcbiAgICAgICAgICB2YXIgQkxFTkRfRVFVQVRJT05TID0gbGluayhibGVuZEVxdWF0aW9ucylcbiAgICAgICAgICBiYXRjaChcbiAgICAgICAgICAgICdpZih0eXBlb2YgJywgVkFMVUUsICc9PT1cInN0cmluZ1wiKXsnLFxuICAgICAgICAgICAgR0wsICcuYmxlbmRFcXVhdGlvbignLCBCTEVORF9FUVVBVElPTlMsICdbJywgVkFMVUUsICddKTsnLFxuICAgICAgICAgICAgJ31lbHNleycsXG4gICAgICAgICAgICBHTCwgJy5ibGVuZEVxdWF0aW9uU2VwYXJhdGUoJyxcbiAgICAgICAgICAgIEJMRU5EX0VRVUFUSU9OUywgJ1snLCBWQUxVRSwgJy5yZ2JdLCcsXG4gICAgICAgICAgICBCTEVORF9FUVVBVElPTlMsICdbJywgVkFMVUUsICcuYWxwaGFdKTsnLFxuICAgICAgICAgICAgJ30nKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnYmxlbmQuZnVuYyc6XG4gICAgICAgICAgdmFyIEJMRU5EX0ZVTkNTID0gbGluayhibGVuZEZ1bmNzKVxuICAgICAgICAgIGJhdGNoKFxuICAgICAgICAgICAgR0wsICcuYmxlbmRGdW5jU2VwYXJhdGUoJyxcbiAgICAgICAgICAgIEJMRU5EX0ZVTkNTLFxuICAgICAgICAgICAgJ1tcInNyY1JHQlwiIGluICcsIFZBTFVFLCAnPycsIFZBTFVFLCAnLnNyY1JHQjonLCBWQUxVRSwgJy5zcmNdLCcsXG4gICAgICAgICAgICBCTEVORF9GVU5DUyxcbiAgICAgICAgICAgICdbXCJkc3RSR0JcIiBpbiAnLCBWQUxVRSwgJz8nLCBWQUxVRSwgJy5kc3RSR0I6JywgVkFMVUUsICcuZHN0XSwnLFxuICAgICAgICAgICAgQkxFTkRfRlVOQ1MsXG4gICAgICAgICAgICAnW1wic3JjQWxwaGFcIiBpbiAnLCBWQUxVRSwgJz8nLCBWQUxVRSwgJy5zcmNBbHBoYTonLCBWQUxVRSwgJy5zcmNdLCcsXG4gICAgICAgICAgICBCTEVORF9GVU5DUyxcbiAgICAgICAgICAgICdbXCJkc3RBbHBoYVwiIGluICcsIFZBTFVFLCAnPycsIFZBTFVFLCAnLmRzdEFscGhhOicsIFZBTFVFLCAnLmRzdF0pOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdzdGVuY2lsLm1hc2snOlxuICAgICAgICAgIGJhdGNoKEdMLCAnLnN0ZW5jaWxNYXNrKCcsIFZBTFVFLCAnKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnc3RlbmNpbC5mdW5jJzpcbiAgICAgICAgICB2YXIgU1RFTkNJTF9GVU5DUyA9IGxpbmsoY29tcGFyZUZ1bmNzKVxuICAgICAgICAgIGJhdGNoKEdMLCAnLnN0ZW5jaWxGdW5jKCcsXG4gICAgICAgICAgICBTVEVOQ0lMX0ZVTkNTLCAnWycsIFZBTFVFLCAnLmNtcHx8XCJhbHdheXNcIl0sJyxcbiAgICAgICAgICAgIFZBTFVFLCAnLnJlZnwwLCcsXG4gICAgICAgICAgICAnXCJtYXNrXCIgaW4gJywgVkFMVUUsICc/JywgVkFMVUUsICcubWFzazotMSk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3N0ZW5jaWwub3BGcm9udCc6XG4gICAgICAgIGNhc2UgJ3N0ZW5jaWwub3BCYWNrJzpcbiAgICAgICAgICB2YXIgU1RFTkNJTF9PUFMgPSBsaW5rKHN0ZW5jaWxPcHMpXG4gICAgICAgICAgYmF0Y2goR0wsICcuc3RlbmNpbE9wU2VwYXJhdGUoJyxcbiAgICAgICAgICAgIG9wdGlvbiA9PT0gJ3N0ZW5jaWwub3BGcm9udCcgPyBHTF9GUk9OVCA6IEdMX0JBQ0ssICcsJyxcbiAgICAgICAgICAgIFNURU5DSUxfT1BTLCAnWycsIFZBTFVFLCAnLmZhaWx8fFwia2VlcFwiXSwnLFxuICAgICAgICAgICAgU1RFTkNJTF9PUFMsICdbJywgVkFMVUUsICcuemZhaWx8fFwia2VlcFwiXSwnLFxuICAgICAgICAgICAgU1RFTkNJTF9PUFMsICdbJywgVkFMVUUsICcucGFzc3x8XCJrZWVwXCJdKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAncG9seWdvbk9mZnNldC5vZmZzZXQnOlxuICAgICAgICAgIGJhdGNoKEdMLCAnLnBvbHlnb25PZmZzZXQoJyxcbiAgICAgICAgICAgIFZBTFVFLCAnLmZhY3Rvcnx8MCwnLFxuICAgICAgICAgICAgVkFMVUUsICcudW5pdHN8fDApOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdjdWxsLmZhY2UnOlxuICAgICAgICAgIGJhdGNoKEdMLCAnLmN1bGxGYWNlKCcsXG4gICAgICAgICAgICBWQUxVRSwgJz09PVwiZnJvbnRcIj8nLCBHTF9GUk9OVCwgJzonLCBHTF9CQUNLLCAnKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnbGluZVdpZHRoJzpcbiAgICAgICAgICBiYXRjaChHTCwgJy5saW5lV2lkdGgoJywgVkFMVUUsICcpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdmcm9udEZhY2UnOlxuICAgICAgICAgIGJhdGNoKEdMLCAnLmZyb250RmFjZSgnLFxuICAgICAgICAgICAgVkFMVUUsICc9PT1cImN3XCI/JywgR0xfQ1csICc6JywgR0xfQ0NXLCAnKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnY29sb3JNYXNrJzpcbiAgICAgICAgICBiYXRjaChHTCwgJy5jb2xvck1hc2soJyxcbiAgICAgICAgICAgIFZBTFVFLCAnWzBdLCcsXG4gICAgICAgICAgICBWQUxVRSwgJ1sxXSwnLFxuICAgICAgICAgICAgVkFMVUUsICdbMl0sJyxcbiAgICAgICAgICAgIFZBTFVFLCAnWzNdKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnc2FtcGxlLmNvdmVyYWdlJzpcbiAgICAgICAgICBiYXRjaChHTCwgJy5zYW1wbGVDb3ZlcmFnZSgnLFxuICAgICAgICAgICAgVkFMVUUsICcudmFsdWUsJyxcbiAgICAgICAgICAgIFZBTFVFLCAnLmludmVydCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3NjaXNzb3IuYm94JzpcbiAgICAgICAgY2FzZSAndmlld3BvcnQnOlxuICAgICAgICAgIHZhciBCT1hfU1RBVEUgPSBsaW5rQ29udGV4dChvcHRpb24pXG4gICAgICAgICAgYmF0Y2goQk9YX1NUQVRFLCAnLnB1c2goJyxcbiAgICAgICAgICAgIFZBTFVFLCAnLnh8fDAsJyxcbiAgICAgICAgICAgIFZBTFVFLCAnLnl8fDAsJyxcbiAgICAgICAgICAgIFZBTFVFLCAnLnd8fC0xLCcsXG4gICAgICAgICAgICBWQUxVRSwgJy5ofHwtMSk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3ByaW1pdGl2ZSc6XG4gICAgICAgIGNhc2UgJ29mZnNldCc6XG4gICAgICAgIGNhc2UgJ2NvdW50JzpcbiAgICAgICAgY2FzZSAnZWxlbWVudHMnOlxuICAgICAgICBjYXNlICdpbnN0YW5jZXMnOlxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICBcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8gdXBkYXRlIHZpZXdwb3J0L3NjaXNzb3IgYm94IHN0YXRlIGFuZCByZXN0b3JlIGZyYW1lYnVmZmVyXG4gICAgaWYgKCd2aWV3cG9ydCcgaW4gb3B0aW9ucyB8fCAnZnJhbWVidWZmZXInIGluIG9wdGlvbnMpIHtcbiAgICAgIGJhdGNoKGxpbmtDb250ZXh0KCd2aWV3cG9ydCcpLCAnLnBvbGwoKTsnKVxuICAgIH1cbiAgICBpZiAoJ3NjaXNzb3IuYm94JyBpbiBvcHRpb25zIHx8ICdmcmFtZWJ1ZmZlcicgaW4gb3B0aW9ucykge1xuICAgICAgYmF0Y2gobGlua0NvbnRleHQoJ3NjaXNzb3IuYm94JyksICcucG9sbCgpOycpXG4gICAgfVxuICAgIGlmICgnZnJhbWVidWZmZXInIGluIG9wdGlvbnMpIHtcbiAgICAgIGJhdGNoKEZSQU1FQlVGRkVSX1NUQVRFLCAnLnBvcCgpOycpXG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHNldCBkeW5hbWljIHVuaWZvcm1zXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHZhciBwcm9ncmFtVW5pZm9ybXMgPSBwcm9ncmFtLnVuaWZvcm1zXG4gICAgdmFyIERZTkFNSUNfVEVYVFVSRVMgPSBbXVxuICAgIE9iamVjdC5rZXlzKHVuaWZvcm1zKS5mb3JFYWNoKGZ1bmN0aW9uICh1bmlmb3JtKSB7XG4gICAgICB2YXIgZGF0YSA9IGZpbmRJbmZvKHByb2dyYW1Vbmlmb3JtcywgdW5pZm9ybSlcbiAgICAgIGlmICghZGF0YSkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIHZhciBUWVBFID0gZGF0YS5pbmZvLnR5cGVcbiAgICAgIHZhciBMT0NBVElPTiA9IGxpbmsoZGF0YS5sb2NhdGlvbilcbiAgICAgIHZhciBWQUxVRSA9IGR5bih1bmlmb3Jtc1t1bmlmb3JtXSlcbiAgICAgIGlmIChkYXRhLmluZm8udHlwZSA9PT0gR0xfU0FNUExFUl8yRCB8fFxuICAgICAgICAgIGRhdGEuaW5mby50eXBlID09PSBHTF9TQU1QTEVSX0NVQkUpIHtcbiAgICAgICAgdmFyIFRFWF9WQUxVRSA9IGRlZihWQUxVRSArICcuX3RleHR1cmUnKVxuICAgICAgICBEWU5BTUlDX1RFWFRVUkVTLnB1c2goVEVYX1ZBTFVFKVxuICAgICAgICBiYXRjaChzZXRVbmlmb3JtU3RyaW5nKEdMLCBHTF9JTlQsIExPQ0FUSU9OLCBURVhfVkFMVUUgKyAnLmJpbmQoKScpKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYmF0Y2goc2V0VW5pZm9ybVN0cmluZyhHTCwgVFlQRSwgTE9DQVRJT04sIFZBTFVFKSlcbiAgICAgIH1cbiAgICB9KVxuICAgIERZTkFNSUNfVEVYVFVSRVMuZm9yRWFjaChmdW5jdGlvbiAoVkFMVUUpIHtcbiAgICAgIGJhdGNoKFZBTFVFLCAnLnVuYmluZCgpOycpXG4gICAgfSlcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBzZXQgZHluYW1pYyBhdHRyaWJ1dGVzXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHZhciBwcm9ncmFtQXR0cmlidXRlcyA9IHByb2dyYW0uYXR0cmlidXRlc1xuICAgIE9iamVjdC5rZXlzKGF0dHJpYnV0ZXMpLmZvckVhY2goZnVuY3Rpb24gKGF0dHJpYnV0ZSkge1xuICAgICAgdmFyIGRhdGEgPSBmaW5kSW5mbyhwcm9ncmFtQXR0cmlidXRlcywgYXR0cmlidXRlKVxuICAgICAgaWYgKCFkYXRhKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgdmFyIEJPWCA9IGxpbmsoYXR0cmlidXRlU3RhdGUuYm94KGF0dHJpYnV0ZSkpXG4gICAgICB2YXIgQVRUUklCX1ZBTFVFID0gZHluKGF0dHJpYnV0ZXNbYXR0cmlidXRlXSlcbiAgICAgIHZhciBSRUNPUkQgPSBkZWYoQk9YICsgJy5hbGxvYygnICsgQVRUUklCX1ZBTFVFICsgJyknKVxuICAgICAgYmF0Y2goQklORF9BVFRSSUJVVEVfUkVDT1JELCAnKCcsXG4gICAgICAgIGRhdGEubG9jYXRpb24sICcsJyxcbiAgICAgICAgbGluayhhdHRyaWJ1dGVTdGF0ZS5iaW5kaW5nc1tkYXRhLmxvY2F0aW9uXSksICcsJyxcbiAgICAgICAgUkVDT1JELCAnLCcsXG4gICAgICAgIHR5cGVMZW5ndGgoZGF0YS5pbmZvLnR5cGUpLCAnKTsnKVxuICAgICAgZXhpdChCT1gsICcuZnJlZSgnLCBSRUNPUkQsICcpOycpXG4gICAgfSlcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBzZXQgZHluYW1pYyBhdHRyaWJ1dGVzXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gICAgaWYgKG9wdGlvbnMuY291bnQpIHtcbiAgICAgIGJhdGNoKENVUl9DT1VOVCwgJz0nLCBkeW4ob3B0aW9ucy5jb3VudCksICc7JylcbiAgICB9XG4gICAgaWYgKG9wdGlvbnMub2Zmc2V0KSB7XG4gICAgICBiYXRjaChDVVJfT0ZGU0VULCAnPScsIGR5bihvcHRpb25zLm9mZnNldCksICc7JylcbiAgICB9XG4gICAgaWYgKG9wdGlvbnMucHJpbWl0aXZlKSB7XG4gICAgICBiYXRjaChcbiAgICAgICAgQ1VSX1BSSU1JVElWRSwgJz0nLCBsaW5rKHByaW1UeXBlcyksICdbJywgZHluKG9wdGlvbnMucHJpbWl0aXZlKSwgJ107JylcbiAgICB9XG4gICAgaWYgKGluc3RhbmNpbmcgJiYgb3B0aW9ucy5pbnN0YW5jZXMpIHtcbiAgICAgIGJhdGNoKENVUl9JTlNUQU5DRVMsICc9JywgZHluKG9wdGlvbnMuaW5zdGFuY2VzKSwgJzsnKVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHVzZUVsZW1lbnRPcHRpb24gKHgpIHtcbiAgICAgIHJldHVybiBoYXNEeW5hbWljRWxlbWVudHMgJiYgISh4IGluIG9wdGlvbnMgfHwgeCBpbiBzdGF0aWNPcHRpb25zKVxuICAgIH1cbiAgICBpZiAoaGFzRHluYW1pY0VsZW1lbnRzKSB7XG4gICAgICB2YXIgZHluRWxlbWVudHMgPSBkeW4ob3B0aW9ucy5lbGVtZW50cylcbiAgICAgIGJhdGNoKENVUl9FTEVNRU5UUywgJz0nLFxuICAgICAgICBkeW5FbGVtZW50cywgJz8nLCBkeW5FbGVtZW50cywgJy5fZWxlbWVudHM6bnVsbDsnKVxuICAgIH1cbiAgICBpZiAodXNlRWxlbWVudE9wdGlvbignb2Zmc2V0JykpIHtcbiAgICAgIGJhdGNoKENVUl9PRkZTRVQsICc9MDsnKVxuICAgIH1cblxuICAgIC8vIEVtaXQgZHJhdyBjb21tYW5kXG4gICAgYmF0Y2goJ2lmKCcsIENVUl9FTEVNRU5UUywgJyl7JylcbiAgICBpZiAodXNlRWxlbWVudE9wdGlvbignY291bnQnKSkge1xuICAgICAgYmF0Y2goQ1VSX0NPVU5ULCAnPScsIENVUl9FTEVNRU5UUywgJy52ZXJ0Q291bnQ7JylcbiAgICB9XG4gICAgYmF0Y2goJ2lmKCcsIENVUl9DT1VOVCwgJz4wKXsnKVxuICAgIGlmICh1c2VFbGVtZW50T3B0aW9uKCdwcmltaXRpdmUnKSkge1xuICAgICAgYmF0Y2goQ1VSX1BSSU1JVElWRSwgJz0nLCBDVVJfRUxFTUVOVFMsICcucHJpbVR5cGU7JylcbiAgICB9XG4gICAgaWYgKGhhc0R5bmFtaWNFbGVtZW50cykge1xuICAgICAgYmF0Y2goXG4gICAgICAgIEdMLFxuICAgICAgICAnLmJpbmRCdWZmZXIoJyxcbiAgICAgICAgR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIsICcsJyxcbiAgICAgICAgQ1VSX0VMRU1FTlRTLCAnLmJ1ZmZlci5idWZmZXIpOycpXG4gICAgfVxuICAgIGlmIChpbnN0YW5jaW5nKSB7XG4gICAgICBiYXRjaChcbiAgICAgICAgJ2lmKCcsIENVUl9JTlNUQU5DRVMsICc+MCl7JyxcbiAgICAgICAgSU5TVEFOQ0VfRVhULCAnLmRyYXdFbGVtZW50c0luc3RhbmNlZEFOR0xFKCcsXG4gICAgICAgIENVUl9QUklNSVRJVkUsICcsJyxcbiAgICAgICAgQ1VSX0NPVU5ULCAnLCcsXG4gICAgICAgIENVUl9FTEVNRU5UUywgJy50eXBlLCcsXG4gICAgICAgIENVUl9PRkZTRVQsICcsJyxcbiAgICAgICAgQ1VSX0lOU1RBTkNFUywgJyk7fWVsc2UgJylcbiAgICB9XG4gICAgYmF0Y2goXG4gICAgICBHTCwgJy5kcmF3RWxlbWVudHMoJyxcbiAgICAgIENVUl9QUklNSVRJVkUsICcsJyxcbiAgICAgIENVUl9DT1VOVCwgJywnLFxuICAgICAgQ1VSX0VMRU1FTlRTLCAnLnR5cGUsJyxcbiAgICAgIENVUl9PRkZTRVQsICcpOycpXG4gICAgYmF0Y2goJ319ZWxzZSBpZignLCBDVVJfQ09VTlQsICc+MCl7JylcbiAgICBpZiAoIXVzZUVsZW1lbnRPcHRpb24oJ2NvdW50JykpIHtcbiAgICAgIGlmICh1c2VFbGVtZW50T3B0aW9uKCdwcmltaXRpdmUnKSkge1xuICAgICAgICBiYXRjaChDVVJfUFJJTUlUSVZFLCAnPScsIEdMX1RSSUFOR0xFUywgJzsnKVxuICAgICAgfVxuICAgICAgaWYgKGluc3RhbmNpbmcpIHtcbiAgICAgICAgYmF0Y2goXG4gICAgICAgICAgJ2lmKCcsIENVUl9JTlNUQU5DRVMsICc+MCl7JyxcbiAgICAgICAgICBJTlNUQU5DRV9FWFQsICcuZHJhd0FycmF5c0luc3RhbmNlZEFOR0xFKCcsXG4gICAgICAgICAgQ1VSX1BSSU1JVElWRSwgJywnLFxuICAgICAgICAgIENVUl9PRkZTRVQsICcsJyxcbiAgICAgICAgICBDVVJfQ09VTlQsICcsJyxcbiAgICAgICAgICBDVVJfSU5TVEFOQ0VTLCAnKTt9ZWxzZXsnKVxuICAgICAgfVxuICAgICAgYmF0Y2goXG4gICAgICAgIEdMLCAnLmRyYXdBcnJheXMoJyxcbiAgICAgICAgQ1VSX1BSSU1JVElWRSwgJywnLFxuICAgICAgICBDVVJfT0ZGU0VULCAnLCcsXG4gICAgICAgIENVUl9DT1VOVCwgJyk7JylcbiAgICAgIGlmIChpbnN0YW5jaW5nKSB7XG4gICAgICAgIGJhdGNoKCd9JylcbiAgICAgIH1cbiAgICB9XG4gICAgYmF0Y2goJ319JywgZXhpdClcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBjb21waWxlIGFuZCByZXR1cm5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgcmV0dXJuIGVudi5jb21waWxlKCkuYmF0Y2hcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gTUFJTiBEUkFXIENPTU1BTkRcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICBmdW5jdGlvbiBjb21waWxlQ29tbWFuZCAoXG4gICAgc3RhdGljT3B0aW9ucywgc3RhdGljVW5pZm9ybXMsIHN0YXRpY0F0dHJpYnV0ZXMsXG4gICAgZHluYW1pY09wdGlvbnMsIGR5bmFtaWNVbmlmb3JtcywgZHluYW1pY0F0dHJpYnV0ZXMsXG4gICAgaGFzRHluYW1pYykge1xuICAgIC8vIENyZWF0ZSBjb2RlIGdlbmVyYXRpb24gZW52aXJvbm1lbnRcbiAgICB2YXIgZW52ID0gY3JlYXRlRW52aXJvbm1lbnQoKVxuICAgIHZhciBsaW5rID0gZW52LmxpbmtcbiAgICB2YXIgYmxvY2sgPSBlbnYuYmxvY2tcbiAgICB2YXIgcHJvYyA9IGVudi5wcm9jXG5cbiAgICB2YXIgY2FsbElkID0gZHJhd0NhbGxDb3VudGVyKytcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBDb21tb24gc3RhdGUgdmFyaWFibGVzXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHZhciBHTF9QT0xMID0gbGluayhyZWdsUG9sbClcbiAgICB2YXIgU0hBREVSX1NUQVRFID0gbGluayhzaGFkZXJTdGF0ZSlcbiAgICB2YXIgRlJBTUVCVUZGRVJfU1RBVEUgPSBsaW5rKGZyYW1lYnVmZmVyU3RhdGUpXG4gICAgdmFyIERSQVdfU1RBVEUgPSB7XG4gICAgICBjb3VudDogbGluayhkcmF3U3RhdGUuY291bnQpLFxuICAgICAgb2Zmc2V0OiBsaW5rKGRyYXdTdGF0ZS5vZmZzZXQpLFxuICAgICAgaW5zdGFuY2VzOiBsaW5rKGRyYXdTdGF0ZS5pbnN0YW5jZXMpLFxuICAgICAgcHJpbWl0aXZlOiBsaW5rKGRyYXdTdGF0ZS5wcmltaXRpdmUpXG4gICAgfVxuICAgIHZhciBFTEVNRU5UX1NUQVRFID0gbGluayhlbGVtZW50U3RhdGUuZWxlbWVudHMpXG4gICAgdmFyIFBSSU1fVFlQRVMgPSBsaW5rKHByaW1UeXBlcylcbiAgICB2YXIgQ09NUEFSRV9GVU5DUyA9IGxpbmsoY29tcGFyZUZ1bmNzKVxuICAgIHZhciBTVEVOQ0lMX09QUyA9IGxpbmsoc3RlbmNpbE9wcylcblxuICAgIHZhciBDT05URVhUX1NUQVRFID0ge31cbiAgICBmdW5jdGlvbiBsaW5rQ29udGV4dCAoeCkge1xuICAgICAgdmFyIHJlc3VsdCA9IENPTlRFWFRfU1RBVEVbeF1cbiAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgfVxuICAgICAgcmVzdWx0ID0gQ09OVEVYVF9TVEFURVt4XSA9IGxpbmsoY29udGV4dFN0YXRlW3hdKVxuICAgICAgcmV0dXJuIHJlc3VsdFxuICAgIH1cblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBTVEFUSUMgU1RBVEVcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gQ29kZSBibG9ja3MgZm9yIHRoZSBzdGF0aWMgc2VjdGlvbnNcbiAgICB2YXIgZW50cnkgPSBibG9jaygpXG4gICAgdmFyIGV4aXQgPSBibG9jaygpXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gdXBkYXRlIGRlZmF1bHQgY29udGV4dCBzdGF0ZSB2YXJpYWJsZXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgZnVuY3Rpb24gaGFuZGxlU3RhdGljT3B0aW9uIChwYXJhbSwgdmFsdWUpIHtcbiAgICAgIHZhciBTVEFURV9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgZW50cnkoU1RBVEVfU1RBQ0ssICcucHVzaCgnLCB2YWx1ZSwgJyk7JylcbiAgICAgIGV4aXQoU1RBVEVfU1RBQ0ssICcucG9wKCk7JylcbiAgICB9XG5cbiAgICBPYmplY3Qua2V5cyhzdGF0aWNPcHRpb25zKS5zb3J0KG9wdGlvblByaW9yaXR5KS5mb3JFYWNoKGZ1bmN0aW9uIChwYXJhbSkge1xuICAgICAgdmFyIHZhbHVlID0gc3RhdGljT3B0aW9uc1twYXJhbV1cbiAgICAgIHN3aXRjaCAocGFyYW0pIHtcbiAgICAgICAgY2FzZSAnZnJhZyc6XG4gICAgICAgIGNhc2UgJ3ZlcnQnOlxuICAgICAgICAgIHZhciBzaGFkZXJJZCA9IHN0cmluZ1N0b3JlLmlkKHZhbHVlKVxuICAgICAgICAgIHNoYWRlclN0YXRlLnNoYWRlcihcbiAgICAgICAgICAgIHBhcmFtID09PSAnZnJhZycgPyBHTF9GUkFHTUVOVF9TSEFERVIgOiBHTF9WRVJURVhfU0hBREVSLFxuICAgICAgICAgICAgc2hhZGVySWQpXG4gICAgICAgICAgZW50cnkoU0hBREVSX1NUQVRFLCAnLicsIHBhcmFtLCAnLnB1c2goJywgc2hhZGVySWQsICcpOycpXG4gICAgICAgICAgZXhpdChTSEFERVJfU1RBVEUsICcuJywgcGFyYW0sICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2ZyYW1lYnVmZmVyJzpcbiAgICAgICAgICB2YXIgZmJvID0gZnJhbWVidWZmZXJTdGF0ZS5nZXRGcmFtZWJ1ZmZlcih2YWx1ZSlcbiAgICAgICAgICBcbiAgICAgICAgICB2YXIgVklFV1BPUlRfU1RBVEUgPSBsaW5rQ29udGV4dCgndmlld3BvcnQnKVxuICAgICAgICAgIHZhciBTQ0lTU09SX1NUQVRFID0gbGlua0NvbnRleHQoJ3NjaXNzb3IuYm94JylcbiAgICAgICAgICBlbnRyeSgnaWYoJywgRlJBTUVCVUZGRVJfU1RBVEUsICcucHVzaCgnLCBsaW5rKFxuICAgICAgICAgICAgdmFsdWUgJiYgdmFsdWUuX2ZyYW1lYnVmZmVyKSwgJykpeycsXG4gICAgICAgICAgICBWSUVXUE9SVF9TVEFURSwgJy5zZXREaXJ0eSgpOycsXG4gICAgICAgICAgICBTQ0lTU09SX1NUQVRFLCAnLnNldERpcnR5KCk7JyxcbiAgICAgICAgICAgICd9JylcbiAgICAgICAgICBleGl0KCdpZignLCBGUkFNRUJVRkZFUl9TVEFURSwgJy5wb3AoKSl7JyxcbiAgICAgICAgICAgIFZJRVdQT1JUX1NUQVRFLCAnLnNldERpcnR5KCk7JyxcbiAgICAgICAgICAgIFNDSVNTT1JfU1RBVEUsICcuc2V0RGlydHkoKTsnLFxuICAgICAgICAgICAgJ30nKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgLy8gVXBkYXRlIGRyYXcgc3RhdGVcbiAgICAgICAgY2FzZSAnY291bnQnOlxuICAgICAgICBjYXNlICdvZmZzZXQnOlxuICAgICAgICBjYXNlICdpbnN0YW5jZXMnOlxuICAgICAgICAgIFxuICAgICAgICAgIGVudHJ5KERSQVdfU1RBVEVbcGFyYW1dLCAnLnB1c2goJywgdmFsdWUsICcpOycpXG4gICAgICAgICAgZXhpdChEUkFXX1NUQVRFW3BhcmFtXSwgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgLy8gVXBkYXRlIHByaW1pdGl2ZSB0eXBlXG4gICAgICAgIGNhc2UgJ3ByaW1pdGl2ZSc6XG4gICAgICAgICAgXG4gICAgICAgICAgdmFyIHByaW1UeXBlID0gcHJpbVR5cGVzW3ZhbHVlXVxuICAgICAgICAgIGVudHJ5KERSQVdfU1RBVEUucHJpbWl0aXZlLCAnLnB1c2goJywgcHJpbVR5cGUsICcpOycpXG4gICAgICAgICAgZXhpdChEUkFXX1NUQVRFLnByaW1pdGl2ZSwgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgLy8gVXBkYXRlIGVsZW1lbnQgYnVmZmVyXG4gICAgICAgIGNhc2UgJ2VsZW1lbnRzJzpcbiAgICAgICAgICB2YXIgZWxlbWVudHMgPSBlbGVtZW50U3RhdGUuZ2V0RWxlbWVudHModmFsdWUpXG4gICAgICAgICAgdmFyIGhhc1ByaW1pdGl2ZSA9ICEoJ3ByaW1pdGl2ZScgaW4gc3RhdGljT3B0aW9ucylcbiAgICAgICAgICB2YXIgaGFzQ291bnQgPSAhKCdjb3VudCcgaW4gc3RhdGljT3B0aW9ucylcbiAgICAgICAgICBpZiAoZWxlbWVudHMpIHtcbiAgICAgICAgICAgIHZhciBFTEVNRU5UUyA9IGxpbmsoZWxlbWVudHMpXG4gICAgICAgICAgICBlbnRyeShFTEVNRU5UX1NUQVRFLCAnLnB1c2goJywgRUxFTUVOVFMsICcpOycpXG4gICAgICAgICAgICBpZiAoaGFzUHJpbWl0aXZlKSB7XG4gICAgICAgICAgICAgIGVudHJ5KERSQVdfU1RBVEUucHJpbWl0aXZlLCAnLnB1c2goJywgRUxFTUVOVFMsICcucHJpbVR5cGUpOycpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaGFzQ291bnQpIHtcbiAgICAgICAgICAgICAgZW50cnkoRFJBV19TVEFURS5jb3VudCwgJy5wdXNoKCcsIEVMRU1FTlRTLCAnLnZlcnRDb3VudCk7JylcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZW50cnkoRUxFTUVOVF9TVEFURSwgJy5wdXNoKG51bGwpOycpXG4gICAgICAgICAgICBpZiAoaGFzUHJpbWl0aXZlKSB7XG4gICAgICAgICAgICAgIGVudHJ5KERSQVdfU1RBVEUucHJpbWl0aXZlLCAnLnB1c2goJywgR0xfVFJJQU5HTEVTLCAnKTsnKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGhhc0NvdW50KSB7XG4gICAgICAgICAgICAgIGVudHJ5KERSQVdfU1RBVEUuY291bnQsICcucHVzaCgwKTsnKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoaGFzUHJpbWl0aXZlKSB7XG4gICAgICAgICAgICBleGl0KERSQVdfU1RBVEUucHJpbWl0aXZlLCAnLnBvcCgpOycpXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChoYXNDb3VudCkge1xuICAgICAgICAgICAgZXhpdChEUkFXX1NUQVRFLmNvdW50LCAnLnBvcCgpOycpXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICghKCdvZmZzZXQnIGluIHN0YXRpY09wdGlvbnMpKSB7XG4gICAgICAgICAgICBlbnRyeShEUkFXX1NUQVRFLm9mZnNldCwgJy5wdXNoKDApOycpXG4gICAgICAgICAgICBleGl0KERSQVdfU1RBVEUub2Zmc2V0LCAnLnBvcCgpOycpXG4gICAgICAgICAgfVxuICAgICAgICAgIGV4aXQoRUxFTUVOVF9TVEFURSwgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnY3VsbC5lbmFibGUnOlxuICAgICAgICBjYXNlICdibGVuZC5lbmFibGUnOlxuICAgICAgICBjYXNlICdkaXRoZXInOlxuICAgICAgICBjYXNlICdzdGVuY2lsLmVuYWJsZSc6XG4gICAgICAgIGNhc2UgJ2RlcHRoLmVuYWJsZSc6XG4gICAgICAgIGNhc2UgJ3NjaXNzb3IuZW5hYmxlJzpcbiAgICAgICAgY2FzZSAncG9seWdvbk9mZnNldC5lbmFibGUnOlxuICAgICAgICBjYXNlICdzYW1wbGUuYWxwaGEnOlxuICAgICAgICBjYXNlICdzYW1wbGUuZW5hYmxlJzpcbiAgICAgICAgY2FzZSAnZGVwdGgubWFzayc6XG4gICAgICAgICAgXG4gICAgICAgICAgaGFuZGxlU3RhdGljT3B0aW9uKHBhcmFtLCB2YWx1ZSlcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2RlcHRoLmZ1bmMnOlxuICAgICAgICAgIFxuICAgICAgICAgIGhhbmRsZVN0YXRpY09wdGlvbihwYXJhbSwgY29tcGFyZUZ1bmNzW3ZhbHVlXSlcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2RlcHRoLnJhbmdlJzpcbiAgICAgICAgICBcbiAgICAgICAgICB2YXIgREVQVEhfUkFOR0VfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBlbnRyeShERVBUSF9SQU5HRV9TVEFDSywgJy5wdXNoKCcsIHZhbHVlWzBdLCAnLCcsIHZhbHVlWzFdLCAnKTsnKVxuICAgICAgICAgIGV4aXQoREVQVEhfUkFOR0VfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2JsZW5kLmZ1bmMnOlxuICAgICAgICAgIHZhciBCTEVORF9GVU5DX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgXG4gICAgICAgICAgdmFyIHNyY1JHQiA9ICgnc3JjUkdCJyBpbiB2YWx1ZSA/IHZhbHVlLnNyY1JHQiA6IHZhbHVlLnNyYylcbiAgICAgICAgICB2YXIgc3JjQWxwaGEgPSAoJ3NyY0FscGhhJyBpbiB2YWx1ZSA/IHZhbHVlLnNyY0FscGhhIDogdmFsdWUuc3JjKVxuICAgICAgICAgIHZhciBkc3RSR0IgPSAoJ2RzdFJHQicgaW4gdmFsdWUgPyB2YWx1ZS5kc3RSR0IgOiB2YWx1ZS5kc3QpXG4gICAgICAgICAgdmFyIGRzdEFscGhhID0gKCdkc3RBbHBoYScgaW4gdmFsdWUgPyB2YWx1ZS5kc3RBbHBoYSA6IHZhbHVlLmRzdClcbiAgICAgICAgICBcbiAgICAgICAgICBcbiAgICAgICAgICBcbiAgICAgICAgICBcbiAgICAgICAgICBlbnRyeShCTEVORF9GVU5DX1NUQUNLLCAnLnB1c2goJyxcbiAgICAgICAgICAgIGJsZW5kRnVuY3Nbc3JjUkdCXSwgJywnLFxuICAgICAgICAgICAgYmxlbmRGdW5jc1tkc3RSR0JdLCAnLCcsXG4gICAgICAgICAgICBibGVuZEZ1bmNzW3NyY0FscGhhXSwgJywnLFxuICAgICAgICAgICAgYmxlbmRGdW5jc1tkc3RBbHBoYV0sICcpOycpXG4gICAgICAgICAgZXhpdChCTEVORF9GVU5DX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdibGVuZC5lcXVhdGlvbic6XG4gICAgICAgICAgdmFyIEJMRU5EX0VRVUFUSU9OX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZW50cnkoQkxFTkRfRVFVQVRJT05fU1RBQ0ssXG4gICAgICAgICAgICAgICcucHVzaCgnLFxuICAgICAgICAgICAgICBibGVuZEVxdWF0aW9uc1t2YWx1ZV0sICcsJyxcbiAgICAgICAgICAgICAgYmxlbmRFcXVhdGlvbnNbdmFsdWVdLCAnKTsnKVxuICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGVudHJ5KEJMRU5EX0VRVUFUSU9OX1NUQUNLLFxuICAgICAgICAgICAgICAnLnB1c2goJyxcbiAgICAgICAgICAgICAgYmxlbmRFcXVhdGlvbnNbdmFsdWUucmdiXSwgJywnLFxuICAgICAgICAgICAgICBibGVuZEVxdWF0aW9uc1t2YWx1ZS5hbHBoYV0sICcpOycpXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgIH1cbiAgICAgICAgICBleGl0KEJMRU5EX0VRVUFUSU9OX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdibGVuZC5jb2xvcic6XG4gICAgICAgICAgXG4gICAgICAgICAgdmFyIEJMRU5EX0NPTE9SX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZW50cnkoQkxFTkRfQ09MT1JfU1RBQ0ssXG4gICAgICAgICAgICAnLnB1c2goJyxcbiAgICAgICAgICAgIHZhbHVlWzBdLCAnLCcsXG4gICAgICAgICAgICB2YWx1ZVsxXSwgJywnLFxuICAgICAgICAgICAgdmFsdWVbMl0sICcsJyxcbiAgICAgICAgICAgIHZhbHVlWzNdLCAnKTsnKVxuICAgICAgICAgIGV4aXQoQkxFTkRfQ09MT1JfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3N0ZW5jaWwubWFzayc6XG4gICAgICAgICAgXG4gICAgICAgICAgdmFyIFNURU5DSUxfTUFTS19TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGVudHJ5KFNURU5DSUxfTUFTS19TVEFDSywgJy5wdXNoKCcsIHZhbHVlLCAnKTsnKVxuICAgICAgICAgIGV4aXQoU1RFTkNJTF9NQVNLX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdzdGVuY2lsLmZ1bmMnOlxuICAgICAgICAgIFxuICAgICAgICAgIHZhciBjbXAgPSB2YWx1ZS5jbXAgfHwgJ2tlZXAnXG4gICAgICAgICAgdmFyIHJlZiA9IHZhbHVlLnJlZiB8fCAwXG4gICAgICAgICAgdmFyIG1hc2sgPSAnbWFzaycgaW4gdmFsdWUgPyB2YWx1ZS5tYXNrIDogLTFcbiAgICAgICAgICBcbiAgICAgICAgICBcbiAgICAgICAgICBcbiAgICAgICAgICB2YXIgU1RFTkNJTF9GVU5DX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZW50cnkoU1RFTkNJTF9GVU5DX1NUQUNLLCAnLnB1c2goJyxcbiAgICAgICAgICAgIGNvbXBhcmVGdW5jc1tjbXBdLCAnLCcsXG4gICAgICAgICAgICByZWYsICcsJyxcbiAgICAgICAgICAgIG1hc2ssICcpOycpXG4gICAgICAgICAgZXhpdChTVEVOQ0lMX0ZVTkNfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3N0ZW5jaWwub3BGcm9udCc6XG4gICAgICAgIGNhc2UgJ3N0ZW5jaWwub3BCYWNrJzpcbiAgICAgICAgICBcbiAgICAgICAgICB2YXIgZmFpbCA9IHZhbHVlLmZhaWwgfHwgJ2tlZXAnXG4gICAgICAgICAgdmFyIHpmYWlsID0gdmFsdWUuemZhaWwgfHwgJ2tlZXAnXG4gICAgICAgICAgdmFyIHBhc3MgPSB2YWx1ZS5wYXNzIHx8ICdrZWVwJ1xuICAgICAgICAgIFxuICAgICAgICAgIFxuICAgICAgICAgIFxuICAgICAgICAgIHZhciBTVEVOQ0lMX09QX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZW50cnkoU1RFTkNJTF9PUF9TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICBzdGVuY2lsT3BzW2ZhaWxdLCAnLCcsXG4gICAgICAgICAgICBzdGVuY2lsT3BzW3pmYWlsXSwgJywnLFxuICAgICAgICAgICAgc3RlbmNpbE9wc1twYXNzXSwgJyk7JylcbiAgICAgICAgICBleGl0KFNURU5DSUxfT1BfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3BvbHlnb25PZmZzZXQub2Zmc2V0JzpcbiAgICAgICAgICBcbiAgICAgICAgICB2YXIgZmFjdG9yID0gdmFsdWUuZmFjdG9yIHx8IDBcbiAgICAgICAgICB2YXIgdW5pdHMgPSB2YWx1ZS51bml0cyB8fCAwXG4gICAgICAgICAgXG4gICAgICAgICAgXG4gICAgICAgICAgdmFyIFBPTFlHT05fT0ZGU0VUX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZW50cnkoUE9MWUdPTl9PRkZTRVRfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgZmFjdG9yLCAnLCcsIHVuaXRzLCAnKTsnKVxuICAgICAgICAgIGV4aXQoUE9MWUdPTl9PRkZTRVRfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2N1bGwuZmFjZSc6XG4gICAgICAgICAgdmFyIGZhY2UgPSAwXG4gICAgICAgICAgaWYgKHZhbHVlID09PSAnZnJvbnQnKSB7XG4gICAgICAgICAgICBmYWNlID0gR0xfRlJPTlRcbiAgICAgICAgICB9IGVsc2UgaWYgKHZhbHVlID09PSAnYmFjaycpIHtcbiAgICAgICAgICAgIGZhY2UgPSBHTF9CQUNLXG4gICAgICAgICAgfVxuICAgICAgICAgIFxuICAgICAgICAgIHZhciBDVUxMX0ZBQ0VfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBlbnRyeShDVUxMX0ZBQ0VfU1RBQ0ssICcucHVzaCgnLCBmYWNlLCAnKTsnKVxuICAgICAgICAgIGV4aXQoQ1VMTF9GQUNFX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdsaW5lV2lkdGgnOlxuICAgICAgICAgIHZhciBsaW5lV2lkdGhEaW1zID0gbGltaXRzLmxpbmVXaWR0aERpbXNcbiAgICAgICAgICBcbiAgICAgICAgICBoYW5kbGVTdGF0aWNPcHRpb24ocGFyYW0sIHZhbHVlKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnZnJvbnRGYWNlJzpcbiAgICAgICAgICB2YXIgb3JpZW50YXRpb24gPSAwXG4gICAgICAgICAgaWYgKHZhbHVlID09PSAnY3cnKSB7XG4gICAgICAgICAgICBvcmllbnRhdGlvbiA9IEdMX0NXXG4gICAgICAgICAgfSBlbHNlIGlmICh2YWx1ZSA9PT0gJ2NjdycpIHtcbiAgICAgICAgICAgIG9yaWVudGF0aW9uID0gR0xfQ0NXXG4gICAgICAgICAgfVxuICAgICAgICAgIFxuICAgICAgICAgIHZhciBGUk9OVF9GQUNFX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZW50cnkoRlJPTlRfRkFDRV9TVEFDSywgJy5wdXNoKCcsIG9yaWVudGF0aW9uLCAnKTsnKVxuICAgICAgICAgIGV4aXQoRlJPTlRfRkFDRV9TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnY29sb3JNYXNrJzpcbiAgICAgICAgICBcbiAgICAgICAgICB2YXIgQ09MT1JfTUFTS19TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGVudHJ5KENPTE9SX01BU0tfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgdmFsdWUubWFwKGZ1bmN0aW9uICh2KSB7IHJldHVybiAhIXYgfSkuam9pbigpLFxuICAgICAgICAgICAgJyk7JylcbiAgICAgICAgICBleGl0KENPTE9SX01BU0tfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ3NhbXBsZS5jb3ZlcmFnZSc6XG4gICAgICAgICAgXG4gICAgICAgICAgdmFyIHNhbXBsZVZhbHVlID0gJ3ZhbHVlJyBpbiB2YWx1ZSA/IHZhbHVlLnZhbHVlIDogMVxuICAgICAgICAgIHZhciBzYW1wbGVJbnZlcnQgPSAhIXZhbHVlLmludmVydFxuICAgICAgICAgIFxuICAgICAgICAgIHZhciBTQU1QTEVfQ09WRVJBR0VfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBlbnRyeShTQU1QTEVfQ09WRVJBR0VfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgc2FtcGxlVmFsdWUsICcsJywgc2FtcGxlSW52ZXJ0LCAnKTsnKVxuICAgICAgICAgIGV4aXQoU0FNUExFX0NPVkVSQUdFX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICd2aWV3cG9ydCc6XG4gICAgICAgIGNhc2UgJ3NjaXNzb3IuYm94JzpcbiAgICAgICAgICBcbiAgICAgICAgICB2YXIgWCA9IHZhbHVlLnggfHwgMFxuICAgICAgICAgIHZhciBZID0gdmFsdWUueSB8fCAwXG4gICAgICAgICAgdmFyIFcgPSAtMVxuICAgICAgICAgIHZhciBIID0gLTFcbiAgICAgICAgICBcbiAgICAgICAgICBcbiAgICAgICAgICBpZiAoJ3cnIGluIHZhbHVlKSB7XG4gICAgICAgICAgICBXID0gdmFsdWUud1xuICAgICAgICAgICAgXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgnaCcgaW4gdmFsdWUpIHtcbiAgICAgICAgICAgIEggPSB2YWx1ZS5oXG4gICAgICAgICAgICBcbiAgICAgICAgICB9XG4gICAgICAgICAgdmFyIEJPWF9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGVudHJ5KEJPWF9TVEFDSywgJy5wdXNoKCcsIFgsICcsJywgWSwgJywnLCBXLCAnLCcsIEgsICcpOycpXG4gICAgICAgICAgZXhpdChCT1hfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgLy8gVE9ETyBTaG91bGQgdGhpcyBqdXN0IGJlIGEgd2FybmluZyBpbnN0ZWFkP1xuICAgICAgICAgIFxuICAgICAgICAgIGJyZWFrXG4gICAgICB9XG4gICAgfSlcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyB1cGRhdGUgc3RhdGljIHVuaWZvcm1zXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIE9iamVjdC5rZXlzKHN0YXRpY1VuaWZvcm1zKS5mb3JFYWNoKGZ1bmN0aW9uICh1bmlmb3JtKSB7XG4gICAgICB2YXIgU1RBQ0sgPSBsaW5rKHVuaWZvcm1TdGF0ZS5kZWYodW5pZm9ybSkpXG4gICAgICB2YXIgVkFMVUVcbiAgICAgIHZhciB2YWx1ZSA9IHN0YXRpY1VuaWZvcm1zW3VuaWZvcm1dXG4gICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nICYmIHZhbHVlLl9yZWdsVHlwZSkge1xuICAgICAgICBWQUxVRSA9IGxpbmsodmFsdWUpXG4gICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG4gICAgICAgIFZBTFVFID0gbGluayh2YWx1ZS5zbGljZSgpKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgVkFMVUUgPSArdmFsdWVcbiAgICAgIH1cbiAgICAgIGVudHJ5KFNUQUNLLCAnLnB1c2goJywgVkFMVUUsICcpOycpXG4gICAgICBleGl0KFNUQUNLLCAnLnBvcCgpOycpXG4gICAgfSlcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyB1cGRhdGUgZGVmYXVsdCBhdHRyaWJ1dGVzXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIE9iamVjdC5rZXlzKHN0YXRpY0F0dHJpYnV0ZXMpLmZvckVhY2goZnVuY3Rpb24gKGF0dHJpYnV0ZSkge1xuICAgICAgdmFyIGRhdGEgPSBzdGF0aWNBdHRyaWJ1dGVzW2F0dHJpYnV0ZV1cbiAgICAgIHZhciBBVFRSSUJVVEUgPSBsaW5rKGF0dHJpYnV0ZVN0YXRlLmRlZihhdHRyaWJ1dGUpKVxuICAgICAgdmFyIEJPWCA9IGxpbmsoYXR0cmlidXRlU3RhdGUuYm94KGF0dHJpYnV0ZSkuYWxsb2MoZGF0YSkpXG4gICAgICBlbnRyeShBVFRSSUJVVEUsICcucmVjb3Jkcy5wdXNoKCcsIEJPWCwgJyk7JylcbiAgICAgIGV4aXQoQVRUUklCVVRFLCAnLnJlY29yZHMucG9wKCk7JylcbiAgICB9KVxuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIERZTkFNSUMgU1RBVEUgKGZvciBzY29wZSBhbmQgZHJhdylcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gR2VuZXJhdGVkIGNvZGUgYmxvY2tzIGZvciBkeW5hbWljIHN0YXRlIGZsYWdzXG4gICAgdmFyIGR5bmFtaWNFbnRyeSA9IGVudi5ibG9jaygpXG4gICAgdmFyIGR5bmFtaWNFeGl0ID0gZW52LmJsb2NrKClcblxuICAgIHZhciBGUkFNRVNUQVRFXG4gICAgdmFyIERZTkFSR1NcbiAgICBpZiAoaGFzRHluYW1pYykge1xuICAgICAgRlJBTUVTVEFURSA9IGxpbmsoZnJhbWVTdGF0ZSlcbiAgICAgIERZTkFSR1MgPSBlbnRyeS5kZWYoKVxuICAgIH1cblxuICAgIHZhciBkeW5hbWljVmFycyA9IHt9XG4gICAgZnVuY3Rpb24gZHluICh4KSB7XG4gICAgICB2YXIgaWQgPSB4LmlkXG4gICAgICB2YXIgcmVzdWx0ID0gZHluYW1pY1ZhcnNbaWRdXG4gICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH1cbiAgICAgIGlmICh4LmZ1bmMpIHtcbiAgICAgICAgcmVzdWx0ID0gZHluYW1pY0VudHJ5LmRlZihcbiAgICAgICAgICBsaW5rKHguZGF0YSksICcoJywgRFlOQVJHUywgJywwLCcsIEZSQU1FU1RBVEUsICcpJylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlc3VsdCA9IGR5bmFtaWNFbnRyeS5kZWYoRFlOQVJHUywgJy4nLCB4LmRhdGEpXG4gICAgICB9XG4gICAgICBkeW5hbWljVmFyc1tpZF0gPSByZXN1bHRcbiAgICAgIHJldHVybiByZXN1bHRcbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gZHluYW1pYyBjb250ZXh0IHN0YXRlIHZhcmlhYmxlc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBPYmplY3Qua2V5cyhkeW5hbWljT3B0aW9ucykuc29ydChvcHRpb25Qcmlvcml0eSkuZm9yRWFjaChmdW5jdGlvbiAocGFyYW0pIHtcbiAgICAgIC8vIExpbmsgaW4gZHluYW1pYyB2YXJpYWJsZVxuICAgICAgdmFyIHZhcmlhYmxlID0gZHluKGR5bmFtaWNPcHRpb25zW3BhcmFtXSlcblxuICAgICAgc3dpdGNoIChwYXJhbSkge1xuICAgICAgICBjYXNlICdmcmFtZWJ1ZmZlcic6XG4gICAgICAgICAgdmFyIFZJRVdQT1JUX1NUQVRFID0gbGlua0NvbnRleHQoJ3ZpZXdwb3J0JylcbiAgICAgICAgICB2YXIgU0NJU1NPUl9TVEFURSA9IGxpbmtDb250ZXh0KCdzY2lzc29yLmJveCcpXG4gICAgICAgICAgZHluYW1pY0VudHJ5KCdpZignLFxuICAgICAgICAgICAgRlJBTUVCVUZGRVJfU1RBVEUsICcucHVzaCgnLFxuICAgICAgICAgICAgdmFyaWFibGUsICcmJicsIHZhcmlhYmxlLCAnLl9mcmFtZWJ1ZmZlcikpeycsXG4gICAgICAgICAgICBWSUVXUE9SVF9TVEFURSwgJy5zZXREaXJ0eSgpOycsXG4gICAgICAgICAgICBTQ0lTU09SX1NUQVRFLCAnLnNldERpcnR5KCk7JyxcbiAgICAgICAgICAgICd9JylcbiAgICAgICAgICBkeW5hbWljRXhpdCgnaWYoJyxcbiAgICAgICAgICAgIEZSQU1FQlVGRkVSX1NUQVRFLCAnLnBvcCgpKXsnLFxuICAgICAgICAgICAgVklFV1BPUlRfU1RBVEUsICcuc2V0RGlydHkoKTsnLFxuICAgICAgICAgICAgU0NJU1NPUl9TVEFURSwgJy5zZXREaXJ0eSgpOycsXG4gICAgICAgICAgICAnfScpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdjdWxsLmVuYWJsZSc6XG4gICAgICAgIGNhc2UgJ2JsZW5kLmVuYWJsZSc6XG4gICAgICAgIGNhc2UgJ2RpdGhlcic6XG4gICAgICAgIGNhc2UgJ3N0ZW5jaWwuZW5hYmxlJzpcbiAgICAgICAgY2FzZSAnZGVwdGguZW5hYmxlJzpcbiAgICAgICAgY2FzZSAnc2Npc3Nvci5lbmFibGUnOlxuICAgICAgICBjYXNlICdwb2x5Z29uT2Zmc2V0LmVuYWJsZSc6XG4gICAgICAgIGNhc2UgJ3NhbXBsZS5hbHBoYSc6XG4gICAgICAgIGNhc2UgJ3NhbXBsZS5lbmFibGUnOlxuICAgICAgICBjYXNlICdsaW5lV2lkdGgnOlxuICAgICAgICBjYXNlICdkZXB0aC5tYXNrJzpcbiAgICAgICAgICB2YXIgU1RBVEVfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBkeW5hbWljRW50cnkoU1RBVEVfU1RBQ0ssICcucHVzaCgnLCB2YXJpYWJsZSwgJyk7JylcbiAgICAgICAgICBkeW5hbWljRXhpdChTVEFURV9TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgLy8gRHJhdyBjYWxsc1xuICAgICAgICBjYXNlICdjb3VudCc6XG4gICAgICAgIGNhc2UgJ29mZnNldCc6XG4gICAgICAgIGNhc2UgJ2luc3RhbmNlcyc6XG4gICAgICAgICAgdmFyIERSQVdfU1RBQ0sgPSBEUkFXX1NUQVRFW3BhcmFtXVxuICAgICAgICAgIGR5bmFtaWNFbnRyeShEUkFXX1NUQUNLLCAnLnB1c2goJywgdmFyaWFibGUsICcpOycpXG4gICAgICAgICAgZHluYW1pY0V4aXQoRFJBV19TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAncHJpbWl0aXZlJzpcbiAgICAgICAgICB2YXIgUFJJTV9TVEFDSyA9IERSQVdfU1RBVEUucHJpbWl0aXZlXG4gICAgICAgICAgZHluYW1pY0VudHJ5KFBSSU1fU1RBQ0ssICcucHVzaCgnLCBQUklNX1RZUEVTLCAnWycsIHZhcmlhYmxlLCAnXSk7JylcbiAgICAgICAgICBkeW5hbWljRXhpdChQUklNX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdkZXB0aC5mdW5jJzpcbiAgICAgICAgICB2YXIgREVQVEhfRlVOQ19TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGR5bmFtaWNFbnRyeShERVBUSF9GVU5DX1NUQUNLLCAnLnB1c2goJywgQ09NUEFSRV9GVU5DUywgJ1snLCB2YXJpYWJsZSwgJ10pOycpXG4gICAgICAgICAgZHluYW1pY0V4aXQoREVQVEhfRlVOQ19TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnYmxlbmQuZnVuYyc6XG4gICAgICAgICAgdmFyIEJMRU5EX0ZVTkNfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICB2YXIgQkxFTkRfRlVOQ1MgPSBsaW5rKGJsZW5kRnVuY3MpXG4gICAgICAgICAgZHluYW1pY0VudHJ5KFxuICAgICAgICAgICAgQkxFTkRfRlVOQ19TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICBCTEVORF9GVU5DUyxcbiAgICAgICAgICAgICdbXCJzcmNSR0JcIiBpbiAnLCB2YXJpYWJsZSwgJz8nLCB2YXJpYWJsZSwgJy5zcmNSR0I6JywgdmFyaWFibGUsICcuc3JjXSwnLFxuICAgICAgICAgICAgQkxFTkRfRlVOQ1MsXG4gICAgICAgICAgICAnW1wiZHN0UkdCXCIgaW4gJywgdmFyaWFibGUsICc/JywgdmFyaWFibGUsICcuZHN0UkdCOicsIHZhcmlhYmxlLCAnLmRzdF0sJyxcbiAgICAgICAgICAgIEJMRU5EX0ZVTkNTLFxuICAgICAgICAgICAgJ1tcInNyY0FscGhhXCIgaW4gJywgdmFyaWFibGUsICc/JywgdmFyaWFibGUsICcuc3JjQWxwaGE6JywgdmFyaWFibGUsICcuc3JjXSwnLFxuICAgICAgICAgICAgQkxFTkRfRlVOQ1MsXG4gICAgICAgICAgICAnW1wiZHN0QWxwaGFcIiBpbiAnLCB2YXJpYWJsZSwgJz8nLCB2YXJpYWJsZSwgJy5kc3RBbHBoYTonLCB2YXJpYWJsZSwgJy5kc3RdKTsnKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KEJMRU5EX0ZVTkNfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2JsZW5kLmVxdWF0aW9uJzpcbiAgICAgICAgICB2YXIgQkxFTkRfRVFVQVRJT05fU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICB2YXIgQkxFTkRfRVFVQVRJT05TID0gbGluayhibGVuZEVxdWF0aW9ucylcbiAgICAgICAgICBkeW5hbWljRW50cnkoXG4gICAgICAgICAgICAnaWYodHlwZW9mICcsIHZhcmlhYmxlLCAnPT09XCJzdHJpbmdcIil7JyxcbiAgICAgICAgICAgIEJMRU5EX0VRVUFUSU9OX1NUQUNLLCAnLnB1c2goJyxcbiAgICAgICAgICAgIEJMRU5EX0VRVUFUSU9OUywgJ1snLCB2YXJpYWJsZSwgJ10sJyxcbiAgICAgICAgICAgIEJMRU5EX0VRVUFUSU9OUywgJ1snLCB2YXJpYWJsZSwgJ10pOycsXG4gICAgICAgICAgICAnfWVsc2V7JyxcbiAgICAgICAgICAgIEJMRU5EX0VRVUFUSU9OX1NUQUNLLCAnLnB1c2goJyxcbiAgICAgICAgICAgIEJMRU5EX0VRVUFUSU9OUywgJ1snLCB2YXJpYWJsZSwgJy5yZ2JdLCcsXG4gICAgICAgICAgICBCTEVORF9FUVVBVElPTlMsICdbJywgdmFyaWFibGUsICcuYWxwaGFdKTsnLFxuICAgICAgICAgICAgJ30nKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KEJMRU5EX0VRVUFUSU9OX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdibGVuZC5jb2xvcic6XG4gICAgICAgICAgdmFyIEJMRU5EX0NPTE9SX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZHluYW1pY0VudHJ5KEJMRU5EX0NPTE9SX1NUQUNLLCAnLnB1c2goJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnWzBdLCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJ1sxXSwnLFxuICAgICAgICAgICAgdmFyaWFibGUsICdbMl0sJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnWzNdKTsnKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KEJMRU5EX0NPTE9SX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdzdGVuY2lsLm1hc2snOlxuICAgICAgICAgIHZhciBTVEVOQ0lMX01BU0tfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBkeW5hbWljRW50cnkoU1RFTkNJTF9NQVNLX1NUQUNLLCAnLnB1c2goJywgdmFyaWFibGUsICcpOycpXG4gICAgICAgICAgZHluYW1pY0V4aXQoU1RFTkNJTF9NQVNLX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdzdGVuY2lsLmZ1bmMnOlxuICAgICAgICAgIHZhciBTVEVOQ0lMX0ZVTkNfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBkeW5hbWljRW50cnkoU1RFTkNJTF9GVU5DX1NUQUNLLCAnLnB1c2goJyxcbiAgICAgICAgICAgIENPTVBBUkVfRlVOQ1MsICdbJywgdmFyaWFibGUsICcuY21wXSwnLFxuICAgICAgICAgICAgdmFyaWFibGUsICcucmVmfDAsJyxcbiAgICAgICAgICAgICdcIm1hc2tcIiBpbiAnLCB2YXJpYWJsZSwgJz8nLCB2YXJpYWJsZSwgJy5tYXNrOi0xKTsnKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KFNURU5DSUxfRlVOQ19TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnc3RlbmNpbC5vcEZyb250JzpcbiAgICAgICAgY2FzZSAnc3RlbmNpbC5vcEJhY2snOlxuICAgICAgICAgIHZhciBTVEVOQ0lMX09QX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZHluYW1pY0VudHJ5KFNURU5DSUxfT1BfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgU1RFTkNJTF9PUFMsICdbJywgdmFyaWFibGUsICcuZmFpbHx8XCJrZWVwXCJdLCcsXG4gICAgICAgICAgICBTVEVOQ0lMX09QUywgJ1snLCB2YXJpYWJsZSwgJy56ZmFpbHx8XCJrZWVwXCJdLCcsXG4gICAgICAgICAgICBTVEVOQ0lMX09QUywgJ1snLCB2YXJpYWJsZSwgJy5wYXNzfHxcImtlZXBcIl0pOycpXG4gICAgICAgICAgZHluYW1pY0V4aXQoU1RFTkNJTF9PUF9TVEFDSywgJy5wb3AoKTsnKVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAncG9seWdvbk9mZnNldC5vZmZzZXQnOlxuICAgICAgICAgIHZhciBQT0xZR09OX09GRlNFVF9TVEFDSyA9IGxpbmtDb250ZXh0KHBhcmFtKVxuICAgICAgICAgIGR5bmFtaWNFbnRyeShQT0xZR09OX09GRlNFVF9TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJy5mYWN0b3J8fDAsJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnLnVuaXRzfHwwKTsnKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KFBPTFlHT05fT0ZGU0VUX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdjdWxsLmZhY2UnOlxuICAgICAgICAgIHZhciBDVUxMX0ZBQ0VfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBkeW5hbWljRW50cnkoQ1VMTF9GQUNFX1NUQUNLLCAnLnB1c2goJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnPT09XCJmcm9udFwiPycsIEdMX0ZST05ULCAnOicsIEdMX0JBQ0ssICcpOycpXG4gICAgICAgICAgZHluYW1pY0V4aXQoQ1VMTF9GQUNFX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdmcm9udEZhY2UnOlxuICAgICAgICAgIHZhciBGUk9OVF9GQUNFX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZHluYW1pY0VudHJ5KEZST05UX0ZBQ0VfU1RBQ0ssICcucHVzaCgnLFxuICAgICAgICAgICAgdmFyaWFibGUsICc9PT1cImN3XCI/JywgR0xfQ1csICc6JywgR0xfQ0NXLCAnKTsnKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KEZST05UX0ZBQ0VfU1RBQ0ssICcucG9wKCk7JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2NvbG9yTWFzayc6XG4gICAgICAgICAgdmFyIENPTE9SX01BU0tfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBkeW5hbWljRW50cnkoQ09MT1JfTUFTS19TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJ1swXSwnLFxuICAgICAgICAgICAgdmFyaWFibGUsICdbMV0sJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnWzJdLCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJ1szXSk7JylcbiAgICAgICAgICBkeW5hbWljRXhpdChDT0xPUl9NQVNLX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdzYW1wbGUuY292ZXJhZ2UnOlxuICAgICAgICAgIHZhciBTQU1QTEVfQ09WRVJBR0VfU1RBQ0sgPSBsaW5rQ29udGV4dChwYXJhbSlcbiAgICAgICAgICBkeW5hbWljRW50cnkoU0FNUExFX0NPVkVSQUdFX1NUQUNLLCAnLnB1c2goJyxcbiAgICAgICAgICAgIHZhcmlhYmxlLCAnLnZhbHVlLCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJy5pbnZlcnQpOycpXG4gICAgICAgICAgZHluYW1pY0V4aXQoU0FNUExFX0NPVkVSQUdFX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdzY2lzc29yLmJveCc6XG4gICAgICAgIGNhc2UgJ3ZpZXdwb3J0JzpcbiAgICAgICAgICB2YXIgQk9YX1NUQUNLID0gbGlua0NvbnRleHQocGFyYW0pXG4gICAgICAgICAgZHluYW1pY0VudHJ5KEJPWF9TVEFDSywgJy5wdXNoKCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJy54fHwwLCcsXG4gICAgICAgICAgICB2YXJpYWJsZSwgJy55fHwwLCcsXG4gICAgICAgICAgICAnXCJ3XCIgaW4gJywgdmFyaWFibGUsICc/JywgdmFyaWFibGUsICcudzotMSwnLFxuICAgICAgICAgICAgJ1wiaFwiIGluICcsIHZhcmlhYmxlLCAnPycsIHZhcmlhYmxlLCAnLmg6LTEpOycpXG4gICAgICAgICAgZHluYW1pY0V4aXQoQk9YX1NUQUNLLCAnLnBvcCgpOycpXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdlbGVtZW50cyc6XG4gICAgICAgICAgdmFyIGhhc1ByaW1pdGl2ZSA9XG4gICAgICAgICAgISgncHJpbWl0aXZlJyBpbiBkeW5hbWljT3B0aW9ucykgJiZcbiAgICAgICAgICAgICEoJ3ByaW1pdGl2ZScgaW4gc3RhdGljT3B0aW9ucylcbiAgICAgICAgICB2YXIgaGFzQ291bnQgPVxuICAgICAgICAgICEoJ2NvdW50JyBpbiBkeW5hbWljT3B0aW9ucykgJiZcbiAgICAgICAgICAgICEoJ2NvdW50JyBpbiBzdGF0aWNPcHRpb25zKVxuICAgICAgICAgIHZhciBoYXNPZmZzZXQgPVxuICAgICAgICAgICEoJ29mZnNldCcgaW4gZHluYW1pY09wdGlvbnMpICYmXG4gICAgICAgICAgICAhKCdvZmZzZXQnIGluIHN0YXRpY09wdGlvbnMpXG4gICAgICAgICAgdmFyIEVMRU1FTlRTID0gZHluYW1pY0VudHJ5LmRlZigpXG4gICAgICAgICAgZHluYW1pY0VudHJ5KFxuICAgICAgICAgICAgJ2lmKCcsIHZhcmlhYmxlLCAnKXsnLFxuICAgICAgICAgICAgRUxFTUVOVFMsICc9JywgdmFyaWFibGUsICcuX2VsZW1lbnRzOycsXG4gICAgICAgICAgICBFTEVNRU5UX1NUQVRFLCAnLnB1c2goJywgRUxFTUVOVFMsICcpOycsXG4gICAgICAgICAgICAhaGFzUHJpbWl0aXZlID8gJydcbiAgICAgICAgICAgICAgOiBEUkFXX1NUQVRFLnByaW1pdGl2ZSArICcucHVzaCgnICsgRUxFTUVOVFMgKyAnLnByaW1UeXBlKTsnLFxuICAgICAgICAgICAgIWhhc0NvdW50ID8gJydcbiAgICAgICAgICAgICAgOiBEUkFXX1NUQVRFLmNvdW50ICsgJy5wdXNoKCcgKyBFTEVNRU5UUyArICcudmVydENvdW50KTsnLFxuICAgICAgICAgICAgIWhhc09mZnNldCA/ICcnXG4gICAgICAgICAgICAgIDogRFJBV19TVEFURS5vZmZzZXQgKyAnLnB1c2goJyArIEVMRU1FTlRTICsgJy5vZmZzZXQpOycsXG4gICAgICAgICAgICAnfWVsc2V7JyxcbiAgICAgICAgICAgIEVMRU1FTlRfU1RBVEUsICcucHVzaChudWxsKTsnLFxuICAgICAgICAgICAgJ30nKVxuICAgICAgICAgIGR5bmFtaWNFeGl0KFxuICAgICAgICAgICAgRUxFTUVOVF9TVEFURSwgJy5wb3AoKTsnLFxuICAgICAgICAgICAgJ2lmKCcsIHZhcmlhYmxlLCAnKXsnLFxuICAgICAgICAgICAgaGFzUHJpbWl0aXZlID8gRFJBV19TVEFURS5wcmltaXRpdmUgKyAnLnBvcCgpOycgOiAnJyxcbiAgICAgICAgICAgIGhhc0NvdW50ID8gRFJBV19TVEFURS5jb3VudCArICcucG9wKCk7JyA6ICcnLFxuICAgICAgICAgICAgaGFzT2Zmc2V0ID8gRFJBV19TVEFURS5vZmZzZXQgKyAnLnBvcCgpOycgOiAnJyxcbiAgICAgICAgICAgICd9JylcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgXG4gICAgICB9XG4gICAgfSlcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBkeW5hbWljIHVuaWZvcm1zXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIE9iamVjdC5rZXlzKGR5bmFtaWNVbmlmb3JtcykuZm9yRWFjaChmdW5jdGlvbiAodW5pZm9ybSkge1xuICAgICAgdmFyIFNUQUNLID0gbGluayh1bmlmb3JtU3RhdGUuZGVmKHVuaWZvcm0pKVxuICAgICAgdmFyIFZBTFVFID0gZHluKGR5bmFtaWNVbmlmb3Jtc1t1bmlmb3JtXSlcbiAgICAgIGR5bmFtaWNFbnRyeShTVEFDSywgJy5wdXNoKCcsIFZBTFVFLCAnKTsnKVxuICAgICAgZHluYW1pY0V4aXQoU1RBQ0ssICcucG9wKCk7JylcbiAgICB9KVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGR5bmFtaWMgYXR0cmlidXRlc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICBPYmplY3Qua2V5cyhkeW5hbWljQXR0cmlidXRlcykuZm9yRWFjaChmdW5jdGlvbiAoYXR0cmlidXRlKSB7XG4gICAgICB2YXIgQVRUUklCVVRFID0gbGluayhhdHRyaWJ1dGVTdGF0ZS5kZWYoYXR0cmlidXRlKSlcbiAgICAgIHZhciBWQUxVRSA9IGR5bihkeW5hbWljQXR0cmlidXRlc1thdHRyaWJ1dGVdKVxuICAgICAgdmFyIEJPWCA9IGxpbmsoYXR0cmlidXRlU3RhdGUuYm94KGF0dHJpYnV0ZSkpXG4gICAgICBkeW5hbWljRW50cnkoQVRUUklCVVRFLCAnLnJlY29yZHMucHVzaCgnLFxuICAgICAgICBCT1gsICcuYWxsb2MoJywgVkFMVUUsICcpKTsnKVxuICAgICAgZHluYW1pY0V4aXQoQk9YLCAnLmZyZWUoJywgQVRUUklCVVRFLCAnLnJlY29yZHMucG9wKCkpOycpXG4gICAgfSlcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBTQ09QRSBQUk9DRURVUkVcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgdmFyIHNjb3BlID0gcHJvYygnc2NvcGUnKVxuICAgIHZhciBTQ09QRV9BUkdTID0gc2NvcGUuYXJnKClcbiAgICB2YXIgU0NPUEVfQk9EWSA9IHNjb3BlLmFyZygpXG4gICAgc2NvcGUoZW50cnkpXG4gICAgaWYgKGhhc0R5bmFtaWMpIHtcbiAgICAgIHNjb3BlKFxuICAgICAgICBEWU5BUkdTLCAnPScsIFNDT1BFX0FSR1MsICc7JyxcbiAgICAgICAgZHluYW1pY0VudHJ5KVxuICAgIH1cbiAgICBzY29wZShcbiAgICAgIFNDT1BFX0JPRFksICcoKTsnLFxuICAgICAgaGFzRHluYW1pYyA/IGR5bmFtaWNFeGl0IDogJycsXG4gICAgICBleGl0KVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHVwZGF0ZSBzaGFkZXIgcHJvZ3JhbSBvbmx5IGZvciBEUkFXIGFuZCBiYXRjaFxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICB2YXIgY29tbW9uRHJhdyA9IGJsb2NrKClcbiAgICB2YXIgQ1VSUkVOVF9QUk9HUkFNID0gY29tbW9uRHJhdy5kZWYoKVxuICAgIGlmIChzdGF0aWNPcHRpb25zLmZyYWcgJiYgc3RhdGljT3B0aW9ucy52ZXJ0KSB7XG4gICAgICB2YXIgZnJhZ1NyYyA9IHN0YXRpY09wdGlvbnMuZnJhZ1xuICAgICAgdmFyIHZlcnRTcmMgPSBzdGF0aWNPcHRpb25zLnZlcnRcbiAgICAgIGNvbW1vbkRyYXcoQ1VSUkVOVF9QUk9HUkFNLCAnPScsIGxpbmsoXG4gICAgICAgIHNoYWRlclN0YXRlLnByb2dyYW0oXG4gICAgICAgICAgc3RyaW5nU3RvcmUuaWQodmVydFNyYyksXG4gICAgICAgICAgc3RyaW5nU3RvcmUuaWQoZnJhZ1NyYykpKSwgJzsnKVxuICAgIH0gZWxzZSB7XG4gICAgICBjb21tb25EcmF3KENVUlJFTlRfUFJPR1JBTSwgJz0nLFxuICAgICAgICBTSEFERVJfU1RBVEUsICcucHJvZ3JhbScsICcoJyxcbiAgICAgICAgU0hBREVSX1NUQVRFLCAnLnZlcnRbJywgU0hBREVSX1NUQVRFLCAnLnZlcnQubGVuZ3RoLTFdJywgJywnLFxuICAgICAgICBTSEFERVJfU1RBVEUsICcuZnJhZ1snLCBTSEFERVJfU1RBVEUsICcuZnJhZy5sZW5ndGgtMV0nLCAnKTsnKVxuICAgIH1cblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBEUkFXIFBST0NFRFVSRVxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICB2YXIgZHJhdyA9IHByb2MoJ2RyYXcnKVxuICAgIGRyYXcoZW50cnksIGNvbW1vbkRyYXcpXG4gICAgaWYgKGhhc0R5bmFtaWMpIHtcbiAgICAgIGRyYXcoXG4gICAgICAgIERZTkFSR1MsICc9JywgZHJhdy5hcmcoKSwgJzsnLFxuICAgICAgICBkeW5hbWljRW50cnkpXG4gICAgfVxuICAgIGRyYXcoXG4gICAgICBHTF9QT0xMLCAnKCk7JyxcbiAgICAgICdpZignLCBDVVJSRU5UX1BST0dSQU0sICcpJyxcbiAgICAgIENVUlJFTlRfUFJPR1JBTSwgJy5kcmF3KCcsIGhhc0R5bmFtaWMgPyBEWU5BUkdTIDogJycsICcpOycsXG4gICAgICBoYXNEeW5hbWljID8gZHluYW1pY0V4aXQgOiAnJyxcbiAgICAgIGV4aXQpXG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gQkFUQ0ggRFJBV1xuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICB2YXIgYmF0Y2ggPSBwcm9jKCdiYXRjaCcpXG4gICAgYmF0Y2goZW50cnksIGNvbW1vbkRyYXcpXG4gICAgdmFyIEVYRUNfQkFUQ0ggPSBsaW5rKGZ1bmN0aW9uIChwcm9ncmFtLCBjb3VudCwgYXJncykge1xuICAgICAgdmFyIHByb2MgPSBwcm9ncmFtLmJhdGNoQ2FjaGVbY2FsbElkXVxuICAgICAgaWYgKCFwcm9jKSB7XG4gICAgICAgIHByb2MgPSBwcm9ncmFtLmJhdGNoQ2FjaGVbY2FsbElkXSA9IGNvbXBpbGVCYXRjaChcbiAgICAgICAgICBwcm9ncmFtLCBkeW5hbWljT3B0aW9ucywgZHluYW1pY1VuaWZvcm1zLCBkeW5hbWljQXR0cmlidXRlcyxcbiAgICAgICAgICBzdGF0aWNPcHRpb25zKVxuICAgICAgfVxuICAgICAgcmV0dXJuIHByb2MoY291bnQsIGFyZ3MpXG4gICAgfSlcbiAgICBiYXRjaChcbiAgICAgICdpZignLCBDVVJSRU5UX1BST0dSQU0sICcpeycsXG4gICAgICBHTF9QT0xMLCAnKCk7JyxcbiAgICAgIEVYRUNfQkFUQ0gsICcoJyxcbiAgICAgIENVUlJFTlRfUFJPR1JBTSwgJywnLFxuICAgICAgYmF0Y2guYXJnKCksICcsJyxcbiAgICAgIGJhdGNoLmFyZygpLCAnKTsnKVxuICAgIC8vIFNldCBkaXJ0eSBvbiBhbGwgZHluYW1pYyBmbGFnc1xuICAgIE9iamVjdC5rZXlzKGR5bmFtaWNPcHRpb25zKS5mb3JFYWNoKGZ1bmN0aW9uIChvcHRpb24pIHtcbiAgICAgIHZhciBTVEFURSA9IENPTlRFWFRfU1RBVEVbb3B0aW9uXVxuICAgICAgaWYgKFNUQVRFKSB7XG4gICAgICAgIGJhdGNoKFNUQVRFLCAnLnNldERpcnR5KCk7JylcbiAgICAgIH1cbiAgICB9KVxuICAgIGJhdGNoKCd9JywgZXhpdClcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBldmFsIGFuZCBiaW5kXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHJldHVybiBlbnYuY29tcGlsZSgpXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGRyYXc6IGNvbXBpbGVTaGFkZXJEcmF3LFxuICAgIGNvbW1hbmQ6IGNvbXBpbGVDb21tYW5kXG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgXCJbb2JqZWN0IEludDhBcnJheV1cIjogNTEyMFxuLCBcIltvYmplY3QgSW50MTZBcnJheV1cIjogNTEyMlxuLCBcIltvYmplY3QgSW50MzJBcnJheV1cIjogNTEyNFxuLCBcIltvYmplY3QgVWludDhBcnJheV1cIjogNTEyMVxuLCBcIltvYmplY3QgVWludDhDbGFtcGVkQXJyYXldXCI6IDUxMjFcbiwgXCJbb2JqZWN0IFVpbnQxNkFycmF5XVwiOiA1MTIzXG4sIFwiW29iamVjdCBVaW50MzJBcnJheV1cIjogNTEyNVxuLCBcIltvYmplY3QgRmxvYXQzMkFycmF5XVwiOiA1MTI2XG4sIFwiW29iamVjdCBGbG9hdDY0QXJyYXldXCI6IDUxMjFcbiwgXCJbb2JqZWN0IEFycmF5QnVmZmVyXVwiOiA1MTIxXG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gIFwiaW50OFwiOiA1MTIwXG4sIFwiaW50MTZcIjogNTEyMlxuLCBcImludDMyXCI6IDUxMjRcbiwgXCJ1aW50OFwiOiA1MTIxXG4sIFwidWludDE2XCI6IDUxMjNcbiwgXCJ1aW50MzJcIjogNTEyNVxuLCBcImZsb2F0XCI6IDUxMjZcbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgXCJwb2ludHNcIjogMCxcbiAgXCJsaW5lc1wiOiAxLFxuICBcImxpbmUgbG9vcFwiOiAyLFxuICBcImxpbmUgc3RyaXBcIjogMyxcbiAgXCJ0cmlhbmdsZXNcIjogNCxcbiAgXCJ0cmlhbmdsZSBzdHJpcFwiOiA1LFxuICBcInRyaWFuZ2xlIGZhblwiOiA2XG59XG4iLCIvLyBDb250ZXh0IGFuZCBjYW52YXMgY3JlYXRpb24gaGVscGVyIGZ1bmN0aW9uc1xuLypnbG9iYWxzIEhUTUxFbGVtZW50LFdlYkdMUmVuZGVyaW5nQ29udGV4dCovXG5cblxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vdXRpbC9leHRlbmQnKVxuXG5mdW5jdGlvbiBjcmVhdGVDYW52YXMgKGVsZW1lbnQsIG9wdGlvbnMpIHtcbiAgdmFyIGNhbnZhcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpXG4gIHZhciBhcmdzID0gZ2V0Q29udGV4dChjYW52YXMsIG9wdGlvbnMpXG5cbiAgZXh0ZW5kKGNhbnZhcy5zdHlsZSwge1xuICAgIGJvcmRlcjogMCxcbiAgICBtYXJnaW46IDAsXG4gICAgcGFkZGluZzogMCxcbiAgICB0b3A6IDAsXG4gICAgbGVmdDogMFxuICB9KVxuICBlbGVtZW50LmFwcGVuZENoaWxkKGNhbnZhcylcblxuICBpZiAoZWxlbWVudCA9PT0gZG9jdW1lbnQuYm9keSkge1xuICAgIGNhbnZhcy5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSdcbiAgICBleHRlbmQoZWxlbWVudC5zdHlsZSwge1xuICAgICAgbWFyZ2luOiAwLFxuICAgICAgcGFkZGluZzogMFxuICAgIH0pXG4gIH1cblxuICB2YXIgc2NhbGUgPSArYXJncy5vcHRpb25zLnBpeGVsUmF0aW9cbiAgZnVuY3Rpb24gcmVzaXplICgpIHtcbiAgICB2YXIgdyA9IHdpbmRvdy5pbm5lcldpZHRoXG4gICAgdmFyIGggPSB3aW5kb3cuaW5uZXJIZWlnaHRcbiAgICBpZiAoZWxlbWVudCAhPT0gZG9jdW1lbnQuYm9keSkge1xuICAgICAgdmFyIGJvdW5kcyA9IGVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KClcbiAgICAgIHcgPSBib3VuZHMucmlnaHQgLSBib3VuZHMubGVmdFxuICAgICAgaCA9IGJvdW5kcy50b3AgLSBib3VuZHMuYm90dG9tXG4gICAgfVxuICAgIGNhbnZhcy53aWR0aCA9IHNjYWxlICogd1xuICAgIGNhbnZhcy5oZWlnaHQgPSBzY2FsZSAqIGhcbiAgICBleHRlbmQoY2FudmFzLnN0eWxlLCB7XG4gICAgICB3aWR0aDogdyArICdweCcsXG4gICAgICBoZWlnaHQ6IGggKyAncHgnXG4gICAgfSlcbiAgfVxuXG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdyZXNpemUnLCByZXNpemUsIGZhbHNlKVxuXG4gIHZhciBwcmV2RGVzdHJveSA9IGFyZ3Mub3B0aW9ucy5vbkRlc3Ryb3lcbiAgYXJncy5vcHRpb25zID0gZXh0ZW5kKGV4dGVuZCh7fSwgYXJncy5vcHRpb25zKSwge1xuICAgIG9uRGVzdHJveTogZnVuY3Rpb24gKCkge1xuICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIHJlc2l6ZSlcbiAgICAgIGVsZW1lbnQucmVtb3ZlQ2hpbGQoY2FudmFzKVxuICAgICAgcHJldkRlc3Ryb3kgJiYgcHJldkRlc3Ryb3koKVxuICAgIH1cbiAgfSlcblxuICByZXNpemUoKVxuXG4gIHJldHVybiBhcmdzXG59XG5cbmZ1bmN0aW9uIGdldENvbnRleHQgKGNhbnZhcywgb3B0aW9ucykge1xuICB2YXIgZ2xPcHRpb25zID0gb3B0aW9ucy5nbE9wdGlvbnMgfHwge31cblxuICBmdW5jdGlvbiBnZXQgKG5hbWUpIHtcbiAgICB0cnkge1xuICAgICAgcmV0dXJuIGNhbnZhcy5nZXRDb250ZXh0KG5hbWUsIGdsT3B0aW9ucylcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cbiAgfVxuXG4gIHZhciBnbCA9IGdldCgnd2ViZ2wnKSB8fFxuICAgICAgICAgICBnZXQoJ2V4cGVyaW1lbnRhbC13ZWJnbCcpIHx8XG4gICAgICAgICAgIGdldCgnd2ViZ2wtZXhwZXJpbWVudGFsJylcblxuICBcblxuICByZXR1cm4ge1xuICAgIGdsOiBnbCxcbiAgICBvcHRpb25zOiBleHRlbmQoe1xuICAgICAgcGl4ZWxSYXRpbzogd2luZG93LmRldmljZVBpeGVsUmF0aW9cbiAgICB9LCBvcHRpb25zKVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcGFyc2VBcmdzIChhcmdzKSB7XG4gIGlmICh0eXBlb2YgZG9jdW1lbnQgPT09ICd1bmRlZmluZWQnIHx8XG4gICAgICB0eXBlb2YgSFRNTEVsZW1lbnQgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGdsOiBhcmdzWzBdLFxuICAgICAgb3B0aW9uczogYXJnc1sxXSB8fCB7fVxuICAgIH1cbiAgfVxuXG4gIHZhciBlbGVtZW50ID0gZG9jdW1lbnQuYm9keVxuICB2YXIgb3B0aW9ucyA9IGFyZ3NbMV0gfHwge31cblxuICBpZiAodHlwZW9mIGFyZ3NbMF0gPT09ICdzdHJpbmcnKSB7XG4gICAgZWxlbWVudCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYXJnc1swXSkgfHwgZG9jdW1lbnQuYm9keVxuICB9IGVsc2UgaWYgKHR5cGVvZiBhcmdzWzBdID09PSAnb2JqZWN0Jykge1xuICAgIGlmIChhcmdzWzBdIGluc3RhbmNlb2YgSFRNTEVsZW1lbnQpIHtcbiAgICAgIGVsZW1lbnQgPSBhcmdzWzBdXG4gICAgfSBlbHNlIGlmIChhcmdzWzBdIGluc3RhbmNlb2YgV2ViR0xSZW5kZXJpbmdDb250ZXh0KSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBnbDogYXJnc1swXSxcbiAgICAgICAgb3B0aW9uczogZXh0ZW5kKHtcbiAgICAgICAgICBwaXhlbFJhdGlvOiAxXG4gICAgICAgIH0sIG9wdGlvbnMpXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIG9wdGlvbnMgPSBhcmdzWzBdXG4gICAgfVxuICB9XG5cbiAgaWYgKGVsZW1lbnQubm9kZU5hbWUgJiYgZWxlbWVudC5ub2RlTmFtZS50b1VwcGVyQ2FzZSgpID09PSAnQ0FOVkFTJykge1xuICAgIHJldHVybiBnZXRDb250ZXh0KGVsZW1lbnQsIG9wdGlvbnMpXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGNyZWF0ZUNhbnZhcyhlbGVtZW50LCBvcHRpb25zKVxuICB9XG59XG4iLCJ2YXIgR0xfVFJJQU5HTEVTID0gNFxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBEcmF3U3RhdGUgKGdsKSB7XG4gIHZhciBwcmltaXRpdmUgPSBbIEdMX1RSSUFOR0xFUyBdXG4gIHZhciBjb3VudCA9IFsgLTEgXVxuICB2YXIgb2Zmc2V0ID0gWyAwIF1cbiAgdmFyIGluc3RhbmNlcyA9IFsgMCBdXG5cbiAgcmV0dXJuIHtcbiAgICBwcmltaXRpdmU6IHByaW1pdGl2ZSxcbiAgICBjb3VudDogY291bnQsXG4gICAgb2Zmc2V0OiBvZmZzZXQsXG4gICAgaW5zdGFuY2VzOiBpbnN0YW5jZXNcbiAgfVxufVxuIiwidmFyIFZBUklBQkxFX0NPVU5URVIgPSAwXG5cbmZ1bmN0aW9uIER5bmFtaWNWYXJpYWJsZSAoaXNGdW5jLCBkYXRhKSB7XG4gIHRoaXMuaWQgPSAoVkFSSUFCTEVfQ09VTlRFUisrKVxuICB0aGlzLmZ1bmMgPSBpc0Z1bmNcbiAgdGhpcy5kYXRhID0gZGF0YVxufVxuXG5mdW5jdGlvbiBkZWZpbmVEeW5hbWljIChkYXRhLCBwYXRoKSB7XG4gIHN3aXRjaCAodHlwZW9mIGRhdGEpIHtcbiAgICBjYXNlICdib29sZWFuJzpcbiAgICBjYXNlICdudW1iZXInOlxuICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICByZXR1cm4gbmV3IER5bmFtaWNWYXJpYWJsZShmYWxzZSwgZGF0YSlcbiAgICBjYXNlICdmdW5jdGlvbic6XG4gICAgICByZXR1cm4gbmV3IER5bmFtaWNWYXJpYWJsZSh0cnVlLCBkYXRhKVxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gZGVmaW5lRHluYW1pY1xuICB9XG59XG5cbmZ1bmN0aW9uIGlzRHluYW1pYyAoeCkge1xuICByZXR1cm4gKHR5cGVvZiB4ID09PSAnZnVuY3Rpb24nICYmICF4Ll9yZWdsVHlwZSkgfHxcbiAgICAgICAgIHggaW5zdGFuY2VvZiBEeW5hbWljVmFyaWFibGVcbn1cblxuZnVuY3Rpb24gdW5ib3ggKHgsIHBhdGgpIHtcbiAgaWYgKHggaW5zdGFuY2VvZiBEeW5hbWljVmFyaWFibGUpIHtcbiAgICByZXR1cm4geFxuICB9IGVsc2UgaWYgKHR5cGVvZiB4ID09PSAnZnVuY3Rpb24nICYmXG4gICAgICAgICAgICAgeCAhPT0gZGVmaW5lRHluYW1pYykge1xuICAgIHJldHVybiBuZXcgRHluYW1pY1ZhcmlhYmxlKHRydWUsIHgpXG4gIH1cbiAgcmV0dXJuIG5ldyBEeW5hbWljVmFyaWFibGUoZmFsc2UsIHBhdGgpXG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBkZWZpbmU6IGRlZmluZUR5bmFtaWMsXG4gIGlzRHluYW1pYzogaXNEeW5hbWljLFxuICB1bmJveDogdW5ib3hcbn1cbiIsIlxudmFyIGlzVHlwZWRBcnJheSA9IHJlcXVpcmUoJy4vdXRpbC9pcy10eXBlZC1hcnJheScpXG52YXIgaXNOREFycmF5TGlrZSA9IHJlcXVpcmUoJy4vdXRpbC9pcy1uZGFycmF5JylcbnZhciBwcmltVHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9wcmltaXRpdmVzLmpzb24nKVxuXG52YXIgR0xfUE9JTlRTID0gMFxudmFyIEdMX0xJTkVTID0gMVxudmFyIEdMX1RSSUFOR0xFUyA9IDRcblxudmFyIEdMX0JZVEUgPSA1MTIwXG52YXIgR0xfVU5TSUdORURfQllURSA9IDUxMjFcbnZhciBHTF9TSE9SVCA9IDUxMjJcbnZhciBHTF9VTlNJR05FRF9TSE9SVCA9IDUxMjNcbnZhciBHTF9JTlQgPSA1MTI0XG52YXIgR0xfVU5TSUdORURfSU5UID0gNTEyNVxuXG52YXIgR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIgPSAzNDk2M1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBFbGVtZW50c1N0YXRlIChnbCwgZXh0ZW5zaW9ucywgYnVmZmVyU3RhdGUpIHtcbiAgdmFyIGVsZW1lbnRzID0gWyBudWxsIF1cblxuICBmdW5jdGlvbiBSRUdMRWxlbWVudEJ1ZmZlciAoKSB7XG4gICAgdGhpcy5idWZmZXIgPSBudWxsXG4gICAgdGhpcy5wcmltVHlwZSA9IEdMX1RSSUFOR0xFU1xuICAgIHRoaXMudmVydENvdW50ID0gMFxuICAgIHRoaXMudHlwZSA9IDBcbiAgfVxuXG4gIFJFR0xFbGVtZW50QnVmZmVyLnByb3RvdHlwZS5iaW5kID0gZnVuY3Rpb24gKCkge1xuICAgIHRoaXMuYnVmZmVyLmJpbmQoKVxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlRWxlbWVudHMgKG9wdGlvbnMpIHtcbiAgICB2YXIgZWxlbWVudHMgPSBuZXcgUkVHTEVsZW1lbnRCdWZmZXIoKVxuICAgIHZhciBidWZmZXIgPSBidWZmZXJTdGF0ZS5jcmVhdGUobnVsbCwgR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIsIHRydWUpXG4gICAgZWxlbWVudHMuYnVmZmVyID0gYnVmZmVyLl9idWZmZXJcblxuICAgIGZ1bmN0aW9uIHJlZ2xFbGVtZW50cyAoaW5wdXQpIHtcbiAgICAgIHZhciBvcHRpb25zID0gaW5wdXRcbiAgICAgIHZhciBleHQzMmJpdCA9IGV4dGVuc2lvbnMub2VzX2VsZW1lbnRfaW5kZXhfdWludFxuXG4gICAgICAvLyBVcGxvYWQgZGF0YSB0byB2ZXJ0ZXggYnVmZmVyXG4gICAgICBpZiAoIW9wdGlvbnMpIHtcbiAgICAgICAgYnVmZmVyKClcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIG9wdGlvbnMgPT09ICdudW1iZXInKSB7XG4gICAgICAgIGJ1ZmZlcihvcHRpb25zKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIGRhdGEgPSBudWxsXG4gICAgICAgIHZhciB1c2FnZSA9ICdzdGF0aWMnXG4gICAgICAgIHZhciBieXRlTGVuZ3RoID0gMFxuICAgICAgICBpZiAoXG4gICAgICAgICAgQXJyYXkuaXNBcnJheShvcHRpb25zKSB8fFxuICAgICAgICAgIGlzVHlwZWRBcnJheShvcHRpb25zKSB8fFxuICAgICAgICAgIGlzTkRBcnJheUxpa2Uob3B0aW9ucykpIHtcbiAgICAgICAgICBkYXRhID0gb3B0aW9uc1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIFxuICAgICAgICAgIGlmICgnZGF0YScgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgZGF0YSA9IG9wdGlvbnMuZGF0YVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoJ3VzYWdlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICB1c2FnZSA9IG9wdGlvbnMudXNhZ2VcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCdsZW5ndGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGJ5dGVMZW5ndGggPSBvcHRpb25zLmxlbmd0aFxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShkYXRhKSB8fFxuICAgICAgICAgICAgKGlzTkRBcnJheUxpa2UoZGF0YSkgJiYgZGF0YS5kdHlwZSA9PT0gJ2FycmF5JykgfHxcbiAgICAgICAgICAgICd0eXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgYnVmZmVyKHtcbiAgICAgICAgICAgIHR5cGU6IG9wdGlvbnMudHlwZSB8fFxuICAgICAgICAgICAgICAoZXh0MzJiaXRcbiAgICAgICAgICAgICAgICA/ICd1aW50MzInXG4gICAgICAgICAgICAgICAgOiAndWludDE2JyksXG4gICAgICAgICAgICB1c2FnZTogdXNhZ2UsXG4gICAgICAgICAgICBkYXRhOiBkYXRhLFxuICAgICAgICAgICAgbGVuZ3RoOiBieXRlTGVuZ3RoXG4gICAgICAgICAgfSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBidWZmZXIoe1xuICAgICAgICAgICAgdXNhZ2U6IHVzYWdlLFxuICAgICAgICAgICAgZGF0YTogZGF0YSxcbiAgICAgICAgICAgIGxlbmd0aDogYnl0ZUxlbmd0aFxuICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YSkgfHwgaXNUeXBlZEFycmF5KGRhdGEpKSB7XG4gICAgICAgICAgYnVmZmVyLmRpbWVuc2lvbiA9IDNcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyB0cnkgdG8gZ3Vlc3MgZGVmYXVsdCBwcmltaXRpdmUgdHlwZSBhbmQgYXJndW1lbnRzXG4gICAgICB2YXIgdmVydENvdW50ID0gZWxlbWVudHMuYnVmZmVyLmJ5dGVMZW5ndGhcbiAgICAgIHZhciB0eXBlID0gMFxuICAgICAgc3dpdGNoIChlbGVtZW50cy5idWZmZXIuZHR5cGUpIHtcbiAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9CWVRFOlxuICAgICAgICBjYXNlIEdMX0JZVEU6XG4gICAgICAgICAgdHlwZSA9IEdMX1VOU0lHTkVEX0JZVEVcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlQ6XG4gICAgICAgIGNhc2UgR0xfU0hPUlQ6XG4gICAgICAgICAgdHlwZSA9IEdMX1VOU0lHTkVEX1NIT1JUXG4gICAgICAgICAgdmVydENvdW50ID4+PSAxXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX0lOVDpcbiAgICAgICAgY2FzZSBHTF9JTlQ6XG4gICAgICAgICAgXG4gICAgICAgICAgdHlwZSA9IEdMX1VOU0lHTkVEX0lOVFxuICAgICAgICAgIHZlcnRDb3VudCA+Pj0gMlxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICBcbiAgICAgIH1cblxuICAgICAgLy8gdHJ5IHRvIGd1ZXNzIHByaW1pdGl2ZSB0eXBlIGZyb20gY2VsbCBkaW1lbnNpb25cbiAgICAgIHZhciBwcmltVHlwZSA9IEdMX1RSSUFOR0xFU1xuICAgICAgdmFyIGRpbWVuc2lvbiA9IGVsZW1lbnRzLmJ1ZmZlci5kaW1lbnNpb25cbiAgICAgIGlmIChkaW1lbnNpb24gPT09IDEpIHByaW1UeXBlID0gR0xfUE9JTlRTXG4gICAgICBpZiAoZGltZW5zaW9uID09PSAyKSBwcmltVHlwZSA9IEdMX0xJTkVTXG4gICAgICBpZiAoZGltZW5zaW9uID09PSAzKSBwcmltVHlwZSA9IEdMX1RSSUFOR0xFU1xuXG4gICAgICAvLyBpZiBtYW51YWwgb3ZlcnJpZGUgcHJlc2VudCwgdXNlIHRoYXRcbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucyA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgaWYgKCdwcmltaXRpdmUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB2YXIgcHJpbWl0aXZlID0gb3B0aW9ucy5wcmltaXRpdmVcbiAgICAgICAgICBcbiAgICAgICAgICBwcmltVHlwZSA9IHByaW1UeXBlc1twcmltaXRpdmVdXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ2NvdW50JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgdmVydENvdW50ID0gb3B0aW9ucy52ZXJ0Q291bnQgfCAwXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gdXBkYXRlIHByb3BlcnRpZXMgZm9yIGVsZW1lbnQgYnVmZmVyXG4gICAgICBlbGVtZW50cy5wcmltVHlwZSA9IHByaW1UeXBlXG4gICAgICBlbGVtZW50cy52ZXJ0Q291bnQgPSB2ZXJ0Q291bnRcbiAgICAgIGVsZW1lbnRzLnR5cGUgPSB0eXBlXG5cbiAgICAgIHJldHVybiByZWdsRWxlbWVudHNcbiAgICB9XG5cbiAgICByZWdsRWxlbWVudHMob3B0aW9ucylcblxuICAgIHJlZ2xFbGVtZW50cy5fcmVnbFR5cGUgPSAnZWxlbWVudHMnXG4gICAgcmVnbEVsZW1lbnRzLl9lbGVtZW50cyA9IGVsZW1lbnRzXG4gICAgcmVnbEVsZW1lbnRzLmRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7XG4gICAgICBcbiAgICAgIGJ1ZmZlci5kZXN0cm95KClcbiAgICAgIGVsZW1lbnRzLmJ1ZmZlciA9IG51bGxcbiAgICB9XG5cbiAgICByZXR1cm4gcmVnbEVsZW1lbnRzXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNyZWF0ZTogY3JlYXRlRWxlbWVudHMsXG4gICAgZWxlbWVudHM6IGVsZW1lbnRzLFxuICAgIGdldEVsZW1lbnRzOiBmdW5jdGlvbiAoZWxlbWVudHMpIHtcbiAgICAgIGlmIChlbGVtZW50cyAmJiBlbGVtZW50cy5fZWxlbWVudHMgaW5zdGFuY2VvZiBSRUdMRWxlbWVudEJ1ZmZlcikge1xuICAgICAgICByZXR1cm4gZWxlbWVudHMuX2VsZW1lbnRzXG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cbiAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjcmVhdGVFeHRlbnNpb25DYWNoZSAoZ2wpIHtcbiAgdmFyIGV4dGVuc2lvbnMgPSB7fVxuXG4gIGZ1bmN0aW9uIHJlZnJlc2hFeHRlbnNpb25zICgpIHtcbiAgICBbXG4gICAgICAnb2VzX3RleHR1cmVfZmxvYXQnLFxuICAgICAgJ29lc190ZXh0dXJlX2Zsb2F0X2xpbmVhcicsXG4gICAgICAnb2VzX3RleHR1cmVfaGFsZl9mbG9hdCcsXG4gICAgICAnb2VzX3RleHR1cmVfaGFsZl9mbG9hdF9saW5lYXInLFxuICAgICAgJ29lc19zdGFuZGFyZF9kZXJpdmF0aXZlcycsXG4gICAgICAnb2VzX2VsZW1lbnRfaW5kZXhfdWludCcsXG4gICAgICAnb2VzX2Zib19yZW5kZXJfbWlwbWFwJyxcblxuICAgICAgJ3dlYmdsX2RlcHRoX3RleHR1cmUnLFxuICAgICAgJ3dlYmdsX2RyYXdfYnVmZmVycycsXG4gICAgICAnd2ViZ2xfY29sb3JfYnVmZmVyX2Zsb2F0JyxcblxuICAgICAgJ2V4dF90ZXh0dXJlX2ZpbHRlcl9hbmlzb3Ryb3BpYycsXG4gICAgICAnZXh0X2ZyYWdfZGVwdGgnLFxuICAgICAgJ2V4dF9ibGVuZF9taW5tYXgnLFxuICAgICAgJ2V4dF9zaGFkZXJfdGV4dHVyZV9sb2QnLFxuICAgICAgJ2V4dF9jb2xvcl9idWZmZXJfaGFsZl9mbG9hdCcsXG4gICAgICAnZXh0X3NyZ2InLFxuXG4gICAgICAnYW5nbGVfaW5zdGFuY2VkX2FycmF5cycsXG5cbiAgICAgICd3ZWJnbF9jb21wcmVzc2VkX3RleHR1cmVfczN0YycsXG4gICAgICAnd2ViZ2xfY29tcHJlc3NlZF90ZXh0dXJlX2F0YycsXG4gICAgICAnd2ViZ2xfY29tcHJlc3NlZF90ZXh0dXJlX3B2cnRjJyxcbiAgICAgICd3ZWJnbF9jb21wcmVzc2VkX3RleHR1cmVfZXRjMSdcbiAgICBdLmZvckVhY2goZnVuY3Rpb24gKGV4dCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgZXh0ZW5zaW9uc1tleHRdID0gZ2wuZ2V0RXh0ZW5zaW9uKGV4dClcbiAgICAgIH0gY2F0Y2ggKGUpIHt9XG4gICAgfSlcbiAgfVxuXG4gIHJlZnJlc2hFeHRlbnNpb25zKClcblxuICByZXR1cm4ge1xuICAgIGV4dGVuc2lvbnM6IGV4dGVuc2lvbnMsXG4gICAgcmVmcmVzaDogcmVmcmVzaEV4dGVuc2lvbnNcbiAgfVxufVxuIiwiXG52YXIgdmFsdWVzID0gcmVxdWlyZSgnLi91dGlsL3ZhbHVlcycpXG52YXIgZXh0ZW5kID0gcmVxdWlyZSgnLi91dGlsL2V4dGVuZCcpXG5cbi8vIFdlIHN0b3JlIHRoZXNlIGNvbnN0YW50cyBzbyB0aGF0IHRoZSBtaW5pZmllciBjYW4gaW5saW5lIHRoZW1cbnZhciBHTF9GUkFNRUJVRkZFUiA9IDB4OEQ0MFxudmFyIEdMX1JFTkRFUkJVRkZFUiA9IDB4OEQ0MVxuXG52YXIgR0xfVEVYVFVSRV8yRCA9IDB4MERFMVxudmFyIEdMX1RFWFRVUkVfQ1VCRV9NQVAgPSAweDg1MTNcbnZhciBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1ggPSAweDg1MTVcblxudmFyIEdMX0NPTE9SX0FUVEFDSE1FTlQwID0gMHg4Q0UwXG52YXIgR0xfREVQVEhfQVRUQUNITUVOVCA9IDB4OEQwMFxudmFyIEdMX1NURU5DSUxfQVRUQUNITUVOVCA9IDB4OEQyMFxudmFyIEdMX0RFUFRIX1NURU5DSUxfQVRUQUNITUVOVCA9IDB4ODIxQVxuXG52YXIgR0xfVU5TSUdORURfQllURSA9IDB4MTQwMVxudmFyIEdMX0ZMT0FUID0gMHgxNDA2XG5cbnZhciBHTF9IQUxGX0ZMT0FUX09FUyA9IDB4OEQ2MVxuXG52YXIgR0xfUkdCQSA9IDB4MTkwOFxuXG52YXIgR0xfUkdCQTQgPSAweDgwNTZcbnZhciBHTF9SR0I1X0ExID0gMHg4MDU3XG52YXIgR0xfUkdCNTY1ID0gMHg4RDYyXG52YXIgR0xfREVQVEhfQ09NUE9ORU5UMTYgPSAweDgxQTVcbnZhciBHTF9TVEVOQ0lMX0lOREVYOCA9IDB4OEQ0OFxuXG52YXIgR0xfREVQVEhfQ09NUE9ORU5UID0gMHgxOTAyXG52YXIgR0xfREVQVEhfU1RFTkNJTCA9IDB4ODRGOVxuXG52YXIgR0xfU1JHQjhfQUxQSEE4X0VYVCA9IDB4OEM0M1xuXG52YXIgR0xfUkdCQTMyRl9FWFQgPSAweDg4MTRcblxudmFyIEdMX1JHQkExNkZfRVhUID0gMHg4ODFBXG52YXIgR0xfUkdCMTZGX0VYVCA9IDB4ODgxQlxuXG52YXIgR0xfRlJBTUVCVUZGRVJfQ09NUExFVEUgPSAweDhDRDVcbnZhciBHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX0FUVEFDSE1FTlQgPSAweDhDRDZcbnZhciBHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX01JU1NJTkdfQVRUQUNITUVOVCA9IDB4OENEN1xudmFyIEdMX0ZSQU1FQlVGRkVSX0lOQ09NUExFVEVfRElNRU5TSU9OUyA9IDB4OENEOVxudmFyIEdMX0ZSQU1FQlVGRkVSX1VOU1VQUE9SVEVEID0gMHg4Q0REXG5cbnZhciBHTF9CQUNLID0gMTAyOVxuXG52YXIgQkFDS19CVUZGRVIgPSBbR0xfQkFDS11cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwRkJPU3RhdGUgKFxuICBnbCxcbiAgZXh0ZW5zaW9ucyxcbiAgbGltaXRzLFxuICB0ZXh0dXJlU3RhdGUsXG4gIHJlbmRlcmJ1ZmZlclN0YXRlKSB7XG4gIHZhciBzdGF0dXNDb2RlID0ge31cbiAgc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9DT01QTEVURV0gPSAnY29tcGxldGUnXG4gIHN0YXR1c0NvZGVbR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9BVFRBQ0hNRU5UXSA9ICdpbmNvbXBsZXRlIGF0dGFjaG1lbnQnXG4gIHN0YXR1c0NvZGVbR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9ESU1FTlNJT05TXSA9ICdpbmNvbXBsZXRlIGRpbWVuc2lvbnMnXG4gIHN0YXR1c0NvZGVbR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9NSVNTSU5HX0FUVEFDSE1FTlRdID0gJ2luY29tcGxldGUsIG1pc3NpbmcgYXR0YWNobWVudCdcbiAgc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9VTlNVUFBPUlRFRF0gPSAndW5zdXBwb3J0ZWQnXG5cbiAgdmFyIGNvbG9yVGV4dHVyZUZvcm1hdHMgPSB7XG4gICAgJ3JnYmEnOiBHTF9SR0JBXG4gIH1cblxuICB2YXIgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzID0ge1xuICAgICdyZ2JhNCc6IEdMX1JHQkE0LFxuICAgICdyZ2I1NjUnOiBHTF9SR0I1NjUsXG4gICAgJ3JnYjUgYTEnOiBHTF9SR0I1X0ExXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5leHRfc3JnYikge1xuICAgIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0c1snc3JnYmEnXSA9IEdMX1NSR0I4X0FMUEhBOF9FWFRcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLmV4dF9jb2xvcl9idWZmZXJfaGFsZl9mbG9hdCkge1xuICAgIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0c1sncmdiYTE2ZiddID0gR0xfUkdCQTE2Rl9FWFRcbiAgICBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHNbJ3JnYjE2ZiddID0gR0xfUkdCMTZGX0VYVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29sb3JfYnVmZmVyX2Zsb2F0KSB7XG4gICAgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzWydyZ2JhMzJmJ10gPSBHTF9SR0JBMzJGX0VYVFxuICB9XG5cbiAgdmFyIGRlcHRoUmVuZGVyYnVmZmVyRm9ybWF0RW51bXMgPSBbR0xfREVQVEhfQ09NUE9ORU5UMTZdXG4gIHZhciBzdGVuY2lsUmVuZGVyYnVmZmVyRm9ybWF0RW51bXMgPSBbR0xfU1RFTkNJTF9JTkRFWDhdXG4gIHZhciBkZXB0aFN0ZW5jaWxSZW5kZXJidWZmZXJGb3JtYXRFbnVtcyA9IFtHTF9ERVBUSF9TVEVOQ0lMXVxuXG4gIHZhciBkZXB0aFRleHR1cmVGb3JtYXRFbnVtcyA9IFtdXG4gIHZhciBzdGVuY2lsVGV4dHVyZUZvcm1hdEVudW1zID0gW11cbiAgdmFyIGRlcHRoU3RlbmNpbFRleHR1cmVGb3JtYXRFbnVtcyA9IFtdXG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfZGVwdGhfdGV4dHVyZSkge1xuICAgIGRlcHRoVGV4dHVyZUZvcm1hdEVudW1zLnB1c2goR0xfREVQVEhfQ09NUE9ORU5UKVxuICAgIGRlcHRoU3RlbmNpbFRleHR1cmVGb3JtYXRFbnVtcy5wdXNoKEdMX0RFUFRIX1NURU5DSUwpXG4gIH1cblxuICB2YXIgY29sb3JGb3JtYXRzID0gZXh0ZW5kKGV4dGVuZCh7fSxcbiAgICBjb2xvclRleHR1cmVGb3JtYXRzKSxcbiAgICBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHMpXG5cbiAgdmFyIGNvbG9yVGV4dHVyZUZvcm1hdEVudW1zID0gdmFsdWVzKGNvbG9yVGV4dHVyZUZvcm1hdHMpXG4gIHZhciBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdEVudW1zID0gdmFsdWVzKGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0cylcblxuICB2YXIgaGlnaGVzdFByZWNpc2lvbiA9IEdMX1VOU0lHTkVEX0JZVEVcbiAgdmFyIGNvbG9yVHlwZXMgPSB7XG4gICAgJ3VpbnQ4JzogR0xfVU5TSUdORURfQllURVxuICB9XG4gIGlmIChleHRlbnNpb25zLm9lc190ZXh0dXJlX2hhbGZfZmxvYXQpIHtcbiAgICBoaWdoZXN0UHJlY2lzaW9uID0gY29sb3JUeXBlc1snaGFsZiBmbG9hdCddID0gR0xfSEFMRl9GTE9BVF9PRVNcbiAgfVxuICBpZiAoZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9mbG9hdCkge1xuICAgIGhpZ2hlc3RQcmVjaXNpb24gPSBjb2xvclR5cGVzLmZsb2F0ID0gR0xfRkxPQVRcbiAgfVxuICBjb2xvclR5cGVzLmJlc3QgPSBoaWdoZXN0UHJlY2lzaW9uXG5cbiAgdmFyIERSQVdfQlVGRkVSUyA9IChmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHJlc3VsdCA9IG5ldyBBcnJheShsaW1pdHMubWF4RHJhd2J1ZmZlcnMpXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPD0gbGltaXRzLm1heERyYXdidWZmZXJzOyArK2kpIHtcbiAgICAgIHZhciByb3cgPSByZXN1bHRbaV0gPSBuZXcgQXJyYXkoaSlcbiAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgaTsgKytqKSB7XG4gICAgICAgIHJvd1tqXSA9IEdMX0NPTE9SX0FUVEFDSE1FTlQwICsgalxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0XG4gIH0pKClcblxuICBmdW5jdGlvbiBGcmFtZWJ1ZmZlckF0dGFjaG1lbnQgKHRhcmdldCwgbGV2ZWwsIHRleHR1cmUsIHJlbmRlcmJ1ZmZlcikge1xuICAgIHRoaXMudGFyZ2V0ID0gdGFyZ2V0XG4gICAgdGhpcy5sZXZlbCA9IGxldmVsXG4gICAgdGhpcy50ZXh0dXJlID0gdGV4dHVyZVxuICAgIHRoaXMucmVuZGVyYnVmZmVyID0gcmVuZGVyYnVmZmVyXG4gIH1cblxuICBmdW5jdGlvbiBkZWNSZWYgKGF0dGFjaG1lbnQpIHtcbiAgICBpZiAoYXR0YWNobWVudCkge1xuICAgICAgaWYgKGF0dGFjaG1lbnQudGV4dHVyZSkge1xuICAgICAgICBhdHRhY2htZW50LnRleHR1cmUuX3RleHR1cmUuZGVjUmVmKClcbiAgICAgIH1cbiAgICAgIGlmIChhdHRhY2htZW50LnJlbmRlcmJ1ZmZlcikge1xuICAgICAgICBhdHRhY2htZW50LnJlbmRlcmJ1ZmZlci5fcmVuZGVyYnVmZmVyLmRlY1JlZigpXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gY2hlY2tGb3JtYXQgKGF0dGFjaG1lbnQsIHRleEZvcm1hdHMsIHJiRm9ybWF0cykge1xuICAgIGlmIChhdHRhY2htZW50LnRleHR1cmUpIHtcbiAgICAgIFxuICAgIH0gZWxzZSB7XG4gICAgICBcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBpbmNSZWZBbmRDaGVja1NoYXBlIChhdHRhY2htZW50LCBmcmFtZWJ1ZmZlcikge1xuICAgIHZhciB3aWR0aCA9IGZyYW1lYnVmZmVyLndpZHRoXG4gICAgdmFyIGhlaWdodCA9IGZyYW1lYnVmZmVyLmhlaWdodFxuICAgIGlmIChhdHRhY2htZW50LnRleHR1cmUpIHtcbiAgICAgIHZhciB0ZXh0dXJlID0gYXR0YWNobWVudC50ZXh0dXJlLl90ZXh0dXJlXG4gICAgICB2YXIgdHcgPSBNYXRoLm1heCgxLCB0ZXh0dXJlLnBhcmFtcy53aWR0aCA+PiBhdHRhY2htZW50LmxldmVsKVxuICAgICAgdmFyIHRoID0gTWF0aC5tYXgoMSwgdGV4dHVyZS5wYXJhbXMuaGVpZ2h0ID4+IGF0dGFjaG1lbnQubGV2ZWwpXG4gICAgICB3aWR0aCA9IHdpZHRoIHx8IHR3XG4gICAgICBoZWlnaHQgPSBoZWlnaHQgfHwgdGhcbiAgICAgIFxuICAgICAgXG4gICAgICB0ZXh0dXJlLnJlZkNvdW50ICs9IDFcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIHJlbmRlcmJ1ZmZlciA9IGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXJcbiAgICAgIHdpZHRoID0gd2lkdGggfHwgcmVuZGVyYnVmZmVyLndpZHRoXG4gICAgICBoZWlnaHQgPSBoZWlnaHQgfHwgcmVuZGVyYnVmZmVyLmhlaWdodFxuICAgICAgXG4gICAgICBcbiAgICAgIHJlbmRlcmJ1ZmZlci5yZWZDb3VudCArPSAxXG4gICAgfVxuICAgIGZyYW1lYnVmZmVyLndpZHRoID0gd2lkdGhcbiAgICBmcmFtZWJ1ZmZlci5oZWlnaHQgPSBoZWlnaHRcbiAgfVxuXG4gIGZ1bmN0aW9uIGF0dGFjaCAobG9jYXRpb24sIGF0dGFjaG1lbnQpIHtcbiAgICBpZiAoYXR0YWNobWVudCkge1xuICAgICAgaWYgKGF0dGFjaG1lbnQudGV4dHVyZSkge1xuICAgICAgICBnbC5mcmFtZWJ1ZmZlclRleHR1cmUyRChcbiAgICAgICAgICBHTF9GUkFNRUJVRkZFUixcbiAgICAgICAgICBsb2NhdGlvbixcbiAgICAgICAgICBhdHRhY2htZW50LnRhcmdldCxcbiAgICAgICAgICBhdHRhY2htZW50LnRleHR1cmUuX3RleHR1cmUudGV4dHVyZSxcbiAgICAgICAgICBhdHRhY2htZW50LmxldmVsKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZ2wuZnJhbWVidWZmZXJSZW5kZXJidWZmZXIoXG4gICAgICAgICAgR0xfRlJBTUVCVUZGRVIsXG4gICAgICAgICAgbG9jYXRpb24sXG4gICAgICAgICAgR0xfUkVOREVSQlVGRkVSLFxuICAgICAgICAgIGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXIucmVuZGVyYnVmZmVyKVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBnbC5mcmFtZWJ1ZmZlclRleHR1cmUyRChcbiAgICAgICAgR0xfRlJBTUVCVUZGRVIsXG4gICAgICAgIGxvY2F0aW9uLFxuICAgICAgICBHTF9URVhUVVJFXzJELFxuICAgICAgICBudWxsLFxuICAgICAgICAwKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHRyeVVwZGF0ZUF0dGFjaG1lbnQgKFxuICAgIGF0dGFjaG1lbnQsXG4gICAgaXNUZXh0dXJlLFxuICAgIGZvcm1hdCxcbiAgICB0eXBlLFxuICAgIHdpZHRoLFxuICAgIGhlaWdodCkge1xuICAgIGlmIChhdHRhY2htZW50LnRleHR1cmUpIHtcbiAgICAgIHZhciB0ZXh0dXJlID0gYXR0YWNobWVudC50ZXh0dXJlXG4gICAgICBpZiAoaXNUZXh0dXJlKSB7XG4gICAgICAgIHRleHR1cmUoe1xuICAgICAgICAgIGZvcm1hdDogZm9ybWF0LFxuICAgICAgICAgIHR5cGU6IHR5cGUsXG4gICAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICAgIGhlaWdodDogaGVpZ2h0XG4gICAgICAgIH0pXG4gICAgICAgIHRleHR1cmUuX3RleHR1cmUucmVmQ291bnQgKz0gMVxuICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgcmVuZGVyYnVmZmVyID0gYXR0YWNobWVudC5yZW5kZXJidWZmZXJcbiAgICAgIGlmICghaXNUZXh0dXJlKSB7XG4gICAgICAgIHJlbmRlcmJ1ZmZlcih7XG4gICAgICAgICAgZm9ybWF0OiBmb3JtYXQsXG4gICAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICAgIGhlaWdodDogaGVpZ2h0XG4gICAgICAgIH0pXG4gICAgICAgIHJlbmRlcmJ1ZmZlci5fcmVuZGVyYnVmZmVyLnJlZkNvdW50ICs9IDFcbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgIH1cbiAgICB9XG4gICAgZGVjUmVmKGF0dGFjaG1lbnQpXG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZUF0dGFjaG1lbnQgKGF0dGFjaG1lbnQpIHtcbiAgICB2YXIgdGFyZ2V0ID0gR0xfVEVYVFVSRV8yRFxuICAgIHZhciBsZXZlbCA9IDBcbiAgICB2YXIgdGV4dHVyZSA9IG51bGxcbiAgICB2YXIgcmVuZGVyYnVmZmVyID0gbnVsbFxuXG4gICAgdmFyIGRhdGEgPSBhdHRhY2htZW50XG4gICAgaWYgKHR5cGVvZiBhdHRhY2htZW50ID09PSAnb2JqZWN0Jykge1xuICAgICAgZGF0YSA9IGF0dGFjaG1lbnQuZGF0YVxuICAgICAgaWYgKCdsZXZlbCcgaW4gYXR0YWNobWVudCkge1xuICAgICAgICBsZXZlbCA9IGF0dGFjaG1lbnQubGV2ZWwgfCAwXG4gICAgICB9XG4gICAgICBpZiAoJ3RhcmdldCcgaW4gYXR0YWNobWVudCkge1xuICAgICAgICB0YXJnZXQgPSBhdHRhY2htZW50LnRhcmdldCB8IDBcbiAgICAgIH1cbiAgICB9XG5cbiAgICBcblxuICAgIHZhciB0eXBlID0gYXR0YWNobWVudC5fcmVnbFR5cGVcbiAgICBpZiAodHlwZSA9PT0gJ3RleHR1cmUnKSB7XG4gICAgICB0ZXh0dXJlID0gYXR0YWNobWVudFxuICAgICAgaWYgKHRleHR1cmUuX3RleHR1cmUudGFyZ2V0ID09PSBHTF9URVhUVVJFX0NVQkVfTUFQKSB7XG4gICAgICAgIFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgXG4gICAgICB9XG4gICAgICAvLyBUT0RPIGNoZWNrIG1pcGxldmVsIGlzIGNvbnNpc3RlbnRcbiAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICdyZW5kZXJidWZmZXInKSB7XG4gICAgICByZW5kZXJidWZmZXIgPSBhdHRhY2htZW50XG4gICAgICB0YXJnZXQgPSBHTF9SRU5ERVJCVUZGRVJcbiAgICAgIGxldmVsID0gMFxuICAgIH0gZWxzZSB7XG4gICAgICBcbiAgICB9XG5cbiAgICByZXR1cm4gbmV3IEZyYW1lYnVmZmVyQXR0YWNobWVudCh0YXJnZXQsIGxldmVsLCB0ZXh0dXJlLCByZW5kZXJidWZmZXIpXG4gIH1cblxuICBmdW5jdGlvbiB1bndyYXBBdHRhY2htZW50IChhdHRhY2htZW50KSB7XG4gICAgcmV0dXJuIGF0dGFjaG1lbnQgJiYgKGF0dGFjaG1lbnQudGV4dHVyZSB8fCBhdHRhY2htZW50LnJlbmRlcmJ1ZmZlcilcbiAgfVxuXG4gIHZhciBmcmFtZWJ1ZmZlckNvdW50ID0gMFxuICB2YXIgZnJhbWVidWZmZXJTZXQgPSB7fVxuICB2YXIgZnJhbWVidWZmZXJTdGFjayA9IFtudWxsXVxuICB2YXIgZnJhbWVidWZmZXJEaXJ0eSA9IHRydWVcblxuICBmdW5jdGlvbiBSRUdMRnJhbWVidWZmZXIgKCkge1xuICAgIHRoaXMuaWQgPSBmcmFtZWJ1ZmZlckNvdW50KytcbiAgICBmcmFtZWJ1ZmZlclNldFt0aGlzLmlkXSA9IHRoaXNcblxuICAgIHRoaXMuZnJhbWVidWZmZXIgPSBudWxsXG4gICAgdGhpcy53aWR0aCA9IDBcbiAgICB0aGlzLmhlaWdodCA9IDBcblxuICAgIHRoaXMuY29sb3JBdHRhY2htZW50cyA9IFtdXG4gICAgdGhpcy5kZXB0aEF0dGFjaG1lbnQgPSBudWxsXG4gICAgdGhpcy5zdGVuY2lsQXR0YWNobWVudCA9IG51bGxcbiAgICB0aGlzLmRlcHRoU3RlbmNpbEF0dGFjaG1lbnQgPSBudWxsXG5cbiAgICB0aGlzLm93bnNDb2xvciA9IGZhbHNlXG4gICAgdGhpcy5vd25zRGVwdGhTdGVuY2lsID0gZmFsc2VcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlZnJlc2ggKGZyYW1lYnVmZmVyKSB7XG4gICAgaWYgKCFnbC5pc0ZyYW1lYnVmZmVyKGZyYW1lYnVmZmVyLmZyYW1lYnVmZmVyKSkge1xuICAgICAgZnJhbWVidWZmZXIuZnJhbWVidWZmZXIgPSBnbC5jcmVhdGVGcmFtZWJ1ZmZlcigpXG4gICAgfVxuICAgIGZyYW1lYnVmZmVyRGlydHkgPSB0cnVlXG4gICAgZ2wuYmluZEZyYW1lYnVmZmVyKEdMX0ZSQU1FQlVGRkVSLCBmcmFtZWJ1ZmZlci5mcmFtZWJ1ZmZlcilcblxuICAgIHZhciBjb2xvckF0dGFjaG1lbnRzID0gZnJhbWVidWZmZXIuY29sb3JBdHRhY2htZW50c1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY29sb3JBdHRhY2htZW50cy5sZW5ndGg7ICsraSkge1xuICAgICAgYXR0YWNoKEdMX0NPTE9SX0FUVEFDSE1FTlQwICsgaSwgY29sb3JBdHRhY2htZW50c1tpXSlcbiAgICB9XG4gICAgZm9yIChpID0gY29sb3JBdHRhY2htZW50cy5sZW5ndGg7IGkgPCBsaW1pdHMubWF4Q29sb3JBdHRhY2htZW50czsgKytpKSB7XG4gICAgICBhdHRhY2goR0xfQ09MT1JfQVRUQUNITUVOVDAgKyBpLCBudWxsKVxuICAgIH1cbiAgICBhdHRhY2goR0xfREVQVEhfQVRUQUNITUVOVCwgZnJhbWVidWZmZXIuZGVwdGhBdHRhY2htZW50KVxuICAgIGF0dGFjaChHTF9TVEVOQ0lMX0FUVEFDSE1FTlQsIGZyYW1lYnVmZmVyLnN0ZW5jaWxBdHRhY2htZW50KVxuICAgIGF0dGFjaChHTF9ERVBUSF9TVEVOQ0lMX0FUVEFDSE1FTlQsIGZyYW1lYnVmZmVyLmRlcHRoU3RlbmNpbEF0dGFjaG1lbnQpXG5cbiAgICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9kcmF3X2J1ZmZlcnMpIHtcbiAgICAgIGV4dGVuc2lvbnMud2ViZ2xfZHJhd19idWZmZXJzLmRyYXdCdWZmZXJzV0VCR0woXG4gICAgICAgIERSQVdfQlVGRkVSU1tjb2xvckF0dGFjaG1lbnRzLmxlbmd0aF0pXG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgc3RhdHVzIGNvZGVcbiAgICB2YXIgc3RhdHVzID0gZ2wuY2hlY2tGcmFtZWJ1ZmZlclN0YXR1cyhHTF9GUkFNRUJVRkZFUilcbiAgICBpZiAoc3RhdHVzICE9PSBHTF9GUkFNRUJVRkZFUl9DT01QTEVURSkge1xuICAgICAgXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZGVjRkJPUmVmcyAoZnJhbWVidWZmZXIpIHtcbiAgICBmcmFtZWJ1ZmZlci5jb2xvckF0dGFjaG1lbnRzLmZvckVhY2goZGVjUmVmKVxuICAgIGRlY1JlZihmcmFtZWJ1ZmZlci5kZXB0aEF0dGFjaG1lbnQpXG4gICAgZGVjUmVmKGZyYW1lYnVmZmVyLnN0ZW5jaWxBdHRhY2htZW50KVxuICAgIGRlY1JlZihmcmFtZWJ1ZmZlci5kZXB0aFN0ZW5jaWxBdHRhY2htZW50KVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSAoZnJhbWVidWZmZXIpIHtcbiAgICB2YXIgaGFuZGxlID0gZnJhbWVidWZmZXIuZnJhbWVidWZmZXJcbiAgICBcbiAgICBpZiAoZ2wuaXNGcmFtZWJ1ZmZlcihoYW5kbGUpKSB7XG4gICAgICBnbC5kZWxldGVGcmFtZWJ1ZmZlcihoYW5kbGUpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlRkJPIChvcHRpb25zKSB7XG4gICAgdmFyIGZyYW1lYnVmZmVyID0gbmV3IFJFR0xGcmFtZWJ1ZmZlcigpXG5cbiAgICBmdW5jdGlvbiByZWdsRnJhbWVidWZmZXIgKGlucHV0KSB7XG4gICAgICB2YXIgaVxuICAgICAgdmFyIG9wdGlvbnMgPSBpbnB1dCB8fCB7fVxuXG4gICAgICB2YXIgZXh0RHJhd0J1ZmZlcnMgPSBleHRlbnNpb25zLndlYmdsX2RyYXdfYnVmZmVyc1xuXG4gICAgICB2YXIgd2lkdGggPSAwXG4gICAgICB2YXIgaGVpZ2h0ID0gMFxuICAgICAgaWYgKCdzaGFwZScgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgc2hhcGUgPSBvcHRpb25zLnNoYXBlXG4gICAgICAgIFxuICAgICAgICB3aWR0aCA9IHNoYXBlWzBdXG4gICAgICAgIGhlaWdodCA9IHNoYXBlWzFdXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoJ3JhZGl1cycgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHdpZHRoID0gaGVpZ2h0ID0gb3B0aW9ucy5yYWRpdXNcbiAgICAgICAgfVxuICAgICAgICBpZiAoJ3dpZHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgd2lkdGggPSBvcHRpb25zLndpZHRoXG4gICAgICAgIH1cbiAgICAgICAgaWYgKCdoZWlnaHQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBoZWlnaHQgPSBvcHRpb25zLmhlaWdodFxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIGNvbG9yVHlwZSwgbnVtQ29sb3JzXG4gICAgICB2YXIgY29sb3JCdWZmZXJzID0gbnVsbFxuICAgICAgdmFyIG93bnNDb2xvciA9IGZhbHNlXG4gICAgICBpZiAoJ2NvbG9yQnVmZmVycycgaW4gb3B0aW9ucyB8fCAnY29sb3JCdWZmZXInIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGNvbG9ySW5wdXRzID0gb3B0aW9ucy5jb2xvckJ1ZmZlcnMgfHwgb3B0aW9ucy5jb2xvckJ1ZmZlclxuICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkoY29sb3JJbnB1dHMpKSB7XG4gICAgICAgICAgY29sb3JJbnB1dHMgPSBbY29sb3JJbnB1dHNdXG4gICAgICAgIH1cblxuICAgICAgICBmcmFtZWJ1ZmZlci53aWR0aCA9IHdpZHRoXG4gICAgICAgIGZyYW1lYnVmZmVyLmhlaWdodCA9IGhlaWdodFxuXG4gICAgICAgIGlmIChjb2xvcklucHV0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgXG4gICAgICAgIH1cbiAgICAgICAgXG5cbiAgICAgICAgLy8gV3JhcCBjb2xvciBhdHRhY2htZW50c1xuICAgICAgICBjb2xvckJ1ZmZlcnMgPSBjb2xvcklucHV0cy5tYXAocGFyc2VBdHRhY2htZW50KVxuXG4gICAgICAgIC8vIENoZWNrIGhlYWQgbm9kZVxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY29sb3JCdWZmZXJzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgdmFyIGNvbG9yQXR0YWNobWVudCA9IGNvbG9yQnVmZmVyc1tpXVxuICAgICAgICAgIGNoZWNrRm9ybWF0KFxuICAgICAgICAgICAgY29sb3JBdHRhY2htZW50LFxuICAgICAgICAgICAgY29sb3JUZXh0dXJlRm9ybWF0RW51bXMsXG4gICAgICAgICAgICBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdEVudW1zKVxuICAgICAgICAgIGluY1JlZkFuZENoZWNrU2hhcGUoXG4gICAgICAgICAgICBjb2xvckF0dGFjaG1lbnQsXG4gICAgICAgICAgICBmcmFtZWJ1ZmZlcilcbiAgICAgICAgfVxuXG4gICAgICAgIHdpZHRoID0gZnJhbWVidWZmZXIud2lkdGhcbiAgICAgICAgaGVpZ2h0ID0gZnJhbWVidWZmZXIuaGVpZ2h0XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgY29sb3JUZXh0dXJlID0gdHJ1ZVxuICAgICAgICB2YXIgY29sb3JGb3JtYXQgPSAncmdiYSdcbiAgICAgICAgdmFyIGNvbG9yVHlwZSA9ICd1aW50OCdcbiAgICAgICAgdmFyIGNvbG9yQ291bnQgPSAxXG4gICAgICAgIG93bnNDb2xvciA9IHRydWVcblxuICAgICAgICBmcmFtZWJ1ZmZlci53aWR0aCA9IHdpZHRoID0gd2lkdGggfHwgZ2wuZHJhd2luZ0J1ZmZlcldpZHRoXG4gICAgICAgIGZyYW1lYnVmZmVyLmhlaWdodCA9IGhlaWdodCA9IGhlaWdodCB8fCBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0XG5cbiAgICAgICAgaWYgKCdmb3JtYXQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBjb2xvckZvcm1hdCA9IG9wdGlvbnMuZm9ybWF0XG4gICAgICAgICAgXG4gICAgICAgICAgY29sb3JUZXh0dXJlID0gY29sb3JGb3JtYXQgaW4gY29sb3JUZXh0dXJlRm9ybWF0c1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCd0eXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgXG4gICAgICAgICAgY29sb3JUeXBlID0gb3B0aW9ucy50eXBlXG4gICAgICAgICAgXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ2NvbG9yQ291bnQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBjb2xvckNvdW50ID0gb3B0aW9ucy5jb2xvckNvdW50IHwgMFxuICAgICAgICAgIFxuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmV1c2UgY29sb3IgYnVmZmVyIGFycmF5IGlmIHdlIG93biBpdFxuICAgICAgICBpZiAoZnJhbWVidWZmZXIub3duc0NvbG9yKSB7XG4gICAgICAgICAgY29sb3JCdWZmZXJzID0gZnJhbWVidWZmZXIuY29sb3JBdHRhY2htZW50c1xuICAgICAgICAgIHdoaWxlIChjb2xvckJ1ZmZlcnMubGVuZ3RoID4gY29sb3JDb3VudCkge1xuICAgICAgICAgICAgZGVjUmVmKGNvbG9yQnVmZmVycy5wb3AoKSlcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29sb3JCdWZmZXJzID0gW11cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHVwZGF0ZSBidWZmZXJzIGluIHBsYWNlLCByZW1vdmUgaW5jb21wYXRpYmxlIGJ1ZmZlcnNcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGNvbG9yQnVmZmVycy5sZW5ndGg7ICsraSkge1xuICAgICAgICAgIGlmICghdHJ5VXBkYXRlQXR0YWNobWVudChcbiAgICAgICAgICAgICAgY29sb3JCdWZmZXJzW2ldLFxuICAgICAgICAgICAgICBjb2xvclRleHR1cmUsXG4gICAgICAgICAgICAgIGNvbG9yRm9ybWF0LFxuICAgICAgICAgICAgICBjb2xvclR5cGUsXG4gICAgICAgICAgICAgIHdpZHRoLFxuICAgICAgICAgICAgICBoZWlnaHQpKSB7XG4gICAgICAgICAgICBjb2xvckJ1ZmZlcnNbaS0tXSA9IGNvbG9yQnVmZmVyc1tjb2xvckJ1ZmZlcnMubGVuZ3RoIC0gMV1cbiAgICAgICAgICAgIGNvbG9yQnVmZmVycy5wb3AoKVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFRoZW4gYXBwZW5kIG5ldyBidWZmZXJzXG4gICAgICAgIHdoaWxlIChjb2xvckJ1ZmZlcnMubGVuZ3RoIDwgY29sb3JDb3VudCkge1xuICAgICAgICAgIGlmIChjb2xvclRleHR1cmUpIHtcbiAgICAgICAgICAgIGNvbG9yQnVmZmVycy5wdXNoKG5ldyBGcmFtZWJ1ZmZlckF0dGFjaG1lbnQoXG4gICAgICAgICAgICAgIEdMX1RFWFRVUkVfMkQsXG4gICAgICAgICAgICAgIDAsXG4gICAgICAgICAgICAgIHRleHR1cmVTdGF0ZS5jcmVhdGUoe1xuICAgICAgICAgICAgICAgIGZvcm1hdDogY29sb3JGb3JtYXQsXG4gICAgICAgICAgICAgICAgdHlwZTogY29sb3JUeXBlLFxuICAgICAgICAgICAgICAgIHdpZHRoOiB3aWR0aCxcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IGhlaWdodFxuICAgICAgICAgICAgICB9LCBHTF9URVhUVVJFXzJEKSxcbiAgICAgICAgICAgICAgbnVsbCkpXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbG9yQnVmZmVycy5wdXNoKG5ldyBGcmFtZWJ1ZmZlckF0dGFjaG1lbnQoXG4gICAgICAgICAgICAgIEdMX1JFTkRFUkJVRkZFUixcbiAgICAgICAgICAgICAgMCxcbiAgICAgICAgICAgICAgbnVsbCxcbiAgICAgICAgICAgICAgcmVuZGVyYnVmZmVyU3RhdGUuY3JlYXRlKHtcbiAgICAgICAgICAgICAgICBmb3JtYXQ6IGNvbG9yRm9ybWF0LFxuICAgICAgICAgICAgICAgIHdpZHRoOiB3aWR0aCxcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IGhlaWdodFxuICAgICAgICAgICAgICB9KSkpXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIFxuXG4gICAgICBmcmFtZWJ1ZmZlci53aWR0aCA9IHdpZHRoXG4gICAgICBmcmFtZWJ1ZmZlci5oZWlnaHQgPSBoZWlnaHRcblxuICAgICAgdmFyIGRlcHRoQnVmZmVyID0gbnVsbFxuICAgICAgdmFyIHN0ZW5jaWxCdWZmZXIgPSBudWxsXG4gICAgICB2YXIgZGVwdGhTdGVuY2lsQnVmZmVyID0gbnVsbFxuICAgICAgdmFyIG93bnNEZXB0aFN0ZW5jaWwgPSBmYWxzZVxuICAgICAgdmFyIGRlcHRoU3RlbmNpbENvdW50ID0gMFxuXG4gICAgICBpZiAoJ2RlcHRoQnVmZmVyJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIGRlcHRoQnVmZmVyID0gcGFyc2VBdHRhY2htZW50KG9wdGlvbnMuZGVwdGhCdWZmZXIpXG4gICAgICAgIGNoZWNrRm9ybWF0KFxuICAgICAgICAgIGRlcHRoQnVmZmVyLFxuICAgICAgICAgIGRlcHRoVGV4dHVyZUZvcm1hdEVudW1zLFxuICAgICAgICAgIGRlcHRoUmVuZGVyYnVmZmVyRm9ybWF0RW51bXMpXG4gICAgICAgIGRlcHRoU3RlbmNpbENvdW50ICs9IDFcbiAgICAgIH1cbiAgICAgIGlmICgnc3RlbmNpbEJ1ZmZlcicgaW4gb3B0aW9ucykge1xuICAgICAgICBzdGVuY2lsQnVmZmVyID0gcGFyc2VBdHRhY2htZW50KG9wdGlvbnMuc3RlbmNpbEJ1ZmZlcilcbiAgICAgICAgY2hlY2tGb3JtYXQoXG4gICAgICAgICAgc3RlbmNpbEJ1ZmZlcixcbiAgICAgICAgICBzdGVuY2lsVGV4dHVyZUZvcm1hdEVudW1zLFxuICAgICAgICAgIHN0ZW5jaWxSZW5kZXJidWZmZXJGb3JtYXRFbnVtcylcbiAgICAgICAgZGVwdGhTdGVuY2lsQ291bnQgKz0gMVxuICAgICAgfVxuICAgICAgaWYgKCdkZXB0aFN0ZW5jaWxCdWZmZXInIGluIG9wdGlvbnMpIHtcbiAgICAgICAgZGVwdGhTdGVuY2lsQnVmZmVyID0gcGFyc2VBdHRhY2htZW50KG9wdGlvbnMuZGVwdGhTdGVuY2lsQnVmZmVyKVxuICAgICAgICBjaGVja0Zvcm1hdChcbiAgICAgICAgICBkZXB0aFN0ZW5jaWxCdWZmZXIsXG4gICAgICAgICAgZGVwdGhTdGVuY2lsVGV4dHVyZUZvcm1hdEVudW1zLFxuICAgICAgICAgIGRlcHRoU3RlbmNpbFJlbmRlcmJ1ZmZlckZvcm1hdEVudW1zKVxuICAgICAgICBkZXB0aFN0ZW5jaWxDb3VudCArPSAxXG4gICAgICB9XG5cbiAgICAgIGlmICghKGRlcHRoQnVmZmVyIHx8IHN0ZW5jaWxCdWZmZXIgfHwgZGVwdGhTdGVuY2lsQnVmZmVyKSkge1xuICAgICAgICB2YXIgZGVwdGggPSB0cnVlXG4gICAgICAgIHZhciBzdGVuY2lsID0gZmFsc2VcbiAgICAgICAgdmFyIHVzZVRleHR1cmUgPSBmYWxzZVxuXG4gICAgICAgIGlmICgnZGVwdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBkZXB0aCA9ICEhb3B0aW9ucy5kZXB0aFxuICAgICAgICB9XG4gICAgICAgIGlmICgnc3RlbmNpbCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHN0ZW5jaWwgPSAhIW9wdGlvbnMuc3RlbmNpbFxuICAgICAgICB9XG4gICAgICAgIGlmICgnZGVwdGhUZXh0dXJlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgdXNlVGV4dHVyZSA9ICEhb3B0aW9ucy5kZXB0aFRleHR1cmVcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBjdXJEZXB0aFN0ZW5jaWwgPVxuICAgICAgICAgIGZyYW1lYnVmZmVyLmRlcHRoQXR0YWNobWVudCB8fFxuICAgICAgICAgIGZyYW1lYnVmZmVyLnN0ZW5jaWxBdHRhY2htZW50IHx8XG4gICAgICAgICAgZnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsQXR0YWNobWVudFxuICAgICAgICB2YXIgbmV4dERlcHRoU3RlbmNpbCA9IG51bGxcblxuICAgICAgICBpZiAoZGVwdGggfHwgc3RlbmNpbCkge1xuICAgICAgICAgIG93bnNEZXB0aFN0ZW5jaWwgPSB0cnVlXG5cbiAgICAgICAgICBpZiAodXNlVGV4dHVyZSkge1xuICAgICAgICAgICAgXG4gICAgICAgICAgICB2YXIgZGVwdGhUZXh0dXJlRm9ybWF0XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIChzdGVuY2lsKSB7XG4gICAgICAgICAgICAgIGRlcHRoVGV4dHVyZUZvcm1hdCA9ICdkZXB0aCBzdGVuY2lsJ1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgZGVwdGhUZXh0dXJlRm9ybWF0ID0gJ2RlcHRoJ1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGZyYW1lYnVmZmVyLm93bnNEZXB0aFN0ZW5jaWwgJiYgY3VyRGVwdGhTdGVuY2lsLnRleHR1cmUpIHtcbiAgICAgICAgICAgICAgY3VyRGVwdGhTdGVuY2lsLnRleHR1cmUoe1xuICAgICAgICAgICAgICAgIGZvcm1hdDogZGVwdGhUZXh0dXJlRm9ybWF0LFxuICAgICAgICAgICAgICAgIHdpZHRoOiB3aWR0aCxcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IGhlaWdodFxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICBjdXJEZXB0aFN0ZW5jaWwudGV4dHVyZS5fdGV4dHVyZS5yZWZDb3VudCArPSAxXG4gICAgICAgICAgICAgIG5leHREZXB0aFN0ZW5jaWwgPSBjdXJEZXB0aFN0ZW5jaWxcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIG5leHREZXB0aFN0ZW5jaWwgPSBuZXcgRnJhbWVidWZmZXJBdHRhY2htZW50KFxuICAgICAgICAgICAgICAgIEdMX1RFWFRVUkVfMkQsXG4gICAgICAgICAgICAgICAgMCxcbiAgICAgICAgICAgICAgICB0ZXh0dXJlU3RhdGUuY3JlYXRlKHtcbiAgICAgICAgICAgICAgICAgIGZvcm1hdDogZGVwdGhUZXh0dXJlRm9ybWF0LFxuICAgICAgICAgICAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICAgICAgICAgICAgaGVpZ2h0OiBoZWlnaHRcbiAgICAgICAgICAgICAgICB9LCBHTF9URVhUVVJFXzJEKSxcbiAgICAgICAgICAgICAgICBudWxsKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgZGVwdGhSZW5kZXJidWZmZXJGb3JtYXRcbiAgICAgICAgICAgIGlmIChkZXB0aCkge1xuICAgICAgICAgICAgICBpZiAoc3RlbmNpbCkge1xuICAgICAgICAgICAgICAgIGRlcHRoUmVuZGVyYnVmZmVyRm9ybWF0ID0gJ2RlcHRoIHN0ZW5jaWwnXG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZGVwdGhSZW5kZXJidWZmZXJGb3JtYXQgPSAnZGVwdGgnXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGRlcHRoUmVuZGVyYnVmZmVyRm9ybWF0ID0gJ3N0ZW5jaWwnXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoZnJhbWVidWZmZXIub3duc0RlcHRoU3RlbmNpbCAmJiBjdXJEZXB0aFN0ZW5jaWwucmVuZGVyYnVmZmVyKSB7XG4gICAgICAgICAgICAgIGN1ckRlcHRoU3RlbmNpbC5yZW5kZXJidWZmZXIoe1xuICAgICAgICAgICAgICAgIGZvcm1hdDogZGVwdGhSZW5kZXJidWZmZXJGb3JtYXQsXG4gICAgICAgICAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICAgICAgICAgIGhlaWdodDogaGVpZ2h0XG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIGN1ckRlcHRoU3RlbmNpbC5yZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlci5yZWZDb3VudCArPSAxXG4gICAgICAgICAgICAgIG5leHREZXB0aFN0ZW5jaWwgPSBjdXJEZXB0aFN0ZW5jaWxcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIG5leHREZXB0aFN0ZW5jaWwgPSBuZXcgRnJhbWVidWZmZXJBdHRhY2htZW50KFxuICAgICAgICAgICAgICAgIEdMX1JFTkRFUkJVRkZFUixcbiAgICAgICAgICAgICAgICAwLFxuICAgICAgICAgICAgICAgIG51bGwsXG4gICAgICAgICAgICAgICAgcmVuZGVyYnVmZmVyU3RhdGUuY3JlYXRlKHtcbiAgICAgICAgICAgICAgICAgIGZvcm1hdDogZGVwdGhSZW5kZXJidWZmZXJGb3JtYXQsXG4gICAgICAgICAgICAgICAgICB3aWR0aDogd2lkdGgsXG4gICAgICAgICAgICAgICAgICBoZWlnaHQ6IGhlaWdodFxuICAgICAgICAgICAgICAgIH0pKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChkZXB0aCkge1xuICAgICAgICAgICAgaWYgKHN0ZW5jaWwpIHtcbiAgICAgICAgICAgICAgZGVwdGhTdGVuY2lsQnVmZmVyID0gbmV4dERlcHRoU3RlbmNpbFxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgZGVwdGhCdWZmZXIgPSBuZXh0RGVwdGhTdGVuY2lsXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHN0ZW5jaWxCdWZmZXIgPSBuZXh0RGVwdGhTdGVuY2lsXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBcblxuICAgICAgICBpbmNSZWZBbmRDaGVja1NoYXBlKFxuICAgICAgICAgIGRlcHRoQnVmZmVyIHx8XG4gICAgICAgICAgc3RlbmNpbEJ1ZmZlciB8fFxuICAgICAgICAgIGRlcHRoU3RlbmNpbEJ1ZmZlcixcbiAgICAgICAgICBmcmFtZWJ1ZmZlcilcbiAgICAgIH1cblxuICAgICAgZGVjRkJPUmVmcyhmcmFtZWJ1ZmZlcilcblxuICAgICAgZnJhbWVidWZmZXIuY29sb3JBdHRhY2htZW50cyA9IGNvbG9yQnVmZmVyc1xuICAgICAgZnJhbWVidWZmZXIuZGVwdGhBdHRhY2htZW50ID0gZGVwdGhCdWZmZXJcbiAgICAgIGZyYW1lYnVmZmVyLnN0ZW5jaWxBdHRhY2htZW50ID0gc3RlbmNpbEJ1ZmZlclxuICAgICAgZnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsQXR0YWNobWVudCA9IGRlcHRoU3RlbmNpbEJ1ZmZlclxuICAgICAgZnJhbWVidWZmZXIub3duc0NvbG9yID0gb3duc0NvbG9yXG4gICAgICBmcmFtZWJ1ZmZlci5vd25zRGVwdGhTdGVuY2lsID0gb3duc0RlcHRoU3RlbmNpbFxuXG4gICAgICByZWdsRnJhbWVidWZmZXIuY29sb3IgPSBjb2xvckJ1ZmZlcnMubWFwKHVud3JhcEF0dGFjaG1lbnQpXG4gICAgICByZWdsRnJhbWVidWZmZXIuZGVwdGggPSB1bndyYXBBdHRhY2htZW50KGRlcHRoQnVmZmVyKVxuICAgICAgcmVnbEZyYW1lYnVmZmVyLnN0ZW5jaWwgPSB1bndyYXBBdHRhY2htZW50KHN0ZW5jaWxCdWZmZXIpXG4gICAgICByZWdsRnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsID0gdW53cmFwQXR0YWNobWVudChkZXB0aFN0ZW5jaWxCdWZmZXIpXG5cbiAgICAgIHJlZnJlc2goZnJhbWVidWZmZXIpXG5cbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci53aWR0aCA9IGZyYW1lYnVmZmVyLndpZHRoXG4gICAgICByZWdsRnJhbWVidWZmZXIuaGVpZ2h0ID0gZnJhbWVidWZmZXIuaGVpZ2h0XG5cbiAgICAgIHJldHVybiByZWdsRnJhbWVidWZmZXJcbiAgICB9XG5cbiAgICByZWdsRnJhbWVidWZmZXIob3B0aW9ucylcblxuICAgIHJlZ2xGcmFtZWJ1ZmZlci5fcmVnbFR5cGUgPSAnZnJhbWVidWZmZXInXG4gICAgcmVnbEZyYW1lYnVmZmVyLl9mcmFtZWJ1ZmZlciA9IGZyYW1lYnVmZmVyXG4gICAgcmVnbEZyYW1lYnVmZmVyLl9kZXN0cm95ID0gZnVuY3Rpb24gKCkge1xuICAgICAgZGVzdHJveShmcmFtZWJ1ZmZlcilcbiAgICB9XG5cbiAgICByZXR1cm4gcmVnbEZyYW1lYnVmZmVyXG4gIH1cblxuICBmdW5jdGlvbiByZWZyZXNoQ2FjaGUgKCkge1xuICAgIHZhbHVlcyhmcmFtZWJ1ZmZlclNldCkuZm9yRWFjaChyZWZyZXNoKVxuICB9XG5cbiAgZnVuY3Rpb24gY2xlYXJDYWNoZSAoKSB7XG4gICAgdmFsdWVzKGZyYW1lYnVmZmVyU2V0KS5mb3JFYWNoKGRlc3Ryb3kpXG4gIH1cblxuICBmdW5jdGlvbiBwb2xsICgpIHtcbiAgICBpZiAoZnJhbWVidWZmZXJEaXJ0eSkge1xuICAgICAgdmFyIHRvcCA9IGZyYW1lYnVmZmVyU3RhY2tbZnJhbWVidWZmZXJTdGFjay5sZW5ndGggLSAxXVxuICAgICAgdmFyIGV4dF9kcmF3YnVmZmVycyA9IGV4dGVuc2lvbnMud2ViZ2xfZHJhd19idWZmZXJzXG5cbiAgICAgIGlmICh0b3ApIHtcbiAgICAgICAgZ2wuYmluZEZyYW1lYnVmZmVyKEdMX0ZSQU1FQlVGRkVSLCB0b3AuZnJhbWVidWZmZXIpXG4gICAgICAgIGlmIChleHRfZHJhd2J1ZmZlcnMpIHtcbiAgICAgICAgICBleHRfZHJhd2J1ZmZlcnMuZHJhd0J1ZmZlcnNXRUJHTChEUkFXX0JVRkZFUlNbdG9wLmNvbG9yQXR0YWNobWVudHMubGVuZ3RoXSlcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZ2wuYmluZEZyYW1lYnVmZmVyKEdMX0ZSQU1FQlVGRkVSLCBudWxsKVxuICAgICAgICBpZiAoZXh0X2RyYXdidWZmZXJzKSB7XG4gICAgICAgICAgZXh0X2RyYXdidWZmZXJzLmRyYXdCdWZmZXJzV0VCR0woQkFDS19CVUZGRVIpXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgZnJhbWVidWZmZXJEaXJ0eSA9IGZhbHNlXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gY3VycmVudEZyYW1lYnVmZmVyICgpIHtcbiAgICByZXR1cm4gZnJhbWVidWZmZXJTdGFja1tmcmFtZWJ1ZmZlclN0YWNrLmxlbmd0aCAtIDFdXG4gIH1cblxuICByZXR1cm4ge1xuICAgIHRvcDogY3VycmVudEZyYW1lYnVmZmVyLFxuICAgIGRpcnR5OiBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gZnJhbWVidWZmZXJEaXJ0eVxuICAgIH0sXG4gICAgcHVzaDogZnVuY3Rpb24gKG5leHRfKSB7XG4gICAgICB2YXIgbmV4dCA9IG5leHRfIHx8IG51bGxcbiAgICAgIGZyYW1lYnVmZmVyRGlydHkgPSBmcmFtZWJ1ZmZlckRpcnR5IHx8IChuZXh0ICE9PSBjdXJyZW50RnJhbWVidWZmZXIoKSlcbiAgICAgIGZyYW1lYnVmZmVyU3RhY2sucHVzaChuZXh0KVxuICAgICAgcmV0dXJuIGZyYW1lYnVmZmVyRGlydHlcbiAgICB9LFxuICAgIHBvcDogZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIHByZXYgPSBjdXJyZW50RnJhbWVidWZmZXIoKVxuICAgICAgZnJhbWVidWZmZXJTdGFjay5wb3AoKVxuICAgICAgZnJhbWVidWZmZXJEaXJ0eSA9IGZyYW1lYnVmZmVyRGlydHkgfHwgKHByZXYgIT09IGN1cnJlbnRGcmFtZWJ1ZmZlcigpKVxuICAgICAgcmV0dXJuIGZyYW1lYnVmZmVyRGlydHlcbiAgICB9LFxuICAgIGdldEZyYW1lYnVmZmVyOiBmdW5jdGlvbiAob2JqZWN0KSB7XG4gICAgICBpZiAodHlwZW9mIG9iamVjdCA9PT0gJ2Z1bmN0aW9uJyAmJiBvYmplY3QuX3JlZ2xUeXBlID09PSAnZnJhbWVidWZmZXInKSB7XG4gICAgICAgIHZhciBmYm8gPSBvYmplY3QuX2ZyYW1lYnVmZmVyXG4gICAgICAgIGlmIChmYm8gaW5zdGFuY2VvZiBSRUdMRnJhbWVidWZmZXIpIHtcbiAgICAgICAgICByZXR1cm4gZmJvXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsXG4gICAgfSxcbiAgICBwb2xsOiBwb2xsLFxuICAgIGNyZWF0ZTogY3JlYXRlRkJPLFxuICAgIGNsZWFyOiBjbGVhckNhY2hlLFxuICAgIHJlZnJlc2g6IHJlZnJlc2hDYWNoZVxuICB9XG59XG4iLCJ2YXIgR0xfU1VCUElYRUxfQklUUyA9IDB4MEQ1MFxudmFyIEdMX1JFRF9CSVRTID0gMHgwRDUyXG52YXIgR0xfR1JFRU5fQklUUyA9IDB4MEQ1M1xudmFyIEdMX0JMVUVfQklUUyA9IDB4MEQ1NFxudmFyIEdMX0FMUEhBX0JJVFMgPSAweDBENTVcbnZhciBHTF9ERVBUSF9CSVRTID0gMHgwRDU2XG52YXIgR0xfU1RFTkNJTF9CSVRTID0gMHgwRDU3XG5cbnZhciBHTF9BTElBU0VEX1BPSU5UX1NJWkVfUkFOR0UgPSAweDg0NkRcbnZhciBHTF9BTElBU0VEX0xJTkVfV0lEVEhfUkFOR0UgPSAweDg0NkVcblxudmFyIEdMX01BWF9URVhUVVJFX1NJWkUgPSAweDBEMzNcbnZhciBHTF9NQVhfVklFV1BPUlRfRElNUyA9IDB4MEQzQVxudmFyIEdMX01BWF9WRVJURVhfQVRUUklCUyA9IDB4ODg2OVxudmFyIEdMX01BWF9WRVJURVhfVU5JRk9STV9WRUNUT1JTID0gMHg4REZCXG52YXIgR0xfTUFYX1ZBUllJTkdfVkVDVE9SUyA9IDB4OERGQ1xudmFyIEdMX01BWF9DT01CSU5FRF9URVhUVVJFX0lNQUdFX1VOSVRTID0gMHg4QjREXG52YXIgR0xfTUFYX1ZFUlRFWF9URVhUVVJFX0lNQUdFX1VOSVRTID0gMHg4QjRDXG52YXIgR0xfTUFYX1RFWFRVUkVfSU1BR0VfVU5JVFMgPSAweDg4NzJcbnZhciBHTF9NQVhfRlJBR01FTlRfVU5JRk9STV9WRUNUT1JTID0gMHg4REZEXG52YXIgR0xfTUFYX0NVQkVfTUFQX1RFWFRVUkVfU0laRSA9IDB4ODUxQ1xudmFyIEdMX01BWF9SRU5ERVJCVUZGRVJfU0laRSA9IDB4ODRFOFxuXG52YXIgR0xfVkVORE9SID0gMHgxRjAwXG52YXIgR0xfUkVOREVSRVIgPSAweDFGMDFcbnZhciBHTF9WRVJTSU9OID0gMHgxRjAyXG52YXIgR0xfU0hBRElOR19MQU5HVUFHRV9WRVJTSU9OID0gMHg4QjhDXG5cbnZhciBHTF9NQVhfVEVYVFVSRV9NQVhfQU5JU09UUk9QWV9FWFQgPSAweDg0RkZcblxudmFyIEdMX01BWF9DT0xPUl9BVFRBQ0hNRU5UU19XRUJHTCA9IDB4OENERlxudmFyIEdMX01BWF9EUkFXX0JVRkZFUlNfV0VCR0wgPSAweDg4MjRcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoZ2wsIGV4dGVuc2lvbnMpIHtcbiAgdmFyIG1heEFuaXNvdHJvcGljID0gMVxuICBpZiAoZXh0ZW5zaW9ucy5leHRfdGV4dHVyZV9maWx0ZXJfYW5pc290cm9waWMpIHtcbiAgICBtYXhBbmlzb3Ryb3BpYyA9IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVEVYVFVSRV9NQVhfQU5JU09UUk9QWV9FWFQpXG4gIH1cblxuICB2YXIgbWF4RHJhd2J1ZmZlcnMgPSAxXG4gIHZhciBtYXhDb2xvckF0dGFjaG1lbnRzID0gMVxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9kcmF3X2J1ZmZlcnMpIHtcbiAgICBtYXhEcmF3YnVmZmVycyA9IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfRFJBV19CVUZGRVJTX1dFQkdMKVxuICAgIG1heENvbG9yQXR0YWNobWVudHMgPSBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0NPTE9SX0FUVEFDSE1FTlRTX1dFQkdMKVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICAvLyBkcmF3aW5nIGJ1ZmZlciBiaXQgZGVwdGhcbiAgICBjb2xvckJpdHM6IFtcbiAgICAgIGdsLmdldFBhcmFtZXRlcihHTF9SRURfQklUUyksXG4gICAgICBnbC5nZXRQYXJhbWV0ZXIoR0xfR1JFRU5fQklUUyksXG4gICAgICBnbC5nZXRQYXJhbWV0ZXIoR0xfQkxVRV9CSVRTKSxcbiAgICAgIGdsLmdldFBhcmFtZXRlcihHTF9BTFBIQV9CSVRTKVxuICAgIF0sXG4gICAgZGVwdGhCaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfREVQVEhfQklUUyksXG4gICAgc3RlbmNpbEJpdHM6IGdsLmdldFBhcmFtZXRlcihHTF9TVEVOQ0lMX0JJVFMpLFxuICAgIHN1YnBpeGVsQml0czogZ2wuZ2V0UGFyYW1ldGVyKEdMX1NVQlBJWEVMX0JJVFMpLFxuXG4gICAgLy8gc3VwcG9ydGVkIGV4dGVuc2lvbnNcbiAgICBleHRlbnNpb25zOiBPYmplY3Qua2V5cyhleHRlbnNpb25zKS5maWx0ZXIoZnVuY3Rpb24gKGV4dCkge1xuICAgICAgcmV0dXJuICEhZXh0ZW5zaW9uc1tleHRdXG4gICAgfSksXG5cbiAgICAvLyBtYXggYW5pc28gc2FtcGxlc1xuICAgIG1heEFuaXNvdHJvcGljOiBtYXhBbmlzb3Ryb3BpYyxcblxuICAgIC8vIG1heCBkcmF3IGJ1ZmZlcnNcbiAgICBtYXhEcmF3YnVmZmVyczogbWF4RHJhd2J1ZmZlcnMsXG4gICAgbWF4Q29sb3JBdHRhY2htZW50czogbWF4Q29sb3JBdHRhY2htZW50cyxcblxuICAgIC8vIHBvaW50IGFuZCBsaW5lIHNpemUgcmFuZ2VzXG4gICAgcG9pbnRTaXplRGltczogZ2wuZ2V0UGFyYW1ldGVyKEdMX0FMSUFTRURfUE9JTlRfU0laRV9SQU5HRSksXG4gICAgbGluZVdpZHRoRGltczogZ2wuZ2V0UGFyYW1ldGVyKEdMX0FMSUFTRURfTElORV9XSURUSF9SQU5HRSksXG4gICAgbWF4Vmlld3BvcnREaW1zOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1ZJRVdQT1JUX0RJTVMpLFxuICAgIG1heENvbWJpbmVkVGV4dHVyZVVuaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0NPTUJJTkVEX1RFWFRVUkVfSU1BR0VfVU5JVFMpLFxuICAgIG1heEN1YmVNYXBTaXplOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0NVQkVfTUFQX1RFWFRVUkVfU0laRSksXG4gICAgbWF4UmVuZGVyYnVmZmVyU2l6ZTogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9SRU5ERVJCVUZGRVJfU0laRSksXG4gICAgbWF4VGV4dHVyZVVuaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1RFWFRVUkVfSU1BR0VfVU5JVFMpLFxuICAgIG1heFRleHR1cmVTaXplOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1RFWFRVUkVfU0laRSksXG4gICAgbWF4QXR0cmlidXRlczogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9WRVJURVhfQVRUUklCUyksXG4gICAgbWF4VmVydGV4VW5pZm9ybXM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVkVSVEVYX1VOSUZPUk1fVkVDVE9SUyksXG4gICAgbWF4VmVydGV4VGV4dHVyZVVuaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1ZFUlRFWF9URVhUVVJFX0lNQUdFX1VOSVRTKSxcbiAgICBtYXhWYXJ5aW5nVmVjdG9yczogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9WQVJZSU5HX1ZFQ1RPUlMpLFxuICAgIG1heEZyYWdtZW50VW5pZm9ybXM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfRlJBR01FTlRfVU5JRk9STV9WRUNUT1JTKSxcblxuICAgIC8vIHZlbmRvciBpbmZvXG4gICAgZ2xzbDogZ2wuZ2V0UGFyYW1ldGVyKEdMX1NIQURJTkdfTEFOR1VBR0VfVkVSU0lPTiksXG4gICAgcmVuZGVyZXI6IGdsLmdldFBhcmFtZXRlcihHTF9SRU5ERVJFUiksXG4gICAgdmVuZG9yOiBnbC5nZXRQYXJhbWV0ZXIoR0xfVkVORE9SKSxcbiAgICB2ZXJzaW9uOiBnbC5nZXRQYXJhbWV0ZXIoR0xfVkVSU0lPTilcbiAgfVxufVxuIiwiXG52YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi91dGlsL2lzLXR5cGVkLWFycmF5JylcblxudmFyIEdMX1JHQkEgPSA2NDA4XG52YXIgR0xfVU5TSUdORURfQllURSA9IDUxMjFcbnZhciBHTF9QQUNLX0FMSUdOTUVOVCA9IDB4MEQwNVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBSZWFkUGl4ZWxzIChnbCwgcmVnbFBvbGwsIHZpZXdwb3J0U3RhdGUpIHtcbiAgZnVuY3Rpb24gcmVhZFBpeGVscyAoaW5wdXQpIHtcbiAgICB2YXIgb3B0aW9ucyA9IGlucHV0IHx8IHt9XG4gICAgaWYgKGlzVHlwZWRBcnJheShpbnB1dCkpIHtcbiAgICAgIG9wdGlvbnMgPSB7XG4gICAgICAgIGRhdGE6IG9wdGlvbnNcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDIpIHtcbiAgICAgIG9wdGlvbnMgPSB7XG4gICAgICAgIHdpZHRoOiBhcmd1bWVudHNbMF0gfCAwLFxuICAgICAgICBoZWlnaHQ6IGFyZ3VtZW50c1sxXSB8IDBcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBpbnB1dCAhPT0gJ29iamVjdCcpIHtcbiAgICAgIG9wdGlvbnMgPSB7fVxuICAgIH1cblxuICAgIC8vIFVwZGF0ZSBXZWJHTCBzdGF0ZVxuICAgIHJlZ2xQb2xsKClcblxuICAgIC8vIFJlYWQgdmlld3BvcnQgc3RhdGVcbiAgICB2YXIgeCA9IG9wdGlvbnMueCB8fCAwXG4gICAgdmFyIHkgPSBvcHRpb25zLnkgfHwgMFxuICAgIHZhciB3aWR0aCA9IG9wdGlvbnMud2lkdGggfHwgdmlld3BvcnRTdGF0ZS53aWR0aFxuICAgIHZhciBoZWlnaHQgPSBvcHRpb25zLmhlaWdodCB8fCB2aWV3cG9ydFN0YXRlLmhlaWdodFxuXG4gICAgLy8gQ29tcHV0ZSBzaXplXG4gICAgdmFyIHNpemUgPSB3aWR0aCAqIGhlaWdodCAqIDRcblxuICAgIC8vIEFsbG9jYXRlIGRhdGFcbiAgICB2YXIgZGF0YSA9IG9wdGlvbnMuZGF0YSB8fCBuZXcgVWludDhBcnJheShzaXplKVxuXG4gICAgLy8gVHlwZSBjaGVja1xuICAgIFxuICAgIFxuXG4gICAgLy8gUnVuIHJlYWQgcGl4ZWxzXG4gICAgZ2wucGl4ZWxTdG9yZWkoR0xfUEFDS19BTElHTk1FTlQsIDQpXG4gICAgZ2wucmVhZFBpeGVscyh4LCB5LCB3aWR0aCwgaGVpZ2h0LCBHTF9SR0JBLCBHTF9VTlNJR05FRF9CWVRFLCBkYXRhKVxuXG4gICAgcmV0dXJuIGRhdGFcbiAgfVxuXG4gIHJldHVybiByZWFkUGl4ZWxzXG59XG4iLCJcbnZhciB2YWx1ZXMgPSByZXF1aXJlKCcuL3V0aWwvdmFsdWVzJylcblxudmFyIEdMX1JFTkRFUkJVRkZFUiA9IDB4OEQ0MVxuXG52YXIgR0xfUkdCQTQgPSAweDgwNTZcbnZhciBHTF9SR0I1X0ExID0gMHg4MDU3XG52YXIgR0xfUkdCNTY1ID0gMHg4RDYyXG52YXIgR0xfREVQVEhfQ09NUE9ORU5UMTYgPSAweDgxQTVcbnZhciBHTF9TVEVOQ0lMX0lOREVYOCA9IDB4OEQ0OFxudmFyIEdMX0RFUFRIX1NURU5DSUwgPSAweDg0RjlcblxudmFyIEdMX1NSR0I4X0FMUEhBOF9FWFQgPSAweDhDNDNcblxudmFyIEdMX1JHQkEzMkZfRVhUID0gMHg4ODE0XG5cbnZhciBHTF9SR0JBMTZGX0VYVCA9IDB4ODgxQVxudmFyIEdMX1JHQjE2Rl9FWFQgPSAweDg4MUJcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoZ2wsIGV4dGVuc2lvbnMsIGxpbWl0cykge1xuICB2YXIgZm9ybWF0VHlwZXMgPSB7XG4gICAgJ3JnYmE0JzogR0xfUkdCQTQsXG4gICAgJ3JnYjU2NSc6IEdMX1JHQjU2NSxcbiAgICAncmdiNSBhMSc6IEdMX1JHQjVfQTEsXG4gICAgJ2RlcHRoJzogR0xfREVQVEhfQ09NUE9ORU5UMTYsXG4gICAgJ3N0ZW5jaWwnOiBHTF9TVEVOQ0lMX0lOREVYOCxcbiAgICAnZGVwdGggc3RlbmNpbCc6IEdMX0RFUFRIX1NURU5DSUxcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLmV4dF9zcmdiKSB7XG4gICAgZm9ybWF0VHlwZXNbJ3NyZ2JhJ10gPSBHTF9TUkdCOF9BTFBIQThfRVhUXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5leHRfY29sb3JfYnVmZmVyX2hhbGZfZmxvYXQpIHtcbiAgICBmb3JtYXRUeXBlc1sncmdiYTE2ZiddID0gR0xfUkdCQTE2Rl9FWFRcbiAgICBmb3JtYXRUeXBlc1sncmdiMTZmJ10gPSBHTF9SR0IxNkZfRVhUXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb2xvcl9idWZmZXJfZmxvYXQpIHtcbiAgICBmb3JtYXRUeXBlc1sncmdiYTMyZiddID0gR0xfUkdCQTMyRl9FWFRcbiAgfVxuXG4gIHZhciByZW5kZXJidWZmZXJDb3VudCA9IDBcbiAgdmFyIHJlbmRlcmJ1ZmZlclNldCA9IHt9XG5cbiAgZnVuY3Rpb24gUkVHTFJlbmRlcmJ1ZmZlciAoKSB7XG4gICAgdGhpcy5pZCA9IHJlbmRlcmJ1ZmZlckNvdW50KytcbiAgICB0aGlzLnJlZkNvdW50ID0gMVxuXG4gICAgdGhpcy5yZW5kZXJidWZmZXIgPSBudWxsXG5cbiAgICB0aGlzLmZvcm1hdCA9IEdMX1JHQkE0XG4gICAgdGhpcy53aWR0aCA9IDBcbiAgICB0aGlzLmhlaWdodCA9IDBcbiAgfVxuXG4gIFJFR0xSZW5kZXJidWZmZXIucHJvdG90eXBlLmRlY1JlZiA9IGZ1bmN0aW9uICgpIHtcbiAgICBpZiAoLS10aGlzLnJlZkNvdW50ID09PSAwKSB7XG4gICAgICBkZXN0cm95KHRoaXMpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcmVmcmVzaCAocmIpIHtcbiAgICBpZiAoIWdsLmlzUmVuZGVyYnVmZmVyKHJiLnJlbmRlcmJ1ZmZlcikpIHtcbiAgICAgIHJiLnJlbmRlcmJ1ZmZlciA9IGdsLmNyZWF0ZVJlbmRlcmJ1ZmZlcigpXG4gICAgfVxuICAgIGdsLmJpbmRSZW5kZXJidWZmZXIoR0xfUkVOREVSQlVGRkVSLCByYi5yZW5kZXJidWZmZXIpXG4gICAgZ2wucmVuZGVyYnVmZmVyU3RvcmFnZShcbiAgICAgIEdMX1JFTkRFUkJVRkZFUixcbiAgICAgIHJiLmZvcm1hdCxcbiAgICAgIHJiLndpZHRoLFxuICAgICAgcmIuaGVpZ2h0KVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSAocmIpIHtcbiAgICB2YXIgaGFuZGxlID0gcmIucmVuZGVyYnVmZmVyXG4gICAgXG4gICAgZ2wuYmluZFJlbmRlcmJ1ZmZlcihHTF9SRU5ERVJCVUZGRVIsIG51bGwpXG4gICAgaWYgKGdsLmlzUmVuZGVyYnVmZmVyKGhhbmRsZSkpIHtcbiAgICAgIGdsLmRlbGV0ZVJlbmRlcmJ1ZmZlcihoYW5kbGUpXG4gICAgfVxuICAgIHJiLnJlbmRlcmJ1ZmZlciA9IG51bGxcbiAgICByYi5yZWZDb3VudCA9IDBcbiAgICBkZWxldGUgcmVuZGVyYnVmZmVyU2V0W3JiLmlkXVxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlUmVuZGVyYnVmZmVyIChpbnB1dCkge1xuICAgIHZhciByZW5kZXJidWZmZXIgPSBuZXcgUkVHTFJlbmRlcmJ1ZmZlcigpXG4gICAgcmVuZGVyYnVmZmVyU2V0W3JlbmRlcmJ1ZmZlci5pZF0gPSByZW5kZXJidWZmZXJcblxuICAgIGZ1bmN0aW9uIHJlZ2xSZW5kZXJidWZmZXIgKGlucHV0KSB7XG4gICAgICB2YXIgb3B0aW9ucyA9IGlucHV0IHx8IHt9XG5cbiAgICAgIHZhciB3ID0gMFxuICAgICAgdmFyIGggPSAwXG4gICAgICBpZiAoJ3NoYXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBzaGFwZSA9IG9wdGlvbnMuc2hhcGVcbiAgICAgICAgXG4gICAgICAgIHcgPSBzaGFwZVswXSB8IDBcbiAgICAgICAgaCA9IHNoYXBlWzFdIHwgMFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKCdyYWRpdXMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB3ID0gaCA9IG9wdGlvbnMucmFkaXVzIHwgMFxuICAgICAgICB9XG4gICAgICAgIGlmICgnd2lkdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB3ID0gb3B0aW9ucy53aWR0aCB8IDBcbiAgICAgICAgfVxuICAgICAgICBpZiAoJ2hlaWdodCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGggPSBvcHRpb25zLmhlaWdodCB8IDBcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgdmFyIHMgPSBsaW1pdHMubWF4UmVuZGVyYnVmZmVyU2l6ZVxuICAgICAgXG4gICAgICByZWdsUmVuZGVyYnVmZmVyLndpZHRoID0gcmVuZGVyYnVmZmVyLndpZHRoID0gTWF0aC5tYXgodywgMSlcbiAgICAgIHJlZ2xSZW5kZXJidWZmZXIuaGVpZ2h0ID0gcmVuZGVyYnVmZmVyLmhlaWdodCA9IE1hdGgubWF4KGgsIDEpXG5cbiAgICAgIHJlbmRlcmJ1ZmZlci5mb3JtYXQgPSBHTF9SR0JBNFxuICAgICAgaWYgKCdmb3JtYXQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGZvcm1hdCA9IG9wdGlvbnMuZm9ybWF0XG4gICAgICAgIFxuICAgICAgICByZW5kZXJidWZmZXIuZm9ybWF0ID0gZm9ybWF0VHlwZXNbZm9ybWF0XVxuICAgICAgfVxuXG4gICAgICByZWZyZXNoKHJlbmRlcmJ1ZmZlcilcblxuICAgICAgcmV0dXJuIHJlZ2xSZW5kZXJidWZmZXJcbiAgICB9XG5cbiAgICByZWdsUmVuZGVyYnVmZmVyKGlucHV0KVxuXG4gICAgcmVnbFJlbmRlcmJ1ZmZlci5fcmVnbFR5cGUgPSAncmVuZGVyYnVmZmVyJ1xuICAgIHJlZ2xSZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlciA9IHJlbmRlcmJ1ZmZlclxuICAgIHJlZ2xSZW5kZXJidWZmZXIuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJlbmRlcmJ1ZmZlci5kZWNSZWYoKVxuICAgIH1cblxuICAgIHJldHVybiByZWdsUmVuZGVyYnVmZmVyXG4gIH1cblxuICBmdW5jdGlvbiByZWZyZXNoUmVuZGVyYnVmZmVycyAoKSB7XG4gICAgdmFsdWVzKHJlbmRlcmJ1ZmZlclNldCkuZm9yRWFjaChyZWZyZXNoKVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveVJlbmRlcmJ1ZmZlcnMgKCkge1xuICAgIHZhbHVlcyhyZW5kZXJidWZmZXJTZXQpLmZvckVhY2goZGVzdHJveSlcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY3JlYXRlOiBjcmVhdGVSZW5kZXJidWZmZXIsXG4gICAgcmVmcmVzaDogcmVmcmVzaFJlbmRlcmJ1ZmZlcnMsXG4gICAgY2xlYXI6IGRlc3Ryb3lSZW5kZXJidWZmZXJzXG4gIH1cbn1cbiIsIlxudmFyIHZhbHVlcyA9IHJlcXVpcmUoJy4vdXRpbC92YWx1ZXMnKVxuXG52YXIgR0xfRlJBR01FTlRfU0hBREVSID0gMzU2MzJcbnZhciBHTF9WRVJURVhfU0hBREVSID0gMzU2MzNcblxudmFyIEdMX0FDVElWRV9VTklGT1JNUyA9IDB4OEI4NlxudmFyIEdMX0FDVElWRV9BVFRSSUJVVEVTID0gMHg4Qjg5XG5cbmZ1bmN0aW9uIEFjdGl2ZUluZm8gKG5hbWUsIGlkLCBsb2NhdGlvbiwgaW5mbykge1xuICB0aGlzLm5hbWUgPSBuYW1lXG4gIHRoaXMuaWQgPSBpZFxuICB0aGlzLmxvY2F0aW9uID0gbG9jYXRpb25cbiAgdGhpcy5pbmZvID0gaW5mb1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBTaGFkZXJTdGF0ZSAoXG4gIGdsLFxuICBhdHRyaWJ1dGVTdGF0ZSxcbiAgdW5pZm9ybVN0YXRlLFxuICBjb21waWxlU2hhZGVyRHJhdyxcbiAgc3RyaW5nU3RvcmUpIHtcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIGdsc2wgY29tcGlsYXRpb24gYW5kIGxpbmtpbmdcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIHZhciBmcmFnU2hhZGVycyA9IHt9XG4gIHZhciB2ZXJ0U2hhZGVycyA9IHt9XG5cbiAgZnVuY3Rpb24gZ2V0U2hhZGVyICh0eXBlLCBpZCkge1xuICAgIHZhciBjYWNoZSA9IHR5cGUgPT09IEdMX0ZSQUdNRU5UX1NIQURFUiA/IGZyYWdTaGFkZXJzIDogdmVydFNoYWRlcnNcbiAgICB2YXIgc2hhZGVyID0gY2FjaGVbaWRdXG5cbiAgICBpZiAoIXNoYWRlcikge1xuICAgICAgdmFyIHNvdXJjZSA9IHN0cmluZ1N0b3JlLnN0cihpZClcbiAgICAgIHNoYWRlciA9IGdsLmNyZWF0ZVNoYWRlcih0eXBlKVxuICAgICAgZ2wuc2hhZGVyU291cmNlKHNoYWRlciwgc291cmNlKVxuICAgICAgZ2wuY29tcGlsZVNoYWRlcihzaGFkZXIpXG4gICAgICBcbiAgICAgIGNhY2hlW2lkXSA9IHNoYWRlclxuICAgIH1cblxuICAgIHJldHVybiBzaGFkZXJcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBwcm9ncmFtIGxpbmtpbmdcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIHZhciBwcm9ncmFtQ2FjaGUgPSB7fVxuICB2YXIgcHJvZ3JhbUxpc3QgPSBbXVxuXG4gIGZ1bmN0aW9uIFJFR0xQcm9ncmFtIChmcmFnSWQsIHZlcnRJZCkge1xuICAgIHRoaXMuZnJhZ0lkID0gZnJhZ0lkXG4gICAgdGhpcy52ZXJ0SWQgPSB2ZXJ0SWRcbiAgICB0aGlzLnByb2dyYW0gPSBudWxsXG4gICAgdGhpcy51bmlmb3JtcyA9IFtdXG4gICAgdGhpcy5hdHRyaWJ1dGVzID0gW11cbiAgICB0aGlzLmRyYXcgPSBmdW5jdGlvbiAoKSB7fVxuICAgIHRoaXMuYmF0Y2hDYWNoZSA9IHt9XG4gIH1cblxuICBmdW5jdGlvbiBsaW5rUHJvZ3JhbSAoZGVzYykge1xuICAgIHZhciBpLCBpbmZvXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gY29tcGlsZSAmIGxpbmtcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgdmFyIGZyYWdTaGFkZXIgPSBnZXRTaGFkZXIoR0xfRlJBR01FTlRfU0hBREVSLCBkZXNjLmZyYWdJZClcbiAgICB2YXIgdmVydFNoYWRlciA9IGdldFNoYWRlcihHTF9WRVJURVhfU0hBREVSLCBkZXNjLnZlcnRJZClcblxuICAgIHZhciBwcm9ncmFtID0gZGVzYy5wcm9ncmFtID0gZ2wuY3JlYXRlUHJvZ3JhbSgpXG4gICAgZ2wuYXR0YWNoU2hhZGVyKHByb2dyYW0sIGZyYWdTaGFkZXIpXG4gICAgZ2wuYXR0YWNoU2hhZGVyKHByb2dyYW0sIHZlcnRTaGFkZXIpXG4gICAgZ2wubGlua1Byb2dyYW0ocHJvZ3JhbSlcbiAgICBcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBncmFiIHVuaWZvcm1zXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHZhciBudW1Vbmlmb3JtcyA9IGdsLmdldFByb2dyYW1QYXJhbWV0ZXIocHJvZ3JhbSwgR0xfQUNUSVZFX1VOSUZPUk1TKVxuICAgIHZhciB1bmlmb3JtcyA9IGRlc2MudW5pZm9ybXMgPSBbXVxuXG4gICAgZm9yIChpID0gMDsgaSA8IG51bVVuaWZvcm1zOyArK2kpIHtcbiAgICAgIGluZm8gPSBnbC5nZXRBY3RpdmVVbmlmb3JtKHByb2dyYW0sIGkpXG4gICAgICBpZiAoaW5mbykge1xuICAgICAgICBpZiAoaW5mby5zaXplID4gMSkge1xuICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgaW5mby5zaXplOyArK2opIHtcbiAgICAgICAgICAgIHZhciBuYW1lID0gaW5mby5uYW1lLnJlcGxhY2UoJ1swXScsICdbJyArIGogKyAnXScpXG4gICAgICAgICAgICB1bmlmb3JtU3RhdGUuZGVmKG5hbWUpXG4gICAgICAgICAgICB1bmlmb3Jtcy5wdXNoKG5ldyBBY3RpdmVJbmZvKFxuICAgICAgICAgICAgICBuYW1lLFxuICAgICAgICAgICAgICBzdHJpbmdTdG9yZS5pZChuYW1lKSxcbiAgICAgICAgICAgICAgZ2wuZ2V0VW5pZm9ybUxvY2F0aW9uKHByb2dyYW0sIG5hbWUpLFxuICAgICAgICAgICAgICBpbmZvKSlcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdW5pZm9ybVN0YXRlLmRlZihpbmZvLm5hbWUpXG4gICAgICAgICAgdW5pZm9ybXMucHVzaChuZXcgQWN0aXZlSW5mbyhcbiAgICAgICAgICAgIGluZm8ubmFtZSxcbiAgICAgICAgICAgIHN0cmluZ1N0b3JlLmlkKGluZm8ubmFtZSksXG4gICAgICAgICAgICBnbC5nZXRVbmlmb3JtTG9jYXRpb24ocHJvZ3JhbSwgaW5mby5uYW1lKSxcbiAgICAgICAgICAgIGluZm8pKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGdyYWIgYXR0cmlidXRlc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICB2YXIgbnVtQXR0cmlidXRlcyA9IGdsLmdldFByb2dyYW1QYXJhbWV0ZXIocHJvZ3JhbSwgR0xfQUNUSVZFX0FUVFJJQlVURVMpXG4gICAgdmFyIGF0dHJpYnV0ZXMgPSBkZXNjLmF0dHJpYnV0ZXMgPSBbXVxuICAgIGZvciAoaSA9IDA7IGkgPCBudW1BdHRyaWJ1dGVzOyArK2kpIHtcbiAgICAgIGluZm8gPSBnbC5nZXRBY3RpdmVBdHRyaWIocHJvZ3JhbSwgaSlcbiAgICAgIGlmIChpbmZvKSB7XG4gICAgICAgIGF0dHJpYnV0ZVN0YXRlLmRlZihpbmZvLm5hbWUpXG4gICAgICAgIGF0dHJpYnV0ZXMucHVzaChuZXcgQWN0aXZlSW5mbyhcbiAgICAgICAgICBpbmZvLm5hbWUsXG4gICAgICAgICAgc3RyaW5nU3RvcmUuaWQoaW5mby5uYW1lKSxcbiAgICAgICAgICBnbC5nZXRBdHRyaWJMb2NhdGlvbihwcm9ncmFtLCBpbmZvLm5hbWUpLFxuICAgICAgICAgIGluZm8pKVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBjbGVhciBjYWNoZWQgcmVuZGVyaW5nIG1ldGhvZHNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgZGVzYy5kcmF3ID0gY29tcGlsZVNoYWRlckRyYXcoZGVzYylcbiAgICBkZXNjLmJhdGNoQ2FjaGUgPSB7fVxuICB9XG5cbiAgdmFyIGZyYWdTaGFkZXJTdGFjayA9IFsgLTEgXVxuICB2YXIgdmVydFNoYWRlclN0YWNrID0gWyAtMSBdXG5cbiAgcmV0dXJuIHtcbiAgICBjbGVhcjogZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIGRlbGV0ZVNoYWRlciA9IGdsLmRlbGV0ZVNoYWRlci5iaW5kKGdsKVxuICAgICAgdmFsdWVzKGZyYWdTaGFkZXJzKS5mb3JFYWNoKGRlbGV0ZVNoYWRlcilcbiAgICAgIGZyYWdTaGFkZXJzID0ge31cbiAgICAgIHZhbHVlcyh2ZXJ0U2hhZGVycykuZm9yRWFjaChkZWxldGVTaGFkZXIpXG4gICAgICB2ZXJ0U2hhZGVycyA9IHt9XG5cbiAgICAgIHByb2dyYW1MaXN0LmZvckVhY2goZnVuY3Rpb24gKGRlc2MpIHtcbiAgICAgICAgZ2wuZGVsZXRlUHJvZ3JhbShkZXNjLnByb2dyYW0pXG4gICAgICB9KVxuICAgICAgcHJvZ3JhbUxpc3QubGVuZ3RoID0gMFxuICAgICAgcHJvZ3JhbUNhY2hlID0ge31cbiAgICB9LFxuXG4gICAgcmVmcmVzaDogZnVuY3Rpb24gKCkge1xuICAgICAgZnJhZ1NoYWRlcnMgPSB7fVxuICAgICAgdmVydFNoYWRlcnMgPSB7fVxuICAgICAgcHJvZ3JhbUxpc3QuZm9yRWFjaChsaW5rUHJvZ3JhbSlcbiAgICB9LFxuXG4gICAgcHJvZ3JhbTogZnVuY3Rpb24gKHZlcnRJZCwgZnJhZ0lkKSB7XG4gICAgICBcbiAgICAgIFxuXG4gICAgICB2YXIgY2FjaGUgPSBwcm9ncmFtQ2FjaGVbZnJhZ0lkXVxuICAgICAgaWYgKCFjYWNoZSkge1xuICAgICAgICBjYWNoZSA9IHByb2dyYW1DYWNoZVtmcmFnSWRdID0ge31cbiAgICAgIH1cbiAgICAgIHZhciBwcm9ncmFtID0gY2FjaGVbdmVydElkXVxuICAgICAgaWYgKCFwcm9ncmFtKSB7XG4gICAgICAgIHByb2dyYW0gPSBuZXcgUkVHTFByb2dyYW0oZnJhZ0lkLCB2ZXJ0SWQpXG4gICAgICAgIGxpbmtQcm9ncmFtKHByb2dyYW0pXG4gICAgICAgIGNhY2hlW3ZlcnRJZF0gPSBwcm9ncmFtXG4gICAgICAgIHByb2dyYW1MaXN0LnB1c2gocHJvZ3JhbSlcbiAgICAgIH1cbiAgICAgIHJldHVybiBwcm9ncmFtXG4gICAgfSxcblxuICAgIHNoYWRlcjogZ2V0U2hhZGVyLFxuXG4gICAgZnJhZzogZnJhZ1NoYWRlclN0YWNrLFxuICAgIHZlcnQ6IHZlcnRTaGFkZXJTdGFja1xuICB9XG59XG4iLCJ2YXIgY3JlYXRlU3RhY2sgPSByZXF1aXJlKCcuL3V0aWwvc3RhY2snKVxudmFyIGNyZWF0ZUVudmlyb25tZW50ID0gcmVxdWlyZSgnLi91dGlsL2NvZGVnZW4nKVxuXG4vLyBXZWJHTCBjb25zdGFudHNcbnZhciBHTF9DVUxMX0ZBQ0UgPSAweDBCNDRcbnZhciBHTF9CTEVORCA9IDB4MEJFMlxudmFyIEdMX0RJVEhFUiA9IDB4MEJEMFxudmFyIEdMX1NURU5DSUxfVEVTVCA9IDB4MEI5MFxudmFyIEdMX0RFUFRIX1RFU1QgPSAweDBCNzFcbnZhciBHTF9TQ0lTU09SX1RFU1QgPSAweDBDMTFcbnZhciBHTF9QT0xZR09OX09GRlNFVF9GSUxMID0gMHg4MDM3XG52YXIgR0xfU0FNUExFX0FMUEhBX1RPX0NPVkVSQUdFID0gMHg4MDlFXG52YXIgR0xfU0FNUExFX0NPVkVSQUdFID0gMHg4MEEwXG52YXIgR0xfRlVOQ19BREQgPSAweDgwMDZcbnZhciBHTF9aRVJPID0gMFxudmFyIEdMX09ORSA9IDFcbnZhciBHTF9GUk9OVCA9IDEwMjhcbnZhciBHTF9CQUNLID0gMTAyOVxudmFyIEdMX0xFU1MgPSA1MTNcbnZhciBHTF9DQ1cgPSAyMzA1XG52YXIgR0xfQUxXQVlTID0gNTE5XG52YXIgR0xfS0VFUCA9IDc2ODBcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwQ29udGV4dFN0YXRlIChnbCwgZnJhbWVidWZmZXJTdGF0ZSwgdmlld3BvcnRTdGF0ZSkge1xuICBmdW5jdGlvbiBjYXBTdGFjayAoY2FwLCBkZmx0KSB7XG4gICAgdmFyIHJlc3VsdCA9IGNyZWF0ZVN0YWNrKFshIWRmbHRdLCBmdW5jdGlvbiAoZmxhZykge1xuICAgICAgaWYgKGZsYWcpIHtcbiAgICAgICAgZ2wuZW5hYmxlKGNhcClcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGdsLmRpc2FibGUoY2FwKVxuICAgICAgfVxuICAgIH0pXG4gICAgcmVzdWx0LmZsYWcgPSBjYXBcbiAgICByZXR1cm4gcmVzdWx0XG4gIH1cblxuICAvLyBDYXBzLCBmbGFncyBhbmQgb3RoZXIgcmFuZG9tIFdlYkdMIGNvbnRleHQgc3RhdGVcbiAgdmFyIGNvbnRleHRTdGF0ZSA9IHtcbiAgICAvLyBEaXRoZXJpbmdcbiAgICAnZGl0aGVyJzogY2FwU3RhY2soR0xfRElUSEVSKSxcblxuICAgIC8vIEJsZW5kaW5nXG4gICAgJ2JsZW5kLmVuYWJsZSc6IGNhcFN0YWNrKEdMX0JMRU5EKSxcbiAgICAnYmxlbmQuY29sb3InOiBjcmVhdGVTdGFjayhbMCwgMCwgMCwgMF0sIGZ1bmN0aW9uIChyLCBnLCBiLCBhKSB7XG4gICAgICBnbC5ibGVuZENvbG9yKHIsIGcsIGIsIGEpXG4gICAgfSksXG4gICAgJ2JsZW5kLmVxdWF0aW9uJzogY3JlYXRlU3RhY2soW0dMX0ZVTkNfQURELCBHTF9GVU5DX0FERF0sIGZ1bmN0aW9uIChyZ2IsIGEpIHtcbiAgICAgIGdsLmJsZW5kRXF1YXRpb25TZXBhcmF0ZShyZ2IsIGEpXG4gICAgfSksXG4gICAgJ2JsZW5kLmZ1bmMnOiBjcmVhdGVTdGFjayhbXG4gICAgICBHTF9PTkUsIEdMX1pFUk8sIEdMX09ORSwgR0xfWkVST1xuICAgIF0sIGZ1bmN0aW9uIChzcmNSR0IsIGRzdFJHQiwgc3JjQWxwaGEsIGRzdEFscGhhKSB7XG4gICAgICBnbC5ibGVuZEZ1bmNTZXBhcmF0ZShzcmNSR0IsIGRzdFJHQiwgc3JjQWxwaGEsIGRzdEFscGhhKVxuICAgIH0pLFxuXG4gICAgLy8gRGVwdGhcbiAgICAnZGVwdGguZW5hYmxlJzogY2FwU3RhY2soR0xfREVQVEhfVEVTVCwgdHJ1ZSksXG4gICAgJ2RlcHRoLmZ1bmMnOiBjcmVhdGVTdGFjayhbR0xfTEVTU10sIGZ1bmN0aW9uIChmdW5jKSB7XG4gICAgICBnbC5kZXB0aEZ1bmMoZnVuYylcbiAgICB9KSxcbiAgICAnZGVwdGgucmFuZ2UnOiBjcmVhdGVTdGFjayhbMCwgMV0sIGZ1bmN0aW9uIChuZWFyLCBmYXIpIHtcbiAgICAgIGdsLmRlcHRoUmFuZ2UobmVhciwgZmFyKVxuICAgIH0pLFxuICAgICdkZXB0aC5tYXNrJzogY3JlYXRlU3RhY2soW3RydWVdLCBmdW5jdGlvbiAobSkge1xuICAgICAgZ2wuZGVwdGhNYXNrKG0pXG4gICAgfSksXG5cbiAgICAvLyBGYWNlIGN1bGxpbmdcbiAgICAnY3VsbC5lbmFibGUnOiBjYXBTdGFjayhHTF9DVUxMX0ZBQ0UpLFxuICAgICdjdWxsLmZhY2UnOiBjcmVhdGVTdGFjayhbR0xfQkFDS10sIGZ1bmN0aW9uIChtb2RlKSB7XG4gICAgICBnbC5jdWxsRmFjZShtb2RlKVxuICAgIH0pLFxuXG4gICAgLy8gRnJvbnQgZmFjZSBvcmllbnRhdGlvblxuICAgICdmcm9udEZhY2UnOiBjcmVhdGVTdGFjayhbR0xfQ0NXXSwgZnVuY3Rpb24gKG1vZGUpIHtcbiAgICAgIGdsLmZyb250RmFjZShtb2RlKVxuICAgIH0pLFxuXG4gICAgLy8gV3JpdGUgbWFza3NcbiAgICAnY29sb3JNYXNrJzogY3JlYXRlU3RhY2soW3RydWUsIHRydWUsIHRydWUsIHRydWVdLCBmdW5jdGlvbiAociwgZywgYiwgYSkge1xuICAgICAgZ2wuY29sb3JNYXNrKHIsIGcsIGIsIGEpXG4gICAgfSksXG5cbiAgICAvLyBMaW5lIHdpZHRoXG4gICAgJ2xpbmVXaWR0aCc6IGNyZWF0ZVN0YWNrKFsxXSwgZnVuY3Rpb24gKHcpIHtcbiAgICAgIGdsLmxpbmVXaWR0aCh3KVxuICAgIH0pLFxuXG4gICAgLy8gUG9seWdvbiBvZmZzZXRcbiAgICAncG9seWdvbk9mZnNldC5lbmFibGUnOiBjYXBTdGFjayhHTF9QT0xZR09OX09GRlNFVF9GSUxMKSxcbiAgICAncG9seWdvbk9mZnNldC5vZmZzZXQnOiBjcmVhdGVTdGFjayhbMCwgMF0sIGZ1bmN0aW9uIChmYWN0b3IsIHVuaXRzKSB7XG4gICAgICBnbC5wb2x5Z29uT2Zmc2V0KGZhY3RvciwgdW5pdHMpXG4gICAgfSksXG5cbiAgICAvLyBTYW1wbGUgY292ZXJhZ2VcbiAgICAnc2FtcGxlLmFscGhhJzogY2FwU3RhY2soR0xfU0FNUExFX0FMUEhBX1RPX0NPVkVSQUdFKSxcbiAgICAnc2FtcGxlLmVuYWJsZSc6IGNhcFN0YWNrKEdMX1NBTVBMRV9DT1ZFUkFHRSksXG4gICAgJ3NhbXBsZS5jb3ZlcmFnZSc6IGNyZWF0ZVN0YWNrKFsxLCBmYWxzZV0sIGZ1bmN0aW9uICh2YWx1ZSwgaW52ZXJ0KSB7XG4gICAgICBnbC5zYW1wbGVDb3ZlcmFnZSh2YWx1ZSwgaW52ZXJ0KVxuICAgIH0pLFxuXG4gICAgLy8gU3RlbmNpbFxuICAgICdzdGVuY2lsLmVuYWJsZSc6IGNhcFN0YWNrKEdMX1NURU5DSUxfVEVTVCksXG4gICAgJ3N0ZW5jaWwubWFzayc6IGNyZWF0ZVN0YWNrKFstMV0sIGZ1bmN0aW9uIChtYXNrKSB7XG4gICAgICBnbC5zdGVuY2lsTWFzayhtYXNrKVxuICAgIH0pLFxuICAgICdzdGVuY2lsLmZ1bmMnOiBjcmVhdGVTdGFjayhbXG4gICAgICBHTF9BTFdBWVMsIDAsIC0xXG4gICAgXSwgZnVuY3Rpb24gKGZ1bmMsIHJlZiwgbWFzaykge1xuICAgICAgZ2wuc3RlbmNpbEZ1bmMoZnVuYywgcmVmLCBtYXNrKVxuICAgIH0pLFxuICAgICdzdGVuY2lsLm9wRnJvbnQnOiBjcmVhdGVTdGFjayhbXG4gICAgICBHTF9LRUVQLCBHTF9LRUVQLCBHTF9LRUVQXG4gICAgXSwgZnVuY3Rpb24gKGZhaWwsIHpmYWlsLCBwYXNzKSB7XG4gICAgICBnbC5zdGVuY2lsT3BTZXBhcmF0ZShHTF9GUk9OVCwgZmFpbCwgemZhaWwsIHBhc3MpXG4gICAgfSksXG4gICAgJ3N0ZW5jaWwub3BCYWNrJzogY3JlYXRlU3RhY2soW1xuICAgICAgR0xfS0VFUCwgR0xfS0VFUCwgR0xfS0VFUFxuICAgIF0sIGZ1bmN0aW9uIChmYWlsLCB6ZmFpbCwgcGFzcykge1xuICAgICAgZ2wuc3RlbmNpbE9wU2VwYXJhdGUoR0xfQkFDSywgZmFpbCwgemZhaWwsIHBhc3MpXG4gICAgfSksXG5cbiAgICAvLyBTY2lzc29yXG4gICAgJ3NjaXNzb3IuZW5hYmxlJzogY2FwU3RhY2soR0xfU0NJU1NPUl9URVNUKSxcbiAgICAnc2Npc3Nvci5ib3gnOiBjcmVhdGVTdGFjayhbMCwgMCwgLTEsIC0xXSwgZnVuY3Rpb24gKHgsIHksIHcsIGgpIHtcbiAgICAgIHZhciB3XyA9IHdcbiAgICAgIHZhciBmYm8gPSBmcmFtZWJ1ZmZlclN0YXRlLnRvcCgpXG4gICAgICBpZiAodyA8IDApIHtcbiAgICAgICAgaWYgKGZibykge1xuICAgICAgICAgIHdfID0gZmJvLndpZHRoIC0geFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHdfID0gZ2wuZHJhd2luZ0J1ZmZlcldpZHRoIC0geFxuICAgICAgICB9XG4gICAgICB9XG4gICAgICB2YXIgaF8gPSBoXG4gICAgICBpZiAoaCA8IDApIHtcbiAgICAgICAgaWYgKGZibykge1xuICAgICAgICAgIGhfID0gZmJvLmhlaWdodCAtIHlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBoXyA9IGdsLmRyYXdpbmdCdWZmZXJIZWlnaHQgLSB5XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGdsLnNjaXNzb3IoeCwgeSwgd18sIGhfKVxuICAgIH0pLFxuXG4gICAgLy8gVmlld3BvcnRcbiAgICAndmlld3BvcnQnOiBjcmVhdGVTdGFjayhbMCwgMCwgLTEsIC0xXSwgZnVuY3Rpb24gKHgsIHksIHcsIGgpIHtcbiAgICAgIHZhciB3XyA9IHdcbiAgICAgIHZhciBmYm8gPSBmcmFtZWJ1ZmZlclN0YXRlLnRvcCgpXG4gICAgICBpZiAodyA8IDApIHtcbiAgICAgICAgaWYgKGZibykge1xuICAgICAgICAgIHdfID0gZmJvLndpZHRoIC0geFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHdfID0gZ2wuZHJhd2luZ0J1ZmZlcldpZHRoIC0geFxuICAgICAgICB9XG4gICAgICB9XG4gICAgICB2YXIgaF8gPSBoXG4gICAgICBpZiAoaCA8IDApIHtcbiAgICAgICAgaWYgKGZibykge1xuICAgICAgICAgIGhfID0gZmJvLmhlaWdodCAtIHlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBoXyA9IGdsLmRyYXdpbmdCdWZmZXJIZWlnaHQgLSB5XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGdsLnZpZXdwb3J0KHgsIHksIHdfLCBoXylcbiAgICAgIHZpZXdwb3J0U3RhdGUud2lkdGggPSB3X1xuICAgICAgdmlld3BvcnRTdGF0ZS5oZWlnaHQgPSBoX1xuICAgIH0pXG4gIH1cblxuICB2YXIgZW52ID0gY3JlYXRlRW52aXJvbm1lbnQoKVxuICB2YXIgcG9sbCA9IGVudi5wcm9jKCdwb2xsJylcbiAgdmFyIHJlZnJlc2ggPSBlbnYucHJvYygncmVmcmVzaCcpXG4gIE9iamVjdC5rZXlzKGNvbnRleHRTdGF0ZSkuZm9yRWFjaChmdW5jdGlvbiAocHJvcCkge1xuICAgIHZhciBTVEFDSyA9IGVudi5saW5rKGNvbnRleHRTdGF0ZVtwcm9wXSlcbiAgICBwb2xsKFNUQUNLLCAnLnBvbGwoKTsnKVxuICAgIHJlZnJlc2goU1RBQ0ssICcuc2V0RGlydHkoKTsnKVxuICB9KVxuXG4gIHZhciBwcm9jcyA9IGVudi5jb21waWxlKClcblxuICByZXR1cm4ge1xuICAgIGNvbnRleHRTdGF0ZTogY29udGV4dFN0YXRlLFxuICAgIHZpZXdwb3J0OiB2aWV3cG9ydFN0YXRlLFxuICAgIHBvbGw6IHByb2NzLnBvbGwsXG4gICAgcmVmcmVzaDogcHJvY3MucmVmcmVzaCxcblxuICAgIG5vdGlmeVZpZXdwb3J0Q2hhbmdlZDogZnVuY3Rpb24gKCkge1xuICAgICAgY29udGV4dFN0YXRlLnZpZXdwb3J0LnNldERpcnR5KClcbiAgICAgIGNvbnRleHRTdGF0ZVsnc2Npc3Nvci5ib3gnXS5zZXREaXJ0eSgpXG4gICAgfVxuICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNyZWF0ZVN0cmluZ1N0b3JlICgpIHtcbiAgdmFyIHN0cmluZ0lkcyA9IHsnJzogMH1cbiAgdmFyIHN0cmluZ1ZhbHVlcyA9IFsnJ11cbiAgcmV0dXJuIHtcbiAgICBpZDogZnVuY3Rpb24gKHN0cikge1xuICAgICAgdmFyIHJlc3VsdCA9IHN0cmluZ0lkc1tzdHJdXG4gICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH1cbiAgICAgIHJlc3VsdCA9IHN0cmluZ0lkc1tzdHJdID0gc3RyaW5nVmFsdWVzLmxlbmd0aFxuICAgICAgc3RyaW5nVmFsdWVzLnB1c2goc3RyKVxuICAgICAgcmV0dXJuIHJlc3VsdFxuICAgIH0sXG5cbiAgICBzdHI6IGZ1bmN0aW9uIChpZCkge1xuICAgICAgcmV0dXJuIHN0cmluZ1ZhbHVlc1tpZF1cbiAgICB9XG4gIH1cbn1cbiIsIlxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vdXRpbC9leHRlbmQnKVxudmFyIHZhbHVlcyA9IHJlcXVpcmUoJy4vdXRpbC92YWx1ZXMnKVxudmFyIGlzVHlwZWRBcnJheSA9IHJlcXVpcmUoJy4vdXRpbC9pcy10eXBlZC1hcnJheScpXG52YXIgaXNOREFycmF5TGlrZSA9IHJlcXVpcmUoJy4vdXRpbC9pcy1uZGFycmF5JylcbnZhciBsb2FkVGV4dHVyZSA9IHJlcXVpcmUoJy4vdXRpbC9sb2FkLXRleHR1cmUnKVxudmFyIGNvbnZlcnRUb0hhbGZGbG9hdCA9IHJlcXVpcmUoJy4vdXRpbC90by1oYWxmLWZsb2F0JylcbnZhciBwYXJzZUREUyA9IHJlcXVpcmUoJy4vdXRpbC9wYXJzZS1kZHMnKVxuXG52YXIgR0xfQ09NUFJFU1NFRF9URVhUVVJFX0ZPUk1BVFMgPSAweDg2QTNcblxudmFyIEdMX1RFWFRVUkVfMkQgPSAweDBERTFcbnZhciBHTF9URVhUVVJFX0NVQkVfTUFQID0gMHg4NTEzXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YID0gMHg4NTE1XG5cbnZhciBHTF9SR0JBID0gMHgxOTA4XG52YXIgR0xfQUxQSEEgPSAweDE5MDZcbnZhciBHTF9SR0IgPSAweDE5MDdcbnZhciBHTF9MVU1JTkFOQ0UgPSAweDE5MDlcbnZhciBHTF9MVU1JTkFOQ0VfQUxQSEEgPSAweDE5MEFcblxudmFyIEdMX1JHQkE0ID0gMHg4MDU2XG52YXIgR0xfUkdCNV9BMSA9IDB4ODA1N1xudmFyIEdMX1JHQjU2NSA9IDB4OEQ2MlxuXG52YXIgR0xfVU5TSUdORURfU0hPUlRfNF80XzRfNCA9IDB4ODAzM1xudmFyIEdMX1VOU0lHTkVEX1NIT1JUXzVfNV81XzEgPSAweDgwMzRcbnZhciBHTF9VTlNJR05FRF9TSE9SVF81XzZfNSA9IDB4ODM2M1xudmFyIEdMX1VOU0lHTkVEX0lOVF8yNF84X1dFQkdMID0gMHg4NEZBXG5cbnZhciBHTF9ERVBUSF9DT01QT05FTlQgPSAweDE5MDJcbnZhciBHTF9ERVBUSF9TVEVOQ0lMID0gMHg4NEY5XG5cbnZhciBHTF9TUkdCX0VYVCA9IDB4OEM0MFxudmFyIEdMX1NSR0JfQUxQSEFfRVhUID0gMHg4QzQyXG5cbnZhciBHTF9IQUxGX0ZMT0FUX09FUyA9IDB4OEQ2MVxuXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfUzNUQ19EWFQxX0VYVCA9IDB4ODNGMFxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDFfRVhUID0gMHg4M0YxXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUM19FWFQgPSAweDgzRjJcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQ1X0VYVCA9IDB4ODNGM1xuXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfQVRDX1dFQkdMID0gMHg4QzkyXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19FWFBMSUNJVF9BTFBIQV9XRUJHTCA9IDB4OEM5M1xudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9BVENfSU5URVJQT0xBVEVEX0FMUEhBX1dFQkdMID0gMHg4N0VFXG5cbnZhciBHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ180QlBQVjFfSU1HID0gMHg4QzAwXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfUFZSVENfMkJQUFYxX0lNRyA9IDB4OEMwMVxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9QVlJUQ180QlBQVjFfSU1HID0gMHg4QzAyXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1BWUlRDXzJCUFBWMV9JTUcgPSAweDhDMDNcblxudmFyIEdMX0NPTVBSRVNTRURfUkdCX0VUQzFfV0VCR0wgPSAweDhENjRcblxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSAweDE0MDFcbnZhciBHTF9VTlNJR05FRF9TSE9SVCA9IDB4MTQwM1xudmFyIEdMX1VOU0lHTkVEX0lOVCA9IDB4MTQwNVxudmFyIEdMX0ZMT0FUID0gMHgxNDA2XG5cbnZhciBHTF9URVhUVVJFX1dSQVBfUyA9IDB4MjgwMlxudmFyIEdMX1RFWFRVUkVfV1JBUF9UID0gMHgyODAzXG5cbnZhciBHTF9SRVBFQVQgPSAweDI5MDFcbnZhciBHTF9DTEFNUF9UT19FREdFID0gMHg4MTJGXG52YXIgR0xfTUlSUk9SRURfUkVQRUFUID0gMHg4MzcwXG5cbnZhciBHTF9URVhUVVJFX01BR19GSUxURVIgPSAweDI4MDBcbnZhciBHTF9URVhUVVJFX01JTl9GSUxURVIgPSAweDI4MDFcblxudmFyIEdMX05FQVJFU1QgPSAweDI2MDBcbnZhciBHTF9MSU5FQVIgPSAweDI2MDFcbnZhciBHTF9ORUFSRVNUX01JUE1BUF9ORUFSRVNUID0gMHgyNzAwXG52YXIgR0xfTElORUFSX01JUE1BUF9ORUFSRVNUID0gMHgyNzAxXG52YXIgR0xfTkVBUkVTVF9NSVBNQVBfTElORUFSID0gMHgyNzAyXG52YXIgR0xfTElORUFSX01JUE1BUF9MSU5FQVIgPSAweDI3MDNcblxudmFyIEdMX0dFTkVSQVRFX01JUE1BUF9ISU5UID0gMHg4MTkyXG52YXIgR0xfRE9OVF9DQVJFID0gMHgxMTAwXG52YXIgR0xfRkFTVEVTVCA9IDB4MTEwMVxudmFyIEdMX05JQ0VTVCA9IDB4MTEwMlxuXG52YXIgR0xfVEVYVFVSRV9NQVhfQU5JU09UUk9QWV9FWFQgPSAweDg0RkVcblxudmFyIEdMX1VOUEFDS19BTElHTk1FTlQgPSAweDBDRjVcbnZhciBHTF9VTlBBQ0tfRkxJUF9ZX1dFQkdMID0gMHg5MjQwXG52YXIgR0xfVU5QQUNLX1BSRU1VTFRJUExZX0FMUEhBX1dFQkdMID0gMHg5MjQxXG52YXIgR0xfVU5QQUNLX0NPTE9SU1BBQ0VfQ09OVkVSU0lPTl9XRUJHTCA9IDB4OTI0M1xuXG52YXIgR0xfQlJPV1NFUl9ERUZBVUxUX1dFQkdMID0gMHg5MjQ0XG5cbnZhciBHTF9URVhUVVJFMCA9IDB4ODRDMFxuXG52YXIgTUlQTUFQX0ZJTFRFUlMgPSBbXG4gIEdMX05FQVJFU1RfTUlQTUFQX05FQVJFU1QsXG4gIEdMX05FQVJFU1RfTUlQTUFQX0xJTkVBUixcbiAgR0xfTElORUFSX01JUE1BUF9ORUFSRVNULFxuICBHTF9MSU5FQVJfTUlQTUFQX0xJTkVBUlxuXVxuXG5mdW5jdGlvbiBpc1BvdzIgKHYpIHtcbiAgcmV0dXJuICEodiAmICh2IC0gMSkpICYmICghIXYpXG59XG5cbmZ1bmN0aW9uIGlzTnVtZXJpY0FycmF5IChhcnIpIHtcbiAgcmV0dXJuIChcbiAgICBBcnJheS5pc0FycmF5KGFycikgJiZcbiAgICAoYXJyLmxlbmd0aCA9PT0gMCB8fFxuICAgIHR5cGVvZiBhcnJbMF0gPT09ICdudW1iZXInKSlcbn1cblxuZnVuY3Rpb24gaXNSZWN0QXJyYXkgKGFycikge1xuICBpZiAoIUFycmF5LmlzQXJyYXkoYXJyKSkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG5cbiAgdmFyIHdpZHRoID0gYXJyLmxlbmd0aFxuICBpZiAod2lkdGggPT09IDAgfHwgIUFycmF5LmlzQXJyYXkoYXJyWzBdKSkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG5cbiAgdmFyIGhlaWdodCA9IGFyclswXS5sZW5ndGhcbiAgZm9yICh2YXIgaSA9IDE7IGkgPCB3aWR0aDsgKytpKSB7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGFycltpXSkgfHwgYXJyW2ldLmxlbmd0aCAhPT0gaGVpZ2h0KSB7XG4gICAgICByZXR1cm4gZmFsc2VcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRydWVcbn1cblxuZnVuY3Rpb24gY2xhc3NTdHJpbmcgKHgpIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh4KVxufVxuXG5mdW5jdGlvbiBpc0NhbnZhc0VsZW1lbnQgKG9iamVjdCkge1xuICByZXR1cm4gY2xhc3NTdHJpbmcob2JqZWN0KSA9PT0gJ1tvYmplY3QgSFRNTENhbnZhc0VsZW1lbnRdJ1xufVxuXG5mdW5jdGlvbiBpc0NvbnRleHQyRCAob2JqZWN0KSB7XG4gIHJldHVybiBjbGFzc1N0cmluZyhvYmplY3QpID09PSAnW29iamVjdCBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkRdJ1xufVxuXG5mdW5jdGlvbiBpc0ltYWdlRWxlbWVudCAob2JqZWN0KSB7XG4gIHJldHVybiBjbGFzc1N0cmluZyhvYmplY3QpID09PSAnW29iamVjdCBIVE1MSW1hZ2VFbGVtZW50XSdcbn1cblxuZnVuY3Rpb24gaXNWaWRlb0VsZW1lbnQgKG9iamVjdCkge1xuICByZXR1cm4gY2xhc3NTdHJpbmcob2JqZWN0KSA9PT0gJ1tvYmplY3QgSFRNTFZpZGVvRWxlbWVudF0nXG59XG5cbmZ1bmN0aW9uIGlzUGVuZGluZ1hIUiAob2JqZWN0KSB7XG4gIHJldHVybiBjbGFzc1N0cmluZyhvYmplY3QpID09PSAnW29iamVjdCBYTUxIdHRwUmVxdWVzdF0nXG59XG5cbmZ1bmN0aW9uIGlzUGl4ZWxEYXRhIChvYmplY3QpIHtcbiAgcmV0dXJuIChcbiAgICB0eXBlb2Ygb2JqZWN0ID09PSAnc3RyaW5nJyB8fFxuICAgICghIW9iamVjdCAmJiAoXG4gICAgICBpc1R5cGVkQXJyYXkob2JqZWN0KSB8fFxuICAgICAgaXNOdW1lcmljQXJyYXkob2JqZWN0KSB8fFxuICAgICAgaXNOREFycmF5TGlrZShvYmplY3QpIHx8XG4gICAgICBpc0NhbnZhc0VsZW1lbnQob2JqZWN0KSB8fFxuICAgICAgaXNDb250ZXh0MkQob2JqZWN0KSB8fFxuICAgICAgaXNJbWFnZUVsZW1lbnQob2JqZWN0KSB8fFxuICAgICAgaXNWaWRlb0VsZW1lbnQob2JqZWN0KSB8fFxuICAgICAgaXNSZWN0QXJyYXkob2JqZWN0KSkpKVxufVxuXG4vLyBUcmFuc3Bvc2UgYW4gYXJyYXkgb2YgcGl4ZWxzXG5mdW5jdGlvbiB0cmFuc3Bvc2VQaXhlbHMgKGRhdGEsIG54LCBueSwgbmMsIHN4LCBzeSwgc2MsIG9mZikge1xuICB2YXIgcmVzdWx0ID0gbmV3IGRhdGEuY29uc3RydWN0b3IobnggKiBueSAqIG5jKVxuICB2YXIgcHRyID0gMFxuICBmb3IgKHZhciBpID0gMDsgaSA8IG55OyArK2kpIHtcbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IG54OyArK2opIHtcbiAgICAgIGZvciAodmFyIGsgPSAwOyBrIDwgbmM7ICsraykge1xuICAgICAgICByZXN1bHRbcHRyKytdID0gZGF0YVtzeSAqIGkgKyBzeCAqIGogKyBzYyAqIGsgKyBvZmZdXG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHRcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjcmVhdGVUZXh0dXJlU2V0IChnbCwgZXh0ZW5zaW9ucywgbGltaXRzLCByZWdsUG9sbCwgdmlld3BvcnRTdGF0ZSkge1xuICB2YXIgbWlwbWFwSGludCA9IHtcbiAgICBcImRvbid0IGNhcmVcIjogR0xfRE9OVF9DQVJFLFxuICAgICdkb250IGNhcmUnOiBHTF9ET05UX0NBUkUsXG4gICAgJ25pY2UnOiBHTF9OSUNFU1QsXG4gICAgJ2Zhc3QnOiBHTF9GQVNURVNUXG4gIH1cblxuICB2YXIgd3JhcE1vZGVzID0ge1xuICAgICdyZXBlYXQnOiBHTF9SRVBFQVQsXG4gICAgJ2NsYW1wJzogR0xfQ0xBTVBfVE9fRURHRSxcbiAgICAnbWlycm9yJzogR0xfTUlSUk9SRURfUkVQRUFUXG4gIH1cblxuICB2YXIgbWFnRmlsdGVycyA9IHtcbiAgICAnbmVhcmVzdCc6IEdMX05FQVJFU1QsXG4gICAgJ2xpbmVhcic6IEdMX0xJTkVBUlxuICB9XG5cbiAgdmFyIG1pbkZpbHRlcnMgPSBleHRlbmQoe1xuICAgICduZWFyZXN0IG1pcG1hcCBuZWFyZXN0JzogR0xfTkVBUkVTVF9NSVBNQVBfTkVBUkVTVCxcbiAgICAnbGluZWFyIG1pcG1hcCBuZWFyZXN0JzogR0xfTElORUFSX01JUE1BUF9ORUFSRVNULFxuICAgICduZWFyZXN0IG1pcG1hcCBsaW5lYXInOiBHTF9ORUFSRVNUX01JUE1BUF9MSU5FQVIsXG4gICAgJ2xpbmVhciBtaXBtYXAgbGluZWFyJzogR0xfTElORUFSX01JUE1BUF9MSU5FQVIsXG4gICAgJ21pcG1hcCc6IEdMX0xJTkVBUl9NSVBNQVBfTElORUFSXG4gIH0sIG1hZ0ZpbHRlcnMpXG5cbiAgdmFyIGNvbG9yU3BhY2UgPSB7XG4gICAgJ25vbmUnOiAwLFxuICAgICdicm93c2VyJzogR0xfQlJPV1NFUl9ERUZBVUxUX1dFQkdMXG4gIH1cblxuICB2YXIgdGV4dHVyZVR5cGVzID0ge1xuICAgICd1aW50OCc6IEdMX1VOU0lHTkVEX0JZVEUsXG4gICAgJ3JnYmE0JzogR0xfVU5TSUdORURfU0hPUlRfNF80XzRfNCxcbiAgICAncmdiNTY1JzogR0xfVU5TSUdORURfU0hPUlRfNV82XzUsXG4gICAgJ3JnYjUgYTEnOiBHTF9VTlNJR05FRF9TSE9SVF81XzVfNV8xXG4gIH1cblxuICB2YXIgdGV4dHVyZUZvcm1hdHMgPSB7XG4gICAgJ2FscGhhJzogR0xfQUxQSEEsXG4gICAgJ2x1bWluYW5jZSc6IEdMX0xVTUlOQU5DRSxcbiAgICAnbHVtaW5hbmNlIGFscGhhJzogR0xfTFVNSU5BTkNFX0FMUEhBLFxuICAgICdyZ2InOiBHTF9SR0IsXG4gICAgJ3JnYmEnOiBHTF9SR0JBLFxuICAgICdyZ2JhNCc6IEdMX1JHQkE0LFxuICAgICdyZ2I1IGExJzogR0xfUkdCNV9BMSxcbiAgICAncmdiNTY1JzogR0xfUkdCNTY1XG4gIH1cblxuICB2YXIgY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzID0ge31cblxuICBpZiAoZXh0ZW5zaW9ucy5leHRfc3JnYikge1xuICAgIHRleHR1cmVGb3JtYXRzLnNyZ2IgPSBHTF9TUkdCX0VYVFxuICAgIHRleHR1cmVGb3JtYXRzLnNyZ2JhID0gR0xfU1JHQl9BTFBIQV9FWFRcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLm9lc190ZXh0dXJlX2Zsb2F0KSB7XG4gICAgdGV4dHVyZVR5cGVzLmZsb2F0ID0gR0xfRkxPQVRcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLm9lc190ZXh0dXJlX2hhbGZfZmxvYXQpIHtcbiAgICB0ZXh0dXJlVHlwZXNbJ2hhbGYgZmxvYXQnXSA9IEdMX0hBTEZfRkxPQVRfT0VTXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9kZXB0aF90ZXh0dXJlKSB7XG4gICAgZXh0ZW5kKHRleHR1cmVGb3JtYXRzLCB7XG4gICAgICAnZGVwdGgnOiBHTF9ERVBUSF9DT01QT05FTlQsXG4gICAgICAnZGVwdGggc3RlbmNpbCc6IEdMX0RFUFRIX1NURU5DSUxcbiAgICB9KVxuXG4gICAgZXh0ZW5kKHRleHR1cmVUeXBlcywge1xuICAgICAgJ3VpbnQxNic6IEdMX1VOU0lHTkVEX1NIT1JULFxuICAgICAgJ3VpbnQzMic6IEdMX1VOU0lHTkVEX0lOVCxcbiAgICAgICdkZXB0aCBzdGVuY2lsJzogR0xfVU5TSUdORURfSU5UXzI0XzhfV0VCR0xcbiAgICB9KVxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29tcHJlc3NlZF90ZXh0dXJlX3MzdGMpIHtcbiAgICBleHRlbmQoY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzLCB7XG4gICAgICAncmdiIHMzdGMgZHh0MSc6IEdMX0NPTVBSRVNTRURfUkdCX1MzVENfRFhUMV9FWFQsXG4gICAgICAncmdiYSBzM3RjIGR4dDEnOiBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQxX0VYVCxcbiAgICAgICdyZ2JhIHMzdGMgZHh0Myc6IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDNfRVhULFxuICAgICAgJ3JnYmEgczN0YyBkeHQ1JzogR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUNV9FWFRcbiAgICB9KVxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29tcHJlc3NlZF90ZXh0dXJlX2F0Yykge1xuICAgIGV4dGVuZChjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHMsIHtcbiAgICAgICdyZ2IgYXJjJzogR0xfQ09NUFJFU1NFRF9SR0JfQVRDX1dFQkdMLFxuICAgICAgJ3JnYmEgYXRjIGV4cGxpY2l0IGFscGhhJzogR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19FWFBMSUNJVF9BTFBIQV9XRUJHTCxcbiAgICAgICdyZ2JhIGF0YyBpbnRlcnBvbGF0ZWQgYWxwaGEnOiBHTF9DT01QUkVTU0VEX1JHQkFfQVRDX0lOVEVSUE9MQVRFRF9BTFBIQV9XRUJHTFxuICAgIH0pXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb21wcmVzc2VkX3RleHR1cmVfcHZydGMpIHtcbiAgICBleHRlbmQoY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzLCB7XG4gICAgICAncmdiIHB2cnRjIDRicHB2MSc6IEdMX0NPTVBSRVNTRURfUkdCX1BWUlRDXzRCUFBWMV9JTUcsXG4gICAgICAncmdiIHB2cnRjIDJicHB2MSc6IEdMX0NPTVBSRVNTRURfUkdCX1BWUlRDXzJCUFBWMV9JTUcsXG4gICAgICAncmdiYSBwdnJ0YyA0YnBwdjEnOiBHTF9DT01QUkVTU0VEX1JHQkFfUFZSVENfNEJQUFYxX0lNRyxcbiAgICAgICdyZ2JhIHB2cnRjIDJicHB2MSc6IEdMX0NPTVBSRVNTRURfUkdCQV9QVlJUQ18yQlBQVjFfSU1HXG4gICAgfSlcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9ldGMxKSB7XG4gICAgY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzWydyZ2IgZXRjMSddID0gR0xfQ09NUFJFU1NFRF9SR0JfRVRDMV9XRUJHTFxuICB9XG5cbiAgLy8gQ29weSBvdmVyIGFsbCB0ZXh0dXJlIGZvcm1hdHNcbiAgdmFyIHN1cHBvcnRlZENvbXByZXNzZWRGb3JtYXRzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoXG4gICAgZ2wuZ2V0UGFyYW1ldGVyKEdMX0NPTVBSRVNTRURfVEVYVFVSRV9GT1JNQVRTKSlcbiAgT2JqZWN0LmtleXMoY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdmFyIGZvcm1hdCA9IGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0c1tuYW1lXVxuICAgIGlmIChzdXBwb3J0ZWRDb21wcmVzc2VkRm9ybWF0cy5pbmRleE9mKGZvcm1hdCkgPj0gMCkge1xuICAgICAgdGV4dHVyZUZvcm1hdHNbbmFtZV0gPSBmb3JtYXRcbiAgICB9XG4gIH0pXG5cbiAgdmFyIHN1cHBvcnRlZEZvcm1hdHMgPSBPYmplY3Qua2V5cyh0ZXh0dXJlRm9ybWF0cylcbiAgbGltaXRzLnRleHR1cmVGb3JtYXRzID0gc3VwcG9ydGVkRm9ybWF0c1xuXG4gIHZhciBjb2xvckZvcm1hdHMgPSBzdXBwb3J0ZWRGb3JtYXRzLnJlZHVjZShmdW5jdGlvbiAoY29sb3IsIGtleSkge1xuICAgIHZhciBnbGVudW0gPSB0ZXh0dXJlRm9ybWF0c1trZXldXG4gICAgaWYgKGdsZW51bSA9PT0gR0xfTFVNSU5BTkNFIHx8XG4gICAgICAgIGdsZW51bSA9PT0gR0xfQUxQSEEgfHxcbiAgICAgICAgZ2xlbnVtID09PSBHTF9MVU1JTkFOQ0UgfHxcbiAgICAgICAgZ2xlbnVtID09PSBHTF9MVU1JTkFOQ0VfQUxQSEEgfHxcbiAgICAgICAgZ2xlbnVtID09PSBHTF9ERVBUSF9DT01QT05FTlQgfHxcbiAgICAgICAgZ2xlbnVtID09PSBHTF9ERVBUSF9TVEVOQ0lMKSB7XG4gICAgICBjb2xvcltnbGVudW1dID0gZ2xlbnVtXG4gICAgfSBlbHNlIGlmIChnbGVudW0gPT09IEdMX1JHQjVfQTEgfHwga2V5LmluZGV4T2YoJ3JnYmEnKSA+PSAwKSB7XG4gICAgICBjb2xvcltnbGVudW1dID0gR0xfUkdCQVxuICAgIH0gZWxzZSB7XG4gICAgICBjb2xvcltnbGVudW1dID0gR0xfUkdCXG4gICAgfVxuICAgIHJldHVybiBjb2xvclxuICB9LCB7fSlcblxuICAvLyBQaXhlbCBzdG9yYWdlIHBhcnNpbmdcbiAgZnVuY3Rpb24gUGl4ZWxJbmZvICh0YXJnZXQpIHtcbiAgICAvLyB0ZXggdGFyZ2V0XG4gICAgdGhpcy50YXJnZXQgPSB0YXJnZXRcblxuICAgIC8vIHBpeGVsU3RvcmVpIGluZm9cbiAgICB0aGlzLmZsaXBZID0gZmFsc2VcbiAgICB0aGlzLnByZW11bHRpcGx5QWxwaGEgPSBmYWxzZVxuICAgIHRoaXMudW5wYWNrQWxpZ25tZW50ID0gMVxuICAgIHRoaXMuY29sb3JTcGFjZSA9IDBcblxuICAgIC8vIHNoYXBlXG4gICAgdGhpcy53aWR0aCA9IDBcbiAgICB0aGlzLmhlaWdodCA9IDBcbiAgICB0aGlzLmNoYW5uZWxzID0gMFxuXG4gICAgLy8gZm9ybWF0IGFuZCB0eXBlXG4gICAgdGhpcy5mb3JtYXQgPSAwXG4gICAgdGhpcy5pbnRlcm5hbGZvcm1hdCA9IDBcbiAgICB0aGlzLnR5cGUgPSAwXG4gICAgdGhpcy5jb21wcmVzc2VkID0gZmFsc2VcblxuICAgIC8vIG1pcCBsZXZlbFxuICAgIHRoaXMubWlwbGV2ZWwgPSAwXG5cbiAgICAvLyBuZGFycmF5LWxpa2UgcGFyYW1ldGVyc1xuICAgIHRoaXMuc3RyaWRlWCA9IDBcbiAgICB0aGlzLnN0cmlkZVkgPSAwXG4gICAgdGhpcy5zdHJpZGVDID0gMFxuICAgIHRoaXMub2Zmc2V0ID0gMFxuXG4gICAgLy8gY29weSBwaXhlbHMgaW5mb1xuICAgIHRoaXMueCA9IDBcbiAgICB0aGlzLnkgPSAwXG4gICAgdGhpcy5jb3B5ID0gZmFsc2VcblxuICAgIC8vIGRhdGEgc291cmNlc1xuICAgIHRoaXMuZGF0YSA9IG51bGxcbiAgICB0aGlzLmltYWdlID0gbnVsbFxuICAgIHRoaXMudmlkZW8gPSBudWxsXG4gICAgdGhpcy5jYW52YXMgPSBudWxsXG4gICAgdGhpcy54aHIgPSBudWxsXG5cbiAgICAvLyBDT1JTXG4gICAgdGhpcy5jcm9zc09yaWdpbiA9IG51bGxcblxuICAgIC8vIGhvcnJpYmxlIHN0YXRlIGZsYWdzXG4gICAgdGhpcy5uZWVkc1BvbGwgPSBmYWxzZVxuICAgIHRoaXMubmVlZHNMaXN0ZW5lcnMgPSBmYWxzZVxuICB9XG5cbiAgZXh0ZW5kKFBpeGVsSW5mby5wcm90b3R5cGUsIHtcbiAgICBwYXJzZUZsYWdzOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgaWYgKHR5cGVvZiBvcHRpb25zICE9PSAnb2JqZWN0JyB8fCAhb3B0aW9ucykge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgaWYgKCdwcmVtdWx0aXBseUFscGhhJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIFxuICAgICAgICB0aGlzLnByZW11bHRpcGx5QWxwaGEgPSBvcHRpb25zLnByZW11bHRpcGx5QWxwaGFcbiAgICAgIH1cblxuICAgICAgaWYgKCdmbGlwWScgaW4gb3B0aW9ucykge1xuICAgICAgICBcbiAgICAgICAgdGhpcy5mbGlwWSA9IG9wdGlvbnMuZmxpcFlcbiAgICAgIH1cblxuICAgICAgaWYgKCdhbGlnbm1lbnQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgXG4gICAgICAgIHRoaXMudW5wYWNrQWxpZ25tZW50ID0gb3B0aW9ucy5hbGlnbm1lbnRcbiAgICAgIH1cblxuICAgICAgaWYgKCdjb2xvclNwYWNlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIFxuICAgICAgICB0aGlzLmNvbG9yU3BhY2UgPSBjb2xvclNwYWNlW29wdGlvbnMuY29sb3JTcGFjZV1cbiAgICAgIH1cblxuICAgICAgaWYgKCdmb3JtYXQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGZvcm1hdCA9IG9wdGlvbnMuZm9ybWF0XG4gICAgICAgIFxuICAgICAgICB0aGlzLmludGVybmFsZm9ybWF0ID0gdGV4dHVyZUZvcm1hdHNbZm9ybWF0XVxuICAgICAgICBpZiAoZm9ybWF0IGluIHRleHR1cmVUeXBlcykge1xuICAgICAgICAgIHRoaXMudHlwZSA9IHRleHR1cmVUeXBlc1tmb3JtYXRdXG4gICAgICAgIH1cbiAgICAgICAgaWYgKGZvcm1hdCBpbiBjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHMpIHtcbiAgICAgICAgICB0aGlzLmNvbXByZXNzZWQgPSB0cnVlXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKCd0eXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciB0eXBlID0gb3B0aW9ucy50eXBlXG4gICAgICAgIFxuICAgICAgICB0aGlzLnR5cGUgPSB0ZXh0dXJlVHlwZXNbdHlwZV1cbiAgICAgIH1cblxuICAgICAgdmFyIHcgPSB0aGlzLndpZHRoXG4gICAgICB2YXIgaCA9IHRoaXMuaGVpZ2h0XG4gICAgICB2YXIgYyA9IHRoaXMuY2hhbm5lbHNcbiAgICAgIGlmICgnc2hhcGUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgXG4gICAgICAgIHcgPSBvcHRpb25zLnNoYXBlWzBdXG4gICAgICAgIGggPSBvcHRpb25zLnNoYXBlWzFdXG4gICAgICAgIGlmIChvcHRpb25zLnNoYXBlLmxlbmd0aCA9PT0gMykge1xuICAgICAgICAgIGMgPSBvcHRpb25zLnNoYXBlWzJdXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmICgncmFkaXVzJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgdyA9IGggPSBvcHRpb25zLnJhZGl1c1xuICAgICAgICB9XG4gICAgICAgIGlmICgnd2lkdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB3ID0gb3B0aW9ucy53aWR0aFxuICAgICAgICB9XG4gICAgICAgIGlmICgnaGVpZ2h0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgaCA9IG9wdGlvbnMuaGVpZ2h0XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCdjaGFubmVscycgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGMgPSBvcHRpb25zLmNoYW5uZWxzXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHRoaXMud2lkdGggPSB3IHwgMFxuICAgICAgdGhpcy5oZWlnaHQgPSBoIHwgMFxuICAgICAgdGhpcy5jaGFubmVscyA9IGMgfCAwXG5cbiAgICAgIGlmICgnc3RyaWRlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBzdHJpZGUgPSBvcHRpb25zLnN0cmlkZVxuICAgICAgICBcbiAgICAgICAgdGhpcy5zdHJpZGVYID0gc3RyaWRlWzBdXG4gICAgICAgIHRoaXMuc3RyaWRlWSA9IHN0cmlkZVsxXVxuICAgICAgICBpZiAoc3RyaWRlLmxlbmd0aCA9PT0gMykge1xuICAgICAgICAgIHRoaXMuc3RyaWRlQyA9IHN0cmlkZVsyXVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMuc3RyaWRlQyA9IDFcbiAgICAgICAgfVxuICAgICAgICB0aGlzLm5lZWRzVHJhbnNwb3NlID0gdHJ1ZVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5zdHJpZGVDID0gMVxuICAgICAgICB0aGlzLnN0cmlkZVggPSB0aGlzLnN0cmlkZUMgKiBjXG4gICAgICAgIHRoaXMuc3RyaWRlWSA9IHRoaXMuc3RyaWRlWCAqIHdcbiAgICAgIH1cblxuICAgICAgaWYgKCdvZmZzZXQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdGhpcy5vZmZzZXQgPSBvcHRpb25zLm9mZnNldCB8IDBcbiAgICAgICAgdGhpcy5uZWVkc1RyYW5zcG9zZSA9IHRydWVcbiAgICAgIH1cblxuICAgICAgaWYgKCdjcm9zc09yaWdpbicgaW4gb3B0aW9ucykge1xuICAgICAgICB0aGlzLmNyb3NzT3JpZ2luID0gb3B0aW9ucy5jcm9zc09yaWdpblxuICAgICAgfVxuICAgIH0sXG4gICAgcGFyc2U6IGZ1bmN0aW9uIChvcHRpb25zLCBtaXBsZXZlbCkge1xuICAgICAgdGhpcy5taXBsZXZlbCA9IG1pcGxldmVsXG4gICAgICB0aGlzLndpZHRoID0gdGhpcy53aWR0aCA+PiBtaXBsZXZlbFxuICAgICAgdGhpcy5oZWlnaHQgPSB0aGlzLmhlaWdodCA+PiBtaXBsZXZlbFxuXG4gICAgICB2YXIgZGF0YSA9IG9wdGlvbnNcbiAgICAgIHN3aXRjaCAodHlwZW9mIG9wdGlvbnMpIHtcbiAgICAgICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlICdvYmplY3QnOlxuICAgICAgICAgIGlmICghb3B0aW9ucykge1xuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgfVxuICAgICAgICAgIHRoaXMucGFyc2VGbGFncyhvcHRpb25zKVxuICAgICAgICAgIGlmIChpc1BpeGVsRGF0YShvcHRpb25zLmRhdGEpKSB7XG4gICAgICAgICAgICBkYXRhID0gb3B0aW9ucy5kYXRhXG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgJ3VuZGVmaW5lZCc6XG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgXG4gICAgICB9XG5cbiAgICAgIGlmICh0eXBlb2YgZGF0YSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgZGF0YSA9IGxvYWRUZXh0dXJlKGRhdGEsIHRoaXMuY3Jvc3NPcmlnaW4pXG4gICAgICB9XG5cbiAgICAgIHZhciBhcnJheSA9IG51bGxcbiAgICAgIHZhciBuZWVkc0NvbnZlcnQgPSBmYWxzZVxuXG4gICAgICBpZiAodGhpcy5jb21wcmVzc2VkKSB7XG4gICAgICAgIFxuICAgICAgfVxuXG4gICAgICBpZiAoZGF0YSA9PT0gbnVsbCkge1xuICAgICAgICAvLyBUT0RPXG4gICAgICB9IGVsc2UgaWYgKGlzVHlwZWRBcnJheShkYXRhKSkge1xuICAgICAgICB0aGlzLmRhdGEgPSBkYXRhXG4gICAgICB9IGVsc2UgaWYgKGlzTnVtZXJpY0FycmF5KGRhdGEpKSB7XG4gICAgICAgIGFycmF5ID0gZGF0YVxuICAgICAgICBuZWVkc0NvbnZlcnQgPSB0cnVlXG4gICAgICB9IGVsc2UgaWYgKGlzTkRBcnJheUxpa2UoZGF0YSkpIHtcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YS5kYXRhKSkge1xuICAgICAgICAgIGFycmF5ID0gZGF0YS5kYXRhXG4gICAgICAgICAgbmVlZHNDb252ZXJ0ID0gdHJ1ZVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMuZGF0YSA9IGRhdGEuZGF0YVxuICAgICAgICB9XG4gICAgICAgIHZhciBzaGFwZSA9IGRhdGEuc2hhcGVcbiAgICAgICAgdGhpcy53aWR0aCA9IHNoYXBlWzBdXG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gc2hhcGVbMV1cbiAgICAgICAgaWYgKHNoYXBlLmxlbmd0aCA9PT0gMykge1xuICAgICAgICAgIHRoaXMuY2hhbm5lbHMgPSBzaGFwZVsyXVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMuY2hhbm5lbHMgPSAxXG4gICAgICAgIH1cbiAgICAgICAgdmFyIHN0cmlkZSA9IGRhdGEuc3RyaWRlXG4gICAgICAgIHRoaXMuc3RyaWRlWCA9IGRhdGEuc3RyaWRlWzBdXG4gICAgICAgIHRoaXMuc3RyaWRlWSA9IGRhdGEuc3RyaWRlWzFdXG4gICAgICAgIGlmIChzdHJpZGUubGVuZ3RoID09PSAzKSB7XG4gICAgICAgICAgdGhpcy5zdHJpZGVDID0gZGF0YS5zdHJpZGVbMl1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLnN0cmlkZUMgPSAxXG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5vZmZzZXQgPSBkYXRhLm9mZnNldFxuICAgICAgICB0aGlzLm5lZWRzVHJhbnNwb3NlID0gdHJ1ZVxuICAgICAgfSBlbHNlIGlmIChpc0NhbnZhc0VsZW1lbnQoZGF0YSkgfHwgaXNDb250ZXh0MkQoZGF0YSkpIHtcbiAgICAgICAgaWYgKGlzQ2FudmFzRWxlbWVudChkYXRhKSkge1xuICAgICAgICAgIHRoaXMuY2FudmFzID0gZGF0YVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMuY2FudmFzID0gZGF0YS5jYW52YXNcbiAgICAgICAgfVxuICAgICAgICB0aGlzLndpZHRoID0gdGhpcy5jYW52YXMud2lkdGhcbiAgICAgICAgdGhpcy5oZWlnaHQgPSB0aGlzLmNhbnZhcy5oZWlnaHRcbiAgICAgICAgdGhpcy5zZXREZWZhdWx0Rm9ybWF0KClcbiAgICAgIH0gZWxzZSBpZiAoaXNJbWFnZUVsZW1lbnQoZGF0YSkpIHtcbiAgICAgICAgdGhpcy5pbWFnZSA9IGRhdGFcbiAgICAgICAgaWYgKCFkYXRhLmNvbXBsZXRlKSB7XG4gICAgICAgICAgdGhpcy53aWR0aCA9IHRoaXMud2lkdGggfHwgZGF0YS5uYXR1cmFsV2lkdGhcbiAgICAgICAgICB0aGlzLmhlaWdodCA9IHRoaXMuaGVpZ2h0IHx8IGRhdGEubmF0dXJhbEhlaWdodFxuICAgICAgICAgIHRoaXMubmVlZHNMaXN0ZW5lcnMgPSB0cnVlXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy53aWR0aCA9IGRhdGEubmF0dXJhbFdpZHRoXG4gICAgICAgICAgdGhpcy5oZWlnaHQgPSBkYXRhLm5hdHVyYWxIZWlnaHRcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNldERlZmF1bHRGb3JtYXQoKVxuICAgICAgfSBlbHNlIGlmIChpc1ZpZGVvRWxlbWVudChkYXRhKSkge1xuICAgICAgICB0aGlzLnZpZGVvID0gZGF0YVxuICAgICAgICBpZiAoZGF0YS5yZWFkeVN0YXRlID4gMSkge1xuICAgICAgICAgIHRoaXMud2lkdGggPSBkYXRhLndpZHRoXG4gICAgICAgICAgdGhpcy5oZWlnaHQgPSBkYXRhLmhlaWdodFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMud2lkdGggPSB0aGlzLndpZHRoIHx8IGRhdGEud2lkdGhcbiAgICAgICAgICB0aGlzLmhlaWdodCA9IHRoaXMuaGVpZ2h0IHx8IGRhdGEuaGVpZ2h0XG4gICAgICAgICAgdGhpcy5uZWVkc0xpc3RlbmVycyA9IHRydWVcbiAgICAgICAgfVxuICAgICAgICB0aGlzLm5lZWRzUG9sbCA9IHRydWVcbiAgICAgICAgdGhpcy5zZXREZWZhdWx0Rm9ybWF0KClcbiAgICAgIH0gZWxzZSBpZiAoaXNQZW5kaW5nWEhSKGRhdGEpKSB7XG4gICAgICAgIHRoaXMueGhyID0gZGF0YVxuICAgICAgICB0aGlzLm5lZWRzTGlzdGVuZXJzID0gdHJ1ZVxuICAgICAgfSBlbHNlIGlmIChpc1JlY3RBcnJheShkYXRhKSkge1xuICAgICAgICB2YXIgdyA9IGRhdGFbMF0ubGVuZ3RoXG4gICAgICAgIHZhciBoID0gZGF0YS5sZW5ndGhcbiAgICAgICAgdmFyIGMgPSAxXG4gICAgICAgIHZhciBpLCBqLCBrLCBwXG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KGRhdGFbMF1bMF0pKSB7XG4gICAgICAgICAgYyA9IGRhdGFbMF1bMF0ubGVuZ3RoXG4gICAgICAgICAgXG4gICAgICAgICAgYXJyYXkgPSBBcnJheSh3ICogaCAqIGMpXG4gICAgICAgICAgcCA9IDBcbiAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgaDsgKytqKSB7XG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgdzsgKytpKSB7XG4gICAgICAgICAgICAgIGZvciAoayA9IDA7IGsgPCBjOyArK2spIHtcbiAgICAgICAgICAgICAgICBhcnJheVtwKytdID0gZGF0YVtqXVtpXVtrXVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGFycmF5ID0gQXJyYXkodyAqIGgpXG4gICAgICAgICAgcCA9IDBcbiAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgaDsgKytqKSB7XG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgdzsgKytpKSB7XG4gICAgICAgICAgICAgIGFycmF5W3ArK10gPSBkYXRhW2pdW2ldXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMud2lkdGggPSB3XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaFxuICAgICAgICB0aGlzLmNoYW5uZWxzID0gY1xuICAgICAgICBuZWVkc0NvbnZlcnQgPSB0cnVlXG4gICAgICB9IGVsc2UgaWYgKG9wdGlvbnMuY29weSkge1xuICAgICAgICB0aGlzLmNvcHkgPSB0cnVlXG4gICAgICAgIHRoaXMueCA9IHRoaXMueCB8IDBcbiAgICAgICAgdGhpcy55ID0gdGhpcy55IHwgMFxuICAgICAgICB0aGlzLndpZHRoID0gKHRoaXMud2lkdGggfHwgdmlld3BvcnRTdGF0ZS53aWR0aCkgfCAwXG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gKHRoaXMuaGVpZ2h0IHx8IHZpZXdwb3J0U3RhdGUuaGVpZ2h0KSB8IDBcbiAgICAgICAgdGhpcy5zZXREZWZhdWx0Rm9ybWF0KClcbiAgICAgIH1cblxuICAgICAgLy8gRml4IHVwIG1pc3NpbmcgdHlwZSBpbmZvIGZvciB0eXBlZCBhcnJheXNcbiAgICAgIGlmICghdGhpcy50eXBlICYmIHRoaXMuZGF0YSkge1xuICAgICAgICBpZiAodGhpcy5mb3JtYXQgPT09IEdMX0RFUFRIX0NPTVBPTkVOVCkge1xuICAgICAgICAgIGlmICh0aGlzLmRhdGEgaW5zdGFuY2VvZiBVaW50MTZBcnJheSkge1xuICAgICAgICAgICAgdGhpcy50eXBlID0gR0xfVU5TSUdORURfU0hPUlRcbiAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMuZGF0YSBpbnN0YW5jZW9mIFVpbnQzMkFycmF5KSB7XG4gICAgICAgICAgICB0aGlzLnR5cGUgPSBHTF9VTlNJR05FRF9JTlRcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5kYXRhIGluc3RhbmNlb2YgRmxvYXQzMkFycmF5KSB7XG4gICAgICAgICAgdGhpcy50eXBlID0gR0xfRkxPQVRcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBJbmZlciBkZWZhdWx0IGZvcm1hdFxuICAgICAgaWYgKCF0aGlzLmludGVybmFsZm9ybWF0KSB7XG4gICAgICAgIHZhciBjaGFubmVscyA9IHRoaXMuY2hhbm5lbHMgPSB0aGlzLmNoYW5uZWxzIHx8IDRcbiAgICAgICAgdGhpcy5pbnRlcm5hbGZvcm1hdCA9IFtcbiAgICAgICAgICBHTF9MVU1JTkFOQ0UsXG4gICAgICAgICAgR0xfTFVNSU5BTkNFX0FMUEhBLFxuICAgICAgICAgIEdMX1JHQixcbiAgICAgICAgICBHTF9SR0JBXVtjaGFubmVscyAtIDFdXG4gICAgICAgIFxuICAgICAgfVxuXG4gICAgICB2YXIgZm9ybWF0ID0gdGhpcy5pbnRlcm5hbGZvcm1hdFxuICAgICAgaWYgKGZvcm1hdCA9PT0gR0xfREVQVEhfQ09NUE9ORU5UIHx8IGZvcm1hdCA9PT0gR0xfREVQVEhfU1RFTkNJTCkge1xuICAgICAgICBcbiAgICAgICAgaWYgKGZvcm1hdCA9PT0gR0xfREVQVEhfQ09NUE9ORU5UKSB7XG4gICAgICAgICAgXG4gICAgICAgIH1cbiAgICAgICAgaWYgKGZvcm1hdCA9PT0gR0xfREVQVEhfU1RFTkNJTCkge1xuICAgICAgICAgIFxuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgfVxuXG4gICAgICAvLyBDb21wdXRlIGNvbG9yIGZvcm1hdCBhbmQgbnVtYmVyIG9mIGNoYW5uZWxzXG4gICAgICB2YXIgY29sb3JGb3JtYXQgPSB0aGlzLmZvcm1hdCA9IGNvbG9yRm9ybWF0c1tmb3JtYXRdXG4gICAgICBpZiAoIXRoaXMuY2hhbm5lbHMpIHtcbiAgICAgICAgc3dpdGNoIChjb2xvckZvcm1hdCkge1xuICAgICAgICAgIGNhc2UgR0xfTFVNSU5BTkNFOlxuICAgICAgICAgIGNhc2UgR0xfQUxQSEE6XG4gICAgICAgICAgY2FzZSBHTF9ERVBUSF9DT01QT05FTlQ6XG4gICAgICAgICAgICB0aGlzLmNoYW5uZWxzID0gMVxuICAgICAgICAgICAgYnJlYWtcblxuICAgICAgICAgIGNhc2UgR0xfREVQVEhfU1RFTkNJTDpcbiAgICAgICAgICBjYXNlIEdMX0xVTUlOQU5DRV9BTFBIQTpcbiAgICAgICAgICAgIHRoaXMuY2hhbm5lbHMgPSAyXG4gICAgICAgICAgICBicmVha1xuXG4gICAgICAgICAgY2FzZSBHTF9SR0I6XG4gICAgICAgICAgICB0aGlzLmNoYW5uZWxzID0gM1xuICAgICAgICAgICAgYnJlYWtcblxuICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICB0aGlzLmNoYW5uZWxzID0gNFxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIENoZWNrIHRoYXQgdGV4dHVyZSB0eXBlIGlzIHN1cHBvcnRlZFxuICAgICAgdmFyIHR5cGUgPSB0aGlzLnR5cGVcbiAgICAgIGlmICh0eXBlID09PSBHTF9GTE9BVCkge1xuICAgICAgICBcbiAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gR0xfSEFMRl9GTE9BVF9PRVMpIHtcbiAgICAgICAgXG4gICAgICB9IGVsc2UgaWYgKCF0eXBlKSB7XG4gICAgICAgIGlmIChmb3JtYXQgPT09IEdMX0RFUFRIX0NPTVBPTkVOVCkge1xuICAgICAgICAgIHR5cGUgPSBHTF9VTlNJR05FRF9JTlRcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0eXBlID0gR0xfVU5TSUdORURfQllURVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICB0aGlzLnR5cGUgPSB0eXBlXG5cbiAgICAgIC8vIGFwcGx5IGNvbnZlcnNpb25cbiAgICAgIGlmIChuZWVkc0NvbnZlcnQpIHtcbiAgICAgICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9CWVRFOlxuICAgICAgICAgICAgdGhpcy5kYXRhID0gbmV3IFVpbnQ4QXJyYXkoYXJyYXkpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlQ6XG4gICAgICAgICAgICB0aGlzLmRhdGEgPSBuZXcgVWludDE2QXJyYXkoYXJyYXkpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfSU5UOlxuICAgICAgICAgICAgdGhpcy5kYXRhID0gbmV3IFVpbnQzMkFycmF5KGFycmF5KVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlIEdMX0ZMT0FUOlxuICAgICAgICAgICAgdGhpcy5kYXRhID0gbmV3IEZsb2F0MzJBcnJheShhcnJheSlcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSBHTF9IQUxGX0ZMT0FUX09FUzpcbiAgICAgICAgICAgIHRoaXMuZGF0YSA9IGNvbnZlcnRUb0hhbGZGbG9hdChhcnJheSlcbiAgICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUXzVfNl81OlxuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlRfNV81XzVfMTpcbiAgICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUXzRfNF80XzQ6XG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9JTlRfMjRfOF9XRUJHTDpcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgYnJlYWtcblxuICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICBcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5kYXRhKSB7XG4gICAgICAgIC8vIGFwcGx5IHRyYW5zcG9zZVxuICAgICAgICBpZiAodGhpcy5uZWVkc1RyYW5zcG9zZSkge1xuICAgICAgICAgIHRoaXMuZGF0YSA9IHRyYW5zcG9zZVBpeGVscyhcbiAgICAgICAgICAgIHRoaXMuZGF0YSxcbiAgICAgICAgICAgIHRoaXMud2lkdGgsXG4gICAgICAgICAgICB0aGlzLmhlaWdodCxcbiAgICAgICAgICAgIHRoaXMuY2hhbm5lbHMsXG4gICAgICAgICAgICB0aGlzLnN0cmlkZVgsXG4gICAgICAgICAgICB0aGlzLnN0cmlkZVksXG4gICAgICAgICAgICB0aGlzLnN0cmlkZUMsXG4gICAgICAgICAgICB0aGlzLm9mZnNldClcbiAgICAgICAgfVxuICAgICAgICAvLyBjaGVjayBkYXRhIHR5cGVcbiAgICAgICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9CWVRFOlxuICAgICAgICAgICAgXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlRfNV82XzU6XG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9TSE9SVF81XzVfNV8xOlxuICAgICAgICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlRfNF80XzRfNDpcbiAgICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUOlxuICAgICAgICAgIGNhc2UgR0xfSEFMRl9GTE9BVF9PRVM6XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9JTlQ6XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgICBjYXNlIEdMX0ZMT0FUOlxuICAgICAgICAgICAgXG4gICAgICAgICAgICBicmVha1xuXG4gICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIFxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHRoaXMubmVlZHNUcmFuc3Bvc2UgPSBmYWxzZVxuICAgIH0sXG5cbiAgICBzZXREZWZhdWx0Rm9ybWF0OiBmdW5jdGlvbiAoKSB7XG4gICAgICB0aGlzLmZvcm1hdCA9IHRoaXMuaW50ZXJuYWxmb3JtYXQgPSBHTF9SR0JBXG4gICAgICB0aGlzLnR5cGUgPSBHTF9VTlNJR05FRF9CWVRFXG4gICAgICB0aGlzLmNoYW5uZWxzID0gNFxuICAgICAgdGhpcy5jb21wcmVzc2VkID0gZmFsc2VcbiAgICB9LFxuXG4gICAgdXBsb2FkOiBmdW5jdGlvbiAocGFyYW1zKSB7XG4gICAgICBnbC5waXhlbFN0b3JlaShHTF9VTlBBQ0tfRkxJUF9ZX1dFQkdMLCB0aGlzLmZsaXBZKVxuICAgICAgZ2wucGl4ZWxTdG9yZWkoR0xfVU5QQUNLX1BSRU1VTFRJUExZX0FMUEhBX1dFQkdMLCB0aGlzLnByZW11bHRpcGx5QWxwaGEpXG4gICAgICBnbC5waXhlbFN0b3JlaShHTF9VTlBBQ0tfQ09MT1JTUEFDRV9DT05WRVJTSU9OX1dFQkdMLCB0aGlzLmNvbG9yU3BhY2UpXG4gICAgICBnbC5waXhlbFN0b3JlaShHTF9VTlBBQ0tfQUxJR05NRU5ULCB0aGlzLnVucGFja0FsaWdubWVudClcblxuICAgICAgdmFyIHRhcmdldCA9IHRoaXMudGFyZ2V0XG4gICAgICB2YXIgbWlwbGV2ZWwgPSB0aGlzLm1pcGxldmVsXG4gICAgICB2YXIgaW1hZ2UgPSB0aGlzLmltYWdlXG4gICAgICB2YXIgY2FudmFzID0gdGhpcy5jYW52YXNcbiAgICAgIHZhciB2aWRlbyA9IHRoaXMudmlkZW9cbiAgICAgIHZhciBkYXRhID0gdGhpcy5kYXRhXG4gICAgICB2YXIgaW50ZXJuYWxmb3JtYXQgPSB0aGlzLmludGVybmFsZm9ybWF0XG4gICAgICB2YXIgZm9ybWF0ID0gdGhpcy5mb3JtYXRcbiAgICAgIHZhciB0eXBlID0gdGhpcy50eXBlXG4gICAgICB2YXIgd2lkdGggPSB0aGlzLndpZHRoIHx8IE1hdGgubWF4KDEsIHBhcmFtcy53aWR0aCA+PiBtaXBsZXZlbClcbiAgICAgIHZhciBoZWlnaHQgPSB0aGlzLmhlaWdodCB8fCBNYXRoLm1heCgxLCBwYXJhbXMuaGVpZ2h0ID4+IG1pcGxldmVsKVxuICAgICAgaWYgKHZpZGVvICYmIHZpZGVvLnJlYWR5U3RhdGUgPiAyKSB7XG4gICAgICAgIGdsLnRleEltYWdlMkQodGFyZ2V0LCBtaXBsZXZlbCwgZm9ybWF0LCBmb3JtYXQsIHR5cGUsIHZpZGVvKVxuICAgICAgfSBlbHNlIGlmIChpbWFnZSAmJiBpbWFnZS5jb21wbGV0ZSkge1xuICAgICAgICBnbC50ZXhJbWFnZTJEKHRhcmdldCwgbWlwbGV2ZWwsIGZvcm1hdCwgZm9ybWF0LCB0eXBlLCBpbWFnZSlcbiAgICAgIH0gZWxzZSBpZiAoY2FudmFzKSB7XG4gICAgICAgIGdsLnRleEltYWdlMkQodGFyZ2V0LCBtaXBsZXZlbCwgZm9ybWF0LCBmb3JtYXQsIHR5cGUsIGNhbnZhcylcbiAgICAgIH0gZWxzZSBpZiAodGhpcy5jb21wcmVzc2VkKSB7XG4gICAgICAgIGdsLmNvbXByZXNzZWRUZXhJbWFnZTJEKHRhcmdldCwgbWlwbGV2ZWwsIGludGVybmFsZm9ybWF0LCB3aWR0aCwgaGVpZ2h0LCAwLCBkYXRhKVxuICAgICAgfSBlbHNlIGlmICh0aGlzLmNvcHkpIHtcbiAgICAgICAgcmVnbFBvbGwoKVxuICAgICAgICBnbC5jb3B5VGV4SW1hZ2UyRCh0YXJnZXQsIG1pcGxldmVsLCBmb3JtYXQsIHRoaXMueCwgdGhpcy55LCB3aWR0aCwgaGVpZ2h0LCAwKVxuICAgICAgfSBlbHNlIGlmIChkYXRhKSB7XG4gICAgICAgIGdsLnRleEltYWdlMkQodGFyZ2V0LCBtaXBsZXZlbCwgZm9ybWF0LCB3aWR0aCwgaGVpZ2h0LCAwLCBmb3JtYXQsIHR5cGUsIGRhdGEpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBnbC50ZXhJbWFnZTJEKHRhcmdldCwgbWlwbGV2ZWwsIGZvcm1hdCwgd2lkdGggfHwgMSwgaGVpZ2h0IHx8IDEsIDAsIGZvcm1hdCwgdHlwZSwgbnVsbClcbiAgICAgIH1cbiAgICB9XG4gIH0pXG5cbiAgZnVuY3Rpb24gVGV4UGFyYW1zICh0YXJnZXQpIHtcbiAgICB0aGlzLnRhcmdldCA9IHRhcmdldFxuXG4gICAgLy8gRGVmYXVsdCBpbWFnZSBzaGFwZSBpbmZvXG4gICAgdGhpcy53aWR0aCA9IDBcbiAgICB0aGlzLmhlaWdodCA9IDBcbiAgICB0aGlzLmZvcm1hdCA9IDBcbiAgICB0aGlzLmludGVybmFsZm9ybWF0ID0gMFxuICAgIHRoaXMudHlwZSA9IDBcblxuICAgIC8vIHdyYXAgbW9kZVxuICAgIHRoaXMud3JhcFMgPSBHTF9DTEFNUF9UT19FREdFXG4gICAgdGhpcy53cmFwVCA9IEdMX0NMQU1QX1RPX0VER0VcblxuICAgIC8vIGZpbHRlcmluZ1xuICAgIHRoaXMubWluRmlsdGVyID0gMFxuICAgIHRoaXMubWFnRmlsdGVyID0gR0xfTkVBUkVTVFxuICAgIHRoaXMuYW5pc290cm9waWMgPSAxXG5cbiAgICAvLyBtaXBtYXBzXG4gICAgdGhpcy5nZW5NaXBtYXBzID0gZmFsc2VcbiAgICB0aGlzLm1pcG1hcEhpbnQgPSBHTF9ET05UX0NBUkVcbiAgfVxuXG4gIGV4dGVuZChUZXhQYXJhbXMucHJvdG90eXBlLCB7XG4gICAgcGFyc2U6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbnMgIT09ICdvYmplY3QnIHx8ICFvcHRpb25zKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuXG4gICAgICBpZiAoJ21pbicgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgbWluRmlsdGVyID0gb3B0aW9ucy5taW5cbiAgICAgICAgXG4gICAgICAgIHRoaXMubWluRmlsdGVyID0gbWluRmlsdGVyc1ttaW5GaWx0ZXJdXG4gICAgICB9XG5cbiAgICAgIGlmICgnbWFnJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBtYWdGaWx0ZXIgPSBvcHRpb25zLm1hZ1xuICAgICAgICBcbiAgICAgICAgdGhpcy5tYWdGaWx0ZXIgPSBtYWdGaWx0ZXJzW21hZ0ZpbHRlcl1cbiAgICAgIH1cblxuICAgICAgdmFyIHdyYXBTID0gdGhpcy53cmFwU1xuICAgICAgdmFyIHdyYXBUID0gdGhpcy53cmFwVFxuICAgICAgaWYgKCd3cmFwJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciB3cmFwID0gb3B0aW9ucy53cmFwXG4gICAgICAgIGlmICh0eXBlb2Ygd3JhcCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICBcbiAgICAgICAgICB3cmFwUyA9IHdyYXBUID0gd3JhcE1vZGVzW3dyYXBdXG4gICAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheSh3cmFwKSkge1xuICAgICAgICAgIFxuICAgICAgICAgIFxuICAgICAgICAgIHdyYXBTID0gd3JhcE1vZGVzW3dyYXBbMF1dXG4gICAgICAgICAgd3JhcFQgPSB3cmFwTW9kZXNbd3JhcFsxXV1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKCd3cmFwUycgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHZhciBvcHRXcmFwUyA9IG9wdGlvbnMud3JhcFNcbiAgICAgICAgICBcbiAgICAgICAgICB3cmFwUyA9IHdyYXBNb2Rlc1tvcHRXcmFwU11cbiAgICAgICAgfVxuICAgICAgICBpZiAoJ3dyYXBUJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgdmFyIG9wdFdyYXBUID0gb3B0aW9ucy53cmFwVFxuICAgICAgICAgIFxuICAgICAgICAgIHdyYXBUID0gd3JhcE1vZGVzW29wdFdyYXBUXVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICB0aGlzLndyYXBTID0gd3JhcFNcbiAgICAgIHRoaXMud3JhcFQgPSB3cmFwVFxuXG4gICAgICBpZiAoJ2FuaXNvdHJvcGljJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBhbmlzb3Ryb3BpYyA9IG9wdGlvbnMuYW5pc290cm9waWNcbiAgICAgICAgXG4gICAgICAgIHRoaXMuYW5pc290cm9waWMgPSBvcHRpb25zLmFuaXNvdHJvcGljXG4gICAgICB9XG5cbiAgICAgIGlmICgnbWlwbWFwJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBtaXBtYXAgPSBvcHRpb25zLm1pcG1hcFxuICAgICAgICBzd2l0Y2ggKHR5cGVvZiBtaXBtYXApIHtcbiAgICAgICAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgICAgICAgXG4gICAgICAgICAgICB0aGlzLm1pcG1hcEhpbnQgPSBtaXBtYXBIaW50W21pcG1hcF1cbiAgICAgICAgICAgIHRoaXMuZ2VuTWlwbWFwcyA9IHRydWVcbiAgICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgICBjYXNlICdib29sZWFuJzpcbiAgICAgICAgICAgIHRoaXMuZ2VuTWlwbWFwcyA9ICEhbWlwbWFwXG4gICAgICAgICAgICBicmVha1xuXG4gICAgICAgICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuXG4gICAgdXBsb2FkOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgdGFyZ2V0ID0gdGhpcy50YXJnZXRcbiAgICAgIGdsLnRleFBhcmFtZXRlcmkodGFyZ2V0LCBHTF9URVhUVVJFX01JTl9GSUxURVIsIHRoaXMubWluRmlsdGVyKVxuICAgICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfTUFHX0ZJTFRFUiwgdGhpcy5tYWdGaWx0ZXIpXG4gICAgICBnbC50ZXhQYXJhbWV0ZXJpKHRhcmdldCwgR0xfVEVYVFVSRV9XUkFQX1MsIHRoaXMud3JhcFMpXG4gICAgICBnbC50ZXhQYXJhbWV0ZXJpKHRhcmdldCwgR0xfVEVYVFVSRV9XUkFQX1QsIHRoaXMud3JhcFQpXG4gICAgICBpZiAoZXh0ZW5zaW9ucy5leHRfdGV4dHVyZV9maWx0ZXJfYW5pc290cm9waWMpIHtcbiAgICAgICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfTUFYX0FOSVNPVFJPUFlfRVhULCB0aGlzLmFuaXNvdHJvcGljKVxuICAgICAgfVxuICAgICAgaWYgKHRoaXMuZ2VuTWlwbWFwcykge1xuICAgICAgICBnbC5oaW50KEdMX0dFTkVSQVRFX01JUE1BUF9ISU5ULCB0aGlzLm1pcG1hcEhpbnQpXG4gICAgICAgIGdsLmdlbmVyYXRlTWlwbWFwKHRhcmdldClcbiAgICAgIH1cbiAgICB9XG4gIH0pXG5cbiAgLy8gRmluYWwgcGFzcyB0byBtZXJnZSBwYXJhbXMgYW5kIHBpeGVsIGRhdGFcbiAgZnVuY3Rpb24gY2hlY2tUZXh0dXJlQ29tcGxldGUgKHBhcmFtcywgcGl4ZWxzKSB7XG4gICAgdmFyIGksIHBpeG1hcFxuXG4gICAgdmFyIHR5cGUgPSAwXG4gICAgdmFyIGZvcm1hdCA9IDBcbiAgICB2YXIgaW50ZXJuYWxmb3JtYXQgPSAwXG4gICAgdmFyIHdpZHRoID0gMFxuICAgIHZhciBoZWlnaHQgPSAwXG4gICAgdmFyIGNoYW5uZWxzID0gMFxuICAgIHZhciBjb21wcmVzc2VkID0gZmFsc2VcbiAgICB2YXIgbmVlZHNQb2xsID0gZmFsc2VcbiAgICB2YXIgbmVlZHNMaXN0ZW5lcnMgPSBmYWxzZVxuICAgIHZhciBtaXBNYXNrMkQgPSAwXG4gICAgdmFyIG1pcE1hc2tDdWJlID0gWzAsIDAsIDAsIDAsIDAsIDBdXG4gICAgdmFyIGN1YmVNYXNrID0gMFxuICAgIHZhciBoYXNNaXAgPSBmYWxzZVxuICAgIGZvciAoaSA9IDA7IGkgPCBwaXhlbHMubGVuZ3RoOyArK2kpIHtcbiAgICAgIHBpeG1hcCA9IHBpeGVsc1tpXVxuICAgICAgd2lkdGggPSB3aWR0aCB8fCAocGl4bWFwLndpZHRoIDw8IHBpeG1hcC5taXBsZXZlbClcbiAgICAgIGhlaWdodCA9IGhlaWdodCB8fCAocGl4bWFwLmhlaWdodCA8PCBwaXhtYXAubWlwbGV2ZWwpXG4gICAgICB0eXBlID0gdHlwZSB8fCBwaXhtYXAudHlwZVxuICAgICAgZm9ybWF0ID0gZm9ybWF0IHx8IHBpeG1hcC5mb3JtYXRcbiAgICAgIGludGVybmFsZm9ybWF0ID0gaW50ZXJuYWxmb3JtYXQgfHwgcGl4bWFwLmludGVybmFsZm9ybWF0XG4gICAgICBjaGFubmVscyA9IGNoYW5uZWxzIHx8IHBpeG1hcC5jaGFubmVsc1xuICAgICAgbmVlZHNQb2xsID0gbmVlZHNQb2xsIHx8IHBpeG1hcC5uZWVkc1BvbGxcbiAgICAgIG5lZWRzTGlzdGVuZXJzID0gbmVlZHNMaXN0ZW5lcnMgfHwgcGl4bWFwLm5lZWRzTGlzdGVuZXJzXG4gICAgICBjb21wcmVzc2VkID0gY29tcHJlc3NlZCB8fCBwaXhtYXAuY29tcHJlc3NlZFxuXG4gICAgICB2YXIgbWlwbGV2ZWwgPSBwaXhtYXAubWlwbGV2ZWxcbiAgICAgIHZhciB0YXJnZXQgPSBwaXhtYXAudGFyZ2V0XG4gICAgICBoYXNNaXAgPSBoYXNNaXAgfHwgKG1pcGxldmVsID4gMClcbiAgICAgIGlmICh0YXJnZXQgPT09IEdMX1RFWFRVUkVfMkQpIHtcbiAgICAgICAgbWlwTWFzazJEIHw9ICgxIDw8IG1pcGxldmVsKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIGZhY2UgPSB0YXJnZXQgLSBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1hcbiAgICAgICAgbWlwTWFza0N1YmVbZmFjZV0gfD0gKDEgPDwgbWlwbGV2ZWwpXG4gICAgICAgIGN1YmVNYXNrIHw9ICgxIDw8IGZhY2UpXG4gICAgICB9XG4gICAgfVxuXG4gICAgcGFyYW1zLm5lZWRzUG9sbCA9IG5lZWRzUG9sbFxuICAgIHBhcmFtcy5uZWVkc0xpc3RlbmVycyA9IG5lZWRzTGlzdGVuZXJzXG4gICAgcGFyYW1zLndpZHRoID0gd2lkdGhcbiAgICBwYXJhbXMuaGVpZ2h0ID0gaGVpZ2h0XG4gICAgcGFyYW1zLmZvcm1hdCA9IGZvcm1hdFxuICAgIHBhcmFtcy5pbnRlcm5hbGZvcm1hdCA9IGludGVybmFsZm9ybWF0XG4gICAgcGFyYW1zLnR5cGUgPSB0eXBlXG5cbiAgICB2YXIgbWlwTWFzayA9IGhhc01pcCA/ICh3aWR0aCA8PCAxKSAtIDEgOiAxXG4gICAgaWYgKHBhcmFtcy50YXJnZXQgPT09IEdMX1RFWFRVUkVfMkQpIHtcbiAgICAgIFxuICAgICAgXG4gICAgfSBlbHNlIHtcbiAgICAgIFxuICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICBcbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgbWlwRmlsdGVyID0gKE1JUE1BUF9GSUxURVJTLmluZGV4T2YocGFyYW1zLm1pbkZpbHRlcikgPj0gMClcbiAgICBwYXJhbXMuZ2VuTWlwbWFwcyA9ICFoYXNNaXAgJiYgKHBhcmFtcy5nZW5NaXBtYXBzIHx8IG1pcEZpbHRlcilcbiAgICB2YXIgdXNlTWlwbWFwcyA9IGhhc01pcCB8fCBwYXJhbXMuZ2VuTWlwbWFwc1xuXG4gICAgaWYgKCFwYXJhbXMubWluRmlsdGVyKSB7XG4gICAgICBwYXJhbXMubWluRmlsdGVyID0gdXNlTWlwbWFwc1xuICAgICAgICA/IEdMX0xJTkVBUl9NSVBNQVBfTElORUFSXG4gICAgICAgIDogR0xfTkVBUkVTVFxuICAgIH0gZWxzZSB7XG4gICAgICBcbiAgICB9XG5cbiAgICBpZiAodXNlTWlwbWFwcykge1xuICAgICAgXG4gICAgfVxuXG4gICAgaWYgKHBhcmFtcy5nZW5NaXBtYXBzKSB7XG4gICAgICBcbiAgICB9XG5cbiAgICBwYXJhbXMud3JhcFMgPSBwYXJhbXMud3JhcFMgfHwgR0xfQ0xBTVBfVE9fRURHRVxuICAgIHBhcmFtcy53cmFwVCA9IHBhcmFtcy53cmFwVCB8fCBHTF9DTEFNUF9UT19FREdFXG4gICAgaWYgKHBhcmFtcy53cmFwUyAhPT0gR0xfQ0xBTVBfVE9fRURHRSB8fFxuICAgICAgICBwYXJhbXMud3JhcFQgIT09IEdMX0NMQU1QX1RPX0VER0UpIHtcbiAgICAgIFxuICAgIH1cblxuICAgIGlmICgodHlwZSA9PT0gR0xfRkxPQVQgJiYgIWV4dGVuc2lvbnMub2VzX3RleHR1cmVfZmxvYXRfbGluZWFyKSB8fFxuICAgICAgICAodHlwZSA9PT0gR0xfSEFMRl9GTE9BVF9PRVMgJiZcbiAgICAgICAgICAhZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9oYWxmX2Zsb2F0X2xpbmVhcikpIHtcbiAgICAgIFxuICAgIH1cblxuICAgIGZvciAoaSA9IDA7IGkgPCBwaXhlbHMubGVuZ3RoOyArK2kpIHtcbiAgICAgIHBpeG1hcCA9IHBpeGVsc1tpXVxuICAgICAgdmFyIGxldmVsID0gcGl4bWFwLm1pcGxldmVsXG4gICAgICBpZiAocGl4bWFwLndpZHRoKSB7XG4gICAgICAgIFxuICAgICAgfVxuICAgICAgaWYgKHBpeG1hcC5oZWlnaHQpIHtcbiAgICAgICAgXG4gICAgICB9XG4gICAgICBpZiAocGl4bWFwLmNoYW5uZWxzKSB7XG4gICAgICAgIFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGl4bWFwLmNoYW5uZWxzID0gY2hhbm5lbHNcbiAgICAgIH1cbiAgICAgIGlmIChwaXhtYXAuZm9ybWF0KSB7XG4gICAgICAgIFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGl4bWFwLmZvcm1hdCA9IGZvcm1hdFxuICAgICAgfVxuICAgICAgaWYgKHBpeG1hcC5pbnRlcm5hbGZvcm1hdCkge1xuICAgICAgICBcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBpeG1hcC5pbnRlcm5hbGZvcm1hdCA9IGludGVybmFsZm9ybWF0XG4gICAgICB9XG4gICAgICBpZiAocGl4bWFwLnR5cGUpIHtcbiAgICAgICAgXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwaXhtYXAudHlwZSA9IHR5cGVcbiAgICAgIH1cbiAgICAgIGlmIChwaXhtYXAuY29weSkge1xuICAgICAgICBcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICB2YXIgYWN0aXZlVGV4dHVyZSA9IDBcbiAgdmFyIHRleHR1cmVDb3VudCA9IDBcbiAgdmFyIHRleHR1cmVTZXQgPSB7fVxuICB2YXIgcG9sbFNldCA9IFtdXG4gIHZhciBudW1UZXhVbml0cyA9IGxpbWl0cy5tYXhUZXh0dXJlVW5pdHNcbiAgdmFyIHRleHR1cmVVbml0cyA9IEFycmF5KG51bVRleFVuaXRzKS5tYXAoZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBudWxsXG4gIH0pXG5cbiAgZnVuY3Rpb24gUkVHTFRleHR1cmUgKHRhcmdldCkge1xuICAgIHRoaXMuaWQgPSB0ZXh0dXJlQ291bnQrK1xuICAgIHRoaXMucmVmQ291bnQgPSAxXG5cbiAgICB0aGlzLnRhcmdldCA9IHRhcmdldFxuICAgIHRoaXMudGV4dHVyZSA9IG51bGxcblxuICAgIHRoaXMucG9sbElkID0gLTFcblxuICAgIHRoaXMudW5pdCA9IC0xXG4gICAgdGhpcy5iaW5kQ291bnQgPSAwXG5cbiAgICAvLyBjYW5jZWxzIGFsbCBwZW5kaW5nIGNhbGxiYWNrc1xuICAgIHRoaXMuY2FuY2VsUGVuZGluZyA9IG51bGxcblxuICAgIC8vIHBhcnNlZCB1c2VyIGlucHV0c1xuICAgIHRoaXMucGFyYW1zID0gbmV3IFRleFBhcmFtcyh0YXJnZXQpXG4gICAgdGhpcy5waXhlbHMgPSBbXVxuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlICh0ZXh0dXJlLCBvcHRpb25zKSB7XG4gICAgdmFyIGlcbiAgICBjbGVhckxpc3RlbmVycyh0ZXh0dXJlKVxuXG4gICAgLy8gQ2xlYXIgcGFyYW1ldGVycyBhbmQgcGl4ZWwgZGF0YVxuICAgIHZhciBwYXJhbXMgPSB0ZXh0dXJlLnBhcmFtc1xuICAgIFRleFBhcmFtcy5jYWxsKHBhcmFtcywgdGV4dHVyZS50YXJnZXQpXG4gICAgdmFyIHBpeGVscyA9IHRleHR1cmUucGl4ZWxzXG4gICAgcGl4ZWxzLmxlbmd0aCA9IDBcblxuICAgIC8vIHBhcnNlIHBhcmFtZXRlcnNcbiAgICBwYXJhbXMucGFyc2Uob3B0aW9ucylcblxuICAgIC8vIHBhcnNlIHBpeGVsIGRhdGFcbiAgICBmdW5jdGlvbiBwYXJzZU1pcCAodGFyZ2V0LCBkYXRhKSB7XG4gICAgICB2YXIgbWlwbWFwID0gZGF0YS5taXBtYXBcbiAgICAgIHZhciBwaXhtYXBcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KG1pcG1hcCkpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBtaXBtYXAubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICBwaXhtYXAgPSBuZXcgUGl4ZWxJbmZvKHRhcmdldClcbiAgICAgICAgICBwaXhtYXAucGFyc2VGbGFncyhvcHRpb25zKVxuICAgICAgICAgIHBpeG1hcC5wYXJzZUZsYWdzKGRhdGEpXG4gICAgICAgICAgcGl4bWFwLnBhcnNlKG1pcG1hcFtpXSwgaSlcbiAgICAgICAgICBwaXhlbHMucHVzaChwaXhtYXApXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBpeG1hcCA9IG5ldyBQaXhlbEluZm8odGFyZ2V0KVxuICAgICAgICBwaXhtYXAucGFyc2VGbGFncyhvcHRpb25zKVxuICAgICAgICBwaXhtYXAucGFyc2UoZGF0YSwgMClcbiAgICAgICAgcGl4ZWxzLnB1c2gocGl4bWFwKVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAodGV4dHVyZS50YXJnZXQgPT09IEdMX1RFWFRVUkVfMkQpIHtcbiAgICAgIHBhcnNlTWlwKEdMX1RFWFRVUkVfMkQsIG9wdGlvbnMpXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBmYWNlcyA9IG9wdGlvbnMuZmFjZXMgfHwgb3B0aW9uc1xuICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZmFjZXMpKSB7XG4gICAgICAgIFxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgICAgcGFyc2VNaXAoR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YICsgaSwgZmFjZXNbaV0pXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZhY2VzID09PSAnc3RyaW5nJykge1xuICAgICAgICAvLyBUT0RPIFJlYWQgZGRzXG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBJbml0aWFsaXplIHRvIGFsbCBlbXB0eSB0ZXh0dXJlc1xuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgICAgcGFyc2VNaXAoR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YICsgaSwge30pXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBkbyBhIHNlY29uZCBwYXNzIHRvIHJlY29uY2lsZSBkZWZhdWx0c1xuICAgIGNoZWNrVGV4dHVyZUNvbXBsZXRlKHBhcmFtcywgcGl4ZWxzKVxuXG4gICAgaWYgKHBhcmFtcy5uZWVkc0xpc3RlbmVycykge1xuICAgICAgaG9va0xpc3RlbmVycyh0ZXh0dXJlKVxuICAgIH1cblxuICAgIGlmIChwYXJhbXMubmVlZHNQb2xsKSB7XG4gICAgICB0ZXh0dXJlLnBvbGxJZCA9IHBvbGxTZXQubGVuZ3RoXG4gICAgICBwb2xsU2V0LnB1c2godGV4dHVyZSlcbiAgICB9XG5cbiAgICByZWZyZXNoKHRleHR1cmUpXG4gIH1cblxuICBmdW5jdGlvbiByZWZyZXNoICh0ZXh0dXJlKSB7XG4gICAgaWYgKCFnbC5pc1RleHR1cmUodGV4dHVyZS50ZXh0dXJlKSkge1xuICAgICAgdGV4dHVyZS50ZXh0dXJlID0gZ2wuY3JlYXRlVGV4dHVyZSgpXG4gICAgfVxuXG4gICAgLy8gTGF6eSBiaW5kXG4gICAgdmFyIHRhcmdldCA9IHRleHR1cmUudGFyZ2V0XG4gICAgdmFyIHVuaXQgPSB0ZXh0dXJlLnVuaXRcbiAgICBpZiAodW5pdCA+PSAwKSB7XG4gICAgICBnbC5hY3RpdmVUZXh0dXJlKEdMX1RFWFRVUkUwICsgdW5pdClcbiAgICAgIGFjdGl2ZVRleHR1cmUgPSB1bml0XG4gICAgfSBlbHNlIHtcbiAgICAgIGdsLmJpbmRUZXh0dXJlKHRhcmdldCwgdGV4dHVyZS50ZXh0dXJlKVxuICAgIH1cblxuICAgIC8vIFVwbG9hZFxuICAgIHZhciBwaXhlbHMgPSB0ZXh0dXJlLnBpeGVsc1xuICAgIHZhciBwYXJhbXMgPSB0ZXh0dXJlLnBhcmFtc1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcGl4ZWxzLmxlbmd0aDsgKytpKSB7XG4gICAgICBwaXhlbHNbaV0udXBsb2FkKHBhcmFtcylcbiAgICB9XG4gICAgcGFyYW1zLnVwbG9hZCgpXG5cbiAgICAvLyBMYXp5IHVuYmluZFxuICAgIGlmICh1bml0IDwgMCkge1xuICAgICAgdmFyIGFjdGl2ZSA9IHRleHR1cmVVbml0c1thY3RpdmVUZXh0dXJlXVxuICAgICAgaWYgKGFjdGl2ZSkge1xuICAgICAgICAvLyByZXN0b3JlIGJpbmRpbmcgc3RhdGVcbiAgICAgICAgZ2wuYmluZFRleHR1cmUoYWN0aXZlLnRhcmdldCwgYWN0aXZlLnRleHR1cmUpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBvdGhlcndpc2UgYmVjb21lIG5ldyBhY3RpdmVcbiAgICAgICAgdGV4dHVyZS51bml0ID0gYWN0aXZlVGV4dHVyZVxuICAgICAgICB0ZXh0dXJlVW5pdHNbYWN0aXZlVGV4dHVyZV0gPSB0ZXh0dXJlXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaG9va0xpc3RlbmVycyAodGV4dHVyZSkge1xuICAgIHZhciBwYXJhbXMgPSB0ZXh0dXJlLnBhcmFtc1xuICAgIHZhciBwaXhlbHMgPSB0ZXh0dXJlLnBpeGVsc1xuXG4gICAgLy8gQXBwZW5kcyBhbGwgdGhlIHRleHR1cmUgZGF0YSBmcm9tIHRoZSBidWZmZXIgdG8gdGhlIGN1cnJlbnRcbiAgICBmdW5jdGlvbiBhcHBlbmRERFMgKHRhcmdldCwgbWlwbGV2ZWwsIGJ1ZmZlcikge1xuICAgICAgdmFyIGRkcyA9IHBhcnNlRERTKGJ1ZmZlcilcblxuICAgICAgXG5cbiAgICAgIGlmIChkZHMuY3ViZSkge1xuICAgICAgICBcblxuICAgICAgICAvLyBUT0RPIGhhbmRsZSBjdWJlIG1hcCBERFNcbiAgICAgICAgXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBcbiAgICAgIH1cblxuICAgICAgaWYgKG1pcGxldmVsKSB7XG4gICAgICAgIFxuICAgICAgfVxuXG4gICAgICBkZHMucGl4ZWxzLmZvckVhY2goZnVuY3Rpb24gKHBpeG1hcCkge1xuICAgICAgICB2YXIgaW5mbyA9IG5ldyBQaXhlbEluZm8oZGRzLmN1YmUgPyBwaXhtYXAudGFyZ2V0IDogdGFyZ2V0KVxuXG4gICAgICAgIGluZm8uY2hhbm5lbHMgPSBkZHMuY2hhbm5lbHNcbiAgICAgICAgaW5mby5jb21wcmVzc2VkID0gZGRzLmNvbXByZXNzZWRcbiAgICAgICAgaW5mby50eXBlID0gZGRzLnR5cGVcbiAgICAgICAgaW5mby5pbnRlcm5hbGZvcm1hdCA9IGRkcy5mb3JtYXRcbiAgICAgICAgaW5mby5mb3JtYXQgPSBjb2xvckZvcm1hdHNbZGRzLmZvcm1hdF1cblxuICAgICAgICBpbmZvLndpZHRoID0gcGl4bWFwLndpZHRoXG4gICAgICAgIGluZm8uaGVpZ2h0ID0gcGl4bWFwLmhlaWdodFxuICAgICAgICBpbmZvLm1pcGxldmVsID0gcGl4bWFwLm1pcGxldmVsIHx8IG1pcGxldmVsXG4gICAgICAgIGluZm8uZGF0YSA9IHBpeG1hcC5kYXRhXG5cbiAgICAgICAgcGl4ZWxzLnB1c2goaW5mbylcbiAgICAgIH0pXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gb25EYXRhICgpIHtcbiAgICAgIC8vIFVwZGF0ZSBzaXplIG9mIGFueSBuZXdseSBsb2FkZWQgcGl4ZWxzXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHBpeGVscy5sZW5ndGg7ICsraSkge1xuICAgICAgICB2YXIgcGl4ZWxEYXRhID0gcGl4ZWxzW2ldXG4gICAgICAgIHZhciBpbWFnZSA9IHBpeGVsRGF0YS5pbWFnZVxuICAgICAgICB2YXIgdmlkZW8gPSBwaXhlbERhdGEudmlkZW9cbiAgICAgICAgdmFyIHhociA9IHBpeGVsRGF0YS54aHJcbiAgICAgICAgaWYgKGltYWdlICYmIGltYWdlLmNvbXBsZXRlKSB7XG4gICAgICAgICAgcGl4ZWxEYXRhLndpZHRoID0gaW1hZ2UubmF0dXJhbFdpZHRoXG4gICAgICAgICAgcGl4ZWxEYXRhLmhlaWdodCA9IGltYWdlLm5hdHVyYWxIZWlnaHRcbiAgICAgICAgfSBlbHNlIGlmICh2aWRlbyAmJiB2aWRlby5yZWFkeVN0YXRlID4gMikge1xuICAgICAgICAgIHBpeGVsRGF0YS53aWR0aCA9IHZpZGVvLndpZHRoXG4gICAgICAgICAgcGl4ZWxEYXRhLmhlaWdodCA9IHZpZGVvLmhlaWdodFxuICAgICAgICB9IGVsc2UgaWYgKHhociAmJiB4aHIucmVhZHlTdGF0ZSA9PT0gNCkge1xuICAgICAgICAgIHBpeGVsc1tpXSA9IHBpeGVsc1twaXhlbHMubGVuZ3RoIC0gMV1cbiAgICAgICAgICBwaXhlbHMucG9wKClcbiAgICAgICAgICB4aHIucmVtb3ZlRXZlbnRMaXN0ZW5lcigncmVhZHlzdGF0ZWNoYW5nZScsIHJlZnJlc2gpXG4gICAgICAgICAgYXBwZW5kRERTKHBpeGVsRGF0YS50YXJnZXQsIHBpeGVsRGF0YS5taXBsZXZlbCwgeGhyLnJlc3BvbnNlKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjaGVja1RleHR1cmVDb21wbGV0ZShwYXJhbXMsIHBpeGVscylcbiAgICAgIHJlZnJlc2godGV4dHVyZSlcbiAgICB9XG5cbiAgICBwaXhlbHMuZm9yRWFjaChmdW5jdGlvbiAocGl4ZWxEYXRhKSB7XG4gICAgICBpZiAocGl4ZWxEYXRhLmltYWdlICYmICFwaXhlbERhdGEuaW1hZ2UuY29tcGxldGUpIHtcbiAgICAgICAgcGl4ZWxEYXRhLmltYWdlLmFkZEV2ZW50TGlzdGVuZXIoJ2xvYWQnLCBvbkRhdGEpXG4gICAgICB9IGVsc2UgaWYgKHBpeGVsRGF0YS52aWRlbyAmJiBwaXhlbERhdGEucmVhZHlTdGF0ZSA8IDEpIHtcbiAgICAgICAgcGl4ZWxEYXRhLnZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ3Byb2dyZXNzJywgb25EYXRhKVxuICAgICAgfSBlbHNlIGlmIChwaXhlbERhdGEueGhyKSB7XG4gICAgICAgIHBpeGVsRGF0YS54aHIuYWRkRXZlbnRMaXN0ZW5lcigncmVhZHlzdGF0ZWNoYW5nZScsIG9uRGF0YSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgdGV4dHVyZS5jYW5jZWxQZW5kaW5nID0gZnVuY3Rpb24gZGV0YWNoTGlzdGVuZXJzICgpIHtcbiAgICAgIHBpeGVscy5mb3JFYWNoKGZ1bmN0aW9uIChwaXhlbERhdGEpIHtcbiAgICAgICAgaWYgKHBpeGVsRGF0YS5pbWFnZSkge1xuICAgICAgICAgIHBpeGVsRGF0YS5pbWFnZS5yZW1vdmVFdmVudExpc3RlbmVyKCdsb2FkJywgb25EYXRhKVxuICAgICAgICB9IGVsc2UgaWYgKHBpeGVsRGF0YS52aWRlbykge1xuICAgICAgICAgIHBpeGVsRGF0YS52aWRlby5yZW1vdmVFdmVudExpc3RlbmVyKCdwcm9ncmVzcycsIG9uRGF0YSlcbiAgICAgICAgfSBlbHNlIGlmIChwaXhlbERhdGEueGhyKSB7XG4gICAgICAgICAgcGl4ZWxEYXRhLnhoci5yZW1vdmVFdmVudExpc3RlbmVyKCdyZWFkeXN0YXRlY2hhbmdlJywgb25EYXRhKVxuICAgICAgICAgIHBpeGVsRGF0YS54aHIuYWJvcnQoKVxuICAgICAgICB9XG4gICAgICB9KVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNsZWFyTGlzdGVuZXJzICh0ZXh0dXJlKSB7XG4gICAgdmFyIGNhbmNlbFBlbmRpbmcgPSB0ZXh0dXJlLmNhbmNlbFBlbmRpbmdcbiAgICBpZiAoY2FuY2VsUGVuZGluZykge1xuICAgICAgY2FuY2VsUGVuZGluZygpXG4gICAgICB0ZXh0dXJlLmNhbmNlbFBlbmRpbmcgPSBudWxsXG4gICAgfVxuICAgIHZhciBpZCA9IHRleHR1cmUucG9sbElkXG4gICAgaWYgKGlkID49IDApIHtcbiAgICAgIHZhciBvdGhlciA9IHBvbGxTZXRbaWRdID0gcG9sbFNldFtwb2xsU2V0Lmxlbmd0aCAtIDFdXG4gICAgICBvdGhlci5pZCA9IGlkXG4gICAgICBwb2xsU2V0LnBvcCgpXG4gICAgICB0ZXh0dXJlLnBvbGxJZCA9IC0xXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSAodGV4dHVyZSkge1xuICAgIHZhciBoYW5kbGUgPSB0ZXh0dXJlLnRleHR1cmVcbiAgICBcbiAgICB2YXIgdW5pdCA9IHRleHR1cmUudW5pdFxuICAgIHZhciB0YXJnZXQgPSB0ZXh0dXJlLnRhcmdldFxuICAgIGlmICh1bml0ID49IDApIHtcbiAgICAgIGdsLmFjdGl2ZVRleHR1cmUoR0xfVEVYVFVSRTAgKyB1bml0KVxuICAgICAgYWN0aXZlVGV4dHVyZSA9IHVuaXRcbiAgICAgIGdsLmJpbmRUZXh0dXJlKHRhcmdldCwgbnVsbClcbiAgICAgIHRleHR1cmVVbml0c1t1bml0XSA9IG51bGxcbiAgICB9XG4gICAgY2xlYXJMaXN0ZW5lcnModGV4dHVyZSlcbiAgICBpZiAoZ2wuaXNUZXh0dXJlKGhhbmRsZSkpIHtcbiAgICAgIGdsLmRlbGV0ZVRleHR1cmUoaGFuZGxlKVxuICAgIH1cbiAgICB0ZXh0dXJlLnRleHR1cmUgPSBudWxsXG4gICAgdGV4dHVyZS5wYXJhbXMgPSBudWxsXG4gICAgdGV4dHVyZS5waXhlbHMgPSBudWxsXG4gICAgdGV4dHVyZS5yZWZDb3VudCA9IDBcbiAgICBkZWxldGUgdGV4dHVyZVNldFt0ZXh0dXJlLmlkXVxuICB9XG5cbiAgZXh0ZW5kKFJFR0xUZXh0dXJlLnByb3RvdHlwZSwge1xuICAgIGJpbmQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciB0ZXh0dXJlID0gdGhpc1xuICAgICAgdGV4dHVyZS5iaW5kQ291bnQgKz0gMVxuICAgICAgdmFyIHVuaXQgPSB0ZXh0dXJlLnVuaXRcbiAgICAgIGlmICh1bml0IDwgMCkge1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG51bVRleFVuaXRzOyArK2kpIHtcbiAgICAgICAgICB2YXIgb3RoZXIgPSB0ZXh0dXJlVW5pdHNbaV1cbiAgICAgICAgICBpZiAob3RoZXIpIHtcbiAgICAgICAgICAgIGlmIChvdGhlci5iaW5kQ291bnQgPiAwKSB7XG4gICAgICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBvdGhlci51bml0ID0gLTFcbiAgICAgICAgICB9XG4gICAgICAgICAgdGV4dHVyZVVuaXRzW2ldID0gdGV4dHVyZVxuICAgICAgICAgIHVuaXQgPSBpXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgfVxuICAgICAgICBpZiAodW5pdCA+PSBudW1UZXhVbml0cykge1xuICAgICAgICAgIFxuICAgICAgICB9XG4gICAgICAgIHRleHR1cmUudW5pdCA9IHVuaXRcbiAgICAgICAgZ2wuYWN0aXZlVGV4dHVyZShHTF9URVhUVVJFMCArIHVuaXQpXG4gICAgICAgIGdsLmJpbmRUZXh0dXJlKHRleHR1cmUudGFyZ2V0LCB0ZXh0dXJlLnRleHR1cmUpXG4gICAgICAgIGFjdGl2ZVRleHR1cmUgPSB1bml0XG4gICAgICB9XG4gICAgICByZXR1cm4gdW5pdFxuICAgIH0sXG5cbiAgICB1bmJpbmQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHRoaXMuYmluZENvdW50IC09IDFcbiAgICB9LFxuXG4gICAgZGVjUmVmOiBmdW5jdGlvbiAoKSB7XG4gICAgICBpZiAoLS10aGlzLnJlZkNvdW50ID09PSAwKSB7XG4gICAgICAgIGRlc3Ryb3kodGhpcylcbiAgICAgIH1cbiAgICB9XG4gIH0pXG5cbiAgZnVuY3Rpb24gY3JlYXRlVGV4dHVyZSAob3B0aW9ucywgdGFyZ2V0KSB7XG4gICAgdmFyIHRleHR1cmUgPSBuZXcgUkVHTFRleHR1cmUodGFyZ2V0KVxuICAgIHRleHR1cmVTZXRbdGV4dHVyZS5pZF0gPSB0ZXh0dXJlXG5cbiAgICBmdW5jdGlvbiByZWdsVGV4dHVyZSAoYTAsIGExLCBhMiwgYTMsIGE0LCBhNSkge1xuICAgICAgdmFyIG9wdGlvbnMgPSBhMCB8fCB7fVxuICAgICAgaWYgKHRhcmdldCA9PT0gR0xfVEVYVFVSRV9DVUJFX01BUCAmJiBhcmd1bWVudHMubGVuZ3RoID09PSA2KSB7XG4gICAgICAgIG9wdGlvbnMgPSBbYTAsIGExLCBhMiwgYTMsIGE0LCBhNV1cbiAgICAgIH1cbiAgICAgIHVwZGF0ZSh0ZXh0dXJlLCBvcHRpb25zKVxuICAgICAgcmVnbFRleHR1cmUud2lkdGggPSB0ZXh0dXJlLnBhcmFtcy53aWR0aFxuICAgICAgcmVnbFRleHR1cmUuaGVpZ2h0ID0gdGV4dHVyZS5wYXJhbXMuaGVpZ2h0XG4gICAgICByZXR1cm4gcmVnbFRleHR1cmVcbiAgICB9XG5cbiAgICByZWdsVGV4dHVyZShvcHRpb25zKVxuXG4gICAgcmVnbFRleHR1cmUuX3JlZ2xUeXBlID0gJ3RleHR1cmUnXG4gICAgcmVnbFRleHR1cmUuX3RleHR1cmUgPSB0ZXh0dXJlXG4gICAgcmVnbFRleHR1cmUuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHRleHR1cmUuZGVjUmVmKClcbiAgICB9XG5cbiAgICByZXR1cm4gcmVnbFRleHR1cmVcbiAgfVxuXG4gIC8vIENhbGxlZCBhZnRlciBjb250ZXh0IHJlc3RvcmVcbiAgZnVuY3Rpb24gcmVmcmVzaFRleHR1cmVzICgpIHtcbiAgICB2YWx1ZXModGV4dHVyZVNldCkuZm9yRWFjaChyZWZyZXNoKVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbnVtVGV4VW5pdHM7ICsraSkge1xuICAgICAgdGV4dHVyZVVuaXRzW2ldID0gbnVsbFxuICAgIH1cbiAgICBhY3RpdmVUZXh0dXJlID0gMFxuICAgIGdsLmFjdGl2ZVRleHR1cmUoR0xfVEVYVFVSRTApXG4gIH1cblxuICAvLyBDYWxsZWQgd2hlbiByZWdsIGlzIGRlc3Ryb3llZFxuICBmdW5jdGlvbiBkZXN0cm95VGV4dHVyZXMgKCkge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbnVtVGV4VW5pdHM7ICsraSkge1xuICAgICAgZ2wuYWN0aXZlVGV4dHVyZShHTF9URVhUVVJFMCArIGkpXG4gICAgICBnbC5iaW5kVGV4dHVyZShHTF9URVhUVVJFXzJELCBudWxsKVxuICAgICAgdGV4dHVyZVVuaXRzW2ldID0gbnVsbFxuICAgIH1cbiAgICBnbC5hY3RpdmVUZXh0dXJlKEdMX1RFWFRVUkUwKVxuICAgIGFjdGl2ZVRleHR1cmUgPSAwXG4gICAgdmFsdWVzKHRleHR1cmVTZXQpLmZvckVhY2goZGVzdHJveSlcbiAgfVxuXG4gIC8vIENhbGxlZCBvbmNlIHBlciByYWYsIHVwZGF0ZXMgdmlkZW8gdGV4dHVyZXNcbiAgZnVuY3Rpb24gcG9sbFRleHR1cmVzICgpIHtcbiAgICBwb2xsU2V0LmZvckVhY2gocmVmcmVzaClcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY3JlYXRlOiBjcmVhdGVUZXh0dXJlLFxuICAgIHJlZnJlc2g6IHJlZnJlc2hUZXh0dXJlcyxcbiAgICBjbGVhcjogZGVzdHJveVRleHR1cmVzLFxuICAgIHBvbGw6IHBvbGxUZXh0dXJlcyxcbiAgICBnZXRUZXh0dXJlOiBmdW5jdGlvbiAod3JhcHBlcikge1xuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcFVuaWZvcm1TdGF0ZSAoc3RyaW5nU3RvcmUpIHtcbiAgdmFyIHVuaWZvcm1TdGF0ZSA9IHt9XG5cbiAgZnVuY3Rpb24gZGVmVW5pZm9ybSAobmFtZSkge1xuICAgIHZhciBpZCA9IHN0cmluZ1N0b3JlLmlkKG5hbWUpXG4gICAgdmFyIHJlc3VsdCA9IHVuaWZvcm1TdGF0ZVtpZF1cbiAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgcmVzdWx0ID0gdW5pZm9ybVN0YXRlW2lkXSA9IFtdXG4gICAgfVxuICAgIHJldHVybiByZXN1bHRcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgZGVmOiBkZWZVbmlmb3JtLFxuICAgIHVuaWZvcm1zOiB1bmlmb3JtU3RhdGVcbiAgfVxufVxuIiwiLyogZ2xvYmFscyBwZXJmb3JtYW5jZSAqL1xubW9kdWxlLmV4cG9ydHMgPVxuICAodHlwZW9mIHBlcmZvcm1hbmNlICE9PSAndW5kZWZpbmVkJyAmJiBwZXJmb3JtYW5jZS5ub3cpXG4gID8gZnVuY3Rpb24gKCkgeyByZXR1cm4gcGVyZm9ybWFuY2Uubm93KCkgfVxuICA6IGZ1bmN0aW9uICgpIHsgcmV0dXJuICsobmV3IERhdGUoKSkgfVxuIiwidmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vZXh0ZW5kJylcblxuZnVuY3Rpb24gc2xpY2UgKHgpIHtcbiAgcmV0dXJuIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKHgpXG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY3JlYXRlRW52aXJvbm1lbnQgKCkge1xuICAvLyBVbmlxdWUgdmFyaWFibGUgaWQgY291bnRlclxuICB2YXIgdmFyQ291bnRlciA9IDBcblxuICAvLyBMaW5rZWQgdmFsdWVzIGFyZSBwYXNzZWQgZnJvbSB0aGlzIHNjb3BlIGludG8gdGhlIGdlbmVyYXRlZCBjb2RlIGJsb2NrXG4gIC8vIENhbGxpbmcgbGluaygpIHBhc3NlcyBhIHZhbHVlIGludG8gdGhlIGdlbmVyYXRlZCBzY29wZSBhbmQgcmV0dXJuc1xuICAvLyB0aGUgdmFyaWFibGUgbmFtZSB3aGljaCBpdCBpcyBib3VuZCB0b1xuICB2YXIgbGlua2VkTmFtZXMgPSBbXVxuICB2YXIgbGlua2VkVmFsdWVzID0gW11cbiAgZnVuY3Rpb24gbGluayAodmFsdWUpIHtcbiAgICB2YXIgbmFtZSA9ICdnJyArICh2YXJDb3VudGVyKyspXG4gICAgbGlua2VkTmFtZXMucHVzaChuYW1lKVxuICAgIGxpbmtlZFZhbHVlcy5wdXNoKHZhbHVlKVxuICAgIHJldHVybiBuYW1lXG4gIH1cblxuICAvLyBjcmVhdGUgYSBjb2RlIGJsb2NrXG4gIGZ1bmN0aW9uIGJsb2NrICgpIHtcbiAgICB2YXIgY29kZSA9IFtdXG4gICAgZnVuY3Rpb24gcHVzaCAoKSB7XG4gICAgICBjb2RlLnB1c2guYXBwbHkoY29kZSwgc2xpY2UoYXJndW1lbnRzKSlcbiAgICB9XG5cbiAgICB2YXIgdmFycyA9IFtdXG4gICAgZnVuY3Rpb24gZGVmICgpIHtcbiAgICAgIHZhciBuYW1lID0gJ3YnICsgKHZhckNvdW50ZXIrKylcbiAgICAgIHZhcnMucHVzaChuYW1lKVxuXG4gICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29kZS5wdXNoKG5hbWUsICc9JylcbiAgICAgICAgY29kZS5wdXNoLmFwcGx5KGNvZGUsIHNsaWNlKGFyZ3VtZW50cykpXG4gICAgICAgIGNvZGUucHVzaCgnOycpXG4gICAgICB9XG5cbiAgICAgIHJldHVybiBuYW1lXG4gICAgfVxuXG4gICAgcmV0dXJuIGV4dGVuZChwdXNoLCB7XG4gICAgICBkZWY6IGRlZixcbiAgICAgIHRvU3RyaW5nOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgKHZhcnMubGVuZ3RoID4gMCA/ICd2YXIgJyArIHZhcnMgKyAnOycgOiAnJyksXG4gICAgICAgICAgY29kZS5qb2luKCcnKVxuICAgICAgICBdLmpvaW4oJycpXG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIC8vIHByb2NlZHVyZSBsaXN0XG4gIHZhciBwcm9jZWR1cmVzID0ge31cbiAgZnVuY3Rpb24gcHJvYyAobmFtZSkge1xuICAgIHZhciBhcmdzID0gW11cbiAgICBmdW5jdGlvbiBhcmcgKCkge1xuICAgICAgdmFyIG5hbWUgPSAnYScgKyAodmFyQ291bnRlcisrKVxuICAgICAgYXJncy5wdXNoKG5hbWUpXG4gICAgICByZXR1cm4gbmFtZVxuICAgIH1cblxuICAgIHZhciBib2R5ID0gYmxvY2soKVxuICAgIHZhciBib2R5VG9TdHJpbmcgPSBib2R5LnRvU3RyaW5nXG5cbiAgICB2YXIgcmVzdWx0ID0gcHJvY2VkdXJlc1tuYW1lXSA9IGV4dGVuZChib2R5LCB7XG4gICAgICBhcmc6IGFyZyxcbiAgICAgIHRvU3RyaW5nOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgJ2Z1bmN0aW9uKCcsIGFyZ3Muam9pbigpLCAnKXsnLFxuICAgICAgICAgIGJvZHlUb1N0cmluZygpLFxuICAgICAgICAgICd9J1xuICAgICAgICBdLmpvaW4oJycpXG4gICAgICB9XG4gICAgfSlcblxuICAgIHJldHVybiByZXN1bHRcbiAgfVxuXG4gIGZ1bmN0aW9uIGNvbXBpbGUgKCkge1xuICAgIHZhciBjb2RlID0gWydcInVzZSBzdHJpY3RcIjtyZXR1cm4geyddXG4gICAgT2JqZWN0LmtleXMocHJvY2VkdXJlcykuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgY29kZS5wdXNoKCdcIicsIG5hbWUsICdcIjonLCBwcm9jZWR1cmVzW25hbWVdLnRvU3RyaW5nKCksICcsJylcbiAgICB9KVxuICAgIGNvZGUucHVzaCgnfScpXG4gICAgdmFyIHByb2MgPSBGdW5jdGlvbi5hcHBseShudWxsLCBsaW5rZWROYW1lcy5jb25jYXQoW2NvZGUuam9pbignJyldKSlcbiAgICByZXR1cm4gcHJvYy5hcHBseShudWxsLCBsaW5rZWRWYWx1ZXMpXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGxpbms6IGxpbmssXG4gICAgYmxvY2s6IGJsb2NrLFxuICAgIHByb2M6IHByb2MsXG4gICAgY29tcGlsZTogY29tcGlsZVxuICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChiYXNlLCBvcHRzKSB7XG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXMob3B0cylcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBrZXlzLmxlbmd0aDsgKytpKSB7XG4gICAgYmFzZVtrZXlzW2ldXSA9IG9wdHNba2V5c1tpXV1cbiAgfVxuICByZXR1cm4gYmFzZVxufVxuIiwidmFyIGlzVHlwZWRBcnJheSA9IHJlcXVpcmUoJy4vaXMtdHlwZWQtYXJyYXknKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGlzTkRBcnJheUxpa2UgKG9iaikge1xuICByZXR1cm4gKFxuICAgIHR5cGVvZiBvYmogPT09ICdvYmplY3QnICYmXG4gICAgQXJyYXkuaXNBcnJheShvYmouc2hhcGUpICYmXG4gICAgQXJyYXkuaXNBcnJheShvYmouc3RyaWRlKSAmJlxuICAgIHR5cGVvZiBvYmoub2Zmc2V0ID09PSAnbnVtYmVyJyAmJlxuICAgIG9iai5zaGFwZS5sZW5ndGggPT09IG9iai5zdHJpZGUubGVuZ3RoICYmXG4gICAgKEFycmF5LmlzQXJyYXkob2JqLmRhdGEpIHx8XG4gICAgICBpc1R5cGVkQXJyYXkob2JqLmRhdGEpKSlcbn1cbiIsInZhciBkdHlwZXMgPSByZXF1aXJlKCcuLi9jb25zdGFudHMvYXJyYXl0eXBlcy5qc29uJylcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHgpIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh4KSBpbiBkdHlwZXNcbn1cbiIsIi8qIGdsb2JhbHMgZG9jdW1lbnQsIEltYWdlLCBYTUxIdHRwUmVxdWVzdCAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGxvYWRUZXh0dXJlXG5cbmZ1bmN0aW9uIGdldEV4dGVuc2lvbiAodXJsKSB7XG4gIHZhciBwYXJ0cyA9IC9cXC4oXFx3KykoXFw/LiopPyQvLmV4ZWModXJsKVxuICBpZiAocGFydHMgJiYgcGFydHNbMV0pIHtcbiAgICByZXR1cm4gcGFydHNbMV0udG9Mb3dlckNhc2UoKVxuICB9XG59XG5cbmZ1bmN0aW9uIGlzVmlkZW9FeHRlbnNpb24gKHVybCkge1xuICByZXR1cm4gW1xuICAgICdhdmknLFxuICAgICdhc2YnLFxuICAgICdnaWZ2JyxcbiAgICAnbW92JyxcbiAgICAncXQnLFxuICAgICd5dXYnLFxuICAgICdtcGcnLFxuICAgICdtcGVnJyxcbiAgICAnbTJ2JyxcbiAgICAnbXA0JyxcbiAgICAnbTRwJyxcbiAgICAnbTR2JyxcbiAgICAnb2dnJyxcbiAgICAnb2d2JyxcbiAgICAndm9iJyxcbiAgICAnd2VibScsXG4gICAgJ3dtdidcbiAgXS5pbmRleE9mKHVybCkgPj0gMFxufVxuXG5mdW5jdGlvbiBpc0NvbXByZXNzZWRFeHRlbnNpb24gKHVybCkge1xuICByZXR1cm4gW1xuICAgICdkZHMnXG4gIF0uaW5kZXhPZih1cmwpID49IDBcbn1cblxuZnVuY3Rpb24gbG9hZFZpZGVvICh1cmwsIGNyb3NzT3JpZ2luKSB7XG4gIHZhciB2aWRlbyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3ZpZGVvJylcbiAgdmlkZW8uYXV0b3BsYXkgPSB0cnVlXG4gIHZpZGVvLmxvb3AgPSB0cnVlXG4gIGlmIChjcm9zc09yaWdpbikge1xuICAgIHZpZGVvLmNyb3NzT3JpZ2luID0gY3Jvc3NPcmlnaW5cbiAgfVxuICB2aWRlby5zcmMgPSB1cmxcbiAgcmV0dXJuIHZpZGVvXG59XG5cbmZ1bmN0aW9uIGxvYWRDb21wcmVzc2VkVGV4dHVyZSAodXJsLCBleHQsIGNyb3NzT3JpZ2luKSB7XG4gIHZhciB4aHIgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKVxuICB4aHIucmVzcG9uc2VUeXBlID0gJ2FycmF5YnVmZmVyJ1xuICB4aHIub3BlbignR0VUJywgdXJsLCB0cnVlKVxuICB4aHIuc2VuZCgpXG4gIHJldHVybiB4aHJcbn1cblxuZnVuY3Rpb24gbG9hZEltYWdlICh1cmwsIGNyb3NzT3JpZ2luKSB7XG4gIHZhciBpbWFnZSA9IG5ldyBJbWFnZSgpXG4gIGlmIChjcm9zc09yaWdpbikge1xuICAgIGltYWdlLmNyb3NzT3JpZ2luID0gY3Jvc3NPcmlnaW5cbiAgfVxuICBpbWFnZS5zcmMgPSB1cmxcbiAgcmV0dXJuIGltYWdlXG59XG5cbi8vIEN1cnJlbnRseSB0aGlzIHN0dWZmIG9ubHkgd29ya3MgaW4gYSBET00gZW52aXJvbm1lbnRcbmZ1bmN0aW9uIGxvYWRUZXh0dXJlICh1cmwsIGNyb3NzT3JpZ2luKSB7XG4gIGlmICh0eXBlb2YgZG9jdW1lbnQgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgdmFyIGV4dCA9IGdldEV4dGVuc2lvbih1cmwpXG4gICAgaWYgKGlzVmlkZW9FeHRlbnNpb24oZXh0KSkge1xuICAgICAgcmV0dXJuIGxvYWRWaWRlbyh1cmwsIGNyb3NzT3JpZ2luKVxuICAgIH1cbiAgICBpZiAoaXNDb21wcmVzc2VkRXh0ZW5zaW9uKGV4dCkpIHtcbiAgICAgIHJldHVybiBsb2FkQ29tcHJlc3NlZFRleHR1cmUodXJsLCBleHQsIGNyb3NzT3JpZ2luKVxuICAgIH1cbiAgICByZXR1cm4gbG9hZEltYWdlKHVybCwgY3Jvc3NPcmlnaW4pXG4gIH1cbiAgcmV0dXJuIG51bGxcbn1cbiIsIi8vIFJlZmVyZW5jZXM6XG4vL1xuLy8gaHR0cDovL21zZG4ubWljcm9zb2Z0LmNvbS9lbi11cy9saWJyYXJ5L2JiOTQzOTkxLmFzcHgvXG4vLyBodHRwOi8vYmxvZy50b2ppY29kZS5jb20vMjAxMS8xMi9jb21wcmVzc2VkLXRleHR1cmVzLWluLXdlYmdsLmh0bWxcbi8vXG5cblxubW9kdWxlLmV4cG9ydHMgPSBwYXJzZUREU1xuXG52YXIgRERTX01BR0lDID0gMHgyMDUzNDQ0NFxuXG52YXIgR0xfVEVYVFVSRV8yRCA9IDB4MERFMVxudmFyIEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCA9IDB4ODUxNVxuXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfUzNUQ19EWFQxX0VYVCA9IDB4ODNGMFxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDFfRVhUID0gMHg4M0YxXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUM19FWFQgPSAweDgzRjJcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQ1X0VYVCA9IDB4ODNGM1xuXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfRVRDMV9XRUJHTCA9IDB4OEQ2NFxuXG52YXIgR0xfVU5TSUdORURfQllURSA9IDB4MTQwMVxuLy8gdmFyIEdMX0hBTEZfRkxPQVRfT0VTID0gMHg4RDYxXG4vLyB2YXIgR0xfRkxPQVQgPSAweDE0MDZcblxudmFyIEREU0RfTUlQTUFQQ09VTlQgPSAweDIwMDAwXG5cbnZhciBERFNDQVBTMl9DVUJFTUFQID0gMHgyMDBcbnZhciBERFNDQVBTMl9DVUJFTUFQX1BPU0lUSVZFWCA9IDB4NDAwXG52YXIgRERTQ0FQUzJfQ1VCRU1BUF9ORUdBVElWRVggPSAweDgwMFxudmFyIEREU0NBUFMyX0NVQkVNQVBfUE9TSVRJVkVZID0gMHgxMDAwXG52YXIgRERTQ0FQUzJfQ1VCRU1BUF9ORUdBVElWRVkgPSAweDIwMDBcbnZhciBERFNDQVBTMl9DVUJFTUFQX1BPU0lUSVZFWiA9IDB4NDAwMFxudmFyIEREU0NBUFMyX0NVQkVNQVBfTkVHQVRJVkVaID0gMHg4MDAwXG5cbnZhciBDVUJFTUFQX0NPTVBMRVRFX0ZBQ0VTID0gKFxuICBERFNDQVBTMl9DVUJFTUFQX1BPU0lUSVZFWCB8XG4gIEREU0NBUFMyX0NVQkVNQVBfTkVHQVRJVkVYIHxcbiAgRERTQ0FQUzJfQ1VCRU1BUF9QT1NJVElWRVkgfFxuICBERFNDQVBTMl9DVUJFTUFQX05FR0FUSVZFWSB8XG4gIEREU0NBUFMyX0NVQkVNQVBfUE9TSVRJVkVaIHxcbiAgRERTQ0FQUzJfQ1VCRU1BUF9ORUdBVElWRVopXG5cbnZhciBERFBGX0ZPVVJDQyA9IDB4NFxudmFyIEREUEZfUkdCID0gMHg0MFxuXG52YXIgRk9VUkNDX0RYVDEgPSAweDMxNTQ1ODQ0XG52YXIgRk9VUkNDX0RYVDMgPSAweDMzNTQ1ODQ0XG52YXIgRk9VUkNDX0RYVDUgPSAweDM1NTQ1ODQ0XG52YXIgRk9VUkNDX0VUQzEgPSAweDMxNDM1NDQ1XG5cbi8vIEREU19IRUFERVIge1xudmFyIE9GRl9TSVpFID0gMSAgICAgICAgLy8gaW50MzIgZHdTaXplXG52YXIgT0ZGX0ZMQUdTID0gMiAgICAgICAvLyBpbnQzMiBkd0ZsYWdzXG52YXIgT0ZGX0hFSUdIVCA9IDMgICAgICAvLyBpbnQzMiBkd0hlaWdodFxudmFyIE9GRl9XSURUSCA9IDQgICAgICAgLy8gaW50MzIgZHdXaWR0aFxuLy8gdmFyIE9GRl9QSVRDSCA9IDUgICAgICAgLy8gaW50MzIgZHdQaXRjaE9yTGluZWFyU2l6ZVxuLy8gdmFyIE9GRl9ERVBUSCA9IDYgICAgICAgLy8gaW50MzIgZHdEZXB0aFxudmFyIE9GRl9NSVBNQVAgPSA3ICAgICAgLy8gaW50MzIgZHdNaXBNYXBDb3VudDsgLy8gb2Zmc2V0OiA3XG4vLyBpbnQzMlsxMV0gZHdSZXNlcnZlZDFcbi8vIEREU19QSVhFTEZPUk1BVCB7XG4vLyB2YXIgT0ZGX1BGX1NJWkUgPSAxOSAgICAvLyBpbnQzMiBkd1NpemU7IC8vIG9mZnNldDogMTlcbnZhciBPRkZfUEZfRkxBR1MgPSAyMCAgIC8vIGludDMyIGR3RmxhZ3NcbnZhciBPRkZfRk9VUkNDID0gMjEgICAgIC8vIGNoYXJbNF0gZHdGb3VyQ0Ncbi8vIHZhciBPRkZfUkdCQV9CSVRTID0gMjIgIC8vIGludDMyIGR3UkdCQml0Q291bnRcbi8vIHZhciBPRkZfUkVEX01BU0sgPSAyMyAgIC8vIGludDMyIGR3UkJpdE1hc2tcbi8vIHZhciBPRkZfR1JFRU5fTUFTSyA9IDI0IC8vIGludDMyIGR3R0JpdE1hc2tcbi8vIHZhciBPRkZfQkxVRV9NQVNLID0gMjUgIC8vIGludDMyIGR3QkJpdE1hc2tcbi8vIHZhciBPRkZfQUxQSEFfTUFTSyA9IDI2IC8vIGludDMyIGR3QUJpdE1hc2s7IC8vIG9mZnNldDogMjZcbi8vIH1cbi8vIHZhciBPRkZfQ0FQUyA9IDI3ICAgICAgIC8vIGludDMyIGR3Q2FwczsgLy8gb2Zmc2V0OiAyN1xudmFyIE9GRl9DQVBTMiA9IDI4ICAgICAgLy8gaW50MzIgZHdDYXBzMlxuLy8gdmFyIE9GRl9DQVBTMyA9IDI5ICAgICAgLy8gaW50MzIgZHdDYXBzM1xuLy8gdmFyIE9GRl9DQVBTNCA9IDMwICAgICAgLy8gaW50MzIgZHdDYXBzNFxuLy8gaW50MzIgZHdSZXNlcnZlZDIgLy8gb2Zmc2V0IDMxXG5cbmZ1bmN0aW9uIHBhcnNlRERTIChhcnJheUJ1ZmZlcikge1xuICB2YXIgaGVhZGVyID0gbmV3IEludDMyQXJyYXkoYXJyYXlCdWZmZXIpXG4gIFxuXG4gIHZhciBmbGFncyA9IGhlYWRlcltPRkZfRkxBR1NdXG4gIFxuXG4gIHZhciB3aWR0aCA9IGhlYWRlcltPRkZfV0lEVEhdXG4gIHZhciBoZWlnaHQgPSBoZWFkZXJbT0ZGX0hFSUdIVF1cblxuICB2YXIgdHlwZSA9IEdMX1VOU0lHTkVEX0JZVEVcbiAgdmFyIGZvcm1hdCA9IDBcbiAgdmFyIGJsb2NrQnl0ZXMgPSAwXG4gIHZhciBjaGFubmVscyA9IDRcbiAgc3dpdGNoIChoZWFkZXJbT0ZGX0ZPVVJDQ10pIHtcbiAgICBjYXNlIEZPVVJDQ19EWFQxOlxuICAgICAgYmxvY2tCeXRlcyA9IDhcbiAgICAgIGlmIChmbGFncyAmIEREUEZfUkdCKSB7XG4gICAgICAgIGNoYW5uZWxzID0gM1xuICAgICAgICBmb3JtYXQgPSBHTF9DT01QUkVTU0VEX1JHQl9TM1RDX0RYVDFfRVhUXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBmb3JtYXQgPSBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQxX0VYVFxuICAgICAgfVxuICAgICAgYnJlYWtcblxuICAgIGNhc2UgRk9VUkNDX0RYVDM6XG4gICAgICBibG9ja0J5dGVzID0gMTZcbiAgICAgIGZvcm1hdCA9IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDNfRVhUXG4gICAgICBicmVha1xuXG4gICAgY2FzZSBGT1VSQ0NfRFhUNTpcbiAgICAgIGJsb2NrQnl0ZXMgPSAxNlxuICAgICAgZm9ybWF0ID0gR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUNV9FWFRcbiAgICAgIGJyZWFrXG5cbiAgICBjYXNlIEZPVVJDQ19FVEMxOlxuICAgICAgYmxvY2tCeXRlcyA9IDhcbiAgICAgIGZvcm1hdCA9IEdMX0NPTVBSRVNTRURfUkdCX0VUQzFfV0VCR0xcbiAgICAgIGJyZWFrXG5cbiAgICAvLyBUT0RPOiBJbXBsZW1lbnQgaGRyIGFuZCB1bmNvbXByZXNzZWQgdGV4dHVyZXNcblxuICAgIGRlZmF1bHQ6XG4gICAgICAvLyBIYW5kbGUgdW5jb21wcmVzc2VkIGRhdGEgaGVyZVxuICAgICAgXG4gIH1cblxuICB2YXIgcGl4ZWxGbGFncyA9IGhlYWRlcltPRkZfUEZfRkxBR1NdXG5cbiAgdmFyIG1pcG1hcENvdW50ID0gMVxuICBpZiAocGl4ZWxGbGFncyAmIEREU0RfTUlQTUFQQ09VTlQpIHtcbiAgICBtaXBtYXBDb3VudCA9IE1hdGgubWF4KDEsIGhlYWRlcltPRkZfTUlQTUFQXSlcbiAgfVxuXG4gIHZhciBwdHIgPSBoZWFkZXJbT0ZGX1NJWkVdICsgNFxuXG4gIHZhciByZXN1bHQgPSB7XG4gICAgd2lkdGg6IHdpZHRoLFxuICAgIGhlaWdodDogaGVpZ2h0LFxuICAgIGNoYW5uZWxzOiBjaGFubmVscyxcbiAgICBmb3JtYXQ6IGZvcm1hdCxcbiAgICB0eXBlOiB0eXBlLFxuICAgIGNvbXByZXNzZWQ6IHRydWUsXG4gICAgY3ViZTogZmFsc2UsXG4gICAgcGl4ZWxzOiBbXVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VNaXBzICh0YXJnZXQpIHtcbiAgICB2YXIgbWlwV2lkdGggPSB3aWR0aFxuICAgIHZhciBtaXBIZWlnaHQgPSBoZWlnaHRcblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbWlwbWFwQ291bnQ7ICsraSkge1xuICAgICAgdmFyIHNpemUgPVxuICAgICAgICBNYXRoLm1heCgxLCAobWlwV2lkdGggKyAzKSA+PiAyKSAqXG4gICAgICAgIE1hdGgubWF4KDEsIChtaXBIZWlnaHQgKyAzKSA+PiAyKSAqXG4gICAgICAgIGJsb2NrQnl0ZXNcbiAgICAgIHJlc3VsdC5waXhlbHMucHVzaCh7XG4gICAgICAgIHRhcmdldDogdGFyZ2V0LFxuICAgICAgICBtaXBsZXZlbDogaSxcbiAgICAgICAgd2lkdGg6IG1pcFdpZHRoLFxuICAgICAgICBoZWlnaHQ6IG1pcEhlaWdodCxcbiAgICAgICAgZGF0YTogbmV3IFVpbnQ4QXJyYXkoYXJyYXlCdWZmZXIsIHB0ciwgc2l6ZSlcbiAgICAgIH0pXG4gICAgICBwdHIgKz0gc2l6ZVxuICAgICAgbWlwV2lkdGggPj49IDFcbiAgICAgIG1pcEhlaWdodCA+Pj0gMVxuICAgIH1cbiAgfVxuXG4gIHZhciBjYXBzMiA9IGhlYWRlcltPRkZfQ0FQUzJdXG4gIHZhciBjdWJlbWFwID0gISEoY2FwczIgJiBERFNDQVBTMl9DVUJFTUFQKVxuICBpZiAoY3ViZW1hcCkge1xuICAgIFxuICAgIHJlc3VsdC5jdWJlID0gdHJ1ZVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICBwYXJzZU1pcHMoR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YICsgaSlcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgcGFyc2VNaXBzKEdMX1RFWFRVUkVfMkQpXG4gIH1cblxuICByZXR1cm4gcmVzdWx0XG59XG4iLCIvKiBnbG9iYWxzIHJlcXVlc3RBbmltYXRpb25GcmFtZSwgY2FuY2VsQW5pbWF0aW9uRnJhbWUgKi9cbmlmICh0eXBlb2YgcmVxdWVzdEFuaW1hdGlvbkZyYW1lID09PSAnZnVuY3Rpb24nICYmXG4gICAgdHlwZW9mIGNhbmNlbEFuaW1hdGlvbkZyYW1lID09PSAnZnVuY3Rpb24nKSB7XG4gIG1vZHVsZS5leHBvcnRzID0ge1xuICAgIG5leHQ6IGZ1bmN0aW9uICh4KSB7IHJldHVybiByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoeCkgfSxcbiAgICBjYW5jZWw6IGZ1bmN0aW9uICh4KSB7IHJldHVybiBjYW5jZWxBbmltYXRpb25GcmFtZSh4KSB9XG4gIH1cbn0gZWxzZSB7XG4gIG1vZHVsZS5leHBvcnRzID0ge1xuICAgIG5leHQ6IGZ1bmN0aW9uIChjYikge1xuICAgICAgc2V0VGltZW91dChjYiwgMzApXG4gICAgfSxcbiAgICBjYW5jZWw6IGNsZWFyVGltZW91dFxuICB9XG59XG4iLCIvLyBBIHN0YWNrIGZvciBtYW5hZ2luZyB0aGUgc3RhdGUgb2YgYSBzY2FsYXIvdmVjdG9yIHBhcmFtZXRlclxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNyZWF0ZVN0YWNrIChpbml0LCBvbkNoYW5nZSkge1xuICB2YXIgbiA9IGluaXQubGVuZ3RoXG4gIHZhciBzdGFjayA9IGluaXQuc2xpY2UoKVxuICB2YXIgY3VycmVudCA9IGluaXQuc2xpY2UoKVxuICB2YXIgZGlydHkgPSBmYWxzZVxuICB2YXIgZm9yY2VEaXJ0eSA9IHRydWVcblxuICBmdW5jdGlvbiBwb2xsICgpIHtcbiAgICB2YXIgcHRyID0gc3RhY2subGVuZ3RoIC0gblxuICAgIGlmIChkaXJ0eSB8fCBmb3JjZURpcnR5KSB7XG4gICAgICBzd2l0Y2ggKG4pIHtcbiAgICAgICAgY2FzZSAxOlxuICAgICAgICAgIG9uQ2hhbmdlKHN0YWNrW3B0cl0pXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSAyOlxuICAgICAgICAgIG9uQ2hhbmdlKHN0YWNrW3B0cl0sIHN0YWNrW3B0ciArIDFdKVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgMzpcbiAgICAgICAgICBvbkNoYW5nZShzdGFja1twdHJdLCBzdGFja1twdHIgKyAxXSwgc3RhY2tbcHRyICsgMl0pXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSA0OlxuICAgICAgICAgIG9uQ2hhbmdlKHN0YWNrW3B0cl0sIHN0YWNrW3B0ciArIDFdLCBzdGFja1twdHIgKyAyXSwgc3RhY2tbcHRyICsgM10pXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSA1OlxuICAgICAgICAgIG9uQ2hhbmdlKHN0YWNrW3B0cl0sIHN0YWNrW3B0ciArIDFdLCBzdGFja1twdHIgKyAyXSwgc3RhY2tbcHRyICsgM10sIHN0YWNrW3B0ciArIDRdKVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgNjpcbiAgICAgICAgICBvbkNoYW5nZShzdGFja1twdHJdLCBzdGFja1twdHIgKyAxXSwgc3RhY2tbcHRyICsgMl0sIHN0YWNrW3B0ciArIDNdLCBzdGFja1twdHIgKyA0XSwgc3RhY2tbcHRyICsgNV0pXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICBvbkNoYW5nZS5hcHBseShudWxsLCBzdGFjay5zbGljZShwdHIsIHN0YWNrLmxlbmd0aCkpXG4gICAgICB9XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG47ICsraSkge1xuICAgICAgICBjdXJyZW50W2ldID0gc3RhY2tbcHRyICsgaV1cbiAgICAgIH1cbiAgICAgIGZvcmNlRGlydHkgPSBkaXJ0eSA9IGZhbHNlXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBwdXNoOiBmdW5jdGlvbiAoKSB7XG4gICAgICBkaXJ0eSA9IGZhbHNlXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG47ICsraSkge1xuICAgICAgICB2YXIgeCA9IGFyZ3VtZW50c1tpXVxuICAgICAgICBkaXJ0eSA9IGRpcnR5IHx8ICh4ICE9PSBjdXJyZW50W2ldKVxuICAgICAgICBzdGFjay5wdXNoKHgpXG4gICAgICB9XG4gICAgfSxcblxuICAgIHBvcDogZnVuY3Rpb24gKCkge1xuICAgICAgZGlydHkgPSBmYWxzZVxuICAgICAgc3RhY2subGVuZ3RoIC09IG5cbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbjsgKytpKSB7XG4gICAgICAgIGRpcnR5ID0gZGlydHkgfHwgKHN0YWNrW3N0YWNrLmxlbmd0aCAtIG4gKyBpXSAhPT0gY3VycmVudFtpXSlcbiAgICAgIH1cbiAgICB9LFxuXG4gICAgcG9sbDogcG9sbCxcblxuICAgIHNldERpcnR5OiBmdW5jdGlvbiAoKSB7XG4gICAgICBmb3JjZURpcnR5ID0gdHJ1ZVxuICAgIH1cbiAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjb252ZXJ0VG9IYWxmRmxvYXQgKGFycmF5KSB7XG4gIHZhciBmbG9hdHMgPSBuZXcgRmxvYXQzMkFycmF5KGFycmF5KVxuICB2YXIgdWludHMgPSBuZXcgVWludDMyQXJyYXkoZmxvYXRzLmJ1ZmZlcilcbiAgdmFyIHVzaG9ydHMgPSBuZXcgVWludDE2QXJyYXkoYXJyYXkubGVuZ3RoKVxuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgYXJyYXkubGVuZ3RoOyArK2kpIHtcbiAgICBpZiAoaXNOYU4oYXJyYXlbaV0pKSB7XG4gICAgICB1c2hvcnRzW2ldID0gMHhmZmZmXG4gICAgfSBlbHNlIGlmIChhcnJheVtpXSA9PT0gSW5maW5pdHkpIHtcbiAgICAgIHVzaG9ydHNbaV0gPSAweDdjMDBcbiAgICB9IGVsc2UgaWYgKGFycmF5W2ldID09PSAtSW5maW5pdHkpIHtcbiAgICAgIHVzaG9ydHNbaV0gPSAweGZjMDBcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIHggPSB1aW50c1tpXVxuXG4gICAgICB2YXIgc2duID0gKHggPj4+IDMxKSA8PCAxNVxuICAgICAgdmFyIGV4cCA9ICgoeCA8PCAxKSA+Pj4gMjQpIC0gMTI3XG4gICAgICB2YXIgZnJhYyA9ICh4ID4+IDEzKSAmICgoMSA8PCAxMCkgLSAxKVxuXG4gICAgICBpZiAoZXhwIDwgLTI0KSB7XG4gICAgICAgIC8vIHJvdW5kIG5vbi1yZXByZXNlbnRhYmxlIGRlbm9ybWFscyB0byAwXG4gICAgICAgIHVzaG9ydHNbaV0gPSBzZ25cbiAgICAgIH0gZWxzZSBpZiAoZXhwIDwgLTE0KSB7XG4gICAgICAgIC8vIGhhbmRsZSBkZW5vcm1hbHNcbiAgICAgICAgdmFyIHMgPSAtMTQgLSBleHBcbiAgICAgICAgdXNob3J0c1tpXSA9IHNnbiArICgoZnJhYyArICgxIDw8IDEwKSkgPj4gcylcbiAgICAgIH0gZWxzZSBpZiAoZXhwID4gMTUpIHtcbiAgICAgICAgLy8gcm91bmQgb3ZlcmZsb3cgdG8gKy8tIEluZmluaXR5XG4gICAgICAgIHVzaG9ydHNbaV0gPSBzZ24gKyAweDdjMDBcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIG90aGVyd2lzZSBjb252ZXJ0IGRpcmVjdGx5XG4gICAgICAgIHVzaG9ydHNbaV0gPSBzZ24gKyAoKGV4cCArIDE1KSA8PCAxMCkgKyBmcmFjXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHVzaG9ydHNcbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKG9iaikge1xuICByZXR1cm4gT2JqZWN0LmtleXMob2JqKS5tYXAoZnVuY3Rpb24gKGtleSkgeyByZXR1cm4gb2JqW2tleV0gfSlcbn1cbiIsIlxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vbGliL3V0aWwvZXh0ZW5kJylcbnZhciBnZXRDb250ZXh0ID0gcmVxdWlyZSgnLi9saWIvY29udGV4dCcpXG52YXIgY3JlYXRlU3RyaW5nU3RvcmUgPSByZXF1aXJlKCcuL2xpYi9zdHJpbmdzJylcbnZhciB3cmFwRXh0ZW5zaW9ucyA9IHJlcXVpcmUoJy4vbGliL2V4dGVuc2lvbicpXG52YXIgd3JhcExpbWl0cyA9IHJlcXVpcmUoJy4vbGliL2xpbWl0cycpXG52YXIgd3JhcEJ1ZmZlcnMgPSByZXF1aXJlKCcuL2xpYi9idWZmZXInKVxudmFyIHdyYXBFbGVtZW50cyA9IHJlcXVpcmUoJy4vbGliL2VsZW1lbnRzJylcbnZhciB3cmFwVGV4dHVyZXMgPSByZXF1aXJlKCcuL2xpYi90ZXh0dXJlJylcbnZhciB3cmFwUmVuZGVyYnVmZmVycyA9IHJlcXVpcmUoJy4vbGliL3JlbmRlcmJ1ZmZlcicpXG52YXIgd3JhcEZyYW1lYnVmZmVycyA9IHJlcXVpcmUoJy4vbGliL2ZyYW1lYnVmZmVyJylcbnZhciB3cmFwVW5pZm9ybXMgPSByZXF1aXJlKCcuL2xpYi91bmlmb3JtJylcbnZhciB3cmFwQXR0cmlidXRlcyA9IHJlcXVpcmUoJy4vbGliL2F0dHJpYnV0ZScpXG52YXIgd3JhcFNoYWRlcnMgPSByZXF1aXJlKCcuL2xpYi9zaGFkZXInKVxudmFyIHdyYXBEcmF3ID0gcmVxdWlyZSgnLi9saWIvZHJhdycpXG52YXIgd3JhcENvbnRleHQgPSByZXF1aXJlKCcuL2xpYi9zdGF0ZScpXG52YXIgY3JlYXRlQ29tcGlsZXIgPSByZXF1aXJlKCcuL2xpYi9jb21waWxlJylcbnZhciB3cmFwUmVhZCA9IHJlcXVpcmUoJy4vbGliL3JlYWQnKVxudmFyIGR5bmFtaWMgPSByZXF1aXJlKCcuL2xpYi9keW5hbWljJylcbnZhciByYWYgPSByZXF1aXJlKCcuL2xpYi91dGlsL3JhZicpXG52YXIgY2xvY2sgPSByZXF1aXJlKCcuL2xpYi91dGlsL2Nsb2NrJylcblxudmFyIEdMX0NPTE9SX0JVRkZFUl9CSVQgPSAxNjM4NFxudmFyIEdMX0RFUFRIX0JVRkZFUl9CSVQgPSAyNTZcbnZhciBHTF9TVEVOQ0lMX0JVRkZFUl9CSVQgPSAxMDI0XG5cbnZhciBHTF9BUlJBWV9CVUZGRVIgPSAzNDk2MlxudmFyIEdMX1RFWFRVUkVfMkQgPSAweDBERTFcbnZhciBHTF9URVhUVVJFX0NVQkVfTUFQID0gMHg4NTEzXG5cbnZhciBDT05URVhUX0xPU1RfRVZFTlQgPSAnd2ViZ2xjb250ZXh0bG9zdCdcbnZhciBDT05URVhUX1JFU1RPUkVEX0VWRU5UID0gJ3dlYmdsY29udGV4dHJlc3RvcmVkJ1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBSRUdMICgpIHtcbiAgdmFyIGFyZ3MgPSBnZXRDb250ZXh0KEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cykpXG4gIHZhciBnbCA9IGFyZ3MuZ2xcbiAgdmFyIG9wdGlvbnMgPSBhcmdzLm9wdGlvbnNcblxuICB2YXIgc3RyaW5nU3RvcmUgPSBjcmVhdGVTdHJpbmdTdG9yZSgpXG5cbiAgdmFyIGV4dGVuc2lvblN0YXRlID0gd3JhcEV4dGVuc2lvbnMoZ2wpXG4gIHZhciBleHRlbnNpb25zID0gZXh0ZW5zaW9uU3RhdGUuZXh0ZW5zaW9uc1xuXG4gIHZhciB2aWV3cG9ydFN0YXRlID0ge1xuICAgIHdpZHRoOiBnbC5kcmF3aW5nQnVmZmVyV2lkdGgsXG4gICAgaGVpZ2h0OiBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0XG4gIH1cblxuICB2YXIgbGltaXRzID0gd3JhcExpbWl0cyhcbiAgICBnbCxcbiAgICBleHRlbnNpb25zKVxuXG4gIHZhciBidWZmZXJTdGF0ZSA9IHdyYXBCdWZmZXJzKGdsKVxuXG4gIHZhciBlbGVtZW50U3RhdGUgPSB3cmFwRWxlbWVudHMoXG4gICAgZ2wsXG4gICAgZXh0ZW5zaW9ucyxcbiAgICBidWZmZXJTdGF0ZSlcblxuICB2YXIgdW5pZm9ybVN0YXRlID0gd3JhcFVuaWZvcm1zKHN0cmluZ1N0b3JlKVxuXG4gIHZhciBhdHRyaWJ1dGVTdGF0ZSA9IHdyYXBBdHRyaWJ1dGVzKFxuICAgIGdsLFxuICAgIGV4dGVuc2lvbnMsXG4gICAgbGltaXRzLFxuICAgIGJ1ZmZlclN0YXRlLFxuICAgIHN0cmluZ1N0b3JlKVxuXG4gIHZhciBzaGFkZXJTdGF0ZSA9IHdyYXBTaGFkZXJzKFxuICAgIGdsLFxuICAgIGF0dHJpYnV0ZVN0YXRlLFxuICAgIHVuaWZvcm1TdGF0ZSxcbiAgICBmdW5jdGlvbiAocHJvZ3JhbSkge1xuICAgICAgcmV0dXJuIGNvbXBpbGVyLmRyYXcocHJvZ3JhbSlcbiAgICB9LFxuICAgIHN0cmluZ1N0b3JlKVxuXG4gIHZhciBkcmF3U3RhdGUgPSB3cmFwRHJhdyhcbiAgICBnbCxcbiAgICBleHRlbnNpb25zLFxuICAgIGJ1ZmZlclN0YXRlKVxuXG4gIHZhciB0ZXh0dXJlU3RhdGUgPSB3cmFwVGV4dHVyZXMoXG4gICAgZ2wsXG4gICAgZXh0ZW5zaW9ucyxcbiAgICBsaW1pdHMsXG4gICAgcG9sbCxcbiAgICB2aWV3cG9ydFN0YXRlKVxuXG4gIHZhciByZW5kZXJidWZmZXJTdGF0ZSA9IHdyYXBSZW5kZXJidWZmZXJzKFxuICAgIGdsLFxuICAgIGV4dGVuc2lvbnMsXG4gICAgbGltaXRzKVxuXG4gIHZhciBmcmFtZWJ1ZmZlclN0YXRlID0gd3JhcEZyYW1lYnVmZmVycyhcbiAgICBnbCxcbiAgICBleHRlbnNpb25zLFxuICAgIGxpbWl0cyxcbiAgICB0ZXh0dXJlU3RhdGUsXG4gICAgcmVuZGVyYnVmZmVyU3RhdGUpXG5cbiAgdmFyIGZyYW1lU3RhdGUgPSB7XG4gICAgY291bnQ6IDAsXG4gICAgc3RhcnQ6IGNsb2NrKCksXG4gICAgZHQ6IDAsXG4gICAgdDogY2xvY2soKSxcbiAgICByZW5kZXJUaW1lOiAwLFxuICAgIHdpZHRoOiBnbC5kcmF3aW5nQnVmZmVyV2lkdGgsXG4gICAgaGVpZ2h0OiBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0LFxuICAgIHBpeGVsUmF0aW86IG9wdGlvbnMucGl4ZWxSYXRpb1xuICB9XG5cbiAgdmFyIGdsU3RhdGUgPSB3cmFwQ29udGV4dChcbiAgICBnbCxcbiAgICBmcmFtZWJ1ZmZlclN0YXRlLFxuICAgIHZpZXdwb3J0U3RhdGUpXG5cbiAgdmFyIHJlYWRQaXhlbHMgPSB3cmFwUmVhZChnbCwgcG9sbCwgdmlld3BvcnRTdGF0ZSlcblxuICB2YXIgY29tcGlsZXIgPSBjcmVhdGVDb21waWxlcihcbiAgICBnbCxcbiAgICBzdHJpbmdTdG9yZSxcbiAgICBleHRlbnNpb25zLFxuICAgIGxpbWl0cyxcbiAgICBidWZmZXJTdGF0ZSxcbiAgICBlbGVtZW50U3RhdGUsXG4gICAgdGV4dHVyZVN0YXRlLFxuICAgIGZyYW1lYnVmZmVyU3RhdGUsXG4gICAgZ2xTdGF0ZSxcbiAgICB1bmlmb3JtU3RhdGUsXG4gICAgYXR0cmlidXRlU3RhdGUsXG4gICAgc2hhZGVyU3RhdGUsXG4gICAgZHJhd1N0YXRlLFxuICAgIGZyYW1lU3RhdGUsXG4gICAgcG9sbClcblxuICB2YXIgY2FudmFzID0gZ2wuY2FudmFzXG5cbiAgdmFyIHJhZkNhbGxiYWNrcyA9IFtdXG4gIHZhciBhY3RpdmVSQUYgPSAwXG4gIGZ1bmN0aW9uIGhhbmRsZVJBRiAoKSB7XG4gICAgYWN0aXZlUkFGID0gcmFmLm5leHQoaGFuZGxlUkFGKVxuICAgIGZyYW1lU3RhdGUuY291bnQgKz0gMVxuXG4gICAgaWYgKGZyYW1lU3RhdGUud2lkdGggIT09IGdsLmRyYXdpbmdCdWZmZXJXaWR0aCB8fFxuICAgICAgICBmcmFtZVN0YXRlLmhlaWdodCAhPT0gZ2wuZHJhd2luZ0J1ZmZlckhlaWdodCkge1xuICAgICAgZnJhbWVTdGF0ZS53aWR0aCA9IGdsLmRyYXdpbmdCdWZmZXJXaWR0aFxuICAgICAgZnJhbWVTdGF0ZS5oZWlnaHQgPSBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0XG4gICAgICBnbFN0YXRlLm5vdGlmeVZpZXdwb3J0Q2hhbmdlZCgpXG4gICAgfVxuXG4gICAgdmFyIG5vdyA9IGNsb2NrKClcbiAgICBmcmFtZVN0YXRlLmR0ID0gbm93IC0gZnJhbWVTdGF0ZS50XG4gICAgZnJhbWVTdGF0ZS50ID0gbm93XG5cbiAgICB0ZXh0dXJlU3RhdGUucG9sbCgpXG5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJhZkNhbGxiYWNrcy5sZW5ndGg7ICsraSkge1xuICAgICAgdmFyIGNiID0gcmFmQ2FsbGJhY2tzW2ldXG4gICAgICBjYihmcmFtZVN0YXRlLmNvdW50LCBmcmFtZVN0YXRlLnQsIGZyYW1lU3RhdGUuZHQpXG4gICAgfVxuICAgIGZyYW1lU3RhdGUucmVuZGVyVGltZSA9IGNsb2NrKCkgLSBub3dcbiAgfVxuXG4gIGZ1bmN0aW9uIHN0YXJ0UkFGICgpIHtcbiAgICBpZiAoIWFjdGl2ZVJBRiAmJiByYWZDYWxsYmFja3MubGVuZ3RoID4gMCkge1xuICAgICAgaGFuZGxlUkFGKClcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzdG9wUkFGICgpIHtcbiAgICBpZiAoYWN0aXZlUkFGKSB7XG4gICAgICByYWYuY2FuY2VsKGhhbmRsZVJBRilcbiAgICAgIGFjdGl2ZVJBRiA9IDBcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVDb250ZXh0TG9zcyAoZXZlbnQpIHtcbiAgICBzdG9wUkFGKClcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpXG4gICAgaWYgKG9wdGlvbnMub25Db250ZXh0TG9zdCkge1xuICAgICAgb3B0aW9ucy5vbkNvbnRleHRMb3N0KClcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVDb250ZXh0UmVzdG9yZWQgKGV2ZW50KSB7XG4gICAgZ2wuZ2V0RXJyb3IoKVxuICAgIGV4dGVuc2lvblN0YXRlLnJlZnJlc2goKVxuICAgIGJ1ZmZlclN0YXRlLnJlZnJlc2goKVxuICAgIHRleHR1cmVTdGF0ZS5yZWZyZXNoKClcbiAgICByZW5kZXJidWZmZXJTdGF0ZS5yZWZyZXNoKClcbiAgICBmcmFtZWJ1ZmZlclN0YXRlLnJlZnJlc2goKVxuICAgIHNoYWRlclN0YXRlLnJlZnJlc2goKVxuICAgIGdsU3RhdGUucmVmcmVzaCgpXG4gICAgaWYgKG9wdGlvbnMub25Db250ZXh0UmVzdG9yZWQpIHtcbiAgICAgIG9wdGlvbnMub25Db250ZXh0UmVzdG9yZWQoKVxuICAgIH1cbiAgICBoYW5kbGVSQUYoKVxuICB9XG5cbiAgaWYgKGNhbnZhcykge1xuICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKENPTlRFWFRfTE9TVF9FVkVOVCwgaGFuZGxlQ29udGV4dExvc3MsIGZhbHNlKVxuICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKENPTlRFWFRfUkVTVE9SRURfRVZFTlQsIGhhbmRsZUNvbnRleHRSZXN0b3JlZCwgZmFsc2UpXG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95ICgpIHtcbiAgICBzdG9wUkFGKClcblxuICAgIGlmIChjYW52YXMpIHtcbiAgICAgIGNhbnZhcy5yZW1vdmVFdmVudExpc3RlbmVyKENPTlRFWFRfTE9TVF9FVkVOVCwgaGFuZGxlQ29udGV4dExvc3MpXG4gICAgICBjYW52YXMucmVtb3ZlRXZlbnRMaXN0ZW5lcihDT05URVhUX1JFU1RPUkVEX0VWRU5ULCBoYW5kbGVDb250ZXh0UmVzdG9yZWQpXG4gICAgfVxuXG4gICAgc2hhZGVyU3RhdGUuY2xlYXIoKVxuICAgIGZyYW1lYnVmZmVyU3RhdGUuY2xlYXIoKVxuICAgIHJlbmRlcmJ1ZmZlclN0YXRlLmNsZWFyKClcbiAgICB0ZXh0dXJlU3RhdGUuY2xlYXIoKVxuICAgIGJ1ZmZlclN0YXRlLmNsZWFyKClcblxuICAgIGlmIChvcHRpb25zLm9uRGVzdHJveSkge1xuICAgICAgb3B0aW9ucy5vbkRlc3Ryb3koKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNvbXBpbGVQcm9jZWR1cmUgKG9wdGlvbnMpIHtcbiAgICBcbiAgICBcblxuICAgIHZhciBoYXNEeW5hbWljID0gZmFsc2VcblxuICAgIGZ1bmN0aW9uIGZsYXR0ZW5OZXN0ZWRPcHRpb25zIChvcHRpb25zKSB7XG4gICAgICB2YXIgcmVzdWx0ID0gZXh0ZW5kKHt9LCBvcHRpb25zKVxuICAgICAgZGVsZXRlIHJlc3VsdC51bmlmb3Jtc1xuICAgICAgZGVsZXRlIHJlc3VsdC5hdHRyaWJ1dGVzXG5cbiAgICAgIGZ1bmN0aW9uIG1lcmdlIChuYW1lKSB7XG4gICAgICAgIGlmIChuYW1lIGluIHJlc3VsdCkge1xuICAgICAgICAgIHZhciBjaGlsZCA9IHJlc3VsdFtuYW1lXVxuICAgICAgICAgIGRlbGV0ZSByZXN1bHRbbmFtZV1cbiAgICAgICAgICBPYmplY3Qua2V5cyhjaGlsZCkuZm9yRWFjaChmdW5jdGlvbiAocHJvcCkge1xuICAgICAgICAgICAgcmVzdWx0W25hbWUgKyAnLicgKyBwcm9wXSA9IGNoaWxkW3Byb3BdXG4gICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgbWVyZ2UoJ2JsZW5kJylcbiAgICAgIG1lcmdlKCdkZXB0aCcpXG4gICAgICBtZXJnZSgnY3VsbCcpXG4gICAgICBtZXJnZSgnc3RlbmNpbCcpXG4gICAgICBtZXJnZSgncG9seWdvbk9mZnNldCcpXG4gICAgICBtZXJnZSgnc2Npc3NvcicpXG4gICAgICBtZXJnZSgnc2FtcGxlJylcblxuICAgICAgcmV0dXJuIHJlc3VsdFxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHNlcGFyYXRlRHluYW1pYyAob2JqZWN0KSB7XG4gICAgICB2YXIgc3RhdGljSXRlbXMgPSB7fVxuICAgICAgdmFyIGR5bmFtaWNJdGVtcyA9IHt9XG4gICAgICBPYmplY3Qua2V5cyhvYmplY3QpLmZvckVhY2goZnVuY3Rpb24gKG9wdGlvbikge1xuICAgICAgICB2YXIgdmFsdWUgPSBvYmplY3Rbb3B0aW9uXVxuICAgICAgICBpZiAoZHluYW1pYy5pc0R5bmFtaWModmFsdWUpKSB7XG4gICAgICAgICAgaGFzRHluYW1pYyA9IHRydWVcbiAgICAgICAgICBkeW5hbWljSXRlbXNbb3B0aW9uXSA9IGR5bmFtaWMudW5ib3godmFsdWUsIG9wdGlvbilcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzdGF0aWNJdGVtc1tvcHRpb25dID0gdmFsdWVcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGR5bmFtaWM6IGR5bmFtaWNJdGVtcyxcbiAgICAgICAgc3RhdGljOiBzdGF0aWNJdGVtc1xuICAgICAgfVxuICAgIH1cblxuICAgIHZhciB1bmlmb3JtcyA9IHNlcGFyYXRlRHluYW1pYyhvcHRpb25zLnVuaWZvcm1zIHx8IHt9KVxuICAgIHZhciBhdHRyaWJ1dGVzID0gc2VwYXJhdGVEeW5hbWljKG9wdGlvbnMuYXR0cmlidXRlcyB8fCB7fSlcbiAgICB2YXIgb3B0cyA9IHNlcGFyYXRlRHluYW1pYyhmbGF0dGVuTmVzdGVkT3B0aW9ucyhvcHRpb25zKSlcblxuICAgIHZhciBjb21waWxlZCA9IGNvbXBpbGVyLmNvbW1hbmQoXG4gICAgICBvcHRzLnN0YXRpYywgdW5pZm9ybXMuc3RhdGljLCBhdHRyaWJ1dGVzLnN0YXRpYyxcbiAgICAgIG9wdHMuZHluYW1pYywgdW5pZm9ybXMuZHluYW1pYywgYXR0cmlidXRlcy5keW5hbWljLFxuICAgICAgaGFzRHluYW1pYylcblxuICAgIHZhciBkcmF3ID0gY29tcGlsZWQuZHJhd1xuICAgIHZhciBiYXRjaCA9IGNvbXBpbGVkLmJhdGNoXG4gICAgdmFyIHNjb3BlID0gY29tcGlsZWQuc2NvcGVcblxuICAgIHZhciBFTVBUWV9BUlJBWSA9IFtdXG4gICAgZnVuY3Rpb24gcmVzZXJ2ZSAoY291bnQpIHtcbiAgICAgIHdoaWxlIChFTVBUWV9BUlJBWS5sZW5ndGggPCBjb3VudCkge1xuICAgICAgICBFTVBUWV9BUlJBWS5wdXNoKG51bGwpXG4gICAgICB9XG4gICAgICByZXR1cm4gRU1QVFlfQVJSQVlcbiAgICB9XG5cbiAgICBcblxuICAgIGZ1bmN0aW9uIFJFR0xDb21tYW5kIChhcmdzLCBib2R5KSB7XG4gICAgICBpZiAodHlwZW9mIGFyZ3MgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgcmV0dXJuIHNjb3BlKG51bGwsIGFyZ3MpXG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBib2R5ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHJldHVybiBzY29wZShhcmdzLCBib2R5KVxuICAgICAgfVxuXG4gICAgICAvLyBSdW50aW1lIHNoYWRlciBjaGVjay4gIFJlbW92ZWQgaW4gcHJvZHVjdGlvbiBidWlsZHNcbiAgICAgIFxuXG4gICAgICBpZiAodHlwZW9mIGFyZ3MgPT09ICdudW1iZXInKSB7XG4gICAgICAgIHJldHVybiBiYXRjaChhcmdzIHwgMCwgcmVzZXJ2ZShhcmdzIHwgMCkpXG4gICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoYXJncykpIHtcbiAgICAgICAgcmV0dXJuIGJhdGNoKGFyZ3MubGVuZ3RoLCBhcmdzKVxuICAgICAgfVxuICAgICAgcmV0dXJuIGRyYXcoYXJncylcbiAgICB9XG5cbiAgICByZXR1cm4gUkVHTENvbW1hbmRcbiAgfVxuXG4gIGZ1bmN0aW9uIHBvbGwgKCkge1xuICAgIGZyYW1lYnVmZmVyU3RhdGUucG9sbCgpXG4gICAgZ2xTdGF0ZS5wb2xsKClcbiAgfVxuXG4gIGZ1bmN0aW9uIGNsZWFyIChvcHRpb25zKSB7XG4gICAgdmFyIGNsZWFyRmxhZ3MgPSAwXG5cbiAgICBwb2xsKClcblxuICAgIHZhciBjID0gb3B0aW9ucy5jb2xvclxuICAgIGlmIChjKSB7XG4gICAgICBnbC5jbGVhckNvbG9yKCtjWzBdIHx8IDAsICtjWzFdIHx8IDAsICtjWzJdIHx8IDAsICtjWzNdIHx8IDApXG4gICAgICBjbGVhckZsYWdzIHw9IEdMX0NPTE9SX0JVRkZFUl9CSVRcbiAgICB9XG4gICAgaWYgKCdkZXB0aCcgaW4gb3B0aW9ucykge1xuICAgICAgZ2wuY2xlYXJEZXB0aCgrb3B0aW9ucy5kZXB0aClcbiAgICAgIGNsZWFyRmxhZ3MgfD0gR0xfREVQVEhfQlVGRkVSX0JJVFxuICAgIH1cbiAgICBpZiAoJ3N0ZW5jaWwnIGluIG9wdGlvbnMpIHtcbiAgICAgIGdsLmNsZWFyU3RlbmNpbChvcHRpb25zLnN0ZW5jaWwgfCAwKVxuICAgICAgY2xlYXJGbGFncyB8PSBHTF9TVEVOQ0lMX0JVRkZFUl9CSVRcbiAgICB9XG5cbiAgICBcbiAgICBnbC5jbGVhcihjbGVhckZsYWdzKVxuICB9XG5cbiAgZnVuY3Rpb24gZnJhbWUgKGNiKSB7XG4gICAgcmFmQ2FsbGJhY2tzLnB1c2goY2IpXG5cbiAgICBmdW5jdGlvbiBjYW5jZWwgKCkge1xuICAgICAgdmFyIGluZGV4ID0gcmFmQ2FsbGJhY2tzLmZpbmQoZnVuY3Rpb24gKGl0ZW0pIHtcbiAgICAgICAgcmV0dXJuIGl0ZW0gPT09IGNiXG4gICAgICB9KVxuICAgICAgaWYgKGluZGV4IDwgMCkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIHJhZkNhbGxiYWNrcy5zcGxpY2UoaW5kZXgsIDEpXG4gICAgICBpZiAocmFmQ2FsbGJhY2tzLmxlbmd0aCA8PSAwKSB7XG4gICAgICAgIHN0b3BSQUYoKVxuICAgICAgfVxuICAgIH1cblxuICAgIHN0YXJ0UkFGKClcblxuICAgIHJldHVybiB7XG4gICAgICBjYW5jZWw6IGNhbmNlbFxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBleHRlbmQoY29tcGlsZVByb2NlZHVyZSwge1xuICAgIC8vIENsZWFyIGN1cnJlbnQgRkJPXG4gICAgY2xlYXI6IGNsZWFyLFxuXG4gICAgLy8gU2hvcnQgY3V0IGZvciBwcm9wIGJpbmRpbmdcbiAgICBwcm9wOiBkeW5hbWljLmRlZmluZSxcblxuICAgIC8vIGV4ZWN1dGVzIGFuIGVtcHR5IGRyYXcgY29tbWFuZFxuICAgIGRyYXc6IGNvbXBpbGVQcm9jZWR1cmUoe30pLFxuXG4gICAgLy8gUmVzb3VyY2VzXG4gICAgZWxlbWVudHM6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICByZXR1cm4gZWxlbWVudFN0YXRlLmNyZWF0ZShvcHRpb25zKVxuICAgIH0sXG4gICAgYnVmZmVyOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgcmV0dXJuIGJ1ZmZlclN0YXRlLmNyZWF0ZShvcHRpb25zLCBHTF9BUlJBWV9CVUZGRVIpXG4gICAgfSxcbiAgICB0ZXh0dXJlOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgcmV0dXJuIHRleHR1cmVTdGF0ZS5jcmVhdGUob3B0aW9ucywgR0xfVEVYVFVSRV8yRClcbiAgICB9LFxuICAgIGN1YmU6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gNikge1xuICAgICAgICByZXR1cm4gdGV4dHVyZVN0YXRlLmNyZWF0ZShcbiAgICAgICAgICBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpLFxuICAgICAgICAgIEdMX1RFWFRVUkVfQ1VCRV9NQVApXG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gdGV4dHVyZVN0YXRlLmNyZWF0ZShvcHRpb25zLCBHTF9URVhUVVJFX0NVQkVfTUFQKVxuICAgICAgfVxuICAgIH0sXG4gICAgcmVuZGVyYnVmZmVyOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgcmV0dXJuIHJlbmRlcmJ1ZmZlclN0YXRlLmNyZWF0ZShvcHRpb25zKVxuICAgIH0sXG4gICAgZnJhbWVidWZmZXI6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICByZXR1cm4gZnJhbWVidWZmZXJTdGF0ZS5jcmVhdGUob3B0aW9ucylcbiAgICB9LFxuICAgIGZyYW1lYnVmZmVyQ3ViZTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgIFxuICAgIH0sXG5cbiAgICAvLyBGcmFtZSByZW5kZXJpbmdcbiAgICBmcmFtZTogZnJhbWUsXG4gICAgc3RhdHM6IGZyYW1lU3RhdGUsXG5cbiAgICAvLyBTeXN0ZW0gbGltaXRzXG4gICAgbGltaXRzOiBsaW1pdHMsXG5cbiAgICAvLyBSZWFkIHBpeGVsc1xuICAgIHJlYWQ6IHJlYWRQaXhlbHMsXG5cbiAgICAvLyBEZXN0cm95IHJlZ2wgYW5kIGFsbCBhc3NvY2lhdGVkIHJlc291cmNlc1xuICAgIGRlc3Ryb3k6IGRlc3Ryb3lcbiAgfSlcbn1cbiJdfQ==
