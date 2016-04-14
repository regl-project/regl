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
        t.equals(typeof actual, 'object', prefix)
        if (expected instanceof Uint8Array ||
            expected instanceof Uint16Array ||
            expected instanceof Uint32Array ||
            expected instanceof Float32Array) {
          t.same(actual, expected, prefix)
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
          unpackAlignment: 1
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

  // test ndarray-like inputs

  // test half float

  // test depth textures

  // test image

  // test video

  // test canvas

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

  // test cubemap format inference

  // storage flags & mipmaps (global flags & per level flags)

  // cube maps

  regl.destroy()
  t.end()
})
