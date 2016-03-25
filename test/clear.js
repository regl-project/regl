'use strict'

var createContext = require('gl')
var createREGL = require('../../regl')
var tape = require('tape')

tape('clear color', function (t) {
  var gl = createContext(16, 16)
  var regl = createREGL(gl)

  regl.clear({
    color: [1, 0, 0, 1]
  })

  var pixels = regl.read()
  for (var i = 0; i < 16; ++i) {
    for (var j = 0; j < 16; ++j) {
      var ptr = 4 * (16 * i + j)
      t.equals(pixels[ptr], 255)
      t.equals(pixels[ptr + 1], 0)
      t.equals(pixels[ptr + 2], 0)
      t.equals(pixels[ptr + 3], 255)
    }
  }

  t.end()
})
