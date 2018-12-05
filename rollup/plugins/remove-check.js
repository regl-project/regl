var falafel = require('falafel')

module.exports = function removeCheck () {
  return {
    transform (code, id) {
      try {
        var result = falafel(code, { ecmaVersion: 6, sourceType: 'module' }, function (node) {
          switch (node.type) {
            case 'CallExpression':
              if (isCheckCall(node.callee)) {
                node.update('')
              }
              break
            case 'ImportDeclaration':
              if (node.specifiers.length === 1 &&
                  isCheckImport(node.specifiers[0])) {
                node.update('')
              }
              break
          }
        })
        return { code: result.toString(), map: { mappings: '' } } // TODO sourcemap support?
      } catch (e) {
        console.log(e.message)
        return null
      }
    }
  }
}

function isCheckCall (node) {
  if (node.type === 'Identifier' && node.name === 'check') {
    return true
  }
  return (
    node.type === 'MemberExpression' &&
    node.object.type === 'Identifier' &&
    node.object.name === 'check')
}

function isCheckImport (node) {
  return node.local.name === 'check'
}
