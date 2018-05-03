var createContext = require('./util/create-context')
var createREGL = require('../regl')
var tape = require('tape')

tape('destroy bound buffer', function (t) {
  var gl = createContext(8, 8)
  var regl = createREGL(gl)

  var a1 = regl.buffer([[-1, -1], [1, -1], [0, 1]])
  var a2 = regl.buffer([[1, 0, 0], [0, 1, 0], [0, 0, 1]])

  regl({
    vert: [
      'precision mediump float;',
      'attribute vec2 a1;',
      'attribute vec3 a2;',
      'varying vec4 color;',
      'void main() {',
      '  gl_Position = vec4(a1, 0, 1);',
      '  color = vec4(a2, 1);',
      '}'
    ].join('\n'),

    frag: [
      'precision mediump float;',
      'varying vec4 color;',
      'void main() {',
      '  gl_FragColor = color;',
      '}'
    ].join('\n'),

    attributes: {
      a1: a1,
      a2: a2
    },

    primitive: 'points',
    count: 3
  })()

  a2.destroy()

  regl({
    vert: [
      'precision mediump float;',
      'attribute vec2 a1;',
      'varying vec4 color;',
      'void main() {',
      '  gl_Position = vec4(a1, 0, 1);',
      '  color = vec4(1, 1, 1, 1);',
      '}'
    ].join('\n'),

    frag: [
      'precision mediump float;',
      'varying vec4 color;',
      'void main() {',
      '  gl_FragColor = color;',
      '}'
    ].join('\n'),

    attributes: {
      a1: a1
    },

    primitive: 'points',
    count: 3
  })()

  a1.destroy()

  regl.destroy()
  t.equals(gl.getError(), 0, 'error ok')
  createContext.destroy(gl)
  t.end()
})
