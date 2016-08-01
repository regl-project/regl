var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('scope', function (t) {
  var gl = createContext(8, 8)
  var regl = createREGL(gl)

  function checkPixmap (expected, remark) {
    var pixels = regl.read()
    var actual = Array(64)
    for (var i = 0; i < 64; ++i) {
      actual[i] = Math.min(1, pixels[4 * i])
    }
    t.same(actual, expected, remark)
  }

  var scope = regl({
    frag: [
      'precision mediump float;',
      'void main() {',
      'gl_FragColor = vec4(1, 1, 1, 1);',
      '}'
    ].join('\n'),

    vert: [
      'precision mediump float;',
      'attribute vec2 position;',
      'varying vec4 fragColor;',
      'void main() {',
      'gl_Position=vec4(0.25 * (position - 3.5), 0, 1);',
      '}'
    ].join('\n'),

    attributes: {
      position: regl.prop('position')
    },
    primitive: regl.prop('primitive'),
    offset: regl.prop('offset'),
    count: regl.prop('count'),

    depth: {enable: false, mask: false}
  })

  // properties:
  //  attributes
  //  uniforms
  //  draw state
  //  elements
  //  glstate
  //  shaders

  // sequences to test
  // scope (draw - batch - draw) sequence
  // scope (batch - batch) sequence
  // scope (draw - scope ( draw ) - draw)

  // reentrant scope with attributes

  regl.clear({
    color: [0, 0, 0, 0]
  })
  scope({
    position: regl.buffer([0, 0, 4, 0, 4, 4, 0, 4]),
    count: 4,
    offset: 0,
    primitive: 'points'
  }, function () {
    scope({
      position: regl.buffer([2, 2]),
      count: 1,
      offset: 0,
      primitive: 'points'
    })
    checkPixmap([
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 1, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0
    ], 'scope (draw - batch - draw) : first draw')

    scope([{
      position: regl.buffer([3, 3]),
      count: 1,
      offset: 0,
      primitive: 'points'
    }])
    checkPixmap([
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 1, 0, 0, 0, 0, 0,
      0, 0, 0, 1, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0
    ], 'scope (draw - batch - draw) : second draw')

    regl.draw()
  })
  checkPixmap([
    1, 0, 0, 0, 1, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 1, 0, 0, 0, 0, 0,
    0, 0, 0, 1, 0, 0, 0, 0,
    1, 0, 0, 0, 1, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0
  ], 'scope (draw - batch - draw) : result')

  // test setting uniforms with scope

  regl.destroy()
  t.equals(gl.getError(), 0, 'error ok')
  createContext.destroy(gl)
  t.end()
})
