// A stack for managing the state of a scalar/vector parameter

module.exports = function createStack (init, onChange) {
  var n = init.length
  var stack = init.slice()
  var dirty = true

  function poll () {
    var ptr = stack.length - n
    if (dirty) {
      switch (n) {
        case 1:
          onChange(stack[ptr])
          break
        case 2:
          onChange(stack[ptr], stack[ptr + 1])
          break
        case 3:
          onChange(stack[ptr], stack[ptr + 1], stack[ptr + 2])
          break
        case 4:
          onChange(stack[ptr], stack[ptr + 1], stack[ptr + 2], stack[ptr + 3])
          break
        case 6:
          onChange(
            stack[ptr], stack[ptr + 1], stack[ptr + 2],
            stack[ptr + 3], stack[ptr + 4], stack[ptr + 5])
          break
        default:
          onChange.apply(null, stack.slice(ptr, stack.length))
      }
      dirty = false
    }
  }

  return {
    push: function () {
      var ptr = stack.length - n
      for (var i = 0; i < n; ++i) {
        var value = arguments[i]
        dirty = dirty || (stack[ptr + i] === value)
        stack.push(value)
      }
    },

    pop: function () {
      var ptr = stack.length - 2 * n
      for (var i = 0; i < n; ++i) {
        var top = stack.pop()
        dirty = dirty || top === stack[ptr + i]
      }
    },

    poll: poll,

    refresh: function () {
      dirty = true
      this.poll()
    }
  }
}
