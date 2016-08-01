var createContext = require('./util/create-context')
var createREGL = require('../regl')
var tape = require('tape')

tape('scope batch', function (t) {
  var gl = createContext(8, 8)
  var regl = createREGL(gl)

  var counter = 0
  regl.draw(10, function (context, props, batchId) {
    t.equals(batchId, counter, 'batch id ok')
    counter++
    t.equals(props, null, 'props ok')
  })
  t.equals(counter, 10, 'called correctly')

  var data = [
    { x: 0 },
    { x: 1 },
    { x: 2 }
  ]
  counter = 0
  regl.draw(data, function (context, props, batchId) {
    t.equals(batchId, counter, 'batch id ok')
    counter++
    t.equals(props, data[batchId], 'props ok')
  })
  t.equals(counter, data.length, 'called correctly')

  regl.destroy()
  t.equals(gl.getError(), 0, 'error ok')
  createContext.destroy(gl)
  t.end()
})
