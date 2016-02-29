function className (object) {
  return Object.prototype.toString.call(object)
}

function REGLFlowConstant (value) {
  this.value = value
}

function REGLFlowArc (node, prop) {
  this.node = node
  this.prop = prop
}

function REGLFlowNode (inputs, func) {
  this.inputs = inputs
  this.func = func
}

module.exports = function createFlowClass (options) {
  options = options || {}

  // TODO: Parse other properties here
  var onChange = options.change || function () {}

  function createNode () {
    var inputs = Array.prototype.slice.call(arguments).map(function (input) {
      switch (className(input)) {
        case '[object REGLFlowArc]':
          return input
      }
      if (typeof input === 'function') {
        if (className(input.node) === '[object REGLFlowNode]') {
          return new REGLFlowArc(input.node, '')
        }
      }
      return new REGLFlowConstant(input)
    })

    var node = new REGLFlowNode(
      inputs,
      onChange)

    function createArc (prop) {
      return new REGLFlowArc(node, prop || '')
    }
    createArc.node = node

    return createArc
  }

  return createNode
}
