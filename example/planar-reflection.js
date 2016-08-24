/*
  tags: stencil, advanced

  <p>This example shows how you can render planar reflections using the stencil buffer</p>

  <p>We are using the algorithm described <a href="http://www.cse.chalmers.se/edu/year/2015/course/TDA361/shadrefl.pdf#page=60">here</a> </p>

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

// configure intial camera view.
camera.rotate([0.0, 0.0], [0.0, -0.4])
camera.zoom(50.0)

var N = 12 // number of floor tiles.
var TILE_WHITE = [1.0, 1.0, 1.0]
var TILE_BLACK = [0.4, 0.4, 0.4]
var TILE_ALPHA = 0.5
var FLOOR_SCALE = 70.0

var row
var col
var z
var x
var i

function createTiles (A) {
  var planeElements = []
  var planePosition = []
  var planeNormal = []

  for (row = 0; row <= N; ++row) {
    z = (row / N) - 0.5
    for (col = 0; col <= N; ++col) {
      x = (col / N) - 0.5
      planePosition.push([x, 0.0, z])
      planeNormal.push([0.0, 1.0, 0.0])
    }
  }

  for (row = 0; row <= (N - 1); ++row) {
    for (col = 0; col <= (N - 1); ++col) {
      i = row * (N + 1) + col

      var i0 = i + 0
      var i1 = i + 1
      var i2 = i + (N + 1) + 0
      var i3 = i + (N + 1) + 1

      if ((col + row) % 2 === A) {
        planeElements.push([i3, i1, i0])
        planeElements.push([i0, i2, i3])
      }
    }
  }

  return {
    planeElements: planeElements,
    planePosition: planePosition,
    planeNormal: planeNormal
  }
}

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

var FRAG = `
  precision mediump float;

  varying vec3 vNormal;
  varying vec3 vPosition;

  uniform float ambientLightAmount;
  uniform float diffuseLightAmount;
  uniform vec3 lightDir;

  uniform vec3 color;
  uniform float yScale;
  uniform float alpha;

  void main () {
    vec3 ambient = ambientLightAmount * color;
    float cosTheta = dot(vNormal, lightDir * vec3(1.0, yScale, 1.0));
    vec3 diffuse = diffuseLightAmount * color * clamp(cosTheta , 0.0, 1.0 );

    gl_FragColor = vec4((ambient + diffuse), alpha);
  }`

var VERT = `
  precision mediump float;

  attribute vec3 position;
  attribute vec3 normal;

  varying vec3 vPosition;
  varying vec3 vNormal;

  uniform mat4 projection, view, model;
  uniform float yScale;

  void main() {
    vec4 worldSpacePosition = model * vec4(position, 1);
    worldSpacePosition.y *= yScale;

    vPosition = worldSpacePosition.xyz;
    vNormal = normal;

    gl_Position = projection * view * worldSpacePosition;
  }`

const globalScope = regl({

  uniforms: {
    lightDir: [0.39, 0.87, 0.29],
    view: () => camera.view(),
    projection: ({viewportWidth, viewportHeight}) =>
      mat4.perspective([],
                       Math.PI / 4,
                       viewportWidth / viewportHeight,
                       0.01,
                       1000),
    yScale: 1.0 // by default, do not render mirrored.
  },

  frag: FRAG,
  vert: VERT,

  // we use alpha blending to render the mirrored floor.
  blend: {
    enable: true,
    func: {
      src: 'src alpha',
      dst: 'one minus src alpha'
    }
  }
})

// draw the reflection of a mesh.
// also, use the stencil buffer to make sure that we
// only draw the reflection in the reflecting floor tiles.
const drawReflect = regl({
  uniforms: {
    yScale: -1.0
  },
  cull: {
    // must do this, since we mirrored the mesh.
    enable: true,
    face: 'front'
  },
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

// create the mask that is used to make sure that we
// only render the reflections in the reflecting floor tiles.
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
      zpass: 'replace'
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

function Mesh (elements, position, normal) {
  this.elements = elements
  this.position = position
  this.normal = normal
}

Mesh.prototype.draw = regl({
  uniforms: {
    model: (_, props, batchId) => {
      var m = mat4.identity([])

      if (typeof props.translate !== 'undefined') {
        mat4.translate(m, m, props.translate)
      }

      var s = props.scale
      mat4.scale(m, m, [s, s, s])
      return m
    },
    ambientLightAmount: 0.3,
    diffuseLightAmount: 0.7,
    color: regl.prop('color'),
    alpha: (_, props) => {
      if (typeof props.alpha !== 'undefined') {
        return props.alpha
      } else {
        return 1.0
      }
    }
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

// the white tiles is one mesh, and the black tiles is another.
// we need to render the white tiles separately to the stencil buffer to
// create the mask, so we split them into two meshes like this.
var obj = createTiles(0)
var whiteTilesMesh = new Mesh(obj.planeElements, obj.planePosition, obj.planeNormal)

obj = createTiles(1)
var blackTilesMesh = new Mesh(obj.planeElements, obj.planePosition, obj.planeNormal)

regl.frame(({tick}) => {
  regl.clear({
    color: [0, 0, 0, 255],
    depth: 1,
    stencil: 0
  })

  var drawMeshes = () => {
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

      bunnyMesh.draw({scale: 0.7, translate: [R * Math.cos(theta + phi0), 1.0, R * Math.sin(theta + phi0)], color: [r, g, b]})
    }

    for (i = 0; i < 1.0; i += 0.15) {
      theta = Math.PI * 2 * i
      R = 35

      r = ((Math.abs(23232 * i * i + 100212) % 255) / 255) * 0.4 + 0.05
      g = ((Math.abs(32278 * i + 213) % 255) / 255) * 0.3 + 0.4
      b = ((Math.abs(3112 * i * i * i + 2137 + i) % 255) / 255) * 0.4 + 0.4

      boxMesh.draw({scale: 4.2, translate: [R * Math.cos(theta + phi1), 6.0, R * Math.sin(theta + phi1)], color: [r, g, b]})
    }
  }

  globalScope(() => {
    //
    // First, draw the reflections of the meshes.
    //
    createMask(() => {
      whiteTilesMesh.draw({scale: FLOOR_SCALE, color: TILE_WHITE, alpha: TILE_ALPHA})
    })
    drawReflect(() => {
      drawMeshes()
    })
    whiteTilesMesh.draw({scale: FLOOR_SCALE, color: TILE_WHITE, alpha: TILE_ALPHA})
    blackTilesMesh.draw({scale: FLOOR_SCALE, color: TILE_BLACK})

    //
    // Now draw the actual meshes.
    //
    drawMeshes()
  })

  camera.tick()
})
