var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('context', function (t) {
  var gl = createContext(16, 16)
  var regl = createREGL(gl)

  var simpleScope = regl({
    context: {
      a: function (context, props) {
        t.equals(context.a, undefined)
        t.equals(context.b, undefined)
        t.equals(context.c, undefined)
        t.equals(context.d, undefined)
        t.equals(context.e, undefined)
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
  }, function (context, props) {
    t.equals(context.a, 1)
    t.equals(context.b, 3)
    t.equals(context.c, 16)
    t.equals(context.d, 7)
    t.equals(context.e, 'eee')

    regl({
      context: {
        b: 5,
        c: 7,
        d: regl.context('b')
      }
    }).call({}, {}, function () {
      t.equals(context.a, 1)
      t.equals(context.b, 5)
      t.equals(context.c, 7)
      t.equals(context.d, 3)
      t.equals(context.e, 'eee')
    })

    t.equals(context.a, 1)
    t.equals(context.b, 3)
    t.equals(context.c, 16)
    t.equals(context.d, 7)
    t.equals(context.e, 'eee')
  })

  regl.destroy()
  t.equals(gl.getError(), 0, 'error ok')
  createContext.destroy(gl)
  t.end()
})
