var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('element arg parsing', function (t) {
  var gl = createContext(16, 16)
  var regl = createREGL(gl)

  // TODO

  regl.destroy()
  t.end()
})
