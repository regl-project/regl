var tape = require('tape')
var toAccessorString = require('../lib/dynamic').accessor

tape('accessor string conversion', function (t) {
  t.equals(
    toAccessorString('a[1].x["3235m"].y[""]'),
    '["a"]["1"]["x"]["3235m"]["y"][""]')

  t.end()
})
