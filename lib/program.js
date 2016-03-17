module.exports = function programState (gl) {
  var GL_FLOAT = gl.FLOAT

  function AttributeRecord () {
    this.x = 0.5
    this.y = 0.5
    this.z = 0.5
    this.w = 0.5

    this.buffer = null
    this.normalized = false
    this.type = GL_FLOAT
    this.offset = 0
    this.stride = 0
    this.divisor = 0
  }

  function AttributeStack () {
    var records = new Array(16)
    for (var i = 0; i < 16; ++i) {
      records[i] = new AttributeRecord()
    }
    this.records = records
    this.top = 0
  }

  AttributeStack.prototype.push = function () {
    var records = this.records
    var top = this.top

    while (records.length <= top) {
      records.push(new AttributeRecord())
    }

    return records[this.top++]
  }

  var shaders = [null]
  var uniforms = {}
  var attributes = {}

  function pushProgram (program) {
    shaders.push(program)
  }

  function popProgram () {
    shaders.pop()
  }

  function defUniform (name) {
    if (name in uniforms) {
      return
    }
    var stack = new Array(16)
    for (var i = 0; i < 16; ++i) {
      stack[i] = 0
    }
    uniforms[name] = stack
  }

  function pushUniform (name, value) {
    var stack = uniforms[name]
    if (typeof value === 'number') {
      stack.push(value)
    } else {
      for (var i = 0; i < value.length; ++i) {
        stack.push(value[i])
      }
    }
  }

  function popUniform (name, count) {
    var stack = uniforms[name]
    stack.length = stack.length - count
  }

  function defAttribute (name) {
    attributes[name] = new AttributeStack()
  }

  function pushAttribute (name, x, y, z, w) {
    var head = attributes[name].push()
    head.x = x
    head.y = y
    head.z = z
    head.w = w
  }

  function pushAttributePointer (name, buffer, offset, stride, divisor) {
    var head = attributes[name].push()
    head.buffer = buffer
    head.offset = offset
    head.stride = stride
    head.divisor = divisor
  }

  function popAttribute (name) {
    attributes[name].top--
  }

  function poll () {
  }

  function refresh () {
  }

  return {
    pushProgram: pushProgram,
    popProgram: popProgram,

    defUniform: defUniform,
    pushUniform: pushUniform,
    popUniform: popUniform,

    defAttribute: defAttribute,
    pushAttribute: pushAttribute,
    pushAttributePointer: pushAttributePointer,
    popAttribute: popAttribute,

    poll: poll,
    refresh: refresh
  }
}
