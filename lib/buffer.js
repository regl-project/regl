var dtypes = require('./dtypes.json')
var check = require('./check')

module.exports = function createBufferSet (gl, extensions) {
  var bufferCount = 0
  var bufferSet = {}

  var GL_UNSIGNED_BYTE = gl.UNSIGNED_BYTE

  var GL_ARRAY_BUFFER = gl.ARRAY_BUFFER
  var GL_ELEMENT_ARRAY_BUFFER = gl.ELEMENT_ARRAY_BUFFER
  var bufferTypes = {
    'array': GL_ARRAY_BUFFER,
    'elements': GL_ELEMENT_ARRAY_BUFFER
  }

  var GL_STREAM_DRAW = gl.STREAM_DRAW
  var GL_STATIC_DRAW = gl.STATIC_DRAW
  var GL_DYNAMIC_DRAW = gl.DYNAMIC_DRAW
  var usageTypes = {
    static: GL_STATIC_DRAW,
    dynamic: GL_DYNAMIC_DRAW,
    stream: GL_STREAM_DRAW
  }

  function REGLBuffer (buffer, type) {
    this.id = bufferCount++
    this.buffer = buffer
    this.type = type
    this.usage = GL_STATIC_DRAW
    this.byteLength = 0
    this.data = null
    this.dtype = GL_UNSIGNED_BYTE
  }

  Object.assign(REGLBuffer.prototype, {
    bind: function () {
      var buffer = this.buffer
      check(!!buffer, 'cannot bind deleted buffer')
      gl.bindBuffer(this.type, buffer)
    },

    update: function (options) {
      if ('usage' in options) {
        var usage = options.usage
        check.parameter(usage, usageTypes, 'buffer usage')
        this.usage = usageTypes[options.usage]
      }

      if ('data' in options) {
        var data = options.data
        if (data === null) {
          this.byteLength = 0
          this.dtype = GL_UNSIGNED_BYTE
        } else {
          if (Array.isArray(data)) {
            if (this.type === GL_ELEMENT_ARRAY_BUFFER) {
              if (extensions['oes_element_index_uint']) {
                data = new Uint32Array(data)
              } else {
                data = new Uint16Array(data)
              }
            } else {
              data = new Float32Array(data)
            }
          } else {
            check.isTypedArray(data, 'invalid data type buffer data')
          }
          this.byteLength = data.byteLength
          this.dtype = dtypes[data]
        }
        this.data = data
      } else if ('length' in options) {
        var byteLength = options.length
        check(byteLength >= 0 && byteLength === (byteLength | 0),
            'buffer length must be a nonnegative integer')
        this.data = null
        this.byteLength = options.length | 0
        this.dtype = GL_UNSIGNED_BYTE
      }

      this.bind()
      gl.bufferData(this.type, this.data || this.byteLength, this.usage)
    },

    refresh: function () {
      if (!gl.isBuffer(this.buffer)) {
        this.buffer = gl.createBuffer()
      }
      this.update({})
    },

    destroy: function () {
      check(this.buffer, 'buffer must not be deleted already')
      gl.destroyBuffer(this.buffer)
    }
  })

  function createBuffer (options) {
    options = options || {}
    var handle = gl.createBuffer()
    var type = bufferTypes[options.type] || GL_ARRAY_BUFFER

    var buffer = new REGLBuffer(handle, type)
    bufferSet[buffer.id] = buffer
    buffer.update(options)

    function updateBuffer (options) {
      buffer.update(options || {})
      return buffer
    }

    updateBuffer.buffer = buffer
    updateBuffer.destroy = function () { buffer.destroy() }

    return updateBuffer
  }

  function clearBuffers () {
    Object.keys(bufferSet).forEach(function (bufferId) {
      bufferSet[bufferId].destroy()
    })
  }

  function refreshBuffers () {
    Object.keys(bufferSet).forEach(function (bufferId) {
      bufferSet[bufferId].refresh()
    })
  }

  return {
    create: createBuffer,
    clear: clearBuffers,
    refresh: refreshBuffers
  }
}
