var tape = require('tape')
var createContext = require('./util/create-context')
var createREGL = require('../regl')

tape('dynamic elements', function (t) {
  var gl = createContext(5, 5)
  var regl = createREGL(gl)

  var command = regl({
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
      'gl_Position=vec4(2.0 * (position + 0.5) / 5.0 - 1.0, 0, 1);',
      '}'
    ].join('\n'),

    attributes: {
      position: regl.prop('position')
    },

    elements: regl.prop('elements'),

    depth: {enable: false, mask: false}
  })

  function checkPixmap (args, expected, remark) {
    regl.clear({
      color: [0, 0, 0, 0]
    })
    command(args)
    var pixels = regl.read()
    var actual = new Array(25)
    for (var i = 0; i < 25; ++i) {
      actual[i] = Math.min(pixels[4 * i], 1)
    }
    t.same(actual, expected, remark)
  }

  checkPixmap({
    position: regl.buffer([2, 2]),
    elements: regl.elements([[0]])
  }, [
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0,
    0, 0, 1, 0, 0,
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0
  ], 'point dynamic')

  checkPixmap([{
    position: regl.buffer([2, 2]),
    elements: regl.elements([[0]])
  },
  {
    position: regl.buffer([4, 0, 0, 4, 4, 5]),
    elements: regl.elements([[0, 2]])
  }], [
    0, 0, 0, 0, 1,
    0, 0, 0, 0, 1,
    0, 0, 1, 0, 1,
    0, 0, 0, 0, 1,
    0, 0, 0, 0, 1
  ], 'line and point')

  // TODO test overloading element parameters for count, offset and instances

  regl.destroy()
  t.equals(gl.getError(), 0, 'error ok')
  createContext.destroy(gl)
  t.end()
})
