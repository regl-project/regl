module.exports = function wrapUniformState () {
  var uniformState = {}

  function defUniform (name) {
    if (name in uniformState) {
      return
    }
    uniformState[name] = []
  }

  return {
    uniforms: uniformState,
    def: defUniform
  }
}
