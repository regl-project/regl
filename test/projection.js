var createContext = require('./util/create-context')
var createREGL = require('../regl')
var tape = require('tape')

const RESOLUTION = 8

tape('glsl projection test', function (t) {
  var gl = createContext(RESOLUTION, RESOLUTION)
  var regl = createREGL(gl)

  const setPixel = regl({
    frag: [
      'void main () {',
      '  gl_FragColor = vec4(1, 1, 1, 1);',
      '}'
    ].join('\n'),
    vert: function (context, props) {
      return [
        'precision ' + props.precision + ' float;',
        'attribute vec2 p;',
        'uniform vec2 offset;',
        'void main () {',
        '  vec2 pixel = p + offset;',
        '  vec2 clip = 0.25 * (pixel - 3.5);',
        '  gl_Position = vec4(clip, 0, 1);',
        '}'
      ].join('\n')
    },
    attributes: { p: [0, 0] },
    uniforms: {
      offset: regl.prop('point')
    },
    count: 1,
    primitive: 'points'
  })

  function testPixel (precision, point) {
    regl.clear({
      color: [0, 0, 0, 0],
      depth: 1
    })
    setPixel({
      precision: precision,
      point: point
    })
    const data = regl.read()
    const expected = []
    const actual = []
    for (var i = 0; i < RESOLUTION; ++i) {
      for (var j = 0; j < RESOLUTION; ++j) {
        var offset = 4 * (j + i * RESOLUTION)
        if (i === point[1] && j === point[0]) {
          expected.push(255)
        } else {
          expected.push(0)
        }
        actual.push(data[offset])
      }
      actual.push('\n')
      expected.push('\n')
    }
    t.equals(actual.join(''), expected.join(''),
      'pixel ' + precision + ' @ ' + point.join())
  }

  ;['lowp', 'mediump', 'highp'].forEach(function (precision) {
    for (var i = 0; i < RESOLUTION; ++i) {
      for (var j = 0; j < RESOLUTION; ++j) {
        testPixel(precision, [i, j])
      }
    }
  })

  regl.destroy()
  t.equals(gl.getError(), 0, 'error ok')
  createContext.destroy(gl)

  t.end()
})
