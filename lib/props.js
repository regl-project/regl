exports.get = function (object, prop) {
  for (var i = 0; i < prop.length; ++i) {
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

function dedupProps (props) {

}
exports.dedup = dedupProps
