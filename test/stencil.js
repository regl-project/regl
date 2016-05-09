var extend = require('../lib/util/extend')
var createContext = require('./util/create-context')
var createREGL = require('../regl')
var tape = require('tape')

var compareFuncs = {
  'never': 512,
  'less': 513,
  '<': 513,
  'equal': 514,
  '=': 514,
  '==': 514,
  '===': 514,
  'lequal': 515,
  '<=': 515,
  'greater': 516,
  '>': 516,
  'notequal': 517,
  '!=': 517,
  '!==': 517,
  'gequal': 518,
  '>=': 518,
  'always': 519
}

var stencilOps = {
  '0': 0,
  'zero': 0,
  'keep': 7680,
  'replace': 7681,
  'increment': 7682,
  'decrement': 7683,
  'increment wrap': 34055,
  'decrement wrap': 34056,
  'invert': 5386
}

tape('stencil', function (t) {
  var gl = createContext(16, 16)
  var regl = createREGL(gl)

  // Check stencil op codes
  t.equals(stencilOps[0], gl.ZERO, 'zero')
  t.equals(stencilOps.keep, gl.KEEP, 'keep')
  t.equals(stencilOps.replace, gl.REPLACE, 'replace')
  t.equals(stencilOps.increment, gl.INCR, 'increment')
  t.equals(stencilOps.decrement, gl.DECR, 'decrement')
  t.equals(stencilOps['increment wrap'], gl.INCR_WRAP, 'increment wrap')
  t.equals(stencilOps['decrement wrap'], gl.DECR_WRAP, 'decrement wrap')
  t.equals(stencilOps.invert, gl.INVERT, 'invert')

  // clearStencil
  for (var i = 0; i < 256; ++i) {
    regl.clear({
      stencil: i
    })
    t.equals(gl.getParameter(gl.STENCIL_CLEAR_VALUE), i, 'stencil clear ' + i)
  }

  function testFlags (prefix, flags) {
    function same (pname, value, str) {
      t.equals(gl.getParameter(pname), value, prefix + ' ' + str)
    }

    same(gl.STENCIL_TEST, flags.enable, 'enable')

    same(gl.STENCIL_FUNC, compareFuncs[flags.func.cmp], 'func.cmp')
    same(gl.STENCIL_REF, flags.func.ref, 'func.ref')
    same(gl.STENCIL_VALUE_MASK, flags.func.mask, 'func.mask')

    same(gl.STENCIL_WRITEMASK, flags.mask, 'mask')

    function sameOp (pname, name, face) {
      same(pname, stencilOps[flags[face][name]], face + '.' + name)
    }

    sameOp(gl.STENCIL_FAIL, 'fail', 'opFront')
    sameOp(gl.STENCIL_PASS_DEPTH_FAIL, 'zfail', 'opFront')
    sameOp(gl.STENCIL_PASS_DEPTH_PASS, 'pass', 'opFront')

    sameOp(gl.STENCIL_BACK_FAIL, 'fail', 'opBack')
    sameOp(gl.STENCIL_BACK_PASS_DEPTH_FAIL, 'zfail', 'opBack')
    sameOp(gl.STENCIL_BACK_PASS_DEPTH_PASS, 'pass', 'opBack')
  }

  var permutations = [
    {
      enable: true,
      func: {
        cmp: 'always',
        ref: 0,
        mask: 0xff
      },
      mask: 0xff,
      opFront: {
        fail: 'keep',
        zfail: 'keep',
        pass: 'keep'
      },
      opBack: {
        fail: 'keep',
        zfail: 'keep',
        pass: 'keep'
      }
    },
    {
      enable: false,
      func: {
        cmp: '>',
        ref: 10,
        mask: 0xff
      },
      mask: 0xf0,
      opFront: {
        fail: 'invert',
        zfail: 'increment',
        pass: 'increment wrap'
      },
      opBack: {
        fail: 'zero',
        zfail: 'decrement',
        pass: 'decrement wrap'
      }
    }
  ]

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
    stencil: {
      enable: regl.prop('enable'),
      func: regl.prop('func'),
      mask: regl.prop('mask'),
      opFront: regl.prop('opFront'),
      opBack: regl.prop('opBack')
    }
  }, staticOptions))

  permutations.forEach(function (params) {
    dynamicDraw(params)
    testFlags('dynamic 1-shot - ', params)
  })

  permutations.forEach(function (params) {
    dynamicDraw([params])
    testFlags('batch - ', params)
  })

  permutations.forEach(function (params) {
    var staticDraw = regl(extend({
      stencil: params
    }, staticOptions))
    staticDraw()
    testFlags('static - ', params)
  })

  regl.destroy()
  t.end()
})
