var tape = require('tape')
var extend = require('../lib/util/extend')
var createContext = require('./util/create-context')
var createREGL = require('../regl')

tape('attribute constants', function (t) {
  // This test does not work unless we either perform a complete refresh of the canvas element or
  // enable the ANGLE_instanced_arrays extension. That should not need to be the case, but since
  // earlier tests use the ANGLE_instanced_arrays extension and since this test does not, the
  // canvas ends up polluted and managing divisors is necessary even though this particular regl
  // context does not know about the extension.
  //
  // A more robust long-term solution is perhaps to have regl query the available extensions and
  // register them as available even if you did not ask for them.
  if (!createContext.refreshCanvas) {
    return t.end()
  }
  createContext.refreshCanvas()

  var gl = createContext(2, 2)
  var regl = createREGL({
    gl: gl,
    optionalExtensions: [ 'oes_vertex_array_object' ]
  })

  var vert = [
    'precision highp float;',
    'attribute vec2 position;',
    'attribute vec4 color;',
    'varying vec4 fragColor;',
    'void main () {',
    '  fragColor = color;',
    '  gl_Position = vec4(position, 0, 1);',
    '}'
  ].join('\n')

  var frag = [
    'precision highp float;',
    'varying vec4 fragColor;',
    'void main () {',
    '  gl_FragColor = fragColor;',
    '}'
  ].join('\n')

  var baseDesc = {
    vert: vert,
    frag: frag,
    attributes: {
      position: [
        0, -4,
        -4, 4,
        4, 4
      ]
    },
    count: 3,
    depth: { enable: false },
    primitive: 'triangles'
  }

  var colors = {
    'scalar': 1,
    '1': [1],
    '2': [1, 1],
    '3': [1, 0, 1],
    '4': [1, 0, 0, 1],
    '1-typed': new Float32Array([1]),
    '2-typed': new Float32Array([1, 1]),
    '3-typed': new Float32Array([1, 0, 1]),
    '4-typed': new Float32Array([1, 0, 0, 1]),
    'zero': 0
  }

  var propDesc = extend({}, baseDesc)
  propDesc.attributes = extend(propDesc.attributes, {
    color: {
      constant: regl.prop('color')
    }
  })
  var propCommand = regl(propDesc)

  var propDynShaderDesc = extend({
    frag: function (context, props) {
      return frag
    }
  }, baseDesc)
  propDynShaderDesc.attributes = extend(propDynShaderDesc.attributes, {
    color: {
      constant: regl.prop('color')
    }
  })
  var propDynShaderCommand = regl(propDynShaderDesc)

  var propAttrDesc = extend({}, baseDesc)
  propAttrDesc.attributes = extend(propAttrDesc.attributes, {
    color: function (_, props) {
      return {
        constant: props.color
      }
    }
  })
  var propAttrCommand = regl(propAttrDesc)

  var propAttrDynDesc = extend({
    frag: function (context, props) {
      return frag
    }
  }, baseDesc)
  propAttrDynDesc.attributes = extend(propAttrDynDesc.attributes, {
    color: function (_, props) {
      return {
        constant: props.color
      }
    }
  })
  var propAttrDynCommand = regl(propAttrDynDesc)

  var commands = {
    'static': function (color) {
      var desc = extend({}, baseDesc)
      desc.attributes = extend(desc.attributes, {
        color: {
          constant: color
        }
      })
      return regl(desc)
    },

    'static - dyn shader': function (color) {
      var desc = extend({
        frag: function (context, props) {
          return frag
        }
      }, baseDesc)
      desc.attributes = extend(desc.attributes, {
        color: {
          constant: color
        }
      })
      return regl(desc)
    },

    'prop': function (color) {
      return propCommand
    },

    'prop - dyn shader': function (color) {
      return propDynShaderCommand
    },

    'context': function (color) {
      var desc = extend({
        context: {
          color: color
        }
      }, baseDesc)
      desc.attributes = extend(desc.attributes, {
        color: {
          constant: regl.context('color')
        }
      })
      return regl(desc)
    },

    'context - dyn shader': function (color) {
      var desc = extend({
        context: {
          color: color
        },
        frag: function () {
          return frag
        }
      }, baseDesc)
      desc.attributes = extend(desc.attributes, {
        color: {
          constant: regl.context('color')
        }
      })
      return regl(desc)
    },

    'prop-attr': function (color) {
      return propAttrCommand
    },

    'prop-attr - dyn shader': function (color) {
      return propAttrDynCommand
    },

    'context-attr': function (color) {
      var desc = extend({
        context: {
          color: {
            constant: color
          }
        }
      }, baseDesc)
      desc.attributes = extend(desc.attributes, {
        color: regl.context('color')
      })
      return regl(desc)
    },

    'context-attr - dyn shader': function (color) {
      var desc = extend({
        context: {
          color: {
            constant: color
          }
        },
        frag: function () {
          return frag
        }
      }, baseDesc)
      desc.attributes = extend(desc.attributes, {
        color: regl.context('color')
      })
      return regl(desc)
    }
  }

  var cases = {
    'draw': function (command, color) {
      command({ color: color })
    },
    'batch': function (command, color) {
      command([{ color: color }])
    },
    'scope': function (command, color) {
      command({ color: color }, function () {
        regl.draw()
      })
    },
    'scope - batch': function (command, color) {
      command({ color: color }, function () {
        regl.draw(1)
      })
    }
  }

  function checkPixels (color) {
    var pixels = regl.read()
    for (var i = 0; i < 2 * 2; ++i) {
      if (typeof color === 'number') {
        if (pixels[4 * i] !== color * 255) {
          return false
        }
        if (pixels[4 * i + 1] !== 0 ||
            pixels[4 * i + 2] !== 0 ||
            pixels[4 * i + 3] !== 0) {
          return false
        }
      } else {
        for (var j = 0; j < color.length; ++j) {
          if (pixels[4 * i + j] !== color[j] * 255) {
            return false
          }
        }
        for (j = color.length; j < 4; ++j) {
          if (pixels[4 * i + j] !== 0) {
            return false
          }
        }
      }
    }
    return true
  }

  Object.keys(colors).forEach(function (count) {
    var color = colors[count]
    Object.keys(commands).forEach(function (commandName) {
      var genCommand = commands[commandName]
      var command = genCommand(color)
      Object.keys(cases).forEach(function (caseName) {
        var caseCode = cases[caseName]
        regl.clear({
          color: [1, 1, 1, 1]
        })
        caseCode(command, color)
        t.ok(checkPixels(color), caseName + ',' + commandName + ' ' + count)
        if (commandName.indexOf('prop') >= 0 && Array.isArray(color)) {
          for (var i = 0; i < color.length; ++i) {
            var scratchColor = color.slice()
            scratchColor[i] = color[i] ^ 1
            regl.clear({
              color: [0, 0, 0, 0]
            })
            caseCode(command, scratchColor)
            t.ok(checkPixels(scratchColor), caseName + ',' + commandName + ' ' + count)
          }
        }
      })
    })
  })

  t.test('attributes switched between const and non-const', function (t) {
    var drawForSwitching = regl({
      frag: [
        'void main() {',
        '  gl_FragColor = vec4(1,0,0,0);',
        '}'
      ].join('\n'),
      vert: [
        'precision highp float;',
        'attribute vec2 position;',
        'attribute float isActive;',
        'void main() {',
        ' if (isActive == 0.) return;',
        ' gl_PointSize = 1.;',
        ' gl_Position = vec4(position, 0, 1);',
        '}'
      ].join('\n'),
      attributes: {
        position: [
          [-0.5, -0.5],
          [0.5, -0.5]
        ],
        isActive: regl.prop('isActive')
      },
      depth: { enable: false },
      count: 2,
      primitive: 'points'
    })

    regl.clear({ color: [0, 0, 0, 0] })
    drawForSwitching({ isActive: [0, 1] })

    var pixels = regl.read()
    t.equal(pixels[0], 0)
    t.equal(pixels[4], 255)

    regl.clear({ color: [0, 0, 0, 0] })
    drawForSwitching({ isActive: { constant: [1] } })

    pixels = regl.read()
    t.equal(pixels[0], 255)
    t.equal(pixels[4], 255)

    regl.clear({ color: [0, 0, 0, 0] })
    drawForSwitching({ isActive: [0, 1] })

    pixels = regl.read()
    t.equal(pixels[0], 0)
    t.equal(pixels[4], 255)

    t.end()
  })

  regl.destroy()
  createContext.destroy(gl)
  t.end()
})
