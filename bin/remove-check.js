var through2 = require('through2')
var falafel = require('falafel')

function isCheckCall (node) {
  if (node.type === 'Identifier' && node.name === 'check') {
    return true
  }
  return (
    node.type === 'MemberExpression' &&
    node.object.type === 'Identifier' &&
    node.object.name === 'check')
}

function isCheckRequire (node) {
  return node.id.name === 'check'
}

module.exports = function () {
  var data = ''
  return through2(write, end)

  function write (chunk, enc, done) {
    data += chunk
    done()
  }

  function end (done) {
    try {
      var result = falafel(data, function (node) {
        switch (node.type) {
          case 'CallExpression':
            if (isCheckCall(node.callee)) {
              node.update('')
              return
            }
            break
          case 'VariableDeclaration':
            if (node.declarations.length === 1 &&
                isCheckRequire(node.declarations[0])) {
              node.update('')
              return
            }
            break
        }
      })
      this.push(result.toString())
    } catch (e) {
      this.push(data)
    }
    done()
  }
}
