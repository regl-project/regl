
var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('instance', function (t) {
  var gl = createContext(6, 6)
  var regl = createREGL({gl: gl, extensions: ['ANGLE_instanced_arrays']})

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
        'attribute vec2 offset;',
        'varying vec4 fragColor;',
        'void main() {',
        'gl_Position=vec4(((position + offset) - 2.5) / 2.6, 0, 1);',
        '}'
      ].join('\n'),

      attributes: {
        position: regl.buffer([
          0, 0,
          4, 0,
          4, 4,
          0, 4]),
        offset: {
          buffer: regl.buffer([[0.0, 0.0], [0.05, 1.0]]),
          divisor: 2
        }
      },

      depth: {enable: false, mask: false},
      instances: 2
    }

    Object.keys(args).forEach(function (x) {
      base[x] = args[x]
    })

    function runCheck (suffix, divisor) {
      var pixels = regl.read()
      var actual = new Array(36)
      for (var i = 0; i < 36; ++i) {
        actual[i] = Math.min(1, pixels[4 * i])
      }
      t.same(actual, divisor === 2 ? expected.div2Expected : expected.div1Expected, remark + ' - ' + suffix)
    }

    //
    // Test when the offset-buffer is a static property.
    //
    var d
    var command
    for (d = 1; d <= 2; d++) {
      base.attributes.offset.divisor = d
      command = regl(base)
      regl.clear({color: [0, 0, 0, 0]})
      command()
      runCheck('static, divisor ' + d, d)
    }

    //
    // Test when the offset-buffer is a dynamic property.
    //
    for (d = 1; d <= 2; d++) {
      base.attributes.offset.divisor = d
      base.attributes.buffer = regl.prop('offsetBuffer')

      command = regl(base)
      regl.clear({color: [0, 0, 0, 0]})
      command({offsetBuffer: regl.buffer([[0.0, 0.0], [0.05, 1.0]])})
      runCheck('dynamic, divisor ' + d, d)
    }
  }

  // lines
  checkPixmap({
    primitive: 'lines',
    count: 2
  }, {
    div2Expected: [
      1, 1, 1, 1, 1, 0,
      0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0
    ],
    div1Expected: [
      1, 1, 1, 1, 1, 0,
      1, 1, 1, 1, 1, 0,
      0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0
    ]
  }, 'line')

  // triangles
  checkPixmap({
    primitive: 'triangles',
    count: 3
  }, {
    div2Expected: [
      1, 1, 1, 1, 1, 0,
      0, 1, 1, 1, 1, 0,
      0, 0, 1, 1, 1, 0,
      0, 0, 0, 1, 1, 0,
      0, 0, 0, 0, 1, 0,
      0, 0, 0, 0, 0, 0
    ],
    div1Expected: [
      1, 1, 1, 1, 1, 0,
      1, 1, 1, 1, 1, 0,
      0, 1, 1, 1, 1, 0,
      0, 0, 1, 1, 1, 0,
      0, 0, 0, 1, 1, 0,
      0, 0, 0, 0, 1, 0
    ]
  }, 'triangles')

  // TODO: testcases for 'points', 'line loop', 'triangle strip', and
  // 'triangle fan'

  regl.destroy()
  t.equals(gl.getError(), 0, 'error ok')
  createContext.destroy(gl)
  t.end()
})
