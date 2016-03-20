// Shader state management

var check = require('./check')
var createEnvironment = require('./codegen')

module.exports = function wrapShaderState (gl, extensions) {
  var GL_FRAGMENT_SHADER = 35632
  var GL_VERTEX_SHADER = 35633

  // uniform types
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

  var NUM_ATTRIBUTES = gl.getParameter(gl.MAX_VERTEX_ATTRIBS)

  var extInstancing = extensions.extensions.angle_instanced_arrays
  var USE_INSTANCING = !!extInstancing

  // ===================================================
  // shader compilation
  // ===================================================
  var shaders = {}

  function getShader (type, source) {
    var cache = shaders[type]
    var shader = cache[source]

    if (!shader) {
      shader = gl.createShader(type)
      gl.shaderSource(shader, source)
      gl.compileShader(shader)

      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        var errLog = gl.getShaderInfoLog(shader)
        check.raise('Error compiling shader:\n' + errLog)
      }
      cache[source] = shader
    }

    return shader
  }

  function refreshShaders () {
    shaders[GL_FRAGMENT_SHADER] = {}
    shaders[GL_VERTEX_SHADER] = {}
  }

  function clearShaders () {
    Object.keys(shaders).forEach(function (type) {
      Object.keys(shaders[type]).forEach(function (shader) {
        gl.destroyShader(shader)
      })
    })
    shaders[GL_FRAGMENT_SHADER] = {}
    shaders[GL_VERTEX_SHADER] = {}
  }

  // ===================================================
  // program linking
  // ===================================================
  var programs = {}
  var programList = []

  function UniformInfo (name, location, info) {
    this.name = name
    this.location = location
    this.info = info
  }

  function AttributeInfo (name, location, info) {
    this.name = name
    this.location = location
    this.info = info
  }

  function REGLProgram (fragSrc, vertSrc) {
    this.fragSrc = fragSrc
    this.vertSrc = vertSrc
    this.program = null
    this.uniforms = []
    this.attributes = []
    this.poll = function () {}
  }

  Object.assign(REGLProgram.prototype, {
    link: function () {
      var i, info

      // -------------------------------
      // compile & link
      // -------------------------------
      var fragShader = getShader(gl.FRAGMENT_SHADER, this.fragSrc)
      var vertShader = getShader(gl.VERTEX_SHADER, this.vertSrc)

      var program = this.program = gl.createProgram()
      gl.attachShader(program, fragShader)
      gl.attachShader(program, vertShader)
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        var errLog = gl.getProgramInfoLog(program)
        check.raise('Error linking program:\n' + errLog)
      }

      // -------------------------------
      // grab uniforms
      // -------------------------------
      var numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS)
      var uniforms = this.uniforms = []
      for (i = 0; i < numUniforms; ++i) {
        info = gl.getActiveUniform(program, i)
        if (info) {
          if (info.size > 1) {
            for (var j = 0; j < info.size; ++j) {
              var name = info.name.replace('[0]', '[' + j + ']')
              uniforms.push(new UniformInfo(
                name,
                gl.getUniformLocation(program, name),
                info))
              defUniform(name)
            }
          } else {
            uniforms.push(new UniformInfo(
              info.name,
              gl.getUniformLocation(program, info.name),
              info))
            defUniform(info.name)
          }
        }
      }

      // -------------------------------
      // grab attributes
      // -------------------------------
      var numAttributes = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES)
      var attributes = this.attributes = []
      for (i = 0; i < numAttributes; ++i) {
        info = gl.getActiveAttrib(program, i)
        if (info) {
          attributes.push(new AttributeInfo(
            info.name,
            gl.getAttribLocation(program, info.name),
            info))
          defAttribute(info.name)
        }
      }

      // -------------------------------
      // compile poll()
      // -------------------------------
      this.poll = compileShaderPoll(this)
    },

    destroy: function () {
      gl.deleteProgram(this.program)
    }
  })

  function getProgram (vertSource, fragSource) {
    var cache = programs[fragSource]
    if (!cache) {
      cache = programs[vertSource] = {}
    }
    var program = cache[vertSource]
    if (!program) {
      program = new REGLProgram(fragSource, vertSource)
      program.link()
      cache[vertSource] = program
      programList.push(program)
    }
    return program
  }

  function clearPrograms () {
    programList.forEach(function (program) {
      program.destroy()
    })
    programList.length = 0
    programs = {}
  }

  function refreshPrograms () {
    programList.forEach(function (program) {
      program.link()
    })
  }

  // ===================================================
  // uniform state
  // ===================================================
  var uniforms = {}

  function defUniform (name) {
    if (name in uniforms) {
      return
    }
    uniforms[name] = []
  }

  // ===================================================
  // attribute state
  // ===================================================
  var attributes = {}

  function AttributeRecord () {
    this.pointer = false

    this.x = 0.0
    this.y = 0.0
    this.z = 0.0
    this.w = 0.0

    this.buffer = null
    this.size = 0
    this.normalized = false
    this.type = GL_FLOAT
    this.offset = 0
    this.stride = 0
    this.divisor = 0
  }

  Object.assign(AttributeRecord.prototype, {
    equals: function (other, size) {
      if (this.pointer) {
        return other.pointer &&
          this.x === other.x &&
          this.y === other.y &&
          this.z === other.z &&
          this.w === other.w
      } else {
        return !other.pointer &&
          this.buffer === other.buffer &&
          this.size === size &&
          this.normalized === other.normalized &&
          this.type === other.type &&
          this.offset === other.offset &&
          this.stride === other.stride &&
          this.divisor === other.divisor
      }
    },

    set: function (other, size) {
      var pointer = this.pointer = other.pointer
      if (pointer) {
        this.buffer = other.buffer
        this.size = size
        this.normalized = other.normalized
        this.type = other.type
        this.offset = other.offset
        this.stride = other.stride
        this.divisor = other.divisor
      } else {
        this.x = other.x
        this.y = other.y
        this.z = other.z
        this.w = other.w
      }
    }
  })

  function AttributeStack () {
    var records = new Array(16)
    for (var i = 0; i < 16; ++i) {
      records[i] = new AttributeRecord()
    }
    this.records = records
    this.top = 0
  }

  AttributeStack.prototype.push = function () {
    var records = this.records
    var top = this.top

    while (records.length <= top) {
      records.push(new AttributeRecord())
    }

    return records[++this.top]
  }

  function defAttribute (name) {
    attributes[name] = new AttributeStack()
  }

  function pushAttribute (name, x, y, z, w) {
    var head = attributes[name].push()
    head.pointer = false
    head.x = x
    head.y = y
    head.z = z
    head.w = w
  }

  function pushAttributePointer (
    name,
    buffer,
    size,
    offset,
    stride,
    divisor,
    normalized,
    type) {
    var head = attributes[name].push()
    head.pointer = true
    head.buffer = buffer
    head.size = size
    head.offset = offset
    head.stride = stride
    head.divisor = divisor
    head.normalized = normalized
    head.type = type
  }

  function popAttribute (name) {
    attributes[name].top--
  }

  var attributeBindings = new Array(NUM_ATTRIBUTES)
  for (var i = 0; i < NUM_ATTRIBUTES; ++i) {
    attributeBindings[i] = new AttributeRecord()
  }

  function bindAttribute (index, stack, size) {
    var next = stack.records[stack.top]
    var current = attributeBindings[index]
    console.log('binding attribute: ', index, next, current, size)
    size = next.size || size
    if (current.equals(next, size)) {
      return
    }
    if (!next.pointer) {
      if (current.pointer) {
        gl.disableVertexAttribArray(index)
      }
      gl.vertexAttrib4f(index, next.x, next.y, next.z, next.w)
    } else {
      if (!current.pointer) {
        gl.enableVertexAttribArray(index)
      }
      if (current.buffer !== next.buffer) {
        next.buffer.bind()
      }
      gl.vertexAttribPointer(
        index,
        size,
        next.type,
        next.normalized,
        next.stride,
        next.offset)
      if (USE_INSTANCING) {
        extInstancing.vertexAttribDivisor(index, next.divisor)
      }
    }
    current.set(next, size)
  }

  // ===================================================
  // shader binding
  // ===================================================
  var shaderStack = [null]

  function pushProgram (program) {
    shaderStack.push(program)
  }

  function popProgram () {
    shaderStack.pop()
  }

  // ===================================================
  // state diffing/polling
  // ===================================================
  function compileShaderPoll (program) {
    var env = createEnvironment()
    var link = env.link
    var poll = env.proc('poll')

    var GL = link(gl)
    var PROGRAM = link(program.program)
    var BIND_ATTRIBUTE = link(bindAttribute)

    // bind the program
    poll(GL, '.useProgram(', PROGRAM, ');')

    // set up attribute state
    program.attributes.forEach(function (attribute) {
      poll(BIND_ATTRIBUTE, '(',
        attribute.location, ',',
        link(attributes[attribute.name]), ',',
        attribute.info.size, ');')
    })

    // set up uniforms
    program.uniforms.forEach(function (uniform) {
      var LOCATION = link(uniform.location)
      var STACK = link(uniforms[uniform.name])
      var TOP = STACK + '[' + STACK + '.length-1]'

      var infix
      var separator = ','
      switch (uniform.info.type) {
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
      poll(GL, '.uniform', infix, 'v(', LOCATION, separator, TOP, ');')
    })

    return env.compile().poll
  }

  function poll () {
    var activeShader = shaderStack[shaderStack.length - 1]
    if (activeShader) {
      activeShader.poll()
    } else {
      gl.useProgram(null)
    }
  }

  // ===================================================
  // context management
  // ===================================================
  function clear () {
    clearShaders()
    clearPrograms()
  }

  function refresh () {
    refreshShaders()
    refreshPrograms()
  }

  // We call clear once to initialize all data structures
  clear()

  return {
    create: getProgram,

    clear: clear,
    refresh: refresh,

    poll: poll,

    pushProgram: pushProgram,
    popProgram: popProgram,

    uniforms: uniforms,
    defUniform: defUniform,

    defAttribute: defAttribute,
    pushAttribute: pushAttribute,
    pushAttributePointer: pushAttributePointer,
    popAttribute: popAttribute
  }
}
