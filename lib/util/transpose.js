module.exports = function (
  result, data, shapeX, shapeY, strideX, strideY, offset) {
  var ptr = 0
  for (var i = 0; i < shapeX; ++i) {
    for (var j = 0; j < shapeY; ++j) {
      result[ptr++] = data[strideX * i + strideY * j + offset]
    }
  }
}
