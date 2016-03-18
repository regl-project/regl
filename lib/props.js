exports.get = function (object, prop) {
  for (var i = 0; i < prop.length; ++i) {
    if (typeof object !== 'object') {
      return
    }
    object = object[prop[i]]
  }
  return object
}

function listProps (object) {
  var props = Object.keys(object)
  var result = []
  props.forEach(function (prop) {
    if (typeof object[prop] === 'object') {
      listProps(object[prop]).forEach(function (childProp) {
        childProp.unshift(prop)
        result.push(childProp)
      })
    } else {
      result.push([prop])
    }
  })
}
exports.list = listProps

function compareProps (a, b) {
  for (var i = 0; i < a.length; ++i) {
    if (a[i] < b[i]) {
      return -1
    } else if (a[i] > b[i]) {
      return 1
    }
  }
  return a[i].length - b[i].length
}
exports.compareProps = compareProps

function dedupProps (props) {
  props.sort(compareProps)
  var ptr = 1
  for (var i = 1; i < props.length; ++i) {
    if (compareProps(props[i - 1], props[i])) {
      props[ptr++] = props[i]
    }
  }
  props.length = ptr
  return props
}
exports.dedup = dedupProps
