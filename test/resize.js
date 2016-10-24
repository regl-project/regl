var createContext = require('./util/create-context')
var createREGL = require('../regl')
var tape = require('tape')

tape('test drawing buffer size polling', function (t) {
  var gl = createContext(5, 5)
  var regl = createREGL({
    gl: gl,
    pixelRatio: 1
  })

  var frame = regl.frame(function (context) {
    if (context.tick === 1) {
      t.equals(context.drawingBufferWidth, 5, 'init width ok')
      t.equals(context.drawingBufferHeight, 5, 'init height ok')
      t.equals(context.viewportWidth, 5, 'init view width ok')
      t.equals(context.viewportHeight, 5, 'init view height ok')
      t.equals(context.pixelRatio, 1, 'pixel ratio ok')
    } else if (context.tick === 2) {
      createContext.resize(gl, 7, 8)
    } else if (context.tick === 3) {
      t.equals(context.drawingBufferWidth, 7, 'resize draw width ok')
      t.equals(context.drawingBufferHeight, 8, 'resize draw height ok')
      t.equals(context.viewportWidth, 7, 'resize view width ok')
      t.equals(context.viewportHeight, 8, 'resize view height ok')
      frame.cancel()

      setTimeout(pollTest, 200)
    }
  })

  function pollTest () {
    createContext.resize(gl, 10, 17)
    regl.poll()
    regl.draw(function (context) {
      t.equals(context.drawingBufferWidth, 10, 'poll draw width ok')
      t.equals(context.drawingBufferHeight, 17, 'poll draw height ok')
      t.equals(context.viewportWidth, 10, 'poll view width ok')
      t.equals(context.viewportHeight, 17, 'poll view height ok')
    })
    regl.destroy()
    t.equals(gl.getError(), 0, 'error ok')
    createContext.destroy(gl)
    t.end()
  }
})
