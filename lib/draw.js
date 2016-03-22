var check = require('./check')
var isTypedArray = require('./is-typed-array')

var GL_POINTS = 0
var GL_LINES = 1
var GL_TRIANGLES = 4
var GL_UNSIGNED_BYTE = 5121
var GL_UNSIGNED_SHORT = 5123
var GL_UNSIGNED_INT = 5125

module.exports = function wrapDrawState (gl, extensionState, bufferState) {
  var extensions = extensionState.extensions

  var primitive = [ GL_TRIANGLES ]
  var count = [ 0 ]
  var offset = [ 0 ]
  var instances = [ 0 ]
  var elements = [ null ]

  function REGLElementBuffer () {
    this.buffer = null
    this.primType = -1
    this.vertCount = 0
    this.type = 0
  }

  function parseOptions (elements, options) {
    var ext32bit = extensions.oes_element_index_uint
    elements.primType = -1
    elements.vertCount = 0
    elements.type = 0

    if (Array.isArray(options)) {
      if (options.length === 0) {
        options = null
      } else if (Array.isArray(options[0])) {
        var dim = options[0].length
        if (dim === 1) elements.type = GL_POINTS
        if (dim === 2) elements.type = GL_LINES
        if (dim === 3) elements.type = GL_TRIANGLES
        var i
        var count = 0
        for (i = 0; i < options.length; ++i) {
          count += options[i].length
        }
        var flattened = ext32bit ? new Uint32Array(count) : new Uint16Array(count)
        var ptr = 0
        for (i = 0; i < options.length; ++i) {
          var x = options[i]
          for (var j = 0; j < x.length; ++j) {
            flattened[ptr++] = x[j]
          }
        }
      } else if (ext32bit) {
        options = new Uint32Array(options)
      } else {
        options = new Uint16Array(options)
      }
    }
    if (isTypedArray(options)) {
      if ((options instanceof Uint8Array) ||
          (options instanceof Uint8ClampedArray)) {
        elements.type = GL_UNSIGNED_BYTE
      } else if (options instanceof Uint16Array) {
        elements.type = GL_UNSIGNED_SHORT
      } else if (options instanceof Uint32Array) {
        check(!!extensions.oes_element_index_uint, '32-bit element buffers not supported')
        elements.type = GL_UNSIGNED_INT
      } else {
        check.raise('invalid typed array for element buffer')
      }
      elements.vertCount = options.length
      return options
    }
    return {}
  }

  Object.assign(REGLElementBuffer.prototype, {
    update: function (options) {
      this.buffer(parseOptions(this, options))
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
    elements.buffer = bufferState.create(parseOptions(elements, options))

    function updateElements (options) {
      elements.update(options)
      return updateElements
    }

    updateElements._reglType = 'elements'
    updateElements._elements = elements
    updateElements.destroy = function () { elements.destroy() }

    return updateElements
  }

  return {
    create: createElements,
    primitive: primitive,
    count: count,
    offset: offset,
    instances: instances,
    elements: elements,
    getElements: function (elements) {
      if (elements && elements._elements instanceof REGLElementBuffer) {
        return elements._elements
      }
      return null
    }
  }
}
