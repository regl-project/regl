var glslify = require('glslify')

module.exports = function pointCloud (regl, camera, points) {
  var pointData = regl.func(function (x, y, z) {
    if (!x || !y || !z) {
      // Returning undefined skips update
      return
    }

    var positions = new Float32Array(x.length * 3)
    for (var i = 0; i < 3; ++i) {
      positions[3 * i] = x[i]
      positions[3 * i + 1] = y[i]
      positions[3 * i + 2] = z[i]
    }

    return {
      count: positions.length,
      data: positions
    }
  })(points('x'), points('y'), points('z'))

  var pointBuffer = regl.buffer(pointData('data'))

  return regl.draw({
    frag: glslify('scatter-frag.glsl'),
    vert: glslify('scatter-vert.glsl'),
    attributes: {
      positions: pointBuffer()
    },
    uniforms: {
      model: camera('model'),
      view: camera('view'),
      projection: camera('projection')
    },
    primitive: 'points',
    count: pointData('count')
  })
}
