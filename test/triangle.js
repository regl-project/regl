var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('triangle', function (t) {
  setTimeout(function () {
    var gl = createContext(16, 16)
    var regl = createREGL(gl)

    regl.clear({
      color: [1, 0, 0, 1],
      depth: 1
    })

    var drawTriangle = regl({
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
          [2, 2, 0, 1],
          [2, -2, 0, 1],
          [-2, -2, 0, 1]
        ])
      },

      count: 3
    })

    drawTriangle()

    var pixels = regl.read()

    for (var i = 0; i < 16; ++i) {
      for (var j = 0; j < 16; ++j) {
        var ptr = 4 * (16 * i + j)
        if (i !== j) {
          t.equals(pixels[ptr], i > j ? 255 : 0)
          t.equals(pixels[ptr + 1], 0)
          t.equals(pixels[ptr + 2], i > j ? 0 : 255)
          t.equals(pixels[ptr + 3], 255)
        }
      }
    }

    regl.destroy()
    t.equals(gl.getError(), 0, 'error ok')
    createContext.destroy(gl)
    t.end()
  }, 120)
})
