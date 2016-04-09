var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

var orientation = require('../lib/constants/orientation.json')

tape('misc. state', function (t) {
  var gl = createContext(16, 16)
  var regl = createREGL(gl)

  // dither
  // frontFace
  // lineWidth
  // colorMask

  function testFlags (prefix, flags) {
    function same (pname, value, str) {
      t.same(gl.getParameter(pname), value, prefix + ' ' + str)
    }

    same(gl.DITHER, flags.dither, 'dither')
    same(gl.FRONT_FACE, orientation[flags.frontFace], 'frontFace')
    same(gl.LINE_WIDTH, flags.lineWidth, 'lineWidth')
    same(gl.COLOR_WRITEMASK, flags.colorMask, 'colorMask')
  }

  var permutations = [
    {
      dither: true,
      frontFace: 'ccw',
      lineWidth: 5,
      colorMask: [false, true, false, true]
    },
    {
      dither: false,
      frontFace: 'cw',
      lineWidth: 1,
      colorMask: [true, true, false, true]
    }
  ]

  var staticOptions = {
    frag: [
      'precision mediump float;',
      'uniform vec4 color;',
      'void main() {',
      '  gl_FragColor = vec4(1, 0, 0, 1);',
      '}'
    ].join('\n'),

    vert: [
      'precision mediump float;',
      'attribute vec2 position;',
      'void main() {',
      '  gl_Position = vec4(position, 0, 1);',
      '}'
    ].join('\n'),

    attributes: {
      position: regl.buffer([
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [1, 0],
        [1, 1]
      ])
    },

    count: 6
  }

  var dynamicDraw = regl(Object.assign({
    dither: regl.prop('dither'),
    frontFace: regl.prop('frontFace'),
    lineWidth: regl.prop('lineWidth'),
    colorMask: regl.prop('colorMask')
  }, staticOptions))

  permutations.forEach(function (params) {
    dynamicDraw(params)
    testFlags('dynamic 1-shot - ', params)
  })

  permutations.forEach(function (params) {
    dynamicDraw([params])
    testFlags('batch - ', params)
  })

  permutations.forEach(function (params) {
    var staticDraw = regl(Object.assign({}, params, staticOptions))
    staticDraw()
    testFlags('static - ', params)
  })

  regl.destroy()
  t.end()
})
