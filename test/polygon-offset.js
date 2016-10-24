var extend = require('../lib/util/extend')
var createContext = require('./util/create-context')
var createREGL = require('../regl')
var tape = require('tape')

tape('polygon offset', function (t) {
  var gl = createContext(16, 16)
  var regl = createREGL(gl)

  function testFlags (prefix, flags) {
    t.equals(gl.getParameter(gl.POLYGON_OFFSET_FILL), flags.enable, prefix + ' enable')

    function approx (pname, str) {
      t.ok(Math.abs(gl.getParameter(pname) - flags.offset[str]) <= 1 / 65536,
        prefix + ' offset.' + str)
    }

    approx(gl.POLYGON_OFFSET_FACTOR, 'factor')
    approx(gl.POLYGON_OFFSET_UNITS, 'units')
  }

  var permutations = [
    {
      enable: true,
      offset: {
        factor: 0,
        units: 1
      }
    },
    {
      enable: false,
      offset: {
        factor: 1,
        units: 2
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
    polygonOffset: {
      enable: regl.prop('enable'),
      offset: regl.prop('offset')
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
      polygonOffset: params
    }, staticOptions))
    staticDraw()
    testFlags('static #' + i + ' - ', params)
  })

  var nestedDynamicDraw = regl(extend({
    polygonOffset: {
      enable: regl.prop('enable'),
      offset: {
        factor: regl.prop('offset.factor'),
        units: regl.prop('offset.units')
      }
    }
  }, staticOptions))

  permutations.forEach(function (params, i) {
    nestedDynamicDraw(params)
    testFlags('nested dynamic 1-shot #' + i + ' - ', params)
  })

  permutations.forEach(function (params, i) {
    nestedDynamicDraw([params])
    testFlags('nested batch #' + i + ' - ', params)
  })

  regl.destroy()
  t.equals(gl.getError(), 0, 'error ok')
  createContext.destroy(gl)
  t.end()
})
