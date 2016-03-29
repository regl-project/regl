var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('blend', function (t) {
  var gl = createContext(16, 16)
  var regl = createREGL(gl)

  // TODO

  // blendEquation
  // blendFunc
  // blendColor

  // static
  // dynamic 1-shot
  // dynamic batch

  regl.destroy()
  t.end()
})
