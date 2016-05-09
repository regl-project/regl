var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

function find (array, pred) {
  for (var i = 0; i < array.length; ++i) {
    if (pred(array[i])) {
      return array[i]
    }
  }
}

tape('batch', function (t) {
  setTimeout(function () {
    var regl = createREGL(createContext(5, 5))

    var points = [
      [2, 2],
      [0, 2],
      [2, 0],
      [4, 2],
      [2, 4]
    ]

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

      depth: {enable: false},

      primitive: 'points'
    })

    var drawBatchCount = regl({
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
        offset: function (args, index) {
          var p = points[index]
          return [(p[0] + 0.5) / 2.25 - 1.0, (p[1] + 0.5) / 2.25 - 1.0]
        }
      },

      count: 1,

      depth: {enable: false},

      primitive: 'points'
    })

    function runTest () {
      var pixels = regl.read()

      for (var i = 0; i < 5; ++i) {
        for (var j = 0; j < 5; ++j) {
          var ptr = 4 * (5 * i + j)
          var hit = !!find(points, function (p) {
            return p[0] === i && p[1] === j
          })
          var actual = [
            pixels[ptr],
            pixels[ptr + 1],
            pixels[ptr + 2],
            pixels[ptr + 3]
          ]
          var expected = hit ? [0, 0, 255, 255] : [255, 0, 0, 255]
          t.same(actual, expected, (hit ? '*' : '_') + ' @ ' + [i, j])
        }
      }
    }

    drawBatch(points.map(function (p) {
      return {
        offset: [(p[0] + 0.5) / 2.25 - 1.0, (p[1] + 0.5) / 2.25 - 1.0]
      }
    }))
    runTest()

    drawBatchCount(points.length)
    runTest()

    regl.destroy()

    t.end()
  }, 120)
})
