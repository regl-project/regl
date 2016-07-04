'use strict'

var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('test regl.stats', function (t) {
  setTimeout(function () {
    var gl = createContext(16, 16)

    //
    // Test stats.bufferCount
    //
    var regl = createREGL(gl)

    t.equals(regl.stats.bufferCount, 0, 'stats.bufferCount==0 at start')

    regl.buffer([1, 2, 3])
    regl.buffer(new Uint16Array([1, 2, 3]))
    regl.buffer(new Float32Array([1, 2, 3, 4]))

    t.equals(regl.stats.bufferCount, 3, 'stats.bufferCount==3 after creating 3 buffers')

    regl.destroy()

    t.equals(regl.stats.bufferCount, 0, 'stats.bufferCount==0 after regl.destroy()')

    createContext.destroy(gl)
    t.end()
  }, 120)
})
