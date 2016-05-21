var check = require('./util/check')
var createEnvironment = require('./util/codegen')
var isTypedArray = require('./util/is-typed-array')

var primTypes = require('./constants/primitives.json')
var glTypes = require('./constants/dtypes.json')

var CUTE_COMPONENTS = 'xyzw'.split('')

var GL_ARRAY_BUFFER = 34962
// var GL_ELEMENT_ARRAY_BUFFER = 34963

var GL_FRAGMENT_SHADER = 35632
var GL_VERTEX_SHADER = 35633

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

var GL_CULL_FACE = 0x0B44
var GL_BLEND = 0x0BE2
var GL_DITHER = 0x0BD0
var GL_STENCIL_TEST = 0x0B90
var GL_DEPTH_TEST = 0x0B71
var GL_SCISSOR_TEST = 0x0C11
var GL_POLYGON_OFFSET_FILL = 0x8037
var GL_SAMPLE_ALPHA_TO_COVERAGE = 0x809E
var GL_SAMPLE_COVERAGE = 0x80A0
*/

var GL_FRONT = 1028
var GL_BACK = 1029

var GL_CW = 0x0900
var GL_CCW = 0x0901

var GL_MIN_EXT = 0x8007
var GL_MAX_EXT = 0x8008

var DYN_FUNC = 0
var DYN_PROP = 1
var DYN_CONTEXT = 2
var DYN_STATE = 3

var GL_ALWAYS = 519

var GL_KEEP = 7680

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
  contextState,
  reglPoll) {
  var blendEquations = {
    'add': 32774,
    'subtract': 32778,
    'reverse subtract': 32779
  }
  if (extensions.ext_blend_minmax) {
    blendEquations.min = GL_MIN_EXT
    blendEquations.max = GL_MAX_EXT
  }

  // var drawCallCounter = 0

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
    var env = createEnvironment()
    var link = env.link
    var block = env.block
    var proc = env.proc

    // var CALL_ID = drawCallCounter++

    var SHADER_STATE = link(shaderState)
    var GL_STATE = link(glState)
    var FRAMEBUFFER_STATE = link(framebufferState)
    var DRAW_STATE = link(drawState)
    var ELEMENT_STATE = link(elementState)
    var CONTEXT = link(contextState)
    var STRING_STORE = link(stringStore)
    var UNIFORM_STATE = link(uniformState)
    var BUFFER_STATE = link(bufferState)

    var IS_TYPED_ARRAY = link(isTypedArray)
    var PRIM_TYPES = link(primTypes)
    var COMPARE_FUNCS = link(compareFuncs)
    var BLEND_FUNCS = link(blendFuncs)
    var BLEND_EQUATIONS = link(blendEquations)
    var STENCIL_OPS = link(stencilOps)
    var GL_TYPES = link(glTypes)

    // Inject runtime assertion stuff
    var CHECK, COMMAND
    check.optional(function (command) {
      CHECK = link(CHECK)
      COMMAND = link(COMMAND)
    })

    // -------------------------------
    var scope = proc('scope')
    var draw = proc('draw')
    var batch = proc('batch')

    scope.arg()
    batch.arg()
    draw.arg()

    var entry = block()
    var exit = block()
    var scopeExit = block()
    var dynamicEntry = block()
    var dynamicExit = block()
    var PROPS = 'a0'

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

    function saveProp (object, prop) {
      var TEMP = entry.def(object, prop)
      exit(object, prop, '=', TEMP, ';')
    }

    function saveDynamic (object, prop) {
      var TEMP = dynamicEntry.def(object, prop)
      dynamicExit(object, prop, '=', TEMP, ';')
    }

    function setStatic (object, prop, expr) {
      saveProp(object, prop)
      entry(object, prop, '=', expr, ';')
    }

    function setDynamic (object, prop, expr) {
      // we save the prop in the static section since it will get invalidated
      saveProp(object, prop)
      dynamicEntry(object, prop, '=', expr, ';')
    }

    function setScope (object, prop, expr) {
      saveScope(object, prop)
      scope(object, prop, '=', expr, ';')
    }

    function invoke (block, x) {
      switch (x.type) {
        case DYN_FUNC:
          return block.def(
            link(x.data), '.call(this,', PROPS, ',', CONTEXT, ')')
        case DYN_PROP:
          return block.def(PROPS, x.data)
        case DYN_CONTEXT:
          return block.def(CONTEXT, x.data)
        case DYN_STATE:
          return block.def('this', x.data)
      }
    }

    // -------------------------------
    // update context variables
    // -------------------------------
    // Initialize batch id
    entry(CONTEXT, '.batchId=0;')
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
      var PREV_VALUE = entry.def(CONTEXT, '.', contextVar)
      var NEXT_VALUE = entry.def()
      var x = dynamicContext[contextVar]
      contextEnter(CONTEXT, '.', contextVar, '=', NEXT_VALUE, ';')
      switch (x.type) {
        case DYN_FUNC:
          entry(NEXT_VALUE, '=', link(x.data), '.call(this,', PROPS, ',', CONTEXT, ');')
          break
        case DYN_PROP:
          entry(NEXT_VALUE, '=', PROPS, x.data, ';')
          break
        case DYN_CONTEXT:
          entry(NEXT_VALUE, '=', PROPS, x.data, ';')
          break
        case DYN_STATE:
          entry(NEXT_VALUE, '=', 'this', x.data, ';')
          break
      }
      exit(CONTEXT, '.', contextVar, '=', PREV_VALUE, ';')
    })

    entry(contextEnter)

    // ======================================
    // update context state variables
    // ======================================

    var staticOptions = options.static
    var dynamicOptions = options.dynamic

    // -------------------------------
    // update framebuffer and viewport
    // -------------------------------
    var hasStaticViewport = 'viewport' in staticOptions
    var hasDynamicViewport = 'viewport' in dynamicOptions
    var hasViewport = hasStaticViewport || hasDynamicViewport
    var hasStaticScissorBox = 'scissor.box' in staticOptions
    var hasDynamicScissorBox = 'scissor.box' in dynamicOptions
    var hasScissorBox = hasStaticScissorBox || hasDynamicScissorBox
    var hasStaticFramebuffer = 'framebuffer' in staticOptions
    var hasDynamicFramebuffer = 'framebuffer' in dynamicOptions
    var hasFramebuffer = hasStaticFramebuffer || hasDynamicFramebuffer

    function saveStaticVec4 (name) {
      for (var i = 0; i < 4; ++i) {
        saveProp(GL_STATE, '.next["' + name + '"][' + i + ']')
      }
    }
    if (hasFramebuffer || hasViewport) {
      saveStaticVec4('viewport')
    }
    if (hasFramebuffer || hasScissorBox) {
      saveStaticVec4('scissor')
    }
    if (hasFramebuffer) {
      saveProp(FRAMEBUFFER_STATE, '.next')
      saveProp(CONTEXT, '.framebufferWidth')
      saveProp(CONTEXT, '.framebufferHeight')
    }

    var widthPrefix = CONTEXT + '.framebufferWidth='
    var heightPrefix = CONTEXT + '.framebufferHeight='

    if (!hasViewport) {
      widthPrefix += CONTEXT + '.viewportWidth=' +
        GL_STATE + '.next.viewport[2]='
      heightPrefix += CONTEXT + '.viewportHeight=' +
        GL_STATE + '.next.viewport[3]='
    }
    if (!hasScissorBox) {
      widthPrefix += GL_STATE + '.next["scissor.box"][2]='
      heightPrefix += GL_STATE + '.next["scissor.box"][3]='
    }

    var FRAMEBUFFER
    if (hasStaticFramebuffer) {
      var framebuffer = staticOptions.framebuffer
      if (framebuffer) {
        entry(
          FRAMEBUFFER_STATE, '.next=null;',
          widthPrefix, CONTEXT, '.drawingBufferWidth;',
          heightPrefix, CONTEXT, '.drawingBufferHeight;')
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
      FRAMEBUFFER = invoke(entry, dynamicOptions.framebuffer)
      entry(
        'if(', FRAMEBUFFER, '){',
        FRAMEBUFFER_STATE, '.next=', FRAMEBUFFER, ';',
        widthPrefix, FRAMEBUFFER, '.width;',
        heightPrefix, FRAMEBUFFER, '.height;',
        '}else{',
        FRAMEBUFFER_STATE, '.next=null;',
        widthPrefix, CONTEXT, '.drawingBufferWidth;',
        heightPrefix, CONTEXT, '.drawingBufferHeight;}')
      draw(FRAMEBUFFER_STATE, '.poll();')
    } else {
      batch(FRAMEBUFFER_STATE, '.poll();')
      draw(FRAMEBUFFER_STATE, '.poll();')
    }

    function setBoxParameter (name) {
      var BOX = GL_STATE + '.next["' + name + '"]'
      var viewportWidth = ''
      var viewportHeight = ''
      if (name === 'viewport') {
        viewportWidth = CONTEXT + '.viewportWidth='
        viewportHeight = CONTEXT + '.viewportHeight='
      }
      if (name in staticOptions) {
        var box = staticOptions[name]
        check.commandType(box, 'object', name)
        var boxX = box.x || 0
        var boxY = box.y || 0
        check.commandType(boxX, 'number', name + '.x')
        check.commandType(boxY, 'number', name + '.y')
        entry(
          BOX, '[0]=', boxX, ';',
          BOX, '[1]=', boxY, ';')
        if ('w' in box) {
          check.commandType(box.w, 'number', name + '.w')
          entry(viewportWidth, BOX, '[2]=', box.w, ';')
        } else {
          entry(viewportWidth, BOX, '[2]=', CONTEXT, '.framebufferWidth;')
        }
        if ('h' in box) {
          check.commandType(box.h, 'number', name + '.h')
          entry(viewportHeight, BOX, '[3]=', box.h, ';')
        } else {
          entry(viewportHeight, BOX, '[3]=', CONTEXT, '.framebufferHeight;')
        }
      } else if (name in dynamicOptions) {
        var value = invoke(dynamicEntry, dynamicOptions[name])
        dynamicEntry(
          BOX, '[0]=', value, '.x|0;',
          BOX, '[1]=', value, '.y|0;',
          viewportWidth, BOX, '[2]="w" in ', value, '?', value, '.w:', CONTEXT, '.framebufferWidth;',
          viewportHeight, BOX, '[3]="h" in ', value, '?', value, '.h:', CONTEXT, '.framebufferHeight;')
      } else if (hasFramebuffer) {
        entry(BOX, '[0]=', BOX, '[1]=0;')
      }
    }
    setBoxParameter('viewport')
    setBoxParameter('scissor.box')

    // Handle element buffer
    var hasPrimitive = !(
      ('primitive' in staticOptions) ||
      ('primitive' in dynamicOptions))
    var hasCount = !(
      ('count' in staticOptions) ||
      ('count' in dynamicOptions))
    var ELEMENTS
    if ('elements' in staticOptions) {
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

    // Special case:  vertex shader and fragment shader are static
    // TODO:  Should also use this to inline batch/draw command
    var staticShader = false
    var shaderBlock = block()
    var PROGRAM = shaderBlock.def()
    if ('frag' in staticOptions && 'vert' in dynamicOptions) {
      staticShader = true
      var fragId = stringStore.id(staticOptions.vert)
      var vertId = stringStore.id(staticOptions.frag)
      shaderState.shader(GL_FRAGMENT_SHADER, fragId)
      shaderState.shader(GL_VERTEX_SHADER, vertId)
      shaderBlock(PROGRAM, '=', link(shaderState.program(vertId, fragId)), ';')
      setScope(SHADER_STATE, '.frag', fragId)
      setScope(SHADER_STATE, '.vert', vertId)
    }

    Object.keys(staticOptions).forEach(function (param) {
      var value = staticOptions[param]

      function handleStaticGLState (x) {
        if (typeof x === 'undefined') {
          x = value
        }
        if (Array.isArray(x)) {
          for (var i = 0; i < value.length; ++i) {
            setStatic(GL_STATE, '.next["' + param + '"][' + i + ']', x[i])
          }
        } else {
          setStatic(GL_STATE, '.next["' + param + '"]', x)
        }
        // insert batch poll operation
        batch(GL_STATE, '.poll_', param.replace('.', '_'), '();')
      }

      switch (param) {
        case 'framebuffer':
        case 'viewport':
        case 'scissor.box':
        case 'elements':
          break

        case 'vert':
        case 'frag':
          if (!staticShader) {
            var shaderId = stringStore.id(staticOptions[param])
            shaderState.shader(shaderType[param], shaderId)
            setStatic(SHADER_STATE, '.' + param, shaderId)
          }
          break

        case 'count':
        case 'offset':
        case 'instances':
          check.command(value >= 0 && typeof value === 'number',
            'invalid draw parameter "' + '"')
          setScope(DRAW_STATE, '.' + param, value)
          break

        // Update primitive type
        case 'primitive':
          check.commandParameter(
            value, primTypes, 'not a valid drawing primitive')
          setScope(DRAW_STATE, '.' + param, primTypes[value])
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
          check.commandType(value, 'boolean', param)
          handleStaticGLState()
          break

        case 'depth.func':
          check.commandParameter(value, compareFuncs, param)
          handleStaticGLState()
          break

        case 'depth.range':
          check.command(
            Array.isArray(value) &&
            value.length === 2 &&
            value[0] <= value[1],
            'depth range is 2d array')
          handleStaticGLState()
          break

        case 'blend.func':
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

        case 'blend.equation':
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

        case 'blend.color':
          check.command(
            Array.isArray(value) &&
            value.length === 4,
            'blend color is a 4d array')
          handleStaticGLState()
          break

        case 'stencil.mask':
          check.commandType(value, 'number', param)
          handleStaticGLState()
          break

        case 'stencil.func':
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

        case 'stencil.opFront':
        case 'stencil.opBack':
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

        case 'polygonOffset.offset':
          check.commandType(value, 'object', param)
          var factor = value.factor || 0
          var units = value.units || 0
          check.commandType(factor, 'number', param + '.factor')
          check.commandType(units, 'number', param + '.units')
          handleStaticGLState([factor, units])
          break

        case 'cull.face':
          var face = 0
          if (value === 'front') {
            face = GL_FRONT
          } else if (value === 'back') {
            face = GL_BACK
          }
          check.command(!!face, 'cull.face')
          handleStaticGLState(face)
          break

        case 'lineWidth':
          check.command(
            typeof value === 'number' &&
            value >= limits.lineWidthDims[0] &&
            value <= limits.lineWidthDims[1],
            'invalid line width, must positive number between ' +
            limits.lineWidthDims[0] + ' and ' + limits.lineWidthDims[1])
          handleStaticGLState()
          break

        case 'frontFace':
          check.commandParameter(value, orientationType, param)
          handleStaticGLState(orientationType[value])
          break

        case 'colorMask':
          check.command(
            Array.isArray(value) && value.length === 4,
            'color.mask must be length 4 array')
          handleStaticGLState(value.map(function (v) { return !!v }))
          break

        case 'sample.coverage':
          check.commandType(value, 'object', param)
          var sampleValue = 'value' in value ? value.value : 1
          var sampleInvert = !!value.invert
          check.command(
            typeof sampleValue === 'number' &&
            sampleValue >= 0 && sampleValue <= 1,
            'sample value')
          handleStaticGLState([sampleValue, sampleInvert])
          break

        default:
          check.commandRaise('unsupported parameter ' + param)
          break
      }
    })

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
          for (var i = 0; i < value.length; ++i) {
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

    // Update shader pointer and poll
    if (!staticShader) {
      shaderBlock(PROGRAM, '=',
        SHADER_STATE, '.program(',
        SHADER_STATE, '.vert,',
        SHADER_STATE, '.frag')
      check.optional(function (command) {
        shaderBlock(',', COMMAND)
      })
      shaderBlock(');')
    }
    draw(shaderBlock, GL_STATE, '.procs.poll();')
    batch(shaderBlock)

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

    // ==========================================================
    // Close out blocks
    // ==========================================================
    // Finish up scope
    scope(scope.arg(), '();',
      dynamicExit,
      exit)

    // Finish up draw command
    /*
    function execDraw (program, obj, props) {
      var drawShader = program.drawCache[CALL_ID]
      if (!drawShader) {
        drawShader =
          program.drawCache[CALL_ID] =
          compileDrawCommand(program, options, uniforms, attributes)
      }
      drawShader.call(obj, props)
    }
    if (staticShader) {
      // TODO inline draw call
    } else {
      draw(link(execDraw), '(', PROGRAM, ',this,a0);')
    }
    */
    draw(dynamicExit, exit)

    // Handle batch mode
    batch.arg()
    /*
    function execBatch (program, obj, count, props) {
      var drawBatch = program.drawBatch[CALL_ID]
      if (!drawBatch) {
        drawBatch =
          program.batchCache[CALL_ID] =
          compileBatchCommand(program, options, uniforms, attributes)
      }
      drawBatch.call(obj, count, props)
    }
    if (staticShader) {
      // TODO: inline batch draw call
    } else {
      batch(link(execBatch), '(', PROGRAM, ',this,a1,a0);')
    }
    */
    batch(exit)

    return env.compile()
  }

  return compileCommand
}
