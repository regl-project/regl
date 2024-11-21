module.exports = function (base, opts) {
  var keys = Object.keys(opts)
  for (var i = 0; i < keys.length; ++i) {
    var k = keys[i]
    base[k] = opts[k]
  }
  return base
}
