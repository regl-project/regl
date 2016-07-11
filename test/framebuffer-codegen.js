var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var extend = require('../lib/util/extend')
var tape = require('tape')

tape('framebuffer-codegen', function (t) {
  var gl = createContext(5, 5)
  var regl = createREGL(gl)

  var setFBO = regl({
    framebuffer: regl.prop('fbo')
  })

  function checkColor(name, fbo, color) {
    setFBO({fbo: fbo}, function () {
      var pixels = regl.read()
      t.same(
        [ pixels[0], pixels[1], pixels[2], pixels[3] ],
        color,
        name + ' color')
    })
  }

  var vert = [
    'precision highp float;',
    'attribute vec2 position;',
    'void main() {',
    '  gl_Position = vec4(position, 0, 1);',
    '}'
  ].join('\n')

  var frag = [
    'precision highp float;',
    'uniform vec4 color;',
    'void main() {',
    '  gl_FragColor = color;',
    '}'
  ].join('\n')

  var baseCommand = {
    attributes: {
      position: [
        -4, 0,
        4, -4,
        4, 4
      ]
    },
    uniforms: {
      color: regl.prop('color')
    },
    primitive: 'triangles',
    count: function (context, props) {
      if (props.check) {
        props.check(context)
      }
      return 3
    },
    depth: {enable: false}
  }

  // usage modes:
  //
  //  static
  //  dynamic
  //
  var commands = {
    'constant': function (vert, frag, fbo) {
      return regl(extend({
        framebuffer: fbo,
        vert: vert,
        frag: frag
      }, baseCommand))
    },
    'dynamic': function (vert, frag, fbo) {
      return regl(extend({
        framebuffer: regl.prop('fbo'),
        vert: vert,
        frag: frag
      }, baseCommand))
    },
    'context': function (vert, frag, fbo) {
      return regl(extend({
        context: {
          fbo: fbo
        },
        framebuffer: regl.context('fbo'),
        vert: vert,
        frag: frag
      }, baseCommand))
    },
    'this': function (vert, frag, fbo) {
      return regl(extend({
        framebuffer: regl.this('fbo'),
        vert: vert,
        frag: frag
      }, baseCommand)).bind({ fbo: fbo })
    }
  }

  // properties to check:
  //
  //  size:
  //    framebufferWidth
  //    viewportWidth
  //
  function checkContext (context) {
    var expected = this
    var name = expected.name
    t.same(context.viewportWidth, expected.width, name + 'viewport width')
    t.same(context.viewportHeight, expected.height, name + 'viewport height')
    t.same(context.framebufferWidth, expected.width, name + 'framebuffer width')
    t.same(context.framebufferHeight, expected.height, name + 'framebuffer height')
    t.same(context.drawingBufferWidth, 5, name + 'drawing buffer width')
    t.same(context.drawingBufferHeight, 5, name + 'drawing buffer height')
  }

  // draw modes:
  //
  //  draw
  //  batch
  //  scope
  //  draw - dynamic shader
  //  batch - dynamic shader
  //
  var drawModes = {
    'draw': function (cmd, props, expected) {
      return (cmd(vert, frag, props.fbo))(extend({
        check: checkContext.bind(expected)
      }, props))
    },
    'batch': function (cmd, props, expected) {
      return (cmd(vert, frag, props.fbo))([extend({
        check: checkContext.bind(expected)
      }, props)])
    },
    'scope - draw': function (cmd, props, expected) {
      return (cmd(vert, frag, props.fbo))(extend({
        check: function () {}
      }, props), function (context) {
        checkContext.call(expected, context)
        regl.draw()
      })
    },
    'scope - batch': function (cmd, props, expected) {
      return (cmd(vert, frag, props.fbo))(extend({
        check: function () {}
      }, props), function (context) {
        checkContext.call(expected, context)
        regl.draw(1)
      })
    },
    'draw - dynamic shader': function (cmd, props, expected) {
      return (cmd(regl.prop('vert'), regl.prop('frag'), props.fbo))(extend({
        check: checkContext.bind(expected),
        vert: vert,
        frag: frag
      }, props))
    },
    'batch - dynamic shader': function (cmd, props, expected) {
      return (cmd(regl.prop('vert'), regl.prop('frag'), props.fbo))([extend({
        check: checkContext.bind(expected),
        vert: vert,
        frag: frag
      }, props)])
    }
  }

  var colors = [
    [255, 0, 0, 255],
    [0, 0, 255, 255],
    [0, 255, 0, 255]
  ]

  var framebufferArgs = {
    'drawing buffer': null,
    'framebuffer': regl.framebuffer(3)
  }

  Object.keys(commands).forEach(function (cmdName) {
    var createCommand = commands[cmdName]
    Object.keys(drawModes).forEach(function (mode) {
      var drawCommand = drawModes[mode]
      Object.keys(framebufferArgs).forEach(function (name) {
        var fbo = framebufferArgs[name]
        var testName = name + ' (' + mode + ',' + cmdName + '):'
        colors.forEach(function (color) {
          regl.clear({
            color: [0, 0, 0, 0]
          })
          drawCommand(createCommand, {
            fbo: fbo,
            color: color
          }, {
            name: testName,
            width: fbo ? fbo.width : 5,
            height: fbo ? fbo.height : 5
          })
          if (fbo) {
            regl.clear({
              color: [0, 0, 0, 0]
            })
          }
          checkColor(testName, fbo, color)
        })
      })
    })
  })

  // test batch mode with multiple renders
  var fboSet = [
    null,
    regl.framebuffer(3),
    regl.framebuffer(5, 6),
    regl.framebuffer(4)
  ]

  var cmd = regl(extend({
    vert: vert,
    frag: frag,
    framebuffer: regl.prop('fbo')
  }, baseCommand))

  cmd([
    {
      fbo: fboSet[0],
      color: [1, 0, 0, 1]
    },
    {
      fbo: fboSet[1],
      color: [0, 1, 0, 1]
    },
    {
      fbo: fboSet[2],
      color: [0, 0, 1, 1]
    },
    {
      fbo: fboSet[3],
      color: [0, 0, 0, 1]
    }
  ])

  checkColor('batch[0]', fboSet[0], [255, 0, 0, 255])
  checkColor('batch[1]', fboSet[1], [0, 255, 0, 255])
  checkColor('batch[2]', fboSet[2], [0, 0, 255, 255])
  checkColor('batch[3]', fboSet[3], [0, 0, 0, 255])

  regl.destroy()
  createContext.destroy(gl)
  t.end()
})
