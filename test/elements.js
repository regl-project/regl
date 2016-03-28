var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('elements', function (t) {
  var regl = createREGL(createContext(16, 16))

  regl.clear({
    color: [1, 0, 0, 1]
  })
/*
  var drawLine = regl({
    frag: [
      'void main() {',
      '  gl_FragColor = vec4(0, 0, 1, 1);',
      '}'
    ].join('\n'),

    vert: [
      'attribute vec4 position;',
      'void main() {',
      '  gl_Position = position;',
      '}'
    ].join('\n'),

    attributes: {
      position: regl.buffer([
        [-2, 0, 0, 1],
        [2, 0, 0, 1]
      ])
    },

    count: 2,

    primitive: 'lines'
  })
  */
/*
  drawLine()

  var pixels = regl.read()

  for (var i = 0; i < 16; ++i) {
    for (var j = 0; j < 16; ++j) {
      var ptr = 4 * (16 * i + j)
      t.equals(pixels[ptr], i !== 7 ? 255 : 0)
      t.equals(pixels[ptr + 1], 0)
      t.equals(pixels[ptr + 2], i !== 7 ? 0 : 255)
      t.equals(pixels[ptr + 3], 255)
    }
  }
*/

  t.end()
})
