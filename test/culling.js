var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

var faces = require('../lib/constants/face.json')

tape('culling', function (t) {
  var gl = createContext(16, 16)
  var regl = createREGL(gl)

  function testFlags (prefix, flags) {
    function same (pname, value, str) {
      t.equals(gl.getParameter(pname), value, prefix + ' ' + str)
    }

    same(gl.CULL_FACE, flags.enable, 'enable')
    same(gl.CULL_FACE_MODE, faces[flags.face], 'face')
  }

  var permutations = [
    {
      enable: true,
      face: 'back'
    },
    {
      enable: false,
      face: 'front'
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
    cull: {
      enable: regl.prop('enable'),
      face: regl.prop('face')
    }
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
    var staticDraw = regl(Object.assign({
      cull: params
    }, staticOptions))
    staticDraw()
    testFlags('static - ', params)
  })

  regl.destroy()
  t.end()
})
