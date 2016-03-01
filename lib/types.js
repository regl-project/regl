var uniq = require('uniq')

var primitiveTypes = {
  empty: primitiveType('undefined'),
  bool: primitiveType('boolean'),
  number: primitiveType('number'),
  string: primitiveType('string'),
  object: primitiveType('object'),
  func: primitiveType('function')
}

var typedArrayTypes = {}

function typedArrayType (constructor, dtype) {
  var checkTypedArray = instanceType(constructor)
  checkTypedArray.name = 'typedArray.' + dtype
  typedArrayTypes[dtype] = checkTypedArray
}

typedArrayType(Uint8ClampedArray, 'uint8_clamped')
typedArrayType(Uint8Array, 'uint8')
typedArrayType(Uint16Array, 'uint16')
typedArrayType(Uint32Array, 'uint32')
typedArrayType(Int8Array, 'int8')
typedArrayType(Int16Array, 'int16')
typedArrayType(Int32Array, 'int32')
typedArrayType(Float32Array, 'float')
typedArrayType(Float64Array, 'double')

typedArrayTypes.any = unionType(
  typedArrayTypes.uint8_clamped,
  typedArrayTypes.uint8,
  typedArrayTypes.uint16,
  typedArrayTypes.uint32,
  typedArrayTypes.int8,
  typedArrayTypes.int16,
  typedArrayTypes.int32,
  typedArrayTypes.float,
  typedArrayTypes.double)
typedArrayTypes.any.name = 'typedArray'

var arrayBufferType = instanceType(ArrayBuffer)
arrayBufferType.name = 'arrayBuffer'

var types = Object.assign({
  // Typed arrays and array buffers
  typedArray: Object.assign(typedArrayTypes.any, typedArrayTypes),
  arrayBuffer: arrayBufferType,

  // Instance of
  instanceOf: instanceType,

  // Constants
  constant: constantType,

  // Bottom type
  any: anyType,

  // Type union
  union: unionType,

  // Structures
  shape: shapeType,

  // Dictionaries and lists
  array: arrayType,
  dict: dictType

}, primitiveTypes)

// Main REGL type class

function REGLType (name, typeClass, props) {
  this.name = name
  this.class = typeClass
  this.props = props
}
REGLType.prototype.toString = function () { return this.name }

function type (name, typeClass, props) {
  return new REGLType(name, typeClass, props)
}

function isType (obj) {
  return obj instanceof REGLType
}

function compareTypes (a, b) {
  if (a.name < b.name) {
    return -1
  } else if (a.name > b.name) {
    return 1
  }
  return 0
}

// The any type

var anyType = type('any', 'any', {})

// Primitive types

function primitiveType (type) {
  var typeName = type
  if (type === 'undefined') {
    typeName = 'empty'
  } else if (type === 'function') {
    typeName = 'func'
  }
  return type(
    typeName,
    'primitive',
    { primitiveType: type })
}

// Constant types

function createConstant (value) {
  return type(
    'constant(' + (typeof value === 'string'
        ? '"' + value + '"'
        : value) + ')',
    'constant',
    { value: value })
}

var nullConstant = createConstant(null)
var trueConstant = createConstant(true)
var falseConstant = createConstant(false)
var stringConstants = {}
var numberConstants = {}
var otherConstants = []

function constantType (value) {
  if (value === null) {
    return nullConstant
  } else if (value === true) {
    return trueConstant
  } else if (value === false) {
    return falseConstant
  } else if (typeof value === 'string') {
    return stringConstants['_' + value] ||
      (stringConstants['_' + value] = createConstant(value))
  } else if (typeof value === 'number') {
    return numberConstants[value] ||
      (numberConstants[value] = createConstant(value))
  }
  var result = otherConstants.find(function (constant) {
    return constant.props.value === value
  })
  if (!result) {
    result = createConstant(value)
    otherConstants.push(result)
  }
  return result
}

// Union types
var unionCache = []

function unionType () {
  var types = uniq(Array.prototype.slice.call(arguments))
  var result = unionCache.find(function (cached) {
    return cached.props.types.every(function (type, i) {
      return type === types[i]
    })
  })
  if (!result) {
    result = type(
      'union(' + types.map(
        function (type) {
          return type.name
        }).join() + ')',
      'union',
      { types: types })
    unionCache.push(result)
  }
  return result
}

// Instance types
var instanceCache = []
function instanceType (constructor) {
  var result = instanceCache.find(function (cached) {
    return cached.props.constructor === constructor
  })
  if (!result) {
    result = type(
      'instanceOf(' + constructor.name + ')',
      'instance',
      { constructor: constructor })
    instanceCache.push(result)
  }
  return result
}

// Tuple types

function tupleType (args) {

}

function shapeType (shape) {
  if (Array.isArray(shape)) {
    return tupleType(shape)
  }
}

function arrayType (itemType) {
}

function dictType (keyType, valueType) {
  if (!valueType) {
    valueType = keyType
    keyType = primitiveTypes.string
  }
  // foo
}

module.exports = {
  types: types,
  REGLType: REGLType,
  isType: isType
}
