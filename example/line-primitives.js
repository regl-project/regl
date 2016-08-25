/*
  tags: basic, lines

  <p> This example demonstrates how to draw line loops and line strips . </p>
*/

const regl = require('../regl')()
var mat4 = require('gl-mat4')
var rng = require('seedrandom')('my_seed')

var globalState = regl({
  uniforms: {
    tick: ({tick}) => tick,
    projection: ({viewportWidth, viewportHeight}) =>
      mat4.perspective([],
                       Math.PI / 4,
                       viewportWidth / viewportHeight,
                       0.01,
                       1000),
    view: mat4.lookAt([], [2.1, 0, 1.3], [0, 0.0, 0], [0, 0, 1])
  },
  frag: `
  precision mediump float;
  uniform vec3 color;
  void main() {
    gl_FragColor = vec4(color, 1.0);
  }`,

  vert: `

  precision mediump float;
  attribute vec2 position;

  uniform mat4 projection, view;

  uniform float scale;
  uniform vec2 offset;
  uniform float tick;
  uniform float phase;
  uniform float freq;

  void main() {
    vec2 p  = position;

    // scale
    p *= scale;

    // rotate
    float phi = tick * freq + phase;
    p = vec2(
      dot(vec2(+cos(phi), -sin(phi)), p),
      dot(vec2(+sin(phi), +cos(phi)), p)
    );

    // translate
    p += offset;

    gl_Position = projection * view * vec4(p, 0, 1);
  }`
})

// make sure to respect system limitations.
var lineWidth = 3
if (lineWidth > regl.limits.lineWidthDims[1]) {
  lineWidth = regl.limits.lineWidthDims[1]
}

// this creates a drawCall that allows you to do draw single line primitive.
function createDrawCall (props) {
  return regl({
    attributes: {
      position: props.position
    },

    uniforms: {
      color: props.color,
      scale: props.scale,
      offset: props.offset,
      phase: props.phase,
      freq: props.freq
    },

    lineWidth: lineWidth,
    count: props.position.length,
    primitive: props.primitive
  })
}

var drawCalls = []
var i

//
// square
//
drawCalls.push(createDrawCall({
  color: [1, 0.1, 0.3],
  primitive: 'line loop',
  scale: 0.25,
  offset: [-0.7, 0.0],
  phase: 0.0,
  freq: 0.01,
  position: [[-1, -1], [+1, -1], [+1, +1], [-1, +1]]
}))

function makeCircle (N) { // where N is tesselation degree.
  return Array(N).fill().map((_, i) => {
    var phi = 2 * Math.PI * (i / N)
    return [Math.cos(phi), Math.sin(phi)]
  })
}

//
// triangle
//
drawCalls.push(createDrawCall({
  color: [0.2, 0.8, 0.3],
  primitive: 'line loop',
  scale: 0.25,
  offset: [-0.7, 0.7],
  phase: 0.8,
  freq: -0.014,
  position: makeCircle(3)
}))

//
// hexagon
//
drawCalls.push(createDrawCall({
  color: [0.7, 0.3, 0.9],
  primitive: 'line loop',
  scale: 0.25,
  offset: [0.0, 0.7],
  phase: 0.6,
  freq: 0.009,
  position: makeCircle(6)
}))

// star-shaped thingy
var N = 30
drawCalls.push(createDrawCall({
  color: [0.3, 0.6, 0.8],
  primitive: 'line loop',
  scale: 0.25,
  offset: [0.7, 0.7],
  phase: 0.6,
  freq: -0.011,
  position: Array(N).fill().map((_, i) => {
    var phi = 2 * Math.PI * (i / N)
    var A = 1.0 + 0.15 * Math.sin(phi * 70.0)
    return [A * Math.cos(phi), A * Math.sin(phi)]
  })
}))

// rock-like shape
N = 70
drawCalls.push(createDrawCall({
  color: [0.7, 0.8, 0.4],
  primitive: 'line loop',
  scale: 0.25,
  offset: [0.7, 0.0],
  phase: 0.6,
  freq: 0.012,
  position: Array(N).fill().map((_, i) => {
    var phi = 2 * Math.PI * (i / N)
    var A = 1.0 + 0.15 * rng()
    return [A * Math.cos(phi), A * Math.sin(phi)]
  })
}))

// draw a spiral.
N = 120
drawCalls.push(createDrawCall({
  color: [0.3, 0.8, 0.76],
  primitive: 'line strip',
  scale: 0.25,
  offset: [0.0, 0.0],
  phase: 0.6,
  freq: 0.015,
  position: Array(N).fill().map((_, i) => {
    var phi = 2 * Math.PI * (i / N)
    phi *= 5.0
    var A = 0.03
    return [A * (Math.cos(phi) + phi * Math.sin(phi)), A * (Math.sin(phi) - phi * Math.cos(phi))]
  })
}))

// make a rose curve.
// see the wikipedia article for more info:
// https://en.wikipedia.org/wiki/Rose_(mathematics)
N = 300
drawCalls.push(createDrawCall({
  color: [1.0, 1.0, 1.0],
  primitive: 'line strip',
  scale: 0.25,
  offset: [0.7, -0.6],
  phase: 0.6,
  freq: -0.011,
  position: Array(N).fill().map((_, i) => {
    var phi = 2 * Math.PI * (i / N)
    phi *= 5.0
    var A = 1.0
    var n = 5.0
    var d = 4.0
    var k = n / d
    return [A * (Math.cos(k * phi) * Math.cos(phi)), A * (Math.cos(k * phi) * Math.sin(phi))]
  })
}))

// draw sine curve.
N = 70
var n = 5.0
drawCalls.push(createDrawCall({
  color: [1, 0.7, 0.2],
  primitive: 'line strip',
  scale: 0.25,
  offset: [0.0, -0.6],
  phase: 0.6,
  freq: 0.015,
  position: Array(N).fill().map((_, i) => {
    var phi = -Math.PI * n + 2 * Math.PI * n * (i / N)
    var A = 0.5
    return [A * Math.sin(phi), -(0.9) + 1.8 * (i / N)]
  })
}))

// fading out sine curve
N = 20
n = 5.0
drawCalls.push(createDrawCall({
  color: [0.9, 0.2, 0.6],
  primitive: 'line strip',
  scale: 0.25,
  offset: [-0.7, -0.6],
  phase: 0.3,
  freq: -0.01,
  position: Array(N).fill().map((_, i) => {
    var phi = -Math.PI * n + 2 * Math.PI * n * (i / N)
    var A = 0.5 * (i / N)
    return [A * Math.sin(phi), -1 + 2 * (i / N)]
  })
}))

regl.frame(({tick}) => {
  regl.clear({
    color: [0, 0, 0, 1],
    depth: 1
  })

  globalState(() => {
    for (i = 0; i < drawCalls.length; i++) {
      drawCalls[i]()
    }
  })
})
