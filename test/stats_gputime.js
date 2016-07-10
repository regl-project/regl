var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('test gpuTime', function (t) {
  var gl = createContext(100, 100)
  var regl = createREGL(gl)

  regl = createREGL(gl)

  var draw1 = regl({
    frag: [
      'precision mediump float;',
      'void main () { gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0); } '
    ].join('\n'),
    vert: [
      'precision mediump float;',
      'attribute vec2 position;',
      'uniform vec2 offset;',
      'void main () {gl_Position = vec4(position+offset, 0, 1); }'
    ].join('\n'),
    attributes: { position: [[-1, 0], [0, -1], [1, 1]] },
    uniforms: {
      color: [1, 0, 0, 1],
      offset: regl.prop('offset')
    },
    count: 3
  })

  var draw2 = regl({
    frag: [
      'precision mediump float;',
      'void main () { gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0); } '
    ].join('\n'),
    vert: [
      'precision mediump float;',
      'attribute vec2 position;',
      'uniform vec2 offset;',
      'void main () {gl_Position = vec4(position+offset, 0, 1); }'
    ].join('\n'),
    attributes: { position: [[-1, 0], [0, -1], [1, 1]] },
    uniforms: {
      color: [1, 0, 0, 1],
      offset: regl.prop('offset')
    },
    count: 3
  })

  t.ok(draw1.stats.gpuTime === 0, 'draw1.stats.gpuTime=0 at startup')
  t.ok(draw2.stats.gpuTime === 0, 'draw2.stats.gpuTime=0 at startup')

  var testCases = [
    [
      () => {
        var batch = []
        for (var i = 0; i < 10; ++i) {
          batch.push({offset: [0, 0.1*i]})
        }
        draw1(batch)

        draw2({offset: [0, 0.1]})
      },
      () => {
        t.ok(draw1.stats.gpuTime > 0, 'draw1.stats.gpuTime>0 after batch call')
        t.ok(draw2.stats.gpuTime > 0, 'draw1.stats.gpuTime>0 after one-shot call')

        // draw1 should certainly take more time than draw2, because more stuff was drawn.
        t.ok(draw1.stats.gpuTime > draw2.stats.gpuTime, 'draw1.stats.gpuTime>draw2.stats.gpuTime')
      }
    ],
  ]

  var temp = null

  function processCase () {
    if(temp !== null) {
      regl.updateTimer()
      temp[1]()
    }
    var testCase = testCases.pop()

    if (testCase) {
      testCase[0]()
      temp = testCase
      setTimeout(processCase, 200)
    } else {
      regl.destroy()
      createContext.destroy(gl)
      t.end()
    }
  }
  processCase()

})
