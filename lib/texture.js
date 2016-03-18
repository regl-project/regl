module.exports = function createTextureSet (gl) {
  var textureCount = 0
  var textureSet = {}

  function REGLTexture () {
    this.id = textureCount++
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
    return null
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
