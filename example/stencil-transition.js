/*
  <p>This example shows how you can render planar reflections using the stencil buffer</p>

  <p>We using the algorithm described <a href="http://www.cse.chalmers.se/edu/year/2015/course/TDA361/shadrefl.pdf#page=60">here</a> </p>

  <p>To render the reflections, we mirror all the meshes on the y-axis, and then render them, and then we render the floor with alpha blending over them.
  However, we use the stencil buffer to make sure that the mirrored objects are only visible
  in the reflecting white tiles. If we did not use the stencil buffer, we would be able to
  see the mirrored meshes under the floor, which is weird.
  </p>
*/

const c = document.createElement('canvas')
const webglCanvas = document.body.appendChild(c)
var gl = c.getContext('webgl', {
  antialias: true,
  stencil: true
})

const fit = require('canvas-fit')
const regl = require('../regl')({gl: gl})
const mat4 = require('gl-mat4')
const camera = require('canvas-orbit-camera')(webglCanvas)
window.addEventListener('resize', fit(webglCanvas), false)
const bunny = require('bunny')
const normals = require('angle-normals')
var boundingBox = require('vertices-bounding-box')
var tform = require('geo-3d-transform-mat4')
var seedrandom = require('seedrandom')

function centerMesh (mesh) {
  var bb = boundingBox(mesh.positions)

  // Translate the geometry center to the origin.
  var _translate = [
    -0.5 * (bb[0][0] + bb[1][0]),
    -0.5 * (bb[0][1] + bb[1][1]),
    -0.5 * (bb[0][2] + bb[1][2])
  ]
  var translate = mat4.create()
  mat4.translate(translate, translate, _translate)
  mesh.positions = tform(mesh.positions, translate)
}

centerMesh(bunny)

// configure intial camera view.
camera.rotate([0.0, 0.0], [0.0, -0.4])
camera.zoom(-10.0)

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

var TEX_W = 64
var TEX_H = 64

var textures = []

var rng = seedrandom('seed.')

function makeTexture (f) {
  var texData = []

  for (var y = 0; y < TEX_W; y++) {
    var r = []
    for (var x = 0; x < TEX_H; x++) {
      var rand = rng()
      var g = rand > f ? 255 : 0

      r.push([g, g, g, 255])
    }
    texData.push(r)
  }

  return regl.texture({
    mag: 'nearest',
    wrap: 'repeat',
    data: texData
  })
}

var N_TEX = 20

for (var i = 0; i <= N_TEX; i++) {
  textures[i] = makeTexture(i / N_TEX)
}

const globalScope = regl({
  cull: {
    enable: true
  }
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
    color: regl.prop('color'),
    lightDir: [0.39, 0.87, 0.29],
    view: () => { return mat4.lookAt([], [0.0, 10.0, 20.0], [0, 0, 0], [0, 1, 0]) },
    projection: ({viewportWidth, viewportHeight}) =>
      mat4.perspective([],
                       Math.PI / 4,
                       viewportWidth / viewportHeight,
                       0.01,
                       1000)
  },
  attributes: {
    position: regl.this('position'),
    normal: regl.this('normal')
  },
  elements: regl.this('elements'),
  frag: `
  precision mediump float;

  varying vec3 vNormal;
  varying vec3 vPosition;

  uniform float ambientLightAmount;
  uniform float diffuseLightAmount;
  uniform vec3 lightDir;

  uniform vec3 color;

  void main () {
    vec3 ambient = ambientLightAmount * color;
    float cosTheta = dot(vNormal, lightDir);
    vec3 diffuse = diffuseLightAmount * color * clamp(cosTheta , 0.0, 1.0 );

    gl_FragColor = vec4((ambient + diffuse), 1.0);
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

var box = regl({
  frag: `
  precision mediump float;

  varying vec2 uv;

  uniform float viewportWidth, viewportHeight;

  uniform sampler2D tex;
  uniform vec2 scale;

  void main () {

    float x = texture2D(tex, uv * scale * 0.05).x;
    if(x > 0.5)
      discard;

    gl_FragColor = vec4(1.0);
  }`,

  vert: `
  precision mediump float;
  attribute vec2 position;

  uniform float t;

  varying vec2 uv;

  void main () {
    uv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0, 1);
  }`,

  attributes: {
    position: [
      [-1, -1], [1, -1], [1, 1],
      [-1, -1], [1, 1], [-1, 1]
    ]
  },

  uniforms: {
    viewportWidth: ({viewportWidth}) => viewportWidth,
    viewportHeight: ({viewportHeight}) => viewportHeight,
    tex: (_, props) => { return textures[Math.floor(props.t * N_TEX)] },
    scale: ({viewportWidth, viewportHeight}) => {
      return [Math.ceil(viewportWidth / TEX_W), Math.ceil(viewportHeight / TEX_H)]
    }
  },

  count: 6,
  depth: {
    enable: false
  }
})

const createMask = regl({
  stencil: {
    enable: true,
    mask: 0xff,
    func: {
      cmp: 'always',
      ref: 1,
      mask: 0xff
    },
    opFront: {
      fail: 'replace',
      zfail: 'replace',
      pass: 'replace'
    }
  },
  // we want to write only to the stencil buffer,
  // so disable these masks.
  colorMask: [false, false, false, false],
  depth: {
    enable: true,
    mask: false
  }
})

const filterMask0 = regl({
  stencil: {
    enable: true,
    mask: 0xff,
    func: {
      cmp: 'equal',
      ref: 0,
      mask: 0xff
    }
  }
})

const filterMask1 = regl({
  stencil: {
    enable: true,
    mask: 0xff,
    func: {
      cmp: 'equal',
      ref: 1,
      mask: 0xff
    }
  }
})

var bunnyMesh = new Mesh(bunny.cells, bunny.positions, normals(bunny.cells, bunny.positions))
var boxMesh = new Mesh(boxElements, boxPosition, boxNormal)

var f0 = filterMask0
var f1 = filterMask1

regl.frame(({tick}) => {
  regl.clear({
    color: [0, 0, 0, 255],
    depth: 1,
    stencil: 0
  })

  var normTick = tick % 60

  var scene0 = () => {
    boxMesh.draw({scale: 10.2, translate: [0.0, 0.0, 0.0], color: [0.0, 0.5, 0.0]})
  }

  var scene1 = () => {
    bunnyMesh.draw({scale: 1.0, translate: [0.0, 0.0, 0.0], color: [0.6, 0.0, 0.0]})
  }

  var t = normTick * normTick * 0.001
  if (t > 1.0) {
    t = 1.0
  }

  if ((tick % 60) === 0) {
    var temp = f0
    f0 = f1
    f1 = temp
  }

  globalScope(() => {
    createMask(() => {
      box({t: t})
    })

    f0(scene0)
    f1(scene1)
  })

  camera.tick()
})
