var createStack = require('./stack')
var createUniformStack = require('./uniforms')
var createAttributeStack = require('./attributes')

module.exports = function stateCache (
  gl,
  extensions,
  shaderCache,
  bufferCache,
  textureCache,
  fboCache) {
  function capStack (cap) {
    return createStack(false, function (flag) {
      if (flag) {
        gl.enable(cap)
      } else {
        gl.disable(cap)
      }
    })
  }

  // Caps
  var GL_CULL_FACE = gl.CULL_FACE
  var GL_BLEND = gl.BLEND
  var GL_DITHER = gl.DITHER
  var GL_STENCIL_TEST = gl.STENCIL_TEST
  var GL_DEPTH_TEST = gl.DEPTH_TEST
  var GL_SCISSOR_TEST = gl.SCISSOR_TEST
  var GL_POLYGON_OFFSET_FILL = gl.POLYGON_OFFSET_FILL
  var GL_SAMPLE_ALPHA = gl.SAMPLE_ALPHA
  var GL_SAMPLE_COVERAGE = gl.SAMPLE_COVERAGE

  // Blend equation
  var GL_FUNC_ADD = gl.FUNC_ADD

  // Blend func
  var GL_ONE = gl.ONE
  var GL_ZERO = gl.ZERO

  // Faces
  var GL_FRONT = gl.FRONT
  var GL_BACK = gl.BACK

  // Depth
  var GL_LESS = gl.LESS

  // Culling
  var GL_CCW = gl.CCW

  // Stencil
  var GL_ALWAYS = gl.ALWAYS
  var GL_KEEP = gl.KEEP

  var contextState = {
    // Shaders
    shader: createStack([null], function (program) {
      if (!program) {
        return gl.useProgram(null)
      }
      gl.useProgram(program.program)
    }),

    // Uniforms
    uniforms: createUniformStack(gl),

    // Attributes
    attributes: createAttributeStack(gl),

    // Caps
    cullFaceEnable: capStack(GL_CULL_FACE),
    blend: capStack(GL_BLEND),
    dither: capStack(GL_DITHER),
    stencilTest: capStack(GL_STENCIL_TEST),
    depthTest: capStack(GL_DEPTH_TEST),
    scissorTest: capStack(GL_SCISSOR_TEST),
    polygonOffsetFill: capStack(GL_POLYGON_OFFSET_FILL),
    sampleAlpha: capStack(GL_SAMPLE_ALPHA),
    sampleCoverageEnable: capStack(GL_SAMPLE_COVERAGE),

    // Blending
    blendEquation: createStack([GL_FUNC_ADD, GL_FUNC_ADD], function (rgb, a) {
      gl.blendEquationSeparate(rgb, a)
    }),
    blendFunc: createStack([
      GL_ONE, GL_ZERO, GL_ONE, GL_ZERO
    ], function (srcRGB, dstRGB, srcAlpha, dstAlpha) {
      gl.blendFuncSeparate(srcRGB, dstRGB, srcAlpha, dstAlpha)
    }),

    // Depth
    depthFunc: createStack([GL_LESS], function (func) {
      gl.depthFunc(func)
    }),
    depthRange: createStack([0, 1], function (near, far) {
      gl.depthRange(near, far)
    }),

    // Face culling
    cullFace: createStack([GL_BACK], function (mode) {
      gl.cullFace(mode)
    }),
    frontFace: createStack([GL_CCW], function (mode) {
      gl.frontFace(mode)
    }),

    // Write masks
    colorMask: createStack([true, true, true, true], function (r, g, b, a) {
      gl.colorMask(r, g, b, a)
    }),
    depthMask: createStack([true], function (m) {
      gl.depthMask(m)
    }),
    stencilMask: createStack([-1, -1], function (front, back) {
      gl.stencilMask(GL_FRONT, front)
      gl.stencilMask(GL_BACK, back)
    }),

    // Line width
    lineWidth: createStack([1], function (w) {
      gl.lineWidth(w)
    }),

    // Polygon offset
    polygonOffset: createStack([0, 0], function (factor, units) {
      gl.polygonOffset(factor, units)
    }),

    // Sample coverage
    sampleCoverage: createStack([1, false], function (value, invert) {
      gl.sampleCoverage(value, invert)
    }),

    // Stencil
    stencilFunc: createStack([
      GL_ALWAYS, 0, -1,
      GL_ALWAYS, 0, -1
    ], function (frontFunc, frontRef, frontMask,
                 backFunc, backRef, backMask) {
      gl.stencilFuncSeparate(GL_FRONT, frontFunc, frontRef, frontMask)
      gl.stencilFuncSeparate(GL_BACK, backFunc, backRef, backMask)
    }),
    stencilOp: createStack([
      GL_KEEP, GL_KEEP, GL_KEEP,
      GL_KEEP, GL_KEEP, GL_KEEP
    ], function (frontFail, frontDPFail, frontPass,
                 backFail, backDPFail, backPass) {
      gl.stencilOpSeparate(GL_FRONT, frontFail, frontDPFail, frontPass)
      gl.stencilOpSeparate(GL_BACK, backFail, backDPFail, backPass)
    }),

    // Scissor
    scissor: createStack([-1, -1, -1, -1], function (x, y, w, h) {
      gl.scissor(x, y, w, h)
    }),

    // Viewport
    viewport: createStack([-1, -1, -1, -1], function (x, y, w, h) {
      gl.viewport(x, y, w, h)
    })

    // TODO: textures
    // TODO: fbos
    // TODO: pixelStorei
    // TODO: extensions
  }

  var contextProps = Object.keys(contextState)

  function refreshState () {
    contextProps.forEach(function (state) {
      contextState[state].refresh()
    })
  }

  return {
    refresh: refreshState
  }
}
