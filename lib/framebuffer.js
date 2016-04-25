// Framebuffer object state management
var check = require('./check')
var values = require('./values')

var GL_FRAMEBUFFER = 0x8D40
var GL_RENDERBUFFER = 0x8D41

var GL_TEXTURE_2D = 0x0DE1
var GL_TEXTURE_CUBE_MAP = 0x8513
var GL_TEXTURE_CUBE_MAP_POSITIVE_X = 0x8515

var GL_COLOR_ATTACHMENT0 = 0x8CE0
var GL_DEPTH_ATTACHMENT = 0x8D00
var GL_STENCIL_ATTACHMENT = 0x8D20
var GL_DEPTH_STENCIL_ATTACHMENT = 0x821A

var GL_UNSIGNED_BYTE = 0x1401
var GL_UNSIGNED_SHORT = 0x1403
var GL_UNSIGNED_INT = 0x1405
var GL_FLOAT = 0x1406

var GL_HALF_FLOAT_OES = 0x8D61

var GL_ALPHA = 0x1906
var GL_LUMINANCE = 0x1909
var GL_LUMINANCE_ALPHA = 0x190A
var GL_RGB = 0x1907
var GL_RGBA = 0x1908

var GL_RGBA4 = 0x8056
var GL_RGB5_A1 = 0x8057
var GL_RGB565 = 0x8D62
var GL_DEPTH_COMPONENT16 = 0x81A5
var GL_STENCIL_INDEX8 = 0x8D48

var GL_SRGB8_ALPHA8_EXT = 0x8C43

var GL_RGBA32F_EXT = 0x8814

var GL_RGBA16F_EXT = 0x881A
var GL_RGB16F_EXT = 0x881B

module.exports = function wrapFBOState (
  gl,
  textureState,
  renderbufferState,
  extensions,
  limits) {
  var colorTextureFormats = {
    'alpha': GL_ALPHA,
    'luminance': GL_LUMINANCE,
    'luminance alpha': GL_LUMINANCE_ALPHA,
    'rgb': GL_RGB,
    'rgba': GL_RGBA
  }

  var colorRenderbufferFormats = {
    'rgba4': GL_RGBA4,
    'rgb565': GL_RGB565,
    'rgb5 a1': GL_RGB5_A1
  }

  if (extensions.ext_srgb) {
    colorRenderbufferFormats['srgba'] = GL_SRGB8_ALPHA8_EXT
  }

  if (extensions.ext_color_buffer_half_float) {
    colorRenderbufferFormats['rgba16f'] = GL_RGBA16F_EXT
    colorRenderbufferFormats['rgb16f'] = GL_RGB16F_EXT
  }

  if (extensions.webgl_color_buffer_float) {
    colorRenderbufferFormats['rgba32f'] = GL_RGBA32F_EXT
  }

  var colorFormats = Object.assign({},
    colorTextureFormats,
    colorRenderbufferFormats)

  var colorTextureFormatEnums = values(colorTextureFormats)
  var colorRenderbufferFormatEnums = values(colorRenderbufferFormats)

  var highestPrecision = GL_UNSIGNED_BYTE
  var colorTypes = {
    'uint8': GL_UNSIGNED_BYTE
  }
  if (extensions.oes_texture_half_float) {
    highestPrecision = colorTypes['half float'] = GL_HALF_FLOAT_OES
  }
  if (extensions.oes_texture_float) {
    highestPrecision = colorTypes.float = GL_FLOAT
  }
  colorTypes.best = highestPrecision

  function FramebufferAttachment (target, level, texture, renderbuffer) {
    this.target = target
    this.level = level
    this.texture = texture
    this.renderbuffer = renderbuffer
  }

  function wrapAttachment (attachment) {
    var target = GL_TEXTURE_2D
    var level = 0
    var texture = null
    var renderbuffer = null

    var data = attachment
    if (typeof attachment === 'object') {
      data = attachment.data
      if ('level' in attachment) {
        level = attachment.level | 0
      }
      if ('target' in attachment) {
        target = attachment.target | 0
      }
    }

    check.type(data, 'function', 'invalid attachment data')

    var type = attachment._reglType
    if (type === 'texture') {
      texture = attachment._texture
      if (texture.target === GL_TEXTURE_CUBE_MAP) {
        check(
          target >= GL_TEXTURE_CUBE_MAP_POSITIVE_X &&
          target < GL_TEXTURE_CUBE_MAP_POSITIVE_X + 6,
          'invalid cube map target')
      } else {
        check(target === GL_TEXTURE_2D)
      }

      // TODO check level of detail

    } else if (type === 'renderbuffer') {
      renderbuffer = attachment._renderbuffer
      target = GL_RENDERBUFFER
      level = 0
    } else {
      check.raise('invalid regl object for attachment')
    }

    return new FramebufferAttachment(target, level, texture, renderbuffer)
  }

  var framebufferCount = 0
  var framebufferSet = {}
  var framebufferStack = [null]
  var framebufferDirty = true

  function REGLFramebuffer () {
    this.id = framebufferCount++
    framebufferSet[this.id] = this

    this.framebuffer = null
    this.width = 0
    this.height = 0

    this.colorAttachments = []
    this.depthAttachment = null
    this.stencilAttachment = null
    this.depthStencilAttachment = null

    this.ownsColor = true
    this.ownsDepth = true
    this.ownsStencil = true
    this.ownsDepthStencil = true
  }

  function refresh (framebuffer) {
    if (gl.isFramebuffer(framebuffer.framebuffer)) {
      framebuffer.framebuffer = gl.createFramebuffer()
    }
    framebufferDirty = true
    gl.bindFramebuffer(GL_FRAMEBUFFER, framebuffer.framebuffer)

    // TODO link attachments
  }

  function destroy (framebuffer) {
    var handle = framebuffer.framebuffer
    check(handle, 'must not double destroy framebuffer')
    if (gl.isFramebuffer(handle)) {
      gl.deleteFramebuffer(handle)
    }
  }

  function createFBO (options) {
    var framebuffer = new REGLFramebuffer()

    function reglFramebuffer (input) {
      var options = input || {}

      var extDrawBuffers = extensions.webgl_draw_buffers

      var width = gl.drawingBufferWidth
      var height = gl.drawingBufferHeight
      if ('shape' in options) {
        var shape = options.shape
        check(Array.isArray(shape) && shape.length >= 2,
          'invalid shape for framebuffer')
        width = shape[0]
        height = shape[1]
      } else {
        if ('radius' in options) {
          width = height = options.radius
        }
        if ('width' in options) {
          width = options.width
        }
        if ('height' in options) {
          height = options.height
        }
      }

      // colorType, numColors
      var colorBuffers = null
      var ownsColor = false
      if ('colorBuffers' in options) {
        var colorInputs = options.colorBuffers
        if (!Array.isArray(colorInputs)) {
          colorInputs = [colorInputs]
        }

        if (colorInputs.length > 1) {
          check(extDrawBuffers, 'multiple render targets not supported')
        }
        check(colorInputs.length >= 0,
          'must specify at least one color attachment')

        // Wrap color attachments
        colorBuffers = colorInputs.map(wrapAttachment)

        // Check head node
        for (var i = 0; i < colorBuffers.length; ++i) {
          var head = colorInputs[0]
          var texture = head.texture
          var renderbuffer = head.renderbuffer
          if (texture) {
            var tw = Math.max(1, texture.width >> head.level)
            var th = Math.max(1, texture.height >> head.level)
            width = width || tw
            height = height || th
            check(tw === width && th === height,
              'inconsistent width/height for supplied texture')
            check(colorTextureFormatEnums.indexOf(texture.internalformat) >= 0,
              'texture format not compatible with color channels')
            check(texture.pollId < 0,
              'polling fbo textures not supported')
          } else {
            width = width || renderbuffer.width
            height = height || renderbuffer.height
            check(
              renderbuffer.width === width && renderbuffer.height === height,
              'inconsistent width/height for renderbuffer')
            check(
              colorRenderbufferFormatEnums.indexOf(renderbuffer.format) >= 0,
              'renderbuffer format not compatible with color channels')
          }
        }
      } else {
        var colorTexture = true
        var colorFormat = GL_RGBA
        var colorType = GL_UNSIGNED_BYTE
        var colorCount = 1
        var colorTexture = false
        ownsColor = true

        if ('colorFormat' in options) {
          var formatStr = options.colorFormat
          check.parameter(formatStr, colorFormats, 'invalid color format')
          colorFormat = colorFormats[formatStr]
          colorTexture = formatStr in colorTextureFormats
        }

        if ('colorType' in options) {
          check(colorTexture,
            'colorType can not be set for renderbuffer targets')
          var typeStr = options.colorType
          check.parameter(typeStr, colorTypes, 'invalid color type')
          colorType = colorTypes[typeStr]
        }

        if ('colorCount' in options) {
          colorCount = options.colorCount | 0
          check(colorCount >= 0, 'color count must be positive')
        }

        if (this.ownsColor) {
          // Reuse color buffer array if we own it
        } else {
          // decrement references to color buffer array and reinitialize
        }
      }

      var depthBuffer = null
      var ownsDepth = false
      if ('depthBuffer' in options) {
        depthBuffer = options.depthBuffer

        // Check shape and dimensions
      } else {

        // parse format from depth buffer
      }

      var stencilBuffer = null
      var ownsStencil = false
      if ('stencilBuffer' in options) {

      } else {

      }

      var depthStencilBuffer = null
      var ownsDepthStencil = false
      if ('depthStencilBuffer' in options) {

      } else {

      }

      this.width = width
      this.height = height
      this.colorAttachments = colorBuffers
      this.depthAttachment = depthBuffer
      this.stencilAttachment = stencilBuffer
      this.depthStencilAttachment = depthStencilBuffer
      this.ownsColor = ownsColor
      this.ownsDepth = ownsDepth
      this.ownsStencil = ownsStencil
      this.ownsDepthStencil = ownsDepthStencil

      return reglFramebuffer
    }

    reglFramebuffer(options)

    Object.assign(reglFramebuffer, {
      _reglType: 'framebuffer',
      _framebuffer: framebuffer,
      destroy: function () {
        destroy(framebuffer)
      }
    })

    return reglFramebuffer
  }

  function refreshCache () {
    values(framebufferSet).forEach(refresh)
  }

  function clearCache () {
    values(framebufferSet).forEach(destroy)
  }

  function poll () {
    if (framebufferDirty) {
      // TODO update framebuffer binding
      framebufferDirty = false
    }
  }

  return {
    push: function (fbo) {
      framebufferStack.push(fbo)
      framebufferDirty = true
    },
    pop: function () {
      framebufferStack.pop()
      framebufferDirty = true
    },
    poll: poll,
    create: createFBO,
    clear: clearCache,
    refresh: refreshCache,
    getFBO: function (wrapper) {
      return null
    }
  }
}
