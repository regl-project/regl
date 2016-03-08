var check = require('./check')
var formatCompilerError = require('gl-format-compiler-error')

module.exports = function createShaderCache (gl) {
  var shaders = {}
  var programs = {}

  var GL_FRAGMENT_SHADER = gl.FRAGMENT_SHADER
  var GL_VERTEX_SHADER = gl.VERTEX_SHADER

  function REGLProgram (program, uniforms, attributes) {
    this.program = program
    this.uniforms = uniforms
    this.attributes = attributes
  }

  function clearCache () {
    Object.keys(shaders).forEach(function (type) {
      Object.keys(shaders[type]).forEach(function (shader) {
        gl.destroyShader(shader)
      })
    })
    shaders[GL_FRAGMENT_SHADER] = {}
    shaders[GL_VERTEX_SHADER] = {}

    // TODO destroy programs
  }

  function refreshCache () {
    shaders[GL_FRAGMENT_SHADER] = {}
    shaders[GL_VERTEX_SHADER] = {}

    // TODO recompile and link all programs
  }

  function getShader (type, source) {
    var cache = shaders[type]
    var shader = cache[source]

    if (!shader) {
      shader = gl.createShader(type)
      gl.shaderSource(shader, source)
      gl.compileShader(shader)

      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        var errLog = gl.getShaderInfoLog(shader)
        try {
          var fmt = formatCompilerError(errLog, source, type)
        } catch (e) {
          check.raiseRuntime(errLog, 'Error compiling shader:\n' + errLog)
        }
        check.raiseRuntime(errLog, fmt.short, fmt.long)
      }
      cache[source] = shader
    }

    return shader
  }

  function getUniforms (program) {
    var numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS)
    var uniforms = []
    for (var i = 0; i < numUniforms; ++i) {
      var info = gl.getActiveUniform(program, i)
      if (info) {
        if (info.size > 1) {
          for (var j = 0; j < info.size; ++j) {
            var name = info.name.replace('[0]', '[' + j + ']')
            uniforms.push({
              name: name,
              location: gl.getUniformLocation(program, name),
              info: info
            })
          }
        } else {
          uniforms.push({
            name: info.name,
            location: gl.getUniformLocation(program, info.name),
            info: info
          })
        }
      }
    }
    return uniforms
  }

  function getAttributes (program) {
    var numAttributes = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES)
    var attributes = []
    for (var i = 0; i < numAttributes; ++i) {
      var info = gl.getActiveAttrib(program, i)
      if (info) {
        attributes.push({
          name: info.name,
          location: gl.getAttribLocation(program, info.name),
          info: info
        })
      }
    }
    return attributes
  }

  function linkProgram (fragShader, vertShader) {
    var program = gl.createProgram()
    gl.attachShader(program, fragShader)
    gl.attachShader(program, vertShader)
    gl.linkProgram(program)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      var errLog = gl.getProgramInfoLog(program)
      check.raiseRuntime(errLog, 'Error linking program:' + errLog)
    }

    // Construct result
    return new REGLProgram(
      program,
      getUniforms(program),
      getAttributes(program))
  }

  function getProgram (vertSource, fragSource) {
    var cache = programs[fragSource]
    if (!cache) {
      cache = programs[vertSource] = {}
    }
    var program = cache[vertSource]
    if (!program) {
      cache[vertSource] = program = linkProgram(
        getShader(gl.FRAGMENT_SHADER, fragSource),
        getShader(gl.VERTEX_SHADER, vertSource))
    }
    return program
  }

  clearCache()

  return {
    create: getProgram,
    clear: clearCache,
    refresh: refreshCache
  }
}
