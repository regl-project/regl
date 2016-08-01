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

  function checkColor (name, fbo, color, x, y) {
    setFBO({fbo: fbo}, function (context) {
      var pixels = regl.read({ x: x, y: y, width: 1, height: 1 })
      t.same(
        Array.prototype.slice.call(pixels),
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
        props.check(context, props)
      }
      return 3
    },
    depth: {enable: false}
  }

  function expandCases (input, propName, propValue) {
    var obj = input.obj
    var cases = {}

    obj[propName] = propValue

    Object.keys(input.cases).forEach(function (name) {
      var parent = input.cases[name]
      var ext

      if (propValue === 'skip') {
        cases[propName + '-skip'] = parent
        return
      }

      ext = {}
      ext[propName] = propValue
      cases[propName + '-const ' + name] = extend(ext, parent)

      ext = {}
      ext[propName] = regl.prop(propName)
      cases[propName + '-prop ' + name] = extend(ext, parent)

      if (propName === 'frag') {
        return
      }

      var context = {}
      context[propName] = propValue
      ext = {context: extend(context, parent.context || {})}
      ext[propName] = regl.context(propName)
      cases[propName + '-context-const ' + name] = extend(extend({}, parent), ext)

      context = {}
      context[propName] = regl.prop(propName)
      ext = {context: extend(context, parent.context || {})}
      ext[propName] = regl.context(propName)
      cases[propName + '-context-prop ' + name] = extend(extend({}, parent), ext)

      ext = {}
      ext[propName] = regl.this(propName)
      cases[propName + '-this ' + name] = extend(ext, parent)
    })

    return {
      obj: obj,
      cases: cases
    }
  }

  function generateCommands (framebuffer, viewport) {
    return expandCases(expandCases(expandCases(
      {
        cases: {
          '': extend({
            vert: vert
          }, baseCommand)
        },
        obj: {}
      },
      'framebuffer',
      framebuffer),
      'viewport',
      viewport),
      'frag',
      frag)
  }

  function generateDrawModes (props_) {
    var desc = generateCommands(props_.framebuffer, props_.viewport)
    var commands = desc.cases

    var props = extend({
      check: checkContext
    }, desc.obj)

    var cases = {}
    Object.keys(commands).forEach(function (name) {
      var cmd = regl(commands[name]).bind(props)
      cases['draw ' + name] = function (input) {
        cmd.call(props, extend(input, props))
      }
      cases['batch ' + name] = function (input) {
        cmd.call(props, [extend(input, props)])
      }
      cases['scope-draw ' + name] = function (input) {
        cmd.call(props, extend(input, props), function (context, props) {
          checkContext(context, props)
          regl.draw()
        })
      }
    })

    return cases
  }

  // properties to check:
  //
  //  size:
  //    framebufferWidth
  //    viewportWidth
  //
  function checkContext (context, props) {
    var name = props.name

    var fbo = props.framebuffer
    var viewport = props.viewport

    var w = fbo ? fbo.width : gl.drawingBufferWidth
    var h = fbo ? fbo.height : gl.drawingBufferHeight

    t.same(
      context.viewportWidth,
      viewport.width || (w - (viewport.x | 0)),
      name + 'viewport width')
    t.same(
      context.viewportHeight,
      viewport.height || (h - (viewport.y | 0)),
      name + 'viewport height')

    t.same(context.framebufferWidth, w, name + 'framebuffer width')
    t.same(context.framebufferHeight, h, name + 'framebuffer height')

    t.same(
      context.drawingBufferWidth,
      gl.drawingBufferWidth,
      name + 'drawing buffer width')
    t.same(
      context.drawingBufferHeight,
      gl.drawingBufferHeight,
      name + 'drawing buffer height')
  }

  // test batch mode with multiple renders
  var fboSet = [
    regl.framebuffer(3),
    null,
    regl.framebuffer(5, 6),
    regl.framebuffer(4)
  ]

  var cmd = regl(extend({
    vert: vert,
    frag: frag,
    framebuffer: regl.prop('framebuffer')
  }, baseCommand))

  cmd([
    {
      framebuffer: fboSet[0],
      color: [1, 0, 0, 1]
    },
    {
      framebuffer: fboSet[1],
      color: [0, 1, 0, 1]
    },
    {
      framebuffer: fboSet[2],
      color: [0, 0, 1, 1]
    },
    {
      framebuffer: fboSet[3],
      color: [0, 0, 0, 1]
    }
  ])

  checkColor('batch[0]', fboSet[0], [255, 0, 0, 255], 0, 0)
  checkColor('batch[1]', fboSet[1], [0, 255, 0, 255], 0, 0)
  checkColor('batch[2]', fboSet[2], [0, 0, 255, 255], 0, 0)
  checkColor('batch[3]', fboSet[3], [0, 0, 0, 255], 0, 0)

  var framebufferArgs = {
    'drawingBuffer': null,
    'framebuffer': regl.framebuffer(3)
  }

  var viewportArgs = {
    'skip': 'skip',
    'empty': {},
    'width/height': {
      width: 2,
      height: 3
    },
    'offset': {
      x: 1,
      y: 1
    }
  }

  var pending = []

  Object.keys(framebufferArgs).forEach(function (fboName) {
    var fbo = framebufferArgs[fboName]
    Object.keys(viewportArgs).forEach(function (viewportName) {
      var viewport = viewportArgs[viewportName]
      pending.push([fbo, fboName, viewport, viewportName])
    })
  })

  var colors = [
    [255, 0, 0, 255],
    [0, 0, 255, 255]
  ]

  function drain () {
    var testCase = pending.pop()
    if (!testCase) {
      regl.destroy()
      createContext.destroy(gl)
      t.end()
      return
    }

    var fbo = testCase[0]
    var fboName = testCase[1]
    var viewport = testCase[2]
    var viewportName = testCase[3]

    var tests = generateDrawModes({
      framebuffer: fbo,
      viewport: viewport
    })

    Object.keys(tests).forEach(function (name) {
      var cmd = tests[name]
      var testName = fboName + ',' + viewportName + ':' + name
      colors.forEach(function (color) {
        setFBO({fbo: fbo}, function () {
          regl.clear({
            color: [0, 0, 0, 0]
          })
        })
        cmd({
          name: testName,
          color: color
        })
        if (fbo) {
          regl.clear({
            color: [0, 0, 0, 0]
          })
        }
        checkColor(testName, fbo, color, 1, 1)
      })
    })

    setTimeout(drain, 1)
  }

  setTimeout(drain, 1)
})
