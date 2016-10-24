var createContext = require('./util/create-context')
var createREGL = require('../regl')
var tape = require('tape')

const RESOLUTION = 8

tape('glsl projection-line test', function (t) {
  var gl = createContext(RESOLUTION, RESOLUTION)
  var regl = createREGL(gl)

  const setLine = regl({
    frag: [
      'void main () {',
      '  gl_FragColor = vec4(1, 1, 1, 1);',
      '}'
    ].join('\n'),
    vert: function (context, props) {
      return [
        'precision ' + props.precision + ' float;',
        'attribute vec2 p;',
        'void main () {',
        '  vec2 pixel = p;',
        '  vec2 clip = 0.25 * (pixel - 3.5);',
        '  gl_Position = vec4(clip, 0, 1);',
        '}'
      ].join('\n')
    },
    attributes: { p: regl.prop('line') },
    count: 2,
    primitive: 'lines'
  })

  function testLine (precision, start, end) {
    regl.clear({
      color: [0, 0, 0, 0],
      depth: 1
    })
    setLine([{
      precision: precision,
      line: [start, end]
    }, {
      precision: precision,
      line: [end, start]
    }])
    const data = regl.read()
    const expected = []
    const actual = []
    for (var y = 0; y < RESOLUTION; ++y) {
      for (var x = 0; x < RESOLUTION; ++x) {
        var offset = 4 * (x + y * RESOLUTION)
        if (
          Math.min(start[0], end[0]) <= x && x <= Math.max(start[0], end[0]) &&
          Math.min(start[1], end[1]) <= y && y <= Math.max(start[1], end[1])) {
          expected.push(1)
        } else {
          expected.push(0)
        }
        actual.push((!!data[offset]) | 0)
      }
      actual.push('\n')
      expected.push('\n')
    }
    t.equals(actual.join(''), expected.join(''),
      'line ' + precision + ' @ ' + start.join() + ' - ' + end.join())
  }

  ;['lowp', 'mediump', 'highp'].forEach(function (precision) {
    for (var i = 0; i < RESOLUTION; ++i) {
      for (var j = 0; j < RESOLUTION; ++j) {
        for (var k = 0; k < RESOLUTION; ++k) {
          if (j !== k) {
            testLine(precision, [i, j], [i, k])
            testLine(precision, [j, i], [k, i])
          }
        }
      }
    }
  })

  regl.destroy()
  t.equals(gl.getError(), 0, 'error ok')
  createContext.destroy(gl)

  t.end()
})
