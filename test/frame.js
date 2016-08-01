var createContext = require('./util/create-context')
var createREGL = require('../regl')
var tape = require('tape')

tape('raf cancel', function (t) {
  var gl = createContext(5, 5)
  var regl = createREGL(gl)

  var prevTime = -Infinity

  var call0 = 0
  var cancel0 = false
  var frame0 = regl.frame(function (context) {
    call0 += 1
    t.equals(context.tick, call0, 'tick count ok (frame 0)')
  })

  var call1 = 0
  var frame1 = regl.frame(function (context) {
    call1 += 1
    t.ok(context.time > prevTime, 'timer ok')
    t.equals(context.tick, call1, 'tick count ok (frame 1)')
    prevTime = context.time

    if (call0 === 3 && !cancel0) {
      frame0.cancel()
      cancel0 = true
    }

    if (call1 === 5) {
      frame1.cancel()
      setTimeout(checkFrames, 300)
    }
  })

  function checkFrames () {
    t.equals(call0, 3, 'frame 0 cancelled ok')
    t.equals(call1, 5, 'frame 1 cancelled ok')

    t.throws(function () {
      frame0.cancel()
    }, /\(regl\)/, 'double cancellation throws')

    done()
  }

  function done () {
    regl.destroy()
    t.equals(gl.getError(), 0, 'error ok')
    createContext.destroy(gl)
    t.end()
  }
})
