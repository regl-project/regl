var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('framebuffer', function (t) {
  var gl = createContext(16, 16)
  var regl = createREGL(gl)

  // modes to check:
  //  scope
  //  draw
  //  batch

  var setFramebufferDynamic = regl({
    framebuffer: regl.prop('framebuffer'),
    frag: `
    precision mediump float;
    uniform vec4 color;
    void main() {
      gl_FragColor = color;
    }
    `,
    vert: `
    precision mediump float;
    attribute vec4 position;
    void main() {
      gl_Position = position;
    }
    `,
    attributes: {
      position: regl.buffer([
        [-4, 0, 0, 1],
        [0, -4, 0, 1],
        [4, 4, 0, 1]
      ])
    },
    uniforms: {
      color: regl.prop('color')
    },
    count: 3
  })

  function setFramebufferStatic (args, func) {
    return (regl(args))(func)
  }

  function checkFBO (props, prefix) {
    var curFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING)
    var expectedFramebuffer = props.framebuffer
    if (expectedFramebuffer) {
      t.equals(curFramebuffer, expectedFramebuffer._framebuffer.framebuffer,
        prefix + ' fbo binding')
    } else {
      t.equals(curFramebuffer, null, prefix + ' expect drawing buffer')
    }

    var width = props.width
    var height = props.height
    var pixels = new Uint8Array(width * height * 4)
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    var color = props.color
    function checkPixels () {
      for (var i = 0; i < width * height; i += 4) {
        if (pixels[i] !== color[0] ||
            pixels[i + 1] !== color[1] ||
            pixels[i + 2] !== color[2] ||
            pixels[i + 3] !== color[3]) {
          return false
        }
      }
      return true
    }
    t.ok(checkPixels(), prefix + ' color')

    var viewport = gl.getParameter(gl.VIEWPORT)
    t.equals(viewport[0], 0, prefix + ' viewport x')
    t.equals(viewport[1], 0, prefix + ' viewport y')
    t.equals(viewport[2], width, prefix + ' viewport width')
    t.equals(viewport[3], height, prefix + ' viewport height')
  }

  function clearCheck (props, prefix) {
    var c = props.color
    regl.clear({
      color: c.map(function (x) { return x / 255 })
    })
    checkFBO(props, prefix)
  }

  var testFBO1 = regl.framebuffer({
    radius: 5
  })

  var testFBO2 = regl.framebuffer({
    radius: 8
  })

  clearCheck({
    width: 16,
    height: 16,
    framebuffer: null,
    color: [255, 0, 0, 255]
  }, 'draw buffer')

  setFramebufferStatic({
    framebuffer: testFBO1
  }, function () {
    clearCheck({
      width: 5,
      height: 5,
      framebuffer: testFBO1,
      color: [0, 255, 0, 255]
    }, 'fbo 1 - static')
  })

  clearCheck({
    width: 16,
    height: 16,
    framebuffer: null,
    color: [255, 255, 255, 255]
  }, 'draw buffer')

  setFramebufferDynamic({
    framebuffer: testFBO2,
    color: [0, 0, 0, 0]
  }, function () {
    clearCheck({
      width: 8,
      height: 8,
      framebuffer: testFBO2,
      color: [0, 0, 255, 255]
    }, 'fbo 2 - dynamic')
  })

  clearCheck({
    width: 16,
    height: 16,
    framebuffer: null,
    color: [0, 0, 0, 255]
  }, 'draw buffer')

  setFramebufferStatic({
    framebuffer: testFBO1
  }, function () {
    regl.clear({ depth: 1 })
    checkFBO({
      width: 5,
      height: 5,
      framebuffer: testFBO1,
      color: [0, 255, 0, 255]
    }, 'fbo 1 - restore')
  })

  setFramebufferDynamic({
    framebuffer: testFBO2,
    color: [0, 0, 0, 0]
  }, function () {
    regl.clear({ depth: 1 })
    checkFBO({
      width: 8,
      height: 8,
      framebuffer: testFBO2,
      color: [0, 0, 255, 255]
    }, 'fbo 2 - restore')

    setFramebufferDynamic({
      framebuffer: null,
      color: [0, 0, 0, 0]
    }, function () {
      regl.clear({ depth: 1 })
      checkFBO({
        width: 16,
        height: 16,
        framebuffer: null,
        color: [0, 0, 0, 255]
      }, 'draw buffer nested')

      setFramebufferDynamic({
        framebuffer: testFBO1,
        color: [0, 0, 0, 0]
      }, function () {
        regl.clear({ depth: 1 })
        checkFBO({
          width: 5,
          height: 5,
          framebuffer: testFBO1,
          color: [0, 255, 0, 255]
        }, 'fbo 1 - nested')
      })

      regl.clear({ depth: 1 })
      checkFBO({
        width: 16,
        height: 16,
        framebuffer: null,
        color: [0, 0, 0, 255]
      }, 'draw buffer nested return')
    })

    regl.clear({ depth: 1 })
    checkFBO({
      width: 8,
      height: 8,
      framebuffer: testFBO2,
      color: [0, 0, 255, 255]
    }, 'fbo 2 - restore')
  })

  function checkContents (fbo, color, prefix) {
    setFramebufferDynamic({
      framebuffer: fbo,
      color: [0, 0, 0, 0]
    }, function () {
      regl.clear({ depth: 1 })
      checkFBO({
        width: fbo ? fbo.width : gl.drawingBufferWidth,
        height: fbo ? fbo.height : gl.drawingBufferHeight,
        framebuffer: fbo,
        color: color
      }, prefix)
    })
  }

  // draw mode
  setFramebufferDynamic({
    framebuffer: null,
    color: [1, 0, 1, 1]
  })
  gl.finish()

  setFramebufferDynamic({
    framebuffer: testFBO1,
    color: [0, 1, 1, 1]
  })
  gl.finish()

  setFramebufferDynamic({
    framebuffer: testFBO2,
    color: [1, 1, 0, 1]
  })
  gl.finish()

  checkContents(null, [255, 0, 255, 255], 'draw drawing buffer')
  checkContents(testFBO1, [0, 255, 255, 255], 'draw first fbo')
  checkContents(testFBO2, [255, 255, 0, 255], 'draw second fbo')

  // batch mode
  setFramebufferDynamic([
    {
      framebuffer: null,
      color: [0, 1, 0, 1]
    },
    {
      framebuffer: testFBO1,
      color: [1, 0, 0, 1]
    },
    {
      framebuffer: testFBO2,
      color: [0, 0, 1, 1]
    }
  ])
  checkContents(null, [0, 255, 0, 255], 'batch drawing fbo')
  checkContents(testFBO1, [255, 0, 0, 255], 'batch first fbo')
  checkContents(testFBO2, [0, 0, 255, 255], 'batch second fbo')

  // TODO check copyTexImage
  // TODO check regl.read

  t.end()
})
