var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('caps', function (t) {
  var gl = createContext(16, 16)
  var regl = createREGL(gl)

  var CAP_LIST = [
    ['cull', gl.CULL_FACE],
    ['blend', gl.BLEND],
    ['dither', gl.DITHER],
    ['stencilTest', gl.STENCIL_TEST],
    ['scissorTest', gl.SCISSOR_TEST],
    ['polygonOffsetFill', gl.POLYGON_OFFSET_FILL]
    // FIXME: In WebGL we can't get these parameters
    // ['sampleAlpha', gl.SAMPLE_ALPHA_TO_COVERAGE],
    // ['sampleCoverage', gl.SAMPLE_COVERAGE]
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
  CAP_LIST.forEach(function (desc) {
    dynOptions[desc[0]] = regl.prop
  })
  var dynCaps = regl(dynOptions)
  CAP_LIST.forEach(function (desc, i) {
    var options = {}
    options[desc[0]] = true
    dynCaps(options)

    CAP_LIST.forEach(function (cap, j) {
      t.equals(gl.getParameter(cap[1]), i === j, cap[0] + ' dynamic [' + desc[0] + '=true]')
    })
  })

  // Test in batch mode
  CAP_LIST.forEach(function (desc, i) {
    var options = {}
    options[desc[0]] = true
    dynCaps.batch([options])

    CAP_LIST.forEach(function (cap, j) {
      t.equals(gl.getParameter(cap[1]), i === j, cap[0] + ' batch [' + desc[0] + '=true]')
    })
  })

  regl.destroy()

  t.end()
})
