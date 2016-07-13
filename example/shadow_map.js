const webglCanvas = document.body.appendChild(document.createElement('canvas'))
const fit = require('canvas-fit')
const regl = require('../regl')(webglCanvas)
const mat4 = require('gl-mat4')
const camera = require('canvas-orbit-camera')(webglCanvas)
window.addEventListener('resize', fit(webglCanvas), false)
const bunny = require('bunny')
const normals = require('angle-normals')

// configure intial camera view.
camera.rotate([0.0, 0.0], [0.0, -0.4])
camera.zoom(10.0)

// create fbo. We set the size in `regl.frame`
const fbo = regl.framebuffer({
  color: regl.texture({
    width: 1024,
    height: 1024,
    wrap: 'clamp',
    type: 'float'
  }),
  depth: true,
  colorType: 'float'
})

console.log("fbo: ", fbo)

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

// create box geometry

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

function createModel (position, scale) {
  var m = mat4.identity([])

  mat4.translate(m, m, position)

  var s = scale
  mat4.scale(m, m, [s, s, s])
  return m
}

// this call encapsulated the common state between `drawNormal` and `drawDepth`
const globalScope = regl({
  context: {
    lightDir: [0.39, 0.87, 0.29]
  },
  uniforms: {
    lightDir: regl.context('lightDir'),
    // View Projection matrices.
    lightView: (context) =>  {
      return mat4.lookAt([], context.lightDir, [0.0, 0.0, 0.0], [0.0, 1.0, 0.0])
    },
    lightProjection: mat4.ortho([], -20, 20, -30, 70, -30, 40)
  }
})

const drawDepth = regl({
  frag: `
  precision mediump float;
  varying vec3 p;
  void main () {
    gl_FragColor = vec4(
      //vec3(gl_FragCoord.z),
      vec3(p.z),
      1.0);
  }`,
  vert: `
  precision mediump float;
  attribute vec3 position;
  uniform mat4 lightProjection, lightView, model;
  varying vec3 p;
  void main() {
    gl_Position = lightProjection * lightView * model * vec4(position, 1.0);
    p = (lightProjection * lightView * model * vec4(position, 1.0)).xyz;

  }`,
  framebuffer: fbo
})

const drawNormal = regl({
  uniforms: {
    // View Projection matrices.
    view: () => camera.view(),
    projection: ({viewportWidth, viewportHeight}) =>
      mat4.perspective([],
                       Math.PI / 4,
                       viewportWidth / viewportHeight,
                       0.01,
                       2000),
    shadowMap: () => fbo.color[0],
  },
  frag: `
  precision mediump float;
  varying vec3 vNormal;
  varying vec3 vShadowCoord;
  uniform vec3 lightDir;
  uniform float ambientLightAmount;
  uniform float diffuseLightAmount;
  uniform vec3 color;
  uniform sampler2D shadowMap;
  void main () {
    vec3 tex = color;
    vec3 ambient = ambientLightAmount * tex;
    vec3 diffuse = diffuseLightAmount * tex * clamp( dot(vNormal, lightDir ), 0.0, 1.0 );

    float v = 1.0;
    if(texture2D(shadowMap, vShadowCoord.xy * 0.5 + 0.5).z < vShadowCoord.z-0.005) {
      v = 0.0;
    }

    //gl_FragColor = vec4(vec3(v), 1.0);

    gl_FragColor = vec4((ambient + diffuse)*v, 1.0);


//   gl_FragColor = vec4(vec3(texture2D(shadowMap, vShadowCoord.xy * 0.5 + 0.5).x), 1.0 );


  }`,
  vert: `
  // the size of the world on the x and z-axes.
  precision mediump float;
  attribute vec3 position;
  attribute vec3 normal;
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec3 vShadowCoord;
  uniform mat4 projection, view, model;
  uniform mat4 lightProjection, lightView;
  void main() {
    vPosition = position;
    vNormal = normal;

    vec4 worldSpacePosition = model * vec4(position, 1);
    gl_Position = projection * view * worldSpacePosition;
    vShadowCoord = (lightProjection * lightView * worldSpacePosition).xyz;
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
      return createModel(props.translate, props.scale)
    },
    ambientLightAmount: 0.3,
    diffuseLightAmount: 0.7,
    color: [1.0, 1.0, 1.0]
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

regl.frame(() => {
  regl.updateTimer()



  var drawMeshes = () => {
  regl.clear({
    color: [0, 0, 0, 255],
    depth: 1
  })

    boxMesh.draw({scale: 4.2, translate: [4.0, 9.0, 0]})
    planeMesh.draw({scale: 100.0, translate: [0.0, 0.0, 0.0]})
    bunnyMesh.draw({scale: 0.7, translate: [-8.0, 3.3, 0.0]})
  }

  globalScope(() => {
    drawDepth(drawMeshes)

    drawNormal(drawMeshes)
  })

  camera.tick()
})
