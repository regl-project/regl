var createStack = require('./stack')
var check = require('./check')
var primTypes = require('./constants/primitives.json')
var glTypes = require('./constants/dtypes.json')

function enquote (str) {
  return '"' + str.replace(/\\/g, '\\\\').replace(/"/g, '\"') + '"'
}

module.exports = function wrapContextState (
  gl,
  extensions,
  shaderState,
  bufferState,
  textureState,
  fboState) {
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
  var GL_TRIANGLES = gl.TRIANGLES

  var GL_FLOAT = gl.FLOAT

  // Element buffer state

  // Draw state
  var primitiveState = [ GL_TRIANGLES ]
  var countState = [ 0 ]
  var offsetState = [ 0 ]
  var instancesState = [ 0 ]

  // Caps, flags and other random WebGL context state
  var contextState = {
    // Caps
    cull: capStack(GL_CULL_FACE),
    blend: capStack(GL_BLEND),
    dither: capStack(GL_DITHER),
    stencilTest: capStack(GL_STENCIL_TEST),
    depthTest: capStack(GL_DEPTH_TEST),
    scissorTest: capStack(GL_SCISSOR_TEST),
    polygonOffsetFill: capStack(GL_POLYGON_OFFSET_FILL),
    sampleAlpha: capStack(GL_SAMPLE_ALPHA),
    sampleCoverage: capStack(GL_SAMPLE_COVERAGE),

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
    sampleCoverageParams: createStack([1, false], function (value, invert) {
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

  function poll () {
    shaderState.poll()
    contextProps.forEach(function (state) {
      contextState[state].poll()
    })
  }

  function refreshState () {
    contextProps.forEach(function (state) {
      contextState[state].refresh()
    })
  }

  function compileStateScope (defaults, argList, options) {
    var entry = [] // Generated entry code
    var exit = []  // Generated exit code block

    // Linked values are passed from this scope into the generated code block
    // Calling link() passes a value into the generated scope and returns
    // the variable name which it is bound to
    var linkedNames = []
    var linkedValues = []

    function link (value) {
      var name = '_s' + linkedNames.length
      linkedNames.push(name)
      linkedValues.push(value)
      return name
    }

    // Dynamic values are unpacked from the arguments list into the args scope
    var args = {
      uniforms: {},
      attributes: {}
    }
    var entryArgs = argList.map(function (argName, index) {
      var name = '_a' + index
      if (argName.indexOf('uniforms') === 0) {
        // TODO
      } else if (argName.indexOf('attributes') === 0) {
        // TODO
      } else {
        args[argName] = name
      }
      return name
    })

    // -------------------------------
    // Common state variables
    // -------------------------------
    var GL = link(gl)
    // var CHECK = state(check)
    var SHADER_STATE = link(shaderState)
    var DRAW_STATE = {
      count: link(countState),
      offset: link(offsetState),
      instances: link(instancesState),
      primitive: link(primitiveState)
    }

    var CONTEXT_STATE = {}
    function linkContext (x) {
      var result = CONTEXT_STATE[x]
      if (result) {
        return result
      }
      result = CONTEXT_STATE[x] = link(contextState[x])
      return result
    }

    // -------------------------------
    // update default context state variables
    // -------------------------------
    function handleDefaultParam (param, value) {
      var STATE_STACK = linkContext(param)
      entry.push(STATE_STACK, '.push(')
      if (typeof value === 'number') {
        entry.push(value)
      } else {
        entry.push(value.join())
      }
      entry.push(');')
      exit.push(STATE_STACK, '.pop();')
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
          // TODO Handle element buffers
          break

        // Update draw state
        case 'count':
        case 'offset':
        case 'instances':
          var value = defaults[param]
          check.nni(value, param)
          entry.push(DRAW_STATE[param], '.push(', value, ');')
          exit.push(DRAW_STATE[param], '.pop();')
          break

        // Update primitive type
        case 'primitive':
          check.parameter(defaults[param], primTypes,
            'not a valid drawing primitive')
          var primType = primTypes[defaults[param]]
          entry.push(DRAW_STATE.primitive, '.push(', primType, ');')
          exit.push(DRAW_STATE.primitive, '.pop();')
          break

        // Caps
        case 'cull':
        case 'blend':
        case 'dither':
        case 'stencilTest':
        case 'depthTest':
        case 'scissorTest':
        case 'polygonOffsetFill':
        case 'sampleAlpha':
        case 'sampleCoverage':
        case 'stencilMask':
        case 'depthMask':
          var flag = defaults[param]
          check.type(flag, 'boolean', param)
          handleDefaultParam(param, defaults[param])
          break

        // TODO Handle the rest of the state values here

        default:
          // TODO Should this just be a warning instead?
          check.raise('unsupported parameter ' + param)
          break
      }
    })

    // -------------------------------
    // update dynamic context state variables
    // -------------------------------
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
          // TODO handle dynamic element buffer
          break

        case 'count':
        case 'offset':
        case 'instances':
          // TODO handle dynamic draw offset
          break

        default:
          check(param in contextState, 'unsupported parameter')
          break
      }
    })

    // -------------------------------
    // update shader program
    // -------------------------------
    var fragSrc
    var vertSrc
    if (hasDynamicShader) {
      fragSrc = args.frag ||
        '"' + (defaults.frag || 'void main(){gl_FragColor=vec4(1,0,0,1);}') + '"'
      vertSrc = args.vert ||
        '"' + (defaults.vert || 'void main(){gl_Position=vec4(0,0,0,0);}') + '"'

      entry.push(SHADER_STATE, '.pushProgram(',
        SHADER_STATE, '.create(', vertSrc, ',', fragSrc, '));')
      exit.push(SHADER_STATE, '.popPrgram();')
    } else if (hasShader) {
      fragSrc = defaults.frag || 'void main(){gl_FragColor=vec4(1,0,0,1);}'
      vertSrc = defaults.vert || 'void main(){gl_Position=vec4(0,0,0,0);}'

      var program = shaderState.create(vertSrc, fragSrc)
      entry.push(SHADER_STATE, '.pushProgram(', link(program), ');')
      exit.push(SHADER_STATE, '.popProgram();')
    }

    // -------------------------------
    // update default uniforms
    // -------------------------------
    var defaultUniforms = defaults.uniforms || {}
    Object.keys(defaultUniforms).forEach(function (uniform) {
      var escaped = enquote(uniform)

      var VALUE
      var value = defaultUniforms[uniform]
      if (Array.isArray(value)) {
        VALUE = link(value.slice())
      } else {
        VALUE = link([value])
      }

      shaderState.defUniform(uniform)
      entry.push(SHADER_STATE, '.uniforms[', escaped, '].push(', VALUE, ');')
      exit.push(SHADER_STATE, '.uniforms[', escaped, '].pop();')
    })

    // -------------------------------
    // update dynamic uniforms
    // -------------------------------

    // -------------------------------
    // update default attributes
    // -------------------------------
    var defaultAttributes = defaults.attributes || {}
    Object.keys(defaultAttributes).forEach(function (attribute) {
      var escaped = enquote(attribute)
      shaderState.defAttribute(attribute)

      var data = defaultAttributes[attribute]
      if (typeof data === 'number') {
        entry.push(
          SHADER_STATE, '.pushAttribute(', escaped, ',', +data, ',0,0,0);')
      } else {
        check.type(data, 'object', 'invalid attribute: ' + attribute)
        check(!!data, 'invalid attribute: ' + attribute)

        if (Array.isArray(data)) {
          entry.push(
            SHADER_STATE, '.pushAttribute(', escaped, ',',
            data[0] || 0, ',',
            data[1] || 0, ',',
            data[2] || 0, ',',
            data[3] || 0, ');')
        } else {
          var buffer = bufferState.etBuffer(data)
          var stride = 0
          var offset = 0
          var divisor = 0
          var normalized = false
          var type = GL_FLOAT

          if (!buffer) {
            buffer = bufferState.getBuffer(data.buffer)
            stride = data.stride || 0
            offset = data.offset || 0
            divisor = data.divisor || 0
            normalized = data.normalized || false

            check(!!buffer, 'attribute ' + attribute + ' missing buffer')
            check.nni(stride, attribute + ' attribute stride')
            check.nni(offset, attribute + ' attribute offset')
            check.nni(divisor, attribute + ' attribute divisor')
            check.type(normalized, 'boolean', attribute + ' attribute normalized')

            // Check for user defined type overloading
            type = buffer.dtype
            if ('type' in data) {
              check.parameter(data.type, glTypes, 'attribute type')
              type = glTypes[data.type]
            }
          } else {
            type = buffer.dtype
          }

          entry.push(
            SHADER_STATE, '.pushAttributePointer(', escaped, ',',
            link(buffer), ',',
            offset, ',',
            stride, ',',
            divisor, ',',
            normalized, ',',
            type, ');')
        }
      }
      exit.push(SHADER_STATE, '.popAttribute(', escaped, ');')
    })

    // -------------------------------
    // update dynamic attributes
    // -------------------------------

    // -------------------------------
    // poll for state changes
    // -------------------------------
    entry.push(link(poll), '();')

    // -------------------------------
    // clear display (optional)
    // -------------------------------
    var clearFlags = 0

    if (defaults.clearColor || args.clearColor) {
      clearFlags |= GL_COLOR_BUFFER_BIT
      if (args.clearColor) {
        entry.push(GL, '.clearColor(',
          args.clearColor, '[0],',
          args.clearColor, '[1],',
          args.clearColor, '[2],',
          args.clearColor, '[3]);')
      } else {
        entry.push(GL, '.clearColor(',
          defaults.clearColor[0], ',',
          defaults.clearColor[1], ',',
          defaults.clearColor[2], ',',
          defaults.clearColor[3], ');')
      }
    }

    if ('clearDepth' in defaults || args.clearDepth) {
      clearFlags |= GL_DEPTH_BUFFER_BIT
      if (args.clearDepth) {
        entry.push(GL, '.clearDepth(', args.clearDepth, ');')
      } else {
        entry.push(GL, '.clearDepth(', +defaults.clearDepth, ');')
      }
    }

    if ('clearStencil' in defaults || args.clearStencil) {
      clearFlags |= GL_STENCIL_BUFFER_BIT
      if (args.clearStencil) {
        entry.push(GL, '.clearStencil(', args.clearStencil, ');')
      } else {
        entry.push(GL, '.clearStencil(', defaults.clearStencil | 0, ');')
      }
    }

    if (clearFlags) {
      entry.push(GL, '.clear(' + clearFlags + ');')
    }

    // -------------------------------
    // draw
    // -------------------------------

    // -------------------------------
    // eval and bind
    // -------------------------------
    var entryArgList = entryArgs.join()
    var entryCode = entry.join('')
    var exitCode = exit.join('')
    var procArgs = [
      'return {enter:function(' + entryArgList + '){' +
        entryCode +
      '},exit:function(){' +
        exitCode +
      '},scope:function(BODY,' + entryArgList + '){' +
        entryCode +
        'BODY();' +
        exitCode +
      '},exec:function(' + entryArgList + '){' +
        entryCode +
        exitCode +
      '},ENTRY_CODE:' + enquote(entryCode) +
      ',EXIT_CODE:' + enquote(exitCode) +
      '};return res'
    ].concat(linkedNames)
    var proc = Function.apply(null, procArgs)
    return proc.apply(null, linkedValues)
  }

  return {
    create: compileStateScope,
    refresh: refreshState
  }
}
