var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('texture 2d', function (t) {
  var gl = createContext(16, 16)
  var regl = createREGL(
    {
      gl: gl,
      optionalExtensions: ['webgl_compressed_texture_s3tc', 'ext_texture_filter_anisotropic', 'oes_texture_float', 'oes_texture_half_float']
    })

  var renderTexture = regl({
    vert: [
      'attribute vec2 position;',
      'void main() {',
      '  gl_Position = vec4(position, 0, 1);',
      '}'
    ].join('\n'),

    frag: [
      'precision highp float;',
      'uniform sampler2D tex;',
      'uniform vec2 shape;',
      'void main() {',
      '  gl_FragColor = texture2D(tex, gl_FragCoord.xy / shape);',
      '}'
    ].join('\n'),

    attributes: {
      position: [0, -4, -4, 4, 4, 4]
    },

    uniforms: {
      shape: regl.prop('shape'),
      tex: regl.prop('texture')
    },

    depth: {enable: false},

    count: 3
  })

  var renderFloatTexture = regl({
    vert: [
      'attribute vec2 position;',
      'void main() {',
      '  gl_Position = vec4(position, 0, 1);',
      '}'
    ].join('\n'),

    frag: [
      'precision highp float;',
      'uniform sampler2D tex;',
      'uniform vec2 shape;',
      'uniform vec4 component;',
      '#define FLOAT_MAX  1.70141184e38',
      '#define FLOAT_MIN  1.17549435e-38',
      'lowp vec4 encode_float(highp float v) {',
      '  highp float av = abs(v);',
      'if(av < FLOAT_MIN) {',
      '  return vec4(0.0, 0.0, 0.0, 0.0);',
      '} else if(v > FLOAT_MAX) {',
      '  return vec4(127.0, 128.0, 0.0, 0.0) / 255.0;',
      '} else if(v < -FLOAT_MAX) {',
      '  return vec4(255.0, 128.0, 0.0, 0.0) / 255.0;',
      '}',
      'highp vec4 c = vec4(0,0,0,0);',
      '//Compute exponent and mantissa',
      'highp float e = floor(log2(av));',
      'highp float m = av * pow(2.0, -e) - 1.0;',
      '//Unpack mantissa',
      'c[1] = floor(128.0 * m);',
      'm -= c[1] / 128.0;',
      'c[2] = floor(32768.0 * m);',
      'm -= c[2] / 32768.0;',
      'c[3] = floor(8388608.0 * m);',
      '//Unpack exponent',
      'highp float ebias = e + 127.0;',
      'c[0] = floor(ebias / 2.0);',
      'ebias -= c[0] * 2.0;',
      'c[1] += floor(ebias) * 128.0;',
      '//Unpack sign bit',
      'c[0] += 128.0 * step(0.0, -v);',
      '//Scale back to range',
      'return c / 255.0;',
      '}',
      'void main() {',
      'float c = dot(component, texture2D(tex, gl_FragCoord.xy / shape));',
      'gl_FragColor = encode_float(c).wzyx;',
      '}'
    ].join('\n'),

    attributes: {
      position: [0, -4, -4, 4, 4, 4]
    },

    uniforms: {
      shape: regl.prop('shape'),
      tex: regl.prop('texture'),
      component: function (context, props) {
        var result = [0, 0, 0, 0]
        result[props.component] = 1
        return result
      }
    },

    depth: {enable: false},

    count: 3
  })

  function checkShouldThrow (desc, name) {
    t.throws(function () {
      regl.texture(desc)
    }, /\(regl\)/, name + ' throws')
  }

  function checkShouldNotThrow (desc, name) {
    var thrown = false
    try {
      regl.texture(desc)
    } catch (e) {
      thrown = true
    }

    t.ok(!thrown, name + ' should not throw')
  }

  function comparePixels (texture, width, height, expected, tolerance, name) {
    var i
    createContext.resize(gl, width, height)
    regl._refresh()

    if (expected instanceof Float32Array) {
      for (var c = 0; c < 4; ++c) {
        renderFloatTexture({
          texture: texture,
          shape: [width, height],
          component: c
        })

        t.equals(gl.getError(), 0, name + ': error code is ok')

        var bits = regl.read()
        var floats = new Float32Array(bits.buffer)
        for (i = 0; i < floats.length; ++i) {
          if (!(Math.abs(floats[i] - expected[4 * i + c]) <= tolerance)) {
            t.fail(name + ' @ index ' + i + '[' + c + ']' + ' ' +
                   expected[4 * i + c] + ' - ' + floats[i])
            return
          }
        }
      }
    } else {
      renderTexture({
        texture: texture,
        shape: [width, height]
      })

      t.equals(gl.getError(), 0, name + ': error code is ok')

      var actual = regl.read()
      for (i = 0; i < expected.length; ++i) {
        if (!(Math.abs(actual[i] - expected[i]) <= tolerance)) {
          t.fail(name + ' @ index ' + i + ' ' + expected[i] + ' - ' + actual[i])
          return
        }
      }
    }
    t.pass(name)
  }

  function checkProperties (texture, props, name) {
    var width = props.width
    var height = props.height

    t.equals(texture.width, width, name + ' width')
    t.equals(texture.height, height, name + ' height')

    t.equals(texture.format, props.format, name + ' format')
    t.equals(texture.type, props.type, name + ' type')

    if ('pixels' in props) {
      comparePixels(texture, width, height, props.pixels, props.tolerance || 0, name + ' pixels')
    } else if ('mipmap' in props) {
      var mipmaps = props.mipmap
      for (var i = 0; i < mipmaps.length; ++i) {
        var w = width >> i
        var h = height >> i
        comparePixels(texture, w, h, mipmaps[i], props.tolerance || 0, name + ' mipmap ' + i)
      }
    }

    // check texture properties
    var mag = gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER)
    var min = gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER)
    var wrapS = gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S)
    var wrapT = gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T)

    t.equals(mag, props.magFilter || gl.NEAREST, name + ': mag filter')
    t.equals(min, props.minFilter || gl.NEAREST, name + ': min filter')
    t.equals(wrapS, props.wrapS || gl.CLAMP_TO_EDGE, name + ': wrapS')
    t.equals(wrapT, props.wrapT || gl.CLAMP_TO_EDGE, name + ': wrapT')

    if (regl.hasExtension('ext_texture_filter_anisotropic')) {
      var aniso = gl.getTexParameter(gl.TEXTURE_2D,
                                     gl.getExtension('ext_texture_filter_anisotropic').TEXTURE_MAX_ANISOTROPY_EXT)
      t.equals(aniso, props.anisotropic || 1, name + ': aniso ext')
    }
  }

  checkProperties(
    regl.texture(),
    {
      anisotropic: 1,
      width: 1,
      height: 1,
      wrapS: gl.CLAMP_TO_EDGE,
      wrapT: gl.CLAMP_TO_EDGE,
      minFilter: gl.NEAREST,
      magFilter: gl.NEAREST,
      pixels: [
        0, 0, 0, 0
      ],
      format: 'rgba',
      type: 'uint8'
    },
    'empty')

  checkProperties(
    regl.texture({}),
    {
      anisotropic: 1,
      width: 1,
      height: 1,
      wrapS: gl.CLAMP_TO_EDGE,
      wrapT: gl.CLAMP_TO_EDGE,
      minFilter: gl.NEAREST,
      magFilter: gl.NEAREST,
      pixels: [
        0, 0, 0, 0
      ],
      format: 'rgba',
      type: 'uint8'
    },
    'empty object')

  checkShouldThrow({
    shape: [3, 3, 2],
    format: 'rgb'
  }, 'inconsistent format and channels')

  checkProperties(
    regl.texture(2, 3),
    {
      anisotropic: 1,
      width: 2,
      height: 3,
      wrapS: gl.CLAMP_TO_EDGE,
      wrapT: gl.CLAMP_TO_EDGE,
      minFilter: gl.NEAREST,
      magFilter: gl.NEAREST,
      pixels: [
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0
      ],
      format: 'rgba',
      type: 'uint8'
    },
    '2x3')

  checkProperties(
    regl.texture(2),
    {
      anisotropic: 1,
      width: 2,
      height: 2,
      wrapS: gl.CLAMP_TO_EDGE,
      wrapT: gl.CLAMP_TO_EDGE,
      minFilter: gl.NEAREST,
      magFilter: gl.NEAREST,
      pixels: [
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0
      ],
      format: 'rgba',
      type: 'uint8'
    },
    '2x2')

  checkProperties(
    regl.texture(
      [ [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9] ]
    ),
    {
      anisotropic: 1,
      width: 3,
      height: 3,
      wrapS: gl.CLAMP_TO_EDGE,
      wrapT: gl.CLAMP_TO_EDGE,
      minFilter: gl.NEAREST,
      magFilter: gl.NEAREST,
      pixels: [
        1, 1, 1, 255, 2, 2, 2, 255, 3, 3, 3, 255,
        4, 4, 4, 255, 5, 5, 5, 255, 6, 6, 6, 255,
        7, 7, 7, 255, 8, 8, 8, 255, 9, 9, 9, 255
      ],
      format: 'luminance',
      type: 'uint8'
    }, '2d nested array')

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
      width: 2,
      height: 2,
      pixels: new Uint8Array([
        1, 1, 1, 2, 5, 5, 5, 6,
        3, 3, 3, 4, 7, 7, 7, 8
      ]),
      format: 'luminance alpha',
      type: 'uint8'
    },
    'ndarray-like input')

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
      width: 4,
      height: 4,
      minFilter: gl.NEAREST_MIPMAP_NEAREST,
      magFilter: gl.NEAREST,
      mipmap: [
        new Uint8Array([
          0, 0, 0, 255, 1, 1, 1, 255, 2, 2, 2, 255, 3, 3, 3, 255,
          4, 4, 4, 255, 5, 5, 5, 255, 6, 6, 6, 255, 7, 7, 7, 255,
          8, 8, 8, 255, 9, 9, 9, 255, 10, 10, 10, 255, 11, 11, 11, 255,
          12, 12, 12, 255, 13, 13, 13, 255, 14, 14, 14, 255, 15, 15, 15, 255
        ]),
        new Uint8Array([
          0, 0, 0, 255, 1, 1, 1, 255,
          2, 2, 2, 255, 3, 3, 3, 255
        ]),
        new Uint8Array([0, 0, 0, 255])
      ],
      format: 'luminance',
      type: 'uint8'
    },
    'simple mipmaps')

  checkShouldThrow({
    shape: [5, 5],
    min: 'mipmap'
  }, 'non-power of 2 mipmap')

  checkShouldThrow({
    shape: [2, 2, 1],
    min: 'mipmap',
    mipmap: [
      [0, 0, 0, 0]
    ]
  }, 'incomplete mipmap data')

  checkShouldThrow({
    shape: [2, 2, 1],
    mipmap: [
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ]
  }, 'bad mipmap size')

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
      width: 4,
      height: 4,
      wrapS: gl.CLAMP_TO_EDGE,
      wrapT: gl.CLAMP_TO_EDGE,
      minFilter: gl.LINEAR_MIPMAP_LINEAR,
      magFilter: gl.LINEAR,
      pixels: new Uint8Array([
        0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255,
        0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255,
        0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255,
        0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255
      ]),
      format: 'rgb',
      type: 'uint8'
    },
    'width&height')

  checkProperties(
    regl.texture({
      shape: [8, 2, 2],
      wrap: ['clamp', 'mirror']
    }),
    {
      width: 8,
      height: 2,
      wrapS: gl.CLAMP_TO_EDGE,
      wrapT: gl.MIRRORED_REPEAT,
      pixels: [
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
      ],
      format: 'luminance alpha',
      type: 'uint8'
    },
    'shape & wrap')

  checkShouldThrow({
    shape: [3, 4],
    wrap: ['repeat', 'clamp']
  })

  checkShouldThrow({
    shape: [4, 3],
    wrap: ['clamp', 'repeat']
  })

  checkShouldThrow({
    shape: [2, 3, 1],
    wrap: ['repeat', 'clamp']
  })

  // test the weird packed formats: rgba4, rgb5 a1, rgb565
  checkProperties(
    regl.texture({
      format: 'rgba4',
      shape: [2, 2],
      data: new Uint16Array([15, 15 << 4, 15 << 8, 15 << 12])
    }),
    {
      width: 2,
      height: 2,
      pixels: [
        0, 0, 0, 255, 0, 0, 255, 0,
        0, 255, 0, 0, 255, 0, 0, 0
      ],
      format: 'rgba4',
      type: 'rgba4'
    },
    'rgba4')

  checkProperties(
    regl.texture({
      format: 'rgb5 a1',
      shape: [2, 2],
      data: new Uint16Array([1, (31 << 11), (31 << 6), (31 << 1)])
    }),
    {
      width: 2,
      height: 2,
      pixels: new Uint8Array([
        0, 0, 0, 255, 255, 0, 0, 0,
        0, 255, 0, 0, 0, 0, 255, 0
      ]),
      format: 'rgb5 a1',
      type: 'rgb5 a1'
    },
    'rgb5 a1')

  // FIXME: this a bug in headless-gl
  if (typeof document !== 'undefined') {
    checkProperties(
      regl.texture({
        format: 'rgb565',
        shape: [3, 1],
        data: new Uint16Array([ 31 << 11, 63 << 5, 31 ])
      }),
      {
        width: 3,
        height: 1,
        pixels: new Uint8Array([
          255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255
        ]),
        format: 'rgb565',
        type: 'rgb565'
      },
      'rgb565')
  }

  checkProperties(
    regl.texture({
      shape: [2, 2, 1],
      flipY: true,
      alignment: 2,
      colorSpace: 'none',
      data: new Uint8Array([1, 0, 2, 0, 3, 0, 4, 0])
    }),
    {
      width: 2,
      height: 2,
      data: new Uint8Array([
        3, 3, 3, 255, 4, 4, 4, 255,
        1, 1, 1, 255, 2, 2, 2, 255
      ]),
      format: 'luminance',
      type: 'uint8'
    },
    'unpack parameters simple')

  checkProperties(
    regl.texture({
      shape: [4, 4, 1],
      flipY: true,
      alignment: 2,
      mipmap: [
        {
          alignment: 1,
          data: new Uint8Array([
            1, 2, 3, 4,
            5, 6, 7, 8,
            9, 10, 11, 12,
            13, 14, 15, 16
          ])
        },
        {
          flipY: false,
          colorSpace: 'none',
          data: new Uint8Array([1, 0, 2, 0, 3, 0, 4, 0])
        },
        {
          alignment: 1,
          data: [30]
        }
      ]
    }),
    {
      width: 4,
      height: 4,
      mipmaps: [
        new Uint8Array([
          12, 12, 12, 255, 13, 13, 13, 255, 14, 14, 14, 255, 15, 15, 15, 255,
          8, 8, 8, 255, 9, 9, 9, 255, 10, 10, 10, 255, 11, 11, 11, 255,
          4, 4, 4, 255, 5, 5, 5, 255, 6, 6, 6, 255, 7, 7, 7, 255,
          0, 0, 0, 255, 1, 1, 1, 255, 2, 2, 2, 255, 3, 3, 3, 255
        ]),
        new Uint8Array([
          1, 1, 1, 255, 2, 2, 2, 255,
          3, 3, 3, 255, 4, 4, 4, 255
        ]),
        new Uint8Array([30, 30, 30, 255])
      ],
      format: 'luminance',
      type: 'uint8'
    },
    'unpack parameters mipmap')

  // Check copy
  createContext.resize(gl, 3, 5)
  regl._refresh()
  regl.clear({
    color: [1, 0, 0, 1]
  })
  checkProperties(
    regl.texture({
      copy: true
    }),
    {
      width: 3,
      height: 5,
      pixels: [
        255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255,
        255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255,
        255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255,
        255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255,
        255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255
      ],
      format: 'rgba',
      type: 'uint8'
    },
    'copy tex image2d')

  regl.clear({
    color: [0, 1, 0, 1]
  })
  checkProperties(
    regl.texture({
      copy: true,
      x: 2,
      y: 1
    }),
    {
      width: 1,
      height: 4,
      pixels: [
        0, 255, 0, 255,
        0, 255, 0, 255,
        0, 255, 0, 255,
        0, 255, 0, 255
      ],
      format: 'rgba',
      type: 'uint8'
    },
    'copy tex image2d with offset')

  checkShouldThrow({
    copy: true,
    x: 100,
    y: 100
  }, 'copy out of bounds (xy offset)')

  checkShouldThrow({
    copy: true,
    width: 10,
    height: 10
  }, 'copy out of bounds (shape)')

  if (regl.hasExtension('oes_texture_float')) {
    checkProperties(
      regl.texture({
        width: 2,
        height: 2,
        data: new Float32Array(
          [1, 2, 3, 4, -5, -6, -7, -8, 1000, 10000, 100000, 1000000, 0, 0.25, -0.25, 0.5])
      }),
      {
        width: 2,
        height: 2,
        pixels: new Float32Array(
          [1, 2, 3, 4, -5, -6, -7, -8, 1000, 10000, 100000, 1000000, 0, 0.25, -0.25, 0.5]),
        format: 'rgba',
        type: 'float32'
      },
      'float')

    checkProperties(
      regl.texture({
        type: 'float',
        shape: [1, 1, 4],
        data: [1, 2, 3, 4]
      }),
      {
        width: 1,
        height: 1,
        pixels: new Float32Array([1, 2, 3, 4]),
        format: 'rgba',
        type: 'float32'
      },
      'float type infer')

    checkProperties(
      regl.texture({type: 'float', shape: [1, 1, 1], format: 'luminance'}),
      {width: 1, height: 1, format: 'luminance', type: 'float32'},
      'luminance_float32')

    checkProperties(
      regl.texture({type: 'float', shape: [1, 1], format: 'alpha'}),
      {width: 1, height: 1, format: 'alpha', type: 'float32'},
      'alpha_float32')

    checkProperties(
      regl.texture({type: 'float', shape: [1, 1, 2]}),
      {width: 1, height: 1, format: 'luminance alpha', type: 'float32'},
      'luminance_alpha_float32')

    checkProperties(
      regl.texture({type: 'float', shape: [1, 1, 3]}),
      {width: 1, height: 1, format: 'rgb', type: 'float32'},
      'rgb_float32')
  } else {
    checkShouldThrow({
      width: 2,
      height: 2,

      data: new Float32Array(16)
    }, 'float missing')
  }

  if (regl.hasExtension('oes_texture_half_float')) {
    //
    // TODO: we need to also test the pixels of half-float
    //

    checkProperties(
      regl.texture({type: 'float16', shape: [1, 1, 1], format: 'luminance'}),
      {width: 1, height: 1, format: 'luminance', type: 'float16'},
      'luminance_float16')

    checkProperties(
      regl.texture({type: 'float16', shape: [1, 1], format: 'alpha'}),
      {width: 1, height: 1, format: 'alpha', type: 'float16'},
      'alpha_float16')

    checkProperties(
      regl.texture({type: 'float16', shape: [1, 1, 2]}),
      {width: 1, height: 1, format: 'luminance alpha', type: 'float16'},
      'luminance_alpha_float16')

    checkProperties(
      regl.texture({type: 'float16', shape: [1, 1, 3]}),
      {width: 1, height: 1, format: 'rgb', type: 'float16'},
      'rgb_float16')
  } else {
    checkShouldThrow({
      width: 2,
      height: 2,
      type: 'float16',
      data: [
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0
      ]
    }, 'half float missing')
  }

  // TODO Test 'mipmapHint'
  function getZeros (n) {
    var a = []
    for (var i = 0; i < n; i++) {
      a[i] = 0
    }
    return new Uint8Array(a)
  }

  // test to make sure that only dimensions divisble by 4 are accepted for compressed textures:
  if (regl.hasExtension('webgl_compressed_texture_s3tc')) {
    var dxtTestCases = []

    dxtTestCases.push({shape: [6, 6], format: 'rgb s3tc dxt1', data: getZeros(18), isThrow: true})
    dxtTestCases.push({shape: [6, 6], format: 'rgba s3tc dxt1', data: getZeros(18), isThrow: true})
    dxtTestCases.push({shape: [6, 6], format: 'rgba s3tc dxt3', data: getZeros(36), isThrow: true})
    dxtTestCases.push({shape: [6, 6], format: 'rgba s3tc dxt5', data: getZeros(36), isThrow: true})

    dxtTestCases.push({shape: [8, 8], format: 'rgb s3tc dxt1', data: getZeros(32), isThrow: false})
    dxtTestCases.push({shape: [8, 8], format: 'rgba s3tc dxt1', data: getZeros(32), isThrow: false})
    dxtTestCases.push({shape: [8, 8], format: 'rgba s3tc dxt3', data: getZeros(64), isThrow: false})
    dxtTestCases.push({shape: [8, 8], format: 'rgba s3tc dxt5', data: getZeros(64), isThrow: false})

    for (var i = 0; i < dxtTestCases.length; i++) {
      var testCase = dxtTestCases[i]

      var arg = {shape: testCase.shape, type: 'uint8', format: testCase.format, data: testCase.data}
      var name = 'compressed texture of shape ' + testCase.shape + ' and format ' + testCase.format

      if (testCase.isThrow) {
        checkShouldThrow(arg, name)
      } else {
        checkShouldNotThrow(arg, name)
      }
    }

    // TODO test rest of compressed textures features.
  }

  // test subimage
  var baseTexture = regl.texture(5, 5)
  baseTexture.subimage([
    [[0, 0, 0, 255], [255, 0, 0, 0]],
    [[0, 255, 0, 0], [0, 0, 255, 0]]
  ])
  checkProperties(baseTexture, {
    width: 5,
    height: 5,
    pixels: new Uint8Array([
      0, 0, 0, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 255, 0, 0, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    ]),
    format: 'rgba',
    type: 'uint8'
  }, 'subimage simple')

  regl.clear({
    color: [1, 1, 0, 1]
  })
  baseTexture.subimage({
    copy: true,
    width: 2,
    height: 2
  }, 2, 2)

  checkProperties(baseTexture, {
    width: 5,
    height: 5,
    pixels: new Uint8Array([
      0, 0, 0, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 255, 0, 0, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 255, 255, 0, 255, 255, 255, 0, 255, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 255, 255, 0, 255, 255, 255, 0, 255, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    ]),
    format: 'rgba',
    type: 'uint8'
  }, 'copyTexSubImage')

  // Test resize
  var initTexture = regl.texture({
    width: 2,
    height: 2,
    data: [
      255, 0, 255, 255, 255, 0, 255, 255,
      255, 0, 255, 255, 255, 0, 255, 255
    ]
  })

  checkProperties(initTexture, {
    width: 2,
    height: 2,
    pixels: new Uint8Array([
      255, 0, 255, 255, 255, 0, 255, 255,
      255, 0, 255, 255, 255, 0, 255, 255
    ]),
    format: 'rgba',
    type: 'uint8'
  }, 'simple before resize')

  initTexture.resize(3, 3)

  checkProperties(initTexture, {
    width: 3,
    height: 3,
    pixels: new Uint8Array([
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    ]),
    format: 'rgba',
    type: 'uint8'
  }, 'simple after resize')

  var mipTexture = regl.texture({
    width: 4,
    height: 4,
    min: 'mipmap',
    mag: 'linear',
    data: [
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255
    ]
  })

  checkProperties(mipTexture, {
    width: 4,
    height: 4,
    magFilter: gl.LINEAR,
    minFilter: gl.LINEAR_MIPMAP_LINEAR,
    pixels: new Uint8Array([
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255
    ]),
    format: 'rgba',
    type: 'uint8'
  }, 'mipmap before resize')

  mipTexture.resize(2)

  checkProperties(mipTexture, {
    width: 2,
    height: 2,
    magFilter: gl.LINEAR,
    minFilter: gl.LINEAR_MIPMAP_LINEAR,
    pixels: new Uint8Array([
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0
    ]),
    format: 'rgba',
    type: 'uint8'
  }, 'mipmap after resize')

  function runDOMTests () {
    var canvas = document.createElement('canvas')
    canvas.width = 4
    canvas.height = 4
    var context2D = canvas.getContext('2d')
    function box (x, y, w, h, color) {
      context2D.fillStyle = color
      context2D.fillRect(x, y, w, h)
    }

    box(0, 0, 4, 4, '#000')
    box(0, 0, 2, 2, '#fff')

    checkProperties(
      regl.texture(canvas),
      {
        width: 4,
        height: 4,
        pixels: [
          255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255,
          255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255,
          0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255,
          0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255
        ],
        format: 'rgba',
        type: 'uint8'
      },
      'canvas dom element')

    box(0, 0, 1, 1, '#f00')

    checkProperties(
      regl.texture(context2D),
      {
        width: 4,
        height: 4,
        pixels: [
          255, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255,
          255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255,
          0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255,
          0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255
        ],
        format: 'rgba',
        type: 'uint8'
      },
      'context 2d')

    box(2, 2, 2, 2, '#0f0')

    var img = document.createElement('img')
    img.src = canvas.toDataURL()

    function checkImage () {
      checkProperties(
        regl.texture(img),
        {
          width: 4,
          height: 4,
          pixels: [
            255, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255,
            255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255,
            0, 0, 0, 255, 0, 0, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255,
            0, 0, 0, 255, 0, 0, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255
          ],
          format: 'rgba',
          type: 'uint8'
        },
        'DOM image element')

      // test texsubimage 2D
      var bigTexture = regl.texture(5, 5)
      bigTexture.subimage(img)

      checkProperties(bigTexture, {
        width: 5,
        height: 5,
        pixels: [
          255, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 0,
          255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 0,
          0, 0, 0, 255, 0, 0, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 0, 0, 0,
          0, 0, 0, 255, 0, 0, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 0, 0, 0,
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
        ],
        format: 'rgba',
        type: 'uint8'
      }, 'DOM image element - subimage')

      endTest()
    }

    if (img.complete) {
      checkImage()
    } else {
      img.onload = checkImage
    }

    // TODO check video elements
  }

  function checkPropertiesMagWrap (texture, props, name) {
    t.equals(texture.mag, props.mag, name + ' mag')
    t.equals(texture.min, props.min, name + ' min')
    t.equals(texture.wrapS, props.wrapS, name + ' wrapS')
    t.equals(texture.wrapT, props.wrapT, name + ' wrapT')
  }

  checkPropertiesMagWrap(
    regl.texture(),
    {
      wrapS: 'clamp',
      wrapT: 'clamp',
      min: 'nearest',
      mag: 'nearest'
    },
    'magwrap empty')

  checkPropertiesMagWrap(
    regl.texture({
      min: 'linear',
      mag: 'linear',
      wrapS: 'repeat',
      wrapT: 'clamp'
    }),
    {
      wrapS: 'repeat',
      wrapT: 'clamp',
      min: 'linear',
      mag: 'linear'
    },
    'magwrap1')

  checkPropertiesMagWrap(
    regl.texture({
      min: 'linear mipmap linear',
      mag: 'nearest',
      wrapS: 'clamp',
      wrapT: 'repeat'
    }),
    {
      wrapS: 'clamp',
      wrapT: 'repeat',
      min: 'linear mipmap linear',
      mag: 'nearest'
    },
    'magwrap2')

  checkPropertiesMagWrap(
    regl.texture({
      min: 'nearest mipmap linear',
      mag: 'nearest',
      wrapS: 'mirror',
      wrapT: 'repeat'
    }),
    {
      wrapS: 'mirror',
      wrapT: 'repeat',
      min: 'nearest mipmap linear',
      mag: 'nearest'
    },
    'magwrap3')

  checkPropertiesMagWrap(
    regl.texture({
      min: 'linear mipmap nearest',
      mag: 'nearest',
      wrapS: 'repeat',
      wrapT: 'mirror'
    }),
    {
      wrapS: 'repeat',
      wrapT: 'mirror',
      min: 'linear mipmap nearest',
      mag: 'nearest'
    },
    'magwrap4')

  checkPropertiesMagWrap(
    regl.texture({
      min: 'nearest mipmap nearest',
      mag: 'nearest',
      wrapS: 'mirror',
      wrapT: 'mirror'
    }),
    {
      wrapS: 'mirror',
      wrapT: 'mirror',
      min: 'nearest mipmap nearest',
      mag: 'nearest'
    },
    'magwrap4')

  if (typeof document !== 'undefined') {
    runDOMTests()
  } else {
    endTest()
  }

  function endTest () {
    regl.destroy()
    t.equals(gl.getError(), 0, 'error ok')
    createContext.destroy(gl)
    t.end()
  }
})
