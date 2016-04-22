var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('texture arg parsing', function (t) {
  var gl = createContext(16, 16)
  var regl = createREGL(gl)

  function checkProperties (texture, props, name) {
    function diff (actual, expected, prefix) {
      if (typeof expected === 'object') {
        if (expected instanceof Uint8Array ||
            expected instanceof Uint16Array ||
            expected instanceof Uint32Array ||
            expected instanceof Float32Array) {
          t.same(actual, expected, prefix)
        } else if (expected === null) {
          t.equals(actual, expected, prefix)
        } else if (expected.nodeName) {
          t.equals(actual, expected, prefix)
        } else if (Array.isArray(expected)) {
          for (var i = 0; i < expected.length; ++i) {
            diff(actual[i], expected[i], prefix + '[' + i + ']')
          }
        } else {
          Object.keys(expected).forEach(function (key) {
            diff(actual[key], expected[key], prefix + '.' + key)
          })
        }
      } else {
        t.equals(actual, expected, prefix)
      }
    }

    diff(texture._texture.params, props.params || {}, (name || '') + ' params')
    diff(texture._texture.pixels, props.pixels || [], (name || '') + ' pixels')
  }

  checkProperties(
    regl.texture({}),
    {
      params: {
        anisotropic: 1,
        format: gl.RGBA,
        internalformat: gl.RGBA,
        type: gl.UNSIGNED_BYTE,
        width: 0,
        height: 0,
        wrapS: gl.CLAMP_TO_EDGE,
        wrapT: gl.CLAMP_TO_EDGE,
        minFilter: gl.NEAREST,
        magFilter: gl.NEAREST,
        genMipmaps: false
      }
    },
    'empty')

  checkProperties(
    regl.texture(
      [ [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9] ]
    ),
    {
      pixels: [{
        target: gl.TEXTURE_2D,
        data: new Uint8Array([ 1, 2, 3, 4, 5, 6, 7, 8, 9 ]),
        type: gl.UNSIGNED_BYTE,
        flipY: false,
        premultiplyAlpha: false,
        unpackAlignment: 1,
        colorSpace: gl.BROWSER_DEFAULT_WEBGL,
        width: 3,
        height: 3,
        channels: 1,
        format: gl.LUMINANCE
      }]
    },
    'nested array')

  // test mipmaps
  checkProperties(
    regl.texture({
      shape: [4, 4, 1],
      mipmap: [
        [ 0, 1, 2, 3,
          4, 5, 6, 7,
          8, 9, 10, 11,
          12, 13, 14, 15 ],
        [ 0, 1,
          2, 3 ],
        [ 0 ]
      ]
    }),
    {
      params: {
        width: 4,
        height: 4,
        format: gl.LUMINANCE,
        type: gl.UNSIGNED_BYTE
      },
      pixels: [
        {
          target: gl.TEXTURE_2D,
          miplevel: 0,
          width: 4,
          height: 4,
          channels: 1,
          data: new Uint8Array([
            0, 1, 2, 3,
            4, 5, 6, 7,
            8, 9, 10, 11,
            12, 13, 14, 15
          ])
        },
        {
          target: gl.TEXTURE_2D,
          miplevel: 1,
          width: 2,
          height: 2,
          data: new Uint8Array([
            0, 1,
            2, 3
          ])
        },
        {
          target: gl.TEXTURE_2D,
          miplevel: 2,
          width: 1,
          height: 1,
          data: new Uint8Array([0])
        }
      ]
    },
    'simple mipmaps')

  checkProperties(
    regl.texture({
      width: 4,
      height: 4,
      channels: 3,
      wrap: 'clamp',
      mag: 'linear',
      min: 'mipmap'
    }),
    {
      params: {
        width: 4,
        height: 4,
        format: gl.RGB,
        wrapS: gl.CLAMP_TO_EDGE,
        wrapT: gl.CLAMP_TO_EDGE,
        genMipmaps: true,
        minFilter: gl.LINEAR_MIPMAP_LINEAR,
        magFilter: gl.LINEAR
      }
    },
    'width&height')

  checkProperties(
    regl.texture({
      shape: [8, 2, 2],
      wrap: ['clamp', 'mirror']
    }),
    {
      params: {
        width: 8,
        height: 2,
        format: gl.LUMINANCE_ALPHA,
        wrapS: gl.CLAMP_TO_EDGE,
        wrapT: gl.MIRRORED_REPEAT
      }
    },
    'shape & wrap')

  // test float textures
  if (regl.limits.extensions.indexOf('oes_texture_float') >= 0) {
    checkProperties(
      regl.texture({
        width: 2,
        height: 2,
        data: new Float32Array([
          1, 2, 3, 4,
          5, 6, 7, 8,
          9, 10, 11, 12,
          13, 14, 15, 16
        ])
      }),
      {
        params: {
          width: 2,
          height: 2,
          format: gl.RGBA,
          type: gl.FLOAT
        },
        pixels: [{
          data: new Float32Array([
            1, 2, 3, 4,
            5, 6, 7, 8,
            9, 10, 11, 12,
            13, 14, 15, 16
          ]),
          width: 2,
          height: 2,
          channels: 4,
          format: gl.RGBA,
          internalformat: gl.RGBA,
          type: gl.FLOAT
        }]
      },
      'float')

    checkProperties(
      regl.texture({
        type: 'float',
        shape: [1, 1, 4],
        data: [1, 2, 3, 4]
      }),
      {
        params: {
          type: gl.FLOAT
        },
        pixels: [{
          data: new Float32Array([1, 2, 3, 4])
        }]
      },
      'float type infer')
  }

  // test weird short formats rgba4, rgb5 a1, rgb565
  checkProperties(
    regl.texture({
      format: 'rgba4',
      shape: [2, 2],
      data: new Uint16Array([1, 2, 3, 4])
    }),
    {
      params: {
        width: 2,
        height: 2,
        format: gl.RGBA,
        internalformat: gl.RGBA4,
        type: gl.UNSIGNED_SHORT_4_4_4_4
      },
      pixels: [{
        channels: 4,
        data: new Uint16Array([1, 2, 3, 4])
      }]
    },
    'rgba4')

  checkProperties(
    regl.texture({
      format: 'rgb5 a1',
      shape: [2, 2],
      data: new Uint16Array([1, 2, 1000, 4])
    }),
    {
      params: {
        width: 2,
        height: 2,
        format: gl.RGBA,
        internalformat: gl.RGB5_A1,
        type: gl.UNSIGNED_SHORT_5_5_5_1
      },
      pixels: [{
        channels: 4,
        data: new Uint16Array([1, 2, 1000, 4])
      }]
    },
    'rgb5 a1')

  checkProperties(
    regl.texture({
      format: 'rgb565',
      shape: [2, 2],
      data: new Uint16Array([1, 2, 3, 4])
    }),
    {
      params: {
        width: 2,
        height: 2,
        format: gl.RGB,
        internalformat: gl.RGB565,
        type: gl.UNSIGNED_SHORT_5_6_5
      },
      pixels: [{
        channels: 3,
        data: new Uint16Array([1, 2, 3, 4])
      }]
    },
    'rgb565')

  // test storage flags basic
  checkProperties(
    regl.texture({
      shape: [2, 2, 1],
      flipY: true,
      alignment: 2,
      premultiplyAlpha: true,
      colorSpace: 'none',
      data: [1, 0, 2, 0, 3, 0, 4, 0]
    }),
    {
      pixels: [{
        width: 2,
        height: 2,
        channels: 1,
        flipY: true,
        unpackAlignment: 2,
        premultiplyAlpha: true,
        colorSpace: gl.NONE,
        data: new Uint8Array([1, 0, 2, 0, 3, 0, 4, 0])
      }]
    },
    'unpack parameters simple')

  checkProperties(
    regl.texture({
      shape: [2, 2, 1],
      flipY: true,
      alignment: 2,
      premultiplyAlpha: true,
      colorSpace: 'browser',
      mipmap: [
        {
          flipY: false,
          colorSpace: 'none',
          data: [1, 0, 2, 0, 3, 0, 4, 0]
        },
        {
          alignment: 1,
          premultiplyAlpha: false,
          data: [1]
        }
      ]
    }),
    {
      pixels: [
        {
          width: 2,
          height: 2,
          channels: 1,
          miplevel: 0,
          flipY: false,
          unpackAlignment: 2,
          premultiplyAlpha: true,
          colorSpace: gl.NONE,
          data: new Uint8Array([1, 0, 2, 0, 3, 0, 4, 0])
        },
        {
          width: 1,
          height: 1,
          channels: 1,
          miplevel: 1,
          flipY: true,
          unpackAlignment: 1,
          premultiplyAlpha: false,
          colorSpace: gl.BROWSER_DEFAULT_WEBGL,
          data: new Uint8Array([1])
        }
      ]
    },
    'unpack parameters mipmap')

  // test ndarray-like inputs
  checkProperties(
    regl.texture({
      shape: [2, 2, 2],
      stride: [4, 2, 1],
      offset: 3,
      data: [
        100, 101, 102,
        1, 2, 3, 4,
        5, 6, 7, 8
      ]
    }),
    {
      pixels: [{
        width: 2,
        height: 2,
        channels: 2,
        type: gl.UNSIGNED_BYTE,
        data: new Uint8Array([
          1, 2, 5, 6,
          3, 4, 7, 8
        ])
      }]
    },
    'ndarray-like input')

  // test half float
  if (regl.limits.extensions.indexOf('oes_texture_half_float') >= 0) {
    checkProperties(
      regl.texture({
        type: 'half float',
        width: 15,
        height: 1,
        channels: 1,
        data: [
          1,
          1.0009765625,
          -2,
          65504,
          Math.pow(2, -14),
          Math.pow(2, -14) - Math.pow(2, -24),
          Math.pow(2, -24),
          0,
          -0,
          Infinity,
          1e7,
          -Infinity,
          -1e7,
          1e-8,
          -1e-8,
          1.0 / 3.0,
          NaN
        ]
      }),
      {
        params: {
          type: gl.getExtension('OES_texture_half_float').HALF_FLOAT_OES
        },
        pixels: [{
          data: new Uint16Array([
            '0 01111 0000000000',
            '0 01111 0000000001',
            '1 10000 0000000000',
            '0 11110 1111111111',
            '0 00001 0000000000',
            '0 00000 1111111111',
            '0 00000 0000000001',
            '0 00000 0000000000',
            '1 00000 0000000000',
            '0 11111 0000000000',
            '0 11111 0000000000',
            '1 11111 0000000000',
            '1 11111 0000000000',
            '0 00000 0000000000',
            '1 00000 0000000000',
            '0 01101 0101010101',
            '1 11111 1111111111'
          ].map(function (str) {
            return parseInt(str.replace(/\s/g, ''), 2)
          }))
        }]
      },
      'half float')
  }

  // test depth textures
  if (regl.limits.extensions.indexOf('webgl_depth_texture') >= 0) {
    // depth
    checkProperties(
      regl.texture({
        shape: [1, 1],
        format: 'depth',
        data: null
      }),
      {
        pixels: [{
          data: null,
          format: gl.DEPTH_COMPONENT,
          width: 1,
          height: 1,
          channels: 1,
          type: gl.UNSIGNED_INT
        }]
      },
      'depth texture')

    // stencil
    checkProperties(
      regl.texture({
        shape: [1, 1],
        format: 'depth stencil'
      }),
      {
        pixels: [{
          format: gl.DEPTH_STENCIL,
          channels: 2,
          type: gl.getExtension('WEBGL_depth_texture').UNSIGNED_INT_24_8_WEBGL
        }]
      },
      'depth stencil')
  }

  // test html elements
  if (typeof document !== 'undefined') {
    // test canvas
    var canvas = document.createElement('canvas')
    canvas.width = canvas.height = 2
    var context = canvas.getContext('2d')
    context.fillStyle = '#000'
    context.fillRect(0, 0, 2, 2)
    context.fillStyle = '#fff'
    context.fillRect(0, 0, 1, 1)

    checkProperties(
      regl.texture(canvas),
      {
        pixels: [{
          width: 2,
          height: 2,
          channels: 4,
          format: gl.RGBA,
          type: gl.UNSIGNED_BYTE,
          canvas: canvas
        }]
      },
      'canvas')

    checkProperties(
      regl.texture(context),
      {
        pixels: [{
          width: 2,
          height: 2,
          channels: 4,
          format: gl.RGBA,
          type: gl.UNSIGNED_BYTE,
          canvas: canvas
        }]
      },
      'context 2d')

    // test image
    var image = document.createElement('img')
    image.src = canvas.toDataURL()
    checkProperties(
      regl.texture(image),
      {
        pixels: [{
          image: image
        }]
      },
      'image')

    // test video
    var video = document.createElement('video')
    checkProperties(
      regl.texture(video),
      {
        pixels: [{
          video: video
        }]
      },
      'video')
  }

  // Check copy
  checkProperties(
    regl.texture({
      copy: true
    }),
    {
      params: {
        minFilter: gl.NEAREST,
        magFilter: gl.NEAREST
      },
      pixels: [{
        format: gl.RGBA,
        type: gl.UNSIGNED_BYTE,
        internalformat: gl.RGBA,
        copy: true,
        x: 0,
        y: 0,
        width: 16,
        height: 16,
        channels: 4
      }]
    },
    'copy tex image2d')

  // compressed textures
  if (regl.limits.extensions.indexOf('webgl_compressed_texture_s3tc') >= 0) {
    // TODO
  }

  if (regl.limits.extensions.indexOf('webgl_compressed_texture_atc') >= 0) {
    // TODO
  }

  if (regl.limits.extensions.indexOf('webgl_compressed_texture_pvrtc') >= 0) {
    // TODO
  }

  if (regl.limits.extensions.indexOf('webgl_compressed_texture_etc1') >= 0) {
    // TODO
  }

  // cube maps

  checkProperties(
    regl.cube([
      [[1]],
      [[2]],
      [[3]],
      [[4]],
      [[5]],
      [[6]]
    ]),
    {
      params: {
      },
      pixels: [
        {
          width: 1,
          height: 1,
          channels: 1,
          target: gl.TEXTURE_CUBE_MAP_POSITIVE_X,
          data: new Uint8Array([1])
        },
        {
          target: gl.TEXTURE_CUBE_MAP_NEGATIVE_X,
          data: new Uint8Array([2])
        },
        {
          target: gl.TEXTURE_CUBE_MAP_POSITIVE_Y,
          data: new Uint8Array([3])
        },
        {
          target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Y,
          data: new Uint8Array([4])
        },
        {
          target: gl.TEXTURE_CUBE_MAP_POSITIVE_Z,
          data: new Uint8Array([5])
        },
        {
          target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Z,
          data: new Uint8Array([6])
        }
      ]
    },
    'cube simple')

  // cube map pixel storage

  // cube map mipmaps

  regl.destroy()
  t.end()
})
