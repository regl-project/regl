var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('scope', function (t) {
  var regl = createREGL(createContext(5, 5))

  regl.destroy()
  t.end()
})
