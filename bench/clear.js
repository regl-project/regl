module.exports = function (regl) {
  return function () {
    regl.clear({
      color: [1, 0, 1, 0],
      depth: 1,
      stencil: 0
    })
  }
}
