var tape = require('tape')
var fs = require('fs')
var path = require('path')
var parseDDS = require('../lib/util/parse-dds')

tape('parse dds', function (t) {
  // TODO check dds parsing in more detail, for now just run it and make
  // sure we don't crash

  var data = fs.readFileSync(path.join(__dirname, '../example/assets/alpine_cliff_a.dds'))
  parseDDS((new Uint8Array(data)).buffer)

  t.end()
})
