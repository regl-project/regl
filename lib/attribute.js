var glTypes = require('./constants/dtypes.json')
var check = require('./util/check')

var GL_FLOAT = 5126

module.exports = function wrapAttributeState (
  gl,
  extensions,
  limits,
  bufferState,
  stringStore) {
  var attributeState = {}

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

  var NUM_ATTRIBUTES = limits.maxAttributes
  var attributeBindings = new Array(NUM_ATTRIBUTES)
  for (var i = 0; i < NUM_ATTRIBUTES; ++i) {
    attributeBindings[i] = new AttributeRecord()
  }

  function AttributeStack (name) {
    this.records = []
    this.name = name
  }

  function stackTop (stack) {
    var records = stack.records
    return records[records.length - 1]
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

  function bindAttribute (index, current, attribStack, size) {
    bindAttributeRecord(index, current, stackTop(attribStack), size)
  }

  // ===================================================
  // DEFINE A NEW ATTRIBUTE
  // ===================================================
  function defAttribute (name) {
    var id = stringStore.id(name)
    var result = attributeState[id]
    if (!result) {
      result = attributeState[id] = new AttributeStack(name)
    }
    return result
  }

  function createAttributeBox (name) {
    var stack = [new AttributeRecord()]
    check.saveCommandRef(stack)

    function alloc (data) {
      var box
      if (stack.length <= 0) {
        box = new AttributeRecord()
      } else {
        box = stack.pop()
      }
      if (typeof data === 'number') {
        box.pointer = false
        box.x = data
        box.y = 0
        box.z = 0
        box.w = 0
      } else if (Array.isArray(data)) {
        box.pointer = false
        box.x = data[0]
        box.y = data[1]
        box.z = data[2]
        box.w = data[3]
      } else {
        var buffer = bufferState.getBuffer(data)
        var size = 0
        var stride = 0
        var offset = 0
        var divisor = 0
        var normalized = false
        var type = 0
        if (!buffer) {
          buffer = bufferState.getBuffer(data.buffer)
          check(buffer, 'missing or invalid buffer for attribute "' +
            name + '" called from command ' + box._commandRef)
          size = data.size || 0
          stride = data.stride || 0
          offset = data.offset || 0
          divisor = data.divisor || 0
          normalized = data.normalized || false
          type = 0
          if ('type' in data) {
            type = glTypes[data.type]
          }
        }
        box.pointer = true
        box.buffer = buffer
        box.size = size
        box.offset = offset
        box.stride = stride
        box.divisor = divisor
        box.normalized = normalized
        box.type = type
      }
      return box
    }

    function free (box) {
      stack.push(box)
    }

    return {
      alloc: alloc,
      free: free
    }
  }

  return {
    bindings: attributeBindings,
    bind: bindAttribute,
    bindRecord: bindAttributeRecord,
    def: defAttribute,
    box: createAttributeBox,
    state: attributeState
  }
}
