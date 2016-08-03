var tape = require('tape')
var createContext = require('./util/create-context')
var createREGL = require('../regl')

tape('missing shader', function (t) {
  var gl = createContext(1, 1)
  var regl = createREGL(gl)

  var command = regl({
    attributes: {
      position: [
        [-1, 0],
        [0, -1],
        [1, 1]
      ]
    },

    uniforms: {
      color: [1, 0, 0, 1]
    }
  })

  t.throws(function () {
    command()
  }, /\(regl\)/, 'throws sensible error when drawing with missing shader')

  t.throws(function () {
    command(1)
  }, /\(regl\)/, 'throws sensible error when drawing with missing shader in batch mode')

  regl.destroy()
  t.equals(gl.getError(), 0, 'clear errors')
  createContext.destroy(gl)

  t.end()
})
