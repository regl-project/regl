import dtypes from '../constants/arraytypes.json'
export default function (x) {
  return Object.prototype.toString.call(x) in dtypes
}
