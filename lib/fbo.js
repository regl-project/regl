// Framebuffer object state management

module.exports = function wrapFBOState (
  gl,
  textureCache) {
  function createFBO (options) {
  }

  function clearCache () {
  }

  function refreshCache () {
  }

  return {
    create: createFBO,
    clear: clearCache,
    refresh: refreshCache,
    getFBO: function (wrapper) {
      return null
    }
  }
}
