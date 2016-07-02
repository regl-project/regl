const mat4 = require('gl-mat4')
const bunny = require('bunny')
const fit = require('canvas-fit')
const normals = require('angle-normals')

const canvas = document.body.appendChild(document.createElement('canvas'))
const regl = require('../regl')(canvas)
const camera = require('canvas-orbit-camera')(canvas)
window.addEventListener('resize', fit(canvas), false)

const drawBunny = regl({
  frag: `
    precision mediump float;
    varying vec3 vnormal;
    void main () {
      gl_FragColor = vec4(abs(vnormal), 1.0);
    }`,
  vert: `
    precision mediump float;
    uniform mat4 proj;
    uniform mat4 model;
    uniform mat4 view;
    attribute vec3 position;
    attribute vec3 normal;
    varying vec3 vnormal;
    void main () {
      vnormal = normal;
      gl_Position = proj * view * model * vec4(position, 1.0);
    }`,
  attributes: {
    position: bunny.positions,
    normal: normals(bunny.cells, bunny.positions)
  },
  elements: bunny.cells,
  uniforms: {
    proj: ({viewportWidth, viewportHeight}) =>
      mat4.perspective([],
        Math.PI / 2,
        viewportWidth / viewportHeight,
        0.01,
        1000),
    model: mat4.identity([]),
    view: () => camera.view()
  }
})

regl.frame(function (props, count) {
  regl.clear({
    color: [0, 0, 0, 1]
  })
  camera.tick()
  drawBunny()
})
