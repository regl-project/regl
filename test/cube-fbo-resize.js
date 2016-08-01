var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('cube fbo resize test', function (t) {
  var gl = createContext(2, 2)
  var regl = createREGL(gl)

  t.equals(gl.getError(), 0, 'error code ok')

  var cubeFbo = regl.framebufferCube(10)
  t.equals(gl.getError(), 0, 'error code ok')

  cubeFbo.resize(8)
  t.equals(gl.getError(), 0, 'error code ok')

  regl.destroy()
  t.equals(gl.getError(), 0, 'error ok')
  createContext.destroy(gl)
  t.end()
})
