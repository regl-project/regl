var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('framebuffer - ref counting', function (t) {
  var gl = createContext(16, 16)
  var regl = createREGL(gl)

  var simpleFBO = regl.framebuffer(5, 5)
  t.equals(regl.stats.textureCount, 1, 'texture count ok')
  t.equals(regl.stats.renderbufferCount, 1, 'renderbuffer count ok')
  t.equals(regl.stats.framebufferCount, 1, 'framebuffer count ok')
  simpleFBO.destroy()

  t.equals(regl.stats.textureCount, 0, 'destroy texture ok')
  t.equals(regl.stats.renderbufferCount, 0, 'destroy renderbuffer ok')
  t.equals(regl.stats.framebufferCount, 0, 'destroy framebuffer ok')

  t.throws(function () {
    simpleFBO.destroy()
  }, null, 'double destroying an fbo throws')

  // now reuse a renderbuffer
  var rb = regl.renderbuffer(5)
  t.equals(regl.stats.renderbufferCount, 1, 'renderbuffer count ok')

  var fbo = regl.framebuffer({
    color: rb
  })
  t.equals(regl.stats.textureCount, 0, 'no new textures created')
  t.equals(regl.stats.renderbufferCount, 2, 'exactly one depth buffer created')
  t.equals(regl.stats.framebufferCount, 1, 'framebuffer count ok')

  fbo.destroy()
  t.equals(regl.stats.textureCount, 0, 'texture count ok')
  t.equals(regl.stats.renderbufferCount, 1, 'renderbuffer count ok')
  t.equals(regl.stats.framebufferCount, 0, 'framebuffer count ok')

  rb.destroy()
  t.equals(regl.stats.renderbufferCount, 0, 'destroy success')

  // try reinitializing a framebuffer
  var fbo2 = regl.framebuffer(5)
  t.equals(regl.stats.textureCount, 1, 'texture count ok')
  t.equals(regl.stats.renderbufferCount, 1, 'renderbuffer count ok')
  t.equals(regl.stats.framebufferCount, 1, 'framebuffer count ok')

  fbo2({
    color: regl.renderbuffer(5)
  })
  t.equals(regl.stats.textureCount, 0, 'texture count ok')
  t.equals(regl.stats.renderbufferCount, 2, 'renderbuffer count ok')
  t.equals(regl.stats.framebufferCount, 1, 'framebuffer count ok')

  fbo2.destroy()
  t.equals(regl.stats.textureCount, 0, 'texture count ok')
  t.equals(regl.stats.renderbufferCount, 1, 'renderbuffer count ok')
  t.equals(regl.stats.framebufferCount, 0, 'framebuffer count ok')

  // TODO: test for cubic FBOs.

  regl.destroy()
  t.equals(gl.getError(), 0, 'error ok')
  createContext.destroy(gl)
  t.end()
})
