var extend = require('../lib/util/extend')
var createContext = require('./util/create-context')
var createREGL = require('../regl')
var tape = require('tape')

var depthFuncs = {
  'never': 512,
  'less': 513,
  '<': 513,
  'equal': 514,
  '=': 514,
  '==': 514,
  '===': 514,
  'lequal': 515,
  '<=': 515,
  'greater': 516,
  '>': 516,
  'notequal': 517,
  '!=': 517,
  '!==': 517,
  'gequal': 518,
  '>=': 518,
  'always': 519
}

tape('depth', function (t) {
  var gl = createContext(5, 5)
  var regl = createREGL(gl)

  // TODO: test depth range

  var desc = {
    frag: [
      'precision mediump float;',
      'uniform vec4 color;',
      'void main() {',
      '  gl_FragColor = color;',
      '}'
    ].join('\n'),

    vert: [
      'precision highp float;',
      'attribute float t;',
      'uniform vec2 offset, slope;',
      'uniform float depth;',
      'void main() {',
      '  gl_Position = vec4(t * slope + offset, depth, 1);',
      '}'
    ].join('\n'),

    attributes: {
      t: regl.buffer([-10, 10])
    },

    uniforms: {
      color: regl.prop('color'),
      offset: regl.prop('offset'),
      slope: regl.prop('slope'),
      depth: regl.prop('depth')
    },

    depth: {
      enable: regl.prop('flags.enable'),
      mask: regl.prop('flags.mask'),
      func: regl.prop('flags.func')
    },

    count: 2,
    lineWidth: 1,
    primitive: 'lines'
  }

  var drawDynamic = regl(desc)

  // Test clear depth
  for (var cdepth = 0.0; cdepth <= 1.0; cdepth += 0.25) {
    regl.clear({
      depth: cdepth
    })
    t.equals(gl.getParameter(gl.DEPTH_CLEAR_VALUE), cdepth, 'clear depth')
  }

  function testFlags (cdepth, flags, prefix) {
    t.equals(gl.getParameter(gl.DEPTH_FUNC), depthFuncs[flags.func], prefix + ' depth func')
    t.equals(gl.getParameter(gl.DEPTH_TEST), flags.enable, prefix + ' depth test')
    t.equals(gl.getParameter(gl.DEPTH_WRITEMASK), flags.mask, prefix + ' depth mask')
  }

  function testPixels (cdepth, depths, flags, prefix) {
    var pixels = regl.read()

    function depthTest (x, y) {
      switch (depthFuncs[flags.func]) {
        case gl.NEVER:
          return false
        case gl.LESS:
          return x < y
        case gl.LEQUAL:
          return x <= y
        case gl.EQUAL:
          return x === y
        case gl.GEQUAL:
          return x >= y
        case gl.GREATER:
          return x > y
        case gl.NOTEQUAL:
          return x !== y
        case gl.ALWAYS:
          return true
        default:
          t.fail('invalid depth func: ' + flags.func)
      }
    }

    var color
    var i
    var j
    var broken = []
    function expect (c) {
      if (c !== color) {
        broken.push('bad color ' + color + ', expected ' + c + ' @ pixel ' + [i, j])
      }
    }

    for (i = 0; i < 5; ++i) {
      for (j = 0; j < 5; ++j) {
        var ptr = 4 * (5 * i + j)

        var r = pixels[ptr]
        var g = pixels[ptr + 1]
        var b = pixels[ptr + 2]
        var a = pixels[ptr + 3]
        color = '?'

        if (r === 255 && g === 0 && b === 0 && a === 255) {
          color = 'red'
        } else if (r === 0 && g === 255 && b === 0 && a === 255) {
          color = 'green'
        } else if (r === 0 && g === 0 && b === 0 && a === 255) {
          color = 'black'
        }

        var di = depths[0]
        var dj = depths[1]

        if (i === 2 && j === 2) {
          if (!flags.enable) {
            expect('green')
          } else if (!flags.mask) {
            if (depthTest(dj, cdepth)) {
              expect('green')
            } else if (depthTest(di, cdepth)) {
              expect('red')
            } else {
              expect('black')
            }
          } else {
            if (depthTest(di, cdepth)) {
              if (depthTest(dj, di)) {
                expect('green')
              } else {
                expect('red')
              }
            } else if (depthTest(dj, cdepth)) {
              expect('green')
            } else {
              expect('black')
            }
          }
        } else if (i === 2) {
          if (!flags.enable || depthTest(di, cdepth)) {
            expect('red')
          } else {
            expect('black')
          }
        } else if (j === 2) {
          if (!flags.enable || depthTest(dj, cdepth)) {
            expect('green')
          } else {
            expect('black')
          }
        } else {
          expect('black')
        }
      }
    }
    t.equals(broken.join('; '), '', prefix + ' pixels')
  }

  function testDynamic (cdepth, batch, depths, flags) {
    regl.clear({
      color: [0, 0, 0, 1],
      depth: cdepth
    })
    if (batch) {
      drawDynamic([{
        color: [1, 0, 0, 1],
        offset: [0, 0],
        slope: [1, 0],
        depth: depths[0],
        flags: flags
      }, {
        color: [0, 1, 0, 1],
        offset: [0, 0],
        slope: [0, 1],
        depth: depths[1],
        flags: flags
      }])
    } else {
      drawDynamic({
        color: [1, 0, 0, 1],
        offset: [0, 0],
        slope: [1, 0],
        depth: depths[0],
        flags: flags
      })
      drawDynamic({
        color: [0, 1, 0, 1],
        offset: [0, 0],
        slope: [0, 1],
        depth: depths[1],
        flags: flags
      })
    }
    var prefix = (batch ? 'batch' : 'dynamic') + ' ' + JSON.stringify(flags) + ' d:' + depths + ', cd: ' + cdepth
    testFlags(cdepth, flags, prefix)
    testPixels(cdepth, depths, flags, prefix)
  }

  function testStatic (cdepth, depths, flags) {
    var drawStatic = regl(extend(extend({}, desc), {depth: flags}))
    regl.clear({
      color: [0, 0, 0, 1],
      depth: cdepth
    })
    drawStatic([{
      color: [1, 0, 0, 1],
      offset: [0, 0],
      slope: [1, 0],
      depth: depths[0]
    }, {
      color: [0, 1, 0, 1],
      offset: [0, 0],
      slope: [0, 1],
      depth: depths[1]
    }])
    var prefix = 'static ' + JSON.stringify(flags) + ' d:' + depths + ', cd: ' + cdepth
    testFlags(cdepth, flags, prefix)
    testPixels(cdepth, depths, flags, prefix)
  }

  var cases = []
  var funcs = ['always', 'never', '<', '<=', '=', '>', '>=', '!=']
  funcs.forEach(function (func) {
    for (var mask = 0; mask <= 1; ++mask) {
      for (var test = 0; test <= 1; ++test) {
        var flags = {
          mask: !!mask,
          enable: !!test,
          func: func
        }
        for (var clearDepth = 1; clearDepth <= 1; clearDepth += 1.0) {
          for (var depth0 = 0.25; depth0 <= 1; depth0 += 0.5) {
            for (var depth1 = 0.25; depth1 <= depth0; depth1 += 0.5) {
              cases.push([+clearDepth, [+depth0, +depth1], flags])
            }
          }
        }
      }
    }
  })

  var poll = setInterval(function () {
    if (cases.length === 0) {
      clearInterval(poll)
      regl.destroy()
      t.equals(gl.getError(), 0, 'error ok')
      createContext.destroy(gl)
      t.end()
    } else {
      var top = cases.pop()

      testStatic(top[0], top[1], top[2])
      testDynamic(top[0], false, top[1], top[2])
      testDynamic(top[0], true, top[1], top[2])
    }
  }, 1)
})
