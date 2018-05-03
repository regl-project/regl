'use strict'

var createContext = require('./util/create-context')
var createREGL = require('../regl')
var tape = require('tape')

tape('clear fbo', function (t) {
  function arrayEq (x, y, m) {
    t.same(
      Array.prototype.slice.call(x),
      Array.prototype.slice.call(y),
      m)
  }

  setTimeout(function () {
    var gl = createContext(1, 1)
    var regl = createREGL(gl)

    var fbo = regl.framebuffer({
      shape: [1, 1, 4],
      colorTexture: true
    })

    regl.clear({
      color: [1, 0, 0, 1]
    })

    regl.clear({
      framebuffer: fbo,
      color: [0, 1, 0, 1]
    })

    arrayEq(regl.read(), [255, 0, 0, 255], 'drawing buffer ok')
    arrayEq(regl.read({
      framebuffer: fbo
    }), [0, 255, 0, 255], 'fbo ok')

    fbo.use(function () {
      regl.clear({
        color: [0, 0, 1, 1]
      })
      regl.clear({
        framebuffer: null,
        color: [1, 0, 1, 1]
      })

      arrayEq(regl.read(), [0, 0, 255, 255], 'drawing buffer ok')
      arrayEq(regl.read({
        framebuffer: null
      }), [255, 0, 255, 255], 'fbo ok')
    })

    regl.destroy()
    t.equals(gl.getError(), 0, 'error ok')
    createContext.destroy(gl)
    t.end()
  }, 120)
})
