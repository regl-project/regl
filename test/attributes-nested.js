var tape = require('tape')
var createContext = require('./util/create-context')
var createREGL = require('../regl')

tape('attributes nested', function (t) {
  var gl = createContext(5, 5)
  var regl = createREGL(gl)

  var FRAG = [
    'precision mediump float;',
    'void main() {',
    'gl_FragColor = vec4(1, 1, 1, 1);',
    '}'
  ].join('\n')

  var VERT = [
    'precision mediump float;',
    'attribute vec2 position;',
    'varying vec4 fragColor;',
    'void main() {',
    'gl_Position=vec4(2.0 * (position + 0.5) / 5.0 - 1.0, 0, 1);',
    '}'
  ].join('\n')

  var expected = [
    0, 1, 0, 1, 0,
    0, 0, 0, 0, 0,
    0, 0, 1, 0, 0,
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0
  ]

  var input = {
    buffer: regl.buffer(new Uint8Array([
      0, 0,
      1, 0,
      2, 0,
      3, 0,
      4, 0,
      2, 2
    ])),
    offset: 2,
    stride: 4
  }

  function checkPixels (expected) {
    var actual = regl.read()
    console.log('actual: ', actual)
    console.log('expected: ', expected)
    for (var i = 0; i < 5 * 5; ++i) {
      if (!!actual[4 * i] !== !!expected[i]) {
        console.log('fail at: ', i)
        return false
      }
    }
    return true
  }

  var nestedDynamicDraw = regl({
    frag: FRAG,
    vert: VERT,

    primitive: 'points',
    count: 3,
    depth: {enable: false},

    attributes: {
      position: {
        buffer: regl.prop('position.buffer'),
        offset: regl.prop('position.offset'),
        stride: regl.prop('position.stride')
      }
    }
  })

  var cmd = nestedDynamicDraw

  regl.clear({
    color: [0, 0, 0, 0]
  })

  cmd({position: input})
  t.ok(checkPixels(expected), 'dynamic 1-shot draw')

  regl.clear({
    color: [0, 0, 0, 0]
  })
  cmd([{ position: input }])
  t.ok(checkPixels(expected), 'batch')

  regl.destroy()
  t.equals(gl.getError(), 0, 'error ok')
  createContext.destroy(gl)
  t.end()
})
