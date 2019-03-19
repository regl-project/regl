/*
  tags: basic

  <p> This example shows how to pass props to draw commands </p>
*/

import REGL = require('../../regl')
const regl = REGL()

interface Uniforms {
  angle: number;
  color: REGL.Vec4;
}

interface Attributes {
  position: number[];
}

interface Props {
  color: REGL.Vec4;
}

const draw = regl<Uniforms, Attributes, Props>({
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
    color: regl.prop<Props, 'color'>('color'),
    angle: ({tick}) => 0.01 * tick
  },

  depth: {
    enable: false
  },

  scissor: {
    enable: true,
    box: ({ tick, viewportWidth, viewportHeight }) => {
      const SCISSOR_TIME = 500;
      const percent = (tick % SCISSOR_TIME) / SCISSOR_TIME;
      const scaleFactor = (percent >= 0.5 ? 1 - percent : percent) * 2.0;
      return {
        x: (viewportWidth / 2) * scaleFactor,
        y: (viewportHeight / 2) * scaleFactor,
        width: viewportWidth - viewportWidth * scaleFactor,
        height: viewportHeight - viewportHeight * scaleFactor
      };
    }
  },

  count: 3
})

regl.frame(({tick}) => {
  regl.clear({
    color: [0, 0, 0, 1]
  })

  draw({
    color: [
      Math.sin(0.02 * (0.001 * tick)),
      Math.cos(0.02 * (0.02 * tick)),
      Math.sin(0.02 * (0.3 * tick)),
      1
    ]
  })
})
