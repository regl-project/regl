var createStack = require('./stack')

// WebGL constants
var GL_CULL_FACE = 0x0B44
var GL_BLEND = 0x0BE2
var GL_DITHER = 0x0BD0
var GL_STENCIL_TEST = 0x0B90
var GL_DEPTH_TEST = 0x0B71
var GL_SCISSOR_TEST = 0x0C11
var GL_POLYGON_OFFSET_FILL = 0x8037
var GL_SAMPLE_ALPHA_TO_COVERAGE = 0x809E
var GL_SAMPLE_COVERAGE = 0x80A0
var GL_FUNC_ADD = 0x8006
var GL_ZERO = 0
var GL_ONE = 1
var GL_FRONT = 1028
var GL_BACK = 1029
var GL_LESS = 513
var GL_CCW = 2305
var GL_ALWAYS = 519
var GL_KEEP = 7680

module.exports = function wrapContextState (gl, shaderState) {
  function capStack (cap, dflt) {
    var result = createStack([!!dflt], function (flag) {
      if (flag) {
        gl.enable(cap)
      } else {
        gl.disable(cap)
      }
    })
    result.flag = cap
    return result
  }

  var viewportState = {
    width: 0,
    height: 0
  }

  // Caps, flags and other random WebGL context state
  var contextState = {
    // Caps
    'cull.enable': capStack(GL_CULL_FACE),
    'blend.enable': capStack(GL_BLEND),
    'dither': capStack(GL_DITHER),
    'stencil.enable': capStack(GL_STENCIL_TEST),
    'depth.enable': capStack(GL_DEPTH_TEST, true),
    'scissor.enable': capStack(GL_SCISSOR_TEST),
    'polygonOffset.enable': capStack(GL_POLYGON_OFFSET_FILL),
    'sampleAlpha': capStack(GL_SAMPLE_ALPHA_TO_COVERAGE),
    'sampleCoverage': capStack(GL_SAMPLE_COVERAGE),

    // Blending
    'blend.color': createStack([0, 0, 0, 0], function (r, g, b, a) {
      gl.blendColor(r, g, b, a)
    }),
    'blend.equation': createStack([GL_FUNC_ADD, GL_FUNC_ADD], function (rgb, a) {
      gl.blendEquationSeparate(rgb, a)
    }),
    'blend.func': createStack([
      GL_ONE, GL_ZERO, GL_ONE, GL_ZERO
    ], function (srcRGB, dstRGB, srcAlpha, dstAlpha) {
      gl.blendFuncSeparate(srcRGB, dstRGB, srcAlpha, dstAlpha)
    }),

    // Depth
    'depth.func': createStack([GL_LESS], function (func) {
      gl.depthFunc(func)
    }),
    'depth.range': createStack([0, 1], function (near, far) {
      gl.depthRange(near, far)
    }),
    'depth.mask': createStack([true], function (m) {
      gl.depthMask(m)
    }),

    // Face culling
    'cull.face': createStack([GL_BACK], function (mode) {
      gl.cullFace(mode)
    }),

    // Front face orientation
    'frontFace': createStack([GL_CCW], function (mode) {
      gl.frontFace(mode)
    }),

    // Write masks
    'colorMask': createStack([true, true, true, true], function (r, g, b, a) {
      gl.colorMask(r, g, b, a)
    }),

    // Line width
    'lineWidth': createStack([1], function (w) {
      gl.lineWidth(w)
    }),

    // Polygon offset
    'polygonOffset.offset': createStack([0, 0], function (factor, units) {
      gl.polygonOffset(factor, units)
    }),

    // Sample coverage
    'sampleCoverageParams': createStack([1, false], function (value, invert) {
      gl.sampleCoverage(value, invert)
    }),

    // Stencil
    'stencil.func': createStack([
      GL_ALWAYS, 0, -1,
      GL_ALWAYS, 0, -1
    ], function (frontFunc, frontRef, frontMask,
                 backFunc, backRef, backMask) {
      gl.stencilFuncSeparate(GL_FRONT, frontFunc, frontRef, frontMask)
      gl.stencilFuncSeparate(GL_BACK, backFunc, backRef, backMask)
    }),
    'stencil.op': createStack([
      GL_KEEP, GL_KEEP, GL_KEEP,
      GL_KEEP, GL_KEEP, GL_KEEP
    ], function (frontFail, frontDPFail, frontPass,
                 backFail, backDPFail, backPass) {
      gl.stencilOpSeparate(GL_FRONT, frontFail, frontDPFail, frontPass)
      gl.stencilOpSeparate(GL_BACK, backFail, backDPFail, backPass)
    }),
    'stencil.mask': createStack([-1, -1], function (front, back) {
      gl.stencilMask(GL_FRONT, front)
      gl.stencilMask(GL_BACK, back)
    }),

    // Scissor
    'scissor.shape': createStack([0, 0, -1, -1], function (x, y, w, h) {
      gl.scissor(
        x, y,
        w < 0 ? gl.drawingBufferWidth : w,
        h < 0 ? gl.drawingBufferHeight : h)
    }),

    // Viewport
    'viewport': createStack([0, 0, -1, -1], function (x, y, w, h) {
      var w_ = w
      if (w < 0) {
        w_ = gl.drawingBufferWidth
      }
      var h_ = h
      if (h < 0) {
        h_ = gl.drawingBufferHeight
      }
      gl.viewport(x, y, w_, h_)
      viewportState.width = w_
      viewportState.height = h_
    })
  }

  var contextProps = Object.keys(contextState)

  return {
    contextState: contextState,
    viewport: viewportState,

    poll: function () {
      contextProps.forEach(function (state) {
        contextState[state].poll()
      })
    },

    refresh: function () {
      contextProps.forEach(function (state) {
        contextState[state].setDirty()
      })
    },

    notifyViewportChanged: function () {
      contextState.viewport.setDirty()
      contextState.scissor.setDirty()
    }
  }
}
