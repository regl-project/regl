var regl = require('../regl')()

var draw = regl({
  frag: `
    precision mediump float;
    uniform vec4 color;
    void main() {
      gl_FragColor = color;
    }`,

  vert: `
    precision mediump float;
    attribute vec2 position;
    uniform float angle;
    void main() {
      gl_Position = vec4(
        cos(angle) * position.x + sin(angle) * position.y,
        -sin(angle) * position.x + cos(angle) * position.y, 0, 1);
    }`,

  attributes: {
    position: regl.buffer([
      -1, 0,
      0, -1,
      1, 1])
  },

  uniforms: {
    color: regl.prop('color'),
    angle: function (args, batchId, stats) {
      return 0.01 * stats.count
    }
  },

  depth: {
    enable: false
  },

  count: 3
})

regl.frame(function (count) {
  regl.clear({
    color: [0, 0, 0, 1]
  })

  draw({
    color: [
      Math.sin(0.001 * count),
      Math.cos(0.02 * count),
      Math.sin(0.3 * count),
      1
    ]
  })
})
