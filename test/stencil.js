var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('stencil', function (t) {
  var gl = createContext(16, 16)
  var regl = createREGL(gl)

  // TODO

  // clearStencil

  // stencilTest
  // stencilMask
  // stencilFunc
  // stencilOp

  // static
  // dynamic 1-shot
  // dynamic batch

  regl.destroy()
  t.end()
})
