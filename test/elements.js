var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('elements', function (t) {
  var regl = createREGL(createContext(16, 16))
  var elements = regl.elements([
    [0, 2],
    [1, 3]
  ])

  var drawStatic = regl({
    frag: [
      'uniform vec4 color;',
      'void main() {',
      '  gl_FragColor = color;',
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
        [-2, 0],
        [0, -2],
        [2, 0],
        [0, 2]
      ])
    },

    elements: elements,

    uniforms: {
      color: regl.prop('c')
    }
  })

  var drawDynamic = regl({
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
        [-2, 0],
        [0, -2],
        [2, 0],
        [0, 2]
      ])
    },

    elements: regl.prop('elements')
  })

  function testPlus (msg) {
    var pixels = regl.read()
    for (var i = 0; i < 16; ++i) {
      for (var j = 0; j < 16; ++j) {
        var ptr = 4 * (16 * i + j)
        var hit = i === 7 || j === 7
        t.equals(pixels[ptr], hit ? 0 : 255, msg)
        t.equals(pixels[ptr + 1], 0, msg)
        t.equals(pixels[ptr + 2], hit ? 255 : 0, msg)
        t.equals(pixels[ptr + 3], 255, msg)
      }
    }
  }

  function testBar (msg) {
    var pixels = regl.read()
    for (var i = 0; i < 16; ++i) {
      for (var j = 0; j < 16; ++j) {
        var ptr = 4 * (16 * i + j)
        var hit = i === 7
        t.equals(pixels[ptr], hit ? 0 : 255, msg)
        t.equals(pixels[ptr + 1], 0, msg)
        t.equals(pixels[ptr + 2], hit ? 255 : 0, msg)
        t.equals(pixels[ptr + 3], 255, msg)
      }
    }
  }

  regl.clear({ color: [1, 0, 0, 1] })
  drawStatic({c: [0, 0, 1, 1]})
  testPlus('draw - static')

  regl.clear({ color: [1, 0, 0, 1] })
  drawStatic.batch([{c: [0, 0, 0, 1]}])
  testPlus('batch - static')

  regl.clear({ color: [1, 0, 0, 1] })
  drawDynamic({elements: elements})
  testPlus('draw - dynamic')

  regl.clear({ color: [1, 0, 0, 1] })
  drawDynamic.batch([{elements: elements}])
  testPlus('batch - dynamic')

  // try updating elements
  elements([
    [0, 2]
  ])

  drawStatic({c: [0, 0, 1, 1]})
  testBar()

  drawDynamic({elements: elements})
  testBar()

  // try destroying elements
  elements.destroy()

  t.end()
})
