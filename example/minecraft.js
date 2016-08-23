/*
  tags: basic

  <p>This example shows how you can implement a simple Minecraft renderer in regl.</p>
 */

const canvas = document.body.appendChild(document.createElement('canvas'))
const fit = require('canvas-fit')
const regl = require('../regl')(canvas)
const mat4 = require('gl-mat4')
const camera = require('canvas-orbit-camera')(canvas)
window.addEventListener('resize', fit(canvas), false)

// configure intial camera view.
camera.rotate([0.0, 0.0], [0.0, -0.4])
camera.zoom(15.0)

// all the positions of a single block.
var blockPosition = [
  // side faces
  [[-0.5, +0.5, +0.5], [+0.5, +0.5, +0.5], [+0.5, -0.5, +0.5], [-0.5, -0.5, +0.5]], // positive z face.
  [[+0.5, +0.5, +0.5], [+0.5, +0.5, -0.5], [+0.5, -0.5, -0.5], [+0.5, -0.5, +0.5]], // positive x face
  [[+0.5, +0.5, -0.5], [-0.5, +0.5, -0.5], [-0.5, -0.5, -0.5], [+0.5, -0.5, -0.5]], // negative z face
  [[-0.5, +0.5, -0.5], [-0.5, +0.5, +0.5], [-0.5, -0.5, +0.5], [-0.5, -0.5, -0.5]], // negative x face.
  // top faces
  [[-0.5, +0.5, -0.5], [+0.5, +0.5, -0.5], [+0.5, +0.5, +0.5], [-0.5, +0.5, +0.5]]
]

// all the uvs of a single block.
var blockUv = [
  // side faces
  [[0.0, 0.5], [0.5, 0.5], [0.5, 1.0], [0.0, 1.0]],
  [[0.0, 0.5], [0.5, 0.5], [0.5, 1.0], [0.0, 1.0]],
  [[0.0, 0.5], [0.5, 0.5], [0.5, 1.0], [0.0, 1.0]],
  [[0.0, 0.5], [0.5, 0.5], [0.5, 1.0], [0.0, 1.0]],
  // top
  [[0.0, 0.0], [0.5, 0.0], [0.5, 0.5], [0.0, 0.5]]
]

// all the normals of a single block.
var blockNormal = [
  // side faces
  [[0.0, 0.0, +1.0], [0.0, 0.0, +1.0], [0.0, 0.0, +1.0], [0.0, 0.0, +1.0]],
  [[+1.0, 0.0, 0.0], [+1.0, 0.0, 0.0], [+1.0, 0.0, 0.0], [+1.0, 0.0, 0.0]],
  [[0.0, 0.0, -1.0], [0.0, 0.0, -1.0], [0.0, 0.0, -1.0], [0.0, 0.0, -1.0]],
  [[-1.0, 0.0, 0.0], [-1.0, 0.0, 0.0], [-1.0, 0.0, 0.0], [-1.0, 0.0, 0.0]],
  // top
  [[0.0, +1.0, 0.0], [0.0, +1.0, 0.0], [0.0, +1.0, 0.0], [0.0, +1.0, 0.0]]
]

// the terrain is just described by some sine functions.
var evalHeight = (x, z) => {
  var freq = 30.0
  return Math.round(
    2.0 * Math.sin(freq * 1.0 * 3.14 * x) * Math.sin(freq * 2.0 * 3.14 * z) +
    3.0 * Math.cos(freq * 4.0 * 3.14 * x + 2.1) * Math.sin(freq * 5.0 * 3.14 * z + 0.9) +
    1.0 * Math.cos(freq * 8.0 * 3.14 * x + 43.43) * Math.cos(freq * 3.0 * 3.14 * z + 34.3))
}

// these contains all the geometry of the world.
// you can add blocks to these arrays by calling addBlock()
var uv = []
var elements = []
var position = []
var normal = []

var addBlock = (x, y, z) => {
  var index = position.length

  for (var i = 0; i < 5; i++) {
    if (i === 0 && y <= evalHeight(x, z + 1)) { // positive z face
      continue // not visible, skip
    }
    if (i === 1 && y <= evalHeight(x + 1, z)) { // positive x face
      continue // not visible, skip
    }
    if (i === 2 && y <= evalHeight(x, z - 1)) { // negative z face
      continue // not visible, skip
    }
    if (i === 3 && y <= evalHeight(x - 1, z)) { // negative x face
      continue // not visible, skip
    }

    var j

    // add positions.
    for (j = 0; j < blockPosition[i].length; j++) {
      var p = blockPosition[i][j]
      position.push([p[0] + x, p[1] + y, p[2] + z])
    }

    // add normals.
    for (j = 0; j < blockNormal[i].length; j++) {
      var n = blockNormal[i][j]
      normal.push([n[0], n[1], n[2]])
    }

    // add uvs.
    for (j = 0; j < blockUv[i].length; j++) {
      var a = blockUv[i][j]
      uv.push([a[0], a[1]])
    }

    // add quad face.
    elements.push([2 + index, 1 + index, 0 + index])
    elements.push([2 + index, 0 + index, 3 + index])

    index += 4 // next quad.
  }
}

const S = 40 // world size.

// create world:
for (var x = -S; x <= S; x++) {
  for (var z = -S; z <= S; z++) {
    var y = evalHeight(x, z)
    addBlock(x, y, z)
  }
}

// now the world has been created. Now create the draw call.
const drawWorld = regl({
  cull: {
    enable: true,
    face: 'back'
  },
  context: {
    view: () => camera.view()
  },
  frag: `
  precision mediump float;

  varying vec2 vUv;
  varying vec3 vNormal;

  uniform sampler2D atlas;

  void main () {

    vec3 lightDir = normalize(vec3(0.4, 0.9, 0.3));
    vec3 tex = texture2D(atlas, vUv).rgb;
    vec3 ambient = 0.3 * tex;
    vec3 diffuse = 0.7 * tex * clamp( dot(vNormal, lightDir ), 0.0, 1.0 );

    gl_FragColor = vec4(ambient + diffuse, 1.0);
  }`,

  vert: `
  precision mediump float;

  attribute vec3 position, normal;
  attribute vec2 uv;

  varying vec2 vUv;
  varying vec3 vNormal;

  uniform mat4 projection, view;

  void main() {
    vUv = uv;
    vNormal = normal;
    gl_Position = projection * view * vec4(position, 1);
  }`,

  uniforms: {
    view: regl.context('view'),
    projection: ({viewportWidth, viewportHeight}) =>
      mat4.perspective([],
                       Math.PI / 4,
                       viewportWidth / viewportHeight,
                       0.01,
                       1000),
    atlas: regl.prop('atlas')
  },

  attributes: {
    position: regl.prop('position'),
    uv: regl.prop('uv'),
    normal: regl.prop('normal')
  },
  elements: regl.prop('elements')

})

require('resl')({
  manifest: {
    atlas: {
      type: 'image',
      src: 'assets/atlas.png',
      parser: (data) => regl.texture({
        mag: 'nearest',
        mipmap: true,
        min: 'linear mipmap linear',
        data: data
      })

    }
  },

  onDone: ({ atlas }) => {
    regl.frame(() => {
      drawWorld({position, elements, uv, normal, atlas})
      camera.tick()
    })
  }
})
