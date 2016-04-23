var regl = require('../regl')()

regl.clear({
  color: [1, 0, 0, 1]
})

var drawTriangle = regl({
  frag: `
    void main() {
      gl_FragColor = vec4(0, 0, 1, 1);
    }`,

  vert: `
    attribute vec4 position;
    void main() {
      gl_Position = position;
    }`,

  attributes: {
    position: regl.buffer([
      [2, 2, 0, 1],
      [2, -2, 0, 1],
      [-2, -2, 0, 1]
    ])
  },

  count: 3
})

drawTriangle()
