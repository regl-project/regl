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
      separator = ',true,'
      break
    case GL_FLOAT_MAT3:
      infix = 'Matrix3fv'
      separator = ',true,'
      break
    case GL_FLOAT_MAT4:
      infix = 'Matrix4fv'
      separator = ',true,'
      break
    default:
      check.raise('unsupported uniform type')
  }
  return gl + '.uniform' + infix + '(' + location + separator + value + ');'
}

function stackTop (x) {
  return x + '[' + x + '.length-1]'
}

module.exports = function reglCompiler (
  gl,
  extensionState,
  bufferState,
  drawState,
  textureState,
  fboState,
  glState,
  uniformState,
  attributeState,
  shaderState,
  frameState) {
  var extensions = extensionState.extensions

  var contextState = glState.contextState

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

    var GL = link(gl)
    var PROGRAM = link(program.program)
    var BIND_ATTRIBUTE = link(attributeState.bind)
    var DRAW_STATE = {
      count: link(drawState.count),
      offset: link(drawState.offset),
      instances: link(drawState.instances),
      primitive: link(drawState.primitive)
    }

    // bind the program
    draw(GL, '.useProgram(', PROGRAM, ');')

    // set up attribute state
    program.attributes.forEach(function (attribute) {
      var STACK = link(attributeState.attributes[attribute.name])
      draw(BIND_ATTRIBUTE, '(',
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
      draw(setUniformString(GL, uniform.info.type, LOCATION, TOP))
    })

    // Execute draw command
    var CUR_PRIMITIVE = stackTop(DRAW_STATE.primitive)
    var CUR_COUNT = stackTop(DRAW_STATE.count)
    var CUR_OFFSET = stackTop(DRAW_STATE.offset)

    var instancing = extensions.angle_instanced_arrays
    if (instancing) {
      var CUR_INSTANCES = draw.def(stackTop(DRAW_STATE.instances))
      var INSTANCE_EXT = link(instancing)
      draw(
        'if(', CUR_INSTANCES, '>0){',
        INSTANCE_EXT, '.drawArraysInstancedANGLE(',
        CUR_PRIMITIVE, ',',
        CUR_OFFSET, ',',
        CUR_COUNT, ',',
        CUR_INSTANCES, ');}else{',
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

    return env.compile().draw
  }

  // ===================================================
  // ===================================================
  // BATCH DRAW OPERATION
  // ===================================================
  // ===================================================
  function compileBatch (program, options, uniforms, attributes) {
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
    var FRAME_COUNT = def(FRAME_STATE, '.count')

    var DRAW_STATE = {
      count: link(drawState.count),
      offset: link(drawState.offset),
      instances: link(drawState.instances),
      primitive: link(drawState.primitive)
    }
    var CUR_COUNT = def(stackTop(DRAW_STATE.count))
    var CUR_OFFSET = def(stackTop(DRAW_STATE.offset))
    var CUR_PRIMITIVE = def(stackTop(DRAW_STATE.primitive))
    var CUR_INSTANCES
    var INSTANCE_EXT
    var instancing = extensions.angle_instanced_arrays
    if (instancing) {
      CUR_INSTANCES = def(stackTop(DRAW_STATE.instances))
      INSTANCE_EXT = link(instancing)
    }

    // -------------------------------
    // batch/argument vars
    // -------------------------------
    var ARGS = arg()
    var ARG = def()
    var BATCH_ID = def()
    var NUM_ARGS = def()

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
          link(x.data), '(', FRAME_COUNT, ',', BATCH_ID, ',', ARG, ')')
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
      var STACK = link(uniformState.uniforms[uniform.name])
      var TOP = STACK + '[' + STACK + '.length-1]'
      batch(setUniformString(GL, uniform.info.type, LOCATION, TOP))
    })

    // -------------------------------
    // set static attributes
    // -------------------------------
    program.attributes.forEach(function (attribute) {
      if (attributes.name in attributes) {
        return
      }
      var STACK = link(attributeState.attributes[attribute.name])
      batch(BIND_ATTRIBUTE, '(',
        attribute.location, ',',
        link(attributeState.bindings[attribute.location]), ',',
        STACK, '.records[', STACK, '.top]', ',',
        typeLength(attribute.info.type), ');')
    })

    // -------------------------------
    // loop over all arguments
    // -------------------------------
    batch(
      NUM_ARGS, '=', ARGS, '.length;',
      'for(', BATCH_ID, '=0;', BATCH_ID, '<', NUM_ARGS, ';++', BATCH_ID, '){',
      ARG, '=', ARGS, '[', BATCH_ID, '];')

    // -------------------------------
    // set dynamic flags
    // -------------------------------
    Object.keys(options).forEach(function (option) {
      switch (option) {
        default:
          check.raise('unsupported option for batch', option)
      }
    })

    // -------------------------------
    // set dynamic uniforms
    // -------------------------------
    var programUniforms = program.uniforms
    Object.keys(uniforms).forEach(function (uniform) {
      var data = findInfo(programUniforms, uniform)
      if (!data) {
        return
      }
      var TYPE = data.info.type
      var LOCATION = link(data.location)
      var VALUE = dyn(uniforms[uniform])
      batch(setUniformString(GL, TYPE, LOCATION, VALUE))
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
    }
    if (options.offset) {
      batch(CUR_OFFSET, '=', dyn(options.offset), ';')
    }
    if (options.primitive) {
      var PRIM_TYPES = link(primTypes)
      batch(CUR_PRIMITIVE, '=', PRIM_TYPES, '[', dyn(options.primitive), '];')
    }
    if (instancing) {
      if (options.instances) {
        batch(CUR_INSTANCES, '=', dyn(options.instances), ';')
      }
      batch(
        'if(', CUR_INSTANCES, '>0){',
        INSTANCE_EXT, '.drawArraysInstancedANGLE(',
        CUR_PRIMITIVE, ',',
        CUR_OFFSET, ',',
        CUR_COUNT, ',',
        CUR_INSTANCES, ');}else{',
        GL, '.drawArrays(',
        CUR_PRIMITIVE, ',',
        CUR_OFFSET, ',',
        CUR_COUNT, ');}')
    } else {
      batch(
        GL, '.drawArrays(',
        CUR_PRIMITIVE, ',',
        CUR_OFFSET, ',',
        CUR_COUNT, ');')
    }

    // -------------------------------
    // compile and return
    // -------------------------------
    batch('}', exit)
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
    var GL_POLL = link(glState.poll)
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
        VALUE = +value
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
          dynamicExit(PRIM_STACK, '.pop()')
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
      dynamicEntry(STACK, '.push(', VALUE, ');')
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

    var CURRENT_SHADER = stackTop(PROGRAM_STATE)
    draw(
      GL_POLL, '();',
      'if(', CURRENT_SHADER, ')', CURRENT_SHADER, '.draw();')

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
      var EXEC_BATCH = link(function (program, args) {
        var proc = program.batchCache[callId]
        if (!proc) {
          proc = program.batchCache[callId] = compileBatch(
            program, dynamicOptions, dynamicUniforms, dynamicAttributes)
        }
        return proc(args)
      })
      batch(
        'if(', CUR_SHADER, '){',
        GL_POLL, '();',
        EXEC_BATCH, '(',
        CUR_SHADER, ',',
        batch.arg(), ');}',
        exit)
    }

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
