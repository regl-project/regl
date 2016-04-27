var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('viewport', function (t) {
  var gl = createContext(16, 16)
  var regl = createREGL(gl)

  function testFlags (prefix, flags) {
    var box = gl.getParameter(gl.VIEWPORT)
    var fbox = flags.viewport
    if ('x' in fbox) {
      t.equals(box[0], fbox.x, prefix + 'box.x')
    } else {
      t.equals(box[0], 0, prefix + 'box.x')
    }
    if ('y' in fbox) {
      t.equals(box[1], fbox.y, prefix + 'box.y')
    } else {
      t.equals(box[1], 0, prefix + 'box.y')
    }
    if ('w' in fbox) {
      t.equals(box[2], fbox.w, prefix + 'box.w')
    } else {
      t.equals(box[2], gl.drawingBufferWidth - box[0], prefix + 'box.w')
    }
    if ('h' in fbox) {
      t.equals(box[3], fbox.h, prefix + 'box.h')
    } else {
      t.equals(box[3], gl.drawingBufferHeight - box[1], prefix + 'box.h')
    }
  }

  var permutations = [
    {
      viewport: {}
    },
    {
      viewport: {
        x: 5,
        y: 1
      }
    },
    {
      viewport: {
        w: 10,
        h: 10
      }
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
    viewport: regl.prop('viewport')
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

  // TODO test resizing

  regl.destroy()
  t.end()
})
