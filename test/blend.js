var tape = require('tape')
var extend = require('../lib/util/extend')
var createContext = require('./util/create-context')
var createREGL = require('../regl')

var GL_MIN_EXT = 0x8007
var GL_MAX_EXT = 0x8008

var blendFuncs = {
  '0': 0,
  '1': 1,
  'zero': 0,
  'one': 1,
  'src color': 768,
  'one minus src color': 769,
  'src alpha': 770,
  'one minus src alpha': 771,
  'dst color': 774,
  'one minus dst color': 775,
  'dst alpha': 772,
  'one minus dst alpha': 773,
  'constant color': 32769,
  'one minus constant color': 32770,
  'constant alpha': 32771,
  'one minus constant alpha': 32772,
  'src alpha saturate': 776
}

var blendEquations = {
  'add': 32774,
  'subtract': 32778,
  'reverse subtract': 32779
}

var invalidBlendCombinations = [
  ['constant color', 'constant alpha'],
  ['one minus constant color', 'constant alpha'],
  ['constant color', 'one minus constant alpha'],
  ['one minus constant color', 'one minus constant alpha'],
  ['constant alpha', 'constant color'],
  ['constant alpha', 'one minus constant color'],
  ['one minus constant alpha', 'constant color'],
  ['one minus constant alpha', 'one minus constant color']
]

tape('blend', function (t) {
  var gl = createContext(16, 16)
  var regl = createREGL({gl: gl, optionalExtensions: ['ext_blend_minmax']})

  if (regl.hasExtension('ext_blend_minmax')) {
    blendEquations.min = GL_MIN_EXT
    blendEquations.max = GL_MAX_EXT
  }

  // Test blend equations
  t.equals(blendEquations.add, gl.FUNC_ADD, 'func add')
  t.equals(blendEquations.subtract, gl.FUNC_SUBTRACT, 'func subtract')
  t.equals(blendEquations['reverse subtract'], gl.FUNC_REVERSE_SUBTRACT, 'func reverse subtract')

  // Test blend funcs
  t.equals(blendFuncs['0'], gl.ZERO, '0')
  t.equals(blendFuncs['zero'], gl.ZERO, '0')
  t.equals(blendFuncs['1'], gl.ONE, '1')
  t.equals(blendFuncs['one'], gl.ONE, '1')
  t.equals(blendFuncs['src color'], gl.SRC_COLOR, 'src color')
  t.equals(blendFuncs['one minus src color'], gl.ONE_MINUS_SRC_COLOR, '1-src rgb')
  t.equals(blendFuncs['dst color'], gl.DST_COLOR, 'dst color')
  t.equals(blendFuncs['one minus dst color'], gl.ONE_MINUS_DST_COLOR, '1-dst rgb')
  t.equals(blendFuncs['src alpha'], gl.SRC_ALPHA, 'alpha')
  t.equals(blendFuncs['one minus src alpha'], gl.ONE_MINUS_SRC_ALPHA, '1-src alpha')
  t.equals(blendFuncs['dst alpha'], gl.DST_ALPHA, 'dst alpha')
  t.equals(blendFuncs['one minus dst alpha'], gl.ONE_MINUS_DST_ALPHA, '1-dst alpha')
  t.equals(blendFuncs['constant color'], gl.CONSTANT_COLOR, 'constant color')
  t.equals(blendFuncs['one minus constant color'], gl.ONE_MINUS_CONSTANT_COLOR, '1-constant rgb')
  t.equals(blendFuncs['constant alpha'], gl.CONSTANT_ALPHA, 'alpha')
  t.equals(blendFuncs['one minus constant alpha'], gl.ONE_MINUS_CONSTANT_ALPHA, '1-alpha')
  t.equals(blendFuncs['src alpha saturate'], gl.SRC_ALPHA_SATURATE, 'alpha saturate')

  function testFlags (prefix, flags) {
    // enable
    t.equals(
      gl.getParameter(gl.BLEND),
      flags.enable,
      prefix + ' blend mode')
    // color
    t.same(
      [].slice.call(gl.getParameter(gl.BLEND_COLOR)),
      flags.color,
      prefix + ' blend color')
    // equation
    t.same(
      gl.getParameter(gl.BLEND_EQUATION_RGB),
      blendEquations[flags.equation.rgb],
      prefix + ' blend equation rgb')
    t.same(
      gl.getParameter(gl.BLEND_EQUATION_ALPHA),
      blendEquations[flags.equation.alpha],
      prefix + ' blend equation alpha')
    t.same(
      gl.getParameter(gl.BLEND_SRC_RGB),
      blendFuncs[flags.func.srcRGB || flags.func.src],
      prefix + ' blend func srcRGB')
    t.same(
      gl.getParameter(gl.BLEND_SRC_ALPHA),
      blendFuncs[flags.func.srcAlpha || flags.func.src],
      prefix + ' blend func srcAlpha')
    t.same(
      gl.getParameter(gl.BLEND_DST_RGB),
      blendFuncs[flags.func.dstRGB || flags.func.dst],
      prefix + ' blend func dstRGB')
    t.same(
      gl.getParameter(gl.BLEND_DST_ALPHA),
      blendFuncs[flags.func.dstAlpha || flags.func.dst],
      prefix + ' blend func dstAlpha')
  }

  var staticOptions = {
    frag: [
      'precision mediump float;',
      'uniform vec4 color;',
      'void main() {',
      '  gl_FragColor = vec4(1, 0, 0, 1);',
      '}'
    ].join('\n'),

    vert: [
      'precision mediump float;',
      'attribute vec2 position;',
      'void main() {',
      '  gl_Position = vec4(position, 0, 1);',
      '}'
    ].join('\n'),

    attributes: {
      position: regl.buffer([
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [1, 0],
        [1, 1]
      ])
    },

    count: 6
  }

  var dynamicDraw = regl(extend({
    blend: {
      enable: regl.prop('enable'),
      color: regl.prop('color'),
      equation: regl.prop('equation'),
      func: regl.prop('func')
    }
  }, staticOptions))

  var permutations = [
    {
      enable: true,
      color: [0, 1, 0, 1],
      equation: {
        rgb: 'add',
        alpha: 'subtract'
      },
      func: {
        srcRGB: '0',
        srcAlpha: '1',
        dstRGB: 'zero',
        dstAlpha: 'one'
      }
    },
    {
      enable: false,
      color: [1, 0, 1, 0],
      equation: {
        rgb: 'reverse subtract',
        alpha: 'add'
      },
      func: {
        srcRGB: 'constant alpha',
        srcAlpha: 'one minus src color',
        dstRGB: 'src alpha',
        dstAlpha: 'one minus src alpha'
      }
    },
    {
      enable: false,
      color: [1, 0, 1, 0],
      equation: {
        rgb: 'reverse subtract',
        alpha: 'add'
      },
      func: {
        srcRGB: 'dst color',
        srcAlpha: 'one minus dst color',
        dstRGB: 'dst alpha',
        dstAlpha: 'one minus dst alpha'
      }
    },
    {
      enable: false,
      color: [1, 0, 1, 0],
      equation: {
        rgb: 'reverse subtract',
        alpha: 'add'
      },
      func: {
        srcRGB: '0',
        srcAlpha: 'one minus constant color',
        dstRGB: '1',
        dstAlpha: '1'
      }
    },
    {
      enable: false,
      color: [1, 0, 1, 0],
      equation: {
        rgb: 'reverse subtract',
        alpha: 'add'
      },
      func: {
        srcRGB: '0',
        srcAlpha: '1',
        dstRGB: '1',
        dstAlpha: 'one minus constant alpha'
      }
    },
    {
      enable: false,
      color: [1, 0, 1, 0],
      equation: {
        rgb: 'reverse subtract',
        alpha: 'add'
      },
      func: {
        srcRGB: 'src alpha saturate',
        srcAlpha: 'constant color',
        dstRGB: 'src color',
        dstAlpha: '0'
      }
    }
  ]

  if (regl.hasExtension('ext_blend_minmax')) {
    permutations.push({
      enable: true,
      color: [0, 1, 0, 1],
      equation: {
        rgb: 'max',
        alpha: 'min'
      },
      func: {
        srcRGB: '0',
        srcAlpha: '1',
        dstRGB: 'src color',
        dstAlpha: 'one minus src alpha'
      }
    })
  }

  permutations.forEach(function (params, i) {
    dynamicDraw(params)
    testFlags('dynamic 1-shot - #' + i + ' - ', params)
  })

  permutations.forEach(function (params, i) {
    dynamicDraw([params])
    testFlags('batch - #' + i + ' - ', params)
  })

  permutations.forEach(function (params, i) {
    var staticDraw = regl(extend({
      blend: params
    }, staticOptions))
    staticDraw()
    testFlags('static - #' + i + ' - ', params)
  })

  // make sure nested dynamic properties work:

  var nestedDynamicDraw = regl(extend({
    blend: {
      enable: regl.prop('enable'),
      color: regl.prop('color'),
      equation: {
        rgb: regl.prop('equation.rgb'),
        alpha: regl.prop('equation.alpha')
      },
      func: {
        srcRGB: regl.prop('func.srcRGB'),
        srcAlpha: regl.prop('func.srcAlpha'),
        dstRGB: regl.prop('func.dstRGB'),
        dstAlpha: regl.prop('func.dstAlpha')
      }
    }
  }, staticOptions))

  permutations.forEach(function (params, i) {
    nestedDynamicDraw(params)
    testFlags('nested, dynamic 1-shot - #' + i + ' - ', params)
  })

  permutations.forEach(function (params, i) {
    nestedDynamicDraw([params])
    testFlags('nested, batch - #' + i + ' - ', params)
  })

  // make sure that it throws for invalid blend factor combinations.

  var badTestcases = []

  invalidBlendCombinations.forEach(function (combination, i) {
    var params = {
      enable: false,
      color: [1, 0, 1, 0],
      equation: {
        rgb: 'reverse subtract',
        alpha: 'add'
      },
      func: {
        srcRGB: combination[0],
        srcAlpha: 'one minus src color',
        dstRGB: combination[1],
        dstAlpha: 'one minus src alpha'
      }
    }
    badTestcases.push(params)
  })

  invalidBlendCombinations.forEach(function (combination, i) {
    var params = {
      enable: false,
      color: [1, 0, 1, 0],
      equation: {
        rgb: 'reverse subtract',
        alpha: 'add'
      },
      func: {
        src: combination[0],
        dst: combination[1]
      }
    }
    badTestcases.push(params)
  })

  badTestcases.forEach(function (params, i) {
    t.throws(function () {
      dynamicDraw(params)
    }, /\(regl\)/, 'throws on invalid combination, dynamic 1-shot - #' + i)
  })

  badTestcases.forEach(function (params, i) {
    t.throws(function () {
      dynamicDraw([params])
    }, /\(regl\)/, 'throws on invalid combination, batch - #' + i)
  })

  badTestcases.forEach(function (params, i) {
    t.throws(function () {
      regl(extend({
        blend: params
      }, staticOptions))
    }, /\(regl\)/, 'throws on invalid combination, static - #' + i)
  })

  regl.destroy()
  t.equals(gl.getError(), 0, 'error ok')
  createContext.destroy(gl)
  t.end()
})
