var falafel = require('falafel')

module.exports = function removeCheck () {
  return {
    transform (code, id) {
      try {
        var result = falafel(code, { ecmaVersion: 6, sourceType: 'module' }, function (node) {
          switch (node.type) {
            // rewrite all variable declarations as import
            case 'VariableDeclaration':
              var requirePath = parseRequire(node.declarations[0])
              if (requirePath) {
                node.update(`import ${node.declarations[0].id.name} from '${requirePath}';`)
              }
              break
            // rewrite all module.exports assignments
            case 'AssignmentExpression':
              if (node.left.type === 'MemberExpression' &&
                node.left.object.name === 'module') {
                node.update(`export default ${node.right.source()};`)
              }
              break
          }
        })
        return { code: result.toString(), map: { mappings: '' } }
      } catch (e) {
        console.log(e.message)
        return null
      }
    }
  }
}

function parseRequire (node) {
  if (!node.init || node.init.type !== 'CallExpression') {
    return
  }
  var callee = node.init.callee
  if (callee.type === 'Identifier' && callee.name === 'require') {
    return node.init.arguments[0].value
  }
  return ''
}
