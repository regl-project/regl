var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('buffer arg parsing', function (t) {
  var gl = createContext(16, 16)
  var regl = createREGL(gl)

  function checkProperties (buffer, props, prefix) {
    var bufferProps = buffer._buffer
    Object.keys(props).forEach(function (prop) {
      t.same(bufferProps[prop], props[prop], prefix + '.' + prop)
    })
  }

  checkProperties(
    regl.buffer(),
    {
      type: gl.ARRAY_BUFFER,
      usage: gl.STATIC_DRAW,
      byteLength: 0,
      data: null
    },
    'empty')

  regl.destroy()
  t.end()
})
