var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('context', function (t) {
  var regl = createREGL(createContext(16, 16))

  var simpleScope = regl({
    context: {
      a: function (props, context) {
        return 1
      },
      b: regl.this('bbb'),
      c: regl.context('viewportWidth'),
      d: regl.prop('ddd'),
      e: 'eee'
    }
  })

  simpleScope.call({
    bbb: 3
  }, {
    ddd: 7
  }, function (props, context) {
    t.equals(context.a, 1)
    t.equals(context.b, 3)
    t.equals(context.c, 16)
    t.equals(context.d, 7)
    t.equals(context.e, 'eee')
  })

  regl.destroy()
  t.end()
})
