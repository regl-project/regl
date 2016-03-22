// Array and element buffer creation
var check = require('./check')
var isTypedArray = require('./is-typed-array')
var bufferTypes = require('./constants/buffer.json')
var usageTypes = require('./constants/usage.json')
var arrayTypes = require('./constants/arraytypes.json')

var GL_UNSIGNED_BYTE = 5121
var GL_ARRAY_BUFFER = 34962
var GL_ELEMENT_ARRAY_BUFFER = 34963
var GL_STATIC_DRAW = 35044

module.exports = function wrapBufferState (gl, extensionState) {
  var extensions = extensionState.extensions
  var bufferCount = 0
  var bufferSet = {}

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

      if ('data' in options) {
        var data = options.data
        if (data === null) {
          this.byteLength = options.length | 0
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
          this.dtype = arrayTypes[Object.prototype.toString.call(data)]
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
      gl.destroyBuffer(this.buffer)
      this.buffer = null
      delete bufferSet[this.id]
    }
  })

  function createBuffer (options) {
    options = options || {}
    var handle = gl.createBuffer()

    var type = GL_ARRAY_BUFFER
    if ('type' in options) {
      check.parameter(type, bufferTypes, 'buffer type')
      type = bufferTypes[options.type]
    }

    var buffer = new REGLBuffer(handle, type)
    bufferSet[buffer.id] = buffer
    buffer.update(options)

    function updateBuffer (options) {
      buffer.update(options || {})
      return updateBuffer
    }

    updateBuffer._reglType = 'buffer'
    updateBuffer._buffer = buffer
    updateBuffer.destroy = function () { buffer.destroy() }

    return updateBuffer
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
