var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('drawing', function (t) {
  var gl = createContext(8, 8)
  var regl = createREGL(gl)

  function checkPixmap (args, expected, remark) {
    var base = {
      frag: [
        'precision mediump float;',
        'void main() {',
        'gl_FragColor = vec4(1, 1, 1, 1);',
        '}'
      ].join('\n'),

      vert: [
        'precision mediump float;',
        'attribute vec2 position;',
        'varying vec4 fragColor;',
        'void main() {',
        'gl_Position=vec4(0.25 * (position - 3.5), 0, 1);',
        '}'
      ].join('\n'),

      attributes: {
        position: regl.buffer([0, 0, 4, 0, 4, 4, 0, 4])
      },

      depth: {enable: false, mask: false}
    }

    Object.keys(args).forEach(function (x) {
      base[x] = args[x]
    })

    function runCheck (suffix) {
      var pixels = regl.read()
      var actual = new Array(64)
      for (var i = 0; i < 64; ++i) {
        if (expected[i] === 2) {
          actual[i] = expected[i]
        } else {
          actual[i] = Math.min(1, pixels[4 * i])
        }
      }
      t.same(actual, expected, remark + ' - ' + suffix)
    }

    var command = regl(base)

    regl.clear({color: [0, 0, 0, 0]})
    command()
    runCheck('static')

    regl.clear({color: [0, 0, 0, 0]})
    command(1)
    runCheck('batch')

    regl.clear({color: [0, 0, 0, 0]})
    command(function () {
      regl.draw()
    })
    runCheck('scope')
  }

  // points
  checkPixmap({
    primitive: 'points',
    count: 4
  }, [
    1, 0, 0, 0, 1, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    1, 0, 0, 0, 1, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0
  ], 'point')

  // lines
  checkPixmap({
    primitive: 'lines',
    count: 2
  }, [
    1, 1, 1, 1, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0
  ], 'line')

  // line strip
  checkPixmap({
    primitive: 'line strip',
    count: 3
  }, [
    1, 1, 1, 1, 1, 0, 0, 0,
    0, 0, 0, 0, 1, 0, 0, 0,
    0, 0, 0, 0, 1, 0, 0, 0,
    0, 0, 0, 0, 1, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0
  ], 'line strip')

  // line loop
  checkPixmap({
    primitive: 'line loop',
    count: 4
  }, [
    1, 1, 1, 1, 1, 0, 0, 0,
    1, 0, 0, 0, 1, 0, 0, 0,
    1, 0, 0, 0, 1, 0, 0, 0,
    1, 0, 0, 0, 1, 0, 0, 0,
    1, 1, 1, 1, 1, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0
  ], 'line loop')

  // triangles
  checkPixmap({
    primitive: 'triangles',
    count: 3
  }, [
    2, 2, 2, 2, 2, 0, 0, 0,
    0, 2, 1, 1, 2, 0, 0, 0,
    0, 0, 2, 1, 2, 0, 0, 0,
    0, 0, 0, 2, 2, 0, 0, 0,
    0, 0, 0, 0, 2, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0
  ], 'triangles')

  // triangle strip
  checkPixmap({
    primitive: 'triangle strip',
    count: 4
  }, [
    2, 2, 2, 2, 2, 0, 0, 0,
    0, 2, 1, 1, 2, 0, 0, 0,
    0, 0, 2, 1, 2, 0, 0, 0,
    0, 2, 1, 1, 2, 0, 0, 0,
    2, 2, 2, 2, 2, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0
  ], 'triangle strip')

  // triangle fan
  checkPixmap({
    primitive: 'triangle fan',
    count: 4
  }, [
    2, 2, 2, 2, 2, 0, 0, 0,
    2, 1, 1, 1, 2, 0, 0, 0,
    2, 1, 1, 1, 2, 0, 0, 0,
    2, 1, 1, 1, 2, 0, 0, 0,
    2, 2, 2, 2, 2, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0
  ], 'triangle fan')

  regl.destroy()
  t.equals(gl.getError(), 0, 'error ok')
  createContext.destroy(gl)
  t.end()
})
