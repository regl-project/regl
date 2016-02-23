'use strict'

var nodes = require('./lib/nodes')
var createShaderCache = require('./lib/shaders')

function wrapREGL(gl) {
  var getProgram = createShaderCache(gl)

  function regl(state, draw, params) {
    bindState(state, params)
    execDraw(draw, params)
  }

  function parseCommand(command) {
    var program = getProgram(command.fragSource, command.vertSource)

    var uniforms = program.uniforms.map(function(name) {
      var uniform = command.uniforms[name]
    })

    var attributes = program.attributes.map(function(name) {
      var attribute = command.attributes[name]
      if(attribute instanceof REGLBuffer) {

      } else if(Array.isArray(attribute)) {

      }
    })

    var primitiveType = gl.TRIANGLES

    var offset = command.offset || 0

    var count = command.count || 0

    return new REGLDraw(
      shader,
      uniforms,
      attributes,
      primitiveType,
      offset,
      count)
  }

  function parseGroup(commandList) {
  }



  regl.buffer = function(param) {
    return new REGLBuffer()
  }

  regl.state = function(params) {
    var clearFlags = 0

    var clearColor = params.clearColor
    if(clearColor) {
      clearFlags |= gl.COLOR_BUFFER_BIT
    }

    return new REGLState(
      clearFlags,
      clearColor
    )
  }


  function bindState(state, params) {
    //Set up fbo binding

    //Set up viewport
    if(state.viewport) {
      var viewportParams = state.viewport
      gl.viewport(
        viewportParams[0],
        viewportParams[1],
        viewportParams[2] - viewportParams[0],
        viewportParams[3] - viewportParams[1])
    } else {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    }

    //Set up depth range
  }

  function execDraw(command, params) {
    var program = command.program
  }

  return regl
}

module.exports = wrapREGL
