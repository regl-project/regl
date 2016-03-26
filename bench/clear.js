module.exports = function (regl) {
  return function () {
    regl.clear({
      color: [Math.random(), Math.random(), Math.random(), 1],
      depth: 1,
      stencil: 0
    })
  }
}
