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
    vert: `
    precision highp float;
    attribute vec4 position;
    void main () {
      gl_Position = position;
    }
    `,

    frag: `
    void main () {
      gl_FragColor = vec4(1, 1, 1, 1);
    }
    `,

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
    [-4, 0, 0, 1],
    [4, -4, 0, 1],
    [4, 4, 0, 1]
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
