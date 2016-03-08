module.exports = function stateCache (
  gl,
  extensions,
  shaderCache,
  bufferCache,
  textureCache,
  fboCache) {

  function createEnvironment (options) {
  }

  function clearCache () {
  }

  function refreshCache () {
  }

  return {
    create: createEnvironment,
    clear: clearCache,
    refresh: refreshCache
  }
}
