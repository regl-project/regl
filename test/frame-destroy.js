var createContext = require('./util/create-context')
var createREGL = require('../regl')
var tape = require('tape')

tape('test destroy cancels frames successfully', function (t) {
  var gl = createContext(5, 5)
  var regl = createREGL(gl)

  var count0 = 0
  regl.frame(function (context) {
    count0 += 1
    t.equals(context.tick, count0, 'count 0 ok')
  })

  var count1 = 0
  regl.frame(function (context) {
    count1 += 1
    t.equals(context.tick, count1, 'count 1 ok')
    if (count1 === 5) {
      destroyContext()
    }
  })

  var count2 = 0
  regl.frame(function (context) {
    count2 += 1
    t.equals(context.tick, count2, 'count 2 ok')
  })

  function destroyContext () {
    regl.destroy()
    t.equals(gl.getError(), 0, 'error ok')
    createContext.destroy(gl)

    setTimeout(function () {
      t.equals(count1, 5, 'raf successfully terminated')
      t.end()
    }, 200)
  }
})
