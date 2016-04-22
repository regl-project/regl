var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('texture', function (t) {
  var regl = createREGL(createContext(16, 16))

  // Test basic texture rendering

  // Test drawing with multiple textures

  // Test texture updates

  // Update in middle of draw loop

  // Texture destruction

  regl.destroy()
  t.end()
})
