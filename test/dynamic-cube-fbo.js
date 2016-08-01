var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('dynamic cube fbo', function (t) {
  var i
  if (typeof document === 'undefined') {
    t.pass('cube fbos not supported in headless')
    t.end()
    return
  }

  var gl = createContext(16, 16)
  var regl = createREGL(gl)

  var setFramebufferDynamic = regl({
    framebuffer: regl.prop('framebuffer'),

    frag: [
      'precision mediump float;',
      'uniform vec4 color;',
      'void main() {',
      '  gl_FragColor = color;',
      '}'
    ].join('\n'),

    vert: [
      'precision mediump float;',
      'attribute vec4 position;',
      'void main() {',
      '  gl_Position = position;',
      '}'
    ].join('\n'),

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
    depth: {enable: false},
    count: 3
  })

  function setFramebufferStatic (args, func) {
    return (regl(args))(func)
  }

  var testCubeFBO1 = regl.framebufferCube({
    radius: 1
  })

  function checkCubeMap (color, remark) {
    for (var i = 0; i < 6; i++) {
      setFramebufferStatic({framebuffer: testCubeFBO1.faces[i]}, function () {
        var pixels = regl.read()
        t.same(
          [pixels[0], pixels[1], pixels[2], pixels[3]],
          color,
          remark + ' face ' + i)
      })
    }
  }

  // First render to all the cube faces.
  for (i = 0; i < 6; ++i) {
    setFramebufferDynamic({
      framebuffer: testCubeFBO1.faces[i],
      color: [0, 1, 1, 1]
    })
  }
  checkCubeMap([0, 255, 255, 255], 'dynamic')

  for (i = 0; i < 6; ++i) {
    setFramebufferStatic({framebuffer: testCubeFBO1.faces[i]}, function () {
      regl.clear({color: [255, 0, 255, 255]})
    })
  }
  checkCubeMap([255, 0, 255, 255], 'static')

  for (i = 0; i < 6; ++i) {
    setFramebufferDynamic([{
      framebuffer: testCubeFBO1.faces[i],
      color: [0, 1, 1, 1]
    }])
  }
  checkCubeMap([0, 255, 255, 255], 'batch')

  regl.destroy()
  t.equals(gl.getError(), 0, 'error ok')
  createContext.destroy(gl)
  t.end()
})
