// Array and element buffer creation
var check = require('./check')
var isTypedArray = require('./is-typed-array')
var usageTypes = require('./constants/usage.json')
var arrayTypes = require('./constants/arraytypes.json')

var GL_UNSIGNED_BYTE = 5121
var GL_STATIC_DRAW = 35044
var GL_FLOAT = 5126

function flatten (data, dimension) {
  var result = new Float32Array(data.length * dimension)
  var ptr = 0
  for (var i = 0; i < data.length; ++i) {
    var v = data[i]
    for (var j = 0; j < dimension; ++j) {
      result[ptr++] = v[j]
    }
  }
  return result
}

module.exports = function wrapBufferState (gl) {
  var bufferCount = 0
  var bufferSet = {}

  function REGLBuffer (buffer, type) {
    this.id = bufferCount++
    this.buffer = buffer
    this.type = type
    this.usage = GL_STATIC_DRAW
    this.byteLength = 0
    this.dimension = 1
    this.data = null
    this.dtype = GL_UNSIGNED_BYTE
  }

  Object.assign(REGLBuffer.prototype, {
    bind: function () {
      gl.bindBuffer(this.type, this.buffer)
    },

    update: function (options) {
      if (Array.isArray(options) || isTypedArray(options)) {
        options = {
          data: options
        }
      } else if (typeof options === 'number') {
        options = {
          length: options | 0
        }
      } else if (options === null || options === void 0) {
        options = {}
      }

      check.type(
        options, 'object',
        'buffer arguments must be an object, a number or an array')

      if ('usage' in options) {
        var usage = options.usage
        check.parameter(usage, usageTypes, 'buffer usage')
        this.usage = usageTypes[options.usage]
      }

      var dimension = (options.dimension | 0) || 1
      if ('data' in options) {
        var data = options.data
        if (data === null) {
          this.byteLength = options.length | 0
          this.dtype = GL_UNSIGNED_BYTE
        } else {
          if (Array.isArray(data)) {
            if (data.length > 0 && Array.isArray(data[0])) {
              dimension = data[0].length
              data = flatten(data, dimension)
              this.dtype = GL_FLOAT
            } else {
              data = new Float32Array(data)
              this.dtype = GL_FLOAT
            }
          } else {
            check.isTypedArray(data, 'invalid data type buffer data')
            this.dtype = arrayTypes[Object.prototype.toString.call(data)]
          }
          this.dimension = dimension
          this.byteLength = data.byteLength
        }
        this.data = data
      } else if ('length' in options) {
        var byteLength = options.length
        check.nni(byteLength, 'buffer length must be a nonnegative integer')
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
      gl.deleteBuffer(this.buffer)
      this.buffer = null
      delete bufferSet[this.id]
    }
  })

  function createBuffer (options, type) {
    options = options || {}
    var handle = gl.createBuffer()

    var buffer = new REGLBuffer(handle, type)
    buffer.update(options)
    bufferSet[buffer.id] = buffer

    function reglBuffer (options) {
      buffer.update(options || {})
      return reglBuffer
    }

    reglBuffer._reglType = 'buffer'
    reglBuffer._buffer = buffer
    reglBuffer.destroy = function () { buffer.destroy() }

    return reglBuffer
  }

  return {
    create: createBuffer,

    clear: function () {
      Object.keys(bufferSet).forEach(function (bufferId) {
        bufferSet[bufferId].destroy()
      })
    },

    refresh: function () {
      Object.keys(bufferSet).forEach(function (bufferId) {
        bufferSet[bufferId].refresh()
      })
    },

    getBuffer: function (wrapper) {
      if (wrapper && wrapper._buffer instanceof REGLBuffer) {
        return wrapper._buffer
      }
      return null
    }
  }
}
