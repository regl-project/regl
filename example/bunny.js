var regl = require('../regl')()
var mat4 = require('gl-mat4')
var bunny = require('bunny')

var drawBunny = regl({
  vert: `
  precision mediump float;
  attribute vec3 position;
  uniform mat4 model, view, projection;
  void main() {
    gl_Position = projection * view * model * vec4(position, 1);
  }`,

  frag: `
  precision mediump float;
  void main() {
    gl_FragColor = vec4(1, 1, 1, 1);
  }`,

  attributes: {
    position: regl.buffer(bunny.positions)
  },

  elements: regl.elements(bunny.cells),

  uniforms: {
    model: mat4.identity([]),
    view: function (args, batchId, stats) {
      var t = 0.01 * stats.count
      return mat4.lookAt([],
        [30 * Math.cos(t), 2.5, 30 * Math.sin(t)],
        [0, 2.5, 0],
        [0, 1, 0])
    },
    projection: function (args, batchId, stats) {
      return mat4.perspective([],
        Math.PI / 4,
        stats.width / stats.height,
        0.01,
        1000)
    }
  }
})

regl.frame(function () {
  regl.clear({
    depth: 1,
    color: [0, 0, 0, 1]
  })

  drawBunny()
})
