/*
  tags: advanced, fbo

  <p>This example shows how you can render reflections using cubic framebuffers.</p>

 */

const regl = require('../regl')()
const mat4 = require('gl-mat4')
const bunny = require('bunny')
const teapot = require('conway-hart')('I')
const normals = require('angle-normals')
const mouse = require('mouse-change')()

const CUBE_MAP_SIZE = 512

const GROUND_TILES = 20
const GROUND_HEIGHT = -5.0
const TEAPOT_TINT = [0.9, 1.0, 0.8]
const BUNNY_TINT = [1.0, 0.8, 0.9]

const bunnyFBO = regl.framebufferCube(CUBE_MAP_SIZE)
const teapotFBO = regl.framebufferCube(CUBE_MAP_SIZE)

const setupCubeFace = regl({
  framebuffer: function (context, props, batchId) {
    return this.cubeFBO.faces[batchId]
  },

  context: {
    projection: regl.this('projection'),
    view: function (context, props, batchId) {
      const view = this.view
      for (let i = 0; i < 16; ++i) {
        view[i] = 0
      }
      switch (batchId) {
        case 0: // +x
          view[2] = 1
          view[5] = 1
          view[8] = 1
          break
        case 1: // -x
          view[2] = -1
          view[5] = 1
          view[8] = -1
          break
        case 2: // +y
          view[0] = -1
          view[6] = 1
          view[9] = -1
          break
        case 3: // -y
          view[0] = 1
          view[6] = -1
          view[9] = 1
          break
        case 4: // +z
          view[0] = -1
          view[5] = 1
          view[10] = 1
          break
        case 5: // -z
          view[0] = 1
          view[5] = 1
          view[10] = -1
          break
      }
      view[15] = 1
      mat4.translate(view, view, [
        -this.center[0],
        -this.center[1],
        -this.center[2]
      ])
      return view
    },
    eye: regl.this('center')
  }
})

const cubeProps = {
  projection: new Float32Array(16),
  view: new Float32Array(16),
  cubeFBO: null
}

function setupCube ({center, fbo}, block) {
  mat4.perspective(
    cubeProps.projection,
    Math.PI / 2.0,
    1.0,
    0.25,
    1000.0)

  cubeProps.cubeFBO = fbo
  cubeProps.center = center

  // execute `setupCubeFace` 6 times, where each time will be
  // a different batch, and the batchIds of the 6 batches will be
  // 0, 1, 2, 3, 4, 5
  setupCubeFace.call(cubeProps, 6, block)
}

const cameraProps = {
  fov: Math.PI / 4.0,
  projection: new Float32Array(16),
  view: new Float32Array(16)
}

const setupCamera = regl({
  context: {
    projection: function ({viewportWidth, viewportHeight}) {
      return mat4.perspective(this.projection,
        this.fov,
        viewportWidth / viewportHeight,
        0.01,
        1000.0)
    },
    view: function (context, {eye, target}) {
      return mat4.lookAt(this.view,
        eye,
        target,
        [0, 1, 0])
    },
    eye: regl.prop('eye')
  }
}).bind(cameraProps)

const vertexShader = `
  precision highp float;
  attribute vec3 position, normal;
  uniform mat4 projection, view, model;
  uniform vec3 eye;
  varying vec3 eyeDir, fragNormal;

  void main () {
    vec4 worldPos = model * vec4(position, 1);
    vec4 worldNormal = model * vec4(normal, 0);

    fragNormal = normalize(worldNormal.xyz);
    eyeDir = normalize(eye - worldPos.xyz);
    gl_Position = projection * view * worldPos;
  }
`

const drawBunny = regl({
  frag: `
  precision highp float;
  uniform vec3 tint;
  uniform samplerCube envMap;
  varying vec3 eyeDir, fragNormal;

  void main () {
    vec4 env = textureCube(envMap, reflect(eyeDir, fragNormal));
    gl_FragColor = vec4(env.rgb * tint, 1);
  }`,

  vert: vertexShader,

  elements: bunny.cells,
  attributes: {
    position: bunny.positions,
    normal: normals(bunny.cells, bunny.positions)
  },

  uniforms: {
    view: regl.context('view'),
    projection: regl.context('projection'),
    eye: regl.context('eye'),
    tint: regl.prop('tint'),
    envMap: bunnyFBO,
    model: (context, {position}) => mat4.translate(
      [], mat4.identity([]), position)
  }
})

const drawTeapot = regl({
  frag: `
  precision highp float;
  uniform vec3 tint;
  uniform samplerCube envMap;
  varying vec3 eyeDir, fragNormal;

  void main () {
    vec4 env = textureCube(envMap, reflect(eyeDir, fragNormal));
    gl_FragColor = vec4(env.rgb * (normalize(fragNormal) + 0.8), 1);
  }`,

  vert: vertexShader,

  elements: teapot.cells,
  attributes: {
    position: teapot.positions.map((p) => [
      2.2 * p[0],
      2.2 * p[1],
      2.2 * p[2]
    ]),
    normal: normals(teapot.cells, teapot.positions)
  },

  uniforms: {
    view: regl.context('view'),
    projection: regl.context('projection'),
    eye: regl.context('eye'),
    tint: regl.prop('tint'),
    envMap: teapotFBO,
    model: (context, {position}) => mat4.translate([], mat4.identity([]), position)
  }
})

// draw checkered floor.
const drawGround = regl({
  frag: `
  precision highp float;
  varying vec2 uv;
  void main () {
    vec2 ptile = step(0.5, fract(uv));
    gl_FragColor = vec4(abs(ptile.x - ptile.y) * vec3(1, 1, 1), 1);
  }
  `,

  vert: `
  precision highp float;
  uniform mat4 projection, view;
  uniform float height, tileSize;
  attribute vec2 p;
  varying vec2 uv;
  void main () {
    uv = p * tileSize;
    gl_Position = projection * view * vec4(100.0 * p.x, height, 100.0 * p.y, 1);
  }
  `,

  attributes: {
    p: [
      -1, -1,
      1, -1,
      -1, 1,
      -1, 1,
      1, -1,
      1, 1
    ]
  },

  uniforms: {
    projection: regl.context('projection'),
    view: regl.context('view'),
    tileSize: regl.prop('tiles'),
    height: regl.prop('height')
  },

  count: 6
})

regl.frame(({tick, drawingBufferWidth, drawingBufferHeight, pixelRatio}) => {
  const t = 0.01 * tick

  const bunnyPos = [
    15.0 * Math.cos(t),
    -2.5,
    15.0 * Math.sin(t)
  ]

  const teapotPos = [0, 3, 0]

  // render teapot cube map
  setupCube({
    fbo: teapotFBO,
    center: teapotPos
  }, () => {
    regl.clear({
      color: [0.2, 0.2, 0.2, 1],
      depth: 1
    })
    drawGround({
      height: GROUND_HEIGHT,
      tiles: GROUND_TILES
    })
    drawBunny({
      tint: BUNNY_TINT,
      position: bunnyPos
    })
  })

  // render bunny cube map
  setupCube({
    fbo: bunnyFBO,
    center: bunnyPos
  }, () => {
    regl.clear({
      color: [0, 0, 0, 1],
      depth: 1
    })
    drawGround({
      height: GROUND_HEIGHT,
      tiles: GROUND_TILES
    })
    drawTeapot({
      tint: TEAPOT_TINT,
      position: teapotPos
    })
  })

  const theta = 2.0 * Math.PI * (pixelRatio * mouse.x / drawingBufferWidth - 0.5)
  setupCamera({
    eye: [
      20.0 * Math.cos(theta),
      30.0 * (0.5 - pixelRatio * mouse.y / drawingBufferHeight),
      20.0 * Math.sin(theta)
    ],
    target: [0, 0, 0]
  }, ({eye, tick}) => {
    regl.clear({
      color: [0, 0, 0, 1],
      depth: 1
    })
    drawGround({
      height: GROUND_HEIGHT,
      tiles: GROUND_TILES
    })
    drawTeapot({
      tint: TEAPOT_TINT,
      position: teapotPos
    })
    drawBunny({
      tint: BUNNY_TINT,
      position: bunnyPos
    })
  })
})
