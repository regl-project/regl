/*
  tags: basic

  <p>This example shows how you can draw vectorized text in regl.</p>

 */

const regl = require('../regl')()
const vectorizeText = require('vectorize-text')
const perspective = require('gl-mat4/perspective')
const lookAt = require('gl-mat4/lookAt')

const textMesh = vectorizeText('hello regl!', {
  textAlign: 'center',
  textBaseline: 'middle'
})

const feedBackTexture = regl.texture({
  copy: true,
  min: 'linear',
  mag: 'linear'
})

const drawFeedback = regl({
  frag: `
  precision mediump float;
  uniform sampler2D texture;
  uniform float t;
  varying vec2 uv;
  void main () {
    vec2 warp = uv + 0.01 * sin(t) * vec2(0.5 - uv.y, uv.x - 0.5)
      - 0.01 * (uv - 0.5);
    gl_FragColor = vec4(0.98 * texture2D(texture, warp).rgb, 1);
  }`,

  vert: `
  precision mediump float;
  attribute vec2 position;
  varying vec2 uv;
  void main () {
    uv = position;
    gl_Position = vec4(2.0 * position - 1.0, 0, 1);
  }`,

  attributes: {
    position: [-2, 0, 0, -2, 2, 2]
  },

  uniforms: {
    texture: feedBackTexture,
    t: ({tick}) => 0.001 * tick
  },

  depth: {enable: false},

  count: 3
})

const drawText = regl({
  frag: `
  precision mediump float;
  uniform float t;
  void main () {
    gl_FragColor = vec4(
      1.0 + cos(2.0 * t),
      1.0 + cos(2.1 * t + 1.0),
      1.0 + cos(2.2 * t + 2.0),
      1);
  }`,

  vert: `
  attribute vec2 position;
  uniform mat4 projection, view;
  void main () {
    gl_Position = projection * view * vec4(position, 0, 1);
  }`,

  attributes: {
    position: textMesh.positions
  },

  elements: textMesh.edges,

  uniforms: {
    t: ({tick}) => 0.01 * tick,

    view: ({tick}) => {
      const t = 0.01 * tick
      return lookAt([],
        [5 * Math.sin(t), 0, -5 * Math.cos(t)],
        [0, 0, 0],
        [0, -1, 0])
    },

    projection: ({viewportWidth, viewportHeight}) =>
      perspective([],
        Math.PI / 4,
        viewportWidth / viewportHeight,
        0.01,
        1000)
  },

  depth: {enable: false}
})

regl.frame(() => {
  drawFeedback()
  drawText()
  feedBackTexture({
    copy: true,
    min: 'linear',
    mag: 'linear'
  })
})
