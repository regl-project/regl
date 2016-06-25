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
  module.exports = require('gl')

  module.exports.resize = function (gl, w, h) {
    gl.getExtension('STACKGL_resize_drawingbuffer').resize(w, h)
  }

  module.exports.destroy = function (gl) {
    gl.getExtension('STACKGL_destroy_context').destroy()
  }
}
