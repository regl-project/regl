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

tape('frame is called even if frame function throws', function (t) {
  function done (regl, gl, t) {
    regl.destroy()
    t.equals(gl.getError(), 0, 'error ok')
    createContext.destroy(gl)
    t.end()
  }

  if (typeof document !== 'undefined') {
    var gl = createContext(5, 5)
    var regl = createREGL(gl)

    var frameCalledMax = 3
    var frameCalled = 0
    var cancelCalled = 0

    function decorateCancel(frame) {
      var oldCancel = frame.cancel
      var newCancel = function() {
        cancelCalled++
        oldCancel.call(this)
      }
      frame.cancel = newCancel
      return frame
    }

    function do1() {
      frameCalled = 0
      cancelCalled = 0
      console.log('frame is called even if frame function throws')

      var frame = regl.frame(function (context) {
        if(frameCalled === 0) decorateCancel(frame)
        if (frameCalled >= frameCalledMax) {
          t.ok(frameCalled > 1, 'regl.frame called more then once despite an error occurred: ' + frameCalled + '.')
          t.equals(cancelCalled, 0, 'regl.frame do not call frame.cancel')
          t.equals(gl.getError(), 0, 'error ok')
          frame.cancel()
          return do2()
        } else {
          frameCalled++
          throw 'Foo'
        }
      })
    }

    function do2() {
      frameCalled = 0
      cancelCalled = 0
      console.log('frameSafe is stopped if frame function throws')

      var frame = regl.frameSafe(function (context) {
        if(frameCalled === 0) decorateCancel(frame)
        if (frameCalled >= frameCalledMax) {
          t.ok(false, 'regl.frameSafe should be stopped if frame function throws')
          return
        }
        frameCalled++
        throw 'Foo2'
      })
      setTimeout(function assertResult() {
        t.ok(frameCalled === 1, 'regl.frameSafe calls only once if frame function throws '+ frameCalled)
        t.equals(cancelCalled, 1, 'regl.frameSafe should call frame.cancel if frame function throws')
        t.equals(gl.getError(), 0, 'error ok')

        frame.cancel()
        frame.destroy()
        done(regl, gl, t)
      }, 100)
    }

    do1()

  } else {
    // this test is only for the browser
    t.end()
  }
})
