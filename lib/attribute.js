var GL_FLOAT = 5126

function AttributeRecord () {
  this.pointer = false

  this.x = 0.0
  this.y = 0.0
  this.z = 0.0
  this.w = 0.0

  this.buffer = null
  this.size = 0
  this.normalized = false
  this.type = GL_FLOAT
  this.offset = 0
  this.stride = 0
  this.divisor = 0
}

function attributeRecordsEqual (left, right, size) {
  if (!left.pointer) {
    return !right.pointer &&
      left.x === right.x &&
      left.y === right.y &&
      left.z === right.z &&
      left.w === right.w
  } else {
    return right.pointer &&
      left.buffer === right.buffer &&
      left.size === size &&
      left.normalized === right.normalized &&
      left.type === (right.type || right.buffer.dtype || GL_FLOAT) &&
      left.offset === right.offset &&
      left.stride === right.stride &&
      left.divisor === right.divisor
  }
}

function setAttributeRecord (left, right, size) {
  var pointer = left.pointer = right.pointer
  if (pointer) {
    left.buffer = right.buffer
    left.size = size
    left.normalized = right.normalized
    left.type = right.type || right.buffer.dtype || GL_FLOAT
    left.offset = right.offset
    left.stride = right.stride
    left.divisor = right.divisor
  } else {
    left.x = right.x
    left.y = right.y
    left.z = right.z
    left.w = right.w
  }
}

module.exports = function wrapAttributeState (
  gl,
  extensions,
  limits,
  bufferState,
  stringStore) {
  var attributeState = {}

  var NUM_ATTRIBUTES = limits.maxAttributes
  var attributeBindings = new Array(NUM_ATTRIBUTES)
  for (var i = 0; i < NUM_ATTRIBUTES; ++i) {
    attributeBindings[i] = new AttributeRecord()
  }

  function defineAttribute (id) {
    var result = attributeState[id]
    if (!id) {
      result = attributeState[id] = new AttributeRecord()
    }
    return result
  }

  // ===================================================
  // BIND AN ATTRIBUTE
  // ===================================================
  function bindAttributeRecord (index, current, next, insize) {
    var size = next.size || insize
    if (attributeRecordsEqual(current, next, size)) {
      return
    }
    if (!next.pointer) {
      gl.disableVertexAttribArray(index)
      gl.vertexAttrib4f(index, next.x, next.y, next.z, next.w)
    } else {
      gl.enableVertexAttribArray(index)
      next.buffer.bind()
      gl.vertexAttribPointer(
        index,
        size,
        next.type || next.buffer.dtype || GL_FLOAT,
        next.normalized,
        next.stride,
        next.offset)
      var extInstancing = extensions.angle_instanced_arrays
      if (extInstancing) {
        extInstancing.vertexAttribDivisorANGLE(index, next.divisor)
      }
    }
    setAttributeRecord(current, next, size)
  }

  return {
    bindings: attributeBindings,
    bind: bindAttributeRecord,
    def: defineAttribute,
    state: attributeState
  }
}
