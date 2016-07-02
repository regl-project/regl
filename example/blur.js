const canvas = document.body.appendChild(document.createElement('canvas'))
const fit = require('canvas-fit')
const regl = require('../regl')(canvas)
const mat4 = require('gl-mat4')
const camera = require('canvas-orbit-camera')(canvas)
window.addEventListener('resize', fit(canvas), false)

// configure intial camera view.
camera.rotate([0.0, 0.0], [0.0, -0.4])
camera.zoom(-10.0)

// geometry arrays.
const elements = []
var xzPosition = []

const N = 64 // num quads of the plane

var size = 0.5
var xmin = -size
var xmax = +size
var ymin = -size
var ymax = +size

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

const setupDefault = regl({
  cull: {
    enable: true
  },
  uniforms: {
    view: () => camera.view(),
    projection: ({viewportWidth, viewportHeight}) =>
      mat4.perspective([],
                       Math.PI / 4,
                       viewportWidth / viewportHeight,
                       0.01,
                       1000)
  }
})

const drawTerrain = regl({
  frag: `
  precision mediump float;

  varying vec3 vPosition;
  varying vec2 vUv;
  varying vec3 vNormal;

  uniform sampler2D rockTexture;

  void main () {
    vec3 tex = texture2D(rockTexture, vUv*2.0).rgb;
    vec3 lightDir = normalize(vec3(0.4, 0.9, 0.3));

    vec3 ambient = 0.3 * tex;
    vec3 diffuse = 0.7 * tex * clamp( dot(vNormal, lightDir ), 0.0, 1.0 );

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
  uniform mat4 projection, view;

  varying vec3 vPosition;
  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vec3 xyzPosition = getPosition(xzPosition);

    vec2 uv = vec2(0.5, 0.5) + xzPosition.xy;
    vUv = uv;

    float eps = 1.0/16.0;

    // approximate the normal by central differences.
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
    regl.frame(({deltaTime}) => {
      regl.clear({
        color: [0, 0, 0, 255],
        depth: 1
      })

      setupDefault({}, () => {
        drawTerrain({elements, xzPosition, heightTexture, rockTexture})
        camera.tick()
      })
    })
  }
})
