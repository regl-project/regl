var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('framebuffer resizing', function (t) {
  var gl = createContext(16, 16)
  var regl = createREGL({
    gl: gl,
    optionalExtensions: ['webgl_draw_buffers']
  })

  var fbo = regl.framebuffer(10, 10)

  t.equals(fbo.resize(10), fbo, 'resizing to same size does nothing')

  t.equals(fbo.width, 10, 'width ok')
  t.equals(fbo.height, 10, 'height ok')
  t.equals(fbo.color[0].width, 10, 'color width ok')
  t.equals(fbo.color[0].height, 10, 'color height ok')
  t.equals(fbo.depthStencil.width, 10, 'depth stencil width ok')
  t.equals(fbo.depthStencil.height, 10, 'depth stencil width ok')

  t.equals(fbo.resize(30, 5), fbo, 'resize returned the right thing')

  t.equals(fbo.width, 30, 'width ok')
  t.equals(fbo.height, 5, 'height ok')
  t.equals(fbo.color[0].width, 30, 'color width ok')
  t.equals(fbo.color[0].height, 5, 'color height ok')
  t.equals(fbo.depthStencil.width, 30, 'depth stencil width ok')
  t.equals(fbo.depthStencil.height, 5, 'depth stencil width ok')

  t.equals(fbo.resize(8), fbo, 'resize returned the right thing')

  t.equals(fbo.width, 8, 'width ok')
  t.equals(fbo.height, 8, 'height ok')
  t.equals(fbo.color[0].width, 8, 'color width ok')
  t.equals(fbo.color[0].height, 8, 'color height ok')
  t.equals(fbo.depthStencil.width, 8, 'depth stencil width ok')
  t.equals(fbo.depthStencil.height, 8, 'depth stencil width ok')

  // reinitialize fbo

  var color = regl.renderbuffer(8)
  fbo({
    color: color
  })

  t.equals(fbo.color[0], color)
  t.equals(fbo.width, 8, 'width ok')
  t.equals(fbo.height, 8, 'height ok')
  t.equals(fbo.color[0].width, 8, 'color width ok')
  t.equals(fbo.color[0].height, 8, 'color height ok')
  t.equals(fbo.depthStencil.width, 8, 'depth stencil width ok')
  t.equals(fbo.depthStencil.height, 8, 'depth stencil width ok')

  fbo.resize(2, 3)

  t.equals(fbo.color[0], color)
  t.equals(fbo.width, 2, 'width ok')
  t.equals(fbo.height, 3, 'height ok')
  t.equals(fbo.color[0].width, 2, 'color width ok')
  t.equals(fbo.color[0].height, 3, 'color height ok')
  t.equals(fbo.depthStencil.width, 2, 'depth stencil width ok')
  t.equals(fbo.depthStencil.height, 3, 'depth stencil width ok')

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
