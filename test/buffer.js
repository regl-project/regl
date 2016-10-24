var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('buffer arg parsing', function (t) {
  var gl = createContext(16, 16)
  var regl = createREGL(gl)

  function checkProperties (buffer, props, prefix) {
    var bufferProps = buffer._buffer
    Object.keys(props).forEach(function (prop) {
      if (prop === 'data') {
        return
      }
      t.same(bufferProps[prop], props[prop], prefix + '.' + prop)
    })
    gl.bindBuffer(gl.ARRAY_BUFFER, bufferProps.buffer)
    gl.getBufferParameter(
      gl.ARRAY_BUFFER,
      gl.BUFFER_SIZE,
      bufferProps.byteLength)
    gl.getBufferParameter(
      gl.ARRAY_BUFFER,
      gl.BUFFER_USAGE,
      bufferProps.usage)
  }

  checkProperties(
    regl.buffer(),
    {
      type: gl.ARRAY_BUFFER,
      dtype: gl.UNSIGNED_BYTE,
      dimension: 1,
      usage: gl.STATIC_DRAW,
      byteLength: 0,
      data: null
    },
    'empty')

  checkProperties(
    regl.buffer(100),
    {
      type: gl.ARRAY_BUFFER,
      dtype: gl.UNSIGNED_BYTE,
      dimension: 1,
      usage: gl.STATIC_DRAW,
      byteLength: 100,
      data: null
    },
    'length only')

  checkProperties(
    regl.buffer(new Uint16Array([1, 2, 3])),
    {
      type: gl.ARRAY_BUFFER,
      dtype: gl.UNSIGNED_SHORT,
      dimension: 1,
      usage: gl.STATIC_DRAW,
      byteLength: 3 * 2,
      data: new Uint16Array([1, 2, 3])
    },
    'typed array')

  checkProperties(
    regl.buffer([1, 2, 3, 4]),
    {
      type: gl.ARRAY_BUFFER,
      dtype: gl.FLOAT,
      dimension: 1,
      usage: gl.STATIC_DRAW,
      byteLength: 4 * 4,
      data: new Float32Array([1, 2, 3, 4])
    },
    'array')

  checkProperties(
    regl.buffer({
      type: 'uint32',
      dimension: 3,
      usage: 'dynamic',
      data: [1, 2, 3]
    }),
    {
      type: gl.ARRAY_BUFFER,
      dtype: gl.UNSIGNED_INT,
      dimension: 3,
      usage: gl.DYNAMIC_DRAW,
      byteLength: 3 * 4,
      data: new Uint32Array([1, 2, 3])
    },
    'type spec')

  checkProperties(
    regl.buffer([
      [1, 2, 3, 4],
      [5, 6, 7, 8]
    ]),
    {
      type: gl.ARRAY_BUFFER,
      dtype: gl.FLOAT,
      dimension: 4,
      usage: gl.STATIC_DRAW,
      byteLength: 8 * 4,
      data: new Float32Array([
        1, 2, 3, 4,
        5, 6, 7, 8
      ])
    },
    'nested array')

  checkProperties(
    regl.buffer({
      usage: 'stream',
      type: 'int32',
      data: [
        [1, 2],
        [3, 4],
        [5, 6]
      ]
    }),
    {
      type: gl.ARRAY_BUFFER,
      dtype: gl.INT,
      dimension: 2,
      usage: gl.STREAM_DRAW,
      byteLength: 6 * 4,
      data: new Int32Array([
        1, 2,
        3, 4,
        5, 6
      ])
    },
    'nested array with types')

  checkProperties(
    regl.buffer({
      data: new Float32Array([
        4, 0, 3, 0,
        2, 0, 1, 0
      ]),
      shape: [2, 2],
      stride: [-4, -2],
      offset: 6
    }),
    {
      type: gl.ARRAY_BUFFER,
      dtype: gl.FLOAT,
      dimension: 2,
      usage: gl.STATIC_DRAW,
      byteLength: 4 * 4,
      data: new Float32Array([
        1, 2,
        3, 4
      ])
    },
    'ndarray-like input')

  regl.destroy()
  t.equals(gl.getError(), 0, 'error ok')
  createContext.destroy(gl)
  t.end()
})
