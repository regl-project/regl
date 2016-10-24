var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('this / state variables', function (t) {
  var gl = createContext(8, 8)
  var regl = createREGL(gl)

  function checkPixmap (slots, args, expected, remark) {
    var base = {
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
        'uniform vec2 offset;',
        'void main() {',
        'gl_Position=vec4(0.25 * (offset + position - 3.5), 0, 1);',
        '}'
      ].join('\n'),

      attributes: {
        position: regl.buffer([0, 0, 4, 0, 4, 4, 0, 4])
      },

      depth: {enable: false, mask: false}
    }

    Object.keys(slots).forEach(function (x) {
      base[x] = slots[x]
    })

    var command = regl(base)

    function checkPixels (suffix) {
      var pixels = regl.read()
      var actual = new Array(64)
      for (var i = 0; i < 64; ++i) {
        actual[i] = Math.min(1, pixels[4 * i])
      }
      t.same(actual, expected, remark + ' - ' + suffix)
    }

    regl.clear({color: [0, 0, 0, 0]})
    command.call(args)
    checkPixels('draw')

    regl.clear({color: [0, 0, 0, 0]})
    command.call(args, 1)
    checkPixels('batch')
  }

  checkPixmap({
    primitive: regl.this('primitive'),
    count: regl.this('count'),
    offset: regl.this('_offset'),
    uniforms: {
      offset: [0, 0]
    }
  }, {
    primitive: 'points',
    count: 3,
    _offset: 1,
    __offset: [0, 0]
  }, [
    0, 0, 0, 0, 1, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    1, 0, 0, 0, 1, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0
  ], 'draw state')

  checkPixmap({
    uniforms: {
      offset: regl.this('offset')
    },
    count: 1,
    primitive: 'points'
  }, {
    offset: [2, 2]
  }, [
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 1, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0
  ], 'uniforms')

  regl.destroy()
  t.equals(gl.getError(), 0, 'error ok')
  createContext.destroy(gl)
  t.end()
})
