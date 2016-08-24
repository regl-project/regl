/*
  tags: basic

  <p>This example demonstrates the regl-stats-widget, which provides a visual representation of the total GPU-time of draw-calls</p>

 */

const webglCanvas = document.body.appendChild(document.createElement('canvas'))
const fit = require('canvas-fit')
const regl = require('../regl')({
  canvas: webglCanvas,
  extensions: 'ext_disjoint_timer_query',
  profile: true
})
const mat4 = require('gl-mat4')
const camera = require('canvas-orbit-camera')(webglCanvas)
window.addEventListener('resize', fit(webglCanvas), false)
const bunny = require('bunny')
const normals = require('angle-normals')
const createStatsWidget = require('regl-stats-widget')

// configure intial camera view.
camera.rotate([0.0, 0.0], [0.0, -0.4])
camera.zoom(300.0)

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

/*
  This function encapsulates all the common state
  */
const scope1 = regl({
  cull: {
    enable: true
  },
  uniforms: {
    // View Projection matrices.
    view: () => camera.view(),
    projection: ({viewportWidth, viewportHeight}) =>
      mat4.perspective([],
                       Math.PI / 4,
                       viewportWidth / viewportHeight,
                       0.01,
                       2000),

    // light settings. These can of course by tweaked to your likings.
    lightDir: [0.39, 0.87, 0.29],
    ambientLightAmount: 0.3,
    diffuseLightAmount: 0.7
  },
  frag: `
  precision mediump float;
  varying vec3 vNormal;
  uniform vec3 lightDir;
  uniform float ambientLightAmount;
  uniform float diffuseLightAmount;
  uniform vec3 color;
  void main () {
    vec3 tex = color;
    vec3 ambient = ambientLightAmount * tex;
    vec3 diffuse = diffuseLightAmount * tex * clamp( dot(vNormal, lightDir ), 0.0, 1.0 );
    gl_FragColor = vec4(ambient + diffuse, 1.0);
  }`,
  vert: `
  // the size of the world on the x and z-axes.
  precision mediump float;
  attribute vec3 position;
  attribute vec3 normal;
  varying vec3 vPosition;
  varying vec3 vNormal;
  uniform mat4 projection, view, model;
  void main() {
    vPosition = position;
    vNormal = normal;
    gl_Position = projection * view * model * vec4(position, 1);
  }`
})

// we make the light darker in this scope.
const scope2 = regl({
  uniforms: {
    ambientLightAmount: 0.15,
    diffuseLightAmount: 0.35
  }
})

const scope3 = regl({
  uniforms: {
    ambientLightAmount: 0.90,
    diffuseLightAmount: 0.70
  }
})

const drawPlane = regl({

  uniforms: {
    color: [0.7, 0.7, 0.7],
    model: (_, props, batchId) => {
      return createModel(props.position, props.scale)
    }
  },
  attributes: {
    position: planePosition,
    normal: planeNormal

  },
  elements: planeElements
})

const drawBunny = regl({
  attributes: {
    position: bunny.positions,
    normal: normals(bunny.cells, bunny.positions)
  },
  elements: bunny.cells,
  uniforms: {
    model: (_, props, batchId) => {
      return createModel(props.position, props.scale)
    },
    color: [0.5, 0.0, 0.0]
  }
})

const drawBox = regl({
  attributes: {
    position: boxPosition,
    normal: boxNormal
  },
  elements: boxElements,
  uniforms: {
    model: (_, props, batchId) => {
      return createModel(props.position, props.scale)
    },
    color: [0.0, 0.6, 0.0]
  }
})

var drawCalls = [
  [drawPlane, 'drawPlane'],
  [drawBunny, 'drawBunny'],
  [drawBox, 'drawBox'],
  [scope1, 'scope1'],
  [scope2, 'scope2'],
  [scope3, 'scope3']
]
var statsWidget = createStatsWidget(drawCalls)

regl.frame(() => {
  regl.clear({
    color: [0, 0, 0, 255],
    depth: 1
  })

  const deltaTime = 0.017

  statsWidget.update(deltaTime)

  scope1({}, () => {
    var boxes = []
    var x
    var z
    var X_COUNT = 5
    var Z_COUNT = 5

    // place out boxes.
    var SPACING = -100
    for (x = 0; x < X_COUNT; x++) {
      for (z = 0; z < Z_COUNT; z++) {
        boxes.push({scale: 50.7, position: [-200.0 + x * SPACING, 40, 200 + z * SPACING]})
      }
    }

    scope2({}, () => {
      drawBox(boxes)
    })

    // place out bunnies
    SPACING = 100
    var bunnies = []
    for (x = 0; x < X_COUNT; x++) {
      for (z = 0; z < Z_COUNT; z++) {
        bunnies.push({scale: 5.2, position: [x * SPACING, 3.3, -80.0 + z * SPACING]})
      }
    }

    scope3({}, () => {
      drawPlane({scale: 2000.0, position: [0.0, 0.0, 0.0]})
      drawBunny(bunnies)
    })

    camera.tick()
  })
})
