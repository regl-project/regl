'use strict'

var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('clear color', function (t) {
  setTimeout(function () {
    var gl = createContext(16, 16)
    var regl = createREGL(gl)

    regl.clear({
      color: [1, 0, 0, 1]
    })

    var pixels = regl.read()
    var allequal = true
    for (var i = 0; i < 16; ++i) {
      for (var j = 0; j < 16; ++j) {
        var ptr = 4 * (16 * i + j)
        allequal = allequal &&
          pixels[ptr] === 255 &&
          pixels[ptr + 1] === 0 &&
          pixels[ptr + 2] === 0 &&
          pixels[ptr + 3] === 255
      }
    }

    t.equals(allequal, true, 'all clear pixels are equal')

    regl.destroy()
    t.equals(gl.getError(), 0, 'error ok')
    createContext.destroy(gl)
    t.end()
  }, 120)
})
