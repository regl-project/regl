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
var GL_ELEMENT_ARRAY_BUFFER = 34963

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

function setUniformLiteral (gl, type, location, value) {
  var infix
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
    case GL_INT:
      infix = '1i'
      break
    case GL_BOOL_VEC2:
    case GL_INT_VEC2:
      infix = '2i'
      break
    case GL_BOOL_VEC3:
    case GL_INT_VEC3:
      infix = '3i'
      break
    case GL_BOOL_VEC4:
    case GL_INT_VEC4:
      infix = '4i'
      break
    default:
      check.raise('unsupported uniform type')
  }
  return gl + '.uniform' + infix + '(' + location + ',' + value.join() + ');'
}

function addSlashes (str) {
  return str.replace(/[\\"']/g, '\\$&').replace(/\u0000/g, '\\0')
}

// test if a dynamic variable is constant over a batch
function isBatchStatic (x) {
  // TODO: should we use function.toString() here to check if no props
  // are used?
  return !(
    x.type === DYN_PROP ||
    x.type === DYN_FUNC)
}

function ParsedVar (isStatic, batchStatic, append) {
  this.static = isStatic
  this.batchStatic = batchStatic
  this.append = append
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

    isBufferArgs: isBufferArgs
  }

  if (extInstancing) {
    sharedState.instancing = extInstancing
  }

  if (extDrawBuffers) {
    sharedState.drawBuffers = extDrawBuffers
  }

  var sharedConstants = {
    primTypes: primTypes,
    compareFuncs: compareFuncs,
    blendFuncs: blendFuncs,
    blendEquations: blendEquations,
    stencilOps: stencilOps,
    glTypes: glTypes
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

    env.stateDirty = false

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
        check.command(framebuffer, 'invalid framebuffer object')
        return new ParsedVar(true, true, function (env, block) {
          var FRAMEBUFFER = env.link(framebuffer)
          var shared = env.shared
          block.set(
            shared.framebuffer,
            '.cur',
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
        return new ParsedVar(true, true, function (env, scope) {
          var shared = env.shared
          scope.set(
            shared.framebuffer,
            '.cur',
            null)
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
      check.command(isBatchStatic(dyn), 'framebuffer must be batch invariant')
      return new ParsedVar(false, true, function (env, scope) {
        var FRAMEBUFFER_FUNC = env.invoke(scope, dyn)
        var shared = env.shared
        var FRAMEBUFFER_STATE = shared.framebuffer
        var FRAMEBUFFER = scope.def(
          FRAMEBUFFER_STATE, '.getFramebuffer(', FRAMEBUFFER_FUNC, ')')

        check.optional(function () {
          scope(
            shared.check,
            '.command(!', FRAMEBUFFER_FUNC, '||', FRAMEBUFFER, ',',
            '"invalid framebuffer object",',
            shared.command, ');')
        })

        scope.set(
          FRAMEBUFFER_STATE,
          '.cur',
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
        check.commandType(box, 'object', 'invalid ' + param)

        var isStatic = true
        var x = box.x | 0
        var y = box.y | 0
        var w, h
        if ('w' in box) {
          w = box.w | 0
          check.command(w > 0, 'invalid ' + param)
        } else {
          isStatic = false
        }
        if ('h' in box) {
          h = box.h | 0
          check.command(h > 0, 'invalid ' + param)
        } else {
          isStatic = false
        }

        return new ParsedVar(
          isStatic,
          isStatic || !framebuffer || framebuffer.batchStatic,
          function (env, scope) {
            var CONTEXT = env.shared.context
            var BOX_W = w
            if (!('w' in box)) {
              BOX_W = scope.def(CONTEXT, '.', S_FRAMEBUFFER_WIDTH)
            }
            var BOX_H = h
            if (!('h' in box)) {
              BOX_H = scope.def(CONTEXT, '.', S_FRAMEBUFFER_HEIGHT)
            }
            return [x, y, BOX_W, BOX_H]
          })
      } else if (param in dynamicOptions) {
        var dynBox = dynamicOptions[param]
        check.command(isBatchStatic(dynBox), param + ' must be batch invariant')
        return new ParsedVar(false, true, function (env, scope) {
          var BOX = env.invoke(scope, dynBox)

          check.optional(function () {
            scope(
              env.shared.check,
              '.commandType(', BOX, ',"object","invalid ', param, '",',
              env.shared.command, ');')
          })

          var CONTEXT = env.shared.context
          var BOX_X = scope.def(BOX, '.x|0')
          var BOX_Y = scope.def(BOX, '.y|0')
          var BOX_W = scope.def(
            '"w" in ', BOX, '?', BOX, '.w|0:',
            CONTEXT, '.', S_FRAMEBUFFER_WIDTH)
          var BOX_H = scope.def(
            '"h" in ', BOX, '?', BOX, '.h|0:',
            CONTEXT, '.', S_FRAMEBUFFER_HEIGHT)

          check.optional(function () {
            var CHECK = env.shared.check
            var COMMAND = env.shared.command
            scope(
              CHECK, '.command(',
              BOX_X, '>=0&&',
              BOX_Y, '>=0&&',
              BOX_W, '>0&&',
              BOX_H, '>0,"invalid ', param, '",',
              COMMAND, ');'
            )
          })

          return [BOX_X, BOX_Y, BOX_W, BOX_H]
        })
      } else if (framebuffer) {
        return new ParsedVar(
          framebuffer.static, true, function (env, scope) {
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
      viewport = new ParsedVar(
        viewport.static, viewport.batchStatic, function (env, scope) {
          var VIEWPORT = viewport.append(env, scope)
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
        check.optional(function () {
          shaderState.shader(shaderType[name], id)
        })
        var result = new ParsedVar(true, true, function () {
          return id
        })
        result.id = id
        return result
      } else if (name in dynamicOptions) {
        var dyn = dynamicOptions[name]
        check.command(isBatchStatic(dyn), 'shaders must be batch invariant')
        return new ParsedVar(false, true, function (env, scope) {
          var str = env.invoke(scope, dyn)
          var id = env.def(env.shared.strings, '.id(', str, ')')
          check.optional(function () {
            scope(
              env.shared.shader, '.shader(',
              shaderType[name], ',',
              id, ',',
              env.shared.command, ');')
          })
          return id
        })
      }
      return null
    }

    var frag = parseShader(S_FRAG)
    var vert = parseShader(S_VERT)

    var program = null
    var progVar
    if (frag && frag.static && vert && vert.static) {
      program = shaderState.program(frag.id, vert.id)
      progVar = new ParsedVar(true, true, function (env, scope) {
        return env.link(program)
      })
    } else {
      progVar = new ParsedVar(false, true, function (env, scope) {
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
        check.optional(function () {
          scope(
            SHADER_STATE, '.program(',
            fragId, ',',
            vertId, ',',
            env.shared.command, ');')
        })
        var prog = scope.def(
          SHADER_STATE, '.program(', fragId, ',', vertId, ')')
        return prog
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
          elements = elementState.create(elements)
        } else if (elements) {
          elements = elementState.getElements(elements)
          check.command(elements, 'invalid elements')
        }
        var result = new ParsedVar(true, true, function (env, scope) {
          if (elements) {
            var result = env.link(elements)
            scope.ELEMENTS = result
            return result
          }
          scope.ELEMENTS = null
          return null
        })
        result.value = elements
        return result
      } else if (S_ELEMENTS in dynamicOptions) {
        var dyn = dynamicOptions[S_ELEMENTS]
        return new ParsedVar(false, isBatchStatic(dyn),
          function (env, scope) {
            var shared = env.shared

            var IS_BUFFER_ARGS = shared.isBufferArgs
            var ELEMENT_STATE = shared.elements

            var elementDefn = env.invoke(scope, dyn)
            var elements = scope.def(null)
            var elementStream = scope.def(IS_BUFFER_ARGS, '(', elementDefn, ')')

            var ifte = env.cond(elementStream)
              .then(elements, '=', ELEMENT_STATE, '.createStream(', elementDefn, ');')
              .else(elements, '=', ELEMENT_STATE, '.getElements(', elementDefn, ');')

            check.optional(function () {
              ifte.else(
                'if(', elementDefn, '){',
                shared.check, '.command(',
                elements, ',"invalid elements",',
                shared.command, ');}')
            })

            scope.entry(ifte)
            scope.exit(
              env.cond(elementStream)
                .then(ELEMENT_STATE, '.destroyStream(', elementDefn, ');'))

            scope.ELEMENTS = elements

            return elements
          })
      }

      return null
    }

    var elements = parseElements()

    function parsePrimitive () {
      if (S_PRIMITIVE in staticOptions) {
        var primitive = staticOptions[S_PRIMITIVE]
        check.commandParameter(primitive, primTypes, 'invalid primitve')
        return new ParsedVar(true, true,
          function (env, scope) {
            return primTypes[primitive]
          })
      } else if (S_PRIMITIVE in dynamicOptions) {
        var dynPrimitive = dynamicOptions[S_PRIMITIVE]
        return new ParsedVar(
          false, isBatchStatic(dynPrimitive), function (env, scope) {
            var PRIM_TYPES = env.constants.primTypes
            var prim = env.invoke(scope, dynPrimitive)
            check.optional(function () {
              var shared = env.shared
              scope(shared.check, '.commandParameter(',
                prim, ',', PRIM_TYPES, ',"invalid primitive",', shared.command,
                ');')
            })
            return scope.def(PRIM_TYPES, '[', prim, ']')
          })
      } else if (elements) {
        if (elements.static) {
          if (elements.value) {
            return new ParsedVar(true, true, function (env, scope) {
              return scope.def(scope.ELEMENTS, '.primType')
            })
          } else {
            return new ParsedVar(true, true, function () {
              return GL_TRIANGLES
            })
          }
        } else {
          return new ParsedVar(false, elements.batchStatic,
            function (env, scope) {
              var elements = scope.ELEMENTS
              return scope.def(elements, '?', elements, '.primType:', GL_TRIANGLES)
            })
        }
      }
      return null
    }

    function parseVertCount () {
      if (S_COUNT in staticOptions) {
        var count = staticOptions[S_COUNT] | 0
        check.command(
          typeof count === 'number' && count >= 0, 'invalid vertex count')
        return new ParsedVar(true, true, function () {
          return count
        })
      } else if (S_COUNT in dynamicOptions) {
        var dynCount = dynamicOptions[S_COUNT]
        return new ParsedVar(false, isBatchStatic(dynCount),
          function (env, scope) {
            var result = env.invoke(scope, dynCount)
            check.optional(function () {
              scope(env.shared.check, '.command(',
                'typeof ', result, '==="number"&&',
                result, '>=0&&',
                result, '===', result, '|0,"invalid vertex count",',
                env.shared.command, ');')
            })
            return result
          })
      } else if (elements) {
        if (elements.static) {
          if (elements) {
            return new ParsedVar(true, true, function (env, scope) {
              return scope.def(scope.ELEMENTS, '.vertCount')
            })
          } else {
            var result = new ParsedVar(true, true, function () {
              return -1
            })
            result.MISSING = true
            return result
          }
        } else {
          var variable = new ParsedVar(false, elements.batchStatic,
            function (env, scope) {
              var elements = scope.ELEMENTS
              return scope.def(elements, '?', elements, '.vertCount:-1')
            })
          variable.DYNAMIC = true
          return variable
        }
      }
      return null
    }

    function parseParam (param, checkLimits) {
      if (param in staticOptions) {
        var value = staticOptions[param] | 0
        check.command(checkLimits || value >= 0, 'invalid ' + param)
        return new ParsedVar(true, true, function () {
          return value
        })
      } else if (param in dynamicOptions) {
        var dynValue = dynamicOptions[param]
        return new ParsedVar(false, isBatchStatic(dynValue),
          function (env, scope) {
            var result = env.invoke(scope, dynValue)
            check.optional(function () {
              if (checkLimits) {
                scope(env.shared.check, '.command(', result, '>=0,',
                  '"invalid ', param, '",', env.shared.command, ');')
              }
            })
            return result
          })
      }
      return null
    }

    return {
      elements: elements,
      primitive: parsePrimitive(),
      count: parseVertCount(),
      instances: parseParam(S_INSTANCES, false),
      offset: parseParam(S_OFFSET, true)
    }
  }

  function parseGLState (options) {
    var staticOptions = options.static
    var dynamicOptions = options.dynamic

    var STATE = {}

    GL_STATE_NAMES.forEach(function (param) {
      function parseParam (parseStatic, parseDynamic) {
        if (param in staticOptions) {
          var value = parseStatic(staticOptions[param])
          STATE[param] = new ParsedVar(true, true, function () {
            return value
          })
        } else if (param in dynamicOptions) {
          var dyn = dynamicOptions[param]
          STATE[param] = new ParsedVar(false, isBatchStatic(dyn),
            function (env, scope) {
              return parseDynamic(env, scope, env.invoke(scope, dyn))
            })
        }
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
          return parseParam(
            function (value) {
              check.commandType(value, 'boolean', param)
              return value
            },
            function (env, scope, value) {
              check.optional(function () {
                scope(env.shared.check, '.commandType(', value, ',',
                  '"boolean",', env.shared.command, ');')
              })
              return value
            })

        case S_DEPTH_FUNC:
          return parseParam(
            function (value) {
              check.commandParameter(value, compareFuncs, param)
              return compareFuncs[value]
            },
            function (env, scope, value) {
              var COMPARE_FUNCS = env.constants.compareFuncs
              check.optional(function () {
                scope(env.shared.check, '.commandParameter(',
                  value, ',', COMPARE_FUNCS, ',"invalid ', param, '",',
                  env.shared.command, ');')
              })
              return scope.def(COMPARE_FUNCS, '[', value, ']')
            })

        case S_DEPTH_RANGE:
          return parseParam(
            function (value) {
              check.command(
                Array.isArray(value) &&
                value.length === 2 &&
                typeof value[0] === 'number' &&
                typeof value[1] === 'number' &&
                value[0] <= value[1],
                'depth range is 2d array')
              return value
            },
            function (env, scope, value) {
              check.optional(function () {
                scope(env.shared.check, '.command(',
                  'Array.isArray(', value, ')&&',
                  value, '.length===2&&',
                  'typeof ', value, '[0]==="number"&&',
                  'typeof ', value, '[1]==="number"&&',
                  value, '[0]<=', value, '[1],',
                  '"depth range must be a 2d array",',
                  env.shared.command, ');')
              })

              var Z_NEAR = scope.def('+', value, '[0]')
              var Z_FAR = scope.def('+', value, '[1]')
              return [Z_NEAR, Z_FAR]
            })

        case S_BLEND_FUNC:
          return parseParam(
            function (value) {
              check.commandType(value, 'object', 'blend.func')
              var srcRGB = ('srcRGB' in value ? value.srcRGB : value.src)
              var srcAlpha = ('srcAlpha' in value ? value.srcAlpha : value.src)
              var dstRGB = ('dstRGB' in value ? value.dstRGB : value.dst)
              var dstAlpha = ('dstAlpha' in value ? value.dstAlpha : value.dst)
              check.commandParameter(srcRGB, blendFuncs, param + '.srcRGB')
              check.commandParameter(srcAlpha, blendFuncs, param + '.srcAlpha')
              check.commandParameter(dstRGB, blendFuncs, param + '.dstRGB')
              check.commandParameter(dstAlpha, blendFuncs, param + '.dstAlpha')
              return [
                blendFuncs[srcRGB],
                blendFuncs[dstRGB],
                blendFuncs[srcAlpha],
                blendFuncs[dstAlpha]
              ]
            },
            function (env, scope, value) {
              var BLEND_FUNCS = env.constants.blendFuncs

              check.optional(function () {
                scope(env.shared.check, '.commandType(',
                  value, ',"object",',
                  env.shared.command, ');')
              })

              function prop (prefix, suffix) {
                var func = scope.def(
                  '"', prefix, suffix, '" in ', value,
                  '?', value, '.', prefix, suffix,
                  ':', value, '.', prefix)

                check.optional(function () {
                  scope(env.shared.check, '.commandParameter(',
                    func, ',', BLEND_FUNCS, ',',
                    '"', param, '.', prefix, suffix, '"', env.shared.command,
                    ');')
                })

                return scope.def(BLEND_FUNCS, '[', func, ']')
              }

              var SRC_RGB = prop('src', 'RGB')
              var SRC_ALPHA = prop('src', 'Alpha')
              var DST_RGB = prop('dst', 'RGB')
              var DST_ALPHA = prop('dst', 'Alpha')

              return [SRC_RGB, DST_RGB, SRC_ALPHA, DST_ALPHA]
            })

        case S_BLEND_EQUATION:
          return parseParam(
            function (value) {
              if (typeof value === 'string') {
                check.commandParameter(value, blendEquations, param)
                return [
                  blendEquations[value],
                  blendEquations[value]
                ]
              } else if (typeof value === 'object') {
                check.commandParameter(
                  value.rgb, blendEquations, param + '.rgb')
                check.commandParameter(
                  value.alpha, blendEquations, param + '.alpha')
                return [
                  blendEquations[value.rgb],
                  blendEquations[value.alpha]
                ]
              } else {
                check.commandRaise('invalid blend.equation')
              }
            },
            function (env, scope, value) {
              var BLEND_EQUATIONS = env.constants.blendEquations

              var RGB = scope.def()
              var ALPHA = scope.def()

              var ifte = env.cond('typeof ', value, '==="string"')

              check.optional(function () {
                var CHECK = env.shared.check
                var COMMAND = env.shared.command
                ifte.then(
                  CHECK, '.commandParameter(',
                  value, ',',
                  BLEND_EQUATIONS, ',',
                  '"', param, '",',
                  COMMAND, ');')
                ifte.else(
                  CHECK, '.commandType(',
                  value, ',"object","', param, '",',
                  COMMAND, ');',
                  CHECK, '.commandParameter(',
                  value, '.rgb,',
                  BLEND_EQUATIONS, ',',
                  '"', param, '.rgb",',
                  COMMAND, ');',
                  CHECK, '.commandParameter(',
                  value, '.alpha,',
                  BLEND_EQUATIONS, ',',
                  '"', param, '.alpha",',
                  COMMAND, ');')
              })

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
              check.command(
                Array.isArray(value) &&
                value.length === 4,
                'blend.color is a 4d array')
              return loop(4, function (i) {
                return +value[i]
              })
            },
            function (env, scope, value) {
              check.optional(function () {
                scope(
                  env.shared.check, '.command(',
                  'Array.isArray(', value, ')&&',
                  value, '.length===4,',
                  '"blend.color is a 4d array"',
                  env.shared.command, ');')
              })
              return loop(4, function (i) {
                return scope.def('+', value, '[', i, ']')
              })
            })

        case S_STENCIL_MASK:
          return parseParam(
            function (value) {
              check.commandType(value, 'number', param)
              return value | 0
            },
            function (env, scope, value) {
              check.optional(function () {
                scope(
                  env.shared.check, '.commandType(',
                  value, ',"number","', param, '",',
                  env.shared.command, ');')
              })
              return scope.def(value, '|0')
            })

        case S_STENCIL_FUNC:
          return parseParam(
            function (value) {
              check.commandType(value, 'object', param)
              var cmp = value.cmp || 'keep'
              var ref = value.ref || 0
              var mask = 'mask' in value ? value.mask : -1
              check.commandParameter(cmp, compareFuncs, param + '.cmp')
              check.commandType(ref, 'number', param + '.ref')
              check.commandType(mask, 'number', param + '.mask')
              return [
                compareFuncs[cmp],
                ref,
                mask
              ]
            },
            function (env, scope, value) {
              var COMPARE_FUNCS = env.constants.compareFuncs
              check.optional(function () {
                var CHECK = env.shared.check
                var COMMAND = env.shared.command
                scope(
                  CHECK, '.commandType(',
                  value, ',"object","invalid ', param, '",',
                  COMMAND, ');',
                  '("cmp" in ', value, ')&&',
                  CHECK, '.commandParameter(',
                  value, '.cmp,',
                  COMPARE_FUNCS, ',',
                  '"', param, '.cmp",',
                  COMMAND, ');',
                  '("ref" in ', value, ')&&',
                  CHECK, '.commandType(',
                  value, '.ref,',
                  '"number","', param, '.ref",',
                  COMMAND, ');',
                  '("mask" in ', value, ')&&',
                  CHECK, '.commandType(',
                  value, '.mask,',
                  '"number","', param, '.mask",',
                  COMMAND, ');')
              })
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
              check.commandType(value, 'object', param)
              var fail = value.fail || 'keep'
              var zfail = value.zfail || 'keep'
              var pass = value.pass || 'keep'
              check.commandParameter(fail, stencilOps, param + '.fail')
              check.commandParameter(zfail, stencilOps, param + '.zfail')
              check.commandParameter(pass, stencilOps, param + '.pass')
              return [
                stencilOps[fail],
                stencilOps[zfail],
                stencilOps[pass]
              ]
            },
            function (env, scope, value) {
              var STENCIL_OPS = env.constants.stencilOps

              check.optional(function () {
                var CHECK = env.shared.check
                var COMMAND = env.shared.command

                scope(CHECK, '.commandType(',
                  value, ',"object",',
                  '"', param, '",',
                  COMMAND, ');')
              })

              function prop (name) {
                check.optional(function () {
                  var CHECK = env.shared.check
                  var COMMAND = env.shared.command

                  scope(
                    '("', name, '" in ', value, ')&&',
                    CHECK, '.commandParameter(',
                    value, '.', name, ',',
                    STENCIL_OPS, ',"', param, '.', name, '",',
                    COMMAND, ');')
                })

                var value = scope.def(
                  '"', name, '" in ', value,
                  '?', STENCIL_OPS, '[', value, '.', name, ']:',
                  GL_KEEP)
                return value
              }

              return [
                prop('fail'),
                prop('zfail'),
                prop('pass')
              ]
            })

        case S_POLYGON_OFFSET_OFFSET:
          return parseParam(
            function (value) {
              check.commandType(value, 'object', param)
              var factor = value.factor | 0
              var units = value.units | 0
              check.commandType(factor, 'number', param + '.factor')
              check.commandType(units, 'number', param + '.units')
              return [factor, units]
            },
            function (env, scope, value) {
              check.optional(function () {
                var CHECK = env.shared.check
                var COMMAND = env.shared.command

                scope(
                  CHECK, '.commandType(',
                  value, ',"object","', param, '",',
                  COMMAND, ');'
                )
              })

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
              check.command(!!face, param)
              return face
            },
            function (env, scope, value) {
              check.optional(function () {
                var CHECK = env.shared.check
                var COMMAND = env.shared.command

                scope(
                  CHECK, '.command(',
                  value, '==="front"||',
                  value, '==="back",',
                  '"invalid cull.face",', COMMAND, ');')
              })
              return scope.def(value, '==="front"?', GL_FRONT, ':', GL_BACK)
            })

        case S_LINE_WIDTH:
          return parseParam(
            function (value) {
              check.command(
                typeof value === 'number' &&
                value >= limits.lineWidthDims[0] &&
                value <= limits.lineWidthDims[1],
                'invalid line width, must positive number between ' +
                limits.lineWidthDims[0] + ' and ' + limits.lineWidthDims[1])
              return value
            },
            function (env, scope, value) {
              check.optional(function () {
                scope(
                  env.shared.check, '.command(',
                  'typeof ', value, '==="number"&&',
                  value, '>=', limits.lineWidthDims[0], '&&',
                  value, '<=', limits.lineWidthDims[1], ',',
                  '"invalid line width",',
                  env.shared.command, ');')
              })

              return value
            })

        case S_FRONT_FACE:
          return parseParam(
            function (value) {
              check.commandParameter(value, orientationType, param)
              return orientationType[value]
            },
            function (env, scope, value) {
              var ORIENTATION_TYPE = env.constants.orientationType
              check.optional(function () {
                scope(
                  env.shared.check, '.commandParameter(',
                  value, ',',
                  ORIENTATION_TYPE, ',',
                  '"', param, '",',
                  env.shared.command, ');'
                )
              })
              return scope.def(ORIENTATION_TYPE, '[', value, ']')
            })

        case S_COLOR_MASK:
          return parseParam(
            function (value) {
              check.command(
                Array.isArray(value) && value.length === 4,
                'color.mask must be length 4 array')
              return value.map(function (v) { return !!v })
            },
            function (env, scope, value) {
              check.optional(function () {
                scope(
                  env.shared.check, '.command(',
                  'Array.isArray(', value, '),',
                  '"invalid color.mask",',
                  env.shared.command, ');')
              })
              return loop(4, function (i) {
                return '!!' + value + '[' + i + ']'
              })
            })

        case S_SAMPLE_COVERAGE:
          return parseParam(
            function (value) {
              check.command(typeof value === 'object' && value, param)
              var sampleValue = 'value' in value ? value.value : 1
              var sampleInvert = !!value.invert
              check.command(
                typeof sampleValue === 'number' &&
                sampleValue >= 0 && sampleValue <= 1,
                'sample.coverage.value must be a number between 0 and 1')
              return [sampleValue, sampleInvert]
            },
            function (env, scope, value) {
              check.optional(function () {
                scope(
                  env.shared.check, '.command(',
                  '!!', value, '&&typeof ', value, '==="object",',
                  '"sample coverage",',
                  env.shared.command, ');')
              })
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

    check.optional(function () {
      var KEY_NAMES = [
        S_FRAMEBUFFER,
        S_VERT,
        S_FRAG,
        S_ELEMENTS,
        S_PRIMITIVE,
        S_OFFSET,
        S_COUNT,
        S_INSTANCES
      ].concat(GL_STATE_NAMES)

      function checkKeys (dict) {
        Object.keys(dict).forEach(function (key) {
          check.command(
            KEY_NAMES.indexOf(key) < 0,
            'invalid option ' + key)
        })
      }

      checkKeys(staticOptions)
      checkKeys(dynamicOptions)
    })

    var framebuffer = parseFramebuffer(options)
    var viewportAndScissor = parseViewportScissor(options, framebuffer)
    var draw = parseDraw(options)
    var state = parseGLState(options)
    var shader = parseProgram(options)

    var dirty = !!(
      Object.keys(state).length > 0 ||
      viewportAndScissor.viewport ||
      viewportAndScissor.scissor_box)

    return {
      framebuffer: framebuffer,
      viewport: viewportAndScissor.viewport,
      scissor_box: viewportAndScissor.scissor_box,
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
        result = new ParsedVar(true, true, function () {
          return value
        })
      } else if (
        typeof value === 'function' &&
        value._reglType === 'texture' ||
        value._reglType === 'cube') {
        result = new ParsedVar(true, true, function (env) {
          return env.link(value)
        })
      } else if (Array.isArray(value) || isTypedArray(value)) {
        result = new ParsedVar(true, true, function (env) {
          var ITEM = env.global.def('[',
            loop(value.length, function (i) {
              check.command(
                typeof value[i] === 'number' ||
                typeof value[i] === 'boolean',
                'invalid uniform ' + name)
              return value[i]
            }), ']')
          return ITEM
        })
      } else {
        check.commandRaise('invalid uniform ' + name)
      }
      result.value = value
      UNIFORMS[name] = result
    })

    Object.keys(dynamicUniforms).forEach(function (key) {
      var dyn = dynamicUniforms[key]
      UNIFORMS[key] = new ParsedVar(false, isBatchStatic(dyn),
        function (env, scope) {
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

      attributeDefs[attribute] = new ParsedVar(true, true,
        function (env, scope) {
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
        check.optional(function () {
          block(
            'if(!(', VALUE, '&&(typeof ', VALUE, '==="object"||typeof ',
            VALUE, '==="function")&&(',
            IS_BUFFER_ARGS, '(', VALUE, ')||',
            BUFFER_STATE, '.getBuffer(', VALUE, ')||',
            BUFFER_STATE, '.getBuffer(', VALUE, '.buffer)||',
            '("constant" in ', VALUE,
            '&&(typeof ', VALUE, '.constant==="number"||',
            'Array.isArray(', VALUE,
            '))))))',
            shared.check, '.commandRaise(',
            env.link('invalid dynamic attribute "' + attribute + '"'), ',', shared.command, ');')
        })

        // allocate names for result
        var result = {
          isStream: block.def(false)
        }
        var defaultRecord = new AttributeRecord()
        defaultRecord.pointer = true
        Object.keys(defaultRecord).forEach(function (key) {
          result[key] = block.def('' + defaultRecord[key])
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
          block(result[name], '=', VALUE, '.', name, '|0;')
        }
        emitReadRecord('size')
        emitReadRecord('offset')
        emitReadRecord('stride')
        emitReadRecord('divisor')

        block('}}}')

        block.exit('if(', result.isStream, '){',
          BUFFER_STATE, '.destroyStream(', result.buffer, ');}')

        return result
      }

      attributeDefs[attribute] = new ParsedVar(
        false, isBatchStatic(dyn), appendAttributeCode)
    })

    return attributeDefs
  }

  function parseArguments (options, uniforms, attributes, context) {
    var result = parseOptions(options)
    result.uniforms = parseUniforms(uniforms)
    result.attributes = parseAttributes(attributes)
    result.context = context
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

    scope(CONTEXT, '.', S_BATCH_ID, '=0;')
    var contextEnter = env.block()

    var staticContext = context.static
    Object.keys(staticContext).forEach(function (contextVar) {
      var PREV_VALUE = scope.def(CONTEXT, '.', contextVar)
      contextEnter(CONTEXT, '.', contextVar, '=',
        env.link(staticContext[contextVar]), ';')
      scope.exit(CONTEXT, '.', contextVar, '=', PREV_VALUE, ';')
    })

    var dynamicContext = context.dynamic
    Object.keys(dynamicContext).forEach(function (contextVar) {
      var x = dynamicContext[contextVar]
      var PREV_VALUE = scope.def(CONTEXT, '.', contextVar)
      var NEXT_VALUE = env.invoke(scope, x)
      contextEnter(CONTEXT, '.', contextVar, '=', NEXT_VALUE, ';')
      scope.exit(CONTEXT, '.', contextVar, '=', PREV_VALUE, ';')
    })

    scope(contextEnter)
  }

  function emitHeader (env, scope, args) {
    emitContext(env, scope, args.context)

    var result = {}

    function appendOption (name) {
      var opt = args[name]
      if (opt) {
        result[name] = opt.append(env, scope)
      }
    }

    appendOption(S_FRAMEBUFFER)
    appendOption(S_VIEWPORT)
    appendOption(S_SCISSOR_BOX)

    if (args.dirty) {
      scope.exit(env.shared.current, '.dirty=true;')
    }

    return result
  }


  // ===================================================
  // ===================================================
  // COMMON DRAWING FUNCTIONS
  // ===================================================
  // ===================================================
  function emitPollFramebuffer (env, scope) {
    var shared = env.shared

    var GL = shared.gl
    var FRAMEBUFFER_STATE = shared.framebuffer
    var EXT_DRAW_BUFFERS = shared.drawBuffers

    var constants = env.constants

    var DRAW_BUFFERS = constants.drawBuffers
    var BACK_BUFFER = constants.backBuffer

    var NEXT = scope.def(FRAMEBUFFER_STATE, '.next')

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

    GL_STATE_NAMES.forEach(function (param) {
      if ((param === S_VIEWPORT && args[S_VIEWPORT]) ||
          (param === S_SCISSOR_BOX && args[S_SCISSOR_BOX]) ||
          param in args.options) {
        return
      }

      var NEXT, CURRENT
      if (param in NEXT_VARS) {
        NEXT = NEXT_VARS[param]
        CURRENT = CURRENT_VARS[param]
        var parts = loop(currentState[param].length, function (i) {
          return scope.def(NEXT, '[', i, ']')
        })
        block(env.cond(parts.map(function (p, i) {
          return p + '===' + CURRENT + '[' + i + ']'
        }).join('&&'))
          .then(
            GL, '.', GL_VARIABLES, '(', parts, ');',
            parts.map(function (p, i) {
              return CURRENT + '[' + i + ']=' + p + ';'
            })))
      } else {
        NEXT = scope.def(NEXT_STATE, '.', param)
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
            GL, '.', GL_VARIABLES, '(', NEXT, ');',
            CURRENT_STATE, '.', param, '=', NEXT, ';')
        }
      }
    })
    block(CURRENT_STATE, '.dirty=false;')

    scope(block)
  }

  function emitSetOptions (env, scope, options, useStatic, useBatch) {
    var shared = env.shared
    var CURRENT_VARS = env.current
    var CURRENT_STATE = shared.current
    var GL = shared.gl
    Object.keys(options).forEach(function (param) {
      var defn = options[param]
      if (defn.static !== useStatic ||
          defn.batchStatic !== useBatch) {
        return
      }
      var variable = defn.append(env, scope)
      if (GL_FLAGS[param]) {
        var flag = GL_FLAGS[param]
        if (defn.static) {
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

  function emitDrawCommon (env, scope, args) {
    var header = emitHeader(env, scope, args)
    emitPollFramebuffer(env, scope)

    function handleViewBox (name) {
      var variable = header[name]
      if (variable) {
        // TODO set viewport/scissor box

      }
    }
    handleViewBox(S_VIEWPORT)
    handleViewBox(S_SCISSOR_BOX)

    emitPollState(env, scope, args)
    emitSetOptions(env, scope, args.options, true, true)

    var program = args.shader.program.append(env, scope)
    scope(env.shared.gl, '.useProgram(', program, '.program);')
    return program
  }





  function emitBindAttribute (env, entry, exit, ATTRIBUTE, size, record) {
    var shared = env.shared

    var GL = shared.gl

    var LOCATION = entry.def(ATTRIBUTE, '.location')
    var BINDING = entry.def(shared.attributes, '[', LOCATION, ']')

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

      if (extInstancing) {
        var DIVISOR = record.divisor
        entry(
          'if(', BINDING, '.divisor!==', DIVISOR, '){',
          shared.instancing, '.vertexAttribDivisorANGLE(', [LOCATION, DIVISOR], ');',
          BINDING, '.divisor=', DIVISOR, ';}')
      }
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

  function emitElements (env, entry, exit, dynElements) {
    var shared = env.shared
    var ELEMENT_STATE = shared.elements

    var ELEMENTS = env.invoke(entry, dynElements)
    var RESULT = entry.def()
    var IS_STREAM = entry.def(false)

    entry(
      'if(', ELEMENTS, '){',
      RESULT, '=', ELEMENT_STATE, '.getElements(', ELEMENTS, ');',
      'if(!', RESULT, '){',
      RESULT, '=', ELEMENT_STATE, '.createStream(', ELEMENTS, ');',
      IS_STREAM, '=true;}}else{',
      RESULT, '=null;}')

    exit(
      'if(', IS_STREAM, ')',
      ELEMENT_STATE, '.destroyStream(', RESULT, ');')

    return RESULT
  }

  function emitDraw (
    env, entry, exit, loopEntry, loopExit, draw, drawOptions) {
    var shared = env.shared
    var invoke = env.invoke

    var GL = shared.gl
    var DRAW_STATE = shared.draw
    var INSTANCING = shared.instancing

    var result = {}

    var elementEntry = entry
    var elementExit = exit
    var ELEMENTS
    if (S_ELEMENTS in drawOptions) {
      var elementDefn = drawOptions[S_ELEMENTS]
      var elementValue = elementDefn.value
      if (elementDefn.static) {
        ELEMENTS = elementValue

        if (!(S_COUNT in drawOptions)) {
          result[S_COUNT] = elementEntry.def(
            ELEMENTS ? ELEMENTS + '.vertCount' : 0)
        }
        if (!(S_PRIMITIVE in drawOptions)) {
          result[S_PRIMITIVE] = elementEntry.def(
            ELEMENTS ? ELEMENTS + '.primType' : 0)
        }
      } else {
        if (!batchConstant(elementValue)) {
          elementEntry = loopEntry
          elementExit = loopExit
        }
        ELEMENTS = emitElements(
          env, elementEntry, elementExit, elementValue)

        if (!(S_COUNT in drawOptions)) {
          result[S_COUNT] = elementEntry.def(
            ELEMENTS, '?', ELEMENTS, '.vertCount:0')
        }
        if (!(S_PRIMITIVE in drawOptions)) {
          result[S_PRIMITIVE] = elementEntry.def(
            ELEMENTS, '?', ELEMENTS, '.primType:0')
        }
      }
    } else {
      ELEMENTS = elementEntry.def(DRAW_STATE, '.', S_ELEMENTS)
    }
    result[S_ELEMENTS] = ELEMENTS

    Object.keys(drawState).forEach(function (param) {
      if (param in result) {
        return
      }
      if (param in drawOptions) {
        var defn = drawOptions[param]
        var value = defn.value
        if (defn.static) {
          result[param] = value
        } else {
          var block = batchConstant(value) ? entry : loopEntry
          result[param] = invoke(block, value)
        }
      } else {
        result[param] = entry.def(DRAW_STATE, '.', param)
      }
    })

    var PRIMITIVE = result[S_PRIMITIVE]
    var COUNT = result[S_COUNT]
    var OFFSET = result[S_OFFSET]
    var INSTANCES = result[S_INSTANCES]
    var ELEMENT_TYPE = ELEMENTS + '.type'

    if (INSTANCES === 0 || COUNT === 0) {
      return
    }

    elementEntry(
      'if(', ELEMENTS, ')',
      GL, '.bindBuffer(', GL_ELEMENT_ARRAY_BUFFER, ',', ELEMENTS, '.buffer.buffer);')

    function emitInstancing () {
      draw('if(', ELEMENTS, '){',
        INSTANCING, '.drawElementsInstancedANGLE(', [PRIMITIVE, COUNT, ELEMENT_TYPE, OFFSET, INSTANCES], ');',
        '}else{',
        INSTANCING, '.drawArraysInstancedANGLE(', [PRIMITIVE, OFFSET, COUNT, INSTANCES], ');',
        '}')
    }

    function emitRegular () {
      draw(
        'if(', ELEMENTS, '){',
        GL, '.drawElements(', [PRIMITIVE, COUNT, ELEMENT_TYPE, OFFSET], ');',
        '}else{',
        GL, '.drawArrays(', [PRIMITIVE, OFFSET, COUNT], ');',
        '}')
    }

    var preDraw = env.block()
    var postDraw = env.block()

    if (typeof COUNT !== 'number') {
      preDraw('if(', COUNT, '>0){')
      postDraw('}')
    } else {
      if (!COUNT) {
        return
      }
    }

    draw(preDraw)
    if (extInstancing && (typeof INSTANCES !== 'number' || INSTANCES >= 0)) {
      if (typeof INSTANCES === 'string') {
        draw('if(', INSTANCES, '>0){')
        emitInstancing()
        draw('}else if(', INSTANCES, '<0){')
        emitRegular()
        draw('}')
      } else {
        emitInstancing()
      }
    } else {
      emitRegular()
    }
    draw(postDraw)

    return result
  }

  function emitUniforms (env, entry, exit, head, tail, program, uniforms) {
    var invoke = env.invoke
    var shared = env.shared
    var GL = shared.gl
    var staticUniforms = uniforms.static
    var dynamicUniforms = uniforms.dynamic
    program.uniforms.forEach(function (uniform, i) {
      var name = uniform.name
      var type = uniform.info.type
      var RECORD = env.link(uniform)
      var LOCATION = entry.def(RECORD, '.location')
      if (name in staticUniforms) {
        var value = staticUniforms[name]
        if (type === GL_SAMPLER_2D || type === GL_SAMPLER_CUBE) {
          var TEX_VALUE = env.link(value._texture)
          entry(setUniformString(GL, GL_INT, LOCATION, TEX_VALUE + '.bind()'))
          exit(TEX_VALUE, '.unbind()')
        } else if (
          type === GL_FLOAT_MAT2 ||
          type === GL_FLOAT_MAT3 ||
          type === GL_FLOAT_MAT4) {
          var MAT_VALUE = env.global.def('[' + value + ']')
          entry(setUniformString(GL, type, LOCATION, MAT_VALUE))
        } else {
          entry(setUniformLiteral(GL, type, LOCATION, value))
        }
      } else if (name in dynamicUniforms) {
        var dyn = dynamicUniforms[name]
        var dynEntry = head
        var dynExit = tail
        if (batchConstant(dyn)) {
          dynEntry = entry
          dynExit = exit
        }
        var VALUE = invoke(dynEntry, dyn)
        if (type === GL_SAMPLER_2D || type === GL_SAMPLER_CUBE) {
          dynEntry(setUniformString(GL, GL_INT, LOCATION, VALUE + '._texture.bind()'))
          dynExit(VALUE, '._texture.unbind()')
        } else {
          dynEntry(setUniformString(GL, type, LOCATION, VALUE))
        }
      } else {
        var CURRENT = entry.def(env.shared.uniforms, '["' + addSlashes(name) + '"]')
        if (type === GL_SAMPLER_2D || type === GL_SAMPLER_CUBE) {
          entry(setUniformString(GL, GL_INT, LOCATION, CURRENT + '._texture.bind()'))
          exit(CURRENT, '._texture.unbind()')
        } else {
          entry(setUniformString(GL, type, LOCATION, CURRENT))
        }
      }
    })
  }

  // ===================================================
  // ===================================================
  // DRAW PROC
  // ===================================================
  // ===================================================

  function emitDrawBody (env, draw, args) {
    // emit attributes

    // emit uniforms

    // emit draw
  }

  function emitDrawProc (env, args) {
    var draw = env.proc('draw', 1)
    var program = emitDrawCommon(env, draw, args)

    emitSetOptions(env, draw, args.options, false, true)
    emitSetOptions(env, draw, args.options, false, false)

    if (args.shader.program) {
      emitDrawBody (env, draw, args, program)
    } else {
      draw(link(function (props, program) {

      }), '.call(this,a0,', program, ');')
    }
  }

  // ===================================================
  // ===================================================
  // BATCH PROC
  // ===================================================
  // ===================================================
  function emitBatchBody (env, scope, args, program) {
    var CONTEXT = env.shared.context
    var BATCH_ID = scope.def()
    var PROP_LIST = 'a0'
    var NUM_PROPS = 'a1'
    var PROPS = scope.def()

    var outer = env.scope
    var loop = env.scope

    scope(
      outer.entry,
      'for(', BATCH_ID, '=0;', BATCH_ID, '<', NUM_PROPS, ';++', BATCH_ID, '){',
      PROPS, '=', PROP_LIST, '[', BATCH_ID, '];',
      CONTEXT, '.batchId=', BATCH_ID, ';',
      loop,
      '}',
      outer.exit)

    emitSetOptions(env, outer, args.options, false, true)
    emitSetOptions(env, loop, args.options, false, false)

    // uniforms, attributes, draw properties
  }

  function emitBatchProc (env, args) {
    var batch = env.proc('batch', 2)
    var program = emitDrawCommon(env, batch, args)

    if (args.shader.program) {
      emitBatchBody(env, batch, args, args.shader.program)
    } else {
      // generate and line
    }
  }

  // ===================================================
  // ===================================================
  // SCOPE COMMAND
  // ===================================================
  // ===================================================
  function emitScopeProc (env, args) {
    var scope = env.proc('scope', 2)

    var shared = env.shared
    var CURRENT_STATE = shared.current
    var header = emitHeader(env, scope, args)

    function saveGLOption (name, value) {
      if (Array.isArray(value)) {
        value.forEach(function (v, i) {
          scope.set(env.next[name], '[' + i + ']', v)
        })
      } else {
        scope.set(shared.next, name, value)
      }
    }

    function saveHeader (name) {
      if (header[name]) {
        saveGLOption(name, header[name])
      }
    }

    saveHeader(S_VIEWPORT)
    saveHeader(S_SCISSOR_BOX)

    Object.keys(args.options).forEach(function (opt) {
      saveGLOption(opt, args.options[opt].append(env, scope))
    })

    Object.keys(args.draw).forEach(function (opt) {
      var variable = args.draw[opt]
      if (!variable) {
        return
      }
      scope.set(shared.draw, '.' + opt, variable.append(env, scope))
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

    if (args.dirty) {
      scope(CURRENT_STATE, '.dirty=true;')
    }

    scope('a1(a0,', env.shared.context, ');')
  }

  // ===========================================================================
  // ===========================================================================
  // MAIN DRAW COMMAND
  // ===========================================================================
  // ===========================================================================
  function compileCommand (options, attributes, uniforms, context) {
    var env = createREGLEnvironment()
    var args = parseArguments(options, attributes, uniforms, context)

    emitScopeProc(env, args)
    emitDrawProc(env, args)
    emitBatchProc(env, args)

    return env.compile()
  }

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
