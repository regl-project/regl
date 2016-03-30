var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('caps', function (t) {
  var gl = createContext(16, 16)
  var regl = createREGL(gl)

  var CAP_LIST = [
    ['cull.enable', gl.CULL_FACE],
    ['blend.enable', gl.BLEND],
    ['dither', gl.DITHER],
    ['stencil.enable', gl.STENCIL_TEST],
    ['scissor.enable', gl.SCISSOR_TEST],
    ['polygonOffset.enable', gl.POLYGON_OFFSET_FILL]
  ]

  // Test in static mode
  CAP_LIST.forEach(function (desc, i) {
    var options = {}
    options[desc[0]] = true

    regl(options)()

    CAP_LIST.forEach(function (cap, j) {
      t.equals(gl.getParameter(cap[1]), i === j, cap[0] + ' static [' + desc[0] + '=true]')
    })
  })

  // Test in dynamic mode
  var dynOptions = {
    frag: 'void main() {gl_FragColor=vec4(1,0,1,0);}'
  }
  CAP_LIST.forEach(function (desc, i) {
    dynOptions[desc[0]] = regl.prop('c' + i)
  })
  var dynCaps = regl(dynOptions)
  CAP_LIST.forEach(function (desc, i) {
    var options = {}
    options['c' + i] = true
    dynCaps(options)

    CAP_LIST.forEach(function (cap, j) {
      t.equals(gl.getParameter(cap[1]), i === j, cap[0] + ' dynamic [' + desc[0] + '=true]')
    })
  })

  // Test in batch mode
  CAP_LIST.forEach(function (desc, i) {
    var options = {}
    options['c' + i] = true
    dynCaps.batch([options])

    CAP_LIST.forEach(function (cap, j) {
      t.equals(gl.getParameter(cap[1]), i === j, cap[0] + ' batch [' + desc[0] + '=true]')
    })
  })

  regl.destroy()

  t.end()
})
