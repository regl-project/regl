var regl = require('../regl')()

var draw = regl({
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
    'uniform float angle;',
    'uniform vec2 offset;',
    'void main() {',
    '  gl_Position = vec4(',
    '    cos(angle) * position.x + sin(angle) * position.y + offset.x,',
    '    -sin(angle) * position.x + cos(angle) * position.y + offset.y, 0, 1);',
    '}'
  ].join('\n'),

  attributes: {
    position: regl.buffer([
      0.5, 0,
      0, 0.5,
      1, 1])
  },

  uniforms: {
    color: function (frame, batchId) {
      return [
        Math.sin((0.1 + Math.sin(batchId)) * frame + 3.0 * batchId),
        Math.cos(0.02 * frame + 0.1 * batchId),
        Math.sin((0.3 + Math.cos(2.0 * batchId)) * frame + 0.8 * batchId),
        1
      ]
    },
    angle: function (frame) {
      return 0.01 * frame
    },
    offset: regl.prop('offset')
  },

  depthTest: false,

  count: 3
}).batch

regl.frame(function (count) {
  regl.clear({
    color: [0, 0, 0, 1]
  })

  draw([
    { offset: [0, 0] },
    { offset: [-1, 0] },
    { offset: [0, -1] },
    { offset: [-1, -1] }
  ])
})
