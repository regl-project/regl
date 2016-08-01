var tape = require('tape')
var extend = require('../lib/util/extend')
var createContext = require('./util/create-context')
var createREGL = require('../regl')

tape('elements - more', function (t) {
  var gl = createContext(5, 5)
  var regl = createREGL(gl)

  var frag = [
    'precision mediump float;',
    'void main() {',
    'gl_FragColor = vec4(1, 1, 1, 1);',
    '}'
  ].join('\n')

  var vert = [
    'precision mediump float;',
    'attribute vec2 position;',
    'varying vec4 fragColor;',
    'void main() {',
    'gl_Position=vec4(2.0 * (position + 0.5) / 5.0 - 1.0, 0, 1);',
    '}'
  ].join('\n')

  var positions = regl.buffer([
    0, 0,
    4, 0,
    0, 4,
    4, 4,

    1, 1,
    1, 3,
    3, 1,
    3, 3
  ])

  var inputs = {
    noElements: {
      expected: [
        0, 0, 0, 0, 0,
        0, 1, 0, 1, 0,
        0, 0, 0, 0, 0,
        0, 1, 0, 0, 0,
        0, 0, 0, 0, 0
      ],

      data: {
        elements: null,
        count: 3,
        offset: 4,
        primitive: 'points'
      }
    },

    array: {
      expected: [
        1, 0, 0, 0, 1,
        0, 0, 0, 0, 0,
        0, 0, 0, 0, 0,
        0, 0, 0, 1, 0,
        0, 0, 0, 0, 0
      ],

      data: {
        elements: [0, 1, 7],
        primitive: 'points'
      }
    },

    arrayOfArrays: {
      expected: [
        1, 0, 0, 0, 0,
        1, 1, 1, 1, 0,
        1, 0, 0, 0, 0,
        1, 0, 0, 0, 0,
        1, 0, 0, 0, 0
      ],

      data: {
        elements: [
          [0, 2],
          [2, 0],
          [4, 6],
          [6, 4]
        ]
      }
    },

    ndarray: {
      expected: [
        0, 0, 0, 0, 0,
        0, 1, 1, 1, 0,
        0, 1, 0, 1, 0,
        0, 1, 1, 1, 0,
        0, 0, 0, 0, 0
      ],

      data: {
        elements: {
          data: new Uint16Array([
            4, 5, 6,
            5, 7, 7,
            7, 6, 6,
            6, 4, 4
          ]),
          shape: [4, 2],
          stride: [3, 1],
          offset: 0
        }
      }
    },

    typedarray: {
      expected: [
        0, 0, 0, 0, 0,
        0, 1, 0, 0, 0,
        0, 0, 0, 0, 0,
        0, 1, 0, 0, 0,
        1, 0, 0, 0, 1
      ],

      data: {
        elements: new Uint8Array([2, 3, 4, 5]),
        primitive: 'points'
      }
    },

    reglElements: {
      expected: [
        0, 0, 0, 0, 0,
        0, 1, 0, 1, 0,
        0, 1, 0, 1, 0,
        0, 1, 1, 1, 0,
        0, 0, 0, 0, 0
      ],

      data: {
        elements: regl.elements([
          [4, 5],
          [5, 7],
          [7, 6],
          [6, 7],
          [5, 4]
        ])
      }
    },

    offset: {
      expected: [
        0, 0, 0, 0, 1,
        0, 1, 0, 0, 0,
        0, 0, 0, 0, 0,
        0, 0, 0, 0, 0,
        1, 0, 0, 0, 0
      ],

      data: {
        elements: regl.elements([
          0, 7, 6,
          1, 2, 4
        ]),
        primitive: 'points',
        offset: 3
      }
    }
  }

  var baseConstructors = {
    constant: function (frag, vert, data) {
      return regl(extend({
        frag: frag,
        vert: vert,
        depth: {enable: false},
        attributes: {
          position: positions
        }
      }, data))
    },

    prop: function (frag, vert, data) {
      var desc = {
        frag: frag,
        vert: vert,
        depth: {enable: false},
        attributes: {
          position: positions
        }
      }

      Object.keys(data).forEach(function (name) {
        desc[name] = regl.prop('data.' + name)
      })

      return regl(desc)
    },

    context: function (frag, vert, data, count) {
      var desc = {
        context: data,
        frag: frag,
        vert: vert,
        depth: {enable: false},
        attributes: {
          position: positions
        }
      }

      Object.keys(data).forEach(function (name) {
        desc[name] = regl.context(name)
      })

      return regl(desc)
    },

    this: function (frag, vert, data, count) {
      var desc = {
        frag: frag,
        vert: vert,
        depth: {enable: false},
        attributes: {
          position: positions
        }
      }

      Object.keys(data).forEach(function (name) {
        desc[name] = regl.this('data.' + name)
      })

      var obj = {
        data: data
      }

      return regl(desc).bind(obj)
    },

    dynamicProp: function (frag, vert, data) {
      var desc = {
        frag: frag,
        vert: vert,
        depth: {enable: false},
        attributes: {
          position: positions
        }
      }

      Object.keys(data).forEach(function (name) {
        desc[name] = function (a, b) {
          return data[name]
        }
      })

      return regl(desc)
    },

    dynamicContext: function (frag, vert, data, count) {
      var desc = {
        context: data,
        frag: frag,
        vert: vert,
        depth: {enable: false},
        attributes: {
          position: positions
        }
      }

      Object.keys(data).forEach(function (name) {
        desc[name] = function (a) {
          return a[name]
        }
      })

      return regl(desc)
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

  function checkPixels (expected) {
    var actual = regl.read()
    for (var i = 0; i < 5 * 5; ++i) {
      if (!!actual[4 * i] !== !!expected[i]) {
        return false
      }
    }
    return true
  }

  function execTest (prefix, input, constructor) {
    var cmd = constructor(input.data)

    regl.clear({
      color: [0, 0, 0, 0]
    })
    cmd({ data: input.data })
    t.ok(checkPixels(input.expected), prefix + ' - draw')

    regl.clear({
      color: [0, 0, 0, 0]
    })
    cmd([{ data: input.data }])
    t.ok(checkPixels(input.expected), prefix + ' - batch')

    regl.clear({
      color: [0, 0, 0, 0]
    })
    cmd({ data: input.data }, function () {
      regl.draw()
    })
    t.ok(checkPixels(input.expected), prefix + ' - scope')

    regl.clear({
      color: [0, 0, 0, 0]
    })
    cmd({ data: input.data }, function () {
      regl.draw(1)
    })
    t.ok(checkPixels(input.expected), prefix + ' - scope(batch)')
  }

  function runSuite (prefix) {
    Object.keys(constructors).forEach(function (cname) {
      Object.keys(inputs).forEach(function (iname) {
        execTest(prefix + cname + ':' + iname, inputs[iname], constructors[cname])
      })
    })
  }

  runSuite('')

  regl.destroy()
  t.equals(gl.getError(), 0, 'error ok')
  createContext.destroy(gl)
  t.end()
})
