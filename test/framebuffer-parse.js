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
          0,
          label + ' miplevel')
        t.equals(
          getParameter(gl.FRAMEBUFFER_ATTACHMENT_TEXTURE_CUBE_MAP_FACE),
          expected.target === gl.TEXTURE_2D ? 0 : expected.target,
          label + ' cube face')
      }
    }

    if (props.color) {
      t.equals(
        framebuffer.color.length,
        props.color.length,
        prefix + ' colorCount')
      for (var i = 0; i < props.color.length; ++i) {
        diffAttachments(
          _framebuffer.colorAttachments[i] || _framebuffer.colorAttachments,
          props.color[i],
          'color[' + i + ']',
          gl.COLOR_ATTACHMENT0 + i)
      }
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
      width: 1,
      height: 1,
      color: [{
        target: gl.TEXTURE_2D,
        format: gl.RGBA
      }],
      depthStencil: {
        target: gl.RENDERBUFFER,
        format: gl.DEPTH_STENCIL
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
      }],
      stencil: {
        target: gl.RENDERBUFFER,
        format: gl.STENCIL_INDEX8
      }
    },
    'shape and no depth')

  checkProperties(
    regl.framebuffer({
      width: 10,
      height: 10,
      colorFormat: 'rgb5 a1',
      depth: true,
      stencil: true
    }),
    {
      width: 10,
      height: 10,
      color: [{
        target: gl.RENDERBUFFER,
        format: gl.RGB5_A1
      }],
      depthStencil: {
        target: gl.RENDERBUFFER,
        format: gl.DEPTH_STENCIL
      }
    },
    'color renderbuffer')

  checkProperties(
    regl.framebuffer({
      shape: [10, 10],
      colorTexture: false,
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
    'color renderbuffer')

  // TODO: float, half float types
  // TODO: multiple render targets

  regl.destroy()
  createContext.destroy(gl)
  t.end()
})
