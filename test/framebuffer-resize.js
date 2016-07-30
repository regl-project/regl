var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('framebuffer resizing', function (t) {
  var gl = createContext(16, 16)
  var regl = createREGL({
    gl: gl,
    optionalExtensions: ['webgl_draw_buffers']
  })

  function checkFBO (fbo, expected) {
    var w = expected.width
    var h = expected.height

    t.equals(fbo.width, w, 'width ok')
    t.equals(fbo.height, h, 'height ok')
    t.equals(fbo.color[0].width, w, 'color width ok')
    t.equals(fbo.color[0].height, h, 'color height ok')
    t.equals(fbo.depthStencil.width, w, 'depth stencil width ok')
    t.equals(fbo.depthStencil.height, h, 'depth stencil width ok')
  }

  var fbo = regl.framebuffer(10, 10)

  t.equals(fbo.resize(10), fbo, 'resizing to same size does nothing')

  checkFBO(fbo, {width: 10, height: 10})

  t.equals(fbo.resize(30, 5), fbo, 'resize returned the right thing')

  checkFBO(fbo, {width: 30, height: 5})

  t.equals(fbo.resize(8), fbo, 'resize returned the right thing')

  checkFBO(fbo, {width: 8, height: 8})

  // reinitialize fbo

  var color = regl.renderbuffer(8)
  fbo({
    color: color
  })

  checkFBO(fbo, {width: 8, height: 8})
  t.equals(fbo.color[0], color)

  fbo.resize(2, 3)

  checkFBO(fbo, {width: 2, height: 3})
  t.equals(fbo.color[0], color)

  // now test .resize for MRT.
  if (regl.hasExtension('webgl_draw_buffers')) {
    var mrtFbo = regl.framebuffer({colorFormat: 'rgba', colorType: 'uint8', colorCount: regl.limits.maxColorAttachments})

    mrtFbo.resize(2, 3)

    t.equals(mrtFbo.width, 2, 'mrt width ok')
    t.equals(mrtFbo.height, 3, 'mrt height ok')
    t.equals(mrtFbo.depthStencil.width, 2, 'mrt depth stencil width ok')
    t.equals(mrtFbo.depthStencil.height, 3, 'mrt depth stencil width ok')

    for (var i = 0; i < regl.limits.maxColorAttachments; i++) {
      t.equals(mrtFbo.color[i].width, 2, 'mrt color[' + i + '] width ok')
      t.equals(mrtFbo.color[i].height, 3, 'mrt color[' + i + '] height ok')
    }
  }

  regl.destroy()
  createContext.destroy(gl)
  t.end()
})
