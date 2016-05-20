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

module.exports = function wrapContextState (gl, contextState) {
  // Caps, flags and other random WebGL context state
  var currentState = {}
  var nextState = {}

  var env = createEnvironment()
  var link = env.link
  var poll = env.proc('poll')
  var refresh = env.proc('refresh')

  var GL = link(gl)
  var CURRENT_STATE = link(currentState)
  var NEXT_STATE = link(nextState)

  function pollName (str) {
    return 'poll_' + str.replace('.', '_')
  }

  function stateFlag (name, flag, dflt) {
    var PROP = '["' + name + '"]'

    nextState[flag] = currentState[flag] = !!dflt

    function append (block, check) {
      var CUR = block.def(CURRENT_STATE, PROP)
      var NEXT = block.def(NEXT_STATE, PROP)
      if (check) {
        block('if(', CUR, '!==', NEXT, '){')
      }
      block('if(', NEXT, '){',
        GL, '.enable(', flag, ');',
        '}else{',
        GL, '.disable(', flag, ');',
        '}',
        CURRENT_STATE, PROP, '=', NEXT, ';')
      if (check) {
        block('}')
      }
    }

    append(env.proc(pollName(name)), true)
    append(poll, true)
    append(refresh, false)
  }

  function stateVariable (name, command, init) {
    var CUR, NEXT

    if (Array.isArray(init)) {
      CUR = link(currentState[name] = init.slice())
      NEXT = link(nextState[name] = init.slice())
    } else {
      currentState[name] = nextState[name] = init
    }

    function append (block, check) {
      if (Array.isArray(init)) {
        if (check) {
          block('if(',
            init.map(function (item, i) {
              return CUR + '[' + i + ']!==' + NEXT + '[' + i + ']'
            }).join('||'), '){')
        }
        block(GL, '.', command, '(',
          init.map(function (_, i) {
            return NEXT + '[' + i + ']'
          }).join(), ');')
        for (var i = 0; i < init.length; ++i) {
          block(CUR, '[', i, ']=', NEXT, '[', i, '];')
        }
      } else {
        var PROP = '["' + name + '"]'
        NEXT = block.def(NEXT_STATE, PROP)
        if (check) {
          CUR = block.def(CURRENT_STATE, PROP)
          block('if(', CUR, '!==', NEXT, '){')
        }
        block(GL, '.', command, '(', NEXT, ');',
          CURRENT_STATE, PROP, '=', NEXT, ';')
      }

      if (check) {
        block('}')
      }
    }

    append(env.proc(pollName(name)), true)
    append(poll, true)
    append(refresh, false)
  }

  stateFlag('depth.enable', GL_DEPTH_TEST)
  stateFlag('cull.enable', GL_CULL_FACE)
  stateFlag('stencil.enable', GL_STENCIL_TEST)
  stateFlag('sample.alpha', GL_SAMPLE_ALPHA_TO_COVERAGE)
  stateFlag('sample.enable', GL_SAMPLE_COVERAGE)
  stateFlag('scissor.enable', GL_SCISSOR_TEST)

  // Dithering
  stateFlag('dither', GL_DITHER)

  // Blending
  stateFlag('blend.enable', GL_BLEND)
  stateVariable('blend.color', 'blendColor', [0, 0, 0, 0])
  stateVariable('blend.equation', 'blendEquationSeparate',
    [GL_FUNC_ADD, GL_FUNC_ADD])
  stateVariable('blend.func', 'blendFuncSeparate',
    [GL_ONE, GL_ZERO, GL_ONE, GL_ZERO])

  // Depth
  stateFlag('depth.enable', GL_DEPTH_TEST, true)
  stateVariable('depth.func', 'depthFunc', GL_LESS)
  stateVariable('depth.range', 'depthRange', [0, 1])
  stateVariable('depth.mask', 'depthMask', true)

  // Face culling
  stateFlag('cull.enable', GL_CULL_FACE)
  stateVariable('cull.face', 'cullFace', GL_BACK)

  // Front face orientation
  stateVariable('frontFace', 'frontFace', GL_CCW)

  // Write masks
  stateVariable('colorMask', 'colorMask', true, true, true, true)

  // Line width
  stateVariable('lineWidth', 'lineWidth', 1)

  // Polygon offset
  stateFlag('polygonOffset.enable', GL_POLYGON_OFFSET_FILL, false)
  stateVariable('polygonOffset.offset', 'polygonOffset', [0, 0])

  // Sample coverage
  stateFlag('sample.alpha', GL_SAMPLE_ALPHA_TO_COVERAGE, false)
  stateFlag('sample.enable', GL_SAMPLE_COVERAGE, false)
  stateVariable('sample.coverage', 'sampleCoverage', [1, false])

  // Stencil
  stateFlag('stencil.enable', GL_STENCIL_TEST)
  stateVariable('stencil.mask', 'stencilMask', -1)
  stateVariable('stencil.func', 'stencilFunc', [GL_ALWAYS, 0, -1])
  stateVariable('stencil.opFront', 'stencilOpSeparate',
    [GL_FRONT, GL_KEEP, GL_KEEP, GL_KEEP])
  stateVariable('stencil.opBack', 'stencilOpSeparate',
    [GL_BACK, GL_KEEP, GL_KEEP, GL_KEEP])

  // Scissor
  stateFlag('scissor.enable', GL_SCISSOR_TEST)
  stateVariable('scissor.box', 'scissor', [0, 0, -1, -1])

  // Viewport
  stateVariable('viewport', 'viewport', [0, 0, -1, -1])

  return {
    current: currentState,
    next: nextState,
    procs: env.compile()
  }
}
