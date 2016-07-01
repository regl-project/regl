var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('framebuffer parsing', function (t) {
  var gl = createContext(16, 16)
  var regl = createREGL(gl)

  function checkProperties (framebuffer, props, prefix) {
    var _framebuffer = framebuffer._framebuffer

    t.equals(framebuffer.width, props.width, prefix + '.width')
    t.equals(framebuffer.height, props.height, prefix + '.height')
    t.equals(_framebuffer.width, props.width, prefix + '.width')
    t.equals(_framebuffer.height, props.height, prefix + '.height')

    t.equals(
      framebuffer.color.length,
      _framebuffer.colorAttachments.length,
      prefix + ' color handle')
    t.equals(
      !!framebuffer.depth,
      !!_framebuffer.depthAttachment,
      prefix + ' depth handle')
    t.equals(
      !!framebuffer.stencil,
      !!_framebuffer.stencilAttachment,
      prefix + ' stencil handle')
    t.equals(
      !!framebuffer.depthStencil,
      !!_framebuffer.depthStencilAttachment,
      prefix + ' depth stencil handle')

    gl.bindFramebuffer(gl.FRAMEBUFFER, _framebuffer.framebuffer)

    function diffAttachments (actual, expected, sprefix, attachment) {
      var label = prefix + ' ' + sprefix

      function getParameter (pname) {
        return gl.getFramebufferAttachmentParameter(
          gl.FRAMEBUFFER,
          attachment,
          pname)
      }

      if (!expected) {
        t.equals(actual, null, label + ' is null')
        t.equals(
          getParameter(gl.FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE),
          0,
          label + ' object type')
        return
      }

      t.equals(actual.target, expected.target, label + '.target')

      if (expected.target === gl.RENDERBUFFER) {
        t.equals(actual.texture, null, label + '.texture')
        t.equals(
          actual.renderbuffer._renderbuffer.format,
          expected.format,
          label + '.format')
        t.equals(actual.renderbuffer.width, props.width, label + '.width')
        t.equals(actual.renderbuffer.height, props.height, label + '.height')
        t.equals(
          getParameter(gl.FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE),
          gl.RENDERBUFFER,
          label + ' object type')
        t.equals(
          getParameter(gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME),
          actual.renderbuffer._renderbuffer.renderbuffer,
          label + ' object assoc')
      } else {
        t.equals(actual.renderbuffer, null, label + '.renderbuffer')
        t.equals(actual.level, expected.level || 0, label + '.level')
        /*
        t.equals(
          actual.texture._texture.params.internalformat,
          expected.format,
          label + '.format')
        */
        t.equals(actual.texture.width, props.width, label + '.width')
        t.equals(actual.texture.height, props.height, label + '.height')
        t.equals(
          getParameter(gl.FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE),
          gl.TEXTURE,
          label + ' object type')
        t.equals(
          getParameter(gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME),
          actual.texture._texture.texture,
          label + ' object assoc')
        t.equals(
          getParameter(gl.FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL),
          expected.level || 0,
          label + ' miplevel')
        t.equals(
          getParameter(gl.FRAMEBUFFER_ATTACHMENT_TEXTURE_CUBE_MAP_FACE),
          expected.target === gl.TEXTURE_2D ? 0 : expected.target,
          label + ' cube face')
      }
    }

    if (props.color) {
      t.equals(
        _framebuffer.colorAttachments.length,
        props.color.length,
        prefix + ' colorCount')
      for (var i = 0; i < props.color.length; ++i) {
        diffAttachments(
          _framebuffer.colorAttachments[i],
          props.color[i],
          'color[' + i + ']',
          gl.COLOR_ATTACHMENT0 + i)
      }
    } else {
      t.same(_framebuffer.colorAttachments, [], prefix + ' color')
    }

    diffAttachments(
      _framebuffer.depthAttachment,
      props.depth || null,
      'depth',
      gl.DEPTH_ATTACHMENT)
    diffAttachments(
      _framebuffer.stencilAttachment,
      props.stencil || null,
      'stencil',
      gl.STENCIL_ATTACHMENT)
    diffAttachments(
      _framebuffer.depthStencilAttachment,
      props.depthStencil || null,
      'depth stencil',
      gl.DEPTH_STENCIL_ATTACHMENT)
  }

  // empty constructor
  checkProperties(
    regl.framebuffer(),
    {
      width: 16,
      height: 16,
      color: [{
        target: gl.TEXTURE_2D,
        format: gl.RGBA
      }],
      depth: {
        target: gl.RENDERBUFFER,
        format: gl.DEPTH_COMPONENT16
      }
    },
    'empty')

  checkProperties(
    regl.framebuffer({
      width: 5,
      height: 5,
      depth: false
    }),
    {
      width: 5,
      height: 5,
      color: [{
        target: gl.TEXTURE_2D,
        format: gl.RGBA
      }]
    },
    'shape and no depth')

  checkProperties(
    regl.framebuffer({
      width: 10,
      height: 10,
      format: 'rgba4',
      depth: true,
      stencil: true
    }),
    {
      width: 10,
      height: 10,
      color: [{
        target: gl.RENDERBUFFER,
        format: gl.RGBA4
      }],
      depthStencil: {
        target: gl.RENDERBUFFER,
        format: gl.DEPTH_STENCIL
      }
    },
    'no color')

  // test color buffer formats

  // test cube map associations

  // test creation with colorBuffers, depthBuffers, stencilBuffers, etc.

  if (gl.getExtension('WEBGL_depth_texture')) {
    // test depth texture stuff
  }

  // check in place updates
  var origFBO = regl.framebuffer({
    shape: [5, 5]
  })

  var origColor = origFBO.color
  var origDepth = origFBO.depth

  checkProperties(
    origFBO,
    {
      width: 5,
      height: 5,
      color: [{
        target: gl.TEXTURE_2D,
        level: 0,
        format: gl.RGBA
      }],
      depth: {
        target: gl.RENDERBUFFER,
        format: gl.DEPTH_COMPONENT16
      }
    },
    'before update')

  t.ok(origFBO._framebuffer.ownsColor, 'owns color buffer')
  t.ok(origFBO._framebuffer.ownsDepthStencil, 'owns depth/stencil buffer')

  origFBO({
    radius: 10,
    depth: true,
    stencil: true
  })

  // Should reuse texture and renderbuffer references
  t.equals(origFBO.color[0], origColor[0], 'colors buffer reused')
  t.equals(origFBO.depthStencil, origDepth, 'depth buffer reused')

  checkProperties(
    origFBO,
    {
      width: 10,
      height: 10,
      color: [{
        target: gl.TEXTURE_2D,
        level: 0,
        format: gl.RGBA
      }],
      depthStencil: {
        target: gl.RENDERBUFFER,
        format: gl.DEPTH_STENCIL
      }
    },
    'after update')

  // check multiple render targets
  var extDrawBuffers = gl.getExtension('WEBGL_draw_buffers')
  if (extDrawBuffers) {
    // TODO check multiple render target support
  }

  regl.destroy()
  t.end()
})
