/*
  tags: basic

  <p> This example shows how to pass props to draw commands using the cursor position </p>
  <p> The cursor coordinates are already transformed into clip space coordinates, meaning the values goes from -1 to 1</p>
*/

const regl = require('../regl')()

const draw = regl({
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
    position: [
      -1, 0,
      0, -1,
      1, 1]
  },

  uniforms: {
    color: regl.prop('color'),
    angle: ({cursorX}) => Math.PI * cursorX
  },

  depth: {
    enable: false
  },

  count: 3
})

regl.frame(({tick, cursorY}) => {
  regl.clear({
    color: [0, 0, 0, 1]
  })

  draw({
    color: [
      (cursorY + 1)/2,
      0,
      1 - (cursorY + 1)/2,
      1
    ]
  })
})
