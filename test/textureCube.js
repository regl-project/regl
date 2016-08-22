var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('texture cube', function (t) {
  var gl = createContext(16, 16)
  var regl = createREGL({
    gl: gl,
    optionalExtensions: [
      'ext_texture_filter_anisotropic',
      'oes_texture_float',
      'oes_texture_half_float',
      'ext_srgb'
    ]
  })

  var renderCubeFace = regl({
    vert: [
      'attribute vec2 position;',
      'void main() {',
      'gl_Position = vec4(position, 0, 1);',
      '}'
    ].join('\n'),

    frag: [
      'precision highp float;',
      'uniform samplerCube tex;',
      'uniform vec2 shape;',
      'uniform vec3 front, up, right;',
      'void main() {',
      'vec2 uv = 2.0 * gl_FragCoord.xy / shape - 1.0;',
      'gl_FragColor = textureCube(tex, front + uv.x * right + uv.y * up);',
      '}'
    ].join('\n'),

    attributes: {
      position: [
        0, -4,
        -4, 4,
        4, 4
      ]
    },

    uniforms: {
      shape: regl.prop('shape'),
      tex: regl.prop('texture'),
      front: regl.prop('front'),
      up: regl.prop('up'),
      right: regl.prop('right')
    },

    depth: {enable: false},

    count: 3
  })

  function checkShouldThrow (name) {
    var args = Array.prototype.slice.call(arguments, 1)
    t.throws(function () {
      regl.cube.apply(null, args)
    }, /\(regl\)/, name + ' throws')
  }

  function comparePixels (texture, width, height, faces, tolerance, name) {
    createContext.resize(gl, width, height)
    regl._refresh()

    var axes = [
      [0, 1, -1, -1, 1, 2],
      [0, -1, -1, 1, 1, 2],
      [1, 1, 1, 1, 2, 0],
      [1, -1, -1, 1, 2, 0],
      [2, 1, -1, 1, 1, 0],
      [2, -1, -1, -1, 1, 0]
    ]

    for (var p = 0; p < axes.length; ++p) {
      var front = [0, 0, 0]
      var up = [0, 0, 0]
      var right = [0, 0, 0]
      var d = axes[p][0]
      front[d] = axes[p][1]
      up[axes[p][4]] = axes[p][2]
      right[axes[p][5]] = axes[p][3]

      renderCubeFace({
        texture: texture,
        shape: [width, height],
        front: front,
        up: up,
        right: right
      })

      var expected = faces[p]
      var actual = regl.read()
      t.equals(expected.length, actual.length,
        name + ', face ' + p + ' length')
      for (var i = 0; i < expected.length; ++i) {
        if (!(Math.abs(actual[i] - expected[i]) <= tolerance)) {
          t.fail(name + ', face: ' + p + ' @ index ' + i + ' ' + expected[i] + ' - ' + actual[i])
          return
        }
      }
    }
    t.pass(name)
  }

  function checkProperties (name, texture, props) {
    var width = props.width
    var height = props.height

    t.equals(texture.width, width, name + ' width')
    t.equals(texture.height, height, name + ' height')

    t.equals(texture.format, props.format || 'rgba', name + ': format')
    t.equals(texture.type, props.type || 'uint8', name + ': type')

    t.equals(texture.mag, props.mag || 'nearest', name + ': mag filter')
    t.equals(texture.min, props.min || 'nearest', name + ': min filter')

    t.equals(texture.wrapS, props.wrapS || 'clamp', name + ': wrapS')
    t.equals(texture.wrapT, props.wrapT || 'clamp', name + ': wrapT')

    if ('faces' in props) {
      comparePixels(texture, width, height, props.faces, props.tolerance || 0,
        name + ' pixels')
    } else if ('mipmap' in props) {
      var mipmaps = props.mipmap
      for (var i = 0; i < mipmaps.length; ++i) {
        var w = width >> i
        var h = height >> i
        comparePixels(texture, w, h, mipmaps[i], props.tolerance || 0,
          name + ' mipmap ' + i)
      }
    }

    // check texture properties
    var mag = gl.getTexParameter(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER)
    var min = gl.getTexParameter(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER)

    t.equals(mag, props.magFilter || gl.NEAREST, name + ': mag filter')
    t.equals(min, props.minFilter || gl.NEAREST, name + ': min filter')

    if (regl.hasExtension('ext_texture_filter_anisotropic')) {
      var aniso = gl.getTexParameter(gl.TEXTURE_CUBE_MAP,
        gl.getExtension('ext_texture_filter_anisotropic').TEXTURE_MAX_ANISOTROPY_EXT)
      t.equals(aniso, props.anisotropic || 1, name + ': aniso ext')
    }
  }

  checkProperties('empty', regl.cube(), {
    width: 1,
    height: 1,
    faces: [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ]
  })

  checkProperties('empty - object', regl.cube({}), {
    width: 1,
    height: 1,
    faces: [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ]
  })

  checkProperties('cube shape only', regl.cube(5), {
    width: 5,
    height: 5
  })

  checkShouldThrow('bad cube size', {
    width: 5,
    height: 2
  })

  // FIXME: seems like a headless-gl bug
  if (typeof document !== 'undefined') {
    checkProperties('cube colors', regl.cube(
      [[[255, 0, 0, 255]]],
      [[[0, 255, 0, 255]]],
      [[[0, 0, 255, 255]]],
      [[[0, 0, 0, 255]]],
      [[[255, 255, 0, 255]]],
      [[[0, 255, 255, 255]]]), {
        width: 1,
        height: 1,
        faces: [
          [255, 0, 0, 255],
          [0, 255, 0, 255],
          [0, 0, 255, 255],
          [0, 0, 0, 255],
          [255, 255, 0, 255],
          [0, 255, 255, 255]
        ]
      })

    checkProperties('cube colors - face map', regl.cube({
      faces: [
        [[[255, 0, 0, 255]]],
        [[[0, 255, 0, 255]]],
        [[[0, 0, 255, 255]]],
        [[[0, 0, 0, 255]]],
        [[[255, 0, 0, 255]]],
        [[[0, 255, 0, 255]]]
      ]
    }), {
      width: 1,
      height: 1,
      faces: [
        [255, 0, 0, 255],
        [0, 255, 0, 255],
        [0, 0, 255, 255],
        [0, 0, 0, 255],
        [255, 0, 0, 255],
        [0, 255, 0, 255]
      ]
    })
  }

  checkShouldThrow('inconsistent shapes',
    [[0]],
    [[1]],
    [[2, 2]],
    [[3]],
    [[4]],
    [[5]])

  checkShouldThrow('inconsistent formats',
    { radius: 2 },
    { radius: 2 },
    { radius: 2, channels: 1 },
    { radius: 2 },
    { radius: 2 },
    { radius: 2 })

  var testPattern = [
    255, 0, 0, 255, 0, 255, 0, 255,
    0, 0, 255, 255, 255, 255, 255, 0
  ]
  checkProperties('test data', regl.cube({
    width: 2,
    height: 2,
    data: testPattern
  }), {
    width: 2,
    height: 2,
    faces: [
      testPattern,
      testPattern,
      testPattern,
      testPattern,
      testPattern,
      testPattern
    ]
  })

  // copy
  createContext.resize(gl, 2, 2)
  regl._refresh()
  regl.clear({
    color: [0, 1, 1, 1]
  })
  checkProperties('copy tex image', regl.cube({
    radius: 2,
    faces: [
      { copy: true },
      { },
      { },
      { },
      { },
      { }
    ]
  }), {
    width: 2,
    height: 2,
    faces: [
      [
        0, 255, 255, 255, 0, 255, 255, 255,
        0, 255, 255, 255, 0, 255, 255, 255
      ],
      [
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0
      ],
      [
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0
      ],
      [
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0
      ],
      [
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0
      ],
      [
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0
      ]
    ]
  })

  // subimage
  var cube = regl.cube(2)
  cube.subimage(0, [
    255, 0, 0, 255, 255, 0, 0, 255,
    255, 0, 0, 255, 0, 0, 0, 255
  ])
  cube.subimage(1, [
    [ [0, 255, 0, 255], [0, 0, 0, 0] ],
    [ [0, 255, 0, 255], [0, 255, 0, 255] ]
  ])
  cube.subimage(2, [0, 0, 255, 255], 1, 1)
  regl.clear({
    color: [1, 1, 0, 1]
  })
  cube.subimage(4, {
    copy: true,
    width: 1,
    height: 1
  })
  regl.clear({
    color: [1, 0, 1, 1]
  })
  cube.subimage(5, {
    copy: true,
    width: 1,
    height: 1
  }, 1, 0)
  checkProperties('subimage', cube, {
    width: 2,
    height: 2,
    faces: [
      [
        255, 0, 0, 255, 255, 0, 0, 255,
        255, 0, 0, 255, 0, 0, 0, 255
      ],
      [
        0, 255, 0, 255, 0, 0, 0, 0,
        0, 255, 0, 255, 0, 255, 0, 255
      ],
      [
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 255, 255
      ],
      [
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0
      ],
      [
        255, 255, 0, 255, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0
      ],
      [
        0, 0, 0, 0, 255, 0, 255, 255,
        0, 0, 0, 0, 0, 0, 0, 0
      ]
    ]
  })

  // in the below tests, we make sure that we can properly read the properties
  // 'format', 'type', 'min', 'mag', 'wrapS, 'wrapT' from the created texture.

  var testCases = [
    {format: 'rgba', type: 'uint8'},
    {format: 'rgba4', type: 'rgba4'},
    {format: 'rgb565', type: 'rgb565'},
    {format: 'rgb5 a1', type: 'rgb5 a1'},
    {format: 'alpha', type: 'uint8'},
    {format: 'luminance', type: 'uint8'},
    {format: 'luminance alpha', type: 'uint8'}
  ]

  if (regl.hasExtension('oes_texture_float')) {
    testCases.push({format: 'rgba', type: 'float32'})
    testCases.push({format: 'rgb', type: 'float32'})
    testCases.push({format: 'luminance', type: 'float32'})
    testCases.push({format: 'luminance alpha', type: 'float32'})
  }

  if (regl.hasExtension('oes_texture_half_float')) {
    testCases.push({format: 'rgba', type: 'float16'})
    testCases.push({format: 'luminance', type: 'float16'})
    testCases.push({format: 'luminance alpha', type: 'float16'})
  }

  if (regl.hasExtension('ext_srgb')) {
    testCases.push({format: 'srgba', type: 'uint8'})
    testCases.push({format: 'srgb', type: 'uint8'})
  }
  // TODO: also add compressed formats to 'testCases'

  testCases.push({mag: 'nearest', min: 'nearest'})
  testCases.push({mag: 'linear', min: 'linear'})
  testCases.push({mag: 'linear', min: 'linear mipmap linear'})
  testCases.push({mag: 'linear', min: 'nearest mipmap linear'})
  testCases.push({mag: 'linear', min: 'linear mipmap nearest'})
  testCases.push({mag: 'linear', min: 'nearest mipmap nearest'})

  testCases.push({wrapS: 'clamp', wrapT: 'clamp'})

  testCases.forEach(function (testCase, i) {
    var name

    if (testCase.format) { // case for 'format' and 'type'.
      name = 'for format = ' + testCase.format + ' and type = ' + testCase.type
    } else if (testCase.mag) { // case for 'mag' and 'min'
      name = 'for mag = ' + testCase.mag + ' and min = ' + testCase.min
    } else { // case for 'wrapS' and 'wrapT'
      name = 'for wrapS = ' + testCase.wrapS + ' and wrapT = ' + testCase.wrapT
    }

    var arg = testCase
    arg.width = 1
    arg.height = 1
    checkProperties(name, regl.cube(arg), testCase)
  })

  // TODO mipmaps
  // TODO alignment and pixel storage
  // TODO float cube maps
  // TODO dom elements
  // TODO: test resize

  regl.destroy()
  t.equals(gl.getError(), 0, 'error ok')
  createContext.destroy(gl)
  t.end()
})
