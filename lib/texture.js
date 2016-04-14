var check = require('./check')
var isTypedArray = require('./is-typed-array')

var GL_TEXTURE_2D = 0x0DE1
var GL_TEXTURE_CUBE_MAP = 0x8513

/*
var GL_TEXTURE_BINDING_CUBE_MAP = 0x8514
var GL_TEXTURE_CUBE_MAP_POSITIVE_X = 0x8515
var GL_TEXTURE_CUBE_MAP_NEGATIVE_X = 0x8516
var GL_TEXTURE_CUBE_MAP_POSITIVE_Y = 0x8517
var GL_TEXTURE_CUBE_MAP_NEGATIVE_Y = 0x8518
var GL_TEXTURE_CUBE_MAP_POSITIVE_Z = 0x8519
var GL_TEXTURE_CUBE_MAP_NEGATIVE_Z = 0x851A
*/

var GL_RGBA = 0x1908
var GL_ALPHA = 0x1906
var GL_RGB = 0x1907
var GL_LUMINANCE = 0x1909
var GL_LUMINANCE_ALPHA = 0x190A

var GL_RGBA4 = 0x8056
var GL_RGB5_A1 = 0x8057
var GL_RGB565 = 0x8D62

var GL_UNSIGNED_SHORT_4_4_4_4 = 0x8033
var GL_UNSIGNED_SHORT_5_5_5_1 = 0x8034
var GL_UNSIGNED_SHORT_5_6_5 = 0x8363
var GL_UNSIGNED_INT_24_8_WEBGL = 0x84FA

var GL_DEPTH_COMPONENT = 0x1902
var GL_DEPTH_STENCIL = 0x84F9

var GL_SRGB_EXT = 0x8C40
var GL_SRGB_ALPHA_EXT = 0x8C42

var GL_HALF_FLOAT_OES = 0x8D61

var GL_COMPRESSED_RGB_S3TC_DXT1_EXT = 0x83F0
var GL_COMPRESSED_RGBA_S3TC_DXT1_EXT = 0x83F1
var GL_COMPRESSED_RGBA_S3TC_DXT3_EXT = 0x83F2
var GL_COMPRESSED_RGBA_S3TC_DXT5_EXT = 0x83F3

var GL_COMPRESSED_RGB_ATC_WEBGL = 0x8C92
var GL_COMPRESSED_RGBA_ATC_EXPLICIT_ALPHA_WEBGL = 0x8C93
var GL_COMPRESSED_RGBA_ATC_INTERPOLATED_ALPHA_WEBGL = 0x87EE

var GL_COMPRESSED_RGB_PVRTC_4BPPV1_IMG = 0x8C00
var GL_COMPRESSED_RGB_PVRTC_2BPPV1_IMG = 0x8C01
var GL_COMPRESSED_RGBA_PVRTC_4BPPV1_IMG = 0x8C02
var GL_COMPRESSED_RGBA_PVRTC_2BPPV1_IMG = 0x8C03

var GL_COMPRESSED_RGB_ETC1_WEBGL = 0x8D64

var GL_UNSIGNED_BYTE = 0x1401
var GL_UNSIGNED_SHORT = 0x1403
var GL_UNSIGNED_INT = 0x1405
var GL_FLOAT = 0x1406

// var GL_TEXTURE_WRAP_S = 0x2802
// var GL_TEXTURE_WRAP_T = 0x2803

var GL_REPEAT = 0x2901
var GL_CLAMP_TO_EDGE = 0x812F
var GL_MIRRORED_REPEAT = 0x8370

// var GL_TEXTURE_MAG_FILTER = 0x2800
// var GL_TEXTURE_MIN_FILTER = 0x2801

var GL_NEAREST = 0x2600
var GL_LINEAR = 0x2601
var GL_NEAREST_MIPMAP_NEAREST = 0x2700
var GL_LINEAR_MIPMAP_NEAREST = 0x2701
var GL_NEAREST_MIPMAP_LINEAR = 0x2702
var GL_LINEAR_MIPMAP_LINEAR = 0x2703

/*
var GL_UNPACK_FLIP_Y_WEBGL = 0x9240
var GL_UNPACK_PREMULTIPLY_ALPHA_WEBGL = 0x9241
var GL_UNPACK_COLORSPACE_CONVERSION_WEBGL = 0x9243
*/
var GL_BROWSER_DEFAULT_WEBGL = 0x9244

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

  var colorSpace = {
    'none': 0,
    'default': GL_BROWSER_DEFAULT_WEBGL
  }

  var textureTypes = {
    'uint8': GL_UNSIGNED_BYTE,
    'rgba4': GL_UNSIGNED_SHORT_4_4_4_4,
    'rgb565': GL_UNSIGNED_SHORT_5_6_5,
    'rgb5 a1': GL_UNSIGNED_SHORT_5_5_5_1
  }

  var textureFormats = {
    'alpha': GL_ALPHA,
    'luminance': GL_LUMINANCE,
    'luminance alpha': GL_LUMINANCE_ALPHA,
    'rgb': GL_RGB,
    'rgba': GL_RGBA,
    'rgba4': GL_RGBA4,
    'rgb5 a1': GL_RGB5_A1,
    'rgb565': GL_RGB565
  }

  var compressedTextureFormats = {}

  if (extensions.ext_srgb) {
    textureFormats.srgb = GL_SRGB_EXT
    textureFormats.srgba = GL_SRGB_ALPHA_EXT
  }

  if (extensions.oes_texture_float) {
    textureTypes.float = GL_FLOAT
  }

  if (extensions.oes_texture_half_float) {
    textureTypes['half float'] = GL_HALF_FLOAT_OES
  }

  if (extensions.webgl_depth_texture) {
    Object.assign(textureFormats, {
      'depth': GL_DEPTH_COMPONENT,
      'depth stencil': GL_DEPTH_STENCIL
    })

    Object.assign(textureTypes, {
      'uint16': GL_UNSIGNED_SHORT,
      'uint32': GL_UNSIGNED_INT,
      'depth stencil': GL_UNSIGNED_INT_24_8_WEBGL
    })
  }

  if (extensions.webgl_compressed_texture_s3tc) {
    Object.assign(compressedTextureFormats, {
      'rgb s3tc dxt1': GL_COMPRESSED_RGB_S3TC_DXT1_EXT,
      'rgba s3tc dxt1': GL_COMPRESSED_RGBA_S3TC_DXT1_EXT,
      'rgba s3tc dxt3': GL_COMPRESSED_RGBA_S3TC_DXT3_EXT,
      'rgba s3tc dxt5': GL_COMPRESSED_RGBA_S3TC_DXT5_EXT
    })
  }

  if (extensions.webgl_compressed_texture_atc) {
    Object.assign(compressedTextureFormats, {
      'rgb arc': GL_COMPRESSED_RGB_ATC_WEBGL,
      'rgba atc explicit alpha': GL_COMPRESSED_RGBA_ATC_EXPLICIT_ALPHA_WEBGL,
      'rgba atc interpolated alpha': GL_COMPRESSED_RGBA_ATC_INTERPOLATED_ALPHA_WEBGL
    })
  }

  if (extensions.webgl_compressed_texture_pvrtc) {
    Object.assign(compressedTextureFormats, {
      'rgb pvrtc 4bppv1': GL_COMPRESSED_RGB_PVRTC_4BPPV1_IMG,
      'rgb pvrtc 2bppv1': GL_COMPRESSED_RGB_PVRTC_2BPPV1_IMG,
      'rgba pvrtc 4bppv1': GL_COMPRESSED_RGBA_PVRTC_4BPPV1_IMG,
      'rgba pvrtc 2bppv1': GL_COMPRESSED_RGBA_PVRTC_2BPPV1_IMG
    })
  }

  if (extensions.webgl_compressed_texture_etc1) {
    compressedTextureFormats['rgb etc1'] = GL_COMPRESSED_RGB_ETC1_WEBGL
  }

  Object.assign(textureFormats, compressedTextureFormats)

  var supportedFormats = Object.keys(textureFormats)

  var colorFormats = supportedFormats.reduce(function (key, color) {
    var glenum = textureFormats[key]
    if (glenum === GL_LUMINANCE ||
        glenum === GL_ALPHA ||
        glenum === GL_LUMINANCE ||
        glenum === GL_LUMINANCE_ALPHA ||
        glenum === GL_DEPTH_COMPONENT ||
        glenum === GL_DEPTH_STENCIL) {
      color[glenum] = glenum
    } else if (key.indexOf('rgba') >= 0) {
      color[glenum] = GL_RGBA
    } else {
      color[glenum] = GL_RGB
    }
    return color
  }, {})

  function parsePixelStorage (options) {
    var result = {
      flipY: false,
      premultiplyAlpha: true,
      unpackAlignment: 1,
      colorSpace: GL_BROWSER_DEFAULT_WEBGL
    }

    if ('premultiplyAlpha' in options) {
      check.type(options.premultiplyAlpha, 'boolean', 'invalid premultiplyAlpha')
      result.premultiplyAlpha = options.premultiplyAlpha
    }

    if ('flipY' in options) {
      check.type(options.flipY, 'boolean', 'invalid texture flip')
      result.flipY = options.flipY
    }

    if ('alignment' in options) {
      check.oneOf(
        options.alignment,
        [1, 2, 4, 8],
        'invalid texture unpack alignment')
      result.unpackAlignment = options.alignment
    }

    if ('colorSpace' in options) {
      check.param(options.colorSpace, colorSpace, 'invalid colorSpace')
      result.colorSpace = colorSpace[options.colorSpace]
    }

    return result
  }

  function isNumericArray (arr) {
    return (
      Array.isArray(arr) &&
      (arr.length === 0 ||
      typeof arr[0] === 'number'))
  }

  function isRectArray (arr) {
    if (!Array.isArray(arr)) {
      return false
    }

    var width = arr.length
    if (width === 0 || !Array.isArray(arr[0])) {
      return false
    }

    var height = arr[0].length
    for (var i = 1; i < width; ++i) {
      if (!Array.isArray(arr[i]) || arr[i].length !== height) {
        return false
      }
    }
    return true
  }

  function classString (x) {
    return Object.prototype.toString.call(x)
  }

  function isCanvasElement (object) {
    return classString(object) === '[object HTMLCanvasElement]'
  }

  function isContext2D (object) {
    return classString(object) === '[object CanvasRenderingContext2D]'
  }

  function isImageElement (object) {
    return classString(object) === '[object HTMLImageElement]'
  }

  function isVideoElement (object) {
    return classString(object) === '[object HTMLVideoElement]'
  }

  function isPixelData (object) {
    return (
      isTypedArray(object) ||
      isNumericArray(object) ||
      isCanvasElement(object) ||
      isContext2D(object) ||
      isImageElement(object) ||
      isVideoElement(object) ||
      isRectArray(object))
  }

  function parsePixelData (object) {
    var result = {
      storage: parsePixelStorage(object)
    }

    function setObjectProps () {
      if ('shape' in object) {
        check(
          Array.isArray(object.shape) && object.shape.length >= 2,
          'image shape must be an array')
        result.width = object.shape[0] | 0
        result.height = object.shape[1] | 0
        if (object.shape.length === 3) {
          result.channels = object.shape[2] | 0
        }
      } else {
        if ('width' in object) {
          result.width = object.width
        }
        if ('height' in object) {
          result.height = object.height
        }
        if ('channels' in object) {
          result.channels = object.channels
        }
      }
      if ('offset' in object) {
        result.data = result.data.subarray(object.offset)
      }
      if ('stride' in object) {
        // TODO transpose data if necessary
      }
      if ('format' in object) {
        check.parameter(object.format, textureFormats)
        result.format = textureFormats[object.format]
        if (object.format in textureTypes) {
          result.type = textureTypes[object.format]
        }
      }
      if ('type' in object) {
        check.parameter(object.type, textureTypes)
        result.type = textureTypes[object.type]
      } else {
        if (result.data instanceof Float32Array) {
          result.type = GL_FLOAT
        } else if (result.data instanceof Uint8Array) {
          result.type = GL_UNSIGNED_BYTE
        }
      }
    }

    var data = object
    if (typeof object === 'object' && isPixelData(object.data)) {
      data = object.data
    }

    if (isTypedArray(data)) {
      result.data = data
      setObjectProps()
    }
    if (isNumericArray(data)) {
      result.data = new Uint8Array(data)
      setObjectProps()
    }
    if (isCanvasElement(data)) {
      result.canvas = data
    }
    if (isContext2D(data)) {
      result.canvas = data.canvas
    }
    if (result.canvas) {
      result.width = result.canvas.width
      result.height = result.canvas.height
      result.channels = 4
      result.format = GL_RGBA
      result.type = GL_UNSIGNED_BYTE
    }
    if (isImageElement(data)) {
      result.image = data

      // TODO read image width/height

      result.channels = 4
      result.format = GL_RGBA
      result.type = GL_UNSIGNED_BYTE
    }
    if (isVideoElement(data)) {
      result.video = data

      // TODO read video width/height

      result.channels = 4
      result.format = GL_RGBA
      result.type = GL_UNSIGNED_BYTE
    }
    if (isRectArray(data)) {
      var w = data.length
      var h = data[0].length
      var c = 1
      var pixels, i, j, k, p
      if (Array.isArray(data[0][0])) {
        c = data[0][0].length
        check(c >= 0 && c <= 4, 'invalid number of channels for image data')
        pixels = new Uint8Array(w * h * c)
        p = 0
        for (i = 0; i < w; ++i) {
          for (j = 0; j < h; ++j) {
            for (k = 0; k < c; ++k) {
              pixels[p++] = data[i][j][k]
            }
          }
        }
      } else {
        pixels = new Uint8Array(w * h)
        p = 0
        for (i = 0; i < w; ++i) {
          for (j = 0; j < h; ++j) {
            pixels[p++] = data[i][j]
          }
        }
      }
      result.width = w
      result.height = h
      result.channels = c
      result.type = GL_UNSIGNED_BYTE
      result.data = pixels
    }

    return result
  }

  function parseMipImage (object) {
    if (object && Array.isArray(object.mipmap)) {
      var storage = parsePixelStorage(object)
      return {
        mipmap: object.mipmap.map(function (level, i) {
          var props = {}
          if ('width' in object) {
            props.width = object.width >> i
          }
          if ('height' in object) {
            props.height = object.height >> i
          }
          if ('channels' in object) {
            props.channels = object.channels
          }
          if ('format' in object) {
            props.format = object.format
          }
          return parsePixelData(Object.assign(props, storage, level))
        })
      }
    }
    return {
      pixels: parsePixelData(object)
    }
  }

  function parseTexParams (options) {
    var result = {
      width: 0,
      height: 0,
      channels: 0,
      format: 0,
      type: 0,
      wrapS: GL_REPEAT,
      wrapT: GL_REPEAT,
      minFilter: GL_NEAREST,
      magFilter: GL_NEAREST,
      genMipmaps: false,
      anisoSamples: 0
    }

    if ('shape' in options) {
      check(Array.isArray(options.shape) && options.shape.length >= 2,
        'shape must be an array')
      result.width = options.shape[0] | 0
      result.height = options.shape[1] | 0
      if (options.shape.length === 3) {
        result.channels = options.shape[2] | 0
      }
    } else {
      if ('radius' in options) {
        result.width = result.height = options.radius | 0
      }
      if ('width' in options) {
        result.width = options.width | 0
      }
      if ('height' in options) {
        result.height = options.height | 0
      }
      if ('channels' in options) {
        result.channels = options.channels | 0
      }
    }

    if ('min' in options) {
      check.param(options.min, minFilters)
      result.minFilter = minFilters[options.min]
    }

    if ('mag' in options) {
      check.param(options.mag, magFilters)
      result.magFilter = magFilters(options.mag)
    }

    if ('wrap' in options) {
      var wrap = options.wrap
      if (typeof wrap === 'string') {
        check.param(wrap, wrapModes)
        result.wrapS = result.wrapT = wrapModes[wrap]
      } else if (Array.isArray(wrap)) {
        check.param(wrap[0], wrapModes)
        check.param(wrap[1], wrapModes)
        result.wrapS = wrapModes[wrap[0]]
        result.wrapT = wrapModes[wrap[1]]
      }
    } else {
      if ('wrapS' in options) {
        check.param(options.wrapS, wrapModes)
        result.wrapS = wrapModes[options.wrapS]
      }
      if ('wrapT' in options) {
        check.param(options.wrapT, wrapModes)
        result.wrapT = wrapModes[options.wrapT]
      }
    }

    if ('aniso' in options) {
      check.type(
        options.aniso,
        'number',
        'number of aniso samples must be a number')
      result.aniso = options.aniso | 0
    }

    if ('mipmap' in options) {
      result.genMipmaps = !!options.mipmap
    } else if ([
      GL_NEAREST_MIPMAP_NEAREST,
      GL_NEAREST_MIPMAP_LINEAR,
      GL_LINEAR_MIPMAP_NEAREST,
      GL_LINEAR_MIPMAP_LINEAR
    ].indexOf(result.minFilter) >= 0) {
      result.genMipmaps = true
    }

    if ('format' in options) {
      check.parameter(options.format, textureFormats, 'invalid texture format')
      result.format = textureFormats[options.format]
      if (options.format in textureTypes) {
        result.type = textureTypes[options.format]
      }
    }

    if ('type' in options) {
      check.parameter(options.type, textureTypes, 'invalid texture type')
      result.type = textureTypes[options.type]
    }

    return result
  }

  function mergeImageParams (params, image) {
    function mergePixelParams (pixels) {
      params.channels = params.channels || pixels.channels
      params.format = params.format || pixels.format

      // For depth textures we can infer the pixel type here
      if (!pixels.type && pixels.data) {
        if (params.format === GL_DEPTH_COMPONENT) {
          if (pixels.data instanceof Uint16Array) {
            pixels.type = GL_UNSIGNED_SHORT
          } else if (pixels.data instanceof Uint32Array) {
            pixels.type = GL_UNSIGNED_INT
          }
        }
      }

      params.type = params.type || pixels.type
    }

    if (image.mipmap) {
      if (image.mipmap.length > 0) {
        params.width = params.width || image.mipmap[0].width
        params.height = params.height || image.mipmap[0].height
        for (var i = 0; i < image.mipmap.length; ++i) {
          mergePixelParams(image.mipmap[i])
        }
      }
    } else {
      params.width = params.width || image.pixels.width
      params.height = params.height || image.pixels.height
      mergePixelParams(image.pixels)
    }
  }

  function fixParamDefaults (params) {
    if (!params.format) {
      switch (params.channels) {
        case 1:
          params.format = GL_LUMINANCE
          break
        case 2:
          params.format = GL_LUMINANCE_ALPHA
          break
        case 3:
          params.format = GL_RGB
          break
        default:
          params.format = GL_RGBA
          break
      }
    }
    params.internalformat = params.format
    params.format = colorFormats[params.format]

    if (params.type === GL_FLOAT) {
      check(extensions.oes_texture_float, 'unsupported texture float')
    }

    // Check float_linear and half_float_linear extensions
    if ((params.type === GL_FLOAT && !extensions.oes_texture_float_linear) ||
        (params.type === GL_HALF_FLOAT_OES &&
          !extensions.oes_texture_half_float_linear)) {
      params.magFilter = GL_NEAREST
      if (params.minFilter === GL_LINEAR) {
        params.minFilter = GL_NEAREST
      } else if (params.minFilter === GL_LINEAR_MIPMAP_LINEAR ||
                 params.minFilter === GL_LINEAR_MIPMAP_NEAREST ||
                 params.minFilter === GL_NEAREST_MIPMAP_LINEAR) {
        params.minFilter = GL_NEAREST_MIPMAP_NEAREST
      }
    }
  }

  function fixImageDefaults (params, image) {
    function fixPixelDefaults (pixels, w, h) {
      if ('width' in pixels) {
        check(pixels.width === w, 'invalid pixel width')
      }
      if ('height' in pixels) {
        check(pixels.height === h, 'invalid pixel height')
      }
      if ('channels' in pixels) {
        check(pixels.channels === params.channels, 'invalid number of channels')
      }
      if ('format' in pixels) {
        check(pixels.format === params.internalformat, 'invalid format')
      }
      if ('type' in pixels) {
        check(pixels.type === params.type, 'invalid texture type')
      }
      pixels.width = w
      pixels.height = h
      pixels.channels = params.channels
      pixels.format = params.format
      pixels.internalformat = params.internalformat
      pixels.type = params.type

      if (pixels.data) {
        switch (pixels.type) {
          case GL_UNSIGNED_BYTE:
            check(pixels.data instanceof Uint8Array ||
                  pixels.data instanceof Uint8ClampedArray,
                  'incompatible pixel type')
            break
          case GL_UNSIGNED_SHORT_5_6_5:
          case GL_UNSIGNED_SHORT_5_5_5_1:
          case GL_UNSIGNED_SHORT_4_4_4_4:
          case GL_UNSIGNED_SHORT:
          case GL_HALF_FLOAT_OES:
            check(pixels.data instanceof Uint16Array,
                  'incompatible pixel type')
            break
          case GL_UNSIGNED_INT:
            check(pixels.data instanceof Uint32Array,
                  'incompatible pixel type')
            break

          case GL_FLOAT:
            check(pixels.data instanceof Float32Array,
                  'incompatible pixel type')
            break

          default:
            check.raise('bad or missing pixel type')
        }
      }
    }

    if (image.mipmap) {
      for (var i = 0; i < image.mipmap.length; ++i) {
        fixPixelDefaults(
          image.mipmap[i],
          params.width >>> i,
          params.height >>> i)
      }
    } else {
      fixPixelDefaults(image.pixels, params.width, params.height)
    }
  }

  function parseTexture2D (object) {
    var result = {
      params: parseTexParams(object),
      image: parseMipImage(object)
    }

    mergeImageParams(result.params, result.image)
    fixParamDefaults(result.params)
    fixImageDefaults(result.params, result.image)

    return result
  }

  function parseCube (object) {
    var i
    var result = {
      params: parseTexParams(object)
    }
    if (Array.isArray(object)) {
      check(object.length === 6, 'invalid number of faces for cubemap')
      result.faces = object.map(parseMipImage)
    } else if ('faces' in object) {
      check(
        Array.isArray(object.faces) && object.length === 6,
        'invalid faces for cubemap')
      var storage = parsePixelStorage(object)
      result.faces = object.faces.map(function (face) {
        return parseMipImage(Object.assign({}, storage, face))
      })
    } else {
      result.faces = [{}, {}, {}, {}, {}, {}]
    }

    for (i = 0; i < 6; ++i) {
      mergeImageParams(result.params, result.faces[i])
    }
    fixParamDefaults(result.params)
    for (i = 0; i < 6; ++i) {
      fixImageDefaults(result.params, result.faces[i])
    }

    return result
  }

  var textureCount = 0
  var textureSet = {}

  function REGLTexture (target, texture) {
    this.id = textureCount++
    this.target = target
    this.texture = texture

    // shape
    this.width = 0
    this.height = 0

    // format info
    this.format = GL_RGBA
    this.internalformat = GL_RGBA
    this.type = GL_UNSIGNED_BYTE

    // filtering properties
    this.minFilter = GL_NEAREST
    this.magFilter = GL_NEAREST
    this.anisoSamples = 0

    // wrapping
    this.wrapS = GL_REPEAT
    this.wrapT = GL_REPEAT

    // parameters
    this.data = null
  }

  Object.assign(REGLTexture.prototype, {
    update: function (args) {
      var params = args.params
      this.width = params.width
      this.height = params.height
      this.minFilter = params.minFilter
      this.magFilter = params.magFilter
      this.anisoSamples = params.aniso
      this.format = params.format
      this.internalformat = params.internalformat
      this.data = args
      this.refresh()
    },

    refresh: function () {
      console.log(this.data)
    },

    destroy: function () {
      check(this.texture, 'must not double free texture')
      gl.deleteTexture(this.texture)
      this.texture = null
      delete textureSet[this.id]
    }
  })

  function createTexture (options, target) {
    var texture = new REGLTexture(target, gl.createTexture())
    textureSet[texture.id] = texture

    var updateTexture

    function updateProps () {
      updateTexture.width = texture.width
      updateTexture.height = texture.height
    }

    if (target === GL_TEXTURE_2D) {
      updateTexture = function reglTexture2D (options) {
        texture.update(parseTexture2D(options))
        updateProps()
        return reglTexture2D
      }
    } else if (target === GL_TEXTURE_CUBE_MAP) {
      updateTexture = function reglTextureCube (options) {
        texture.update(parseCube(options))
        updateProps()
        return reglTextureCube
      }
    }
    updateTexture(options)



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
