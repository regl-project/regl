var tape = require('tape')
var convertToHalfFloat = require('../lib/util/to-half-float')

tape('convertToHalfFloat', function (t) {
  var input = [
    1,
    1.0009765625,
    -2,
    65504,
    Math.pow(2, -14),
    Math.pow(2, -14) - Math.pow(2, -24),
    Math.pow(2, -24),
    0,
    -0,
    Infinity,
    1e7,
    -Infinity,
    -1e7,
    1e-8,
    -1e-8,
    1.0 / 3.0,
    NaN
  ]

  var expected = new Uint16Array([
    '0 01111 0000000000',
    '0 01111 0000000001',
    '1 10000 0000000000',
    '0 11110 1111111111',
    '0 00001 0000000000',
    '0 00000 1111111111',
    '0 00000 0000000001',
    '0 00000 0000000000',
    '1 00000 0000000000',
    '0 11111 0000000000',
    '0 11111 0000000000',
    '1 11111 0000000000',
    '1 11111 0000000000',
    '0 00000 0000000000',
    '1 00000 0000000000',
    '0 01101 0101010101',
    '1 11111 1111111111'
  ].map(function (str) {
    return parseInt(str.replace(/\s/g, ''), 2)
  }))

  var actual = convertToHalfFloat(input)

  for (var i = 0; i < expected.length; ++i) {
    t.equals(actual[i], expected[i], 'half float: ' + input[i])
  }

  t.end()
})
