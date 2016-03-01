var types = require('./types')

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

function createNodeClass (options) {
  options = options || {}

  // TODO: Parse other properties here
  var onChange = options.change || function () {}
  var inputType = options.inputType
  var outputType = options.outputType

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

// Returns all dependencies of a node, sorted in topological (dfs) order
function dependencies (root) {
  var nodes = []
  var coarcs = []
  function visit (node, parent) {
    // FIXME: For large graphs we should use a weakmap instead of scanning
    var index = nodes.indexOf(node)
    if (index >= 0) {
      coarcs[index].push(parent)
      return
    }
    node.inputs.forEach(function (input) {
      if (isArc(input)) {
        visit(input.node, node)
      }
    })
    nodes.push(node)
    if (parent) {
      coarcs.push([parent])
    } else {
      coarcs.push([])
    }
  }
  visit(root)
  return {
    nodes: nodes,
    dependents: coarcs
  }
}

module.exports = {
  isConstant: isConstant,
  isArc: isArc,
  isNode: isNode,
  create: createNodeClass,
  dependencies: dependencies
}
