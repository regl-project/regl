var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('elements', function (t) {
  var gl = createContext(7, 7)
  var regl = createREGL(gl)
  var elements = regl.elements([
    [0, 2],
    [1, 3]
  ])

  var drawStatic = regl({
    frag: [
      'precision mediump float;',
      'uniform vec4 color;',
      'void main() {',
      '  gl_FragColor = color;',
      '}'
    ].join('\n'),

    vert: [
      'attribute vec2 position;',
      'void main() {',
      '  gl_Position = vec4(position, 0, 1);',
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

    depth: {enable: false},

    elements: elements,

    uniforms: {
      color: regl.prop('c')
    }
  })

  var drawDynamic = regl({
    frag: [
      'precision mediump float;',
      'void main() {',
      '  gl_FragColor = vec4(0, 0, 1, 1);',
      '}'
    ].join('\n'),

    vert: [
      'attribute vec2 position;',
      'void main() {',
      '  gl_Position = vec4(position, 0, 1);',
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

    depth: {enable: false},

    elements: regl.prop('elements')
  })

  function testImage (cb, msg) {
    var i
    var j
    var pixels = regl.read()
    var expected = []

    function expect (r, g, b, a) {
      var ptr = 4 * (7 * i + j)
      var ir = pixels[ptr]
      var ig = pixels[ptr + 1]
      var ib = pixels[ptr + 2]
      var ia = pixels[ptr + 3]

      if (ir !== r || ig !== g || ib !== b || ia !== a) {
        expected.push(
          'expected [' + [r, g, b, a] + '], got [' + [ir, ig, ib, ia] + '] @ (' + [i, j] + ')')
      }
    }

    for (i = 0; i < 7; ++i) {
      for (j = 0; j < 7; ++j) {
        cb(i, j, expect)
      }
    }

    t.equals(expected.join('; '), '', msg)
  }

  function testPlus (msg) {
    testImage(function (i, j, expect) {
      if (i === 3 || j === 3) {
        expect(0, 0, 255, 255)
      } else {
        expect(255, 0, 0, 255)
      }
    }, msg + ' (should be +)')
  }

  function testBar (msg) {
    testImage(function (i, j, expect) {
      if (i === 3) {
        expect(0, 0, 255, 255)
      } else {
        expect(255, 0, 0, 255)
      }
    }, msg + ' (should be -)')
  }

  var cases = [
    function () {
      regl.clear({ color: [1, 0, 0, 1] })
      drawStatic({c: [0, 0, 1, 1]})
      testPlus('draw - static')
    },
    function () {
      regl.clear({ color: [1, 0, 0, 1] })
      drawStatic([{c: [0, 0, 1, 1]}])
      testPlus('batch - static')
    },
    function () {
      regl.clear({ color: [1, 0, 0, 1] })
      drawDynamic({elements: elements})
      testPlus('draw - dynamic')
    },
    function () {
      regl.clear({ color: [1, 0, 0, 1] })
      drawDynamic([{elements: elements}])
      testPlus('batch - dynamic')
    },
    function () {
      // try updating elements
      elements([
        [0, 2]
      ])
      t.ok('updated elements')
    },
    function () {
      regl.clear({ color: [1, 0, 0, 1] })
      drawStatic({c: [0, 0, 1, 1]})
      testBar('draw - static')
    },
    function () {
      regl.clear({ color: [1, 0, 0, 1] })
      drawDynamic({elements: elements})
      testBar('draw - dynamic')
    },
    function () {
      regl.clear({ color: [1, 0, 0, 1] })
      drawDynamic([{elements: elements}])
      testBar('draw - dynamic')
    },
    function () {
      // try destroying elements
      elements.destroy()
      regl.destroy()
      t.equals(gl.getError(), 0, 'error ok')
      createContext.destroy(gl)
      t.ok('destroy successful')
    }
  ]

  var poll = setInterval(function () {
    if (cases.length === 0) {
      clearInterval(poll)
      t.end()
    } else {
      (cases.shift())()
    }
  })
})
