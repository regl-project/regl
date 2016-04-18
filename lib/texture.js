var check = require('./check')
var isTypedArray = require('./is-typed-array')
var loadTexture = require('./load-texture')

var GL_TEXTURE_2D = 0x0DE1
var GL_TEXTURE_CUBE_MAP_POSITIVE_X = 0x8515

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

var GL_TEXTURE_MAX_ANISOTROPY_EXT = 0x84FE

var GL_UNPACK_ALIGNMENT = 0x0CF5
var GL_UNPACK_FLIP_Y_WEBGL = 0x9240
var GL_UNPACK_PREMULTIPLY_ALPHA_WEBGL = 0x9241
var GL_UNPACK_COLORSPACE_CONVERSION_WEBGL = 0x9243

var GL_BROWSER_DEFAULT_WEBGL = 0x9244

var GL_TEXTURE0 = 0x84C0

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

function isPow2 (v) {
  return !(v & (v - 1)) && (!!v)
}

function isNumericArray (arr) {
  return (
    Array.isArray(arr) &&
    (arr.length === 0 ||
    typeof arr[0] === 'number'))
}

function isNDArrayLike (obj) {
  return (
    typeof obj === 'object' &&
    Array.isArray(obj.shape) &&
    Array.isArray(obj.stride) &&
    typeof obj.offset === 'number' &&
    obj.shape.length === obj.stride.length &&
    (Array.isArray(obj.data) ||
      isTypedArray(obj.data)))
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

function isPendingXHR (object) {
  return classString(object) === '[object XMLHttpRequest]'
}

function isPixelData (object) {
  return (
    typeof object === 'string' ||
    isTypedArray(object) ||
    isNumericArray(object) ||
    isNDArrayLike(object) ||
    isCanvasElement(object) ||
    isContext2D(object) ||
    isImageElement(object) ||
    isVideoElement(object) ||
    isRectArray(object))
}

// This converts an array of numbers into 16 bit half precision floats
function convertToHalfFloat (array) {
  var floats = new Float32Array(array)
  var uints = new Uint32Array(floats.buffer)
  var ushorts = new Uint16Array(array.length)

  for (var i = 0; i < array.length; ++i) {
    if (isNaN(array[i])) {
      ushorts[i] = 0xffff
    } else if (array[i] === Infinity) {
      ushorts[i] = 0x7c00
    } else if (array[i] === -Infinity) {
      ushorts[i] = 0xfc00
    } else {
      var x = uints[i]

      var sgn = (x >>> 31) << 15
      var exp = ((x << 1) >>> 24) - 127
      var frac = (x >> 13) & ((1 << 10) - 1)

      if (exp < -24) {
        // round non-representable denormals to 0
        ushorts[i] = sgn
      } else if (exp < -14) {
        // handle denormals
        var s = -14 - exp
        ushorts[i] = sgn + ((frac + (1 << 10)) >> s)
      } else if (exp > 15) {
        // round overflow to +/- Infinity
        ushorts[i] = sgn + 0x7c00
      } else {
        // otherwise convert directly
        ushorts[i] = sgn + ((exp + 15) << 10) + frac
      }
    }
  }

  return ushorts
}

// Transpose an array of pixels
function transposePixels (data, nx, ny, nc, sx, sy, sc, off) {
  var result = new data.constructor(nx * ny * nc)
  var ptr = 0
  for (var i = 0; i < ny; ++i) {
    for (var j = 0; j < nx; ++j) {
      for (var k = 0; k < nc; ++k) {
        result[ptr++] = data[sy * i + sx * j + sc * k + off]
      }
    }
  }
  return result
}

module.exports = function createTextureSet (gl, extensionState, limits, reglPoll, viewport) {
  var extensions = extensionState.extensions

  var colorSpace = {
    'none': 0,
    'browser': GL_BROWSER_DEFAULT_WEBGL
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
  limits.textureFormats = supportedFormats

  var colorFormats = supportedFormats.reduce(function (color, key) {
    var glenum = textureFormats[key]
    if (glenum === GL_LUMINANCE ||
        glenum === GL_ALPHA ||
        glenum === GL_LUMINANCE ||
        glenum === GL_LUMINANCE_ALPHA ||
        glenum === GL_DEPTH_COMPONENT ||
        glenum === GL_DEPTH_STENCIL) {
      color[glenum] = glenum
    } else if (glenum === GL_RGB5_A1 || key.indexOf('rgba') >= 0) {
      color[glenum] = GL_RGBA
    } else {
      color[glenum] = GL_RGB
    }
    return color
  }, {})

  var compressedFormatEnums = Object.keys(compressedTextureFormats).map(
    function (key) {
      return compressedTextureFormats[key]
    })

  function parsePixelStorage (options, defaults, result) {
    if (defaults) {
      result.flipY = defaults.flipY
      result.premultiplyAlpha = defaults.premultiplyAlpha
      result.unpackAlignment = defaults.unpackAlignment
      result.colorSpace = defaults.colorSpace
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
      check.parameter(options.colorSpace, colorSpace, 'invalid colorSpace')
      result.colorSpace = colorSpace[options.colorSpace]
    }

    return result
  }

  function parseTexParams (options, defaults) {
    var result = {
      width: 0,
      height: 0,
      channels: 0,
      format: 0,
      type: 0,
      wrapS: GL_CLAMP_TO_EDGE,
      wrapT: GL_CLAMP_TO_EDGE,
      minFilter: GL_NEAREST,
      magFilter: GL_NEAREST,
      genMipmaps: false,
      anisoSamples: 1,
      flipY: false,
      premultiplyAlpha: false,
      unpackAlignment: 1,
      colorSpace: GL_BROWSER_DEFAULT_WEBGL,
      poll: false,
      needsListeners: false
    }

    if (defaults) {
      Object.assign(result, defaults)
      parsePixelStorage(options, defaults, result)
    } else {
      parsePixelStorage(options, null, result)
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
      check.parameter(options.min, minFilters)
      result.minFilter = minFilters[options.min]
    }

    if ('mag' in options) {
      check.parameter(options.mag, magFilters)
      result.magFilter = magFilters[options.mag]
    }

    if ('wrap' in options) {
      var wrap = options.wrap
      if (typeof wrap === 'string') {
        check.parameter(wrap, wrapModes)
        result.wrapS = result.wrapT = wrapModes[wrap]
      } else if (Array.isArray(wrap)) {
        check.parameter(wrap[0], wrapModes)
        check.parameter(wrap[1], wrapModes)
        result.wrapS = wrapModes[wrap[0]]
        result.wrapT = wrapModes[wrap[1]]
      }
    } else {
      if ('wrapS' in options) {
        check.parameter(options.wrapS, wrapModes)
        result.wrapS = wrapModes[options.wrapS]
      }
      if ('wrapT' in options) {
        check.parameter(options.wrapT, wrapModes)
        result.wrapT = wrapModes[options.wrapT]
      }
    }

    if ('aniso' in options) {
      check.type(
        options.aniso,
        'number',
        'number of aniso samples must be a number')
      result.aniso = +options.aniso
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

  function parseMipImage (image, texParams) {
    var defaults = texParams

    if (image) {
      if (Array.isArray(image.mipmap)) {
        defaults = parseTexParams(image, texParams)
        return {
          mipmap: image.mipmap.map(function (level, i) {
            return parsePixelData(
              level,
              texParams.width >> i,
              texParams.height >> i,
              i)
          })
        }
      } else {
        return {
          pixels: parsePixelData(image, texParams.width, texParams.height, 0)
        }
      }
    } else {
      return {}
    }

    function parsePixelData (pixelData, width, height, miplevel) {
      var result = parsePixelStorage(pixelData, defaults, {
        width: 0,
        height: 0,
        channels: defaults.channels,
        format: defaults.format,
        internalformat: 0,
        type: defaults.type,
        copy: false,
        x: 0,
        y: 0,
        image: null,
        canvas: null,
        video: null,
        data: null,
        array: null,
        needsConvert: false,
        needsTranspose: false,
        needsListeners: false,
        strideX: 0,
        strideY: 0,
        strideC: 0,
        offset: 0,
        flipY: defaults.flipY,
        premultiplyAlpha: defaults.premultiplyAlpha,
        unpackAlignment: defaults.unpackAlignment,
        colorSpace: defaults.colorSpace,
        poll: false
      })

      if (!pixelData) {
        return result
      }

      check.type(pixelData, 'object', 'invalid pixel data')

      function setObjectProps () {
        if ('shape' in pixelData) {
          var shape = pixelData.shape
          check(
            Array.isArray(shape) && shape.length >= 2,
            'image shape must be an array')
          result.width = shape[0] | 0
          result.height = shape[1] | 0
          if (shape.length === 3) {
            result.channels = shape[2] | 0
          }
        } else {
          if ('width' in pixelData) {
            result.width = pixelData.width
          } else {
            result.width = width
          }
          if ('height' in pixelData) {
            result.height = pixelData.height
          } else {
            result.height = height
          }
          if ('channels' in pixelData) {
            result.channels = pixelData.channels
          }
        }

        if ('stride' in pixelData) {
          var stride = pixelData.stride
          check(Array.isArray(stride) && stride.length >= 2,
            'invalid stride vector')
          result.strideX = stride[0]
          result.strideY = stride[1]
          if (stride.length === 3) {
            result.strideC = stride[2]
          } else {
            result.strideC = 1
          }
          result.needsTranspose = true
        } else {
          result.strideC = 1
          result.strideX = result.strideC * result.channels
          result.strideY = result.strideX * result.width
        }

        if ('offset' in pixelData) {
          result.offset = pixelData.offset | 0
          result.needsTranspose = true
        }

        if ('format' in pixelData) {
          var format = pixelData.format
          check.parameter(format, textureFormats)
          result.format = textureFormats[format]
          if (format in textureTypes) {
            result.type = textureTypes[format]
          }
        }

        if ('type' in pixelData) {
          var type = pixelData.type
          check.parameter(type, textureTypes)
          result.type = textureTypes[type]
        } else if (result.data instanceof Float32Array) {
          result.type = GL_FLOAT
        }
      }

      function setDefaultProps () {
        result.type = GL_UNSIGNED_BYTE
        result.format = GL_RGBA
        result.channels = 4
      }

      var data = pixelData
      if (isPixelData(pixelData.data)) {
        data = pixelData.data
      }

      if (typeof data === 'string') {
        data = loadTexture(data)
      }

      if (isTypedArray(data)) {
        result.data = data
        setObjectProps()
      } else if (isNumericArray(data)) {
        result.array = data
        result.needsConvert = true
        setObjectProps()
      } else if (isNDArrayLike(data)) {
        if (Array.isArray(data.data)) {
          result.array = data.data
          result.needsConvert = true
        } else {
          result.data = data
        }

        setObjectProps()

        var shape = data.shape
        result.width = shape[0]
        result.height = shape[1]
        if (shape.length === 3) {
          result.channels = shape[2]
        } else {
          result.channels = 1
        }

        var stride = data.stride
        result.strideX = data.stride[0]
        result.strideY = data.stride[1]
        if (stride.length === 3) {
          result.strideC = data.stride[2]
        } else {
          result.strideC = 1
        }

        result.offset = data.offset

        result.needsTranspose = true
      } else if (isCanvasElement(data) || isContext2D(data)) {
        if (isCanvasElement(data)) {
          result.canvas = data
        } else {
          result.canvas = data.canvas
        }
        result.width = result.width || result.canvas.width
        result.height = result.height || result.canvas.height
        setDefaultProps()
      } else if (isImageElement(data)) {
        result.image = data
        result.width = result.width || data.naturalWidth
        result.height = result.height || data.naturalHeight
        if (!image.complete) {
          result.needsListeners = true
        }
        setDefaultProps()
        if ('poll' in pixelData) {
          result.poll = !!pixelData.poll
        }
      } else if (isVideoElement(data)) {
        result.video = data
        result.width = result.width || data.width
        result.height = result.height || data.height
        result.poll = true
        setDefaultProps()
        if ('poll' in pixelData) {
          result.poll = !!pixelData.poll
        }
      } else if (isPendingXHR(data)) {
        // TODO: handle pending xhr request
      } else if (isRectArray(data)) {
        var w = data.length
        var h = data[0].length
        var c = 1
        var pixels, i, j, k, p
        if (Array.isArray(data[0][0])) {
          c = data[0][0].length
          check(c >= 0 && c <= 4, 'invalid number of channels for image data')
          pixels = Array(w * h * c)
          p = 0
          for (i = 0; i < w; ++i) {
            for (j = 0; j < h; ++j) {
              for (k = 0; k < c; ++k) {
                pixels[p++] = data[i][j][k]
              }
            }
          }
        } else {
          pixels = Array(w * h)
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
        result.array = pixels
        result.needsConvert = true
      } else if (pixelData.copy) {
        result.copy = true
        result.x = pixelData.x | 0
        result.y = pixelData.y | 0
        result.width = (pixelData.width || viewport.width) | 0
        result.height = (pixelData.height || viewport.height) | 0
        setDefaultProps()
      }

      // Fix up missing type info for typed arrays
      if (!result.type && result.data) {
        if (result.format === GL_DEPTH_COMPONENT) {
          if (result.data instanceof Uint16Array) {
            result.type = GL_UNSIGNED_SHORT
          } else if (result.data instanceof Uint32Array) {
            result.type = GL_UNSIGNED_INT
          }
        } else if (result.data instanceof Float32Array) {
          result.type = GL_FLOAT
        }
      }

      // reconcile with texParams
      function reconcile (param) {
        if (result[param]) {
          texParams[param] = texParams[param] || result[param]
          check(result[param] === texParams[param], 'incompatible image param: ' + param)
        } else {
          result[param] = texParams[param]
        }
      }
      reconcile('type')
      reconcile('format')
      reconcile('channels')

      texParams.poll = texParams.poll || result.poll
      texParams.needsListeners = texParams.needsListeners || result.needsListeners
      texParams.width = texParams.width || (result.width << miplevel)
      texParams.height = texParams.height || (result.height << miplevel)

      return result
    }
  }

  function fillMissingTexParams (params) {
    // Infer default format
    if (!params.format) {
      params.channels = params.channels || 4
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

    var format = params.format
    if (format === GL_DEPTH_COMPONENT || format === GL_DEPTH_STENCIL) {
      check(
        extensions.webgl_depth_texture,
        'depth/stencil texture not supported')
      if (format === GL_DEPTH_COMPONENT) {
        check(
          params.type === GL_UNSIGNED_SHORT || GL_UNSIGNED_INT,
          'depth texture type must be uint16 or uint32')
      }
      if (format === GL_DEPTH_STENCIL) {
        check(
          params.type === GL_UNSIGNED_INT_24_8_WEBGL,
          'depth stencil texture format must match type')
      }
    }

    // Save format to internal format
    params.internalformat = format

    // Set color format
    params.format = colorFormats[format]
    if (!params.channels) {
      switch (params.format) {
        case GL_LUMINANCE:
        case GL_ALPHA:
        case GL_DEPTH_COMPONENT:
          params.channels = 1
          break

        case GL_DEPTH_STENCIL:
        case GL_LUMINANCE_ALPHA:
          params.channels = 2
          break

        case GL_RGB:
          params.channels = 3
          break

        default:
          params.channels = 4
      }
    }

    // Check that texture type is supported
    params.type = params.type || GL_UNSIGNED_BYTE
    if (params.type === GL_FLOAT) {
      check(
        extensions.oes_texture_float,
        'float texture not supported')
    } else if (params.type === GL_HALF_FLOAT_OES) {
      check(
        extensions.oes_texture_half_float,
        'half float texture not supported')
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

    // Set default values for width and height
    params.width = params.width || 0
    params.height = params.height || 0

    // Set compressed flag
    params.compressed =
      compressedFormatEnums.indexOf(params.internalformat) >= 0

    if (params.genMipmaps) {
      check(params.width === params.height && isPow2(params.width),
        'must be a square power of 2 to support mipmaps')
      check(!params.compressed,
        'mipmap generation not supported for compressed textures')
    }
  }

  function fillMissingImageParams (image, texParams) {
    if (image.mipmap) {
      for (var i = 0; i < image.mipmap.length; ++i) {
        fillMissingPixelParams(
          image.mipmap[i],
          texParams.width >>> i,
          texParams.height >>> i)
      }
    } else if (image.pixels) {
      fillMissingPixelParams(image.pixels, texParams.width, texParams.height)
    }

    function fillMissingPixelParams (pixels, w, h) {
      function checkProp (prop, expected) {
        if (pixels[prop]) {
          check(pixels[prop] === expected, 'invalid ' + prop)
        }
        pixels[prop] = expected
      }

      checkProp('width', w)
      checkProp('height', h)
      checkProp('channels', texParams.channels)
      checkProp('format', texParams.internalformat)
      checkProp('type', texParams.type)

      pixels.format = texParams.format
      pixels.internalformat = texParams.internalformat

      if (pixels.needsConvert) {
        switch (pixels.type) {
          case GL_UNSIGNED_BYTE:
            pixels.data = new Uint8Array(pixels.array)
            break
          case GL_UNSIGNED_SHORT:
            pixels.data = new Uint16Array(pixels.array)
            break
          case GL_UNSIGNED_INT:
            pixels.data = new Uint32Array(pixels.array)
            break
          case GL_FLOAT:
            pixels.data = new Float32Array(pixels.array)
            break
          case GL_HALF_FLOAT_OES:
            pixels.data = convertToHalfFloat(pixels.array)
            break

          case GL_UNSIGNED_SHORT_5_6_5:
          case GL_UNSIGNED_SHORT_5_5_5_1:
          case GL_UNSIGNED_SHORT_4_4_4_4:
          case GL_UNSIGNED_INT_24_8_WEBGL:
            check.raise('unsupported format for automatic conversion')
            break

          default:
            check.raise('unsupported type conversion')
        }
        pixels.needsConvert = false
        pixels.array = null
      }

      if (pixels.needsTranspose) {
        pixels.data = transposePixels(
          pixels.data,
          pixels.width,
          pixels.height,
          pixels.channels,
          pixels.strideX,
          pixels.strideY,
          pixels.strideC,
          pixels.offset)
      }

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
  }

  function parseTexture2D (object) {
    // first pass: initially parse all data
    var params = parseTexParams(object)
    var image = parseMipImage(object, params)

    // second pass: fill in defaults based on inferred parameters
    fillMissingTexParams(params)
    fillMissingImageParams(image, params)

    return {
      params: params,
      image: image
    }
  }

  function parseCube (object) {
    var faces
    if (Array.isArray(object)) {
      faces = object
    } else if ('faces' in object) {
      faces = object.faces
    } else {
      faces = [{}, {}, {}, {}, {}, {}]
    }

    check(Array.isArray(faces) && faces.length === 6,
      'invalid faces for cubemap')

    var params = parseTexParams(object)
    var parsedFaces = faces.map(function (face) {
      return parseMipImage(face, params)
    })

    fillMissingTexParams(params)
    for (var i = 0; i < 6; ++i) {
      fillMissingImageParams(parsedFaces[i], params)
    }

    return {
      params: params,
      faces: parsedFaces
    }
  }

  var activeTexture = 0
  var textureCount = 0
  var textureSet = {}
  var pollSet = []
  var numTexUnits = limits.textureUnits
  var textureUnits = Array(numTexUnits).map(function () {
    return null
  })

  function REGLTexture (target, texture) {
    this.id = textureCount++
    this.target = target
    this.texture = texture

    this.pollId = -1

    this.unit = -1
    this.bindCount = 0

    // cancels all pending callbacks
    this.cancelPending = null

    // parsed user inputs
    this.data = null
  }

  function setTexPixels (target, image, lod) {
    gl.pixelStorei(GL_UNPACK_FLIP_Y_WEBGL, image.flipY)
    gl.pixelStorei(GL_UNPACK_PREMULTIPLY_ALPHA_WEBGL, image.premultiplyAlpha)
    gl.pixelStorei(GL_UNPACK_COLORSPACE_CONVERSION_WEBGL, image.colorSpace)
    gl.pixelStorei(GL_UNPACK_ALIGNMENT, image.unpackAlignment)

    var element = image.image || image.video || image.canvas
    var internalformat = image.internalformat
    var format = image.format
    var type = image.type
    var width = image.width
    var height = image.height
    if (isCanvasElement(element) ||
      (isImageElement(element) && element.complete) ||
      (isVideoElement(element) && element.readyState > 2)) {
      gl.texImage2D(
        target,
        lod,
        format,
        format,
        type,
        element)
    } else if (image.compressed) {
      gl.compressedTexImage2D(
        target,
        lod,
        internalformat,
        width,
        height,
        0,
        image.data)
    } else if (image.copy) {
      reglPoll()
      gl.copyTexImage2D(
        target,
        lod,
        format,
        image.x,
        image.y,
        width,
        height,
        0)
    } else if (image.data) {
      gl.texImage2D(
        target,
        lod,
        format,
        width,
        height,
        0,
        format,
        type,
        image.data)
    } else {
      gl.texImage2D(
        target,
        lod,
        format,
        width || 1,
        height || 1,
        0,
        format,
        type,
        null)
    }
  }

  function setTexImage (target, image) {
    var mipmap = image.mipmap
    if (Array.isArray(mipmap)) {
      for (var i = 0; i < mipmap.length; ++i) {
        setTexPixels(target, mipmap[i], i)
      }
    } else {
      setTexPixels(target, image.pixels, 0)
    }
  }

  function clearPoll (texture) {
    var id = texture.pollId
    if (id >= 0) {
      var other = pollSet[id] = pollSet[pollSet.length - 1]
      other.id = id
      pollSet.pop()
      texture.pollId = -1
    }
  }

  Object.assign(REGLTexture.prototype, {

    bind: function () {
      this.bindCount += 1
      var unit = this.unit
      if (unit < 0) {
        // FIXME: should we use an LRU to allocate textures here?
        for (var i = 0; i < numTexUnits; ++i) {
          var other = textureUnits[i]
          if (!other || other.bindCount <= 0) {
            if (other) {
              other.unit = -1
            }
            textureUnits[i] = this
            unit = i
            break
          }
        }
        this.unit = unit
        gl.activeTexture(GL_TEXTURE0 + unit)
        gl.bindTexture(this.target, this.texture)
        activeTexture = unit
      }
      return unit
    },

    unbind: function () {
      this.bindCount -= 1
    },

    refresh: function () {
      var target = this.target
      var unit = this.unit
      if (unit >= 0) {
        gl.activeTexture(GL_TEXTURE0 + unit)
        activeTexture = unit
      } else {
        gl.bindTexture(target, this.texture)
      }

      var data = this.data

      if (target === GL_TEXTURE_2D) {
        setTexImage(GL_TEXTURE_2D, data.image)
      } else {
        for (var i = 0; i < 6; ++i) {
          setTexImage(GL_TEXTURE_CUBE_MAP_POSITIVE_X + i, data.faces[i])
        }
      }

      // Set tex params
      var params = data.params

      // Generate mipmaps
      if (params.genMipmaps) {
        gl.generateMipmap(target)
      }

      gl.texParameteri(target, GL_TEXTURE_MIN_FILTER, params.minFilter)
      gl.texParameteri(target, GL_TEXTURE_MAG_FILTER, params.magFilter)
      gl.texParameteri(target, GL_TEXTURE_WRAP_S, params.wrapS)
      gl.texParameteri(target, GL_TEXTURE_WRAP_T, params.wrapT)
      if (extensions.ext_texture_filter_anisotropic) {
        gl.texParameteri(target, GL_TEXTURE_MAX_ANISOTROPY_EXT, params.anisoSamples)
      }

      // Restore binding state
      if (unit < 0) {
        var active = textureUnits[activeTexture]
        if (active) {
          // restore binding state
          gl.bindTexture(active.target, active.texture)
        } else {
          // otherwise become new active
          this.unit = activeTexture
        }
      }
    },

    destroy: function () {
      check(this.texture, 'must not double free texture')
      if (this.unit >= 0) {
        gl.activeTexture(GL_TEXTURE0 + this.unit)
        activeTexture = this.unit
        gl.bindTexture(this.target, null)
        textureUnits[this.unit] = null
      }
      if (this.cancelPending) {
        this.cancelPending()
        this.cancelPending = null
      }
      clearPoll(this)
      gl.deleteTexture(this.texture)
      this.texture = null
      this.unit = -1
      this.bindCount = 0
      delete textureSet[this.id]
    }
  })

  function hookListeners (texture) {
    var data = texture.data
    var images = data.faces || [ data.image ]
    var pixels = []

    images.forEach(function (image) {
      if (image.pixels) {
        pixels.push(image.pixels)
      } else if (image.mipmap) {
        pixels.push.apply(pixels, image.mipmap)
      }
    })

    function refresh () {
      if (!data.width || !data.height) {
        // try to recompute size
        pixels.forEach(function (pixelData) {
          if (pixelData.image) {
            data.width = data.width || pixelData.image.naturalWidth
            data.height = data.height || pixelData.image.naturalWidth
          } else if (pixelData.video) {
            data.width = data.width || pixelData.video.width
            data.height = data.height || pixelData.video.height
          }
        })
      }
      texture.refresh()
    }

    pixels.forEach(function (pixelData) {
      if (pixelData.image && !pixelData.image.complete) {
        pixelData.image.addEventListener('load', refresh)
      } else if (pixelData.video && pixelData.readyState < 1) {
        pixelData.video.addEventListener('progress', refresh)
      }
    })

    function detachListeners () {
      pixels.forEach(function (pixelData) {
        if (pixelData.image) {
          pixelData.image.removeEventListener('load', refresh)
        } else if (pixelData.video) {
          pixelData.video.removeEventListener('progress', refresh)
        }
      })
    }

    return detachListeners
  }

  function createTexture (options, target) {
    var texture = new REGLTexture(target, gl.createTexture())
    textureSet[texture.id] = texture

    var parse = target === GL_TEXTURE_2D
      ? parseTexture2D
      : parseCube

    function reglTexture (options) {
      if (texture.cancelPending) {
        texture.cancelPending()
        texture.cancelPending = null
      }

      clearPoll(texture)

      var input = options || {}
      if (typeof input !== 'object') {
        input = {
          data: input
        }
      }
      var args = parse(input)
      var params = args.params
      texture.data = args

      if (params.needsListeners) {
        texture.cancelPending = hookListeners(texture)
      }

      if (params.poll) {
        texture.pollId = pollSet.length
        pollSet.push(texture)
      }

      texture.refresh()
    }

    reglTexture(options)

    reglTexture._reglType = 'texture'
    reglTexture._texture = texture
    reglTexture.destroy = function () {
      texture.destroy()
    }

    return reglTexture
  }

  function refreshTextures () {
    Object.keys(textureSet).forEach(function (texId) {
      textureSet[texId].refresh()
    })
    for (var i = 0; i < numTexUnits; ++i) {
      textureUnits[i] = null
    }
    activeTexture = 0
    gl.activeTexture(GL_TEXTURE0)
  }

  function destroyTextures () {
    for (var i = 0; i < numTexUnits; ++i) {
      gl.activeTexture(GL_TEXTURE0 + i)
      gl.bindTexture(GL_TEXTURE_2D, null)
      textureUnits[i] = null
    }
    gl.activeTexture(GL_TEXTURE0)
    activeTexture = 0
    Object.keys(textureSet).forEach(function (texId) {
      textureSet[texId].destroy()
    })
  }

  // Update any textures
  function pollTextures () {
    for (var i = 0; i < pollSet.length; ++i) {
      pollSet[i].refresh()
    }
  }

  return {
    create: createTexture,
    refresh: refreshTextures,
    clear: destroyTextures,
    poll: pollTextures,
    getTexture: function (wrapper) {
      return null
    }
  }
}
