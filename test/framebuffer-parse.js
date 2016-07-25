var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('framebuffer parsing', function (t) {
  var gl = createContext(16, 16)
  var regl = createREGL({
    gl: gl,
    optionalExtensions: [
      'webgl_draw_buffers',
      'oes_texture_float',
      'oes_texture_half_float',
      'webgl_color_buffer_float',
      'ext_color_buffer_half_float',
      'ext_srgb']
  })

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
        t.equals(
          actual.texture._texture.internalformat,
          expected.format,
          label + '.format')
        t.equals(
          actual.texture._texture.type,
          expected.type,
          label + '.type')
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
        format: gl.RGBA,
        type: gl.UNSIGNED_BYTE
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
        format: gl.RGBA,
        type: gl.UNSIGNED_BYTE
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

  // next, we will 'colorType' and 'colorFormat'. We test for all possible combinations of these values.

  var testCases = [
    {tex: true, colorFormat: 'rgba', colorType: 'uint8', expectedFormat: gl.RGBA, expectedType: gl.UNSIGNED_BYTE},
    {tex: false, colorFormat: 'rgba4', expectedFormat: gl.RGBA4},
    {tex: false, colorFormat: 'rgb565', expectedFormat: gl.RGB565},
    {tex: false, colorFormat: 'rgb5 a1', expectedFormat: gl.RGB5_A1}
  ]

  if (regl.hasExtension('oes_texture_float')) {
    testCases.push({tex: true, colorFormat: 'rgba', colorType: 'float', expectedFormat: gl.RGBA, expectedType: gl.FLOAT})
   // testCases.push({tex: true, colorFormat: 'rgb', colorType: 'float', expectedFormat: gl.RGB, expectedType: gl.FLOAT})
  }

  if (regl.hasExtension('oes_texture_half_float')) {
    var GL_HALF_FLOAT_OES = 0x8D61
    testCases.push({tex: true, colorFormat: 'rgba', colorType: 'half float', expectedFormat: gl.RGBA, expectedType: GL_HALF_FLOAT_OES})
//    testCases.push({tex: true, colorFormat: 'rgb', colorType: 'half float', expectedFormat: gl.RGB, expectedType: GL_HALF_FLOAT_OES})
  }

  // We'll skip testing the renderbuffer formats rgba32f, rgba16f, rgb16f.
  // Because the extensions 'ext_color_buffer_half_float' and
  // 'webgl_color_buffer_float' have really spotty browser support.
  // For me, they are available in Firefox, but not in Chrome, for some reason.

  if (regl.hasExtension('ext_srgb')) {
    var GL_SRGB8_ALPHA8_EXT = 0x8C43
    testCases.push({tex: false, colorFormat: 'srgba', expectedFormat: GL_SRGB8_ALPHA8_EXT})
  }

  testCases.forEach(function (testCase, i) {
    var fboArgs = {
      shape: [10, 10],
      colorFormat: testCase.colorFormat
    }

    var expected
    if (testCase.tex) {
      expected = {
        target: gl.TEXTURE_2D,
        format: testCase.expectedFormat,
        type: testCase.expectedType
      }
      fboArgs.colorType = testCase.colorType
    } else {
      expected = {
        target: gl.RENDERBUFFER,
        format: testCase.expectedFormat
      }
    }

    checkProperties(
      regl.framebuffer(fboArgs),
      {
        width: 10,
        height: 10,
        color: [expected],
        depthStencil: {
          target: gl.RENDERBUFFER,
          format: gl.DEPTH_STENCIL
        }
      },
      'for colorFormat=' + testCase.colorFormat + (testCase.tex ? (' and colorType=' + testCase.colorType) : ''))
  })

  if (
    regl.hasExtension('WEBGL_draw_buffers') && regl.hasExtension('oes_texture_float') && regl.hasExtension('oes_texture_half_float')) {
    t.throws(function () {
      regl.framebuffer({
        color: [
          regl.texture({type: 'float'}),
          regl.texture({type: 'uint8'})
        ]}) },
             /\(regl\)/,
             '#1 check color attachments with different bit planes throws')

    t.throws(function () {
      regl.framebuffer({
        color: [
          regl.texture({type: 'uint8', format: 'rgb'}),
          regl.texture({type: 'float', format: 'rgba'})
        ]}) },
             /\(regl\)/,
             '#2 check color attachments with different bit planes throws')

    t.throws(function () {
      regl.framebuffer({
        color: [
          regl.texture({type: 'half float', format: 'rgb'}),
          regl.texture({type: 'uint8', format: 'rgba'})
        ]}) },
             /\(regl\)/,
             '#3 check color attachments with different bit planes throws')

    var thrown = false
    try {
      regl.framebuffer({
        color: [
          regl.texture({type: 'float'}),
          regl.texture({type: 'float'})
        ]})
    } catch (e) {
      thrown = true
    }

    t.equals(thrown, false, 'check color attachments with same bit planes do not throw')
  }

  // TODO: multiple render targets

  regl.destroy()
  createContext.destroy(gl)
  t.end()
})
