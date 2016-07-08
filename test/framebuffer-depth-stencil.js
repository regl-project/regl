var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('framebuffer - depth stencil attachment', function (t) {
  var N = 5

  var gl = createContext(N, N)
  var regl = createREGL(gl)

  var drawLine = regl({
    frag: [
      'precision highp float;',
      'uniform vec4 color;',
      'void main() {',
      '  gl_FragColor=color;',
      '}'
    ].join('\n'),

    vert: [
      'precision highp float;',
      'attribute float t;',
      'uniform vec2 p0, p1;',
      'uniform float z;',
      'void main() {',
      '  vec2 p = mix(p0, p1, t);',
      '  gl_Position = vec4(2.0 * (p + 0.5) / 5.0 - 1.0, z, 1);',
      '}'
    ].join('\n'),

    attributes: {
      t: [0, 1]
    },
    primitive: 'lines',
    count: 2,

    uniforms: {
      color: regl.prop('color'),
      p0: regl.prop('x[0]'),
      p1: regl.prop('x[1]'),
      z: regl.prop('z')
    },

    stencil: {
      enable: function (context, props) {
        return 'stencil' in props
      },
      func: function (context, props) {
        if ('stencil' in props) {
          return {
            cmp: '!=',
            ref: props.stencil
          }
        }
      },
      opFront: {
        pass: 'increment'
      },
      opBack: {
        pass: 'increment'
      }
    }
  })

  function testDraw (name, depth, stencil) {
    regl.clear({
      color: [0, 0, 0, 0],
      depth: 1,
      stencil: 0
    })

    if ('stencil') {
      drawLine({
        color: [1, 0, 0, 1],
        x: [[-1, 2], [5, 2]],
        z: 0.5,
        stencil: 1
      })
      drawLine({
        color: [0, 1, 0, 1],
        x: [[1, -1], [1, 5]],
        z: 0.75,
        stencil: 2
      })
      drawLine({
        color: [0, 0, 1, 1],
        x: [[3, 0], [3, 5]],
        z: 0.25,
        stencil: 1
      })
    } else {
      drawLine({
        color: [1, 0, 0, 1],
        x: [[-1, 2], [5, 2]],
        z: 0.5
      })
      drawLine({
        color: [0, 1, 0, 1],
        x: [[1, -1], [1, 5]],
        z: 0.75
      })
      drawLine({
        color: [0, 0, 1, 1],
        x: [[3, -1], [3, 5]],
        z: 0.25
      })
    }

    var pixels = regl.read()
    var expected = []
    for (var j = 0; j < 5; ++j) {
      for (var i = 0; i < 5; ++i) {
        if (i === 1) {
          if (j === 2 && depth) {
            expected.push(255, 0, 0, 255)
          } else {
            expected.push(0, 255, 0, 255)
          }
        } else if (i === 3) {
          if (j === 2 && stencil) {
            expected.push(255, 0, 0, 255)
          } else {
            expected.push(0, 0, 255, 255)
          }
        } else if (j === 2) {
          expected.push(255, 0, 0, 255)
        } else {
          expected.push(0, 0, 0, 0)
        }
      }
    }

    t.same(Array.prototype.slice.call(pixels), expected, name)
  }

  var setFBO = regl({
    framebuffer: regl.prop('fbo')
  })

  function testFBO (name, fbo, depth, stencil) {
    setFBO({ fbo: fbo }, function () {
      testDraw(name, depth, stencil)
    })
  }

  var attributes = gl.getContextAttributes()
  testFBO('drawing buffer', null, attributes.depth, attributes.stencil)

  testFBO('color buffer only',
    regl.framebuffer({
      radius: N,
      depth: false,
      stencil: false
    }),
    false, false)

  testFBO('depth renderbuffer',
    regl.framebuffer({
      radius: N,
      depth: true,
      stencil: false
    }),
    true, false)

  testFBO('stencil renderbuffer',
    regl.framebuffer({
      radius: N,
      depth: false,
      stencil: true
    }),
    false, true)

  testFBO('depth-stencil renderbuffer',
    regl.framebuffer({
      radius: N,
      depth: true,
      stencil: true
    }),
    true, true)

  // try rendering with depth buffer in a broken configuration
  t.throws(function () {
    regl.framebuffer({
      radius: N,
      depthBuffer: regl.renderbuffer(N)
    })
  }, /\(regl\)/, 'bad depth buffer throws')

  t.throws(function () {
    regl.framebuffer({
      radius: N,
      colorBuffer: regl.renderbuffer({
        radius: N,
        format: 'depth'
      })
    })
  }, /\(regl\)/, 'bad color buffer throws')

  if (regl.hasExtension('webgl_depth_texture')) {
    var renderTexture = regl({
      frag: [
        'precision highp float;',
        'uniform sampler2D tex;',
        'varying vec2 uv;',
        'void main() {',
        '  gl_FragColor = texture2D(tex, uv);',
        '}'
      ].join('\n'),

      vert: [
        'precision highp float;',
        'attribute vec2 position;',
        'varying vec2 uv;',
        'void main() {',
        '  uv = position;',
        '  gl_Position = vec4(position, 0, 1);',
        '}'
      ].join('\n'),

      uniforms: {
        tex: regl.prop('texture')
      },

      attributes: {
        position: [
          0, -4,
          4, 4,
          -4, 4
        ]
      },
      count: 3,
      primitive: 'triangles',

      depth: { enable: false }
    })

    var depthTexture = regl.texture({
      radius: N,
      format: 'depth'
    })

    testFBO('depth texture',
      regl.framebuffer({
        radius: N,
        depthBuffer: depthTexture
      }),
      true, false)

    renderTexture({ tex: depthTexture })
    // TODO: test depth texture contents

    testFBO('depth texture + stencil renderbuffer',
      regl.framebuffer({
        radius: N,
        depthBuffer: depthTexture,
        stencilBuffer: regl.renderbuffer({
          radius: N,
          format: 'stencil'
        })
      }),
      true, true)

    var depthStencilTexture = regl.texture({
      radius: N,
      format: 'depth stencil'
    })

    testFBO('depth-stencil texture',
      regl.framebuffer({
        radius: N,
        depthStencilBuffer: depthStencilTexture
      }),
      true, true)

    renderTexture({ tex: depthStencilTexture })
    // TODO: test depth-stencil texture contents
  }

  regl.destroy()
  createContext.destroy(gl)
  t.end()
})
