const mat4 = require('gl-mat4')

module.exports = function (regl) {
  var cubePosition = [
    [-0.5, +0.5, +0.5], [+0.5, +0.5, +0.5], [+0.5, -0.5, +0.5], [-0.5, -0.5, +0.5], // positive z face.
    [+0.5, +0.5, +0.5], [+0.5, +0.5, -0.5], [+0.5, -0.5, -0.5], [+0.5, -0.5, +0.5], // positive x face
    [+0.5, +0.5, -0.5], [-0.5, +0.5, -0.5], [-0.5, -0.5, -0.5], [+0.5, -0.5, -0.5], // negative z face
    [-0.5, +0.5, -0.5], [-0.5, +0.5, +0.5], [-0.5, -0.5, +0.5], [-0.5, -0.5, -0.5], // negative x face.
    [-0.5, +0.5, -0.5], [+0.5, +0.5, -0.5], [+0.5, +0.5, +0.5], [-0.5, +0.5, +0.5], // top face
    [-0.5, -0.5, -0.5], [+0.5, -0.5, -0.5], [+0.5, -0.5, +0.5], [-0.5, -0.5, +0.5]  // bottom face
  ]

  var cubeUv = [
    [0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0], // positive z face.
    [0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0], // positive x face.
    [0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0], // negative z face.
    [0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0], // negative x face.
    [0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0], // top face
    [0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]  // bottom face
  ]

  const cubeElements = [
    [2, 1, 0], [2, 0, 3],       // positive z face.
    [6, 5, 4], [6, 4, 7],       // positive x face.
    [10, 9, 8], [10, 8, 11],    // negative z face.
    [14, 13, 12], [14, 12, 15], // negative x face.
    [18, 17, 16], [18, 16, 19], // top face.
    [20, 21, 22], [23, 20, 22]  // bottom face
  ]

  return regl({
    profile: false,
    frag: `
    precision mediump float;
    varying vec2 vUv;
    uniform sampler2D tex;
    void main () {
      gl_FragColor = texture2D(tex,vUv*7.0);
      //      gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);

    }`,
    vert: `
    precision mediump float;
    attribute vec3 position;
    attribute vec2 uv;
    varying vec2 vUv;
    uniform mat4 projection, view;
    void main() {
      vUv = uv;
      gl_Position = projection * view * vec4(position, 1);
    }`,
    attributes: {
      position: cubePosition,
      uv: cubeUv
    },
    elements: cubeElements,
    uniforms: {

      view: (_, props, batchId) => {
        const t = 0.01 * props.tick
        return mat4.lookAt([],
                           [5 * Math.cos(t), 2.5 * Math.sin(t), 5 * Math.sin(t)],
                           [0, 0.0, 0],
                           [0, 1, 0])
      },

      projection: ({viewportWidth, viewportHeight}) => {
        return mat4.perspective([],
                                Math.PI / 4,
                                viewportWidth / viewportHeight,
                                0.01,
                                10) },
      tex: regl.texture({
        min: 'nearest',
        mag: 'nearest',
        wrap: 'repeat',

        data: [
          [255, 128],
          [128, 255]
        ]
      })
    }
  })
}
