const regl = require('../regl')()
const mat4 = require('gl-mat4')
const bunny = require('bunny')
const normals = require('angle-normals')

const envmap = regl.cube(
  'posx.jpg',
  'negx.jpg',
  'posy.jpg',
  'negy.jpg',
  'posz.jpg',
  'negz.jpg')

const drawCube = regl({
  frag: `
  precision mediump float;
  uniform mat4 view, projection, invView;
  uniform samplerCube envmap;
  varying vec3 fragPosition;
  void main() {
    vec4 dir = view * vec4(fragPosition, 0.0);
    gl_FragColor = textureCube(envmap, normalize(dir.xyz));
  }`,

  vert: `
  precision mediump float;
  attribute vec2 position;
  varying vec3 fragPosition;
  void main() {
    fragPosition = vec3(position, 1);
    gl_Position = vec4(position, 0, 1);
  }`,

  attributes: {
    position: regl.buffer([
      -4, -4,
      -4, 4,
      8, 0])
  },

  uniforms: {
    envmap,
    view: regl.prop('view'),
    projection: regl.prop('projection'),
    invView: regl.prop('invView')
  },

  depth: {
    mask: false,
    enable: false
  },

  count: 3
})

const drawBunny = regl({
  frag: `
  precision mediump float;
  uniform samplerCube envmap;
  varying vec3 lightRay;
  void main() {
    gl_FragColor = textureCube(envmap, lightRay);
  }`,

  vert: `
  precision mediump float;
  attribute vec3 position, normal;
  uniform mat4 projection, view, invView;
  varying vec3 lightRay;
  void main() {
    vec4 eye = invView * vec4(0, 0, 0, 1);
    lightRay = reflect(
      normalize(position.xyz - eye.xyz / eye.w),
      normal);
    gl_Position = projection * view * vec4(position, 1);
  }`,

  uniforms: {
    envmap,
    view: regl.prop('view'),
    projection: regl.prop('projection'),
    invView: regl.prop('invView')
  },

  attributes: {
    position: regl.buffer(bunny.positions),
    normal: regl.buffer(normals(bunny.cells, bunny.positions))
  },

  elements: regl.elements(bunny.cells)
})

regl.frame(() => {
  const t = 0.01 * regl.stats.count

  const view = mat4.lookAt([],
    [30 * Math.cos(t), 2.5, 30 * Math.sin(t)],
    [0, 2.5, 0],
    [0, 1, 0])

  const projection = mat4.perspective([],
    Math.PI / 4,
    regl.stats.width / regl.stats.height,
    0.01,
    1000)

  const invView = mat4.invert([], view)

  drawCube({
    view,
    projection,
    invView
  })

  drawBunny({
    view,
    projection,
    invView
  })
})
