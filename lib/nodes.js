'use strict'

function REGLDraw(
  shader,
  uniforms,
  attributes,
  primitiveType,
  offset,
  count) {

  this.shader = shader
  this.uniforms = uniform
  this.attributes = attributes
  this.primitiveType = primitiveType
  this.offset = offset
  this.count = count
}

function REGLList(
  bindings,
  commands) {

  this.bindings = bindings
  this.commands = commands
}

function REGLMap(
  map,
  command) {

  this.map = map
  this.command = command
}

module.exports = {
  Draw: REGLDraw,
  List: REGLList,
  Map: REGLMap
}
