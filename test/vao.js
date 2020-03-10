var tape = require('tape')
var createContext = require('./util/create-context')
var createREGL = require('../regl')

function testVAO (regl, t) {
  var frag = [
    'precision highp float;',
    'void main() {',
    'gl_FragColor = vec4(1, 1, 1, 1);',
    '}'
  ].join('\n')

  var vert = [
    'precision highp float;',
    'attribute vec2 position;',
    'varying vec4 fragColor;',
    'void main() {',
    'gl_Position=vec4(position, 0, 1);',
    'gl_PointSize=1.;',
    '}'
  ].join('\n')

  var baseCommand = {
    frag: frag,
    vert: vert,
    attributes: {
      position: 0
    },
    primitive: 'lines',
    depth: false,
    count: 2
  }

  var vaoHorizontal = [
    [ [-10, 0], [10, 0] ]
  ]
  var vaoVertical = [
    [ [0, -10], [0, 10] ]
  ]

  var vaoHorizontalResource = regl.vao(vaoHorizontal)
  var vaoVerticalResource = regl.vao(vaoVertical)

  var horizontalExpected = [
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0,
    1, 1, 1, 1, 1,
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0
  ]
  var verticalExpected = [
    0, 0, 1, 0, 0,
    0, 0, 1, 0, 0,
    0, 0, 1, 0, 0,
    0, 0, 1, 0, 0,
    0, 0, 1, 0, 0
  ]
  var crossExpected = [
    0, 0, 1, 0, 0,
    0, 0, 1, 0, 0,
    1, 1, 1, 1, 1,
    0, 0, 1, 0, 0,
    0, 0, 1, 0, 0
  ]

  function check (body, expected, name) {
    regl.clear({
      color: [0, 0, 0, 0],
      depth: 1
    })
    body()
    var actual = regl.read()
    var actualStr = []
    var exptectedStr = []
    for (var i = 0; i < 5; ++i) {
      for (var j = 0; j < 5; ++j) {
        var ptr = 5 * i + j
        exptectedStr.push(expected[ptr])
        actualStr.push(actual[4 * ptr] ? 1 : 0)
      }
      actualStr.push('\n')
      exptectedStr.push('\n')
    }
    t.equals(actualStr.join(''), exptectedStr.join(''), name)
  }

  var staticScope = regl({
    vao: vaoVertical
  })

  var staticResourceScope = regl({
    vao: vaoVerticalResource
  })

  var dynamicScope = regl({
    vao: regl.prop('vao')
  })

  var drawContext = regl(baseCommand)

  var drawStatic = regl(Object.assign({
    vao: vaoHorizontal
  }, baseCommand))

  var drawStaticResource = regl(Object.assign({
    vao: vaoHorizontalResource
  }, baseCommand))

  var drawDynamic = regl(Object.assign({
    vao: regl.prop('vao')
  }, baseCommand))

  check(function () {
    drawStatic()
  }, horizontalExpected, 'draw/static')

  check(function () {
    drawStaticResource()
  }, horizontalExpected, 'draw/static-resource')

  check(function () {
    drawDynamic({
      vao: vaoVerticalResource
    })
  }, verticalExpected, 'draw/prop')

  check(function () {
    staticScope(function () {
      drawContext()
    })
  }, verticalExpected, 'draw/scope/static')

  check(function () {
    dynamicScope(
      { vao: vaoHorizontalResource },
      function () {
        drawContext()
      })
  }, horizontalExpected, 'draw/scope/dynamic')

  check(function () {
    drawStatic(1)
  }, horizontalExpected, 'batch/static')

  check(function () {
    drawStaticResource(1)
  }, horizontalExpected, 'batch/static-resource')

  check(function () {
    drawDynamic([
      { vao: vaoVerticalResource },
      { vao: vaoHorizontalResource }
    ])
  }, crossExpected, 'batch/prop')

  check(function () {
    staticScope(function () {
      drawContext(1)
    })
  }, verticalExpected, 'batch/scope/static')

  check(function () {
    staticResourceScope(function () {
      drawContext(1)
    })
  }, verticalExpected, 'batch/scope/static-resource')

  check(function () {
    dynamicScope(
      { vao: vaoHorizontalResource },
      function () {
        drawContext(1)
      })
  }, horizontalExpected, 'batch/scope/dynamic')
}

tape('vao - extension', function (t) {
  var gl = createContext(5, 5)
  var regl
  try {
    regl = createREGL({
      gl: gl,
      extensions: [ 'oes_vertex_array_object' ]
    })
  } catch (e) {
    t.pass('extension not supported')
    createContext.destroy(gl)
    t.end()
    return
  }

  testVAO(regl, t)

  regl.destroy()
  t.equals(gl.getError(), 0, 'error ok')
  createContext.destroy(gl)
  t.end()
})

tape('vao - emulation', function (t) {
  var gl = createContext(5, 5)
  var regl = createREGL(gl)

  testVAO(regl, t)

  regl.destroy()
  t.equals(gl.getError(), 0, 'error ok')
  createContext.destroy(gl)
  t.end()
})
