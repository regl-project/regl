var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('texture', function (t) {
  var regl = createREGL(createContext(16, 16))

  // TODO

  regl.destroy()
  t.end()
})
