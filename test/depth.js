var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('depth', function (t) {
  var gl = createContext(16, 16)
  var regl = createREGL(gl)

  // TODO

  // clearDepth

  // depthTest
  // depthMask
  // depthFunc
  // depthRange

  // static
  // dynamic 1-shot
  // dynamic batch

  regl.destroy()
  t.end()
})
