if (typeof document !== 'undefined') {
  var canvas = document.createElement('canvas')
  var context = canvas.getContext('webgl')
  module.exports = function (width, height) {
    canvas.width = width
    canvas.height = height
    return context
  }
} else {
  module.exports = require('gl')
}
