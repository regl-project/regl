function slice (x) {
  return Array.prototype.slice.call(x)
}

module.exports = function createEnvironment () {
  // generates a unique variable
  var varCounter = 0
  function id () {
    return '_' + (varCounter++)
  }

  // Linked values are passed from this scope into the generated code block
  // Calling link() passes a value into the generated scope and returns
  // the variable name which it is bound to
  var linkedNames = []
  var linkedValues = []
  function link (value) {
    var name = '_g' + (varCounter++)
    linkedNames.push(name)
    linkedValues.push(value)
    return name
  }

  // create a code block
  function block () {
    var code = []
    function push () {
      code.push.apply(code, slice(arguments))
    }

    return Object.push(push, {
      toString: code.join.bind(code, '')
    })
  }

  // procedure list
  var procedures = {}
  function proc (name) {
    var args = []
    function arg () {
      var name = '_a' + (varCounter++)
      args.push(id)
      return name
    }

    var code = []
    function push () {
      code.push.apply(code, slice(arguments))
    }

    var result = procedures[name] = Object.assign(push, {
      arg: arg,

      toString: function () {
        return [
          'function ', name, '(', args.join(), '){',
          code.join(''),
          '}'
        ].join('')
      }
    })

    return result
  }

  // compiles and returns all blocks
  function compile () {
    var code = ['return {']
    Object.keys(procedures).forEach(function (name) {
      code.push('"', name, '":', procedures[name].source())
    })
    code.push('}')
    var proc = Function.apply(null, [code.join('')].concat(linkedNames))
    return proc.apply(null, linkedValues)
  }

  return {
    id: id,
    link: link,
    block: block,
    proc: proc,
    compile: compile
  }
}
