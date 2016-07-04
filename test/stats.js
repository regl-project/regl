'use strict'

var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('test regl.stats', function (t) {
  setTimeout(function () {
    var gl = createContext(16, 16)
    var regl

    //
    // Begin Test stats.bufferCount
    //
    regl = createREGL(gl)

    t.equals(regl.stats.bufferCount, 0, 'stats.bufferCount==0 at start')

    regl.buffer([1, 2, 3])
    regl.buffer(new Uint16Array([1, 2, 3]))
    regl.buffer(new Float32Array([1, 2, 3, 4]))

    t.equals(regl.stats.bufferCount, 3, 'stats.bufferCount==3 after creating 3 buffers')

    regl.destroy()

    t.equals(regl.stats.bufferCount, 0, 'stats.bufferCount==0 after regl.destroy()')
    //
    // End Test stats.bufferCount
    //

    //
    // Begin Test stats.elementsCount
    //
    regl = createREGL(gl)

    t.equals(regl.stats.elementsCount, 0, 'stats.elementsCount==0 at start')

    regl.elements([1, 2, 3])
    regl.elements([[1, 2, 3], [5, 6, 7]])
    regl.elements({
      primitive: 'line loop',
      count: 5,
      data: new Uint8Array([0, 2, 4, 1, 3])
    })

    t.equals(regl.stats.bufferCount, 3, 'stats.elementsCount==3 after creating 3 buffers')

    regl.destroy()

    t.equals(regl.stats.elementsCount, 0, 'stats.elementsCount==0 after regl.destroy()')
    //
    // End Test stats.bufferCount
    //

    createContext.destroy(gl)
    t.end()
  }, 120)
})
