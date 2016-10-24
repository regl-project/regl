var tape = require('tape')
var createContext = require('./util/create-context')
var createREGL = require('../regl')

tape('batch mode attributes', function (t) {
  var gl = createContext(5, 5)
  var regl = createREGL(gl)

  var command = regl({
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
      'gl_Position=vec4(2.0 * (position + 0.5) / 5.0 - 1.0, 0, 1);',
      '}'
    ].join('\n'),

    attributes: {
      position: regl.prop('position')
    },

    depth: {enable: false, mask: false},

    primitive: regl.prop('primitive'),
    count: regl.prop('count'),
    offset: regl.prop('offset'),
    instances: regl.prop('instances')
  })

  function checkPixmap (args, expected, remark) {
    regl.clear({
      color: [0, 0, 0, 0]
    })
    command(args)
    var pixels = regl.read()
    var actual = new Array(25)
    for (var i = 0; i < 25; ++i) {
      actual[i] = Math.min(pixels[4 * i], 1)
    }
    t.same(actual, expected, remark)
  }

  // point
  checkPixmap({
    position: regl.buffer([0, 0]),
    primitive: 'points',
    count: 1,
    offset: 0,
    instances: -1
  }, [
    1, 0, 0, 0, 0,
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0
  ], 'point simple')

  // point
  checkPixmap({
    position: regl.buffer([3, 1]),
    primitive: 'points',
    count: 1,
    offset: 0,
    instances: -1
  }, [
    0, 0, 0, 0, 0,
    0, 0, 0, 1, 0,
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0
  ], 'point 3,1')

  // point batch
  checkPixmap([{
    position: regl.buffer([0, 0]),
    primitive: 'points',
    count: 1,
    offset: 0,
    instances: -1
  }, {
    position: regl.buffer([2, 2, 2, 4]),
    primitive: 'points',
    count: 2,
    offset: 0,
    instances: -1
  }], [
    1, 0, 0, 0, 0,
    0, 0, 0, 0, 0,
    0, 0, 1, 0, 0,
    0, 0, 0, 0, 0,
    0, 0, 1, 0, 0
  ], 'batch points')

  checkPixmap([{
    position: {buffer: regl.buffer([0, 0, 4, 0, 4, 4, -1, 4]), offset: 0},
    primitive: 'line strip',
    count: 4,
    offset: 0,
    instances: -1
  }], [
    1, 1, 1, 1, 1,
    0, 0, 0, 0, 1,
    0, 0, 0, 0, 1,
    0, 0, 0, 0, 1,
    1, 1, 1, 1, 1
  ], 'line strip')

  // check offsets
  checkPixmap({
    position: regl.buffer([0, 0, 1, 0]),
    primitive: 'point',
    count: 1,
    offset: 1,
    instances: -1
  }, [
    0, 1, 0, 0, 0,
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0
  ], 'offset')

  checkPixmap([{
    position: regl.buffer([0, 0, 1, 0]),
    primitive: 'point',
    count: 1,
    offset: 1,
    instances: -1
  }], [
    0, 1, 0, 0, 0,
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0
  ], 'offset - batch')

  regl.destroy()
  t.equals(gl.getError(), 0, 'error ok')
  createContext.destroy(gl)
  t.end()
})
