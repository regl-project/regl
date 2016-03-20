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

  count: 3
}).draw()
