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

  t.throws(function () {
    regl.on('blaaaaaa', function () {})
  }, /\(regl\)/, 'listener throws with event')

  t.throws(function () {
    regl.on('frame', 12356)
  }, /\(regl\)/, 'listener throws with bad callback')

  var lossCount = 0
  var restoreCount = 0

  regl.on('lost', function () {
    lossCount += 1
  })

  regl.on('restore', function () {
    restoreCount += 1
  })

  function verify (cmd, desc, next) {
    var expected, actual
    var prevLoss = lossCount
    var prevRestore = restoreCount
    var tasks = [
      function () {
        regl.clear({
          color: [0, 0, 0, 0],
          depth: 1,
          stencil: 0
        })
        cmd()
        expected = regl.read()
        extLoseContext.loseContext()
        t.equals(lossCount, prevLoss, 'loss count ok')
        t.equals(restoreCount, prevRestore, 'restore count ok')
      },
      function () {
        t.throws(function () {
          cmd()
        }, /\(regl\)/, 'context lost')
        extLoseContext.restoreContext()
        t.equals(lossCount, prevLoss + 1, 'loss count ok')
        t.equals(restoreCount, prevRestore, 'restore count ok')
      },
      function () {
        regl.clear({
          color: [0, 0, 0, 0],
          depth: 1,
          stencil: 0
        })
        cmd()
        actual = regl.read()
        t.equals(lossCount, prevLoss + 1, 'loss count ok')
        t.equals(restoreCount, prevRestore + 1, 'restore count ok')
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

    depth: { enable: false },

    count: 3
  })

  var elementCommand = regl({
    vert: [
      'precision highp float;',
      'attribute vec2 position;',
      'void main () {',
      '  gl_Position = vec4(position, 0, 1);',
      '}'
    ].join('\n'),

    frag: [
      'precision highp float;',
      'void main () {',
      '  gl_FragColor = vec4(1, 1, 1, 1);',
      '}'
    ].join('\n'),

    attributes: {
      position: [
        0, 0,
        1, 0,
        -1, 0.5,
        1, -1
      ]
    },

    elements: [
      [2, 1],
      [1, 3],
      [0, 2]
    ],

    depth: { enable: false }
  })

  var tex = regl.texture(512, 512)

  var textureCommand = regl({
    vert: [
      'precision highp float;',
      'attribute vec2 position;',
      'void main () {',
      '  gl_Position = vec4(position, 0, 1);',
      '}'
    ].join('\n'),

    frag: [
      'precision highp float;',
      'uniform sampler2D tex;',
      'void main () {',
      '  gl_FragColor = texture2D(tex, vec2(0, 0)) + vec4(1, 0, 0, 1);',
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
      color: regl.prop('color'),
      tex: regl.prop('tex')
    },

    depth: { enable: false },

    count: 3
  })

  // test framebuffer objects
  var framebuffer = regl.framebuffer({
    shape: [5, 4]
  })

  var setFBO = regl({
    framebuffer: framebuffer
  })

  var testCases = {
    'simple command': function () {
      simpleCommand({
        color: [1, 0, 1, 1]
      })
    },
    'elements test': function () {
      elementCommand()
    },
    'texture test': function () {
      textureCommand({
        tex: tex
      })
    },
    'framebuffer test': function () {
      setFBO(function () {
        regl.clear({
          color: [1, 0, 1, 1]
        })
      })
      textureCommand({
        tex: framebuffer
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
