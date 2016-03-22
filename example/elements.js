// This example is a simple demonstration of how to use regl.
// The default method exposed by the module wraps a canvas element
var regl = require('../regl')()

regl.clear({
  color: [0, 0, 0, 1],
  depth: 1
})

regl({
  frag: [
    'precision mediump float;',
    'uniform vec4 color;',
    'void main() {',
    '  gl_FragColor = color;',
    '}'
  ].join('\n'),

  vert: [
    'precision mediump float;',
    'attribute vec2 position;',
    'void main() {',
    '  gl_Position = vec4(position, 0, 1);',
    '}'
  ].join('\n'),

  attributes: {
    position: regl.buffer([
      -1, 0,
      0, -1,
      1, 1])
  },

  uniforms: {
    color: [1, 0, 0, 1]
  },

  elements: regl.elements([
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 4],
    [0, 5],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 1]
  ])
})()
