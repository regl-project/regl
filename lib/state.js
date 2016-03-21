var createStack = require('./stack')
var check = require('./check')
var createEnvironment = require('./codegen')
var primTypes = require('./constants/primitives.json')
var glTypes = require('./constants/dtypes.json')

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
var GL_TRIANGLES = 4
var GL_FLOAT = 5126

var DEFAULT_FRAG_SHADER = 'void main(){gl_FragColor=vec4(0,0,0,0);}'
var DEFAULT_VERT_SHADER = 'void main(){gl_Position=vec4(0,0,0,0);}'

module.exports = function wrapContextState (
  gl,
  extensions,
  shaderState,
  bufferState,
  textureState,
  fboState,
  frameState) {
  var extInstancing = extensions.extensions.angle_instanced_arrays
  var hasInstancing = !!extInstancing

  function capStack (cap) {
    return createStack([false], function (flag) {
      if (flag) {
        gl.enable(cap)
      } else {
        gl.disable(cap)
      }
    })
  }

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
    sampleAlpha: capStack(GL_SAMPLE_ALPHA_TO_COVERAGE),
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
    scissor: createStack([0, 0, -1, -1], function (x, y, w, h) {
      gl.scissor(
        x, y,
        w < 0 ? gl.drawingBufferWidth : w,
        h < 0 ? gl.drawingBufferHeight : h)
    }),

    // Viewport
    viewport: createStack([0, 0, -1, -1], function (x, y, w, h) {
      gl.viewport(
        x, y,
        w < 0 ? gl.drawingBufferWidth : w,
        h < 0 ? gl.drawingBufferHeight : h)
    })

    // TODO: textures
    // TODO: fbos
    // TODO: extensions
  }

  var contextProps = Object.keys(contextState)

  function refreshState () {
    contextProps.forEach(function (state) {
      contextState[state].setDirty()
    })
  }

  // ==========================================================
  // Update state bindings
  // ==========================================================
  function poll () {
    shaderState.poll()
    contextProps.forEach(function (state) {
      contextState[state].poll()
    })
  }

  // ==========================================================
  // Partially evaluate a draw command
  // ==========================================================
  function partialEvaluateCommand (
    staticOptions, staticUniforms, staticAttributes,
    dynamicOptions, dynamicUniforms, dynamicAttributes,
    hasDynamic) {
    // Create code generation environment
    var env = createEnvironment()
    var link = env.link
    var block = env.block
    var proc = env.proc

    // Helper functions
    function stackTop (x) {
      return x + '[' + x + '.length-1]'
    }

    // -------------------------------
    // Common state variables
    // -------------------------------
    var GL = link(gl)
    var POLL = link(poll)
    var PROGRAM_STATE = link(shaderState.programs)
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
    Object.keys(staticOptions).forEach(function (param) {
      switch (param) {
        case 'frag':
        case 'vert':
          hasShader = true
          break

        // Update draw state
        case 'count':
        case 'offset':
        case 'instances':
          var value = staticOptions[param]
          check.nni(value, param)
          entry(DRAW_STATE[param], '.push(', value, ');')
          exit(DRAW_STATE[param], '.pop();')
          break

        // Update primitive type
        case 'primitive':
          check.parameter(staticOptions[param], primTypes,
            'not a valid drawing primitive')
          var primType = primTypes[staticOptions[param]]
          entry(DRAW_STATE.primitive, '.push(', primType, ');')
          exit(DRAW_STATE.primitive, '.pop();')
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
          var flag = staticOptions[param]
          check.type(flag, 'boolean', param)
          handleStaticOption(param, staticOptions[param])
          break

        // TODO Handle the rest of the state values here

        default:
          // TODO Should this just be a warning instead?
          check.raise('unsupported parameter ' + param)
          break
      }
    })

    // -------------------------------
    // update shader program
    // -------------------------------
    var program
    if (hasShader) {
      var fragSrc = staticOptions.frag || DEFAULT_FRAG_SHADER
      var vertSrc = staticOptions.vert || DEFAULT_VERT_SHADER
      program = shaderState.create(vertSrc, fragSrc)
      entry(PROGRAM_STATE, '.push(', link(program), ');')
      exit(PROGRAM_STATE, '.pop();')
    }

    // -------------------------------
    // update static uniforms
    // -------------------------------
    Object.keys(staticUniforms).forEach(function (uniform) {
      shaderState.defUniform(uniform)
      var STACK = link(shaderState.uniforms[uniform])
      var VALUE
      var value = staticUniforms[uniform]
      if (Array.isArray(value)) {
        VALUE = link(value.slice())
      } else {
        VALUE = link([value])
      }
      entry(STACK, '.push(', VALUE, ');')
      exit(STACK, '.pop();')
    })

    // -------------------------------
    // update default attributes
    // -------------------------------
    Object.keys(staticAttributes).forEach(function (attribute) {
      shaderState.defAttribute(attribute)
      var ATTRIBUTE = link(shaderState.attributes[attribute])

      var data = staticAttributes[attribute]
      if (typeof data === 'number') {
        entry(ATTRIBUTE, '.pushVec(', +data, ',0,0,0);')
      } else {
        check(!!data, 'invalid attribute: ' + attribute)

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
            check.type(data, 'object', 'invalid attribute "' + attribute + '"')

            buffer = bufferState.getBuffer(data.buffer)
            size = data.size || 0
            stride = data.stride || 0
            offset = data.offset || 0
            divisor = data.divisor || 0
            normalized = data.normalized || false

            check(!!buffer, 'invalid attribute ' + attribute + '.buffer')

            // Check for user defined type overloading
            type = buffer.dtype
            if ('type' in data) {
              check.parameter(data.type, glTypes, 'attribute type')
              type = glTypes[data.type]
            }
          } else {
            type = buffer.dtype
          }

          check(!!buffer, 'invalid attribute ' + attribute + '.buffer')
          check.nni(stride, attribute + '.stride')
          check.nni(offset, attribute + '.offset')
          check.nni(divisor, attribute + '.divisor')
          check.type(normalized, 'boolean', attribute + '.normalized')
          check.oneOf(size, [0, 1, 2, 3, 4], attribute + '.size')

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

    var FRAMECOUNT = dynamicEntry.def(link(frameState), '.count')
    var DYNARGS = entry.def()

    var dynamicVars = {}
    function dyn (x) {
      var id = x.id
      var result = dynamicVars[id]
      if (result) {
        return result
      }
      if (x.func) {
        result = dynamicEntry.def(link(x.data), '(', FRAMECOUNT, ',0)')
      } else {
        result = dynamicEntry.def(DYNARGS, '.', x.data)
      }
      dynamicVars[id] = result
      return result
    }

    // -------------------------------
    // dynamic context state variables
    // -------------------------------
    Object.keys(dynamicOptions).forEach(function (param) {
      // Link in dynamic variable
      var variable = dyn(dynamicOptions[param])

      switch (param) {
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
          var STATE_STACK = linkContext(param)
          dynamicEntry(STATE_STACK, '.push(', variable, ');')
          dynamicExit(STATE_STACK, '.pop();')
          break

        default:
          break
      }
    })

    // -------------------------------
    // dynamic uniforms
    // -------------------------------
    Object.keys(dynamicUniforms).forEach(function (uniform) {
      var STACK = link(shaderState.uniforms[uniform])
      var VALUE = dyn(dynamicUniforms[uniform])
      shaderState.defUniform(uniform)
      dynamicEntry(
        'if(typeof ', VALUE, '==="number"){',
        STACK, '.push([', VALUE, ']);',
        '}else{',
        STACK, '.push(', VALUE, ');',
        '}')
      dynamicExit(STACK, '.pop();')
    })

    // -------------------------------
    // dynamic attributes
    // -------------------------------
    Object.keys(dynamicAttributes).forEach(function (attribute) {
      var ATTRIBUTE = link(shaderState.attributes[attribute])
      var VALUE = dyn(dynamicAttributes[attribute])
      shaderState.defAttribute(attribute)
      dynamicEntry(ATTRIBUTE, '.pushDyn(', VALUE, ');')
      dynamicExit(ATTRIBUTE, '.pop();')
    })

    // ==========================================================
    // SCOPE PROCEDURE
    // ==========================================================
    var scope = proc('scope')

    scope(entry)

    if (hasDynamic) {
      scope(
        DYNARGS, '=', scope.arg(), ';',
        dynamicEntry)
    }

    scope(
      scope.arg(), '();',
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

    draw(POLL, '();')

    // Generate draw command
    var CUR_PRIMITIVE = stackTop(DRAW_STATE.primitive)
    var CUR_COUNT = stackTop(DRAW_STATE.count)
    var CUR_OFFSET = stackTop(DRAW_STATE.offset)

    if (hasInstancing) {
      var CUR_INSTANCES = draw.def(stackTop(DRAW_STATE.instances))
      draw(
        'if(', CUR_INSTANCES, '>0){',
        // then
        GL, '.drawArraysInstancedANGLE(',
        CUR_PRIMITIVE, ',',
        CUR_OFFSET, ',',
        CUR_COUNT, ',',
        CUR_INSTANCES, ');}else{',
        // else
        GL, '.drawArrays(',
        CUR_PRIMITIVE, ',',
        CUR_OFFSET, ',',
        CUR_COUNT, ');}')
    } else {
      draw(
        GL, '.drawArrays(',
        CUR_PRIMITIVE, ',',
        CUR_OFFSET, ',',
        CUR_COUNT, ');')
    }

    draw(
      hasDynamic ? dynamicExit : '',
      exit)

    // ==========================================================
    // BATCH DRAW
    // ==========================================================
    if (hasDynamic) {
      // TODO
    }

    // -------------------------------
    // eval and bind
    // -------------------------------
    return env.compile()
  }

  return {
    poll: poll,
    create: partialEvaluateCommand,
    refresh: refreshState
  }
}
