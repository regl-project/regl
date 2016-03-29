var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('batch', function (t) {
  var regl = createREGL(createContext(16, 16))

  regl.clear({
    color: [1, 0, 0, 1]
  })

  var drawBatch = regl({
    frag: [
      'void main() {',
      '  gl_FragColor = vec4(0, 0, 1, 1);',
      '}'
    ].join('\n'),

    vert: [
      'attribute vec2 position;',
      'uniform vec2 offset;',
      'void main() {',
      '  gl_Position = vec4(position + offset, 0, 1);',
      '}'
    ].join('\n'),

    attributes: {
      position: regl.buffer([
        [0, 0]
      ])
    },

    uniforms: {
      offset: regl.prop('offset')
    },

    count: 1,

    primitive: 'points'
  }).batch

  var points = [
    [8, 8],
    [0, 8],
    [8, 0],
    [15, 8],
    [8, 15]
  ]

  drawBatch(points.map(function (p) {
    return {
      offset: [(p[0] + 1) / 8 - 1.0, (p[1] + 1) / 8 - 1.0]
    }
  }))

  var pixels = regl.read()

  for (var i = 0; i < 16; ++i) {
    for (var j = 0; j < 16; ++j) {
      var ptr = 4 * (16 * i + j)
      var hit = !!points.find(function (p) {
        return p[0] === i && p[1] === j
      })
      t.equals(pixels[ptr], hit ? 0 : 255, hit && 'hit')
      t.equals(pixels[ptr + 1], 0)
      t.equals(pixels[ptr + 2], hit ? 255 : 0, hit && '')
      t.equals(pixels[ptr + 3], 255)
    }
  }

  regl.destroy()

  t.end()
})
