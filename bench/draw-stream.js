module.exports = function (regl) {
  var draw = regl({
    profile: false,
    frag: [
      'precision mediump float;',
      'void main() {',
      '  gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);',
      '}'
    ].join('\n'),

    vert: [
      'precision mediump float;',
      'attribute vec2 position;',
      'uniform float angle;',
      'void main() {',
      '  gl_Position = vec4(',
      '    cos(angle) * position.x + sin(angle) * position.y,',
      '    -sin(angle) * position.x + cos(angle) * position.y, 0, 1);',
      '}'
    ].join('\n'),

    attributes: {
      position: regl.prop('position')
    },

    uniforms: {
      angle: function ({tick}) {
        return 0.01 * tick
      }
    },
    depth: {
      enable: false
    },
    count: 3
  })

  return function () {
    draw({position: [-1, 0, 0, -1, 1, 1]})
  }
}
