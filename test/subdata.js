var tape = require('tape')
var createContext = require('./util/create-context')
var createREGL = require('../regl')

tape('subdata', function (t) {
  var gl = createContext(5, 5)
  var regl = createREGL(gl)

  var frag = [
    'precision mediump float;',
    'void main() {',
    'gl_FragColor = vec4(1, 1, 1, 1);',
    '}'
  ].join('\n')

  var vert = [
    'precision mediump float;',
    'attribute vec2 position;',
    'varying vec4 fragColor;',
    'void main() {',
    'gl_Position=vec4(2.0 * (position + 0.5) / 5.0 - 1.0, 0, 1);',
    '}'
  ].join('\n')

  function checkPixels (expected) {
    var actual = regl.read()
    for (var i = 0; i < 5 * 5; ++i) {
      if (!!expected[i] !== !!actual[4 * i]) {
        return false
      }
    }
    return true
  }

  var buffer = regl.buffer([
    0, 0,
    1, 1,
    2, 0,
    3, 2,
    4, 4
  ])

  var elements = regl.elements({
    data: [0, 1, 2, 3, 4],
    usage: 'dynamic',
    primitive: 'points',
    type: 'uint8',
    count: 5
  })

  var command = regl({
    vert: vert,
    frag: frag,
    attributes: {
      position: buffer
    },
    elements: elements
  })

  function runTest (expected, name) {
    regl.clear({
      color: [0, 0, 0, 0],
      depth: 1
    })

    command()
    t.ok(checkPixels(expected), name)
  }

  runTest([
    1, 0, 1, 0, 0,
    0, 1, 0, 0, 0,
    0, 0, 0, 1, 0,
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 1
  ], 'simple')

  buffer.subdata([
    2, 2,
    3, 4
  ])

  runTest([
    0, 0, 1, 0, 0,
    0, 0, 0, 0, 0,
    0, 0, 1, 1, 0,
    0, 0, 0, 0, 0,
    0, 0, 0, 1, 1
  ], 'after buffer.subdata')

  elements.subdata(new Uint8Array([ 0, 3, 2, 2, 2 ]))

  runTest([
    0, 0, 1, 0, 0,
    0, 0, 0, 0, 0,
    0, 0, 1, 1, 0,
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0
  ], 'after elements.subdata')

  // reset buffers using typedarrays
  buffer([
    new Float32Array([0, 0]),
    new Float32Array([1, 1]),
    new Float32Array([2, 0]),
    new Float32Array([3, 2]),
    new Float32Array([4, 4])
  ])

  // reset elements
  elements({
    data: [
      new Uint8Array([0]),
      new Uint8Array([1]),
      new Uint8Array([2]),
      new Uint8Array([3]),
      new Uint8Array([4])
    ],
    usage: 'dynamic'
  })

  runTest([
    1, 0, 1, 0, 0,
    0, 1, 0, 0, 0,
    0, 0, 0, 1, 0,
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 1
  ], 'reset using nested typedarrays')

  buffer.subdata([
    new Float32Array([2, 2])
  ])

  runTest([
    0, 0, 1, 0, 0,
    0, 1, 0, 0, 0,
    0, 0, 1, 1, 0,
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 1
  ], 'using subdata nested typedarrays')

  regl.destroy()
  t.equals(gl.getError(), 0, 'error ok')
  createContext.destroy(gl)
  t.end()
})
