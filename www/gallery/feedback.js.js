(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*
  tags: basic

 <p> This example shows how to use copyTexImage2D to implement feedback effects </p>
 */

var regl = require('../regl')();
var mouse = require('mouse-change')();

var pixels = regl.texture();

var drawFeedback = regl({
  frag: '\n  precision mediump float;\n  uniform sampler2D texture;\n  uniform vec2 mouse;\n  uniform float t;\n  varying vec2 uv;\n  void main () {\n    float dist = length(gl_FragCoord.xy - mouse);\n    gl_FragColor = vec4(0.98 * texture2D(texture,\n      uv + cos(t) * vec2(0.5 - uv.y, uv.x - 0.5) - sin(2.0 * t) * (uv - 0.5)).rgb, 1) +\n      exp(-0.01 * dist) * vec4(\n        1.0 + cos(2.0 * t),\n        1.0 + cos(2.0 * t + 1.5),\n        1.0 + cos(2.0 * t + 3.0),\n        0.0);\n  }',

  vert: '\n  precision mediump float;\n  attribute vec2 position;\n  varying vec2 uv;\n  void main () {\n    uv = position;\n    gl_Position = vec4(2.0 * position - 1.0, 0, 1);\n  }',

  attributes: {
    position: [-2, 0, 0, -2, 2, 2]
  },

  uniforms: {
    texture: pixels,
    mouse: function ({ pixelRatio, viewportHeight }) {
      return [mouse.x * pixelRatio, viewportHeight - mouse.y * pixelRatio];
    },
    t: function ({ tick }) {
      return 0.01 * tick;
    }
  },

  count: 3
});

regl.frame(function () {
  regl.clear({
    color: [0, 0, 0, 1]
  });

  drawFeedback();

  pixels({
    copy: true
  });
});

},{"../regl":37,"mouse-change":35}],2:[function(require,module,exports){
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
var check = require('./util/check');
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
        } else {
          check.raise('invalid buffer data');
        }
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
      } else {
        check.raise('invalid shape');
      }

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
    } else {
      check.raise('invalid buffer data');
    }
  }

  function destroy(buffer) {
    stats.bufferCount--;

    var handle = buffer.buffer;
    check(handle, 'buffer must not be deleted already');
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
        check.type(options, 'object', 'buffer arguments must be an object, a number or an array');

        if ('data' in options) {
          check(data === null || Array.isArray(data) || isTypedArray(data) || isNDArrayLike(data), 'invalid data for buffer');
          data = options.data;
        }

        if ('usage' in options) {
          check.parameter(options.usage, usageTypes, 'invalid buffer usage');
          usage = usageTypes[options.usage];
        }

        if ('type' in options) {
          check.parameter(options.type, bufferTypes, 'invalid buffer type');
          dtype = bufferTypes[options.type];
        }

        if ('dimension' in options) {
          check.type(options.dimension, 'number', 'invalid dimension');
          dimension = options.dimension | 0;
        }

        if ('length' in options) {
          check.nni(byteLength, 'buffer length must be a nonnegative integer');
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
      check(offset + data.byteLength <= buffer.byteLength, 'invalid buffer subdata call, buffer is too small. ' + ' Can\'t write data of size ' + data.byteLength + ' starting from offset ' + offset + ' to a buffer of size ' + buffer.byteLength);

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
          } else {
            check.raise('invalid buffer data');
          }
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
        } else {
          check.raise('invalid shape');
        }
        var dtype = Array.isArray(data.data) ? buffer.dtype : typedArrayCode(data.data);

        var transposeData = pool.allocType(dtype, shapeX * shapeY);
        transpose(transposeData, data.data, shapeX, shapeY, strideX, strideY, data.offset);
        setSubData(transposeData, offset);
        pool.freeType(transposeData);
      } else {
        check.raise('invalid data for buffer subdata');
      }
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

},{"./constants/arraytypes.json":4,"./constants/dtypes.json":5,"./constants/usage.json":7,"./util/check":21,"./util/flatten":25,"./util/is-ndarray":27,"./util/is-typed-array":28,"./util/pool":30,"./util/values":33}],4:[function(require,module,exports){
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
var check = require('./util/check');
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

  check.optional(function () {
    sharedState.isArrayLike = isArrayLike;
  });

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
    check.optional(function () {
      env.CHECK = link(check);
      env.commandStr = check.guessCommand();
      env.command = link(env.commandStr);
      env.assert = function (block, pred, message) {
        block('if(!(', pred, '))', this.CHECK, '.commandRaise(', link(message), ',', this.command, ');');
      };

      sharedConstants.invalidBlendCombinations = invalidBlendCombinations;
    });

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
        check.command(framebuffer, 'invalid framebuffer object');
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

        check.optional(function () {
          env.assert(scope, '!' + FRAMEBUFFER_FUNC + '||' + FRAMEBUFFER, 'invalid framebuffer object');
        });

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
        check.commandType(box, 'object', 'invalid ' + param, env.commandStr);

        var isStatic = true;
        var x = box.x | 0;
        var y = box.y | 0;
        var w, h;
        if ('width' in box) {
          w = box.width | 0;
          check.command(w >= 0, 'invalid ' + param, env.commandStr);
        } else {
          isStatic = false;
        }
        if ('height' in box) {
          h = box.height | 0;
          check.command(h >= 0, 'invalid ' + param, env.commandStr);
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

          check.optional(function () {
            env.assert(scope, BOX + '&&typeof ' + BOX + '==="object"', 'invalid ' + param);
          });

          var CONTEXT = env.shared.context;
          var BOX_X = scope.def(BOX, '.x|0');
          var BOX_Y = scope.def(BOX, '.y|0');
          var BOX_W = scope.def('"width" in ', BOX, '?', BOX, '.width|0:', '(', CONTEXT, '.', S_FRAMEBUFFER_WIDTH, '-', BOX_X, ')');
          var BOX_H = scope.def('"height" in ', BOX, '?', BOX, '.height|0:', '(', CONTEXT, '.', S_FRAMEBUFFER_HEIGHT, '-', BOX_Y, ')');

          check.optional(function () {
            env.assert(scope, BOX_W + '>=0&&' + BOX_H + '>=0', 'invalid ' + param);
          });

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
        check.optional(function () {
          shaderState.shader(shaderType[name], id, check.guessCommand());
        });
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
          check.optional(function () {
            scope(env.shared.shader, '.shader(', shaderType[name], ',', id, ',', env.command, ');');
          });
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
        check.optional(function () {
          progDef += ',' + env.command;
        });
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
          check.command(elements, 'invalid elements', env.commandStr);
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

          check.optional(function () {
            env.assert(ifte.else, '!' + elementDefn + '||' + elements, 'invalid elements');
          });

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
        check.commandParameter(primitive, primTypes, 'invalid primitve', env.commandStr);
        return createStaticDecl(function (env, scope) {
          return primTypes[primitive];
        });
      } else if (S_PRIMITIVE in dynamicOptions) {
        var dynPrimitive = dynamicOptions[S_PRIMITIVE];
        return createDynamicDecl(dynPrimitive, function (env, scope) {
          var PRIM_TYPES = env.constants.primTypes;
          var prim = env.invoke(scope, dynPrimitive);
          check.optional(function () {
            env.assert(scope, prim + ' in ' + PRIM_TYPES, 'invalid primitive, must be one of ' + Object.keys(primTypes));
          });
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
        check.command(!isOffset || value >= 0, 'invalid ' + param, env.commandStr);
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
            check.optional(function () {
              env.assert(scope, result + '>=0', 'invalid ' + param);
            });
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
        check.command(typeof count === 'number' && count >= 0, 'invalid vertex count', env.commandStr);
        return createStaticDecl(function () {
          return count;
        });
      } else if (S_COUNT in dynamicOptions) {
        var dynCount = dynamicOptions[S_COUNT];
        return createDynamicDecl(dynCount, function (env, scope) {
          var result = env.invoke(scope, dynCount);
          check.optional(function () {
            env.assert(scope, 'typeof ' + result + '==="number"&&' + result + '>=0&&' + result + '===(' + result + '|0)', 'invalid vertex count');
          });
          return result;
        });
      } else if (elements) {
        if (isStatic(elements)) {
          if (elements) {
            if (OFFSET) {
              return new Declaration(OFFSET.thisDep, OFFSET.contextDep, OFFSET.propDep, function (env, scope) {
                var result = scope.def(env.ELEMENTS, '.vertCount-', env.OFFSET);

                check.optional(function () {
                  env.assert(scope, result + '>=0', 'invalid vertex offset/element buffer too small');
                });

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
            check.optional(function () {
              result.MISSING = true;
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
          check.optional(function () {
            variable.DYNAMIC = true;
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
            check.commandType(value, 'boolean', prop, env.commandStr);
            return value;
          }, function (env, scope, value) {
            check.optional(function () {
              env.assert(scope, 'typeof ' + value + '==="boolean"', 'invalid flag ' + prop, env.commandStr);
            });
            return value;
          });

        case S_DEPTH_FUNC:
          return parseParam(function (value) {
            check.commandParameter(value, compareFuncs, 'invalid ' + prop, env.commandStr);
            return compareFuncs[value];
          }, function (env, scope, value) {
            var COMPARE_FUNCS = env.constants.compareFuncs;
            check.optional(function () {
              env.assert(scope, value + ' in ' + COMPARE_FUNCS, 'invalid ' + prop + ', must be one of ' + Object.keys(compareFuncs));
            });
            return scope.def(COMPARE_FUNCS, '[', value, ']');
          });

        case S_DEPTH_RANGE:
          return parseParam(function (value) {
            check.command(isArrayLike(value) && value.length === 2 && typeof value[0] === 'number' && typeof value[1] === 'number' && value[0] <= value[1], 'depth range is 2d array', env.commandStr);
            return value;
          }, function (env, scope, value) {
            check.optional(function () {
              env.assert(scope, env.shared.isArrayLike + '(' + value + ')&&' + value + '.length===2&&' + 'typeof ' + value + '[0]==="number"&&' + 'typeof ' + value + '[1]==="number"&&' + value + '[0]<=' + value + '[1]', 'depth range must be a 2d array');
            });

            var Z_NEAR = scope.def('+', value, '[0]');
            var Z_FAR = scope.def('+', value, '[1]');
            return [Z_NEAR, Z_FAR];
          });

        case S_BLEND_FUNC:
          return parseParam(function (value) {
            check.commandType(value, 'object', 'blend.func', env.commandStr);
            var srcRGB = 'srcRGB' in value ? value.srcRGB : value.src;
            var srcAlpha = 'srcAlpha' in value ? value.srcAlpha : value.src;
            var dstRGB = 'dstRGB' in value ? value.dstRGB : value.dst;
            var dstAlpha = 'dstAlpha' in value ? value.dstAlpha : value.dst;
            check.commandParameter(srcRGB, blendFuncs, param + '.srcRGB', env.commandStr);
            check.commandParameter(srcAlpha, blendFuncs, param + '.srcAlpha', env.commandStr);
            check.commandParameter(dstRGB, blendFuncs, param + '.dstRGB', env.commandStr);
            check.commandParameter(dstAlpha, blendFuncs, param + '.dstAlpha', env.commandStr);

            check.command(invalidBlendCombinations.indexOf(srcRGB + ', ' + dstRGB) === -1, 'unallowed blending combination (srcRGB, dstRGB) = (' + srcRGB + ', ' + dstRGB + ')', env.commandStr);

            return [blendFuncs[srcRGB], blendFuncs[dstRGB], blendFuncs[srcAlpha], blendFuncs[dstAlpha]];
          }, function (env, scope, value) {
            var BLEND_FUNCS = env.constants.blendFuncs;

            check.optional(function () {
              env.assert(scope, value + '&&typeof ' + value + '==="object"', 'invalid blend func, must be an object');
            });

            function read(prefix, suffix) {
              var func = scope.def('"', prefix, suffix, '" in ', value, '?', value, '.', prefix, suffix, ':', value, '.', prefix);

              check.optional(function () {
                env.assert(scope, func + ' in ' + BLEND_FUNCS, 'invalid ' + prop + '.' + prefix + suffix + ', must be one of ' + Object.keys(blendFuncs));
              });

              return func;
            }

            var srcRGB = read('src', 'RGB');
            var dstRGB = read('dst', 'RGB');

            check.optional(function () {
              var INVALID_BLEND_COMBINATIONS = env.constants.invalidBlendCombinations;

              env.assert(scope, INVALID_BLEND_COMBINATIONS + '.indexOf(' + srcRGB + '+", "+' + dstRGB + ') === -1 ', 'unallowed blending combination for (srcRGB, dstRGB)');
            });

            var SRC_RGB = scope.def(BLEND_FUNCS, '[', srcRGB, ']');
            var SRC_ALPHA = scope.def(BLEND_FUNCS, '[', read('src', 'Alpha'), ']');
            var DST_RGB = scope.def(BLEND_FUNCS, '[', dstRGB, ']');
            var DST_ALPHA = scope.def(BLEND_FUNCS, '[', read('dst', 'Alpha'), ']');

            return [SRC_RGB, DST_RGB, SRC_ALPHA, DST_ALPHA];
          });

        case S_BLEND_EQUATION:
          return parseParam(function (value) {
            if (typeof value === 'string') {
              check.commandParameter(value, blendEquations, 'invalid ' + prop, env.commandStr);
              return [blendEquations[value], blendEquations[value]];
            } else if (typeof value === 'object') {
              check.commandParameter(value.rgb, blendEquations, prop + '.rgb', env.commandStr);
              check.commandParameter(value.alpha, blendEquations, prop + '.alpha', env.commandStr);
              return [blendEquations[value.rgb], blendEquations[value.alpha]];
            } else {
              check.commandRaise('invalid blend.equation', env.commandStr);
            }
          }, function (env, scope, value) {
            var BLEND_EQUATIONS = env.constants.blendEquations;

            var RGB = scope.def();
            var ALPHA = scope.def();

            var ifte = env.cond('typeof ', value, '==="string"');

            check.optional(function () {
              function checkProp(block, name, value) {
                env.assert(block, value + ' in ' + BLEND_EQUATIONS, 'invalid ' + name + ', must be one of ' + Object.keys(blendEquations));
              }
              checkProp(ifte.then, prop, value);

              env.assert(ifte.else, value + '&&typeof ' + value + '==="object"', 'invalid ' + prop);
              checkProp(ifte.else, prop + '.rgb', value + '.rgb');
              checkProp(ifte.else, prop + '.alpha', value + '.alpha');
            });

            ifte.then(RGB, '=', ALPHA, '=', BLEND_EQUATIONS, '[', value, '];');
            ifte.else(RGB, '=', BLEND_EQUATIONS, '[', value, '.rgb];', ALPHA, '=', BLEND_EQUATIONS, '[', value, '.alpha];');

            scope(ifte);

            return [RGB, ALPHA];
          });

        case S_BLEND_COLOR:
          return parseParam(function (value) {
            check.command(isArrayLike(value) && value.length === 4, 'blend.color must be a 4d array', env.commandStr);
            return loop(4, function (i) {
              return +value[i];
            });
          }, function (env, scope, value) {
            check.optional(function () {
              env.assert(scope, env.shared.isArrayLike + '(' + value + ')&&' + value + '.length===4', 'blend.color must be a 4d array');
            });
            return loop(4, function (i) {
              return scope.def('+', value, '[', i, ']');
            });
          });

        case S_STENCIL_MASK:
          return parseParam(function (value) {
            check.commandType(value, 'number', param, env.commandStr);
            return value | 0;
          }, function (env, scope, value) {
            check.optional(function () {
              env.assert(scope, 'typeof ' + value + '==="number"', 'invalid stencil.mask');
            });
            return scope.def(value, '|0');
          });

        case S_STENCIL_FUNC:
          return parseParam(function (value) {
            check.commandType(value, 'object', param, env.commandStr);
            var cmp = value.cmp || 'keep';
            var ref = value.ref || 0;
            var mask = 'mask' in value ? value.mask : -1;
            check.commandParameter(cmp, compareFuncs, prop + '.cmp', env.commandStr);
            check.commandType(ref, 'number', prop + '.ref', env.commandStr);
            check.commandType(mask, 'number', prop + '.mask', env.commandStr);
            return [compareFuncs[cmp], ref, mask];
          }, function (env, scope, value) {
            var COMPARE_FUNCS = env.constants.compareFuncs;
            check.optional(function () {
              function assert() {
                env.assert(scope, Array.prototype.join.call(arguments, ''), 'invalid stencil.func');
              }
              assert(value + '&&typeof ', value, '==="object"');
              assert('!("cmp" in ', value, ')||(', value, '.cmp in ', COMPARE_FUNCS, ')');
            });
            var cmp = scope.def('"cmp" in ', value, '?', COMPARE_FUNCS, '[', value, '.cmp]', ':', GL_KEEP);
            var ref = scope.def(value, '.ref|0');
            var mask = scope.def('"mask" in ', value, '?', value, '.mask|0:-1');
            return [cmp, ref, mask];
          });

        case S_STENCIL_OPFRONT:
        case S_STENCIL_OPBACK:
          return parseParam(function (value) {
            check.commandType(value, 'object', param, env.commandStr);
            var fail = value.fail || 'keep';
            var zfail = value.zfail || 'keep';
            var zpass = value.zpass || 'keep';
            check.commandParameter(fail, stencilOps, prop + '.fail', env.commandStr);
            check.commandParameter(zfail, stencilOps, prop + '.zfail', env.commandStr);
            check.commandParameter(zpass, stencilOps, prop + '.zpass', env.commandStr);
            return [prop === S_STENCIL_OPBACK ? GL_BACK : GL_FRONT, stencilOps[fail], stencilOps[zfail], stencilOps[zpass]];
          }, function (env, scope, value) {
            var STENCIL_OPS = env.constants.stencilOps;

            check.optional(function () {
              env.assert(scope, value + '&&typeof ' + value + '==="object"', 'invalid ' + prop);
            });

            function read(name) {
              check.optional(function () {
                env.assert(scope, '!("' + name + '" in ' + value + ')||' + '(' + value + '.' + name + ' in ' + STENCIL_OPS + ')', 'invalid ' + prop + '.' + name + ', must be one of ' + Object.keys(stencilOps));
              });

              return scope.def('"', name, '" in ', value, '?', STENCIL_OPS, '[', value, '.', name, ']:', GL_KEEP);
            }

            return [prop === S_STENCIL_OPBACK ? GL_BACK : GL_FRONT, read('fail'), read('zfail'), read('zpass')];
          });

        case S_POLYGON_OFFSET_OFFSET:
          return parseParam(function (value) {
            check.commandType(value, 'object', param, env.commandStr);
            var factor = value.factor | 0;
            var units = value.units | 0;
            check.commandType(factor, 'number', param + '.factor', env.commandStr);
            check.commandType(units, 'number', param + '.units', env.commandStr);
            return [factor, units];
          }, function (env, scope, value) {
            check.optional(function () {
              env.assert(scope, value + '&&typeof ' + value + '==="object"', 'invalid ' + prop);
            });

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
            check.command(!!face, param, env.commandStr);
            return face;
          }, function (env, scope, value) {
            check.optional(function () {
              env.assert(scope, value + '==="front"||' + value + '==="back"', 'invalid cull.face');
            });
            return scope.def(value, '==="front"?', GL_FRONT, ':', GL_BACK);
          });

        case S_LINE_WIDTH:
          return parseParam(function (value) {
            check.command(typeof value === 'number' && value >= limits.lineWidthDims[0] && value <= limits.lineWidthDims[1], 'invalid line width, must positive number between ' + limits.lineWidthDims[0] + ' and ' + limits.lineWidthDims[1], env.commandStr);
            return value;
          }, function (env, scope, value) {
            check.optional(function () {
              env.assert(scope, 'typeof ' + value + '==="number"&&' + value + '>=' + limits.lineWidthDims[0] + '&&' + value + '<=' + limits.lineWidthDims[1], 'invalid line width');
            });

            return value;
          });

        case S_FRONT_FACE:
          return parseParam(function (value) {
            check.commandParameter(value, orientationType, param, env.commandStr);
            return orientationType[value];
          }, function (env, scope, value) {
            check.optional(function () {
              env.assert(scope, value + '==="cw"||' + value + '==="ccw"', 'invalid frontFace, must be one of cw,ccw');
            });
            return scope.def(value + '==="cw"?' + GL_CW + ':' + GL_CCW);
          });

        case S_COLOR_MASK:
          return parseParam(function (value) {
            check.command(isArrayLike(value) && value.length === 4, 'color.mask must be length 4 array', env.commandStr);
            return value.map(function (v) {
              return !!v;
            });
          }, function (env, scope, value) {
            check.optional(function () {
              env.assert(scope, env.shared.isArrayLike + '(' + value + ')&&' + value + '.length===4', 'invalid color.mask');
            });
            return loop(4, function (i) {
              return '!!' + value + '[' + i + ']';
            });
          });

        case S_SAMPLE_COVERAGE:
          return parseParam(function (value) {
            check.command(typeof value === 'object' && value, param, env.commandStr);
            var sampleValue = 'value' in value ? value.value : 1;
            var sampleInvert = !!value.invert;
            check.command(typeof sampleValue === 'number' && sampleValue >= 0 && sampleValue <= 1, 'sample.coverage.value must be a number between 0 and 1', env.commandStr);
            return [sampleValue, sampleInvert];
          }, function (env, scope, value) {
            check.optional(function () {
              env.assert(scope, value + '&&typeof ' + value + '==="object"', 'invalid sample.coverage');
            });
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
          check.command(value.color.length > 0, 'missing color attachment for framebuffer sent to uniform "' + name + '"', env.commandStr);
          result = createStaticDecl(function (env) {
            return env.link(value.color[0]);
          });
        } else {
          check.commandRaise('invalid data for uniform "' + name + '"', env.commandStr);
        }
      } else if (isArrayLike(value)) {
        result = createStaticDecl(function (env) {
          var ITEM = env.global.def('[', loop(value.length, function (i) {
            check.command(typeof value[i] === 'number' || typeof value[i] === 'boolean', 'invalid uniform ' + name, env.commandStr);
            return value[i];
          }), ']');
          return ITEM;
        });
      } else {
        check.commandRaise('invalid or missing data for uniform "' + name + '"', env.commandStr);
      }
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
          check.command(typeof value === 'object' && value, 'invalid data for attribute ' + attribute, env.commandStr);
          if (value.constant) {
            var constant = value.constant;
            record.buffer = 'null';
            record.state = ATTRIB_STATE_CONSTANT;
            if (typeof constant === 'number') {
              record.x = constant;
            } else {
              check.command(isArrayLike(constant) && constant.length > 0 && constant.length <= 4, 'invalid constant for attribute ' + attribute, env.commandStr);
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
            check.command(!!buffer, 'missing buffer for attribute "' + attribute + '"', env.commandStr);

            var offset = value.offset | 0;
            check.command(offset >= 0, 'invalid offset for attribute "' + attribute + '"', env.commandStr);

            var stride = value.stride | 0;
            check.command(stride >= 0 && stride < 256, 'invalid stride for attribute "' + attribute + '", must be integer betweeen [0, 255]', env.commandStr);

            var size = value.size | 0;
            check.command(!('size' in value) || size > 0 && size <= 4, 'invalid size for attribute "' + attribute + '", must be 1,2,3,4', env.commandStr);

            var normalized = !!value.normalized;

            var type = 0;
            if ('type' in value) {
              check.commandParameter(value.type, glTypes, 'invalid type for attribute ' + attribute, env.commandStr);
              type = glTypes[value.type];
            }

            var divisor = value.divisor | 0;
            if ('divisor' in value) {
              check.command(divisor === 0 || extInstancing, 'cannot specify divisor for attribute "' + attribute + '", instancing not supported', env.commandStr);
              check.command(divisor >= 0, 'invalid divisor for attribute "' + attribute + '"', env.commandStr);
            }

            check.optional(function () {
              var command = env.commandStr;

              var VALID_KEYS = ['buffer', 'offset', 'divisor', 'normalized', 'type', 'size', 'stride'];

              Object.keys(value).forEach(function (prop) {
                check.command(VALID_KEYS.indexOf(prop) >= 0, 'unknown parameter "' + prop + '" for attribute pointer "' + attribute + '" (valid parameters are ' + VALID_KEYS + ')', command);
              });
            });

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
        check.optional(function () {
          env.assert(block, VALUE + '&&(typeof ' + VALUE + '==="object"||typeof ' + VALUE + '==="function")&&(' + IS_BUFFER_ARGS + '(' + VALUE + ')||' + BUFFER_STATE + '.getBuffer(' + VALUE + ')||' + BUFFER_STATE + '.getBuffer(' + VALUE + '.buffer)||' + IS_BUFFER_ARGS + '(' + VALUE + '.buffer)||' + '("constant" in ' + VALUE + '&&(typeof ' + VALUE + '.constant==="number"||' + shared.isArrayLike + '(' + VALUE + '.constant))))', 'invalid dynamic attribute "' + attribute + '"');
        });

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

    check.optional(function () {
      var KEY_NAMES = [S_FRAMEBUFFER, S_VERT, S_FRAG, S_ELEMENTS, S_PRIMITIVE, S_OFFSET, S_COUNT, S_INSTANCES, S_PROFILE].concat(GL_STATE_NAMES);

      function checkKeys(dict) {
        Object.keys(dict).forEach(function (key) {
          check.command(KEY_NAMES.indexOf(key) >= 0, 'unknown parameter "' + key + '"', env.commandStr);
        });
      }

      checkKeys(staticOptions);
      checkKeys(dynamicOptions);
    });

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
        check.optional(function () {
          env.assert(scope, scopeAttrib + '.state', 'missing attribute ' + name);
        });
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
          check.command(value !== null && typeof value !== 'undefined', 'missing uniform "' + name + '"', env.commandStr);
          if (type === GL_SAMPLER_2D || type === GL_SAMPLER_CUBE) {
            check.command(typeof value === 'function' && (type === GL_SAMPLER_2D && (value._reglType === 'texture2d' || value._reglType === 'framebuffer') || type === GL_SAMPLER_CUBE && (value._reglType === 'textureCube' || value._reglType === 'framebufferCube')), 'invalid texture for uniform ' + name, env.commandStr);
            var TEX_VALUE = env.link(value._texture || value.color[0]._texture);
            scope(GL, '.uniform1i(', LOCATION, ',', TEX_VALUE + '.bind());');
            scope.exit(TEX_VALUE, '.unbind();');
          } else if (type === GL_FLOAT_MAT2 || type === GL_FLOAT_MAT3 || type === GL_FLOAT_MAT4) {
            check.optional(function () {
              check.command(isArrayLike(value), 'invalid matrix for uniform ' + name, env.commandStr);
              check.command(type === GL_FLOAT_MAT2 && value.length === 4 || type === GL_FLOAT_MAT3 && value.length === 9 || type === GL_FLOAT_MAT4 && value.length === 16, 'invalid length for matrix uniform ' + name, env.commandStr);
            });
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
                check.commandType(value, 'number', 'uniform ' + name, env.commandStr);
                infix = '1f';
                break;
              case GL_FLOAT_VEC2:
                check.command(isArrayLike(value) && value.length === 2, 'uniform ' + name, env.commandStr);
                infix = '2f';
                break;
              case GL_FLOAT_VEC3:
                check.command(isArrayLike(value) && value.length === 3, 'uniform ' + name, env.commandStr);
                infix = '3f';
                break;
              case GL_FLOAT_VEC4:
                check.command(isArrayLike(value) && value.length === 4, 'uniform ' + name, env.commandStr);
                infix = '4f';
                break;
              case GL_BOOL:
                check.commandType(value, 'boolean', 'uniform ' + name, env.commandStr);
                infix = '1i';
                break;
              case GL_INT:
                check.commandType(value, 'number', 'uniform ' + name, env.commandStr);
                infix = '1i';
                break;
              case GL_BOOL_VEC2:
                check.command(isArrayLike(value) && value.length === 2, 'uniform ' + name, env.commandStr);
                infix = '2i';
                break;
              case GL_INT_VEC2:
                check.command(isArrayLike(value) && value.length === 2, 'uniform ' + name, env.commandStr);
                infix = '2i';
                break;
              case GL_BOOL_VEC3:
                check.command(isArrayLike(value) && value.length === 3, 'uniform ' + name, env.commandStr);
                infix = '3i';
                break;
              case GL_INT_VEC3:
                check.command(isArrayLike(value) && value.length === 3, 'uniform ' + name, env.commandStr);
                infix = '3i';
                break;
              case GL_BOOL_VEC4:
                check.command(isArrayLike(value) && value.length === 4, 'uniform ' + name, env.commandStr);
                infix = '4i';
                break;
              case GL_INT_VEC4:
                check.command(isArrayLike(value) && value.length === 4, 'uniform ' + name, env.commandStr);
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
      check.optional(function () {
        function check(pred, message) {
          env.assert(scope, pred, 'bad data or missing for uniform "' + name + '".  ' + message);
        }

        function checkType(type) {
          check('typeof ' + VALUE + '==="' + type + '"', 'invalid type, expected ' + type);
        }

        function checkVector(n, type) {
          check(shared.isArrayLike + '(' + VALUE + ')&&' + VALUE + '.length===' + n, 'invalid vector, should have length ' + n, env.commandStr);
        }

        function checkTexture(target) {
          check('typeof ' + VALUE + '==="function"&&' + VALUE + '._reglType==="texture' + (target === GL_TEXTURE_2D ? '2d' : 'Cube') + '"', 'invalid texture type', env.commandStr);
        }

        switch (type) {
          case GL_INT:
            checkType('number');
            break;
          case GL_INT_VEC2:
            checkVector(2, 'number');
            break;
          case GL_INT_VEC3:
            checkVector(3, 'number');
            break;
          case GL_INT_VEC4:
            checkVector(4, 'number');
            break;
          case GL_FLOAT:
            checkType('number');
            break;
          case GL_FLOAT_VEC2:
            checkVector(2, 'number');
            break;
          case GL_FLOAT_VEC3:
            checkVector(3, 'number');
            break;
          case GL_FLOAT_VEC4:
            checkVector(4, 'number');
            break;
          case GL_BOOL:
            checkType('boolean');
            break;
          case GL_BOOL_VEC2:
            checkVector(2, 'boolean');
            break;
          case GL_BOOL_VEC3:
            checkVector(3, 'boolean');
            break;
          case GL_BOOL_VEC4:
            checkVector(4, 'boolean');
            break;
          case GL_FLOAT_MAT2:
            checkVector(4, 'number');
            break;
          case GL_FLOAT_MAT3:
            checkVector(9, 'number');
            break;
          case GL_FLOAT_MAT4:
            checkVector(16, 'number');
            break;
          case GL_SAMPLER_2D:
            checkTexture(GL_TEXTURE_2D);
            break;
          case GL_SAMPLER_CUBE:
            checkTexture(GL_TEXTURE_CUBE_MAP);
            break;
        }
      });

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
        check.optional(function () {
          if (defn.MISSING) {
            env.assert(outer, 'false', 'missing vertex count');
          }
          if (defn.DYNAMIC) {
            env.assert(scope, COUNT + '>=0', 'missing vertex count');
          }
        });
      } else {
        COUNT = scope.def(DRAW_STATE, '.', S_COUNT);
        check.optional(function () {
          env.assert(scope, COUNT + '>=0', 'missing vertex count');
        });
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
    check.optional(function () {
      env.commandStr = parentEnv.commandStr;
      env.command = env.link(parentEnv.commandStr);
    });
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

},{"./constants/dtypes.json":5,"./constants/primitives.json":6,"./dynamic":9,"./util/check":21,"./util/codegen":23,"./util/is-array-like":26,"./util/is-ndarray":27,"./util/is-typed-array":28,"./util/loop":29}],9:[function(require,module,exports){
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
var check = require('./util/check');
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
          check.raise('unsupported type for element array');
      }
      elements.buffer.dtype = dtype;
    }
    elements.type = dtype;

    // Check oes_element_index_uint extension
    check(dtype !== GL_UNSIGNED_INT || !!extensions.oes_element_index_uint, '32 bit element buffers not supported, enable oes_element_index_uint first');

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

    check(elements.buffer !== null, 'must not double destroy elements');
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
          check.type(options, 'object', 'invalid arguments for elements');
          if ('data' in options) {
            data = options.data;
            check(Array.isArray(data) || isTypedArray(data) || isNDArrayLike(data), 'invalid data for element buffer');
          }
          if ('usage' in options) {
            check.parameter(options.usage, usageTypes, 'invalid element buffer usage');
            usage = usageTypes[options.usage];
          }
          if ('primitive' in options) {
            check.parameter(options.primitive, primTypes, 'invalid element buffer primitive');
            primType = primTypes[options.primitive];
          }
          if ('count' in options) {
            check(typeof options.count === 'number' && options.count >= 0, 'invalid vertex count for elements');
            vertCount = options.count | 0;
          }
          if ('type' in options) {
            check.parameter(options.type, elementTypes, 'invalid buffer type');
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

},{"./constants/primitives.json":6,"./constants/usage.json":7,"./util/check":21,"./util/is-ndarray":27,"./util/is-typed-array":28,"./util/values":33}],11:[function(require,module,exports){
var check = require('./util/check');

module.exports = function createExtensionCache(gl, config) {
  var extensions = {};

  function tryLoadExtension(name_) {
    check.type(name_, 'string', 'extension name must be string');
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

},{"./util/check":21}],12:[function(require,module,exports){
var check = require('./util/check');
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
    dirty: false,
    setFBO: null
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
      check(tw === width && th === height, 'inconsistent width/height for supplied texture');
      texture.refCount += 1;
    } else {
      var renderbuffer = attachment.renderbuffer._renderbuffer;
      check(renderbuffer.width === width && renderbuffer.height === height, 'inconsistent width/height for renderbuffer');
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

    check.type(data, 'function', 'invalid attachment data');

    var type = data._reglType;
    if (type === 'texture2d') {
      texture = data;
      check(target === GL_TEXTURE_2D);
    } else if (type === 'textureCube') {
      texture = data;
      check(target >= GL_TEXTURE_CUBE_MAP_POSITIVE_X && target < GL_TEXTURE_CUBE_MAP_POSITIVE_X + 6, 'invalid cube map target');
    } else if (type === 'renderbuffer') {
      renderbuffer = data;
      target = GL_RENDERBUFFER;
    } else {
      check.raise('invalid regl object for attachment');
    }

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
    check(handle, 'must not double destroy framebuffer');
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
    if (status !== GL_FRAMEBUFFER_COMPLETE) {
      check.raise('framebuffer configuration not supported, status = ' + statusCode[status]);
    }

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

      check(framebufferState.next !== framebuffer, 'can not update framebuffer which is currently in use');

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
        check.type(a, 'object', 'invalid arguments for framebuffer');
        var options = a;

        if ('shape' in options) {
          var shape = options.shape;
          check(Array.isArray(shape) && shape.length >= 2, 'invalid shape for framebuffer');
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
          if (Array.isArray(colorBuffer)) {
            check(colorBuffer.length === 1 || extDrawBuffers, 'multiple render targets not supported');
          }
        }

        if (!colorBuffer) {
          if ('colorCount' in options) {
            colorCount = options.colorCount | 0;
            check(colorCount > 0, 'invalid color buffer count');
          }

          if ('colorTexture' in options) {
            colorTexture = !!options.colorTexture;
            colorFormat = 'rgba4';
          }

          if ('colorType' in options) {
            colorType = options.colorType;
            if (!colorTexture) {
              if (colorType === 'half float' || colorType === 'float16') {
                check(extensions.ext_color_buffer_half_float, 'you must enable EXT_color_buffer_half_float to use 16-bit render buffers');
                colorFormat = 'rgba16f';
              } else if (colorType === 'float' || colorType === 'float32') {
                check(extensions.webgl_color_buffer_float, 'you must enable WEBGL_color_buffer_float in order to use 32-bit floating point renderbuffers');
                colorFormat = 'rgba32f';
              }
            } else {
              check(extensions.oes_texture_float || !(colorType === 'float' || colorType === 'float32'), 'you must enable OES_texture_float in order to use floating point framebuffer objects');
              check(extensions.oes_texture_half_float || !(colorType === 'half float' || colorType === 'float16'), 'you must enable OES_texture_half_float in order to use 16-bit floating point framebuffer objects');
            }
            check.oneOf(colorType, colorTypes, 'invalid color type');
          }

          if ('colorFormat' in options) {
            colorFormat = options.colorFormat;
            if (colorTextureFormats.indexOf(colorFormat) >= 0) {
              colorTexture = true;
            } else if (colorRenderbufferFormats.indexOf(colorFormat) >= 0) {
              colorTexture = false;
            } else {
              if (colorTexture) {
                check.oneOf(options.colorFormat, colorTextureFormats, 'invalid color format for texture');
              } else {
                check.oneOf(options.colorFormat, colorRenderbufferFormats, 'invalid color format for renderbuffer');
              }
            }
          }
        }

        if ('depthTexture' in options || 'depthStencilTexture' in options) {
          depthStencilTexture = !!(options.depthTexture || options.depthStencilTexture);
          check(!depthStencilTexture || extensions.webgl_depth_texture, 'webgl_depth_texture extension not supported');
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

      check(extensions.webgl_draw_buffers || colorAttachments.length <= 1, 'you must enable the WEBGL_draw_buffers extension in order to use multiple color buffers.');
      check(colorAttachments.length <= limits.maxColorAttachments, 'too many color attachments, not supported');

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

      check(!!depthBuffer + !!stencilBuffer + !!depthStencilBuffer <= 1, 'invalid framebuffer configuration, can specify exactly one depth/stencil attachment');

      var commonColorAttachmentSize = null;

      for (i = 0; i < colorAttachments.length; ++i) {
        incRefAndCheckShape(colorAttachments[i], width, height);
        check(!colorAttachments[i] || colorAttachments[i].texture && colorTextureFormatEnums.indexOf(colorAttachments[i].texture._texture.format) >= 0 || colorAttachments[i].renderbuffer && colorRenderbufferFormatEnums.indexOf(colorAttachments[i].renderbuffer._renderbuffer.format) >= 0, 'framebuffer color attachment ' + i + ' is invalid');

        if (colorAttachments[i] && colorAttachments[i].texture) {
          var colorAttachmentSize = textureFormatChannels[colorAttachments[i].texture._texture.format] * textureTypeSizes[colorAttachments[i].texture._texture.type];

          if (commonColorAttachmentSize === null) {
            commonColorAttachmentSize = colorAttachmentSize;
          } else {
            // We need to make sure that all color attachments have the same number of bitplanes
            // (that is, the same numer of bits per pixel)
            // This is required by the GLES2.0 standard. See the beginning of Chapter 4 in that document.
            check(commonColorAttachmentSize === colorAttachmentSize, 'all color attachments much have the same number of bits per pixel.');
          }
        }
      }
      incRefAndCheckShape(depthAttachment, width, height);
      check(!depthAttachment || depthAttachment.texture && depthAttachment.texture._texture.format === GL_DEPTH_COMPONENT || depthAttachment.renderbuffer && depthAttachment.renderbuffer._renderbuffer.format === GL_DEPTH_COMPONENT16, 'invalid depth attachment for framebuffer object');
      incRefAndCheckShape(stencilAttachment, width, height);
      check(!stencilAttachment || stencilAttachment.renderbuffer && stencilAttachment.renderbuffer._renderbuffer.format === GL_STENCIL_INDEX8, 'invalid stencil attachment for framebuffer object');
      incRefAndCheckShape(depthStencilAttachment, width, height);
      check(!depthStencilAttachment || depthStencilAttachment.texture && depthStencilAttachment.texture._texture.format === GL_DEPTH_STENCIL || depthStencilAttachment.renderbuffer && depthStencilAttachment.renderbuffer._renderbuffer.format === GL_DEPTH_STENCIL, 'invalid depth-stencil attachment for framebuffer object');

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
      check(framebufferState.next !== framebuffer, 'can not resize a framebuffer which is currently in use');

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
      },
      bind: function (block) {
        framebufferState.setFBO({
          framebuffer: reglFramebuffer
        }, block);
      }
    });
  }

  function createCubeFBO(options) {
    var faces = Array(6);

    function reglFramebufferCube(a) {
      var i;

      check(faces.indexOf(framebufferState.next) < 0, 'can not update framebuffer which is currently in use');

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
        check.type(a, 'object', 'invalid arguments for framebuffer');
        var options = a;

        if ('shape' in options) {
          var shape = options.shape;
          check(Array.isArray(shape) && shape.length >= 2, 'invalid shape for framebuffer');
          check(shape[0] === shape[1], 'cube framebuffer must be square');
          radius = shape[0];
        } else {
          if ('radius' in options) {
            radius = options.radius | 0;
          }
          if ('width' in options) {
            radius = options.width | 0;
            if ('height' in options) {
              check(options.height === radius, 'must be square');
            }
          } else if ('height' in options) {
            radius = options.height | 0;
          }
        }

        if ('color' in options || 'colors' in options) {
          colorBuffer = options.color || options.colors;
          if (Array.isArray(colorBuffer)) {
            check(colorBuffer.length === 1 || extDrawBuffers, 'multiple render targets not supported');
          }
        }

        if (!colorBuffer) {
          if ('colorCount' in options) {
            colorCount = options.colorCount | 0;
            check(colorCount > 0, 'invalid color buffer count');
          }

          if ('colorType' in options) {
            check.oneOf(options.colorType, colorTypes, 'invalid color type');
            colorType = options.colorType;
          }

          if ('colorFormat' in options) {
            colorFormat = options.colorFormat;
            check.oneOf(options.colorFormat, colorTextureFormats, 'invalid color format for texture');
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
        check(typeof cube === 'function' && cube._reglType === 'textureCube', 'invalid cube map');
        radius = radius || cube.width;
        check(cube.width === radius && cube.height === radius, 'invalid cube map shape');
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
      check(radius > 0 && radius <= limits.maxCubeMapSize, 'invalid radius for cube fbo');

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

},{"./util/check":21,"./util/extend":24,"./util/values":33}],13:[function(require,module,exports){
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
var check = require('./util/check');
var isTypedArray = require('./util/is-typed-array');

var GL_RGBA = 6408;
var GL_UNSIGNED_BYTE = 5121;
var GL_PACK_ALIGNMENT = 0x0D05;
var GL_FLOAT = 0x1406; // 5126

module.exports = function wrapReadPixels(gl, framebufferState, reglPoll, context, glAttributes, extensions) {
  function readPixelsImpl(input) {
    var type;
    if (framebufferState.next === null) {
      check(glAttributes.preserveDrawingBuffer, 'you must create a webgl context with "preserveDrawingBuffer":true in order to read pixels from the drawing buffer');
      type = GL_UNSIGNED_BYTE;
    } else {
      check(framebufferState.next.colorAttachments[0].texture !== null, 'You cannot read from a renderbuffer');
      type = framebufferState.next.colorAttachments[0].texture._texture.type;

      if (extensions.oes_texture_float) {
        check(type === GL_UNSIGNED_BYTE || type === GL_FLOAT, 'Reading from a framebuffer is only allowed for the types \'uint8\' and \'float\'');
      } else {
        check(type === GL_UNSIGNED_BYTE, 'Reading from a framebuffer is only allowed for the type \'uint8\'');
      }
    }

    var x = 0;
    var y = 0;
    var width = context.framebufferWidth;
    var height = context.framebufferHeight;
    var data = null;

    if (isTypedArray(input)) {
      data = input;
    } else if (input) {
      check.type(input, 'object', 'invalid arguments to regl.read()');
      x = input.x | 0;
      y = input.y | 0;
      check(x >= 0 && x < context.framebufferWidth, 'invalid x offset for regl.read');
      check(y >= 0 && y < context.framebufferHeight, 'invalid y offset for regl.read');
      width = (input.width || context.framebufferWidth - x) | 0;
      height = (input.height || context.framebufferHeight - y) | 0;
      data = input.data || null;
    }

    // sanity check input.data
    if (data) {
      if (type === GL_UNSIGNED_BYTE) {
        check(data instanceof Uint8Array, 'buffer must be \'Uint8Array\' when reading from a framebuffer of type \'uint8\'');
      } else if (type === GL_FLOAT) {
        check(data instanceof Float32Array, 'buffer must be \'Float32Array\' when reading from a framebuffer of type \'float\'');
      }
    }

    check(width > 0 && width + x <= context.framebufferWidth, 'invalid width for read pixels');
    check(height > 0 && height + y <= context.framebufferHeight, 'invalid height for read pixels');

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
    check.isTypedArray(data, 'data buffer for regl.read() must be a typedarray');
    check(data.byteLength >= size, 'data buffer for regl.read() too small');

    // Run read pixels
    gl.pixelStorei(GL_PACK_ALIGNMENT, 4);
    gl.readPixels(x, y, width, height, GL_RGBA, type, data);

    return data;
  }

  function readPixelsFBO(options) {
    var result;
    framebufferState.setFBO({
      framebuffer: options.framebuffer
    }, function () {
      result = readPixelsImpl(options);
    });
    return result;
  }

  function readPixels(options) {
    if (!options || !('framebuffer' in options)) {
      return readPixelsImpl(options);
    } else {
      return readPixelsFBO(options);
    }
  }

  return readPixels;
};

},{"./util/check":21,"./util/is-typed-array":28}],15:[function(require,module,exports){
var check = require('./util/check');
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
    check(handle, 'must not double destroy renderbuffer');
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
          check(Array.isArray(shape) && shape.length >= 2, 'invalid renderbuffer shape');
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
          check.parameter(options.format, formatTypes, 'invalid renderbuffer format');
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
      } else {
        check.raise('invalid arguments to renderbuffer constructor');
      }

      // check shape
      check(w > 0 && h > 0 && w <= limits.maxRenderbufferSize && h <= limits.maxRenderbufferSize, 'invalid renderbuffer size');

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
      check(w > 0 && h > 0 && w <= limits.maxRenderbufferSize && h <= limits.maxRenderbufferSize, 'invalid renderbuffer size');

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

},{"./util/check":21,"./util/values":33}],16:[function(require,module,exports){
var check = require('./util/check');
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
      check.shaderError(gl, shader, source, type, command);
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
    check.linkError(gl, program, stringStore.str(desc.fragId), stringStore.str(desc.vertId), command);

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
      check.command(vertId >= 0, 'missing vertex shader', command);
      check.command(fragId >= 0, 'missing fragment shader', command);

      var cache = programCache[fragId];
      if (!cache) {
        cache = programCache[fragId] = {};
      }
      var program = cache[vertId];
      if (!program) {
        program = new REGLProgram(fragId, vertId);
        stats.shaderCount++;

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

},{"./util/check":21,"./util/values":33}],17:[function(require,module,exports){

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
var check = require('./util/check');
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
      check.raise('unsupported texture type, must specify a typed array');
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
      check.type(options.premultiplyAlpha, 'boolean', 'invalid premultiplyAlpha');
      flags.premultiplyAlpha = options.premultiplyAlpha;
    }

    if ('flipY' in options) {
      check.type(options.flipY, 'boolean', 'invalid texture flip');
      flags.flipY = options.flipY;
    }

    if ('alignment' in options) {
      check.oneOf(options.alignment, [1, 2, 4, 8], 'invalid texture unpack alignment');
      flags.unpackAlignment = options.alignment;
    }

    if ('colorSpace' in options) {
      check.parameter(options.colorSpace, colorSpace, 'invalid colorSpace');
      flags.colorSpace = colorSpace[options.colorSpace];
    }

    if ('type' in options) {
      var type = options.type;
      check(extensions.oes_texture_float || !(type === 'float' || type === 'float32'), 'you must enable the OES_texture_float extension in order to use floating point textures.');
      check(extensions.oes_texture_half_float || !(type === 'half float' || type === 'float16'), 'you must enable the OES_texture_half_float extension in order to use 16-bit floating point textures.');
      check(extensions.webgl_depth_texture || !(type === 'uint16' || type === 'uint32' || type === 'depth stencil'), 'you must enable the WEBGL_depth_texture extension in order to use depth/stencil textures.');
      check.parameter(type, textureTypes, 'invalid texture type');
      flags.type = textureTypes[type];
    }

    var w = flags.width;
    var h = flags.height;
    var c = flags.channels;
    var hasChannels = false;
    if ('shape' in options) {
      check(Array.isArray(options.shape) && options.shape.length >= 2, 'shape must be an array');
      w = options.shape[0];
      h = options.shape[1];
      if (options.shape.length === 3) {
        c = options.shape[2];
        check(c > 0 && c <= 4, 'invalid number of channels');
        hasChannels = true;
      }
      check(w >= 0 && w <= limits.maxTextureSize, 'invalid width');
      check(h >= 0 && h <= limits.maxTextureSize, 'invalid height');
    } else {
      if ('radius' in options) {
        w = h = options.radius;
        check(w >= 0 && w <= limits.maxTextureSize, 'invalid radius');
      }
      if ('width' in options) {
        w = options.width;
        check(w >= 0 && w <= limits.maxTextureSize, 'invalid width');
      }
      if ('height' in options) {
        h = options.height;
        check(h >= 0 && h <= limits.maxTextureSize, 'invalid height');
      }
      if ('channels' in options) {
        c = options.channels;
        check(c > 0 && c <= 4, 'invalid number of channels');
        hasChannels = true;
      }
    }
    flags.width = w | 0;
    flags.height = h | 0;
    flags.channels = c | 0;

    var hasFormat = false;
    if ('format' in options) {
      var formatStr = options.format;
      check(extensions.webgl_depth_texture || !(formatStr === 'depth' || formatStr === 'depth stencil'), 'you must enable the WEBGL_depth_texture extension in order to use depth/stencil textures.');
      check.parameter(formatStr, textureFormats, 'invalid texture format');
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
    } else if (hasFormat && hasChannels) {
      check(flags.channels === FORMAT_CHANNELS[flags.format], 'number of channels inconsistent with specified format');
    }
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
      check.type(options, 'object', 'invalid pixel data type');
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

    check(!image.compressed || data instanceof Uint8Array, 'compressed texture data must be stored in a uint8array');

    if (options.copy) {
      check(!data, 'can not specify copy and data field for the same texture');
      var viewW = contextState.viewportWidth;
      var viewH = contextState.viewportHeight;
      image.width = image.width || viewW - image.xOffset;
      image.height = image.height || viewH - image.yOffset;
      image.needsCopy = true;
      check(image.xOffset >= 0 && image.xOffset < viewW && image.yOffset >= 0 && image.yOffset < viewH && image.width > 0 && image.width <= viewW && image.height > 0 && image.height <= viewH, 'copy texture read out of bounds');
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
        check(shape.length === 2, 'invalid ndarray pixel data, must be 2 or 3D');
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

    if (image.type === GL_FLOAT) {
      check(limits.extensions.indexOf('oes_texture_float') >= 0, 'oes_texture_float extension not enabled');
    } else if (image.type === GL_HALF_FLOAT_OES) {
      check(limits.extensions.indexOf('oes_texture_half_float') >= 0, 'oes_texture_half_float extension not enabled');
    }

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

    if (mipmap.compressed && mipmap.internalformat === GL_COMPRESSED_RGB_S3TC_DXT1_EXT || mipmap.internalformat === GL_COMPRESSED_RGBA_S3TC_DXT1_EXT || mipmap.internalformat === GL_COMPRESSED_RGBA_S3TC_DXT3_EXT || mipmap.internalformat === GL_COMPRESSED_RGBA_S3TC_DXT5_EXT) {
      check(mipmap.width % 4 === 0 && mipmap.height % 4 === 0, 'for compressed texture formats, mipmap level 0 must have width and height that are a multiple of 4');
    }
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
      check.parameter(minFilter, minFilters);
      info.minFilter = minFilters[minFilter];
      if (MIPMAP_FILTERS.indexOf(info.minFilter) >= 0) {
        info.genMipmaps = true;
      }
    }

    if ('mag' in options) {
      var magFilter = options.mag;
      check.parameter(magFilter, magFilters);
      info.magFilter = magFilters[magFilter];
    }

    var wrapS = info.wrapS;
    var wrapT = info.wrapT;
    if ('wrap' in options) {
      var wrap = options.wrap;
      if (typeof wrap === 'string') {
        check.parameter(wrap, wrapModes);
        wrapS = wrapT = wrapModes[wrap];
      } else if (Array.isArray(wrap)) {
        check.parameter(wrap[0], wrapModes);
        check.parameter(wrap[1], wrapModes);
        wrapS = wrapModes[wrap[0]];
        wrapT = wrapModes[wrap[1]];
      }
    } else {
      if ('wrapS' in options) {
        var optWrapS = options.wrapS;
        check.parameter(optWrapS, wrapModes);
        wrapS = wrapModes[optWrapS];
      }
      if ('wrapT' in options) {
        var optWrapT = options.wrapT;
        check.parameter(optWrapT, wrapModes);
        wrapT = wrapModes[optWrapT];
      }
    }
    info.wrapS = wrapS;
    info.wrapT = wrapT;

    if ('anisotropic' in options) {
      var anisotropic = options.anisotropic;
      check(typeof anisotropic === 'number' && anisotropic >= 1 && anisotropic <= limits.maxAnisotropic, 'aniso samples must be between 1 and ');
      info.anisotropic = options.anisotropic;
    }

    if ('mipmap' in options) {
      var hasMipMap = false;
      switch (typeof options.mipmap) {
        case 'string':
          check.parameter(options.mipmap, mipmapHint, 'invalid mipmap hint');
          info.mipmapHint = mipmapHint[options.mipmap];
          info.genMipmaps = true;
          hasMipMap = true;
          break;

        case 'boolean':
          hasMipMap = info.genMipmaps = options.mipmap;
          break;

        case 'object':
          check(Array.isArray(options.mipmap), 'invalid mipmap type');
          info.genMipmaps = false;
          hasMipMap = true;
          break;

        default:
          check.raise('invalid mipmap type');
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
    check(handle, 'must not double destroy texture');
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
        if (unit >= numTexUnits) {
          check.raise('insufficient number of texture units');
        }
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
        check.type(a, 'object', 'invalid arguments to regl.texture');
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

      check.texture2D(texInfo, mipData, limits);
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
      check(!!image, 'must specify image data');

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

      check(texture.type === imageData.type && texture.format === imageData.format && texture.internalformat === imageData.internalformat, 'incompatible format for texture.subimage');
      check(x >= 0 && y >= 0 && x + imageData.width <= texture.width && y + imageData.height <= texture.height, 'texture.subimage write out of bounds');
      check(texture.mipmask & 1 << level, 'missing mipmap data');
      check(imageData.data || imageData.element || imageData.needsCopy, 'missing image data');

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
            check(Array.isArray(face_input) && face_input.length === 6, 'cube faces must be a length 6 array');
            for (i = 0; i < 6; ++i) {
              check(typeof face_input[i] === 'object' && !!face_input[i], 'invalid input for cube map face');
              copyFlags(faces[i], texture);
              parseMipMapFromObject(faces[i], face_input[i]);
            }
          } else {
            for (i = 0; i < 6; ++i) {
              parseMipMapFromObject(faces[i], a0);
            }
          }
        }
      } else {
        check.raise('invalid arguments to cube map');
      }

      copyFlags(texture, faces[0]);
      if (texInfo.genMipmaps) {
        texture.mipmask = (faces[0].width << 1) - 1;
      } else {
        texture.mipmask = faces[0].mipmask;
      }

      check.textureCube(texture, texInfo, faces, limits);
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
      check(!!image, 'must specify image data');
      check(typeof face === 'number' && face === (face | 0) && face >= 0 && face < 6, 'invalid face');

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

      check(texture.type === imageData.type && texture.format === imageData.format && texture.internalformat === imageData.internalformat, 'incompatible format for texture.subimage');
      check(x >= 0 && y >= 0 && x + imageData.width <= texture.width && y + imageData.height <= texture.height, 'texture.subimage write out of bounds');
      check(texture.mipmask & 1 << level, 'missing mipmap data');
      check(imageData.data || imageData.element || imageData.needsCopy, 'missing image data');

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

},{"./constants/arraytypes.json":4,"./util/check":21,"./util/extend":24,"./util/flatten":25,"./util/is-array-like":26,"./util/is-ndarray":27,"./util/is-typed-array":28,"./util/pool":30,"./util/to-half-float":32,"./util/values":33}],20:[function(require,module,exports){
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
// Error checking and parameter validation.
//
// Statements for the form `check.someProcedure(...)` get removed by
// a browserify transform for optimized/minified bundles.
//
/* globals btoa */
var isTypedArray = require('./is-typed-array');
var extend = require('./extend');

// only used for extracting shader names.  if btoa not present, then errors
// will be slightly crappier
function decodeB64(str) {
  if (typeof btoa !== 'undefined') {
    return btoa(str);
  }
  return 'base64:' + str;
}

function raise(message) {
  var error = new Error('(regl) ' + message);
  console.error(error);
  throw error;
}

function check(pred, message) {
  if (!pred) {
    raise(message);
  }
}

function encolon(message) {
  if (message) {
    return ': ' + message;
  }
  return '';
}

function checkParameter(param, possibilities, message) {
  if (!(param in possibilities)) {
    raise('unknown parameter (' + param + ')' + encolon(message) + '. possible values: ' + Object.keys(possibilities).join());
  }
}

function checkIsTypedArray(data, message) {
  if (!isTypedArray(data)) {
    raise('invalid parameter type' + encolon(message) + '. must be a typed array');
  }
}

function checkTypeOf(value, type, message) {
  if (typeof value !== type) {
    raise('invalid parameter type' + encolon(message) + '. expected ' + type + ', got ' + typeof value);
  }
}

function checkNonNegativeInt(value, message) {
  if (!(value >= 0 && (value | 0) === value)) {
    raise('invalid parameter type, (' + value + ')' + encolon(message) + '. must be a nonnegative integer');
  }
}

function checkOneOf(value, list, message) {
  if (list.indexOf(value) < 0) {
    raise('invalid value' + encolon(message) + '. must be one of: ' + list);
  }
}

var constructorKeys = ['gl', 'canvas', 'container', 'attributes', 'pixelRatio', 'extensions', 'optionalExtensions', 'profile', 'onDone'];

function checkConstructor(obj) {
  Object.keys(obj).forEach(function (key) {
    if (constructorKeys.indexOf(key) < 0) {
      raise('invalid regl constructor argument "' + key + '". must be one of ' + constructorKeys);
    }
  });
}

function leftPad(str, n) {
  str = str + '';
  while (str.length < n) {
    str = ' ' + str;
  }
  return str;
}

function ShaderFile() {
  this.name = 'unknown';
  this.lines = [];
  this.index = {};
  this.hasErrors = false;
}

function ShaderLine(number, line) {
  this.number = number;
  this.line = line;
  this.errors = [];
}

function ShaderError(fileNumber, lineNumber, message) {
  this.file = fileNumber;
  this.line = lineNumber;
  this.message = message;
}

function guessCommand() {
  var error = new Error();
  var stack = (error.stack || error).toString();
  var pat = /compileProcedure.*\n\s*at.*\((.*)\)/.exec(stack);
  if (pat) {
    return pat[1];
  }
  var pat2 = /compileProcedure.*\n\s*at\s+(.*)(\n|$)/.exec(stack);
  if (pat2) {
    return pat2[1];
  }
  return 'unknown';
}

function guessCallSite() {
  var error = new Error();
  var stack = (error.stack || error).toString();
  var pat = /at REGLCommand.*\n\s+at.*\((.*)\)/.exec(stack);
  if (pat) {
    return pat[1];
  }
  var pat2 = /at REGLCommand.*\n\s+at\s+(.*)\n/.exec(stack);
  if (pat2) {
    return pat2[1];
  }
  return 'unknown';
}

function parseSource(source, command) {
  var lines = source.split('\n');
  var lineNumber = 1;
  var fileNumber = 0;
  var files = {
    unknown: new ShaderFile(),
    0: new ShaderFile()
  };
  files.unknown.name = files[0].name = command || guessCommand();
  files.unknown.lines.push(new ShaderLine(0, ''));
  for (var i = 0; i < lines.length; ++i) {
    var line = lines[i];
    var parts = /^\s*\#\s*(\w+)\s+(.+)\s*$/.exec(line);
    if (parts) {
      switch (parts[1]) {
        case 'line':
          var lineNumberInfo = /(\d+)(\s+\d+)?/.exec(parts[2]);
          if (lineNumberInfo) {
            lineNumber = lineNumberInfo[1] | 0;
            if (lineNumberInfo[2]) {
              fileNumber = lineNumberInfo[2] | 0;
              if (!(fileNumber in files)) {
                files[fileNumber] = new ShaderFile();
              }
            }
          }
          break;
        case 'define':
          var nameInfo = /SHADER_NAME(_B64)?\s+(.*)$/.exec(parts[2]);
          if (nameInfo) {
            files[fileNumber].name = nameInfo[1] ? decodeB64(nameInfo[2]) : nameInfo[2];
          }
          break;
      }
    }
    files[fileNumber].lines.push(new ShaderLine(lineNumber++, line));
  }
  Object.keys(files).forEach(function (fileNumber) {
    var file = files[fileNumber];
    file.lines.forEach(function (line) {
      file.index[line.number] = line;
    });
  });
  return files;
}

function parseErrorLog(errLog) {
  var result = [];
  errLog.split('\n').forEach(function (errMsg) {
    if (errMsg.length < 5) {
      return;
    }
    var parts = /^ERROR\:\s+(\d+)\:(\d+)\:\s*(.*)$/.exec(errMsg);
    if (parts) {
      result.push(new ShaderError(parts[1] | 0, parts[2] | 0, parts[3].trim()));
    } else if (errMsg.length > 0) {
      result.push(new ShaderError('unknown', 0, errMsg));
    }
  });
  return result;
}

function annotateFiles(files, errors) {
  errors.forEach(function (error) {
    var file = files[error.file];
    if (file) {
      var line = file.index[error.line];
      if (line) {
        line.errors.push(error);
        file.hasErrors = true;
        return;
      }
    }
    files.unknown.hasErrors = true;
    files.unknown.lines[0].errors.push(error);
  });
}

function checkShaderError(gl, shader, source, type, command) {
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    var errLog = gl.getShaderInfoLog(shader);
    var typeName = type === gl.FRAGMENT_SHADER ? 'fragment' : 'vertex';
    checkCommandType(source, 'string', typeName + ' shader source must be a string', command);
    var files = parseSource(source, command);
    var errors = parseErrorLog(errLog);
    annotateFiles(files, errors);

    Object.keys(files).forEach(function (fileNumber) {
      var file = files[fileNumber];
      if (!file.hasErrors) {
        return;
      }

      var strings = [''];
      var styles = [''];

      function push(str, style) {
        strings.push(str);
        styles.push(style || '');
      }

      push('file number ' + fileNumber + ': ' + file.name + '\n', 'color:red;text-decoration:underline;font-weight:bold');

      file.lines.forEach(function (line) {
        if (line.errors.length > 0) {
          push(leftPad(line.number, 4) + '|  ', 'background-color:yellow; font-weight:bold');
          push(line.line + '\n', 'color:red; background-color:yellow; font-weight:bold');

          // try to guess token
          var offset = 0;
          line.errors.forEach(function (error) {
            var message = error.message;
            var token = /^\s*\'(.*)\'\s*\:\s*(.*)$/.exec(message);
            if (token) {
              var tokenPat = token[1];
              message = token[2];
              switch (tokenPat) {
                case 'assign':
                  tokenPat = '=';
                  break;
              }
              offset = Math.max(line.line.indexOf(tokenPat, offset), 0);
            } else {
              offset = 0;
            }

            push(leftPad('| ', 6));
            push(leftPad('^^^', offset + 3) + '\n', 'font-weight:bold');
            push(leftPad('| ', 6));
            push(message + '\n', 'font-weight:bold');
          });
          push(leftPad('| ', 6) + '\n');
        } else {
          push(leftPad(line.number, 4) + '|  ');
          push(line.line + '\n', 'color:red');
        }
      });
      if (typeof document !== 'undefined') {
        styles[0] = strings.join('%c');
        console.log.apply(console, styles);
      } else {
        console.log(strings.join(''));
      }
    });

    check.raise('Error compiling ' + typeName + ' shader, ' + files[0].name);
  }
}

function checkLinkError(gl, program, fragShader, vertShader, command) {
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    var errLog = gl.getProgramInfoLog(program);
    var fragParse = parseSource(fragShader, command);
    var vertParse = parseSource(vertShader, command);

    var header = 'Error linking program with vertex shader, "' + vertParse[0].name + '", and fragment shader "' + fragParse[0].name + '"';

    if (typeof document !== 'undefined') {
      console.log('%c' + header + '\n%c' + errLog, 'color:red;text-decoration:underline;font-weight:bold', 'color:red');
    } else {
      console.log(header + '\n' + errLog);
    }
    check.raise(header);
  }
}

function saveCommandRef(object) {
  object._commandRef = guessCommand();
}

function saveDrawCommandInfo(opts, uniforms, attributes, stringStore) {
  saveCommandRef(opts);

  function id(str) {
    if (str) {
      return stringStore.id(str);
    }
    return 0;
  }
  opts._fragId = id(opts.static.frag);
  opts._vertId = id(opts.static.vert);

  function addProps(dict, set) {
    Object.keys(set).forEach(function (u) {
      dict[stringStore.id(u)] = true;
    });
  }

  var uniformSet = opts._uniformSet = {};
  addProps(uniformSet, uniforms.static);
  addProps(uniformSet, uniforms.dynamic);

  var attributeSet = opts._attributeSet = {};
  addProps(attributeSet, attributes.static);
  addProps(attributeSet, attributes.dynamic);

  opts._hasCount = 'count' in opts.static || 'count' in opts.dynamic || 'elements' in opts.static || 'elements' in opts.dynamic;
}

function commandRaise(message, command) {
  var callSite = guessCallSite();
  raise(message + ' in command ' + (command || guessCommand()) + (callSite === 'unknown' ? '' : ' called from ' + callSite));
}

function checkCommand(pred, message, command) {
  if (!pred) {
    commandRaise(message, command || guessCommand());
  }
}

function checkParameterCommand(param, possibilities, message, command) {
  if (!(param in possibilities)) {
    commandRaise('unknown parameter (' + param + ')' + encolon(message) + '. possible values: ' + Object.keys(possibilities).join(), command || guessCommand());
  }
}

function checkCommandType(value, type, message, command) {
  if (typeof value !== type) {
    commandRaise('invalid parameter type' + encolon(message) + '. expected ' + type + ', got ' + typeof value, command || guessCommand());
  }
}

function checkOptional(block) {
  block();
}

function checkFramebufferFormat(attachment, texFormats, rbFormats) {
  if (attachment.texture) {
    checkOneOf(attachment.texture._texture.internalformat, texFormats, 'unsupported texture format for attachment');
  } else {
    checkOneOf(attachment.renderbuffer._renderbuffer.format, rbFormats, 'unsupported renderbuffer format for attachment');
  }
}

var GL_CLAMP_TO_EDGE = 0x812F;

var GL_NEAREST = 0x2600;
var GL_NEAREST_MIPMAP_NEAREST = 0x2700;
var GL_LINEAR_MIPMAP_NEAREST = 0x2701;
var GL_NEAREST_MIPMAP_LINEAR = 0x2702;
var GL_LINEAR_MIPMAP_LINEAR = 0x2703;

var GL_BYTE = 5120;
var GL_UNSIGNED_BYTE = 5121;
var GL_SHORT = 5122;
var GL_UNSIGNED_SHORT = 5123;
var GL_INT = 5124;
var GL_UNSIGNED_INT = 5125;
var GL_FLOAT = 5126;

var GL_UNSIGNED_SHORT_4_4_4_4 = 0x8033;
var GL_UNSIGNED_SHORT_5_5_5_1 = 0x8034;
var GL_UNSIGNED_SHORT_5_6_5 = 0x8363;
var GL_UNSIGNED_INT_24_8_WEBGL = 0x84FA;

var GL_HALF_FLOAT_OES = 0x8D61;

var TYPE_SIZE = {};

TYPE_SIZE[GL_BYTE] = TYPE_SIZE[GL_UNSIGNED_BYTE] = 1;

TYPE_SIZE[GL_SHORT] = TYPE_SIZE[GL_UNSIGNED_SHORT] = TYPE_SIZE[GL_HALF_FLOAT_OES] = TYPE_SIZE[GL_UNSIGNED_SHORT_5_6_5] = TYPE_SIZE[GL_UNSIGNED_SHORT_4_4_4_4] = TYPE_SIZE[GL_UNSIGNED_SHORT_5_5_5_1] = 2;

TYPE_SIZE[GL_INT] = TYPE_SIZE[GL_UNSIGNED_INT] = TYPE_SIZE[GL_FLOAT] = TYPE_SIZE[GL_UNSIGNED_INT_24_8_WEBGL] = 4;

function pixelSize(type, channels) {
  if (type === GL_UNSIGNED_SHORT_5_5_5_1 || type === GL_UNSIGNED_SHORT_4_4_4_4 || type === GL_UNSIGNED_SHORT_5_6_5) {
    return 2;
  } else if (type === GL_UNSIGNED_INT_24_8_WEBGL) {
    return 4;
  } else {
    return TYPE_SIZE[type] * channels;
  }
}

function isPow2(v) {
  return !(v & v - 1) && !!v;
}

function checkTexture2D(info, mipData, limits) {
  var i;
  var w = mipData.width;
  var h = mipData.height;
  var c = mipData.channels;

  // Check texture shape
  check(w > 0 && w <= limits.maxTextureSize && h > 0 && h <= limits.maxTextureSize, 'invalid texture shape');

  // check wrap mode
  if (info.wrapS !== GL_CLAMP_TO_EDGE || info.wrapT !== GL_CLAMP_TO_EDGE) {
    check(isPow2(w) && isPow2(h), 'incompatible wrap mode for texture, both width and height must be power of 2');
  }

  if (mipData.mipmask === 1) {
    if (w !== 1 && h !== 1) {
      check(info.minFilter !== GL_NEAREST_MIPMAP_NEAREST && info.minFilter !== GL_NEAREST_MIPMAP_LINEAR && info.minFilter !== GL_LINEAR_MIPMAP_NEAREST && info.minFilter !== GL_LINEAR_MIPMAP_LINEAR, 'min filter requires mipmap');
    }
  } else {
    // texture must be power of 2
    check(isPow2(w) && isPow2(h), 'texture must be a square power of 2 to support mipmapping');
    check(mipData.mipmask === (w << 1) - 1, 'missing or incomplete mipmap data');
  }

  if (mipData.type === GL_FLOAT) {
    if (limits.extensions.indexOf('oes_texture_float_linear') < 0) {
      check(info.minFilter === GL_NEAREST && info.magFilter === GL_NEAREST, 'filter not supported, must enable oes_texture_float_linear');
    }
    check(!info.genMipmaps, 'mipmap generation not supported with float textures');
  }

  // check image complete
  var mipimages = mipData.images;
  for (i = 0; i < 16; ++i) {
    if (mipimages[i]) {
      var mw = w >> i;
      var mh = h >> i;
      check(mipData.mipmask & 1 << i, 'missing mipmap data');

      var img = mipimages[i];

      check(img.width === mw && img.height === mh, 'invalid shape for mip images');

      check(img.format === mipData.format && img.internalformat === mipData.internalformat && img.type === mipData.type, 'incompatible type for mip image');

      if (img.compressed) {
        // TODO: check size for compressed images
      } else if (img.data) {
        check(img.data.byteLength === mw * mh * Math.max(pixelSize(img.type, c), img.unpackAlignment), 'invalid data for image, buffer size is inconsistent with image format');
      } else if (img.element) {
        // TODO: check element can be loaded
      } else if (img.copy) {
        // TODO: check compatible format and type
      }
    } else if (!info.genMipmaps) {
      check((mipData.mipmask & 1 << i) === 0, 'extra mipmap data');
    }
  }

  if (mipData.compressed) {
    check(!info.genMipmaps, 'mipmap generation for compressed images not supported');
  }
}

function checkTextureCube(texture, info, faces, limits) {
  var w = texture.width;
  var h = texture.height;
  var c = texture.channels;

  // Check texture shape
  check(w > 0 && w <= limits.maxTextureSize && h > 0 && h <= limits.maxTextureSize, 'invalid texture shape');
  check(w === h, 'cube map must be square');
  check(info.wrapS === GL_CLAMP_TO_EDGE && info.wrapT === GL_CLAMP_TO_EDGE, 'wrap mode not supported by cube map');

  for (var i = 0; i < faces.length; ++i) {
    var face = faces[i];
    check(face.width === w && face.height === h, 'inconsistent cube map face shape');

    if (info.genMipmaps) {
      check(!face.compressed, 'can not generate mipmap for compressed textures');
      check(face.mipmask === 1, 'can not specify mipmaps and generate mipmaps');
    } else {
      // TODO: check mip and filter mode
    }

    var mipmaps = face.images;
    for (var j = 0; j < 16; ++j) {
      var img = mipmaps[j];
      if (img) {
        var mw = w >> j;
        var mh = h >> j;
        check(face.mipmask & 1 << j, 'missing mipmap data');
        check(img.width === mw && img.height === mh, 'invalid shape for mip images');
        check(img.format === texture.format && img.internalformat === texture.internalformat && img.type === texture.type, 'incompatible type for mip image');

        if (img.compressed) {
          // TODO: check size for compressed images
        } else if (img.data) {
          check(img.data.byteLength === mw * mh * Math.max(pixelSize(img.type, c), img.unpackAlignment), 'invalid data for image, buffer size is inconsistent with image format');
        } else if (img.element) {
          // TODO: check element can be loaded
        } else if (img.copy) {
          // TODO: check compatible format and type
        }
      }
    }
  }
}

module.exports = extend(check, {
  optional: checkOptional,
  raise: raise,
  commandRaise: commandRaise,
  command: checkCommand,
  parameter: checkParameter,
  commandParameter: checkParameterCommand,
  constructor: checkConstructor,
  type: checkTypeOf,
  commandType: checkCommandType,
  isTypedArray: checkIsTypedArray,
  nni: checkNonNegativeInt,
  oneOf: checkOneOf,
  shaderError: checkShaderError,
  linkError: checkLinkError,
  callSite: guessCallSite,
  saveCommandRef: saveCommandRef,
  saveDrawInfo: saveDrawCommandInfo,
  framebufferFormat: checkFramebufferFormat,
  guessCommand: guessCommand,
  texture2D: checkTexture2D,
  textureCube: checkTextureCube
});

},{"./extend":24,"./is-typed-array":28}],22:[function(require,module,exports){
/* globals performance */
module.exports = typeof performance !== 'undefined' && performance.now ? function () {
  return performance.now();
} : function () {
  return +new Date();
};

},{}],23:[function(require,module,exports){
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

},{"./extend":24}],24:[function(require,module,exports){
module.exports = function (base, opts) {
  var keys = Object.keys(opts);
  for (var i = 0; i < keys.length; ++i) {
    base[keys[i]] = opts[keys[i]];
  }
  return base;
};

},{}],25:[function(require,module,exports){
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

},{"./pool":30}],26:[function(require,module,exports){
var isTypedArray = require('./is-typed-array');
module.exports = function isArrayLike(s) {
  return Array.isArray(s) || isTypedArray(s);
};

},{"./is-typed-array":28}],27:[function(require,module,exports){
var isTypedArray = require('./is-typed-array');

module.exports = function isNDArrayLike(obj) {
  return !!obj && typeof obj === 'object' && Array.isArray(obj.shape) && Array.isArray(obj.stride) && typeof obj.offset === 'number' && obj.shape.length === obj.stride.length && (Array.isArray(obj.data) || isTypedArray(obj.data));
};

},{"./is-typed-array":28}],28:[function(require,module,exports){
var dtypes = require('../constants/arraytypes.json');
module.exports = function (x) {
  return Object.prototype.toString.call(x) in dtypes;
};

},{"../constants/arraytypes.json":4}],29:[function(require,module,exports){
module.exports = function loop(n, f) {
  var result = Array(n);
  for (var i = 0; i < n; ++i) {
    result[i] = f(i);
  }
  return result;
};

},{}],30:[function(require,module,exports){
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

},{"./loop":29}],31:[function(require,module,exports){
/* globals requestAnimationFrame, cancelAnimationFrame */
module.exports = {
  next: typeof requestAnimationFrame === 'function' ? function (cb) {
    return requestAnimationFrame(cb);
  } : function (cb) {
    return setTimeout(cb, 16);
  },
  cancel: typeof cancelAnimationFrame === 'function' ? function (raf) {
    return cancelAnimationFrame(raf);
  } : clearTimeout
};

},{}],32:[function(require,module,exports){
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

},{"./pool":30}],33:[function(require,module,exports){
module.exports = function (obj) {
  return Object.keys(obj).map(function (key) {
    return obj[key];
  });
};

},{}],34:[function(require,module,exports){
// Context and canvas creation helper functions
var check = require('./util/check');
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
      h = bounds.bottom - bounds.top;
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
  check(Array.isArray(input), 'invalid extension array');
  return input;
}

function getElement(desc) {
  if (typeof desc === 'string') {
    check(typeof document !== 'undefined', 'not supported outside of DOM');
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
    if (err) {
      check.raise(err);
    }
  };
  var onDestroy = function () {};
  if (typeof args === 'string') {
    check(typeof document !== 'undefined', 'selector queries only supported in DOM enviroments');
    element = document.querySelector(args);
    check(element, 'invalid query string for element');
  } else if (typeof args === 'object') {
    if (isHTMLElement(args)) {
      element = args;
    } else if (isWebGLContext(args)) {
      gl = args;
      canvas = gl.canvas;
    } else {
      check.constructor(args);
      if ('gl' in args) {
        gl = args.gl;
      } else if ('canvas' in args) {
        canvas = getElement(args.canvas);
      } else if ('container' in args) {
        container = getElement(args.container);
      }
      if ('attributes' in args) {
        contextAttributes = args.attributes;
        check.type(contextAttributes, 'object', 'invalid context attributes');
      }
      if ('extensions' in args) {
        extensions = parseExtensions(args.extensions);
      }
      if ('optionalExtensions' in args) {
        optionalExtensions = parseExtensions(args.optionalExtensions);
      }
      if ('onDone' in args) {
        check.type(args.onDone, 'function', 'invalid or missing onDone callback');
        onDone = args.onDone;
      }
      if ('profile' in args) {
        profile = !!args.profile;
      }
      if ('pixelRatio' in args) {
        pixelRatio = +args.pixelRatio;
        check(pixelRatio > 0, 'invalid pixel ratio');
      }
    }
  } else {
    check.raise('invalid arguments to regl');
  }

  if (element) {
    if (element.nodeName.toLowerCase() === 'canvas') {
      canvas = element;
    } else {
      container = element;
    }
  }

  if (!gl) {
    if (!canvas) {
      check(typeof document !== 'undefined', 'must manually specify webgl context outside of DOM environments');
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

},{"./util/check":21,"./util/extend":24}],35:[function(require,module,exports){
'use strict'

module.exports = mouseListen

var mouse = require('mouse-event')

function mouseListen(element, callback) {
  if(!callback) {
    callback = element
    element = window
  }

  var buttonState = 0
  var x = 0
  var y = 0
  var mods = {
    shift:   false,
    alt:     false,
    control: false,
    meta:    false
  }
  var attached = false

  function updateMods(ev) {
    var changed = false
    if('altKey' in ev) {
      changed = changed || ev.altKey !== mods.alt
      mods.alt = !!ev.altKey
    }
    if('shiftKey' in ev) {
      changed = changed || ev.shiftKey !== mods.shift
      mods.shift = !!ev.shiftKey
    }
    if('ctrlKey' in ev) {
      changed = changed || ev.ctrlKey !== mods.control
      mods.control = !!ev.ctrlKey
    }
    if('metaKey' in ev) {
      changed = changed || ev.metaKey !== mods.meta
      mods.meta = !!ev.metaKey
    }
    return changed
  }

  function handleEvent(nextButtons, ev) {
    var nextX = mouse.x(ev)
    var nextY = mouse.y(ev)
    if('buttons' in ev) {
      nextButtons = ev.buttons|0
    }
    if(nextButtons !== buttonState ||
       nextX !== x ||
       nextY !== y ||
       updateMods(ev)) {
      buttonState = nextButtons|0
      x = nextX||0
      y = nextY||0
      callback && callback(buttonState, x, y, mods)
    }
  }

  function clearState(ev) {
    handleEvent(0, ev)
  }

  function handleBlur() {
    if(buttonState ||
      x ||
      y ||
      mods.shift ||
      mods.alt ||
      mods.meta ||
      mods.control) {

      x = y = 0
      buttonState = 0
      mods.shift = mods.alt = mods.control = mods.meta = false
      callback && callback(0, 0, 0, mods)
    }
  }

  function handleMods(ev) {
    if(updateMods(ev)) {
      callback && callback(buttonState, x, y, mods)
    }
  }

  function handleMouseMove(ev) {
    if(mouse.buttons(ev) === 0) {
      handleEvent(0, ev)
    } else {
      handleEvent(buttonState, ev)
    }
  }

  function handleMouseDown(ev) {
    handleEvent(buttonState | mouse.buttons(ev), ev)
  }

  function handleMouseUp(ev) {
    handleEvent(buttonState & ~mouse.buttons(ev), ev)
  }

  function attachListeners() {
    if(attached) {
      return
    }
    attached = true

    element.addEventListener('mousemove', handleMouseMove)

    element.addEventListener('mousedown', handleMouseDown)

    element.addEventListener('mouseup', handleMouseUp)

    element.addEventListener('mouseleave', clearState)
    element.addEventListener('mouseenter', clearState)
    element.addEventListener('mouseout', clearState)
    element.addEventListener('mouseover', clearState)

    element.addEventListener('blur', handleBlur)

    element.addEventListener('keyup', handleMods)
    element.addEventListener('keydown', handleMods)
    element.addEventListener('keypress', handleMods)

    if(element !== window) {
      window.addEventListener('blur', handleBlur)

      window.addEventListener('keyup', handleMods)
      window.addEventListener('keydown', handleMods)
      window.addEventListener('keypress', handleMods)
    }
  }

  function detachListeners() {
    if(!attached) {
      return
    }
    attached = false

    element.removeEventListener('mousemove', handleMouseMove)

    element.removeEventListener('mousedown', handleMouseDown)

    element.removeEventListener('mouseup', handleMouseUp)

    element.removeEventListener('mouseleave', clearState)
    element.removeEventListener('mouseenter', clearState)
    element.removeEventListener('mouseout', clearState)
    element.removeEventListener('mouseover', clearState)

    element.removeEventListener('blur', handleBlur)

    element.removeEventListener('keyup', handleMods)
    element.removeEventListener('keydown', handleMods)
    element.removeEventListener('keypress', handleMods)

    if(element !== window) {
      window.removeEventListener('blur', handleBlur)

      window.removeEventListener('keyup', handleMods)
      window.removeEventListener('keydown', handleMods)
      window.removeEventListener('keypress', handleMods)
    }
  }

  //Attach listeners
  attachListeners()

  var result = {
    element: element
  }

  Object.defineProperties(result, {
    enabled: {
      get: function() { return attached },
      set: function(f) {
        if(f) {
          attachListeners()
        } else {
          detachListeners
        }
      },
      enumerable: true
    },
    buttons: {
      get: function() { return buttonState },
      enumerable: true
    },
    x: {
      get: function() { return x },
      enumerable: true
    },
    y: {
      get: function() { return y },
      enumerable: true
    },
    mods: {
      get: function() { return mods },
      enumerable: true
    }
  })

  return result
}

},{"mouse-event":36}],36:[function(require,module,exports){
'use strict'

function mouseButtons(ev) {
  if(typeof ev === 'object') {
    if('buttons' in ev) {
      return ev.buttons
    } else if('which' in ev) {
      var b = ev.which
      if(b === 2) {
        return 4
      } else if(b === 3) {
        return 2
      } else if(b > 0) {
        return 1<<(b-1)
      }
    } else if('button' in ev) {
      var b = ev.button
      if(b === 1) {
        return 4
      } else if(b === 2) {
        return 2
      } else if(b >= 0) {
        return 1<<b
      }
    }
  }
  return 0
}
exports.buttons = mouseButtons

function mouseElement(ev) {
  return ev.target || ev.srcElement || window
}
exports.element = mouseElement

function mouseRelativeX(ev) {
  if(typeof ev === 'object') {
    if('offsetX' in ev) {
      return ev.offsetX
    }
    var target = mouseElement(ev)
    var bounds = target.getBoundingClientRect()
    return ev.clientX - bounds.left
  }
  return 0
}
exports.x = mouseRelativeX

function mouseRelativeY(ev) {
  if(typeof ev === 'object') {
    if('offsetY' in ev) {
      return ev.offsetY
    }
    var target = mouseElement(ev)
    var bounds = target.getBoundingClientRect()
    return ev.clientY - bounds.top
  }
  return 0
}
exports.y = mouseRelativeY

},{}],37:[function(require,module,exports){
var check = require('./lib/util/check');
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
    check(!!options, 'invalid args to regl({...})');
    check.type(options, 'object', 'invalid args to regl({...})');

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
      if (contextLost) {
        check.raise('context lost');
      }
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

  var setFBO = framebufferState.setFBO = compileProcedure({
    framebuffer: dynamic.define.call(null, DYN_PROP, 'framebuffer')
  });

  function clearImpl(_, options) {
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

    check(!!clearFlags, 'called regl.clear with no buffer specified');
    gl.clear(clearFlags);
  }

  function clear(options) {
    check(typeof options === 'object' && options, 'regl.clear() takes an object as input');
    if ('framebuffer' in options) {
      if (options.framebuffer && options.framebuffer_reglType === 'framebufferCube') {
        for (var i = 0; i < 6; ++i) {
          setFBO(extend({
            framebuffer: options.framebuffer.faces[i]
          }, options), clearImpl);
        }
      } else {
        setFBO(options, clearImpl);
      }
    } else {
      clearImpl(null, options);
    }
  }

  function frame(cb) {
    check.type(cb, 'function', 'regl.frame() callback must be a function');
    rafCallbacks.push(cb);

    function cancel() {
      // FIXME:  should we check something other than equals cb here?
      // what if a user calls frame twice with the same callback...
      //
      var i = find(rafCallbacks, cb);
      check(i >= 0, 'cannot cancel a frame twice');
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
    check.type(callback, 'function', 'listener callback must be a function');

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
        check.raise('invalid event, must be one of frame,lost,restore,destroy');
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

},{"./lib/attribute":2,"./lib/buffer":3,"./lib/core":8,"./lib/dynamic":9,"./lib/elements":10,"./lib/extension":11,"./lib/framebuffer":12,"./lib/limits":13,"./lib/read":14,"./lib/renderbuffer":15,"./lib/shader":16,"./lib/stats":17,"./lib/strings":18,"./lib/texture":19,"./lib/timer":20,"./lib/util/check":21,"./lib/util/clock":22,"./lib/util/extend":24,"./lib/util/raf":31,"./lib/webgl":34}]},{},[1])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJleGFtcGxlL2ZlZWRiYWNrLmpzIiwibGliL2F0dHJpYnV0ZS5qcyIsImxpYi9idWZmZXIuanMiLCJsaWIvY29uc3RhbnRzL2FycmF5dHlwZXMuanNvbiIsImxpYi9jb25zdGFudHMvZHR5cGVzLmpzb24iLCJsaWIvY29uc3RhbnRzL3ByaW1pdGl2ZXMuanNvbiIsImxpYi9jb25zdGFudHMvdXNhZ2UuanNvbiIsImxpYi9jb3JlLmpzIiwibGliL2R5bmFtaWMuanMiLCJsaWIvZWxlbWVudHMuanMiLCJsaWIvZXh0ZW5zaW9uLmpzIiwibGliL2ZyYW1lYnVmZmVyLmpzIiwibGliL2xpbWl0cy5qcyIsImxpYi9yZWFkLmpzIiwibGliL3JlbmRlcmJ1ZmZlci5qcyIsImxpYi9zaGFkZXIuanMiLCJsaWIvc3RhdHMuanMiLCJsaWIvc3RyaW5ncy5qcyIsImxpYi90ZXh0dXJlLmpzIiwibGliL3RpbWVyLmpzIiwibGliL3V0aWwvY2hlY2suanMiLCJsaWIvdXRpbC9jbG9jay5qcyIsImxpYi91dGlsL2NvZGVnZW4uanMiLCJsaWIvdXRpbC9leHRlbmQuanMiLCJsaWIvdXRpbC9mbGF0dGVuLmpzIiwibGliL3V0aWwvaXMtYXJyYXktbGlrZS5qcyIsImxpYi91dGlsL2lzLW5kYXJyYXkuanMiLCJsaWIvdXRpbC9pcy10eXBlZC1hcnJheS5qcyIsImxpYi91dGlsL2xvb3AuanMiLCJsaWIvdXRpbC9wb29sLmpzIiwibGliL3V0aWwvcmFmLmpzIiwibGliL3V0aWwvdG8taGFsZi1mbG9hdC5qcyIsImxpYi91dGlsL3ZhbHVlcy5qcyIsImxpYi93ZWJnbC5qcyIsIm5vZGVfbW9kdWxlcy9tb3VzZS1jaGFuZ2UvbW91c2UtbGlzdGVuLmpzIiwibm9kZV9tb2R1bGVzL21vdXNlLWV2ZW50L21vdXNlLmpzIiwicmVnbC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBOzs7Ozs7QUFN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O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FB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Z0JsQyxjQUFVLFVBQVUsT0FBVixFQUFtQjtBQUMzQixhQUFPLGFBQWEsTUFBYixDQUFvQixPQUFwQixFQUE2QixLQUE3QixDQUFQO0FBQ0QsS0FsQmlDO0FBbUJsQyxhQUFTLGFBQWEsUUFuQlk7QUFvQmxDLFVBQU0sYUFBYSxVQXBCZTtBQXFCbEMsa0JBQWMsa0JBQWtCLE1BckJFO0FBc0JsQyxpQkFBYSxpQkFBaUIsTUF0Qkk7QUF1QmxDLHFCQUFpQixpQkFBaUIsVUF2QkE7O0FBeUJsQztBQUNBLGdCQUFZLFlBMUJzQjs7QUE0QmxDO0FBQ0EsV0FBTyxLQTdCMkI7QUE4QmxDLFFBQUksV0E5QjhCOztBQWdDbEM7QUFDQSxZQUFRLE1BakMwQjtBQWtDbEMsa0JBQWMsVUFBVSxJQUFWLEVBQWdCO0FBQzVCLGFBQU8sT0FBTyxVQUFQLENBQWtCLE9BQWxCLENBQTBCLEtBQUssV0FBTCxFQUExQixLQUFpRCxDQUF4RDtBQUNELEtBcENpQzs7QUFzQ2xDO0FBQ0EsVUFBTSxVQXZDNEI7O0FBeUNsQztBQUNBLGFBQVMsT0ExQ3lCOztBQTRDbEM7QUFDQSxTQUFLLEVBN0M2QjtBQThDbEMsY0FBVSxPQTlDd0I7O0FBZ0RsQyxVQUFNLFlBQVk7QUFDaEI7QUFDQSxVQUFJLEtBQUosRUFBVztBQUNULGNBQU0sTUFBTjtBQUNEO0FBQ0YsS0FyRGlDOztBQXVEbEM7QUFDQSxTQUFLLEdBeEQ2Qjs7QUEwRGxDO0FBQ0EsV0FBTztBQTNEMkIsR0FBekIsQ0FBWDs7QUE4REEsU0FBTyxNQUFQLENBQWMsSUFBZCxFQUFvQixJQUFwQjs7QUFFQSxTQUFPLElBQVA7QUFDRCxDQXhpQkQiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLypcbiAgdGFnczogYmFzaWNcblxuIDxwPiBUaGlzIGV4YW1wbGUgc2hvd3MgaG93IHRvIHVzZSBjb3B5VGV4SW1hZ2UyRCB0byBpbXBsZW1lbnQgZmVlZGJhY2sgZWZmZWN0cyA8L3A+XG4gKi9cblxuY29uc3QgcmVnbCA9IHJlcXVpcmUoJy4uL3JlZ2wnKSgpXG5jb25zdCBtb3VzZSA9IHJlcXVpcmUoJ21vdXNlLWNoYW5nZScpKClcblxuY29uc3QgcGl4ZWxzID0gcmVnbC50ZXh0dXJlKClcblxuY29uc3QgZHJhd0ZlZWRiYWNrID0gcmVnbCh7XG4gIGZyYWc6IGBcbiAgcHJlY2lzaW9uIG1lZGl1bXAgZmxvYXQ7XG4gIHVuaWZvcm0gc2FtcGxlcjJEIHRleHR1cmU7XG4gIHVuaWZvcm0gdmVjMiBtb3VzZTtcbiAgdW5pZm9ybSBmbG9hdCB0O1xuICB2YXJ5aW5nIHZlYzIgdXY7XG4gIHZvaWQgbWFpbiAoKSB7XG4gICAgZmxvYXQgZGlzdCA9IGxlbmd0aChnbF9GcmFnQ29vcmQueHkgLSBtb3VzZSk7XG4gICAgZ2xfRnJhZ0NvbG9yID0gdmVjNCgwLjk4ICogdGV4dHVyZTJEKHRleHR1cmUsXG4gICAgICB1diArIGNvcyh0KSAqIHZlYzIoMC41IC0gdXYueSwgdXYueCAtIDAuNSkgLSBzaW4oMi4wICogdCkgKiAodXYgLSAwLjUpKS5yZ2IsIDEpICtcbiAgICAgIGV4cCgtMC4wMSAqIGRpc3QpICogdmVjNChcbiAgICAgICAgMS4wICsgY29zKDIuMCAqIHQpLFxuICAgICAgICAxLjAgKyBjb3MoMi4wICogdCArIDEuNSksXG4gICAgICAgIDEuMCArIGNvcygyLjAgKiB0ICsgMy4wKSxcbiAgICAgICAgMC4wKTtcbiAgfWAsXG5cbiAgdmVydDogYFxuICBwcmVjaXNpb24gbWVkaXVtcCBmbG9hdDtcbiAgYXR0cmlidXRlIHZlYzIgcG9zaXRpb247XG4gIHZhcnlpbmcgdmVjMiB1djtcbiAgdm9pZCBtYWluICgpIHtcbiAgICB1diA9IHBvc2l0aW9uO1xuICAgIGdsX1Bvc2l0aW9uID0gdmVjNCgyLjAgKiBwb3NpdGlvbiAtIDEuMCwgMCwgMSk7XG4gIH1gLFxuXG4gIGF0dHJpYnV0ZXM6IHtcbiAgICBwb3NpdGlvbjogW1xuICAgICAgLTIsIDAsXG4gICAgICAwLCAtMixcbiAgICAgIDIsIDJdXG4gIH0sXG5cbiAgdW5pZm9ybXM6IHtcbiAgICB0ZXh0dXJlOiBwaXhlbHMsXG4gICAgbW91c2U6ICh7cGl4ZWxSYXRpbywgdmlld3BvcnRIZWlnaHR9KSA9PiBbXG4gICAgICBtb3VzZS54ICogcGl4ZWxSYXRpbyxcbiAgICAgIHZpZXdwb3J0SGVpZ2h0IC0gbW91c2UueSAqIHBpeGVsUmF0aW9cbiAgICBdLFxuICAgIHQ6ICh7dGlja30pID0+IDAuMDEgKiB0aWNrXG4gIH0sXG5cbiAgY291bnQ6IDNcbn0pXG5cbnJlZ2wuZnJhbWUoZnVuY3Rpb24gKCkge1xuICByZWdsLmNsZWFyKHtcbiAgICBjb2xvcjogWzAsIDAsIDAsIDFdXG4gIH0pXG5cbiAgZHJhd0ZlZWRiYWNrKClcblxuICBwaXhlbHMoe1xuICAgIGNvcHk6IHRydWVcbiAgfSlcbn0pXG4iLCJ2YXIgR0xfRkxPQVQgPSA1MTI2XG5cbmZ1bmN0aW9uIEF0dHJpYnV0ZVJlY29yZCAoKSB7XG4gIHRoaXMuc3RhdGUgPSAwXG5cbiAgdGhpcy54ID0gMC4wXG4gIHRoaXMueSA9IDAuMFxuICB0aGlzLnogPSAwLjBcbiAgdGhpcy53ID0gMC4wXG5cbiAgdGhpcy5idWZmZXIgPSBudWxsXG4gIHRoaXMuc2l6ZSA9IDBcbiAgdGhpcy5ub3JtYWxpemVkID0gZmFsc2VcbiAgdGhpcy50eXBlID0gR0xfRkxPQVRcbiAgdGhpcy5vZmZzZXQgPSAwXG4gIHRoaXMuc3RyaWRlID0gMFxuICB0aGlzLmRpdmlzb3IgPSAwXG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcEF0dHJpYnV0ZVN0YXRlIChcbiAgZ2wsXG4gIGV4dGVuc2lvbnMsXG4gIGxpbWl0cyxcbiAgYnVmZmVyU3RhdGUsXG4gIHN0cmluZ1N0b3JlKSB7XG4gIHZhciBOVU1fQVRUUklCVVRFUyA9IGxpbWl0cy5tYXhBdHRyaWJ1dGVzXG4gIHZhciBhdHRyaWJ1dGVCaW5kaW5ncyA9IG5ldyBBcnJheShOVU1fQVRUUklCVVRFUylcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBOVU1fQVRUUklCVVRFUzsgKytpKSB7XG4gICAgYXR0cmlidXRlQmluZGluZ3NbaV0gPSBuZXcgQXR0cmlidXRlUmVjb3JkKClcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgUmVjb3JkOiBBdHRyaWJ1dGVSZWNvcmQsXG4gICAgc2NvcGU6IHt9LFxuICAgIHN0YXRlOiBhdHRyaWJ1dGVCaW5kaW5nc1xuICB9XG59XG4iLCJ2YXIgY2hlY2sgPSByZXF1aXJlKCcuL3V0aWwvY2hlY2snKVxudmFyIGlzVHlwZWRBcnJheSA9IHJlcXVpcmUoJy4vdXRpbC9pcy10eXBlZC1hcnJheScpXG52YXIgaXNOREFycmF5TGlrZSA9IHJlcXVpcmUoJy4vdXRpbC9pcy1uZGFycmF5JylcbnZhciB2YWx1ZXMgPSByZXF1aXJlKCcuL3V0aWwvdmFsdWVzJylcbnZhciBwb29sID0gcmVxdWlyZSgnLi91dGlsL3Bvb2wnKVxudmFyIGZsYXR0ZW5VdGlsID0gcmVxdWlyZSgnLi91dGlsL2ZsYXR0ZW4nKVxuXG52YXIgYXJyYXlGbGF0dGVuID0gZmxhdHRlblV0aWwuZmxhdHRlblxudmFyIGFycmF5U2hhcGUgPSBmbGF0dGVuVXRpbC5zaGFwZVxuXG52YXIgYXJyYXlUeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL2FycmF5dHlwZXMuanNvbicpXG52YXIgYnVmZmVyVHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9kdHlwZXMuanNvbicpXG52YXIgdXNhZ2VUeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL3VzYWdlLmpzb24nKVxuXG52YXIgR0xfU1RBVElDX0RSQVcgPSAweDg4RTRcbnZhciBHTF9TVFJFQU1fRFJBVyA9IDB4ODhFMFxuXG52YXIgR0xfVU5TSUdORURfQllURSA9IDUxMjFcbnZhciBHTF9GTE9BVCA9IDUxMjZcblxudmFyIERUWVBFU19TSVpFUyA9IFtdXG5EVFlQRVNfU0laRVNbNTEyMF0gPSAxIC8vIGludDhcbkRUWVBFU19TSVpFU1s1MTIyXSA9IDIgLy8gaW50MTZcbkRUWVBFU19TSVpFU1s1MTI0XSA9IDQgLy8gaW50MzJcbkRUWVBFU19TSVpFU1s1MTIxXSA9IDEgLy8gdWludDhcbkRUWVBFU19TSVpFU1s1MTIzXSA9IDIgLy8gdWludDE2XG5EVFlQRVNfU0laRVNbNTEyNV0gPSA0IC8vIHVpbnQzMlxuRFRZUEVTX1NJWkVTWzUxMjZdID0gNCAvLyBmbG9hdDMyXG5cbmZ1bmN0aW9uIHR5cGVkQXJyYXlDb2RlIChkYXRhKSB7XG4gIHJldHVybiBhcnJheVR5cGVzW09iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChkYXRhKV0gfCAwXG59XG5cbmZ1bmN0aW9uIGNvcHlBcnJheSAob3V0LCBpbnApIHtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBpbnAubGVuZ3RoOyArK2kpIHtcbiAgICBvdXRbaV0gPSBpbnBbaV1cbiAgfVxufVxuXG5mdW5jdGlvbiB0cmFuc3Bvc2UgKFxuICByZXN1bHQsIGRhdGEsIHNoYXBlWCwgc2hhcGVZLCBzdHJpZGVYLCBzdHJpZGVZLCBvZmZzZXQpIHtcbiAgdmFyIHB0ciA9IDBcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzaGFwZVg7ICsraSkge1xuICAgIGZvciAodmFyIGogPSAwOyBqIDwgc2hhcGVZOyArK2opIHtcbiAgICAgIHJlc3VsdFtwdHIrK10gPSBkYXRhW3N0cmlkZVggKiBpICsgc3RyaWRlWSAqIGogKyBvZmZzZXRdXG4gICAgfVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcEJ1ZmZlclN0YXRlIChnbCwgc3RhdHMsIGNvbmZpZykge1xuICB2YXIgYnVmZmVyQ291bnQgPSAwXG4gIHZhciBidWZmZXJTZXQgPSB7fVxuXG4gIGZ1bmN0aW9uIFJFR0xCdWZmZXIgKHR5cGUpIHtcbiAgICB0aGlzLmlkID0gYnVmZmVyQ291bnQrK1xuICAgIHRoaXMuYnVmZmVyID0gZ2wuY3JlYXRlQnVmZmVyKClcbiAgICB0aGlzLnR5cGUgPSB0eXBlXG4gICAgdGhpcy51c2FnZSA9IEdMX1NUQVRJQ19EUkFXXG4gICAgdGhpcy5ieXRlTGVuZ3RoID0gMFxuICAgIHRoaXMuZGltZW5zaW9uID0gMVxuICAgIHRoaXMuZHR5cGUgPSBHTF9VTlNJR05FRF9CWVRFXG5cbiAgICB0aGlzLnBlcnNpc3RlbnREYXRhID0gbnVsbFxuXG4gICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICB0aGlzLnN0YXRzID0ge3NpemU6IDB9XG4gICAgfVxuICB9XG5cbiAgUkVHTEJ1ZmZlci5wcm90b3R5cGUuYmluZCA9IGZ1bmN0aW9uICgpIHtcbiAgICBnbC5iaW5kQnVmZmVyKHRoaXMudHlwZSwgdGhpcy5idWZmZXIpXG4gIH1cblxuICBSRUdMQnVmZmVyLnByb3RvdHlwZS5kZXN0cm95ID0gZnVuY3Rpb24gKCkge1xuICAgIGRlc3Ryb3kodGhpcylcbiAgfVxuXG4gIHZhciBzdHJlYW1Qb29sID0gW11cblxuICBmdW5jdGlvbiBjcmVhdGVTdHJlYW0gKHR5cGUsIGRhdGEpIHtcbiAgICB2YXIgYnVmZmVyID0gc3RyZWFtUG9vbC5wb3AoKVxuICAgIGlmICghYnVmZmVyKSB7XG4gICAgICBidWZmZXIgPSBuZXcgUkVHTEJ1ZmZlcih0eXBlKVxuICAgIH1cbiAgICBidWZmZXIuYmluZCgpXG4gICAgaW5pdEJ1ZmZlckZyb21EYXRhKGJ1ZmZlciwgZGF0YSwgR0xfU1RSRUFNX0RSQVcsIDAsIDEsIGZhbHNlKVxuICAgIHJldHVybiBidWZmZXJcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3lTdHJlYW0gKHN0cmVhbSkge1xuICAgIHN0cmVhbVBvb2wucHVzaChzdHJlYW0pXG4gIH1cblxuICBmdW5jdGlvbiBpbml0QnVmZmVyRnJvbVR5cGVkQXJyYXkgKGJ1ZmZlciwgZGF0YSwgdXNhZ2UpIHtcbiAgICBidWZmZXIuYnl0ZUxlbmd0aCA9IGRhdGEuYnl0ZUxlbmd0aFxuICAgIGdsLmJ1ZmZlckRhdGEoYnVmZmVyLnR5cGUsIGRhdGEsIHVzYWdlKVxuICB9XG5cbiAgZnVuY3Rpb24gaW5pdEJ1ZmZlckZyb21EYXRhIChidWZmZXIsIGRhdGEsIHVzYWdlLCBkdHlwZSwgZGltZW5zaW9uLCBwZXJzaXN0KSB7XG4gICAgdmFyIHNoYXBlXG4gICAgYnVmZmVyLnVzYWdlID0gdXNhZ2VcbiAgICBpZiAoQXJyYXkuaXNBcnJheShkYXRhKSkge1xuICAgICAgYnVmZmVyLmR0eXBlID0gZHR5cGUgfHwgR0xfRkxPQVRcbiAgICAgIGlmIChkYXRhLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdmFyIGZsYXREYXRhXG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KGRhdGFbMF0pKSB7XG4gICAgICAgICAgc2hhcGUgPSBhcnJheVNoYXBlKGRhdGEpXG4gICAgICAgICAgdmFyIGRpbSA9IDFcbiAgICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IHNoYXBlLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgICBkaW0gKj0gc2hhcGVbaV1cbiAgICAgICAgICB9XG4gICAgICAgICAgYnVmZmVyLmRpbWVuc2lvbiA9IGRpbVxuICAgICAgICAgIGZsYXREYXRhID0gYXJyYXlGbGF0dGVuKGRhdGEsIHNoYXBlLCBidWZmZXIuZHR5cGUpXG4gICAgICAgICAgaW5pdEJ1ZmZlckZyb21UeXBlZEFycmF5KGJ1ZmZlciwgZmxhdERhdGEsIHVzYWdlKVxuICAgICAgICAgIGlmIChwZXJzaXN0KSB7XG4gICAgICAgICAgICBidWZmZXIucGVyc2lzdGVudERhdGEgPSBmbGF0RGF0YVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwb29sLmZyZWVUeXBlKGZsYXREYXRhKVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZGF0YVswXSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICBidWZmZXIuZGltZW5zaW9uID0gZGltZW5zaW9uXG4gICAgICAgICAgdmFyIHR5cGVkRGF0YSA9IHBvb2wuYWxsb2NUeXBlKGJ1ZmZlci5kdHlwZSwgZGF0YS5sZW5ndGgpXG4gICAgICAgICAgY29weUFycmF5KHR5cGVkRGF0YSwgZGF0YSlcbiAgICAgICAgICBpbml0QnVmZmVyRnJvbVR5cGVkQXJyYXkoYnVmZmVyLCB0eXBlZERhdGEsIHVzYWdlKVxuICAgICAgICAgIGlmIChwZXJzaXN0KSB7XG4gICAgICAgICAgICBidWZmZXIucGVyc2lzdGVudERhdGEgPSB0eXBlZERhdGFcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcG9vbC5mcmVlVHlwZSh0eXBlZERhdGEpXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKGlzVHlwZWRBcnJheShkYXRhWzBdKSkge1xuICAgICAgICAgIGJ1ZmZlci5kaW1lbnNpb24gPSBkYXRhWzBdLmxlbmd0aFxuICAgICAgICAgIGJ1ZmZlci5kdHlwZSA9IGR0eXBlIHx8IHR5cGVkQXJyYXlDb2RlKGRhdGFbMF0pIHx8IEdMX0ZMT0FUXG4gICAgICAgICAgZmxhdERhdGEgPSBhcnJheUZsYXR0ZW4oXG4gICAgICAgICAgICBkYXRhLFxuICAgICAgICAgICAgW2RhdGEubGVuZ3RoLCBkYXRhWzBdLmxlbmd0aF0sXG4gICAgICAgICAgICBidWZmZXIuZHR5cGUpXG4gICAgICAgICAgaW5pdEJ1ZmZlckZyb21UeXBlZEFycmF5KGJ1ZmZlciwgZmxhdERhdGEsIHVzYWdlKVxuICAgICAgICAgIGlmIChwZXJzaXN0KSB7XG4gICAgICAgICAgICBidWZmZXIucGVyc2lzdGVudERhdGEgPSBmbGF0RGF0YVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwb29sLmZyZWVUeXBlKGZsYXREYXRhKVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjaGVjay5yYWlzZSgnaW52YWxpZCBidWZmZXIgZGF0YScpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGlzVHlwZWRBcnJheShkYXRhKSkge1xuICAgICAgYnVmZmVyLmR0eXBlID0gZHR5cGUgfHwgdHlwZWRBcnJheUNvZGUoZGF0YSlcbiAgICAgIGJ1ZmZlci5kaW1lbnNpb24gPSBkaW1lbnNpb25cbiAgICAgIGluaXRCdWZmZXJGcm9tVHlwZWRBcnJheShidWZmZXIsIGRhdGEsIHVzYWdlKVxuICAgICAgaWYgKHBlcnNpc3QpIHtcbiAgICAgICAgYnVmZmVyLnBlcnNpc3RlbnREYXRhID0gbmV3IFVpbnQ4QXJyYXkobmV3IFVpbnQ4QXJyYXkoZGF0YS5idWZmZXIpKVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoaXNOREFycmF5TGlrZShkYXRhKSkge1xuICAgICAgc2hhcGUgPSBkYXRhLnNoYXBlXG4gICAgICB2YXIgc3RyaWRlID0gZGF0YS5zdHJpZGVcbiAgICAgIHZhciBvZmZzZXQgPSBkYXRhLm9mZnNldFxuXG4gICAgICB2YXIgc2hhcGVYID0gMFxuICAgICAgdmFyIHNoYXBlWSA9IDBcbiAgICAgIHZhciBzdHJpZGVYID0gMFxuICAgICAgdmFyIHN0cmlkZVkgPSAwXG4gICAgICBpZiAoc2hhcGUubGVuZ3RoID09PSAxKSB7XG4gICAgICAgIHNoYXBlWCA9IHNoYXBlWzBdXG4gICAgICAgIHNoYXBlWSA9IDFcbiAgICAgICAgc3RyaWRlWCA9IHN0cmlkZVswXVxuICAgICAgICBzdHJpZGVZID0gMFxuICAgICAgfSBlbHNlIGlmIChzaGFwZS5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgc2hhcGVYID0gc2hhcGVbMF1cbiAgICAgICAgc2hhcGVZID0gc2hhcGVbMV1cbiAgICAgICAgc3RyaWRlWCA9IHN0cmlkZVswXVxuICAgICAgICBzdHJpZGVZID0gc3RyaWRlWzFdXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjaGVjay5yYWlzZSgnaW52YWxpZCBzaGFwZScpXG4gICAgICB9XG5cbiAgICAgIGJ1ZmZlci5kdHlwZSA9IGR0eXBlIHx8IHR5cGVkQXJyYXlDb2RlKGRhdGEuZGF0YSkgfHwgR0xfRkxPQVRcbiAgICAgIGJ1ZmZlci5kaW1lbnNpb24gPSBzaGFwZVlcblxuICAgICAgdmFyIHRyYW5zcG9zZURhdGEgPSBwb29sLmFsbG9jVHlwZShidWZmZXIuZHR5cGUsIHNoYXBlWCAqIHNoYXBlWSlcbiAgICAgIHRyYW5zcG9zZSh0cmFuc3Bvc2VEYXRhLFxuICAgICAgICBkYXRhLmRhdGEsXG4gICAgICAgIHNoYXBlWCwgc2hhcGVZLFxuICAgICAgICBzdHJpZGVYLCBzdHJpZGVZLFxuICAgICAgICBvZmZzZXQpXG4gICAgICBpbml0QnVmZmVyRnJvbVR5cGVkQXJyYXkoYnVmZmVyLCB0cmFuc3Bvc2VEYXRhLCB1c2FnZSlcbiAgICAgIGlmIChwZXJzaXN0KSB7XG4gICAgICAgIGJ1ZmZlci5wZXJzaXN0ZW50RGF0YSA9IHRyYW5zcG9zZURhdGFcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBvb2wuZnJlZVR5cGUodHJhbnNwb3NlRGF0YSlcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY2hlY2sucmFpc2UoJ2ludmFsaWQgYnVmZmVyIGRhdGEnKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3kgKGJ1ZmZlcikge1xuICAgIHN0YXRzLmJ1ZmZlckNvdW50LS1cblxuICAgIHZhciBoYW5kbGUgPSBidWZmZXIuYnVmZmVyXG4gICAgY2hlY2soaGFuZGxlLCAnYnVmZmVyIG11c3Qgbm90IGJlIGRlbGV0ZWQgYWxyZWFkeScpXG4gICAgZ2wuZGVsZXRlQnVmZmVyKGhhbmRsZSlcbiAgICBidWZmZXIuYnVmZmVyID0gbnVsbFxuICAgIGRlbGV0ZSBidWZmZXJTZXRbYnVmZmVyLmlkXVxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlQnVmZmVyIChvcHRpb25zLCB0eXBlLCBkZWZlckluaXQsIHBlcnNpc3RlbnQpIHtcbiAgICBzdGF0cy5idWZmZXJDb3VudCsrXG5cbiAgICB2YXIgYnVmZmVyID0gbmV3IFJFR0xCdWZmZXIodHlwZSlcbiAgICBidWZmZXJTZXRbYnVmZmVyLmlkXSA9IGJ1ZmZlclxuXG4gICAgZnVuY3Rpb24gcmVnbEJ1ZmZlciAob3B0aW9ucykge1xuICAgICAgdmFyIHVzYWdlID0gR0xfU1RBVElDX0RSQVdcbiAgICAgIHZhciBkYXRhID0gbnVsbFxuICAgICAgdmFyIGJ5dGVMZW5ndGggPSAwXG4gICAgICB2YXIgZHR5cGUgPSAwXG4gICAgICB2YXIgZGltZW5zaW9uID0gMVxuICAgICAgaWYgKEFycmF5LmlzQXJyYXkob3B0aW9ucykgfHxcbiAgICAgICAgICBpc1R5cGVkQXJyYXkob3B0aW9ucykgfHxcbiAgICAgICAgICBpc05EQXJyYXlMaWtlKG9wdGlvbnMpKSB7XG4gICAgICAgIGRhdGEgPSBvcHRpb25zXG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBvcHRpb25zID09PSAnbnVtYmVyJykge1xuICAgICAgICBieXRlTGVuZ3RoID0gb3B0aW9ucyB8IDBcbiAgICAgIH0gZWxzZSBpZiAob3B0aW9ucykge1xuICAgICAgICBjaGVjay50eXBlKFxuICAgICAgICAgIG9wdGlvbnMsICdvYmplY3QnLFxuICAgICAgICAgICdidWZmZXIgYXJndW1lbnRzIG11c3QgYmUgYW4gb2JqZWN0LCBhIG51bWJlciBvciBhbiBhcnJheScpXG5cbiAgICAgICAgaWYgKCdkYXRhJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgY2hlY2soXG4gICAgICAgICAgICBkYXRhID09PSBudWxsIHx8XG4gICAgICAgICAgICBBcnJheS5pc0FycmF5KGRhdGEpIHx8XG4gICAgICAgICAgICBpc1R5cGVkQXJyYXkoZGF0YSkgfHxcbiAgICAgICAgICAgIGlzTkRBcnJheUxpa2UoZGF0YSksXG4gICAgICAgICAgICAnaW52YWxpZCBkYXRhIGZvciBidWZmZXInKVxuICAgICAgICAgIGRhdGEgPSBvcHRpb25zLmRhdGFcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgndXNhZ2UnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBjaGVjay5wYXJhbWV0ZXIob3B0aW9ucy51c2FnZSwgdXNhZ2VUeXBlcywgJ2ludmFsaWQgYnVmZmVyIHVzYWdlJylcbiAgICAgICAgICB1c2FnZSA9IHVzYWdlVHlwZXNbb3B0aW9ucy51c2FnZV1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgndHlwZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGNoZWNrLnBhcmFtZXRlcihvcHRpb25zLnR5cGUsIGJ1ZmZlclR5cGVzLCAnaW52YWxpZCBidWZmZXIgdHlwZScpXG4gICAgICAgICAgZHR5cGUgPSBidWZmZXJUeXBlc1tvcHRpb25zLnR5cGVdXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ2RpbWVuc2lvbicgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGNoZWNrLnR5cGUob3B0aW9ucy5kaW1lbnNpb24sICdudW1iZXInLCAnaW52YWxpZCBkaW1lbnNpb24nKVxuICAgICAgICAgIGRpbWVuc2lvbiA9IG9wdGlvbnMuZGltZW5zaW9uIHwgMFxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdsZW5ndGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBjaGVjay5ubmkoYnl0ZUxlbmd0aCwgJ2J1ZmZlciBsZW5ndGggbXVzdCBiZSBhIG5vbm5lZ2F0aXZlIGludGVnZXInKVxuICAgICAgICAgIGJ5dGVMZW5ndGggPSBvcHRpb25zLmxlbmd0aCB8IDBcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBidWZmZXIuYmluZCgpXG4gICAgICBpZiAoIWRhdGEpIHtcbiAgICAgICAgZ2wuYnVmZmVyRGF0YShidWZmZXIudHlwZSwgYnl0ZUxlbmd0aCwgdXNhZ2UpXG4gICAgICAgIGJ1ZmZlci5kdHlwZSA9IGR0eXBlIHx8IEdMX1VOU0lHTkVEX0JZVEVcbiAgICAgICAgYnVmZmVyLnVzYWdlID0gdXNhZ2VcbiAgICAgICAgYnVmZmVyLmRpbWVuc2lvbiA9IGRpbWVuc2lvblxuICAgICAgICBidWZmZXIuYnl0ZUxlbmd0aCA9IGJ5dGVMZW5ndGhcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGluaXRCdWZmZXJGcm9tRGF0YShidWZmZXIsIGRhdGEsIHVzYWdlLCBkdHlwZSwgZGltZW5zaW9uLCBwZXJzaXN0ZW50KVxuICAgICAgfVxuXG4gICAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgICAgYnVmZmVyLnN0YXRzLnNpemUgPSBidWZmZXIuYnl0ZUxlbmd0aCAqIERUWVBFU19TSVpFU1tidWZmZXIuZHR5cGVdXG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZWdsQnVmZmVyXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2V0U3ViRGF0YSAoZGF0YSwgb2Zmc2V0KSB7XG4gICAgICBjaGVjayhvZmZzZXQgKyBkYXRhLmJ5dGVMZW5ndGggPD0gYnVmZmVyLmJ5dGVMZW5ndGgsXG4gICAgICAgICdpbnZhbGlkIGJ1ZmZlciBzdWJkYXRhIGNhbGwsIGJ1ZmZlciBpcyB0b28gc21hbGwuICcgKyAnIENhblxcJ3Qgd3JpdGUgZGF0YSBvZiBzaXplICcgKyBkYXRhLmJ5dGVMZW5ndGggKyAnIHN0YXJ0aW5nIGZyb20gb2Zmc2V0ICcgKyBvZmZzZXQgKyAnIHRvIGEgYnVmZmVyIG9mIHNpemUgJyArIGJ1ZmZlci5ieXRlTGVuZ3RoKVxuXG4gICAgICBnbC5idWZmZXJTdWJEYXRhKGJ1ZmZlci50eXBlLCBvZmZzZXQsIGRhdGEpXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc3ViZGF0YSAoZGF0YSwgb2Zmc2V0Xykge1xuICAgICAgdmFyIG9mZnNldCA9IChvZmZzZXRfIHx8IDApIHwgMFxuICAgICAgdmFyIHNoYXBlXG4gICAgICBidWZmZXIuYmluZCgpXG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShkYXRhKSkge1xuICAgICAgICBpZiAoZGF0YS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiBkYXRhWzBdID09PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgdmFyIGNvbnZlcnRlZCA9IHBvb2wuYWxsb2NUeXBlKGJ1ZmZlci5kdHlwZSwgZGF0YS5sZW5ndGgpXG4gICAgICAgICAgICBjb3B5QXJyYXkoY29udmVydGVkLCBkYXRhKVxuICAgICAgICAgICAgc2V0U3ViRGF0YShjb252ZXJ0ZWQsIG9mZnNldClcbiAgICAgICAgICAgIHBvb2wuZnJlZVR5cGUoY29udmVydGVkKVxuICAgICAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShkYXRhWzBdKSB8fCBpc1R5cGVkQXJyYXkoZGF0YVswXSkpIHtcbiAgICAgICAgICAgIHNoYXBlID0gYXJyYXlTaGFwZShkYXRhKVxuICAgICAgICAgICAgdmFyIGZsYXREYXRhID0gYXJyYXlGbGF0dGVuKGRhdGEsIHNoYXBlLCBidWZmZXIuZHR5cGUpXG4gICAgICAgICAgICBzZXRTdWJEYXRhKGZsYXREYXRhLCBvZmZzZXQpXG4gICAgICAgICAgICBwb29sLmZyZWVUeXBlKGZsYXREYXRhKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjaGVjay5yYWlzZSgnaW52YWxpZCBidWZmZXIgZGF0YScpXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGlzVHlwZWRBcnJheShkYXRhKSkge1xuICAgICAgICBzZXRTdWJEYXRhKGRhdGEsIG9mZnNldClcbiAgICAgIH0gZWxzZSBpZiAoaXNOREFycmF5TGlrZShkYXRhKSkge1xuICAgICAgICBzaGFwZSA9IGRhdGEuc2hhcGVcbiAgICAgICAgdmFyIHN0cmlkZSA9IGRhdGEuc3RyaWRlXG5cbiAgICAgICAgdmFyIHNoYXBlWCA9IDBcbiAgICAgICAgdmFyIHNoYXBlWSA9IDBcbiAgICAgICAgdmFyIHN0cmlkZVggPSAwXG4gICAgICAgIHZhciBzdHJpZGVZID0gMFxuICAgICAgICBpZiAoc2hhcGUubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgc2hhcGVYID0gc2hhcGVbMF1cbiAgICAgICAgICBzaGFwZVkgPSAxXG4gICAgICAgICAgc3RyaWRlWCA9IHN0cmlkZVswXVxuICAgICAgICAgIHN0cmlkZVkgPSAwXG4gICAgICAgIH0gZWxzZSBpZiAoc2hhcGUubGVuZ3RoID09PSAyKSB7XG4gICAgICAgICAgc2hhcGVYID0gc2hhcGVbMF1cbiAgICAgICAgICBzaGFwZVkgPSBzaGFwZVsxXVxuICAgICAgICAgIHN0cmlkZVggPSBzdHJpZGVbMF1cbiAgICAgICAgICBzdHJpZGVZID0gc3RyaWRlWzFdXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY2hlY2sucmFpc2UoJ2ludmFsaWQgc2hhcGUnKVxuICAgICAgICB9XG4gICAgICAgIHZhciBkdHlwZSA9IEFycmF5LmlzQXJyYXkoZGF0YS5kYXRhKVxuICAgICAgICAgID8gYnVmZmVyLmR0eXBlXG4gICAgICAgICAgOiB0eXBlZEFycmF5Q29kZShkYXRhLmRhdGEpXG5cbiAgICAgICAgdmFyIHRyYW5zcG9zZURhdGEgPSBwb29sLmFsbG9jVHlwZShkdHlwZSwgc2hhcGVYICogc2hhcGVZKVxuICAgICAgICB0cmFuc3Bvc2UodHJhbnNwb3NlRGF0YSxcbiAgICAgICAgICBkYXRhLmRhdGEsXG4gICAgICAgICAgc2hhcGVYLCBzaGFwZVksXG4gICAgICAgICAgc3RyaWRlWCwgc3RyaWRlWSxcbiAgICAgICAgICBkYXRhLm9mZnNldClcbiAgICAgICAgc2V0U3ViRGF0YSh0cmFuc3Bvc2VEYXRhLCBvZmZzZXQpXG4gICAgICAgIHBvb2wuZnJlZVR5cGUodHJhbnNwb3NlRGF0YSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNoZWNrLnJhaXNlKCdpbnZhbGlkIGRhdGEgZm9yIGJ1ZmZlciBzdWJkYXRhJylcbiAgICAgIH1cbiAgICAgIHJldHVybiByZWdsQnVmZmVyXG4gICAgfVxuXG4gICAgaWYgKCFkZWZlckluaXQpIHtcbiAgICAgIHJlZ2xCdWZmZXIob3B0aW9ucylcbiAgICB9XG5cbiAgICByZWdsQnVmZmVyLl9yZWdsVHlwZSA9ICdidWZmZXInXG4gICAgcmVnbEJ1ZmZlci5fYnVmZmVyID0gYnVmZmVyXG4gICAgcmVnbEJ1ZmZlci5zdWJkYXRhID0gc3ViZGF0YVxuICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgcmVnbEJ1ZmZlci5zdGF0cyA9IGJ1ZmZlci5zdGF0c1xuICAgIH1cbiAgICByZWdsQnVmZmVyLmRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7IGRlc3Ryb3koYnVmZmVyKSB9XG5cbiAgICByZXR1cm4gcmVnbEJ1ZmZlclxuICB9XG5cbiAgZnVuY3Rpb24gcmVzdG9yZUJ1ZmZlcnMgKCkge1xuICAgIHZhbHVlcyhidWZmZXJTZXQpLmZvckVhY2goZnVuY3Rpb24gKGJ1ZmZlcikge1xuICAgICAgYnVmZmVyLmJ1ZmZlciA9IGdsLmNyZWF0ZUJ1ZmZlcigpXG4gICAgICBnbC5iaW5kQnVmZmVyKGJ1ZmZlci50eXBlLCBidWZmZXIuYnVmZmVyKVxuICAgICAgZ2wuYnVmZmVyRGF0YShcbiAgICAgICAgYnVmZmVyLnR5cGUsIGJ1ZmZlci5wZXJzaXN0ZW50RGF0YSB8fCBidWZmZXIuYnl0ZUxlbmd0aCwgYnVmZmVyLnVzYWdlKVxuICAgIH0pXG4gIH1cblxuICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICBzdGF0cy5nZXRUb3RhbEJ1ZmZlclNpemUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgdG90YWwgPSAwXG4gICAgICAvLyBUT0RPOiBSaWdodCBub3csIHRoZSBzdHJlYW1zIGFyZSBub3QgcGFydCBvZiB0aGUgdG90YWwgY291bnQuXG4gICAgICBPYmplY3Qua2V5cyhidWZmZXJTZXQpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgICB0b3RhbCArPSBidWZmZXJTZXRba2V5XS5zdGF0cy5zaXplXG4gICAgICB9KVxuICAgICAgcmV0dXJuIHRvdGFsXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjcmVhdGU6IGNyZWF0ZUJ1ZmZlcixcblxuICAgIGNyZWF0ZVN0cmVhbTogY3JlYXRlU3RyZWFtLFxuICAgIGRlc3Ryb3lTdHJlYW06IGRlc3Ryb3lTdHJlYW0sXG5cbiAgICBjbGVhcjogZnVuY3Rpb24gKCkge1xuICAgICAgdmFsdWVzKGJ1ZmZlclNldCkuZm9yRWFjaChkZXN0cm95KVxuICAgICAgc3RyZWFtUG9vbC5mb3JFYWNoKGRlc3Ryb3kpXG4gICAgfSxcblxuICAgIGdldEJ1ZmZlcjogZnVuY3Rpb24gKHdyYXBwZXIpIHtcbiAgICAgIGlmICh3cmFwcGVyICYmIHdyYXBwZXIuX2J1ZmZlciBpbnN0YW5jZW9mIFJFR0xCdWZmZXIpIHtcbiAgICAgICAgcmV0dXJuIHdyYXBwZXIuX2J1ZmZlclxuICAgICAgfVxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9LFxuXG4gICAgcmVzdG9yZTogcmVzdG9yZUJ1ZmZlcnMsXG5cbiAgICBfaW5pdEJ1ZmZlcjogaW5pdEJ1ZmZlckZyb21EYXRhXG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgXCJbb2JqZWN0IEludDhBcnJheV1cIjogNTEyMFxuLCBcIltvYmplY3QgSW50MTZBcnJheV1cIjogNTEyMlxuLCBcIltvYmplY3QgSW50MzJBcnJheV1cIjogNTEyNFxuLCBcIltvYmplY3QgVWludDhBcnJheV1cIjogNTEyMVxuLCBcIltvYmplY3QgVWludDhDbGFtcGVkQXJyYXldXCI6IDUxMjFcbiwgXCJbb2JqZWN0IFVpbnQxNkFycmF5XVwiOiA1MTIzXG4sIFwiW29iamVjdCBVaW50MzJBcnJheV1cIjogNTEyNVxuLCBcIltvYmplY3QgRmxvYXQzMkFycmF5XVwiOiA1MTI2XG4sIFwiW29iamVjdCBGbG9hdDY0QXJyYXldXCI6IDUxMjFcbiwgXCJbb2JqZWN0IEFycmF5QnVmZmVyXVwiOiA1MTIxXG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gIFwiaW50OFwiOiA1MTIwXG4sIFwiaW50MTZcIjogNTEyMlxuLCBcImludDMyXCI6IDUxMjRcbiwgXCJ1aW50OFwiOiA1MTIxXG4sIFwidWludDE2XCI6IDUxMjNcbiwgXCJ1aW50MzJcIjogNTEyNVxuLCBcImZsb2F0XCI6IDUxMjZcbiwgXCJmbG9hdDMyXCI6IDUxMjZcbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgXCJwb2ludHNcIjogMCxcbiAgXCJwb2ludFwiOiAwLFxuICBcImxpbmVzXCI6IDEsXG4gIFwibGluZVwiOiAxLFxuICBcImxpbmUgbG9vcFwiOiAyLFxuICBcImxpbmUgc3RyaXBcIjogMyxcbiAgXCJ0cmlhbmdsZXNcIjogNCxcbiAgXCJ0cmlhbmdsZVwiOiA0LFxuICBcInRyaWFuZ2xlIHN0cmlwXCI6IDUsXG4gIFwidHJpYW5nbGUgZmFuXCI6IDZcbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgXCJzdGF0aWNcIjogMzUwNDQsXG4gIFwiZHluYW1pY1wiOiAzNTA0OCxcbiAgXCJzdHJlYW1cIjogMzUwNDBcbn1cbiIsInZhciBjaGVjayA9IHJlcXVpcmUoJy4vdXRpbC9jaGVjaycpXG52YXIgY3JlYXRlRW52aXJvbm1lbnQgPSByZXF1aXJlKCcuL3V0aWwvY29kZWdlbicpXG52YXIgbG9vcCA9IHJlcXVpcmUoJy4vdXRpbC9sb29wJylcbnZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL3V0aWwvaXMtdHlwZWQtYXJyYXknKVxudmFyIGlzTkRBcnJheSA9IHJlcXVpcmUoJy4vdXRpbC9pcy1uZGFycmF5JylcbnZhciBpc0FycmF5TGlrZSA9IHJlcXVpcmUoJy4vdXRpbC9pcy1hcnJheS1saWtlJylcbnZhciBkeW5hbWljID0gcmVxdWlyZSgnLi9keW5hbWljJylcblxudmFyIHByaW1UeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL3ByaW1pdGl2ZXMuanNvbicpXG52YXIgZ2xUeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL2R0eXBlcy5qc29uJylcblxuLy8gXCJjdXRlXCIgbmFtZXMgZm9yIHZlY3RvciBjb21wb25lbnRzXG52YXIgQ1VURV9DT01QT05FTlRTID0gJ3h5encnLnNwbGl0KCcnKVxuXG52YXIgR0xfVU5TSUdORURfQllURSA9IDUxMjFcblxudmFyIEFUVFJJQl9TVEFURV9QT0lOVEVSID0gMVxudmFyIEFUVFJJQl9TVEFURV9DT05TVEFOVCA9IDJcblxudmFyIERZTl9GVU5DID0gMFxudmFyIERZTl9QUk9QID0gMVxudmFyIERZTl9DT05URVhUID0gMlxudmFyIERZTl9TVEFURSA9IDNcbnZhciBEWU5fVEhVTksgPSA0XG5cbnZhciBTX0RJVEhFUiA9ICdkaXRoZXInXG52YXIgU19CTEVORF9FTkFCTEUgPSAnYmxlbmQuZW5hYmxlJ1xudmFyIFNfQkxFTkRfQ09MT1IgPSAnYmxlbmQuY29sb3InXG52YXIgU19CTEVORF9FUVVBVElPTiA9ICdibGVuZC5lcXVhdGlvbidcbnZhciBTX0JMRU5EX0ZVTkMgPSAnYmxlbmQuZnVuYydcbnZhciBTX0RFUFRIX0VOQUJMRSA9ICdkZXB0aC5lbmFibGUnXG52YXIgU19ERVBUSF9GVU5DID0gJ2RlcHRoLmZ1bmMnXG52YXIgU19ERVBUSF9SQU5HRSA9ICdkZXB0aC5yYW5nZSdcbnZhciBTX0RFUFRIX01BU0sgPSAnZGVwdGgubWFzaydcbnZhciBTX0NPTE9SX01BU0sgPSAnY29sb3JNYXNrJ1xudmFyIFNfQ1VMTF9FTkFCTEUgPSAnY3VsbC5lbmFibGUnXG52YXIgU19DVUxMX0ZBQ0UgPSAnY3VsbC5mYWNlJ1xudmFyIFNfRlJPTlRfRkFDRSA9ICdmcm9udEZhY2UnXG52YXIgU19MSU5FX1dJRFRIID0gJ2xpbmVXaWR0aCdcbnZhciBTX1BPTFlHT05fT0ZGU0VUX0VOQUJMRSA9ICdwb2x5Z29uT2Zmc2V0LmVuYWJsZSdcbnZhciBTX1BPTFlHT05fT0ZGU0VUX09GRlNFVCA9ICdwb2x5Z29uT2Zmc2V0Lm9mZnNldCdcbnZhciBTX1NBTVBMRV9BTFBIQSA9ICdzYW1wbGUuYWxwaGEnXG52YXIgU19TQU1QTEVfRU5BQkxFID0gJ3NhbXBsZS5lbmFibGUnXG52YXIgU19TQU1QTEVfQ09WRVJBR0UgPSAnc2FtcGxlLmNvdmVyYWdlJ1xudmFyIFNfU1RFTkNJTF9FTkFCTEUgPSAnc3RlbmNpbC5lbmFibGUnXG52YXIgU19TVEVOQ0lMX01BU0sgPSAnc3RlbmNpbC5tYXNrJ1xudmFyIFNfU1RFTkNJTF9GVU5DID0gJ3N0ZW5jaWwuZnVuYydcbnZhciBTX1NURU5DSUxfT1BGUk9OVCA9ICdzdGVuY2lsLm9wRnJvbnQnXG52YXIgU19TVEVOQ0lMX09QQkFDSyA9ICdzdGVuY2lsLm9wQmFjaydcbnZhciBTX1NDSVNTT1JfRU5BQkxFID0gJ3NjaXNzb3IuZW5hYmxlJ1xudmFyIFNfU0NJU1NPUl9CT1ggPSAnc2Npc3Nvci5ib3gnXG52YXIgU19WSUVXUE9SVCA9ICd2aWV3cG9ydCdcblxudmFyIFNfUFJPRklMRSA9ICdwcm9maWxlJ1xuXG52YXIgU19GUkFNRUJVRkZFUiA9ICdmcmFtZWJ1ZmZlcidcbnZhciBTX1ZFUlQgPSAndmVydCdcbnZhciBTX0ZSQUcgPSAnZnJhZydcbnZhciBTX0VMRU1FTlRTID0gJ2VsZW1lbnRzJ1xudmFyIFNfUFJJTUlUSVZFID0gJ3ByaW1pdGl2ZSdcbnZhciBTX0NPVU5UID0gJ2NvdW50J1xudmFyIFNfT0ZGU0VUID0gJ29mZnNldCdcbnZhciBTX0lOU1RBTkNFUyA9ICdpbnN0YW5jZXMnXG5cbnZhciBTVUZGSVhfV0lEVEggPSAnV2lkdGgnXG52YXIgU1VGRklYX0hFSUdIVCA9ICdIZWlnaHQnXG5cbnZhciBTX0ZSQU1FQlVGRkVSX1dJRFRIID0gU19GUkFNRUJVRkZFUiArIFNVRkZJWF9XSURUSFxudmFyIFNfRlJBTUVCVUZGRVJfSEVJR0hUID0gU19GUkFNRUJVRkZFUiArIFNVRkZJWF9IRUlHSFRcbnZhciBTX1ZJRVdQT1JUX1dJRFRIID0gU19WSUVXUE9SVCArIFNVRkZJWF9XSURUSFxudmFyIFNfVklFV1BPUlRfSEVJR0hUID0gU19WSUVXUE9SVCArIFNVRkZJWF9IRUlHSFRcbnZhciBTX0RSQVdJTkdCVUZGRVIgPSAnZHJhd2luZ0J1ZmZlcidcbnZhciBTX0RSQVdJTkdCVUZGRVJfV0lEVEggPSBTX0RSQVdJTkdCVUZGRVIgKyBTVUZGSVhfV0lEVEhcbnZhciBTX0RSQVdJTkdCVUZGRVJfSEVJR0hUID0gU19EUkFXSU5HQlVGRkVSICsgU1VGRklYX0hFSUdIVFxuXG52YXIgTkVTVEVEX09QVElPTlMgPSBbXG4gIFNfQkxFTkRfRlVOQyxcbiAgU19CTEVORF9FUVVBVElPTixcbiAgU19TVEVOQ0lMX0ZVTkMsXG4gIFNfU1RFTkNJTF9PUEZST05ULFxuICBTX1NURU5DSUxfT1BCQUNLLFxuICBTX1NBTVBMRV9DT1ZFUkFHRSxcbiAgU19WSUVXUE9SVCxcbiAgU19TQ0lTU09SX0JPWCxcbiAgU19QT0xZR09OX09GRlNFVF9PRkZTRVRcbl1cblxudmFyIEdMX0FSUkFZX0JVRkZFUiA9IDM0OTYyXG52YXIgR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIgPSAzNDk2M1xuXG52YXIgR0xfRlJBR01FTlRfU0hBREVSID0gMzU2MzJcbnZhciBHTF9WRVJURVhfU0hBREVSID0gMzU2MzNcblxudmFyIEdMX1RFWFRVUkVfMkQgPSAweDBERTFcbnZhciBHTF9URVhUVVJFX0NVQkVfTUFQID0gMHg4NTEzXG5cbnZhciBHTF9DVUxMX0ZBQ0UgPSAweDBCNDRcbnZhciBHTF9CTEVORCA9IDB4MEJFMlxudmFyIEdMX0RJVEhFUiA9IDB4MEJEMFxudmFyIEdMX1NURU5DSUxfVEVTVCA9IDB4MEI5MFxudmFyIEdMX0RFUFRIX1RFU1QgPSAweDBCNzFcbnZhciBHTF9TQ0lTU09SX1RFU1QgPSAweDBDMTFcbnZhciBHTF9QT0xZR09OX09GRlNFVF9GSUxMID0gMHg4MDM3XG52YXIgR0xfU0FNUExFX0FMUEhBX1RPX0NPVkVSQUdFID0gMHg4MDlFXG52YXIgR0xfU0FNUExFX0NPVkVSQUdFID0gMHg4MEEwXG5cbnZhciBHTF9GTE9BVCA9IDUxMjZcbnZhciBHTF9GTE9BVF9WRUMyID0gMzU2NjRcbnZhciBHTF9GTE9BVF9WRUMzID0gMzU2NjVcbnZhciBHTF9GTE9BVF9WRUM0ID0gMzU2NjZcbnZhciBHTF9JTlQgPSA1MTI0XG52YXIgR0xfSU5UX1ZFQzIgPSAzNTY2N1xudmFyIEdMX0lOVF9WRUMzID0gMzU2NjhcbnZhciBHTF9JTlRfVkVDNCA9IDM1NjY5XG52YXIgR0xfQk9PTCA9IDM1NjcwXG52YXIgR0xfQk9PTF9WRUMyID0gMzU2NzFcbnZhciBHTF9CT09MX1ZFQzMgPSAzNTY3MlxudmFyIEdMX0JPT0xfVkVDNCA9IDM1NjczXG52YXIgR0xfRkxPQVRfTUFUMiA9IDM1Njc0XG52YXIgR0xfRkxPQVRfTUFUMyA9IDM1Njc1XG52YXIgR0xfRkxPQVRfTUFUNCA9IDM1Njc2XG52YXIgR0xfU0FNUExFUl8yRCA9IDM1Njc4XG52YXIgR0xfU0FNUExFUl9DVUJFID0gMzU2ODBcblxudmFyIEdMX1RSSUFOR0xFUyA9IDRcblxudmFyIEdMX0ZST05UID0gMTAyOFxudmFyIEdMX0JBQ0sgPSAxMDI5XG52YXIgR0xfQ1cgPSAweDA5MDBcbnZhciBHTF9DQ1cgPSAweDA5MDFcbnZhciBHTF9NSU5fRVhUID0gMHg4MDA3XG52YXIgR0xfTUFYX0VYVCA9IDB4ODAwOFxudmFyIEdMX0FMV0FZUyA9IDUxOVxudmFyIEdMX0tFRVAgPSA3NjgwXG52YXIgR0xfWkVSTyA9IDBcbnZhciBHTF9PTkUgPSAxXG52YXIgR0xfRlVOQ19BREQgPSAweDgwMDZcbnZhciBHTF9MRVNTID0gNTEzXG5cbnZhciBHTF9GUkFNRUJVRkZFUiA9IDB4OEQ0MFxudmFyIEdMX0NPTE9SX0FUVEFDSE1FTlQwID0gMHg4Q0UwXG5cbnZhciBibGVuZEZ1bmNzID0ge1xuICAnMCc6IDAsXG4gICcxJzogMSxcbiAgJ3plcm8nOiAwLFxuICAnb25lJzogMSxcbiAgJ3NyYyBjb2xvcic6IDc2OCxcbiAgJ29uZSBtaW51cyBzcmMgY29sb3InOiA3NjksXG4gICdzcmMgYWxwaGEnOiA3NzAsXG4gICdvbmUgbWludXMgc3JjIGFscGhhJzogNzcxLFxuICAnZHN0IGNvbG9yJzogNzc0LFxuICAnb25lIG1pbnVzIGRzdCBjb2xvcic6IDc3NSxcbiAgJ2RzdCBhbHBoYSc6IDc3MixcbiAgJ29uZSBtaW51cyBkc3QgYWxwaGEnOiA3NzMsXG4gICdjb25zdGFudCBjb2xvcic6IDMyNzY5LFxuICAnb25lIG1pbnVzIGNvbnN0YW50IGNvbG9yJzogMzI3NzAsXG4gICdjb25zdGFudCBhbHBoYSc6IDMyNzcxLFxuICAnb25lIG1pbnVzIGNvbnN0YW50IGFscGhhJzogMzI3NzIsXG4gICdzcmMgYWxwaGEgc2F0dXJhdGUnOiA3NzZcbn1cblxuLy8gVGhlcmUgYXJlIGludmFsaWQgdmFsdWVzIGZvciBzcmNSR0IgYW5kIGRzdFJHQi4gU2VlOlxuLy8gaHR0cHM6Ly93d3cua2hyb25vcy5vcmcvcmVnaXN0cnkvd2ViZ2wvc3BlY3MvMS4wLyM2LjEzXG4vLyBodHRwczovL2dpdGh1Yi5jb20vS2hyb25vc0dyb3VwL1dlYkdML2Jsb2IvMGQzMjAxZjVmN2VjM2MwMDYwYmMxZjA0MDc3NDYxNTQxZjE5ODdiOS9jb25mb3JtYW5jZS1zdWl0ZXMvMS4wLjMvY29uZm9ybWFuY2UvbWlzYy93ZWJnbC1zcGVjaWZpYy5odG1sI0w1NlxudmFyIGludmFsaWRCbGVuZENvbWJpbmF0aW9ucyA9IFtcbiAgJ2NvbnN0YW50IGNvbG9yLCBjb25zdGFudCBhbHBoYScsXG4gICdvbmUgbWludXMgY29uc3RhbnQgY29sb3IsIGNvbnN0YW50IGFscGhhJyxcbiAgJ2NvbnN0YW50IGNvbG9yLCBvbmUgbWludXMgY29uc3RhbnQgYWxwaGEnLFxuICAnb25lIG1pbnVzIGNvbnN0YW50IGNvbG9yLCBvbmUgbWludXMgY29uc3RhbnQgYWxwaGEnLFxuICAnY29uc3RhbnQgYWxwaGEsIGNvbnN0YW50IGNvbG9yJyxcbiAgJ2NvbnN0YW50IGFscGhhLCBvbmUgbWludXMgY29uc3RhbnQgY29sb3InLFxuICAnb25lIG1pbnVzIGNvbnN0YW50IGFscGhhLCBjb25zdGFudCBjb2xvcicsXG4gICdvbmUgbWludXMgY29uc3RhbnQgYWxwaGEsIG9uZSBtaW51cyBjb25zdGFudCBjb2xvcidcbl1cblxudmFyIGNvbXBhcmVGdW5jcyA9IHtcbiAgJ25ldmVyJzogNTEyLFxuICAnbGVzcyc6IDUxMyxcbiAgJzwnOiA1MTMsXG4gICdlcXVhbCc6IDUxNCxcbiAgJz0nOiA1MTQsXG4gICc9PSc6IDUxNCxcbiAgJz09PSc6IDUxNCxcbiAgJ2xlcXVhbCc6IDUxNSxcbiAgJzw9JzogNTE1LFxuICAnZ3JlYXRlcic6IDUxNixcbiAgJz4nOiA1MTYsXG4gICdub3RlcXVhbCc6IDUxNyxcbiAgJyE9JzogNTE3LFxuICAnIT09JzogNTE3LFxuICAnZ2VxdWFsJzogNTE4LFxuICAnPj0nOiA1MTgsXG4gICdhbHdheXMnOiA1MTlcbn1cblxudmFyIHN0ZW5jaWxPcHMgPSB7XG4gICcwJzogMCxcbiAgJ3plcm8nOiAwLFxuICAna2VlcCc6IDc2ODAsXG4gICdyZXBsYWNlJzogNzY4MSxcbiAgJ2luY3JlbWVudCc6IDc2ODIsXG4gICdkZWNyZW1lbnQnOiA3NjgzLFxuICAnaW5jcmVtZW50IHdyYXAnOiAzNDA1NSxcbiAgJ2RlY3JlbWVudCB3cmFwJzogMzQwNTYsXG4gICdpbnZlcnQnOiA1Mzg2XG59XG5cbnZhciBzaGFkZXJUeXBlID0ge1xuICAnZnJhZyc6IEdMX0ZSQUdNRU5UX1NIQURFUixcbiAgJ3ZlcnQnOiBHTF9WRVJURVhfU0hBREVSXG59XG5cbnZhciBvcmllbnRhdGlvblR5cGUgPSB7XG4gICdjdyc6IEdMX0NXLFxuICAnY2N3JzogR0xfQ0NXXG59XG5cbmZ1bmN0aW9uIGlzQnVmZmVyQXJncyAoeCkge1xuICByZXR1cm4gQXJyYXkuaXNBcnJheSh4KSB8fFxuICAgIGlzVHlwZWRBcnJheSh4KSB8fFxuICAgIGlzTkRBcnJheSh4KVxufVxuXG4vLyBNYWtlIHN1cmUgdmlld3BvcnQgaXMgcHJvY2Vzc2VkIGZpcnN0XG5mdW5jdGlvbiBzb3J0U3RhdGUgKHN0YXRlKSB7XG4gIHJldHVybiBzdGF0ZS5zb3J0KGZ1bmN0aW9uIChhLCBiKSB7XG4gICAgaWYgKGEgPT09IFNfVklFV1BPUlQpIHtcbiAgICAgIHJldHVybiAtMVxuICAgIH0gZWxzZSBpZiAoYiA9PT0gU19WSUVXUE9SVCkge1xuICAgICAgcmV0dXJuIDFcbiAgICB9XG4gICAgcmV0dXJuIChhIDwgYikgPyAtMSA6IDFcbiAgfSlcbn1cblxuZnVuY3Rpb24gRGVjbGFyYXRpb24gKHRoaXNEZXAsIGNvbnRleHREZXAsIHByb3BEZXAsIGFwcGVuZCkge1xuICB0aGlzLnRoaXNEZXAgPSB0aGlzRGVwXG4gIHRoaXMuY29udGV4dERlcCA9IGNvbnRleHREZXBcbiAgdGhpcy5wcm9wRGVwID0gcHJvcERlcFxuICB0aGlzLmFwcGVuZCA9IGFwcGVuZFxufVxuXG5mdW5jdGlvbiBpc1N0YXRpYyAoZGVjbCkge1xuICByZXR1cm4gZGVjbCAmJiAhKGRlY2wudGhpc0RlcCB8fCBkZWNsLmNvbnRleHREZXAgfHwgZGVjbC5wcm9wRGVwKVxufVxuXG5mdW5jdGlvbiBjcmVhdGVTdGF0aWNEZWNsIChhcHBlbmQpIHtcbiAgcmV0dXJuIG5ldyBEZWNsYXJhdGlvbihmYWxzZSwgZmFsc2UsIGZhbHNlLCBhcHBlbmQpXG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUR5bmFtaWNEZWNsIChkeW4sIGFwcGVuZCkge1xuICB2YXIgdHlwZSA9IGR5bi50eXBlXG4gIGlmICh0eXBlID09PSBEWU5fRlVOQykge1xuICAgIHZhciBudW1BcmdzID0gZHluLmRhdGEubGVuZ3RoXG4gICAgcmV0dXJuIG5ldyBEZWNsYXJhdGlvbihcbiAgICAgIHRydWUsXG4gICAgICBudW1BcmdzID49IDEsXG4gICAgICBudW1BcmdzID49IDIsXG4gICAgICBhcHBlbmQpXG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gRFlOX1RIVU5LKSB7XG4gICAgdmFyIGRhdGEgPSBkeW4uZGF0YVxuICAgIHJldHVybiBuZXcgRGVjbGFyYXRpb24oXG4gICAgICBkYXRhLnRoaXNEZXAsXG4gICAgICBkYXRhLmNvbnRleHREZXAsXG4gICAgICBkYXRhLnByb3BEZXAsXG4gICAgICBhcHBlbmQpXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIG5ldyBEZWNsYXJhdGlvbihcbiAgICAgIHR5cGUgPT09IERZTl9TVEFURSxcbiAgICAgIHR5cGUgPT09IERZTl9DT05URVhULFxuICAgICAgdHlwZSA9PT0gRFlOX1BST1AsXG4gICAgICBhcHBlbmQpXG4gIH1cbn1cblxudmFyIFNDT1BFX0RFQ0wgPSBuZXcgRGVjbGFyYXRpb24oZmFsc2UsIGZhbHNlLCBmYWxzZSwgZnVuY3Rpb24gKCkge30pXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcmVnbENvcmUgKFxuICBnbCxcbiAgc3RyaW5nU3RvcmUsXG4gIGV4dGVuc2lvbnMsXG4gIGxpbWl0cyxcbiAgYnVmZmVyU3RhdGUsXG4gIGVsZW1lbnRTdGF0ZSxcbiAgdGV4dHVyZVN0YXRlLFxuICBmcmFtZWJ1ZmZlclN0YXRlLFxuICB1bmlmb3JtU3RhdGUsXG4gIGF0dHJpYnV0ZVN0YXRlLFxuICBzaGFkZXJTdGF0ZSxcbiAgZHJhd1N0YXRlLFxuICBjb250ZXh0U3RhdGUsXG4gIHRpbWVyLFxuICBjb25maWcpIHtcbiAgdmFyIEF0dHJpYnV0ZVJlY29yZCA9IGF0dHJpYnV0ZVN0YXRlLlJlY29yZFxuXG4gIHZhciBibGVuZEVxdWF0aW9ucyA9IHtcbiAgICAnYWRkJzogMzI3NzQsXG4gICAgJ3N1YnRyYWN0JzogMzI3NzgsXG4gICAgJ3JldmVyc2Ugc3VidHJhY3QnOiAzMjc3OVxuICB9XG4gIGlmIChleHRlbnNpb25zLmV4dF9ibGVuZF9taW5tYXgpIHtcbiAgICBibGVuZEVxdWF0aW9ucy5taW4gPSBHTF9NSU5fRVhUXG4gICAgYmxlbmRFcXVhdGlvbnMubWF4ID0gR0xfTUFYX0VYVFxuICB9XG5cbiAgdmFyIGV4dEluc3RhbmNpbmcgPSBleHRlbnNpb25zLmFuZ2xlX2luc3RhbmNlZF9hcnJheXNcbiAgdmFyIGV4dERyYXdCdWZmZXJzID0gZXh0ZW5zaW9ucy53ZWJnbF9kcmF3X2J1ZmZlcnNcblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIFdFQkdMIFNUQVRFXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgdmFyIGN1cnJlbnRTdGF0ZSA9IHtcbiAgICBkaXJ0eTogdHJ1ZSxcbiAgICBwcm9maWxlOiBjb25maWcucHJvZmlsZVxuICB9XG4gIHZhciBuZXh0U3RhdGUgPSB7fVxuICB2YXIgR0xfU1RBVEVfTkFNRVMgPSBbXVxuICB2YXIgR0xfRkxBR1MgPSB7fVxuICB2YXIgR0xfVkFSSUFCTEVTID0ge31cblxuICBmdW5jdGlvbiBwcm9wTmFtZSAobmFtZSkge1xuICAgIHJldHVybiBuYW1lLnJlcGxhY2UoJy4nLCAnXycpXG4gIH1cblxuICBmdW5jdGlvbiBzdGF0ZUZsYWcgKHNuYW1lLCBjYXAsIGluaXQpIHtcbiAgICB2YXIgbmFtZSA9IHByb3BOYW1lKHNuYW1lKVxuICAgIEdMX1NUQVRFX05BTUVTLnB1c2goc25hbWUpXG4gICAgbmV4dFN0YXRlW25hbWVdID0gY3VycmVudFN0YXRlW25hbWVdID0gISFpbml0XG4gICAgR0xfRkxBR1NbbmFtZV0gPSBjYXBcbiAgfVxuXG4gIGZ1bmN0aW9uIHN0YXRlVmFyaWFibGUgKHNuYW1lLCBmdW5jLCBpbml0KSB7XG4gICAgdmFyIG5hbWUgPSBwcm9wTmFtZShzbmFtZSlcbiAgICBHTF9TVEFURV9OQU1FUy5wdXNoKHNuYW1lKVxuICAgIGlmIChBcnJheS5pc0FycmF5KGluaXQpKSB7XG4gICAgICBjdXJyZW50U3RhdGVbbmFtZV0gPSBpbml0LnNsaWNlKClcbiAgICAgIG5leHRTdGF0ZVtuYW1lXSA9IGluaXQuc2xpY2UoKVxuICAgIH0gZWxzZSB7XG4gICAgICBjdXJyZW50U3RhdGVbbmFtZV0gPSBuZXh0U3RhdGVbbmFtZV0gPSBpbml0XG4gICAgfVxuICAgIEdMX1ZBUklBQkxFU1tuYW1lXSA9IGZ1bmNcbiAgfVxuXG4gIC8vIERpdGhlcmluZ1xuICBzdGF0ZUZsYWcoU19ESVRIRVIsIEdMX0RJVEhFUilcblxuICAvLyBCbGVuZGluZ1xuICBzdGF0ZUZsYWcoU19CTEVORF9FTkFCTEUsIEdMX0JMRU5EKVxuICBzdGF0ZVZhcmlhYmxlKFNfQkxFTkRfQ09MT1IsICdibGVuZENvbG9yJywgWzAsIDAsIDAsIDBdKVxuICBzdGF0ZVZhcmlhYmxlKFNfQkxFTkRfRVFVQVRJT04sICdibGVuZEVxdWF0aW9uU2VwYXJhdGUnLFxuICAgIFtHTF9GVU5DX0FERCwgR0xfRlVOQ19BRERdKVxuICBzdGF0ZVZhcmlhYmxlKFNfQkxFTkRfRlVOQywgJ2JsZW5kRnVuY1NlcGFyYXRlJyxcbiAgICBbR0xfT05FLCBHTF9aRVJPLCBHTF9PTkUsIEdMX1pFUk9dKVxuXG4gIC8vIERlcHRoXG4gIHN0YXRlRmxhZyhTX0RFUFRIX0VOQUJMRSwgR0xfREVQVEhfVEVTVCwgdHJ1ZSlcbiAgc3RhdGVWYXJpYWJsZShTX0RFUFRIX0ZVTkMsICdkZXB0aEZ1bmMnLCBHTF9MRVNTKVxuICBzdGF0ZVZhcmlhYmxlKFNfREVQVEhfUkFOR0UsICdkZXB0aFJhbmdlJywgWzAsIDFdKVxuICBzdGF0ZVZhcmlhYmxlKFNfREVQVEhfTUFTSywgJ2RlcHRoTWFzaycsIHRydWUpXG5cbiAgLy8gQ29sb3IgbWFza1xuICBzdGF0ZVZhcmlhYmxlKFNfQ09MT1JfTUFTSywgU19DT0xPUl9NQVNLLCBbdHJ1ZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZV0pXG5cbiAgLy8gRmFjZSBjdWxsaW5nXG4gIHN0YXRlRmxhZyhTX0NVTExfRU5BQkxFLCBHTF9DVUxMX0ZBQ0UpXG4gIHN0YXRlVmFyaWFibGUoU19DVUxMX0ZBQ0UsICdjdWxsRmFjZScsIEdMX0JBQ0spXG5cbiAgLy8gRnJvbnQgZmFjZSBvcmllbnRhdGlvblxuICBzdGF0ZVZhcmlhYmxlKFNfRlJPTlRfRkFDRSwgU19GUk9OVF9GQUNFLCBHTF9DQ1cpXG5cbiAgLy8gTGluZSB3aWR0aFxuICBzdGF0ZVZhcmlhYmxlKFNfTElORV9XSURUSCwgU19MSU5FX1dJRFRILCAxKVxuXG4gIC8vIFBvbHlnb24gb2Zmc2V0XG4gIHN0YXRlRmxhZyhTX1BPTFlHT05fT0ZGU0VUX0VOQUJMRSwgR0xfUE9MWUdPTl9PRkZTRVRfRklMTClcbiAgc3RhdGVWYXJpYWJsZShTX1BPTFlHT05fT0ZGU0VUX09GRlNFVCwgJ3BvbHlnb25PZmZzZXQnLCBbMCwgMF0pXG5cbiAgLy8gU2FtcGxlIGNvdmVyYWdlXG4gIHN0YXRlRmxhZyhTX1NBTVBMRV9BTFBIQSwgR0xfU0FNUExFX0FMUEhBX1RPX0NPVkVSQUdFKVxuICBzdGF0ZUZsYWcoU19TQU1QTEVfRU5BQkxFLCBHTF9TQU1QTEVfQ09WRVJBR0UpXG4gIHN0YXRlVmFyaWFibGUoU19TQU1QTEVfQ09WRVJBR0UsICdzYW1wbGVDb3ZlcmFnZScsIFsxLCBmYWxzZV0pXG5cbiAgLy8gU3RlbmNpbFxuICBzdGF0ZUZsYWcoU19TVEVOQ0lMX0VOQUJMRSwgR0xfU1RFTkNJTF9URVNUKVxuICBzdGF0ZVZhcmlhYmxlKFNfU1RFTkNJTF9NQVNLLCAnc3RlbmNpbE1hc2snLCAtMSlcbiAgc3RhdGVWYXJpYWJsZShTX1NURU5DSUxfRlVOQywgJ3N0ZW5jaWxGdW5jJywgW0dMX0FMV0FZUywgMCwgLTFdKVxuICBzdGF0ZVZhcmlhYmxlKFNfU1RFTkNJTF9PUEZST05ULCAnc3RlbmNpbE9wU2VwYXJhdGUnLFxuICAgIFtHTF9GUk9OVCwgR0xfS0VFUCwgR0xfS0VFUCwgR0xfS0VFUF0pXG4gIHN0YXRlVmFyaWFibGUoU19TVEVOQ0lMX09QQkFDSywgJ3N0ZW5jaWxPcFNlcGFyYXRlJyxcbiAgICBbR0xfQkFDSywgR0xfS0VFUCwgR0xfS0VFUCwgR0xfS0VFUF0pXG5cbiAgLy8gU2Npc3NvclxuICBzdGF0ZUZsYWcoU19TQ0lTU09SX0VOQUJMRSwgR0xfU0NJU1NPUl9URVNUKVxuICBzdGF0ZVZhcmlhYmxlKFNfU0NJU1NPUl9CT1gsICdzY2lzc29yJyxcbiAgICBbMCwgMCwgZ2wuZHJhd2luZ0J1ZmZlcldpZHRoLCBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0XSlcblxuICAvLyBWaWV3cG9ydFxuICBzdGF0ZVZhcmlhYmxlKFNfVklFV1BPUlQsIFNfVklFV1BPUlQsXG4gICAgWzAsIDAsIGdsLmRyYXdpbmdCdWZmZXJXaWR0aCwgZ2wuZHJhd2luZ0J1ZmZlckhlaWdodF0pXG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBFTlZJUk9OTUVOVFxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIHZhciBzaGFyZWRTdGF0ZSA9IHtcbiAgICBnbDogZ2wsXG4gICAgY29udGV4dDogY29udGV4dFN0YXRlLFxuICAgIHN0cmluZ3M6IHN0cmluZ1N0b3JlLFxuICAgIG5leHQ6IG5leHRTdGF0ZSxcbiAgICBjdXJyZW50OiBjdXJyZW50U3RhdGUsXG4gICAgZHJhdzogZHJhd1N0YXRlLFxuICAgIGVsZW1lbnRzOiBlbGVtZW50U3RhdGUsXG4gICAgYnVmZmVyOiBidWZmZXJTdGF0ZSxcbiAgICBzaGFkZXI6IHNoYWRlclN0YXRlLFxuICAgIGF0dHJpYnV0ZXM6IGF0dHJpYnV0ZVN0YXRlLnN0YXRlLFxuICAgIHVuaWZvcm1zOiB1bmlmb3JtU3RhdGUsXG4gICAgZnJhbWVidWZmZXI6IGZyYW1lYnVmZmVyU3RhdGUsXG4gICAgZXh0ZW5zaW9uczogZXh0ZW5zaW9ucyxcblxuICAgIHRpbWVyOiB0aW1lcixcbiAgICBpc0J1ZmZlckFyZ3M6IGlzQnVmZmVyQXJnc1xuICB9XG5cbiAgdmFyIHNoYXJlZENvbnN0YW50cyA9IHtcbiAgICBwcmltVHlwZXM6IHByaW1UeXBlcyxcbiAgICBjb21wYXJlRnVuY3M6IGNvbXBhcmVGdW5jcyxcbiAgICBibGVuZEZ1bmNzOiBibGVuZEZ1bmNzLFxuICAgIGJsZW5kRXF1YXRpb25zOiBibGVuZEVxdWF0aW9ucyxcbiAgICBzdGVuY2lsT3BzOiBzdGVuY2lsT3BzLFxuICAgIGdsVHlwZXM6IGdsVHlwZXMsXG4gICAgb3JpZW50YXRpb25UeXBlOiBvcmllbnRhdGlvblR5cGVcbiAgfVxuXG4gIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICBzaGFyZWRTdGF0ZS5pc0FycmF5TGlrZSA9IGlzQXJyYXlMaWtlXG4gIH0pXG5cbiAgaWYgKGV4dERyYXdCdWZmZXJzKSB7XG4gICAgc2hhcmVkQ29uc3RhbnRzLmJhY2tCdWZmZXIgPSBbR0xfQkFDS11cbiAgICBzaGFyZWRDb25zdGFudHMuZHJhd0J1ZmZlciA9IGxvb3AobGltaXRzLm1heERyYXdidWZmZXJzLCBmdW5jdGlvbiAoaSkge1xuICAgICAgaWYgKGkgPT09IDApIHtcbiAgICAgICAgcmV0dXJuIFswXVxuICAgICAgfVxuICAgICAgcmV0dXJuIGxvb3AoaSwgZnVuY3Rpb24gKGopIHtcbiAgICAgICAgcmV0dXJuIEdMX0NPTE9SX0FUVEFDSE1FTlQwICsgalxuICAgICAgfSlcbiAgICB9KVxuICB9XG5cbiAgdmFyIGRyYXdDYWxsQ291bnRlciA9IDBcbiAgZnVuY3Rpb24gY3JlYXRlUkVHTEVudmlyb25tZW50ICgpIHtcbiAgICB2YXIgZW52ID0gY3JlYXRlRW52aXJvbm1lbnQoKVxuICAgIHZhciBsaW5rID0gZW52LmxpbmtcbiAgICB2YXIgZ2xvYmFsID0gZW52Lmdsb2JhbFxuICAgIGVudi5pZCA9IGRyYXdDYWxsQ291bnRlcisrXG5cbiAgICBlbnYuYmF0Y2hJZCA9ICcwJ1xuXG4gICAgLy8gbGluayBzaGFyZWQgc3RhdGVcbiAgICB2YXIgU0hBUkVEID0gbGluayhzaGFyZWRTdGF0ZSlcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZCA9IHtcbiAgICAgIHByb3BzOiAnYTAnXG4gICAgfVxuICAgIE9iamVjdC5rZXlzKHNoYXJlZFN0YXRlKS5mb3JFYWNoKGZ1bmN0aW9uIChwcm9wKSB7XG4gICAgICBzaGFyZWRbcHJvcF0gPSBnbG9iYWwuZGVmKFNIQVJFRCwgJy4nLCBwcm9wKVxuICAgIH0pXG5cbiAgICAvLyBJbmplY3QgcnVudGltZSBhc3NlcnRpb24gc3R1ZmYgZm9yIGRlYnVnIGJ1aWxkc1xuICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgIGVudi5DSEVDSyA9IGxpbmsoY2hlY2spXG4gICAgICBlbnYuY29tbWFuZFN0ciA9IGNoZWNrLmd1ZXNzQ29tbWFuZCgpXG4gICAgICBlbnYuY29tbWFuZCA9IGxpbmsoZW52LmNvbW1hbmRTdHIpXG4gICAgICBlbnYuYXNzZXJ0ID0gZnVuY3Rpb24gKGJsb2NrLCBwcmVkLCBtZXNzYWdlKSB7XG4gICAgICAgIGJsb2NrKFxuICAgICAgICAgICdpZighKCcsIHByZWQsICcpKScsXG4gICAgICAgICAgdGhpcy5DSEVDSywgJy5jb21tYW5kUmFpc2UoJywgbGluayhtZXNzYWdlKSwgJywnLCB0aGlzLmNvbW1hbmQsICcpOycpXG4gICAgICB9XG5cbiAgICAgIHNoYXJlZENvbnN0YW50cy5pbnZhbGlkQmxlbmRDb21iaW5hdGlvbnMgPSBpbnZhbGlkQmxlbmRDb21iaW5hdGlvbnNcbiAgICB9KVxuXG4gICAgLy8gQ29weSBHTCBzdGF0ZSB2YXJpYWJsZXMgb3ZlclxuICAgIHZhciBuZXh0VmFycyA9IGVudi5uZXh0ID0ge31cbiAgICB2YXIgY3VycmVudFZhcnMgPSBlbnYuY3VycmVudCA9IHt9XG4gICAgT2JqZWN0LmtleXMoR0xfVkFSSUFCTEVTKS5mb3JFYWNoKGZ1bmN0aW9uICh2YXJpYWJsZSkge1xuICAgICAgaWYgKEFycmF5LmlzQXJyYXkoY3VycmVudFN0YXRlW3ZhcmlhYmxlXSkpIHtcbiAgICAgICAgbmV4dFZhcnNbdmFyaWFibGVdID0gZ2xvYmFsLmRlZihzaGFyZWQubmV4dCwgJy4nLCB2YXJpYWJsZSlcbiAgICAgICAgY3VycmVudFZhcnNbdmFyaWFibGVdID0gZ2xvYmFsLmRlZihzaGFyZWQuY3VycmVudCwgJy4nLCB2YXJpYWJsZSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8gSW5pdGlhbGl6ZSBzaGFyZWQgY29uc3RhbnRzXG4gICAgdmFyIGNvbnN0YW50cyA9IGVudi5jb25zdGFudHMgPSB7fVxuICAgIE9iamVjdC5rZXlzKHNoYXJlZENvbnN0YW50cykuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgY29uc3RhbnRzW25hbWVdID0gZ2xvYmFsLmRlZihKU09OLnN0cmluZ2lmeShzaGFyZWRDb25zdGFudHNbbmFtZV0pKVxuICAgIH0pXG5cbiAgICAvLyBIZWxwZXIgZnVuY3Rpb24gZm9yIGNhbGxpbmcgYSBibG9ja1xuICAgIGVudi5pbnZva2UgPSBmdW5jdGlvbiAoYmxvY2ssIHgpIHtcbiAgICAgIHN3aXRjaCAoeC50eXBlKSB7XG4gICAgICAgIGNhc2UgRFlOX0ZVTkM6XG4gICAgICAgICAgdmFyIGFyZ0xpc3QgPSBbXG4gICAgICAgICAgICAndGhpcycsXG4gICAgICAgICAgICBzaGFyZWQuY29udGV4dCxcbiAgICAgICAgICAgIHNoYXJlZC5wcm9wcyxcbiAgICAgICAgICAgIGVudi5iYXRjaElkXG4gICAgICAgICAgXVxuICAgICAgICAgIHJldHVybiBibG9jay5kZWYoXG4gICAgICAgICAgICBsaW5rKHguZGF0YSksICcuY2FsbCgnLFxuICAgICAgICAgICAgICBhcmdMaXN0LnNsaWNlKDAsIE1hdGgubWF4KHguZGF0YS5sZW5ndGggKyAxLCA0KSksXG4gICAgICAgICAgICAgJyknKVxuICAgICAgICBjYXNlIERZTl9QUk9QOlxuICAgICAgICAgIHJldHVybiBibG9jay5kZWYoc2hhcmVkLnByb3BzLCB4LmRhdGEpXG4gICAgICAgIGNhc2UgRFlOX0NPTlRFWFQ6XG4gICAgICAgICAgcmV0dXJuIGJsb2NrLmRlZihzaGFyZWQuY29udGV4dCwgeC5kYXRhKVxuICAgICAgICBjYXNlIERZTl9TVEFURTpcbiAgICAgICAgICByZXR1cm4gYmxvY2suZGVmKCd0aGlzJywgeC5kYXRhKVxuICAgICAgICBjYXNlIERZTl9USFVOSzpcbiAgICAgICAgICB4LmRhdGEuYXBwZW5kKGVudiwgYmxvY2spXG4gICAgICAgICAgcmV0dXJuIHguZGF0YS5yZWZcbiAgICAgIH1cbiAgICB9XG5cbiAgICBlbnYuYXR0cmliQ2FjaGUgPSB7fVxuXG4gICAgdmFyIHNjb3BlQXR0cmlicyA9IHt9XG4gICAgZW52LnNjb3BlQXR0cmliID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHZhciBpZCA9IHN0cmluZ1N0b3JlLmlkKG5hbWUpXG4gICAgICBpZiAoaWQgaW4gc2NvcGVBdHRyaWJzKSB7XG4gICAgICAgIHJldHVybiBzY29wZUF0dHJpYnNbaWRdXG4gICAgICB9XG4gICAgICB2YXIgYmluZGluZyA9IGF0dHJpYnV0ZVN0YXRlLnNjb3BlW2lkXVxuICAgICAgaWYgKCFiaW5kaW5nKSB7XG4gICAgICAgIGJpbmRpbmcgPSBhdHRyaWJ1dGVTdGF0ZS5zY29wZVtpZF0gPSBuZXcgQXR0cmlidXRlUmVjb3JkKClcbiAgICAgIH1cbiAgICAgIHZhciByZXN1bHQgPSBzY29wZUF0dHJpYnNbaWRdID0gbGluayhiaW5kaW5nKVxuICAgICAgcmV0dXJuIHJlc3VsdFxuICAgIH1cblxuICAgIHJldHVybiBlbnZcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gUEFSU0lOR1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIHBhcnNlUHJvZmlsZSAob3B0aW9ucykge1xuICAgIHZhciBzdGF0aWNPcHRpb25zID0gb3B0aW9ucy5zdGF0aWNcbiAgICB2YXIgZHluYW1pY09wdGlvbnMgPSBvcHRpb25zLmR5bmFtaWNcblxuICAgIHZhciBwcm9maWxlRW5hYmxlXG4gICAgaWYgKFNfUFJPRklMRSBpbiBzdGF0aWNPcHRpb25zKSB7XG4gICAgICB2YXIgdmFsdWUgPSAhIXN0YXRpY09wdGlvbnNbU19QUk9GSUxFXVxuICAgICAgcHJvZmlsZUVuYWJsZSA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgcmV0dXJuIHZhbHVlXG4gICAgICB9KVxuICAgICAgcHJvZmlsZUVuYWJsZS5lbmFibGUgPSB2YWx1ZVxuICAgIH0gZWxzZSBpZiAoU19QUk9GSUxFIGluIGR5bmFtaWNPcHRpb25zKSB7XG4gICAgICB2YXIgZHluID0gZHluYW1pY09wdGlvbnNbU19QUk9GSUxFXVxuICAgICAgcHJvZmlsZUVuYWJsZSA9IGNyZWF0ZUR5bmFtaWNEZWNsKGR5biwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgcmV0dXJuIGVudi5pbnZva2Uoc2NvcGUsIGR5bilcbiAgICAgIH0pXG4gICAgfVxuXG4gICAgcmV0dXJuIHByb2ZpbGVFbmFibGVcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlRnJhbWVidWZmZXIgKG9wdGlvbnMsIGVudikge1xuICAgIHZhciBzdGF0aWNPcHRpb25zID0gb3B0aW9ucy5zdGF0aWNcbiAgICB2YXIgZHluYW1pY09wdGlvbnMgPSBvcHRpb25zLmR5bmFtaWNcblxuICAgIGlmIChTX0ZSQU1FQlVGRkVSIGluIHN0YXRpY09wdGlvbnMpIHtcbiAgICAgIHZhciBmcmFtZWJ1ZmZlciA9IHN0YXRpY09wdGlvbnNbU19GUkFNRUJVRkZFUl1cbiAgICAgIGlmIChmcmFtZWJ1ZmZlcikge1xuICAgICAgICBmcmFtZWJ1ZmZlciA9IGZyYW1lYnVmZmVyU3RhdGUuZ2V0RnJhbWVidWZmZXIoZnJhbWVidWZmZXIpXG4gICAgICAgIGNoZWNrLmNvbW1hbmQoZnJhbWVidWZmZXIsICdpbnZhbGlkIGZyYW1lYnVmZmVyIG9iamVjdCcpXG4gICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIGJsb2NrKSB7XG4gICAgICAgICAgdmFyIEZSQU1FQlVGRkVSID0gZW52LmxpbmsoZnJhbWVidWZmZXIpXG4gICAgICAgICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcbiAgICAgICAgICBibG9jay5zZXQoXG4gICAgICAgICAgICBzaGFyZWQuZnJhbWVidWZmZXIsXG4gICAgICAgICAgICAnLm5leHQnLFxuICAgICAgICAgICAgRlJBTUVCVUZGRVIpXG4gICAgICAgICAgdmFyIENPTlRFWFQgPSBzaGFyZWQuY29udGV4dFxuICAgICAgICAgIGJsb2NrLnNldChcbiAgICAgICAgICAgIENPTlRFWFQsXG4gICAgICAgICAgICAnLicgKyBTX0ZSQU1FQlVGRkVSX1dJRFRILFxuICAgICAgICAgICAgRlJBTUVCVUZGRVIgKyAnLndpZHRoJylcbiAgICAgICAgICBibG9jay5zZXQoXG4gICAgICAgICAgICBDT05URVhULFxuICAgICAgICAgICAgJy4nICsgU19GUkFNRUJVRkZFUl9IRUlHSFQsXG4gICAgICAgICAgICBGUkFNRUJVRkZFUiArICcuaGVpZ2h0JylcbiAgICAgICAgICByZXR1cm4gRlJBTUVCVUZGRVJcbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcbiAgICAgICAgICBzY29wZS5zZXQoXG4gICAgICAgICAgICBzaGFyZWQuZnJhbWVidWZmZXIsXG4gICAgICAgICAgICAnLm5leHQnLFxuICAgICAgICAgICAgJ251bGwnKVxuICAgICAgICAgIHZhciBDT05URVhUID0gc2hhcmVkLmNvbnRleHRcbiAgICAgICAgICBzY29wZS5zZXQoXG4gICAgICAgICAgICBDT05URVhULFxuICAgICAgICAgICAgJy4nICsgU19GUkFNRUJVRkZFUl9XSURUSCxcbiAgICAgICAgICAgIENPTlRFWFQgKyAnLicgKyBTX0RSQVdJTkdCVUZGRVJfV0lEVEgpXG4gICAgICAgICAgc2NvcGUuc2V0KFxuICAgICAgICAgICAgQ09OVEVYVCxcbiAgICAgICAgICAgICcuJyArIFNfRlJBTUVCVUZGRVJfSEVJR0hULFxuICAgICAgICAgICAgQ09OVEVYVCArICcuJyArIFNfRFJBV0lOR0JVRkZFUl9IRUlHSFQpXG4gICAgICAgICAgcmV0dXJuICdudWxsJ1xuICAgICAgICB9KVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoU19GUkFNRUJVRkZFUiBpbiBkeW5hbWljT3B0aW9ucykge1xuICAgICAgdmFyIGR5biA9IGR5bmFtaWNPcHRpb25zW1NfRlJBTUVCVUZGRVJdXG4gICAgICByZXR1cm4gY3JlYXRlRHluYW1pY0RlY2woZHluLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICB2YXIgRlJBTUVCVUZGRVJfRlVOQyA9IGVudi5pbnZva2Uoc2NvcGUsIGR5bilcbiAgICAgICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcbiAgICAgICAgdmFyIEZSQU1FQlVGRkVSX1NUQVRFID0gc2hhcmVkLmZyYW1lYnVmZmVyXG4gICAgICAgIHZhciBGUkFNRUJVRkZFUiA9IHNjb3BlLmRlZihcbiAgICAgICAgICBGUkFNRUJVRkZFUl9TVEFURSwgJy5nZXRGcmFtZWJ1ZmZlcignLCBGUkFNRUJVRkZFUl9GVU5DLCAnKScpXG5cbiAgICAgICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXG4gICAgICAgICAgICAnIScgKyBGUkFNRUJVRkZFUl9GVU5DICsgJ3x8JyArIEZSQU1FQlVGRkVSLFxuICAgICAgICAgICAgJ2ludmFsaWQgZnJhbWVidWZmZXIgb2JqZWN0JylcbiAgICAgICAgfSlcblxuICAgICAgICBzY29wZS5zZXQoXG4gICAgICAgICAgRlJBTUVCVUZGRVJfU1RBVEUsXG4gICAgICAgICAgJy5uZXh0JyxcbiAgICAgICAgICBGUkFNRUJVRkZFUilcbiAgICAgICAgdmFyIENPTlRFWFQgPSBzaGFyZWQuY29udGV4dFxuICAgICAgICBzY29wZS5zZXQoXG4gICAgICAgICAgQ09OVEVYVCxcbiAgICAgICAgICAnLicgKyBTX0ZSQU1FQlVGRkVSX1dJRFRILFxuICAgICAgICAgIEZSQU1FQlVGRkVSICsgJz8nICsgRlJBTUVCVUZGRVIgKyAnLndpZHRoOicgK1xuICAgICAgICAgIENPTlRFWFQgKyAnLicgKyBTX0RSQVdJTkdCVUZGRVJfV0lEVEgpXG4gICAgICAgIHNjb3BlLnNldChcbiAgICAgICAgICBDT05URVhULFxuICAgICAgICAgICcuJyArIFNfRlJBTUVCVUZGRVJfSEVJR0hULFxuICAgICAgICAgIEZSQU1FQlVGRkVSICtcbiAgICAgICAgICAnPycgKyBGUkFNRUJVRkZFUiArICcuaGVpZ2h0OicgK1xuICAgICAgICAgIENPTlRFWFQgKyAnLicgKyBTX0RSQVdJTkdCVUZGRVJfSEVJR0hUKVxuICAgICAgICByZXR1cm4gRlJBTUVCVUZGRVJcbiAgICAgIH0pXG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VWaWV3cG9ydFNjaXNzb3IgKG9wdGlvbnMsIGZyYW1lYnVmZmVyLCBlbnYpIHtcbiAgICB2YXIgc3RhdGljT3B0aW9ucyA9IG9wdGlvbnMuc3RhdGljXG4gICAgdmFyIGR5bmFtaWNPcHRpb25zID0gb3B0aW9ucy5keW5hbWljXG5cbiAgICBmdW5jdGlvbiBwYXJzZUJveCAocGFyYW0pIHtcbiAgICAgIGlmIChwYXJhbSBpbiBzdGF0aWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBib3ggPSBzdGF0aWNPcHRpb25zW3BhcmFtXVxuICAgICAgICBjaGVjay5jb21tYW5kVHlwZShib3gsICdvYmplY3QnLCAnaW52YWxpZCAnICsgcGFyYW0sIGVudi5jb21tYW5kU3RyKVxuXG4gICAgICAgIHZhciBpc1N0YXRpYyA9IHRydWVcbiAgICAgICAgdmFyIHggPSBib3gueCB8IDBcbiAgICAgICAgdmFyIHkgPSBib3gueSB8IDBcbiAgICAgICAgdmFyIHcsIGhcbiAgICAgICAgaWYgKCd3aWR0aCcgaW4gYm94KSB7XG4gICAgICAgICAgdyA9IGJveC53aWR0aCB8IDBcbiAgICAgICAgICBjaGVjay5jb21tYW5kKHcgPj0gMCwgJ2ludmFsaWQgJyArIHBhcmFtLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpc1N0YXRpYyA9IGZhbHNlXG4gICAgICAgIH1cbiAgICAgICAgaWYgKCdoZWlnaHQnIGluIGJveCkge1xuICAgICAgICAgIGggPSBib3guaGVpZ2h0IHwgMFxuICAgICAgICAgIGNoZWNrLmNvbW1hbmQoaCA+PSAwLCAnaW52YWxpZCAnICsgcGFyYW0sIGVudi5jb21tYW5kU3RyKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlzU3RhdGljID0gZmFsc2VcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBuZXcgRGVjbGFyYXRpb24oXG4gICAgICAgICAgIWlzU3RhdGljICYmIGZyYW1lYnVmZmVyICYmIGZyYW1lYnVmZmVyLnRoaXNEZXAsXG4gICAgICAgICAgIWlzU3RhdGljICYmIGZyYW1lYnVmZmVyICYmIGZyYW1lYnVmZmVyLmNvbnRleHREZXAsXG4gICAgICAgICAgIWlzU3RhdGljICYmIGZyYW1lYnVmZmVyICYmIGZyYW1lYnVmZmVyLnByb3BEZXAsXG4gICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICAgIHZhciBDT05URVhUID0gZW52LnNoYXJlZC5jb250ZXh0XG4gICAgICAgICAgICB2YXIgQk9YX1cgPSB3XG4gICAgICAgICAgICBpZiAoISgnd2lkdGgnIGluIGJveCkpIHtcbiAgICAgICAgICAgICAgQk9YX1cgPSBzY29wZS5kZWYoQ09OVEVYVCwgJy4nLCBTX0ZSQU1FQlVGRkVSX1dJRFRILCAnLScsIHgpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2YXIgQk9YX0ggPSBoXG4gICAgICAgICAgICBpZiAoISgnaGVpZ2h0JyBpbiBib3gpKSB7XG4gICAgICAgICAgICAgIEJPWF9IID0gc2NvcGUuZGVmKENPTlRFWFQsICcuJywgU19GUkFNRUJVRkZFUl9IRUlHSFQsICctJywgeSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBbeCwgeSwgQk9YX1csIEJPWF9IXVxuICAgICAgICAgIH0pXG4gICAgICB9IGVsc2UgaWYgKHBhcmFtIGluIGR5bmFtaWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBkeW5Cb3ggPSBkeW5hbWljT3B0aW9uc1twYXJhbV1cbiAgICAgICAgdmFyIHJlc3VsdCA9IGNyZWF0ZUR5bmFtaWNEZWNsKGR5bkJveCwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICB2YXIgQk9YID0gZW52Lmludm9rZShzY29wZSwgZHluQm94KVxuXG4gICAgICAgICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgZW52LmFzc2VydChzY29wZSxcbiAgICAgICAgICAgICAgQk9YICsgJyYmdHlwZW9mICcgKyBCT1ggKyAnPT09XCJvYmplY3RcIicsXG4gICAgICAgICAgICAgICdpbnZhbGlkICcgKyBwYXJhbSlcbiAgICAgICAgICB9KVxuXG4gICAgICAgICAgdmFyIENPTlRFWFQgPSBlbnYuc2hhcmVkLmNvbnRleHRcbiAgICAgICAgICB2YXIgQk9YX1ggPSBzY29wZS5kZWYoQk9YLCAnLnh8MCcpXG4gICAgICAgICAgdmFyIEJPWF9ZID0gc2NvcGUuZGVmKEJPWCwgJy55fDAnKVxuICAgICAgICAgIHZhciBCT1hfVyA9IHNjb3BlLmRlZihcbiAgICAgICAgICAgICdcIndpZHRoXCIgaW4gJywgQk9YLCAnPycsIEJPWCwgJy53aWR0aHwwOicsXG4gICAgICAgICAgICAnKCcsIENPTlRFWFQsICcuJywgU19GUkFNRUJVRkZFUl9XSURUSCwgJy0nLCBCT1hfWCwgJyknKVxuICAgICAgICAgIHZhciBCT1hfSCA9IHNjb3BlLmRlZihcbiAgICAgICAgICAgICdcImhlaWdodFwiIGluICcsIEJPWCwgJz8nLCBCT1gsICcuaGVpZ2h0fDA6JyxcbiAgICAgICAgICAgICcoJywgQ09OVEVYVCwgJy4nLCBTX0ZSQU1FQlVGRkVSX0hFSUdIVCwgJy0nLCBCT1hfWSwgJyknKVxuXG4gICAgICAgICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgZW52LmFzc2VydChzY29wZSxcbiAgICAgICAgICAgICAgQk9YX1cgKyAnPj0wJiYnICtcbiAgICAgICAgICAgICAgQk9YX0ggKyAnPj0wJyxcbiAgICAgICAgICAgICAgJ2ludmFsaWQgJyArIHBhcmFtKVxuICAgICAgICAgIH0pXG5cbiAgICAgICAgICByZXR1cm4gW0JPWF9YLCBCT1hfWSwgQk9YX1csIEJPWF9IXVxuICAgICAgICB9KVxuICAgICAgICBpZiAoZnJhbWVidWZmZXIpIHtcbiAgICAgICAgICByZXN1bHQudGhpc0RlcCA9IHJlc3VsdC50aGlzRGVwIHx8IGZyYW1lYnVmZmVyLnRoaXNEZXBcbiAgICAgICAgICByZXN1bHQuY29udGV4dERlcCA9IHJlc3VsdC5jb250ZXh0RGVwIHx8IGZyYW1lYnVmZmVyLmNvbnRleHREZXBcbiAgICAgICAgICByZXN1bHQucHJvcERlcCA9IHJlc3VsdC5wcm9wRGVwIHx8IGZyYW1lYnVmZmVyLnByb3BEZXBcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICB9IGVsc2UgaWYgKGZyYW1lYnVmZmVyKSB7XG4gICAgICAgIHJldHVybiBuZXcgRGVjbGFyYXRpb24oXG4gICAgICAgICAgZnJhbWVidWZmZXIudGhpc0RlcCxcbiAgICAgICAgICBmcmFtZWJ1ZmZlci5jb250ZXh0RGVwLFxuICAgICAgICAgIGZyYW1lYnVmZmVyLnByb3BEZXAsXG4gICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICAgIHZhciBDT05URVhUID0gZW52LnNoYXJlZC5jb250ZXh0XG4gICAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgICAwLCAwLFxuICAgICAgICAgICAgICBzY29wZS5kZWYoQ09OVEVYVCwgJy4nLCBTX0ZSQU1FQlVGRkVSX1dJRFRIKSxcbiAgICAgICAgICAgICAgc2NvcGUuZGVmKENPTlRFWFQsICcuJywgU19GUkFNRUJVRkZFUl9IRUlHSFQpXVxuICAgICAgICAgIH0pXG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gbnVsbFxuICAgICAgfVxuICAgIH1cblxuICAgIHZhciB2aWV3cG9ydCA9IHBhcnNlQm94KFNfVklFV1BPUlQpXG5cbiAgICBpZiAodmlld3BvcnQpIHtcbiAgICAgIHZhciBwcmV2Vmlld3BvcnQgPSB2aWV3cG9ydFxuICAgICAgdmlld3BvcnQgPSBuZXcgRGVjbGFyYXRpb24oXG4gICAgICAgIHZpZXdwb3J0LnRoaXNEZXAsXG4gICAgICAgIHZpZXdwb3J0LmNvbnRleHREZXAsXG4gICAgICAgIHZpZXdwb3J0LnByb3BEZXAsXG4gICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgdmFyIFZJRVdQT1JUID0gcHJldlZpZXdwb3J0LmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgICAgIHZhciBDT05URVhUID0gZW52LnNoYXJlZC5jb250ZXh0XG4gICAgICAgICAgc2NvcGUuc2V0KFxuICAgICAgICAgICAgQ09OVEVYVCxcbiAgICAgICAgICAgICcuJyArIFNfVklFV1BPUlRfV0lEVEgsXG4gICAgICAgICAgICBWSUVXUE9SVFsyXSlcbiAgICAgICAgICBzY29wZS5zZXQoXG4gICAgICAgICAgICBDT05URVhULFxuICAgICAgICAgICAgJy4nICsgU19WSUVXUE9SVF9IRUlHSFQsXG4gICAgICAgICAgICBWSUVXUE9SVFszXSlcbiAgICAgICAgICByZXR1cm4gVklFV1BPUlRcbiAgICAgICAgfSlcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgdmlld3BvcnQ6IHZpZXdwb3J0LFxuICAgICAgc2Npc3Nvcl9ib3g6IHBhcnNlQm94KFNfU0NJU1NPUl9CT1gpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VQcm9ncmFtIChvcHRpb25zKSB7XG4gICAgdmFyIHN0YXRpY09wdGlvbnMgPSBvcHRpb25zLnN0YXRpY1xuICAgIHZhciBkeW5hbWljT3B0aW9ucyA9IG9wdGlvbnMuZHluYW1pY1xuXG4gICAgZnVuY3Rpb24gcGFyc2VTaGFkZXIgKG5hbWUpIHtcbiAgICAgIGlmIChuYW1lIGluIHN0YXRpY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIGlkID0gc3RyaW5nU3RvcmUuaWQoc3RhdGljT3B0aW9uc1tuYW1lXSlcbiAgICAgICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHNoYWRlclN0YXRlLnNoYWRlcihzaGFkZXJUeXBlW25hbWVdLCBpZCwgY2hlY2suZ3Vlc3NDb21tYW5kKCkpXG4gICAgICAgIH0pXG4gICAgICAgIHZhciByZXN1bHQgPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICByZXR1cm4gaWRcbiAgICAgICAgfSlcbiAgICAgICAgcmVzdWx0LmlkID0gaWRcbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgfSBlbHNlIGlmIChuYW1lIGluIGR5bmFtaWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBkeW4gPSBkeW5hbWljT3B0aW9uc1tuYW1lXVxuICAgICAgICByZXR1cm4gY3JlYXRlRHluYW1pY0RlY2woZHluLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciBzdHIgPSBlbnYuaW52b2tlKHNjb3BlLCBkeW4pXG4gICAgICAgICAgdmFyIGlkID0gc2NvcGUuZGVmKGVudi5zaGFyZWQuc3RyaW5ncywgJy5pZCgnLCBzdHIsICcpJylcbiAgICAgICAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBzY29wZShcbiAgICAgICAgICAgICAgZW52LnNoYXJlZC5zaGFkZXIsICcuc2hhZGVyKCcsXG4gICAgICAgICAgICAgIHNoYWRlclR5cGVbbmFtZV0sICcsJyxcbiAgICAgICAgICAgICAgaWQsICcsJyxcbiAgICAgICAgICAgICAgZW52LmNvbW1hbmQsICcpOycpXG4gICAgICAgICAgfSlcbiAgICAgICAgICByZXR1cm4gaWRcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuXG4gICAgdmFyIGZyYWcgPSBwYXJzZVNoYWRlcihTX0ZSQUcpXG4gICAgdmFyIHZlcnQgPSBwYXJzZVNoYWRlcihTX1ZFUlQpXG5cbiAgICB2YXIgcHJvZ3JhbSA9IG51bGxcbiAgICB2YXIgcHJvZ1ZhclxuICAgIGlmIChpc1N0YXRpYyhmcmFnKSAmJiBpc1N0YXRpYyh2ZXJ0KSkge1xuICAgICAgcHJvZ3JhbSA9IHNoYWRlclN0YXRlLnByb2dyYW0odmVydC5pZCwgZnJhZy5pZClcbiAgICAgIHByb2dWYXIgPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgIHJldHVybiBlbnYubGluayhwcm9ncmFtKVxuICAgICAgfSlcbiAgICB9IGVsc2Uge1xuICAgICAgcHJvZ1ZhciA9IG5ldyBEZWNsYXJhdGlvbihcbiAgICAgICAgKGZyYWcgJiYgZnJhZy50aGlzRGVwKSB8fCAodmVydCAmJiB2ZXJ0LnRoaXNEZXApLFxuICAgICAgICAoZnJhZyAmJiBmcmFnLmNvbnRleHREZXApIHx8ICh2ZXJ0ICYmIHZlcnQuY29udGV4dERlcCksXG4gICAgICAgIChmcmFnICYmIGZyYWcucHJvcERlcCkgfHwgKHZlcnQgJiYgdmVydC5wcm9wRGVwKSxcbiAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICB2YXIgU0hBREVSX1NUQVRFID0gZW52LnNoYXJlZC5zaGFkZXJcbiAgICAgICAgICB2YXIgZnJhZ0lkXG4gICAgICAgICAgaWYgKGZyYWcpIHtcbiAgICAgICAgICAgIGZyYWdJZCA9IGZyYWcuYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGZyYWdJZCA9IHNjb3BlLmRlZihTSEFERVJfU1RBVEUsICcuJywgU19GUkFHKVxuICAgICAgICAgIH1cbiAgICAgICAgICB2YXIgdmVydElkXG4gICAgICAgICAgaWYgKHZlcnQpIHtcbiAgICAgICAgICAgIHZlcnRJZCA9IHZlcnQuYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZlcnRJZCA9IHNjb3BlLmRlZihTSEFERVJfU1RBVEUsICcuJywgU19WRVJUKVxuICAgICAgICAgIH1cbiAgICAgICAgICB2YXIgcHJvZ0RlZiA9IFNIQURFUl9TVEFURSArICcucHJvZ3JhbSgnICsgdmVydElkICsgJywnICsgZnJhZ0lkXG4gICAgICAgICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcHJvZ0RlZiArPSAnLCcgKyBlbnYuY29tbWFuZFxuICAgICAgICAgIH0pXG4gICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihwcm9nRGVmICsgJyknKVxuICAgICAgICB9KVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBmcmFnOiBmcmFnLFxuICAgICAgdmVydDogdmVydCxcbiAgICAgIHByb2dWYXI6IHByb2dWYXIsXG4gICAgICBwcm9ncmFtOiBwcm9ncmFtXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VEcmF3IChvcHRpb25zLCBlbnYpIHtcbiAgICB2YXIgc3RhdGljT3B0aW9ucyA9IG9wdGlvbnMuc3RhdGljXG4gICAgdmFyIGR5bmFtaWNPcHRpb25zID0gb3B0aW9ucy5keW5hbWljXG5cbiAgICBmdW5jdGlvbiBwYXJzZUVsZW1lbnRzICgpIHtcbiAgICAgIGlmIChTX0VMRU1FTlRTIGluIHN0YXRpY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIGVsZW1lbnRzID0gc3RhdGljT3B0aW9uc1tTX0VMRU1FTlRTXVxuICAgICAgICBpZiAoaXNCdWZmZXJBcmdzKGVsZW1lbnRzKSkge1xuICAgICAgICAgIGVsZW1lbnRzID0gZWxlbWVudFN0YXRlLmdldEVsZW1lbnRzKGVsZW1lbnRTdGF0ZS5jcmVhdGUoZWxlbWVudHMsIHRydWUpKVxuICAgICAgICB9IGVsc2UgaWYgKGVsZW1lbnRzKSB7XG4gICAgICAgICAgZWxlbWVudHMgPSBlbGVtZW50U3RhdGUuZ2V0RWxlbWVudHMoZWxlbWVudHMpXG4gICAgICAgICAgY2hlY2suY29tbWFuZChlbGVtZW50cywgJ2ludmFsaWQgZWxlbWVudHMnLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgfVxuICAgICAgICB2YXIgcmVzdWx0ID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIGlmIChlbGVtZW50cykge1xuICAgICAgICAgICAgdmFyIHJlc3VsdCA9IGVudi5saW5rKGVsZW1lbnRzKVxuICAgICAgICAgICAgZW52LkVMRU1FTlRTID0gcmVzdWx0XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICAgICAgfVxuICAgICAgICAgIGVudi5FTEVNRU5UUyA9IG51bGxcbiAgICAgICAgICByZXR1cm4gbnVsbFxuICAgICAgICB9KVxuICAgICAgICByZXN1bHQudmFsdWUgPSBlbGVtZW50c1xuICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICB9IGVsc2UgaWYgKFNfRUxFTUVOVFMgaW4gZHluYW1pY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIGR5biA9IGR5bmFtaWNPcHRpb25zW1NfRUxFTUVOVFNdXG4gICAgICAgIHJldHVybiBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcblxuICAgICAgICAgIHZhciBJU19CVUZGRVJfQVJHUyA9IHNoYXJlZC5pc0J1ZmZlckFyZ3NcbiAgICAgICAgICB2YXIgRUxFTUVOVF9TVEFURSA9IHNoYXJlZC5lbGVtZW50c1xuXG4gICAgICAgICAgdmFyIGVsZW1lbnREZWZuID0gZW52Lmludm9rZShzY29wZSwgZHluKVxuICAgICAgICAgIHZhciBlbGVtZW50cyA9IHNjb3BlLmRlZignbnVsbCcpXG4gICAgICAgICAgdmFyIGVsZW1lbnRTdHJlYW0gPSBzY29wZS5kZWYoSVNfQlVGRkVSX0FSR1MsICcoJywgZWxlbWVudERlZm4sICcpJylcblxuICAgICAgICAgIHZhciBpZnRlID0gZW52LmNvbmQoZWxlbWVudFN0cmVhbSlcbiAgICAgICAgICAgIC50aGVuKGVsZW1lbnRzLCAnPScsIEVMRU1FTlRfU1RBVEUsICcuY3JlYXRlU3RyZWFtKCcsIGVsZW1lbnREZWZuLCAnKTsnKVxuICAgICAgICAgICAgLmVsc2UoZWxlbWVudHMsICc9JywgRUxFTUVOVF9TVEFURSwgJy5nZXRFbGVtZW50cygnLCBlbGVtZW50RGVmbiwgJyk7JylcblxuICAgICAgICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGVudi5hc3NlcnQoaWZ0ZS5lbHNlLFxuICAgICAgICAgICAgICAnIScgKyBlbGVtZW50RGVmbiArICd8fCcgKyBlbGVtZW50cyxcbiAgICAgICAgICAgICAgJ2ludmFsaWQgZWxlbWVudHMnKVxuICAgICAgICAgIH0pXG5cbiAgICAgICAgICBzY29wZS5lbnRyeShpZnRlKVxuICAgICAgICAgIHNjb3BlLmV4aXQoXG4gICAgICAgICAgICBlbnYuY29uZChlbGVtZW50U3RyZWFtKVxuICAgICAgICAgICAgICAudGhlbihFTEVNRU5UX1NUQVRFLCAnLmRlc3Ryb3lTdHJlYW0oJywgZWxlbWVudHMsICcpOycpKVxuXG4gICAgICAgICAgZW52LkVMRU1FTlRTID0gZWxlbWVudHNcblxuICAgICAgICAgIHJldHVybiBlbGVtZW50c1xuICAgICAgICB9KVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cblxuICAgIHZhciBlbGVtZW50cyA9IHBhcnNlRWxlbWVudHMoKVxuXG4gICAgZnVuY3Rpb24gcGFyc2VQcmltaXRpdmUgKCkge1xuICAgICAgaWYgKFNfUFJJTUlUSVZFIGluIHN0YXRpY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIHByaW1pdGl2ZSA9IHN0YXRpY09wdGlvbnNbU19QUklNSVRJVkVdXG4gICAgICAgIGNoZWNrLmNvbW1hbmRQYXJhbWV0ZXIocHJpbWl0aXZlLCBwcmltVHlwZXMsICdpbnZhbGlkIHByaW1pdHZlJywgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgcmV0dXJuIHByaW1UeXBlc1twcmltaXRpdmVdXG4gICAgICAgIH0pXG4gICAgICB9IGVsc2UgaWYgKFNfUFJJTUlUSVZFIGluIGR5bmFtaWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBkeW5QcmltaXRpdmUgPSBkeW5hbWljT3B0aW9uc1tTX1BSSU1JVElWRV1cbiAgICAgICAgcmV0dXJuIGNyZWF0ZUR5bmFtaWNEZWNsKGR5blByaW1pdGl2ZSwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICB2YXIgUFJJTV9UWVBFUyA9IGVudi5jb25zdGFudHMucHJpbVR5cGVzXG4gICAgICAgICAgdmFyIHByaW0gPSBlbnYuaW52b2tlKHNjb3BlLCBkeW5QcmltaXRpdmUpXG4gICAgICAgICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgZW52LmFzc2VydChzY29wZSxcbiAgICAgICAgICAgICAgcHJpbSArICcgaW4gJyArIFBSSU1fVFlQRVMsXG4gICAgICAgICAgICAgICdpbnZhbGlkIHByaW1pdGl2ZSwgbXVzdCBiZSBvbmUgb2YgJyArIE9iamVjdC5rZXlzKHByaW1UeXBlcykpXG4gICAgICAgICAgfSlcbiAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKFBSSU1fVFlQRVMsICdbJywgcHJpbSwgJ10nKVxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIGlmIChlbGVtZW50cykge1xuICAgICAgICBpZiAoaXNTdGF0aWMoZWxlbWVudHMpKSB7XG4gICAgICAgICAgaWYgKGVsZW1lbnRzLnZhbHVlKSB7XG4gICAgICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKGVudi5FTEVNRU5UUywgJy5wcmltVHlwZScpXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgIHJldHVybiBHTF9UUklBTkdMRVNcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBuZXcgRGVjbGFyYXRpb24oXG4gICAgICAgICAgICBlbGVtZW50cy50aGlzRGVwLFxuICAgICAgICAgICAgZWxlbWVudHMuY29udGV4dERlcCxcbiAgICAgICAgICAgIGVsZW1lbnRzLnByb3BEZXAsXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgICAgICB2YXIgZWxlbWVudHMgPSBlbnYuRUxFTUVOVFNcbiAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihlbGVtZW50cywgJz8nLCBlbGVtZW50cywgJy5wcmltVHlwZTonLCBHTF9UUklBTkdMRVMpXG4gICAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBhcnNlUGFyYW0gKHBhcmFtLCBpc09mZnNldCkge1xuICAgICAgaWYgKHBhcmFtIGluIHN0YXRpY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIHZhbHVlID0gc3RhdGljT3B0aW9uc1twYXJhbV0gfCAwXG4gICAgICAgIGNoZWNrLmNvbW1hbmQoIWlzT2Zmc2V0IHx8IHZhbHVlID49IDAsICdpbnZhbGlkICcgKyBwYXJhbSwgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgaWYgKGlzT2Zmc2V0KSB7XG4gICAgICAgICAgICBlbnYuT0ZGU0VUID0gdmFsdWVcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHZhbHVlXG4gICAgICAgIH0pXG4gICAgICB9IGVsc2UgaWYgKHBhcmFtIGluIGR5bmFtaWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBkeW5WYWx1ZSA9IGR5bmFtaWNPcHRpb25zW3BhcmFtXVxuICAgICAgICByZXR1cm4gY3JlYXRlRHluYW1pY0RlY2woZHluVmFsdWUsIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgdmFyIHJlc3VsdCA9IGVudi5pbnZva2Uoc2NvcGUsIGR5blZhbHVlKVxuICAgICAgICAgIGlmIChpc09mZnNldCkge1xuICAgICAgICAgICAgZW52Lk9GRlNFVCA9IHJlc3VsdFxuICAgICAgICAgICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxuICAgICAgICAgICAgICAgIHJlc3VsdCArICc+PTAnLFxuICAgICAgICAgICAgICAgICdpbnZhbGlkICcgKyBwYXJhbSlcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSBpZiAoaXNPZmZzZXQgJiYgZWxlbWVudHMpIHtcbiAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICBlbnYuT0ZGU0VUID0gJzAnXG4gICAgICAgICAgcmV0dXJuIDBcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuXG4gICAgdmFyIE9GRlNFVCA9IHBhcnNlUGFyYW0oU19PRkZTRVQsIHRydWUpXG5cbiAgICBmdW5jdGlvbiBwYXJzZVZlcnRDb3VudCAoKSB7XG4gICAgICBpZiAoU19DT1VOVCBpbiBzdGF0aWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBjb3VudCA9IHN0YXRpY09wdGlvbnNbU19DT1VOVF0gfCAwXG4gICAgICAgIGNoZWNrLmNvbW1hbmQoXG4gICAgICAgICAgdHlwZW9mIGNvdW50ID09PSAnbnVtYmVyJyAmJiBjb3VudCA+PSAwLCAnaW52YWxpZCB2ZXJ0ZXggY291bnQnLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHJldHVybiBjb3VudFxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIGlmIChTX0NPVU5UIGluIGR5bmFtaWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBkeW5Db3VudCA9IGR5bmFtaWNPcHRpb25zW1NfQ09VTlRdXG4gICAgICAgIHJldHVybiBjcmVhdGVEeW5hbWljRGVjbChkeW5Db3VudCwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICB2YXIgcmVzdWx0ID0gZW52Lmludm9rZShzY29wZSwgZHluQ291bnQpXG4gICAgICAgICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgZW52LmFzc2VydChzY29wZSxcbiAgICAgICAgICAgICAgJ3R5cGVvZiAnICsgcmVzdWx0ICsgJz09PVwibnVtYmVyXCImJicgK1xuICAgICAgICAgICAgICByZXN1bHQgKyAnPj0wJiYnICtcbiAgICAgICAgICAgICAgcmVzdWx0ICsgJz09PSgnICsgcmVzdWx0ICsgJ3wwKScsXG4gICAgICAgICAgICAgICdpbnZhbGlkIHZlcnRleCBjb3VudCcpXG4gICAgICAgICAgfSlcbiAgICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICAgIH0pXG4gICAgICB9IGVsc2UgaWYgKGVsZW1lbnRzKSB7XG4gICAgICAgIGlmIChpc1N0YXRpYyhlbGVtZW50cykpIHtcbiAgICAgICAgICBpZiAoZWxlbWVudHMpIHtcbiAgICAgICAgICAgIGlmIChPRkZTRVQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG5ldyBEZWNsYXJhdGlvbihcbiAgICAgICAgICAgICAgICBPRkZTRVQudGhpc0RlcCxcbiAgICAgICAgICAgICAgICBPRkZTRVQuY29udGV4dERlcCxcbiAgICAgICAgICAgICAgICBPRkZTRVQucHJvcERlcCxcbiAgICAgICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgICAgICAgICAgdmFyIHJlc3VsdCA9IHNjb3BlLmRlZihcbiAgICAgICAgICAgICAgICAgICAgZW52LkVMRU1FTlRTLCAnLnZlcnRDb3VudC0nLCBlbnYuT0ZGU0VUKVxuXG4gICAgICAgICAgICAgICAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXG4gICAgICAgICAgICAgICAgICAgICAgcmVzdWx0ICsgJz49MCcsXG4gICAgICAgICAgICAgICAgICAgICAgJ2ludmFsaWQgdmVydGV4IG9mZnNldC9lbGVtZW50IGJ1ZmZlciB0b28gc21hbGwnKVxuICAgICAgICAgICAgICAgICAgfSlcblxuICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoZW52LkVMRU1FTlRTLCAnLnZlcnRDb3VudCcpXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciByZXN1bHQgPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIC0xXG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICByZXN1bHQuTUlTU0lORyA9IHRydWVcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHZhciB2YXJpYWJsZSA9IG5ldyBEZWNsYXJhdGlvbihcbiAgICAgICAgICAgIGVsZW1lbnRzLnRoaXNEZXAgfHwgT0ZGU0VULnRoaXNEZXAsXG4gICAgICAgICAgICBlbGVtZW50cy5jb250ZXh0RGVwIHx8IE9GRlNFVC5jb250ZXh0RGVwLFxuICAgICAgICAgICAgZWxlbWVudHMucHJvcERlcCB8fCBPRkZTRVQucHJvcERlcCxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgICAgIHZhciBlbGVtZW50cyA9IGVudi5FTEVNRU5UU1xuICAgICAgICAgICAgICBpZiAoZW52Lk9GRlNFVCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoZWxlbWVudHMsICc/JywgZWxlbWVudHMsICcudmVydENvdW50LScsXG4gICAgICAgICAgICAgICAgICBlbnYuT0ZGU0VULCAnOi0xJylcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKGVsZW1lbnRzLCAnPycsIGVsZW1lbnRzLCAnLnZlcnRDb3VudDotMScpXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhcmlhYmxlLkRZTkFNSUMgPSB0cnVlXG4gICAgICAgICAgfSlcbiAgICAgICAgICByZXR1cm4gdmFyaWFibGVcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgZWxlbWVudHM6IGVsZW1lbnRzLFxuICAgICAgcHJpbWl0aXZlOiBwYXJzZVByaW1pdGl2ZSgpLFxuICAgICAgY291bnQ6IHBhcnNlVmVydENvdW50KCksXG4gICAgICBpbnN0YW5jZXM6IHBhcnNlUGFyYW0oU19JTlNUQU5DRVMsIGZhbHNlKSxcbiAgICAgIG9mZnNldDogT0ZGU0VUXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VHTFN0YXRlIChvcHRpb25zLCBlbnYpIHtcbiAgICB2YXIgc3RhdGljT3B0aW9ucyA9IG9wdGlvbnMuc3RhdGljXG4gICAgdmFyIGR5bmFtaWNPcHRpb25zID0gb3B0aW9ucy5keW5hbWljXG5cbiAgICB2YXIgU1RBVEUgPSB7fVxuXG4gICAgR0xfU1RBVEVfTkFNRVMuZm9yRWFjaChmdW5jdGlvbiAocHJvcCkge1xuICAgICAgdmFyIHBhcmFtID0gcHJvcE5hbWUocHJvcClcblxuICAgICAgZnVuY3Rpb24gcGFyc2VQYXJhbSAocGFyc2VTdGF0aWMsIHBhcnNlRHluYW1pYykge1xuICAgICAgICBpZiAocHJvcCBpbiBzdGF0aWNPcHRpb25zKSB7XG4gICAgICAgICAgdmFyIHZhbHVlID0gcGFyc2VTdGF0aWMoc3RhdGljT3B0aW9uc1twcm9wXSlcbiAgICAgICAgICBTVEFURVtwYXJhbV0gPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZVxuICAgICAgICAgIH0pXG4gICAgICAgIH0gZWxzZSBpZiAocHJvcCBpbiBkeW5hbWljT3B0aW9ucykge1xuICAgICAgICAgIHZhciBkeW4gPSBkeW5hbWljT3B0aW9uc1twcm9wXVxuICAgICAgICAgIFNUQVRFW3BhcmFtXSA9IGNyZWF0ZUR5bmFtaWNEZWNsKGR5biwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICAgIHJldHVybiBwYXJzZUR5bmFtaWMoZW52LCBzY29wZSwgZW52Lmludm9rZShzY29wZSwgZHluKSlcbiAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHN3aXRjaCAocHJvcCkge1xuICAgICAgICBjYXNlIFNfQ1VMTF9FTkFCTEU6XG4gICAgICAgIGNhc2UgU19CTEVORF9FTkFCTEU6XG4gICAgICAgIGNhc2UgU19ESVRIRVI6XG4gICAgICAgIGNhc2UgU19TVEVOQ0lMX0VOQUJMRTpcbiAgICAgICAgY2FzZSBTX0RFUFRIX0VOQUJMRTpcbiAgICAgICAgY2FzZSBTX1NDSVNTT1JfRU5BQkxFOlxuICAgICAgICBjYXNlIFNfUE9MWUdPTl9PRkZTRVRfRU5BQkxFOlxuICAgICAgICBjYXNlIFNfU0FNUExFX0FMUEhBOlxuICAgICAgICBjYXNlIFNfU0FNUExFX0VOQUJMRTpcbiAgICAgICAgY2FzZSBTX0RFUFRIX01BU0s6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgY2hlY2suY29tbWFuZFR5cGUodmFsdWUsICdib29sZWFuJywgcHJvcCwgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgZW52LmFzc2VydChzY29wZSxcbiAgICAgICAgICAgICAgICAgICd0eXBlb2YgJyArIHZhbHVlICsgJz09PVwiYm9vbGVhblwiJyxcbiAgICAgICAgICAgICAgICAgICdpbnZhbGlkIGZsYWcgJyArIHByb3AsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICByZXR1cm4gdmFsdWVcbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX0RFUFRIX0ZVTkM6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgY2hlY2suY29tbWFuZFBhcmFtZXRlcih2YWx1ZSwgY29tcGFyZUZ1bmNzLCAnaW52YWxpZCAnICsgcHJvcCwgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgIHJldHVybiBjb21wYXJlRnVuY3NbdmFsdWVdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIHZhciBDT01QQVJFX0ZVTkNTID0gZW52LmNvbnN0YW50cy5jb21wYXJlRnVuY3NcbiAgICAgICAgICAgICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXG4gICAgICAgICAgICAgICAgICB2YWx1ZSArICcgaW4gJyArIENPTVBBUkVfRlVOQ1MsXG4gICAgICAgICAgICAgICAgICAnaW52YWxpZCAnICsgcHJvcCArICcsIG11c3QgYmUgb25lIG9mICcgKyBPYmplY3Qua2V5cyhjb21wYXJlRnVuY3MpKVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKENPTVBBUkVfRlVOQ1MsICdbJywgdmFsdWUsICddJylcbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX0RFUFRIX1JBTkdFOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmQoXG4gICAgICAgICAgICAgICAgaXNBcnJheUxpa2UodmFsdWUpICYmXG4gICAgICAgICAgICAgICAgdmFsdWUubGVuZ3RoID09PSAyICYmXG4gICAgICAgICAgICAgICAgdHlwZW9mIHZhbHVlWzBdID09PSAnbnVtYmVyJyAmJlxuICAgICAgICAgICAgICAgIHR5cGVvZiB2YWx1ZVsxXSA9PT0gJ251bWJlcicgJiZcbiAgICAgICAgICAgICAgICB2YWx1ZVswXSA8PSB2YWx1ZVsxXSxcbiAgICAgICAgICAgICAgICAnZGVwdGggcmFuZ2UgaXMgMmQgYXJyYXknLFxuICAgICAgICAgICAgICAgIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICByZXR1cm4gdmFsdWVcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXG4gICAgICAgICAgICAgICAgICBlbnYuc2hhcmVkLmlzQXJyYXlMaWtlICsgJygnICsgdmFsdWUgKyAnKSYmJyArXG4gICAgICAgICAgICAgICAgICB2YWx1ZSArICcubGVuZ3RoPT09MiYmJyArXG4gICAgICAgICAgICAgICAgICAndHlwZW9mICcgKyB2YWx1ZSArICdbMF09PT1cIm51bWJlclwiJiYnICtcbiAgICAgICAgICAgICAgICAgICd0eXBlb2YgJyArIHZhbHVlICsgJ1sxXT09PVwibnVtYmVyXCImJicgK1xuICAgICAgICAgICAgICAgICAgdmFsdWUgKyAnWzBdPD0nICsgdmFsdWUgKyAnWzFdJyxcbiAgICAgICAgICAgICAgICAgICdkZXB0aCByYW5nZSBtdXN0IGJlIGEgMmQgYXJyYXknKVxuICAgICAgICAgICAgICB9KVxuXG4gICAgICAgICAgICAgIHZhciBaX05FQVIgPSBzY29wZS5kZWYoJysnLCB2YWx1ZSwgJ1swXScpXG4gICAgICAgICAgICAgIHZhciBaX0ZBUiA9IHNjb3BlLmRlZignKycsIHZhbHVlLCAnWzFdJylcbiAgICAgICAgICAgICAgcmV0dXJuIFtaX05FQVIsIFpfRkFSXVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfQkxFTkRfRlVOQzpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBjaGVjay5jb21tYW5kVHlwZSh2YWx1ZSwgJ29iamVjdCcsICdibGVuZC5mdW5jJywgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgIHZhciBzcmNSR0IgPSAoJ3NyY1JHQicgaW4gdmFsdWUgPyB2YWx1ZS5zcmNSR0IgOiB2YWx1ZS5zcmMpXG4gICAgICAgICAgICAgIHZhciBzcmNBbHBoYSA9ICgnc3JjQWxwaGEnIGluIHZhbHVlID8gdmFsdWUuc3JjQWxwaGEgOiB2YWx1ZS5zcmMpXG4gICAgICAgICAgICAgIHZhciBkc3RSR0IgPSAoJ2RzdFJHQicgaW4gdmFsdWUgPyB2YWx1ZS5kc3RSR0IgOiB2YWx1ZS5kc3QpXG4gICAgICAgICAgICAgIHZhciBkc3RBbHBoYSA9ICgnZHN0QWxwaGEnIGluIHZhbHVlID8gdmFsdWUuZHN0QWxwaGEgOiB2YWx1ZS5kc3QpXG4gICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmRQYXJhbWV0ZXIoc3JjUkdCLCBibGVuZEZ1bmNzLCBwYXJhbSArICcuc3JjUkdCJywgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmRQYXJhbWV0ZXIoc3JjQWxwaGEsIGJsZW5kRnVuY3MsIHBhcmFtICsgJy5zcmNBbHBoYScsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICBjaGVjay5jb21tYW5kUGFyYW1ldGVyKGRzdFJHQiwgYmxlbmRGdW5jcywgcGFyYW0gKyAnLmRzdFJHQicsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICBjaGVjay5jb21tYW5kUGFyYW1ldGVyKGRzdEFscGhhLCBibGVuZEZ1bmNzLCBwYXJhbSArICcuZHN0QWxwaGEnLCBlbnYuY29tbWFuZFN0cilcblxuICAgICAgICAgICAgICBjaGVjay5jb21tYW5kKFxuICAgICAgICAgICAgICAgIChpbnZhbGlkQmxlbmRDb21iaW5hdGlvbnMuaW5kZXhPZihzcmNSR0IgKyAnLCAnICsgZHN0UkdCKSA9PT0gLTEpLFxuICAgICAgICAgICAgICAgICd1bmFsbG93ZWQgYmxlbmRpbmcgY29tYmluYXRpb24gKHNyY1JHQiwgZHN0UkdCKSA9ICgnICsgc3JjUkdCICsgJywgJyArIGRzdFJHQiArICcpJywgZW52LmNvbW1hbmRTdHIpXG5cbiAgICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgICBibGVuZEZ1bmNzW3NyY1JHQl0sXG4gICAgICAgICAgICAgICAgYmxlbmRGdW5jc1tkc3RSR0JdLFxuICAgICAgICAgICAgICAgIGJsZW5kRnVuY3Nbc3JjQWxwaGFdLFxuICAgICAgICAgICAgICAgIGJsZW5kRnVuY3NbZHN0QWxwaGFdXG4gICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgdmFyIEJMRU5EX0ZVTkNTID0gZW52LmNvbnN0YW50cy5ibGVuZEZ1bmNzXG5cbiAgICAgICAgICAgICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXG4gICAgICAgICAgICAgICAgICB2YWx1ZSArICcmJnR5cGVvZiAnICsgdmFsdWUgKyAnPT09XCJvYmplY3RcIicsXG4gICAgICAgICAgICAgICAgICAnaW52YWxpZCBibGVuZCBmdW5jLCBtdXN0IGJlIGFuIG9iamVjdCcpXG4gICAgICAgICAgICAgIH0pXG5cbiAgICAgICAgICAgICAgZnVuY3Rpb24gcmVhZCAocHJlZml4LCBzdWZmaXgpIHtcbiAgICAgICAgICAgICAgICB2YXIgZnVuYyA9IHNjb3BlLmRlZihcbiAgICAgICAgICAgICAgICAgICdcIicsIHByZWZpeCwgc3VmZml4LCAnXCIgaW4gJywgdmFsdWUsXG4gICAgICAgICAgICAgICAgICAnPycsIHZhbHVlLCAnLicsIHByZWZpeCwgc3VmZml4LFxuICAgICAgICAgICAgICAgICAgJzonLCB2YWx1ZSwgJy4nLCBwcmVmaXgpXG5cbiAgICAgICAgICAgICAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxuICAgICAgICAgICAgICAgICAgICBmdW5jICsgJyBpbiAnICsgQkxFTkRfRlVOQ1MsXG4gICAgICAgICAgICAgICAgICAgICdpbnZhbGlkICcgKyBwcm9wICsgJy4nICsgcHJlZml4ICsgc3VmZml4ICsgJywgbXVzdCBiZSBvbmUgb2YgJyArIE9iamVjdC5rZXlzKGJsZW5kRnVuY3MpKVxuICAgICAgICAgICAgICAgIH0pXG5cbiAgICAgICAgICAgICAgICByZXR1cm4gZnVuY1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgdmFyIHNyY1JHQiA9IHJlYWQoJ3NyYycsICdSR0InKVxuICAgICAgICAgICAgICB2YXIgZHN0UkdCID0gcmVhZCgnZHN0JywgJ1JHQicpXG5cbiAgICAgICAgICAgICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHZhciBJTlZBTElEX0JMRU5EX0NPTUJJTkFUSU9OUyA9IGVudi5jb25zdGFudHMuaW52YWxpZEJsZW5kQ29tYmluYXRpb25zXG5cbiAgICAgICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgSU5WQUxJRF9CTEVORF9DT01CSU5BVElPTlMgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgJy5pbmRleE9mKCcgKyBzcmNSR0IgKyAnK1wiLCBcIisnICsgZHN0UkdCICsgJykgPT09IC0xICcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAndW5hbGxvd2VkIGJsZW5kaW5nIGNvbWJpbmF0aW9uIGZvciAoc3JjUkdCLCBkc3RSR0IpJ1xuICAgICAgICAgICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgIH0pXG5cbiAgICAgICAgICAgICAgdmFyIFNSQ19SR0IgPSBzY29wZS5kZWYoQkxFTkRfRlVOQ1MsICdbJywgc3JjUkdCLCAnXScpXG4gICAgICAgICAgICAgIHZhciBTUkNfQUxQSEEgPSBzY29wZS5kZWYoQkxFTkRfRlVOQ1MsICdbJywgcmVhZCgnc3JjJywgJ0FscGhhJyksICddJylcbiAgICAgICAgICAgICAgdmFyIERTVF9SR0IgPSBzY29wZS5kZWYoQkxFTkRfRlVOQ1MsICdbJywgZHN0UkdCLCAnXScpXG4gICAgICAgICAgICAgIHZhciBEU1RfQUxQSEEgPSBzY29wZS5kZWYoQkxFTkRfRlVOQ1MsICdbJywgcmVhZCgnZHN0JywgJ0FscGhhJyksICddJylcblxuICAgICAgICAgICAgICByZXR1cm4gW1NSQ19SR0IsIERTVF9SR0IsIFNSQ19BTFBIQSwgRFNUX0FMUEhBXVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfQkxFTkRfRVFVQVRJT046XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICBjaGVjay5jb21tYW5kUGFyYW1ldGVyKHZhbHVlLCBibGVuZEVxdWF0aW9ucywgJ2ludmFsaWQgJyArIHByb3AsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICAgICAgICBibGVuZEVxdWF0aW9uc1t2YWx1ZV0sXG4gICAgICAgICAgICAgICAgICBibGVuZEVxdWF0aW9uc1t2YWx1ZV1cbiAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmRQYXJhbWV0ZXIoXG4gICAgICAgICAgICAgICAgICB2YWx1ZS5yZ2IsIGJsZW5kRXF1YXRpb25zLCBwcm9wICsgJy5yZ2InLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgICBjaGVjay5jb21tYW5kUGFyYW1ldGVyKFxuICAgICAgICAgICAgICAgICAgdmFsdWUuYWxwaGEsIGJsZW5kRXF1YXRpb25zLCBwcm9wICsgJy5hbHBoYScsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICAgICAgICBibGVuZEVxdWF0aW9uc1t2YWx1ZS5yZ2JdLFxuICAgICAgICAgICAgICAgICAgYmxlbmRFcXVhdGlvbnNbdmFsdWUuYWxwaGFdXG4gICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmRSYWlzZSgnaW52YWxpZCBibGVuZC5lcXVhdGlvbicsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIHZhciBCTEVORF9FUVVBVElPTlMgPSBlbnYuY29uc3RhbnRzLmJsZW5kRXF1YXRpb25zXG5cbiAgICAgICAgICAgICAgdmFyIFJHQiA9IHNjb3BlLmRlZigpXG4gICAgICAgICAgICAgIHZhciBBTFBIQSA9IHNjb3BlLmRlZigpXG5cbiAgICAgICAgICAgICAgdmFyIGlmdGUgPSBlbnYuY29uZCgndHlwZW9mICcsIHZhbHVlLCAnPT09XCJzdHJpbmdcIicpXG5cbiAgICAgICAgICAgICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGZ1bmN0aW9uIGNoZWNrUHJvcCAoYmxvY2ssIG5hbWUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICBlbnYuYXNzZXJ0KGJsb2NrLFxuICAgICAgICAgICAgICAgICAgICB2YWx1ZSArICcgaW4gJyArIEJMRU5EX0VRVUFUSU9OUyxcbiAgICAgICAgICAgICAgICAgICAgJ2ludmFsaWQgJyArIG5hbWUgKyAnLCBtdXN0IGJlIG9uZSBvZiAnICsgT2JqZWN0LmtleXMoYmxlbmRFcXVhdGlvbnMpKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjaGVja1Byb3AoaWZ0ZS50aGVuLCBwcm9wLCB2YWx1ZSlcblxuICAgICAgICAgICAgICAgIGVudi5hc3NlcnQoaWZ0ZS5lbHNlLFxuICAgICAgICAgICAgICAgICAgdmFsdWUgKyAnJiZ0eXBlb2YgJyArIHZhbHVlICsgJz09PVwib2JqZWN0XCInLFxuICAgICAgICAgICAgICAgICAgJ2ludmFsaWQgJyArIHByb3ApXG4gICAgICAgICAgICAgICAgY2hlY2tQcm9wKGlmdGUuZWxzZSwgcHJvcCArICcucmdiJywgdmFsdWUgKyAnLnJnYicpXG4gICAgICAgICAgICAgICAgY2hlY2tQcm9wKGlmdGUuZWxzZSwgcHJvcCArICcuYWxwaGEnLCB2YWx1ZSArICcuYWxwaGEnKVxuICAgICAgICAgICAgICB9KVxuXG4gICAgICAgICAgICAgIGlmdGUudGhlbihcbiAgICAgICAgICAgICAgICBSR0IsICc9JywgQUxQSEEsICc9JywgQkxFTkRfRVFVQVRJT05TLCAnWycsIHZhbHVlLCAnXTsnKVxuICAgICAgICAgICAgICBpZnRlLmVsc2UoXG4gICAgICAgICAgICAgICAgUkdCLCAnPScsIEJMRU5EX0VRVUFUSU9OUywgJ1snLCB2YWx1ZSwgJy5yZ2JdOycsXG4gICAgICAgICAgICAgICAgQUxQSEEsICc9JywgQkxFTkRfRVFVQVRJT05TLCAnWycsIHZhbHVlLCAnLmFscGhhXTsnKVxuXG4gICAgICAgICAgICAgIHNjb3BlKGlmdGUpXG5cbiAgICAgICAgICAgICAgcmV0dXJuIFtSR0IsIEFMUEhBXVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfQkxFTkRfQ09MT1I6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgY2hlY2suY29tbWFuZChcbiAgICAgICAgICAgICAgICBpc0FycmF5TGlrZSh2YWx1ZSkgJiZcbiAgICAgICAgICAgICAgICB2YWx1ZS5sZW5ndGggPT09IDQsXG4gICAgICAgICAgICAgICAgJ2JsZW5kLmNvbG9yIG11c3QgYmUgYSA0ZCBhcnJheScsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICByZXR1cm4gbG9vcCg0LCBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgICAgICAgIHJldHVybiArdmFsdWVbaV1cbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXG4gICAgICAgICAgICAgICAgICBlbnYuc2hhcmVkLmlzQXJyYXlMaWtlICsgJygnICsgdmFsdWUgKyAnKSYmJyArXG4gICAgICAgICAgICAgICAgICB2YWx1ZSArICcubGVuZ3RoPT09NCcsXG4gICAgICAgICAgICAgICAgICAnYmxlbmQuY29sb3IgbXVzdCBiZSBhIDRkIGFycmF5JylcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgcmV0dXJuIGxvb3AoNCwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKCcrJywgdmFsdWUsICdbJywgaSwgJ10nKVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfU1RFTkNJTF9NQVNLOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmRUeXBlKHZhbHVlLCAnbnVtYmVyJywgcGFyYW0sIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICByZXR1cm4gdmFsdWUgfCAwXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxuICAgICAgICAgICAgICAgICAgJ3R5cGVvZiAnICsgdmFsdWUgKyAnPT09XCJudW1iZXJcIicsXG4gICAgICAgICAgICAgICAgICAnaW52YWxpZCBzdGVuY2lsLm1hc2snKVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKHZhbHVlLCAnfDAnKVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfU1RFTkNJTF9GVU5DOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmRUeXBlKHZhbHVlLCAnb2JqZWN0JywgcGFyYW0sIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICB2YXIgY21wID0gdmFsdWUuY21wIHx8ICdrZWVwJ1xuICAgICAgICAgICAgICB2YXIgcmVmID0gdmFsdWUucmVmIHx8IDBcbiAgICAgICAgICAgICAgdmFyIG1hc2sgPSAnbWFzaycgaW4gdmFsdWUgPyB2YWx1ZS5tYXNrIDogLTFcbiAgICAgICAgICAgICAgY2hlY2suY29tbWFuZFBhcmFtZXRlcihjbXAsIGNvbXBhcmVGdW5jcywgcHJvcCArICcuY21wJywgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmRUeXBlKHJlZiwgJ251bWJlcicsIHByb3AgKyAnLnJlZicsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICBjaGVjay5jb21tYW5kVHlwZShtYXNrLCAnbnVtYmVyJywgcHJvcCArICcubWFzaycsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgICAgIGNvbXBhcmVGdW5jc1tjbXBdLFxuICAgICAgICAgICAgICAgIHJlZixcbiAgICAgICAgICAgICAgICBtYXNrXG4gICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgdmFyIENPTVBBUkVfRlVOQ1MgPSBlbnYuY29uc3RhbnRzLmNvbXBhcmVGdW5jc1xuICAgICAgICAgICAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgZnVuY3Rpb24gYXNzZXJ0ICgpIHtcbiAgICAgICAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXG4gICAgICAgICAgICAgICAgICAgIEFycmF5LnByb3RvdHlwZS5qb2luLmNhbGwoYXJndW1lbnRzLCAnJyksXG4gICAgICAgICAgICAgICAgICAgICdpbnZhbGlkIHN0ZW5jaWwuZnVuYycpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGFzc2VydCh2YWx1ZSArICcmJnR5cGVvZiAnLCB2YWx1ZSwgJz09PVwib2JqZWN0XCInKVxuICAgICAgICAgICAgICAgIGFzc2VydCgnIShcImNtcFwiIGluICcsIHZhbHVlLCAnKXx8KCcsXG4gICAgICAgICAgICAgICAgICB2YWx1ZSwgJy5jbXAgaW4gJywgQ09NUEFSRV9GVU5DUywgJyknKVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICB2YXIgY21wID0gc2NvcGUuZGVmKFxuICAgICAgICAgICAgICAgICdcImNtcFwiIGluICcsIHZhbHVlLFxuICAgICAgICAgICAgICAgICc/JywgQ09NUEFSRV9GVU5DUywgJ1snLCB2YWx1ZSwgJy5jbXBdJyxcbiAgICAgICAgICAgICAgICAnOicsIEdMX0tFRVApXG4gICAgICAgICAgICAgIHZhciByZWYgPSBzY29wZS5kZWYodmFsdWUsICcucmVmfDAnKVxuICAgICAgICAgICAgICB2YXIgbWFzayA9IHNjb3BlLmRlZihcbiAgICAgICAgICAgICAgICAnXCJtYXNrXCIgaW4gJywgdmFsdWUsXG4gICAgICAgICAgICAgICAgJz8nLCB2YWx1ZSwgJy5tYXNrfDA6LTEnKVxuICAgICAgICAgICAgICByZXR1cm4gW2NtcCwgcmVmLCBtYXNrXVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfU1RFTkNJTF9PUEZST05UOlxuICAgICAgICBjYXNlIFNfU1RFTkNJTF9PUEJBQ0s6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgY2hlY2suY29tbWFuZFR5cGUodmFsdWUsICdvYmplY3QnLCBwYXJhbSwgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgIHZhciBmYWlsID0gdmFsdWUuZmFpbCB8fCAna2VlcCdcbiAgICAgICAgICAgICAgdmFyIHpmYWlsID0gdmFsdWUuemZhaWwgfHwgJ2tlZXAnXG4gICAgICAgICAgICAgIHZhciB6cGFzcyA9IHZhbHVlLnpwYXNzIHx8ICdrZWVwJ1xuICAgICAgICAgICAgICBjaGVjay5jb21tYW5kUGFyYW1ldGVyKGZhaWwsIHN0ZW5jaWxPcHMsIHByb3AgKyAnLmZhaWwnLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgY2hlY2suY29tbWFuZFBhcmFtZXRlcih6ZmFpbCwgc3RlbmNpbE9wcywgcHJvcCArICcuemZhaWwnLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgY2hlY2suY29tbWFuZFBhcmFtZXRlcih6cGFzcywgc3RlbmNpbE9wcywgcHJvcCArICcuenBhc3MnLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgICBwcm9wID09PSBTX1NURU5DSUxfT1BCQUNLID8gR0xfQkFDSyA6IEdMX0ZST05ULFxuICAgICAgICAgICAgICAgIHN0ZW5jaWxPcHNbZmFpbF0sXG4gICAgICAgICAgICAgICAgc3RlbmNpbE9wc1t6ZmFpbF0sXG4gICAgICAgICAgICAgICAgc3RlbmNpbE9wc1t6cGFzc11cbiAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICB2YXIgU1RFTkNJTF9PUFMgPSBlbnYuY29uc3RhbnRzLnN0ZW5jaWxPcHNcblxuICAgICAgICAgICAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgZW52LmFzc2VydChzY29wZSxcbiAgICAgICAgICAgICAgICAgIHZhbHVlICsgJyYmdHlwZW9mICcgKyB2YWx1ZSArICc9PT1cIm9iamVjdFwiJyxcbiAgICAgICAgICAgICAgICAgICdpbnZhbGlkICcgKyBwcm9wKVxuICAgICAgICAgICAgICB9KVxuXG4gICAgICAgICAgICAgIGZ1bmN0aW9uIHJlYWQgKG5hbWUpIHtcbiAgICAgICAgICAgICAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxuICAgICAgICAgICAgICAgICAgICAnIShcIicgKyBuYW1lICsgJ1wiIGluICcgKyB2YWx1ZSArICcpfHwnICtcbiAgICAgICAgICAgICAgICAgICAgJygnICsgdmFsdWUgKyAnLicgKyBuYW1lICsgJyBpbiAnICsgU1RFTkNJTF9PUFMgKyAnKScsXG4gICAgICAgICAgICAgICAgICAgICdpbnZhbGlkICcgKyBwcm9wICsgJy4nICsgbmFtZSArICcsIG11c3QgYmUgb25lIG9mICcgKyBPYmplY3Qua2V5cyhzdGVuY2lsT3BzKSlcbiAgICAgICAgICAgICAgICB9KVxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihcbiAgICAgICAgICAgICAgICAgICdcIicsIG5hbWUsICdcIiBpbiAnLCB2YWx1ZSxcbiAgICAgICAgICAgICAgICAgICc/JywgU1RFTkNJTF9PUFMsICdbJywgdmFsdWUsICcuJywgbmFtZSwgJ106JyxcbiAgICAgICAgICAgICAgICAgIEdMX0tFRVApXG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgICAgIHByb3AgPT09IFNfU1RFTkNJTF9PUEJBQ0sgPyBHTF9CQUNLIDogR0xfRlJPTlQsXG4gICAgICAgICAgICAgICAgcmVhZCgnZmFpbCcpLFxuICAgICAgICAgICAgICAgIHJlYWQoJ3pmYWlsJyksXG4gICAgICAgICAgICAgICAgcmVhZCgnenBhc3MnKVxuICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19QT0xZR09OX09GRlNFVF9PRkZTRVQ6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgY2hlY2suY29tbWFuZFR5cGUodmFsdWUsICdvYmplY3QnLCBwYXJhbSwgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgIHZhciBmYWN0b3IgPSB2YWx1ZS5mYWN0b3IgfCAwXG4gICAgICAgICAgICAgIHZhciB1bml0cyA9IHZhbHVlLnVuaXRzIHwgMFxuICAgICAgICAgICAgICBjaGVjay5jb21tYW5kVHlwZShmYWN0b3IsICdudW1iZXInLCBwYXJhbSArICcuZmFjdG9yJywgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmRUeXBlKHVuaXRzLCAnbnVtYmVyJywgcGFyYW0gKyAnLnVuaXRzJywgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgIHJldHVybiBbZmFjdG9yLCB1bml0c11cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXG4gICAgICAgICAgICAgICAgICB2YWx1ZSArICcmJnR5cGVvZiAnICsgdmFsdWUgKyAnPT09XCJvYmplY3RcIicsXG4gICAgICAgICAgICAgICAgICAnaW52YWxpZCAnICsgcHJvcClcbiAgICAgICAgICAgICAgfSlcblxuICAgICAgICAgICAgICB2YXIgRkFDVE9SID0gc2NvcGUuZGVmKHZhbHVlLCAnLmZhY3RvcnwwJylcbiAgICAgICAgICAgICAgdmFyIFVOSVRTID0gc2NvcGUuZGVmKHZhbHVlLCAnLnVuaXRzfDAnKVxuXG4gICAgICAgICAgICAgIHJldHVybiBbRkFDVE9SLCBVTklUU11cbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX0NVTExfRkFDRTpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICB2YXIgZmFjZSA9IDBcbiAgICAgICAgICAgICAgaWYgKHZhbHVlID09PSAnZnJvbnQnKSB7XG4gICAgICAgICAgICAgICAgZmFjZSA9IEdMX0ZST05UXG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAodmFsdWUgPT09ICdiYWNrJykge1xuICAgICAgICAgICAgICAgIGZhY2UgPSBHTF9CQUNLXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgY2hlY2suY29tbWFuZCghIWZhY2UsIHBhcmFtLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgcmV0dXJuIGZhY2VcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXG4gICAgICAgICAgICAgICAgICB2YWx1ZSArICc9PT1cImZyb250XCJ8fCcgK1xuICAgICAgICAgICAgICAgICAgdmFsdWUgKyAnPT09XCJiYWNrXCInLFxuICAgICAgICAgICAgICAgICAgJ2ludmFsaWQgY3VsbC5mYWNlJylcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZih2YWx1ZSwgJz09PVwiZnJvbnRcIj8nLCBHTF9GUk9OVCwgJzonLCBHTF9CQUNLKVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfTElORV9XSURUSDpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBjaGVjay5jb21tYW5kKFxuICAgICAgICAgICAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgJiZcbiAgICAgICAgICAgICAgICB2YWx1ZSA+PSBsaW1pdHMubGluZVdpZHRoRGltc1swXSAmJlxuICAgICAgICAgICAgICAgIHZhbHVlIDw9IGxpbWl0cy5saW5lV2lkdGhEaW1zWzFdLFxuICAgICAgICAgICAgICAgICdpbnZhbGlkIGxpbmUgd2lkdGgsIG11c3QgcG9zaXRpdmUgbnVtYmVyIGJldHdlZW4gJyArXG4gICAgICAgICAgICAgICAgbGltaXRzLmxpbmVXaWR0aERpbXNbMF0gKyAnIGFuZCAnICsgbGltaXRzLmxpbmVXaWR0aERpbXNbMV0sIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICByZXR1cm4gdmFsdWVcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXG4gICAgICAgICAgICAgICAgICAndHlwZW9mICcgKyB2YWx1ZSArICc9PT1cIm51bWJlclwiJiYnICtcbiAgICAgICAgICAgICAgICAgIHZhbHVlICsgJz49JyArIGxpbWl0cy5saW5lV2lkdGhEaW1zWzBdICsgJyYmJyArXG4gICAgICAgICAgICAgICAgICB2YWx1ZSArICc8PScgKyBsaW1pdHMubGluZVdpZHRoRGltc1sxXSxcbiAgICAgICAgICAgICAgICAgICdpbnZhbGlkIGxpbmUgd2lkdGgnKVxuICAgICAgICAgICAgICB9KVxuXG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfRlJPTlRfRkFDRTpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBjaGVjay5jb21tYW5kUGFyYW1ldGVyKHZhbHVlLCBvcmllbnRhdGlvblR5cGUsIHBhcmFtLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgcmV0dXJuIG9yaWVudGF0aW9uVHlwZVt2YWx1ZV1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXG4gICAgICAgICAgICAgICAgICB2YWx1ZSArICc9PT1cImN3XCJ8fCcgK1xuICAgICAgICAgICAgICAgICAgdmFsdWUgKyAnPT09XCJjY3dcIicsXG4gICAgICAgICAgICAgICAgICAnaW52YWxpZCBmcm9udEZhY2UsIG11c3QgYmUgb25lIG9mIGN3LGNjdycpXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYodmFsdWUgKyAnPT09XCJjd1wiPycgKyBHTF9DVyArICc6JyArIEdMX0NDVylcbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX0NPTE9SX01BU0s6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgY2hlY2suY29tbWFuZChcbiAgICAgICAgICAgICAgICBpc0FycmF5TGlrZSh2YWx1ZSkgJiYgdmFsdWUubGVuZ3RoID09PSA0LFxuICAgICAgICAgICAgICAgICdjb2xvci5tYXNrIG11c3QgYmUgbGVuZ3RoIDQgYXJyYXknLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlLm1hcChmdW5jdGlvbiAodikgeyByZXR1cm4gISF2IH0pXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxuICAgICAgICAgICAgICAgICAgZW52LnNoYXJlZC5pc0FycmF5TGlrZSArICcoJyArIHZhbHVlICsgJykmJicgK1xuICAgICAgICAgICAgICAgICAgdmFsdWUgKyAnLmxlbmd0aD09PTQnLFxuICAgICAgICAgICAgICAgICAgJ2ludmFsaWQgY29sb3IubWFzaycpXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIHJldHVybiBsb29wKDQsIGZ1bmN0aW9uIChpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICchIScgKyB2YWx1ZSArICdbJyArIGkgKyAnXSdcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX1NBTVBMRV9DT1ZFUkFHRTpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBjaGVjay5jb21tYW5kKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUsIHBhcmFtLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgdmFyIHNhbXBsZVZhbHVlID0gJ3ZhbHVlJyBpbiB2YWx1ZSA/IHZhbHVlLnZhbHVlIDogMVxuICAgICAgICAgICAgICB2YXIgc2FtcGxlSW52ZXJ0ID0gISF2YWx1ZS5pbnZlcnRcbiAgICAgICAgICAgICAgY2hlY2suY29tbWFuZChcbiAgICAgICAgICAgICAgICB0eXBlb2Ygc2FtcGxlVmFsdWUgPT09ICdudW1iZXInICYmXG4gICAgICAgICAgICAgICAgc2FtcGxlVmFsdWUgPj0gMCAmJiBzYW1wbGVWYWx1ZSA8PSAxLFxuICAgICAgICAgICAgICAgICdzYW1wbGUuY292ZXJhZ2UudmFsdWUgbXVzdCBiZSBhIG51bWJlciBiZXR3ZWVuIDAgYW5kIDEnLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgcmV0dXJuIFtzYW1wbGVWYWx1ZSwgc2FtcGxlSW52ZXJ0XVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgZW52LmFzc2VydChzY29wZSxcbiAgICAgICAgICAgICAgICAgIHZhbHVlICsgJyYmdHlwZW9mICcgKyB2YWx1ZSArICc9PT1cIm9iamVjdFwiJyxcbiAgICAgICAgICAgICAgICAgICdpbnZhbGlkIHNhbXBsZS5jb3ZlcmFnZScpXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIHZhciBWQUxVRSA9IHNjb3BlLmRlZihcbiAgICAgICAgICAgICAgICAnXCJ2YWx1ZVwiIGluICcsIHZhbHVlLCAnPysnLCB2YWx1ZSwgJy52YWx1ZToxJylcbiAgICAgICAgICAgICAgdmFyIElOVkVSVCA9IHNjb3BlLmRlZignISEnLCB2YWx1ZSwgJy5pbnZlcnQnKVxuICAgICAgICAgICAgICByZXR1cm4gW1ZBTFVFLCBJTlZFUlRdXG4gICAgICAgICAgICB9KVxuICAgICAgfVxuICAgIH0pXG5cbiAgICByZXR1cm4gU1RBVEVcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlVW5pZm9ybXMgKHVuaWZvcm1zLCBlbnYpIHtcbiAgICB2YXIgc3RhdGljVW5pZm9ybXMgPSB1bmlmb3Jtcy5zdGF0aWNcbiAgICB2YXIgZHluYW1pY1VuaWZvcm1zID0gdW5pZm9ybXMuZHluYW1pY1xuXG4gICAgdmFyIFVOSUZPUk1TID0ge31cblxuICAgIE9iamVjdC5rZXlzKHN0YXRpY1VuaWZvcm1zKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICB2YXIgdmFsdWUgPSBzdGF0aWNVbmlmb3Jtc1tuYW1lXVxuICAgICAgdmFyIHJlc3VsdFxuICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgfHxcbiAgICAgICAgICB0eXBlb2YgdmFsdWUgPT09ICdib29sZWFuJykge1xuICAgICAgICByZXN1bHQgPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICByZXR1cm4gdmFsdWVcbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHZhciByZWdsVHlwZSA9IHZhbHVlLl9yZWdsVHlwZVxuICAgICAgICBpZiAocmVnbFR5cGUgPT09ICd0ZXh0dXJlMmQnIHx8XG4gICAgICAgICAgICByZWdsVHlwZSA9PT0gJ3RleHR1cmVDdWJlJykge1xuICAgICAgICAgIHJlc3VsdCA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudikge1xuICAgICAgICAgICAgcmV0dXJuIGVudi5saW5rKHZhbHVlKVxuICAgICAgICAgIH0pXG4gICAgICAgIH0gZWxzZSBpZiAocmVnbFR5cGUgPT09ICdmcmFtZWJ1ZmZlcicgfHxcbiAgICAgICAgICAgICAgICAgICByZWdsVHlwZSA9PT0gJ2ZyYW1lYnVmZmVyQ3ViZScpIHtcbiAgICAgICAgICBjaGVjay5jb21tYW5kKHZhbHVlLmNvbG9yLmxlbmd0aCA+IDAsXG4gICAgICAgICAgICAnbWlzc2luZyBjb2xvciBhdHRhY2htZW50IGZvciBmcmFtZWJ1ZmZlciBzZW50IHRvIHVuaWZvcm0gXCInICsgbmFtZSArICdcIicsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgIHJlc3VsdCA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudikge1xuICAgICAgICAgICAgcmV0dXJuIGVudi5saW5rKHZhbHVlLmNvbG9yWzBdKVxuICAgICAgICAgIH0pXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY2hlY2suY29tbWFuZFJhaXNlKCdpbnZhbGlkIGRhdGEgZm9yIHVuaWZvcm0gXCInICsgbmFtZSArICdcIicsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGlzQXJyYXlMaWtlKHZhbHVlKSkge1xuICAgICAgICByZXN1bHQgPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYpIHtcbiAgICAgICAgICB2YXIgSVRFTSA9IGVudi5nbG9iYWwuZGVmKCdbJyxcbiAgICAgICAgICAgIGxvb3AodmFsdWUubGVuZ3RoLCBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgICAgICBjaGVjay5jb21tYW5kKFxuICAgICAgICAgICAgICAgIHR5cGVvZiB2YWx1ZVtpXSA9PT0gJ251bWJlcicgfHxcbiAgICAgICAgICAgICAgICB0eXBlb2YgdmFsdWVbaV0gPT09ICdib29sZWFuJyxcbiAgICAgICAgICAgICAgICAnaW52YWxpZCB1bmlmb3JtICcgKyBuYW1lLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlW2ldXG4gICAgICAgICAgICB9KSwgJ10nKVxuICAgICAgICAgIHJldHVybiBJVEVNXG4gICAgICAgIH0pXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjaGVjay5jb21tYW5kUmFpc2UoJ2ludmFsaWQgb3IgbWlzc2luZyBkYXRhIGZvciB1bmlmb3JtIFwiJyArIG5hbWUgKyAnXCInLCBlbnYuY29tbWFuZFN0cilcbiAgICAgIH1cbiAgICAgIHJlc3VsdC52YWx1ZSA9IHZhbHVlXG4gICAgICBVTklGT1JNU1tuYW1lXSA9IHJlc3VsdFxuICAgIH0pXG5cbiAgICBPYmplY3Qua2V5cyhkeW5hbWljVW5pZm9ybXMpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgdmFyIGR5biA9IGR5bmFtaWNVbmlmb3Jtc1trZXldXG4gICAgICBVTklGT1JNU1trZXldID0gY3JlYXRlRHluYW1pY0RlY2woZHluLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICByZXR1cm4gZW52Lmludm9rZShzY29wZSwgZHluKVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgcmV0dXJuIFVOSUZPUk1TXG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZUF0dHJpYnV0ZXMgKGF0dHJpYnV0ZXMsIGVudikge1xuICAgIHZhciBzdGF0aWNBdHRyaWJ1dGVzID0gYXR0cmlidXRlcy5zdGF0aWNcbiAgICB2YXIgZHluYW1pY0F0dHJpYnV0ZXMgPSBhdHRyaWJ1dGVzLmR5bmFtaWNcblxuICAgIHZhciBhdHRyaWJ1dGVEZWZzID0ge31cblxuICAgIE9iamVjdC5rZXlzKHN0YXRpY0F0dHJpYnV0ZXMpLmZvckVhY2goZnVuY3Rpb24gKGF0dHJpYnV0ZSkge1xuICAgICAgdmFyIHZhbHVlID0gc3RhdGljQXR0cmlidXRlc1thdHRyaWJ1dGVdXG4gICAgICB2YXIgaWQgPSBzdHJpbmdTdG9yZS5pZChhdHRyaWJ1dGUpXG5cbiAgICAgIHZhciByZWNvcmQgPSBuZXcgQXR0cmlidXRlUmVjb3JkKClcbiAgICAgIGlmIChpc0J1ZmZlckFyZ3ModmFsdWUpKSB7XG4gICAgICAgIHJlY29yZC5zdGF0ZSA9IEFUVFJJQl9TVEFURV9QT0lOVEVSXG4gICAgICAgIHJlY29yZC5idWZmZXIgPSBidWZmZXJTdGF0ZS5nZXRCdWZmZXIoXG4gICAgICAgICAgYnVmZmVyU3RhdGUuY3JlYXRlKHZhbHVlLCBHTF9BUlJBWV9CVUZGRVIsIGZhbHNlLCB0cnVlKSlcbiAgICAgICAgcmVjb3JkLnR5cGUgPSAwXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgYnVmZmVyID0gYnVmZmVyU3RhdGUuZ2V0QnVmZmVyKHZhbHVlKVxuICAgICAgICBpZiAoYnVmZmVyKSB7XG4gICAgICAgICAgcmVjb3JkLnN0YXRlID0gQVRUUklCX1NUQVRFX1BPSU5URVJcbiAgICAgICAgICByZWNvcmQuYnVmZmVyID0gYnVmZmVyXG4gICAgICAgICAgcmVjb3JkLnR5cGUgPSAwXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY2hlY2suY29tbWFuZCh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlLFxuICAgICAgICAgICAgJ2ludmFsaWQgZGF0YSBmb3IgYXR0cmlidXRlICcgKyBhdHRyaWJ1dGUsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgIGlmICh2YWx1ZS5jb25zdGFudCkge1xuICAgICAgICAgICAgdmFyIGNvbnN0YW50ID0gdmFsdWUuY29uc3RhbnRcbiAgICAgICAgICAgIHJlY29yZC5idWZmZXIgPSAnbnVsbCdcbiAgICAgICAgICAgIHJlY29yZC5zdGF0ZSA9IEFUVFJJQl9TVEFURV9DT05TVEFOVFxuICAgICAgICAgICAgaWYgKHR5cGVvZiBjb25zdGFudCA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgICAgcmVjb3JkLnggPSBjb25zdGFudFxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgY2hlY2suY29tbWFuZChcbiAgICAgICAgICAgICAgICBpc0FycmF5TGlrZShjb25zdGFudCkgJiZcbiAgICAgICAgICAgICAgICBjb25zdGFudC5sZW5ndGggPiAwICYmXG4gICAgICAgICAgICAgICAgY29uc3RhbnQubGVuZ3RoIDw9IDQsXG4gICAgICAgICAgICAgICAgJ2ludmFsaWQgY29uc3RhbnQgZm9yIGF0dHJpYnV0ZSAnICsgYXR0cmlidXRlLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgQ1VURV9DT01QT05FTlRTLmZvckVhY2goZnVuY3Rpb24gKGMsIGkpIHtcbiAgICAgICAgICAgICAgICBpZiAoaSA8IGNvbnN0YW50Lmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgcmVjb3JkW2NdID0gY29uc3RhbnRbaV1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmIChpc0J1ZmZlckFyZ3ModmFsdWUuYnVmZmVyKSkge1xuICAgICAgICAgICAgICBidWZmZXIgPSBidWZmZXJTdGF0ZS5nZXRCdWZmZXIoXG4gICAgICAgICAgICAgICAgYnVmZmVyU3RhdGUuY3JlYXRlKHZhbHVlLmJ1ZmZlciwgR0xfQVJSQVlfQlVGRkVSLCBmYWxzZSwgdHJ1ZSkpXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBidWZmZXIgPSBidWZmZXJTdGF0ZS5nZXRCdWZmZXIodmFsdWUuYnVmZmVyKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2hlY2suY29tbWFuZCghIWJ1ZmZlciwgJ21pc3NpbmcgYnVmZmVyIGZvciBhdHRyaWJ1dGUgXCInICsgYXR0cmlidXRlICsgJ1wiJywgZW52LmNvbW1hbmRTdHIpXG5cbiAgICAgICAgICAgIHZhciBvZmZzZXQgPSB2YWx1ZS5vZmZzZXQgfCAwXG4gICAgICAgICAgICBjaGVjay5jb21tYW5kKG9mZnNldCA+PSAwLFxuICAgICAgICAgICAgICAnaW52YWxpZCBvZmZzZXQgZm9yIGF0dHJpYnV0ZSBcIicgKyBhdHRyaWJ1dGUgKyAnXCInLCBlbnYuY29tbWFuZFN0cilcblxuICAgICAgICAgICAgdmFyIHN0cmlkZSA9IHZhbHVlLnN0cmlkZSB8IDBcbiAgICAgICAgICAgIGNoZWNrLmNvbW1hbmQoc3RyaWRlID49IDAgJiYgc3RyaWRlIDwgMjU2LFxuICAgICAgICAgICAgICAnaW52YWxpZCBzdHJpZGUgZm9yIGF0dHJpYnV0ZSBcIicgKyBhdHRyaWJ1dGUgKyAnXCIsIG11c3QgYmUgaW50ZWdlciBiZXR3ZWVlbiBbMCwgMjU1XScsIGVudi5jb21tYW5kU3RyKVxuXG4gICAgICAgICAgICB2YXIgc2l6ZSA9IHZhbHVlLnNpemUgfCAwXG4gICAgICAgICAgICBjaGVjay5jb21tYW5kKCEoJ3NpemUnIGluIHZhbHVlKSB8fCAoc2l6ZSA+IDAgJiYgc2l6ZSA8PSA0KSxcbiAgICAgICAgICAgICAgJ2ludmFsaWQgc2l6ZSBmb3IgYXR0cmlidXRlIFwiJyArIGF0dHJpYnV0ZSArICdcIiwgbXVzdCBiZSAxLDIsMyw0JywgZW52LmNvbW1hbmRTdHIpXG5cbiAgICAgICAgICAgIHZhciBub3JtYWxpemVkID0gISF2YWx1ZS5ub3JtYWxpemVkXG5cbiAgICAgICAgICAgIHZhciB0eXBlID0gMFxuICAgICAgICAgICAgaWYgKCd0eXBlJyBpbiB2YWx1ZSkge1xuICAgICAgICAgICAgICBjaGVjay5jb21tYW5kUGFyYW1ldGVyKFxuICAgICAgICAgICAgICAgIHZhbHVlLnR5cGUsIGdsVHlwZXMsXG4gICAgICAgICAgICAgICAgJ2ludmFsaWQgdHlwZSBmb3IgYXR0cmlidXRlICcgKyBhdHRyaWJ1dGUsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICB0eXBlID0gZ2xUeXBlc1t2YWx1ZS50eXBlXVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgZGl2aXNvciA9IHZhbHVlLmRpdmlzb3IgfCAwXG4gICAgICAgICAgICBpZiAoJ2Rpdmlzb3InIGluIHZhbHVlKSB7XG4gICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmQoZGl2aXNvciA9PT0gMCB8fCBleHRJbnN0YW5jaW5nLFxuICAgICAgICAgICAgICAgICdjYW5ub3Qgc3BlY2lmeSBkaXZpc29yIGZvciBhdHRyaWJ1dGUgXCInICsgYXR0cmlidXRlICsgJ1wiLCBpbnN0YW5jaW5nIG5vdCBzdXBwb3J0ZWQnLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgY2hlY2suY29tbWFuZChkaXZpc29yID49IDAsXG4gICAgICAgICAgICAgICAgJ2ludmFsaWQgZGl2aXNvciBmb3IgYXR0cmlidXRlIFwiJyArIGF0dHJpYnV0ZSArICdcIicsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgIHZhciBjb21tYW5kID0gZW52LmNvbW1hbmRTdHJcblxuICAgICAgICAgICAgICB2YXIgVkFMSURfS0VZUyA9IFtcbiAgICAgICAgICAgICAgICAnYnVmZmVyJyxcbiAgICAgICAgICAgICAgICAnb2Zmc2V0JyxcbiAgICAgICAgICAgICAgICAnZGl2aXNvcicsXG4gICAgICAgICAgICAgICAgJ25vcm1hbGl6ZWQnLFxuICAgICAgICAgICAgICAgICd0eXBlJyxcbiAgICAgICAgICAgICAgICAnc2l6ZScsXG4gICAgICAgICAgICAgICAgJ3N0cmlkZSdcbiAgICAgICAgICAgICAgXVxuXG4gICAgICAgICAgICAgIE9iamVjdC5rZXlzKHZhbHVlKS5mb3JFYWNoKGZ1bmN0aW9uIChwcm9wKSB7XG4gICAgICAgICAgICAgICAgY2hlY2suY29tbWFuZChcbiAgICAgICAgICAgICAgICAgIFZBTElEX0tFWVMuaW5kZXhPZihwcm9wKSA+PSAwLFxuICAgICAgICAgICAgICAgICAgJ3Vua25vd24gcGFyYW1ldGVyIFwiJyArIHByb3AgKyAnXCIgZm9yIGF0dHJpYnV0ZSBwb2ludGVyIFwiJyArIGF0dHJpYnV0ZSArICdcIiAodmFsaWQgcGFyYW1ldGVycyBhcmUgJyArIFZBTElEX0tFWVMgKyAnKScsXG4gICAgICAgICAgICAgICAgICBjb21tYW5kKVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfSlcblxuICAgICAgICAgICAgcmVjb3JkLmJ1ZmZlciA9IGJ1ZmZlclxuICAgICAgICAgICAgcmVjb3JkLnN0YXRlID0gQVRUUklCX1NUQVRFX1BPSU5URVJcbiAgICAgICAgICAgIHJlY29yZC5zaXplID0gc2l6ZVxuICAgICAgICAgICAgcmVjb3JkLm5vcm1hbGl6ZWQgPSBub3JtYWxpemVkXG4gICAgICAgICAgICByZWNvcmQudHlwZSA9IHR5cGUgfHwgYnVmZmVyLmR0eXBlXG4gICAgICAgICAgICByZWNvcmQub2Zmc2V0ID0gb2Zmc2V0XG4gICAgICAgICAgICByZWNvcmQuc3RyaWRlID0gc3RyaWRlXG4gICAgICAgICAgICByZWNvcmQuZGl2aXNvciA9IGRpdmlzb3JcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgYXR0cmlidXRlRGVmc1thdHRyaWJ1dGVdID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICB2YXIgY2FjaGUgPSBlbnYuYXR0cmliQ2FjaGVcbiAgICAgICAgaWYgKGlkIGluIGNhY2hlKSB7XG4gICAgICAgICAgcmV0dXJuIGNhY2hlW2lkXVxuICAgICAgICB9XG4gICAgICAgIHZhciByZXN1bHQgPSB7XG4gICAgICAgICAgaXNTdHJlYW06IGZhbHNlXG4gICAgICAgIH1cbiAgICAgICAgT2JqZWN0LmtleXMocmVjb3JkKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgICByZXN1bHRba2V5XSA9IHJlY29yZFtrZXldXG4gICAgICAgIH0pXG4gICAgICAgIGlmIChyZWNvcmQuYnVmZmVyKSB7XG4gICAgICAgICAgcmVzdWx0LmJ1ZmZlciA9IGVudi5saW5rKHJlY29yZC5idWZmZXIpXG4gICAgICAgICAgcmVzdWx0LnR5cGUgPSByZXN1bHQudHlwZSB8fCAocmVzdWx0LmJ1ZmZlciArICcuZHR5cGUnKVxuICAgICAgICB9XG4gICAgICAgIGNhY2hlW2lkXSA9IHJlc3VsdFxuICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBPYmplY3Qua2V5cyhkeW5hbWljQXR0cmlidXRlcykuZm9yRWFjaChmdW5jdGlvbiAoYXR0cmlidXRlKSB7XG4gICAgICB2YXIgZHluID0gZHluYW1pY0F0dHJpYnV0ZXNbYXR0cmlidXRlXVxuXG4gICAgICBmdW5jdGlvbiBhcHBlbmRBdHRyaWJ1dGVDb2RlIChlbnYsIGJsb2NrKSB7XG4gICAgICAgIHZhciBWQUxVRSA9IGVudi5pbnZva2UoYmxvY2ssIGR5bilcblxuICAgICAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuXG4gICAgICAgIHZhciBJU19CVUZGRVJfQVJHUyA9IHNoYXJlZC5pc0J1ZmZlckFyZ3NcbiAgICAgICAgdmFyIEJVRkZFUl9TVEFURSA9IHNoYXJlZC5idWZmZXJcblxuICAgICAgICAvLyBQZXJmb3JtIHZhbGlkYXRpb24gb24gYXR0cmlidXRlXG4gICAgICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBlbnYuYXNzZXJ0KGJsb2NrLFxuICAgICAgICAgICAgVkFMVUUgKyAnJiYodHlwZW9mICcgKyBWQUxVRSArICc9PT1cIm9iamVjdFwifHx0eXBlb2YgJyArXG4gICAgICAgICAgICBWQUxVRSArICc9PT1cImZ1bmN0aW9uXCIpJiYoJyArXG4gICAgICAgICAgICBJU19CVUZGRVJfQVJHUyArICcoJyArIFZBTFVFICsgJyl8fCcgK1xuICAgICAgICAgICAgQlVGRkVSX1NUQVRFICsgJy5nZXRCdWZmZXIoJyArIFZBTFVFICsgJyl8fCcgK1xuICAgICAgICAgICAgQlVGRkVSX1NUQVRFICsgJy5nZXRCdWZmZXIoJyArIFZBTFVFICsgJy5idWZmZXIpfHwnICtcbiAgICAgICAgICAgIElTX0JVRkZFUl9BUkdTICsgJygnICsgVkFMVUUgKyAnLmJ1ZmZlcil8fCcgK1xuICAgICAgICAgICAgJyhcImNvbnN0YW50XCIgaW4gJyArIFZBTFVFICtcbiAgICAgICAgICAgICcmJih0eXBlb2YgJyArIFZBTFVFICsgJy5jb25zdGFudD09PVwibnVtYmVyXCJ8fCcgK1xuICAgICAgICAgICAgc2hhcmVkLmlzQXJyYXlMaWtlICsgJygnICsgVkFMVUUgKyAnLmNvbnN0YW50KSkpKScsXG4gICAgICAgICAgICAnaW52YWxpZCBkeW5hbWljIGF0dHJpYnV0ZSBcIicgKyBhdHRyaWJ1dGUgKyAnXCInKVxuICAgICAgICB9KVxuXG4gICAgICAgIC8vIGFsbG9jYXRlIG5hbWVzIGZvciByZXN1bHRcbiAgICAgICAgdmFyIHJlc3VsdCA9IHtcbiAgICAgICAgICBpc1N0cmVhbTogYmxvY2suZGVmKGZhbHNlKVxuICAgICAgICB9XG4gICAgICAgIHZhciBkZWZhdWx0UmVjb3JkID0gbmV3IEF0dHJpYnV0ZVJlY29yZCgpXG4gICAgICAgIGRlZmF1bHRSZWNvcmQuc3RhdGUgPSBBVFRSSUJfU1RBVEVfUE9JTlRFUlxuICAgICAgICBPYmplY3Qua2V5cyhkZWZhdWx0UmVjb3JkKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgICByZXN1bHRba2V5XSA9IGJsb2NrLmRlZignJyArIGRlZmF1bHRSZWNvcmRba2V5XSlcbiAgICAgICAgfSlcblxuICAgICAgICB2YXIgQlVGRkVSID0gcmVzdWx0LmJ1ZmZlclxuICAgICAgICB2YXIgVFlQRSA9IHJlc3VsdC50eXBlXG4gICAgICAgIGJsb2NrKFxuICAgICAgICAgICdpZignLCBJU19CVUZGRVJfQVJHUywgJygnLCBWQUxVRSwgJykpeycsXG4gICAgICAgICAgcmVzdWx0LmlzU3RyZWFtLCAnPXRydWU7JyxcbiAgICAgICAgICBCVUZGRVIsICc9JywgQlVGRkVSX1NUQVRFLCAnLmNyZWF0ZVN0cmVhbSgnLCBHTF9BUlJBWV9CVUZGRVIsICcsJywgVkFMVUUsICcpOycsXG4gICAgICAgICAgVFlQRSwgJz0nLCBCVUZGRVIsICcuZHR5cGU7JyxcbiAgICAgICAgICAnfWVsc2V7JyxcbiAgICAgICAgICBCVUZGRVIsICc9JywgQlVGRkVSX1NUQVRFLCAnLmdldEJ1ZmZlcignLCBWQUxVRSwgJyk7JyxcbiAgICAgICAgICAnaWYoJywgQlVGRkVSLCAnKXsnLFxuICAgICAgICAgIFRZUEUsICc9JywgQlVGRkVSLCAnLmR0eXBlOycsXG4gICAgICAgICAgJ31lbHNlIGlmKFwiY29uc3RhbnRcIiBpbiAnLCBWQUxVRSwgJyl7JyxcbiAgICAgICAgICByZXN1bHQuc3RhdGUsICc9JywgQVRUUklCX1NUQVRFX0NPTlNUQU5ULCAnOycsXG4gICAgICAgICAgJ2lmKHR5cGVvZiAnICsgVkFMVUUgKyAnLmNvbnN0YW50ID09PSBcIm51bWJlclwiKXsnLFxuICAgICAgICAgIHJlc3VsdFtDVVRFX0NPTVBPTkVOVFNbMF1dLCAnPScsIFZBTFVFLCAnLmNvbnN0YW50OycsXG4gICAgICAgICAgQ1VURV9DT01QT05FTlRTLnNsaWNlKDEpLm1hcChmdW5jdGlvbiAobikge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdFtuXVxuICAgICAgICAgIH0pLmpvaW4oJz0nKSwgJz0wOycsXG4gICAgICAgICAgJ31lbHNleycsXG4gICAgICAgICAgQ1VURV9DT01QT05FTlRTLm1hcChmdW5jdGlvbiAobmFtZSwgaSkge1xuICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgcmVzdWx0W25hbWVdICsgJz0nICsgVkFMVUUgKyAnLmNvbnN0YW50Lmxlbmd0aD49JyArIGkgK1xuICAgICAgICAgICAgICAnPycgKyBWQUxVRSArICcuY29uc3RhbnRbJyArIGkgKyAnXTowOydcbiAgICAgICAgICAgIClcbiAgICAgICAgICB9KS5qb2luKCcnKSxcbiAgICAgICAgICAnfX1lbHNleycsXG4gICAgICAgICAgJ2lmKCcsIElTX0JVRkZFUl9BUkdTLCAnKCcsIFZBTFVFLCAnLmJ1ZmZlcikpeycsXG4gICAgICAgICAgQlVGRkVSLCAnPScsIEJVRkZFUl9TVEFURSwgJy5jcmVhdGVTdHJlYW0oJywgR0xfQVJSQVlfQlVGRkVSLCAnLCcsIFZBTFVFLCAnLmJ1ZmZlcik7JyxcbiAgICAgICAgICAnfWVsc2V7JyxcbiAgICAgICAgICBCVUZGRVIsICc9JywgQlVGRkVSX1NUQVRFLCAnLmdldEJ1ZmZlcignLCBWQUxVRSwgJy5idWZmZXIpOycsXG4gICAgICAgICAgJ30nLFxuICAgICAgICAgIFRZUEUsICc9XCJ0eXBlXCIgaW4gJywgVkFMVUUsICc/JyxcbiAgICAgICAgICBzaGFyZWQuZ2xUeXBlcywgJ1snLCBWQUxVRSwgJy50eXBlXTonLCBCVUZGRVIsICcuZHR5cGU7JyxcbiAgICAgICAgICByZXN1bHQubm9ybWFsaXplZCwgJz0hIScsIFZBTFVFLCAnLm5vcm1hbGl6ZWQ7JylcbiAgICAgICAgZnVuY3Rpb24gZW1pdFJlYWRSZWNvcmQgKG5hbWUpIHtcbiAgICAgICAgICBibG9jayhyZXN1bHRbbmFtZV0sICc9JywgVkFMVUUsICcuJywgbmFtZSwgJ3wwOycpXG4gICAgICAgIH1cbiAgICAgICAgZW1pdFJlYWRSZWNvcmQoJ3NpemUnKVxuICAgICAgICBlbWl0UmVhZFJlY29yZCgnb2Zmc2V0JylcbiAgICAgICAgZW1pdFJlYWRSZWNvcmQoJ3N0cmlkZScpXG4gICAgICAgIGVtaXRSZWFkUmVjb3JkKCdkaXZpc29yJylcblxuICAgICAgICBibG9jaygnfX0nKVxuXG4gICAgICAgIGJsb2NrLmV4aXQoXG4gICAgICAgICAgJ2lmKCcsIHJlc3VsdC5pc1N0cmVhbSwgJyl7JyxcbiAgICAgICAgICBCVUZGRVJfU1RBVEUsICcuZGVzdHJveVN0cmVhbSgnLCBCVUZGRVIsICcpOycsXG4gICAgICAgICAgJ30nKVxuXG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH1cblxuICAgICAgYXR0cmlidXRlRGVmc1thdHRyaWJ1dGVdID0gY3JlYXRlRHluYW1pY0RlY2woZHluLCBhcHBlbmRBdHRyaWJ1dGVDb2RlKVxuICAgIH0pXG5cbiAgICByZXR1cm4gYXR0cmlidXRlRGVmc1xuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VDb250ZXh0IChjb250ZXh0KSB7XG4gICAgdmFyIHN0YXRpY0NvbnRleHQgPSBjb250ZXh0LnN0YXRpY1xuICAgIHZhciBkeW5hbWljQ29udGV4dCA9IGNvbnRleHQuZHluYW1pY1xuICAgIHZhciByZXN1bHQgPSB7fVxuXG4gICAgT2JqZWN0LmtleXMoc3RhdGljQ29udGV4dCkuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgdmFyIHZhbHVlID0gc3RhdGljQ29udGV4dFtuYW1lXVxuICAgICAgcmVzdWx0W25hbWVdID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyB8fCB0eXBlb2YgdmFsdWUgPT09ICdib29sZWFuJykge1xuICAgICAgICAgIHJldHVybiAnJyArIHZhbHVlXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIGVudi5saW5rKHZhbHVlKVxuICAgICAgICB9XG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBPYmplY3Qua2V5cyhkeW5hbWljQ29udGV4dCkuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgdmFyIGR5biA9IGR5bmFtaWNDb250ZXh0W25hbWVdXG4gICAgICByZXN1bHRbbmFtZV0gPSBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgIHJldHVybiBlbnYuaW52b2tlKHNjb3BlLCBkeW4pXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICByZXR1cm4gcmVzdWx0XG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZUFyZ3VtZW50cyAob3B0aW9ucywgYXR0cmlidXRlcywgdW5pZm9ybXMsIGNvbnRleHQsIGVudikge1xuICAgIHZhciBzdGF0aWNPcHRpb25zID0gb3B0aW9ucy5zdGF0aWNcbiAgICB2YXIgZHluYW1pY09wdGlvbnMgPSBvcHRpb25zLmR5bmFtaWNcblxuICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBLRVlfTkFNRVMgPSBbXG4gICAgICAgIFNfRlJBTUVCVUZGRVIsXG4gICAgICAgIFNfVkVSVCxcbiAgICAgICAgU19GUkFHLFxuICAgICAgICBTX0VMRU1FTlRTLFxuICAgICAgICBTX1BSSU1JVElWRSxcbiAgICAgICAgU19PRkZTRVQsXG4gICAgICAgIFNfQ09VTlQsXG4gICAgICAgIFNfSU5TVEFOQ0VTLFxuICAgICAgICBTX1BST0ZJTEVcbiAgICAgIF0uY29uY2F0KEdMX1NUQVRFX05BTUVTKVxuXG4gICAgICBmdW5jdGlvbiBjaGVja0tleXMgKGRpY3QpIHtcbiAgICAgICAgT2JqZWN0LmtleXMoZGljdCkuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgICAgY2hlY2suY29tbWFuZChcbiAgICAgICAgICAgIEtFWV9OQU1FUy5pbmRleE9mKGtleSkgPj0gMCxcbiAgICAgICAgICAgICd1bmtub3duIHBhcmFtZXRlciBcIicgKyBrZXkgKyAnXCInLFxuICAgICAgICAgICAgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgIH0pXG4gICAgICB9XG5cbiAgICAgIGNoZWNrS2V5cyhzdGF0aWNPcHRpb25zKVxuICAgICAgY2hlY2tLZXlzKGR5bmFtaWNPcHRpb25zKVxuICAgIH0pXG5cbiAgICB2YXIgZnJhbWVidWZmZXIgPSBwYXJzZUZyYW1lYnVmZmVyKG9wdGlvbnMsIGVudilcbiAgICB2YXIgdmlld3BvcnRBbmRTY2lzc29yID0gcGFyc2VWaWV3cG9ydFNjaXNzb3Iob3B0aW9ucywgZnJhbWVidWZmZXIsIGVudilcbiAgICB2YXIgZHJhdyA9IHBhcnNlRHJhdyhvcHRpb25zLCBlbnYpXG4gICAgdmFyIHN0YXRlID0gcGFyc2VHTFN0YXRlKG9wdGlvbnMsIGVudilcbiAgICB2YXIgc2hhZGVyID0gcGFyc2VQcm9ncmFtKG9wdGlvbnMsIGVudilcblxuICAgIGZ1bmN0aW9uIGNvcHlCb3ggKG5hbWUpIHtcbiAgICAgIHZhciBkZWZuID0gdmlld3BvcnRBbmRTY2lzc29yW25hbWVdXG4gICAgICBpZiAoZGVmbikge1xuICAgICAgICBzdGF0ZVtuYW1lXSA9IGRlZm5cbiAgICAgIH1cbiAgICB9XG4gICAgY29weUJveChTX1ZJRVdQT1JUKVxuICAgIGNvcHlCb3gocHJvcE5hbWUoU19TQ0lTU09SX0JPWCkpXG5cbiAgICB2YXIgZGlydHkgPSBPYmplY3Qua2V5cyhzdGF0ZSkubGVuZ3RoID4gMFxuXG4gICAgdmFyIHJlc3VsdCA9IHtcbiAgICAgIGZyYW1lYnVmZmVyOiBmcmFtZWJ1ZmZlcixcbiAgICAgIGRyYXc6IGRyYXcsXG4gICAgICBzaGFkZXI6IHNoYWRlcixcbiAgICAgIHN0YXRlOiBzdGF0ZSxcbiAgICAgIGRpcnR5OiBkaXJ0eVxuICAgIH1cblxuICAgIHJlc3VsdC5wcm9maWxlID0gcGFyc2VQcm9maWxlKG9wdGlvbnMsIGVudilcbiAgICByZXN1bHQudW5pZm9ybXMgPSBwYXJzZVVuaWZvcm1zKHVuaWZvcm1zLCBlbnYpXG4gICAgcmVzdWx0LmF0dHJpYnV0ZXMgPSBwYXJzZUF0dHJpYnV0ZXMoYXR0cmlidXRlcywgZW52KVxuICAgIHJlc3VsdC5jb250ZXh0ID0gcGFyc2VDb250ZXh0KGNvbnRleHQsIGVudilcbiAgICByZXR1cm4gcmVzdWx0XG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIENPTU1PTiBVUERBVEUgRlVOQ1RJT05TXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgZnVuY3Rpb24gZW1pdENvbnRleHQgKGVudiwgc2NvcGUsIGNvbnRleHQpIHtcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuICAgIHZhciBDT05URVhUID0gc2hhcmVkLmNvbnRleHRcblxuICAgIHZhciBjb250ZXh0RW50ZXIgPSBlbnYuc2NvcGUoKVxuXG4gICAgT2JqZWN0LmtleXMoY29udGV4dCkuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgc2NvcGUuc2F2ZShDT05URVhULCAnLicgKyBuYW1lKVxuICAgICAgdmFyIGRlZm4gPSBjb250ZXh0W25hbWVdXG4gICAgICBjb250ZXh0RW50ZXIoQ09OVEVYVCwgJy4nLCBuYW1lLCAnPScsIGRlZm4uYXBwZW5kKGVudiwgc2NvcGUpLCAnOycpXG4gICAgfSlcblxuICAgIHNjb3BlKGNvbnRleHRFbnRlcilcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gQ09NTU9OIERSQVdJTkcgRlVOQ1RJT05TXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgZnVuY3Rpb24gZW1pdFBvbGxGcmFtZWJ1ZmZlciAoZW52LCBzY29wZSwgZnJhbWVidWZmZXIsIHNraXBDaGVjaykge1xuICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG5cbiAgICB2YXIgR0wgPSBzaGFyZWQuZ2xcbiAgICB2YXIgRlJBTUVCVUZGRVJfU1RBVEUgPSBzaGFyZWQuZnJhbWVidWZmZXJcbiAgICB2YXIgRVhUX0RSQVdfQlVGRkVSU1xuICAgIGlmIChleHREcmF3QnVmZmVycykge1xuICAgICAgRVhUX0RSQVdfQlVGRkVSUyA9IHNjb3BlLmRlZihzaGFyZWQuZXh0ZW5zaW9ucywgJy53ZWJnbF9kcmF3X2J1ZmZlcnMnKVxuICAgIH1cblxuICAgIHZhciBjb25zdGFudHMgPSBlbnYuY29uc3RhbnRzXG5cbiAgICB2YXIgRFJBV19CVUZGRVJTID0gY29uc3RhbnRzLmRyYXdCdWZmZXJcbiAgICB2YXIgQkFDS19CVUZGRVIgPSBjb25zdGFudHMuYmFja0J1ZmZlclxuXG4gICAgdmFyIE5FWFRcbiAgICBpZiAoZnJhbWVidWZmZXIpIHtcbiAgICAgIE5FWFQgPSBmcmFtZWJ1ZmZlci5hcHBlbmQoZW52LCBzY29wZSlcbiAgICB9IGVsc2Uge1xuICAgICAgTkVYVCA9IHNjb3BlLmRlZihGUkFNRUJVRkZFUl9TVEFURSwgJy5uZXh0JylcbiAgICB9XG5cbiAgICBpZiAoIXNraXBDaGVjaykge1xuICAgICAgc2NvcGUoJ2lmKCcsIE5FWFQsICchPT0nLCBGUkFNRUJVRkZFUl9TVEFURSwgJy5jdXIpeycpXG4gICAgfVxuICAgIHNjb3BlKFxuICAgICAgJ2lmKCcsIE5FWFQsICcpeycsXG4gICAgICBHTCwgJy5iaW5kRnJhbWVidWZmZXIoJywgR0xfRlJBTUVCVUZGRVIsICcsJywgTkVYVCwgJy5mcmFtZWJ1ZmZlcik7JylcbiAgICBpZiAoZXh0RHJhd0J1ZmZlcnMpIHtcbiAgICAgIHNjb3BlKEVYVF9EUkFXX0JVRkZFUlMsICcuZHJhd0J1ZmZlcnNXRUJHTCgnLFxuICAgICAgICBEUkFXX0JVRkZFUlMsICdbJywgTkVYVCwgJy5jb2xvckF0dGFjaG1lbnRzLmxlbmd0aF0pOycpXG4gICAgfVxuICAgIHNjb3BlKCd9ZWxzZXsnLFxuICAgICAgR0wsICcuYmluZEZyYW1lYnVmZmVyKCcsIEdMX0ZSQU1FQlVGRkVSLCAnLG51bGwpOycpXG4gICAgaWYgKGV4dERyYXdCdWZmZXJzKSB7XG4gICAgICBzY29wZShFWFRfRFJBV19CVUZGRVJTLCAnLmRyYXdCdWZmZXJzV0VCR0woJywgQkFDS19CVUZGRVIsICcpOycpXG4gICAgfVxuICAgIHNjb3BlKFxuICAgICAgJ30nLFxuICAgICAgRlJBTUVCVUZGRVJfU1RBVEUsICcuY3VyPScsIE5FWFQsICc7JylcbiAgICBpZiAoIXNraXBDaGVjaykge1xuICAgICAgc2NvcGUoJ30nKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGVtaXRQb2xsU3RhdGUgKGVudiwgc2NvcGUsIGFyZ3MpIHtcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuXG4gICAgdmFyIEdMID0gc2hhcmVkLmdsXG5cbiAgICB2YXIgQ1VSUkVOVF9WQVJTID0gZW52LmN1cnJlbnRcbiAgICB2YXIgTkVYVF9WQVJTID0gZW52Lm5leHRcbiAgICB2YXIgQ1VSUkVOVF9TVEFURSA9IHNoYXJlZC5jdXJyZW50XG4gICAgdmFyIE5FWFRfU1RBVEUgPSBzaGFyZWQubmV4dFxuXG4gICAgdmFyIGJsb2NrID0gZW52LmNvbmQoQ1VSUkVOVF9TVEFURSwgJy5kaXJ0eScpXG5cbiAgICBHTF9TVEFURV9OQU1FUy5mb3JFYWNoKGZ1bmN0aW9uIChwcm9wKSB7XG4gICAgICB2YXIgcGFyYW0gPSBwcm9wTmFtZShwcm9wKVxuICAgICAgaWYgKHBhcmFtIGluIGFyZ3Muc3RhdGUpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG5cbiAgICAgIHZhciBORVhULCBDVVJSRU5UXG4gICAgICBpZiAocGFyYW0gaW4gTkVYVF9WQVJTKSB7XG4gICAgICAgIE5FWFQgPSBORVhUX1ZBUlNbcGFyYW1dXG4gICAgICAgIENVUlJFTlQgPSBDVVJSRU5UX1ZBUlNbcGFyYW1dXG4gICAgICAgIHZhciBwYXJ0cyA9IGxvb3AoY3VycmVudFN0YXRlW3BhcmFtXS5sZW5ndGgsIGZ1bmN0aW9uIChpKSB7XG4gICAgICAgICAgcmV0dXJuIGJsb2NrLmRlZihORVhULCAnWycsIGksICddJylcbiAgICAgICAgfSlcbiAgICAgICAgYmxvY2soZW52LmNvbmQocGFydHMubWFwKGZ1bmN0aW9uIChwLCBpKSB7XG4gICAgICAgICAgcmV0dXJuIHAgKyAnIT09JyArIENVUlJFTlQgKyAnWycgKyBpICsgJ10nXG4gICAgICAgIH0pLmpvaW4oJ3x8JykpXG4gICAgICAgICAgLnRoZW4oXG4gICAgICAgICAgICBHTCwgJy4nLCBHTF9WQVJJQUJMRVNbcGFyYW1dLCAnKCcsIHBhcnRzLCAnKTsnLFxuICAgICAgICAgICAgcGFydHMubWFwKGZ1bmN0aW9uIChwLCBpKSB7XG4gICAgICAgICAgICAgIHJldHVybiBDVVJSRU5UICsgJ1snICsgaSArICddPScgKyBwXG4gICAgICAgICAgICB9KS5qb2luKCc7JyksICc7JykpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBORVhUID0gYmxvY2suZGVmKE5FWFRfU1RBVEUsICcuJywgcGFyYW0pXG4gICAgICAgIHZhciBpZnRlID0gZW52LmNvbmQoTkVYVCwgJyE9PScsIENVUlJFTlRfU1RBVEUsICcuJywgcGFyYW0pXG4gICAgICAgIGJsb2NrKGlmdGUpXG4gICAgICAgIGlmIChwYXJhbSBpbiBHTF9GTEFHUykge1xuICAgICAgICAgIGlmdGUoXG4gICAgICAgICAgICBlbnYuY29uZChORVhUKVxuICAgICAgICAgICAgICAgIC50aGVuKEdMLCAnLmVuYWJsZSgnLCBHTF9GTEFHU1twYXJhbV0sICcpOycpXG4gICAgICAgICAgICAgICAgLmVsc2UoR0wsICcuZGlzYWJsZSgnLCBHTF9GTEFHU1twYXJhbV0sICcpOycpLFxuICAgICAgICAgICAgQ1VSUkVOVF9TVEFURSwgJy4nLCBwYXJhbSwgJz0nLCBORVhULCAnOycpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWZ0ZShcbiAgICAgICAgICAgIEdMLCAnLicsIEdMX1ZBUklBQkxFU1twYXJhbV0sICcoJywgTkVYVCwgJyk7JyxcbiAgICAgICAgICAgIENVUlJFTlRfU1RBVEUsICcuJywgcGFyYW0sICc9JywgTkVYVCwgJzsnKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSlcbiAgICBpZiAoT2JqZWN0LmtleXMoYXJncy5zdGF0ZSkubGVuZ3RoID09PSAwKSB7XG4gICAgICBibG9jayhDVVJSRU5UX1NUQVRFLCAnLmRpcnR5PWZhbHNlOycpXG4gICAgfVxuICAgIHNjb3BlKGJsb2NrKVxuICB9XG5cbiAgZnVuY3Rpb24gZW1pdFNldE9wdGlvbnMgKGVudiwgc2NvcGUsIG9wdGlvbnMsIGZpbHRlcikge1xuICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgdmFyIENVUlJFTlRfVkFSUyA9IGVudi5jdXJyZW50XG4gICAgdmFyIENVUlJFTlRfU1RBVEUgPSBzaGFyZWQuY3VycmVudFxuICAgIHZhciBHTCA9IHNoYXJlZC5nbFxuICAgIHNvcnRTdGF0ZShPYmplY3Qua2V5cyhvcHRpb25zKSkuZm9yRWFjaChmdW5jdGlvbiAocGFyYW0pIHtcbiAgICAgIHZhciBkZWZuID0gb3B0aW9uc1twYXJhbV1cbiAgICAgIGlmIChmaWx0ZXIgJiYgIWZpbHRlcihkZWZuKSkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIHZhciB2YXJpYWJsZSA9IGRlZm4uYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgICBpZiAoR0xfRkxBR1NbcGFyYW1dKSB7XG4gICAgICAgIHZhciBmbGFnID0gR0xfRkxBR1NbcGFyYW1dXG4gICAgICAgIGlmIChpc1N0YXRpYyhkZWZuKSkge1xuICAgICAgICAgIGlmICh2YXJpYWJsZSkge1xuICAgICAgICAgICAgc2NvcGUoR0wsICcuZW5hYmxlKCcsIGZsYWcsICcpOycpXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNjb3BlKEdMLCAnLmRpc2FibGUoJywgZmxhZywgJyk7JylcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc2NvcGUoZW52LmNvbmQodmFyaWFibGUpXG4gICAgICAgICAgICAudGhlbihHTCwgJy5lbmFibGUoJywgZmxhZywgJyk7JylcbiAgICAgICAgICAgIC5lbHNlKEdMLCAnLmRpc2FibGUoJywgZmxhZywgJyk7JykpXG4gICAgICAgIH1cbiAgICAgICAgc2NvcGUoQ1VSUkVOVF9TVEFURSwgJy4nLCBwYXJhbSwgJz0nLCB2YXJpYWJsZSwgJzsnKVxuICAgICAgfSBlbHNlIGlmIChpc0FycmF5TGlrZSh2YXJpYWJsZSkpIHtcbiAgICAgICAgdmFyIENVUlJFTlQgPSBDVVJSRU5UX1ZBUlNbcGFyYW1dXG4gICAgICAgIHNjb3BlKFxuICAgICAgICAgIEdMLCAnLicsIEdMX1ZBUklBQkxFU1twYXJhbV0sICcoJywgdmFyaWFibGUsICcpOycsXG4gICAgICAgICAgdmFyaWFibGUubWFwKGZ1bmN0aW9uICh2LCBpKSB7XG4gICAgICAgICAgICByZXR1cm4gQ1VSUkVOVCArICdbJyArIGkgKyAnXT0nICsgdlxuICAgICAgICAgIH0pLmpvaW4oJzsnKSwgJzsnKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2NvcGUoXG4gICAgICAgICAgR0wsICcuJywgR0xfVkFSSUFCTEVTW3BhcmFtXSwgJygnLCB2YXJpYWJsZSwgJyk7JyxcbiAgICAgICAgICBDVVJSRU5UX1NUQVRFLCAnLicsIHBhcmFtLCAnPScsIHZhcmlhYmxlLCAnOycpXG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGluamVjdEV4dGVuc2lvbnMgKGVudiwgc2NvcGUpIHtcbiAgICBpZiAoZXh0SW5zdGFuY2luZykge1xuICAgICAgZW52Lmluc3RhbmNpbmcgPSBzY29wZS5kZWYoXG4gICAgICAgIGVudi5zaGFyZWQuZXh0ZW5zaW9ucywgJy5hbmdsZV9pbnN0YW5jZWRfYXJyYXlzJylcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBlbWl0UHJvZmlsZSAoZW52LCBzY29wZSwgYXJncywgdXNlU2NvcGUsIGluY3JlbWVudENvdW50ZXIpIHtcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuICAgIHZhciBTVEFUUyA9IGVudi5zdGF0c1xuICAgIHZhciBDVVJSRU5UX1NUQVRFID0gc2hhcmVkLmN1cnJlbnRcbiAgICB2YXIgVElNRVIgPSBzaGFyZWQudGltZXJcbiAgICB2YXIgcHJvZmlsZUFyZyA9IGFyZ3MucHJvZmlsZVxuXG4gICAgZnVuY3Rpb24gcGVyZkNvdW50ZXIgKCkge1xuICAgICAgaWYgKHR5cGVvZiBwZXJmb3JtYW5jZSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgcmV0dXJuICdEYXRlLm5vdygpJ1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuICdwZXJmb3JtYW5jZS5ub3coKSdcbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgQ1BVX1NUQVJULCBRVUVSWV9DT1VOVEVSXG4gICAgZnVuY3Rpb24gZW1pdFByb2ZpbGVTdGFydCAoYmxvY2spIHtcbiAgICAgIENQVV9TVEFSVCA9IHNjb3BlLmRlZigpXG4gICAgICBibG9jayhDUFVfU1RBUlQsICc9JywgcGVyZkNvdW50ZXIoKSwgJzsnKVxuICAgICAgaWYgKHR5cGVvZiBpbmNyZW1lbnRDb3VudGVyID09PSAnc3RyaW5nJykge1xuICAgICAgICBibG9jayhTVEFUUywgJy5jb3VudCs9JywgaW5jcmVtZW50Q291bnRlciwgJzsnKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYmxvY2soU1RBVFMsICcuY291bnQrKzsnKVxuICAgICAgfVxuICAgICAgaWYgKHRpbWVyKSB7XG4gICAgICAgIGlmICh1c2VTY29wZSkge1xuICAgICAgICAgIFFVRVJZX0NPVU5URVIgPSBzY29wZS5kZWYoKVxuICAgICAgICAgIGJsb2NrKFFVRVJZX0NPVU5URVIsICc9JywgVElNRVIsICcuZ2V0TnVtUGVuZGluZ1F1ZXJpZXMoKTsnKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGJsb2NrKFRJTUVSLCAnLmJlZ2luUXVlcnkoJywgU1RBVFMsICcpOycpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBlbWl0UHJvZmlsZUVuZCAoYmxvY2spIHtcbiAgICAgIGJsb2NrKFNUQVRTLCAnLmNwdVRpbWUrPScsIHBlcmZDb3VudGVyKCksICctJywgQ1BVX1NUQVJULCAnOycpXG4gICAgICBpZiAodGltZXIpIHtcbiAgICAgICAgaWYgKHVzZVNjb3BlKSB7XG4gICAgICAgICAgYmxvY2soVElNRVIsICcucHVzaFNjb3BlU3RhdHMoJyxcbiAgICAgICAgICAgIFFVRVJZX0NPVU5URVIsICcsJyxcbiAgICAgICAgICAgIFRJTUVSLCAnLmdldE51bVBlbmRpbmdRdWVyaWVzKCksJyxcbiAgICAgICAgICAgIFNUQVRTLCAnKTsnKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGJsb2NrKFRJTUVSLCAnLmVuZFF1ZXJ5KCk7JylcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHNjb3BlUHJvZmlsZSAodmFsdWUpIHtcbiAgICAgIHZhciBwcmV2ID0gc2NvcGUuZGVmKENVUlJFTlRfU1RBVEUsICcucHJvZmlsZScpXG4gICAgICBzY29wZShDVVJSRU5UX1NUQVRFLCAnLnByb2ZpbGU9JywgdmFsdWUsICc7JylcbiAgICAgIHNjb3BlLmV4aXQoQ1VSUkVOVF9TVEFURSwgJy5wcm9maWxlPScsIHByZXYsICc7JylcbiAgICB9XG5cbiAgICB2YXIgVVNFX1BST0ZJTEVcbiAgICBpZiAocHJvZmlsZUFyZykge1xuICAgICAgaWYgKGlzU3RhdGljKHByb2ZpbGVBcmcpKSB7XG4gICAgICAgIGlmIChwcm9maWxlQXJnLmVuYWJsZSkge1xuICAgICAgICAgIGVtaXRQcm9maWxlU3RhcnQoc2NvcGUpXG4gICAgICAgICAgZW1pdFByb2ZpbGVFbmQoc2NvcGUuZXhpdClcbiAgICAgICAgICBzY29wZVByb2ZpbGUoJ3RydWUnKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHNjb3BlUHJvZmlsZSgnZmFsc2UnKVxuICAgICAgICB9XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgVVNFX1BST0ZJTEUgPSBwcm9maWxlQXJnLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgc2NvcGVQcm9maWxlKFVTRV9QUk9GSUxFKVxuICAgIH0gZWxzZSB7XG4gICAgICBVU0VfUFJPRklMRSA9IHNjb3BlLmRlZihDVVJSRU5UX1NUQVRFLCAnLnByb2ZpbGUnKVxuICAgIH1cblxuICAgIHZhciBzdGFydCA9IGVudi5ibG9jaygpXG4gICAgZW1pdFByb2ZpbGVTdGFydChzdGFydClcbiAgICBzY29wZSgnaWYoJywgVVNFX1BST0ZJTEUsICcpeycsIHN0YXJ0LCAnfScpXG4gICAgdmFyIGVuZCA9IGVudi5ibG9jaygpXG4gICAgZW1pdFByb2ZpbGVFbmQoZW5kKVxuICAgIHNjb3BlLmV4aXQoJ2lmKCcsIFVTRV9QUk9GSUxFLCAnKXsnLCBlbmQsICd9JylcbiAgfVxuXG4gIGZ1bmN0aW9uIGVtaXRBdHRyaWJ1dGVzIChlbnYsIHNjb3BlLCBhcmdzLCBhdHRyaWJ1dGVzLCBmaWx0ZXIpIHtcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuXG4gICAgZnVuY3Rpb24gdHlwZUxlbmd0aCAoeCkge1xuICAgICAgc3dpdGNoICh4KSB7XG4gICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDMjpcbiAgICAgICAgY2FzZSBHTF9JTlRfVkVDMjpcbiAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzI6XG4gICAgICAgICAgcmV0dXJuIDJcbiAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUMzOlxuICAgICAgICBjYXNlIEdMX0lOVF9WRUMzOlxuICAgICAgICBjYXNlIEdMX0JPT0xfVkVDMzpcbiAgICAgICAgICByZXR1cm4gM1xuICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzQ6XG4gICAgICAgIGNhc2UgR0xfSU5UX1ZFQzQ6XG4gICAgICAgIGNhc2UgR0xfQk9PTF9WRUM0OlxuICAgICAgICAgIHJldHVybiA0XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgcmV0dXJuIDFcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBlbWl0QmluZEF0dHJpYnV0ZSAoQVRUUklCVVRFLCBzaXplLCByZWNvcmQpIHtcbiAgICAgIHZhciBHTCA9IHNoYXJlZC5nbFxuXG4gICAgICB2YXIgTE9DQVRJT04gPSBzY29wZS5kZWYoQVRUUklCVVRFLCAnLmxvY2F0aW9uJylcbiAgICAgIHZhciBCSU5ESU5HID0gc2NvcGUuZGVmKHNoYXJlZC5hdHRyaWJ1dGVzLCAnWycsIExPQ0FUSU9OLCAnXScpXG5cbiAgICAgIHZhciBTVEFURSA9IHJlY29yZC5zdGF0ZVxuICAgICAgdmFyIEJVRkZFUiA9IHJlY29yZC5idWZmZXJcbiAgICAgIHZhciBDT05TVF9DT01QT05FTlRTID0gW1xuICAgICAgICByZWNvcmQueCxcbiAgICAgICAgcmVjb3JkLnksXG4gICAgICAgIHJlY29yZC56LFxuICAgICAgICByZWNvcmQud1xuICAgICAgXVxuXG4gICAgICB2YXIgQ09NTU9OX0tFWVMgPSBbXG4gICAgICAgICdidWZmZXInLFxuICAgICAgICAnbm9ybWFsaXplZCcsXG4gICAgICAgICdvZmZzZXQnLFxuICAgICAgICAnc3RyaWRlJ1xuICAgICAgXVxuXG4gICAgICBmdW5jdGlvbiBlbWl0QnVmZmVyICgpIHtcbiAgICAgICAgc2NvcGUoXG4gICAgICAgICAgJ2lmKCEnLCBCSU5ESU5HLCAnLmJ1ZmZlcil7JyxcbiAgICAgICAgICBHTCwgJy5lbmFibGVWZXJ0ZXhBdHRyaWJBcnJheSgnLCBMT0NBVElPTiwgJyk7fScpXG5cbiAgICAgICAgdmFyIFRZUEUgPSByZWNvcmQudHlwZVxuICAgICAgICB2YXIgU0laRVxuICAgICAgICBpZiAoIXJlY29yZC5zaXplKSB7XG4gICAgICAgICAgU0laRSA9IHNpemVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBTSVpFID0gc2NvcGUuZGVmKHJlY29yZC5zaXplLCAnfHwnLCBzaXplKVxuICAgICAgICB9XG5cbiAgICAgICAgc2NvcGUoJ2lmKCcsXG4gICAgICAgICAgQklORElORywgJy50eXBlIT09JywgVFlQRSwgJ3x8JyxcbiAgICAgICAgICBCSU5ESU5HLCAnLnNpemUhPT0nLCBTSVpFLCAnfHwnLFxuICAgICAgICAgIENPTU1PTl9LRVlTLm1hcChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgICAgICByZXR1cm4gQklORElORyArICcuJyArIGtleSArICchPT0nICsgcmVjb3JkW2tleV1cbiAgICAgICAgICB9KS5qb2luKCd8fCcpLFxuICAgICAgICAgICcpeycsXG4gICAgICAgICAgR0wsICcuYmluZEJ1ZmZlcignLCBHTF9BUlJBWV9CVUZGRVIsICcsJywgQlVGRkVSLCAnLmJ1ZmZlcik7JyxcbiAgICAgICAgICBHTCwgJy52ZXJ0ZXhBdHRyaWJQb2ludGVyKCcsIFtcbiAgICAgICAgICAgIExPQ0FUSU9OLFxuICAgICAgICAgICAgU0laRSxcbiAgICAgICAgICAgIFRZUEUsXG4gICAgICAgICAgICByZWNvcmQubm9ybWFsaXplZCxcbiAgICAgICAgICAgIHJlY29yZC5zdHJpZGUsXG4gICAgICAgICAgICByZWNvcmQub2Zmc2V0XG4gICAgICAgICAgXSwgJyk7JyxcbiAgICAgICAgICBCSU5ESU5HLCAnLnR5cGU9JywgVFlQRSwgJzsnLFxuICAgICAgICAgIEJJTkRJTkcsICcuc2l6ZT0nLCBTSVpFLCAnOycsXG4gICAgICAgICAgQ09NTU9OX0tFWVMubWFwKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgICAgIHJldHVybiBCSU5ESU5HICsgJy4nICsga2V5ICsgJz0nICsgcmVjb3JkW2tleV0gKyAnOydcbiAgICAgICAgICB9KS5qb2luKCcnKSxcbiAgICAgICAgICAnfScpXG5cbiAgICAgICAgaWYgKGV4dEluc3RhbmNpbmcpIHtcbiAgICAgICAgICB2YXIgRElWSVNPUiA9IHJlY29yZC5kaXZpc29yXG4gICAgICAgICAgc2NvcGUoXG4gICAgICAgICAgICAnaWYoJywgQklORElORywgJy5kaXZpc29yIT09JywgRElWSVNPUiwgJyl7JyxcbiAgICAgICAgICAgIGVudi5pbnN0YW5jaW5nLCAnLnZlcnRleEF0dHJpYkRpdmlzb3JBTkdMRSgnLCBbTE9DQVRJT04sIERJVklTT1JdLCAnKTsnLFxuICAgICAgICAgICAgQklORElORywgJy5kaXZpc29yPScsIERJVklTT1IsICc7fScpXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgZnVuY3Rpb24gZW1pdENvbnN0YW50ICgpIHtcbiAgICAgICAgc2NvcGUoXG4gICAgICAgICAgJ2lmKCcsIEJJTkRJTkcsICcuYnVmZmVyKXsnLFxuICAgICAgICAgIEdMLCAnLmRpc2FibGVWZXJ0ZXhBdHRyaWJBcnJheSgnLCBMT0NBVElPTiwgJyk7JyxcbiAgICAgICAgICAnfWlmKCcsIENVVEVfQ09NUE9ORU5UUy5tYXAoZnVuY3Rpb24gKGMsIGkpIHtcbiAgICAgICAgICAgIHJldHVybiBCSU5ESU5HICsgJy4nICsgYyArICchPT0nICsgQ09OU1RfQ09NUE9ORU5UU1tpXVxuICAgICAgICAgIH0pLmpvaW4oJ3x8JyksICcpeycsXG4gICAgICAgICAgR0wsICcudmVydGV4QXR0cmliNGYoJywgTE9DQVRJT04sICcsJywgQ09OU1RfQ09NUE9ORU5UUywgJyk7JyxcbiAgICAgICAgICBDVVRFX0NPTVBPTkVOVFMubWFwKGZ1bmN0aW9uIChjLCBpKSB7XG4gICAgICAgICAgICByZXR1cm4gQklORElORyArICcuJyArIGMgKyAnPScgKyBDT05TVF9DT01QT05FTlRTW2ldICsgJzsnXG4gICAgICAgICAgfSkuam9pbignJyksXG4gICAgICAgICAgJ30nKVxuICAgICAgfVxuXG4gICAgICBpZiAoU1RBVEUgPT09IEFUVFJJQl9TVEFURV9QT0lOVEVSKSB7XG4gICAgICAgIGVtaXRCdWZmZXIoKVxuICAgICAgfSBlbHNlIGlmIChTVEFURSA9PT0gQVRUUklCX1NUQVRFX0NPTlNUQU5UKSB7XG4gICAgICAgIGVtaXRDb25zdGFudCgpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzY29wZSgnaWYoJywgU1RBVEUsICc9PT0nLCBBVFRSSUJfU1RBVEVfUE9JTlRFUiwgJyl7JylcbiAgICAgICAgZW1pdEJ1ZmZlcigpXG4gICAgICAgIHNjb3BlKCd9ZWxzZXsnKVxuICAgICAgICBlbWl0Q29uc3RhbnQoKVxuICAgICAgICBzY29wZSgnfScpXG4gICAgICB9XG4gICAgfVxuXG4gICAgYXR0cmlidXRlcy5mb3JFYWNoKGZ1bmN0aW9uIChhdHRyaWJ1dGUpIHtcbiAgICAgIHZhciBuYW1lID0gYXR0cmlidXRlLm5hbWVcbiAgICAgIHZhciBhcmcgPSBhcmdzLmF0dHJpYnV0ZXNbbmFtZV1cbiAgICAgIHZhciByZWNvcmRcbiAgICAgIGlmIChhcmcpIHtcbiAgICAgICAgaWYgKCFmaWx0ZXIoYXJnKSkge1xuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG4gICAgICAgIHJlY29yZCA9IGFyZy5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmICghZmlsdGVyKFNDT1BFX0RFQ0wpKSB7XG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cbiAgICAgICAgdmFyIHNjb3BlQXR0cmliID0gZW52LnNjb3BlQXR0cmliKG5hbWUpXG4gICAgICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxuICAgICAgICAgICAgc2NvcGVBdHRyaWIgKyAnLnN0YXRlJyxcbiAgICAgICAgICAgICdtaXNzaW5nIGF0dHJpYnV0ZSAnICsgbmFtZSlcbiAgICAgICAgfSlcbiAgICAgICAgcmVjb3JkID0ge31cbiAgICAgICAgT2JqZWN0LmtleXMobmV3IEF0dHJpYnV0ZVJlY29yZCgpKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgICByZWNvcmRba2V5XSA9IHNjb3BlLmRlZihzY29wZUF0dHJpYiwgJy4nLCBrZXkpXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgICBlbWl0QmluZEF0dHJpYnV0ZShcbiAgICAgICAgZW52LmxpbmsoYXR0cmlidXRlKSwgdHlwZUxlbmd0aChhdHRyaWJ1dGUuaW5mby50eXBlKSwgcmVjb3JkKVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiBlbWl0VW5pZm9ybXMgKGVudiwgc2NvcGUsIGFyZ3MsIHVuaWZvcm1zLCBmaWx0ZXIpIHtcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuICAgIHZhciBHTCA9IHNoYXJlZC5nbFxuXG4gICAgdmFyIGluZml4XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB1bmlmb3Jtcy5sZW5ndGg7ICsraSkge1xuICAgICAgdmFyIHVuaWZvcm0gPSB1bmlmb3Jtc1tpXVxuICAgICAgdmFyIG5hbWUgPSB1bmlmb3JtLm5hbWVcbiAgICAgIHZhciB0eXBlID0gdW5pZm9ybS5pbmZvLnR5cGVcbiAgICAgIHZhciBhcmcgPSBhcmdzLnVuaWZvcm1zW25hbWVdXG4gICAgICB2YXIgVU5JRk9STSA9IGVudi5saW5rKHVuaWZvcm0pXG4gICAgICB2YXIgTE9DQVRJT04gPSBVTklGT1JNICsgJy5sb2NhdGlvbidcblxuICAgICAgdmFyIFZBTFVFXG4gICAgICBpZiAoYXJnKSB7XG4gICAgICAgIGlmICghZmlsdGVyKGFyZykpIHtcbiAgICAgICAgICBjb250aW51ZVxuICAgICAgICB9XG4gICAgICAgIGlmIChpc1N0YXRpYyhhcmcpKSB7XG4gICAgICAgICAgdmFyIHZhbHVlID0gYXJnLnZhbHVlXG4gICAgICAgICAgY2hlY2suY29tbWFuZChcbiAgICAgICAgICAgIHZhbHVlICE9PSBudWxsICYmIHR5cGVvZiB2YWx1ZSAhPT0gJ3VuZGVmaW5lZCcsXG4gICAgICAgICAgICAnbWlzc2luZyB1bmlmb3JtIFwiJyArIG5hbWUgKyAnXCInLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICBpZiAodHlwZSA9PT0gR0xfU0FNUExFUl8yRCB8fCB0eXBlID09PSBHTF9TQU1QTEVSX0NVQkUpIHtcbiAgICAgICAgICAgIGNoZWNrLmNvbW1hbmQoXG4gICAgICAgICAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgICAgICAgICAoKHR5cGUgPT09IEdMX1NBTVBMRVJfMkQgJiZcbiAgICAgICAgICAgICAgICAodmFsdWUuX3JlZ2xUeXBlID09PSAndGV4dHVyZTJkJyB8fFxuICAgICAgICAgICAgICAgIHZhbHVlLl9yZWdsVHlwZSA9PT0gJ2ZyYW1lYnVmZmVyJykpIHx8XG4gICAgICAgICAgICAgICh0eXBlID09PSBHTF9TQU1QTEVSX0NVQkUgJiZcbiAgICAgICAgICAgICAgICAodmFsdWUuX3JlZ2xUeXBlID09PSAndGV4dHVyZUN1YmUnIHx8XG4gICAgICAgICAgICAgICAgdmFsdWUuX3JlZ2xUeXBlID09PSAnZnJhbWVidWZmZXJDdWJlJykpKSxcbiAgICAgICAgICAgICAgJ2ludmFsaWQgdGV4dHVyZSBmb3IgdW5pZm9ybSAnICsgbmFtZSwgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICB2YXIgVEVYX1ZBTFVFID0gZW52LmxpbmsodmFsdWUuX3RleHR1cmUgfHwgdmFsdWUuY29sb3JbMF0uX3RleHR1cmUpXG4gICAgICAgICAgICBzY29wZShHTCwgJy51bmlmb3JtMWkoJywgTE9DQVRJT04sICcsJywgVEVYX1ZBTFVFICsgJy5iaW5kKCkpOycpXG4gICAgICAgICAgICBzY29wZS5leGl0KFRFWF9WQUxVRSwgJy51bmJpbmQoKTsnKVxuICAgICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAgICB0eXBlID09PSBHTF9GTE9BVF9NQVQyIHx8XG4gICAgICAgICAgICB0eXBlID09PSBHTF9GTE9BVF9NQVQzIHx8XG4gICAgICAgICAgICB0eXBlID09PSBHTF9GTE9BVF9NQVQ0KSB7XG4gICAgICAgICAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmQoaXNBcnJheUxpa2UodmFsdWUpLFxuICAgICAgICAgICAgICAgICdpbnZhbGlkIG1hdHJpeCBmb3IgdW5pZm9ybSAnICsgbmFtZSwgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmQoXG4gICAgICAgICAgICAgICAgKHR5cGUgPT09IEdMX0ZMT0FUX01BVDIgJiYgdmFsdWUubGVuZ3RoID09PSA0KSB8fFxuICAgICAgICAgICAgICAgICh0eXBlID09PSBHTF9GTE9BVF9NQVQzICYmIHZhbHVlLmxlbmd0aCA9PT0gOSkgfHxcbiAgICAgICAgICAgICAgICAodHlwZSA9PT0gR0xfRkxPQVRfTUFUNCAmJiB2YWx1ZS5sZW5ndGggPT09IDE2KSxcbiAgICAgICAgICAgICAgICAnaW52YWxpZCBsZW5ndGggZm9yIG1hdHJpeCB1bmlmb3JtICcgKyBuYW1lLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB2YXIgTUFUX1ZBTFVFID0gZW52Lmdsb2JhbC5kZWYoJ25ldyBGbG9hdDMyQXJyYXkoWycgK1xuICAgICAgICAgICAgICBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbCh2YWx1ZSkgKyAnXSknKVxuICAgICAgICAgICAgdmFyIGRpbSA9IDJcbiAgICAgICAgICAgIGlmICh0eXBlID09PSBHTF9GTE9BVF9NQVQzKSB7XG4gICAgICAgICAgICAgIGRpbSA9IDNcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gR0xfRkxPQVRfTUFUNCkge1xuICAgICAgICAgICAgICBkaW0gPSA0XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzY29wZShcbiAgICAgICAgICAgICAgR0wsICcudW5pZm9ybU1hdHJpeCcsIGRpbSwgJ2Z2KCcsXG4gICAgICAgICAgICAgIExPQ0FUSU9OLCAnLGZhbHNlLCcsIE1BVF9WQUxVRSwgJyk7JylcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICAgICAgICAgIGNhc2UgR0xfRkxPQVQ6XG4gICAgICAgICAgICAgICAgY2hlY2suY29tbWFuZFR5cGUodmFsdWUsICdudW1iZXInLCAndW5pZm9ybSAnICsgbmFtZSwgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgICAgaW5maXggPSAnMWYnXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUMyOlxuICAgICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmQoXG4gICAgICAgICAgICAgICAgICBpc0FycmF5TGlrZSh2YWx1ZSkgJiYgdmFsdWUubGVuZ3RoID09PSAyLFxuICAgICAgICAgICAgICAgICAgJ3VuaWZvcm0gJyArIG5hbWUsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICAgIGluZml4ID0gJzJmJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDMzpcbiAgICAgICAgICAgICAgICBjaGVjay5jb21tYW5kKFxuICAgICAgICAgICAgICAgICAgaXNBcnJheUxpa2UodmFsdWUpICYmIHZhbHVlLmxlbmd0aCA9PT0gMyxcbiAgICAgICAgICAgICAgICAgICd1bmlmb3JtICcgKyBuYW1lLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICczZidcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzQ6XG4gICAgICAgICAgICAgICAgY2hlY2suY29tbWFuZChcbiAgICAgICAgICAgICAgICAgIGlzQXJyYXlMaWtlKHZhbHVlKSAmJiB2YWx1ZS5sZW5ndGggPT09IDQsXG4gICAgICAgICAgICAgICAgICAndW5pZm9ybSAnICsgbmFtZSwgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgICAgaW5maXggPSAnNGYnXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9CT09MOlxuICAgICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmRUeXBlKHZhbHVlLCAnYm9vbGVhbicsICd1bmlmb3JtICcgKyBuYW1lLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICcxaSdcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0lOVDpcbiAgICAgICAgICAgICAgICBjaGVjay5jb21tYW5kVHlwZSh2YWx1ZSwgJ251bWJlcicsICd1bmlmb3JtICcgKyBuYW1lLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICcxaSdcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0JPT0xfVkVDMjpcbiAgICAgICAgICAgICAgICBjaGVjay5jb21tYW5kKFxuICAgICAgICAgICAgICAgICAgaXNBcnJheUxpa2UodmFsdWUpICYmIHZhbHVlLmxlbmd0aCA9PT0gMixcbiAgICAgICAgICAgICAgICAgICd1bmlmb3JtICcgKyBuYW1lLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICcyaSdcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0lOVF9WRUMyOlxuICAgICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmQoXG4gICAgICAgICAgICAgICAgICBpc0FycmF5TGlrZSh2YWx1ZSkgJiYgdmFsdWUubGVuZ3RoID09PSAyLFxuICAgICAgICAgICAgICAgICAgJ3VuaWZvcm0gJyArIG5hbWUsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICAgIGluZml4ID0gJzJpJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfQk9PTF9WRUMzOlxuICAgICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmQoXG4gICAgICAgICAgICAgICAgICBpc0FycmF5TGlrZSh2YWx1ZSkgJiYgdmFsdWUubGVuZ3RoID09PSAzLFxuICAgICAgICAgICAgICAgICAgJ3VuaWZvcm0gJyArIG5hbWUsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICAgIGluZml4ID0gJzNpJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfSU5UX1ZFQzM6XG4gICAgICAgICAgICAgICAgY2hlY2suY29tbWFuZChcbiAgICAgICAgICAgICAgICAgIGlzQXJyYXlMaWtlKHZhbHVlKSAmJiB2YWx1ZS5sZW5ndGggPT09IDMsXG4gICAgICAgICAgICAgICAgICAndW5pZm9ybSAnICsgbmFtZSwgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgICAgaW5maXggPSAnM2knXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzQ6XG4gICAgICAgICAgICAgICAgY2hlY2suY29tbWFuZChcbiAgICAgICAgICAgICAgICAgIGlzQXJyYXlMaWtlKHZhbHVlKSAmJiB2YWx1ZS5sZW5ndGggPT09IDQsXG4gICAgICAgICAgICAgICAgICAndW5pZm9ybSAnICsgbmFtZSwgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgICAgaW5maXggPSAnNGknXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9JTlRfVkVDNDpcbiAgICAgICAgICAgICAgICBjaGVjay5jb21tYW5kKFxuICAgICAgICAgICAgICAgICAgaXNBcnJheUxpa2UodmFsdWUpICYmIHZhbHVlLmxlbmd0aCA9PT0gNCxcbiAgICAgICAgICAgICAgICAgICd1bmlmb3JtICcgKyBuYW1lLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICc0aSdcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc2NvcGUoR0wsICcudW5pZm9ybScsIGluZml4LCAnKCcsIExPQ0FUSU9OLCAnLCcsXG4gICAgICAgICAgICAgIGlzQXJyYXlMaWtlKHZhbHVlKSA/IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKHZhbHVlKSA6IHZhbHVlLFxuICAgICAgICAgICAgICAnKTsnKVxuICAgICAgICAgIH1cbiAgICAgICAgICBjb250aW51ZVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIFZBTFVFID0gYXJnLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoIWZpbHRlcihTQ09QRV9ERUNMKSkge1xuICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgIH1cbiAgICAgICAgVkFMVUUgPSBzY29wZS5kZWYoc2hhcmVkLnVuaWZvcm1zLCAnWycsIHN0cmluZ1N0b3JlLmlkKG5hbWUpLCAnXScpXG4gICAgICB9XG5cbiAgICAgIGlmICh0eXBlID09PSBHTF9TQU1QTEVSXzJEKSB7XG4gICAgICAgIHNjb3BlKFxuICAgICAgICAgICdpZignLCBWQUxVRSwgJyYmJywgVkFMVUUsICcuX3JlZ2xUeXBlPT09XCJmcmFtZWJ1ZmZlclwiKXsnLFxuICAgICAgICAgIFZBTFVFLCAnPScsIFZBTFVFLCAnLmNvbG9yWzBdOycsXG4gICAgICAgICAgJ30nKVxuICAgICAgfSBlbHNlIGlmICh0eXBlID09PSBHTF9TQU1QTEVSX0NVQkUpIHtcbiAgICAgICAgc2NvcGUoXG4gICAgICAgICAgJ2lmKCcsIFZBTFVFLCAnJiYnLCBWQUxVRSwgJy5fcmVnbFR5cGU9PT1cImZyYW1lYnVmZmVyQ3ViZVwiKXsnLFxuICAgICAgICAgIFZBTFVFLCAnPScsIFZBTFVFLCAnLmNvbG9yWzBdOycsXG4gICAgICAgICAgJ30nKVxuICAgICAgfVxuXG4gICAgICAvLyBwZXJmb3JtIHR5cGUgdmFsaWRhdGlvblxuICAgICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICBmdW5jdGlvbiBjaGVjayAocHJlZCwgbWVzc2FnZSkge1xuICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsIHByZWQsXG4gICAgICAgICAgICAnYmFkIGRhdGEgb3IgbWlzc2luZyBmb3IgdW5pZm9ybSBcIicgKyBuYW1lICsgJ1wiLiAgJyArIG1lc3NhZ2UpXG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBjaGVja1R5cGUgKHR5cGUpIHtcbiAgICAgICAgICBjaGVjayhcbiAgICAgICAgICAgICd0eXBlb2YgJyArIFZBTFVFICsgJz09PVwiJyArIHR5cGUgKyAnXCInLFxuICAgICAgICAgICAgJ2ludmFsaWQgdHlwZSwgZXhwZWN0ZWQgJyArIHR5cGUpXG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBjaGVja1ZlY3RvciAobiwgdHlwZSkge1xuICAgICAgICAgIGNoZWNrKFxuICAgICAgICAgICAgc2hhcmVkLmlzQXJyYXlMaWtlICsgJygnICsgVkFMVUUgKyAnKSYmJyArIFZBTFVFICsgJy5sZW5ndGg9PT0nICsgbixcbiAgICAgICAgICAgICdpbnZhbGlkIHZlY3Rvciwgc2hvdWxkIGhhdmUgbGVuZ3RoICcgKyBuLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGNoZWNrVGV4dHVyZSAodGFyZ2V0KSB7XG4gICAgICAgICAgY2hlY2soXG4gICAgICAgICAgICAndHlwZW9mICcgKyBWQUxVRSArICc9PT1cImZ1bmN0aW9uXCImJicgK1xuICAgICAgICAgICAgVkFMVUUgKyAnLl9yZWdsVHlwZT09PVwidGV4dHVyZScgK1xuICAgICAgICAgICAgKHRhcmdldCA9PT0gR0xfVEVYVFVSRV8yRCA/ICcyZCcgOiAnQ3ViZScpICsgJ1wiJyxcbiAgICAgICAgICAgICdpbnZhbGlkIHRleHR1cmUgdHlwZScsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICB9XG5cbiAgICAgICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICAgICAgY2FzZSBHTF9JTlQ6XG4gICAgICAgICAgICBjaGVja1R5cGUoJ251bWJlcicpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgR0xfSU5UX1ZFQzI6XG4gICAgICAgICAgICBjaGVja1ZlY3RvcigyLCAnbnVtYmVyJylcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSBHTF9JTlRfVkVDMzpcbiAgICAgICAgICAgIGNoZWNrVmVjdG9yKDMsICdudW1iZXInKVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlIEdMX0lOVF9WRUM0OlxuICAgICAgICAgICAgY2hlY2tWZWN0b3IoNCwgJ251bWJlcicpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgR0xfRkxPQVQ6XG4gICAgICAgICAgICBjaGVja1R5cGUoJ251bWJlcicpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDMjpcbiAgICAgICAgICAgIGNoZWNrVmVjdG9yKDIsICdudW1iZXInKVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzM6XG4gICAgICAgICAgICBjaGVja1ZlY3RvcigzLCAnbnVtYmVyJylcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUM0OlxuICAgICAgICAgICAgY2hlY2tWZWN0b3IoNCwgJ251bWJlcicpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgR0xfQk9PTDpcbiAgICAgICAgICAgIGNoZWNrVHlwZSgnYm9vbGVhbicpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgR0xfQk9PTF9WRUMyOlxuICAgICAgICAgICAgY2hlY2tWZWN0b3IoMiwgJ2Jvb2xlYW4nKVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlIEdMX0JPT0xfVkVDMzpcbiAgICAgICAgICAgIGNoZWNrVmVjdG9yKDMsICdib29sZWFuJylcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzQ6XG4gICAgICAgICAgICBjaGVja1ZlY3Rvcig0LCAnYm9vbGVhbicpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgR0xfRkxPQVRfTUFUMjpcbiAgICAgICAgICAgIGNoZWNrVmVjdG9yKDQsICdudW1iZXInKVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlIEdMX0ZMT0FUX01BVDM6XG4gICAgICAgICAgICBjaGVja1ZlY3Rvcig5LCAnbnVtYmVyJylcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSBHTF9GTE9BVF9NQVQ0OlxuICAgICAgICAgICAgY2hlY2tWZWN0b3IoMTYsICdudW1iZXInKVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlIEdMX1NBTVBMRVJfMkQ6XG4gICAgICAgICAgICBjaGVja1RleHR1cmUoR0xfVEVYVFVSRV8yRClcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSBHTF9TQU1QTEVSX0NVQkU6XG4gICAgICAgICAgICBjaGVja1RleHR1cmUoR0xfVEVYVFVSRV9DVUJFX01BUClcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgIH1cbiAgICAgIH0pXG5cbiAgICAgIHZhciB1bnJvbGwgPSAxXG4gICAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgICAgY2FzZSBHTF9TQU1QTEVSXzJEOlxuICAgICAgICBjYXNlIEdMX1NBTVBMRVJfQ1VCRTpcbiAgICAgICAgICB2YXIgVEVYID0gc2NvcGUuZGVmKFZBTFVFLCAnLl90ZXh0dXJlJylcbiAgICAgICAgICBzY29wZShHTCwgJy51bmlmb3JtMWkoJywgTE9DQVRJT04sICcsJywgVEVYLCAnLmJpbmQoKSk7JylcbiAgICAgICAgICBzY29wZS5leGl0KFRFWCwgJy51bmJpbmQoKTsnKVxuICAgICAgICAgIGNvbnRpbnVlXG5cbiAgICAgICAgY2FzZSBHTF9JTlQ6XG4gICAgICAgIGNhc2UgR0xfQk9PTDpcbiAgICAgICAgICBpbmZpeCA9ICcxaSdcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfSU5UX1ZFQzI6XG4gICAgICAgIGNhc2UgR0xfQk9PTF9WRUMyOlxuICAgICAgICAgIGluZml4ID0gJzJpJ1xuICAgICAgICAgIHVucm9sbCA9IDJcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfSU5UX1ZFQzM6XG4gICAgICAgIGNhc2UgR0xfQk9PTF9WRUMzOlxuICAgICAgICAgIGluZml4ID0gJzNpJ1xuICAgICAgICAgIHVucm9sbCA9IDNcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfSU5UX1ZFQzQ6XG4gICAgICAgIGNhc2UgR0xfQk9PTF9WRUM0OlxuICAgICAgICAgIGluZml4ID0gJzRpJ1xuICAgICAgICAgIHVucm9sbCA9IDRcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfRkxPQVQ6XG4gICAgICAgICAgaW5maXggPSAnMWYnXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzI6XG4gICAgICAgICAgaW5maXggPSAnMmYnXG4gICAgICAgICAgdW5yb2xsID0gMlxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUMzOlxuICAgICAgICAgIGluZml4ID0gJzNmJ1xuICAgICAgICAgIHVucm9sbCA9IDNcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDNDpcbiAgICAgICAgICBpbmZpeCA9ICc0ZidcbiAgICAgICAgICB1bnJvbGwgPSA0XG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0ZMT0FUX01BVDI6XG4gICAgICAgICAgaW5maXggPSAnTWF0cml4MmZ2J1xuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9GTE9BVF9NQVQzOlxuICAgICAgICAgIGluZml4ID0gJ01hdHJpeDNmdidcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfRkxPQVRfTUFUNDpcbiAgICAgICAgICBpbmZpeCA9ICdNYXRyaXg0ZnYnXG4gICAgICAgICAgYnJlYWtcbiAgICAgIH1cblxuICAgICAgc2NvcGUoR0wsICcudW5pZm9ybScsIGluZml4LCAnKCcsIExPQ0FUSU9OLCAnLCcpXG4gICAgICBpZiAoaW5maXguY2hhckF0KDApID09PSAnTScpIHtcbiAgICAgICAgdmFyIG1hdFNpemUgPSBNYXRoLnBvdyh0eXBlIC0gR0xfRkxPQVRfTUFUMiArIDIsIDIpXG4gICAgICAgIHZhciBTVE9SQUdFID0gZW52Lmdsb2JhbC5kZWYoJ25ldyBGbG9hdDMyQXJyYXkoJywgbWF0U2l6ZSwgJyknKVxuICAgICAgICBzY29wZShcbiAgICAgICAgICAnZmFsc2UsKEFycmF5LmlzQXJyYXkoJywgVkFMVUUsICcpfHwnLCBWQUxVRSwgJyBpbnN0YW5jZW9mIEZsb2F0MzJBcnJheSk/JywgVkFMVUUsICc6KCcsXG4gICAgICAgICAgbG9vcChtYXRTaXplLCBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgICAgcmV0dXJuIFNUT1JBR0UgKyAnWycgKyBpICsgJ109JyArIFZBTFVFICsgJ1snICsgaSArICddJ1xuICAgICAgICAgIH0pLCAnLCcsIFNUT1JBR0UsICcpJylcbiAgICAgIH0gZWxzZSBpZiAodW5yb2xsID4gMSkge1xuICAgICAgICBzY29wZShsb29wKHVucm9sbCwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICByZXR1cm4gVkFMVUUgKyAnWycgKyBpICsgJ10nXG4gICAgICAgIH0pKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2NvcGUoVkFMVUUpXG4gICAgICB9XG4gICAgICBzY29wZSgnKTsnKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGVtaXREcmF3IChlbnYsIG91dGVyLCBpbm5lciwgYXJncykge1xuICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgdmFyIEdMID0gc2hhcmVkLmdsXG4gICAgdmFyIERSQVdfU1RBVEUgPSBzaGFyZWQuZHJhd1xuXG4gICAgdmFyIGRyYXdPcHRpb25zID0gYXJncy5kcmF3XG5cbiAgICBmdW5jdGlvbiBlbWl0RWxlbWVudHMgKCkge1xuICAgICAgdmFyIGRlZm4gPSBkcmF3T3B0aW9ucy5lbGVtZW50c1xuICAgICAgdmFyIEVMRU1FTlRTXG4gICAgICB2YXIgc2NvcGUgPSBvdXRlclxuICAgICAgaWYgKGRlZm4pIHtcbiAgICAgICAgaWYgKChkZWZuLmNvbnRleHREZXAgJiYgYXJncy5jb250ZXh0RHluYW1pYykgfHwgZGVmbi5wcm9wRGVwKSB7XG4gICAgICAgICAgc2NvcGUgPSBpbm5lclxuICAgICAgICB9XG4gICAgICAgIEVMRU1FTlRTID0gZGVmbi5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIEVMRU1FTlRTID0gc2NvcGUuZGVmKERSQVdfU1RBVEUsICcuJywgU19FTEVNRU5UUylcbiAgICAgIH1cbiAgICAgIGlmIChFTEVNRU5UUykge1xuICAgICAgICBzY29wZShcbiAgICAgICAgICAnaWYoJyArIEVMRU1FTlRTICsgJyknICtcbiAgICAgICAgICBHTCArICcuYmluZEJ1ZmZlcignICsgR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIgKyAnLCcgKyBFTEVNRU5UUyArICcuYnVmZmVyLmJ1ZmZlcik7JylcbiAgICAgIH1cbiAgICAgIHJldHVybiBFTEVNRU5UU1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGVtaXRDb3VudCAoKSB7XG4gICAgICB2YXIgZGVmbiA9IGRyYXdPcHRpb25zLmNvdW50XG4gICAgICB2YXIgQ09VTlRcbiAgICAgIHZhciBzY29wZSA9IG91dGVyXG4gICAgICBpZiAoZGVmbikge1xuICAgICAgICBpZiAoKGRlZm4uY29udGV4dERlcCAmJiBhcmdzLmNvbnRleHREeW5hbWljKSB8fCBkZWZuLnByb3BEZXApIHtcbiAgICAgICAgICBzY29wZSA9IGlubmVyXG4gICAgICAgIH1cbiAgICAgICAgQ09VTlQgPSBkZWZuLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgaWYgKGRlZm4uTUlTU0lORykge1xuICAgICAgICAgICAgZW52LmFzc2VydChvdXRlciwgJ2ZhbHNlJywgJ21pc3NpbmcgdmVydGV4IGNvdW50JylcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGRlZm4uRFlOQU1JQykge1xuICAgICAgICAgICAgZW52LmFzc2VydChzY29wZSwgQ09VTlQgKyAnPj0wJywgJ21pc3NpbmcgdmVydGV4IGNvdW50JylcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBDT1VOVCA9IHNjb3BlLmRlZihEUkFXX1NUQVRFLCAnLicsIFNfQ09VTlQpXG4gICAgICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLCBDT1VOVCArICc+PTAnLCAnbWlzc2luZyB2ZXJ0ZXggY291bnQnKVxuICAgICAgICB9KVxuICAgICAgfVxuICAgICAgcmV0dXJuIENPVU5UXG4gICAgfVxuXG4gICAgdmFyIEVMRU1FTlRTID0gZW1pdEVsZW1lbnRzKClcbiAgICBmdW5jdGlvbiBlbWl0VmFsdWUgKG5hbWUpIHtcbiAgICAgIHZhciBkZWZuID0gZHJhd09wdGlvbnNbbmFtZV1cbiAgICAgIGlmIChkZWZuKSB7XG4gICAgICAgIGlmICgoZGVmbi5jb250ZXh0RGVwICYmIGFyZ3MuY29udGV4dER5bmFtaWMpIHx8IGRlZm4ucHJvcERlcCkge1xuICAgICAgICAgIHJldHVybiBkZWZuLmFwcGVuZChlbnYsIGlubmVyKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBkZWZuLmFwcGVuZChlbnYsIG91dGVyKVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gb3V0ZXIuZGVmKERSQVdfU1RBVEUsICcuJywgbmFtZSlcbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgUFJJTUlUSVZFID0gZW1pdFZhbHVlKFNfUFJJTUlUSVZFKVxuICAgIHZhciBPRkZTRVQgPSBlbWl0VmFsdWUoU19PRkZTRVQpXG5cbiAgICB2YXIgQ09VTlQgPSBlbWl0Q291bnQoKVxuICAgIGlmICh0eXBlb2YgQ09VTlQgPT09ICdudW1iZXInKSB7XG4gICAgICBpZiAoQ09VTlQgPT09IDApIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGlubmVyKCdpZignLCBDT1VOVCwgJyl7JylcbiAgICAgIGlubmVyLmV4aXQoJ30nKVxuICAgIH1cblxuICAgIHZhciBJTlNUQU5DRVMsIEVYVF9JTlNUQU5DSU5HXG4gICAgaWYgKGV4dEluc3RhbmNpbmcpIHtcbiAgICAgIElOU1RBTkNFUyA9IGVtaXRWYWx1ZShTX0lOU1RBTkNFUylcbiAgICAgIEVYVF9JTlNUQU5DSU5HID0gZW52Lmluc3RhbmNpbmdcbiAgICB9XG5cbiAgICB2YXIgRUxFTUVOVF9UWVBFID0gRUxFTUVOVFMgKyAnLnR5cGUnXG5cbiAgICB2YXIgZWxlbWVudHNTdGF0aWMgPSBkcmF3T3B0aW9ucy5lbGVtZW50cyAmJiBpc1N0YXRpYyhkcmF3T3B0aW9ucy5lbGVtZW50cylcblxuICAgIGZ1bmN0aW9uIGVtaXRJbnN0YW5jaW5nICgpIHtcbiAgICAgIGZ1bmN0aW9uIGRyYXdFbGVtZW50cyAoKSB7XG4gICAgICAgIGlubmVyKEVYVF9JTlNUQU5DSU5HLCAnLmRyYXdFbGVtZW50c0luc3RhbmNlZEFOR0xFKCcsIFtcbiAgICAgICAgICBQUklNSVRJVkUsXG4gICAgICAgICAgQ09VTlQsXG4gICAgICAgICAgRUxFTUVOVF9UWVBFLFxuICAgICAgICAgIE9GRlNFVCArICc8PCgoJyArIEVMRU1FTlRfVFlQRSArICctJyArIEdMX1VOU0lHTkVEX0JZVEUgKyAnKT4+MSknLFxuICAgICAgICAgIElOU1RBTkNFU1xuICAgICAgICBdLCAnKTsnKVxuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBkcmF3QXJyYXlzICgpIHtcbiAgICAgICAgaW5uZXIoRVhUX0lOU1RBTkNJTkcsICcuZHJhd0FycmF5c0luc3RhbmNlZEFOR0xFKCcsXG4gICAgICAgICAgW1BSSU1JVElWRSwgT0ZGU0VULCBDT1VOVCwgSU5TVEFOQ0VTXSwgJyk7JylcbiAgICAgIH1cblxuICAgICAgaWYgKEVMRU1FTlRTKSB7XG4gICAgICAgIGlmICghZWxlbWVudHNTdGF0aWMpIHtcbiAgICAgICAgICBpbm5lcignaWYoJywgRUxFTUVOVFMsICcpeycpXG4gICAgICAgICAgZHJhd0VsZW1lbnRzKClcbiAgICAgICAgICBpbm5lcignfWVsc2V7JylcbiAgICAgICAgICBkcmF3QXJyYXlzKClcbiAgICAgICAgICBpbm5lcignfScpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZHJhd0VsZW1lbnRzKClcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZHJhd0FycmF5cygpXG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZW1pdFJlZ3VsYXIgKCkge1xuICAgICAgZnVuY3Rpb24gZHJhd0VsZW1lbnRzICgpIHtcbiAgICAgICAgaW5uZXIoR0wgKyAnLmRyYXdFbGVtZW50cygnICsgW1xuICAgICAgICAgIFBSSU1JVElWRSxcbiAgICAgICAgICBDT1VOVCxcbiAgICAgICAgICBFTEVNRU5UX1RZUEUsXG4gICAgICAgICAgT0ZGU0VUICsgJzw8KCgnICsgRUxFTUVOVF9UWVBFICsgJy0nICsgR0xfVU5TSUdORURfQllURSArICcpPj4xKSdcbiAgICAgICAgXSArICcpOycpXG4gICAgICB9XG5cbiAgICAgIGZ1bmN0aW9uIGRyYXdBcnJheXMgKCkge1xuICAgICAgICBpbm5lcihHTCArICcuZHJhd0FycmF5cygnICsgW1BSSU1JVElWRSwgT0ZGU0VULCBDT1VOVF0gKyAnKTsnKVxuICAgICAgfVxuXG4gICAgICBpZiAoRUxFTUVOVFMpIHtcbiAgICAgICAgaWYgKCFlbGVtZW50c1N0YXRpYykge1xuICAgICAgICAgIGlubmVyKCdpZignLCBFTEVNRU5UUywgJyl7JylcbiAgICAgICAgICBkcmF3RWxlbWVudHMoKVxuICAgICAgICAgIGlubmVyKCd9ZWxzZXsnKVxuICAgICAgICAgIGRyYXdBcnJheXMoKVxuICAgICAgICAgIGlubmVyKCd9JylcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBkcmF3RWxlbWVudHMoKVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkcmF3QXJyYXlzKClcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoZXh0SW5zdGFuY2luZyAmJiAodHlwZW9mIElOU1RBTkNFUyAhPT0gJ251bWJlcicgfHwgSU5TVEFOQ0VTID49IDApKSB7XG4gICAgICBpZiAodHlwZW9mIElOU1RBTkNFUyA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgaW5uZXIoJ2lmKCcsIElOU1RBTkNFUywgJz4wKXsnKVxuICAgICAgICBlbWl0SW5zdGFuY2luZygpXG4gICAgICAgIGlubmVyKCd9ZWxzZSBpZignLCBJTlNUQU5DRVMsICc8MCl7JylcbiAgICAgICAgZW1pdFJlZ3VsYXIoKVxuICAgICAgICBpbm5lcignfScpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBlbWl0SW5zdGFuY2luZygpXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGVtaXRSZWd1bGFyKClcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBjcmVhdGVCb2R5IChlbWl0Qm9keSwgcGFyZW50RW52LCBhcmdzLCBwcm9ncmFtLCBjb3VudCkge1xuICAgIHZhciBlbnYgPSBjcmVhdGVSRUdMRW52aXJvbm1lbnQoKVxuICAgIHZhciBzY29wZSA9IGVudi5wcm9jKCdib2R5JywgY291bnQpXG4gICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgZW52LmNvbW1hbmRTdHIgPSBwYXJlbnRFbnYuY29tbWFuZFN0clxuICAgICAgZW52LmNvbW1hbmQgPSBlbnYubGluayhwYXJlbnRFbnYuY29tbWFuZFN0cilcbiAgICB9KVxuICAgIGlmIChleHRJbnN0YW5jaW5nKSB7XG4gICAgICBlbnYuaW5zdGFuY2luZyA9IHNjb3BlLmRlZihcbiAgICAgICAgZW52LnNoYXJlZC5leHRlbnNpb25zLCAnLmFuZ2xlX2luc3RhbmNlZF9hcnJheXMnKVxuICAgIH1cbiAgICBlbWl0Qm9keShlbnYsIHNjb3BlLCBhcmdzLCBwcm9ncmFtKVxuICAgIHJldHVybiBlbnYuY29tcGlsZSgpLmJvZHlcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gRFJBVyBQUk9DXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgZnVuY3Rpb24gZW1pdERyYXdCb2R5IChlbnYsIGRyYXcsIGFyZ3MsIHByb2dyYW0pIHtcbiAgICBpbmplY3RFeHRlbnNpb25zKGVudiwgZHJhdylcbiAgICBlbWl0QXR0cmlidXRlcyhlbnYsIGRyYXcsIGFyZ3MsIHByb2dyYW0uYXR0cmlidXRlcywgZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIHRydWVcbiAgICB9KVxuICAgIGVtaXRVbmlmb3JtcyhlbnYsIGRyYXcsIGFyZ3MsIHByb2dyYW0udW5pZm9ybXMsIGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiB0cnVlXG4gICAgfSlcbiAgICBlbWl0RHJhdyhlbnYsIGRyYXcsIGRyYXcsIGFyZ3MpXG4gIH1cblxuICBmdW5jdGlvbiBlbWl0RHJhd1Byb2MgKGVudiwgYXJncykge1xuICAgIHZhciBkcmF3ID0gZW52LnByb2MoJ2RyYXcnLCAxKVxuXG4gICAgaW5qZWN0RXh0ZW5zaW9ucyhlbnYsIGRyYXcpXG5cbiAgICBlbWl0Q29udGV4dChlbnYsIGRyYXcsIGFyZ3MuY29udGV4dClcbiAgICBlbWl0UG9sbEZyYW1lYnVmZmVyKGVudiwgZHJhdywgYXJncy5mcmFtZWJ1ZmZlcilcblxuICAgIGVtaXRQb2xsU3RhdGUoZW52LCBkcmF3LCBhcmdzKVxuICAgIGVtaXRTZXRPcHRpb25zKGVudiwgZHJhdywgYXJncy5zdGF0ZSlcblxuICAgIGVtaXRQcm9maWxlKGVudiwgZHJhdywgYXJncywgZmFsc2UsIHRydWUpXG5cbiAgICB2YXIgcHJvZ3JhbSA9IGFyZ3Muc2hhZGVyLnByb2dWYXIuYXBwZW5kKGVudiwgZHJhdylcbiAgICBkcmF3KGVudi5zaGFyZWQuZ2wsICcudXNlUHJvZ3JhbSgnLCBwcm9ncmFtLCAnLnByb2dyYW0pOycpXG5cbiAgICBpZiAoYXJncy5zaGFkZXIucHJvZ3JhbSkge1xuICAgICAgZW1pdERyYXdCb2R5KGVudiwgZHJhdywgYXJncywgYXJncy5zaGFkZXIucHJvZ3JhbSlcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGRyYXdDYWNoZSA9IGVudi5nbG9iYWwuZGVmKCd7fScpXG4gICAgICB2YXIgUFJPR19JRCA9IGRyYXcuZGVmKHByb2dyYW0sICcuaWQnKVxuICAgICAgdmFyIENBQ0hFRF9QUk9DID0gZHJhdy5kZWYoZHJhd0NhY2hlLCAnWycsIFBST0dfSUQsICddJylcbiAgICAgIGRyYXcoXG4gICAgICAgIGVudi5jb25kKENBQ0hFRF9QUk9DKVxuICAgICAgICAgIC50aGVuKENBQ0hFRF9QUk9DLCAnLmNhbGwodGhpcyxhMCk7JylcbiAgICAgICAgICAuZWxzZShcbiAgICAgICAgICAgIENBQ0hFRF9QUk9DLCAnPScsIGRyYXdDYWNoZSwgJ1snLCBQUk9HX0lELCAnXT0nLFxuICAgICAgICAgICAgZW52LmxpbmsoZnVuY3Rpb24gKHByb2dyYW0pIHtcbiAgICAgICAgICAgICAgcmV0dXJuIGNyZWF0ZUJvZHkoZW1pdERyYXdCb2R5LCBlbnYsIGFyZ3MsIHByb2dyYW0sIDEpXG4gICAgICAgICAgICB9KSwgJygnLCBwcm9ncmFtLCAnKTsnLFxuICAgICAgICAgICAgQ0FDSEVEX1BST0MsICcuY2FsbCh0aGlzLGEwKTsnKSlcbiAgICB9XG5cbiAgICBpZiAoT2JqZWN0LmtleXMoYXJncy5zdGF0ZSkubGVuZ3RoID4gMCkge1xuICAgICAgZHJhdyhlbnYuc2hhcmVkLmN1cnJlbnQsICcuZGlydHk9dHJ1ZTsnKVxuICAgIH1cbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gQkFUQ0ggUFJPQ1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgZnVuY3Rpb24gZW1pdEJhdGNoRHluYW1pY1NoYWRlckJvZHkgKGVudiwgc2NvcGUsIGFyZ3MsIHByb2dyYW0pIHtcbiAgICBlbnYuYmF0Y2hJZCA9ICdhMSdcblxuICAgIGluamVjdEV4dGVuc2lvbnMoZW52LCBzY29wZSlcblxuICAgIGZ1bmN0aW9uIGFsbCAoKSB7XG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIH1cblxuICAgIGVtaXRBdHRyaWJ1dGVzKGVudiwgc2NvcGUsIGFyZ3MsIHByb2dyYW0uYXR0cmlidXRlcywgYWxsKVxuICAgIGVtaXRVbmlmb3JtcyhlbnYsIHNjb3BlLCBhcmdzLCBwcm9ncmFtLnVuaWZvcm1zLCBhbGwpXG4gICAgZW1pdERyYXcoZW52LCBzY29wZSwgc2NvcGUsIGFyZ3MpXG4gIH1cblxuICBmdW5jdGlvbiBlbWl0QmF0Y2hCb2R5IChlbnYsIHNjb3BlLCBhcmdzLCBwcm9ncmFtKSB7XG4gICAgaW5qZWN0RXh0ZW5zaW9ucyhlbnYsIHNjb3BlKVxuXG4gICAgdmFyIGNvbnRleHREeW5hbWljID0gYXJncy5jb250ZXh0RGVwXG5cbiAgICB2YXIgQkFUQ0hfSUQgPSBzY29wZS5kZWYoKVxuICAgIHZhciBQUk9QX0xJU1QgPSAnYTAnXG4gICAgdmFyIE5VTV9QUk9QUyA9ICdhMSdcbiAgICB2YXIgUFJPUFMgPSBzY29wZS5kZWYoKVxuICAgIGVudi5zaGFyZWQucHJvcHMgPSBQUk9QU1xuICAgIGVudi5iYXRjaElkID0gQkFUQ0hfSURcblxuICAgIHZhciBvdXRlciA9IGVudi5zY29wZSgpXG4gICAgdmFyIGlubmVyID0gZW52LnNjb3BlKClcblxuICAgIHNjb3BlKFxuICAgICAgb3V0ZXIuZW50cnksXG4gICAgICAnZm9yKCcsIEJBVENIX0lELCAnPTA7JywgQkFUQ0hfSUQsICc8JywgTlVNX1BST1BTLCAnOysrJywgQkFUQ0hfSUQsICcpeycsXG4gICAgICBQUk9QUywgJz0nLCBQUk9QX0xJU1QsICdbJywgQkFUQ0hfSUQsICddOycsXG4gICAgICBpbm5lcixcbiAgICAgICd9JyxcbiAgICAgIG91dGVyLmV4aXQpXG5cbiAgICBmdW5jdGlvbiBpc0lubmVyRGVmbiAoZGVmbikge1xuICAgICAgcmV0dXJuICgoZGVmbi5jb250ZXh0RGVwICYmIGNvbnRleHREeW5hbWljKSB8fCBkZWZuLnByb3BEZXApXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaXNPdXRlckRlZm4gKGRlZm4pIHtcbiAgICAgIHJldHVybiAhaXNJbm5lckRlZm4oZGVmbilcbiAgICB9XG5cbiAgICBpZiAoYXJncy5uZWVkc0NvbnRleHQpIHtcbiAgICAgIGVtaXRDb250ZXh0KGVudiwgaW5uZXIsIGFyZ3MuY29udGV4dClcbiAgICB9XG4gICAgaWYgKGFyZ3MubmVlZHNGcmFtZWJ1ZmZlcikge1xuICAgICAgZW1pdFBvbGxGcmFtZWJ1ZmZlcihlbnYsIGlubmVyLCBhcmdzLmZyYW1lYnVmZmVyKVxuICAgIH1cbiAgICBlbWl0U2V0T3B0aW9ucyhlbnYsIGlubmVyLCBhcmdzLnN0YXRlLCBpc0lubmVyRGVmbilcblxuICAgIGlmIChhcmdzLnByb2ZpbGUgJiYgaXNJbm5lckRlZm4oYXJncy5wcm9maWxlKSkge1xuICAgICAgZW1pdFByb2ZpbGUoZW52LCBpbm5lciwgYXJncywgZmFsc2UsIHRydWUpXG4gICAgfVxuXG4gICAgaWYgKCFwcm9ncmFtKSB7XG4gICAgICB2YXIgcHJvZ0NhY2hlID0gZW52Lmdsb2JhbC5kZWYoJ3t9JylcbiAgICAgIHZhciBQUk9HUkFNID0gYXJncy5zaGFkZXIucHJvZ1Zhci5hcHBlbmQoZW52LCBpbm5lcilcbiAgICAgIHZhciBQUk9HX0lEID0gaW5uZXIuZGVmKFBST0dSQU0sICcuaWQnKVxuICAgICAgdmFyIENBQ0hFRF9QUk9DID0gaW5uZXIuZGVmKHByb2dDYWNoZSwgJ1snLCBQUk9HX0lELCAnXScpXG4gICAgICBpbm5lcihcbiAgICAgICAgZW52LnNoYXJlZC5nbCwgJy51c2VQcm9ncmFtKCcsIFBST0dSQU0sICcucHJvZ3JhbSk7JyxcbiAgICAgICAgJ2lmKCEnLCBDQUNIRURfUFJPQywgJyl7JyxcbiAgICAgICAgQ0FDSEVEX1BST0MsICc9JywgcHJvZ0NhY2hlLCAnWycsIFBST0dfSUQsICddPScsXG4gICAgICAgIGVudi5saW5rKGZ1bmN0aW9uIChwcm9ncmFtKSB7XG4gICAgICAgICAgcmV0dXJuIGNyZWF0ZUJvZHkoXG4gICAgICAgICAgICBlbWl0QmF0Y2hEeW5hbWljU2hhZGVyQm9keSwgZW52LCBhcmdzLCBwcm9ncmFtLCAyKVxuICAgICAgICB9KSwgJygnLCBQUk9HUkFNLCAnKTt9JyxcbiAgICAgICAgQ0FDSEVEX1BST0MsICcuY2FsbCh0aGlzLGEwWycsIEJBVENIX0lELCAnXSwnLCBCQVRDSF9JRCwgJyk7JylcbiAgICB9IGVsc2Uge1xuICAgICAgZW1pdEF0dHJpYnV0ZXMoZW52LCBvdXRlciwgYXJncywgcHJvZ3JhbS5hdHRyaWJ1dGVzLCBpc091dGVyRGVmbilcbiAgICAgIGVtaXRBdHRyaWJ1dGVzKGVudiwgaW5uZXIsIGFyZ3MsIHByb2dyYW0uYXR0cmlidXRlcywgaXNJbm5lckRlZm4pXG4gICAgICBlbWl0VW5pZm9ybXMoZW52LCBvdXRlciwgYXJncywgcHJvZ3JhbS51bmlmb3JtcywgaXNPdXRlckRlZm4pXG4gICAgICBlbWl0VW5pZm9ybXMoZW52LCBpbm5lciwgYXJncywgcHJvZ3JhbS51bmlmb3JtcywgaXNJbm5lckRlZm4pXG4gICAgICBlbWl0RHJhdyhlbnYsIG91dGVyLCBpbm5lciwgYXJncylcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBlbWl0QmF0Y2hQcm9jIChlbnYsIGFyZ3MpIHtcbiAgICB2YXIgYmF0Y2ggPSBlbnYucHJvYygnYmF0Y2gnLCAyKVxuICAgIGVudi5iYXRjaElkID0gJzAnXG5cbiAgICBpbmplY3RFeHRlbnNpb25zKGVudiwgYmF0Y2gpXG5cbiAgICAvLyBDaGVjayBpZiBhbnkgY29udGV4dCB2YXJpYWJsZXMgZGVwZW5kIG9uIHByb3BzXG4gICAgdmFyIGNvbnRleHREeW5hbWljID0gZmFsc2VcbiAgICB2YXIgbmVlZHNDb250ZXh0ID0gdHJ1ZVxuICAgIE9iamVjdC5rZXlzKGFyZ3MuY29udGV4dCkuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgY29udGV4dER5bmFtaWMgPSBjb250ZXh0RHluYW1pYyB8fCBhcmdzLmNvbnRleHRbbmFtZV0ucHJvcERlcFxuICAgIH0pXG4gICAgaWYgKCFjb250ZXh0RHluYW1pYykge1xuICAgICAgZW1pdENvbnRleHQoZW52LCBiYXRjaCwgYXJncy5jb250ZXh0KVxuICAgICAgbmVlZHNDb250ZXh0ID0gZmFsc2VcbiAgICB9XG5cbiAgICAvLyBmcmFtZWJ1ZmZlciBzdGF0ZSBhZmZlY3RzIGZyYW1lYnVmZmVyV2lkdGgvaGVpZ2h0IGNvbnRleHQgdmFyc1xuICAgIHZhciBmcmFtZWJ1ZmZlciA9IGFyZ3MuZnJhbWVidWZmZXJcbiAgICB2YXIgbmVlZHNGcmFtZWJ1ZmZlciA9IGZhbHNlXG4gICAgaWYgKGZyYW1lYnVmZmVyKSB7XG4gICAgICBpZiAoZnJhbWVidWZmZXIucHJvcERlcCkge1xuICAgICAgICBjb250ZXh0RHluYW1pYyA9IG5lZWRzRnJhbWVidWZmZXIgPSB0cnVlXG4gICAgICB9IGVsc2UgaWYgKGZyYW1lYnVmZmVyLmNvbnRleHREZXAgJiYgY29udGV4dER5bmFtaWMpIHtcbiAgICAgICAgbmVlZHNGcmFtZWJ1ZmZlciA9IHRydWVcbiAgICAgIH1cbiAgICAgIGlmICghbmVlZHNGcmFtZWJ1ZmZlcikge1xuICAgICAgICBlbWl0UG9sbEZyYW1lYnVmZmVyKGVudiwgYmF0Y2gsIGZyYW1lYnVmZmVyKVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBlbWl0UG9sbEZyYW1lYnVmZmVyKGVudiwgYmF0Y2gsIG51bGwpXG4gICAgfVxuXG4gICAgLy8gdmlld3BvcnQgaXMgd2VpcmQgYmVjYXVzZSBpdCBjYW4gYWZmZWN0IGNvbnRleHQgdmFyc1xuICAgIGlmIChhcmdzLnN0YXRlLnZpZXdwb3J0ICYmIGFyZ3Muc3RhdGUudmlld3BvcnQucHJvcERlcCkge1xuICAgICAgY29udGV4dER5bmFtaWMgPSB0cnVlXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaXNJbm5lckRlZm4gKGRlZm4pIHtcbiAgICAgIHJldHVybiAoZGVmbi5jb250ZXh0RGVwICYmIGNvbnRleHREeW5hbWljKSB8fCBkZWZuLnByb3BEZXBcbiAgICB9XG5cbiAgICAvLyBzZXQgd2ViZ2wgb3B0aW9uc1xuICAgIGVtaXRQb2xsU3RhdGUoZW52LCBiYXRjaCwgYXJncylcbiAgICBlbWl0U2V0T3B0aW9ucyhlbnYsIGJhdGNoLCBhcmdzLnN0YXRlLCBmdW5jdGlvbiAoZGVmbikge1xuICAgICAgcmV0dXJuICFpc0lubmVyRGVmbihkZWZuKVxuICAgIH0pXG5cbiAgICBpZiAoIWFyZ3MucHJvZmlsZSB8fCAhaXNJbm5lckRlZm4oYXJncy5wcm9maWxlKSkge1xuICAgICAgZW1pdFByb2ZpbGUoZW52LCBiYXRjaCwgYXJncywgZmFsc2UsICdhMScpXG4gICAgfVxuXG4gICAgLy8gU2F2ZSB0aGVzZSB2YWx1ZXMgdG8gYXJncyBzbyB0aGF0IHRoZSBiYXRjaCBib2R5IHJvdXRpbmUgY2FuIHVzZSB0aGVtXG4gICAgYXJncy5jb250ZXh0RGVwID0gY29udGV4dER5bmFtaWNcbiAgICBhcmdzLm5lZWRzQ29udGV4dCA9IG5lZWRzQ29udGV4dFxuICAgIGFyZ3MubmVlZHNGcmFtZWJ1ZmZlciA9IG5lZWRzRnJhbWVidWZmZXJcblxuICAgIC8vIGRldGVybWluZSBpZiBzaGFkZXIgaXMgZHluYW1pY1xuICAgIHZhciBwcm9nRGVmbiA9IGFyZ3Muc2hhZGVyLnByb2dWYXJcbiAgICBpZiAoKHByb2dEZWZuLmNvbnRleHREZXAgJiYgY29udGV4dER5bmFtaWMpIHx8IHByb2dEZWZuLnByb3BEZXApIHtcbiAgICAgIGVtaXRCYXRjaEJvZHkoXG4gICAgICAgIGVudixcbiAgICAgICAgYmF0Y2gsXG4gICAgICAgIGFyZ3MsXG4gICAgICAgIG51bGwpXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBQUk9HUkFNID0gcHJvZ0RlZm4uYXBwZW5kKGVudiwgYmF0Y2gpXG4gICAgICBiYXRjaChlbnYuc2hhcmVkLmdsLCAnLnVzZVByb2dyYW0oJywgUFJPR1JBTSwgJy5wcm9ncmFtKTsnKVxuICAgICAgaWYgKGFyZ3Muc2hhZGVyLnByb2dyYW0pIHtcbiAgICAgICAgZW1pdEJhdGNoQm9keShcbiAgICAgICAgICBlbnYsXG4gICAgICAgICAgYmF0Y2gsXG4gICAgICAgICAgYXJncyxcbiAgICAgICAgICBhcmdzLnNoYWRlci5wcm9ncmFtKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIGJhdGNoQ2FjaGUgPSBlbnYuZ2xvYmFsLmRlZigne30nKVxuICAgICAgICB2YXIgUFJPR19JRCA9IGJhdGNoLmRlZihQUk9HUkFNLCAnLmlkJylcbiAgICAgICAgdmFyIENBQ0hFRF9QUk9DID0gYmF0Y2guZGVmKGJhdGNoQ2FjaGUsICdbJywgUFJPR19JRCwgJ10nKVxuICAgICAgICBiYXRjaChcbiAgICAgICAgICBlbnYuY29uZChDQUNIRURfUFJPQylcbiAgICAgICAgICAgIC50aGVuKENBQ0hFRF9QUk9DLCAnLmNhbGwodGhpcyxhMCxhMSk7JylcbiAgICAgICAgICAgIC5lbHNlKFxuICAgICAgICAgICAgICBDQUNIRURfUFJPQywgJz0nLCBiYXRjaENhY2hlLCAnWycsIFBST0dfSUQsICddPScsXG4gICAgICAgICAgICAgIGVudi5saW5rKGZ1bmN0aW9uIChwcm9ncmFtKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNyZWF0ZUJvZHkoZW1pdEJhdGNoQm9keSwgZW52LCBhcmdzLCBwcm9ncmFtLCAyKVxuICAgICAgICAgICAgICB9KSwgJygnLCBQUk9HUkFNLCAnKTsnLFxuICAgICAgICAgICAgICBDQUNIRURfUFJPQywgJy5jYWxsKHRoaXMsYTAsYTEpOycpKVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChPYmplY3Qua2V5cyhhcmdzLnN0YXRlKS5sZW5ndGggPiAwKSB7XG4gICAgICBiYXRjaChlbnYuc2hhcmVkLmN1cnJlbnQsICcuZGlydHk9dHJ1ZTsnKVxuICAgIH1cbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gU0NPUEUgQ09NTUFORFxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIGVtaXRTY29wZVByb2MgKGVudiwgYXJncykge1xuICAgIHZhciBzY29wZSA9IGVudi5wcm9jKCdzY29wZScsIDMpXG4gICAgZW52LmJhdGNoSWQgPSAnYTInXG5cbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuICAgIHZhciBDVVJSRU5UX1NUQVRFID0gc2hhcmVkLmN1cnJlbnRcblxuICAgIGVtaXRDb250ZXh0KGVudiwgc2NvcGUsIGFyZ3MuY29udGV4dClcblxuICAgIGlmIChhcmdzLmZyYW1lYnVmZmVyKSB7XG4gICAgICBhcmdzLmZyYW1lYnVmZmVyLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgIH1cblxuICAgIHNvcnRTdGF0ZShPYmplY3Qua2V5cyhhcmdzLnN0YXRlKSkuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgdmFyIGRlZm4gPSBhcmdzLnN0YXRlW25hbWVdXG4gICAgICB2YXIgdmFsdWUgPSBkZWZuLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgaWYgKGlzQXJyYXlMaWtlKHZhbHVlKSkge1xuICAgICAgICB2YWx1ZS5mb3JFYWNoKGZ1bmN0aW9uICh2LCBpKSB7XG4gICAgICAgICAgc2NvcGUuc2V0KGVudi5uZXh0W25hbWVdLCAnWycgKyBpICsgJ10nLCB2KVxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2NvcGUuc2V0KHNoYXJlZC5uZXh0LCAnLicgKyBuYW1lLCB2YWx1ZSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgZW1pdFByb2ZpbGUoZW52LCBzY29wZSwgYXJncywgdHJ1ZSwgdHJ1ZSlcblxuICAgIDtbU19FTEVNRU5UUywgU19PRkZTRVQsIFNfQ09VTlQsIFNfSU5TVEFOQ0VTLCBTX1BSSU1JVElWRV0uZm9yRWFjaChcbiAgICAgIGZ1bmN0aW9uIChvcHQpIHtcbiAgICAgICAgdmFyIHZhcmlhYmxlID0gYXJncy5kcmF3W29wdF1cbiAgICAgICAgaWYgKCF2YXJpYWJsZSkge1xuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG4gICAgICAgIHNjb3BlLnNldChzaGFyZWQuZHJhdywgJy4nICsgb3B0LCAnJyArIHZhcmlhYmxlLmFwcGVuZChlbnYsIHNjb3BlKSlcbiAgICAgIH0pXG5cbiAgICBPYmplY3Qua2V5cyhhcmdzLnVuaWZvcm1zKS5mb3JFYWNoKGZ1bmN0aW9uIChvcHQpIHtcbiAgICAgIHNjb3BlLnNldChcbiAgICAgICAgc2hhcmVkLnVuaWZvcm1zLFxuICAgICAgICAnWycgKyBzdHJpbmdTdG9yZS5pZChvcHQpICsgJ10nLFxuICAgICAgICBhcmdzLnVuaWZvcm1zW29wdF0uYXBwZW5kKGVudiwgc2NvcGUpKVxuICAgIH0pXG5cbiAgICBPYmplY3Qua2V5cyhhcmdzLmF0dHJpYnV0ZXMpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHZhciByZWNvcmQgPSBhcmdzLmF0dHJpYnV0ZXNbbmFtZV0uYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgICB2YXIgc2NvcGVBdHRyaWIgPSBlbnYuc2NvcGVBdHRyaWIobmFtZSlcbiAgICAgIE9iamVjdC5rZXlzKG5ldyBBdHRyaWJ1dGVSZWNvcmQoKSkuZm9yRWFjaChmdW5jdGlvbiAocHJvcCkge1xuICAgICAgICBzY29wZS5zZXQoc2NvcGVBdHRyaWIsICcuJyArIHByb3AsIHJlY29yZFtwcm9wXSlcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGZ1bmN0aW9uIHNhdmVTaGFkZXIgKG5hbWUpIHtcbiAgICAgIHZhciBzaGFkZXIgPSBhcmdzLnNoYWRlcltuYW1lXVxuICAgICAgaWYgKHNoYWRlcikge1xuICAgICAgICBzY29wZS5zZXQoc2hhcmVkLnNoYWRlciwgJy4nICsgbmFtZSwgc2hhZGVyLmFwcGVuZChlbnYsIHNjb3BlKSlcbiAgICAgIH1cbiAgICB9XG4gICAgc2F2ZVNoYWRlcihTX1ZFUlQpXG4gICAgc2F2ZVNoYWRlcihTX0ZSQUcpXG5cbiAgICBpZiAoT2JqZWN0LmtleXMoYXJncy5zdGF0ZSkubGVuZ3RoID4gMCkge1xuICAgICAgc2NvcGUoQ1VSUkVOVF9TVEFURSwgJy5kaXJ0eT10cnVlOycpXG4gICAgICBzY29wZS5leGl0KENVUlJFTlRfU1RBVEUsICcuZGlydHk9dHJ1ZTsnKVxuICAgIH1cblxuICAgIHNjb3BlKCdhMSgnLCBlbnYuc2hhcmVkLmNvbnRleHQsICcsYTAsJywgZW52LmJhdGNoSWQsICcpOycpXG4gIH1cblxuICBmdW5jdGlvbiBpc0R5bmFtaWNPYmplY3QgKG9iamVjdCkge1xuICAgIGlmICh0eXBlb2Ygb2JqZWN0ICE9PSAnb2JqZWN0JyB8fCBpc0FycmF5TGlrZShvYmplY3QpKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgdmFyIHByb3BzID0gT2JqZWN0LmtleXMob2JqZWN0KVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcHJvcHMubGVuZ3RoOyArK2kpIHtcbiAgICAgIGlmIChkeW5hbWljLmlzRHluYW1pYyhvYmplY3RbcHJvcHNbaV1dKSkge1xuICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2VcbiAgfVxuXG4gIGZ1bmN0aW9uIHNwbGF0T2JqZWN0IChlbnYsIG9wdGlvbnMsIG5hbWUpIHtcbiAgICB2YXIgb2JqZWN0ID0gb3B0aW9ucy5zdGF0aWNbbmFtZV1cbiAgICBpZiAoIW9iamVjdCB8fCAhaXNEeW5hbWljT2JqZWN0KG9iamVjdCkpIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIHZhciBnbG9iYWxzID0gZW52Lmdsb2JhbFxuICAgIHZhciBrZXlzID0gT2JqZWN0LmtleXMob2JqZWN0KVxuICAgIHZhciB0aGlzRGVwID0gZmFsc2VcbiAgICB2YXIgY29udGV4dERlcCA9IGZhbHNlXG4gICAgdmFyIHByb3BEZXAgPSBmYWxzZVxuICAgIHZhciBvYmplY3RSZWYgPSBlbnYuZ2xvYmFsLmRlZigne30nKVxuICAgIGtleXMuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICB2YXIgdmFsdWUgPSBvYmplY3Rba2V5XVxuICAgICAgaWYgKGR5bmFtaWMuaXNEeW5hbWljKHZhbHVlKSkge1xuICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgdmFsdWUgPSBvYmplY3Rba2V5XSA9IGR5bmFtaWMudW5ib3godmFsdWUpXG4gICAgICAgIH1cbiAgICAgICAgdmFyIGRlcHMgPSBjcmVhdGVEeW5hbWljRGVjbCh2YWx1ZSwgbnVsbClcbiAgICAgICAgdGhpc0RlcCA9IHRoaXNEZXAgfHwgZGVwcy50aGlzRGVwXG4gICAgICAgIHByb3BEZXAgPSBwcm9wRGVwIHx8IGRlcHMucHJvcERlcFxuICAgICAgICBjb250ZXh0RGVwID0gY29udGV4dERlcCB8fCBkZXBzLmNvbnRleHREZXBcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGdsb2JhbHMob2JqZWN0UmVmLCAnLicsIGtleSwgJz0nKVxuICAgICAgICBzd2l0Y2ggKHR5cGVvZiB2YWx1ZSkge1xuICAgICAgICAgIGNhc2UgJ251bWJlcic6XG4gICAgICAgICAgICBnbG9iYWxzKHZhbHVlKVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgICAgICAgZ2xvYmFscygnXCInLCB2YWx1ZSwgJ1wiJylcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuICAgICAgICAgICAgICBnbG9iYWxzKCdbJywgdmFsdWUuam9pbigpLCAnXScpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICBnbG9iYWxzKGVudi5saW5rKHZhbHVlKSlcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgIH1cbiAgICAgICAgZ2xvYmFscygnOycpXG4gICAgICB9XG4gICAgfSlcblxuICAgIGZ1bmN0aW9uIGFwcGVuZEJsb2NrIChlbnYsIGJsb2NrKSB7XG4gICAgICBrZXlzLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgICB2YXIgdmFsdWUgPSBvYmplY3Rba2V5XVxuICAgICAgICBpZiAoIWR5bmFtaWMuaXNEeW5hbWljKHZhbHVlKSkge1xuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG4gICAgICAgIHZhciByZWYgPSBlbnYuaW52b2tlKGJsb2NrLCB2YWx1ZSlcbiAgICAgICAgYmxvY2sob2JqZWN0UmVmLCAnLicsIGtleSwgJz0nLCByZWYsICc7JylcbiAgICAgIH0pXG4gICAgfVxuXG4gICAgb3B0aW9ucy5keW5hbWljW25hbWVdID0gbmV3IGR5bmFtaWMuRHluYW1pY1ZhcmlhYmxlKERZTl9USFVOSywge1xuICAgICAgdGhpc0RlcDogdGhpc0RlcCxcbiAgICAgIGNvbnRleHREZXA6IGNvbnRleHREZXAsXG4gICAgICBwcm9wRGVwOiBwcm9wRGVwLFxuICAgICAgcmVmOiBvYmplY3RSZWYsXG4gICAgICBhcHBlbmQ6IGFwcGVuZEJsb2NrXG4gICAgfSlcbiAgICBkZWxldGUgb3B0aW9ucy5zdGF0aWNbbmFtZV1cbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gTUFJTiBEUkFXIENPTU1BTkRcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICBmdW5jdGlvbiBjb21waWxlQ29tbWFuZCAob3B0aW9ucywgYXR0cmlidXRlcywgdW5pZm9ybXMsIGNvbnRleHQsIHN0YXRzKSB7XG4gICAgdmFyIGVudiA9IGNyZWF0ZVJFR0xFbnZpcm9ubWVudCgpXG5cbiAgICAvLyBsaW5rIHN0YXRzLCBzbyB0aGF0IHdlIGNhbiBlYXNpbHkgYWNjZXNzIGl0IGluIHRoZSBwcm9ncmFtLlxuICAgIGVudi5zdGF0cyA9IGVudi5saW5rKHN0YXRzKVxuXG4gICAgLy8gc3BsYXQgb3B0aW9ucyBhbmQgYXR0cmlidXRlcyB0byBhbGxvdyBmb3IgZHluYW1pYyBuZXN0ZWQgcHJvcGVydGllc1xuICAgIE9iamVjdC5rZXlzKGF0dHJpYnV0ZXMuc3RhdGljKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgIHNwbGF0T2JqZWN0KGVudiwgYXR0cmlidXRlcywga2V5KVxuICAgIH0pXG4gICAgTkVTVEVEX09QVElPTlMuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgc3BsYXRPYmplY3QoZW52LCBvcHRpb25zLCBuYW1lKVxuICAgIH0pXG5cbiAgICB2YXIgYXJncyA9IHBhcnNlQXJndW1lbnRzKG9wdGlvbnMsIGF0dHJpYnV0ZXMsIHVuaWZvcm1zLCBjb250ZXh0LCBlbnYpXG5cbiAgICBlbWl0RHJhd1Byb2MoZW52LCBhcmdzKVxuICAgIGVtaXRTY29wZVByb2MoZW52LCBhcmdzKVxuICAgIGVtaXRCYXRjaFByb2MoZW52LCBhcmdzKVxuXG4gICAgcmV0dXJuIGVudi5jb21waWxlKClcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gUE9MTCAvIFJFRlJFU0hcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICByZXR1cm4ge1xuICAgIG5leHQ6IG5leHRTdGF0ZSxcbiAgICBjdXJyZW50OiBjdXJyZW50U3RhdGUsXG4gICAgcHJvY3M6IChmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgZW52ID0gY3JlYXRlUkVHTEVudmlyb25tZW50KClcbiAgICAgIHZhciBwb2xsID0gZW52LnByb2MoJ3BvbGwnKVxuICAgICAgdmFyIHJlZnJlc2ggPSBlbnYucHJvYygncmVmcmVzaCcpXG4gICAgICB2YXIgY29tbW9uID0gZW52LmJsb2NrKClcbiAgICAgIHBvbGwoY29tbW9uKVxuICAgICAgcmVmcmVzaChjb21tb24pXG5cbiAgICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgICB2YXIgR0wgPSBzaGFyZWQuZ2xcbiAgICAgIHZhciBORVhUX1NUQVRFID0gc2hhcmVkLm5leHRcbiAgICAgIHZhciBDVVJSRU5UX1NUQVRFID0gc2hhcmVkLmN1cnJlbnRcblxuICAgICAgY29tbW9uKENVUlJFTlRfU1RBVEUsICcuZGlydHk9ZmFsc2U7JylcblxuICAgICAgZW1pdFBvbGxGcmFtZWJ1ZmZlcihlbnYsIHBvbGwpXG4gICAgICBlbWl0UG9sbEZyYW1lYnVmZmVyKGVudiwgcmVmcmVzaCwgbnVsbCwgdHJ1ZSlcblxuICAgICAgLy8gUmVmcmVzaCB1cGRhdGVzIGFsbCBhdHRyaWJ1dGUgc3RhdGUgY2hhbmdlc1xuICAgICAgdmFyIGV4dEluc3RhbmNpbmcgPSBnbC5nZXRFeHRlbnNpb24oJ2FuZ2xlX2luc3RhbmNlZF9hcnJheXMnKVxuICAgICAgdmFyIElOU1RBTkNJTkdcbiAgICAgIGlmIChleHRJbnN0YW5jaW5nKSB7XG4gICAgICAgIElOU1RBTkNJTkcgPSBlbnYubGluayhleHRJbnN0YW5jaW5nKVxuICAgICAgfVxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsaW1pdHMubWF4QXR0cmlidXRlczsgKytpKSB7XG4gICAgICAgIHZhciBCSU5ESU5HID0gcmVmcmVzaC5kZWYoc2hhcmVkLmF0dHJpYnV0ZXMsICdbJywgaSwgJ10nKVxuICAgICAgICB2YXIgaWZ0ZSA9IGVudi5jb25kKEJJTkRJTkcsICcuYnVmZmVyJylcbiAgICAgICAgaWZ0ZS50aGVuKFxuICAgICAgICAgIEdMLCAnLmVuYWJsZVZlcnRleEF0dHJpYkFycmF5KCcsIGksICcpOycsXG4gICAgICAgICAgR0wsICcuYmluZEJ1ZmZlcignLFxuICAgICAgICAgICAgR0xfQVJSQVlfQlVGRkVSLCAnLCcsXG4gICAgICAgICAgICBCSU5ESU5HLCAnLmJ1ZmZlci5idWZmZXIpOycsXG4gICAgICAgICAgR0wsICcudmVydGV4QXR0cmliUG9pbnRlcignLFxuICAgICAgICAgICAgaSwgJywnLFxuICAgICAgICAgICAgQklORElORywgJy5zaXplLCcsXG4gICAgICAgICAgICBCSU5ESU5HLCAnLnR5cGUsJyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcubm9ybWFsaXplZCwnLFxuICAgICAgICAgICAgQklORElORywgJy5zdHJpZGUsJyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcub2Zmc2V0KTsnXG4gICAgICAgICkuZWxzZShcbiAgICAgICAgICBHTCwgJy5kaXNhYmxlVmVydGV4QXR0cmliQXJyYXkoJywgaSwgJyk7JyxcbiAgICAgICAgICBHTCwgJy52ZXJ0ZXhBdHRyaWI0ZignLFxuICAgICAgICAgICAgaSwgJywnLFxuICAgICAgICAgICAgQklORElORywgJy54LCcsXG4gICAgICAgICAgICBCSU5ESU5HLCAnLnksJyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcueiwnLFxuICAgICAgICAgICAgQklORElORywgJy53KTsnLFxuICAgICAgICAgIEJJTkRJTkcsICcuYnVmZmVyPW51bGw7JylcbiAgICAgICAgcmVmcmVzaChpZnRlKVxuICAgICAgICBpZiAoZXh0SW5zdGFuY2luZykge1xuICAgICAgICAgIHJlZnJlc2goXG4gICAgICAgICAgICBJTlNUQU5DSU5HLCAnLnZlcnRleEF0dHJpYkRpdmlzb3JBTkdMRSgnLFxuICAgICAgICAgICAgaSwgJywnLFxuICAgICAgICAgICAgQklORElORywgJy5kaXZpc29yKTsnKVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIE9iamVjdC5rZXlzKEdMX0ZMQUdTKS5mb3JFYWNoKGZ1bmN0aW9uIChmbGFnKSB7XG4gICAgICAgIHZhciBjYXAgPSBHTF9GTEFHU1tmbGFnXVxuICAgICAgICB2YXIgTkVYVCA9IGNvbW1vbi5kZWYoTkVYVF9TVEFURSwgJy4nLCBmbGFnKVxuICAgICAgICB2YXIgYmxvY2sgPSBlbnYuYmxvY2soKVxuICAgICAgICBibG9jaygnaWYoJywgTkVYVCwgJyl7JyxcbiAgICAgICAgICBHTCwgJy5lbmFibGUoJywgY2FwLCAnKX1lbHNleycsXG4gICAgICAgICAgR0wsICcuZGlzYWJsZSgnLCBjYXAsICcpfScsXG4gICAgICAgICAgQ1VSUkVOVF9TVEFURSwgJy4nLCBmbGFnLCAnPScsIE5FWFQsICc7JylcbiAgICAgICAgcmVmcmVzaChibG9jaylcbiAgICAgICAgcG9sbChcbiAgICAgICAgICAnaWYoJywgTkVYVCwgJyE9PScsIENVUlJFTlRfU1RBVEUsICcuJywgZmxhZywgJyl7JyxcbiAgICAgICAgICBibG9jayxcbiAgICAgICAgICAnfScpXG4gICAgICB9KVxuXG4gICAgICBPYmplY3Qua2V5cyhHTF9WQVJJQUJMRVMpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgdmFyIGZ1bmMgPSBHTF9WQVJJQUJMRVNbbmFtZV1cbiAgICAgICAgdmFyIGluaXQgPSBjdXJyZW50U3RhdGVbbmFtZV1cbiAgICAgICAgdmFyIE5FWFQsIENVUlJFTlRcbiAgICAgICAgdmFyIGJsb2NrID0gZW52LmJsb2NrKClcbiAgICAgICAgYmxvY2soR0wsICcuJywgZnVuYywgJygnKVxuICAgICAgICBpZiAoaXNBcnJheUxpa2UoaW5pdCkpIHtcbiAgICAgICAgICB2YXIgbiA9IGluaXQubGVuZ3RoXG4gICAgICAgICAgTkVYVCA9IGVudi5nbG9iYWwuZGVmKE5FWFRfU1RBVEUsICcuJywgbmFtZSlcbiAgICAgICAgICBDVVJSRU5UID0gZW52Lmdsb2JhbC5kZWYoQ1VSUkVOVF9TVEFURSwgJy4nLCBuYW1lKVxuICAgICAgICAgIGJsb2NrKFxuICAgICAgICAgICAgbG9vcChuLCBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgICAgICByZXR1cm4gTkVYVCArICdbJyArIGkgKyAnXSdcbiAgICAgICAgICAgIH0pLCAnKTsnLFxuICAgICAgICAgICAgbG9vcChuLCBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgICAgICByZXR1cm4gQ1VSUkVOVCArICdbJyArIGkgKyAnXT0nICsgTkVYVCArICdbJyArIGkgKyAnXTsnXG4gICAgICAgICAgICB9KS5qb2luKCcnKSlcbiAgICAgICAgICBwb2xsKFxuICAgICAgICAgICAgJ2lmKCcsIGxvb3AobiwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIE5FWFQgKyAnWycgKyBpICsgJ10hPT0nICsgQ1VSUkVOVCArICdbJyArIGkgKyAnXSdcbiAgICAgICAgICAgIH0pLmpvaW4oJ3x8JyksICcpeycsXG4gICAgICAgICAgICBibG9jayxcbiAgICAgICAgICAgICd9JylcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBORVhUID0gY29tbW9uLmRlZihORVhUX1NUQVRFLCAnLicsIG5hbWUpXG4gICAgICAgICAgQ1VSUkVOVCA9IGNvbW1vbi5kZWYoQ1VSUkVOVF9TVEFURSwgJy4nLCBuYW1lKVxuICAgICAgICAgIGJsb2NrKFxuICAgICAgICAgICAgTkVYVCwgJyk7JyxcbiAgICAgICAgICAgIENVUlJFTlRfU1RBVEUsICcuJywgbmFtZSwgJz0nLCBORVhULCAnOycpXG4gICAgICAgICAgcG9sbChcbiAgICAgICAgICAgICdpZignLCBORVhULCAnIT09JywgQ1VSUkVOVCwgJyl7JyxcbiAgICAgICAgICAgIGJsb2NrLFxuICAgICAgICAgICAgJ30nKVxuICAgICAgICB9XG4gICAgICAgIHJlZnJlc2goYmxvY2spXG4gICAgICB9KVxuXG4gICAgICByZXR1cm4gZW52LmNvbXBpbGUoKVxuICAgIH0pKCksXG4gICAgY29tcGlsZTogY29tcGlsZUNvbW1hbmRcbiAgfVxufVxuIiwidmFyIFZBUklBQkxFX0NPVU5URVIgPSAwXG5cbnZhciBEWU5fRlVOQyA9IDBcblxuZnVuY3Rpb24gRHluYW1pY1ZhcmlhYmxlICh0eXBlLCBkYXRhKSB7XG4gIHRoaXMuaWQgPSAoVkFSSUFCTEVfQ09VTlRFUisrKVxuICB0aGlzLnR5cGUgPSB0eXBlXG4gIHRoaXMuZGF0YSA9IGRhdGFcbn1cblxuZnVuY3Rpb24gZXNjYXBlU3RyIChzdHIpIHtcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC9cXFxcL2csICdcXFxcXFxcXCcpLnJlcGxhY2UoL1wiL2csICdcXFxcXCInKVxufVxuXG5mdW5jdGlvbiBzcGxpdFBhcnRzIChzdHIpIHtcbiAgaWYgKHN0ci5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gW11cbiAgfVxuXG4gIHZhciBmaXJzdENoYXIgPSBzdHIuY2hhckF0KDApXG4gIHZhciBsYXN0Q2hhciA9IHN0ci5jaGFyQXQoc3RyLmxlbmd0aCAtIDEpXG5cbiAgaWYgKHN0ci5sZW5ndGggPiAxICYmXG4gICAgICBmaXJzdENoYXIgPT09IGxhc3RDaGFyICYmXG4gICAgICAoZmlyc3RDaGFyID09PSAnXCInIHx8IGZpcnN0Q2hhciA9PT0gXCInXCIpKSB7XG4gICAgcmV0dXJuIFsnXCInICsgZXNjYXBlU3RyKHN0ci5zdWJzdHIoMSwgc3RyLmxlbmd0aCAtIDIpKSArICdcIiddXG4gIH1cblxuICB2YXIgcGFydHMgPSAvXFxbKGZhbHNlfHRydWV8bnVsbHxcXGQrfCdbXiddKid8XCJbXlwiXSpcIilcXF0vLmV4ZWMoc3RyKVxuICBpZiAocGFydHMpIHtcbiAgICByZXR1cm4gKFxuICAgICAgc3BsaXRQYXJ0cyhzdHIuc3Vic3RyKDAsIHBhcnRzLmluZGV4KSlcbiAgICAgIC5jb25jYXQoc3BsaXRQYXJ0cyhwYXJ0c1sxXSkpXG4gICAgICAuY29uY2F0KHNwbGl0UGFydHMoc3RyLnN1YnN0cihwYXJ0cy5pbmRleCArIHBhcnRzWzBdLmxlbmd0aCkpKVxuICAgIClcbiAgfVxuXG4gIHZhciBzdWJwYXJ0cyA9IHN0ci5zcGxpdCgnLicpXG4gIGlmIChzdWJwYXJ0cy5sZW5ndGggPT09IDEpIHtcbiAgICByZXR1cm4gWydcIicgKyBlc2NhcGVTdHIoc3RyKSArICdcIiddXG4gIH1cblxuICB2YXIgcmVzdWx0ID0gW11cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdWJwYXJ0cy5sZW5ndGg7ICsraSkge1xuICAgIHJlc3VsdCA9IHJlc3VsdC5jb25jYXQoc3BsaXRQYXJ0cyhzdWJwYXJ0c1tpXSkpXG4gIH1cbiAgcmV0dXJuIHJlc3VsdFxufVxuXG5mdW5jdGlvbiB0b0FjY2Vzc29yU3RyaW5nIChzdHIpIHtcbiAgcmV0dXJuICdbJyArIHNwbGl0UGFydHMoc3RyKS5qb2luKCddWycpICsgJ10nXG59XG5cbmZ1bmN0aW9uIGRlZmluZUR5bmFtaWMgKHR5cGUsIGRhdGEpIHtcbiAgcmV0dXJuIG5ldyBEeW5hbWljVmFyaWFibGUodHlwZSwgdG9BY2Nlc3NvclN0cmluZyhkYXRhICsgJycpKVxufVxuXG5mdW5jdGlvbiBpc0R5bmFtaWMgKHgpIHtcbiAgcmV0dXJuICh0eXBlb2YgeCA9PT0gJ2Z1bmN0aW9uJyAmJiAheC5fcmVnbFR5cGUpIHx8XG4gICAgICAgICB4IGluc3RhbmNlb2YgRHluYW1pY1ZhcmlhYmxlXG59XG5cbmZ1bmN0aW9uIHVuYm94ICh4LCBwYXRoKSB7XG4gIGlmICh0eXBlb2YgeCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHJldHVybiBuZXcgRHluYW1pY1ZhcmlhYmxlKERZTl9GVU5DLCB4KVxuICB9XG4gIHJldHVybiB4XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBEeW5hbWljVmFyaWFibGU6IER5bmFtaWNWYXJpYWJsZSxcbiAgZGVmaW5lOiBkZWZpbmVEeW5hbWljLFxuICBpc0R5bmFtaWM6IGlzRHluYW1pYyxcbiAgdW5ib3g6IHVuYm94LFxuICBhY2Nlc3NvcjogdG9BY2Nlc3NvclN0cmluZ1xufVxuIiwidmFyIGNoZWNrID0gcmVxdWlyZSgnLi91dGlsL2NoZWNrJylcbnZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL3V0aWwvaXMtdHlwZWQtYXJyYXknKVxudmFyIGlzTkRBcnJheUxpa2UgPSByZXF1aXJlKCcuL3V0aWwvaXMtbmRhcnJheScpXG52YXIgdmFsdWVzID0gcmVxdWlyZSgnLi91dGlsL3ZhbHVlcycpXG5cbnZhciBwcmltVHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9wcmltaXRpdmVzLmpzb24nKVxudmFyIHVzYWdlVHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy91c2FnZS5qc29uJylcblxudmFyIEdMX1BPSU5UUyA9IDBcbnZhciBHTF9MSU5FUyA9IDFcbnZhciBHTF9UUklBTkdMRVMgPSA0XG5cbnZhciBHTF9CWVRFID0gNTEyMFxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSA1MTIxXG52YXIgR0xfU0hPUlQgPSA1MTIyXG52YXIgR0xfVU5TSUdORURfU0hPUlQgPSA1MTIzXG52YXIgR0xfSU5UID0gNTEyNFxudmFyIEdMX1VOU0lHTkVEX0lOVCA9IDUxMjVcblxudmFyIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSID0gMzQ5NjNcblxudmFyIEdMX1NUUkVBTV9EUkFXID0gMHg4OEUwXG52YXIgR0xfU1RBVElDX0RSQVcgPSAweDg4RTRcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwRWxlbWVudHNTdGF0ZSAoZ2wsIGV4dGVuc2lvbnMsIGJ1ZmZlclN0YXRlLCBzdGF0cykge1xuICB2YXIgZWxlbWVudFNldCA9IHt9XG4gIHZhciBlbGVtZW50Q291bnQgPSAwXG5cbiAgdmFyIGVsZW1lbnRUeXBlcyA9IHtcbiAgICAndWludDgnOiBHTF9VTlNJR05FRF9CWVRFLFxuICAgICd1aW50MTYnOiBHTF9VTlNJR05FRF9TSE9SVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMub2VzX2VsZW1lbnRfaW5kZXhfdWludCkge1xuICAgIGVsZW1lbnRUeXBlcy51aW50MzIgPSBHTF9VTlNJR05FRF9JTlRcbiAgfVxuXG4gIGZ1bmN0aW9uIFJFR0xFbGVtZW50QnVmZmVyIChidWZmZXIpIHtcbiAgICB0aGlzLmlkID0gZWxlbWVudENvdW50KytcbiAgICBlbGVtZW50U2V0W3RoaXMuaWRdID0gdGhpc1xuICAgIHRoaXMuYnVmZmVyID0gYnVmZmVyXG4gICAgdGhpcy5wcmltVHlwZSA9IEdMX1RSSUFOR0xFU1xuICAgIHRoaXMudmVydENvdW50ID0gMFxuICAgIHRoaXMudHlwZSA9IDBcbiAgfVxuXG4gIFJFR0xFbGVtZW50QnVmZmVyLnByb3RvdHlwZS5iaW5kID0gZnVuY3Rpb24gKCkge1xuICAgIHRoaXMuYnVmZmVyLmJpbmQoKVxuICB9XG5cbiAgdmFyIGJ1ZmZlclBvb2wgPSBbXVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZUVsZW1lbnRTdHJlYW0gKGRhdGEpIHtcbiAgICB2YXIgcmVzdWx0ID0gYnVmZmVyUG9vbC5wb3AoKVxuICAgIGlmICghcmVzdWx0KSB7XG4gICAgICByZXN1bHQgPSBuZXcgUkVHTEVsZW1lbnRCdWZmZXIoYnVmZmVyU3RhdGUuY3JlYXRlKFxuICAgICAgICBudWxsLFxuICAgICAgICBHTF9FTEVNRU5UX0FSUkFZX0JVRkZFUixcbiAgICAgICAgdHJ1ZSxcbiAgICAgICAgZmFsc2UpLl9idWZmZXIpXG4gICAgfVxuICAgIGluaXRFbGVtZW50cyhyZXN1bHQsIGRhdGEsIEdMX1NUUkVBTV9EUkFXLCAtMSwgLTEsIDAsIDApXG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveUVsZW1lbnRTdHJlYW0gKGVsZW1lbnRzKSB7XG4gICAgYnVmZmVyUG9vbC5wdXNoKGVsZW1lbnRzKVxuICB9XG5cbiAgZnVuY3Rpb24gaW5pdEVsZW1lbnRzIChcbiAgICBlbGVtZW50cyxcbiAgICBkYXRhLFxuICAgIHVzYWdlLFxuICAgIHByaW0sXG4gICAgY291bnQsXG4gICAgYnl0ZUxlbmd0aCxcbiAgICB0eXBlKSB7XG4gICAgZWxlbWVudHMuYnVmZmVyLmJpbmQoKVxuICAgIGlmIChkYXRhKSB7XG4gICAgICB2YXIgcHJlZGljdGVkVHlwZSA9IHR5cGVcbiAgICAgIGlmICghdHlwZSAmJiAoXG4gICAgICAgICAgIWlzVHlwZWRBcnJheShkYXRhKSB8fFxuICAgICAgICAgKGlzTkRBcnJheUxpa2UoZGF0YSkgJiYgIWlzVHlwZWRBcnJheShkYXRhLmRhdGEpKSkpIHtcbiAgICAgICAgcHJlZGljdGVkVHlwZSA9IGV4dGVuc2lvbnMub2VzX2VsZW1lbnRfaW5kZXhfdWludFxuICAgICAgICAgID8gR0xfVU5TSUdORURfSU5UXG4gICAgICAgICAgOiBHTF9VTlNJR05FRF9TSE9SVFxuICAgICAgfVxuICAgICAgYnVmZmVyU3RhdGUuX2luaXRCdWZmZXIoXG4gICAgICAgIGVsZW1lbnRzLmJ1ZmZlcixcbiAgICAgICAgZGF0YSxcbiAgICAgICAgdXNhZ2UsXG4gICAgICAgIHByZWRpY3RlZFR5cGUsXG4gICAgICAgIDMpXG4gICAgfSBlbHNlIHtcbiAgICAgIGdsLmJ1ZmZlckRhdGEoR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIsIGJ5dGVMZW5ndGgsIHVzYWdlKVxuICAgICAgZWxlbWVudHMuYnVmZmVyLmR0eXBlID0gZHR5cGUgfHwgR0xfVU5TSUdORURfQllURVxuICAgICAgZWxlbWVudHMuYnVmZmVyLnVzYWdlID0gdXNhZ2VcbiAgICAgIGVsZW1lbnRzLmJ1ZmZlci5kaW1lbnNpb24gPSAzXG4gICAgICBlbGVtZW50cy5idWZmZXIuYnl0ZUxlbmd0aCA9IGJ5dGVMZW5ndGhcbiAgICB9XG5cbiAgICB2YXIgZHR5cGUgPSB0eXBlXG4gICAgaWYgKCF0eXBlKSB7XG4gICAgICBzd2l0Y2ggKGVsZW1lbnRzLmJ1ZmZlci5kdHlwZSkge1xuICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX0JZVEU6XG4gICAgICAgIGNhc2UgR0xfQllURTpcbiAgICAgICAgICBkdHlwZSA9IEdMX1VOU0lHTkVEX0JZVEVcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlQ6XG4gICAgICAgIGNhc2UgR0xfU0hPUlQ6XG4gICAgICAgICAgZHR5cGUgPSBHTF9VTlNJR05FRF9TSE9SVFxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9JTlQ6XG4gICAgICAgIGNhc2UgR0xfSU5UOlxuICAgICAgICAgIGR0eXBlID0gR0xfVU5TSUdORURfSU5UXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIGNoZWNrLnJhaXNlKCd1bnN1cHBvcnRlZCB0eXBlIGZvciBlbGVtZW50IGFycmF5JylcbiAgICAgIH1cbiAgICAgIGVsZW1lbnRzLmJ1ZmZlci5kdHlwZSA9IGR0eXBlXG4gICAgfVxuICAgIGVsZW1lbnRzLnR5cGUgPSBkdHlwZVxuXG4gICAgLy8gQ2hlY2sgb2VzX2VsZW1lbnRfaW5kZXhfdWludCBleHRlbnNpb25cbiAgICBjaGVjayhcbiAgICAgIGR0eXBlICE9PSBHTF9VTlNJR05FRF9JTlQgfHxcbiAgICAgICEhZXh0ZW5zaW9ucy5vZXNfZWxlbWVudF9pbmRleF91aW50LFxuICAgICAgJzMyIGJpdCBlbGVtZW50IGJ1ZmZlcnMgbm90IHN1cHBvcnRlZCwgZW5hYmxlIG9lc19lbGVtZW50X2luZGV4X3VpbnQgZmlyc3QnKVxuXG4gICAgLy8gdHJ5IHRvIGd1ZXNzIGRlZmF1bHQgcHJpbWl0aXZlIHR5cGUgYW5kIGFyZ3VtZW50c1xuICAgIHZhciB2ZXJ0Q291bnQgPSBjb3VudFxuICAgIGlmICh2ZXJ0Q291bnQgPCAwKSB7XG4gICAgICB2ZXJ0Q291bnQgPSBlbGVtZW50cy5idWZmZXIuYnl0ZUxlbmd0aFxuICAgICAgaWYgKGR0eXBlID09PSBHTF9VTlNJR05FRF9TSE9SVCkge1xuICAgICAgICB2ZXJ0Q291bnQgPj49IDFcbiAgICAgIH0gZWxzZSBpZiAoZHR5cGUgPT09IEdMX1VOU0lHTkVEX0lOVCkge1xuICAgICAgICB2ZXJ0Q291bnQgPj49IDJcbiAgICAgIH1cbiAgICB9XG4gICAgZWxlbWVudHMudmVydENvdW50ID0gdmVydENvdW50XG5cbiAgICAvLyB0cnkgdG8gZ3Vlc3MgcHJpbWl0aXZlIHR5cGUgZnJvbSBjZWxsIGRpbWVuc2lvblxuICAgIHZhciBwcmltVHlwZSA9IHByaW1cbiAgICBpZiAocHJpbSA8IDApIHtcbiAgICAgIHByaW1UeXBlID0gR0xfVFJJQU5HTEVTXG4gICAgICB2YXIgZGltZW5zaW9uID0gZWxlbWVudHMuYnVmZmVyLmRpbWVuc2lvblxuICAgICAgaWYgKGRpbWVuc2lvbiA9PT0gMSkgcHJpbVR5cGUgPSBHTF9QT0lOVFNcbiAgICAgIGlmIChkaW1lbnNpb24gPT09IDIpIHByaW1UeXBlID0gR0xfTElORVNcbiAgICAgIGlmIChkaW1lbnNpb24gPT09IDMpIHByaW1UeXBlID0gR0xfVFJJQU5HTEVTXG4gICAgfVxuICAgIGVsZW1lbnRzLnByaW1UeXBlID0gcHJpbVR5cGVcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3lFbGVtZW50cyAoZWxlbWVudHMpIHtcbiAgICBzdGF0cy5lbGVtZW50c0NvdW50LS1cblxuICAgIGNoZWNrKGVsZW1lbnRzLmJ1ZmZlciAhPT0gbnVsbCwgJ211c3Qgbm90IGRvdWJsZSBkZXN0cm95IGVsZW1lbnRzJylcbiAgICBkZWxldGUgZWxlbWVudFNldFtlbGVtZW50cy5pZF1cbiAgICBlbGVtZW50cy5idWZmZXIuZGVzdHJveSgpXG4gICAgZWxlbWVudHMuYnVmZmVyID0gbnVsbFxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlRWxlbWVudHMgKG9wdGlvbnMsIHBlcnNpc3RlbnQpIHtcbiAgICB2YXIgYnVmZmVyID0gYnVmZmVyU3RhdGUuY3JlYXRlKG51bGwsIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSLCB0cnVlKVxuICAgIHZhciBlbGVtZW50cyA9IG5ldyBSRUdMRWxlbWVudEJ1ZmZlcihidWZmZXIuX2J1ZmZlcilcbiAgICBzdGF0cy5lbGVtZW50c0NvdW50KytcblxuICAgIGZ1bmN0aW9uIHJlZ2xFbGVtZW50cyAob3B0aW9ucykge1xuICAgICAgaWYgKCFvcHRpb25zKSB7XG4gICAgICAgIGJ1ZmZlcigpXG4gICAgICAgIGVsZW1lbnRzLnByaW1UeXBlID0gR0xfVFJJQU5HTEVTXG4gICAgICAgIGVsZW1lbnRzLnZlcnRDb3VudCA9IDBcbiAgICAgICAgZWxlbWVudHMudHlwZSA9IEdMX1VOU0lHTkVEX0JZVEVcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIG9wdGlvbnMgPT09ICdudW1iZXInKSB7XG4gICAgICAgIGJ1ZmZlcihvcHRpb25zKVxuICAgICAgICBlbGVtZW50cy5wcmltVHlwZSA9IEdMX1RSSUFOR0xFU1xuICAgICAgICBlbGVtZW50cy52ZXJ0Q291bnQgPSBvcHRpb25zIHwgMFxuICAgICAgICBlbGVtZW50cy50eXBlID0gR0xfVU5TSUdORURfQllURVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIGRhdGEgPSBudWxsXG4gICAgICAgIHZhciB1c2FnZSA9IEdMX1NUQVRJQ19EUkFXXG4gICAgICAgIHZhciBwcmltVHlwZSA9IC0xXG4gICAgICAgIHZhciB2ZXJ0Q291bnQgPSAtMVxuICAgICAgICB2YXIgYnl0ZUxlbmd0aCA9IDBcbiAgICAgICAgdmFyIGR0eXBlID0gMFxuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShvcHRpb25zKSB8fFxuICAgICAgICAgICAgaXNUeXBlZEFycmF5KG9wdGlvbnMpIHx8XG4gICAgICAgICAgICBpc05EQXJyYXlMaWtlKG9wdGlvbnMpKSB7XG4gICAgICAgICAgZGF0YSA9IG9wdGlvbnNcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjaGVjay50eXBlKG9wdGlvbnMsICdvYmplY3QnLCAnaW52YWxpZCBhcmd1bWVudHMgZm9yIGVsZW1lbnRzJylcbiAgICAgICAgICBpZiAoJ2RhdGEnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGRhdGEgPSBvcHRpb25zLmRhdGFcbiAgICAgICAgICAgIGNoZWNrKFxuICAgICAgICAgICAgICAgIEFycmF5LmlzQXJyYXkoZGF0YSkgfHxcbiAgICAgICAgICAgICAgICBpc1R5cGVkQXJyYXkoZGF0YSkgfHxcbiAgICAgICAgICAgICAgICBpc05EQXJyYXlMaWtlKGRhdGEpLFxuICAgICAgICAgICAgICAgICdpbnZhbGlkIGRhdGEgZm9yIGVsZW1lbnQgYnVmZmVyJylcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCd1c2FnZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgY2hlY2sucGFyYW1ldGVyKFxuICAgICAgICAgICAgICBvcHRpb25zLnVzYWdlLFxuICAgICAgICAgICAgICB1c2FnZVR5cGVzLFxuICAgICAgICAgICAgICAnaW52YWxpZCBlbGVtZW50IGJ1ZmZlciB1c2FnZScpXG4gICAgICAgICAgICB1c2FnZSA9IHVzYWdlVHlwZXNbb3B0aW9ucy51c2FnZV1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCdwcmltaXRpdmUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGNoZWNrLnBhcmFtZXRlcihcbiAgICAgICAgICAgICAgb3B0aW9ucy5wcmltaXRpdmUsXG4gICAgICAgICAgICAgIHByaW1UeXBlcyxcbiAgICAgICAgICAgICAgJ2ludmFsaWQgZWxlbWVudCBidWZmZXIgcHJpbWl0aXZlJylcbiAgICAgICAgICAgIHByaW1UeXBlID0gcHJpbVR5cGVzW29wdGlvbnMucHJpbWl0aXZlXVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoJ2NvdW50JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBjaGVjayhcbiAgICAgICAgICAgICAgdHlwZW9mIG9wdGlvbnMuY291bnQgPT09ICdudW1iZXInICYmIG9wdGlvbnMuY291bnQgPj0gMCxcbiAgICAgICAgICAgICAgJ2ludmFsaWQgdmVydGV4IGNvdW50IGZvciBlbGVtZW50cycpXG4gICAgICAgICAgICB2ZXJ0Q291bnQgPSBvcHRpb25zLmNvdW50IHwgMFxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoJ3R5cGUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGNoZWNrLnBhcmFtZXRlcihcbiAgICAgICAgICAgICAgb3B0aW9ucy50eXBlLFxuICAgICAgICAgICAgICBlbGVtZW50VHlwZXMsXG4gICAgICAgICAgICAgICdpbnZhbGlkIGJ1ZmZlciB0eXBlJylcbiAgICAgICAgICAgIGR0eXBlID0gZWxlbWVudFR5cGVzW29wdGlvbnMudHlwZV1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCdsZW5ndGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGJ5dGVMZW5ndGggPSBvcHRpb25zLmxlbmd0aCB8IDBcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYnl0ZUxlbmd0aCA9IHZlcnRDb3VudFxuICAgICAgICAgICAgaWYgKGR0eXBlID09PSBHTF9VTlNJR05FRF9TSE9SVCB8fCBkdHlwZSA9PT0gR0xfU0hPUlQpIHtcbiAgICAgICAgICAgICAgYnl0ZUxlbmd0aCAqPSAyXG4gICAgICAgICAgICB9IGVsc2UgaWYgKGR0eXBlID09PSBHTF9VTlNJR05FRF9JTlQgfHwgZHR5cGUgPT09IEdMX0lOVCkge1xuICAgICAgICAgICAgICBieXRlTGVuZ3RoICo9IDRcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaW5pdEVsZW1lbnRzKFxuICAgICAgICAgIGVsZW1lbnRzLFxuICAgICAgICAgIGRhdGEsXG4gICAgICAgICAgdXNhZ2UsXG4gICAgICAgICAgcHJpbVR5cGUsXG4gICAgICAgICAgdmVydENvdW50LFxuICAgICAgICAgIGJ5dGVMZW5ndGgsXG4gICAgICAgICAgZHR5cGUpXG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZWdsRWxlbWVudHNcbiAgICB9XG5cbiAgICByZWdsRWxlbWVudHMob3B0aW9ucylcblxuICAgIHJlZ2xFbGVtZW50cy5fcmVnbFR5cGUgPSAnZWxlbWVudHMnXG4gICAgcmVnbEVsZW1lbnRzLl9lbGVtZW50cyA9IGVsZW1lbnRzXG4gICAgcmVnbEVsZW1lbnRzLnN1YmRhdGEgPSBmdW5jdGlvbiAoZGF0YSwgb2Zmc2V0KSB7XG4gICAgICBidWZmZXIuc3ViZGF0YShkYXRhLCBvZmZzZXQpXG4gICAgICByZXR1cm4gcmVnbEVsZW1lbnRzXG4gICAgfVxuICAgIHJlZ2xFbGVtZW50cy5kZXN0cm95ID0gZnVuY3Rpb24gKCkge1xuICAgICAgZGVzdHJveUVsZW1lbnRzKGVsZW1lbnRzKVxuICAgIH1cblxuICAgIHJldHVybiByZWdsRWxlbWVudHNcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY3JlYXRlOiBjcmVhdGVFbGVtZW50cyxcbiAgICBjcmVhdGVTdHJlYW06IGNyZWF0ZUVsZW1lbnRTdHJlYW0sXG4gICAgZGVzdHJveVN0cmVhbTogZGVzdHJveUVsZW1lbnRTdHJlYW0sXG4gICAgZ2V0RWxlbWVudHM6IGZ1bmN0aW9uIChlbGVtZW50cykge1xuICAgICAgaWYgKHR5cGVvZiBlbGVtZW50cyA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgICAgIGVsZW1lbnRzLl9lbGVtZW50cyBpbnN0YW5jZW9mIFJFR0xFbGVtZW50QnVmZmVyKSB7XG4gICAgICAgIHJldHVybiBlbGVtZW50cy5fZWxlbWVudHNcbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsXG4gICAgfSxcbiAgICBjbGVhcjogZnVuY3Rpb24gKCkge1xuICAgICAgdmFsdWVzKGVsZW1lbnRTZXQpLmZvckVhY2goZGVzdHJveUVsZW1lbnRzKVxuICAgIH1cbiAgfVxufVxuIiwidmFyIGNoZWNrID0gcmVxdWlyZSgnLi91dGlsL2NoZWNrJylcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjcmVhdGVFeHRlbnNpb25DYWNoZSAoZ2wsIGNvbmZpZykge1xuICB2YXIgZXh0ZW5zaW9ucyA9IHt9XG5cbiAgZnVuY3Rpb24gdHJ5TG9hZEV4dGVuc2lvbiAobmFtZV8pIHtcbiAgICBjaGVjay50eXBlKG5hbWVfLCAnc3RyaW5nJywgJ2V4dGVuc2lvbiBuYW1lIG11c3QgYmUgc3RyaW5nJylcbiAgICB2YXIgbmFtZSA9IG5hbWVfLnRvTG93ZXJDYXNlKClcbiAgICB2YXIgZXh0XG4gICAgdHJ5IHtcbiAgICAgIGV4dCA9IGV4dGVuc2lvbnNbbmFtZV0gPSBnbC5nZXRFeHRlbnNpb24obmFtZSlcbiAgICB9IGNhdGNoIChlKSB7fVxuICAgIHJldHVybiAhIWV4dFxuICB9XG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBjb25maWcuZXh0ZW5zaW9ucy5sZW5ndGg7ICsraSkge1xuICAgIHZhciBuYW1lID0gY29uZmlnLmV4dGVuc2lvbnNbaV1cbiAgICBpZiAoIXRyeUxvYWRFeHRlbnNpb24obmFtZSkpIHtcbiAgICAgIGNvbmZpZy5vbkRlc3Ryb3koKVxuICAgICAgY29uZmlnLm9uRG9uZSgnXCInICsgbmFtZSArICdcIiBleHRlbnNpb24gaXMgbm90IHN1cHBvcnRlZCBieSB0aGUgY3VycmVudCBXZWJHTCBjb250ZXh0LCB0cnkgdXBncmFkaW5nIHlvdXIgc3lzdGVtIG9yIGEgZGlmZmVyZW50IGJyb3dzZXInKVxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG4gIH1cblxuICBjb25maWcub3B0aW9uYWxFeHRlbnNpb25zLmZvckVhY2godHJ5TG9hZEV4dGVuc2lvbilcblxuICByZXR1cm4ge1xuICAgIGV4dGVuc2lvbnM6IGV4dGVuc2lvbnMsXG4gICAgcmVzdG9yZTogZnVuY3Rpb24gKCkge1xuICAgICAgT2JqZWN0LmtleXMoZXh0ZW5zaW9ucykuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgICBpZiAoIXRyeUxvYWRFeHRlbnNpb24obmFtZSkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJyhyZWdsKTogZXJyb3IgcmVzdG9yaW5nIGV4dGVuc2lvbiAnICsgbmFtZSlcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICB9XG4gIH1cbn1cbiIsInZhciBjaGVjayA9IHJlcXVpcmUoJy4vdXRpbC9jaGVjaycpXG52YXIgdmFsdWVzID0gcmVxdWlyZSgnLi91dGlsL3ZhbHVlcycpXG52YXIgZXh0ZW5kID0gcmVxdWlyZSgnLi91dGlsL2V4dGVuZCcpXG5cbi8vIFdlIHN0b3JlIHRoZXNlIGNvbnN0YW50cyBzbyB0aGF0IHRoZSBtaW5pZmllciBjYW4gaW5saW5lIHRoZW1cbnZhciBHTF9GUkFNRUJVRkZFUiA9IDB4OEQ0MFxudmFyIEdMX1JFTkRFUkJVRkZFUiA9IDB4OEQ0MVxuXG52YXIgR0xfVEVYVFVSRV8yRCA9IDB4MERFMVxudmFyIEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCA9IDB4ODUxNVxuXG52YXIgR0xfQ09MT1JfQVRUQUNITUVOVDAgPSAweDhDRTBcbnZhciBHTF9ERVBUSF9BVFRBQ0hNRU5UID0gMHg4RDAwXG52YXIgR0xfU1RFTkNJTF9BVFRBQ0hNRU5UID0gMHg4RDIwXG52YXIgR0xfREVQVEhfU1RFTkNJTF9BVFRBQ0hNRU5UID0gMHg4MjFBXG5cbnZhciBHTF9GUkFNRUJVRkZFUl9DT01QTEVURSA9IDB4OENENVxudmFyIEdMX0ZSQU1FQlVGRkVSX0lOQ09NUExFVEVfQVRUQUNITUVOVCA9IDB4OENENlxudmFyIEdMX0ZSQU1FQlVGRkVSX0lOQ09NUExFVEVfTUlTU0lOR19BVFRBQ0hNRU5UID0gMHg4Q0Q3XG52YXIgR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9ESU1FTlNJT05TID0gMHg4Q0Q5XG52YXIgR0xfRlJBTUVCVUZGRVJfVU5TVVBQT1JURUQgPSAweDhDRERcblxudmFyIEdMX0hBTEZfRkxPQVRfT0VTID0gMHg4RDYxXG52YXIgR0xfVU5TSUdORURfQllURSA9IDB4MTQwMVxudmFyIEdMX0ZMT0FUID0gMHgxNDA2XG5cbnZhciBHTF9SR0JBID0gMHgxOTA4XG5cbnZhciBHTF9ERVBUSF9DT01QT05FTlQgPSAweDE5MDJcblxudmFyIGNvbG9yVGV4dHVyZUZvcm1hdEVudW1zID0gW1xuICBHTF9SR0JBXG5dXG5cbi8vIGZvciBldmVyeSB0ZXh0dXJlIGZvcm1hdCwgc3RvcmVcbi8vIHRoZSBudW1iZXIgb2YgY2hhbm5lbHNcbnZhciB0ZXh0dXJlRm9ybWF0Q2hhbm5lbHMgPSBbXVxudGV4dHVyZUZvcm1hdENoYW5uZWxzW0dMX1JHQkFdID0gNFxuXG4vLyBmb3IgZXZlcnkgdGV4dHVyZSB0eXBlLCBzdG9yZVxuLy8gdGhlIHNpemUgaW4gYnl0ZXMuXG52YXIgdGV4dHVyZVR5cGVTaXplcyA9IFtdXG50ZXh0dXJlVHlwZVNpemVzW0dMX1VOU0lHTkVEX0JZVEVdID0gMVxudGV4dHVyZVR5cGVTaXplc1tHTF9GTE9BVF0gPSA0XG50ZXh0dXJlVHlwZVNpemVzW0dMX0hBTEZfRkxPQVRfT0VTXSA9IDJcblxudmFyIEdMX1JHQkE0ID0gMHg4MDU2XG52YXIgR0xfUkdCNV9BMSA9IDB4ODA1N1xudmFyIEdMX1JHQjU2NSA9IDB4OEQ2MlxudmFyIEdMX0RFUFRIX0NPTVBPTkVOVDE2ID0gMHg4MUE1XG52YXIgR0xfU1RFTkNJTF9JTkRFWDggPSAweDhENDhcbnZhciBHTF9ERVBUSF9TVEVOQ0lMID0gMHg4NEY5XG5cbnZhciBHTF9TUkdCOF9BTFBIQThfRVhUID0gMHg4QzQzXG5cbnZhciBHTF9SR0JBMzJGX0VYVCA9IDB4ODgxNFxuXG52YXIgR0xfUkdCQTE2Rl9FWFQgPSAweDg4MUFcbnZhciBHTF9SR0IxNkZfRVhUID0gMHg4ODFCXG5cbnZhciBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdEVudW1zID0gW1xuICBHTF9SR0JBNCxcbiAgR0xfUkdCNV9BMSxcbiAgR0xfUkdCNTY1LFxuICBHTF9TUkdCOF9BTFBIQThfRVhULFxuICBHTF9SR0JBMTZGX0VYVCxcbiAgR0xfUkdCMTZGX0VYVCxcbiAgR0xfUkdCQTMyRl9FWFRcbl1cblxudmFyIHN0YXR1c0NvZGUgPSB7fVxuc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9DT01QTEVURV0gPSAnY29tcGxldGUnXG5zdGF0dXNDb2RlW0dMX0ZSQU1FQlVGRkVSX0lOQ09NUExFVEVfQVRUQUNITUVOVF0gPSAnaW5jb21wbGV0ZSBhdHRhY2htZW50J1xuc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX0RJTUVOU0lPTlNdID0gJ2luY29tcGxldGUgZGltZW5zaW9ucydcbnN0YXR1c0NvZGVbR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9NSVNTSU5HX0FUVEFDSE1FTlRdID0gJ2luY29tcGxldGUsIG1pc3NpbmcgYXR0YWNobWVudCdcbnN0YXR1c0NvZGVbR0xfRlJBTUVCVUZGRVJfVU5TVVBQT1JURURdID0gJ3Vuc3VwcG9ydGVkJ1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBGQk9TdGF0ZSAoXG4gIGdsLFxuICBleHRlbnNpb25zLFxuICBsaW1pdHMsXG4gIHRleHR1cmVTdGF0ZSxcbiAgcmVuZGVyYnVmZmVyU3RhdGUsXG4gIHN0YXRzKSB7XG4gIHZhciBmcmFtZWJ1ZmZlclN0YXRlID0ge1xuICAgIGN1cjogbnVsbCxcbiAgICBuZXh0OiBudWxsLFxuICAgIGRpcnR5OiBmYWxzZSxcbiAgICBzZXRGQk86IG51bGxcbiAgfVxuXG4gIHZhciBjb2xvclRleHR1cmVGb3JtYXRzID0gWydyZ2JhJ11cbiAgdmFyIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0cyA9IFsncmdiYTQnLCAncmdiNTY1JywgJ3JnYjUgYTEnXVxuXG4gIGlmIChleHRlbnNpb25zLmV4dF9zcmdiKSB7XG4gICAgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzLnB1c2goJ3NyZ2JhJylcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLmV4dF9jb2xvcl9idWZmZXJfaGFsZl9mbG9hdCkge1xuICAgIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0cy5wdXNoKCdyZ2JhMTZmJywgJ3JnYjE2ZicpXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb2xvcl9idWZmZXJfZmxvYXQpIHtcbiAgICBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHMucHVzaCgncmdiYTMyZicpXG4gIH1cblxuICB2YXIgY29sb3JUeXBlcyA9IFsndWludDgnXVxuICBpZiAoZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9oYWxmX2Zsb2F0KSB7XG4gICAgY29sb3JUeXBlcy5wdXNoKCdoYWxmIGZsb2F0JywgJ2Zsb2F0MTYnKVxuICB9XG4gIGlmIChleHRlbnNpb25zLm9lc190ZXh0dXJlX2Zsb2F0KSB7XG4gICAgY29sb3JUeXBlcy5wdXNoKCdmbG9hdCcsICdmbG9hdDMyJylcbiAgfVxuXG4gIGZ1bmN0aW9uIEZyYW1lYnVmZmVyQXR0YWNobWVudCAodGFyZ2V0LCB0ZXh0dXJlLCByZW5kZXJidWZmZXIpIHtcbiAgICB0aGlzLnRhcmdldCA9IHRhcmdldFxuICAgIHRoaXMudGV4dHVyZSA9IHRleHR1cmVcbiAgICB0aGlzLnJlbmRlcmJ1ZmZlciA9IHJlbmRlcmJ1ZmZlclxuXG4gICAgdmFyIHcgPSAwXG4gICAgdmFyIGggPSAwXG4gICAgaWYgKHRleHR1cmUpIHtcbiAgICAgIHcgPSB0ZXh0dXJlLndpZHRoXG4gICAgICBoID0gdGV4dHVyZS5oZWlnaHRcbiAgICB9IGVsc2UgaWYgKHJlbmRlcmJ1ZmZlcikge1xuICAgICAgdyA9IHJlbmRlcmJ1ZmZlci53aWR0aFxuICAgICAgaCA9IHJlbmRlcmJ1ZmZlci5oZWlnaHRcbiAgICB9XG4gICAgdGhpcy53aWR0aCA9IHdcbiAgICB0aGlzLmhlaWdodCA9IGhcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlY1JlZiAoYXR0YWNobWVudCkge1xuICAgIGlmIChhdHRhY2htZW50KSB7XG4gICAgICBpZiAoYXR0YWNobWVudC50ZXh0dXJlKSB7XG4gICAgICAgIGF0dGFjaG1lbnQudGV4dHVyZS5fdGV4dHVyZS5kZWNSZWYoKVxuICAgICAgfVxuICAgICAgaWYgKGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyKSB7XG4gICAgICAgIGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXIuZGVjUmVmKClcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBpbmNSZWZBbmRDaGVja1NoYXBlIChhdHRhY2htZW50LCB3aWR0aCwgaGVpZ2h0KSB7XG4gICAgaWYgKCFhdHRhY2htZW50KSB7XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgaWYgKGF0dGFjaG1lbnQudGV4dHVyZSkge1xuICAgICAgdmFyIHRleHR1cmUgPSBhdHRhY2htZW50LnRleHR1cmUuX3RleHR1cmVcbiAgICAgIHZhciB0dyA9IE1hdGgubWF4KDEsIHRleHR1cmUud2lkdGgpXG4gICAgICB2YXIgdGggPSBNYXRoLm1heCgxLCB0ZXh0dXJlLmhlaWdodClcbiAgICAgIGNoZWNrKHR3ID09PSB3aWR0aCAmJiB0aCA9PT0gaGVpZ2h0LFxuICAgICAgICAnaW5jb25zaXN0ZW50IHdpZHRoL2hlaWdodCBmb3Igc3VwcGxpZWQgdGV4dHVyZScpXG4gICAgICB0ZXh0dXJlLnJlZkNvdW50ICs9IDFcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIHJlbmRlcmJ1ZmZlciA9IGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXJcbiAgICAgIGNoZWNrKFxuICAgICAgICByZW5kZXJidWZmZXIud2lkdGggPT09IHdpZHRoICYmIHJlbmRlcmJ1ZmZlci5oZWlnaHQgPT09IGhlaWdodCxcbiAgICAgICAgJ2luY29uc2lzdGVudCB3aWR0aC9oZWlnaHQgZm9yIHJlbmRlcmJ1ZmZlcicpXG4gICAgICByZW5kZXJidWZmZXIucmVmQ291bnQgKz0gMVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGF0dGFjaCAobG9jYXRpb24sIGF0dGFjaG1lbnQpIHtcbiAgICBpZiAoYXR0YWNobWVudCkge1xuICAgICAgaWYgKGF0dGFjaG1lbnQudGV4dHVyZSkge1xuICAgICAgICBnbC5mcmFtZWJ1ZmZlclRleHR1cmUyRChcbiAgICAgICAgICBHTF9GUkFNRUJVRkZFUixcbiAgICAgICAgICBsb2NhdGlvbixcbiAgICAgICAgICBhdHRhY2htZW50LnRhcmdldCxcbiAgICAgICAgICBhdHRhY2htZW50LnRleHR1cmUuX3RleHR1cmUudGV4dHVyZSxcbiAgICAgICAgICAwKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZ2wuZnJhbWVidWZmZXJSZW5kZXJidWZmZXIoXG4gICAgICAgICAgR0xfRlJBTUVCVUZGRVIsXG4gICAgICAgICAgbG9jYXRpb24sXG4gICAgICAgICAgR0xfUkVOREVSQlVGRkVSLFxuICAgICAgICAgIGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXIucmVuZGVyYnVmZmVyKVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlQXR0YWNobWVudCAoYXR0YWNobWVudCkge1xuICAgIHZhciB0YXJnZXQgPSBHTF9URVhUVVJFXzJEXG4gICAgdmFyIHRleHR1cmUgPSBudWxsXG4gICAgdmFyIHJlbmRlcmJ1ZmZlciA9IG51bGxcblxuICAgIHZhciBkYXRhID0gYXR0YWNobWVudFxuICAgIGlmICh0eXBlb2YgYXR0YWNobWVudCA9PT0gJ29iamVjdCcpIHtcbiAgICAgIGRhdGEgPSBhdHRhY2htZW50LmRhdGFcbiAgICAgIGlmICgndGFyZ2V0JyBpbiBhdHRhY2htZW50KSB7XG4gICAgICAgIHRhcmdldCA9IGF0dGFjaG1lbnQudGFyZ2V0IHwgMFxuICAgICAgfVxuICAgIH1cblxuICAgIGNoZWNrLnR5cGUoZGF0YSwgJ2Z1bmN0aW9uJywgJ2ludmFsaWQgYXR0YWNobWVudCBkYXRhJylcblxuICAgIHZhciB0eXBlID0gZGF0YS5fcmVnbFR5cGVcbiAgICBpZiAodHlwZSA9PT0gJ3RleHR1cmUyZCcpIHtcbiAgICAgIHRleHR1cmUgPSBkYXRhXG4gICAgICBjaGVjayh0YXJnZXQgPT09IEdMX1RFWFRVUkVfMkQpXG4gICAgfSBlbHNlIGlmICh0eXBlID09PSAndGV4dHVyZUN1YmUnKSB7XG4gICAgICB0ZXh0dXJlID0gZGF0YVxuICAgICAgY2hlY2soXG4gICAgICAgIHRhcmdldCA+PSBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1ggJiZcbiAgICAgICAgdGFyZ2V0IDwgR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YICsgNixcbiAgICAgICAgJ2ludmFsaWQgY3ViZSBtYXAgdGFyZ2V0JylcbiAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICdyZW5kZXJidWZmZXInKSB7XG4gICAgICByZW5kZXJidWZmZXIgPSBkYXRhXG4gICAgICB0YXJnZXQgPSBHTF9SRU5ERVJCVUZGRVJcbiAgICB9IGVsc2Uge1xuICAgICAgY2hlY2sucmFpc2UoJ2ludmFsaWQgcmVnbCBvYmplY3QgZm9yIGF0dGFjaG1lbnQnKVxuICAgIH1cblxuICAgIHJldHVybiBuZXcgRnJhbWVidWZmZXJBdHRhY2htZW50KHRhcmdldCwgdGV4dHVyZSwgcmVuZGVyYnVmZmVyKVxuICB9XG5cbiAgZnVuY3Rpb24gYWxsb2NBdHRhY2htZW50IChcbiAgICB3aWR0aCxcbiAgICBoZWlnaHQsXG4gICAgaXNUZXh0dXJlLFxuICAgIGZvcm1hdCxcbiAgICB0eXBlKSB7XG4gICAgaWYgKGlzVGV4dHVyZSkge1xuICAgICAgdmFyIHRleHR1cmUgPSB0ZXh0dXJlU3RhdGUuY3JlYXRlMkQoe1xuICAgICAgICB3aWR0aDogd2lkdGgsXG4gICAgICAgIGhlaWdodDogaGVpZ2h0LFxuICAgICAgICBmb3JtYXQ6IGZvcm1hdCxcbiAgICAgICAgdHlwZTogdHlwZVxuICAgICAgfSlcbiAgICAgIHRleHR1cmUuX3RleHR1cmUucmVmQ291bnQgPSAwXG4gICAgICByZXR1cm4gbmV3IEZyYW1lYnVmZmVyQXR0YWNobWVudChHTF9URVhUVVJFXzJELCB0ZXh0dXJlLCBudWxsKVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgcmIgPSByZW5kZXJidWZmZXJTdGF0ZS5jcmVhdGUoe1xuICAgICAgICB3aWR0aDogd2lkdGgsXG4gICAgICAgIGhlaWdodDogaGVpZ2h0LFxuICAgICAgICBmb3JtYXQ6IGZvcm1hdFxuICAgICAgfSlcbiAgICAgIHJiLl9yZW5kZXJidWZmZXIucmVmQ291bnQgPSAwXG4gICAgICByZXR1cm4gbmV3IEZyYW1lYnVmZmVyQXR0YWNobWVudChHTF9SRU5ERVJCVUZGRVIsIG51bGwsIHJiKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHVud3JhcEF0dGFjaG1lbnQgKGF0dGFjaG1lbnQpIHtcbiAgICByZXR1cm4gYXR0YWNobWVudCAmJiAoYXR0YWNobWVudC50ZXh0dXJlIHx8IGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyKVxuICB9XG5cbiAgZnVuY3Rpb24gcmVzaXplQXR0YWNobWVudCAoYXR0YWNobWVudCwgdywgaCkge1xuICAgIGlmIChhdHRhY2htZW50KSB7XG4gICAgICBpZiAoYXR0YWNobWVudC50ZXh0dXJlKSB7XG4gICAgICAgIGF0dGFjaG1lbnQudGV4dHVyZS5yZXNpemUodywgaClcbiAgICAgIH0gZWxzZSBpZiAoYXR0YWNobWVudC5yZW5kZXJidWZmZXIpIHtcbiAgICAgICAgYXR0YWNobWVudC5yZW5kZXJidWZmZXIucmVzaXplKHcsIGgpXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgdmFyIGZyYW1lYnVmZmVyQ291bnQgPSAwXG4gIHZhciBmcmFtZWJ1ZmZlclNldCA9IHt9XG5cbiAgZnVuY3Rpb24gUkVHTEZyYW1lYnVmZmVyICgpIHtcbiAgICB0aGlzLmlkID0gZnJhbWVidWZmZXJDb3VudCsrXG4gICAgZnJhbWVidWZmZXJTZXRbdGhpcy5pZF0gPSB0aGlzXG5cbiAgICB0aGlzLmZyYW1lYnVmZmVyID0gZ2wuY3JlYXRlRnJhbWVidWZmZXIoKVxuICAgIHRoaXMud2lkdGggPSAwXG4gICAgdGhpcy5oZWlnaHQgPSAwXG5cbiAgICB0aGlzLmNvbG9yQXR0YWNobWVudHMgPSBbXVxuICAgIHRoaXMuZGVwdGhBdHRhY2htZW50ID0gbnVsbFxuICAgIHRoaXMuc3RlbmNpbEF0dGFjaG1lbnQgPSBudWxsXG4gICAgdGhpcy5kZXB0aFN0ZW5jaWxBdHRhY2htZW50ID0gbnVsbFxuICB9XG5cbiAgZnVuY3Rpb24gZGVjRkJPUmVmcyAoZnJhbWVidWZmZXIpIHtcbiAgICBmcmFtZWJ1ZmZlci5jb2xvckF0dGFjaG1lbnRzLmZvckVhY2goZGVjUmVmKVxuICAgIGRlY1JlZihmcmFtZWJ1ZmZlci5kZXB0aEF0dGFjaG1lbnQpXG4gICAgZGVjUmVmKGZyYW1lYnVmZmVyLnN0ZW5jaWxBdHRhY2htZW50KVxuICAgIGRlY1JlZihmcmFtZWJ1ZmZlci5kZXB0aFN0ZW5jaWxBdHRhY2htZW50KVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSAoZnJhbWVidWZmZXIpIHtcbiAgICB2YXIgaGFuZGxlID0gZnJhbWVidWZmZXIuZnJhbWVidWZmZXJcbiAgICBjaGVjayhoYW5kbGUsICdtdXN0IG5vdCBkb3VibGUgZGVzdHJveSBmcmFtZWJ1ZmZlcicpXG4gICAgZ2wuZGVsZXRlRnJhbWVidWZmZXIoaGFuZGxlKVxuICAgIGZyYW1lYnVmZmVyLmZyYW1lYnVmZmVyID0gbnVsbFxuICAgIHN0YXRzLmZyYW1lYnVmZmVyQ291bnQtLVxuICAgIGRlbGV0ZSBmcmFtZWJ1ZmZlclNldFtmcmFtZWJ1ZmZlci5pZF1cbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZUZyYW1lYnVmZmVyIChmcmFtZWJ1ZmZlcikge1xuICAgIHZhciBpXG5cbiAgICBnbC5iaW5kRnJhbWVidWZmZXIoR0xfRlJBTUVCVUZGRVIsIGZyYW1lYnVmZmVyLmZyYW1lYnVmZmVyKVxuICAgIHZhciBjb2xvckF0dGFjaG1lbnRzID0gZnJhbWVidWZmZXIuY29sb3JBdHRhY2htZW50c1xuICAgIGZvciAoaSA9IDA7IGkgPCBjb2xvckF0dGFjaG1lbnRzLmxlbmd0aDsgKytpKSB7XG4gICAgICBhdHRhY2goR0xfQ09MT1JfQVRUQUNITUVOVDAgKyBpLCBjb2xvckF0dGFjaG1lbnRzW2ldKVxuICAgIH1cbiAgICBmb3IgKGkgPSBjb2xvckF0dGFjaG1lbnRzLmxlbmd0aDsgaSA8IGxpbWl0cy5tYXhDb2xvckF0dGFjaG1lbnRzOyArK2kpIHtcbiAgICAgIGdsLmZyYW1lYnVmZmVyVGV4dHVyZTJEKFxuICAgICAgICBHTF9GUkFNRUJVRkZFUixcbiAgICAgICAgR0xfQ09MT1JfQVRUQUNITUVOVDAgKyBpLFxuICAgICAgICBHTF9URVhUVVJFXzJELFxuICAgICAgICBudWxsLFxuICAgICAgICAwKVxuICAgIH1cblxuICAgIGdsLmZyYW1lYnVmZmVyVGV4dHVyZTJEKFxuICAgICAgR0xfRlJBTUVCVUZGRVIsXG4gICAgICBHTF9ERVBUSF9TVEVOQ0lMX0FUVEFDSE1FTlQsXG4gICAgICBHTF9URVhUVVJFXzJELFxuICAgICAgbnVsbCxcbiAgICAgIDApXG4gICAgZ2wuZnJhbWVidWZmZXJUZXh0dXJlMkQoXG4gICAgICBHTF9GUkFNRUJVRkZFUixcbiAgICAgIEdMX0RFUFRIX0FUVEFDSE1FTlQsXG4gICAgICBHTF9URVhUVVJFXzJELFxuICAgICAgbnVsbCxcbiAgICAgIDApXG4gICAgZ2wuZnJhbWVidWZmZXJUZXh0dXJlMkQoXG4gICAgICBHTF9GUkFNRUJVRkZFUixcbiAgICAgIEdMX1NURU5DSUxfQVRUQUNITUVOVCxcbiAgICAgIEdMX1RFWFRVUkVfMkQsXG4gICAgICBudWxsLFxuICAgICAgMClcblxuICAgIGF0dGFjaChHTF9ERVBUSF9BVFRBQ0hNRU5ULCBmcmFtZWJ1ZmZlci5kZXB0aEF0dGFjaG1lbnQpXG4gICAgYXR0YWNoKEdMX1NURU5DSUxfQVRUQUNITUVOVCwgZnJhbWVidWZmZXIuc3RlbmNpbEF0dGFjaG1lbnQpXG4gICAgYXR0YWNoKEdMX0RFUFRIX1NURU5DSUxfQVRUQUNITUVOVCwgZnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsQXR0YWNobWVudClcblxuICAgIC8vIENoZWNrIHN0YXR1cyBjb2RlXG4gICAgdmFyIHN0YXR1cyA9IGdsLmNoZWNrRnJhbWVidWZmZXJTdGF0dXMoR0xfRlJBTUVCVUZGRVIpXG4gICAgaWYgKHN0YXR1cyAhPT0gR0xfRlJBTUVCVUZGRVJfQ09NUExFVEUpIHtcbiAgICAgIGNoZWNrLnJhaXNlKCdmcmFtZWJ1ZmZlciBjb25maWd1cmF0aW9uIG5vdCBzdXBwb3J0ZWQsIHN0YXR1cyA9ICcgK1xuICAgICAgICBzdGF0dXNDb2RlW3N0YXR1c10pXG4gICAgfVxuXG4gICAgZ2wuYmluZEZyYW1lYnVmZmVyKEdMX0ZSQU1FQlVGRkVSLCBmcmFtZWJ1ZmZlclN0YXRlLm5leHQpXG4gICAgZnJhbWVidWZmZXJTdGF0ZS5jdXIgPSBmcmFtZWJ1ZmZlclN0YXRlLm5leHRcblxuICAgIC8vIEZJWE1FOiBDbGVhciBlcnJvciBjb2RlIGhlcmUuICBUaGlzIGlzIGEgd29yayBhcm91bmQgZm9yIGEgYnVnIGluXG4gICAgLy8gaGVhZGxlc3MtZ2xcbiAgICBnbC5nZXRFcnJvcigpXG4gIH1cblxuICBmdW5jdGlvbiBjcmVhdGVGQk8gKGEwLCBhMSkge1xuICAgIHZhciBmcmFtZWJ1ZmZlciA9IG5ldyBSRUdMRnJhbWVidWZmZXIoKVxuICAgIHN0YXRzLmZyYW1lYnVmZmVyQ291bnQrK1xuXG4gICAgZnVuY3Rpb24gcmVnbEZyYW1lYnVmZmVyIChhLCBiKSB7XG4gICAgICB2YXIgaVxuXG4gICAgICBjaGVjayhmcmFtZWJ1ZmZlclN0YXRlLm5leHQgIT09IGZyYW1lYnVmZmVyLFxuICAgICAgICAnY2FuIG5vdCB1cGRhdGUgZnJhbWVidWZmZXIgd2hpY2ggaXMgY3VycmVudGx5IGluIHVzZScpXG5cbiAgICAgIHZhciBleHREcmF3QnVmZmVycyA9IGV4dGVuc2lvbnMud2ViZ2xfZHJhd19idWZmZXJzXG5cbiAgICAgIHZhciB3aWR0aCA9IDBcbiAgICAgIHZhciBoZWlnaHQgPSAwXG5cbiAgICAgIHZhciBuZWVkc0RlcHRoID0gdHJ1ZVxuICAgICAgdmFyIG5lZWRzU3RlbmNpbCA9IHRydWVcblxuICAgICAgdmFyIGNvbG9yQnVmZmVyID0gbnVsbFxuICAgICAgdmFyIGNvbG9yVGV4dHVyZSA9IHRydWVcbiAgICAgIHZhciBjb2xvckZvcm1hdCA9ICdyZ2JhJ1xuICAgICAgdmFyIGNvbG9yVHlwZSA9ICd1aW50OCdcbiAgICAgIHZhciBjb2xvckNvdW50ID0gMVxuXG4gICAgICB2YXIgZGVwdGhCdWZmZXIgPSBudWxsXG4gICAgICB2YXIgc3RlbmNpbEJ1ZmZlciA9IG51bGxcbiAgICAgIHZhciBkZXB0aFN0ZW5jaWxCdWZmZXIgPSBudWxsXG4gICAgICB2YXIgZGVwdGhTdGVuY2lsVGV4dHVyZSA9IGZhbHNlXG5cbiAgICAgIGlmICh0eXBlb2YgYSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgd2lkdGggPSBhIHwgMFxuICAgICAgICBoZWlnaHQgPSAoYiB8IDApIHx8IHdpZHRoXG4gICAgICB9IGVsc2UgaWYgKCFhKSB7XG4gICAgICAgIHdpZHRoID0gaGVpZ2h0ID0gMVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY2hlY2sudHlwZShhLCAnb2JqZWN0JywgJ2ludmFsaWQgYXJndW1lbnRzIGZvciBmcmFtZWJ1ZmZlcicpXG4gICAgICAgIHZhciBvcHRpb25zID0gYVxuXG4gICAgICAgIGlmICgnc2hhcGUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB2YXIgc2hhcGUgPSBvcHRpb25zLnNoYXBlXG4gICAgICAgICAgY2hlY2soQXJyYXkuaXNBcnJheShzaGFwZSkgJiYgc2hhcGUubGVuZ3RoID49IDIsXG4gICAgICAgICAgICAnaW52YWxpZCBzaGFwZSBmb3IgZnJhbWVidWZmZXInKVxuICAgICAgICAgIHdpZHRoID0gc2hhcGVbMF1cbiAgICAgICAgICBoZWlnaHQgPSBzaGFwZVsxXVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmICgncmFkaXVzJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICB3aWR0aCA9IGhlaWdodCA9IG9wdGlvbnMucmFkaXVzXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgnd2lkdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIHdpZHRoID0gb3B0aW9ucy53aWR0aFxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoJ2hlaWdodCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgaGVpZ2h0ID0gb3B0aW9ucy5oZWlnaHRcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ2NvbG9yJyBpbiBvcHRpb25zIHx8XG4gICAgICAgICAgICAnY29sb3JzJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgY29sb3JCdWZmZXIgPVxuICAgICAgICAgICAgb3B0aW9ucy5jb2xvciB8fFxuICAgICAgICAgICAgb3B0aW9ucy5jb2xvcnNcbiAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShjb2xvckJ1ZmZlcikpIHtcbiAgICAgICAgICAgIGNoZWNrKFxuICAgICAgICAgICAgICBjb2xvckJ1ZmZlci5sZW5ndGggPT09IDEgfHwgZXh0RHJhd0J1ZmZlcnMsXG4gICAgICAgICAgICAgICdtdWx0aXBsZSByZW5kZXIgdGFyZ2V0cyBub3Qgc3VwcG9ydGVkJylcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWNvbG9yQnVmZmVyKSB7XG4gICAgICAgICAgaWYgKCdjb2xvckNvdW50JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBjb2xvckNvdW50ID0gb3B0aW9ucy5jb2xvckNvdW50IHwgMFxuICAgICAgICAgICAgY2hlY2soY29sb3JDb3VudCA+IDAsICdpbnZhbGlkIGNvbG9yIGJ1ZmZlciBjb3VudCcpXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKCdjb2xvclRleHR1cmUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGNvbG9yVGV4dHVyZSA9ICEhb3B0aW9ucy5jb2xvclRleHR1cmVcbiAgICAgICAgICAgIGNvbG9yRm9ybWF0ID0gJ3JnYmE0J1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmICgnY29sb3JUeXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBjb2xvclR5cGUgPSBvcHRpb25zLmNvbG9yVHlwZVxuICAgICAgICAgICAgaWYgKCFjb2xvclRleHR1cmUpIHtcbiAgICAgICAgICAgICAgaWYgKGNvbG9yVHlwZSA9PT0gJ2hhbGYgZmxvYXQnIHx8IGNvbG9yVHlwZSA9PT0gJ2Zsb2F0MTYnKSB7XG4gICAgICAgICAgICAgICAgY2hlY2soZXh0ZW5zaW9ucy5leHRfY29sb3JfYnVmZmVyX2hhbGZfZmxvYXQsXG4gICAgICAgICAgICAgICAgICAneW91IG11c3QgZW5hYmxlIEVYVF9jb2xvcl9idWZmZXJfaGFsZl9mbG9hdCB0byB1c2UgMTYtYml0IHJlbmRlciBidWZmZXJzJylcbiAgICAgICAgICAgICAgICBjb2xvckZvcm1hdCA9ICdyZ2JhMTZmJ1xuICAgICAgICAgICAgICB9IGVsc2UgaWYgKGNvbG9yVHlwZSA9PT0gJ2Zsb2F0JyB8fCBjb2xvclR5cGUgPT09ICdmbG9hdDMyJykge1xuICAgICAgICAgICAgICAgIGNoZWNrKGV4dGVuc2lvbnMud2ViZ2xfY29sb3JfYnVmZmVyX2Zsb2F0LFxuICAgICAgICAgICAgICAgICAgJ3lvdSBtdXN0IGVuYWJsZSBXRUJHTF9jb2xvcl9idWZmZXJfZmxvYXQgaW4gb3JkZXIgdG8gdXNlIDMyLWJpdCBmbG9hdGluZyBwb2ludCByZW5kZXJidWZmZXJzJylcbiAgICAgICAgICAgICAgICBjb2xvckZvcm1hdCA9ICdyZ2JhMzJmJ1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBjaGVjayhleHRlbnNpb25zLm9lc190ZXh0dXJlX2Zsb2F0IHx8XG4gICAgICAgICAgICAgICAgIShjb2xvclR5cGUgPT09ICdmbG9hdCcgfHwgY29sb3JUeXBlID09PSAnZmxvYXQzMicpLFxuICAgICAgICAgICAgICAgICd5b3UgbXVzdCBlbmFibGUgT0VTX3RleHR1cmVfZmxvYXQgaW4gb3JkZXIgdG8gdXNlIGZsb2F0aW5nIHBvaW50IGZyYW1lYnVmZmVyIG9iamVjdHMnKVxuICAgICAgICAgICAgICBjaGVjayhleHRlbnNpb25zLm9lc190ZXh0dXJlX2hhbGZfZmxvYXQgfHxcbiAgICAgICAgICAgICAgICAhKGNvbG9yVHlwZSA9PT0gJ2hhbGYgZmxvYXQnIHx8IGNvbG9yVHlwZSA9PT0gJ2Zsb2F0MTYnKSxcbiAgICAgICAgICAgICAgICAneW91IG11c3QgZW5hYmxlIE9FU190ZXh0dXJlX2hhbGZfZmxvYXQgaW4gb3JkZXIgdG8gdXNlIDE2LWJpdCBmbG9hdGluZyBwb2ludCBmcmFtZWJ1ZmZlciBvYmplY3RzJylcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNoZWNrLm9uZU9mKGNvbG9yVHlwZSwgY29sb3JUeXBlcywgJ2ludmFsaWQgY29sb3IgdHlwZScpXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKCdjb2xvckZvcm1hdCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgY29sb3JGb3JtYXQgPSBvcHRpb25zLmNvbG9yRm9ybWF0XG4gICAgICAgICAgICBpZiAoY29sb3JUZXh0dXJlRm9ybWF0cy5pbmRleE9mKGNvbG9yRm9ybWF0KSA+PSAwKSB7XG4gICAgICAgICAgICAgIGNvbG9yVGV4dHVyZSA9IHRydWVcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzLmluZGV4T2YoY29sb3JGb3JtYXQpID49IDApIHtcbiAgICAgICAgICAgICAgY29sb3JUZXh0dXJlID0gZmFsc2VcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGlmIChjb2xvclRleHR1cmUpIHtcbiAgICAgICAgICAgICAgICBjaGVjay5vbmVPZihcbiAgICAgICAgICAgICAgICAgIG9wdGlvbnMuY29sb3JGb3JtYXQsIGNvbG9yVGV4dHVyZUZvcm1hdHMsXG4gICAgICAgICAgICAgICAgICAnaW52YWxpZCBjb2xvciBmb3JtYXQgZm9yIHRleHR1cmUnKVxuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNoZWNrLm9uZU9mKFxuICAgICAgICAgICAgICAgICAgb3B0aW9ucy5jb2xvckZvcm1hdCwgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzLFxuICAgICAgICAgICAgICAgICAgJ2ludmFsaWQgY29sb3IgZm9ybWF0IGZvciByZW5kZXJidWZmZXInKVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdkZXB0aFRleHR1cmUnIGluIG9wdGlvbnMgfHwgJ2RlcHRoU3RlbmNpbFRleHR1cmUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBkZXB0aFN0ZW5jaWxUZXh0dXJlID0gISEob3B0aW9ucy5kZXB0aFRleHR1cmUgfHxcbiAgICAgICAgICAgIG9wdGlvbnMuZGVwdGhTdGVuY2lsVGV4dHVyZSlcbiAgICAgICAgICBjaGVjayghZGVwdGhTdGVuY2lsVGV4dHVyZSB8fCBleHRlbnNpb25zLndlYmdsX2RlcHRoX3RleHR1cmUsXG4gICAgICAgICAgICAnd2ViZ2xfZGVwdGhfdGV4dHVyZSBleHRlbnNpb24gbm90IHN1cHBvcnRlZCcpXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ2RlcHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiBvcHRpb25zLmRlcHRoID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgIG5lZWRzRGVwdGggPSBvcHRpb25zLmRlcHRoXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGRlcHRoQnVmZmVyID0gb3B0aW9ucy5kZXB0aFxuICAgICAgICAgICAgbmVlZHNTdGVuY2lsID0gZmFsc2VcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ3N0ZW5jaWwnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBpZiAodHlwZW9mIG9wdGlvbnMuc3RlbmNpbCA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgICBuZWVkc1N0ZW5jaWwgPSBvcHRpb25zLnN0ZW5jaWxcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc3RlbmNpbEJ1ZmZlciA9IG9wdGlvbnMuc3RlbmNpbFxuICAgICAgICAgICAgbmVlZHNEZXB0aCA9IGZhbHNlXG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdkZXB0aFN0ZW5jaWwnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBpZiAodHlwZW9mIG9wdGlvbnMuZGVwdGhTdGVuY2lsID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgIG5lZWRzRGVwdGggPSBuZWVkc1N0ZW5jaWwgPSBvcHRpb25zLmRlcHRoU3RlbmNpbFxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBkZXB0aFN0ZW5jaWxCdWZmZXIgPSBvcHRpb25zLmRlcHRoU3RlbmNpbFxuICAgICAgICAgICAgbmVlZHNEZXB0aCA9IGZhbHNlXG4gICAgICAgICAgICBuZWVkc1N0ZW5jaWwgPSBmYWxzZVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBwYXJzZSBhdHRhY2htZW50c1xuICAgICAgdmFyIGNvbG9yQXR0YWNobWVudHMgPSBudWxsXG4gICAgICB2YXIgZGVwdGhBdHRhY2htZW50ID0gbnVsbFxuICAgICAgdmFyIHN0ZW5jaWxBdHRhY2htZW50ID0gbnVsbFxuICAgICAgdmFyIGRlcHRoU3RlbmNpbEF0dGFjaG1lbnQgPSBudWxsXG5cbiAgICAgIC8vIFNldCB1cCBjb2xvciBhdHRhY2htZW50c1xuICAgICAgaWYgKEFycmF5LmlzQXJyYXkoY29sb3JCdWZmZXIpKSB7XG4gICAgICAgIGNvbG9yQXR0YWNobWVudHMgPSBjb2xvckJ1ZmZlci5tYXAocGFyc2VBdHRhY2htZW50KVxuICAgICAgfSBlbHNlIGlmIChjb2xvckJ1ZmZlcikge1xuICAgICAgICBjb2xvckF0dGFjaG1lbnRzID0gW3BhcnNlQXR0YWNobWVudChjb2xvckJ1ZmZlcildXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb2xvckF0dGFjaG1lbnRzID0gbmV3IEFycmF5KGNvbG9yQ291bnQpXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xvckNvdW50OyArK2kpIHtcbiAgICAgICAgICBjb2xvckF0dGFjaG1lbnRzW2ldID0gYWxsb2NBdHRhY2htZW50KFxuICAgICAgICAgICAgd2lkdGgsXG4gICAgICAgICAgICBoZWlnaHQsXG4gICAgICAgICAgICBjb2xvclRleHR1cmUsXG4gICAgICAgICAgICBjb2xvckZvcm1hdCxcbiAgICAgICAgICAgIGNvbG9yVHlwZSlcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjaGVjayhleHRlbnNpb25zLndlYmdsX2RyYXdfYnVmZmVycyB8fCBjb2xvckF0dGFjaG1lbnRzLmxlbmd0aCA8PSAxLFxuICAgICAgICAneW91IG11c3QgZW5hYmxlIHRoZSBXRUJHTF9kcmF3X2J1ZmZlcnMgZXh0ZW5zaW9uIGluIG9yZGVyIHRvIHVzZSBtdWx0aXBsZSBjb2xvciBidWZmZXJzLicpXG4gICAgICBjaGVjayhjb2xvckF0dGFjaG1lbnRzLmxlbmd0aCA8PSBsaW1pdHMubWF4Q29sb3JBdHRhY2htZW50cyxcbiAgICAgICAgJ3RvbyBtYW55IGNvbG9yIGF0dGFjaG1lbnRzLCBub3Qgc3VwcG9ydGVkJylcblxuICAgICAgd2lkdGggPSB3aWR0aCB8fCBjb2xvckF0dGFjaG1lbnRzWzBdLndpZHRoXG4gICAgICBoZWlnaHQgPSBoZWlnaHQgfHwgY29sb3JBdHRhY2htZW50c1swXS5oZWlnaHRcblxuICAgICAgaWYgKGRlcHRoQnVmZmVyKSB7XG4gICAgICAgIGRlcHRoQXR0YWNobWVudCA9IHBhcnNlQXR0YWNobWVudChkZXB0aEJ1ZmZlcilcbiAgICAgIH0gZWxzZSBpZiAobmVlZHNEZXB0aCAmJiAhbmVlZHNTdGVuY2lsKSB7XG4gICAgICAgIGRlcHRoQXR0YWNobWVudCA9IGFsbG9jQXR0YWNobWVudChcbiAgICAgICAgICB3aWR0aCxcbiAgICAgICAgICBoZWlnaHQsXG4gICAgICAgICAgZGVwdGhTdGVuY2lsVGV4dHVyZSxcbiAgICAgICAgICAnZGVwdGgnLFxuICAgICAgICAgICd1aW50MzInKVxuICAgICAgfVxuXG4gICAgICBpZiAoc3RlbmNpbEJ1ZmZlcikge1xuICAgICAgICBzdGVuY2lsQXR0YWNobWVudCA9IHBhcnNlQXR0YWNobWVudChzdGVuY2lsQnVmZmVyKVxuICAgICAgfSBlbHNlIGlmIChuZWVkc1N0ZW5jaWwgJiYgIW5lZWRzRGVwdGgpIHtcbiAgICAgICAgc3RlbmNpbEF0dGFjaG1lbnQgPSBhbGxvY0F0dGFjaG1lbnQoXG4gICAgICAgICAgd2lkdGgsXG4gICAgICAgICAgaGVpZ2h0LFxuICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgICdzdGVuY2lsJyxcbiAgICAgICAgICAndWludDgnKVxuICAgICAgfVxuXG4gICAgICBpZiAoZGVwdGhTdGVuY2lsQnVmZmVyKSB7XG4gICAgICAgIGRlcHRoU3RlbmNpbEF0dGFjaG1lbnQgPSBwYXJzZUF0dGFjaG1lbnQoZGVwdGhTdGVuY2lsQnVmZmVyKVxuICAgICAgfSBlbHNlIGlmICghZGVwdGhCdWZmZXIgJiYgIXN0ZW5jaWxCdWZmZXIgJiYgbmVlZHNTdGVuY2lsICYmIG5lZWRzRGVwdGgpIHtcbiAgICAgICAgZGVwdGhTdGVuY2lsQXR0YWNobWVudCA9IGFsbG9jQXR0YWNobWVudChcbiAgICAgICAgICB3aWR0aCxcbiAgICAgICAgICBoZWlnaHQsXG4gICAgICAgICAgZGVwdGhTdGVuY2lsVGV4dHVyZSxcbiAgICAgICAgICAnZGVwdGggc3RlbmNpbCcsXG4gICAgICAgICAgJ2RlcHRoIHN0ZW5jaWwnKVxuICAgICAgfVxuXG4gICAgICBjaGVjayhcbiAgICAgICAgKCEhZGVwdGhCdWZmZXIpICsgKCEhc3RlbmNpbEJ1ZmZlcikgKyAoISFkZXB0aFN0ZW5jaWxCdWZmZXIpIDw9IDEsXG4gICAgICAgICdpbnZhbGlkIGZyYW1lYnVmZmVyIGNvbmZpZ3VyYXRpb24sIGNhbiBzcGVjaWZ5IGV4YWN0bHkgb25lIGRlcHRoL3N0ZW5jaWwgYXR0YWNobWVudCcpXG5cbiAgICAgIHZhciBjb21tb25Db2xvckF0dGFjaG1lbnRTaXplID0gbnVsbFxuXG4gICAgICBmb3IgKGkgPSAwOyBpIDwgY29sb3JBdHRhY2htZW50cy5sZW5ndGg7ICsraSkge1xuICAgICAgICBpbmNSZWZBbmRDaGVja1NoYXBlKGNvbG9yQXR0YWNobWVudHNbaV0sIHdpZHRoLCBoZWlnaHQpXG4gICAgICAgIGNoZWNrKCFjb2xvckF0dGFjaG1lbnRzW2ldIHx8XG4gICAgICAgICAgKGNvbG9yQXR0YWNobWVudHNbaV0udGV4dHVyZSAmJlxuICAgICAgICAgICAgY29sb3JUZXh0dXJlRm9ybWF0RW51bXMuaW5kZXhPZihjb2xvckF0dGFjaG1lbnRzW2ldLnRleHR1cmUuX3RleHR1cmUuZm9ybWF0KSA+PSAwKSB8fFxuICAgICAgICAgIChjb2xvckF0dGFjaG1lbnRzW2ldLnJlbmRlcmJ1ZmZlciAmJlxuICAgICAgICAgICAgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRFbnVtcy5pbmRleE9mKGNvbG9yQXR0YWNobWVudHNbaV0ucmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXIuZm9ybWF0KSA+PSAwKSxcbiAgICAgICAgICAnZnJhbWVidWZmZXIgY29sb3IgYXR0YWNobWVudCAnICsgaSArICcgaXMgaW52YWxpZCcpXG5cbiAgICAgICAgaWYgKGNvbG9yQXR0YWNobWVudHNbaV0gJiYgY29sb3JBdHRhY2htZW50c1tpXS50ZXh0dXJlKSB7XG4gICAgICAgICAgdmFyIGNvbG9yQXR0YWNobWVudFNpemUgPVxuICAgICAgICAgICAgICB0ZXh0dXJlRm9ybWF0Q2hhbm5lbHNbY29sb3JBdHRhY2htZW50c1tpXS50ZXh0dXJlLl90ZXh0dXJlLmZvcm1hdF0gKlxuICAgICAgICAgICAgICB0ZXh0dXJlVHlwZVNpemVzW2NvbG9yQXR0YWNobWVudHNbaV0udGV4dHVyZS5fdGV4dHVyZS50eXBlXVxuXG4gICAgICAgICAgaWYgKGNvbW1vbkNvbG9yQXR0YWNobWVudFNpemUgPT09IG51bGwpIHtcbiAgICAgICAgICAgIGNvbW1vbkNvbG9yQXR0YWNobWVudFNpemUgPSBjb2xvckF0dGFjaG1lbnRTaXplXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIFdlIG5lZWQgdG8gbWFrZSBzdXJlIHRoYXQgYWxsIGNvbG9yIGF0dGFjaG1lbnRzIGhhdmUgdGhlIHNhbWUgbnVtYmVyIG9mIGJpdHBsYW5lc1xuICAgICAgICAgICAgLy8gKHRoYXQgaXMsIHRoZSBzYW1lIG51bWVyIG9mIGJpdHMgcGVyIHBpeGVsKVxuICAgICAgICAgICAgLy8gVGhpcyBpcyByZXF1aXJlZCBieSB0aGUgR0xFUzIuMCBzdGFuZGFyZC4gU2VlIHRoZSBiZWdpbm5pbmcgb2YgQ2hhcHRlciA0IGluIHRoYXQgZG9jdW1lbnQuXG4gICAgICAgICAgICBjaGVjayhjb21tb25Db2xvckF0dGFjaG1lbnRTaXplID09PSBjb2xvckF0dGFjaG1lbnRTaXplLFxuICAgICAgICAgICAgICAgICAgJ2FsbCBjb2xvciBhdHRhY2htZW50cyBtdWNoIGhhdmUgdGhlIHNhbWUgbnVtYmVyIG9mIGJpdHMgcGVyIHBpeGVsLicpXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpbmNSZWZBbmRDaGVja1NoYXBlKGRlcHRoQXR0YWNobWVudCwgd2lkdGgsIGhlaWdodClcbiAgICAgIGNoZWNrKCFkZXB0aEF0dGFjaG1lbnQgfHxcbiAgICAgICAgKGRlcHRoQXR0YWNobWVudC50ZXh0dXJlICYmXG4gICAgICAgICAgZGVwdGhBdHRhY2htZW50LnRleHR1cmUuX3RleHR1cmUuZm9ybWF0ID09PSBHTF9ERVBUSF9DT01QT05FTlQpIHx8XG4gICAgICAgIChkZXB0aEF0dGFjaG1lbnQucmVuZGVyYnVmZmVyICYmXG4gICAgICAgICAgZGVwdGhBdHRhY2htZW50LnJlbmRlcmJ1ZmZlci5fcmVuZGVyYnVmZmVyLmZvcm1hdCA9PT0gR0xfREVQVEhfQ09NUE9ORU5UMTYpLFxuICAgICAgICAnaW52YWxpZCBkZXB0aCBhdHRhY2htZW50IGZvciBmcmFtZWJ1ZmZlciBvYmplY3QnKVxuICAgICAgaW5jUmVmQW5kQ2hlY2tTaGFwZShzdGVuY2lsQXR0YWNobWVudCwgd2lkdGgsIGhlaWdodClcbiAgICAgIGNoZWNrKCFzdGVuY2lsQXR0YWNobWVudCB8fFxuICAgICAgICAoc3RlbmNpbEF0dGFjaG1lbnQucmVuZGVyYnVmZmVyICYmXG4gICAgICAgICAgc3RlbmNpbEF0dGFjaG1lbnQucmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXIuZm9ybWF0ID09PSBHTF9TVEVOQ0lMX0lOREVYOCksXG4gICAgICAgICdpbnZhbGlkIHN0ZW5jaWwgYXR0YWNobWVudCBmb3IgZnJhbWVidWZmZXIgb2JqZWN0JylcbiAgICAgIGluY1JlZkFuZENoZWNrU2hhcGUoZGVwdGhTdGVuY2lsQXR0YWNobWVudCwgd2lkdGgsIGhlaWdodClcbiAgICAgIGNoZWNrKCFkZXB0aFN0ZW5jaWxBdHRhY2htZW50IHx8XG4gICAgICAgIChkZXB0aFN0ZW5jaWxBdHRhY2htZW50LnRleHR1cmUgJiZcbiAgICAgICAgICBkZXB0aFN0ZW5jaWxBdHRhY2htZW50LnRleHR1cmUuX3RleHR1cmUuZm9ybWF0ID09PSBHTF9ERVBUSF9TVEVOQ0lMKSB8fFxuICAgICAgICAoZGVwdGhTdGVuY2lsQXR0YWNobWVudC5yZW5kZXJidWZmZXIgJiZcbiAgICAgICAgICBkZXB0aFN0ZW5jaWxBdHRhY2htZW50LnJlbmRlcmJ1ZmZlci5fcmVuZGVyYnVmZmVyLmZvcm1hdCA9PT0gR0xfREVQVEhfU1RFTkNJTCksXG4gICAgICAgICdpbnZhbGlkIGRlcHRoLXN0ZW5jaWwgYXR0YWNobWVudCBmb3IgZnJhbWVidWZmZXIgb2JqZWN0JylcblxuICAgICAgLy8gZGVjcmVtZW50IHJlZmVyZW5jZXNcbiAgICAgIGRlY0ZCT1JlZnMoZnJhbWVidWZmZXIpXG5cbiAgICAgIGZyYW1lYnVmZmVyLndpZHRoID0gd2lkdGhcbiAgICAgIGZyYW1lYnVmZmVyLmhlaWdodCA9IGhlaWdodFxuXG4gICAgICBmcmFtZWJ1ZmZlci5jb2xvckF0dGFjaG1lbnRzID0gY29sb3JBdHRhY2htZW50c1xuICAgICAgZnJhbWVidWZmZXIuZGVwdGhBdHRhY2htZW50ID0gZGVwdGhBdHRhY2htZW50XG4gICAgICBmcmFtZWJ1ZmZlci5zdGVuY2lsQXR0YWNobWVudCA9IHN0ZW5jaWxBdHRhY2htZW50XG4gICAgICBmcmFtZWJ1ZmZlci5kZXB0aFN0ZW5jaWxBdHRhY2htZW50ID0gZGVwdGhTdGVuY2lsQXR0YWNobWVudFxuXG4gICAgICByZWdsRnJhbWVidWZmZXIuY29sb3IgPSBjb2xvckF0dGFjaG1lbnRzLm1hcCh1bndyYXBBdHRhY2htZW50KVxuICAgICAgcmVnbEZyYW1lYnVmZmVyLmRlcHRoID0gdW53cmFwQXR0YWNobWVudChkZXB0aEF0dGFjaG1lbnQpXG4gICAgICByZWdsRnJhbWVidWZmZXIuc3RlbmNpbCA9IHVud3JhcEF0dGFjaG1lbnQoc3RlbmNpbEF0dGFjaG1lbnQpXG4gICAgICByZWdsRnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsID0gdW53cmFwQXR0YWNobWVudChkZXB0aFN0ZW5jaWxBdHRhY2htZW50KVxuXG4gICAgICByZWdsRnJhbWVidWZmZXIud2lkdGggPSBmcmFtZWJ1ZmZlci53aWR0aFxuICAgICAgcmVnbEZyYW1lYnVmZmVyLmhlaWdodCA9IGZyYW1lYnVmZmVyLmhlaWdodFxuXG4gICAgICB1cGRhdGVGcmFtZWJ1ZmZlcihmcmFtZWJ1ZmZlcilcblxuICAgICAgcmV0dXJuIHJlZ2xGcmFtZWJ1ZmZlclxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlc2l6ZSAod18sIGhfKSB7XG4gICAgICBjaGVjayhmcmFtZWJ1ZmZlclN0YXRlLm5leHQgIT09IGZyYW1lYnVmZmVyLFxuICAgICAgICAnY2FuIG5vdCByZXNpemUgYSBmcmFtZWJ1ZmZlciB3aGljaCBpcyBjdXJyZW50bHkgaW4gdXNlJylcblxuICAgICAgdmFyIHcgPSB3XyB8IDBcbiAgICAgIHZhciBoID0gKGhfIHwgMCkgfHwgd1xuICAgICAgaWYgKHcgPT09IGZyYW1lYnVmZmVyLndpZHRoICYmIGggPT09IGZyYW1lYnVmZmVyLmhlaWdodCkge1xuICAgICAgICByZXR1cm4gcmVnbEZyYW1lYnVmZmVyXG4gICAgICB9XG5cbiAgICAgIC8vIHJlc2l6ZSBhbGwgYnVmZmVyc1xuICAgICAgdmFyIGNvbG9yQXR0YWNobWVudHMgPSBmcmFtZWJ1ZmZlci5jb2xvckF0dGFjaG1lbnRzXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNvbG9yQXR0YWNobWVudHMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgcmVzaXplQXR0YWNobWVudChjb2xvckF0dGFjaG1lbnRzW2ldLCB3LCBoKVxuICAgICAgfVxuICAgICAgcmVzaXplQXR0YWNobWVudChmcmFtZWJ1ZmZlci5kZXB0aEF0dGFjaG1lbnQsIHcsIGgpXG4gICAgICByZXNpemVBdHRhY2htZW50KGZyYW1lYnVmZmVyLnN0ZW5jaWxBdHRhY2htZW50LCB3LCBoKVxuICAgICAgcmVzaXplQXR0YWNobWVudChmcmFtZWJ1ZmZlci5kZXB0aFN0ZW5jaWxBdHRhY2htZW50LCB3LCBoKVxuXG4gICAgICBmcmFtZWJ1ZmZlci53aWR0aCA9IHJlZ2xGcmFtZWJ1ZmZlci53aWR0aCA9IHdcbiAgICAgIGZyYW1lYnVmZmVyLmhlaWdodCA9IHJlZ2xGcmFtZWJ1ZmZlci5oZWlnaHQgPSBoXG5cbiAgICAgIHVwZGF0ZUZyYW1lYnVmZmVyKGZyYW1lYnVmZmVyKVxuXG4gICAgICByZXR1cm4gcmVnbEZyYW1lYnVmZmVyXG4gICAgfVxuXG4gICAgcmVnbEZyYW1lYnVmZmVyKGEwLCBhMSlcblxuICAgIHJldHVybiBleHRlbmQocmVnbEZyYW1lYnVmZmVyLCB7XG4gICAgICByZXNpemU6IHJlc2l6ZSxcbiAgICAgIF9yZWdsVHlwZTogJ2ZyYW1lYnVmZmVyJyxcbiAgICAgIF9mcmFtZWJ1ZmZlcjogZnJhbWVidWZmZXIsXG4gICAgICBkZXN0cm95OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGRlc3Ryb3koZnJhbWVidWZmZXIpXG4gICAgICAgIGRlY0ZCT1JlZnMoZnJhbWVidWZmZXIpXG4gICAgICB9LFxuICAgICAgYmluZDogZnVuY3Rpb24gKGJsb2NrKSB7XG4gICAgICAgIGZyYW1lYnVmZmVyU3RhdGUuc2V0RkJPKHtcbiAgICAgICAgICBmcmFtZWJ1ZmZlcjogcmVnbEZyYW1lYnVmZmVyXG4gICAgICAgIH0sIGJsb2NrKVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiBjcmVhdGVDdWJlRkJPIChvcHRpb25zKSB7XG4gICAgdmFyIGZhY2VzID0gQXJyYXkoNilcblxuICAgIGZ1bmN0aW9uIHJlZ2xGcmFtZWJ1ZmZlckN1YmUgKGEpIHtcbiAgICAgIHZhciBpXG5cbiAgICAgIGNoZWNrKGZhY2VzLmluZGV4T2YoZnJhbWVidWZmZXJTdGF0ZS5uZXh0KSA8IDAsXG4gICAgICAgICdjYW4gbm90IHVwZGF0ZSBmcmFtZWJ1ZmZlciB3aGljaCBpcyBjdXJyZW50bHkgaW4gdXNlJylcblxuICAgICAgdmFyIGV4dERyYXdCdWZmZXJzID0gZXh0ZW5zaW9ucy53ZWJnbF9kcmF3X2J1ZmZlcnNcblxuICAgICAgdmFyIHBhcmFtcyA9IHtcbiAgICAgICAgY29sb3I6IG51bGxcbiAgICAgIH1cblxuICAgICAgdmFyIHJhZGl1cyA9IDBcblxuICAgICAgdmFyIGNvbG9yQnVmZmVyID0gbnVsbFxuICAgICAgdmFyIGNvbG9yRm9ybWF0ID0gJ3JnYmEnXG4gICAgICB2YXIgY29sb3JUeXBlID0gJ3VpbnQ4J1xuICAgICAgdmFyIGNvbG9yQ291bnQgPSAxXG5cbiAgICAgIGlmICh0eXBlb2YgYSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgcmFkaXVzID0gYSB8IDBcbiAgICAgIH0gZWxzZSBpZiAoIWEpIHtcbiAgICAgICAgcmFkaXVzID0gMVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY2hlY2sudHlwZShhLCAnb2JqZWN0JywgJ2ludmFsaWQgYXJndW1lbnRzIGZvciBmcmFtZWJ1ZmZlcicpXG4gICAgICAgIHZhciBvcHRpb25zID0gYVxuXG4gICAgICAgIGlmICgnc2hhcGUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB2YXIgc2hhcGUgPSBvcHRpb25zLnNoYXBlXG4gICAgICAgICAgY2hlY2soXG4gICAgICAgICAgICBBcnJheS5pc0FycmF5KHNoYXBlKSAmJiBzaGFwZS5sZW5ndGggPj0gMixcbiAgICAgICAgICAgICdpbnZhbGlkIHNoYXBlIGZvciBmcmFtZWJ1ZmZlcicpXG4gICAgICAgICAgY2hlY2soXG4gICAgICAgICAgICBzaGFwZVswXSA9PT0gc2hhcGVbMV0sXG4gICAgICAgICAgICAnY3ViZSBmcmFtZWJ1ZmZlciBtdXN0IGJlIHNxdWFyZScpXG4gICAgICAgICAgcmFkaXVzID0gc2hhcGVbMF1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAoJ3JhZGl1cycgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgcmFkaXVzID0gb3B0aW9ucy5yYWRpdXMgfCAwXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgnd2lkdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIHJhZGl1cyA9IG9wdGlvbnMud2lkdGggfCAwXG4gICAgICAgICAgICBpZiAoJ2hlaWdodCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgICBjaGVjayhvcHRpb25zLmhlaWdodCA9PT0gcmFkaXVzLCAnbXVzdCBiZSBzcXVhcmUnKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSBpZiAoJ2hlaWdodCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgcmFkaXVzID0gb3B0aW9ucy5oZWlnaHQgfCAwXG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdjb2xvcicgaW4gb3B0aW9ucyB8fFxuICAgICAgICAgICAgJ2NvbG9ycycgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGNvbG9yQnVmZmVyID1cbiAgICAgICAgICAgIG9wdGlvbnMuY29sb3IgfHxcbiAgICAgICAgICAgIG9wdGlvbnMuY29sb3JzXG4gICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoY29sb3JCdWZmZXIpKSB7XG4gICAgICAgICAgICBjaGVjayhcbiAgICAgICAgICAgICAgY29sb3JCdWZmZXIubGVuZ3RoID09PSAxIHx8IGV4dERyYXdCdWZmZXJzLFxuICAgICAgICAgICAgICAnbXVsdGlwbGUgcmVuZGVyIHRhcmdldHMgbm90IHN1cHBvcnRlZCcpXG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFjb2xvckJ1ZmZlcikge1xuICAgICAgICAgIGlmICgnY29sb3JDb3VudCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgY29sb3JDb3VudCA9IG9wdGlvbnMuY29sb3JDb3VudCB8IDBcbiAgICAgICAgICAgIGNoZWNrKGNvbG9yQ291bnQgPiAwLCAnaW52YWxpZCBjb2xvciBidWZmZXIgY291bnQnKVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmICgnY29sb3JUeXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBjaGVjay5vbmVPZihcbiAgICAgICAgICAgICAgb3B0aW9ucy5jb2xvclR5cGUsIGNvbG9yVHlwZXMsXG4gICAgICAgICAgICAgICdpbnZhbGlkIGNvbG9yIHR5cGUnKVxuICAgICAgICAgICAgY29sb3JUeXBlID0gb3B0aW9ucy5jb2xvclR5cGVcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoJ2NvbG9yRm9ybWF0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBjb2xvckZvcm1hdCA9IG9wdGlvbnMuY29sb3JGb3JtYXRcbiAgICAgICAgICAgIGNoZWNrLm9uZU9mKFxuICAgICAgICAgICAgICBvcHRpb25zLmNvbG9yRm9ybWF0LCBjb2xvclRleHR1cmVGb3JtYXRzLFxuICAgICAgICAgICAgICAnaW52YWxpZCBjb2xvciBmb3JtYXQgZm9yIHRleHR1cmUnKVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnZGVwdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBwYXJhbXMuZGVwdGggPSBvcHRpb25zLmRlcHRoXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ3N0ZW5jaWwnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBwYXJhbXMuc3RlbmNpbCA9IG9wdGlvbnMuc3RlbmNpbFxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdkZXB0aFN0ZW5jaWwnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBwYXJhbXMuZGVwdGhTdGVuY2lsID0gb3B0aW9ucy5kZXB0aFN0ZW5jaWxcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICB2YXIgY29sb3JDdWJlc1xuICAgICAgaWYgKGNvbG9yQnVmZmVyKSB7XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KGNvbG9yQnVmZmVyKSkge1xuICAgICAgICAgIGNvbG9yQ3ViZXMgPSBbXVxuICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xvckJ1ZmZlci5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgY29sb3JDdWJlc1tpXSA9IGNvbG9yQnVmZmVyW2ldXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbG9yQ3ViZXMgPSBbIGNvbG9yQnVmZmVyIF1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29sb3JDdWJlcyA9IEFycmF5KGNvbG9yQ291bnQpXG4gICAgICAgIHZhciBjdWJlTWFwUGFyYW1zID0ge1xuICAgICAgICAgIHJhZGl1czogcmFkaXVzLFxuICAgICAgICAgIGZvcm1hdDogY29sb3JGb3JtYXQsXG4gICAgICAgICAgdHlwZTogY29sb3JUeXBlXG4gICAgICAgIH1cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGNvbG9yQ291bnQ7ICsraSkge1xuICAgICAgICAgIGNvbG9yQ3ViZXNbaV0gPSB0ZXh0dXJlU3RhdGUuY3JlYXRlQ3ViZShjdWJlTWFwUGFyYW1zKVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIENoZWNrIGNvbG9yIGN1YmVzXG4gICAgICBwYXJhbXMuY29sb3IgPSBBcnJheShjb2xvckN1YmVzLmxlbmd0aClcbiAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xvckN1YmVzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgIHZhciBjdWJlID0gY29sb3JDdWJlc1tpXVxuICAgICAgICBjaGVjayhcbiAgICAgICAgICB0eXBlb2YgY3ViZSA9PT0gJ2Z1bmN0aW9uJyAmJiBjdWJlLl9yZWdsVHlwZSA9PT0gJ3RleHR1cmVDdWJlJyxcbiAgICAgICAgICAnaW52YWxpZCBjdWJlIG1hcCcpXG4gICAgICAgIHJhZGl1cyA9IHJhZGl1cyB8fCBjdWJlLndpZHRoXG4gICAgICAgIGNoZWNrKFxuICAgICAgICAgIGN1YmUud2lkdGggPT09IHJhZGl1cyAmJiBjdWJlLmhlaWdodCA9PT0gcmFkaXVzLFxuICAgICAgICAgICdpbnZhbGlkIGN1YmUgbWFwIHNoYXBlJylcbiAgICAgICAgcGFyYW1zLmNvbG9yW2ldID0ge1xuICAgICAgICAgIHRhcmdldDogR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YLFxuICAgICAgICAgIGRhdGE6IGNvbG9yQ3ViZXNbaV1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgY29sb3JDdWJlcy5sZW5ndGg7ICsraikge1xuICAgICAgICAgIHBhcmFtcy5jb2xvcltqXS50YXJnZXQgPSBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1ggKyBpXG4gICAgICAgIH1cbiAgICAgICAgLy8gcmV1c2UgZGVwdGgtc3RlbmNpbCBhdHRhY2htZW50cyBhY3Jvc3MgYWxsIGN1YmUgbWFwc1xuICAgICAgICBpZiAoaSA+IDApIHtcbiAgICAgICAgICBwYXJhbXMuZGVwdGggPSBmYWNlc1swXS5kZXB0aFxuICAgICAgICAgIHBhcmFtcy5zdGVuY2lsID0gZmFjZXNbMF0uc3RlbmNpbFxuICAgICAgICAgIHBhcmFtcy5kZXB0aFN0ZW5jaWwgPSBmYWNlc1swXS5kZXB0aFN0ZW5jaWxcbiAgICAgICAgfVxuICAgICAgICBpZiAoZmFjZXNbaV0pIHtcbiAgICAgICAgICAoZmFjZXNbaV0pKHBhcmFtcylcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBmYWNlc1tpXSA9IGNyZWF0ZUZCTyhwYXJhbXMpXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGV4dGVuZChyZWdsRnJhbWVidWZmZXJDdWJlLCB7XG4gICAgICAgIHdpZHRoOiByYWRpdXMsXG4gICAgICAgIGhlaWdodDogcmFkaXVzLFxuICAgICAgICBjb2xvcjogY29sb3JDdWJlc1xuICAgICAgfSlcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZXNpemUgKHJhZGl1c18pIHtcbiAgICAgIHZhciBpXG4gICAgICB2YXIgcmFkaXVzID0gcmFkaXVzXyB8IDBcbiAgICAgIGNoZWNrKHJhZGl1cyA+IDAgJiYgcmFkaXVzIDw9IGxpbWl0cy5tYXhDdWJlTWFwU2l6ZSxcbiAgICAgICAgJ2ludmFsaWQgcmFkaXVzIGZvciBjdWJlIGZibycpXG5cbiAgICAgIGlmIChyYWRpdXMgPT09IHJlZ2xGcmFtZWJ1ZmZlckN1YmUud2lkdGgpIHtcbiAgICAgICAgcmV0dXJuIHJlZ2xGcmFtZWJ1ZmZlckN1YmVcbiAgICAgIH1cblxuICAgICAgdmFyIGNvbG9ycyA9IHJlZ2xGcmFtZWJ1ZmZlckN1YmUuY29sb3JcbiAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xvcnMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgY29sb3JzW2ldLnJlc2l6ZShyYWRpdXMpXG4gICAgICB9XG5cbiAgICAgIGZvciAoaSA9IDA7IGkgPCA2OyArK2kpIHtcbiAgICAgICAgZmFjZXNbaV0ucmVzaXplKHJhZGl1cylcbiAgICAgIH1cblxuICAgICAgcmVnbEZyYW1lYnVmZmVyQ3ViZS53aWR0aCA9IHJlZ2xGcmFtZWJ1ZmZlckN1YmUuaGVpZ2h0ID0gcmFkaXVzXG5cbiAgICAgIHJldHVybiByZWdsRnJhbWVidWZmZXJDdWJlXG4gICAgfVxuXG4gICAgcmVnbEZyYW1lYnVmZmVyQ3ViZShvcHRpb25zKVxuXG4gICAgcmV0dXJuIGV4dGVuZChyZWdsRnJhbWVidWZmZXJDdWJlLCB7XG4gICAgICBmYWNlczogZmFjZXMsXG4gICAgICByZXNpemU6IHJlc2l6ZSxcbiAgICAgIF9yZWdsVHlwZTogJ2ZyYW1lYnVmZmVyQ3ViZScsXG4gICAgICBkZXN0cm95OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGZhY2VzLmZvckVhY2goZnVuY3Rpb24gKGYpIHtcbiAgICAgICAgICBmLmRlc3Ryb3koKVxuICAgICAgICB9KVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiByZXN0b3JlRnJhbWVidWZmZXJzICgpIHtcbiAgICB2YWx1ZXMoZnJhbWVidWZmZXJTZXQpLmZvckVhY2goZnVuY3Rpb24gKGZiKSB7XG4gICAgICBmYi5mcmFtZWJ1ZmZlciA9IGdsLmNyZWF0ZUZyYW1lYnVmZmVyKClcbiAgICAgIHVwZGF0ZUZyYW1lYnVmZmVyKGZiKVxuICAgIH0pXG4gIH1cblxuICByZXR1cm4gZXh0ZW5kKGZyYW1lYnVmZmVyU3RhdGUsIHtcbiAgICBnZXRGcmFtZWJ1ZmZlcjogZnVuY3Rpb24gKG9iamVjdCkge1xuICAgICAgaWYgKHR5cGVvZiBvYmplY3QgPT09ICdmdW5jdGlvbicgJiYgb2JqZWN0Ll9yZWdsVHlwZSA9PT0gJ2ZyYW1lYnVmZmVyJykge1xuICAgICAgICB2YXIgZmJvID0gb2JqZWN0Ll9mcmFtZWJ1ZmZlclxuICAgICAgICBpZiAoZmJvIGluc3RhbmNlb2YgUkVHTEZyYW1lYnVmZmVyKSB7XG4gICAgICAgICAgcmV0dXJuIGZib1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH0sXG4gICAgY3JlYXRlOiBjcmVhdGVGQk8sXG4gICAgY3JlYXRlQ3ViZTogY3JlYXRlQ3ViZUZCTyxcbiAgICBjbGVhcjogZnVuY3Rpb24gKCkge1xuICAgICAgdmFsdWVzKGZyYW1lYnVmZmVyU2V0KS5mb3JFYWNoKGRlc3Ryb3kpXG4gICAgfSxcbiAgICByZXN0b3JlOiByZXN0b3JlRnJhbWVidWZmZXJzXG4gIH0pXG59XG4iLCJ2YXIgR0xfU1VCUElYRUxfQklUUyA9IDB4MEQ1MFxudmFyIEdMX1JFRF9CSVRTID0gMHgwRDUyXG52YXIgR0xfR1JFRU5fQklUUyA9IDB4MEQ1M1xudmFyIEdMX0JMVUVfQklUUyA9IDB4MEQ1NFxudmFyIEdMX0FMUEhBX0JJVFMgPSAweDBENTVcbnZhciBHTF9ERVBUSF9CSVRTID0gMHgwRDU2XG52YXIgR0xfU1RFTkNJTF9CSVRTID0gMHgwRDU3XG5cbnZhciBHTF9BTElBU0VEX1BPSU5UX1NJWkVfUkFOR0UgPSAweDg0NkRcbnZhciBHTF9BTElBU0VEX0xJTkVfV0lEVEhfUkFOR0UgPSAweDg0NkVcblxudmFyIEdMX01BWF9URVhUVVJFX1NJWkUgPSAweDBEMzNcbnZhciBHTF9NQVhfVklFV1BPUlRfRElNUyA9IDB4MEQzQVxudmFyIEdMX01BWF9WRVJURVhfQVRUUklCUyA9IDB4ODg2OVxudmFyIEdMX01BWF9WRVJURVhfVU5JRk9STV9WRUNUT1JTID0gMHg4REZCXG52YXIgR0xfTUFYX1ZBUllJTkdfVkVDVE9SUyA9IDB4OERGQ1xudmFyIEdMX01BWF9DT01CSU5FRF9URVhUVVJFX0lNQUdFX1VOSVRTID0gMHg4QjREXG52YXIgR0xfTUFYX1ZFUlRFWF9URVhUVVJFX0lNQUdFX1VOSVRTID0gMHg4QjRDXG52YXIgR0xfTUFYX1RFWFRVUkVfSU1BR0VfVU5JVFMgPSAweDg4NzJcbnZhciBHTF9NQVhfRlJBR01FTlRfVU5JRk9STV9WRUNUT1JTID0gMHg4REZEXG52YXIgR0xfTUFYX0NVQkVfTUFQX1RFWFRVUkVfU0laRSA9IDB4ODUxQ1xudmFyIEdMX01BWF9SRU5ERVJCVUZGRVJfU0laRSA9IDB4ODRFOFxuXG52YXIgR0xfVkVORE9SID0gMHgxRjAwXG52YXIgR0xfUkVOREVSRVIgPSAweDFGMDFcbnZhciBHTF9WRVJTSU9OID0gMHgxRjAyXG52YXIgR0xfU0hBRElOR19MQU5HVUFHRV9WRVJTSU9OID0gMHg4QjhDXG5cbnZhciBHTF9NQVhfVEVYVFVSRV9NQVhfQU5JU09UUk9QWV9FWFQgPSAweDg0RkZcblxudmFyIEdMX01BWF9DT0xPUl9BVFRBQ0hNRU5UU19XRUJHTCA9IDB4OENERlxudmFyIEdMX01BWF9EUkFXX0JVRkZFUlNfV0VCR0wgPSAweDg4MjRcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoZ2wsIGV4dGVuc2lvbnMpIHtcbiAgdmFyIG1heEFuaXNvdHJvcGljID0gMVxuICBpZiAoZXh0ZW5zaW9ucy5leHRfdGV4dHVyZV9maWx0ZXJfYW5pc290cm9waWMpIHtcbiAgICBtYXhBbmlzb3Ryb3BpYyA9IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVEVYVFVSRV9NQVhfQU5JU09UUk9QWV9FWFQpXG4gIH1cblxuICB2YXIgbWF4RHJhd2J1ZmZlcnMgPSAxXG4gIHZhciBtYXhDb2xvckF0dGFjaG1lbnRzID0gMVxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9kcmF3X2J1ZmZlcnMpIHtcbiAgICBtYXhEcmF3YnVmZmVycyA9IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfRFJBV19CVUZGRVJTX1dFQkdMKVxuICAgIG1heENvbG9yQXR0YWNobWVudHMgPSBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0NPTE9SX0FUVEFDSE1FTlRTX1dFQkdMKVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICAvLyBkcmF3aW5nIGJ1ZmZlciBiaXQgZGVwdGhcbiAgICBjb2xvckJpdHM6IFtcbiAgICAgIGdsLmdldFBhcmFtZXRlcihHTF9SRURfQklUUyksXG4gICAgICBnbC5nZXRQYXJhbWV0ZXIoR0xfR1JFRU5fQklUUyksXG4gICAgICBnbC5nZXRQYXJhbWV0ZXIoR0xfQkxVRV9CSVRTKSxcbiAgICAgIGdsLmdldFBhcmFtZXRlcihHTF9BTFBIQV9CSVRTKVxuICAgIF0sXG4gICAgZGVwdGhCaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfREVQVEhfQklUUyksXG4gICAgc3RlbmNpbEJpdHM6IGdsLmdldFBhcmFtZXRlcihHTF9TVEVOQ0lMX0JJVFMpLFxuICAgIHN1YnBpeGVsQml0czogZ2wuZ2V0UGFyYW1ldGVyKEdMX1NVQlBJWEVMX0JJVFMpLFxuXG4gICAgLy8gc3VwcG9ydGVkIGV4dGVuc2lvbnNcbiAgICBleHRlbnNpb25zOiBPYmplY3Qua2V5cyhleHRlbnNpb25zKS5maWx0ZXIoZnVuY3Rpb24gKGV4dCkge1xuICAgICAgcmV0dXJuICEhZXh0ZW5zaW9uc1tleHRdXG4gICAgfSksXG5cbiAgICAvLyBtYXggYW5pc28gc2FtcGxlc1xuICAgIG1heEFuaXNvdHJvcGljOiBtYXhBbmlzb3Ryb3BpYyxcblxuICAgIC8vIG1heCBkcmF3IGJ1ZmZlcnNcbiAgICBtYXhEcmF3YnVmZmVyczogbWF4RHJhd2J1ZmZlcnMsXG4gICAgbWF4Q29sb3JBdHRhY2htZW50czogbWF4Q29sb3JBdHRhY2htZW50cyxcblxuICAgIC8vIHBvaW50IGFuZCBsaW5lIHNpemUgcmFuZ2VzXG4gICAgcG9pbnRTaXplRGltczogZ2wuZ2V0UGFyYW1ldGVyKEdMX0FMSUFTRURfUE9JTlRfU0laRV9SQU5HRSksXG4gICAgbGluZVdpZHRoRGltczogZ2wuZ2V0UGFyYW1ldGVyKEdMX0FMSUFTRURfTElORV9XSURUSF9SQU5HRSksXG4gICAgbWF4Vmlld3BvcnREaW1zOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1ZJRVdQT1JUX0RJTVMpLFxuICAgIG1heENvbWJpbmVkVGV4dHVyZVVuaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0NPTUJJTkVEX1RFWFRVUkVfSU1BR0VfVU5JVFMpLFxuICAgIG1heEN1YmVNYXBTaXplOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0NVQkVfTUFQX1RFWFRVUkVfU0laRSksXG4gICAgbWF4UmVuZGVyYnVmZmVyU2l6ZTogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9SRU5ERVJCVUZGRVJfU0laRSksXG4gICAgbWF4VGV4dHVyZVVuaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1RFWFRVUkVfSU1BR0VfVU5JVFMpLFxuICAgIG1heFRleHR1cmVTaXplOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1RFWFRVUkVfU0laRSksXG4gICAgbWF4QXR0cmlidXRlczogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9WRVJURVhfQVRUUklCUyksXG4gICAgbWF4VmVydGV4VW5pZm9ybXM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVkVSVEVYX1VOSUZPUk1fVkVDVE9SUyksXG4gICAgbWF4VmVydGV4VGV4dHVyZVVuaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1ZFUlRFWF9URVhUVVJFX0lNQUdFX1VOSVRTKSxcbiAgICBtYXhWYXJ5aW5nVmVjdG9yczogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9WQVJZSU5HX1ZFQ1RPUlMpLFxuICAgIG1heEZyYWdtZW50VW5pZm9ybXM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfRlJBR01FTlRfVU5JRk9STV9WRUNUT1JTKSxcblxuICAgIC8vIHZlbmRvciBpbmZvXG4gICAgZ2xzbDogZ2wuZ2V0UGFyYW1ldGVyKEdMX1NIQURJTkdfTEFOR1VBR0VfVkVSU0lPTiksXG4gICAgcmVuZGVyZXI6IGdsLmdldFBhcmFtZXRlcihHTF9SRU5ERVJFUiksXG4gICAgdmVuZG9yOiBnbC5nZXRQYXJhbWV0ZXIoR0xfVkVORE9SKSxcbiAgICB2ZXJzaW9uOiBnbC5nZXRQYXJhbWV0ZXIoR0xfVkVSU0lPTilcbiAgfVxufVxuIiwidmFyIGNoZWNrID0gcmVxdWlyZSgnLi91dGlsL2NoZWNrJylcbnZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL3V0aWwvaXMtdHlwZWQtYXJyYXknKVxuXG52YXIgR0xfUkdCQSA9IDY0MDhcbnZhciBHTF9VTlNJR05FRF9CWVRFID0gNTEyMVxudmFyIEdMX1BBQ0tfQUxJR05NRU5UID0gMHgwRDA1XG52YXIgR0xfRkxPQVQgPSAweDE0MDYgLy8gNTEyNlxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBSZWFkUGl4ZWxzIChcbiAgZ2wsXG4gIGZyYW1lYnVmZmVyU3RhdGUsXG4gIHJlZ2xQb2xsLFxuICBjb250ZXh0LFxuICBnbEF0dHJpYnV0ZXMsXG4gIGV4dGVuc2lvbnMpIHtcbiAgZnVuY3Rpb24gcmVhZFBpeGVsc0ltcGwgKGlucHV0KSB7XG4gICAgdmFyIHR5cGVcbiAgICBpZiAoZnJhbWVidWZmZXJTdGF0ZS5uZXh0ID09PSBudWxsKSB7XG4gICAgICBjaGVjayhcbiAgICAgICAgZ2xBdHRyaWJ1dGVzLnByZXNlcnZlRHJhd2luZ0J1ZmZlcixcbiAgICAgICAgJ3lvdSBtdXN0IGNyZWF0ZSBhIHdlYmdsIGNvbnRleHQgd2l0aCBcInByZXNlcnZlRHJhd2luZ0J1ZmZlclwiOnRydWUgaW4gb3JkZXIgdG8gcmVhZCBwaXhlbHMgZnJvbSB0aGUgZHJhd2luZyBidWZmZXInKVxuICAgICAgdHlwZSA9IEdMX1VOU0lHTkVEX0JZVEVcbiAgICB9IGVsc2Uge1xuICAgICAgY2hlY2soXG4gICAgICAgIGZyYW1lYnVmZmVyU3RhdGUubmV4dC5jb2xvckF0dGFjaG1lbnRzWzBdLnRleHR1cmUgIT09IG51bGwsXG4gICAgICAgICAgJ1lvdSBjYW5ub3QgcmVhZCBmcm9tIGEgcmVuZGVyYnVmZmVyJylcbiAgICAgIHR5cGUgPSBmcmFtZWJ1ZmZlclN0YXRlLm5leHQuY29sb3JBdHRhY2htZW50c1swXS50ZXh0dXJlLl90ZXh0dXJlLnR5cGVcblxuICAgICAgaWYgKGV4dGVuc2lvbnMub2VzX3RleHR1cmVfZmxvYXQpIHtcbiAgICAgICAgY2hlY2soXG4gICAgICAgICAgdHlwZSA9PT0gR0xfVU5TSUdORURfQllURSB8fCB0eXBlID09PSBHTF9GTE9BVCxcbiAgICAgICAgICAnUmVhZGluZyBmcm9tIGEgZnJhbWVidWZmZXIgaXMgb25seSBhbGxvd2VkIGZvciB0aGUgdHlwZXMgXFwndWludDhcXCcgYW5kIFxcJ2Zsb2F0XFwnJylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNoZWNrKFxuICAgICAgICAgIHR5cGUgPT09IEdMX1VOU0lHTkVEX0JZVEUsXG4gICAgICAgICAgJ1JlYWRpbmcgZnJvbSBhIGZyYW1lYnVmZmVyIGlzIG9ubHkgYWxsb3dlZCBmb3IgdGhlIHR5cGUgXFwndWludDhcXCcnKVxuICAgICAgfVxuICAgIH1cblxuICAgIHZhciB4ID0gMFxuICAgIHZhciB5ID0gMFxuICAgIHZhciB3aWR0aCA9IGNvbnRleHQuZnJhbWVidWZmZXJXaWR0aFxuICAgIHZhciBoZWlnaHQgPSBjb250ZXh0LmZyYW1lYnVmZmVySGVpZ2h0XG4gICAgdmFyIGRhdGEgPSBudWxsXG5cbiAgICBpZiAoaXNUeXBlZEFycmF5KGlucHV0KSkge1xuICAgICAgZGF0YSA9IGlucHV0XG4gICAgfSBlbHNlIGlmIChpbnB1dCkge1xuICAgICAgY2hlY2sudHlwZShpbnB1dCwgJ29iamVjdCcsICdpbnZhbGlkIGFyZ3VtZW50cyB0byByZWdsLnJlYWQoKScpXG4gICAgICB4ID0gaW5wdXQueCB8IDBcbiAgICAgIHkgPSBpbnB1dC55IHwgMFxuICAgICAgY2hlY2soXG4gICAgICAgIHggPj0gMCAmJiB4IDwgY29udGV4dC5mcmFtZWJ1ZmZlcldpZHRoLFxuICAgICAgICAnaW52YWxpZCB4IG9mZnNldCBmb3IgcmVnbC5yZWFkJylcbiAgICAgIGNoZWNrKFxuICAgICAgICB5ID49IDAgJiYgeSA8IGNvbnRleHQuZnJhbWVidWZmZXJIZWlnaHQsXG4gICAgICAgICdpbnZhbGlkIHkgb2Zmc2V0IGZvciByZWdsLnJlYWQnKVxuICAgICAgd2lkdGggPSAoaW5wdXQud2lkdGggfHwgKGNvbnRleHQuZnJhbWVidWZmZXJXaWR0aCAtIHgpKSB8IDBcbiAgICAgIGhlaWdodCA9IChpbnB1dC5oZWlnaHQgfHwgKGNvbnRleHQuZnJhbWVidWZmZXJIZWlnaHQgLSB5KSkgfCAwXG4gICAgICBkYXRhID0gaW5wdXQuZGF0YSB8fCBudWxsXG4gICAgfVxuXG4gICAgLy8gc2FuaXR5IGNoZWNrIGlucHV0LmRhdGFcbiAgICBpZiAoZGF0YSkge1xuICAgICAgaWYgKHR5cGUgPT09IEdMX1VOU0lHTkVEX0JZVEUpIHtcbiAgICAgICAgY2hlY2soXG4gICAgICAgICAgZGF0YSBpbnN0YW5jZW9mIFVpbnQ4QXJyYXksXG4gICAgICAgICAgJ2J1ZmZlciBtdXN0IGJlIFxcJ1VpbnQ4QXJyYXlcXCcgd2hlbiByZWFkaW5nIGZyb20gYSBmcmFtZWJ1ZmZlciBvZiB0eXBlIFxcJ3VpbnQ4XFwnJylcbiAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gR0xfRkxPQVQpIHtcbiAgICAgICAgY2hlY2soXG4gICAgICAgICAgZGF0YSBpbnN0YW5jZW9mIEZsb2F0MzJBcnJheSxcbiAgICAgICAgICAnYnVmZmVyIG11c3QgYmUgXFwnRmxvYXQzMkFycmF5XFwnIHdoZW4gcmVhZGluZyBmcm9tIGEgZnJhbWVidWZmZXIgb2YgdHlwZSBcXCdmbG9hdFxcJycpXG4gICAgICB9XG4gICAgfVxuXG4gICAgY2hlY2soXG4gICAgICB3aWR0aCA+IDAgJiYgd2lkdGggKyB4IDw9IGNvbnRleHQuZnJhbWVidWZmZXJXaWR0aCxcbiAgICAgICdpbnZhbGlkIHdpZHRoIGZvciByZWFkIHBpeGVscycpXG4gICAgY2hlY2soXG4gICAgICBoZWlnaHQgPiAwICYmIGhlaWdodCArIHkgPD0gY29udGV4dC5mcmFtZWJ1ZmZlckhlaWdodCxcbiAgICAgICdpbnZhbGlkIGhlaWdodCBmb3IgcmVhZCBwaXhlbHMnKVxuXG4gICAgLy8gVXBkYXRlIFdlYkdMIHN0YXRlXG4gICAgcmVnbFBvbGwoKVxuXG4gICAgLy8gQ29tcHV0ZSBzaXplXG4gICAgdmFyIHNpemUgPSB3aWR0aCAqIGhlaWdodCAqIDRcblxuICAgIC8vIEFsbG9jYXRlIGRhdGFcbiAgICBpZiAoIWRhdGEpIHtcbiAgICAgIGlmICh0eXBlID09PSBHTF9VTlNJR05FRF9CWVRFKSB7XG4gICAgICAgIGRhdGEgPSBuZXcgVWludDhBcnJheShzaXplKVxuICAgICAgfSBlbHNlIGlmICh0eXBlID09PSBHTF9GTE9BVCkge1xuICAgICAgICBkYXRhID0gZGF0YSB8fCBuZXcgRmxvYXQzMkFycmF5KHNpemUpXG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gVHlwZSBjaGVja1xuICAgIGNoZWNrLmlzVHlwZWRBcnJheShkYXRhLCAnZGF0YSBidWZmZXIgZm9yIHJlZ2wucmVhZCgpIG11c3QgYmUgYSB0eXBlZGFycmF5JylcbiAgICBjaGVjayhkYXRhLmJ5dGVMZW5ndGggPj0gc2l6ZSwgJ2RhdGEgYnVmZmVyIGZvciByZWdsLnJlYWQoKSB0b28gc21hbGwnKVxuXG4gICAgLy8gUnVuIHJlYWQgcGl4ZWxzXG4gICAgZ2wucGl4ZWxTdG9yZWkoR0xfUEFDS19BTElHTk1FTlQsIDQpXG4gICAgZ2wucmVhZFBpeGVscyh4LCB5LCB3aWR0aCwgaGVpZ2h0LCBHTF9SR0JBLFxuICAgICAgICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgICAgICAgIGRhdGEpXG5cbiAgICByZXR1cm4gZGF0YVxuICB9XG5cbiAgZnVuY3Rpb24gcmVhZFBpeGVsc0ZCTyAob3B0aW9ucykge1xuICAgIHZhciByZXN1bHRcbiAgICBmcmFtZWJ1ZmZlclN0YXRlLnNldEZCTyh7XG4gICAgICBmcmFtZWJ1ZmZlcjogb3B0aW9ucy5mcmFtZWJ1ZmZlclxuICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgIHJlc3VsdCA9IHJlYWRQaXhlbHNJbXBsKG9wdGlvbnMpXG4gICAgfSlcbiAgICByZXR1cm4gcmVzdWx0XG4gIH1cblxuICBmdW5jdGlvbiByZWFkUGl4ZWxzIChvcHRpb25zKSB7XG4gICAgaWYgKCFvcHRpb25zIHx8ICEoJ2ZyYW1lYnVmZmVyJyBpbiBvcHRpb25zKSkge1xuICAgICAgcmV0dXJuIHJlYWRQaXhlbHNJbXBsKG9wdGlvbnMpXG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiByZWFkUGl4ZWxzRkJPKG9wdGlvbnMpXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHJlYWRQaXhlbHNcbn1cbiIsInZhciBjaGVjayA9IHJlcXVpcmUoJy4vdXRpbC9jaGVjaycpXG52YXIgdmFsdWVzID0gcmVxdWlyZSgnLi91dGlsL3ZhbHVlcycpXG5cbnZhciBHTF9SRU5ERVJCVUZGRVIgPSAweDhENDFcblxudmFyIEdMX1JHQkE0ID0gMHg4MDU2XG52YXIgR0xfUkdCNV9BMSA9IDB4ODA1N1xudmFyIEdMX1JHQjU2NSA9IDB4OEQ2MlxudmFyIEdMX0RFUFRIX0NPTVBPTkVOVDE2ID0gMHg4MUE1XG52YXIgR0xfU1RFTkNJTF9JTkRFWDggPSAweDhENDhcbnZhciBHTF9ERVBUSF9TVEVOQ0lMID0gMHg4NEY5XG5cbnZhciBHTF9TUkdCOF9BTFBIQThfRVhUID0gMHg4QzQzXG5cbnZhciBHTF9SR0JBMzJGX0VYVCA9IDB4ODgxNFxuXG52YXIgR0xfUkdCQTE2Rl9FWFQgPSAweDg4MUFcbnZhciBHTF9SR0IxNkZfRVhUID0gMHg4ODFCXG5cbnZhciBGT1JNQVRfU0laRVMgPSBbXVxuXG5GT1JNQVRfU0laRVNbR0xfUkdCQTRdID0gMlxuRk9STUFUX1NJWkVTW0dMX1JHQjVfQTFdID0gMlxuRk9STUFUX1NJWkVTW0dMX1JHQjU2NV0gPSAyXG5cbkZPUk1BVF9TSVpFU1tHTF9ERVBUSF9DT01QT05FTlQxNl0gPSAyXG5GT1JNQVRfU0laRVNbR0xfU1RFTkNJTF9JTkRFWDhdID0gMVxuRk9STUFUX1NJWkVTW0dMX0RFUFRIX1NURU5DSUxdID0gNFxuXG5GT1JNQVRfU0laRVNbR0xfU1JHQjhfQUxQSEE4X0VYVF0gPSA0XG5GT1JNQVRfU0laRVNbR0xfUkdCQTMyRl9FWFRdID0gMTZcbkZPUk1BVF9TSVpFU1tHTF9SR0JBMTZGX0VYVF0gPSA4XG5GT1JNQVRfU0laRVNbR0xfUkdCMTZGX0VYVF0gPSA2XG5cbmZ1bmN0aW9uIGdldFJlbmRlcmJ1ZmZlclNpemUgKGZvcm1hdCwgd2lkdGgsIGhlaWdodCkge1xuICByZXR1cm4gRk9STUFUX1NJWkVTW2Zvcm1hdF0gKiB3aWR0aCAqIGhlaWdodFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChnbCwgZXh0ZW5zaW9ucywgbGltaXRzLCBzdGF0cywgY29uZmlnKSB7XG4gIHZhciBmb3JtYXRUeXBlcyA9IHtcbiAgICAncmdiYTQnOiBHTF9SR0JBNCxcbiAgICAncmdiNTY1JzogR0xfUkdCNTY1LFxuICAgICdyZ2I1IGExJzogR0xfUkdCNV9BMSxcbiAgICAnZGVwdGgnOiBHTF9ERVBUSF9DT01QT05FTlQxNixcbiAgICAnc3RlbmNpbCc6IEdMX1NURU5DSUxfSU5ERVg4LFxuICAgICdkZXB0aCBzdGVuY2lsJzogR0xfREVQVEhfU1RFTkNJTFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMuZXh0X3NyZ2IpIHtcbiAgICBmb3JtYXRUeXBlc1snc3JnYmEnXSA9IEdMX1NSR0I4X0FMUEhBOF9FWFRcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLmV4dF9jb2xvcl9idWZmZXJfaGFsZl9mbG9hdCkge1xuICAgIGZvcm1hdFR5cGVzWydyZ2JhMTZmJ10gPSBHTF9SR0JBMTZGX0VYVFxuICAgIGZvcm1hdFR5cGVzWydyZ2IxNmYnXSA9IEdMX1JHQjE2Rl9FWFRcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2NvbG9yX2J1ZmZlcl9mbG9hdCkge1xuICAgIGZvcm1hdFR5cGVzWydyZ2JhMzJmJ10gPSBHTF9SR0JBMzJGX0VYVFxuICB9XG5cbiAgdmFyIGZvcm1hdFR5cGVzSW52ZXJ0ID0gW11cbiAgT2JqZWN0LmtleXMoZm9ybWF0VHlwZXMpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgIHZhciB2YWwgPSBmb3JtYXRUeXBlc1trZXldXG4gICAgZm9ybWF0VHlwZXNJbnZlcnRbdmFsXSA9IGtleVxuICB9KVxuXG4gIHZhciByZW5kZXJidWZmZXJDb3VudCA9IDBcbiAgdmFyIHJlbmRlcmJ1ZmZlclNldCA9IHt9XG5cbiAgZnVuY3Rpb24gUkVHTFJlbmRlcmJ1ZmZlciAocmVuZGVyYnVmZmVyKSB7XG4gICAgdGhpcy5pZCA9IHJlbmRlcmJ1ZmZlckNvdW50KytcbiAgICB0aGlzLnJlZkNvdW50ID0gMVxuXG4gICAgdGhpcy5yZW5kZXJidWZmZXIgPSByZW5kZXJidWZmZXJcblxuICAgIHRoaXMuZm9ybWF0ID0gR0xfUkdCQTRcbiAgICB0aGlzLndpZHRoID0gMFxuICAgIHRoaXMuaGVpZ2h0ID0gMFxuXG4gICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICB0aGlzLnN0YXRzID0ge3NpemU6IDB9XG4gICAgfVxuICB9XG5cbiAgUkVHTFJlbmRlcmJ1ZmZlci5wcm90b3R5cGUuZGVjUmVmID0gZnVuY3Rpb24gKCkge1xuICAgIGlmICgtLXRoaXMucmVmQ291bnQgPD0gMCkge1xuICAgICAgZGVzdHJveSh0aGlzKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3kgKHJiKSB7XG4gICAgdmFyIGhhbmRsZSA9IHJiLnJlbmRlcmJ1ZmZlclxuICAgIGNoZWNrKGhhbmRsZSwgJ211c3Qgbm90IGRvdWJsZSBkZXN0cm95IHJlbmRlcmJ1ZmZlcicpXG4gICAgZ2wuYmluZFJlbmRlcmJ1ZmZlcihHTF9SRU5ERVJCVUZGRVIsIG51bGwpXG4gICAgZ2wuZGVsZXRlUmVuZGVyYnVmZmVyKGhhbmRsZSlcbiAgICByYi5yZW5kZXJidWZmZXIgPSBudWxsXG4gICAgcmIucmVmQ291bnQgPSAwXG4gICAgZGVsZXRlIHJlbmRlcmJ1ZmZlclNldFtyYi5pZF1cbiAgICBzdGF0cy5yZW5kZXJidWZmZXJDb3VudC0tXG4gIH1cblxuICBmdW5jdGlvbiBjcmVhdGVSZW5kZXJidWZmZXIgKGEsIGIpIHtcbiAgICB2YXIgcmVuZGVyYnVmZmVyID0gbmV3IFJFR0xSZW5kZXJidWZmZXIoZ2wuY3JlYXRlUmVuZGVyYnVmZmVyKCkpXG4gICAgcmVuZGVyYnVmZmVyU2V0W3JlbmRlcmJ1ZmZlci5pZF0gPSByZW5kZXJidWZmZXJcbiAgICBzdGF0cy5yZW5kZXJidWZmZXJDb3VudCsrXG5cbiAgICBmdW5jdGlvbiByZWdsUmVuZGVyYnVmZmVyIChhLCBiKSB7XG4gICAgICB2YXIgdyA9IDBcbiAgICAgIHZhciBoID0gMFxuICAgICAgdmFyIGZvcm1hdCA9IEdMX1JHQkE0XG5cbiAgICAgIGlmICh0eXBlb2YgYSA9PT0gJ29iamVjdCcgJiYgYSkge1xuICAgICAgICB2YXIgb3B0aW9ucyA9IGFcbiAgICAgICAgaWYgKCdzaGFwZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHZhciBzaGFwZSA9IG9wdGlvbnMuc2hhcGVcbiAgICAgICAgICBjaGVjayhBcnJheS5pc0FycmF5KHNoYXBlKSAmJiBzaGFwZS5sZW5ndGggPj0gMixcbiAgICAgICAgICAgICdpbnZhbGlkIHJlbmRlcmJ1ZmZlciBzaGFwZScpXG4gICAgICAgICAgdyA9IHNoYXBlWzBdIHwgMFxuICAgICAgICAgIGggPSBzaGFwZVsxXSB8IDBcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAoJ3JhZGl1cycgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgdyA9IGggPSBvcHRpb25zLnJhZGl1cyB8IDBcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCd3aWR0aCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgdyA9IG9wdGlvbnMud2lkdGggfCAwXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgnaGVpZ2h0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBoID0gb3B0aW9ucy5oZWlnaHQgfCAwXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmICgnZm9ybWF0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgY2hlY2sucGFyYW1ldGVyKG9wdGlvbnMuZm9ybWF0LCBmb3JtYXRUeXBlcyxcbiAgICAgICAgICAgICdpbnZhbGlkIHJlbmRlcmJ1ZmZlciBmb3JtYXQnKVxuICAgICAgICAgIGZvcm1hdCA9IGZvcm1hdFR5cGVzW29wdGlvbnMuZm9ybWF0XVxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBhID09PSAnbnVtYmVyJykge1xuICAgICAgICB3ID0gYSB8IDBcbiAgICAgICAgaWYgKHR5cGVvZiBiID09PSAnbnVtYmVyJykge1xuICAgICAgICAgIGggPSBiIHwgMFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGggPSB3XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoIWEpIHtcbiAgICAgICAgdyA9IGggPSAxXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjaGVjay5yYWlzZSgnaW52YWxpZCBhcmd1bWVudHMgdG8gcmVuZGVyYnVmZmVyIGNvbnN0cnVjdG9yJylcbiAgICAgIH1cblxuICAgICAgLy8gY2hlY2sgc2hhcGVcbiAgICAgIGNoZWNrKFxuICAgICAgICB3ID4gMCAmJiBoID4gMCAmJlxuICAgICAgICB3IDw9IGxpbWl0cy5tYXhSZW5kZXJidWZmZXJTaXplICYmIGggPD0gbGltaXRzLm1heFJlbmRlcmJ1ZmZlclNpemUsXG4gICAgICAgICdpbnZhbGlkIHJlbmRlcmJ1ZmZlciBzaXplJylcblxuICAgICAgaWYgKHcgPT09IHJlbmRlcmJ1ZmZlci53aWR0aCAmJlxuICAgICAgICAgIGggPT09IHJlbmRlcmJ1ZmZlci5oZWlnaHQgJiZcbiAgICAgICAgICBmb3JtYXQgPT09IHJlbmRlcmJ1ZmZlci5mb3JtYXQpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG5cbiAgICAgIHJlZ2xSZW5kZXJidWZmZXIud2lkdGggPSByZW5kZXJidWZmZXIud2lkdGggPSB3XG4gICAgICByZWdsUmVuZGVyYnVmZmVyLmhlaWdodCA9IHJlbmRlcmJ1ZmZlci5oZWlnaHQgPSBoXG4gICAgICByZW5kZXJidWZmZXIuZm9ybWF0ID0gZm9ybWF0XG5cbiAgICAgIGdsLmJpbmRSZW5kZXJidWZmZXIoR0xfUkVOREVSQlVGRkVSLCByZW5kZXJidWZmZXIucmVuZGVyYnVmZmVyKVxuICAgICAgZ2wucmVuZGVyYnVmZmVyU3RvcmFnZShHTF9SRU5ERVJCVUZGRVIsIGZvcm1hdCwgdywgaClcblxuICAgICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICAgIHJlbmRlcmJ1ZmZlci5zdGF0cy5zaXplID0gZ2V0UmVuZGVyYnVmZmVyU2l6ZShyZW5kZXJidWZmZXIuZm9ybWF0LCByZW5kZXJidWZmZXIud2lkdGgsIHJlbmRlcmJ1ZmZlci5oZWlnaHQpXG4gICAgICB9XG4gICAgICByZWdsUmVuZGVyYnVmZmVyLmZvcm1hdCA9IGZvcm1hdFR5cGVzSW52ZXJ0W3JlbmRlcmJ1ZmZlci5mb3JtYXRdXG5cbiAgICAgIHJldHVybiByZWdsUmVuZGVyYnVmZmVyXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVzaXplICh3XywgaF8pIHtcbiAgICAgIHZhciB3ID0gd18gfCAwXG4gICAgICB2YXIgaCA9IChoXyB8IDApIHx8IHdcblxuICAgICAgaWYgKHcgPT09IHJlbmRlcmJ1ZmZlci53aWR0aCAmJiBoID09PSByZW5kZXJidWZmZXIuaGVpZ2h0KSB7XG4gICAgICAgIHJldHVybiByZWdsUmVuZGVyYnVmZmVyXG4gICAgICB9XG5cbiAgICAgIC8vIGNoZWNrIHNoYXBlXG4gICAgICBjaGVjayhcbiAgICAgICAgdyA+IDAgJiYgaCA+IDAgJiZcbiAgICAgICAgdyA8PSBsaW1pdHMubWF4UmVuZGVyYnVmZmVyU2l6ZSAmJiBoIDw9IGxpbWl0cy5tYXhSZW5kZXJidWZmZXJTaXplLFxuICAgICAgICAnaW52YWxpZCByZW5kZXJidWZmZXIgc2l6ZScpXG5cbiAgICAgIHJlZ2xSZW5kZXJidWZmZXIud2lkdGggPSByZW5kZXJidWZmZXIud2lkdGggPSB3XG4gICAgICByZWdsUmVuZGVyYnVmZmVyLmhlaWdodCA9IHJlbmRlcmJ1ZmZlci5oZWlnaHQgPSBoXG5cbiAgICAgIGdsLmJpbmRSZW5kZXJidWZmZXIoR0xfUkVOREVSQlVGRkVSLCByZW5kZXJidWZmZXIucmVuZGVyYnVmZmVyKVxuICAgICAgZ2wucmVuZGVyYnVmZmVyU3RvcmFnZShHTF9SRU5ERVJCVUZGRVIsIHJlbmRlcmJ1ZmZlci5mb3JtYXQsIHcsIGgpXG5cbiAgICAgIC8vIGFsc28sIHJlY29tcHV0ZSBzaXplLlxuICAgICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICAgIHJlbmRlcmJ1ZmZlci5zdGF0cy5zaXplID0gZ2V0UmVuZGVyYnVmZmVyU2l6ZShcbiAgICAgICAgICByZW5kZXJidWZmZXIuZm9ybWF0LCByZW5kZXJidWZmZXIud2lkdGgsIHJlbmRlcmJ1ZmZlci5oZWlnaHQpXG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZWdsUmVuZGVyYnVmZmVyXG4gICAgfVxuXG4gICAgcmVnbFJlbmRlcmJ1ZmZlcihhLCBiKVxuXG4gICAgcmVnbFJlbmRlcmJ1ZmZlci5yZXNpemUgPSByZXNpemVcbiAgICByZWdsUmVuZGVyYnVmZmVyLl9yZWdsVHlwZSA9ICdyZW5kZXJidWZmZXInXG4gICAgcmVnbFJlbmRlcmJ1ZmZlci5fcmVuZGVyYnVmZmVyID0gcmVuZGVyYnVmZmVyXG4gICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICByZWdsUmVuZGVyYnVmZmVyLnN0YXRzID0gcmVuZGVyYnVmZmVyLnN0YXRzXG4gICAgfVxuICAgIHJlZ2xSZW5kZXJidWZmZXIuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJlbmRlcmJ1ZmZlci5kZWNSZWYoKVxuICAgIH1cblxuICAgIHJldHVybiByZWdsUmVuZGVyYnVmZmVyXG4gIH1cblxuICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICBzdGF0cy5nZXRUb3RhbFJlbmRlcmJ1ZmZlclNpemUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgdG90YWwgPSAwXG4gICAgICBPYmplY3Qua2V5cyhyZW5kZXJidWZmZXJTZXQpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgICB0b3RhbCArPSByZW5kZXJidWZmZXJTZXRba2V5XS5zdGF0cy5zaXplXG4gICAgICB9KVxuICAgICAgcmV0dXJuIHRvdGFsXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcmVzdG9yZVJlbmRlcmJ1ZmZlcnMgKCkge1xuICAgIHZhbHVlcyhyZW5kZXJidWZmZXJTZXQpLmZvckVhY2goZnVuY3Rpb24gKHJiKSB7XG4gICAgICByYi5yZW5kZXJidWZmZXIgPSBnbC5jcmVhdGVSZW5kZXJidWZmZXIoKVxuICAgICAgZ2wuYmluZFJlbmRlcmJ1ZmZlcihHTF9SRU5ERVJCVUZGRVIsIHJiLnJlbmRlcmJ1ZmZlcilcbiAgICAgIGdsLnJlbmRlcmJ1ZmZlclN0b3JhZ2UoR0xfUkVOREVSQlVGRkVSLCByYi5mb3JtYXQsIHJiLndpZHRoLCByYi5oZWlnaHQpXG4gICAgfSlcbiAgICBnbC5iaW5kUmVuZGVyYnVmZmVyKEdMX1JFTkRFUkJVRkZFUiwgbnVsbClcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY3JlYXRlOiBjcmVhdGVSZW5kZXJidWZmZXIsXG4gICAgY2xlYXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhbHVlcyhyZW5kZXJidWZmZXJTZXQpLmZvckVhY2goZGVzdHJveSlcbiAgICB9LFxuICAgIHJlc3RvcmU6IHJlc3RvcmVSZW5kZXJidWZmZXJzXG4gIH1cbn1cbiIsInZhciBjaGVjayA9IHJlcXVpcmUoJy4vdXRpbC9jaGVjaycpXG52YXIgdmFsdWVzID0gcmVxdWlyZSgnLi91dGlsL3ZhbHVlcycpXG5cbnZhciBHTF9GUkFHTUVOVF9TSEFERVIgPSAzNTYzMlxudmFyIEdMX1ZFUlRFWF9TSEFERVIgPSAzNTYzM1xuXG52YXIgR0xfQUNUSVZFX1VOSUZPUk1TID0gMHg4Qjg2XG52YXIgR0xfQUNUSVZFX0FUVFJJQlVURVMgPSAweDhCODlcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwU2hhZGVyU3RhdGUgKGdsLCBzdHJpbmdTdG9yZSwgc3RhdHMsIGNvbmZpZykge1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gZ2xzbCBjb21waWxhdGlvbiBhbmQgbGlua2luZ1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgdmFyIGZyYWdTaGFkZXJzID0ge31cbiAgdmFyIHZlcnRTaGFkZXJzID0ge31cblxuICBmdW5jdGlvbiBBY3RpdmVJbmZvIChuYW1lLCBpZCwgbG9jYXRpb24sIGluZm8pIHtcbiAgICB0aGlzLm5hbWUgPSBuYW1lXG4gICAgdGhpcy5pZCA9IGlkXG4gICAgdGhpcy5sb2NhdGlvbiA9IGxvY2F0aW9uXG4gICAgdGhpcy5pbmZvID0gaW5mb1xuICB9XG5cbiAgZnVuY3Rpb24gaW5zZXJ0QWN0aXZlSW5mbyAobGlzdCwgaW5mbykge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGlzdC5sZW5ndGg7ICsraSkge1xuICAgICAgaWYgKGxpc3RbaV0uaWQgPT09IGluZm8uaWQpIHtcbiAgICAgICAgbGlzdFtpXS5sb2NhdGlvbiA9IGluZm8ubG9jYXRpb25cbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgfVxuICAgIGxpc3QucHVzaChpbmZvKVxuICB9XG5cbiAgZnVuY3Rpb24gZ2V0U2hhZGVyICh0eXBlLCBpZCwgY29tbWFuZCkge1xuICAgIHZhciBjYWNoZSA9IHR5cGUgPT09IEdMX0ZSQUdNRU5UX1NIQURFUiA/IGZyYWdTaGFkZXJzIDogdmVydFNoYWRlcnNcbiAgICB2YXIgc2hhZGVyID0gY2FjaGVbaWRdXG5cbiAgICBpZiAoIXNoYWRlcikge1xuICAgICAgdmFyIHNvdXJjZSA9IHN0cmluZ1N0b3JlLnN0cihpZClcbiAgICAgIHNoYWRlciA9IGdsLmNyZWF0ZVNoYWRlcih0eXBlKVxuICAgICAgZ2wuc2hhZGVyU291cmNlKHNoYWRlciwgc291cmNlKVxuICAgICAgZ2wuY29tcGlsZVNoYWRlcihzaGFkZXIpXG4gICAgICBjaGVjay5zaGFkZXJFcnJvcihnbCwgc2hhZGVyLCBzb3VyY2UsIHR5cGUsIGNvbW1hbmQpXG4gICAgICBjYWNoZVtpZF0gPSBzaGFkZXJcbiAgICB9XG5cbiAgICByZXR1cm4gc2hhZGVyXG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gcHJvZ3JhbSBsaW5raW5nXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICB2YXIgcHJvZ3JhbUNhY2hlID0ge31cbiAgdmFyIHByb2dyYW1MaXN0ID0gW11cblxuICB2YXIgUFJPR1JBTV9DT1VOVEVSID0gMFxuXG4gIGZ1bmN0aW9uIFJFR0xQcm9ncmFtIChmcmFnSWQsIHZlcnRJZCkge1xuICAgIHRoaXMuaWQgPSBQUk9HUkFNX0NPVU5URVIrK1xuICAgIHRoaXMuZnJhZ0lkID0gZnJhZ0lkXG4gICAgdGhpcy52ZXJ0SWQgPSB2ZXJ0SWRcbiAgICB0aGlzLnByb2dyYW0gPSBudWxsXG4gICAgdGhpcy51bmlmb3JtcyA9IFtdXG4gICAgdGhpcy5hdHRyaWJ1dGVzID0gW11cblxuICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgdGhpcy5zdGF0cyA9IHtcbiAgICAgICAgdW5pZm9ybXNDb3VudDogMCxcbiAgICAgICAgYXR0cmlidXRlc0NvdW50OiAwXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gbGlua1Byb2dyYW0gKGRlc2MsIGNvbW1hbmQpIHtcbiAgICB2YXIgaSwgaW5mb1xuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGNvbXBpbGUgJiBsaW5rXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHZhciBmcmFnU2hhZGVyID0gZ2V0U2hhZGVyKEdMX0ZSQUdNRU5UX1NIQURFUiwgZGVzYy5mcmFnSWQpXG4gICAgdmFyIHZlcnRTaGFkZXIgPSBnZXRTaGFkZXIoR0xfVkVSVEVYX1NIQURFUiwgZGVzYy52ZXJ0SWQpXG5cbiAgICB2YXIgcHJvZ3JhbSA9IGRlc2MucHJvZ3JhbSA9IGdsLmNyZWF0ZVByb2dyYW0oKVxuICAgIGdsLmF0dGFjaFNoYWRlcihwcm9ncmFtLCBmcmFnU2hhZGVyKVxuICAgIGdsLmF0dGFjaFNoYWRlcihwcm9ncmFtLCB2ZXJ0U2hhZGVyKVxuICAgIGdsLmxpbmtQcm9ncmFtKHByb2dyYW0pXG4gICAgY2hlY2subGlua0Vycm9yKFxuICAgICAgZ2wsXG4gICAgICBwcm9ncmFtLFxuICAgICAgc3RyaW5nU3RvcmUuc3RyKGRlc2MuZnJhZ0lkKSxcbiAgICAgIHN0cmluZ1N0b3JlLnN0cihkZXNjLnZlcnRJZCksXG4gICAgICBjb21tYW5kKVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGdyYWIgdW5pZm9ybXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgdmFyIG51bVVuaWZvcm1zID0gZ2wuZ2V0UHJvZ3JhbVBhcmFtZXRlcihwcm9ncmFtLCBHTF9BQ1RJVkVfVU5JRk9STVMpXG4gICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICBkZXNjLnN0YXRzLnVuaWZvcm1zQ291bnQgPSBudW1Vbmlmb3Jtc1xuICAgIH1cbiAgICB2YXIgdW5pZm9ybXMgPSBkZXNjLnVuaWZvcm1zXG4gICAgZm9yIChpID0gMDsgaSA8IG51bVVuaWZvcm1zOyArK2kpIHtcbiAgICAgIGluZm8gPSBnbC5nZXRBY3RpdmVVbmlmb3JtKHByb2dyYW0sIGkpXG4gICAgICBpZiAoaW5mbykge1xuICAgICAgICBpZiAoaW5mby5zaXplID4gMSkge1xuICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgaW5mby5zaXplOyArK2opIHtcbiAgICAgICAgICAgIHZhciBuYW1lID0gaW5mby5uYW1lLnJlcGxhY2UoJ1swXScsICdbJyArIGogKyAnXScpXG4gICAgICAgICAgICBpbnNlcnRBY3RpdmVJbmZvKHVuaWZvcm1zLCBuZXcgQWN0aXZlSW5mbyhcbiAgICAgICAgICAgICAgbmFtZSxcbiAgICAgICAgICAgICAgc3RyaW5nU3RvcmUuaWQobmFtZSksXG4gICAgICAgICAgICAgIGdsLmdldFVuaWZvcm1Mb2NhdGlvbihwcm9ncmFtLCBuYW1lKSxcbiAgICAgICAgICAgICAgaW5mbykpXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGluc2VydEFjdGl2ZUluZm8odW5pZm9ybXMsIG5ldyBBY3RpdmVJbmZvKFxuICAgICAgICAgICAgaW5mby5uYW1lLFxuICAgICAgICAgICAgc3RyaW5nU3RvcmUuaWQoaW5mby5uYW1lKSxcbiAgICAgICAgICAgIGdsLmdldFVuaWZvcm1Mb2NhdGlvbihwcm9ncmFtLCBpbmZvLm5hbWUpLFxuICAgICAgICAgICAgaW5mbykpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gZ3JhYiBhdHRyaWJ1dGVzXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHZhciBudW1BdHRyaWJ1dGVzID0gZ2wuZ2V0UHJvZ3JhbVBhcmFtZXRlcihwcm9ncmFtLCBHTF9BQ1RJVkVfQVRUUklCVVRFUylcbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgIGRlc2Muc3RhdHMuYXR0cmlidXRlc0NvdW50ID0gbnVtQXR0cmlidXRlc1xuICAgIH1cblxuICAgIHZhciBhdHRyaWJ1dGVzID0gZGVzYy5hdHRyaWJ1dGVzXG4gICAgZm9yIChpID0gMDsgaSA8IG51bUF0dHJpYnV0ZXM7ICsraSkge1xuICAgICAgaW5mbyA9IGdsLmdldEFjdGl2ZUF0dHJpYihwcm9ncmFtLCBpKVxuICAgICAgaWYgKGluZm8pIHtcbiAgICAgICAgaW5zZXJ0QWN0aXZlSW5mbyhhdHRyaWJ1dGVzLCBuZXcgQWN0aXZlSW5mbyhcbiAgICAgICAgICBpbmZvLm5hbWUsXG4gICAgICAgICAgc3RyaW5nU3RvcmUuaWQoaW5mby5uYW1lKSxcbiAgICAgICAgICBnbC5nZXRBdHRyaWJMb2NhdGlvbihwcm9ncmFtLCBpbmZvLm5hbWUpLFxuICAgICAgICAgIGluZm8pKVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgIHN0YXRzLmdldE1heFVuaWZvcm1zQ291bnQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgbSA9IDBcbiAgICAgIHByb2dyYW1MaXN0LmZvckVhY2goZnVuY3Rpb24gKGRlc2MpIHtcbiAgICAgICAgaWYgKGRlc2Muc3RhdHMudW5pZm9ybXNDb3VudCA+IG0pIHtcbiAgICAgICAgICBtID0gZGVzYy5zdGF0cy51bmlmb3Jtc0NvdW50XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICByZXR1cm4gbVxuICAgIH1cblxuICAgIHN0YXRzLmdldE1heEF0dHJpYnV0ZXNDb3VudCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBtID0gMFxuICAgICAgcHJvZ3JhbUxpc3QuZm9yRWFjaChmdW5jdGlvbiAoZGVzYykge1xuICAgICAgICBpZiAoZGVzYy5zdGF0cy5hdHRyaWJ1dGVzQ291bnQgPiBtKSB7XG4gICAgICAgICAgbSA9IGRlc2Muc3RhdHMuYXR0cmlidXRlc0NvdW50XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICByZXR1cm4gbVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHJlc3RvcmVTaGFkZXJzICgpIHtcbiAgICBmcmFnU2hhZGVycyA9IHt9XG4gICAgdmVydFNoYWRlcnMgPSB7fVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcHJvZ3JhbUxpc3QubGVuZ3RoOyArK2kpIHtcbiAgICAgIGxpbmtQcm9ncmFtKHByb2dyYW1MaXN0W2ldKVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY2xlYXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBkZWxldGVTaGFkZXIgPSBnbC5kZWxldGVTaGFkZXIuYmluZChnbClcbiAgICAgIHZhbHVlcyhmcmFnU2hhZGVycykuZm9yRWFjaChkZWxldGVTaGFkZXIpXG4gICAgICBmcmFnU2hhZGVycyA9IHt9XG4gICAgICB2YWx1ZXModmVydFNoYWRlcnMpLmZvckVhY2goZGVsZXRlU2hhZGVyKVxuICAgICAgdmVydFNoYWRlcnMgPSB7fVxuXG4gICAgICBwcm9ncmFtTGlzdC5mb3JFYWNoKGZ1bmN0aW9uIChkZXNjKSB7XG4gICAgICAgIGdsLmRlbGV0ZVByb2dyYW0oZGVzYy5wcm9ncmFtKVxuICAgICAgfSlcbiAgICAgIHByb2dyYW1MaXN0Lmxlbmd0aCA9IDBcbiAgICAgIHByb2dyYW1DYWNoZSA9IHt9XG5cbiAgICAgIHN0YXRzLnNoYWRlckNvdW50ID0gMFxuICAgIH0sXG5cbiAgICBwcm9ncmFtOiBmdW5jdGlvbiAodmVydElkLCBmcmFnSWQsIGNvbW1hbmQpIHtcbiAgICAgIGNoZWNrLmNvbW1hbmQodmVydElkID49IDAsICdtaXNzaW5nIHZlcnRleCBzaGFkZXInLCBjb21tYW5kKVxuICAgICAgY2hlY2suY29tbWFuZChmcmFnSWQgPj0gMCwgJ21pc3NpbmcgZnJhZ21lbnQgc2hhZGVyJywgY29tbWFuZClcblxuICAgICAgdmFyIGNhY2hlID0gcHJvZ3JhbUNhY2hlW2ZyYWdJZF1cbiAgICAgIGlmICghY2FjaGUpIHtcbiAgICAgICAgY2FjaGUgPSBwcm9ncmFtQ2FjaGVbZnJhZ0lkXSA9IHt9XG4gICAgICB9XG4gICAgICB2YXIgcHJvZ3JhbSA9IGNhY2hlW3ZlcnRJZF1cbiAgICAgIGlmICghcHJvZ3JhbSkge1xuICAgICAgICBwcm9ncmFtID0gbmV3IFJFR0xQcm9ncmFtKGZyYWdJZCwgdmVydElkKVxuICAgICAgICBzdGF0cy5zaGFkZXJDb3VudCsrXG5cbiAgICAgICAgbGlua1Byb2dyYW0ocHJvZ3JhbSwgY29tbWFuZClcbiAgICAgICAgY2FjaGVbdmVydElkXSA9IHByb2dyYW1cbiAgICAgICAgcHJvZ3JhbUxpc3QucHVzaChwcm9ncmFtKVxuICAgICAgfVxuICAgICAgcmV0dXJuIHByb2dyYW1cbiAgICB9LFxuXG4gICAgcmVzdG9yZTogcmVzdG9yZVNoYWRlcnMsXG5cbiAgICBzaGFkZXI6IGdldFNoYWRlcixcblxuICAgIGZyYWc6IC0xLFxuICAgIHZlcnQ6IC0xXG4gIH1cbn1cbiIsIlxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBzdGF0cyAoKSB7XG4gIHJldHVybiB7XG4gICAgYnVmZmVyQ291bnQ6IDAsXG4gICAgZWxlbWVudHNDb3VudDogMCxcbiAgICBmcmFtZWJ1ZmZlckNvdW50OiAwLFxuICAgIHNoYWRlckNvdW50OiAwLFxuICAgIHRleHR1cmVDb3VudDogMCxcbiAgICBjdWJlQ291bnQ6IDAsXG4gICAgcmVuZGVyYnVmZmVyQ291bnQ6IDAsXG5cbiAgICBtYXhUZXh0dXJlVW5pdHM6IDBcbiAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjcmVhdGVTdHJpbmdTdG9yZSAoKSB7XG4gIHZhciBzdHJpbmdJZHMgPSB7Jyc6IDB9XG4gIHZhciBzdHJpbmdWYWx1ZXMgPSBbJyddXG4gIHJldHVybiB7XG4gICAgaWQ6IGZ1bmN0aW9uIChzdHIpIHtcbiAgICAgIHZhciByZXN1bHQgPSBzdHJpbmdJZHNbc3RyXVxuICAgICAgaWYgKHJlc3VsdCkge1xuICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICB9XG4gICAgICByZXN1bHQgPSBzdHJpbmdJZHNbc3RyXSA9IHN0cmluZ1ZhbHVlcy5sZW5ndGhcbiAgICAgIHN0cmluZ1ZhbHVlcy5wdXNoKHN0cilcbiAgICAgIHJldHVybiByZXN1bHRcbiAgICB9LFxuXG4gICAgc3RyOiBmdW5jdGlvbiAoaWQpIHtcbiAgICAgIHJldHVybiBzdHJpbmdWYWx1ZXNbaWRdXG4gICAgfVxuICB9XG59XG4iLCJ2YXIgY2hlY2sgPSByZXF1aXJlKCcuL3V0aWwvY2hlY2snKVxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vdXRpbC9leHRlbmQnKVxudmFyIHZhbHVlcyA9IHJlcXVpcmUoJy4vdXRpbC92YWx1ZXMnKVxudmFyIGlzVHlwZWRBcnJheSA9IHJlcXVpcmUoJy4vdXRpbC9pcy10eXBlZC1hcnJheScpXG52YXIgaXNOREFycmF5TGlrZSA9IHJlcXVpcmUoJy4vdXRpbC9pcy1uZGFycmF5JylcbnZhciBwb29sID0gcmVxdWlyZSgnLi91dGlsL3Bvb2wnKVxudmFyIGNvbnZlcnRUb0hhbGZGbG9hdCA9IHJlcXVpcmUoJy4vdXRpbC90by1oYWxmLWZsb2F0JylcbnZhciBpc0FycmF5TGlrZSA9IHJlcXVpcmUoJy4vdXRpbC9pcy1hcnJheS1saWtlJylcbnZhciBmbGF0dGVuVXRpbHMgPSByZXF1aXJlKCcuL3V0aWwvZmxhdHRlbicpXG5cbnZhciBkdHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9hcnJheXR5cGVzLmpzb24nKVxudmFyIGFycmF5VHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9hcnJheXR5cGVzLmpzb24nKVxuXG52YXIgR0xfQ09NUFJFU1NFRF9URVhUVVJFX0ZPUk1BVFMgPSAweDg2QTNcblxudmFyIEdMX1RFWFRVUkVfMkQgPSAweDBERTFcbnZhciBHTF9URVhUVVJFX0NVQkVfTUFQID0gMHg4NTEzXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YID0gMHg4NTE1XG5cbnZhciBHTF9SR0JBID0gMHgxOTA4XG52YXIgR0xfQUxQSEEgPSAweDE5MDZcbnZhciBHTF9SR0IgPSAweDE5MDdcbnZhciBHTF9MVU1JTkFOQ0UgPSAweDE5MDlcbnZhciBHTF9MVU1JTkFOQ0VfQUxQSEEgPSAweDE5MEFcblxudmFyIEdMX1JHQkE0ID0gMHg4MDU2XG52YXIgR0xfUkdCNV9BMSA9IDB4ODA1N1xudmFyIEdMX1JHQjU2NSA9IDB4OEQ2MlxuXG52YXIgR0xfVU5TSUdORURfU0hPUlRfNF80XzRfNCA9IDB4ODAzM1xudmFyIEdMX1VOU0lHTkVEX1NIT1JUXzVfNV81XzEgPSAweDgwMzRcbnZhciBHTF9VTlNJR05FRF9TSE9SVF81XzZfNSA9IDB4ODM2M1xudmFyIEdMX1VOU0lHTkVEX0lOVF8yNF84X1dFQkdMID0gMHg4NEZBXG5cbnZhciBHTF9ERVBUSF9DT01QT05FTlQgPSAweDE5MDJcbnZhciBHTF9ERVBUSF9TVEVOQ0lMID0gMHg4NEY5XG5cbnZhciBHTF9TUkdCX0VYVCA9IDB4OEM0MFxudmFyIEdMX1NSR0JfQUxQSEFfRVhUID0gMHg4QzQyXG5cbnZhciBHTF9IQUxGX0ZMT0FUX09FUyA9IDB4OEQ2MVxuXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfUzNUQ19EWFQxX0VYVCA9IDB4ODNGMFxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDFfRVhUID0gMHg4M0YxXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUM19FWFQgPSAweDgzRjJcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQ1X0VYVCA9IDB4ODNGM1xuXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfQVRDX1dFQkdMID0gMHg4QzkyXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19FWFBMSUNJVF9BTFBIQV9XRUJHTCA9IDB4OEM5M1xudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9BVENfSU5URVJQT0xBVEVEX0FMUEhBX1dFQkdMID0gMHg4N0VFXG5cbnZhciBHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ180QlBQVjFfSU1HID0gMHg4QzAwXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfUFZSVENfMkJQUFYxX0lNRyA9IDB4OEMwMVxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9QVlJUQ180QlBQVjFfSU1HID0gMHg4QzAyXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1BWUlRDXzJCUFBWMV9JTUcgPSAweDhDMDNcblxudmFyIEdMX0NPTVBSRVNTRURfUkdCX0VUQzFfV0VCR0wgPSAweDhENjRcblxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSAweDE0MDFcbnZhciBHTF9VTlNJR05FRF9TSE9SVCA9IDB4MTQwM1xudmFyIEdMX1VOU0lHTkVEX0lOVCA9IDB4MTQwNVxudmFyIEdMX0ZMT0FUID0gMHgxNDA2XG5cbnZhciBHTF9URVhUVVJFX1dSQVBfUyA9IDB4MjgwMlxudmFyIEdMX1RFWFRVUkVfV1JBUF9UID0gMHgyODAzXG5cbnZhciBHTF9SRVBFQVQgPSAweDI5MDFcbnZhciBHTF9DTEFNUF9UT19FREdFID0gMHg4MTJGXG52YXIgR0xfTUlSUk9SRURfUkVQRUFUID0gMHg4MzcwXG5cbnZhciBHTF9URVhUVVJFX01BR19GSUxURVIgPSAweDI4MDBcbnZhciBHTF9URVhUVVJFX01JTl9GSUxURVIgPSAweDI4MDFcblxudmFyIEdMX05FQVJFU1QgPSAweDI2MDBcbnZhciBHTF9MSU5FQVIgPSAweDI2MDFcbnZhciBHTF9ORUFSRVNUX01JUE1BUF9ORUFSRVNUID0gMHgyNzAwXG52YXIgR0xfTElORUFSX01JUE1BUF9ORUFSRVNUID0gMHgyNzAxXG52YXIgR0xfTkVBUkVTVF9NSVBNQVBfTElORUFSID0gMHgyNzAyXG52YXIgR0xfTElORUFSX01JUE1BUF9MSU5FQVIgPSAweDI3MDNcblxudmFyIEdMX0dFTkVSQVRFX01JUE1BUF9ISU5UID0gMHg4MTkyXG52YXIgR0xfRE9OVF9DQVJFID0gMHgxMTAwXG52YXIgR0xfRkFTVEVTVCA9IDB4MTEwMVxudmFyIEdMX05JQ0VTVCA9IDB4MTEwMlxuXG52YXIgR0xfVEVYVFVSRV9NQVhfQU5JU09UUk9QWV9FWFQgPSAweDg0RkVcblxudmFyIEdMX1VOUEFDS19BTElHTk1FTlQgPSAweDBDRjVcbnZhciBHTF9VTlBBQ0tfRkxJUF9ZX1dFQkdMID0gMHg5MjQwXG52YXIgR0xfVU5QQUNLX1BSRU1VTFRJUExZX0FMUEhBX1dFQkdMID0gMHg5MjQxXG52YXIgR0xfVU5QQUNLX0NPTE9SU1BBQ0VfQ09OVkVSU0lPTl9XRUJHTCA9IDB4OTI0M1xuXG52YXIgR0xfQlJPV1NFUl9ERUZBVUxUX1dFQkdMID0gMHg5MjQ0XG5cbnZhciBHTF9URVhUVVJFMCA9IDB4ODRDMFxuXG52YXIgTUlQTUFQX0ZJTFRFUlMgPSBbXG4gIEdMX05FQVJFU1RfTUlQTUFQX05FQVJFU1QsXG4gIEdMX05FQVJFU1RfTUlQTUFQX0xJTkVBUixcbiAgR0xfTElORUFSX01JUE1BUF9ORUFSRVNULFxuICBHTF9MSU5FQVJfTUlQTUFQX0xJTkVBUlxuXVxuXG52YXIgQ0hBTk5FTFNfRk9STUFUID0gW1xuICAwLFxuICBHTF9MVU1JTkFOQ0UsXG4gIEdMX0xVTUlOQU5DRV9BTFBIQSxcbiAgR0xfUkdCLFxuICBHTF9SR0JBXG5dXG5cbnZhciBGT1JNQVRfQ0hBTk5FTFMgPSB7fVxuRk9STUFUX0NIQU5ORUxTW0dMX0xVTUlOQU5DRV0gPVxuRk9STUFUX0NIQU5ORUxTW0dMX0FMUEhBXSA9XG5GT1JNQVRfQ0hBTk5FTFNbR0xfREVQVEhfQ09NUE9ORU5UXSA9IDFcbkZPUk1BVF9DSEFOTkVMU1tHTF9ERVBUSF9TVEVOQ0lMXSA9XG5GT1JNQVRfQ0hBTk5FTFNbR0xfTFVNSU5BTkNFX0FMUEhBXSA9IDJcbkZPUk1BVF9DSEFOTkVMU1tHTF9SR0JdID1cbkZPUk1BVF9DSEFOTkVMU1tHTF9TUkdCX0VYVF0gPSAzXG5GT1JNQVRfQ0hBTk5FTFNbR0xfUkdCQV0gPVxuRk9STUFUX0NIQU5ORUxTW0dMX1NSR0JfQUxQSEFfRVhUXSA9IDRcblxudmFyIGZvcm1hdFR5cGVzID0ge31cbmZvcm1hdFR5cGVzW0dMX1JHQkE0XSA9IEdMX1VOU0lHTkVEX1NIT1JUXzRfNF80XzRcbmZvcm1hdFR5cGVzW0dMX1JHQjU2NV0gPSBHTF9VTlNJR05FRF9TSE9SVF81XzZfNVxuZm9ybWF0VHlwZXNbR0xfUkdCNV9BMV0gPSBHTF9VTlNJR05FRF9TSE9SVF81XzVfNV8xXG5mb3JtYXRUeXBlc1tHTF9ERVBUSF9DT01QT05FTlRdID0gR0xfVU5TSUdORURfSU5UXG5mb3JtYXRUeXBlc1tHTF9ERVBUSF9TVEVOQ0lMXSA9IEdMX1VOU0lHTkVEX0lOVF8yNF84X1dFQkdMXG5cbmZ1bmN0aW9uIG9iamVjdE5hbWUgKHN0cikge1xuICByZXR1cm4gJ1tvYmplY3QgJyArIHN0ciArICddJ1xufVxuXG52YXIgQ0FOVkFTX0NMQVNTID0gb2JqZWN0TmFtZSgnSFRNTENhbnZhc0VsZW1lbnQnKVxudmFyIENPTlRFWFQyRF9DTEFTUyA9IG9iamVjdE5hbWUoJ0NhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCcpXG52YXIgSU1BR0VfQ0xBU1MgPSBvYmplY3ROYW1lKCdIVE1MSW1hZ2VFbGVtZW50JylcbnZhciBWSURFT19DTEFTUyA9IG9iamVjdE5hbWUoJ0hUTUxWaWRlb0VsZW1lbnQnKVxuXG52YXIgUElYRUxfQ0xBU1NFUyA9IE9iamVjdC5rZXlzKGR0eXBlcykuY29uY2F0KFtcbiAgQ0FOVkFTX0NMQVNTLFxuICBDT05URVhUMkRfQ0xBU1MsXG4gIElNQUdFX0NMQVNTLFxuICBWSURFT19DTEFTU1xuXSlcblxuLy8gZm9yIGV2ZXJ5IHRleHR1cmUgdHlwZSwgc3RvcmVcbi8vIHRoZSBzaXplIGluIGJ5dGVzLlxudmFyIFRZUEVfU0laRVMgPSBbXVxuVFlQRV9TSVpFU1tHTF9VTlNJR05FRF9CWVRFXSA9IDFcblRZUEVfU0laRVNbR0xfRkxPQVRdID0gNFxuVFlQRV9TSVpFU1tHTF9IQUxGX0ZMT0FUX09FU10gPSAyXG5cblRZUEVfU0laRVNbR0xfVU5TSUdORURfU0hPUlRdID0gMlxuVFlQRV9TSVpFU1tHTF9VTlNJR05FRF9JTlRdID0gNFxuXG52YXIgRk9STUFUX1NJWkVTX1NQRUNJQUwgPSBbXVxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfUkdCQTRdID0gMlxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfUkdCNV9BMV0gPSAyXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9SR0I1NjVdID0gMlxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfREVQVEhfU1RFTkNJTF0gPSA0XG5cbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCX1MzVENfRFhUMV9FWFRdID0gMC41XG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQxX0VYVF0gPSAwLjVcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDNfRVhUXSA9IDFcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDVfRVhUXSA9IDFcblxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JfQVRDX1dFQkdMXSA9IDAuNVxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19FWFBMSUNJVF9BTFBIQV9XRUJHTF0gPSAxXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQkFfQVRDX0lOVEVSUE9MQVRFRF9BTFBIQV9XRUJHTF0gPSAxXG5cbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCX1BWUlRDXzRCUFBWMV9JTUddID0gMC41XG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ18yQlBQVjFfSU1HXSA9IDAuMjVcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCQV9QVlJUQ180QlBQVjFfSU1HXSA9IDAuNVxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JBX1BWUlRDXzJCUFBWMV9JTUddID0gMC4yNVxuXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQl9FVEMxX1dFQkdMXSA9IDAuNVxuXG5mdW5jdGlvbiBpc051bWVyaWNBcnJheSAoYXJyKSB7XG4gIHJldHVybiAoXG4gICAgQXJyYXkuaXNBcnJheShhcnIpICYmXG4gICAgKGFyci5sZW5ndGggPT09IDAgfHxcbiAgICB0eXBlb2YgYXJyWzBdID09PSAnbnVtYmVyJykpXG59XG5cbmZ1bmN0aW9uIGlzUmVjdEFycmF5IChhcnIpIHtcbiAgaWYgKCFBcnJheS5pc0FycmF5KGFycikpIHtcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxuICB2YXIgd2lkdGggPSBhcnIubGVuZ3RoXG4gIGlmICh3aWR0aCA9PT0gMCB8fCAhaXNBcnJheUxpa2UoYXJyWzBdKSkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG4gIHJldHVybiB0cnVlXG59XG5cbmZ1bmN0aW9uIGNsYXNzU3RyaW5nICh4KSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoeClcbn1cblxuZnVuY3Rpb24gaXNDYW52YXNFbGVtZW50IChvYmplY3QpIHtcbiAgcmV0dXJuIGNsYXNzU3RyaW5nKG9iamVjdCkgPT09IENBTlZBU19DTEFTU1xufVxuXG5mdW5jdGlvbiBpc0NvbnRleHQyRCAob2JqZWN0KSB7XG4gIHJldHVybiBjbGFzc1N0cmluZyhvYmplY3QpID09PSBDT05URVhUMkRfQ0xBU1Ncbn1cblxuZnVuY3Rpb24gaXNJbWFnZUVsZW1lbnQgKG9iamVjdCkge1xuICByZXR1cm4gY2xhc3NTdHJpbmcob2JqZWN0KSA9PT0gSU1BR0VfQ0xBU1Ncbn1cblxuZnVuY3Rpb24gaXNWaWRlb0VsZW1lbnQgKG9iamVjdCkge1xuICByZXR1cm4gY2xhc3NTdHJpbmcob2JqZWN0KSA9PT0gVklERU9fQ0xBU1Ncbn1cblxuZnVuY3Rpb24gaXNQaXhlbERhdGEgKG9iamVjdCkge1xuICBpZiAoIW9iamVjdCkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG4gIHZhciBjbGFzc05hbWUgPSBjbGFzc1N0cmluZyhvYmplY3QpXG4gIGlmIChQSVhFTF9DTEFTU0VTLmluZGV4T2YoY2xhc3NOYW1lKSA+PSAwKSB7XG4gICAgcmV0dXJuIHRydWVcbiAgfVxuICByZXR1cm4gKFxuICAgIGlzTnVtZXJpY0FycmF5KG9iamVjdCkgfHxcbiAgICBpc1JlY3RBcnJheShvYmplY3QpIHx8XG4gICAgaXNOREFycmF5TGlrZShvYmplY3QpKVxufVxuXG5mdW5jdGlvbiB0eXBlZEFycmF5Q29kZSAoZGF0YSkge1xuICByZXR1cm4gYXJyYXlUeXBlc1tPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoZGF0YSldIHwgMFxufVxuXG5mdW5jdGlvbiBjb252ZXJ0RGF0YSAocmVzdWx0LCBkYXRhKSB7XG4gIHZhciBuID0gZGF0YS5sZW5ndGhcbiAgc3dpdGNoIChyZXN1bHQudHlwZSkge1xuICAgIGNhc2UgR0xfVU5TSUdORURfQllURTpcbiAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUOlxuICAgIGNhc2UgR0xfVU5TSUdORURfSU5UOlxuICAgIGNhc2UgR0xfRkxPQVQ6XG4gICAgICB2YXIgY29udmVydGVkID0gcG9vbC5hbGxvY1R5cGUocmVzdWx0LnR5cGUsIG4pXG4gICAgICBjb252ZXJ0ZWQuc2V0KGRhdGEpXG4gICAgICByZXN1bHQuZGF0YSA9IGNvbnZlcnRlZFxuICAgICAgYnJlYWtcblxuICAgIGNhc2UgR0xfSEFMRl9GTE9BVF9PRVM6XG4gICAgICByZXN1bHQuZGF0YSA9IGNvbnZlcnRUb0hhbGZGbG9hdChkYXRhKVxuICAgICAgYnJlYWtcblxuICAgIGRlZmF1bHQ6XG4gICAgICBjaGVjay5yYWlzZSgndW5zdXBwb3J0ZWQgdGV4dHVyZSB0eXBlLCBtdXN0IHNwZWNpZnkgYSB0eXBlZCBhcnJheScpXG4gIH1cbn1cblxuZnVuY3Rpb24gcHJlQ29udmVydCAoaW1hZ2UsIG4pIHtcbiAgcmV0dXJuIHBvb2wuYWxsb2NUeXBlKFxuICAgIGltYWdlLnR5cGUgPT09IEdMX0hBTEZfRkxPQVRfT0VTXG4gICAgICA/IEdMX0ZMT0FUXG4gICAgICA6IGltYWdlLnR5cGUsIG4pXG59XG5cbmZ1bmN0aW9uIHBvc3RDb252ZXJ0IChpbWFnZSwgZGF0YSkge1xuICBpZiAoaW1hZ2UudHlwZSA9PT0gR0xfSEFMRl9GTE9BVF9PRVMpIHtcbiAgICBpbWFnZS5kYXRhID0gY29udmVydFRvSGFsZkZsb2F0KGRhdGEpXG4gICAgcG9vbC5mcmVlVHlwZShkYXRhKVxuICB9IGVsc2Uge1xuICAgIGltYWdlLmRhdGEgPSBkYXRhXG4gIH1cbn1cblxuZnVuY3Rpb24gdHJhbnNwb3NlRGF0YSAoaW1hZ2UsIGFycmF5LCBzdHJpZGVYLCBzdHJpZGVZLCBzdHJpZGVDLCBvZmZzZXQpIHtcbiAgdmFyIHcgPSBpbWFnZS53aWR0aFxuICB2YXIgaCA9IGltYWdlLmhlaWdodFxuICB2YXIgYyA9IGltYWdlLmNoYW5uZWxzXG4gIHZhciBuID0gdyAqIGggKiBjXG4gIHZhciBkYXRhID0gcHJlQ29udmVydChpbWFnZSwgbilcblxuICB2YXIgcCA9IDBcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBoOyArK2kpIHtcbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IHc7ICsraikge1xuICAgICAgZm9yICh2YXIgayA9IDA7IGsgPCBjOyArK2spIHtcbiAgICAgICAgZGF0YVtwKytdID0gYXJyYXlbc3RyaWRlWCAqIGogKyBzdHJpZGVZICogaSArIHN0cmlkZUMgKiBrICsgb2Zmc2V0XVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHBvc3RDb252ZXJ0KGltYWdlLCBkYXRhKVxufVxuXG5mdW5jdGlvbiBnZXRUZXh0dXJlU2l6ZSAoZm9ybWF0LCB0eXBlLCB3aWR0aCwgaGVpZ2h0LCBpc01pcG1hcCwgaXNDdWJlKSB7XG4gIHZhciBzXG4gIGlmICh0eXBlb2YgRk9STUFUX1NJWkVTX1NQRUNJQUxbZm9ybWF0XSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAvLyB3ZSBoYXZlIGEgc3BlY2lhbCBhcnJheSBmb3IgZGVhbGluZyB3aXRoIHdlaXJkIGNvbG9yIGZvcm1hdHMgc3VjaCBhcyBSR0I1QTFcbiAgICBzID0gRk9STUFUX1NJWkVTX1NQRUNJQUxbZm9ybWF0XVxuICB9IGVsc2Uge1xuICAgIHMgPSBGT1JNQVRfQ0hBTk5FTFNbZm9ybWF0XSAqIFRZUEVfU0laRVNbdHlwZV1cbiAgfVxuXG4gIGlmIChpc0N1YmUpIHtcbiAgICBzICo9IDZcbiAgfVxuXG4gIGlmIChpc01pcG1hcCkge1xuICAgIC8vIGNvbXB1dGUgdGhlIHRvdGFsIHNpemUgb2YgYWxsIHRoZSBtaXBtYXBzLlxuICAgIHZhciB0b3RhbCA9IDBcblxuICAgIHZhciB3ID0gd2lkdGhcbiAgICB3aGlsZSAodyA+PSAxKSB7XG4gICAgICAvLyB3ZSBjYW4gb25seSB1c2UgbWlwbWFwcyBvbiBhIHNxdWFyZSBpbWFnZSxcbiAgICAgIC8vIHNvIHdlIGNhbiBzaW1wbHkgdXNlIHRoZSB3aWR0aCBhbmQgaWdub3JlIHRoZSBoZWlnaHQ6XG4gICAgICB0b3RhbCArPSBzICogdyAqIHdcbiAgICAgIHcgLz0gMlxuICAgIH1cbiAgICByZXR1cm4gdG90YWxcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gcyAqIHdpZHRoICogaGVpZ2h0XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjcmVhdGVUZXh0dXJlU2V0IChcbiAgZ2wsIGV4dGVuc2lvbnMsIGxpbWl0cywgcmVnbFBvbGwsIGNvbnRleHRTdGF0ZSwgc3RhdHMsIGNvbmZpZykge1xuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIEluaXRpYWxpemUgY29uc3RhbnRzIGFuZCBwYXJhbWV0ZXIgdGFibGVzIGhlcmVcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICB2YXIgbWlwbWFwSGludCA9IHtcbiAgICBcImRvbid0IGNhcmVcIjogR0xfRE9OVF9DQVJFLFxuICAgICdkb250IGNhcmUnOiBHTF9ET05UX0NBUkUsXG4gICAgJ25pY2UnOiBHTF9OSUNFU1QsXG4gICAgJ2Zhc3QnOiBHTF9GQVNURVNUXG4gIH1cblxuICB2YXIgd3JhcE1vZGVzID0ge1xuICAgICdyZXBlYXQnOiBHTF9SRVBFQVQsXG4gICAgJ2NsYW1wJzogR0xfQ0xBTVBfVE9fRURHRSxcbiAgICAnbWlycm9yJzogR0xfTUlSUk9SRURfUkVQRUFUXG4gIH1cblxuICB2YXIgbWFnRmlsdGVycyA9IHtcbiAgICAnbmVhcmVzdCc6IEdMX05FQVJFU1QsXG4gICAgJ2xpbmVhcic6IEdMX0xJTkVBUlxuICB9XG5cbiAgdmFyIG1pbkZpbHRlcnMgPSBleHRlbmQoe1xuICAgICdtaXBtYXAnOiBHTF9MSU5FQVJfTUlQTUFQX0xJTkVBUixcbiAgICAnbmVhcmVzdCBtaXBtYXAgbmVhcmVzdCc6IEdMX05FQVJFU1RfTUlQTUFQX05FQVJFU1QsXG4gICAgJ2xpbmVhciBtaXBtYXAgbmVhcmVzdCc6IEdMX0xJTkVBUl9NSVBNQVBfTkVBUkVTVCxcbiAgICAnbmVhcmVzdCBtaXBtYXAgbGluZWFyJzogR0xfTkVBUkVTVF9NSVBNQVBfTElORUFSLFxuICAgICdsaW5lYXIgbWlwbWFwIGxpbmVhcic6IEdMX0xJTkVBUl9NSVBNQVBfTElORUFSXG4gIH0sIG1hZ0ZpbHRlcnMpXG5cbiAgdmFyIGNvbG9yU3BhY2UgPSB7XG4gICAgJ25vbmUnOiAwLFxuICAgICdicm93c2VyJzogR0xfQlJPV1NFUl9ERUZBVUxUX1dFQkdMXG4gIH1cblxuICB2YXIgdGV4dHVyZVR5cGVzID0ge1xuICAgICd1aW50OCc6IEdMX1VOU0lHTkVEX0JZVEUsXG4gICAgJ3JnYmE0JzogR0xfVU5TSUdORURfU0hPUlRfNF80XzRfNCxcbiAgICAncmdiNTY1JzogR0xfVU5TSUdORURfU0hPUlRfNV82XzUsXG4gICAgJ3JnYjUgYTEnOiBHTF9VTlNJR05FRF9TSE9SVF81XzVfNV8xXG4gIH1cblxuICB2YXIgdGV4dHVyZUZvcm1hdHMgPSB7XG4gICAgJ2FscGhhJzogR0xfQUxQSEEsXG4gICAgJ2x1bWluYW5jZSc6IEdMX0xVTUlOQU5DRSxcbiAgICAnbHVtaW5hbmNlIGFscGhhJzogR0xfTFVNSU5BTkNFX0FMUEhBLFxuICAgICdyZ2InOiBHTF9SR0IsXG4gICAgJ3JnYmEnOiBHTF9SR0JBLFxuICAgICdyZ2JhNCc6IEdMX1JHQkE0LFxuICAgICdyZ2I1IGExJzogR0xfUkdCNV9BMSxcbiAgICAncmdiNTY1JzogR0xfUkdCNTY1XG4gIH1cblxuICB2YXIgY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzID0ge31cblxuICBpZiAoZXh0ZW5zaW9ucy5leHRfc3JnYikge1xuICAgIHRleHR1cmVGb3JtYXRzLnNyZ2IgPSBHTF9TUkdCX0VYVFxuICAgIHRleHR1cmVGb3JtYXRzLnNyZ2JhID0gR0xfU1JHQl9BTFBIQV9FWFRcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLm9lc190ZXh0dXJlX2Zsb2F0KSB7XG4gICAgdGV4dHVyZVR5cGVzLmZsb2F0MzIgPSB0ZXh0dXJlVHlwZXMuZmxvYXQgPSBHTF9GTE9BVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMub2VzX3RleHR1cmVfaGFsZl9mbG9hdCkge1xuICAgIHRleHR1cmVUeXBlc1snZmxvYXQxNiddID0gdGV4dHVyZVR5cGVzWydoYWxmIGZsb2F0J10gPSBHTF9IQUxGX0ZMT0FUX09FU1xuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfZGVwdGhfdGV4dHVyZSkge1xuICAgIGV4dGVuZCh0ZXh0dXJlRm9ybWF0cywge1xuICAgICAgJ2RlcHRoJzogR0xfREVQVEhfQ09NUE9ORU5ULFxuICAgICAgJ2RlcHRoIHN0ZW5jaWwnOiBHTF9ERVBUSF9TVEVOQ0lMXG4gICAgfSlcblxuICAgIGV4dGVuZCh0ZXh0dXJlVHlwZXMsIHtcbiAgICAgICd1aW50MTYnOiBHTF9VTlNJR05FRF9TSE9SVCxcbiAgICAgICd1aW50MzInOiBHTF9VTlNJR05FRF9JTlQsXG4gICAgICAnZGVwdGggc3RlbmNpbCc6IEdMX1VOU0lHTkVEX0lOVF8yNF84X1dFQkdMXG4gICAgfSlcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9zM3RjKSB7XG4gICAgZXh0ZW5kKGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cywge1xuICAgICAgJ3JnYiBzM3RjIGR4dDEnOiBHTF9DT01QUkVTU0VEX1JHQl9TM1RDX0RYVDFfRVhULFxuICAgICAgJ3JnYmEgczN0YyBkeHQxJzogR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUMV9FWFQsXG4gICAgICAncmdiYSBzM3RjIGR4dDMnOiBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQzX0VYVCxcbiAgICAgICdyZ2JhIHMzdGMgZHh0NSc6IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDVfRVhUXG4gICAgfSlcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9hdGMpIHtcbiAgICBleHRlbmQoY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzLCB7XG4gICAgICAncmdiIGF0Yyc6IEdMX0NPTVBSRVNTRURfUkdCX0FUQ19XRUJHTCxcbiAgICAgICdyZ2JhIGF0YyBleHBsaWNpdCBhbHBoYSc6IEdMX0NPTVBSRVNTRURfUkdCQV9BVENfRVhQTElDSVRfQUxQSEFfV0VCR0wsXG4gICAgICAncmdiYSBhdGMgaW50ZXJwb2xhdGVkIGFscGhhJzogR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19JTlRFUlBPTEFURURfQUxQSEFfV0VCR0xcbiAgICB9KVxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29tcHJlc3NlZF90ZXh0dXJlX3B2cnRjKSB7XG4gICAgZXh0ZW5kKGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cywge1xuICAgICAgJ3JnYiBwdnJ0YyA0YnBwdjEnOiBHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ180QlBQVjFfSU1HLFxuICAgICAgJ3JnYiBwdnJ0YyAyYnBwdjEnOiBHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ18yQlBQVjFfSU1HLFxuICAgICAgJ3JnYmEgcHZydGMgNGJwcHYxJzogR0xfQ09NUFJFU1NFRF9SR0JBX1BWUlRDXzRCUFBWMV9JTUcsXG4gICAgICAncmdiYSBwdnJ0YyAyYnBwdjEnOiBHTF9DT01QUkVTU0VEX1JHQkFfUFZSVENfMkJQUFYxX0lNR1xuICAgIH0pXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb21wcmVzc2VkX3RleHR1cmVfZXRjMSkge1xuICAgIGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0c1sncmdiIGV0YzEnXSA9IEdMX0NPTVBSRVNTRURfUkdCX0VUQzFfV0VCR0xcbiAgfVxuXG4gIC8vIENvcHkgb3ZlciBhbGwgdGV4dHVyZSBmb3JtYXRzXG4gIHZhciBzdXBwb3J0ZWRDb21wcmVzc2VkRm9ybWF0cyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKFxuICAgIGdsLmdldFBhcmFtZXRlcihHTF9DT01QUkVTU0VEX1RFWFRVUkVfRk9STUFUUykpXG4gIE9iamVjdC5rZXlzKGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cykuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgIHZhciBmb3JtYXQgPSBjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHNbbmFtZV1cbiAgICBpZiAoc3VwcG9ydGVkQ29tcHJlc3NlZEZvcm1hdHMuaW5kZXhPZihmb3JtYXQpID49IDApIHtcbiAgICAgIHRleHR1cmVGb3JtYXRzW25hbWVdID0gZm9ybWF0XG4gICAgfVxuICB9KVxuXG4gIHZhciBzdXBwb3J0ZWRGb3JtYXRzID0gT2JqZWN0LmtleXModGV4dHVyZUZvcm1hdHMpXG4gIGxpbWl0cy50ZXh0dXJlRm9ybWF0cyA9IHN1cHBvcnRlZEZvcm1hdHNcblxuICAvLyBhc3NvY2lhdGUgd2l0aCBldmVyeSBmb3JtYXQgc3RyaW5nIGl0c1xuICAvLyBjb3JyZXNwb25kaW5nIEdMLXZhbHVlLlxuICB2YXIgdGV4dHVyZUZvcm1hdHNJbnZlcnQgPSBbXVxuICBPYmplY3Qua2V5cyh0ZXh0dXJlRm9ybWF0cykuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgdmFyIHZhbCA9IHRleHR1cmVGb3JtYXRzW2tleV1cbiAgICB0ZXh0dXJlRm9ybWF0c0ludmVydFt2YWxdID0ga2V5XG4gIH0pXG5cbiAgLy8gYXNzb2NpYXRlIHdpdGggZXZlcnkgdHlwZSBzdHJpbmcgaXRzXG4gIC8vIGNvcnJlc3BvbmRpbmcgR0wtdmFsdWUuXG4gIHZhciB0ZXh0dXJlVHlwZXNJbnZlcnQgPSBbXVxuICBPYmplY3Qua2V5cyh0ZXh0dXJlVHlwZXMpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgIHZhciB2YWwgPSB0ZXh0dXJlVHlwZXNba2V5XVxuICAgIHRleHR1cmVUeXBlc0ludmVydFt2YWxdID0ga2V5XG4gIH0pXG5cbiAgdmFyIG1hZ0ZpbHRlcnNJbnZlcnQgPSBbXVxuICBPYmplY3Qua2V5cyhtYWdGaWx0ZXJzKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICB2YXIgdmFsID0gbWFnRmlsdGVyc1trZXldXG4gICAgbWFnRmlsdGVyc0ludmVydFt2YWxdID0ga2V5XG4gIH0pXG5cbiAgdmFyIG1pbkZpbHRlcnNJbnZlcnQgPSBbXVxuICBPYmplY3Qua2V5cyhtaW5GaWx0ZXJzKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICB2YXIgdmFsID0gbWluRmlsdGVyc1trZXldXG4gICAgbWluRmlsdGVyc0ludmVydFt2YWxdID0ga2V5XG4gIH0pXG5cbiAgdmFyIHdyYXBNb2Rlc0ludmVydCA9IFtdXG4gIE9iamVjdC5rZXlzKHdyYXBNb2RlcykuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgdmFyIHZhbCA9IHdyYXBNb2Rlc1trZXldXG4gICAgd3JhcE1vZGVzSW52ZXJ0W3ZhbF0gPSBrZXlcbiAgfSlcblxuICAvLyBjb2xvckZvcm1hdHNbXSBnaXZlcyB0aGUgZm9ybWF0IChjaGFubmVscykgYXNzb2NpYXRlZCB0byBhblxuICAvLyBpbnRlcm5hbGZvcm1hdFxuICB2YXIgY29sb3JGb3JtYXRzID0gc3VwcG9ydGVkRm9ybWF0cy5yZWR1Y2UoZnVuY3Rpb24gKGNvbG9yLCBrZXkpIHtcbiAgICB2YXIgZ2xlbnVtID0gdGV4dHVyZUZvcm1hdHNba2V5XVxuICAgIGlmIChnbGVudW0gPT09IEdMX0xVTUlOQU5DRSB8fFxuICAgICAgICBnbGVudW0gPT09IEdMX0FMUEhBIHx8XG4gICAgICAgIGdsZW51bSA9PT0gR0xfTFVNSU5BTkNFIHx8XG4gICAgICAgIGdsZW51bSA9PT0gR0xfTFVNSU5BTkNFX0FMUEhBIHx8XG4gICAgICAgIGdsZW51bSA9PT0gR0xfREVQVEhfQ09NUE9ORU5UIHx8XG4gICAgICAgIGdsZW51bSA9PT0gR0xfREVQVEhfU1RFTkNJTCkge1xuICAgICAgY29sb3JbZ2xlbnVtXSA9IGdsZW51bVxuICAgIH0gZWxzZSBpZiAoZ2xlbnVtID09PSBHTF9SR0I1X0ExIHx8IGtleS5pbmRleE9mKCdyZ2JhJykgPj0gMCkge1xuICAgICAgY29sb3JbZ2xlbnVtXSA9IEdMX1JHQkFcbiAgICB9IGVsc2Uge1xuICAgICAgY29sb3JbZ2xlbnVtXSA9IEdMX1JHQlxuICAgIH1cbiAgICByZXR1cm4gY29sb3JcbiAgfSwge30pXG5cbiAgZnVuY3Rpb24gVGV4RmxhZ3MgKCkge1xuICAgIC8vIGZvcm1hdCBpbmZvXG4gICAgdGhpcy5pbnRlcm5hbGZvcm1hdCA9IEdMX1JHQkFcbiAgICB0aGlzLmZvcm1hdCA9IEdMX1JHQkFcbiAgICB0aGlzLnR5cGUgPSBHTF9VTlNJR05FRF9CWVRFXG4gICAgdGhpcy5jb21wcmVzc2VkID0gZmFsc2VcblxuICAgIC8vIHBpeGVsIHN0b3JhZ2VcbiAgICB0aGlzLnByZW11bHRpcGx5QWxwaGEgPSBmYWxzZVxuICAgIHRoaXMuZmxpcFkgPSBmYWxzZVxuICAgIHRoaXMudW5wYWNrQWxpZ25tZW50ID0gMVxuICAgIHRoaXMuY29sb3JTcGFjZSA9IDBcblxuICAgIC8vIHNoYXBlIGluZm9cbiAgICB0aGlzLndpZHRoID0gMFxuICAgIHRoaXMuaGVpZ2h0ID0gMFxuICAgIHRoaXMuY2hhbm5lbHMgPSAwXG4gIH1cblxuICBmdW5jdGlvbiBjb3B5RmxhZ3MgKHJlc3VsdCwgb3RoZXIpIHtcbiAgICByZXN1bHQuaW50ZXJuYWxmb3JtYXQgPSBvdGhlci5pbnRlcm5hbGZvcm1hdFxuICAgIHJlc3VsdC5mb3JtYXQgPSBvdGhlci5mb3JtYXRcbiAgICByZXN1bHQudHlwZSA9IG90aGVyLnR5cGVcbiAgICByZXN1bHQuY29tcHJlc3NlZCA9IG90aGVyLmNvbXByZXNzZWRcblxuICAgIHJlc3VsdC5wcmVtdWx0aXBseUFscGhhID0gb3RoZXIucHJlbXVsdGlwbHlBbHBoYVxuICAgIHJlc3VsdC5mbGlwWSA9IG90aGVyLmZsaXBZXG4gICAgcmVzdWx0LnVucGFja0FsaWdubWVudCA9IG90aGVyLnVucGFja0FsaWdubWVudFxuICAgIHJlc3VsdC5jb2xvclNwYWNlID0gb3RoZXIuY29sb3JTcGFjZVxuXG4gICAgcmVzdWx0LndpZHRoID0gb3RoZXIud2lkdGhcbiAgICByZXN1bHQuaGVpZ2h0ID0gb3RoZXIuaGVpZ2h0XG4gICAgcmVzdWx0LmNoYW5uZWxzID0gb3RoZXIuY2hhbm5lbHNcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlRmxhZ3MgKGZsYWdzLCBvcHRpb25zKSB7XG4gICAgaWYgKHR5cGVvZiBvcHRpb25zICE9PSAnb2JqZWN0JyB8fCAhb3B0aW9ucykge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgaWYgKCdwcmVtdWx0aXBseUFscGhhJyBpbiBvcHRpb25zKSB7XG4gICAgICBjaGVjay50eXBlKG9wdGlvbnMucHJlbXVsdGlwbHlBbHBoYSwgJ2Jvb2xlYW4nLFxuICAgICAgICAnaW52YWxpZCBwcmVtdWx0aXBseUFscGhhJylcbiAgICAgIGZsYWdzLnByZW11bHRpcGx5QWxwaGEgPSBvcHRpb25zLnByZW11bHRpcGx5QWxwaGFcbiAgICB9XG5cbiAgICBpZiAoJ2ZsaXBZJyBpbiBvcHRpb25zKSB7XG4gICAgICBjaGVjay50eXBlKG9wdGlvbnMuZmxpcFksICdib29sZWFuJyxcbiAgICAgICAgJ2ludmFsaWQgdGV4dHVyZSBmbGlwJylcbiAgICAgIGZsYWdzLmZsaXBZID0gb3B0aW9ucy5mbGlwWVxuICAgIH1cblxuICAgIGlmICgnYWxpZ25tZW50JyBpbiBvcHRpb25zKSB7XG4gICAgICBjaGVjay5vbmVPZihvcHRpb25zLmFsaWdubWVudCwgWzEsIDIsIDQsIDhdLFxuICAgICAgICAnaW52YWxpZCB0ZXh0dXJlIHVucGFjayBhbGlnbm1lbnQnKVxuICAgICAgZmxhZ3MudW5wYWNrQWxpZ25tZW50ID0gb3B0aW9ucy5hbGlnbm1lbnRcbiAgICB9XG5cbiAgICBpZiAoJ2NvbG9yU3BhY2UnIGluIG9wdGlvbnMpIHtcbiAgICAgIGNoZWNrLnBhcmFtZXRlcihvcHRpb25zLmNvbG9yU3BhY2UsIGNvbG9yU3BhY2UsXG4gICAgICAgICdpbnZhbGlkIGNvbG9yU3BhY2UnKVxuICAgICAgZmxhZ3MuY29sb3JTcGFjZSA9IGNvbG9yU3BhY2Vbb3B0aW9ucy5jb2xvclNwYWNlXVxuICAgIH1cblxuICAgIGlmICgndHlwZScgaW4gb3B0aW9ucykge1xuICAgICAgdmFyIHR5cGUgPSBvcHRpb25zLnR5cGVcbiAgICAgIGNoZWNrKGV4dGVuc2lvbnMub2VzX3RleHR1cmVfZmxvYXQgfHxcbiAgICAgICAgISh0eXBlID09PSAnZmxvYXQnIHx8IHR5cGUgPT09ICdmbG9hdDMyJyksXG4gICAgICAgICd5b3UgbXVzdCBlbmFibGUgdGhlIE9FU190ZXh0dXJlX2Zsb2F0IGV4dGVuc2lvbiBpbiBvcmRlciB0byB1c2UgZmxvYXRpbmcgcG9pbnQgdGV4dHVyZXMuJylcbiAgICAgIGNoZWNrKGV4dGVuc2lvbnMub2VzX3RleHR1cmVfaGFsZl9mbG9hdCB8fFxuICAgICAgICAhKHR5cGUgPT09ICdoYWxmIGZsb2F0JyB8fCB0eXBlID09PSAnZmxvYXQxNicpLFxuICAgICAgICAneW91IG11c3QgZW5hYmxlIHRoZSBPRVNfdGV4dHVyZV9oYWxmX2Zsb2F0IGV4dGVuc2lvbiBpbiBvcmRlciB0byB1c2UgMTYtYml0IGZsb2F0aW5nIHBvaW50IHRleHR1cmVzLicpXG4gICAgICBjaGVjayhleHRlbnNpb25zLndlYmdsX2RlcHRoX3RleHR1cmUgfHxcbiAgICAgICAgISh0eXBlID09PSAndWludDE2JyB8fCB0eXBlID09PSAndWludDMyJyB8fCB0eXBlID09PSAnZGVwdGggc3RlbmNpbCcpLFxuICAgICAgICAneW91IG11c3QgZW5hYmxlIHRoZSBXRUJHTF9kZXB0aF90ZXh0dXJlIGV4dGVuc2lvbiBpbiBvcmRlciB0byB1c2UgZGVwdGgvc3RlbmNpbCB0ZXh0dXJlcy4nKVxuICAgICAgY2hlY2sucGFyYW1ldGVyKHR5cGUsIHRleHR1cmVUeXBlcyxcbiAgICAgICAgJ2ludmFsaWQgdGV4dHVyZSB0eXBlJylcbiAgICAgIGZsYWdzLnR5cGUgPSB0ZXh0dXJlVHlwZXNbdHlwZV1cbiAgICB9XG5cbiAgICB2YXIgdyA9IGZsYWdzLndpZHRoXG4gICAgdmFyIGggPSBmbGFncy5oZWlnaHRcbiAgICB2YXIgYyA9IGZsYWdzLmNoYW5uZWxzXG4gICAgdmFyIGhhc0NoYW5uZWxzID0gZmFsc2VcbiAgICBpZiAoJ3NoYXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICBjaGVjayhBcnJheS5pc0FycmF5KG9wdGlvbnMuc2hhcGUpICYmIG9wdGlvbnMuc2hhcGUubGVuZ3RoID49IDIsXG4gICAgICAgICdzaGFwZSBtdXN0IGJlIGFuIGFycmF5JylcbiAgICAgIHcgPSBvcHRpb25zLnNoYXBlWzBdXG4gICAgICBoID0gb3B0aW9ucy5zaGFwZVsxXVxuICAgICAgaWYgKG9wdGlvbnMuc2hhcGUubGVuZ3RoID09PSAzKSB7XG4gICAgICAgIGMgPSBvcHRpb25zLnNoYXBlWzJdXG4gICAgICAgIGNoZWNrKGMgPiAwICYmIGMgPD0gNCwgJ2ludmFsaWQgbnVtYmVyIG9mIGNoYW5uZWxzJylcbiAgICAgICAgaGFzQ2hhbm5lbHMgPSB0cnVlXG4gICAgICB9XG4gICAgICBjaGVjayh3ID49IDAgJiYgdyA8PSBsaW1pdHMubWF4VGV4dHVyZVNpemUsICdpbnZhbGlkIHdpZHRoJylcbiAgICAgIGNoZWNrKGggPj0gMCAmJiBoIDw9IGxpbWl0cy5tYXhUZXh0dXJlU2l6ZSwgJ2ludmFsaWQgaGVpZ2h0JylcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKCdyYWRpdXMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdyA9IGggPSBvcHRpb25zLnJhZGl1c1xuICAgICAgICBjaGVjayh3ID49IDAgJiYgdyA8PSBsaW1pdHMubWF4VGV4dHVyZVNpemUsICdpbnZhbGlkIHJhZGl1cycpXG4gICAgICB9XG4gICAgICBpZiAoJ3dpZHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHcgPSBvcHRpb25zLndpZHRoXG4gICAgICAgIGNoZWNrKHcgPj0gMCAmJiB3IDw9IGxpbWl0cy5tYXhUZXh0dXJlU2l6ZSwgJ2ludmFsaWQgd2lkdGgnKVxuICAgICAgfVxuICAgICAgaWYgKCdoZWlnaHQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgaCA9IG9wdGlvbnMuaGVpZ2h0XG4gICAgICAgIGNoZWNrKGggPj0gMCAmJiBoIDw9IGxpbWl0cy5tYXhUZXh0dXJlU2l6ZSwgJ2ludmFsaWQgaGVpZ2h0JylcbiAgICAgIH1cbiAgICAgIGlmICgnY2hhbm5lbHMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgYyA9IG9wdGlvbnMuY2hhbm5lbHNcbiAgICAgICAgY2hlY2soYyA+IDAgJiYgYyA8PSA0LCAnaW52YWxpZCBudW1iZXIgb2YgY2hhbm5lbHMnKVxuICAgICAgICBoYXNDaGFubmVscyA9IHRydWVcbiAgICAgIH1cbiAgICB9XG4gICAgZmxhZ3Mud2lkdGggPSB3IHwgMFxuICAgIGZsYWdzLmhlaWdodCA9IGggfCAwXG4gICAgZmxhZ3MuY2hhbm5lbHMgPSBjIHwgMFxuXG4gICAgdmFyIGhhc0Zvcm1hdCA9IGZhbHNlXG4gICAgaWYgKCdmb3JtYXQnIGluIG9wdGlvbnMpIHtcbiAgICAgIHZhciBmb3JtYXRTdHIgPSBvcHRpb25zLmZvcm1hdFxuICAgICAgY2hlY2soZXh0ZW5zaW9ucy53ZWJnbF9kZXB0aF90ZXh0dXJlIHx8XG4gICAgICAgICEoZm9ybWF0U3RyID09PSAnZGVwdGgnIHx8IGZvcm1hdFN0ciA9PT0gJ2RlcHRoIHN0ZW5jaWwnKSxcbiAgICAgICAgJ3lvdSBtdXN0IGVuYWJsZSB0aGUgV0VCR0xfZGVwdGhfdGV4dHVyZSBleHRlbnNpb24gaW4gb3JkZXIgdG8gdXNlIGRlcHRoL3N0ZW5jaWwgdGV4dHVyZXMuJylcbiAgICAgIGNoZWNrLnBhcmFtZXRlcihmb3JtYXRTdHIsIHRleHR1cmVGb3JtYXRzLFxuICAgICAgICAnaW52YWxpZCB0ZXh0dXJlIGZvcm1hdCcpXG4gICAgICB2YXIgaW50ZXJuYWxmb3JtYXQgPSBmbGFncy5pbnRlcm5hbGZvcm1hdCA9IHRleHR1cmVGb3JtYXRzW2Zvcm1hdFN0cl1cbiAgICAgIGZsYWdzLmZvcm1hdCA9IGNvbG9yRm9ybWF0c1tpbnRlcm5hbGZvcm1hdF1cbiAgICAgIGlmIChmb3JtYXRTdHIgaW4gdGV4dHVyZVR5cGVzKSB7XG4gICAgICAgIGlmICghKCd0eXBlJyBpbiBvcHRpb25zKSkge1xuICAgICAgICAgIGZsYWdzLnR5cGUgPSB0ZXh0dXJlVHlwZXNbZm9ybWF0U3RyXVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoZm9ybWF0U3RyIGluIGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cykge1xuICAgICAgICBmbGFncy5jb21wcmVzc2VkID0gdHJ1ZVxuICAgICAgfVxuICAgICAgaGFzRm9ybWF0ID0gdHJ1ZVxuICAgIH1cblxuICAgIC8vIFJlY29uY2lsZSBjaGFubmVscyBhbmQgZm9ybWF0XG4gICAgaWYgKCFoYXNDaGFubmVscyAmJiBoYXNGb3JtYXQpIHtcbiAgICAgIGZsYWdzLmNoYW5uZWxzID0gRk9STUFUX0NIQU5ORUxTW2ZsYWdzLmZvcm1hdF1cbiAgICB9IGVsc2UgaWYgKGhhc0NoYW5uZWxzICYmICFoYXNGb3JtYXQpIHtcbiAgICAgIGlmIChmbGFncy5jaGFubmVscyAhPT0gQ0hBTk5FTFNfRk9STUFUW2ZsYWdzLmZvcm1hdF0pIHtcbiAgICAgICAgZmxhZ3MuZm9ybWF0ID0gZmxhZ3MuaW50ZXJuYWxmb3JtYXQgPSBDSEFOTkVMU19GT1JNQVRbZmxhZ3MuY2hhbm5lbHNdXG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChoYXNGb3JtYXQgJiYgaGFzQ2hhbm5lbHMpIHtcbiAgICAgIGNoZWNrKFxuICAgICAgICBmbGFncy5jaGFubmVscyA9PT0gRk9STUFUX0NIQU5ORUxTW2ZsYWdzLmZvcm1hdF0sXG4gICAgICAgICdudW1iZXIgb2YgY2hhbm5lbHMgaW5jb25zaXN0ZW50IHdpdGggc3BlY2lmaWVkIGZvcm1hdCcpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc2V0RmxhZ3MgKGZsYWdzKSB7XG4gICAgZ2wucGl4ZWxTdG9yZWkoR0xfVU5QQUNLX0ZMSVBfWV9XRUJHTCwgZmxhZ3MuZmxpcFkpXG4gICAgZ2wucGl4ZWxTdG9yZWkoR0xfVU5QQUNLX1BSRU1VTFRJUExZX0FMUEhBX1dFQkdMLCBmbGFncy5wcmVtdWx0aXBseUFscGhhKVxuICAgIGdsLnBpeGVsU3RvcmVpKEdMX1VOUEFDS19DT0xPUlNQQUNFX0NPTlZFUlNJT05fV0VCR0wsIGZsYWdzLmNvbG9yU3BhY2UpXG4gICAgZ2wucGl4ZWxTdG9yZWkoR0xfVU5QQUNLX0FMSUdOTUVOVCwgZmxhZ3MudW5wYWNrQWxpZ25tZW50KVxuICB9XG5cbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAvLyBUZXggaW1hZ2UgZGF0YVxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIGZ1bmN0aW9uIFRleEltYWdlICgpIHtcbiAgICBUZXhGbGFncy5jYWxsKHRoaXMpXG5cbiAgICB0aGlzLnhPZmZzZXQgPSAwXG4gICAgdGhpcy55T2Zmc2V0ID0gMFxuXG4gICAgLy8gZGF0YVxuICAgIHRoaXMuZGF0YSA9IG51bGxcbiAgICB0aGlzLm5lZWRzRnJlZSA9IGZhbHNlXG5cbiAgICAvLyBodG1sIGVsZW1lbnRcbiAgICB0aGlzLmVsZW1lbnQgPSBudWxsXG5cbiAgICAvLyBjb3B5VGV4SW1hZ2UgaW5mb1xuICAgIHRoaXMubmVlZHNDb3B5ID0gZmFsc2VcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlSW1hZ2UgKGltYWdlLCBvcHRpb25zKSB7XG4gICAgdmFyIGRhdGEgPSBudWxsXG4gICAgaWYgKGlzUGl4ZWxEYXRhKG9wdGlvbnMpKSB7XG4gICAgICBkYXRhID0gb3B0aW9uc1xuICAgIH0gZWxzZSBpZiAob3B0aW9ucykge1xuICAgICAgY2hlY2sudHlwZShvcHRpb25zLCAnb2JqZWN0JywgJ2ludmFsaWQgcGl4ZWwgZGF0YSB0eXBlJylcbiAgICAgIHBhcnNlRmxhZ3MoaW1hZ2UsIG9wdGlvbnMpXG4gICAgICBpZiAoJ3gnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgaW1hZ2UueE9mZnNldCA9IG9wdGlvbnMueCB8IDBcbiAgICAgIH1cbiAgICAgIGlmICgneScgaW4gb3B0aW9ucykge1xuICAgICAgICBpbWFnZS55T2Zmc2V0ID0gb3B0aW9ucy55IHwgMFxuICAgICAgfVxuICAgICAgaWYgKGlzUGl4ZWxEYXRhKG9wdGlvbnMuZGF0YSkpIHtcbiAgICAgICAgZGF0YSA9IG9wdGlvbnMuZGF0YVxuICAgICAgfVxuICAgIH1cblxuICAgIGNoZWNrKFxuICAgICAgIWltYWdlLmNvbXByZXNzZWQgfHxcbiAgICAgIGRhdGEgaW5zdGFuY2VvZiBVaW50OEFycmF5LFxuICAgICAgJ2NvbXByZXNzZWQgdGV4dHVyZSBkYXRhIG11c3QgYmUgc3RvcmVkIGluIGEgdWludDhhcnJheScpXG5cbiAgICBpZiAob3B0aW9ucy5jb3B5KSB7XG4gICAgICBjaGVjayghZGF0YSwgJ2NhbiBub3Qgc3BlY2lmeSBjb3B5IGFuZCBkYXRhIGZpZWxkIGZvciB0aGUgc2FtZSB0ZXh0dXJlJylcbiAgICAgIHZhciB2aWV3VyA9IGNvbnRleHRTdGF0ZS52aWV3cG9ydFdpZHRoXG4gICAgICB2YXIgdmlld0ggPSBjb250ZXh0U3RhdGUudmlld3BvcnRIZWlnaHRcbiAgICAgIGltYWdlLndpZHRoID0gaW1hZ2Uud2lkdGggfHwgKHZpZXdXIC0gaW1hZ2UueE9mZnNldClcbiAgICAgIGltYWdlLmhlaWdodCA9IGltYWdlLmhlaWdodCB8fCAodmlld0ggLSBpbWFnZS55T2Zmc2V0KVxuICAgICAgaW1hZ2UubmVlZHNDb3B5ID0gdHJ1ZVxuICAgICAgY2hlY2soaW1hZ2UueE9mZnNldCA+PSAwICYmIGltYWdlLnhPZmZzZXQgPCB2aWV3VyAmJlxuICAgICAgICAgICAgaW1hZ2UueU9mZnNldCA+PSAwICYmIGltYWdlLnlPZmZzZXQgPCB2aWV3SCAmJlxuICAgICAgICAgICAgaW1hZ2Uud2lkdGggPiAwICYmIGltYWdlLndpZHRoIDw9IHZpZXdXICYmXG4gICAgICAgICAgICBpbWFnZS5oZWlnaHQgPiAwICYmIGltYWdlLmhlaWdodCA8PSB2aWV3SCxcbiAgICAgICAgICAgICdjb3B5IHRleHR1cmUgcmVhZCBvdXQgb2YgYm91bmRzJylcbiAgICB9IGVsc2UgaWYgKCFkYXRhKSB7XG4gICAgICBpbWFnZS53aWR0aCA9IGltYWdlLndpZHRoIHx8IDFcbiAgICAgIGltYWdlLmhlaWdodCA9IGltYWdlLmhlaWdodCB8fCAxXG4gICAgICBpbWFnZS5jaGFubmVscyA9IGltYWdlLmNoYW5uZWxzIHx8IDRcbiAgICB9IGVsc2UgaWYgKGlzVHlwZWRBcnJheShkYXRhKSkge1xuICAgICAgaW1hZ2UuY2hhbm5lbHMgPSBpbWFnZS5jaGFubmVscyB8fCA0XG4gICAgICBpbWFnZS5kYXRhID0gZGF0YVxuICAgICAgaWYgKCEoJ3R5cGUnIGluIG9wdGlvbnMpICYmIGltYWdlLnR5cGUgPT09IEdMX1VOU0lHTkVEX0JZVEUpIHtcbiAgICAgICAgaW1hZ2UudHlwZSA9IHR5cGVkQXJyYXlDb2RlKGRhdGEpXG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChpc051bWVyaWNBcnJheShkYXRhKSkge1xuICAgICAgaW1hZ2UuY2hhbm5lbHMgPSBpbWFnZS5jaGFubmVscyB8fCA0XG4gICAgICBjb252ZXJ0RGF0YShpbWFnZSwgZGF0YSlcbiAgICAgIGltYWdlLmFsaWdubWVudCA9IDFcbiAgICAgIGltYWdlLm5lZWRzRnJlZSA9IHRydWVcbiAgICB9IGVsc2UgaWYgKGlzTkRBcnJheUxpa2UoZGF0YSkpIHtcbiAgICAgIHZhciBhcnJheSA9IGRhdGEuZGF0YVxuICAgICAgaWYgKCFBcnJheS5pc0FycmF5KGFycmF5KSAmJiBpbWFnZS50eXBlID09PSBHTF9VTlNJR05FRF9CWVRFKSB7XG4gICAgICAgIGltYWdlLnR5cGUgPSB0eXBlZEFycmF5Q29kZShhcnJheSlcbiAgICAgIH1cbiAgICAgIHZhciBzaGFwZSA9IGRhdGEuc2hhcGVcbiAgICAgIHZhciBzdHJpZGUgPSBkYXRhLnN0cmlkZVxuICAgICAgdmFyIHNoYXBlWCwgc2hhcGVZLCBzaGFwZUMsIHN0cmlkZVgsIHN0cmlkZVksIHN0cmlkZUNcbiAgICAgIGlmIChzaGFwZS5sZW5ndGggPT09IDMpIHtcbiAgICAgICAgc2hhcGVDID0gc2hhcGVbMl1cbiAgICAgICAgc3RyaWRlQyA9IHN0cmlkZVsyXVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY2hlY2soc2hhcGUubGVuZ3RoID09PSAyLCAnaW52YWxpZCBuZGFycmF5IHBpeGVsIGRhdGEsIG11c3QgYmUgMiBvciAzRCcpXG4gICAgICAgIHNoYXBlQyA9IDFcbiAgICAgICAgc3RyaWRlQyA9IDFcbiAgICAgIH1cbiAgICAgIHNoYXBlWCA9IHNoYXBlWzBdXG4gICAgICBzaGFwZVkgPSBzaGFwZVsxXVxuICAgICAgc3RyaWRlWCA9IHN0cmlkZVswXVxuICAgICAgc3RyaWRlWSA9IHN0cmlkZVsxXVxuICAgICAgaW1hZ2UuYWxpZ25tZW50ID0gMVxuICAgICAgaW1hZ2Uud2lkdGggPSBzaGFwZVhcbiAgICAgIGltYWdlLmhlaWdodCA9IHNoYXBlWVxuICAgICAgaW1hZ2UuY2hhbm5lbHMgPSBzaGFwZUNcbiAgICAgIGltYWdlLmZvcm1hdCA9IGltYWdlLmludGVybmFsZm9ybWF0ID0gQ0hBTk5FTFNfRk9STUFUW3NoYXBlQ11cbiAgICAgIGltYWdlLm5lZWRzRnJlZSA9IHRydWVcbiAgICAgIHRyYW5zcG9zZURhdGEoaW1hZ2UsIGFycmF5LCBzdHJpZGVYLCBzdHJpZGVZLCBzdHJpZGVDLCBkYXRhLm9mZnNldClcbiAgICB9IGVsc2UgaWYgKGlzQ2FudmFzRWxlbWVudChkYXRhKSB8fCBpc0NvbnRleHQyRChkYXRhKSkge1xuICAgICAgaWYgKGlzQ2FudmFzRWxlbWVudChkYXRhKSkge1xuICAgICAgICBpbWFnZS5lbGVtZW50ID0gZGF0YVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaW1hZ2UuZWxlbWVudCA9IGRhdGEuY2FudmFzXG4gICAgICB9XG4gICAgICBpbWFnZS53aWR0aCA9IGltYWdlLmVsZW1lbnQud2lkdGhcbiAgICAgIGltYWdlLmhlaWdodCA9IGltYWdlLmVsZW1lbnQuaGVpZ2h0XG4gICAgICBpbWFnZS5jaGFubmVscyA9IDRcbiAgICB9IGVsc2UgaWYgKGlzSW1hZ2VFbGVtZW50KGRhdGEpKSB7XG4gICAgICBpbWFnZS5lbGVtZW50ID0gZGF0YVxuICAgICAgaW1hZ2Uud2lkdGggPSBkYXRhLm5hdHVyYWxXaWR0aFxuICAgICAgaW1hZ2UuaGVpZ2h0ID0gZGF0YS5uYXR1cmFsSGVpZ2h0XG4gICAgICBpbWFnZS5jaGFubmVscyA9IDRcbiAgICB9IGVsc2UgaWYgKGlzVmlkZW9FbGVtZW50KGRhdGEpKSB7XG4gICAgICBpbWFnZS5lbGVtZW50ID0gZGF0YVxuICAgICAgaW1hZ2Uud2lkdGggPSBkYXRhLnZpZGVvV2lkdGhcbiAgICAgIGltYWdlLmhlaWdodCA9IGRhdGEudmlkZW9IZWlnaHRcbiAgICAgIGltYWdlLmNoYW5uZWxzID0gNFxuICAgIH0gZWxzZSBpZiAoaXNSZWN0QXJyYXkoZGF0YSkpIHtcbiAgICAgIHZhciB3ID0gaW1hZ2Uud2lkdGggfHwgZGF0YVswXS5sZW5ndGhcbiAgICAgIHZhciBoID0gaW1hZ2UuaGVpZ2h0IHx8IGRhdGEubGVuZ3RoXG4gICAgICB2YXIgYyA9IGltYWdlLmNoYW5uZWxzXG4gICAgICBpZiAoaXNBcnJheUxpa2UoZGF0YVswXVswXSkpIHtcbiAgICAgICAgYyA9IGMgfHwgZGF0YVswXVswXS5sZW5ndGhcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGMgPSBjIHx8IDFcbiAgICAgIH1cbiAgICAgIHZhciBhcnJheVNoYXBlID0gZmxhdHRlblV0aWxzLnNoYXBlKGRhdGEpXG4gICAgICB2YXIgbiA9IDFcbiAgICAgIGZvciAodmFyIGRkID0gMDsgZGQgPCBhcnJheVNoYXBlLmxlbmd0aDsgKytkZCkge1xuICAgICAgICBuICo9IGFycmF5U2hhcGVbZGRdXG4gICAgICB9XG4gICAgICB2YXIgYWxsb2NEYXRhID0gcHJlQ29udmVydChpbWFnZSwgbilcbiAgICAgIGZsYXR0ZW5VdGlscy5mbGF0dGVuKGRhdGEsIGFycmF5U2hhcGUsICcnLCBhbGxvY0RhdGEpXG4gICAgICBwb3N0Q29udmVydChpbWFnZSwgYWxsb2NEYXRhKVxuICAgICAgaW1hZ2UuYWxpZ25tZW50ID0gMVxuICAgICAgaW1hZ2Uud2lkdGggPSB3XG4gICAgICBpbWFnZS5oZWlnaHQgPSBoXG4gICAgICBpbWFnZS5jaGFubmVscyA9IGNcbiAgICAgIGltYWdlLmZvcm1hdCA9IGltYWdlLmludGVybmFsZm9ybWF0ID0gQ0hBTk5FTFNfRk9STUFUW2NdXG4gICAgICBpbWFnZS5uZWVkc0ZyZWUgPSB0cnVlXG4gICAgfVxuXG4gICAgaWYgKGltYWdlLnR5cGUgPT09IEdMX0ZMT0FUKSB7XG4gICAgICBjaGVjayhsaW1pdHMuZXh0ZW5zaW9ucy5pbmRleE9mKCdvZXNfdGV4dHVyZV9mbG9hdCcpID49IDAsXG4gICAgICAgICdvZXNfdGV4dHVyZV9mbG9hdCBleHRlbnNpb24gbm90IGVuYWJsZWQnKVxuICAgIH0gZWxzZSBpZiAoaW1hZ2UudHlwZSA9PT0gR0xfSEFMRl9GTE9BVF9PRVMpIHtcbiAgICAgIGNoZWNrKGxpbWl0cy5leHRlbnNpb25zLmluZGV4T2YoJ29lc190ZXh0dXJlX2hhbGZfZmxvYXQnKSA+PSAwLFxuICAgICAgICAnb2VzX3RleHR1cmVfaGFsZl9mbG9hdCBleHRlbnNpb24gbm90IGVuYWJsZWQnKVxuICAgIH1cblxuICAgIC8vIGRvIGNvbXByZXNzZWQgdGV4dHVyZSAgdmFsaWRhdGlvbiBoZXJlLlxuICB9XG5cbiAgZnVuY3Rpb24gc2V0SW1hZ2UgKGluZm8sIHRhcmdldCwgbWlwbGV2ZWwpIHtcbiAgICB2YXIgZWxlbWVudCA9IGluZm8uZWxlbWVudFxuICAgIHZhciBkYXRhID0gaW5mby5kYXRhXG4gICAgdmFyIGludGVybmFsZm9ybWF0ID0gaW5mby5pbnRlcm5hbGZvcm1hdFxuICAgIHZhciBmb3JtYXQgPSBpbmZvLmZvcm1hdFxuICAgIHZhciB0eXBlID0gaW5mby50eXBlXG4gICAgdmFyIHdpZHRoID0gaW5mby53aWR0aFxuICAgIHZhciBoZWlnaHQgPSBpbmZvLmhlaWdodFxuXG4gICAgc2V0RmxhZ3MoaW5mbylcblxuICAgIGlmIChlbGVtZW50KSB7XG4gICAgICBnbC50ZXhJbWFnZTJEKHRhcmdldCwgbWlwbGV2ZWwsIGZvcm1hdCwgZm9ybWF0LCB0eXBlLCBlbGVtZW50KVxuICAgIH0gZWxzZSBpZiAoaW5mby5jb21wcmVzc2VkKSB7XG4gICAgICBnbC5jb21wcmVzc2VkVGV4SW1hZ2UyRCh0YXJnZXQsIG1pcGxldmVsLCBpbnRlcm5hbGZvcm1hdCwgd2lkdGgsIGhlaWdodCwgMCwgZGF0YSlcbiAgICB9IGVsc2UgaWYgKGluZm8ubmVlZHNDb3B5KSB7XG4gICAgICByZWdsUG9sbCgpXG4gICAgICBnbC5jb3B5VGV4SW1hZ2UyRChcbiAgICAgICAgdGFyZ2V0LCBtaXBsZXZlbCwgZm9ybWF0LCBpbmZvLnhPZmZzZXQsIGluZm8ueU9mZnNldCwgd2lkdGgsIGhlaWdodCwgMClcbiAgICB9IGVsc2Uge1xuICAgICAgZ2wudGV4SW1hZ2UyRChcbiAgICAgICAgdGFyZ2V0LCBtaXBsZXZlbCwgZm9ybWF0LCB3aWR0aCwgaGVpZ2h0LCAwLCBmb3JtYXQsIHR5cGUsIGRhdGEpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc2V0U3ViSW1hZ2UgKGluZm8sIHRhcmdldCwgeCwgeSwgbWlwbGV2ZWwpIHtcbiAgICB2YXIgZWxlbWVudCA9IGluZm8uZWxlbWVudFxuICAgIHZhciBkYXRhID0gaW5mby5kYXRhXG4gICAgdmFyIGludGVybmFsZm9ybWF0ID0gaW5mby5pbnRlcm5hbGZvcm1hdFxuICAgIHZhciBmb3JtYXQgPSBpbmZvLmZvcm1hdFxuICAgIHZhciB0eXBlID0gaW5mby50eXBlXG4gICAgdmFyIHdpZHRoID0gaW5mby53aWR0aFxuICAgIHZhciBoZWlnaHQgPSBpbmZvLmhlaWdodFxuXG4gICAgc2V0RmxhZ3MoaW5mbylcblxuICAgIGlmIChlbGVtZW50KSB7XG4gICAgICBnbC50ZXhTdWJJbWFnZTJEKFxuICAgICAgICB0YXJnZXQsIG1pcGxldmVsLCB4LCB5LCBmb3JtYXQsIHR5cGUsIGVsZW1lbnQpXG4gICAgfSBlbHNlIGlmIChpbmZvLmNvbXByZXNzZWQpIHtcbiAgICAgIGdsLmNvbXByZXNzZWRUZXhTdWJJbWFnZTJEKFxuICAgICAgICB0YXJnZXQsIG1pcGxldmVsLCB4LCB5LCBpbnRlcm5hbGZvcm1hdCwgd2lkdGgsIGhlaWdodCwgZGF0YSlcbiAgICB9IGVsc2UgaWYgKGluZm8ubmVlZHNDb3B5KSB7XG4gICAgICByZWdsUG9sbCgpXG4gICAgICBnbC5jb3B5VGV4U3ViSW1hZ2UyRChcbiAgICAgICAgdGFyZ2V0LCBtaXBsZXZlbCwgeCwgeSwgaW5mby54T2Zmc2V0LCBpbmZvLnlPZmZzZXQsIHdpZHRoLCBoZWlnaHQpXG4gICAgfSBlbHNlIHtcbiAgICAgIGdsLnRleFN1YkltYWdlMkQoXG4gICAgICAgIHRhcmdldCwgbWlwbGV2ZWwsIHgsIHksIHdpZHRoLCBoZWlnaHQsIGZvcm1hdCwgdHlwZSwgZGF0YSlcbiAgICB9XG4gIH1cblxuICAvLyB0ZXhJbWFnZSBwb29sXG4gIHZhciBpbWFnZVBvb2wgPSBbXVxuXG4gIGZ1bmN0aW9uIGFsbG9jSW1hZ2UgKCkge1xuICAgIHJldHVybiBpbWFnZVBvb2wucG9wKCkgfHwgbmV3IFRleEltYWdlKClcbiAgfVxuXG4gIGZ1bmN0aW9uIGZyZWVJbWFnZSAoaW1hZ2UpIHtcbiAgICBpZiAoaW1hZ2UubmVlZHNGcmVlKSB7XG4gICAgICBwb29sLmZyZWVUeXBlKGltYWdlLmRhdGEpXG4gICAgfVxuICAgIFRleEltYWdlLmNhbGwoaW1hZ2UpXG4gICAgaW1hZ2VQb29sLnB1c2goaW1hZ2UpXG4gIH1cblxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIE1pcCBtYXBcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICBmdW5jdGlvbiBNaXBNYXAgKCkge1xuICAgIFRleEZsYWdzLmNhbGwodGhpcylcblxuICAgIHRoaXMuZ2VuTWlwbWFwcyA9IGZhbHNlXG4gICAgdGhpcy5taXBtYXBIaW50ID0gR0xfRE9OVF9DQVJFXG4gICAgdGhpcy5taXBtYXNrID0gMFxuICAgIHRoaXMuaW1hZ2VzID0gQXJyYXkoMTYpXG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZU1pcE1hcEZyb21TaGFwZSAobWlwbWFwLCB3aWR0aCwgaGVpZ2h0KSB7XG4gICAgdmFyIGltZyA9IG1pcG1hcC5pbWFnZXNbMF0gPSBhbGxvY0ltYWdlKClcbiAgICBtaXBtYXAubWlwbWFzayA9IDFcbiAgICBpbWcud2lkdGggPSBtaXBtYXAud2lkdGggPSB3aWR0aFxuICAgIGltZy5oZWlnaHQgPSBtaXBtYXAuaGVpZ2h0ID0gaGVpZ2h0XG4gICAgaW1nLmNoYW5uZWxzID0gbWlwbWFwLmNoYW5uZWxzID0gNFxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VNaXBNYXBGcm9tT2JqZWN0IChtaXBtYXAsIG9wdGlvbnMpIHtcbiAgICB2YXIgaW1nRGF0YSA9IG51bGxcbiAgICBpZiAoaXNQaXhlbERhdGEob3B0aW9ucykpIHtcbiAgICAgIGltZ0RhdGEgPSBtaXBtYXAuaW1hZ2VzWzBdID0gYWxsb2NJbWFnZSgpXG4gICAgICBjb3B5RmxhZ3MoaW1nRGF0YSwgbWlwbWFwKVxuICAgICAgcGFyc2VJbWFnZShpbWdEYXRhLCBvcHRpb25zKVxuICAgICAgbWlwbWFwLm1pcG1hc2sgPSAxXG4gICAgfSBlbHNlIHtcbiAgICAgIHBhcnNlRmxhZ3MobWlwbWFwLCBvcHRpb25zKVxuICAgICAgaWYgKEFycmF5LmlzQXJyYXkob3B0aW9ucy5taXBtYXApKSB7XG4gICAgICAgIHZhciBtaXBEYXRhID0gb3B0aW9ucy5taXBtYXBcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBtaXBEYXRhLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgaW1nRGF0YSA9IG1pcG1hcC5pbWFnZXNbaV0gPSBhbGxvY0ltYWdlKClcbiAgICAgICAgICBjb3B5RmxhZ3MoaW1nRGF0YSwgbWlwbWFwKVxuICAgICAgICAgIGltZ0RhdGEud2lkdGggPj49IGlcbiAgICAgICAgICBpbWdEYXRhLmhlaWdodCA+Pj0gaVxuICAgICAgICAgIHBhcnNlSW1hZ2UoaW1nRGF0YSwgbWlwRGF0YVtpXSlcbiAgICAgICAgICBtaXBtYXAubWlwbWFzayB8PSAoMSA8PCBpKVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpbWdEYXRhID0gbWlwbWFwLmltYWdlc1swXSA9IGFsbG9jSW1hZ2UoKVxuICAgICAgICBjb3B5RmxhZ3MoaW1nRGF0YSwgbWlwbWFwKVxuICAgICAgICBwYXJzZUltYWdlKGltZ0RhdGEsIG9wdGlvbnMpXG4gICAgICAgIG1pcG1hcC5taXBtYXNrID0gMVxuICAgICAgfVxuICAgIH1cbiAgICBjb3B5RmxhZ3MobWlwbWFwLCBtaXBtYXAuaW1hZ2VzWzBdKVxuXG4gICAgLy8gRm9yIHRleHR1cmVzIG9mIHRoZSBjb21wcmVzc2VkIGZvcm1hdCBXRUJHTF9jb21wcmVzc2VkX3RleHR1cmVfczN0Y1xuICAgIC8vIHdlIG11c3QgaGF2ZSB0aGF0XG4gICAgLy9cbiAgICAvLyBcIldoZW4gbGV2ZWwgZXF1YWxzIHplcm8gd2lkdGggYW5kIGhlaWdodCBtdXN0IGJlIGEgbXVsdGlwbGUgb2YgNC5cbiAgICAvLyBXaGVuIGxldmVsIGlzIGdyZWF0ZXIgdGhhbiAwIHdpZHRoIGFuZCBoZWlnaHQgbXVzdCBiZSAwLCAxLCAyIG9yIGEgbXVsdGlwbGUgb2YgNC4gXCJcbiAgICAvL1xuICAgIC8vIGJ1dCB3ZSBkbyBub3QgeWV0IHN1cHBvcnQgaGF2aW5nIG11bHRpcGxlIG1pcG1hcCBsZXZlbHMgZm9yIGNvbXByZXNzZWQgdGV4dHVyZXMsXG4gICAgLy8gc28gd2Ugb25seSB0ZXN0IGZvciBsZXZlbCB6ZXJvLlxuXG4gICAgaWYgKG1pcG1hcC5jb21wcmVzc2VkICYmXG4gICAgICAgIChtaXBtYXAuaW50ZXJuYWxmb3JtYXQgPT09IEdMX0NPTVBSRVNTRURfUkdCX1MzVENfRFhUMV9FWFQpIHx8XG4gICAgICAgIChtaXBtYXAuaW50ZXJuYWxmb3JtYXQgPT09IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDFfRVhUKSB8fFxuICAgICAgICAobWlwbWFwLmludGVybmFsZm9ybWF0ID09PSBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQzX0VYVCkgfHxcbiAgICAgICAgKG1pcG1hcC5pbnRlcm5hbGZvcm1hdCA9PT0gR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUNV9FWFQpKSB7XG4gICAgICBjaGVjayhtaXBtYXAud2lkdGggJSA0ID09PSAwICYmXG4gICAgICAgICAgICBtaXBtYXAuaGVpZ2h0ICUgNCA9PT0gMCxcbiAgICAgICAgICAgICdmb3IgY29tcHJlc3NlZCB0ZXh0dXJlIGZvcm1hdHMsIG1pcG1hcCBsZXZlbCAwIG11c3QgaGF2ZSB3aWR0aCBhbmQgaGVpZ2h0IHRoYXQgYXJlIGEgbXVsdGlwbGUgb2YgNCcpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc2V0TWlwTWFwIChtaXBtYXAsIHRhcmdldCkge1xuICAgIHZhciBpbWFnZXMgPSBtaXBtYXAuaW1hZ2VzXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBpbWFnZXMubGVuZ3RoOyArK2kpIHtcbiAgICAgIGlmICghaW1hZ2VzW2ldKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgc2V0SW1hZ2UoaW1hZ2VzW2ldLCB0YXJnZXQsIGkpXG4gICAgfVxuICB9XG5cbiAgdmFyIG1pcFBvb2wgPSBbXVxuXG4gIGZ1bmN0aW9uIGFsbG9jTWlwTWFwICgpIHtcbiAgICB2YXIgcmVzdWx0ID0gbWlwUG9vbC5wb3AoKSB8fCBuZXcgTWlwTWFwKClcbiAgICBUZXhGbGFncy5jYWxsKHJlc3VsdClcbiAgICByZXN1bHQubWlwbWFzayA9IDBcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IDE2OyArK2kpIHtcbiAgICAgIHJlc3VsdC5pbWFnZXNbaV0gPSBudWxsXG4gICAgfVxuICAgIHJldHVybiByZXN1bHRcbiAgfVxuXG4gIGZ1bmN0aW9uIGZyZWVNaXBNYXAgKG1pcG1hcCkge1xuICAgIHZhciBpbWFnZXMgPSBtaXBtYXAuaW1hZ2VzXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBpbWFnZXMubGVuZ3RoOyArK2kpIHtcbiAgICAgIGlmIChpbWFnZXNbaV0pIHtcbiAgICAgICAgZnJlZUltYWdlKGltYWdlc1tpXSlcbiAgICAgIH1cbiAgICAgIGltYWdlc1tpXSA9IG51bGxcbiAgICB9XG4gICAgbWlwUG9vbC5wdXNoKG1pcG1hcClcbiAgfVxuXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gVGV4IGluZm9cbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICBmdW5jdGlvbiBUZXhJbmZvICgpIHtcbiAgICB0aGlzLm1pbkZpbHRlciA9IEdMX05FQVJFU1RcbiAgICB0aGlzLm1hZ0ZpbHRlciA9IEdMX05FQVJFU1RcblxuICAgIHRoaXMud3JhcFMgPSBHTF9DTEFNUF9UT19FREdFXG4gICAgdGhpcy53cmFwVCA9IEdMX0NMQU1QX1RPX0VER0VcblxuICAgIHRoaXMuYW5pc290cm9waWMgPSAxXG5cbiAgICB0aGlzLmdlbk1pcG1hcHMgPSBmYWxzZVxuICAgIHRoaXMubWlwbWFwSGludCA9IEdMX0RPTlRfQ0FSRVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VUZXhJbmZvIChpbmZvLCBvcHRpb25zKSB7XG4gICAgaWYgKCdtaW4nIGluIG9wdGlvbnMpIHtcbiAgICAgIHZhciBtaW5GaWx0ZXIgPSBvcHRpb25zLm1pblxuICAgICAgY2hlY2sucGFyYW1ldGVyKG1pbkZpbHRlciwgbWluRmlsdGVycylcbiAgICAgIGluZm8ubWluRmlsdGVyID0gbWluRmlsdGVyc1ttaW5GaWx0ZXJdXG4gICAgICBpZiAoTUlQTUFQX0ZJTFRFUlMuaW5kZXhPZihpbmZvLm1pbkZpbHRlcikgPj0gMCkge1xuICAgICAgICBpbmZvLmdlbk1pcG1hcHMgPSB0cnVlXG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKCdtYWcnIGluIG9wdGlvbnMpIHtcbiAgICAgIHZhciBtYWdGaWx0ZXIgPSBvcHRpb25zLm1hZ1xuICAgICAgY2hlY2sucGFyYW1ldGVyKG1hZ0ZpbHRlciwgbWFnRmlsdGVycylcbiAgICAgIGluZm8ubWFnRmlsdGVyID0gbWFnRmlsdGVyc1ttYWdGaWx0ZXJdXG4gICAgfVxuXG4gICAgdmFyIHdyYXBTID0gaW5mby53cmFwU1xuICAgIHZhciB3cmFwVCA9IGluZm8ud3JhcFRcbiAgICBpZiAoJ3dyYXAnIGluIG9wdGlvbnMpIHtcbiAgICAgIHZhciB3cmFwID0gb3B0aW9ucy53cmFwXG4gICAgICBpZiAodHlwZW9mIHdyYXAgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGNoZWNrLnBhcmFtZXRlcih3cmFwLCB3cmFwTW9kZXMpXG4gICAgICAgIHdyYXBTID0gd3JhcFQgPSB3cmFwTW9kZXNbd3JhcF1cbiAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheSh3cmFwKSkge1xuICAgICAgICBjaGVjay5wYXJhbWV0ZXIod3JhcFswXSwgd3JhcE1vZGVzKVxuICAgICAgICBjaGVjay5wYXJhbWV0ZXIod3JhcFsxXSwgd3JhcE1vZGVzKVxuICAgICAgICB3cmFwUyA9IHdyYXBNb2Rlc1t3cmFwWzBdXVxuICAgICAgICB3cmFwVCA9IHdyYXBNb2Rlc1t3cmFwWzFdXVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoJ3dyYXBTJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBvcHRXcmFwUyA9IG9wdGlvbnMud3JhcFNcbiAgICAgICAgY2hlY2sucGFyYW1ldGVyKG9wdFdyYXBTLCB3cmFwTW9kZXMpXG4gICAgICAgIHdyYXBTID0gd3JhcE1vZGVzW29wdFdyYXBTXVxuICAgICAgfVxuICAgICAgaWYgKCd3cmFwVCcgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgb3B0V3JhcFQgPSBvcHRpb25zLndyYXBUXG4gICAgICAgIGNoZWNrLnBhcmFtZXRlcihvcHRXcmFwVCwgd3JhcE1vZGVzKVxuICAgICAgICB3cmFwVCA9IHdyYXBNb2Rlc1tvcHRXcmFwVF1cbiAgICAgIH1cbiAgICB9XG4gICAgaW5mby53cmFwUyA9IHdyYXBTXG4gICAgaW5mby53cmFwVCA9IHdyYXBUXG5cbiAgICBpZiAoJ2FuaXNvdHJvcGljJyBpbiBvcHRpb25zKSB7XG4gICAgICB2YXIgYW5pc290cm9waWMgPSBvcHRpb25zLmFuaXNvdHJvcGljXG4gICAgICBjaGVjayh0eXBlb2YgYW5pc290cm9waWMgPT09ICdudW1iZXInICYmXG4gICAgICAgICBhbmlzb3Ryb3BpYyA+PSAxICYmIGFuaXNvdHJvcGljIDw9IGxpbWl0cy5tYXhBbmlzb3Ryb3BpYyxcbiAgICAgICAgJ2FuaXNvIHNhbXBsZXMgbXVzdCBiZSBiZXR3ZWVuIDEgYW5kICcpXG4gICAgICBpbmZvLmFuaXNvdHJvcGljID0gb3B0aW9ucy5hbmlzb3Ryb3BpY1xuICAgIH1cblxuICAgIGlmICgnbWlwbWFwJyBpbiBvcHRpb25zKSB7XG4gICAgICB2YXIgaGFzTWlwTWFwID0gZmFsc2VcbiAgICAgIHN3aXRjaCAodHlwZW9mIG9wdGlvbnMubWlwbWFwKSB7XG4gICAgICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICAgICAgY2hlY2sucGFyYW1ldGVyKG9wdGlvbnMubWlwbWFwLCBtaXBtYXBIaW50LFxuICAgICAgICAgICAgJ2ludmFsaWQgbWlwbWFwIGhpbnQnKVxuICAgICAgICAgIGluZm8ubWlwbWFwSGludCA9IG1pcG1hcEhpbnRbb3B0aW9ucy5taXBtYXBdXG4gICAgICAgICAgaW5mby5nZW5NaXBtYXBzID0gdHJ1ZVxuICAgICAgICAgIGhhc01pcE1hcCA9IHRydWVcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgICAgIGhhc01pcE1hcCA9IGluZm8uZ2VuTWlwbWFwcyA9IG9wdGlvbnMubWlwbWFwXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdvYmplY3QnOlxuICAgICAgICAgIGNoZWNrKEFycmF5LmlzQXJyYXkob3B0aW9ucy5taXBtYXApLCAnaW52YWxpZCBtaXBtYXAgdHlwZScpXG4gICAgICAgICAgaW5mby5nZW5NaXBtYXBzID0gZmFsc2VcbiAgICAgICAgICBoYXNNaXBNYXAgPSB0cnVlXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIGNoZWNrLnJhaXNlKCdpbnZhbGlkIG1pcG1hcCB0eXBlJylcbiAgICAgIH1cbiAgICAgIGlmIChoYXNNaXBNYXAgJiYgISgnbWluJyBpbiBvcHRpb25zKSkge1xuICAgICAgICBpbmZvLm1pbkZpbHRlciA9IEdMX05FQVJFU1RfTUlQTUFQX05FQVJFU1RcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzZXRUZXhJbmZvIChpbmZvLCB0YXJnZXQpIHtcbiAgICBnbC50ZXhQYXJhbWV0ZXJpKHRhcmdldCwgR0xfVEVYVFVSRV9NSU5fRklMVEVSLCBpbmZvLm1pbkZpbHRlcilcbiAgICBnbC50ZXhQYXJhbWV0ZXJpKHRhcmdldCwgR0xfVEVYVFVSRV9NQUdfRklMVEVSLCBpbmZvLm1hZ0ZpbHRlcilcbiAgICBnbC50ZXhQYXJhbWV0ZXJpKHRhcmdldCwgR0xfVEVYVFVSRV9XUkFQX1MsIGluZm8ud3JhcFMpXG4gICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfV1JBUF9ULCBpbmZvLndyYXBUKVxuICAgIGlmIChleHRlbnNpb25zLmV4dF90ZXh0dXJlX2ZpbHRlcl9hbmlzb3Ryb3BpYykge1xuICAgICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfTUFYX0FOSVNPVFJPUFlfRVhULCBpbmZvLmFuaXNvdHJvcGljKVxuICAgIH1cbiAgICBpZiAoaW5mby5nZW5NaXBtYXBzKSB7XG4gICAgICBnbC5oaW50KEdMX0dFTkVSQVRFX01JUE1BUF9ISU5ULCBpbmZvLm1pcG1hcEhpbnQpXG4gICAgICBnbC5nZW5lcmF0ZU1pcG1hcCh0YXJnZXQpXG4gICAgfVxuICB9XG5cbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAvLyBGdWxsIHRleHR1cmUgb2JqZWN0XG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgdmFyIHRleHR1cmVDb3VudCA9IDBcbiAgdmFyIHRleHR1cmVTZXQgPSB7fVxuICB2YXIgbnVtVGV4VW5pdHMgPSBsaW1pdHMubWF4VGV4dHVyZVVuaXRzXG4gIHZhciB0ZXh0dXJlVW5pdHMgPSBBcnJheShudW1UZXhVbml0cykubWFwKGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gbnVsbFxuICB9KVxuXG4gIGZ1bmN0aW9uIFJFR0xUZXh0dXJlICh0YXJnZXQpIHtcbiAgICBUZXhGbGFncy5jYWxsKHRoaXMpXG4gICAgdGhpcy5taXBtYXNrID0gMFxuICAgIHRoaXMuaW50ZXJuYWxmb3JtYXQgPSBHTF9SR0JBXG5cbiAgICB0aGlzLmlkID0gdGV4dHVyZUNvdW50KytcblxuICAgIHRoaXMucmVmQ291bnQgPSAxXG5cbiAgICB0aGlzLnRhcmdldCA9IHRhcmdldFxuICAgIHRoaXMudGV4dHVyZSA9IGdsLmNyZWF0ZVRleHR1cmUoKVxuXG4gICAgdGhpcy51bml0ID0gLTFcbiAgICB0aGlzLmJpbmRDb3VudCA9IDBcblxuICAgIHRoaXMudGV4SW5mbyA9IG5ldyBUZXhJbmZvKClcblxuICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgdGhpcy5zdGF0cyA9IHtzaXplOiAwfVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHRlbXBCaW5kICh0ZXh0dXJlKSB7XG4gICAgZ2wuYWN0aXZlVGV4dHVyZShHTF9URVhUVVJFMClcbiAgICBnbC5iaW5kVGV4dHVyZSh0ZXh0dXJlLnRhcmdldCwgdGV4dHVyZS50ZXh0dXJlKVxuICB9XG5cbiAgZnVuY3Rpb24gdGVtcFJlc3RvcmUgKCkge1xuICAgIHZhciBwcmV2ID0gdGV4dHVyZVVuaXRzWzBdXG4gICAgaWYgKHByZXYpIHtcbiAgICAgIGdsLmJpbmRUZXh0dXJlKHByZXYudGFyZ2V0LCBwcmV2LnRleHR1cmUpXG4gICAgfSBlbHNlIHtcbiAgICAgIGdsLmJpbmRUZXh0dXJlKEdMX1RFWFRVUkVfMkQsIG51bGwpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSAodGV4dHVyZSkge1xuICAgIHZhciBoYW5kbGUgPSB0ZXh0dXJlLnRleHR1cmVcbiAgICBjaGVjayhoYW5kbGUsICdtdXN0IG5vdCBkb3VibGUgZGVzdHJveSB0ZXh0dXJlJylcbiAgICB2YXIgdW5pdCA9IHRleHR1cmUudW5pdFxuICAgIHZhciB0YXJnZXQgPSB0ZXh0dXJlLnRhcmdldFxuICAgIGlmICh1bml0ID49IDApIHtcbiAgICAgIGdsLmFjdGl2ZVRleHR1cmUoR0xfVEVYVFVSRTAgKyB1bml0KVxuICAgICAgZ2wuYmluZFRleHR1cmUodGFyZ2V0LCBudWxsKVxuICAgICAgdGV4dHVyZVVuaXRzW3VuaXRdID0gbnVsbFxuICAgIH1cbiAgICBnbC5kZWxldGVUZXh0dXJlKGhhbmRsZSlcbiAgICB0ZXh0dXJlLnRleHR1cmUgPSBudWxsXG4gICAgdGV4dHVyZS5wYXJhbXMgPSBudWxsXG4gICAgdGV4dHVyZS5waXhlbHMgPSBudWxsXG4gICAgdGV4dHVyZS5yZWZDb3VudCA9IDBcbiAgICBkZWxldGUgdGV4dHVyZVNldFt0ZXh0dXJlLmlkXVxuICAgIHN0YXRzLnRleHR1cmVDb3VudC0tXG4gIH1cblxuICBleHRlbmQoUkVHTFRleHR1cmUucHJvdG90eXBlLCB7XG4gICAgYmluZDogZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIHRleHR1cmUgPSB0aGlzXG4gICAgICB0ZXh0dXJlLmJpbmRDb3VudCArPSAxXG4gICAgICB2YXIgdW5pdCA9IHRleHR1cmUudW5pdFxuICAgICAgaWYgKHVuaXQgPCAwKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbnVtVGV4VW5pdHM7ICsraSkge1xuICAgICAgICAgIHZhciBvdGhlciA9IHRleHR1cmVVbml0c1tpXVxuICAgICAgICAgIGlmIChvdGhlcikge1xuICAgICAgICAgICAgaWYgKG90aGVyLmJpbmRDb3VudCA+IDApIHtcbiAgICAgICAgICAgICAgY29udGludWVcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG90aGVyLnVuaXQgPSAtMVxuICAgICAgICAgIH1cbiAgICAgICAgICB0ZXh0dXJlVW5pdHNbaV0gPSB0ZXh0dXJlXG4gICAgICAgICAgdW5pdCA9IGlcbiAgICAgICAgICBicmVha1xuICAgICAgICB9XG4gICAgICAgIGlmICh1bml0ID49IG51bVRleFVuaXRzKSB7XG4gICAgICAgICAgY2hlY2sucmFpc2UoJ2luc3VmZmljaWVudCBudW1iZXIgb2YgdGV4dHVyZSB1bml0cycpXG4gICAgICAgIH1cbiAgICAgICAgaWYgKGNvbmZpZy5wcm9maWxlICYmIHN0YXRzLm1heFRleHR1cmVVbml0cyA8ICh1bml0ICsgMSkpIHtcbiAgICAgICAgICBzdGF0cy5tYXhUZXh0dXJlVW5pdHMgPSB1bml0ICsgMSAvLyArMSwgc2luY2UgdGhlIHVuaXRzIGFyZSB6ZXJvLWJhc2VkXG4gICAgICAgIH1cbiAgICAgICAgdGV4dHVyZS51bml0ID0gdW5pdFxuICAgICAgICBnbC5hY3RpdmVUZXh0dXJlKEdMX1RFWFRVUkUwICsgdW5pdClcbiAgICAgICAgZ2wuYmluZFRleHR1cmUodGV4dHVyZS50YXJnZXQsIHRleHR1cmUudGV4dHVyZSlcbiAgICAgIH1cbiAgICAgIHJldHVybiB1bml0XG4gICAgfSxcblxuICAgIHVuYmluZDogZnVuY3Rpb24gKCkge1xuICAgICAgdGhpcy5iaW5kQ291bnQgLT0gMVxuICAgIH0sXG5cbiAgICBkZWNSZWY6IGZ1bmN0aW9uICgpIHtcbiAgICAgIGlmICgtLXRoaXMucmVmQ291bnQgPD0gMCkge1xuICAgICAgICBkZXN0cm95KHRoaXMpXG4gICAgICB9XG4gICAgfVxuICB9KVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZVRleHR1cmUyRCAoYSwgYikge1xuICAgIHZhciB0ZXh0dXJlID0gbmV3IFJFR0xUZXh0dXJlKEdMX1RFWFRVUkVfMkQpXG4gICAgdGV4dHVyZVNldFt0ZXh0dXJlLmlkXSA9IHRleHR1cmVcbiAgICBzdGF0cy50ZXh0dXJlQ291bnQrK1xuXG4gICAgZnVuY3Rpb24gcmVnbFRleHR1cmUyRCAoYSwgYikge1xuICAgICAgdmFyIHRleEluZm8gPSB0ZXh0dXJlLnRleEluZm9cbiAgICAgIFRleEluZm8uY2FsbCh0ZXhJbmZvKVxuICAgICAgdmFyIG1pcERhdGEgPSBhbGxvY01pcE1hcCgpXG5cbiAgICAgIGlmICh0eXBlb2YgYSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBiID09PSAnbnVtYmVyJykge1xuICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbVNoYXBlKG1pcERhdGEsIGEgfCAwLCBiIHwgMClcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwYXJzZU1pcE1hcEZyb21TaGFwZShtaXBEYXRhLCBhIHwgMCwgYSB8IDApXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoYSkge1xuICAgICAgICBjaGVjay50eXBlKGEsICdvYmplY3QnLCAnaW52YWxpZCBhcmd1bWVudHMgdG8gcmVnbC50ZXh0dXJlJylcbiAgICAgICAgcGFyc2VUZXhJbmZvKHRleEluZm8sIGEpXG4gICAgICAgIHBhcnNlTWlwTWFwRnJvbU9iamVjdChtaXBEYXRhLCBhKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gZW1wdHkgdGV4dHVyZXMgZ2V0IGFzc2lnbmVkIGEgZGVmYXVsdCBzaGFwZSBvZiAxeDFcbiAgICAgICAgcGFyc2VNaXBNYXBGcm9tU2hhcGUobWlwRGF0YSwgMSwgMSlcbiAgICAgIH1cblxuICAgICAgaWYgKHRleEluZm8uZ2VuTWlwbWFwcykge1xuICAgICAgICBtaXBEYXRhLm1pcG1hc2sgPSAobWlwRGF0YS53aWR0aCA8PCAxKSAtIDFcbiAgICAgIH1cbiAgICAgIHRleHR1cmUubWlwbWFzayA9IG1pcERhdGEubWlwbWFza1xuXG4gICAgICBjb3B5RmxhZ3ModGV4dHVyZSwgbWlwRGF0YSlcblxuICAgICAgY2hlY2sudGV4dHVyZTJEKHRleEluZm8sIG1pcERhdGEsIGxpbWl0cylcbiAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQgPSBtaXBEYXRhLmludGVybmFsZm9ybWF0XG5cbiAgICAgIHJlZ2xUZXh0dXJlMkQud2lkdGggPSBtaXBEYXRhLndpZHRoXG4gICAgICByZWdsVGV4dHVyZTJELmhlaWdodCA9IG1pcERhdGEuaGVpZ2h0XG5cbiAgICAgIHRlbXBCaW5kKHRleHR1cmUpXG4gICAgICBzZXRNaXBNYXAobWlwRGF0YSwgR0xfVEVYVFVSRV8yRClcbiAgICAgIHNldFRleEluZm8odGV4SW5mbywgR0xfVEVYVFVSRV8yRClcbiAgICAgIHRlbXBSZXN0b3JlKClcblxuICAgICAgZnJlZU1pcE1hcChtaXBEYXRhKVxuXG4gICAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgICAgdGV4dHVyZS5zdGF0cy5zaXplID0gZ2V0VGV4dHVyZVNpemUoXG4gICAgICAgICAgdGV4dHVyZS5pbnRlcm5hbGZvcm1hdCxcbiAgICAgICAgICB0ZXh0dXJlLnR5cGUsXG4gICAgICAgICAgbWlwRGF0YS53aWR0aCxcbiAgICAgICAgICBtaXBEYXRhLmhlaWdodCxcbiAgICAgICAgICB0ZXhJbmZvLmdlbk1pcG1hcHMsXG4gICAgICAgICAgZmFsc2UpXG4gICAgICB9XG4gICAgICByZWdsVGV4dHVyZTJELmZvcm1hdCA9IHRleHR1cmVGb3JtYXRzSW52ZXJ0W3RleHR1cmUuaW50ZXJuYWxmb3JtYXRdXG4gICAgICByZWdsVGV4dHVyZTJELnR5cGUgPSB0ZXh0dXJlVHlwZXNJbnZlcnRbdGV4dHVyZS50eXBlXVxuXG4gICAgICByZWdsVGV4dHVyZTJELm1hZyA9IG1hZ0ZpbHRlcnNJbnZlcnRbdGV4SW5mby5tYWdGaWx0ZXJdXG4gICAgICByZWdsVGV4dHVyZTJELm1pbiA9IG1pbkZpbHRlcnNJbnZlcnRbdGV4SW5mby5taW5GaWx0ZXJdXG5cbiAgICAgIHJlZ2xUZXh0dXJlMkQud3JhcFMgPSB3cmFwTW9kZXNJbnZlcnRbdGV4SW5mby53cmFwU11cbiAgICAgIHJlZ2xUZXh0dXJlMkQud3JhcFQgPSB3cmFwTW9kZXNJbnZlcnRbdGV4SW5mby53cmFwVF1cblxuICAgICAgcmV0dXJuIHJlZ2xUZXh0dXJlMkRcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzdWJpbWFnZSAoaW1hZ2UsIHhfLCB5XywgbGV2ZWxfKSB7XG4gICAgICBjaGVjayghIWltYWdlLCAnbXVzdCBzcGVjaWZ5IGltYWdlIGRhdGEnKVxuXG4gICAgICB2YXIgeCA9IHhfIHwgMFxuICAgICAgdmFyIHkgPSB5XyB8IDBcbiAgICAgIHZhciBsZXZlbCA9IGxldmVsXyB8IDBcblxuICAgICAgdmFyIGltYWdlRGF0YSA9IGFsbG9jSW1hZ2UoKVxuICAgICAgY29weUZsYWdzKGltYWdlRGF0YSwgdGV4dHVyZSlcbiAgICAgIGltYWdlRGF0YS53aWR0aCA9IDBcbiAgICAgIGltYWdlRGF0YS5oZWlnaHQgPSAwXG4gICAgICBwYXJzZUltYWdlKGltYWdlRGF0YSwgaW1hZ2UpXG4gICAgICBpbWFnZURhdGEud2lkdGggPSBpbWFnZURhdGEud2lkdGggfHwgKCh0ZXh0dXJlLndpZHRoID4+IGxldmVsKSAtIHgpXG4gICAgICBpbWFnZURhdGEuaGVpZ2h0ID0gaW1hZ2VEYXRhLmhlaWdodCB8fCAoKHRleHR1cmUuaGVpZ2h0ID4+IGxldmVsKSAtIHkpXG5cbiAgICAgIGNoZWNrKFxuICAgICAgICB0ZXh0dXJlLnR5cGUgPT09IGltYWdlRGF0YS50eXBlICYmXG4gICAgICAgIHRleHR1cmUuZm9ybWF0ID09PSBpbWFnZURhdGEuZm9ybWF0ICYmXG4gICAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQgPT09IGltYWdlRGF0YS5pbnRlcm5hbGZvcm1hdCxcbiAgICAgICAgJ2luY29tcGF0aWJsZSBmb3JtYXQgZm9yIHRleHR1cmUuc3ViaW1hZ2UnKVxuICAgICAgY2hlY2soXG4gICAgICAgIHggPj0gMCAmJiB5ID49IDAgJiZcbiAgICAgICAgeCArIGltYWdlRGF0YS53aWR0aCA8PSB0ZXh0dXJlLndpZHRoICYmXG4gICAgICAgIHkgKyBpbWFnZURhdGEuaGVpZ2h0IDw9IHRleHR1cmUuaGVpZ2h0LFxuICAgICAgICAndGV4dHVyZS5zdWJpbWFnZSB3cml0ZSBvdXQgb2YgYm91bmRzJylcbiAgICAgIGNoZWNrKFxuICAgICAgICB0ZXh0dXJlLm1pcG1hc2sgJiAoMSA8PCBsZXZlbCksXG4gICAgICAgICdtaXNzaW5nIG1pcG1hcCBkYXRhJylcbiAgICAgIGNoZWNrKFxuICAgICAgICBpbWFnZURhdGEuZGF0YSB8fCBpbWFnZURhdGEuZWxlbWVudCB8fCBpbWFnZURhdGEubmVlZHNDb3B5LFxuICAgICAgICAnbWlzc2luZyBpbWFnZSBkYXRhJylcblxuICAgICAgdGVtcEJpbmQodGV4dHVyZSlcbiAgICAgIHNldFN1YkltYWdlKGltYWdlRGF0YSwgR0xfVEVYVFVSRV8yRCwgeCwgeSwgbGV2ZWwpXG4gICAgICB0ZW1wUmVzdG9yZSgpXG5cbiAgICAgIGZyZWVJbWFnZShpbWFnZURhdGEpXG5cbiAgICAgIHJldHVybiByZWdsVGV4dHVyZTJEXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVzaXplICh3XywgaF8pIHtcbiAgICAgIHZhciB3ID0gd18gfCAwXG4gICAgICB2YXIgaCA9IChoXyB8IDApIHx8IHdcbiAgICAgIGlmICh3ID09PSB0ZXh0dXJlLndpZHRoICYmIGggPT09IHRleHR1cmUuaGVpZ2h0KSB7XG4gICAgICAgIHJldHVybiByZWdsVGV4dHVyZTJEXG4gICAgICB9XG5cbiAgICAgIHJlZ2xUZXh0dXJlMkQud2lkdGggPSB0ZXh0dXJlLndpZHRoID0gd1xuICAgICAgcmVnbFRleHR1cmUyRC5oZWlnaHQgPSB0ZXh0dXJlLmhlaWdodCA9IGhcblxuICAgICAgdGVtcEJpbmQodGV4dHVyZSlcbiAgICAgIGZvciAodmFyIGkgPSAwOyB0ZXh0dXJlLm1pcG1hc2sgPj4gaTsgKytpKSB7XG4gICAgICAgIGdsLnRleEltYWdlMkQoXG4gICAgICAgICAgR0xfVEVYVFVSRV8yRCxcbiAgICAgICAgICBpLFxuICAgICAgICAgIHRleHR1cmUuZm9ybWF0LFxuICAgICAgICAgIHcgPj4gaSxcbiAgICAgICAgICBoID4+IGksXG4gICAgICAgICAgMCxcbiAgICAgICAgICB0ZXh0dXJlLmZvcm1hdCxcbiAgICAgICAgICB0ZXh0dXJlLnR5cGUsXG4gICAgICAgICAgbnVsbClcbiAgICAgIH1cbiAgICAgIHRlbXBSZXN0b3JlKClcblxuICAgICAgLy8gYWxzbywgcmVjb21wdXRlIHRoZSB0ZXh0dXJlIHNpemUuXG4gICAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgICAgdGV4dHVyZS5zdGF0cy5zaXplID0gZ2V0VGV4dHVyZVNpemUoXG4gICAgICAgICAgdGV4dHVyZS5pbnRlcm5hbGZvcm1hdCxcbiAgICAgICAgICB0ZXh0dXJlLnR5cGUsXG4gICAgICAgICAgdyxcbiAgICAgICAgICBoLFxuICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgIGZhbHNlKVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmVnbFRleHR1cmUyRFxuICAgIH1cblxuICAgIHJlZ2xUZXh0dXJlMkQoYSwgYilcblxuICAgIHJlZ2xUZXh0dXJlMkQuc3ViaW1hZ2UgPSBzdWJpbWFnZVxuICAgIHJlZ2xUZXh0dXJlMkQucmVzaXplID0gcmVzaXplXG4gICAgcmVnbFRleHR1cmUyRC5fcmVnbFR5cGUgPSAndGV4dHVyZTJkJ1xuICAgIHJlZ2xUZXh0dXJlMkQuX3RleHR1cmUgPSB0ZXh0dXJlXG4gICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICByZWdsVGV4dHVyZTJELnN0YXRzID0gdGV4dHVyZS5zdGF0c1xuICAgIH1cbiAgICByZWdsVGV4dHVyZTJELmRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB0ZXh0dXJlLmRlY1JlZigpXG4gICAgfVxuXG4gICAgcmV0dXJuIHJlZ2xUZXh0dXJlMkRcbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZVRleHR1cmVDdWJlIChhMCwgYTEsIGEyLCBhMywgYTQsIGE1KSB7XG4gICAgdmFyIHRleHR1cmUgPSBuZXcgUkVHTFRleHR1cmUoR0xfVEVYVFVSRV9DVUJFX01BUClcbiAgICB0ZXh0dXJlU2V0W3RleHR1cmUuaWRdID0gdGV4dHVyZVxuICAgIHN0YXRzLmN1YmVDb3VudCsrXG5cbiAgICB2YXIgZmFjZXMgPSBuZXcgQXJyYXkoNilcblxuICAgIGZ1bmN0aW9uIHJlZ2xUZXh0dXJlQ3ViZSAoYTAsIGExLCBhMiwgYTMsIGE0LCBhNSkge1xuICAgICAgdmFyIGlcbiAgICAgIHZhciB0ZXhJbmZvID0gdGV4dHVyZS50ZXhJbmZvXG4gICAgICBUZXhJbmZvLmNhbGwodGV4SW5mbylcbiAgICAgIGZvciAoaSA9IDA7IGkgPCA2OyArK2kpIHtcbiAgICAgICAgZmFjZXNbaV0gPSBhbGxvY01pcE1hcCgpXG4gICAgICB9XG5cbiAgICAgIGlmICh0eXBlb2YgYTAgPT09ICdudW1iZXInIHx8ICFhMCkge1xuICAgICAgICB2YXIgcyA9IChhMCB8IDApIHx8IDFcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbVNoYXBlKGZhY2VzW2ldLCBzLCBzKVxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBhMCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgaWYgKGExKSB7XG4gICAgICAgICAgcGFyc2VNaXBNYXBGcm9tT2JqZWN0KGZhY2VzWzBdLCBhMClcbiAgICAgICAgICBwYXJzZU1pcE1hcEZyb21PYmplY3QoZmFjZXNbMV0sIGExKVxuICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbU9iamVjdChmYWNlc1syXSwgYTIpXG4gICAgICAgICAgcGFyc2VNaXBNYXBGcm9tT2JqZWN0KGZhY2VzWzNdLCBhMylcbiAgICAgICAgICBwYXJzZU1pcE1hcEZyb21PYmplY3QoZmFjZXNbNF0sIGE0KVxuICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbU9iamVjdChmYWNlc1s1XSwgYTUpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcGFyc2VUZXhJbmZvKHRleEluZm8sIGEwKVxuICAgICAgICAgIHBhcnNlRmxhZ3ModGV4dHVyZSwgYTApXG4gICAgICAgICAgaWYgKCdmYWNlcycgaW4gYTApIHtcbiAgICAgICAgICAgIHZhciBmYWNlX2lucHV0ID0gYTAuZmFjZXNcbiAgICAgICAgICAgIGNoZWNrKEFycmF5LmlzQXJyYXkoZmFjZV9pbnB1dCkgJiYgZmFjZV9pbnB1dC5sZW5ndGggPT09IDYsXG4gICAgICAgICAgICAgICdjdWJlIGZhY2VzIG11c3QgYmUgYSBsZW5ndGggNiBhcnJheScpXG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgICAgICAgIGNoZWNrKHR5cGVvZiBmYWNlX2lucHV0W2ldID09PSAnb2JqZWN0JyAmJiAhIWZhY2VfaW5wdXRbaV0sXG4gICAgICAgICAgICAgICAgJ2ludmFsaWQgaW5wdXQgZm9yIGN1YmUgbWFwIGZhY2UnKVxuICAgICAgICAgICAgICBjb3B5RmxhZ3MoZmFjZXNbaV0sIHRleHR1cmUpXG4gICAgICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbU9iamVjdChmYWNlc1tpXSwgZmFjZV9pbnB1dFtpXSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICAgICAgICBwYXJzZU1pcE1hcEZyb21PYmplY3QoZmFjZXNbaV0sIGEwKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY2hlY2sucmFpc2UoJ2ludmFsaWQgYXJndW1lbnRzIHRvIGN1YmUgbWFwJylcbiAgICAgIH1cblxuICAgICAgY29weUZsYWdzKHRleHR1cmUsIGZhY2VzWzBdKVxuICAgICAgaWYgKHRleEluZm8uZ2VuTWlwbWFwcykge1xuICAgICAgICB0ZXh0dXJlLm1pcG1hc2sgPSAoZmFjZXNbMF0ud2lkdGggPDwgMSkgLSAxXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0ZXh0dXJlLm1pcG1hc2sgPSBmYWNlc1swXS5taXBtYXNrXG4gICAgICB9XG5cbiAgICAgIGNoZWNrLnRleHR1cmVDdWJlKHRleHR1cmUsIHRleEluZm8sIGZhY2VzLCBsaW1pdHMpXG4gICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0ID0gZmFjZXNbMF0uaW50ZXJuYWxmb3JtYXRcblxuICAgICAgcmVnbFRleHR1cmVDdWJlLndpZHRoID0gZmFjZXNbMF0ud2lkdGhcbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS5oZWlnaHQgPSBmYWNlc1swXS5oZWlnaHRcblxuICAgICAgdGVtcEJpbmQodGV4dHVyZSlcbiAgICAgIGZvciAoaSA9IDA7IGkgPCA2OyArK2kpIHtcbiAgICAgICAgc2V0TWlwTWFwKGZhY2VzW2ldLCBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1ggKyBpKVxuICAgICAgfVxuICAgICAgc2V0VGV4SW5mbyh0ZXhJbmZvLCBHTF9URVhUVVJFX0NVQkVfTUFQKVxuICAgICAgdGVtcFJlc3RvcmUoKVxuXG4gICAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgICAgdGV4dHVyZS5zdGF0cy5zaXplID0gZ2V0VGV4dHVyZVNpemUoXG4gICAgICAgICAgdGV4dHVyZS5pbnRlcm5hbGZvcm1hdCxcbiAgICAgICAgICB0ZXh0dXJlLnR5cGUsXG4gICAgICAgICAgcmVnbFRleHR1cmVDdWJlLndpZHRoLFxuICAgICAgICAgIHJlZ2xUZXh0dXJlQ3ViZS5oZWlnaHQsXG4gICAgICAgICAgdGV4SW5mby5nZW5NaXBtYXBzLFxuICAgICAgICAgIHRydWUpXG4gICAgICB9XG5cbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS5mb3JtYXQgPSB0ZXh0dXJlRm9ybWF0c0ludmVydFt0ZXh0dXJlLmludGVybmFsZm9ybWF0XVxuICAgICAgcmVnbFRleHR1cmVDdWJlLnR5cGUgPSB0ZXh0dXJlVHlwZXNJbnZlcnRbdGV4dHVyZS50eXBlXVxuXG4gICAgICByZWdsVGV4dHVyZUN1YmUubWFnID0gbWFnRmlsdGVyc0ludmVydFt0ZXhJbmZvLm1hZ0ZpbHRlcl1cbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS5taW4gPSBtaW5GaWx0ZXJzSW52ZXJ0W3RleEluZm8ubWluRmlsdGVyXVxuXG4gICAgICByZWdsVGV4dHVyZUN1YmUud3JhcFMgPSB3cmFwTW9kZXNJbnZlcnRbdGV4SW5mby53cmFwU11cbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS53cmFwVCA9IHdyYXBNb2Rlc0ludmVydFt0ZXhJbmZvLndyYXBUXVxuXG4gICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgIGZyZWVNaXBNYXAoZmFjZXNbaV0pXG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZWdsVGV4dHVyZUN1YmVcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzdWJpbWFnZSAoZmFjZSwgaW1hZ2UsIHhfLCB5XywgbGV2ZWxfKSB7XG4gICAgICBjaGVjayghIWltYWdlLCAnbXVzdCBzcGVjaWZ5IGltYWdlIGRhdGEnKVxuICAgICAgY2hlY2sodHlwZW9mIGZhY2UgPT09ICdudW1iZXInICYmIGZhY2UgPT09IChmYWNlIHwgMCkgJiZcbiAgICAgICAgZmFjZSA+PSAwICYmIGZhY2UgPCA2LCAnaW52YWxpZCBmYWNlJylcblxuICAgICAgdmFyIHggPSB4XyB8IDBcbiAgICAgIHZhciB5ID0geV8gfCAwXG4gICAgICB2YXIgbGV2ZWwgPSBsZXZlbF8gfCAwXG5cbiAgICAgIHZhciBpbWFnZURhdGEgPSBhbGxvY0ltYWdlKClcbiAgICAgIGNvcHlGbGFncyhpbWFnZURhdGEsIHRleHR1cmUpXG4gICAgICBpbWFnZURhdGEud2lkdGggPSAwXG4gICAgICBpbWFnZURhdGEuaGVpZ2h0ID0gMFxuICAgICAgcGFyc2VJbWFnZShpbWFnZURhdGEsIGltYWdlKVxuICAgICAgaW1hZ2VEYXRhLndpZHRoID0gaW1hZ2VEYXRhLndpZHRoIHx8ICgodGV4dHVyZS53aWR0aCA+PiBsZXZlbCkgLSB4KVxuICAgICAgaW1hZ2VEYXRhLmhlaWdodCA9IGltYWdlRGF0YS5oZWlnaHQgfHwgKCh0ZXh0dXJlLmhlaWdodCA+PiBsZXZlbCkgLSB5KVxuXG4gICAgICBjaGVjayhcbiAgICAgICAgdGV4dHVyZS50eXBlID09PSBpbWFnZURhdGEudHlwZSAmJlxuICAgICAgICB0ZXh0dXJlLmZvcm1hdCA9PT0gaW1hZ2VEYXRhLmZvcm1hdCAmJlxuICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0ID09PSBpbWFnZURhdGEuaW50ZXJuYWxmb3JtYXQsXG4gICAgICAgICdpbmNvbXBhdGlibGUgZm9ybWF0IGZvciB0ZXh0dXJlLnN1YmltYWdlJylcbiAgICAgIGNoZWNrKFxuICAgICAgICB4ID49IDAgJiYgeSA+PSAwICYmXG4gICAgICAgIHggKyBpbWFnZURhdGEud2lkdGggPD0gdGV4dHVyZS53aWR0aCAmJlxuICAgICAgICB5ICsgaW1hZ2VEYXRhLmhlaWdodCA8PSB0ZXh0dXJlLmhlaWdodCxcbiAgICAgICAgJ3RleHR1cmUuc3ViaW1hZ2Ugd3JpdGUgb3V0IG9mIGJvdW5kcycpXG4gICAgICBjaGVjayhcbiAgICAgICAgdGV4dHVyZS5taXBtYXNrICYgKDEgPDwgbGV2ZWwpLFxuICAgICAgICAnbWlzc2luZyBtaXBtYXAgZGF0YScpXG4gICAgICBjaGVjayhcbiAgICAgICAgaW1hZ2VEYXRhLmRhdGEgfHwgaW1hZ2VEYXRhLmVsZW1lbnQgfHwgaW1hZ2VEYXRhLm5lZWRzQ29weSxcbiAgICAgICAgJ21pc3NpbmcgaW1hZ2UgZGF0YScpXG5cbiAgICAgIHRlbXBCaW5kKHRleHR1cmUpXG4gICAgICBzZXRTdWJJbWFnZShpbWFnZURhdGEsIEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCArIGZhY2UsIHgsIHksIGxldmVsKVxuICAgICAgdGVtcFJlc3RvcmUoKVxuXG4gICAgICBmcmVlSW1hZ2UoaW1hZ2VEYXRhKVxuXG4gICAgICByZXR1cm4gcmVnbFRleHR1cmVDdWJlXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVzaXplIChyYWRpdXNfKSB7XG4gICAgICB2YXIgcmFkaXVzID0gcmFkaXVzXyB8IDBcbiAgICAgIGlmIChyYWRpdXMgPT09IHRleHR1cmUud2lkdGgpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG5cbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS53aWR0aCA9IHRleHR1cmUud2lkdGggPSByYWRpdXNcbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS5oZWlnaHQgPSB0ZXh0dXJlLmhlaWdodCA9IHJhZGl1c1xuXG4gICAgICB0ZW1wQmluZCh0ZXh0dXJlKVxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCA2OyArK2kpIHtcbiAgICAgICAgZm9yICh2YXIgaiA9IDA7IHRleHR1cmUubWlwbWFzayA+PiBqOyArK2opIHtcbiAgICAgICAgICBnbC50ZXhJbWFnZTJEKFxuICAgICAgICAgICAgR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YICsgaSxcbiAgICAgICAgICAgIGosXG4gICAgICAgICAgICB0ZXh0dXJlLmZvcm1hdCxcbiAgICAgICAgICAgIHJhZGl1cyA+PiBqLFxuICAgICAgICAgICAgcmFkaXVzID4+IGosXG4gICAgICAgICAgICAwLFxuICAgICAgICAgICAgdGV4dHVyZS5mb3JtYXQsXG4gICAgICAgICAgICB0ZXh0dXJlLnR5cGUsXG4gICAgICAgICAgICBudWxsKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICB0ZW1wUmVzdG9yZSgpXG5cbiAgICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgICB0ZXh0dXJlLnN0YXRzLnNpemUgPSBnZXRUZXh0dXJlU2l6ZShcbiAgICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0LFxuICAgICAgICAgIHRleHR1cmUudHlwZSxcbiAgICAgICAgICByZWdsVGV4dHVyZUN1YmUud2lkdGgsXG4gICAgICAgICAgcmVnbFRleHR1cmVDdWJlLmhlaWdodCxcbiAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICB0cnVlKVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmVnbFRleHR1cmVDdWJlXG4gICAgfVxuXG4gICAgcmVnbFRleHR1cmVDdWJlKGEwLCBhMSwgYTIsIGEzLCBhNCwgYTUpXG5cbiAgICByZWdsVGV4dHVyZUN1YmUuc3ViaW1hZ2UgPSBzdWJpbWFnZVxuICAgIHJlZ2xUZXh0dXJlQ3ViZS5yZXNpemUgPSByZXNpemVcbiAgICByZWdsVGV4dHVyZUN1YmUuX3JlZ2xUeXBlID0gJ3RleHR1cmVDdWJlJ1xuICAgIHJlZ2xUZXh0dXJlQ3ViZS5fdGV4dHVyZSA9IHRleHR1cmVcbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS5zdGF0cyA9IHRleHR1cmUuc3RhdHNcbiAgICB9XG4gICAgcmVnbFRleHR1cmVDdWJlLmRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB0ZXh0dXJlLmRlY1JlZigpXG4gICAgfVxuXG4gICAgcmV0dXJuIHJlZ2xUZXh0dXJlQ3ViZVxuICB9XG5cbiAgLy8gQ2FsbGVkIHdoZW4gcmVnbCBpcyBkZXN0cm95ZWRcbiAgZnVuY3Rpb24gZGVzdHJveVRleHR1cmVzICgpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG51bVRleFVuaXRzOyArK2kpIHtcbiAgICAgIGdsLmFjdGl2ZVRleHR1cmUoR0xfVEVYVFVSRTAgKyBpKVxuICAgICAgZ2wuYmluZFRleHR1cmUoR0xfVEVYVFVSRV8yRCwgbnVsbClcbiAgICAgIHRleHR1cmVVbml0c1tpXSA9IG51bGxcbiAgICB9XG4gICAgdmFsdWVzKHRleHR1cmVTZXQpLmZvckVhY2goZGVzdHJveSlcblxuICAgIHN0YXRzLmN1YmVDb3VudCA9IDBcbiAgICBzdGF0cy50ZXh0dXJlQ291bnQgPSAwXG4gIH1cblxuICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICBzdGF0cy5nZXRUb3RhbFRleHR1cmVTaXplID0gZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIHRvdGFsID0gMFxuICAgICAgT2JqZWN0LmtleXModGV4dHVyZVNldCkuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgIHRvdGFsICs9IHRleHR1cmVTZXRba2V5XS5zdGF0cy5zaXplXG4gICAgICB9KVxuICAgICAgcmV0dXJuIHRvdGFsXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcmVzdG9yZVRleHR1cmVzICgpIHtcbiAgICB2YWx1ZXModGV4dHVyZVNldCkuZm9yRWFjaChmdW5jdGlvbiAodGV4dHVyZSkge1xuICAgICAgdGV4dHVyZS50ZXh0dXJlID0gZ2wuY3JlYXRlVGV4dHVyZSgpXG4gICAgICBnbC5iaW5kVGV4dHVyZSh0ZXh0dXJlLnRhcmdldCwgdGV4dHVyZS50ZXh0dXJlKVxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCAzMjsgKytpKSB7XG4gICAgICAgIGlmICgodGV4dHVyZS5taXBtYXNrICYgKDEgPDwgaSkpID09PSAwKSB7XG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfVxuICAgICAgICBpZiAodGV4dHVyZS50YXJnZXQgPT09IEdMX1RFWFRVUkVfMkQpIHtcbiAgICAgICAgICBnbC50ZXhJbWFnZTJEKEdMX1RFWFRVUkVfMkQsXG4gICAgICAgICAgICBpLFxuICAgICAgICAgICAgdGV4dHVyZS5pbnRlcm5hbGZvcm1hdCxcbiAgICAgICAgICAgIHRleHR1cmUud2lkdGggPj4gaSxcbiAgICAgICAgICAgIHRleHR1cmUuaGVpZ2h0ID4+IGksXG4gICAgICAgICAgICAwLFxuICAgICAgICAgICAgdGV4dHVyZS5pbnRlcm5hbGZvcm1hdCxcbiAgICAgICAgICAgIHRleHR1cmUudHlwZSxcbiAgICAgICAgICAgIG51bGwpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCA2OyArK2opIHtcbiAgICAgICAgICAgIGdsLnRleEltYWdlMkQoR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YICsgaixcbiAgICAgICAgICAgICAgaSxcbiAgICAgICAgICAgICAgdGV4dHVyZS5pbnRlcm5hbGZvcm1hdCxcbiAgICAgICAgICAgICAgdGV4dHVyZS53aWR0aCA+PiBpLFxuICAgICAgICAgICAgICB0ZXh0dXJlLmhlaWdodCA+PiBpLFxuICAgICAgICAgICAgICAwLFxuICAgICAgICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0LFxuICAgICAgICAgICAgICB0ZXh0dXJlLnR5cGUsXG4gICAgICAgICAgICAgIG51bGwpXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBzZXRUZXhJbmZvKHRleHR1cmUudGV4SW5mbywgdGV4dHVyZS50YXJnZXQpXG4gICAgfSlcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY3JlYXRlMkQ6IGNyZWF0ZVRleHR1cmUyRCxcbiAgICBjcmVhdGVDdWJlOiBjcmVhdGVUZXh0dXJlQ3ViZSxcbiAgICBjbGVhcjogZGVzdHJveVRleHR1cmVzLFxuICAgIGdldFRleHR1cmU6IGZ1bmN0aW9uICh3cmFwcGVyKSB7XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH0sXG4gICAgcmVzdG9yZTogcmVzdG9yZVRleHR1cmVzXG4gIH1cbn1cbiIsInZhciBHTF9RVUVSWV9SRVNVTFRfRVhUID0gMHg4ODY2XG52YXIgR0xfUVVFUllfUkVTVUxUX0FWQUlMQUJMRV9FWFQgPSAweDg4NjdcbnZhciBHTF9USU1FX0VMQVBTRURfRVhUID0gMHg4OEJGXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGdsLCBleHRlbnNpb25zKSB7XG4gIHZhciBleHRUaW1lciA9IGV4dGVuc2lvbnMuZXh0X2Rpc2pvaW50X3RpbWVyX3F1ZXJ5XG5cbiAgaWYgKCFleHRUaW1lcikge1xuICAgIHJldHVybiBudWxsXG4gIH1cblxuICAvLyBRVUVSWSBQT09MIEJFR0lOXG4gIHZhciBxdWVyeVBvb2wgPSBbXVxuICBmdW5jdGlvbiBhbGxvY1F1ZXJ5ICgpIHtcbiAgICByZXR1cm4gcXVlcnlQb29sLnBvcCgpIHx8IGV4dFRpbWVyLmNyZWF0ZVF1ZXJ5RVhUKClcbiAgfVxuICBmdW5jdGlvbiBmcmVlUXVlcnkgKHF1ZXJ5KSB7XG4gICAgcXVlcnlQb29sLnB1c2gocXVlcnkpXG4gIH1cbiAgLy8gUVVFUlkgUE9PTCBFTkRcblxuICB2YXIgcGVuZGluZ1F1ZXJpZXMgPSBbXVxuICBmdW5jdGlvbiBiZWdpblF1ZXJ5IChzdGF0cykge1xuICAgIHZhciBxdWVyeSA9IGFsbG9jUXVlcnkoKVxuICAgIGV4dFRpbWVyLmJlZ2luUXVlcnlFWFQoR0xfVElNRV9FTEFQU0VEX0VYVCwgcXVlcnkpXG4gICAgcGVuZGluZ1F1ZXJpZXMucHVzaChxdWVyeSlcbiAgICBwdXNoU2NvcGVTdGF0cyhwZW5kaW5nUXVlcmllcy5sZW5ndGggLSAxLCBwZW5kaW5nUXVlcmllcy5sZW5ndGgsIHN0YXRzKVxuICB9XG5cbiAgZnVuY3Rpb24gZW5kUXVlcnkgKCkge1xuICAgIGV4dFRpbWVyLmVuZFF1ZXJ5RVhUKEdMX1RJTUVfRUxBUFNFRF9FWFQpXG4gIH1cblxuICAvL1xuICAvLyBQZW5kaW5nIHN0YXRzIHBvb2wuXG4gIC8vXG4gIGZ1bmN0aW9uIFBlbmRpbmdTdGF0cyAoKSB7XG4gICAgdGhpcy5zdGFydFF1ZXJ5SW5kZXggPSAtMVxuICAgIHRoaXMuZW5kUXVlcnlJbmRleCA9IC0xXG4gICAgdGhpcy5zdW0gPSAwXG4gICAgdGhpcy5zdGF0cyA9IG51bGxcbiAgfVxuICB2YXIgcGVuZGluZ1N0YXRzUG9vbCA9IFtdXG4gIGZ1bmN0aW9uIGFsbG9jUGVuZGluZ1N0YXRzICgpIHtcbiAgICByZXR1cm4gcGVuZGluZ1N0YXRzUG9vbC5wb3AoKSB8fCBuZXcgUGVuZGluZ1N0YXRzKClcbiAgfVxuICBmdW5jdGlvbiBmcmVlUGVuZGluZ1N0YXRzIChwZW5kaW5nU3RhdHMpIHtcbiAgICBwZW5kaW5nU3RhdHNQb29sLnB1c2gocGVuZGluZ1N0YXRzKVxuICB9XG4gIC8vIFBlbmRpbmcgc3RhdHMgcG9vbCBlbmRcblxuICB2YXIgcGVuZGluZ1N0YXRzID0gW11cbiAgZnVuY3Rpb24gcHVzaFNjb3BlU3RhdHMgKHN0YXJ0LCBlbmQsIHN0YXRzKSB7XG4gICAgdmFyIHBzID0gYWxsb2NQZW5kaW5nU3RhdHMoKVxuICAgIHBzLnN0YXJ0UXVlcnlJbmRleCA9IHN0YXJ0XG4gICAgcHMuZW5kUXVlcnlJbmRleCA9IGVuZFxuICAgIHBzLnN1bSA9IDBcbiAgICBwcy5zdGF0cyA9IHN0YXRzXG4gICAgcGVuZGluZ1N0YXRzLnB1c2gocHMpXG4gIH1cblxuICAvLyB3ZSBzaG91bGQgY2FsbCB0aGlzIGF0IHRoZSBiZWdpbm5pbmcgb2YgdGhlIGZyYW1lLFxuICAvLyBpbiBvcmRlciB0byB1cGRhdGUgZ3B1VGltZVxuICB2YXIgdGltZVN1bSA9IFtdXG4gIHZhciBxdWVyeVB0ciA9IFtdXG4gIGZ1bmN0aW9uIHVwZGF0ZSAoKSB7XG4gICAgdmFyIHB0ciwgaVxuXG4gICAgdmFyIG4gPSBwZW5kaW5nUXVlcmllcy5sZW5ndGhcbiAgICBpZiAobiA9PT0gMCkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgLy8gUmVzZXJ2ZSBzcGFjZVxuICAgIHF1ZXJ5UHRyLmxlbmd0aCA9IE1hdGgubWF4KHF1ZXJ5UHRyLmxlbmd0aCwgbiArIDEpXG4gICAgdGltZVN1bS5sZW5ndGggPSBNYXRoLm1heCh0aW1lU3VtLmxlbmd0aCwgbiArIDEpXG4gICAgdGltZVN1bVswXSA9IDBcbiAgICBxdWVyeVB0clswXSA9IDBcblxuICAgIC8vIFVwZGF0ZSBhbGwgcGVuZGluZyB0aW1lciBxdWVyaWVzXG4gICAgdmFyIHF1ZXJ5VGltZSA9IDBcbiAgICBwdHIgPSAwXG4gICAgZm9yIChpID0gMDsgaSA8IHBlbmRpbmdRdWVyaWVzLmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgcXVlcnkgPSBwZW5kaW5nUXVlcmllc1tpXVxuICAgICAgaWYgKGV4dFRpbWVyLmdldFF1ZXJ5T2JqZWN0RVhUKHF1ZXJ5LCBHTF9RVUVSWV9SRVNVTFRfQVZBSUxBQkxFX0VYVCkpIHtcbiAgICAgICAgcXVlcnlUaW1lICs9IGV4dFRpbWVyLmdldFF1ZXJ5T2JqZWN0RVhUKHF1ZXJ5LCBHTF9RVUVSWV9SRVNVTFRfRVhUKVxuICAgICAgICBmcmVlUXVlcnkocXVlcnkpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwZW5kaW5nUXVlcmllc1twdHIrK10gPSBxdWVyeVxuICAgICAgfVxuICAgICAgdGltZVN1bVtpICsgMV0gPSBxdWVyeVRpbWVcbiAgICAgIHF1ZXJ5UHRyW2kgKyAxXSA9IHB0clxuICAgIH1cbiAgICBwZW5kaW5nUXVlcmllcy5sZW5ndGggPSBwdHJcblxuICAgIC8vIFVwZGF0ZSBhbGwgcGVuZGluZyBzdGF0IHF1ZXJpZXNcbiAgICBwdHIgPSAwXG4gICAgZm9yIChpID0gMDsgaSA8IHBlbmRpbmdTdGF0cy5sZW5ndGg7ICsraSkge1xuICAgICAgdmFyIHN0YXRzID0gcGVuZGluZ1N0YXRzW2ldXG4gICAgICB2YXIgc3RhcnQgPSBzdGF0cy5zdGFydFF1ZXJ5SW5kZXhcbiAgICAgIHZhciBlbmQgPSBzdGF0cy5lbmRRdWVyeUluZGV4XG4gICAgICBzdGF0cy5zdW0gKz0gdGltZVN1bVtlbmRdIC0gdGltZVN1bVtzdGFydF1cbiAgICAgIHZhciBzdGFydFB0ciA9IHF1ZXJ5UHRyW3N0YXJ0XVxuICAgICAgdmFyIGVuZFB0ciA9IHF1ZXJ5UHRyW2VuZF1cbiAgICAgIGlmIChlbmRQdHIgPT09IHN0YXJ0UHRyKSB7XG4gICAgICAgIHN0YXRzLnN0YXRzLmdwdVRpbWUgKz0gc3RhdHMuc3VtIC8gMWU2XG4gICAgICAgIGZyZWVQZW5kaW5nU3RhdHMoc3RhdHMpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzdGF0cy5zdGFydFF1ZXJ5SW5kZXggPSBzdGFydFB0clxuICAgICAgICBzdGF0cy5lbmRRdWVyeUluZGV4ID0gZW5kUHRyXG4gICAgICAgIHBlbmRpbmdTdGF0c1twdHIrK10gPSBzdGF0c1xuICAgICAgfVxuICAgIH1cbiAgICBwZW5kaW5nU3RhdHMubGVuZ3RoID0gcHRyXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGJlZ2luUXVlcnk6IGJlZ2luUXVlcnksXG4gICAgZW5kUXVlcnk6IGVuZFF1ZXJ5LFxuICAgIHB1c2hTY29wZVN0YXRzOiBwdXNoU2NvcGVTdGF0cyxcbiAgICB1cGRhdGU6IHVwZGF0ZSxcbiAgICBnZXROdW1QZW5kaW5nUXVlcmllczogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIHBlbmRpbmdRdWVyaWVzLmxlbmd0aFxuICAgIH0sXG4gICAgY2xlYXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHF1ZXJ5UG9vbC5wdXNoLmFwcGx5KHF1ZXJ5UG9vbCwgcGVuZGluZ1F1ZXJpZXMpXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHF1ZXJ5UG9vbC5sZW5ndGg7IGkrKykge1xuICAgICAgICBleHRUaW1lci5kZWxldGVRdWVyeUVYVChxdWVyeVBvb2xbaV0pXG4gICAgICB9XG4gICAgICBwZW5kaW5nUXVlcmllcy5sZW5ndGggPSAwXG4gICAgICBxdWVyeVBvb2wubGVuZ3RoID0gMFxuICAgIH0sXG4gICAgcmVzdG9yZTogZnVuY3Rpb24gKCkge1xuICAgICAgcGVuZGluZ1F1ZXJpZXMubGVuZ3RoID0gMFxuICAgICAgcXVlcnlQb29sLmxlbmd0aCA9IDBcbiAgICB9XG4gIH1cbn1cbiIsIi8vIEVycm9yIGNoZWNraW5nIGFuZCBwYXJhbWV0ZXIgdmFsaWRhdGlvbi5cbi8vXG4vLyBTdGF0ZW1lbnRzIGZvciB0aGUgZm9ybSBgY2hlY2suc29tZVByb2NlZHVyZSguLi4pYCBnZXQgcmVtb3ZlZCBieVxuLy8gYSBicm93c2VyaWZ5IHRyYW5zZm9ybSBmb3Igb3B0aW1pemVkL21pbmlmaWVkIGJ1bmRsZXMuXG4vL1xuLyogZ2xvYmFscyBidG9hICovXG52YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi9pcy10eXBlZC1hcnJheScpXG52YXIgZXh0ZW5kID0gcmVxdWlyZSgnLi9leHRlbmQnKVxuXG4vLyBvbmx5IHVzZWQgZm9yIGV4dHJhY3Rpbmcgc2hhZGVyIG5hbWVzLiAgaWYgYnRvYSBub3QgcHJlc2VudCwgdGhlbiBlcnJvcnNcbi8vIHdpbGwgYmUgc2xpZ2h0bHkgY3JhcHBpZXJcbmZ1bmN0aW9uIGRlY29kZUI2NCAoc3RyKSB7XG4gIGlmICh0eXBlb2YgYnRvYSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICByZXR1cm4gYnRvYShzdHIpXG4gIH1cbiAgcmV0dXJuICdiYXNlNjQ6JyArIHN0clxufVxuXG5mdW5jdGlvbiByYWlzZSAobWVzc2FnZSkge1xuICB2YXIgZXJyb3IgPSBuZXcgRXJyb3IoJyhyZWdsKSAnICsgbWVzc2FnZSlcbiAgY29uc29sZS5lcnJvcihlcnJvcilcbiAgdGhyb3cgZXJyb3Jcbn1cblxuZnVuY3Rpb24gY2hlY2sgKHByZWQsIG1lc3NhZ2UpIHtcbiAgaWYgKCFwcmVkKSB7XG4gICAgcmFpc2UobWVzc2FnZSlcbiAgfVxufVxuXG5mdW5jdGlvbiBlbmNvbG9uIChtZXNzYWdlKSB7XG4gIGlmIChtZXNzYWdlKSB7XG4gICAgcmV0dXJuICc6ICcgKyBtZXNzYWdlXG4gIH1cbiAgcmV0dXJuICcnXG59XG5cbmZ1bmN0aW9uIGNoZWNrUGFyYW1ldGVyIChwYXJhbSwgcG9zc2liaWxpdGllcywgbWVzc2FnZSkge1xuICBpZiAoIShwYXJhbSBpbiBwb3NzaWJpbGl0aWVzKSkge1xuICAgIHJhaXNlKCd1bmtub3duIHBhcmFtZXRlciAoJyArIHBhcmFtICsgJyknICsgZW5jb2xvbihtZXNzYWdlKSArXG4gICAgICAgICAgJy4gcG9zc2libGUgdmFsdWVzOiAnICsgT2JqZWN0LmtleXMocG9zc2liaWxpdGllcykuam9pbigpKVxuICB9XG59XG5cbmZ1bmN0aW9uIGNoZWNrSXNUeXBlZEFycmF5IChkYXRhLCBtZXNzYWdlKSB7XG4gIGlmICghaXNUeXBlZEFycmF5KGRhdGEpKSB7XG4gICAgcmFpc2UoXG4gICAgICAnaW52YWxpZCBwYXJhbWV0ZXIgdHlwZScgKyBlbmNvbG9uKG1lc3NhZ2UpICtcbiAgICAgICcuIG11c3QgYmUgYSB0eXBlZCBhcnJheScpXG4gIH1cbn1cblxuZnVuY3Rpb24gY2hlY2tUeXBlT2YgKHZhbHVlLCB0eXBlLCBtZXNzYWdlKSB7XG4gIGlmICh0eXBlb2YgdmFsdWUgIT09IHR5cGUpIHtcbiAgICByYWlzZShcbiAgICAgICdpbnZhbGlkIHBhcmFtZXRlciB0eXBlJyArIGVuY29sb24obWVzc2FnZSkgK1xuICAgICAgJy4gZXhwZWN0ZWQgJyArIHR5cGUgKyAnLCBnb3QgJyArICh0eXBlb2YgdmFsdWUpKVxuICB9XG59XG5cbmZ1bmN0aW9uIGNoZWNrTm9uTmVnYXRpdmVJbnQgKHZhbHVlLCBtZXNzYWdlKSB7XG4gIGlmICghKCh2YWx1ZSA+PSAwKSAmJlxuICAgICAgICAoKHZhbHVlIHwgMCkgPT09IHZhbHVlKSkpIHtcbiAgICByYWlzZSgnaW52YWxpZCBwYXJhbWV0ZXIgdHlwZSwgKCcgKyB2YWx1ZSArICcpJyArIGVuY29sb24obWVzc2FnZSkgK1xuICAgICAgICAgICcuIG11c3QgYmUgYSBub25uZWdhdGl2ZSBpbnRlZ2VyJylcbiAgfVxufVxuXG5mdW5jdGlvbiBjaGVja09uZU9mICh2YWx1ZSwgbGlzdCwgbWVzc2FnZSkge1xuICBpZiAobGlzdC5pbmRleE9mKHZhbHVlKSA8IDApIHtcbiAgICByYWlzZSgnaW52YWxpZCB2YWx1ZScgKyBlbmNvbG9uKG1lc3NhZ2UpICsgJy4gbXVzdCBiZSBvbmUgb2Y6ICcgKyBsaXN0KVxuICB9XG59XG5cbnZhciBjb25zdHJ1Y3RvcktleXMgPSBbXG4gICdnbCcsXG4gICdjYW52YXMnLFxuICAnY29udGFpbmVyJyxcbiAgJ2F0dHJpYnV0ZXMnLFxuICAncGl4ZWxSYXRpbycsXG4gICdleHRlbnNpb25zJyxcbiAgJ29wdGlvbmFsRXh0ZW5zaW9ucycsXG4gICdwcm9maWxlJyxcbiAgJ29uRG9uZSdcbl1cblxuZnVuY3Rpb24gY2hlY2tDb25zdHJ1Y3RvciAob2JqKSB7XG4gIE9iamVjdC5rZXlzKG9iaikuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgaWYgKGNvbnN0cnVjdG9yS2V5cy5pbmRleE9mKGtleSkgPCAwKSB7XG4gICAgICByYWlzZSgnaW52YWxpZCByZWdsIGNvbnN0cnVjdG9yIGFyZ3VtZW50IFwiJyArIGtleSArICdcIi4gbXVzdCBiZSBvbmUgb2YgJyArIGNvbnN0cnVjdG9yS2V5cylcbiAgICB9XG4gIH0pXG59XG5cbmZ1bmN0aW9uIGxlZnRQYWQgKHN0ciwgbikge1xuICBzdHIgPSBzdHIgKyAnJ1xuICB3aGlsZSAoc3RyLmxlbmd0aCA8IG4pIHtcbiAgICBzdHIgPSAnICcgKyBzdHJcbiAgfVxuICByZXR1cm4gc3RyXG59XG5cbmZ1bmN0aW9uIFNoYWRlckZpbGUgKCkge1xuICB0aGlzLm5hbWUgPSAndW5rbm93bidcbiAgdGhpcy5saW5lcyA9IFtdXG4gIHRoaXMuaW5kZXggPSB7fVxuICB0aGlzLmhhc0Vycm9ycyA9IGZhbHNlXG59XG5cbmZ1bmN0aW9uIFNoYWRlckxpbmUgKG51bWJlciwgbGluZSkge1xuICB0aGlzLm51bWJlciA9IG51bWJlclxuICB0aGlzLmxpbmUgPSBsaW5lXG4gIHRoaXMuZXJyb3JzID0gW11cbn1cblxuZnVuY3Rpb24gU2hhZGVyRXJyb3IgKGZpbGVOdW1iZXIsIGxpbmVOdW1iZXIsIG1lc3NhZ2UpIHtcbiAgdGhpcy5maWxlID0gZmlsZU51bWJlclxuICB0aGlzLmxpbmUgPSBsaW5lTnVtYmVyXG4gIHRoaXMubWVzc2FnZSA9IG1lc3NhZ2Vcbn1cblxuZnVuY3Rpb24gZ3Vlc3NDb21tYW5kICgpIHtcbiAgdmFyIGVycm9yID0gbmV3IEVycm9yKClcbiAgdmFyIHN0YWNrID0gKGVycm9yLnN0YWNrIHx8IGVycm9yKS50b1N0cmluZygpXG4gIHZhciBwYXQgPSAvY29tcGlsZVByb2NlZHVyZS4qXFxuXFxzKmF0LipcXCgoLiopXFwpLy5leGVjKHN0YWNrKVxuICBpZiAocGF0KSB7XG4gICAgcmV0dXJuIHBhdFsxXVxuICB9XG4gIHZhciBwYXQyID0gL2NvbXBpbGVQcm9jZWR1cmUuKlxcblxccyphdFxccysoLiopKFxcbnwkKS8uZXhlYyhzdGFjaylcbiAgaWYgKHBhdDIpIHtcbiAgICByZXR1cm4gcGF0MlsxXVxuICB9XG4gIHJldHVybiAndW5rbm93bidcbn1cblxuZnVuY3Rpb24gZ3Vlc3NDYWxsU2l0ZSAoKSB7XG4gIHZhciBlcnJvciA9IG5ldyBFcnJvcigpXG4gIHZhciBzdGFjayA9IChlcnJvci5zdGFjayB8fCBlcnJvcikudG9TdHJpbmcoKVxuICB2YXIgcGF0ID0gL2F0IFJFR0xDb21tYW5kLipcXG5cXHMrYXQuKlxcKCguKilcXCkvLmV4ZWMoc3RhY2spXG4gIGlmIChwYXQpIHtcbiAgICByZXR1cm4gcGF0WzFdXG4gIH1cbiAgdmFyIHBhdDIgPSAvYXQgUkVHTENvbW1hbmQuKlxcblxccythdFxccysoLiopXFxuLy5leGVjKHN0YWNrKVxuICBpZiAocGF0Mikge1xuICAgIHJldHVybiBwYXQyWzFdXG4gIH1cbiAgcmV0dXJuICd1bmtub3duJ1xufVxuXG5mdW5jdGlvbiBwYXJzZVNvdXJjZSAoc291cmNlLCBjb21tYW5kKSB7XG4gIHZhciBsaW5lcyA9IHNvdXJjZS5zcGxpdCgnXFxuJylcbiAgdmFyIGxpbmVOdW1iZXIgPSAxXG4gIHZhciBmaWxlTnVtYmVyID0gMFxuICB2YXIgZmlsZXMgPSB7XG4gICAgdW5rbm93bjogbmV3IFNoYWRlckZpbGUoKSxcbiAgICAwOiBuZXcgU2hhZGVyRmlsZSgpXG4gIH1cbiAgZmlsZXMudW5rbm93bi5uYW1lID0gZmlsZXNbMF0ubmFtZSA9IGNvbW1hbmQgfHwgZ3Vlc3NDb21tYW5kKClcbiAgZmlsZXMudW5rbm93bi5saW5lcy5wdXNoKG5ldyBTaGFkZXJMaW5lKDAsICcnKSlcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsaW5lcy5sZW5ndGg7ICsraSkge1xuICAgIHZhciBsaW5lID0gbGluZXNbaV1cbiAgICB2YXIgcGFydHMgPSAvXlxccypcXCNcXHMqKFxcdyspXFxzKyguKylcXHMqJC8uZXhlYyhsaW5lKVxuICAgIGlmIChwYXJ0cykge1xuICAgICAgc3dpdGNoIChwYXJ0c1sxXSkge1xuICAgICAgICBjYXNlICdsaW5lJzpcbiAgICAgICAgICB2YXIgbGluZU51bWJlckluZm8gPSAvKFxcZCspKFxccytcXGQrKT8vLmV4ZWMocGFydHNbMl0pXG4gICAgICAgICAgaWYgKGxpbmVOdW1iZXJJbmZvKSB7XG4gICAgICAgICAgICBsaW5lTnVtYmVyID0gbGluZU51bWJlckluZm9bMV0gfCAwXG4gICAgICAgICAgICBpZiAobGluZU51bWJlckluZm9bMl0pIHtcbiAgICAgICAgICAgICAgZmlsZU51bWJlciA9IGxpbmVOdW1iZXJJbmZvWzJdIHwgMFxuICAgICAgICAgICAgICBpZiAoIShmaWxlTnVtYmVyIGluIGZpbGVzKSkge1xuICAgICAgICAgICAgICAgIGZpbGVzW2ZpbGVOdW1iZXJdID0gbmV3IFNoYWRlckZpbGUoKVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgJ2RlZmluZSc6XG4gICAgICAgICAgdmFyIG5hbWVJbmZvID0gL1NIQURFUl9OQU1FKF9CNjQpP1xccysoLiopJC8uZXhlYyhwYXJ0c1syXSlcbiAgICAgICAgICBpZiAobmFtZUluZm8pIHtcbiAgICAgICAgICAgIGZpbGVzW2ZpbGVOdW1iZXJdLm5hbWUgPSAobmFtZUluZm9bMV1cbiAgICAgICAgICAgICAgICA/IGRlY29kZUI2NChuYW1lSW5mb1syXSlcbiAgICAgICAgICAgICAgICA6IG5hbWVJbmZvWzJdKVxuICAgICAgICAgIH1cbiAgICAgICAgICBicmVha1xuICAgICAgfVxuICAgIH1cbiAgICBmaWxlc1tmaWxlTnVtYmVyXS5saW5lcy5wdXNoKG5ldyBTaGFkZXJMaW5lKGxpbmVOdW1iZXIrKywgbGluZSkpXG4gIH1cbiAgT2JqZWN0LmtleXMoZmlsZXMpLmZvckVhY2goZnVuY3Rpb24gKGZpbGVOdW1iZXIpIHtcbiAgICB2YXIgZmlsZSA9IGZpbGVzW2ZpbGVOdW1iZXJdXG4gICAgZmlsZS5saW5lcy5mb3JFYWNoKGZ1bmN0aW9uIChsaW5lKSB7XG4gICAgICBmaWxlLmluZGV4W2xpbmUubnVtYmVyXSA9IGxpbmVcbiAgICB9KVxuICB9KVxuICByZXR1cm4gZmlsZXNcbn1cblxuZnVuY3Rpb24gcGFyc2VFcnJvckxvZyAoZXJyTG9nKSB7XG4gIHZhciByZXN1bHQgPSBbXVxuICBlcnJMb2cuc3BsaXQoJ1xcbicpLmZvckVhY2goZnVuY3Rpb24gKGVyck1zZykge1xuICAgIGlmIChlcnJNc2cubGVuZ3RoIDwgNSkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIHZhciBwYXJ0cyA9IC9eRVJST1JcXDpcXHMrKFxcZCspXFw6KFxcZCspXFw6XFxzKiguKikkLy5leGVjKGVyck1zZylcbiAgICBpZiAocGFydHMpIHtcbiAgICAgIHJlc3VsdC5wdXNoKG5ldyBTaGFkZXJFcnJvcihcbiAgICAgICAgcGFydHNbMV0gfCAwLFxuICAgICAgICBwYXJ0c1syXSB8IDAsXG4gICAgICAgIHBhcnRzWzNdLnRyaW0oKSkpXG4gICAgfSBlbHNlIGlmIChlcnJNc2cubGVuZ3RoID4gMCkge1xuICAgICAgcmVzdWx0LnB1c2gobmV3IFNoYWRlckVycm9yKCd1bmtub3duJywgMCwgZXJyTXNnKSlcbiAgICB9XG4gIH0pXG4gIHJldHVybiByZXN1bHRcbn1cblxuZnVuY3Rpb24gYW5ub3RhdGVGaWxlcyAoZmlsZXMsIGVycm9ycykge1xuICBlcnJvcnMuZm9yRWFjaChmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICB2YXIgZmlsZSA9IGZpbGVzW2Vycm9yLmZpbGVdXG4gICAgaWYgKGZpbGUpIHtcbiAgICAgIHZhciBsaW5lID0gZmlsZS5pbmRleFtlcnJvci5saW5lXVxuICAgICAgaWYgKGxpbmUpIHtcbiAgICAgICAgbGluZS5lcnJvcnMucHVzaChlcnJvcilcbiAgICAgICAgZmlsZS5oYXNFcnJvcnMgPSB0cnVlXG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgIH1cbiAgICBmaWxlcy51bmtub3duLmhhc0Vycm9ycyA9IHRydWVcbiAgICBmaWxlcy51bmtub3duLmxpbmVzWzBdLmVycm9ycy5wdXNoKGVycm9yKVxuICB9KVxufVxuXG5mdW5jdGlvbiBjaGVja1NoYWRlckVycm9yIChnbCwgc2hhZGVyLCBzb3VyY2UsIHR5cGUsIGNvbW1hbmQpIHtcbiAgaWYgKCFnbC5nZXRTaGFkZXJQYXJhbWV0ZXIoc2hhZGVyLCBnbC5DT01QSUxFX1NUQVRVUykpIHtcbiAgICB2YXIgZXJyTG9nID0gZ2wuZ2V0U2hhZGVySW5mb0xvZyhzaGFkZXIpXG4gICAgdmFyIHR5cGVOYW1lID0gdHlwZSA9PT0gZ2wuRlJBR01FTlRfU0hBREVSID8gJ2ZyYWdtZW50JyA6ICd2ZXJ0ZXgnXG4gICAgY2hlY2tDb21tYW5kVHlwZShzb3VyY2UsICdzdHJpbmcnLCB0eXBlTmFtZSArICcgc2hhZGVyIHNvdXJjZSBtdXN0IGJlIGEgc3RyaW5nJywgY29tbWFuZClcbiAgICB2YXIgZmlsZXMgPSBwYXJzZVNvdXJjZShzb3VyY2UsIGNvbW1hbmQpXG4gICAgdmFyIGVycm9ycyA9IHBhcnNlRXJyb3JMb2coZXJyTG9nKVxuICAgIGFubm90YXRlRmlsZXMoZmlsZXMsIGVycm9ycylcblxuICAgIE9iamVjdC5rZXlzKGZpbGVzKS5mb3JFYWNoKGZ1bmN0aW9uIChmaWxlTnVtYmVyKSB7XG4gICAgICB2YXIgZmlsZSA9IGZpbGVzW2ZpbGVOdW1iZXJdXG4gICAgICBpZiAoIWZpbGUuaGFzRXJyb3JzKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuXG4gICAgICB2YXIgc3RyaW5ncyA9IFsnJ11cbiAgICAgIHZhciBzdHlsZXMgPSBbJyddXG5cbiAgICAgIGZ1bmN0aW9uIHB1c2ggKHN0ciwgc3R5bGUpIHtcbiAgICAgICAgc3RyaW5ncy5wdXNoKHN0cilcbiAgICAgICAgc3R5bGVzLnB1c2goc3R5bGUgfHwgJycpXG4gICAgICB9XG5cbiAgICAgIHB1c2goJ2ZpbGUgbnVtYmVyICcgKyBmaWxlTnVtYmVyICsgJzogJyArIGZpbGUubmFtZSArICdcXG4nLCAnY29sb3I6cmVkO3RleHQtZGVjb3JhdGlvbjp1bmRlcmxpbmU7Zm9udC13ZWlnaHQ6Ym9sZCcpXG5cbiAgICAgIGZpbGUubGluZXMuZm9yRWFjaChmdW5jdGlvbiAobGluZSkge1xuICAgICAgICBpZiAobGluZS5lcnJvcnMubGVuZ3RoID4gMCkge1xuICAgICAgICAgIHB1c2gobGVmdFBhZChsaW5lLm51bWJlciwgNCkgKyAnfCAgJywgJ2JhY2tncm91bmQtY29sb3I6eWVsbG93OyBmb250LXdlaWdodDpib2xkJylcbiAgICAgICAgICBwdXNoKGxpbmUubGluZSArICdcXG4nLCAnY29sb3I6cmVkOyBiYWNrZ3JvdW5kLWNvbG9yOnllbGxvdzsgZm9udC13ZWlnaHQ6Ym9sZCcpXG5cbiAgICAgICAgICAvLyB0cnkgdG8gZ3Vlc3MgdG9rZW5cbiAgICAgICAgICB2YXIgb2Zmc2V0ID0gMFxuICAgICAgICAgIGxpbmUuZXJyb3JzLmZvckVhY2goZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICB2YXIgbWVzc2FnZSA9IGVycm9yLm1lc3NhZ2VcbiAgICAgICAgICAgIHZhciB0b2tlbiA9IC9eXFxzKlxcJyguKilcXCdcXHMqXFw6XFxzKiguKikkLy5leGVjKG1lc3NhZ2UpXG4gICAgICAgICAgICBpZiAodG9rZW4pIHtcbiAgICAgICAgICAgICAgdmFyIHRva2VuUGF0ID0gdG9rZW5bMV1cbiAgICAgICAgICAgICAgbWVzc2FnZSA9IHRva2VuWzJdXG4gICAgICAgICAgICAgIHN3aXRjaCAodG9rZW5QYXQpIHtcbiAgICAgICAgICAgICAgICBjYXNlICdhc3NpZ24nOlxuICAgICAgICAgICAgICAgICAgdG9rZW5QYXQgPSAnPSdcbiAgICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgb2Zmc2V0ID0gTWF0aC5tYXgobGluZS5saW5lLmluZGV4T2YodG9rZW5QYXQsIG9mZnNldCksIDApXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBvZmZzZXQgPSAwXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHB1c2gobGVmdFBhZCgnfCAnLCA2KSlcbiAgICAgICAgICAgIHB1c2gobGVmdFBhZCgnXl5eJywgb2Zmc2V0ICsgMykgKyAnXFxuJywgJ2ZvbnQtd2VpZ2h0OmJvbGQnKVxuICAgICAgICAgICAgcHVzaChsZWZ0UGFkKCd8ICcsIDYpKVxuICAgICAgICAgICAgcHVzaChtZXNzYWdlICsgJ1xcbicsICdmb250LXdlaWdodDpib2xkJylcbiAgICAgICAgICB9KVxuICAgICAgICAgIHB1c2gobGVmdFBhZCgnfCAnLCA2KSArICdcXG4nKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHB1c2gobGVmdFBhZChsaW5lLm51bWJlciwgNCkgKyAnfCAgJylcbiAgICAgICAgICBwdXNoKGxpbmUubGluZSArICdcXG4nLCAnY29sb3I6cmVkJylcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIGlmICh0eXBlb2YgZG9jdW1lbnQgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHN0eWxlc1swXSA9IHN0cmluZ3Muam9pbignJWMnKVxuICAgICAgICBjb25zb2xlLmxvZy5hcHBseShjb25zb2xlLCBzdHlsZXMpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmxvZyhzdHJpbmdzLmpvaW4oJycpKVxuICAgICAgfVxuICAgIH0pXG5cbiAgICBjaGVjay5yYWlzZSgnRXJyb3IgY29tcGlsaW5nICcgKyB0eXBlTmFtZSArICcgc2hhZGVyLCAnICsgZmlsZXNbMF0ubmFtZSlcbiAgfVxufVxuXG5mdW5jdGlvbiBjaGVja0xpbmtFcnJvciAoZ2wsIHByb2dyYW0sIGZyYWdTaGFkZXIsIHZlcnRTaGFkZXIsIGNvbW1hbmQpIHtcbiAgaWYgKCFnbC5nZXRQcm9ncmFtUGFyYW1ldGVyKHByb2dyYW0sIGdsLkxJTktfU1RBVFVTKSkge1xuICAgIHZhciBlcnJMb2cgPSBnbC5nZXRQcm9ncmFtSW5mb0xvZyhwcm9ncmFtKVxuICAgIHZhciBmcmFnUGFyc2UgPSBwYXJzZVNvdXJjZShmcmFnU2hhZGVyLCBjb21tYW5kKVxuICAgIHZhciB2ZXJ0UGFyc2UgPSBwYXJzZVNvdXJjZSh2ZXJ0U2hhZGVyLCBjb21tYW5kKVxuXG4gICAgdmFyIGhlYWRlciA9ICdFcnJvciBsaW5raW5nIHByb2dyYW0gd2l0aCB2ZXJ0ZXggc2hhZGVyLCBcIicgK1xuICAgICAgdmVydFBhcnNlWzBdLm5hbWUgKyAnXCIsIGFuZCBmcmFnbWVudCBzaGFkZXIgXCInICsgZnJhZ1BhcnNlWzBdLm5hbWUgKyAnXCInXG5cbiAgICBpZiAodHlwZW9mIGRvY3VtZW50ICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgY29uc29sZS5sb2coJyVjJyArIGhlYWRlciArICdcXG4lYycgKyBlcnJMb2csXG4gICAgICAgICdjb2xvcjpyZWQ7dGV4dC1kZWNvcmF0aW9uOnVuZGVybGluZTtmb250LXdlaWdodDpib2xkJyxcbiAgICAgICAgJ2NvbG9yOnJlZCcpXG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKGhlYWRlciArICdcXG4nICsgZXJyTG9nKVxuICAgIH1cbiAgICBjaGVjay5yYWlzZShoZWFkZXIpXG4gIH1cbn1cblxuZnVuY3Rpb24gc2F2ZUNvbW1hbmRSZWYgKG9iamVjdCkge1xuICBvYmplY3QuX2NvbW1hbmRSZWYgPSBndWVzc0NvbW1hbmQoKVxufVxuXG5mdW5jdGlvbiBzYXZlRHJhd0NvbW1hbmRJbmZvIChvcHRzLCB1bmlmb3JtcywgYXR0cmlidXRlcywgc3RyaW5nU3RvcmUpIHtcbiAgc2F2ZUNvbW1hbmRSZWYob3B0cylcblxuICBmdW5jdGlvbiBpZCAoc3RyKSB7XG4gICAgaWYgKHN0cikge1xuICAgICAgcmV0dXJuIHN0cmluZ1N0b3JlLmlkKHN0cilcbiAgICB9XG4gICAgcmV0dXJuIDBcbiAgfVxuICBvcHRzLl9mcmFnSWQgPSBpZChvcHRzLnN0YXRpYy5mcmFnKVxuICBvcHRzLl92ZXJ0SWQgPSBpZChvcHRzLnN0YXRpYy52ZXJ0KVxuXG4gIGZ1bmN0aW9uIGFkZFByb3BzIChkaWN0LCBzZXQpIHtcbiAgICBPYmplY3Qua2V5cyhzZXQpLmZvckVhY2goZnVuY3Rpb24gKHUpIHtcbiAgICAgIGRpY3Rbc3RyaW5nU3RvcmUuaWQodSldID0gdHJ1ZVxuICAgIH0pXG4gIH1cblxuICB2YXIgdW5pZm9ybVNldCA9IG9wdHMuX3VuaWZvcm1TZXQgPSB7fVxuICBhZGRQcm9wcyh1bmlmb3JtU2V0LCB1bmlmb3Jtcy5zdGF0aWMpXG4gIGFkZFByb3BzKHVuaWZvcm1TZXQsIHVuaWZvcm1zLmR5bmFtaWMpXG5cbiAgdmFyIGF0dHJpYnV0ZVNldCA9IG9wdHMuX2F0dHJpYnV0ZVNldCA9IHt9XG4gIGFkZFByb3BzKGF0dHJpYnV0ZVNldCwgYXR0cmlidXRlcy5zdGF0aWMpXG4gIGFkZFByb3BzKGF0dHJpYnV0ZVNldCwgYXR0cmlidXRlcy5keW5hbWljKVxuXG4gIG9wdHMuX2hhc0NvdW50ID0gKFxuICAgICdjb3VudCcgaW4gb3B0cy5zdGF0aWMgfHxcbiAgICAnY291bnQnIGluIG9wdHMuZHluYW1pYyB8fFxuICAgICdlbGVtZW50cycgaW4gb3B0cy5zdGF0aWMgfHxcbiAgICAnZWxlbWVudHMnIGluIG9wdHMuZHluYW1pYylcbn1cblxuZnVuY3Rpb24gY29tbWFuZFJhaXNlIChtZXNzYWdlLCBjb21tYW5kKSB7XG4gIHZhciBjYWxsU2l0ZSA9IGd1ZXNzQ2FsbFNpdGUoKVxuICByYWlzZShtZXNzYWdlICtcbiAgICAnIGluIGNvbW1hbmQgJyArIChjb21tYW5kIHx8IGd1ZXNzQ29tbWFuZCgpKSArXG4gICAgKGNhbGxTaXRlID09PSAndW5rbm93bicgPyAnJyA6ICcgY2FsbGVkIGZyb20gJyArIGNhbGxTaXRlKSlcbn1cblxuZnVuY3Rpb24gY2hlY2tDb21tYW5kIChwcmVkLCBtZXNzYWdlLCBjb21tYW5kKSB7XG4gIGlmICghcHJlZCkge1xuICAgIGNvbW1hbmRSYWlzZShtZXNzYWdlLCBjb21tYW5kIHx8IGd1ZXNzQ29tbWFuZCgpKVxuICB9XG59XG5cbmZ1bmN0aW9uIGNoZWNrUGFyYW1ldGVyQ29tbWFuZCAocGFyYW0sIHBvc3NpYmlsaXRpZXMsIG1lc3NhZ2UsIGNvbW1hbmQpIHtcbiAgaWYgKCEocGFyYW0gaW4gcG9zc2liaWxpdGllcykpIHtcbiAgICBjb21tYW5kUmFpc2UoXG4gICAgICAndW5rbm93biBwYXJhbWV0ZXIgKCcgKyBwYXJhbSArICcpJyArIGVuY29sb24obWVzc2FnZSkgK1xuICAgICAgJy4gcG9zc2libGUgdmFsdWVzOiAnICsgT2JqZWN0LmtleXMocG9zc2liaWxpdGllcykuam9pbigpLFxuICAgICAgY29tbWFuZCB8fCBndWVzc0NvbW1hbmQoKSlcbiAgfVxufVxuXG5mdW5jdGlvbiBjaGVja0NvbW1hbmRUeXBlICh2YWx1ZSwgdHlwZSwgbWVzc2FnZSwgY29tbWFuZCkge1xuICBpZiAodHlwZW9mIHZhbHVlICE9PSB0eXBlKSB7XG4gICAgY29tbWFuZFJhaXNlKFxuICAgICAgJ2ludmFsaWQgcGFyYW1ldGVyIHR5cGUnICsgZW5jb2xvbihtZXNzYWdlKSArXG4gICAgICAnLiBleHBlY3RlZCAnICsgdHlwZSArICcsIGdvdCAnICsgKHR5cGVvZiB2YWx1ZSksXG4gICAgICBjb21tYW5kIHx8IGd1ZXNzQ29tbWFuZCgpKVxuICB9XG59XG5cbmZ1bmN0aW9uIGNoZWNrT3B0aW9uYWwgKGJsb2NrKSB7XG4gIGJsb2NrKClcbn1cblxuZnVuY3Rpb24gY2hlY2tGcmFtZWJ1ZmZlckZvcm1hdCAoYXR0YWNobWVudCwgdGV4Rm9ybWF0cywgcmJGb3JtYXRzKSB7XG4gIGlmIChhdHRhY2htZW50LnRleHR1cmUpIHtcbiAgICBjaGVja09uZU9mKFxuICAgICAgYXR0YWNobWVudC50ZXh0dXJlLl90ZXh0dXJlLmludGVybmFsZm9ybWF0LFxuICAgICAgdGV4Rm9ybWF0cyxcbiAgICAgICd1bnN1cHBvcnRlZCB0ZXh0dXJlIGZvcm1hdCBmb3IgYXR0YWNobWVudCcpXG4gIH0gZWxzZSB7XG4gICAgY2hlY2tPbmVPZihcbiAgICAgIGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXIuZm9ybWF0LFxuICAgICAgcmJGb3JtYXRzLFxuICAgICAgJ3Vuc3VwcG9ydGVkIHJlbmRlcmJ1ZmZlciBmb3JtYXQgZm9yIGF0dGFjaG1lbnQnKVxuICB9XG59XG5cbnZhciBHTF9DTEFNUF9UT19FREdFID0gMHg4MTJGXG5cbnZhciBHTF9ORUFSRVNUID0gMHgyNjAwXG52YXIgR0xfTkVBUkVTVF9NSVBNQVBfTkVBUkVTVCA9IDB4MjcwMFxudmFyIEdMX0xJTkVBUl9NSVBNQVBfTkVBUkVTVCA9IDB4MjcwMVxudmFyIEdMX05FQVJFU1RfTUlQTUFQX0xJTkVBUiA9IDB4MjcwMlxudmFyIEdMX0xJTkVBUl9NSVBNQVBfTElORUFSID0gMHgyNzAzXG5cbnZhciBHTF9CWVRFID0gNTEyMFxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSA1MTIxXG52YXIgR0xfU0hPUlQgPSA1MTIyXG52YXIgR0xfVU5TSUdORURfU0hPUlQgPSA1MTIzXG52YXIgR0xfSU5UID0gNTEyNFxudmFyIEdMX1VOU0lHTkVEX0lOVCA9IDUxMjVcbnZhciBHTF9GTE9BVCA9IDUxMjZcblxudmFyIEdMX1VOU0lHTkVEX1NIT1JUXzRfNF80XzQgPSAweDgwMzNcbnZhciBHTF9VTlNJR05FRF9TSE9SVF81XzVfNV8xID0gMHg4MDM0XG52YXIgR0xfVU5TSUdORURfU0hPUlRfNV82XzUgPSAweDgzNjNcbnZhciBHTF9VTlNJR05FRF9JTlRfMjRfOF9XRUJHTCA9IDB4ODRGQVxuXG52YXIgR0xfSEFMRl9GTE9BVF9PRVMgPSAweDhENjFcblxudmFyIFRZUEVfU0laRSA9IHt9XG5cblRZUEVfU0laRVtHTF9CWVRFXSA9XG5UWVBFX1NJWkVbR0xfVU5TSUdORURfQllURV0gPSAxXG5cblRZUEVfU0laRVtHTF9TSE9SVF0gPVxuVFlQRV9TSVpFW0dMX1VOU0lHTkVEX1NIT1JUXSA9XG5UWVBFX1NJWkVbR0xfSEFMRl9GTE9BVF9PRVNdID1cblRZUEVfU0laRVtHTF9VTlNJR05FRF9TSE9SVF81XzZfNV0gPVxuVFlQRV9TSVpFW0dMX1VOU0lHTkVEX1NIT1JUXzRfNF80XzRdID1cblRZUEVfU0laRVtHTF9VTlNJR05FRF9TSE9SVF81XzVfNV8xXSA9IDJcblxuVFlQRV9TSVpFW0dMX0lOVF0gPVxuVFlQRV9TSVpFW0dMX1VOU0lHTkVEX0lOVF0gPVxuVFlQRV9TSVpFW0dMX0ZMT0FUXSA9XG5UWVBFX1NJWkVbR0xfVU5TSUdORURfSU5UXzI0XzhfV0VCR0xdID0gNFxuXG5mdW5jdGlvbiBwaXhlbFNpemUgKHR5cGUsIGNoYW5uZWxzKSB7XG4gIGlmICh0eXBlID09PSBHTF9VTlNJR05FRF9TSE9SVF81XzVfNV8xIHx8XG4gICAgICB0eXBlID09PSBHTF9VTlNJR05FRF9TSE9SVF80XzRfNF80IHx8XG4gICAgICB0eXBlID09PSBHTF9VTlNJR05FRF9TSE9SVF81XzZfNSkge1xuICAgIHJldHVybiAyXG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gR0xfVU5TSUdORURfSU5UXzI0XzhfV0VCR0wpIHtcbiAgICByZXR1cm4gNFxuICB9IGVsc2Uge1xuICAgIHJldHVybiBUWVBFX1NJWkVbdHlwZV0gKiBjaGFubmVsc1xuICB9XG59XG5cbmZ1bmN0aW9uIGlzUG93MiAodikge1xuICByZXR1cm4gISh2ICYgKHYgLSAxKSkgJiYgKCEhdilcbn1cblxuZnVuY3Rpb24gY2hlY2tUZXh0dXJlMkQgKGluZm8sIG1pcERhdGEsIGxpbWl0cykge1xuICB2YXIgaVxuICB2YXIgdyA9IG1pcERhdGEud2lkdGhcbiAgdmFyIGggPSBtaXBEYXRhLmhlaWdodFxuICB2YXIgYyA9IG1pcERhdGEuY2hhbm5lbHNcblxuICAvLyBDaGVjayB0ZXh0dXJlIHNoYXBlXG4gIGNoZWNrKHcgPiAwICYmIHcgPD0gbGltaXRzLm1heFRleHR1cmVTaXplICYmXG4gICAgICAgIGggPiAwICYmIGggPD0gbGltaXRzLm1heFRleHR1cmVTaXplLFxuICAgICAgICAnaW52YWxpZCB0ZXh0dXJlIHNoYXBlJylcblxuICAvLyBjaGVjayB3cmFwIG1vZGVcbiAgaWYgKGluZm8ud3JhcFMgIT09IEdMX0NMQU1QX1RPX0VER0UgfHwgaW5mby53cmFwVCAhPT0gR0xfQ0xBTVBfVE9fRURHRSkge1xuICAgIGNoZWNrKGlzUG93Mih3KSAmJiBpc1BvdzIoaCksXG4gICAgICAnaW5jb21wYXRpYmxlIHdyYXAgbW9kZSBmb3IgdGV4dHVyZSwgYm90aCB3aWR0aCBhbmQgaGVpZ2h0IG11c3QgYmUgcG93ZXIgb2YgMicpXG4gIH1cblxuICBpZiAobWlwRGF0YS5taXBtYXNrID09PSAxKSB7XG4gICAgaWYgKHcgIT09IDEgJiYgaCAhPT0gMSkge1xuICAgICAgY2hlY2soXG4gICAgICAgIGluZm8ubWluRmlsdGVyICE9PSBHTF9ORUFSRVNUX01JUE1BUF9ORUFSRVNUICYmXG4gICAgICAgIGluZm8ubWluRmlsdGVyICE9PSBHTF9ORUFSRVNUX01JUE1BUF9MSU5FQVIgJiZcbiAgICAgICAgaW5mby5taW5GaWx0ZXIgIT09IEdMX0xJTkVBUl9NSVBNQVBfTkVBUkVTVCAmJlxuICAgICAgICBpbmZvLm1pbkZpbHRlciAhPT0gR0xfTElORUFSX01JUE1BUF9MSU5FQVIsXG4gICAgICAgICdtaW4gZmlsdGVyIHJlcXVpcmVzIG1pcG1hcCcpXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIC8vIHRleHR1cmUgbXVzdCBiZSBwb3dlciBvZiAyXG4gICAgY2hlY2soaXNQb3cyKHcpICYmIGlzUG93MihoKSxcbiAgICAgICd0ZXh0dXJlIG11c3QgYmUgYSBzcXVhcmUgcG93ZXIgb2YgMiB0byBzdXBwb3J0IG1pcG1hcHBpbmcnKVxuICAgIGNoZWNrKG1pcERhdGEubWlwbWFzayA9PT0gKHcgPDwgMSkgLSAxLFxuICAgICAgJ21pc3Npbmcgb3IgaW5jb21wbGV0ZSBtaXBtYXAgZGF0YScpXG4gIH1cblxuICBpZiAobWlwRGF0YS50eXBlID09PSBHTF9GTE9BVCkge1xuICAgIGlmIChsaW1pdHMuZXh0ZW5zaW9ucy5pbmRleE9mKCdvZXNfdGV4dHVyZV9mbG9hdF9saW5lYXInKSA8IDApIHtcbiAgICAgIGNoZWNrKGluZm8ubWluRmlsdGVyID09PSBHTF9ORUFSRVNUICYmIGluZm8ubWFnRmlsdGVyID09PSBHTF9ORUFSRVNULFxuICAgICAgICAnZmlsdGVyIG5vdCBzdXBwb3J0ZWQsIG11c3QgZW5hYmxlIG9lc190ZXh0dXJlX2Zsb2F0X2xpbmVhcicpXG4gICAgfVxuICAgIGNoZWNrKCFpbmZvLmdlbk1pcG1hcHMsXG4gICAgICAnbWlwbWFwIGdlbmVyYXRpb24gbm90IHN1cHBvcnRlZCB3aXRoIGZsb2F0IHRleHR1cmVzJylcbiAgfVxuXG4gIC8vIGNoZWNrIGltYWdlIGNvbXBsZXRlXG4gIHZhciBtaXBpbWFnZXMgPSBtaXBEYXRhLmltYWdlc1xuICBmb3IgKGkgPSAwOyBpIDwgMTY7ICsraSkge1xuICAgIGlmIChtaXBpbWFnZXNbaV0pIHtcbiAgICAgIHZhciBtdyA9IHcgPj4gaVxuICAgICAgdmFyIG1oID0gaCA+PiBpXG4gICAgICBjaGVjayhtaXBEYXRhLm1pcG1hc2sgJiAoMSA8PCBpKSwgJ21pc3NpbmcgbWlwbWFwIGRhdGEnKVxuXG4gICAgICB2YXIgaW1nID0gbWlwaW1hZ2VzW2ldXG5cbiAgICAgIGNoZWNrKFxuICAgICAgICBpbWcud2lkdGggPT09IG13ICYmXG4gICAgICAgIGltZy5oZWlnaHQgPT09IG1oLFxuICAgICAgICAnaW52YWxpZCBzaGFwZSBmb3IgbWlwIGltYWdlcycpXG5cbiAgICAgIGNoZWNrKFxuICAgICAgICBpbWcuZm9ybWF0ID09PSBtaXBEYXRhLmZvcm1hdCAmJlxuICAgICAgICBpbWcuaW50ZXJuYWxmb3JtYXQgPT09IG1pcERhdGEuaW50ZXJuYWxmb3JtYXQgJiZcbiAgICAgICAgaW1nLnR5cGUgPT09IG1pcERhdGEudHlwZSxcbiAgICAgICAgJ2luY29tcGF0aWJsZSB0eXBlIGZvciBtaXAgaW1hZ2UnKVxuXG4gICAgICBpZiAoaW1nLmNvbXByZXNzZWQpIHtcbiAgICAgICAgLy8gVE9ETzogY2hlY2sgc2l6ZSBmb3IgY29tcHJlc3NlZCBpbWFnZXNcbiAgICAgIH0gZWxzZSBpZiAoaW1nLmRhdGEpIHtcbiAgICAgICAgY2hlY2soaW1nLmRhdGEuYnl0ZUxlbmd0aCA9PT0gbXcgKiBtaCAqXG4gICAgICAgICAgTWF0aC5tYXgocGl4ZWxTaXplKGltZy50eXBlLCBjKSwgaW1nLnVucGFja0FsaWdubWVudCksXG4gICAgICAgICAgJ2ludmFsaWQgZGF0YSBmb3IgaW1hZ2UsIGJ1ZmZlciBzaXplIGlzIGluY29uc2lzdGVudCB3aXRoIGltYWdlIGZvcm1hdCcpXG4gICAgICB9IGVsc2UgaWYgKGltZy5lbGVtZW50KSB7XG4gICAgICAgIC8vIFRPRE86IGNoZWNrIGVsZW1lbnQgY2FuIGJlIGxvYWRlZFxuICAgICAgfSBlbHNlIGlmIChpbWcuY29weSkge1xuICAgICAgICAvLyBUT0RPOiBjaGVjayBjb21wYXRpYmxlIGZvcm1hdCBhbmQgdHlwZVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoIWluZm8uZ2VuTWlwbWFwcykge1xuICAgICAgY2hlY2soKG1pcERhdGEubWlwbWFzayAmICgxIDw8IGkpKSA9PT0gMCwgJ2V4dHJhIG1pcG1hcCBkYXRhJylcbiAgICB9XG4gIH1cblxuICBpZiAobWlwRGF0YS5jb21wcmVzc2VkKSB7XG4gICAgY2hlY2soIWluZm8uZ2VuTWlwbWFwcyxcbiAgICAgICdtaXBtYXAgZ2VuZXJhdGlvbiBmb3IgY29tcHJlc3NlZCBpbWFnZXMgbm90IHN1cHBvcnRlZCcpXG4gIH1cbn1cblxuZnVuY3Rpb24gY2hlY2tUZXh0dXJlQ3ViZSAodGV4dHVyZSwgaW5mbywgZmFjZXMsIGxpbWl0cykge1xuICB2YXIgdyA9IHRleHR1cmUud2lkdGhcbiAgdmFyIGggPSB0ZXh0dXJlLmhlaWdodFxuICB2YXIgYyA9IHRleHR1cmUuY2hhbm5lbHNcblxuICAvLyBDaGVjayB0ZXh0dXJlIHNoYXBlXG4gIGNoZWNrKFxuICAgIHcgPiAwICYmIHcgPD0gbGltaXRzLm1heFRleHR1cmVTaXplICYmIGggPiAwICYmIGggPD0gbGltaXRzLm1heFRleHR1cmVTaXplLFxuICAgICdpbnZhbGlkIHRleHR1cmUgc2hhcGUnKVxuICBjaGVjayhcbiAgICB3ID09PSBoLFxuICAgICdjdWJlIG1hcCBtdXN0IGJlIHNxdWFyZScpXG4gIGNoZWNrKFxuICAgIGluZm8ud3JhcFMgPT09IEdMX0NMQU1QX1RPX0VER0UgJiYgaW5mby53cmFwVCA9PT0gR0xfQ0xBTVBfVE9fRURHRSxcbiAgICAnd3JhcCBtb2RlIG5vdCBzdXBwb3J0ZWQgYnkgY3ViZSBtYXAnKVxuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgZmFjZXMubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgZmFjZSA9IGZhY2VzW2ldXG4gICAgY2hlY2soXG4gICAgICBmYWNlLndpZHRoID09PSB3ICYmIGZhY2UuaGVpZ2h0ID09PSBoLFxuICAgICAgJ2luY29uc2lzdGVudCBjdWJlIG1hcCBmYWNlIHNoYXBlJylcblxuICAgIGlmIChpbmZvLmdlbk1pcG1hcHMpIHtcbiAgICAgIGNoZWNrKCFmYWNlLmNvbXByZXNzZWQsXG4gICAgICAgICdjYW4gbm90IGdlbmVyYXRlIG1pcG1hcCBmb3IgY29tcHJlc3NlZCB0ZXh0dXJlcycpXG4gICAgICBjaGVjayhmYWNlLm1pcG1hc2sgPT09IDEsXG4gICAgICAgICdjYW4gbm90IHNwZWNpZnkgbWlwbWFwcyBhbmQgZ2VuZXJhdGUgbWlwbWFwcycpXG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFRPRE86IGNoZWNrIG1pcCBhbmQgZmlsdGVyIG1vZGVcbiAgICB9XG5cbiAgICB2YXIgbWlwbWFwcyA9IGZhY2UuaW1hZ2VzXG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCAxNjsgKytqKSB7XG4gICAgICB2YXIgaW1nID0gbWlwbWFwc1tqXVxuICAgICAgaWYgKGltZykge1xuICAgICAgICB2YXIgbXcgPSB3ID4+IGpcbiAgICAgICAgdmFyIG1oID0gaCA+PiBqXG4gICAgICAgIGNoZWNrKGZhY2UubWlwbWFzayAmICgxIDw8IGopLCAnbWlzc2luZyBtaXBtYXAgZGF0YScpXG4gICAgICAgIGNoZWNrKFxuICAgICAgICAgIGltZy53aWR0aCA9PT0gbXcgJiZcbiAgICAgICAgICBpbWcuaGVpZ2h0ID09PSBtaCxcbiAgICAgICAgICAnaW52YWxpZCBzaGFwZSBmb3IgbWlwIGltYWdlcycpXG4gICAgICAgIGNoZWNrKFxuICAgICAgICAgIGltZy5mb3JtYXQgPT09IHRleHR1cmUuZm9ybWF0ICYmXG4gICAgICAgICAgaW1nLmludGVybmFsZm9ybWF0ID09PSB0ZXh0dXJlLmludGVybmFsZm9ybWF0ICYmXG4gICAgICAgICAgaW1nLnR5cGUgPT09IHRleHR1cmUudHlwZSxcbiAgICAgICAgICAnaW5jb21wYXRpYmxlIHR5cGUgZm9yIG1pcCBpbWFnZScpXG5cbiAgICAgICAgaWYgKGltZy5jb21wcmVzc2VkKSB7XG4gICAgICAgICAgLy8gVE9ETzogY2hlY2sgc2l6ZSBmb3IgY29tcHJlc3NlZCBpbWFnZXNcbiAgICAgICAgfSBlbHNlIGlmIChpbWcuZGF0YSkge1xuICAgICAgICAgIGNoZWNrKGltZy5kYXRhLmJ5dGVMZW5ndGggPT09IG13ICogbWggKlxuICAgICAgICAgICAgTWF0aC5tYXgocGl4ZWxTaXplKGltZy50eXBlLCBjKSwgaW1nLnVucGFja0FsaWdubWVudCksXG4gICAgICAgICAgICAnaW52YWxpZCBkYXRhIGZvciBpbWFnZSwgYnVmZmVyIHNpemUgaXMgaW5jb25zaXN0ZW50IHdpdGggaW1hZ2UgZm9ybWF0JylcbiAgICAgICAgfSBlbHNlIGlmIChpbWcuZWxlbWVudCkge1xuICAgICAgICAgIC8vIFRPRE86IGNoZWNrIGVsZW1lbnQgY2FuIGJlIGxvYWRlZFxuICAgICAgICB9IGVsc2UgaWYgKGltZy5jb3B5KSB7XG4gICAgICAgICAgLy8gVE9ETzogY2hlY2sgY29tcGF0aWJsZSBmb3JtYXQgYW5kIHR5cGVcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGV4dGVuZChjaGVjaywge1xuICBvcHRpb25hbDogY2hlY2tPcHRpb25hbCxcbiAgcmFpc2U6IHJhaXNlLFxuICBjb21tYW5kUmFpc2U6IGNvbW1hbmRSYWlzZSxcbiAgY29tbWFuZDogY2hlY2tDb21tYW5kLFxuICBwYXJhbWV0ZXI6IGNoZWNrUGFyYW1ldGVyLFxuICBjb21tYW5kUGFyYW1ldGVyOiBjaGVja1BhcmFtZXRlckNvbW1hbmQsXG4gIGNvbnN0cnVjdG9yOiBjaGVja0NvbnN0cnVjdG9yLFxuICB0eXBlOiBjaGVja1R5cGVPZixcbiAgY29tbWFuZFR5cGU6IGNoZWNrQ29tbWFuZFR5cGUsXG4gIGlzVHlwZWRBcnJheTogY2hlY2tJc1R5cGVkQXJyYXksXG4gIG5uaTogY2hlY2tOb25OZWdhdGl2ZUludCxcbiAgb25lT2Y6IGNoZWNrT25lT2YsXG4gIHNoYWRlckVycm9yOiBjaGVja1NoYWRlckVycm9yLFxuICBsaW5rRXJyb3I6IGNoZWNrTGlua0Vycm9yLFxuICBjYWxsU2l0ZTogZ3Vlc3NDYWxsU2l0ZSxcbiAgc2F2ZUNvbW1hbmRSZWY6IHNhdmVDb21tYW5kUmVmLFxuICBzYXZlRHJhd0luZm86IHNhdmVEcmF3Q29tbWFuZEluZm8sXG4gIGZyYW1lYnVmZmVyRm9ybWF0OiBjaGVja0ZyYW1lYnVmZmVyRm9ybWF0LFxuICBndWVzc0NvbW1hbmQ6IGd1ZXNzQ29tbWFuZCxcbiAgdGV4dHVyZTJEOiBjaGVja1RleHR1cmUyRCxcbiAgdGV4dHVyZUN1YmU6IGNoZWNrVGV4dHVyZUN1YmVcbn0pXG4iLCIvKiBnbG9iYWxzIHBlcmZvcm1hbmNlICovXG5tb2R1bGUuZXhwb3J0cyA9XG4gICh0eXBlb2YgcGVyZm9ybWFuY2UgIT09ICd1bmRlZmluZWQnICYmIHBlcmZvcm1hbmNlLm5vdylcbiAgPyBmdW5jdGlvbiAoKSB7IHJldHVybiBwZXJmb3JtYW5jZS5ub3coKSB9XG4gIDogZnVuY3Rpb24gKCkgeyByZXR1cm4gKyhuZXcgRGF0ZSgpKSB9XG4iLCJ2YXIgZXh0ZW5kID0gcmVxdWlyZSgnLi9leHRlbmQnKVxuXG5mdW5jdGlvbiBzbGljZSAoeCkge1xuICByZXR1cm4gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoeClcbn1cblxuZnVuY3Rpb24gam9pbiAoeCkge1xuICByZXR1cm4gc2xpY2UoeCkuam9pbignJylcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjcmVhdGVFbnZpcm9ubWVudCAoKSB7XG4gIC8vIFVuaXF1ZSB2YXJpYWJsZSBpZCBjb3VudGVyXG4gIHZhciB2YXJDb3VudGVyID0gMFxuXG4gIC8vIExpbmtlZCB2YWx1ZXMgYXJlIHBhc3NlZCBmcm9tIHRoaXMgc2NvcGUgaW50byB0aGUgZ2VuZXJhdGVkIGNvZGUgYmxvY2tcbiAgLy8gQ2FsbGluZyBsaW5rKCkgcGFzc2VzIGEgdmFsdWUgaW50byB0aGUgZ2VuZXJhdGVkIHNjb3BlIGFuZCByZXR1cm5zXG4gIC8vIHRoZSB2YXJpYWJsZSBuYW1lIHdoaWNoIGl0IGlzIGJvdW5kIHRvXG4gIHZhciBsaW5rZWROYW1lcyA9IFtdXG4gIHZhciBsaW5rZWRWYWx1ZXMgPSBbXVxuICBmdW5jdGlvbiBsaW5rICh2YWx1ZSkge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGlua2VkVmFsdWVzLmxlbmd0aDsgKytpKSB7XG4gICAgICBpZiAobGlua2VkVmFsdWVzW2ldID09PSB2YWx1ZSkge1xuICAgICAgICByZXR1cm4gbGlua2VkTmFtZXNbaV1cbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgbmFtZSA9ICdnJyArICh2YXJDb3VudGVyKyspXG4gICAgbGlua2VkTmFtZXMucHVzaChuYW1lKVxuICAgIGxpbmtlZFZhbHVlcy5wdXNoKHZhbHVlKVxuICAgIHJldHVybiBuYW1lXG4gIH1cblxuICAvLyBjcmVhdGUgYSBjb2RlIGJsb2NrXG4gIGZ1bmN0aW9uIGJsb2NrICgpIHtcbiAgICB2YXIgY29kZSA9IFtdXG4gICAgZnVuY3Rpb24gcHVzaCAoKSB7XG4gICAgICBjb2RlLnB1c2guYXBwbHkoY29kZSwgc2xpY2UoYXJndW1lbnRzKSlcbiAgICB9XG5cbiAgICB2YXIgdmFycyA9IFtdXG4gICAgZnVuY3Rpb24gZGVmICgpIHtcbiAgICAgIHZhciBuYW1lID0gJ3YnICsgKHZhckNvdW50ZXIrKylcbiAgICAgIHZhcnMucHVzaChuYW1lKVxuXG4gICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29kZS5wdXNoKG5hbWUsICc9JylcbiAgICAgICAgY29kZS5wdXNoLmFwcGx5KGNvZGUsIHNsaWNlKGFyZ3VtZW50cykpXG4gICAgICAgIGNvZGUucHVzaCgnOycpXG4gICAgICB9XG5cbiAgICAgIHJldHVybiBuYW1lXG4gICAgfVxuXG4gICAgcmV0dXJuIGV4dGVuZChwdXNoLCB7XG4gICAgICBkZWY6IGRlZixcbiAgICAgIHRvU3RyaW5nOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBqb2luKFtcbiAgICAgICAgICAodmFycy5sZW5ndGggPiAwID8gJ3ZhciAnICsgdmFycyArICc7JyA6ICcnKSxcbiAgICAgICAgICBqb2luKGNvZGUpXG4gICAgICAgIF0pXG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIHNjb3BlICgpIHtcbiAgICB2YXIgZW50cnkgPSBibG9jaygpXG4gICAgdmFyIGV4aXQgPSBibG9jaygpXG5cbiAgICB2YXIgZW50cnlUb1N0cmluZyA9IGVudHJ5LnRvU3RyaW5nXG4gICAgdmFyIGV4aXRUb1N0cmluZyA9IGV4aXQudG9TdHJpbmdcblxuICAgIGZ1bmN0aW9uIHNhdmUgKG9iamVjdCwgcHJvcCkge1xuICAgICAgZXhpdChvYmplY3QsIHByb3AsICc9JywgZW50cnkuZGVmKG9iamVjdCwgcHJvcCksICc7JylcbiAgICB9XG5cbiAgICByZXR1cm4gZXh0ZW5kKGZ1bmN0aW9uICgpIHtcbiAgICAgIGVudHJ5LmFwcGx5KGVudHJ5LCBzbGljZShhcmd1bWVudHMpKVxuICAgIH0sIHtcbiAgICAgIGRlZjogZW50cnkuZGVmLFxuICAgICAgZW50cnk6IGVudHJ5LFxuICAgICAgZXhpdDogZXhpdCxcbiAgICAgIHNhdmU6IHNhdmUsXG4gICAgICBzZXQ6IGZ1bmN0aW9uIChvYmplY3QsIHByb3AsIHZhbHVlKSB7XG4gICAgICAgIHNhdmUob2JqZWN0LCBwcm9wKVxuICAgICAgICBlbnRyeShvYmplY3QsIHByb3AsICc9JywgdmFsdWUsICc7JylcbiAgICAgIH0sXG4gICAgICB0b1N0cmluZzogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gZW50cnlUb1N0cmluZygpICsgZXhpdFRvU3RyaW5nKClcbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgZnVuY3Rpb24gY29uZGl0aW9uYWwgKCkge1xuICAgIHZhciBwcmVkID0gam9pbihhcmd1bWVudHMpXG4gICAgdmFyIHRoZW5CbG9jayA9IHNjb3BlKClcbiAgICB2YXIgZWxzZUJsb2NrID0gc2NvcGUoKVxuXG4gICAgdmFyIHRoZW5Ub1N0cmluZyA9IHRoZW5CbG9jay50b1N0cmluZ1xuICAgIHZhciBlbHNlVG9TdHJpbmcgPSBlbHNlQmxvY2sudG9TdHJpbmdcblxuICAgIHJldHVybiBleHRlbmQodGhlbkJsb2NrLCB7XG4gICAgICB0aGVuOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoZW5CbG9jay5hcHBseSh0aGVuQmxvY2ssIHNsaWNlKGFyZ3VtZW50cykpXG4gICAgICAgIHJldHVybiB0aGlzXG4gICAgICB9LFxuICAgICAgZWxzZTogZnVuY3Rpb24gKCkge1xuICAgICAgICBlbHNlQmxvY2suYXBwbHkoZWxzZUJsb2NrLCBzbGljZShhcmd1bWVudHMpKVxuICAgICAgICByZXR1cm4gdGhpc1xuICAgICAgfSxcbiAgICAgIHRvU3RyaW5nOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBlbHNlQ2xhdXNlID0gZWxzZVRvU3RyaW5nKClcbiAgICAgICAgaWYgKGVsc2VDbGF1c2UpIHtcbiAgICAgICAgICBlbHNlQ2xhdXNlID0gJ2Vsc2V7JyArIGVsc2VDbGF1c2UgKyAnfSdcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gam9pbihbXG4gICAgICAgICAgJ2lmKCcsIHByZWQsICcpeycsXG4gICAgICAgICAgdGhlblRvU3RyaW5nKCksXG4gICAgICAgICAgJ30nLCBlbHNlQ2xhdXNlXG4gICAgICAgIF0pXG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIC8vIHByb2NlZHVyZSBsaXN0XG4gIHZhciBnbG9iYWxCbG9jayA9IGJsb2NrKClcbiAgdmFyIHByb2NlZHVyZXMgPSB7fVxuICBmdW5jdGlvbiBwcm9jIChuYW1lLCBjb3VudCkge1xuICAgIHZhciBhcmdzID0gW11cbiAgICBmdW5jdGlvbiBhcmcgKCkge1xuICAgICAgdmFyIG5hbWUgPSAnYScgKyBhcmdzLmxlbmd0aFxuICAgICAgYXJncy5wdXNoKG5hbWUpXG4gICAgICByZXR1cm4gbmFtZVxuICAgIH1cblxuICAgIGNvdW50ID0gY291bnQgfHwgMFxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY291bnQ7ICsraSkge1xuICAgICAgYXJnKClcbiAgICB9XG5cbiAgICB2YXIgYm9keSA9IHNjb3BlKClcbiAgICB2YXIgYm9keVRvU3RyaW5nID0gYm9keS50b1N0cmluZ1xuXG4gICAgdmFyIHJlc3VsdCA9IHByb2NlZHVyZXNbbmFtZV0gPSBleHRlbmQoYm9keSwge1xuICAgICAgYXJnOiBhcmcsXG4gICAgICB0b1N0cmluZzogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gam9pbihbXG4gICAgICAgICAgJ2Z1bmN0aW9uKCcsIGFyZ3Muam9pbigpLCAnKXsnLFxuICAgICAgICAgIGJvZHlUb1N0cmluZygpLFxuICAgICAgICAgICd9J1xuICAgICAgICBdKVxuICAgICAgfVxuICAgIH0pXG5cbiAgICByZXR1cm4gcmVzdWx0XG4gIH1cblxuICBmdW5jdGlvbiBjb21waWxlICgpIHtcbiAgICB2YXIgY29kZSA9IFsnXCJ1c2Ugc3RyaWN0XCI7JyxcbiAgICAgIGdsb2JhbEJsb2NrLFxuICAgICAgJ3JldHVybiB7J11cbiAgICBPYmplY3Qua2V5cyhwcm9jZWR1cmVzKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICBjb2RlLnB1c2goJ1wiJywgbmFtZSwgJ1wiOicsIHByb2NlZHVyZXNbbmFtZV0udG9TdHJpbmcoKSwgJywnKVxuICAgIH0pXG4gICAgY29kZS5wdXNoKCd9JylcbiAgICB2YXIgc3JjID0gam9pbihjb2RlKVxuICAgICAgLnJlcGxhY2UoLzsvZywgJztcXG4nKVxuICAgICAgLnJlcGxhY2UoL30vZywgJ31cXG4nKVxuICAgICAgLnJlcGxhY2UoL3svZywgJ3tcXG4nKVxuICAgIHZhciBwcm9jID0gRnVuY3Rpb24uYXBwbHkobnVsbCwgbGlua2VkTmFtZXMuY29uY2F0KHNyYykpXG4gICAgcmV0dXJuIHByb2MuYXBwbHkobnVsbCwgbGlua2VkVmFsdWVzKVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBnbG9iYWw6IGdsb2JhbEJsb2NrLFxuICAgIGxpbms6IGxpbmssXG4gICAgYmxvY2s6IGJsb2NrLFxuICAgIHByb2M6IHByb2MsXG4gICAgc2NvcGU6IHNjb3BlLFxuICAgIGNvbmQ6IGNvbmRpdGlvbmFsLFxuICAgIGNvbXBpbGU6IGNvbXBpbGVcbiAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoYmFzZSwgb3B0cykge1xuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKG9wdHMpXG4gIGZvciAodmFyIGkgPSAwOyBpIDwga2V5cy5sZW5ndGg7ICsraSkge1xuICAgIGJhc2Vba2V5c1tpXV0gPSBvcHRzW2tleXNbaV1dXG4gIH1cbiAgcmV0dXJuIGJhc2Vcbn1cbiIsInZhciBwb29sID0gcmVxdWlyZSgnLi9wb29sJylcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHNoYXBlOiBhcnJheVNoYXBlLFxuICBmbGF0dGVuOiBmbGF0dGVuQXJyYXlcbn1cblxuZnVuY3Rpb24gZmxhdHRlbjFEIChhcnJheSwgbngsIG91dCkge1xuICBmb3IgKHZhciBpID0gMDsgaSA8IG54OyArK2kpIHtcbiAgICBvdXRbaV0gPSBhcnJheVtpXVxuICB9XG59XG5cbmZ1bmN0aW9uIGZsYXR0ZW4yRCAoYXJyYXksIG54LCBueSwgb3V0KSB7XG4gIHZhciBwdHIgPSAwXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbng7ICsraSkge1xuICAgIHZhciByb3cgPSBhcnJheVtpXVxuICAgIGZvciAodmFyIGogPSAwOyBqIDwgbnk7ICsraikge1xuICAgICAgb3V0W3B0cisrXSA9IHJvd1tqXVxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBmbGF0dGVuM0QgKGFycmF5LCBueCwgbnksIG56LCBvdXQsIHB0cl8pIHtcbiAgdmFyIHB0ciA9IHB0cl9cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBueDsgKytpKSB7XG4gICAgdmFyIHJvdyA9IGFycmF5W2ldXG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBueTsgKytqKSB7XG4gICAgICB2YXIgY29sID0gcm93W2pdXG4gICAgICBmb3IgKHZhciBrID0gMDsgayA8IG56OyArK2spIHtcbiAgICAgICAgb3V0W3B0cisrXSA9IGNvbFtrXVxuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBmbGF0dGVuUmVjIChhcnJheSwgc2hhcGUsIGxldmVsLCBvdXQsIHB0cikge1xuICB2YXIgc3RyaWRlID0gMVxuICBmb3IgKHZhciBpID0gbGV2ZWwgKyAxOyBpIDwgc2hhcGUubGVuZ3RoOyArK2kpIHtcbiAgICBzdHJpZGUgKj0gc2hhcGVbaV1cbiAgfVxuICB2YXIgbiA9IHNoYXBlW2xldmVsXVxuICBpZiAoc2hhcGUubGVuZ3RoIC0gbGV2ZWwgPT09IDQpIHtcbiAgICB2YXIgbnggPSBzaGFwZVtsZXZlbCArIDFdXG4gICAgdmFyIG55ID0gc2hhcGVbbGV2ZWwgKyAyXVxuICAgIHZhciBueiA9IHNoYXBlW2xldmVsICsgM11cbiAgICBmb3IgKGkgPSAwOyBpIDwgbjsgKytpKSB7XG4gICAgICBmbGF0dGVuM0QoYXJyYXlbaV0sIG54LCBueSwgbnosIG91dCwgcHRyKVxuICAgICAgcHRyICs9IHN0cmlkZVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBmb3IgKGkgPSAwOyBpIDwgbjsgKytpKSB7XG4gICAgICBmbGF0dGVuUmVjKGFycmF5W2ldLCBzaGFwZSwgbGV2ZWwgKyAxLCBvdXQsIHB0cilcbiAgICAgIHB0ciArPSBzdHJpZGVcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gZmxhdHRlbkFycmF5IChhcnJheSwgc2hhcGUsIHR5cGUsIG91dF8pIHtcbiAgdmFyIHN6ID0gMVxuICBpZiAoc2hhcGUubGVuZ3RoKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzaGFwZS5sZW5ndGg7ICsraSkge1xuICAgICAgc3ogKj0gc2hhcGVbaV1cbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgc3ogPSAwXG4gIH1cbiAgdmFyIG91dCA9IG91dF8gfHwgcG9vbC5hbGxvY1R5cGUodHlwZSwgc3opXG4gIHN3aXRjaCAoc2hhcGUubGVuZ3RoKSB7XG4gICAgY2FzZSAwOlxuICAgICAgYnJlYWtcbiAgICBjYXNlIDE6XG4gICAgICBmbGF0dGVuMUQoYXJyYXksIHNoYXBlWzBdLCBvdXQpXG4gICAgICBicmVha1xuICAgIGNhc2UgMjpcbiAgICAgIGZsYXR0ZW4yRChhcnJheSwgc2hhcGVbMF0sIHNoYXBlWzFdLCBvdXQpXG4gICAgICBicmVha1xuICAgIGNhc2UgMzpcbiAgICAgIGZsYXR0ZW4zRChhcnJheSwgc2hhcGVbMF0sIHNoYXBlWzFdLCBzaGFwZVsyXSwgb3V0LCAwKVxuICAgICAgYnJlYWtcbiAgICBkZWZhdWx0OlxuICAgICAgZmxhdHRlblJlYyhhcnJheSwgc2hhcGUsIDAsIG91dCwgMClcbiAgfVxuICByZXR1cm4gb3V0XG59XG5cbmZ1bmN0aW9uIGFycmF5U2hhcGUgKGFycmF5Xykge1xuICB2YXIgc2hhcGUgPSBbXVxuICBmb3IgKHZhciBhcnJheSA9IGFycmF5XzsgYXJyYXkubGVuZ3RoOyBhcnJheSA9IGFycmF5WzBdKSB7XG4gICAgc2hhcGUucHVzaChhcnJheS5sZW5ndGgpXG4gIH1cbiAgcmV0dXJuIHNoYXBlXG59XG4iLCJ2YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi9pcy10eXBlZC1hcnJheScpXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGlzQXJyYXlMaWtlIChzKSB7XG4gIHJldHVybiBBcnJheS5pc0FycmF5KHMpIHx8IGlzVHlwZWRBcnJheShzKVxufVxuIiwidmFyIGlzVHlwZWRBcnJheSA9IHJlcXVpcmUoJy4vaXMtdHlwZWQtYXJyYXknKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGlzTkRBcnJheUxpa2UgKG9iaikge1xuICByZXR1cm4gKFxuICAgICEhb2JqICYmXG4gICAgdHlwZW9mIG9iaiA9PT0gJ29iamVjdCcgJiZcbiAgICBBcnJheS5pc0FycmF5KG9iai5zaGFwZSkgJiZcbiAgICBBcnJheS5pc0FycmF5KG9iai5zdHJpZGUpICYmXG4gICAgdHlwZW9mIG9iai5vZmZzZXQgPT09ICdudW1iZXInICYmXG4gICAgb2JqLnNoYXBlLmxlbmd0aCA9PT0gb2JqLnN0cmlkZS5sZW5ndGggJiZcbiAgICAoQXJyYXkuaXNBcnJheShvYmouZGF0YSkgfHxcbiAgICAgIGlzVHlwZWRBcnJheShvYmouZGF0YSkpKVxufVxuIiwidmFyIGR0eXBlcyA9IHJlcXVpcmUoJy4uL2NvbnN0YW50cy9hcnJheXR5cGVzLmpzb24nKVxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoeCkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHgpIGluIGR0eXBlc1xufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBsb29wIChuLCBmKSB7XG4gIHZhciByZXN1bHQgPSBBcnJheShuKVxuICBmb3IgKHZhciBpID0gMDsgaSA8IG47ICsraSkge1xuICAgIHJlc3VsdFtpXSA9IGYoaSlcbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG4iLCJ2YXIgbG9vcCA9IHJlcXVpcmUoJy4vbG9vcCcpXG5cbnZhciBHTF9CWVRFID0gNTEyMFxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSA1MTIxXG52YXIgR0xfU0hPUlQgPSA1MTIyXG52YXIgR0xfVU5TSUdORURfU0hPUlQgPSA1MTIzXG52YXIgR0xfSU5UID0gNTEyNFxudmFyIEdMX1VOU0lHTkVEX0lOVCA9IDUxMjVcbnZhciBHTF9GTE9BVCA9IDUxMjZcblxudmFyIGJ1ZmZlclBvb2wgPSBsb29wKDgsIGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIFtdXG59KVxuXG5mdW5jdGlvbiBuZXh0UG93MTYgKHYpIHtcbiAgZm9yICh2YXIgaSA9IDE2OyBpIDw9ICgxIDw8IDI4KTsgaSAqPSAxNikge1xuICAgIGlmICh2IDw9IGkpIHtcbiAgICAgIHJldHVybiBpXG4gICAgfVxuICB9XG4gIHJldHVybiAwXG59XG5cbmZ1bmN0aW9uIGxvZzIgKHYpIHtcbiAgdmFyIHIsIHNoaWZ0XG4gIHIgPSAodiA+IDB4RkZGRikgPDwgNFxuICB2ID4+Pj0gclxuICBzaGlmdCA9ICh2ID4gMHhGRikgPDwgM1xuICB2ID4+Pj0gc2hpZnQ7IHIgfD0gc2hpZnRcbiAgc2hpZnQgPSAodiA+IDB4RikgPDwgMlxuICB2ID4+Pj0gc2hpZnQ7IHIgfD0gc2hpZnRcbiAgc2hpZnQgPSAodiA+IDB4MykgPDwgMVxuICB2ID4+Pj0gc2hpZnQ7IHIgfD0gc2hpZnRcbiAgcmV0dXJuIHIgfCAodiA+PiAxKVxufVxuXG5mdW5jdGlvbiBhbGxvYyAobikge1xuICB2YXIgc3ogPSBuZXh0UG93MTYobilcbiAgdmFyIGJpbiA9IGJ1ZmZlclBvb2xbbG9nMihzeikgPj4gMl1cbiAgaWYgKGJpbi5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIGJpbi5wb3AoKVxuICB9XG4gIHJldHVybiBuZXcgQXJyYXlCdWZmZXIoc3opXG59XG5cbmZ1bmN0aW9uIGZyZWUgKGJ1Zikge1xuICBidWZmZXJQb29sW2xvZzIoYnVmLmJ5dGVMZW5ndGgpID4+IDJdLnB1c2goYnVmKVxufVxuXG5mdW5jdGlvbiBhbGxvY1R5cGUgKHR5cGUsIG4pIHtcbiAgdmFyIHJlc3VsdCA9IG51bGxcbiAgc3dpdGNoICh0eXBlKSB7XG4gICAgY2FzZSBHTF9CWVRFOlxuICAgICAgcmVzdWx0ID0gbmV3IEludDhBcnJheShhbGxvYyhuKSwgMCwgbilcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9VTlNJR05FRF9CWVRFOlxuICAgICAgcmVzdWx0ID0gbmV3IFVpbnQ4QXJyYXkoYWxsb2MobiksIDAsIG4pXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfU0hPUlQ6XG4gICAgICByZXN1bHQgPSBuZXcgSW50MTZBcnJheShhbGxvYygyICogbiksIDAsIG4pXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlQ6XG4gICAgICByZXN1bHQgPSBuZXcgVWludDE2QXJyYXkoYWxsb2MoMiAqIG4pLCAwLCBuKVxuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX0lOVDpcbiAgICAgIHJlc3VsdCA9IG5ldyBJbnQzMkFycmF5KGFsbG9jKDQgKiBuKSwgMCwgbilcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9VTlNJR05FRF9JTlQ6XG4gICAgICByZXN1bHQgPSBuZXcgVWludDMyQXJyYXkoYWxsb2MoNCAqIG4pLCAwLCBuKVxuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX0ZMT0FUOlxuICAgICAgcmVzdWx0ID0gbmV3IEZsb2F0MzJBcnJheShhbGxvYyg0ICogbiksIDAsIG4pXG4gICAgICBicmVha1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gbnVsbFxuICB9XG4gIGlmIChyZXN1bHQubGVuZ3RoICE9PSBuKSB7XG4gICAgcmV0dXJuIHJlc3VsdC5zdWJhcnJheSgwLCBuKVxuICB9XG4gIHJldHVybiByZXN1bHRcbn1cblxuZnVuY3Rpb24gZnJlZVR5cGUgKGFycmF5KSB7XG4gIGZyZWUoYXJyYXkuYnVmZmVyKVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgYWxsb2M6IGFsbG9jLFxuICBmcmVlOiBmcmVlLFxuICBhbGxvY1R5cGU6IGFsbG9jVHlwZSxcbiAgZnJlZVR5cGU6IGZyZWVUeXBlXG59XG4iLCIvKiBnbG9iYWxzIHJlcXVlc3RBbmltYXRpb25GcmFtZSwgY2FuY2VsQW5pbWF0aW9uRnJhbWUgKi9cbm1vZHVsZS5leHBvcnRzID0ge1xuICBuZXh0OiB0eXBlb2YgcmVxdWVzdEFuaW1hdGlvbkZyYW1lID09PSAnZnVuY3Rpb24nXG4gICAgPyBmdW5jdGlvbiAoY2IpIHsgcmV0dXJuIHJlcXVlc3RBbmltYXRpb25GcmFtZShjYikgfVxuICAgIDogZnVuY3Rpb24gKGNiKSB7IHJldHVybiBzZXRUaW1lb3V0KGNiLCAxNikgfSxcbiAgY2FuY2VsOiB0eXBlb2YgY2FuY2VsQW5pbWF0aW9uRnJhbWUgPT09ICdmdW5jdGlvbidcbiAgICA/IGZ1bmN0aW9uIChyYWYpIHsgcmV0dXJuIGNhbmNlbEFuaW1hdGlvbkZyYW1lKHJhZikgfVxuICAgIDogY2xlYXJUaW1lb3V0XG59XG4iLCJ2YXIgcG9vbCA9IHJlcXVpcmUoJy4vcG9vbCcpXG5cbnZhciBGTE9BVCA9IG5ldyBGbG9hdDMyQXJyYXkoMSlcbnZhciBJTlQgPSBuZXcgVWludDMyQXJyYXkoRkxPQVQuYnVmZmVyKVxuXG52YXIgR0xfVU5TSUdORURfU0hPUlQgPSA1MTIzXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY29udmVydFRvSGFsZkZsb2F0IChhcnJheSkge1xuICB2YXIgdXNob3J0cyA9IHBvb2wuYWxsb2NUeXBlKEdMX1VOU0lHTkVEX1NIT1JULCBhcnJheS5sZW5ndGgpXG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnJheS5sZW5ndGg7ICsraSkge1xuICAgIGlmIChpc05hTihhcnJheVtpXSkpIHtcbiAgICAgIHVzaG9ydHNbaV0gPSAweGZmZmZcbiAgICB9IGVsc2UgaWYgKGFycmF5W2ldID09PSBJbmZpbml0eSkge1xuICAgICAgdXNob3J0c1tpXSA9IDB4N2MwMFxuICAgIH0gZWxzZSBpZiAoYXJyYXlbaV0gPT09IC1JbmZpbml0eSkge1xuICAgICAgdXNob3J0c1tpXSA9IDB4ZmMwMFxuICAgIH0gZWxzZSB7XG4gICAgICBGTE9BVFswXSA9IGFycmF5W2ldXG4gICAgICB2YXIgeCA9IElOVFswXVxuXG4gICAgICB2YXIgc2duID0gKHggPj4+IDMxKSA8PCAxNVxuICAgICAgdmFyIGV4cCA9ICgoeCA8PCAxKSA+Pj4gMjQpIC0gMTI3XG4gICAgICB2YXIgZnJhYyA9ICh4ID4+IDEzKSAmICgoMSA8PCAxMCkgLSAxKVxuXG4gICAgICBpZiAoZXhwIDwgLTI0KSB7XG4gICAgICAgIC8vIHJvdW5kIG5vbi1yZXByZXNlbnRhYmxlIGRlbm9ybWFscyB0byAwXG4gICAgICAgIHVzaG9ydHNbaV0gPSBzZ25cbiAgICAgIH0gZWxzZSBpZiAoZXhwIDwgLTE0KSB7XG4gICAgICAgIC8vIGhhbmRsZSBkZW5vcm1hbHNcbiAgICAgICAgdmFyIHMgPSAtMTQgLSBleHBcbiAgICAgICAgdXNob3J0c1tpXSA9IHNnbiArICgoZnJhYyArICgxIDw8IDEwKSkgPj4gcylcbiAgICAgIH0gZWxzZSBpZiAoZXhwID4gMTUpIHtcbiAgICAgICAgLy8gcm91bmQgb3ZlcmZsb3cgdG8gKy8tIEluZmluaXR5XG4gICAgICAgIHVzaG9ydHNbaV0gPSBzZ24gKyAweDdjMDBcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIG90aGVyd2lzZSBjb252ZXJ0IGRpcmVjdGx5XG4gICAgICAgIHVzaG9ydHNbaV0gPSBzZ24gKyAoKGV4cCArIDE1KSA8PCAxMCkgKyBmcmFjXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHVzaG9ydHNcbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKG9iaikge1xuICByZXR1cm4gT2JqZWN0LmtleXMob2JqKS5tYXAoZnVuY3Rpb24gKGtleSkgeyByZXR1cm4gb2JqW2tleV0gfSlcbn1cbiIsIi8vIENvbnRleHQgYW5kIGNhbnZhcyBjcmVhdGlvbiBoZWxwZXIgZnVuY3Rpb25zXG52YXIgY2hlY2sgPSByZXF1aXJlKCcuL3V0aWwvY2hlY2snKVxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vdXRpbC9leHRlbmQnKVxuXG5mdW5jdGlvbiBjcmVhdGVDYW52YXMgKGVsZW1lbnQsIG9uRG9uZSwgcGl4ZWxSYXRpbykge1xuICB2YXIgY2FudmFzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJylcbiAgZXh0ZW5kKGNhbnZhcy5zdHlsZSwge1xuICAgIGJvcmRlcjogMCxcbiAgICBtYXJnaW46IDAsXG4gICAgcGFkZGluZzogMCxcbiAgICB0b3A6IDAsXG4gICAgbGVmdDogMFxuICB9KVxuICBlbGVtZW50LmFwcGVuZENoaWxkKGNhbnZhcylcblxuICBpZiAoZWxlbWVudCA9PT0gZG9jdW1lbnQuYm9keSkge1xuICAgIGNhbnZhcy5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSdcbiAgICBleHRlbmQoZWxlbWVudC5zdHlsZSwge1xuICAgICAgbWFyZ2luOiAwLFxuICAgICAgcGFkZGluZzogMFxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiByZXNpemUgKCkge1xuICAgIHZhciB3ID0gd2luZG93LmlubmVyV2lkdGhcbiAgICB2YXIgaCA9IHdpbmRvdy5pbm5lckhlaWdodFxuICAgIGlmIChlbGVtZW50ICE9PSBkb2N1bWVudC5ib2R5KSB7XG4gICAgICB2YXIgYm91bmRzID0gZWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKVxuICAgICAgdyA9IGJvdW5kcy5yaWdodCAtIGJvdW5kcy5sZWZ0XG4gICAgICBoID0gYm91bmRzLmJvdHRvbSAtIGJvdW5kcy50b3BcbiAgICB9XG4gICAgY2FudmFzLndpZHRoID0gcGl4ZWxSYXRpbyAqIHdcbiAgICBjYW52YXMuaGVpZ2h0ID0gcGl4ZWxSYXRpbyAqIGhcbiAgICBleHRlbmQoY2FudmFzLnN0eWxlLCB7XG4gICAgICB3aWR0aDogdyArICdweCcsXG4gICAgICBoZWlnaHQ6IGggKyAncHgnXG4gICAgfSlcbiAgfVxuXG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdyZXNpemUnLCByZXNpemUsIGZhbHNlKVxuXG4gIGZ1bmN0aW9uIG9uRGVzdHJveSAoKSB7XG4gICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIHJlc2l6ZSlcbiAgICBlbGVtZW50LnJlbW92ZUNoaWxkKGNhbnZhcylcbiAgfVxuXG4gIHJlc2l6ZSgpXG5cbiAgcmV0dXJuIHtcbiAgICBjYW52YXM6IGNhbnZhcyxcbiAgICBvbkRlc3Ryb3k6IG9uRGVzdHJveVxuICB9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUNvbnRleHQgKGNhbnZhcywgY29udGV4QXR0cmlidXRlcykge1xuICBmdW5jdGlvbiBnZXQgKG5hbWUpIHtcbiAgICB0cnkge1xuICAgICAgcmV0dXJuIGNhbnZhcy5nZXRDb250ZXh0KG5hbWUsIGNvbnRleEF0dHJpYnV0ZXMpXG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG4gIH1cbiAgcmV0dXJuIChcbiAgICBnZXQoJ3dlYmdsJykgfHxcbiAgICBnZXQoJ2V4cGVyaW1lbnRhbC13ZWJnbCcpIHx8XG4gICAgZ2V0KCd3ZWJnbC1leHBlcmltZW50YWwnKVxuICApXG59XG5cbmZ1bmN0aW9uIGlzSFRNTEVsZW1lbnQgKG9iaikge1xuICByZXR1cm4gKFxuICAgIHR5cGVvZiBvYmoubm9kZU5hbWUgPT09ICdzdHJpbmcnICYmXG4gICAgdHlwZW9mIG9iai5hcHBlbmRDaGlsZCA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgIHR5cGVvZiBvYmouZ2V0Qm91bmRpbmdDbGllbnRSZWN0ID09PSAnZnVuY3Rpb24nXG4gIClcbn1cblxuZnVuY3Rpb24gaXNXZWJHTENvbnRleHQgKG9iaikge1xuICByZXR1cm4gKFxuICAgIHR5cGVvZiBvYmouZHJhd0FycmF5cyA9PT0gJ2Z1bmN0aW9uJyB8fFxuICAgIHR5cGVvZiBvYmouZHJhd0VsZW1lbnRzID09PSAnZnVuY3Rpb24nXG4gIClcbn1cblxuZnVuY3Rpb24gcGFyc2VFeHRlbnNpb25zIChpbnB1dCkge1xuICBpZiAodHlwZW9mIGlucHV0ID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBpbnB1dC5zcGxpdCgpXG4gIH1cbiAgY2hlY2soQXJyYXkuaXNBcnJheShpbnB1dCksICdpbnZhbGlkIGV4dGVuc2lvbiBhcnJheScpXG4gIHJldHVybiBpbnB1dFxufVxuXG5mdW5jdGlvbiBnZXRFbGVtZW50IChkZXNjKSB7XG4gIGlmICh0eXBlb2YgZGVzYyA9PT0gJ3N0cmluZycpIHtcbiAgICBjaGVjayh0eXBlb2YgZG9jdW1lbnQgIT09ICd1bmRlZmluZWQnLCAnbm90IHN1cHBvcnRlZCBvdXRzaWRlIG9mIERPTScpXG4gICAgcmV0dXJuIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoZGVzYylcbiAgfVxuICByZXR1cm4gZGVzY1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHBhcnNlQXJncyAoYXJnc18pIHtcbiAgdmFyIGFyZ3MgPSBhcmdzXyB8fCB7fVxuICB2YXIgZWxlbWVudCwgY29udGFpbmVyLCBjYW52YXMsIGdsXG4gIHZhciBjb250ZXh0QXR0cmlidXRlcyA9IHt9XG4gIHZhciBleHRlbnNpb25zID0gW11cbiAgdmFyIG9wdGlvbmFsRXh0ZW5zaW9ucyA9IFtdXG4gIHZhciBwaXhlbFJhdGlvID0gKHR5cGVvZiB3aW5kb3cgPT09ICd1bmRlZmluZWQnID8gMSA6IHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvKVxuICB2YXIgcHJvZmlsZSA9IGZhbHNlXG4gIHZhciBvbkRvbmUgPSBmdW5jdGlvbiAoZXJyKSB7XG4gICAgaWYgKGVycikge1xuICAgICAgY2hlY2sucmFpc2UoZXJyKVxuICAgIH1cbiAgfVxuICB2YXIgb25EZXN0cm95ID0gZnVuY3Rpb24gKCkge31cbiAgaWYgKHR5cGVvZiBhcmdzID09PSAnc3RyaW5nJykge1xuICAgIGNoZWNrKFxuICAgICAgdHlwZW9mIGRvY3VtZW50ICE9PSAndW5kZWZpbmVkJyxcbiAgICAgICdzZWxlY3RvciBxdWVyaWVzIG9ubHkgc3VwcG9ydGVkIGluIERPTSBlbnZpcm9tZW50cycpXG4gICAgZWxlbWVudCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYXJncylcbiAgICBjaGVjayhlbGVtZW50LCAnaW52YWxpZCBxdWVyeSBzdHJpbmcgZm9yIGVsZW1lbnQnKVxuICB9IGVsc2UgaWYgKHR5cGVvZiBhcmdzID09PSAnb2JqZWN0Jykge1xuICAgIGlmIChpc0hUTUxFbGVtZW50KGFyZ3MpKSB7XG4gICAgICBlbGVtZW50ID0gYXJnc1xuICAgIH0gZWxzZSBpZiAoaXNXZWJHTENvbnRleHQoYXJncykpIHtcbiAgICAgIGdsID0gYXJnc1xuICAgICAgY2FudmFzID0gZ2wuY2FudmFzXG4gICAgfSBlbHNlIHtcbiAgICAgIGNoZWNrLmNvbnN0cnVjdG9yKGFyZ3MpXG4gICAgICBpZiAoJ2dsJyBpbiBhcmdzKSB7XG4gICAgICAgIGdsID0gYXJncy5nbFxuICAgICAgfSBlbHNlIGlmICgnY2FudmFzJyBpbiBhcmdzKSB7XG4gICAgICAgIGNhbnZhcyA9IGdldEVsZW1lbnQoYXJncy5jYW52YXMpXG4gICAgICB9IGVsc2UgaWYgKCdjb250YWluZXInIGluIGFyZ3MpIHtcbiAgICAgICAgY29udGFpbmVyID0gZ2V0RWxlbWVudChhcmdzLmNvbnRhaW5lcilcbiAgICAgIH1cbiAgICAgIGlmICgnYXR0cmlidXRlcycgaW4gYXJncykge1xuICAgICAgICBjb250ZXh0QXR0cmlidXRlcyA9IGFyZ3MuYXR0cmlidXRlc1xuICAgICAgICBjaGVjay50eXBlKGNvbnRleHRBdHRyaWJ1dGVzLCAnb2JqZWN0JywgJ2ludmFsaWQgY29udGV4dCBhdHRyaWJ1dGVzJylcbiAgICAgIH1cbiAgICAgIGlmICgnZXh0ZW5zaW9ucycgaW4gYXJncykge1xuICAgICAgICBleHRlbnNpb25zID0gcGFyc2VFeHRlbnNpb25zKGFyZ3MuZXh0ZW5zaW9ucylcbiAgICAgIH1cbiAgICAgIGlmICgnb3B0aW9uYWxFeHRlbnNpb25zJyBpbiBhcmdzKSB7XG4gICAgICAgIG9wdGlvbmFsRXh0ZW5zaW9ucyA9IHBhcnNlRXh0ZW5zaW9ucyhhcmdzLm9wdGlvbmFsRXh0ZW5zaW9ucylcbiAgICAgIH1cbiAgICAgIGlmICgnb25Eb25lJyBpbiBhcmdzKSB7XG4gICAgICAgIGNoZWNrLnR5cGUoXG4gICAgICAgICAgYXJncy5vbkRvbmUsICdmdW5jdGlvbicsXG4gICAgICAgICAgJ2ludmFsaWQgb3IgbWlzc2luZyBvbkRvbmUgY2FsbGJhY2snKVxuICAgICAgICBvbkRvbmUgPSBhcmdzLm9uRG9uZVxuICAgICAgfVxuICAgICAgaWYgKCdwcm9maWxlJyBpbiBhcmdzKSB7XG4gICAgICAgIHByb2ZpbGUgPSAhIWFyZ3MucHJvZmlsZVxuICAgICAgfVxuICAgICAgaWYgKCdwaXhlbFJhdGlvJyBpbiBhcmdzKSB7XG4gICAgICAgIHBpeGVsUmF0aW8gPSArYXJncy5waXhlbFJhdGlvXG4gICAgICAgIGNoZWNrKHBpeGVsUmF0aW8gPiAwLCAnaW52YWxpZCBwaXhlbCByYXRpbycpXG4gICAgICB9XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGNoZWNrLnJhaXNlKCdpbnZhbGlkIGFyZ3VtZW50cyB0byByZWdsJylcbiAgfVxuXG4gIGlmIChlbGVtZW50KSB7XG4gICAgaWYgKGVsZW1lbnQubm9kZU5hbWUudG9Mb3dlckNhc2UoKSA9PT0gJ2NhbnZhcycpIHtcbiAgICAgIGNhbnZhcyA9IGVsZW1lbnRcbiAgICB9IGVsc2Uge1xuICAgICAgY29udGFpbmVyID0gZWxlbWVudFxuICAgIH1cbiAgfVxuXG4gIGlmICghZ2wpIHtcbiAgICBpZiAoIWNhbnZhcykge1xuICAgICAgY2hlY2soXG4gICAgICAgIHR5cGVvZiBkb2N1bWVudCAhPT0gJ3VuZGVmaW5lZCcsXG4gICAgICAgICdtdXN0IG1hbnVhbGx5IHNwZWNpZnkgd2ViZ2wgY29udGV4dCBvdXRzaWRlIG9mIERPTSBlbnZpcm9ubWVudHMnKVxuICAgICAgdmFyIHJlc3VsdCA9IGNyZWF0ZUNhbnZhcyhjb250YWluZXIgfHwgZG9jdW1lbnQuYm9keSwgb25Eb25lLCBwaXhlbFJhdGlvKVxuICAgICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgICAgcmV0dXJuIG51bGxcbiAgICAgIH1cbiAgICAgIGNhbnZhcyA9IHJlc3VsdC5jYW52YXNcbiAgICAgIG9uRGVzdHJveSA9IHJlc3VsdC5vbkRlc3Ryb3lcbiAgICB9XG4gICAgZ2wgPSBjcmVhdGVDb250ZXh0KGNhbnZhcywgY29udGV4dEF0dHJpYnV0ZXMpXG4gIH1cblxuICBpZiAoIWdsKSB7XG4gICAgb25EZXN0cm95KClcbiAgICBvbkRvbmUoJ3dlYmdsIG5vdCBzdXBwb3J0ZWQsIHRyeSB1cGdyYWRpbmcgeW91ciBicm93c2VyIG9yIGdyYXBoaWNzIGRyaXZlcnMgaHR0cDovL2dldC53ZWJnbC5vcmcnKVxuICAgIHJldHVybiBudWxsXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGdsOiBnbCxcbiAgICBjYW52YXM6IGNhbnZhcyxcbiAgICBjb250YWluZXI6IGNvbnRhaW5lcixcbiAgICBleHRlbnNpb25zOiBleHRlbnNpb25zLFxuICAgIG9wdGlvbmFsRXh0ZW5zaW9uczogb3B0aW9uYWxFeHRlbnNpb25zLFxuICAgIHBpeGVsUmF0aW86IHBpeGVsUmF0aW8sXG4gICAgcHJvZmlsZTogcHJvZmlsZSxcbiAgICBvbkRvbmU6IG9uRG9uZSxcbiAgICBvbkRlc3Ryb3k6IG9uRGVzdHJveVxuICB9XG59XG4iLCIndXNlIHN0cmljdCdcblxubW9kdWxlLmV4cG9ydHMgPSBtb3VzZUxpc3RlblxuXG52YXIgbW91c2UgPSByZXF1aXJlKCdtb3VzZS1ldmVudCcpXG5cbmZ1bmN0aW9uIG1vdXNlTGlzdGVuKGVsZW1lbnQsIGNhbGxiYWNrKSB7XG4gIGlmKCFjYWxsYmFjaykge1xuICAgIGNhbGxiYWNrID0gZWxlbWVudFxuICAgIGVsZW1lbnQgPSB3aW5kb3dcbiAgfVxuXG4gIHZhciBidXR0b25TdGF0ZSA9IDBcbiAgdmFyIHggPSAwXG4gIHZhciB5ID0gMFxuICB2YXIgbW9kcyA9IHtcbiAgICBzaGlmdDogICBmYWxzZSxcbiAgICBhbHQ6ICAgICBmYWxzZSxcbiAgICBjb250cm9sOiBmYWxzZSxcbiAgICBtZXRhOiAgICBmYWxzZVxuICB9XG4gIHZhciBhdHRhY2hlZCA9IGZhbHNlXG5cbiAgZnVuY3Rpb24gdXBkYXRlTW9kcyhldikge1xuICAgIHZhciBjaGFuZ2VkID0gZmFsc2VcbiAgICBpZignYWx0S2V5JyBpbiBldikge1xuICAgICAgY2hhbmdlZCA9IGNoYW5nZWQgfHwgZXYuYWx0S2V5ICE9PSBtb2RzLmFsdFxuICAgICAgbW9kcy5hbHQgPSAhIWV2LmFsdEtleVxuICAgIH1cbiAgICBpZignc2hpZnRLZXknIGluIGV2KSB7XG4gICAgICBjaGFuZ2VkID0gY2hhbmdlZCB8fCBldi5zaGlmdEtleSAhPT0gbW9kcy5zaGlmdFxuICAgICAgbW9kcy5zaGlmdCA9ICEhZXYuc2hpZnRLZXlcbiAgICB9XG4gICAgaWYoJ2N0cmxLZXknIGluIGV2KSB7XG4gICAgICBjaGFuZ2VkID0gY2hhbmdlZCB8fCBldi5jdHJsS2V5ICE9PSBtb2RzLmNvbnRyb2xcbiAgICAgIG1vZHMuY29udHJvbCA9ICEhZXYuY3RybEtleVxuICAgIH1cbiAgICBpZignbWV0YUtleScgaW4gZXYpIHtcbiAgICAgIGNoYW5nZWQgPSBjaGFuZ2VkIHx8IGV2Lm1ldGFLZXkgIT09IG1vZHMubWV0YVxuICAgICAgbW9kcy5tZXRhID0gISFldi5tZXRhS2V5XG4gICAgfVxuICAgIHJldHVybiBjaGFuZ2VkXG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVFdmVudChuZXh0QnV0dG9ucywgZXYpIHtcbiAgICB2YXIgbmV4dFggPSBtb3VzZS54KGV2KVxuICAgIHZhciBuZXh0WSA9IG1vdXNlLnkoZXYpXG4gICAgaWYoJ2J1dHRvbnMnIGluIGV2KSB7XG4gICAgICBuZXh0QnV0dG9ucyA9IGV2LmJ1dHRvbnN8MFxuICAgIH1cbiAgICBpZihuZXh0QnV0dG9ucyAhPT0gYnV0dG9uU3RhdGUgfHxcbiAgICAgICBuZXh0WCAhPT0geCB8fFxuICAgICAgIG5leHRZICE9PSB5IHx8XG4gICAgICAgdXBkYXRlTW9kcyhldikpIHtcbiAgICAgIGJ1dHRvblN0YXRlID0gbmV4dEJ1dHRvbnN8MFxuICAgICAgeCA9IG5leHRYfHwwXG4gICAgICB5ID0gbmV4dFl8fDBcbiAgICAgIGNhbGxiYWNrICYmIGNhbGxiYWNrKGJ1dHRvblN0YXRlLCB4LCB5LCBtb2RzKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNsZWFyU3RhdGUoZXYpIHtcbiAgICBoYW5kbGVFdmVudCgwLCBldilcbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZUJsdXIoKSB7XG4gICAgaWYoYnV0dG9uU3RhdGUgfHxcbiAgICAgIHggfHxcbiAgICAgIHkgfHxcbiAgICAgIG1vZHMuc2hpZnQgfHxcbiAgICAgIG1vZHMuYWx0IHx8XG4gICAgICBtb2RzLm1ldGEgfHxcbiAgICAgIG1vZHMuY29udHJvbCkge1xuXG4gICAgICB4ID0geSA9IDBcbiAgICAgIGJ1dHRvblN0YXRlID0gMFxuICAgICAgbW9kcy5zaGlmdCA9IG1vZHMuYWx0ID0gbW9kcy5jb250cm9sID0gbW9kcy5tZXRhID0gZmFsc2VcbiAgICAgIGNhbGxiYWNrICYmIGNhbGxiYWNrKDAsIDAsIDAsIG1vZHMpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaGFuZGxlTW9kcyhldikge1xuICAgIGlmKHVwZGF0ZU1vZHMoZXYpKSB7XG4gICAgICBjYWxsYmFjayAmJiBjYWxsYmFjayhidXR0b25TdGF0ZSwgeCwgeSwgbW9kcylcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVNb3VzZU1vdmUoZXYpIHtcbiAgICBpZihtb3VzZS5idXR0b25zKGV2KSA9PT0gMCkge1xuICAgICAgaGFuZGxlRXZlbnQoMCwgZXYpXG4gICAgfSBlbHNlIHtcbiAgICAgIGhhbmRsZUV2ZW50KGJ1dHRvblN0YXRlLCBldilcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVNb3VzZURvd24oZXYpIHtcbiAgICBoYW5kbGVFdmVudChidXR0b25TdGF0ZSB8IG1vdXNlLmJ1dHRvbnMoZXYpLCBldilcbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZU1vdXNlVXAoZXYpIHtcbiAgICBoYW5kbGVFdmVudChidXR0b25TdGF0ZSAmIH5tb3VzZS5idXR0b25zKGV2KSwgZXYpXG4gIH1cblxuICBmdW5jdGlvbiBhdHRhY2hMaXN0ZW5lcnMoKSB7XG4gICAgaWYoYXR0YWNoZWQpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBhdHRhY2hlZCA9IHRydWVcblxuICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgaGFuZGxlTW91c2VNb3ZlKVxuXG4gICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCBoYW5kbGVNb3VzZURvd24pXG5cbiAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNldXAnLCBoYW5kbGVNb3VzZVVwKVxuXG4gICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWxlYXZlJywgY2xlYXJTdGF0ZSlcbiAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZW50ZXInLCBjbGVhclN0YXRlKVxuICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VvdXQnLCBjbGVhclN0YXRlKVxuICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VvdmVyJywgY2xlYXJTdGF0ZSlcblxuICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignYmx1cicsIGhhbmRsZUJsdXIpXG5cbiAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXVwJywgaGFuZGxlTW9kcylcbiAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBoYW5kbGVNb2RzKVxuICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5cHJlc3MnLCBoYW5kbGVNb2RzKVxuXG4gICAgaWYoZWxlbWVudCAhPT0gd2luZG93KSB7XG4gICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignYmx1cicsIGhhbmRsZUJsdXIpXG5cbiAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXl1cCcsIGhhbmRsZU1vZHMpXG4gICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIGhhbmRsZU1vZHMpXG4gICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5cHJlc3MnLCBoYW5kbGVNb2RzKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGRldGFjaExpc3RlbmVycygpIHtcbiAgICBpZighYXR0YWNoZWQpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBhdHRhY2hlZCA9IGZhbHNlXG5cbiAgICBlbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIGhhbmRsZU1vdXNlTW92ZSlcblxuICAgIGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgaGFuZGxlTW91c2VEb3duKVxuXG4gICAgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZXVwJywgaGFuZGxlTW91c2VVcClcblxuICAgIGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW91c2VsZWF2ZScsIGNsZWFyU3RhdGUpXG4gICAgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZWVudGVyJywgY2xlYXJTdGF0ZSlcbiAgICBlbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNlb3V0JywgY2xlYXJTdGF0ZSlcbiAgICBlbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNlb3ZlcicsIGNsZWFyU3RhdGUpXG5cbiAgICBlbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2JsdXInLCBoYW5kbGVCbHVyKVxuXG4gICAgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdrZXl1cCcsIGhhbmRsZU1vZHMpXG4gICAgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdrZXlkb3duJywgaGFuZGxlTW9kcylcbiAgICBlbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleXByZXNzJywgaGFuZGxlTW9kcylcblxuICAgIGlmKGVsZW1lbnQgIT09IHdpbmRvdykge1xuICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2JsdXInLCBoYW5kbGVCbHVyKVxuXG4gICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigna2V5dXAnLCBoYW5kbGVNb2RzKVxuICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBoYW5kbGVNb2RzKVxuICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleXByZXNzJywgaGFuZGxlTW9kcylcbiAgICB9XG4gIH1cblxuICAvL0F0dGFjaCBsaXN0ZW5lcnNcbiAgYXR0YWNoTGlzdGVuZXJzKClcblxuICB2YXIgcmVzdWx0ID0ge1xuICAgIGVsZW1lbnQ6IGVsZW1lbnRcbiAgfVxuXG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzKHJlc3VsdCwge1xuICAgIGVuYWJsZWQ6IHtcbiAgICAgIGdldDogZnVuY3Rpb24oKSB7IHJldHVybiBhdHRhY2hlZCB9LFxuICAgICAgc2V0OiBmdW5jdGlvbihmKSB7XG4gICAgICAgIGlmKGYpIHtcbiAgICAgICAgICBhdHRhY2hMaXN0ZW5lcnMoKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGRldGFjaExpc3RlbmVyc1xuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgZW51bWVyYWJsZTogdHJ1ZVxuICAgIH0sXG4gICAgYnV0dG9uczoge1xuICAgICAgZ2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIGJ1dHRvblN0YXRlIH0sXG4gICAgICBlbnVtZXJhYmxlOiB0cnVlXG4gICAgfSxcbiAgICB4OiB7XG4gICAgICBnZXQ6IGZ1bmN0aW9uKCkgeyByZXR1cm4geCB9LFxuICAgICAgZW51bWVyYWJsZTogdHJ1ZVxuICAgIH0sXG4gICAgeToge1xuICAgICAgZ2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIHkgfSxcbiAgICAgIGVudW1lcmFibGU6IHRydWVcbiAgICB9LFxuICAgIG1vZHM6IHtcbiAgICAgIGdldDogZnVuY3Rpb24oKSB7IHJldHVybiBtb2RzIH0sXG4gICAgICBlbnVtZXJhYmxlOiB0cnVlXG4gICAgfVxuICB9KVxuXG4gIHJldHVybiByZXN1bHRcbn1cbiIsIid1c2Ugc3RyaWN0J1xuXG5mdW5jdGlvbiBtb3VzZUJ1dHRvbnMoZXYpIHtcbiAgaWYodHlwZW9mIGV2ID09PSAnb2JqZWN0Jykge1xuICAgIGlmKCdidXR0b25zJyBpbiBldikge1xuICAgICAgcmV0dXJuIGV2LmJ1dHRvbnNcbiAgICB9IGVsc2UgaWYoJ3doaWNoJyBpbiBldikge1xuICAgICAgdmFyIGIgPSBldi53aGljaFxuICAgICAgaWYoYiA9PT0gMikge1xuICAgICAgICByZXR1cm4gNFxuICAgICAgfSBlbHNlIGlmKGIgPT09IDMpIHtcbiAgICAgICAgcmV0dXJuIDJcbiAgICAgIH0gZWxzZSBpZihiID4gMCkge1xuICAgICAgICByZXR1cm4gMTw8KGItMSlcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYoJ2J1dHRvbicgaW4gZXYpIHtcbiAgICAgIHZhciBiID0gZXYuYnV0dG9uXG4gICAgICBpZihiID09PSAxKSB7XG4gICAgICAgIHJldHVybiA0XG4gICAgICB9IGVsc2UgaWYoYiA9PT0gMikge1xuICAgICAgICByZXR1cm4gMlxuICAgICAgfSBlbHNlIGlmKGIgPj0gMCkge1xuICAgICAgICByZXR1cm4gMTw8YlxuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gMFxufVxuZXhwb3J0cy5idXR0b25zID0gbW91c2VCdXR0b25zXG5cbmZ1bmN0aW9uIG1vdXNlRWxlbWVudChldikge1xuICByZXR1cm4gZXYudGFyZ2V0IHx8IGV2LnNyY0VsZW1lbnQgfHwgd2luZG93XG59XG5leHBvcnRzLmVsZW1lbnQgPSBtb3VzZUVsZW1lbnRcblxuZnVuY3Rpb24gbW91c2VSZWxhdGl2ZVgoZXYpIHtcbiAgaWYodHlwZW9mIGV2ID09PSAnb2JqZWN0Jykge1xuICAgIGlmKCdvZmZzZXRYJyBpbiBldikge1xuICAgICAgcmV0dXJuIGV2Lm9mZnNldFhcbiAgICB9XG4gICAgdmFyIHRhcmdldCA9IG1vdXNlRWxlbWVudChldilcbiAgICB2YXIgYm91bmRzID0gdGFyZ2V0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpXG4gICAgcmV0dXJuIGV2LmNsaWVudFggLSBib3VuZHMubGVmdFxuICB9XG4gIHJldHVybiAwXG59XG5leHBvcnRzLnggPSBtb3VzZVJlbGF0aXZlWFxuXG5mdW5jdGlvbiBtb3VzZVJlbGF0aXZlWShldikge1xuICBpZih0eXBlb2YgZXYgPT09ICdvYmplY3QnKSB7XG4gICAgaWYoJ29mZnNldFknIGluIGV2KSB7XG4gICAgICByZXR1cm4gZXYub2Zmc2V0WVxuICAgIH1cbiAgICB2YXIgdGFyZ2V0ID0gbW91c2VFbGVtZW50KGV2KVxuICAgIHZhciBib3VuZHMgPSB0YXJnZXQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KClcbiAgICByZXR1cm4gZXYuY2xpZW50WSAtIGJvdW5kcy50b3BcbiAgfVxuICByZXR1cm4gMFxufVxuZXhwb3J0cy55ID0gbW91c2VSZWxhdGl2ZVlcbiIsInZhciBjaGVjayA9IHJlcXVpcmUoJy4vbGliL3V0aWwvY2hlY2snKVxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vbGliL3V0aWwvZXh0ZW5kJylcbnZhciBkeW5hbWljID0gcmVxdWlyZSgnLi9saWIvZHluYW1pYycpXG52YXIgcmFmID0gcmVxdWlyZSgnLi9saWIvdXRpbC9yYWYnKVxudmFyIGNsb2NrID0gcmVxdWlyZSgnLi9saWIvdXRpbC9jbG9jaycpXG52YXIgY3JlYXRlU3RyaW5nU3RvcmUgPSByZXF1aXJlKCcuL2xpYi9zdHJpbmdzJylcbnZhciBpbml0V2ViR0wgPSByZXF1aXJlKCcuL2xpYi93ZWJnbCcpXG52YXIgd3JhcEV4dGVuc2lvbnMgPSByZXF1aXJlKCcuL2xpYi9leHRlbnNpb24nKVxudmFyIHdyYXBMaW1pdHMgPSByZXF1aXJlKCcuL2xpYi9saW1pdHMnKVxudmFyIHdyYXBCdWZmZXJzID0gcmVxdWlyZSgnLi9saWIvYnVmZmVyJylcbnZhciB3cmFwRWxlbWVudHMgPSByZXF1aXJlKCcuL2xpYi9lbGVtZW50cycpXG52YXIgd3JhcFRleHR1cmVzID0gcmVxdWlyZSgnLi9saWIvdGV4dHVyZScpXG52YXIgd3JhcFJlbmRlcmJ1ZmZlcnMgPSByZXF1aXJlKCcuL2xpYi9yZW5kZXJidWZmZXInKVxudmFyIHdyYXBGcmFtZWJ1ZmZlcnMgPSByZXF1aXJlKCcuL2xpYi9mcmFtZWJ1ZmZlcicpXG52YXIgd3JhcEF0dHJpYnV0ZXMgPSByZXF1aXJlKCcuL2xpYi9hdHRyaWJ1dGUnKVxudmFyIHdyYXBTaGFkZXJzID0gcmVxdWlyZSgnLi9saWIvc2hhZGVyJylcbnZhciB3cmFwUmVhZCA9IHJlcXVpcmUoJy4vbGliL3JlYWQnKVxudmFyIGNyZWF0ZUNvcmUgPSByZXF1aXJlKCcuL2xpYi9jb3JlJylcbnZhciBjcmVhdGVTdGF0cyA9IHJlcXVpcmUoJy4vbGliL3N0YXRzJylcbnZhciBjcmVhdGVUaW1lciA9IHJlcXVpcmUoJy4vbGliL3RpbWVyJylcblxudmFyIEdMX0NPTE9SX0JVRkZFUl9CSVQgPSAxNjM4NFxudmFyIEdMX0RFUFRIX0JVRkZFUl9CSVQgPSAyNTZcbnZhciBHTF9TVEVOQ0lMX0JVRkZFUl9CSVQgPSAxMDI0XG5cbnZhciBHTF9BUlJBWV9CVUZGRVIgPSAzNDk2MlxuXG52YXIgQ09OVEVYVF9MT1NUX0VWRU5UID0gJ3dlYmdsY29udGV4dGxvc3QnXG52YXIgQ09OVEVYVF9SRVNUT1JFRF9FVkVOVCA9ICd3ZWJnbGNvbnRleHRyZXN0b3JlZCdcblxudmFyIERZTl9QUk9QID0gMVxudmFyIERZTl9DT05URVhUID0gMlxudmFyIERZTl9TVEFURSA9IDNcblxuZnVuY3Rpb24gZmluZCAoaGF5c3RhY2ssIG5lZWRsZSkge1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGhheXN0YWNrLmxlbmd0aDsgKytpKSB7XG4gICAgaWYgKGhheXN0YWNrW2ldID09PSBuZWVkbGUpIHtcbiAgICAgIHJldHVybiBpXG4gICAgfVxuICB9XG4gIHJldHVybiAtMVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBSRUdMIChhcmdzKSB7XG4gIHZhciBjb25maWcgPSBpbml0V2ViR0woYXJncylcbiAgaWYgKCFjb25maWcpIHtcbiAgICByZXR1cm4gbnVsbFxuICB9XG5cbiAgdmFyIGdsID0gY29uZmlnLmdsXG4gIHZhciBnbEF0dHJpYnV0ZXMgPSBnbC5nZXRDb250ZXh0QXR0cmlidXRlcygpXG4gIHZhciBjb250ZXh0TG9zdCA9IGdsLmlzQ29udGV4dExvc3QoKVxuXG4gIHZhciBleHRlbnNpb25TdGF0ZSA9IHdyYXBFeHRlbnNpb25zKGdsLCBjb25maWcpXG4gIGlmICghZXh0ZW5zaW9uU3RhdGUpIHtcbiAgICByZXR1cm4gbnVsbFxuICB9XG5cbiAgdmFyIHN0cmluZ1N0b3JlID0gY3JlYXRlU3RyaW5nU3RvcmUoKVxuICB2YXIgc3RhdHMgPSBjcmVhdGVTdGF0cygpXG4gIHZhciBleHRlbnNpb25zID0gZXh0ZW5zaW9uU3RhdGUuZXh0ZW5zaW9uc1xuICB2YXIgdGltZXIgPSBjcmVhdGVUaW1lcihnbCwgZXh0ZW5zaW9ucylcblxuICB2YXIgU1RBUlRfVElNRSA9IGNsb2NrKClcbiAgdmFyIFdJRFRIID0gZ2wuZHJhd2luZ0J1ZmZlcldpZHRoXG4gIHZhciBIRUlHSFQgPSBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0XG5cbiAgdmFyIGNvbnRleHRTdGF0ZSA9IHtcbiAgICB0aWNrOiAwLFxuICAgIHRpbWU6IDAsXG4gICAgdmlld3BvcnRXaWR0aDogV0lEVEgsXG4gICAgdmlld3BvcnRIZWlnaHQ6IEhFSUdIVCxcbiAgICBmcmFtZWJ1ZmZlcldpZHRoOiBXSURUSCxcbiAgICBmcmFtZWJ1ZmZlckhlaWdodDogSEVJR0hULFxuICAgIGRyYXdpbmdCdWZmZXJXaWR0aDogV0lEVEgsXG4gICAgZHJhd2luZ0J1ZmZlckhlaWdodDogSEVJR0hULFxuICAgIHBpeGVsUmF0aW86IGNvbmZpZy5waXhlbFJhdGlvXG4gIH1cbiAgdmFyIHVuaWZvcm1TdGF0ZSA9IHt9XG4gIHZhciBkcmF3U3RhdGUgPSB7XG4gICAgZWxlbWVudHM6IG51bGwsXG4gICAgcHJpbWl0aXZlOiA0LCAvLyBHTF9UUklBTkdMRVNcbiAgICBjb3VudDogLTEsXG4gICAgb2Zmc2V0OiAwLFxuICAgIGluc3RhbmNlczogLTFcbiAgfVxuXG4gIHZhciBsaW1pdHMgPSB3cmFwTGltaXRzKGdsLCBleHRlbnNpb25zKVxuICB2YXIgYnVmZmVyU3RhdGUgPSB3cmFwQnVmZmVycyhnbCwgc3RhdHMsIGNvbmZpZylcbiAgdmFyIGVsZW1lbnRTdGF0ZSA9IHdyYXBFbGVtZW50cyhnbCwgZXh0ZW5zaW9ucywgYnVmZmVyU3RhdGUsIHN0YXRzKVxuICB2YXIgYXR0cmlidXRlU3RhdGUgPSB3cmFwQXR0cmlidXRlcyhcbiAgICBnbCxcbiAgICBleHRlbnNpb25zLFxuICAgIGxpbWl0cyxcbiAgICBidWZmZXJTdGF0ZSxcbiAgICBzdHJpbmdTdG9yZSlcbiAgdmFyIHNoYWRlclN0YXRlID0gd3JhcFNoYWRlcnMoZ2wsIHN0cmluZ1N0b3JlLCBzdGF0cywgY29uZmlnKVxuICB2YXIgdGV4dHVyZVN0YXRlID0gd3JhcFRleHR1cmVzKFxuICAgIGdsLFxuICAgIGV4dGVuc2lvbnMsXG4gICAgbGltaXRzLFxuICAgIGZ1bmN0aW9uICgpIHsgY29yZS5wcm9jcy5wb2xsKCkgfSxcbiAgICBjb250ZXh0U3RhdGUsXG4gICAgc3RhdHMsXG4gICAgY29uZmlnKVxuICB2YXIgcmVuZGVyYnVmZmVyU3RhdGUgPSB3cmFwUmVuZGVyYnVmZmVycyhnbCwgZXh0ZW5zaW9ucywgbGltaXRzLCBzdGF0cywgY29uZmlnKVxuICB2YXIgZnJhbWVidWZmZXJTdGF0ZSA9IHdyYXBGcmFtZWJ1ZmZlcnMoXG4gICAgZ2wsXG4gICAgZXh0ZW5zaW9ucyxcbiAgICBsaW1pdHMsXG4gICAgdGV4dHVyZVN0YXRlLFxuICAgIHJlbmRlcmJ1ZmZlclN0YXRlLFxuICAgIHN0YXRzKVxuICB2YXIgY29yZSA9IGNyZWF0ZUNvcmUoXG4gICAgZ2wsXG4gICAgc3RyaW5nU3RvcmUsXG4gICAgZXh0ZW5zaW9ucyxcbiAgICBsaW1pdHMsXG4gICAgYnVmZmVyU3RhdGUsXG4gICAgZWxlbWVudFN0YXRlLFxuICAgIHRleHR1cmVTdGF0ZSxcbiAgICBmcmFtZWJ1ZmZlclN0YXRlLFxuICAgIHVuaWZvcm1TdGF0ZSxcbiAgICBhdHRyaWJ1dGVTdGF0ZSxcbiAgICBzaGFkZXJTdGF0ZSxcbiAgICBkcmF3U3RhdGUsXG4gICAgY29udGV4dFN0YXRlLFxuICAgIHRpbWVyLFxuICAgIGNvbmZpZylcbiAgdmFyIHJlYWRQaXhlbHMgPSB3cmFwUmVhZChcbiAgICBnbCxcbiAgICBmcmFtZWJ1ZmZlclN0YXRlLFxuICAgIGNvcmUucHJvY3MucG9sbCxcbiAgICBjb250ZXh0U3RhdGUsXG4gICAgZ2xBdHRyaWJ1dGVzLCBleHRlbnNpb25zKVxuXG4gIHZhciBuZXh0U3RhdGUgPSBjb3JlLm5leHRcbiAgdmFyIGNhbnZhcyA9IGdsLmNhbnZhc1xuXG4gIHZhciByYWZDYWxsYmFja3MgPSBbXVxuICB2YXIgbG9zc0NhbGxiYWNrcyA9IFtdXG4gIHZhciByZXN0b3JlQ2FsbGJhY2tzID0gW11cbiAgdmFyIGRlc3Ryb3lDYWxsYmFja3MgPSBbY29uZmlnLm9uRGVzdHJveV1cblxuICB2YXIgYWN0aXZlUkFGID0gbnVsbFxuICBmdW5jdGlvbiBoYW5kbGVSQUYgKCkge1xuICAgIGlmIChyYWZDYWxsYmFja3MubGVuZ3RoID09PSAwKSB7XG4gICAgICBpZiAodGltZXIpIHtcbiAgICAgICAgdGltZXIudXBkYXRlKClcbiAgICAgIH1cbiAgICAgIGFjdGl2ZVJBRiA9IG51bGxcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIC8vIHNjaGVkdWxlIG5leHQgYW5pbWF0aW9uIGZyYW1lXG4gICAgYWN0aXZlUkFGID0gcmFmLm5leHQoaGFuZGxlUkFGKVxuXG4gICAgLy8gcG9sbCBmb3IgY2hhbmdlc1xuICAgIHBvbGwoKVxuXG4gICAgLy8gZmlyZSBhIGNhbGxiYWNrIGZvciBhbGwgcGVuZGluZyByYWZzXG4gICAgZm9yICh2YXIgaSA9IHJhZkNhbGxiYWNrcy5sZW5ndGggLSAxOyBpID49IDA7IC0taSkge1xuICAgICAgdmFyIGNiID0gcmFmQ2FsbGJhY2tzW2ldXG4gICAgICBpZiAoY2IpIHtcbiAgICAgICAgY2IoY29udGV4dFN0YXRlLCBudWxsLCAwKVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIGZsdXNoIGFsbCBwZW5kaW5nIHdlYmdsIGNhbGxzXG4gICAgZ2wuZmx1c2goKVxuXG4gICAgLy8gcG9sbCBHUFUgdGltZXJzICphZnRlciogZ2wuZmx1c2ggc28gd2UgZG9uJ3QgZGVsYXkgY29tbWFuZCBkaXNwYXRjaFxuICAgIGlmICh0aW1lcikge1xuICAgICAgdGltZXIudXBkYXRlKClcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzdGFydFJBRiAoKSB7XG4gICAgaWYgKCFhY3RpdmVSQUYgJiYgcmFmQ2FsbGJhY2tzLmxlbmd0aCA+IDApIHtcbiAgICAgIGFjdGl2ZVJBRiA9IHJhZi5uZXh0KGhhbmRsZVJBRilcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzdG9wUkFGICgpIHtcbiAgICBpZiAoYWN0aXZlUkFGKSB7XG4gICAgICByYWYuY2FuY2VsKGhhbmRsZVJBRilcbiAgICAgIGFjdGl2ZVJBRiA9IG51bGxcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVDb250ZXh0TG9zcyAoZXZlbnQpIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpXG5cbiAgICAvLyBzZXQgY29udGV4dCBsb3N0IGZsYWdcbiAgICBjb250ZXh0TG9zdCA9IHRydWVcblxuICAgIC8vIHBhdXNlIHJlcXVlc3QgYW5pbWF0aW9uIGZyYW1lXG4gICAgc3RvcFJBRigpXG5cbiAgICAvLyBsb3NlIGNvbnRleHRcbiAgICBsb3NzQ2FsbGJhY2tzLmZvckVhY2goZnVuY3Rpb24gKGNiKSB7XG4gICAgICBjYigpXG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZUNvbnRleHRSZXN0b3JlZCAoZXZlbnQpIHtcbiAgICAvLyBjbGVhciBlcnJvciBjb2RlXG4gICAgZ2wuZ2V0RXJyb3IoKVxuXG4gICAgLy8gY2xlYXIgY29udGV4dCBsb3N0IGZsYWdcbiAgICBjb250ZXh0TG9zdCA9IGZhbHNlXG5cbiAgICAvLyByZWZyZXNoIHN0YXRlXG4gICAgZXh0ZW5zaW9uU3RhdGUucmVzdG9yZSgpXG4gICAgc2hhZGVyU3RhdGUucmVzdG9yZSgpXG4gICAgYnVmZmVyU3RhdGUucmVzdG9yZSgpXG4gICAgdGV4dHVyZVN0YXRlLnJlc3RvcmUoKVxuICAgIHJlbmRlcmJ1ZmZlclN0YXRlLnJlc3RvcmUoKVxuICAgIGZyYW1lYnVmZmVyU3RhdGUucmVzdG9yZSgpXG4gICAgaWYgKHRpbWVyKSB7XG4gICAgICB0aW1lci5yZXN0b3JlKClcbiAgICB9XG5cbiAgICAvLyByZWZyZXNoIHN0YXRlXG4gICAgY29yZS5wcm9jcy5yZWZyZXNoKClcblxuICAgIC8vIHJlc3RhcnQgUkFGXG4gICAgc3RhcnRSQUYoKVxuXG4gICAgLy8gcmVzdG9yZSBjb250ZXh0XG4gICAgcmVzdG9yZUNhbGxiYWNrcy5mb3JFYWNoKGZ1bmN0aW9uIChjYikge1xuICAgICAgY2IoKVxuICAgIH0pXG4gIH1cblxuICBpZiAoY2FudmFzKSB7XG4gICAgY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoQ09OVEVYVF9MT1NUX0VWRU5ULCBoYW5kbGVDb250ZXh0TG9zcywgZmFsc2UpXG4gICAgY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoQ09OVEVYVF9SRVNUT1JFRF9FVkVOVCwgaGFuZGxlQ29udGV4dFJlc3RvcmVkLCBmYWxzZSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3kgKCkge1xuICAgIHJhZkNhbGxiYWNrcy5sZW5ndGggPSAwXG4gICAgc3RvcFJBRigpXG5cbiAgICBpZiAoY2FudmFzKSB7XG4gICAgICBjYW52YXMucmVtb3ZlRXZlbnRMaXN0ZW5lcihDT05URVhUX0xPU1RfRVZFTlQsIGhhbmRsZUNvbnRleHRMb3NzKVxuICAgICAgY2FudmFzLnJlbW92ZUV2ZW50TGlzdGVuZXIoQ09OVEVYVF9SRVNUT1JFRF9FVkVOVCwgaGFuZGxlQ29udGV4dFJlc3RvcmVkKVxuICAgIH1cblxuICAgIHNoYWRlclN0YXRlLmNsZWFyKClcbiAgICBmcmFtZWJ1ZmZlclN0YXRlLmNsZWFyKClcbiAgICByZW5kZXJidWZmZXJTdGF0ZS5jbGVhcigpXG4gICAgdGV4dHVyZVN0YXRlLmNsZWFyKClcbiAgICBlbGVtZW50U3RhdGUuY2xlYXIoKVxuICAgIGJ1ZmZlclN0YXRlLmNsZWFyKClcblxuICAgIGlmICh0aW1lcikge1xuICAgICAgdGltZXIuY2xlYXIoKVxuICAgIH1cblxuICAgIGRlc3Ryb3lDYWxsYmFja3MuZm9yRWFjaChmdW5jdGlvbiAoY2IpIHtcbiAgICAgIGNiKClcbiAgICB9KVxuICB9XG5cbiAgZnVuY3Rpb24gY29tcGlsZVByb2NlZHVyZSAob3B0aW9ucykge1xuICAgIGNoZWNrKCEhb3B0aW9ucywgJ2ludmFsaWQgYXJncyB0byByZWdsKHsuLi59KScpXG4gICAgY2hlY2sudHlwZShvcHRpb25zLCAnb2JqZWN0JywgJ2ludmFsaWQgYXJncyB0byByZWdsKHsuLi59KScpXG5cbiAgICBmdW5jdGlvbiBmbGF0dGVuTmVzdGVkT3B0aW9ucyAob3B0aW9ucykge1xuICAgICAgdmFyIHJlc3VsdCA9IGV4dGVuZCh7fSwgb3B0aW9ucylcbiAgICAgIGRlbGV0ZSByZXN1bHQudW5pZm9ybXNcbiAgICAgIGRlbGV0ZSByZXN1bHQuYXR0cmlidXRlc1xuICAgICAgZGVsZXRlIHJlc3VsdC5jb250ZXh0XG5cbiAgICAgIGlmICgnc3RlbmNpbCcgaW4gcmVzdWx0ICYmIHJlc3VsdC5zdGVuY2lsLm9wKSB7XG4gICAgICAgIHJlc3VsdC5zdGVuY2lsLm9wQmFjayA9IHJlc3VsdC5zdGVuY2lsLm9wRnJvbnQgPSByZXN1bHQuc3RlbmNpbC5vcFxuICAgICAgICBkZWxldGUgcmVzdWx0LnN0ZW5jaWwub3BcbiAgICAgIH1cblxuICAgICAgZnVuY3Rpb24gbWVyZ2UgKG5hbWUpIHtcbiAgICAgICAgaWYgKG5hbWUgaW4gcmVzdWx0KSB7XG4gICAgICAgICAgdmFyIGNoaWxkID0gcmVzdWx0W25hbWVdXG4gICAgICAgICAgZGVsZXRlIHJlc3VsdFtuYW1lXVxuICAgICAgICAgIE9iamVjdC5rZXlzKGNoaWxkKS5mb3JFYWNoKGZ1bmN0aW9uIChwcm9wKSB7XG4gICAgICAgICAgICByZXN1bHRbbmFtZSArICcuJyArIHByb3BdID0gY2hpbGRbcHJvcF1cbiAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBtZXJnZSgnYmxlbmQnKVxuICAgICAgbWVyZ2UoJ2RlcHRoJylcbiAgICAgIG1lcmdlKCdjdWxsJylcbiAgICAgIG1lcmdlKCdzdGVuY2lsJylcbiAgICAgIG1lcmdlKCdwb2x5Z29uT2Zmc2V0JylcbiAgICAgIG1lcmdlKCdzY2lzc29yJylcbiAgICAgIG1lcmdlKCdzYW1wbGUnKVxuXG4gICAgICByZXR1cm4gcmVzdWx0XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2VwYXJhdGVEeW5hbWljIChvYmplY3QpIHtcbiAgICAgIHZhciBzdGF0aWNJdGVtcyA9IHt9XG4gICAgICB2YXIgZHluYW1pY0l0ZW1zID0ge31cbiAgICAgIE9iamVjdC5rZXlzKG9iamVjdCkuZm9yRWFjaChmdW5jdGlvbiAob3B0aW9uKSB7XG4gICAgICAgIHZhciB2YWx1ZSA9IG9iamVjdFtvcHRpb25dXG4gICAgICAgIGlmIChkeW5hbWljLmlzRHluYW1pYyh2YWx1ZSkpIHtcbiAgICAgICAgICBkeW5hbWljSXRlbXNbb3B0aW9uXSA9IGR5bmFtaWMudW5ib3godmFsdWUsIG9wdGlvbilcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzdGF0aWNJdGVtc1tvcHRpb25dID0gdmFsdWVcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGR5bmFtaWM6IGR5bmFtaWNJdGVtcyxcbiAgICAgICAgc3RhdGljOiBzdGF0aWNJdGVtc1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFRyZWF0IGNvbnRleHQgdmFyaWFibGVzIHNlcGFyYXRlIGZyb20gb3RoZXIgZHluYW1pYyB2YXJpYWJsZXNcbiAgICB2YXIgY29udGV4dCA9IHNlcGFyYXRlRHluYW1pYyhvcHRpb25zLmNvbnRleHQgfHwge30pXG4gICAgdmFyIHVuaWZvcm1zID0gc2VwYXJhdGVEeW5hbWljKG9wdGlvbnMudW5pZm9ybXMgfHwge30pXG4gICAgdmFyIGF0dHJpYnV0ZXMgPSBzZXBhcmF0ZUR5bmFtaWMob3B0aW9ucy5hdHRyaWJ1dGVzIHx8IHt9KVxuICAgIHZhciBvcHRzID0gc2VwYXJhdGVEeW5hbWljKGZsYXR0ZW5OZXN0ZWRPcHRpb25zKG9wdGlvbnMpKVxuXG4gICAgdmFyIHN0YXRzID0ge1xuICAgICAgZ3B1VGltZTogMC4wLFxuICAgICAgY3B1VGltZTogMC4wLFxuICAgICAgY291bnQ6IDBcbiAgICB9XG5cbiAgICB2YXIgY29tcGlsZWQgPSBjb3JlLmNvbXBpbGUob3B0cywgYXR0cmlidXRlcywgdW5pZm9ybXMsIGNvbnRleHQsIHN0YXRzKVxuXG4gICAgdmFyIGRyYXcgPSBjb21waWxlZC5kcmF3XG4gICAgdmFyIGJhdGNoID0gY29tcGlsZWQuYmF0Y2hcbiAgICB2YXIgc2NvcGUgPSBjb21waWxlZC5zY29wZVxuXG4gICAgLy8gRklYTUU6IHdlIHNob3VsZCBtb2RpZnkgY29kZSBnZW5lcmF0aW9uIGZvciBiYXRjaCBjb21tYW5kcyBzbyB0aGlzXG4gICAgLy8gaXNuJ3QgbmVjZXNzYXJ5XG4gICAgdmFyIEVNUFRZX0FSUkFZID0gW11cbiAgICBmdW5jdGlvbiByZXNlcnZlIChjb3VudCkge1xuICAgICAgd2hpbGUgKEVNUFRZX0FSUkFZLmxlbmd0aCA8IGNvdW50KSB7XG4gICAgICAgIEVNUFRZX0FSUkFZLnB1c2gobnVsbClcbiAgICAgIH1cbiAgICAgIHJldHVybiBFTVBUWV9BUlJBWVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIFJFR0xDb21tYW5kIChhcmdzLCBib2R5KSB7XG4gICAgICB2YXIgaVxuICAgICAgaWYgKGNvbnRleHRMb3N0KSB7XG4gICAgICAgIGNoZWNrLnJhaXNlKCdjb250ZXh0IGxvc3QnKVxuICAgICAgfVxuICAgICAgaWYgKHR5cGVvZiBhcmdzID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHJldHVybiBzY29wZS5jYWxsKHRoaXMsIG51bGwsIGFyZ3MsIDApXG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBib2R5ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIGlmICh0eXBlb2YgYXJncyA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgYXJnczsgKytpKSB7XG4gICAgICAgICAgICBzY29wZS5jYWxsKHRoaXMsIG51bGwsIGJvZHksIGkpXG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVyblxuICAgICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoYXJncykpIHtcbiAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgYXJncy5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgc2NvcGUuY2FsbCh0aGlzLCBhcmdzW2ldLCBib2R5LCBpKVxuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gc2NvcGUuY2FsbCh0aGlzLCBhcmdzLCBib2R5LCAwKVxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBhcmdzID09PSAnbnVtYmVyJykge1xuICAgICAgICBpZiAoYXJncyA+IDApIHtcbiAgICAgICAgICByZXR1cm4gYmF0Y2guY2FsbCh0aGlzLCByZXNlcnZlKGFyZ3MgfCAwKSwgYXJncyB8IDApXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShhcmdzKSkge1xuICAgICAgICBpZiAoYXJncy5sZW5ndGgpIHtcbiAgICAgICAgICByZXR1cm4gYmF0Y2guY2FsbCh0aGlzLCBhcmdzLCBhcmdzLmxlbmd0aClcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGRyYXcuY2FsbCh0aGlzLCBhcmdzKVxuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBleHRlbmQoUkVHTENvbW1hbmQsIHtcbiAgICAgIHN0YXRzOiBzdGF0c1xuICAgIH0pXG4gIH1cblxuICB2YXIgc2V0RkJPID0gZnJhbWVidWZmZXJTdGF0ZS5zZXRGQk8gPSBjb21waWxlUHJvY2VkdXJlKHtcbiAgICBmcmFtZWJ1ZmZlcjogZHluYW1pYy5kZWZpbmUuY2FsbChudWxsLCBEWU5fUFJPUCwgJ2ZyYW1lYnVmZmVyJylcbiAgfSlcblxuICBmdW5jdGlvbiBjbGVhckltcGwgKF8sIG9wdGlvbnMpIHtcbiAgICB2YXIgY2xlYXJGbGFncyA9IDBcbiAgICBjb3JlLnByb2NzLnBvbGwoKVxuXG4gICAgdmFyIGMgPSBvcHRpb25zLmNvbG9yXG4gICAgaWYgKGMpIHtcbiAgICAgIGdsLmNsZWFyQ29sb3IoK2NbMF0gfHwgMCwgK2NbMV0gfHwgMCwgK2NbMl0gfHwgMCwgK2NbM10gfHwgMClcbiAgICAgIGNsZWFyRmxhZ3MgfD0gR0xfQ09MT1JfQlVGRkVSX0JJVFxuICAgIH1cbiAgICBpZiAoJ2RlcHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICBnbC5jbGVhckRlcHRoKCtvcHRpb25zLmRlcHRoKVxuICAgICAgY2xlYXJGbGFncyB8PSBHTF9ERVBUSF9CVUZGRVJfQklUXG4gICAgfVxuICAgIGlmICgnc3RlbmNpbCcgaW4gb3B0aW9ucykge1xuICAgICAgZ2wuY2xlYXJTdGVuY2lsKG9wdGlvbnMuc3RlbmNpbCB8IDApXG4gICAgICBjbGVhckZsYWdzIHw9IEdMX1NURU5DSUxfQlVGRkVSX0JJVFxuICAgIH1cblxuICAgIGNoZWNrKCEhY2xlYXJGbGFncywgJ2NhbGxlZCByZWdsLmNsZWFyIHdpdGggbm8gYnVmZmVyIHNwZWNpZmllZCcpXG4gICAgZ2wuY2xlYXIoY2xlYXJGbGFncylcbiAgfVxuXG4gIGZ1bmN0aW9uIGNsZWFyIChvcHRpb25zKSB7XG4gICAgY2hlY2soXG4gICAgICB0eXBlb2Ygb3B0aW9ucyA9PT0gJ29iamVjdCcgJiYgb3B0aW9ucyxcbiAgICAgICdyZWdsLmNsZWFyKCkgdGFrZXMgYW4gb2JqZWN0IGFzIGlucHV0JylcbiAgICBpZiAoJ2ZyYW1lYnVmZmVyJyBpbiBvcHRpb25zKSB7XG4gICAgICBpZiAob3B0aW9ucy5mcmFtZWJ1ZmZlciAmJlxuICAgICAgICAgIG9wdGlvbnMuZnJhbWVidWZmZXJfcmVnbFR5cGUgPT09ICdmcmFtZWJ1ZmZlckN1YmUnKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgICAgc2V0RkJPKGV4dGVuZCh7XG4gICAgICAgICAgICBmcmFtZWJ1ZmZlcjogb3B0aW9ucy5mcmFtZWJ1ZmZlci5mYWNlc1tpXVxuICAgICAgICAgIH0sIG9wdGlvbnMpLCBjbGVhckltcGwpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNldEZCTyhvcHRpb25zLCBjbGVhckltcGwpXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNsZWFySW1wbChudWxsLCBvcHRpb25zKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGZyYW1lIChjYikge1xuICAgIGNoZWNrLnR5cGUoY2IsICdmdW5jdGlvbicsICdyZWdsLmZyYW1lKCkgY2FsbGJhY2sgbXVzdCBiZSBhIGZ1bmN0aW9uJylcbiAgICByYWZDYWxsYmFja3MucHVzaChjYilcblxuICAgIGZ1bmN0aW9uIGNhbmNlbCAoKSB7XG4gICAgICAvLyBGSVhNRTogIHNob3VsZCB3ZSBjaGVjayBzb21ldGhpbmcgb3RoZXIgdGhhbiBlcXVhbHMgY2IgaGVyZT9cbiAgICAgIC8vIHdoYXQgaWYgYSB1c2VyIGNhbGxzIGZyYW1lIHR3aWNlIHdpdGggdGhlIHNhbWUgY2FsbGJhY2suLi5cbiAgICAgIC8vXG4gICAgICB2YXIgaSA9IGZpbmQocmFmQ2FsbGJhY2tzLCBjYilcbiAgICAgIGNoZWNrKGkgPj0gMCwgJ2Nhbm5vdCBjYW5jZWwgYSBmcmFtZSB0d2ljZScpXG4gICAgICBmdW5jdGlvbiBwZW5kaW5nQ2FuY2VsICgpIHtcbiAgICAgICAgdmFyIGluZGV4ID0gZmluZChyYWZDYWxsYmFja3MsIHBlbmRpbmdDYW5jZWwpXG4gICAgICAgIHJhZkNhbGxiYWNrc1tpbmRleF0gPSByYWZDYWxsYmFja3NbcmFmQ2FsbGJhY2tzLmxlbmd0aCAtIDFdXG4gICAgICAgIHJhZkNhbGxiYWNrcy5sZW5ndGggLT0gMVxuICAgICAgICBpZiAocmFmQ2FsbGJhY2tzLmxlbmd0aCA8PSAwKSB7XG4gICAgICAgICAgc3RvcFJBRigpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJhZkNhbGxiYWNrc1tpXSA9IHBlbmRpbmdDYW5jZWxcbiAgICB9XG5cbiAgICBzdGFydFJBRigpXG5cbiAgICByZXR1cm4ge1xuICAgICAgY2FuY2VsOiBjYW5jZWxcbiAgICB9XG4gIH1cblxuICAvLyBwb2xsIHZpZXdwb3J0XG4gIGZ1bmN0aW9uIHBvbGxWaWV3cG9ydCAoKSB7XG4gICAgdmFyIHZpZXdwb3J0ID0gbmV4dFN0YXRlLnZpZXdwb3J0XG4gICAgdmFyIHNjaXNzb3JCb3ggPSBuZXh0U3RhdGUuc2Npc3Nvcl9ib3hcbiAgICB2aWV3cG9ydFswXSA9IHZpZXdwb3J0WzFdID0gc2Npc3NvckJveFswXSA9IHNjaXNzb3JCb3hbMV0gPSAwXG4gICAgY29udGV4dFN0YXRlLnZpZXdwb3J0V2lkdGggPVxuICAgICAgY29udGV4dFN0YXRlLmZyYW1lYnVmZmVyV2lkdGggPVxuICAgICAgY29udGV4dFN0YXRlLmRyYXdpbmdCdWZmZXJXaWR0aCA9XG4gICAgICB2aWV3cG9ydFsyXSA9XG4gICAgICBzY2lzc29yQm94WzJdID0gZ2wuZHJhd2luZ0J1ZmZlcldpZHRoXG4gICAgY29udGV4dFN0YXRlLnZpZXdwb3J0SGVpZ2h0ID1cbiAgICAgIGNvbnRleHRTdGF0ZS5mcmFtZWJ1ZmZlckhlaWdodCA9XG4gICAgICBjb250ZXh0U3RhdGUuZHJhd2luZ0J1ZmZlckhlaWdodCA9XG4gICAgICB2aWV3cG9ydFszXSA9XG4gICAgICBzY2lzc29yQm94WzNdID0gZ2wuZHJhd2luZ0J1ZmZlckhlaWdodFxuICB9XG5cbiAgZnVuY3Rpb24gcG9sbCAoKSB7XG4gICAgY29udGV4dFN0YXRlLnRpY2sgKz0gMVxuICAgIGNvbnRleHRTdGF0ZS50aW1lID0gbm93KClcbiAgICBwb2xsVmlld3BvcnQoKVxuICAgIGNvcmUucHJvY3MucG9sbCgpXG4gIH1cblxuICBmdW5jdGlvbiByZWZyZXNoICgpIHtcbiAgICBwb2xsVmlld3BvcnQoKVxuICAgIGNvcmUucHJvY3MucmVmcmVzaCgpXG4gICAgaWYgKHRpbWVyKSB7XG4gICAgICB0aW1lci51cGRhdGUoKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIG5vdyAoKSB7XG4gICAgcmV0dXJuIChjbG9jaygpIC0gU1RBUlRfVElNRSkgLyAxMDAwLjBcbiAgfVxuXG4gIHJlZnJlc2goKVxuXG4gIGZ1bmN0aW9uIGFkZExpc3RlbmVyIChldmVudCwgY2FsbGJhY2spIHtcbiAgICBjaGVjay50eXBlKGNhbGxiYWNrLCAnZnVuY3Rpb24nLCAnbGlzdGVuZXIgY2FsbGJhY2sgbXVzdCBiZSBhIGZ1bmN0aW9uJylcblxuICAgIHZhciBjYWxsYmFja3NcbiAgICBzd2l0Y2ggKGV2ZW50KSB7XG4gICAgICBjYXNlICdmcmFtZSc6XG4gICAgICAgIHJldHVybiBmcmFtZShjYWxsYmFjaylcbiAgICAgIGNhc2UgJ2xvc3QnOlxuICAgICAgICBjYWxsYmFja3MgPSBsb3NzQ2FsbGJhY2tzXG4gICAgICAgIGJyZWFrXG4gICAgICBjYXNlICdyZXN0b3JlJzpcbiAgICAgICAgY2FsbGJhY2tzID0gcmVzdG9yZUNhbGxiYWNrc1xuICAgICAgICBicmVha1xuICAgICAgY2FzZSAnZGVzdHJveSc6XG4gICAgICAgIGNhbGxiYWNrcyA9IGRlc3Ryb3lDYWxsYmFja3NcbiAgICAgICAgYnJlYWtcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGNoZWNrLnJhaXNlKCdpbnZhbGlkIGV2ZW50LCBtdXN0IGJlIG9uZSBvZiBmcmFtZSxsb3N0LHJlc3RvcmUsZGVzdHJveScpXG4gICAgfVxuXG4gICAgY2FsbGJhY2tzLnB1c2goY2FsbGJhY2spXG4gICAgcmV0dXJuIHtcbiAgICAgIGNhbmNlbDogZnVuY3Rpb24gKCkge1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNhbGxiYWNrcy5sZW5ndGg7ICsraSkge1xuICAgICAgICAgIGlmIChjYWxsYmFja3NbaV0gPT09IGNhbGxiYWNrKSB7XG4gICAgICAgICAgICBjYWxsYmFja3NbaV0gPSBjYWxsYmFja3NbY2FsbGJhY2tzLmxlbmd0aCAtIDFdXG4gICAgICAgICAgICBjYWxsYmFja3MucG9wKClcbiAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHZhciByZWdsID0gZXh0ZW5kKGNvbXBpbGVQcm9jZWR1cmUsIHtcbiAgICAvLyBDbGVhciBjdXJyZW50IEZCT1xuICAgIGNsZWFyOiBjbGVhcixcblxuICAgIC8vIFNob3J0IGN1dHMgZm9yIGR5bmFtaWMgdmFyaWFibGVzXG4gICAgcHJvcDogZHluYW1pYy5kZWZpbmUuYmluZChudWxsLCBEWU5fUFJPUCksXG4gICAgY29udGV4dDogZHluYW1pYy5kZWZpbmUuYmluZChudWxsLCBEWU5fQ09OVEVYVCksXG4gICAgdGhpczogZHluYW1pYy5kZWZpbmUuYmluZChudWxsLCBEWU5fU1RBVEUpLFxuXG4gICAgLy8gZXhlY3V0ZXMgYW4gZW1wdHkgZHJhdyBjb21tYW5kXG4gICAgZHJhdzogY29tcGlsZVByb2NlZHVyZSh7fSksXG5cbiAgICAvLyBSZXNvdXJjZXNcbiAgICBidWZmZXI6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICByZXR1cm4gYnVmZmVyU3RhdGUuY3JlYXRlKG9wdGlvbnMsIEdMX0FSUkFZX0JVRkZFUiwgZmFsc2UsIGZhbHNlKVxuICAgIH0sXG4gICAgZWxlbWVudHM6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICByZXR1cm4gZWxlbWVudFN0YXRlLmNyZWF0ZShvcHRpb25zLCBmYWxzZSlcbiAgICB9LFxuICAgIHRleHR1cmU6IHRleHR1cmVTdGF0ZS5jcmVhdGUyRCxcbiAgICBjdWJlOiB0ZXh0dXJlU3RhdGUuY3JlYXRlQ3ViZSxcbiAgICByZW5kZXJidWZmZXI6IHJlbmRlcmJ1ZmZlclN0YXRlLmNyZWF0ZSxcbiAgICBmcmFtZWJ1ZmZlcjogZnJhbWVidWZmZXJTdGF0ZS5jcmVhdGUsXG4gICAgZnJhbWVidWZmZXJDdWJlOiBmcmFtZWJ1ZmZlclN0YXRlLmNyZWF0ZUN1YmUsXG5cbiAgICAvLyBFeHBvc2UgY29udGV4dCBhdHRyaWJ1dGVzXG4gICAgYXR0cmlidXRlczogZ2xBdHRyaWJ1dGVzLFxuXG4gICAgLy8gRnJhbWUgcmVuZGVyaW5nXG4gICAgZnJhbWU6IGZyYW1lLFxuICAgIG9uOiBhZGRMaXN0ZW5lcixcblxuICAgIC8vIFN5c3RlbSBsaW1pdHNcbiAgICBsaW1pdHM6IGxpbWl0cyxcbiAgICBoYXNFeHRlbnNpb246IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICByZXR1cm4gbGltaXRzLmV4dGVuc2lvbnMuaW5kZXhPZihuYW1lLnRvTG93ZXJDYXNlKCkpID49IDBcbiAgICB9LFxuXG4gICAgLy8gUmVhZCBwaXhlbHNcbiAgICByZWFkOiByZWFkUGl4ZWxzLFxuXG4gICAgLy8gRGVzdHJveSByZWdsIGFuZCBhbGwgYXNzb2NpYXRlZCByZXNvdXJjZXNcbiAgICBkZXN0cm95OiBkZXN0cm95LFxuXG4gICAgLy8gRGlyZWN0IEdMIHN0YXRlIG1hbmlwdWxhdGlvblxuICAgIF9nbDogZ2wsXG4gICAgX3JlZnJlc2g6IHJlZnJlc2gsXG5cbiAgICBwb2xsOiBmdW5jdGlvbiAoKSB7XG4gICAgICBwb2xsKClcbiAgICAgIGlmICh0aW1lcikge1xuICAgICAgICB0aW1lci51cGRhdGUoKVxuICAgICAgfVxuICAgIH0sXG5cbiAgICAvLyBDdXJyZW50IHRpbWVcbiAgICBub3c6IG5vdyxcblxuICAgIC8vIHJlZ2wgU3RhdGlzdGljcyBJbmZvcm1hdGlvblxuICAgIHN0YXRzOiBzdGF0c1xuICB9KVxuXG4gIGNvbmZpZy5vbkRvbmUobnVsbCwgcmVnbClcblxuICByZXR1cm4gcmVnbFxufVxuIl19
