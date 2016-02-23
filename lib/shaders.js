'use strict'

//This module implements caching for shader objects

var REGLError = require('./error')
var formatCompilerError = require('gl-format-compiler-error')

function REGLShader(program, uniforms, attributes) {
  this.program = program
  this.uniforms = uniforms
  this.attributes = attributes
}

module.exports = function createShaderCache(gl) {
  var shaders = {}
  var programs = {}

  function clearCache() {
    shaders[gl.FRAGMENT_SHADER] = {}
    shaders[gl.VERTEX_SHADER] = {}
    programs = {}
  }

  function getShader(type, source) {
    var cache = shaders[type]
    var shader = cache[source]

    if(!shader) {
      shader = gl.createShader(type)
      gl.shaderSource(shader, source)
      gl.compileShader(shader)

      if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        var errLog = gl.getShaderInfoLog(shader)
        try {
          var fmt = formatCompilerError(errLog, source, type)
        } catch (e){
          throw new REGLError(errLog, 'Error compiling shader:\n' + errLog)
        }
        throw new REGLError(errLog, fmt.short, fmt.long)
      }
      cache[source] = shader
    }

    return shader
  }

  function linkProgram(fragShader, vertShader) {
    var program = gl.createProgram()
    gl.attachShader(program, fragShader)
    gl.attachShader(program, vertShader)
    gl.linkProgram(program)

    if(!gl.getProgramParameter(testProgram, gl.LINK_STATUS)) {
      var errLog = gl.getProgramInfoLog(program)
      throw new REGLError(errLog, 'Error linking program:' + errLog)
    }

    //Extract uniforms
    var numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS)
    var uniforms = []
    for(var i=0; i<numUniforms; ++i) {
      var info = gl.getActiveUniform(program, i)
      if(info) {
        if(info.size > 1) {
          for(var j=0; j<info.size; ++j) {
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

    //Extract attributes
    var numAttributes = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES)
    var attributes = []
    for(var i=0; i<numAttributes; ++i) {
      var info = gl.getActiveAttrib(program, i)
      if(info) {
        attributes.push({
          name: info.name,
          location: gl.getAttribLocation(program, info.name),
          info: info
        })
      }
    }

    //Construct result
    return new REGLProgram(
      program,
      uniforms,
      attributes)
  }

  function getProgram(vertSource, fragSource) {
    var cache = programs[fragSource]
    if(!cache) {
      cache = programs[vertSource] = {}
    }
    var program = cache[vertSource]
    if(!program) {
      cache[vertSource] = program = linkProgram(
        getShader(gl.FRAGMENT_SHADER, fragSource),
        getShader(gl.VERTEX_SHADER, vertSource))
    }
    return program
  }

  //Invalidate cache
  clearCache()

  return {
    get: getProgram,
    clear: clearCache
  }
}
