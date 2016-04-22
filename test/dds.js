var tape = require('tape')
var fs = require('fs')
var path = require('path')
var parseDDS = require('../lib/parse-dds')

tape('parse dds', function (t) {
  var data = fs.readFileSync(path.join(__dirname, '../example/assets/alpine_cliff_a.dds'))

  console.log(parseDDS((new Uint8Array(data)).buffer))

  t.end()
})
