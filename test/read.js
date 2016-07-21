var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('read pixels', function (t) {
  var gl = createContext(5, 5)
  var regl = createREGL(gl)

  function throws (name, args) {
    t.throws(function () {
      regl.read.apply(regl, args)
    }, /\(regl\)/, name)
  }

  // check fbo validation

  // typedarray input
  var bytes = new Uint8Array(100)
  var result = regl.read(bytes)
  t.equals(result, bytes, 'read typedarray ok')

  // width/height input
  t.equals(regl.read({width: 2, height: 2}).length, 16, 'width/height ok')

  // options input
  t.equals(regl.read({x: 3, y: 3}).length, 16, 'offset ok')

  // read out of bounds
  throws('bad width', [{width: -2}])
  throws('bad height', [{height: -2}])
  throws('bad offset', [{ x: -2 }])
  throws('bad typedarray', [{data: []}])
  throws('small typedarray', [new Uint8Array(1)])

  regl.destroy()
  createContext.destroy(gl)
  t.end()
})
