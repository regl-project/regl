(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*
  tags: basic

  <p>This examples renders a spinning textured cube.</p>

 */

var regl = require('../regl')();
var mat4 = require('gl-mat4');

var cubePosition = [[-0.5, +0.5, +0.5], [+0.5, +0.5, +0.5], [+0.5, -0.5, +0.5], [-0.5, -0.5, +0.5], // positive z face.
[+0.5, +0.5, +0.5], [+0.5, +0.5, -0.5], [+0.5, -0.5, -0.5], [+0.5, -0.5, +0.5], // positive x face
[+0.5, +0.5, -0.5], [-0.5, +0.5, -0.5], [-0.5, -0.5, -0.5], [+0.5, -0.5, -0.5], // negative z face
[-0.5, +0.5, -0.5], [-0.5, +0.5, +0.5], [-0.5, -0.5, +0.5], [-0.5, -0.5, -0.5], // negative x face.
[-0.5, +0.5, -0.5], [+0.5, +0.5, -0.5], [+0.5, +0.5, +0.5], [-0.5, +0.5, +0.5], // top face
[-0.5, -0.5, -0.5], [+0.5, -0.5, -0.5], [+0.5, -0.5, +0.5], [-0.5, -0.5, +0.5] // bottom face
];

var cubeUv = [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0], // positive z face.
[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0], // positive x face.
[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0], // negative z face.
[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0], // negative x face.
[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0], // top face
[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0] // bottom face
];

var cubeElements = [[2, 1, 0], [2, 0, 3], // positive z face.
[6, 5, 4], [6, 4, 7], // positive x face.
[10, 9, 8], [10, 8, 11], // negative z face.
[14, 13, 12], [14, 12, 15], // negative x face.
[18, 17, 16], [18, 16, 19], // top face.
[20, 21, 22], [23, 20, 22] // bottom face
];

var drawCube = regl({
  frag: '\n  precision mediump float;\n  varying vec2 vUv;\n  uniform sampler2D tex;\n  void main () {\n    gl_FragColor = texture2D(tex,vUv);\n  }',
  vert: '\n  precision mediump float;\n  attribute vec3 position;\n  attribute vec2 uv;\n  varying vec2 vUv;\n  uniform mat4 projection, view;\n  void main() {\n    vUv = uv;\n    gl_Position = projection * view * vec4(position, 1);\n  }',
  attributes: {
    position: cubePosition,
    uv: cubeUv
  },
  elements: cubeElements,
  uniforms: {
    view: function ({ tick }) {
      var t = 0.01 * tick;
      return mat4.lookAt([], [5 * Math.cos(t), 2.5 * Math.sin(t), 5 * Math.sin(t)], [0, 0.0, 0], [0, 1, 0]);
    },
    projection: function ({ viewportWidth, viewportHeight }) {
      return mat4.perspective([], Math.PI / 4, viewportWidth / viewportHeight, 0.01, 10);
    },
    tex: regl.prop('texture')
  }
});

require('resl')({
  manifest: {
    texture: {
      type: 'image',
      src: 'assets/peppers.png',
      parser: function (data) {
        return regl.texture({
          data: data,
          mag: 'linear',
          min: 'linear'
        });
      }
    }
  },
  onDone: function ({ texture }) {
    regl.frame(function () {
      regl.clear({
        color: [0, 0, 0, 255],
        depth: 1
      });
      drawCube({ texture });
    });
  }
});

},{"../regl":59,"gl-mat4":43,"resl":58}],2:[function(require,module,exports){
var GL_FLOAT = 5126;

function AttributeRecord() {
  this.state = 0;

  this.x = 0.0;
  this.y = 0.0;
  this.z = 0.0;
  this.w = 0.0;

  this.buffer = null;
  this.size = 0;
  this.normalized = false;
  this.type = GL_FLOAT;
  this.offset = 0;
  this.stride = 0;
  this.divisor = 0;
}

module.exports = function wrapAttributeState(gl, extensions, limits, bufferState, stringStore) {
  var NUM_ATTRIBUTES = limits.maxAttributes;
  var attributeBindings = new Array(NUM_ATTRIBUTES);
  for (var i = 0; i < NUM_ATTRIBUTES; ++i) {
    attributeBindings[i] = new AttributeRecord();
  }

  return {
    Record: AttributeRecord,
    scope: {},
    state: attributeBindings
  };
};

},{}],3:[function(require,module,exports){

var isTypedArray = require('./util/is-typed-array');
var isNDArrayLike = require('./util/is-ndarray');
var values = require('./util/values');
var pool = require('./util/pool');
var flattenUtil = require('./util/flatten');

var arrayFlatten = flattenUtil.flatten;
var arrayShape = flattenUtil.shape;

var arrayTypes = require('./constants/arraytypes.json');
var bufferTypes = require('./constants/dtypes.json');
var usageTypes = require('./constants/usage.json');

var GL_STATIC_DRAW = 0x88E4;
var GL_STREAM_DRAW = 0x88E0;

var GL_UNSIGNED_BYTE = 5121;
var GL_FLOAT = 5126;

var DTYPES_SIZES = [];
DTYPES_SIZES[5120] = 1; // int8
DTYPES_SIZES[5122] = 2; // int16
DTYPES_SIZES[5124] = 4; // int32
DTYPES_SIZES[5121] = 1; // uint8
DTYPES_SIZES[5123] = 2; // uint16
DTYPES_SIZES[5125] = 4; // uint32
DTYPES_SIZES[5126] = 4; // float32

function typedArrayCode(data) {
  return arrayTypes[Object.prototype.toString.call(data)] | 0;
}

function copyArray(out, inp) {
  for (var i = 0; i < inp.length; ++i) {
    out[i] = inp[i];
  }
}

function transpose(result, data, shapeX, shapeY, strideX, strideY, offset) {
  var ptr = 0;
  for (var i = 0; i < shapeX; ++i) {
    for (var j = 0; j < shapeY; ++j) {
      result[ptr++] = data[strideX * i + strideY * j + offset];
    }
  }
}

module.exports = function wrapBufferState(gl, stats, config) {
  var bufferCount = 0;
  var bufferSet = {};

  function REGLBuffer(type) {
    this.id = bufferCount++;
    this.buffer = gl.createBuffer();
    this.type = type;
    this.usage = GL_STATIC_DRAW;
    this.byteLength = 0;
    this.dimension = 1;
    this.dtype = GL_UNSIGNED_BYTE;

    this.persistentData = null;

    if (config.profile) {
      this.stats = { size: 0 };
    }
  }

  REGLBuffer.prototype.bind = function () {
    gl.bindBuffer(this.type, this.buffer);
  };

  REGLBuffer.prototype.destroy = function () {
    destroy(this);
  };

  var streamPool = [];

  function createStream(type, data) {
    var buffer = streamPool.pop();
    if (!buffer) {
      buffer = new REGLBuffer(type);
    }
    buffer.bind();
    initBufferFromData(buffer, data, GL_STREAM_DRAW, 0, 1, false);
    return buffer;
  }

  function destroyStream(stream) {
    streamPool.push(stream);
  }

  function initBufferFromTypedArray(buffer, data, usage) {
    buffer.byteLength = data.byteLength;
    gl.bufferData(buffer.type, data, usage);
  }

  function initBufferFromData(buffer, data, usage, dtype, dimension, persist) {
    var shape;
    buffer.usage = usage;
    if (Array.isArray(data)) {
      buffer.dtype = dtype || GL_FLOAT;
      if (data.length > 0) {
        var flatData;
        if (Array.isArray(data[0])) {
          shape = arrayShape(data);
          var dim = 1;
          for (var i = 1; i < shape.length; ++i) {
            dim *= shape[i];
          }
          buffer.dimension = dim;
          flatData = arrayFlatten(data, shape, buffer.dtype);
          initBufferFromTypedArray(buffer, flatData, usage);
          if (persist) {
            buffer.persistentData = flatData;
          } else {
            pool.freeType(flatData);
          }
        } else if (typeof data[0] === 'number') {
          buffer.dimension = dimension;
          var typedData = pool.allocType(buffer.dtype, data.length);
          copyArray(typedData, data);
          initBufferFromTypedArray(buffer, typedData, usage);
          if (persist) {
            buffer.persistentData = typedData;
          } else {
            pool.freeType(typedData);
          }
        } else if (isTypedArray(data[0])) {
          buffer.dimension = data[0].length;
          buffer.dtype = dtype || typedArrayCode(data[0]) || GL_FLOAT;
          flatData = arrayFlatten(data, [data.length, data[0].length], buffer.dtype);
          initBufferFromTypedArray(buffer, flatData, usage);
          if (persist) {
            buffer.persistentData = flatData;
          } else {
            pool.freeType(flatData);
          }
        } else {}
      }
    } else if (isTypedArray(data)) {
      buffer.dtype = dtype || typedArrayCode(data);
      buffer.dimension = dimension;
      initBufferFromTypedArray(buffer, data, usage);
      if (persist) {
        buffer.persistentData = new Uint8Array(new Uint8Array(data.buffer));
      }
    } else if (isNDArrayLike(data)) {
      shape = data.shape;
      var stride = data.stride;
      var offset = data.offset;

      var shapeX = 0;
      var shapeY = 0;
      var strideX = 0;
      var strideY = 0;
      if (shape.length === 1) {
        shapeX = shape[0];
        shapeY = 1;
        strideX = stride[0];
        strideY = 0;
      } else if (shape.length === 2) {
        shapeX = shape[0];
        shapeY = shape[1];
        strideX = stride[0];
        strideY = stride[1];
      } else {}

      buffer.dtype = dtype || typedArrayCode(data.data) || GL_FLOAT;
      buffer.dimension = shapeY;

      var transposeData = pool.allocType(buffer.dtype, shapeX * shapeY);
      transpose(transposeData, data.data, shapeX, shapeY, strideX, strideY, offset);
      initBufferFromTypedArray(buffer, transposeData, usage);
      if (persist) {
        buffer.persistentData = transposeData;
      } else {
        pool.freeType(transposeData);
      }
    } else {}
  }

  function destroy(buffer) {
    stats.bufferCount--;

    var handle = buffer.buffer;

    gl.deleteBuffer(handle);
    buffer.buffer = null;
    delete bufferSet[buffer.id];
  }

  function createBuffer(options, type, deferInit, persistent) {
    stats.bufferCount++;

    var buffer = new REGLBuffer(type);
    bufferSet[buffer.id] = buffer;

    function reglBuffer(options) {
      var usage = GL_STATIC_DRAW;
      var data = null;
      var byteLength = 0;
      var dtype = 0;
      var dimension = 1;
      if (Array.isArray(options) || isTypedArray(options) || isNDArrayLike(options)) {
        data = options;
      } else if (typeof options === 'number') {
        byteLength = options | 0;
      } else if (options) {

        if ('data' in options) {

          data = options.data;
        }

        if ('usage' in options) {

          usage = usageTypes[options.usage];
        }

        if ('type' in options) {

          dtype = bufferTypes[options.type];
        }

        if ('dimension' in options) {

          dimension = options.dimension | 0;
        }

        if ('length' in options) {

          byteLength = options.length | 0;
        }
      }

      buffer.bind();
      if (!data) {
        gl.bufferData(buffer.type, byteLength, usage);
        buffer.dtype = dtype || GL_UNSIGNED_BYTE;
        buffer.usage = usage;
        buffer.dimension = dimension;
        buffer.byteLength = byteLength;
      } else {
        initBufferFromData(buffer, data, usage, dtype, dimension, persistent);
      }

      if (config.profile) {
        buffer.stats.size = buffer.byteLength * DTYPES_SIZES[buffer.dtype];
      }

      return reglBuffer;
    }

    function setSubData(data, offset) {

      gl.bufferSubData(buffer.type, offset, data);
    }

    function subdata(data, offset_) {
      var offset = (offset_ || 0) | 0;
      var shape;
      buffer.bind();
      if (Array.isArray(data)) {
        if (data.length > 0) {
          if (typeof data[0] === 'number') {
            var converted = pool.allocType(buffer.dtype, data.length);
            copyArray(converted, data);
            setSubData(converted, offset);
            pool.freeType(converted);
          } else if (Array.isArray(data[0]) || isTypedArray(data[0])) {
            shape = arrayShape(data);
            var flatData = arrayFlatten(data, shape, buffer.dtype);
            setSubData(flatData, offset);
            pool.freeType(flatData);
          } else {}
        }
      } else if (isTypedArray(data)) {
        setSubData(data, offset);
      } else if (isNDArrayLike(data)) {
        shape = data.shape;
        var stride = data.stride;

        var shapeX = 0;
        var shapeY = 0;
        var strideX = 0;
        var strideY = 0;
        if (shape.length === 1) {
          shapeX = shape[0];
          shapeY = 1;
          strideX = stride[0];
          strideY = 0;
        } else if (shape.length === 2) {
          shapeX = shape[0];
          shapeY = shape[1];
          strideX = stride[0];
          strideY = stride[1];
        } else {}
        var dtype = Array.isArray(data.data) ? buffer.dtype : typedArrayCode(data.data);

        var transposeData = pool.allocType(dtype, shapeX * shapeY);
        transpose(transposeData, data.data, shapeX, shapeY, strideX, strideY, data.offset);
        setSubData(transposeData, offset);
        pool.freeType(transposeData);
      } else {}
      return reglBuffer;
    }

    if (!deferInit) {
      reglBuffer(options);
    }

    reglBuffer._reglType = 'buffer';
    reglBuffer._buffer = buffer;
    reglBuffer.subdata = subdata;
    if (config.profile) {
      reglBuffer.stats = buffer.stats;
    }
    reglBuffer.destroy = function () {
      destroy(buffer);
    };

    return reglBuffer;
  }

  function restoreBuffers() {
    values(bufferSet).forEach(function (buffer) {
      buffer.buffer = gl.createBuffer();
      gl.bindBuffer(buffer.type, buffer.buffer);
      gl.bufferData(buffer.type, buffer.persistentData || buffer.byteLength, buffer.usage);
    });
  }

  if (config.profile) {
    stats.getTotalBufferSize = function () {
      var total = 0;
      // TODO: Right now, the streams are not part of the total count.
      Object.keys(bufferSet).forEach(function (key) {
        total += bufferSet[key].stats.size;
      });
      return total;
    };
  }

  return {
    create: createBuffer,

    createStream: createStream,
    destroyStream: destroyStream,

    clear: function () {
      values(bufferSet).forEach(destroy);
      streamPool.forEach(destroy);
    },

    getBuffer: function (wrapper) {
      if (wrapper && wrapper._buffer instanceof REGLBuffer) {
        return wrapper._buffer;
      }
      return null;
    },

    restore: restoreBuffers,

    _initBuffer: initBufferFromData
  };
};

},{"./constants/arraytypes.json":4,"./constants/dtypes.json":5,"./constants/usage.json":7,"./util/flatten":24,"./util/is-ndarray":26,"./util/is-typed-array":27,"./util/pool":29,"./util/values":32}],4:[function(require,module,exports){
module.exports={
  "[object Int8Array]": 5120
, "[object Int16Array]": 5122
, "[object Int32Array]": 5124
, "[object Uint8Array]": 5121
, "[object Uint8ClampedArray]": 5121
, "[object Uint16Array]": 5123
, "[object Uint32Array]": 5125
, "[object Float32Array]": 5126
, "[object Float64Array]": 5121
, "[object ArrayBuffer]": 5121
}

},{}],5:[function(require,module,exports){
module.exports={
  "int8": 5120
, "int16": 5122
, "int32": 5124
, "uint8": 5121
, "uint16": 5123
, "uint32": 5125
, "float": 5126
, "float32": 5126
}

},{}],6:[function(require,module,exports){
module.exports={
  "points": 0,
  "point": 0,
  "lines": 1,
  "line": 1,
  "line loop": 2,
  "line strip": 3,
  "triangles": 4,
  "triangle": 4,
  "triangle strip": 5,
  "triangle fan": 6
}

},{}],7:[function(require,module,exports){
module.exports={
  "static": 35044,
  "dynamic": 35048,
  "stream": 35040
}

},{}],8:[function(require,module,exports){

var createEnvironment = require('./util/codegen');
var loop = require('./util/loop');
var isTypedArray = require('./util/is-typed-array');
var isNDArray = require('./util/is-ndarray');
var isArrayLike = require('./util/is-array-like');
var dynamic = require('./dynamic');

var primTypes = require('./constants/primitives.json');
var glTypes = require('./constants/dtypes.json');

// "cute" names for vector components
var CUTE_COMPONENTS = 'xyzw'.split('');

var GL_UNSIGNED_BYTE = 5121;

var ATTRIB_STATE_POINTER = 1;
var ATTRIB_STATE_CONSTANT = 2;

var DYN_FUNC = 0;
var DYN_PROP = 1;
var DYN_CONTEXT = 2;
var DYN_STATE = 3;
var DYN_THUNK = 4;

var S_DITHER = 'dither';
var S_BLEND_ENABLE = 'blend.enable';
var S_BLEND_COLOR = 'blend.color';
var S_BLEND_EQUATION = 'blend.equation';
var S_BLEND_FUNC = 'blend.func';
var S_DEPTH_ENABLE = 'depth.enable';
var S_DEPTH_FUNC = 'depth.func';
var S_DEPTH_RANGE = 'depth.range';
var S_DEPTH_MASK = 'depth.mask';
var S_COLOR_MASK = 'colorMask';
var S_CULL_ENABLE = 'cull.enable';
var S_CULL_FACE = 'cull.face';
var S_FRONT_FACE = 'frontFace';
var S_LINE_WIDTH = 'lineWidth';
var S_POLYGON_OFFSET_ENABLE = 'polygonOffset.enable';
var S_POLYGON_OFFSET_OFFSET = 'polygonOffset.offset';
var S_SAMPLE_ALPHA = 'sample.alpha';
var S_SAMPLE_ENABLE = 'sample.enable';
var S_SAMPLE_COVERAGE = 'sample.coverage';
var S_STENCIL_ENABLE = 'stencil.enable';
var S_STENCIL_MASK = 'stencil.mask';
var S_STENCIL_FUNC = 'stencil.func';
var S_STENCIL_OPFRONT = 'stencil.opFront';
var S_STENCIL_OPBACK = 'stencil.opBack';
var S_SCISSOR_ENABLE = 'scissor.enable';
var S_SCISSOR_BOX = 'scissor.box';
var S_VIEWPORT = 'viewport';

var S_PROFILE = 'profile';

var S_FRAMEBUFFER = 'framebuffer';
var S_VERT = 'vert';
var S_FRAG = 'frag';
var S_ELEMENTS = 'elements';
var S_PRIMITIVE = 'primitive';
var S_COUNT = 'count';
var S_OFFSET = 'offset';
var S_INSTANCES = 'instances';

var SUFFIX_WIDTH = 'Width';
var SUFFIX_HEIGHT = 'Height';

var S_FRAMEBUFFER_WIDTH = S_FRAMEBUFFER + SUFFIX_WIDTH;
var S_FRAMEBUFFER_HEIGHT = S_FRAMEBUFFER + SUFFIX_HEIGHT;
var S_VIEWPORT_WIDTH = S_VIEWPORT + SUFFIX_WIDTH;
var S_VIEWPORT_HEIGHT = S_VIEWPORT + SUFFIX_HEIGHT;
var S_DRAWINGBUFFER = 'drawingBuffer';
var S_DRAWINGBUFFER_WIDTH = S_DRAWINGBUFFER + SUFFIX_WIDTH;
var S_DRAWINGBUFFER_HEIGHT = S_DRAWINGBUFFER + SUFFIX_HEIGHT;

var NESTED_OPTIONS = [S_BLEND_FUNC, S_BLEND_EQUATION, S_STENCIL_FUNC, S_STENCIL_OPFRONT, S_STENCIL_OPBACK, S_SAMPLE_COVERAGE, S_VIEWPORT, S_SCISSOR_BOX, S_POLYGON_OFFSET_OFFSET];

var GL_ARRAY_BUFFER = 34962;
var GL_ELEMENT_ARRAY_BUFFER = 34963;

var GL_FRAGMENT_SHADER = 35632;
var GL_VERTEX_SHADER = 35633;

var GL_TEXTURE_2D = 0x0DE1;
var GL_TEXTURE_CUBE_MAP = 0x8513;

var GL_CULL_FACE = 0x0B44;
var GL_BLEND = 0x0BE2;
var GL_DITHER = 0x0BD0;
var GL_STENCIL_TEST = 0x0B90;
var GL_DEPTH_TEST = 0x0B71;
var GL_SCISSOR_TEST = 0x0C11;
var GL_POLYGON_OFFSET_FILL = 0x8037;
var GL_SAMPLE_ALPHA_TO_COVERAGE = 0x809E;
var GL_SAMPLE_COVERAGE = 0x80A0;

var GL_FLOAT = 5126;
var GL_FLOAT_VEC2 = 35664;
var GL_FLOAT_VEC3 = 35665;
var GL_FLOAT_VEC4 = 35666;
var GL_INT = 5124;
var GL_INT_VEC2 = 35667;
var GL_INT_VEC3 = 35668;
var GL_INT_VEC4 = 35669;
var GL_BOOL = 35670;
var GL_BOOL_VEC2 = 35671;
var GL_BOOL_VEC3 = 35672;
var GL_BOOL_VEC4 = 35673;
var GL_FLOAT_MAT2 = 35674;
var GL_FLOAT_MAT3 = 35675;
var GL_FLOAT_MAT4 = 35676;
var GL_SAMPLER_2D = 35678;
var GL_SAMPLER_CUBE = 35680;

var GL_TRIANGLES = 4;

var GL_FRONT = 1028;
var GL_BACK = 1029;
var GL_CW = 0x0900;
var GL_CCW = 0x0901;
var GL_MIN_EXT = 0x8007;
var GL_MAX_EXT = 0x8008;
var GL_ALWAYS = 519;
var GL_KEEP = 7680;
var GL_ZERO = 0;
var GL_ONE = 1;
var GL_FUNC_ADD = 0x8006;
var GL_LESS = 513;

var GL_FRAMEBUFFER = 0x8D40;
var GL_COLOR_ATTACHMENT0 = 0x8CE0;

var blendFuncs = {
  '0': 0,
  '1': 1,
  'zero': 0,
  'one': 1,
  'src color': 768,
  'one minus src color': 769,
  'src alpha': 770,
  'one minus src alpha': 771,
  'dst color': 774,
  'one minus dst color': 775,
  'dst alpha': 772,
  'one minus dst alpha': 773,
  'constant color': 32769,
  'one minus constant color': 32770,
  'constant alpha': 32771,
  'one minus constant alpha': 32772,
  'src alpha saturate': 776
};

// There are invalid values for srcRGB and dstRGB. See:
// https://www.khronos.org/registry/webgl/specs/1.0/#6.13
// https://github.com/KhronosGroup/WebGL/blob/0d3201f5f7ec3c0060bc1f04077461541f1987b9/conformance-suites/1.0.3/conformance/misc/webgl-specific.html#L56
var invalidBlendCombinations = ['constant color, constant alpha', 'one minus constant color, constant alpha', 'constant color, one minus constant alpha', 'one minus constant color, one minus constant alpha', 'constant alpha, constant color', 'constant alpha, one minus constant color', 'one minus constant alpha, constant color', 'one minus constant alpha, one minus constant color'];

var compareFuncs = {
  'never': 512,
  'less': 513,
  '<': 513,
  'equal': 514,
  '=': 514,
  '==': 514,
  '===': 514,
  'lequal': 515,
  '<=': 515,
  'greater': 516,
  '>': 516,
  'notequal': 517,
  '!=': 517,
  '!==': 517,
  'gequal': 518,
  '>=': 518,
  'always': 519
};

var stencilOps = {
  '0': 0,
  'zero': 0,
  'keep': 7680,
  'replace': 7681,
  'increment': 7682,
  'decrement': 7683,
  'increment wrap': 34055,
  'decrement wrap': 34056,
  'invert': 5386
};

var shaderType = {
  'frag': GL_FRAGMENT_SHADER,
  'vert': GL_VERTEX_SHADER
};

var orientationType = {
  'cw': GL_CW,
  'ccw': GL_CCW
};

function isBufferArgs(x) {
  return Array.isArray(x) || isTypedArray(x) || isNDArray(x);
}

// Make sure viewport is processed first
function sortState(state) {
  return state.sort(function (a, b) {
    if (a === S_VIEWPORT) {
      return -1;
    } else if (b === S_VIEWPORT) {
      return 1;
    }
    return a < b ? -1 : 1;
  });
}

function Declaration(thisDep, contextDep, propDep, append) {
  this.thisDep = thisDep;
  this.contextDep = contextDep;
  this.propDep = propDep;
  this.append = append;
}

function isStatic(decl) {
  return decl && !(decl.thisDep || decl.contextDep || decl.propDep);
}

function createStaticDecl(append) {
  return new Declaration(false, false, false, append);
}

function createDynamicDecl(dyn, append) {
  var type = dyn.type;
  if (type === DYN_FUNC) {
    var numArgs = dyn.data.length;
    return new Declaration(true, numArgs >= 1, numArgs >= 2, append);
  } else if (type === DYN_THUNK) {
    var data = dyn.data;
    return new Declaration(data.thisDep, data.contextDep, data.propDep, append);
  } else {
    return new Declaration(type === DYN_STATE, type === DYN_CONTEXT, type === DYN_PROP, append);
  }
}

var SCOPE_DECL = new Declaration(false, false, false, function () {});

module.exports = function reglCore(gl, stringStore, extensions, limits, bufferState, elementState, textureState, framebufferState, uniformState, attributeState, shaderState, drawState, contextState, timer, config) {
  var AttributeRecord = attributeState.Record;

  var blendEquations = {
    'add': 32774,
    'subtract': 32778,
    'reverse subtract': 32779
  };
  if (extensions.ext_blend_minmax) {
    blendEquations.min = GL_MIN_EXT;
    blendEquations.max = GL_MAX_EXT;
  }

  var extInstancing = extensions.angle_instanced_arrays;
  var extDrawBuffers = extensions.webgl_draw_buffers;

  // ===================================================
  // ===================================================
  // WEBGL STATE
  // ===================================================
  // ===================================================
  var currentState = {
    dirty: true,
    profile: config.profile
  };
  var nextState = {};
  var GL_STATE_NAMES = [];
  var GL_FLAGS = {};
  var GL_VARIABLES = {};

  function propName(name) {
    return name.replace('.', '_');
  }

  function stateFlag(sname, cap, init) {
    var name = propName(sname);
    GL_STATE_NAMES.push(sname);
    nextState[name] = currentState[name] = !!init;
    GL_FLAGS[name] = cap;
  }

  function stateVariable(sname, func, init) {
    var name = propName(sname);
    GL_STATE_NAMES.push(sname);
    if (Array.isArray(init)) {
      currentState[name] = init.slice();
      nextState[name] = init.slice();
    } else {
      currentState[name] = nextState[name] = init;
    }
    GL_VARIABLES[name] = func;
  }

  // Dithering
  stateFlag(S_DITHER, GL_DITHER);

  // Blending
  stateFlag(S_BLEND_ENABLE, GL_BLEND);
  stateVariable(S_BLEND_COLOR, 'blendColor', [0, 0, 0, 0]);
  stateVariable(S_BLEND_EQUATION, 'blendEquationSeparate', [GL_FUNC_ADD, GL_FUNC_ADD]);
  stateVariable(S_BLEND_FUNC, 'blendFuncSeparate', [GL_ONE, GL_ZERO, GL_ONE, GL_ZERO]);

  // Depth
  stateFlag(S_DEPTH_ENABLE, GL_DEPTH_TEST, true);
  stateVariable(S_DEPTH_FUNC, 'depthFunc', GL_LESS);
  stateVariable(S_DEPTH_RANGE, 'depthRange', [0, 1]);
  stateVariable(S_DEPTH_MASK, 'depthMask', true);

  // Color mask
  stateVariable(S_COLOR_MASK, S_COLOR_MASK, [true, true, true, true]);

  // Face culling
  stateFlag(S_CULL_ENABLE, GL_CULL_FACE);
  stateVariable(S_CULL_FACE, 'cullFace', GL_BACK);

  // Front face orientation
  stateVariable(S_FRONT_FACE, S_FRONT_FACE, GL_CCW);

  // Line width
  stateVariable(S_LINE_WIDTH, S_LINE_WIDTH, 1);

  // Polygon offset
  stateFlag(S_POLYGON_OFFSET_ENABLE, GL_POLYGON_OFFSET_FILL);
  stateVariable(S_POLYGON_OFFSET_OFFSET, 'polygonOffset', [0, 0]);

  // Sample coverage
  stateFlag(S_SAMPLE_ALPHA, GL_SAMPLE_ALPHA_TO_COVERAGE);
  stateFlag(S_SAMPLE_ENABLE, GL_SAMPLE_COVERAGE);
  stateVariable(S_SAMPLE_COVERAGE, 'sampleCoverage', [1, false]);

  // Stencil
  stateFlag(S_STENCIL_ENABLE, GL_STENCIL_TEST);
  stateVariable(S_STENCIL_MASK, 'stencilMask', -1);
  stateVariable(S_STENCIL_FUNC, 'stencilFunc', [GL_ALWAYS, 0, -1]);
  stateVariable(S_STENCIL_OPFRONT, 'stencilOpSeparate', [GL_FRONT, GL_KEEP, GL_KEEP, GL_KEEP]);
  stateVariable(S_STENCIL_OPBACK, 'stencilOpSeparate', [GL_BACK, GL_KEEP, GL_KEEP, GL_KEEP]);

  // Scissor
  stateFlag(S_SCISSOR_ENABLE, GL_SCISSOR_TEST);
  stateVariable(S_SCISSOR_BOX, 'scissor', [0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight]);

  // Viewport
  stateVariable(S_VIEWPORT, S_VIEWPORT, [0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight]);

  // ===================================================
  // ===================================================
  // ENVIRONMENT
  // ===================================================
  // ===================================================
  var sharedState = {
    gl: gl,
    context: contextState,
    strings: stringStore,
    next: nextState,
    current: currentState,
    draw: drawState,
    elements: elementState,
    buffer: bufferState,
    shader: shaderState,
    attributes: attributeState.state,
    uniforms: uniformState,
    framebuffer: framebufferState,
    extensions: extensions,

    timer: timer,
    isBufferArgs: isBufferArgs
  };

  var sharedConstants = {
    primTypes: primTypes,
    compareFuncs: compareFuncs,
    blendFuncs: blendFuncs,
    blendEquations: blendEquations,
    stencilOps: stencilOps,
    glTypes: glTypes,
    orientationType: orientationType
  };

  if (extDrawBuffers) {
    sharedConstants.backBuffer = [GL_BACK];
    sharedConstants.drawBuffer = loop(limits.maxDrawbuffers, function (i) {
      if (i === 0) {
        return [0];
      }
      return loop(i, function (j) {
        return GL_COLOR_ATTACHMENT0 + j;
      });
    });
  }

  var drawCallCounter = 0;
  function createREGLEnvironment() {
    var env = createEnvironment();
    var link = env.link;
    var global = env.global;
    env.id = drawCallCounter++;

    env.batchId = '0';

    // link shared state
    var SHARED = link(sharedState);
    var shared = env.shared = {
      props: 'a0'
    };
    Object.keys(sharedState).forEach(function (prop) {
      shared[prop] = global.def(SHARED, '.', prop);
    });

    // Inject runtime assertion stuff for debug builds


    // Copy GL state variables over
    var nextVars = env.next = {};
    var currentVars = env.current = {};
    Object.keys(GL_VARIABLES).forEach(function (variable) {
      if (Array.isArray(currentState[variable])) {
        nextVars[variable] = global.def(shared.next, '.', variable);
        currentVars[variable] = global.def(shared.current, '.', variable);
      }
    });

    // Initialize shared constants
    var constants = env.constants = {};
    Object.keys(sharedConstants).forEach(function (name) {
      constants[name] = global.def(JSON.stringify(sharedConstants[name]));
    });

    // Helper function for calling a block
    env.invoke = function (block, x) {
      switch (x.type) {
        case DYN_FUNC:
          var argList = ['this', shared.context, shared.props, env.batchId];
          return block.def(link(x.data), '.call(', argList.slice(0, Math.max(x.data.length + 1, 4)), ')');
        case DYN_PROP:
          return block.def(shared.props, x.data);
        case DYN_CONTEXT:
          return block.def(shared.context, x.data);
        case DYN_STATE:
          return block.def('this', x.data);
        case DYN_THUNK:
          x.data.append(env, block);
          return x.data.ref;
      }
    };

    env.attribCache = {};

    var scopeAttribs = {};
    env.scopeAttrib = function (name) {
      var id = stringStore.id(name);
      if (id in scopeAttribs) {
        return scopeAttribs[id];
      }
      var binding = attributeState.scope[id];
      if (!binding) {
        binding = attributeState.scope[id] = new AttributeRecord();
      }
      var result = scopeAttribs[id] = link(binding);
      return result;
    };

    return env;
  }

  // ===================================================
  // ===================================================
  // PARSING
  // ===================================================
  // ===================================================
  function parseProfile(options) {
    var staticOptions = options.static;
    var dynamicOptions = options.dynamic;

    var profileEnable;
    if (S_PROFILE in staticOptions) {
      var value = !!staticOptions[S_PROFILE];
      profileEnable = createStaticDecl(function (env, scope) {
        return value;
      });
      profileEnable.enable = value;
    } else if (S_PROFILE in dynamicOptions) {
      var dyn = dynamicOptions[S_PROFILE];
      profileEnable = createDynamicDecl(dyn, function (env, scope) {
        return env.invoke(scope, dyn);
      });
    }

    return profileEnable;
  }

  function parseFramebuffer(options, env) {
    var staticOptions = options.static;
    var dynamicOptions = options.dynamic;

    if (S_FRAMEBUFFER in staticOptions) {
      var framebuffer = staticOptions[S_FRAMEBUFFER];
      if (framebuffer) {
        framebuffer = framebufferState.getFramebuffer(framebuffer);

        return createStaticDecl(function (env, block) {
          var FRAMEBUFFER = env.link(framebuffer);
          var shared = env.shared;
          block.set(shared.framebuffer, '.next', FRAMEBUFFER);
          var CONTEXT = shared.context;
          block.set(CONTEXT, '.' + S_FRAMEBUFFER_WIDTH, FRAMEBUFFER + '.width');
          block.set(CONTEXT, '.' + S_FRAMEBUFFER_HEIGHT, FRAMEBUFFER + '.height');
          return FRAMEBUFFER;
        });
      } else {
        return createStaticDecl(function (env, scope) {
          var shared = env.shared;
          scope.set(shared.framebuffer, '.next', 'null');
          var CONTEXT = shared.context;
          scope.set(CONTEXT, '.' + S_FRAMEBUFFER_WIDTH, CONTEXT + '.' + S_DRAWINGBUFFER_WIDTH);
          scope.set(CONTEXT, '.' + S_FRAMEBUFFER_HEIGHT, CONTEXT + '.' + S_DRAWINGBUFFER_HEIGHT);
          return 'null';
        });
      }
    } else if (S_FRAMEBUFFER in dynamicOptions) {
      var dyn = dynamicOptions[S_FRAMEBUFFER];
      return createDynamicDecl(dyn, function (env, scope) {
        var FRAMEBUFFER_FUNC = env.invoke(scope, dyn);
        var shared = env.shared;
        var FRAMEBUFFER_STATE = shared.framebuffer;
        var FRAMEBUFFER = scope.def(FRAMEBUFFER_STATE, '.getFramebuffer(', FRAMEBUFFER_FUNC, ')');

        scope.set(FRAMEBUFFER_STATE, '.next', FRAMEBUFFER);
        var CONTEXT = shared.context;
        scope.set(CONTEXT, '.' + S_FRAMEBUFFER_WIDTH, FRAMEBUFFER + '?' + FRAMEBUFFER + '.width:' + CONTEXT + '.' + S_DRAWINGBUFFER_WIDTH);
        scope.set(CONTEXT, '.' + S_FRAMEBUFFER_HEIGHT, FRAMEBUFFER + '?' + FRAMEBUFFER + '.height:' + CONTEXT + '.' + S_DRAWINGBUFFER_HEIGHT);
        return FRAMEBUFFER;
      });
    } else {
      return null;
    }
  }

  function parseViewportScissor(options, framebuffer, env) {
    var staticOptions = options.static;
    var dynamicOptions = options.dynamic;

    function parseBox(param) {
      if (param in staticOptions) {
        var box = staticOptions[param];

        var isStatic = true;
        var x = box.x | 0;
        var y = box.y | 0;
        var w, h;
        if ('width' in box) {
          w = box.width | 0;
        } else {
          isStatic = false;
        }
        if ('height' in box) {
          h = box.height | 0;
        } else {
          isStatic = false;
        }

        return new Declaration(!isStatic && framebuffer && framebuffer.thisDep, !isStatic && framebuffer && framebuffer.contextDep, !isStatic && framebuffer && framebuffer.propDep, function (env, scope) {
          var CONTEXT = env.shared.context;
          var BOX_W = w;
          if (!('width' in box)) {
            BOX_W = scope.def(CONTEXT, '.', S_FRAMEBUFFER_WIDTH, '-', x);
          }
          var BOX_H = h;
          if (!('height' in box)) {
            BOX_H = scope.def(CONTEXT, '.', S_FRAMEBUFFER_HEIGHT, '-', y);
          }
          return [x, y, BOX_W, BOX_H];
        });
      } else if (param in dynamicOptions) {
        var dynBox = dynamicOptions[param];
        var result = createDynamicDecl(dynBox, function (env, scope) {
          var BOX = env.invoke(scope, dynBox);

          var CONTEXT = env.shared.context;
          var BOX_X = scope.def(BOX, '.x|0');
          var BOX_Y = scope.def(BOX, '.y|0');
          var BOX_W = scope.def('"width" in ', BOX, '?', BOX, '.width|0:', '(', CONTEXT, '.', S_FRAMEBUFFER_WIDTH, '-', BOX_X, ')');
          var BOX_H = scope.def('"height" in ', BOX, '?', BOX, '.height|0:', '(', CONTEXT, '.', S_FRAMEBUFFER_HEIGHT, '-', BOX_Y, ')');

          return [BOX_X, BOX_Y, BOX_W, BOX_H];
        });
        if (framebuffer) {
          result.thisDep = result.thisDep || framebuffer.thisDep;
          result.contextDep = result.contextDep || framebuffer.contextDep;
          result.propDep = result.propDep || framebuffer.propDep;
        }
        return result;
      } else if (framebuffer) {
        return new Declaration(framebuffer.thisDep, framebuffer.contextDep, framebuffer.propDep, function (env, scope) {
          var CONTEXT = env.shared.context;
          return [0, 0, scope.def(CONTEXT, '.', S_FRAMEBUFFER_WIDTH), scope.def(CONTEXT, '.', S_FRAMEBUFFER_HEIGHT)];
        });
      } else {
        return null;
      }
    }

    var viewport = parseBox(S_VIEWPORT);

    if (viewport) {
      var prevViewport = viewport;
      viewport = new Declaration(viewport.thisDep, viewport.contextDep, viewport.propDep, function (env, scope) {
        var VIEWPORT = prevViewport.append(env, scope);
        var CONTEXT = env.shared.context;
        scope.set(CONTEXT, '.' + S_VIEWPORT_WIDTH, VIEWPORT[2]);
        scope.set(CONTEXT, '.' + S_VIEWPORT_HEIGHT, VIEWPORT[3]);
        return VIEWPORT;
      });
    }

    return {
      viewport: viewport,
      scissor_box: parseBox(S_SCISSOR_BOX)
    };
  }

  function parseProgram(options) {
    var staticOptions = options.static;
    var dynamicOptions = options.dynamic;

    function parseShader(name) {
      if (name in staticOptions) {
        var id = stringStore.id(staticOptions[name]);

        var result = createStaticDecl(function () {
          return id;
        });
        result.id = id;
        return result;
      } else if (name in dynamicOptions) {
        var dyn = dynamicOptions[name];
        return createDynamicDecl(dyn, function (env, scope) {
          var str = env.invoke(scope, dyn);
          var id = scope.def(env.shared.strings, '.id(', str, ')');

          return id;
        });
      }
      return null;
    }

    var frag = parseShader(S_FRAG);
    var vert = parseShader(S_VERT);

    var program = null;
    var progVar;
    if (isStatic(frag) && isStatic(vert)) {
      program = shaderState.program(vert.id, frag.id);
      progVar = createStaticDecl(function (env, scope) {
        return env.link(program);
      });
    } else {
      progVar = new Declaration(frag && frag.thisDep || vert && vert.thisDep, frag && frag.contextDep || vert && vert.contextDep, frag && frag.propDep || vert && vert.propDep, function (env, scope) {
        var SHADER_STATE = env.shared.shader;
        var fragId;
        if (frag) {
          fragId = frag.append(env, scope);
        } else {
          fragId = scope.def(SHADER_STATE, '.', S_FRAG);
        }
        var vertId;
        if (vert) {
          vertId = vert.append(env, scope);
        } else {
          vertId = scope.def(SHADER_STATE, '.', S_VERT);
        }
        var progDef = SHADER_STATE + '.program(' + vertId + ',' + fragId;

        return scope.def(progDef + ')');
      });
    }

    return {
      frag: frag,
      vert: vert,
      progVar: progVar,
      program: program
    };
  }

  function parseDraw(options, env) {
    var staticOptions = options.static;
    var dynamicOptions = options.dynamic;

    function parseElements() {
      if (S_ELEMENTS in staticOptions) {
        var elements = staticOptions[S_ELEMENTS];
        if (isBufferArgs(elements)) {
          elements = elementState.getElements(elementState.create(elements, true));
        } else if (elements) {
          elements = elementState.getElements(elements);
        }
        var result = createStaticDecl(function (env, scope) {
          if (elements) {
            var result = env.link(elements);
            env.ELEMENTS = result;
            return result;
          }
          env.ELEMENTS = null;
          return null;
        });
        result.value = elements;
        return result;
      } else if (S_ELEMENTS in dynamicOptions) {
        var dyn = dynamicOptions[S_ELEMENTS];
        return createDynamicDecl(dyn, function (env, scope) {
          var shared = env.shared;

          var IS_BUFFER_ARGS = shared.isBufferArgs;
          var ELEMENT_STATE = shared.elements;

          var elementDefn = env.invoke(scope, dyn);
          var elements = scope.def('null');
          var elementStream = scope.def(IS_BUFFER_ARGS, '(', elementDefn, ')');

          var ifte = env.cond(elementStream).then(elements, '=', ELEMENT_STATE, '.createStream(', elementDefn, ');').else(elements, '=', ELEMENT_STATE, '.getElements(', elementDefn, ');');

          scope.entry(ifte);
          scope.exit(env.cond(elementStream).then(ELEMENT_STATE, '.destroyStream(', elements, ');'));

          env.ELEMENTS = elements;

          return elements;
        });
      }

      return null;
    }

    var elements = parseElements();

    function parsePrimitive() {
      if (S_PRIMITIVE in staticOptions) {
        var primitive = staticOptions[S_PRIMITIVE];

        return createStaticDecl(function (env, scope) {
          return primTypes[primitive];
        });
      } else if (S_PRIMITIVE in dynamicOptions) {
        var dynPrimitive = dynamicOptions[S_PRIMITIVE];
        return createDynamicDecl(dynPrimitive, function (env, scope) {
          var PRIM_TYPES = env.constants.primTypes;
          var prim = env.invoke(scope, dynPrimitive);

          return scope.def(PRIM_TYPES, '[', prim, ']');
        });
      } else if (elements) {
        if (isStatic(elements)) {
          if (elements.value) {
            return createStaticDecl(function (env, scope) {
              return scope.def(env.ELEMENTS, '.primType');
            });
          } else {
            return createStaticDecl(function () {
              return GL_TRIANGLES;
            });
          }
        } else {
          return new Declaration(elements.thisDep, elements.contextDep, elements.propDep, function (env, scope) {
            var elements = env.ELEMENTS;
            return scope.def(elements, '?', elements, '.primType:', GL_TRIANGLES);
          });
        }
      }
      return null;
    }

    function parseParam(param, isOffset) {
      if (param in staticOptions) {
        var value = staticOptions[param] | 0;

        return createStaticDecl(function (env, scope) {
          if (isOffset) {
            env.OFFSET = value;
          }
          return value;
        });
      } else if (param in dynamicOptions) {
        var dynValue = dynamicOptions[param];
        return createDynamicDecl(dynValue, function (env, scope) {
          var result = env.invoke(scope, dynValue);
          if (isOffset) {
            env.OFFSET = result;
          }
          return result;
        });
      } else if (isOffset && elements) {
        return createStaticDecl(function (env, scope) {
          env.OFFSET = '0';
          return 0;
        });
      }
      return null;
    }

    var OFFSET = parseParam(S_OFFSET, true);

    function parseVertCount() {
      if (S_COUNT in staticOptions) {
        var count = staticOptions[S_COUNT] | 0;

        return createStaticDecl(function () {
          return count;
        });
      } else if (S_COUNT in dynamicOptions) {
        var dynCount = dynamicOptions[S_COUNT];
        return createDynamicDecl(dynCount, function (env, scope) {
          var result = env.invoke(scope, dynCount);

          return result;
        });
      } else if (elements) {
        if (isStatic(elements)) {
          if (elements) {
            if (OFFSET) {
              return new Declaration(OFFSET.thisDep, OFFSET.contextDep, OFFSET.propDep, function (env, scope) {
                var result = scope.def(env.ELEMENTS, '.vertCount-', env.OFFSET);

                return result;
              });
            } else {
              return createStaticDecl(function (env, scope) {
                return scope.def(env.ELEMENTS, '.vertCount');
              });
            }
          } else {
            var result = createStaticDecl(function () {
              return -1;
            });

            return result;
          }
        } else {
          var variable = new Declaration(elements.thisDep || OFFSET.thisDep, elements.contextDep || OFFSET.contextDep, elements.propDep || OFFSET.propDep, function (env, scope) {
            var elements = env.ELEMENTS;
            if (env.OFFSET) {
              return scope.def(elements, '?', elements, '.vertCount-', env.OFFSET, ':-1');
            }
            return scope.def(elements, '?', elements, '.vertCount:-1');
          });

          return variable;
        }
      }
      return null;
    }

    return {
      elements: elements,
      primitive: parsePrimitive(),
      count: parseVertCount(),
      instances: parseParam(S_INSTANCES, false),
      offset: OFFSET
    };
  }

  function parseGLState(options, env) {
    var staticOptions = options.static;
    var dynamicOptions = options.dynamic;

    var STATE = {};

    GL_STATE_NAMES.forEach(function (prop) {
      var param = propName(prop);

      function parseParam(parseStatic, parseDynamic) {
        if (prop in staticOptions) {
          var value = parseStatic(staticOptions[prop]);
          STATE[param] = createStaticDecl(function () {
            return value;
          });
        } else if (prop in dynamicOptions) {
          var dyn = dynamicOptions[prop];
          STATE[param] = createDynamicDecl(dyn, function (env, scope) {
            return parseDynamic(env, scope, env.invoke(scope, dyn));
          });
        }
      }

      switch (prop) {
        case S_CULL_ENABLE:
        case S_BLEND_ENABLE:
        case S_DITHER:
        case S_STENCIL_ENABLE:
        case S_DEPTH_ENABLE:
        case S_SCISSOR_ENABLE:
        case S_POLYGON_OFFSET_ENABLE:
        case S_SAMPLE_ALPHA:
        case S_SAMPLE_ENABLE:
        case S_DEPTH_MASK:
          return parseParam(function (value) {

            return value;
          }, function (env, scope, value) {

            return value;
          });

        case S_DEPTH_FUNC:
          return parseParam(function (value) {

            return compareFuncs[value];
          }, function (env, scope, value) {
            var COMPARE_FUNCS = env.constants.compareFuncs;

            return scope.def(COMPARE_FUNCS, '[', value, ']');
          });

        case S_DEPTH_RANGE:
          return parseParam(function (value) {

            return value;
          }, function (env, scope, value) {

            var Z_NEAR = scope.def('+', value, '[0]');
            var Z_FAR = scope.def('+', value, '[1]');
            return [Z_NEAR, Z_FAR];
          });

        case S_BLEND_FUNC:
          return parseParam(function (value) {

            var srcRGB = 'srcRGB' in value ? value.srcRGB : value.src;
            var srcAlpha = 'srcAlpha' in value ? value.srcAlpha : value.src;
            var dstRGB = 'dstRGB' in value ? value.dstRGB : value.dst;
            var dstAlpha = 'dstAlpha' in value ? value.dstAlpha : value.dst;

            return [blendFuncs[srcRGB], blendFuncs[dstRGB], blendFuncs[srcAlpha], blendFuncs[dstAlpha]];
          }, function (env, scope, value) {
            var BLEND_FUNCS = env.constants.blendFuncs;

            function read(prefix, suffix) {
              var func = scope.def('"', prefix, suffix, '" in ', value, '?', value, '.', prefix, suffix, ':', value, '.', prefix);

              return func;
            }

            var srcRGB = read('src', 'RGB');
            var dstRGB = read('dst', 'RGB');

            var SRC_RGB = scope.def(BLEND_FUNCS, '[', srcRGB, ']');
            var SRC_ALPHA = scope.def(BLEND_FUNCS, '[', read('src', 'Alpha'), ']');
            var DST_RGB = scope.def(BLEND_FUNCS, '[', dstRGB, ']');
            var DST_ALPHA = scope.def(BLEND_FUNCS, '[', read('dst', 'Alpha'), ']');

            return [SRC_RGB, DST_RGB, SRC_ALPHA, DST_ALPHA];
          });

        case S_BLEND_EQUATION:
          return parseParam(function (value) {
            if (typeof value === 'string') {

              return [blendEquations[value], blendEquations[value]];
            } else if (typeof value === 'object') {

              return [blendEquations[value.rgb], blendEquations[value.alpha]];
            } else {}
          }, function (env, scope, value) {
            var BLEND_EQUATIONS = env.constants.blendEquations;

            var RGB = scope.def();
            var ALPHA = scope.def();

            var ifte = env.cond('typeof ', value, '==="string"');

            ifte.then(RGB, '=', ALPHA, '=', BLEND_EQUATIONS, '[', value, '];');
            ifte.else(RGB, '=', BLEND_EQUATIONS, '[', value, '.rgb];', ALPHA, '=', BLEND_EQUATIONS, '[', value, '.alpha];');

            scope(ifte);

            return [RGB, ALPHA];
          });

        case S_BLEND_COLOR:
          return parseParam(function (value) {

            return loop(4, function (i) {
              return +value[i];
            });
          }, function (env, scope, value) {

            return loop(4, function (i) {
              return scope.def('+', value, '[', i, ']');
            });
          });

        case S_STENCIL_MASK:
          return parseParam(function (value) {

            return value | 0;
          }, function (env, scope, value) {

            return scope.def(value, '|0');
          });

        case S_STENCIL_FUNC:
          return parseParam(function (value) {

            var cmp = value.cmp || 'keep';
            var ref = value.ref || 0;
            var mask = 'mask' in value ? value.mask : -1;

            return [compareFuncs[cmp], ref, mask];
          }, function (env, scope, value) {
            var COMPARE_FUNCS = env.constants.compareFuncs;

            var cmp = scope.def('"cmp" in ', value, '?', COMPARE_FUNCS, '[', value, '.cmp]', ':', GL_KEEP);
            var ref = scope.def(value, '.ref|0');
            var mask = scope.def('"mask" in ', value, '?', value, '.mask|0:-1');
            return [cmp, ref, mask];
          });

        case S_STENCIL_OPFRONT:
        case S_STENCIL_OPBACK:
          return parseParam(function (value) {

            var fail = value.fail || 'keep';
            var zfail = value.zfail || 'keep';
            var zpass = value.zpass || 'keep';

            return [prop === S_STENCIL_OPBACK ? GL_BACK : GL_FRONT, stencilOps[fail], stencilOps[zfail], stencilOps[zpass]];
          }, function (env, scope, value) {
            var STENCIL_OPS = env.constants.stencilOps;

            function read(name) {

              return scope.def('"', name, '" in ', value, '?', STENCIL_OPS, '[', value, '.', name, ']:', GL_KEEP);
            }

            return [prop === S_STENCIL_OPBACK ? GL_BACK : GL_FRONT, read('fail'), read('zfail'), read('zpass')];
          });

        case S_POLYGON_OFFSET_OFFSET:
          return parseParam(function (value) {

            var factor = value.factor | 0;
            var units = value.units | 0;

            return [factor, units];
          }, function (env, scope, value) {

            var FACTOR = scope.def(value, '.factor|0');
            var UNITS = scope.def(value, '.units|0');

            return [FACTOR, UNITS];
          });

        case S_CULL_FACE:
          return parseParam(function (value) {
            var face = 0;
            if (value === 'front') {
              face = GL_FRONT;
            } else if (value === 'back') {
              face = GL_BACK;
            }

            return face;
          }, function (env, scope, value) {

            return scope.def(value, '==="front"?', GL_FRONT, ':', GL_BACK);
          });

        case S_LINE_WIDTH:
          return parseParam(function (value) {

            return value;
          }, function (env, scope, value) {

            return value;
          });

        case S_FRONT_FACE:
          return parseParam(function (value) {

            return orientationType[value];
          }, function (env, scope, value) {

            return scope.def(value + '==="cw"?' + GL_CW + ':' + GL_CCW);
          });

        case S_COLOR_MASK:
          return parseParam(function (value) {

            return value.map(function (v) {
              return !!v;
            });
          }, function (env, scope, value) {

            return loop(4, function (i) {
              return '!!' + value + '[' + i + ']';
            });
          });

        case S_SAMPLE_COVERAGE:
          return parseParam(function (value) {

            var sampleValue = 'value' in value ? value.value : 1;
            var sampleInvert = !!value.invert;

            return [sampleValue, sampleInvert];
          }, function (env, scope, value) {

            var VALUE = scope.def('"value" in ', value, '?+', value, '.value:1');
            var INVERT = scope.def('!!', value, '.invert');
            return [VALUE, INVERT];
          });
      }
    });

    return STATE;
  }

  function parseUniforms(uniforms, env) {
    var staticUniforms = uniforms.static;
    var dynamicUniforms = uniforms.dynamic;

    var UNIFORMS = {};

    Object.keys(staticUniforms).forEach(function (name) {
      var value = staticUniforms[name];
      var result;
      if (typeof value === 'number' || typeof value === 'boolean') {
        result = createStaticDecl(function () {
          return value;
        });
      } else if (typeof value === 'function') {
        var reglType = value._reglType;
        if (reglType === 'texture2d' || reglType === 'textureCube') {
          result = createStaticDecl(function (env) {
            return env.link(value);
          });
        } else if (reglType === 'framebuffer' || reglType === 'framebufferCube') {

          result = createStaticDecl(function (env) {
            return env.link(value.color[0]);
          });
        } else {}
      } else if (isArrayLike(value)) {
        result = createStaticDecl(function (env) {
          var ITEM = env.global.def('[', loop(value.length, function (i) {

            return value[i];
          }), ']');
          return ITEM;
        });
      } else {}
      result.value = value;
      UNIFORMS[name] = result;
    });

    Object.keys(dynamicUniforms).forEach(function (key) {
      var dyn = dynamicUniforms[key];
      UNIFORMS[key] = createDynamicDecl(dyn, function (env, scope) {
        return env.invoke(scope, dyn);
      });
    });

    return UNIFORMS;
  }

  function parseAttributes(attributes, env) {
    var staticAttributes = attributes.static;
    var dynamicAttributes = attributes.dynamic;

    var attributeDefs = {};

    Object.keys(staticAttributes).forEach(function (attribute) {
      var value = staticAttributes[attribute];
      var id = stringStore.id(attribute);

      var record = new AttributeRecord();
      if (isBufferArgs(value)) {
        record.state = ATTRIB_STATE_POINTER;
        record.buffer = bufferState.getBuffer(bufferState.create(value, GL_ARRAY_BUFFER, false, true));
        record.type = 0;
      } else {
        var buffer = bufferState.getBuffer(value);
        if (buffer) {
          record.state = ATTRIB_STATE_POINTER;
          record.buffer = buffer;
          record.type = 0;
        } else {

          if (value.constant) {
            var constant = value.constant;
            record.buffer = 'null';
            record.state = ATTRIB_STATE_CONSTANT;
            if (typeof constant === 'number') {
              record.x = constant;
            } else {

              CUTE_COMPONENTS.forEach(function (c, i) {
                if (i < constant.length) {
                  record[c] = constant[i];
                }
              });
            }
          } else {
            if (isBufferArgs(value.buffer)) {
              buffer = bufferState.getBuffer(bufferState.create(value.buffer, GL_ARRAY_BUFFER, false, true));
            } else {
              buffer = bufferState.getBuffer(value.buffer);
            }

            var offset = value.offset | 0;

            var stride = value.stride | 0;

            var size = value.size | 0;

            var normalized = !!value.normalized;

            var type = 0;
            if ('type' in value) {

              type = glTypes[value.type];
            }

            var divisor = value.divisor | 0;
            if ('divisor' in value) {}

            record.buffer = buffer;
            record.state = ATTRIB_STATE_POINTER;
            record.size = size;
            record.normalized = normalized;
            record.type = type || buffer.dtype;
            record.offset = offset;
            record.stride = stride;
            record.divisor = divisor;
          }
        }
      }

      attributeDefs[attribute] = createStaticDecl(function (env, scope) {
        var cache = env.attribCache;
        if (id in cache) {
          return cache[id];
        }
        var result = {
          isStream: false
        };
        Object.keys(record).forEach(function (key) {
          result[key] = record[key];
        });
        if (record.buffer) {
          result.buffer = env.link(record.buffer);
          result.type = result.type || result.buffer + '.dtype';
        }
        cache[id] = result;
        return result;
      });
    });

    Object.keys(dynamicAttributes).forEach(function (attribute) {
      var dyn = dynamicAttributes[attribute];

      function appendAttributeCode(env, block) {
        var VALUE = env.invoke(block, dyn);

        var shared = env.shared;

        var IS_BUFFER_ARGS = shared.isBufferArgs;
        var BUFFER_STATE = shared.buffer;

        // Perform validation on attribute


        // allocate names for result
        var result = {
          isStream: block.def(false)
        };
        var defaultRecord = new AttributeRecord();
        defaultRecord.state = ATTRIB_STATE_POINTER;
        Object.keys(defaultRecord).forEach(function (key) {
          result[key] = block.def('' + defaultRecord[key]);
        });

        var BUFFER = result.buffer;
        var TYPE = result.type;
        block('if(', IS_BUFFER_ARGS, '(', VALUE, ')){', result.isStream, '=true;', BUFFER, '=', BUFFER_STATE, '.createStream(', GL_ARRAY_BUFFER, ',', VALUE, ');', TYPE, '=', BUFFER, '.dtype;', '}else{', BUFFER, '=', BUFFER_STATE, '.getBuffer(', VALUE, ');', 'if(', BUFFER, '){', TYPE, '=', BUFFER, '.dtype;', '}else if("constant" in ', VALUE, '){', result.state, '=', ATTRIB_STATE_CONSTANT, ';', 'if(typeof ' + VALUE + '.constant === "number"){', result[CUTE_COMPONENTS[0]], '=', VALUE, '.constant;', CUTE_COMPONENTS.slice(1).map(function (n) {
          return result[n];
        }).join('='), '=0;', '}else{', CUTE_COMPONENTS.map(function (name, i) {
          return result[name] + '=' + VALUE + '.constant.length>=' + i + '?' + VALUE + '.constant[' + i + ']:0;';
        }).join(''), '}}else{', 'if(', IS_BUFFER_ARGS, '(', VALUE, '.buffer)){', BUFFER, '=', BUFFER_STATE, '.createStream(', GL_ARRAY_BUFFER, ',', VALUE, '.buffer);', '}else{', BUFFER, '=', BUFFER_STATE, '.getBuffer(', VALUE, '.buffer);', '}', TYPE, '="type" in ', VALUE, '?', shared.glTypes, '[', VALUE, '.type]:', BUFFER, '.dtype;', result.normalized, '=!!', VALUE, '.normalized;');
        function emitReadRecord(name) {
          block(result[name], '=', VALUE, '.', name, '|0;');
        }
        emitReadRecord('size');
        emitReadRecord('offset');
        emitReadRecord('stride');
        emitReadRecord('divisor');

        block('}}');

        block.exit('if(', result.isStream, '){', BUFFER_STATE, '.destroyStream(', BUFFER, ');', '}');

        return result;
      }

      attributeDefs[attribute] = createDynamicDecl(dyn, appendAttributeCode);
    });

    return attributeDefs;
  }

  function parseContext(context) {
    var staticContext = context.static;
    var dynamicContext = context.dynamic;
    var result = {};

    Object.keys(staticContext).forEach(function (name) {
      var value = staticContext[name];
      result[name] = createStaticDecl(function (env, scope) {
        if (typeof value === 'number' || typeof value === 'boolean') {
          return '' + value;
        } else {
          return env.link(value);
        }
      });
    });

    Object.keys(dynamicContext).forEach(function (name) {
      var dyn = dynamicContext[name];
      result[name] = createDynamicDecl(dyn, function (env, scope) {
        return env.invoke(scope, dyn);
      });
    });

    return result;
  }

  function parseArguments(options, attributes, uniforms, context, env) {
    var staticOptions = options.static;
    var dynamicOptions = options.dynamic;

    var framebuffer = parseFramebuffer(options, env);
    var viewportAndScissor = parseViewportScissor(options, framebuffer, env);
    var draw = parseDraw(options, env);
    var state = parseGLState(options, env);
    var shader = parseProgram(options, env);

    function copyBox(name) {
      var defn = viewportAndScissor[name];
      if (defn) {
        state[name] = defn;
      }
    }
    copyBox(S_VIEWPORT);
    copyBox(propName(S_SCISSOR_BOX));

    var dirty = Object.keys(state).length > 0;

    var result = {
      framebuffer: framebuffer,
      draw: draw,
      shader: shader,
      state: state,
      dirty: dirty
    };

    result.profile = parseProfile(options, env);
    result.uniforms = parseUniforms(uniforms, env);
    result.attributes = parseAttributes(attributes, env);
    result.context = parseContext(context, env);
    return result;
  }

  // ===================================================
  // ===================================================
  // COMMON UPDATE FUNCTIONS
  // ===================================================
  // ===================================================
  function emitContext(env, scope, context) {
    var shared = env.shared;
    var CONTEXT = shared.context;

    var contextEnter = env.scope();

    Object.keys(context).forEach(function (name) {
      scope.save(CONTEXT, '.' + name);
      var defn = context[name];
      contextEnter(CONTEXT, '.', name, '=', defn.append(env, scope), ';');
    });

    scope(contextEnter);
  }

  // ===================================================
  // ===================================================
  // COMMON DRAWING FUNCTIONS
  // ===================================================
  // ===================================================
  function emitPollFramebuffer(env, scope, framebuffer, skipCheck) {
    var shared = env.shared;

    var GL = shared.gl;
    var FRAMEBUFFER_STATE = shared.framebuffer;
    var EXT_DRAW_BUFFERS;
    if (extDrawBuffers) {
      EXT_DRAW_BUFFERS = scope.def(shared.extensions, '.webgl_draw_buffers');
    }

    var constants = env.constants;

    var DRAW_BUFFERS = constants.drawBuffer;
    var BACK_BUFFER = constants.backBuffer;

    var NEXT;
    if (framebuffer) {
      NEXT = framebuffer.append(env, scope);
    } else {
      NEXT = scope.def(FRAMEBUFFER_STATE, '.next');
    }

    if (!skipCheck) {
      scope('if(', NEXT, '!==', FRAMEBUFFER_STATE, '.cur){');
    }
    scope('if(', NEXT, '){', GL, '.bindFramebuffer(', GL_FRAMEBUFFER, ',', NEXT, '.framebuffer);');
    if (extDrawBuffers) {
      scope(EXT_DRAW_BUFFERS, '.drawBuffersWEBGL(', DRAW_BUFFERS, '[', NEXT, '.colorAttachments.length]);');
    }
    scope('}else{', GL, '.bindFramebuffer(', GL_FRAMEBUFFER, ',null);');
    if (extDrawBuffers) {
      scope(EXT_DRAW_BUFFERS, '.drawBuffersWEBGL(', BACK_BUFFER, ');');
    }
    scope('}', FRAMEBUFFER_STATE, '.cur=', NEXT, ';');
    if (!skipCheck) {
      scope('}');
    }
  }

  function emitPollState(env, scope, args) {
    var shared = env.shared;

    var GL = shared.gl;

    var CURRENT_VARS = env.current;
    var NEXT_VARS = env.next;
    var CURRENT_STATE = shared.current;
    var NEXT_STATE = shared.next;

    var block = env.cond(CURRENT_STATE, '.dirty');

    GL_STATE_NAMES.forEach(function (prop) {
      var param = propName(prop);
      if (param in args.state) {
        return;
      }

      var NEXT, CURRENT;
      if (param in NEXT_VARS) {
        NEXT = NEXT_VARS[param];
        CURRENT = CURRENT_VARS[param];
        var parts = loop(currentState[param].length, function (i) {
          return block.def(NEXT, '[', i, ']');
        });
        block(env.cond(parts.map(function (p, i) {
          return p + '!==' + CURRENT + '[' + i + ']';
        }).join('||')).then(GL, '.', GL_VARIABLES[param], '(', parts, ');', parts.map(function (p, i) {
          return CURRENT + '[' + i + ']=' + p;
        }).join(';'), ';'));
      } else {
        NEXT = block.def(NEXT_STATE, '.', param);
        var ifte = env.cond(NEXT, '!==', CURRENT_STATE, '.', param);
        block(ifte);
        if (param in GL_FLAGS) {
          ifte(env.cond(NEXT).then(GL, '.enable(', GL_FLAGS[param], ');').else(GL, '.disable(', GL_FLAGS[param], ');'), CURRENT_STATE, '.', param, '=', NEXT, ';');
        } else {
          ifte(GL, '.', GL_VARIABLES[param], '(', NEXT, ');', CURRENT_STATE, '.', param, '=', NEXT, ';');
        }
      }
    });
    if (Object.keys(args.state).length === 0) {
      block(CURRENT_STATE, '.dirty=false;');
    }
    scope(block);
  }

  function emitSetOptions(env, scope, options, filter) {
    var shared = env.shared;
    var CURRENT_VARS = env.current;
    var CURRENT_STATE = shared.current;
    var GL = shared.gl;
    sortState(Object.keys(options)).forEach(function (param) {
      var defn = options[param];
      if (filter && !filter(defn)) {
        return;
      }
      var variable = defn.append(env, scope);
      if (GL_FLAGS[param]) {
        var flag = GL_FLAGS[param];
        if (isStatic(defn)) {
          if (variable) {
            scope(GL, '.enable(', flag, ');');
          } else {
            scope(GL, '.disable(', flag, ');');
          }
        } else {
          scope(env.cond(variable).then(GL, '.enable(', flag, ');').else(GL, '.disable(', flag, ');'));
        }
        scope(CURRENT_STATE, '.', param, '=', variable, ';');
      } else if (isArrayLike(variable)) {
        var CURRENT = CURRENT_VARS[param];
        scope(GL, '.', GL_VARIABLES[param], '(', variable, ');', variable.map(function (v, i) {
          return CURRENT + '[' + i + ']=' + v;
        }).join(';'), ';');
      } else {
        scope(GL, '.', GL_VARIABLES[param], '(', variable, ');', CURRENT_STATE, '.', param, '=', variable, ';');
      }
    });
  }

  function injectExtensions(env, scope) {
    if (extInstancing) {
      env.instancing = scope.def(env.shared.extensions, '.angle_instanced_arrays');
    }
  }

  function emitProfile(env, scope, args, useScope, incrementCounter) {
    var shared = env.shared;
    var STATS = env.stats;
    var CURRENT_STATE = shared.current;
    var TIMER = shared.timer;
    var profileArg = args.profile;

    function perfCounter() {
      if (typeof performance === 'undefined') {
        return 'Date.now()';
      } else {
        return 'performance.now()';
      }
    }

    var CPU_START, QUERY_COUNTER;
    function emitProfileStart(block) {
      CPU_START = scope.def();
      block(CPU_START, '=', perfCounter(), ';');
      if (typeof incrementCounter === 'string') {
        block(STATS, '.count+=', incrementCounter, ';');
      } else {
        block(STATS, '.count++;');
      }
      if (timer) {
        if (useScope) {
          QUERY_COUNTER = scope.def();
          block(QUERY_COUNTER, '=', TIMER, '.getNumPendingQueries();');
        } else {
          block(TIMER, '.beginQuery(', STATS, ');');
        }
      }
    }

    function emitProfileEnd(block) {
      block(STATS, '.cpuTime+=', perfCounter(), '-', CPU_START, ';');
      if (timer) {
        if (useScope) {
          block(TIMER, '.pushScopeStats(', QUERY_COUNTER, ',', TIMER, '.getNumPendingQueries(),', STATS, ');');
        } else {
          block(TIMER, '.endQuery();');
        }
      }
    }

    function scopeProfile(value) {
      var prev = scope.def(CURRENT_STATE, '.profile');
      scope(CURRENT_STATE, '.profile=', value, ';');
      scope.exit(CURRENT_STATE, '.profile=', prev, ';');
    }

    var USE_PROFILE;
    if (profileArg) {
      if (isStatic(profileArg)) {
        if (profileArg.enable) {
          emitProfileStart(scope);
          emitProfileEnd(scope.exit);
          scopeProfile('true');
        } else {
          scopeProfile('false');
        }
        return;
      }
      USE_PROFILE = profileArg.append(env, scope);
      scopeProfile(USE_PROFILE);
    } else {
      USE_PROFILE = scope.def(CURRENT_STATE, '.profile');
    }

    var start = env.block();
    emitProfileStart(start);
    scope('if(', USE_PROFILE, '){', start, '}');
    var end = env.block();
    emitProfileEnd(end);
    scope.exit('if(', USE_PROFILE, '){', end, '}');
  }

  function emitAttributes(env, scope, args, attributes, filter) {
    var shared = env.shared;

    function typeLength(x) {
      switch (x) {
        case GL_FLOAT_VEC2:
        case GL_INT_VEC2:
        case GL_BOOL_VEC2:
          return 2;
        case GL_FLOAT_VEC3:
        case GL_INT_VEC3:
        case GL_BOOL_VEC3:
          return 3;
        case GL_FLOAT_VEC4:
        case GL_INT_VEC4:
        case GL_BOOL_VEC4:
          return 4;
        default:
          return 1;
      }
    }

    function emitBindAttribute(ATTRIBUTE, size, record) {
      var GL = shared.gl;

      var LOCATION = scope.def(ATTRIBUTE, '.location');
      var BINDING = scope.def(shared.attributes, '[', LOCATION, ']');

      var STATE = record.state;
      var BUFFER = record.buffer;
      var CONST_COMPONENTS = [record.x, record.y, record.z, record.w];

      var COMMON_KEYS = ['buffer', 'normalized', 'offset', 'stride'];

      function emitBuffer() {
        scope('if(!', BINDING, '.buffer){', GL, '.enableVertexAttribArray(', LOCATION, ');}');

        var TYPE = record.type;
        var SIZE;
        if (!record.size) {
          SIZE = size;
        } else {
          SIZE = scope.def(record.size, '||', size);
        }

        scope('if(', BINDING, '.type!==', TYPE, '||', BINDING, '.size!==', SIZE, '||', COMMON_KEYS.map(function (key) {
          return BINDING + '.' + key + '!==' + record[key];
        }).join('||'), '){', GL, '.bindBuffer(', GL_ARRAY_BUFFER, ',', BUFFER, '.buffer);', GL, '.vertexAttribPointer(', [LOCATION, SIZE, TYPE, record.normalized, record.stride, record.offset], ');', BINDING, '.type=', TYPE, ';', BINDING, '.size=', SIZE, ';', COMMON_KEYS.map(function (key) {
          return BINDING + '.' + key + '=' + record[key] + ';';
        }).join(''), '}');

        if (extInstancing) {
          var DIVISOR = record.divisor;
          scope('if(', BINDING, '.divisor!==', DIVISOR, '){', env.instancing, '.vertexAttribDivisorANGLE(', [LOCATION, DIVISOR], ');', BINDING, '.divisor=', DIVISOR, ';}');
        }
      }

      function emitConstant() {
        scope('if(', BINDING, '.buffer){', GL, '.disableVertexAttribArray(', LOCATION, ');', '}if(', CUTE_COMPONENTS.map(function (c, i) {
          return BINDING + '.' + c + '!==' + CONST_COMPONENTS[i];
        }).join('||'), '){', GL, '.vertexAttrib4f(', LOCATION, ',', CONST_COMPONENTS, ');', CUTE_COMPONENTS.map(function (c, i) {
          return BINDING + '.' + c + '=' + CONST_COMPONENTS[i] + ';';
        }).join(''), '}');
      }

      if (STATE === ATTRIB_STATE_POINTER) {
        emitBuffer();
      } else if (STATE === ATTRIB_STATE_CONSTANT) {
        emitConstant();
      } else {
        scope('if(', STATE, '===', ATTRIB_STATE_POINTER, '){');
        emitBuffer();
        scope('}else{');
        emitConstant();
        scope('}');
      }
    }

    attributes.forEach(function (attribute) {
      var name = attribute.name;
      var arg = args.attributes[name];
      var record;
      if (arg) {
        if (!filter(arg)) {
          return;
        }
        record = arg.append(env, scope);
      } else {
        if (!filter(SCOPE_DECL)) {
          return;
        }
        var scopeAttrib = env.scopeAttrib(name);

        record = {};
        Object.keys(new AttributeRecord()).forEach(function (key) {
          record[key] = scope.def(scopeAttrib, '.', key);
        });
      }
      emitBindAttribute(env.link(attribute), typeLength(attribute.info.type), record);
    });
  }

  function emitUniforms(env, scope, args, uniforms, filter) {
    var shared = env.shared;
    var GL = shared.gl;

    var infix;
    for (var i = 0; i < uniforms.length; ++i) {
      var uniform = uniforms[i];
      var name = uniform.name;
      var type = uniform.info.type;
      var arg = args.uniforms[name];
      var UNIFORM = env.link(uniform);
      var LOCATION = UNIFORM + '.location';

      var VALUE;
      if (arg) {
        if (!filter(arg)) {
          continue;
        }
        if (isStatic(arg)) {
          var value = arg.value;

          if (type === GL_SAMPLER_2D || type === GL_SAMPLER_CUBE) {

            var TEX_VALUE = env.link(value._texture || value.color[0]._texture);
            scope(GL, '.uniform1i(', LOCATION, ',', TEX_VALUE + '.bind());');
            scope.exit(TEX_VALUE, '.unbind();');
          } else if (type === GL_FLOAT_MAT2 || type === GL_FLOAT_MAT3 || type === GL_FLOAT_MAT4) {

            var MAT_VALUE = env.global.def('new Float32Array([' + Array.prototype.slice.call(value) + '])');
            var dim = 2;
            if (type === GL_FLOAT_MAT3) {
              dim = 3;
            } else if (type === GL_FLOAT_MAT4) {
              dim = 4;
            }
            scope(GL, '.uniformMatrix', dim, 'fv(', LOCATION, ',false,', MAT_VALUE, ');');
          } else {
            switch (type) {
              case GL_FLOAT:

                infix = '1f';
                break;
              case GL_FLOAT_VEC2:

                infix = '2f';
                break;
              case GL_FLOAT_VEC3:

                infix = '3f';
                break;
              case GL_FLOAT_VEC4:

                infix = '4f';
                break;
              case GL_BOOL:

                infix = '1i';
                break;
              case GL_INT:

                infix = '1i';
                break;
              case GL_BOOL_VEC2:

                infix = '2i';
                break;
              case GL_INT_VEC2:

                infix = '2i';
                break;
              case GL_BOOL_VEC3:

                infix = '3i';
                break;
              case GL_INT_VEC3:

                infix = '3i';
                break;
              case GL_BOOL_VEC4:

                infix = '4i';
                break;
              case GL_INT_VEC4:

                infix = '4i';
                break;
            }
            scope(GL, '.uniform', infix, '(', LOCATION, ',', isArrayLike(value) ? Array.prototype.slice.call(value) : value, ');');
          }
          continue;
        } else {
          VALUE = arg.append(env, scope);
        }
      } else {
        if (!filter(SCOPE_DECL)) {
          continue;
        }
        VALUE = scope.def(shared.uniforms, '[', stringStore.id(name), ']');
      }

      if (type === GL_SAMPLER_2D) {
        scope('if(', VALUE, '&&', VALUE, '._reglType==="framebuffer"){', VALUE, '=', VALUE, '.color[0];', '}');
      } else if (type === GL_SAMPLER_CUBE) {
        scope('if(', VALUE, '&&', VALUE, '._reglType==="framebufferCube"){', VALUE, '=', VALUE, '.color[0];', '}');
      }

      // perform type validation


      var unroll = 1;
      switch (type) {
        case GL_SAMPLER_2D:
        case GL_SAMPLER_CUBE:
          var TEX = scope.def(VALUE, '._texture');
          scope(GL, '.uniform1i(', LOCATION, ',', TEX, '.bind());');
          scope.exit(TEX, '.unbind();');
          continue;

        case GL_INT:
        case GL_BOOL:
          infix = '1i';
          break;

        case GL_INT_VEC2:
        case GL_BOOL_VEC2:
          infix = '2i';
          unroll = 2;
          break;

        case GL_INT_VEC3:
        case GL_BOOL_VEC3:
          infix = '3i';
          unroll = 3;
          break;

        case GL_INT_VEC4:
        case GL_BOOL_VEC4:
          infix = '4i';
          unroll = 4;
          break;

        case GL_FLOAT:
          infix = '1f';
          break;

        case GL_FLOAT_VEC2:
          infix = '2f';
          unroll = 2;
          break;

        case GL_FLOAT_VEC3:
          infix = '3f';
          unroll = 3;
          break;

        case GL_FLOAT_VEC4:
          infix = '4f';
          unroll = 4;
          break;

        case GL_FLOAT_MAT2:
          infix = 'Matrix2fv';
          break;

        case GL_FLOAT_MAT3:
          infix = 'Matrix3fv';
          break;

        case GL_FLOAT_MAT4:
          infix = 'Matrix4fv';
          break;
      }

      scope(GL, '.uniform', infix, '(', LOCATION, ',');
      if (infix.charAt(0) === 'M') {
        var matSize = Math.pow(type - GL_FLOAT_MAT2 + 2, 2);
        var STORAGE = env.global.def('new Float32Array(', matSize, ')');
        scope('false,(Array.isArray(', VALUE, ')||', VALUE, ' instanceof Float32Array)?', VALUE, ':(', loop(matSize, function (i) {
          return STORAGE + '[' + i + ']=' + VALUE + '[' + i + ']';
        }), ',', STORAGE, ')');
      } else if (unroll > 1) {
        scope(loop(unroll, function (i) {
          return VALUE + '[' + i + ']';
        }));
      } else {
        scope(VALUE);
      }
      scope(');');
    }
  }

  function emitDraw(env, outer, inner, args) {
    var shared = env.shared;
    var GL = shared.gl;
    var DRAW_STATE = shared.draw;

    var drawOptions = args.draw;

    function emitElements() {
      var defn = drawOptions.elements;
      var ELEMENTS;
      var scope = outer;
      if (defn) {
        if (defn.contextDep && args.contextDynamic || defn.propDep) {
          scope = inner;
        }
        ELEMENTS = defn.append(env, scope);
      } else {
        ELEMENTS = scope.def(DRAW_STATE, '.', S_ELEMENTS);
      }
      if (ELEMENTS) {
        scope('if(' + ELEMENTS + ')' + GL + '.bindBuffer(' + GL_ELEMENT_ARRAY_BUFFER + ',' + ELEMENTS + '.buffer.buffer);');
      }
      return ELEMENTS;
    }

    function emitCount() {
      var defn = drawOptions.count;
      var COUNT;
      var scope = outer;
      if (defn) {
        if (defn.contextDep && args.contextDynamic || defn.propDep) {
          scope = inner;
        }
        COUNT = defn.append(env, scope);
      } else {
        COUNT = scope.def(DRAW_STATE, '.', S_COUNT);
      }
      return COUNT;
    }

    var ELEMENTS = emitElements();
    function emitValue(name) {
      var defn = drawOptions[name];
      if (defn) {
        if (defn.contextDep && args.contextDynamic || defn.propDep) {
          return defn.append(env, inner);
        } else {
          return defn.append(env, outer);
        }
      } else {
        return outer.def(DRAW_STATE, '.', name);
      }
    }

    var PRIMITIVE = emitValue(S_PRIMITIVE);
    var OFFSET = emitValue(S_OFFSET);

    var COUNT = emitCount();
    if (typeof COUNT === 'number') {
      if (COUNT === 0) {
        return;
      }
    } else {
      inner('if(', COUNT, '){');
      inner.exit('}');
    }

    var INSTANCES, EXT_INSTANCING;
    if (extInstancing) {
      INSTANCES = emitValue(S_INSTANCES);
      EXT_INSTANCING = env.instancing;
    }

    var ELEMENT_TYPE = ELEMENTS + '.type';

    var elementsStatic = drawOptions.elements && isStatic(drawOptions.elements);

    function emitInstancing() {
      function drawElements() {
        inner(EXT_INSTANCING, '.drawElementsInstancedANGLE(', [PRIMITIVE, COUNT, ELEMENT_TYPE, OFFSET + '<<((' + ELEMENT_TYPE + '-' + GL_UNSIGNED_BYTE + ')>>1)', INSTANCES], ');');
      }

      function drawArrays() {
        inner(EXT_INSTANCING, '.drawArraysInstancedANGLE(', [PRIMITIVE, OFFSET, COUNT, INSTANCES], ');');
      }

      if (ELEMENTS) {
        if (!elementsStatic) {
          inner('if(', ELEMENTS, '){');
          drawElements();
          inner('}else{');
          drawArrays();
          inner('}');
        } else {
          drawElements();
        }
      } else {
        drawArrays();
      }
    }

    function emitRegular() {
      function drawElements() {
        inner(GL + '.drawElements(' + [PRIMITIVE, COUNT, ELEMENT_TYPE, OFFSET + '<<((' + ELEMENT_TYPE + '-' + GL_UNSIGNED_BYTE + ')>>1)'] + ');');
      }

      function drawArrays() {
        inner(GL + '.drawArrays(' + [PRIMITIVE, OFFSET, COUNT] + ');');
      }

      if (ELEMENTS) {
        if (!elementsStatic) {
          inner('if(', ELEMENTS, '){');
          drawElements();
          inner('}else{');
          drawArrays();
          inner('}');
        } else {
          drawElements();
        }
      } else {
        drawArrays();
      }
    }

    if (extInstancing && (typeof INSTANCES !== 'number' || INSTANCES >= 0)) {
      if (typeof INSTANCES === 'string') {
        inner('if(', INSTANCES, '>0){');
        emitInstancing();
        inner('}else if(', INSTANCES, '<0){');
        emitRegular();
        inner('}');
      } else {
        emitInstancing();
      }
    } else {
      emitRegular();
    }
  }

  function createBody(emitBody, parentEnv, args, program, count) {
    var env = createREGLEnvironment();
    var scope = env.proc('body', count);

    if (extInstancing) {
      env.instancing = scope.def(env.shared.extensions, '.angle_instanced_arrays');
    }
    emitBody(env, scope, args, program);
    return env.compile().body;
  }

  // ===================================================
  // ===================================================
  // DRAW PROC
  // ===================================================
  // ===================================================
  function emitDrawBody(env, draw, args, program) {
    injectExtensions(env, draw);
    emitAttributes(env, draw, args, program.attributes, function () {
      return true;
    });
    emitUniforms(env, draw, args, program.uniforms, function () {
      return true;
    });
    emitDraw(env, draw, draw, args);
  }

  function emitDrawProc(env, args) {
    var draw = env.proc('draw', 1);

    injectExtensions(env, draw);

    emitContext(env, draw, args.context);
    emitPollFramebuffer(env, draw, args.framebuffer);

    emitPollState(env, draw, args);
    emitSetOptions(env, draw, args.state);

    emitProfile(env, draw, args, false, true);

    var program = args.shader.progVar.append(env, draw);
    draw(env.shared.gl, '.useProgram(', program, '.program);');

    if (args.shader.program) {
      emitDrawBody(env, draw, args, args.shader.program);
    } else {
      var drawCache = env.global.def('{}');
      var PROG_ID = draw.def(program, '.id');
      var CACHED_PROC = draw.def(drawCache, '[', PROG_ID, ']');
      draw(env.cond(CACHED_PROC).then(CACHED_PROC, '.call(this,a0);').else(CACHED_PROC, '=', drawCache, '[', PROG_ID, ']=', env.link(function (program) {
        return createBody(emitDrawBody, env, args, program, 1);
      }), '(', program, ');', CACHED_PROC, '.call(this,a0);'));
    }

    if (Object.keys(args.state).length > 0) {
      draw(env.shared.current, '.dirty=true;');
    }
  }

  // ===================================================
  // ===================================================
  // BATCH PROC
  // ===================================================
  // ===================================================

  function emitBatchDynamicShaderBody(env, scope, args, program) {
    env.batchId = 'a1';

    injectExtensions(env, scope);

    function all() {
      return true;
    }

    emitAttributes(env, scope, args, program.attributes, all);
    emitUniforms(env, scope, args, program.uniforms, all);
    emitDraw(env, scope, scope, args);
  }

  function emitBatchBody(env, scope, args, program) {
    injectExtensions(env, scope);

    var contextDynamic = args.contextDep;

    var BATCH_ID = scope.def();
    var PROP_LIST = 'a0';
    var NUM_PROPS = 'a1';
    var PROPS = scope.def();
    env.shared.props = PROPS;
    env.batchId = BATCH_ID;

    var outer = env.scope();
    var inner = env.scope();

    scope(outer.entry, 'for(', BATCH_ID, '=0;', BATCH_ID, '<', NUM_PROPS, ';++', BATCH_ID, '){', PROPS, '=', PROP_LIST, '[', BATCH_ID, '];', inner, '}', outer.exit);

    function isInnerDefn(defn) {
      return defn.contextDep && contextDynamic || defn.propDep;
    }

    function isOuterDefn(defn) {
      return !isInnerDefn(defn);
    }

    if (args.needsContext) {
      emitContext(env, inner, args.context);
    }
    if (args.needsFramebuffer) {
      emitPollFramebuffer(env, inner, args.framebuffer);
    }
    emitSetOptions(env, inner, args.state, isInnerDefn);

    if (args.profile && isInnerDefn(args.profile)) {
      emitProfile(env, inner, args, false, true);
    }

    if (!program) {
      var progCache = env.global.def('{}');
      var PROGRAM = args.shader.progVar.append(env, inner);
      var PROG_ID = inner.def(PROGRAM, '.id');
      var CACHED_PROC = inner.def(progCache, '[', PROG_ID, ']');
      inner(env.shared.gl, '.useProgram(', PROGRAM, '.program);', 'if(!', CACHED_PROC, '){', CACHED_PROC, '=', progCache, '[', PROG_ID, ']=', env.link(function (program) {
        return createBody(emitBatchDynamicShaderBody, env, args, program, 2);
      }), '(', PROGRAM, ');}', CACHED_PROC, '.call(this,a0[', BATCH_ID, '],', BATCH_ID, ');');
    } else {
      emitAttributes(env, outer, args, program.attributes, isOuterDefn);
      emitAttributes(env, inner, args, program.attributes, isInnerDefn);
      emitUniforms(env, outer, args, program.uniforms, isOuterDefn);
      emitUniforms(env, inner, args, program.uniforms, isInnerDefn);
      emitDraw(env, outer, inner, args);
    }
  }

  function emitBatchProc(env, args) {
    var batch = env.proc('batch', 2);
    env.batchId = '0';

    injectExtensions(env, batch);

    // Check if any context variables depend on props
    var contextDynamic = false;
    var needsContext = true;
    Object.keys(args.context).forEach(function (name) {
      contextDynamic = contextDynamic || args.context[name].propDep;
    });
    if (!contextDynamic) {
      emitContext(env, batch, args.context);
      needsContext = false;
    }

    // framebuffer state affects framebufferWidth/height context vars
    var framebuffer = args.framebuffer;
    var needsFramebuffer = false;
    if (framebuffer) {
      if (framebuffer.propDep) {
        contextDynamic = needsFramebuffer = true;
      } else if (framebuffer.contextDep && contextDynamic) {
        needsFramebuffer = true;
      }
      if (!needsFramebuffer) {
        emitPollFramebuffer(env, batch, framebuffer);
      }
    } else {
      emitPollFramebuffer(env, batch, null);
    }

    // viewport is weird because it can affect context vars
    if (args.state.viewport && args.state.viewport.propDep) {
      contextDynamic = true;
    }

    function isInnerDefn(defn) {
      return defn.contextDep && contextDynamic || defn.propDep;
    }

    // set webgl options
    emitPollState(env, batch, args);
    emitSetOptions(env, batch, args.state, function (defn) {
      return !isInnerDefn(defn);
    });

    if (!args.profile || !isInnerDefn(args.profile)) {
      emitProfile(env, batch, args, false, 'a1');
    }

    // Save these values to args so that the batch body routine can use them
    args.contextDep = contextDynamic;
    args.needsContext = needsContext;
    args.needsFramebuffer = needsFramebuffer;

    // determine if shader is dynamic
    var progDefn = args.shader.progVar;
    if (progDefn.contextDep && contextDynamic || progDefn.propDep) {
      emitBatchBody(env, batch, args, null);
    } else {
      var PROGRAM = progDefn.append(env, batch);
      batch(env.shared.gl, '.useProgram(', PROGRAM, '.program);');
      if (args.shader.program) {
        emitBatchBody(env, batch, args, args.shader.program);
      } else {
        var batchCache = env.global.def('{}');
        var PROG_ID = batch.def(PROGRAM, '.id');
        var CACHED_PROC = batch.def(batchCache, '[', PROG_ID, ']');
        batch(env.cond(CACHED_PROC).then(CACHED_PROC, '.call(this,a0,a1);').else(CACHED_PROC, '=', batchCache, '[', PROG_ID, ']=', env.link(function (program) {
          return createBody(emitBatchBody, env, args, program, 2);
        }), '(', PROGRAM, ');', CACHED_PROC, '.call(this,a0,a1);'));
      }
    }

    if (Object.keys(args.state).length > 0) {
      batch(env.shared.current, '.dirty=true;');
    }
  }

  // ===================================================
  // ===================================================
  // SCOPE COMMAND
  // ===================================================
  // ===================================================
  function emitScopeProc(env, args) {
    var scope = env.proc('scope', 3);
    env.batchId = 'a2';

    var shared = env.shared;
    var CURRENT_STATE = shared.current;

    emitContext(env, scope, args.context);

    if (args.framebuffer) {
      args.framebuffer.append(env, scope);
    }

    sortState(Object.keys(args.state)).forEach(function (name) {
      var defn = args.state[name];
      var value = defn.append(env, scope);
      if (isArrayLike(value)) {
        value.forEach(function (v, i) {
          scope.set(env.next[name], '[' + i + ']', v);
        });
      } else {
        scope.set(shared.next, '.' + name, value);
      }
    });

    emitProfile(env, scope, args, true, true);[S_ELEMENTS, S_OFFSET, S_COUNT, S_INSTANCES, S_PRIMITIVE].forEach(function (opt) {
      var variable = args.draw[opt];
      if (!variable) {
        return;
      }
      scope.set(shared.draw, '.' + opt, '' + variable.append(env, scope));
    });

    Object.keys(args.uniforms).forEach(function (opt) {
      scope.set(shared.uniforms, '[' + stringStore.id(opt) + ']', args.uniforms[opt].append(env, scope));
    });

    Object.keys(args.attributes).forEach(function (name) {
      var record = args.attributes[name].append(env, scope);
      var scopeAttrib = env.scopeAttrib(name);
      Object.keys(new AttributeRecord()).forEach(function (prop) {
        scope.set(scopeAttrib, '.' + prop, record[prop]);
      });
    });

    function saveShader(name) {
      var shader = args.shader[name];
      if (shader) {
        scope.set(shared.shader, '.' + name, shader.append(env, scope));
      }
    }
    saveShader(S_VERT);
    saveShader(S_FRAG);

    if (Object.keys(args.state).length > 0) {
      scope(CURRENT_STATE, '.dirty=true;');
      scope.exit(CURRENT_STATE, '.dirty=true;');
    }

    scope('a1(', env.shared.context, ',a0,', env.batchId, ');');
  }

  function isDynamicObject(object) {
    if (typeof object !== 'object' || isArrayLike(object)) {
      return;
    }
    var props = Object.keys(object);
    for (var i = 0; i < props.length; ++i) {
      if (dynamic.isDynamic(object[props[i]])) {
        return true;
      }
    }
    return false;
  }

  function splatObject(env, options, name) {
    var object = options.static[name];
    if (!object || !isDynamicObject(object)) {
      return;
    }

    var globals = env.global;
    var keys = Object.keys(object);
    var thisDep = false;
    var contextDep = false;
    var propDep = false;
    var objectRef = env.global.def('{}');
    keys.forEach(function (key) {
      var value = object[key];
      if (dynamic.isDynamic(value)) {
        if (typeof value === 'function') {
          value = object[key] = dynamic.unbox(value);
        }
        var deps = createDynamicDecl(value, null);
        thisDep = thisDep || deps.thisDep;
        propDep = propDep || deps.propDep;
        contextDep = contextDep || deps.contextDep;
      } else {
        globals(objectRef, '.', key, '=');
        switch (typeof value) {
          case 'number':
            globals(value);
            break;
          case 'string':
            globals('"', value, '"');
            break;
          case 'object':
            if (Array.isArray(value)) {
              globals('[', value.join(), ']');
            }
            break;
          default:
            globals(env.link(value));
            break;
        }
        globals(';');
      }
    });

    function appendBlock(env, block) {
      keys.forEach(function (key) {
        var value = object[key];
        if (!dynamic.isDynamic(value)) {
          return;
        }
        var ref = env.invoke(block, value);
        block(objectRef, '.', key, '=', ref, ';');
      });
    }

    options.dynamic[name] = new dynamic.DynamicVariable(DYN_THUNK, {
      thisDep: thisDep,
      contextDep: contextDep,
      propDep: propDep,
      ref: objectRef,
      append: appendBlock
    });
    delete options.static[name];
  }

  // ===========================================================================
  // ===========================================================================
  // MAIN DRAW COMMAND
  // ===========================================================================
  // ===========================================================================
  function compileCommand(options, attributes, uniforms, context, stats) {
    var env = createREGLEnvironment();

    // link stats, so that we can easily access it in the program.
    env.stats = env.link(stats);

    // splat options and attributes to allow for dynamic nested properties
    Object.keys(attributes.static).forEach(function (key) {
      splatObject(env, attributes, key);
    });
    NESTED_OPTIONS.forEach(function (name) {
      splatObject(env, options, name);
    });

    var args = parseArguments(options, attributes, uniforms, context, env);

    emitDrawProc(env, args);
    emitScopeProc(env, args);
    emitBatchProc(env, args);

    return env.compile();
  }

  // ===========================================================================
  // ===========================================================================
  // POLL / REFRESH
  // ===========================================================================
  // ===========================================================================
  return {
    next: nextState,
    current: currentState,
    procs: function () {
      var env = createREGLEnvironment();
      var poll = env.proc('poll');
      var refresh = env.proc('refresh');
      var common = env.block();
      poll(common);
      refresh(common);

      var shared = env.shared;
      var GL = shared.gl;
      var NEXT_STATE = shared.next;
      var CURRENT_STATE = shared.current;

      common(CURRENT_STATE, '.dirty=false;');

      emitPollFramebuffer(env, poll);
      emitPollFramebuffer(env, refresh, null, true);

      // Refresh updates all attribute state changes
      var extInstancing = gl.getExtension('angle_instanced_arrays');
      var INSTANCING;
      if (extInstancing) {
        INSTANCING = env.link(extInstancing);
      }
      for (var i = 0; i < limits.maxAttributes; ++i) {
        var BINDING = refresh.def(shared.attributes, '[', i, ']');
        var ifte = env.cond(BINDING, '.buffer');
        ifte.then(GL, '.enableVertexAttribArray(', i, ');', GL, '.bindBuffer(', GL_ARRAY_BUFFER, ',', BINDING, '.buffer.buffer);', GL, '.vertexAttribPointer(', i, ',', BINDING, '.size,', BINDING, '.type,', BINDING, '.normalized,', BINDING, '.stride,', BINDING, '.offset);').else(GL, '.disableVertexAttribArray(', i, ');', GL, '.vertexAttrib4f(', i, ',', BINDING, '.x,', BINDING, '.y,', BINDING, '.z,', BINDING, '.w);', BINDING, '.buffer=null;');
        refresh(ifte);
        if (extInstancing) {
          refresh(INSTANCING, '.vertexAttribDivisorANGLE(', i, ',', BINDING, '.divisor);');
        }
      }

      Object.keys(GL_FLAGS).forEach(function (flag) {
        var cap = GL_FLAGS[flag];
        var NEXT = common.def(NEXT_STATE, '.', flag);
        var block = env.block();
        block('if(', NEXT, '){', GL, '.enable(', cap, ')}else{', GL, '.disable(', cap, ')}', CURRENT_STATE, '.', flag, '=', NEXT, ';');
        refresh(block);
        poll('if(', NEXT, '!==', CURRENT_STATE, '.', flag, '){', block, '}');
      });

      Object.keys(GL_VARIABLES).forEach(function (name) {
        var func = GL_VARIABLES[name];
        var init = currentState[name];
        var NEXT, CURRENT;
        var block = env.block();
        block(GL, '.', func, '(');
        if (isArrayLike(init)) {
          var n = init.length;
          NEXT = env.global.def(NEXT_STATE, '.', name);
          CURRENT = env.global.def(CURRENT_STATE, '.', name);
          block(loop(n, function (i) {
            return NEXT + '[' + i + ']';
          }), ');', loop(n, function (i) {
            return CURRENT + '[' + i + ']=' + NEXT + '[' + i + '];';
          }).join(''));
          poll('if(', loop(n, function (i) {
            return NEXT + '[' + i + ']!==' + CURRENT + '[' + i + ']';
          }).join('||'), '){', block, '}');
        } else {
          NEXT = common.def(NEXT_STATE, '.', name);
          CURRENT = common.def(CURRENT_STATE, '.', name);
          block(NEXT, ');', CURRENT_STATE, '.', name, '=', NEXT, ';');
          poll('if(', NEXT, '!==', CURRENT, '){', block, '}');
        }
        refresh(block);
      });

      return env.compile();
    }(),
    compile: compileCommand
  };
};

},{"./constants/dtypes.json":5,"./constants/primitives.json":6,"./dynamic":9,"./util/codegen":22,"./util/is-array-like":25,"./util/is-ndarray":26,"./util/is-typed-array":27,"./util/loop":28}],9:[function(require,module,exports){
var VARIABLE_COUNTER = 0;

var DYN_FUNC = 0;

function DynamicVariable(type, data) {
  this.id = VARIABLE_COUNTER++;
  this.type = type;
  this.data = data;
}

function escapeStr(str) {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function splitParts(str) {
  if (str.length === 0) {
    return [];
  }

  var firstChar = str.charAt(0);
  var lastChar = str.charAt(str.length - 1);

  if (str.length > 1 && firstChar === lastChar && (firstChar === '"' || firstChar === "'")) {
    return ['"' + escapeStr(str.substr(1, str.length - 2)) + '"'];
  }

  var parts = /\[(false|true|null|\d+|'[^']*'|"[^"]*")\]/.exec(str);
  if (parts) {
    return splitParts(str.substr(0, parts.index)).concat(splitParts(parts[1])).concat(splitParts(str.substr(parts.index + parts[0].length)));
  }

  var subparts = str.split('.');
  if (subparts.length === 1) {
    return ['"' + escapeStr(str) + '"'];
  }

  var result = [];
  for (var i = 0; i < subparts.length; ++i) {
    result = result.concat(splitParts(subparts[i]));
  }
  return result;
}

function toAccessorString(str) {
  return '[' + splitParts(str).join('][') + ']';
}

function defineDynamic(type, data) {
  return new DynamicVariable(type, toAccessorString(data + ''));
}

function isDynamic(x) {
  return typeof x === 'function' && !x._reglType || x instanceof DynamicVariable;
}

function unbox(x, path) {
  if (typeof x === 'function') {
    return new DynamicVariable(DYN_FUNC, x);
  }
  return x;
}

module.exports = {
  DynamicVariable: DynamicVariable,
  define: defineDynamic,
  isDynamic: isDynamic,
  unbox: unbox,
  accessor: toAccessorString
};

},{}],10:[function(require,module,exports){

var isTypedArray = require('./util/is-typed-array');
var isNDArrayLike = require('./util/is-ndarray');
var values = require('./util/values');

var primTypes = require('./constants/primitives.json');
var usageTypes = require('./constants/usage.json');

var GL_POINTS = 0;
var GL_LINES = 1;
var GL_TRIANGLES = 4;

var GL_BYTE = 5120;
var GL_UNSIGNED_BYTE = 5121;
var GL_SHORT = 5122;
var GL_UNSIGNED_SHORT = 5123;
var GL_INT = 5124;
var GL_UNSIGNED_INT = 5125;

var GL_ELEMENT_ARRAY_BUFFER = 34963;

var GL_STREAM_DRAW = 0x88E0;
var GL_STATIC_DRAW = 0x88E4;

module.exports = function wrapElementsState(gl, extensions, bufferState, stats) {
  var elementSet = {};
  var elementCount = 0;

  var elementTypes = {
    'uint8': GL_UNSIGNED_BYTE,
    'uint16': GL_UNSIGNED_SHORT
  };

  if (extensions.oes_element_index_uint) {
    elementTypes.uint32 = GL_UNSIGNED_INT;
  }

  function REGLElementBuffer(buffer) {
    this.id = elementCount++;
    elementSet[this.id] = this;
    this.buffer = buffer;
    this.primType = GL_TRIANGLES;
    this.vertCount = 0;
    this.type = 0;
  }

  REGLElementBuffer.prototype.bind = function () {
    this.buffer.bind();
  };

  var bufferPool = [];

  function createElementStream(data) {
    var result = bufferPool.pop();
    if (!result) {
      result = new REGLElementBuffer(bufferState.create(null, GL_ELEMENT_ARRAY_BUFFER, true, false)._buffer);
    }
    initElements(result, data, GL_STREAM_DRAW, -1, -1, 0, 0);
    return result;
  }

  function destroyElementStream(elements) {
    bufferPool.push(elements);
  }

  function initElements(elements, data, usage, prim, count, byteLength, type) {
    elements.buffer.bind();
    if (data) {
      var predictedType = type;
      if (!type && (!isTypedArray(data) || isNDArrayLike(data) && !isTypedArray(data.data))) {
        predictedType = extensions.oes_element_index_uint ? GL_UNSIGNED_INT : GL_UNSIGNED_SHORT;
      }
      bufferState._initBuffer(elements.buffer, data, usage, predictedType, 3);
    } else {
      gl.bufferData(GL_ELEMENT_ARRAY_BUFFER, byteLength, usage);
      elements.buffer.dtype = dtype || GL_UNSIGNED_BYTE;
      elements.buffer.usage = usage;
      elements.buffer.dimension = 3;
      elements.buffer.byteLength = byteLength;
    }

    var dtype = type;
    if (!type) {
      switch (elements.buffer.dtype) {
        case GL_UNSIGNED_BYTE:
        case GL_BYTE:
          dtype = GL_UNSIGNED_BYTE;
          break;

        case GL_UNSIGNED_SHORT:
        case GL_SHORT:
          dtype = GL_UNSIGNED_SHORT;
          break;

        case GL_UNSIGNED_INT:
        case GL_INT:
          dtype = GL_UNSIGNED_INT;
          break;

        default:

      }
      elements.buffer.dtype = dtype;
    }
    elements.type = dtype;

    // Check oes_element_index_uint extension


    // try to guess default primitive type and arguments
    var vertCount = count;
    if (vertCount < 0) {
      vertCount = elements.buffer.byteLength;
      if (dtype === GL_UNSIGNED_SHORT) {
        vertCount >>= 1;
      } else if (dtype === GL_UNSIGNED_INT) {
        vertCount >>= 2;
      }
    }
    elements.vertCount = vertCount;

    // try to guess primitive type from cell dimension
    var primType = prim;
    if (prim < 0) {
      primType = GL_TRIANGLES;
      var dimension = elements.buffer.dimension;
      if (dimension === 1) primType = GL_POINTS;
      if (dimension === 2) primType = GL_LINES;
      if (dimension === 3) primType = GL_TRIANGLES;
    }
    elements.primType = primType;
  }

  function destroyElements(elements) {
    stats.elementsCount--;

    delete elementSet[elements.id];
    elements.buffer.destroy();
    elements.buffer = null;
  }

  function createElements(options, persistent) {
    var buffer = bufferState.create(null, GL_ELEMENT_ARRAY_BUFFER, true);
    var elements = new REGLElementBuffer(buffer._buffer);
    stats.elementsCount++;

    function reglElements(options) {
      if (!options) {
        buffer();
        elements.primType = GL_TRIANGLES;
        elements.vertCount = 0;
        elements.type = GL_UNSIGNED_BYTE;
      } else if (typeof options === 'number') {
        buffer(options);
        elements.primType = GL_TRIANGLES;
        elements.vertCount = options | 0;
        elements.type = GL_UNSIGNED_BYTE;
      } else {
        var data = null;
        var usage = GL_STATIC_DRAW;
        var primType = -1;
        var vertCount = -1;
        var byteLength = 0;
        var dtype = 0;
        if (Array.isArray(options) || isTypedArray(options) || isNDArrayLike(options)) {
          data = options;
        } else {

          if ('data' in options) {
            data = options.data;
          }
          if ('usage' in options) {

            usage = usageTypes[options.usage];
          }
          if ('primitive' in options) {

            primType = primTypes[options.primitive];
          }
          if ('count' in options) {

            vertCount = options.count | 0;
          }
          if ('type' in options) {

            dtype = elementTypes[options.type];
          }
          if ('length' in options) {
            byteLength = options.length | 0;
          } else {
            byteLength = vertCount;
            if (dtype === GL_UNSIGNED_SHORT || dtype === GL_SHORT) {
              byteLength *= 2;
            } else if (dtype === GL_UNSIGNED_INT || dtype === GL_INT) {
              byteLength *= 4;
            }
          }
        }
        initElements(elements, data, usage, primType, vertCount, byteLength, dtype);
      }

      return reglElements;
    }

    reglElements(options);

    reglElements._reglType = 'elements';
    reglElements._elements = elements;
    reglElements.subdata = function (data, offset) {
      buffer.subdata(data, offset);
      return reglElements;
    };
    reglElements.destroy = function () {
      destroyElements(elements);
    };

    return reglElements;
  }

  return {
    create: createElements,
    createStream: createElementStream,
    destroyStream: destroyElementStream,
    getElements: function (elements) {
      if (typeof elements === 'function' && elements._elements instanceof REGLElementBuffer) {
        return elements._elements;
      }
      return null;
    },
    clear: function () {
      values(elementSet).forEach(destroyElements);
    }
  };
};

},{"./constants/primitives.json":6,"./constants/usage.json":7,"./util/is-ndarray":26,"./util/is-typed-array":27,"./util/values":32}],11:[function(require,module,exports){


module.exports = function createExtensionCache(gl, config) {
  var extensions = {};

  function tryLoadExtension(name_) {

    var name = name_.toLowerCase();
    var ext;
    try {
      ext = extensions[name] = gl.getExtension(name);
    } catch (e) {}
    return !!ext;
  }

  for (var i = 0; i < config.extensions.length; ++i) {
    var name = config.extensions[i];
    if (!tryLoadExtension(name)) {
      config.onDestroy();
      config.onDone('"' + name + '" extension is not supported by the current WebGL context, try upgrading your system or a different browser');
      return null;
    }
  }

  config.optionalExtensions.forEach(tryLoadExtension);

  return {
    extensions: extensions,
    restore: function () {
      Object.keys(extensions).forEach(function (name) {
        if (!tryLoadExtension(name)) {
          throw new Error('(regl): error restoring extension ' + name);
        }
      });
    }
  };
};

},{}],12:[function(require,module,exports){

var values = require('./util/values');
var extend = require('./util/extend');

// We store these constants so that the minifier can inline them
var GL_FRAMEBUFFER = 0x8D40;
var GL_RENDERBUFFER = 0x8D41;

var GL_TEXTURE_2D = 0x0DE1;
var GL_TEXTURE_CUBE_MAP_POSITIVE_X = 0x8515;

var GL_COLOR_ATTACHMENT0 = 0x8CE0;
var GL_DEPTH_ATTACHMENT = 0x8D00;
var GL_STENCIL_ATTACHMENT = 0x8D20;
var GL_DEPTH_STENCIL_ATTACHMENT = 0x821A;

var GL_FRAMEBUFFER_COMPLETE = 0x8CD5;
var GL_FRAMEBUFFER_INCOMPLETE_ATTACHMENT = 0x8CD6;
var GL_FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT = 0x8CD7;
var GL_FRAMEBUFFER_INCOMPLETE_DIMENSIONS = 0x8CD9;
var GL_FRAMEBUFFER_UNSUPPORTED = 0x8CDD;

var GL_HALF_FLOAT_OES = 0x8D61;
var GL_UNSIGNED_BYTE = 0x1401;
var GL_FLOAT = 0x1406;

var GL_RGBA = 0x1908;

var GL_DEPTH_COMPONENT = 0x1902;

var colorTextureFormatEnums = [GL_RGBA];

// for every texture format, store
// the number of channels
var textureFormatChannels = [];
textureFormatChannels[GL_RGBA] = 4;

// for every texture type, store
// the size in bytes.
var textureTypeSizes = [];
textureTypeSizes[GL_UNSIGNED_BYTE] = 1;
textureTypeSizes[GL_FLOAT] = 4;
textureTypeSizes[GL_HALF_FLOAT_OES] = 2;

var GL_RGBA4 = 0x8056;
var GL_RGB5_A1 = 0x8057;
var GL_RGB565 = 0x8D62;
var GL_DEPTH_COMPONENT16 = 0x81A5;
var GL_STENCIL_INDEX8 = 0x8D48;
var GL_DEPTH_STENCIL = 0x84F9;

var GL_SRGB8_ALPHA8_EXT = 0x8C43;

var GL_RGBA32F_EXT = 0x8814;

var GL_RGBA16F_EXT = 0x881A;
var GL_RGB16F_EXT = 0x881B;

var colorRenderbufferFormatEnums = [GL_RGBA4, GL_RGB5_A1, GL_RGB565, GL_SRGB8_ALPHA8_EXT, GL_RGBA16F_EXT, GL_RGB16F_EXT, GL_RGBA32F_EXT];

var statusCode = {};
statusCode[GL_FRAMEBUFFER_COMPLETE] = 'complete';
statusCode[GL_FRAMEBUFFER_INCOMPLETE_ATTACHMENT] = 'incomplete attachment';
statusCode[GL_FRAMEBUFFER_INCOMPLETE_DIMENSIONS] = 'incomplete dimensions';
statusCode[GL_FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT] = 'incomplete, missing attachment';
statusCode[GL_FRAMEBUFFER_UNSUPPORTED] = 'unsupported';

module.exports = function wrapFBOState(gl, extensions, limits, textureState, renderbufferState, stats) {
  var framebufferState = {
    cur: null,
    next: null,
    dirty: false
  };

  var colorTextureFormats = ['rgba'];
  var colorRenderbufferFormats = ['rgba4', 'rgb565', 'rgb5 a1'];

  if (extensions.ext_srgb) {
    colorRenderbufferFormats.push('srgba');
  }

  if (extensions.ext_color_buffer_half_float) {
    colorRenderbufferFormats.push('rgba16f', 'rgb16f');
  }

  if (extensions.webgl_color_buffer_float) {
    colorRenderbufferFormats.push('rgba32f');
  }

  var colorTypes = ['uint8'];
  if (extensions.oes_texture_half_float) {
    colorTypes.push('half float', 'float16');
  }
  if (extensions.oes_texture_float) {
    colorTypes.push('float', 'float32');
  }

  function FramebufferAttachment(target, texture, renderbuffer) {
    this.target = target;
    this.texture = texture;
    this.renderbuffer = renderbuffer;

    var w = 0;
    var h = 0;
    if (texture) {
      w = texture.width;
      h = texture.height;
    } else if (renderbuffer) {
      w = renderbuffer.width;
      h = renderbuffer.height;
    }
    this.width = w;
    this.height = h;
  }

  function decRef(attachment) {
    if (attachment) {
      if (attachment.texture) {
        attachment.texture._texture.decRef();
      }
      if (attachment.renderbuffer) {
        attachment.renderbuffer._renderbuffer.decRef();
      }
    }
  }

  function incRefAndCheckShape(attachment, width, height) {
    if (!attachment) {
      return;
    }
    if (attachment.texture) {
      var texture = attachment.texture._texture;
      var tw = Math.max(1, texture.width);
      var th = Math.max(1, texture.height);

      texture.refCount += 1;
    } else {
      var renderbuffer = attachment.renderbuffer._renderbuffer;

      renderbuffer.refCount += 1;
    }
  }

  function attach(location, attachment) {
    if (attachment) {
      if (attachment.texture) {
        gl.framebufferTexture2D(GL_FRAMEBUFFER, location, attachment.target, attachment.texture._texture.texture, 0);
      } else {
        gl.framebufferRenderbuffer(GL_FRAMEBUFFER, location, GL_RENDERBUFFER, attachment.renderbuffer._renderbuffer.renderbuffer);
      }
    }
  }

  function parseAttachment(attachment) {
    var target = GL_TEXTURE_2D;
    var texture = null;
    var renderbuffer = null;

    var data = attachment;
    if (typeof attachment === 'object') {
      data = attachment.data;
      if ('target' in attachment) {
        target = attachment.target | 0;
      }
    }

    var type = data._reglType;
    if (type === 'texture2d') {
      texture = data;
    } else if (type === 'textureCube') {
      texture = data;
    } else if (type === 'renderbuffer') {
      renderbuffer = data;
      target = GL_RENDERBUFFER;
    } else {}

    return new FramebufferAttachment(target, texture, renderbuffer);
  }

  function allocAttachment(width, height, isTexture, format, type) {
    if (isTexture) {
      var texture = textureState.create2D({
        width: width,
        height: height,
        format: format,
        type: type
      });
      texture._texture.refCount = 0;
      return new FramebufferAttachment(GL_TEXTURE_2D, texture, null);
    } else {
      var rb = renderbufferState.create({
        width: width,
        height: height,
        format: format
      });
      rb._renderbuffer.refCount = 0;
      return new FramebufferAttachment(GL_RENDERBUFFER, null, rb);
    }
  }

  function unwrapAttachment(attachment) {
    return attachment && (attachment.texture || attachment.renderbuffer);
  }

  function resizeAttachment(attachment, w, h) {
    if (attachment) {
      if (attachment.texture) {
        attachment.texture.resize(w, h);
      } else if (attachment.renderbuffer) {
        attachment.renderbuffer.resize(w, h);
      }
    }
  }

  var framebufferCount = 0;
  var framebufferSet = {};

  function REGLFramebuffer() {
    this.id = framebufferCount++;
    framebufferSet[this.id] = this;

    this.framebuffer = gl.createFramebuffer();
    this.width = 0;
    this.height = 0;

    this.colorAttachments = [];
    this.depthAttachment = null;
    this.stencilAttachment = null;
    this.depthStencilAttachment = null;
  }

  function decFBORefs(framebuffer) {
    framebuffer.colorAttachments.forEach(decRef);
    decRef(framebuffer.depthAttachment);
    decRef(framebuffer.stencilAttachment);
    decRef(framebuffer.depthStencilAttachment);
  }

  function destroy(framebuffer) {
    var handle = framebuffer.framebuffer;

    gl.deleteFramebuffer(handle);
    framebuffer.framebuffer = null;
    stats.framebufferCount--;
    delete framebufferSet[framebuffer.id];
  }

  function updateFramebuffer(framebuffer) {
    var i;

    gl.bindFramebuffer(GL_FRAMEBUFFER, framebuffer.framebuffer);
    var colorAttachments = framebuffer.colorAttachments;
    for (i = 0; i < colorAttachments.length; ++i) {
      attach(GL_COLOR_ATTACHMENT0 + i, colorAttachments[i]);
    }
    for (i = colorAttachments.length; i < limits.maxColorAttachments; ++i) {
      gl.framebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0 + i, GL_TEXTURE_2D, null, 0);
    }

    gl.framebufferTexture2D(GL_FRAMEBUFFER, GL_DEPTH_STENCIL_ATTACHMENT, GL_TEXTURE_2D, null, 0);
    gl.framebufferTexture2D(GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT, GL_TEXTURE_2D, null, 0);
    gl.framebufferTexture2D(GL_FRAMEBUFFER, GL_STENCIL_ATTACHMENT, GL_TEXTURE_2D, null, 0);

    attach(GL_DEPTH_ATTACHMENT, framebuffer.depthAttachment);
    attach(GL_STENCIL_ATTACHMENT, framebuffer.stencilAttachment);
    attach(GL_DEPTH_STENCIL_ATTACHMENT, framebuffer.depthStencilAttachment);

    // Check status code
    var status = gl.checkFramebufferStatus(GL_FRAMEBUFFER);
    if (status !== GL_FRAMEBUFFER_COMPLETE) {}

    gl.bindFramebuffer(GL_FRAMEBUFFER, framebufferState.next);
    framebufferState.cur = framebufferState.next;

    // FIXME: Clear error code here.  This is a work around for a bug in
    // headless-gl
    gl.getError();
  }

  function createFBO(a0, a1) {
    var framebuffer = new REGLFramebuffer();
    stats.framebufferCount++;

    function reglFramebuffer(a, b) {
      var i;

      var extDrawBuffers = extensions.webgl_draw_buffers;

      var width = 0;
      var height = 0;

      var needsDepth = true;
      var needsStencil = true;

      var colorBuffer = null;
      var colorTexture = true;
      var colorFormat = 'rgba';
      var colorType = 'uint8';
      var colorCount = 1;

      var depthBuffer = null;
      var stencilBuffer = null;
      var depthStencilBuffer = null;
      var depthStencilTexture = false;

      if (typeof a === 'number') {
        width = a | 0;
        height = b | 0 || width;
      } else if (!a) {
        width = height = 1;
      } else {

        var options = a;

        if ('shape' in options) {
          var shape = options.shape;

          width = shape[0];
          height = shape[1];
        } else {
          if ('radius' in options) {
            width = height = options.radius;
          }
          if ('width' in options) {
            width = options.width;
          }
          if ('height' in options) {
            height = options.height;
          }
        }

        if ('color' in options || 'colors' in options) {
          colorBuffer = options.color || options.colors;
          if (Array.isArray(colorBuffer)) {}
        }

        if (!colorBuffer) {
          if ('colorCount' in options) {
            colorCount = options.colorCount | 0;
          }

          if ('colorTexture' in options) {
            colorTexture = !!options.colorTexture;
            colorFormat = 'rgba4';
          }

          if ('colorType' in options) {
            colorType = options.colorType;
            if (!colorTexture) {
              if (colorType === 'half float' || colorType === 'float16') {

                colorFormat = 'rgba16f';
              } else if (colorType === 'float' || colorType === 'float32') {

                colorFormat = 'rgba32f';
              }
            } else {}
          }

          if ('colorFormat' in options) {
            colorFormat = options.colorFormat;
            if (colorTextureFormats.indexOf(colorFormat) >= 0) {
              colorTexture = true;
            } else if (colorRenderbufferFormats.indexOf(colorFormat) >= 0) {
              colorTexture = false;
            } else {
              if (colorTexture) {} else {}
            }
          }
        }

        if ('depthTexture' in options || 'depthStencilTexture' in options) {
          depthStencilTexture = !!(options.depthTexture || options.depthStencilTexture);
        }

        if ('depth' in options) {
          if (typeof options.depth === 'boolean') {
            needsDepth = options.depth;
          } else {
            depthBuffer = options.depth;
            needsStencil = false;
          }
        }

        if ('stencil' in options) {
          if (typeof options.stencil === 'boolean') {
            needsStencil = options.stencil;
          } else {
            stencilBuffer = options.stencil;
            needsDepth = false;
          }
        }

        if ('depthStencil' in options) {
          if (typeof options.depthStencil === 'boolean') {
            needsDepth = needsStencil = options.depthStencil;
          } else {
            depthStencilBuffer = options.depthStencil;
            needsDepth = false;
            needsStencil = false;
          }
        }
      }

      // parse attachments
      var colorAttachments = null;
      var depthAttachment = null;
      var stencilAttachment = null;
      var depthStencilAttachment = null;

      // Set up color attachments
      if (Array.isArray(colorBuffer)) {
        colorAttachments = colorBuffer.map(parseAttachment);
      } else if (colorBuffer) {
        colorAttachments = [parseAttachment(colorBuffer)];
      } else {
        colorAttachments = new Array(colorCount);
        for (i = 0; i < colorCount; ++i) {
          colorAttachments[i] = allocAttachment(width, height, colorTexture, colorFormat, colorType);
        }
      }

      width = width || colorAttachments[0].width;
      height = height || colorAttachments[0].height;

      if (depthBuffer) {
        depthAttachment = parseAttachment(depthBuffer);
      } else if (needsDepth && !needsStencil) {
        depthAttachment = allocAttachment(width, height, depthStencilTexture, 'depth', 'uint32');
      }

      if (stencilBuffer) {
        stencilAttachment = parseAttachment(stencilBuffer);
      } else if (needsStencil && !needsDepth) {
        stencilAttachment = allocAttachment(width, height, false, 'stencil', 'uint8');
      }

      if (depthStencilBuffer) {
        depthStencilAttachment = parseAttachment(depthStencilBuffer);
      } else if (!depthBuffer && !stencilBuffer && needsStencil && needsDepth) {
        depthStencilAttachment = allocAttachment(width, height, depthStencilTexture, 'depth stencil', 'depth stencil');
      }

      var commonColorAttachmentSize = null;

      for (i = 0; i < colorAttachments.length; ++i) {
        incRefAndCheckShape(colorAttachments[i], width, height);

        if (colorAttachments[i] && colorAttachments[i].texture) {
          var colorAttachmentSize = textureFormatChannels[colorAttachments[i].texture._texture.format] * textureTypeSizes[colorAttachments[i].texture._texture.type];

          if (commonColorAttachmentSize === null) {
            commonColorAttachmentSize = colorAttachmentSize;
          } else {
            // We need to make sure that all color attachments have the same number of bitplanes
            // (that is, the same numer of bits per pixel)
            // This is required by the GLES2.0 standard. See the beginning of Chapter 4 in that document.

          }
        }
      }
      incRefAndCheckShape(depthAttachment, width, height);

      incRefAndCheckShape(stencilAttachment, width, height);

      incRefAndCheckShape(depthStencilAttachment, width, height);

      // decrement references
      decFBORefs(framebuffer);

      framebuffer.width = width;
      framebuffer.height = height;

      framebuffer.colorAttachments = colorAttachments;
      framebuffer.depthAttachment = depthAttachment;
      framebuffer.stencilAttachment = stencilAttachment;
      framebuffer.depthStencilAttachment = depthStencilAttachment;

      reglFramebuffer.color = colorAttachments.map(unwrapAttachment);
      reglFramebuffer.depth = unwrapAttachment(depthAttachment);
      reglFramebuffer.stencil = unwrapAttachment(stencilAttachment);
      reglFramebuffer.depthStencil = unwrapAttachment(depthStencilAttachment);

      reglFramebuffer.width = framebuffer.width;
      reglFramebuffer.height = framebuffer.height;

      updateFramebuffer(framebuffer);

      return reglFramebuffer;
    }

    function resize(w_, h_) {

      var w = w_ | 0;
      var h = h_ | 0 || w;
      if (w === framebuffer.width && h === framebuffer.height) {
        return reglFramebuffer;
      }

      // resize all buffers
      var colorAttachments = framebuffer.colorAttachments;
      for (var i = 0; i < colorAttachments.length; ++i) {
        resizeAttachment(colorAttachments[i], w, h);
      }
      resizeAttachment(framebuffer.depthAttachment, w, h);
      resizeAttachment(framebuffer.stencilAttachment, w, h);
      resizeAttachment(framebuffer.depthStencilAttachment, w, h);

      framebuffer.width = reglFramebuffer.width = w;
      framebuffer.height = reglFramebuffer.height = h;

      updateFramebuffer(framebuffer);

      return reglFramebuffer;
    }

    reglFramebuffer(a0, a1);

    return extend(reglFramebuffer, {
      resize: resize,
      _reglType: 'framebuffer',
      _framebuffer: framebuffer,
      destroy: function () {
        destroy(framebuffer);
        decFBORefs(framebuffer);
      }
    });
  }

  function createCubeFBO(options) {
    var faces = Array(6);

    function reglFramebufferCube(a) {
      var i;

      var extDrawBuffers = extensions.webgl_draw_buffers;

      var params = {
        color: null
      };

      var radius = 0;

      var colorBuffer = null;
      var colorFormat = 'rgba';
      var colorType = 'uint8';
      var colorCount = 1;

      if (typeof a === 'number') {
        radius = a | 0;
      } else if (!a) {
        radius = 1;
      } else {

        var options = a;

        if ('shape' in options) {
          var shape = options.shape;

          radius = shape[0];
        } else {
          if ('radius' in options) {
            radius = options.radius | 0;
          }
          if ('width' in options) {
            radius = options.width | 0;
            if ('height' in options) {}
          } else if ('height' in options) {
            radius = options.height | 0;
          }
        }

        if ('color' in options || 'colors' in options) {
          colorBuffer = options.color || options.colors;
          if (Array.isArray(colorBuffer)) {}
        }

        if (!colorBuffer) {
          if ('colorCount' in options) {
            colorCount = options.colorCount | 0;
          }

          if ('colorType' in options) {

            colorType = options.colorType;
          }

          if ('colorFormat' in options) {
            colorFormat = options.colorFormat;
          }
        }

        if ('depth' in options) {
          params.depth = options.depth;
        }

        if ('stencil' in options) {
          params.stencil = options.stencil;
        }

        if ('depthStencil' in options) {
          params.depthStencil = options.depthStencil;
        }
      }

      var colorCubes;
      if (colorBuffer) {
        if (Array.isArray(colorBuffer)) {
          colorCubes = [];
          for (i = 0; i < colorBuffer.length; ++i) {
            colorCubes[i] = colorBuffer[i];
          }
        } else {
          colorCubes = [colorBuffer];
        }
      } else {
        colorCubes = Array(colorCount);
        var cubeMapParams = {
          radius: radius,
          format: colorFormat,
          type: colorType
        };
        for (i = 0; i < colorCount; ++i) {
          colorCubes[i] = textureState.createCube(cubeMapParams);
        }
      }

      // Check color cubes
      params.color = Array(colorCubes.length);
      for (i = 0; i < colorCubes.length; ++i) {
        var cube = colorCubes[i];

        radius = radius || cube.width;

        params.color[i] = {
          target: GL_TEXTURE_CUBE_MAP_POSITIVE_X,
          data: colorCubes[i]
        };
      }

      for (i = 0; i < 6; ++i) {
        for (var j = 0; j < colorCubes.length; ++j) {
          params.color[j].target = GL_TEXTURE_CUBE_MAP_POSITIVE_X + i;
        }
        // reuse depth-stencil attachments across all cube maps
        if (i > 0) {
          params.depth = faces[0].depth;
          params.stencil = faces[0].stencil;
          params.depthStencil = faces[0].depthStencil;
        }
        if (faces[i]) {
          faces[i](params);
        } else {
          faces[i] = createFBO(params);
        }
      }

      return extend(reglFramebufferCube, {
        width: radius,
        height: radius,
        color: colorCubes
      });
    }

    function resize(radius_) {
      var i;
      var radius = radius_ | 0;

      if (radius === reglFramebufferCube.width) {
        return reglFramebufferCube;
      }

      var colors = reglFramebufferCube.color;
      for (i = 0; i < colors.length; ++i) {
        colors[i].resize(radius);
      }

      for (i = 0; i < 6; ++i) {
        faces[i].resize(radius);
      }

      reglFramebufferCube.width = reglFramebufferCube.height = radius;

      return reglFramebufferCube;
    }

    reglFramebufferCube(options);

    return extend(reglFramebufferCube, {
      faces: faces,
      resize: resize,
      _reglType: 'framebufferCube',
      destroy: function () {
        faces.forEach(function (f) {
          f.destroy();
        });
      }
    });
  }

  function restoreFramebuffers() {
    values(framebufferSet).forEach(function (fb) {
      fb.framebuffer = gl.createFramebuffer();
      updateFramebuffer(fb);
    });
  }

  return extend(framebufferState, {
    getFramebuffer: function (object) {
      if (typeof object === 'function' && object._reglType === 'framebuffer') {
        var fbo = object._framebuffer;
        if (fbo instanceof REGLFramebuffer) {
          return fbo;
        }
      }
      return null;
    },
    create: createFBO,
    createCube: createCubeFBO,
    clear: function () {
      values(framebufferSet).forEach(destroy);
    },
    restore: restoreFramebuffers
  });
};

},{"./util/extend":23,"./util/values":32}],13:[function(require,module,exports){
var GL_SUBPIXEL_BITS = 0x0D50;
var GL_RED_BITS = 0x0D52;
var GL_GREEN_BITS = 0x0D53;
var GL_BLUE_BITS = 0x0D54;
var GL_ALPHA_BITS = 0x0D55;
var GL_DEPTH_BITS = 0x0D56;
var GL_STENCIL_BITS = 0x0D57;

var GL_ALIASED_POINT_SIZE_RANGE = 0x846D;
var GL_ALIASED_LINE_WIDTH_RANGE = 0x846E;

var GL_MAX_TEXTURE_SIZE = 0x0D33;
var GL_MAX_VIEWPORT_DIMS = 0x0D3A;
var GL_MAX_VERTEX_ATTRIBS = 0x8869;
var GL_MAX_VERTEX_UNIFORM_VECTORS = 0x8DFB;
var GL_MAX_VARYING_VECTORS = 0x8DFC;
var GL_MAX_COMBINED_TEXTURE_IMAGE_UNITS = 0x8B4D;
var GL_MAX_VERTEX_TEXTURE_IMAGE_UNITS = 0x8B4C;
var GL_MAX_TEXTURE_IMAGE_UNITS = 0x8872;
var GL_MAX_FRAGMENT_UNIFORM_VECTORS = 0x8DFD;
var GL_MAX_CUBE_MAP_TEXTURE_SIZE = 0x851C;
var GL_MAX_RENDERBUFFER_SIZE = 0x84E8;

var GL_VENDOR = 0x1F00;
var GL_RENDERER = 0x1F01;
var GL_VERSION = 0x1F02;
var GL_SHADING_LANGUAGE_VERSION = 0x8B8C;

var GL_MAX_TEXTURE_MAX_ANISOTROPY_EXT = 0x84FF;

var GL_MAX_COLOR_ATTACHMENTS_WEBGL = 0x8CDF;
var GL_MAX_DRAW_BUFFERS_WEBGL = 0x8824;

module.exports = function (gl, extensions) {
  var maxAnisotropic = 1;
  if (extensions.ext_texture_filter_anisotropic) {
    maxAnisotropic = gl.getParameter(GL_MAX_TEXTURE_MAX_ANISOTROPY_EXT);
  }

  var maxDrawbuffers = 1;
  var maxColorAttachments = 1;
  if (extensions.webgl_draw_buffers) {
    maxDrawbuffers = gl.getParameter(GL_MAX_DRAW_BUFFERS_WEBGL);
    maxColorAttachments = gl.getParameter(GL_MAX_COLOR_ATTACHMENTS_WEBGL);
  }

  return {
    // drawing buffer bit depth
    colorBits: [gl.getParameter(GL_RED_BITS), gl.getParameter(GL_GREEN_BITS), gl.getParameter(GL_BLUE_BITS), gl.getParameter(GL_ALPHA_BITS)],
    depthBits: gl.getParameter(GL_DEPTH_BITS),
    stencilBits: gl.getParameter(GL_STENCIL_BITS),
    subpixelBits: gl.getParameter(GL_SUBPIXEL_BITS),

    // supported extensions
    extensions: Object.keys(extensions).filter(function (ext) {
      return !!extensions[ext];
    }),

    // max aniso samples
    maxAnisotropic: maxAnisotropic,

    // max draw buffers
    maxDrawbuffers: maxDrawbuffers,
    maxColorAttachments: maxColorAttachments,

    // point and line size ranges
    pointSizeDims: gl.getParameter(GL_ALIASED_POINT_SIZE_RANGE),
    lineWidthDims: gl.getParameter(GL_ALIASED_LINE_WIDTH_RANGE),
    maxViewportDims: gl.getParameter(GL_MAX_VIEWPORT_DIMS),
    maxCombinedTextureUnits: gl.getParameter(GL_MAX_COMBINED_TEXTURE_IMAGE_UNITS),
    maxCubeMapSize: gl.getParameter(GL_MAX_CUBE_MAP_TEXTURE_SIZE),
    maxRenderbufferSize: gl.getParameter(GL_MAX_RENDERBUFFER_SIZE),
    maxTextureUnits: gl.getParameter(GL_MAX_TEXTURE_IMAGE_UNITS),
    maxTextureSize: gl.getParameter(GL_MAX_TEXTURE_SIZE),
    maxAttributes: gl.getParameter(GL_MAX_VERTEX_ATTRIBS),
    maxVertexUniforms: gl.getParameter(GL_MAX_VERTEX_UNIFORM_VECTORS),
    maxVertexTextureUnits: gl.getParameter(GL_MAX_VERTEX_TEXTURE_IMAGE_UNITS),
    maxVaryingVectors: gl.getParameter(GL_MAX_VARYING_VECTORS),
    maxFragmentUniforms: gl.getParameter(GL_MAX_FRAGMENT_UNIFORM_VECTORS),

    // vendor info
    glsl: gl.getParameter(GL_SHADING_LANGUAGE_VERSION),
    renderer: gl.getParameter(GL_RENDERER),
    vendor: gl.getParameter(GL_VENDOR),
    version: gl.getParameter(GL_VERSION)
  };
};

},{}],14:[function(require,module,exports){

var isTypedArray = require('./util/is-typed-array');

var GL_RGBA = 6408;
var GL_UNSIGNED_BYTE = 5121;
var GL_PACK_ALIGNMENT = 0x0D05;
var GL_FLOAT = 0x1406; // 5126

module.exports = function wrapReadPixels(gl, framebufferState, reglPoll, context, glAttributes, extensions) {
  function readPixels(input) {
    var type;
    if (framebufferState.next === null) {

      type = GL_UNSIGNED_BYTE;
    } else {

      type = framebufferState.next.colorAttachments[0].texture._texture.type;

      if (extensions.oes_texture_float) {} else {}
    }

    var x = 0;
    var y = 0;
    var width = context.framebufferWidth;
    var height = context.framebufferHeight;
    var data = null;

    if (isTypedArray(input)) {
      data = input;
    } else if (input) {

      x = input.x | 0;
      y = input.y | 0;

      width = (input.width || context.framebufferWidth - x) | 0;
      height = (input.height || context.framebufferHeight - y) | 0;
      data = input.data || null;
    }

    // sanity check input.data
    if (data) {
      if (type === GL_UNSIGNED_BYTE) {} else if (type === GL_FLOAT) {}
    }

    // Update WebGL state
    reglPoll();

    // Compute size
    var size = width * height * 4;

    // Allocate data
    if (!data) {
      if (type === GL_UNSIGNED_BYTE) {
        data = new Uint8Array(size);
      } else if (type === GL_FLOAT) {
        data = data || new Float32Array(size);
      }
    }

    // Type check


    // Run read pixels
    gl.pixelStorei(GL_PACK_ALIGNMENT, 4);
    gl.readPixels(x, y, width, height, GL_RGBA, type, data);

    return data;
  }

  return readPixels;
};

},{"./util/is-typed-array":27}],15:[function(require,module,exports){

var values = require('./util/values');

var GL_RENDERBUFFER = 0x8D41;

var GL_RGBA4 = 0x8056;
var GL_RGB5_A1 = 0x8057;
var GL_RGB565 = 0x8D62;
var GL_DEPTH_COMPONENT16 = 0x81A5;
var GL_STENCIL_INDEX8 = 0x8D48;
var GL_DEPTH_STENCIL = 0x84F9;

var GL_SRGB8_ALPHA8_EXT = 0x8C43;

var GL_RGBA32F_EXT = 0x8814;

var GL_RGBA16F_EXT = 0x881A;
var GL_RGB16F_EXT = 0x881B;

var FORMAT_SIZES = [];

FORMAT_SIZES[GL_RGBA4] = 2;
FORMAT_SIZES[GL_RGB5_A1] = 2;
FORMAT_SIZES[GL_RGB565] = 2;

FORMAT_SIZES[GL_DEPTH_COMPONENT16] = 2;
FORMAT_SIZES[GL_STENCIL_INDEX8] = 1;
FORMAT_SIZES[GL_DEPTH_STENCIL] = 4;

FORMAT_SIZES[GL_SRGB8_ALPHA8_EXT] = 4;
FORMAT_SIZES[GL_RGBA32F_EXT] = 16;
FORMAT_SIZES[GL_RGBA16F_EXT] = 8;
FORMAT_SIZES[GL_RGB16F_EXT] = 6;

function getRenderbufferSize(format, width, height) {
  return FORMAT_SIZES[format] * width * height;
}

module.exports = function (gl, extensions, limits, stats, config) {
  var formatTypes = {
    'rgba4': GL_RGBA4,
    'rgb565': GL_RGB565,
    'rgb5 a1': GL_RGB5_A1,
    'depth': GL_DEPTH_COMPONENT16,
    'stencil': GL_STENCIL_INDEX8,
    'depth stencil': GL_DEPTH_STENCIL
  };

  if (extensions.ext_srgb) {
    formatTypes['srgba'] = GL_SRGB8_ALPHA8_EXT;
  }

  if (extensions.ext_color_buffer_half_float) {
    formatTypes['rgba16f'] = GL_RGBA16F_EXT;
    formatTypes['rgb16f'] = GL_RGB16F_EXT;
  }

  if (extensions.webgl_color_buffer_float) {
    formatTypes['rgba32f'] = GL_RGBA32F_EXT;
  }

  var formatTypesInvert = [];
  Object.keys(formatTypes).forEach(function (key) {
    var val = formatTypes[key];
    formatTypesInvert[val] = key;
  });

  var renderbufferCount = 0;
  var renderbufferSet = {};

  function REGLRenderbuffer(renderbuffer) {
    this.id = renderbufferCount++;
    this.refCount = 1;

    this.renderbuffer = renderbuffer;

    this.format = GL_RGBA4;
    this.width = 0;
    this.height = 0;

    if (config.profile) {
      this.stats = { size: 0 };
    }
  }

  REGLRenderbuffer.prototype.decRef = function () {
    if (--this.refCount <= 0) {
      destroy(this);
    }
  };

  function destroy(rb) {
    var handle = rb.renderbuffer;

    gl.bindRenderbuffer(GL_RENDERBUFFER, null);
    gl.deleteRenderbuffer(handle);
    rb.renderbuffer = null;
    rb.refCount = 0;
    delete renderbufferSet[rb.id];
    stats.renderbufferCount--;
  }

  function createRenderbuffer(a, b) {
    var renderbuffer = new REGLRenderbuffer(gl.createRenderbuffer());
    renderbufferSet[renderbuffer.id] = renderbuffer;
    stats.renderbufferCount++;

    function reglRenderbuffer(a, b) {
      var w = 0;
      var h = 0;
      var format = GL_RGBA4;

      if (typeof a === 'object' && a) {
        var options = a;
        if ('shape' in options) {
          var shape = options.shape;

          w = shape[0] | 0;
          h = shape[1] | 0;
        } else {
          if ('radius' in options) {
            w = h = options.radius | 0;
          }
          if ('width' in options) {
            w = options.width | 0;
          }
          if ('height' in options) {
            h = options.height | 0;
          }
        }
        if ('format' in options) {

          format = formatTypes[options.format];
        }
      } else if (typeof a === 'number') {
        w = a | 0;
        if (typeof b === 'number') {
          h = b | 0;
        } else {
          h = w;
        }
      } else if (!a) {
        w = h = 1;
      } else {}

      // check shape


      if (w === renderbuffer.width && h === renderbuffer.height && format === renderbuffer.format) {
        return;
      }

      reglRenderbuffer.width = renderbuffer.width = w;
      reglRenderbuffer.height = renderbuffer.height = h;
      renderbuffer.format = format;

      gl.bindRenderbuffer(GL_RENDERBUFFER, renderbuffer.renderbuffer);
      gl.renderbufferStorage(GL_RENDERBUFFER, format, w, h);

      if (config.profile) {
        renderbuffer.stats.size = getRenderbufferSize(renderbuffer.format, renderbuffer.width, renderbuffer.height);
      }
      reglRenderbuffer.format = formatTypesInvert[renderbuffer.format];

      return reglRenderbuffer;
    }

    function resize(w_, h_) {
      var w = w_ | 0;
      var h = h_ | 0 || w;

      if (w === renderbuffer.width && h === renderbuffer.height) {
        return reglRenderbuffer;
      }

      // check shape


      reglRenderbuffer.width = renderbuffer.width = w;
      reglRenderbuffer.height = renderbuffer.height = h;

      gl.bindRenderbuffer(GL_RENDERBUFFER, renderbuffer.renderbuffer);
      gl.renderbufferStorage(GL_RENDERBUFFER, renderbuffer.format, w, h);

      // also, recompute size.
      if (config.profile) {
        renderbuffer.stats.size = getRenderbufferSize(renderbuffer.format, renderbuffer.width, renderbuffer.height);
      }

      return reglRenderbuffer;
    }

    reglRenderbuffer(a, b);

    reglRenderbuffer.resize = resize;
    reglRenderbuffer._reglType = 'renderbuffer';
    reglRenderbuffer._renderbuffer = renderbuffer;
    if (config.profile) {
      reglRenderbuffer.stats = renderbuffer.stats;
    }
    reglRenderbuffer.destroy = function () {
      renderbuffer.decRef();
    };

    return reglRenderbuffer;
  }

  if (config.profile) {
    stats.getTotalRenderbufferSize = function () {
      var total = 0;
      Object.keys(renderbufferSet).forEach(function (key) {
        total += renderbufferSet[key].stats.size;
      });
      return total;
    };
  }

  function restoreRenderbuffers() {
    values(renderbufferSet).forEach(function (rb) {
      rb.renderbuffer = gl.createRenderbuffer();
      gl.bindRenderbuffer(GL_RENDERBUFFER, rb.renderbuffer);
      gl.renderbufferStorage(GL_RENDERBUFFER, rb.format, rb.width, rb.height);
    });
    gl.bindRenderbuffer(GL_RENDERBUFFER, null);
  }

  return {
    create: createRenderbuffer,
    clear: function () {
      values(renderbufferSet).forEach(destroy);
    },
    restore: restoreRenderbuffers
  };
};

},{"./util/values":32}],16:[function(require,module,exports){

var values = require('./util/values');

var GL_FRAGMENT_SHADER = 35632;
var GL_VERTEX_SHADER = 35633;

var GL_ACTIVE_UNIFORMS = 0x8B86;
var GL_ACTIVE_ATTRIBUTES = 0x8B89;

module.exports = function wrapShaderState(gl, stringStore, stats, config) {
  // ===================================================
  // glsl compilation and linking
  // ===================================================
  var fragShaders = {};
  var vertShaders = {};

  function ActiveInfo(name, id, location, info) {
    this.name = name;
    this.id = id;
    this.location = location;
    this.info = info;
  }

  function insertActiveInfo(list, info) {
    for (var i = 0; i < list.length; ++i) {
      if (list[i].id === info.id) {
        list[i].location = info.location;
        return;
      }
    }
    list.push(info);
  }

  function getShader(type, id, command) {
    var cache = type === GL_FRAGMENT_SHADER ? fragShaders : vertShaders;
    var shader = cache[id];

    if (!shader) {
      var source = stringStore.str(id);
      shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);

      cache[id] = shader;
    }

    return shader;
  }

  // ===================================================
  // program linking
  // ===================================================
  var programCache = {};
  var programList = [];

  var PROGRAM_COUNTER = 0;

  function REGLProgram(fragId, vertId) {
    this.id = PROGRAM_COUNTER++;
    this.fragId = fragId;
    this.vertId = vertId;
    this.program = null;
    this.uniforms = [];
    this.attributes = [];

    if (config.profile) {
      this.stats = {
        uniformsCount: 0,
        attributesCount: 0
      };
    }
  }

  function linkProgram(desc, command) {
    var i, info;

    // -------------------------------
    // compile & link
    // -------------------------------
    var fragShader = getShader(GL_FRAGMENT_SHADER, desc.fragId);
    var vertShader = getShader(GL_VERTEX_SHADER, desc.vertId);

    var program = desc.program = gl.createProgram();
    gl.attachShader(program, fragShader);
    gl.attachShader(program, vertShader);
    gl.linkProgram(program);

    // -------------------------------
    // grab uniforms
    // -------------------------------
    var numUniforms = gl.getProgramParameter(program, GL_ACTIVE_UNIFORMS);
    if (config.profile) {
      desc.stats.uniformsCount = numUniforms;
    }
    var uniforms = desc.uniforms;
    for (i = 0; i < numUniforms; ++i) {
      info = gl.getActiveUniform(program, i);
      if (info) {
        if (info.size > 1) {
          for (var j = 0; j < info.size; ++j) {
            var name = info.name.replace('[0]', '[' + j + ']');
            insertActiveInfo(uniforms, new ActiveInfo(name, stringStore.id(name), gl.getUniformLocation(program, name), info));
          }
        } else {
          insertActiveInfo(uniforms, new ActiveInfo(info.name, stringStore.id(info.name), gl.getUniformLocation(program, info.name), info));
        }
      }
    }

    // -------------------------------
    // grab attributes
    // -------------------------------
    var numAttributes = gl.getProgramParameter(program, GL_ACTIVE_ATTRIBUTES);
    if (config.profile) {
      desc.stats.attributesCount = numAttributes;
    }

    var attributes = desc.attributes;
    for (i = 0; i < numAttributes; ++i) {
      info = gl.getActiveAttrib(program, i);
      if (info) {
        insertActiveInfo(attributes, new ActiveInfo(info.name, stringStore.id(info.name), gl.getAttribLocation(program, info.name), info));
      }
    }
  }

  if (config.profile) {
    stats.getMaxUniformsCount = function () {
      var m = 0;
      programList.forEach(function (desc) {
        if (desc.stats.uniformsCount > m) {
          m = desc.stats.uniformsCount;
        }
      });
      return m;
    };

    stats.getMaxAttributesCount = function () {
      var m = 0;
      programList.forEach(function (desc) {
        if (desc.stats.attributesCount > m) {
          m = desc.stats.attributesCount;
        }
      });
      return m;
    };
  }

  function restoreShaders() {
    fragShaders = {};
    vertShaders = {};
    for (var i = 0; i < programList.length; ++i) {
      linkProgram(programList[i]);
    }
  }

  return {
    clear: function () {
      var deleteShader = gl.deleteShader.bind(gl);
      values(fragShaders).forEach(deleteShader);
      fragShaders = {};
      values(vertShaders).forEach(deleteShader);
      vertShaders = {};

      programList.forEach(function (desc) {
        gl.deleteProgram(desc.program);
      });
      programList.length = 0;
      programCache = {};

      stats.shaderCount = 0;
    },

    program: function (vertId, fragId, command) {

      stats.shaderCount++;

      var cache = programCache[fragId];
      if (!cache) {
        cache = programCache[fragId] = {};
      }
      var program = cache[vertId];
      if (!program) {
        program = new REGLProgram(fragId, vertId);
        linkProgram(program, command);
        cache[vertId] = program;
        programList.push(program);
      }
      return program;
    },

    restore: restoreShaders,

    shader: getShader,

    frag: -1,
    vert: -1
  };
};

},{"./util/values":32}],17:[function(require,module,exports){

module.exports = function stats() {
  return {
    bufferCount: 0,
    elementsCount: 0,
    framebufferCount: 0,
    shaderCount: 0,
    textureCount: 0,
    cubeCount: 0,
    renderbufferCount: 0,

    maxTextureUnits: 0
  };
};

},{}],18:[function(require,module,exports){
module.exports = function createStringStore() {
  var stringIds = { '': 0 };
  var stringValues = [''];
  return {
    id: function (str) {
      var result = stringIds[str];
      if (result) {
        return result;
      }
      result = stringIds[str] = stringValues.length;
      stringValues.push(str);
      return result;
    },

    str: function (id) {
      return stringValues[id];
    }
  };
};

},{}],19:[function(require,module,exports){

var extend = require('./util/extend');
var values = require('./util/values');
var isTypedArray = require('./util/is-typed-array');
var isNDArrayLike = require('./util/is-ndarray');
var pool = require('./util/pool');
var convertToHalfFloat = require('./util/to-half-float');
var isArrayLike = require('./util/is-array-like');
var flattenUtils = require('./util/flatten');

var dtypes = require('./constants/arraytypes.json');
var arrayTypes = require('./constants/arraytypes.json');

var GL_COMPRESSED_TEXTURE_FORMATS = 0x86A3;

var GL_TEXTURE_2D = 0x0DE1;
var GL_TEXTURE_CUBE_MAP = 0x8513;
var GL_TEXTURE_CUBE_MAP_POSITIVE_X = 0x8515;

var GL_RGBA = 0x1908;
var GL_ALPHA = 0x1906;
var GL_RGB = 0x1907;
var GL_LUMINANCE = 0x1909;
var GL_LUMINANCE_ALPHA = 0x190A;

var GL_RGBA4 = 0x8056;
var GL_RGB5_A1 = 0x8057;
var GL_RGB565 = 0x8D62;

var GL_UNSIGNED_SHORT_4_4_4_4 = 0x8033;
var GL_UNSIGNED_SHORT_5_5_5_1 = 0x8034;
var GL_UNSIGNED_SHORT_5_6_5 = 0x8363;
var GL_UNSIGNED_INT_24_8_WEBGL = 0x84FA;

var GL_DEPTH_COMPONENT = 0x1902;
var GL_DEPTH_STENCIL = 0x84F9;

var GL_SRGB_EXT = 0x8C40;
var GL_SRGB_ALPHA_EXT = 0x8C42;

var GL_HALF_FLOAT_OES = 0x8D61;

var GL_COMPRESSED_RGB_S3TC_DXT1_EXT = 0x83F0;
var GL_COMPRESSED_RGBA_S3TC_DXT1_EXT = 0x83F1;
var GL_COMPRESSED_RGBA_S3TC_DXT3_EXT = 0x83F2;
var GL_COMPRESSED_RGBA_S3TC_DXT5_EXT = 0x83F3;

var GL_COMPRESSED_RGB_ATC_WEBGL = 0x8C92;
var GL_COMPRESSED_RGBA_ATC_EXPLICIT_ALPHA_WEBGL = 0x8C93;
var GL_COMPRESSED_RGBA_ATC_INTERPOLATED_ALPHA_WEBGL = 0x87EE;

var GL_COMPRESSED_RGB_PVRTC_4BPPV1_IMG = 0x8C00;
var GL_COMPRESSED_RGB_PVRTC_2BPPV1_IMG = 0x8C01;
var GL_COMPRESSED_RGBA_PVRTC_4BPPV1_IMG = 0x8C02;
var GL_COMPRESSED_RGBA_PVRTC_2BPPV1_IMG = 0x8C03;

var GL_COMPRESSED_RGB_ETC1_WEBGL = 0x8D64;

var GL_UNSIGNED_BYTE = 0x1401;
var GL_UNSIGNED_SHORT = 0x1403;
var GL_UNSIGNED_INT = 0x1405;
var GL_FLOAT = 0x1406;

var GL_TEXTURE_WRAP_S = 0x2802;
var GL_TEXTURE_WRAP_T = 0x2803;

var GL_REPEAT = 0x2901;
var GL_CLAMP_TO_EDGE = 0x812F;
var GL_MIRRORED_REPEAT = 0x8370;

var GL_TEXTURE_MAG_FILTER = 0x2800;
var GL_TEXTURE_MIN_FILTER = 0x2801;

var GL_NEAREST = 0x2600;
var GL_LINEAR = 0x2601;
var GL_NEAREST_MIPMAP_NEAREST = 0x2700;
var GL_LINEAR_MIPMAP_NEAREST = 0x2701;
var GL_NEAREST_MIPMAP_LINEAR = 0x2702;
var GL_LINEAR_MIPMAP_LINEAR = 0x2703;

var GL_GENERATE_MIPMAP_HINT = 0x8192;
var GL_DONT_CARE = 0x1100;
var GL_FASTEST = 0x1101;
var GL_NICEST = 0x1102;

var GL_TEXTURE_MAX_ANISOTROPY_EXT = 0x84FE;

var GL_UNPACK_ALIGNMENT = 0x0CF5;
var GL_UNPACK_FLIP_Y_WEBGL = 0x9240;
var GL_UNPACK_PREMULTIPLY_ALPHA_WEBGL = 0x9241;
var GL_UNPACK_COLORSPACE_CONVERSION_WEBGL = 0x9243;

var GL_BROWSER_DEFAULT_WEBGL = 0x9244;

var GL_TEXTURE0 = 0x84C0;

var MIPMAP_FILTERS = [GL_NEAREST_MIPMAP_NEAREST, GL_NEAREST_MIPMAP_LINEAR, GL_LINEAR_MIPMAP_NEAREST, GL_LINEAR_MIPMAP_LINEAR];

var CHANNELS_FORMAT = [0, GL_LUMINANCE, GL_LUMINANCE_ALPHA, GL_RGB, GL_RGBA];

var FORMAT_CHANNELS = {};
FORMAT_CHANNELS[GL_LUMINANCE] = FORMAT_CHANNELS[GL_ALPHA] = FORMAT_CHANNELS[GL_DEPTH_COMPONENT] = 1;
FORMAT_CHANNELS[GL_DEPTH_STENCIL] = FORMAT_CHANNELS[GL_LUMINANCE_ALPHA] = 2;
FORMAT_CHANNELS[GL_RGB] = FORMAT_CHANNELS[GL_SRGB_EXT] = 3;
FORMAT_CHANNELS[GL_RGBA] = FORMAT_CHANNELS[GL_SRGB_ALPHA_EXT] = 4;

var formatTypes = {};
formatTypes[GL_RGBA4] = GL_UNSIGNED_SHORT_4_4_4_4;
formatTypes[GL_RGB565] = GL_UNSIGNED_SHORT_5_6_5;
formatTypes[GL_RGB5_A1] = GL_UNSIGNED_SHORT_5_5_5_1;
formatTypes[GL_DEPTH_COMPONENT] = GL_UNSIGNED_INT;
formatTypes[GL_DEPTH_STENCIL] = GL_UNSIGNED_INT_24_8_WEBGL;

function objectName(str) {
  return '[object ' + str + ']';
}

var CANVAS_CLASS = objectName('HTMLCanvasElement');
var CONTEXT2D_CLASS = objectName('CanvasRenderingContext2D');
var IMAGE_CLASS = objectName('HTMLImageElement');
var VIDEO_CLASS = objectName('HTMLVideoElement');

var PIXEL_CLASSES = Object.keys(dtypes).concat([CANVAS_CLASS, CONTEXT2D_CLASS, IMAGE_CLASS, VIDEO_CLASS]);

// for every texture type, store
// the size in bytes.
var TYPE_SIZES = [];
TYPE_SIZES[GL_UNSIGNED_BYTE] = 1;
TYPE_SIZES[GL_FLOAT] = 4;
TYPE_SIZES[GL_HALF_FLOAT_OES] = 2;

TYPE_SIZES[GL_UNSIGNED_SHORT] = 2;
TYPE_SIZES[GL_UNSIGNED_INT] = 4;

var FORMAT_SIZES_SPECIAL = [];
FORMAT_SIZES_SPECIAL[GL_RGBA4] = 2;
FORMAT_SIZES_SPECIAL[GL_RGB5_A1] = 2;
FORMAT_SIZES_SPECIAL[GL_RGB565] = 2;
FORMAT_SIZES_SPECIAL[GL_DEPTH_STENCIL] = 4;

FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGB_S3TC_DXT1_EXT] = 0.5;
FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGBA_S3TC_DXT1_EXT] = 0.5;
FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGBA_S3TC_DXT3_EXT] = 1;
FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGBA_S3TC_DXT5_EXT] = 1;

FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGB_ATC_WEBGL] = 0.5;
FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGBA_ATC_EXPLICIT_ALPHA_WEBGL] = 1;
FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGBA_ATC_INTERPOLATED_ALPHA_WEBGL] = 1;

FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGB_PVRTC_4BPPV1_IMG] = 0.5;
FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGB_PVRTC_2BPPV1_IMG] = 0.25;
FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGBA_PVRTC_4BPPV1_IMG] = 0.5;
FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGBA_PVRTC_2BPPV1_IMG] = 0.25;

FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGB_ETC1_WEBGL] = 0.5;

function isNumericArray(arr) {
  return Array.isArray(arr) && (arr.length === 0 || typeof arr[0] === 'number');
}

function isRectArray(arr) {
  if (!Array.isArray(arr)) {
    return false;
  }
  var width = arr.length;
  if (width === 0 || !isArrayLike(arr[0])) {
    return false;
  }
  return true;
}

function classString(x) {
  return Object.prototype.toString.call(x);
}

function isCanvasElement(object) {
  return classString(object) === CANVAS_CLASS;
}

function isContext2D(object) {
  return classString(object) === CONTEXT2D_CLASS;
}

function isImageElement(object) {
  return classString(object) === IMAGE_CLASS;
}

function isVideoElement(object) {
  return classString(object) === VIDEO_CLASS;
}

function isPixelData(object) {
  if (!object) {
    return false;
  }
  var className = classString(object);
  if (PIXEL_CLASSES.indexOf(className) >= 0) {
    return true;
  }
  return isNumericArray(object) || isRectArray(object) || isNDArrayLike(object);
}

function typedArrayCode(data) {
  return arrayTypes[Object.prototype.toString.call(data)] | 0;
}

function convertData(result, data) {
  var n = data.length;
  switch (result.type) {
    case GL_UNSIGNED_BYTE:
    case GL_UNSIGNED_SHORT:
    case GL_UNSIGNED_INT:
    case GL_FLOAT:
      var converted = pool.allocType(result.type, n);
      converted.set(data);
      result.data = converted;
      break;

    case GL_HALF_FLOAT_OES:
      result.data = convertToHalfFloat(data);
      break;

    default:

  }
}

function preConvert(image, n) {
  return pool.allocType(image.type === GL_HALF_FLOAT_OES ? GL_FLOAT : image.type, n);
}

function postConvert(image, data) {
  if (image.type === GL_HALF_FLOAT_OES) {
    image.data = convertToHalfFloat(data);
    pool.freeType(data);
  } else {
    image.data = data;
  }
}

function transposeData(image, array, strideX, strideY, strideC, offset) {
  var w = image.width;
  var h = image.height;
  var c = image.channels;
  var n = w * h * c;
  var data = preConvert(image, n);

  var p = 0;
  for (var i = 0; i < h; ++i) {
    for (var j = 0; j < w; ++j) {
      for (var k = 0; k < c; ++k) {
        data[p++] = array[strideX * j + strideY * i + strideC * k + offset];
      }
    }
  }

  postConvert(image, data);
}

function getTextureSize(format, type, width, height, isMipmap, isCube) {
  var s;
  if (typeof FORMAT_SIZES_SPECIAL[format] !== 'undefined') {
    // we have a special array for dealing with weird color formats such as RGB5A1
    s = FORMAT_SIZES_SPECIAL[format];
  } else {
    s = FORMAT_CHANNELS[format] * TYPE_SIZES[type];
  }

  if (isCube) {
    s *= 6;
  }

  if (isMipmap) {
    // compute the total size of all the mipmaps.
    var total = 0;

    var w = width;
    while (w >= 1) {
      // we can only use mipmaps on a square image,
      // so we can simply use the width and ignore the height:
      total += s * w * w;
      w /= 2;
    }
    return total;
  } else {
    return s * width * height;
  }
}

module.exports = function createTextureSet(gl, extensions, limits, reglPoll, contextState, stats, config) {
  // -------------------------------------------------------
  // Initialize constants and parameter tables here
  // -------------------------------------------------------
  var mipmapHint = {
    "don't care": GL_DONT_CARE,
    'dont care': GL_DONT_CARE,
    'nice': GL_NICEST,
    'fast': GL_FASTEST
  };

  var wrapModes = {
    'repeat': GL_REPEAT,
    'clamp': GL_CLAMP_TO_EDGE,
    'mirror': GL_MIRRORED_REPEAT
  };

  var magFilters = {
    'nearest': GL_NEAREST,
    'linear': GL_LINEAR
  };

  var minFilters = extend({
    'mipmap': GL_LINEAR_MIPMAP_LINEAR,
    'nearest mipmap nearest': GL_NEAREST_MIPMAP_NEAREST,
    'linear mipmap nearest': GL_LINEAR_MIPMAP_NEAREST,
    'nearest mipmap linear': GL_NEAREST_MIPMAP_LINEAR,
    'linear mipmap linear': GL_LINEAR_MIPMAP_LINEAR
  }, magFilters);

  var colorSpace = {
    'none': 0,
    'browser': GL_BROWSER_DEFAULT_WEBGL
  };

  var textureTypes = {
    'uint8': GL_UNSIGNED_BYTE,
    'rgba4': GL_UNSIGNED_SHORT_4_4_4_4,
    'rgb565': GL_UNSIGNED_SHORT_5_6_5,
    'rgb5 a1': GL_UNSIGNED_SHORT_5_5_5_1
  };

  var textureFormats = {
    'alpha': GL_ALPHA,
    'luminance': GL_LUMINANCE,
    'luminance alpha': GL_LUMINANCE_ALPHA,
    'rgb': GL_RGB,
    'rgba': GL_RGBA,
    'rgba4': GL_RGBA4,
    'rgb5 a1': GL_RGB5_A1,
    'rgb565': GL_RGB565
  };

  var compressedTextureFormats = {};

  if (extensions.ext_srgb) {
    textureFormats.srgb = GL_SRGB_EXT;
    textureFormats.srgba = GL_SRGB_ALPHA_EXT;
  }

  if (extensions.oes_texture_float) {
    textureTypes.float32 = textureTypes.float = GL_FLOAT;
  }

  if (extensions.oes_texture_half_float) {
    textureTypes['float16'] = textureTypes['half float'] = GL_HALF_FLOAT_OES;
  }

  if (extensions.webgl_depth_texture) {
    extend(textureFormats, {
      'depth': GL_DEPTH_COMPONENT,
      'depth stencil': GL_DEPTH_STENCIL
    });

    extend(textureTypes, {
      'uint16': GL_UNSIGNED_SHORT,
      'uint32': GL_UNSIGNED_INT,
      'depth stencil': GL_UNSIGNED_INT_24_8_WEBGL
    });
  }

  if (extensions.webgl_compressed_texture_s3tc) {
    extend(compressedTextureFormats, {
      'rgb s3tc dxt1': GL_COMPRESSED_RGB_S3TC_DXT1_EXT,
      'rgba s3tc dxt1': GL_COMPRESSED_RGBA_S3TC_DXT1_EXT,
      'rgba s3tc dxt3': GL_COMPRESSED_RGBA_S3TC_DXT3_EXT,
      'rgba s3tc dxt5': GL_COMPRESSED_RGBA_S3TC_DXT5_EXT
    });
  }

  if (extensions.webgl_compressed_texture_atc) {
    extend(compressedTextureFormats, {
      'rgb atc': GL_COMPRESSED_RGB_ATC_WEBGL,
      'rgba atc explicit alpha': GL_COMPRESSED_RGBA_ATC_EXPLICIT_ALPHA_WEBGL,
      'rgba atc interpolated alpha': GL_COMPRESSED_RGBA_ATC_INTERPOLATED_ALPHA_WEBGL
    });
  }

  if (extensions.webgl_compressed_texture_pvrtc) {
    extend(compressedTextureFormats, {
      'rgb pvrtc 4bppv1': GL_COMPRESSED_RGB_PVRTC_4BPPV1_IMG,
      'rgb pvrtc 2bppv1': GL_COMPRESSED_RGB_PVRTC_2BPPV1_IMG,
      'rgba pvrtc 4bppv1': GL_COMPRESSED_RGBA_PVRTC_4BPPV1_IMG,
      'rgba pvrtc 2bppv1': GL_COMPRESSED_RGBA_PVRTC_2BPPV1_IMG
    });
  }

  if (extensions.webgl_compressed_texture_etc1) {
    compressedTextureFormats['rgb etc1'] = GL_COMPRESSED_RGB_ETC1_WEBGL;
  }

  // Copy over all texture formats
  var supportedCompressedFormats = Array.prototype.slice.call(gl.getParameter(GL_COMPRESSED_TEXTURE_FORMATS));
  Object.keys(compressedTextureFormats).forEach(function (name) {
    var format = compressedTextureFormats[name];
    if (supportedCompressedFormats.indexOf(format) >= 0) {
      textureFormats[name] = format;
    }
  });

  var supportedFormats = Object.keys(textureFormats);
  limits.textureFormats = supportedFormats;

  // associate with every format string its
  // corresponding GL-value.
  var textureFormatsInvert = [];
  Object.keys(textureFormats).forEach(function (key) {
    var val = textureFormats[key];
    textureFormatsInvert[val] = key;
  });

  // associate with every type string its
  // corresponding GL-value.
  var textureTypesInvert = [];
  Object.keys(textureTypes).forEach(function (key) {
    var val = textureTypes[key];
    textureTypesInvert[val] = key;
  });

  var magFiltersInvert = [];
  Object.keys(magFilters).forEach(function (key) {
    var val = magFilters[key];
    magFiltersInvert[val] = key;
  });

  var minFiltersInvert = [];
  Object.keys(minFilters).forEach(function (key) {
    var val = minFilters[key];
    minFiltersInvert[val] = key;
  });

  var wrapModesInvert = [];
  Object.keys(wrapModes).forEach(function (key) {
    var val = wrapModes[key];
    wrapModesInvert[val] = key;
  });

  // colorFormats[] gives the format (channels) associated to an
  // internalformat
  var colorFormats = supportedFormats.reduce(function (color, key) {
    var glenum = textureFormats[key];
    if (glenum === GL_LUMINANCE || glenum === GL_ALPHA || glenum === GL_LUMINANCE || glenum === GL_LUMINANCE_ALPHA || glenum === GL_DEPTH_COMPONENT || glenum === GL_DEPTH_STENCIL) {
      color[glenum] = glenum;
    } else if (glenum === GL_RGB5_A1 || key.indexOf('rgba') >= 0) {
      color[glenum] = GL_RGBA;
    } else {
      color[glenum] = GL_RGB;
    }
    return color;
  }, {});

  function TexFlags() {
    // format info
    this.internalformat = GL_RGBA;
    this.format = GL_RGBA;
    this.type = GL_UNSIGNED_BYTE;
    this.compressed = false;

    // pixel storage
    this.premultiplyAlpha = false;
    this.flipY = false;
    this.unpackAlignment = 1;
    this.colorSpace = 0;

    // shape info
    this.width = 0;
    this.height = 0;
    this.channels = 0;
  }

  function copyFlags(result, other) {
    result.internalformat = other.internalformat;
    result.format = other.format;
    result.type = other.type;
    result.compressed = other.compressed;

    result.premultiplyAlpha = other.premultiplyAlpha;
    result.flipY = other.flipY;
    result.unpackAlignment = other.unpackAlignment;
    result.colorSpace = other.colorSpace;

    result.width = other.width;
    result.height = other.height;
    result.channels = other.channels;
  }

  function parseFlags(flags, options) {
    if (typeof options !== 'object' || !options) {
      return;
    }

    if ('premultiplyAlpha' in options) {

      flags.premultiplyAlpha = options.premultiplyAlpha;
    }

    if ('flipY' in options) {

      flags.flipY = options.flipY;
    }

    if ('alignment' in options) {

      flags.unpackAlignment = options.alignment;
    }

    if ('colorSpace' in options) {

      flags.colorSpace = colorSpace[options.colorSpace];
    }

    if ('type' in options) {
      var type = options.type;

      flags.type = textureTypes[type];
    }

    var w = flags.width;
    var h = flags.height;
    var c = flags.channels;
    var hasChannels = false;
    if ('shape' in options) {

      w = options.shape[0];
      h = options.shape[1];
      if (options.shape.length === 3) {
        c = options.shape[2];

        hasChannels = true;
      }
    } else {
      if ('radius' in options) {
        w = h = options.radius;
      }
      if ('width' in options) {
        w = options.width;
      }
      if ('height' in options) {
        h = options.height;
      }
      if ('channels' in options) {
        c = options.channels;

        hasChannels = true;
      }
    }
    flags.width = w | 0;
    flags.height = h | 0;
    flags.channels = c | 0;

    var hasFormat = false;
    if ('format' in options) {
      var formatStr = options.format;

      var internalformat = flags.internalformat = textureFormats[formatStr];
      flags.format = colorFormats[internalformat];
      if (formatStr in textureTypes) {
        if (!('type' in options)) {
          flags.type = textureTypes[formatStr];
        }
      }
      if (formatStr in compressedTextureFormats) {
        flags.compressed = true;
      }
      hasFormat = true;
    }

    // Reconcile channels and format
    if (!hasChannels && hasFormat) {
      flags.channels = FORMAT_CHANNELS[flags.format];
    } else if (hasChannels && !hasFormat) {
      if (flags.channels !== CHANNELS_FORMAT[flags.format]) {
        flags.format = flags.internalformat = CHANNELS_FORMAT[flags.channels];
      }
    } else if (hasFormat && hasChannels) {}
  }

  function setFlags(flags) {
    gl.pixelStorei(GL_UNPACK_FLIP_Y_WEBGL, flags.flipY);
    gl.pixelStorei(GL_UNPACK_PREMULTIPLY_ALPHA_WEBGL, flags.premultiplyAlpha);
    gl.pixelStorei(GL_UNPACK_COLORSPACE_CONVERSION_WEBGL, flags.colorSpace);
    gl.pixelStorei(GL_UNPACK_ALIGNMENT, flags.unpackAlignment);
  }

  // -------------------------------------------------------
  // Tex image data
  // -------------------------------------------------------
  function TexImage() {
    TexFlags.call(this);

    this.xOffset = 0;
    this.yOffset = 0;

    // data
    this.data = null;
    this.needsFree = false;

    // html element
    this.element = null;

    // copyTexImage info
    this.needsCopy = false;
  }

  function parseImage(image, options) {
    var data = null;
    if (isPixelData(options)) {
      data = options;
    } else if (options) {

      parseFlags(image, options);
      if ('x' in options) {
        image.xOffset = options.x | 0;
      }
      if ('y' in options) {
        image.yOffset = options.y | 0;
      }
      if (isPixelData(options.data)) {
        data = options.data;
      }
    }

    if (options.copy) {

      var viewW = contextState.viewportWidth;
      var viewH = contextState.viewportHeight;
      image.width = image.width || viewW - image.xOffset;
      image.height = image.height || viewH - image.yOffset;
      image.needsCopy = true;
    } else if (!data) {
      image.width = image.width || 1;
      image.height = image.height || 1;
      image.channels = image.channels || 4;
    } else if (isTypedArray(data)) {
      image.channels = image.channels || 4;
      image.data = data;
      if (!('type' in options) && image.type === GL_UNSIGNED_BYTE) {
        image.type = typedArrayCode(data);
      }
    } else if (isNumericArray(data)) {
      image.channels = image.channels || 4;
      convertData(image, data);
      image.alignment = 1;
      image.needsFree = true;
    } else if (isNDArrayLike(data)) {
      var array = data.data;
      if (!Array.isArray(array) && image.type === GL_UNSIGNED_BYTE) {
        image.type = typedArrayCode(array);
      }
      var shape = data.shape;
      var stride = data.stride;
      var shapeX, shapeY, shapeC, strideX, strideY, strideC;
      if (shape.length === 3) {
        shapeC = shape[2];
        strideC = stride[2];
      } else {

        shapeC = 1;
        strideC = 1;
      }
      shapeX = shape[0];
      shapeY = shape[1];
      strideX = stride[0];
      strideY = stride[1];
      image.alignment = 1;
      image.width = shapeX;
      image.height = shapeY;
      image.channels = shapeC;
      image.format = image.internalformat = CHANNELS_FORMAT[shapeC];
      image.needsFree = true;
      transposeData(image, array, strideX, strideY, strideC, data.offset);
    } else if (isCanvasElement(data) || isContext2D(data)) {
      if (isCanvasElement(data)) {
        image.element = data;
      } else {
        image.element = data.canvas;
      }
      image.width = image.element.width;
      image.height = image.element.height;
      image.channels = 4;
    } else if (isImageElement(data)) {
      image.element = data;
      image.width = data.naturalWidth;
      image.height = data.naturalHeight;
      image.channels = 4;
    } else if (isVideoElement(data)) {
      image.element = data;
      image.width = data.videoWidth;
      image.height = data.videoHeight;
      image.channels = 4;
    } else if (isRectArray(data)) {
      var w = image.width || data[0].length;
      var h = image.height || data.length;
      var c = image.channels;
      if (isArrayLike(data[0][0])) {
        c = c || data[0][0].length;
      } else {
        c = c || 1;
      }
      var arrayShape = flattenUtils.shape(data);
      var n = 1;
      for (var dd = 0; dd < arrayShape.length; ++dd) {
        n *= arrayShape[dd];
      }
      var allocData = preConvert(image, n);
      flattenUtils.flatten(data, arrayShape, '', allocData);
      postConvert(image, allocData);
      image.alignment = 1;
      image.width = w;
      image.height = h;
      image.channels = c;
      image.format = image.internalformat = CHANNELS_FORMAT[c];
      image.needsFree = true;
    }

    if (image.type === GL_FLOAT) {} else if (image.type === GL_HALF_FLOAT_OES) {}

    // do compressed texture  validation here.
  }

  function setImage(info, target, miplevel) {
    var element = info.element;
    var data = info.data;
    var internalformat = info.internalformat;
    var format = info.format;
    var type = info.type;
    var width = info.width;
    var height = info.height;

    setFlags(info);

    if (element) {
      gl.texImage2D(target, miplevel, format, format, type, element);
    } else if (info.compressed) {
      gl.compressedTexImage2D(target, miplevel, internalformat, width, height, 0, data);
    } else if (info.needsCopy) {
      reglPoll();
      gl.copyTexImage2D(target, miplevel, format, info.xOffset, info.yOffset, width, height, 0);
    } else {
      gl.texImage2D(target, miplevel, format, width, height, 0, format, type, data);
    }
  }

  function setSubImage(info, target, x, y, miplevel) {
    var element = info.element;
    var data = info.data;
    var internalformat = info.internalformat;
    var format = info.format;
    var type = info.type;
    var width = info.width;
    var height = info.height;

    setFlags(info);

    if (element) {
      gl.texSubImage2D(target, miplevel, x, y, format, type, element);
    } else if (info.compressed) {
      gl.compressedTexSubImage2D(target, miplevel, x, y, internalformat, width, height, data);
    } else if (info.needsCopy) {
      reglPoll();
      gl.copyTexSubImage2D(target, miplevel, x, y, info.xOffset, info.yOffset, width, height);
    } else {
      gl.texSubImage2D(target, miplevel, x, y, width, height, format, type, data);
    }
  }

  // texImage pool
  var imagePool = [];

  function allocImage() {
    return imagePool.pop() || new TexImage();
  }

  function freeImage(image) {
    if (image.needsFree) {
      pool.freeType(image.data);
    }
    TexImage.call(image);
    imagePool.push(image);
  }

  // -------------------------------------------------------
  // Mip map
  // -------------------------------------------------------
  function MipMap() {
    TexFlags.call(this);

    this.genMipmaps = false;
    this.mipmapHint = GL_DONT_CARE;
    this.mipmask = 0;
    this.images = Array(16);
  }

  function parseMipMapFromShape(mipmap, width, height) {
    var img = mipmap.images[0] = allocImage();
    mipmap.mipmask = 1;
    img.width = mipmap.width = width;
    img.height = mipmap.height = height;
    img.channels = mipmap.channels = 4;
  }

  function parseMipMapFromObject(mipmap, options) {
    var imgData = null;
    if (isPixelData(options)) {
      imgData = mipmap.images[0] = allocImage();
      copyFlags(imgData, mipmap);
      parseImage(imgData, options);
      mipmap.mipmask = 1;
    } else {
      parseFlags(mipmap, options);
      if (Array.isArray(options.mipmap)) {
        var mipData = options.mipmap;
        for (var i = 0; i < mipData.length; ++i) {
          imgData = mipmap.images[i] = allocImage();
          copyFlags(imgData, mipmap);
          imgData.width >>= i;
          imgData.height >>= i;
          parseImage(imgData, mipData[i]);
          mipmap.mipmask |= 1 << i;
        }
      } else {
        imgData = mipmap.images[0] = allocImage();
        copyFlags(imgData, mipmap);
        parseImage(imgData, options);
        mipmap.mipmask = 1;
      }
    }
    copyFlags(mipmap, mipmap.images[0]);

    // For textures of the compressed format WEBGL_compressed_texture_s3tc
    // we must have that
    //
    // "When level equals zero width and height must be a multiple of 4.
    // When level is greater than 0 width and height must be 0, 1, 2 or a multiple of 4. "
    //
    // but we do not yet support having multiple mipmap levels for compressed textures,
    // so we only test for level zero.

    if (mipmap.compressed && mipmap.internalformat === GL_COMPRESSED_RGB_S3TC_DXT1_EXT || mipmap.internalformat === GL_COMPRESSED_RGBA_S3TC_DXT1_EXT || mipmap.internalformat === GL_COMPRESSED_RGBA_S3TC_DXT3_EXT || mipmap.internalformat === GL_COMPRESSED_RGBA_S3TC_DXT5_EXT) {}
  }

  function setMipMap(mipmap, target) {
    var images = mipmap.images;
    for (var i = 0; i < images.length; ++i) {
      if (!images[i]) {
        return;
      }
      setImage(images[i], target, i);
    }
  }

  var mipPool = [];

  function allocMipMap() {
    var result = mipPool.pop() || new MipMap();
    TexFlags.call(result);
    result.mipmask = 0;
    for (var i = 0; i < 16; ++i) {
      result.images[i] = null;
    }
    return result;
  }

  function freeMipMap(mipmap) {
    var images = mipmap.images;
    for (var i = 0; i < images.length; ++i) {
      if (images[i]) {
        freeImage(images[i]);
      }
      images[i] = null;
    }
    mipPool.push(mipmap);
  }

  // -------------------------------------------------------
  // Tex info
  // -------------------------------------------------------
  function TexInfo() {
    this.minFilter = GL_NEAREST;
    this.magFilter = GL_NEAREST;

    this.wrapS = GL_CLAMP_TO_EDGE;
    this.wrapT = GL_CLAMP_TO_EDGE;

    this.anisotropic = 1;

    this.genMipmaps = false;
    this.mipmapHint = GL_DONT_CARE;
  }

  function parseTexInfo(info, options) {
    if ('min' in options) {
      var minFilter = options.min;

      info.minFilter = minFilters[minFilter];
      if (MIPMAP_FILTERS.indexOf(info.minFilter) >= 0) {
        info.genMipmaps = true;
      }
    }

    if ('mag' in options) {
      var magFilter = options.mag;

      info.magFilter = magFilters[magFilter];
    }

    var wrapS = info.wrapS;
    var wrapT = info.wrapT;
    if ('wrap' in options) {
      var wrap = options.wrap;
      if (typeof wrap === 'string') {

        wrapS = wrapT = wrapModes[wrap];
      } else if (Array.isArray(wrap)) {

        wrapS = wrapModes[wrap[0]];
        wrapT = wrapModes[wrap[1]];
      }
    } else {
      if ('wrapS' in options) {
        var optWrapS = options.wrapS;

        wrapS = wrapModes[optWrapS];
      }
      if ('wrapT' in options) {
        var optWrapT = options.wrapT;

        wrapT = wrapModes[optWrapT];
      }
    }
    info.wrapS = wrapS;
    info.wrapT = wrapT;

    if ('anisotropic' in options) {
      var anisotropic = options.anisotropic;

      info.anisotropic = options.anisotropic;
    }

    if ('mipmap' in options) {
      var hasMipMap = false;
      switch (typeof options.mipmap) {
        case 'string':

          info.mipmapHint = mipmapHint[options.mipmap];
          info.genMipmaps = true;
          hasMipMap = true;
          break;

        case 'boolean':
          hasMipMap = info.genMipmaps = options.mipmap;
          break;

        case 'object':

          info.genMipmaps = false;
          hasMipMap = true;
          break;

        default:

      }
      if (hasMipMap && !('min' in options)) {
        info.minFilter = GL_NEAREST_MIPMAP_NEAREST;
      }
    }
  }

  function setTexInfo(info, target) {
    gl.texParameteri(target, GL_TEXTURE_MIN_FILTER, info.minFilter);
    gl.texParameteri(target, GL_TEXTURE_MAG_FILTER, info.magFilter);
    gl.texParameteri(target, GL_TEXTURE_WRAP_S, info.wrapS);
    gl.texParameteri(target, GL_TEXTURE_WRAP_T, info.wrapT);
    if (extensions.ext_texture_filter_anisotropic) {
      gl.texParameteri(target, GL_TEXTURE_MAX_ANISOTROPY_EXT, info.anisotropic);
    }
    if (info.genMipmaps) {
      gl.hint(GL_GENERATE_MIPMAP_HINT, info.mipmapHint);
      gl.generateMipmap(target);
    }
  }

  // -------------------------------------------------------
  // Full texture object
  // -------------------------------------------------------
  var textureCount = 0;
  var textureSet = {};
  var numTexUnits = limits.maxTextureUnits;
  var textureUnits = Array(numTexUnits).map(function () {
    return null;
  });

  function REGLTexture(target) {
    TexFlags.call(this);
    this.mipmask = 0;
    this.internalformat = GL_RGBA;

    this.id = textureCount++;

    this.refCount = 1;

    this.target = target;
    this.texture = gl.createTexture();

    this.unit = -1;
    this.bindCount = 0;

    this.texInfo = new TexInfo();

    if (config.profile) {
      this.stats = { size: 0 };
    }
  }

  function tempBind(texture) {
    gl.activeTexture(GL_TEXTURE0);
    gl.bindTexture(texture.target, texture.texture);
  }

  function tempRestore() {
    var prev = textureUnits[0];
    if (prev) {
      gl.bindTexture(prev.target, prev.texture);
    } else {
      gl.bindTexture(GL_TEXTURE_2D, null);
    }
  }

  function destroy(texture) {
    var handle = texture.texture;

    var unit = texture.unit;
    var target = texture.target;
    if (unit >= 0) {
      gl.activeTexture(GL_TEXTURE0 + unit);
      gl.bindTexture(target, null);
      textureUnits[unit] = null;
    }
    gl.deleteTexture(handle);
    texture.texture = null;
    texture.params = null;
    texture.pixels = null;
    texture.refCount = 0;
    delete textureSet[texture.id];
    stats.textureCount--;
  }

  extend(REGLTexture.prototype, {
    bind: function () {
      var texture = this;
      texture.bindCount += 1;
      var unit = texture.unit;
      if (unit < 0) {
        for (var i = 0; i < numTexUnits; ++i) {
          var other = textureUnits[i];
          if (other) {
            if (other.bindCount > 0) {
              continue;
            }
            other.unit = -1;
          }
          textureUnits[i] = texture;
          unit = i;
          break;
        }
        if (unit >= numTexUnits) {}
        if (config.profile && stats.maxTextureUnits < unit + 1) {
          stats.maxTextureUnits = unit + 1; // +1, since the units are zero-based
        }
        texture.unit = unit;
        gl.activeTexture(GL_TEXTURE0 + unit);
        gl.bindTexture(texture.target, texture.texture);
      }
      return unit;
    },

    unbind: function () {
      this.bindCount -= 1;
    },

    decRef: function () {
      if (--this.refCount <= 0) {
        destroy(this);
      }
    }
  });

  function createTexture2D(a, b) {
    var texture = new REGLTexture(GL_TEXTURE_2D);
    textureSet[texture.id] = texture;
    stats.textureCount++;

    function reglTexture2D(a, b) {
      var texInfo = texture.texInfo;
      TexInfo.call(texInfo);
      var mipData = allocMipMap();

      if (typeof a === 'number') {
        if (typeof b === 'number') {
          parseMipMapFromShape(mipData, a | 0, b | 0);
        } else {
          parseMipMapFromShape(mipData, a | 0, a | 0);
        }
      } else if (a) {

        parseTexInfo(texInfo, a);
        parseMipMapFromObject(mipData, a);
      } else {
        // empty textures get assigned a default shape of 1x1
        parseMipMapFromShape(mipData, 1, 1);
      }

      if (texInfo.genMipmaps) {
        mipData.mipmask = (mipData.width << 1) - 1;
      }
      texture.mipmask = mipData.mipmask;

      copyFlags(texture, mipData);

      texture.internalformat = mipData.internalformat;

      reglTexture2D.width = mipData.width;
      reglTexture2D.height = mipData.height;

      tempBind(texture);
      setMipMap(mipData, GL_TEXTURE_2D);
      setTexInfo(texInfo, GL_TEXTURE_2D);
      tempRestore();

      freeMipMap(mipData);

      if (config.profile) {
        texture.stats.size = getTextureSize(texture.internalformat, texture.type, mipData.width, mipData.height, texInfo.genMipmaps, false);
      }
      reglTexture2D.format = textureFormatsInvert[texture.internalformat];
      reglTexture2D.type = textureTypesInvert[texture.type];

      reglTexture2D.mag = magFiltersInvert[texInfo.magFilter];
      reglTexture2D.min = minFiltersInvert[texInfo.minFilter];

      reglTexture2D.wrapS = wrapModesInvert[texInfo.wrapS];
      reglTexture2D.wrapT = wrapModesInvert[texInfo.wrapT];

      return reglTexture2D;
    }

    function subimage(image, x_, y_, level_) {

      var x = x_ | 0;
      var y = y_ | 0;
      var level = level_ | 0;

      var imageData = allocImage();
      copyFlags(imageData, texture);
      imageData.width = 0;
      imageData.height = 0;
      parseImage(imageData, image);
      imageData.width = imageData.width || (texture.width >> level) - x;
      imageData.height = imageData.height || (texture.height >> level) - y;

      tempBind(texture);
      setSubImage(imageData, GL_TEXTURE_2D, x, y, level);
      tempRestore();

      freeImage(imageData);

      return reglTexture2D;
    }

    function resize(w_, h_) {
      var w = w_ | 0;
      var h = h_ | 0 || w;
      if (w === texture.width && h === texture.height) {
        return reglTexture2D;
      }

      reglTexture2D.width = texture.width = w;
      reglTexture2D.height = texture.height = h;

      tempBind(texture);
      for (var i = 0; texture.mipmask >> i; ++i) {
        gl.texImage2D(GL_TEXTURE_2D, i, texture.format, w >> i, h >> i, 0, texture.format, texture.type, null);
      }
      tempRestore();

      // also, recompute the texture size.
      if (config.profile) {
        texture.stats.size = getTextureSize(texture.internalformat, texture.type, w, h, false, false);
      }

      return reglTexture2D;
    }

    reglTexture2D(a, b);

    reglTexture2D.subimage = subimage;
    reglTexture2D.resize = resize;
    reglTexture2D._reglType = 'texture2d';
    reglTexture2D._texture = texture;
    if (config.profile) {
      reglTexture2D.stats = texture.stats;
    }
    reglTexture2D.destroy = function () {
      texture.decRef();
    };

    return reglTexture2D;
  }

  function createTextureCube(a0, a1, a2, a3, a4, a5) {
    var texture = new REGLTexture(GL_TEXTURE_CUBE_MAP);
    textureSet[texture.id] = texture;
    stats.cubeCount++;

    var faces = new Array(6);

    function reglTextureCube(a0, a1, a2, a3, a4, a5) {
      var i;
      var texInfo = texture.texInfo;
      TexInfo.call(texInfo);
      for (i = 0; i < 6; ++i) {
        faces[i] = allocMipMap();
      }

      if (typeof a0 === 'number' || !a0) {
        var s = a0 | 0 || 1;
        for (i = 0; i < 6; ++i) {
          parseMipMapFromShape(faces[i], s, s);
        }
      } else if (typeof a0 === 'object') {
        if (a1) {
          parseMipMapFromObject(faces[0], a0);
          parseMipMapFromObject(faces[1], a1);
          parseMipMapFromObject(faces[2], a2);
          parseMipMapFromObject(faces[3], a3);
          parseMipMapFromObject(faces[4], a4);
          parseMipMapFromObject(faces[5], a5);
        } else {
          parseTexInfo(texInfo, a0);
          parseFlags(texture, a0);
          if ('faces' in a0) {
            var face_input = a0.faces;

            for (i = 0; i < 6; ++i) {

              copyFlags(faces[i], texture);
              parseMipMapFromObject(faces[i], face_input[i]);
            }
          } else {
            for (i = 0; i < 6; ++i) {
              parseMipMapFromObject(faces[i], a0);
            }
          }
        }
      } else {}

      copyFlags(texture, faces[0]);
      if (texInfo.genMipmaps) {
        texture.mipmask = (faces[0].width << 1) - 1;
      } else {
        texture.mipmask = faces[0].mipmask;
      }

      texture.internalformat = faces[0].internalformat;

      reglTextureCube.width = faces[0].width;
      reglTextureCube.height = faces[0].height;

      tempBind(texture);
      for (i = 0; i < 6; ++i) {
        setMipMap(faces[i], GL_TEXTURE_CUBE_MAP_POSITIVE_X + i);
      }
      setTexInfo(texInfo, GL_TEXTURE_CUBE_MAP);
      tempRestore();

      if (config.profile) {
        texture.stats.size = getTextureSize(texture.internalformat, texture.type, reglTextureCube.width, reglTextureCube.height, texInfo.genMipmaps, true);
      }

      reglTextureCube.format = textureFormatsInvert[texture.internalformat];
      reglTextureCube.type = textureTypesInvert[texture.type];

      reglTextureCube.mag = magFiltersInvert[texInfo.magFilter];
      reglTextureCube.min = minFiltersInvert[texInfo.minFilter];

      reglTextureCube.wrapS = wrapModesInvert[texInfo.wrapS];
      reglTextureCube.wrapT = wrapModesInvert[texInfo.wrapT];

      for (i = 0; i < 6; ++i) {
        freeMipMap(faces[i]);
      }

      return reglTextureCube;
    }

    function subimage(face, image, x_, y_, level_) {

      var x = x_ | 0;
      var y = y_ | 0;
      var level = level_ | 0;

      var imageData = allocImage();
      copyFlags(imageData, texture);
      imageData.width = 0;
      imageData.height = 0;
      parseImage(imageData, image);
      imageData.width = imageData.width || (texture.width >> level) - x;
      imageData.height = imageData.height || (texture.height >> level) - y;

      tempBind(texture);
      setSubImage(imageData, GL_TEXTURE_CUBE_MAP_POSITIVE_X + face, x, y, level);
      tempRestore();

      freeImage(imageData);

      return reglTextureCube;
    }

    function resize(radius_) {
      var radius = radius_ | 0;
      if (radius === texture.width) {
        return;
      }

      reglTextureCube.width = texture.width = radius;
      reglTextureCube.height = texture.height = radius;

      tempBind(texture);
      for (var i = 0; i < 6; ++i) {
        for (var j = 0; texture.mipmask >> j; ++j) {
          gl.texImage2D(GL_TEXTURE_CUBE_MAP_POSITIVE_X + i, j, texture.format, radius >> j, radius >> j, 0, texture.format, texture.type, null);
        }
      }
      tempRestore();

      if (config.profile) {
        texture.stats.size = getTextureSize(texture.internalformat, texture.type, reglTextureCube.width, reglTextureCube.height, false, true);
      }

      return reglTextureCube;
    }

    reglTextureCube(a0, a1, a2, a3, a4, a5);

    reglTextureCube.subimage = subimage;
    reglTextureCube.resize = resize;
    reglTextureCube._reglType = 'textureCube';
    reglTextureCube._texture = texture;
    if (config.profile) {
      reglTextureCube.stats = texture.stats;
    }
    reglTextureCube.destroy = function () {
      texture.decRef();
    };

    return reglTextureCube;
  }

  // Called when regl is destroyed
  function destroyTextures() {
    for (var i = 0; i < numTexUnits; ++i) {
      gl.activeTexture(GL_TEXTURE0 + i);
      gl.bindTexture(GL_TEXTURE_2D, null);
      textureUnits[i] = null;
    }
    values(textureSet).forEach(destroy);

    stats.cubeCount = 0;
    stats.textureCount = 0;
  }

  if (config.profile) {
    stats.getTotalTextureSize = function () {
      var total = 0;
      Object.keys(textureSet).forEach(function (key) {
        total += textureSet[key].stats.size;
      });
      return total;
    };
  }

  function restoreTextures() {
    values(textureSet).forEach(function (texture) {
      texture.texture = gl.createTexture();
      gl.bindTexture(texture.target, texture.texture);
      for (var i = 0; i < 32; ++i) {
        if ((texture.mipmask & 1 << i) === 0) {
          continue;
        }
        if (texture.target === GL_TEXTURE_2D) {
          gl.texImage2D(GL_TEXTURE_2D, i, texture.internalformat, texture.width >> i, texture.height >> i, 0, texture.internalformat, texture.type, null);
        } else {
          for (var j = 0; j < 6; ++j) {
            gl.texImage2D(GL_TEXTURE_CUBE_MAP_POSITIVE_X + j, i, texture.internalformat, texture.width >> i, texture.height >> i, 0, texture.internalformat, texture.type, null);
          }
        }
      }
      setTexInfo(texture.texInfo, texture.target);
    });
  }

  return {
    create2D: createTexture2D,
    createCube: createTextureCube,
    clear: destroyTextures,
    getTexture: function (wrapper) {
      return null;
    },
    restore: restoreTextures
  };
};

},{"./constants/arraytypes.json":4,"./util/extend":23,"./util/flatten":24,"./util/is-array-like":25,"./util/is-ndarray":26,"./util/is-typed-array":27,"./util/pool":29,"./util/to-half-float":31,"./util/values":32}],20:[function(require,module,exports){
var GL_QUERY_RESULT_EXT = 0x8866;
var GL_QUERY_RESULT_AVAILABLE_EXT = 0x8867;
var GL_TIME_ELAPSED_EXT = 0x88BF;

module.exports = function (gl, extensions) {
  var extTimer = extensions.ext_disjoint_timer_query;

  if (!extTimer) {
    return null;
  }

  // QUERY POOL BEGIN
  var queryPool = [];
  function allocQuery() {
    return queryPool.pop() || extTimer.createQueryEXT();
  }
  function freeQuery(query) {
    queryPool.push(query);
  }
  // QUERY POOL END

  var pendingQueries = [];
  function beginQuery(stats) {
    var query = allocQuery();
    extTimer.beginQueryEXT(GL_TIME_ELAPSED_EXT, query);
    pendingQueries.push(query);
    pushScopeStats(pendingQueries.length - 1, pendingQueries.length, stats);
  }

  function endQuery() {
    extTimer.endQueryEXT(GL_TIME_ELAPSED_EXT);
  }

  //
  // Pending stats pool.
  //
  function PendingStats() {
    this.startQueryIndex = -1;
    this.endQueryIndex = -1;
    this.sum = 0;
    this.stats = null;
  }
  var pendingStatsPool = [];
  function allocPendingStats() {
    return pendingStatsPool.pop() || new PendingStats();
  }
  function freePendingStats(pendingStats) {
    pendingStatsPool.push(pendingStats);
  }
  // Pending stats pool end

  var pendingStats = [];
  function pushScopeStats(start, end, stats) {
    var ps = allocPendingStats();
    ps.startQueryIndex = start;
    ps.endQueryIndex = end;
    ps.sum = 0;
    ps.stats = stats;
    pendingStats.push(ps);
  }

  // we should call this at the beginning of the frame,
  // in order to update gpuTime
  var timeSum = [];
  var queryPtr = [];
  function update() {
    var ptr, i;

    var n = pendingQueries.length;
    if (n === 0) {
      return;
    }

    // Reserve space
    queryPtr.length = Math.max(queryPtr.length, n + 1);
    timeSum.length = Math.max(timeSum.length, n + 1);
    timeSum[0] = 0;
    queryPtr[0] = 0;

    // Update all pending timer queries
    var queryTime = 0;
    ptr = 0;
    for (i = 0; i < pendingQueries.length; ++i) {
      var query = pendingQueries[i];
      if (extTimer.getQueryObjectEXT(query, GL_QUERY_RESULT_AVAILABLE_EXT)) {
        queryTime += extTimer.getQueryObjectEXT(query, GL_QUERY_RESULT_EXT);
        freeQuery(query);
      } else {
        pendingQueries[ptr++] = query;
      }
      timeSum[i + 1] = queryTime;
      queryPtr[i + 1] = ptr;
    }
    pendingQueries.length = ptr;

    // Update all pending stat queries
    ptr = 0;
    for (i = 0; i < pendingStats.length; ++i) {
      var stats = pendingStats[i];
      var start = stats.startQueryIndex;
      var end = stats.endQueryIndex;
      stats.sum += timeSum[end] - timeSum[start];
      var startPtr = queryPtr[start];
      var endPtr = queryPtr[end];
      if (endPtr === startPtr) {
        stats.stats.gpuTime += stats.sum / 1e6;
        freePendingStats(stats);
      } else {
        stats.startQueryIndex = startPtr;
        stats.endQueryIndex = endPtr;
        pendingStats[ptr++] = stats;
      }
    }
    pendingStats.length = ptr;
  }

  return {
    beginQuery: beginQuery,
    endQuery: endQuery,
    pushScopeStats: pushScopeStats,
    update: update,
    getNumPendingQueries: function () {
      return pendingQueries.length;
    },
    clear: function () {
      queryPool.push.apply(queryPool, pendingQueries);
      for (var i = 0; i < queryPool.length; i++) {
        extTimer.deleteQueryEXT(queryPool[i]);
      }
      pendingQueries.length = 0;
      queryPool.length = 0;
    },
    restore: function () {
      pendingQueries.length = 0;
      queryPool.length = 0;
    }
  };
};

},{}],21:[function(require,module,exports){
/* globals performance */
module.exports = typeof performance !== 'undefined' && performance.now ? function () {
  return performance.now();
} : function () {
  return +new Date();
};

},{}],22:[function(require,module,exports){
var extend = require('./extend');

function slice(x) {
  return Array.prototype.slice.call(x);
}

function join(x) {
  return slice(x).join('');
}

module.exports = function createEnvironment() {
  // Unique variable id counter
  var varCounter = 0;

  // Linked values are passed from this scope into the generated code block
  // Calling link() passes a value into the generated scope and returns
  // the variable name which it is bound to
  var linkedNames = [];
  var linkedValues = [];
  function link(value) {
    for (var i = 0; i < linkedValues.length; ++i) {
      if (linkedValues[i] === value) {
        return linkedNames[i];
      }
    }

    var name = 'g' + varCounter++;
    linkedNames.push(name);
    linkedValues.push(value);
    return name;
  }

  // create a code block
  function block() {
    var code = [];
    function push() {
      code.push.apply(code, slice(arguments));
    }

    var vars = [];
    function def() {
      var name = 'v' + varCounter++;
      vars.push(name);

      if (arguments.length > 0) {
        code.push(name, '=');
        code.push.apply(code, slice(arguments));
        code.push(';');
      }

      return name;
    }

    return extend(push, {
      def: def,
      toString: function () {
        return join([vars.length > 0 ? 'var ' + vars + ';' : '', join(code)]);
      }
    });
  }

  function scope() {
    var entry = block();
    var exit = block();

    var entryToString = entry.toString;
    var exitToString = exit.toString;

    function save(object, prop) {
      exit(object, prop, '=', entry.def(object, prop), ';');
    }

    return extend(function () {
      entry.apply(entry, slice(arguments));
    }, {
      def: entry.def,
      entry: entry,
      exit: exit,
      save: save,
      set: function (object, prop, value) {
        save(object, prop);
        entry(object, prop, '=', value, ';');
      },
      toString: function () {
        return entryToString() + exitToString();
      }
    });
  }

  function conditional() {
    var pred = join(arguments);
    var thenBlock = scope();
    var elseBlock = scope();

    var thenToString = thenBlock.toString;
    var elseToString = elseBlock.toString;

    return extend(thenBlock, {
      then: function () {
        thenBlock.apply(thenBlock, slice(arguments));
        return this;
      },
      else: function () {
        elseBlock.apply(elseBlock, slice(arguments));
        return this;
      },
      toString: function () {
        var elseClause = elseToString();
        if (elseClause) {
          elseClause = 'else{' + elseClause + '}';
        }
        return join(['if(', pred, '){', thenToString(), '}', elseClause]);
      }
    });
  }

  // procedure list
  var globalBlock = block();
  var procedures = {};
  function proc(name, count) {
    var args = [];
    function arg() {
      var name = 'a' + args.length;
      args.push(name);
      return name;
    }

    count = count || 0;
    for (var i = 0; i < count; ++i) {
      arg();
    }

    var body = scope();
    var bodyToString = body.toString;

    var result = procedures[name] = extend(body, {
      arg: arg,
      toString: function () {
        return join(['function(', args.join(), '){', bodyToString(), '}']);
      }
    });

    return result;
  }

  function compile() {
    var code = ['"use strict";', globalBlock, 'return {'];
    Object.keys(procedures).forEach(function (name) {
      code.push('"', name, '":', procedures[name].toString(), ',');
    });
    code.push('}');
    var src = join(code).replace(/;/g, ';\n').replace(/}/g, '}\n').replace(/{/g, '{\n');
    var proc = Function.apply(null, linkedNames.concat(src));
    return proc.apply(null, linkedValues);
  }

  return {
    global: globalBlock,
    link: link,
    block: block,
    proc: proc,
    scope: scope,
    cond: conditional,
    compile: compile
  };
};

},{"./extend":23}],23:[function(require,module,exports){
module.exports = function (base, opts) {
  var keys = Object.keys(opts);
  for (var i = 0; i < keys.length; ++i) {
    base[keys[i]] = opts[keys[i]];
  }
  return base;
};

},{}],24:[function(require,module,exports){
var pool = require('./pool');

module.exports = {
  shape: arrayShape,
  flatten: flattenArray
};

function flatten1D(array, nx, out) {
  for (var i = 0; i < nx; ++i) {
    out[i] = array[i];
  }
}

function flatten2D(array, nx, ny, out) {
  var ptr = 0;
  for (var i = 0; i < nx; ++i) {
    var row = array[i];
    for (var j = 0; j < ny; ++j) {
      out[ptr++] = row[j];
    }
  }
}

function flatten3D(array, nx, ny, nz, out, ptr_) {
  var ptr = ptr_;
  for (var i = 0; i < nx; ++i) {
    var row = array[i];
    for (var j = 0; j < ny; ++j) {
      var col = row[j];
      for (var k = 0; k < nz; ++k) {
        out[ptr++] = col[k];
      }
    }
  }
}

function flattenRec(array, shape, level, out, ptr) {
  var stride = 1;
  for (var i = level + 1; i < shape.length; ++i) {
    stride *= shape[i];
  }
  var n = shape[level];
  if (shape.length - level === 4) {
    var nx = shape[level + 1];
    var ny = shape[level + 2];
    var nz = shape[level + 3];
    for (i = 0; i < n; ++i) {
      flatten3D(array[i], nx, ny, nz, out, ptr);
      ptr += stride;
    }
  } else {
    for (i = 0; i < n; ++i) {
      flattenRec(array[i], shape, level + 1, out, ptr);
      ptr += stride;
    }
  }
}

function flattenArray(array, shape, type, out_) {
  var sz = 1;
  if (shape.length) {
    for (var i = 0; i < shape.length; ++i) {
      sz *= shape[i];
    }
  } else {
    sz = 0;
  }
  var out = out_ || pool.allocType(type, sz);
  switch (shape.length) {
    case 0:
      break;
    case 1:
      flatten1D(array, shape[0], out);
      break;
    case 2:
      flatten2D(array, shape[0], shape[1], out);
      break;
    case 3:
      flatten3D(array, shape[0], shape[1], shape[2], out, 0);
      break;
    default:
      flattenRec(array, shape, 0, out, 0);
  }
  return out;
}

function arrayShape(array_) {
  var shape = [];
  for (var array = array_; array.length; array = array[0]) {
    shape.push(array.length);
  }
  return shape;
}

},{"./pool":29}],25:[function(require,module,exports){
var isTypedArray = require('./is-typed-array');
module.exports = function isArrayLike(s) {
  return Array.isArray(s) || isTypedArray(s);
};

},{"./is-typed-array":27}],26:[function(require,module,exports){
var isTypedArray = require('./is-typed-array');

module.exports = function isNDArrayLike(obj) {
  return !!obj && typeof obj === 'object' && Array.isArray(obj.shape) && Array.isArray(obj.stride) && typeof obj.offset === 'number' && obj.shape.length === obj.stride.length && (Array.isArray(obj.data) || isTypedArray(obj.data));
};

},{"./is-typed-array":27}],27:[function(require,module,exports){
var dtypes = require('../constants/arraytypes.json');
module.exports = function (x) {
  return Object.prototype.toString.call(x) in dtypes;
};

},{"../constants/arraytypes.json":4}],28:[function(require,module,exports){
module.exports = function loop(n, f) {
  var result = Array(n);
  for (var i = 0; i < n; ++i) {
    result[i] = f(i);
  }
  return result;
};

},{}],29:[function(require,module,exports){
var loop = require('./loop');

var GL_BYTE = 5120;
var GL_UNSIGNED_BYTE = 5121;
var GL_SHORT = 5122;
var GL_UNSIGNED_SHORT = 5123;
var GL_INT = 5124;
var GL_UNSIGNED_INT = 5125;
var GL_FLOAT = 5126;

var bufferPool = loop(8, function () {
  return [];
});

function nextPow16(v) {
  for (var i = 16; i <= 1 << 28; i *= 16) {
    if (v <= i) {
      return i;
    }
  }
  return 0;
}

function log2(v) {
  var r, shift;
  r = (v > 0xFFFF) << 4;
  v >>>= r;
  shift = (v > 0xFF) << 3;
  v >>>= shift;r |= shift;
  shift = (v > 0xF) << 2;
  v >>>= shift;r |= shift;
  shift = (v > 0x3) << 1;
  v >>>= shift;r |= shift;
  return r | v >> 1;
}

function alloc(n) {
  var sz = nextPow16(n);
  var bin = bufferPool[log2(sz) >> 2];
  if (bin.length > 0) {
    return bin.pop();
  }
  return new ArrayBuffer(sz);
}

function free(buf) {
  bufferPool[log2(buf.byteLength) >> 2].push(buf);
}

function allocType(type, n) {
  var result = null;
  switch (type) {
    case GL_BYTE:
      result = new Int8Array(alloc(n), 0, n);
      break;
    case GL_UNSIGNED_BYTE:
      result = new Uint8Array(alloc(n), 0, n);
      break;
    case GL_SHORT:
      result = new Int16Array(alloc(2 * n), 0, n);
      break;
    case GL_UNSIGNED_SHORT:
      result = new Uint16Array(alloc(2 * n), 0, n);
      break;
    case GL_INT:
      result = new Int32Array(alloc(4 * n), 0, n);
      break;
    case GL_UNSIGNED_INT:
      result = new Uint32Array(alloc(4 * n), 0, n);
      break;
    case GL_FLOAT:
      result = new Float32Array(alloc(4 * n), 0, n);
      break;
    default:
      return null;
  }
  if (result.length !== n) {
    return result.subarray(0, n);
  }
  return result;
}

function freeType(array) {
  free(array.buffer);
}

module.exports = {
  alloc: alloc,
  free: free,
  allocType: allocType,
  freeType: freeType
};

},{"./loop":28}],30:[function(require,module,exports){
/* globals requestAnimationFrame, cancelAnimationFrame */
if (typeof requestAnimationFrame === 'function' && typeof cancelAnimationFrame === 'function') {
  module.exports = {
    next: function (x) {
      return requestAnimationFrame(x);
    },
    cancel: function (x) {
      return cancelAnimationFrame(x);
    }
  };
} else {
  module.exports = {
    next: function (cb) {
      return setTimeout(cb, 16);
    },
    cancel: clearTimeout
  };
}

},{}],31:[function(require,module,exports){
var pool = require('./pool');

var FLOAT = new Float32Array(1);
var INT = new Uint32Array(FLOAT.buffer);

var GL_UNSIGNED_SHORT = 5123;

module.exports = function convertToHalfFloat(array) {
  var ushorts = pool.allocType(GL_UNSIGNED_SHORT, array.length);

  for (var i = 0; i < array.length; ++i) {
    if (isNaN(array[i])) {
      ushorts[i] = 0xffff;
    } else if (array[i] === Infinity) {
      ushorts[i] = 0x7c00;
    } else if (array[i] === -Infinity) {
      ushorts[i] = 0xfc00;
    } else {
      FLOAT[0] = array[i];
      var x = INT[0];

      var sgn = x >>> 31 << 15;
      var exp = (x << 1 >>> 24) - 127;
      var frac = x >> 13 & (1 << 10) - 1;

      if (exp < -24) {
        // round non-representable denormals to 0
        ushorts[i] = sgn;
      } else if (exp < -14) {
        // handle denormals
        var s = -14 - exp;
        ushorts[i] = sgn + (frac + (1 << 10) >> s);
      } else if (exp > 15) {
        // round overflow to +/- Infinity
        ushorts[i] = sgn + 0x7c00;
      } else {
        // otherwise convert directly
        ushorts[i] = sgn + (exp + 15 << 10) + frac;
      }
    }
  }

  return ushorts;
};

},{"./pool":29}],32:[function(require,module,exports){
module.exports = function (obj) {
  return Object.keys(obj).map(function (key) {
    return obj[key];
  });
};

},{}],33:[function(require,module,exports){
// Context and canvas creation helper functions

var extend = require('./util/extend');

function createCanvas(element, onDone, pixelRatio) {
  var canvas = document.createElement('canvas');
  extend(canvas.style, {
    border: 0,
    margin: 0,
    padding: 0,
    top: 0,
    left: 0
  });
  element.appendChild(canvas);

  if (element === document.body) {
    canvas.style.position = 'absolute';
    extend(element.style, {
      margin: 0,
      padding: 0
    });
  }

  function resize() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    if (element !== document.body) {
      var bounds = element.getBoundingClientRect();
      w = bounds.right - bounds.left;
      h = bounds.top - bounds.bottom;
    }
    canvas.width = pixelRatio * w;
    canvas.height = pixelRatio * h;
    extend(canvas.style, {
      width: w + 'px',
      height: h + 'px'
    });
  }

  window.addEventListener('resize', resize, false);

  function onDestroy() {
    window.removeEventListener('resize', resize);
    element.removeChild(canvas);
  }

  resize();

  return {
    canvas: canvas,
    onDestroy: onDestroy
  };
}

function createContext(canvas, contexAttributes) {
  function get(name) {
    try {
      return canvas.getContext(name, contexAttributes);
    } catch (e) {
      return null;
    }
  }
  return get('webgl') || get('experimental-webgl') || get('webgl-experimental');
}

function isHTMLElement(obj) {
  return typeof obj.nodeName === 'string' && typeof obj.appendChild === 'function' && typeof obj.getBoundingClientRect === 'function';
}

function isWebGLContext(obj) {
  return typeof obj.drawArrays === 'function' || typeof obj.drawElements === 'function';
}

function parseExtensions(input) {
  if (typeof input === 'string') {
    return input.split();
  }

  return input;
}

function getElement(desc) {
  if (typeof desc === 'string') {

    return document.querySelector(desc);
  }
  return desc;
}

module.exports = function parseArgs(args_) {
  var args = args_ || {};
  var element, container, canvas, gl;
  var contextAttributes = {};
  var extensions = [];
  var optionalExtensions = [];
  var pixelRatio = typeof window === 'undefined' ? 1 : window.devicePixelRatio;
  var profile = false;
  var onDone = function (err) {
    if (err) {}
  };
  var onDestroy = function () {};
  if (typeof args === 'string') {

    element = document.querySelector(args);
  } else if (typeof args === 'object') {
    if (isHTMLElement(args)) {
      element = args;
    } else if (isWebGLContext(args)) {
      gl = args;
      canvas = gl.canvas;
    } else {

      if ('gl' in args) {
        gl = args.gl;
      } else if ('canvas' in args) {
        canvas = getElement(args.canvas);
      } else if ('container' in args) {
        container = getElement(args.container);
      }
      if ('attributes' in args) {
        contextAttributes = args.attributes;
      }
      if ('extensions' in args) {
        extensions = parseExtensions(args.extensions);
      }
      if ('optionalExtensions' in args) {
        optionalExtensions = parseExtensions(args.optionalExtensions);
      }
      if ('onDone' in args) {

        onDone = args.onDone;
      }
      if ('profile' in args) {
        profile = !!args.profile;
      }
      if ('pixelRatio' in args) {
        pixelRatio = +args.pixelRatio;
      }
    }
  } else {}

  if (element) {
    if (element.nodeName.toLowerCase() === 'canvas') {
      canvas = element;
    } else {
      container = element;
    }
  }

  if (!gl) {
    if (!canvas) {

      var result = createCanvas(container || document.body, onDone, pixelRatio);
      if (!result) {
        return null;
      }
      canvas = result.canvas;
      onDestroy = result.onDestroy;
    }
    gl = createContext(canvas, contextAttributes);
  }

  if (!gl) {
    onDestroy();
    onDone('webgl not supported, try upgrading your browser or graphics drivers http://get.webgl.org');
    return null;
  }

  return {
    gl: gl,
    canvas: canvas,
    container: container,
    extensions: extensions,
    optionalExtensions: optionalExtensions,
    pixelRatio: pixelRatio,
    profile: profile,
    onDone: onDone,
    onDestroy: onDestroy
  };
};

},{"./util/extend":23}],34:[function(require,module,exports){
module.exports = adjoint;

/**
 * Calculates the adjugate of a mat4
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the source matrix
 * @returns {mat4} out
 */
function adjoint(out, a) {
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
        a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
        a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    out[0]  =  (a11 * (a22 * a33 - a23 * a32) - a21 * (a12 * a33 - a13 * a32) + a31 * (a12 * a23 - a13 * a22));
    out[1]  = -(a01 * (a22 * a33 - a23 * a32) - a21 * (a02 * a33 - a03 * a32) + a31 * (a02 * a23 - a03 * a22));
    out[2]  =  (a01 * (a12 * a33 - a13 * a32) - a11 * (a02 * a33 - a03 * a32) + a31 * (a02 * a13 - a03 * a12));
    out[3]  = -(a01 * (a12 * a23 - a13 * a22) - a11 * (a02 * a23 - a03 * a22) + a21 * (a02 * a13 - a03 * a12));
    out[4]  = -(a10 * (a22 * a33 - a23 * a32) - a20 * (a12 * a33 - a13 * a32) + a30 * (a12 * a23 - a13 * a22));
    out[5]  =  (a00 * (a22 * a33 - a23 * a32) - a20 * (a02 * a33 - a03 * a32) + a30 * (a02 * a23 - a03 * a22));
    out[6]  = -(a00 * (a12 * a33 - a13 * a32) - a10 * (a02 * a33 - a03 * a32) + a30 * (a02 * a13 - a03 * a12));
    out[7]  =  (a00 * (a12 * a23 - a13 * a22) - a10 * (a02 * a23 - a03 * a22) + a20 * (a02 * a13 - a03 * a12));
    out[8]  =  (a10 * (a21 * a33 - a23 * a31) - a20 * (a11 * a33 - a13 * a31) + a30 * (a11 * a23 - a13 * a21));
    out[9]  = -(a00 * (a21 * a33 - a23 * a31) - a20 * (a01 * a33 - a03 * a31) + a30 * (a01 * a23 - a03 * a21));
    out[10] =  (a00 * (a11 * a33 - a13 * a31) - a10 * (a01 * a33 - a03 * a31) + a30 * (a01 * a13 - a03 * a11));
    out[11] = -(a00 * (a11 * a23 - a13 * a21) - a10 * (a01 * a23 - a03 * a21) + a20 * (a01 * a13 - a03 * a11));
    out[12] = -(a10 * (a21 * a32 - a22 * a31) - a20 * (a11 * a32 - a12 * a31) + a30 * (a11 * a22 - a12 * a21));
    out[13] =  (a00 * (a21 * a32 - a22 * a31) - a20 * (a01 * a32 - a02 * a31) + a30 * (a01 * a22 - a02 * a21));
    out[14] = -(a00 * (a11 * a32 - a12 * a31) - a10 * (a01 * a32 - a02 * a31) + a30 * (a01 * a12 - a02 * a11));
    out[15] =  (a00 * (a11 * a22 - a12 * a21) - a10 * (a01 * a22 - a02 * a21) + a20 * (a01 * a12 - a02 * a11));
    return out;
};
},{}],35:[function(require,module,exports){
module.exports = clone;

/**
 * Creates a new mat4 initialized with values from an existing matrix
 *
 * @param {mat4} a matrix to clone
 * @returns {mat4} a new 4x4 matrix
 */
function clone(a) {
    var out = new Float32Array(16);
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    out[4] = a[4];
    out[5] = a[5];
    out[6] = a[6];
    out[7] = a[7];
    out[8] = a[8];
    out[9] = a[9];
    out[10] = a[10];
    out[11] = a[11];
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
    return out;
};
},{}],36:[function(require,module,exports){
module.exports = copy;

/**
 * Copy the values from one mat4 to another
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the source matrix
 * @returns {mat4} out
 */
function copy(out, a) {
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    out[4] = a[4];
    out[5] = a[5];
    out[6] = a[6];
    out[7] = a[7];
    out[8] = a[8];
    out[9] = a[9];
    out[10] = a[10];
    out[11] = a[11];
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
    return out;
};
},{}],37:[function(require,module,exports){
module.exports = create;

/**
 * Creates a new identity mat4
 *
 * @returns {mat4} a new 4x4 matrix
 */
function create() {
    var out = new Float32Array(16);
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = 1;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = 1;
    out[11] = 0;
    out[12] = 0;
    out[13] = 0;
    out[14] = 0;
    out[15] = 1;
    return out;
};
},{}],38:[function(require,module,exports){
module.exports = determinant;

/**
 * Calculates the determinant of a mat4
 *
 * @param {mat4} a the source matrix
 * @returns {Number} determinant of a
 */
function determinant(a) {
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
        a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
        a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15],

        b00 = a00 * a11 - a01 * a10,
        b01 = a00 * a12 - a02 * a10,
        b02 = a00 * a13 - a03 * a10,
        b03 = a01 * a12 - a02 * a11,
        b04 = a01 * a13 - a03 * a11,
        b05 = a02 * a13 - a03 * a12,
        b06 = a20 * a31 - a21 * a30,
        b07 = a20 * a32 - a22 * a30,
        b08 = a20 * a33 - a23 * a30,
        b09 = a21 * a32 - a22 * a31,
        b10 = a21 * a33 - a23 * a31,
        b11 = a22 * a33 - a23 * a32;

    // Calculate the determinant
    return b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
};
},{}],39:[function(require,module,exports){
module.exports = fromQuat;

/**
 * Creates a matrix from a quaternion rotation.
 *
 * @param {mat4} out mat4 receiving operation result
 * @param {quat4} q Rotation quaternion
 * @returns {mat4} out
 */
function fromQuat(out, q) {
    var x = q[0], y = q[1], z = q[2], w = q[3],
        x2 = x + x,
        y2 = y + y,
        z2 = z + z,

        xx = x * x2,
        yx = y * x2,
        yy = y * y2,
        zx = z * x2,
        zy = z * y2,
        zz = z * z2,
        wx = w * x2,
        wy = w * y2,
        wz = w * z2;

    out[0] = 1 - yy - zz;
    out[1] = yx + wz;
    out[2] = zx - wy;
    out[3] = 0;

    out[4] = yx - wz;
    out[5] = 1 - xx - zz;
    out[6] = zy + wx;
    out[7] = 0;

    out[8] = zx + wy;
    out[9] = zy - wx;
    out[10] = 1 - xx - yy;
    out[11] = 0;

    out[12] = 0;
    out[13] = 0;
    out[14] = 0;
    out[15] = 1;

    return out;
};
},{}],40:[function(require,module,exports){
module.exports = fromRotationTranslation;

/**
 * Creates a matrix from a quaternion rotation and vector translation
 * This is equivalent to (but much faster than):
 *
 *     mat4.identity(dest);
 *     mat4.translate(dest, vec);
 *     var quatMat = mat4.create();
 *     quat4.toMat4(quat, quatMat);
 *     mat4.multiply(dest, quatMat);
 *
 * @param {mat4} out mat4 receiving operation result
 * @param {quat4} q Rotation quaternion
 * @param {vec3} v Translation vector
 * @returns {mat4} out
 */
function fromRotationTranslation(out, q, v) {
    // Quaternion math
    var x = q[0], y = q[1], z = q[2], w = q[3],
        x2 = x + x,
        y2 = y + y,
        z2 = z + z,

        xx = x * x2,
        xy = x * y2,
        xz = x * z2,
        yy = y * y2,
        yz = y * z2,
        zz = z * z2,
        wx = w * x2,
        wy = w * y2,
        wz = w * z2;

    out[0] = 1 - (yy + zz);
    out[1] = xy + wz;
    out[2] = xz - wy;
    out[3] = 0;
    out[4] = xy - wz;
    out[5] = 1 - (xx + zz);
    out[6] = yz + wx;
    out[7] = 0;
    out[8] = xz + wy;
    out[9] = yz - wx;
    out[10] = 1 - (xx + yy);
    out[11] = 0;
    out[12] = v[0];
    out[13] = v[1];
    out[14] = v[2];
    out[15] = 1;
    
    return out;
};
},{}],41:[function(require,module,exports){
module.exports = frustum;

/**
 * Generates a frustum matrix with the given bounds
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {Number} left Left bound of the frustum
 * @param {Number} right Right bound of the frustum
 * @param {Number} bottom Bottom bound of the frustum
 * @param {Number} top Top bound of the frustum
 * @param {Number} near Near bound of the frustum
 * @param {Number} far Far bound of the frustum
 * @returns {mat4} out
 */
function frustum(out, left, right, bottom, top, near, far) {
    var rl = 1 / (right - left),
        tb = 1 / (top - bottom),
        nf = 1 / (near - far);
    out[0] = (near * 2) * rl;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = (near * 2) * tb;
    out[6] = 0;
    out[7] = 0;
    out[8] = (right + left) * rl;
    out[9] = (top + bottom) * tb;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[12] = 0;
    out[13] = 0;
    out[14] = (far * near * 2) * nf;
    out[15] = 0;
    return out;
};
},{}],42:[function(require,module,exports){
module.exports = identity;

/**
 * Set a mat4 to the identity matrix
 *
 * @param {mat4} out the receiving matrix
 * @returns {mat4} out
 */
function identity(out) {
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = 1;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = 1;
    out[11] = 0;
    out[12] = 0;
    out[13] = 0;
    out[14] = 0;
    out[15] = 1;
    return out;
};
},{}],43:[function(require,module,exports){
module.exports = {
  create: require('./create')
  , clone: require('./clone')
  , copy: require('./copy')
  , identity: require('./identity')
  , transpose: require('./transpose')
  , invert: require('./invert')
  , adjoint: require('./adjoint')
  , determinant: require('./determinant')
  , multiply: require('./multiply')
  , translate: require('./translate')
  , scale: require('./scale')
  , rotate: require('./rotate')
  , rotateX: require('./rotateX')
  , rotateY: require('./rotateY')
  , rotateZ: require('./rotateZ')
  , fromRotationTranslation: require('./fromRotationTranslation')
  , fromQuat: require('./fromQuat')
  , frustum: require('./frustum')
  , perspective: require('./perspective')
  , perspectiveFromFieldOfView: require('./perspectiveFromFieldOfView')
  , ortho: require('./ortho')
  , lookAt: require('./lookAt')
  , str: require('./str')
}
},{"./adjoint":34,"./clone":35,"./copy":36,"./create":37,"./determinant":38,"./fromQuat":39,"./fromRotationTranslation":40,"./frustum":41,"./identity":42,"./invert":44,"./lookAt":45,"./multiply":46,"./ortho":47,"./perspective":48,"./perspectiveFromFieldOfView":49,"./rotate":50,"./rotateX":51,"./rotateY":52,"./rotateZ":53,"./scale":54,"./str":55,"./translate":56,"./transpose":57}],44:[function(require,module,exports){
module.exports = invert;

/**
 * Inverts a mat4
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the source matrix
 * @returns {mat4} out
 */
function invert(out, a) {
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
        a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
        a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15],

        b00 = a00 * a11 - a01 * a10,
        b01 = a00 * a12 - a02 * a10,
        b02 = a00 * a13 - a03 * a10,
        b03 = a01 * a12 - a02 * a11,
        b04 = a01 * a13 - a03 * a11,
        b05 = a02 * a13 - a03 * a12,
        b06 = a20 * a31 - a21 * a30,
        b07 = a20 * a32 - a22 * a30,
        b08 = a20 * a33 - a23 * a30,
        b09 = a21 * a32 - a22 * a31,
        b10 = a21 * a33 - a23 * a31,
        b11 = a22 * a33 - a23 * a32,

        // Calculate the determinant
        det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;

    if (!det) { 
        return null; 
    }
    det = 1.0 / det;

    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;

    return out;
};
},{}],45:[function(require,module,exports){
var identity = require('./identity');

module.exports = lookAt;

/**
 * Generates a look-at matrix with the given eye position, focal point, and up axis
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {vec3} eye Position of the viewer
 * @param {vec3} center Point the viewer is looking at
 * @param {vec3} up vec3 pointing up
 * @returns {mat4} out
 */
function lookAt(out, eye, center, up) {
    var x0, x1, x2, y0, y1, y2, z0, z1, z2, len,
        eyex = eye[0],
        eyey = eye[1],
        eyez = eye[2],
        upx = up[0],
        upy = up[1],
        upz = up[2],
        centerx = center[0],
        centery = center[1],
        centerz = center[2];

    if (Math.abs(eyex - centerx) < 0.000001 &&
        Math.abs(eyey - centery) < 0.000001 &&
        Math.abs(eyez - centerz) < 0.000001) {
        return identity(out);
    }

    z0 = eyex - centerx;
    z1 = eyey - centery;
    z2 = eyez - centerz;

    len = 1 / Math.sqrt(z0 * z0 + z1 * z1 + z2 * z2);
    z0 *= len;
    z1 *= len;
    z2 *= len;

    x0 = upy * z2 - upz * z1;
    x1 = upz * z0 - upx * z2;
    x2 = upx * z1 - upy * z0;
    len = Math.sqrt(x0 * x0 + x1 * x1 + x2 * x2);
    if (!len) {
        x0 = 0;
        x1 = 0;
        x2 = 0;
    } else {
        len = 1 / len;
        x0 *= len;
        x1 *= len;
        x2 *= len;
    }

    y0 = z1 * x2 - z2 * x1;
    y1 = z2 * x0 - z0 * x2;
    y2 = z0 * x1 - z1 * x0;

    len = Math.sqrt(y0 * y0 + y1 * y1 + y2 * y2);
    if (!len) {
        y0 = 0;
        y1 = 0;
        y2 = 0;
    } else {
        len = 1 / len;
        y0 *= len;
        y1 *= len;
        y2 *= len;
    }

    out[0] = x0;
    out[1] = y0;
    out[2] = z0;
    out[3] = 0;
    out[4] = x1;
    out[5] = y1;
    out[6] = z1;
    out[7] = 0;
    out[8] = x2;
    out[9] = y2;
    out[10] = z2;
    out[11] = 0;
    out[12] = -(x0 * eyex + x1 * eyey + x2 * eyez);
    out[13] = -(y0 * eyex + y1 * eyey + y2 * eyez);
    out[14] = -(z0 * eyex + z1 * eyey + z2 * eyez);
    out[15] = 1;

    return out;
};
},{"./identity":42}],46:[function(require,module,exports){
module.exports = multiply;

/**
 * Multiplies two mat4's
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the first operand
 * @param {mat4} b the second operand
 * @returns {mat4} out
 */
function multiply(out, a, b) {
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
        a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
        a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    // Cache only the current line of the second matrix
    var b0  = b[0], b1 = b[1], b2 = b[2], b3 = b[3];  
    out[0] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[1] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[2] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[3] = b0*a03 + b1*a13 + b2*a23 + b3*a33;

    b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
    out[4] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[5] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[6] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[7] = b0*a03 + b1*a13 + b2*a23 + b3*a33;

    b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
    out[8] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[9] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[10] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[11] = b0*a03 + b1*a13 + b2*a23 + b3*a33;

    b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
    out[12] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[13] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[14] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[15] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
    return out;
};
},{}],47:[function(require,module,exports){
module.exports = ortho;

/**
 * Generates a orthogonal projection matrix with the given bounds
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {number} left Left bound of the frustum
 * @param {number} right Right bound of the frustum
 * @param {number} bottom Bottom bound of the frustum
 * @param {number} top Top bound of the frustum
 * @param {number} near Near bound of the frustum
 * @param {number} far Far bound of the frustum
 * @returns {mat4} out
 */
function ortho(out, left, right, bottom, top, near, far) {
    var lr = 1 / (left - right),
        bt = 1 / (bottom - top),
        nf = 1 / (near - far);
    out[0] = -2 * lr;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = -2 * bt;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = 2 * nf;
    out[11] = 0;
    out[12] = (left + right) * lr;
    out[13] = (top + bottom) * bt;
    out[14] = (far + near) * nf;
    out[15] = 1;
    return out;
};
},{}],48:[function(require,module,exports){
module.exports = perspective;

/**
 * Generates a perspective projection matrix with the given bounds
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {number} fovy Vertical field of view in radians
 * @param {number} aspect Aspect ratio. typically viewport width/height
 * @param {number} near Near bound of the frustum
 * @param {number} far Far bound of the frustum
 * @returns {mat4} out
 */
function perspective(out, fovy, aspect, near, far) {
    var f = 1.0 / Math.tan(fovy / 2),
        nf = 1 / (near - far);
    out[0] = f / aspect;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = f;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[12] = 0;
    out[13] = 0;
    out[14] = (2 * far * near) * nf;
    out[15] = 0;
    return out;
};
},{}],49:[function(require,module,exports){
module.exports = perspectiveFromFieldOfView;

/**
 * Generates a perspective projection matrix with the given field of view.
 * This is primarily useful for generating projection matrices to be used
 * with the still experiemental WebVR API.
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {number} fov Object containing the following values: upDegrees, downDegrees, leftDegrees, rightDegrees
 * @param {number} near Near bound of the frustum
 * @param {number} far Far bound of the frustum
 * @returns {mat4} out
 */
function perspectiveFromFieldOfView(out, fov, near, far) {
    var upTan = Math.tan(fov.upDegrees * Math.PI/180.0),
        downTan = Math.tan(fov.downDegrees * Math.PI/180.0),
        leftTan = Math.tan(fov.leftDegrees * Math.PI/180.0),
        rightTan = Math.tan(fov.rightDegrees * Math.PI/180.0),
        xScale = 2.0 / (leftTan + rightTan),
        yScale = 2.0 / (upTan + downTan);

    out[0] = xScale;
    out[1] = 0.0;
    out[2] = 0.0;
    out[3] = 0.0;
    out[4] = 0.0;
    out[5] = yScale;
    out[6] = 0.0;
    out[7] = 0.0;
    out[8] = -((leftTan - rightTan) * xScale * 0.5);
    out[9] = ((upTan - downTan) * yScale * 0.5);
    out[10] = far / (near - far);
    out[11] = -1.0;
    out[12] = 0.0;
    out[13] = 0.0;
    out[14] = (far * near) / (near - far);
    out[15] = 0.0;
    return out;
}


},{}],50:[function(require,module,exports){
module.exports = rotate;

/**
 * Rotates a mat4 by the given angle
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @param {vec3} axis the axis to rotate around
 * @returns {mat4} out
 */
function rotate(out, a, rad, axis) {
    var x = axis[0], y = axis[1], z = axis[2],
        len = Math.sqrt(x * x + y * y + z * z),
        s, c, t,
        a00, a01, a02, a03,
        a10, a11, a12, a13,
        a20, a21, a22, a23,
        b00, b01, b02,
        b10, b11, b12,
        b20, b21, b22;

    if (Math.abs(len) < 0.000001) { return null; }
    
    len = 1 / len;
    x *= len;
    y *= len;
    z *= len;

    s = Math.sin(rad);
    c = Math.cos(rad);
    t = 1 - c;

    a00 = a[0]; a01 = a[1]; a02 = a[2]; a03 = a[3];
    a10 = a[4]; a11 = a[5]; a12 = a[6]; a13 = a[7];
    a20 = a[8]; a21 = a[9]; a22 = a[10]; a23 = a[11];

    // Construct the elements of the rotation matrix
    b00 = x * x * t + c; b01 = y * x * t + z * s; b02 = z * x * t - y * s;
    b10 = x * y * t - z * s; b11 = y * y * t + c; b12 = z * y * t + x * s;
    b20 = x * z * t + y * s; b21 = y * z * t - x * s; b22 = z * z * t + c;

    // Perform rotation-specific matrix multiplication
    out[0] = a00 * b00 + a10 * b01 + a20 * b02;
    out[1] = a01 * b00 + a11 * b01 + a21 * b02;
    out[2] = a02 * b00 + a12 * b01 + a22 * b02;
    out[3] = a03 * b00 + a13 * b01 + a23 * b02;
    out[4] = a00 * b10 + a10 * b11 + a20 * b12;
    out[5] = a01 * b10 + a11 * b11 + a21 * b12;
    out[6] = a02 * b10 + a12 * b11 + a22 * b12;
    out[7] = a03 * b10 + a13 * b11 + a23 * b12;
    out[8] = a00 * b20 + a10 * b21 + a20 * b22;
    out[9] = a01 * b20 + a11 * b21 + a21 * b22;
    out[10] = a02 * b20 + a12 * b21 + a22 * b22;
    out[11] = a03 * b20 + a13 * b21 + a23 * b22;

    if (a !== out) { // If the source and destination differ, copy the unchanged last row
        out[12] = a[12];
        out[13] = a[13];
        out[14] = a[14];
        out[15] = a[15];
    }
    return out;
};
},{}],51:[function(require,module,exports){
module.exports = rotateX;

/**
 * Rotates a matrix by the given angle around the X axis
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat4} out
 */
function rotateX(out, a, rad) {
    var s = Math.sin(rad),
        c = Math.cos(rad),
        a10 = a[4],
        a11 = a[5],
        a12 = a[6],
        a13 = a[7],
        a20 = a[8],
        a21 = a[9],
        a22 = a[10],
        a23 = a[11];

    if (a !== out) { // If the source and destination differ, copy the unchanged rows
        out[0]  = a[0];
        out[1]  = a[1];
        out[2]  = a[2];
        out[3]  = a[3];
        out[12] = a[12];
        out[13] = a[13];
        out[14] = a[14];
        out[15] = a[15];
    }

    // Perform axis-specific matrix multiplication
    out[4] = a10 * c + a20 * s;
    out[5] = a11 * c + a21 * s;
    out[6] = a12 * c + a22 * s;
    out[7] = a13 * c + a23 * s;
    out[8] = a20 * c - a10 * s;
    out[9] = a21 * c - a11 * s;
    out[10] = a22 * c - a12 * s;
    out[11] = a23 * c - a13 * s;
    return out;
};
},{}],52:[function(require,module,exports){
module.exports = rotateY;

/**
 * Rotates a matrix by the given angle around the Y axis
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat4} out
 */
function rotateY(out, a, rad) {
    var s = Math.sin(rad),
        c = Math.cos(rad),
        a00 = a[0],
        a01 = a[1],
        a02 = a[2],
        a03 = a[3],
        a20 = a[8],
        a21 = a[9],
        a22 = a[10],
        a23 = a[11];

    if (a !== out) { // If the source and destination differ, copy the unchanged rows
        out[4]  = a[4];
        out[5]  = a[5];
        out[6]  = a[6];
        out[7]  = a[7];
        out[12] = a[12];
        out[13] = a[13];
        out[14] = a[14];
        out[15] = a[15];
    }

    // Perform axis-specific matrix multiplication
    out[0] = a00 * c - a20 * s;
    out[1] = a01 * c - a21 * s;
    out[2] = a02 * c - a22 * s;
    out[3] = a03 * c - a23 * s;
    out[8] = a00 * s + a20 * c;
    out[9] = a01 * s + a21 * c;
    out[10] = a02 * s + a22 * c;
    out[11] = a03 * s + a23 * c;
    return out;
};
},{}],53:[function(require,module,exports){
module.exports = rotateZ;

/**
 * Rotates a matrix by the given angle around the Z axis
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat4} out
 */
function rotateZ(out, a, rad) {
    var s = Math.sin(rad),
        c = Math.cos(rad),
        a00 = a[0],
        a01 = a[1],
        a02 = a[2],
        a03 = a[3],
        a10 = a[4],
        a11 = a[5],
        a12 = a[6],
        a13 = a[7];

    if (a !== out) { // If the source and destination differ, copy the unchanged last row
        out[8]  = a[8];
        out[9]  = a[9];
        out[10] = a[10];
        out[11] = a[11];
        out[12] = a[12];
        out[13] = a[13];
        out[14] = a[14];
        out[15] = a[15];
    }

    // Perform axis-specific matrix multiplication
    out[0] = a00 * c + a10 * s;
    out[1] = a01 * c + a11 * s;
    out[2] = a02 * c + a12 * s;
    out[3] = a03 * c + a13 * s;
    out[4] = a10 * c - a00 * s;
    out[5] = a11 * c - a01 * s;
    out[6] = a12 * c - a02 * s;
    out[7] = a13 * c - a03 * s;
    return out;
};
},{}],54:[function(require,module,exports){
module.exports = scale;

/**
 * Scales the mat4 by the dimensions in the given vec3
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to scale
 * @param {vec3} v the vec3 to scale the matrix by
 * @returns {mat4} out
 **/
function scale(out, a, v) {
    var x = v[0], y = v[1], z = v[2];

    out[0] = a[0] * x;
    out[1] = a[1] * x;
    out[2] = a[2] * x;
    out[3] = a[3] * x;
    out[4] = a[4] * y;
    out[5] = a[5] * y;
    out[6] = a[6] * y;
    out[7] = a[7] * y;
    out[8] = a[8] * z;
    out[9] = a[9] * z;
    out[10] = a[10] * z;
    out[11] = a[11] * z;
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
    return out;
};
},{}],55:[function(require,module,exports){
module.exports = str;

/**
 * Returns a string representation of a mat4
 *
 * @param {mat4} mat matrix to represent as a string
 * @returns {String} string representation of the matrix
 */
function str(a) {
    return 'mat4(' + a[0] + ', ' + a[1] + ', ' + a[2] + ', ' + a[3] + ', ' +
                    a[4] + ', ' + a[5] + ', ' + a[6] + ', ' + a[7] + ', ' +
                    a[8] + ', ' + a[9] + ', ' + a[10] + ', ' + a[11] + ', ' + 
                    a[12] + ', ' + a[13] + ', ' + a[14] + ', ' + a[15] + ')';
};
},{}],56:[function(require,module,exports){
module.exports = translate;

/**
 * Translate a mat4 by the given vector
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to translate
 * @param {vec3} v vector to translate by
 * @returns {mat4} out
 */
function translate(out, a, v) {
    var x = v[0], y = v[1], z = v[2],
        a00, a01, a02, a03,
        a10, a11, a12, a13,
        a20, a21, a22, a23;

    if (a === out) {
        out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
        out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
        out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
        out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
    } else {
        a00 = a[0]; a01 = a[1]; a02 = a[2]; a03 = a[3];
        a10 = a[4]; a11 = a[5]; a12 = a[6]; a13 = a[7];
        a20 = a[8]; a21 = a[9]; a22 = a[10]; a23 = a[11];

        out[0] = a00; out[1] = a01; out[2] = a02; out[3] = a03;
        out[4] = a10; out[5] = a11; out[6] = a12; out[7] = a13;
        out[8] = a20; out[9] = a21; out[10] = a22; out[11] = a23;

        out[12] = a00 * x + a10 * y + a20 * z + a[12];
        out[13] = a01 * x + a11 * y + a21 * z + a[13];
        out[14] = a02 * x + a12 * y + a22 * z + a[14];
        out[15] = a03 * x + a13 * y + a23 * z + a[15];
    }

    return out;
};
},{}],57:[function(require,module,exports){
module.exports = transpose;

/**
 * Transpose the values of a mat4
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the source matrix
 * @returns {mat4} out
 */
function transpose(out, a) {
    // If we are transposing ourselves we can skip a few steps but have to cache some values
    if (out === a) {
        var a01 = a[1], a02 = a[2], a03 = a[3],
            a12 = a[6], a13 = a[7],
            a23 = a[11];

        out[1] = a[4];
        out[2] = a[8];
        out[3] = a[12];
        out[4] = a01;
        out[6] = a[9];
        out[7] = a[13];
        out[8] = a02;
        out[9] = a12;
        out[11] = a[14];
        out[12] = a03;
        out[13] = a13;
        out[14] = a23;
    } else {
        out[0] = a[0];
        out[1] = a[4];
        out[2] = a[8];
        out[3] = a[12];
        out[4] = a[1];
        out[5] = a[5];
        out[6] = a[9];
        out[7] = a[13];
        out[8] = a[2];
        out[9] = a[6];
        out[10] = a[10];
        out[11] = a[14];
        out[12] = a[3];
        out[13] = a[7];
        out[14] = a[11];
        out[15] = a[15];
    }
    
    return out;
};
},{}],58:[function(require,module,exports){
/* global XMLHttpRequest */
var configParameters = [
  'manifest',
  'onDone',
  'onProgress',
  'onError'
]

var manifestParameters = [
  'type',
  'src',
  'stream',
  'credentials',
  'parser'
]

var parserParameters = [
  'onData',
  'onDone'
]

var STATE_ERROR = -1
var STATE_DATA = 0
var STATE_COMPLETE = 1

function raise (message) {
  throw new Error('resl: ' + message)
}

function checkType (object, parameters, name) {
  Object.keys(object).forEach(function (param) {
    if (parameters.indexOf(param) < 0) {
      raise('invalid parameter "' + param + '" in ' + name)
    }
  })
}

function Loader (name, cancel) {
  this.state = STATE_DATA
  this.ready = false
  this.progress = 0
  this.name = name
  this.cancel = cancel
}

module.exports = function resl (config) {
  if (typeof config !== 'object' || !config) {
    raise('invalid or missing configuration')
  }

  checkType(config, configParameters, 'config')

  var manifest = config.manifest
  if (typeof manifest !== 'object' || !manifest) {
    raise('missing manifest')
  }

  function getFunction (name, dflt) {
    if (name in config) {
      var func = config[name]
      if (typeof func !== 'function') {
        raise('invalid callback "' + name + '"')
      }
      return func
    }
    return null
  }

  var onDone = getFunction('onDone')
  if (!onDone) {
    raise('missing onDone() callback')
  }

  var onProgress = getFunction('onProgress')
  var onError = getFunction('onError')

  var assets = {}

  var state = STATE_DATA

  function loadXHR (request) {
    var name = request.name
    var stream = request.stream
    var binary = request.type === 'binary'
    var parser = request.parser

    var xhr = new XMLHttpRequest()
    var asset = null

    var loader = new Loader(name, cancel)

    if (stream) {
      xhr.onreadystatechange = onReadyStateChange
    } else {
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          onReadyStateChange()
        }
      }
    }

    if (binary) {
      xhr.responseType = 'arraybuffer'
    }

    function onReadyStateChange () {
      if (xhr.readyState < 2 ||
          loader.state === STATE_COMPLETE ||
          loader.state === STATE_ERROR) {
        return
      }
      if (xhr.status !== 200) {
        return abort('error loading resource "' + request.name + '"')
      }
      if (xhr.readyState > 2 && loader.state === STATE_DATA) {
        var response
        if (request.type === 'binary') {
          response = xhr.response
        } else {
          response = xhr.responseText
        }
        if (parser.data) {
          try {
            asset = parser.data(response)
          } catch (e) {
            return abort(e)
          }
        } else {
          asset = response
        }
      }
      if (xhr.readyState > 3 && loader.state === STATE_DATA) {
        if (parser.done) {
          try {
            asset = parser.done()
          } catch (e) {
            return abort(e)
          }
        }
        loader.state = STATE_COMPLETE
      }
      assets[name] = asset
      loader.progress = 0.75 * loader.progress + 0.25
      loader.ready =
        (request.stream && !!asset) ||
        loader.state === STATE_COMPLETE
      notifyProgress()
    }

    function cancel () {
      if (loader.state === STATE_COMPLETE || loader.state === STATE_ERROR) {
        return
      }
      xhr.onreadystatechange = null
      xhr.abort()
      loader.state = STATE_ERROR
    }

    // set up request
    if (request.credentials) {
      xhr.withCredentials = true
    }
    xhr.open('GET', request.src, true)
    xhr.send()

    return loader
  }

  function loadElement (request, element) {
    var name = request.name
    var parser = request.parser

    var loader = new Loader(name, cancel)
    var asset = element

    function handleProgress () {
      if (loader.state === STATE_DATA) {
        if (parser.data) {
          try {
            asset = parser.data(element)
          } catch (e) {
            return abort(e)
          }
        } else {
          asset = element
        }
      }
    }

    function onProgress (e) {
      handleProgress()
      assets[name] = asset
      if (e.lengthComputable) {
        loader.progress = Math.max(loader.progress, e.loaded / e.total)
      } else {
        loader.progress = 0.75 * loader.progress + 0.25
      }
      notifyProgress(name)
    }

    function onComplete () {
      handleProgress()
      if (loader.state === STATE_DATA) {
        if (parser.done) {
          try {
            asset = parser.done()
          } catch (e) {
            return abort(e)
          }
        }
        loader.state = STATE_COMPLETE
      }
      loader.progress = 1
      loader.ready = true
      assets[name] = asset
      removeListeners()
      notifyProgress('finish ' + name)
    }

    function onError () {
      abort('error loading asset "' + name + '"')
    }

    if (request.stream) {
      element.addEventListener('progress', onProgress)
    }
    if (request.type === 'image') {
      element.addEventListener('load', onComplete)
    } else {
      var canPlay = false
      var loadedMetaData = false
      element.addEventListener('loadedmetadata', function () {
        loadedMetaData = true
        if (canPlay) {
          onComplete()
        }
      })
      element.addEventListener('canplay', function () {
        canPlay = true
        if (loadedMetaData) {
          onComplete()
        }
      })
    }
    element.addEventListener('error', onError)

    function removeListeners () {
      if (request.stream) {
        element.removeEventListener('progress', onProgress)
      }
      if (request.type === 'image') {
        element.addEventListener('load', onComplete)
      } else {
        element.addEventListener('canplay', onComplete)
      }
      element.removeEventListener('error', onError)
    }

    function cancel () {
      if (loader.state === STATE_COMPLETE || loader.state === STATE_ERROR) {
        return
      }
      loader.state = STATE_ERROR
      removeListeners()
      element.src = ''
    }

    // set up request
    if (request.credentials) {
      element.crossOrigin = 'use-credentials'
    } else {
      element.crossOrigin = 'anonymous'
    }
    element.src = request.src

    return loader
  }

  var loaders = {
    text: loadXHR,
    binary: function (request) {
      // TODO use fetch API for streaming if supported
      return loadXHR(request)
    },
    image: function (request) {
      return loadElement(request, document.createElement('img'))
    },
    video: function (request) {
      return loadElement(request, document.createElement('video'))
    },
    audio: function (request) {
      return loadElement(request, document.createElement('audio'))
    }
  }

  // First we parse all objects in order to verify that all type information
  // is correct
  var pending = Object.keys(manifest).map(function (name) {
    var request = manifest[name]
    if (typeof request === 'string') {
      request = {
        src: request
      }
    } else if (typeof request !== 'object' || !request) {
      raise('invalid asset definition "' + name + '"')
    }

    checkType(request, manifestParameters, 'asset "' + name + '"')

    function getParameter (prop, accepted, init) {
      var value = init
      if (prop in request) {
        value = request[prop]
      }
      if (accepted.indexOf(value) < 0) {
        raise('invalid ' + prop + ' "' + value + '" for asset "' + name + '", possible values: ' + accepted)
      }
      return value
    }

    function getString (prop, required, init) {
      var value = init
      if (prop in request) {
        value = request[prop]
      } else if (required) {
        raise('missing ' + prop + ' for asset "' + name + '"')
      }
      if (typeof value !== 'string') {
        raise('invalid ' + prop + ' for asset "' + name + '", must be a string')
      }
      return value
    }

    function getParseFunc (name, dflt) {
      if (name in request.parser) {
        var result = request.parser[name]
        if (typeof result !== 'function') {
          raise('invalid parser callback ' + name + ' for asset "' + name + '"')
        }
        return result
      } else {
        return dflt
      }
    }

    var parser = {}
    if ('parser' in request) {
      if (typeof request.parser === 'function') {
        parser = {
          data: request.parser
        }
      } else if (typeof request.parser === 'object' && request.parser) {
        checkType(parser, parserParameters, 'parser for asset "' + name + '"')
        if (!('onData' in parser)) {
          raise('missing onData callback for parser in asset "' + name + '"')
        }
        parser = {
          data: getParseFunc('onData'),
          done: getParseFunc('onDone')
        }
      } else {
        raise('invalid parser for asset "' + name + '"')
      }
    }

    return {
      name: name,
      type: getParameter('type', Object.keys(loaders), 'text'),
      stream: !!request.stream,
      credentials: !!request.credentials,
      src: getString('src', true, ''),
      parser: parser
    }
  }).map(function (request) {
    return (loaders[request.type])(request)
  })

  function abort (message) {
    if (state === STATE_ERROR || state === STATE_COMPLETE) {
      return
    }
    state = STATE_ERROR
    pending.forEach(function (loader) {
      loader.cancel()
    })
    if (onError) {
      if (typeof message === 'string') {
        onError(new Error('resl: ' + message))
      } else {
        onError(message)
      }
    } else {
      console.error('resl error:', message)
    }
  }

  function notifyProgress (message) {
    if (state === STATE_ERROR || state === STATE_COMPLETE) {
      return
    }

    var progress = 0
    var numReady = 0
    pending.forEach(function (loader) {
      if (loader.ready) {
        numReady += 1
      }
      progress += loader.progress
    })

    if (numReady === pending.length) {
      state = STATE_COMPLETE
      onDone(assets)
    } else {
      if (onProgress) {
        onProgress(progress / pending.length, message)
      }
    }
  }

  if (pending.length === 0) {
    setTimeout(function () {
      notifyProgress('done')
    }, 1)
  }
}

},{}],59:[function(require,module,exports){

var extend = require('./lib/util/extend');
var dynamic = require('./lib/dynamic');
var raf = require('./lib/util/raf');
var clock = require('./lib/util/clock');
var createStringStore = require('./lib/strings');
var initWebGL = require('./lib/webgl');
var wrapExtensions = require('./lib/extension');
var wrapLimits = require('./lib/limits');
var wrapBuffers = require('./lib/buffer');
var wrapElements = require('./lib/elements');
var wrapTextures = require('./lib/texture');
var wrapRenderbuffers = require('./lib/renderbuffer');
var wrapFramebuffers = require('./lib/framebuffer');
var wrapAttributes = require('./lib/attribute');
var wrapShaders = require('./lib/shader');
var wrapRead = require('./lib/read');
var createCore = require('./lib/core');
var createStats = require('./lib/stats');
var createTimer = require('./lib/timer');

var GL_COLOR_BUFFER_BIT = 16384;
var GL_DEPTH_BUFFER_BIT = 256;
var GL_STENCIL_BUFFER_BIT = 1024;

var GL_ARRAY_BUFFER = 34962;

var CONTEXT_LOST_EVENT = 'webglcontextlost';
var CONTEXT_RESTORED_EVENT = 'webglcontextrestored';

var DYN_PROP = 1;
var DYN_CONTEXT = 2;
var DYN_STATE = 3;

function find(haystack, needle) {
  for (var i = 0; i < haystack.length; ++i) {
    if (haystack[i] === needle) {
      return i;
    }
  }
  return -1;
}

module.exports = function wrapREGL(args) {
  var config = initWebGL(args);
  if (!config) {
    return null;
  }

  var gl = config.gl;
  var glAttributes = gl.getContextAttributes();
  var contextLost = gl.isContextLost();

  var extensionState = wrapExtensions(gl, config);
  if (!extensionState) {
    return null;
  }

  var stringStore = createStringStore();
  var stats = createStats();
  var extensions = extensionState.extensions;
  var timer = createTimer(gl, extensions);

  var START_TIME = clock();
  var WIDTH = gl.drawingBufferWidth;
  var HEIGHT = gl.drawingBufferHeight;

  var contextState = {
    tick: 0,
    time: 0,
    viewportWidth: WIDTH,
    viewportHeight: HEIGHT,
    framebufferWidth: WIDTH,
    framebufferHeight: HEIGHT,
    drawingBufferWidth: WIDTH,
    drawingBufferHeight: HEIGHT,
    pixelRatio: config.pixelRatio
  };
  var uniformState = {};
  var drawState = {
    elements: null,
    primitive: 4, // GL_TRIANGLES
    count: -1,
    offset: 0,
    instances: -1
  };

  var limits = wrapLimits(gl, extensions);
  var bufferState = wrapBuffers(gl, stats, config);
  var elementState = wrapElements(gl, extensions, bufferState, stats);
  var attributeState = wrapAttributes(gl, extensions, limits, bufferState, stringStore);
  var shaderState = wrapShaders(gl, stringStore, stats, config);
  var textureState = wrapTextures(gl, extensions, limits, function () {
    core.procs.poll();
  }, contextState, stats, config);
  var renderbufferState = wrapRenderbuffers(gl, extensions, limits, stats, config);
  var framebufferState = wrapFramebuffers(gl, extensions, limits, textureState, renderbufferState, stats);
  var core = createCore(gl, stringStore, extensions, limits, bufferState, elementState, textureState, framebufferState, uniformState, attributeState, shaderState, drawState, contextState, timer, config);
  var readPixels = wrapRead(gl, framebufferState, core.procs.poll, contextState, glAttributes, extensions);

  var nextState = core.next;
  var canvas = gl.canvas;

  var rafCallbacks = [];
  var lossCallbacks = [];
  var restoreCallbacks = [];
  var destroyCallbacks = [config.onDestroy];

  var activeRAF = null;
  function handleRAF() {
    if (rafCallbacks.length === 0) {
      if (timer) {
        timer.update();
      }
      activeRAF = null;
      return;
    }

    // schedule next animation frame
    activeRAF = raf.next(handleRAF);

    // poll for changes
    poll();

    // fire a callback for all pending rafs
    for (var i = rafCallbacks.length - 1; i >= 0; --i) {
      var cb = rafCallbacks[i];
      if (cb) {
        cb(contextState, null, 0);
      }
    }

    // flush all pending webgl calls
    gl.flush();

    // poll GPU timers *after* gl.flush so we don't delay command dispatch
    if (timer) {
      timer.update();
    }
  }

  function startRAF() {
    if (!activeRAF && rafCallbacks.length > 0) {
      activeRAF = raf.next(handleRAF);
    }
  }

  function stopRAF() {
    if (activeRAF) {
      raf.cancel(handleRAF);
      activeRAF = null;
    }
  }

  function handleContextLoss(event) {
    event.preventDefault();

    // set context lost flag
    contextLost = true;

    // pause request animation frame
    stopRAF();

    // lose context
    lossCallbacks.forEach(function (cb) {
      cb();
    });
  }

  function handleContextRestored(event) {
    // clear error code
    gl.getError();

    // clear context lost flag
    contextLost = false;

    // refresh state
    extensionState.restore();
    shaderState.restore();
    bufferState.restore();
    textureState.restore();
    renderbufferState.restore();
    framebufferState.restore();
    if (timer) {
      timer.restore();
    }

    // refresh state
    core.procs.refresh();

    // restart RAF
    startRAF();

    // restore context
    restoreCallbacks.forEach(function (cb) {
      cb();
    });
  }

  if (canvas) {
    canvas.addEventListener(CONTEXT_LOST_EVENT, handleContextLoss, false);
    canvas.addEventListener(CONTEXT_RESTORED_EVENT, handleContextRestored, false);
  }

  function destroy() {
    rafCallbacks.length = 0;
    stopRAF();

    if (canvas) {
      canvas.removeEventListener(CONTEXT_LOST_EVENT, handleContextLoss);
      canvas.removeEventListener(CONTEXT_RESTORED_EVENT, handleContextRestored);
    }

    shaderState.clear();
    framebufferState.clear();
    renderbufferState.clear();
    textureState.clear();
    elementState.clear();
    bufferState.clear();

    if (timer) {
      timer.clear();
    }

    destroyCallbacks.forEach(function (cb) {
      cb();
    });
  }

  function compileProcedure(options) {

    function flattenNestedOptions(options) {
      var result = extend({}, options);
      delete result.uniforms;
      delete result.attributes;
      delete result.context;

      if ('stencil' in result && result.stencil.op) {
        result.stencil.opBack = result.stencil.opFront = result.stencil.op;
        delete result.stencil.op;
      }

      function merge(name) {
        if (name in result) {
          var child = result[name];
          delete result[name];
          Object.keys(child).forEach(function (prop) {
            result[name + '.' + prop] = child[prop];
          });
        }
      }
      merge('blend');
      merge('depth');
      merge('cull');
      merge('stencil');
      merge('polygonOffset');
      merge('scissor');
      merge('sample');

      return result;
    }

    function separateDynamic(object) {
      var staticItems = {};
      var dynamicItems = {};
      Object.keys(object).forEach(function (option) {
        var value = object[option];
        if (dynamic.isDynamic(value)) {
          dynamicItems[option] = dynamic.unbox(value, option);
        } else {
          staticItems[option] = value;
        }
      });
      return {
        dynamic: dynamicItems,
        static: staticItems
      };
    }

    // Treat context variables separate from other dynamic variables
    var context = separateDynamic(options.context || {});
    var uniforms = separateDynamic(options.uniforms || {});
    var attributes = separateDynamic(options.attributes || {});
    var opts = separateDynamic(flattenNestedOptions(options));

    var stats = {
      gpuTime: 0.0,
      cpuTime: 0.0,
      count: 0
    };

    var compiled = core.compile(opts, attributes, uniforms, context, stats);

    var draw = compiled.draw;
    var batch = compiled.batch;
    var scope = compiled.scope;

    // FIXME: we should modify code generation for batch commands so this
    // isn't necessary
    var EMPTY_ARRAY = [];
    function reserve(count) {
      while (EMPTY_ARRAY.length < count) {
        EMPTY_ARRAY.push(null);
      }
      return EMPTY_ARRAY;
    }

    function REGLCommand(args, body) {
      var i;
      if (contextLost) {}
      if (typeof args === 'function') {
        return scope.call(this, null, args, 0);
      } else if (typeof body === 'function') {
        if (typeof args === 'number') {
          for (i = 0; i < args; ++i) {
            scope.call(this, null, body, i);
          }
          return;
        } else if (Array.isArray(args)) {
          for (i = 0; i < args.length; ++i) {
            scope.call(this, args[i], body, i);
          }
          return;
        } else {
          return scope.call(this, args, body, 0);
        }
      } else if (typeof args === 'number') {
        if (args > 0) {
          return batch.call(this, reserve(args | 0), args | 0);
        }
      } else if (Array.isArray(args)) {
        if (args.length) {
          return batch.call(this, args, args.length);
        }
      } else {
        return draw.call(this, args);
      }
    }

    return extend(REGLCommand, {
      stats: stats
    });
  }

  function clear(options) {

    var clearFlags = 0;
    core.procs.poll();

    var c = options.color;
    if (c) {
      gl.clearColor(+c[0] || 0, +c[1] || 0, +c[2] || 0, +c[3] || 0);
      clearFlags |= GL_COLOR_BUFFER_BIT;
    }
    if ('depth' in options) {
      gl.clearDepth(+options.depth);
      clearFlags |= GL_DEPTH_BUFFER_BIT;
    }
    if ('stencil' in options) {
      gl.clearStencil(options.stencil | 0);
      clearFlags |= GL_STENCIL_BUFFER_BIT;
    }

    gl.clear(clearFlags);
  }

  function frame(cb) {

    rafCallbacks.push(cb);

    function cancel() {
      // FIXME:  should we check something other than equals cb here?
      // what if a user calls frame twice with the same callback...
      //
      var i = find(rafCallbacks, cb);

      function pendingCancel() {
        var index = find(rafCallbacks, pendingCancel);
        rafCallbacks[index] = rafCallbacks[rafCallbacks.length - 1];
        rafCallbacks.length -= 1;
        if (rafCallbacks.length <= 0) {
          stopRAF();
        }
      }
      rafCallbacks[i] = pendingCancel;
    }

    startRAF();

    return {
      cancel: cancel
    };
  }

  // poll viewport
  function pollViewport() {
    var viewport = nextState.viewport;
    var scissorBox = nextState.scissor_box;
    viewport[0] = viewport[1] = scissorBox[0] = scissorBox[1] = 0;
    contextState.viewportWidth = contextState.framebufferWidth = contextState.drawingBufferWidth = viewport[2] = scissorBox[2] = gl.drawingBufferWidth;
    contextState.viewportHeight = contextState.framebufferHeight = contextState.drawingBufferHeight = viewport[3] = scissorBox[3] = gl.drawingBufferHeight;
  }

  function poll() {
    contextState.tick += 1;
    contextState.time = now();
    pollViewport();
    core.procs.poll();
  }

  function refresh() {
    pollViewport();
    core.procs.refresh();
    if (timer) {
      timer.update();
    }
  }

  function now() {
    return (clock() - START_TIME) / 1000.0;
  }

  refresh();

  function addListener(event, callback) {

    var callbacks;
    switch (event) {
      case 'frame':
        return frame(callback);
      case 'lost':
        callbacks = lossCallbacks;
        break;
      case 'restore':
        callbacks = restoreCallbacks;
        break;
      case 'destroy':
        callbacks = destroyCallbacks;
        break;
      default:

    }

    callbacks.push(callback);
    return {
      cancel: function () {
        for (var i = 0; i < callbacks.length; ++i) {
          if (callbacks[i] === callback) {
            callbacks[i] = callbacks[callbacks.length - 1];
            callbacks.pop();
            return;
          }
        }
      }
    };
  }

  var regl = extend(compileProcedure, {
    // Clear current FBO
    clear: clear,

    // Short cuts for dynamic variables
    prop: dynamic.define.bind(null, DYN_PROP),
    context: dynamic.define.bind(null, DYN_CONTEXT),
    this: dynamic.define.bind(null, DYN_STATE),

    // executes an empty draw command
    draw: compileProcedure({}),

    // Resources
    buffer: function (options) {
      return bufferState.create(options, GL_ARRAY_BUFFER, false, false);
    },
    elements: function (options) {
      return elementState.create(options, false);
    },
    texture: textureState.create2D,
    cube: textureState.createCube,
    renderbuffer: renderbufferState.create,
    framebuffer: framebufferState.create,
    framebufferCube: framebufferState.createCube,

    // Expose context attributes
    attributes: glAttributes,

    // Frame rendering
    frame: frame,
    on: addListener,

    // System limits
    limits: limits,
    hasExtension: function (name) {
      return limits.extensions.indexOf(name.toLowerCase()) >= 0;
    },

    // Read pixels
    read: readPixels,

    // Destroy regl and all associated resources
    destroy: destroy,

    // Direct GL state manipulation
    _gl: gl,
    _refresh: refresh,

    poll: function () {
      poll();
      if (timer) {
        timer.update();
      }
    },

    // Current time
    now: now,

    // regl Statistics Information
    stats: stats
  });

  config.onDone(null, regl);

  return regl;
};

},{"./lib/attribute":2,"./lib/buffer":3,"./lib/core":8,"./lib/dynamic":9,"./lib/elements":10,"./lib/extension":11,"./lib/framebuffer":12,"./lib/limits":13,"./lib/read":14,"./lib/renderbuffer":15,"./lib/shader":16,"./lib/stats":17,"./lib/strings":18,"./lib/texture":19,"./lib/timer":20,"./lib/util/clock":21,"./lib/util/extend":23,"./lib/util/raf":30,"./lib/webgl":33}]},{},[1])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJleGFtcGxlL2N1YmUuanMiLCJsaWIvYXR0cmlidXRlLmpzIiwibGliL2J1ZmZlci5qcyIsImxpYi9jb25zdGFudHMvYXJyYXl0eXBlcy5qc29uIiwibGliL2NvbnN0YW50cy9kdHlwZXMuanNvbiIsImxpYi9jb25zdGFudHMvcHJpbWl0aXZlcy5qc29uIiwibGliL2NvbnN0YW50cy91c2FnZS5qc29uIiwibGliL2NvcmUuanMiLCJsaWIvZHluYW1pYy5qcyIsImxpYi9lbGVtZW50cy5qcyIsImxpYi9leHRlbnNpb24uanMiLCJsaWIvZnJhbWVidWZmZXIuanMiLCJsaWIvbGltaXRzLmpzIiwibGliL3JlYWQuanMiLCJsaWIvcmVuZGVyYnVmZmVyLmpzIiwibGliL3NoYWRlci5qcyIsImxpYi9zdGF0cy5qcyIsImxpYi9zdHJpbmdzLmpzIiwibGliL3RleHR1cmUuanMiLCJsaWIvdGltZXIuanMiLCJsaWIvdXRpbC9jbG9jay5qcyIsImxpYi91dGlsL2NvZGVnZW4uanMiLCJsaWIvdXRpbC9leHRlbmQuanMiLCJsaWIvdXRpbC9mbGF0dGVuLmpzIiwibGliL3V0aWwvaXMtYXJyYXktbGlrZS5qcyIsImxpYi91dGlsL2lzLW5kYXJyYXkuanMiLCJsaWIvdXRpbC9pcy10eXBlZC1hcnJheS5qcyIsImxpYi91dGlsL2xvb3AuanMiLCJsaWIvdXRpbC9wb29sLmpzIiwibGliL3V0aWwvcmFmLmpzIiwibGliL3V0aWwvdG8taGFsZi1mbG9hdC5qcyIsImxpYi91dGlsL3ZhbHVlcy5qcyIsImxpYi93ZWJnbC5qcyIsIm5vZGVfbW9kdWxlcy9nbC1tYXQ0L2Fkam9pbnQuanMiLCJub2RlX21vZHVsZXMvZ2wtbWF0NC9jbG9uZS5qcyIsIm5vZGVfbW9kdWxlcy9nbC1tYXQ0L2NvcHkuanMiLCJub2RlX21vZHVsZXMvZ2wtbWF0NC9jcmVhdGUuanMiLCJub2RlX21vZHVsZXMvZ2wtbWF0NC9kZXRlcm1pbmFudC5qcyIsIm5vZGVfbW9kdWxlcy9nbC1tYXQ0L2Zyb21RdWF0LmpzIiwibm9kZV9tb2R1bGVzL2dsLW1hdDQvZnJvbVJvdGF0aW9uVHJhbnNsYXRpb24uanMiLCJub2RlX21vZHVsZXMvZ2wtbWF0NC9mcnVzdHVtLmpzIiwibm9kZV9tb2R1bGVzL2dsLW1hdDQvaWRlbnRpdHkuanMiLCJub2RlX21vZHVsZXMvZ2wtbWF0NC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9nbC1tYXQ0L2ludmVydC5qcyIsIm5vZGVfbW9kdWxlcy9nbC1tYXQ0L2xvb2tBdC5qcyIsIm5vZGVfbW9kdWxlcy9nbC1tYXQ0L211bHRpcGx5LmpzIiwibm9kZV9tb2R1bGVzL2dsLW1hdDQvb3J0aG8uanMiLCJub2RlX21vZHVsZXMvZ2wtbWF0NC9wZXJzcGVjdGl2ZS5qcyIsIm5vZGVfbW9kdWxlcy9nbC1tYXQ0L3BlcnNwZWN0aXZlRnJvbUZpZWxkT2ZWaWV3LmpzIiwibm9kZV9tb2R1bGVzL2dsLW1hdDQvcm90YXRlLmpzIiwibm9kZV9tb2R1bGVzL2dsLW1hdDQvcm90YXRlWC5qcyIsIm5vZGVfbW9kdWxlcy9nbC1tYXQ0L3JvdGF0ZVkuanMiLCJub2RlX21vZHVsZXMvZ2wtbWF0NC9yb3RhdGVaLmpzIiwibm9kZV9tb2R1bGVzL2dsLW1hdDQvc2NhbGUuanMiLCJub2RlX21vZHVsZXMvZ2wtbWF0NC9zdHIuanMiLCJub2RlX21vZHVsZXMvZ2wtbWF0NC90cmFuc2xhdGUuanMiLCJub2RlX21vZHVsZXMvZ2wtbWF0NC90cmFuc3Bvc2UuanMiLCJub2RlX21vZHVsZXMvcmVzbC9pbmRleC5qcyIsInJlZ2wuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTs7Ozs7OztBQU9BLElBQU0sT0FBTyxRQUFRLFNBQVIsR0FBYjtBQUNBLElBQU0sT0FBTyxRQUFRLFNBQVIsQ0FBYjs7QUFFQSxJQUFJLGVBQWUsQ0FDakIsQ0FBQyxDQUFDLEdBQUYsRUFBTyxDQUFDLEdBQVIsRUFBYSxDQUFDLEdBQWQsQ0FE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SjtBQVFMLFlBQVEsTUFSSDtBQVNMLGVBQVc7QUFUTixHQUFQO0FBV0QsQ0FqR0Q7OztBQ3BHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDemFBLElBQUksU0FBUyxRQUFRLG1CQUFSLENBQWI7QUFDQSxJQUFJLFVBQVUsUUFBUSxlQUFSLENBQWQ7QUFDQSxJQUFJLE1BQU0sUUFBUSxnQkFBUixDQUFWO0FBQ0EsSUFBSSxRQUFRLFFBQVEsa0JBQVIsQ0FBWjtBQUNBLElBQUksb0JBQW9CLFFBQVEsZUFBUixDQUF4QjtBQUNBLElBQUksWUFB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LGlCQUFpQixVQXZCQTs7QUF5QmxDO0FBQ0EsZ0JBQVksWUExQnNCOztBQTRCbEM7QUFDQSxXQUFPLEtBN0IyQjtBQThCbEMsUUFBSSxXQTlCOEI7O0FBZ0NsQztBQUNBLFlBQVEsTUFqQzBCO0FBa0NsQyxrQkFBYyxVQUFVLElBQVYsRUFBZ0I7QUFDNUIsYUFBTyxPQUFPLFVBQVAsQ0FBa0IsT0FBbEIsQ0FBMEIsS0FBSyxXQUFMLEVBQTFCLEtBQWlELENBQXhEO0FBQ0QsS0FwQ2lDOztBQXNDbEM7QUFDQSxVQUFNLFVBdkM0Qjs7QUF5Q2xDO0FBQ0EsYUFBUyxPQTFDeUI7O0FBNENsQztBQUNBLFNBQUssRUE3QzZCO0FBOENsQyxjQUFVLE9BOUN3Qjs7QUFnRGxDLFVBQU0sWUFBWTtBQUNoQjtBQUNBLFVBQUksS0FBSixFQUFXO0FBQ1QsY0FBTSxNQUFOO0FBQ0Q7QUFDRixLQXJEaUM7O0FBdURsQztBQUNBLFNBQUssR0F4RDZCOztBQTBEbEM7QUFDQSxXQUFPO0FBM0QyQixHQUF6QixDQUFYOztBQThEQSxTQUFPLE1BQVAsQ0FBYyxJQUFkLEVBQW9CLElBQXBCOztBQUVBLFNBQU8sSUFBUDtBQUNELENBbGhCRCIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKlxuICB0YWdzOiBiYXNpY1xuXG4gIDxwPlRoaXMgZXhhbXBsZXMgcmVuZGVycyBhIHNwaW5uaW5nIHRleHR1cmVkIGN1YmUuPC9wPlxuXG4gKi9cblxuY29uc3QgcmVnbCA9IHJlcXVpcmUoJy4uL3JlZ2wnKSgpXG5jb25zdCBtYXQ0ID0gcmVxdWlyZSgnZ2wtbWF0NCcpXG5cbnZhciBjdWJlUG9zaXRpb24gPSBbXG4gIFstMC41LCArMC41LCArMC41XSwgWyswLjUsICswLjUsICswLjVdLCBbKzAuNSwgLTAuNSwgKzAuNV0sIFstMC41LCAtMC41LCArMC41XSwgLy8gcG9zaXRpdmUgeiBmYWNlLlxuICBbKzAuNSwgKzAuNSwgKzAuNV0sIFsrMC41LCArMC41LCAtMC41XSwgWyswLjUsIC0wLjUsIC0wLjVdLCBbKzAuNSwgLTAuNSwgKzAuNV0sIC8vIHBvc2l0aXZlIHggZmFjZVxuICBbKzAuNSwgKzAuNSwgLTAuNV0sIFstMC41LCArMC41LCAtMC41XSwgWy0wLjUsIC0wLjUsIC0wLjVdLCBbKzAuNSwgLTAuNSwgLTAuNV0sIC8vIG5lZ2F0aXZlIHogZmFjZVxuICBbLTAuNSwgKzAuNSwgLTAuNV0sIFstMC41LCArMC41LCArMC41XSwgWy0wLjUsIC0wLjUsICswLjVdLCBbLTAuNSwgLTAuNSwgLTAuNV0sIC8vIG5lZ2F0aXZlIHggZmFjZS5cbiAgWy0wLjUsICswLjUsIC0wLjVdLCBbKzAuNSwgKzAuNSwgLTAuNV0sIFsrMC41LCArMC41LCArMC41XSwgWy0wLjUsICswLjUsICswLjVdLCAvLyB0b3AgZmFjZVxuICBbLTAuNSwgLTAuNSwgLTAuNV0sIFsrMC41LCAtMC41LCAtMC41XSwgWyswLjUsIC0wLjUsICswLjVdLCBbLTAuNSwgLTAuNSwgKzAuNV0gIC8vIGJvdHRvbSBmYWNlXG5dXG5cbnZhciBjdWJlVXYgPSBbXG4gIFswLjAsIDAuMF0sIFsxLjAsIDAuMF0sIFsxLjAsIDEuMF0sIFswLjAsIDEuMF0sIC8vIHBvc2l0aXZlIHogZmFjZS5cbiAgWzAuMCwgMC4wXSwgWzEuMCwgMC4wXSwgWzEuMCwgMS4wXSwgWzAuMCwgMS4wXSwgLy8gcG9zaXRpdmUgeCBmYWNlLlxuICBbMC4wLCAwLjBdLCBbMS4wLCAwLjBdLCBbMS4wLCAxLjBdLCBbMC4wLCAxLjBdLCAvLyBuZWdhdGl2ZSB6IGZhY2UuXG4gIFswLjAsIDAuMF0sIFsxLjAsIDAuMF0sIFsxLjAsIDEuMF0sIFswLjAsIDEuMF0sIC8vIG5lZ2F0aXZlIHggZmFjZS5cbiAgWzAuMCwgMC4wXSwgWzEuMCwgMC4wXSwgWzEuMCwgMS4wXSwgWzAuMCwgMS4wXSwgLy8gdG9wIGZhY2VcbiAgWzAuMCwgMC4wXSwgWzEuMCwgMC4wXSwgWzEuMCwgMS4wXSwgWzAuMCwgMS4wXSAgLy8gYm90dG9tIGZhY2Vcbl1cblxuY29uc3QgY3ViZUVsZW1lbnRzID0gW1xuICBbMiwgMSwgMF0sIFsyLCAwLCAzXSwgICAgICAgLy8gcG9zaXRpdmUgeiBmYWNlLlxuICBbNiwgNSwgNF0sIFs2LCA0LCA3XSwgICAgICAgLy8gcG9zaXRpdmUgeCBmYWNlLlxuICBbMTAsIDksIDhdLCBbMTAsIDgsIDExXSwgICAgLy8gbmVnYXRpdmUgeiBmYWNlLlxuICBbMTQsIDEzLCAxMl0sIFsxNCwgMTIsIDE1XSwgLy8gbmVnYXRpdmUgeCBmYWNlLlxuICBbMTgsIDE3LCAxNl0sIFsxOCwgMTYsIDE5XSwgLy8gdG9wIGZhY2UuXG4gIFsyMCwgMjEsIDIyXSwgWzIzLCAyMCwgMjJdICAvLyBib3R0b20gZmFjZVxuXVxuXG5jb25zdCBkcmF3Q3ViZSA9IHJlZ2woe1xuICBmcmFnOiBgXG4gIHByZWNpc2lvbiBtZWRpdW1wIGZsb2F0O1xuICB2YXJ5aW5nIHZlYzIgdlV2O1xuICB1bmlmb3JtIHNhbXBsZXIyRCB0ZXg7XG4gIHZvaWQgbWFpbiAoKSB7XG4gICAgZ2xfRnJhZ0NvbG9yID0gdGV4dHVyZTJEKHRleCx2VXYpO1xuICB9YCxcbiAgdmVydDogYFxuICBwcmVjaXNpb24gbWVkaXVtcCBmbG9hdDtcbiAgYXR0cmlidXRlIHZlYzMgcG9zaXRpb247XG4gIGF0dHJpYnV0ZSB2ZWMyIHV2O1xuICB2YXJ5aW5nIHZlYzIgdlV2O1xuICB1bmlmb3JtIG1hdDQgcHJvamVjdGlvbiwgdmlldztcbiAgdm9pZCBtYWluKCkge1xuICAgIHZVdiA9IHV2O1xuICAgIGdsX1Bvc2l0aW9uID0gcHJvamVjdGlvbiAqIHZpZXcgKiB2ZWM0KHBvc2l0aW9uLCAxKTtcbiAgfWAsXG4gIGF0dHJpYnV0ZXM6IHtcbiAgICBwb3NpdGlvbjogY3ViZVBvc2l0aW9uLFxuICAgIHV2OiBjdWJlVXZcbiAgfSxcbiAgZWxlbWVudHM6IGN1YmVFbGVtZW50cyxcbiAgdW5pZm9ybXM6IHtcbiAgICB2aWV3OiAoe3RpY2t9KSA9PiB7XG4gICAgICBjb25zdCB0ID0gMC4wMSAqIHRpY2tcbiAgICAgIHJldHVybiBtYXQ0Lmxvb2tBdChbXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICBbNSAqIE1hdGguY29zKHQpLCAyLjUgKiBNYXRoLnNpbih0KSwgNSAqIE1hdGguc2luKHQpXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICBbMCwgMC4wLCAwXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICBbMCwgMSwgMF0pXG4gICAgfSxcbiAgICBwcm9qZWN0aW9uOiAoe3ZpZXdwb3J0V2lkdGgsIHZpZXdwb3J0SGVpZ2h0fSkgPT5cbiAgICAgIG1hdDQucGVyc3BlY3RpdmUoW10sXG4gICAgICAgICAgICAgICAgICAgICAgIE1hdGguUEkgLyA0LFxuICAgICAgICAgICAgICAgICAgICAgICB2aWV3cG9ydFdpZHRoIC8gdmlld3BvcnRIZWlnaHQsXG4gICAgICAgICAgICAgICAgICAgICAgIDAuMDEsXG4gICAgICAgICAgICAgICAgICAgICAgIDEwKSxcbiAgICB0ZXg6IHJlZ2wucHJvcCgndGV4dHVyZScpXG4gIH1cbn0pXG5cbnJlcXVpcmUoJ3Jlc2wnKSh7XG4gIG1hbmlmZXN0OiB7XG4gICAgdGV4dHVyZToge1xuICAgICAgdHlwZTogJ2ltYWdlJyxcbiAgICAgIHNyYzogJ2Fzc2V0cy9wZXBwZXJzLnBuZycsXG4gICAgICBwYXJzZXI6IChkYXRhKSA9PiByZWdsLnRleHR1cmUoe1xuICAgICAgICBkYXRhOiBkYXRhLFxuICAgICAgICBtYWc6ICdsaW5lYXInLFxuICAgICAgICBtaW46ICdsaW5lYXInXG4gICAgICB9KVxuICAgIH1cbiAgfSxcbiAgb25Eb25lOiAoe3RleHR1cmV9KSA9PiB7XG4gICAgcmVnbC5mcmFtZSgoKSA9PiB7XG4gICAgICByZWdsLmNsZWFyKHtcbiAgICAgICAgY29sb3I6IFswLCAwLCAwLCAyNTVdLFxuICAgICAgICBkZXB0aDogMVxuICAgICAgfSlcbiAgICAgIGRyYXdDdWJlKHt0ZXh0dXJlfSlcbiAgICB9KVxuICB9XG59KVxuIiwidmFyIEdMX0ZMT0FUID0gNTEyNlxuXG5mdW5jdGlvbiBBdHRyaWJ1dGVSZWNvcmQgKCkge1xuICB0aGlzLnN0YXRlID0gMFxuXG4gIHRoaXMueCA9IDAuMFxuICB0aGlzLnkgPSAwLjBcbiAgdGhpcy56ID0gMC4wXG4gIHRoaXMudyA9IDAuMFxuXG4gIHRoaXMuYnVmZmVyID0gbnVsbFxuICB0aGlzLnNpemUgPSAwXG4gIHRoaXMubm9ybWFsaXplZCA9IGZhbHNlXG4gIHRoaXMudHlwZSA9IEdMX0ZMT0FUXG4gIHRoaXMub2Zmc2V0ID0gMFxuICB0aGlzLnN0cmlkZSA9IDBcbiAgdGhpcy5kaXZpc29yID0gMFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBBdHRyaWJ1dGVTdGF0ZSAoXG4gIGdsLFxuICBleHRlbnNpb25zLFxuICBsaW1pdHMsXG4gIGJ1ZmZlclN0YXRlLFxuICBzdHJpbmdTdG9yZSkge1xuICB2YXIgTlVNX0FUVFJJQlVURVMgPSBsaW1pdHMubWF4QXR0cmlidXRlc1xuICB2YXIgYXR0cmlidXRlQmluZGluZ3MgPSBuZXcgQXJyYXkoTlVNX0FUVFJJQlVURVMpXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgTlVNX0FUVFJJQlVURVM7ICsraSkge1xuICAgIGF0dHJpYnV0ZUJpbmRpbmdzW2ldID0gbmV3IEF0dHJpYnV0ZVJlY29yZCgpXG4gIH1cblxuICByZXR1cm4ge1xuICAgIFJlY29yZDogQXR0cmlidXRlUmVjb3JkLFxuICAgIHNjb3BlOiB7fSxcbiAgICBzdGF0ZTogYXR0cmlidXRlQmluZGluZ3NcbiAgfVxufVxuIiwiXG52YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi91dGlsL2lzLXR5cGVkLWFycmF5JylcbnZhciBpc05EQXJyYXlMaWtlID0gcmVxdWlyZSgnLi91dGlsL2lzLW5kYXJyYXknKVxudmFyIHZhbHVlcyA9IHJlcXVpcmUoJy4vdXRpbC92YWx1ZXMnKVxudmFyIHBvb2wgPSByZXF1aXJlKCcuL3V0aWwvcG9vbCcpXG52YXIgZmxhdHRlblV0aWwgPSByZXF1aXJlKCcuL3V0aWwvZmxhdHRlbicpXG5cbnZhciBhcnJheUZsYXR0ZW4gPSBmbGF0dGVuVXRpbC5mbGF0dGVuXG52YXIgYXJyYXlTaGFwZSA9IGZsYXR0ZW5VdGlsLnNoYXBlXG5cbnZhciBhcnJheVR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvYXJyYXl0eXBlcy5qc29uJylcbnZhciBidWZmZXJUeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL2R0eXBlcy5qc29uJylcbnZhciB1c2FnZVR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvdXNhZ2UuanNvbicpXG5cbnZhciBHTF9TVEFUSUNfRFJBVyA9IDB4ODhFNFxudmFyIEdMX1NUUkVBTV9EUkFXID0gMHg4OEUwXG5cbnZhciBHTF9VTlNJR05FRF9CWVRFID0gNTEyMVxudmFyIEdMX0ZMT0FUID0gNTEyNlxuXG52YXIgRFRZUEVTX1NJWkVTID0gW11cbkRUWVBFU19TSVpFU1s1MTIwXSA9IDEgLy8gaW50OFxuRFRZUEVTX1NJWkVTWzUxMjJdID0gMiAvLyBpbnQxNlxuRFRZUEVTX1NJWkVTWzUxMjRdID0gNCAvLyBpbnQzMlxuRFRZUEVTX1NJWkVTWzUxMjFdID0gMSAvLyB1aW50OFxuRFRZUEVTX1NJWkVTWzUxMjNdID0gMiAvLyB1aW50MTZcbkRUWVBFU19TSVpFU1s1MTI1XSA9IDQgLy8gdWludDMyXG5EVFlQRVNfU0laRVNbNTEyNl0gPSA0IC8vIGZsb2F0MzJcblxuZnVuY3Rpb24gdHlwZWRBcnJheUNvZGUgKGRhdGEpIHtcbiAgcmV0dXJuIGFycmF5VHlwZXNbT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGRhdGEpXSB8IDBcbn1cblxuZnVuY3Rpb24gY29weUFycmF5IChvdXQsIGlucCkge1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGlucC5sZW5ndGg7ICsraSkge1xuICAgIG91dFtpXSA9IGlucFtpXVxuICB9XG59XG5cbmZ1bmN0aW9uIHRyYW5zcG9zZSAoXG4gIHJlc3VsdCwgZGF0YSwgc2hhcGVYLCBzaGFwZVksIHN0cmlkZVgsIHN0cmlkZVksIG9mZnNldCkge1xuICB2YXIgcHRyID0gMFxuICBmb3IgKHZhciBpID0gMDsgaSA8IHNoYXBlWDsgKytpKSB7XG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBzaGFwZVk7ICsraikge1xuICAgICAgcmVzdWx0W3B0cisrXSA9IGRhdGFbc3RyaWRlWCAqIGkgKyBzdHJpZGVZICogaiArIG9mZnNldF1cbiAgICB9XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwQnVmZmVyU3RhdGUgKGdsLCBzdGF0cywgY29uZmlnKSB7XG4gIHZhciBidWZmZXJDb3VudCA9IDBcbiAgdmFyIGJ1ZmZlclNldCA9IHt9XG5cbiAgZnVuY3Rpb24gUkVHTEJ1ZmZlciAodHlwZSkge1xuICAgIHRoaXMuaWQgPSBidWZmZXJDb3VudCsrXG4gICAgdGhpcy5idWZmZXIgPSBnbC5jcmVhdGVCdWZmZXIoKVxuICAgIHRoaXMudHlwZSA9IHR5cGVcbiAgICB0aGlzLnVzYWdlID0gR0xfU1RBVElDX0RSQVdcbiAgICB0aGlzLmJ5dGVMZW5ndGggPSAwXG4gICAgdGhpcy5kaW1lbnNpb24gPSAxXG4gICAgdGhpcy5kdHlwZSA9IEdMX1VOU0lHTkVEX0JZVEVcblxuICAgIHRoaXMucGVyc2lzdGVudERhdGEgPSBudWxsXG5cbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgIHRoaXMuc3RhdHMgPSB7c2l6ZTogMH1cbiAgICB9XG4gIH1cblxuICBSRUdMQnVmZmVyLnByb3RvdHlwZS5iaW5kID0gZnVuY3Rpb24gKCkge1xuICAgIGdsLmJpbmRCdWZmZXIodGhpcy50eXBlLCB0aGlzLmJ1ZmZlcilcbiAgfVxuXG4gIFJFR0xCdWZmZXIucHJvdG90eXBlLmRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7XG4gICAgZGVzdHJveSh0aGlzKVxuICB9XG5cbiAgdmFyIHN0cmVhbVBvb2wgPSBbXVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZVN0cmVhbSAodHlwZSwgZGF0YSkge1xuICAgIHZhciBidWZmZXIgPSBzdHJlYW1Qb29sLnBvcCgpXG4gICAgaWYgKCFidWZmZXIpIHtcbiAgICAgIGJ1ZmZlciA9IG5ldyBSRUdMQnVmZmVyKHR5cGUpXG4gICAgfVxuICAgIGJ1ZmZlci5iaW5kKClcbiAgICBpbml0QnVmZmVyRnJvbURhdGEoYnVmZmVyLCBkYXRhLCBHTF9TVFJFQU1fRFJBVywgMCwgMSwgZmFsc2UpXG4gICAgcmV0dXJuIGJ1ZmZlclxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveVN0cmVhbSAoc3RyZWFtKSB7XG4gICAgc3RyZWFtUG9vbC5wdXNoKHN0cmVhbSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGluaXRCdWZmZXJGcm9tVHlwZWRBcnJheSAoYnVmZmVyLCBkYXRhLCB1c2FnZSkge1xuICAgIGJ1ZmZlci5ieXRlTGVuZ3RoID0gZGF0YS5ieXRlTGVuZ3RoXG4gICAgZ2wuYnVmZmVyRGF0YShidWZmZXIudHlwZSwgZGF0YSwgdXNhZ2UpXG4gIH1cblxuICBmdW5jdGlvbiBpbml0QnVmZmVyRnJvbURhdGEgKGJ1ZmZlciwgZGF0YSwgdXNhZ2UsIGR0eXBlLCBkaW1lbnNpb24sIHBlcnNpc3QpIHtcbiAgICB2YXIgc2hhcGVcbiAgICBidWZmZXIudXNhZ2UgPSB1c2FnZVxuICAgIGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XG4gICAgICBidWZmZXIuZHR5cGUgPSBkdHlwZSB8fCBHTF9GTE9BVFxuICAgICAgaWYgKGRhdGEubGVuZ3RoID4gMCkge1xuICAgICAgICB2YXIgZmxhdERhdGFcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YVswXSkpIHtcbiAgICAgICAgICBzaGFwZSA9IGFycmF5U2hhcGUoZGF0YSlcbiAgICAgICAgICB2YXIgZGltID0gMVxuICAgICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgc2hhcGUubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICAgIGRpbSAqPSBzaGFwZVtpXVxuICAgICAgICAgIH1cbiAgICAgICAgICBidWZmZXIuZGltZW5zaW9uID0gZGltXG4gICAgICAgICAgZmxhdERhdGEgPSBhcnJheUZsYXR0ZW4oZGF0YSwgc2hhcGUsIGJ1ZmZlci5kdHlwZSlcbiAgICAgICAgICBpbml0QnVmZmVyRnJvbVR5cGVkQXJyYXkoYnVmZmVyLCBmbGF0RGF0YSwgdXNhZ2UpXG4gICAgICAgICAgaWYgKHBlcnNpc3QpIHtcbiAgICAgICAgICAgIGJ1ZmZlci5wZXJzaXN0ZW50RGF0YSA9IGZsYXREYXRhXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBvb2wuZnJlZVR5cGUoZmxhdERhdGEpXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBkYXRhWzBdID09PSAnbnVtYmVyJykge1xuICAgICAgICAgIGJ1ZmZlci5kaW1lbnNpb24gPSBkaW1lbnNpb25cbiAgICAgICAgICB2YXIgdHlwZWREYXRhID0gcG9vbC5hbGxvY1R5cGUoYnVmZmVyLmR0eXBlLCBkYXRhLmxlbmd0aClcbiAgICAgICAgICBjb3B5QXJyYXkodHlwZWREYXRhLCBkYXRhKVxuICAgICAgICAgIGluaXRCdWZmZXJGcm9tVHlwZWRBcnJheShidWZmZXIsIHR5cGVkRGF0YSwgdXNhZ2UpXG4gICAgICAgICAgaWYgKHBlcnNpc3QpIHtcbiAgICAgICAgICAgIGJ1ZmZlci5wZXJzaXN0ZW50RGF0YSA9IHR5cGVkRGF0YVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwb29sLmZyZWVUeXBlKHR5cGVkRGF0YSlcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoaXNUeXBlZEFycmF5KGRhdGFbMF0pKSB7XG4gICAgICAgICAgYnVmZmVyLmRpbWVuc2lvbiA9IGRhdGFbMF0ubGVuZ3RoXG4gICAgICAgICAgYnVmZmVyLmR0eXBlID0gZHR5cGUgfHwgdHlwZWRBcnJheUNvZGUoZGF0YVswXSkgfHwgR0xfRkxPQVRcbiAgICAgICAgICBmbGF0RGF0YSA9IGFycmF5RmxhdHRlbihcbiAgICAgICAgICAgIGRhdGEsXG4gICAgICAgICAgICBbZGF0YS5sZW5ndGgsIGRhdGFbMF0ubGVuZ3RoXSxcbiAgICAgICAgICAgIGJ1ZmZlci5kdHlwZSlcbiAgICAgICAgICBpbml0QnVmZmVyRnJvbVR5cGVkQXJyYXkoYnVmZmVyLCBmbGF0RGF0YSwgdXNhZ2UpXG4gICAgICAgICAgaWYgKHBlcnNpc3QpIHtcbiAgICAgICAgICAgIGJ1ZmZlci5wZXJzaXN0ZW50RGF0YSA9IGZsYXREYXRhXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBvb2wuZnJlZVR5cGUoZmxhdERhdGEpXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIFxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChpc1R5cGVkQXJyYXkoZGF0YSkpIHtcbiAgICAgIGJ1ZmZlci5kdHlwZSA9IGR0eXBlIHx8IHR5cGVkQXJyYXlDb2RlKGRhdGEpXG4gICAgICBidWZmZXIuZGltZW5zaW9uID0gZGltZW5zaW9uXG4gICAgICBpbml0QnVmZmVyRnJvbVR5cGVkQXJyYXkoYnVmZmVyLCBkYXRhLCB1c2FnZSlcbiAgICAgIGlmIChwZXJzaXN0KSB7XG4gICAgICAgIGJ1ZmZlci5wZXJzaXN0ZW50RGF0YSA9IG5ldyBVaW50OEFycmF5KG5ldyBVaW50OEFycmF5KGRhdGEuYnVmZmVyKSlcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGlzTkRBcnJheUxpa2UoZGF0YSkpIHtcbiAgICAgIHNoYXBlID0gZGF0YS5zaGFwZVxuICAgICAgdmFyIHN0cmlkZSA9IGRhdGEuc3RyaWRlXG4gICAgICB2YXIgb2Zmc2V0ID0gZGF0YS5vZmZzZXRcblxuICAgICAgdmFyIHNoYXBlWCA9IDBcbiAgICAgIHZhciBzaGFwZVkgPSAwXG4gICAgICB2YXIgc3RyaWRlWCA9IDBcbiAgICAgIHZhciBzdHJpZGVZID0gMFxuICAgICAgaWYgKHNoYXBlLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICBzaGFwZVggPSBzaGFwZVswXVxuICAgICAgICBzaGFwZVkgPSAxXG4gICAgICAgIHN0cmlkZVggPSBzdHJpZGVbMF1cbiAgICAgICAgc3RyaWRlWSA9IDBcbiAgICAgIH0gZWxzZSBpZiAoc2hhcGUubGVuZ3RoID09PSAyKSB7XG4gICAgICAgIHNoYXBlWCA9IHNoYXBlWzBdXG4gICAgICAgIHNoYXBlWSA9IHNoYXBlWzFdXG4gICAgICAgIHN0cmlkZVggPSBzdHJpZGVbMF1cbiAgICAgICAgc3RyaWRlWSA9IHN0cmlkZVsxXVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgXG4gICAgICB9XG5cbiAgICAgIGJ1ZmZlci5kdHlwZSA9IGR0eXBlIHx8IHR5cGVkQXJyYXlDb2RlKGRhdGEuZGF0YSkgfHwgR0xfRkxPQVRcbiAgICAgIGJ1ZmZlci5kaW1lbnNpb24gPSBzaGFwZVlcblxuICAgICAgdmFyIHRyYW5zcG9zZURhdGEgPSBwb29sLmFsbG9jVHlwZShidWZmZXIuZHR5cGUsIHNoYXBlWCAqIHNoYXBlWSlcbiAgICAgIHRyYW5zcG9zZSh0cmFuc3Bvc2VEYXRhLFxuICAgICAgICBkYXRhLmRhdGEsXG4gICAgICAgIHNoYXBlWCwgc2hhcGVZLFxuICAgICAgICBzdHJpZGVYLCBzdHJpZGVZLFxuICAgICAgICBvZmZzZXQpXG4gICAgICBpbml0QnVmZmVyRnJvbVR5cGVkQXJyYXkoYnVmZmVyLCB0cmFuc3Bvc2VEYXRhLCB1c2FnZSlcbiAgICAgIGlmIChwZXJzaXN0KSB7XG4gICAgICAgIGJ1ZmZlci5wZXJzaXN0ZW50RGF0YSA9IHRyYW5zcG9zZURhdGFcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBvb2wuZnJlZVR5cGUodHJhbnNwb3NlRGF0YSlcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSAoYnVmZmVyKSB7XG4gICAgc3RhdHMuYnVmZmVyQ291bnQtLVxuXG4gICAgdmFyIGhhbmRsZSA9IGJ1ZmZlci5idWZmZXJcbiAgICBcbiAgICBnbC5kZWxldGVCdWZmZXIoaGFuZGxlKVxuICAgIGJ1ZmZlci5idWZmZXIgPSBudWxsXG4gICAgZGVsZXRlIGJ1ZmZlclNldFtidWZmZXIuaWRdXG4gIH1cblxuICBmdW5jdGlvbiBjcmVhdGVCdWZmZXIgKG9wdGlvbnMsIHR5cGUsIGRlZmVySW5pdCwgcGVyc2lzdGVudCkge1xuICAgIHN0YXRzLmJ1ZmZlckNvdW50KytcblxuICAgIHZhciBidWZmZXIgPSBuZXcgUkVHTEJ1ZmZlcih0eXBlKVxuICAgIGJ1ZmZlclNldFtidWZmZXIuaWRdID0gYnVmZmVyXG5cbiAgICBmdW5jdGlvbiByZWdsQnVmZmVyIChvcHRpb25zKSB7XG4gICAgICB2YXIgdXNhZ2UgPSBHTF9TVEFUSUNfRFJBV1xuICAgICAgdmFyIGRhdGEgPSBudWxsXG4gICAgICB2YXIgYnl0ZUxlbmd0aCA9IDBcbiAgICAgIHZhciBkdHlwZSA9IDBcbiAgICAgIHZhciBkaW1lbnNpb24gPSAxXG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShvcHRpb25zKSB8fFxuICAgICAgICAgIGlzVHlwZWRBcnJheShvcHRpb25zKSB8fFxuICAgICAgICAgIGlzTkRBcnJheUxpa2Uob3B0aW9ucykpIHtcbiAgICAgICAgZGF0YSA9IG9wdGlvbnNcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIG9wdGlvbnMgPT09ICdudW1iZXInKSB7XG4gICAgICAgIGJ5dGVMZW5ndGggPSBvcHRpb25zIHwgMFxuICAgICAgfSBlbHNlIGlmIChvcHRpb25zKSB7XG4gICAgICAgIFxuXG4gICAgICAgIGlmICgnZGF0YScgaW4gb3B0aW9ucykge1xuICAgICAgICAgIFxuICAgICAgICAgIGRhdGEgPSBvcHRpb25zLmRhdGFcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgndXNhZ2UnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBcbiAgICAgICAgICB1c2FnZSA9IHVzYWdlVHlwZXNbb3B0aW9ucy51c2FnZV1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgndHlwZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgIFxuICAgICAgICAgIGR0eXBlID0gYnVmZmVyVHlwZXNbb3B0aW9ucy50eXBlXVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdkaW1lbnNpb24nIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBcbiAgICAgICAgICBkaW1lbnNpb24gPSBvcHRpb25zLmRpbWVuc2lvbiB8IDBcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnbGVuZ3RoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgXG4gICAgICAgICAgYnl0ZUxlbmd0aCA9IG9wdGlvbnMubGVuZ3RoIHwgMFxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGJ1ZmZlci5iaW5kKClcbiAgICAgIGlmICghZGF0YSkge1xuICAgICAgICBnbC5idWZmZXJEYXRhKGJ1ZmZlci50eXBlLCBieXRlTGVuZ3RoLCB1c2FnZSlcbiAgICAgICAgYnVmZmVyLmR0eXBlID0gZHR5cGUgfHwgR0xfVU5TSUdORURfQllURVxuICAgICAgICBidWZmZXIudXNhZ2UgPSB1c2FnZVxuICAgICAgICBidWZmZXIuZGltZW5zaW9uID0gZGltZW5zaW9uXG4gICAgICAgIGJ1ZmZlci5ieXRlTGVuZ3RoID0gYnl0ZUxlbmd0aFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaW5pdEJ1ZmZlckZyb21EYXRhKGJ1ZmZlciwgZGF0YSwgdXNhZ2UsIGR0eXBlLCBkaW1lbnNpb24sIHBlcnNpc3RlbnQpXG4gICAgICB9XG5cbiAgICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgICBidWZmZXIuc3RhdHMuc2l6ZSA9IGJ1ZmZlci5ieXRlTGVuZ3RoICogRFRZUEVTX1NJWkVTW2J1ZmZlci5kdHlwZV1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJlZ2xCdWZmZXJcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzZXRTdWJEYXRhIChkYXRhLCBvZmZzZXQpIHtcbiAgICAgIFxuXG4gICAgICBnbC5idWZmZXJTdWJEYXRhKGJ1ZmZlci50eXBlLCBvZmZzZXQsIGRhdGEpXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc3ViZGF0YSAoZGF0YSwgb2Zmc2V0Xykge1xuICAgICAgdmFyIG9mZnNldCA9IChvZmZzZXRfIHx8IDApIHwgMFxuICAgICAgdmFyIHNoYXBlXG4gICAgICBidWZmZXIuYmluZCgpXG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShkYXRhKSkge1xuICAgICAgICBpZiAoZGF0YS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiBkYXRhWzBdID09PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgdmFyIGNvbnZlcnRlZCA9IHBvb2wuYWxsb2NUeXBlKGJ1ZmZlci5kdHlwZSwgZGF0YS5sZW5ndGgpXG4gICAgICAgICAgICBjb3B5QXJyYXkoY29udmVydGVkLCBkYXRhKVxuICAgICAgICAgICAgc2V0U3ViRGF0YShjb252ZXJ0ZWQsIG9mZnNldClcbiAgICAgICAgICAgIHBvb2wuZnJlZVR5cGUoY29udmVydGVkKVxuICAgICAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShkYXRhWzBdKSB8fCBpc1R5cGVkQXJyYXkoZGF0YVswXSkpIHtcbiAgICAgICAgICAgIHNoYXBlID0gYXJyYXlTaGFwZShkYXRhKVxuICAgICAgICAgICAgdmFyIGZsYXREYXRhID0gYXJyYXlGbGF0dGVuKGRhdGEsIHNoYXBlLCBidWZmZXIuZHR5cGUpXG4gICAgICAgICAgICBzZXRTdWJEYXRhKGZsYXREYXRhLCBvZmZzZXQpXG4gICAgICAgICAgICBwb29sLmZyZWVUeXBlKGZsYXREYXRhKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoaXNUeXBlZEFycmF5KGRhdGEpKSB7XG4gICAgICAgIHNldFN1YkRhdGEoZGF0YSwgb2Zmc2V0KVxuICAgICAgfSBlbHNlIGlmIChpc05EQXJyYXlMaWtlKGRhdGEpKSB7XG4gICAgICAgIHNoYXBlID0gZGF0YS5zaGFwZVxuICAgICAgICB2YXIgc3RyaWRlID0gZGF0YS5zdHJpZGVcblxuICAgICAgICB2YXIgc2hhcGVYID0gMFxuICAgICAgICB2YXIgc2hhcGVZID0gMFxuICAgICAgICB2YXIgc3RyaWRlWCA9IDBcbiAgICAgICAgdmFyIHN0cmlkZVkgPSAwXG4gICAgICAgIGlmIChzaGFwZS5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICBzaGFwZVggPSBzaGFwZVswXVxuICAgICAgICAgIHNoYXBlWSA9IDFcbiAgICAgICAgICBzdHJpZGVYID0gc3RyaWRlWzBdXG4gICAgICAgICAgc3RyaWRlWSA9IDBcbiAgICAgICAgfSBlbHNlIGlmIChzaGFwZS5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgICBzaGFwZVggPSBzaGFwZVswXVxuICAgICAgICAgIHNoYXBlWSA9IHNoYXBlWzFdXG4gICAgICAgICAgc3RyaWRlWCA9IHN0cmlkZVswXVxuICAgICAgICAgIHN0cmlkZVkgPSBzdHJpZGVbMV1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBcbiAgICAgICAgfVxuICAgICAgICB2YXIgZHR5cGUgPSBBcnJheS5pc0FycmF5KGRhdGEuZGF0YSlcbiAgICAgICAgICA/IGJ1ZmZlci5kdHlwZVxuICAgICAgICAgIDogdHlwZWRBcnJheUNvZGUoZGF0YS5kYXRhKVxuXG4gICAgICAgIHZhciB0cmFuc3Bvc2VEYXRhID0gcG9vbC5hbGxvY1R5cGUoZHR5cGUsIHNoYXBlWCAqIHNoYXBlWSlcbiAgICAgICAgdHJhbnNwb3NlKHRyYW5zcG9zZURhdGEsXG4gICAgICAgICAgZGF0YS5kYXRhLFxuICAgICAgICAgIHNoYXBlWCwgc2hhcGVZLFxuICAgICAgICAgIHN0cmlkZVgsIHN0cmlkZVksXG4gICAgICAgICAgZGF0YS5vZmZzZXQpXG4gICAgICAgIHNldFN1YkRhdGEodHJhbnNwb3NlRGF0YSwgb2Zmc2V0KVxuICAgICAgICBwb29sLmZyZWVUeXBlKHRyYW5zcG9zZURhdGEpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBcbiAgICAgIH1cbiAgICAgIHJldHVybiByZWdsQnVmZmVyXG4gICAgfVxuXG4gICAgaWYgKCFkZWZlckluaXQpIHtcbiAgICAgIHJlZ2xCdWZmZXIob3B0aW9ucylcbiAgICB9XG5cbiAgICByZWdsQnVmZmVyLl9yZWdsVHlwZSA9ICdidWZmZXInXG4gICAgcmVnbEJ1ZmZlci5fYnVmZmVyID0gYnVmZmVyXG4gICAgcmVnbEJ1ZmZlci5zdWJkYXRhID0gc3ViZGF0YVxuICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgcmVnbEJ1ZmZlci5zdGF0cyA9IGJ1ZmZlci5zdGF0c1xuICAgIH1cbiAgICByZWdsQnVmZmVyLmRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7IGRlc3Ryb3koYnVmZmVyKSB9XG5cbiAgICByZXR1cm4gcmVnbEJ1ZmZlclxuICB9XG5cbiAgZnVuY3Rpb24gcmVzdG9yZUJ1ZmZlcnMgKCkge1xuICAgIHZhbHVlcyhidWZmZXJTZXQpLmZvckVhY2goZnVuY3Rpb24gKGJ1ZmZlcikge1xuICAgICAgYnVmZmVyLmJ1ZmZlciA9IGdsLmNyZWF0ZUJ1ZmZlcigpXG4gICAgICBnbC5iaW5kQnVmZmVyKGJ1ZmZlci50eXBlLCBidWZmZXIuYnVmZmVyKVxuICAgICAgZ2wuYnVmZmVyRGF0YShcbiAgICAgICAgYnVmZmVyLnR5cGUsIGJ1ZmZlci5wZXJzaXN0ZW50RGF0YSB8fCBidWZmZXIuYnl0ZUxlbmd0aCwgYnVmZmVyLnVzYWdlKVxuICAgIH0pXG4gIH1cblxuICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICBzdGF0cy5nZXRUb3RhbEJ1ZmZlclNpemUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgdG90YWwgPSAwXG4gICAgICAvLyBUT0RPOiBSaWdodCBub3csIHRoZSBzdHJlYW1zIGFyZSBub3QgcGFydCBvZiB0aGUgdG90YWwgY291bnQuXG4gICAgICBPYmplY3Qua2V5cyhidWZmZXJTZXQpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgICB0b3RhbCArPSBidWZmZXJTZXRba2V5XS5zdGF0cy5zaXplXG4gICAgICB9KVxuICAgICAgcmV0dXJuIHRvdGFsXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjcmVhdGU6IGNyZWF0ZUJ1ZmZlcixcblxuICAgIGNyZWF0ZVN0cmVhbTogY3JlYXRlU3RyZWFtLFxuICAgIGRlc3Ryb3lTdHJlYW06IGRlc3Ryb3lTdHJlYW0sXG5cbiAgICBjbGVhcjogZnVuY3Rpb24gKCkge1xuICAgICAgdmFsdWVzKGJ1ZmZlclNldCkuZm9yRWFjaChkZXN0cm95KVxuICAgICAgc3RyZWFtUG9vbC5mb3JFYWNoKGRlc3Ryb3kpXG4gICAgfSxcblxuICAgIGdldEJ1ZmZlcjogZnVuY3Rpb24gKHdyYXBwZXIpIHtcbiAgICAgIGlmICh3cmFwcGVyICYmIHdyYXBwZXIuX2J1ZmZlciBpbnN0YW5jZW9mIFJFR0xCdWZmZXIpIHtcbiAgICAgICAgcmV0dXJuIHdyYXBwZXIuX2J1ZmZlclxuICAgICAgfVxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9LFxuXG4gICAgcmVzdG9yZTogcmVzdG9yZUJ1ZmZlcnMsXG5cbiAgICBfaW5pdEJ1ZmZlcjogaW5pdEJ1ZmZlckZyb21EYXRhXG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgXCJbb2JqZWN0IEludDhBcnJheV1cIjogNTEyMFxuLCBcIltvYmplY3QgSW50MTZBcnJheV1cIjogNTEyMlxuLCBcIltvYmplY3QgSW50MzJBcnJheV1cIjogNTEyNFxuLCBcIltvYmplY3QgVWludDhBcnJheV1cIjogNTEyMVxuLCBcIltvYmplY3QgVWludDhDbGFtcGVkQXJyYXldXCI6IDUxMjFcbiwgXCJbb2JqZWN0IFVpbnQxNkFycmF5XVwiOiA1MTIzXG4sIFwiW29iamVjdCBVaW50MzJBcnJheV1cIjogNTEyNVxuLCBcIltvYmplY3QgRmxvYXQzMkFycmF5XVwiOiA1MTI2XG4sIFwiW29iamVjdCBGbG9hdDY0QXJyYXldXCI6IDUxMjFcbiwgXCJbb2JqZWN0IEFycmF5QnVmZmVyXVwiOiA1MTIxXG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gIFwiaW50OFwiOiA1MTIwXG4sIFwiaW50MTZcIjogNTEyMlxuLCBcImludDMyXCI6IDUxMjRcbiwgXCJ1aW50OFwiOiA1MTIxXG4sIFwidWludDE2XCI6IDUxMjNcbiwgXCJ1aW50MzJcIjogNTEyNVxuLCBcImZsb2F0XCI6IDUxMjZcbiwgXCJmbG9hdDMyXCI6IDUxMjZcbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgXCJwb2ludHNcIjogMCxcbiAgXCJwb2ludFwiOiAwLFxuICBcImxpbmVzXCI6IDEsXG4gIFwibGluZVwiOiAxLFxuICBcImxpbmUgbG9vcFwiOiAyLFxuICBcImxpbmUgc3RyaXBcIjogMyxcbiAgXCJ0cmlhbmdsZXNcIjogNCxcbiAgXCJ0cmlhbmdsZVwiOiA0LFxuICBcInRyaWFuZ2xlIHN0cmlwXCI6IDUsXG4gIFwidHJpYW5nbGUgZmFuXCI6IDZcbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgXCJzdGF0aWNcIjogMzUwNDQsXG4gIFwiZHluYW1pY1wiOiAzNTA0OCxcbiAgXCJzdHJlYW1cIjogMzUwNDBcbn1cbiIsIlxudmFyIGNyZWF0ZUVudmlyb25tZW50ID0gcmVxdWlyZSgnLi91dGlsL2NvZGVnZW4nKVxudmFyIGxvb3AgPSByZXF1aXJlKCcuL3V0aWwvbG9vcCcpXG52YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi91dGlsL2lzLXR5cGVkLWFycmF5JylcbnZhciBpc05EQXJyYXkgPSByZXF1aXJlKCcuL3V0aWwvaXMtbmRhcnJheScpXG52YXIgaXNBcnJheUxpa2UgPSByZXF1aXJlKCcuL3V0aWwvaXMtYXJyYXktbGlrZScpXG52YXIgZHluYW1pYyA9IHJlcXVpcmUoJy4vZHluYW1pYycpXG5cbnZhciBwcmltVHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9wcmltaXRpdmVzLmpzb24nKVxudmFyIGdsVHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9kdHlwZXMuanNvbicpXG5cbi8vIFwiY3V0ZVwiIG5hbWVzIGZvciB2ZWN0b3IgY29tcG9uZW50c1xudmFyIENVVEVfQ09NUE9ORU5UUyA9ICd4eXp3Jy5zcGxpdCgnJylcblxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSA1MTIxXG5cbnZhciBBVFRSSUJfU1RBVEVfUE9JTlRFUiA9IDFcbnZhciBBVFRSSUJfU1RBVEVfQ09OU1RBTlQgPSAyXG5cbnZhciBEWU5fRlVOQyA9IDBcbnZhciBEWU5fUFJPUCA9IDFcbnZhciBEWU5fQ09OVEVYVCA9IDJcbnZhciBEWU5fU1RBVEUgPSAzXG52YXIgRFlOX1RIVU5LID0gNFxuXG52YXIgU19ESVRIRVIgPSAnZGl0aGVyJ1xudmFyIFNfQkxFTkRfRU5BQkxFID0gJ2JsZW5kLmVuYWJsZSdcbnZhciBTX0JMRU5EX0NPTE9SID0gJ2JsZW5kLmNvbG9yJ1xudmFyIFNfQkxFTkRfRVFVQVRJT04gPSAnYmxlbmQuZXF1YXRpb24nXG52YXIgU19CTEVORF9GVU5DID0gJ2JsZW5kLmZ1bmMnXG52YXIgU19ERVBUSF9FTkFCTEUgPSAnZGVwdGguZW5hYmxlJ1xudmFyIFNfREVQVEhfRlVOQyA9ICdkZXB0aC5mdW5jJ1xudmFyIFNfREVQVEhfUkFOR0UgPSAnZGVwdGgucmFuZ2UnXG52YXIgU19ERVBUSF9NQVNLID0gJ2RlcHRoLm1hc2snXG52YXIgU19DT0xPUl9NQVNLID0gJ2NvbG9yTWFzaydcbnZhciBTX0NVTExfRU5BQkxFID0gJ2N1bGwuZW5hYmxlJ1xudmFyIFNfQ1VMTF9GQUNFID0gJ2N1bGwuZmFjZSdcbnZhciBTX0ZST05UX0ZBQ0UgPSAnZnJvbnRGYWNlJ1xudmFyIFNfTElORV9XSURUSCA9ICdsaW5lV2lkdGgnXG52YXIgU19QT0xZR09OX09GRlNFVF9FTkFCTEUgPSAncG9seWdvbk9mZnNldC5lbmFibGUnXG52YXIgU19QT0xZR09OX09GRlNFVF9PRkZTRVQgPSAncG9seWdvbk9mZnNldC5vZmZzZXQnXG52YXIgU19TQU1QTEVfQUxQSEEgPSAnc2FtcGxlLmFscGhhJ1xudmFyIFNfU0FNUExFX0VOQUJMRSA9ICdzYW1wbGUuZW5hYmxlJ1xudmFyIFNfU0FNUExFX0NPVkVSQUdFID0gJ3NhbXBsZS5jb3ZlcmFnZSdcbnZhciBTX1NURU5DSUxfRU5BQkxFID0gJ3N0ZW5jaWwuZW5hYmxlJ1xudmFyIFNfU1RFTkNJTF9NQVNLID0gJ3N0ZW5jaWwubWFzaydcbnZhciBTX1NURU5DSUxfRlVOQyA9ICdzdGVuY2lsLmZ1bmMnXG52YXIgU19TVEVOQ0lMX09QRlJPTlQgPSAnc3RlbmNpbC5vcEZyb250J1xudmFyIFNfU1RFTkNJTF9PUEJBQ0sgPSAnc3RlbmNpbC5vcEJhY2snXG52YXIgU19TQ0lTU09SX0VOQUJMRSA9ICdzY2lzc29yLmVuYWJsZSdcbnZhciBTX1NDSVNTT1JfQk9YID0gJ3NjaXNzb3IuYm94J1xudmFyIFNfVklFV1BPUlQgPSAndmlld3BvcnQnXG5cbnZhciBTX1BST0ZJTEUgPSAncHJvZmlsZSdcblxudmFyIFNfRlJBTUVCVUZGRVIgPSAnZnJhbWVidWZmZXInXG52YXIgU19WRVJUID0gJ3ZlcnQnXG52YXIgU19GUkFHID0gJ2ZyYWcnXG52YXIgU19FTEVNRU5UUyA9ICdlbGVtZW50cydcbnZhciBTX1BSSU1JVElWRSA9ICdwcmltaXRpdmUnXG52YXIgU19DT1VOVCA9ICdjb3VudCdcbnZhciBTX09GRlNFVCA9ICdvZmZzZXQnXG52YXIgU19JTlNUQU5DRVMgPSAnaW5zdGFuY2VzJ1xuXG52YXIgU1VGRklYX1dJRFRIID0gJ1dpZHRoJ1xudmFyIFNVRkZJWF9IRUlHSFQgPSAnSGVpZ2h0J1xuXG52YXIgU19GUkFNRUJVRkZFUl9XSURUSCA9IFNfRlJBTUVCVUZGRVIgKyBTVUZGSVhfV0lEVEhcbnZhciBTX0ZSQU1FQlVGRkVSX0hFSUdIVCA9IFNfRlJBTUVCVUZGRVIgKyBTVUZGSVhfSEVJR0hUXG52YXIgU19WSUVXUE9SVF9XSURUSCA9IFNfVklFV1BPUlQgKyBTVUZGSVhfV0lEVEhcbnZhciBTX1ZJRVdQT1JUX0hFSUdIVCA9IFNfVklFV1BPUlQgKyBTVUZGSVhfSEVJR0hUXG52YXIgU19EUkFXSU5HQlVGRkVSID0gJ2RyYXdpbmdCdWZmZXInXG52YXIgU19EUkFXSU5HQlVGRkVSX1dJRFRIID0gU19EUkFXSU5HQlVGRkVSICsgU1VGRklYX1dJRFRIXG52YXIgU19EUkFXSU5HQlVGRkVSX0hFSUdIVCA9IFNfRFJBV0lOR0JVRkZFUiArIFNVRkZJWF9IRUlHSFRcblxudmFyIE5FU1RFRF9PUFRJT05TID0gW1xuICBTX0JMRU5EX0ZVTkMsXG4gIFNfQkxFTkRfRVFVQVRJT04sXG4gIFNfU1RFTkNJTF9GVU5DLFxuICBTX1NURU5DSUxfT1BGUk9OVCxcbiAgU19TVEVOQ0lMX09QQkFDSyxcbiAgU19TQU1QTEVfQ09WRVJBR0UsXG4gIFNfVklFV1BPUlQsXG4gIFNfU0NJU1NPUl9CT1gsXG4gIFNfUE9MWUdPTl9PRkZTRVRfT0ZGU0VUXG5dXG5cbnZhciBHTF9BUlJBWV9CVUZGRVIgPSAzNDk2MlxudmFyIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSID0gMzQ5NjNcblxudmFyIEdMX0ZSQUdNRU5UX1NIQURFUiA9IDM1NjMyXG52YXIgR0xfVkVSVEVYX1NIQURFUiA9IDM1NjMzXG5cbnZhciBHTF9URVhUVVJFXzJEID0gMHgwREUxXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUCA9IDB4ODUxM1xuXG52YXIgR0xfQ1VMTF9GQUNFID0gMHgwQjQ0XG52YXIgR0xfQkxFTkQgPSAweDBCRTJcbnZhciBHTF9ESVRIRVIgPSAweDBCRDBcbnZhciBHTF9TVEVOQ0lMX1RFU1QgPSAweDBCOTBcbnZhciBHTF9ERVBUSF9URVNUID0gMHgwQjcxXG52YXIgR0xfU0NJU1NPUl9URVNUID0gMHgwQzExXG52YXIgR0xfUE9MWUdPTl9PRkZTRVRfRklMTCA9IDB4ODAzN1xudmFyIEdMX1NBTVBMRV9BTFBIQV9UT19DT1ZFUkFHRSA9IDB4ODA5RVxudmFyIEdMX1NBTVBMRV9DT1ZFUkFHRSA9IDB4ODBBMFxuXG52YXIgR0xfRkxPQVQgPSA1MTI2XG52YXIgR0xfRkxPQVRfVkVDMiA9IDM1NjY0XG52YXIgR0xfRkxPQVRfVkVDMyA9IDM1NjY1XG52YXIgR0xfRkxPQVRfVkVDNCA9IDM1NjY2XG52YXIgR0xfSU5UID0gNTEyNFxudmFyIEdMX0lOVF9WRUMyID0gMzU2NjdcbnZhciBHTF9JTlRfVkVDMyA9IDM1NjY4XG52YXIgR0xfSU5UX1ZFQzQgPSAzNTY2OVxudmFyIEdMX0JPT0wgPSAzNTY3MFxudmFyIEdMX0JPT0xfVkVDMiA9IDM1NjcxXG52YXIgR0xfQk9PTF9WRUMzID0gMzU2NzJcbnZhciBHTF9CT09MX1ZFQzQgPSAzNTY3M1xudmFyIEdMX0ZMT0FUX01BVDIgPSAzNTY3NFxudmFyIEdMX0ZMT0FUX01BVDMgPSAzNTY3NVxudmFyIEdMX0ZMT0FUX01BVDQgPSAzNTY3NlxudmFyIEdMX1NBTVBMRVJfMkQgPSAzNTY3OFxudmFyIEdMX1NBTVBMRVJfQ1VCRSA9IDM1NjgwXG5cbnZhciBHTF9UUklBTkdMRVMgPSA0XG5cbnZhciBHTF9GUk9OVCA9IDEwMjhcbnZhciBHTF9CQUNLID0gMTAyOVxudmFyIEdMX0NXID0gMHgwOTAwXG52YXIgR0xfQ0NXID0gMHgwOTAxXG52YXIgR0xfTUlOX0VYVCA9IDB4ODAwN1xudmFyIEdMX01BWF9FWFQgPSAweDgwMDhcbnZhciBHTF9BTFdBWVMgPSA1MTlcbnZhciBHTF9LRUVQID0gNzY4MFxudmFyIEdMX1pFUk8gPSAwXG52YXIgR0xfT05FID0gMVxudmFyIEdMX0ZVTkNfQUREID0gMHg4MDA2XG52YXIgR0xfTEVTUyA9IDUxM1xuXG52YXIgR0xfRlJBTUVCVUZGRVIgPSAweDhENDBcbnZhciBHTF9DT0xPUl9BVFRBQ0hNRU5UMCA9IDB4OENFMFxuXG52YXIgYmxlbmRGdW5jcyA9IHtcbiAgJzAnOiAwLFxuICAnMSc6IDEsXG4gICd6ZXJvJzogMCxcbiAgJ29uZSc6IDEsXG4gICdzcmMgY29sb3InOiA3NjgsXG4gICdvbmUgbWludXMgc3JjIGNvbG9yJzogNzY5LFxuICAnc3JjIGFscGhhJzogNzcwLFxuICAnb25lIG1pbnVzIHNyYyBhbHBoYSc6IDc3MSxcbiAgJ2RzdCBjb2xvcic6IDc3NCxcbiAgJ29uZSBtaW51cyBkc3QgY29sb3InOiA3NzUsXG4gICdkc3QgYWxwaGEnOiA3NzIsXG4gICdvbmUgbWludXMgZHN0IGFscGhhJzogNzczLFxuICAnY29uc3RhbnQgY29sb3InOiAzMjc2OSxcbiAgJ29uZSBtaW51cyBjb25zdGFudCBjb2xvcic6IDMyNzcwLFxuICAnY29uc3RhbnQgYWxwaGEnOiAzMjc3MSxcbiAgJ29uZSBtaW51cyBjb25zdGFudCBhbHBoYSc6IDMyNzcyLFxuICAnc3JjIGFscGhhIHNhdHVyYXRlJzogNzc2XG59XG5cbi8vIFRoZXJlIGFyZSBpbnZhbGlkIHZhbHVlcyBmb3Igc3JjUkdCIGFuZCBkc3RSR0IuIFNlZTpcbi8vIGh0dHBzOi8vd3d3Lmtocm9ub3Mub3JnL3JlZ2lzdHJ5L3dlYmdsL3NwZWNzLzEuMC8jNi4xM1xuLy8gaHR0cHM6Ly9naXRodWIuY29tL0tocm9ub3NHcm91cC9XZWJHTC9ibG9iLzBkMzIwMWY1ZjdlYzNjMDA2MGJjMWYwNDA3NzQ2MTU0MWYxOTg3YjkvY29uZm9ybWFuY2Utc3VpdGVzLzEuMC4zL2NvbmZvcm1hbmNlL21pc2Mvd2ViZ2wtc3BlY2lmaWMuaHRtbCNMNTZcbnZhciBpbnZhbGlkQmxlbmRDb21iaW5hdGlvbnMgPSBbXG4gICdjb25zdGFudCBjb2xvciwgY29uc3RhbnQgYWxwaGEnLFxuICAnb25lIG1pbnVzIGNvbnN0YW50IGNvbG9yLCBjb25zdGFudCBhbHBoYScsXG4gICdjb25zdGFudCBjb2xvciwgb25lIG1pbnVzIGNvbnN0YW50IGFscGhhJyxcbiAgJ29uZSBtaW51cyBjb25zdGFudCBjb2xvciwgb25lIG1pbnVzIGNvbnN0YW50IGFscGhhJyxcbiAgJ2NvbnN0YW50IGFscGhhLCBjb25zdGFudCBjb2xvcicsXG4gICdjb25zdGFudCBhbHBoYSwgb25lIG1pbnVzIGNvbnN0YW50IGNvbG9yJyxcbiAgJ29uZSBtaW51cyBjb25zdGFudCBhbHBoYSwgY29uc3RhbnQgY29sb3InLFxuICAnb25lIG1pbnVzIGNvbnN0YW50IGFscGhhLCBvbmUgbWludXMgY29uc3RhbnQgY29sb3InXG5dXG5cbnZhciBjb21wYXJlRnVuY3MgPSB7XG4gICduZXZlcic6IDUxMixcbiAgJ2xlc3MnOiA1MTMsXG4gICc8JzogNTEzLFxuICAnZXF1YWwnOiA1MTQsXG4gICc9JzogNTE0LFxuICAnPT0nOiA1MTQsXG4gICc9PT0nOiA1MTQsXG4gICdsZXF1YWwnOiA1MTUsXG4gICc8PSc6IDUxNSxcbiAgJ2dyZWF0ZXInOiA1MTYsXG4gICc+JzogNTE2LFxuICAnbm90ZXF1YWwnOiA1MTcsXG4gICchPSc6IDUxNyxcbiAgJyE9PSc6IDUxNyxcbiAgJ2dlcXVhbCc6IDUxOCxcbiAgJz49JzogNTE4LFxuICAnYWx3YXlzJzogNTE5XG59XG5cbnZhciBzdGVuY2lsT3BzID0ge1xuICAnMCc6IDAsXG4gICd6ZXJvJzogMCxcbiAgJ2tlZXAnOiA3NjgwLFxuICAncmVwbGFjZSc6IDc2ODEsXG4gICdpbmNyZW1lbnQnOiA3NjgyLFxuICAnZGVjcmVtZW50JzogNzY4MyxcbiAgJ2luY3JlbWVudCB3cmFwJzogMzQwNTUsXG4gICdkZWNyZW1lbnQgd3JhcCc6IDM0MDU2LFxuICAnaW52ZXJ0JzogNTM4NlxufVxuXG52YXIgc2hhZGVyVHlwZSA9IHtcbiAgJ2ZyYWcnOiBHTF9GUkFHTUVOVF9TSEFERVIsXG4gICd2ZXJ0JzogR0xfVkVSVEVYX1NIQURFUlxufVxuXG52YXIgb3JpZW50YXRpb25UeXBlID0ge1xuICAnY3cnOiBHTF9DVyxcbiAgJ2Njdyc6IEdMX0NDV1xufVxuXG5mdW5jdGlvbiBpc0J1ZmZlckFyZ3MgKHgpIHtcbiAgcmV0dXJuIEFycmF5LmlzQXJyYXkoeCkgfHxcbiAgICBpc1R5cGVkQXJyYXkoeCkgfHxcbiAgICBpc05EQXJyYXkoeClcbn1cblxuLy8gTWFrZSBzdXJlIHZpZXdwb3J0IGlzIHByb2Nlc3NlZCBmaXJzdFxuZnVuY3Rpb24gc29ydFN0YXRlIChzdGF0ZSkge1xuICByZXR1cm4gc3RhdGUuc29ydChmdW5jdGlvbiAoYSwgYikge1xuICAgIGlmIChhID09PSBTX1ZJRVdQT1JUKSB7XG4gICAgICByZXR1cm4gLTFcbiAgICB9IGVsc2UgaWYgKGIgPT09IFNfVklFV1BPUlQpIHtcbiAgICAgIHJldHVybiAxXG4gICAgfVxuICAgIHJldHVybiAoYSA8IGIpID8gLTEgOiAxXG4gIH0pXG59XG5cbmZ1bmN0aW9uIERlY2xhcmF0aW9uICh0aGlzRGVwLCBjb250ZXh0RGVwLCBwcm9wRGVwLCBhcHBlbmQpIHtcbiAgdGhpcy50aGlzRGVwID0gdGhpc0RlcFxuICB0aGlzLmNvbnRleHREZXAgPSBjb250ZXh0RGVwXG4gIHRoaXMucHJvcERlcCA9IHByb3BEZXBcbiAgdGhpcy5hcHBlbmQgPSBhcHBlbmRcbn1cblxuZnVuY3Rpb24gaXNTdGF0aWMgKGRlY2wpIHtcbiAgcmV0dXJuIGRlY2wgJiYgIShkZWNsLnRoaXNEZXAgfHwgZGVjbC5jb250ZXh0RGVwIHx8IGRlY2wucHJvcERlcClcbn1cblxuZnVuY3Rpb24gY3JlYXRlU3RhdGljRGVjbCAoYXBwZW5kKSB7XG4gIHJldHVybiBuZXcgRGVjbGFyYXRpb24oZmFsc2UsIGZhbHNlLCBmYWxzZSwgYXBwZW5kKVxufVxuXG5mdW5jdGlvbiBjcmVhdGVEeW5hbWljRGVjbCAoZHluLCBhcHBlbmQpIHtcbiAgdmFyIHR5cGUgPSBkeW4udHlwZVxuICBpZiAodHlwZSA9PT0gRFlOX0ZVTkMpIHtcbiAgICB2YXIgbnVtQXJncyA9IGR5bi5kYXRhLmxlbmd0aFxuICAgIHJldHVybiBuZXcgRGVjbGFyYXRpb24oXG4gICAgICB0cnVlLFxuICAgICAgbnVtQXJncyA+PSAxLFxuICAgICAgbnVtQXJncyA+PSAyLFxuICAgICAgYXBwZW5kKVxuICB9IGVsc2UgaWYgKHR5cGUgPT09IERZTl9USFVOSykge1xuICAgIHZhciBkYXRhID0gZHluLmRhdGFcbiAgICByZXR1cm4gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgZGF0YS50aGlzRGVwLFxuICAgICAgZGF0YS5jb250ZXh0RGVwLFxuICAgICAgZGF0YS5wcm9wRGVwLFxuICAgICAgYXBwZW5kKVxuICB9IGVsc2Uge1xuICAgIHJldHVybiBuZXcgRGVjbGFyYXRpb24oXG4gICAgICB0eXBlID09PSBEWU5fU1RBVEUsXG4gICAgICB0eXBlID09PSBEWU5fQ09OVEVYVCxcbiAgICAgIHR5cGUgPT09IERZTl9QUk9QLFxuICAgICAgYXBwZW5kKVxuICB9XG59XG5cbnZhciBTQ09QRV9ERUNMID0gbmV3IERlY2xhcmF0aW9uKGZhbHNlLCBmYWxzZSwgZmFsc2UsIGZ1bmN0aW9uICgpIHt9KVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHJlZ2xDb3JlIChcbiAgZ2wsXG4gIHN0cmluZ1N0b3JlLFxuICBleHRlbnNpb25zLFxuICBsaW1pdHMsXG4gIGJ1ZmZlclN0YXRlLFxuICBlbGVtZW50U3RhdGUsXG4gIHRleHR1cmVTdGF0ZSxcbiAgZnJhbWVidWZmZXJTdGF0ZSxcbiAgdW5pZm9ybVN0YXRlLFxuICBhdHRyaWJ1dGVTdGF0ZSxcbiAgc2hhZGVyU3RhdGUsXG4gIGRyYXdTdGF0ZSxcbiAgY29udGV4dFN0YXRlLFxuICB0aW1lcixcbiAgY29uZmlnKSB7XG4gIHZhciBBdHRyaWJ1dGVSZWNvcmQgPSBhdHRyaWJ1dGVTdGF0ZS5SZWNvcmRcblxuICB2YXIgYmxlbmRFcXVhdGlvbnMgPSB7XG4gICAgJ2FkZCc6IDMyNzc0LFxuICAgICdzdWJ0cmFjdCc6IDMyNzc4LFxuICAgICdyZXZlcnNlIHN1YnRyYWN0JzogMzI3NzlcbiAgfVxuICBpZiAoZXh0ZW5zaW9ucy5leHRfYmxlbmRfbWlubWF4KSB7XG4gICAgYmxlbmRFcXVhdGlvbnMubWluID0gR0xfTUlOX0VYVFxuICAgIGJsZW5kRXF1YXRpb25zLm1heCA9IEdMX01BWF9FWFRcbiAgfVxuXG4gIHZhciBleHRJbnN0YW5jaW5nID0gZXh0ZW5zaW9ucy5hbmdsZV9pbnN0YW5jZWRfYXJyYXlzXG4gIHZhciBleHREcmF3QnVmZmVycyA9IGV4dGVuc2lvbnMud2ViZ2xfZHJhd19idWZmZXJzXG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBXRUJHTCBTVEFURVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIHZhciBjdXJyZW50U3RhdGUgPSB7XG4gICAgZGlydHk6IHRydWUsXG4gICAgcHJvZmlsZTogY29uZmlnLnByb2ZpbGVcbiAgfVxuICB2YXIgbmV4dFN0YXRlID0ge31cbiAgdmFyIEdMX1NUQVRFX05BTUVTID0gW11cbiAgdmFyIEdMX0ZMQUdTID0ge31cbiAgdmFyIEdMX1ZBUklBQkxFUyA9IHt9XG5cbiAgZnVuY3Rpb24gcHJvcE5hbWUgKG5hbWUpIHtcbiAgICByZXR1cm4gbmFtZS5yZXBsYWNlKCcuJywgJ18nKVxuICB9XG5cbiAgZnVuY3Rpb24gc3RhdGVGbGFnIChzbmFtZSwgY2FwLCBpbml0KSB7XG4gICAgdmFyIG5hbWUgPSBwcm9wTmFtZShzbmFtZSlcbiAgICBHTF9TVEFURV9OQU1FUy5wdXNoKHNuYW1lKVxuICAgIG5leHRTdGF0ZVtuYW1lXSA9IGN1cnJlbnRTdGF0ZVtuYW1lXSA9ICEhaW5pdFxuICAgIEdMX0ZMQUdTW25hbWVdID0gY2FwXG4gIH1cblxuICBmdW5jdGlvbiBzdGF0ZVZhcmlhYmxlIChzbmFtZSwgZnVuYywgaW5pdCkge1xuICAgIHZhciBuYW1lID0gcHJvcE5hbWUoc25hbWUpXG4gICAgR0xfU1RBVEVfTkFNRVMucHVzaChzbmFtZSlcbiAgICBpZiAoQXJyYXkuaXNBcnJheShpbml0KSkge1xuICAgICAgY3VycmVudFN0YXRlW25hbWVdID0gaW5pdC5zbGljZSgpXG4gICAgICBuZXh0U3RhdGVbbmFtZV0gPSBpbml0LnNsaWNlKClcbiAgICB9IGVsc2Uge1xuICAgICAgY3VycmVudFN0YXRlW25hbWVdID0gbmV4dFN0YXRlW25hbWVdID0gaW5pdFxuICAgIH1cbiAgICBHTF9WQVJJQUJMRVNbbmFtZV0gPSBmdW5jXG4gIH1cblxuICAvLyBEaXRoZXJpbmdcbiAgc3RhdGVGbGFnKFNfRElUSEVSLCBHTF9ESVRIRVIpXG5cbiAgLy8gQmxlbmRpbmdcbiAgc3RhdGVGbGFnKFNfQkxFTkRfRU5BQkxFLCBHTF9CTEVORClcbiAgc3RhdGVWYXJpYWJsZShTX0JMRU5EX0NPTE9SLCAnYmxlbmRDb2xvcicsIFswLCAwLCAwLCAwXSlcbiAgc3RhdGVWYXJpYWJsZShTX0JMRU5EX0VRVUFUSU9OLCAnYmxlbmRFcXVhdGlvblNlcGFyYXRlJyxcbiAgICBbR0xfRlVOQ19BREQsIEdMX0ZVTkNfQUREXSlcbiAgc3RhdGVWYXJpYWJsZShTX0JMRU5EX0ZVTkMsICdibGVuZEZ1bmNTZXBhcmF0ZScsXG4gICAgW0dMX09ORSwgR0xfWkVSTywgR0xfT05FLCBHTF9aRVJPXSlcblxuICAvLyBEZXB0aFxuICBzdGF0ZUZsYWcoU19ERVBUSF9FTkFCTEUsIEdMX0RFUFRIX1RFU1QsIHRydWUpXG4gIHN0YXRlVmFyaWFibGUoU19ERVBUSF9GVU5DLCAnZGVwdGhGdW5jJywgR0xfTEVTUylcbiAgc3RhdGVWYXJpYWJsZShTX0RFUFRIX1JBTkdFLCAnZGVwdGhSYW5nZScsIFswLCAxXSlcbiAgc3RhdGVWYXJpYWJsZShTX0RFUFRIX01BU0ssICdkZXB0aE1hc2snLCB0cnVlKVxuXG4gIC8vIENvbG9yIG1hc2tcbiAgc3RhdGVWYXJpYWJsZShTX0NPTE9SX01BU0ssIFNfQ09MT1JfTUFTSywgW3RydWUsIHRydWUsIHRydWUsIHRydWVdKVxuXG4gIC8vIEZhY2UgY3VsbGluZ1xuICBzdGF0ZUZsYWcoU19DVUxMX0VOQUJMRSwgR0xfQ1VMTF9GQUNFKVxuICBzdGF0ZVZhcmlhYmxlKFNfQ1VMTF9GQUNFLCAnY3VsbEZhY2UnLCBHTF9CQUNLKVxuXG4gIC8vIEZyb250IGZhY2Ugb3JpZW50YXRpb25cbiAgc3RhdGVWYXJpYWJsZShTX0ZST05UX0ZBQ0UsIFNfRlJPTlRfRkFDRSwgR0xfQ0NXKVxuXG4gIC8vIExpbmUgd2lkdGhcbiAgc3RhdGVWYXJpYWJsZShTX0xJTkVfV0lEVEgsIFNfTElORV9XSURUSCwgMSlcblxuICAvLyBQb2x5Z29uIG9mZnNldFxuICBzdGF0ZUZsYWcoU19QT0xZR09OX09GRlNFVF9FTkFCTEUsIEdMX1BPTFlHT05fT0ZGU0VUX0ZJTEwpXG4gIHN0YXRlVmFyaWFibGUoU19QT0xZR09OX09GRlNFVF9PRkZTRVQsICdwb2x5Z29uT2Zmc2V0JywgWzAsIDBdKVxuXG4gIC8vIFNhbXBsZSBjb3ZlcmFnZVxuICBzdGF0ZUZsYWcoU19TQU1QTEVfQUxQSEEsIEdMX1NBTVBMRV9BTFBIQV9UT19DT1ZFUkFHRSlcbiAgc3RhdGVGbGFnKFNfU0FNUExFX0VOQUJMRSwgR0xfU0FNUExFX0NPVkVSQUdFKVxuICBzdGF0ZVZhcmlhYmxlKFNfU0FNUExFX0NPVkVSQUdFLCAnc2FtcGxlQ292ZXJhZ2UnLCBbMSwgZmFsc2VdKVxuXG4gIC8vIFN0ZW5jaWxcbiAgc3RhdGVGbGFnKFNfU1RFTkNJTF9FTkFCTEUsIEdMX1NURU5DSUxfVEVTVClcbiAgc3RhdGVWYXJpYWJsZShTX1NURU5DSUxfTUFTSywgJ3N0ZW5jaWxNYXNrJywgLTEpXG4gIHN0YXRlVmFyaWFibGUoU19TVEVOQ0lMX0ZVTkMsICdzdGVuY2lsRnVuYycsIFtHTF9BTFdBWVMsIDAsIC0xXSlcbiAgc3RhdGVWYXJpYWJsZShTX1NURU5DSUxfT1BGUk9OVCwgJ3N0ZW5jaWxPcFNlcGFyYXRlJyxcbiAgICBbR0xfRlJPTlQsIEdMX0tFRVAsIEdMX0tFRVAsIEdMX0tFRVBdKVxuICBzdGF0ZVZhcmlhYmxlKFNfU1RFTkNJTF9PUEJBQ0ssICdzdGVuY2lsT3BTZXBhcmF0ZScsXG4gICAgW0dMX0JBQ0ssIEdMX0tFRVAsIEdMX0tFRVAsIEdMX0tFRVBdKVxuXG4gIC8vIFNjaXNzb3JcbiAgc3RhdGVGbGFnKFNfU0NJU1NPUl9FTkFCTEUsIEdMX1NDSVNTT1JfVEVTVClcbiAgc3RhdGVWYXJpYWJsZShTX1NDSVNTT1JfQk9YLCAnc2Npc3NvcicsXG4gICAgWzAsIDAsIGdsLmRyYXdpbmdCdWZmZXJXaWR0aCwgZ2wuZHJhd2luZ0J1ZmZlckhlaWdodF0pXG5cbiAgLy8gVmlld3BvcnRcbiAgc3RhdGVWYXJpYWJsZShTX1ZJRVdQT1JULCBTX1ZJRVdQT1JULFxuICAgIFswLCAwLCBnbC5kcmF3aW5nQnVmZmVyV2lkdGgsIGdsLmRyYXdpbmdCdWZmZXJIZWlnaHRdKVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gRU5WSVJPTk1FTlRcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICB2YXIgc2hhcmVkU3RhdGUgPSB7XG4gICAgZ2w6IGdsLFxuICAgIGNvbnRleHQ6IGNvbnRleHRTdGF0ZSxcbiAgICBzdHJpbmdzOiBzdHJpbmdTdG9yZSxcbiAgICBuZXh0OiBuZXh0U3RhdGUsXG4gICAgY3VycmVudDogY3VycmVudFN0YXRlLFxuICAgIGRyYXc6IGRyYXdTdGF0ZSxcbiAgICBlbGVtZW50czogZWxlbWVudFN0YXRlLFxuICAgIGJ1ZmZlcjogYnVmZmVyU3RhdGUsXG4gICAgc2hhZGVyOiBzaGFkZXJTdGF0ZSxcbiAgICBhdHRyaWJ1dGVzOiBhdHRyaWJ1dGVTdGF0ZS5zdGF0ZSxcbiAgICB1bmlmb3JtczogdW5pZm9ybVN0YXRlLFxuICAgIGZyYW1lYnVmZmVyOiBmcmFtZWJ1ZmZlclN0YXRlLFxuICAgIGV4dGVuc2lvbnM6IGV4dGVuc2lvbnMsXG5cbiAgICB0aW1lcjogdGltZXIsXG4gICAgaXNCdWZmZXJBcmdzOiBpc0J1ZmZlckFyZ3NcbiAgfVxuXG4gIHZhciBzaGFyZWRDb25zdGFudHMgPSB7XG4gICAgcHJpbVR5cGVzOiBwcmltVHlwZXMsXG4gICAgY29tcGFyZUZ1bmNzOiBjb21wYXJlRnVuY3MsXG4gICAgYmxlbmRGdW5jczogYmxlbmRGdW5jcyxcbiAgICBibGVuZEVxdWF0aW9uczogYmxlbmRFcXVhdGlvbnMsXG4gICAgc3RlbmNpbE9wczogc3RlbmNpbE9wcyxcbiAgICBnbFR5cGVzOiBnbFR5cGVzLFxuICAgIG9yaWVudGF0aW9uVHlwZTogb3JpZW50YXRpb25UeXBlXG4gIH1cblxuICBcblxuICBpZiAoZXh0RHJhd0J1ZmZlcnMpIHtcbiAgICBzaGFyZWRDb25zdGFudHMuYmFja0J1ZmZlciA9IFtHTF9CQUNLXVxuICAgIHNoYXJlZENvbnN0YW50cy5kcmF3QnVmZmVyID0gbG9vcChsaW1pdHMubWF4RHJhd2J1ZmZlcnMsIGZ1bmN0aW9uIChpKSB7XG4gICAgICBpZiAoaSA9PT0gMCkge1xuICAgICAgICByZXR1cm4gWzBdXG4gICAgICB9XG4gICAgICByZXR1cm4gbG9vcChpLCBmdW5jdGlvbiAoaikge1xuICAgICAgICByZXR1cm4gR0xfQ09MT1JfQVRUQUNITUVOVDAgKyBqXG4gICAgICB9KVxuICAgIH0pXG4gIH1cblxuICB2YXIgZHJhd0NhbGxDb3VudGVyID0gMFxuICBmdW5jdGlvbiBjcmVhdGVSRUdMRW52aXJvbm1lbnQgKCkge1xuICAgIHZhciBlbnYgPSBjcmVhdGVFbnZpcm9ubWVudCgpXG4gICAgdmFyIGxpbmsgPSBlbnYubGlua1xuICAgIHZhciBnbG9iYWwgPSBlbnYuZ2xvYmFsXG4gICAgZW52LmlkID0gZHJhd0NhbGxDb3VudGVyKytcblxuICAgIGVudi5iYXRjaElkID0gJzAnXG5cbiAgICAvLyBsaW5rIHNoYXJlZCBzdGF0ZVxuICAgIHZhciBTSEFSRUQgPSBsaW5rKHNoYXJlZFN0YXRlKVxuICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkID0ge1xuICAgICAgcHJvcHM6ICdhMCdcbiAgICB9XG4gICAgT2JqZWN0LmtleXMoc2hhcmVkU3RhdGUpLmZvckVhY2goZnVuY3Rpb24gKHByb3ApIHtcbiAgICAgIHNoYXJlZFtwcm9wXSA9IGdsb2JhbC5kZWYoU0hBUkVELCAnLicsIHByb3ApXG4gICAgfSlcblxuICAgIC8vIEluamVjdCBydW50aW1lIGFzc2VydGlvbiBzdHVmZiBmb3IgZGVidWcgYnVpbGRzXG4gICAgXG5cbiAgICAvLyBDb3B5IEdMIHN0YXRlIHZhcmlhYmxlcyBvdmVyXG4gICAgdmFyIG5leHRWYXJzID0gZW52Lm5leHQgPSB7fVxuICAgIHZhciBjdXJyZW50VmFycyA9IGVudi5jdXJyZW50ID0ge31cbiAgICBPYmplY3Qua2V5cyhHTF9WQVJJQUJMRVMpLmZvckVhY2goZnVuY3Rpb24gKHZhcmlhYmxlKSB7XG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShjdXJyZW50U3RhdGVbdmFyaWFibGVdKSkge1xuICAgICAgICBuZXh0VmFyc1t2YXJpYWJsZV0gPSBnbG9iYWwuZGVmKHNoYXJlZC5uZXh0LCAnLicsIHZhcmlhYmxlKVxuICAgICAgICBjdXJyZW50VmFyc1t2YXJpYWJsZV0gPSBnbG9iYWwuZGVmKHNoYXJlZC5jdXJyZW50LCAnLicsIHZhcmlhYmxlKVxuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyBJbml0aWFsaXplIHNoYXJlZCBjb25zdGFudHNcbiAgICB2YXIgY29uc3RhbnRzID0gZW52LmNvbnN0YW50cyA9IHt9XG4gICAgT2JqZWN0LmtleXMoc2hhcmVkQ29uc3RhbnRzKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICBjb25zdGFudHNbbmFtZV0gPSBnbG9iYWwuZGVmKEpTT04uc3RyaW5naWZ5KHNoYXJlZENvbnN0YW50c1tuYW1lXSkpXG4gICAgfSlcblxuICAgIC8vIEhlbHBlciBmdW5jdGlvbiBmb3IgY2FsbGluZyBhIGJsb2NrXG4gICAgZW52Lmludm9rZSA9IGZ1bmN0aW9uIChibG9jaywgeCkge1xuICAgICAgc3dpdGNoICh4LnR5cGUpIHtcbiAgICAgICAgY2FzZSBEWU5fRlVOQzpcbiAgICAgICAgICB2YXIgYXJnTGlzdCA9IFtcbiAgICAgICAgICAgICd0aGlzJyxcbiAgICAgICAgICAgIHNoYXJlZC5jb250ZXh0LFxuICAgICAgICAgICAgc2hhcmVkLnByb3BzLFxuICAgICAgICAgICAgZW52LmJhdGNoSWRcbiAgICAgICAgICBdXG4gICAgICAgICAgcmV0dXJuIGJsb2NrLmRlZihcbiAgICAgICAgICAgIGxpbmsoeC5kYXRhKSwgJy5jYWxsKCcsXG4gICAgICAgICAgICAgIGFyZ0xpc3Quc2xpY2UoMCwgTWF0aC5tYXgoeC5kYXRhLmxlbmd0aCArIDEsIDQpKSxcbiAgICAgICAgICAgICAnKScpXG4gICAgICAgIGNhc2UgRFlOX1BST1A6XG4gICAgICAgICAgcmV0dXJuIGJsb2NrLmRlZihzaGFyZWQucHJvcHMsIHguZGF0YSlcbiAgICAgICAgY2FzZSBEWU5fQ09OVEVYVDpcbiAgICAgICAgICByZXR1cm4gYmxvY2suZGVmKHNoYXJlZC5jb250ZXh0LCB4LmRhdGEpXG4gICAgICAgIGNhc2UgRFlOX1NUQVRFOlxuICAgICAgICAgIHJldHVybiBibG9jay5kZWYoJ3RoaXMnLCB4LmRhdGEpXG4gICAgICAgIGNhc2UgRFlOX1RIVU5LOlxuICAgICAgICAgIHguZGF0YS5hcHBlbmQoZW52LCBibG9jaylcbiAgICAgICAgICByZXR1cm4geC5kYXRhLnJlZlxuICAgICAgfVxuICAgIH1cblxuICAgIGVudi5hdHRyaWJDYWNoZSA9IHt9XG5cbiAgICB2YXIgc2NvcGVBdHRyaWJzID0ge31cbiAgICBlbnYuc2NvcGVBdHRyaWIgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgICAgdmFyIGlkID0gc3RyaW5nU3RvcmUuaWQobmFtZSlcbiAgICAgIGlmIChpZCBpbiBzY29wZUF0dHJpYnMpIHtcbiAgICAgICAgcmV0dXJuIHNjb3BlQXR0cmlic1tpZF1cbiAgICAgIH1cbiAgICAgIHZhciBiaW5kaW5nID0gYXR0cmlidXRlU3RhdGUuc2NvcGVbaWRdXG4gICAgICBpZiAoIWJpbmRpbmcpIHtcbiAgICAgICAgYmluZGluZyA9IGF0dHJpYnV0ZVN0YXRlLnNjb3BlW2lkXSA9IG5ldyBBdHRyaWJ1dGVSZWNvcmQoKVxuICAgICAgfVxuICAgICAgdmFyIHJlc3VsdCA9IHNjb3BlQXR0cmlic1tpZF0gPSBsaW5rKGJpbmRpbmcpXG4gICAgICByZXR1cm4gcmVzdWx0XG4gICAgfVxuXG4gICAgcmV0dXJuIGVudlxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBQQVJTSU5HXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgZnVuY3Rpb24gcGFyc2VQcm9maWxlIChvcHRpb25zKSB7XG4gICAgdmFyIHN0YXRpY09wdGlvbnMgPSBvcHRpb25zLnN0YXRpY1xuICAgIHZhciBkeW5hbWljT3B0aW9ucyA9IG9wdGlvbnMuZHluYW1pY1xuXG4gICAgdmFyIHByb2ZpbGVFbmFibGVcbiAgICBpZiAoU19QUk9GSUxFIGluIHN0YXRpY09wdGlvbnMpIHtcbiAgICAgIHZhciB2YWx1ZSA9ICEhc3RhdGljT3B0aW9uc1tTX1BST0ZJTEVdXG4gICAgICBwcm9maWxlRW5hYmxlID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICByZXR1cm4gdmFsdWVcbiAgICAgIH0pXG4gICAgICBwcm9maWxlRW5hYmxlLmVuYWJsZSA9IHZhbHVlXG4gICAgfSBlbHNlIGlmIChTX1BST0ZJTEUgaW4gZHluYW1pY09wdGlvbnMpIHtcbiAgICAgIHZhciBkeW4gPSBkeW5hbWljT3B0aW9uc1tTX1BST0ZJTEVdXG4gICAgICBwcm9maWxlRW5hYmxlID0gY3JlYXRlRHluYW1pY0RlY2woZHluLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICByZXR1cm4gZW52Lmludm9rZShzY29wZSwgZHluKVxuICAgICAgfSlcbiAgICB9XG5cbiAgICByZXR1cm4gcHJvZmlsZUVuYWJsZVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VGcmFtZWJ1ZmZlciAob3B0aW9ucywgZW52KSB7XG4gICAgdmFyIHN0YXRpY09wdGlvbnMgPSBvcHRpb25zLnN0YXRpY1xuICAgIHZhciBkeW5hbWljT3B0aW9ucyA9IG9wdGlvbnMuZHluYW1pY1xuXG4gICAgaWYgKFNfRlJBTUVCVUZGRVIgaW4gc3RhdGljT3B0aW9ucykge1xuICAgICAgdmFyIGZyYW1lYnVmZmVyID0gc3RhdGljT3B0aW9uc1tTX0ZSQU1FQlVGRkVSXVxuICAgICAgaWYgKGZyYW1lYnVmZmVyKSB7XG4gICAgICAgIGZyYW1lYnVmZmVyID0gZnJhbWVidWZmZXJTdGF0ZS5nZXRGcmFtZWJ1ZmZlcihmcmFtZWJ1ZmZlcilcbiAgICAgICAgXG4gICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIGJsb2NrKSB7XG4gICAgICAgICAgdmFyIEZSQU1FQlVGRkVSID0gZW52LmxpbmsoZnJhbWVidWZmZXIpXG4gICAgICAgICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcbiAgICAgICAgICBibG9jay5zZXQoXG4gICAgICAgICAgICBzaGFyZWQuZnJhbWVidWZmZXIsXG4gICAgICAgICAgICAnLm5leHQnLFxuICAgICAgICAgICAgRlJBTUVCVUZGRVIpXG4gICAgICAgICAgdmFyIENPTlRFWFQgPSBzaGFyZWQuY29udGV4dFxuICAgICAgICAgIGJsb2NrLnNldChcbiAgICAgICAgICAgIENPTlRFWFQsXG4gICAgICAgICAgICAnLicgKyBTX0ZSQU1FQlVGRkVSX1dJRFRILFxuICAgICAgICAgICAgRlJBTUVCVUZGRVIgKyAnLndpZHRoJylcbiAgICAgICAgICBibG9jay5zZXQoXG4gICAgICAgICAgICBDT05URVhULFxuICAgICAgICAgICAgJy4nICsgU19GUkFNRUJVRkZFUl9IRUlHSFQsXG4gICAgICAgICAgICBGUkFNRUJVRkZFUiArICcuaGVpZ2h0JylcbiAgICAgICAgICByZXR1cm4gRlJBTUVCVUZGRVJcbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcbiAgICAgICAgICBzY29wZS5zZXQoXG4gICAgICAgICAgICBzaGFyZWQuZnJhbWVidWZmZXIsXG4gICAgICAgICAgICAnLm5leHQnLFxuICAgICAgICAgICAgJ251bGwnKVxuICAgICAgICAgIHZhciBDT05URVhUID0gc2hhcmVkLmNvbnRleHRcbiAgICAgICAgICBzY29wZS5zZXQoXG4gICAgICAgICAgICBDT05URVhULFxuICAgICAgICAgICAgJy4nICsgU19GUkFNRUJVRkZFUl9XSURUSCxcbiAgICAgICAgICAgIENPTlRFWFQgKyAnLicgKyBTX0RSQVdJTkdCVUZGRVJfV0lEVEgpXG4gICAgICAgICAgc2NvcGUuc2V0KFxuICAgICAgICAgICAgQ09OVEVYVCxcbiAgICAgICAgICAgICcuJyArIFNfRlJBTUVCVUZGRVJfSEVJR0hULFxuICAgICAgICAgICAgQ09OVEVYVCArICcuJyArIFNfRFJBV0lOR0JVRkZFUl9IRUlHSFQpXG4gICAgICAgICAgcmV0dXJuICdudWxsJ1xuICAgICAgICB9KVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoU19GUkFNRUJVRkZFUiBpbiBkeW5hbWljT3B0aW9ucykge1xuICAgICAgdmFyIGR5biA9IGR5bmFtaWNPcHRpb25zW1NfRlJBTUVCVUZGRVJdXG4gICAgICByZXR1cm4gY3JlYXRlRHluYW1pY0RlY2woZHluLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICB2YXIgRlJBTUVCVUZGRVJfRlVOQyA9IGVudi5pbnZva2Uoc2NvcGUsIGR5bilcbiAgICAgICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcbiAgICAgICAgdmFyIEZSQU1FQlVGRkVSX1NUQVRFID0gc2hhcmVkLmZyYW1lYnVmZmVyXG4gICAgICAgIHZhciBGUkFNRUJVRkZFUiA9IHNjb3BlLmRlZihcbiAgICAgICAgICBGUkFNRUJVRkZFUl9TVEFURSwgJy5nZXRGcmFtZWJ1ZmZlcignLCBGUkFNRUJVRkZFUl9GVU5DLCAnKScpXG5cbiAgICAgICAgXG5cbiAgICAgICAgc2NvcGUuc2V0KFxuICAgICAgICAgIEZSQU1FQlVGRkVSX1NUQVRFLFxuICAgICAgICAgICcubmV4dCcsXG4gICAgICAgICAgRlJBTUVCVUZGRVIpXG4gICAgICAgIHZhciBDT05URVhUID0gc2hhcmVkLmNvbnRleHRcbiAgICAgICAgc2NvcGUuc2V0KFxuICAgICAgICAgIENPTlRFWFQsXG4gICAgICAgICAgJy4nICsgU19GUkFNRUJVRkZFUl9XSURUSCxcbiAgICAgICAgICBGUkFNRUJVRkZFUiArICc/JyArIEZSQU1FQlVGRkVSICsgJy53aWR0aDonICtcbiAgICAgICAgICBDT05URVhUICsgJy4nICsgU19EUkFXSU5HQlVGRkVSX1dJRFRIKVxuICAgICAgICBzY29wZS5zZXQoXG4gICAgICAgICAgQ09OVEVYVCxcbiAgICAgICAgICAnLicgKyBTX0ZSQU1FQlVGRkVSX0hFSUdIVCxcbiAgICAgICAgICBGUkFNRUJVRkZFUiArXG4gICAgICAgICAgJz8nICsgRlJBTUVCVUZGRVIgKyAnLmhlaWdodDonICtcbiAgICAgICAgICBDT05URVhUICsgJy4nICsgU19EUkFXSU5HQlVGRkVSX0hFSUdIVClcbiAgICAgICAgcmV0dXJuIEZSQU1FQlVGRkVSXG4gICAgICB9KVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlVmlld3BvcnRTY2lzc29yIChvcHRpb25zLCBmcmFtZWJ1ZmZlciwgZW52KSB7XG4gICAgdmFyIHN0YXRpY09wdGlvbnMgPSBvcHRpb25zLnN0YXRpY1xuICAgIHZhciBkeW5hbWljT3B0aW9ucyA9IG9wdGlvbnMuZHluYW1pY1xuXG4gICAgZnVuY3Rpb24gcGFyc2VCb3ggKHBhcmFtKSB7XG4gICAgICBpZiAocGFyYW0gaW4gc3RhdGljT3B0aW9ucykge1xuICAgICAgICB2YXIgYm94ID0gc3RhdGljT3B0aW9uc1twYXJhbV1cbiAgICAgICAgXG5cbiAgICAgICAgdmFyIGlzU3RhdGljID0gdHJ1ZVxuICAgICAgICB2YXIgeCA9IGJveC54IHwgMFxuICAgICAgICB2YXIgeSA9IGJveC55IHwgMFxuICAgICAgICB2YXIgdywgaFxuICAgICAgICBpZiAoJ3dpZHRoJyBpbiBib3gpIHtcbiAgICAgICAgICB3ID0gYm94LndpZHRoIHwgMFxuICAgICAgICAgIFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlzU3RhdGljID0gZmFsc2VcbiAgICAgICAgfVxuICAgICAgICBpZiAoJ2hlaWdodCcgaW4gYm94KSB7XG4gICAgICAgICAgaCA9IGJveC5oZWlnaHQgfCAwXG4gICAgICAgICAgXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaXNTdGF0aWMgPSBmYWxzZVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG5ldyBEZWNsYXJhdGlvbihcbiAgICAgICAgICAhaXNTdGF0aWMgJiYgZnJhbWVidWZmZXIgJiYgZnJhbWVidWZmZXIudGhpc0RlcCxcbiAgICAgICAgICAhaXNTdGF0aWMgJiYgZnJhbWVidWZmZXIgJiYgZnJhbWVidWZmZXIuY29udGV4dERlcCxcbiAgICAgICAgICAhaXNTdGF0aWMgJiYgZnJhbWVidWZmZXIgJiYgZnJhbWVidWZmZXIucHJvcERlcCxcbiAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgICAgdmFyIENPTlRFWFQgPSBlbnYuc2hhcmVkLmNvbnRleHRcbiAgICAgICAgICAgIHZhciBCT1hfVyA9IHdcbiAgICAgICAgICAgIGlmICghKCd3aWR0aCcgaW4gYm94KSkge1xuICAgICAgICAgICAgICBCT1hfVyA9IHNjb3BlLmRlZihDT05URVhULCAnLicsIFNfRlJBTUVCVUZGRVJfV0lEVEgsICctJywgeClcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhciBCT1hfSCA9IGhcbiAgICAgICAgICAgIGlmICghKCdoZWlnaHQnIGluIGJveCkpIHtcbiAgICAgICAgICAgICAgQk9YX0ggPSBzY29wZS5kZWYoQ09OVEVYVCwgJy4nLCBTX0ZSQU1FQlVGRkVSX0hFSUdIVCwgJy0nLCB5KVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIFt4LCB5LCBCT1hfVywgQk9YX0hdXG4gICAgICAgICAgfSlcbiAgICAgIH0gZWxzZSBpZiAocGFyYW0gaW4gZHluYW1pY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIGR5bkJveCA9IGR5bmFtaWNPcHRpb25zW3BhcmFtXVxuICAgICAgICB2YXIgcmVzdWx0ID0gY3JlYXRlRHluYW1pY0RlY2woZHluQm94LCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciBCT1ggPSBlbnYuaW52b2tlKHNjb3BlLCBkeW5Cb3gpXG5cbiAgICAgICAgICBcblxuICAgICAgICAgIHZhciBDT05URVhUID0gZW52LnNoYXJlZC5jb250ZXh0XG4gICAgICAgICAgdmFyIEJPWF9YID0gc2NvcGUuZGVmKEJPWCwgJy54fDAnKVxuICAgICAgICAgIHZhciBCT1hfWSA9IHNjb3BlLmRlZihCT1gsICcueXwwJylcbiAgICAgICAgICB2YXIgQk9YX1cgPSBzY29wZS5kZWYoXG4gICAgICAgICAgICAnXCJ3aWR0aFwiIGluICcsIEJPWCwgJz8nLCBCT1gsICcud2lkdGh8MDonLFxuICAgICAgICAgICAgJygnLCBDT05URVhULCAnLicsIFNfRlJBTUVCVUZGRVJfV0lEVEgsICctJywgQk9YX1gsICcpJylcbiAgICAgICAgICB2YXIgQk9YX0ggPSBzY29wZS5kZWYoXG4gICAgICAgICAgICAnXCJoZWlnaHRcIiBpbiAnLCBCT1gsICc/JywgQk9YLCAnLmhlaWdodHwwOicsXG4gICAgICAgICAgICAnKCcsIENPTlRFWFQsICcuJywgU19GUkFNRUJVRkZFUl9IRUlHSFQsICctJywgQk9YX1ksICcpJylcblxuICAgICAgICAgIFxuXG4gICAgICAgICAgcmV0dXJuIFtCT1hfWCwgQk9YX1ksIEJPWF9XLCBCT1hfSF1cbiAgICAgICAgfSlcbiAgICAgICAgaWYgKGZyYW1lYnVmZmVyKSB7XG4gICAgICAgICAgcmVzdWx0LnRoaXNEZXAgPSByZXN1bHQudGhpc0RlcCB8fCBmcmFtZWJ1ZmZlci50aGlzRGVwXG4gICAgICAgICAgcmVzdWx0LmNvbnRleHREZXAgPSByZXN1bHQuY29udGV4dERlcCB8fCBmcmFtZWJ1ZmZlci5jb250ZXh0RGVwXG4gICAgICAgICAgcmVzdWx0LnByb3BEZXAgPSByZXN1bHQucHJvcERlcCB8fCBmcmFtZWJ1ZmZlci5wcm9wRGVwXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgfSBlbHNlIGlmIChmcmFtZWJ1ZmZlcikge1xuICAgICAgICByZXR1cm4gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgICAgIGZyYW1lYnVmZmVyLnRoaXNEZXAsXG4gICAgICAgICAgZnJhbWVidWZmZXIuY29udGV4dERlcCxcbiAgICAgICAgICBmcmFtZWJ1ZmZlci5wcm9wRGVwLFxuICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgICB2YXIgQ09OVEVYVCA9IGVudi5zaGFyZWQuY29udGV4dFxuICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgMCwgMCxcbiAgICAgICAgICAgICAgc2NvcGUuZGVmKENPTlRFWFQsICcuJywgU19GUkFNRUJVRkZFUl9XSURUSCksXG4gICAgICAgICAgICAgIHNjb3BlLmRlZihDT05URVhULCAnLicsIFNfRlJBTUVCVUZGRVJfSEVJR0hUKV1cbiAgICAgICAgICB9KVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIG51bGxcbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgdmlld3BvcnQgPSBwYXJzZUJveChTX1ZJRVdQT1JUKVxuXG4gICAgaWYgKHZpZXdwb3J0KSB7XG4gICAgICB2YXIgcHJldlZpZXdwb3J0ID0gdmlld3BvcnRcbiAgICAgIHZpZXdwb3J0ID0gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgICB2aWV3cG9ydC50aGlzRGVwLFxuICAgICAgICB2aWV3cG9ydC5jb250ZXh0RGVwLFxuICAgICAgICB2aWV3cG9ydC5wcm9wRGVwLFxuICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciBWSUVXUE9SVCA9IHByZXZWaWV3cG9ydC5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgICAgICB2YXIgQ09OVEVYVCA9IGVudi5zaGFyZWQuY29udGV4dFxuICAgICAgICAgIHNjb3BlLnNldChcbiAgICAgICAgICAgIENPTlRFWFQsXG4gICAgICAgICAgICAnLicgKyBTX1ZJRVdQT1JUX1dJRFRILFxuICAgICAgICAgICAgVklFV1BPUlRbMl0pXG4gICAgICAgICAgc2NvcGUuc2V0KFxuICAgICAgICAgICAgQ09OVEVYVCxcbiAgICAgICAgICAgICcuJyArIFNfVklFV1BPUlRfSEVJR0hULFxuICAgICAgICAgICAgVklFV1BPUlRbM10pXG4gICAgICAgICAgcmV0dXJuIFZJRVdQT1JUXG4gICAgICAgIH0pXG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIHZpZXdwb3J0OiB2aWV3cG9ydCxcbiAgICAgIHNjaXNzb3JfYm94OiBwYXJzZUJveChTX1NDSVNTT1JfQk9YKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlUHJvZ3JhbSAob3B0aW9ucykge1xuICAgIHZhciBzdGF0aWNPcHRpb25zID0gb3B0aW9ucy5zdGF0aWNcbiAgICB2YXIgZHluYW1pY09wdGlvbnMgPSBvcHRpb25zLmR5bmFtaWNcblxuICAgIGZ1bmN0aW9uIHBhcnNlU2hhZGVyIChuYW1lKSB7XG4gICAgICBpZiAobmFtZSBpbiBzdGF0aWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBpZCA9IHN0cmluZ1N0b3JlLmlkKHN0YXRpY09wdGlvbnNbbmFtZV0pXG4gICAgICAgIFxuICAgICAgICB2YXIgcmVzdWx0ID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcmV0dXJuIGlkXG4gICAgICAgIH0pXG4gICAgICAgIHJlc3VsdC5pZCA9IGlkXG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH0gZWxzZSBpZiAobmFtZSBpbiBkeW5hbWljT3B0aW9ucykge1xuICAgICAgICB2YXIgZHluID0gZHluYW1pY09wdGlvbnNbbmFtZV1cbiAgICAgICAgcmV0dXJuIGNyZWF0ZUR5bmFtaWNEZWNsKGR5biwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICB2YXIgc3RyID0gZW52Lmludm9rZShzY29wZSwgZHluKVxuICAgICAgICAgIHZhciBpZCA9IHNjb3BlLmRlZihlbnYuc2hhcmVkLnN0cmluZ3MsICcuaWQoJywgc3RyLCAnKScpXG4gICAgICAgICAgXG4gICAgICAgICAgcmV0dXJuIGlkXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cblxuICAgIHZhciBmcmFnID0gcGFyc2VTaGFkZXIoU19GUkFHKVxuICAgIHZhciB2ZXJ0ID0gcGFyc2VTaGFkZXIoU19WRVJUKVxuXG4gICAgdmFyIHByb2dyYW0gPSBudWxsXG4gICAgdmFyIHByb2dWYXJcbiAgICBpZiAoaXNTdGF0aWMoZnJhZykgJiYgaXNTdGF0aWModmVydCkpIHtcbiAgICAgIHByb2dyYW0gPSBzaGFkZXJTdGF0ZS5wcm9ncmFtKHZlcnQuaWQsIGZyYWcuaWQpXG4gICAgICBwcm9nVmFyID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICByZXR1cm4gZW52LmxpbmsocHJvZ3JhbSlcbiAgICAgIH0pXG4gICAgfSBlbHNlIHtcbiAgICAgIHByb2dWYXIgPSBuZXcgRGVjbGFyYXRpb24oXG4gICAgICAgIChmcmFnICYmIGZyYWcudGhpc0RlcCkgfHwgKHZlcnQgJiYgdmVydC50aGlzRGVwKSxcbiAgICAgICAgKGZyYWcgJiYgZnJhZy5jb250ZXh0RGVwKSB8fCAodmVydCAmJiB2ZXJ0LmNvbnRleHREZXApLFxuICAgICAgICAoZnJhZyAmJiBmcmFnLnByb3BEZXApIHx8ICh2ZXJ0ICYmIHZlcnQucHJvcERlcCksXG4gICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgdmFyIFNIQURFUl9TVEFURSA9IGVudi5zaGFyZWQuc2hhZGVyXG4gICAgICAgICAgdmFyIGZyYWdJZFxuICAgICAgICAgIGlmIChmcmFnKSB7XG4gICAgICAgICAgICBmcmFnSWQgPSBmcmFnLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBmcmFnSWQgPSBzY29wZS5kZWYoU0hBREVSX1NUQVRFLCAnLicsIFNfRlJBRylcbiAgICAgICAgICB9XG4gICAgICAgICAgdmFyIHZlcnRJZFxuICAgICAgICAgIGlmICh2ZXJ0KSB7XG4gICAgICAgICAgICB2ZXJ0SWQgPSB2ZXJ0LmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2ZXJ0SWQgPSBzY29wZS5kZWYoU0hBREVSX1NUQVRFLCAnLicsIFNfVkVSVClcbiAgICAgICAgICB9XG4gICAgICAgICAgdmFyIHByb2dEZWYgPSBTSEFERVJfU1RBVEUgKyAnLnByb2dyYW0oJyArIHZlcnRJZCArICcsJyArIGZyYWdJZFxuICAgICAgICAgIFxuICAgICAgICAgIHJldHVybiBzY29wZS5kZWYocHJvZ0RlZiArICcpJylcbiAgICAgICAgfSlcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgZnJhZzogZnJhZyxcbiAgICAgIHZlcnQ6IHZlcnQsXG4gICAgICBwcm9nVmFyOiBwcm9nVmFyLFxuICAgICAgcHJvZ3JhbTogcHJvZ3JhbVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlRHJhdyAob3B0aW9ucywgZW52KSB7XG4gICAgdmFyIHN0YXRpY09wdGlvbnMgPSBvcHRpb25zLnN0YXRpY1xuICAgIHZhciBkeW5hbWljT3B0aW9ucyA9IG9wdGlvbnMuZHluYW1pY1xuXG4gICAgZnVuY3Rpb24gcGFyc2VFbGVtZW50cyAoKSB7XG4gICAgICBpZiAoU19FTEVNRU5UUyBpbiBzdGF0aWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBlbGVtZW50cyA9IHN0YXRpY09wdGlvbnNbU19FTEVNRU5UU11cbiAgICAgICAgaWYgKGlzQnVmZmVyQXJncyhlbGVtZW50cykpIHtcbiAgICAgICAgICBlbGVtZW50cyA9IGVsZW1lbnRTdGF0ZS5nZXRFbGVtZW50cyhlbGVtZW50U3RhdGUuY3JlYXRlKGVsZW1lbnRzLCB0cnVlKSlcbiAgICAgICAgfSBlbHNlIGlmIChlbGVtZW50cykge1xuICAgICAgICAgIGVsZW1lbnRzID0gZWxlbWVudFN0YXRlLmdldEVsZW1lbnRzKGVsZW1lbnRzKVxuICAgICAgICAgIFxuICAgICAgICB9XG4gICAgICAgIHZhciByZXN1bHQgPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgaWYgKGVsZW1lbnRzKSB7XG4gICAgICAgICAgICB2YXIgcmVzdWx0ID0gZW52LmxpbmsoZWxlbWVudHMpXG4gICAgICAgICAgICBlbnYuRUxFTUVOVFMgPSByZXN1bHRcbiAgICAgICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgICAgICB9XG4gICAgICAgICAgZW52LkVMRU1FTlRTID0gbnVsbFxuICAgICAgICAgIHJldHVybiBudWxsXG4gICAgICAgIH0pXG4gICAgICAgIHJlc3VsdC52YWx1ZSA9IGVsZW1lbnRzXG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH0gZWxzZSBpZiAoU19FTEVNRU5UUyBpbiBkeW5hbWljT3B0aW9ucykge1xuICAgICAgICB2YXIgZHluID0gZHluYW1pY09wdGlvbnNbU19FTEVNRU5UU11cbiAgICAgICAgcmV0dXJuIGNyZWF0ZUR5bmFtaWNEZWNsKGR5biwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuXG4gICAgICAgICAgdmFyIElTX0JVRkZFUl9BUkdTID0gc2hhcmVkLmlzQnVmZmVyQXJnc1xuICAgICAgICAgIHZhciBFTEVNRU5UX1NUQVRFID0gc2hhcmVkLmVsZW1lbnRzXG5cbiAgICAgICAgICB2YXIgZWxlbWVudERlZm4gPSBlbnYuaW52b2tlKHNjb3BlLCBkeW4pXG4gICAgICAgICAgdmFyIGVsZW1lbnRzID0gc2NvcGUuZGVmKCdudWxsJylcbiAgICAgICAgICB2YXIgZWxlbWVudFN0cmVhbSA9IHNjb3BlLmRlZihJU19CVUZGRVJfQVJHUywgJygnLCBlbGVtZW50RGVmbiwgJyknKVxuXG4gICAgICAgICAgdmFyIGlmdGUgPSBlbnYuY29uZChlbGVtZW50U3RyZWFtKVxuICAgICAgICAgICAgLnRoZW4oZWxlbWVudHMsICc9JywgRUxFTUVOVF9TVEFURSwgJy5jcmVhdGVTdHJlYW0oJywgZWxlbWVudERlZm4sICcpOycpXG4gICAgICAgICAgICAuZWxzZShlbGVtZW50cywgJz0nLCBFTEVNRU5UX1NUQVRFLCAnLmdldEVsZW1lbnRzKCcsIGVsZW1lbnREZWZuLCAnKTsnKVxuXG4gICAgICAgICAgXG5cbiAgICAgICAgICBzY29wZS5lbnRyeShpZnRlKVxuICAgICAgICAgIHNjb3BlLmV4aXQoXG4gICAgICAgICAgICBlbnYuY29uZChlbGVtZW50U3RyZWFtKVxuICAgICAgICAgICAgICAudGhlbihFTEVNRU5UX1NUQVRFLCAnLmRlc3Ryb3lTdHJlYW0oJywgZWxlbWVudHMsICcpOycpKVxuXG4gICAgICAgICAgZW52LkVMRU1FTlRTID0gZWxlbWVudHNcblxuICAgICAgICAgIHJldHVybiBlbGVtZW50c1xuICAgICAgICB9KVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cblxuICAgIHZhciBlbGVtZW50cyA9IHBhcnNlRWxlbWVudHMoKVxuXG4gICAgZnVuY3Rpb24gcGFyc2VQcmltaXRpdmUgKCkge1xuICAgICAgaWYgKFNfUFJJTUlUSVZFIGluIHN0YXRpY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIHByaW1pdGl2ZSA9IHN0YXRpY09wdGlvbnNbU19QUklNSVRJVkVdXG4gICAgICAgIFxuICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHJldHVybiBwcmltVHlwZXNbcHJpbWl0aXZlXVxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIGlmIChTX1BSSU1JVElWRSBpbiBkeW5hbWljT3B0aW9ucykge1xuICAgICAgICB2YXIgZHluUHJpbWl0aXZlID0gZHluYW1pY09wdGlvbnNbU19QUklNSVRJVkVdXG4gICAgICAgIHJldHVybiBjcmVhdGVEeW5hbWljRGVjbChkeW5QcmltaXRpdmUsIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgdmFyIFBSSU1fVFlQRVMgPSBlbnYuY29uc3RhbnRzLnByaW1UeXBlc1xuICAgICAgICAgIHZhciBwcmltID0gZW52Lmludm9rZShzY29wZSwgZHluUHJpbWl0aXZlKVxuICAgICAgICAgIFxuICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoUFJJTV9UWVBFUywgJ1snLCBwcmltLCAnXScpXG4gICAgICAgIH0pXG4gICAgICB9IGVsc2UgaWYgKGVsZW1lbnRzKSB7XG4gICAgICAgIGlmIChpc1N0YXRpYyhlbGVtZW50cykpIHtcbiAgICAgICAgICBpZiAoZWxlbWVudHMudmFsdWUpIHtcbiAgICAgICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoZW52LkVMRU1FTlRTLCAnLnByaW1UeXBlJylcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIEdMX1RSSUFOR0xFU1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIG5ldyBEZWNsYXJhdGlvbihcbiAgICAgICAgICAgIGVsZW1lbnRzLnRoaXNEZXAsXG4gICAgICAgICAgICBlbGVtZW50cy5jb250ZXh0RGVwLFxuICAgICAgICAgICAgZWxlbWVudHMucHJvcERlcCxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgICAgIHZhciBlbGVtZW50cyA9IGVudi5FTEVNRU5UU1xuICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKGVsZW1lbnRzLCAnPycsIGVsZW1lbnRzLCAnLnByaW1UeXBlOicsIEdMX1RSSUFOR0xFUylcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcGFyc2VQYXJhbSAocGFyYW0sIGlzT2Zmc2V0KSB7XG4gICAgICBpZiAocGFyYW0gaW4gc3RhdGljT3B0aW9ucykge1xuICAgICAgICB2YXIgdmFsdWUgPSBzdGF0aWNPcHRpb25zW3BhcmFtXSB8IDBcbiAgICAgICAgXG4gICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgaWYgKGlzT2Zmc2V0KSB7XG4gICAgICAgICAgICBlbnYuT0ZGU0VUID0gdmFsdWVcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHZhbHVlXG4gICAgICAgIH0pXG4gICAgICB9IGVsc2UgaWYgKHBhcmFtIGluIGR5bmFtaWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBkeW5WYWx1ZSA9IGR5bmFtaWNPcHRpb25zW3BhcmFtXVxuICAgICAgICByZXR1cm4gY3JlYXRlRHluYW1pY0RlY2woZHluVmFsdWUsIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgdmFyIHJlc3VsdCA9IGVudi5pbnZva2Uoc2NvcGUsIGR5blZhbHVlKVxuICAgICAgICAgIGlmIChpc09mZnNldCkge1xuICAgICAgICAgICAgZW52Lk9GRlNFVCA9IHJlc3VsdFxuICAgICAgICAgICAgXG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSBpZiAoaXNPZmZzZXQgJiYgZWxlbWVudHMpIHtcbiAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICBlbnYuT0ZGU0VUID0gJzAnXG4gICAgICAgICAgcmV0dXJuIDBcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuXG4gICAgdmFyIE9GRlNFVCA9IHBhcnNlUGFyYW0oU19PRkZTRVQsIHRydWUpXG5cbiAgICBmdW5jdGlvbiBwYXJzZVZlcnRDb3VudCAoKSB7XG4gICAgICBpZiAoU19DT1VOVCBpbiBzdGF0aWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBjb3VudCA9IHN0YXRpY09wdGlvbnNbU19DT1VOVF0gfCAwXG4gICAgICAgIFxuICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcmV0dXJuIGNvdW50XG4gICAgICAgIH0pXG4gICAgICB9IGVsc2UgaWYgKFNfQ09VTlQgaW4gZHluYW1pY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIGR5bkNvdW50ID0gZHluYW1pY09wdGlvbnNbU19DT1VOVF1cbiAgICAgICAgcmV0dXJuIGNyZWF0ZUR5bmFtaWNEZWNsKGR5bkNvdW50LCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciByZXN1bHQgPSBlbnYuaW52b2tlKHNjb3BlLCBkeW5Db3VudClcbiAgICAgICAgICBcbiAgICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICAgIH0pXG4gICAgICB9IGVsc2UgaWYgKGVsZW1lbnRzKSB7XG4gICAgICAgIGlmIChpc1N0YXRpYyhlbGVtZW50cykpIHtcbiAgICAgICAgICBpZiAoZWxlbWVudHMpIHtcbiAgICAgICAgICAgIGlmIChPRkZTRVQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG5ldyBEZWNsYXJhdGlvbihcbiAgICAgICAgICAgICAgICBPRkZTRVQudGhpc0RlcCxcbiAgICAgICAgICAgICAgICBPRkZTRVQuY29udGV4dERlcCxcbiAgICAgICAgICAgICAgICBPRkZTRVQucHJvcERlcCxcbiAgICAgICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgICAgICAgICAgdmFyIHJlc3VsdCA9IHNjb3BlLmRlZihcbiAgICAgICAgICAgICAgICAgICAgZW52LkVMRU1FTlRTLCAnLnZlcnRDb3VudC0nLCBlbnYuT0ZGU0VUKVxuXG4gICAgICAgICAgICAgICAgICBcblxuICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoZW52LkVMRU1FTlRTLCAnLnZlcnRDb3VudCcpXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciByZXN1bHQgPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIC0xXG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHZhciB2YXJpYWJsZSA9IG5ldyBEZWNsYXJhdGlvbihcbiAgICAgICAgICAgIGVsZW1lbnRzLnRoaXNEZXAgfHwgT0ZGU0VULnRoaXNEZXAsXG4gICAgICAgICAgICBlbGVtZW50cy5jb250ZXh0RGVwIHx8IE9GRlNFVC5jb250ZXh0RGVwLFxuICAgICAgICAgICAgZWxlbWVudHMucHJvcERlcCB8fCBPRkZTRVQucHJvcERlcCxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgICAgIHZhciBlbGVtZW50cyA9IGVudi5FTEVNRU5UU1xuICAgICAgICAgICAgICBpZiAoZW52Lk9GRlNFVCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoZWxlbWVudHMsICc/JywgZWxlbWVudHMsICcudmVydENvdW50LScsXG4gICAgICAgICAgICAgICAgICBlbnYuT0ZGU0VULCAnOi0xJylcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKGVsZW1lbnRzLCAnPycsIGVsZW1lbnRzLCAnLnZlcnRDb3VudDotMScpXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIFxuICAgICAgICAgIHJldHVybiB2YXJpYWJsZVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBlbGVtZW50czogZWxlbWVudHMsXG4gICAgICBwcmltaXRpdmU6IHBhcnNlUHJpbWl0aXZlKCksXG4gICAgICBjb3VudDogcGFyc2VWZXJ0Q291bnQoKSxcbiAgICAgIGluc3RhbmNlczogcGFyc2VQYXJhbShTX0lOU1RBTkNFUywgZmFsc2UpLFxuICAgICAgb2Zmc2V0OiBPRkZTRVRcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZUdMU3RhdGUgKG9wdGlvbnMsIGVudikge1xuICAgIHZhciBzdGF0aWNPcHRpb25zID0gb3B0aW9ucy5zdGF0aWNcbiAgICB2YXIgZHluYW1pY09wdGlvbnMgPSBvcHRpb25zLmR5bmFtaWNcblxuICAgIHZhciBTVEFURSA9IHt9XG5cbiAgICBHTF9TVEFURV9OQU1FUy5mb3JFYWNoKGZ1bmN0aW9uIChwcm9wKSB7XG4gICAgICB2YXIgcGFyYW0gPSBwcm9wTmFtZShwcm9wKVxuXG4gICAgICBmdW5jdGlvbiBwYXJzZVBhcmFtIChwYXJzZVN0YXRpYywgcGFyc2VEeW5hbWljKSB7XG4gICAgICAgIGlmIChwcm9wIGluIHN0YXRpY09wdGlvbnMpIHtcbiAgICAgICAgICB2YXIgdmFsdWUgPSBwYXJzZVN0YXRpYyhzdGF0aWNPcHRpb25zW3Byb3BdKVxuICAgICAgICAgIFNUQVRFW3BhcmFtXSA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHZhbHVlXG4gICAgICAgICAgfSlcbiAgICAgICAgfSBlbHNlIGlmIChwcm9wIGluIGR5bmFtaWNPcHRpb25zKSB7XG4gICAgICAgICAgdmFyIGR5biA9IGR5bmFtaWNPcHRpb25zW3Byb3BdXG4gICAgICAgICAgU1RBVEVbcGFyYW1dID0gY3JlYXRlRHluYW1pY0RlY2woZHluLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgICAgcmV0dXJuIHBhcnNlRHluYW1pYyhlbnYsIHNjb3BlLCBlbnYuaW52b2tlKHNjb3BlLCBkeW4pKVxuICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgc3dpdGNoIChwcm9wKSB7XG4gICAgICAgIGNhc2UgU19DVUxMX0VOQUJMRTpcbiAgICAgICAgY2FzZSBTX0JMRU5EX0VOQUJMRTpcbiAgICAgICAgY2FzZSBTX0RJVEhFUjpcbiAgICAgICAgY2FzZSBTX1NURU5DSUxfRU5BQkxFOlxuICAgICAgICBjYXNlIFNfREVQVEhfRU5BQkxFOlxuICAgICAgICBjYXNlIFNfU0NJU1NPUl9FTkFCTEU6XG4gICAgICAgIGNhc2UgU19QT0xZR09OX09GRlNFVF9FTkFCTEU6XG4gICAgICAgIGNhc2UgU19TQU1QTEVfQUxQSEE6XG4gICAgICAgIGNhc2UgU19TQU1QTEVfRU5BQkxFOlxuICAgICAgICBjYXNlIFNfREVQVEhfTUFTSzpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gdmFsdWVcbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX0RFUFRIX0ZVTkM6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBjb21wYXJlRnVuY3NbdmFsdWVdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIHZhciBDT01QQVJFX0ZVTkNTID0gZW52LmNvbnN0YW50cy5jb21wYXJlRnVuY3NcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoQ09NUEFSRV9GVU5DUywgJ1snLCB2YWx1ZSwgJ10nKVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfREVQVEhfUkFOR0U6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBcblxuICAgICAgICAgICAgICB2YXIgWl9ORUFSID0gc2NvcGUuZGVmKCcrJywgdmFsdWUsICdbMF0nKVxuICAgICAgICAgICAgICB2YXIgWl9GQVIgPSBzY29wZS5kZWYoJysnLCB2YWx1ZSwgJ1sxXScpXG4gICAgICAgICAgICAgIHJldHVybiBbWl9ORUFSLCBaX0ZBUl1cbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX0JMRU5EX0ZVTkM6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHZhciBzcmNSR0IgPSAoJ3NyY1JHQicgaW4gdmFsdWUgPyB2YWx1ZS5zcmNSR0IgOiB2YWx1ZS5zcmMpXG4gICAgICAgICAgICAgIHZhciBzcmNBbHBoYSA9ICgnc3JjQWxwaGEnIGluIHZhbHVlID8gdmFsdWUuc3JjQWxwaGEgOiB2YWx1ZS5zcmMpXG4gICAgICAgICAgICAgIHZhciBkc3RSR0IgPSAoJ2RzdFJHQicgaW4gdmFsdWUgPyB2YWx1ZS5kc3RSR0IgOiB2YWx1ZS5kc3QpXG4gICAgICAgICAgICAgIHZhciBkc3RBbHBoYSA9ICgnZHN0QWxwaGEnIGluIHZhbHVlID8gdmFsdWUuZHN0QWxwaGEgOiB2YWx1ZS5kc3QpXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICAgICAgYmxlbmRGdW5jc1tzcmNSR0JdLFxuICAgICAgICAgICAgICAgIGJsZW5kRnVuY3NbZHN0UkdCXSxcbiAgICAgICAgICAgICAgICBibGVuZEZ1bmNzW3NyY0FscGhhXSxcbiAgICAgICAgICAgICAgICBibGVuZEZ1bmNzW2RzdEFscGhhXVxuICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIHZhciBCTEVORF9GVU5DUyA9IGVudi5jb25zdGFudHMuYmxlbmRGdW5jc1xuXG4gICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgIGZ1bmN0aW9uIHJlYWQgKHByZWZpeCwgc3VmZml4KSB7XG4gICAgICAgICAgICAgICAgdmFyIGZ1bmMgPSBzY29wZS5kZWYoXG4gICAgICAgICAgICAgICAgICAnXCInLCBwcmVmaXgsIHN1ZmZpeCwgJ1wiIGluICcsIHZhbHVlLFxuICAgICAgICAgICAgICAgICAgJz8nLCB2YWx1ZSwgJy4nLCBwcmVmaXgsIHN1ZmZpeCxcbiAgICAgICAgICAgICAgICAgICc6JywgdmFsdWUsICcuJywgcHJlZml4KVxuXG4gICAgICAgICAgICAgICAgXG5cbiAgICAgICAgICAgICAgICByZXR1cm4gZnVuY1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgdmFyIHNyY1JHQiA9IHJlYWQoJ3NyYycsICdSR0InKVxuICAgICAgICAgICAgICB2YXIgZHN0UkdCID0gcmVhZCgnZHN0JywgJ1JHQicpXG5cbiAgICAgICAgICAgICAgXG5cbiAgICAgICAgICAgICAgdmFyIFNSQ19SR0IgPSBzY29wZS5kZWYoQkxFTkRfRlVOQ1MsICdbJywgc3JjUkdCLCAnXScpXG4gICAgICAgICAgICAgIHZhciBTUkNfQUxQSEEgPSBzY29wZS5kZWYoQkxFTkRfRlVOQ1MsICdbJywgcmVhZCgnc3JjJywgJ0FscGhhJyksICddJylcbiAgICAgICAgICAgICAgdmFyIERTVF9SR0IgPSBzY29wZS5kZWYoQkxFTkRfRlVOQ1MsICdbJywgZHN0UkdCLCAnXScpXG4gICAgICAgICAgICAgIHZhciBEU1RfQUxQSEEgPSBzY29wZS5kZWYoQkxFTkRfRlVOQ1MsICdbJywgcmVhZCgnZHN0JywgJ0FscGhhJyksICddJylcblxuICAgICAgICAgICAgICByZXR1cm4gW1NSQ19SR0IsIERTVF9SR0IsIFNSQ19BTFBIQSwgRFNUX0FMUEhBXVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfQkxFTkRfRVFVQVRJT046XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgICAgICAgYmxlbmRFcXVhdGlvbnNbdmFsdWVdLFxuICAgICAgICAgICAgICAgICAgYmxlbmRFcXVhdGlvbnNbdmFsdWVdXG4gICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgICAgICAgYmxlbmRFcXVhdGlvbnNbdmFsdWUucmdiXSxcbiAgICAgICAgICAgICAgICAgIGJsZW5kRXF1YXRpb25zW3ZhbHVlLmFscGhhXVxuICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICB2YXIgQkxFTkRfRVFVQVRJT05TID0gZW52LmNvbnN0YW50cy5ibGVuZEVxdWF0aW9uc1xuXG4gICAgICAgICAgICAgIHZhciBSR0IgPSBzY29wZS5kZWYoKVxuICAgICAgICAgICAgICB2YXIgQUxQSEEgPSBzY29wZS5kZWYoKVxuXG4gICAgICAgICAgICAgIHZhciBpZnRlID0gZW52LmNvbmQoJ3R5cGVvZiAnLCB2YWx1ZSwgJz09PVwic3RyaW5nXCInKVxuXG4gICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgIGlmdGUudGhlbihcbiAgICAgICAgICAgICAgICBSR0IsICc9JywgQUxQSEEsICc9JywgQkxFTkRfRVFVQVRJT05TLCAnWycsIHZhbHVlLCAnXTsnKVxuICAgICAgICAgICAgICBpZnRlLmVsc2UoXG4gICAgICAgICAgICAgICAgUkdCLCAnPScsIEJMRU5EX0VRVUFUSU9OUywgJ1snLCB2YWx1ZSwgJy5yZ2JdOycsXG4gICAgICAgICAgICAgICAgQUxQSEEsICc9JywgQkxFTkRfRVFVQVRJT05TLCAnWycsIHZhbHVlLCAnLmFscGhhXTsnKVxuXG4gICAgICAgICAgICAgIHNjb3BlKGlmdGUpXG5cbiAgICAgICAgICAgICAgcmV0dXJuIFtSR0IsIEFMUEhBXVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfQkxFTkRfQ09MT1I6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBsb29wKDQsIGZ1bmN0aW9uIChpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICt2YWx1ZVtpXVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIGxvb3AoNCwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKCcrJywgdmFsdWUsICdbJywgaSwgJ10nKVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfU1RFTkNJTF9NQVNLOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gdmFsdWUgfCAwXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKHZhbHVlLCAnfDAnKVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfU1RFTkNJTF9GVU5DOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICB2YXIgY21wID0gdmFsdWUuY21wIHx8ICdrZWVwJ1xuICAgICAgICAgICAgICB2YXIgcmVmID0gdmFsdWUucmVmIHx8IDBcbiAgICAgICAgICAgICAgdmFyIG1hc2sgPSAnbWFzaycgaW4gdmFsdWUgPyB2YWx1ZS5tYXNrIDogLTFcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgICBjb21wYXJlRnVuY3NbY21wXSxcbiAgICAgICAgICAgICAgICByZWYsXG4gICAgICAgICAgICAgICAgbWFza1xuICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIHZhciBDT01QQVJFX0ZVTkNTID0gZW52LmNvbnN0YW50cy5jb21wYXJlRnVuY3NcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHZhciBjbXAgPSBzY29wZS5kZWYoXG4gICAgICAgICAgICAgICAgJ1wiY21wXCIgaW4gJywgdmFsdWUsXG4gICAgICAgICAgICAgICAgJz8nLCBDT01QQVJFX0ZVTkNTLCAnWycsIHZhbHVlLCAnLmNtcF0nLFxuICAgICAgICAgICAgICAgICc6JywgR0xfS0VFUClcbiAgICAgICAgICAgICAgdmFyIHJlZiA9IHNjb3BlLmRlZih2YWx1ZSwgJy5yZWZ8MCcpXG4gICAgICAgICAgICAgIHZhciBtYXNrID0gc2NvcGUuZGVmKFxuICAgICAgICAgICAgICAgICdcIm1hc2tcIiBpbiAnLCB2YWx1ZSxcbiAgICAgICAgICAgICAgICAnPycsIHZhbHVlLCAnLm1hc2t8MDotMScpXG4gICAgICAgICAgICAgIHJldHVybiBbY21wLCByZWYsIG1hc2tdXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19TVEVOQ0lMX09QRlJPTlQ6XG4gICAgICAgIGNhc2UgU19TVEVOQ0lMX09QQkFDSzpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgdmFyIGZhaWwgPSB2YWx1ZS5mYWlsIHx8ICdrZWVwJ1xuICAgICAgICAgICAgICB2YXIgemZhaWwgPSB2YWx1ZS56ZmFpbCB8fCAna2VlcCdcbiAgICAgICAgICAgICAgdmFyIHpwYXNzID0gdmFsdWUuenBhc3MgfHwgJ2tlZXAnXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICAgICAgcHJvcCA9PT0gU19TVEVOQ0lMX09QQkFDSyA/IEdMX0JBQ0sgOiBHTF9GUk9OVCxcbiAgICAgICAgICAgICAgICBzdGVuY2lsT3BzW2ZhaWxdLFxuICAgICAgICAgICAgICAgIHN0ZW5jaWxPcHNbemZhaWxdLFxuICAgICAgICAgICAgICAgIHN0ZW5jaWxPcHNbenBhc3NdXG4gICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgdmFyIFNURU5DSUxfT1BTID0gZW52LmNvbnN0YW50cy5zdGVuY2lsT3BzXG5cbiAgICAgICAgICAgICAgXG5cbiAgICAgICAgICAgICAgZnVuY3Rpb24gcmVhZCAobmFtZSkge1xuICAgICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihcbiAgICAgICAgICAgICAgICAgICdcIicsIG5hbWUsICdcIiBpbiAnLCB2YWx1ZSxcbiAgICAgICAgICAgICAgICAgICc/JywgU1RFTkNJTF9PUFMsICdbJywgdmFsdWUsICcuJywgbmFtZSwgJ106JyxcbiAgICAgICAgICAgICAgICAgIEdMX0tFRVApXG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgICAgIHByb3AgPT09IFNfU1RFTkNJTF9PUEJBQ0sgPyBHTF9CQUNLIDogR0xfRlJPTlQsXG4gICAgICAgICAgICAgICAgcmVhZCgnZmFpbCcpLFxuICAgICAgICAgICAgICAgIHJlYWQoJ3pmYWlsJyksXG4gICAgICAgICAgICAgICAgcmVhZCgnenBhc3MnKVxuICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19QT0xZR09OX09GRlNFVF9PRkZTRVQ6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHZhciBmYWN0b3IgPSB2YWx1ZS5mYWN0b3IgfCAwXG4gICAgICAgICAgICAgIHZhciB1bml0cyA9IHZhbHVlLnVuaXRzIHwgMFxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBbZmFjdG9yLCB1bml0c11cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgXG5cbiAgICAgICAgICAgICAgdmFyIEZBQ1RPUiA9IHNjb3BlLmRlZih2YWx1ZSwgJy5mYWN0b3J8MCcpXG4gICAgICAgICAgICAgIHZhciBVTklUUyA9IHNjb3BlLmRlZih2YWx1ZSwgJy51bml0c3wwJylcblxuICAgICAgICAgICAgICByZXR1cm4gW0ZBQ1RPUiwgVU5JVFNdXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19DVUxMX0ZBQ0U6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgdmFyIGZhY2UgPSAwXG4gICAgICAgICAgICAgIGlmICh2YWx1ZSA9PT0gJ2Zyb250Jykge1xuICAgICAgICAgICAgICAgIGZhY2UgPSBHTF9GUk9OVFxuICAgICAgICAgICAgICB9IGVsc2UgaWYgKHZhbHVlID09PSAnYmFjaycpIHtcbiAgICAgICAgICAgICAgICBmYWNlID0gR0xfQkFDS1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gZmFjZVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZih2YWx1ZSwgJz09PVwiZnJvbnRcIj8nLCBHTF9GUk9OVCwgJzonLCBHTF9CQUNLKVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfTElORV9XSURUSDpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfRlJPTlRfRkFDRTpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIG9yaWVudGF0aW9uVHlwZVt2YWx1ZV1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYodmFsdWUgKyAnPT09XCJjd1wiPycgKyBHTF9DVyArICc6JyArIEdMX0NDVylcbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX0NPTE9SX01BU0s6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZS5tYXAoZnVuY3Rpb24gKHYpIHsgcmV0dXJuICEhdiB9KVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIGxvb3AoNCwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gJyEhJyArIHZhbHVlICsgJ1snICsgaSArICddJ1xuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfU0FNUExFX0NPVkVSQUdFOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICB2YXIgc2FtcGxlVmFsdWUgPSAndmFsdWUnIGluIHZhbHVlID8gdmFsdWUudmFsdWUgOiAxXG4gICAgICAgICAgICAgIHZhciBzYW1wbGVJbnZlcnQgPSAhIXZhbHVlLmludmVydFxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIFtzYW1wbGVWYWx1ZSwgc2FtcGxlSW52ZXJ0XVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgdmFyIFZBTFVFID0gc2NvcGUuZGVmKFxuICAgICAgICAgICAgICAgICdcInZhbHVlXCIgaW4gJywgdmFsdWUsICc/KycsIHZhbHVlLCAnLnZhbHVlOjEnKVxuICAgICAgICAgICAgICB2YXIgSU5WRVJUID0gc2NvcGUuZGVmKCchIScsIHZhbHVlLCAnLmludmVydCcpXG4gICAgICAgICAgICAgIHJldHVybiBbVkFMVUUsIElOVkVSVF1cbiAgICAgICAgICAgIH0pXG4gICAgICB9XG4gICAgfSlcblxuICAgIHJldHVybiBTVEFURVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VVbmlmb3JtcyAodW5pZm9ybXMsIGVudikge1xuICAgIHZhciBzdGF0aWNVbmlmb3JtcyA9IHVuaWZvcm1zLnN0YXRpY1xuICAgIHZhciBkeW5hbWljVW5pZm9ybXMgPSB1bmlmb3Jtcy5keW5hbWljXG5cbiAgICB2YXIgVU5JRk9STVMgPSB7fVxuXG4gICAgT2JqZWN0LmtleXMoc3RhdGljVW5pZm9ybXMpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHZhciB2YWx1ZSA9IHN0YXRpY1VuaWZvcm1zW25hbWVdXG4gICAgICB2YXIgcmVzdWx0XG4gICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyB8fFxuICAgICAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgIHJlc3VsdCA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHJldHVybiB2YWx1ZVxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgdmFsdWUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgdmFyIHJlZ2xUeXBlID0gdmFsdWUuX3JlZ2xUeXBlXG4gICAgICAgIGlmIChyZWdsVHlwZSA9PT0gJ3RleHR1cmUyZCcgfHxcbiAgICAgICAgICAgIHJlZ2xUeXBlID09PSAndGV4dHVyZUN1YmUnKSB7XG4gICAgICAgICAgcmVzdWx0ID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52KSB7XG4gICAgICAgICAgICByZXR1cm4gZW52LmxpbmsodmFsdWUpXG4gICAgICAgICAgfSlcbiAgICAgICAgfSBlbHNlIGlmIChyZWdsVHlwZSA9PT0gJ2ZyYW1lYnVmZmVyJyB8fFxuICAgICAgICAgICAgICAgICAgIHJlZ2xUeXBlID09PSAnZnJhbWVidWZmZXJDdWJlJykge1xuICAgICAgICAgIFxuICAgICAgICAgIHJlc3VsdCA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudikge1xuICAgICAgICAgICAgcmV0dXJuIGVudi5saW5rKHZhbHVlLmNvbG9yWzBdKVxuICAgICAgICAgIH0pXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoaXNBcnJheUxpa2UodmFsdWUpKSB7XG4gICAgICAgIHJlc3VsdCA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudikge1xuICAgICAgICAgIHZhciBJVEVNID0gZW52Lmdsb2JhbC5kZWYoJ1snLFxuICAgICAgICAgICAgbG9vcCh2YWx1ZS5sZW5ndGgsIGZ1bmN0aW9uIChpKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gdmFsdWVbaV1cbiAgICAgICAgICAgIH0pLCAnXScpXG4gICAgICAgICAgcmV0dXJuIElURU1cbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIFxuICAgICAgfVxuICAgICAgcmVzdWx0LnZhbHVlID0gdmFsdWVcbiAgICAgIFVOSUZPUk1TW25hbWVdID0gcmVzdWx0XG4gICAgfSlcblxuICAgIE9iamVjdC5rZXlzKGR5bmFtaWNVbmlmb3JtcykuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICB2YXIgZHluID0gZHluYW1pY1VuaWZvcm1zW2tleV1cbiAgICAgIFVOSUZPUk1TW2tleV0gPSBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgIHJldHVybiBlbnYuaW52b2tlKHNjb3BlLCBkeW4pXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICByZXR1cm4gVU5JRk9STVNcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlQXR0cmlidXRlcyAoYXR0cmlidXRlcywgZW52KSB7XG4gICAgdmFyIHN0YXRpY0F0dHJpYnV0ZXMgPSBhdHRyaWJ1dGVzLnN0YXRpY1xuICAgIHZhciBkeW5hbWljQXR0cmlidXRlcyA9IGF0dHJpYnV0ZXMuZHluYW1pY1xuXG4gICAgdmFyIGF0dHJpYnV0ZURlZnMgPSB7fVxuXG4gICAgT2JqZWN0LmtleXMoc3RhdGljQXR0cmlidXRlcykuZm9yRWFjaChmdW5jdGlvbiAoYXR0cmlidXRlKSB7XG4gICAgICB2YXIgdmFsdWUgPSBzdGF0aWNBdHRyaWJ1dGVzW2F0dHJpYnV0ZV1cbiAgICAgIHZhciBpZCA9IHN0cmluZ1N0b3JlLmlkKGF0dHJpYnV0ZSlcblxuICAgICAgdmFyIHJlY29yZCA9IG5ldyBBdHRyaWJ1dGVSZWNvcmQoKVxuICAgICAgaWYgKGlzQnVmZmVyQXJncyh2YWx1ZSkpIHtcbiAgICAgICAgcmVjb3JkLnN0YXRlID0gQVRUUklCX1NUQVRFX1BPSU5URVJcbiAgICAgICAgcmVjb3JkLmJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmdldEJ1ZmZlcihcbiAgICAgICAgICBidWZmZXJTdGF0ZS5jcmVhdGUodmFsdWUsIEdMX0FSUkFZX0JVRkZFUiwgZmFsc2UsIHRydWUpKVxuICAgICAgICByZWNvcmQudHlwZSA9IDBcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBidWZmZXIgPSBidWZmZXJTdGF0ZS5nZXRCdWZmZXIodmFsdWUpXG4gICAgICAgIGlmIChidWZmZXIpIHtcbiAgICAgICAgICByZWNvcmQuc3RhdGUgPSBBVFRSSUJfU1RBVEVfUE9JTlRFUlxuICAgICAgICAgIHJlY29yZC5idWZmZXIgPSBidWZmZXJcbiAgICAgICAgICByZWNvcmQudHlwZSA9IDBcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBcbiAgICAgICAgICBpZiAodmFsdWUuY29uc3RhbnQpIHtcbiAgICAgICAgICAgIHZhciBjb25zdGFudCA9IHZhbHVlLmNvbnN0YW50XG4gICAgICAgICAgICByZWNvcmQuYnVmZmVyID0gJ251bGwnXG4gICAgICAgICAgICByZWNvcmQuc3RhdGUgPSBBVFRSSUJfU1RBVEVfQ09OU1RBTlRcbiAgICAgICAgICAgIGlmICh0eXBlb2YgY29uc3RhbnQgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICAgIHJlY29yZC54ID0gY29uc3RhbnRcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBDVVRFX0NPTVBPTkVOVFMuZm9yRWFjaChmdW5jdGlvbiAoYywgaSkge1xuICAgICAgICAgICAgICAgIGlmIChpIDwgY29uc3RhbnQubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICByZWNvcmRbY10gPSBjb25zdGFudFtpXVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKGlzQnVmZmVyQXJncyh2YWx1ZS5idWZmZXIpKSB7XG4gICAgICAgICAgICAgIGJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmdldEJ1ZmZlcihcbiAgICAgICAgICAgICAgICBidWZmZXJTdGF0ZS5jcmVhdGUodmFsdWUuYnVmZmVyLCBHTF9BUlJBWV9CVUZGRVIsIGZhbHNlLCB0cnVlKSlcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmdldEJ1ZmZlcih2YWx1ZS5idWZmZXIpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcblxuICAgICAgICAgICAgdmFyIG9mZnNldCA9IHZhbHVlLm9mZnNldCB8IDBcbiAgICAgICAgICAgIFxuXG4gICAgICAgICAgICB2YXIgc3RyaWRlID0gdmFsdWUuc3RyaWRlIHwgMFxuICAgICAgICAgICAgXG5cbiAgICAgICAgICAgIHZhciBzaXplID0gdmFsdWUuc2l6ZSB8IDBcbiAgICAgICAgICAgIFxuXG4gICAgICAgICAgICB2YXIgbm9ybWFsaXplZCA9ICEhdmFsdWUubm9ybWFsaXplZFxuXG4gICAgICAgICAgICB2YXIgdHlwZSA9IDBcbiAgICAgICAgICAgIGlmICgndHlwZScgaW4gdmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHR5cGUgPSBnbFR5cGVzW3ZhbHVlLnR5cGVdXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBkaXZpc29yID0gdmFsdWUuZGl2aXNvciB8IDBcbiAgICAgICAgICAgIGlmICgnZGl2aXNvcicgaW4gdmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBcblxuICAgICAgICAgICAgcmVjb3JkLmJ1ZmZlciA9IGJ1ZmZlclxuICAgICAgICAgICAgcmVjb3JkLnN0YXRlID0gQVRUUklCX1NUQVRFX1BPSU5URVJcbiAgICAgICAgICAgIHJlY29yZC5zaXplID0gc2l6ZVxuICAgICAgICAgICAgcmVjb3JkLm5vcm1hbGl6ZWQgPSBub3JtYWxpemVkXG4gICAgICAgICAgICByZWNvcmQudHlwZSA9IHR5cGUgfHwgYnVmZmVyLmR0eXBlXG4gICAgICAgICAgICByZWNvcmQub2Zmc2V0ID0gb2Zmc2V0XG4gICAgICAgICAgICByZWNvcmQuc3RyaWRlID0gc3RyaWRlXG4gICAgICAgICAgICByZWNvcmQuZGl2aXNvciA9IGRpdmlzb3JcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgYXR0cmlidXRlRGVmc1thdHRyaWJ1dGVdID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICB2YXIgY2FjaGUgPSBlbnYuYXR0cmliQ2FjaGVcbiAgICAgICAgaWYgKGlkIGluIGNhY2hlKSB7XG4gICAgICAgICAgcmV0dXJuIGNhY2hlW2lkXVxuICAgICAgICB9XG4gICAgICAgIHZhciByZXN1bHQgPSB7XG4gICAgICAgICAgaXNTdHJlYW06IGZhbHNlXG4gICAgICAgIH1cbiAgICAgICAgT2JqZWN0LmtleXMocmVjb3JkKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgICByZXN1bHRba2V5XSA9IHJlY29yZFtrZXldXG4gICAgICAgIH0pXG4gICAgICAgIGlmIChyZWNvcmQuYnVmZmVyKSB7XG4gICAgICAgICAgcmVzdWx0LmJ1ZmZlciA9IGVudi5saW5rKHJlY29yZC5idWZmZXIpXG4gICAgICAgICAgcmVzdWx0LnR5cGUgPSByZXN1bHQudHlwZSB8fCAocmVzdWx0LmJ1ZmZlciArICcuZHR5cGUnKVxuICAgICAgICB9XG4gICAgICAgIGNhY2hlW2lkXSA9IHJlc3VsdFxuICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBPYmplY3Qua2V5cyhkeW5hbWljQXR0cmlidXRlcykuZm9yRWFjaChmdW5jdGlvbiAoYXR0cmlidXRlKSB7XG4gICAgICB2YXIgZHluID0gZHluYW1pY0F0dHJpYnV0ZXNbYXR0cmlidXRlXVxuXG4gICAgICBmdW5jdGlvbiBhcHBlbmRBdHRyaWJ1dGVDb2RlIChlbnYsIGJsb2NrKSB7XG4gICAgICAgIHZhciBWQUxVRSA9IGVudi5pbnZva2UoYmxvY2ssIGR5bilcblxuICAgICAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuXG4gICAgICAgIHZhciBJU19CVUZGRVJfQVJHUyA9IHNoYXJlZC5pc0J1ZmZlckFyZ3NcbiAgICAgICAgdmFyIEJVRkZFUl9TVEFURSA9IHNoYXJlZC5idWZmZXJcblxuICAgICAgICAvLyBQZXJmb3JtIHZhbGlkYXRpb24gb24gYXR0cmlidXRlXG4gICAgICAgIFxuXG4gICAgICAgIC8vIGFsbG9jYXRlIG5hbWVzIGZvciByZXN1bHRcbiAgICAgICAgdmFyIHJlc3VsdCA9IHtcbiAgICAgICAgICBpc1N0cmVhbTogYmxvY2suZGVmKGZhbHNlKVxuICAgICAgICB9XG4gICAgICAgIHZhciBkZWZhdWx0UmVjb3JkID0gbmV3IEF0dHJpYnV0ZVJlY29yZCgpXG4gICAgICAgIGRlZmF1bHRSZWNvcmQuc3RhdGUgPSBBVFRSSUJfU1RBVEVfUE9JTlRFUlxuICAgICAgICBPYmplY3Qua2V5cyhkZWZhdWx0UmVjb3JkKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgICByZXN1bHRba2V5XSA9IGJsb2NrLmRlZignJyArIGRlZmF1bHRSZWNvcmRba2V5XSlcbiAgICAgICAgfSlcblxuICAgICAgICB2YXIgQlVGRkVSID0gcmVzdWx0LmJ1ZmZlclxuICAgICAgICB2YXIgVFlQRSA9IHJlc3VsdC50eXBlXG4gICAgICAgIGJsb2NrKFxuICAgICAgICAgICdpZignLCBJU19CVUZGRVJfQVJHUywgJygnLCBWQUxVRSwgJykpeycsXG4gICAgICAgICAgcmVzdWx0LmlzU3RyZWFtLCAnPXRydWU7JyxcbiAgICAgICAgICBCVUZGRVIsICc9JywgQlVGRkVSX1NUQVRFLCAnLmNyZWF0ZVN0cmVhbSgnLCBHTF9BUlJBWV9CVUZGRVIsICcsJywgVkFMVUUsICcpOycsXG4gICAgICAgICAgVFlQRSwgJz0nLCBCVUZGRVIsICcuZHR5cGU7JyxcbiAgICAgICAgICAnfWVsc2V7JyxcbiAgICAgICAgICBCVUZGRVIsICc9JywgQlVGRkVSX1NUQVRFLCAnLmdldEJ1ZmZlcignLCBWQUxVRSwgJyk7JyxcbiAgICAgICAgICAnaWYoJywgQlVGRkVSLCAnKXsnLFxuICAgICAgICAgIFRZUEUsICc9JywgQlVGRkVSLCAnLmR0eXBlOycsXG4gICAgICAgICAgJ31lbHNlIGlmKFwiY29uc3RhbnRcIiBpbiAnLCBWQUxVRSwgJyl7JyxcbiAgICAgICAgICByZXN1bHQuc3RhdGUsICc9JywgQVRUUklCX1NUQVRFX0NPTlNUQU5ULCAnOycsXG4gICAgICAgICAgJ2lmKHR5cGVvZiAnICsgVkFMVUUgKyAnLmNvbnN0YW50ID09PSBcIm51bWJlclwiKXsnLFxuICAgICAgICAgIHJlc3VsdFtDVVRFX0NPTVBPTkVOVFNbMF1dLCAnPScsIFZBTFVFLCAnLmNvbnN0YW50OycsXG4gICAgICAgICAgQ1VURV9DT01QT05FTlRTLnNsaWNlKDEpLm1hcChmdW5jdGlvbiAobikge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdFtuXVxuICAgICAgICAgIH0pLmpvaW4oJz0nKSwgJz0wOycsXG4gICAgICAgICAgJ31lbHNleycsXG4gICAgICAgICAgQ1VURV9DT01QT05FTlRTLm1hcChmdW5jdGlvbiAobmFtZSwgaSkge1xuICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgcmVzdWx0W25hbWVdICsgJz0nICsgVkFMVUUgKyAnLmNvbnN0YW50Lmxlbmd0aD49JyArIGkgK1xuICAgICAgICAgICAgICAnPycgKyBWQUxVRSArICcuY29uc3RhbnRbJyArIGkgKyAnXTowOydcbiAgICAgICAgICAgIClcbiAgICAgICAgICB9KS5qb2luKCcnKSxcbiAgICAgICAgICAnfX1lbHNleycsXG4gICAgICAgICAgJ2lmKCcsIElTX0JVRkZFUl9BUkdTLCAnKCcsIFZBTFVFLCAnLmJ1ZmZlcikpeycsXG4gICAgICAgICAgQlVGRkVSLCAnPScsIEJVRkZFUl9TVEFURSwgJy5jcmVhdGVTdHJlYW0oJywgR0xfQVJSQVlfQlVGRkVSLCAnLCcsIFZBTFVFLCAnLmJ1ZmZlcik7JyxcbiAgICAgICAgICAnfWVsc2V7JyxcbiAgICAgICAgICBCVUZGRVIsICc9JywgQlVGRkVSX1NUQVRFLCAnLmdldEJ1ZmZlcignLCBWQUxVRSwgJy5idWZmZXIpOycsXG4gICAgICAgICAgJ30nLFxuICAgICAgICAgIFRZUEUsICc9XCJ0eXBlXCIgaW4gJywgVkFMVUUsICc/JyxcbiAgICAgICAgICBzaGFyZWQuZ2xUeXBlcywgJ1snLCBWQUxVRSwgJy50eXBlXTonLCBCVUZGRVIsICcuZHR5cGU7JyxcbiAgICAgICAgICByZXN1bHQubm9ybWFsaXplZCwgJz0hIScsIFZBTFVFLCAnLm5vcm1hbGl6ZWQ7JylcbiAgICAgICAgZnVuY3Rpb24gZW1pdFJlYWRSZWNvcmQgKG5hbWUpIHtcbiAgICAgICAgICBibG9jayhyZXN1bHRbbmFtZV0sICc9JywgVkFMVUUsICcuJywgbmFtZSwgJ3wwOycpXG4gICAgICAgIH1cbiAgICAgICAgZW1pdFJlYWRSZWNvcmQoJ3NpemUnKVxuICAgICAgICBlbWl0UmVhZFJlY29yZCgnb2Zmc2V0JylcbiAgICAgICAgZW1pdFJlYWRSZWNvcmQoJ3N0cmlkZScpXG4gICAgICAgIGVtaXRSZWFkUmVjb3JkKCdkaXZpc29yJylcblxuICAgICAgICBibG9jaygnfX0nKVxuXG4gICAgICAgIGJsb2NrLmV4aXQoXG4gICAgICAgICAgJ2lmKCcsIHJlc3VsdC5pc1N0cmVhbSwgJyl7JyxcbiAgICAgICAgICBCVUZGRVJfU1RBVEUsICcuZGVzdHJveVN0cmVhbSgnLCBCVUZGRVIsICcpOycsXG4gICAgICAgICAgJ30nKVxuXG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH1cblxuICAgICAgYXR0cmlidXRlRGVmc1thdHRyaWJ1dGVdID0gY3JlYXRlRHluYW1pY0RlY2woZHluLCBhcHBlbmRBdHRyaWJ1dGVDb2RlKVxuICAgIH0pXG5cbiAgICByZXR1cm4gYXR0cmlidXRlRGVmc1xuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VDb250ZXh0IChjb250ZXh0KSB7XG4gICAgdmFyIHN0YXRpY0NvbnRleHQgPSBjb250ZXh0LnN0YXRpY1xuICAgIHZhciBkeW5hbWljQ29udGV4dCA9IGNvbnRleHQuZHluYW1pY1xuICAgIHZhciByZXN1bHQgPSB7fVxuXG4gICAgT2JqZWN0LmtleXMoc3RhdGljQ29udGV4dCkuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgdmFyIHZhbHVlID0gc3RhdGljQ29udGV4dFtuYW1lXVxuICAgICAgcmVzdWx0W25hbWVdID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyB8fCB0eXBlb2YgdmFsdWUgPT09ICdib29sZWFuJykge1xuICAgICAgICAgIHJldHVybiAnJyArIHZhbHVlXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIGVudi5saW5rKHZhbHVlKVxuICAgICAgICB9XG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBPYmplY3Qua2V5cyhkeW5hbWljQ29udGV4dCkuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgdmFyIGR5biA9IGR5bmFtaWNDb250ZXh0W25hbWVdXG4gICAgICByZXN1bHRbbmFtZV0gPSBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgIHJldHVybiBlbnYuaW52b2tlKHNjb3BlLCBkeW4pXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICByZXR1cm4gcmVzdWx0XG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZUFyZ3VtZW50cyAob3B0aW9ucywgYXR0cmlidXRlcywgdW5pZm9ybXMsIGNvbnRleHQsIGVudikge1xuICAgIHZhciBzdGF0aWNPcHRpb25zID0gb3B0aW9ucy5zdGF0aWNcbiAgICB2YXIgZHluYW1pY09wdGlvbnMgPSBvcHRpb25zLmR5bmFtaWNcblxuICAgIFxuXG4gICAgdmFyIGZyYW1lYnVmZmVyID0gcGFyc2VGcmFtZWJ1ZmZlcihvcHRpb25zLCBlbnYpXG4gICAgdmFyIHZpZXdwb3J0QW5kU2Npc3NvciA9IHBhcnNlVmlld3BvcnRTY2lzc29yKG9wdGlvbnMsIGZyYW1lYnVmZmVyLCBlbnYpXG4gICAgdmFyIGRyYXcgPSBwYXJzZURyYXcob3B0aW9ucywgZW52KVxuICAgIHZhciBzdGF0ZSA9IHBhcnNlR0xTdGF0ZShvcHRpb25zLCBlbnYpXG4gICAgdmFyIHNoYWRlciA9IHBhcnNlUHJvZ3JhbShvcHRpb25zLCBlbnYpXG5cbiAgICBmdW5jdGlvbiBjb3B5Qm94IChuYW1lKSB7XG4gICAgICB2YXIgZGVmbiA9IHZpZXdwb3J0QW5kU2Npc3NvcltuYW1lXVxuICAgICAgaWYgKGRlZm4pIHtcbiAgICAgICAgc3RhdGVbbmFtZV0gPSBkZWZuXG4gICAgICB9XG4gICAgfVxuICAgIGNvcHlCb3goU19WSUVXUE9SVClcbiAgICBjb3B5Qm94KHByb3BOYW1lKFNfU0NJU1NPUl9CT1gpKVxuXG4gICAgdmFyIGRpcnR5ID0gT2JqZWN0LmtleXMoc3RhdGUpLmxlbmd0aCA+IDBcblxuICAgIHZhciByZXN1bHQgPSB7XG4gICAgICBmcmFtZWJ1ZmZlcjogZnJhbWVidWZmZXIsXG4gICAgICBkcmF3OiBkcmF3LFxuICAgICAgc2hhZGVyOiBzaGFkZXIsXG4gICAgICBzdGF0ZTogc3RhdGUsXG4gICAgICBkaXJ0eTogZGlydHlcbiAgICB9XG5cbiAgICByZXN1bHQucHJvZmlsZSA9IHBhcnNlUHJvZmlsZShvcHRpb25zLCBlbnYpXG4gICAgcmVzdWx0LnVuaWZvcm1zID0gcGFyc2VVbmlmb3Jtcyh1bmlmb3JtcywgZW52KVxuICAgIHJlc3VsdC5hdHRyaWJ1dGVzID0gcGFyc2VBdHRyaWJ1dGVzKGF0dHJpYnV0ZXMsIGVudilcbiAgICByZXN1bHQuY29udGV4dCA9IHBhcnNlQ29udGV4dChjb250ZXh0LCBlbnYpXG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBDT01NT04gVVBEQVRFIEZVTkNUSU9OU1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIGVtaXRDb250ZXh0IChlbnYsIHNjb3BlLCBjb250ZXh0KSB7XG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcbiAgICB2YXIgQ09OVEVYVCA9IHNoYXJlZC5jb250ZXh0XG5cbiAgICB2YXIgY29udGV4dEVudGVyID0gZW52LnNjb3BlKClcblxuICAgIE9iamVjdC5rZXlzKGNvbnRleHQpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHNjb3BlLnNhdmUoQ09OVEVYVCwgJy4nICsgbmFtZSlcbiAgICAgIHZhciBkZWZuID0gY29udGV4dFtuYW1lXVxuICAgICAgY29udGV4dEVudGVyKENPTlRFWFQsICcuJywgbmFtZSwgJz0nLCBkZWZuLmFwcGVuZChlbnYsIHNjb3BlKSwgJzsnKVxuICAgIH0pXG5cbiAgICBzY29wZShjb250ZXh0RW50ZXIpXG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIENPTU1PTiBEUkFXSU5HIEZVTkNUSU9OU1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIGVtaXRQb2xsRnJhbWVidWZmZXIgKGVudiwgc2NvcGUsIGZyYW1lYnVmZmVyLCBza2lwQ2hlY2spIHtcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuXG4gICAgdmFyIEdMID0gc2hhcmVkLmdsXG4gICAgdmFyIEZSQU1FQlVGRkVSX1NUQVRFID0gc2hhcmVkLmZyYW1lYnVmZmVyXG4gICAgdmFyIEVYVF9EUkFXX0JVRkZFUlNcbiAgICBpZiAoZXh0RHJhd0J1ZmZlcnMpIHtcbiAgICAgIEVYVF9EUkFXX0JVRkZFUlMgPSBzY29wZS5kZWYoc2hhcmVkLmV4dGVuc2lvbnMsICcud2ViZ2xfZHJhd19idWZmZXJzJylcbiAgICB9XG5cbiAgICB2YXIgY29uc3RhbnRzID0gZW52LmNvbnN0YW50c1xuXG4gICAgdmFyIERSQVdfQlVGRkVSUyA9IGNvbnN0YW50cy5kcmF3QnVmZmVyXG4gICAgdmFyIEJBQ0tfQlVGRkVSID0gY29uc3RhbnRzLmJhY2tCdWZmZXJcblxuICAgIHZhciBORVhUXG4gICAgaWYgKGZyYW1lYnVmZmVyKSB7XG4gICAgICBORVhUID0gZnJhbWVidWZmZXIuYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgfSBlbHNlIHtcbiAgICAgIE5FWFQgPSBzY29wZS5kZWYoRlJBTUVCVUZGRVJfU1RBVEUsICcubmV4dCcpXG4gICAgfVxuXG4gICAgaWYgKCFza2lwQ2hlY2spIHtcbiAgICAgIHNjb3BlKCdpZignLCBORVhULCAnIT09JywgRlJBTUVCVUZGRVJfU1RBVEUsICcuY3VyKXsnKVxuICAgIH1cbiAgICBzY29wZShcbiAgICAgICdpZignLCBORVhULCAnKXsnLFxuICAgICAgR0wsICcuYmluZEZyYW1lYnVmZmVyKCcsIEdMX0ZSQU1FQlVGRkVSLCAnLCcsIE5FWFQsICcuZnJhbWVidWZmZXIpOycpXG4gICAgaWYgKGV4dERyYXdCdWZmZXJzKSB7XG4gICAgICBzY29wZShFWFRfRFJBV19CVUZGRVJTLCAnLmRyYXdCdWZmZXJzV0VCR0woJyxcbiAgICAgICAgRFJBV19CVUZGRVJTLCAnWycsIE5FWFQsICcuY29sb3JBdHRhY2htZW50cy5sZW5ndGhdKTsnKVxuICAgIH1cbiAgICBzY29wZSgnfWVsc2V7JyxcbiAgICAgIEdMLCAnLmJpbmRGcmFtZWJ1ZmZlcignLCBHTF9GUkFNRUJVRkZFUiwgJyxudWxsKTsnKVxuICAgIGlmIChleHREcmF3QnVmZmVycykge1xuICAgICAgc2NvcGUoRVhUX0RSQVdfQlVGRkVSUywgJy5kcmF3QnVmZmVyc1dFQkdMKCcsIEJBQ0tfQlVGRkVSLCAnKTsnKVxuICAgIH1cbiAgICBzY29wZShcbiAgICAgICd9JyxcbiAgICAgIEZSQU1FQlVGRkVSX1NUQVRFLCAnLmN1cj0nLCBORVhULCAnOycpXG4gICAgaWYgKCFza2lwQ2hlY2spIHtcbiAgICAgIHNjb3BlKCd9JylcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBlbWl0UG9sbFN0YXRlIChlbnYsIHNjb3BlLCBhcmdzKSB7XG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcblxuICAgIHZhciBHTCA9IHNoYXJlZC5nbFxuXG4gICAgdmFyIENVUlJFTlRfVkFSUyA9IGVudi5jdXJyZW50XG4gICAgdmFyIE5FWFRfVkFSUyA9IGVudi5uZXh0XG4gICAgdmFyIENVUlJFTlRfU1RBVEUgPSBzaGFyZWQuY3VycmVudFxuICAgIHZhciBORVhUX1NUQVRFID0gc2hhcmVkLm5leHRcblxuICAgIHZhciBibG9jayA9IGVudi5jb25kKENVUlJFTlRfU1RBVEUsICcuZGlydHknKVxuXG4gICAgR0xfU1RBVEVfTkFNRVMuZm9yRWFjaChmdW5jdGlvbiAocHJvcCkge1xuICAgICAgdmFyIHBhcmFtID0gcHJvcE5hbWUocHJvcClcbiAgICAgIGlmIChwYXJhbSBpbiBhcmdzLnN0YXRlKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuXG4gICAgICB2YXIgTkVYVCwgQ1VSUkVOVFxuICAgICAgaWYgKHBhcmFtIGluIE5FWFRfVkFSUykge1xuICAgICAgICBORVhUID0gTkVYVF9WQVJTW3BhcmFtXVxuICAgICAgICBDVVJSRU5UID0gQ1VSUkVOVF9WQVJTW3BhcmFtXVxuICAgICAgICB2YXIgcGFydHMgPSBsb29wKGN1cnJlbnRTdGF0ZVtwYXJhbV0ubGVuZ3RoLCBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgIHJldHVybiBibG9jay5kZWYoTkVYVCwgJ1snLCBpLCAnXScpXG4gICAgICAgIH0pXG4gICAgICAgIGJsb2NrKGVudi5jb25kKHBhcnRzLm1hcChmdW5jdGlvbiAocCwgaSkge1xuICAgICAgICAgIHJldHVybiBwICsgJyE9PScgKyBDVVJSRU5UICsgJ1snICsgaSArICddJ1xuICAgICAgICB9KS5qb2luKCd8fCcpKVxuICAgICAgICAgIC50aGVuKFxuICAgICAgICAgICAgR0wsICcuJywgR0xfVkFSSUFCTEVTW3BhcmFtXSwgJygnLCBwYXJ0cywgJyk7JyxcbiAgICAgICAgICAgIHBhcnRzLm1hcChmdW5jdGlvbiAocCwgaSkge1xuICAgICAgICAgICAgICByZXR1cm4gQ1VSUkVOVCArICdbJyArIGkgKyAnXT0nICsgcFxuICAgICAgICAgICAgfSkuam9pbignOycpLCAnOycpKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgTkVYVCA9IGJsb2NrLmRlZihORVhUX1NUQVRFLCAnLicsIHBhcmFtKVxuICAgICAgICB2YXIgaWZ0ZSA9IGVudi5jb25kKE5FWFQsICchPT0nLCBDVVJSRU5UX1NUQVRFLCAnLicsIHBhcmFtKVxuICAgICAgICBibG9jayhpZnRlKVxuICAgICAgICBpZiAocGFyYW0gaW4gR0xfRkxBR1MpIHtcbiAgICAgICAgICBpZnRlKFxuICAgICAgICAgICAgZW52LmNvbmQoTkVYVClcbiAgICAgICAgICAgICAgICAudGhlbihHTCwgJy5lbmFibGUoJywgR0xfRkxBR1NbcGFyYW1dLCAnKTsnKVxuICAgICAgICAgICAgICAgIC5lbHNlKEdMLCAnLmRpc2FibGUoJywgR0xfRkxBR1NbcGFyYW1dLCAnKTsnKSxcbiAgICAgICAgICAgIENVUlJFTlRfU1RBVEUsICcuJywgcGFyYW0sICc9JywgTkVYVCwgJzsnKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmdGUoXG4gICAgICAgICAgICBHTCwgJy4nLCBHTF9WQVJJQUJMRVNbcGFyYW1dLCAnKCcsIE5FWFQsICcpOycsXG4gICAgICAgICAgICBDVVJSRU5UX1NUQVRFLCAnLicsIHBhcmFtLCAnPScsIE5FWFQsICc7JylcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pXG4gICAgaWYgKE9iamVjdC5rZXlzKGFyZ3Muc3RhdGUpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgYmxvY2soQ1VSUkVOVF9TVEFURSwgJy5kaXJ0eT1mYWxzZTsnKVxuICAgIH1cbiAgICBzY29wZShibG9jaylcbiAgfVxuXG4gIGZ1bmN0aW9uIGVtaXRTZXRPcHRpb25zIChlbnYsIHNjb3BlLCBvcHRpb25zLCBmaWx0ZXIpIHtcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuICAgIHZhciBDVVJSRU5UX1ZBUlMgPSBlbnYuY3VycmVudFxuICAgIHZhciBDVVJSRU5UX1NUQVRFID0gc2hhcmVkLmN1cnJlbnRcbiAgICB2YXIgR0wgPSBzaGFyZWQuZ2xcbiAgICBzb3J0U3RhdGUoT2JqZWN0LmtleXMob3B0aW9ucykpLmZvckVhY2goZnVuY3Rpb24gKHBhcmFtKSB7XG4gICAgICB2YXIgZGVmbiA9IG9wdGlvbnNbcGFyYW1dXG4gICAgICBpZiAoZmlsdGVyICYmICFmaWx0ZXIoZGVmbikpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICB2YXIgdmFyaWFibGUgPSBkZWZuLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgaWYgKEdMX0ZMQUdTW3BhcmFtXSkge1xuICAgICAgICB2YXIgZmxhZyA9IEdMX0ZMQUdTW3BhcmFtXVxuICAgICAgICBpZiAoaXNTdGF0aWMoZGVmbikpIHtcbiAgICAgICAgICBpZiAodmFyaWFibGUpIHtcbiAgICAgICAgICAgIHNjb3BlKEdMLCAnLmVuYWJsZSgnLCBmbGFnLCAnKTsnKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzY29wZShHTCwgJy5kaXNhYmxlKCcsIGZsYWcsICcpOycpXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHNjb3BlKGVudi5jb25kKHZhcmlhYmxlKVxuICAgICAgICAgICAgLnRoZW4oR0wsICcuZW5hYmxlKCcsIGZsYWcsICcpOycpXG4gICAgICAgICAgICAuZWxzZShHTCwgJy5kaXNhYmxlKCcsIGZsYWcsICcpOycpKVxuICAgICAgICB9XG4gICAgICAgIHNjb3BlKENVUlJFTlRfU1RBVEUsICcuJywgcGFyYW0sICc9JywgdmFyaWFibGUsICc7JylcbiAgICAgIH0gZWxzZSBpZiAoaXNBcnJheUxpa2UodmFyaWFibGUpKSB7XG4gICAgICAgIHZhciBDVVJSRU5UID0gQ1VSUkVOVF9WQVJTW3BhcmFtXVxuICAgICAgICBzY29wZShcbiAgICAgICAgICBHTCwgJy4nLCBHTF9WQVJJQUJMRVNbcGFyYW1dLCAnKCcsIHZhcmlhYmxlLCAnKTsnLFxuICAgICAgICAgIHZhcmlhYmxlLm1hcChmdW5jdGlvbiAodiwgaSkge1xuICAgICAgICAgICAgcmV0dXJuIENVUlJFTlQgKyAnWycgKyBpICsgJ109JyArIHZcbiAgICAgICAgICB9KS5qb2luKCc7JyksICc7JylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNjb3BlKFxuICAgICAgICAgIEdMLCAnLicsIEdMX1ZBUklBQkxFU1twYXJhbV0sICcoJywgdmFyaWFibGUsICcpOycsXG4gICAgICAgICAgQ1VSUkVOVF9TVEFURSwgJy4nLCBwYXJhbSwgJz0nLCB2YXJpYWJsZSwgJzsnKVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiBpbmplY3RFeHRlbnNpb25zIChlbnYsIHNjb3BlKSB7XG4gICAgaWYgKGV4dEluc3RhbmNpbmcpIHtcbiAgICAgIGVudi5pbnN0YW5jaW5nID0gc2NvcGUuZGVmKFxuICAgICAgICBlbnYuc2hhcmVkLmV4dGVuc2lvbnMsICcuYW5nbGVfaW5zdGFuY2VkX2FycmF5cycpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZW1pdFByb2ZpbGUgKGVudiwgc2NvcGUsIGFyZ3MsIHVzZVNjb3BlLCBpbmNyZW1lbnRDb3VudGVyKSB7XG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcbiAgICB2YXIgU1RBVFMgPSBlbnYuc3RhdHNcbiAgICB2YXIgQ1VSUkVOVF9TVEFURSA9IHNoYXJlZC5jdXJyZW50XG4gICAgdmFyIFRJTUVSID0gc2hhcmVkLnRpbWVyXG4gICAgdmFyIHByb2ZpbGVBcmcgPSBhcmdzLnByb2ZpbGVcblxuICAgIGZ1bmN0aW9uIHBlcmZDb3VudGVyICgpIHtcbiAgICAgIGlmICh0eXBlb2YgcGVyZm9ybWFuY2UgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHJldHVybiAnRGF0ZS5ub3coKSdcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiAncGVyZm9ybWFuY2Uubm93KCknXG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFyIENQVV9TVEFSVCwgUVVFUllfQ09VTlRFUlxuICAgIGZ1bmN0aW9uIGVtaXRQcm9maWxlU3RhcnQgKGJsb2NrKSB7XG4gICAgICBDUFVfU1RBUlQgPSBzY29wZS5kZWYoKVxuICAgICAgYmxvY2soQ1BVX1NUQVJULCAnPScsIHBlcmZDb3VudGVyKCksICc7JylcbiAgICAgIGlmICh0eXBlb2YgaW5jcmVtZW50Q291bnRlciA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgYmxvY2soU1RBVFMsICcuY291bnQrPScsIGluY3JlbWVudENvdW50ZXIsICc7JylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGJsb2NrKFNUQVRTLCAnLmNvdW50Kys7JylcbiAgICAgIH1cbiAgICAgIGlmICh0aW1lcikge1xuICAgICAgICBpZiAodXNlU2NvcGUpIHtcbiAgICAgICAgICBRVUVSWV9DT1VOVEVSID0gc2NvcGUuZGVmKClcbiAgICAgICAgICBibG9jayhRVUVSWV9DT1VOVEVSLCAnPScsIFRJTUVSLCAnLmdldE51bVBlbmRpbmdRdWVyaWVzKCk7JylcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBibG9jayhUSU1FUiwgJy5iZWdpblF1ZXJ5KCcsIFNUQVRTLCAnKTsnKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZW1pdFByb2ZpbGVFbmQgKGJsb2NrKSB7XG4gICAgICBibG9jayhTVEFUUywgJy5jcHVUaW1lKz0nLCBwZXJmQ291bnRlcigpLCAnLScsIENQVV9TVEFSVCwgJzsnKVxuICAgICAgaWYgKHRpbWVyKSB7XG4gICAgICAgIGlmICh1c2VTY29wZSkge1xuICAgICAgICAgIGJsb2NrKFRJTUVSLCAnLnB1c2hTY29wZVN0YXRzKCcsXG4gICAgICAgICAgICBRVUVSWV9DT1VOVEVSLCAnLCcsXG4gICAgICAgICAgICBUSU1FUiwgJy5nZXROdW1QZW5kaW5nUXVlcmllcygpLCcsXG4gICAgICAgICAgICBTVEFUUywgJyk7JylcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBibG9jayhUSU1FUiwgJy5lbmRRdWVyeSgpOycpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzY29wZVByb2ZpbGUgKHZhbHVlKSB7XG4gICAgICB2YXIgcHJldiA9IHNjb3BlLmRlZihDVVJSRU5UX1NUQVRFLCAnLnByb2ZpbGUnKVxuICAgICAgc2NvcGUoQ1VSUkVOVF9TVEFURSwgJy5wcm9maWxlPScsIHZhbHVlLCAnOycpXG4gICAgICBzY29wZS5leGl0KENVUlJFTlRfU1RBVEUsICcucHJvZmlsZT0nLCBwcmV2LCAnOycpXG4gICAgfVxuXG4gICAgdmFyIFVTRV9QUk9GSUxFXG4gICAgaWYgKHByb2ZpbGVBcmcpIHtcbiAgICAgIGlmIChpc1N0YXRpYyhwcm9maWxlQXJnKSkge1xuICAgICAgICBpZiAocHJvZmlsZUFyZy5lbmFibGUpIHtcbiAgICAgICAgICBlbWl0UHJvZmlsZVN0YXJ0KHNjb3BlKVxuICAgICAgICAgIGVtaXRQcm9maWxlRW5kKHNjb3BlLmV4aXQpXG4gICAgICAgICAgc2NvcGVQcm9maWxlKCd0cnVlJylcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzY29wZVByb2ZpbGUoJ2ZhbHNlJylcbiAgICAgICAgfVxuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIFVTRV9QUk9GSUxFID0gcHJvZmlsZUFyZy5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgIHNjb3BlUHJvZmlsZShVU0VfUFJPRklMRSlcbiAgICB9IGVsc2Uge1xuICAgICAgVVNFX1BST0ZJTEUgPSBzY29wZS5kZWYoQ1VSUkVOVF9TVEFURSwgJy5wcm9maWxlJylcbiAgICB9XG5cbiAgICB2YXIgc3RhcnQgPSBlbnYuYmxvY2soKVxuICAgIGVtaXRQcm9maWxlU3RhcnQoc3RhcnQpXG4gICAgc2NvcGUoJ2lmKCcsIFVTRV9QUk9GSUxFLCAnKXsnLCBzdGFydCwgJ30nKVxuICAgIHZhciBlbmQgPSBlbnYuYmxvY2soKVxuICAgIGVtaXRQcm9maWxlRW5kKGVuZClcbiAgICBzY29wZS5leGl0KCdpZignLCBVU0VfUFJPRklMRSwgJyl7JywgZW5kLCAnfScpXG4gIH1cblxuICBmdW5jdGlvbiBlbWl0QXR0cmlidXRlcyAoZW52LCBzY29wZSwgYXJncywgYXR0cmlidXRlcywgZmlsdGVyKSB7XG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcblxuICAgIGZ1bmN0aW9uIHR5cGVMZW5ndGggKHgpIHtcbiAgICAgIHN3aXRjaCAoeCkge1xuICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzI6XG4gICAgICAgIGNhc2UgR0xfSU5UX1ZFQzI6XG4gICAgICAgIGNhc2UgR0xfQk9PTF9WRUMyOlxuICAgICAgICAgIHJldHVybiAyXG4gICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDMzpcbiAgICAgICAgY2FzZSBHTF9JTlRfVkVDMzpcbiAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzM6XG4gICAgICAgICAgcmV0dXJuIDNcbiAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUM0OlxuICAgICAgICBjYXNlIEdMX0lOVF9WRUM0OlxuICAgICAgICBjYXNlIEdMX0JPT0xfVkVDNDpcbiAgICAgICAgICByZXR1cm4gNFxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIHJldHVybiAxXG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZW1pdEJpbmRBdHRyaWJ1dGUgKEFUVFJJQlVURSwgc2l6ZSwgcmVjb3JkKSB7XG4gICAgICB2YXIgR0wgPSBzaGFyZWQuZ2xcblxuICAgICAgdmFyIExPQ0FUSU9OID0gc2NvcGUuZGVmKEFUVFJJQlVURSwgJy5sb2NhdGlvbicpXG4gICAgICB2YXIgQklORElORyA9IHNjb3BlLmRlZihzaGFyZWQuYXR0cmlidXRlcywgJ1snLCBMT0NBVElPTiwgJ10nKVxuXG4gICAgICB2YXIgU1RBVEUgPSByZWNvcmQuc3RhdGVcbiAgICAgIHZhciBCVUZGRVIgPSByZWNvcmQuYnVmZmVyXG4gICAgICB2YXIgQ09OU1RfQ09NUE9ORU5UUyA9IFtcbiAgICAgICAgcmVjb3JkLngsXG4gICAgICAgIHJlY29yZC55LFxuICAgICAgICByZWNvcmQueixcbiAgICAgICAgcmVjb3JkLndcbiAgICAgIF1cblxuICAgICAgdmFyIENPTU1PTl9LRVlTID0gW1xuICAgICAgICAnYnVmZmVyJyxcbiAgICAgICAgJ25vcm1hbGl6ZWQnLFxuICAgICAgICAnb2Zmc2V0JyxcbiAgICAgICAgJ3N0cmlkZSdcbiAgICAgIF1cblxuICAgICAgZnVuY3Rpb24gZW1pdEJ1ZmZlciAoKSB7XG4gICAgICAgIHNjb3BlKFxuICAgICAgICAgICdpZighJywgQklORElORywgJy5idWZmZXIpeycsXG4gICAgICAgICAgR0wsICcuZW5hYmxlVmVydGV4QXR0cmliQXJyYXkoJywgTE9DQVRJT04sICcpO30nKVxuXG4gICAgICAgIHZhciBUWVBFID0gcmVjb3JkLnR5cGVcbiAgICAgICAgdmFyIFNJWkVcbiAgICAgICAgaWYgKCFyZWNvcmQuc2l6ZSkge1xuICAgICAgICAgIFNJWkUgPSBzaXplXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgU0laRSA9IHNjb3BlLmRlZihyZWNvcmQuc2l6ZSwgJ3x8Jywgc2l6ZSlcbiAgICAgICAgfVxuXG4gICAgICAgIHNjb3BlKCdpZignLFxuICAgICAgICAgIEJJTkRJTkcsICcudHlwZSE9PScsIFRZUEUsICd8fCcsXG4gICAgICAgICAgQklORElORywgJy5zaXplIT09JywgU0laRSwgJ3x8JyxcbiAgICAgICAgICBDT01NT05fS0VZUy5tYXAoZnVuY3Rpb24gKGtleSkge1xuICAgICAgICAgICAgcmV0dXJuIEJJTkRJTkcgKyAnLicgKyBrZXkgKyAnIT09JyArIHJlY29yZFtrZXldXG4gICAgICAgICAgfSkuam9pbignfHwnKSxcbiAgICAgICAgICAnKXsnLFxuICAgICAgICAgIEdMLCAnLmJpbmRCdWZmZXIoJywgR0xfQVJSQVlfQlVGRkVSLCAnLCcsIEJVRkZFUiwgJy5idWZmZXIpOycsXG4gICAgICAgICAgR0wsICcudmVydGV4QXR0cmliUG9pbnRlcignLCBbXG4gICAgICAgICAgICBMT0NBVElPTixcbiAgICAgICAgICAgIFNJWkUsXG4gICAgICAgICAgICBUWVBFLFxuICAgICAgICAgICAgcmVjb3JkLm5vcm1hbGl6ZWQsXG4gICAgICAgICAgICByZWNvcmQuc3RyaWRlLFxuICAgICAgICAgICAgcmVjb3JkLm9mZnNldFxuICAgICAgICAgIF0sICcpOycsXG4gICAgICAgICAgQklORElORywgJy50eXBlPScsIFRZUEUsICc7JyxcbiAgICAgICAgICBCSU5ESU5HLCAnLnNpemU9JywgU0laRSwgJzsnLFxuICAgICAgICAgIENPTU1PTl9LRVlTLm1hcChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgICAgICByZXR1cm4gQklORElORyArICcuJyArIGtleSArICc9JyArIHJlY29yZFtrZXldICsgJzsnXG4gICAgICAgICAgfSkuam9pbignJyksXG4gICAgICAgICAgJ30nKVxuXG4gICAgICAgIGlmIChleHRJbnN0YW5jaW5nKSB7XG4gICAgICAgICAgdmFyIERJVklTT1IgPSByZWNvcmQuZGl2aXNvclxuICAgICAgICAgIHNjb3BlKFxuICAgICAgICAgICAgJ2lmKCcsIEJJTkRJTkcsICcuZGl2aXNvciE9PScsIERJVklTT1IsICcpeycsXG4gICAgICAgICAgICBlbnYuaW5zdGFuY2luZywgJy52ZXJ0ZXhBdHRyaWJEaXZpc29yQU5HTEUoJywgW0xPQ0FUSU9OLCBESVZJU09SXSwgJyk7JyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcuZGl2aXNvcj0nLCBESVZJU09SLCAnO30nKVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGZ1bmN0aW9uIGVtaXRDb25zdGFudCAoKSB7XG4gICAgICAgIHNjb3BlKFxuICAgICAgICAgICdpZignLCBCSU5ESU5HLCAnLmJ1ZmZlcil7JyxcbiAgICAgICAgICBHTCwgJy5kaXNhYmxlVmVydGV4QXR0cmliQXJyYXkoJywgTE9DQVRJT04sICcpOycsXG4gICAgICAgICAgJ31pZignLCBDVVRFX0NPTVBPTkVOVFMubWFwKGZ1bmN0aW9uIChjLCBpKSB7XG4gICAgICAgICAgICByZXR1cm4gQklORElORyArICcuJyArIGMgKyAnIT09JyArIENPTlNUX0NPTVBPTkVOVFNbaV1cbiAgICAgICAgICB9KS5qb2luKCd8fCcpLCAnKXsnLFxuICAgICAgICAgIEdMLCAnLnZlcnRleEF0dHJpYjRmKCcsIExPQ0FUSU9OLCAnLCcsIENPTlNUX0NPTVBPTkVOVFMsICcpOycsXG4gICAgICAgICAgQ1VURV9DT01QT05FTlRTLm1hcChmdW5jdGlvbiAoYywgaSkge1xuICAgICAgICAgICAgcmV0dXJuIEJJTkRJTkcgKyAnLicgKyBjICsgJz0nICsgQ09OU1RfQ09NUE9ORU5UU1tpXSArICc7J1xuICAgICAgICAgIH0pLmpvaW4oJycpLFxuICAgICAgICAgICd9JylcbiAgICAgIH1cblxuICAgICAgaWYgKFNUQVRFID09PSBBVFRSSUJfU1RBVEVfUE9JTlRFUikge1xuICAgICAgICBlbWl0QnVmZmVyKClcbiAgICAgIH0gZWxzZSBpZiAoU1RBVEUgPT09IEFUVFJJQl9TVEFURV9DT05TVEFOVCkge1xuICAgICAgICBlbWl0Q29uc3RhbnQoKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2NvcGUoJ2lmKCcsIFNUQVRFLCAnPT09JywgQVRUUklCX1NUQVRFX1BPSU5URVIsICcpeycpXG4gICAgICAgIGVtaXRCdWZmZXIoKVxuICAgICAgICBzY29wZSgnfWVsc2V7JylcbiAgICAgICAgZW1pdENvbnN0YW50KClcbiAgICAgICAgc2NvcGUoJ30nKVxuICAgICAgfVxuICAgIH1cblxuICAgIGF0dHJpYnV0ZXMuZm9yRWFjaChmdW5jdGlvbiAoYXR0cmlidXRlKSB7XG4gICAgICB2YXIgbmFtZSA9IGF0dHJpYnV0ZS5uYW1lXG4gICAgICB2YXIgYXJnID0gYXJncy5hdHRyaWJ1dGVzW25hbWVdXG4gICAgICB2YXIgcmVjb3JkXG4gICAgICBpZiAoYXJnKSB7XG4gICAgICAgIGlmICghZmlsdGVyKGFyZykpIHtcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuICAgICAgICByZWNvcmQgPSBhcmcuYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoIWZpbHRlcihTQ09QRV9ERUNMKSkge1xuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG4gICAgICAgIHZhciBzY29wZUF0dHJpYiA9IGVudi5zY29wZUF0dHJpYihuYW1lKVxuICAgICAgICBcbiAgICAgICAgcmVjb3JkID0ge31cbiAgICAgICAgT2JqZWN0LmtleXMobmV3IEF0dHJpYnV0ZVJlY29yZCgpKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgICByZWNvcmRba2V5XSA9IHNjb3BlLmRlZihzY29wZUF0dHJpYiwgJy4nLCBrZXkpXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgICBlbWl0QmluZEF0dHJpYnV0ZShcbiAgICAgICAgZW52LmxpbmsoYXR0cmlidXRlKSwgdHlwZUxlbmd0aChhdHRyaWJ1dGUuaW5mby50eXBlKSwgcmVjb3JkKVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiBlbWl0VW5pZm9ybXMgKGVudiwgc2NvcGUsIGFyZ3MsIHVuaWZvcm1zLCBmaWx0ZXIpIHtcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuICAgIHZhciBHTCA9IHNoYXJlZC5nbFxuXG4gICAgdmFyIGluZml4XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB1bmlmb3Jtcy5sZW5ndGg7ICsraSkge1xuICAgICAgdmFyIHVuaWZvcm0gPSB1bmlmb3Jtc1tpXVxuICAgICAgdmFyIG5hbWUgPSB1bmlmb3JtLm5hbWVcbiAgICAgIHZhciB0eXBlID0gdW5pZm9ybS5pbmZvLnR5cGVcbiAgICAgIHZhciBhcmcgPSBhcmdzLnVuaWZvcm1zW25hbWVdXG4gICAgICB2YXIgVU5JRk9STSA9IGVudi5saW5rKHVuaWZvcm0pXG4gICAgICB2YXIgTE9DQVRJT04gPSBVTklGT1JNICsgJy5sb2NhdGlvbidcblxuICAgICAgdmFyIFZBTFVFXG4gICAgICBpZiAoYXJnKSB7XG4gICAgICAgIGlmICghZmlsdGVyKGFyZykpIHtcbiAgICAgICAgICBjb250aW51ZVxuICAgICAgICB9XG4gICAgICAgIGlmIChpc1N0YXRpYyhhcmcpKSB7XG4gICAgICAgICAgdmFyIHZhbHVlID0gYXJnLnZhbHVlXG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKHR5cGUgPT09IEdMX1NBTVBMRVJfMkQgfHwgdHlwZSA9PT0gR0xfU0FNUExFUl9DVUJFKSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHZhciBURVhfVkFMVUUgPSBlbnYubGluayh2YWx1ZS5fdGV4dHVyZSB8fCB2YWx1ZS5jb2xvclswXS5fdGV4dHVyZSlcbiAgICAgICAgICAgIHNjb3BlKEdMLCAnLnVuaWZvcm0xaSgnLCBMT0NBVElPTiwgJywnLCBURVhfVkFMVUUgKyAnLmJpbmQoKSk7JylcbiAgICAgICAgICAgIHNjb3BlLmV4aXQoVEVYX1ZBTFVFLCAnLnVuYmluZCgpOycpXG4gICAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICAgIHR5cGUgPT09IEdMX0ZMT0FUX01BVDIgfHxcbiAgICAgICAgICAgIHR5cGUgPT09IEdMX0ZMT0FUX01BVDMgfHxcbiAgICAgICAgICAgIHR5cGUgPT09IEdMX0ZMT0FUX01BVDQpIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdmFyIE1BVF9WQUxVRSA9IGVudi5nbG9iYWwuZGVmKCduZXcgRmxvYXQzMkFycmF5KFsnICtcbiAgICAgICAgICAgICAgQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwodmFsdWUpICsgJ10pJylcbiAgICAgICAgICAgIHZhciBkaW0gPSAyXG4gICAgICAgICAgICBpZiAodHlwZSA9PT0gR0xfRkxPQVRfTUFUMykge1xuICAgICAgICAgICAgICBkaW0gPSAzXG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGUgPT09IEdMX0ZMT0FUX01BVDQpIHtcbiAgICAgICAgICAgICAgZGltID0gNFxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc2NvcGUoXG4gICAgICAgICAgICAgIEdMLCAnLnVuaWZvcm1NYXRyaXgnLCBkaW0sICdmdignLFxuICAgICAgICAgICAgICBMT0NBVElPTiwgJyxmYWxzZSwnLCBNQVRfVkFMVUUsICcpOycpXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICAgICAgICBjYXNlIEdMX0ZMT0FUOlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGluZml4ID0gJzFmJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDMjpcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICcyZidcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzM6XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaW5maXggPSAnM2YnXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUM0OlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGluZml4ID0gJzRmJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfQk9PTDpcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICcxaSdcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0lOVDpcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICcxaSdcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0JPT0xfVkVDMjpcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICcyaSdcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0lOVF9WRUMyOlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGluZml4ID0gJzJpJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfQk9PTF9WRUMzOlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGluZml4ID0gJzNpJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfSU5UX1ZFQzM6XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaW5maXggPSAnM2knXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzQ6XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaW5maXggPSAnNGknXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9JTlRfVkVDNDpcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICc0aSdcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc2NvcGUoR0wsICcudW5pZm9ybScsIGluZml4LCAnKCcsIExPQ0FUSU9OLCAnLCcsXG4gICAgICAgICAgICAgIGlzQXJyYXlMaWtlKHZhbHVlKSA/IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKHZhbHVlKSA6IHZhbHVlLFxuICAgICAgICAgICAgICAnKTsnKVxuICAgICAgICAgIH1cbiAgICAgICAgICBjb250aW51ZVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIFZBTFVFID0gYXJnLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoIWZpbHRlcihTQ09QRV9ERUNMKSkge1xuICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgIH1cbiAgICAgICAgVkFMVUUgPSBzY29wZS5kZWYoc2hhcmVkLnVuaWZvcm1zLCAnWycsIHN0cmluZ1N0b3JlLmlkKG5hbWUpLCAnXScpXG4gICAgICB9XG5cbiAgICAgIGlmICh0eXBlID09PSBHTF9TQU1QTEVSXzJEKSB7XG4gICAgICAgIHNjb3BlKFxuICAgICAgICAgICdpZignLCBWQUxVRSwgJyYmJywgVkFMVUUsICcuX3JlZ2xUeXBlPT09XCJmcmFtZWJ1ZmZlclwiKXsnLFxuICAgICAgICAgIFZBTFVFLCAnPScsIFZBTFVFLCAnLmNvbG9yWzBdOycsXG4gICAgICAgICAgJ30nKVxuICAgICAgfSBlbHNlIGlmICh0eXBlID09PSBHTF9TQU1QTEVSX0NVQkUpIHtcbiAgICAgICAgc2NvcGUoXG4gICAgICAgICAgJ2lmKCcsIFZBTFVFLCAnJiYnLCBWQUxVRSwgJy5fcmVnbFR5cGU9PT1cImZyYW1lYnVmZmVyQ3ViZVwiKXsnLFxuICAgICAgICAgIFZBTFVFLCAnPScsIFZBTFVFLCAnLmNvbG9yWzBdOycsXG4gICAgICAgICAgJ30nKVxuICAgICAgfVxuXG4gICAgICAvLyBwZXJmb3JtIHR5cGUgdmFsaWRhdGlvblxuICAgICAgXG5cbiAgICAgIHZhciB1bnJvbGwgPSAxXG4gICAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgICAgY2FzZSBHTF9TQU1QTEVSXzJEOlxuICAgICAgICBjYXNlIEdMX1NBTVBMRVJfQ1VCRTpcbiAgICAgICAgICB2YXIgVEVYID0gc2NvcGUuZGVmKFZBTFVFLCAnLl90ZXh0dXJlJylcbiAgICAgICAgICBzY29wZShHTCwgJy51bmlmb3JtMWkoJywgTE9DQVRJT04sICcsJywgVEVYLCAnLmJpbmQoKSk7JylcbiAgICAgICAgICBzY29wZS5leGl0KFRFWCwgJy51bmJpbmQoKTsnKVxuICAgICAgICAgIGNvbnRpbnVlXG5cbiAgICAgICAgY2FzZSBHTF9JTlQ6XG4gICAgICAgIGNhc2UgR0xfQk9PTDpcbiAgICAgICAgICBpbmZpeCA9ICcxaSdcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfSU5UX1ZFQzI6XG4gICAgICAgIGNhc2UgR0xfQk9PTF9WRUMyOlxuICAgICAgICAgIGluZml4ID0gJzJpJ1xuICAgICAgICAgIHVucm9sbCA9IDJcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfSU5UX1ZFQzM6XG4gICAgICAgIGNhc2UgR0xfQk9PTF9WRUMzOlxuICAgICAgICAgIGluZml4ID0gJzNpJ1xuICAgICAgICAgIHVucm9sbCA9IDNcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfSU5UX1ZFQzQ6XG4gICAgICAgIGNhc2UgR0xfQk9PTF9WRUM0OlxuICAgICAgICAgIGluZml4ID0gJzRpJ1xuICAgICAgICAgIHVucm9sbCA9IDRcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfRkxPQVQ6XG4gICAgICAgICAgaW5maXggPSAnMWYnXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzI6XG4gICAgICAgICAgaW5maXggPSAnMmYnXG4gICAgICAgICAgdW5yb2xsID0gMlxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUMzOlxuICAgICAgICAgIGluZml4ID0gJzNmJ1xuICAgICAgICAgIHVucm9sbCA9IDNcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDNDpcbiAgICAgICAgICBpbmZpeCA9ICc0ZidcbiAgICAgICAgICB1bnJvbGwgPSA0XG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0ZMT0FUX01BVDI6XG4gICAgICAgICAgaW5maXggPSAnTWF0cml4MmZ2J1xuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9GTE9BVF9NQVQzOlxuICAgICAgICAgIGluZml4ID0gJ01hdHJpeDNmdidcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfRkxPQVRfTUFUNDpcbiAgICAgICAgICBpbmZpeCA9ICdNYXRyaXg0ZnYnXG4gICAgICAgICAgYnJlYWtcbiAgICAgIH1cblxuICAgICAgc2NvcGUoR0wsICcudW5pZm9ybScsIGluZml4LCAnKCcsIExPQ0FUSU9OLCAnLCcpXG4gICAgICBpZiAoaW5maXguY2hhckF0KDApID09PSAnTScpIHtcbiAgICAgICAgdmFyIG1hdFNpemUgPSBNYXRoLnBvdyh0eXBlIC0gR0xfRkxPQVRfTUFUMiArIDIsIDIpXG4gICAgICAgIHZhciBTVE9SQUdFID0gZW52Lmdsb2JhbC5kZWYoJ25ldyBGbG9hdDMyQXJyYXkoJywgbWF0U2l6ZSwgJyknKVxuICAgICAgICBzY29wZShcbiAgICAgICAgICAnZmFsc2UsKEFycmF5LmlzQXJyYXkoJywgVkFMVUUsICcpfHwnLCBWQUxVRSwgJyBpbnN0YW5jZW9mIEZsb2F0MzJBcnJheSk/JywgVkFMVUUsICc6KCcsXG4gICAgICAgICAgbG9vcChtYXRTaXplLCBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgICAgcmV0dXJuIFNUT1JBR0UgKyAnWycgKyBpICsgJ109JyArIFZBTFVFICsgJ1snICsgaSArICddJ1xuICAgICAgICAgIH0pLCAnLCcsIFNUT1JBR0UsICcpJylcbiAgICAgIH0gZWxzZSBpZiAodW5yb2xsID4gMSkge1xuICAgICAgICBzY29wZShsb29wKHVucm9sbCwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICByZXR1cm4gVkFMVUUgKyAnWycgKyBpICsgJ10nXG4gICAgICAgIH0pKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2NvcGUoVkFMVUUpXG4gICAgICB9XG4gICAgICBzY29wZSgnKTsnKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGVtaXREcmF3IChlbnYsIG91dGVyLCBpbm5lciwgYXJncykge1xuICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgdmFyIEdMID0gc2hhcmVkLmdsXG4gICAgdmFyIERSQVdfU1RBVEUgPSBzaGFyZWQuZHJhd1xuXG4gICAgdmFyIGRyYXdPcHRpb25zID0gYXJncy5kcmF3XG5cbiAgICBmdW5jdGlvbiBlbWl0RWxlbWVudHMgKCkge1xuICAgICAgdmFyIGRlZm4gPSBkcmF3T3B0aW9ucy5lbGVtZW50c1xuICAgICAgdmFyIEVMRU1FTlRTXG4gICAgICB2YXIgc2NvcGUgPSBvdXRlclxuICAgICAgaWYgKGRlZm4pIHtcbiAgICAgICAgaWYgKChkZWZuLmNvbnRleHREZXAgJiYgYXJncy5jb250ZXh0RHluYW1pYykgfHwgZGVmbi5wcm9wRGVwKSB7XG4gICAgICAgICAgc2NvcGUgPSBpbm5lclxuICAgICAgICB9XG4gICAgICAgIEVMRU1FTlRTID0gZGVmbi5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIEVMRU1FTlRTID0gc2NvcGUuZGVmKERSQVdfU1RBVEUsICcuJywgU19FTEVNRU5UUylcbiAgICAgIH1cbiAgICAgIGlmIChFTEVNRU5UUykge1xuICAgICAgICBzY29wZShcbiAgICAgICAgICAnaWYoJyArIEVMRU1FTlRTICsgJyknICtcbiAgICAgICAgICBHTCArICcuYmluZEJ1ZmZlcignICsgR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIgKyAnLCcgKyBFTEVNRU5UUyArICcuYnVmZmVyLmJ1ZmZlcik7JylcbiAgICAgIH1cbiAgICAgIHJldHVybiBFTEVNRU5UU1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGVtaXRDb3VudCAoKSB7XG4gICAgICB2YXIgZGVmbiA9IGRyYXdPcHRpb25zLmNvdW50XG4gICAgICB2YXIgQ09VTlRcbiAgICAgIHZhciBzY29wZSA9IG91dGVyXG4gICAgICBpZiAoZGVmbikge1xuICAgICAgICBpZiAoKGRlZm4uY29udGV4dERlcCAmJiBhcmdzLmNvbnRleHREeW5hbWljKSB8fCBkZWZuLnByb3BEZXApIHtcbiAgICAgICAgICBzY29wZSA9IGlubmVyXG4gICAgICAgIH1cbiAgICAgICAgQ09VTlQgPSBkZWZuLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgICBcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIENPVU5UID0gc2NvcGUuZGVmKERSQVdfU1RBVEUsICcuJywgU19DT1VOVClcbiAgICAgICAgXG4gICAgICB9XG4gICAgICByZXR1cm4gQ09VTlRcbiAgICB9XG5cbiAgICB2YXIgRUxFTUVOVFMgPSBlbWl0RWxlbWVudHMoKVxuICAgIGZ1bmN0aW9uIGVtaXRWYWx1ZSAobmFtZSkge1xuICAgICAgdmFyIGRlZm4gPSBkcmF3T3B0aW9uc1tuYW1lXVxuICAgICAgaWYgKGRlZm4pIHtcbiAgICAgICAgaWYgKChkZWZuLmNvbnRleHREZXAgJiYgYXJncy5jb250ZXh0RHluYW1pYykgfHwgZGVmbi5wcm9wRGVwKSB7XG4gICAgICAgICAgcmV0dXJuIGRlZm4uYXBwZW5kKGVudiwgaW5uZXIpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIGRlZm4uYXBwZW5kKGVudiwgb3V0ZXIpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBvdXRlci5kZWYoRFJBV19TVEFURSwgJy4nLCBuYW1lKVxuICAgICAgfVxuICAgIH1cblxuICAgIHZhciBQUklNSVRJVkUgPSBlbWl0VmFsdWUoU19QUklNSVRJVkUpXG4gICAgdmFyIE9GRlNFVCA9IGVtaXRWYWx1ZShTX09GRlNFVClcblxuICAgIHZhciBDT1VOVCA9IGVtaXRDb3VudCgpXG4gICAgaWYgKHR5cGVvZiBDT1VOVCA9PT0gJ251bWJlcicpIHtcbiAgICAgIGlmIChDT1VOVCA9PT0gMCkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgaW5uZXIoJ2lmKCcsIENPVU5ULCAnKXsnKVxuICAgICAgaW5uZXIuZXhpdCgnfScpXG4gICAgfVxuXG4gICAgdmFyIElOU1RBTkNFUywgRVhUX0lOU1RBTkNJTkdcbiAgICBpZiAoZXh0SW5zdGFuY2luZykge1xuICAgICAgSU5TVEFOQ0VTID0gZW1pdFZhbHVlKFNfSU5TVEFOQ0VTKVxuICAgICAgRVhUX0lOU1RBTkNJTkcgPSBlbnYuaW5zdGFuY2luZ1xuICAgIH1cblxuICAgIHZhciBFTEVNRU5UX1RZUEUgPSBFTEVNRU5UUyArICcudHlwZSdcblxuICAgIHZhciBlbGVtZW50c1N0YXRpYyA9IGRyYXdPcHRpb25zLmVsZW1lbnRzICYmIGlzU3RhdGljKGRyYXdPcHRpb25zLmVsZW1lbnRzKVxuXG4gICAgZnVuY3Rpb24gZW1pdEluc3RhbmNpbmcgKCkge1xuICAgICAgZnVuY3Rpb24gZHJhd0VsZW1lbnRzICgpIHtcbiAgICAgICAgaW5uZXIoRVhUX0lOU1RBTkNJTkcsICcuZHJhd0VsZW1lbnRzSW5zdGFuY2VkQU5HTEUoJywgW1xuICAgICAgICAgIFBSSU1JVElWRSxcbiAgICAgICAgICBDT1VOVCxcbiAgICAgICAgICBFTEVNRU5UX1RZUEUsXG4gICAgICAgICAgT0ZGU0VUICsgJzw8KCgnICsgRUxFTUVOVF9UWVBFICsgJy0nICsgR0xfVU5TSUdORURfQllURSArICcpPj4xKScsXG4gICAgICAgICAgSU5TVEFOQ0VTXG4gICAgICAgIF0sICcpOycpXG4gICAgICB9XG5cbiAgICAgIGZ1bmN0aW9uIGRyYXdBcnJheXMgKCkge1xuICAgICAgICBpbm5lcihFWFRfSU5TVEFOQ0lORywgJy5kcmF3QXJyYXlzSW5zdGFuY2VkQU5HTEUoJyxcbiAgICAgICAgICBbUFJJTUlUSVZFLCBPRkZTRVQsIENPVU5ULCBJTlNUQU5DRVNdLCAnKTsnKVxuICAgICAgfVxuXG4gICAgICBpZiAoRUxFTUVOVFMpIHtcbiAgICAgICAgaWYgKCFlbGVtZW50c1N0YXRpYykge1xuICAgICAgICAgIGlubmVyKCdpZignLCBFTEVNRU5UUywgJyl7JylcbiAgICAgICAgICBkcmF3RWxlbWVudHMoKVxuICAgICAgICAgIGlubmVyKCd9ZWxzZXsnKVxuICAgICAgICAgIGRyYXdBcnJheXMoKVxuICAgICAgICAgIGlubmVyKCd9JylcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBkcmF3RWxlbWVudHMoKVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkcmF3QXJyYXlzKClcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBlbWl0UmVndWxhciAoKSB7XG4gICAgICBmdW5jdGlvbiBkcmF3RWxlbWVudHMgKCkge1xuICAgICAgICBpbm5lcihHTCArICcuZHJhd0VsZW1lbnRzKCcgKyBbXG4gICAgICAgICAgUFJJTUlUSVZFLFxuICAgICAgICAgIENPVU5ULFxuICAgICAgICAgIEVMRU1FTlRfVFlQRSxcbiAgICAgICAgICBPRkZTRVQgKyAnPDwoKCcgKyBFTEVNRU5UX1RZUEUgKyAnLScgKyBHTF9VTlNJR05FRF9CWVRFICsgJyk+PjEpJ1xuICAgICAgICBdICsgJyk7JylcbiAgICAgIH1cblxuICAgICAgZnVuY3Rpb24gZHJhd0FycmF5cyAoKSB7XG4gICAgICAgIGlubmVyKEdMICsgJy5kcmF3QXJyYXlzKCcgKyBbUFJJTUlUSVZFLCBPRkZTRVQsIENPVU5UXSArICcpOycpXG4gICAgICB9XG5cbiAgICAgIGlmIChFTEVNRU5UUykge1xuICAgICAgICBpZiAoIWVsZW1lbnRzU3RhdGljKSB7XG4gICAgICAgICAgaW5uZXIoJ2lmKCcsIEVMRU1FTlRTLCAnKXsnKVxuICAgICAgICAgIGRyYXdFbGVtZW50cygpXG4gICAgICAgICAgaW5uZXIoJ31lbHNleycpXG4gICAgICAgICAgZHJhd0FycmF5cygpXG4gICAgICAgICAgaW5uZXIoJ30nKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGRyYXdFbGVtZW50cygpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRyYXdBcnJheXMoKVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChleHRJbnN0YW5jaW5nICYmICh0eXBlb2YgSU5TVEFOQ0VTICE9PSAnbnVtYmVyJyB8fCBJTlNUQU5DRVMgPj0gMCkpIHtcbiAgICAgIGlmICh0eXBlb2YgSU5TVEFOQ0VTID09PSAnc3RyaW5nJykge1xuICAgICAgICBpbm5lcignaWYoJywgSU5TVEFOQ0VTLCAnPjApeycpXG4gICAgICAgIGVtaXRJbnN0YW5jaW5nKClcbiAgICAgICAgaW5uZXIoJ31lbHNlIGlmKCcsIElOU1RBTkNFUywgJzwwKXsnKVxuICAgICAgICBlbWl0UmVndWxhcigpXG4gICAgICAgIGlubmVyKCd9JylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGVtaXRJbnN0YW5jaW5nKClcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgZW1pdFJlZ3VsYXIoKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZUJvZHkgKGVtaXRCb2R5LCBwYXJlbnRFbnYsIGFyZ3MsIHByb2dyYW0sIGNvdW50KSB7XG4gICAgdmFyIGVudiA9IGNyZWF0ZVJFR0xFbnZpcm9ubWVudCgpXG4gICAgdmFyIHNjb3BlID0gZW52LnByb2MoJ2JvZHknLCBjb3VudClcbiAgICBcbiAgICBpZiAoZXh0SW5zdGFuY2luZykge1xuICAgICAgZW52Lmluc3RhbmNpbmcgPSBzY29wZS5kZWYoXG4gICAgICAgIGVudi5zaGFyZWQuZXh0ZW5zaW9ucywgJy5hbmdsZV9pbnN0YW5jZWRfYXJyYXlzJylcbiAgICB9XG4gICAgZW1pdEJvZHkoZW52LCBzY29wZSwgYXJncywgcHJvZ3JhbSlcbiAgICByZXR1cm4gZW52LmNvbXBpbGUoKS5ib2R5XG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIERSQVcgUFJPQ1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIGVtaXREcmF3Qm9keSAoZW52LCBkcmF3LCBhcmdzLCBwcm9ncmFtKSB7XG4gICAgaW5qZWN0RXh0ZW5zaW9ucyhlbnYsIGRyYXcpXG4gICAgZW1pdEF0dHJpYnV0ZXMoZW52LCBkcmF3LCBhcmdzLCBwcm9ncmFtLmF0dHJpYnV0ZXMsIGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiB0cnVlXG4gICAgfSlcbiAgICBlbWl0VW5pZm9ybXMoZW52LCBkcmF3LCBhcmdzLCBwcm9ncmFtLnVuaWZvcm1zLCBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIH0pXG4gICAgZW1pdERyYXcoZW52LCBkcmF3LCBkcmF3LCBhcmdzKVxuICB9XG5cbiAgZnVuY3Rpb24gZW1pdERyYXdQcm9jIChlbnYsIGFyZ3MpIHtcbiAgICB2YXIgZHJhdyA9IGVudi5wcm9jKCdkcmF3JywgMSlcblxuICAgIGluamVjdEV4dGVuc2lvbnMoZW52LCBkcmF3KVxuXG4gICAgZW1pdENvbnRleHQoZW52LCBkcmF3LCBhcmdzLmNvbnRleHQpXG4gICAgZW1pdFBvbGxGcmFtZWJ1ZmZlcihlbnYsIGRyYXcsIGFyZ3MuZnJhbWVidWZmZXIpXG5cbiAgICBlbWl0UG9sbFN0YXRlKGVudiwgZHJhdywgYXJncylcbiAgICBlbWl0U2V0T3B0aW9ucyhlbnYsIGRyYXcsIGFyZ3Muc3RhdGUpXG5cbiAgICBlbWl0UHJvZmlsZShlbnYsIGRyYXcsIGFyZ3MsIGZhbHNlLCB0cnVlKVxuXG4gICAgdmFyIHByb2dyYW0gPSBhcmdzLnNoYWRlci5wcm9nVmFyLmFwcGVuZChlbnYsIGRyYXcpXG4gICAgZHJhdyhlbnYuc2hhcmVkLmdsLCAnLnVzZVByb2dyYW0oJywgcHJvZ3JhbSwgJy5wcm9ncmFtKTsnKVxuXG4gICAgaWYgKGFyZ3Muc2hhZGVyLnByb2dyYW0pIHtcbiAgICAgIGVtaXREcmF3Qm9keShlbnYsIGRyYXcsIGFyZ3MsIGFyZ3Muc2hhZGVyLnByb2dyYW0pXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBkcmF3Q2FjaGUgPSBlbnYuZ2xvYmFsLmRlZigne30nKVxuICAgICAgdmFyIFBST0dfSUQgPSBkcmF3LmRlZihwcm9ncmFtLCAnLmlkJylcbiAgICAgIHZhciBDQUNIRURfUFJPQyA9IGRyYXcuZGVmKGRyYXdDYWNoZSwgJ1snLCBQUk9HX0lELCAnXScpXG4gICAgICBkcmF3KFxuICAgICAgICBlbnYuY29uZChDQUNIRURfUFJPQylcbiAgICAgICAgICAudGhlbihDQUNIRURfUFJPQywgJy5jYWxsKHRoaXMsYTApOycpXG4gICAgICAgICAgLmVsc2UoXG4gICAgICAgICAgICBDQUNIRURfUFJPQywgJz0nLCBkcmF3Q2FjaGUsICdbJywgUFJPR19JRCwgJ109JyxcbiAgICAgICAgICAgIGVudi5saW5rKGZ1bmN0aW9uIChwcm9ncmFtKSB7XG4gICAgICAgICAgICAgIHJldHVybiBjcmVhdGVCb2R5KGVtaXREcmF3Qm9keSwgZW52LCBhcmdzLCBwcm9ncmFtLCAxKVxuICAgICAgICAgICAgfSksICcoJywgcHJvZ3JhbSwgJyk7JyxcbiAgICAgICAgICAgIENBQ0hFRF9QUk9DLCAnLmNhbGwodGhpcyxhMCk7JykpXG4gICAgfVxuXG4gICAgaWYgKE9iamVjdC5rZXlzKGFyZ3Muc3RhdGUpLmxlbmd0aCA+IDApIHtcbiAgICAgIGRyYXcoZW52LnNoYXJlZC5jdXJyZW50LCAnLmRpcnR5PXRydWU7JylcbiAgICB9XG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIEJBVENIIFBST0NcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gIGZ1bmN0aW9uIGVtaXRCYXRjaER5bmFtaWNTaGFkZXJCb2R5IChlbnYsIHNjb3BlLCBhcmdzLCBwcm9ncmFtKSB7XG4gICAgZW52LmJhdGNoSWQgPSAnYTEnXG5cbiAgICBpbmplY3RFeHRlbnNpb25zKGVudiwgc2NvcGUpXG5cbiAgICBmdW5jdGlvbiBhbGwgKCkge1xuICAgICAgcmV0dXJuIHRydWVcbiAgICB9XG5cbiAgICBlbWl0QXR0cmlidXRlcyhlbnYsIHNjb3BlLCBhcmdzLCBwcm9ncmFtLmF0dHJpYnV0ZXMsIGFsbClcbiAgICBlbWl0VW5pZm9ybXMoZW52LCBzY29wZSwgYXJncywgcHJvZ3JhbS51bmlmb3JtcywgYWxsKVxuICAgIGVtaXREcmF3KGVudiwgc2NvcGUsIHNjb3BlLCBhcmdzKVxuICB9XG5cbiAgZnVuY3Rpb24gZW1pdEJhdGNoQm9keSAoZW52LCBzY29wZSwgYXJncywgcHJvZ3JhbSkge1xuICAgIGluamVjdEV4dGVuc2lvbnMoZW52LCBzY29wZSlcblxuICAgIHZhciBjb250ZXh0RHluYW1pYyA9IGFyZ3MuY29udGV4dERlcFxuXG4gICAgdmFyIEJBVENIX0lEID0gc2NvcGUuZGVmKClcbiAgICB2YXIgUFJPUF9MSVNUID0gJ2EwJ1xuICAgIHZhciBOVU1fUFJPUFMgPSAnYTEnXG4gICAgdmFyIFBST1BTID0gc2NvcGUuZGVmKClcbiAgICBlbnYuc2hhcmVkLnByb3BzID0gUFJPUFNcbiAgICBlbnYuYmF0Y2hJZCA9IEJBVENIX0lEXG5cbiAgICB2YXIgb3V0ZXIgPSBlbnYuc2NvcGUoKVxuICAgIHZhciBpbm5lciA9IGVudi5zY29wZSgpXG5cbiAgICBzY29wZShcbiAgICAgIG91dGVyLmVudHJ5LFxuICAgICAgJ2ZvcignLCBCQVRDSF9JRCwgJz0wOycsIEJBVENIX0lELCAnPCcsIE5VTV9QUk9QUywgJzsrKycsIEJBVENIX0lELCAnKXsnLFxuICAgICAgUFJPUFMsICc9JywgUFJPUF9MSVNULCAnWycsIEJBVENIX0lELCAnXTsnLFxuICAgICAgaW5uZXIsXG4gICAgICAnfScsXG4gICAgICBvdXRlci5leGl0KVxuXG4gICAgZnVuY3Rpb24gaXNJbm5lckRlZm4gKGRlZm4pIHtcbiAgICAgIHJldHVybiAoKGRlZm4uY29udGV4dERlcCAmJiBjb250ZXh0RHluYW1pYykgfHwgZGVmbi5wcm9wRGVwKVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGlzT3V0ZXJEZWZuIChkZWZuKSB7XG4gICAgICByZXR1cm4gIWlzSW5uZXJEZWZuKGRlZm4pXG4gICAgfVxuXG4gICAgaWYgKGFyZ3MubmVlZHNDb250ZXh0KSB7XG4gICAgICBlbWl0Q29udGV4dChlbnYsIGlubmVyLCBhcmdzLmNvbnRleHQpXG4gICAgfVxuICAgIGlmIChhcmdzLm5lZWRzRnJhbWVidWZmZXIpIHtcbiAgICAgIGVtaXRQb2xsRnJhbWVidWZmZXIoZW52LCBpbm5lciwgYXJncy5mcmFtZWJ1ZmZlcilcbiAgICB9XG4gICAgZW1pdFNldE9wdGlvbnMoZW52LCBpbm5lciwgYXJncy5zdGF0ZSwgaXNJbm5lckRlZm4pXG5cbiAgICBpZiAoYXJncy5wcm9maWxlICYmIGlzSW5uZXJEZWZuKGFyZ3MucHJvZmlsZSkpIHtcbiAgICAgIGVtaXRQcm9maWxlKGVudiwgaW5uZXIsIGFyZ3MsIGZhbHNlLCB0cnVlKVxuICAgIH1cblxuICAgIGlmICghcHJvZ3JhbSkge1xuICAgICAgdmFyIHByb2dDYWNoZSA9IGVudi5nbG9iYWwuZGVmKCd7fScpXG4gICAgICB2YXIgUFJPR1JBTSA9IGFyZ3Muc2hhZGVyLnByb2dWYXIuYXBwZW5kKGVudiwgaW5uZXIpXG4gICAgICB2YXIgUFJPR19JRCA9IGlubmVyLmRlZihQUk9HUkFNLCAnLmlkJylcbiAgICAgIHZhciBDQUNIRURfUFJPQyA9IGlubmVyLmRlZihwcm9nQ2FjaGUsICdbJywgUFJPR19JRCwgJ10nKVxuICAgICAgaW5uZXIoXG4gICAgICAgIGVudi5zaGFyZWQuZ2wsICcudXNlUHJvZ3JhbSgnLCBQUk9HUkFNLCAnLnByb2dyYW0pOycsXG4gICAgICAgICdpZighJywgQ0FDSEVEX1BST0MsICcpeycsXG4gICAgICAgIENBQ0hFRF9QUk9DLCAnPScsIHByb2dDYWNoZSwgJ1snLCBQUk9HX0lELCAnXT0nLFxuICAgICAgICBlbnYubGluayhmdW5jdGlvbiAocHJvZ3JhbSkge1xuICAgICAgICAgIHJldHVybiBjcmVhdGVCb2R5KFxuICAgICAgICAgICAgZW1pdEJhdGNoRHluYW1pY1NoYWRlckJvZHksIGVudiwgYXJncywgcHJvZ3JhbSwgMilcbiAgICAgICAgfSksICcoJywgUFJPR1JBTSwgJyk7fScsXG4gICAgICAgIENBQ0hFRF9QUk9DLCAnLmNhbGwodGhpcyxhMFsnLCBCQVRDSF9JRCwgJ10sJywgQkFUQ0hfSUQsICcpOycpXG4gICAgfSBlbHNlIHtcbiAgICAgIGVtaXRBdHRyaWJ1dGVzKGVudiwgb3V0ZXIsIGFyZ3MsIHByb2dyYW0uYXR0cmlidXRlcywgaXNPdXRlckRlZm4pXG4gICAgICBlbWl0QXR0cmlidXRlcyhlbnYsIGlubmVyLCBhcmdzLCBwcm9ncmFtLmF0dHJpYnV0ZXMsIGlzSW5uZXJEZWZuKVxuICAgICAgZW1pdFVuaWZvcm1zKGVudiwgb3V0ZXIsIGFyZ3MsIHByb2dyYW0udW5pZm9ybXMsIGlzT3V0ZXJEZWZuKVxuICAgICAgZW1pdFVuaWZvcm1zKGVudiwgaW5uZXIsIGFyZ3MsIHByb2dyYW0udW5pZm9ybXMsIGlzSW5uZXJEZWZuKVxuICAgICAgZW1pdERyYXcoZW52LCBvdXRlciwgaW5uZXIsIGFyZ3MpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZW1pdEJhdGNoUHJvYyAoZW52LCBhcmdzKSB7XG4gICAgdmFyIGJhdGNoID0gZW52LnByb2MoJ2JhdGNoJywgMilcbiAgICBlbnYuYmF0Y2hJZCA9ICcwJ1xuXG4gICAgaW5qZWN0RXh0ZW5zaW9ucyhlbnYsIGJhdGNoKVxuXG4gICAgLy8gQ2hlY2sgaWYgYW55IGNvbnRleHQgdmFyaWFibGVzIGRlcGVuZCBvbiBwcm9wc1xuICAgIHZhciBjb250ZXh0RHluYW1pYyA9IGZhbHNlXG4gICAgdmFyIG5lZWRzQ29udGV4dCA9IHRydWVcbiAgICBPYmplY3Qua2V5cyhhcmdzLmNvbnRleHQpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIGNvbnRleHREeW5hbWljID0gY29udGV4dER5bmFtaWMgfHwgYXJncy5jb250ZXh0W25hbWVdLnByb3BEZXBcbiAgICB9KVxuICAgIGlmICghY29udGV4dER5bmFtaWMpIHtcbiAgICAgIGVtaXRDb250ZXh0KGVudiwgYmF0Y2gsIGFyZ3MuY29udGV4dClcbiAgICAgIG5lZWRzQ29udGV4dCA9IGZhbHNlXG4gICAgfVxuXG4gICAgLy8gZnJhbWVidWZmZXIgc3RhdGUgYWZmZWN0cyBmcmFtZWJ1ZmZlcldpZHRoL2hlaWdodCBjb250ZXh0IHZhcnNcbiAgICB2YXIgZnJhbWVidWZmZXIgPSBhcmdzLmZyYW1lYnVmZmVyXG4gICAgdmFyIG5lZWRzRnJhbWVidWZmZXIgPSBmYWxzZVxuICAgIGlmIChmcmFtZWJ1ZmZlcikge1xuICAgICAgaWYgKGZyYW1lYnVmZmVyLnByb3BEZXApIHtcbiAgICAgICAgY29udGV4dER5bmFtaWMgPSBuZWVkc0ZyYW1lYnVmZmVyID0gdHJ1ZVxuICAgICAgfSBlbHNlIGlmIChmcmFtZWJ1ZmZlci5jb250ZXh0RGVwICYmIGNvbnRleHREeW5hbWljKSB7XG4gICAgICAgIG5lZWRzRnJhbWVidWZmZXIgPSB0cnVlXG4gICAgICB9XG4gICAgICBpZiAoIW5lZWRzRnJhbWVidWZmZXIpIHtcbiAgICAgICAgZW1pdFBvbGxGcmFtZWJ1ZmZlcihlbnYsIGJhdGNoLCBmcmFtZWJ1ZmZlcilcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgZW1pdFBvbGxGcmFtZWJ1ZmZlcihlbnYsIGJhdGNoLCBudWxsKVxuICAgIH1cblxuICAgIC8vIHZpZXdwb3J0IGlzIHdlaXJkIGJlY2F1c2UgaXQgY2FuIGFmZmVjdCBjb250ZXh0IHZhcnNcbiAgICBpZiAoYXJncy5zdGF0ZS52aWV3cG9ydCAmJiBhcmdzLnN0YXRlLnZpZXdwb3J0LnByb3BEZXApIHtcbiAgICAgIGNvbnRleHREeW5hbWljID0gdHJ1ZVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGlzSW5uZXJEZWZuIChkZWZuKSB7XG4gICAgICByZXR1cm4gKGRlZm4uY29udGV4dERlcCAmJiBjb250ZXh0RHluYW1pYykgfHwgZGVmbi5wcm9wRGVwXG4gICAgfVxuXG4gICAgLy8gc2V0IHdlYmdsIG9wdGlvbnNcbiAgICBlbWl0UG9sbFN0YXRlKGVudiwgYmF0Y2gsIGFyZ3MpXG4gICAgZW1pdFNldE9wdGlvbnMoZW52LCBiYXRjaCwgYXJncy5zdGF0ZSwgZnVuY3Rpb24gKGRlZm4pIHtcbiAgICAgIHJldHVybiAhaXNJbm5lckRlZm4oZGVmbilcbiAgICB9KVxuXG4gICAgaWYgKCFhcmdzLnByb2ZpbGUgfHwgIWlzSW5uZXJEZWZuKGFyZ3MucHJvZmlsZSkpIHtcbiAgICAgIGVtaXRQcm9maWxlKGVudiwgYmF0Y2gsIGFyZ3MsIGZhbHNlLCAnYTEnKVxuICAgIH1cblxuICAgIC8vIFNhdmUgdGhlc2UgdmFsdWVzIHRvIGFyZ3Mgc28gdGhhdCB0aGUgYmF0Y2ggYm9keSByb3V0aW5lIGNhbiB1c2UgdGhlbVxuICAgIGFyZ3MuY29udGV4dERlcCA9IGNvbnRleHREeW5hbWljXG4gICAgYXJncy5uZWVkc0NvbnRleHQgPSBuZWVkc0NvbnRleHRcbiAgICBhcmdzLm5lZWRzRnJhbWVidWZmZXIgPSBuZWVkc0ZyYW1lYnVmZmVyXG5cbiAgICAvLyBkZXRlcm1pbmUgaWYgc2hhZGVyIGlzIGR5bmFtaWNcbiAgICB2YXIgcHJvZ0RlZm4gPSBhcmdzLnNoYWRlci5wcm9nVmFyXG4gICAgaWYgKChwcm9nRGVmbi5jb250ZXh0RGVwICYmIGNvbnRleHREeW5hbWljKSB8fCBwcm9nRGVmbi5wcm9wRGVwKSB7XG4gICAgICBlbWl0QmF0Y2hCb2R5KFxuICAgICAgICBlbnYsXG4gICAgICAgIGJhdGNoLFxuICAgICAgICBhcmdzLFxuICAgICAgICBudWxsKVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgUFJPR1JBTSA9IHByb2dEZWZuLmFwcGVuZChlbnYsIGJhdGNoKVxuICAgICAgYmF0Y2goZW52LnNoYXJlZC5nbCwgJy51c2VQcm9ncmFtKCcsIFBST0dSQU0sICcucHJvZ3JhbSk7JylcbiAgICAgIGlmIChhcmdzLnNoYWRlci5wcm9ncmFtKSB7XG4gICAgICAgIGVtaXRCYXRjaEJvZHkoXG4gICAgICAgICAgZW52LFxuICAgICAgICAgIGJhdGNoLFxuICAgICAgICAgIGFyZ3MsXG4gICAgICAgICAgYXJncy5zaGFkZXIucHJvZ3JhbSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBiYXRjaENhY2hlID0gZW52Lmdsb2JhbC5kZWYoJ3t9JylcbiAgICAgICAgdmFyIFBST0dfSUQgPSBiYXRjaC5kZWYoUFJPR1JBTSwgJy5pZCcpXG4gICAgICAgIHZhciBDQUNIRURfUFJPQyA9IGJhdGNoLmRlZihiYXRjaENhY2hlLCAnWycsIFBST0dfSUQsICddJylcbiAgICAgICAgYmF0Y2goXG4gICAgICAgICAgZW52LmNvbmQoQ0FDSEVEX1BST0MpXG4gICAgICAgICAgICAudGhlbihDQUNIRURfUFJPQywgJy5jYWxsKHRoaXMsYTAsYTEpOycpXG4gICAgICAgICAgICAuZWxzZShcbiAgICAgICAgICAgICAgQ0FDSEVEX1BST0MsICc9JywgYmF0Y2hDYWNoZSwgJ1snLCBQUk9HX0lELCAnXT0nLFxuICAgICAgICAgICAgICBlbnYubGluayhmdW5jdGlvbiAocHJvZ3JhbSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBjcmVhdGVCb2R5KGVtaXRCYXRjaEJvZHksIGVudiwgYXJncywgcHJvZ3JhbSwgMilcbiAgICAgICAgICAgICAgfSksICcoJywgUFJPR1JBTSwgJyk7JyxcbiAgICAgICAgICAgICAgQ0FDSEVEX1BST0MsICcuY2FsbCh0aGlzLGEwLGExKTsnKSlcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoT2JqZWN0LmtleXMoYXJncy5zdGF0ZSkubGVuZ3RoID4gMCkge1xuICAgICAgYmF0Y2goZW52LnNoYXJlZC5jdXJyZW50LCAnLmRpcnR5PXRydWU7JylcbiAgICB9XG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIFNDT1BFIENPTU1BTkRcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICBmdW5jdGlvbiBlbWl0U2NvcGVQcm9jIChlbnYsIGFyZ3MpIHtcbiAgICB2YXIgc2NvcGUgPSBlbnYucHJvYygnc2NvcGUnLCAzKVxuICAgIGVudi5iYXRjaElkID0gJ2EyJ1xuXG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcbiAgICB2YXIgQ1VSUkVOVF9TVEFURSA9IHNoYXJlZC5jdXJyZW50XG5cbiAgICBlbWl0Q29udGV4dChlbnYsIHNjb3BlLCBhcmdzLmNvbnRleHQpXG5cbiAgICBpZiAoYXJncy5mcmFtZWJ1ZmZlcikge1xuICAgICAgYXJncy5mcmFtZWJ1ZmZlci5hcHBlbmQoZW52LCBzY29wZSlcbiAgICB9XG5cbiAgICBzb3J0U3RhdGUoT2JqZWN0LmtleXMoYXJncy5zdGF0ZSkpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHZhciBkZWZuID0gYXJncy5zdGF0ZVtuYW1lXVxuICAgICAgdmFyIHZhbHVlID0gZGVmbi5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgIGlmIChpc0FycmF5TGlrZSh2YWx1ZSkpIHtcbiAgICAgICAgdmFsdWUuZm9yRWFjaChmdW5jdGlvbiAodiwgaSkge1xuICAgICAgICAgIHNjb3BlLnNldChlbnYubmV4dFtuYW1lXSwgJ1snICsgaSArICddJywgdilcbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNjb3BlLnNldChzaGFyZWQubmV4dCwgJy4nICsgbmFtZSwgdmFsdWUpXG4gICAgICB9XG4gICAgfSlcblxuICAgIGVtaXRQcm9maWxlKGVudiwgc2NvcGUsIGFyZ3MsIHRydWUsIHRydWUpXG5cbiAgICA7W1NfRUxFTUVOVFMsIFNfT0ZGU0VULCBTX0NPVU5ULCBTX0lOU1RBTkNFUywgU19QUklNSVRJVkVdLmZvckVhY2goXG4gICAgICBmdW5jdGlvbiAob3B0KSB7XG4gICAgICAgIHZhciB2YXJpYWJsZSA9IGFyZ3MuZHJhd1tvcHRdXG4gICAgICAgIGlmICghdmFyaWFibGUpIHtcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuICAgICAgICBzY29wZS5zZXQoc2hhcmVkLmRyYXcsICcuJyArIG9wdCwgJycgKyB2YXJpYWJsZS5hcHBlbmQoZW52LCBzY29wZSkpXG4gICAgICB9KVxuXG4gICAgT2JqZWN0LmtleXMoYXJncy51bmlmb3JtcykuZm9yRWFjaChmdW5jdGlvbiAob3B0KSB7XG4gICAgICBzY29wZS5zZXQoXG4gICAgICAgIHNoYXJlZC51bmlmb3JtcyxcbiAgICAgICAgJ1snICsgc3RyaW5nU3RvcmUuaWQob3B0KSArICddJyxcbiAgICAgICAgYXJncy51bmlmb3Jtc1tvcHRdLmFwcGVuZChlbnYsIHNjb3BlKSlcbiAgICB9KVxuXG4gICAgT2JqZWN0LmtleXMoYXJncy5hdHRyaWJ1dGVzKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICB2YXIgcmVjb3JkID0gYXJncy5hdHRyaWJ1dGVzW25hbWVdLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgdmFyIHNjb3BlQXR0cmliID0gZW52LnNjb3BlQXR0cmliKG5hbWUpXG4gICAgICBPYmplY3Qua2V5cyhuZXcgQXR0cmlidXRlUmVjb3JkKCkpLmZvckVhY2goZnVuY3Rpb24gKHByb3ApIHtcbiAgICAgICAgc2NvcGUuc2V0KHNjb3BlQXR0cmliLCAnLicgKyBwcm9wLCByZWNvcmRbcHJvcF0pXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBmdW5jdGlvbiBzYXZlU2hhZGVyIChuYW1lKSB7XG4gICAgICB2YXIgc2hhZGVyID0gYXJncy5zaGFkZXJbbmFtZV1cbiAgICAgIGlmIChzaGFkZXIpIHtcbiAgICAgICAgc2NvcGUuc2V0KHNoYXJlZC5zaGFkZXIsICcuJyArIG5hbWUsIHNoYWRlci5hcHBlbmQoZW52LCBzY29wZSkpXG4gICAgICB9XG4gICAgfVxuICAgIHNhdmVTaGFkZXIoU19WRVJUKVxuICAgIHNhdmVTaGFkZXIoU19GUkFHKVxuXG4gICAgaWYgKE9iamVjdC5rZXlzKGFyZ3Muc3RhdGUpLmxlbmd0aCA+IDApIHtcbiAgICAgIHNjb3BlKENVUlJFTlRfU1RBVEUsICcuZGlydHk9dHJ1ZTsnKVxuICAgICAgc2NvcGUuZXhpdChDVVJSRU5UX1NUQVRFLCAnLmRpcnR5PXRydWU7JylcbiAgICB9XG5cbiAgICBzY29wZSgnYTEoJywgZW52LnNoYXJlZC5jb250ZXh0LCAnLGEwLCcsIGVudi5iYXRjaElkLCAnKTsnKVxuICB9XG5cbiAgZnVuY3Rpb24gaXNEeW5hbWljT2JqZWN0IChvYmplY3QpIHtcbiAgICBpZiAodHlwZW9mIG9iamVjdCAhPT0gJ29iamVjdCcgfHwgaXNBcnJheUxpa2Uob2JqZWN0KSkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIHZhciBwcm9wcyA9IE9iamVjdC5rZXlzKG9iamVjdClcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHByb3BzLmxlbmd0aDsgKytpKSB7XG4gICAgICBpZiAoZHluYW1pYy5pc0R5bmFtaWMob2JqZWN0W3Byb3BzW2ldXSkpIHtcbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cblxuICBmdW5jdGlvbiBzcGxhdE9iamVjdCAoZW52LCBvcHRpb25zLCBuYW1lKSB7XG4gICAgdmFyIG9iamVjdCA9IG9wdGlvbnMuc3RhdGljW25hbWVdXG4gICAgaWYgKCFvYmplY3QgfHwgIWlzRHluYW1pY09iamVjdChvYmplY3QpKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICB2YXIgZ2xvYmFscyA9IGVudi5nbG9iYWxcbiAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKG9iamVjdClcbiAgICB2YXIgdGhpc0RlcCA9IGZhbHNlXG4gICAgdmFyIGNvbnRleHREZXAgPSBmYWxzZVxuICAgIHZhciBwcm9wRGVwID0gZmFsc2VcbiAgICB2YXIgb2JqZWN0UmVmID0gZW52Lmdsb2JhbC5kZWYoJ3t9JylcbiAgICBrZXlzLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgdmFyIHZhbHVlID0gb2JqZWN0W2tleV1cbiAgICAgIGlmIChkeW5hbWljLmlzRHluYW1pYyh2YWx1ZSkpIHtcbiAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgIHZhbHVlID0gb2JqZWN0W2tleV0gPSBkeW5hbWljLnVuYm94KHZhbHVlKVxuICAgICAgICB9XG4gICAgICAgIHZhciBkZXBzID0gY3JlYXRlRHluYW1pY0RlY2wodmFsdWUsIG51bGwpXG4gICAgICAgIHRoaXNEZXAgPSB0aGlzRGVwIHx8IGRlcHMudGhpc0RlcFxuICAgICAgICBwcm9wRGVwID0gcHJvcERlcCB8fCBkZXBzLnByb3BEZXBcbiAgICAgICAgY29udGV4dERlcCA9IGNvbnRleHREZXAgfHwgZGVwcy5jb250ZXh0RGVwXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBnbG9iYWxzKG9iamVjdFJlZiwgJy4nLCBrZXksICc9JylcbiAgICAgICAgc3dpdGNoICh0eXBlb2YgdmFsdWUpIHtcbiAgICAgICAgICBjYXNlICdudW1iZXInOlxuICAgICAgICAgICAgZ2xvYmFscyh2YWx1ZSlcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgICAgICAgIGdsb2JhbHMoJ1wiJywgdmFsdWUsICdcIicpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcbiAgICAgICAgICAgICAgZ2xvYmFscygnWycsIHZhbHVlLmpvaW4oKSwgJ10nKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgZ2xvYmFscyhlbnYubGluayh2YWx1ZSkpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICB9XG4gICAgICAgIGdsb2JhbHMoJzsnKVxuICAgICAgfVxuICAgIH0pXG5cbiAgICBmdW5jdGlvbiBhcHBlbmRCbG9jayAoZW52LCBibG9jaykge1xuICAgICAga2V5cy5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgdmFyIHZhbHVlID0gb2JqZWN0W2tleV1cbiAgICAgICAgaWYgKCFkeW5hbWljLmlzRHluYW1pYyh2YWx1ZSkpIHtcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuICAgICAgICB2YXIgcmVmID0gZW52Lmludm9rZShibG9jaywgdmFsdWUpXG4gICAgICAgIGJsb2NrKG9iamVjdFJlZiwgJy4nLCBrZXksICc9JywgcmVmLCAnOycpXG4gICAgICB9KVxuICAgIH1cblxuICAgIG9wdGlvbnMuZHluYW1pY1tuYW1lXSA9IG5ldyBkeW5hbWljLkR5bmFtaWNWYXJpYWJsZShEWU5fVEhVTkssIHtcbiAgICAgIHRoaXNEZXA6IHRoaXNEZXAsXG4gICAgICBjb250ZXh0RGVwOiBjb250ZXh0RGVwLFxuICAgICAgcHJvcERlcDogcHJvcERlcCxcbiAgICAgIHJlZjogb2JqZWN0UmVmLFxuICAgICAgYXBwZW5kOiBhcHBlbmRCbG9ja1xuICAgIH0pXG4gICAgZGVsZXRlIG9wdGlvbnMuc3RhdGljW25hbWVdXG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIE1BSU4gRFJBVyBDT01NQU5EXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgZnVuY3Rpb24gY29tcGlsZUNvbW1hbmQgKG9wdGlvbnMsIGF0dHJpYnV0ZXMsIHVuaWZvcm1zLCBjb250ZXh0LCBzdGF0cykge1xuICAgIHZhciBlbnYgPSBjcmVhdGVSRUdMRW52aXJvbm1lbnQoKVxuXG4gICAgLy8gbGluayBzdGF0cywgc28gdGhhdCB3ZSBjYW4gZWFzaWx5IGFjY2VzcyBpdCBpbiB0aGUgcHJvZ3JhbS5cbiAgICBlbnYuc3RhdHMgPSBlbnYubGluayhzdGF0cylcblxuICAgIC8vIHNwbGF0IG9wdGlvbnMgYW5kIGF0dHJpYnV0ZXMgdG8gYWxsb3cgZm9yIGR5bmFtaWMgbmVzdGVkIHByb3BlcnRpZXNcbiAgICBPYmplY3Qua2V5cyhhdHRyaWJ1dGVzLnN0YXRpYykuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICBzcGxhdE9iamVjdChlbnYsIGF0dHJpYnV0ZXMsIGtleSlcbiAgICB9KVxuICAgIE5FU1RFRF9PUFRJT05TLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHNwbGF0T2JqZWN0KGVudiwgb3B0aW9ucywgbmFtZSlcbiAgICB9KVxuXG4gICAgdmFyIGFyZ3MgPSBwYXJzZUFyZ3VtZW50cyhvcHRpb25zLCBhdHRyaWJ1dGVzLCB1bmlmb3JtcywgY29udGV4dCwgZW52KVxuXG4gICAgZW1pdERyYXdQcm9jKGVudiwgYXJncylcbiAgICBlbWl0U2NvcGVQcm9jKGVudiwgYXJncylcbiAgICBlbWl0QmF0Y2hQcm9jKGVudiwgYXJncylcblxuICAgIHJldHVybiBlbnYuY29tcGlsZSgpXG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIFBPTEwgLyBSRUZSRVNIXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgcmV0dXJuIHtcbiAgICBuZXh0OiBuZXh0U3RhdGUsXG4gICAgY3VycmVudDogY3VycmVudFN0YXRlLFxuICAgIHByb2NzOiAoZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIGVudiA9IGNyZWF0ZVJFR0xFbnZpcm9ubWVudCgpXG4gICAgICB2YXIgcG9sbCA9IGVudi5wcm9jKCdwb2xsJylcbiAgICAgIHZhciByZWZyZXNoID0gZW52LnByb2MoJ3JlZnJlc2gnKVxuICAgICAgdmFyIGNvbW1vbiA9IGVudi5ibG9jaygpXG4gICAgICBwb2xsKGNvbW1vbilcbiAgICAgIHJlZnJlc2goY29tbW9uKVxuXG4gICAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuICAgICAgdmFyIEdMID0gc2hhcmVkLmdsXG4gICAgICB2YXIgTkVYVF9TVEFURSA9IHNoYXJlZC5uZXh0XG4gICAgICB2YXIgQ1VSUkVOVF9TVEFURSA9IHNoYXJlZC5jdXJyZW50XG5cbiAgICAgIGNvbW1vbihDVVJSRU5UX1NUQVRFLCAnLmRpcnR5PWZhbHNlOycpXG5cbiAgICAgIGVtaXRQb2xsRnJhbWVidWZmZXIoZW52LCBwb2xsKVxuICAgICAgZW1pdFBvbGxGcmFtZWJ1ZmZlcihlbnYsIHJlZnJlc2gsIG51bGwsIHRydWUpXG5cbiAgICAgIC8vIFJlZnJlc2ggdXBkYXRlcyBhbGwgYXR0cmlidXRlIHN0YXRlIGNoYW5nZXNcbiAgICAgIHZhciBleHRJbnN0YW5jaW5nID0gZ2wuZ2V0RXh0ZW5zaW9uKCdhbmdsZV9pbnN0YW5jZWRfYXJyYXlzJylcbiAgICAgIHZhciBJTlNUQU5DSU5HXG4gICAgICBpZiAoZXh0SW5zdGFuY2luZykge1xuICAgICAgICBJTlNUQU5DSU5HID0gZW52LmxpbmsoZXh0SW5zdGFuY2luZylcbiAgICAgIH1cbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGltaXRzLm1heEF0dHJpYnV0ZXM7ICsraSkge1xuICAgICAgICB2YXIgQklORElORyA9IHJlZnJlc2guZGVmKHNoYXJlZC5hdHRyaWJ1dGVzLCAnWycsIGksICddJylcbiAgICAgICAgdmFyIGlmdGUgPSBlbnYuY29uZChCSU5ESU5HLCAnLmJ1ZmZlcicpXG4gICAgICAgIGlmdGUudGhlbihcbiAgICAgICAgICBHTCwgJy5lbmFibGVWZXJ0ZXhBdHRyaWJBcnJheSgnLCBpLCAnKTsnLFxuICAgICAgICAgIEdMLCAnLmJpbmRCdWZmZXIoJyxcbiAgICAgICAgICAgIEdMX0FSUkFZX0JVRkZFUiwgJywnLFxuICAgICAgICAgICAgQklORElORywgJy5idWZmZXIuYnVmZmVyKTsnLFxuICAgICAgICAgIEdMLCAnLnZlcnRleEF0dHJpYlBvaW50ZXIoJyxcbiAgICAgICAgICAgIGksICcsJyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcuc2l6ZSwnLFxuICAgICAgICAgICAgQklORElORywgJy50eXBlLCcsXG4gICAgICAgICAgICBCSU5ESU5HLCAnLm5vcm1hbGl6ZWQsJyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcuc3RyaWRlLCcsXG4gICAgICAgICAgICBCSU5ESU5HLCAnLm9mZnNldCk7J1xuICAgICAgICApLmVsc2UoXG4gICAgICAgICAgR0wsICcuZGlzYWJsZVZlcnRleEF0dHJpYkFycmF5KCcsIGksICcpOycsXG4gICAgICAgICAgR0wsICcudmVydGV4QXR0cmliNGYoJyxcbiAgICAgICAgICAgIGksICcsJyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcueCwnLFxuICAgICAgICAgICAgQklORElORywgJy55LCcsXG4gICAgICAgICAgICBCSU5ESU5HLCAnLnosJyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcudyk7JyxcbiAgICAgICAgICBCSU5ESU5HLCAnLmJ1ZmZlcj1udWxsOycpXG4gICAgICAgIHJlZnJlc2goaWZ0ZSlcbiAgICAgICAgaWYgKGV4dEluc3RhbmNpbmcpIHtcbiAgICAgICAgICByZWZyZXNoKFxuICAgICAgICAgICAgSU5TVEFOQ0lORywgJy52ZXJ0ZXhBdHRyaWJEaXZpc29yQU5HTEUoJyxcbiAgICAgICAgICAgIGksICcsJyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcuZGl2aXNvcik7JylcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBPYmplY3Qua2V5cyhHTF9GTEFHUykuZm9yRWFjaChmdW5jdGlvbiAoZmxhZykge1xuICAgICAgICB2YXIgY2FwID0gR0xfRkxBR1NbZmxhZ11cbiAgICAgICAgdmFyIE5FWFQgPSBjb21tb24uZGVmKE5FWFRfU1RBVEUsICcuJywgZmxhZylcbiAgICAgICAgdmFyIGJsb2NrID0gZW52LmJsb2NrKClcbiAgICAgICAgYmxvY2soJ2lmKCcsIE5FWFQsICcpeycsXG4gICAgICAgICAgR0wsICcuZW5hYmxlKCcsIGNhcCwgJyl9ZWxzZXsnLFxuICAgICAgICAgIEdMLCAnLmRpc2FibGUoJywgY2FwLCAnKX0nLFxuICAgICAgICAgIENVUlJFTlRfU1RBVEUsICcuJywgZmxhZywgJz0nLCBORVhULCAnOycpXG4gICAgICAgIHJlZnJlc2goYmxvY2spXG4gICAgICAgIHBvbGwoXG4gICAgICAgICAgJ2lmKCcsIE5FWFQsICchPT0nLCBDVVJSRU5UX1NUQVRFLCAnLicsIGZsYWcsICcpeycsXG4gICAgICAgICAgYmxvY2ssXG4gICAgICAgICAgJ30nKVxuICAgICAgfSlcblxuICAgICAgT2JqZWN0LmtleXMoR0xfVkFSSUFCTEVTKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICAgIHZhciBmdW5jID0gR0xfVkFSSUFCTEVTW25hbWVdXG4gICAgICAgIHZhciBpbml0ID0gY3VycmVudFN0YXRlW25hbWVdXG4gICAgICAgIHZhciBORVhULCBDVVJSRU5UXG4gICAgICAgIHZhciBibG9jayA9IGVudi5ibG9jaygpXG4gICAgICAgIGJsb2NrKEdMLCAnLicsIGZ1bmMsICcoJylcbiAgICAgICAgaWYgKGlzQXJyYXlMaWtlKGluaXQpKSB7XG4gICAgICAgICAgdmFyIG4gPSBpbml0Lmxlbmd0aFxuICAgICAgICAgIE5FWFQgPSBlbnYuZ2xvYmFsLmRlZihORVhUX1NUQVRFLCAnLicsIG5hbWUpXG4gICAgICAgICAgQ1VSUkVOVCA9IGVudi5nbG9iYWwuZGVmKENVUlJFTlRfU1RBVEUsICcuJywgbmFtZSlcbiAgICAgICAgICBibG9jayhcbiAgICAgICAgICAgIGxvb3AobiwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIE5FWFQgKyAnWycgKyBpICsgJ10nXG4gICAgICAgICAgICB9KSwgJyk7JyxcbiAgICAgICAgICAgIGxvb3AobiwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIENVUlJFTlQgKyAnWycgKyBpICsgJ109JyArIE5FWFQgKyAnWycgKyBpICsgJ107J1xuICAgICAgICAgICAgfSkuam9pbignJykpXG4gICAgICAgICAgcG9sbChcbiAgICAgICAgICAgICdpZignLCBsb29wKG4sIGZ1bmN0aW9uIChpKSB7XG4gICAgICAgICAgICAgIHJldHVybiBORVhUICsgJ1snICsgaSArICddIT09JyArIENVUlJFTlQgKyAnWycgKyBpICsgJ10nXG4gICAgICAgICAgICB9KS5qb2luKCd8fCcpLCAnKXsnLFxuICAgICAgICAgICAgYmxvY2ssXG4gICAgICAgICAgICAnfScpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgTkVYVCA9IGNvbW1vbi5kZWYoTkVYVF9TVEFURSwgJy4nLCBuYW1lKVxuICAgICAgICAgIENVUlJFTlQgPSBjb21tb24uZGVmKENVUlJFTlRfU1RBVEUsICcuJywgbmFtZSlcbiAgICAgICAgICBibG9jayhcbiAgICAgICAgICAgIE5FWFQsICcpOycsXG4gICAgICAgICAgICBDVVJSRU5UX1NUQVRFLCAnLicsIG5hbWUsICc9JywgTkVYVCwgJzsnKVxuICAgICAgICAgIHBvbGwoXG4gICAgICAgICAgICAnaWYoJywgTkVYVCwgJyE9PScsIENVUlJFTlQsICcpeycsXG4gICAgICAgICAgICBibG9jayxcbiAgICAgICAgICAgICd9JylcbiAgICAgICAgfVxuICAgICAgICByZWZyZXNoKGJsb2NrKVxuICAgICAgfSlcblxuICAgICAgcmV0dXJuIGVudi5jb21waWxlKClcbiAgICB9KSgpLFxuICAgIGNvbXBpbGU6IGNvbXBpbGVDb21tYW5kXG4gIH1cbn1cbiIsInZhciBWQVJJQUJMRV9DT1VOVEVSID0gMFxuXG52YXIgRFlOX0ZVTkMgPSAwXG5cbmZ1bmN0aW9uIER5bmFtaWNWYXJpYWJsZSAodHlwZSwgZGF0YSkge1xuICB0aGlzLmlkID0gKFZBUklBQkxFX0NPVU5URVIrKylcbiAgdGhpcy50eXBlID0gdHlwZVxuICB0aGlzLmRhdGEgPSBkYXRhXG59XG5cbmZ1bmN0aW9uIGVzY2FwZVN0ciAoc3RyKSB7XG4gIHJldHVybiBzdHIucmVwbGFjZSgvXFxcXC9nLCAnXFxcXFxcXFwnKS5yZXBsYWNlKC9cIi9nLCAnXFxcXFwiJylcbn1cblxuZnVuY3Rpb24gc3BsaXRQYXJ0cyAoc3RyKSB7XG4gIGlmIChzdHIubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIFtdXG4gIH1cblxuICB2YXIgZmlyc3RDaGFyID0gc3RyLmNoYXJBdCgwKVxuICB2YXIgbGFzdENoYXIgPSBzdHIuY2hhckF0KHN0ci5sZW5ndGggLSAxKVxuXG4gIGlmIChzdHIubGVuZ3RoID4gMSAmJlxuICAgICAgZmlyc3RDaGFyID09PSBsYXN0Q2hhciAmJlxuICAgICAgKGZpcnN0Q2hhciA9PT0gJ1wiJyB8fCBmaXJzdENoYXIgPT09IFwiJ1wiKSkge1xuICAgIHJldHVybiBbJ1wiJyArIGVzY2FwZVN0cihzdHIuc3Vic3RyKDEsIHN0ci5sZW5ndGggLSAyKSkgKyAnXCInXVxuICB9XG5cbiAgdmFyIHBhcnRzID0gL1xcWyhmYWxzZXx0cnVlfG51bGx8XFxkK3wnW14nXSonfFwiW15cIl0qXCIpXFxdLy5leGVjKHN0cilcbiAgaWYgKHBhcnRzKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHNwbGl0UGFydHMoc3RyLnN1YnN0cigwLCBwYXJ0cy5pbmRleCkpXG4gICAgICAuY29uY2F0KHNwbGl0UGFydHMocGFydHNbMV0pKVxuICAgICAgLmNvbmNhdChzcGxpdFBhcnRzKHN0ci5zdWJzdHIocGFydHMuaW5kZXggKyBwYXJ0c1swXS5sZW5ndGgpKSlcbiAgICApXG4gIH1cblxuICB2YXIgc3VicGFydHMgPSBzdHIuc3BsaXQoJy4nKVxuICBpZiAoc3VicGFydHMubGVuZ3RoID09PSAxKSB7XG4gICAgcmV0dXJuIFsnXCInICsgZXNjYXBlU3RyKHN0cikgKyAnXCInXVxuICB9XG5cbiAgdmFyIHJlc3VsdCA9IFtdXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3VicGFydHMubGVuZ3RoOyArK2kpIHtcbiAgICByZXN1bHQgPSByZXN1bHQuY29uY2F0KHNwbGl0UGFydHMoc3VicGFydHNbaV0pKVxuICB9XG4gIHJldHVybiByZXN1bHRcbn1cblxuZnVuY3Rpb24gdG9BY2Nlc3NvclN0cmluZyAoc3RyKSB7XG4gIHJldHVybiAnWycgKyBzcGxpdFBhcnRzKHN0cikuam9pbignXVsnKSArICddJ1xufVxuXG5mdW5jdGlvbiBkZWZpbmVEeW5hbWljICh0eXBlLCBkYXRhKSB7XG4gIHJldHVybiBuZXcgRHluYW1pY1ZhcmlhYmxlKHR5cGUsIHRvQWNjZXNzb3JTdHJpbmcoZGF0YSArICcnKSlcbn1cblxuZnVuY3Rpb24gaXNEeW5hbWljICh4KSB7XG4gIHJldHVybiAodHlwZW9mIHggPT09ICdmdW5jdGlvbicgJiYgIXguX3JlZ2xUeXBlKSB8fFxuICAgICAgICAgeCBpbnN0YW5jZW9mIER5bmFtaWNWYXJpYWJsZVxufVxuXG5mdW5jdGlvbiB1bmJveCAoeCwgcGF0aCkge1xuICBpZiAodHlwZW9mIHggPT09ICdmdW5jdGlvbicpIHtcbiAgICByZXR1cm4gbmV3IER5bmFtaWNWYXJpYWJsZShEWU5fRlVOQywgeClcbiAgfVxuICByZXR1cm4geFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgRHluYW1pY1ZhcmlhYmxlOiBEeW5hbWljVmFyaWFibGUsXG4gIGRlZmluZTogZGVmaW5lRHluYW1pYyxcbiAgaXNEeW5hbWljOiBpc0R5bmFtaWMsXG4gIHVuYm94OiB1bmJveCxcbiAgYWNjZXNzb3I6IHRvQWNjZXNzb3JTdHJpbmdcbn1cbiIsIlxudmFyIGlzVHlwZWRBcnJheSA9IHJlcXVpcmUoJy4vdXRpbC9pcy10eXBlZC1hcnJheScpXG52YXIgaXNOREFycmF5TGlrZSA9IHJlcXVpcmUoJy4vdXRpbC9pcy1uZGFycmF5JylcbnZhciB2YWx1ZXMgPSByZXF1aXJlKCcuL3V0aWwvdmFsdWVzJylcblxudmFyIHByaW1UeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL3ByaW1pdGl2ZXMuanNvbicpXG52YXIgdXNhZ2VUeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL3VzYWdlLmpzb24nKVxuXG52YXIgR0xfUE9JTlRTID0gMFxudmFyIEdMX0xJTkVTID0gMVxudmFyIEdMX1RSSUFOR0xFUyA9IDRcblxudmFyIEdMX0JZVEUgPSA1MTIwXG52YXIgR0xfVU5TSUdORURfQllURSA9IDUxMjFcbnZhciBHTF9TSE9SVCA9IDUxMjJcbnZhciBHTF9VTlNJR05FRF9TSE9SVCA9IDUxMjNcbnZhciBHTF9JTlQgPSA1MTI0XG52YXIgR0xfVU5TSUdORURfSU5UID0gNTEyNVxuXG52YXIgR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIgPSAzNDk2M1xuXG52YXIgR0xfU1RSRUFNX0RSQVcgPSAweDg4RTBcbnZhciBHTF9TVEFUSUNfRFJBVyA9IDB4ODhFNFxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBFbGVtZW50c1N0YXRlIChnbCwgZXh0ZW5zaW9ucywgYnVmZmVyU3RhdGUsIHN0YXRzKSB7XG4gIHZhciBlbGVtZW50U2V0ID0ge31cbiAgdmFyIGVsZW1lbnRDb3VudCA9IDBcblxuICB2YXIgZWxlbWVudFR5cGVzID0ge1xuICAgICd1aW50OCc6IEdMX1VOU0lHTkVEX0JZVEUsXG4gICAgJ3VpbnQxNic6IEdMX1VOU0lHTkVEX1NIT1JUXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5vZXNfZWxlbWVudF9pbmRleF91aW50KSB7XG4gICAgZWxlbWVudFR5cGVzLnVpbnQzMiA9IEdMX1VOU0lHTkVEX0lOVFxuICB9XG5cbiAgZnVuY3Rpb24gUkVHTEVsZW1lbnRCdWZmZXIgKGJ1ZmZlcikge1xuICAgIHRoaXMuaWQgPSBlbGVtZW50Q291bnQrK1xuICAgIGVsZW1lbnRTZXRbdGhpcy5pZF0gPSB0aGlzXG4gICAgdGhpcy5idWZmZXIgPSBidWZmZXJcbiAgICB0aGlzLnByaW1UeXBlID0gR0xfVFJJQU5HTEVTXG4gICAgdGhpcy52ZXJ0Q291bnQgPSAwXG4gICAgdGhpcy50eXBlID0gMFxuICB9XG5cbiAgUkVHTEVsZW1lbnRCdWZmZXIucHJvdG90eXBlLmJpbmQgPSBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5idWZmZXIuYmluZCgpXG4gIH1cblxuICB2YXIgYnVmZmVyUG9vbCA9IFtdXG5cbiAgZnVuY3Rpb24gY3JlYXRlRWxlbWVudFN0cmVhbSAoZGF0YSkge1xuICAgIHZhciByZXN1bHQgPSBidWZmZXJQb29sLnBvcCgpXG4gICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgIHJlc3VsdCA9IG5ldyBSRUdMRWxlbWVudEJ1ZmZlcihidWZmZXJTdGF0ZS5jcmVhdGUoXG4gICAgICAgIG51bGwsXG4gICAgICAgIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSLFxuICAgICAgICB0cnVlLFxuICAgICAgICBmYWxzZSkuX2J1ZmZlcilcbiAgICB9XG4gICAgaW5pdEVsZW1lbnRzKHJlc3VsdCwgZGF0YSwgR0xfU1RSRUFNX0RSQVcsIC0xLCAtMSwgMCwgMClcbiAgICByZXR1cm4gcmVzdWx0XG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95RWxlbWVudFN0cmVhbSAoZWxlbWVudHMpIHtcbiAgICBidWZmZXJQb29sLnB1c2goZWxlbWVudHMpXG4gIH1cblxuICBmdW5jdGlvbiBpbml0RWxlbWVudHMgKFxuICAgIGVsZW1lbnRzLFxuICAgIGRhdGEsXG4gICAgdXNhZ2UsXG4gICAgcHJpbSxcbiAgICBjb3VudCxcbiAgICBieXRlTGVuZ3RoLFxuICAgIHR5cGUpIHtcbiAgICBlbGVtZW50cy5idWZmZXIuYmluZCgpXG4gICAgaWYgKGRhdGEpIHtcbiAgICAgIHZhciBwcmVkaWN0ZWRUeXBlID0gdHlwZVxuICAgICAgaWYgKCF0eXBlICYmIChcbiAgICAgICAgICAhaXNUeXBlZEFycmF5KGRhdGEpIHx8XG4gICAgICAgICAoaXNOREFycmF5TGlrZShkYXRhKSAmJiAhaXNUeXBlZEFycmF5KGRhdGEuZGF0YSkpKSkge1xuICAgICAgICBwcmVkaWN0ZWRUeXBlID0gZXh0ZW5zaW9ucy5vZXNfZWxlbWVudF9pbmRleF91aW50XG4gICAgICAgICAgPyBHTF9VTlNJR05FRF9JTlRcbiAgICAgICAgICA6IEdMX1VOU0lHTkVEX1NIT1JUXG4gICAgICB9XG4gICAgICBidWZmZXJTdGF0ZS5faW5pdEJ1ZmZlcihcbiAgICAgICAgZWxlbWVudHMuYnVmZmVyLFxuICAgICAgICBkYXRhLFxuICAgICAgICB1c2FnZSxcbiAgICAgICAgcHJlZGljdGVkVHlwZSxcbiAgICAgICAgMylcbiAgICB9IGVsc2Uge1xuICAgICAgZ2wuYnVmZmVyRGF0YShHTF9FTEVNRU5UX0FSUkFZX0JVRkZFUiwgYnl0ZUxlbmd0aCwgdXNhZ2UpXG4gICAgICBlbGVtZW50cy5idWZmZXIuZHR5cGUgPSBkdHlwZSB8fCBHTF9VTlNJR05FRF9CWVRFXG4gICAgICBlbGVtZW50cy5idWZmZXIudXNhZ2UgPSB1c2FnZVxuICAgICAgZWxlbWVudHMuYnVmZmVyLmRpbWVuc2lvbiA9IDNcbiAgICAgIGVsZW1lbnRzLmJ1ZmZlci5ieXRlTGVuZ3RoID0gYnl0ZUxlbmd0aFxuICAgIH1cblxuICAgIHZhciBkdHlwZSA9IHR5cGVcbiAgICBpZiAoIXR5cGUpIHtcbiAgICAgIHN3aXRjaCAoZWxlbWVudHMuYnVmZmVyLmR0eXBlKSB7XG4gICAgICAgIGNhc2UgR0xfVU5TSUdORURfQllURTpcbiAgICAgICAgY2FzZSBHTF9CWVRFOlxuICAgICAgICAgIGR0eXBlID0gR0xfVU5TSUdORURfQllURVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9TSE9SVDpcbiAgICAgICAgY2FzZSBHTF9TSE9SVDpcbiAgICAgICAgICBkdHlwZSA9IEdMX1VOU0lHTkVEX1NIT1JUXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX0lOVDpcbiAgICAgICAgY2FzZSBHTF9JTlQ6XG4gICAgICAgICAgZHR5cGUgPSBHTF9VTlNJR05FRF9JTlRcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgXG4gICAgICB9XG4gICAgICBlbGVtZW50cy5idWZmZXIuZHR5cGUgPSBkdHlwZVxuICAgIH1cbiAgICBlbGVtZW50cy50eXBlID0gZHR5cGVcblxuICAgIC8vIENoZWNrIG9lc19lbGVtZW50X2luZGV4X3VpbnQgZXh0ZW5zaW9uXG4gICAgXG5cbiAgICAvLyB0cnkgdG8gZ3Vlc3MgZGVmYXVsdCBwcmltaXRpdmUgdHlwZSBhbmQgYXJndW1lbnRzXG4gICAgdmFyIHZlcnRDb3VudCA9IGNvdW50XG4gICAgaWYgKHZlcnRDb3VudCA8IDApIHtcbiAgICAgIHZlcnRDb3VudCA9IGVsZW1lbnRzLmJ1ZmZlci5ieXRlTGVuZ3RoXG4gICAgICBpZiAoZHR5cGUgPT09IEdMX1VOU0lHTkVEX1NIT1JUKSB7XG4gICAgICAgIHZlcnRDb3VudCA+Pj0gMVxuICAgICAgfSBlbHNlIGlmIChkdHlwZSA9PT0gR0xfVU5TSUdORURfSU5UKSB7XG4gICAgICAgIHZlcnRDb3VudCA+Pj0gMlxuICAgICAgfVxuICAgIH1cbiAgICBlbGVtZW50cy52ZXJ0Q291bnQgPSB2ZXJ0Q291bnRcblxuICAgIC8vIHRyeSB0byBndWVzcyBwcmltaXRpdmUgdHlwZSBmcm9tIGNlbGwgZGltZW5zaW9uXG4gICAgdmFyIHByaW1UeXBlID0gcHJpbVxuICAgIGlmIChwcmltIDwgMCkge1xuICAgICAgcHJpbVR5cGUgPSBHTF9UUklBTkdMRVNcbiAgICAgIHZhciBkaW1lbnNpb24gPSBlbGVtZW50cy5idWZmZXIuZGltZW5zaW9uXG4gICAgICBpZiAoZGltZW5zaW9uID09PSAxKSBwcmltVHlwZSA9IEdMX1BPSU5UU1xuICAgICAgaWYgKGRpbWVuc2lvbiA9PT0gMikgcHJpbVR5cGUgPSBHTF9MSU5FU1xuICAgICAgaWYgKGRpbWVuc2lvbiA9PT0gMykgcHJpbVR5cGUgPSBHTF9UUklBTkdMRVNcbiAgICB9XG4gICAgZWxlbWVudHMucHJpbVR5cGUgPSBwcmltVHlwZVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveUVsZW1lbnRzIChlbGVtZW50cykge1xuICAgIHN0YXRzLmVsZW1lbnRzQ291bnQtLVxuXG4gICAgXG4gICAgZGVsZXRlIGVsZW1lbnRTZXRbZWxlbWVudHMuaWRdXG4gICAgZWxlbWVudHMuYnVmZmVyLmRlc3Ryb3koKVxuICAgIGVsZW1lbnRzLmJ1ZmZlciA9IG51bGxcbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZUVsZW1lbnRzIChvcHRpb25zLCBwZXJzaXN0ZW50KSB7XG4gICAgdmFyIGJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmNyZWF0ZShudWxsLCBHTF9FTEVNRU5UX0FSUkFZX0JVRkZFUiwgdHJ1ZSlcbiAgICB2YXIgZWxlbWVudHMgPSBuZXcgUkVHTEVsZW1lbnRCdWZmZXIoYnVmZmVyLl9idWZmZXIpXG4gICAgc3RhdHMuZWxlbWVudHNDb3VudCsrXG5cbiAgICBmdW5jdGlvbiByZWdsRWxlbWVudHMgKG9wdGlvbnMpIHtcbiAgICAgIGlmICghb3B0aW9ucykge1xuICAgICAgICBidWZmZXIoKVxuICAgICAgICBlbGVtZW50cy5wcmltVHlwZSA9IEdMX1RSSUFOR0xFU1xuICAgICAgICBlbGVtZW50cy52ZXJ0Q291bnQgPSAwXG4gICAgICAgIGVsZW1lbnRzLnR5cGUgPSBHTF9VTlNJR05FRF9CWVRFXG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBvcHRpb25zID09PSAnbnVtYmVyJykge1xuICAgICAgICBidWZmZXIob3B0aW9ucylcbiAgICAgICAgZWxlbWVudHMucHJpbVR5cGUgPSBHTF9UUklBTkdMRVNcbiAgICAgICAgZWxlbWVudHMudmVydENvdW50ID0gb3B0aW9ucyB8IDBcbiAgICAgICAgZWxlbWVudHMudHlwZSA9IEdMX1VOU0lHTkVEX0JZVEVcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBkYXRhID0gbnVsbFxuICAgICAgICB2YXIgdXNhZ2UgPSBHTF9TVEFUSUNfRFJBV1xuICAgICAgICB2YXIgcHJpbVR5cGUgPSAtMVxuICAgICAgICB2YXIgdmVydENvdW50ID0gLTFcbiAgICAgICAgdmFyIGJ5dGVMZW5ndGggPSAwXG4gICAgICAgIHZhciBkdHlwZSA9IDBcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkob3B0aW9ucykgfHxcbiAgICAgICAgICAgIGlzVHlwZWRBcnJheShvcHRpb25zKSB8fFxuICAgICAgICAgICAgaXNOREFycmF5TGlrZShvcHRpb25zKSkge1xuICAgICAgICAgIGRhdGEgPSBvcHRpb25zXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKCdkYXRhJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBkYXRhID0gb3B0aW9ucy5kYXRhXG4gICAgICAgICAgICBcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCd1c2FnZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgXG4gICAgICAgICAgICB1c2FnZSA9IHVzYWdlVHlwZXNbb3B0aW9ucy51c2FnZV1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCdwcmltaXRpdmUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgcHJpbVR5cGUgPSBwcmltVHlwZXNbb3B0aW9ucy5wcmltaXRpdmVdXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgnY291bnQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdmVydENvdW50ID0gb3B0aW9ucy5jb3VudCB8IDBcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCd0eXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGR0eXBlID0gZWxlbWVudFR5cGVzW29wdGlvbnMudHlwZV1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCdsZW5ndGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGJ5dGVMZW5ndGggPSBvcHRpb25zLmxlbmd0aCB8IDBcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYnl0ZUxlbmd0aCA9IHZlcnRDb3VudFxuICAgICAgICAgICAgaWYgKGR0eXBlID09PSBHTF9VTlNJR05FRF9TSE9SVCB8fCBkdHlwZSA9PT0gR0xfU0hPUlQpIHtcbiAgICAgICAgICAgICAgYnl0ZUxlbmd0aCAqPSAyXG4gICAgICAgICAgICB9IGVsc2UgaWYgKGR0eXBlID09PSBHTF9VTlNJR05FRF9JTlQgfHwgZHR5cGUgPT09IEdMX0lOVCkge1xuICAgICAgICAgICAgICBieXRlTGVuZ3RoICo9IDRcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaW5pdEVsZW1lbnRzKFxuICAgICAgICAgIGVsZW1lbnRzLFxuICAgICAgICAgIGRhdGEsXG4gICAgICAgICAgdXNhZ2UsXG4gICAgICAgICAgcHJpbVR5cGUsXG4gICAgICAgICAgdmVydENvdW50LFxuICAgICAgICAgIGJ5dGVMZW5ndGgsXG4gICAgICAgICAgZHR5cGUpXG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZWdsRWxlbWVudHNcbiAgICB9XG5cbiAgICByZWdsRWxlbWVudHMob3B0aW9ucylcblxuICAgIHJlZ2xFbGVtZW50cy5fcmVnbFR5cGUgPSAnZWxlbWVudHMnXG4gICAgcmVnbEVsZW1lbnRzLl9lbGVtZW50cyA9IGVsZW1lbnRzXG4gICAgcmVnbEVsZW1lbnRzLnN1YmRhdGEgPSBmdW5jdGlvbiAoZGF0YSwgb2Zmc2V0KSB7XG4gICAgICBidWZmZXIuc3ViZGF0YShkYXRhLCBvZmZzZXQpXG4gICAgICByZXR1cm4gcmVnbEVsZW1lbnRzXG4gICAgfVxuICAgIHJlZ2xFbGVtZW50cy5kZXN0cm95ID0gZnVuY3Rpb24gKCkge1xuICAgICAgZGVzdHJveUVsZW1lbnRzKGVsZW1lbnRzKVxuICAgIH1cblxuICAgIHJldHVybiByZWdsRWxlbWVudHNcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY3JlYXRlOiBjcmVhdGVFbGVtZW50cyxcbiAgICBjcmVhdGVTdHJlYW06IGNyZWF0ZUVsZW1lbnRTdHJlYW0sXG4gICAgZGVzdHJveVN0cmVhbTogZGVzdHJveUVsZW1lbnRTdHJlYW0sXG4gICAgZ2V0RWxlbWVudHM6IGZ1bmN0aW9uIChlbGVtZW50cykge1xuICAgICAgaWYgKHR5cGVvZiBlbGVtZW50cyA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgICAgIGVsZW1lbnRzLl9lbGVtZW50cyBpbnN0YW5jZW9mIFJFR0xFbGVtZW50QnVmZmVyKSB7XG4gICAgICAgIHJldHVybiBlbGVtZW50cy5fZWxlbWVudHNcbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsXG4gICAgfSxcbiAgICBjbGVhcjogZnVuY3Rpb24gKCkge1xuICAgICAgdmFsdWVzKGVsZW1lbnRTZXQpLmZvckVhY2goZGVzdHJveUVsZW1lbnRzKVxuICAgIH1cbiAgfVxufVxuIiwiXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY3JlYXRlRXh0ZW5zaW9uQ2FjaGUgKGdsLCBjb25maWcpIHtcbiAgdmFyIGV4dGVuc2lvbnMgPSB7fVxuXG4gIGZ1bmN0aW9uIHRyeUxvYWRFeHRlbnNpb24gKG5hbWVfKSB7XG4gICAgXG4gICAgdmFyIG5hbWUgPSBuYW1lXy50b0xvd2VyQ2FzZSgpXG4gICAgdmFyIGV4dFxuICAgIHRyeSB7XG4gICAgICBleHQgPSBleHRlbnNpb25zW25hbWVdID0gZ2wuZ2V0RXh0ZW5zaW9uKG5hbWUpXG4gICAgfSBjYXRjaCAoZSkge31cbiAgICByZXR1cm4gISFleHRcbiAgfVxuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgY29uZmlnLmV4dGVuc2lvbnMubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgbmFtZSA9IGNvbmZpZy5leHRlbnNpb25zW2ldXG4gICAgaWYgKCF0cnlMb2FkRXh0ZW5zaW9uKG5hbWUpKSB7XG4gICAgICBjb25maWcub25EZXN0cm95KClcbiAgICAgIGNvbmZpZy5vbkRvbmUoJ1wiJyArIG5hbWUgKyAnXCIgZXh0ZW5zaW9uIGlzIG5vdCBzdXBwb3J0ZWQgYnkgdGhlIGN1cnJlbnQgV2ViR0wgY29udGV4dCwgdHJ5IHVwZ3JhZGluZyB5b3VyIHN5c3RlbSBvciBhIGRpZmZlcmVudCBicm93c2VyJylcbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuICB9XG5cbiAgY29uZmlnLm9wdGlvbmFsRXh0ZW5zaW9ucy5mb3JFYWNoKHRyeUxvYWRFeHRlbnNpb24pXG5cbiAgcmV0dXJuIHtcbiAgICBleHRlbnNpb25zOiBleHRlbnNpb25zLFxuICAgIHJlc3RvcmU6IGZ1bmN0aW9uICgpIHtcbiAgICAgIE9iamVjdC5rZXlzKGV4dGVuc2lvbnMpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgaWYgKCF0cnlMb2FkRXh0ZW5zaW9uKG5hbWUpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCcocmVnbCk6IGVycm9yIHJlc3RvcmluZyBleHRlbnNpb24gJyArIG5hbWUpXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgfVxuICB9XG59XG4iLCJcbnZhciB2YWx1ZXMgPSByZXF1aXJlKCcuL3V0aWwvdmFsdWVzJylcbnZhciBleHRlbmQgPSByZXF1aXJlKCcuL3V0aWwvZXh0ZW5kJylcblxuLy8gV2Ugc3RvcmUgdGhlc2UgY29uc3RhbnRzIHNvIHRoYXQgdGhlIG1pbmlmaWVyIGNhbiBpbmxpbmUgdGhlbVxudmFyIEdMX0ZSQU1FQlVGRkVSID0gMHg4RDQwXG52YXIgR0xfUkVOREVSQlVGRkVSID0gMHg4RDQxXG5cbnZhciBHTF9URVhUVVJFXzJEID0gMHgwREUxXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YID0gMHg4NTE1XG5cbnZhciBHTF9DT0xPUl9BVFRBQ0hNRU5UMCA9IDB4OENFMFxudmFyIEdMX0RFUFRIX0FUVEFDSE1FTlQgPSAweDhEMDBcbnZhciBHTF9TVEVOQ0lMX0FUVEFDSE1FTlQgPSAweDhEMjBcbnZhciBHTF9ERVBUSF9TVEVOQ0lMX0FUVEFDSE1FTlQgPSAweDgyMUFcblxudmFyIEdMX0ZSQU1FQlVGRkVSX0NPTVBMRVRFID0gMHg4Q0Q1XG52YXIgR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9BVFRBQ0hNRU5UID0gMHg4Q0Q2XG52YXIgR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9NSVNTSU5HX0FUVEFDSE1FTlQgPSAweDhDRDdcbnZhciBHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX0RJTUVOU0lPTlMgPSAweDhDRDlcbnZhciBHTF9GUkFNRUJVRkZFUl9VTlNVUFBPUlRFRCA9IDB4OENERFxuXG52YXIgR0xfSEFMRl9GTE9BVF9PRVMgPSAweDhENjFcbnZhciBHTF9VTlNJR05FRF9CWVRFID0gMHgxNDAxXG52YXIgR0xfRkxPQVQgPSAweDE0MDZcblxudmFyIEdMX1JHQkEgPSAweDE5MDhcblxudmFyIEdMX0RFUFRIX0NPTVBPTkVOVCA9IDB4MTkwMlxuXG52YXIgY29sb3JUZXh0dXJlRm9ybWF0RW51bXMgPSBbXG4gIEdMX1JHQkFcbl1cblxuLy8gZm9yIGV2ZXJ5IHRleHR1cmUgZm9ybWF0LCBzdG9yZVxuLy8gdGhlIG51bWJlciBvZiBjaGFubmVsc1xudmFyIHRleHR1cmVGb3JtYXRDaGFubmVscyA9IFtdXG50ZXh0dXJlRm9ybWF0Q2hhbm5lbHNbR0xfUkdCQV0gPSA0XG5cbi8vIGZvciBldmVyeSB0ZXh0dXJlIHR5cGUsIHN0b3JlXG4vLyB0aGUgc2l6ZSBpbiBieXRlcy5cbnZhciB0ZXh0dXJlVHlwZVNpemVzID0gW11cbnRleHR1cmVUeXBlU2l6ZXNbR0xfVU5TSUdORURfQllURV0gPSAxXG50ZXh0dXJlVHlwZVNpemVzW0dMX0ZMT0FUXSA9IDRcbnRleHR1cmVUeXBlU2l6ZXNbR0xfSEFMRl9GTE9BVF9PRVNdID0gMlxuXG52YXIgR0xfUkdCQTQgPSAweDgwNTZcbnZhciBHTF9SR0I1X0ExID0gMHg4MDU3XG52YXIgR0xfUkdCNTY1ID0gMHg4RDYyXG52YXIgR0xfREVQVEhfQ09NUE9ORU5UMTYgPSAweDgxQTVcbnZhciBHTF9TVEVOQ0lMX0lOREVYOCA9IDB4OEQ0OFxudmFyIEdMX0RFUFRIX1NURU5DSUwgPSAweDg0RjlcblxudmFyIEdMX1NSR0I4X0FMUEhBOF9FWFQgPSAweDhDNDNcblxudmFyIEdMX1JHQkEzMkZfRVhUID0gMHg4ODE0XG5cbnZhciBHTF9SR0JBMTZGX0VYVCA9IDB4ODgxQVxudmFyIEdMX1JHQjE2Rl9FWFQgPSAweDg4MUJcblxudmFyIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0RW51bXMgPSBbXG4gIEdMX1JHQkE0LFxuICBHTF9SR0I1X0ExLFxuICBHTF9SR0I1NjUsXG4gIEdMX1NSR0I4X0FMUEhBOF9FWFQsXG4gIEdMX1JHQkExNkZfRVhULFxuICBHTF9SR0IxNkZfRVhULFxuICBHTF9SR0JBMzJGX0VYVFxuXVxuXG52YXIgc3RhdHVzQ29kZSA9IHt9XG5zdGF0dXNDb2RlW0dMX0ZSQU1FQlVGRkVSX0NPTVBMRVRFXSA9ICdjb21wbGV0ZSdcbnN0YXR1c0NvZGVbR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9BVFRBQ0hNRU5UXSA9ICdpbmNvbXBsZXRlIGF0dGFjaG1lbnQnXG5zdGF0dXNDb2RlW0dMX0ZSQU1FQlVGRkVSX0lOQ09NUExFVEVfRElNRU5TSU9OU10gPSAnaW5jb21wbGV0ZSBkaW1lbnNpb25zJ1xuc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX01JU1NJTkdfQVRUQUNITUVOVF0gPSAnaW5jb21wbGV0ZSwgbWlzc2luZyBhdHRhY2htZW50J1xuc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9VTlNVUFBPUlRFRF0gPSAndW5zdXBwb3J0ZWQnXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcEZCT1N0YXRlIChcbiAgZ2wsXG4gIGV4dGVuc2lvbnMsXG4gIGxpbWl0cyxcbiAgdGV4dHVyZVN0YXRlLFxuICByZW5kZXJidWZmZXJTdGF0ZSxcbiAgc3RhdHMpIHtcbiAgdmFyIGZyYW1lYnVmZmVyU3RhdGUgPSB7XG4gICAgY3VyOiBudWxsLFxuICAgIG5leHQ6IG51bGwsXG4gICAgZGlydHk6IGZhbHNlXG4gIH1cblxuICB2YXIgY29sb3JUZXh0dXJlRm9ybWF0cyA9IFsncmdiYSddXG4gIHZhciBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHMgPSBbJ3JnYmE0JywgJ3JnYjU2NScsICdyZ2I1IGExJ11cblxuICBpZiAoZXh0ZW5zaW9ucy5leHRfc3JnYikge1xuICAgIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0cy5wdXNoKCdzcmdiYScpXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5leHRfY29sb3JfYnVmZmVyX2hhbGZfZmxvYXQpIHtcbiAgICBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHMucHVzaCgncmdiYTE2ZicsICdyZ2IxNmYnKVxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29sb3JfYnVmZmVyX2Zsb2F0KSB7XG4gICAgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzLnB1c2goJ3JnYmEzMmYnKVxuICB9XG5cbiAgdmFyIGNvbG9yVHlwZXMgPSBbJ3VpbnQ4J11cbiAgaWYgKGV4dGVuc2lvbnMub2VzX3RleHR1cmVfaGFsZl9mbG9hdCkge1xuICAgIGNvbG9yVHlwZXMucHVzaCgnaGFsZiBmbG9hdCcsICdmbG9hdDE2JylcbiAgfVxuICBpZiAoZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9mbG9hdCkge1xuICAgIGNvbG9yVHlwZXMucHVzaCgnZmxvYXQnLCAnZmxvYXQzMicpXG4gIH1cblxuICBmdW5jdGlvbiBGcmFtZWJ1ZmZlckF0dGFjaG1lbnQgKHRhcmdldCwgdGV4dHVyZSwgcmVuZGVyYnVmZmVyKSB7XG4gICAgdGhpcy50YXJnZXQgPSB0YXJnZXRcbiAgICB0aGlzLnRleHR1cmUgPSB0ZXh0dXJlXG4gICAgdGhpcy5yZW5kZXJidWZmZXIgPSByZW5kZXJidWZmZXJcblxuICAgIHZhciB3ID0gMFxuICAgIHZhciBoID0gMFxuICAgIGlmICh0ZXh0dXJlKSB7XG4gICAgICB3ID0gdGV4dHVyZS53aWR0aFxuICAgICAgaCA9IHRleHR1cmUuaGVpZ2h0XG4gICAgfSBlbHNlIGlmIChyZW5kZXJidWZmZXIpIHtcbiAgICAgIHcgPSByZW5kZXJidWZmZXIud2lkdGhcbiAgICAgIGggPSByZW5kZXJidWZmZXIuaGVpZ2h0XG4gICAgfVxuICAgIHRoaXMud2lkdGggPSB3XG4gICAgdGhpcy5oZWlnaHQgPSBoXG4gIH1cblxuICBmdW5jdGlvbiBkZWNSZWYgKGF0dGFjaG1lbnQpIHtcbiAgICBpZiAoYXR0YWNobWVudCkge1xuICAgICAgaWYgKGF0dGFjaG1lbnQudGV4dHVyZSkge1xuICAgICAgICBhdHRhY2htZW50LnRleHR1cmUuX3RleHR1cmUuZGVjUmVmKClcbiAgICAgIH1cbiAgICAgIGlmIChhdHRhY2htZW50LnJlbmRlcmJ1ZmZlcikge1xuICAgICAgICBhdHRhY2htZW50LnJlbmRlcmJ1ZmZlci5fcmVuZGVyYnVmZmVyLmRlY1JlZigpXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaW5jUmVmQW5kQ2hlY2tTaGFwZSAoYXR0YWNobWVudCwgd2lkdGgsIGhlaWdodCkge1xuICAgIGlmICghYXR0YWNobWVudCkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIGlmIChhdHRhY2htZW50LnRleHR1cmUpIHtcbiAgICAgIHZhciB0ZXh0dXJlID0gYXR0YWNobWVudC50ZXh0dXJlLl90ZXh0dXJlXG4gICAgICB2YXIgdHcgPSBNYXRoLm1heCgxLCB0ZXh0dXJlLndpZHRoKVxuICAgICAgdmFyIHRoID0gTWF0aC5tYXgoMSwgdGV4dHVyZS5oZWlnaHQpXG4gICAgICBcbiAgICAgIHRleHR1cmUucmVmQ291bnQgKz0gMVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgcmVuZGVyYnVmZmVyID0gYXR0YWNobWVudC5yZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlclxuICAgICAgXG4gICAgICByZW5kZXJidWZmZXIucmVmQ291bnQgKz0gMVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGF0dGFjaCAobG9jYXRpb24sIGF0dGFjaG1lbnQpIHtcbiAgICBpZiAoYXR0YWNobWVudCkge1xuICAgICAgaWYgKGF0dGFjaG1lbnQudGV4dHVyZSkge1xuICAgICAgICBnbC5mcmFtZWJ1ZmZlclRleHR1cmUyRChcbiAgICAgICAgICBHTF9GUkFNRUJVRkZFUixcbiAgICAgICAgICBsb2NhdGlvbixcbiAgICAgICAgICBhdHRhY2htZW50LnRhcmdldCxcbiAgICAgICAgICBhdHRhY2htZW50LnRleHR1cmUuX3RleHR1cmUudGV4dHVyZSxcbiAgICAgICAgICAwKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZ2wuZnJhbWVidWZmZXJSZW5kZXJidWZmZXIoXG4gICAgICAgICAgR0xfRlJBTUVCVUZGRVIsXG4gICAgICAgICAgbG9jYXRpb24sXG4gICAgICAgICAgR0xfUkVOREVSQlVGRkVSLFxuICAgICAgICAgIGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXIucmVuZGVyYnVmZmVyKVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlQXR0YWNobWVudCAoYXR0YWNobWVudCkge1xuICAgIHZhciB0YXJnZXQgPSBHTF9URVhUVVJFXzJEXG4gICAgdmFyIHRleHR1cmUgPSBudWxsXG4gICAgdmFyIHJlbmRlcmJ1ZmZlciA9IG51bGxcblxuICAgIHZhciBkYXRhID0gYXR0YWNobWVudFxuICAgIGlmICh0eXBlb2YgYXR0YWNobWVudCA9PT0gJ29iamVjdCcpIHtcbiAgICAgIGRhdGEgPSBhdHRhY2htZW50LmRhdGFcbiAgICAgIGlmICgndGFyZ2V0JyBpbiBhdHRhY2htZW50KSB7XG4gICAgICAgIHRhcmdldCA9IGF0dGFjaG1lbnQudGFyZ2V0IHwgMFxuICAgICAgfVxuICAgIH1cblxuICAgIFxuXG4gICAgdmFyIHR5cGUgPSBkYXRhLl9yZWdsVHlwZVxuICAgIGlmICh0eXBlID09PSAndGV4dHVyZTJkJykge1xuICAgICAgdGV4dHVyZSA9IGRhdGFcbiAgICAgIFxuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3RleHR1cmVDdWJlJykge1xuICAgICAgdGV4dHVyZSA9IGRhdGFcbiAgICAgIFxuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3JlbmRlcmJ1ZmZlcicpIHtcbiAgICAgIHJlbmRlcmJ1ZmZlciA9IGRhdGFcbiAgICAgIHRhcmdldCA9IEdMX1JFTkRFUkJVRkZFUlxuICAgIH0gZWxzZSB7XG4gICAgICBcbiAgICB9XG5cbiAgICByZXR1cm4gbmV3IEZyYW1lYnVmZmVyQXR0YWNobWVudCh0YXJnZXQsIHRleHR1cmUsIHJlbmRlcmJ1ZmZlcilcbiAgfVxuXG4gIGZ1bmN0aW9uIGFsbG9jQXR0YWNobWVudCAoXG4gICAgd2lkdGgsXG4gICAgaGVpZ2h0LFxuICAgIGlzVGV4dHVyZSxcbiAgICBmb3JtYXQsXG4gICAgdHlwZSkge1xuICAgIGlmIChpc1RleHR1cmUpIHtcbiAgICAgIHZhciB0ZXh0dXJlID0gdGV4dHVyZVN0YXRlLmNyZWF0ZTJEKHtcbiAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICBoZWlnaHQ6IGhlaWdodCxcbiAgICAgICAgZm9ybWF0OiBmb3JtYXQsXG4gICAgICAgIHR5cGU6IHR5cGVcbiAgICAgIH0pXG4gICAgICB0ZXh0dXJlLl90ZXh0dXJlLnJlZkNvdW50ID0gMFxuICAgICAgcmV0dXJuIG5ldyBGcmFtZWJ1ZmZlckF0dGFjaG1lbnQoR0xfVEVYVFVSRV8yRCwgdGV4dHVyZSwgbnVsbClcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIHJiID0gcmVuZGVyYnVmZmVyU3RhdGUuY3JlYXRlKHtcbiAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICBoZWlnaHQ6IGhlaWdodCxcbiAgICAgICAgZm9ybWF0OiBmb3JtYXRcbiAgICAgIH0pXG4gICAgICByYi5fcmVuZGVyYnVmZmVyLnJlZkNvdW50ID0gMFxuICAgICAgcmV0dXJuIG5ldyBGcmFtZWJ1ZmZlckF0dGFjaG1lbnQoR0xfUkVOREVSQlVGRkVSLCBudWxsLCByYilcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiB1bndyYXBBdHRhY2htZW50IChhdHRhY2htZW50KSB7XG4gICAgcmV0dXJuIGF0dGFjaG1lbnQgJiYgKGF0dGFjaG1lbnQudGV4dHVyZSB8fCBhdHRhY2htZW50LnJlbmRlcmJ1ZmZlcilcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlc2l6ZUF0dGFjaG1lbnQgKGF0dGFjaG1lbnQsIHcsIGgpIHtcbiAgICBpZiAoYXR0YWNobWVudCkge1xuICAgICAgaWYgKGF0dGFjaG1lbnQudGV4dHVyZSkge1xuICAgICAgICBhdHRhY2htZW50LnRleHR1cmUucmVzaXplKHcsIGgpXG4gICAgICB9IGVsc2UgaWYgKGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyKSB7XG4gICAgICAgIGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyLnJlc2l6ZSh3LCBoKVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHZhciBmcmFtZWJ1ZmZlckNvdW50ID0gMFxuICB2YXIgZnJhbWVidWZmZXJTZXQgPSB7fVxuXG4gIGZ1bmN0aW9uIFJFR0xGcmFtZWJ1ZmZlciAoKSB7XG4gICAgdGhpcy5pZCA9IGZyYW1lYnVmZmVyQ291bnQrK1xuICAgIGZyYW1lYnVmZmVyU2V0W3RoaXMuaWRdID0gdGhpc1xuXG4gICAgdGhpcy5mcmFtZWJ1ZmZlciA9IGdsLmNyZWF0ZUZyYW1lYnVmZmVyKClcbiAgICB0aGlzLndpZHRoID0gMFxuICAgIHRoaXMuaGVpZ2h0ID0gMFxuXG4gICAgdGhpcy5jb2xvckF0dGFjaG1lbnRzID0gW11cbiAgICB0aGlzLmRlcHRoQXR0YWNobWVudCA9IG51bGxcbiAgICB0aGlzLnN0ZW5jaWxBdHRhY2htZW50ID0gbnVsbFxuICAgIHRoaXMuZGVwdGhTdGVuY2lsQXR0YWNobWVudCA9IG51bGxcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlY0ZCT1JlZnMgKGZyYW1lYnVmZmVyKSB7XG4gICAgZnJhbWVidWZmZXIuY29sb3JBdHRhY2htZW50cy5mb3JFYWNoKGRlY1JlZilcbiAgICBkZWNSZWYoZnJhbWVidWZmZXIuZGVwdGhBdHRhY2htZW50KVxuICAgIGRlY1JlZihmcmFtZWJ1ZmZlci5zdGVuY2lsQXR0YWNobWVudClcbiAgICBkZWNSZWYoZnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsQXR0YWNobWVudClcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3kgKGZyYW1lYnVmZmVyKSB7XG4gICAgdmFyIGhhbmRsZSA9IGZyYW1lYnVmZmVyLmZyYW1lYnVmZmVyXG4gICAgXG4gICAgZ2wuZGVsZXRlRnJhbWVidWZmZXIoaGFuZGxlKVxuICAgIGZyYW1lYnVmZmVyLmZyYW1lYnVmZmVyID0gbnVsbFxuICAgIHN0YXRzLmZyYW1lYnVmZmVyQ291bnQtLVxuICAgIGRlbGV0ZSBmcmFtZWJ1ZmZlclNldFtmcmFtZWJ1ZmZlci5pZF1cbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZUZyYW1lYnVmZmVyIChmcmFtZWJ1ZmZlcikge1xuICAgIHZhciBpXG5cbiAgICBnbC5iaW5kRnJhbWVidWZmZXIoR0xfRlJBTUVCVUZGRVIsIGZyYW1lYnVmZmVyLmZyYW1lYnVmZmVyKVxuICAgIHZhciBjb2xvckF0dGFjaG1lbnRzID0gZnJhbWVidWZmZXIuY29sb3JBdHRhY2htZW50c1xuICAgIGZvciAoaSA9IDA7IGkgPCBjb2xvckF0dGFjaG1lbnRzLmxlbmd0aDsgKytpKSB7XG4gICAgICBhdHRhY2goR0xfQ09MT1JfQVRUQUNITUVOVDAgKyBpLCBjb2xvckF0dGFjaG1lbnRzW2ldKVxuICAgIH1cbiAgICBmb3IgKGkgPSBjb2xvckF0dGFjaG1lbnRzLmxlbmd0aDsgaSA8IGxpbWl0cy5tYXhDb2xvckF0dGFjaG1lbnRzOyArK2kpIHtcbiAgICAgIGdsLmZyYW1lYnVmZmVyVGV4dHVyZTJEKFxuICAgICAgICBHTF9GUkFNRUJVRkZFUixcbiAgICAgICAgR0xfQ09MT1JfQVRUQUNITUVOVDAgKyBpLFxuICAgICAgICBHTF9URVhUVVJFXzJELFxuICAgICAgICBudWxsLFxuICAgICAgICAwKVxuICAgIH1cblxuICAgIGdsLmZyYW1lYnVmZmVyVGV4dHVyZTJEKFxuICAgICAgR0xfRlJBTUVCVUZGRVIsXG4gICAgICBHTF9ERVBUSF9TVEVOQ0lMX0FUVEFDSE1FTlQsXG4gICAgICBHTF9URVhUVVJFXzJELFxuICAgICAgbnVsbCxcbiAgICAgIDApXG4gICAgZ2wuZnJhbWVidWZmZXJUZXh0dXJlMkQoXG4gICAgICBHTF9GUkFNRUJVRkZFUixcbiAgICAgIEdMX0RFUFRIX0FUVEFDSE1FTlQsXG4gICAgICBHTF9URVhUVVJFXzJELFxuICAgICAgbnVsbCxcbiAgICAgIDApXG4gICAgZ2wuZnJhbWVidWZmZXJUZXh0dXJlMkQoXG4gICAgICBHTF9GUkFNRUJVRkZFUixcbiAgICAgIEdMX1NURU5DSUxfQVRUQUNITUVOVCxcbiAgICAgIEdMX1RFWFRVUkVfMkQsXG4gICAgICBudWxsLFxuICAgICAgMClcblxuICAgIGF0dGFjaChHTF9ERVBUSF9BVFRBQ0hNRU5ULCBmcmFtZWJ1ZmZlci5kZXB0aEF0dGFjaG1lbnQpXG4gICAgYXR0YWNoKEdMX1NURU5DSUxfQVRUQUNITUVOVCwgZnJhbWVidWZmZXIuc3RlbmNpbEF0dGFjaG1lbnQpXG4gICAgYXR0YWNoKEdMX0RFUFRIX1NURU5DSUxfQVRUQUNITUVOVCwgZnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsQXR0YWNobWVudClcblxuICAgIC8vIENoZWNrIHN0YXR1cyBjb2RlXG4gICAgdmFyIHN0YXR1cyA9IGdsLmNoZWNrRnJhbWVidWZmZXJTdGF0dXMoR0xfRlJBTUVCVUZGRVIpXG4gICAgaWYgKHN0YXR1cyAhPT0gR0xfRlJBTUVCVUZGRVJfQ09NUExFVEUpIHtcbiAgICAgIFxuICAgIH1cblxuICAgIGdsLmJpbmRGcmFtZWJ1ZmZlcihHTF9GUkFNRUJVRkZFUiwgZnJhbWVidWZmZXJTdGF0ZS5uZXh0KVxuICAgIGZyYW1lYnVmZmVyU3RhdGUuY3VyID0gZnJhbWVidWZmZXJTdGF0ZS5uZXh0XG5cbiAgICAvLyBGSVhNRTogQ2xlYXIgZXJyb3IgY29kZSBoZXJlLiAgVGhpcyBpcyBhIHdvcmsgYXJvdW5kIGZvciBhIGJ1ZyBpblxuICAgIC8vIGhlYWRsZXNzLWdsXG4gICAgZ2wuZ2V0RXJyb3IoKVxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlRkJPIChhMCwgYTEpIHtcbiAgICB2YXIgZnJhbWVidWZmZXIgPSBuZXcgUkVHTEZyYW1lYnVmZmVyKClcbiAgICBzdGF0cy5mcmFtZWJ1ZmZlckNvdW50KytcblxuICAgIGZ1bmN0aW9uIHJlZ2xGcmFtZWJ1ZmZlciAoYSwgYikge1xuICAgICAgdmFyIGlcblxuICAgICAgXG5cbiAgICAgIHZhciBleHREcmF3QnVmZmVycyA9IGV4dGVuc2lvbnMud2ViZ2xfZHJhd19idWZmZXJzXG5cbiAgICAgIHZhciB3aWR0aCA9IDBcbiAgICAgIHZhciBoZWlnaHQgPSAwXG5cbiAgICAgIHZhciBuZWVkc0RlcHRoID0gdHJ1ZVxuICAgICAgdmFyIG5lZWRzU3RlbmNpbCA9IHRydWVcblxuICAgICAgdmFyIGNvbG9yQnVmZmVyID0gbnVsbFxuICAgICAgdmFyIGNvbG9yVGV4dHVyZSA9IHRydWVcbiAgICAgIHZhciBjb2xvckZvcm1hdCA9ICdyZ2JhJ1xuICAgICAgdmFyIGNvbG9yVHlwZSA9ICd1aW50OCdcbiAgICAgIHZhciBjb2xvckNvdW50ID0gMVxuXG4gICAgICB2YXIgZGVwdGhCdWZmZXIgPSBudWxsXG4gICAgICB2YXIgc3RlbmNpbEJ1ZmZlciA9IG51bGxcbiAgICAgIHZhciBkZXB0aFN0ZW5jaWxCdWZmZXIgPSBudWxsXG4gICAgICB2YXIgZGVwdGhTdGVuY2lsVGV4dHVyZSA9IGZhbHNlXG5cbiAgICAgIGlmICh0eXBlb2YgYSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgd2lkdGggPSBhIHwgMFxuICAgICAgICBoZWlnaHQgPSAoYiB8IDApIHx8IHdpZHRoXG4gICAgICB9IGVsc2UgaWYgKCFhKSB7XG4gICAgICAgIHdpZHRoID0gaGVpZ2h0ID0gMVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgXG4gICAgICAgIHZhciBvcHRpb25zID0gYVxuXG4gICAgICAgIGlmICgnc2hhcGUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB2YXIgc2hhcGUgPSBvcHRpb25zLnNoYXBlXG4gICAgICAgICAgXG4gICAgICAgICAgd2lkdGggPSBzaGFwZVswXVxuICAgICAgICAgIGhlaWdodCA9IHNoYXBlWzFdXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWYgKCdyYWRpdXMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIHdpZHRoID0gaGVpZ2h0ID0gb3B0aW9ucy5yYWRpdXNcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCd3aWR0aCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgd2lkdGggPSBvcHRpb25zLndpZHRoXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgnaGVpZ2h0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBoZWlnaHQgPSBvcHRpb25zLmhlaWdodFxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnY29sb3InIGluIG9wdGlvbnMgfHxcbiAgICAgICAgICAgICdjb2xvcnMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBjb2xvckJ1ZmZlciA9XG4gICAgICAgICAgICBvcHRpb25zLmNvbG9yIHx8XG4gICAgICAgICAgICBvcHRpb25zLmNvbG9yc1xuICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KGNvbG9yQnVmZmVyKSkge1xuICAgICAgICAgICAgXG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFjb2xvckJ1ZmZlcikge1xuICAgICAgICAgIGlmICgnY29sb3JDb3VudCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgY29sb3JDb3VudCA9IG9wdGlvbnMuY29sb3JDb3VudCB8IDBcbiAgICAgICAgICAgIFxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmICgnY29sb3JUZXh0dXJlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBjb2xvclRleHR1cmUgPSAhIW9wdGlvbnMuY29sb3JUZXh0dXJlXG4gICAgICAgICAgICBjb2xvckZvcm1hdCA9ICdyZ2JhNCdcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoJ2NvbG9yVHlwZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgY29sb3JUeXBlID0gb3B0aW9ucy5jb2xvclR5cGVcbiAgICAgICAgICAgIGlmICghY29sb3JUZXh0dXJlKSB7XG4gICAgICAgICAgICAgIGlmIChjb2xvclR5cGUgPT09ICdoYWxmIGZsb2F0JyB8fCBjb2xvclR5cGUgPT09ICdmbG9hdDE2Jykge1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGNvbG9yRm9ybWF0ID0gJ3JnYmExNmYnXG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAoY29sb3JUeXBlID09PSAnZmxvYXQnIHx8IGNvbG9yVHlwZSA9PT0gJ2Zsb2F0MzInKSB7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgY29sb3JGb3JtYXQgPSAncmdiYTMyZidcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKCdjb2xvckZvcm1hdCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgY29sb3JGb3JtYXQgPSBvcHRpb25zLmNvbG9yRm9ybWF0XG4gICAgICAgICAgICBpZiAoY29sb3JUZXh0dXJlRm9ybWF0cy5pbmRleE9mKGNvbG9yRm9ybWF0KSA+PSAwKSB7XG4gICAgICAgICAgICAgIGNvbG9yVGV4dHVyZSA9IHRydWVcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzLmluZGV4T2YoY29sb3JGb3JtYXQpID49IDApIHtcbiAgICAgICAgICAgICAgY29sb3JUZXh0dXJlID0gZmFsc2VcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGlmIChjb2xvclRleHR1cmUpIHtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnZGVwdGhUZXh0dXJlJyBpbiBvcHRpb25zIHx8ICdkZXB0aFN0ZW5jaWxUZXh0dXJlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgZGVwdGhTdGVuY2lsVGV4dHVyZSA9ICEhKG9wdGlvbnMuZGVwdGhUZXh0dXJlIHx8XG4gICAgICAgICAgICBvcHRpb25zLmRlcHRoU3RlbmNpbFRleHR1cmUpXG4gICAgICAgICAgXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ2RlcHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiBvcHRpb25zLmRlcHRoID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgIG5lZWRzRGVwdGggPSBvcHRpb25zLmRlcHRoXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGRlcHRoQnVmZmVyID0gb3B0aW9ucy5kZXB0aFxuICAgICAgICAgICAgbmVlZHNTdGVuY2lsID0gZmFsc2VcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ3N0ZW5jaWwnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBpZiAodHlwZW9mIG9wdGlvbnMuc3RlbmNpbCA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgICBuZWVkc1N0ZW5jaWwgPSBvcHRpb25zLnN0ZW5jaWxcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc3RlbmNpbEJ1ZmZlciA9IG9wdGlvbnMuc3RlbmNpbFxuICAgICAgICAgICAgbmVlZHNEZXB0aCA9IGZhbHNlXG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdkZXB0aFN0ZW5jaWwnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBpZiAodHlwZW9mIG9wdGlvbnMuZGVwdGhTdGVuY2lsID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgIG5lZWRzRGVwdGggPSBuZWVkc1N0ZW5jaWwgPSBvcHRpb25zLmRlcHRoU3RlbmNpbFxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBkZXB0aFN0ZW5jaWxCdWZmZXIgPSBvcHRpb25zLmRlcHRoU3RlbmNpbFxuICAgICAgICAgICAgbmVlZHNEZXB0aCA9IGZhbHNlXG4gICAgICAgICAgICBuZWVkc1N0ZW5jaWwgPSBmYWxzZVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBwYXJzZSBhdHRhY2htZW50c1xuICAgICAgdmFyIGNvbG9yQXR0YWNobWVudHMgPSBudWxsXG4gICAgICB2YXIgZGVwdGhBdHRhY2htZW50ID0gbnVsbFxuICAgICAgdmFyIHN0ZW5jaWxBdHRhY2htZW50ID0gbnVsbFxuICAgICAgdmFyIGRlcHRoU3RlbmNpbEF0dGFjaG1lbnQgPSBudWxsXG5cbiAgICAgIC8vIFNldCB1cCBjb2xvciBhdHRhY2htZW50c1xuICAgICAgaWYgKEFycmF5LmlzQXJyYXkoY29sb3JCdWZmZXIpKSB7XG4gICAgICAgIGNvbG9yQXR0YWNobWVudHMgPSBjb2xvckJ1ZmZlci5tYXAocGFyc2VBdHRhY2htZW50KVxuICAgICAgfSBlbHNlIGlmIChjb2xvckJ1ZmZlcikge1xuICAgICAgICBjb2xvckF0dGFjaG1lbnRzID0gW3BhcnNlQXR0YWNobWVudChjb2xvckJ1ZmZlcildXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb2xvckF0dGFjaG1lbnRzID0gbmV3IEFycmF5KGNvbG9yQ291bnQpXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xvckNvdW50OyArK2kpIHtcbiAgICAgICAgICBjb2xvckF0dGFjaG1lbnRzW2ldID0gYWxsb2NBdHRhY2htZW50KFxuICAgICAgICAgICAgd2lkdGgsXG4gICAgICAgICAgICBoZWlnaHQsXG4gICAgICAgICAgICBjb2xvclRleHR1cmUsXG4gICAgICAgICAgICBjb2xvckZvcm1hdCxcbiAgICAgICAgICAgIGNvbG9yVHlwZSlcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBcbiAgICAgIFxuXG4gICAgICB3aWR0aCA9IHdpZHRoIHx8IGNvbG9yQXR0YWNobWVudHNbMF0ud2lkdGhcbiAgICAgIGhlaWdodCA9IGhlaWdodCB8fCBjb2xvckF0dGFjaG1lbnRzWzBdLmhlaWdodFxuXG4gICAgICBpZiAoZGVwdGhCdWZmZXIpIHtcbiAgICAgICAgZGVwdGhBdHRhY2htZW50ID0gcGFyc2VBdHRhY2htZW50KGRlcHRoQnVmZmVyKVxuICAgICAgfSBlbHNlIGlmIChuZWVkc0RlcHRoICYmICFuZWVkc1N0ZW5jaWwpIHtcbiAgICAgICAgZGVwdGhBdHRhY2htZW50ID0gYWxsb2NBdHRhY2htZW50KFxuICAgICAgICAgIHdpZHRoLFxuICAgICAgICAgIGhlaWdodCxcbiAgICAgICAgICBkZXB0aFN0ZW5jaWxUZXh0dXJlLFxuICAgICAgICAgICdkZXB0aCcsXG4gICAgICAgICAgJ3VpbnQzMicpXG4gICAgICB9XG5cbiAgICAgIGlmIChzdGVuY2lsQnVmZmVyKSB7XG4gICAgICAgIHN0ZW5jaWxBdHRhY2htZW50ID0gcGFyc2VBdHRhY2htZW50KHN0ZW5jaWxCdWZmZXIpXG4gICAgICB9IGVsc2UgaWYgKG5lZWRzU3RlbmNpbCAmJiAhbmVlZHNEZXB0aCkge1xuICAgICAgICBzdGVuY2lsQXR0YWNobWVudCA9IGFsbG9jQXR0YWNobWVudChcbiAgICAgICAgICB3aWR0aCxcbiAgICAgICAgICBoZWlnaHQsXG4gICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgJ3N0ZW5jaWwnLFxuICAgICAgICAgICd1aW50OCcpXG4gICAgICB9XG5cbiAgICAgIGlmIChkZXB0aFN0ZW5jaWxCdWZmZXIpIHtcbiAgICAgICAgZGVwdGhTdGVuY2lsQXR0YWNobWVudCA9IHBhcnNlQXR0YWNobWVudChkZXB0aFN0ZW5jaWxCdWZmZXIpXG4gICAgICB9IGVsc2UgaWYgKCFkZXB0aEJ1ZmZlciAmJiAhc3RlbmNpbEJ1ZmZlciAmJiBuZWVkc1N0ZW5jaWwgJiYgbmVlZHNEZXB0aCkge1xuICAgICAgICBkZXB0aFN0ZW5jaWxBdHRhY2htZW50ID0gYWxsb2NBdHRhY2htZW50KFxuICAgICAgICAgIHdpZHRoLFxuICAgICAgICAgIGhlaWdodCxcbiAgICAgICAgICBkZXB0aFN0ZW5jaWxUZXh0dXJlLFxuICAgICAgICAgICdkZXB0aCBzdGVuY2lsJyxcbiAgICAgICAgICAnZGVwdGggc3RlbmNpbCcpXG4gICAgICB9XG5cbiAgICAgIFxuXG4gICAgICB2YXIgY29tbW9uQ29sb3JBdHRhY2htZW50U2l6ZSA9IG51bGxcblxuICAgICAgZm9yIChpID0gMDsgaSA8IGNvbG9yQXR0YWNobWVudHMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgaW5jUmVmQW5kQ2hlY2tTaGFwZShjb2xvckF0dGFjaG1lbnRzW2ldLCB3aWR0aCwgaGVpZ2h0KVxuICAgICAgICBcblxuICAgICAgICBpZiAoY29sb3JBdHRhY2htZW50c1tpXSAmJiBjb2xvckF0dGFjaG1lbnRzW2ldLnRleHR1cmUpIHtcbiAgICAgICAgICB2YXIgY29sb3JBdHRhY2htZW50U2l6ZSA9XG4gICAgICAgICAgICAgIHRleHR1cmVGb3JtYXRDaGFubmVsc1tjb2xvckF0dGFjaG1lbnRzW2ldLnRleHR1cmUuX3RleHR1cmUuZm9ybWF0XSAqXG4gICAgICAgICAgICAgIHRleHR1cmVUeXBlU2l6ZXNbY29sb3JBdHRhY2htZW50c1tpXS50ZXh0dXJlLl90ZXh0dXJlLnR5cGVdXG5cbiAgICAgICAgICBpZiAoY29tbW9uQ29sb3JBdHRhY2htZW50U2l6ZSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgY29tbW9uQ29sb3JBdHRhY2htZW50U2l6ZSA9IGNvbG9yQXR0YWNobWVudFNpemVcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gV2UgbmVlZCB0byBtYWtlIHN1cmUgdGhhdCBhbGwgY29sb3IgYXR0YWNobWVudHMgaGF2ZSB0aGUgc2FtZSBudW1iZXIgb2YgYml0cGxhbmVzXG4gICAgICAgICAgICAvLyAodGhhdCBpcywgdGhlIHNhbWUgbnVtZXIgb2YgYml0cyBwZXIgcGl4ZWwpXG4gICAgICAgICAgICAvLyBUaGlzIGlzIHJlcXVpcmVkIGJ5IHRoZSBHTEVTMi4wIHN0YW5kYXJkLiBTZWUgdGhlIGJlZ2lubmluZyBvZiBDaGFwdGVyIDQgaW4gdGhhdCBkb2N1bWVudC5cbiAgICAgICAgICAgIFxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaW5jUmVmQW5kQ2hlY2tTaGFwZShkZXB0aEF0dGFjaG1lbnQsIHdpZHRoLCBoZWlnaHQpXG4gICAgICBcbiAgICAgIGluY1JlZkFuZENoZWNrU2hhcGUoc3RlbmNpbEF0dGFjaG1lbnQsIHdpZHRoLCBoZWlnaHQpXG4gICAgICBcbiAgICAgIGluY1JlZkFuZENoZWNrU2hhcGUoZGVwdGhTdGVuY2lsQXR0YWNobWVudCwgd2lkdGgsIGhlaWdodClcbiAgICAgIFxuXG4gICAgICAvLyBkZWNyZW1lbnQgcmVmZXJlbmNlc1xuICAgICAgZGVjRkJPUmVmcyhmcmFtZWJ1ZmZlcilcblxuICAgICAgZnJhbWVidWZmZXIud2lkdGggPSB3aWR0aFxuICAgICAgZnJhbWVidWZmZXIuaGVpZ2h0ID0gaGVpZ2h0XG5cbiAgICAgIGZyYW1lYnVmZmVyLmNvbG9yQXR0YWNobWVudHMgPSBjb2xvckF0dGFjaG1lbnRzXG4gICAgICBmcmFtZWJ1ZmZlci5kZXB0aEF0dGFjaG1lbnQgPSBkZXB0aEF0dGFjaG1lbnRcbiAgICAgIGZyYW1lYnVmZmVyLnN0ZW5jaWxBdHRhY2htZW50ID0gc3RlbmNpbEF0dGFjaG1lbnRcbiAgICAgIGZyYW1lYnVmZmVyLmRlcHRoU3RlbmNpbEF0dGFjaG1lbnQgPSBkZXB0aFN0ZW5jaWxBdHRhY2htZW50XG5cbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci5jb2xvciA9IGNvbG9yQXR0YWNobWVudHMubWFwKHVud3JhcEF0dGFjaG1lbnQpXG4gICAgICByZWdsRnJhbWVidWZmZXIuZGVwdGggPSB1bndyYXBBdHRhY2htZW50KGRlcHRoQXR0YWNobWVudClcbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci5zdGVuY2lsID0gdW53cmFwQXR0YWNobWVudChzdGVuY2lsQXR0YWNobWVudClcbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci5kZXB0aFN0ZW5jaWwgPSB1bndyYXBBdHRhY2htZW50KGRlcHRoU3RlbmNpbEF0dGFjaG1lbnQpXG5cbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci53aWR0aCA9IGZyYW1lYnVmZmVyLndpZHRoXG4gICAgICByZWdsRnJhbWVidWZmZXIuaGVpZ2h0ID0gZnJhbWVidWZmZXIuaGVpZ2h0XG5cbiAgICAgIHVwZGF0ZUZyYW1lYnVmZmVyKGZyYW1lYnVmZmVyKVxuXG4gICAgICByZXR1cm4gcmVnbEZyYW1lYnVmZmVyXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVzaXplICh3XywgaF8pIHtcbiAgICAgIFxuXG4gICAgICB2YXIgdyA9IHdfIHwgMFxuICAgICAgdmFyIGggPSAoaF8gfCAwKSB8fCB3XG4gICAgICBpZiAodyA9PT0gZnJhbWVidWZmZXIud2lkdGggJiYgaCA9PT0gZnJhbWVidWZmZXIuaGVpZ2h0KSB7XG4gICAgICAgIHJldHVybiByZWdsRnJhbWVidWZmZXJcbiAgICAgIH1cblxuICAgICAgLy8gcmVzaXplIGFsbCBidWZmZXJzXG4gICAgICB2YXIgY29sb3JBdHRhY2htZW50cyA9IGZyYW1lYnVmZmVyLmNvbG9yQXR0YWNobWVudHNcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY29sb3JBdHRhY2htZW50cy5sZW5ndGg7ICsraSkge1xuICAgICAgICByZXNpemVBdHRhY2htZW50KGNvbG9yQXR0YWNobWVudHNbaV0sIHcsIGgpXG4gICAgICB9XG4gICAgICByZXNpemVBdHRhY2htZW50KGZyYW1lYnVmZmVyLmRlcHRoQXR0YWNobWVudCwgdywgaClcbiAgICAgIHJlc2l6ZUF0dGFjaG1lbnQoZnJhbWVidWZmZXIuc3RlbmNpbEF0dGFjaG1lbnQsIHcsIGgpXG4gICAgICByZXNpemVBdHRhY2htZW50KGZyYW1lYnVmZmVyLmRlcHRoU3RlbmNpbEF0dGFjaG1lbnQsIHcsIGgpXG5cbiAgICAgIGZyYW1lYnVmZmVyLndpZHRoID0gcmVnbEZyYW1lYnVmZmVyLndpZHRoID0gd1xuICAgICAgZnJhbWVidWZmZXIuaGVpZ2h0ID0gcmVnbEZyYW1lYnVmZmVyLmhlaWdodCA9IGhcblxuICAgICAgdXBkYXRlRnJhbWVidWZmZXIoZnJhbWVidWZmZXIpXG5cbiAgICAgIHJldHVybiByZWdsRnJhbWVidWZmZXJcbiAgICB9XG5cbiAgICByZWdsRnJhbWVidWZmZXIoYTAsIGExKVxuXG4gICAgcmV0dXJuIGV4dGVuZChyZWdsRnJhbWVidWZmZXIsIHtcbiAgICAgIHJlc2l6ZTogcmVzaXplLFxuICAgICAgX3JlZ2xUeXBlOiAnZnJhbWVidWZmZXInLFxuICAgICAgX2ZyYW1lYnVmZmVyOiBmcmFtZWJ1ZmZlcixcbiAgICAgIGRlc3Ryb3k6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgZGVzdHJveShmcmFtZWJ1ZmZlcilcbiAgICAgICAgZGVjRkJPUmVmcyhmcmFtZWJ1ZmZlcilcbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlQ3ViZUZCTyAob3B0aW9ucykge1xuICAgIHZhciBmYWNlcyA9IEFycmF5KDYpXG5cbiAgICBmdW5jdGlvbiByZWdsRnJhbWVidWZmZXJDdWJlIChhKSB7XG4gICAgICB2YXIgaVxuXG4gICAgICBcblxuICAgICAgdmFyIGV4dERyYXdCdWZmZXJzID0gZXh0ZW5zaW9ucy53ZWJnbF9kcmF3X2J1ZmZlcnNcblxuICAgICAgdmFyIHBhcmFtcyA9IHtcbiAgICAgICAgY29sb3I6IG51bGxcbiAgICAgIH1cblxuICAgICAgdmFyIHJhZGl1cyA9IDBcblxuICAgICAgdmFyIGNvbG9yQnVmZmVyID0gbnVsbFxuICAgICAgdmFyIGNvbG9yRm9ybWF0ID0gJ3JnYmEnXG4gICAgICB2YXIgY29sb3JUeXBlID0gJ3VpbnQ4J1xuICAgICAgdmFyIGNvbG9yQ291bnQgPSAxXG5cbiAgICAgIGlmICh0eXBlb2YgYSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgcmFkaXVzID0gYSB8IDBcbiAgICAgIH0gZWxzZSBpZiAoIWEpIHtcbiAgICAgICAgcmFkaXVzID0gMVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgXG4gICAgICAgIHZhciBvcHRpb25zID0gYVxuXG4gICAgICAgIGlmICgnc2hhcGUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB2YXIgc2hhcGUgPSBvcHRpb25zLnNoYXBlXG4gICAgICAgICAgXG4gICAgICAgICAgXG4gICAgICAgICAgcmFkaXVzID0gc2hhcGVbMF1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAoJ3JhZGl1cycgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgcmFkaXVzID0gb3B0aW9ucy5yYWRpdXMgfCAwXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgnd2lkdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIHJhZGl1cyA9IG9wdGlvbnMud2lkdGggfCAwXG4gICAgICAgICAgICBpZiAoJ2hlaWdodCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2UgaWYgKCdoZWlnaHQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIHJhZGl1cyA9IG9wdGlvbnMuaGVpZ2h0IHwgMFxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnY29sb3InIGluIG9wdGlvbnMgfHxcbiAgICAgICAgICAgICdjb2xvcnMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBjb2xvckJ1ZmZlciA9XG4gICAgICAgICAgICBvcHRpb25zLmNvbG9yIHx8XG4gICAgICAgICAgICBvcHRpb25zLmNvbG9yc1xuICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KGNvbG9yQnVmZmVyKSkge1xuICAgICAgICAgICAgXG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFjb2xvckJ1ZmZlcikge1xuICAgICAgICAgIGlmICgnY29sb3JDb3VudCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgY29sb3JDb3VudCA9IG9wdGlvbnMuY29sb3JDb3VudCB8IDBcbiAgICAgICAgICAgIFxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmICgnY29sb3JUeXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbG9yVHlwZSA9IG9wdGlvbnMuY29sb3JUeXBlXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKCdjb2xvckZvcm1hdCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgY29sb3JGb3JtYXQgPSBvcHRpb25zLmNvbG9yRm9ybWF0XG4gICAgICAgICAgICBcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ2RlcHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgcGFyYW1zLmRlcHRoID0gb3B0aW9ucy5kZXB0aFxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdzdGVuY2lsJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgcGFyYW1zLnN0ZW5jaWwgPSBvcHRpb25zLnN0ZW5jaWxcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnZGVwdGhTdGVuY2lsJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgcGFyYW1zLmRlcHRoU3RlbmNpbCA9IG9wdGlvbnMuZGVwdGhTdGVuY2lsXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgdmFyIGNvbG9yQ3ViZXNcbiAgICAgIGlmIChjb2xvckJ1ZmZlcikge1xuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShjb2xvckJ1ZmZlcikpIHtcbiAgICAgICAgICBjb2xvckN1YmVzID0gW11cbiAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY29sb3JCdWZmZXIubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICAgIGNvbG9yQ3ViZXNbaV0gPSBjb2xvckJ1ZmZlcltpXVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb2xvckN1YmVzID0gWyBjb2xvckJ1ZmZlciBdXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbG9yQ3ViZXMgPSBBcnJheShjb2xvckNvdW50KVxuICAgICAgICB2YXIgY3ViZU1hcFBhcmFtcyA9IHtcbiAgICAgICAgICByYWRpdXM6IHJhZGl1cyxcbiAgICAgICAgICBmb3JtYXQ6IGNvbG9yRm9ybWF0LFxuICAgICAgICAgIHR5cGU6IGNvbG9yVHlwZVxuICAgICAgICB9XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xvckNvdW50OyArK2kpIHtcbiAgICAgICAgICBjb2xvckN1YmVzW2ldID0gdGV4dHVyZVN0YXRlLmNyZWF0ZUN1YmUoY3ViZU1hcFBhcmFtcylcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBDaGVjayBjb2xvciBjdWJlc1xuICAgICAgcGFyYW1zLmNvbG9yID0gQXJyYXkoY29sb3JDdWJlcy5sZW5ndGgpXG4gICAgICBmb3IgKGkgPSAwOyBpIDwgY29sb3JDdWJlcy5sZW5ndGg7ICsraSkge1xuICAgICAgICB2YXIgY3ViZSA9IGNvbG9yQ3ViZXNbaV1cbiAgICAgICAgXG4gICAgICAgIHJhZGl1cyA9IHJhZGl1cyB8fCBjdWJlLndpZHRoXG4gICAgICAgIFxuICAgICAgICBwYXJhbXMuY29sb3JbaV0gPSB7XG4gICAgICAgICAgdGFyZ2V0OiBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1gsXG4gICAgICAgICAgZGF0YTogY29sb3JDdWJlc1tpXVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGZvciAoaSA9IDA7IGkgPCA2OyArK2kpIHtcbiAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBjb2xvckN1YmVzLmxlbmd0aDsgKytqKSB7XG4gICAgICAgICAgcGFyYW1zLmNvbG9yW2pdLnRhcmdldCA9IEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCArIGlcbiAgICAgICAgfVxuICAgICAgICAvLyByZXVzZSBkZXB0aC1zdGVuY2lsIGF0dGFjaG1lbnRzIGFjcm9zcyBhbGwgY3ViZSBtYXBzXG4gICAgICAgIGlmIChpID4gMCkge1xuICAgICAgICAgIHBhcmFtcy5kZXB0aCA9IGZhY2VzWzBdLmRlcHRoXG4gICAgICAgICAgcGFyYW1zLnN0ZW5jaWwgPSBmYWNlc1swXS5zdGVuY2lsXG4gICAgICAgICAgcGFyYW1zLmRlcHRoU3RlbmNpbCA9IGZhY2VzWzBdLmRlcHRoU3RlbmNpbFxuICAgICAgICB9XG4gICAgICAgIGlmIChmYWNlc1tpXSkge1xuICAgICAgICAgIChmYWNlc1tpXSkocGFyYW1zKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGZhY2VzW2ldID0gY3JlYXRlRkJPKHBhcmFtcylcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gZXh0ZW5kKHJlZ2xGcmFtZWJ1ZmZlckN1YmUsIHtcbiAgICAgICAgd2lkdGg6IHJhZGl1cyxcbiAgICAgICAgaGVpZ2h0OiByYWRpdXMsXG4gICAgICAgIGNvbG9yOiBjb2xvckN1YmVzXG4gICAgICB9KVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlc2l6ZSAocmFkaXVzXykge1xuICAgICAgdmFyIGlcbiAgICAgIHZhciByYWRpdXMgPSByYWRpdXNfIHwgMFxuICAgICAgXG5cbiAgICAgIGlmIChyYWRpdXMgPT09IHJlZ2xGcmFtZWJ1ZmZlckN1YmUud2lkdGgpIHtcbiAgICAgICAgcmV0dXJuIHJlZ2xGcmFtZWJ1ZmZlckN1YmVcbiAgICAgIH1cblxuICAgICAgdmFyIGNvbG9ycyA9IHJlZ2xGcmFtZWJ1ZmZlckN1YmUuY29sb3JcbiAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xvcnMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgY29sb3JzW2ldLnJlc2l6ZShyYWRpdXMpXG4gICAgICB9XG5cbiAgICAgIGZvciAoaSA9IDA7IGkgPCA2OyArK2kpIHtcbiAgICAgICAgZmFjZXNbaV0ucmVzaXplKHJhZGl1cylcbiAgICAgIH1cblxuICAgICAgcmVnbEZyYW1lYnVmZmVyQ3ViZS53aWR0aCA9IHJlZ2xGcmFtZWJ1ZmZlckN1YmUuaGVpZ2h0ID0gcmFkaXVzXG5cbiAgICAgIHJldHVybiByZWdsRnJhbWVidWZmZXJDdWJlXG4gICAgfVxuXG4gICAgcmVnbEZyYW1lYnVmZmVyQ3ViZShvcHRpb25zKVxuXG4gICAgcmV0dXJuIGV4dGVuZChyZWdsRnJhbWVidWZmZXJDdWJlLCB7XG4gICAgICBmYWNlczogZmFjZXMsXG4gICAgICByZXNpemU6IHJlc2l6ZSxcbiAgICAgIF9yZWdsVHlwZTogJ2ZyYW1lYnVmZmVyQ3ViZScsXG4gICAgICBkZXN0cm95OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGZhY2VzLmZvckVhY2goZnVuY3Rpb24gKGYpIHtcbiAgICAgICAgICBmLmRlc3Ryb3koKVxuICAgICAgICB9KVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiByZXN0b3JlRnJhbWVidWZmZXJzICgpIHtcbiAgICB2YWx1ZXMoZnJhbWVidWZmZXJTZXQpLmZvckVhY2goZnVuY3Rpb24gKGZiKSB7XG4gICAgICBmYi5mcmFtZWJ1ZmZlciA9IGdsLmNyZWF0ZUZyYW1lYnVmZmVyKClcbiAgICAgIHVwZGF0ZUZyYW1lYnVmZmVyKGZiKVxuICAgIH0pXG4gIH1cblxuICByZXR1cm4gZXh0ZW5kKGZyYW1lYnVmZmVyU3RhdGUsIHtcbiAgICBnZXRGcmFtZWJ1ZmZlcjogZnVuY3Rpb24gKG9iamVjdCkge1xuICAgICAgaWYgKHR5cGVvZiBvYmplY3QgPT09ICdmdW5jdGlvbicgJiYgb2JqZWN0Ll9yZWdsVHlwZSA9PT0gJ2ZyYW1lYnVmZmVyJykge1xuICAgICAgICB2YXIgZmJvID0gb2JqZWN0Ll9mcmFtZWJ1ZmZlclxuICAgICAgICBpZiAoZmJvIGluc3RhbmNlb2YgUkVHTEZyYW1lYnVmZmVyKSB7XG4gICAgICAgICAgcmV0dXJuIGZib1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH0sXG4gICAgY3JlYXRlOiBjcmVhdGVGQk8sXG4gICAgY3JlYXRlQ3ViZTogY3JlYXRlQ3ViZUZCTyxcbiAgICBjbGVhcjogZnVuY3Rpb24gKCkge1xuICAgICAgdmFsdWVzKGZyYW1lYnVmZmVyU2V0KS5mb3JFYWNoKGRlc3Ryb3kpXG4gICAgfSxcbiAgICByZXN0b3JlOiByZXN0b3JlRnJhbWVidWZmZXJzXG4gIH0pXG59XG4iLCJ2YXIgR0xfU1VCUElYRUxfQklUUyA9IDB4MEQ1MFxudmFyIEdMX1JFRF9CSVRTID0gMHgwRDUyXG52YXIgR0xfR1JFRU5fQklUUyA9IDB4MEQ1M1xudmFyIEdMX0JMVUVfQklUUyA9IDB4MEQ1NFxudmFyIEdMX0FMUEhBX0JJVFMgPSAweDBENTVcbnZhciBHTF9ERVBUSF9CSVRTID0gMHgwRDU2XG52YXIgR0xfU1RFTkNJTF9CSVRTID0gMHgwRDU3XG5cbnZhciBHTF9BTElBU0VEX1BPSU5UX1NJWkVfUkFOR0UgPSAweDg0NkRcbnZhciBHTF9BTElBU0VEX0xJTkVfV0lEVEhfUkFOR0UgPSAweDg0NkVcblxudmFyIEdMX01BWF9URVhUVVJFX1NJWkUgPSAweDBEMzNcbnZhciBHTF9NQVhfVklFV1BPUlRfRElNUyA9IDB4MEQzQVxudmFyIEdMX01BWF9WRVJURVhfQVRUUklCUyA9IDB4ODg2OVxudmFyIEdMX01BWF9WRVJURVhfVU5JRk9STV9WRUNUT1JTID0gMHg4REZCXG52YXIgR0xfTUFYX1ZBUllJTkdfVkVDVE9SUyA9IDB4OERGQ1xudmFyIEdMX01BWF9DT01CSU5FRF9URVhUVVJFX0lNQUdFX1VOSVRTID0gMHg4QjREXG52YXIgR0xfTUFYX1ZFUlRFWF9URVhUVVJFX0lNQUdFX1VOSVRTID0gMHg4QjRDXG52YXIgR0xfTUFYX1RFWFRVUkVfSU1BR0VfVU5JVFMgPSAweDg4NzJcbnZhciBHTF9NQVhfRlJBR01FTlRfVU5JRk9STV9WRUNUT1JTID0gMHg4REZEXG52YXIgR0xfTUFYX0NVQkVfTUFQX1RFWFRVUkVfU0laRSA9IDB4ODUxQ1xudmFyIEdMX01BWF9SRU5ERVJCVUZGRVJfU0laRSA9IDB4ODRFOFxuXG52YXIgR0xfVkVORE9SID0gMHgxRjAwXG52YXIgR0xfUkVOREVSRVIgPSAweDFGMDFcbnZhciBHTF9WRVJTSU9OID0gMHgxRjAyXG52YXIgR0xfU0hBRElOR19MQU5HVUFHRV9WRVJTSU9OID0gMHg4QjhDXG5cbnZhciBHTF9NQVhfVEVYVFVSRV9NQVhfQU5JU09UUk9QWV9FWFQgPSAweDg0RkZcblxudmFyIEdMX01BWF9DT0xPUl9BVFRBQ0hNRU5UU19XRUJHTCA9IDB4OENERlxudmFyIEdMX01BWF9EUkFXX0JVRkZFUlNfV0VCR0wgPSAweDg4MjRcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoZ2wsIGV4dGVuc2lvbnMpIHtcbiAgdmFyIG1heEFuaXNvdHJvcGljID0gMVxuICBpZiAoZXh0ZW5zaW9ucy5leHRfdGV4dHVyZV9maWx0ZXJfYW5pc290cm9waWMpIHtcbiAgICBtYXhBbmlzb3Ryb3BpYyA9IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVEVYVFVSRV9NQVhfQU5JU09UUk9QWV9FWFQpXG4gIH1cblxuICB2YXIgbWF4RHJhd2J1ZmZlcnMgPSAxXG4gIHZhciBtYXhDb2xvckF0dGFjaG1lbnRzID0gMVxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9kcmF3X2J1ZmZlcnMpIHtcbiAgICBtYXhEcmF3YnVmZmVycyA9IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfRFJBV19CVUZGRVJTX1dFQkdMKVxuICAgIG1heENvbG9yQXR0YWNobWVudHMgPSBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0NPTE9SX0FUVEFDSE1FTlRTX1dFQkdMKVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICAvLyBkcmF3aW5nIGJ1ZmZlciBiaXQgZGVwdGhcbiAgICBjb2xvckJpdHM6IFtcbiAgICAgIGdsLmdldFBhcmFtZXRlcihHTF9SRURfQklUUyksXG4gICAgICBnbC5nZXRQYXJhbWV0ZXIoR0xfR1JFRU5fQklUUyksXG4gICAgICBnbC5nZXRQYXJhbWV0ZXIoR0xfQkxVRV9CSVRTKSxcbiAgICAgIGdsLmdldFBhcmFtZXRlcihHTF9BTFBIQV9CSVRTKVxuICAgIF0sXG4gICAgZGVwdGhCaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfREVQVEhfQklUUyksXG4gICAgc3RlbmNpbEJpdHM6IGdsLmdldFBhcmFtZXRlcihHTF9TVEVOQ0lMX0JJVFMpLFxuICAgIHN1YnBpeGVsQml0czogZ2wuZ2V0UGFyYW1ldGVyKEdMX1NVQlBJWEVMX0JJVFMpLFxuXG4gICAgLy8gc3VwcG9ydGVkIGV4dGVuc2lvbnNcbiAgICBleHRlbnNpb25zOiBPYmplY3Qua2V5cyhleHRlbnNpb25zKS5maWx0ZXIoZnVuY3Rpb24gKGV4dCkge1xuICAgICAgcmV0dXJuICEhZXh0ZW5zaW9uc1tleHRdXG4gICAgfSksXG5cbiAgICAvLyBtYXggYW5pc28gc2FtcGxlc1xuICAgIG1heEFuaXNvdHJvcGljOiBtYXhBbmlzb3Ryb3BpYyxcblxuICAgIC8vIG1heCBkcmF3IGJ1ZmZlcnNcbiAgICBtYXhEcmF3YnVmZmVyczogbWF4RHJhd2J1ZmZlcnMsXG4gICAgbWF4Q29sb3JBdHRhY2htZW50czogbWF4Q29sb3JBdHRhY2htZW50cyxcblxuICAgIC8vIHBvaW50IGFuZCBsaW5lIHNpemUgcmFuZ2VzXG4gICAgcG9pbnRTaXplRGltczogZ2wuZ2V0UGFyYW1ldGVyKEdMX0FMSUFTRURfUE9JTlRfU0laRV9SQU5HRSksXG4gICAgbGluZVdpZHRoRGltczogZ2wuZ2V0UGFyYW1ldGVyKEdMX0FMSUFTRURfTElORV9XSURUSF9SQU5HRSksXG4gICAgbWF4Vmlld3BvcnREaW1zOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1ZJRVdQT1JUX0RJTVMpLFxuICAgIG1heENvbWJpbmVkVGV4dHVyZVVuaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0NPTUJJTkVEX1RFWFRVUkVfSU1BR0VfVU5JVFMpLFxuICAgIG1heEN1YmVNYXBTaXplOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0NVQkVfTUFQX1RFWFRVUkVfU0laRSksXG4gICAgbWF4UmVuZGVyYnVmZmVyU2l6ZTogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9SRU5ERVJCVUZGRVJfU0laRSksXG4gICAgbWF4VGV4dHVyZVVuaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1RFWFRVUkVfSU1BR0VfVU5JVFMpLFxuICAgIG1heFRleHR1cmVTaXplOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1RFWFRVUkVfU0laRSksXG4gICAgbWF4QXR0cmlidXRlczogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9WRVJURVhfQVRUUklCUyksXG4gICAgbWF4VmVydGV4VW5pZm9ybXM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVkVSVEVYX1VOSUZPUk1fVkVDVE9SUyksXG4gICAgbWF4VmVydGV4VGV4dHVyZVVuaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1ZFUlRFWF9URVhUVVJFX0lNQUdFX1VOSVRTKSxcbiAgICBtYXhWYXJ5aW5nVmVjdG9yczogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9WQVJZSU5HX1ZFQ1RPUlMpLFxuICAgIG1heEZyYWdtZW50VW5pZm9ybXM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfRlJBR01FTlRfVU5JRk9STV9WRUNUT1JTKSxcblxuICAgIC8vIHZlbmRvciBpbmZvXG4gICAgZ2xzbDogZ2wuZ2V0UGFyYW1ldGVyKEdMX1NIQURJTkdfTEFOR1VBR0VfVkVSU0lPTiksXG4gICAgcmVuZGVyZXI6IGdsLmdldFBhcmFtZXRlcihHTF9SRU5ERVJFUiksXG4gICAgdmVuZG9yOiBnbC5nZXRQYXJhbWV0ZXIoR0xfVkVORE9SKSxcbiAgICB2ZXJzaW9uOiBnbC5nZXRQYXJhbWV0ZXIoR0xfVkVSU0lPTilcbiAgfVxufVxuIiwiXG52YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi91dGlsL2lzLXR5cGVkLWFycmF5JylcblxudmFyIEdMX1JHQkEgPSA2NDA4XG52YXIgR0xfVU5TSUdORURfQllURSA9IDUxMjFcbnZhciBHTF9QQUNLX0FMSUdOTUVOVCA9IDB4MEQwNVxudmFyIEdMX0ZMT0FUID0gMHgxNDA2IC8vIDUxMjZcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwUmVhZFBpeGVscyAoXG4gIGdsLFxuICBmcmFtZWJ1ZmZlclN0YXRlLFxuICByZWdsUG9sbCxcbiAgY29udGV4dCxcbiAgZ2xBdHRyaWJ1dGVzLFxuICBleHRlbnNpb25zKSB7XG4gIGZ1bmN0aW9uIHJlYWRQaXhlbHMgKGlucHV0KSB7XG4gICAgdmFyIHR5cGVcbiAgICBpZiAoZnJhbWVidWZmZXJTdGF0ZS5uZXh0ID09PSBudWxsKSB7XG4gICAgICBcbiAgICAgIHR5cGUgPSBHTF9VTlNJR05FRF9CWVRFXG4gICAgfSBlbHNlIHtcbiAgICAgIFxuICAgICAgdHlwZSA9IGZyYW1lYnVmZmVyU3RhdGUubmV4dC5jb2xvckF0dGFjaG1lbnRzWzBdLnRleHR1cmUuX3RleHR1cmUudHlwZVxuXG4gICAgICBpZiAoZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9mbG9hdCkge1xuICAgICAgICBcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIFxuICAgICAgfVxuICAgIH1cblxuICAgIHZhciB4ID0gMFxuICAgIHZhciB5ID0gMFxuICAgIHZhciB3aWR0aCA9IGNvbnRleHQuZnJhbWVidWZmZXJXaWR0aFxuICAgIHZhciBoZWlnaHQgPSBjb250ZXh0LmZyYW1lYnVmZmVySGVpZ2h0XG4gICAgdmFyIGRhdGEgPSBudWxsXG5cbiAgICBpZiAoaXNUeXBlZEFycmF5KGlucHV0KSkge1xuICAgICAgZGF0YSA9IGlucHV0XG4gICAgfSBlbHNlIGlmIChpbnB1dCkge1xuICAgICAgXG4gICAgICB4ID0gaW5wdXQueCB8IDBcbiAgICAgIHkgPSBpbnB1dC55IHwgMFxuICAgICAgXG4gICAgICBcbiAgICAgIHdpZHRoID0gKGlucHV0LndpZHRoIHx8IChjb250ZXh0LmZyYW1lYnVmZmVyV2lkdGggLSB4KSkgfCAwXG4gICAgICBoZWlnaHQgPSAoaW5wdXQuaGVpZ2h0IHx8IChjb250ZXh0LmZyYW1lYnVmZmVySGVpZ2h0IC0geSkpIHwgMFxuICAgICAgZGF0YSA9IGlucHV0LmRhdGEgfHwgbnVsbFxuICAgIH1cblxuICAgIC8vIHNhbml0eSBjaGVjayBpbnB1dC5kYXRhXG4gICAgaWYgKGRhdGEpIHtcbiAgICAgIGlmICh0eXBlID09PSBHTF9VTlNJR05FRF9CWVRFKSB7XG4gICAgICAgIFxuICAgICAgfSBlbHNlIGlmICh0eXBlID09PSBHTF9GTE9BVCkge1xuICAgICAgICBcbiAgICAgIH1cbiAgICB9XG5cbiAgICBcbiAgICBcblxuICAgIC8vIFVwZGF0ZSBXZWJHTCBzdGF0ZVxuICAgIHJlZ2xQb2xsKClcblxuICAgIC8vIENvbXB1dGUgc2l6ZVxuICAgIHZhciBzaXplID0gd2lkdGggKiBoZWlnaHQgKiA0XG5cbiAgICAvLyBBbGxvY2F0ZSBkYXRhXG4gICAgaWYgKCFkYXRhKSB7XG4gICAgICBpZiAodHlwZSA9PT0gR0xfVU5TSUdORURfQllURSkge1xuICAgICAgICBkYXRhID0gbmV3IFVpbnQ4QXJyYXkoc2l6ZSlcbiAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gR0xfRkxPQVQpIHtcbiAgICAgICAgZGF0YSA9IGRhdGEgfHwgbmV3IEZsb2F0MzJBcnJheShzaXplKVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFR5cGUgY2hlY2tcbiAgICBcbiAgICBcblxuICAgIC8vIFJ1biByZWFkIHBpeGVsc1xuICAgIGdsLnBpeGVsU3RvcmVpKEdMX1BBQ0tfQUxJR05NRU5ULCA0KVxuICAgIGdsLnJlYWRQaXhlbHMoeCwgeSwgd2lkdGgsIGhlaWdodCwgR0xfUkdCQSxcbiAgICAgICAgICAgICAgICAgIHR5cGUsXG4gICAgICAgICAgICAgICAgICBkYXRhKVxuXG4gICAgcmV0dXJuIGRhdGFcbiAgfVxuXG4gIHJldHVybiByZWFkUGl4ZWxzXG59XG4iLCJcbnZhciB2YWx1ZXMgPSByZXF1aXJlKCcuL3V0aWwvdmFsdWVzJylcblxudmFyIEdMX1JFTkRFUkJVRkZFUiA9IDB4OEQ0MVxuXG52YXIgR0xfUkdCQTQgPSAweDgwNTZcbnZhciBHTF9SR0I1X0ExID0gMHg4MDU3XG52YXIgR0xfUkdCNTY1ID0gMHg4RDYyXG52YXIgR0xfREVQVEhfQ09NUE9ORU5UMTYgPSAweDgxQTVcbnZhciBHTF9TVEVOQ0lMX0lOREVYOCA9IDB4OEQ0OFxudmFyIEdMX0RFUFRIX1NURU5DSUwgPSAweDg0RjlcblxudmFyIEdMX1NSR0I4X0FMUEhBOF9FWFQgPSAweDhDNDNcblxudmFyIEdMX1JHQkEzMkZfRVhUID0gMHg4ODE0XG5cbnZhciBHTF9SR0JBMTZGX0VYVCA9IDB4ODgxQVxudmFyIEdMX1JHQjE2Rl9FWFQgPSAweDg4MUJcblxudmFyIEZPUk1BVF9TSVpFUyA9IFtdXG5cbkZPUk1BVF9TSVpFU1tHTF9SR0JBNF0gPSAyXG5GT1JNQVRfU0laRVNbR0xfUkdCNV9BMV0gPSAyXG5GT1JNQVRfU0laRVNbR0xfUkdCNTY1XSA9IDJcblxuRk9STUFUX1NJWkVTW0dMX0RFUFRIX0NPTVBPTkVOVDE2XSA9IDJcbkZPUk1BVF9TSVpFU1tHTF9TVEVOQ0lMX0lOREVYOF0gPSAxXG5GT1JNQVRfU0laRVNbR0xfREVQVEhfU1RFTkNJTF0gPSA0XG5cbkZPUk1BVF9TSVpFU1tHTF9TUkdCOF9BTFBIQThfRVhUXSA9IDRcbkZPUk1BVF9TSVpFU1tHTF9SR0JBMzJGX0VYVF0gPSAxNlxuRk9STUFUX1NJWkVTW0dMX1JHQkExNkZfRVhUXSA9IDhcbkZPUk1BVF9TSVpFU1tHTF9SR0IxNkZfRVhUXSA9IDZcblxuZnVuY3Rpb24gZ2V0UmVuZGVyYnVmZmVyU2l6ZSAoZm9ybWF0LCB3aWR0aCwgaGVpZ2h0KSB7XG4gIHJldHVybiBGT1JNQVRfU0laRVNbZm9ybWF0XSAqIHdpZHRoICogaGVpZ2h0XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGdsLCBleHRlbnNpb25zLCBsaW1pdHMsIHN0YXRzLCBjb25maWcpIHtcbiAgdmFyIGZvcm1hdFR5cGVzID0ge1xuICAgICdyZ2JhNCc6IEdMX1JHQkE0LFxuICAgICdyZ2I1NjUnOiBHTF9SR0I1NjUsXG4gICAgJ3JnYjUgYTEnOiBHTF9SR0I1X0ExLFxuICAgICdkZXB0aCc6IEdMX0RFUFRIX0NPTVBPTkVOVDE2LFxuICAgICdzdGVuY2lsJzogR0xfU1RFTkNJTF9JTkRFWDgsXG4gICAgJ2RlcHRoIHN0ZW5jaWwnOiBHTF9ERVBUSF9TVEVOQ0lMXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5leHRfc3JnYikge1xuICAgIGZvcm1hdFR5cGVzWydzcmdiYSddID0gR0xfU1JHQjhfQUxQSEE4X0VYVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMuZXh0X2NvbG9yX2J1ZmZlcl9oYWxmX2Zsb2F0KSB7XG4gICAgZm9ybWF0VHlwZXNbJ3JnYmExNmYnXSA9IEdMX1JHQkExNkZfRVhUXG4gICAgZm9ybWF0VHlwZXNbJ3JnYjE2ZiddID0gR0xfUkdCMTZGX0VYVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29sb3JfYnVmZmVyX2Zsb2F0KSB7XG4gICAgZm9ybWF0VHlwZXNbJ3JnYmEzMmYnXSA9IEdMX1JHQkEzMkZfRVhUXG4gIH1cblxuICB2YXIgZm9ybWF0VHlwZXNJbnZlcnQgPSBbXVxuICBPYmplY3Qua2V5cyhmb3JtYXRUeXBlcykuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgdmFyIHZhbCA9IGZvcm1hdFR5cGVzW2tleV1cbiAgICBmb3JtYXRUeXBlc0ludmVydFt2YWxdID0ga2V5XG4gIH0pXG5cbiAgdmFyIHJlbmRlcmJ1ZmZlckNvdW50ID0gMFxuICB2YXIgcmVuZGVyYnVmZmVyU2V0ID0ge31cblxuICBmdW5jdGlvbiBSRUdMUmVuZGVyYnVmZmVyIChyZW5kZXJidWZmZXIpIHtcbiAgICB0aGlzLmlkID0gcmVuZGVyYnVmZmVyQ291bnQrK1xuICAgIHRoaXMucmVmQ291bnQgPSAxXG5cbiAgICB0aGlzLnJlbmRlcmJ1ZmZlciA9IHJlbmRlcmJ1ZmZlclxuXG4gICAgdGhpcy5mb3JtYXQgPSBHTF9SR0JBNFxuICAgIHRoaXMud2lkdGggPSAwXG4gICAgdGhpcy5oZWlnaHQgPSAwXG5cbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgIHRoaXMuc3RhdHMgPSB7c2l6ZTogMH1cbiAgICB9XG4gIH1cblxuICBSRUdMUmVuZGVyYnVmZmVyLnByb3RvdHlwZS5kZWNSZWYgPSBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKC0tdGhpcy5yZWZDb3VudCA8PSAwKSB7XG4gICAgICBkZXN0cm95KHRoaXMpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSAocmIpIHtcbiAgICB2YXIgaGFuZGxlID0gcmIucmVuZGVyYnVmZmVyXG4gICAgXG4gICAgZ2wuYmluZFJlbmRlcmJ1ZmZlcihHTF9SRU5ERVJCVUZGRVIsIG51bGwpXG4gICAgZ2wuZGVsZXRlUmVuZGVyYnVmZmVyKGhhbmRsZSlcbiAgICByYi5yZW5kZXJidWZmZXIgPSBudWxsXG4gICAgcmIucmVmQ291bnQgPSAwXG4gICAgZGVsZXRlIHJlbmRlcmJ1ZmZlclNldFtyYi5pZF1cbiAgICBzdGF0cy5yZW5kZXJidWZmZXJDb3VudC0tXG4gIH1cblxuICBmdW5jdGlvbiBjcmVhdGVSZW5kZXJidWZmZXIgKGEsIGIpIHtcbiAgICB2YXIgcmVuZGVyYnVmZmVyID0gbmV3IFJFR0xSZW5kZXJidWZmZXIoZ2wuY3JlYXRlUmVuZGVyYnVmZmVyKCkpXG4gICAgcmVuZGVyYnVmZmVyU2V0W3JlbmRlcmJ1ZmZlci5pZF0gPSByZW5kZXJidWZmZXJcbiAgICBzdGF0cy5yZW5kZXJidWZmZXJDb3VudCsrXG5cbiAgICBmdW5jdGlvbiByZWdsUmVuZGVyYnVmZmVyIChhLCBiKSB7XG4gICAgICB2YXIgdyA9IDBcbiAgICAgIHZhciBoID0gMFxuICAgICAgdmFyIGZvcm1hdCA9IEdMX1JHQkE0XG5cbiAgICAgIGlmICh0eXBlb2YgYSA9PT0gJ29iamVjdCcgJiYgYSkge1xuICAgICAgICB2YXIgb3B0aW9ucyA9IGFcbiAgICAgICAgaWYgKCdzaGFwZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHZhciBzaGFwZSA9IG9wdGlvbnMuc2hhcGVcbiAgICAgICAgICBcbiAgICAgICAgICB3ID0gc2hhcGVbMF0gfCAwXG4gICAgICAgICAgaCA9IHNoYXBlWzFdIHwgMFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmICgncmFkaXVzJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICB3ID0gaCA9IG9wdGlvbnMucmFkaXVzIHwgMFxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoJ3dpZHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICB3ID0gb3B0aW9ucy53aWR0aCB8IDBcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCdoZWlnaHQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGggPSBvcHRpb25zLmhlaWdodCB8IDBcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCdmb3JtYXQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBcbiAgICAgICAgICBmb3JtYXQgPSBmb3JtYXRUeXBlc1tvcHRpb25zLmZvcm1hdF1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgYSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgdyA9IGEgfCAwXG4gICAgICAgIGlmICh0eXBlb2YgYiA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICBoID0gYiB8IDBcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBoID0gd1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKCFhKSB7XG4gICAgICAgIHcgPSBoID0gMVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgXG4gICAgICB9XG5cbiAgICAgIC8vIGNoZWNrIHNoYXBlXG4gICAgICBcblxuICAgICAgaWYgKHcgPT09IHJlbmRlcmJ1ZmZlci53aWR0aCAmJlxuICAgICAgICAgIGggPT09IHJlbmRlcmJ1ZmZlci5oZWlnaHQgJiZcbiAgICAgICAgICBmb3JtYXQgPT09IHJlbmRlcmJ1ZmZlci5mb3JtYXQpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG5cbiAgICAgIHJlZ2xSZW5kZXJidWZmZXIud2lkdGggPSByZW5kZXJidWZmZXIud2lkdGggPSB3XG4gICAgICByZWdsUmVuZGVyYnVmZmVyLmhlaWdodCA9IHJlbmRlcmJ1ZmZlci5oZWlnaHQgPSBoXG4gICAgICByZW5kZXJidWZmZXIuZm9ybWF0ID0gZm9ybWF0XG5cbiAgICAgIGdsLmJpbmRSZW5kZXJidWZmZXIoR0xfUkVOREVSQlVGRkVSLCByZW5kZXJidWZmZXIucmVuZGVyYnVmZmVyKVxuICAgICAgZ2wucmVuZGVyYnVmZmVyU3RvcmFnZShHTF9SRU5ERVJCVUZGRVIsIGZvcm1hdCwgdywgaClcblxuICAgICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICAgIHJlbmRlcmJ1ZmZlci5zdGF0cy5zaXplID0gZ2V0UmVuZGVyYnVmZmVyU2l6ZShyZW5kZXJidWZmZXIuZm9ybWF0LCByZW5kZXJidWZmZXIud2lkdGgsIHJlbmRlcmJ1ZmZlci5oZWlnaHQpXG4gICAgICB9XG4gICAgICByZWdsUmVuZGVyYnVmZmVyLmZvcm1hdCA9IGZvcm1hdFR5cGVzSW52ZXJ0W3JlbmRlcmJ1ZmZlci5mb3JtYXRdXG5cbiAgICAgIHJldHVybiByZWdsUmVuZGVyYnVmZmVyXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVzaXplICh3XywgaF8pIHtcbiAgICAgIHZhciB3ID0gd18gfCAwXG4gICAgICB2YXIgaCA9IChoXyB8IDApIHx8IHdcblxuICAgICAgaWYgKHcgPT09IHJlbmRlcmJ1ZmZlci53aWR0aCAmJiBoID09PSByZW5kZXJidWZmZXIuaGVpZ2h0KSB7XG4gICAgICAgIHJldHVybiByZWdsUmVuZGVyYnVmZmVyXG4gICAgICB9XG5cbiAgICAgIC8vIGNoZWNrIHNoYXBlXG4gICAgICBcblxuICAgICAgcmVnbFJlbmRlcmJ1ZmZlci53aWR0aCA9IHJlbmRlcmJ1ZmZlci53aWR0aCA9IHdcbiAgICAgIHJlZ2xSZW5kZXJidWZmZXIuaGVpZ2h0ID0gcmVuZGVyYnVmZmVyLmhlaWdodCA9IGhcblxuICAgICAgZ2wuYmluZFJlbmRlcmJ1ZmZlcihHTF9SRU5ERVJCVUZGRVIsIHJlbmRlcmJ1ZmZlci5yZW5kZXJidWZmZXIpXG4gICAgICBnbC5yZW5kZXJidWZmZXJTdG9yYWdlKEdMX1JFTkRFUkJVRkZFUiwgcmVuZGVyYnVmZmVyLmZvcm1hdCwgdywgaClcblxuICAgICAgLy8gYWxzbywgcmVjb21wdXRlIHNpemUuXG4gICAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgICAgcmVuZGVyYnVmZmVyLnN0YXRzLnNpemUgPSBnZXRSZW5kZXJidWZmZXJTaXplKFxuICAgICAgICAgIHJlbmRlcmJ1ZmZlci5mb3JtYXQsIHJlbmRlcmJ1ZmZlci53aWR0aCwgcmVuZGVyYnVmZmVyLmhlaWdodClcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJlZ2xSZW5kZXJidWZmZXJcbiAgICB9XG5cbiAgICByZWdsUmVuZGVyYnVmZmVyKGEsIGIpXG5cbiAgICByZWdsUmVuZGVyYnVmZmVyLnJlc2l6ZSA9IHJlc2l6ZVxuICAgIHJlZ2xSZW5kZXJidWZmZXIuX3JlZ2xUeXBlID0gJ3JlbmRlcmJ1ZmZlcidcbiAgICByZWdsUmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXIgPSByZW5kZXJidWZmZXJcbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgIHJlZ2xSZW5kZXJidWZmZXIuc3RhdHMgPSByZW5kZXJidWZmZXIuc3RhdHNcbiAgICB9XG4gICAgcmVnbFJlbmRlcmJ1ZmZlci5kZXN0cm95ID0gZnVuY3Rpb24gKCkge1xuICAgICAgcmVuZGVyYnVmZmVyLmRlY1JlZigpXG4gICAgfVxuXG4gICAgcmV0dXJuIHJlZ2xSZW5kZXJidWZmZXJcbiAgfVxuXG4gIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgIHN0YXRzLmdldFRvdGFsUmVuZGVyYnVmZmVyU2l6ZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciB0b3RhbCA9IDBcbiAgICAgIE9iamVjdC5rZXlzKHJlbmRlcmJ1ZmZlclNldCkuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgIHRvdGFsICs9IHJlbmRlcmJ1ZmZlclNldFtrZXldLnN0YXRzLnNpemVcbiAgICAgIH0pXG4gICAgICByZXR1cm4gdG90YWxcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiByZXN0b3JlUmVuZGVyYnVmZmVycyAoKSB7XG4gICAgdmFsdWVzKHJlbmRlcmJ1ZmZlclNldCkuZm9yRWFjaChmdW5jdGlvbiAocmIpIHtcbiAgICAgIHJiLnJlbmRlcmJ1ZmZlciA9IGdsLmNyZWF0ZVJlbmRlcmJ1ZmZlcigpXG4gICAgICBnbC5iaW5kUmVuZGVyYnVmZmVyKEdMX1JFTkRFUkJVRkZFUiwgcmIucmVuZGVyYnVmZmVyKVxuICAgICAgZ2wucmVuZGVyYnVmZmVyU3RvcmFnZShHTF9SRU5ERVJCVUZGRVIsIHJiLmZvcm1hdCwgcmIud2lkdGgsIHJiLmhlaWdodClcbiAgICB9KVxuICAgIGdsLmJpbmRSZW5kZXJidWZmZXIoR0xfUkVOREVSQlVGRkVSLCBudWxsKVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjcmVhdGU6IGNyZWF0ZVJlbmRlcmJ1ZmZlcixcbiAgICBjbGVhcjogZnVuY3Rpb24gKCkge1xuICAgICAgdmFsdWVzKHJlbmRlcmJ1ZmZlclNldCkuZm9yRWFjaChkZXN0cm95KVxuICAgIH0sXG4gICAgcmVzdG9yZTogcmVzdG9yZVJlbmRlcmJ1ZmZlcnNcbiAgfVxufVxuIiwiXG52YXIgdmFsdWVzID0gcmVxdWlyZSgnLi91dGlsL3ZhbHVlcycpXG5cbnZhciBHTF9GUkFHTUVOVF9TSEFERVIgPSAzNTYzMlxudmFyIEdMX1ZFUlRFWF9TSEFERVIgPSAzNTYzM1xuXG52YXIgR0xfQUNUSVZFX1VOSUZPUk1TID0gMHg4Qjg2XG52YXIgR0xfQUNUSVZFX0FUVFJJQlVURVMgPSAweDhCODlcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwU2hhZGVyU3RhdGUgKGdsLCBzdHJpbmdTdG9yZSwgc3RhdHMsIGNvbmZpZykge1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gZ2xzbCBjb21waWxhdGlvbiBhbmQgbGlua2luZ1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgdmFyIGZyYWdTaGFkZXJzID0ge31cbiAgdmFyIHZlcnRTaGFkZXJzID0ge31cblxuICBmdW5jdGlvbiBBY3RpdmVJbmZvIChuYW1lLCBpZCwgbG9jYXRpb24sIGluZm8pIHtcbiAgICB0aGlzLm5hbWUgPSBuYW1lXG4gICAgdGhpcy5pZCA9IGlkXG4gICAgdGhpcy5sb2NhdGlvbiA9IGxvY2F0aW9uXG4gICAgdGhpcy5pbmZvID0gaW5mb1xuICB9XG5cbiAgZnVuY3Rpb24gaW5zZXJ0QWN0aXZlSW5mbyAobGlzdCwgaW5mbykge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGlzdC5sZW5ndGg7ICsraSkge1xuICAgICAgaWYgKGxpc3RbaV0uaWQgPT09IGluZm8uaWQpIHtcbiAgICAgICAgbGlzdFtpXS5sb2NhdGlvbiA9IGluZm8ubG9jYXRpb25cbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgfVxuICAgIGxpc3QucHVzaChpbmZvKVxuICB9XG5cbiAgZnVuY3Rpb24gZ2V0U2hhZGVyICh0eXBlLCBpZCwgY29tbWFuZCkge1xuICAgIHZhciBjYWNoZSA9IHR5cGUgPT09IEdMX0ZSQUdNRU5UX1NIQURFUiA/IGZyYWdTaGFkZXJzIDogdmVydFNoYWRlcnNcbiAgICB2YXIgc2hhZGVyID0gY2FjaGVbaWRdXG5cbiAgICBpZiAoIXNoYWRlcikge1xuICAgICAgdmFyIHNvdXJjZSA9IHN0cmluZ1N0b3JlLnN0cihpZClcbiAgICAgIHNoYWRlciA9IGdsLmNyZWF0ZVNoYWRlcih0eXBlKVxuICAgICAgZ2wuc2hhZGVyU291cmNlKHNoYWRlciwgc291cmNlKVxuICAgICAgZ2wuY29tcGlsZVNoYWRlcihzaGFkZXIpXG4gICAgICBcbiAgICAgIGNhY2hlW2lkXSA9IHNoYWRlclxuICAgIH1cblxuICAgIHJldHVybiBzaGFkZXJcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBwcm9ncmFtIGxpbmtpbmdcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIHZhciBwcm9ncmFtQ2FjaGUgPSB7fVxuICB2YXIgcHJvZ3JhbUxpc3QgPSBbXVxuXG4gIHZhciBQUk9HUkFNX0NPVU5URVIgPSAwXG5cbiAgZnVuY3Rpb24gUkVHTFByb2dyYW0gKGZyYWdJZCwgdmVydElkKSB7XG4gICAgdGhpcy5pZCA9IFBST0dSQU1fQ09VTlRFUisrXG4gICAgdGhpcy5mcmFnSWQgPSBmcmFnSWRcbiAgICB0aGlzLnZlcnRJZCA9IHZlcnRJZFxuICAgIHRoaXMucHJvZ3JhbSA9IG51bGxcbiAgICB0aGlzLnVuaWZvcm1zID0gW11cbiAgICB0aGlzLmF0dHJpYnV0ZXMgPSBbXVxuXG4gICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICB0aGlzLnN0YXRzID0ge1xuICAgICAgICB1bmlmb3Jtc0NvdW50OiAwLFxuICAgICAgICBhdHRyaWJ1dGVzQ291bnQ6IDBcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBsaW5rUHJvZ3JhbSAoZGVzYywgY29tbWFuZCkge1xuICAgIHZhciBpLCBpbmZvXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gY29tcGlsZSAmIGxpbmtcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgdmFyIGZyYWdTaGFkZXIgPSBnZXRTaGFkZXIoR0xfRlJBR01FTlRfU0hBREVSLCBkZXNjLmZyYWdJZClcbiAgICB2YXIgdmVydFNoYWRlciA9IGdldFNoYWRlcihHTF9WRVJURVhfU0hBREVSLCBkZXNjLnZlcnRJZClcblxuICAgIHZhciBwcm9ncmFtID0gZGVzYy5wcm9ncmFtID0gZ2wuY3JlYXRlUHJvZ3JhbSgpXG4gICAgZ2wuYXR0YWNoU2hhZGVyKHByb2dyYW0sIGZyYWdTaGFkZXIpXG4gICAgZ2wuYXR0YWNoU2hhZGVyKHByb2dyYW0sIHZlcnRTaGFkZXIpXG4gICAgZ2wubGlua1Byb2dyYW0ocHJvZ3JhbSlcbiAgICBcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBncmFiIHVuaWZvcm1zXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHZhciBudW1Vbmlmb3JtcyA9IGdsLmdldFByb2dyYW1QYXJhbWV0ZXIocHJvZ3JhbSwgR0xfQUNUSVZFX1VOSUZPUk1TKVxuICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgZGVzYy5zdGF0cy51bmlmb3Jtc0NvdW50ID0gbnVtVW5pZm9ybXNcbiAgICB9XG4gICAgdmFyIHVuaWZvcm1zID0gZGVzYy51bmlmb3Jtc1xuICAgIGZvciAoaSA9IDA7IGkgPCBudW1Vbmlmb3JtczsgKytpKSB7XG4gICAgICBpbmZvID0gZ2wuZ2V0QWN0aXZlVW5pZm9ybShwcm9ncmFtLCBpKVxuICAgICAgaWYgKGluZm8pIHtcbiAgICAgICAgaWYgKGluZm8uc2l6ZSA+IDEpIHtcbiAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGluZm8uc2l6ZTsgKytqKSB7XG4gICAgICAgICAgICB2YXIgbmFtZSA9IGluZm8ubmFtZS5yZXBsYWNlKCdbMF0nLCAnWycgKyBqICsgJ10nKVxuICAgICAgICAgICAgaW5zZXJ0QWN0aXZlSW5mbyh1bmlmb3JtcywgbmV3IEFjdGl2ZUluZm8oXG4gICAgICAgICAgICAgIG5hbWUsXG4gICAgICAgICAgICAgIHN0cmluZ1N0b3JlLmlkKG5hbWUpLFxuICAgICAgICAgICAgICBnbC5nZXRVbmlmb3JtTG9jYXRpb24ocHJvZ3JhbSwgbmFtZSksXG4gICAgICAgICAgICAgIGluZm8pKVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpbnNlcnRBY3RpdmVJbmZvKHVuaWZvcm1zLCBuZXcgQWN0aXZlSW5mbyhcbiAgICAgICAgICAgIGluZm8ubmFtZSxcbiAgICAgICAgICAgIHN0cmluZ1N0b3JlLmlkKGluZm8ubmFtZSksXG4gICAgICAgICAgICBnbC5nZXRVbmlmb3JtTG9jYXRpb24ocHJvZ3JhbSwgaW5mby5uYW1lKSxcbiAgICAgICAgICAgIGluZm8pKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGdyYWIgYXR0cmlidXRlc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICB2YXIgbnVtQXR0cmlidXRlcyA9IGdsLmdldFByb2dyYW1QYXJhbWV0ZXIocHJvZ3JhbSwgR0xfQUNUSVZFX0FUVFJJQlVURVMpXG4gICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICBkZXNjLnN0YXRzLmF0dHJpYnV0ZXNDb3VudCA9IG51bUF0dHJpYnV0ZXNcbiAgICB9XG5cbiAgICB2YXIgYXR0cmlidXRlcyA9IGRlc2MuYXR0cmlidXRlc1xuICAgIGZvciAoaSA9IDA7IGkgPCBudW1BdHRyaWJ1dGVzOyArK2kpIHtcbiAgICAgIGluZm8gPSBnbC5nZXRBY3RpdmVBdHRyaWIocHJvZ3JhbSwgaSlcbiAgICAgIGlmIChpbmZvKSB7XG4gICAgICAgIGluc2VydEFjdGl2ZUluZm8oYXR0cmlidXRlcywgbmV3IEFjdGl2ZUluZm8oXG4gICAgICAgICAgaW5mby5uYW1lLFxuICAgICAgICAgIHN0cmluZ1N0b3JlLmlkKGluZm8ubmFtZSksXG4gICAgICAgICAgZ2wuZ2V0QXR0cmliTG9jYXRpb24ocHJvZ3JhbSwgaW5mby5uYW1lKSxcbiAgICAgICAgICBpbmZvKSlcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICBzdGF0cy5nZXRNYXhVbmlmb3Jtc0NvdW50ID0gZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIG0gPSAwXG4gICAgICBwcm9ncmFtTGlzdC5mb3JFYWNoKGZ1bmN0aW9uIChkZXNjKSB7XG4gICAgICAgIGlmIChkZXNjLnN0YXRzLnVuaWZvcm1zQ291bnQgPiBtKSB7XG4gICAgICAgICAgbSA9IGRlc2Muc3RhdHMudW5pZm9ybXNDb3VudFxuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgcmV0dXJuIG1cbiAgICB9XG5cbiAgICBzdGF0cy5nZXRNYXhBdHRyaWJ1dGVzQ291bnQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgbSA9IDBcbiAgICAgIHByb2dyYW1MaXN0LmZvckVhY2goZnVuY3Rpb24gKGRlc2MpIHtcbiAgICAgICAgaWYgKGRlc2Muc3RhdHMuYXR0cmlidXRlc0NvdW50ID4gbSkge1xuICAgICAgICAgIG0gPSBkZXNjLnN0YXRzLmF0dHJpYnV0ZXNDb3VudFxuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgcmV0dXJuIG1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiByZXN0b3JlU2hhZGVycyAoKSB7XG4gICAgZnJhZ1NoYWRlcnMgPSB7fVxuICAgIHZlcnRTaGFkZXJzID0ge31cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHByb2dyYW1MaXN0Lmxlbmd0aDsgKytpKSB7XG4gICAgICBsaW5rUHJvZ3JhbShwcm9ncmFtTGlzdFtpXSlcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNsZWFyOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgZGVsZXRlU2hhZGVyID0gZ2wuZGVsZXRlU2hhZGVyLmJpbmQoZ2wpXG4gICAgICB2YWx1ZXMoZnJhZ1NoYWRlcnMpLmZvckVhY2goZGVsZXRlU2hhZGVyKVxuICAgICAgZnJhZ1NoYWRlcnMgPSB7fVxuICAgICAgdmFsdWVzKHZlcnRTaGFkZXJzKS5mb3JFYWNoKGRlbGV0ZVNoYWRlcilcbiAgICAgIHZlcnRTaGFkZXJzID0ge31cblxuICAgICAgcHJvZ3JhbUxpc3QuZm9yRWFjaChmdW5jdGlvbiAoZGVzYykge1xuICAgICAgICBnbC5kZWxldGVQcm9ncmFtKGRlc2MucHJvZ3JhbSlcbiAgICAgIH0pXG4gICAgICBwcm9ncmFtTGlzdC5sZW5ndGggPSAwXG4gICAgICBwcm9ncmFtQ2FjaGUgPSB7fVxuXG4gICAgICBzdGF0cy5zaGFkZXJDb3VudCA9IDBcbiAgICB9LFxuXG4gICAgcHJvZ3JhbTogZnVuY3Rpb24gKHZlcnRJZCwgZnJhZ0lkLCBjb21tYW5kKSB7XG4gICAgICBcbiAgICAgIFxuXG4gICAgICBzdGF0cy5zaGFkZXJDb3VudCsrXG5cbiAgICAgIHZhciBjYWNoZSA9IHByb2dyYW1DYWNoZVtmcmFnSWRdXG4gICAgICBpZiAoIWNhY2hlKSB7XG4gICAgICAgIGNhY2hlID0gcHJvZ3JhbUNhY2hlW2ZyYWdJZF0gPSB7fVxuICAgICAgfVxuICAgICAgdmFyIHByb2dyYW0gPSBjYWNoZVt2ZXJ0SWRdXG4gICAgICBpZiAoIXByb2dyYW0pIHtcbiAgICAgICAgcHJvZ3JhbSA9IG5ldyBSRUdMUHJvZ3JhbShmcmFnSWQsIHZlcnRJZClcbiAgICAgICAgbGlua1Byb2dyYW0ocHJvZ3JhbSwgY29tbWFuZClcbiAgICAgICAgY2FjaGVbdmVydElkXSA9IHByb2dyYW1cbiAgICAgICAgcHJvZ3JhbUxpc3QucHVzaChwcm9ncmFtKVxuICAgICAgfVxuICAgICAgcmV0dXJuIHByb2dyYW1cbiAgICB9LFxuXG4gICAgcmVzdG9yZTogcmVzdG9yZVNoYWRlcnMsXG5cbiAgICBzaGFkZXI6IGdldFNoYWRlcixcblxuICAgIGZyYWc6IC0xLFxuICAgIHZlcnQ6IC0xXG4gIH1cbn1cbiIsIlxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBzdGF0cyAoKSB7XG4gIHJldHVybiB7XG4gICAgYnVmZmVyQ291bnQ6IDAsXG4gICAgZWxlbWVudHNDb3VudDogMCxcbiAgICBmcmFtZWJ1ZmZlckNvdW50OiAwLFxuICAgIHNoYWRlckNvdW50OiAwLFxuICAgIHRleHR1cmVDb3VudDogMCxcbiAgICBjdWJlQ291bnQ6IDAsXG4gICAgcmVuZGVyYnVmZmVyQ291bnQ6IDAsXG5cbiAgICBtYXhUZXh0dXJlVW5pdHM6IDBcbiAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjcmVhdGVTdHJpbmdTdG9yZSAoKSB7XG4gIHZhciBzdHJpbmdJZHMgPSB7Jyc6IDB9XG4gIHZhciBzdHJpbmdWYWx1ZXMgPSBbJyddXG4gIHJldHVybiB7XG4gICAgaWQ6IGZ1bmN0aW9uIChzdHIpIHtcbiAgICAgIHZhciByZXN1bHQgPSBzdHJpbmdJZHNbc3RyXVxuICAgICAgaWYgKHJlc3VsdCkge1xuICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICB9XG4gICAgICByZXN1bHQgPSBzdHJpbmdJZHNbc3RyXSA9IHN0cmluZ1ZhbHVlcy5sZW5ndGhcbiAgICAgIHN0cmluZ1ZhbHVlcy5wdXNoKHN0cilcbiAgICAgIHJldHVybiByZXN1bHRcbiAgICB9LFxuXG4gICAgc3RyOiBmdW5jdGlvbiAoaWQpIHtcbiAgICAgIHJldHVybiBzdHJpbmdWYWx1ZXNbaWRdXG4gICAgfVxuICB9XG59XG4iLCJcbnZhciBleHRlbmQgPSByZXF1aXJlKCcuL3V0aWwvZXh0ZW5kJylcbnZhciB2YWx1ZXMgPSByZXF1aXJlKCcuL3V0aWwvdmFsdWVzJylcbnZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL3V0aWwvaXMtdHlwZWQtYXJyYXknKVxudmFyIGlzTkRBcnJheUxpa2UgPSByZXF1aXJlKCcuL3V0aWwvaXMtbmRhcnJheScpXG52YXIgcG9vbCA9IHJlcXVpcmUoJy4vdXRpbC9wb29sJylcbnZhciBjb252ZXJ0VG9IYWxmRmxvYXQgPSByZXF1aXJlKCcuL3V0aWwvdG8taGFsZi1mbG9hdCcpXG52YXIgaXNBcnJheUxpa2UgPSByZXF1aXJlKCcuL3V0aWwvaXMtYXJyYXktbGlrZScpXG52YXIgZmxhdHRlblV0aWxzID0gcmVxdWlyZSgnLi91dGlsL2ZsYXR0ZW4nKVxuXG52YXIgZHR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvYXJyYXl0eXBlcy5qc29uJylcbnZhciBhcnJheVR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvYXJyYXl0eXBlcy5qc29uJylcblxudmFyIEdMX0NPTVBSRVNTRURfVEVYVFVSRV9GT1JNQVRTID0gMHg4NkEzXG5cbnZhciBHTF9URVhUVVJFXzJEID0gMHgwREUxXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUCA9IDB4ODUxM1xudmFyIEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCA9IDB4ODUxNVxuXG52YXIgR0xfUkdCQSA9IDB4MTkwOFxudmFyIEdMX0FMUEhBID0gMHgxOTA2XG52YXIgR0xfUkdCID0gMHgxOTA3XG52YXIgR0xfTFVNSU5BTkNFID0gMHgxOTA5XG52YXIgR0xfTFVNSU5BTkNFX0FMUEhBID0gMHgxOTBBXG5cbnZhciBHTF9SR0JBNCA9IDB4ODA1NlxudmFyIEdMX1JHQjVfQTEgPSAweDgwNTdcbnZhciBHTF9SR0I1NjUgPSAweDhENjJcblxudmFyIEdMX1VOU0lHTkVEX1NIT1JUXzRfNF80XzQgPSAweDgwMzNcbnZhciBHTF9VTlNJR05FRF9TSE9SVF81XzVfNV8xID0gMHg4MDM0XG52YXIgR0xfVU5TSUdORURfU0hPUlRfNV82XzUgPSAweDgzNjNcbnZhciBHTF9VTlNJR05FRF9JTlRfMjRfOF9XRUJHTCA9IDB4ODRGQVxuXG52YXIgR0xfREVQVEhfQ09NUE9ORU5UID0gMHgxOTAyXG52YXIgR0xfREVQVEhfU1RFTkNJTCA9IDB4ODRGOVxuXG52YXIgR0xfU1JHQl9FWFQgPSAweDhDNDBcbnZhciBHTF9TUkdCX0FMUEhBX0VYVCA9IDB4OEM0MlxuXG52YXIgR0xfSEFMRl9GTE9BVF9PRVMgPSAweDhENjFcblxudmFyIEdMX0NPTVBSRVNTRURfUkdCX1MzVENfRFhUMV9FWFQgPSAweDgzRjBcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQxX0VYVCA9IDB4ODNGMVxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDNfRVhUID0gMHg4M0YyXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUNV9FWFQgPSAweDgzRjNcblxudmFyIEdMX0NPTVBSRVNTRURfUkdCX0FUQ19XRUJHTCA9IDB4OEM5MlxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9BVENfRVhQTElDSVRfQUxQSEFfV0VCR0wgPSAweDhDOTNcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfQVRDX0lOVEVSUE9MQVRFRF9BTFBIQV9XRUJHTCA9IDB4ODdFRVxuXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfUFZSVENfNEJQUFYxX0lNRyA9IDB4OEMwMFxudmFyIEdMX0NPTVBSRVNTRURfUkdCX1BWUlRDXzJCUFBWMV9JTUcgPSAweDhDMDFcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUFZSVENfNEJQUFYxX0lNRyA9IDB4OEMwMlxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9QVlJUQ18yQlBQVjFfSU1HID0gMHg4QzAzXG5cbnZhciBHTF9DT01QUkVTU0VEX1JHQl9FVEMxX1dFQkdMID0gMHg4RDY0XG5cbnZhciBHTF9VTlNJR05FRF9CWVRFID0gMHgxNDAxXG52YXIgR0xfVU5TSUdORURfU0hPUlQgPSAweDE0MDNcbnZhciBHTF9VTlNJR05FRF9JTlQgPSAweDE0MDVcbnZhciBHTF9GTE9BVCA9IDB4MTQwNlxuXG52YXIgR0xfVEVYVFVSRV9XUkFQX1MgPSAweDI4MDJcbnZhciBHTF9URVhUVVJFX1dSQVBfVCA9IDB4MjgwM1xuXG52YXIgR0xfUkVQRUFUID0gMHgyOTAxXG52YXIgR0xfQ0xBTVBfVE9fRURHRSA9IDB4ODEyRlxudmFyIEdMX01JUlJPUkVEX1JFUEVBVCA9IDB4ODM3MFxuXG52YXIgR0xfVEVYVFVSRV9NQUdfRklMVEVSID0gMHgyODAwXG52YXIgR0xfVEVYVFVSRV9NSU5fRklMVEVSID0gMHgyODAxXG5cbnZhciBHTF9ORUFSRVNUID0gMHgyNjAwXG52YXIgR0xfTElORUFSID0gMHgyNjAxXG52YXIgR0xfTkVBUkVTVF9NSVBNQVBfTkVBUkVTVCA9IDB4MjcwMFxudmFyIEdMX0xJTkVBUl9NSVBNQVBfTkVBUkVTVCA9IDB4MjcwMVxudmFyIEdMX05FQVJFU1RfTUlQTUFQX0xJTkVBUiA9IDB4MjcwMlxudmFyIEdMX0xJTkVBUl9NSVBNQVBfTElORUFSID0gMHgyNzAzXG5cbnZhciBHTF9HRU5FUkFURV9NSVBNQVBfSElOVCA9IDB4ODE5MlxudmFyIEdMX0RPTlRfQ0FSRSA9IDB4MTEwMFxudmFyIEdMX0ZBU1RFU1QgPSAweDExMDFcbnZhciBHTF9OSUNFU1QgPSAweDExMDJcblxudmFyIEdMX1RFWFRVUkVfTUFYX0FOSVNPVFJPUFlfRVhUID0gMHg4NEZFXG5cbnZhciBHTF9VTlBBQ0tfQUxJR05NRU5UID0gMHgwQ0Y1XG52YXIgR0xfVU5QQUNLX0ZMSVBfWV9XRUJHTCA9IDB4OTI0MFxudmFyIEdMX1VOUEFDS19QUkVNVUxUSVBMWV9BTFBIQV9XRUJHTCA9IDB4OTI0MVxudmFyIEdMX1VOUEFDS19DT0xPUlNQQUNFX0NPTlZFUlNJT05fV0VCR0wgPSAweDkyNDNcblxudmFyIEdMX0JST1dTRVJfREVGQVVMVF9XRUJHTCA9IDB4OTI0NFxuXG52YXIgR0xfVEVYVFVSRTAgPSAweDg0QzBcblxudmFyIE1JUE1BUF9GSUxURVJTID0gW1xuICBHTF9ORUFSRVNUX01JUE1BUF9ORUFSRVNULFxuICBHTF9ORUFSRVNUX01JUE1BUF9MSU5FQVIsXG4gIEdMX0xJTkVBUl9NSVBNQVBfTkVBUkVTVCxcbiAgR0xfTElORUFSX01JUE1BUF9MSU5FQVJcbl1cblxudmFyIENIQU5ORUxTX0ZPUk1BVCA9IFtcbiAgMCxcbiAgR0xfTFVNSU5BTkNFLFxuICBHTF9MVU1JTkFOQ0VfQUxQSEEsXG4gIEdMX1JHQixcbiAgR0xfUkdCQVxuXVxuXG52YXIgRk9STUFUX0NIQU5ORUxTID0ge31cbkZPUk1BVF9DSEFOTkVMU1tHTF9MVU1JTkFOQ0VdID1cbkZPUk1BVF9DSEFOTkVMU1tHTF9BTFBIQV0gPVxuRk9STUFUX0NIQU5ORUxTW0dMX0RFUFRIX0NPTVBPTkVOVF0gPSAxXG5GT1JNQVRfQ0hBTk5FTFNbR0xfREVQVEhfU1RFTkNJTF0gPVxuRk9STUFUX0NIQU5ORUxTW0dMX0xVTUlOQU5DRV9BTFBIQV0gPSAyXG5GT1JNQVRfQ0hBTk5FTFNbR0xfUkdCXSA9XG5GT1JNQVRfQ0hBTk5FTFNbR0xfU1JHQl9FWFRdID0gM1xuRk9STUFUX0NIQU5ORUxTW0dMX1JHQkFdID1cbkZPUk1BVF9DSEFOTkVMU1tHTF9TUkdCX0FMUEhBX0VYVF0gPSA0XG5cbnZhciBmb3JtYXRUeXBlcyA9IHt9XG5mb3JtYXRUeXBlc1tHTF9SR0JBNF0gPSBHTF9VTlNJR05FRF9TSE9SVF80XzRfNF80XG5mb3JtYXRUeXBlc1tHTF9SR0I1NjVdID0gR0xfVU5TSUdORURfU0hPUlRfNV82XzVcbmZvcm1hdFR5cGVzW0dMX1JHQjVfQTFdID0gR0xfVU5TSUdORURfU0hPUlRfNV81XzVfMVxuZm9ybWF0VHlwZXNbR0xfREVQVEhfQ09NUE9ORU5UXSA9IEdMX1VOU0lHTkVEX0lOVFxuZm9ybWF0VHlwZXNbR0xfREVQVEhfU1RFTkNJTF0gPSBHTF9VTlNJR05FRF9JTlRfMjRfOF9XRUJHTFxuXG5mdW5jdGlvbiBvYmplY3ROYW1lIChzdHIpIHtcbiAgcmV0dXJuICdbb2JqZWN0ICcgKyBzdHIgKyAnXSdcbn1cblxudmFyIENBTlZBU19DTEFTUyA9IG9iamVjdE5hbWUoJ0hUTUxDYW52YXNFbGVtZW50JylcbnZhciBDT05URVhUMkRfQ0xBU1MgPSBvYmplY3ROYW1lKCdDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQnKVxudmFyIElNQUdFX0NMQVNTID0gb2JqZWN0TmFtZSgnSFRNTEltYWdlRWxlbWVudCcpXG52YXIgVklERU9fQ0xBU1MgPSBvYmplY3ROYW1lKCdIVE1MVmlkZW9FbGVtZW50JylcblxudmFyIFBJWEVMX0NMQVNTRVMgPSBPYmplY3Qua2V5cyhkdHlwZXMpLmNvbmNhdChbXG4gIENBTlZBU19DTEFTUyxcbiAgQ09OVEVYVDJEX0NMQVNTLFxuICBJTUFHRV9DTEFTUyxcbiAgVklERU9fQ0xBU1Ncbl0pXG5cbi8vIGZvciBldmVyeSB0ZXh0dXJlIHR5cGUsIHN0b3JlXG4vLyB0aGUgc2l6ZSBpbiBieXRlcy5cbnZhciBUWVBFX1NJWkVTID0gW11cblRZUEVfU0laRVNbR0xfVU5TSUdORURfQllURV0gPSAxXG5UWVBFX1NJWkVTW0dMX0ZMT0FUXSA9IDRcblRZUEVfU0laRVNbR0xfSEFMRl9GTE9BVF9PRVNdID0gMlxuXG5UWVBFX1NJWkVTW0dMX1VOU0lHTkVEX1NIT1JUXSA9IDJcblRZUEVfU0laRVNbR0xfVU5TSUdORURfSU5UXSA9IDRcblxudmFyIEZPUk1BVF9TSVpFU19TUEVDSUFMID0gW11cbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX1JHQkE0XSA9IDJcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX1JHQjVfQTFdID0gMlxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfUkdCNTY1XSA9IDJcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0RFUFRIX1NURU5DSUxdID0gNFxuXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQl9TM1RDX0RYVDFfRVhUXSA9IDAuNVxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUMV9FWFRdID0gMC41XG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQzX0VYVF0gPSAxXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQ1X0VYVF0gPSAxXG5cbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCX0FUQ19XRUJHTF0gPSAwLjVcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCQV9BVENfRVhQTElDSVRfQUxQSEFfV0VCR0xdID0gMVxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19JTlRFUlBPTEFURURfQUxQSEFfV0VCR0xdID0gMVxuXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ180QlBQVjFfSU1HXSA9IDAuNVxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JfUFZSVENfMkJQUFYxX0lNR10gPSAwLjI1XG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQkFfUFZSVENfNEJQUFYxX0lNR10gPSAwLjVcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCQV9QVlJUQ18yQlBQVjFfSU1HXSA9IDAuMjVcblxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JfRVRDMV9XRUJHTF0gPSAwLjVcblxuZnVuY3Rpb24gaXNOdW1lcmljQXJyYXkgKGFycikge1xuICByZXR1cm4gKFxuICAgIEFycmF5LmlzQXJyYXkoYXJyKSAmJlxuICAgIChhcnIubGVuZ3RoID09PSAwIHx8XG4gICAgdHlwZW9mIGFyclswXSA9PT0gJ251bWJlcicpKVxufVxuXG5mdW5jdGlvbiBpc1JlY3RBcnJheSAoYXJyKSB7XG4gIGlmICghQXJyYXkuaXNBcnJheShhcnIpKSB7XG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cbiAgdmFyIHdpZHRoID0gYXJyLmxlbmd0aFxuICBpZiAod2lkdGggPT09IDAgfHwgIWlzQXJyYXlMaWtlKGFyclswXSkpIHtcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxuICByZXR1cm4gdHJ1ZVxufVxuXG5mdW5jdGlvbiBjbGFzc1N0cmluZyAoeCkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHgpXG59XG5cbmZ1bmN0aW9uIGlzQ2FudmFzRWxlbWVudCAob2JqZWN0KSB7XG4gIHJldHVybiBjbGFzc1N0cmluZyhvYmplY3QpID09PSBDQU5WQVNfQ0xBU1Ncbn1cblxuZnVuY3Rpb24gaXNDb250ZXh0MkQgKG9iamVjdCkge1xuICByZXR1cm4gY2xhc3NTdHJpbmcob2JqZWN0KSA9PT0gQ09OVEVYVDJEX0NMQVNTXG59XG5cbmZ1bmN0aW9uIGlzSW1hZ2VFbGVtZW50IChvYmplY3QpIHtcbiAgcmV0dXJuIGNsYXNzU3RyaW5nKG9iamVjdCkgPT09IElNQUdFX0NMQVNTXG59XG5cbmZ1bmN0aW9uIGlzVmlkZW9FbGVtZW50IChvYmplY3QpIHtcbiAgcmV0dXJuIGNsYXNzU3RyaW5nKG9iamVjdCkgPT09IFZJREVPX0NMQVNTXG59XG5cbmZ1bmN0aW9uIGlzUGl4ZWxEYXRhIChvYmplY3QpIHtcbiAgaWYgKCFvYmplY3QpIHtcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxuICB2YXIgY2xhc3NOYW1lID0gY2xhc3NTdHJpbmcob2JqZWN0KVxuICBpZiAoUElYRUxfQ0xBU1NFUy5pbmRleE9mKGNsYXNzTmFtZSkgPj0gMCkge1xuICAgIHJldHVybiB0cnVlXG4gIH1cbiAgcmV0dXJuIChcbiAgICBpc051bWVyaWNBcnJheShvYmplY3QpIHx8XG4gICAgaXNSZWN0QXJyYXkob2JqZWN0KSB8fFxuICAgIGlzTkRBcnJheUxpa2Uob2JqZWN0KSlcbn1cblxuZnVuY3Rpb24gdHlwZWRBcnJheUNvZGUgKGRhdGEpIHtcbiAgcmV0dXJuIGFycmF5VHlwZXNbT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGRhdGEpXSB8IDBcbn1cblxuZnVuY3Rpb24gY29udmVydERhdGEgKHJlc3VsdCwgZGF0YSkge1xuICB2YXIgbiA9IGRhdGEubGVuZ3RoXG4gIHN3aXRjaCAocmVzdWx0LnR5cGUpIHtcbiAgICBjYXNlIEdMX1VOU0lHTkVEX0JZVEU6XG4gICAgY2FzZSBHTF9VTlNJR05FRF9TSE9SVDpcbiAgICBjYXNlIEdMX1VOU0lHTkVEX0lOVDpcbiAgICBjYXNlIEdMX0ZMT0FUOlxuICAgICAgdmFyIGNvbnZlcnRlZCA9IHBvb2wuYWxsb2NUeXBlKHJlc3VsdC50eXBlLCBuKVxuICAgICAgY29udmVydGVkLnNldChkYXRhKVxuICAgICAgcmVzdWx0LmRhdGEgPSBjb252ZXJ0ZWRcbiAgICAgIGJyZWFrXG5cbiAgICBjYXNlIEdMX0hBTEZfRkxPQVRfT0VTOlxuICAgICAgcmVzdWx0LmRhdGEgPSBjb252ZXJ0VG9IYWxmRmxvYXQoZGF0YSlcbiAgICAgIGJyZWFrXG5cbiAgICBkZWZhdWx0OlxuICAgICAgXG4gIH1cbn1cblxuZnVuY3Rpb24gcHJlQ29udmVydCAoaW1hZ2UsIG4pIHtcbiAgcmV0dXJuIHBvb2wuYWxsb2NUeXBlKFxuICAgIGltYWdlLnR5cGUgPT09IEdMX0hBTEZfRkxPQVRfT0VTXG4gICAgICA/IEdMX0ZMT0FUXG4gICAgICA6IGltYWdlLnR5cGUsIG4pXG59XG5cbmZ1bmN0aW9uIHBvc3RDb252ZXJ0IChpbWFnZSwgZGF0YSkge1xuICBpZiAoaW1hZ2UudHlwZSA9PT0gR0xfSEFMRl9GTE9BVF9PRVMpIHtcbiAgICBpbWFnZS5kYXRhID0gY29udmVydFRvSGFsZkZsb2F0KGRhdGEpXG4gICAgcG9vbC5mcmVlVHlwZShkYXRhKVxuICB9IGVsc2Uge1xuICAgIGltYWdlLmRhdGEgPSBkYXRhXG4gIH1cbn1cblxuZnVuY3Rpb24gdHJhbnNwb3NlRGF0YSAoaW1hZ2UsIGFycmF5LCBzdHJpZGVYLCBzdHJpZGVZLCBzdHJpZGVDLCBvZmZzZXQpIHtcbiAgdmFyIHcgPSBpbWFnZS53aWR0aFxuICB2YXIgaCA9IGltYWdlLmhlaWdodFxuICB2YXIgYyA9IGltYWdlLmNoYW5uZWxzXG4gIHZhciBuID0gdyAqIGggKiBjXG4gIHZhciBkYXRhID0gcHJlQ29udmVydChpbWFnZSwgbilcblxuICB2YXIgcCA9IDBcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBoOyArK2kpIHtcbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IHc7ICsraikge1xuICAgICAgZm9yICh2YXIgayA9IDA7IGsgPCBjOyArK2spIHtcbiAgICAgICAgZGF0YVtwKytdID0gYXJyYXlbc3RyaWRlWCAqIGogKyBzdHJpZGVZICogaSArIHN0cmlkZUMgKiBrICsgb2Zmc2V0XVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHBvc3RDb252ZXJ0KGltYWdlLCBkYXRhKVxufVxuXG5mdW5jdGlvbiBnZXRUZXh0dXJlU2l6ZSAoZm9ybWF0LCB0eXBlLCB3aWR0aCwgaGVpZ2h0LCBpc01pcG1hcCwgaXNDdWJlKSB7XG4gIHZhciBzXG4gIGlmICh0eXBlb2YgRk9STUFUX1NJWkVTX1NQRUNJQUxbZm9ybWF0XSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAvLyB3ZSBoYXZlIGEgc3BlY2lhbCBhcnJheSBmb3IgZGVhbGluZyB3aXRoIHdlaXJkIGNvbG9yIGZvcm1hdHMgc3VjaCBhcyBSR0I1QTFcbiAgICBzID0gRk9STUFUX1NJWkVTX1NQRUNJQUxbZm9ybWF0XVxuICB9IGVsc2Uge1xuICAgIHMgPSBGT1JNQVRfQ0hBTk5FTFNbZm9ybWF0XSAqIFRZUEVfU0laRVNbdHlwZV1cbiAgfVxuXG4gIGlmIChpc0N1YmUpIHtcbiAgICBzICo9IDZcbiAgfVxuXG4gIGlmIChpc01pcG1hcCkge1xuICAgIC8vIGNvbXB1dGUgdGhlIHRvdGFsIHNpemUgb2YgYWxsIHRoZSBtaXBtYXBzLlxuICAgIHZhciB0b3RhbCA9IDBcblxuICAgIHZhciB3ID0gd2lkdGhcbiAgICB3aGlsZSAodyA+PSAxKSB7XG4gICAgICAvLyB3ZSBjYW4gb25seSB1c2UgbWlwbWFwcyBvbiBhIHNxdWFyZSBpbWFnZSxcbiAgICAgIC8vIHNvIHdlIGNhbiBzaW1wbHkgdXNlIHRoZSB3aWR0aCBhbmQgaWdub3JlIHRoZSBoZWlnaHQ6XG4gICAgICB0b3RhbCArPSBzICogdyAqIHdcbiAgICAgIHcgLz0gMlxuICAgIH1cbiAgICByZXR1cm4gdG90YWxcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gcyAqIHdpZHRoICogaGVpZ2h0XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjcmVhdGVUZXh0dXJlU2V0IChcbiAgZ2wsIGV4dGVuc2lvbnMsIGxpbWl0cywgcmVnbFBvbGwsIGNvbnRleHRTdGF0ZSwgc3RhdHMsIGNvbmZpZykge1xuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIEluaXRpYWxpemUgY29uc3RhbnRzIGFuZCBwYXJhbWV0ZXIgdGFibGVzIGhlcmVcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICB2YXIgbWlwbWFwSGludCA9IHtcbiAgICBcImRvbid0IGNhcmVcIjogR0xfRE9OVF9DQVJFLFxuICAgICdkb250IGNhcmUnOiBHTF9ET05UX0NBUkUsXG4gICAgJ25pY2UnOiBHTF9OSUNFU1QsXG4gICAgJ2Zhc3QnOiBHTF9GQVNURVNUXG4gIH1cblxuICB2YXIgd3JhcE1vZGVzID0ge1xuICAgICdyZXBlYXQnOiBHTF9SRVBFQVQsXG4gICAgJ2NsYW1wJzogR0xfQ0xBTVBfVE9fRURHRSxcbiAgICAnbWlycm9yJzogR0xfTUlSUk9SRURfUkVQRUFUXG4gIH1cblxuICB2YXIgbWFnRmlsdGVycyA9IHtcbiAgICAnbmVhcmVzdCc6IEdMX05FQVJFU1QsXG4gICAgJ2xpbmVhcic6IEdMX0xJTkVBUlxuICB9XG5cbiAgdmFyIG1pbkZpbHRlcnMgPSBleHRlbmQoe1xuICAgICdtaXBtYXAnOiBHTF9MSU5FQVJfTUlQTUFQX0xJTkVBUixcbiAgICAnbmVhcmVzdCBtaXBtYXAgbmVhcmVzdCc6IEdMX05FQVJFU1RfTUlQTUFQX05FQVJFU1QsXG4gICAgJ2xpbmVhciBtaXBtYXAgbmVhcmVzdCc6IEdMX0xJTkVBUl9NSVBNQVBfTkVBUkVTVCxcbiAgICAnbmVhcmVzdCBtaXBtYXAgbGluZWFyJzogR0xfTkVBUkVTVF9NSVBNQVBfTElORUFSLFxuICAgICdsaW5lYXIgbWlwbWFwIGxpbmVhcic6IEdMX0xJTkVBUl9NSVBNQVBfTElORUFSXG4gIH0sIG1hZ0ZpbHRlcnMpXG5cbiAgdmFyIGNvbG9yU3BhY2UgPSB7XG4gICAgJ25vbmUnOiAwLFxuICAgICdicm93c2VyJzogR0xfQlJPV1NFUl9ERUZBVUxUX1dFQkdMXG4gIH1cblxuICB2YXIgdGV4dHVyZVR5cGVzID0ge1xuICAgICd1aW50OCc6IEdMX1VOU0lHTkVEX0JZVEUsXG4gICAgJ3JnYmE0JzogR0xfVU5TSUdORURfU0hPUlRfNF80XzRfNCxcbiAgICAncmdiNTY1JzogR0xfVU5TSUdORURfU0hPUlRfNV82XzUsXG4gICAgJ3JnYjUgYTEnOiBHTF9VTlNJR05FRF9TSE9SVF81XzVfNV8xXG4gIH1cblxuICB2YXIgdGV4dHVyZUZvcm1hdHMgPSB7XG4gICAgJ2FscGhhJzogR0xfQUxQSEEsXG4gICAgJ2x1bWluYW5jZSc6IEdMX0xVTUlOQU5DRSxcbiAgICAnbHVtaW5hbmNlIGFscGhhJzogR0xfTFVNSU5BTkNFX0FMUEhBLFxuICAgICdyZ2InOiBHTF9SR0IsXG4gICAgJ3JnYmEnOiBHTF9SR0JBLFxuICAgICdyZ2JhNCc6IEdMX1JHQkE0LFxuICAgICdyZ2I1IGExJzogR0xfUkdCNV9BMSxcbiAgICAncmdiNTY1JzogR0xfUkdCNTY1XG4gIH1cblxuICB2YXIgY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzID0ge31cblxuICBpZiAoZXh0ZW5zaW9ucy5leHRfc3JnYikge1xuICAgIHRleHR1cmVGb3JtYXRzLnNyZ2IgPSBHTF9TUkdCX0VYVFxuICAgIHRleHR1cmVGb3JtYXRzLnNyZ2JhID0gR0xfU1JHQl9BTFBIQV9FWFRcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLm9lc190ZXh0dXJlX2Zsb2F0KSB7XG4gICAgdGV4dHVyZVR5cGVzLmZsb2F0MzIgPSB0ZXh0dXJlVHlwZXMuZmxvYXQgPSBHTF9GTE9BVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMub2VzX3RleHR1cmVfaGFsZl9mbG9hdCkge1xuICAgIHRleHR1cmVUeXBlc1snZmxvYXQxNiddID0gdGV4dHVyZVR5cGVzWydoYWxmIGZsb2F0J10gPSBHTF9IQUxGX0ZMT0FUX09FU1xuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfZGVwdGhfdGV4dHVyZSkge1xuICAgIGV4dGVuZCh0ZXh0dXJlRm9ybWF0cywge1xuICAgICAgJ2RlcHRoJzogR0xfREVQVEhfQ09NUE9ORU5ULFxuICAgICAgJ2RlcHRoIHN0ZW5jaWwnOiBHTF9ERVBUSF9TVEVOQ0lMXG4gICAgfSlcblxuICAgIGV4dGVuZCh0ZXh0dXJlVHlwZXMsIHtcbiAgICAgICd1aW50MTYnOiBHTF9VTlNJR05FRF9TSE9SVCxcbiAgICAgICd1aW50MzInOiBHTF9VTlNJR05FRF9JTlQsXG4gICAgICAnZGVwdGggc3RlbmNpbCc6IEdMX1VOU0lHTkVEX0lOVF8yNF84X1dFQkdMXG4gICAgfSlcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9zM3RjKSB7XG4gICAgZXh0ZW5kKGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cywge1xuICAgICAgJ3JnYiBzM3RjIGR4dDEnOiBHTF9DT01QUkVTU0VEX1JHQl9TM1RDX0RYVDFfRVhULFxuICAgICAgJ3JnYmEgczN0YyBkeHQxJzogR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUMV9FWFQsXG4gICAgICAncmdiYSBzM3RjIGR4dDMnOiBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQzX0VYVCxcbiAgICAgICdyZ2JhIHMzdGMgZHh0NSc6IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDVfRVhUXG4gICAgfSlcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9hdGMpIHtcbiAgICBleHRlbmQoY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzLCB7XG4gICAgICAncmdiIGF0Yyc6IEdMX0NPTVBSRVNTRURfUkdCX0FUQ19XRUJHTCxcbiAgICAgICdyZ2JhIGF0YyBleHBsaWNpdCBhbHBoYSc6IEdMX0NPTVBSRVNTRURfUkdCQV9BVENfRVhQTElDSVRfQUxQSEFfV0VCR0wsXG4gICAgICAncmdiYSBhdGMgaW50ZXJwb2xhdGVkIGFscGhhJzogR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19JTlRFUlBPTEFURURfQUxQSEFfV0VCR0xcbiAgICB9KVxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29tcHJlc3NlZF90ZXh0dXJlX3B2cnRjKSB7XG4gICAgZXh0ZW5kKGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cywge1xuICAgICAgJ3JnYiBwdnJ0YyA0YnBwdjEnOiBHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ180QlBQVjFfSU1HLFxuICAgICAgJ3JnYiBwdnJ0YyAyYnBwdjEnOiBHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ18yQlBQVjFfSU1HLFxuICAgICAgJ3JnYmEgcHZydGMgNGJwcHYxJzogR0xfQ09NUFJFU1NFRF9SR0JBX1BWUlRDXzRCUFBWMV9JTUcsXG4gICAgICAncmdiYSBwdnJ0YyAyYnBwdjEnOiBHTF9DT01QUkVTU0VEX1JHQkFfUFZSVENfMkJQUFYxX0lNR1xuICAgIH0pXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb21wcmVzc2VkX3RleHR1cmVfZXRjMSkge1xuICAgIGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0c1sncmdiIGV0YzEnXSA9IEdMX0NPTVBSRVNTRURfUkdCX0VUQzFfV0VCR0xcbiAgfVxuXG4gIC8vIENvcHkgb3ZlciBhbGwgdGV4dHVyZSBmb3JtYXRzXG4gIHZhciBzdXBwb3J0ZWRDb21wcmVzc2VkRm9ybWF0cyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKFxuICAgIGdsLmdldFBhcmFtZXRlcihHTF9DT01QUkVTU0VEX1RFWFRVUkVfRk9STUFUUykpXG4gIE9iamVjdC5rZXlzKGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cykuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgIHZhciBmb3JtYXQgPSBjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHNbbmFtZV1cbiAgICBpZiAoc3VwcG9ydGVkQ29tcHJlc3NlZEZvcm1hdHMuaW5kZXhPZihmb3JtYXQpID49IDApIHtcbiAgICAgIHRleHR1cmVGb3JtYXRzW25hbWVdID0gZm9ybWF0XG4gICAgfVxuICB9KVxuXG4gIHZhciBzdXBwb3J0ZWRGb3JtYXRzID0gT2JqZWN0LmtleXModGV4dHVyZUZvcm1hdHMpXG4gIGxpbWl0cy50ZXh0dXJlRm9ybWF0cyA9IHN1cHBvcnRlZEZvcm1hdHNcblxuICAvLyBhc3NvY2lhdGUgd2l0aCBldmVyeSBmb3JtYXQgc3RyaW5nIGl0c1xuICAvLyBjb3JyZXNwb25kaW5nIEdMLXZhbHVlLlxuICB2YXIgdGV4dHVyZUZvcm1hdHNJbnZlcnQgPSBbXVxuICBPYmplY3Qua2V5cyh0ZXh0dXJlRm9ybWF0cykuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgdmFyIHZhbCA9IHRleHR1cmVGb3JtYXRzW2tleV1cbiAgICB0ZXh0dXJlRm9ybWF0c0ludmVydFt2YWxdID0ga2V5XG4gIH0pXG5cbiAgLy8gYXNzb2NpYXRlIHdpdGggZXZlcnkgdHlwZSBzdHJpbmcgaXRzXG4gIC8vIGNvcnJlc3BvbmRpbmcgR0wtdmFsdWUuXG4gIHZhciB0ZXh0dXJlVHlwZXNJbnZlcnQgPSBbXVxuICBPYmplY3Qua2V5cyh0ZXh0dXJlVHlwZXMpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgIHZhciB2YWwgPSB0ZXh0dXJlVHlwZXNba2V5XVxuICAgIHRleHR1cmVUeXBlc0ludmVydFt2YWxdID0ga2V5XG4gIH0pXG5cbiAgdmFyIG1hZ0ZpbHRlcnNJbnZlcnQgPSBbXVxuICBPYmplY3Qua2V5cyhtYWdGaWx0ZXJzKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICB2YXIgdmFsID0gbWFnRmlsdGVyc1trZXldXG4gICAgbWFnRmlsdGVyc0ludmVydFt2YWxdID0ga2V5XG4gIH0pXG5cbiAgdmFyIG1pbkZpbHRlcnNJbnZlcnQgPSBbXVxuICBPYmplY3Qua2V5cyhtaW5GaWx0ZXJzKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICB2YXIgdmFsID0gbWluRmlsdGVyc1trZXldXG4gICAgbWluRmlsdGVyc0ludmVydFt2YWxdID0ga2V5XG4gIH0pXG5cbiAgdmFyIHdyYXBNb2Rlc0ludmVydCA9IFtdXG4gIE9iamVjdC5rZXlzKHdyYXBNb2RlcykuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgdmFyIHZhbCA9IHdyYXBNb2Rlc1trZXldXG4gICAgd3JhcE1vZGVzSW52ZXJ0W3ZhbF0gPSBrZXlcbiAgfSlcblxuICAvLyBjb2xvckZvcm1hdHNbXSBnaXZlcyB0aGUgZm9ybWF0IChjaGFubmVscykgYXNzb2NpYXRlZCB0byBhblxuICAvLyBpbnRlcm5hbGZvcm1hdFxuICB2YXIgY29sb3JGb3JtYXRzID0gc3VwcG9ydGVkRm9ybWF0cy5yZWR1Y2UoZnVuY3Rpb24gKGNvbG9yLCBrZXkpIHtcbiAgICB2YXIgZ2xlbnVtID0gdGV4dHVyZUZvcm1hdHNba2V5XVxuICAgIGlmIChnbGVudW0gPT09IEdMX0xVTUlOQU5DRSB8fFxuICAgICAgICBnbGVudW0gPT09IEdMX0FMUEhBIHx8XG4gICAgICAgIGdsZW51bSA9PT0gR0xfTFVNSU5BTkNFIHx8XG4gICAgICAgIGdsZW51bSA9PT0gR0xfTFVNSU5BTkNFX0FMUEhBIHx8XG4gICAgICAgIGdsZW51bSA9PT0gR0xfREVQVEhfQ09NUE9ORU5UIHx8XG4gICAgICAgIGdsZW51bSA9PT0gR0xfREVQVEhfU1RFTkNJTCkge1xuICAgICAgY29sb3JbZ2xlbnVtXSA9IGdsZW51bVxuICAgIH0gZWxzZSBpZiAoZ2xlbnVtID09PSBHTF9SR0I1X0ExIHx8IGtleS5pbmRleE9mKCdyZ2JhJykgPj0gMCkge1xuICAgICAgY29sb3JbZ2xlbnVtXSA9IEdMX1JHQkFcbiAgICB9IGVsc2Uge1xuICAgICAgY29sb3JbZ2xlbnVtXSA9IEdMX1JHQlxuICAgIH1cbiAgICByZXR1cm4gY29sb3JcbiAgfSwge30pXG5cbiAgZnVuY3Rpb24gVGV4RmxhZ3MgKCkge1xuICAgIC8vIGZvcm1hdCBpbmZvXG4gICAgdGhpcy5pbnRlcm5hbGZvcm1hdCA9IEdMX1JHQkFcbiAgICB0aGlzLmZvcm1hdCA9IEdMX1JHQkFcbiAgICB0aGlzLnR5cGUgPSBHTF9VTlNJR05FRF9CWVRFXG4gICAgdGhpcy5jb21wcmVzc2VkID0gZmFsc2VcblxuICAgIC8vIHBpeGVsIHN0b3JhZ2VcbiAgICB0aGlzLnByZW11bHRpcGx5QWxwaGEgPSBmYWxzZVxuICAgIHRoaXMuZmxpcFkgPSBmYWxzZVxuICAgIHRoaXMudW5wYWNrQWxpZ25tZW50ID0gMVxuICAgIHRoaXMuY29sb3JTcGFjZSA9IDBcblxuICAgIC8vIHNoYXBlIGluZm9cbiAgICB0aGlzLndpZHRoID0gMFxuICAgIHRoaXMuaGVpZ2h0ID0gMFxuICAgIHRoaXMuY2hhbm5lbHMgPSAwXG4gIH1cblxuICBmdW5jdGlvbiBjb3B5RmxhZ3MgKHJlc3VsdCwgb3RoZXIpIHtcbiAgICByZXN1bHQuaW50ZXJuYWxmb3JtYXQgPSBvdGhlci5pbnRlcm5hbGZvcm1hdFxuICAgIHJlc3VsdC5mb3JtYXQgPSBvdGhlci5mb3JtYXRcbiAgICByZXN1bHQudHlwZSA9IG90aGVyLnR5cGVcbiAgICByZXN1bHQuY29tcHJlc3NlZCA9IG90aGVyLmNvbXByZXNzZWRcblxuICAgIHJlc3VsdC5wcmVtdWx0aXBseUFscGhhID0gb3RoZXIucHJlbXVsdGlwbHlBbHBoYVxuICAgIHJlc3VsdC5mbGlwWSA9IG90aGVyLmZsaXBZXG4gICAgcmVzdWx0LnVucGFja0FsaWdubWVudCA9IG90aGVyLnVucGFja0FsaWdubWVudFxuICAgIHJlc3VsdC5jb2xvclNwYWNlID0gb3RoZXIuY29sb3JTcGFjZVxuXG4gICAgcmVzdWx0LndpZHRoID0gb3RoZXIud2lkdGhcbiAgICByZXN1bHQuaGVpZ2h0ID0gb3RoZXIuaGVpZ2h0XG4gICAgcmVzdWx0LmNoYW5uZWxzID0gb3RoZXIuY2hhbm5lbHNcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlRmxhZ3MgKGZsYWdzLCBvcHRpb25zKSB7XG4gICAgaWYgKHR5cGVvZiBvcHRpb25zICE9PSAnb2JqZWN0JyB8fCAhb3B0aW9ucykge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgaWYgKCdwcmVtdWx0aXBseUFscGhhJyBpbiBvcHRpb25zKSB7XG4gICAgICBcbiAgICAgIGZsYWdzLnByZW11bHRpcGx5QWxwaGEgPSBvcHRpb25zLnByZW11bHRpcGx5QWxwaGFcbiAgICB9XG5cbiAgICBpZiAoJ2ZsaXBZJyBpbiBvcHRpb25zKSB7XG4gICAgICBcbiAgICAgIGZsYWdzLmZsaXBZID0gb3B0aW9ucy5mbGlwWVxuICAgIH1cblxuICAgIGlmICgnYWxpZ25tZW50JyBpbiBvcHRpb25zKSB7XG4gICAgICBcbiAgICAgIGZsYWdzLnVucGFja0FsaWdubWVudCA9IG9wdGlvbnMuYWxpZ25tZW50XG4gICAgfVxuXG4gICAgaWYgKCdjb2xvclNwYWNlJyBpbiBvcHRpb25zKSB7XG4gICAgICBcbiAgICAgIGZsYWdzLmNvbG9yU3BhY2UgPSBjb2xvclNwYWNlW29wdGlvbnMuY29sb3JTcGFjZV1cbiAgICB9XG5cbiAgICBpZiAoJ3R5cGUnIGluIG9wdGlvbnMpIHtcbiAgICAgIHZhciB0eXBlID0gb3B0aW9ucy50eXBlXG4gICAgICBcbiAgICAgIFxuICAgICAgXG4gICAgICBcbiAgICAgIGZsYWdzLnR5cGUgPSB0ZXh0dXJlVHlwZXNbdHlwZV1cbiAgICB9XG5cbiAgICB2YXIgdyA9IGZsYWdzLndpZHRoXG4gICAgdmFyIGggPSBmbGFncy5oZWlnaHRcbiAgICB2YXIgYyA9IGZsYWdzLmNoYW5uZWxzXG4gICAgdmFyIGhhc0NoYW5uZWxzID0gZmFsc2VcbiAgICBpZiAoJ3NoYXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICBcbiAgICAgIHcgPSBvcHRpb25zLnNoYXBlWzBdXG4gICAgICBoID0gb3B0aW9ucy5zaGFwZVsxXVxuICAgICAgaWYgKG9wdGlvbnMuc2hhcGUubGVuZ3RoID09PSAzKSB7XG4gICAgICAgIGMgPSBvcHRpb25zLnNoYXBlWzJdXG4gICAgICAgIFxuICAgICAgICBoYXNDaGFubmVscyA9IHRydWVcbiAgICAgIH1cbiAgICAgIFxuICAgICAgXG4gICAgfSBlbHNlIHtcbiAgICAgIGlmICgncmFkaXVzJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHcgPSBoID0gb3B0aW9ucy5yYWRpdXNcbiAgICAgICAgXG4gICAgICB9XG4gICAgICBpZiAoJ3dpZHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHcgPSBvcHRpb25zLndpZHRoXG4gICAgICAgIFxuICAgICAgfVxuICAgICAgaWYgKCdoZWlnaHQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgaCA9IG9wdGlvbnMuaGVpZ2h0XG4gICAgICAgIFxuICAgICAgfVxuICAgICAgaWYgKCdjaGFubmVscycgaW4gb3B0aW9ucykge1xuICAgICAgICBjID0gb3B0aW9ucy5jaGFubmVsc1xuICAgICAgICBcbiAgICAgICAgaGFzQ2hhbm5lbHMgPSB0cnVlXG4gICAgICB9XG4gICAgfVxuICAgIGZsYWdzLndpZHRoID0gdyB8IDBcbiAgICBmbGFncy5oZWlnaHQgPSBoIHwgMFxuICAgIGZsYWdzLmNoYW5uZWxzID0gYyB8IDBcblxuICAgIHZhciBoYXNGb3JtYXQgPSBmYWxzZVxuICAgIGlmICgnZm9ybWF0JyBpbiBvcHRpb25zKSB7XG4gICAgICB2YXIgZm9ybWF0U3RyID0gb3B0aW9ucy5mb3JtYXRcbiAgICAgIFxuICAgICAgXG4gICAgICB2YXIgaW50ZXJuYWxmb3JtYXQgPSBmbGFncy5pbnRlcm5hbGZvcm1hdCA9IHRleHR1cmVGb3JtYXRzW2Zvcm1hdFN0cl1cbiAgICAgIGZsYWdzLmZvcm1hdCA9IGNvbG9yRm9ybWF0c1tpbnRlcm5hbGZvcm1hdF1cbiAgICAgIGlmIChmb3JtYXRTdHIgaW4gdGV4dHVyZVR5cGVzKSB7XG4gICAgICAgIGlmICghKCd0eXBlJyBpbiBvcHRpb25zKSkge1xuICAgICAgICAgIGZsYWdzLnR5cGUgPSB0ZXh0dXJlVHlwZXNbZm9ybWF0U3RyXVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoZm9ybWF0U3RyIGluIGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cykge1xuICAgICAgICBmbGFncy5jb21wcmVzc2VkID0gdHJ1ZVxuICAgICAgfVxuICAgICAgaGFzRm9ybWF0ID0gdHJ1ZVxuICAgIH1cblxuICAgIC8vIFJlY29uY2lsZSBjaGFubmVscyBhbmQgZm9ybWF0XG4gICAgaWYgKCFoYXNDaGFubmVscyAmJiBoYXNGb3JtYXQpIHtcbiAgICAgIGZsYWdzLmNoYW5uZWxzID0gRk9STUFUX0NIQU5ORUxTW2ZsYWdzLmZvcm1hdF1cbiAgICB9IGVsc2UgaWYgKGhhc0NoYW5uZWxzICYmICFoYXNGb3JtYXQpIHtcbiAgICAgIGlmIChmbGFncy5jaGFubmVscyAhPT0gQ0hBTk5FTFNfRk9STUFUW2ZsYWdzLmZvcm1hdF0pIHtcbiAgICAgICAgZmxhZ3MuZm9ybWF0ID0gZmxhZ3MuaW50ZXJuYWxmb3JtYXQgPSBDSEFOTkVMU19GT1JNQVRbZmxhZ3MuY2hhbm5lbHNdXG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChoYXNGb3JtYXQgJiYgaGFzQ2hhbm5lbHMpIHtcbiAgICAgIFxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHNldEZsYWdzIChmbGFncykge1xuICAgIGdsLnBpeGVsU3RvcmVpKEdMX1VOUEFDS19GTElQX1lfV0VCR0wsIGZsYWdzLmZsaXBZKVxuICAgIGdsLnBpeGVsU3RvcmVpKEdMX1VOUEFDS19QUkVNVUxUSVBMWV9BTFBIQV9XRUJHTCwgZmxhZ3MucHJlbXVsdGlwbHlBbHBoYSlcbiAgICBnbC5waXhlbFN0b3JlaShHTF9VTlBBQ0tfQ09MT1JTUEFDRV9DT05WRVJTSU9OX1dFQkdMLCBmbGFncy5jb2xvclNwYWNlKVxuICAgIGdsLnBpeGVsU3RvcmVpKEdMX1VOUEFDS19BTElHTk1FTlQsIGZsYWdzLnVucGFja0FsaWdubWVudClcbiAgfVxuXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gVGV4IGltYWdlIGRhdGFcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICBmdW5jdGlvbiBUZXhJbWFnZSAoKSB7XG4gICAgVGV4RmxhZ3MuY2FsbCh0aGlzKVxuXG4gICAgdGhpcy54T2Zmc2V0ID0gMFxuICAgIHRoaXMueU9mZnNldCA9IDBcblxuICAgIC8vIGRhdGFcbiAgICB0aGlzLmRhdGEgPSBudWxsXG4gICAgdGhpcy5uZWVkc0ZyZWUgPSBmYWxzZVxuXG4gICAgLy8gaHRtbCBlbGVtZW50XG4gICAgdGhpcy5lbGVtZW50ID0gbnVsbFxuXG4gICAgLy8gY29weVRleEltYWdlIGluZm9cbiAgICB0aGlzLm5lZWRzQ29weSA9IGZhbHNlXG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZUltYWdlIChpbWFnZSwgb3B0aW9ucykge1xuICAgIHZhciBkYXRhID0gbnVsbFxuICAgIGlmIChpc1BpeGVsRGF0YShvcHRpb25zKSkge1xuICAgICAgZGF0YSA9IG9wdGlvbnNcbiAgICB9IGVsc2UgaWYgKG9wdGlvbnMpIHtcbiAgICAgIFxuICAgICAgcGFyc2VGbGFncyhpbWFnZSwgb3B0aW9ucylcbiAgICAgIGlmICgneCcgaW4gb3B0aW9ucykge1xuICAgICAgICBpbWFnZS54T2Zmc2V0ID0gb3B0aW9ucy54IHwgMFxuICAgICAgfVxuICAgICAgaWYgKCd5JyBpbiBvcHRpb25zKSB7XG4gICAgICAgIGltYWdlLnlPZmZzZXQgPSBvcHRpb25zLnkgfCAwXG4gICAgICB9XG4gICAgICBpZiAoaXNQaXhlbERhdGEob3B0aW9ucy5kYXRhKSkge1xuICAgICAgICBkYXRhID0gb3B0aW9ucy5kYXRhXG4gICAgICB9XG4gICAgfVxuXG4gICAgXG5cbiAgICBpZiAob3B0aW9ucy5jb3B5KSB7XG4gICAgICBcbiAgICAgIHZhciB2aWV3VyA9IGNvbnRleHRTdGF0ZS52aWV3cG9ydFdpZHRoXG4gICAgICB2YXIgdmlld0ggPSBjb250ZXh0U3RhdGUudmlld3BvcnRIZWlnaHRcbiAgICAgIGltYWdlLndpZHRoID0gaW1hZ2Uud2lkdGggfHwgKHZpZXdXIC0gaW1hZ2UueE9mZnNldClcbiAgICAgIGltYWdlLmhlaWdodCA9IGltYWdlLmhlaWdodCB8fCAodmlld0ggLSBpbWFnZS55T2Zmc2V0KVxuICAgICAgaW1hZ2UubmVlZHNDb3B5ID0gdHJ1ZVxuICAgICAgXG4gICAgfSBlbHNlIGlmICghZGF0YSkge1xuICAgICAgaW1hZ2Uud2lkdGggPSBpbWFnZS53aWR0aCB8fCAxXG4gICAgICBpbWFnZS5oZWlnaHQgPSBpbWFnZS5oZWlnaHQgfHwgMVxuICAgICAgaW1hZ2UuY2hhbm5lbHMgPSBpbWFnZS5jaGFubmVscyB8fCA0XG4gICAgfSBlbHNlIGlmIChpc1R5cGVkQXJyYXkoZGF0YSkpIHtcbiAgICAgIGltYWdlLmNoYW5uZWxzID0gaW1hZ2UuY2hhbm5lbHMgfHwgNFxuICAgICAgaW1hZ2UuZGF0YSA9IGRhdGFcbiAgICAgIGlmICghKCd0eXBlJyBpbiBvcHRpb25zKSAmJiBpbWFnZS50eXBlID09PSBHTF9VTlNJR05FRF9CWVRFKSB7XG4gICAgICAgIGltYWdlLnR5cGUgPSB0eXBlZEFycmF5Q29kZShkYXRhKVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoaXNOdW1lcmljQXJyYXkoZGF0YSkpIHtcbiAgICAgIGltYWdlLmNoYW5uZWxzID0gaW1hZ2UuY2hhbm5lbHMgfHwgNFxuICAgICAgY29udmVydERhdGEoaW1hZ2UsIGRhdGEpXG4gICAgICBpbWFnZS5hbGlnbm1lbnQgPSAxXG4gICAgICBpbWFnZS5uZWVkc0ZyZWUgPSB0cnVlXG4gICAgfSBlbHNlIGlmIChpc05EQXJyYXlMaWtlKGRhdGEpKSB7XG4gICAgICB2YXIgYXJyYXkgPSBkYXRhLmRhdGFcbiAgICAgIGlmICghQXJyYXkuaXNBcnJheShhcnJheSkgJiYgaW1hZ2UudHlwZSA9PT0gR0xfVU5TSUdORURfQllURSkge1xuICAgICAgICBpbWFnZS50eXBlID0gdHlwZWRBcnJheUNvZGUoYXJyYXkpXG4gICAgICB9XG4gICAgICB2YXIgc2hhcGUgPSBkYXRhLnNoYXBlXG4gICAgICB2YXIgc3RyaWRlID0gZGF0YS5zdHJpZGVcbiAgICAgIHZhciBzaGFwZVgsIHNoYXBlWSwgc2hhcGVDLCBzdHJpZGVYLCBzdHJpZGVZLCBzdHJpZGVDXG4gICAgICBpZiAoc2hhcGUubGVuZ3RoID09PSAzKSB7XG4gICAgICAgIHNoYXBlQyA9IHNoYXBlWzJdXG4gICAgICAgIHN0cmlkZUMgPSBzdHJpZGVbMl1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIFxuICAgICAgICBzaGFwZUMgPSAxXG4gICAgICAgIHN0cmlkZUMgPSAxXG4gICAgICB9XG4gICAgICBzaGFwZVggPSBzaGFwZVswXVxuICAgICAgc2hhcGVZID0gc2hhcGVbMV1cbiAgICAgIHN0cmlkZVggPSBzdHJpZGVbMF1cbiAgICAgIHN0cmlkZVkgPSBzdHJpZGVbMV1cbiAgICAgIGltYWdlLmFsaWdubWVudCA9IDFcbiAgICAgIGltYWdlLndpZHRoID0gc2hhcGVYXG4gICAgICBpbWFnZS5oZWlnaHQgPSBzaGFwZVlcbiAgICAgIGltYWdlLmNoYW5uZWxzID0gc2hhcGVDXG4gICAgICBpbWFnZS5mb3JtYXQgPSBpbWFnZS5pbnRlcm5hbGZvcm1hdCA9IENIQU5ORUxTX0ZPUk1BVFtzaGFwZUNdXG4gICAgICBpbWFnZS5uZWVkc0ZyZWUgPSB0cnVlXG4gICAgICB0cmFuc3Bvc2VEYXRhKGltYWdlLCBhcnJheSwgc3RyaWRlWCwgc3RyaWRlWSwgc3RyaWRlQywgZGF0YS5vZmZzZXQpXG4gICAgfSBlbHNlIGlmIChpc0NhbnZhc0VsZW1lbnQoZGF0YSkgfHwgaXNDb250ZXh0MkQoZGF0YSkpIHtcbiAgICAgIGlmIChpc0NhbnZhc0VsZW1lbnQoZGF0YSkpIHtcbiAgICAgICAgaW1hZ2UuZWxlbWVudCA9IGRhdGFcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGltYWdlLmVsZW1lbnQgPSBkYXRhLmNhbnZhc1xuICAgICAgfVxuICAgICAgaW1hZ2Uud2lkdGggPSBpbWFnZS5lbGVtZW50LndpZHRoXG4gICAgICBpbWFnZS5oZWlnaHQgPSBpbWFnZS5lbGVtZW50LmhlaWdodFxuICAgICAgaW1hZ2UuY2hhbm5lbHMgPSA0XG4gICAgfSBlbHNlIGlmIChpc0ltYWdlRWxlbWVudChkYXRhKSkge1xuICAgICAgaW1hZ2UuZWxlbWVudCA9IGRhdGFcbiAgICAgIGltYWdlLndpZHRoID0gZGF0YS5uYXR1cmFsV2lkdGhcbiAgICAgIGltYWdlLmhlaWdodCA9IGRhdGEubmF0dXJhbEhlaWdodFxuICAgICAgaW1hZ2UuY2hhbm5lbHMgPSA0XG4gICAgfSBlbHNlIGlmIChpc1ZpZGVvRWxlbWVudChkYXRhKSkge1xuICAgICAgaW1hZ2UuZWxlbWVudCA9IGRhdGFcbiAgICAgIGltYWdlLndpZHRoID0gZGF0YS52aWRlb1dpZHRoXG4gICAgICBpbWFnZS5oZWlnaHQgPSBkYXRhLnZpZGVvSGVpZ2h0XG4gICAgICBpbWFnZS5jaGFubmVscyA9IDRcbiAgICB9IGVsc2UgaWYgKGlzUmVjdEFycmF5KGRhdGEpKSB7XG4gICAgICB2YXIgdyA9IGltYWdlLndpZHRoIHx8IGRhdGFbMF0ubGVuZ3RoXG4gICAgICB2YXIgaCA9IGltYWdlLmhlaWdodCB8fCBkYXRhLmxlbmd0aFxuICAgICAgdmFyIGMgPSBpbWFnZS5jaGFubmVsc1xuICAgICAgaWYgKGlzQXJyYXlMaWtlKGRhdGFbMF1bMF0pKSB7XG4gICAgICAgIGMgPSBjIHx8IGRhdGFbMF1bMF0ubGVuZ3RoXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjID0gYyB8fCAxXG4gICAgICB9XG4gICAgICB2YXIgYXJyYXlTaGFwZSA9IGZsYXR0ZW5VdGlscy5zaGFwZShkYXRhKVxuICAgICAgdmFyIG4gPSAxXG4gICAgICBmb3IgKHZhciBkZCA9IDA7IGRkIDwgYXJyYXlTaGFwZS5sZW5ndGg7ICsrZGQpIHtcbiAgICAgICAgbiAqPSBhcnJheVNoYXBlW2RkXVxuICAgICAgfVxuICAgICAgdmFyIGFsbG9jRGF0YSA9IHByZUNvbnZlcnQoaW1hZ2UsIG4pXG4gICAgICBmbGF0dGVuVXRpbHMuZmxhdHRlbihkYXRhLCBhcnJheVNoYXBlLCAnJywgYWxsb2NEYXRhKVxuICAgICAgcG9zdENvbnZlcnQoaW1hZ2UsIGFsbG9jRGF0YSlcbiAgICAgIGltYWdlLmFsaWdubWVudCA9IDFcbiAgICAgIGltYWdlLndpZHRoID0gd1xuICAgICAgaW1hZ2UuaGVpZ2h0ID0gaFxuICAgICAgaW1hZ2UuY2hhbm5lbHMgPSBjXG4gICAgICBpbWFnZS5mb3JtYXQgPSBpbWFnZS5pbnRlcm5hbGZvcm1hdCA9IENIQU5ORUxTX0ZPUk1BVFtjXVxuICAgICAgaW1hZ2UubmVlZHNGcmVlID0gdHJ1ZVxuICAgIH1cblxuICAgIGlmIChpbWFnZS50eXBlID09PSBHTF9GTE9BVCkge1xuICAgICAgXG4gICAgfSBlbHNlIGlmIChpbWFnZS50eXBlID09PSBHTF9IQUxGX0ZMT0FUX09FUykge1xuICAgICAgXG4gICAgfVxuXG4gICAgLy8gZG8gY29tcHJlc3NlZCB0ZXh0dXJlICB2YWxpZGF0aW9uIGhlcmUuXG4gIH1cblxuICBmdW5jdGlvbiBzZXRJbWFnZSAoaW5mbywgdGFyZ2V0LCBtaXBsZXZlbCkge1xuICAgIHZhciBlbGVtZW50ID0gaW5mby5lbGVtZW50XG4gICAgdmFyIGRhdGEgPSBpbmZvLmRhdGFcbiAgICB2YXIgaW50ZXJuYWxmb3JtYXQgPSBpbmZvLmludGVybmFsZm9ybWF0XG4gICAgdmFyIGZvcm1hdCA9IGluZm8uZm9ybWF0XG4gICAgdmFyIHR5cGUgPSBpbmZvLnR5cGVcbiAgICB2YXIgd2lkdGggPSBpbmZvLndpZHRoXG4gICAgdmFyIGhlaWdodCA9IGluZm8uaGVpZ2h0XG5cbiAgICBzZXRGbGFncyhpbmZvKVxuXG4gICAgaWYgKGVsZW1lbnQpIHtcbiAgICAgIGdsLnRleEltYWdlMkQodGFyZ2V0LCBtaXBsZXZlbCwgZm9ybWF0LCBmb3JtYXQsIHR5cGUsIGVsZW1lbnQpXG4gICAgfSBlbHNlIGlmIChpbmZvLmNvbXByZXNzZWQpIHtcbiAgICAgIGdsLmNvbXByZXNzZWRUZXhJbWFnZTJEKHRhcmdldCwgbWlwbGV2ZWwsIGludGVybmFsZm9ybWF0LCB3aWR0aCwgaGVpZ2h0LCAwLCBkYXRhKVxuICAgIH0gZWxzZSBpZiAoaW5mby5uZWVkc0NvcHkpIHtcbiAgICAgIHJlZ2xQb2xsKClcbiAgICAgIGdsLmNvcHlUZXhJbWFnZTJEKFxuICAgICAgICB0YXJnZXQsIG1pcGxldmVsLCBmb3JtYXQsIGluZm8ueE9mZnNldCwgaW5mby55T2Zmc2V0LCB3aWR0aCwgaGVpZ2h0LCAwKVxuICAgIH0gZWxzZSB7XG4gICAgICBnbC50ZXhJbWFnZTJEKFxuICAgICAgICB0YXJnZXQsIG1pcGxldmVsLCBmb3JtYXQsIHdpZHRoLCBoZWlnaHQsIDAsIGZvcm1hdCwgdHlwZSwgZGF0YSlcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzZXRTdWJJbWFnZSAoaW5mbywgdGFyZ2V0LCB4LCB5LCBtaXBsZXZlbCkge1xuICAgIHZhciBlbGVtZW50ID0gaW5mby5lbGVtZW50XG4gICAgdmFyIGRhdGEgPSBpbmZvLmRhdGFcbiAgICB2YXIgaW50ZXJuYWxmb3JtYXQgPSBpbmZvLmludGVybmFsZm9ybWF0XG4gICAgdmFyIGZvcm1hdCA9IGluZm8uZm9ybWF0XG4gICAgdmFyIHR5cGUgPSBpbmZvLnR5cGVcbiAgICB2YXIgd2lkdGggPSBpbmZvLndpZHRoXG4gICAgdmFyIGhlaWdodCA9IGluZm8uaGVpZ2h0XG5cbiAgICBzZXRGbGFncyhpbmZvKVxuXG4gICAgaWYgKGVsZW1lbnQpIHtcbiAgICAgIGdsLnRleFN1YkltYWdlMkQoXG4gICAgICAgIHRhcmdldCwgbWlwbGV2ZWwsIHgsIHksIGZvcm1hdCwgdHlwZSwgZWxlbWVudClcbiAgICB9IGVsc2UgaWYgKGluZm8uY29tcHJlc3NlZCkge1xuICAgICAgZ2wuY29tcHJlc3NlZFRleFN1YkltYWdlMkQoXG4gICAgICAgIHRhcmdldCwgbWlwbGV2ZWwsIHgsIHksIGludGVybmFsZm9ybWF0LCB3aWR0aCwgaGVpZ2h0LCBkYXRhKVxuICAgIH0gZWxzZSBpZiAoaW5mby5uZWVkc0NvcHkpIHtcbiAgICAgIHJlZ2xQb2xsKClcbiAgICAgIGdsLmNvcHlUZXhTdWJJbWFnZTJEKFxuICAgICAgICB0YXJnZXQsIG1pcGxldmVsLCB4LCB5LCBpbmZvLnhPZmZzZXQsIGluZm8ueU9mZnNldCwgd2lkdGgsIGhlaWdodClcbiAgICB9IGVsc2Uge1xuICAgICAgZ2wudGV4U3ViSW1hZ2UyRChcbiAgICAgICAgdGFyZ2V0LCBtaXBsZXZlbCwgeCwgeSwgd2lkdGgsIGhlaWdodCwgZm9ybWF0LCB0eXBlLCBkYXRhKVxuICAgIH1cbiAgfVxuXG4gIC8vIHRleEltYWdlIHBvb2xcbiAgdmFyIGltYWdlUG9vbCA9IFtdXG5cbiAgZnVuY3Rpb24gYWxsb2NJbWFnZSAoKSB7XG4gICAgcmV0dXJuIGltYWdlUG9vbC5wb3AoKSB8fCBuZXcgVGV4SW1hZ2UoKVxuICB9XG5cbiAgZnVuY3Rpb24gZnJlZUltYWdlIChpbWFnZSkge1xuICAgIGlmIChpbWFnZS5uZWVkc0ZyZWUpIHtcbiAgICAgIHBvb2wuZnJlZVR5cGUoaW1hZ2UuZGF0YSlcbiAgICB9XG4gICAgVGV4SW1hZ2UuY2FsbChpbWFnZSlcbiAgICBpbWFnZVBvb2wucHVzaChpbWFnZSlcbiAgfVxuXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gTWlwIG1hcFxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIGZ1bmN0aW9uIE1pcE1hcCAoKSB7XG4gICAgVGV4RmxhZ3MuY2FsbCh0aGlzKVxuXG4gICAgdGhpcy5nZW5NaXBtYXBzID0gZmFsc2VcbiAgICB0aGlzLm1pcG1hcEhpbnQgPSBHTF9ET05UX0NBUkVcbiAgICB0aGlzLm1pcG1hc2sgPSAwXG4gICAgdGhpcy5pbWFnZXMgPSBBcnJheSgxNilcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlTWlwTWFwRnJvbVNoYXBlIChtaXBtYXAsIHdpZHRoLCBoZWlnaHQpIHtcbiAgICB2YXIgaW1nID0gbWlwbWFwLmltYWdlc1swXSA9IGFsbG9jSW1hZ2UoKVxuICAgIG1pcG1hcC5taXBtYXNrID0gMVxuICAgIGltZy53aWR0aCA9IG1pcG1hcC53aWR0aCA9IHdpZHRoXG4gICAgaW1nLmhlaWdodCA9IG1pcG1hcC5oZWlnaHQgPSBoZWlnaHRcbiAgICBpbWcuY2hhbm5lbHMgPSBtaXBtYXAuY2hhbm5lbHMgPSA0XG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZU1pcE1hcEZyb21PYmplY3QgKG1pcG1hcCwgb3B0aW9ucykge1xuICAgIHZhciBpbWdEYXRhID0gbnVsbFxuICAgIGlmIChpc1BpeGVsRGF0YShvcHRpb25zKSkge1xuICAgICAgaW1nRGF0YSA9IG1pcG1hcC5pbWFnZXNbMF0gPSBhbGxvY0ltYWdlKClcbiAgICAgIGNvcHlGbGFncyhpbWdEYXRhLCBtaXBtYXApXG4gICAgICBwYXJzZUltYWdlKGltZ0RhdGEsIG9wdGlvbnMpXG4gICAgICBtaXBtYXAubWlwbWFzayA9IDFcbiAgICB9IGVsc2Uge1xuICAgICAgcGFyc2VGbGFncyhtaXBtYXAsIG9wdGlvbnMpXG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShvcHRpb25zLm1pcG1hcCkpIHtcbiAgICAgICAgdmFyIG1pcERhdGEgPSBvcHRpb25zLm1pcG1hcFxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG1pcERhdGEubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICBpbWdEYXRhID0gbWlwbWFwLmltYWdlc1tpXSA9IGFsbG9jSW1hZ2UoKVxuICAgICAgICAgIGNvcHlGbGFncyhpbWdEYXRhLCBtaXBtYXApXG4gICAgICAgICAgaW1nRGF0YS53aWR0aCA+Pj0gaVxuICAgICAgICAgIGltZ0RhdGEuaGVpZ2h0ID4+PSBpXG4gICAgICAgICAgcGFyc2VJbWFnZShpbWdEYXRhLCBtaXBEYXRhW2ldKVxuICAgICAgICAgIG1pcG1hcC5taXBtYXNrIHw9ICgxIDw8IGkpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGltZ0RhdGEgPSBtaXBtYXAuaW1hZ2VzWzBdID0gYWxsb2NJbWFnZSgpXG4gICAgICAgIGNvcHlGbGFncyhpbWdEYXRhLCBtaXBtYXApXG4gICAgICAgIHBhcnNlSW1hZ2UoaW1nRGF0YSwgb3B0aW9ucylcbiAgICAgICAgbWlwbWFwLm1pcG1hc2sgPSAxXG4gICAgICB9XG4gICAgfVxuICAgIGNvcHlGbGFncyhtaXBtYXAsIG1pcG1hcC5pbWFnZXNbMF0pXG5cbiAgICAvLyBGb3IgdGV4dHVyZXMgb2YgdGhlIGNvbXByZXNzZWQgZm9ybWF0IFdFQkdMX2NvbXByZXNzZWRfdGV4dHVyZV9zM3RjXG4gICAgLy8gd2UgbXVzdCBoYXZlIHRoYXRcbiAgICAvL1xuICAgIC8vIFwiV2hlbiBsZXZlbCBlcXVhbHMgemVybyB3aWR0aCBhbmQgaGVpZ2h0IG11c3QgYmUgYSBtdWx0aXBsZSBvZiA0LlxuICAgIC8vIFdoZW4gbGV2ZWwgaXMgZ3JlYXRlciB0aGFuIDAgd2lkdGggYW5kIGhlaWdodCBtdXN0IGJlIDAsIDEsIDIgb3IgYSBtdWx0aXBsZSBvZiA0LiBcIlxuICAgIC8vXG4gICAgLy8gYnV0IHdlIGRvIG5vdCB5ZXQgc3VwcG9ydCBoYXZpbmcgbXVsdGlwbGUgbWlwbWFwIGxldmVscyBmb3IgY29tcHJlc3NlZCB0ZXh0dXJlcyxcbiAgICAvLyBzbyB3ZSBvbmx5IHRlc3QgZm9yIGxldmVsIHplcm8uXG5cbiAgICBpZiAobWlwbWFwLmNvbXByZXNzZWQgJiZcbiAgICAgICAgKG1pcG1hcC5pbnRlcm5hbGZvcm1hdCA9PT0gR0xfQ09NUFJFU1NFRF9SR0JfUzNUQ19EWFQxX0VYVCkgfHxcbiAgICAgICAgKG1pcG1hcC5pbnRlcm5hbGZvcm1hdCA9PT0gR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUMV9FWFQpIHx8XG4gICAgICAgIChtaXBtYXAuaW50ZXJuYWxmb3JtYXQgPT09IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDNfRVhUKSB8fFxuICAgICAgICAobWlwbWFwLmludGVybmFsZm9ybWF0ID09PSBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQ1X0VYVCkpIHtcbiAgICAgIFxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHNldE1pcE1hcCAobWlwbWFwLCB0YXJnZXQpIHtcbiAgICB2YXIgaW1hZ2VzID0gbWlwbWFwLmltYWdlc1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgaW1hZ2VzLmxlbmd0aDsgKytpKSB7XG4gICAgICBpZiAoIWltYWdlc1tpXSkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIHNldEltYWdlKGltYWdlc1tpXSwgdGFyZ2V0LCBpKVxuICAgIH1cbiAgfVxuXG4gIHZhciBtaXBQb29sID0gW11cblxuICBmdW5jdGlvbiBhbGxvY01pcE1hcCAoKSB7XG4gICAgdmFyIHJlc3VsdCA9IG1pcFBvb2wucG9wKCkgfHwgbmV3IE1pcE1hcCgpXG4gICAgVGV4RmxhZ3MuY2FsbChyZXN1bHQpXG4gICAgcmVzdWx0Lm1pcG1hc2sgPSAwXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCAxNjsgKytpKSB7XG4gICAgICByZXN1bHQuaW1hZ2VzW2ldID0gbnVsbFxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0XG4gIH1cblxuICBmdW5jdGlvbiBmcmVlTWlwTWFwIChtaXBtYXApIHtcbiAgICB2YXIgaW1hZ2VzID0gbWlwbWFwLmltYWdlc1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgaW1hZ2VzLmxlbmd0aDsgKytpKSB7XG4gICAgICBpZiAoaW1hZ2VzW2ldKSB7XG4gICAgICAgIGZyZWVJbWFnZShpbWFnZXNbaV0pXG4gICAgICB9XG4gICAgICBpbWFnZXNbaV0gPSBudWxsXG4gICAgfVxuICAgIG1pcFBvb2wucHVzaChtaXBtYXApXG4gIH1cblxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIFRleCBpbmZvXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgZnVuY3Rpb24gVGV4SW5mbyAoKSB7XG4gICAgdGhpcy5taW5GaWx0ZXIgPSBHTF9ORUFSRVNUXG4gICAgdGhpcy5tYWdGaWx0ZXIgPSBHTF9ORUFSRVNUXG5cbiAgICB0aGlzLndyYXBTID0gR0xfQ0xBTVBfVE9fRURHRVxuICAgIHRoaXMud3JhcFQgPSBHTF9DTEFNUF9UT19FREdFXG5cbiAgICB0aGlzLmFuaXNvdHJvcGljID0gMVxuXG4gICAgdGhpcy5nZW5NaXBtYXBzID0gZmFsc2VcbiAgICB0aGlzLm1pcG1hcEhpbnQgPSBHTF9ET05UX0NBUkVcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlVGV4SW5mbyAoaW5mbywgb3B0aW9ucykge1xuICAgIGlmICgnbWluJyBpbiBvcHRpb25zKSB7XG4gICAgICB2YXIgbWluRmlsdGVyID0gb3B0aW9ucy5taW5cbiAgICAgIFxuICAgICAgaW5mby5taW5GaWx0ZXIgPSBtaW5GaWx0ZXJzW21pbkZpbHRlcl1cbiAgICAgIGlmIChNSVBNQVBfRklMVEVSUy5pbmRleE9mKGluZm8ubWluRmlsdGVyKSA+PSAwKSB7XG4gICAgICAgIGluZm8uZ2VuTWlwbWFwcyA9IHRydWVcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoJ21hZycgaW4gb3B0aW9ucykge1xuICAgICAgdmFyIG1hZ0ZpbHRlciA9IG9wdGlvbnMubWFnXG4gICAgICBcbiAgICAgIGluZm8ubWFnRmlsdGVyID0gbWFnRmlsdGVyc1ttYWdGaWx0ZXJdXG4gICAgfVxuXG4gICAgdmFyIHdyYXBTID0gaW5mby53cmFwU1xuICAgIHZhciB3cmFwVCA9IGluZm8ud3JhcFRcbiAgICBpZiAoJ3dyYXAnIGluIG9wdGlvbnMpIHtcbiAgICAgIHZhciB3cmFwID0gb3B0aW9ucy53cmFwXG4gICAgICBpZiAodHlwZW9mIHdyYXAgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIFxuICAgICAgICB3cmFwUyA9IHdyYXBUID0gd3JhcE1vZGVzW3dyYXBdXG4gICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkod3JhcCkpIHtcbiAgICAgICAgXG4gICAgICAgIFxuICAgICAgICB3cmFwUyA9IHdyYXBNb2Rlc1t3cmFwWzBdXVxuICAgICAgICB3cmFwVCA9IHdyYXBNb2Rlc1t3cmFwWzFdXVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoJ3dyYXBTJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBvcHRXcmFwUyA9IG9wdGlvbnMud3JhcFNcbiAgICAgICAgXG4gICAgICAgIHdyYXBTID0gd3JhcE1vZGVzW29wdFdyYXBTXVxuICAgICAgfVxuICAgICAgaWYgKCd3cmFwVCcgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgb3B0V3JhcFQgPSBvcHRpb25zLndyYXBUXG4gICAgICAgIFxuICAgICAgICB3cmFwVCA9IHdyYXBNb2Rlc1tvcHRXcmFwVF1cbiAgICAgIH1cbiAgICB9XG4gICAgaW5mby53cmFwUyA9IHdyYXBTXG4gICAgaW5mby53cmFwVCA9IHdyYXBUXG5cbiAgICBpZiAoJ2FuaXNvdHJvcGljJyBpbiBvcHRpb25zKSB7XG4gICAgICB2YXIgYW5pc290cm9waWMgPSBvcHRpb25zLmFuaXNvdHJvcGljXG4gICAgICBcbiAgICAgIGluZm8uYW5pc290cm9waWMgPSBvcHRpb25zLmFuaXNvdHJvcGljXG4gICAgfVxuXG4gICAgaWYgKCdtaXBtYXAnIGluIG9wdGlvbnMpIHtcbiAgICAgIHZhciBoYXNNaXBNYXAgPSBmYWxzZVxuICAgICAgc3dpdGNoICh0eXBlb2Ygb3B0aW9ucy5taXBtYXApIHtcbiAgICAgICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgICAgICBcbiAgICAgICAgICBpbmZvLm1pcG1hcEhpbnQgPSBtaXBtYXBIaW50W29wdGlvbnMubWlwbWFwXVxuICAgICAgICAgIGluZm8uZ2VuTWlwbWFwcyA9IHRydWVcbiAgICAgICAgICBoYXNNaXBNYXAgPSB0cnVlXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdib29sZWFuJzpcbiAgICAgICAgICBoYXNNaXBNYXAgPSBpbmZvLmdlbk1pcG1hcHMgPSBvcHRpb25zLm1pcG1hcFxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgICAgICBcbiAgICAgICAgICBpbmZvLmdlbk1pcG1hcHMgPSBmYWxzZVxuICAgICAgICAgIGhhc01pcE1hcCA9IHRydWVcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgXG4gICAgICB9XG4gICAgICBpZiAoaGFzTWlwTWFwICYmICEoJ21pbicgaW4gb3B0aW9ucykpIHtcbiAgICAgICAgaW5mby5taW5GaWx0ZXIgPSBHTF9ORUFSRVNUX01JUE1BUF9ORUFSRVNUXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc2V0VGV4SW5mbyAoaW5mbywgdGFyZ2V0KSB7XG4gICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfTUlOX0ZJTFRFUiwgaW5mby5taW5GaWx0ZXIpXG4gICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfTUFHX0ZJTFRFUiwgaW5mby5tYWdGaWx0ZXIpXG4gICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfV1JBUF9TLCBpbmZvLndyYXBTKVxuICAgIGdsLnRleFBhcmFtZXRlcmkodGFyZ2V0LCBHTF9URVhUVVJFX1dSQVBfVCwgaW5mby53cmFwVClcbiAgICBpZiAoZXh0ZW5zaW9ucy5leHRfdGV4dHVyZV9maWx0ZXJfYW5pc290cm9waWMpIHtcbiAgICAgIGdsLnRleFBhcmFtZXRlcmkodGFyZ2V0LCBHTF9URVhUVVJFX01BWF9BTklTT1RST1BZX0VYVCwgaW5mby5hbmlzb3Ryb3BpYylcbiAgICB9XG4gICAgaWYgKGluZm8uZ2VuTWlwbWFwcykge1xuICAgICAgZ2wuaGludChHTF9HRU5FUkFURV9NSVBNQVBfSElOVCwgaW5mby5taXBtYXBIaW50KVxuICAgICAgZ2wuZ2VuZXJhdGVNaXBtYXAodGFyZ2V0KVxuICAgIH1cbiAgfVxuXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gRnVsbCB0ZXh0dXJlIG9iamVjdFxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIHZhciB0ZXh0dXJlQ291bnQgPSAwXG4gIHZhciB0ZXh0dXJlU2V0ID0ge31cbiAgdmFyIG51bVRleFVuaXRzID0gbGltaXRzLm1heFRleHR1cmVVbml0c1xuICB2YXIgdGV4dHVyZVVuaXRzID0gQXJyYXkobnVtVGV4VW5pdHMpLm1hcChmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIG51bGxcbiAgfSlcblxuICBmdW5jdGlvbiBSRUdMVGV4dHVyZSAodGFyZ2V0KSB7XG4gICAgVGV4RmxhZ3MuY2FsbCh0aGlzKVxuICAgIHRoaXMubWlwbWFzayA9IDBcbiAgICB0aGlzLmludGVybmFsZm9ybWF0ID0gR0xfUkdCQVxuXG4gICAgdGhpcy5pZCA9IHRleHR1cmVDb3VudCsrXG5cbiAgICB0aGlzLnJlZkNvdW50ID0gMVxuXG4gICAgdGhpcy50YXJnZXQgPSB0YXJnZXRcbiAgICB0aGlzLnRleHR1cmUgPSBnbC5jcmVhdGVUZXh0dXJlKClcblxuICAgIHRoaXMudW5pdCA9IC0xXG4gICAgdGhpcy5iaW5kQ291bnQgPSAwXG5cbiAgICB0aGlzLnRleEluZm8gPSBuZXcgVGV4SW5mbygpXG5cbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgIHRoaXMuc3RhdHMgPSB7c2l6ZTogMH1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiB0ZW1wQmluZCAodGV4dHVyZSkge1xuICAgIGdsLmFjdGl2ZVRleHR1cmUoR0xfVEVYVFVSRTApXG4gICAgZ2wuYmluZFRleHR1cmUodGV4dHVyZS50YXJnZXQsIHRleHR1cmUudGV4dHVyZSlcbiAgfVxuXG4gIGZ1bmN0aW9uIHRlbXBSZXN0b3JlICgpIHtcbiAgICB2YXIgcHJldiA9IHRleHR1cmVVbml0c1swXVxuICAgIGlmIChwcmV2KSB7XG4gICAgICBnbC5iaW5kVGV4dHVyZShwcmV2LnRhcmdldCwgcHJldi50ZXh0dXJlKVxuICAgIH0gZWxzZSB7XG4gICAgICBnbC5iaW5kVGV4dHVyZShHTF9URVhUVVJFXzJELCBudWxsKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3kgKHRleHR1cmUpIHtcbiAgICB2YXIgaGFuZGxlID0gdGV4dHVyZS50ZXh0dXJlXG4gICAgXG4gICAgdmFyIHVuaXQgPSB0ZXh0dXJlLnVuaXRcbiAgICB2YXIgdGFyZ2V0ID0gdGV4dHVyZS50YXJnZXRcbiAgICBpZiAodW5pdCA+PSAwKSB7XG4gICAgICBnbC5hY3RpdmVUZXh0dXJlKEdMX1RFWFRVUkUwICsgdW5pdClcbiAgICAgIGdsLmJpbmRUZXh0dXJlKHRhcmdldCwgbnVsbClcbiAgICAgIHRleHR1cmVVbml0c1t1bml0XSA9IG51bGxcbiAgICB9XG4gICAgZ2wuZGVsZXRlVGV4dHVyZShoYW5kbGUpXG4gICAgdGV4dHVyZS50ZXh0dXJlID0gbnVsbFxuICAgIHRleHR1cmUucGFyYW1zID0gbnVsbFxuICAgIHRleHR1cmUucGl4ZWxzID0gbnVsbFxuICAgIHRleHR1cmUucmVmQ291bnQgPSAwXG4gICAgZGVsZXRlIHRleHR1cmVTZXRbdGV4dHVyZS5pZF1cbiAgICBzdGF0cy50ZXh0dXJlQ291bnQtLVxuICB9XG5cbiAgZXh0ZW5kKFJFR0xUZXh0dXJlLnByb3RvdHlwZSwge1xuICAgIGJpbmQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciB0ZXh0dXJlID0gdGhpc1xuICAgICAgdGV4dHVyZS5iaW5kQ291bnQgKz0gMVxuICAgICAgdmFyIHVuaXQgPSB0ZXh0dXJlLnVuaXRcbiAgICAgIGlmICh1bml0IDwgMCkge1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG51bVRleFVuaXRzOyArK2kpIHtcbiAgICAgICAgICB2YXIgb3RoZXIgPSB0ZXh0dXJlVW5pdHNbaV1cbiAgICAgICAgICBpZiAob3RoZXIpIHtcbiAgICAgICAgICAgIGlmIChvdGhlci5iaW5kQ291bnQgPiAwKSB7XG4gICAgICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBvdGhlci51bml0ID0gLTFcbiAgICAgICAgICB9XG4gICAgICAgICAgdGV4dHVyZVVuaXRzW2ldID0gdGV4dHVyZVxuICAgICAgICAgIHVuaXQgPSBpXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgfVxuICAgICAgICBpZiAodW5pdCA+PSBudW1UZXhVbml0cykge1xuICAgICAgICAgIFxuICAgICAgICB9XG4gICAgICAgIGlmIChjb25maWcucHJvZmlsZSAmJiBzdGF0cy5tYXhUZXh0dXJlVW5pdHMgPCAodW5pdCArIDEpKSB7XG4gICAgICAgICAgc3RhdHMubWF4VGV4dHVyZVVuaXRzID0gdW5pdCArIDEgLy8gKzEsIHNpbmNlIHRoZSB1bml0cyBhcmUgemVyby1iYXNlZFxuICAgICAgICB9XG4gICAgICAgIHRleHR1cmUudW5pdCA9IHVuaXRcbiAgICAgICAgZ2wuYWN0aXZlVGV4dHVyZShHTF9URVhUVVJFMCArIHVuaXQpXG4gICAgICAgIGdsLmJpbmRUZXh0dXJlKHRleHR1cmUudGFyZ2V0LCB0ZXh0dXJlLnRleHR1cmUpXG4gICAgICB9XG4gICAgICByZXR1cm4gdW5pdFxuICAgIH0sXG5cbiAgICB1bmJpbmQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHRoaXMuYmluZENvdW50IC09IDFcbiAgICB9LFxuXG4gICAgZGVjUmVmOiBmdW5jdGlvbiAoKSB7XG4gICAgICBpZiAoLS10aGlzLnJlZkNvdW50IDw9IDApIHtcbiAgICAgICAgZGVzdHJveSh0aGlzKVxuICAgICAgfVxuICAgIH1cbiAgfSlcblxuICBmdW5jdGlvbiBjcmVhdGVUZXh0dXJlMkQgKGEsIGIpIHtcbiAgICB2YXIgdGV4dHVyZSA9IG5ldyBSRUdMVGV4dHVyZShHTF9URVhUVVJFXzJEKVxuICAgIHRleHR1cmVTZXRbdGV4dHVyZS5pZF0gPSB0ZXh0dXJlXG4gICAgc3RhdHMudGV4dHVyZUNvdW50KytcblxuICAgIGZ1bmN0aW9uIHJlZ2xUZXh0dXJlMkQgKGEsIGIpIHtcbiAgICAgIHZhciB0ZXhJbmZvID0gdGV4dHVyZS50ZXhJbmZvXG4gICAgICBUZXhJbmZvLmNhbGwodGV4SW5mbylcbiAgICAgIHZhciBtaXBEYXRhID0gYWxsb2NNaXBNYXAoKVxuXG4gICAgICBpZiAodHlwZW9mIGEgPT09ICdudW1iZXInKSB7XG4gICAgICAgIGlmICh0eXBlb2YgYiA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICBwYXJzZU1pcE1hcEZyb21TaGFwZShtaXBEYXRhLCBhIHwgMCwgYiB8IDApXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcGFyc2VNaXBNYXBGcm9tU2hhcGUobWlwRGF0YSwgYSB8IDAsIGEgfCAwKVxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGEpIHtcbiAgICAgICAgXG4gICAgICAgIHBhcnNlVGV4SW5mbyh0ZXhJbmZvLCBhKVxuICAgICAgICBwYXJzZU1pcE1hcEZyb21PYmplY3QobWlwRGF0YSwgYSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIGVtcHR5IHRleHR1cmVzIGdldCBhc3NpZ25lZCBhIGRlZmF1bHQgc2hhcGUgb2YgMXgxXG4gICAgICAgIHBhcnNlTWlwTWFwRnJvbVNoYXBlKG1pcERhdGEsIDEsIDEpXG4gICAgICB9XG5cbiAgICAgIGlmICh0ZXhJbmZvLmdlbk1pcG1hcHMpIHtcbiAgICAgICAgbWlwRGF0YS5taXBtYXNrID0gKG1pcERhdGEud2lkdGggPDwgMSkgLSAxXG4gICAgICB9XG4gICAgICB0ZXh0dXJlLm1pcG1hc2sgPSBtaXBEYXRhLm1pcG1hc2tcblxuICAgICAgY29weUZsYWdzKHRleHR1cmUsIG1pcERhdGEpXG5cbiAgICAgIFxuICAgICAgdGV4dHVyZS5pbnRlcm5hbGZvcm1hdCA9IG1pcERhdGEuaW50ZXJuYWxmb3JtYXRcblxuICAgICAgcmVnbFRleHR1cmUyRC53aWR0aCA9IG1pcERhdGEud2lkdGhcbiAgICAgIHJlZ2xUZXh0dXJlMkQuaGVpZ2h0ID0gbWlwRGF0YS5oZWlnaHRcblxuICAgICAgdGVtcEJpbmQodGV4dHVyZSlcbiAgICAgIHNldE1pcE1hcChtaXBEYXRhLCBHTF9URVhUVVJFXzJEKVxuICAgICAgc2V0VGV4SW5mbyh0ZXhJbmZvLCBHTF9URVhUVVJFXzJEKVxuICAgICAgdGVtcFJlc3RvcmUoKVxuXG4gICAgICBmcmVlTWlwTWFwKG1pcERhdGEpXG5cbiAgICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgICB0ZXh0dXJlLnN0YXRzLnNpemUgPSBnZXRUZXh0dXJlU2l6ZShcbiAgICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0LFxuICAgICAgICAgIHRleHR1cmUudHlwZSxcbiAgICAgICAgICBtaXBEYXRhLndpZHRoLFxuICAgICAgICAgIG1pcERhdGEuaGVpZ2h0LFxuICAgICAgICAgIHRleEluZm8uZ2VuTWlwbWFwcyxcbiAgICAgICAgICBmYWxzZSlcbiAgICAgIH1cbiAgICAgIHJlZ2xUZXh0dXJlMkQuZm9ybWF0ID0gdGV4dHVyZUZvcm1hdHNJbnZlcnRbdGV4dHVyZS5pbnRlcm5hbGZvcm1hdF1cbiAgICAgIHJlZ2xUZXh0dXJlMkQudHlwZSA9IHRleHR1cmVUeXBlc0ludmVydFt0ZXh0dXJlLnR5cGVdXG5cbiAgICAgIHJlZ2xUZXh0dXJlMkQubWFnID0gbWFnRmlsdGVyc0ludmVydFt0ZXhJbmZvLm1hZ0ZpbHRlcl1cbiAgICAgIHJlZ2xUZXh0dXJlMkQubWluID0gbWluRmlsdGVyc0ludmVydFt0ZXhJbmZvLm1pbkZpbHRlcl1cblxuICAgICAgcmVnbFRleHR1cmUyRC53cmFwUyA9IHdyYXBNb2Rlc0ludmVydFt0ZXhJbmZvLndyYXBTXVxuICAgICAgcmVnbFRleHR1cmUyRC53cmFwVCA9IHdyYXBNb2Rlc0ludmVydFt0ZXhJbmZvLndyYXBUXVxuXG4gICAgICByZXR1cm4gcmVnbFRleHR1cmUyRFxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHN1YmltYWdlIChpbWFnZSwgeF8sIHlfLCBsZXZlbF8pIHtcbiAgICAgIFxuXG4gICAgICB2YXIgeCA9IHhfIHwgMFxuICAgICAgdmFyIHkgPSB5XyB8IDBcbiAgICAgIHZhciBsZXZlbCA9IGxldmVsXyB8IDBcblxuICAgICAgdmFyIGltYWdlRGF0YSA9IGFsbG9jSW1hZ2UoKVxuICAgICAgY29weUZsYWdzKGltYWdlRGF0YSwgdGV4dHVyZSlcbiAgICAgIGltYWdlRGF0YS53aWR0aCA9IDBcbiAgICAgIGltYWdlRGF0YS5oZWlnaHQgPSAwXG4gICAgICBwYXJzZUltYWdlKGltYWdlRGF0YSwgaW1hZ2UpXG4gICAgICBpbWFnZURhdGEud2lkdGggPSBpbWFnZURhdGEud2lkdGggfHwgKCh0ZXh0dXJlLndpZHRoID4+IGxldmVsKSAtIHgpXG4gICAgICBpbWFnZURhdGEuaGVpZ2h0ID0gaW1hZ2VEYXRhLmhlaWdodCB8fCAoKHRleHR1cmUuaGVpZ2h0ID4+IGxldmVsKSAtIHkpXG5cbiAgICAgIFxuICAgICAgXG4gICAgICBcbiAgICAgIFxuXG4gICAgICB0ZW1wQmluZCh0ZXh0dXJlKVxuICAgICAgc2V0U3ViSW1hZ2UoaW1hZ2VEYXRhLCBHTF9URVhUVVJFXzJELCB4LCB5LCBsZXZlbClcbiAgICAgIHRlbXBSZXN0b3JlKClcblxuICAgICAgZnJlZUltYWdlKGltYWdlRGF0YSlcblxuICAgICAgcmV0dXJuIHJlZ2xUZXh0dXJlMkRcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZXNpemUgKHdfLCBoXykge1xuICAgICAgdmFyIHcgPSB3XyB8IDBcbiAgICAgIHZhciBoID0gKGhfIHwgMCkgfHwgd1xuICAgICAgaWYgKHcgPT09IHRleHR1cmUud2lkdGggJiYgaCA9PT0gdGV4dHVyZS5oZWlnaHQpIHtcbiAgICAgICAgcmV0dXJuIHJlZ2xUZXh0dXJlMkRcbiAgICAgIH1cblxuICAgICAgcmVnbFRleHR1cmUyRC53aWR0aCA9IHRleHR1cmUud2lkdGggPSB3XG4gICAgICByZWdsVGV4dHVyZTJELmhlaWdodCA9IHRleHR1cmUuaGVpZ2h0ID0gaFxuXG4gICAgICB0ZW1wQmluZCh0ZXh0dXJlKVxuICAgICAgZm9yICh2YXIgaSA9IDA7IHRleHR1cmUubWlwbWFzayA+PiBpOyArK2kpIHtcbiAgICAgICAgZ2wudGV4SW1hZ2UyRChcbiAgICAgICAgICBHTF9URVhUVVJFXzJELFxuICAgICAgICAgIGksXG4gICAgICAgICAgdGV4dHVyZS5mb3JtYXQsXG4gICAgICAgICAgdyA+PiBpLFxuICAgICAgICAgIGggPj4gaSxcbiAgICAgICAgICAwLFxuICAgICAgICAgIHRleHR1cmUuZm9ybWF0LFxuICAgICAgICAgIHRleHR1cmUudHlwZSxcbiAgICAgICAgICBudWxsKVxuICAgICAgfVxuICAgICAgdGVtcFJlc3RvcmUoKVxuXG4gICAgICAvLyBhbHNvLCByZWNvbXB1dGUgdGhlIHRleHR1cmUgc2l6ZS5cbiAgICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgICB0ZXh0dXJlLnN0YXRzLnNpemUgPSBnZXRUZXh0dXJlU2l6ZShcbiAgICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0LFxuICAgICAgICAgIHRleHR1cmUudHlwZSxcbiAgICAgICAgICB3LFxuICAgICAgICAgIGgsXG4gICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgZmFsc2UpXG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZWdsVGV4dHVyZTJEXG4gICAgfVxuXG4gICAgcmVnbFRleHR1cmUyRChhLCBiKVxuXG4gICAgcmVnbFRleHR1cmUyRC5zdWJpbWFnZSA9IHN1YmltYWdlXG4gICAgcmVnbFRleHR1cmUyRC5yZXNpemUgPSByZXNpemVcbiAgICByZWdsVGV4dHVyZTJELl9yZWdsVHlwZSA9ICd0ZXh0dXJlMmQnXG4gICAgcmVnbFRleHR1cmUyRC5fdGV4dHVyZSA9IHRleHR1cmVcbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgIHJlZ2xUZXh0dXJlMkQuc3RhdHMgPSB0ZXh0dXJlLnN0YXRzXG4gICAgfVxuICAgIHJlZ2xUZXh0dXJlMkQuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHRleHR1cmUuZGVjUmVmKClcbiAgICB9XG5cbiAgICByZXR1cm4gcmVnbFRleHR1cmUyRFxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlVGV4dHVyZUN1YmUgKGEwLCBhMSwgYTIsIGEzLCBhNCwgYTUpIHtcbiAgICB2YXIgdGV4dHVyZSA9IG5ldyBSRUdMVGV4dHVyZShHTF9URVhUVVJFX0NVQkVfTUFQKVxuICAgIHRleHR1cmVTZXRbdGV4dHVyZS5pZF0gPSB0ZXh0dXJlXG4gICAgc3RhdHMuY3ViZUNvdW50KytcblxuICAgIHZhciBmYWNlcyA9IG5ldyBBcnJheSg2KVxuXG4gICAgZnVuY3Rpb24gcmVnbFRleHR1cmVDdWJlIChhMCwgYTEsIGEyLCBhMywgYTQsIGE1KSB7XG4gICAgICB2YXIgaVxuICAgICAgdmFyIHRleEluZm8gPSB0ZXh0dXJlLnRleEluZm9cbiAgICAgIFRleEluZm8uY2FsbCh0ZXhJbmZvKVxuICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICBmYWNlc1tpXSA9IGFsbG9jTWlwTWFwKClcbiAgICAgIH1cblxuICAgICAgaWYgKHR5cGVvZiBhMCA9PT0gJ251bWJlcicgfHwgIWEwKSB7XG4gICAgICAgIHZhciBzID0gKGEwIHwgMCkgfHwgMVxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgICAgcGFyc2VNaXBNYXBGcm9tU2hhcGUoZmFjZXNbaV0sIHMsIHMpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGEwID09PSAnb2JqZWN0Jykge1xuICAgICAgICBpZiAoYTEpIHtcbiAgICAgICAgICBwYXJzZU1pcE1hcEZyb21PYmplY3QoZmFjZXNbMF0sIGEwKVxuICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbU9iamVjdChmYWNlc1sxXSwgYTEpXG4gICAgICAgICAgcGFyc2VNaXBNYXBGcm9tT2JqZWN0KGZhY2VzWzJdLCBhMilcbiAgICAgICAgICBwYXJzZU1pcE1hcEZyb21PYmplY3QoZmFjZXNbM10sIGEzKVxuICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbU9iamVjdChmYWNlc1s0XSwgYTQpXG4gICAgICAgICAgcGFyc2VNaXBNYXBGcm9tT2JqZWN0KGZhY2VzWzVdLCBhNSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwYXJzZVRleEluZm8odGV4SW5mbywgYTApXG4gICAgICAgICAgcGFyc2VGbGFncyh0ZXh0dXJlLCBhMClcbiAgICAgICAgICBpZiAoJ2ZhY2VzJyBpbiBhMCkge1xuICAgICAgICAgICAgdmFyIGZhY2VfaW5wdXQgPSBhMC5mYWNlc1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBjb3B5RmxhZ3MoZmFjZXNbaV0sIHRleHR1cmUpXG4gICAgICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbU9iamVjdChmYWNlc1tpXSwgZmFjZV9pbnB1dFtpXSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICAgICAgICBwYXJzZU1pcE1hcEZyb21PYmplY3QoZmFjZXNbaV0sIGEwKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgXG4gICAgICB9XG5cbiAgICAgIGNvcHlGbGFncyh0ZXh0dXJlLCBmYWNlc1swXSlcbiAgICAgIGlmICh0ZXhJbmZvLmdlbk1pcG1hcHMpIHtcbiAgICAgICAgdGV4dHVyZS5taXBtYXNrID0gKGZhY2VzWzBdLndpZHRoIDw8IDEpIC0gMVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGV4dHVyZS5taXBtYXNrID0gZmFjZXNbMF0ubWlwbWFza1xuICAgICAgfVxuXG4gICAgICBcbiAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQgPSBmYWNlc1swXS5pbnRlcm5hbGZvcm1hdFxuXG4gICAgICByZWdsVGV4dHVyZUN1YmUud2lkdGggPSBmYWNlc1swXS53aWR0aFxuICAgICAgcmVnbFRleHR1cmVDdWJlLmhlaWdodCA9IGZhY2VzWzBdLmhlaWdodFxuXG4gICAgICB0ZW1wQmluZCh0ZXh0dXJlKVxuICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICBzZXRNaXBNYXAoZmFjZXNbaV0sIEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCArIGkpXG4gICAgICB9XG4gICAgICBzZXRUZXhJbmZvKHRleEluZm8sIEdMX1RFWFRVUkVfQ1VCRV9NQVApXG4gICAgICB0ZW1wUmVzdG9yZSgpXG5cbiAgICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgICB0ZXh0dXJlLnN0YXRzLnNpemUgPSBnZXRUZXh0dXJlU2l6ZShcbiAgICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0LFxuICAgICAgICAgIHRleHR1cmUudHlwZSxcbiAgICAgICAgICByZWdsVGV4dHVyZUN1YmUud2lkdGgsXG4gICAgICAgICAgcmVnbFRleHR1cmVDdWJlLmhlaWdodCxcbiAgICAgICAgICB0ZXhJbmZvLmdlbk1pcG1hcHMsXG4gICAgICAgICAgdHJ1ZSlcbiAgICAgIH1cblxuICAgICAgcmVnbFRleHR1cmVDdWJlLmZvcm1hdCA9IHRleHR1cmVGb3JtYXRzSW52ZXJ0W3RleHR1cmUuaW50ZXJuYWxmb3JtYXRdXG4gICAgICByZWdsVGV4dHVyZUN1YmUudHlwZSA9IHRleHR1cmVUeXBlc0ludmVydFt0ZXh0dXJlLnR5cGVdXG5cbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS5tYWcgPSBtYWdGaWx0ZXJzSW52ZXJ0W3RleEluZm8ubWFnRmlsdGVyXVxuICAgICAgcmVnbFRleHR1cmVDdWJlLm1pbiA9IG1pbkZpbHRlcnNJbnZlcnRbdGV4SW5mby5taW5GaWx0ZXJdXG5cbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS53cmFwUyA9IHdyYXBNb2Rlc0ludmVydFt0ZXhJbmZvLndyYXBTXVxuICAgICAgcmVnbFRleHR1cmVDdWJlLndyYXBUID0gd3JhcE1vZGVzSW52ZXJ0W3RleEluZm8ud3JhcFRdXG5cbiAgICAgIGZvciAoaSA9IDA7IGkgPCA2OyArK2kpIHtcbiAgICAgICAgZnJlZU1pcE1hcChmYWNlc1tpXSlcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJlZ2xUZXh0dXJlQ3ViZVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHN1YmltYWdlIChmYWNlLCBpbWFnZSwgeF8sIHlfLCBsZXZlbF8pIHtcbiAgICAgIFxuICAgICAgXG5cbiAgICAgIHZhciB4ID0geF8gfCAwXG4gICAgICB2YXIgeSA9IHlfIHwgMFxuICAgICAgdmFyIGxldmVsID0gbGV2ZWxfIHwgMFxuXG4gICAgICB2YXIgaW1hZ2VEYXRhID0gYWxsb2NJbWFnZSgpXG4gICAgICBjb3B5RmxhZ3MoaW1hZ2VEYXRhLCB0ZXh0dXJlKVxuICAgICAgaW1hZ2VEYXRhLndpZHRoID0gMFxuICAgICAgaW1hZ2VEYXRhLmhlaWdodCA9IDBcbiAgICAgIHBhcnNlSW1hZ2UoaW1hZ2VEYXRhLCBpbWFnZSlcbiAgICAgIGltYWdlRGF0YS53aWR0aCA9IGltYWdlRGF0YS53aWR0aCB8fCAoKHRleHR1cmUud2lkdGggPj4gbGV2ZWwpIC0geClcbiAgICAgIGltYWdlRGF0YS5oZWlnaHQgPSBpbWFnZURhdGEuaGVpZ2h0IHx8ICgodGV4dHVyZS5oZWlnaHQgPj4gbGV2ZWwpIC0geSlcblxuICAgICAgXG4gICAgICBcbiAgICAgIFxuICAgICAgXG5cbiAgICAgIHRlbXBCaW5kKHRleHR1cmUpXG4gICAgICBzZXRTdWJJbWFnZShpbWFnZURhdGEsIEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCArIGZhY2UsIHgsIHksIGxldmVsKVxuICAgICAgdGVtcFJlc3RvcmUoKVxuXG4gICAgICBmcmVlSW1hZ2UoaW1hZ2VEYXRhKVxuXG4gICAgICByZXR1cm4gcmVnbFRleHR1cmVDdWJlXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVzaXplIChyYWRpdXNfKSB7XG4gICAgICB2YXIgcmFkaXVzID0gcmFkaXVzXyB8IDBcbiAgICAgIGlmIChyYWRpdXMgPT09IHRleHR1cmUud2lkdGgpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG5cbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS53aWR0aCA9IHRleHR1cmUud2lkdGggPSByYWRpdXNcbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS5oZWlnaHQgPSB0ZXh0dXJlLmhlaWdodCA9IHJhZGl1c1xuXG4gICAgICB0ZW1wQmluZCh0ZXh0dXJlKVxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCA2OyArK2kpIHtcbiAgICAgICAgZm9yICh2YXIgaiA9IDA7IHRleHR1cmUubWlwbWFzayA+PiBqOyArK2opIHtcbiAgICAgICAgICBnbC50ZXhJbWFnZTJEKFxuICAgICAgICAgICAgR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YICsgaSxcbiAgICAgICAgICAgIGosXG4gICAgICAgICAgICB0ZXh0dXJlLmZvcm1hdCxcbiAgICAgICAgICAgIHJhZGl1cyA+PiBqLFxuICAgICAgICAgICAgcmFkaXVzID4+IGosXG4gICAgICAgICAgICAwLFxuICAgICAgICAgICAgdGV4dHVyZS5mb3JtYXQsXG4gICAgICAgICAgICB0ZXh0dXJlLnR5cGUsXG4gICAgICAgICAgICBudWxsKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICB0ZW1wUmVzdG9yZSgpXG5cbiAgICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgICB0ZXh0dXJlLnN0YXRzLnNpemUgPSBnZXRUZXh0dXJlU2l6ZShcbiAgICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0LFxuICAgICAgICAgIHRleHR1cmUudHlwZSxcbiAgICAgICAgICByZWdsVGV4dHVyZUN1YmUud2lkdGgsXG4gICAgICAgICAgcmVnbFRleHR1cmVDdWJlLmhlaWdodCxcbiAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICB0cnVlKVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmVnbFRleHR1cmVDdWJlXG4gICAgfVxuXG4gICAgcmVnbFRleHR1cmVDdWJlKGEwLCBhMSwgYTIsIGEzLCBhNCwgYTUpXG5cbiAgICByZWdsVGV4dHVyZUN1YmUuc3ViaW1hZ2UgPSBzdWJpbWFnZVxuICAgIHJlZ2xUZXh0dXJlQ3ViZS5yZXNpemUgPSByZXNpemVcbiAgICByZWdsVGV4dHVyZUN1YmUuX3JlZ2xUeXBlID0gJ3RleHR1cmVDdWJlJ1xuICAgIHJlZ2xUZXh0dXJlQ3ViZS5fdGV4dHVyZSA9IHRleHR1cmVcbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS5zdGF0cyA9IHRleHR1cmUuc3RhdHNcbiAgICB9XG4gICAgcmVnbFRleHR1cmVDdWJlLmRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB0ZXh0dXJlLmRlY1JlZigpXG4gICAgfVxuXG4gICAgcmV0dXJuIHJlZ2xUZXh0dXJlQ3ViZVxuICB9XG5cbiAgLy8gQ2FsbGVkIHdoZW4gcmVnbCBpcyBkZXN0cm95ZWRcbiAgZnVuY3Rpb24gZGVzdHJveVRleHR1cmVzICgpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG51bVRleFVuaXRzOyArK2kpIHtcbiAgICAgIGdsLmFjdGl2ZVRleHR1cmUoR0xfVEVYVFVSRTAgKyBpKVxuICAgICAgZ2wuYmluZFRleHR1cmUoR0xfVEVYVFVSRV8yRCwgbnVsbClcbiAgICAgIHRleHR1cmVVbml0c1tpXSA9IG51bGxcbiAgICB9XG4gICAgdmFsdWVzKHRleHR1cmVTZXQpLmZvckVhY2goZGVzdHJveSlcblxuICAgIHN0YXRzLmN1YmVDb3VudCA9IDBcbiAgICBzdGF0cy50ZXh0dXJlQ291bnQgPSAwXG4gIH1cblxuICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICBzdGF0cy5nZXRUb3RhbFRleHR1cmVTaXplID0gZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIHRvdGFsID0gMFxuICAgICAgT2JqZWN0LmtleXModGV4dHVyZVNldCkuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgIHRvdGFsICs9IHRleHR1cmVTZXRba2V5XS5zdGF0cy5zaXplXG4gICAgICB9KVxuICAgICAgcmV0dXJuIHRvdGFsXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcmVzdG9yZVRleHR1cmVzICgpIHtcbiAgICB2YWx1ZXModGV4dHVyZVNldCkuZm9yRWFjaChmdW5jdGlvbiAodGV4dHVyZSkge1xuICAgICAgdGV4dHVyZS50ZXh0dXJlID0gZ2wuY3JlYXRlVGV4dHVyZSgpXG4gICAgICBnbC5iaW5kVGV4dHVyZSh0ZXh0dXJlLnRhcmdldCwgdGV4dHVyZS50ZXh0dXJlKVxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCAzMjsgKytpKSB7XG4gICAgICAgIGlmICgodGV4dHVyZS5taXBtYXNrICYgKDEgPDwgaSkpID09PSAwKSB7XG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfVxuICAgICAgICBpZiAodGV4dHVyZS50YXJnZXQgPT09IEdMX1RFWFRVUkVfMkQpIHtcbiAgICAgICAgICBnbC50ZXhJbWFnZTJEKEdMX1RFWFRVUkVfMkQsXG4gICAgICAgICAgICBpLFxuICAgICAgICAgICAgdGV4dHVyZS5pbnRlcm5hbGZvcm1hdCxcbiAgICAgICAgICAgIHRleHR1cmUud2lkdGggPj4gaSxcbiAgICAgICAgICAgIHRleHR1cmUuaGVpZ2h0ID4+IGksXG4gICAgICAgICAgICAwLFxuICAgICAgICAgICAgdGV4dHVyZS5pbnRlcm5hbGZvcm1hdCxcbiAgICAgICAgICAgIHRleHR1cmUudHlwZSxcbiAgICAgICAgICAgIG51bGwpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCA2OyArK2opIHtcbiAgICAgICAgICAgIGdsLnRleEltYWdlMkQoR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YICsgaixcbiAgICAgICAgICAgICAgaSxcbiAgICAgICAgICAgICAgdGV4dHVyZS5pbnRlcm5hbGZvcm1hdCxcbiAgICAgICAgICAgICAgdGV4dHVyZS53aWR0aCA+PiBpLFxuICAgICAgICAgICAgICB0ZXh0dXJlLmhlaWdodCA+PiBpLFxuICAgICAgICAgICAgICAwLFxuICAgICAgICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0LFxuICAgICAgICAgICAgICB0ZXh0dXJlLnR5cGUsXG4gICAgICAgICAgICAgIG51bGwpXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBzZXRUZXhJbmZvKHRleHR1cmUudGV4SW5mbywgdGV4dHVyZS50YXJnZXQpXG4gICAgfSlcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY3JlYXRlMkQ6IGNyZWF0ZVRleHR1cmUyRCxcbiAgICBjcmVhdGVDdWJlOiBjcmVhdGVUZXh0dXJlQ3ViZSxcbiAgICBjbGVhcjogZGVzdHJveVRleHR1cmVzLFxuICAgIGdldFRleHR1cmU6IGZ1bmN0aW9uICh3cmFwcGVyKSB7XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH0sXG4gICAgcmVzdG9yZTogcmVzdG9yZVRleHR1cmVzXG4gIH1cbn1cbiIsInZhciBHTF9RVUVSWV9SRVNVTFRfRVhUID0gMHg4ODY2XG52YXIgR0xfUVVFUllfUkVTVUxUX0FWQUlMQUJMRV9FWFQgPSAweDg4NjdcbnZhciBHTF9USU1FX0VMQVBTRURfRVhUID0gMHg4OEJGXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGdsLCBleHRlbnNpb25zKSB7XG4gIHZhciBleHRUaW1lciA9IGV4dGVuc2lvbnMuZXh0X2Rpc2pvaW50X3RpbWVyX3F1ZXJ5XG5cbiAgaWYgKCFleHRUaW1lcikge1xuICAgIHJldHVybiBudWxsXG4gIH1cblxuICAvLyBRVUVSWSBQT09MIEJFR0lOXG4gIHZhciBxdWVyeVBvb2wgPSBbXVxuICBmdW5jdGlvbiBhbGxvY1F1ZXJ5ICgpIHtcbiAgICByZXR1cm4gcXVlcnlQb29sLnBvcCgpIHx8IGV4dFRpbWVyLmNyZWF0ZVF1ZXJ5RVhUKClcbiAgfVxuICBmdW5jdGlvbiBmcmVlUXVlcnkgKHF1ZXJ5KSB7XG4gICAgcXVlcnlQb29sLnB1c2gocXVlcnkpXG4gIH1cbiAgLy8gUVVFUlkgUE9PTCBFTkRcblxuICB2YXIgcGVuZGluZ1F1ZXJpZXMgPSBbXVxuICBmdW5jdGlvbiBiZWdpblF1ZXJ5IChzdGF0cykge1xuICAgIHZhciBxdWVyeSA9IGFsbG9jUXVlcnkoKVxuICAgIGV4dFRpbWVyLmJlZ2luUXVlcnlFWFQoR0xfVElNRV9FTEFQU0VEX0VYVCwgcXVlcnkpXG4gICAgcGVuZGluZ1F1ZXJpZXMucHVzaChxdWVyeSlcbiAgICBwdXNoU2NvcGVTdGF0cyhwZW5kaW5nUXVlcmllcy5sZW5ndGggLSAxLCBwZW5kaW5nUXVlcmllcy5sZW5ndGgsIHN0YXRzKVxuICB9XG5cbiAgZnVuY3Rpb24gZW5kUXVlcnkgKCkge1xuICAgIGV4dFRpbWVyLmVuZFF1ZXJ5RVhUKEdMX1RJTUVfRUxBUFNFRF9FWFQpXG4gIH1cblxuICAvL1xuICAvLyBQZW5kaW5nIHN0YXRzIHBvb2wuXG4gIC8vXG4gIGZ1bmN0aW9uIFBlbmRpbmdTdGF0cyAoKSB7XG4gICAgdGhpcy5zdGFydFF1ZXJ5SW5kZXggPSAtMVxuICAgIHRoaXMuZW5kUXVlcnlJbmRleCA9IC0xXG4gICAgdGhpcy5zdW0gPSAwXG4gICAgdGhpcy5zdGF0cyA9IG51bGxcbiAgfVxuICB2YXIgcGVuZGluZ1N0YXRzUG9vbCA9IFtdXG4gIGZ1bmN0aW9uIGFsbG9jUGVuZGluZ1N0YXRzICgpIHtcbiAgICByZXR1cm4gcGVuZGluZ1N0YXRzUG9vbC5wb3AoKSB8fCBuZXcgUGVuZGluZ1N0YXRzKClcbiAgfVxuICBmdW5jdGlvbiBmcmVlUGVuZGluZ1N0YXRzIChwZW5kaW5nU3RhdHMpIHtcbiAgICBwZW5kaW5nU3RhdHNQb29sLnB1c2gocGVuZGluZ1N0YXRzKVxuICB9XG4gIC8vIFBlbmRpbmcgc3RhdHMgcG9vbCBlbmRcblxuICB2YXIgcGVuZGluZ1N0YXRzID0gW11cbiAgZnVuY3Rpb24gcHVzaFNjb3BlU3RhdHMgKHN0YXJ0LCBlbmQsIHN0YXRzKSB7XG4gICAgdmFyIHBzID0gYWxsb2NQZW5kaW5nU3RhdHMoKVxuICAgIHBzLnN0YXJ0UXVlcnlJbmRleCA9IHN0YXJ0XG4gICAgcHMuZW5kUXVlcnlJbmRleCA9IGVuZFxuICAgIHBzLnN1bSA9IDBcbiAgICBwcy5zdGF0cyA9IHN0YXRzXG4gICAgcGVuZGluZ1N0YXRzLnB1c2gocHMpXG4gIH1cblxuICAvLyB3ZSBzaG91bGQgY2FsbCB0aGlzIGF0IHRoZSBiZWdpbm5pbmcgb2YgdGhlIGZyYW1lLFxuICAvLyBpbiBvcmRlciB0byB1cGRhdGUgZ3B1VGltZVxuICB2YXIgdGltZVN1bSA9IFtdXG4gIHZhciBxdWVyeVB0ciA9IFtdXG4gIGZ1bmN0aW9uIHVwZGF0ZSAoKSB7XG4gICAgdmFyIHB0ciwgaVxuXG4gICAgdmFyIG4gPSBwZW5kaW5nUXVlcmllcy5sZW5ndGhcbiAgICBpZiAobiA9PT0gMCkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgLy8gUmVzZXJ2ZSBzcGFjZVxuICAgIHF1ZXJ5UHRyLmxlbmd0aCA9IE1hdGgubWF4KHF1ZXJ5UHRyLmxlbmd0aCwgbiArIDEpXG4gICAgdGltZVN1bS5sZW5ndGggPSBNYXRoLm1heCh0aW1lU3VtLmxlbmd0aCwgbiArIDEpXG4gICAgdGltZVN1bVswXSA9IDBcbiAgICBxdWVyeVB0clswXSA9IDBcblxuICAgIC8vIFVwZGF0ZSBhbGwgcGVuZGluZyB0aW1lciBxdWVyaWVzXG4gICAgdmFyIHF1ZXJ5VGltZSA9IDBcbiAgICBwdHIgPSAwXG4gICAgZm9yIChpID0gMDsgaSA8IHBlbmRpbmdRdWVyaWVzLmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgcXVlcnkgPSBwZW5kaW5nUXVlcmllc1tpXVxuICAgICAgaWYgKGV4dFRpbWVyLmdldFF1ZXJ5T2JqZWN0RVhUKHF1ZXJ5LCBHTF9RVUVSWV9SRVNVTFRfQVZBSUxBQkxFX0VYVCkpIHtcbiAgICAgICAgcXVlcnlUaW1lICs9IGV4dFRpbWVyLmdldFF1ZXJ5T2JqZWN0RVhUKHF1ZXJ5LCBHTF9RVUVSWV9SRVNVTFRfRVhUKVxuICAgICAgICBmcmVlUXVlcnkocXVlcnkpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwZW5kaW5nUXVlcmllc1twdHIrK10gPSBxdWVyeVxuICAgICAgfVxuICAgICAgdGltZVN1bVtpICsgMV0gPSBxdWVyeVRpbWVcbiAgICAgIHF1ZXJ5UHRyW2kgKyAxXSA9IHB0clxuICAgIH1cbiAgICBwZW5kaW5nUXVlcmllcy5sZW5ndGggPSBwdHJcblxuICAgIC8vIFVwZGF0ZSBhbGwgcGVuZGluZyBzdGF0IHF1ZXJpZXNcbiAgICBwdHIgPSAwXG4gICAgZm9yIChpID0gMDsgaSA8IHBlbmRpbmdTdGF0cy5sZW5ndGg7ICsraSkge1xuICAgICAgdmFyIHN0YXRzID0gcGVuZGluZ1N0YXRzW2ldXG4gICAgICB2YXIgc3RhcnQgPSBzdGF0cy5zdGFydFF1ZXJ5SW5kZXhcbiAgICAgIHZhciBlbmQgPSBzdGF0cy5lbmRRdWVyeUluZGV4XG4gICAgICBzdGF0cy5zdW0gKz0gdGltZVN1bVtlbmRdIC0gdGltZVN1bVtzdGFydF1cbiAgICAgIHZhciBzdGFydFB0ciA9IHF1ZXJ5UHRyW3N0YXJ0XVxuICAgICAgdmFyIGVuZFB0ciA9IHF1ZXJ5UHRyW2VuZF1cbiAgICAgIGlmIChlbmRQdHIgPT09IHN0YXJ0UHRyKSB7XG4gICAgICAgIHN0YXRzLnN0YXRzLmdwdVRpbWUgKz0gc3RhdHMuc3VtIC8gMWU2XG4gICAgICAgIGZyZWVQZW5kaW5nU3RhdHMoc3RhdHMpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzdGF0cy5zdGFydFF1ZXJ5SW5kZXggPSBzdGFydFB0clxuICAgICAgICBzdGF0cy5lbmRRdWVyeUluZGV4ID0gZW5kUHRyXG4gICAgICAgIHBlbmRpbmdTdGF0c1twdHIrK10gPSBzdGF0c1xuICAgICAgfVxuICAgIH1cbiAgICBwZW5kaW5nU3RhdHMubGVuZ3RoID0gcHRyXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGJlZ2luUXVlcnk6IGJlZ2luUXVlcnksXG4gICAgZW5kUXVlcnk6IGVuZFF1ZXJ5LFxuICAgIHB1c2hTY29wZVN0YXRzOiBwdXNoU2NvcGVTdGF0cyxcbiAgICB1cGRhdGU6IHVwZGF0ZSxcbiAgICBnZXROdW1QZW5kaW5nUXVlcmllczogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIHBlbmRpbmdRdWVyaWVzLmxlbmd0aFxuICAgIH0sXG4gICAgY2xlYXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHF1ZXJ5UG9vbC5wdXNoLmFwcGx5KHF1ZXJ5UG9vbCwgcGVuZGluZ1F1ZXJpZXMpXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHF1ZXJ5UG9vbC5sZW5ndGg7IGkrKykge1xuICAgICAgICBleHRUaW1lci5kZWxldGVRdWVyeUVYVChxdWVyeVBvb2xbaV0pXG4gICAgICB9XG4gICAgICBwZW5kaW5nUXVlcmllcy5sZW5ndGggPSAwXG4gICAgICBxdWVyeVBvb2wubGVuZ3RoID0gMFxuICAgIH0sXG4gICAgcmVzdG9yZTogZnVuY3Rpb24gKCkge1xuICAgICAgcGVuZGluZ1F1ZXJpZXMubGVuZ3RoID0gMFxuICAgICAgcXVlcnlQb29sLmxlbmd0aCA9IDBcbiAgICB9XG4gIH1cbn1cbiIsIi8qIGdsb2JhbHMgcGVyZm9ybWFuY2UgKi9cbm1vZHVsZS5leHBvcnRzID1cbiAgKHR5cGVvZiBwZXJmb3JtYW5jZSAhPT0gJ3VuZGVmaW5lZCcgJiYgcGVyZm9ybWFuY2Uubm93KVxuICA/IGZ1bmN0aW9uICgpIHsgcmV0dXJuIHBlcmZvcm1hbmNlLm5vdygpIH1cbiAgOiBmdW5jdGlvbiAoKSB7IHJldHVybiArKG5ldyBEYXRlKCkpIH1cbiIsInZhciBleHRlbmQgPSByZXF1aXJlKCcuL2V4dGVuZCcpXG5cbmZ1bmN0aW9uIHNsaWNlICh4KSB7XG4gIHJldHVybiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbCh4KVxufVxuXG5mdW5jdGlvbiBqb2luICh4KSB7XG4gIHJldHVybiBzbGljZSh4KS5qb2luKCcnKVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNyZWF0ZUVudmlyb25tZW50ICgpIHtcbiAgLy8gVW5pcXVlIHZhcmlhYmxlIGlkIGNvdW50ZXJcbiAgdmFyIHZhckNvdW50ZXIgPSAwXG5cbiAgLy8gTGlua2VkIHZhbHVlcyBhcmUgcGFzc2VkIGZyb20gdGhpcyBzY29wZSBpbnRvIHRoZSBnZW5lcmF0ZWQgY29kZSBibG9ja1xuICAvLyBDYWxsaW5nIGxpbmsoKSBwYXNzZXMgYSB2YWx1ZSBpbnRvIHRoZSBnZW5lcmF0ZWQgc2NvcGUgYW5kIHJldHVybnNcbiAgLy8gdGhlIHZhcmlhYmxlIG5hbWUgd2hpY2ggaXQgaXMgYm91bmQgdG9cbiAgdmFyIGxpbmtlZE5hbWVzID0gW11cbiAgdmFyIGxpbmtlZFZhbHVlcyA9IFtdXG4gIGZ1bmN0aW9uIGxpbmsgKHZhbHVlKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsaW5rZWRWYWx1ZXMubGVuZ3RoOyArK2kpIHtcbiAgICAgIGlmIChsaW5rZWRWYWx1ZXNbaV0gPT09IHZhbHVlKSB7XG4gICAgICAgIHJldHVybiBsaW5rZWROYW1lc1tpXVxuICAgICAgfVxuICAgIH1cblxuICAgIHZhciBuYW1lID0gJ2cnICsgKHZhckNvdW50ZXIrKylcbiAgICBsaW5rZWROYW1lcy5wdXNoKG5hbWUpXG4gICAgbGlua2VkVmFsdWVzLnB1c2godmFsdWUpXG4gICAgcmV0dXJuIG5hbWVcbiAgfVxuXG4gIC8vIGNyZWF0ZSBhIGNvZGUgYmxvY2tcbiAgZnVuY3Rpb24gYmxvY2sgKCkge1xuICAgIHZhciBjb2RlID0gW11cbiAgICBmdW5jdGlvbiBwdXNoICgpIHtcbiAgICAgIGNvZGUucHVzaC5hcHBseShjb2RlLCBzbGljZShhcmd1bWVudHMpKVxuICAgIH1cblxuICAgIHZhciB2YXJzID0gW11cbiAgICBmdW5jdGlvbiBkZWYgKCkge1xuICAgICAgdmFyIG5hbWUgPSAndicgKyAodmFyQ291bnRlcisrKVxuICAgICAgdmFycy5wdXNoKG5hbWUpXG5cbiAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb2RlLnB1c2gobmFtZSwgJz0nKVxuICAgICAgICBjb2RlLnB1c2guYXBwbHkoY29kZSwgc2xpY2UoYXJndW1lbnRzKSlcbiAgICAgICAgY29kZS5wdXNoKCc7JylcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG5hbWVcbiAgICB9XG5cbiAgICByZXR1cm4gZXh0ZW5kKHB1c2gsIHtcbiAgICAgIGRlZjogZGVmLFxuICAgICAgdG9TdHJpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIGpvaW4oW1xuICAgICAgICAgICh2YXJzLmxlbmd0aCA+IDAgPyAndmFyICcgKyB2YXJzICsgJzsnIDogJycpLFxuICAgICAgICAgIGpvaW4oY29kZSlcbiAgICAgICAgXSlcbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgZnVuY3Rpb24gc2NvcGUgKCkge1xuICAgIHZhciBlbnRyeSA9IGJsb2NrKClcbiAgICB2YXIgZXhpdCA9IGJsb2NrKClcblxuICAgIHZhciBlbnRyeVRvU3RyaW5nID0gZW50cnkudG9TdHJpbmdcbiAgICB2YXIgZXhpdFRvU3RyaW5nID0gZXhpdC50b1N0cmluZ1xuXG4gICAgZnVuY3Rpb24gc2F2ZSAob2JqZWN0LCBwcm9wKSB7XG4gICAgICBleGl0KG9iamVjdCwgcHJvcCwgJz0nLCBlbnRyeS5kZWYob2JqZWN0LCBwcm9wKSwgJzsnKVxuICAgIH1cblxuICAgIHJldHVybiBleHRlbmQoZnVuY3Rpb24gKCkge1xuICAgICAgZW50cnkuYXBwbHkoZW50cnksIHNsaWNlKGFyZ3VtZW50cykpXG4gICAgfSwge1xuICAgICAgZGVmOiBlbnRyeS5kZWYsXG4gICAgICBlbnRyeTogZW50cnksXG4gICAgICBleGl0OiBleGl0LFxuICAgICAgc2F2ZTogc2F2ZSxcbiAgICAgIHNldDogZnVuY3Rpb24gKG9iamVjdCwgcHJvcCwgdmFsdWUpIHtcbiAgICAgICAgc2F2ZShvYmplY3QsIHByb3ApXG4gICAgICAgIGVudHJ5KG9iamVjdCwgcHJvcCwgJz0nLCB2YWx1ZSwgJzsnKVxuICAgICAgfSxcbiAgICAgIHRvU3RyaW5nOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBlbnRyeVRvU3RyaW5nKCkgKyBleGl0VG9TdHJpbmcoKVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiBjb25kaXRpb25hbCAoKSB7XG4gICAgdmFyIHByZWQgPSBqb2luKGFyZ3VtZW50cylcbiAgICB2YXIgdGhlbkJsb2NrID0gc2NvcGUoKVxuICAgIHZhciBlbHNlQmxvY2sgPSBzY29wZSgpXG5cbiAgICB2YXIgdGhlblRvU3RyaW5nID0gdGhlbkJsb2NrLnRvU3RyaW5nXG4gICAgdmFyIGVsc2VUb1N0cmluZyA9IGVsc2VCbG9jay50b1N0cmluZ1xuXG4gICAgcmV0dXJuIGV4dGVuZCh0aGVuQmxvY2ssIHtcbiAgICAgIHRoZW46IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhlbkJsb2NrLmFwcGx5KHRoZW5CbG9jaywgc2xpY2UoYXJndW1lbnRzKSlcbiAgICAgICAgcmV0dXJuIHRoaXNcbiAgICAgIH0sXG4gICAgICBlbHNlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGVsc2VCbG9jay5hcHBseShlbHNlQmxvY2ssIHNsaWNlKGFyZ3VtZW50cykpXG4gICAgICAgIHJldHVybiB0aGlzXG4gICAgICB9LFxuICAgICAgdG9TdHJpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGVsc2VDbGF1c2UgPSBlbHNlVG9TdHJpbmcoKVxuICAgICAgICBpZiAoZWxzZUNsYXVzZSkge1xuICAgICAgICAgIGVsc2VDbGF1c2UgPSAnZWxzZXsnICsgZWxzZUNsYXVzZSArICd9J1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBqb2luKFtcbiAgICAgICAgICAnaWYoJywgcHJlZCwgJyl7JyxcbiAgICAgICAgICB0aGVuVG9TdHJpbmcoKSxcbiAgICAgICAgICAnfScsIGVsc2VDbGF1c2VcbiAgICAgICAgXSlcbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgLy8gcHJvY2VkdXJlIGxpc3RcbiAgdmFyIGdsb2JhbEJsb2NrID0gYmxvY2soKVxuICB2YXIgcHJvY2VkdXJlcyA9IHt9XG4gIGZ1bmN0aW9uIHByb2MgKG5hbWUsIGNvdW50KSB7XG4gICAgdmFyIGFyZ3MgPSBbXVxuICAgIGZ1bmN0aW9uIGFyZyAoKSB7XG4gICAgICB2YXIgbmFtZSA9ICdhJyArIGFyZ3MubGVuZ3RoXG4gICAgICBhcmdzLnB1c2gobmFtZSlcbiAgICAgIHJldHVybiBuYW1lXG4gICAgfVxuXG4gICAgY291bnQgPSBjb3VudCB8fCAwXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjb3VudDsgKytpKSB7XG4gICAgICBhcmcoKVxuICAgIH1cblxuICAgIHZhciBib2R5ID0gc2NvcGUoKVxuICAgIHZhciBib2R5VG9TdHJpbmcgPSBib2R5LnRvU3RyaW5nXG5cbiAgICB2YXIgcmVzdWx0ID0gcHJvY2VkdXJlc1tuYW1lXSA9IGV4dGVuZChib2R5LCB7XG4gICAgICBhcmc6IGFyZyxcbiAgICAgIHRvU3RyaW5nOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBqb2luKFtcbiAgICAgICAgICAnZnVuY3Rpb24oJywgYXJncy5qb2luKCksICcpeycsXG4gICAgICAgICAgYm9keVRvU3RyaW5nKCksXG4gICAgICAgICAgJ30nXG4gICAgICAgIF0pXG4gICAgICB9XG4gICAgfSlcblxuICAgIHJldHVybiByZXN1bHRcbiAgfVxuXG4gIGZ1bmN0aW9uIGNvbXBpbGUgKCkge1xuICAgIHZhciBjb2RlID0gWydcInVzZSBzdHJpY3RcIjsnLFxuICAgICAgZ2xvYmFsQmxvY2ssXG4gICAgICAncmV0dXJuIHsnXVxuICAgIE9iamVjdC5rZXlzKHByb2NlZHVyZXMpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIGNvZGUucHVzaCgnXCInLCBuYW1lLCAnXCI6JywgcHJvY2VkdXJlc1tuYW1lXS50b1N0cmluZygpLCAnLCcpXG4gICAgfSlcbiAgICBjb2RlLnB1c2goJ30nKVxuICAgIHZhciBzcmMgPSBqb2luKGNvZGUpXG4gICAgICAucmVwbGFjZSgvOy9nLCAnO1xcbicpXG4gICAgICAucmVwbGFjZSgvfS9nLCAnfVxcbicpXG4gICAgICAucmVwbGFjZSgvey9nLCAne1xcbicpXG4gICAgdmFyIHByb2MgPSBGdW5jdGlvbi5hcHBseShudWxsLCBsaW5rZWROYW1lcy5jb25jYXQoc3JjKSlcbiAgICByZXR1cm4gcHJvYy5hcHBseShudWxsLCBsaW5rZWRWYWx1ZXMpXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGdsb2JhbDogZ2xvYmFsQmxvY2ssXG4gICAgbGluazogbGluayxcbiAgICBibG9jazogYmxvY2ssXG4gICAgcHJvYzogcHJvYyxcbiAgICBzY29wZTogc2NvcGUsXG4gICAgY29uZDogY29uZGl0aW9uYWwsXG4gICAgY29tcGlsZTogY29tcGlsZVxuICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChiYXNlLCBvcHRzKSB7XG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXMob3B0cylcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBrZXlzLmxlbmd0aDsgKytpKSB7XG4gICAgYmFzZVtrZXlzW2ldXSA9IG9wdHNba2V5c1tpXV1cbiAgfVxuICByZXR1cm4gYmFzZVxufVxuIiwidmFyIHBvb2wgPSByZXF1aXJlKCcuL3Bvb2wnKVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgc2hhcGU6IGFycmF5U2hhcGUsXG4gIGZsYXR0ZW46IGZsYXR0ZW5BcnJheVxufVxuXG5mdW5jdGlvbiBmbGF0dGVuMUQgKGFycmF5LCBueCwgb3V0KSB7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbng7ICsraSkge1xuICAgIG91dFtpXSA9IGFycmF5W2ldXG4gIH1cbn1cblxuZnVuY3Rpb24gZmxhdHRlbjJEIChhcnJheSwgbngsIG55LCBvdXQpIHtcbiAgdmFyIHB0ciA9IDBcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBueDsgKytpKSB7XG4gICAgdmFyIHJvdyA9IGFycmF5W2ldXG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBueTsgKytqKSB7XG4gICAgICBvdXRbcHRyKytdID0gcm93W2pdXG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGZsYXR0ZW4zRCAoYXJyYXksIG54LCBueSwgbnosIG91dCwgcHRyXykge1xuICB2YXIgcHRyID0gcHRyX1xuICBmb3IgKHZhciBpID0gMDsgaSA8IG54OyArK2kpIHtcbiAgICB2YXIgcm93ID0gYXJyYXlbaV1cbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IG55OyArK2opIHtcbiAgICAgIHZhciBjb2wgPSByb3dbal1cbiAgICAgIGZvciAodmFyIGsgPSAwOyBrIDwgbno7ICsraykge1xuICAgICAgICBvdXRbcHRyKytdID0gY29sW2tdXG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGZsYXR0ZW5SZWMgKGFycmF5LCBzaGFwZSwgbGV2ZWwsIG91dCwgcHRyKSB7XG4gIHZhciBzdHJpZGUgPSAxXG4gIGZvciAodmFyIGkgPSBsZXZlbCArIDE7IGkgPCBzaGFwZS5sZW5ndGg7ICsraSkge1xuICAgIHN0cmlkZSAqPSBzaGFwZVtpXVxuICB9XG4gIHZhciBuID0gc2hhcGVbbGV2ZWxdXG4gIGlmIChzaGFwZS5sZW5ndGggLSBsZXZlbCA9PT0gNCkge1xuICAgIHZhciBueCA9IHNoYXBlW2xldmVsICsgMV1cbiAgICB2YXIgbnkgPSBzaGFwZVtsZXZlbCArIDJdXG4gICAgdmFyIG56ID0gc2hhcGVbbGV2ZWwgKyAzXVxuICAgIGZvciAoaSA9IDA7IGkgPCBuOyArK2kpIHtcbiAgICAgIGZsYXR0ZW4zRChhcnJheVtpXSwgbngsIG55LCBueiwgb3V0LCBwdHIpXG4gICAgICBwdHIgKz0gc3RyaWRlXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGZvciAoaSA9IDA7IGkgPCBuOyArK2kpIHtcbiAgICAgIGZsYXR0ZW5SZWMoYXJyYXlbaV0sIHNoYXBlLCBsZXZlbCArIDEsIG91dCwgcHRyKVxuICAgICAgcHRyICs9IHN0cmlkZVxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBmbGF0dGVuQXJyYXkgKGFycmF5LCBzaGFwZSwgdHlwZSwgb3V0Xykge1xuICB2YXIgc3ogPSAxXG4gIGlmIChzaGFwZS5sZW5ndGgpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHNoYXBlLmxlbmd0aDsgKytpKSB7XG4gICAgICBzeiAqPSBzaGFwZVtpXVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBzeiA9IDBcbiAgfVxuICB2YXIgb3V0ID0gb3V0XyB8fCBwb29sLmFsbG9jVHlwZSh0eXBlLCBzeilcbiAgc3dpdGNoIChzaGFwZS5sZW5ndGgpIHtcbiAgICBjYXNlIDA6XG4gICAgICBicmVha1xuICAgIGNhc2UgMTpcbiAgICAgIGZsYXR0ZW4xRChhcnJheSwgc2hhcGVbMF0sIG91dClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAyOlxuICAgICAgZmxhdHRlbjJEKGFycmF5LCBzaGFwZVswXSwgc2hhcGVbMV0sIG91dClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAzOlxuICAgICAgZmxhdHRlbjNEKGFycmF5LCBzaGFwZVswXSwgc2hhcGVbMV0sIHNoYXBlWzJdLCBvdXQsIDApXG4gICAgICBicmVha1xuICAgIGRlZmF1bHQ6XG4gICAgICBmbGF0dGVuUmVjKGFycmF5LCBzaGFwZSwgMCwgb3V0LCAwKVxuICB9XG4gIHJldHVybiBvdXRcbn1cblxuZnVuY3Rpb24gYXJyYXlTaGFwZSAoYXJyYXlfKSB7XG4gIHZhciBzaGFwZSA9IFtdXG4gIGZvciAodmFyIGFycmF5ID0gYXJyYXlfOyBhcnJheS5sZW5ndGg7IGFycmF5ID0gYXJyYXlbMF0pIHtcbiAgICBzaGFwZS5wdXNoKGFycmF5Lmxlbmd0aClcbiAgfVxuICByZXR1cm4gc2hhcGVcbn1cbiIsInZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL2lzLXR5cGVkLWFycmF5Jylcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaXNBcnJheUxpa2UgKHMpIHtcbiAgcmV0dXJuIEFycmF5LmlzQXJyYXkocykgfHwgaXNUeXBlZEFycmF5KHMpXG59XG4iLCJ2YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi9pcy10eXBlZC1hcnJheScpXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaXNOREFycmF5TGlrZSAob2JqKSB7XG4gIHJldHVybiAoXG4gICAgISFvYmogJiZcbiAgICB0eXBlb2Ygb2JqID09PSAnb2JqZWN0JyAmJlxuICAgIEFycmF5LmlzQXJyYXkob2JqLnNoYXBlKSAmJlxuICAgIEFycmF5LmlzQXJyYXkob2JqLnN0cmlkZSkgJiZcbiAgICB0eXBlb2Ygb2JqLm9mZnNldCA9PT0gJ251bWJlcicgJiZcbiAgICBvYmouc2hhcGUubGVuZ3RoID09PSBvYmouc3RyaWRlLmxlbmd0aCAmJlxuICAgIChBcnJheS5pc0FycmF5KG9iai5kYXRhKSB8fFxuICAgICAgaXNUeXBlZEFycmF5KG9iai5kYXRhKSkpXG59XG4iLCJ2YXIgZHR5cGVzID0gcmVxdWlyZSgnLi4vY29uc3RhbnRzL2FycmF5dHlwZXMuanNvbicpXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uICh4KSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoeCkgaW4gZHR5cGVzXG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGxvb3AgKG4sIGYpIHtcbiAgdmFyIHJlc3VsdCA9IEFycmF5KG4pXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbjsgKytpKSB7XG4gICAgcmVzdWx0W2ldID0gZihpKVxuICB9XG4gIHJldHVybiByZXN1bHRcbn1cbiIsInZhciBsb29wID0gcmVxdWlyZSgnLi9sb29wJylcblxudmFyIEdMX0JZVEUgPSA1MTIwXG52YXIgR0xfVU5TSUdORURfQllURSA9IDUxMjFcbnZhciBHTF9TSE9SVCA9IDUxMjJcbnZhciBHTF9VTlNJR05FRF9TSE9SVCA9IDUxMjNcbnZhciBHTF9JTlQgPSA1MTI0XG52YXIgR0xfVU5TSUdORURfSU5UID0gNTEyNVxudmFyIEdMX0ZMT0FUID0gNTEyNlxuXG52YXIgYnVmZmVyUG9vbCA9IGxvb3AoOCwgZnVuY3Rpb24gKCkge1xuICByZXR1cm4gW11cbn0pXG5cbmZ1bmN0aW9uIG5leHRQb3cxNiAodikge1xuICBmb3IgKHZhciBpID0gMTY7IGkgPD0gKDEgPDwgMjgpOyBpICo9IDE2KSB7XG4gICAgaWYgKHYgPD0gaSkge1xuICAgICAgcmV0dXJuIGlcbiAgICB9XG4gIH1cbiAgcmV0dXJuIDBcbn1cblxuZnVuY3Rpb24gbG9nMiAodikge1xuICB2YXIgciwgc2hpZnRcbiAgciA9ICh2ID4gMHhGRkZGKSA8PCA0XG4gIHYgPj4+PSByXG4gIHNoaWZ0ID0gKHYgPiAweEZGKSA8PCAzXG4gIHYgPj4+PSBzaGlmdDsgciB8PSBzaGlmdFxuICBzaGlmdCA9ICh2ID4gMHhGKSA8PCAyXG4gIHYgPj4+PSBzaGlmdDsgciB8PSBzaGlmdFxuICBzaGlmdCA9ICh2ID4gMHgzKSA8PCAxXG4gIHYgPj4+PSBzaGlmdDsgciB8PSBzaGlmdFxuICByZXR1cm4gciB8ICh2ID4+IDEpXG59XG5cbmZ1bmN0aW9uIGFsbG9jIChuKSB7XG4gIHZhciBzeiA9IG5leHRQb3cxNihuKVxuICB2YXIgYmluID0gYnVmZmVyUG9vbFtsb2cyKHN6KSA+PiAyXVxuICBpZiAoYmluLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4gYmluLnBvcCgpXG4gIH1cbiAgcmV0dXJuIG5ldyBBcnJheUJ1ZmZlcihzeilcbn1cblxuZnVuY3Rpb24gZnJlZSAoYnVmKSB7XG4gIGJ1ZmZlclBvb2xbbG9nMihidWYuYnl0ZUxlbmd0aCkgPj4gMl0ucHVzaChidWYpXG59XG5cbmZ1bmN0aW9uIGFsbG9jVHlwZSAodHlwZSwgbikge1xuICB2YXIgcmVzdWx0ID0gbnVsbFxuICBzd2l0Y2ggKHR5cGUpIHtcbiAgICBjYXNlIEdMX0JZVEU6XG4gICAgICByZXN1bHQgPSBuZXcgSW50OEFycmF5KGFsbG9jKG4pLCAwLCBuKVxuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX1VOU0lHTkVEX0JZVEU6XG4gICAgICByZXN1bHQgPSBuZXcgVWludDhBcnJheShhbGxvYyhuKSwgMCwgbilcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9TSE9SVDpcbiAgICAgIHJlc3VsdCA9IG5ldyBJbnQxNkFycmF5KGFsbG9jKDIgKiBuKSwgMCwgbilcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9VTlNJR05FRF9TSE9SVDpcbiAgICAgIHJlc3VsdCA9IG5ldyBVaW50MTZBcnJheShhbGxvYygyICogbiksIDAsIG4pXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfSU5UOlxuICAgICAgcmVzdWx0ID0gbmV3IEludDMyQXJyYXkoYWxsb2MoNCAqIG4pLCAwLCBuKVxuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX1VOU0lHTkVEX0lOVDpcbiAgICAgIHJlc3VsdCA9IG5ldyBVaW50MzJBcnJheShhbGxvYyg0ICogbiksIDAsIG4pXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfRkxPQVQ6XG4gICAgICByZXN1bHQgPSBuZXcgRmxvYXQzMkFycmF5KGFsbG9jKDQgKiBuKSwgMCwgbilcbiAgICAgIGJyZWFrXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBudWxsXG4gIH1cbiAgaWYgKHJlc3VsdC5sZW5ndGggIT09IG4pIHtcbiAgICByZXR1cm4gcmVzdWx0LnN1YmFycmF5KDAsIG4pXG4gIH1cbiAgcmV0dXJuIHJlc3VsdFxufVxuXG5mdW5jdGlvbiBmcmVlVHlwZSAoYXJyYXkpIHtcbiAgZnJlZShhcnJheS5idWZmZXIpXG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBhbGxvYzogYWxsb2MsXG4gIGZyZWU6IGZyZWUsXG4gIGFsbG9jVHlwZTogYWxsb2NUeXBlLFxuICBmcmVlVHlwZTogZnJlZVR5cGVcbn1cbiIsIi8qIGdsb2JhbHMgcmVxdWVzdEFuaW1hdGlvbkZyYW1lLCBjYW5jZWxBbmltYXRpb25GcmFtZSAqL1xuaWYgKHR5cGVvZiByZXF1ZXN0QW5pbWF0aW9uRnJhbWUgPT09ICdmdW5jdGlvbicgJiZcbiAgICB0eXBlb2YgY2FuY2VsQW5pbWF0aW9uRnJhbWUgPT09ICdmdW5jdGlvbicpIHtcbiAgbW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgbmV4dDogZnVuY3Rpb24gKHgpIHsgcmV0dXJuIHJlcXVlc3RBbmltYXRpb25GcmFtZSh4KSB9LFxuICAgIGNhbmNlbDogZnVuY3Rpb24gKHgpIHsgcmV0dXJuIGNhbmNlbEFuaW1hdGlvbkZyYW1lKHgpIH1cbiAgfVxufSBlbHNlIHtcbiAgbW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgbmV4dDogZnVuY3Rpb24gKGNiKSB7XG4gICAgICByZXR1cm4gc2V0VGltZW91dChjYiwgMTYpXG4gICAgfSxcbiAgICBjYW5jZWw6IGNsZWFyVGltZW91dFxuICB9XG59XG4iLCJ2YXIgcG9vbCA9IHJlcXVpcmUoJy4vcG9vbCcpXG5cbnZhciBGTE9BVCA9IG5ldyBGbG9hdDMyQXJyYXkoMSlcbnZhciBJTlQgPSBuZXcgVWludDMyQXJyYXkoRkxPQVQuYnVmZmVyKVxuXG52YXIgR0xfVU5TSUdORURfU0hPUlQgPSA1MTIzXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY29udmVydFRvSGFsZkZsb2F0IChhcnJheSkge1xuICB2YXIgdXNob3J0cyA9IHBvb2wuYWxsb2NUeXBlKEdMX1VOU0lHTkVEX1NIT1JULCBhcnJheS5sZW5ndGgpXG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnJheS5sZW5ndGg7ICsraSkge1xuICAgIGlmIChpc05hTihhcnJheVtpXSkpIHtcbiAgICAgIHVzaG9ydHNbaV0gPSAweGZmZmZcbiAgICB9IGVsc2UgaWYgKGFycmF5W2ldID09PSBJbmZpbml0eSkge1xuICAgICAgdXNob3J0c1tpXSA9IDB4N2MwMFxuICAgIH0gZWxzZSBpZiAoYXJyYXlbaV0gPT09IC1JbmZpbml0eSkge1xuICAgICAgdXNob3J0c1tpXSA9IDB4ZmMwMFxuICAgIH0gZWxzZSB7XG4gICAgICBGTE9BVFswXSA9IGFycmF5W2ldXG4gICAgICB2YXIgeCA9IElOVFswXVxuXG4gICAgICB2YXIgc2duID0gKHggPj4+IDMxKSA8PCAxNVxuICAgICAgdmFyIGV4cCA9ICgoeCA8PCAxKSA+Pj4gMjQpIC0gMTI3XG4gICAgICB2YXIgZnJhYyA9ICh4ID4+IDEzKSAmICgoMSA8PCAxMCkgLSAxKVxuXG4gICAgICBpZiAoZXhwIDwgLTI0KSB7XG4gICAgICAgIC8vIHJvdW5kIG5vbi1yZXByZXNlbnRhYmxlIGRlbm9ybWFscyB0byAwXG4gICAgICAgIHVzaG9ydHNbaV0gPSBzZ25cbiAgICAgIH0gZWxzZSBpZiAoZXhwIDwgLTE0KSB7XG4gICAgICAgIC8vIGhhbmRsZSBkZW5vcm1hbHNcbiAgICAgICAgdmFyIHMgPSAtMTQgLSBleHBcbiAgICAgICAgdXNob3J0c1tpXSA9IHNnbiArICgoZnJhYyArICgxIDw8IDEwKSkgPj4gcylcbiAgICAgIH0gZWxzZSBpZiAoZXhwID4gMTUpIHtcbiAgICAgICAgLy8gcm91bmQgb3ZlcmZsb3cgdG8gKy8tIEluZmluaXR5XG4gICAgICAgIHVzaG9ydHNbaV0gPSBzZ24gKyAweDdjMDBcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIG90aGVyd2lzZSBjb252ZXJ0IGRpcmVjdGx5XG4gICAgICAgIHVzaG9ydHNbaV0gPSBzZ24gKyAoKGV4cCArIDE1KSA8PCAxMCkgKyBmcmFjXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHVzaG9ydHNcbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKG9iaikge1xuICByZXR1cm4gT2JqZWN0LmtleXMob2JqKS5tYXAoZnVuY3Rpb24gKGtleSkgeyByZXR1cm4gb2JqW2tleV0gfSlcbn1cbiIsIi8vIENvbnRleHQgYW5kIGNhbnZhcyBjcmVhdGlvbiBoZWxwZXIgZnVuY3Rpb25zXG5cbnZhciBleHRlbmQgPSByZXF1aXJlKCcuL3V0aWwvZXh0ZW5kJylcblxuZnVuY3Rpb24gY3JlYXRlQ2FudmFzIChlbGVtZW50LCBvbkRvbmUsIHBpeGVsUmF0aW8pIHtcbiAgdmFyIGNhbnZhcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpXG4gIGV4dGVuZChjYW52YXMuc3R5bGUsIHtcbiAgICBib3JkZXI6IDAsXG4gICAgbWFyZ2luOiAwLFxuICAgIHBhZGRpbmc6IDAsXG4gICAgdG9wOiAwLFxuICAgIGxlZnQ6IDBcbiAgfSlcbiAgZWxlbWVudC5hcHBlbmRDaGlsZChjYW52YXMpXG5cbiAgaWYgKGVsZW1lbnQgPT09IGRvY3VtZW50LmJvZHkpIHtcbiAgICBjYW52YXMuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnXG4gICAgZXh0ZW5kKGVsZW1lbnQuc3R5bGUsIHtcbiAgICAgIG1hcmdpbjogMCxcbiAgICAgIHBhZGRpbmc6IDBcbiAgICB9KVxuICB9XG5cbiAgZnVuY3Rpb24gcmVzaXplICgpIHtcbiAgICB2YXIgdyA9IHdpbmRvdy5pbm5lcldpZHRoXG4gICAgdmFyIGggPSB3aW5kb3cuaW5uZXJIZWlnaHRcbiAgICBpZiAoZWxlbWVudCAhPT0gZG9jdW1lbnQuYm9keSkge1xuICAgICAgdmFyIGJvdW5kcyA9IGVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KClcbiAgICAgIHcgPSBib3VuZHMucmlnaHQgLSBib3VuZHMubGVmdFxuICAgICAgaCA9IGJvdW5kcy50b3AgLSBib3VuZHMuYm90dG9tXG4gICAgfVxuICAgIGNhbnZhcy53aWR0aCA9IHBpeGVsUmF0aW8gKiB3XG4gICAgY2FudmFzLmhlaWdodCA9IHBpeGVsUmF0aW8gKiBoXG4gICAgZXh0ZW5kKGNhbnZhcy5zdHlsZSwge1xuICAgICAgd2lkdGg6IHcgKyAncHgnLFxuICAgICAgaGVpZ2h0OiBoICsgJ3B4J1xuICAgIH0pXG4gIH1cblxuICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgcmVzaXplLCBmYWxzZSlcblxuICBmdW5jdGlvbiBvbkRlc3Ryb3kgKCkge1xuICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdyZXNpemUnLCByZXNpemUpXG4gICAgZWxlbWVudC5yZW1vdmVDaGlsZChjYW52YXMpXG4gIH1cblxuICByZXNpemUoKVxuXG4gIHJldHVybiB7XG4gICAgY2FudmFzOiBjYW52YXMsXG4gICAgb25EZXN0cm95OiBvbkRlc3Ryb3lcbiAgfVxufVxuXG5mdW5jdGlvbiBjcmVhdGVDb250ZXh0IChjYW52YXMsIGNvbnRleEF0dHJpYnV0ZXMpIHtcbiAgZnVuY3Rpb24gZ2V0IChuYW1lKSB7XG4gICAgdHJ5IHtcbiAgICAgIHJldHVybiBjYW52YXMuZ2V0Q29udGV4dChuYW1lLCBjb250ZXhBdHRyaWJ1dGVzKVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuICB9XG4gIHJldHVybiAoXG4gICAgZ2V0KCd3ZWJnbCcpIHx8XG4gICAgZ2V0KCdleHBlcmltZW50YWwtd2ViZ2wnKSB8fFxuICAgIGdldCgnd2ViZ2wtZXhwZXJpbWVudGFsJylcbiAgKVxufVxuXG5mdW5jdGlvbiBpc0hUTUxFbGVtZW50IChvYmopIHtcbiAgcmV0dXJuIChcbiAgICB0eXBlb2Ygb2JqLm5vZGVOYW1lID09PSAnc3RyaW5nJyAmJlxuICAgIHR5cGVvZiBvYmouYXBwZW5kQ2hpbGQgPT09ICdmdW5jdGlvbicgJiZcbiAgICB0eXBlb2Ygb2JqLmdldEJvdW5kaW5nQ2xpZW50UmVjdCA9PT0gJ2Z1bmN0aW9uJ1xuICApXG59XG5cbmZ1bmN0aW9uIGlzV2ViR0xDb250ZXh0IChvYmopIHtcbiAgcmV0dXJuIChcbiAgICB0eXBlb2Ygb2JqLmRyYXdBcnJheXMgPT09ICdmdW5jdGlvbicgfHxcbiAgICB0eXBlb2Ygb2JqLmRyYXdFbGVtZW50cyA9PT0gJ2Z1bmN0aW9uJ1xuICApXG59XG5cbmZ1bmN0aW9uIHBhcnNlRXh0ZW5zaW9ucyAoaW5wdXQpIHtcbiAgaWYgKHR5cGVvZiBpbnB1dCA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gaW5wdXQuc3BsaXQoKVxuICB9XG4gIFxuICByZXR1cm4gaW5wdXRcbn1cblxuZnVuY3Rpb24gZ2V0RWxlbWVudCAoZGVzYykge1xuICBpZiAodHlwZW9mIGRlc2MgPT09ICdzdHJpbmcnKSB7XG4gICAgXG4gICAgcmV0dXJuIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoZGVzYylcbiAgfVxuICByZXR1cm4gZGVzY1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHBhcnNlQXJncyAoYXJnc18pIHtcbiAgdmFyIGFyZ3MgPSBhcmdzXyB8fCB7fVxuICB2YXIgZWxlbWVudCwgY29udGFpbmVyLCBjYW52YXMsIGdsXG4gIHZhciBjb250ZXh0QXR0cmlidXRlcyA9IHt9XG4gIHZhciBleHRlbnNpb25zID0gW11cbiAgdmFyIG9wdGlvbmFsRXh0ZW5zaW9ucyA9IFtdXG4gIHZhciBwaXhlbFJhdGlvID0gKHR5cGVvZiB3aW5kb3cgPT09ICd1bmRlZmluZWQnID8gMSA6IHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvKVxuICB2YXIgcHJvZmlsZSA9IGZhbHNlXG4gIHZhciBvbkRvbmUgPSBmdW5jdGlvbiAoZXJyKSB7XG4gICAgaWYgKGVycikge1xuICAgICAgXG4gICAgfVxuICB9XG4gIHZhciBvbkRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7fVxuICBpZiAodHlwZW9mIGFyZ3MgPT09ICdzdHJpbmcnKSB7XG4gICAgXG4gICAgZWxlbWVudCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYXJncylcbiAgICBcbiAgfSBlbHNlIGlmICh0eXBlb2YgYXJncyA9PT0gJ29iamVjdCcpIHtcbiAgICBpZiAoaXNIVE1MRWxlbWVudChhcmdzKSkge1xuICAgICAgZWxlbWVudCA9IGFyZ3NcbiAgICB9IGVsc2UgaWYgKGlzV2ViR0xDb250ZXh0KGFyZ3MpKSB7XG4gICAgICBnbCA9IGFyZ3NcbiAgICAgIGNhbnZhcyA9IGdsLmNhbnZhc1xuICAgIH0gZWxzZSB7XG4gICAgICBcbiAgICAgIGlmICgnZ2wnIGluIGFyZ3MpIHtcbiAgICAgICAgZ2wgPSBhcmdzLmdsXG4gICAgICB9IGVsc2UgaWYgKCdjYW52YXMnIGluIGFyZ3MpIHtcbiAgICAgICAgY2FudmFzID0gZ2V0RWxlbWVudChhcmdzLmNhbnZhcylcbiAgICAgIH0gZWxzZSBpZiAoJ2NvbnRhaW5lcicgaW4gYXJncykge1xuICAgICAgICBjb250YWluZXIgPSBnZXRFbGVtZW50KGFyZ3MuY29udGFpbmVyKVxuICAgICAgfVxuICAgICAgaWYgKCdhdHRyaWJ1dGVzJyBpbiBhcmdzKSB7XG4gICAgICAgIGNvbnRleHRBdHRyaWJ1dGVzID0gYXJncy5hdHRyaWJ1dGVzXG4gICAgICAgIFxuICAgICAgfVxuICAgICAgaWYgKCdleHRlbnNpb25zJyBpbiBhcmdzKSB7XG4gICAgICAgIGV4dGVuc2lvbnMgPSBwYXJzZUV4dGVuc2lvbnMoYXJncy5leHRlbnNpb25zKVxuICAgICAgfVxuICAgICAgaWYgKCdvcHRpb25hbEV4dGVuc2lvbnMnIGluIGFyZ3MpIHtcbiAgICAgICAgb3B0aW9uYWxFeHRlbnNpb25zID0gcGFyc2VFeHRlbnNpb25zKGFyZ3Mub3B0aW9uYWxFeHRlbnNpb25zKVxuICAgICAgfVxuICAgICAgaWYgKCdvbkRvbmUnIGluIGFyZ3MpIHtcbiAgICAgICAgXG4gICAgICAgIG9uRG9uZSA9IGFyZ3Mub25Eb25lXG4gICAgICB9XG4gICAgICBpZiAoJ3Byb2ZpbGUnIGluIGFyZ3MpIHtcbiAgICAgICAgcHJvZmlsZSA9ICEhYXJncy5wcm9maWxlXG4gICAgICB9XG4gICAgICBpZiAoJ3BpeGVsUmF0aW8nIGluIGFyZ3MpIHtcbiAgICAgICAgcGl4ZWxSYXRpbyA9ICthcmdzLnBpeGVsUmF0aW9cbiAgICAgICAgXG4gICAgICB9XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIFxuICB9XG5cbiAgaWYgKGVsZW1lbnQpIHtcbiAgICBpZiAoZWxlbWVudC5ub2RlTmFtZS50b0xvd2VyQ2FzZSgpID09PSAnY2FudmFzJykge1xuICAgICAgY2FudmFzID0gZWxlbWVudFxuICAgIH0gZWxzZSB7XG4gICAgICBjb250YWluZXIgPSBlbGVtZW50XG4gICAgfVxuICB9XG5cbiAgaWYgKCFnbCkge1xuICAgIGlmICghY2FudmFzKSB7XG4gICAgICBcbiAgICAgIHZhciByZXN1bHQgPSBjcmVhdGVDYW52YXMoY29udGFpbmVyIHx8IGRvY3VtZW50LmJvZHksIG9uRG9uZSwgcGl4ZWxSYXRpbylcbiAgICAgIGlmICghcmVzdWx0KSB7XG4gICAgICAgIHJldHVybiBudWxsXG4gICAgICB9XG4gICAgICBjYW52YXMgPSByZXN1bHQuY2FudmFzXG4gICAgICBvbkRlc3Ryb3kgPSByZXN1bHQub25EZXN0cm95XG4gICAgfVxuICAgIGdsID0gY3JlYXRlQ29udGV4dChjYW52YXMsIGNvbnRleHRBdHRyaWJ1dGVzKVxuICB9XG5cbiAgaWYgKCFnbCkge1xuICAgIG9uRGVzdHJveSgpXG4gICAgb25Eb25lKCd3ZWJnbCBub3Qgc3VwcG9ydGVkLCB0cnkgdXBncmFkaW5nIHlvdXIgYnJvd3NlciBvciBncmFwaGljcyBkcml2ZXJzIGh0dHA6Ly9nZXQud2ViZ2wub3JnJylcbiAgICByZXR1cm4gbnVsbFxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBnbDogZ2wsXG4gICAgY2FudmFzOiBjYW52YXMsXG4gICAgY29udGFpbmVyOiBjb250YWluZXIsXG4gICAgZXh0ZW5zaW9uczogZXh0ZW5zaW9ucyxcbiAgICBvcHRpb25hbEV4dGVuc2lvbnM6IG9wdGlvbmFsRXh0ZW5zaW9ucyxcbiAgICBwaXhlbFJhdGlvOiBwaXhlbFJhdGlvLFxuICAgIHByb2ZpbGU6IHByb2ZpbGUsXG4gICAgb25Eb25lOiBvbkRvbmUsXG4gICAgb25EZXN0cm95OiBvbkRlc3Ryb3lcbiAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBhZGpvaW50O1xuXG4vKipcbiAqIENhbGN1bGF0ZXMgdGhlIGFkanVnYXRlIG9mIGEgbWF0NFxuICpcbiAqIEBwYXJhbSB7bWF0NH0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDR9IGEgdGhlIHNvdXJjZSBtYXRyaXhcbiAqIEByZXR1cm5zIHttYXQ0fSBvdXRcbiAqL1xuZnVuY3Rpb24gYWRqb2ludChvdXQsIGEpIHtcbiAgICB2YXIgYTAwID0gYVswXSwgYTAxID0gYVsxXSwgYTAyID0gYVsyXSwgYTAzID0gYVszXSxcbiAgICAgICAgYTEwID0gYVs0XSwgYTExID0gYVs1XSwgYTEyID0gYVs2XSwgYTEzID0gYVs3XSxcbiAgICAgICAgYTIwID0gYVs4XSwgYTIxID0gYVs5XSwgYTIyID0gYVsxMF0sIGEyMyA9IGFbMTFdLFxuICAgICAgICBhMzAgPSBhWzEyXSwgYTMxID0gYVsxM10sIGEzMiA9IGFbMTRdLCBhMzMgPSBhWzE1XTtcblxuICAgIG91dFswXSAgPSAgKGExMSAqIChhMjIgKiBhMzMgLSBhMjMgKiBhMzIpIC0gYTIxICogKGExMiAqIGEzMyAtIGExMyAqIGEzMikgKyBhMzEgKiAoYTEyICogYTIzIC0gYTEzICogYTIyKSk7XG4gICAgb3V0WzFdICA9IC0oYTAxICogKGEyMiAqIGEzMyAtIGEyMyAqIGEzMikgLSBhMjEgKiAoYTAyICogYTMzIC0gYTAzICogYTMyKSArIGEzMSAqIChhMDIgKiBhMjMgLSBhMDMgKiBhMjIpKTtcbiAgICBvdXRbMl0gID0gIChhMDEgKiAoYTEyICogYTMzIC0gYTEzICogYTMyKSAtIGExMSAqIChhMDIgKiBhMzMgLSBhMDMgKiBhMzIpICsgYTMxICogKGEwMiAqIGExMyAtIGEwMyAqIGExMikpO1xuICAgIG91dFszXSAgPSAtKGEwMSAqIChhMTIgKiBhMjMgLSBhMTMgKiBhMjIpIC0gYTExICogKGEwMiAqIGEyMyAtIGEwMyAqIGEyMikgKyBhMjEgKiAoYTAyICogYTEzIC0gYTAzICogYTEyKSk7XG4gICAgb3V0WzRdICA9IC0oYTEwICogKGEyMiAqIGEzMyAtIGEyMyAqIGEzMikgLSBhMjAgKiAoYTEyICogYTMzIC0gYTEzICogYTMyKSArIGEzMCAqIChhMTIgKiBhMjMgLSBhMTMgKiBhMjIpKTtcbiAgICBvdXRbNV0gID0gIChhMDAgKiAoYTIyICogYTMzIC0gYTIzICogYTMyKSAtIGEyMCAqIChhMDIgKiBhMzMgLSBhMDMgKiBhMzIpICsgYTMwICogKGEwMiAqIGEyMyAtIGEwMyAqIGEyMikpO1xuICAgIG91dFs2XSAgPSAtKGEwMCAqIChhMTIgKiBhMzMgLSBhMTMgKiBhMzIpIC0gYTEwICogKGEwMiAqIGEzMyAtIGEwMyAqIGEzMikgKyBhMzAgKiAoYTAyICogYTEzIC0gYTAzICogYTEyKSk7XG4gICAgb3V0WzddICA9ICAoYTAwICogKGExMiAqIGEyMyAtIGExMyAqIGEyMikgLSBhMTAgKiAoYTAyICogYTIzIC0gYTAzICogYTIyKSArIGEyMCAqIChhMDIgKiBhMTMgLSBhMDMgKiBhMTIpKTtcbiAgICBvdXRbOF0gID0gIChhMTAgKiAoYTIxICogYTMzIC0gYTIzICogYTMxKSAtIGEyMCAqIChhMTEgKiBhMzMgLSBhMTMgKiBhMzEpICsgYTMwICogKGExMSAqIGEyMyAtIGExMyAqIGEyMSkpO1xuICAgIG91dFs5XSAgPSAtKGEwMCAqIChhMjEgKiBhMzMgLSBhMjMgKiBhMzEpIC0gYTIwICogKGEwMSAqIGEzMyAtIGEwMyAqIGEzMSkgKyBhMzAgKiAoYTAxICogYTIzIC0gYTAzICogYTIxKSk7XG4gICAgb3V0WzEwXSA9ICAoYTAwICogKGExMSAqIGEzMyAtIGExMyAqIGEzMSkgLSBhMTAgKiAoYTAxICogYTMzIC0gYTAzICogYTMxKSArIGEzMCAqIChhMDEgKiBhMTMgLSBhMDMgKiBhMTEpKTtcbiAgICBvdXRbMTFdID0gLShhMDAgKiAoYTExICogYTIzIC0gYTEzICogYTIxKSAtIGExMCAqIChhMDEgKiBhMjMgLSBhMDMgKiBhMjEpICsgYTIwICogKGEwMSAqIGExMyAtIGEwMyAqIGExMSkpO1xuICAgIG91dFsxMl0gPSAtKGExMCAqIChhMjEgKiBhMzIgLSBhMjIgKiBhMzEpIC0gYTIwICogKGExMSAqIGEzMiAtIGExMiAqIGEzMSkgKyBhMzAgKiAoYTExICogYTIyIC0gYTEyICogYTIxKSk7XG4gICAgb3V0WzEzXSA9ICAoYTAwICogKGEyMSAqIGEzMiAtIGEyMiAqIGEzMSkgLSBhMjAgKiAoYTAxICogYTMyIC0gYTAyICogYTMxKSArIGEzMCAqIChhMDEgKiBhMjIgLSBhMDIgKiBhMjEpKTtcbiAgICBvdXRbMTRdID0gLShhMDAgKiAoYTExICogYTMyIC0gYTEyICogYTMxKSAtIGExMCAqIChhMDEgKiBhMzIgLSBhMDIgKiBhMzEpICsgYTMwICogKGEwMSAqIGExMiAtIGEwMiAqIGExMSkpO1xuICAgIG91dFsxNV0gPSAgKGEwMCAqIChhMTEgKiBhMjIgLSBhMTIgKiBhMjEpIC0gYTEwICogKGEwMSAqIGEyMiAtIGEwMiAqIGEyMSkgKyBhMjAgKiAoYTAxICogYTEyIC0gYTAyICogYTExKSk7XG4gICAgcmV0dXJuIG91dDtcbn07IiwibW9kdWxlLmV4cG9ydHMgPSBjbG9uZTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IG1hdDQgaW5pdGlhbGl6ZWQgd2l0aCB2YWx1ZXMgZnJvbSBhbiBleGlzdGluZyBtYXRyaXhcbiAqXG4gKiBAcGFyYW0ge21hdDR9IGEgbWF0cml4IHRvIGNsb25lXG4gKiBAcmV0dXJucyB7bWF0NH0gYSBuZXcgNHg0IG1hdHJpeFxuICovXG5mdW5jdGlvbiBjbG9uZShhKSB7XG4gICAgdmFyIG91dCA9IG5ldyBGbG9hdDMyQXJyYXkoMTYpO1xuICAgIG91dFswXSA9IGFbMF07XG4gICAgb3V0WzFdID0gYVsxXTtcbiAgICBvdXRbMl0gPSBhWzJdO1xuICAgIG91dFszXSA9IGFbM107XG4gICAgb3V0WzRdID0gYVs0XTtcbiAgICBvdXRbNV0gPSBhWzVdO1xuICAgIG91dFs2XSA9IGFbNl07XG4gICAgb3V0WzddID0gYVs3XTtcbiAgICBvdXRbOF0gPSBhWzhdO1xuICAgIG91dFs5XSA9IGFbOV07XG4gICAgb3V0WzEwXSA9IGFbMTBdO1xuICAgIG91dFsxMV0gPSBhWzExXTtcbiAgICBvdXRbMTJdID0gYVsxMl07XG4gICAgb3V0WzEzXSA9IGFbMTNdO1xuICAgIG91dFsxNF0gPSBhWzE0XTtcbiAgICBvdXRbMTVdID0gYVsxNV07XG4gICAgcmV0dXJuIG91dDtcbn07IiwibW9kdWxlLmV4cG9ydHMgPSBjb3B5O1xuXG4vKipcbiAqIENvcHkgdGhlIHZhbHVlcyBmcm9tIG9uZSBtYXQ0IHRvIGFub3RoZXJcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQ0fSBhIHRoZSBzb3VyY2UgbWF0cml4XG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbmZ1bmN0aW9uIGNvcHkob3V0LCBhKSB7XG4gICAgb3V0WzBdID0gYVswXTtcbiAgICBvdXRbMV0gPSBhWzFdO1xuICAgIG91dFsyXSA9IGFbMl07XG4gICAgb3V0WzNdID0gYVszXTtcbiAgICBvdXRbNF0gPSBhWzRdO1xuICAgIG91dFs1XSA9IGFbNV07XG4gICAgb3V0WzZdID0gYVs2XTtcbiAgICBvdXRbN10gPSBhWzddO1xuICAgIG91dFs4XSA9IGFbOF07XG4gICAgb3V0WzldID0gYVs5XTtcbiAgICBvdXRbMTBdID0gYVsxMF07XG4gICAgb3V0WzExXSA9IGFbMTFdO1xuICAgIG91dFsxMl0gPSBhWzEyXTtcbiAgICBvdXRbMTNdID0gYVsxM107XG4gICAgb3V0WzE0XSA9IGFbMTRdO1xuICAgIG91dFsxNV0gPSBhWzE1XTtcbiAgICByZXR1cm4gb3V0O1xufTsiLCJtb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IGlkZW50aXR5IG1hdDRcbiAqXG4gKiBAcmV0dXJucyB7bWF0NH0gYSBuZXcgNHg0IG1hdHJpeFxuICovXG5mdW5jdGlvbiBjcmVhdGUoKSB7XG4gICAgdmFyIG91dCA9IG5ldyBGbG9hdDMyQXJyYXkoMTYpO1xuICAgIG91dFswXSA9IDE7XG4gICAgb3V0WzFdID0gMDtcbiAgICBvdXRbMl0gPSAwO1xuICAgIG91dFszXSA9IDA7XG4gICAgb3V0WzRdID0gMDtcbiAgICBvdXRbNV0gPSAxO1xuICAgIG91dFs2XSA9IDA7XG4gICAgb3V0WzddID0gMDtcbiAgICBvdXRbOF0gPSAwO1xuICAgIG91dFs5XSA9IDA7XG4gICAgb3V0WzEwXSA9IDE7XG4gICAgb3V0WzExXSA9IDA7XG4gICAgb3V0WzEyXSA9IDA7XG4gICAgb3V0WzEzXSA9IDA7XG4gICAgb3V0WzE0XSA9IDA7XG4gICAgb3V0WzE1XSA9IDE7XG4gICAgcmV0dXJuIG91dDtcbn07IiwibW9kdWxlLmV4cG9ydHMgPSBkZXRlcm1pbmFudDtcblxuLyoqXG4gKiBDYWxjdWxhdGVzIHRoZSBkZXRlcm1pbmFudCBvZiBhIG1hdDRcbiAqXG4gKiBAcGFyYW0ge21hdDR9IGEgdGhlIHNvdXJjZSBtYXRyaXhcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IGRldGVybWluYW50IG9mIGFcbiAqL1xuZnVuY3Rpb24gZGV0ZXJtaW5hbnQoYSkge1xuICAgIHZhciBhMDAgPSBhWzBdLCBhMDEgPSBhWzFdLCBhMDIgPSBhWzJdLCBhMDMgPSBhWzNdLFxuICAgICAgICBhMTAgPSBhWzRdLCBhMTEgPSBhWzVdLCBhMTIgPSBhWzZdLCBhMTMgPSBhWzddLFxuICAgICAgICBhMjAgPSBhWzhdLCBhMjEgPSBhWzldLCBhMjIgPSBhWzEwXSwgYTIzID0gYVsxMV0sXG4gICAgICAgIGEzMCA9IGFbMTJdLCBhMzEgPSBhWzEzXSwgYTMyID0gYVsxNF0sIGEzMyA9IGFbMTVdLFxuXG4gICAgICAgIGIwMCA9IGEwMCAqIGExMSAtIGEwMSAqIGExMCxcbiAgICAgICAgYjAxID0gYTAwICogYTEyIC0gYTAyICogYTEwLFxuICAgICAgICBiMDIgPSBhMDAgKiBhMTMgLSBhMDMgKiBhMTAsXG4gICAgICAgIGIwMyA9IGEwMSAqIGExMiAtIGEwMiAqIGExMSxcbiAgICAgICAgYjA0ID0gYTAxICogYTEzIC0gYTAzICogYTExLFxuICAgICAgICBiMDUgPSBhMDIgKiBhMTMgLSBhMDMgKiBhMTIsXG4gICAgICAgIGIwNiA9IGEyMCAqIGEzMSAtIGEyMSAqIGEzMCxcbiAgICAgICAgYjA3ID0gYTIwICogYTMyIC0gYTIyICogYTMwLFxuICAgICAgICBiMDggPSBhMjAgKiBhMzMgLSBhMjMgKiBhMzAsXG4gICAgICAgIGIwOSA9IGEyMSAqIGEzMiAtIGEyMiAqIGEzMSxcbiAgICAgICAgYjEwID0gYTIxICogYTMzIC0gYTIzICogYTMxLFxuICAgICAgICBiMTEgPSBhMjIgKiBhMzMgLSBhMjMgKiBhMzI7XG5cbiAgICAvLyBDYWxjdWxhdGUgdGhlIGRldGVybWluYW50XG4gICAgcmV0dXJuIGIwMCAqIGIxMSAtIGIwMSAqIGIxMCArIGIwMiAqIGIwOSArIGIwMyAqIGIwOCAtIGIwNCAqIGIwNyArIGIwNSAqIGIwNjtcbn07IiwibW9kdWxlLmV4cG9ydHMgPSBmcm9tUXVhdDtcblxuLyoqXG4gKiBDcmVhdGVzIGEgbWF0cml4IGZyb20gYSBxdWF0ZXJuaW9uIHJvdGF0aW9uLlxuICpcbiAqIEBwYXJhbSB7bWF0NH0gb3V0IG1hdDQgcmVjZWl2aW5nIG9wZXJhdGlvbiByZXN1bHRcbiAqIEBwYXJhbSB7cXVhdDR9IHEgUm90YXRpb24gcXVhdGVybmlvblxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5mdW5jdGlvbiBmcm9tUXVhdChvdXQsIHEpIHtcbiAgICB2YXIgeCA9IHFbMF0sIHkgPSBxWzFdLCB6ID0gcVsyXSwgdyA9IHFbM10sXG4gICAgICAgIHgyID0geCArIHgsXG4gICAgICAgIHkyID0geSArIHksXG4gICAgICAgIHoyID0geiArIHosXG5cbiAgICAgICAgeHggPSB4ICogeDIsXG4gICAgICAgIHl4ID0geSAqIHgyLFxuICAgICAgICB5eSA9IHkgKiB5MixcbiAgICAgICAgenggPSB6ICogeDIsXG4gICAgICAgIHp5ID0geiAqIHkyLFxuICAgICAgICB6eiA9IHogKiB6MixcbiAgICAgICAgd3ggPSB3ICogeDIsXG4gICAgICAgIHd5ID0gdyAqIHkyLFxuICAgICAgICB3eiA9IHcgKiB6MjtcblxuICAgIG91dFswXSA9IDEgLSB5eSAtIHp6O1xuICAgIG91dFsxXSA9IHl4ICsgd3o7XG4gICAgb3V0WzJdID0genggLSB3eTtcbiAgICBvdXRbM10gPSAwO1xuXG4gICAgb3V0WzRdID0geXggLSB3ejtcbiAgICBvdXRbNV0gPSAxIC0geHggLSB6ejtcbiAgICBvdXRbNl0gPSB6eSArIHd4O1xuICAgIG91dFs3XSA9IDA7XG5cbiAgICBvdXRbOF0gPSB6eCArIHd5O1xuICAgIG91dFs5XSA9IHp5IC0gd3g7XG4gICAgb3V0WzEwXSA9IDEgLSB4eCAtIHl5O1xuICAgIG91dFsxMV0gPSAwO1xuXG4gICAgb3V0WzEyXSA9IDA7XG4gICAgb3V0WzEzXSA9IDA7XG4gICAgb3V0WzE0XSA9IDA7XG4gICAgb3V0WzE1XSA9IDE7XG5cbiAgICByZXR1cm4gb3V0O1xufTsiLCJtb2R1bGUuZXhwb3J0cyA9IGZyb21Sb3RhdGlvblRyYW5zbGF0aW9uO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBtYXRyaXggZnJvbSBhIHF1YXRlcm5pb24gcm90YXRpb24gYW5kIHZlY3RvciB0cmFuc2xhdGlvblxuICogVGhpcyBpcyBlcXVpdmFsZW50IHRvIChidXQgbXVjaCBmYXN0ZXIgdGhhbik6XG4gKlxuICogICAgIG1hdDQuaWRlbnRpdHkoZGVzdCk7XG4gKiAgICAgbWF0NC50cmFuc2xhdGUoZGVzdCwgdmVjKTtcbiAqICAgICB2YXIgcXVhdE1hdCA9IG1hdDQuY3JlYXRlKCk7XG4gKiAgICAgcXVhdDQudG9NYXQ0KHF1YXQsIHF1YXRNYXQpO1xuICogICAgIG1hdDQubXVsdGlwbHkoZGVzdCwgcXVhdE1hdCk7XG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgbWF0NCByZWNlaXZpbmcgb3BlcmF0aW9uIHJlc3VsdFxuICogQHBhcmFtIHtxdWF0NH0gcSBSb3RhdGlvbiBxdWF0ZXJuaW9uXG4gKiBAcGFyYW0ge3ZlYzN9IHYgVHJhbnNsYXRpb24gdmVjdG9yXG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbmZ1bmN0aW9uIGZyb21Sb3RhdGlvblRyYW5zbGF0aW9uKG91dCwgcSwgdikge1xuICAgIC8vIFF1YXRlcm5pb24gbWF0aFxuICAgIHZhciB4ID0gcVswXSwgeSA9IHFbMV0sIHogPSBxWzJdLCB3ID0gcVszXSxcbiAgICAgICAgeDIgPSB4ICsgeCxcbiAgICAgICAgeTIgPSB5ICsgeSxcbiAgICAgICAgejIgPSB6ICsgeixcblxuICAgICAgICB4eCA9IHggKiB4MixcbiAgICAgICAgeHkgPSB4ICogeTIsXG4gICAgICAgIHh6ID0geCAqIHoyLFxuICAgICAgICB5eSA9IHkgKiB5MixcbiAgICAgICAgeXogPSB5ICogejIsXG4gICAgICAgIHp6ID0geiAqIHoyLFxuICAgICAgICB3eCA9IHcgKiB4MixcbiAgICAgICAgd3kgPSB3ICogeTIsXG4gICAgICAgIHd6ID0gdyAqIHoyO1xuXG4gICAgb3V0WzBdID0gMSAtICh5eSArIHp6KTtcbiAgICBvdXRbMV0gPSB4eSArIHd6O1xuICAgIG91dFsyXSA9IHh6IC0gd3k7XG4gICAgb3V0WzNdID0gMDtcbiAgICBvdXRbNF0gPSB4eSAtIHd6O1xuICAgIG91dFs1XSA9IDEgLSAoeHggKyB6eik7XG4gICAgb3V0WzZdID0geXogKyB3eDtcbiAgICBvdXRbN10gPSAwO1xuICAgIG91dFs4XSA9IHh6ICsgd3k7XG4gICAgb3V0WzldID0geXogLSB3eDtcbiAgICBvdXRbMTBdID0gMSAtICh4eCArIHl5KTtcbiAgICBvdXRbMTFdID0gMDtcbiAgICBvdXRbMTJdID0gdlswXTtcbiAgICBvdXRbMTNdID0gdlsxXTtcbiAgICBvdXRbMTRdID0gdlsyXTtcbiAgICBvdXRbMTVdID0gMTtcbiAgICBcbiAgICByZXR1cm4gb3V0O1xufTsiLCJtb2R1bGUuZXhwb3J0cyA9IGZydXN0dW07XG5cbi8qKlxuICogR2VuZXJhdGVzIGEgZnJ1c3R1bSBtYXRyaXggd2l0aCB0aGUgZ2l2ZW4gYm91bmRzXG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgbWF0NCBmcnVzdHVtIG1hdHJpeCB3aWxsIGJlIHdyaXR0ZW4gaW50b1xuICogQHBhcmFtIHtOdW1iZXJ9IGxlZnQgTGVmdCBib3VuZCBvZiB0aGUgZnJ1c3R1bVxuICogQHBhcmFtIHtOdW1iZXJ9IHJpZ2h0IFJpZ2h0IGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcGFyYW0ge051bWJlcn0gYm90dG9tIEJvdHRvbSBib3VuZCBvZiB0aGUgZnJ1c3R1bVxuICogQHBhcmFtIHtOdW1iZXJ9IHRvcCBUb3AgYm91bmQgb2YgdGhlIGZydXN0dW1cbiAqIEBwYXJhbSB7TnVtYmVyfSBuZWFyIE5lYXIgYm91bmQgb2YgdGhlIGZydXN0dW1cbiAqIEBwYXJhbSB7TnVtYmVyfSBmYXIgRmFyIGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbmZ1bmN0aW9uIGZydXN0dW0ob3V0LCBsZWZ0LCByaWdodCwgYm90dG9tLCB0b3AsIG5lYXIsIGZhcikge1xuICAgIHZhciBybCA9IDEgLyAocmlnaHQgLSBsZWZ0KSxcbiAgICAgICAgdGIgPSAxIC8gKHRvcCAtIGJvdHRvbSksXG4gICAgICAgIG5mID0gMSAvIChuZWFyIC0gZmFyKTtcbiAgICBvdXRbMF0gPSAobmVhciAqIDIpICogcmw7XG4gICAgb3V0WzFdID0gMDtcbiAgICBvdXRbMl0gPSAwO1xuICAgIG91dFszXSA9IDA7XG4gICAgb3V0WzRdID0gMDtcbiAgICBvdXRbNV0gPSAobmVhciAqIDIpICogdGI7XG4gICAgb3V0WzZdID0gMDtcbiAgICBvdXRbN10gPSAwO1xuICAgIG91dFs4XSA9IChyaWdodCArIGxlZnQpICogcmw7XG4gICAgb3V0WzldID0gKHRvcCArIGJvdHRvbSkgKiB0YjtcbiAgICBvdXRbMTBdID0gKGZhciArIG5lYXIpICogbmY7XG4gICAgb3V0WzExXSA9IC0xO1xuICAgIG91dFsxMl0gPSAwO1xuICAgIG91dFsxM10gPSAwO1xuICAgIG91dFsxNF0gPSAoZmFyICogbmVhciAqIDIpICogbmY7XG4gICAgb3V0WzE1XSA9IDA7XG4gICAgcmV0dXJuIG91dDtcbn07IiwibW9kdWxlLmV4cG9ydHMgPSBpZGVudGl0eTtcblxuLyoqXG4gKiBTZXQgYSBtYXQ0IHRvIHRoZSBpZGVudGl0eSBtYXRyaXhcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5mdW5jdGlvbiBpZGVudGl0eShvdXQpIHtcbiAgICBvdXRbMF0gPSAxO1xuICAgIG91dFsxXSA9IDA7XG4gICAgb3V0WzJdID0gMDtcbiAgICBvdXRbM10gPSAwO1xuICAgIG91dFs0XSA9IDA7XG4gICAgb3V0WzVdID0gMTtcbiAgICBvdXRbNl0gPSAwO1xuICAgIG91dFs3XSA9IDA7XG4gICAgb3V0WzhdID0gMDtcbiAgICBvdXRbOV0gPSAwO1xuICAgIG91dFsxMF0gPSAxO1xuICAgIG91dFsxMV0gPSAwO1xuICAgIG91dFsxMl0gPSAwO1xuICAgIG91dFsxM10gPSAwO1xuICAgIG91dFsxNF0gPSAwO1xuICAgIG91dFsxNV0gPSAxO1xuICAgIHJldHVybiBvdXQ7XG59OyIsIm1vZHVsZS5leHBvcnRzID0ge1xuICBjcmVhdGU6IHJlcXVpcmUoJy4vY3JlYXRlJylcbiAgLCBjbG9uZTogcmVxdWlyZSgnLi9jbG9uZScpXG4gICwgY29weTogcmVxdWlyZSgnLi9jb3B5JylcbiAgLCBpZGVudGl0eTogcmVxdWlyZSgnLi9pZGVudGl0eScpXG4gICwgdHJhbnNwb3NlOiByZXF1aXJlKCcuL3RyYW5zcG9zZScpXG4gICwgaW52ZXJ0OiByZXF1aXJlKCcuL2ludmVydCcpXG4gICwgYWRqb2ludDogcmVxdWlyZSgnLi9hZGpvaW50JylcbiAgLCBkZXRlcm1pbmFudDogcmVxdWlyZSgnLi9kZXRlcm1pbmFudCcpXG4gICwgbXVsdGlwbHk6IHJlcXVpcmUoJy4vbXVsdGlwbHknKVxuICAsIHRyYW5zbGF0ZTogcmVxdWlyZSgnLi90cmFuc2xhdGUnKVxuICAsIHNjYWxlOiByZXF1aXJlKCcuL3NjYWxlJylcbiAgLCByb3RhdGU6IHJlcXVpcmUoJy4vcm90YXRlJylcbiAgLCByb3RhdGVYOiByZXF1aXJlKCcuL3JvdGF0ZVgnKVxuICAsIHJvdGF0ZVk6IHJlcXVpcmUoJy4vcm90YXRlWScpXG4gICwgcm90YXRlWjogcmVxdWlyZSgnLi9yb3RhdGVaJylcbiAgLCBmcm9tUm90YXRpb25UcmFuc2xhdGlvbjogcmVxdWlyZSgnLi9mcm9tUm90YXRpb25UcmFuc2xhdGlvbicpXG4gICwgZnJvbVF1YXQ6IHJlcXVpcmUoJy4vZnJvbVF1YXQnKVxuICAsIGZydXN0dW06IHJlcXVpcmUoJy4vZnJ1c3R1bScpXG4gICwgcGVyc3BlY3RpdmU6IHJlcXVpcmUoJy4vcGVyc3BlY3RpdmUnKVxuICAsIHBlcnNwZWN0aXZlRnJvbUZpZWxkT2ZWaWV3OiByZXF1aXJlKCcuL3BlcnNwZWN0aXZlRnJvbUZpZWxkT2ZWaWV3JylcbiAgLCBvcnRobzogcmVxdWlyZSgnLi9vcnRobycpXG4gICwgbG9va0F0OiByZXF1aXJlKCcuL2xvb2tBdCcpXG4gICwgc3RyOiByZXF1aXJlKCcuL3N0cicpXG59IiwibW9kdWxlLmV4cG9ydHMgPSBpbnZlcnQ7XG5cbi8qKlxuICogSW52ZXJ0cyBhIG1hdDRcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQ0fSBhIHRoZSBzb3VyY2UgbWF0cml4XG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbmZ1bmN0aW9uIGludmVydChvdXQsIGEpIHtcbiAgICB2YXIgYTAwID0gYVswXSwgYTAxID0gYVsxXSwgYTAyID0gYVsyXSwgYTAzID0gYVszXSxcbiAgICAgICAgYTEwID0gYVs0XSwgYTExID0gYVs1XSwgYTEyID0gYVs2XSwgYTEzID0gYVs3XSxcbiAgICAgICAgYTIwID0gYVs4XSwgYTIxID0gYVs5XSwgYTIyID0gYVsxMF0sIGEyMyA9IGFbMTFdLFxuICAgICAgICBhMzAgPSBhWzEyXSwgYTMxID0gYVsxM10sIGEzMiA9IGFbMTRdLCBhMzMgPSBhWzE1XSxcblxuICAgICAgICBiMDAgPSBhMDAgKiBhMTEgLSBhMDEgKiBhMTAsXG4gICAgICAgIGIwMSA9IGEwMCAqIGExMiAtIGEwMiAqIGExMCxcbiAgICAgICAgYjAyID0gYTAwICogYTEzIC0gYTAzICogYTEwLFxuICAgICAgICBiMDMgPSBhMDEgKiBhMTIgLSBhMDIgKiBhMTEsXG4gICAgICAgIGIwNCA9IGEwMSAqIGExMyAtIGEwMyAqIGExMSxcbiAgICAgICAgYjA1ID0gYTAyICogYTEzIC0gYTAzICogYTEyLFxuICAgICAgICBiMDYgPSBhMjAgKiBhMzEgLSBhMjEgKiBhMzAsXG4gICAgICAgIGIwNyA9IGEyMCAqIGEzMiAtIGEyMiAqIGEzMCxcbiAgICAgICAgYjA4ID0gYTIwICogYTMzIC0gYTIzICogYTMwLFxuICAgICAgICBiMDkgPSBhMjEgKiBhMzIgLSBhMjIgKiBhMzEsXG4gICAgICAgIGIxMCA9IGEyMSAqIGEzMyAtIGEyMyAqIGEzMSxcbiAgICAgICAgYjExID0gYTIyICogYTMzIC0gYTIzICogYTMyLFxuXG4gICAgICAgIC8vIENhbGN1bGF0ZSB0aGUgZGV0ZXJtaW5hbnRcbiAgICAgICAgZGV0ID0gYjAwICogYjExIC0gYjAxICogYjEwICsgYjAyICogYjA5ICsgYjAzICogYjA4IC0gYjA0ICogYjA3ICsgYjA1ICogYjA2O1xuXG4gICAgaWYgKCFkZXQpIHsgXG4gICAgICAgIHJldHVybiBudWxsOyBcbiAgICB9XG4gICAgZGV0ID0gMS4wIC8gZGV0O1xuXG4gICAgb3V0WzBdID0gKGExMSAqIGIxMSAtIGExMiAqIGIxMCArIGExMyAqIGIwOSkgKiBkZXQ7XG4gICAgb3V0WzFdID0gKGEwMiAqIGIxMCAtIGEwMSAqIGIxMSAtIGEwMyAqIGIwOSkgKiBkZXQ7XG4gICAgb3V0WzJdID0gKGEzMSAqIGIwNSAtIGEzMiAqIGIwNCArIGEzMyAqIGIwMykgKiBkZXQ7XG4gICAgb3V0WzNdID0gKGEyMiAqIGIwNCAtIGEyMSAqIGIwNSAtIGEyMyAqIGIwMykgKiBkZXQ7XG4gICAgb3V0WzRdID0gKGExMiAqIGIwOCAtIGExMCAqIGIxMSAtIGExMyAqIGIwNykgKiBkZXQ7XG4gICAgb3V0WzVdID0gKGEwMCAqIGIxMSAtIGEwMiAqIGIwOCArIGEwMyAqIGIwNykgKiBkZXQ7XG4gICAgb3V0WzZdID0gKGEzMiAqIGIwMiAtIGEzMCAqIGIwNSAtIGEzMyAqIGIwMSkgKiBkZXQ7XG4gICAgb3V0WzddID0gKGEyMCAqIGIwNSAtIGEyMiAqIGIwMiArIGEyMyAqIGIwMSkgKiBkZXQ7XG4gICAgb3V0WzhdID0gKGExMCAqIGIxMCAtIGExMSAqIGIwOCArIGExMyAqIGIwNikgKiBkZXQ7XG4gICAgb3V0WzldID0gKGEwMSAqIGIwOCAtIGEwMCAqIGIxMCAtIGEwMyAqIGIwNikgKiBkZXQ7XG4gICAgb3V0WzEwXSA9IChhMzAgKiBiMDQgLSBhMzEgKiBiMDIgKyBhMzMgKiBiMDApICogZGV0O1xuICAgIG91dFsxMV0gPSAoYTIxICogYjAyIC0gYTIwICogYjA0IC0gYTIzICogYjAwKSAqIGRldDtcbiAgICBvdXRbMTJdID0gKGExMSAqIGIwNyAtIGExMCAqIGIwOSAtIGExMiAqIGIwNikgKiBkZXQ7XG4gICAgb3V0WzEzXSA9IChhMDAgKiBiMDkgLSBhMDEgKiBiMDcgKyBhMDIgKiBiMDYpICogZGV0O1xuICAgIG91dFsxNF0gPSAoYTMxICogYjAxIC0gYTMwICogYjAzIC0gYTMyICogYjAwKSAqIGRldDtcbiAgICBvdXRbMTVdID0gKGEyMCAqIGIwMyAtIGEyMSAqIGIwMSArIGEyMiAqIGIwMCkgKiBkZXQ7XG5cbiAgICByZXR1cm4gb3V0O1xufTsiLCJ2YXIgaWRlbnRpdHkgPSByZXF1aXJlKCcuL2lkZW50aXR5Jyk7XG5cbm1vZHVsZS5leHBvcnRzID0gbG9va0F0O1xuXG4vKipcbiAqIEdlbmVyYXRlcyBhIGxvb2stYXQgbWF0cml4IHdpdGggdGhlIGdpdmVuIGV5ZSBwb3NpdGlvbiwgZm9jYWwgcG9pbnQsIGFuZCB1cCBheGlzXG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgbWF0NCBmcnVzdHVtIG1hdHJpeCB3aWxsIGJlIHdyaXR0ZW4gaW50b1xuICogQHBhcmFtIHt2ZWMzfSBleWUgUG9zaXRpb24gb2YgdGhlIHZpZXdlclxuICogQHBhcmFtIHt2ZWMzfSBjZW50ZXIgUG9pbnQgdGhlIHZpZXdlciBpcyBsb29raW5nIGF0XG4gKiBAcGFyYW0ge3ZlYzN9IHVwIHZlYzMgcG9pbnRpbmcgdXBcbiAqIEByZXR1cm5zIHttYXQ0fSBvdXRcbiAqL1xuZnVuY3Rpb24gbG9va0F0KG91dCwgZXllLCBjZW50ZXIsIHVwKSB7XG4gICAgdmFyIHgwLCB4MSwgeDIsIHkwLCB5MSwgeTIsIHowLCB6MSwgejIsIGxlbixcbiAgICAgICAgZXlleCA9IGV5ZVswXSxcbiAgICAgICAgZXlleSA9IGV5ZVsxXSxcbiAgICAgICAgZXlleiA9IGV5ZVsyXSxcbiAgICAgICAgdXB4ID0gdXBbMF0sXG4gICAgICAgIHVweSA9IHVwWzFdLFxuICAgICAgICB1cHogPSB1cFsyXSxcbiAgICAgICAgY2VudGVyeCA9IGNlbnRlclswXSxcbiAgICAgICAgY2VudGVyeSA9IGNlbnRlclsxXSxcbiAgICAgICAgY2VudGVyeiA9IGNlbnRlclsyXTtcblxuICAgIGlmIChNYXRoLmFicyhleWV4IC0gY2VudGVyeCkgPCAwLjAwMDAwMSAmJlxuICAgICAgICBNYXRoLmFicyhleWV5IC0gY2VudGVyeSkgPCAwLjAwMDAwMSAmJlxuICAgICAgICBNYXRoLmFicyhleWV6IC0gY2VudGVyeikgPCAwLjAwMDAwMSkge1xuICAgICAgICByZXR1cm4gaWRlbnRpdHkob3V0KTtcbiAgICB9XG5cbiAgICB6MCA9IGV5ZXggLSBjZW50ZXJ4O1xuICAgIHoxID0gZXlleSAtIGNlbnRlcnk7XG4gICAgejIgPSBleWV6IC0gY2VudGVyejtcblxuICAgIGxlbiA9IDEgLyBNYXRoLnNxcnQoejAgKiB6MCArIHoxICogejEgKyB6MiAqIHoyKTtcbiAgICB6MCAqPSBsZW47XG4gICAgejEgKj0gbGVuO1xuICAgIHoyICo9IGxlbjtcblxuICAgIHgwID0gdXB5ICogejIgLSB1cHogKiB6MTtcbiAgICB4MSA9IHVweiAqIHowIC0gdXB4ICogejI7XG4gICAgeDIgPSB1cHggKiB6MSAtIHVweSAqIHowO1xuICAgIGxlbiA9IE1hdGguc3FydCh4MCAqIHgwICsgeDEgKiB4MSArIHgyICogeDIpO1xuICAgIGlmICghbGVuKSB7XG4gICAgICAgIHgwID0gMDtcbiAgICAgICAgeDEgPSAwO1xuICAgICAgICB4MiA9IDA7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgbGVuID0gMSAvIGxlbjtcbiAgICAgICAgeDAgKj0gbGVuO1xuICAgICAgICB4MSAqPSBsZW47XG4gICAgICAgIHgyICo9IGxlbjtcbiAgICB9XG5cbiAgICB5MCA9IHoxICogeDIgLSB6MiAqIHgxO1xuICAgIHkxID0gejIgKiB4MCAtIHowICogeDI7XG4gICAgeTIgPSB6MCAqIHgxIC0gejEgKiB4MDtcblxuICAgIGxlbiA9IE1hdGguc3FydCh5MCAqIHkwICsgeTEgKiB5MSArIHkyICogeTIpO1xuICAgIGlmICghbGVuKSB7XG4gICAgICAgIHkwID0gMDtcbiAgICAgICAgeTEgPSAwO1xuICAgICAgICB5MiA9IDA7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgbGVuID0gMSAvIGxlbjtcbiAgICAgICAgeTAgKj0gbGVuO1xuICAgICAgICB5MSAqPSBsZW47XG4gICAgICAgIHkyICo9IGxlbjtcbiAgICB9XG5cbiAgICBvdXRbMF0gPSB4MDtcbiAgICBvdXRbMV0gPSB5MDtcbiAgICBvdXRbMl0gPSB6MDtcbiAgICBvdXRbM10gPSAwO1xuICAgIG91dFs0XSA9IHgxO1xuICAgIG91dFs1XSA9IHkxO1xuICAgIG91dFs2XSA9IHoxO1xuICAgIG91dFs3XSA9IDA7XG4gICAgb3V0WzhdID0geDI7XG4gICAgb3V0WzldID0geTI7XG4gICAgb3V0WzEwXSA9IHoyO1xuICAgIG91dFsxMV0gPSAwO1xuICAgIG91dFsxMl0gPSAtKHgwICogZXlleCArIHgxICogZXlleSArIHgyICogZXlleik7XG4gICAgb3V0WzEzXSA9IC0oeTAgKiBleWV4ICsgeTEgKiBleWV5ICsgeTIgKiBleWV6KTtcbiAgICBvdXRbMTRdID0gLSh6MCAqIGV5ZXggKyB6MSAqIGV5ZXkgKyB6MiAqIGV5ZXopO1xuICAgIG91dFsxNV0gPSAxO1xuXG4gICAgcmV0dXJuIG91dDtcbn07IiwibW9kdWxlLmV4cG9ydHMgPSBtdWx0aXBseTtcblxuLyoqXG4gKiBNdWx0aXBsaWVzIHR3byBtYXQ0J3NcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQ0fSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge21hdDR9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbmZ1bmN0aW9uIG11bHRpcGx5KG91dCwgYSwgYikge1xuICAgIHZhciBhMDAgPSBhWzBdLCBhMDEgPSBhWzFdLCBhMDIgPSBhWzJdLCBhMDMgPSBhWzNdLFxuICAgICAgICBhMTAgPSBhWzRdLCBhMTEgPSBhWzVdLCBhMTIgPSBhWzZdLCBhMTMgPSBhWzddLFxuICAgICAgICBhMjAgPSBhWzhdLCBhMjEgPSBhWzldLCBhMjIgPSBhWzEwXSwgYTIzID0gYVsxMV0sXG4gICAgICAgIGEzMCA9IGFbMTJdLCBhMzEgPSBhWzEzXSwgYTMyID0gYVsxNF0sIGEzMyA9IGFbMTVdO1xuXG4gICAgLy8gQ2FjaGUgb25seSB0aGUgY3VycmVudCBsaW5lIG9mIHRoZSBzZWNvbmQgbWF0cml4XG4gICAgdmFyIGIwICA9IGJbMF0sIGIxID0gYlsxXSwgYjIgPSBiWzJdLCBiMyA9IGJbM107ICBcbiAgICBvdXRbMF0gPSBiMCphMDAgKyBiMSphMTAgKyBiMiphMjAgKyBiMyphMzA7XG4gICAgb3V0WzFdID0gYjAqYTAxICsgYjEqYTExICsgYjIqYTIxICsgYjMqYTMxO1xuICAgIG91dFsyXSA9IGIwKmEwMiArIGIxKmExMiArIGIyKmEyMiArIGIzKmEzMjtcbiAgICBvdXRbM10gPSBiMCphMDMgKyBiMSphMTMgKyBiMiphMjMgKyBiMyphMzM7XG5cbiAgICBiMCA9IGJbNF07IGIxID0gYls1XTsgYjIgPSBiWzZdOyBiMyA9IGJbN107XG4gICAgb3V0WzRdID0gYjAqYTAwICsgYjEqYTEwICsgYjIqYTIwICsgYjMqYTMwO1xuICAgIG91dFs1XSA9IGIwKmEwMSArIGIxKmExMSArIGIyKmEyMSArIGIzKmEzMTtcbiAgICBvdXRbNl0gPSBiMCphMDIgKyBiMSphMTIgKyBiMiphMjIgKyBiMyphMzI7XG4gICAgb3V0WzddID0gYjAqYTAzICsgYjEqYTEzICsgYjIqYTIzICsgYjMqYTMzO1xuXG4gICAgYjAgPSBiWzhdOyBiMSA9IGJbOV07IGIyID0gYlsxMF07IGIzID0gYlsxMV07XG4gICAgb3V0WzhdID0gYjAqYTAwICsgYjEqYTEwICsgYjIqYTIwICsgYjMqYTMwO1xuICAgIG91dFs5XSA9IGIwKmEwMSArIGIxKmExMSArIGIyKmEyMSArIGIzKmEzMTtcbiAgICBvdXRbMTBdID0gYjAqYTAyICsgYjEqYTEyICsgYjIqYTIyICsgYjMqYTMyO1xuICAgIG91dFsxMV0gPSBiMCphMDMgKyBiMSphMTMgKyBiMiphMjMgKyBiMyphMzM7XG5cbiAgICBiMCA9IGJbMTJdOyBiMSA9IGJbMTNdOyBiMiA9IGJbMTRdOyBiMyA9IGJbMTVdO1xuICAgIG91dFsxMl0gPSBiMCphMDAgKyBiMSphMTAgKyBiMiphMjAgKyBiMyphMzA7XG4gICAgb3V0WzEzXSA9IGIwKmEwMSArIGIxKmExMSArIGIyKmEyMSArIGIzKmEzMTtcbiAgICBvdXRbMTRdID0gYjAqYTAyICsgYjEqYTEyICsgYjIqYTIyICsgYjMqYTMyO1xuICAgIG91dFsxNV0gPSBiMCphMDMgKyBiMSphMTMgKyBiMiphMjMgKyBiMyphMzM7XG4gICAgcmV0dXJuIG91dDtcbn07IiwibW9kdWxlLmV4cG9ydHMgPSBvcnRobztcblxuLyoqXG4gKiBHZW5lcmF0ZXMgYSBvcnRob2dvbmFsIHByb2plY3Rpb24gbWF0cml4IHdpdGggdGhlIGdpdmVuIGJvdW5kc1xuICpcbiAqIEBwYXJhbSB7bWF0NH0gb3V0IG1hdDQgZnJ1c3R1bSBtYXRyaXggd2lsbCBiZSB3cml0dGVuIGludG9cbiAqIEBwYXJhbSB7bnVtYmVyfSBsZWZ0IExlZnQgYm91bmQgb2YgdGhlIGZydXN0dW1cbiAqIEBwYXJhbSB7bnVtYmVyfSByaWdodCBSaWdodCBib3VuZCBvZiB0aGUgZnJ1c3R1bVxuICogQHBhcmFtIHtudW1iZXJ9IGJvdHRvbSBCb3R0b20gYm91bmQgb2YgdGhlIGZydXN0dW1cbiAqIEBwYXJhbSB7bnVtYmVyfSB0b3AgVG9wIGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcGFyYW0ge251bWJlcn0gbmVhciBOZWFyIGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcGFyYW0ge251bWJlcn0gZmFyIEZhciBib3VuZCBvZiB0aGUgZnJ1c3R1bVxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5mdW5jdGlvbiBvcnRobyhvdXQsIGxlZnQsIHJpZ2h0LCBib3R0b20sIHRvcCwgbmVhciwgZmFyKSB7XG4gICAgdmFyIGxyID0gMSAvIChsZWZ0IC0gcmlnaHQpLFxuICAgICAgICBidCA9IDEgLyAoYm90dG9tIC0gdG9wKSxcbiAgICAgICAgbmYgPSAxIC8gKG5lYXIgLSBmYXIpO1xuICAgIG91dFswXSA9IC0yICogbHI7XG4gICAgb3V0WzFdID0gMDtcbiAgICBvdXRbMl0gPSAwO1xuICAgIG91dFszXSA9IDA7XG4gICAgb3V0WzRdID0gMDtcbiAgICBvdXRbNV0gPSAtMiAqIGJ0O1xuICAgIG91dFs2XSA9IDA7XG4gICAgb3V0WzddID0gMDtcbiAgICBvdXRbOF0gPSAwO1xuICAgIG91dFs5XSA9IDA7XG4gICAgb3V0WzEwXSA9IDIgKiBuZjtcbiAgICBvdXRbMTFdID0gMDtcbiAgICBvdXRbMTJdID0gKGxlZnQgKyByaWdodCkgKiBscjtcbiAgICBvdXRbMTNdID0gKHRvcCArIGJvdHRvbSkgKiBidDtcbiAgICBvdXRbMTRdID0gKGZhciArIG5lYXIpICogbmY7XG4gICAgb3V0WzE1XSA9IDE7XG4gICAgcmV0dXJuIG91dDtcbn07IiwibW9kdWxlLmV4cG9ydHMgPSBwZXJzcGVjdGl2ZTtcblxuLyoqXG4gKiBHZW5lcmF0ZXMgYSBwZXJzcGVjdGl2ZSBwcm9qZWN0aW9uIG1hdHJpeCB3aXRoIHRoZSBnaXZlbiBib3VuZHNcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCBtYXQ0IGZydXN0dW0gbWF0cml4IHdpbGwgYmUgd3JpdHRlbiBpbnRvXG4gKiBAcGFyYW0ge251bWJlcn0gZm92eSBWZXJ0aWNhbCBmaWVsZCBvZiB2aWV3IGluIHJhZGlhbnNcbiAqIEBwYXJhbSB7bnVtYmVyfSBhc3BlY3QgQXNwZWN0IHJhdGlvLiB0eXBpY2FsbHkgdmlld3BvcnQgd2lkdGgvaGVpZ2h0XG4gKiBAcGFyYW0ge251bWJlcn0gbmVhciBOZWFyIGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcGFyYW0ge251bWJlcn0gZmFyIEZhciBib3VuZCBvZiB0aGUgZnJ1c3R1bVxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5mdW5jdGlvbiBwZXJzcGVjdGl2ZShvdXQsIGZvdnksIGFzcGVjdCwgbmVhciwgZmFyKSB7XG4gICAgdmFyIGYgPSAxLjAgLyBNYXRoLnRhbihmb3Z5IC8gMiksXG4gICAgICAgIG5mID0gMSAvIChuZWFyIC0gZmFyKTtcbiAgICBvdXRbMF0gPSBmIC8gYXNwZWN0O1xuICAgIG91dFsxXSA9IDA7XG4gICAgb3V0WzJdID0gMDtcbiAgICBvdXRbM10gPSAwO1xuICAgIG91dFs0XSA9IDA7XG4gICAgb3V0WzVdID0gZjtcbiAgICBvdXRbNl0gPSAwO1xuICAgIG91dFs3XSA9IDA7XG4gICAgb3V0WzhdID0gMDtcbiAgICBvdXRbOV0gPSAwO1xuICAgIG91dFsxMF0gPSAoZmFyICsgbmVhcikgKiBuZjtcbiAgICBvdXRbMTFdID0gLTE7XG4gICAgb3V0WzEyXSA9IDA7XG4gICAgb3V0WzEzXSA9IDA7XG4gICAgb3V0WzE0XSA9ICgyICogZmFyICogbmVhcikgKiBuZjtcbiAgICBvdXRbMTVdID0gMDtcbiAgICByZXR1cm4gb3V0O1xufTsiLCJtb2R1bGUuZXhwb3J0cyA9IHBlcnNwZWN0aXZlRnJvbUZpZWxkT2ZWaWV3O1xuXG4vKipcbiAqIEdlbmVyYXRlcyBhIHBlcnNwZWN0aXZlIHByb2plY3Rpb24gbWF0cml4IHdpdGggdGhlIGdpdmVuIGZpZWxkIG9mIHZpZXcuXG4gKiBUaGlzIGlzIHByaW1hcmlseSB1c2VmdWwgZm9yIGdlbmVyYXRpbmcgcHJvamVjdGlvbiBtYXRyaWNlcyB0byBiZSB1c2VkXG4gKiB3aXRoIHRoZSBzdGlsbCBleHBlcmllbWVudGFsIFdlYlZSIEFQSS5cbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCBtYXQ0IGZydXN0dW0gbWF0cml4IHdpbGwgYmUgd3JpdHRlbiBpbnRvXG4gKiBAcGFyYW0ge251bWJlcn0gZm92IE9iamVjdCBjb250YWluaW5nIHRoZSBmb2xsb3dpbmcgdmFsdWVzOiB1cERlZ3JlZXMsIGRvd25EZWdyZWVzLCBsZWZ0RGVncmVlcywgcmlnaHREZWdyZWVzXG4gKiBAcGFyYW0ge251bWJlcn0gbmVhciBOZWFyIGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcGFyYW0ge251bWJlcn0gZmFyIEZhciBib3VuZCBvZiB0aGUgZnJ1c3R1bVxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5mdW5jdGlvbiBwZXJzcGVjdGl2ZUZyb21GaWVsZE9mVmlldyhvdXQsIGZvdiwgbmVhciwgZmFyKSB7XG4gICAgdmFyIHVwVGFuID0gTWF0aC50YW4oZm92LnVwRGVncmVlcyAqIE1hdGguUEkvMTgwLjApLFxuICAgICAgICBkb3duVGFuID0gTWF0aC50YW4oZm92LmRvd25EZWdyZWVzICogTWF0aC5QSS8xODAuMCksXG4gICAgICAgIGxlZnRUYW4gPSBNYXRoLnRhbihmb3YubGVmdERlZ3JlZXMgKiBNYXRoLlBJLzE4MC4wKSxcbiAgICAgICAgcmlnaHRUYW4gPSBNYXRoLnRhbihmb3YucmlnaHREZWdyZWVzICogTWF0aC5QSS8xODAuMCksXG4gICAgICAgIHhTY2FsZSA9IDIuMCAvIChsZWZ0VGFuICsgcmlnaHRUYW4pLFxuICAgICAgICB5U2NhbGUgPSAyLjAgLyAodXBUYW4gKyBkb3duVGFuKTtcblxuICAgIG91dFswXSA9IHhTY2FsZTtcbiAgICBvdXRbMV0gPSAwLjA7XG4gICAgb3V0WzJdID0gMC4wO1xuICAgIG91dFszXSA9IDAuMDtcbiAgICBvdXRbNF0gPSAwLjA7XG4gICAgb3V0WzVdID0geVNjYWxlO1xuICAgIG91dFs2XSA9IDAuMDtcbiAgICBvdXRbN10gPSAwLjA7XG4gICAgb3V0WzhdID0gLSgobGVmdFRhbiAtIHJpZ2h0VGFuKSAqIHhTY2FsZSAqIDAuNSk7XG4gICAgb3V0WzldID0gKCh1cFRhbiAtIGRvd25UYW4pICogeVNjYWxlICogMC41KTtcbiAgICBvdXRbMTBdID0gZmFyIC8gKG5lYXIgLSBmYXIpO1xuICAgIG91dFsxMV0gPSAtMS4wO1xuICAgIG91dFsxMl0gPSAwLjA7XG4gICAgb3V0WzEzXSA9IDAuMDtcbiAgICBvdXRbMTRdID0gKGZhciAqIG5lYXIpIC8gKG5lYXIgLSBmYXIpO1xuICAgIG91dFsxNV0gPSAwLjA7XG4gICAgcmV0dXJuIG91dDtcbn1cblxuIiwibW9kdWxlLmV4cG9ydHMgPSByb3RhdGU7XG5cbi8qKlxuICogUm90YXRlcyBhIG1hdDQgYnkgdGhlIGdpdmVuIGFuZ2xlXG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEBwYXJhbSB7bWF0NH0gYSB0aGUgbWF0cml4IHRvIHJvdGF0ZVxuICogQHBhcmFtIHtOdW1iZXJ9IHJhZCB0aGUgYW5nbGUgdG8gcm90YXRlIHRoZSBtYXRyaXggYnlcbiAqIEBwYXJhbSB7dmVjM30gYXhpcyB0aGUgYXhpcyB0byByb3RhdGUgYXJvdW5kXG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbmZ1bmN0aW9uIHJvdGF0ZShvdXQsIGEsIHJhZCwgYXhpcykge1xuICAgIHZhciB4ID0gYXhpc1swXSwgeSA9IGF4aXNbMV0sIHogPSBheGlzWzJdLFxuICAgICAgICBsZW4gPSBNYXRoLnNxcnQoeCAqIHggKyB5ICogeSArIHogKiB6KSxcbiAgICAgICAgcywgYywgdCxcbiAgICAgICAgYTAwLCBhMDEsIGEwMiwgYTAzLFxuICAgICAgICBhMTAsIGExMSwgYTEyLCBhMTMsXG4gICAgICAgIGEyMCwgYTIxLCBhMjIsIGEyMyxcbiAgICAgICAgYjAwLCBiMDEsIGIwMixcbiAgICAgICAgYjEwLCBiMTEsIGIxMixcbiAgICAgICAgYjIwLCBiMjEsIGIyMjtcblxuICAgIGlmIChNYXRoLmFicyhsZW4pIDwgMC4wMDAwMDEpIHsgcmV0dXJuIG51bGw7IH1cbiAgICBcbiAgICBsZW4gPSAxIC8gbGVuO1xuICAgIHggKj0gbGVuO1xuICAgIHkgKj0gbGVuO1xuICAgIHogKj0gbGVuO1xuXG4gICAgcyA9IE1hdGguc2luKHJhZCk7XG4gICAgYyA9IE1hdGguY29zKHJhZCk7XG4gICAgdCA9IDEgLSBjO1xuXG4gICAgYTAwID0gYVswXTsgYTAxID0gYVsxXTsgYTAyID0gYVsyXTsgYTAzID0gYVszXTtcbiAgICBhMTAgPSBhWzRdOyBhMTEgPSBhWzVdOyBhMTIgPSBhWzZdOyBhMTMgPSBhWzddO1xuICAgIGEyMCA9IGFbOF07IGEyMSA9IGFbOV07IGEyMiA9IGFbMTBdOyBhMjMgPSBhWzExXTtcblxuICAgIC8vIENvbnN0cnVjdCB0aGUgZWxlbWVudHMgb2YgdGhlIHJvdGF0aW9uIG1hdHJpeFxuICAgIGIwMCA9IHggKiB4ICogdCArIGM7IGIwMSA9IHkgKiB4ICogdCArIHogKiBzOyBiMDIgPSB6ICogeCAqIHQgLSB5ICogcztcbiAgICBiMTAgPSB4ICogeSAqIHQgLSB6ICogczsgYjExID0geSAqIHkgKiB0ICsgYzsgYjEyID0geiAqIHkgKiB0ICsgeCAqIHM7XG4gICAgYjIwID0geCAqIHogKiB0ICsgeSAqIHM7IGIyMSA9IHkgKiB6ICogdCAtIHggKiBzOyBiMjIgPSB6ICogeiAqIHQgKyBjO1xuXG4gICAgLy8gUGVyZm9ybSByb3RhdGlvbi1zcGVjaWZpYyBtYXRyaXggbXVsdGlwbGljYXRpb25cbiAgICBvdXRbMF0gPSBhMDAgKiBiMDAgKyBhMTAgKiBiMDEgKyBhMjAgKiBiMDI7XG4gICAgb3V0WzFdID0gYTAxICogYjAwICsgYTExICogYjAxICsgYTIxICogYjAyO1xuICAgIG91dFsyXSA9IGEwMiAqIGIwMCArIGExMiAqIGIwMSArIGEyMiAqIGIwMjtcbiAgICBvdXRbM10gPSBhMDMgKiBiMDAgKyBhMTMgKiBiMDEgKyBhMjMgKiBiMDI7XG4gICAgb3V0WzRdID0gYTAwICogYjEwICsgYTEwICogYjExICsgYTIwICogYjEyO1xuICAgIG91dFs1XSA9IGEwMSAqIGIxMCArIGExMSAqIGIxMSArIGEyMSAqIGIxMjtcbiAgICBvdXRbNl0gPSBhMDIgKiBiMTAgKyBhMTIgKiBiMTEgKyBhMjIgKiBiMTI7XG4gICAgb3V0WzddID0gYTAzICogYjEwICsgYTEzICogYjExICsgYTIzICogYjEyO1xuICAgIG91dFs4XSA9IGEwMCAqIGIyMCArIGExMCAqIGIyMSArIGEyMCAqIGIyMjtcbiAgICBvdXRbOV0gPSBhMDEgKiBiMjAgKyBhMTEgKiBiMjEgKyBhMjEgKiBiMjI7XG4gICAgb3V0WzEwXSA9IGEwMiAqIGIyMCArIGExMiAqIGIyMSArIGEyMiAqIGIyMjtcbiAgICBvdXRbMTFdID0gYTAzICogYjIwICsgYTEzICogYjIxICsgYTIzICogYjIyO1xuXG4gICAgaWYgKGEgIT09IG91dCkgeyAvLyBJZiB0aGUgc291cmNlIGFuZCBkZXN0aW5hdGlvbiBkaWZmZXIsIGNvcHkgdGhlIHVuY2hhbmdlZCBsYXN0IHJvd1xuICAgICAgICBvdXRbMTJdID0gYVsxMl07XG4gICAgICAgIG91dFsxM10gPSBhWzEzXTtcbiAgICAgICAgb3V0WzE0XSA9IGFbMTRdO1xuICAgICAgICBvdXRbMTVdID0gYVsxNV07XG4gICAgfVxuICAgIHJldHVybiBvdXQ7XG59OyIsIm1vZHVsZS5leHBvcnRzID0gcm90YXRlWDtcblxuLyoqXG4gKiBSb3RhdGVzIGEgbWF0cml4IGJ5IHRoZSBnaXZlbiBhbmdsZSBhcm91bmQgdGhlIFggYXhpc1xuICpcbiAqIEBwYXJhbSB7bWF0NH0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDR9IGEgdGhlIG1hdHJpeCB0byByb3RhdGVcbiAqIEBwYXJhbSB7TnVtYmVyfSByYWQgdGhlIGFuZ2xlIHRvIHJvdGF0ZSB0aGUgbWF0cml4IGJ5XG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbmZ1bmN0aW9uIHJvdGF0ZVgob3V0LCBhLCByYWQpIHtcbiAgICB2YXIgcyA9IE1hdGguc2luKHJhZCksXG4gICAgICAgIGMgPSBNYXRoLmNvcyhyYWQpLFxuICAgICAgICBhMTAgPSBhWzRdLFxuICAgICAgICBhMTEgPSBhWzVdLFxuICAgICAgICBhMTIgPSBhWzZdLFxuICAgICAgICBhMTMgPSBhWzddLFxuICAgICAgICBhMjAgPSBhWzhdLFxuICAgICAgICBhMjEgPSBhWzldLFxuICAgICAgICBhMjIgPSBhWzEwXSxcbiAgICAgICAgYTIzID0gYVsxMV07XG5cbiAgICBpZiAoYSAhPT0gb3V0KSB7IC8vIElmIHRoZSBzb3VyY2UgYW5kIGRlc3RpbmF0aW9uIGRpZmZlciwgY29weSB0aGUgdW5jaGFuZ2VkIHJvd3NcbiAgICAgICAgb3V0WzBdICA9IGFbMF07XG4gICAgICAgIG91dFsxXSAgPSBhWzFdO1xuICAgICAgICBvdXRbMl0gID0gYVsyXTtcbiAgICAgICAgb3V0WzNdICA9IGFbM107XG4gICAgICAgIG91dFsxMl0gPSBhWzEyXTtcbiAgICAgICAgb3V0WzEzXSA9IGFbMTNdO1xuICAgICAgICBvdXRbMTRdID0gYVsxNF07XG4gICAgICAgIG91dFsxNV0gPSBhWzE1XTtcbiAgICB9XG5cbiAgICAvLyBQZXJmb3JtIGF4aXMtc3BlY2lmaWMgbWF0cml4IG11bHRpcGxpY2F0aW9uXG4gICAgb3V0WzRdID0gYTEwICogYyArIGEyMCAqIHM7XG4gICAgb3V0WzVdID0gYTExICogYyArIGEyMSAqIHM7XG4gICAgb3V0WzZdID0gYTEyICogYyArIGEyMiAqIHM7XG4gICAgb3V0WzddID0gYTEzICogYyArIGEyMyAqIHM7XG4gICAgb3V0WzhdID0gYTIwICogYyAtIGExMCAqIHM7XG4gICAgb3V0WzldID0gYTIxICogYyAtIGExMSAqIHM7XG4gICAgb3V0WzEwXSA9IGEyMiAqIGMgLSBhMTIgKiBzO1xuICAgIG91dFsxMV0gPSBhMjMgKiBjIC0gYTEzICogcztcbiAgICByZXR1cm4gb3V0O1xufTsiLCJtb2R1bGUuZXhwb3J0cyA9IHJvdGF0ZVk7XG5cbi8qKlxuICogUm90YXRlcyBhIG1hdHJpeCBieSB0aGUgZ2l2ZW4gYW5nbGUgYXJvdW5kIHRoZSBZIGF4aXNcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQ0fSBhIHRoZSBtYXRyaXggdG8gcm90YXRlXG4gKiBAcGFyYW0ge051bWJlcn0gcmFkIHRoZSBhbmdsZSB0byByb3RhdGUgdGhlIG1hdHJpeCBieVxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5mdW5jdGlvbiByb3RhdGVZKG91dCwgYSwgcmFkKSB7XG4gICAgdmFyIHMgPSBNYXRoLnNpbihyYWQpLFxuICAgICAgICBjID0gTWF0aC5jb3MocmFkKSxcbiAgICAgICAgYTAwID0gYVswXSxcbiAgICAgICAgYTAxID0gYVsxXSxcbiAgICAgICAgYTAyID0gYVsyXSxcbiAgICAgICAgYTAzID0gYVszXSxcbiAgICAgICAgYTIwID0gYVs4XSxcbiAgICAgICAgYTIxID0gYVs5XSxcbiAgICAgICAgYTIyID0gYVsxMF0sXG4gICAgICAgIGEyMyA9IGFbMTFdO1xuXG4gICAgaWYgKGEgIT09IG91dCkgeyAvLyBJZiB0aGUgc291cmNlIGFuZCBkZXN0aW5hdGlvbiBkaWZmZXIsIGNvcHkgdGhlIHVuY2hhbmdlZCByb3dzXG4gICAgICAgIG91dFs0XSAgPSBhWzRdO1xuICAgICAgICBvdXRbNV0gID0gYVs1XTtcbiAgICAgICAgb3V0WzZdICA9IGFbNl07XG4gICAgICAgIG91dFs3XSAgPSBhWzddO1xuICAgICAgICBvdXRbMTJdID0gYVsxMl07XG4gICAgICAgIG91dFsxM10gPSBhWzEzXTtcbiAgICAgICAgb3V0WzE0XSA9IGFbMTRdO1xuICAgICAgICBvdXRbMTVdID0gYVsxNV07XG4gICAgfVxuXG4gICAgLy8gUGVyZm9ybSBheGlzLXNwZWNpZmljIG1hdHJpeCBtdWx0aXBsaWNhdGlvblxuICAgIG91dFswXSA9IGEwMCAqIGMgLSBhMjAgKiBzO1xuICAgIG91dFsxXSA9IGEwMSAqIGMgLSBhMjEgKiBzO1xuICAgIG91dFsyXSA9IGEwMiAqIGMgLSBhMjIgKiBzO1xuICAgIG91dFszXSA9IGEwMyAqIGMgLSBhMjMgKiBzO1xuICAgIG91dFs4XSA9IGEwMCAqIHMgKyBhMjAgKiBjO1xuICAgIG91dFs5XSA9IGEwMSAqIHMgKyBhMjEgKiBjO1xuICAgIG91dFsxMF0gPSBhMDIgKiBzICsgYTIyICogYztcbiAgICBvdXRbMTFdID0gYTAzICogcyArIGEyMyAqIGM7XG4gICAgcmV0dXJuIG91dDtcbn07IiwibW9kdWxlLmV4cG9ydHMgPSByb3RhdGVaO1xuXG4vKipcbiAqIFJvdGF0ZXMgYSBtYXRyaXggYnkgdGhlIGdpdmVuIGFuZ2xlIGFyb3VuZCB0aGUgWiBheGlzXG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEBwYXJhbSB7bWF0NH0gYSB0aGUgbWF0cml4IHRvIHJvdGF0ZVxuICogQHBhcmFtIHtOdW1iZXJ9IHJhZCB0aGUgYW5nbGUgdG8gcm90YXRlIHRoZSBtYXRyaXggYnlcbiAqIEByZXR1cm5zIHttYXQ0fSBvdXRcbiAqL1xuZnVuY3Rpb24gcm90YXRlWihvdXQsIGEsIHJhZCkge1xuICAgIHZhciBzID0gTWF0aC5zaW4ocmFkKSxcbiAgICAgICAgYyA9IE1hdGguY29zKHJhZCksXG4gICAgICAgIGEwMCA9IGFbMF0sXG4gICAgICAgIGEwMSA9IGFbMV0sXG4gICAgICAgIGEwMiA9IGFbMl0sXG4gICAgICAgIGEwMyA9IGFbM10sXG4gICAgICAgIGExMCA9IGFbNF0sXG4gICAgICAgIGExMSA9IGFbNV0sXG4gICAgICAgIGExMiA9IGFbNl0sXG4gICAgICAgIGExMyA9IGFbN107XG5cbiAgICBpZiAoYSAhPT0gb3V0KSB7IC8vIElmIHRoZSBzb3VyY2UgYW5kIGRlc3RpbmF0aW9uIGRpZmZlciwgY29weSB0aGUgdW5jaGFuZ2VkIGxhc3Qgcm93XG4gICAgICAgIG91dFs4XSAgPSBhWzhdO1xuICAgICAgICBvdXRbOV0gID0gYVs5XTtcbiAgICAgICAgb3V0WzEwXSA9IGFbMTBdO1xuICAgICAgICBvdXRbMTFdID0gYVsxMV07XG4gICAgICAgIG91dFsxMl0gPSBhWzEyXTtcbiAgICAgICAgb3V0WzEzXSA9IGFbMTNdO1xuICAgICAgICBvdXRbMTRdID0gYVsxNF07XG4gICAgICAgIG91dFsxNV0gPSBhWzE1XTtcbiAgICB9XG5cbiAgICAvLyBQZXJmb3JtIGF4aXMtc3BlY2lmaWMgbWF0cml4IG11bHRpcGxpY2F0aW9uXG4gICAgb3V0WzBdID0gYTAwICogYyArIGExMCAqIHM7XG4gICAgb3V0WzFdID0gYTAxICogYyArIGExMSAqIHM7XG4gICAgb3V0WzJdID0gYTAyICogYyArIGExMiAqIHM7XG4gICAgb3V0WzNdID0gYTAzICogYyArIGExMyAqIHM7XG4gICAgb3V0WzRdID0gYTEwICogYyAtIGEwMCAqIHM7XG4gICAgb3V0WzVdID0gYTExICogYyAtIGEwMSAqIHM7XG4gICAgb3V0WzZdID0gYTEyICogYyAtIGEwMiAqIHM7XG4gICAgb3V0WzddID0gYTEzICogYyAtIGEwMyAqIHM7XG4gICAgcmV0dXJuIG91dDtcbn07IiwibW9kdWxlLmV4cG9ydHMgPSBzY2FsZTtcblxuLyoqXG4gKiBTY2FsZXMgdGhlIG1hdDQgYnkgdGhlIGRpbWVuc2lvbnMgaW4gdGhlIGdpdmVuIHZlYzNcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQ0fSBhIHRoZSBtYXRyaXggdG8gc2NhbGVcbiAqIEBwYXJhbSB7dmVjM30gdiB0aGUgdmVjMyB0byBzY2FsZSB0aGUgbWF0cml4IGJ5XG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKiovXG5mdW5jdGlvbiBzY2FsZShvdXQsIGEsIHYpIHtcbiAgICB2YXIgeCA9IHZbMF0sIHkgPSB2WzFdLCB6ID0gdlsyXTtcblxuICAgIG91dFswXSA9IGFbMF0gKiB4O1xuICAgIG91dFsxXSA9IGFbMV0gKiB4O1xuICAgIG91dFsyXSA9IGFbMl0gKiB4O1xuICAgIG91dFszXSA9IGFbM10gKiB4O1xuICAgIG91dFs0XSA9IGFbNF0gKiB5O1xuICAgIG91dFs1XSA9IGFbNV0gKiB5O1xuICAgIG91dFs2XSA9IGFbNl0gKiB5O1xuICAgIG91dFs3XSA9IGFbN10gKiB5O1xuICAgIG91dFs4XSA9IGFbOF0gKiB6O1xuICAgIG91dFs5XSA9IGFbOV0gKiB6O1xuICAgIG91dFsxMF0gPSBhWzEwXSAqIHo7XG4gICAgb3V0WzExXSA9IGFbMTFdICogejtcbiAgICBvdXRbMTJdID0gYVsxMl07XG4gICAgb3V0WzEzXSA9IGFbMTNdO1xuICAgIG91dFsxNF0gPSBhWzE0XTtcbiAgICBvdXRbMTVdID0gYVsxNV07XG4gICAgcmV0dXJuIG91dDtcbn07IiwibW9kdWxlLmV4cG9ydHMgPSBzdHI7XG5cbi8qKlxuICogUmV0dXJucyBhIHN0cmluZyByZXByZXNlbnRhdGlvbiBvZiBhIG1hdDRcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG1hdCBtYXRyaXggdG8gcmVwcmVzZW50IGFzIGEgc3RyaW5nXG4gKiBAcmV0dXJucyB7U3RyaW5nfSBzdHJpbmcgcmVwcmVzZW50YXRpb24gb2YgdGhlIG1hdHJpeFxuICovXG5mdW5jdGlvbiBzdHIoYSkge1xuICAgIHJldHVybiAnbWF0NCgnICsgYVswXSArICcsICcgKyBhWzFdICsgJywgJyArIGFbMl0gKyAnLCAnICsgYVszXSArICcsICcgK1xuICAgICAgICAgICAgICAgICAgICBhWzRdICsgJywgJyArIGFbNV0gKyAnLCAnICsgYVs2XSArICcsICcgKyBhWzddICsgJywgJyArXG4gICAgICAgICAgICAgICAgICAgIGFbOF0gKyAnLCAnICsgYVs5XSArICcsICcgKyBhWzEwXSArICcsICcgKyBhWzExXSArICcsICcgKyBcbiAgICAgICAgICAgICAgICAgICAgYVsxMl0gKyAnLCAnICsgYVsxM10gKyAnLCAnICsgYVsxNF0gKyAnLCAnICsgYVsxNV0gKyAnKSc7XG59OyIsIm1vZHVsZS5leHBvcnRzID0gdHJhbnNsYXRlO1xuXG4vKipcbiAqIFRyYW5zbGF0ZSBhIG1hdDQgYnkgdGhlIGdpdmVuIHZlY3RvclxuICpcbiAqIEBwYXJhbSB7bWF0NH0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDR9IGEgdGhlIG1hdHJpeCB0byB0cmFuc2xhdGVcbiAqIEBwYXJhbSB7dmVjM30gdiB2ZWN0b3IgdG8gdHJhbnNsYXRlIGJ5XG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbmZ1bmN0aW9uIHRyYW5zbGF0ZShvdXQsIGEsIHYpIHtcbiAgICB2YXIgeCA9IHZbMF0sIHkgPSB2WzFdLCB6ID0gdlsyXSxcbiAgICAgICAgYTAwLCBhMDEsIGEwMiwgYTAzLFxuICAgICAgICBhMTAsIGExMSwgYTEyLCBhMTMsXG4gICAgICAgIGEyMCwgYTIxLCBhMjIsIGEyMztcblxuICAgIGlmIChhID09PSBvdXQpIHtcbiAgICAgICAgb3V0WzEyXSA9IGFbMF0gKiB4ICsgYVs0XSAqIHkgKyBhWzhdICogeiArIGFbMTJdO1xuICAgICAgICBvdXRbMTNdID0gYVsxXSAqIHggKyBhWzVdICogeSArIGFbOV0gKiB6ICsgYVsxM107XG4gICAgICAgIG91dFsxNF0gPSBhWzJdICogeCArIGFbNl0gKiB5ICsgYVsxMF0gKiB6ICsgYVsxNF07XG4gICAgICAgIG91dFsxNV0gPSBhWzNdICogeCArIGFbN10gKiB5ICsgYVsxMV0gKiB6ICsgYVsxNV07XG4gICAgfSBlbHNlIHtcbiAgICAgICAgYTAwID0gYVswXTsgYTAxID0gYVsxXTsgYTAyID0gYVsyXTsgYTAzID0gYVszXTtcbiAgICAgICAgYTEwID0gYVs0XTsgYTExID0gYVs1XTsgYTEyID0gYVs2XTsgYTEzID0gYVs3XTtcbiAgICAgICAgYTIwID0gYVs4XTsgYTIxID0gYVs5XTsgYTIyID0gYVsxMF07IGEyMyA9IGFbMTFdO1xuXG4gICAgICAgIG91dFswXSA9IGEwMDsgb3V0WzFdID0gYTAxOyBvdXRbMl0gPSBhMDI7IG91dFszXSA9IGEwMztcbiAgICAgICAgb3V0WzRdID0gYTEwOyBvdXRbNV0gPSBhMTE7IG91dFs2XSA9IGExMjsgb3V0WzddID0gYTEzO1xuICAgICAgICBvdXRbOF0gPSBhMjA7IG91dFs5XSA9IGEyMTsgb3V0WzEwXSA9IGEyMjsgb3V0WzExXSA9IGEyMztcblxuICAgICAgICBvdXRbMTJdID0gYTAwICogeCArIGExMCAqIHkgKyBhMjAgKiB6ICsgYVsxMl07XG4gICAgICAgIG91dFsxM10gPSBhMDEgKiB4ICsgYTExICogeSArIGEyMSAqIHogKyBhWzEzXTtcbiAgICAgICAgb3V0WzE0XSA9IGEwMiAqIHggKyBhMTIgKiB5ICsgYTIyICogeiArIGFbMTRdO1xuICAgICAgICBvdXRbMTVdID0gYTAzICogeCArIGExMyAqIHkgKyBhMjMgKiB6ICsgYVsxNV07XG4gICAgfVxuXG4gICAgcmV0dXJuIG91dDtcbn07IiwibW9kdWxlLmV4cG9ydHMgPSB0cmFuc3Bvc2U7XG5cbi8qKlxuICogVHJhbnNwb3NlIHRoZSB2YWx1ZXMgb2YgYSBtYXQ0XG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEBwYXJhbSB7bWF0NH0gYSB0aGUgc291cmNlIG1hdHJpeFxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5mdW5jdGlvbiB0cmFuc3Bvc2Uob3V0LCBhKSB7XG4gICAgLy8gSWYgd2UgYXJlIHRyYW5zcG9zaW5nIG91cnNlbHZlcyB3ZSBjYW4gc2tpcCBhIGZldyBzdGVwcyBidXQgaGF2ZSB0byBjYWNoZSBzb21lIHZhbHVlc1xuICAgIGlmIChvdXQgPT09IGEpIHtcbiAgICAgICAgdmFyIGEwMSA9IGFbMV0sIGEwMiA9IGFbMl0sIGEwMyA9IGFbM10sXG4gICAgICAgICAgICBhMTIgPSBhWzZdLCBhMTMgPSBhWzddLFxuICAgICAgICAgICAgYTIzID0gYVsxMV07XG5cbiAgICAgICAgb3V0WzFdID0gYVs0XTtcbiAgICAgICAgb3V0WzJdID0gYVs4XTtcbiAgICAgICAgb3V0WzNdID0gYVsxMl07XG4gICAgICAgIG91dFs0XSA9IGEwMTtcbiAgICAgICAgb3V0WzZdID0gYVs5XTtcbiAgICAgICAgb3V0WzddID0gYVsxM107XG4gICAgICAgIG91dFs4XSA9IGEwMjtcbiAgICAgICAgb3V0WzldID0gYTEyO1xuICAgICAgICBvdXRbMTFdID0gYVsxNF07XG4gICAgICAgIG91dFsxMl0gPSBhMDM7XG4gICAgICAgIG91dFsxM10gPSBhMTM7XG4gICAgICAgIG91dFsxNF0gPSBhMjM7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgb3V0WzBdID0gYVswXTtcbiAgICAgICAgb3V0WzFdID0gYVs0XTtcbiAgICAgICAgb3V0WzJdID0gYVs4XTtcbiAgICAgICAgb3V0WzNdID0gYVsxMl07XG4gICAgICAgIG91dFs0XSA9IGFbMV07XG4gICAgICAgIG91dFs1XSA9IGFbNV07XG4gICAgICAgIG91dFs2XSA9IGFbOV07XG4gICAgICAgIG91dFs3XSA9IGFbMTNdO1xuICAgICAgICBvdXRbOF0gPSBhWzJdO1xuICAgICAgICBvdXRbOV0gPSBhWzZdO1xuICAgICAgICBvdXRbMTBdID0gYVsxMF07XG4gICAgICAgIG91dFsxMV0gPSBhWzE0XTtcbiAgICAgICAgb3V0WzEyXSA9IGFbM107XG4gICAgICAgIG91dFsxM10gPSBhWzddO1xuICAgICAgICBvdXRbMTRdID0gYVsxMV07XG4gICAgICAgIG91dFsxNV0gPSBhWzE1XTtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIG91dDtcbn07IiwiLyogZ2xvYmFsIFhNTEh0dHBSZXF1ZXN0ICovXG52YXIgY29uZmlnUGFyYW1ldGVycyA9IFtcbiAgJ21hbmlmZXN0JyxcbiAgJ29uRG9uZScsXG4gICdvblByb2dyZXNzJyxcbiAgJ29uRXJyb3InXG5dXG5cbnZhciBtYW5pZmVzdFBhcmFtZXRlcnMgPSBbXG4gICd0eXBlJyxcbiAgJ3NyYycsXG4gICdzdHJlYW0nLFxuICAnY3JlZGVudGlhbHMnLFxuICAncGFyc2VyJ1xuXVxuXG52YXIgcGFyc2VyUGFyYW1ldGVycyA9IFtcbiAgJ29uRGF0YScsXG4gICdvbkRvbmUnXG5dXG5cbnZhciBTVEFURV9FUlJPUiA9IC0xXG52YXIgU1RBVEVfREFUQSA9IDBcbnZhciBTVEFURV9DT01QTEVURSA9IDFcblxuZnVuY3Rpb24gcmFpc2UgKG1lc3NhZ2UpIHtcbiAgdGhyb3cgbmV3IEVycm9yKCdyZXNsOiAnICsgbWVzc2FnZSlcbn1cblxuZnVuY3Rpb24gY2hlY2tUeXBlIChvYmplY3QsIHBhcmFtZXRlcnMsIG5hbWUpIHtcbiAgT2JqZWN0LmtleXMob2JqZWN0KS5mb3JFYWNoKGZ1bmN0aW9uIChwYXJhbSkge1xuICAgIGlmIChwYXJhbWV0ZXJzLmluZGV4T2YocGFyYW0pIDwgMCkge1xuICAgICAgcmFpc2UoJ2ludmFsaWQgcGFyYW1ldGVyIFwiJyArIHBhcmFtICsgJ1wiIGluICcgKyBuYW1lKVxuICAgIH1cbiAgfSlcbn1cblxuZnVuY3Rpb24gTG9hZGVyIChuYW1lLCBjYW5jZWwpIHtcbiAgdGhpcy5zdGF0ZSA9IFNUQVRFX0RBVEFcbiAgdGhpcy5yZWFkeSA9IGZhbHNlXG4gIHRoaXMucHJvZ3Jlc3MgPSAwXG4gIHRoaXMubmFtZSA9IG5hbWVcbiAgdGhpcy5jYW5jZWwgPSBjYW5jZWxcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiByZXNsIChjb25maWcpIHtcbiAgaWYgKHR5cGVvZiBjb25maWcgIT09ICdvYmplY3QnIHx8ICFjb25maWcpIHtcbiAgICByYWlzZSgnaW52YWxpZCBvciBtaXNzaW5nIGNvbmZpZ3VyYXRpb24nKVxuICB9XG5cbiAgY2hlY2tUeXBlKGNvbmZpZywgY29uZmlnUGFyYW1ldGVycywgJ2NvbmZpZycpXG5cbiAgdmFyIG1hbmlmZXN0ID0gY29uZmlnLm1hbmlmZXN0XG4gIGlmICh0eXBlb2YgbWFuaWZlc3QgIT09ICdvYmplY3QnIHx8ICFtYW5pZmVzdCkge1xuICAgIHJhaXNlKCdtaXNzaW5nIG1hbmlmZXN0JylcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldEZ1bmN0aW9uIChuYW1lLCBkZmx0KSB7XG4gICAgaWYgKG5hbWUgaW4gY29uZmlnKSB7XG4gICAgICB2YXIgZnVuYyA9IGNvbmZpZ1tuYW1lXVxuICAgICAgaWYgKHR5cGVvZiBmdW5jICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHJhaXNlKCdpbnZhbGlkIGNhbGxiYWNrIFwiJyArIG5hbWUgKyAnXCInKVxuICAgICAgfVxuICAgICAgcmV0dXJuIGZ1bmNcbiAgICB9XG4gICAgcmV0dXJuIG51bGxcbiAgfVxuXG4gIHZhciBvbkRvbmUgPSBnZXRGdW5jdGlvbignb25Eb25lJylcbiAgaWYgKCFvbkRvbmUpIHtcbiAgICByYWlzZSgnbWlzc2luZyBvbkRvbmUoKSBjYWxsYmFjaycpXG4gIH1cblxuICB2YXIgb25Qcm9ncmVzcyA9IGdldEZ1bmN0aW9uKCdvblByb2dyZXNzJylcbiAgdmFyIG9uRXJyb3IgPSBnZXRGdW5jdGlvbignb25FcnJvcicpXG5cbiAgdmFyIGFzc2V0cyA9IHt9XG5cbiAgdmFyIHN0YXRlID0gU1RBVEVfREFUQVxuXG4gIGZ1bmN0aW9uIGxvYWRYSFIgKHJlcXVlc3QpIHtcbiAgICB2YXIgbmFtZSA9IHJlcXVlc3QubmFtZVxuICAgIHZhciBzdHJlYW0gPSByZXF1ZXN0LnN0cmVhbVxuICAgIHZhciBiaW5hcnkgPSByZXF1ZXN0LnR5cGUgPT09ICdiaW5hcnknXG4gICAgdmFyIHBhcnNlciA9IHJlcXVlc3QucGFyc2VyXG5cbiAgICB2YXIgeGhyID0gbmV3IFhNTEh0dHBSZXF1ZXN0KClcbiAgICB2YXIgYXNzZXQgPSBudWxsXG5cbiAgICB2YXIgbG9hZGVyID0gbmV3IExvYWRlcihuYW1lLCBjYW5jZWwpXG5cbiAgICBpZiAoc3RyZWFtKSB7XG4gICAgICB4aHIub25yZWFkeXN0YXRlY2hhbmdlID0gb25SZWFkeVN0YXRlQ2hhbmdlXG4gICAgfSBlbHNlIHtcbiAgICAgIHhoci5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh4aHIucmVhZHlTdGF0ZSA9PT0gNCkge1xuICAgICAgICAgIG9uUmVhZHlTdGF0ZUNoYW5nZSgpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoYmluYXJ5KSB7XG4gICAgICB4aHIucmVzcG9uc2VUeXBlID0gJ2FycmF5YnVmZmVyJ1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIG9uUmVhZHlTdGF0ZUNoYW5nZSAoKSB7XG4gICAgICBpZiAoeGhyLnJlYWR5U3RhdGUgPCAyIHx8XG4gICAgICAgICAgbG9hZGVyLnN0YXRlID09PSBTVEFURV9DT01QTEVURSB8fFxuICAgICAgICAgIGxvYWRlci5zdGF0ZSA9PT0gU1RBVEVfRVJST1IpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICBpZiAoeGhyLnN0YXR1cyAhPT0gMjAwKSB7XG4gICAgICAgIHJldHVybiBhYm9ydCgnZXJyb3IgbG9hZGluZyByZXNvdXJjZSBcIicgKyByZXF1ZXN0Lm5hbWUgKyAnXCInKVxuICAgICAgfVxuICAgICAgaWYgKHhoci5yZWFkeVN0YXRlID4gMiAmJiBsb2FkZXIuc3RhdGUgPT09IFNUQVRFX0RBVEEpIHtcbiAgICAgICAgdmFyIHJlc3BvbnNlXG4gICAgICAgIGlmIChyZXF1ZXN0LnR5cGUgPT09ICdiaW5hcnknKSB7XG4gICAgICAgICAgcmVzcG9uc2UgPSB4aHIucmVzcG9uc2VcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXNwb25zZSA9IHhoci5yZXNwb25zZVRleHRcbiAgICAgICAgfVxuICAgICAgICBpZiAocGFyc2VyLmRhdGEpIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXNzZXQgPSBwYXJzZXIuZGF0YShyZXNwb25zZSlcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICByZXR1cm4gYWJvcnQoZSlcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYXNzZXQgPSByZXNwb25zZVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoeGhyLnJlYWR5U3RhdGUgPiAzICYmIGxvYWRlci5zdGF0ZSA9PT0gU1RBVEVfREFUQSkge1xuICAgICAgICBpZiAocGFyc2VyLmRvbmUpIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXNzZXQgPSBwYXJzZXIuZG9uZSgpXG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgcmV0dXJuIGFib3J0KGUpXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGxvYWRlci5zdGF0ZSA9IFNUQVRFX0NPTVBMRVRFXG4gICAgICB9XG4gICAgICBhc3NldHNbbmFtZV0gPSBhc3NldFxuICAgICAgbG9hZGVyLnByb2dyZXNzID0gMC43NSAqIGxvYWRlci5wcm9ncmVzcyArIDAuMjVcbiAgICAgIGxvYWRlci5yZWFkeSA9XG4gICAgICAgIChyZXF1ZXN0LnN0cmVhbSAmJiAhIWFzc2V0KSB8fFxuICAgICAgICBsb2FkZXIuc3RhdGUgPT09IFNUQVRFX0NPTVBMRVRFXG4gICAgICBub3RpZnlQcm9ncmVzcygpXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY2FuY2VsICgpIHtcbiAgICAgIGlmIChsb2FkZXIuc3RhdGUgPT09IFNUQVRFX0NPTVBMRVRFIHx8IGxvYWRlci5zdGF0ZSA9PT0gU1RBVEVfRVJST1IpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICB4aHIub25yZWFkeXN0YXRlY2hhbmdlID0gbnVsbFxuICAgICAgeGhyLmFib3J0KClcbiAgICAgIGxvYWRlci5zdGF0ZSA9IFNUQVRFX0VSUk9SXG4gICAgfVxuXG4gICAgLy8gc2V0IHVwIHJlcXVlc3RcbiAgICBpZiAocmVxdWVzdC5jcmVkZW50aWFscykge1xuICAgICAgeGhyLndpdGhDcmVkZW50aWFscyA9IHRydWVcbiAgICB9XG4gICAgeGhyLm9wZW4oJ0dFVCcsIHJlcXVlc3Quc3JjLCB0cnVlKVxuICAgIHhoci5zZW5kKClcblxuICAgIHJldHVybiBsb2FkZXJcbiAgfVxuXG4gIGZ1bmN0aW9uIGxvYWRFbGVtZW50IChyZXF1ZXN0LCBlbGVtZW50KSB7XG4gICAgdmFyIG5hbWUgPSByZXF1ZXN0Lm5hbWVcbiAgICB2YXIgcGFyc2VyID0gcmVxdWVzdC5wYXJzZXJcblxuICAgIHZhciBsb2FkZXIgPSBuZXcgTG9hZGVyKG5hbWUsIGNhbmNlbClcbiAgICB2YXIgYXNzZXQgPSBlbGVtZW50XG5cbiAgICBmdW5jdGlvbiBoYW5kbGVQcm9ncmVzcyAoKSB7XG4gICAgICBpZiAobG9hZGVyLnN0YXRlID09PSBTVEFURV9EQVRBKSB7XG4gICAgICAgIGlmIChwYXJzZXIuZGF0YSkge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhc3NldCA9IHBhcnNlci5kYXRhKGVsZW1lbnQpXG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgcmV0dXJuIGFib3J0KGUpXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGFzc2V0ID0gZWxlbWVudFxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gb25Qcm9ncmVzcyAoZSkge1xuICAgICAgaGFuZGxlUHJvZ3Jlc3MoKVxuICAgICAgYXNzZXRzW25hbWVdID0gYXNzZXRcbiAgICAgIGlmIChlLmxlbmd0aENvbXB1dGFibGUpIHtcbiAgICAgICAgbG9hZGVyLnByb2dyZXNzID0gTWF0aC5tYXgobG9hZGVyLnByb2dyZXNzLCBlLmxvYWRlZCAvIGUudG90YWwpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsb2FkZXIucHJvZ3Jlc3MgPSAwLjc1ICogbG9hZGVyLnByb2dyZXNzICsgMC4yNVxuICAgICAgfVxuICAgICAgbm90aWZ5UHJvZ3Jlc3MobmFtZSlcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBvbkNvbXBsZXRlICgpIHtcbiAgICAgIGhhbmRsZVByb2dyZXNzKClcbiAgICAgIGlmIChsb2FkZXIuc3RhdGUgPT09IFNUQVRFX0RBVEEpIHtcbiAgICAgICAgaWYgKHBhcnNlci5kb25lKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGFzc2V0ID0gcGFyc2VyLmRvbmUoKVxuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIHJldHVybiBhYm9ydChlKVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBsb2FkZXIuc3RhdGUgPSBTVEFURV9DT01QTEVURVxuICAgICAgfVxuICAgICAgbG9hZGVyLnByb2dyZXNzID0gMVxuICAgICAgbG9hZGVyLnJlYWR5ID0gdHJ1ZVxuICAgICAgYXNzZXRzW25hbWVdID0gYXNzZXRcbiAgICAgIHJlbW92ZUxpc3RlbmVycygpXG4gICAgICBub3RpZnlQcm9ncmVzcygnZmluaXNoICcgKyBuYW1lKVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIG9uRXJyb3IgKCkge1xuICAgICAgYWJvcnQoJ2Vycm9yIGxvYWRpbmcgYXNzZXQgXCInICsgbmFtZSArICdcIicpXG4gICAgfVxuXG4gICAgaWYgKHJlcXVlc3Quc3RyZWFtKSB7XG4gICAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ3Byb2dyZXNzJywgb25Qcm9ncmVzcylcbiAgICB9XG4gICAgaWYgKHJlcXVlc3QudHlwZSA9PT0gJ2ltYWdlJykge1xuICAgICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdsb2FkJywgb25Db21wbGV0ZSlcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGNhblBsYXkgPSBmYWxzZVxuICAgICAgdmFyIGxvYWRlZE1ldGFEYXRhID0gZmFsc2VcbiAgICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbG9hZGVkbWV0YWRhdGEnLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGxvYWRlZE1ldGFEYXRhID0gdHJ1ZVxuICAgICAgICBpZiAoY2FuUGxheSkge1xuICAgICAgICAgIG9uQ29tcGxldGUoKVxuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdjYW5wbGF5JywgZnVuY3Rpb24gKCkge1xuICAgICAgICBjYW5QbGF5ID0gdHJ1ZVxuICAgICAgICBpZiAobG9hZGVkTWV0YURhdGEpIHtcbiAgICAgICAgICBvbkNvbXBsZXRlKClcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICB9XG4gICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdlcnJvcicsIG9uRXJyb3IpXG5cbiAgICBmdW5jdGlvbiByZW1vdmVMaXN0ZW5lcnMgKCkge1xuICAgICAgaWYgKHJlcXVlc3Quc3RyZWFtKSB7XG4gICAgICAgIGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcigncHJvZ3Jlc3MnLCBvblByb2dyZXNzKVxuICAgICAgfVxuICAgICAgaWYgKHJlcXVlc3QudHlwZSA9PT0gJ2ltYWdlJykge1xuICAgICAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2xvYWQnLCBvbkNvbXBsZXRlKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdjYW5wbGF5Jywgb25Db21wbGV0ZSlcbiAgICAgIH1cbiAgICAgIGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignZXJyb3InLCBvbkVycm9yKVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNhbmNlbCAoKSB7XG4gICAgICBpZiAobG9hZGVyLnN0YXRlID09PSBTVEFURV9DT01QTEVURSB8fCBsb2FkZXIuc3RhdGUgPT09IFNUQVRFX0VSUk9SKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgbG9hZGVyLnN0YXRlID0gU1RBVEVfRVJST1JcbiAgICAgIHJlbW92ZUxpc3RlbmVycygpXG4gICAgICBlbGVtZW50LnNyYyA9ICcnXG4gICAgfVxuXG4gICAgLy8gc2V0IHVwIHJlcXVlc3RcbiAgICBpZiAocmVxdWVzdC5jcmVkZW50aWFscykge1xuICAgICAgZWxlbWVudC5jcm9zc09yaWdpbiA9ICd1c2UtY3JlZGVudGlhbHMnXG4gICAgfSBlbHNlIHtcbiAgICAgIGVsZW1lbnQuY3Jvc3NPcmlnaW4gPSAnYW5vbnltb3VzJ1xuICAgIH1cbiAgICBlbGVtZW50LnNyYyA9IHJlcXVlc3Quc3JjXG5cbiAgICByZXR1cm4gbG9hZGVyXG4gIH1cblxuICB2YXIgbG9hZGVycyA9IHtcbiAgICB0ZXh0OiBsb2FkWEhSLFxuICAgIGJpbmFyeTogZnVuY3Rpb24gKHJlcXVlc3QpIHtcbiAgICAgIC8vIFRPRE8gdXNlIGZldGNoIEFQSSBmb3Igc3RyZWFtaW5nIGlmIHN1cHBvcnRlZFxuICAgICAgcmV0dXJuIGxvYWRYSFIocmVxdWVzdClcbiAgICB9LFxuICAgIGltYWdlOiBmdW5jdGlvbiAocmVxdWVzdCkge1xuICAgICAgcmV0dXJuIGxvYWRFbGVtZW50KHJlcXVlc3QsIGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2ltZycpKVxuICAgIH0sXG4gICAgdmlkZW86IGZ1bmN0aW9uIChyZXF1ZXN0KSB7XG4gICAgICByZXR1cm4gbG9hZEVsZW1lbnQocmVxdWVzdCwgZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndmlkZW8nKSlcbiAgICB9LFxuICAgIGF1ZGlvOiBmdW5jdGlvbiAocmVxdWVzdCkge1xuICAgICAgcmV0dXJuIGxvYWRFbGVtZW50KHJlcXVlc3QsIGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2F1ZGlvJykpXG4gICAgfVxuICB9XG5cbiAgLy8gRmlyc3Qgd2UgcGFyc2UgYWxsIG9iamVjdHMgaW4gb3JkZXIgdG8gdmVyaWZ5IHRoYXQgYWxsIHR5cGUgaW5mb3JtYXRpb25cbiAgLy8gaXMgY29ycmVjdFxuICB2YXIgcGVuZGluZyA9IE9iamVjdC5rZXlzKG1hbmlmZXN0KS5tYXAoZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB2YXIgcmVxdWVzdCA9IG1hbmlmZXN0W25hbWVdXG4gICAgaWYgKHR5cGVvZiByZXF1ZXN0ID09PSAnc3RyaW5nJykge1xuICAgICAgcmVxdWVzdCA9IHtcbiAgICAgICAgc3JjOiByZXF1ZXN0XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgcmVxdWVzdCAhPT0gJ29iamVjdCcgfHwgIXJlcXVlc3QpIHtcbiAgICAgIHJhaXNlKCdpbnZhbGlkIGFzc2V0IGRlZmluaXRpb24gXCInICsgbmFtZSArICdcIicpXG4gICAgfVxuXG4gICAgY2hlY2tUeXBlKHJlcXVlc3QsIG1hbmlmZXN0UGFyYW1ldGVycywgJ2Fzc2V0IFwiJyArIG5hbWUgKyAnXCInKVxuXG4gICAgZnVuY3Rpb24gZ2V0UGFyYW1ldGVyIChwcm9wLCBhY2NlcHRlZCwgaW5pdCkge1xuICAgICAgdmFyIHZhbHVlID0gaW5pdFxuICAgICAgaWYgKHByb3AgaW4gcmVxdWVzdCkge1xuICAgICAgICB2YWx1ZSA9IHJlcXVlc3RbcHJvcF1cbiAgICAgIH1cbiAgICAgIGlmIChhY2NlcHRlZC5pbmRleE9mKHZhbHVlKSA8IDApIHtcbiAgICAgICAgcmFpc2UoJ2ludmFsaWQgJyArIHByb3AgKyAnIFwiJyArIHZhbHVlICsgJ1wiIGZvciBhc3NldCBcIicgKyBuYW1lICsgJ1wiLCBwb3NzaWJsZSB2YWx1ZXM6ICcgKyBhY2NlcHRlZClcbiAgICAgIH1cbiAgICAgIHJldHVybiB2YWx1ZVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldFN0cmluZyAocHJvcCwgcmVxdWlyZWQsIGluaXQpIHtcbiAgICAgIHZhciB2YWx1ZSA9IGluaXRcbiAgICAgIGlmIChwcm9wIGluIHJlcXVlc3QpIHtcbiAgICAgICAgdmFsdWUgPSByZXF1ZXN0W3Byb3BdXG4gICAgICB9IGVsc2UgaWYgKHJlcXVpcmVkKSB7XG4gICAgICAgIHJhaXNlKCdtaXNzaW5nICcgKyBwcm9wICsgJyBmb3IgYXNzZXQgXCInICsgbmFtZSArICdcIicpXG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJykge1xuICAgICAgICByYWlzZSgnaW52YWxpZCAnICsgcHJvcCArICcgZm9yIGFzc2V0IFwiJyArIG5hbWUgKyAnXCIsIG11c3QgYmUgYSBzdHJpbmcnKVxuICAgICAgfVxuICAgICAgcmV0dXJuIHZhbHVlXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0UGFyc2VGdW5jIChuYW1lLCBkZmx0KSB7XG4gICAgICBpZiAobmFtZSBpbiByZXF1ZXN0LnBhcnNlcikge1xuICAgICAgICB2YXIgcmVzdWx0ID0gcmVxdWVzdC5wYXJzZXJbbmFtZV1cbiAgICAgICAgaWYgKHR5cGVvZiByZXN1bHQgIT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICByYWlzZSgnaW52YWxpZCBwYXJzZXIgY2FsbGJhY2sgJyArIG5hbWUgKyAnIGZvciBhc3NldCBcIicgKyBuYW1lICsgJ1wiJylcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZGZsdFxuICAgICAgfVxuICAgIH1cblxuICAgIHZhciBwYXJzZXIgPSB7fVxuICAgIGlmICgncGFyc2VyJyBpbiByZXF1ZXN0KSB7XG4gICAgICBpZiAodHlwZW9mIHJlcXVlc3QucGFyc2VyID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHBhcnNlciA9IHtcbiAgICAgICAgICBkYXRhOiByZXF1ZXN0LnBhcnNlclxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiByZXF1ZXN0LnBhcnNlciA9PT0gJ29iamVjdCcgJiYgcmVxdWVzdC5wYXJzZXIpIHtcbiAgICAgICAgY2hlY2tUeXBlKHBhcnNlciwgcGFyc2VyUGFyYW1ldGVycywgJ3BhcnNlciBmb3IgYXNzZXQgXCInICsgbmFtZSArICdcIicpXG4gICAgICAgIGlmICghKCdvbkRhdGEnIGluIHBhcnNlcikpIHtcbiAgICAgICAgICByYWlzZSgnbWlzc2luZyBvbkRhdGEgY2FsbGJhY2sgZm9yIHBhcnNlciBpbiBhc3NldCBcIicgKyBuYW1lICsgJ1wiJylcbiAgICAgICAgfVxuICAgICAgICBwYXJzZXIgPSB7XG4gICAgICAgICAgZGF0YTogZ2V0UGFyc2VGdW5jKCdvbkRhdGEnKSxcbiAgICAgICAgICBkb25lOiBnZXRQYXJzZUZ1bmMoJ29uRG9uZScpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJhaXNlKCdpbnZhbGlkIHBhcnNlciBmb3IgYXNzZXQgXCInICsgbmFtZSArICdcIicpXG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIG5hbWU6IG5hbWUsXG4gICAgICB0eXBlOiBnZXRQYXJhbWV0ZXIoJ3R5cGUnLCBPYmplY3Qua2V5cyhsb2FkZXJzKSwgJ3RleHQnKSxcbiAgICAgIHN0cmVhbTogISFyZXF1ZXN0LnN0cmVhbSxcbiAgICAgIGNyZWRlbnRpYWxzOiAhIXJlcXVlc3QuY3JlZGVudGlhbHMsXG4gICAgICBzcmM6IGdldFN0cmluZygnc3JjJywgdHJ1ZSwgJycpLFxuICAgICAgcGFyc2VyOiBwYXJzZXJcbiAgICB9XG4gIH0pLm1hcChmdW5jdGlvbiAocmVxdWVzdCkge1xuICAgIHJldHVybiAobG9hZGVyc1tyZXF1ZXN0LnR5cGVdKShyZXF1ZXN0KVxuICB9KVxuXG4gIGZ1bmN0aW9uIGFib3J0IChtZXNzYWdlKSB7XG4gICAgaWYgKHN0YXRlID09PSBTVEFURV9FUlJPUiB8fCBzdGF0ZSA9PT0gU1RBVEVfQ09NUExFVEUpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBzdGF0ZSA9IFNUQVRFX0VSUk9SXG4gICAgcGVuZGluZy5mb3JFYWNoKGZ1bmN0aW9uIChsb2FkZXIpIHtcbiAgICAgIGxvYWRlci5jYW5jZWwoKVxuICAgIH0pXG4gICAgaWYgKG9uRXJyb3IpIHtcbiAgICAgIGlmICh0eXBlb2YgbWVzc2FnZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgb25FcnJvcihuZXcgRXJyb3IoJ3Jlc2w6ICcgKyBtZXNzYWdlKSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG9uRXJyb3IobWVzc2FnZSlcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5lcnJvcigncmVzbCBlcnJvcjonLCBtZXNzYWdlKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIG5vdGlmeVByb2dyZXNzIChtZXNzYWdlKSB7XG4gICAgaWYgKHN0YXRlID09PSBTVEFURV9FUlJPUiB8fCBzdGF0ZSA9PT0gU1RBVEVfQ09NUExFVEUpIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIHZhciBwcm9ncmVzcyA9IDBcbiAgICB2YXIgbnVtUmVhZHkgPSAwXG4gICAgcGVuZGluZy5mb3JFYWNoKGZ1bmN0aW9uIChsb2FkZXIpIHtcbiAgICAgIGlmIChsb2FkZXIucmVhZHkpIHtcbiAgICAgICAgbnVtUmVhZHkgKz0gMVxuICAgICAgfVxuICAgICAgcHJvZ3Jlc3MgKz0gbG9hZGVyLnByb2dyZXNzXG4gICAgfSlcblxuICAgIGlmIChudW1SZWFkeSA9PT0gcGVuZGluZy5sZW5ndGgpIHtcbiAgICAgIHN0YXRlID0gU1RBVEVfQ09NUExFVEVcbiAgICAgIG9uRG9uZShhc3NldHMpXG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChvblByb2dyZXNzKSB7XG4gICAgICAgIG9uUHJvZ3Jlc3MocHJvZ3Jlc3MgLyBwZW5kaW5nLmxlbmd0aCwgbWVzc2FnZSlcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBpZiAocGVuZGluZy5sZW5ndGggPT09IDApIHtcbiAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgIG5vdGlmeVByb2dyZXNzKCdkb25lJylcbiAgICB9LCAxKVxuICB9XG59XG4iLCJcbnZhciBleHRlbmQgPSByZXF1aXJlKCcuL2xpYi91dGlsL2V4dGVuZCcpXG52YXIgZHluYW1pYyA9IHJlcXVpcmUoJy4vbGliL2R5bmFtaWMnKVxudmFyIHJhZiA9IHJlcXVpcmUoJy4vbGliL3V0aWwvcmFmJylcbnZhciBjbG9jayA9IHJlcXVpcmUoJy4vbGliL3V0aWwvY2xvY2snKVxudmFyIGNyZWF0ZVN0cmluZ1N0b3JlID0gcmVxdWlyZSgnLi9saWIvc3RyaW5ncycpXG52YXIgaW5pdFdlYkdMID0gcmVxdWlyZSgnLi9saWIvd2ViZ2wnKVxudmFyIHdyYXBFeHRlbnNpb25zID0gcmVxdWlyZSgnLi9saWIvZXh0ZW5zaW9uJylcbnZhciB3cmFwTGltaXRzID0gcmVxdWlyZSgnLi9saWIvbGltaXRzJylcbnZhciB3cmFwQnVmZmVycyA9IHJlcXVpcmUoJy4vbGliL2J1ZmZlcicpXG52YXIgd3JhcEVsZW1lbnRzID0gcmVxdWlyZSgnLi9saWIvZWxlbWVudHMnKVxudmFyIHdyYXBUZXh0dXJlcyA9IHJlcXVpcmUoJy4vbGliL3RleHR1cmUnKVxudmFyIHdyYXBSZW5kZXJidWZmZXJzID0gcmVxdWlyZSgnLi9saWIvcmVuZGVyYnVmZmVyJylcbnZhciB3cmFwRnJhbWVidWZmZXJzID0gcmVxdWlyZSgnLi9saWIvZnJhbWVidWZmZXInKVxudmFyIHdyYXBBdHRyaWJ1dGVzID0gcmVxdWlyZSgnLi9saWIvYXR0cmlidXRlJylcbnZhciB3cmFwU2hhZGVycyA9IHJlcXVpcmUoJy4vbGliL3NoYWRlcicpXG52YXIgd3JhcFJlYWQgPSByZXF1aXJlKCcuL2xpYi9yZWFkJylcbnZhciBjcmVhdGVDb3JlID0gcmVxdWlyZSgnLi9saWIvY29yZScpXG52YXIgY3JlYXRlU3RhdHMgPSByZXF1aXJlKCcuL2xpYi9zdGF0cycpXG52YXIgY3JlYXRlVGltZXIgPSByZXF1aXJlKCcuL2xpYi90aW1lcicpXG5cbnZhciBHTF9DT0xPUl9CVUZGRVJfQklUID0gMTYzODRcbnZhciBHTF9ERVBUSF9CVUZGRVJfQklUID0gMjU2XG52YXIgR0xfU1RFTkNJTF9CVUZGRVJfQklUID0gMTAyNFxuXG52YXIgR0xfQVJSQVlfQlVGRkVSID0gMzQ5NjJcblxudmFyIENPTlRFWFRfTE9TVF9FVkVOVCA9ICd3ZWJnbGNvbnRleHRsb3N0J1xudmFyIENPTlRFWFRfUkVTVE9SRURfRVZFTlQgPSAnd2ViZ2xjb250ZXh0cmVzdG9yZWQnXG5cbnZhciBEWU5fUFJPUCA9IDFcbnZhciBEWU5fQ09OVEVYVCA9IDJcbnZhciBEWU5fU1RBVEUgPSAzXG5cbmZ1bmN0aW9uIGZpbmQgKGhheXN0YWNrLCBuZWVkbGUpIHtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBoYXlzdGFjay5sZW5ndGg7ICsraSkge1xuICAgIGlmIChoYXlzdGFja1tpXSA9PT0gbmVlZGxlKSB7XG4gICAgICByZXR1cm4gaVxuICAgIH1cbiAgfVxuICByZXR1cm4gLTFcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwUkVHTCAoYXJncykge1xuICB2YXIgY29uZmlnID0gaW5pdFdlYkdMKGFyZ3MpXG4gIGlmICghY29uZmlnKSB7XG4gICAgcmV0dXJuIG51bGxcbiAgfVxuXG4gIHZhciBnbCA9IGNvbmZpZy5nbFxuICB2YXIgZ2xBdHRyaWJ1dGVzID0gZ2wuZ2V0Q29udGV4dEF0dHJpYnV0ZXMoKVxuICB2YXIgY29udGV4dExvc3QgPSBnbC5pc0NvbnRleHRMb3N0KClcblxuICB2YXIgZXh0ZW5zaW9uU3RhdGUgPSB3cmFwRXh0ZW5zaW9ucyhnbCwgY29uZmlnKVxuICBpZiAoIWV4dGVuc2lvblN0YXRlKSB7XG4gICAgcmV0dXJuIG51bGxcbiAgfVxuXG4gIHZhciBzdHJpbmdTdG9yZSA9IGNyZWF0ZVN0cmluZ1N0b3JlKClcbiAgdmFyIHN0YXRzID0gY3JlYXRlU3RhdHMoKVxuICB2YXIgZXh0ZW5zaW9ucyA9IGV4dGVuc2lvblN0YXRlLmV4dGVuc2lvbnNcbiAgdmFyIHRpbWVyID0gY3JlYXRlVGltZXIoZ2wsIGV4dGVuc2lvbnMpXG5cbiAgdmFyIFNUQVJUX1RJTUUgPSBjbG9jaygpXG4gIHZhciBXSURUSCA9IGdsLmRyYXdpbmdCdWZmZXJXaWR0aFxuICB2YXIgSEVJR0hUID0gZ2wuZHJhd2luZ0J1ZmZlckhlaWdodFxuXG4gIHZhciBjb250ZXh0U3RhdGUgPSB7XG4gICAgdGljazogMCxcbiAgICB0aW1lOiAwLFxuICAgIHZpZXdwb3J0V2lkdGg6IFdJRFRILFxuICAgIHZpZXdwb3J0SGVpZ2h0OiBIRUlHSFQsXG4gICAgZnJhbWVidWZmZXJXaWR0aDogV0lEVEgsXG4gICAgZnJhbWVidWZmZXJIZWlnaHQ6IEhFSUdIVCxcbiAgICBkcmF3aW5nQnVmZmVyV2lkdGg6IFdJRFRILFxuICAgIGRyYXdpbmdCdWZmZXJIZWlnaHQ6IEhFSUdIVCxcbiAgICBwaXhlbFJhdGlvOiBjb25maWcucGl4ZWxSYXRpb1xuICB9XG4gIHZhciB1bmlmb3JtU3RhdGUgPSB7fVxuICB2YXIgZHJhd1N0YXRlID0ge1xuICAgIGVsZW1lbnRzOiBudWxsLFxuICAgIHByaW1pdGl2ZTogNCwgLy8gR0xfVFJJQU5HTEVTXG4gICAgY291bnQ6IC0xLFxuICAgIG9mZnNldDogMCxcbiAgICBpbnN0YW5jZXM6IC0xXG4gIH1cblxuICB2YXIgbGltaXRzID0gd3JhcExpbWl0cyhnbCwgZXh0ZW5zaW9ucylcbiAgdmFyIGJ1ZmZlclN0YXRlID0gd3JhcEJ1ZmZlcnMoZ2wsIHN0YXRzLCBjb25maWcpXG4gIHZhciBlbGVtZW50U3RhdGUgPSB3cmFwRWxlbWVudHMoZ2wsIGV4dGVuc2lvbnMsIGJ1ZmZlclN0YXRlLCBzdGF0cylcbiAgdmFyIGF0dHJpYnV0ZVN0YXRlID0gd3JhcEF0dHJpYnV0ZXMoXG4gICAgZ2wsXG4gICAgZXh0ZW5zaW9ucyxcbiAgICBsaW1pdHMsXG4gICAgYnVmZmVyU3RhdGUsXG4gICAgc3RyaW5nU3RvcmUpXG4gIHZhciBzaGFkZXJTdGF0ZSA9IHdyYXBTaGFkZXJzKGdsLCBzdHJpbmdTdG9yZSwgc3RhdHMsIGNvbmZpZylcbiAgdmFyIHRleHR1cmVTdGF0ZSA9IHdyYXBUZXh0dXJlcyhcbiAgICBnbCxcbiAgICBleHRlbnNpb25zLFxuICAgIGxpbWl0cyxcbiAgICBmdW5jdGlvbiAoKSB7IGNvcmUucHJvY3MucG9sbCgpIH0sXG4gICAgY29udGV4dFN0YXRlLFxuICAgIHN0YXRzLFxuICAgIGNvbmZpZylcbiAgdmFyIHJlbmRlcmJ1ZmZlclN0YXRlID0gd3JhcFJlbmRlcmJ1ZmZlcnMoZ2wsIGV4dGVuc2lvbnMsIGxpbWl0cywgc3RhdHMsIGNvbmZpZylcbiAgdmFyIGZyYW1lYnVmZmVyU3RhdGUgPSB3cmFwRnJhbWVidWZmZXJzKFxuICAgIGdsLFxuICAgIGV4dGVuc2lvbnMsXG4gICAgbGltaXRzLFxuICAgIHRleHR1cmVTdGF0ZSxcbiAgICByZW5kZXJidWZmZXJTdGF0ZSxcbiAgICBzdGF0cylcbiAgdmFyIGNvcmUgPSBjcmVhdGVDb3JlKFxuICAgIGdsLFxuICAgIHN0cmluZ1N0b3JlLFxuICAgIGV4dGVuc2lvbnMsXG4gICAgbGltaXRzLFxuICAgIGJ1ZmZlclN0YXRlLFxuICAgIGVsZW1lbnRTdGF0ZSxcbiAgICB0ZXh0dXJlU3RhdGUsXG4gICAgZnJhbWVidWZmZXJTdGF0ZSxcbiAgICB1bmlmb3JtU3RhdGUsXG4gICAgYXR0cmlidXRlU3RhdGUsXG4gICAgc2hhZGVyU3RhdGUsXG4gICAgZHJhd1N0YXRlLFxuICAgIGNvbnRleHRTdGF0ZSxcbiAgICB0aW1lcixcbiAgICBjb25maWcpXG4gIHZhciByZWFkUGl4ZWxzID0gd3JhcFJlYWQoXG4gICAgZ2wsXG4gICAgZnJhbWVidWZmZXJTdGF0ZSxcbiAgICBjb3JlLnByb2NzLnBvbGwsXG4gICAgY29udGV4dFN0YXRlLFxuICAgIGdsQXR0cmlidXRlcywgZXh0ZW5zaW9ucylcblxuICB2YXIgbmV4dFN0YXRlID0gY29yZS5uZXh0XG4gIHZhciBjYW52YXMgPSBnbC5jYW52YXNcblxuICB2YXIgcmFmQ2FsbGJhY2tzID0gW11cbiAgdmFyIGxvc3NDYWxsYmFja3MgPSBbXVxuICB2YXIgcmVzdG9yZUNhbGxiYWNrcyA9IFtdXG4gIHZhciBkZXN0cm95Q2FsbGJhY2tzID0gW2NvbmZpZy5vbkRlc3Ryb3ldXG5cbiAgdmFyIGFjdGl2ZVJBRiA9IG51bGxcbiAgZnVuY3Rpb24gaGFuZGxlUkFGICgpIHtcbiAgICBpZiAocmFmQ2FsbGJhY2tzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgaWYgKHRpbWVyKSB7XG4gICAgICAgIHRpbWVyLnVwZGF0ZSgpXG4gICAgICB9XG4gICAgICBhY3RpdmVSQUYgPSBudWxsXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICAvLyBzY2hlZHVsZSBuZXh0IGFuaW1hdGlvbiBmcmFtZVxuICAgIGFjdGl2ZVJBRiA9IHJhZi5uZXh0KGhhbmRsZVJBRilcblxuICAgIC8vIHBvbGwgZm9yIGNoYW5nZXNcbiAgICBwb2xsKClcblxuICAgIC8vIGZpcmUgYSBjYWxsYmFjayBmb3IgYWxsIHBlbmRpbmcgcmFmc1xuICAgIGZvciAodmFyIGkgPSByYWZDYWxsYmFja3MubGVuZ3RoIC0gMTsgaSA+PSAwOyAtLWkpIHtcbiAgICAgIHZhciBjYiA9IHJhZkNhbGxiYWNrc1tpXVxuICAgICAgaWYgKGNiKSB7XG4gICAgICAgIGNiKGNvbnRleHRTdGF0ZSwgbnVsbCwgMClcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBmbHVzaCBhbGwgcGVuZGluZyB3ZWJnbCBjYWxsc1xuICAgIGdsLmZsdXNoKClcblxuICAgIC8vIHBvbGwgR1BVIHRpbWVycyAqYWZ0ZXIqIGdsLmZsdXNoIHNvIHdlIGRvbid0IGRlbGF5IGNvbW1hbmQgZGlzcGF0Y2hcbiAgICBpZiAodGltZXIpIHtcbiAgICAgIHRpbWVyLnVwZGF0ZSgpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc3RhcnRSQUYgKCkge1xuICAgIGlmICghYWN0aXZlUkFGICYmIHJhZkNhbGxiYWNrcy5sZW5ndGggPiAwKSB7XG4gICAgICBhY3RpdmVSQUYgPSByYWYubmV4dChoYW5kbGVSQUYpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc3RvcFJBRiAoKSB7XG4gICAgaWYgKGFjdGl2ZVJBRikge1xuICAgICAgcmFmLmNhbmNlbChoYW5kbGVSQUYpXG4gICAgICBhY3RpdmVSQUYgPSBudWxsXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaGFuZGxlQ29udGV4dExvc3MgKGV2ZW50KSB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKVxuXG4gICAgLy8gc2V0IGNvbnRleHQgbG9zdCBmbGFnXG4gICAgY29udGV4dExvc3QgPSB0cnVlXG5cbiAgICAvLyBwYXVzZSByZXF1ZXN0IGFuaW1hdGlvbiBmcmFtZVxuICAgIHN0b3BSQUYoKVxuXG4gICAgLy8gbG9zZSBjb250ZXh0XG4gICAgbG9zc0NhbGxiYWNrcy5mb3JFYWNoKGZ1bmN0aW9uIChjYikge1xuICAgICAgY2IoKVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVDb250ZXh0UmVzdG9yZWQgKGV2ZW50KSB7XG4gICAgLy8gY2xlYXIgZXJyb3IgY29kZVxuICAgIGdsLmdldEVycm9yKClcblxuICAgIC8vIGNsZWFyIGNvbnRleHQgbG9zdCBmbGFnXG4gICAgY29udGV4dExvc3QgPSBmYWxzZVxuXG4gICAgLy8gcmVmcmVzaCBzdGF0ZVxuICAgIGV4dGVuc2lvblN0YXRlLnJlc3RvcmUoKVxuICAgIHNoYWRlclN0YXRlLnJlc3RvcmUoKVxuICAgIGJ1ZmZlclN0YXRlLnJlc3RvcmUoKVxuICAgIHRleHR1cmVTdGF0ZS5yZXN0b3JlKClcbiAgICByZW5kZXJidWZmZXJTdGF0ZS5yZXN0b3JlKClcbiAgICBmcmFtZWJ1ZmZlclN0YXRlLnJlc3RvcmUoKVxuICAgIGlmICh0aW1lcikge1xuICAgICAgdGltZXIucmVzdG9yZSgpXG4gICAgfVxuXG4gICAgLy8gcmVmcmVzaCBzdGF0ZVxuICAgIGNvcmUucHJvY3MucmVmcmVzaCgpXG5cbiAgICAvLyByZXN0YXJ0IFJBRlxuICAgIHN0YXJ0UkFGKClcblxuICAgIC8vIHJlc3RvcmUgY29udGV4dFxuICAgIHJlc3RvcmVDYWxsYmFja3MuZm9yRWFjaChmdW5jdGlvbiAoY2IpIHtcbiAgICAgIGNiKClcbiAgICB9KVxuICB9XG5cbiAgaWYgKGNhbnZhcykge1xuICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKENPTlRFWFRfTE9TVF9FVkVOVCwgaGFuZGxlQ29udGV4dExvc3MsIGZhbHNlKVxuICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKENPTlRFWFRfUkVTVE9SRURfRVZFTlQsIGhhbmRsZUNvbnRleHRSZXN0b3JlZCwgZmFsc2UpXG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95ICgpIHtcbiAgICByYWZDYWxsYmFja3MubGVuZ3RoID0gMFxuICAgIHN0b3BSQUYoKVxuXG4gICAgaWYgKGNhbnZhcykge1xuICAgICAgY2FudmFzLnJlbW92ZUV2ZW50TGlzdGVuZXIoQ09OVEVYVF9MT1NUX0VWRU5ULCBoYW5kbGVDb250ZXh0TG9zcylcbiAgICAgIGNhbnZhcy5yZW1vdmVFdmVudExpc3RlbmVyKENPTlRFWFRfUkVTVE9SRURfRVZFTlQsIGhhbmRsZUNvbnRleHRSZXN0b3JlZClcbiAgICB9XG5cbiAgICBzaGFkZXJTdGF0ZS5jbGVhcigpXG4gICAgZnJhbWVidWZmZXJTdGF0ZS5jbGVhcigpXG4gICAgcmVuZGVyYnVmZmVyU3RhdGUuY2xlYXIoKVxuICAgIHRleHR1cmVTdGF0ZS5jbGVhcigpXG4gICAgZWxlbWVudFN0YXRlLmNsZWFyKClcbiAgICBidWZmZXJTdGF0ZS5jbGVhcigpXG5cbiAgICBpZiAodGltZXIpIHtcbiAgICAgIHRpbWVyLmNsZWFyKClcbiAgICB9XG5cbiAgICBkZXN0cm95Q2FsbGJhY2tzLmZvckVhY2goZnVuY3Rpb24gKGNiKSB7XG4gICAgICBjYigpXG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGNvbXBpbGVQcm9jZWR1cmUgKG9wdGlvbnMpIHtcbiAgICBcbiAgICBcblxuICAgIGZ1bmN0aW9uIGZsYXR0ZW5OZXN0ZWRPcHRpb25zIChvcHRpb25zKSB7XG4gICAgICB2YXIgcmVzdWx0ID0gZXh0ZW5kKHt9LCBvcHRpb25zKVxuICAgICAgZGVsZXRlIHJlc3VsdC51bmlmb3Jtc1xuICAgICAgZGVsZXRlIHJlc3VsdC5hdHRyaWJ1dGVzXG4gICAgICBkZWxldGUgcmVzdWx0LmNvbnRleHRcblxuICAgICAgaWYgKCdzdGVuY2lsJyBpbiByZXN1bHQgJiYgcmVzdWx0LnN0ZW5jaWwub3ApIHtcbiAgICAgICAgcmVzdWx0LnN0ZW5jaWwub3BCYWNrID0gcmVzdWx0LnN0ZW5jaWwub3BGcm9udCA9IHJlc3VsdC5zdGVuY2lsLm9wXG4gICAgICAgIGRlbGV0ZSByZXN1bHQuc3RlbmNpbC5vcFxuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBtZXJnZSAobmFtZSkge1xuICAgICAgICBpZiAobmFtZSBpbiByZXN1bHQpIHtcbiAgICAgICAgICB2YXIgY2hpbGQgPSByZXN1bHRbbmFtZV1cbiAgICAgICAgICBkZWxldGUgcmVzdWx0W25hbWVdXG4gICAgICAgICAgT2JqZWN0LmtleXMoY2hpbGQpLmZvckVhY2goZnVuY3Rpb24gKHByb3ApIHtcbiAgICAgICAgICAgIHJlc3VsdFtuYW1lICsgJy4nICsgcHJvcF0gPSBjaGlsZFtwcm9wXVxuICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIG1lcmdlKCdibGVuZCcpXG4gICAgICBtZXJnZSgnZGVwdGgnKVxuICAgICAgbWVyZ2UoJ2N1bGwnKVxuICAgICAgbWVyZ2UoJ3N0ZW5jaWwnKVxuICAgICAgbWVyZ2UoJ3BvbHlnb25PZmZzZXQnKVxuICAgICAgbWVyZ2UoJ3NjaXNzb3InKVxuICAgICAgbWVyZ2UoJ3NhbXBsZScpXG5cbiAgICAgIHJldHVybiByZXN1bHRcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzZXBhcmF0ZUR5bmFtaWMgKG9iamVjdCkge1xuICAgICAgdmFyIHN0YXRpY0l0ZW1zID0ge31cbiAgICAgIHZhciBkeW5hbWljSXRlbXMgPSB7fVxuICAgICAgT2JqZWN0LmtleXMob2JqZWN0KS5mb3JFYWNoKGZ1bmN0aW9uIChvcHRpb24pIHtcbiAgICAgICAgdmFyIHZhbHVlID0gb2JqZWN0W29wdGlvbl1cbiAgICAgICAgaWYgKGR5bmFtaWMuaXNEeW5hbWljKHZhbHVlKSkge1xuICAgICAgICAgIGR5bmFtaWNJdGVtc1tvcHRpb25dID0gZHluYW1pYy51bmJveCh2YWx1ZSwgb3B0aW9uKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHN0YXRpY0l0ZW1zW29wdGlvbl0gPSB2YWx1ZVxuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgZHluYW1pYzogZHluYW1pY0l0ZW1zLFxuICAgICAgICBzdGF0aWM6IHN0YXRpY0l0ZW1zXG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gVHJlYXQgY29udGV4dCB2YXJpYWJsZXMgc2VwYXJhdGUgZnJvbSBvdGhlciBkeW5hbWljIHZhcmlhYmxlc1xuICAgIHZhciBjb250ZXh0ID0gc2VwYXJhdGVEeW5hbWljKG9wdGlvbnMuY29udGV4dCB8fCB7fSlcbiAgICB2YXIgdW5pZm9ybXMgPSBzZXBhcmF0ZUR5bmFtaWMob3B0aW9ucy51bmlmb3JtcyB8fCB7fSlcbiAgICB2YXIgYXR0cmlidXRlcyA9IHNlcGFyYXRlRHluYW1pYyhvcHRpb25zLmF0dHJpYnV0ZXMgfHwge30pXG4gICAgdmFyIG9wdHMgPSBzZXBhcmF0ZUR5bmFtaWMoZmxhdHRlbk5lc3RlZE9wdGlvbnMob3B0aW9ucykpXG5cbiAgICB2YXIgc3RhdHMgPSB7XG4gICAgICBncHVUaW1lOiAwLjAsXG4gICAgICBjcHVUaW1lOiAwLjAsXG4gICAgICBjb3VudDogMFxuICAgIH1cblxuICAgIHZhciBjb21waWxlZCA9IGNvcmUuY29tcGlsZShvcHRzLCBhdHRyaWJ1dGVzLCB1bmlmb3JtcywgY29udGV4dCwgc3RhdHMpXG5cbiAgICB2YXIgZHJhdyA9IGNvbXBpbGVkLmRyYXdcbiAgICB2YXIgYmF0Y2ggPSBjb21waWxlZC5iYXRjaFxuICAgIHZhciBzY29wZSA9IGNvbXBpbGVkLnNjb3BlXG5cbiAgICAvLyBGSVhNRTogd2Ugc2hvdWxkIG1vZGlmeSBjb2RlIGdlbmVyYXRpb24gZm9yIGJhdGNoIGNvbW1hbmRzIHNvIHRoaXNcbiAgICAvLyBpc24ndCBuZWNlc3NhcnlcbiAgICB2YXIgRU1QVFlfQVJSQVkgPSBbXVxuICAgIGZ1bmN0aW9uIHJlc2VydmUgKGNvdW50KSB7XG4gICAgICB3aGlsZSAoRU1QVFlfQVJSQVkubGVuZ3RoIDwgY291bnQpIHtcbiAgICAgICAgRU1QVFlfQVJSQVkucHVzaChudWxsKVxuICAgICAgfVxuICAgICAgcmV0dXJuIEVNUFRZX0FSUkFZXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gUkVHTENvbW1hbmQgKGFyZ3MsIGJvZHkpIHtcbiAgICAgIHZhciBpXG4gICAgICBpZiAoY29udGV4dExvc3QpIHtcbiAgICAgICAgXG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIGFyZ3MgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgcmV0dXJuIHNjb3BlLmNhbGwodGhpcywgbnVsbCwgYXJncywgMClcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGJvZHkgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBhcmdzID09PSAnbnVtYmVyJykge1xuICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBhcmdzOyArK2kpIHtcbiAgICAgICAgICAgIHNjb3BlLmNhbGwodGhpcywgbnVsbCwgYm9keSwgaSlcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShhcmdzKSkge1xuICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBhcmdzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgICBzY29wZS5jYWxsKHRoaXMsIGFyZ3NbaV0sIGJvZHksIGkpXG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVyblxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBzY29wZS5jYWxsKHRoaXMsIGFyZ3MsIGJvZHksIDApXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGFyZ3MgPT09ICdudW1iZXInKSB7XG4gICAgICAgIGlmIChhcmdzID4gMCkge1xuICAgICAgICAgIHJldHVybiBiYXRjaC5jYWxsKHRoaXMsIHJlc2VydmUoYXJncyB8IDApLCBhcmdzIHwgMClcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGFyZ3MpKSB7XG4gICAgICAgIGlmIChhcmdzLmxlbmd0aCkge1xuICAgICAgICAgIHJldHVybiBiYXRjaC5jYWxsKHRoaXMsIGFyZ3MsIGFyZ3MubGVuZ3RoKVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZHJhdy5jYWxsKHRoaXMsIGFyZ3MpXG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGV4dGVuZChSRUdMQ29tbWFuZCwge1xuICAgICAgc3RhdHM6IHN0YXRzXG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGNsZWFyIChvcHRpb25zKSB7XG4gICAgXG5cbiAgICB2YXIgY2xlYXJGbGFncyA9IDBcbiAgICBjb3JlLnByb2NzLnBvbGwoKVxuXG4gICAgdmFyIGMgPSBvcHRpb25zLmNvbG9yXG4gICAgaWYgKGMpIHtcbiAgICAgIGdsLmNsZWFyQ29sb3IoK2NbMF0gfHwgMCwgK2NbMV0gfHwgMCwgK2NbMl0gfHwgMCwgK2NbM10gfHwgMClcbiAgICAgIGNsZWFyRmxhZ3MgfD0gR0xfQ09MT1JfQlVGRkVSX0JJVFxuICAgIH1cbiAgICBpZiAoJ2RlcHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICBnbC5jbGVhckRlcHRoKCtvcHRpb25zLmRlcHRoKVxuICAgICAgY2xlYXJGbGFncyB8PSBHTF9ERVBUSF9CVUZGRVJfQklUXG4gICAgfVxuICAgIGlmICgnc3RlbmNpbCcgaW4gb3B0aW9ucykge1xuICAgICAgZ2wuY2xlYXJTdGVuY2lsKG9wdGlvbnMuc3RlbmNpbCB8IDApXG4gICAgICBjbGVhckZsYWdzIHw9IEdMX1NURU5DSUxfQlVGRkVSX0JJVFxuICAgIH1cblxuICAgIFxuICAgIGdsLmNsZWFyKGNsZWFyRmxhZ3MpXG4gIH1cblxuICBmdW5jdGlvbiBmcmFtZSAoY2IpIHtcbiAgICBcbiAgICByYWZDYWxsYmFja3MucHVzaChjYilcblxuICAgIGZ1bmN0aW9uIGNhbmNlbCAoKSB7XG4gICAgICAvLyBGSVhNRTogIHNob3VsZCB3ZSBjaGVjayBzb21ldGhpbmcgb3RoZXIgdGhhbiBlcXVhbHMgY2IgaGVyZT9cbiAgICAgIC8vIHdoYXQgaWYgYSB1c2VyIGNhbGxzIGZyYW1lIHR3aWNlIHdpdGggdGhlIHNhbWUgY2FsbGJhY2suLi5cbiAgICAgIC8vXG4gICAgICB2YXIgaSA9IGZpbmQocmFmQ2FsbGJhY2tzLCBjYilcbiAgICAgIFxuICAgICAgZnVuY3Rpb24gcGVuZGluZ0NhbmNlbCAoKSB7XG4gICAgICAgIHZhciBpbmRleCA9IGZpbmQocmFmQ2FsbGJhY2tzLCBwZW5kaW5nQ2FuY2VsKVxuICAgICAgICByYWZDYWxsYmFja3NbaW5kZXhdID0gcmFmQ2FsbGJhY2tzW3JhZkNhbGxiYWNrcy5sZW5ndGggLSAxXVxuICAgICAgICByYWZDYWxsYmFja3MubGVuZ3RoIC09IDFcbiAgICAgICAgaWYgKHJhZkNhbGxiYWNrcy5sZW5ndGggPD0gMCkge1xuICAgICAgICAgIHN0b3BSQUYoKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICByYWZDYWxsYmFja3NbaV0gPSBwZW5kaW5nQ2FuY2VsXG4gICAgfVxuXG4gICAgc3RhcnRSQUYoKVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGNhbmNlbDogY2FuY2VsXG4gICAgfVxuICB9XG5cbiAgLy8gcG9sbCB2aWV3cG9ydFxuICBmdW5jdGlvbiBwb2xsVmlld3BvcnQgKCkge1xuICAgIHZhciB2aWV3cG9ydCA9IG5leHRTdGF0ZS52aWV3cG9ydFxuICAgIHZhciBzY2lzc29yQm94ID0gbmV4dFN0YXRlLnNjaXNzb3JfYm94XG4gICAgdmlld3BvcnRbMF0gPSB2aWV3cG9ydFsxXSA9IHNjaXNzb3JCb3hbMF0gPSBzY2lzc29yQm94WzFdID0gMFxuICAgIGNvbnRleHRTdGF0ZS52aWV3cG9ydFdpZHRoID1cbiAgICAgIGNvbnRleHRTdGF0ZS5mcmFtZWJ1ZmZlcldpZHRoID1cbiAgICAgIGNvbnRleHRTdGF0ZS5kcmF3aW5nQnVmZmVyV2lkdGggPVxuICAgICAgdmlld3BvcnRbMl0gPVxuICAgICAgc2Npc3NvckJveFsyXSA9IGdsLmRyYXdpbmdCdWZmZXJXaWR0aFxuICAgIGNvbnRleHRTdGF0ZS52aWV3cG9ydEhlaWdodCA9XG4gICAgICBjb250ZXh0U3RhdGUuZnJhbWVidWZmZXJIZWlnaHQgPVxuICAgICAgY29udGV4dFN0YXRlLmRyYXdpbmdCdWZmZXJIZWlnaHQgPVxuICAgICAgdmlld3BvcnRbM10gPVxuICAgICAgc2Npc3NvckJveFszXSA9IGdsLmRyYXdpbmdCdWZmZXJIZWlnaHRcbiAgfVxuXG4gIGZ1bmN0aW9uIHBvbGwgKCkge1xuICAgIGNvbnRleHRTdGF0ZS50aWNrICs9IDFcbiAgICBjb250ZXh0U3RhdGUudGltZSA9IG5vdygpXG4gICAgcG9sbFZpZXdwb3J0KClcbiAgICBjb3JlLnByb2NzLnBvbGwoKVxuICB9XG5cbiAgZnVuY3Rpb24gcmVmcmVzaCAoKSB7XG4gICAgcG9sbFZpZXdwb3J0KClcbiAgICBjb3JlLnByb2NzLnJlZnJlc2goKVxuICAgIGlmICh0aW1lcikge1xuICAgICAgdGltZXIudXBkYXRlKClcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBub3cgKCkge1xuICAgIHJldHVybiAoY2xvY2soKSAtIFNUQVJUX1RJTUUpIC8gMTAwMC4wXG4gIH1cblxuICByZWZyZXNoKClcblxuICBmdW5jdGlvbiBhZGRMaXN0ZW5lciAoZXZlbnQsIGNhbGxiYWNrKSB7XG4gICAgXG5cbiAgICB2YXIgY2FsbGJhY2tzXG4gICAgc3dpdGNoIChldmVudCkge1xuICAgICAgY2FzZSAnZnJhbWUnOlxuICAgICAgICByZXR1cm4gZnJhbWUoY2FsbGJhY2spXG4gICAgICBjYXNlICdsb3N0JzpcbiAgICAgICAgY2FsbGJhY2tzID0gbG9zc0NhbGxiYWNrc1xuICAgICAgICBicmVha1xuICAgICAgY2FzZSAncmVzdG9yZSc6XG4gICAgICAgIGNhbGxiYWNrcyA9IHJlc3RvcmVDYWxsYmFja3NcbiAgICAgICAgYnJlYWtcbiAgICAgIGNhc2UgJ2Rlc3Ryb3knOlxuICAgICAgICBjYWxsYmFja3MgPSBkZXN0cm95Q2FsbGJhY2tzXG4gICAgICAgIGJyZWFrXG4gICAgICBkZWZhdWx0OlxuICAgICAgICBcbiAgICB9XG5cbiAgICBjYWxsYmFja3MucHVzaChjYWxsYmFjaylcbiAgICByZXR1cm4ge1xuICAgICAgY2FuY2VsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY2FsbGJhY2tzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgaWYgKGNhbGxiYWNrc1tpXSA9PT0gY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGNhbGxiYWNrc1tpXSA9IGNhbGxiYWNrc1tjYWxsYmFja3MubGVuZ3RoIC0gMV1cbiAgICAgICAgICAgIGNhbGxiYWNrcy5wb3AoKVxuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgdmFyIHJlZ2wgPSBleHRlbmQoY29tcGlsZVByb2NlZHVyZSwge1xuICAgIC8vIENsZWFyIGN1cnJlbnQgRkJPXG4gICAgY2xlYXI6IGNsZWFyLFxuXG4gICAgLy8gU2hvcnQgY3V0cyBmb3IgZHluYW1pYyB2YXJpYWJsZXNcbiAgICBwcm9wOiBkeW5hbWljLmRlZmluZS5iaW5kKG51bGwsIERZTl9QUk9QKSxcbiAgICBjb250ZXh0OiBkeW5hbWljLmRlZmluZS5iaW5kKG51bGwsIERZTl9DT05URVhUKSxcbiAgICB0aGlzOiBkeW5hbWljLmRlZmluZS5iaW5kKG51bGwsIERZTl9TVEFURSksXG5cbiAgICAvLyBleGVjdXRlcyBhbiBlbXB0eSBkcmF3IGNvbW1hbmRcbiAgICBkcmF3OiBjb21waWxlUHJvY2VkdXJlKHt9KSxcblxuICAgIC8vIFJlc291cmNlc1xuICAgIGJ1ZmZlcjogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgIHJldHVybiBidWZmZXJTdGF0ZS5jcmVhdGUob3B0aW9ucywgR0xfQVJSQVlfQlVGRkVSLCBmYWxzZSwgZmFsc2UpXG4gICAgfSxcbiAgICBlbGVtZW50czogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgIHJldHVybiBlbGVtZW50U3RhdGUuY3JlYXRlKG9wdGlvbnMsIGZhbHNlKVxuICAgIH0sXG4gICAgdGV4dHVyZTogdGV4dHVyZVN0YXRlLmNyZWF0ZTJELFxuICAgIGN1YmU6IHRleHR1cmVTdGF0ZS5jcmVhdGVDdWJlLFxuICAgIHJlbmRlcmJ1ZmZlcjogcmVuZGVyYnVmZmVyU3RhdGUuY3JlYXRlLFxuICAgIGZyYW1lYnVmZmVyOiBmcmFtZWJ1ZmZlclN0YXRlLmNyZWF0ZSxcbiAgICBmcmFtZWJ1ZmZlckN1YmU6IGZyYW1lYnVmZmVyU3RhdGUuY3JlYXRlQ3ViZSxcblxuICAgIC8vIEV4cG9zZSBjb250ZXh0IGF0dHJpYnV0ZXNcbiAgICBhdHRyaWJ1dGVzOiBnbEF0dHJpYnV0ZXMsXG5cbiAgICAvLyBGcmFtZSByZW5kZXJpbmdcbiAgICBmcmFtZTogZnJhbWUsXG4gICAgb246IGFkZExpc3RlbmVyLFxuXG4gICAgLy8gU3lzdGVtIGxpbWl0c1xuICAgIGxpbWl0czogbGltaXRzLFxuICAgIGhhc0V4dGVuc2lvbjogZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHJldHVybiBsaW1pdHMuZXh0ZW5zaW9ucy5pbmRleE9mKG5hbWUudG9Mb3dlckNhc2UoKSkgPj0gMFxuICAgIH0sXG5cbiAgICAvLyBSZWFkIHBpeGVsc1xuICAgIHJlYWQ6IHJlYWRQaXhlbHMsXG5cbiAgICAvLyBEZXN0cm95IHJlZ2wgYW5kIGFsbCBhc3NvY2lhdGVkIHJlc291cmNlc1xuICAgIGRlc3Ryb3k6IGRlc3Ryb3ksXG5cbiAgICAvLyBEaXJlY3QgR0wgc3RhdGUgbWFuaXB1bGF0aW9uXG4gICAgX2dsOiBnbCxcbiAgICBfcmVmcmVzaDogcmVmcmVzaCxcblxuICAgIHBvbGw6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHBvbGwoKVxuICAgICAgaWYgKHRpbWVyKSB7XG4gICAgICAgIHRpbWVyLnVwZGF0ZSgpXG4gICAgICB9XG4gICAgfSxcblxuICAgIC8vIEN1cnJlbnQgdGltZVxuICAgIG5vdzogbm93LFxuXG4gICAgLy8gcmVnbCBTdGF0aXN0aWNzIEluZm9ybWF0aW9uXG4gICAgc3RhdHM6IHN0YXRzXG4gIH0pXG5cbiAgY29uZmlnLm9uRG9uZShudWxsLCByZWdsKVxuXG4gIHJldHVybiByZWdsXG59XG4iXX0=
