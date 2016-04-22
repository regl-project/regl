const regl = require('../regl')()
const mat4 = require('gl-mat4')
const bunny = require('bunny')
const normals = require('angle-normals')

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

  vert: `
  precision mediump float;
  varying vec3 reflectDir;
  void main() { gl_Position = vec4(0,0,0,0); }
  `,

  uniforms: {
    envmap: regl.texture('assets/ogd-oregon-360.jpg'),

    view: regl.prop('view'),

    projection: (args, batchId, {width, heigth}) =>
      mat4.perspective([],
        Math.PI / 4,
        regl.stats.width / regl.stats.height,
        0.01,
        1000),

    invView: ({view}) => mat4.invert([], view)
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
    position: regl.buffer([
      -4, -4,
      -4, 4,
      8, 0])
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
    vec4 eye = invView * vec4(0, 0, 0, 1);
    reflectDir = reflect(
      normalize(position.xyz - eye.xyz / eye.w),
      normal);
    gl_Position = projection * view * vec4(position, 1);
  }`,

  attributes: {
    position: regl.buffer(bunny.positions),
    normal: regl.buffer(normals(bunny.cells, bunny.positions))
  },

  elements: regl.elements(bunny.cells)
})

regl.frame(() => {
  const t = 0.01 * regl.stats.count

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
