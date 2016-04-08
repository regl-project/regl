var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

var stencilOps = require('../lib/constants/stencil-ops.json')

tape('stencil', function (t) {
  var gl = createContext(16, 16)
  var regl = createREGL(gl)

  // Check stencil op codes
  t.equals(stencilOps[0], gl.ZERO, 'zero')
  t.equals(stencilOps.keep, gl.KEEP, 'keep')
  t.equals(stencilOps.replace, gl.REPLACE, 'replace')
  t.equals(stencilOps.increment, gl.INCR, 'increment')
  t.equals(stencilOps.decrement, gl.DECR, 'decrement')
  t.equals(stencilOps['increment wrap'], gl.INCR_WRAP, 'increment wrap')
  t.equals(stencilOps['decrement wrap'], gl.DECR_WRAP, 'decrement wrap')
  t.equals(stencilOps.invert, gl.INVERT, 'invert')

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
