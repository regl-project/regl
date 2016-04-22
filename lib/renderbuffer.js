var check = require('./check')

var GL_RENDERBUFFER = 0x8D41

var GL_RGBA4 = 0x8056
var GL_RGB5_A1 = 0x8057
var GL_RGB565 = 0x8D62
var GL_DEPTH_COMPONENT16 = 0x81A5
var GL_STENCIL_INDEX8 = 0x8D48

var GL_SRGB8_ALPHA8_EXT = 0x8C43

module.exports = function (gl, extensions, limits) {
  var formatTypes = {
    'rgba4': GL_RGBA4,
    'rgb565': GL_RGB565,
    'rgb5 a1': GL_RGB5_A1,
    'depth': GL_DEPTH_COMPONENT16,
    'stencil': GL_STENCIL_INDEX8
  }

  if (extensions.ext_srgb) {
    formatTypes['srgba'] = GL_SRGB8_ALPHA8_EXT
  }

  var renderbufferCount = 0
  var renderbufferSet = {}

  function REGLRenderbuffer () {
    this.id = renderbufferCount++
    this.renderbuffer = null

    this.format = GL_RGBA4
    this.width = 0
    this.height = 0
  }

  REGLRenderbuffer.prototype.bind = function () {
    gl.bindRenderbuffer(GL_RENDERBUFFER, this.renderbuffer)
  }

  function refresh(rb) {
    if (!gl.isRenderbuffer(rb.renderbuffer)) {
      rb.renderbuffer = gl.createRenderbuffer()
    }
    rb.bind()
    gl.renderbufferStorage(
      GL_RENDERBUFFER,
      rb.format,
      rb.width,
      rb.height)
  }

  function destroy (rb) {
    gl.bindRenderbuffer(GL_RENDERBUFFER, null)
    if (gl.isRenderbuffer(rb.renderbuffer)) {
      gl.deleteRenderbuffer(rb.renderbuffer)
    }
    rb.renderbuffer = null
    delete renderbufferSet[rb.renderbufferCount]
  }

  function createRenderbuffer (input) {
    var renderbuffer = new REGLRenderbuffer()
    renderbufferSet[renderbuffer.id] = renderbuffer

    function reglRenderbuffer (input) {
      var options = input || {}

      var w = 0
      var h = 0
      if ('shape' in options) {
        var shape = options.shape
        check(Array.isArray(shape) && shape.length >= 2,
          'invalid renderbuffer shape')
        w = shape[0] | 0
        h = shape[1] | 0
      } else {
        if ('radius' in options) {
          w = h = options.radius | 0
        }
        if ('width' in options) {
          w = options.width | 0
        }
        if ('height' in options) {
          h = options.height | 0
        }
      }
      var s = limits.renderbufferSize
      check(w >= 0 && h >= 0 && w <= s && h <= s,
        'invalid renderbuffer size')
      this.width = Math.max(w, 1)
      this.height = Math.max(h, 1)

      this.format = GL_RGBA4
      if ('format' in options) {
        var format = options.format
        check.parameter(format, formatTypes, 'invalid render buffer format')
        this.format = formatTypes[format]
      }

      return reglRenderbuffer
    }

    reglRenderbuffer(input)

    Object.assign(reglRenderbuffer, {
      _reglType: 'renderbuffer',
      _renderbuffer: renderbuffer,
      destroy: destroy.bind(renderbuffer)
    })

    return reglRenderbuffer
  }

  function refreshRenderbuffers () {
    Object.keys(renderbufferSet).forEach(refresh)
  }

  function destroyRenderbuffers () {
    Object.keys(renderbufferSet).forEach(destroy)
  }

  return {
    create: createRenderbuffer,
    refresh: refreshRenderbuffers,
    destroy: destroyRenderbuffers
  }
}
