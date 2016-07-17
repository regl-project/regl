module.exports = function (regl) {
  var draw = regl({
    profile: false,
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
      position: regl.buffer([-1, 0, 0, -1, 1, 1])
    },

    uniforms: {
      color: function ({tick}, props, batchId) {
        return [
          Math.sin((0.1 + Math.sin(batchId)) * tick + 3.0 * batchId),
          Math.cos(0.02 * tick + 0.1 * batchId),
          Math.sin((0.3 + Math.cos(2.0 * batchId)) * tick + 0.8 * batchId),
          1
        ]
      },
      angle: function ({tick}) {
        return 0.01 * tick
      },
      offset: regl.prop('offset')
    },

    depth: {
      enable: false
    },

    count: 3
  })

  return function () {
    draw([
      { offset: [-1, 0] },
      { offset: [-1, 1] },
      { offset: [0, -1] },
      { offset: [0, 0] },
      { offset: [0, 1] },
      { offset: [1, -1] },
      { offset: [1, 0] },
      { offset: [1, 1] }
    ])
  }
}
