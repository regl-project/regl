var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('viewport', function (t) {
  var gl = createContext(16, 16)
  var regl = createREGL(gl)

  // TODO

  // viewport
  // scissor

  // static
  // dynamic 1-shot
  // dynamic batch

  regl.destroy()
  t.end()
})
