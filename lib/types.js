/*
 This file defines the type schema for regl.  The following types are supported:

  * 'any'
  * 'primitive'
  * 'constant'
  * 'instance'
  * 'union'
  * 'tuple'
  * 'record'
  * 'array'
  * 'dict'

*/

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

  // Union types
  union: unionType,
  enum: enumType,
  optional: optionalType,

  // Records and tuples
  tuple: function () {
    return tupleType(Array.prototype.slice.call(arguments))
  },
  shape: shapeType,

  // Dictionaries and lists
  array: arrayType,
  dict: dictType

}, primitiveTypes)

// Main REGL type class

function REGLType (typeClass, props, id) {
  this.class = typeClass
  this.props = props
  this.id = id
}
REGLType.prototype.toString = function () { return this.name }

var typeCounter = 0
function type (typeClass, props) {
  return new REGLType(typeClass, props, ++typeCounter)
}

function isType (obj) {
  return obj instanceof REGLType
}

function compareTypes (a, b) { return a.id - b.id }

// Any type

var anyType = type('any', {})

// Primitive types
function primitiveType (type) {
  return type(
    'primitive',
    { primitiveType: type })
}

// Constant types
function createConstant (value) {
  return type(
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
  // Unpack type arguments, unfold unions and fuse any's
  var types = []
  for (var i = 0; i < arguments.length; ++i) {
    var type = arguments[i]
    if (type.class === 'union') {
      types = types.concat(type.props.types)
    } else if (type.class === 'any') {
      return anyType
    } else {
      types.push(type)
    }
  }
  uniq(types, compareTypes)

  var result = unionCache.find(function (cached) {
    return cached.props.types.every(function (type, i) {
      return type === types[i]
    })
  })
  if (!result) {
    result = type(
      'union',
      { types: types })
    unionCache.push(result)
  }
  return result
}

function enumType () {
  return unionType(Array.prototype.map.call(arguments, constantType))
}

function optionalType (type) {
  return unionType(type, primitiveTypes.empty)
}

// Instance types
var instanceCache = []
function instanceType (constructor, subType) {
  subType = subType || anyType
  var result = instanceCache.find(function (cached) {
    return cached.props.constructor === constructor &&
           cached.props.subType === subType
  })
  if (!result) {
    result = type(
      'instance',
      {
        constructor: constructor,
        subType: subType
      })
    instanceCache.push(result)
  }
  return result
}

// Tuple types
var tupleCache = []
function tupleType (types) {
  var result = tupleCache.find(function (cached) {
    return cached.props.types.every(function (type, i) {
      return type === types[i]
    })
  })
  if (!result) {
    result = type(
      'tuple',
      { types: types })
    tupleCache.push(result)
  }
  return result
}

// Shape types
var shapeCache = {}
function shapeType (shape) {
  if (Array.isArray(shape)) {
    return tupleType(shape)
  }

  var keys = Object.keys(shape).sort()
  var types = keys.map(function (key) {
    return shape[key]
  })
  var cacheId = keys.map(function (key, i) {
    return (
      '"' + key
        .replace(/\\/g, '\\\\')
        .replace(/,/g, '\\,') +
      '",' + types[i].id)
  }).join()

  var result = shapeCache[cacheId]
  if (!result) {
    shapeCache[cacheId] = result = type(
      'record',
      {
        props: keys.map(function (key, i) {
          return {
            name: key,
            type: types[i]
          }
        })
      })
  }

  return result
}

// Array types
var arrayCache = {}
function arrayType (itemType) {
  var result = arrayCache[itemType.id]
  if (!result) {
    result = type(
      'array',
      { itemType: itemType })
    arrayCache[itemType.id] = result
  }
  return result
}

// Dictionary types
var dictCache = {}
function dictType (keyType, valueType) {
  if (!valueType) {
    valueType = keyType
    keyType = primitiveTypes.string
  }
  var cache = dictCache[keyType.id] || (dictCache[keyType.id] = {})
  var result = cache[valueType.id]
  if (!result) {
    cache[valueType.id] = result = type(
      'dict',
      {
        keyType: keyType,
        valueType: valueType
      })
  }
  return result
}

module.exports = {
  types: types,
  REGLType: REGLType,
  isType: isType
}
