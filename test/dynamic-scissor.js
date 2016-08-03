var tape = require('tape')
var createREGL = require('../regl')
var createContext = require('./util/create-context')

tape('dynamic scissor bug', function (t) {
  var gl = createContext(8, 8)
  var regl = createREGL(gl)

  var command = regl({
    context: {
      height: 4
    },
    frag: [
      'void main () {',
      '  gl_FragColor = vec4(1, 1, 1, 1);',
      '}'
    ].join('\n'),
    vert: [
      'precision highp float;',
      'attribute vec2 position;',
      'void main () {',
      '  gl_Position = vec4(position, 0, 1);',
      '}'
    ].join('\n'),
    attributes: {
      position: [
        -4, 0,
        4, -4,
        4, 4
      ]
    },
    count: 3,
    primitive: 'triangles',
    scissor: {
      enable: true,
      box: {
        x: function () {
          return 1
        },
        y: regl.this('y'),
        width: regl.prop('width'),
        height: regl.context('height')
      }
    }
  })

  regl.clear({
    color: [0, 0, 0, 0],
    depth: 1
  })
  command.call({
    y: 2
  }, { width: 3 })

  var pixels = regl.read()
  var expected = []
  var actual = []
  for (var j = 0; j < 8; ++j) {
    for (var i = 0; i < 8; ++i) {
      if (i > 0 && i < 4 && j > 1 && j < 6) {
        expected.push('*')
      } else {
        expected.push('_')
      }
      actual.push(pixels[4 * (8 * j + i)] ? '*' : '_')
    }
    actual.push('\n')
    expected.push('\n')
  }
  t.equals(actual.join(''), expected.join(''), 'scissor set correctly')

  regl.destroy()
  t.equals(gl.getError(), 0, 'no error code set')
  createContext.destroy(gl)

  t.end()
})
