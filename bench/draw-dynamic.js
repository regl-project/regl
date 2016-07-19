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
      'void main() {',
      '  gl_Position = vec4(',
      '    cos(angle) * position.x + sin(angle) * position.y,',
      '    -sin(angle) * position.x + cos(angle) * position.y, 0, 1);',
      '}'
    ].join('\n'),

    attributes: {
      position: regl.buffer([
        -1, 0,
        0, -1,
        1, 1])
    },

    uniforms: {
      color: regl.prop('color'),
      angle: function ({tick}) {
        return 0.01 * tick
      }
    },
    depth: {
      enable: false
    },
    count: 3
  })

  var x = 0
  return function () {
    draw({
      color: [
        Math.sin(0.001 * x),
        Math.cos(0.02 * x),
        Math.sin(0.3 * x),
        1
      ]
    })
    x += 1
  }
}
