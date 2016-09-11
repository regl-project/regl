var tape = require('tape')
var createContext = require('./util/create-context')
var createREGL = require('../regl')

tape('elements - length', function (t) {
  var gl = createContext(5, 5)
  var regl = createREGL(gl)

  var N = 5

  var cellsBuffer = regl.elements({
    type: 'uint16',
    usage: 'dynamic',
    primitive: 'triangles',
    count: N * 3
  })

  t.equals(cellsBuffer._elements.buffer.byteLength, N * 3 * 2, 'count')

  var cells2Buffer = regl.elements({
    type: 'uint16',
    usage: 'dynamic',
    primitive: 'triangles',
    length: N * 2 * 3
  })

  t.equals(cells2Buffer._elements.vertCount, N * 3, 'count')

  regl.destroy()
  createContext.destroy(gl)
  t.end()
})
