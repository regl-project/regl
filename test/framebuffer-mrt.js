var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('framebuffer - multiple draw buffers', function (t) {
  var gl = createContext(16, 16)
  var regl = createREGL({
    gl: gl,
    optionalExtensions: 'webgl_draw_buffers'
  })

  var renderCubeFace = regl({
    vert: [
      'attribute vec2 position;',
      'void main() {',
      'gl_Position = vec4(position, 0, 1);',
      '}'
    ].join('\n'),

    frag: [
      'precision highp float;',
      'uniform samplerCube tex;',
      'uniform vec2 shape;',
      'uniform vec3 front, up, right;',
      'void main() {',
      'vec2 uv = 2.0 * gl_FragCoord.xy - 1.0;',
      'gl_FragColor = textureCube(tex, front + uv.x * right + uv.y * up);',
      '}'
    ].join('\n'),

    attributes: {
      position: [0, -4, -4, 4, 4, 4]
    },

    uniforms: {
      tex: regl.prop('texture'),
      front: regl.prop('front'),
      up: regl.prop('up'),
      right: regl.prop('right')
    },

    depth: {enable: false},

    count: 3
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
      position: [-4, 0, 4, -4, 4, 4]
    },

    count: 3,

    depth: {enable: false}
  })

  function to255 (c) {
    return [
      Math.ceil(c[0] * 255),
      Math.ceil(c[1] * 255),
      Math.ceil(c[2] * 255),
      Math.ceil(c[3] * 255)]
  }

  function compareArrays (actual, expected, remark) {
    if (actual.length !== expected.length) {
      t.fail(remark)
      return
    }
    for (var i = 0; i < actual.length; ++i) {
      if (Math.abs(actual[i] - expected[i]) >= 2) {
        t.fail(remark)
        return
      }
    }
    t.pass(remark)
  }

  function checkTexture (tex, color, remark) {
    renderTexture({ texture: tex })
    var actual = regl.read({ width: 1, height: 1 })
    compareArrays(actual, color, remark)
  }

  function checkCubeFace (tex, color, remark, i) {
    var axes = [
      [0, 1, -1, -1, 1, 2],
      [0, -1, -1, 1, 1, 2],
      [1, 1, 1, 1, 2, 0],
      [1, -1, -1, 1, 2, 0],
      [2, 1, -1, 1, 1, 0],
      [2, -1, -1, -1, 1, 0]
    ]

    var front = [0, 0, 0]
    var up = [0, 0, 0]
    var right = [0, 0, 0]
    var d = axes[i][0]
    front[d] = axes[i][1]
    up[axes[i][4]] = axes[i][2]
    right[axes[i][5]] = axes[i][3]

    renderCubeFace({
      texture: tex,
      front: front,
      up: up,
      right: right
    })

    //    renderTexture({ texture: tex })
    var actual = regl.read({ width: 1, height: 1 })
    compareArrays(actual, color, remark)
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

      uniforms: {
        color0: regl.prop('color0'),
        color1: regl.prop('color1'),
        color2: regl.prop('color2')
      },

      frag: [
        '#extension GL_EXT_draw_buffers : require',
        'precision mediump float;',
        'uniform vec4 color0;',
        'uniform vec4 color1;',
        'uniform vec4 color2;',
        'void main() {',
        '  gl_FragData[0] = color0;',
        '  gl_FragData[1] = color1;',
        '  gl_FragData[2] = color2;',
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
        position: [-4, 0, 4, -4, 4, 4]
      },

      count: 3,

      depth: {enable: false}
    })

    var fbo = regl.framebuffer({
      radius: 1,
      colorCount: 3
    })
    t.equals(fbo.color.length, 3, 'color length ok')

    draw({
      fbo: fbo,
      color0: [1.0, 0.0, 0.0, 1.0],
      color1: [0.0, 1.0, 0.0, 1.0],
      color2: [0.0, 0.0, 1.0, 1.0]
    })
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

    draw({
      fbo: fbo2,
      color0: [1.0, 0.0, 0.0, 1.0],
      color1: [0.0, 1.0, 0.0, 1.0],
      color2: [0.0, 0.0, 1.0, 1.0]
    })
    checkTexture(textures[0], [255, 0, 0, 255], 'color 0')
    checkTexture(textures[1], [0, 255, 0, 255], 'color 1')
    checkTexture(textures[2], [0, 0, 255, 255], 'color 2')

    // test cubic framebuffers:
    var testData = [
      [[1.0, 0.0, 0.0, 1.0], [0.0, 1.0, 0.0, 1.0], [0.0, 0.0, 1.0, 1.0]], // face0
      [[0.0, 1.0, 0.0, 1.0], [0.0, 0.0, 1.0, 1.0], [1.0, 0.0, 0.0, 1.0]], // face 1
      [[0.0, 0.0, 1.0, 1.0], [1.0, 0.0, 0.0, 1.0], [0.0, 1.0, 0.0, 1.0]], // face 2

      [[0.5, 0.0, 0.0, 1.0], [0.0, 0.5, 0.0, 1.0], [0.0, 0.0, 0.5, 1.0]], // face 3
      [[0.0, 0.5, 0.0, 1.0], [0.0, 0.0, 0.5, 1.0], [0.5, 0.0, 0.0, 1.0]], // face 4
      [[0.0, 0.0, 0.5, 1.0], [0.5, 0.0, 0.0, 1.0], [0.0, 0.5, 0.0, 1.0]] // face 5
    ]

    var cubeFbo = regl.framebufferCube({
      radius: 1,
      colorCount: 3
    })

    var td
    var i
    for (i = 0; i < 6; i++) {
      td = testData[i]
      draw({
        fbo: cubeFbo.faces[i],
        color0: td[0], color1: td[1], color2: td[2]
      })
      checkCubeFace(cubeFbo.color[0], to255(td[0]), 'cube color 0, face #' + i, i)
      checkCubeFace(cubeFbo.color[1], to255(td[1]), 'cube color 1, face #' + i, i)
      checkCubeFace(cubeFbo.color[2], to255(td[2]), 'cube color 2, face #' + i, i)
    }

    // now create the cubic fbo from cubemaps, and then render.
    var cubemaps = [
      regl.cube(1),
      regl.cube(1),
      regl.cube(1)
    ]

    var cubeFbo2 = regl.framebufferCube({
      colors: cubemaps
    })

    t.equals(cubeFbo2.color.length, 3, 'cube color length ok')
    t.equals(cubeFbo2.color[0], cubemaps[0], 'cube ref 0 ok')
    t.equals(cubeFbo2.color[1], cubemaps[1], 'cube ref 1 ok')
    t.equals(cubeFbo2.color[2], cubemaps[2], 'cube ref 2 ok')

    for (i = 0; i < 6; i++) {
      td = testData[i]
      draw({
        fbo: cubeFbo2.faces[i],
        color0: td[0], color1: td[1], color2: td[2]
      })
      checkCubeFace(cubeFbo2.color[0], to255(td[0]), 'cube color 0, face #' + i, i)
      checkCubeFace(cubeFbo2.color[1], to255(td[1]), 'cube color 1, face #' + i, i)
      checkCubeFace(cubeFbo2.color[2], to255(td[2]), 'cube color 2, face #' + i, i)
    }
  }

  regl.destroy()
  t.equals(gl.getError(), 0, 'error ok')
  createContext.destroy(gl)
  t.end()
})
