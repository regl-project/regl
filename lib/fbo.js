module.exports = function createFBOCache (
  gl,
  textureCache) {
  var fboCount = 0
  var fboSet = {}

  function createFBO (options) {
  }

  function clearCache () {
  }

  function refreshCache () {
  }

  return {
    create: createFBO,
    clear: clearCache,
    refresh: refreshCache
  }
}
