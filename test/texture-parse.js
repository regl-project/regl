var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('texture arg parsing', function (t) {
  var gl = createContext(16, 16)
  var regl = createREGL(gl)

  function checkProperties (texture, props, name) {
    var textureProps = texture._texture.data

    function diff (actual, expected, prefix) {
      if (typeof expected === 'object') {
        if (expected instanceof Uint8Array ||
            expected instanceof Uint16Array ||
            expected instanceof Uint32Array ||
            expected instanceof Float32Array) {
          t.same(actual, expected, prefix)
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

    diff(textureProps, props, name || '')
  }

  checkProperties(
    regl.texture({}),
    {
      params: {
        anisoSamples: 0,
        format: gl.RGBA,
        internalformat: gl.RGBA,
        type: gl.UNSIGNED_BYTE,
        width: 0,
        height: 0,
        wrapS: gl.REPEAT,
        wrapT: gl.REPEAT,
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
      image: {
        pixels: {
          data: new Uint8Array([ 1, 2, 3, 4, 5, 6, 7, 8, 9 ]),
          type: gl.UNSIGNED_BYTE,
          flipY: false,
          premultiplyAlpha: false,
          unpackAlignment: 1,
          colorSpace: gl.BROWSER_DEFAULT_WEBGL
        }
      },
      params: {
        width: 3,
        height: 3,
        channels: 1,
        format: gl.LUMINANCE
      }
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
        channels: 1,
        format: gl.LUMINANCE,
        type: gl.UNSIGNED_BYTE
      },
      image: {
        mipmap: [
          {
            data: new Uint8Array([
              0, 1, 2, 3,
              4, 5, 6, 7,
              8, 9, 10, 11,
              12, 13, 14, 15
            ])
          },
          {
            data: new Uint8Array([0, 1, 2, 3])
          },
          {
            data: new Uint8Array([0])
          }
        ]
      }
    },
    'simple mipmaps')

  checkProperties(
    regl.texture({
      width: 5,
      height: 1,
      channels: 3,
      wrap: 'clamp',
      mag: 'linear',
      min: 'mipmap'
    }),
    {
      params: {
        width: 5,
        height: 1,
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
      shape: [5, 1, 2],
      wrap: ['clamp', 'mirror']
    }),
    {
      params: {
        width: 5,
        height: 1,
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
        image: {
          pixels: {
            data: new Float32Array([
              1, 2, 3, 4,
              5, 6, 7, 8,
              9, 10, 11, 12,
              13, 14, 15, 16
            ])
          }
        }
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
        image: {
          pixels: {
            data: new Float32Array([1, 2, 3, 4])
          }
        }
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
        channels: 4,
        format: gl.RGBA,
        internalformat: gl.RGBA4,
        type: gl.UNSIGNED_SHORT_4_4_4_4
      },
      image: {
        pixels: {
          data: new Uint16Array([1, 2, 3, 4])
        }
      }
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
        channels: 4,
        format: gl.RGBA,
        internalformat: gl.RGB5_A1,
        type: gl.UNSIGNED_SHORT_5_5_5_1
      },
      image: {
        pixels: {
          data: new Uint16Array([1, 2, 1000, 4])
        }
      }
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
        channels: 3,
        format: gl.RGB,
        internalformat: gl.RGB565,
        type: gl.UNSIGNED_SHORT_5_6_5
      },
      image: {
        pixels: {
          data: new Uint16Array([1, 2, 3, 4])
        }
      }
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
      params: {
        width: 2,
        height: 2,
        channels: 1
      },
      image: {
        pixels: {
          flipY: true,
          unpackAlignment: 2,
          premultiplyAlpha: true,
          colorSpace: gl.NONE,
          data: new Uint8Array([1, 0, 2, 0, 3, 0, 4, 0])
        }
      }
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
      params: {
        width: 2,
        height: 2,
        channels: 1
      },
      image: {
        mipmap: [
          {
            flipY: false,
            unpackAlignment: 2,
            premultiplyAlpha: true,
            colorSpace: gl.NONE,
            data: new Uint8Array([1, 0, 2, 0, 3, 0, 4, 0])
          },
          {
            flipY: true,
            unpackAlignment: 1,
            premultiplyAlpha: false,
            colorSpace: gl.BROWSER_DEFAULT_WEBGL,
            data: new Uint8Array([1])
          }
        ]
      }
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
      params: {
        width: 2,
        height: 2,
        channels: 2,
        type: gl.UNSIGNED_BYTE
      },
      image: {
        pixels: {
          data: new Uint8Array([
            1, 2, 5, 6,
            3, 4, 7, 8
          ])
        }
      }
    },
    'ndarray-like input')

  // test half float
  if (regl.limits.extensions.indexOf('oes_texture_half_float')) {
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
        image: {
          pixels: {
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
          }
        }
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
        data: new Uint16Array([1])
      }),
      {
        params: {
          format: gl.DEPTH_COMPONENT,
          width: 1,
          height: 1,
          channels: 1,
          type: gl.UNSIGNED_SHORT
        },
        image: {
          pixels: {
            data: new Uint16Array([1])
          }
        }
      },
      'depth texture')

    // stencil
    checkProperties(
      regl.texture({
        shape: [1, 1],
        format: 'depth stencil'
      }),
      {
        params: {
          format: gl.DEPTH_STENCIL,
          channels: 2,
          type: gl.getExtension('WEBGL_depth_texture').UNSIGNED_INT_24_8_WEBGL
        }
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
        params: {
          width: 2,
          height: 2,
          channels: 4,
          format: gl.RGBA,
          type: gl.UNSIGNED_BYTE
        },
        image: {
          pixels: {
            canvas: canvas
          }
        }
      },
      'canvas')

    checkProperties(
      regl.texture(context),
      {
        params: {
          width: 2,
          height: 2,
          channels: 4,
          format: gl.RGBA,
          type: gl.UNSIGNED_BYTE
        },
        image: {
          pixels: {
            canvas: canvas
          }
        }
      },
      'context 2d')

    // test image
    var image = document.createElement('img')
    image.src = canvas.toDataURL()
    checkProperties(
      regl.texture(image),
      {
        image: {
          pixels: {
            image: image
          }
        }
      },
      'image')

    // test video
    var video = document.createElement('video')
    checkProperties(
      regl.texture(video),
      {
        image: {
          pixels: {
            video: video
          }
        }
      },
      'video')
  }

  // compressed textures

  // cube maps

  regl.destroy()
  t.end()
})
