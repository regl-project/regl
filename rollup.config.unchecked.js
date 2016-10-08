import falafel from 'falafel'
import config from './rollup.config.js'

config.dest = 'dist/regl.unchecked.js'

config.plugins.push({
  transform ( code, id ) {
    try {
      var result = falafel(code, { ecmaVersion: 6, sourceType: 'module' }, function (node) {
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
      return { code: result.toString(), map: { mappings: '' } } // TODO sourcemap support?
    } catch (e) {
      console.log(id)
      console.log(code.slice(0, 100))
      console.error(e.message)
      return null;
    }
  }
});

export default config;

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
