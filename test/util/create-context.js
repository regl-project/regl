if (typeof document !== 'undefined') {
  var canvas = document.createElement('canvas')
  var context = canvas.getContext('webgl', {
    antialias: false,
    stencil: true,
    preserveDrawingBuffer: true
  })
  canvas.style.position = 'fixed'
  canvas.style.top = '0'
  canvas.style.right = '0'
  canvas.style.width = '256px'
  canvas.style.height = '256px'
  document.body.appendChild(canvas)

  module.exports = function (width, height) {
    canvas.width = width
    canvas.height = height
    return context
  }

  module.exports.resize = function (gl, w, h) {
    canvas.width = w
    canvas.height = h
  }

  module.exports.destroy = function (gl) { }
} else {
  var CONTEXT = require('gl')(1, 1, {preserveDrawingBuffer: true})
  var RESIZE = CONTEXT.getExtension('STACKGL_resize_drawingbuffer')

  module.exports = function (w, h) {
    RESIZE.resize(w, h)
    return CONTEXT
  }

  module.exports.resize = function (gl, w, h) {
    RESIZE.resize(w, h)
  }

  module.exports.destroy = function (gl) {
  }
}
