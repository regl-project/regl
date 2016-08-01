var tape = require('tape')
var createContext = require('./util/create-context')
var extend = require('../lib/util/extend')
var createREGL = require('../regl')

tape('uniforms', function (t) {
  var gl = createContext(1, 1)
  var regl = createREGL(gl)

  function toVec4 (type, name) {
    switch (type) {
      case 'vec4':
      case 'ivec4':
      case 'bvec4':
        return 'vec4(' + name + ')'
      case 'vec3':
      case 'ivec3':
      case 'bvec3':
        return 'vec4(' + name + ',0.0)'
      case 'vec2':
      case 'ivec2':
      case 'bvec2':
        return 'vec4(' + name + ',0.0,0.0)'
      case 'float':
      case 'int':
      case 'bool':
        return 'vec4(' + name + ',0,0,0)'
      case 'mat2':
        return 'vec4(' + name + '[0],' + name + '[1])'
      case 'mat3': // FIXME: just returns 2nd row
        return 'vec4(' + name + '[1],0.0)'
      case 'mat4': // FIXME: just returns 3rd row
        return name + '[2]'
      case 'sampler2D':
        return 'texture2D(' + name + ',vec2(0.0,0.0))'
      case 'samplerCube':
        return 'textureCube(' + name + ',vec3(1.0,0.0,0.0))'
    }
  }

  function testUniform (type, cases) {
    var frag = [
      'precision highp float;',
      'uniform ' + type + ' data;',
      'void main() {',
      '  gl_FragColor = ' + toVec4(type, 'data') + ';',
      '}'
    ].join('\n')

    var vert = [
      'precision highp float;',
      'attribute vec2 position;',
      'void main() {',
      '  gl_Position = vec4(position, 0, 1);',
      '}'
    ].join('\n')

    var commandDesc = {
      depth: { enable: false },
      attributes: {
        position: [
          -4, 0,
          4, -4,
          4, 4
        ]
      },
      primitive: 'triangles',
      count: 3
    }

    var baseConstructors = {
      constant: function (frag, vert, input) {
        return regl(extend(commandDesc, {
          vert: vert,
          frag: frag,
          uniforms: {
            data: input
          }
        }))
      },
      prop: function (frag, vert, input) {
        return regl(extend(commandDesc, {
          vert: vert,
          frag: frag,
          uniforms: {
            data: regl.prop('data')
          }
        }))
      },
      context: function (frag, vert, input) {
        return regl(extend(commandDesc, {
          vert: vert,
          frag: frag,
          uniforms: {
            data: regl.context('data')
          },
          context: {
            data: input
          }
        }))
      },
      this: function (frag, vert, input) {
        return regl(extend(commandDesc, {
          vert: vert,
          frag: frag,
          uniforms: {
            data: regl.this('data')
          }
        })).bind({ data: input })
      },
      dynamicContext: function (frag, vert, input) {
        return regl(extend(commandDesc, {
          vert: vert,
          frag: frag,
          uniforms: {
            data: function (context) {
              return context.data
            }
          },
          context: {
            data: input
          }
        }))
      },
      dynamicProp: function (frag, vert, input) {
        return regl(extend(commandDesc, {
          vert: vert,
          frag: frag,
          uniforms: {
            data: function (context, props) {
              return props.data
            }
          },
          context: {
            data: input
          }
        }))
      }
    }

    var constructors = {}
    Object.keys(baseConstructors).forEach(function (name) {
      var base = baseConstructors[name]
      constructors[name + '(const shader)'] = function (data) {
        return base(frag, vert, data)
      }

      constructors[name + '(dyn shader)'] = function (data) {
        return base(function () {
          return frag
        }, function () {
          return vert
        }, data)
      }

      constructors[name + '(prop shader)'] = function (data) {
        return base(function (a, b) {
          return frag
        }, function (a, b) {
          return vert
        }, data)
      }
    })

    function runTestCase (name, input, expected, throws) {
      Object.keys(constructors).forEach(function (cname) {
        var constructor = constructors[cname]
        var testName = type + '[' + cname + ']' + ': ' + name
        if (throws) {
          t.throws(function () {
            var cmd = constructor(input)
            cmd({ data: input })
          }, /\(regl\)/, testName + ' draw throws')
          t.throws(function () {
            var cmd = constructor(input)
            cmd([{ data: input }])
          }, /\(regl\)/, testName + ' batch throws')
          t.throws(function () {
            var cmd = constructor(input)
            cmd({ data: input }, function () {
              regl.draw()
            })
          }, /\(regl\)/, testName + ' scope(draw) throws')
          t.throws(function () {
            var cmd = constructor(input)
            cmd({ data: input }, function () {
              regl.draw(1)
            })
          }, /\(regl\)/, testName + ' scope(batch) throws')
        } else {
          var cmd = constructor(input)
          var pixels

          regl.clear({
            color: [0, 0, 0, 0]
          })
          cmd({ data: input })
          pixels = Array.prototype.slice.call(regl.read())
          t.same(
            pixels,
            expected,
            testName + ' draw')

          regl.clear({
            color: [0, 0, 0, 0]
          })
          cmd([{ data: input }])
          pixels = Array.prototype.slice.call(regl.read())
          t.same(
            pixels,
            expected,
            testName + ' batch')

          regl.clear({
            color: [0, 0, 0, 0]
          })
          cmd({ data: input }, function () {
            regl.draw()
          })
          pixels = Array.prototype.slice.call(regl.read())
          t.same(
            pixels,
            expected,
            testName + ' scope(draw)')

          regl.clear({
            color: [0, 0, 0, 0]
          })
          cmd({ data: input }, function () {
            regl.draw(1)
          })
          pixels = Array.prototype.slice.call(regl.read())
          t.same(
            pixels,
            expected,
            testName + ' scope(batch)')
        }
      })
    }

    Object.keys(cases).forEach(function (name) {
      var data = cases[name]
      runTestCase(name, data.input, data.expected, data.throws)
    })
  }

  var testCases = {
    'float': {
      '0': {
        input: 0,
        expected: [0, 0, 0, 0]
      },
      '1': {
        input: 1,
        expected: [255, 0, 0, 0]
      },
      'string': {
        input: 'fooo',
        throws: true
      },
      'null': {
        input: null,
        throws: true
      },
      'array': {
        input: [0],
        throws: true
      }
    },
    'vec2': {
      'array': {
        input: [0, 1],
        expected: [0, 255, 0, 0]
      },
      'float32array': {
        input: new Float32Array([1, 0]),
        expected: [255, 0, 0, 0]
      },
      'float64array': {
        input: new Float64Array([1, 1]),
        expected: [255, 255, 0, 0]
      },
      'int32array': {
        input: new Int32Array([1, 0]),
        expected: [255, 0, 0, 0]
      },
      'long array': {
        input: [1, 2, 3],
        throws: true
      },
      'empty array': {
        input: [],
        throws: true
      },
      'null': {
        input: null,
        throws: true
      }
    },
    'vec3': {
      'array': {
        input: [0, 1, 1],
        expected: [0, 255, 255, 0]
      },
      'float32array': {
        input: new Float32Array([1, 0, 1]),
        expected: [255, 0, 255, 0]
      },
      'float64array': {
        input: new Float64Array([1, 1, 0]),
        expected: [255, 255, 0, 0]
      },
      'int32array': {
        input: new Int32Array([0, 1, 1]),
        expected: [0, 255, 255, 0]
      },
      'long array': {
        input: [1, 2, 3, 4],
        throws: true
      },
      'empty array': {
        input: [],
        throws: true
      },
      'null': {
        input: null,
        throws: true
      }
    },
    'vec4': {
      'array': {
        input: [0, 1, 0, 1],
        expected: [0, 255, 0, 255]
      },
      'float32array': {
        input: new Float32Array([1, 0, 0, 1]),
        expected: [255, 0, 0, 255]
      },
      'float64array': {
        input: new Float64Array([1, 1, 0, 1]),
        expected: [255, 255, 0, 255]
      },
      'int32array': {
        input: new Int32Array([1, 0, 1, 1]),
        expected: [255, 0, 255, 255]
      },
      'long array': {
        input: [1, 2, 3, 4, 5],
        throws: true
      },
      'empty array': {
        input: [],
        throws: true
      },
      'null': {
        input: null,
        throws: true
      }
    },
    'int': {
      '0': {
        input: 0,
        expected: [0, 0, 0, 0]
      },
      '1': {
        input: 1,
        expected: [255, 0, 0, 0]
      },
      'string': {
        input: 'fooo',
        throws: true
      },
      'null': {
        input: null,
        throws: true
      },
      'array': {
        input: [0],
        throws: true
      }
    },
    'ivec2': {
      'array': {
        input: [0, 1],
        expected: [0, 255, 0, 0]
      },
      'float32array': {
        input: new Float32Array([1, 0]),
        expected: [255, 0, 0, 0]
      },
      'float64array': {
        input: new Float64Array([1, 1]),
        expected: [255, 255, 0, 0]
      },
      'int32array': {
        input: new Int32Array([1, 0]),
        expected: [255, 0, 0, 0]
      },
      'long array': {
        input: [1, 2, 3],
        throws: true
      },
      'empty array': {
        input: [],
        throws: true
      },
      'null': {
        input: null,
        throws: true
      }
    },
    'ivec3': {
      'array': {
        input: [0, 1, 1],
        expected: [0, 255, 255, 0]
      },
      'float32array': {
        input: new Float32Array([1, 0, 1]),
        expected: [255, 0, 255, 0]
      },
      'float64array': {
        input: new Float64Array([1, 1, 0]),
        expected: [255, 255, 0, 0]
      },
      'int32array': {
        input: new Int32Array([0, 1, 1]),
        expected: [0, 255, 255, 0]
      },
      'long array': {
        input: [1, 2, 3, 4],
        throws: true
      },
      'empty array': {
        input: [],
        throws: true
      },
      'null': {
        input: null,
        throws: true
      }
    },
    'ivec4': {
      'array': {
        input: [0, 1, 0, 1],
        expected: [0, 255, 0, 255]
      },
      'float32array': {
        input: new Float32Array([1, 0, 0, 1]),
        expected: [255, 0, 0, 255]
      },
      'float64array': {
        input: new Float64Array([1, 1, 0, 1]),
        expected: [255, 255, 0, 255]
      },
      'int32array': {
        input: new Int32Array([1, 0, 1, 1]),
        expected: [255, 0, 255, 255]
      },
      'long array': {
        input: [1, 2, 3, 4, 5],
        throws: true
      },
      'empty array': {
        input: [],
        throws: true
      },
      'null': {
        input: null,
        throws: true
      }
    },
    'bool': {
      'false': {
        input: false,
        expected: [0, 0, 0, 0]
      },
      'true': {
        input: true,
        expected: [255, 0, 0, 0]
      },
      'number': {
        input: 5,
        throws: true
      },
      'string': {
        input: 'fooo',
        throws: true
      },
      'null': {
        input: null,
        throws: true
      },
      'array': {
        input: [0],
        throws: true
      }
    },
    'bvec2': {
      'array': {
        input: [false, true],
        expected: [0, 255, 0, 0]
      },
      'float32array': {
        input: new Float32Array([1, 0]),
        expected: [255, 0, 0, 0]
      },
      'float64array': {
        input: new Float64Array([1, 1]),
        expected: [255, 255, 0, 0]
      },
      'int32array': {
        input: new Int32Array([1, 0]),
        expected: [255, 0, 0, 0]
      },
      'long array': {
        input: [false, false, false],
        throws: true
      },
      'empty array': {
        input: [],
        throws: true
      },
      'null': {
        input: null,
        throws: true
      }
    },
    'bvec3': {
      'array': {
        input: [false, true, true],
        expected: [0, 255, 255, 0]
      },
      'float32array': {
        input: new Float32Array([1, 0, 1]),
        expected: [255, 0, 255, 0]
      },
      'float64array': {
        input: new Float64Array([1, 1, 0]),
        expected: [255, 255, 0, 0]
      },
      'int32array': {
        input: new Int32Array([0, 1, 1]),
        expected: [0, 255, 255, 0]
      },
      'long array': {
        input: [true, false, true, false],
        throws: true
      },
      'empty array': {
        input: [],
        throws: true
      },
      'null': {
        input: null,
        throws: true
      }
    },
    'bvec4': {
      'array': {
        input: [false, true, false, true],
        expected: [0, 255, 0, 255]
      },
      'float32array': {
        input: new Float32Array([1, 0, 0, 1]),
        expected: [255, 0, 0, 255]
      },
      'float64array': {
        input: new Float64Array([1, 1, 0, 1]),
        expected: [255, 255, 0, 255]
      },
      'int32array': {
        input: new Int32Array([1, 0, 1, 1]),
        expected: [255, 0, 255, 255]
      },
      'long array': {
        input: [false, false, false, false, false, false],
        throws: true
      },
      'empty array': {
        input: [],
        throws: true
      },
      'null': {
        input: null,
        throws: true
      }
    },
    'mat2': {
      'array': {
        input: [0, 1, 0, 1],
        expected: [0, 255, 0, 255]
      },
      'float32array': {
        input: new Float32Array([1, 0, 0, 1]),
        expected: [255, 0, 0, 255]
      },
      'float64array': {
        input: new Float64Array([1, 1, 0, 1]),
        expected: [255, 255, 0, 255]
      },
      'int32array': {
        input: new Int32Array([1, 0, 1, 1]),
        expected: [255, 0, 255, 255]
      },
      'long array': {
        input: [1, 2, 3, 4, 5],
        throws: true
      },
      'empty array': {
        input: [],
        throws: true
      },
      'null': {
        input: null,
        throws: true
      }
    },
    'mat3': {
      'array': {
        input: [
          0, 0, 0,
          1, 0, 1, // only this row gets tested
          0, 0, 0 ],
        expected: [255, 0, 255, 0]
      },
      'float32array': {
        input: new Float32Array([
          1, 1, 1,
          0, 1, 0,
          1, 0, 1
        ]),
        expected: [0, 255, 0, 0]
      },
      'float64array': {
        input: new Float64Array([
          1, 1, 1,
          1, 1, 0,
          1, 1, 1]),
        expected: [255, 255, 0, 0]
      },
      'int32array': {
        input: new Int32Array([
          1, 1, 1,
          0, 0, 1,
          1, 1, 1]),
        expected: [0, 0, 255, 0]
      },
      'long array': {
        input: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        throws: true
      },
      'short array': {
        input: [1, 2, 3, 4, 5, 6, 7, 8],
        throws: true
      },
      'empty array': {
        input: [],
        throws: true
      },
      'null': {
        input: null,
        throws: true
      }
    },
    'mat4': {
      'array': {
        input: [
          0, 0, 0, 0,
          0, 0, 0, 0,
          1, 0, 1, 1, // only this row gets tested
          0, 0, 0, 0 ],
        expected: [255, 0, 255, 255]
      },
      'float32array': {
        input: new Float32Array([
          1, 1, 1, 1,
          1, 1, 1, 1,
          0, 1, 0, 0,
          1, 0, 1, 1
        ]),
        expected: [0, 255, 0, 0]
      },
      'float64array': {
        input: new Float64Array([
          1, 1, 1, 1,
          1, 1, 1, 1,
          1, 1, 0, 0,
          1, 1, 1, 1]),
        expected: [255, 255, 0, 0]
      },
      'int32array': {
        input: new Int32Array([
          1, 1, 1, 1,
          1, 1, 1, 1,
          0, 0, 1, 1,
          1, 1, 1, 0]),
        expected: [0, 0, 255, 255]
      },
      'long array': {
        input: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
        throws: true
      },
      'short array': {
        input: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        throws: true
      },
      'empty array': {
        input: [],
        throws: true
      },
      'null': {
        input: null,
        throws: true
      }
    },
    'sampler2D': {
      'texture2D': {
        input: regl.texture({
          width: 1,
          height: 1,
          data: [255, 0, 255, 255]
        }),
        expected: [255, 0, 255, 255]
      },
      'null': {
        input: null,
        throws: true
      },
      'random function': {
        input: function () {},
        throws: true
      },
      'cube map': {
        input: regl.cube(1),
        throws: true
      }
    },
    'samplerCube': {
      'cube map': {
        input: regl.cube({
          radius: 1,
          faces: [
            [255, 0, 0, 255],
            [255, 0, 0, 255],
            [255, 0, 0, 255],
            [255, 0, 0, 255],
            [255, 0, 0, 255],
            [255, 0, 0, 255]
          ]
        }),
        expected: [255, 0, 0, 255]
      },
      'texture2D': {
        input: regl.texture(1),
        throws: true
      },
      'null': {
        input: null,
        throws: true
      },
      'random function': {
        input: function () {},
        throws: true
      }
    }
  }

  var pendingCases = Object.keys(testCases)
  function processCase () {
    var type = pendingCases.pop()
    if (type) {
      testUniform(type, testCases[type])
      setTimeout(processCase, 16)
    } else {
      regl.destroy()
      t.equals(gl.getError(), 0, 'error ok')
      createContext.destroy(gl)
      t.end()
    }
  }
  processCase()
})
