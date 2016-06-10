var tape = require('tape')
var createContext = require('./util/create-context')
var createREGL = require('../regl')

tape('attributes', function (t) {
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

  var inputs = {
    array: {
      expected: [
        0, 0, 0, 0, 0,
        0, 1, 0, 0, 0,
        0, 0, 0, 1, 0,
        0, 0, 0, 1, 0,
        0, 0, 0, 0, 0
      ],

      data: [
        1, 1,
        3, 2,
        3, 3,
        4, 4
      ],

      count: 3
    },

    arrayOfArrays: {
      expected: [
        1, 0, 0, 0, 0,
        0, 0, 0, 1, 0,
        0, 0, 0, 0, 0,
        0, 1, 1, 0, 0,
        0, 0, 0, 0, 0
      ],

      data: [
        [0, 0],
        [3, 1],
        [1, 3],
        [2, 3],
        [4, 4]
      ],

      count: 4
    },

    ndarray: {
      expected: [
        0, 0, 0, 0, 0,
        0, 0, 1, 0, 0,
        0, 0, 0, 0, 0,
        0, 0, 1, 0, 0,
        0, 0, 0, 0, 1
      ],

      data: {
        data: new Float32Array([
          4, 4,
          1, 2,
          3, 2
        ]),
        shape: [3, 2],
        stride: [2, -1],
        offset: 1
      },

      count: 3
    },

    typedarray: {
      expected: [
        0, 0, 0, 0, 0,
        0, 0, 0, 0, 0,
        0, 0, 1, 1, 0,
        0, 0, 0, 0, 0,
        1, 0, 0, 0, 0
      ],

      data: new Int8Array([
        2, 2,
        3, 2,
        0, 4
      ]),

      count: 3
    }
  }

  var constructors = {
    constant: function (data, count) {
      var cmd = regl({
        frag: frag,
        vert: vert,
        depth: {enable: false},
        attributes: {
          position: data
        },
        count: count,
        primitive: 'points'
      })

      return cmd
    },

    prop: function (data, count) {
      var cmd = regl({
        frag: frag,
        vert: vert,
        depth: {enable: false},
        attributes: {
          position: regl.prop('data')
        },
        count: count,
        primitive: 'points'
      })

      return cmd
    },

    context: function (data, count) {
      var cmd = regl({
        context: {
          data: data
        },
        frag: frag,
        vert: vert,
        depth: {enable: false},
        attributes: {
          position: regl.context('data')
        },
        count: count,
        primitive: 'points'
      })

      return cmd
    },

    this: function (data, count) {
      var cmd = regl({
        frag: frag,
        vert: vert,
        depth: {enable: false},
        attributes: {
          position: regl.this('data')
        },
        count: count,
        primitive: 'points'
      })

      var obj = {
        data: data
      }

      return cmd.bind(obj)
    },

    dynamicProp: function (data, count) {
      return regl({
        frag: frag,
        vert: vert,
        depth: {enable: false},
        attributes: {
          position: function (context, props) {
            return props.data
          }
        },
        count: count,
        primitive: 'points'
      })
    },

    dynamicContext: function (data, count) {
      var cmd = regl({
        context: {
          data: data
        },
        frag: frag,
        vert: vert,
        depth: {enable: false},
        attributes: {
          position: function (context) {
            return context.data
          }
        },
        count: count,
        primitive: 'points'
      })
      return cmd
    }
  }

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
    var cmd = constructor(input.data, input.count)

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
  }

  Object.keys(constructors).forEach(function (cname) {
    Object.keys(inputs).forEach(function (iname) {
      execTest(cname + ':' + iname, inputs[iname], constructors[cname])
    })
  })

  regl.destroy()
  t.end()
})
