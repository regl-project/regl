function REGLFlowConstant (value) {
  this.value = value
}

function isConstant (object) {
  return object instanceof REGLFlowConstant
}

function REGLFlowArc (node, prop) {
  this.node = node
  this.prop = prop
}

function isArc (object) {
  return object instanceof REGLFlowArc
}

function REGLFlowNode (inputs, func) {
  this.inputs = inputs
  this.func = func
}

function isNode (object) {
  return object instanceof REGLFlowNode
}

function createFlowClass (options) {
  options = options || {}

  // TODO: Parse other properties here
  var onChange = options.change || function () {}

  function createNode () {
    var inputs = Array.prototype.slice.call(arguments).map(function (input) {
      if (isArc(input)) {
        return input
      } else if (typeof input === 'function') {
        if (isNode(input.node)) {
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

module.exports = {
  isConstant: isConstant,
  isArc: isArc,
  isNode: isNode,
  createClass: createFlowClass
}
