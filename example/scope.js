/*
  tags: basic

  <p>This examples demonstrates scopes</p>

 */

const regl = require('../regl')()

regl.clear({
  color: [0, 0, 0, 1],
  depth: 1
})

regl({
  frag: `
    precision mediump float;
    uniform vec4 color;
    void main() {
      gl_FragColor = color;
    }`,

  vert: `
    precision mediump float;
    attribute vec2 position;
    uniform vec2 offset;
    void main() {
      gl_Position = vec4(position + offset, 0, 1);
    }`,

  attributes: {
    position: [
      0.5, 0,
      0, 0.5,
      1, 1]
  },

  count: 3
})(() => {
  regl({
    uniforms: {
      color: [1, 0, 0, 1],
      offset: [0, 0]
    }
  })()

  regl({
    uniforms: {
      color: [0, 0, 1, 1],
      offset: [-1, 0]
    }
  })()

  regl({
    uniforms: {
      color: [0, 1, 0, 1],
      offset: [0, -1]
    }
  })()

  regl({
    uniforms: {
      color: [1, 1, 1, 1],
      offset: [-1, -1]
    }
  })()
})
