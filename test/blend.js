var createContext = require('./util/create-context')
var createREGL = require('../regl')
var blendFuncs = require('../lib/constants/blendFuncs.json')
var blendEquations = require('../lib/constants/blendEquations.json')
var tape = require('tape')

tape('blend', function (t) {
  var gl = createContext(16, 16)
  var regl = createREGL(gl)

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

  var dynamicDraw = regl(Object.assign({
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
        dstRGB: 'src color',
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
        srcRGB: 'one minus src alpha',
        srcAlpha: 'zero',
        dstRGB: 'dst color',
        dstAlpha: 'one minus dst alpha'
      }
    }
  ]

  permutations.forEach(function (params) {
    dynamicDraw(params)
    testFlags('dynamic 1-shot - ', params)
  })

  permutations.forEach(function (params) {
    dynamicDraw([params])
    testFlags('batch - ', params)
  })

  permutations.forEach(function (params) {
    var staticDraw = regl(Object.assign({
      blend: params
    }, staticOptions))
    staticDraw()
    testFlags('static - ', params)
  })

  regl.destroy()
  t.end()
})
