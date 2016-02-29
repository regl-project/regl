module.exports = function sortNodes (args, terminal) {
  // Sort nodes topologically and transpose edges
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
      visit(input.node, node)
    })
    nodes.push(node)
    if (parent) {
      coarcs.push([parent])
    } else {
      coarcs.push([])
    }
  }
  visit(terminal)

  // Next, cull all nodes which are unreachable from arguments
  var reachable = new Array(nodes.length)
  var toVisit = []
  args.forEach(function (arg) {
    var index = nodes.indexOf(arg)
    if (index >= 0) {
      reachable[index] = true
      toVisit.push(arg)
    }
  })
  for (var i = 0; i < toVisit.length; ++i) {
    coarcs[i].forEach(function (node) {
      var index = nodes.indexOf(node)
      if (!reachable[index]) {
        reachable[index] = true
        toVisit.push(node)
      }
    })
  }

  // Compact node list
  var result = nodes.filter(function (node, i) {
    return !!reachable[i]
  })
  if (result.length > 0) {
    return result
  }
  return [terminal]
}
