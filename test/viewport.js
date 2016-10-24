var extend = require('../lib/util/extend')
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
    if ('width' in fbox) {
      t.equals(box[2], fbox.width, prefix + 'box.width')
    } else {
      t.equals(box[2], gl.drawingBufferWidth - box[0], prefix + 'box.width')
    }
    if ('height' in fbox) {
      t.equals(box[3], fbox.height, prefix + 'box.height')
    } else {
      t.equals(box[3], gl.drawingBufferHeight - box[1], prefix + 'box.height')
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
        width: 10,
        height: 10
      }
    },
    {
      viewport: {
        x: -1,
        y: -10,
        width: 100,
        height: 100
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

  var dynamicDraw = regl(extend({
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
    var staticDraw = regl(extend(extend({}, params), staticOptions))
    staticDraw()
    testFlags('static - ', params)
  })

  // TODO test resizing

  regl.destroy()
  t.equals(gl.getError(), 0, 'error ok')
  createContext.destroy(gl)
  t.end()
})
