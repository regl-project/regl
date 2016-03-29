var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('drawing', function (t) {
  var regl = createREGL(createContext(16, 16))

  // Primitives to test
  //
  // points
  // lines
  // line strip
  // line loop
  // triangles
  // triangle strip
  // triangle fan

  // Modes to test
  //
  // 1 shot vs batch
  // arrays vs elements
  // generic vs instanced

  regl.destroy()
  t.end()
})
