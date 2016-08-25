var createContext = require('./util/create-context')
var createREGL = require('../regl')
var tape = require('tape')

tape('elements update', function (t) {
  var gl = createContext(2, 2)
  var regl = createREGL(gl)

  regl.clear({
    color: [0, 0, 0, 0],
    depth: 1
  })

  const elements = regl.elements()

  const draw = regl({
    vert: [
      'precision highp float;',
      'attribute vec2 position;',
      'void main () {',
      '  gl_Position = vec4(position, 0, 1);',
      '}'
    ].join('\n'),

    frag: [
      'void main () {',
      '  gl_FragColor = vec4(1, 1, 1, 1);',
      '}'
    ].join('\n'),

    attributes: {
      position: [
        [-4, 0],
        [4, 4],
        [4, -4]
      ]
    },

    elements: elements
  })

  elements([
    [0, 1, 2]
  ])

  draw()

  t.same(
    Array.prototype.slice.call(regl.read()),
    [
      255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255
    ],
    'elements update ok')

  regl.destroy()
  t.equals(gl.getError(), 0, 'error ok')
  createContext.destroy(gl)
  t.end()
})
