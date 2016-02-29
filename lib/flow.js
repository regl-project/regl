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
      if (input instanceof REGLFlowArc) {
        return input
      } else if (input instanceof REGLFlowNode) {
        return new REGLFlowArc(input, '')
      } else {
        return new REGLFlowConstant(input)
      }
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
