var createShaderCache = require('./lib/shader')
var createBufferCache = require('./lib/buffer')
var createTextureCache = require('./lib/texture')
var createFBOCache = require('./lib/fbo')

function wrapREGL (gl, options) {
  options = options || {}

  var shaderCache = createShaderCache(gl)
  var bufferCache = createBufferCache(gl)
  var textureCache = createTextureCache(gl)
  var fboCache = createFBOCache(gl, textureCache)
  var canvas = gl.canvas
  var handleLoss = options.contextLoss !== false

  // Context loss handling
  function handleContextLoss (event) {
  }

  function handleContextRestored (event) {
  }

  if (handleLoss) {
    canvas.addEventListener(handleContextLoss, false)
    canvas.addEventListener(handleContextRestored, false)
  }

  // Resource destructuion
  function destroy () {
    if (handleLoss) {
      canvas.removeEventListener(handleContextLoss)
      canvas.removeEventListener(handleContextRestored)
    }

    shaderCache.clear()
    fboCache.clear()
    bufferCache.clear()
    textureCache.clear()
  }

  // Object allocation
  function createBuffer (options) {
    options = options || {}

    
  }

  function createTexture (options) {
  }

  function createDraw (options) {
  }

  function createEnv (options) {
  }

  function createFBO (options) {
  }

  // Execute a list of draw commands
  function executeCommand(env, commands) {
  }

  return Object.assign(executeCommand, {

    // Object constructors
    draw: createDraw,
    env: createEnv,
    buffer: createBuffer,
    texture: createTexture,
    fbo: createFBO,

    // Destroy regl and all associated resources
    destroy: destroy
  })
}

module.exports = wrapREGL
