var createContext = require('./util/create-context')
var createREGL = require('../regl')
var tape = require('tape')
var extend = require('../lib/util/extend')

function toVec4 (type, name) {
  switch (type) {
    case 'vec4':
    case 'ivec4':
    case 'bvec4':
      return 'vec4(' + name + ')'
    case 'vec3':
    case 'ivec3':
    case 'bvec3':
      return 'vec4(' + name + ',1.0)'
    case 'vec2':
    case 'ivec2':
    case 'bvec2':
      return 'vec4(' + name + ',0.0,1.0)'
    case 'float':
    case 'int':
    case 'bool':
      return 'vec4(' + name + ',0,0,1)'
  }
}

function toFrag (type) {
  return [
    'precision mediump float;',
    'uniform ' + type + ' foo[3];',

    'void main () {',
    '  gl_FragColor = ' + toVec4(type, 'foo[0]') + ';',
    // '  gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);',
    '}'
  ].join('\n')
}

tape('uniform array', function (t) {
  var gl = createContext(16, 16)
  var regl = createREGL(
    {
      gl: gl
    })

  var command = {
    depth: { enable: false },
    vert: [
      'precision highp float;',
      'attribute vec2 position;',
      'void main () {',
      '  gl_Position = vec4(position, 0, 1);',
      '}'
    ].join('\n'),

    attributes: {
      position: [
        -4, 0,
        4, -4,
        4, 4
      ]
    },
    primitive: 'triangles',
    count: 3
  }

  regl(extend({
    frag: toFrag('vec4'),
    uniforms: {
      'foo[0]': [1, 0, 0, 1],
      'foo[1]': [0, 1, 0, 1],
      'foo[2]': [0, 0, 1, 1],
      'foo[3]': [0, 0, 1, 1]
    }
  }, command))()

  checkPixel('vec4 type')

  regl.clear({
    color: [0, 0, 0, 1],
    depth: 1
  })

  // vec4 foo
  regl(extend({
    frag: toFrag('vec4'),
    uniforms: {
      'foo': [1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1]
    }
  }, command))()

  checkPixel('vec4 type')

  // vec4 dynamic
  regl(extend({
    frag: toFrag('vec4'),
    uniforms: function (context, props) {
      return props.foo
    }
  }, command))({
    foo: [1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1]
  })

  checkPixel('dynamic type')

  // vec3 foo
  regl(extend({
    frag: toFrag('vec3'),
    uniforms: {
      'foo': [1, 0, 0, 0, 1, 0, 0, 0, 1]
    }
  }, command))()

  checkPixel('vec3 type')

  // vec2 foo
  regl(extend({
    frag: toFrag('vec2'),
    uniforms: {
      'foo': [1, 0, 0, 1, 0, 0]
    }
  }, command))()

  checkPixel('vec2 type')

  // float foo
  regl(extend({
    frag: toFrag('float'),
    uniforms: {
      'foo': [1, 0, 0]
    }
  }, command))()

  checkPixel('float type')

  // ivec4 foo
  regl(extend({
    frag: toFrag('vec4'),
    uniforms: {
      foo: [1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1]
    }
  }, command))()

  checkPixel('ivec4 type')

  // ivec3 foo
  regl(extend({
    frag: toFrag('ivec3'),
    uniforms: {
      'foo': [1, 0, 0, 0, 1, 0, 0, 0, 1]
    }
  }, command))()

  checkPixel('ivec3 type')

  // ivec2 foo
  regl(extend({
    frag: toFrag('ivec2'),
    uniforms: {
      'foo': [1, 0, 0, 1, 0, 0]
    }
  }, command))()

  checkPixel('ivec2 type')

  // int foo
  regl(extend({
    frag: toFrag('int'),
    uniforms: {
      'foo': [1, 0, 0]
    }
  }, command))()

  checkPixel('int type')

  endTest()

  function checkPixel (info) {
    var pixels = regl.read({
      x: 8,
      y: 8,
      width: 1,
      height: 1,
      data: new Uint8Array(4)
    })
    t.equals(pixels[0], 255, info)
    t.equals(pixels[1], 0, info)
    t.equals(pixels[2], 0, info)
    t.equals(pixels[3], 255, info)
  }

  function endTest () {
    regl.destroy()
    t.equals(gl.getError(), 0, 'error ok')
    createContext.destroy(gl)
    t.end()
  }
})
