/*
  tags: basic

  <p>This example shows how to implement a movable camera with regl.</p>
 */

import REGL = require('../../regl')
const regl = REGL()

import bunny = require('bunny')
import normals = require('angle-normals')

import createCamera = require('../util/camera')
const camera = createCamera(regl, {
  center: [0, 2.5, 0]
})

interface Uniforms {
  projection: REGL.Mat4;
  view: REGL.Mat4;
}

interface Attributes {
  position: REGL.Vec3[];
  normal: REGL.Vec3[];
}

const drawBunny = regl<Uniforms, Attributes>({
  frag: `
    precision mediump float;
    varying vec3 vnormal;
    void main () {
      gl_FragColor = vec4(abs(vnormal), 1.0);
    }`,
  vert: `
    precision mediump float;
    uniform mat4 projection, view;
    attribute vec3 position, normal;
    varying vec3 vnormal;
    void main () {
      vnormal = normal;
      gl_Position = projection * view * vec4(position, 1.0);
    }`,
  attributes: {
    position: bunny.positions,
    normal: normals(bunny.cells, bunny.positions)
  },
  elements: bunny.cells
})

regl.frame(() => {
  regl.clear({
    color: [0, 0, 0, 1]
  })
  camera(() => {
    drawBunny()
  })
})
