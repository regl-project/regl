var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('texture', function (t) {
  var regl = createREGL(createContext(2, 2))

  // Test basic texture rendering
  var texture = regl.texture([
    [[255, 0, 0], [0, 255, 0]],
    [[0, 0, 255], [255, 255, 255]]
  ])

  const drawTexture = regl({
    frag: [
      'precision mediump float;',
      'uniform sampler2D tex;',
      'varying vec2 uv;',
      'void main() {',
      '  gl_FragColor = texture2D(tex, uv);',
      '}'].join('\n'),

    vert: [
      'precision mediump float;',
      'attribute vec2 p;',
      'varying vec2 uv;',
      'void main() {',
      '  uv = 0.5 * (1.0 + p);',
      '  gl_Position = vec4(p, 0, 1);',
      '}'].join('\n'),

    attributes: {
      p: regl.buffer([
        -4, 4,
        4, 4,
        0, -4
      ])
    },

    uniforms: {
      tex: texture
    },

    depth: { enable: false },

    count: 3
  })

  drawTexture()
  var pixels = regl.read()

  t.same([].slice.call(pixels), [
    255, 0, 0, 255, 0, 255, 0, 255,
    0, 0, 255, 255, 255, 255, 255, 255
  ], 'simple texture test')

  // Test drawing with multiple textures

  // Test texture updates

  // Update in middle of draw loop

  // Texture destruction

  regl.destroy()
  t.end()
})
