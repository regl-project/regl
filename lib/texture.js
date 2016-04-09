var check = require('./check')
var isTypedArray = require('./is-typed-array')

var GL_TEXTURE_2D = 0x0DE1

var GL_TEXTURE_CUBE_MAP = 0x8513
var GL_TEXTURE_BINDING_CUBE_MAP = 0x8514
var GL_TEXTURE_CUBE_MAP_POSITIVE_X = 0x8515
var GL_TEXTURE_CUBE_MAP_NEGATIVE_X = 0x8516
var GL_TEXTURE_CUBE_MAP_POSITIVE_Y = 0x8517
var GL_TEXTURE_CUBE_MAP_NEGATIVE_Y = 0x8518
var GL_TEXTURE_CUBE_MAP_POSITIVE_Z = 0x8519
var GL_TEXTURE_CUBE_MAP_NEGATIVE_Z = 0x851A

var GL_DEPTH_COMPONENT = 0x1902
var GL_ALPHA = 0x1906
var GL_RGB = 0x1907
var GL_RGBA = 0x1908
var GL_LUMINANCE = 0x1909
var GL_LUMINANCE_ALPHA = 0x190A

var GL_UNSIGNED_BYTE = 0x1401
var GL_UNSIGNED_SHORT = 0x1403
var GL_FLOAT = 0x1406

var GL_TEXTURE_WRAP_S = 0x2802
var GL_TEXTURE_WRAP_T = 0x2803

var GL_REPEAT = 0x2901
var GL_CLAMP_TO_EDGE = 0x812F
var GL_MIRRORED_REPEAT = 0x8370

var GL_TEXTURE_MAG_FILTER = 0x2800
var GL_TEXTURE_MIN_FILTER = 0x2801

var GL_NEAREST = 0x2600
var GL_LINEAR = 0x2601
var GL_NEAREST_MIPMAP_NEAREST = 0x2700
var GL_LINEAR_MIPMAP_NEAREST = 0x2701
var GL_NEAREST_MIPMAP_LINEAR = 0x2702
var GL_LINEAR_MIPMAP_LINEAR = 0x2703

var GL_UNPACK_FLIP_Y_WEBGL = 0x9240
var GL_UNPACK_PREMULTIPLY_ALPHA_WEBGL = 0x9241
var GL_UNPACK_COLORSPACE_CONVERSION_WEBGL = 0x9243
var GL_BROWSER_DEFAULT_WEBGL = 0x9244

var texTargets = {
  '2d': GL_TEXTURE_2D,
  'cube': GL_TEXTURE_CUBE_MAP
}

var wrapModes = {
  'repeat': GL_REPEAT,
  'clamp': GL_CLAMP_TO_EDGE,
  'mirror': GL_MIRRORED_REPEAT
}

var magFilters = {
  'nearest': GL_NEAREST,
  'linear': GL_LINEAR
}

var minFilters = Object.assign({
  'nearest mipmap nearest': GL_NEAREST_MIPMAP_NEAREST,
  'linear mipmap nearest': GL_LINEAR_MIPMAP_NEAREST,
  'nearest mipmap linear': GL_NEAREST_MIPMAP_LINEAR,
  'linear mipmap linear': GL_LINEAR_MIPMAP_LINEAR,
  'mipmap': GL_LINEAR_MIPMAP_LINEAR
}, magFilters)

module.exports = function createTextureSet (gl, extensionState, limits) {
  var extensions = extensionState.extensions

  var textureCount = 0
  var textureSet = {}

  function REGLTexture () {
    this.id = textureCount++

    // Texture target
    this.target = GL_TEXTURE_2D

    // Texture handle
    this.texture = null

    // Texture format
    this.format = GL_RGBA
    this.type = GL_UNSIGNED_BYTE

    // Data
    this.mipLevels = []

    // Shape
    this.width = 0
    this.height = 0

    // Parameters
    this.minFilter = GL_NEAREST
    this.magFilter = GL_NEAREST
    this.wrapS = GL_REPEAT
    this.wrapT = GL_REPEAT
    this.mipSamples = 0

    // Storage flags
    this.flipY = false
    this.premultiplyAlpha = false
    this.unpackAlignment = 1
    this.colorSpace = GL_BROWSER_DEFAULT_WEBGL
  }

  Object.assign(REGLTexture.prototype, {
    bind: function () {
    },

    update: function (args) {
      var options = args || {}

      // Possible initialization pathways:
      if (Array.isArray(args) ||
          isTypedArray(args) ||
          isHTMLElement(args)) {
        options = {
          data: args
        }
      }

      // tex target
      this.target = GL_TEXTURE_2D
      if ('target' in options) {
        check.param(options.target, texTargets, 'invalid texture target')
        this.target = texTargets[options.target]
      }

      // min filter
      this.minFilter = GL_NEAREST
      if ('min' in options) {
        check.param(options.min, minFilters)
        this.minFilter = minFilters[options.min]
      }

      // mag filter
      this.magFilter = GL_NEAREST
      if ('mag' in options) {
        check.param(options.mag, magFilters)
        this.magFilter = magFilters(options.mag)
      }

      // wrap modes
      this.wrapS = GL_REPEAT
      this.wrapT = GL_REPEAT
      if ('wrap' in options) {
        var wrap = options.wrap
        if (typeof wrap === 'string') {
          check.param(wrap, wrapModes)
          this.wrapS = this.wrapT = wrapModes[wrap]
        } else if (Array.isArray(wrap)) {
          check.param(wrap[0], wrapModes)
          check.param(wrap[1], wrapModes)
          this.wrapS = wrapModes[wrap[0]]
          this.wrapT = wrapModes[wrap[1]]
        }
      } else {
        if ('wrapS' in options) {
          check.param(options.wrapS, wrapModes)
          this.wrapS = wrapModes[options.wrapS]
        }
        if ('wrapT' in options) {
          check.param(options.wrapT, wrapModes)
          this.wrapT = wrapModes[options.wrapT]
        }
      }

      // easy pixelStorei flags
      this.premultiplyAlpha = !!options.premultiplyAlpha
      this.flipY = !!options.flipY

      // unpack alignment
      this.unpackAlignment = 1
      if ('alignment' in options) {
        check.oneOf(
          options.alignment,
          [1, 2, 4, 8],
          'invalid texture unpack alignment')
        this.unpackAlignment = options.alignment
      }

      // colorspace
      this.colorSpace = GL_BROWSER_DEFAULT_WEBGL

      // parse out data
      var data = options.data || null
      if (Array.isArray(data)) {

      } else if (isTypedArray(data)) {

      } else if (isHTMLElement(data)) {

      } else {

      }

      // Set tex image
    },

    refresh: function () {
      gl.textureParameteri(GL_TEXTURE_MIN_FILTER, this.minFilter)
      gl.textureParameteri(GL_TEXTURE_MAG_FILTER, this.magFilter)
      gl.textureParameteri(GL_TEXTURE_WRAP_T, this.wrapT)
      gl.textureParameteri(GL_TEXTURE_WRAP_S, this.wrapS)
    },

    destroy: function () {
      check(this.texture, 'must not double free texture')
      gl.deleteTexture(this.texture)
      this.texture = null
      delete textureSet[this.id]
    }
  })

  function createTexture (options) {
    var texture = new REGLTexture()
    texture.texture = gl.createTexture()
    texture.update(options)
    textureSet[texture.id] = texture

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
    clear: destroyTextures,
    getTexture: function (wrapper) {
      return null
    }
  }
}
