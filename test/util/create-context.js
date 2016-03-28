if (typeof document !== 'undefined') {
  var canvas = document.createElement('canvas')
  var context = canvas.getContext('webgl')
  canvas.style.position = 'absolute'
  canvas.style.top = '0'
  canvas.style.right = '0'
  document.body.appendChild(canvas)

  module.exports = function (width, height) {
    canvas.width = width
    canvas.height = height
    return context
  }
} else {
  module.exports = require('gl')
}
