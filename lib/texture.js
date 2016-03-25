module.exports = function createTextureSet (gl) {
  var textureCount = 0
  var textureSet = {}

  function REGLTexture () {
    this.id = textureCount++
    this.texture = null
    this.data = null
  }

  Object.assign(REGLTexture.prototype, {
    bind: function () {
    },

    update: function (option) {
    },

    refresh: function () {
    },

    destroy: function () {
    }
  })

  function createTexture (options) {
    var texture = new REGLTexture()
    texture.texture = gl.createTexture()

    texture.update(options)

    function updateTexture (options) {
      texture.update(options)
      return updateTexture
    }

    updateTexture._texture = texture
    updateTexture.destroy = function () {
      texture.destroy()
    }

    return updateTexture
  }

  function refreshTextures () {
    Object.keys(textureSet).forEach(function (texId) {
      textureSet[texId].refresh()
    })
  }

  function destroyTextures () {
    Object.keys(textureSet).forEach(function (texId) {
      textureSet[texId].destroy()
    })
  }

  return {
    create: createTexture,
    refresh: refreshTextures,
    destroy: destroyTextures,
    getTexture: function (wrapper) {
      return null
    }
  }
}
