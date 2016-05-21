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

/*
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
*/

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

/*
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
*/

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
  var blendEquations = {
    'add': 32774,
    'subtract': 32778,
    'reverse subtract': 32779
  }
  if (extensions.ext_blend_minmax) {
    blendEquations.min = GL_MIN_EXT
    blendEquations.max = GL_MAX_EXT
  }

  var currentState = {}
  var nextState = {}
  var GL_FLAGS = {}
  var GL_VARIABLES = {}

  function propName (name) {
    return name.replace('.', '_')
  }

  function stateFlag (sname, cap, init) {
    var name = propName(sname)
    nextState[name] = currentState[name] = !!init
    GL_FLAGS[name] = cap
  }

  function stateVariable (sname, func, init) {
    var name = propName(sname)
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
      props: ''
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

    return env
  }

  /*
  // ===================================================
  // ===================================================
  // SHADER SINGLE DRAW OPERATION
  // ===================================================
  // ===================================================
  function compileDrawCommand (program, options, uniforms, attributes) {
    var env = createEnvironment()
    var link = env.link
    var draw = env.proc('draw')
    var def = draw.def

    var GL = link(gl)
    var PROGRAM = link(program.program)
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
  function compileBatchCommand (program, options, uniforms, attributes) {
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
    var CONTEXT = link(context)
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

      switch (x.type) {
        case DYN_FUNC:
          result = batch.def(
            link(x.data), '.call(this,', ARG, ',', CONTEXT, ')')
          break
        case DYN_PROP:
          result = batch.def(ARG, x.data)
          break
        case DYN_CONTEXT:
          result = batch.def(CONTEXT, x.data)
          break
        case DYN_STATE:
          result = batch.def('this', x.data)
          break
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
      ARG, '=', ARGS, '[', BATCH_ID, '];',
      CONTEXT, '.batchId=', BATCH_ID, ';')

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
  */

  // ===========================================================================
  // ===========================================================================
  // MAIN DRAW COMMAND
  // ===========================================================================
  // ===========================================================================
  function compileCommand (options, attributes, uniforms, context, hasDynamic) {
    // Create code generation environment
    var env = createREGLEnvironment()
    var link = env.link
    var block = env.block
    var proc = env.proc
    var invoke = env.invoke

    var shared = env.shared

    var CALL_ID = env.id

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
    shared.props = 'a0'
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

    // Special case:  vertex shader and fragment shader are static
    // TODO:  Should also use this to inline batch/draw command
    var staticShader = false
    var shaderBlock = block()
    var PROGRAM = shaderBlock.def()
    if (S_FRAG in staticOptions && S_VERT in dynamicOptions) {
      staticShader = true
      var fragId = stringStore.id(staticOptions.vert)
      var vertId = stringStore.id(staticOptions.frag)
      shaderState.shader(GL_FRAGMENT_SHADER, fragId)
      shaderState.shader(GL_VERTEX_SHADER, vertId)
      shaderBlock(PROGRAM, '=', link(shaderState.program(vertId, fragId)), ';')
      setScope(SHADER_STATE, '.', S_FRAG, fragId)
      setScope(SHADER_STATE, '.', S_VERT, vertId)
    }

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

    /*
    Object.keys(dynamicOptions).forEach(function (param) {
      // These options are handled separately, they are more complicated
      if (param === 'framebuffer' ||
          param === 'viewport' ||
          param === 'scissor.box' ||
          param === 'elements') {
        return
      }

      // Handle shaders as a special case
      var value
      if (param === 'vert' || param === 'frag') {
        value = invoke(entry, dynamicOptions[param])
        check.optional(function (command) {
          entry(SHADER_STATE, '.shader(', [
            shaderType[param],
            value,
            COMMAND
          ], ');')
        })
        setStatic(SHADER_STATE, '.' + param,
          STRING_STORE + '.id(' + value + ')')
        return
      }

      // For everything else, we use the same code path
      value = invoke(dynamicEntry, dynamicOptions[param])
      function handleDynamicGLState (x) {
        if (typeof x === 'undefined') {
          x = value
        }
        if (Array.isArray(x)) {
          for (var i = 0; i < x.length; ++i) {
            setDynamic(GL_STATE, '.next["' + param + '"][' + i + ']', x[i])
          }
        } else {
          setDynamic(GL_STATE, '.next["' + param + '"]', x)
        }
      }

      function handleDynamicGLStateVec4 () {
        handleDynamicGLState([0, 1, 2, 3].map(function (x) {
          return value + '[' + x + ']'
        }))
      }

      switch (param) {
        // Draw calls
        case 'count':
        case 'offset':
        case 'instances':
          setScope(DRAW_STATE, '.' + param, value)
          break

        case 'primitive':
          setScope(DRAW_STATE,
            '.' + param,
            PRIM_TYPES + '[' + value + ']')
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
        case 'stencil.mask':
          handleDynamicGLState()
          break

        case 'depth.func':
          handleDynamicGLState(COMPARE_FUNCS + '[' + value + ']')
          break

        case 'blend.func':
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

        case 'blend.equation':
          var escapeBlendEq = function (suffix) {
            return BLEND_EQUATIONS +
              '[typeof ' + value + '==="string"?' + value + ':' +
              value + '.' + suffix + ']'
          }
          handleDynamicGLState([
            escapeBlendEq('RGB'),
            escapeBlendEq('Alpha')
          ])
          break

        case 'blend.color':
          handleDynamicGLStateVec4()
          break

        case 'stencil.func':
          handleDynamicGLState([
            '"cmp" in ' + value + '?' + COMPARE_FUNCS + '[' + value + '.cmp]:' + GL_ALWAYS,
            value + '.ref|0',
            '"mask" in ' + value + '?' + value + '.mask:-1'
          ])
          break

        case 'stencil.opFront':
        case 'stencil.opBack':
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

        case 'polygonOffset.offset':
          handleDynamicGLState([
            value + '.factor|0',
            value + '.units|0'
          ])
          break

        case 'cull.face':
          handleDynamicGLState(value + '==="front"?' + GL_FRONT + ':' + GL_BACK)
          break

        case 'frontFace':
          handleDynamicGLState(value + '==="cw"?' + GL_CW + ':' + GL_CCW)
          break

        case 'colorMask':
          handleDynamicGLStateVec4()
          break

        case 'sample.coverage':
          handleDynamicGLState([
            value + '.value',
            value + '.invert'
          ])
          break

        default:
          check.raise('unsupported dynamic option: ' + param)
      }
    })
    */

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

    // -------------------------------
    // update attributes for scopes
    // -------------------------------
    var staticAttributes = attributes.static
    var dynamicAttributes = attributes.dynamic

    Object.keys(staticAttributes).forEach(function (attribute) {
      var value = staticAttributes[attribute]
      var pointerRecord
      if (Array.isArray(value) || isTypedArray(value)) {
        pointerRecord = {
          buffer: bufferState.create(value, GL_ARRAY_BUFFER, false)
        }
      } else if (bufferState.getBuffer(value)) {
        pointerRecord = {
          buffer: value
        }
      } else {
        pointerRecord = value
      }

      var BINDING = link(attributeState.def(stringStore.id(attribute)))

      function setBinding (name, value) {
        saveProp(BINDING, '.' + name)
        entry(BINDING, '.' + name, '=', value, ';')
      }

      if (pointerRecord.buffer) {
        var buffer = bufferState.getBuffer(value)
        check.command(buffer,
          'invalid buffer for vertex attribute ' + attribute)
        setBinding('pointer', true)
        setBinding('buffer', buffer)
        setBinding('size', pointerRecord.size | 0)
        setBinding('stride', pointerRecord.stride | 0)
        setBinding('offset', pointerRecord.offset | 0)
        setBinding('divisor', pointerRecord.divisor | 0)
        setBinding('normalized', !!pointerRecord.normalized)
        setBinding('type',
          'type' in pointerRecord ? glTypes[pointerRecord.type] : 0)
      } else if (pointerRecord.constant) {
        var constant = bufferState.constant
        if (typeof constant === 'number') {
          constant = [constant]
        }
        check.command(
          Array.isArray(constant) &&
          constant.length > 0 &&
          constant.length <= 4,
          'invalid constant for vertex attribute ' + attribute)
        setBinding('pointer', false)
        CUTE_COMPONENTS.forEach(function (c, i) {
          if (i < constant.length) {
            setBinding(c, +constant[i])
          } else {
            setBinding(c, 0)
          }
        })
      } else {
        check.commandRaise('invalid vertex attribute ' + attribute)
      }
    })

    Object.keys(dynamicAttributes).forEach(function (attribute) {
      var attributeRecord = attributeState.def(stringStore.id(attribute))
      var BINDING = link(attributeRecord)

      // save attribute properties
      Object.keys(attributeRecord).forEach(function (prop) {
        saveDynamic(BINDING, '.' + prop)
      })

      var VALUE = invoke(dynamicEntry, dynamicAttributes[attribute])

      // Perform validation on computed value
      check.optional(function () {
        dynamicEntry(
          'if(!(', VALUE, '&&typeof ', VALUE, '==="object"&&(',
          'Array.isArray(', VALUE, ')||',
          IS_TYPED_ARRAY, '(', VALUE, ')||',
          BUFFER_STATE, '.getBuffer(', VALUE, ')||',
          BUFFER_STATE, '.getBuffer(', VALUE, '.buffer)||',
          '("constant" in ', VALUE,
          '&&(typeof ', VALUE, '.constant==="number"||',
          'Array.isArray(', VALUE,
          '))))))',
          CHECK, '.commandRaise("invalid dynamic attribute ',
          attribute.replace(/[\\"]/g, ''),
          '"', COMMAND, ');')
      })

      // handle constant value
      var IS_STREAM = dynamicEntry.def(false)
      var BUFFER = dynamicEntry.def()

      function emitDefaultRecord () {
        dynamicEntry(
          BINDING, '.pointer=true;',
          BINDING, '.buffer=', BUFFER, ';',
          BINDING, '.offset=',
          BINDING, '.stride=',
          BINDING, '.divisor=',
          BINDING, '.size=',
          BINDING, '.type=0;',
          BINDING, '.normalized=false;')
      }

      dynamicEntry('if(', VALUE, '.constant){',
        BINDING, '.pointer=false;',
        CUTE_COMPONENTS.map(function (name, i) {
          return (
            BINDING + '.' + name + '=' + VALUE + '.length>=' + i +
            '?' + VALUE + '[' + i + ']:0;'
          )
        }).join(''),
        '}else if(Array.isArray(', VALUE, ')||',
        IS_TYPED_ARRAY, '(', VALUE, ')){',
        IS_STREAM, '=true;',
        BUFFER, '=', BUFFER_STATE, '.createStream(', VALUE, ');')

      emitDefaultRecord()

      dynamicEntry('}else{',
        BUFFER, '=', BUFFER_STATE, '.getBuffer(', VALUE, ');',
        'if(', BUFFER, '){')

      emitDefaultRecord()

      dynamicEntry('}else{',
        BINDING, '.pointer=true;',
        BINDING, '.buffer=', BUFFER, ';',
        BINDING, '.normalized=!!', VALUE, '.normalized;',
        BINDING, '.type="type" in ', VALUE, '?',
        GL_TYPES, '[', VALUE, '.type]:0;')

      function emitReadRecord (name) {
        dynamicEntry(BINDING, '.', name, '=', VALUE, '.', name, '||0;')
      }
      emitReadRecord('size')
      emitReadRecord('offset')
      emitReadRecord('stride')
      emitReadRecord('divisor')

      dynamicEntry('}}')

      dynamicExit('if(', IS_STREAM, ')',
        BUFFER_STATE, '.destroyStream(', BUFFER, ');')
    })
    */

    // ==========================================================
    // Close out blocks
    // ==========================================================
    // Finish up scope
    scope(scope.arg(), '();',
      dynamicExit,
      scopeExit,
      exit)

    // Finish up draw command
    draw(dynamicExit, exit)

    // Handle batch mode
    batch.arg()
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

      var GL = link(GL)
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
          var L = loop.bind(null, init.length)
          NEXT = env.global.def(NEXT_STATE, '.', name)
          CURRENT = env.global.def(CURRENT_STATE, '.', name)
          block(
            L(function (i) {
              return NEXT + '[' + i + ']'
            }), ');',
            L(function (i) {
              return CURRENT + '[' + i + ']=' + NEXT + '[' + i + '];'
            }).join(''))
          poll(
            'if(', L(function (i) {
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
