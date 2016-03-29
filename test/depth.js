var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

var depthFuncs = require('../lib/constants/comparefuncs.json')

tape('depth', function (t) {
  var gl = createContext(16, 16)
  var regl = createREGL(gl)

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

    depthTest: regl.prop('flags.depthTest'),
    depthMask: regl.prop('flags.depthMask'),
    depthFunc: regl.prop('flags.depthFunc'),

    count: 2,
    lineWidth: 1,
    primitive: 'lines'
  }

  var drawDynamic = regl(desc)

  function testFlags (cdepth, flags, prefix) {
    t.equals(gl.getParameter(gl.DEPTH_CLEAR_VALUE), cdepth, prefix + ' clear depth')
    t.equals(gl.getParameter(gl.DEPTH_FUNC), depthFuncs[flags.depthFunc], prefix + ' depth func')
    t.equals(gl.getParameter(gl.DEPTH_TEST), flags.depthTest, prefix + ' depth test')
    t.equals(gl.getParameter(gl.DEPTH_WRITEMASK), flags.depthMask, prefix + ' depth test')
  }

  function testPixels (cdepth, depths, flags, prefix) {
    var pixels = regl.read()

    function depthTest (x, y) {
      switch (depthFuncs[flags.depthFunc]) {
        case gl.NEVER: return false
        case gl.LESS: return x < y
        case gl.LEQUAL: return x <= y
        case gl.EQUALS: return x === y
        case gl.GEQUAL: return x >= y
        case gl.GREATER: return x > y
        case gl.NOTEQUAL: return x !== y
        case gl.ALWAYS: return true
        default:
          t.fail('invalid depth func: ', flags.depthFunc)
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

    for (i = 0; i < 16; ++i) {
      for (j = 0; j < 16; ++j) {
        var ptr = 4 * (16 * i + j)

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

        if (i === 7 && j === 7) {
          if (!flags.depthTest) {
            expect('green')
          } else if (!flags.depthMask) {
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
        } else if (i === 7) {
          if (!flags.depthTest || depthTest(di, cdepth)) {
            expect('red')
          } else {
            expect('black')
          }
        } else if (j === 7) {
          if (!flags.depthTest || depthTest(dj, cdepth)) {
            expect('green')
          } else {
            expect('black')
          }
        } else {
          expect('black')
        }
      }
    }
    t.equals(broken.join('\n\t'), '', prefix + ' pixels')
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
    var drawStatic = regl(Object.assign({}, desc, flags))
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
    var prefix = 'static ' + JSON.stringify(flags)
    testFlags(cdepth, flags, prefix)
    testPixels(cdepth, depths, flags, prefix)
  }

  var cases = []
  var funcs = ['never', '<', '<=', '=', '>', '>=', '!=', 'always']
  funcs.forEach(function (func) {
    for (var mask = 0; mask <= 1; ++mask) {
      for (var test = 1; test <= 1; ++test) {
        var flags = {
          depthMask: !!mask,
          depthTest: !!test,
          depthFunc: func
        }
        for (var clearDepth = 0; clearDepth <= 1; clearDepth += 1) {
          for (var depth0 = 0; depth0 <= 1; depth0 += 0.5) {
            for (var depth1 = 0; depth1 <= 1; depth1 += 0.5) {
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
      t.end()
    } else {
      var top = cases.pop()

      testStatic(top[0], top[1], top[2])
      testDynamic(top[0], false, top[1], top[2])
      testDynamic(top[0], true, top[1], top[2])
    }
  }, 10)
})
