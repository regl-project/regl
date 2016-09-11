var tape = require('tape')
var opts = require('../lib/util/flatten')

var GL_BYTE = 5120
var GL_UNSIGNED_BYTE = 5121
var GL_SHORT = 5122
var GL_UNSIGNED_SHORT = 5123
var GL_INT = 5124
var GL_FLOAT = 5126

tape('shape', function (t) {
  var shape = opts.shape
  t.same(shape([]), [], 'empty array')
  t.same(shape([1, 2, 3, 4]), [4], '1d')
  t.same(shape([
    [1, 2, 3],
    [4, 5, 6]
  ]), [2, 3], '2d')
  t.same(shape([
    [
      [1, 2],
      [3, 4]
    ],
    [
      [5, 6],
      [7, 8]
    ],
    [
      [9, 10],
      [11, 12]
    ]
  ]), [3, 2, 2], '3d')
  t.end()
})

tape('flatten', function (t) {
  var flatten = opts.flatten

  function checkFlatten (actual, expected, ctor) {
    if (!(actual instanceof ctor)) {
      return false
    }
    if (actual.length !== expected.length) {
      return false
    }
    for (var i = 0; i < expected.length; ++i) {
      if (actual[i] !== expected[i]) {
        return false
      }
    }
    return true
  }

  t.ok(checkFlatten(flatten([], [], GL_BYTE), [], Int8Array), 'flatten empty')
  t.ok(checkFlatten(flatten([1, 2, 3], [3], GL_SHORT), [1, 2, 3], Int16Array), 'flatten 1d')
  t.ok(checkFlatten(flatten([
    [1, 2, 3],
    [4, 5, 6]
  ], [2, 3], GL_INT),
    [1, 2, 3, 4, 5, 6],
    Int32Array), 'flatten 2d')
  t.ok(checkFlatten(flatten([
    [
      [1, 2, 3],
      [4, 5, 6]
    ],
    [
      [7, 8, 9],
      [10, 11, 12]
    ],
    [
      [13, 14, 15],
      [16, 17, 18]
    ],
    [
      [19, 20, 21],
      [22, 23, 24]
    ]
  ], [4, 2, 3], GL_FLOAT),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24],
    Float32Array), 'flatten 3d')
  t.ok(checkFlatten(flatten([
    [
      [
        [1, 2],
        [3, 4]
      ],
      [
        [5, 6],
        [7, 8]
      ]
    ],
    [
      [
        [9, 10],
        [11, 12]
      ],
      [
        [13, 14],
        [15, 16]
      ]
    ]
  ], [2, 2, 2, 2], GL_UNSIGNED_BYTE),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
    Uint8Array), 'flatten 4d')
  t.ok(checkFlatten(flatten([
    [
      [
        [
          [1, 2],
          [3, 4]
        ],
        [
          [5, 6],
          [7, 8]
        ]
      ],
      [
        [
          [9, 10],
          [11, 12]
        ],
        [
          [13, 14],
          [15, 16]
        ]
      ]
    ],
    [
      [
        [
          [21, 22],
          [23, 24]
        ],
        [
          [25, 26],
          [27, 28]
        ]
      ],
      [
        [
          [29, 210],
          [211, 212]
        ],
        [
          [213, 214],
          [215, 216]
        ]
      ]
    ]
  ], [2, 2, 2, 2, 2], GL_UNSIGNED_SHORT),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    21, 22, 23, 24, 25, 26, 27, 28, 29, 210, 211, 212, 213, 214, 215, 216],
    Uint16Array), 'flatten 5d')

  t.end()
})
