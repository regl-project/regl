var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

var GL_TEXTURE_CUBE_MAP_POSITIVE_X = 0x8515

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

  function checkPropertiesCube (cubeFbo, props, prefix) {
    var i
    t.equals(cubeFbo.width, props.width, prefix + '.width')
    t.equals(cubeFbo.height, props.height, prefix + '.height')

    for (i = 0; i < 6; i++) {
      t.equals(cubeFbo.faces[i].width, props.width, prefix + '.width for face #' + i)
      t.equals(cubeFbo.faces[i].width, props.height, prefix + '.height for face #' + i)
    }

    for (i = 0; i < 6; i++) {
      var suffix = ' for face #' + i
      var _framebuffer = cubeFbo.faces[i]._framebuffer
      var framebuffer = cubeFbo.faces[i]

      gl.bindFramebuffer(gl.FRAMEBUFFER, _framebuffer.framebuffer)

      if (props.color) {
        t.equals(
          framebuffer.color.length,
          props.color.length,
          prefix + ' colorCount' + suffix)

        for (var j = 0; j < props.color.length; j++) {
          diffAttachmentsCube(
            _framebuffer.colorAttachments[j] || _framebuffer.colorAttachments,
            props.color[j],
            'color[' + j + ']' + suffix,
            gl.COLOR_ATTACHMENT0 + j,
            i)

          diffAttachmentsCube(
            _framebuffer.depthAttachment,
            props.depth || null,
            'depth stencil',
            gl.DEPTH_ATTACHMENT, i)

          diffAttachmentsCube(
            _framebuffer.stencilAttachment,
            props.stencil || null,
            'depth stencil',
            gl.STENCIL_ATTACHMENT, i)

          diffAttachmentsCube(
            _framebuffer.depthStencilAttachment,
            props.depthStencil || null,
            'depth stencil',
            gl.DEPTH_STENCIL_ATTACHMENT, i)
        }
      }
    }

    function diffAttachmentsCube (actual, expected, sprefix, attachment, i) {
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

      if (expected.target === gl.RENDERBUFFER) {
        t.equals(actual.target, gl.RENDERBUFFER, label + '.target depth')

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
        t.equals(actual.target, GL_TEXTURE_CUBE_MAP_POSITIVE_X + i, label + '.target')

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
          GL_TEXTURE_CUBE_MAP_POSITIVE_X + i,
          label + ' cube face')
      }
    }
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

  checkPropertiesCube(
    regl.framebufferCube(),
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
    'empty cube')

  checkPropertiesCube(
    regl.framebufferCube({
      color: regl.cube(32),
      stencil: true,
      depth: false
    }),
    {
      width: 32,
      height: 32,
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
    'explicit color cube')

  checkPropertiesCube(
    regl.framebufferCube({
      radius: 5,
      stencil: true,
      depth: true
    }),
    {
      width: 5,
      height: 5,
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
    'radius cube')

  checkPropertiesCube(
    regl.framebufferCube(5),
    {
      width: 5,
      height: 5,
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
    'only number argument cube')

  checkProperties(
    regl.framebuffer({
      shape: [5, 5],
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

  checkPropertiesCube(
    regl.framebufferCube({
      shape: [5, 5],
      depth: false,
      stencil: true
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
    'shape and no depth cube')

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

  var tex = regl.texture({
    radius: 1,
    format: 'rgba',
    type: 'uint8'
  })

  var rb = regl.renderbuffer({
    radius: 1,
    format: 'depth stencil'
  })

  var fbo = regl.framebuffer({color: tex, depthStencil: rb})

  checkProperties(
    fbo,
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
    'explict color and depth stencil')
  t.equals(fbo.color[0], tex, 'same texture is used')
  t.equals(fbo.depthStencil, rb, 'same renderbuffer is used')

  var cube = regl.cube(1)

  var cubeFbo = regl.framebufferCube({color: cube, depthStencil: rb})

  checkPropertiesCube(
    cubeFbo,
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
    'explict color and depth stencil, cube')
  t.equals(cubeFbo.color[0], cube, 'same cube is used, cube')

  for (var i = 0; i < 6; i++) {
    t.equals(cubeFbo.faces[i].depthStencil, rb, 'same renderbuffer is used, cube, face #' + i)
  }

  // next, we will 'colorType' and 'colorFormat'. We test for all possible combinations of these values.
  var testCases = [
    {tex: true, colorFormat: 'rgba', colorType: 'uint8', expectedFormat: gl.RGBA, expectedType: gl.UNSIGNED_BYTE},
    {tex: false, colorFormat: 'rgba4', expectedFormat: gl.RGBA4},
    {tex: false, colorFormat: 'rgb565', expectedFormat: gl.RGB565},
    {tex: false, colorFormat: 'rgb5 a1', expectedFormat: gl.RGB5_A1}
  ]

  // these test cases should fail.
  var badTestCases = [
    {colorFormat: 'alpha', colorType: 'uint8'},
    {colorFormat: 'luminance', colorType: 'uint8'},
    {colorFormat: 'luminance alpha', colorType: 'uint8'}
  ]

  if (regl.hasExtension('oes_texture_float')) {
    testCases.push({tex: true, colorFormat: 'rgba', colorType: 'float', expectedFormat: gl.RGBA, expectedType: gl.FLOAT})
    badTestCases.push({colorFormat: 'rgb', colorType: 'float'})
  }

  if (regl.hasExtension('oes_texture_half_float')) {
    var GL_HALF_FLOAT_OES = 0x8D61
    testCases.push({tex: true, colorFormat: 'rgba', colorType: 'half float', expectedFormat: gl.RGBA, expectedType: GL_HALF_FLOAT_OES})
    badTestCases.push({colorFormat: 'rgb', colorType: 'half float'})
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

    // if not renderbuffer, also do the test for cubic fbo.
    if (testCase.tex) {
      console.log()
      checkPropertiesCube(
        regl.framebufferCube(fboArgs),
        {
          width: 10,
          height: 10,
          color: [expected],
          depthStencil: {
            target: gl.RENDERBUFFER,
            format: gl.DEPTH_STENCIL
          }
        },
        'cubic fbo, for colorFormat=' + testCase.colorFormat + (testCase.tex ? (' and colorType=' + testCase.colorType) : ''))
    }
  })

  badTestCases.forEach(function (testCase, i) {
    var fboArgs = {
      shape: [10, 10],
      colorFormat: testCase.colorFormat,
      colorType: testCase.colorType
    }

    t.throws(
      function () { regl.framebuffer(fboArgs) },
        /\(regl\)/,
      'throws for colorFormat=' + testCase.colorFormat + ' and colorType=' + testCase.colorType)

    t.throws(
      function () { regl.framebufferCube(fboArgs) },
        /\(regl\)/,
      'throws for cubic fbo, colorFormat=' + testCase.colorFormat + ' and colorType=' + testCase.colorType)
  })

  // we create the maximum number of possible color attachments.
  // and make that colorType and colorFormat is applied for them all.
  if (regl.hasExtension('webgl_draw_buffers')) {
    var expected = {
      width: 1,
      height: 1,
      color: [],
      depthStencil: {
        target: gl.RENDERBUFFER,
        format: gl.DEPTH_STENCIL
      }
    }

    for (i = 0; i < regl.limits.maxColorAttachments; i++) {
      expected.color[i] = {target: gl.TEXTURE_2D, format: gl.RGBA, type: gl.UNSIGNED_BYTE}
    }

    checkProperties(
      regl.framebuffer({colorFormat: 'rgba', colorType: 'uint8', colorCount: regl.limits.maxColorAttachments}),
      expected,
      'for MRT with colorCount: ' + regl.limits.maxColorAttachments)

    t.throws(
      function () { regl.framebuffer({colorFormat: 'rgba', colorType: 'uint8', colorCount: regl.limits.maxColorAttachments + 1}) },
        /\(regl\)/,
      'throws for exceeding regl.limits.maxColorAttachments')
  }

  // Test MRT for cubic fbo. we create the maximum number of possible color attachments.
  // and make that colorType and colorFormat is applied for them all.
  if (regl.hasExtension('webgl_draw_buffers')) {
    expected = {
      width: 1,
      height: 1,
      color: [],
      depthStencil: {
        target: gl.RENDERBUFFER,
        format: gl.DEPTH_STENCIL
      }
    }

    for (i = 0; i < regl.limits.maxColorAttachments; i++) {
      expected.color[i] = {target: gl.TEXTURE_2D, format: gl.RGBA, type: gl.UNSIGNED_BYTE}
    }
    checkPropertiesCube(
      regl.framebufferCube({colorFormat: 'rgba', colorType: 'uint8', colorCount: regl.limits.maxColorAttachments}),
      expected,
      'cube, for MRT with colorCount: ' + regl.limits.maxColorAttachments)

    t.throws(
      function () { regl.framebufferCube({colorFormat: 'rgba', colorType: 'uint8', colorCount: regl.limits.maxColorAttachments + 1}) },
        /\(regl\)/,
      'throws for exceeding regl.limits.maxColorAttachments on cube')
  }

  if (
    regl.hasExtension('webgl_draw_buffers') && regl.hasExtension('oes_texture_float') && regl.hasExtension('oes_texture_half_float')) {
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

  regl.destroy()
  t.equals(gl.getError(), 0, 'error ok')
  createContext.destroy(gl)
  t.end()
})
