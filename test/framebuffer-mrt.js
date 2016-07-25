var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('framebuffer - multiple draw buffers', function (t) {
  var gl = createContext(16, 16)
  var regl = createREGL({
    gl: gl,
    optionalExtensions: 'webgl_draw_buffers'
  })

  var renderTexture = regl({
    vert: [
      'precision mediump float;',
      'attribute vec2 position;',
      'varying vec2 uv;',
      'void main() {',
      '  uv = 0.5 * position - 1.0;',
      '  gl_Position = vec4(position, 0, 1);',
      '}'
    ].join('\n'),

    frag: [
      'precision mediump float;',
      'varying vec2 uv;',
      'uniform sampler2D tex;',
      'void main() {',
      '  gl_FragColor = texture2D(tex, uv);',
      '}'
    ].join('\n'),

    uniforms: {
      tex: regl.prop('texture')
    },

    attributes: {
      position: [
        -4, 0,
        4, -4,
        4, 4
      ]
    },

    count: 3,

    depth: {enable: false}
  })

  function checkTexture (tex, color, remark) {
    renderTexture({ texture: tex })
    var actual = regl.read({ width: 1, height: 1 })
    t.same(Array.prototype.slice.call(actual), color, remark)
  }

  if (!regl.hasExtension('WEBGL_draw_buffers')) {
    t.throws(function () {
      regl.framebuffer({
        radius: 5,
        colorCount: 2
      }, /\(regl\)/, 'check draw buffers throws')
    })
  } else {
    t.throws(function () {
      regl.framebuffer({
        radius: 5,
        colorCount: regl.limits.maxColorAttachments + 1
      }, /\(regl\)/, 'check drawbuffer limit ok')
    })

    var draw = regl({
      framebuffer: regl.prop('fbo'),

      frag: [
        '#extension GL_EXT_draw_buffers : require',
        'precision mediump float;',
        'void main() {',
        '  gl_FragData[0] = vec4(1, 0, 0, 1);',
        '  gl_FragData[1] = vec4(0, 1, 0, 1);',
        '  gl_FragData[2] = vec4(0, 0, 1, 1);',
        '}'
      ].join('\n'),

      vert: [
        'precision mediump float;',
        'attribute vec2 position;',
        'void main() {',
        '  gl_Position = vec4(position, 0, 1);',
        '}'
      ].join('\n'),

      attributes: {
        position: [
          -4, 0,
          4, -4,
          4, 4
        ]
      },

      count: 3,

      depth: {enable: false}
    })

    var fbo = regl.framebuffer({
      radius: 1,
      colorCount: 3
    })
    t.equals(fbo.color.length, 3, 'color length ok')

    draw({fbo: fbo})
    checkTexture(fbo.color[0], [255, 0, 0, 255], 'color 0')
    checkTexture(fbo.color[1], [0, 255, 0, 255], 'color 1')
    checkTexture(fbo.color[2], [0, 0, 255, 255], 'color 2')

    // try constructing from textures
    var textures = [
      regl.texture(1),
      regl.texture(1),
      regl.texture(1)
    ]

    var fbo2 = regl.framebuffer({
      colors: textures
    })

    t.equals(fbo2.color.length, 3, 'color length ok')
    t.equals(fbo2.color[0], textures[0], 'ref 0 ok')
    t.equals(fbo2.color[1], textures[1], 'ref 1 ok')
    t.equals(fbo2.color[2], textures[2], 'ref 2 ok')

    draw({fbo: fbo2})
    checkTexture(textures[0], [255, 0, 0, 255], 'color 0')
    checkTexture(textures[1], [0, 255, 0, 255], 'color 1')
    checkTexture(textures[2], [0, 0, 255, 255], 'color 2')
  }

  regl.destroy()
  createContext.destroy(gl)
  t.end()
})
