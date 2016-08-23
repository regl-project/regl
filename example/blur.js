/*
  tags: advanced, fbo

  <p>This examples demonstrates how we can render a height map, how to place out several models(using the batching feature), and how to
  implement a simple fullscreen post-process effect(using the framebuffer feature) in regl. </p>

  <p> The post-process effect is a simple box filter blur. </p>
*/

const canvas = document.body.appendChild(document.createElement('canvas'))
const fit = require('canvas-fit')
const regl = require('../regl')(canvas)
const mat4 = require('gl-mat4')
const camera = require('canvas-orbit-camera')(canvas)
window.addEventListener('resize', fit(canvas), false)
const bunny = require('bunny')
const normals = require('angle-normals')

// increase and decrease the blur amount by modifying this value.
const FILTER_RADIUS = 1

// configure intial camera view.
camera.rotate([0.0, 0.0], [0.0, -0.4])
camera.zoom(300.0)


// create fbo. We set the size in `regl.frame`
const fbo = regl.framebuffer({
  color: regl.texture({
    width: 1,
    height: 1,
    wrap: 'clamp'
  }),
  depth: true
})

// geometry arrays.
const elements = []
var xzPosition = []

const N = 64 // num quads of the plane

var size = 0.5
var xmin = -size
var xmax = +size
var ymin = -size
var ymax = +size

/*
  For the terrain geometry, we create a plane with min position as (x=-0.5,z=-0.5) and max position as (x=+0.5, z=+0.5).

  In the vertex shader, we enlarge this plane on the x- and z-axis. And the y-values are sampled from the heightmap texture,

  The uv-coordinates are computed from the positions.
  The normals can be approximated from the heightmap texture and the positions.

  So we only have to upload the x- and z-values and the heightmap texture to the GPU, and nothing else.
*/
var row
var col
for (row = 0; row <= N; ++row) {
  var z = (row / N) * (ymax - ymin) + ymin
  for (col = 0; col <= N; ++col) {
    var x = (col / N) * (xmax - xmin) + xmin
    xzPosition.push([x, z])
  }
}

// create plane faces.
for (row = 0; row <= (N - 1); ++row) {
  for (col = 0; col <= (N - 1); ++col) {
    var i = row * (N + 1) + col

    var i0 = i + 0
    var i1 = i + 1
    var i2 = i + (N + 1) + 0
    var i3 = i + (N + 1) + 1

    elements.push([i3, i1, i0])
    elements.push([i0, i2, i3])
  }
}

/*
  This function encapsulates all the state that is common between drawTerrain() and drawBunny()

  Also, configure so that we render to an FBO.
*/
const setupDefault = regl({
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
                       3000),

    // light settings. These can of course by tweaked to your likings.
    lightDir: [0.39, 0.87, 0.29],
    ambientLightAmount: 0.3,
    diffuseLightAmount: 0.7
  },
  framebuffer: fbo
})

const drawTerrain = regl({
  frag: `
  precision mediump float;

  varying vec2 vUv;
  varying vec3 vNormal;

  uniform sampler2D rockTexture;
  uniform vec3 lightDir;
  uniform float ambientLightAmount;
  uniform float diffuseLightAmount;

  void main () {
    vec3 tex = texture2D(rockTexture, vUv*2.0).rgb;

    vec3 ambient = ambientLightAmount * tex;
    vec3 diffuse = diffuseLightAmount * tex * clamp( dot(vNormal, lightDir ), 0.0, 1.0 );

    gl_FragColor = vec4(ambient + diffuse, 1.0);
  }`,
  vert: `
  // the size of the world on the x and z-axes.
#define WORLD_SIZE 300.0
  // the height of the world.
#define WORLD_HEIGHT 100.0

  uniform sampler2D heightTexture;

  float getHeight(vec2 xz) {
    vec2 uv = vec2(0.5, 0.5) + xz.xy;
    return WORLD_HEIGHT*(-1.0 + 2.0 * texture2D(heightTexture, uv).r);
  }

  vec3 getPosition(vec2 xz) {
    return vec3(WORLD_SIZE*xz.x, getHeight(xz), WORLD_SIZE*xz.y);
  }

  precision mediump float;

  attribute vec2 xzPosition;

  varying vec3 vPosition;
  varying vec2 vUv;
  varying vec3 vNormal;

  uniform mat4 projection, view;

  void main() {
    vec3 xyzPosition = getPosition(xzPosition);

    vec2 uv = vec2(0.5, 0.5) + xzPosition.xy;
    vUv = uv;

    float eps = 1.0/16.0;

    // approximate the normal with central differences.
    vec3 va = vec3(2.0*eps,
                   getHeight(xzPosition + vec2(eps,0.0)) - getHeight(xzPosition - vec2(eps,0.0)) , 0.0 );
    vec3 vb = vec3(0.0,
                   getHeight(xzPosition + vec2(0.0, eps)) - getHeight(xzPosition - vec2(0.0, eps)), 2.0*eps );
    vNormal = normalize(cross(normalize(vb), normalize(va) ));

    vPosition = xyzPosition;
    gl_Position = projection * view * vec4(xyzPosition, 1);
  }`,

  uniforms: {
    heightTexture: regl.prop('heightTexture'),
    rockTexture: regl.prop('rockTexture')
  },
  attributes: {
    xzPosition: regl.prop('xzPosition')
  },
  elements: regl.prop('elements')
})

const drawBunny = regl({
  frag: `
  precision mediump float;

  varying vec3 vNormal;

  uniform vec3 lightDir;
  uniform vec3 color;
  uniform float ambientLightAmount;
  uniform float diffuseLightAmount;

  void main () {
    vec3 ambient = ambientLightAmount * color;
    vec3 diffuse = diffuseLightAmount * color * clamp( dot(vNormal, lightDir ), 0.0, 1.0 );

    gl_FragColor = vec4(ambient + diffuse, 1.0);
  }`,
  vert: `
  precision mediump float;

  attribute vec3 position;
  attribute vec3 normal;

  varying vec3 vNormal;

  uniform mat4 projection, model, view;

  void main () {
    vNormal = normal;
    gl_Position = projection * view * model * vec4(position, 1.0);
  }`,
  attributes: {
    position: bunny.positions,
    normal: normals(bunny.cells, bunny.positions)
  },
  elements: bunny.cells,
  uniforms: {
    model: (_, props, batchId) => {
      /*
        By using props, we translate the bunny, scale it, and rotate it.
        */
      var m = mat4.identity([])

      mat4.translate(m, m, props.position)

      var s = props.scale
      mat4.scale(m, m, [s, s, s])

      var r = props.rotation
      mat4.rotateX(m, m, r[0])
      mat4.rotateY(m, m, r[1])
      mat4.rotateZ(m, m, r[2])

      return m
    },
    color: regl.prop('color')
  }
})

const drawFboBlurred = regl({
  frag: `
  precision mediump float;
  varying vec2 uv;
  uniform sampler2D tex;
  uniform float wRcp, hRcp;
#define R int(${FILTER_RADIUS})

  void main() {

    float W =  float((1 + 2 * R) * (1 + 2 * R));

    vec3 avg = vec3(0.0);
    for (int x = -R; x <= +R; x++) {
      for (int y = -R; y <= +R; y++) {
        avg += (1.0 / W) * texture2D(tex, uv + vec2(float(x) * wRcp, float(y) * hRcp)).xyz;
      }
    }

    gl_FragColor = vec4(avg, 1.0);
  }`,

  vert: `
  precision mediump float;
  attribute vec2 position;
  varying vec2 uv;
  void main() {
    uv = 0.5 * (position + 1.0);
    gl_Position = vec4(position, 0, 1);
  }`,
  attributes: {
    position: [ -4, -4, 4, -4, 0, 4 ]
  },
  uniforms: {
    tex: ({count}) => fbo,
    wRcp: ({viewportWidth}) => 1.0 / viewportWidth,
    hRcp: ({viewportHeight}) => 1.0 / viewportHeight
  },
  depth: { enable: false },
  count: 3
})

require('resl')({
  manifest: {
    heightTexture: {
      type: 'image',
      src: 'assets/textureplane.png',
      parser: (data) => regl.texture({
        data: data
      })
    },
    rockTexture: {
      type: 'image',
      src: 'assets/rock_texture.png',
      parser: (data) => regl.texture({
        data: data,
        wrap: 'repeat'
      })
    }
  },

  onDone: ({ heightTexture, rockTexture }) => {
    regl.frame(({deltaTime, viewportWidth, viewportHeight}) => {
      /*
        We need to set the FBO size in `regl.frame`, because the viewport size will change if
        the user resizes the browser window.

        However, note that regl is clever, and will only actually resize the fbo when the
        viewport size actually changes!
       */
      fbo.resize(viewportWidth, viewportHeight)

      // begin render to FBO
      setupDefault({}, () => {
        regl.clear({
          color: [0, 0, 0, 255],
          depth: 1
        })

        drawTerrain({elements, xzPosition, heightTexture, rockTexture})

        drawBunny([
          {color: [0.4, 0.2, 0.1], scale: 1.7, position: [0.0, -65.0, 0.0], rotation: [0.0, 0.8, 0.0]},
          {color: [0.6, 0.2, 0.5], scale: 5.2, position: [30.0, -65.0, -80.0], rotation: [-0.5, 0.0, 0.0]},
          {color: [0.4, 0.2, 0.6], scale: 1.5, position: [120.0, -55.0, -100.0], rotation: [-0.5, 1.9, 0.0]},
          {color: [0.7, 0.7, 0.7], scale: 2.2, position: [50.0, -60.0, 0.0], rotation: [-0.2, 0.0, 0.0]},
          {color: [0.0, 0.2, 0.5], scale: 1.0, position: [-50.0, -60.0, 0.0], rotation: [0.0, 1.2, 0.0]},
          {color: [0.4, 0.4, 0.0], scale: 1.0, position: [-50.0, -45.0, 40.0], rotation: [0.0, 0, -0.6]},
          {color: [0.2, 0.2, 0.2], scale: 3.3, position: [100.0, -65.0, 50.0], rotation: [0.0, -0.4, -0.0]},
          {color: [0.4, 0.1, 0.1], scale: 2.1, position: [70.0, -65.0, 80.0], rotation: [0.1, 0.6, 0.2]},
          {color: [0.2, 0.5, 0.2], scale: 6.1, position: [-50.0, -70.0, 80.0], rotation: [0.0, -0.9, 0.0]},
          {color: [0.3, 0.5, 0.5], scale: 4.1, position: [-50.0, -70.0, -60.0], rotation: [0.7, -0.0, 0.0]},
          {color: [0.4, 0.4, 0.1], scale: 1.8, position: [-80.0, -50.0, -110.0], rotation: [0.0, -0.0, 0.0]},
          {color: [0.7, 0.4, 0.1], scale: 1.3, position: [-120.0, -85.0, -40.0], rotation: [0.0, +2.1, -0.3]}
        ])
      })
      // end render to FBO

      regl.clear({
        color: [0, 0, 0, 255],
        depth: 1
      })

      // Now render fbo to quad, but also blur it.
      drawFboBlurred()

      camera.tick()
    })
  }
})
