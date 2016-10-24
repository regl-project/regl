var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('framebuffer - depth stencil attachment', function (t) {
  var N = 5

  var gl = createContext(N, N)
  var regl = createREGL({
    gl: gl,
    optionalExtensions: 'webgl_depth_texture'
  })

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
        return {
          cmp: '!=',
          ref: props.stencil | 0
        }
      },
      opFront: {
        zpass: 'increment'
      },
      opBack: {
        zpass: 'increment'
      }
    }
  })

  function testDraw (name, depth, stencil) {
    regl.clear({
      color: [0, 0, 0, 0],
      depth: 1,
      stencil: 0
    })

    if (stencil) {
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

  function testFBOCube (name, fbo, depth, stencil) {
    for (var i = 0; i < 6; i++) {
      setFBO({ fbo: fbo.faces[i] }, function () {
        testDraw(name + 'face #' + i, depth, stencil)
      })
    }
  }

  var attributes = gl.getContextAttributes()
  testFBO('drawing buffer', null, attributes.depth, attributes.stencil)

  testFBO('color buffer only',
    regl.framebuffer({
      radius: N,
      depthStencil: false
    }),
    false, false)

  // TODO: rendering to depth-stencil does not seem to work in headless
  // we should look into this.
  if (typeof document !== 'undefined') {
    testFBOCube('color buffer only, cube fbo, ',
      regl.framebufferCube({
        radius: N,
        depthStencil: false
      }),
      false, false)

    testFBO('depth renderbuffer - implicit',
      regl.framebuffer({
        radius: N,
        depth: true,
        stencil: false
      }),
      true, false)

    testFBO('depth renderbuffer',
      regl.framebuffer({
        radius: N,
        depth: regl.renderbuffer({
          radius: N,
          format: 'depth'
        }),
        stencil: false
      }),
      true, false)

    testFBO('stencil renderbuffer - implicit',
      regl.framebuffer({
        radius: N,
        depth: false,
        stencil: true
      }),
      false, true)

    testFBO('depth-stencil renderbuffer - implicit',
      regl.framebuffer({
        radius: N,
        depthStencil: true
      }),
      true, true)

    testFBOCube('depth-stencil renderbuffer - implicit, cube fbo, ',
      regl.framebufferCube({
        radius: N,
        depthStencil: true
      }),
      true, true)

    testFBO('depth-stencil renderbuffer',
      regl.framebuffer({
        radius: N,
        depthStencil: regl.renderbuffer({
          radius: N,
          format: 'depth stencil'
        })
      }),
      true, true)

    testFBOCube('depth-stencil renderbuffer, cube fbo, ',
      regl.framebufferCube({
        radius: N,
        depthStencil: regl.renderbuffer({
          radius: N,
          format: 'depth stencil'
        })
      }),
      true, true)
  }

  // try rendering with depth buffer in a broken configuration
  t.throws(function () {
    regl.framebuffer({
      radius: N,
      depth: regl.renderbuffer(N)
    })
  }, /\(regl\)/, 'bad depth buffer throws')

  t.throws(function () {
    regl.framebufferCube({
      radius: N,
      depth: regl.renderbuffer(N)
    })
  }, /\(regl\)/, 'bad depth buffer throws, cube fbo')

  t.throws(function () {
    regl.framebuffer({
      radius: N,
      color: regl.renderbuffer({
        radius: N,
        format: 'depth'
      })
    })
  }, /\(regl\)/, 'bad color buffer throws')

  t.throws(function () {
    regl.framebufferCube({
      radius: N,
      color: regl.renderbuffer({
        radius: N,
        format: 'depth'
      })
    })
  }, /\(regl\)/, 'bad color buffer throws, cube fbo')

  if (regl.hasExtension('webgl_depth_texture')) {
    if (typeof document === 'undefined') {
      var fbo = regl.framebuffer({
        radius: N,
        depthTexture: true,
        stencil: false
      })

      testFBO('depth texture (params)', fbo, true, false)

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
    }

    var depthStencilTexture = regl.texture({
      radius: N,
      format: 'depth stencil'
    })

    testFBO('depth-stencil texture (params)',
      regl.framebuffer({
        radius: N,
        depthTexture: true
      }), true, true)

    testFBO('depth-stencil texture',
      regl.framebuffer({
        radius: N,
        depthStencilBuffer: depthStencilTexture
      }),
      true, true)
  }

  regl.destroy()
  t.equals(gl.getError(), 0, 'error ok')
  createContext.destroy(gl)
  t.end()
})
