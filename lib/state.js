var createStack = require('./stack')
var createProgramStack = require('./program')
var check = require('./check')

module.exports = function stateCache (
  gl,
  extensions,
  shaderCache,
  bufferCache,
  textureCache,
  fboCache) {
  function capStack (cap) {
    return createStack(false, function (flag) {
      if (flag) {
        gl.enable(cap)
      } else {
        gl.disable(cap)
      }
    })
  }

  // Clear flags
  var GL_COLOR_BUFFER_BIT = gl.COLOR_BUFFER_BIT
  var GL_DEPTH_BUFFER_BIT = gl.DEPTH_BUFFER_BIT
  var GL_STENCIL_BUFFER_BIT = gl.STENCIL_BUFFER_BIT

  // Caps
  var GL_CULL_FACE = gl.CULL_FACE
  var GL_BLEND = gl.BLEND
  var GL_DITHER = gl.DITHER
  var GL_STENCIL_TEST = gl.STENCIL_TEST
  var GL_DEPTH_TEST = gl.DEPTH_TEST
  var GL_SCISSOR_TEST = gl.SCISSOR_TEST
  var GL_POLYGON_OFFSET_FILL = gl.POLYGON_OFFSET_FILL
  var GL_SAMPLE_ALPHA = gl.SAMPLE_ALPHA
  var GL_SAMPLE_COVERAGE = gl.SAMPLE_COVERAGE

  // Blend equation
  var GL_FUNC_ADD = gl.FUNC_ADD

  // Blend func
  var GL_ONE = gl.ONE
  var GL_ZERO = gl.ZERO

  // Faces
  var GL_FRONT = gl.FRONT
  var GL_BACK = gl.BACK

  // Depth
  var GL_LESS = gl.LESS

  // Culling
  var GL_CCW = gl.CCW

  // Stencil
  var GL_ALWAYS = gl.ALWAYS
  var GL_KEEP = gl.KEEP

  // Prim types
  var GL_POINTS = gl.POINTS
  var GL_LINES = gl.LINES
  var GL_LINE_STRIP = gl.LINE_STRIP
  var GL_LINE_LOOP = gl.LINE_LOOP
  var GL_TRIANGLES = gl.TRIANGLES
  var GL_TRIANGLE_STRIP = gl.TRIANGLE_STRIP
  var GL_TRIANGLE_FAN = gl.TRIANGLE_FAN

  var primTypes = {
    'points': GL_POINTS,
    'lines': GL_LINES,
    'line strip': GL_LINE_STRIP,
    'line loop': GL_LINE_LOOP,
    'triangles': GL_TRIANGLES,
    'triangle strip': GL_TRIANGLE_STRIP,
    'triangle fan': GL_TRIANGLE_FAN
  }

  // Program state
  var programState = createProgramStack(gl)

  // Element buffer state

  // Draw state
  var primitiveState = [ GL_TRIANGLES ]
  var countState = [ 0 ]
  var offsetState = [ 0 ]
  var instancesState = [ 0 ]

  // Flags, constants and other miscellaneous variables
  var contextState = {
    // Caps
    cullFaceEnable: capStack(GL_CULL_FACE),
    blend: capStack(GL_BLEND),
    dither: capStack(GL_DITHER),
    stencilTest: capStack(GL_STENCIL_TEST),
    depthTest: capStack(GL_DEPTH_TEST),
    scissorTest: capStack(GL_SCISSOR_TEST),
    polygonOffsetFill: capStack(GL_POLYGON_OFFSET_FILL),
    sampleAlpha: capStack(GL_SAMPLE_ALPHA),
    sampleCoverageEnable: capStack(GL_SAMPLE_COVERAGE),

    // Blending
    blendEquation: createStack([GL_FUNC_ADD, GL_FUNC_ADD], function (rgb, a) {
      gl.blendEquationSeparate(rgb, a)
    }),
    blendFunc: createStack([
      GL_ONE, GL_ZERO, GL_ONE, GL_ZERO
    ], function (srcRGB, dstRGB, srcAlpha, dstAlpha) {
      gl.blendFuncSeparate(srcRGB, dstRGB, srcAlpha, dstAlpha)
    }),

    // Depth
    depthFunc: createStack([GL_LESS], function (func) {
      gl.depthFunc(func)
    }),
    depthRange: createStack([0, 1], function (near, far) {
      gl.depthRange(near, far)
    }),

    // Face culling
    cullFace: createStack([GL_BACK], function (mode) {
      gl.cullFace(mode)
    }),
    frontFace: createStack([GL_CCW], function (mode) {
      gl.frontFace(mode)
    }),

    // Write masks
    colorMask: createStack([true, true, true, true], function (r, g, b, a) {
      gl.colorMask(r, g, b, a)
    }),
    depthMask: createStack([true], function (m) {
      gl.depthMask(m)
    }),
    stencilMask: createStack([-1, -1], function (front, back) {
      gl.stencilMask(GL_FRONT, front)
      gl.stencilMask(GL_BACK, back)
    }),

    // Line width
    lineWidth: createStack([1], function (w) {
      gl.lineWidth(w)
    }),

    // Polygon offset
    polygonOffset: createStack([0, 0], function (factor, units) {
      gl.polygonOffset(factor, units)
    }),

    // Sample coverage
    sampleCoverage: createStack([1, false], function (value, invert) {
      gl.sampleCoverage(value, invert)
    }),

    // Stencil
    stencilFunc: createStack([
      GL_ALWAYS, 0, -1,
      GL_ALWAYS, 0, -1
    ], function (frontFunc, frontRef, frontMask,
                 backFunc, backRef, backMask) {
      gl.stencilFuncSeparate(GL_FRONT, frontFunc, frontRef, frontMask)
      gl.stencilFuncSeparate(GL_BACK, backFunc, backRef, backMask)
    }),
    stencilOp: createStack([
      GL_KEEP, GL_KEEP, GL_KEEP,
      GL_KEEP, GL_KEEP, GL_KEEP
    ], function (frontFail, frontDPFail, frontPass,
                 backFail, backDPFail, backPass) {
      gl.stencilOpSeparate(GL_FRONT, frontFail, frontDPFail, frontPass)
      gl.stencilOpSeparate(GL_BACK, backFail, backDPFail, backPass)
    }),

    // Scissor
    scissor: createStack([-1, -1, -1, -1], function (x, y, w, h) {
      gl.scissor(x, y, w, h)
    }),

    // Viewport
    viewport: createStack([-1, -1, -1, -1], function (x, y, w, h) {
      gl.viewport(x, y, w, h)
    })

    // TODO: textures
    // TODO: fbos
    // TODO: extensions
  }

  var contextProps = Object.keys(contextState)

  function pollState () {
    programState.poll()
    contextProps.forEach(function (state) {
      contextState[state].poll()
    })
  }

  function refreshState () {
    programState.refresh()
    contextProps.forEach(function (state) {
      contextState[state].refresh()
    })
  }

  function compileStateScope (defaults, argList, options) {
    var pushCode = []
    var popCode = []
    var names = []
    var inputs = []
    var args = {}

    var GL = state(gl)
    var CHECK = state(check)
    var PROGRAM_STATE = state(programState)
    var DRAW_STATE = {
      count: state(countState),
      offset: state(offsetState),
      instances: state(instancesState),
      primitive: state(primitiveState)
    }
    var CONTEXT_STATE = {}

    function state (x) {
      var name = '_s' + (names.length)
      inputs.push(x)
      names.push(name)
      return name
    }

    function context (x) {
      var result = CONTEXT_STATE[x]
      if (result) {
        return result
      }
      result = CONTEXT_STATE[x] = state(contextState[x])
      return result
    }

    var hasShader = false
    Object.keys(defaults).forEach(function (param) {
      switch (param) {
        case 'frag':
        case 'vert':
          hasShader = true
          break

        case 'uniforms':
        case 'attributes':
          break

        // Unwrap element buffer
        case 'elements':
          // TODO: Handle element buffers
          break

        // Update draw state
        case 'count':
        case 'offset':
        case 'instances':
          var value = defaults[param]
          check(
            (value >= 0) &&
            ((value | 0) === value),
            'draw parameter "' + param + '" must be a nonnegative integer')
          pushCode.push(DRAW_STATE[param], '.push(', value, ');')
          popCode.push(DRAW_STATE[param], '.pop();')
          break

        // Update primitive type
        case 'primitive':
          var primType = primTypes[defaults[param]]
          check(!!primType,
            defaults[param] + ' is not a valid drawing primitive. must be: ' +
            Object.keys(primTypes).join())
          pushCode.push(DRAW_STATE.primitive, '.push(', primType, ');')
          popCode.push(DRAW_STATE.primitive, '.pop();')
          break

        default:
          check(param in contextState, 'unsupported parameter')
          break
      }
    })

    var hasDynamicShader = false
    Object.keys(args).forEach(function (param) {
      switch (param) {
        case 'frag':
        case 'vert':
          hasDynamicShader = true
          break
        case 'uniforms':
        case 'attributes':
          break
        case 'elements':
          // Unwrap element buffer
          break
        case 'count':
        case 'offset':
        case 'instances':
          break
        default:
          check(param in contextState, 'unsupported parameter')
          break
      }
    })

    // Update program state
    var fragSrc
    var vertSrc
    if (hasDynamicShader) {
      fragSrc = args.frag ||
        '"' + (defaults.frag || 'void main(){gl_FragColor=vec4(1,0,0,1);}') + '"'
      vertSrc = args.vert ||
        '"' + (defaults.vert || 'void main(){gl_Position=vec4(0,0,0,0);}') + '"'

      var SHADER_CACHE = state(shaderCache)

      pushCode.push(PROGRAM_STATE, '.pushProgram(',
        SHADER_CACHE, '.create(', vertSrc, ',', fragSrc, '));')
      popCode.push(PROGRAM_STATE, '.popPrgram();')
    } else if (hasShader) {
      fragSrc = defaults.frag || 'void main(){gl_FragColor=vec4(1,0,0,1);}'
      vertSrc = defaults.vert || 'void main(){gl_Position=vec4(0,0,0,0);}'

      var program = shaderCache.create(vertSrc, fragSrc)
      var PROGRAM = state(program)

      pushCode.push(PROGRAM_STATE, '.pushProgram(', PROGRAM, ');')
      popCode.push(PROGRAM_STATE, '.popProgram();')
    }

    // Update uniform state
    var defaultUniforms = defaults.uniforms || {}
    var argUniforms = args.uniforms || {}


    // Update attribute state
    var defaultAttributes = defaults.attributes || {}
    var argAttributes = args.attributes || {}

    // Run poll()
    if (options.hasPoll) {
      var POLL = state(pollState)
      pushCode.push(POLL, '();')
    }

    // Handle clear state
    var clearFlags = 0

    if (defaults.clearColor || args.clearColor) {
      clearFlags |= GL_COLOR_BUFFER_BIT
      if (args.clearColor) {
        pushCode.push(GL, '.clearColor(',
          args.clearColor, '[0],',
          args.clearColor, '[1],',
          args.clearColor, '[2],',
          args.clearColor, '[3]);')
      } else {
        pushCode.push(GL, '.clearColor(',
          defaults.clearColor[0], ',',
          defaults.clearColor[1], ',',
          defaults.clearColor[2], ',',
          defaults.clearColor[3], ');')
      }
    }

    if ('clearDepth' in defaults || args.clearDepth) {
      clearFlags |= GL_DEPTH_BUFFER_BIT
      if (args.clearDepth) {
        pushCode.push(GL, '.clearDepth(', args.clearDepth, ');')
      } else {
        pushCode.push(GL, '.clearDepth(', +defaults.clearDepth, ');')
      }
    }

    if ('clearStencil' in defaults || args.clearStencil) {
      clearFlags |= GL_STENCIL_BUFFER_BIT
      if (args.clearStencil) {
        pushCode.push(GL, '.clearStencil(', args.clearStencil, ');')
      } else {
        pushCode.push(GL, '.clearStencil(', defaults.clearStencil | 0, ');')
      }
    }

    if (clearFlags) {
      pushCode.push(GL, '.clear(' + clearFlags + ');')
    }

    // If draw call present, have push state run draw call
    if (options.hasDraw) {

    }

    // If subroutine is present, run subroutine
    if (options.hasBody) {
      pushCode.push(args.body, '&&', args.body, '();')
    }

    // TODO: Future idea, maybe have some feature for rendering in batches

    var procArgs = [
      pushCode.join('') +
      popCode.join('') +
      'return { push: pushCode, pop: popCode };'
    ].concat(names)
    var proc = Function.apply(null, procArgs)
    return proc.apply(null, inputs)
  }

  return {
    create: compileStateScope,
    refresh: refreshState
  }
}
