var check = require('./check')
var createEnvironment = require('./codegen')
var primTypes = require('./constants/primitives.json')
var glTypes = require('./constants/dtypes.json')

var DEFAULT_FRAG_SHADER = 'void main(){gl_FragColor=vec4(0,0,0,0);}'
var DEFAULT_VERT_SHADER = 'void main(){gl_Position=vec4(0,0,0,0);}'

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
    case GL_FLOAT_MAT2:
      infix = 'Matrix2f'
      separator = ',true,'
      break
    case GL_FLOAT_MAT3:
      infix = 'Matrix3f'
      separator = ',true,'
      break
    case GL_FLOAT_MAT4:
      infix = 'Matrix4f'
      separator = ',true,'
      break
    default:
      check.raise('unsupported uniform type')
  }
  return gl + '.uniform' + infix + 'v(' + location + separator + value + ');'
}

module.exports = function reglCompiler (
  gl,
  extensionState,
  bufferState,
  textureState,
  fboState,
  glState,
  uniformState,
  attributeState,
  shaderState,
  frameState) {
  var extensions = extensionState.extensions
  var INSTANCING = extensions.angle_instanced_arrays

  var contextState = glState.contextState
  var drawState = glState.drawState

  var drawCallCounter = 0

  // ===================================================
  // SHADER POLL OPERATION
  // ===================================================
  function compileShaderPoll (program) {
    var env = createEnvironment()
    var link = env.link
    var poll = env.proc('poll')

    var GL = link(gl)
    var PROGRAM = link(program.program)
    var BIND_ATTRIBUTE = link(attributeState.bind)

    // bind the program
    poll(GL, '.useProgram(', PROGRAM, ');')

    // set up attribute state
    program.attributes.forEach(function (attribute) {
      var STACK = link(attributeState.attributes[attribute.name])
      poll(BIND_ATTRIBUTE, '(',
        attribute.location, ',',
        link(attributeState.bindings[attribute.location]), ',',
        STACK, '.records[', STACK, '.top]', ',',
        typeLength(attribute.info.type), ');')
    })

    // set up uniforms
    program.uniforms.forEach(function (uniform) {
      var LOCATION = link(uniform.location)
      var STACK = link(uniformState.uniforms[uniform.name])
      var TOP = STACK + '[' + STACK + '.length-1]'
      poll(setUniformString(GL, uniform.info.type, LOCATION, TOP))
    })

    return env.compile().poll
  }

  // ===================================================
  // BATCH DRAW OPERATION
  // ===================================================
  function execBatch (program, id, frame, args, options, attributes, uniforms) {
    var proc = program.dynamicCache[id]
    if (!proc) {
      proc = program.dynamicCache[id] = compileBatch(
        program, options, attributes, uniforms)
    }
    return proc(frame, args)
  }

  function compileBatch (program, options, uniforms, attributes) {
    var env = createEnvironment()
    var link = env.link
    var batch = env.proc()
    var exit = env.block()
    var def = batch.def
    var arg = batch.arg

    var GL = link(gl)
    var FRAME_COUNT = arg()
    var ARGS = arg()
    var IDX = def()
    var DYNARG = def()
    var NUMARGS = def()
    var USEARG = def(false)

    // Allocate a dynamic variable
    var dynamicVars = {}
    function dyn (x) {
      var id = x.id
      var result = dynamicVars[id]
      if (result) {
        return result
      }
      if (x.func) {
        result = batch.def(
          link(x.data), '(', FRAME_COUNT, ',', IDX, ',', DYNARG, ')')
      } else {
        result = batch.def(DYNARG, '.', x.data)
      }
      dynamicVars[id] = result
      return result
    }

    function findInfo (info, name) {
      var index = info.find(function (item) {
        return item.name === name
      })
      if (index < 0) {
        return null
      }
      return info[index]
    }

    // Loop over all arguments
    batch(
      'if(typeof ', ARGS, '==="number"){',
      NUMARGS, '=', ARGS, '|0;',
      '}else{',
      NUMARGS, '=', ARGS, '.length;',
      USEARG, '=true;',
      '}for(', IDX, '=0;', IDX, '<', NUMARGS, ';++', IDX, '){',
      DYNARG, '=', USEARG, '&&', ARGS, '[', IDX, '];')

    // Set state options
    Object.keys(options.forEach(function (option) {
      switch (option) {
        default:
          check.raise('unsupported option for batch', option)
      }
    }))

    // Set uniforms
    var programUniforms = program.uniforms
    Object.keys(uniforms.forEach(function (uniform) {
      var data = findInfo(programUniforms, uniform)
      if (!data) {
        return
      }
      var TYPE = data.info.type
      var LOCATION = link(data.location)
      var VALUE = dyn(uniforms[uniform])
      batch(setUniformString(GL, TYPE, LOCATION, VALUE))
    }))

    // Set attributes
    var BIND_ATTRIBUTE = link(attributeState.bind)
    var programAttributes = program.attributes
    Object.keys(attributes.forEach(function (attribute) {
      var data = findInfo(programAttributes, attribute)
      if (!data) {
        return
      }
      batch(BIND_ATTRIBUTE, '(',
        data.location, ',',
        link(attribute.bindings[data.location]), ',',
        dyn(attributes[attribute]), ',',
        typeLength(data.info.type), ');')
    }))

    batch('}', exit)

    return env.compile().batch
  }

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

    // Helper functions
    function stackTop (x) {
      return x + '[' + x + '.length-1]'
    }

    // -------------------------------
    // Common state variables
    // -------------------------------
    var GL = link(gl)
    var POLL = link(glState.poll)
    var PROGRAM_STATE = link(shaderState.programs)
    var DRAW_STATE = {
      count: link(drawState.count),
      offset: link(drawState.offset),
      instances: link(drawState.instances),
      primitive: link(drawState.primitive)
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
      uniformState.def(uniform)
      var STACK = link(uniformState.uniforms[uniform])
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
      attributeState.def(attribute)
      var ATTRIBUTE = link(attributeState.attributes[attribute])

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

    var FRAMECOUNT
    var DYNARGS
    if (hasDynamic) {
      FRAMECOUNT = entry.def(link(frameState), '.count')
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
          link(x.data), '(', FRAMECOUNT, ',0,', DYNARGS, ')')
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
      var STACK = link(uniformState.uniforms[uniform])
      var VALUE = dyn(dynamicUniforms[uniform])
      uniformState.def(uniform)
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
      var ATTRIBUTE = link(attributeState.attributes[attribute])
      var VALUE = dyn(dynamicAttributes[attribute])
      attributeState.def(attribute)
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

    if (INSTANCING) {
      var CUR_INSTANCES = draw.def(stackTop(DRAW_STATE.instances))
      var INSTANCE_EXT = link(INSTANCING)
      draw(
        'if(', CUR_INSTANCES, '>0){',
        // then
        INSTANCE_EXT, '.drawArraysInstancedANGLE(',
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
      var batch = proc('batch')
      batch(entry)
      var CUR_SHADER = batch.def(stackTop(PROGRAM_STATE))
      var EXEC_BATCH = link(execBatch)
      batch(
        'if(', CUR_SHADER, '){',
        POLL, '();',
        EXEC_BATCH, '(',
        CUR_SHADER, ',',
        callId, ',',
        FRAMECOUNT, ',',
        batch.arg(), ',',
        link(dynamicOptions), ',',
        link(dynamicAttributes), ',',
        link(dynamicUniforms), ');}',
        exit)
    }

    // -------------------------------
    // eval and bind
    // -------------------------------
    return env.compile()
  }

  return {
    poll: compileShaderPoll,
    command: compileCommand
  }
}
