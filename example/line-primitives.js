/*
  tags: basic
  <p> This example demonstrates how you can use `elements` to draw lines. </p>
*/

const regl = require('../regl')()
var mat4 = require('gl-mat4')
var rng = require('seedrandom')('my_seed')

var globalState = regl({
  uniforms: {
    tick: ({tick}) => 1.0 * tick,

    projection: ({viewportWidth, viewportHeight}) =>
      mat4.perspective([],
                       Math.PI / 4,
                       viewportWidth / viewportHeight,
                       0.01,
                       1000),
    view: ({tick}) => {
      var t = 0.003 * tick
      var r = 2.3
      var h = 1.3
      t = 0
      return mat4.lookAt([],
                         [r * Math.cos(t), r * Math.sin(t), h],
                         [0, 0.0, 0],
                         [0, 0, 1])
    }
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

    p *= scale;

    float phi = tick * freq + phase;
    // phi = 0.0;
    p = vec2(
      dot(vec2(+cos(phi), -sin(phi)), p),
      dot(vec2(+sin(phi), +cos(phi)), p)
    );

    p += offset;

    gl_Position = projection * view * vec4(p, 0, 1);
  }`
})

function createDrawcall (props) {
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

    lineWidth: 3,
    count: props.position.length,
    primitive: props.primitive
  })
}

var drawcalls = []
var i

//
// square
//
drawcalls.push(createDrawcall({
  color: [1, 0, 0],
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
drawcalls.push(createDrawcall({
  color: [0, 1, 0],
  primitive: 'line loop',
  scale: 0.25,
  offset: [-0.7, 0.7],
  phase: 0.8,
  freq: -0.02,
  position: makeCircle(3)
}))

//
// hexagon
//
drawcalls.push(createDrawcall({
  color: [0.7, 0.3, 1],
  primitive: 'line loop',
  scale: 0.25,
  offset: [0.0, 0.7],
  phase: 0.6,
  freq: 0.009,
  position: makeCircle(6)
}))

// star-shaped thingy
var N = 40
drawcalls.push(createDrawcall({
  color: [0, 0, 1],
  primitive: 'line loop',
  scale: 0.25,
  offset: [0.7, 0.7],
  phase: 0.6,
  freq: 0.015,
  position: Array(N).fill().map((_, i) => {
    var phi = 2 * Math.PI * (i / N)
    var A = 1.0 + 0.15 * Math.sin(phi * 70.0)
    return [A * Math.cos(phi), A * Math.sin(phi)]
  })
}))

// rock-like shape
N = 70
drawcalls.push(createDrawcall({
  color: [0, 1, 1],
  primitive: 'line loop',
  scale: 0.25,
  offset: [0.7, 0.0],
  phase: 0.6,
  freq: 0.015,
  position: Array(N).fill().map((_, i) => {
    var phi = 2 * Math.PI * (i / N)
    var A = 1.0 + 0.15 * rng()
    return [A * Math.cos(phi), A * Math.sin(phi)]
  })
}))

// draw a spiral.
N = 200
drawcalls.push(createDrawcall({
  color: [0, 1, 1],
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
N = 500
drawcalls.push(createDrawcall({
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
N = 300
var n = 5.0
drawcalls.push(createDrawcall({
  color: [1, 1, 0],
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
drawcalls.push(createDrawcall({
  color: [1, 0, 0.5],
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
    for (i = 0; i < drawcalls.length; i++) {
      drawcalls[i]()
    }
  })
})
