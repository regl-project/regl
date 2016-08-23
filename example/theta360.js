/*
  tags: basic

  <p>This example shows how to render a 360 panoramic environment map.</p>

 */

const regl = require('../regl')()
const mat4 = require('gl-mat4')
const bunny = require('bunny')
const normals = require('angle-normals')

const envmap = regl.texture()

const setupEnvMap = regl({
  frag: `
  precision mediump float;
  uniform sampler2D envmap;
  varying vec3 reflectDir;

  #define PI ${Math.PI}

  vec4 lookupEnv (vec3 dir) {
    float lat = atan(dir.z, dir.x);
    float lon = acos(dir.y / length(dir));
    return texture2D(envmap, vec2(
      0.5 + lat / (2.0 * PI),
      lon / PI));
  }

  void main () {
    gl_FragColor = lookupEnv(reflectDir);
  }`,

  uniforms: {
    envmap: envmap,

    view: regl.prop('view'),

    projection: ({viewportWidth, viewportHeight}) =>
      mat4.perspective([],
        Math.PI / 4,
        viewportWidth / viewportHeight,
        0.01,
        1000),

    invView: (context, {view}) => mat4.invert([], view)
  }
})

const drawBackground = regl({
  vert: `
  precision mediump float;
  attribute vec2 position;
  uniform mat4 view;
  varying vec3 reflectDir;
  void main() {
    reflectDir = (view * vec4(position, 1, 0)).xyz;
    gl_Position = vec4(position, 0, 1);
  }`,

  attributes: {
    position: [
      -4, -4,
      -4, 4,
      8, 0]
  },

  depth: {
    mask: false,
    enable: false
  },

  count: 3
})

const drawBunny = regl({
  vert: `
  precision mediump float;
  attribute vec3 position, normal;
  uniform mat4 projection, view, invView;
  varying vec3 reflectDir;
  void main() {
    vec4 cameraPosition = view * vec4(position, 1);
    vec3 eye = normalize(position - invView[3].xyz / invView[3].w);
    reflectDir = reflect(eye, normal);
    gl_Position = projection * cameraPosition;
  }`,

  attributes: {
    position: bunny.positions,
    normal: normals(bunny.cells, bunny.positions)
  },

  elements: bunny.cells
})

require('resl')({
  manifest: {
    envmap: {
      type: 'image',
      stream: true,
      src: 'assets/ogd-oregon-360.jpg',
      parser: envmap
    }
  },
  onDone: () => {
    regl.frame(({tick}) => {
      const t = 0.01 * tick
      setupEnvMap({
        view: mat4.lookAt([],
          [30 * Math.cos(t), 2.5, 30 * Math.sin(t)],
          [0, 2.5, 0],
          [0, 1, 0])
      }, () => {
        drawBackground()
        drawBunny()
      })
    })
  },
  onProgress: (fraction) => {
    const intensity = 1.0 - fraction
    regl.clear({
      color: [intensity, intensity, intensity, 1]
    })
  }
})
