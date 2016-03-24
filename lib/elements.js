var check = require('./check')
var isTypedArray = require('./is-typed-array')
var primTypes = require('./constants/primitives.json')

var GL_POINTS = 0
var GL_LINES = 1
var GL_TRIANGLES = 4

var GL_UNSIGNED_BYTE = 5121
var GL_UNSIGNED_SHORT = 5123
var GL_UNSIGNED_INT = 5125

var GL_ELEMENT_ARRAY_BUFFER = 34963

module.exports = function wrapElementsState (gl, extensionState, bufferState) {
  var extensions = extensionState.extensions

  var elements = [ null ]

  function REGLElementBuffer () {
    this.buffer = null
    this.primType = GL_TRIANGLES
    this.vertCount = 0
    this.type = 0
  }

  function parseOptions (elements, options) {
    var result = {
      type: 'elements'
    }
    var ext32bit = extensions.oes_element_index_uint
    elements.primType = GL_TRIANGLES
    elements.vertCount = 0
    elements.type = 0

    var data = null

    // Check option type
    if (!options) {
      return result
    }
    if (typeof options === 'number') {
      result.length = options
    } else {
      check.type(options, 'object', 'argument to element buffer must be object')
      data = options.data || options
    }

    if (Array.isArray(data)) {
      if (options.length === 0) {
        data = null
      } else if (Array.isArray(data[0])) {
        var dim = data[0].length
        if (dim === 1) elements.primType = GL_POINTS
        if (dim === 2) elements.primType = GL_LINES
        if (dim === 3) elements.primType = GL_TRIANGLES
        var i
        var count = 0
        for (i = 0; i < data.length; ++i) {
          count += data[i].length
        }
        var flattened = ext32bit
          ? new Uint32Array(count)
          : new Uint16Array(count)
        var ptr = 0
        for (i = 0; i < data.length; ++i) {
          var x = data[i]
          for (var j = 0; j < x.length; ++j) {
            flattened[ptr++] = x[j]
          }
        }
        data = flattened
      } else if (ext32bit) {
        data = new Uint32Array(data)
      } else {
        data = new Uint16Array(data)
      }
    }

    if (isTypedArray(data)) {
      if ((data instanceof Uint8Array) ||
          (data instanceof Uint8ClampedArray)) {
        elements.type = GL_UNSIGNED_BYTE
      } else if (data instanceof Uint16Array) {
        elements.type = GL_UNSIGNED_SHORT
      } else if (data instanceof Uint32Array) {
        check(ext32bit, '32-bit element buffers not supported')
        elements.type = GL_UNSIGNED_INT
      } else {
        check.raise('invalid typed array for element buffer')
      }
      elements.vertCount = data.length
      result.data = data
    } else {
      check(!data, 'invalid element buffer data type')
    }

    if (typeof options === 'object') {
      if ('primitive' in options) {
        var primitive = options.primitive
        check.param(primitive, primTypes)
        elements.primType = primTypes[primitive]
      }

      if ('usage' in options) {
        result.usage = options.usage
      }

      if ('count' in options) {
        elements.vertCount = options.vertCount | 0
      }
    }

    return result
  }

  Object.assign(REGLElementBuffer.prototype, {
    bind: function () {
      gl.bindBuffer(GL_ELEMENT_ARRAY_BUFFER, this.buffer._buffer.buffer)
    },

    destroy: function () {
      if (this.buffer) {
        this.buffer.destroy()
        this.buffer = null
      }
    }
  })

  function createElements (options) {
    var elements = new REGLElementBuffer()

    // Create buffer
    elements.buffer = bufferState.create(
      parseOptions(elements, options),
      GL_ELEMENT_ARRAY_BUFFER)

    function updateElements (options) {
      elements.buffer.udate(parseOptions(elements, options))
      return updateElements
    }

    updateElements._reglType = 'elements'
    updateElements._elements = elements
    updateElements.destroy = function () { elements.destroy() }

    return updateElements
  }

  return {
    create: createElements,
    elements: elements,
    getElements: function (elements) {
      if (elements && elements._elements instanceof REGLElementBuffer) {
        return elements._elements
      }
      return null
    }
  }
}
