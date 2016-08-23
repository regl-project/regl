/*
  tags: advanced

  <p>This example shows how you can render reflections with an environment map.</p>

 */

const regl = require('../regl')()
const mat4 = require('gl-mat4')
const bunny = require('bunny')
const normals = require('angle-normals')

const setupEnvMap = regl({
  context: {
    view: ({tick}) => {
      const t = 0.01 * tick
      return mat4.lookAt([],
        [30 * Math.cos(t), 2.5, 30 * Math.sin(t)],
        [0, 2.5, 0],
        [0, 1, 0])
    }
  },
  frag: `
  precision mediump float;
  uniform samplerCube envmap;
  varying vec3 reflectDir;
  void main () {
    gl_FragColor = textureCube(envmap, reflectDir);
  }`,
  uniforms: {
    envmap: regl.prop('cube'),
    view: regl.context('view'),
    projection: ({viewportWidth, viewportHeight}) =>
      mat4.perspective([],
        Math.PI / 4,
        viewportWidth / viewportHeight,
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
    vec4 eye = invView * vec4(0, 0, 0, 1);
    reflectDir = reflect(
      normalize(position.xyz - eye.xyz / eye.w),
      normal);
    gl_Position = projection * view * vec4(position, 1);
  }`,
  attributes: {
    position: bunny.positions,
    normal: normals(bunny.cells, bunny.positions)
  },
  elements: bunny.cells
})

require('resl')({
  manifest: {
    posx: {
      type: 'image',
      src: 'assets/posx.jpg'
    },
    negx: {
      type: 'image',
      src: 'assets/negx.jpg'
    },
    posy: {
      type: 'image',
      src: 'assets/posy.jpg'
    },
    negy: {
      type: 'image',
      src: 'assets/negy.jpg'
    },
    posz: {
      type: 'image',
      src: 'assets/posz.jpg'
    },
    negz: {
      type: 'image',
      src: 'assets/negz.jpg'
    }
  },

  onDone: ({ posx, negx, posy, negy, posz, negz }) => {
    const cube = regl.cube(
      posx, negx,
      posy, negy,
      posz, negz)
    regl.frame(() => {
      setupEnvMap({ cube }, () => {
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
