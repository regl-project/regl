var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('blend', function (t) {
  var gl = createContext(16, 16)
  var regl = createREGL(gl)

  // TODO

  function testFlags (prefix, flags) {
    t.equals(
      gl.getParameter(gl.BLEND),
      flags.enable,
      prefix + ' blend mode')
    t.same(
      [].slice.call(gl.getParameter(gl.BLEND_COLOR)),
      flags.color,
      prefix + ' blend color')
    t.same(
      gl.getParameter(gl.BLEND_DST_RGB),
      flags.func.dstRGB,
      prefix + ' blend func dstRGB')
    t.same(
      gl.getParameter(gl.BLEND_DST_ALPHA),
      flags.func.dstAlpha,
      prefix + ' blend func dstAlpha')
    t.same(
      gl.getParameter(gl.BLEND_SRC_RGB),
      flags.func.srcRGB,
      prefix + ' blend func srcRGB')
    t.same(
      gl.getParameter(gl.BLEND_SRC_ALPHA),
      flags.func.srcAlpha,
      prefix + ' blend func srcAlpha')
    t.same(
      gl.getParameter(gl.BLEND_EQUATION_RGB),
      flags.equation.rgb,
      prefix + ' blend equation rgb')
    t.same(
      gl.getParameter(gl.BLEND_EQUATION_ALPHA),
      flags.equation.alpha,
      prefix + ' blend equation alpha')
  }

  // blendEquation
  // blendFunc
  // blendColor

  // static
  // dynamic 1-shot
  // dynamic batch

  regl.destroy()
  t.end()
})
