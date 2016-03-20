function DynamicVariable () {
}

function defineDynamic () {
  return new DynamicVariable()
}

function isDynamic (x) {
  return x === defineDynamic || x instanceof DynamicVariable
}

function unbox (x) {
  if (x instanceof DynamicVariable) {
    return x
  }
  return new DynamicVariable()
}

module.exports = {
  define: defineDynamic,
  isDynamic: isDynamic,
  unbox: unbox
}
