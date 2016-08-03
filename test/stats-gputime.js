var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('test gpuTime', function (t) {
  var gl = createContext(100, 100)

  var regl = createREGL({
    gl: gl,
    optionalExtensions: 'ext_disjoint_timer_query'
  })

  if (regl.hasExtension('ext_disjoint_timer_query')) {
    t.equals(gl.getError(), 0, 'error code ok')

    var obj = {
      frag: [
        'precision mediump float;',
        'void main () {',
        ' if (fract(gl_FragCoord.x * 0.5) > 0.1) {',
        '  gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0);',
        ' } else {',
        '  gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);',
        ' }',
        '} '
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
      count: 3,
      profile: true
    }

    var draw1 = regl(obj)
    var draw2 = regl(obj)
    var draw3 = regl(obj)
    var draw4 = regl(obj)

    var scope1 = regl({profile: true})
    var scope2 = regl({profile: true})
    var scope3 = regl({profile: true})

    t.ok(draw1.stats.gpuTime === 0, 'draw1.stats.gpuTime=0 at startup')
    t.ok(draw2.stats.gpuTime === 0, 'draw2.stats.gpuTime=0 at startup')
    t.ok(draw3.stats.gpuTime === 0, 'draw3.stats.gpuTime=0 at startup')
    t.ok(draw4.stats.gpuTime === 0, 'draw4.stats.gpuTime=0 at startup')
    t.ok(scope1.stats.gpuTime === 0, 'scope1.stats.gpuTime=0 at startup')
    t.ok(scope2.stats.gpuTime === 0, 'scope2.stats.gpuTime=0 at startup')
    t.ok(scope3.stats.gpuTime === 0, 'scope3.stats.gpuTime=0 at startup')

    var prevGpuTime1

    // we divide every test-case into two parts:
    // ONE: we execute the actual drawing commands
    // TWO: we see if `gpuTime` assumes reasonable values for the executed drawing commands
    // we need a timeOut after part ONE(so that the timer query has time to finish), we must
    // divide it into two parts like this.
    var testCases = [
      {
        partOne: function () {
          var batch = []
          for (var i = 0; i < 10; ++i) {
            batch.push({offset: [0, 0.1 * i]})
          }
          draw1(batch)

          draw2({offset: [0, 0.1]})
        },
        partTwo: function () {
          t.ok(draw1.stats.gpuTime > 0, 'draw1.stats.gpuTime > 0 after batch call')
          t.ok(draw2.stats.gpuTime > 0, 'draw2.stats.gpuTime > 0 after one-shot call')

          // draw1 should certainly take more time than draw2, because more stuff was drawn.
          t.ok(draw1.stats.gpuTime > draw2.stats.gpuTime, 'draw1.stats.gpuTime > draw2.stats.gpuTime')

          // we we will use this values in the next test, we save:
          prevGpuTime1 = draw1.stats.gpuTime
        }
      },
      {
        partOne: function () {
          draw1({offset: [0, 0.1]})
        },
        partTwo: function () {
          // now test that calling the drawCall once again will increase gpuTime.
          t.ok(draw1.stats.gpuTime > prevGpuTime1, 'draw1.stats.gpuTime > prevGpuTime1 after one-shot call')
          // reset these values for the next test.
          draw1.stats.gpuTime = 0
          draw2.stats.gpuTime = 0
        }
      },
      {
        partOne: function () {
          for (var i = 0; i < 10; ++i) {
            draw1({offset: [0, 0.1 * i]})
          }
          draw2({offset: [0, 0.1]})
        },
        partTwo: function () {
          // make sure that if we call a drawCall as one-shot several times, the counter is also incremented several times.
          t.ok(draw1.stats.gpuTime > draw2.stats.gpuTime, 'draw1.stats.gpuTime > draw2.stats.gpuTime after several one-shot calls')

          // reset these values for the next test.
          draw1.stats.gpuTime = 0
          draw2.stats.gpuTime = 0
        }
      },
      {
        partOne: function () {
          var batch = []
          for (var i = 0; i < 10; ++i) {
            batch.push({offset: [0, 0.1 * i]})
          }

          scope1({}, function () {
            scope2({}, function () {
              for (var i = 0; i < 10; ++i) {
                draw2({offset: [0, 0.1 * i]})
              }
              scope3({}, function () {
                draw3({offset: [0, 0.1]})
                draw1(batch)
              })
            })
            draw4({offset: [0, 0.1]})
          })
        },
        partTwo: function () {
          // Now we will test whether `gpuTime` handles deeply nested scopes.

          t.ok(draw1.stats.gpuTime > 0, 'draw1.stats.gpuTime > 0 after scoped call')
          t.ok(draw2.stats.gpuTime > 0, 'draw2.stats.gpuTime > 0 after scoped call')
          t.ok(draw3.stats.gpuTime > 0, 'draw3.stats.gpuTime > 0 after scoped call')
          t.ok(draw4.stats.gpuTime > 0, 'draw4.stats.gpuTime > 0 after scoped call')

          var d1 = draw1.stats.gpuTime
          var d2 = draw2.stats.gpuTime
          var d3 = draw3.stats.gpuTime
          var d4 = draw4.stats.gpuTime

          t.ok(
            Math.abs(((d1 + d2 + d3 + d4) * 1e3) -
            (scope1.stats.gpuTime * 1e3)) < 3.0,
            'scope s1 === d1+d2+d3+d4')
          t.ok(
            Math.abs(((d1 + d2 + d3) * 1e3) -
            (scope2.stats.gpuTime * 1e3)) < 3.0,
            'scope s2 === d1+d2+d3')
          t.ok(
            Math.abs(((d1 + d3) * 1e3) -
            (scope3.stats.gpuTime * 1e3)) < 3.0,
            'scope s3 === d1+d3')
        }
      }
    ]

    var temp = null

    var processCase = function () {
      if (temp !== null) {
        regl.poll()
        temp.partTwo()
      }
      var testCase = testCases.shift()

      if (testCase) {
        testCase.partOne()
        temp = testCase
        setTimeout(processCase, 200)
      } else {
        t.equals(gl.getError(), 0, 'error code ok')
        regl.destroy()
        t.equals(gl.getError(), 0, 'error ok')
        createContext.destroy(gl)
        t.end()
      }
    }
    processCase()
  } else {
    regl.destroy()
    t.equals(gl.getError(), 0, 'error ok')
    createContext.destroy(gl)
    t.end()
  }
})
