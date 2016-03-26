module.exports = function (regl) {
  var buffer = regl.buffer()
  return function () {
    buffer(new Float32Array([1, 2, 3, 4]))
  }
}
