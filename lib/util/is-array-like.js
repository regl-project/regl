import isTypedArray from './is-typed-array'
export default function isArrayLike (s) {
  return Array.isArray(s) || isTypedArray(s)
}
