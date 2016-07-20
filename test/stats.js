'use strict'

var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('test regl.stats', function (t) {
  setTimeout(function () {
    var gl = createContext(2000, 2000)
    var regl
    //    var stats
    //
    // Begin Test stats.bufferCount
    //
    regl = createREGL({gl: gl, profile: true})
    var stats = regl.stats

    t.equals(stats.bufferCount, 0, 'stats.bufferCount==0 at start')

    var buf = regl.buffer([1, 2, 3])
    buf([2, 3, 4])
    regl.buffer(new Uint16Array([1, 2, 3]))
    regl.buffer(new Float32Array([1, 2, 3, 4]))

    t.equals(stats.bufferCount, 3, 'stats.bufferCount==3 after creating 3 buffers')

    regl.destroy()

    t.equals(stats.bufferCount, 0, 'stats.bufferCount==0 after regl.destroy()')
    //
    // End Test stats.bufferCount
    //

    //
    // Begin Test stats.elementsCount
    //
    regl = createREGL(gl)
    stats = regl.stats

    t.equals(stats.elementsCount, 0, 'stats.elementsCount==0 at start')

    var elements = regl.elements([1, 2, 3])
    elements([1, 2, 3])
    regl.elements([[1, 2, 3], [5, 6, 7]])
    regl.elements({
      primitive: 'line loop',
      count: 5,
      data: new Uint8Array([0, 2, 4, 1, 3])
    })

    t.equals(stats.bufferCount, 3, 'stats.elementsCount==3 after creating 3 buffers')

    regl.destroy()

    // UNCOMMENT THIS ONCE ISSUE #40 IS RESOLVED.
    t.equals(stats.elementsCount, 0, 'stats.elementsCount==0 after regl.destroy()')
    //
    // End Test stats.elementsCount
    //

    //
    // Begin Test stats.framebufferCount
    //

    regl = createREGL(gl)
    stats = regl.stats

    t.equals(stats.framebufferCount, 0, 'stats.framebufferCount==0 at start')

    regl.framebuffer({radius: 5})
    regl.framebuffer({width: 2, height: 4, depth: false, stencil: false})

    t.equals(stats.framebufferCount, 2, 'stats.framebufferCount==2 after creating 2 buffers')

    regl.destroy()
    t.equals(stats.framebufferCount, 0, 'stats.framebufferCount==0 after regl.destroy()')
    //
    // End Test stats.framebufferCount
    //

    //
    // Begin Test stats.shaderCount
    //
    regl = createREGL(gl)
    stats = regl.stats

    t.equals(stats.shaderCount, 0, 'stats.shaderCount==0 at start')

    var draw1 = regl({
      frag: [
        'precision mediump float;',
        'void main () { gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); } '
      ].join('\n'),
      vert: [
        'precision mediump float;',
        'attribute vec2 position;',
        'void main () {gl_Position = vec4(position, 0, 1); }'
      ].join('\n'),
      attributes: { position: [[-1, 0], [0, -1], [1, 1]] },
      uniforms: { color: [1, 0, 0, 1] },
      count: 3
    })

    var draw2 = regl({
      frag: [
        'precision mediump float;',
        'void main () { gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0); } '
      ].join('\n'),
      vert: [
        'precision mediump float;',
        'attribute vec2 position;',
        'void main () {gl_Position = vec4(position, 0, 1); }'
      ].join('\n'),
      attributes: { position: [[-1, 0], [0, -1], [1, 1]] },
      uniforms: { color: [1, 0, 0, 1] },
      count: 3
    })

    // no matter how many times we draw it, we should only have two shaders.
    draw1()
    draw1()

    draw2()
    draw2()

    t.equals(stats.shaderCount, 2, 'stats.shaderCount==2 after creating 2 calls')

    regl.destroy()
    t.equals(stats.shaderCount, 0, 'stats.shaderCount==0 after regl.destroy()')
    //
    // End Test stats.shaderCount
    //

    //
    // Begin Test stats.textureCount
    //
    regl = createREGL(gl)
    stats = regl.stats

    t.equals(stats.textureCount, 0, 'stats.textureCount==0 at start')

    var tex = regl.texture({shape: [16, 16]})
    tex(5)
    regl.texture({
      width: 2,
      height: 2,
      data: [
        255, 255, 255, 255, 0, 0, 0, 0,
        255, 0, 255, 255, 0, 0, 255, 255
      ]
    })
    regl.texture([[[0, 255, 0], [255, 0, 0]], [[0, 0, 255], [255, 255, 255]]])
    t.equals(stats.textureCount, 3, 'stats.textureCount==3 after creating 3 textures')

    regl.destroy()
    t.equals(stats.textureCount, 0, 'stats.textureCount==0 after regl.destroy()')
    //
    // End Test stats.textureCount
    //

    //
    // Begin Test stats.cubeCount
    //
    regl = createREGL(gl)
    stats = regl.stats

    t.equals(stats.cubeCount, 0, 'stats.cubeCount==0 at start')

    var cube = regl.cube(16)
    cube(8)
    regl.cube(
      [[[255, 0, 0, 255]]],
      [[[0, 255, 0, 255]]],
      [[[0, 0, 255, 255]]],
      [[[0, 0, 0, 255]]],
      [[[255, 255, 0, 255]]],
      [[[0, 255, 255, 255]]])
    regl.cube({
      faces: [
        [[[255, 0, 0, 255]]],
        [[[0, 255, 0, 255]]],
        [[[0, 0, 255, 255]]],
        [[[0, 0, 0, 255]]],
        [[[255, 0, 0, 255]]],
        [[[0, 255, 0, 255]]]
      ]
    })

    t.equals(stats.cubeCount, 3, 'stats.cubeCount==3 after creating 3 cubes')

    regl.destroy()
    t.equals(stats.cubeCount, 0, 'stats.cubeCount==0 after regl.destroy()')
    //
    // End Test stats.cubeCount
    //

    //
    // Begin Test stats.renderbufferCount
    //
    regl = createREGL(gl)
    stats = regl.stats

    t.equals(stats.renderbufferCount, 0, 'stats.renderbufferCount==0 at start')

    regl.renderbuffer()
    var rb = regl.renderbuffer({width: 16, height: 16, format: 'rgba4'})
    regl.renderbuffer({width: 2, height: 2, format: 'depth'})
    rb(3, 3)
    t.equals(stats.renderbufferCount, 3, 'stats.renderbufferCount==3 after creating 3 renderbuffers')

    regl.destroy()
    t.equals(stats.renderbufferCount, 0, 'stats.renderbufferCount==0 after regl.destroy()')
    //
    // End Test stats.renderbufferCount
    //

    regl = createREGL({
      gl: gl,
      profile: true,
      optionalExtensions: [
        'oes_texture_float',
        'oes_texture_half_float',
        'ext_srgb',
        'webgl_depth_texture',
        'webgl_compressed_texture_s3tc',
        'webgl_compressed_texture_atc',
        'webgl_compressed_texture_pvrtc',
        'webgl_compressed_texture_etc1'

      ]
    })

    var testCases = [
      {format: 'alpha', type: 'uint8', expected: 256},
      {format: 'luminance', type: 'uint8', expected: 256},
      {format: 'luminance alpha', type: 'uint8', expected: 512},
      {format: 'rgb', type: 'uint8', expected: 768},
      {format: 'rgba', type: 'uint8', expected: 1024},
      {format: 'rgba4', type: 'rgba4', expected: 512},
      {format: 'rgb5 a1', type: 'rgb5 a1', expected: 512},
      {format: 'rgb565', type: 'rgb565', expected: 512}
    ]

    if (regl.hasExtension('ext_srgb')) {
      testCases.push({format: 'srgba', type: 'uint8', expected: 1024})
      testCases.push({format: 'srgb', type: 'uint8', expected: 768})
    }

    if (regl.hasExtension('oes_texture_float')) {
      testCases.push({format: 'alpha', type: 'float', expected: 1024})
      testCases.push({format: 'luminance', type: 'float', expected: 1024})
      testCases.push({format: 'luminance alpha', type: 'float', expected: 2048})
      testCases.push({format: 'rgb', type: 'float', expected: 3072})
      testCases.push({format: 'rgba', type: 'float', expected: 4096})
      if (regl.hasExtension('ext_srgb')) {
        testCases.push({format: 'srgb', type: 'float', expected: 3072})
        testCases.push({format: 'srgba', type: 'float', expected: 4096})
      }
    }

    if (regl.hasExtension('oes_texture_half_float')) {
      testCases.push({format: 'alpha', type: 'half float', expected: 512})
      testCases.push({format: 'luminance', type: 'half float', expected: 512})
      testCases.push({format: 'luminance alpha', type: 'half float', expected: 1024})
      testCases.push({format: 'rgb', type: 'half float', expected: 1536})
      testCases.push({format: 'rgba', type: 'half float', expected: 2048})
      if (regl.hasExtension('ext_srgb')) {
        testCases.push({format: 'srgb', type: 'half float', expected: 1536})
        testCases.push({format: 'srgba', type: 'half float', expected: 2048})
      }
    }

    if (regl.hasExtension('webgl_depth_texture')) {
      testCases.push({format: 'depth', type: 'uint16', expected: 512})
      testCases.push({format: 'depth', type: 'uint32', expected: 1024})
      testCases.push({format: 'depth stencil', type: 'depth stencil', expected: 1024})
    }

    function getZeros (n) {
      var a = []
      for (var i = 0; i < n; i++) {
        a[i] = 0
      }
      return new Uint8Array(a)
    }

    if (regl.hasExtension('webgl_compressed_texture_s3tc')) {
      testCases.push({format: 'rgb s3tc dxt1', type: 'uint8', expected: 128, data: getZeros(128)})
      // TODO: also test 'rgba s3tc dxt1'
      testCases.push({format: 'rgba s3tc dxt3', type: 'uint8', expected: 256, data: getZeros(256)})
      testCases.push({format: 'rgba s3tc dxt5', type: 'uint8', expected: 256, data: getZeros(256)})
    }

    if (regl.hasExtension('webgl_compressed_texture_atc')) {
      testCases.push({format: 'rgb atc', type: 'uint8', expected: 128, data: getZeros(128)})
      testCases.push({format: 'rgba atc explicit alpha', type: 'uint8', expected: 256, data: getZeros(256)})
      testCases.push({format: 'rgba atc interpolated alpha', type: 'uint8', expected: 256, data: getZeros(256)})
    }

    if (regl.hasExtension('webgl_compressed_texture_pvrtc')) {
      testCases.push({format: 'rgb pvrtc 4bppv1', type: 'uint8', expected: 128, data: getZeros(128)})
      testCases.push({format: 'rgb pvrtc 2bppv1', type: 'uint8', expected: 64, data: getZeros(64)})
      testCases.push({format: 'rgba pvrtc 4bppv1', type: 'uint8', expected: 128, data: getZeros(128)})
      testCases.push({format: 'rgba pvrtc 2bppv1', type: 'uint8', expected: 64, data: getZeros(64)})
    }

    if (regl.hasExtension('webgl_compressed_texture_etc1')) {
      testCases.push({format: 'rgb etc1', type: 'uint8', expected: 128, data: getZeros(128)})
    }

    testCases.forEach(function (testCase, i) {
      var arg = {shape: [16, 16], type: testCase.type, format: testCase.format}
      if (typeof testCase.data !== 'undefined') {
        arg.data = testCase.data
      }
      var tex = regl.texture(arg)

      t.equals(tex.stats.size, testCase.expected,
               'correct texture size' +
               ' for type \'' + testCase.type + '\' and format \'' + testCase.format + '\'')
    })

    createContext.destroy(gl)
    t.end()
  }, 120)
})
