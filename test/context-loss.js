var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('context loss', function (t) {
  var gl = createContext(16, 16)
  var extLoseContext = gl.getExtension('WEBGL_lose_context')

  if (extLoseContext) {
    testContextLoss(t, gl, extLoseContext, function () {
      createContext.destroy(gl)
      t.end()
    })
  } else {
    t.pass('WEBGL_lose_context not supported')
    createContext.destroy(gl)
    t.end()
  }
})

function testContextLoss (t, gl, extLoseContext, onDone) {
  var regl = createREGL(gl)

  function verify (cmd, desc, next) {
    var expected, actual
    var tasks = [
      function () {
        cmd()
        expected = regl.read()
        extLoseContext.loseContext()
      },
      function () {
        t.throws(function () {
          cmd()
        }, /\(regl\)/, 'context lost')
        extLoseContext.restoreContext()
      },
      function () {
        cmd()
        actual = regl.read()
        t.same(actual, expected, desc)
      },
      next
    ]

    function poll () {
      if (tasks.length === 0) {
        return
      }
      var task = tasks.shift()
      task()
      setTimeout(poll, 200)
    }

    poll()
  }

  var simpleCommand = regl({
    vert: [
      'precision highp float;',
      'attribute vec2 position;',
      'void main () {',
      '  gl_Position = vec4(position, 0, 1);',
      '}'
    ].join('\n'),

    frag: [
      'precision highp float;',
      'uniform vec4 color;',
      'void main () {',
      '  gl_FragColor = color;',
      '}'
    ].join('\n'),

    attributes: {
      position: [
        -4, 0,
        4, 4,
        4, -4
      ]
    },

    uniforms: {
      color: regl.prop('color')
    },

    count: 3
  })

  var testCases = {
    'simple command': function () {
      simpleCommand({
        color: [1, 0, 1, 1]
      })
    }
  }

  var tests = Object.keys(testCases).map(function (name) {
    return function () {
      verify(testCases[name], name, pollTests)
    }
  })

  function pollTests () {
    if (tests.length === 0) {
      regl.destroy()
      onDone()
      return
    }
    var test = tests.shift()
    test()
  }

  pollTests()
}
