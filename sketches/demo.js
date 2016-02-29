var canvas = document.createElement('canvas')
document.body.appendChild(canvas)

var regl = require('regl')(canvas.getContext('webgl'))

var state = regl.state({
  clearColor: [1, 0, 0, 1]
})

var draw = regl({
  fragShader: [
    'void main() {',
    '  gl_FragColor = vec4(0, 0, 0, 1);',
    '}'
  ].join('\n'),

  vertShader: [
    'attribute vec2 position;',
    'void main() {',
    '  gl_Position = vec4(position, 0, 1);',
    '}'
  ].join('\n'),

  uniforms: {
    color: [0, 0, 1, 1]
  },

  attributes: {
    position: regl.buffer(new Float32Array([
      -2, -2,
      4, -2,
      4, 4
    ]))
  },

  count: 1
})

regl.exec(state, draw)
