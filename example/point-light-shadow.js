/*
  tags: shadows, fbo, advanced

  <p>This example shows how you can render shadows for point-lights using `regl.framebufferCube` </p>

  <p>
  You can read more about shadows for point-lights <a href="http://http.developer.nvidia.com/GPUGems/gpugems_ch12.html">here</a> and
<a href="http://learnopengl.com/#!Advanced-Lighting/Shadows/Point-Shadows">here</a>
  </p>
*/

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

// configure intial camera view.
camera.rotate([0.0, 0.0], [0.0, -0.4])
camera.zoom(50.0)

var lightPos = [0.0, 30.0, 0.0]

const CUBE_MAP_SIZE = 1024
const shadowFbo = regl.framebufferCube({
  radius: CUBE_MAP_SIZE,
  colorFormat: 'rgba',
  colorType: 'float'
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
  uniforms: {
    lightPos: lightPos
  }
})

// render point-light shadows into a cubemap
const drawDepth = regl({
  uniforms: {
    projection: mat4.perspective([], Math.PI / 2.0, 1.0, 0.25, 70.0),
    view: function (context, props, batchId) {
      switch (batchId) {
        case 0: // +x
          return mat4.lookAt([], lightPos, [lightPos[0] + 1.0, lightPos[1], lightPos[2]], [0.0, -1.0, 0.0])
        case 1: // -x
          return mat4.lookAt([], lightPos, [lightPos[0] - 1.0, lightPos[1], lightPos[2]], [0.0, -1.0, 0.0])
        case 2: // +y
          return mat4.lookAt([], lightPos, [lightPos[0], lightPos[1] + 1.0, lightPos[2]], [0.0, 0.0, 1.0])
        case 3: // -y
          return mat4.lookAt([], lightPos, [lightPos[0], lightPos[1] - 1.0, lightPos[2]], [0.0, 0.0, -1.0])
        case 4: // +z
          return mat4.lookAt([], lightPos, [lightPos[0], lightPos[1], lightPos[2] + 1.0], [0.0, -1.0, 0.0])
        case 5: // -z
          return mat4.lookAt([], lightPos, [lightPos[0], lightPos[1], lightPos[2] - 1.0], [0.0, -1.0, 0.0])
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

  varying vec3 vPosition;

  uniform mat4 projection, view, model;

  void main() {
    vec4 p = model * vec4(position, 1.0);
    vPosition = p.xyz;
    gl_Position = projection * view * p;
  }`,

  framebuffer: function (context, props, batchId) {
    return shadowFbo.faces[batchId]
  }
})

// render the object with lighting, using the previously rendered cubemap
// to render the shadows.
const drawNormal = regl({
  uniforms: {
    view: () => camera.view(),
    projection: ({viewportWidth, viewportHeight}) =>
      mat4.perspective([],
                       Math.PI / 4,
                       viewportWidth / viewportHeight,
                       0.01,
                       1000),
    shadowCube: shadowFbo
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
    // do ambient and diffuse lighting.
    vec3 lightDir = normalize(lightPos - vPosition);
    vec3 ambient = ambientLightAmount * color;
    float cosTheta = dot(vNormal, lightDir);
    vec3 diffuse = diffuseLightAmount * color * clamp(cosTheta , 0.0, 1.0 );

    vec3 texCoord = (vPosition - lightPos);
    float visibility = 0.0;

    // do soft shadows:
    for (int x = 0; x < 2; x++) {
      for (int y = 0; y < 2; y++) {
        for (int z = 0; z < 2; z++) {
          float bias = 0.3;
          vec4 env = textureCube(shadowCube, texCoord + vec3(x,y,z) * vec3(0.1) );
          visibility += (env.x+bias) < (distance(vPosition, lightPos)) ? 0.0 : 1.0;
        }
      }
    }
    visibility *= 1.0 / 8.0;

    gl_FragColor = vec4((ambient * visibility + diffuse), 1.0);
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

regl.frame(({tick}) => {
  var drawMeshes = () => {
    regl.clear({
      color: [0, 0, 0, 255],
      depth: 1
    })
    var i
    var theta
    var R
    var r, g, b
    var phi0 = 0.01 * tick

    var phi1 = -0.006 * tick

    for (i = 0; i < 1.0; i += 0.1) {
      theta = Math.PI * 2 * i
      R = 20.0

      r = ((Math.abs(23232 * i * i + 100212) % 255) / 255) * 0.4 + 0.3
      g = ((Math.abs(32278 * i + 213) % 255) / 255) * 0.4 + 0.15
      b = ((Math.abs(3112 * i * i * i + 2137 + i) % 255) / 255) * 0.05 + 0.05

      bunnyMesh.draw({scale: 0.7, translate: [R * Math.cos(theta + phi0), 3.0, R * Math.sin(theta + phi0)], color: [r, g, b]})
    }

    for (i = 0; i < 1.0; i += 0.15) {
      theta = Math.PI * 2 * i
      R = 35

      r = ((Math.abs(23232 * i * i + 100212) % 255) / 255) * 0.4 + 0.05
      g = ((Math.abs(32278 * i + 213) % 255) / 255) * 0.3 + 0.4
      b = ((Math.abs(3112 * i * i * i + 2137 + i) % 255) / 255) * 0.4 + 0.4

      boxMesh.draw({scale: 4.2, translate: [R * Math.cos(theta + phi1), 9.0, R * Math.sin(theta + phi1)], color: [r, g, b]})
    }

    planeMesh.draw({scale: 130.0, translate: [0.0, 0.0, 0.0], color: [1.0, 1.0, 1.0]})
  }

  globalScope(() => {
    drawDepth(6, () => {
      drawMeshes()
    })

    drawNormal(() => {
      drawMeshes()
    })
  })

  camera.tick()
})
