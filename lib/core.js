var check = require('./util/check')
var createEnvironment = require('./util/codegen')
var loop = require('./util/loop')
var isTypedArray = require('./util/is-typed-array')
var isNDArray = require('./util/is-ndarray')

var primTypes = require('./constants/primitives.json')
var glTypes = require('./constants/dtypes.json')

// "cute" names for vector components
var CUTE_COMPONENTS = 'xyzw'.split('')

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

var S_BATCH_ID = 'batchId'
var S_FRAMEBUFFER_WIDTH = S_FRAMEBUFFER + SUFFIX_WIDTH
var S_FRAMEBUFFER_HEIGHT = S_FRAMEBUFFER_HEIGHT + SUFFIX_HEIGHT
var S_VIEWPORT_WIDTH = S_VIEWPORT + SUFFIX_WIDTH
var S_VIEWPORT_HEIGHT = S_VIEWPORT + SUFFIX_HEIGHT
var S_DRAWINGBUFFER = 'drawingBuffer'
var S_DRAWINGBUFFER_WIDTH = S_DRAWINGBUFFER + SUFFIX_WIDTH
var S_DRAWINGBUFFER_HEIGHT = S_DRAWINGBUFFER + SUFFIX_HEIGHT

var GL_ARRAY_BUFFER = 34962
// var GL_ELEMENT_ARRAY_BUFFER = 34963

var GL_FRAGMENT_SHADER = 35632
var GL_VERTEX_SHADER = 35633

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
  'frag': 35632,
  'vert': 35633
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

/*
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
*/

// test if a dynamic variable is constant over a batch
function batchConstant (x) {
  return !(
    x.type === DYN_FUNC ||
    x.type === DYN_PROP)
}

function findInfo (list, name) {
  for (var i = 0; i < list.length; ++i) {
    if (list[i].name === name) {
      return list[i]
    }
  }
  return null
}

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

  var currentState = {}
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

  var sharedState = {
    gl: gl,
    context: contextState,
    strings: stringStore,
    next: nextState,
    current: currentState,
    draw: drawState,
    element: elementState,
    buffer: bufferState,
    shader: shaderState,
    attribute: attributeState,
    uniform: uniformState,
    framebuffer: framebufferState,

    isBufferArgs: isBufferArgs
  }

  if (extInstancing) {
    sharedState.instancing = extInstancing
  }

  var sharedConstants = {
    primTypes: primTypes,
    compareFuncs: compareFuncs,
    blendFuncs: blendFuncs,
    blendEquations: blendEquations,
    stencilOps: stencilOps,
    glTypes: glTypes
  }

  var drawCallCounter = 0
  function createREGLEnvironment () {
    var env = createEnvironment()
    var link = env.link
    var global = env.global
    env.id = drawCallCounter++

    // link shared state
    var SHARED = link(sharedState)
    var shared = env.shared = {
      props: 'a0',
      count: 'a1'
    }
    Object.keys(sharedState).forEach(function (prop) {
      shared[prop] = global.def(SHARED, '.', prop)
    })

    // Inject runtime assertion stuff for debug builds
    check.optional(function (command) {
      shared.check = link(check)
      shared.command = link(command)
    })

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
          return block.def(
            link(x.data), '.call(this,', shared.props, ',', shared.context, ')')
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

    env.setProg = function (program) {
      env.program = link(program)
      env.attributes = program.attributes.map(function (_, i) {
        return global.def(env.program, '.attributes[', i, ']')
      })
      env.uniforms = program.uniforms.map(function (_, i) {
        return global.def(env.program, '.uniforms[', i, ']')
      })
    }

    return env
  }

  function bindAttribute (env, entry, exit, ATTRIBUTE, size, record) {
    var shared = env.shared

    var GL = shared.gl

    var LOCATION = entry.def(ATTRIBUTE, '.location')
    var BINDING = entry.def(shared.attribute, '.state[', LOCATION, ']')

    var POINTER = record.pointer
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
      entry(
        'if(!', BINDING, '.pointer){',
        GL, '.enableVertexAttribArray(', LOCATION, ');',
        BINDING, '.pointer=true;}')

      var TYPE
      if (record.type && typeof record.type === 'number') {
        TYPE = record.type
      } else if (!record.type) {
        TYPE = entry.def(
          BUFFER, '.dtype||',
          GL_FLOAT)
      } else {
        TYPE = entry.def(
          record.type, '||',
          BUFFER, '.dtype||',
          GL_FLOAT)
      }

      var SIZE
      if (!record.size) {
        SIZE = size
      } else {
        SIZE = entry.def(record.size, '||', size)
      }

      entry('if(',
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
    }

    function emitConstant () {
      entry(
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

    if (POINTER === true) {
      emitBuffer()
    } else if (!POINTER) {
      emitConstant()
    } else {
      entry('if(', POINTER, '){')
      emitBuffer()
      entry('}else{')
      emitConstant()
      entry('}')
    }

    // Clean up streaming data
    var IS_STREAM = record.isStream
    if (IS_STREAM) {
      exit(
        'if(', IS_STREAM, ')',
        env.shared.buffer, '.destroyStream(', BUFFER, ');')
    }
  }

  // ===================================================
  // ===================================================
  // SHADER SINGLE DRAW OPERATION
  // ===================================================
  // ===================================================
  function compileDrawCommand (
    env, block, program, options, uniforms, attributes, attributeDefs) {
    var entry = env.block()
    var exit = env.block()
    block(entry, exit)

    program.attributes.forEach(function (attribute, i) {
      var record
      if (attribute.name in attributeDefs) {
        record = attributeDefs[attribute.name].append(env, entry)
      } else {
        var binding = env.scopeAttrib(attribute.name)
        record = {
          isStream: false
        }
        Object.keys(new AttributeRecord()).forEach(function (key) {
          record[key] = entry.def(binding, '.', key)
        })
      }
      bindAttribute(
        env,
        entry,
        exit,
        env.attributes[i],
        typeLength(attribute.info.type),
        record)
    })

    /*
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
    */
  }

  // ===================================================
  // ===================================================
  // BATCH DRAW OPERATION
  // ===================================================
  // ===================================================
  function compileBatchCommand (env, batch, program, options, uniforms, attributes, attributeDefs) {
    var invoke = env.invoke

    var entry = env.block()
    var head = env.block()
    var draw = env.block()
    var tail = env.block()
    var exit = env.block()

    function def (block, init) {
      var result = batch.def()
      block(result, '=', init, ';')
      return result
    }

    var CURRENT_VARS = env.current

    var shared = env.shared

    var BATCH_ID = batch.def()
    var NUM_PROPS = shared.count
    var PROP_LIST = shared.props
    var PROPS = shared.props = batch.def()

    var CONTEXT = shared.context
    var CURRENT_STATE = shared.current
    var GL = shared.gl

    var constants = env.constants

    var COMPARE_FUNCS = constants.compareFuncs
    var BLEND_FUNCS = constants.blendFuncs
    var BLEND_EQUATIONS = constants.blendEquations
    var STENCIL_OPS = constants.stencilOps

    batch(
      entry,
      'for(', BATCH_ID, '=0;', BATCH_ID, '<', NUM_PROPS, ';++', BATCH_ID, '){',
      PROPS, '=', PROP_LIST, '[', BATCH_ID, '];',
      CONTEXT, '.batchId=', BATCH_ID, ';',
      head,
      draw,
      tail,
      '}',
      exit)

    /*
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
    */

    // -------------------------------
    // set dynamic flags
    // -------------------------------
    var dynamicOptions = options.dynamic
    Object.keys(dynamicOptions).forEach(function (param) {
      var dyn = dynamicOptions[param]
      if (batchConstant(dyn)) {
        return
      }

      if ([ S_VERT,
            S_FRAG,
            S_OFFSET,
            S_COUNT,
            S_INSTANCES,
            S_PRIMITIVE ].indexOf(param) >= 0) {
        return
      }

      var VALUE = invoke(head, dyn)
      var name = propName(param)
      function handleDynamic (x) {
        var NEXT
        if (Array.isArray(x)) {
          var n = x.length
          NEXT = x.map(function (c) {
            return def(head, c)
          })
          head(GL, '.', GL_VARIABLES[name], '(', NEXT, ');')
          var CURRENT = CURRENT_VARS[name]
          loop(n, function (i) {
            exit(CURRENT, '[', i, ']=', NEXT[i], ';')
          })
        } else {
          NEXT = def(head, x)
          var flag = GL_FLAGS[name]
          if (flag) {
            head('if(', NEXT, '){',
              GL, '.enable(', flag, ');',
              '}else{',
              GL, '.disable(', flag, ');',
              '}')
          } else {
            head(GL, '.', GL_VARIABLES[name], '(', NEXT, ');')
          }
          exit(CURRENT_STATE, '.', name, '=', NEXT, ';')
        }
      }

      function arrayOf (n) {
        return loop(n, function (i) {
          return VALUE + '[' + i + ']'
        })
      }

      switch (param) {
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
        case S_STENCIL_MASK:
        case S_LINE_WIDTH:
          handleDynamic(VALUE)
          break

        case S_DEPTH_FUNC:
          handleDynamic(COMPARE_FUNCS + '[' + VALUE + ']')
          break

        case S_DEPTH_RANGE:
          handleDynamic(arrayOf(2))
          break

        case S_BLEND_COLOR:
          handleDynamic(arrayOf(4))
          break

        case S_BLEND_EQUATION:
          handleDynamic(['rgb', 'alpha'].map(function (suffix) {
            return BLEND_EQUATIONS + '["' + suffix + '" in ' + VALUE +
              '?' + VALUE + '.' + suffix +
              ':' + VALUE + ']'
          }))
          break

        case S_BLEND_FUNC:
          handleDynamic([
            ['src', 'RGB'],
            ['dst', 'RGB'],
            ['src', 'Alpha'],
            ['dst', 'Alpha']
          ].map(function (parts) {
            return BLEND_FUNCS + '["' + parts.join('') + '" in ' + VALUE +
              '?' + VALUE + '.' + parts.join('') +
              ':' + VALUE + '.' + parts[0] + ']'
          }))
          break

        case S_STENCIL_FUNC:
          handleDynamic([
            '"cmp" in ' + VALUE +
            '?' + COMPARE_FUNCS + '[' + VALUE + '.cmp]:' + GL_ALWAYS,
            '"mask" in ' + VALUE +
            '?' + VALUE + '.mask:-1'
          ])
          break

        case S_STENCIL_OPFRONT:
        case S_STENCIL_OPBACK:
          var escapeStencilOp = function (op) {
            return '"' + op + '" in ' + VALUE +
              '?' + STENCIL_OPS + '[' + VALUE + '.' + op + ']:' + GL_KEEP
          }
          handleDynamic([
            param === S_STENCIL_OPFRONT ? GL_FRONT : GL_BACK,
            escapeStencilOp('fail'),
            escapeStencilOp('zfail'),
            escapeStencilOp('pass')
          ])
          break

        case S_POLYGON_OFFSET_OFFSET:
          handleDynamic([
            VALUE + '.factor|0',
            VALUE + '.units|0'
          ])
          break

        case S_CULL_FACE:
          handleDynamic(VALUE + '==="front"?' + GL_FRONT + ':' + GL_BACK)
          break

        case S_FRONT_FACE:
          handleDynamic(VALUE + '==="cw"?' + GL_CW + ':' + GL_CCW)
          break

        case S_COLOR_MASK:
          handleDynamic(arrayOf(4))
          break

        case S_SAMPLE_COVERAGE:
          handleDynamic([
            '+' + VALUE + '.value',
            '!!' + VALUE + '.invert'
          ])
          break

        case S_SCISSOR_BOX:
        case S_VIEWPORT:
          handleDynamic([
            VALUE + '.x|0',
            VALUE + '.y|0',
            '"w" in ' + VALUE + '?' + VALUE + '.w|0:' + CONTEXT + '.' + S_FRAMEBUFFER_WIDTH,
            '"h" in ' + VALUE + '?' + VALUE + '.h|0:' + CONTEXT + '.' + S_FRAMEBUFFER_HEIGHT
          ])
          break

        default:
          check.commandRaise('unsupported option for batch command: ' + param)
      }
    })

    // -------------------------------
    // handle attributes
    // -------------------------------
    program.attributes.forEach(function (attribute, i) {
      var record
      var bindEntry = entry
      var bindExit = exit
      if (attribute.name in attributeDefs) {
        var defn = attributeDefs[attribute.name]
        if (defn.batchConstant) {
          record = defn.append(env, entry)
        } else {
          record = defn.append(env, head)
          bindEntry = head
          bindExit = tail
        }
      } else {
        var binding = env.scopeAttrib(attribute.name)
        record = {
          isStream: false
        }
        Object.keys(new AttributeRecord()).forEach(function (key) {
          record[key] = entry.def(binding, '.', key)
        })
      }
      bindAttribute(
        env,
        bindEntry,
        bindExit,
        env.attributes[i],
        typeLength(attribute.info.type),
        record)
    })

    /*
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
    */
  }

  // ===========================================================================
  // ===========================================================================
  // MAIN DRAW COMMAND
  // ===========================================================================
  // ===========================================================================
  function compileCommand (options, attributes, uniforms, context) {
    // Create code generation environment
    var env = createREGLEnvironment()
    var link = env.link
    var block = env.block
    var proc = env.proc
    var invoke = env.invoke

    var CALL_ID = env.id

    var shared = env.shared

    var NEXT_VARS = env.next
    var CURRENT_VARS = env.current

    var CONTEXT = shared.context
    var STRING_STORE = shared.strings
    var NEXT_STATE = shared.next
    var CURRENT_STATE = shared.current
    var GL = shared.gl
    var FRAMEBUFFER_STATE = shared.framebuffer
    var DRAW_STATE = shared.draw
    var ELEMENT_STATE = shared.element
    var BUFFER_STATE = shared.buffer
    var SHADER_STATE = shared.shader
    var UNIFORM_STATE = shared.uniform
    var ATTRIBUTE_STATE = shared.attribute

    var IS_BUFFER_ARGS = shared.isBufferArgs

    var constants = env.constants

    var PRIM_TYPES = constants.primTypes
    var COMPARE_FUNCS = constants.compareFuncs
    var BLEND_FUNCS = constants.blendFuncs
    var BLEND_EQUATIONS = constants.blendEquations
    var STENCIL_OPS = constants.stencilOps
    var GL_TYPES = constants.glTypes

    // -------------------------------
    // Initialize procedures
    // -------------------------------
    var scope = proc('scope')
    var draw = proc('draw')
    var batch = proc('batch')

    // initialize props
    scope.arg()
    batch.arg()
    draw.arg()

    var entry = block()
    var exit = block()
    var scopeExit = block()
    var dynamicEntry = block()
    var dynamicExit = block()

    scope(entry, dynamicEntry)
    batch(entry)
    draw(entry, dynamicEntry)

    // -------------------------------
    // saves a property onto the local stack
    // -------------------------------
    function saveScope (object, prop) {
      var TEMP = scope.def(object, prop)
      scopeExit(object, prop, '=', TEMP, ';')
    }

    function setScope (object, prop, expr) {
      saveScope(object, prop)
      scope(object, prop, '=', expr, ';')
    }

    function saveAll (object, prop) {
      var TEMP = entry.def(object, prop)
      exit(object, prop, '=', TEMP, ';')
    }

    function setAll (object, prop, expr) {
      saveAll(object, prop)
      entry(object, prop, '=', expr, ';')
    }

    // =====================================================
    // update context variables
    // =====================================================
    entry(CONTEXT, '.', S_BATCH_ID, '=0;')
    var contextEnter = block()

    var staticContext = context.static
    Object.keys(staticContext).forEach(function (contextVar) {
      var PREV_VALUE = entry.def(CONTEXT, '.', contextVar)
      contextEnter(CONTEXT, '.', contextVar, '=',
        link(staticContext[contextVar]), ';')
      exit(CONTEXT, '.', contextVar, '=', PREV_VALUE, ';')
    })

    var dynamicContext = context.dynamic
    Object.keys(dynamicContext).forEach(function (contextVar) {
      var x = dynamicContext[contextVar]
      var PREV_VALUE = entry.def(CONTEXT, '.', contextVar)
      var NEXT_VALUE = invoke(entry, x)
      contextEnter(CONTEXT, '.', contextVar, '=', NEXT_VALUE, ';')
      exit(CONTEXT, '.', contextVar, '=', PREV_VALUE, ';')
    })

    entry(contextEnter)

    // =====================================================
    // update miscellaneous options
    // =====================================================
    var staticOptions = options.static
    var dynamicOptions = options.dynamic

    // -------------------------------
    // update framebuffer and viewport
    // -------------------------------
    /*
    var hasStaticViewport = S_VIEWPORT in staticOptions
    var hasDynamicViewport = S_VIEWPORT in dynamicOptions
    var hasViewport = hasStaticViewport || hasDynamicViewport
    var hasStaticScissorBox = S_SCISSOR_BOX in staticOptions
    var hasDynamicScissorBox = S_SCISSOR_BOX in dynamicOptions
    var hasScissorBox = hasStaticScissorBox || hasDynamicScissorBox
    var hasStaticFramebuffer = S_FRAMEBUFFER in staticOptions
    var hasDynamicFramebuffer = S_FRAMEBUFFER in dynamicOptions
    var hasFramebuffer = hasStaticFramebuffer || hasDynamicFramebuffer

    var VIEWPORT = NEXT_VARS.viewport
    var SCISSOR_BOX = NEXT_VARS.scissor_box

    function saveViewBox (name) {
      loop(4, function (i) {
        saveAll(NEXT_VARS[propName[name]], '[' + i + ']')
      })
    }
    if (hasFramebuffer || hasViewport) {
      saveViewBox(S_VIEWPORT)
    }
    if (hasFramebuffer || hasScissorBox) {
      saveViewBox(S_SCISSOR_BOX)
    }
    if (hasFramebuffer) {
      saveAll(FRAMEBUFFER_STATE, '.next')
      saveAll(CONTEXT, '.' + S_FRAMEBUFFER_WIDTH)
      saveAll(CONTEXT, '.' + S_FRAMEBUFFER_HEIGHT)
    }

    var widthPrefix = CONTEXT + '.' + S_FRAMEBUFFER_WIDTH + '='
    var heightPrefix = CONTEXT + '.' + S_FRAMEBUFFER_HEIGHT + '='
    if (!hasViewport) {
      widthPrefix += CONTEXT + '.' + S_VIEWPORT_WIDTH + '=' +
        VIEWPORT + '[2]='
      heightPrefix += CONTEXT + '.' + S_VIEWPORT_HEIGHT + '=' +
        VIEWPORT + '[3]='
    }
    if (!hasScissorBox) {
      widthPrefix += SCISSOR_BOX + '[2]='
      heightPrefix += SCISSOR_BOX + '[3]='
    }

    var FRAMEBUFFER
    if (hasStaticFramebuffer) {
      var framebuffer = staticOptions.framebuffer
      if (framebuffer) {
        entry(
          FRAMEBUFFER_STATE, '.next=null;',
          widthPrefix, CONTEXT, '.', S_DRAWINGBUFFER_WIDTH, ';',
          heightPrefix, CONTEXT, '.', S_DRAWINGBUFFER_HEIGHT, ';')
      } else {
        var _framebuffer = framebufferState.getFramebuffer(framebuffer)
        check.command(framebuffer, 'invalid framebuffer object')
        FRAMEBUFFER = link(_framebuffer)
        entry(
          FRAMEBUFFER_STATE, '.next=', FRAMEBUFFER, ';',
          widthPrefix, CONTEXT, FRAMEBUFFER, '.width;',
          heightPrefix, CONTEXT, FRAMEBUFFER, '.height;')
      }
    }

    if (hasDynamicFramebuffer) {
      FRAMEBUFFER = invoke(dynamicEntry, dynamicOptions.framebuffer)
      dynamicEntry(
        'if(', FRAMEBUFFER, '){',
        FRAMEBUFFER_STATE, '.next=', FRAMEBUFFER, ';',
        widthPrefix, FRAMEBUFFER, '.width;',
        heightPrefix, FRAMEBUFFER, '.height;',
        '}else{',
        FRAMEBUFFER_STATE, '.next=null;',
        widthPrefix, CONTEXT, '.', S_DRAWINGBUFFER_WIDTH, ';',
        heightPrefix, CONTEXT, '.', S_DRAWINGBUFFER_HEIGHT, ';}')
      draw(FRAMEBUFFER_STATE, '.poll();')
    } else {
      batch(FRAMEBUFFER_STATE, '.poll();')
      draw(FRAMEBUFFER_STATE, '.poll();')
    }

    function setBoxParameter (sname) {
      var name = propName(sname)
      var BOX = NEXT_VARS[name]
      var viewportWidth = ''
      var viewportHeight = ''
      if (name === S_VIEWPORT) {
        viewportWidth = CONTEXT + '.' + S_VIEWPORT_WIDTH + '='
        viewportHeight = CONTEXT + '.' + S_VIEWPORT_HEIGHT + '='
      }
      if (sname in staticOptions) {
        var box = staticOptions[sname]
        check.commandType(box, 'object', sname)
        var boxX = box.x || 0
        var boxY = box.y || 0
        check.commandType(boxX, 'number', sname + '.x')
        check.commandType(boxY, 'number', sname + '.y')
        entry(
          BOX, '[0]=', boxX, ';',
          BOX, '[1]=', boxY, ';')
        if ('w' in box) {
          check.commandType(box.w, 'number', sname + '.w')
          entry(viewportWidth, BOX, '[2]=', box.w, ';')
        } else {
          entry(viewportWidth, BOX, '[2]=', CONTEXT, '.', S_FRAMEBUFFER_WIDTH, ';')
        }
        if ('h' in box) {
          check.commandType(box.h, 'number', sname + '.h')
          entry(viewportHeight, BOX, '[3]=', box.h, ';')
        } else {
          entry(viewportHeight, BOX, '[3]=', CONTEXT, '.', S_FRAMEBUFFER_HEIGHT, ';')
        }
      } else if (sname in dynamicOptions) {
        var value = invoke(dynamicEntry, dynamicOptions[sname])
        dynamicEntry(
          BOX, '[0]=', value, '.x|0;',
          BOX, '[1]=', value, '.y|0;',
          viewportWidth, BOX, '[2]="w" in ', value, '?', value, '.w:', CONTEXT, '.', S_FRAMEBUFFER_WIDTH, ';',
          viewportHeight, BOX, '[3]="h" in ', value, '?', value, '.h:', CONTEXT, '.', S_FRAMEBUFFER_HEIGHT, ';')
      } else if (hasFramebuffer) {
        entry(BOX, '[0]=', BOX, '[1]=0;')
      }

      // poll changes
      var pollBlock = block()

      var CUR_BOX = CURRENT_VARS[name]
      pollBlock(
        'if(', loop(4, function (i) {
          return CUR_BOX + '[' + i + ']===' + BOX + '[' + i + ']'
        }).join('||'), '){',
        GL, '.', GL_VARIABLES[name], '(', loop(4, function (i) {
          return BOX + '[' + i + ']'
        }), ');', loop(4, function (i) {
          return CUR_BOX + '[' + i + ']=' + BOX + '[' + i + '];'
        }).join(''), '}')
      draw(pollBlock)
      if (name in staticOptions || !hasDynamicFramebuffer) {
        batch(pollBlock)
      }
    }
    setBoxParameter(S_VIEWPORT)
    setBoxParameter(S_SCISSOR_BOX)
    */

    // -------------------------------
    // update element buffer
    // -------------------------------
    /*
    var hasPrimitive = !(
      (S_PRIMITIVE in staticOptions) ||
      (S_PRIMITIVE in dynamicOptions))
    var hasCount = !(
      (S_COUNT in staticOptions) ||
      (S_COUNT in dynamicOptions))
    var ELEMENTS
    if (S_ELEMENTS in staticOptions) {
      var inputElements = staticOptions.elements
      if (inputElements) {
        // if elements aren't null
        var elements = elementState.getElements(inputElements)
        var constantElements = !elements
        if (constantElements) {
          elements = elementState.create(inputElements)
        }
        ELEMENTS = link(elements)
        setStatic(ELEMENT_STATE, '.elements', ELEMENTS)
        if (!hasCount || !hasPrimitive) {
          if (!hasCount) {
            setStatic(DRAW_STATE, '.count=',
              constantElements
                ? elements.vertCount
                : ELEMENTS + '.vertCount')
          }
          if (!hasPrimitive) {
            setStatic(DRAW_STATE, '.primitive=',
              constantElements
                ? elements.primType
                : ELEMENTS + '.primType')
          }
        }
      } else {
        // otherwise elements are null and constant
        setStatic(ELEMENT_STATE, '.elements', 'null;')
        if (!hasCount) {
          setStatic(DRAW_STATE, '.count', -1)
        }
        if (!hasPrimitive) {
          setStatic(DRAW_STATE, '.primitive', 4)
        }
      }
    } else if ('elements' in dynamicOptions) {
      if (!hasCount) {
        saveDynamic(DRAW_STATE, '.count')
      }
      if (!hasPrimitive) {
        saveDynamic(DRAW_STATE, '.primitive')
      }
      var INPUT_ELEMENTS = invoke(dynamicEntry, dynamicOptions.elements)
      saveDynamic(ELEMENT_STATE, '.elements')
      var IS_ELEMENT_STREAM = dynamicEntry.def(false)
      dynamicEntry('if(', INPUT_ELEMENTS, '){')
      ELEMENTS = dynamicEntry.def(
        ELEMENT_STATE, '.getElements(', INPUT_ELEMENTS, ');')
      dynamicEntry('if(!', ELEMENTS, '){',
        IS_ELEMENT_STREAM, '=true;',
        ELEMENTS, '=', ELEMENT_STATE, '.createStream(', INPUT_ELEMENTS, ');}')
      dynamicExit(
        'if(', IS_ELEMENT_STREAM, ')',
        ELEMENT_STATE, '.destroyStream(', ELEMENTS, ');')
      if (!hasCount) {
        dynamicEntry(DRAW_STATE, '.count=', ELEMENTS, '.vertCount;')
      }
      if (!hasPrimitive) {
        dynamicEntry(DRAW_STATE, '.primitive=', ELEMENTS, '.primType;')
      }
      dynamicEntry(
        ELEMENT_STATE, '.elements=', ELEMENTS,
        '}else{',
        ELEMENT_STATE, '.elements=null;')
      if (!hasCount) {
        dynamicEntry(DRAW_STATE, '.count=-1;')
      }
      if (!hasPrimitive) {
        dynamicEntry(DRAW_STATE, '.primitive=4;')
      }
      dynamicEntry('}')
    }
    */

    // -------------------------------
    // first phase of shader update
    // -------------------------------
    // Special case:  vertex shader and fragment shader are static
    var staticShader = false
    var shaderBlock = block()
    var PROGRAM = shaderBlock.def()
    var program = null
    if (S_FRAG in staticOptions && S_VERT in staticOptions) {
      staticShader = true
      var fragId = stringStore.id(staticOptions.frag)
      var vertId = stringStore.id(staticOptions.vert)
      shaderState.shader(GL_FRAGMENT_SHADER, fragId)
      shaderState.shader(GL_VERTEX_SHADER, vertId)
      program = shaderState.program(vertId, fragId)
      shaderBlock(PROGRAM, '=', link(program), ';')
      setScope(SHADER_STATE, '.' + S_FRAG, fragId)
      setScope(SHADER_STATE, '.' + S_VERT, vertId)
    }

    // -------------------------------
    // update static options
    // -------------------------------
    Object.keys(staticOptions).forEach(function (param) {
      var value = staticOptions[param]
      var name = propName(param)

      function handleStaticGLState (x) {
        if (x === void 0) {
          x = value
        }

        // for batch mode
        var poll = block()
        var NEXT = NEXT_VARS[name]
        var CURRENT = CURRENT_VARS[name]
        if (NEXT) {
          var n = currentState[name].length
          loop(n, function (i) {
            setScope(NEXT, '[' + i + ']', x[i])
          })
          poll('if(', loop(n, function (i) {
            return CURRENT + '[' + i + ']!==' + x[i]
          }).join('||'), '){',
          GL, '.', GL_VARIABLES[name], '(', x, ');',
          loop(n, function (i) {
            return CURRENT + '[' + i + ']=' + x[i] + ';'
          }).join(''), '}')
        } else {
          setScope(NEXT_STATE, '.' + name, x)
          CURRENT = CURRENT_STATE + '.' + name
          poll('if(', CURRENT, '!==', x, '){')
          var flag = GL_FLAGS[name]
          if (flag) {
            if (x) {
              poll(GL, '.enable(', flag, ');')
            } else {
              poll(GL, '.disable(', flag, ');')
            }
          } else {
            poll(GL, '.', GL_VARIABLES[name], '(', x, ');')
          }
          poll(CURRENT, '=', x, ';}')
        }
        batch(poll)
        draw(poll)
      }

      switch (param) {
        case S_FRAMEBUFFER:
        case S_VIEWPORT:
        case S_SCISSOR_BOX:
        case S_ELEMENTS:
          break

        case S_VERT:
        case S_FRAG:
          if (!staticShader) {
            var shaderId = stringStore.id(staticOptions[param])
            // in debug mode, try precompiling the shader to catch any typos
            check.optional(function () {
              shaderState.shader(shaderType[param], shaderId)
            })
            setAll(SHADER_STATE, '.' + param, shaderId)
          }
          break

        case S_COUNT:
        case S_OFFSET:
        case S_INSTANCES:
          check.command(value >= 0 && typeof value === 'number',
            'invalid draw parameter "' + '"')
          setScope(DRAW_STATE, '.' + param, value)
          break

        // Update primitive type
        case S_PRIMITIVE:
          check.commandParameter(
            value, primTypes, 'not a valid drawing primitive')
          setScope(DRAW_STATE, '.' + param, primTypes[value])
          break

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
          check.commandType(value, 'boolean', param)
          handleStaticGLState()
          break

        case S_DEPTH_FUNC:
          check.commandParameter(value, compareFuncs, param)
          handleStaticGLState()
          break

        case S_DEPTH_RANGE:
          check.command(
            Array.isArray(value) &&
            value.length === 2 &&
            value[0] <= value[1],
            'depth range is 2d array')
          handleStaticGLState()
          break

        case S_BLEND_FUNC:
          check.commandType(value, 'object', 'blend.func')
          var srcRGB = ('srcRGB' in value ? value.srcRGB : value.src)
          var srcAlpha = ('srcAlpha' in value ? value.srcAlpha : value.src)
          var dstRGB = ('dstRGB' in value ? value.dstRGB : value.dst)
          var dstAlpha = ('dstAlpha' in value ? value.dstAlpha : value.dst)
          check.commandParameter(srcRGB, blendFuncs, param + '.srcRGB')
          check.commandParameter(srcAlpha, blendFuncs, param + '.srcAlpha')
          check.commandParameter(dstRGB, blendFuncs, param + '.dstRGB')
          check.commandParameter(dstAlpha, blendFuncs, param + '.dstAlpha')
          handleStaticGLState([
            blendFuncs[srcRGB],
            blendFuncs[dstRGB],
            blendFuncs[srcAlpha],
            blendFuncs[dstAlpha]
          ])
          break

        case S_BLEND_EQUATION:
          if (typeof value === 'string') {
            check.commandParameter(value, blendEquations, param)
            handleStaticGLState([
              blendEquations[value],
              blendEquations[value]
            ])
          } else if (typeof value === 'object') {
            check.commandParameter(
              value.rgb, blendEquations, param + '.rgb')
            check.commandParameter(
              value.alpha, blendEquations, param + '.alpha')
            handleStaticGLState([
              blendEquations[value.rgb],
              blendEquations[value.alpha]
            ])
          } else {
            check.commandRaise('invalid blend.equation')
          }
          break

        case S_BLEND_COLOR:
          check.command(
            Array.isArray(value) &&
            value.length === 4,
            'blend.color is a 4d array')
          handleStaticGLState()
          break

        case S_STENCIL_MASK:
          check.commandType(value, 'number', param)
          handleStaticGLState()
          break

        case S_STENCIL_FUNC:
          check.commandType(value, 'object', param)
          var cmp = value.cmp || 'keep'
          var ref = value.ref || 0
          var mask = 'mask' in value ? value.mask : -1
          check.commandParameter(cmp, compareFuncs, param + '.cmp')
          check.commandType(ref, 'number', param + '.ref')
          check.commandType(mask, 'number', param + '.mask')
          handleStaticGLState([
            compareFuncs[cmp],
            ref,
            mask
          ])
          break

        case S_STENCIL_OPFRONT:
        case S_STENCIL_OPBACK:
          check.commandType(value, 'object', param)
          var fail = value.fail || 'keep'
          var zfail = value.zfail || 'keep'
          var pass = value.pass || 'keep'
          check.commandParameter(fail, stencilOps, param + '.fail')
          check.commandParameter(zfail, stencilOps, param + '.zfail')
          check.commandParameter(pass, stencilOps, param + '.pass')
          handleStaticGLState([
            stencilOps[fail],
            stencilOps[zfail],
            stencilOps[pass]
          ])
          break

        case S_POLYGON_OFFSET_OFFSET:
          check.commandType(value, 'object', param)
          var factor = value.factor || 0
          var units = value.units || 0
          check.commandType(factor, 'number', param + '.factor')
          check.commandType(units, 'number', param + '.units')
          handleStaticGLState([factor, units])
          break

        case S_CULL_FACE:
          var face = 0
          if (value === 'front') {
            face = GL_FRONT
          } else if (value === 'back') {
            face = GL_BACK
          }
          check.command(!!face, 'cull.face')
          handleStaticGLState(face)
          break

        case S_LINE_WIDTH:
          check.command(
            typeof value === 'number' &&
            value >= limits.lineWidthDims[0] &&
            value <= limits.lineWidthDims[1],
            'invalid line width, must positive number between ' +
            limits.lineWidthDims[0] + ' and ' + limits.lineWidthDims[1])
          handleStaticGLState()
          break

        case S_FRONT_FACE:
          check.commandParameter(value, orientationType, param)
          handleStaticGLState(orientationType[value])
          break

        case S_COLOR_MASK:
          check.command(
            Array.isArray(value) && value.length === 4,
            'color.mask must be length 4 array')
          handleStaticGLState(value.map(function (v) { return !!v }))
          break

        case S_SAMPLE_COVERAGE:
          check.commandType(value, 'object', param)
          var sampleValue = 'value' in value ? value.value : 1
          var sampleInvert = !!value.invert
          check.command(
            typeof sampleValue === 'number' &&
            sampleValue >= 0 && sampleValue <= 1,
            'sample.coverage.value must be a number between 0 and 1')
          handleStaticGLState([sampleValue, sampleInvert])
          break

        default:
          check.commandRaise('unsupported parameter ' + param)
          break
      }
    })

    // -------------------------------
    // update dynamic options
    // -------------------------------
    Object.keys(dynamicOptions).forEach(function (param) {
      // These options are handled separately
      if ([ S_FRAMEBUFFER,
            S_VIEWPORT,
            S_SCISSOR_BOX,
            S_ELEMENTS ].indexOf(param) >= 0) {
        return
      }

      // Handle shaders as a special case
      var dynBlock = block()
      var value = invoke(dynBlock, dynamicOptions[param])
      if (param === S_VERT || param === S_FRAG) {
        var SHADER_ID = dynBlock.def(STRING_STORE, '.id(', value, ')')
        check.optional(function (command) {
          dynBlock(SHADER_STATE, '.shader(', [
            shaderType[param],
            SHADER_ID,
            shared.COMMAND
          ], ');')
        })
        entry(dynBlock)
        setAll(SHADER_STATE, '.' + param, SHADER_ID)
        return
      }

      // For everything else, we use the same code path
      function handleDynamicGLState (x) {
        if (typeof x === 'undefined') {
          x = value
        } else if (Array.isArray(x)) {
          x = x.map(function (c) {
            return dynBlock.def(c)
          })
        } else {
          x = dynBlock.def(x)
        }
        // 3 cases:
        //    scope - save value to stack
        //    draw or constant batch  - update dynamically
        //    dynamic batch - defer update to batch inner loop
        dynamicEntry(dynBlock)
        var poll = block()
        draw(poll)
        if (batchConstant(dynamicOptions[param])) {
          scope(dynBlock, poll)
        }

        var name = propName(param)
        var NEXT = NEXT_VARS[name]
        var CURRENT = CURRENT_VARS[name]
        if (NEXT) {
          var n = currentState[name].length
          loop(n, function (i) {
            setScope(NEXT, '[' + i + ']', x[i])
          })
          poll('if(', loop(n, function (i) {
            return CURRENT + '[' + i + ']!==' + x[i]
          }).join('||'), '){',
          GL, '.', GL_VARIABLES[name], '(', x, ');',
          loop(n, function (i) {
            return CURRENT + '[' + i + ']=' + x[i] + ';'
          }).join(''), '}')
        } else {
          setScope(NEXT_STATE, '.' + name, x)
          CURRENT = CURRENT_STATE + '.' + name
          poll('if(', CURRENT, '!==', x, '){')
          var flag = GL_FLAGS[name]
          if (flag) {
            poll('if(', x, '){',
              GL, '.enable(', flag, ')}else{',
              GL, '.disable(', flag, ')}')
          } else {
            poll(GL, '.', GL_VARIABLES[name], '(', x, ');')
          }
          poll(CURRENT, '=', x, ';}')
        }
      }

      function handleDynamicGLStateVec4 () {
        handleDynamicGLState([0, 1, 2, 3].map(function (x) {
          return value + '[' + x + ']'
        }))
      }

      switch (param) {
        // Draw calls
        case S_COUNT:
        case S_OFFSET:
        case S_INSTANCES:
          scope(dynBlock)
          setScope(DRAW_STATE, '.' + param, value)
          break

        case S_PRIMITIVE:
          scope(dynBlock)
          setScope(DRAW_STATE,
            '.' + param,
            PRIM_TYPES + '[' + value + ']')
          break

        case S_CULL_ENABLE:
        case S_BLEND_ENABLE:
        case S_DITHER:
        case S_STENCIL_ENABLE:
        case S_DEPTH_ENABLE:
        case S_SCISSOR_ENABLE:
        case S_POLYGON_OFFSET_ENABLE:
        case S_SAMPLE_ALPHA:
        case S_SAMPLE_ENABLE:
        case S_LINE_WIDTH:
        case S_DEPTH_MASK:
        case S_STENCIL_MASK:
          handleDynamicGLState()
          break

        case S_DEPTH_FUNC:
          handleDynamicGLState(COMPARE_FUNCS + '[' + value + ']')
          break

        case S_BLEND_FUNC:
          var escapeBlendFunc = function (prefix, suffix) {
            return BLEND_FUNCS +
              '["' + prefix + suffix + '" in ' + value +
              '?' + value + '.' + prefix + suffix +
              ':' + value + '.' + prefix + ']'
          }
          handleDynamicGLState([
            escapeBlendFunc('src', 'RGB'),
            escapeBlendFunc('dst', 'RGB'),
            escapeBlendFunc('src', 'Alpha'),
            escapeBlendFunc('dst', 'Alpha')
          ])
          break

        case S_BLEND_EQUATION:
          var escapeBlendEq = function (suffix) {
            return BLEND_EQUATIONS +
              '[typeof ' + value + '==="string"?' + value + ':' +
              value + '.' + suffix + ']'
          }
          handleDynamicGLState([
            escapeBlendEq('rgb'),
            escapeBlendEq('alpha')
          ])
          break

        case S_BLEND_COLOR:
          handleDynamicGLStateVec4()
          break

        case S_STENCIL_FUNC:
          handleDynamicGLState([
            '"cmp" in ' + value + '?' + COMPARE_FUNCS + '[' + value + '.cmp]:' + GL_ALWAYS,
            value + '.ref|0',
            '"mask" in ' + value + '?' + value + '.mask:-1'
          ])
          break

        case S_STENCIL_OPFRONT:
        case S_STENCIL_OPBACK:
          var escapeStencilOp = function (part) {
            return '"' + part + '" in ' + value +
              '?' + STENCIL_OPS + '[' + value + '.' + part + ']:' +
              GL_KEEP
          }
          handleDynamicGLState([
            escapeStencilOp('fail'),
            escapeStencilOp('zfail'),
            escapeStencilOp('pass')
          ])
          break

        case S_POLYGON_OFFSET_OFFSET:
          handleDynamicGLState([
            value + '.factor|0',
            value + '.units|0'
          ])
          break

        case S_CULL_FACE:
          handleDynamicGLState(value + '==="front"?' + GL_FRONT + ':' + GL_BACK)
          break

        case S_FRONT_FACE:
          handleDynamicGLState(value + '==="cw"?' + GL_CW + ':' + GL_CCW)
          break

        case S_COLOR_MASK:
          handleDynamicGLStateVec4()
          break

        case S_SAMPLE_COVERAGE:
          handleDynamicGLState([
            value + '.value',
            value + '.invert'
          ])
          break

        default:
          check.raise('unsupported dynamic option: ' + param)
      }
    })

    // -------------------------------
    // poll for changes from scope
    // -------------------------------
    GL_STATE_NAMES.forEach(function (param) {
      if (param in staticOptions || param in dynamicOptions) {
        return
      }

      var poll = block()
      batch(poll)
      draw(poll)

      var name = propName(param)
      var CURRENT = CURRENT_VARS[name]
      var NEXT = NEXT_VARS[name]
      var x
      if (CURRENT) {
        var n = currentState[name].length
        x = loop(n, function (i) {
          return poll.def(NEXT, '[', i, ']')
        })
        poll('if(', loop(n, function (i) {
          return CURRENT + '[' + i + ']!==' + x[i]
        }).join('||'), '){',
        GL, '.', GL_VARIABLES[name], '(', x, ');',
        loop(n, function (i) {
          return CURRENT + '[' + i + ']=' + x[i] + ';'
        }).join(''), '}')
      } else {
        CURRENT = CURRENT_STATE + '.' + name
        x = poll.def(NEXT_STATE, '.', name)
        poll('if(', CURRENT, '!==', x, '){')
        var flag = GL_FLAGS[name]
        if (flag) {
          poll('if(', x, '){',
            GL, '.enable(', flag, ')}else{',
            GL, '.disable(', flag, ')}')
        } else {
          poll(GL, '.', GL_VARIABLES[name], '(', x, ');')
        }
        poll(CURRENT, '=', x, ';}')
      }
    })

    // Update shader pointer
    if (!staticShader) {
      shaderBlock(PROGRAM, '=',
        SHADER_STATE, '.program(',
        SHADER_STATE, '.vert,',
        SHADER_STATE, '.frag')
      check.optional(function (command) {
        shaderBlock(',', env.shared.command)
      })
      shaderBlock(');')
    }
    shaderBlock(GL, '.useProgram(', PROGRAM, '.program);')
    draw(shaderBlock)
    batch(shaderBlock)

    /*
    // -------------------------------
    // update uniforms for scopes
    // -------------------------------
    var staticUniforms = uniforms.static
    var dynamicUniforms = uniforms.dynamic

    Object.keys(staticUniforms).forEach(function (uniform) {
      var value = staticUniforms[uniform]
      var VALUE
      if (typeof value === 'function' && value._reglType) {
        VALUE = link(value)
      } else if (Array.isArray(value)) {
        VALUE = link(value.slice())
      } else {
        VALUE = +value
      }
      setScope(UNIFORM_STATE, '.' + uniform, VALUE)
    })

    Object.keys(dynamicUniforms).forEach(function (uniform) {
      var VALUE = invoke(scope, dynamicUniforms[uniform])
      setScope(UNIFORM_STATE, '.' + uniform, VALUE)
    })
    */

    // -------------------------------
    // update attributes for scopes
    // -------------------------------
    var staticAttributes = attributes.static
    var dynamicAttributes = attributes.dynamic
    var attributeDefs = {}

    Object.keys(staticAttributes).forEach(function (attribute) {
      var value = staticAttributes[attribute]
      var id = stringStore.id(attribute)

      var record = new AttributeRecord()
      if (isBufferArgs(value)) {
        record.pointer = true
        record.buffer = bufferState.create(value, GL_ARRAY_BUFFER, false)
      } else {
        var buffer = bufferState.getBuffer(value)
        if (buffer) {
          record.pointer = true
          record.buffer = buffer
        } else {
          check.command(typeof value === 'object' && value,
            'invalid data for attribute ' + attribute)
          if (value.constant) {
            var constant = value.constant
            if (typeof constant === 'number') {
              record.pointer = false
              record.x = constant
            } else {
              check.command(
                Array.isArray(constant) &&
                constant.length > 0 &&
                constant.length <= 4,
                'invalid constant for attribute ' + attribute)
              record.pointer = false
              CUTE_COMPONENTS.forEach(function (c, i) {
                if (i < constant.length) {
                  record[c] = constant[i]
                }
              })
            }
          } else {
            buffer = bufferState.getBuffer(value.buffer)
            check.command(!!buffer, 'missing buffer for attribute ' + attribute)

            var offset = value.offset | 0
            check.command(offset === value.offset && offset >= 0,
              'invalid offset for attribute ' + attribute)

            var stride = value.stride | 0
            check.command(stride === value.stride && stride >= 0 && stride < 256,
              'invalid stride for attribute ' + attribute + ', must be integer betweeen [0, 255]')

            var size = value.size | 0
            if ('size' in value) {
              check.command(size === value.size && size > 0 && size <= 4,
                'invalid size for attribute ' + attribute + ', must be 1,2,3,4')
            }

            var normalized = !!value.normalized
            if ('normalized' in value) {
              check.commandType(value.normalized, 'boolean',
                'invalid normalized flag for attribute ' + attribute)
            }

            var type = 0
            if ('type' in value) {
              check.commandParameter(
                value.type, glTypes,
                'invalid type for attribute ' + attribute)
              type = glTypes[value.type]
            }

            var divisor = value.divisor | 0
            if ('divisor' in value) {
              check.command(extInstancing, 'instancing not supported')
              check.command(divisor === value.divisor && divisor >= 0,
                'invalid divisor for attribute ' + attribute)
            }

            record.pointer = true
            record.size = size
            record.normalized = normalized
            record.type = type
            record.offset = offset
            record.stride = stride
            record.divisor = divisor
          }
        }
      }

      // Returns a pointer-record like structure with all properties unboxed
      function appendAttributeCode (env, block) {
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
          result.buffer = link(record.buffer)
        }
        cache[id] = result
        return result
      }

      attributeDefs[attribute] = {
        id: id,
        batchConstant: true,
        append: appendAttributeCode
      }
    })

    Object.keys(dynamicAttributes).forEach(function (attribute) {
      var id = stringStore.id(attribute)
      var dyn = dynamicAttributes[attribute]

      function appendAttributeCode (env, block) {
        var VALUE = env.invoke(block, dyn)

        var shared = env.shared

        var IS_BUFFER_ARGS = shared.isBufferArgs
        var BUFFER_STATE = shared.bufferState

        // Perform validation on attribute
        check.optional(function () {
          block(
            'if(!(', VALUE, '&&typeof ', VALUE, '==="object"&&(',
            IS_BUFFER_ARGS, '(', VALUE, ')||',
            BUFFER_STATE, '.getBuffer(', VALUE, ')||',
            BUFFER_STATE, '.getBuffer(', VALUE, '.buffer)||',
            '("constant" in ', VALUE,
            '&&(typeof ', VALUE, '.constant==="number"||',
            'Array.isArray(', VALUE,
            '))))))',
            shared.check, '.commandRaise(',
            env.link('invalid dynamic attribute ' + attribute), ',', shared.command, ');')
        })

        // allocate names for result
        var result = {
          isStream: block.def(false)
        }
        var defaultRecord = new AttributeRecord()
        defaultRecord.pointer = true
        Object.keys(defaultRecord).forEach(function (key) {
          result[key] = block.def(defaultRecord[key])
        })

        var BUFFER = result.buffer
        block(
          'if(', IS_BUFFER_ARGS, '(', VALUE, ')){',
          result.isStream, '=true;',
          BUFFER, '=', BUFFER_STATE, '.createStream(', VALUE, ');',
          '}else{',
          BUFFER, '=', BUFFER_STATE, '.getBuffer(', VALUE, ');',
          'if(!', BUFFER, '){',
          'if(', VALUE, '.constant){',
          result.pointer, '=false;',
          CUTE_COMPONENTS.map(function (name, i) {
            return (
              result[name] + '=' + VALUE + '.length>=' + i +
              '?' + VALUE + '[' + i + ']:0;'
            )
          }).join(''),
          '}else{',
          BUFFER, '=', VALUE, '.buffer;',
          result.type, '="type" in ', VALUE, '?',
          shared.glTypes, '[', VALUE, '.type]:0;',
          result.normalized, '=!!', VALUE, '.normalized;')
        function emitReadRecord (name) {
          dynamicEntry(result[name], '=', VALUE, '.', name, '|0;')
        }
        emitReadRecord('size')
        emitReadRecord('offset')
        emitReadRecord('stride')
        emitReadRecord('divisor')

        block('}}}')

        return result
      }

      attributeDefs[attribute] = {
        id: id,
        batchConstant: batchConstant(dyn),
        append: appendAttributeCode
      }
    })

    // --------------------------------
    // Save all attributes to scope
    // --------------------------------
    Object.keys(attributeDefs).forEach(function (attribute) {
      var defn = attributeDefs[attribute]
      var binding = env.scopeAttrib(attribute)
      var items = Object.keys(new AttributeRecord())
      items.forEach(function (key) {
        saveScope(binding, '.' + key)
      })
      check.optional(function () {
        setScope(binding, '.present', true)
      })
      var record = defn.append(env, scope)
      items.forEach(function (key) {
        scope(binding, '.', key, '=', record[key], ';')
      })
      if (record.isStream) {
        scopeExit(
          'if(', record.isStream, ')',
          BUFFER_STATE, '.destroyStream(', record.buffer, ');')
      }
    })

    // ==========================================================
    // Close out blocks
    // ==========================================================

    if (staticShader) {
      env.setProg(program)
    }

    // -----------------------------
    // scope
    // -----------------------------
    scope(scope.arg(), '(a0,', CONTEXT, ');',
      dynamicExit,
      scopeExit,
      exit)

    // -----------------------------
    // draw
    // -----------------------------
    if (staticShader) {
      compileDrawCommand(env, draw, program, options, uniforms, attributes, attributeDefs)
    } else {
      draw(link(function (program, obj, props) {
        var result = program.drawCache[CALL_ID]
        if (!result) {
          var dynEnv = createREGLEnvironment()
          var dynBlock = dynEnv.proc('draw')
          dynEnv.setProg(program)
          dynEnv.shared.props = dynBlock.arg()
          compileDrawCommand(
            dynEnv, dynBlock, program, options, uniforms, attributes, attributeDefs)
          result = program.drawCache[CALL_ID] = dynEnv.compile().draw
        }
        return result.call(obj, props)
      }), '(', PROGRAM, ',this,a0);')
    }
    draw(dynamicExit, exit)

    // -----------------------------
    // batch (must be last, screws with prop set up a bit)
    // -----------------------------
    batch.arg()
    if (staticShader) {
      compileBatchCommand(env, batch, program, options, uniforms, attributes, attributeDefs)
    } else {
      batch(link(function (program, obj, props, count) {
        var result = program.batchCache[CALL_ID]
        if (!result) {
          var dynEnv = createREGLEnvironment()
          var dynBlock = dynEnv.proc('batch')
          dynEnv.setProg(program)
          dynEnv.shared.props = dynBlock.arg()
          dynEnv.shared.count = dynBlock.arg()
          compileBatchCommand(
            dynEnv, dynBlock, program, options, uniforms, attributes, attributeDefs)
          result = program.batchCache[CALL_ID] = dynEnv.compile().batch
        }
        return result.call(obj, props, count)
      }), '(', PROGRAM, ',this,a0,a1);')
    }
    batch(exit)

    return env.compile()
  }

  return {
    next: nextState,
    current: currentState,
    procs: (function () {
      var env = createEnvironment()
      var link = env.link
      var poll = env.proc('poll')
      var refresh = env.proc('refresh')
      var common = env.block()
      poll(common)
      refresh(common)

      var GL = link(gl)
      var NEXT_STATE = link(nextState)
      var CURRENT_STATE = link(currentState)

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
