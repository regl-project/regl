var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('renderbuffer parsing', function (t) {
  var gl = createContext(16, 16)
  var regl = createREGL({
    gl: gl,
    optionalExtensions: ['ext_srgb', 'ext_color_buffer_half_float', 'webgl_color_buffer_float']
  })

  function checkProperties (prefix, renderbuffer, props) {
    t.equals(gl.getError(), 0, prefix + ' no gl error')
    t.equals(renderbuffer._reglType, 'renderbuffer', prefix + ' regltype ok')

    var rbProps = renderbuffer._renderbuffer

    t.equals(rbProps.width, props.width, prefix + ' width')
    t.equals(rbProps.height, props.height, prefix + ' height')
    t.equals(rbProps.format, props.format, prefix + ' format')

    gl.bindRenderbuffer(gl.RENDERBUFFER, rbProps.renderbuffer)
    t.equals(gl.getRenderbufferParameter(gl.RENDERBUFFER, gl.RENDERBUFFER_WIDTH), props.width, prefix + ' rb width')
    t.equals(gl.getRenderbufferParameter(gl.RENDERBUFFER, gl.RENDERBUFFER_HEIGHT), props.height, prefix + ' rb height')
    t.equals(gl.getRenderbufferParameter(gl.RENDERBUFFER, gl.RENDERBUFFER_INTERNAL_FORMAT), props.format, prefix + ' rb format')
  }

  function checkThrows (name, props) {
    t.throws(function () {
      regl.renderbuffer(props)
    }, /\(regl\)/, name)
  }

  checkProperties('empty',
    regl.renderbuffer(), {
      width: 1,
      height: 1,
      format: gl.RGBA4
    })

  checkProperties('width/height',
    regl.renderbuffer(5, 7), {
      width: 5,
      height: 7,
      format: gl.RGBA4
    })

  checkThrows('negative width', {
    width: -1
  })

  checkThrows('huge shape', {
    radius: 1e9
  })

  checkThrows('bad format', {
    radius: 10,
    format: 'bad format'
  })

  checkProperties('rgb565',
    regl.renderbuffer({
      shape: [2, 3],
      format: 'rgb565'
    }), {
      width: 2,
      height: 3,
      format: gl.RGB565
    })

  checkProperties('rgb5 a1',
    regl.renderbuffer({
      radius: 3,
      format: 'rgb5 a1'
    }), {
      width: 3,
      height: 3,
      format: gl.RGB5_A1
    })

  checkProperties('depth',
    regl.renderbuffer({
      radius: 1,
      format: 'depth'
    }), {
      width: 1,
      height: 1,
      format: gl.DEPTH_COMPONENT16
    })

  checkProperties('stencil',
    regl.renderbuffer({
      width: 2,
      height: 3,
      format: 'stencil'
    }), {
      width: 2,
      height: 3,
      format: gl.STENCIL_INDEX8
    })

  checkProperties('depth stencil',
    regl.renderbuffer({
      width: 5,
      height: 5,
      format: 'depth stencil'
    }), {
      width: 5,
      height: 5,
      format: gl.DEPTH_STENCIL
    })

  // try resizing
  var depthBuffer = regl.renderbuffer({
    radius: 3,
    format: 'depth'
  })

  checkProperties('depth - init', depthBuffer, {
    width: 3,
    height: 3,
    format: gl.DEPTH_COMPONENT16
  })

  depthBuffer.resize(8, 10)
  checkProperties('depth resize', depthBuffer, {
    width: 8,
    height: 10,
    format: gl.DEPTH_COMPONENT16
  })

  checkProperties('reinit', depthBuffer({
    radius: 3,
    format: 'rgba4'
  }), {
    width: 3,
    height: 3,
    format: gl.RGBA4
  })

  // check extensions
  if (regl.hasExtension('ext_srgb')) {
    checkProperties('srgba', regl.renderbuffer({
      radius: 1,
      format: 'srgba'
    }), {
      width: 1,
      height: 1,
      format: gl.getExtension('ext_srgb').SRGB8_ALPHA8_EXT
    })
  }

  if (regl.hasExtension('ext_color_buffer_half_float')) {
    var ext = gl.getExtension('ext_color_buffer_half_float')
    checkProperties('rgba16f', regl.renderbuffer({
      radius: 1,
      format: 'rgba16f'
    }), {
      width: 1,
      height: 1,
      format: ext.RGBA16F_EXT
    })
    checkProperties('rgb16f', regl.renderbuffer({
      radius: 1,
      format: 'rgb16f'
    }), {
      width: 1,
      height: 1,
      format: ext.RGB16F_EXT
    })
  }

  if (regl.hasExtension('webgl_color_buffer_float')) {
    checkProperties('rgba16f', regl.renderbuffer({
      radius: 1,
      format: 'rgba32f'
    }), {
      width: 1,
      height: 1,
      format: gl.getExtension('webgl_color_buffer_float').RGBA32F_EXT
    })
  }

  function checkFormat (args) {
    args.shape = [1, 1]
    var r = regl.renderbuffer(args)
    var expectedFormat = args.format
    t.equals(r.format, expectedFormat, ' format str for format ' + expectedFormat)
  }

  checkFormat({format: 'rgba4'})
  checkFormat({format: 'rgb565'})
  checkFormat({format: 'rgb5 a1'})
  checkFormat({format: 'depth'})
  checkFormat({format: 'stencil'})
  checkFormat({format: 'depth stencil'})

  if (regl.hasExtension('ext_srgb')) {
    checkFormat({format: 'srgba'})
  }

  if (regl.hasExtension('webgl_color_buffer_float')) {
    checkFormat({format: 'rgba32f'})
  }

  if (regl.hasExtension('ext_color_buffer_half_float')) {
    checkFormat({format: 'rgba16f'})
    checkFormat({format: 'rgb16f'})
  }

  regl.destroy()
  t.equals(gl.getError(), 0, 'error ok')
  createContext.destroy(gl)
  t.end()
})
