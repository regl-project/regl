const webglCanvas = document.body.appendChild(document.createElement('canvas'))
const fit = require('canvas-fit')
const regl = require('../regl')({
  canvas: webglCanvas,
  extensions: 'oes_texture_float'
})
const mat4 = require('gl-mat4')
const camera = require('canvas-orbit-camera')(webglCanvas)
window.addEventListener('resize', fit(webglCanvas), false)
const bunny = require('bunny')
const normals = require('angle-normals')

var sphere = require('primitive-sphere')(1.0, {
  segments: 16
})

// configure intial camera view.
camera.rotate([0.0, 0.0], [0.0, -0.4])
camera.zoom(10.0)

var lightPos = [0.0, 30.0, 0.0]

const CUBE_MAP_SIZE = 512 * 2
const shadowFbo = regl.framebufferCube({
  radius: CUBE_MAP_SIZE,
  colorFormat: 'rgba',
  colorType: 'float',
  depth: true,
  stencil: true
})

const planeElements = []
var planePosition = []
var planeNormal = []

planePosition.push([-0.5, 0.0, -0.5])
planePosition.push([+0.5, 0.0, -0.5])
planePosition.push([-0.5, 0.0, +0.5])
planePosition.push([+0.5, 0.0, +0.5])

planeNormal.push([0.0, 1.0, 0.0])
planeNormal.push([0.0, 1.0, 0.0])
planeNormal.push([0.0, 1.0, 0.0])
planeNormal.push([0.0, 1.0, 0.0])

planeElements.push([3, 1, 0])
planeElements.push([0, 2, 3])

var boxPosition = [
  // side faces
  [-0.5, +0.5, +0.5], [+0.5, +0.5, +0.5], [+0.5, -0.5, +0.5], [-0.5, -0.5, +0.5], // positive z face.
  [+0.5, +0.5, +0.5], [+0.5, +0.5, -0.5], [+0.5, -0.5, -0.5], [+0.5, -0.5, +0.5], // positive x face
  [+0.5, +0.5, -0.5], [-0.5, +0.5, -0.5], [-0.5, -0.5, -0.5], [+0.5, -0.5, -0.5], // negative z face
  [-0.5, +0.5, -0.5], [-0.5, +0.5, +0.5], [-0.5, -0.5, +0.5], [-0.5, -0.5, -0.5], // negative x face.
  [-0.5, +0.5, -0.5], [+0.5, +0.5, -0.5], [+0.5, +0.5, +0.5], [-0.5, +0.5, +0.5],  // top face
  [-0.5, -0.5, -0.5], [+0.5, -0.5, -0.5], [+0.5, -0.5, +0.5], [-0.5, -0.5, +0.5]  // bottom face
]

const boxElements = [
  [2, 1, 0], [2, 0, 3],
  [6, 5, 4], [6, 4, 7],
  [10, 9, 8], [10, 8, 11],
  [14, 13, 12], [14, 12, 15],
  [18, 17, 16], [18, 16, 19],
  [20, 21, 22], [23, 20, 22]
]

// all the normals of a single block.
var boxNormal = [
  // side faces
  [0.0, 0.0, +1.0], [0.0, 0.0, +1.0], [0.0, 0.0, +1.0], [0.0, 0.0, +1.0],
  [+1.0, 0.0, 0.0], [+1.0, 0.0, 0.0], [+1.0, 0.0, 0.0], [+1.0, 0.0, 0.0],
  [0.0, 0.0, -1.0], [0.0, 0.0, -1.0], [0.0, 0.0, -1.0], [0.0, 0.0, -1.0],
  [-1.0, 0.0, 0.0], [-1.0, 0.0, 0.0], [-1.0, 0.0, 0.0], [-1.0, 0.0, 0.0],
  // top
  [0.0, +1.0, 0.0], [0.0, +1.0, 0.0], [0.0, +1.0, 0.0], [0.0, +1.0, 0.0],
  // bottom
  [0.0, -1.0, 0.0], [0.0, -1.0, 0.0], [0.0, -1.0, 0.0], [0.0, -1.0, 0.0]
]

// This call encapsulates the common state between `drawNormal` and `drawDepth`
const globalScope = regl({
  context: {
  },
  uniforms: {
    lightPos: lightPos
  }
})

const drawDepth = regl({
  uniforms: {
    projection: mat4.perspective([], Math.PI / 2.0, 1.0, 0.25, 1000.0),
    view: function (context, props, batchId) {
      const view = []

      switch (batchId) {
        case 0: // +x
          return mat4.lookAt(view, lightPos, [lightPos[0] + 1.0, lightPos[1], lightPos[2]], [0.0, -1.0, 0.0])
        case 1: // -x
          return mat4.lookAt(view, lightPos, [lightPos[0] - 1.0, lightPos[1], lightPos[2]], [0.0, -1.0, 0.0])
        case 2: // +y
          return mat4.lookAt(view, lightPos, [lightPos[0], lightPos[1] + 1.0, lightPos[2]], [0.0, 0.0, 1.0])
        case 3: // -y
          return mat4.lookAt(view, lightPos, [lightPos[0], lightPos[1] - 1.0, lightPos[2]], [0.0, 0.0, -1.0])
        case 4: // +z
          return mat4.lookAt(view, lightPos, [lightPos[0], lightPos[1], lightPos[2] + 1.0], [0.0, -1.0, 0.0])
        case 5: // -z
          return mat4.lookAt(view, lightPos, [lightPos[0], lightPos[1], lightPos[2] - 1.0], [0.0, -1.0, 0.0])
      }
    }
  },

  frag: `
  precision mediump float;

  varying vec3 vPosition;

  uniform vec3 lightPos;

  void main () {
    gl_FragColor = vec4(vec3(distance(vPosition, lightPos)), 1.0);
  }`,

  vert: `
  precision mediump float;
  attribute vec3 position;
  uniform mat4 projection, view, model;
  varying vec3 vPosition;
  void main() {
    vec4 p = model * vec4(position, 1.0);
    vPosition = p.xyz;
    gl_Position = projection * view * p;
  }`,

  framebuffer: function (context, props, batchId) {
    return shadowFbo.faces[batchId]
  }
})

const drawNormal = regl({
  uniforms: {
    view: () => camera.view(),
    projection: ({viewportWidth, viewportHeight}) =>
      mat4.perspective([],
                       Math.PI / 4,
                       viewportWidth / viewportHeight,
                       0.01,
                       200),
    shadowCube: shadowFbo.color[0]
  },
  frag: `
  precision mediump float;

  varying vec3 vNormal;
  varying vec3 vPosition;

  uniform float ambientLightAmount;
  uniform float diffuseLightAmount;
  uniform vec3 color;
  uniform vec3 lightPos;
  uniform samplerCube shadowCube;

  void main () {
    vec3 lightDir = normalize(lightPos - vPosition);
    vec3 ambient = ambientLightAmount * color;
    float cosTheta = dot(vNormal, lightDir);
    vec3 diffuse = diffuseLightAmount * color * clamp(cosTheta , 0.0, 1.0 );

    vec3 tex = (vPosition - lightPos);
    vec4 env = textureCube(shadowCube, tex);

    //    float v = 1.0;

    float v = (env.x+0.3) < (distance(vPosition, lightPos)) ? 0.0 : 1.0;

    //    v = 1.0;
    gl_FragColor = vec4((ambient + diffuse * v), 1.0);

    //    gl_FragColor = vec4(vec3(v), 1.0);
  }`,
  vert: `
  precision mediump float;

  attribute vec3 position;
  attribute vec3 normal;

  varying vec3 vPosition;
  varying vec3 vNormal;

  uniform mat4 projection, view, model;

  void main() {
    vec4 worldSpacePosition = model * vec4(position, 1);
    vPosition = worldSpacePosition.xyz;

    vNormal = normal;

    gl_Position = projection * view * worldSpacePosition;
  }`
})

function Mesh (elements, position, normal) {
  this.elements = elements
  this.position = position
  this.normal = normal
}

Mesh.prototype.draw = regl({
  uniforms: {
    model: (_, props, batchId) => {
      var m = mat4.identity([])

      mat4.translate(m, m, props.translate)

      var s = props.scale
      mat4.scale(m, m, [s, s, s])
      return m
    },
    ambientLightAmount: 0.3,
    diffuseLightAmount: 0.7,
    color: regl.prop('color')
  },
  attributes: {
    position: regl.this('position'),
    normal: regl.this('normal')
  },
  elements: regl.this('elements'),
  cull: {
    enable: true
  }
})

var bunnyMesh = new Mesh(bunny.cells, bunny.positions, normals(bunny.cells, bunny.positions))
var boxMesh = new Mesh(boxElements, boxPosition, boxNormal)
var planeMesh = new Mesh(planeElements, planePosition, planeNormal)
var sphereMesh = new Mesh(sphere.cells, sphere.positions, sphere.normals)

regl.frame(({tick}) => {
  var drawMeshes = () => {
    regl.clear({
      color: [0, 0, 0, 255],
      depth: 1
    })
    var i
    var theta
    var r
    for (i = 0; i < 1.0; i += 0.1) {
      theta = Math.PI * 2 * i
      r = 20.0
      bunnyMesh.draw({scale: 0.7, translate: [r * Math.cos(theta), 3.0, r * Math.sin(theta)], color: [0.55, 0.2, 0.05]})
    }

    for (i = 0; i < 1.0; i += 0.15) {
      theta = Math.PI * 2 * i
      r = 35

      boxMesh.draw({scale: 4.2, translate: [r * Math.cos(theta), 9.0, r * Math.sin(theta)], color: [0.05, 0.5, 0.5]})
    }

    planeMesh.draw({scale: 200.0, translate: [0.0, 0.0, 0.0], color: [1.0, 1.0, 1.0]})
  }

  globalScope(() => {
    drawDepth(6, () => {
      drawMeshes()
    })

    drawNormal(() => {
      drawMeshes()
      sphereMesh.draw({scale: 3.0, translate: lightPos, color: [0.55, 0.55, 0.00]})
    })
  })

  camera.tick()
})
