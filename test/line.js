var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('line', function (t) {
  setTimeout(function () {
    var gl = createContext(7, 7)
    var regl = createREGL(gl)

    regl.clear({
      color: [1, 0, 0, 1],
      depth: 1
    })

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

    drawLine()

    var pixels = regl.read()

    var got = []
    var expect = []

    for (var i = 0; i < 7; ++i) {
      var rowGot = []
      var rowExpect = []
      for (var j = 0; j < 7; ++j) {
        var ptr = 4 * (7 * i + j)
        if (i === 3) {
          rowExpect.push('*')
        } else {
          rowExpect.push(' ')
        }
        if (pixels[ptr] === 255 &&
            pixels[ptr + 1] === 0 &&
            pixels[ptr + 2] === 0 &&
            pixels[ptr + 3] === 255) {
          rowGot.push(' ')
        } else if (
            pixels[ptr] === 0 &&
            pixels[ptr + 1] === 0 &&
            pixels[ptr + 2] === 255 &&
            pixels[ptr + 3] === 255) {
          rowGot.push('*')
        } else {
          rowGot.push('?')
        }
      }
      got.push(rowGot.join(''))
      expect.push(rowExpect.join(''))
    }

    t.equals(got.join('\n'), expect.join('\n'), 'pixels equal')

    regl.destroy()
    t.equals(gl.getError(), 0, 'error ok')
    createContext.destroy(gl)
    t.end()
  }, 120)
})
