var VARIABLE_COUNTER = 0

function DynamicVariable (type, data) {
  this.id = (VARIABLE_COUNTER++)
  this.type = type
  this.data = data
}

function defineDynamic (data, path) {
  switch (typeof data) {
    case 'number':
      return new DynamicVariable('arg', data)
    case 'string':
      return new DynamicVariable('prop', data)
    case 'function':
      return new DynamicVariable('func', data)
    default:
      return defineDynamic
  }
}

function isDynamic (x) {
  return x === defineDynamic || x instanceof DynamicVariable
}

function unbox (x, path) {
  if (x instanceof DynamicVariable) {
    return x
  }
  return new DynamicVariable('prop', path)
}

module.exports = {
  define: defineDynamic,
  isDynamic: isDynamic,
  unbox: unbox
}
