var extend = require('../lib/util/extend')
var createContext = require('./util/create-context')
var createREGL = require('../regl')
var tape = require('tape')

tape('sample', function (t) {
  var gl = createContext(16, 16)
  var regl = createREGL(gl)

  function testFlags (prefix, flags) {
    function same (pname, value, str) {
      t.equals(gl.getParameter(pname), value, prefix + ' ' + str)
    }

    // getParameter doesn't support these values :(
    // same(gl.SAMPLE_COVERAGE, flags.enable, 'enable')
    // same(gl.SAMPLE_ALPHA_TO_COVERAGE, flags.alpha, 'alpha')
    same(gl.SAMPLE_COVERAGE_VALUE, flags.coverage.value, 'coverage.value')
    same(gl.SAMPLE_COVERAGE_INVERT, flags.coverage.invert, 'coverage.invert')
  }

  var permutations = [
    {
      enable: true,
      alpha: true,
      coverage: {
        value: 0.5,
        invert: true
      }
    },
    {
      enable: false,
      alpha: false,
      coverage: {
        value: 0,
        invert: false
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
    sample: {
      enable: regl.prop('enable'),
      alpha: regl.prop('alpha'),
      coverage: regl.prop('coverage')
    }
  }, staticOptions))

  permutations.forEach(function (params, i) {
    dynamicDraw(params)
    testFlags('dynamic 1-shot #' + i + ' - ', params)
  })

  permutations.forEach(function (params, i) {
    dynamicDraw([params])
    testFlags('batch #' + i + ' - ', params)
  })

  permutations.forEach(function (params, i) {
    var staticDraw = regl(extend({
      sample: params
    }, staticOptions))
    staticDraw()
    testFlags('static #' + i + ' - ', params)
  })

  // test nested dynamic properties.

  var nestedDynamicDraw = regl(extend({
    sample: {
      enable: regl.prop('enable'),
      alpha: regl.prop('alpha'),
      coverage: {
        value: regl.prop('coverage.value'),
        invert: regl.prop('coverage.invert')
      }
    }
  }, staticOptions))

  permutations.forEach(function (params, i) {
    nestedDynamicDraw(params)
    testFlags('dynamic 1-shot #' + i + ' - ', params)
  })

  permutations.forEach(function (params, i) {
    nestedDynamicDraw([params])
    testFlags('batch #' + i + ' - ', params)
  })

  regl.destroy()
  t.equals(gl.getError(), 0, 'error ok')
  createContext.destroy(gl)
  t.end()
})
