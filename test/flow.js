var tape = require('tape')
var flow = require('../lib/flow')
var sortNodes = require('../lib/sort')

tape('simple-flow-network', function (t) {
  var Aclass = flow.createClass({
    change: function (x) {
      return 'a:' + x
    }
  })

  var Bclass = flow.createClass({
    change: function (x, y) {
      return x + '-b-' + y
    }
  })

  var A1 = Aclass('foo')
  var A2 = Aclass('bar')
  var B = Bclass(A1, A2)

  console.log(sortNodes([A1.node], B.node))

  t.end()
})
