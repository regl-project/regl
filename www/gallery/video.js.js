(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*
  tags: basic, video

  <p>This example shows how to overlay a chroma keyed video over a background rendered by regl. </p>

 */

var regl = require('../regl')();

var drawDoggie = regl({
  frag: '\n  precision mediump float;\n  uniform sampler2D texture;\n  uniform vec2 screenShape;\n  uniform float time;\n\n  varying vec2 uv;\n\n  vec4 background () {\n    vec2 pos = 0.5 - gl_FragCoord.xy / screenShape;\n    float r = length(pos);\n    float theta = atan(pos.y, pos.x);\n    return vec4(\n      cos(pos.x * time) + sin(pos.y * pos.x * time),\n      cos(100.0 * r * cos(0.3 * time) + theta),\n      sin(time / r + pos.x * cos(10.0 * time + 3.0)),\n      1);\n  }\n\n  void main () {\n    vec4 color = texture2D(texture, uv);\n    float chromakey = step(0.15 + max(color.r, color.b), color.g);\n    gl_FragColor = mix(color, background(), chromakey);\n  }',

  vert: '\n  precision mediump float;\n  attribute vec2 position;\n  varying vec2 uv;\n  void main () {\n    uv = position;\n    gl_Position = vec4(1.0 - 2.0 * position, 0, 1);\n  }',

  attributes: {
    position: [-2, 0, 0, -2, 2, 2]
  },

  uniforms: {
    texture: regl.prop('video'),

    screenShape: function ({ viewportWidth, viewportHeight }) {
      return [viewportWidth, viewportHeight];
    },

    time: regl.context('time')
  },

  count: 3
});

require('resl')({
  manifest: {
    video: {
      type: 'video',
      src: 'assets/doggie-chromakey.ogv',
      stream: true
    }
  },

  onDone: function ({ video }) {
    video.autoplay = true;
    video.loop = true;
    video.play();

    var texture = regl.texture(video);
    regl.frame(function () {
      drawDoggie({ video: texture.subimage(video) });
    });
  }
});

},{"../regl":36,"resl":35}],2:[function(require,module,exports){
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

},{}],36:[function(require,module,exports){
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJleGFtcGxlL3ZpZGVvLmpzIiwibGliL2F0dHJpYnV0ZS5qcyIsImxpYi9idWZmZXIuanMiLCJsaWIvY29uc3RhbnRzL2FycmF5dHlwZXMuanNvbiIsImxpYi9jb25zdGFudHMvZHR5cGVzLmpzb24iLCJsaWIvY29uc3RhbnRzL3ByaW1pdGl2ZXMuanNvbiIsImxpYi9jb25zdGFudHMvdXNhZ2UuanNvbiIsImxpYi9jb3JlLmpzIiwibGliL2R5bmFtaWMuanMiLCJsaWIvZWxlbWVudHMuanMiLCJsaWIvZXh0ZW5zaW9uLmpzIiwibGliL2ZyYW1lYnVmZmVyLmpzIiwibGliL2xpbWl0cy5qcyIsImxpYi9yZWFkLmpzIiwibGliL3JlbmRlcmJ1ZmZlci5qcyIsImxpYi9zaGFkZXIuanMiLCJsaWIvc3RhdHMuanMiLCJsaWIvc3RyaW5ncy5qcyIsImxpYi90ZXh0dXJlLmpzIiwibGliL3RpbWVyLmpzIiwibGliL3V0aWwvY2hlY2suanMiLCJsaWIvdXRpbC9jbG9jay5qcyIsImxpYi91dGlsL2NvZGVnZW4uanMiLCJsaWIvdXRpbC9leHRlbmQuanMiLCJsaWIvdXRpbC9mbGF0dGVuLmpzIiwibGliL3V0aWwvaXMtYXJyYXktbGlrZS5qcyIsImxpYi91dGlsL2lzLW5kYXJyYXkuanMiLCJsaWIvdXRpbC9pcy10eXBlZC1hcnJheS5qcyIsImxpYi91dGlsL2xvb3AuanMiLCJsaWIvdXRpbC9wb29sLmpzIiwibGliL3V0aWwvcmFmLmpzIiwibGliL3V0aWwvdG8taGFsZi1mbG9hdC5qcyIsImxpYi91dGlsL3ZhbHVlcy5qcyIsImxpYi93ZWJnbC5qcyIsIm5vZGVfbW9kdWxlcy9yZXNsL2luZGV4LmpzIiwicmVnbC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBOzs7Ozs7O0FBT0EsSUFBTSxPQUFPLFFBQVEsU0FBUixHQUFiOztBQUVBLElBQU0sYUFBYSxLQUFLO0FBQ3RC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O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMWFBLElBQUksUUFBUSxRQUFRLGtCQUFSLENBQVo7QUFDQSxJQUFJLFNBQVMsUUFBUSxt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QTdCLENBQVA7QUFDRCxLQWxCaUM7QUFtQmxDLGFBQVMsYUFBYSxRQW5CWTtBQW9CbEMsVUFBTSxhQUFhLFVBcEJlO0FBcUJsQyxrQkFBYyxrQkFBa0IsTUFyQkU7QUFzQmxDLGlCQUFhLGlCQUFpQixNQXRCSTtBQXVCbEMscUJBQWlCLGlCQUFpQixVQXZCQTs7QUF5QmxDO0FBQ0EsZ0JBQVksWUExQnNCOztBQTRCbEM7QUFDQSxXQUFPLEtBN0IyQjtBQThCbEMsUUFBSSxXQTlCOEI7O0FBZ0NsQztBQUNBLFlBQVEsTUFqQzBCO0FBa0NsQyxrQkFBYyxVQUFVLElBQVYsRUFBZ0I7QUFDNUIsYUFBTyxPQUFPLFVBQVAsQ0FBa0IsT0FBbEIsQ0FBMEIsS0FBSyxXQUFMLEVBQTFCLEtBQWlELENBQXhEO0FBQ0QsS0FwQ2lDOztBQXNDbEM7QUFDQSxVQUFNLFVBdkM0Qjs7QUF5Q2xDO0FBQ0EsYUFBUyxPQTFDeUI7O0FBNENsQztBQUNBLFNBQUssRUE3QzZCO0FBOENsQyxjQUFVLE9BOUN3Qjs7QUFnRGxDLFVBQU0sWUFBWTtBQUNoQjtBQUNBLFVBQUksS0FBSixFQUFXO0FBQ1QsY0FBTSxNQUFOO0FBQ0Q7QUFDRixLQXJEaUM7O0FBdURsQztBQUNBLFNBQUssR0F4RDZCOztBQTBEbEM7QUFDQSxXQUFPO0FBM0QyQixHQUF6QixDQUFYOztBQThEQSxTQUFPLE1BQVAsQ0FBYyxJQUFkLEVBQW9CLElBQXBCOztBQUVBLFNBQU8sSUFBUDtBQUNELENBeGlCRCIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKlxuICB0YWdzOiBiYXNpYywgdmlkZW9cblxuICA8cD5UaGlzIGV4YW1wbGUgc2hvd3MgaG93IHRvIG92ZXJsYXkgYSBjaHJvbWEga2V5ZWQgdmlkZW8gb3ZlciBhIGJhY2tncm91bmQgcmVuZGVyZWQgYnkgcmVnbC4gPC9wPlxuXG4gKi9cblxuY29uc3QgcmVnbCA9IHJlcXVpcmUoJy4uL3JlZ2wnKSgpXG5cbmNvbnN0IGRyYXdEb2dnaWUgPSByZWdsKHtcbiAgZnJhZzogYFxuICBwcmVjaXNpb24gbWVkaXVtcCBmbG9hdDtcbiAgdW5pZm9ybSBzYW1wbGVyMkQgdGV4dHVyZTtcbiAgdW5pZm9ybSB2ZWMyIHNjcmVlblNoYXBlO1xuICB1bmlmb3JtIGZsb2F0IHRpbWU7XG5cbiAgdmFyeWluZyB2ZWMyIHV2O1xuXG4gIHZlYzQgYmFja2dyb3VuZCAoKSB7XG4gICAgdmVjMiBwb3MgPSAwLjUgLSBnbF9GcmFnQ29vcmQueHkgLyBzY3JlZW5TaGFwZTtcbiAgICBmbG9hdCByID0gbGVuZ3RoKHBvcyk7XG4gICAgZmxvYXQgdGhldGEgPSBhdGFuKHBvcy55LCBwb3MueCk7XG4gICAgcmV0dXJuIHZlYzQoXG4gICAgICBjb3MocG9zLnggKiB0aW1lKSArIHNpbihwb3MueSAqIHBvcy54ICogdGltZSksXG4gICAgICBjb3MoMTAwLjAgKiByICogY29zKDAuMyAqIHRpbWUpICsgdGhldGEpLFxuICAgICAgc2luKHRpbWUgLyByICsgcG9zLnggKiBjb3MoMTAuMCAqIHRpbWUgKyAzLjApKSxcbiAgICAgIDEpO1xuICB9XG5cbiAgdm9pZCBtYWluICgpIHtcbiAgICB2ZWM0IGNvbG9yID0gdGV4dHVyZTJEKHRleHR1cmUsIHV2KTtcbiAgICBmbG9hdCBjaHJvbWFrZXkgPSBzdGVwKDAuMTUgKyBtYXgoY29sb3IuciwgY29sb3IuYiksIGNvbG9yLmcpO1xuICAgIGdsX0ZyYWdDb2xvciA9IG1peChjb2xvciwgYmFja2dyb3VuZCgpLCBjaHJvbWFrZXkpO1xuICB9YCxcblxuICB2ZXJ0OiBgXG4gIHByZWNpc2lvbiBtZWRpdW1wIGZsb2F0O1xuICBhdHRyaWJ1dGUgdmVjMiBwb3NpdGlvbjtcbiAgdmFyeWluZyB2ZWMyIHV2O1xuICB2b2lkIG1haW4gKCkge1xuICAgIHV2ID0gcG9zaXRpb247XG4gICAgZ2xfUG9zaXRpb24gPSB2ZWM0KDEuMCAtIDIuMCAqIHBvc2l0aW9uLCAwLCAxKTtcbiAgfWAsXG5cbiAgYXR0cmlidXRlczoge1xuICAgIHBvc2l0aW9uOiBbXG4gICAgICAtMiwgMCxcbiAgICAgIDAsIC0yLFxuICAgICAgMiwgMl1cbiAgfSxcblxuICB1bmlmb3Jtczoge1xuICAgIHRleHR1cmU6IHJlZ2wucHJvcCgndmlkZW8nKSxcblxuICAgIHNjcmVlblNoYXBlOiAoe3ZpZXdwb3J0V2lkdGgsIHZpZXdwb3J0SGVpZ2h0fSkgPT5cbiAgICAgIFt2aWV3cG9ydFdpZHRoLCB2aWV3cG9ydEhlaWdodF0sXG5cbiAgICB0aW1lOiByZWdsLmNvbnRleHQoJ3RpbWUnKVxuICB9LFxuXG4gIGNvdW50OiAzXG59KVxuXG5yZXF1aXJlKCdyZXNsJykoe1xuICBtYW5pZmVzdDoge1xuICAgIHZpZGVvOiB7XG4gICAgICB0eXBlOiAndmlkZW8nLFxuICAgICAgc3JjOiAnYXNzZXRzL2RvZ2dpZS1jaHJvbWFrZXkub2d2JyxcbiAgICAgIHN0cmVhbTogdHJ1ZVxuICAgIH1cbiAgfSxcblxuICBvbkRvbmU6ICh7dmlkZW99KSA9PiB7XG4gICAgdmlkZW8uYXV0b3BsYXkgPSB0cnVlXG4gICAgdmlkZW8ubG9vcCA9IHRydWVcbiAgICB2aWRlby5wbGF5KClcblxuICAgIGNvbnN0IHRleHR1cmUgPSByZWdsLnRleHR1cmUodmlkZW8pXG4gICAgcmVnbC5mcmFtZSgoKSA9PiB7XG4gICAgICBkcmF3RG9nZ2llKHsgdmlkZW86IHRleHR1cmUuc3ViaW1hZ2UodmlkZW8pIH0pXG4gICAgfSlcbiAgfVxufSlcbiIsInZhciBHTF9GTE9BVCA9IDUxMjZcblxuZnVuY3Rpb24gQXR0cmlidXRlUmVjb3JkICgpIHtcbiAgdGhpcy5zdGF0ZSA9IDBcblxuICB0aGlzLnggPSAwLjBcbiAgdGhpcy55ID0gMC4wXG4gIHRoaXMueiA9IDAuMFxuICB0aGlzLncgPSAwLjBcblxuICB0aGlzLmJ1ZmZlciA9IG51bGxcbiAgdGhpcy5zaXplID0gMFxuICB0aGlzLm5vcm1hbGl6ZWQgPSBmYWxzZVxuICB0aGlzLnR5cGUgPSBHTF9GTE9BVFxuICB0aGlzLm9mZnNldCA9IDBcbiAgdGhpcy5zdHJpZGUgPSAwXG4gIHRoaXMuZGl2aXNvciA9IDBcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwQXR0cmlidXRlU3RhdGUgKFxuICBnbCxcbiAgZXh0ZW5zaW9ucyxcbiAgbGltaXRzLFxuICBidWZmZXJTdGF0ZSxcbiAgc3RyaW5nU3RvcmUpIHtcbiAgdmFyIE5VTV9BVFRSSUJVVEVTID0gbGltaXRzLm1heEF0dHJpYnV0ZXNcbiAgdmFyIGF0dHJpYnV0ZUJpbmRpbmdzID0gbmV3IEFycmF5KE5VTV9BVFRSSUJVVEVTKVxuICBmb3IgKHZhciBpID0gMDsgaSA8IE5VTV9BVFRSSUJVVEVTOyArK2kpIHtcbiAgICBhdHRyaWJ1dGVCaW5kaW5nc1tpXSA9IG5ldyBBdHRyaWJ1dGVSZWNvcmQoKVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBSZWNvcmQ6IEF0dHJpYnV0ZVJlY29yZCxcbiAgICBzY29wZToge30sXG4gICAgc3RhdGU6IGF0dHJpYnV0ZUJpbmRpbmdzXG4gIH1cbn1cbiIsInZhciBjaGVjayA9IHJlcXVpcmUoJy4vdXRpbC9jaGVjaycpXG52YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi91dGlsL2lzLXR5cGVkLWFycmF5JylcbnZhciBpc05EQXJyYXlMaWtlID0gcmVxdWlyZSgnLi91dGlsL2lzLW5kYXJyYXknKVxudmFyIHZhbHVlcyA9IHJlcXVpcmUoJy4vdXRpbC92YWx1ZXMnKVxudmFyIHBvb2wgPSByZXF1aXJlKCcuL3V0aWwvcG9vbCcpXG52YXIgZmxhdHRlblV0aWwgPSByZXF1aXJlKCcuL3V0aWwvZmxhdHRlbicpXG5cbnZhciBhcnJheUZsYXR0ZW4gPSBmbGF0dGVuVXRpbC5mbGF0dGVuXG52YXIgYXJyYXlTaGFwZSA9IGZsYXR0ZW5VdGlsLnNoYXBlXG5cbnZhciBhcnJheVR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvYXJyYXl0eXBlcy5qc29uJylcbnZhciBidWZmZXJUeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL2R0eXBlcy5qc29uJylcbnZhciB1c2FnZVR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvdXNhZ2UuanNvbicpXG5cbnZhciBHTF9TVEFUSUNfRFJBVyA9IDB4ODhFNFxudmFyIEdMX1NUUkVBTV9EUkFXID0gMHg4OEUwXG5cbnZhciBHTF9VTlNJR05FRF9CWVRFID0gNTEyMVxudmFyIEdMX0ZMT0FUID0gNTEyNlxuXG52YXIgRFRZUEVTX1NJWkVTID0gW11cbkRUWVBFU19TSVpFU1s1MTIwXSA9IDEgLy8gaW50OFxuRFRZUEVTX1NJWkVTWzUxMjJdID0gMiAvLyBpbnQxNlxuRFRZUEVTX1NJWkVTWzUxMjRdID0gNCAvLyBpbnQzMlxuRFRZUEVTX1NJWkVTWzUxMjFdID0gMSAvLyB1aW50OFxuRFRZUEVTX1NJWkVTWzUxMjNdID0gMiAvLyB1aW50MTZcbkRUWVBFU19TSVpFU1s1MTI1XSA9IDQgLy8gdWludDMyXG5EVFlQRVNfU0laRVNbNTEyNl0gPSA0IC8vIGZsb2F0MzJcblxuZnVuY3Rpb24gdHlwZWRBcnJheUNvZGUgKGRhdGEpIHtcbiAgcmV0dXJuIGFycmF5VHlwZXNbT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGRhdGEpXSB8IDBcbn1cblxuZnVuY3Rpb24gY29weUFycmF5IChvdXQsIGlucCkge1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGlucC5sZW5ndGg7ICsraSkge1xuICAgIG91dFtpXSA9IGlucFtpXVxuICB9XG59XG5cbmZ1bmN0aW9uIHRyYW5zcG9zZSAoXG4gIHJlc3VsdCwgZGF0YSwgc2hhcGVYLCBzaGFwZVksIHN0cmlkZVgsIHN0cmlkZVksIG9mZnNldCkge1xuICB2YXIgcHRyID0gMFxuICBmb3IgKHZhciBpID0gMDsgaSA8IHNoYXBlWDsgKytpKSB7XG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBzaGFwZVk7ICsraikge1xuICAgICAgcmVzdWx0W3B0cisrXSA9IGRhdGFbc3RyaWRlWCAqIGkgKyBzdHJpZGVZICogaiArIG9mZnNldF1cbiAgICB9XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwQnVmZmVyU3RhdGUgKGdsLCBzdGF0cywgY29uZmlnKSB7XG4gIHZhciBidWZmZXJDb3VudCA9IDBcbiAgdmFyIGJ1ZmZlclNldCA9IHt9XG5cbiAgZnVuY3Rpb24gUkVHTEJ1ZmZlciAodHlwZSkge1xuICAgIHRoaXMuaWQgPSBidWZmZXJDb3VudCsrXG4gICAgdGhpcy5idWZmZXIgPSBnbC5jcmVhdGVCdWZmZXIoKVxuICAgIHRoaXMudHlwZSA9IHR5cGVcbiAgICB0aGlzLnVzYWdlID0gR0xfU1RBVElDX0RSQVdcbiAgICB0aGlzLmJ5dGVMZW5ndGggPSAwXG4gICAgdGhpcy5kaW1lbnNpb24gPSAxXG4gICAgdGhpcy5kdHlwZSA9IEdMX1VOU0lHTkVEX0JZVEVcblxuICAgIHRoaXMucGVyc2lzdGVudERhdGEgPSBudWxsXG5cbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgIHRoaXMuc3RhdHMgPSB7c2l6ZTogMH1cbiAgICB9XG4gIH1cblxuICBSRUdMQnVmZmVyLnByb3RvdHlwZS5iaW5kID0gZnVuY3Rpb24gKCkge1xuICAgIGdsLmJpbmRCdWZmZXIodGhpcy50eXBlLCB0aGlzLmJ1ZmZlcilcbiAgfVxuXG4gIFJFR0xCdWZmZXIucHJvdG90eXBlLmRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7XG4gICAgZGVzdHJveSh0aGlzKVxuICB9XG5cbiAgdmFyIHN0cmVhbVBvb2wgPSBbXVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZVN0cmVhbSAodHlwZSwgZGF0YSkge1xuICAgIHZhciBidWZmZXIgPSBzdHJlYW1Qb29sLnBvcCgpXG4gICAgaWYgKCFidWZmZXIpIHtcbiAgICAgIGJ1ZmZlciA9IG5ldyBSRUdMQnVmZmVyKHR5cGUpXG4gICAgfVxuICAgIGJ1ZmZlci5iaW5kKClcbiAgICBpbml0QnVmZmVyRnJvbURhdGEoYnVmZmVyLCBkYXRhLCBHTF9TVFJFQU1fRFJBVywgMCwgMSwgZmFsc2UpXG4gICAgcmV0dXJuIGJ1ZmZlclxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveVN0cmVhbSAoc3RyZWFtKSB7XG4gICAgc3RyZWFtUG9vbC5wdXNoKHN0cmVhbSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGluaXRCdWZmZXJGcm9tVHlwZWRBcnJheSAoYnVmZmVyLCBkYXRhLCB1c2FnZSkge1xuICAgIGJ1ZmZlci5ieXRlTGVuZ3RoID0gZGF0YS5ieXRlTGVuZ3RoXG4gICAgZ2wuYnVmZmVyRGF0YShidWZmZXIudHlwZSwgZGF0YSwgdXNhZ2UpXG4gIH1cblxuICBmdW5jdGlvbiBpbml0QnVmZmVyRnJvbURhdGEgKGJ1ZmZlciwgZGF0YSwgdXNhZ2UsIGR0eXBlLCBkaW1lbnNpb24sIHBlcnNpc3QpIHtcbiAgICB2YXIgc2hhcGVcbiAgICBidWZmZXIudXNhZ2UgPSB1c2FnZVxuICAgIGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XG4gICAgICBidWZmZXIuZHR5cGUgPSBkdHlwZSB8fCBHTF9GTE9BVFxuICAgICAgaWYgKGRhdGEubGVuZ3RoID4gMCkge1xuICAgICAgICB2YXIgZmxhdERhdGFcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YVswXSkpIHtcbiAgICAgICAgICBzaGFwZSA9IGFycmF5U2hhcGUoZGF0YSlcbiAgICAgICAgICB2YXIgZGltID0gMVxuICAgICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgc2hhcGUubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICAgIGRpbSAqPSBzaGFwZVtpXVxuICAgICAgICAgIH1cbiAgICAgICAgICBidWZmZXIuZGltZW5zaW9uID0gZGltXG4gICAgICAgICAgZmxhdERhdGEgPSBhcnJheUZsYXR0ZW4oZGF0YSwgc2hhcGUsIGJ1ZmZlci5kdHlwZSlcbiAgICAgICAgICBpbml0QnVmZmVyRnJvbVR5cGVkQXJyYXkoYnVmZmVyLCBmbGF0RGF0YSwgdXNhZ2UpXG4gICAgICAgICAgaWYgKHBlcnNpc3QpIHtcbiAgICAgICAgICAgIGJ1ZmZlci5wZXJzaXN0ZW50RGF0YSA9IGZsYXREYXRhXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBvb2wuZnJlZVR5cGUoZmxhdERhdGEpXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBkYXRhWzBdID09PSAnbnVtYmVyJykge1xuICAgICAgICAgIGJ1ZmZlci5kaW1lbnNpb24gPSBkaW1lbnNpb25cbiAgICAgICAgICB2YXIgdHlwZWREYXRhID0gcG9vbC5hbGxvY1R5cGUoYnVmZmVyLmR0eXBlLCBkYXRhLmxlbmd0aClcbiAgICAgICAgICBjb3B5QXJyYXkodHlwZWREYXRhLCBkYXRhKVxuICAgICAgICAgIGluaXRCdWZmZXJGcm9tVHlwZWRBcnJheShidWZmZXIsIHR5cGVkRGF0YSwgdXNhZ2UpXG4gICAgICAgICAgaWYgKHBlcnNpc3QpIHtcbiAgICAgICAgICAgIGJ1ZmZlci5wZXJzaXN0ZW50RGF0YSA9IHR5cGVkRGF0YVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwb29sLmZyZWVUeXBlKHR5cGVkRGF0YSlcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoaXNUeXBlZEFycmF5KGRhdGFbMF0pKSB7XG4gICAgICAgICAgYnVmZmVyLmRpbWVuc2lvbiA9IGRhdGFbMF0ubGVuZ3RoXG4gICAgICAgICAgYnVmZmVyLmR0eXBlID0gZHR5cGUgfHwgdHlwZWRBcnJheUNvZGUoZGF0YVswXSkgfHwgR0xfRkxPQVRcbiAgICAgICAgICBmbGF0RGF0YSA9IGFycmF5RmxhdHRlbihcbiAgICAgICAgICAgIGRhdGEsXG4gICAgICAgICAgICBbZGF0YS5sZW5ndGgsIGRhdGFbMF0ubGVuZ3RoXSxcbiAgICAgICAgICAgIGJ1ZmZlci5kdHlwZSlcbiAgICAgICAgICBpbml0QnVmZmVyRnJvbVR5cGVkQXJyYXkoYnVmZmVyLCBmbGF0RGF0YSwgdXNhZ2UpXG4gICAgICAgICAgaWYgKHBlcnNpc3QpIHtcbiAgICAgICAgICAgIGJ1ZmZlci5wZXJzaXN0ZW50RGF0YSA9IGZsYXREYXRhXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBvb2wuZnJlZVR5cGUoZmxhdERhdGEpXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNoZWNrLnJhaXNlKCdpbnZhbGlkIGJ1ZmZlciBkYXRhJylcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoaXNUeXBlZEFycmF5KGRhdGEpKSB7XG4gICAgICBidWZmZXIuZHR5cGUgPSBkdHlwZSB8fCB0eXBlZEFycmF5Q29kZShkYXRhKVxuICAgICAgYnVmZmVyLmRpbWVuc2lvbiA9IGRpbWVuc2lvblxuICAgICAgaW5pdEJ1ZmZlckZyb21UeXBlZEFycmF5KGJ1ZmZlciwgZGF0YSwgdXNhZ2UpXG4gICAgICBpZiAocGVyc2lzdCkge1xuICAgICAgICBidWZmZXIucGVyc2lzdGVudERhdGEgPSBuZXcgVWludDhBcnJheShuZXcgVWludDhBcnJheShkYXRhLmJ1ZmZlcikpXG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChpc05EQXJyYXlMaWtlKGRhdGEpKSB7XG4gICAgICBzaGFwZSA9IGRhdGEuc2hhcGVcbiAgICAgIHZhciBzdHJpZGUgPSBkYXRhLnN0cmlkZVxuICAgICAgdmFyIG9mZnNldCA9IGRhdGEub2Zmc2V0XG5cbiAgICAgIHZhciBzaGFwZVggPSAwXG4gICAgICB2YXIgc2hhcGVZID0gMFxuICAgICAgdmFyIHN0cmlkZVggPSAwXG4gICAgICB2YXIgc3RyaWRlWSA9IDBcbiAgICAgIGlmIChzaGFwZS5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgc2hhcGVYID0gc2hhcGVbMF1cbiAgICAgICAgc2hhcGVZID0gMVxuICAgICAgICBzdHJpZGVYID0gc3RyaWRlWzBdXG4gICAgICAgIHN0cmlkZVkgPSAwXG4gICAgICB9IGVsc2UgaWYgKHNoYXBlLmxlbmd0aCA9PT0gMikge1xuICAgICAgICBzaGFwZVggPSBzaGFwZVswXVxuICAgICAgICBzaGFwZVkgPSBzaGFwZVsxXVxuICAgICAgICBzdHJpZGVYID0gc3RyaWRlWzBdXG4gICAgICAgIHN0cmlkZVkgPSBzdHJpZGVbMV1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNoZWNrLnJhaXNlKCdpbnZhbGlkIHNoYXBlJylcbiAgICAgIH1cblxuICAgICAgYnVmZmVyLmR0eXBlID0gZHR5cGUgfHwgdHlwZWRBcnJheUNvZGUoZGF0YS5kYXRhKSB8fCBHTF9GTE9BVFxuICAgICAgYnVmZmVyLmRpbWVuc2lvbiA9IHNoYXBlWVxuXG4gICAgICB2YXIgdHJhbnNwb3NlRGF0YSA9IHBvb2wuYWxsb2NUeXBlKGJ1ZmZlci5kdHlwZSwgc2hhcGVYICogc2hhcGVZKVxuICAgICAgdHJhbnNwb3NlKHRyYW5zcG9zZURhdGEsXG4gICAgICAgIGRhdGEuZGF0YSxcbiAgICAgICAgc2hhcGVYLCBzaGFwZVksXG4gICAgICAgIHN0cmlkZVgsIHN0cmlkZVksXG4gICAgICAgIG9mZnNldClcbiAgICAgIGluaXRCdWZmZXJGcm9tVHlwZWRBcnJheShidWZmZXIsIHRyYW5zcG9zZURhdGEsIHVzYWdlKVxuICAgICAgaWYgKHBlcnNpc3QpIHtcbiAgICAgICAgYnVmZmVyLnBlcnNpc3RlbnREYXRhID0gdHJhbnNwb3NlRGF0YVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcG9vbC5mcmVlVHlwZSh0cmFuc3Bvc2VEYXRhKVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjaGVjay5yYWlzZSgnaW52YWxpZCBidWZmZXIgZGF0YScpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSAoYnVmZmVyKSB7XG4gICAgc3RhdHMuYnVmZmVyQ291bnQtLVxuXG4gICAgdmFyIGhhbmRsZSA9IGJ1ZmZlci5idWZmZXJcbiAgICBjaGVjayhoYW5kbGUsICdidWZmZXIgbXVzdCBub3QgYmUgZGVsZXRlZCBhbHJlYWR5JylcbiAgICBnbC5kZWxldGVCdWZmZXIoaGFuZGxlKVxuICAgIGJ1ZmZlci5idWZmZXIgPSBudWxsXG4gICAgZGVsZXRlIGJ1ZmZlclNldFtidWZmZXIuaWRdXG4gIH1cblxuICBmdW5jdGlvbiBjcmVhdGVCdWZmZXIgKG9wdGlvbnMsIHR5cGUsIGRlZmVySW5pdCwgcGVyc2lzdGVudCkge1xuICAgIHN0YXRzLmJ1ZmZlckNvdW50KytcblxuICAgIHZhciBidWZmZXIgPSBuZXcgUkVHTEJ1ZmZlcih0eXBlKVxuICAgIGJ1ZmZlclNldFtidWZmZXIuaWRdID0gYnVmZmVyXG5cbiAgICBmdW5jdGlvbiByZWdsQnVmZmVyIChvcHRpb25zKSB7XG4gICAgICB2YXIgdXNhZ2UgPSBHTF9TVEFUSUNfRFJBV1xuICAgICAgdmFyIGRhdGEgPSBudWxsXG4gICAgICB2YXIgYnl0ZUxlbmd0aCA9IDBcbiAgICAgIHZhciBkdHlwZSA9IDBcbiAgICAgIHZhciBkaW1lbnNpb24gPSAxXG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShvcHRpb25zKSB8fFxuICAgICAgICAgIGlzVHlwZWRBcnJheShvcHRpb25zKSB8fFxuICAgICAgICAgIGlzTkRBcnJheUxpa2Uob3B0aW9ucykpIHtcbiAgICAgICAgZGF0YSA9IG9wdGlvbnNcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIG9wdGlvbnMgPT09ICdudW1iZXInKSB7XG4gICAgICAgIGJ5dGVMZW5ndGggPSBvcHRpb25zIHwgMFxuICAgICAgfSBlbHNlIGlmIChvcHRpb25zKSB7XG4gICAgICAgIGNoZWNrLnR5cGUoXG4gICAgICAgICAgb3B0aW9ucywgJ29iamVjdCcsXG4gICAgICAgICAgJ2J1ZmZlciBhcmd1bWVudHMgbXVzdCBiZSBhbiBvYmplY3QsIGEgbnVtYmVyIG9yIGFuIGFycmF5JylcblxuICAgICAgICBpZiAoJ2RhdGEnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBjaGVjayhcbiAgICAgICAgICAgIGRhdGEgPT09IG51bGwgfHxcbiAgICAgICAgICAgIEFycmF5LmlzQXJyYXkoZGF0YSkgfHxcbiAgICAgICAgICAgIGlzVHlwZWRBcnJheShkYXRhKSB8fFxuICAgICAgICAgICAgaXNOREFycmF5TGlrZShkYXRhKSxcbiAgICAgICAgICAgICdpbnZhbGlkIGRhdGEgZm9yIGJ1ZmZlcicpXG4gICAgICAgICAgZGF0YSA9IG9wdGlvbnMuZGF0YVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCd1c2FnZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGNoZWNrLnBhcmFtZXRlcihvcHRpb25zLnVzYWdlLCB1c2FnZVR5cGVzLCAnaW52YWxpZCBidWZmZXIgdXNhZ2UnKVxuICAgICAgICAgIHVzYWdlID0gdXNhZ2VUeXBlc1tvcHRpb25zLnVzYWdlXVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCd0eXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgY2hlY2sucGFyYW1ldGVyKG9wdGlvbnMudHlwZSwgYnVmZmVyVHlwZXMsICdpbnZhbGlkIGJ1ZmZlciB0eXBlJylcbiAgICAgICAgICBkdHlwZSA9IGJ1ZmZlclR5cGVzW29wdGlvbnMudHlwZV1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnZGltZW5zaW9uJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgY2hlY2sudHlwZShvcHRpb25zLmRpbWVuc2lvbiwgJ251bWJlcicsICdpbnZhbGlkIGRpbWVuc2lvbicpXG4gICAgICAgICAgZGltZW5zaW9uID0gb3B0aW9ucy5kaW1lbnNpb24gfCAwXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ2xlbmd0aCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGNoZWNrLm5uaShieXRlTGVuZ3RoLCAnYnVmZmVyIGxlbmd0aCBtdXN0IGJlIGEgbm9ubmVnYXRpdmUgaW50ZWdlcicpXG4gICAgICAgICAgYnl0ZUxlbmd0aCA9IG9wdGlvbnMubGVuZ3RoIHwgMFxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGJ1ZmZlci5iaW5kKClcbiAgICAgIGlmICghZGF0YSkge1xuICAgICAgICBnbC5idWZmZXJEYXRhKGJ1ZmZlci50eXBlLCBieXRlTGVuZ3RoLCB1c2FnZSlcbiAgICAgICAgYnVmZmVyLmR0eXBlID0gZHR5cGUgfHwgR0xfVU5TSUdORURfQllURVxuICAgICAgICBidWZmZXIudXNhZ2UgPSB1c2FnZVxuICAgICAgICBidWZmZXIuZGltZW5zaW9uID0gZGltZW5zaW9uXG4gICAgICAgIGJ1ZmZlci5ieXRlTGVuZ3RoID0gYnl0ZUxlbmd0aFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaW5pdEJ1ZmZlckZyb21EYXRhKGJ1ZmZlciwgZGF0YSwgdXNhZ2UsIGR0eXBlLCBkaW1lbnNpb24sIHBlcnNpc3RlbnQpXG4gICAgICB9XG5cbiAgICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgICBidWZmZXIuc3RhdHMuc2l6ZSA9IGJ1ZmZlci5ieXRlTGVuZ3RoICogRFRZUEVTX1NJWkVTW2J1ZmZlci5kdHlwZV1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJlZ2xCdWZmZXJcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzZXRTdWJEYXRhIChkYXRhLCBvZmZzZXQpIHtcbiAgICAgIGNoZWNrKG9mZnNldCArIGRhdGEuYnl0ZUxlbmd0aCA8PSBidWZmZXIuYnl0ZUxlbmd0aCxcbiAgICAgICAgJ2ludmFsaWQgYnVmZmVyIHN1YmRhdGEgY2FsbCwgYnVmZmVyIGlzIHRvbyBzbWFsbC4gJyArICcgQ2FuXFwndCB3cml0ZSBkYXRhIG9mIHNpemUgJyArIGRhdGEuYnl0ZUxlbmd0aCArICcgc3RhcnRpbmcgZnJvbSBvZmZzZXQgJyArIG9mZnNldCArICcgdG8gYSBidWZmZXIgb2Ygc2l6ZSAnICsgYnVmZmVyLmJ5dGVMZW5ndGgpXG5cbiAgICAgIGdsLmJ1ZmZlclN1YkRhdGEoYnVmZmVyLnR5cGUsIG9mZnNldCwgZGF0YSlcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzdWJkYXRhIChkYXRhLCBvZmZzZXRfKSB7XG4gICAgICB2YXIgb2Zmc2V0ID0gKG9mZnNldF8gfHwgMCkgfCAwXG4gICAgICB2YXIgc2hhcGVcbiAgICAgIGJ1ZmZlci5iaW5kKClcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XG4gICAgICAgIGlmIChkYXRhLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBpZiAodHlwZW9mIGRhdGFbMF0gPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICB2YXIgY29udmVydGVkID0gcG9vbC5hbGxvY1R5cGUoYnVmZmVyLmR0eXBlLCBkYXRhLmxlbmd0aClcbiAgICAgICAgICAgIGNvcHlBcnJheShjb252ZXJ0ZWQsIGRhdGEpXG4gICAgICAgICAgICBzZXRTdWJEYXRhKGNvbnZlcnRlZCwgb2Zmc2V0KVxuICAgICAgICAgICAgcG9vbC5mcmVlVHlwZShjb252ZXJ0ZWQpXG4gICAgICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGRhdGFbMF0pIHx8IGlzVHlwZWRBcnJheShkYXRhWzBdKSkge1xuICAgICAgICAgICAgc2hhcGUgPSBhcnJheVNoYXBlKGRhdGEpXG4gICAgICAgICAgICB2YXIgZmxhdERhdGEgPSBhcnJheUZsYXR0ZW4oZGF0YSwgc2hhcGUsIGJ1ZmZlci5kdHlwZSlcbiAgICAgICAgICAgIHNldFN1YkRhdGEoZmxhdERhdGEsIG9mZnNldClcbiAgICAgICAgICAgIHBvb2wuZnJlZVR5cGUoZmxhdERhdGEpXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNoZWNrLnJhaXNlKCdpbnZhbGlkIGJ1ZmZlciBkYXRhJylcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoaXNUeXBlZEFycmF5KGRhdGEpKSB7XG4gICAgICAgIHNldFN1YkRhdGEoZGF0YSwgb2Zmc2V0KVxuICAgICAgfSBlbHNlIGlmIChpc05EQXJyYXlMaWtlKGRhdGEpKSB7XG4gICAgICAgIHNoYXBlID0gZGF0YS5zaGFwZVxuICAgICAgICB2YXIgc3RyaWRlID0gZGF0YS5zdHJpZGVcblxuICAgICAgICB2YXIgc2hhcGVYID0gMFxuICAgICAgICB2YXIgc2hhcGVZID0gMFxuICAgICAgICB2YXIgc3RyaWRlWCA9IDBcbiAgICAgICAgdmFyIHN0cmlkZVkgPSAwXG4gICAgICAgIGlmIChzaGFwZS5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICBzaGFwZVggPSBzaGFwZVswXVxuICAgICAgICAgIHNoYXBlWSA9IDFcbiAgICAgICAgICBzdHJpZGVYID0gc3RyaWRlWzBdXG4gICAgICAgICAgc3RyaWRlWSA9IDBcbiAgICAgICAgfSBlbHNlIGlmIChzaGFwZS5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgICBzaGFwZVggPSBzaGFwZVswXVxuICAgICAgICAgIHNoYXBlWSA9IHNoYXBlWzFdXG4gICAgICAgICAgc3RyaWRlWCA9IHN0cmlkZVswXVxuICAgICAgICAgIHN0cmlkZVkgPSBzdHJpZGVbMV1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjaGVjay5yYWlzZSgnaW52YWxpZCBzaGFwZScpXG4gICAgICAgIH1cbiAgICAgICAgdmFyIGR0eXBlID0gQXJyYXkuaXNBcnJheShkYXRhLmRhdGEpXG4gICAgICAgICAgPyBidWZmZXIuZHR5cGVcbiAgICAgICAgICA6IHR5cGVkQXJyYXlDb2RlKGRhdGEuZGF0YSlcblxuICAgICAgICB2YXIgdHJhbnNwb3NlRGF0YSA9IHBvb2wuYWxsb2NUeXBlKGR0eXBlLCBzaGFwZVggKiBzaGFwZVkpXG4gICAgICAgIHRyYW5zcG9zZSh0cmFuc3Bvc2VEYXRhLFxuICAgICAgICAgIGRhdGEuZGF0YSxcbiAgICAgICAgICBzaGFwZVgsIHNoYXBlWSxcbiAgICAgICAgICBzdHJpZGVYLCBzdHJpZGVZLFxuICAgICAgICAgIGRhdGEub2Zmc2V0KVxuICAgICAgICBzZXRTdWJEYXRhKHRyYW5zcG9zZURhdGEsIG9mZnNldClcbiAgICAgICAgcG9vbC5mcmVlVHlwZSh0cmFuc3Bvc2VEYXRhKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY2hlY2sucmFpc2UoJ2ludmFsaWQgZGF0YSBmb3IgYnVmZmVyIHN1YmRhdGEnKVxuICAgICAgfVxuICAgICAgcmV0dXJuIHJlZ2xCdWZmZXJcbiAgICB9XG5cbiAgICBpZiAoIWRlZmVySW5pdCkge1xuICAgICAgcmVnbEJ1ZmZlcihvcHRpb25zKVxuICAgIH1cblxuICAgIHJlZ2xCdWZmZXIuX3JlZ2xUeXBlID0gJ2J1ZmZlcidcbiAgICByZWdsQnVmZmVyLl9idWZmZXIgPSBidWZmZXJcbiAgICByZWdsQnVmZmVyLnN1YmRhdGEgPSBzdWJkYXRhXG4gICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICByZWdsQnVmZmVyLnN0YXRzID0gYnVmZmVyLnN0YXRzXG4gICAgfVxuICAgIHJlZ2xCdWZmZXIuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHsgZGVzdHJveShidWZmZXIpIH1cblxuICAgIHJldHVybiByZWdsQnVmZmVyXG4gIH1cblxuICBmdW5jdGlvbiByZXN0b3JlQnVmZmVycyAoKSB7XG4gICAgdmFsdWVzKGJ1ZmZlclNldCkuZm9yRWFjaChmdW5jdGlvbiAoYnVmZmVyKSB7XG4gICAgICBidWZmZXIuYnVmZmVyID0gZ2wuY3JlYXRlQnVmZmVyKClcbiAgICAgIGdsLmJpbmRCdWZmZXIoYnVmZmVyLnR5cGUsIGJ1ZmZlci5idWZmZXIpXG4gICAgICBnbC5idWZmZXJEYXRhKFxuICAgICAgICBidWZmZXIudHlwZSwgYnVmZmVyLnBlcnNpc3RlbnREYXRhIHx8IGJ1ZmZlci5ieXRlTGVuZ3RoLCBidWZmZXIudXNhZ2UpXG4gICAgfSlcbiAgfVxuXG4gIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgIHN0YXRzLmdldFRvdGFsQnVmZmVyU2l6ZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciB0b3RhbCA9IDBcbiAgICAgIC8vIFRPRE86IFJpZ2h0IG5vdywgdGhlIHN0cmVhbXMgYXJlIG5vdCBwYXJ0IG9mIHRoZSB0b3RhbCBjb3VudC5cbiAgICAgIE9iamVjdC5rZXlzKGJ1ZmZlclNldCkuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgIHRvdGFsICs9IGJ1ZmZlclNldFtrZXldLnN0YXRzLnNpemVcbiAgICAgIH0pXG4gICAgICByZXR1cm4gdG90YWxcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNyZWF0ZTogY3JlYXRlQnVmZmVyLFxuXG4gICAgY3JlYXRlU3RyZWFtOiBjcmVhdGVTdHJlYW0sXG4gICAgZGVzdHJveVN0cmVhbTogZGVzdHJveVN0cmVhbSxcblxuICAgIGNsZWFyOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YWx1ZXMoYnVmZmVyU2V0KS5mb3JFYWNoKGRlc3Ryb3kpXG4gICAgICBzdHJlYW1Qb29sLmZvckVhY2goZGVzdHJveSlcbiAgICB9LFxuXG4gICAgZ2V0QnVmZmVyOiBmdW5jdGlvbiAod3JhcHBlcikge1xuICAgICAgaWYgKHdyYXBwZXIgJiYgd3JhcHBlci5fYnVmZmVyIGluc3RhbmNlb2YgUkVHTEJ1ZmZlcikge1xuICAgICAgICByZXR1cm4gd3JhcHBlci5fYnVmZmVyXG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH0sXG5cbiAgICByZXN0b3JlOiByZXN0b3JlQnVmZmVycyxcblxuICAgIF9pbml0QnVmZmVyOiBpbml0QnVmZmVyRnJvbURhdGFcbiAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICBcIltvYmplY3QgSW50OEFycmF5XVwiOiA1MTIwXG4sIFwiW29iamVjdCBJbnQxNkFycmF5XVwiOiA1MTIyXG4sIFwiW29iamVjdCBJbnQzMkFycmF5XVwiOiA1MTI0XG4sIFwiW29iamVjdCBVaW50OEFycmF5XVwiOiA1MTIxXG4sIFwiW29iamVjdCBVaW50OENsYW1wZWRBcnJheV1cIjogNTEyMVxuLCBcIltvYmplY3QgVWludDE2QXJyYXldXCI6IDUxMjNcbiwgXCJbb2JqZWN0IFVpbnQzMkFycmF5XVwiOiA1MTI1XG4sIFwiW29iamVjdCBGbG9hdDMyQXJyYXldXCI6IDUxMjZcbiwgXCJbb2JqZWN0IEZsb2F0NjRBcnJheV1cIjogNTEyMVxuLCBcIltvYmplY3QgQXJyYXlCdWZmZXJdXCI6IDUxMjFcbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgXCJpbnQ4XCI6IDUxMjBcbiwgXCJpbnQxNlwiOiA1MTIyXG4sIFwiaW50MzJcIjogNTEyNFxuLCBcInVpbnQ4XCI6IDUxMjFcbiwgXCJ1aW50MTZcIjogNTEyM1xuLCBcInVpbnQzMlwiOiA1MTI1XG4sIFwiZmxvYXRcIjogNTEyNlxuLCBcImZsb2F0MzJcIjogNTEyNlxufVxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICBcInBvaW50c1wiOiAwLFxuICBcInBvaW50XCI6IDAsXG4gIFwibGluZXNcIjogMSxcbiAgXCJsaW5lXCI6IDEsXG4gIFwibGluZSBsb29wXCI6IDIsXG4gIFwibGluZSBzdHJpcFwiOiAzLFxuICBcInRyaWFuZ2xlc1wiOiA0LFxuICBcInRyaWFuZ2xlXCI6IDQsXG4gIFwidHJpYW5nbGUgc3RyaXBcIjogNSxcbiAgXCJ0cmlhbmdsZSBmYW5cIjogNlxufVxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICBcInN0YXRpY1wiOiAzNTA0NCxcbiAgXCJkeW5hbWljXCI6IDM1MDQ4LFxuICBcInN0cmVhbVwiOiAzNTA0MFxufVxuIiwidmFyIGNoZWNrID0gcmVxdWlyZSgnLi91dGlsL2NoZWNrJylcbnZhciBjcmVhdGVFbnZpcm9ubWVudCA9IHJlcXVpcmUoJy4vdXRpbC9jb2RlZ2VuJylcbnZhciBsb29wID0gcmVxdWlyZSgnLi91dGlsL2xvb3AnKVxudmFyIGlzVHlwZWRBcnJheSA9IHJlcXVpcmUoJy4vdXRpbC9pcy10eXBlZC1hcnJheScpXG52YXIgaXNOREFycmF5ID0gcmVxdWlyZSgnLi91dGlsL2lzLW5kYXJyYXknKVxudmFyIGlzQXJyYXlMaWtlID0gcmVxdWlyZSgnLi91dGlsL2lzLWFycmF5LWxpa2UnKVxudmFyIGR5bmFtaWMgPSByZXF1aXJlKCcuL2R5bmFtaWMnKVxuXG52YXIgcHJpbVR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvcHJpbWl0aXZlcy5qc29uJylcbnZhciBnbFR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvZHR5cGVzLmpzb24nKVxuXG4vLyBcImN1dGVcIiBuYW1lcyBmb3IgdmVjdG9yIGNvbXBvbmVudHNcbnZhciBDVVRFX0NPTVBPTkVOVFMgPSAneHl6dycuc3BsaXQoJycpXG5cbnZhciBHTF9VTlNJR05FRF9CWVRFID0gNTEyMVxuXG52YXIgQVRUUklCX1NUQVRFX1BPSU5URVIgPSAxXG52YXIgQVRUUklCX1NUQVRFX0NPTlNUQU5UID0gMlxuXG52YXIgRFlOX0ZVTkMgPSAwXG52YXIgRFlOX1BST1AgPSAxXG52YXIgRFlOX0NPTlRFWFQgPSAyXG52YXIgRFlOX1NUQVRFID0gM1xudmFyIERZTl9USFVOSyA9IDRcblxudmFyIFNfRElUSEVSID0gJ2RpdGhlcidcbnZhciBTX0JMRU5EX0VOQUJMRSA9ICdibGVuZC5lbmFibGUnXG52YXIgU19CTEVORF9DT0xPUiA9ICdibGVuZC5jb2xvcidcbnZhciBTX0JMRU5EX0VRVUFUSU9OID0gJ2JsZW5kLmVxdWF0aW9uJ1xudmFyIFNfQkxFTkRfRlVOQyA9ICdibGVuZC5mdW5jJ1xudmFyIFNfREVQVEhfRU5BQkxFID0gJ2RlcHRoLmVuYWJsZSdcbnZhciBTX0RFUFRIX0ZVTkMgPSAnZGVwdGguZnVuYydcbnZhciBTX0RFUFRIX1JBTkdFID0gJ2RlcHRoLnJhbmdlJ1xudmFyIFNfREVQVEhfTUFTSyA9ICdkZXB0aC5tYXNrJ1xudmFyIFNfQ09MT1JfTUFTSyA9ICdjb2xvck1hc2snXG52YXIgU19DVUxMX0VOQUJMRSA9ICdjdWxsLmVuYWJsZSdcbnZhciBTX0NVTExfRkFDRSA9ICdjdWxsLmZhY2UnXG52YXIgU19GUk9OVF9GQUNFID0gJ2Zyb250RmFjZSdcbnZhciBTX0xJTkVfV0lEVEggPSAnbGluZVdpZHRoJ1xudmFyIFNfUE9MWUdPTl9PRkZTRVRfRU5BQkxFID0gJ3BvbHlnb25PZmZzZXQuZW5hYmxlJ1xudmFyIFNfUE9MWUdPTl9PRkZTRVRfT0ZGU0VUID0gJ3BvbHlnb25PZmZzZXQub2Zmc2V0J1xudmFyIFNfU0FNUExFX0FMUEhBID0gJ3NhbXBsZS5hbHBoYSdcbnZhciBTX1NBTVBMRV9FTkFCTEUgPSAnc2FtcGxlLmVuYWJsZSdcbnZhciBTX1NBTVBMRV9DT1ZFUkFHRSA9ICdzYW1wbGUuY292ZXJhZ2UnXG52YXIgU19TVEVOQ0lMX0VOQUJMRSA9ICdzdGVuY2lsLmVuYWJsZSdcbnZhciBTX1NURU5DSUxfTUFTSyA9ICdzdGVuY2lsLm1hc2snXG52YXIgU19TVEVOQ0lMX0ZVTkMgPSAnc3RlbmNpbC5mdW5jJ1xudmFyIFNfU1RFTkNJTF9PUEZST05UID0gJ3N0ZW5jaWwub3BGcm9udCdcbnZhciBTX1NURU5DSUxfT1BCQUNLID0gJ3N0ZW5jaWwub3BCYWNrJ1xudmFyIFNfU0NJU1NPUl9FTkFCTEUgPSAnc2Npc3Nvci5lbmFibGUnXG52YXIgU19TQ0lTU09SX0JPWCA9ICdzY2lzc29yLmJveCdcbnZhciBTX1ZJRVdQT1JUID0gJ3ZpZXdwb3J0J1xuXG52YXIgU19QUk9GSUxFID0gJ3Byb2ZpbGUnXG5cbnZhciBTX0ZSQU1FQlVGRkVSID0gJ2ZyYW1lYnVmZmVyJ1xudmFyIFNfVkVSVCA9ICd2ZXJ0J1xudmFyIFNfRlJBRyA9ICdmcmFnJ1xudmFyIFNfRUxFTUVOVFMgPSAnZWxlbWVudHMnXG52YXIgU19QUklNSVRJVkUgPSAncHJpbWl0aXZlJ1xudmFyIFNfQ09VTlQgPSAnY291bnQnXG52YXIgU19PRkZTRVQgPSAnb2Zmc2V0J1xudmFyIFNfSU5TVEFOQ0VTID0gJ2luc3RhbmNlcydcblxudmFyIFNVRkZJWF9XSURUSCA9ICdXaWR0aCdcbnZhciBTVUZGSVhfSEVJR0hUID0gJ0hlaWdodCdcblxudmFyIFNfRlJBTUVCVUZGRVJfV0lEVEggPSBTX0ZSQU1FQlVGRkVSICsgU1VGRklYX1dJRFRIXG52YXIgU19GUkFNRUJVRkZFUl9IRUlHSFQgPSBTX0ZSQU1FQlVGRkVSICsgU1VGRklYX0hFSUdIVFxudmFyIFNfVklFV1BPUlRfV0lEVEggPSBTX1ZJRVdQT1JUICsgU1VGRklYX1dJRFRIXG52YXIgU19WSUVXUE9SVF9IRUlHSFQgPSBTX1ZJRVdQT1JUICsgU1VGRklYX0hFSUdIVFxudmFyIFNfRFJBV0lOR0JVRkZFUiA9ICdkcmF3aW5nQnVmZmVyJ1xudmFyIFNfRFJBV0lOR0JVRkZFUl9XSURUSCA9IFNfRFJBV0lOR0JVRkZFUiArIFNVRkZJWF9XSURUSFxudmFyIFNfRFJBV0lOR0JVRkZFUl9IRUlHSFQgPSBTX0RSQVdJTkdCVUZGRVIgKyBTVUZGSVhfSEVJR0hUXG5cbnZhciBORVNURURfT1BUSU9OUyA9IFtcbiAgU19CTEVORF9GVU5DLFxuICBTX0JMRU5EX0VRVUFUSU9OLFxuICBTX1NURU5DSUxfRlVOQyxcbiAgU19TVEVOQ0lMX09QRlJPTlQsXG4gIFNfU1RFTkNJTF9PUEJBQ0ssXG4gIFNfU0FNUExFX0NPVkVSQUdFLFxuICBTX1ZJRVdQT1JULFxuICBTX1NDSVNTT1JfQk9YLFxuICBTX1BPTFlHT05fT0ZGU0VUX09GRlNFVFxuXVxuXG52YXIgR0xfQVJSQVlfQlVGRkVSID0gMzQ5NjJcbnZhciBHTF9FTEVNRU5UX0FSUkFZX0JVRkZFUiA9IDM0OTYzXG5cbnZhciBHTF9GUkFHTUVOVF9TSEFERVIgPSAzNTYzMlxudmFyIEdMX1ZFUlRFWF9TSEFERVIgPSAzNTYzM1xuXG52YXIgR0xfVEVYVFVSRV8yRCA9IDB4MERFMVxudmFyIEdMX1RFWFRVUkVfQ1VCRV9NQVAgPSAweDg1MTNcblxudmFyIEdMX0NVTExfRkFDRSA9IDB4MEI0NFxudmFyIEdMX0JMRU5EID0gMHgwQkUyXG52YXIgR0xfRElUSEVSID0gMHgwQkQwXG52YXIgR0xfU1RFTkNJTF9URVNUID0gMHgwQjkwXG52YXIgR0xfREVQVEhfVEVTVCA9IDB4MEI3MVxudmFyIEdMX1NDSVNTT1JfVEVTVCA9IDB4MEMxMVxudmFyIEdMX1BPTFlHT05fT0ZGU0VUX0ZJTEwgPSAweDgwMzdcbnZhciBHTF9TQU1QTEVfQUxQSEFfVE9fQ09WRVJBR0UgPSAweDgwOUVcbnZhciBHTF9TQU1QTEVfQ09WRVJBR0UgPSAweDgwQTBcblxudmFyIEdMX0ZMT0FUID0gNTEyNlxudmFyIEdMX0ZMT0FUX1ZFQzIgPSAzNTY2NFxudmFyIEdMX0ZMT0FUX1ZFQzMgPSAzNTY2NVxudmFyIEdMX0ZMT0FUX1ZFQzQgPSAzNTY2NlxudmFyIEdMX0lOVCA9IDUxMjRcbnZhciBHTF9JTlRfVkVDMiA9IDM1NjY3XG52YXIgR0xfSU5UX1ZFQzMgPSAzNTY2OFxudmFyIEdMX0lOVF9WRUM0ID0gMzU2NjlcbnZhciBHTF9CT09MID0gMzU2NzBcbnZhciBHTF9CT09MX1ZFQzIgPSAzNTY3MVxudmFyIEdMX0JPT0xfVkVDMyA9IDM1NjcyXG52YXIgR0xfQk9PTF9WRUM0ID0gMzU2NzNcbnZhciBHTF9GTE9BVF9NQVQyID0gMzU2NzRcbnZhciBHTF9GTE9BVF9NQVQzID0gMzU2NzVcbnZhciBHTF9GTE9BVF9NQVQ0ID0gMzU2NzZcbnZhciBHTF9TQU1QTEVSXzJEID0gMzU2NzhcbnZhciBHTF9TQU1QTEVSX0NVQkUgPSAzNTY4MFxuXG52YXIgR0xfVFJJQU5HTEVTID0gNFxuXG52YXIgR0xfRlJPTlQgPSAxMDI4XG52YXIgR0xfQkFDSyA9IDEwMjlcbnZhciBHTF9DVyA9IDB4MDkwMFxudmFyIEdMX0NDVyA9IDB4MDkwMVxudmFyIEdMX01JTl9FWFQgPSAweDgwMDdcbnZhciBHTF9NQVhfRVhUID0gMHg4MDA4XG52YXIgR0xfQUxXQVlTID0gNTE5XG52YXIgR0xfS0VFUCA9IDc2ODBcbnZhciBHTF9aRVJPID0gMFxudmFyIEdMX09ORSA9IDFcbnZhciBHTF9GVU5DX0FERCA9IDB4ODAwNlxudmFyIEdMX0xFU1MgPSA1MTNcblxudmFyIEdMX0ZSQU1FQlVGRkVSID0gMHg4RDQwXG52YXIgR0xfQ09MT1JfQVRUQUNITUVOVDAgPSAweDhDRTBcblxudmFyIGJsZW5kRnVuY3MgPSB7XG4gICcwJzogMCxcbiAgJzEnOiAxLFxuICAnemVybyc6IDAsXG4gICdvbmUnOiAxLFxuICAnc3JjIGNvbG9yJzogNzY4LFxuICAnb25lIG1pbnVzIHNyYyBjb2xvcic6IDc2OSxcbiAgJ3NyYyBhbHBoYSc6IDc3MCxcbiAgJ29uZSBtaW51cyBzcmMgYWxwaGEnOiA3NzEsXG4gICdkc3QgY29sb3InOiA3NzQsXG4gICdvbmUgbWludXMgZHN0IGNvbG9yJzogNzc1LFxuICAnZHN0IGFscGhhJzogNzcyLFxuICAnb25lIG1pbnVzIGRzdCBhbHBoYSc6IDc3MyxcbiAgJ2NvbnN0YW50IGNvbG9yJzogMzI3NjksXG4gICdvbmUgbWludXMgY29uc3RhbnQgY29sb3InOiAzMjc3MCxcbiAgJ2NvbnN0YW50IGFscGhhJzogMzI3NzEsXG4gICdvbmUgbWludXMgY29uc3RhbnQgYWxwaGEnOiAzMjc3MixcbiAgJ3NyYyBhbHBoYSBzYXR1cmF0ZSc6IDc3NlxufVxuXG4vLyBUaGVyZSBhcmUgaW52YWxpZCB2YWx1ZXMgZm9yIHNyY1JHQiBhbmQgZHN0UkdCLiBTZWU6XG4vLyBodHRwczovL3d3dy5raHJvbm9zLm9yZy9yZWdpc3RyeS93ZWJnbC9zcGVjcy8xLjAvIzYuMTNcbi8vIGh0dHBzOi8vZ2l0aHViLmNvbS9LaHJvbm9zR3JvdXAvV2ViR0wvYmxvYi8wZDMyMDFmNWY3ZWMzYzAwNjBiYzFmMDQwNzc0NjE1NDFmMTk4N2I5L2NvbmZvcm1hbmNlLXN1aXRlcy8xLjAuMy9jb25mb3JtYW5jZS9taXNjL3dlYmdsLXNwZWNpZmljLmh0bWwjTDU2XG52YXIgaW52YWxpZEJsZW5kQ29tYmluYXRpb25zID0gW1xuICAnY29uc3RhbnQgY29sb3IsIGNvbnN0YW50IGFscGhhJyxcbiAgJ29uZSBtaW51cyBjb25zdGFudCBjb2xvciwgY29uc3RhbnQgYWxwaGEnLFxuICAnY29uc3RhbnQgY29sb3IsIG9uZSBtaW51cyBjb25zdGFudCBhbHBoYScsXG4gICdvbmUgbWludXMgY29uc3RhbnQgY29sb3IsIG9uZSBtaW51cyBjb25zdGFudCBhbHBoYScsXG4gICdjb25zdGFudCBhbHBoYSwgY29uc3RhbnQgY29sb3InLFxuICAnY29uc3RhbnQgYWxwaGEsIG9uZSBtaW51cyBjb25zdGFudCBjb2xvcicsXG4gICdvbmUgbWludXMgY29uc3RhbnQgYWxwaGEsIGNvbnN0YW50IGNvbG9yJyxcbiAgJ29uZSBtaW51cyBjb25zdGFudCBhbHBoYSwgb25lIG1pbnVzIGNvbnN0YW50IGNvbG9yJ1xuXVxuXG52YXIgY29tcGFyZUZ1bmNzID0ge1xuICAnbmV2ZXInOiA1MTIsXG4gICdsZXNzJzogNTEzLFxuICAnPCc6IDUxMyxcbiAgJ2VxdWFsJzogNTE0LFxuICAnPSc6IDUxNCxcbiAgJz09JzogNTE0LFxuICAnPT09JzogNTE0LFxuICAnbGVxdWFsJzogNTE1LFxuICAnPD0nOiA1MTUsXG4gICdncmVhdGVyJzogNTE2LFxuICAnPic6IDUxNixcbiAgJ25vdGVxdWFsJzogNTE3LFxuICAnIT0nOiA1MTcsXG4gICchPT0nOiA1MTcsXG4gICdnZXF1YWwnOiA1MTgsXG4gICc+PSc6IDUxOCxcbiAgJ2Fsd2F5cyc6IDUxOVxufVxuXG52YXIgc3RlbmNpbE9wcyA9IHtcbiAgJzAnOiAwLFxuICAnemVybyc6IDAsXG4gICdrZWVwJzogNzY4MCxcbiAgJ3JlcGxhY2UnOiA3NjgxLFxuICAnaW5jcmVtZW50JzogNzY4MixcbiAgJ2RlY3JlbWVudCc6IDc2ODMsXG4gICdpbmNyZW1lbnQgd3JhcCc6IDM0MDU1LFxuICAnZGVjcmVtZW50IHdyYXAnOiAzNDA1NixcbiAgJ2ludmVydCc6IDUzODZcbn1cblxudmFyIHNoYWRlclR5cGUgPSB7XG4gICdmcmFnJzogR0xfRlJBR01FTlRfU0hBREVSLFxuICAndmVydCc6IEdMX1ZFUlRFWF9TSEFERVJcbn1cblxudmFyIG9yaWVudGF0aW9uVHlwZSA9IHtcbiAgJ2N3JzogR0xfQ1csXG4gICdjY3cnOiBHTF9DQ1dcbn1cblxuZnVuY3Rpb24gaXNCdWZmZXJBcmdzICh4KSB7XG4gIHJldHVybiBBcnJheS5pc0FycmF5KHgpIHx8XG4gICAgaXNUeXBlZEFycmF5KHgpIHx8XG4gICAgaXNOREFycmF5KHgpXG59XG5cbi8vIE1ha2Ugc3VyZSB2aWV3cG9ydCBpcyBwcm9jZXNzZWQgZmlyc3RcbmZ1bmN0aW9uIHNvcnRTdGF0ZSAoc3RhdGUpIHtcbiAgcmV0dXJuIHN0YXRlLnNvcnQoZnVuY3Rpb24gKGEsIGIpIHtcbiAgICBpZiAoYSA9PT0gU19WSUVXUE9SVCkge1xuICAgICAgcmV0dXJuIC0xXG4gICAgfSBlbHNlIGlmIChiID09PSBTX1ZJRVdQT1JUKSB7XG4gICAgICByZXR1cm4gMVxuICAgIH1cbiAgICByZXR1cm4gKGEgPCBiKSA/IC0xIDogMVxuICB9KVxufVxuXG5mdW5jdGlvbiBEZWNsYXJhdGlvbiAodGhpc0RlcCwgY29udGV4dERlcCwgcHJvcERlcCwgYXBwZW5kKSB7XG4gIHRoaXMudGhpc0RlcCA9IHRoaXNEZXBcbiAgdGhpcy5jb250ZXh0RGVwID0gY29udGV4dERlcFxuICB0aGlzLnByb3BEZXAgPSBwcm9wRGVwXG4gIHRoaXMuYXBwZW5kID0gYXBwZW5kXG59XG5cbmZ1bmN0aW9uIGlzU3RhdGljIChkZWNsKSB7XG4gIHJldHVybiBkZWNsICYmICEoZGVjbC50aGlzRGVwIHx8IGRlY2wuY29udGV4dERlcCB8fCBkZWNsLnByb3BEZXApXG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVN0YXRpY0RlY2wgKGFwcGVuZCkge1xuICByZXR1cm4gbmV3IERlY2xhcmF0aW9uKGZhbHNlLCBmYWxzZSwgZmFsc2UsIGFwcGVuZClcbn1cblxuZnVuY3Rpb24gY3JlYXRlRHluYW1pY0RlY2wgKGR5biwgYXBwZW5kKSB7XG4gIHZhciB0eXBlID0gZHluLnR5cGVcbiAgaWYgKHR5cGUgPT09IERZTl9GVU5DKSB7XG4gICAgdmFyIG51bUFyZ3MgPSBkeW4uZGF0YS5sZW5ndGhcbiAgICByZXR1cm4gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgdHJ1ZSxcbiAgICAgIG51bUFyZ3MgPj0gMSxcbiAgICAgIG51bUFyZ3MgPj0gMixcbiAgICAgIGFwcGVuZClcbiAgfSBlbHNlIGlmICh0eXBlID09PSBEWU5fVEhVTkspIHtcbiAgICB2YXIgZGF0YSA9IGR5bi5kYXRhXG4gICAgcmV0dXJuIG5ldyBEZWNsYXJhdGlvbihcbiAgICAgIGRhdGEudGhpc0RlcCxcbiAgICAgIGRhdGEuY29udGV4dERlcCxcbiAgICAgIGRhdGEucHJvcERlcCxcbiAgICAgIGFwcGVuZClcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgdHlwZSA9PT0gRFlOX1NUQVRFLFxuICAgICAgdHlwZSA9PT0gRFlOX0NPTlRFWFQsXG4gICAgICB0eXBlID09PSBEWU5fUFJPUCxcbiAgICAgIGFwcGVuZClcbiAgfVxufVxuXG52YXIgU0NPUEVfREVDTCA9IG5ldyBEZWNsYXJhdGlvbihmYWxzZSwgZmFsc2UsIGZhbHNlLCBmdW5jdGlvbiAoKSB7fSlcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiByZWdsQ29yZSAoXG4gIGdsLFxuICBzdHJpbmdTdG9yZSxcbiAgZXh0ZW5zaW9ucyxcbiAgbGltaXRzLFxuICBidWZmZXJTdGF0ZSxcbiAgZWxlbWVudFN0YXRlLFxuICB0ZXh0dXJlU3RhdGUsXG4gIGZyYW1lYnVmZmVyU3RhdGUsXG4gIHVuaWZvcm1TdGF0ZSxcbiAgYXR0cmlidXRlU3RhdGUsXG4gIHNoYWRlclN0YXRlLFxuICBkcmF3U3RhdGUsXG4gIGNvbnRleHRTdGF0ZSxcbiAgdGltZXIsXG4gIGNvbmZpZykge1xuICB2YXIgQXR0cmlidXRlUmVjb3JkID0gYXR0cmlidXRlU3RhdGUuUmVjb3JkXG5cbiAgdmFyIGJsZW5kRXF1YXRpb25zID0ge1xuICAgICdhZGQnOiAzMjc3NCxcbiAgICAnc3VidHJhY3QnOiAzMjc3OCxcbiAgICAncmV2ZXJzZSBzdWJ0cmFjdCc6IDMyNzc5XG4gIH1cbiAgaWYgKGV4dGVuc2lvbnMuZXh0X2JsZW5kX21pbm1heCkge1xuICAgIGJsZW5kRXF1YXRpb25zLm1pbiA9IEdMX01JTl9FWFRcbiAgICBibGVuZEVxdWF0aW9ucy5tYXggPSBHTF9NQVhfRVhUXG4gIH1cblxuICB2YXIgZXh0SW5zdGFuY2luZyA9IGV4dGVuc2lvbnMuYW5nbGVfaW5zdGFuY2VkX2FycmF5c1xuICB2YXIgZXh0RHJhd0J1ZmZlcnMgPSBleHRlbnNpb25zLndlYmdsX2RyYXdfYnVmZmVyc1xuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gV0VCR0wgU1RBVEVcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICB2YXIgY3VycmVudFN0YXRlID0ge1xuICAgIGRpcnR5OiB0cnVlLFxuICAgIHByb2ZpbGU6IGNvbmZpZy5wcm9maWxlXG4gIH1cbiAgdmFyIG5leHRTdGF0ZSA9IHt9XG4gIHZhciBHTF9TVEFURV9OQU1FUyA9IFtdXG4gIHZhciBHTF9GTEFHUyA9IHt9XG4gIHZhciBHTF9WQVJJQUJMRVMgPSB7fVxuXG4gIGZ1bmN0aW9uIHByb3BOYW1lIChuYW1lKSB7XG4gICAgcmV0dXJuIG5hbWUucmVwbGFjZSgnLicsICdfJylcbiAgfVxuXG4gIGZ1bmN0aW9uIHN0YXRlRmxhZyAoc25hbWUsIGNhcCwgaW5pdCkge1xuICAgIHZhciBuYW1lID0gcHJvcE5hbWUoc25hbWUpXG4gICAgR0xfU1RBVEVfTkFNRVMucHVzaChzbmFtZSlcbiAgICBuZXh0U3RhdGVbbmFtZV0gPSBjdXJyZW50U3RhdGVbbmFtZV0gPSAhIWluaXRcbiAgICBHTF9GTEFHU1tuYW1lXSA9IGNhcFxuICB9XG5cbiAgZnVuY3Rpb24gc3RhdGVWYXJpYWJsZSAoc25hbWUsIGZ1bmMsIGluaXQpIHtcbiAgICB2YXIgbmFtZSA9IHByb3BOYW1lKHNuYW1lKVxuICAgIEdMX1NUQVRFX05BTUVTLnB1c2goc25hbWUpXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoaW5pdCkpIHtcbiAgICAgIGN1cnJlbnRTdGF0ZVtuYW1lXSA9IGluaXQuc2xpY2UoKVxuICAgICAgbmV4dFN0YXRlW25hbWVdID0gaW5pdC5zbGljZSgpXG4gICAgfSBlbHNlIHtcbiAgICAgIGN1cnJlbnRTdGF0ZVtuYW1lXSA9IG5leHRTdGF0ZVtuYW1lXSA9IGluaXRcbiAgICB9XG4gICAgR0xfVkFSSUFCTEVTW25hbWVdID0gZnVuY1xuICB9XG5cbiAgLy8gRGl0aGVyaW5nXG4gIHN0YXRlRmxhZyhTX0RJVEhFUiwgR0xfRElUSEVSKVxuXG4gIC8vIEJsZW5kaW5nXG4gIHN0YXRlRmxhZyhTX0JMRU5EX0VOQUJMRSwgR0xfQkxFTkQpXG4gIHN0YXRlVmFyaWFibGUoU19CTEVORF9DT0xPUiwgJ2JsZW5kQ29sb3InLCBbMCwgMCwgMCwgMF0pXG4gIHN0YXRlVmFyaWFibGUoU19CTEVORF9FUVVBVElPTiwgJ2JsZW5kRXF1YXRpb25TZXBhcmF0ZScsXG4gICAgW0dMX0ZVTkNfQURELCBHTF9GVU5DX0FERF0pXG4gIHN0YXRlVmFyaWFibGUoU19CTEVORF9GVU5DLCAnYmxlbmRGdW5jU2VwYXJhdGUnLFxuICAgIFtHTF9PTkUsIEdMX1pFUk8sIEdMX09ORSwgR0xfWkVST10pXG5cbiAgLy8gRGVwdGhcbiAgc3RhdGVGbGFnKFNfREVQVEhfRU5BQkxFLCBHTF9ERVBUSF9URVNULCB0cnVlKVxuICBzdGF0ZVZhcmlhYmxlKFNfREVQVEhfRlVOQywgJ2RlcHRoRnVuYycsIEdMX0xFU1MpXG4gIHN0YXRlVmFyaWFibGUoU19ERVBUSF9SQU5HRSwgJ2RlcHRoUmFuZ2UnLCBbMCwgMV0pXG4gIHN0YXRlVmFyaWFibGUoU19ERVBUSF9NQVNLLCAnZGVwdGhNYXNrJywgdHJ1ZSlcblxuICAvLyBDb2xvciBtYXNrXG4gIHN0YXRlVmFyaWFibGUoU19DT0xPUl9NQVNLLCBTX0NPTE9SX01BU0ssIFt0cnVlLCB0cnVlLCB0cnVlLCB0cnVlXSlcblxuICAvLyBGYWNlIGN1bGxpbmdcbiAgc3RhdGVGbGFnKFNfQ1VMTF9FTkFCTEUsIEdMX0NVTExfRkFDRSlcbiAgc3RhdGVWYXJpYWJsZShTX0NVTExfRkFDRSwgJ2N1bGxGYWNlJywgR0xfQkFDSylcblxuICAvLyBGcm9udCBmYWNlIG9yaWVudGF0aW9uXG4gIHN0YXRlVmFyaWFibGUoU19GUk9OVF9GQUNFLCBTX0ZST05UX0ZBQ0UsIEdMX0NDVylcblxuICAvLyBMaW5lIHdpZHRoXG4gIHN0YXRlVmFyaWFibGUoU19MSU5FX1dJRFRILCBTX0xJTkVfV0lEVEgsIDEpXG5cbiAgLy8gUG9seWdvbiBvZmZzZXRcbiAgc3RhdGVGbGFnKFNfUE9MWUdPTl9PRkZTRVRfRU5BQkxFLCBHTF9QT0xZR09OX09GRlNFVF9GSUxMKVxuICBzdGF0ZVZhcmlhYmxlKFNfUE9MWUdPTl9PRkZTRVRfT0ZGU0VULCAncG9seWdvbk9mZnNldCcsIFswLCAwXSlcblxuICAvLyBTYW1wbGUgY292ZXJhZ2VcbiAgc3RhdGVGbGFnKFNfU0FNUExFX0FMUEhBLCBHTF9TQU1QTEVfQUxQSEFfVE9fQ09WRVJBR0UpXG4gIHN0YXRlRmxhZyhTX1NBTVBMRV9FTkFCTEUsIEdMX1NBTVBMRV9DT1ZFUkFHRSlcbiAgc3RhdGVWYXJpYWJsZShTX1NBTVBMRV9DT1ZFUkFHRSwgJ3NhbXBsZUNvdmVyYWdlJywgWzEsIGZhbHNlXSlcblxuICAvLyBTdGVuY2lsXG4gIHN0YXRlRmxhZyhTX1NURU5DSUxfRU5BQkxFLCBHTF9TVEVOQ0lMX1RFU1QpXG4gIHN0YXRlVmFyaWFibGUoU19TVEVOQ0lMX01BU0ssICdzdGVuY2lsTWFzaycsIC0xKVxuICBzdGF0ZVZhcmlhYmxlKFNfU1RFTkNJTF9GVU5DLCAnc3RlbmNpbEZ1bmMnLCBbR0xfQUxXQVlTLCAwLCAtMV0pXG4gIHN0YXRlVmFyaWFibGUoU19TVEVOQ0lMX09QRlJPTlQsICdzdGVuY2lsT3BTZXBhcmF0ZScsXG4gICAgW0dMX0ZST05ULCBHTF9LRUVQLCBHTF9LRUVQLCBHTF9LRUVQXSlcbiAgc3RhdGVWYXJpYWJsZShTX1NURU5DSUxfT1BCQUNLLCAnc3RlbmNpbE9wU2VwYXJhdGUnLFxuICAgIFtHTF9CQUNLLCBHTF9LRUVQLCBHTF9LRUVQLCBHTF9LRUVQXSlcblxuICAvLyBTY2lzc29yXG4gIHN0YXRlRmxhZyhTX1NDSVNTT1JfRU5BQkxFLCBHTF9TQ0lTU09SX1RFU1QpXG4gIHN0YXRlVmFyaWFibGUoU19TQ0lTU09SX0JPWCwgJ3NjaXNzb3InLFxuICAgIFswLCAwLCBnbC5kcmF3aW5nQnVmZmVyV2lkdGgsIGdsLmRyYXdpbmdCdWZmZXJIZWlnaHRdKVxuXG4gIC8vIFZpZXdwb3J0XG4gIHN0YXRlVmFyaWFibGUoU19WSUVXUE9SVCwgU19WSUVXUE9SVCxcbiAgICBbMCwgMCwgZ2wuZHJhd2luZ0J1ZmZlcldpZHRoLCBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0XSlcblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIEVOVklST05NRU5UXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgdmFyIHNoYXJlZFN0YXRlID0ge1xuICAgIGdsOiBnbCxcbiAgICBjb250ZXh0OiBjb250ZXh0U3RhdGUsXG4gICAgc3RyaW5nczogc3RyaW5nU3RvcmUsXG4gICAgbmV4dDogbmV4dFN0YXRlLFxuICAgIGN1cnJlbnQ6IGN1cnJlbnRTdGF0ZSxcbiAgICBkcmF3OiBkcmF3U3RhdGUsXG4gICAgZWxlbWVudHM6IGVsZW1lbnRTdGF0ZSxcbiAgICBidWZmZXI6IGJ1ZmZlclN0YXRlLFxuICAgIHNoYWRlcjogc2hhZGVyU3RhdGUsXG4gICAgYXR0cmlidXRlczogYXR0cmlidXRlU3RhdGUuc3RhdGUsXG4gICAgdW5pZm9ybXM6IHVuaWZvcm1TdGF0ZSxcbiAgICBmcmFtZWJ1ZmZlcjogZnJhbWVidWZmZXJTdGF0ZSxcbiAgICBleHRlbnNpb25zOiBleHRlbnNpb25zLFxuXG4gICAgdGltZXI6IHRpbWVyLFxuICAgIGlzQnVmZmVyQXJnczogaXNCdWZmZXJBcmdzXG4gIH1cblxuICB2YXIgc2hhcmVkQ29uc3RhbnRzID0ge1xuICAgIHByaW1UeXBlczogcHJpbVR5cGVzLFxuICAgIGNvbXBhcmVGdW5jczogY29tcGFyZUZ1bmNzLFxuICAgIGJsZW5kRnVuY3M6IGJsZW5kRnVuY3MsXG4gICAgYmxlbmRFcXVhdGlvbnM6IGJsZW5kRXF1YXRpb25zLFxuICAgIHN0ZW5jaWxPcHM6IHN0ZW5jaWxPcHMsXG4gICAgZ2xUeXBlczogZ2xUeXBlcyxcbiAgICBvcmllbnRhdGlvblR5cGU6IG9yaWVudGF0aW9uVHlwZVxuICB9XG5cbiAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgIHNoYXJlZFN0YXRlLmlzQXJyYXlMaWtlID0gaXNBcnJheUxpa2VcbiAgfSlcblxuICBpZiAoZXh0RHJhd0J1ZmZlcnMpIHtcbiAgICBzaGFyZWRDb25zdGFudHMuYmFja0J1ZmZlciA9IFtHTF9CQUNLXVxuICAgIHNoYXJlZENvbnN0YW50cy5kcmF3QnVmZmVyID0gbG9vcChsaW1pdHMubWF4RHJhd2J1ZmZlcnMsIGZ1bmN0aW9uIChpKSB7XG4gICAgICBpZiAoaSA9PT0gMCkge1xuICAgICAgICByZXR1cm4gWzBdXG4gICAgICB9XG4gICAgICByZXR1cm4gbG9vcChpLCBmdW5jdGlvbiAoaikge1xuICAgICAgICByZXR1cm4gR0xfQ09MT1JfQVRUQUNITUVOVDAgKyBqXG4gICAgICB9KVxuICAgIH0pXG4gIH1cblxuICB2YXIgZHJhd0NhbGxDb3VudGVyID0gMFxuICBmdW5jdGlvbiBjcmVhdGVSRUdMRW52aXJvbm1lbnQgKCkge1xuICAgIHZhciBlbnYgPSBjcmVhdGVFbnZpcm9ubWVudCgpXG4gICAgdmFyIGxpbmsgPSBlbnYubGlua1xuICAgIHZhciBnbG9iYWwgPSBlbnYuZ2xvYmFsXG4gICAgZW52LmlkID0gZHJhd0NhbGxDb3VudGVyKytcblxuICAgIGVudi5iYXRjaElkID0gJzAnXG5cbiAgICAvLyBsaW5rIHNoYXJlZCBzdGF0ZVxuICAgIHZhciBTSEFSRUQgPSBsaW5rKHNoYXJlZFN0YXRlKVxuICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkID0ge1xuICAgICAgcHJvcHM6ICdhMCdcbiAgICB9XG4gICAgT2JqZWN0LmtleXMoc2hhcmVkU3RhdGUpLmZvckVhY2goZnVuY3Rpb24gKHByb3ApIHtcbiAgICAgIHNoYXJlZFtwcm9wXSA9IGdsb2JhbC5kZWYoU0hBUkVELCAnLicsIHByb3ApXG4gICAgfSlcblxuICAgIC8vIEluamVjdCBydW50aW1lIGFzc2VydGlvbiBzdHVmZiBmb3IgZGVidWcgYnVpbGRzXG4gICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgZW52LkNIRUNLID0gbGluayhjaGVjaylcbiAgICAgIGVudi5jb21tYW5kU3RyID0gY2hlY2suZ3Vlc3NDb21tYW5kKClcbiAgICAgIGVudi5jb21tYW5kID0gbGluayhlbnYuY29tbWFuZFN0cilcbiAgICAgIGVudi5hc3NlcnQgPSBmdW5jdGlvbiAoYmxvY2ssIHByZWQsIG1lc3NhZ2UpIHtcbiAgICAgICAgYmxvY2soXG4gICAgICAgICAgJ2lmKCEoJywgcHJlZCwgJykpJyxcbiAgICAgICAgICB0aGlzLkNIRUNLLCAnLmNvbW1hbmRSYWlzZSgnLCBsaW5rKG1lc3NhZ2UpLCAnLCcsIHRoaXMuY29tbWFuZCwgJyk7JylcbiAgICAgIH1cblxuICAgICAgc2hhcmVkQ29uc3RhbnRzLmludmFsaWRCbGVuZENvbWJpbmF0aW9ucyA9IGludmFsaWRCbGVuZENvbWJpbmF0aW9uc1xuICAgIH0pXG5cbiAgICAvLyBDb3B5IEdMIHN0YXRlIHZhcmlhYmxlcyBvdmVyXG4gICAgdmFyIG5leHRWYXJzID0gZW52Lm5leHQgPSB7fVxuICAgIHZhciBjdXJyZW50VmFycyA9IGVudi5jdXJyZW50ID0ge31cbiAgICBPYmplY3Qua2V5cyhHTF9WQVJJQUJMRVMpLmZvckVhY2goZnVuY3Rpb24gKHZhcmlhYmxlKSB7XG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShjdXJyZW50U3RhdGVbdmFyaWFibGVdKSkge1xuICAgICAgICBuZXh0VmFyc1t2YXJpYWJsZV0gPSBnbG9iYWwuZGVmKHNoYXJlZC5uZXh0LCAnLicsIHZhcmlhYmxlKVxuICAgICAgICBjdXJyZW50VmFyc1t2YXJpYWJsZV0gPSBnbG9iYWwuZGVmKHNoYXJlZC5jdXJyZW50LCAnLicsIHZhcmlhYmxlKVxuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyBJbml0aWFsaXplIHNoYXJlZCBjb25zdGFudHNcbiAgICB2YXIgY29uc3RhbnRzID0gZW52LmNvbnN0YW50cyA9IHt9XG4gICAgT2JqZWN0LmtleXMoc2hhcmVkQ29uc3RhbnRzKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICBjb25zdGFudHNbbmFtZV0gPSBnbG9iYWwuZGVmKEpTT04uc3RyaW5naWZ5KHNoYXJlZENvbnN0YW50c1tuYW1lXSkpXG4gICAgfSlcblxuICAgIC8vIEhlbHBlciBmdW5jdGlvbiBmb3IgY2FsbGluZyBhIGJsb2NrXG4gICAgZW52Lmludm9rZSA9IGZ1bmN0aW9uIChibG9jaywgeCkge1xuICAgICAgc3dpdGNoICh4LnR5cGUpIHtcbiAgICAgICAgY2FzZSBEWU5fRlVOQzpcbiAgICAgICAgICB2YXIgYXJnTGlzdCA9IFtcbiAgICAgICAgICAgICd0aGlzJyxcbiAgICAgICAgICAgIHNoYXJlZC5jb250ZXh0LFxuICAgICAgICAgICAgc2hhcmVkLnByb3BzLFxuICAgICAgICAgICAgZW52LmJhdGNoSWRcbiAgICAgICAgICBdXG4gICAgICAgICAgcmV0dXJuIGJsb2NrLmRlZihcbiAgICAgICAgICAgIGxpbmsoeC5kYXRhKSwgJy5jYWxsKCcsXG4gICAgICAgICAgICAgIGFyZ0xpc3Quc2xpY2UoMCwgTWF0aC5tYXgoeC5kYXRhLmxlbmd0aCArIDEsIDQpKSxcbiAgICAgICAgICAgICAnKScpXG4gICAgICAgIGNhc2UgRFlOX1BST1A6XG4gICAgICAgICAgcmV0dXJuIGJsb2NrLmRlZihzaGFyZWQucHJvcHMsIHguZGF0YSlcbiAgICAgICAgY2FzZSBEWU5fQ09OVEVYVDpcbiAgICAgICAgICByZXR1cm4gYmxvY2suZGVmKHNoYXJlZC5jb250ZXh0LCB4LmRhdGEpXG4gICAgICAgIGNhc2UgRFlOX1NUQVRFOlxuICAgICAgICAgIHJldHVybiBibG9jay5kZWYoJ3RoaXMnLCB4LmRhdGEpXG4gICAgICAgIGNhc2UgRFlOX1RIVU5LOlxuICAgICAgICAgIHguZGF0YS5hcHBlbmQoZW52LCBibG9jaylcbiAgICAgICAgICByZXR1cm4geC5kYXRhLnJlZlxuICAgICAgfVxuICAgIH1cblxuICAgIGVudi5hdHRyaWJDYWNoZSA9IHt9XG5cbiAgICB2YXIgc2NvcGVBdHRyaWJzID0ge31cbiAgICBlbnYuc2NvcGVBdHRyaWIgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgICAgdmFyIGlkID0gc3RyaW5nU3RvcmUuaWQobmFtZSlcbiAgICAgIGlmIChpZCBpbiBzY29wZUF0dHJpYnMpIHtcbiAgICAgICAgcmV0dXJuIHNjb3BlQXR0cmlic1tpZF1cbiAgICAgIH1cbiAgICAgIHZhciBiaW5kaW5nID0gYXR0cmlidXRlU3RhdGUuc2NvcGVbaWRdXG4gICAgICBpZiAoIWJpbmRpbmcpIHtcbiAgICAgICAgYmluZGluZyA9IGF0dHJpYnV0ZVN0YXRlLnNjb3BlW2lkXSA9IG5ldyBBdHRyaWJ1dGVSZWNvcmQoKVxuICAgICAgfVxuICAgICAgdmFyIHJlc3VsdCA9IHNjb3BlQXR0cmlic1tpZF0gPSBsaW5rKGJpbmRpbmcpXG4gICAgICByZXR1cm4gcmVzdWx0XG4gICAgfVxuXG4gICAgcmV0dXJuIGVudlxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBQQVJTSU5HXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgZnVuY3Rpb24gcGFyc2VQcm9maWxlIChvcHRpb25zKSB7XG4gICAgdmFyIHN0YXRpY09wdGlvbnMgPSBvcHRpb25zLnN0YXRpY1xuICAgIHZhciBkeW5hbWljT3B0aW9ucyA9IG9wdGlvbnMuZHluYW1pY1xuXG4gICAgdmFyIHByb2ZpbGVFbmFibGVcbiAgICBpZiAoU19QUk9GSUxFIGluIHN0YXRpY09wdGlvbnMpIHtcbiAgICAgIHZhciB2YWx1ZSA9ICEhc3RhdGljT3B0aW9uc1tTX1BST0ZJTEVdXG4gICAgICBwcm9maWxlRW5hYmxlID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICByZXR1cm4gdmFsdWVcbiAgICAgIH0pXG4gICAgICBwcm9maWxlRW5hYmxlLmVuYWJsZSA9IHZhbHVlXG4gICAgfSBlbHNlIGlmIChTX1BST0ZJTEUgaW4gZHluYW1pY09wdGlvbnMpIHtcbiAgICAgIHZhciBkeW4gPSBkeW5hbWljT3B0aW9uc1tTX1BST0ZJTEVdXG4gICAgICBwcm9maWxlRW5hYmxlID0gY3JlYXRlRHluYW1pY0RlY2woZHluLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICByZXR1cm4gZW52Lmludm9rZShzY29wZSwgZHluKVxuICAgICAgfSlcbiAgICB9XG5cbiAgICByZXR1cm4gcHJvZmlsZUVuYWJsZVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VGcmFtZWJ1ZmZlciAob3B0aW9ucywgZW52KSB7XG4gICAgdmFyIHN0YXRpY09wdGlvbnMgPSBvcHRpb25zLnN0YXRpY1xuICAgIHZhciBkeW5hbWljT3B0aW9ucyA9IG9wdGlvbnMuZHluYW1pY1xuXG4gICAgaWYgKFNfRlJBTUVCVUZGRVIgaW4gc3RhdGljT3B0aW9ucykge1xuICAgICAgdmFyIGZyYW1lYnVmZmVyID0gc3RhdGljT3B0aW9uc1tTX0ZSQU1FQlVGRkVSXVxuICAgICAgaWYgKGZyYW1lYnVmZmVyKSB7XG4gICAgICAgIGZyYW1lYnVmZmVyID0gZnJhbWVidWZmZXJTdGF0ZS5nZXRGcmFtZWJ1ZmZlcihmcmFtZWJ1ZmZlcilcbiAgICAgICAgY2hlY2suY29tbWFuZChmcmFtZWJ1ZmZlciwgJ2ludmFsaWQgZnJhbWVidWZmZXIgb2JqZWN0JylcbiAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgYmxvY2spIHtcbiAgICAgICAgICB2YXIgRlJBTUVCVUZGRVIgPSBlbnYubGluayhmcmFtZWJ1ZmZlcilcbiAgICAgICAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuICAgICAgICAgIGJsb2NrLnNldChcbiAgICAgICAgICAgIHNoYXJlZC5mcmFtZWJ1ZmZlcixcbiAgICAgICAgICAgICcubmV4dCcsXG4gICAgICAgICAgICBGUkFNRUJVRkZFUilcbiAgICAgICAgICB2YXIgQ09OVEVYVCA9IHNoYXJlZC5jb250ZXh0XG4gICAgICAgICAgYmxvY2suc2V0KFxuICAgICAgICAgICAgQ09OVEVYVCxcbiAgICAgICAgICAgICcuJyArIFNfRlJBTUVCVUZGRVJfV0lEVEgsXG4gICAgICAgICAgICBGUkFNRUJVRkZFUiArICcud2lkdGgnKVxuICAgICAgICAgIGJsb2NrLnNldChcbiAgICAgICAgICAgIENPTlRFWFQsXG4gICAgICAgICAgICAnLicgKyBTX0ZSQU1FQlVGRkVSX0hFSUdIVCxcbiAgICAgICAgICAgIEZSQU1FQlVGRkVSICsgJy5oZWlnaHQnKVxuICAgICAgICAgIHJldHVybiBGUkFNRUJVRkZFUlxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuICAgICAgICAgIHNjb3BlLnNldChcbiAgICAgICAgICAgIHNoYXJlZC5mcmFtZWJ1ZmZlcixcbiAgICAgICAgICAgICcubmV4dCcsXG4gICAgICAgICAgICAnbnVsbCcpXG4gICAgICAgICAgdmFyIENPTlRFWFQgPSBzaGFyZWQuY29udGV4dFxuICAgICAgICAgIHNjb3BlLnNldChcbiAgICAgICAgICAgIENPTlRFWFQsXG4gICAgICAgICAgICAnLicgKyBTX0ZSQU1FQlVGRkVSX1dJRFRILFxuICAgICAgICAgICAgQ09OVEVYVCArICcuJyArIFNfRFJBV0lOR0JVRkZFUl9XSURUSClcbiAgICAgICAgICBzY29wZS5zZXQoXG4gICAgICAgICAgICBDT05URVhULFxuICAgICAgICAgICAgJy4nICsgU19GUkFNRUJVRkZFUl9IRUlHSFQsXG4gICAgICAgICAgICBDT05URVhUICsgJy4nICsgU19EUkFXSU5HQlVGRkVSX0hFSUdIVClcbiAgICAgICAgICByZXR1cm4gJ251bGwnXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChTX0ZSQU1FQlVGRkVSIGluIGR5bmFtaWNPcHRpb25zKSB7XG4gICAgICB2YXIgZHluID0gZHluYW1pY09wdGlvbnNbU19GUkFNRUJVRkZFUl1cbiAgICAgIHJldHVybiBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgIHZhciBGUkFNRUJVRkZFUl9GVU5DID0gZW52Lmludm9rZShzY29wZSwgZHluKVxuICAgICAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuICAgICAgICB2YXIgRlJBTUVCVUZGRVJfU1RBVEUgPSBzaGFyZWQuZnJhbWVidWZmZXJcbiAgICAgICAgdmFyIEZSQU1FQlVGRkVSID0gc2NvcGUuZGVmKFxuICAgICAgICAgIEZSQU1FQlVGRkVSX1NUQVRFLCAnLmdldEZyYW1lYnVmZmVyKCcsIEZSQU1FQlVGRkVSX0ZVTkMsICcpJylcblxuICAgICAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZW52LmFzc2VydChzY29wZSxcbiAgICAgICAgICAgICchJyArIEZSQU1FQlVGRkVSX0ZVTkMgKyAnfHwnICsgRlJBTUVCVUZGRVIsXG4gICAgICAgICAgICAnaW52YWxpZCBmcmFtZWJ1ZmZlciBvYmplY3QnKVxuICAgICAgICB9KVxuXG4gICAgICAgIHNjb3BlLnNldChcbiAgICAgICAgICBGUkFNRUJVRkZFUl9TVEFURSxcbiAgICAgICAgICAnLm5leHQnLFxuICAgICAgICAgIEZSQU1FQlVGRkVSKVxuICAgICAgICB2YXIgQ09OVEVYVCA9IHNoYXJlZC5jb250ZXh0XG4gICAgICAgIHNjb3BlLnNldChcbiAgICAgICAgICBDT05URVhULFxuICAgICAgICAgICcuJyArIFNfRlJBTUVCVUZGRVJfV0lEVEgsXG4gICAgICAgICAgRlJBTUVCVUZGRVIgKyAnPycgKyBGUkFNRUJVRkZFUiArICcud2lkdGg6JyArXG4gICAgICAgICAgQ09OVEVYVCArICcuJyArIFNfRFJBV0lOR0JVRkZFUl9XSURUSClcbiAgICAgICAgc2NvcGUuc2V0KFxuICAgICAgICAgIENPTlRFWFQsXG4gICAgICAgICAgJy4nICsgU19GUkFNRUJVRkZFUl9IRUlHSFQsXG4gICAgICAgICAgRlJBTUVCVUZGRVIgK1xuICAgICAgICAgICc/JyArIEZSQU1FQlVGRkVSICsgJy5oZWlnaHQ6JyArXG4gICAgICAgICAgQ09OVEVYVCArICcuJyArIFNfRFJBV0lOR0JVRkZFUl9IRUlHSFQpXG4gICAgICAgIHJldHVybiBGUkFNRUJVRkZFUlxuICAgICAgfSlcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZVZpZXdwb3J0U2Npc3NvciAob3B0aW9ucywgZnJhbWVidWZmZXIsIGVudikge1xuICAgIHZhciBzdGF0aWNPcHRpb25zID0gb3B0aW9ucy5zdGF0aWNcbiAgICB2YXIgZHluYW1pY09wdGlvbnMgPSBvcHRpb25zLmR5bmFtaWNcblxuICAgIGZ1bmN0aW9uIHBhcnNlQm94IChwYXJhbSkge1xuICAgICAgaWYgKHBhcmFtIGluIHN0YXRpY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIGJveCA9IHN0YXRpY09wdGlvbnNbcGFyYW1dXG4gICAgICAgIGNoZWNrLmNvbW1hbmRUeXBlKGJveCwgJ29iamVjdCcsICdpbnZhbGlkICcgKyBwYXJhbSwgZW52LmNvbW1hbmRTdHIpXG5cbiAgICAgICAgdmFyIGlzU3RhdGljID0gdHJ1ZVxuICAgICAgICB2YXIgeCA9IGJveC54IHwgMFxuICAgICAgICB2YXIgeSA9IGJveC55IHwgMFxuICAgICAgICB2YXIgdywgaFxuICAgICAgICBpZiAoJ3dpZHRoJyBpbiBib3gpIHtcbiAgICAgICAgICB3ID0gYm94LndpZHRoIHwgMFxuICAgICAgICAgIGNoZWNrLmNvbW1hbmQodyA+PSAwLCAnaW52YWxpZCAnICsgcGFyYW0sIGVudi5jb21tYW5kU3RyKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlzU3RhdGljID0gZmFsc2VcbiAgICAgICAgfVxuICAgICAgICBpZiAoJ2hlaWdodCcgaW4gYm94KSB7XG4gICAgICAgICAgaCA9IGJveC5oZWlnaHQgfCAwXG4gICAgICAgICAgY2hlY2suY29tbWFuZChoID49IDAsICdpbnZhbGlkICcgKyBwYXJhbSwgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaXNTdGF0aWMgPSBmYWxzZVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG5ldyBEZWNsYXJhdGlvbihcbiAgICAgICAgICAhaXNTdGF0aWMgJiYgZnJhbWVidWZmZXIgJiYgZnJhbWVidWZmZXIudGhpc0RlcCxcbiAgICAgICAgICAhaXNTdGF0aWMgJiYgZnJhbWVidWZmZXIgJiYgZnJhbWVidWZmZXIuY29udGV4dERlcCxcbiAgICAgICAgICAhaXNTdGF0aWMgJiYgZnJhbWVidWZmZXIgJiYgZnJhbWVidWZmZXIucHJvcERlcCxcbiAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgICAgdmFyIENPTlRFWFQgPSBlbnYuc2hhcmVkLmNvbnRleHRcbiAgICAgICAgICAgIHZhciBCT1hfVyA9IHdcbiAgICAgICAgICAgIGlmICghKCd3aWR0aCcgaW4gYm94KSkge1xuICAgICAgICAgICAgICBCT1hfVyA9IHNjb3BlLmRlZihDT05URVhULCAnLicsIFNfRlJBTUVCVUZGRVJfV0lEVEgsICctJywgeClcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhciBCT1hfSCA9IGhcbiAgICAgICAgICAgIGlmICghKCdoZWlnaHQnIGluIGJveCkpIHtcbiAgICAgICAgICAgICAgQk9YX0ggPSBzY29wZS5kZWYoQ09OVEVYVCwgJy4nLCBTX0ZSQU1FQlVGRkVSX0hFSUdIVCwgJy0nLCB5KVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIFt4LCB5LCBCT1hfVywgQk9YX0hdXG4gICAgICAgICAgfSlcbiAgICAgIH0gZWxzZSBpZiAocGFyYW0gaW4gZHluYW1pY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIGR5bkJveCA9IGR5bmFtaWNPcHRpb25zW3BhcmFtXVxuICAgICAgICB2YXIgcmVzdWx0ID0gY3JlYXRlRHluYW1pY0RlY2woZHluQm94LCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciBCT1ggPSBlbnYuaW52b2tlKHNjb3BlLCBkeW5Cb3gpXG5cbiAgICAgICAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxuICAgICAgICAgICAgICBCT1ggKyAnJiZ0eXBlb2YgJyArIEJPWCArICc9PT1cIm9iamVjdFwiJyxcbiAgICAgICAgICAgICAgJ2ludmFsaWQgJyArIHBhcmFtKVxuICAgICAgICAgIH0pXG5cbiAgICAgICAgICB2YXIgQ09OVEVYVCA9IGVudi5zaGFyZWQuY29udGV4dFxuICAgICAgICAgIHZhciBCT1hfWCA9IHNjb3BlLmRlZihCT1gsICcueHwwJylcbiAgICAgICAgICB2YXIgQk9YX1kgPSBzY29wZS5kZWYoQk9YLCAnLnl8MCcpXG4gICAgICAgICAgdmFyIEJPWF9XID0gc2NvcGUuZGVmKFxuICAgICAgICAgICAgJ1wid2lkdGhcIiBpbiAnLCBCT1gsICc/JywgQk9YLCAnLndpZHRofDA6JyxcbiAgICAgICAgICAgICcoJywgQ09OVEVYVCwgJy4nLCBTX0ZSQU1FQlVGRkVSX1dJRFRILCAnLScsIEJPWF9YLCAnKScpXG4gICAgICAgICAgdmFyIEJPWF9IID0gc2NvcGUuZGVmKFxuICAgICAgICAgICAgJ1wiaGVpZ2h0XCIgaW4gJywgQk9YLCAnPycsIEJPWCwgJy5oZWlnaHR8MDonLFxuICAgICAgICAgICAgJygnLCBDT05URVhULCAnLicsIFNfRlJBTUVCVUZGRVJfSEVJR0hULCAnLScsIEJPWF9ZLCAnKScpXG5cbiAgICAgICAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxuICAgICAgICAgICAgICBCT1hfVyArICc+PTAmJicgK1xuICAgICAgICAgICAgICBCT1hfSCArICc+PTAnLFxuICAgICAgICAgICAgICAnaW52YWxpZCAnICsgcGFyYW0pXG4gICAgICAgICAgfSlcblxuICAgICAgICAgIHJldHVybiBbQk9YX1gsIEJPWF9ZLCBCT1hfVywgQk9YX0hdXG4gICAgICAgIH0pXG4gICAgICAgIGlmIChmcmFtZWJ1ZmZlcikge1xuICAgICAgICAgIHJlc3VsdC50aGlzRGVwID0gcmVzdWx0LnRoaXNEZXAgfHwgZnJhbWVidWZmZXIudGhpc0RlcFxuICAgICAgICAgIHJlc3VsdC5jb250ZXh0RGVwID0gcmVzdWx0LmNvbnRleHREZXAgfHwgZnJhbWVidWZmZXIuY29udGV4dERlcFxuICAgICAgICAgIHJlc3VsdC5wcm9wRGVwID0gcmVzdWx0LnByb3BEZXAgfHwgZnJhbWVidWZmZXIucHJvcERlcFxuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH0gZWxzZSBpZiAoZnJhbWVidWZmZXIpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBEZWNsYXJhdGlvbihcbiAgICAgICAgICBmcmFtZWJ1ZmZlci50aGlzRGVwLFxuICAgICAgICAgIGZyYW1lYnVmZmVyLmNvbnRleHREZXAsXG4gICAgICAgICAgZnJhbWVidWZmZXIucHJvcERlcCxcbiAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgICAgdmFyIENPTlRFWFQgPSBlbnYuc2hhcmVkLmNvbnRleHRcbiAgICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICAgIDAsIDAsXG4gICAgICAgICAgICAgIHNjb3BlLmRlZihDT05URVhULCAnLicsIFNfRlJBTUVCVUZGRVJfV0lEVEgpLFxuICAgICAgICAgICAgICBzY29wZS5kZWYoQ09OVEVYVCwgJy4nLCBTX0ZSQU1FQlVGRkVSX0hFSUdIVCldXG4gICAgICAgICAgfSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBudWxsXG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFyIHZpZXdwb3J0ID0gcGFyc2VCb3goU19WSUVXUE9SVClcblxuICAgIGlmICh2aWV3cG9ydCkge1xuICAgICAgdmFyIHByZXZWaWV3cG9ydCA9IHZpZXdwb3J0XG4gICAgICB2aWV3cG9ydCA9IG5ldyBEZWNsYXJhdGlvbihcbiAgICAgICAgdmlld3BvcnQudGhpc0RlcCxcbiAgICAgICAgdmlld3BvcnQuY29udGV4dERlcCxcbiAgICAgICAgdmlld3BvcnQucHJvcERlcCxcbiAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICB2YXIgVklFV1BPUlQgPSBwcmV2Vmlld3BvcnQuYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgICAgICAgdmFyIENPTlRFWFQgPSBlbnYuc2hhcmVkLmNvbnRleHRcbiAgICAgICAgICBzY29wZS5zZXQoXG4gICAgICAgICAgICBDT05URVhULFxuICAgICAgICAgICAgJy4nICsgU19WSUVXUE9SVF9XSURUSCxcbiAgICAgICAgICAgIFZJRVdQT1JUWzJdKVxuICAgICAgICAgIHNjb3BlLnNldChcbiAgICAgICAgICAgIENPTlRFWFQsXG4gICAgICAgICAgICAnLicgKyBTX1ZJRVdQT1JUX0hFSUdIVCxcbiAgICAgICAgICAgIFZJRVdQT1JUWzNdKVxuICAgICAgICAgIHJldHVybiBWSUVXUE9SVFxuICAgICAgICB9KVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICB2aWV3cG9ydDogdmlld3BvcnQsXG4gICAgICBzY2lzc29yX2JveDogcGFyc2VCb3goU19TQ0lTU09SX0JPWClcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZVByb2dyYW0gKG9wdGlvbnMpIHtcbiAgICB2YXIgc3RhdGljT3B0aW9ucyA9IG9wdGlvbnMuc3RhdGljXG4gICAgdmFyIGR5bmFtaWNPcHRpb25zID0gb3B0aW9ucy5keW5hbWljXG5cbiAgICBmdW5jdGlvbiBwYXJzZVNoYWRlciAobmFtZSkge1xuICAgICAgaWYgKG5hbWUgaW4gc3RhdGljT3B0aW9ucykge1xuICAgICAgICB2YXIgaWQgPSBzdHJpbmdTdG9yZS5pZChzdGF0aWNPcHRpb25zW25hbWVdKVxuICAgICAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgc2hhZGVyU3RhdGUuc2hhZGVyKHNoYWRlclR5cGVbbmFtZV0sIGlkLCBjaGVjay5ndWVzc0NvbW1hbmQoKSlcbiAgICAgICAgfSlcbiAgICAgICAgdmFyIHJlc3VsdCA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHJldHVybiBpZFxuICAgICAgICB9KVxuICAgICAgICByZXN1bHQuaWQgPSBpZFxuICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICB9IGVsc2UgaWYgKG5hbWUgaW4gZHluYW1pY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIGR5biA9IGR5bmFtaWNPcHRpb25zW25hbWVdXG4gICAgICAgIHJldHVybiBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgdmFyIHN0ciA9IGVudi5pbnZva2Uoc2NvcGUsIGR5bilcbiAgICAgICAgICB2YXIgaWQgPSBzY29wZS5kZWYoZW52LnNoYXJlZC5zdHJpbmdzLCAnLmlkKCcsIHN0ciwgJyknKVxuICAgICAgICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHNjb3BlKFxuICAgICAgICAgICAgICBlbnYuc2hhcmVkLnNoYWRlciwgJy5zaGFkZXIoJyxcbiAgICAgICAgICAgICAgc2hhZGVyVHlwZVtuYW1lXSwgJywnLFxuICAgICAgICAgICAgICBpZCwgJywnLFxuICAgICAgICAgICAgICBlbnYuY29tbWFuZCwgJyk7JylcbiAgICAgICAgICB9KVxuICAgICAgICAgIHJldHVybiBpZFxuICAgICAgICB9KVxuICAgICAgfVxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG5cbiAgICB2YXIgZnJhZyA9IHBhcnNlU2hhZGVyKFNfRlJBRylcbiAgICB2YXIgdmVydCA9IHBhcnNlU2hhZGVyKFNfVkVSVClcblxuICAgIHZhciBwcm9ncmFtID0gbnVsbFxuICAgIHZhciBwcm9nVmFyXG4gICAgaWYgKGlzU3RhdGljKGZyYWcpICYmIGlzU3RhdGljKHZlcnQpKSB7XG4gICAgICBwcm9ncmFtID0gc2hhZGVyU3RhdGUucHJvZ3JhbSh2ZXJ0LmlkLCBmcmFnLmlkKVxuICAgICAgcHJvZ1ZhciA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgcmV0dXJuIGVudi5saW5rKHByb2dyYW0pXG4gICAgICB9KVxuICAgIH0gZWxzZSB7XG4gICAgICBwcm9nVmFyID0gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgICAoZnJhZyAmJiBmcmFnLnRoaXNEZXApIHx8ICh2ZXJ0ICYmIHZlcnQudGhpc0RlcCksXG4gICAgICAgIChmcmFnICYmIGZyYWcuY29udGV4dERlcCkgfHwgKHZlcnQgJiYgdmVydC5jb250ZXh0RGVwKSxcbiAgICAgICAgKGZyYWcgJiYgZnJhZy5wcm9wRGVwKSB8fCAodmVydCAmJiB2ZXJ0LnByb3BEZXApLFxuICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciBTSEFERVJfU1RBVEUgPSBlbnYuc2hhcmVkLnNoYWRlclxuICAgICAgICAgIHZhciBmcmFnSWRcbiAgICAgICAgICBpZiAoZnJhZykge1xuICAgICAgICAgICAgZnJhZ0lkID0gZnJhZy5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZnJhZ0lkID0gc2NvcGUuZGVmKFNIQURFUl9TVEFURSwgJy4nLCBTX0ZSQUcpXG4gICAgICAgICAgfVxuICAgICAgICAgIHZhciB2ZXJ0SWRcbiAgICAgICAgICBpZiAodmVydCkge1xuICAgICAgICAgICAgdmVydElkID0gdmVydC5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmVydElkID0gc2NvcGUuZGVmKFNIQURFUl9TVEFURSwgJy4nLCBTX1ZFUlQpXG4gICAgICAgICAgfVxuICAgICAgICAgIHZhciBwcm9nRGVmID0gU0hBREVSX1NUQVRFICsgJy5wcm9ncmFtKCcgKyB2ZXJ0SWQgKyAnLCcgKyBmcmFnSWRcbiAgICAgICAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBwcm9nRGVmICs9ICcsJyArIGVudi5jb21tYW5kXG4gICAgICAgICAgfSlcbiAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKHByb2dEZWYgKyAnKScpXG4gICAgICAgIH0pXG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGZyYWc6IGZyYWcsXG4gICAgICB2ZXJ0OiB2ZXJ0LFxuICAgICAgcHJvZ1ZhcjogcHJvZ1ZhcixcbiAgICAgIHByb2dyYW06IHByb2dyYW1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZURyYXcgKG9wdGlvbnMsIGVudikge1xuICAgIHZhciBzdGF0aWNPcHRpb25zID0gb3B0aW9ucy5zdGF0aWNcbiAgICB2YXIgZHluYW1pY09wdGlvbnMgPSBvcHRpb25zLmR5bmFtaWNcblxuICAgIGZ1bmN0aW9uIHBhcnNlRWxlbWVudHMgKCkge1xuICAgICAgaWYgKFNfRUxFTUVOVFMgaW4gc3RhdGljT3B0aW9ucykge1xuICAgICAgICB2YXIgZWxlbWVudHMgPSBzdGF0aWNPcHRpb25zW1NfRUxFTUVOVFNdXG4gICAgICAgIGlmIChpc0J1ZmZlckFyZ3MoZWxlbWVudHMpKSB7XG4gICAgICAgICAgZWxlbWVudHMgPSBlbGVtZW50U3RhdGUuZ2V0RWxlbWVudHMoZWxlbWVudFN0YXRlLmNyZWF0ZShlbGVtZW50cywgdHJ1ZSkpXG4gICAgICAgIH0gZWxzZSBpZiAoZWxlbWVudHMpIHtcbiAgICAgICAgICBlbGVtZW50cyA9IGVsZW1lbnRTdGF0ZS5nZXRFbGVtZW50cyhlbGVtZW50cylcbiAgICAgICAgICBjaGVjay5jb21tYW5kKGVsZW1lbnRzLCAnaW52YWxpZCBlbGVtZW50cycsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICB9XG4gICAgICAgIHZhciByZXN1bHQgPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgaWYgKGVsZW1lbnRzKSB7XG4gICAgICAgICAgICB2YXIgcmVzdWx0ID0gZW52LmxpbmsoZWxlbWVudHMpXG4gICAgICAgICAgICBlbnYuRUxFTUVOVFMgPSByZXN1bHRcbiAgICAgICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgICAgICB9XG4gICAgICAgICAgZW52LkVMRU1FTlRTID0gbnVsbFxuICAgICAgICAgIHJldHVybiBudWxsXG4gICAgICAgIH0pXG4gICAgICAgIHJlc3VsdC52YWx1ZSA9IGVsZW1lbnRzXG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH0gZWxzZSBpZiAoU19FTEVNRU5UUyBpbiBkeW5hbWljT3B0aW9ucykge1xuICAgICAgICB2YXIgZHluID0gZHluYW1pY09wdGlvbnNbU19FTEVNRU5UU11cbiAgICAgICAgcmV0dXJuIGNyZWF0ZUR5bmFtaWNEZWNsKGR5biwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuXG4gICAgICAgICAgdmFyIElTX0JVRkZFUl9BUkdTID0gc2hhcmVkLmlzQnVmZmVyQXJnc1xuICAgICAgICAgIHZhciBFTEVNRU5UX1NUQVRFID0gc2hhcmVkLmVsZW1lbnRzXG5cbiAgICAgICAgICB2YXIgZWxlbWVudERlZm4gPSBlbnYuaW52b2tlKHNjb3BlLCBkeW4pXG4gICAgICAgICAgdmFyIGVsZW1lbnRzID0gc2NvcGUuZGVmKCdudWxsJylcbiAgICAgICAgICB2YXIgZWxlbWVudFN0cmVhbSA9IHNjb3BlLmRlZihJU19CVUZGRVJfQVJHUywgJygnLCBlbGVtZW50RGVmbiwgJyknKVxuXG4gICAgICAgICAgdmFyIGlmdGUgPSBlbnYuY29uZChlbGVtZW50U3RyZWFtKVxuICAgICAgICAgICAgLnRoZW4oZWxlbWVudHMsICc9JywgRUxFTUVOVF9TVEFURSwgJy5jcmVhdGVTdHJlYW0oJywgZWxlbWVudERlZm4sICcpOycpXG4gICAgICAgICAgICAuZWxzZShlbGVtZW50cywgJz0nLCBFTEVNRU5UX1NUQVRFLCAnLmdldEVsZW1lbnRzKCcsIGVsZW1lbnREZWZuLCAnKTsnKVxuXG4gICAgICAgICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgZW52LmFzc2VydChpZnRlLmVsc2UsXG4gICAgICAgICAgICAgICchJyArIGVsZW1lbnREZWZuICsgJ3x8JyArIGVsZW1lbnRzLFxuICAgICAgICAgICAgICAnaW52YWxpZCBlbGVtZW50cycpXG4gICAgICAgICAgfSlcblxuICAgICAgICAgIHNjb3BlLmVudHJ5KGlmdGUpXG4gICAgICAgICAgc2NvcGUuZXhpdChcbiAgICAgICAgICAgIGVudi5jb25kKGVsZW1lbnRTdHJlYW0pXG4gICAgICAgICAgICAgIC50aGVuKEVMRU1FTlRfU1RBVEUsICcuZGVzdHJveVN0cmVhbSgnLCBlbGVtZW50cywgJyk7JykpXG5cbiAgICAgICAgICBlbnYuRUxFTUVOVFMgPSBlbGVtZW50c1xuXG4gICAgICAgICAgcmV0dXJuIGVsZW1lbnRzXG4gICAgICAgIH0pXG4gICAgICB9XG5cbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuXG4gICAgdmFyIGVsZW1lbnRzID0gcGFyc2VFbGVtZW50cygpXG5cbiAgICBmdW5jdGlvbiBwYXJzZVByaW1pdGl2ZSAoKSB7XG4gICAgICBpZiAoU19QUklNSVRJVkUgaW4gc3RhdGljT3B0aW9ucykge1xuICAgICAgICB2YXIgcHJpbWl0aXZlID0gc3RhdGljT3B0aW9uc1tTX1BSSU1JVElWRV1cbiAgICAgICAgY2hlY2suY29tbWFuZFBhcmFtZXRlcihwcmltaXRpdmUsIHByaW1UeXBlcywgJ2ludmFsaWQgcHJpbWl0dmUnLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICByZXR1cm4gcHJpbVR5cGVzW3ByaW1pdGl2ZV1cbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSBpZiAoU19QUklNSVRJVkUgaW4gZHluYW1pY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIGR5blByaW1pdGl2ZSA9IGR5bmFtaWNPcHRpb25zW1NfUFJJTUlUSVZFXVxuICAgICAgICByZXR1cm4gY3JlYXRlRHluYW1pY0RlY2woZHluUHJpbWl0aXZlLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciBQUklNX1RZUEVTID0gZW52LmNvbnN0YW50cy5wcmltVHlwZXNcbiAgICAgICAgICB2YXIgcHJpbSA9IGVudi5pbnZva2Uoc2NvcGUsIGR5blByaW1pdGl2ZSlcbiAgICAgICAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxuICAgICAgICAgICAgICBwcmltICsgJyBpbiAnICsgUFJJTV9UWVBFUyxcbiAgICAgICAgICAgICAgJ2ludmFsaWQgcHJpbWl0aXZlLCBtdXN0IGJlIG9uZSBvZiAnICsgT2JqZWN0LmtleXMocHJpbVR5cGVzKSlcbiAgICAgICAgICB9KVxuICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoUFJJTV9UWVBFUywgJ1snLCBwcmltLCAnXScpXG4gICAgICAgIH0pXG4gICAgICB9IGVsc2UgaWYgKGVsZW1lbnRzKSB7XG4gICAgICAgIGlmIChpc1N0YXRpYyhlbGVtZW50cykpIHtcbiAgICAgICAgICBpZiAoZWxlbWVudHMudmFsdWUpIHtcbiAgICAgICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoZW52LkVMRU1FTlRTLCAnLnByaW1UeXBlJylcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIEdMX1RSSUFOR0xFU1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIG5ldyBEZWNsYXJhdGlvbihcbiAgICAgICAgICAgIGVsZW1lbnRzLnRoaXNEZXAsXG4gICAgICAgICAgICBlbGVtZW50cy5jb250ZXh0RGVwLFxuICAgICAgICAgICAgZWxlbWVudHMucHJvcERlcCxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgICAgIHZhciBlbGVtZW50cyA9IGVudi5FTEVNRU5UU1xuICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKGVsZW1lbnRzLCAnPycsIGVsZW1lbnRzLCAnLnByaW1UeXBlOicsIEdMX1RSSUFOR0xFUylcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcGFyc2VQYXJhbSAocGFyYW0sIGlzT2Zmc2V0KSB7XG4gICAgICBpZiAocGFyYW0gaW4gc3RhdGljT3B0aW9ucykge1xuICAgICAgICB2YXIgdmFsdWUgPSBzdGF0aWNPcHRpb25zW3BhcmFtXSB8IDBcbiAgICAgICAgY2hlY2suY29tbWFuZCghaXNPZmZzZXQgfHwgdmFsdWUgPj0gMCwgJ2ludmFsaWQgJyArIHBhcmFtLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICBpZiAoaXNPZmZzZXQpIHtcbiAgICAgICAgICAgIGVudi5PRkZTRVQgPSB2YWx1ZVxuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdmFsdWVcbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSBpZiAocGFyYW0gaW4gZHluYW1pY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIGR5blZhbHVlID0gZHluYW1pY09wdGlvbnNbcGFyYW1dXG4gICAgICAgIHJldHVybiBjcmVhdGVEeW5hbWljRGVjbChkeW5WYWx1ZSwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICB2YXIgcmVzdWx0ID0gZW52Lmludm9rZShzY29wZSwgZHluVmFsdWUpXG4gICAgICAgICAgaWYgKGlzT2Zmc2V0KSB7XG4gICAgICAgICAgICBlbnYuT0ZGU0VUID0gcmVzdWx0XG4gICAgICAgICAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXG4gICAgICAgICAgICAgICAgcmVzdWx0ICsgJz49MCcsXG4gICAgICAgICAgICAgICAgJ2ludmFsaWQgJyArIHBhcmFtKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIGlmIChpc09mZnNldCAmJiBlbGVtZW50cykge1xuICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIGVudi5PRkZTRVQgPSAnMCdcbiAgICAgICAgICByZXR1cm4gMFxuICAgICAgICB9KVxuICAgICAgfVxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG5cbiAgICB2YXIgT0ZGU0VUID0gcGFyc2VQYXJhbShTX09GRlNFVCwgdHJ1ZSlcblxuICAgIGZ1bmN0aW9uIHBhcnNlVmVydENvdW50ICgpIHtcbiAgICAgIGlmIChTX0NPVU5UIGluIHN0YXRpY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIGNvdW50ID0gc3RhdGljT3B0aW9uc1tTX0NPVU5UXSB8IDBcbiAgICAgICAgY2hlY2suY29tbWFuZChcbiAgICAgICAgICB0eXBlb2YgY291bnQgPT09ICdudW1iZXInICYmIGNvdW50ID49IDAsICdpbnZhbGlkIHZlcnRleCBjb3VudCcsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcmV0dXJuIGNvdW50XG4gICAgICAgIH0pXG4gICAgICB9IGVsc2UgaWYgKFNfQ09VTlQgaW4gZHluYW1pY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIGR5bkNvdW50ID0gZHluYW1pY09wdGlvbnNbU19DT1VOVF1cbiAgICAgICAgcmV0dXJuIGNyZWF0ZUR5bmFtaWNEZWNsKGR5bkNvdW50LCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciByZXN1bHQgPSBlbnYuaW52b2tlKHNjb3BlLCBkeW5Db3VudClcbiAgICAgICAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxuICAgICAgICAgICAgICAndHlwZW9mICcgKyByZXN1bHQgKyAnPT09XCJudW1iZXJcIiYmJyArXG4gICAgICAgICAgICAgIHJlc3VsdCArICc+PTAmJicgK1xuICAgICAgICAgICAgICByZXN1bHQgKyAnPT09KCcgKyByZXN1bHQgKyAnfDApJyxcbiAgICAgICAgICAgICAgJ2ludmFsaWQgdmVydGV4IGNvdW50JylcbiAgICAgICAgICB9KVxuICAgICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSBpZiAoZWxlbWVudHMpIHtcbiAgICAgICAgaWYgKGlzU3RhdGljKGVsZW1lbnRzKSkge1xuICAgICAgICAgIGlmIChlbGVtZW50cykge1xuICAgICAgICAgICAgaWYgKE9GRlNFVCkge1xuICAgICAgICAgICAgICByZXR1cm4gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgICAgICAgICAgIE9GRlNFVC50aGlzRGVwLFxuICAgICAgICAgICAgICAgIE9GRlNFVC5jb250ZXh0RGVwLFxuICAgICAgICAgICAgICAgIE9GRlNFVC5wcm9wRGVwLFxuICAgICAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgICAgICAgICB2YXIgcmVzdWx0ID0gc2NvcGUuZGVmKFxuICAgICAgICAgICAgICAgICAgICBlbnYuRUxFTUVOVFMsICcudmVydENvdW50LScsIGVudi5PRkZTRVQpXG5cbiAgICAgICAgICAgICAgICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgZW52LmFzc2VydChzY29wZSxcbiAgICAgICAgICAgICAgICAgICAgICByZXN1bHQgKyAnPj0wJyxcbiAgICAgICAgICAgICAgICAgICAgICAnaW52YWxpZCB2ZXJ0ZXggb2Zmc2V0L2VsZW1lbnQgYnVmZmVyIHRvbyBzbWFsbCcpXG4gICAgICAgICAgICAgICAgICB9KVxuXG4gICAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihlbnYuRUxFTUVOVFMsICcudmVydENvdW50JylcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFyIHJlc3VsdCA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICByZXR1cm4gLTFcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgIHJlc3VsdC5NSVNTSU5HID0gdHJ1ZVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdmFyIHZhcmlhYmxlID0gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgICAgICAgZWxlbWVudHMudGhpc0RlcCB8fCBPRkZTRVQudGhpc0RlcCxcbiAgICAgICAgICAgIGVsZW1lbnRzLmNvbnRleHREZXAgfHwgT0ZGU0VULmNvbnRleHREZXAsXG4gICAgICAgICAgICBlbGVtZW50cy5wcm9wRGVwIHx8IE9GRlNFVC5wcm9wRGVwLFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICAgICAgdmFyIGVsZW1lbnRzID0gZW52LkVMRU1FTlRTXG4gICAgICAgICAgICAgIGlmIChlbnYuT0ZGU0VUKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihlbGVtZW50cywgJz8nLCBlbGVtZW50cywgJy52ZXJ0Q291bnQtJyxcbiAgICAgICAgICAgICAgICAgIGVudi5PRkZTRVQsICc6LTEnKVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoZWxlbWVudHMsICc/JywgZWxlbWVudHMsICcudmVydENvdW50Oi0xJylcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyaWFibGUuRFlOQU1JQyA9IHRydWVcbiAgICAgICAgICB9KVxuICAgICAgICAgIHJldHVybiB2YXJpYWJsZVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBlbGVtZW50czogZWxlbWVudHMsXG4gICAgICBwcmltaXRpdmU6IHBhcnNlUHJpbWl0aXZlKCksXG4gICAgICBjb3VudDogcGFyc2VWZXJ0Q291bnQoKSxcbiAgICAgIGluc3RhbmNlczogcGFyc2VQYXJhbShTX0lOU1RBTkNFUywgZmFsc2UpLFxuICAgICAgb2Zmc2V0OiBPRkZTRVRcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZUdMU3RhdGUgKG9wdGlvbnMsIGVudikge1xuICAgIHZhciBzdGF0aWNPcHRpb25zID0gb3B0aW9ucy5zdGF0aWNcbiAgICB2YXIgZHluYW1pY09wdGlvbnMgPSBvcHRpb25zLmR5bmFtaWNcblxuICAgIHZhciBTVEFURSA9IHt9XG5cbiAgICBHTF9TVEFURV9OQU1FUy5mb3JFYWNoKGZ1bmN0aW9uIChwcm9wKSB7XG4gICAgICB2YXIgcGFyYW0gPSBwcm9wTmFtZShwcm9wKVxuXG4gICAgICBmdW5jdGlvbiBwYXJzZVBhcmFtIChwYXJzZVN0YXRpYywgcGFyc2VEeW5hbWljKSB7XG4gICAgICAgIGlmIChwcm9wIGluIHN0YXRpY09wdGlvbnMpIHtcbiAgICAgICAgICB2YXIgdmFsdWUgPSBwYXJzZVN0YXRpYyhzdGF0aWNPcHRpb25zW3Byb3BdKVxuICAgICAgICAgIFNUQVRFW3BhcmFtXSA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHZhbHVlXG4gICAgICAgICAgfSlcbiAgICAgICAgfSBlbHNlIGlmIChwcm9wIGluIGR5bmFtaWNPcHRpb25zKSB7XG4gICAgICAgICAgdmFyIGR5biA9IGR5bmFtaWNPcHRpb25zW3Byb3BdXG4gICAgICAgICAgU1RBVEVbcGFyYW1dID0gY3JlYXRlRHluYW1pY0RlY2woZHluLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgICAgcmV0dXJuIHBhcnNlRHluYW1pYyhlbnYsIHNjb3BlLCBlbnYuaW52b2tlKHNjb3BlLCBkeW4pKVxuICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgc3dpdGNoIChwcm9wKSB7XG4gICAgICAgIGNhc2UgU19DVUxMX0VOQUJMRTpcbiAgICAgICAgY2FzZSBTX0JMRU5EX0VOQUJMRTpcbiAgICAgICAgY2FzZSBTX0RJVEhFUjpcbiAgICAgICAgY2FzZSBTX1NURU5DSUxfRU5BQkxFOlxuICAgICAgICBjYXNlIFNfREVQVEhfRU5BQkxFOlxuICAgICAgICBjYXNlIFNfU0NJU1NPUl9FTkFCTEU6XG4gICAgICAgIGNhc2UgU19QT0xZR09OX09GRlNFVF9FTkFCTEU6XG4gICAgICAgIGNhc2UgU19TQU1QTEVfQUxQSEE6XG4gICAgICAgIGNhc2UgU19TQU1QTEVfRU5BQkxFOlxuICAgICAgICBjYXNlIFNfREVQVEhfTUFTSzpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBjaGVjay5jb21tYW5kVHlwZSh2YWx1ZSwgJ2Jvb2xlYW4nLCBwcm9wLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxuICAgICAgICAgICAgICAgICAgJ3R5cGVvZiAnICsgdmFsdWUgKyAnPT09XCJib29sZWFuXCInLFxuICAgICAgICAgICAgICAgICAgJ2ludmFsaWQgZmxhZyAnICsgcHJvcCwgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfREVQVEhfRlVOQzpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBjaGVjay5jb21tYW5kUGFyYW1ldGVyKHZhbHVlLCBjb21wYXJlRnVuY3MsICdpbnZhbGlkICcgKyBwcm9wLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgcmV0dXJuIGNvbXBhcmVGdW5jc1t2YWx1ZV1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgdmFyIENPTVBBUkVfRlVOQ1MgPSBlbnYuY29uc3RhbnRzLmNvbXBhcmVGdW5jc1xuICAgICAgICAgICAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgZW52LmFzc2VydChzY29wZSxcbiAgICAgICAgICAgICAgICAgIHZhbHVlICsgJyBpbiAnICsgQ09NUEFSRV9GVU5DUyxcbiAgICAgICAgICAgICAgICAgICdpbnZhbGlkICcgKyBwcm9wICsgJywgbXVzdCBiZSBvbmUgb2YgJyArIE9iamVjdC5rZXlzKGNvbXBhcmVGdW5jcykpXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoQ09NUEFSRV9GVU5DUywgJ1snLCB2YWx1ZSwgJ10nKVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfREVQVEhfUkFOR0U6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgY2hlY2suY29tbWFuZChcbiAgICAgICAgICAgICAgICBpc0FycmF5TGlrZSh2YWx1ZSkgJiZcbiAgICAgICAgICAgICAgICB2YWx1ZS5sZW5ndGggPT09IDIgJiZcbiAgICAgICAgICAgICAgICB0eXBlb2YgdmFsdWVbMF0gPT09ICdudW1iZXInICYmXG4gICAgICAgICAgICAgICAgdHlwZW9mIHZhbHVlWzFdID09PSAnbnVtYmVyJyAmJlxuICAgICAgICAgICAgICAgIHZhbHVlWzBdIDw9IHZhbHVlWzFdLFxuICAgICAgICAgICAgICAgICdkZXB0aCByYW5nZSBpcyAyZCBhcnJheScsXG4gICAgICAgICAgICAgICAgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgZW52LmFzc2VydChzY29wZSxcbiAgICAgICAgICAgICAgICAgIGVudi5zaGFyZWQuaXNBcnJheUxpa2UgKyAnKCcgKyB2YWx1ZSArICcpJiYnICtcbiAgICAgICAgICAgICAgICAgIHZhbHVlICsgJy5sZW5ndGg9PT0yJiYnICtcbiAgICAgICAgICAgICAgICAgICd0eXBlb2YgJyArIHZhbHVlICsgJ1swXT09PVwibnVtYmVyXCImJicgK1xuICAgICAgICAgICAgICAgICAgJ3R5cGVvZiAnICsgdmFsdWUgKyAnWzFdPT09XCJudW1iZXJcIiYmJyArXG4gICAgICAgICAgICAgICAgICB2YWx1ZSArICdbMF08PScgKyB2YWx1ZSArICdbMV0nLFxuICAgICAgICAgICAgICAgICAgJ2RlcHRoIHJhbmdlIG11c3QgYmUgYSAyZCBhcnJheScpXG4gICAgICAgICAgICAgIH0pXG5cbiAgICAgICAgICAgICAgdmFyIFpfTkVBUiA9IHNjb3BlLmRlZignKycsIHZhbHVlLCAnWzBdJylcbiAgICAgICAgICAgICAgdmFyIFpfRkFSID0gc2NvcGUuZGVmKCcrJywgdmFsdWUsICdbMV0nKVxuICAgICAgICAgICAgICByZXR1cm4gW1pfTkVBUiwgWl9GQVJdXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19CTEVORF9GVU5DOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmRUeXBlKHZhbHVlLCAnb2JqZWN0JywgJ2JsZW5kLmZ1bmMnLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgdmFyIHNyY1JHQiA9ICgnc3JjUkdCJyBpbiB2YWx1ZSA/IHZhbHVlLnNyY1JHQiA6IHZhbHVlLnNyYylcbiAgICAgICAgICAgICAgdmFyIHNyY0FscGhhID0gKCdzcmNBbHBoYScgaW4gdmFsdWUgPyB2YWx1ZS5zcmNBbHBoYSA6IHZhbHVlLnNyYylcbiAgICAgICAgICAgICAgdmFyIGRzdFJHQiA9ICgnZHN0UkdCJyBpbiB2YWx1ZSA/IHZhbHVlLmRzdFJHQiA6IHZhbHVlLmRzdClcbiAgICAgICAgICAgICAgdmFyIGRzdEFscGhhID0gKCdkc3RBbHBoYScgaW4gdmFsdWUgPyB2YWx1ZS5kc3RBbHBoYSA6IHZhbHVlLmRzdClcbiAgICAgICAgICAgICAgY2hlY2suY29tbWFuZFBhcmFtZXRlcihzcmNSR0IsIGJsZW5kRnVuY3MsIHBhcmFtICsgJy5zcmNSR0InLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgY2hlY2suY29tbWFuZFBhcmFtZXRlcihzcmNBbHBoYSwgYmxlbmRGdW5jcywgcGFyYW0gKyAnLnNyY0FscGhhJywgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmRQYXJhbWV0ZXIoZHN0UkdCLCBibGVuZEZ1bmNzLCBwYXJhbSArICcuZHN0UkdCJywgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmRQYXJhbWV0ZXIoZHN0QWxwaGEsIGJsZW5kRnVuY3MsIHBhcmFtICsgJy5kc3RBbHBoYScsIGVudi5jb21tYW5kU3RyKVxuXG4gICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmQoXG4gICAgICAgICAgICAgICAgKGludmFsaWRCbGVuZENvbWJpbmF0aW9ucy5pbmRleE9mKHNyY1JHQiArICcsICcgKyBkc3RSR0IpID09PSAtMSksXG4gICAgICAgICAgICAgICAgJ3VuYWxsb3dlZCBibGVuZGluZyBjb21iaW5hdGlvbiAoc3JjUkdCLCBkc3RSR0IpID0gKCcgKyBzcmNSR0IgKyAnLCAnICsgZHN0UkdCICsgJyknLCBlbnYuY29tbWFuZFN0cilcblxuICAgICAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgICAgIGJsZW5kRnVuY3Nbc3JjUkdCXSxcbiAgICAgICAgICAgICAgICBibGVuZEZ1bmNzW2RzdFJHQl0sXG4gICAgICAgICAgICAgICAgYmxlbmRGdW5jc1tzcmNBbHBoYV0sXG4gICAgICAgICAgICAgICAgYmxlbmRGdW5jc1tkc3RBbHBoYV1cbiAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICB2YXIgQkxFTkRfRlVOQ1MgPSBlbnYuY29uc3RhbnRzLmJsZW5kRnVuY3NcblxuICAgICAgICAgICAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgZW52LmFzc2VydChzY29wZSxcbiAgICAgICAgICAgICAgICAgIHZhbHVlICsgJyYmdHlwZW9mICcgKyB2YWx1ZSArICc9PT1cIm9iamVjdFwiJyxcbiAgICAgICAgICAgICAgICAgICdpbnZhbGlkIGJsZW5kIGZ1bmMsIG11c3QgYmUgYW4gb2JqZWN0JylcbiAgICAgICAgICAgICAgfSlcblxuICAgICAgICAgICAgICBmdW5jdGlvbiByZWFkIChwcmVmaXgsIHN1ZmZpeCkge1xuICAgICAgICAgICAgICAgIHZhciBmdW5jID0gc2NvcGUuZGVmKFxuICAgICAgICAgICAgICAgICAgJ1wiJywgcHJlZml4LCBzdWZmaXgsICdcIiBpbiAnLCB2YWx1ZSxcbiAgICAgICAgICAgICAgICAgICc/JywgdmFsdWUsICcuJywgcHJlZml4LCBzdWZmaXgsXG4gICAgICAgICAgICAgICAgICAnOicsIHZhbHVlLCAnLicsIHByZWZpeClcblxuICAgICAgICAgICAgICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXG4gICAgICAgICAgICAgICAgICAgIGZ1bmMgKyAnIGluICcgKyBCTEVORF9GVU5DUyxcbiAgICAgICAgICAgICAgICAgICAgJ2ludmFsaWQgJyArIHByb3AgKyAnLicgKyBwcmVmaXggKyBzdWZmaXggKyAnLCBtdXN0IGJlIG9uZSBvZiAnICsgT2JqZWN0LmtleXMoYmxlbmRGdW5jcykpXG4gICAgICAgICAgICAgICAgfSlcblxuICAgICAgICAgICAgICAgIHJldHVybiBmdW5jXG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICB2YXIgc3JjUkdCID0gcmVhZCgnc3JjJywgJ1JHQicpXG4gICAgICAgICAgICAgIHZhciBkc3RSR0IgPSByZWFkKCdkc3QnLCAnUkdCJylcblxuICAgICAgICAgICAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgdmFyIElOVkFMSURfQkxFTkRfQ09NQklOQVRJT05TID0gZW52LmNvbnN0YW50cy5pbnZhbGlkQmxlbmRDb21iaW5hdGlvbnNcblxuICAgICAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICBJTlZBTElEX0JMRU5EX0NPTUJJTkFUSU9OUyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAnLmluZGV4T2YoJyArIHNyY1JHQiArICcrXCIsIFwiKycgKyBkc3RSR0IgKyAnKSA9PT0gLTEgJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICd1bmFsbG93ZWQgYmxlbmRpbmcgY29tYmluYXRpb24gZm9yIChzcmNSR0IsIGRzdFJHQiknXG4gICAgICAgICAgICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgfSlcblxuICAgICAgICAgICAgICB2YXIgU1JDX1JHQiA9IHNjb3BlLmRlZihCTEVORF9GVU5DUywgJ1snLCBzcmNSR0IsICddJylcbiAgICAgICAgICAgICAgdmFyIFNSQ19BTFBIQSA9IHNjb3BlLmRlZihCTEVORF9GVU5DUywgJ1snLCByZWFkKCdzcmMnLCAnQWxwaGEnKSwgJ10nKVxuICAgICAgICAgICAgICB2YXIgRFNUX1JHQiA9IHNjb3BlLmRlZihCTEVORF9GVU5DUywgJ1snLCBkc3RSR0IsICddJylcbiAgICAgICAgICAgICAgdmFyIERTVF9BTFBIQSA9IHNjb3BlLmRlZihCTEVORF9GVU5DUywgJ1snLCByZWFkKCdkc3QnLCAnQWxwaGEnKSwgJ10nKVxuXG4gICAgICAgICAgICAgIHJldHVybiBbU1JDX1JHQiwgRFNUX1JHQiwgU1JDX0FMUEhBLCBEU1RfQUxQSEFdXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19CTEVORF9FUVVBVElPTjpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmRQYXJhbWV0ZXIodmFsdWUsIGJsZW5kRXF1YXRpb25zLCAnaW52YWxpZCAnICsgcHJvcCwgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgICAgIGJsZW5kRXF1YXRpb25zW3ZhbHVlXSxcbiAgICAgICAgICAgICAgICAgIGJsZW5kRXF1YXRpb25zW3ZhbHVlXVxuICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgY2hlY2suY29tbWFuZFBhcmFtZXRlcihcbiAgICAgICAgICAgICAgICAgIHZhbHVlLnJnYiwgYmxlbmRFcXVhdGlvbnMsIHByb3AgKyAnLnJnYicsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmRQYXJhbWV0ZXIoXG4gICAgICAgICAgICAgICAgICB2YWx1ZS5hbHBoYSwgYmxlbmRFcXVhdGlvbnMsIHByb3AgKyAnLmFscGhhJywgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgICAgIGJsZW5kRXF1YXRpb25zW3ZhbHVlLnJnYl0sXG4gICAgICAgICAgICAgICAgICBibGVuZEVxdWF0aW9uc1t2YWx1ZS5hbHBoYV1cbiAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY2hlY2suY29tbWFuZFJhaXNlKCdpbnZhbGlkIGJsZW5kLmVxdWF0aW9uJywgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgdmFyIEJMRU5EX0VRVUFUSU9OUyA9IGVudi5jb25zdGFudHMuYmxlbmRFcXVhdGlvbnNcblxuICAgICAgICAgICAgICB2YXIgUkdCID0gc2NvcGUuZGVmKClcbiAgICAgICAgICAgICAgdmFyIEFMUEhBID0gc2NvcGUuZGVmKClcblxuICAgICAgICAgICAgICB2YXIgaWZ0ZSA9IGVudi5jb25kKCd0eXBlb2YgJywgdmFsdWUsICc9PT1cInN0cmluZ1wiJylcblxuICAgICAgICAgICAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgZnVuY3Rpb24gY2hlY2tQcm9wIChibG9jaywgbmFtZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgIGVudi5hc3NlcnQoYmxvY2ssXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlICsgJyBpbiAnICsgQkxFTkRfRVFVQVRJT05TLFxuICAgICAgICAgICAgICAgICAgICAnaW52YWxpZCAnICsgbmFtZSArICcsIG11c3QgYmUgb25lIG9mICcgKyBPYmplY3Qua2V5cyhibGVuZEVxdWF0aW9ucykpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNoZWNrUHJvcChpZnRlLnRoZW4sIHByb3AsIHZhbHVlKVxuXG4gICAgICAgICAgICAgICAgZW52LmFzc2VydChpZnRlLmVsc2UsXG4gICAgICAgICAgICAgICAgICB2YWx1ZSArICcmJnR5cGVvZiAnICsgdmFsdWUgKyAnPT09XCJvYmplY3RcIicsXG4gICAgICAgICAgICAgICAgICAnaW52YWxpZCAnICsgcHJvcClcbiAgICAgICAgICAgICAgICBjaGVja1Byb3AoaWZ0ZS5lbHNlLCBwcm9wICsgJy5yZ2InLCB2YWx1ZSArICcucmdiJylcbiAgICAgICAgICAgICAgICBjaGVja1Byb3AoaWZ0ZS5lbHNlLCBwcm9wICsgJy5hbHBoYScsIHZhbHVlICsgJy5hbHBoYScpXG4gICAgICAgICAgICAgIH0pXG5cbiAgICAgICAgICAgICAgaWZ0ZS50aGVuKFxuICAgICAgICAgICAgICAgIFJHQiwgJz0nLCBBTFBIQSwgJz0nLCBCTEVORF9FUVVBVElPTlMsICdbJywgdmFsdWUsICddOycpXG4gICAgICAgICAgICAgIGlmdGUuZWxzZShcbiAgICAgICAgICAgICAgICBSR0IsICc9JywgQkxFTkRfRVFVQVRJT05TLCAnWycsIHZhbHVlLCAnLnJnYl07JyxcbiAgICAgICAgICAgICAgICBBTFBIQSwgJz0nLCBCTEVORF9FUVVBVElPTlMsICdbJywgdmFsdWUsICcuYWxwaGFdOycpXG5cbiAgICAgICAgICAgICAgc2NvcGUoaWZ0ZSlcblxuICAgICAgICAgICAgICByZXR1cm4gW1JHQiwgQUxQSEFdXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19CTEVORF9DT0xPUjpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBjaGVjay5jb21tYW5kKFxuICAgICAgICAgICAgICAgIGlzQXJyYXlMaWtlKHZhbHVlKSAmJlxuICAgICAgICAgICAgICAgIHZhbHVlLmxlbmd0aCA9PT0gNCxcbiAgICAgICAgICAgICAgICAnYmxlbmQuY29sb3IgbXVzdCBiZSBhIDRkIGFycmF5JywgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgIHJldHVybiBsb29wKDQsIGZ1bmN0aW9uIChpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICt2YWx1ZVtpXVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgZW52LmFzc2VydChzY29wZSxcbiAgICAgICAgICAgICAgICAgIGVudi5zaGFyZWQuaXNBcnJheUxpa2UgKyAnKCcgKyB2YWx1ZSArICcpJiYnICtcbiAgICAgICAgICAgICAgICAgIHZhbHVlICsgJy5sZW5ndGg9PT00JyxcbiAgICAgICAgICAgICAgICAgICdibGVuZC5jb2xvciBtdXN0IGJlIGEgNGQgYXJyYXknKVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICByZXR1cm4gbG9vcCg0LCBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoJysnLCB2YWx1ZSwgJ1snLCBpLCAnXScpXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19TVEVOQ0lMX01BU0s6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgY2hlY2suY29tbWFuZFR5cGUodmFsdWUsICdudW1iZXInLCBwYXJhbSwgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZSB8IDBcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXG4gICAgICAgICAgICAgICAgICAndHlwZW9mICcgKyB2YWx1ZSArICc9PT1cIm51bWJlclwiJyxcbiAgICAgICAgICAgICAgICAgICdpbnZhbGlkIHN0ZW5jaWwubWFzaycpXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYodmFsdWUsICd8MCcpXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19TVEVOQ0lMX0ZVTkM6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgY2hlY2suY29tbWFuZFR5cGUodmFsdWUsICdvYmplY3QnLCBwYXJhbSwgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgIHZhciBjbXAgPSB2YWx1ZS5jbXAgfHwgJ2tlZXAnXG4gICAgICAgICAgICAgIHZhciByZWYgPSB2YWx1ZS5yZWYgfHwgMFxuICAgICAgICAgICAgICB2YXIgbWFzayA9ICdtYXNrJyBpbiB2YWx1ZSA/IHZhbHVlLm1hc2sgOiAtMVxuICAgICAgICAgICAgICBjaGVjay5jb21tYW5kUGFyYW1ldGVyKGNtcCwgY29tcGFyZUZ1bmNzLCBwcm9wICsgJy5jbXAnLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgY2hlY2suY29tbWFuZFR5cGUocmVmLCAnbnVtYmVyJywgcHJvcCArICcucmVmJywgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmRUeXBlKG1hc2ssICdudW1iZXInLCBwcm9wICsgJy5tYXNrJywgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICAgICAgY29tcGFyZUZ1bmNzW2NtcF0sXG4gICAgICAgICAgICAgICAgcmVmLFxuICAgICAgICAgICAgICAgIG1hc2tcbiAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICB2YXIgQ09NUEFSRV9GVU5DUyA9IGVudi5jb25zdGFudHMuY29tcGFyZUZ1bmNzXG4gICAgICAgICAgICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBmdW5jdGlvbiBhc3NlcnQgKCkge1xuICAgICAgICAgICAgICAgICAgZW52LmFzc2VydChzY29wZSxcbiAgICAgICAgICAgICAgICAgICAgQXJyYXkucHJvdG90eXBlLmpvaW4uY2FsbChhcmd1bWVudHMsICcnKSxcbiAgICAgICAgICAgICAgICAgICAgJ2ludmFsaWQgc3RlbmNpbC5mdW5jJylcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYXNzZXJ0KHZhbHVlICsgJyYmdHlwZW9mICcsIHZhbHVlLCAnPT09XCJvYmplY3RcIicpXG4gICAgICAgICAgICAgICAgYXNzZXJ0KCchKFwiY21wXCIgaW4gJywgdmFsdWUsICcpfHwoJyxcbiAgICAgICAgICAgICAgICAgIHZhbHVlLCAnLmNtcCBpbiAnLCBDT01QQVJFX0ZVTkNTLCAnKScpXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIHZhciBjbXAgPSBzY29wZS5kZWYoXG4gICAgICAgICAgICAgICAgJ1wiY21wXCIgaW4gJywgdmFsdWUsXG4gICAgICAgICAgICAgICAgJz8nLCBDT01QQVJFX0ZVTkNTLCAnWycsIHZhbHVlLCAnLmNtcF0nLFxuICAgICAgICAgICAgICAgICc6JywgR0xfS0VFUClcbiAgICAgICAgICAgICAgdmFyIHJlZiA9IHNjb3BlLmRlZih2YWx1ZSwgJy5yZWZ8MCcpXG4gICAgICAgICAgICAgIHZhciBtYXNrID0gc2NvcGUuZGVmKFxuICAgICAgICAgICAgICAgICdcIm1hc2tcIiBpbiAnLCB2YWx1ZSxcbiAgICAgICAgICAgICAgICAnPycsIHZhbHVlLCAnLm1hc2t8MDotMScpXG4gICAgICAgICAgICAgIHJldHVybiBbY21wLCByZWYsIG1hc2tdXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19TVEVOQ0lMX09QRlJPTlQ6XG4gICAgICAgIGNhc2UgU19TVEVOQ0lMX09QQkFDSzpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBjaGVjay5jb21tYW5kVHlwZSh2YWx1ZSwgJ29iamVjdCcsIHBhcmFtLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgdmFyIGZhaWwgPSB2YWx1ZS5mYWlsIHx8ICdrZWVwJ1xuICAgICAgICAgICAgICB2YXIgemZhaWwgPSB2YWx1ZS56ZmFpbCB8fCAna2VlcCdcbiAgICAgICAgICAgICAgdmFyIHpwYXNzID0gdmFsdWUuenBhc3MgfHwgJ2tlZXAnXG4gICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmRQYXJhbWV0ZXIoZmFpbCwgc3RlbmNpbE9wcywgcHJvcCArICcuZmFpbCcsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICBjaGVjay5jb21tYW5kUGFyYW1ldGVyKHpmYWlsLCBzdGVuY2lsT3BzLCBwcm9wICsgJy56ZmFpbCcsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICBjaGVjay5jb21tYW5kUGFyYW1ldGVyKHpwYXNzLCBzdGVuY2lsT3BzLCBwcm9wICsgJy56cGFzcycsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgICAgIHByb3AgPT09IFNfU1RFTkNJTF9PUEJBQ0sgPyBHTF9CQUNLIDogR0xfRlJPTlQsXG4gICAgICAgICAgICAgICAgc3RlbmNpbE9wc1tmYWlsXSxcbiAgICAgICAgICAgICAgICBzdGVuY2lsT3BzW3pmYWlsXSxcbiAgICAgICAgICAgICAgICBzdGVuY2lsT3BzW3pwYXNzXVxuICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIHZhciBTVEVOQ0lMX09QUyA9IGVudi5jb25zdGFudHMuc3RlbmNpbE9wc1xuXG4gICAgICAgICAgICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxuICAgICAgICAgICAgICAgICAgdmFsdWUgKyAnJiZ0eXBlb2YgJyArIHZhbHVlICsgJz09PVwib2JqZWN0XCInLFxuICAgICAgICAgICAgICAgICAgJ2ludmFsaWQgJyArIHByb3ApXG4gICAgICAgICAgICAgIH0pXG5cbiAgICAgICAgICAgICAgZnVuY3Rpb24gcmVhZCAobmFtZSkge1xuICAgICAgICAgICAgICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXG4gICAgICAgICAgICAgICAgICAgICchKFwiJyArIG5hbWUgKyAnXCIgaW4gJyArIHZhbHVlICsgJyl8fCcgK1xuICAgICAgICAgICAgICAgICAgICAnKCcgKyB2YWx1ZSArICcuJyArIG5hbWUgKyAnIGluICcgKyBTVEVOQ0lMX09QUyArICcpJyxcbiAgICAgICAgICAgICAgICAgICAgJ2ludmFsaWQgJyArIHByb3AgKyAnLicgKyBuYW1lICsgJywgbXVzdCBiZSBvbmUgb2YgJyArIE9iamVjdC5rZXlzKHN0ZW5jaWxPcHMpKVxuICAgICAgICAgICAgICAgIH0pXG5cbiAgICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKFxuICAgICAgICAgICAgICAgICAgJ1wiJywgbmFtZSwgJ1wiIGluICcsIHZhbHVlLFxuICAgICAgICAgICAgICAgICAgJz8nLCBTVEVOQ0lMX09QUywgJ1snLCB2YWx1ZSwgJy4nLCBuYW1lLCAnXTonLFxuICAgICAgICAgICAgICAgICAgR0xfS0VFUClcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICAgICAgcHJvcCA9PT0gU19TVEVOQ0lMX09QQkFDSyA/IEdMX0JBQ0sgOiBHTF9GUk9OVCxcbiAgICAgICAgICAgICAgICByZWFkKCdmYWlsJyksXG4gICAgICAgICAgICAgICAgcmVhZCgnemZhaWwnKSxcbiAgICAgICAgICAgICAgICByZWFkKCd6cGFzcycpXG4gICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX1BPTFlHT05fT0ZGU0VUX09GRlNFVDpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBjaGVjay5jb21tYW5kVHlwZSh2YWx1ZSwgJ29iamVjdCcsIHBhcmFtLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgdmFyIGZhY3RvciA9IHZhbHVlLmZhY3RvciB8IDBcbiAgICAgICAgICAgICAgdmFyIHVuaXRzID0gdmFsdWUudW5pdHMgfCAwXG4gICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmRUeXBlKGZhY3RvciwgJ251bWJlcicsIHBhcmFtICsgJy5mYWN0b3InLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgY2hlY2suY29tbWFuZFR5cGUodW5pdHMsICdudW1iZXInLCBwYXJhbSArICcudW5pdHMnLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgcmV0dXJuIFtmYWN0b3IsIHVuaXRzXVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgZW52LmFzc2VydChzY29wZSxcbiAgICAgICAgICAgICAgICAgIHZhbHVlICsgJyYmdHlwZW9mICcgKyB2YWx1ZSArICc9PT1cIm9iamVjdFwiJyxcbiAgICAgICAgICAgICAgICAgICdpbnZhbGlkICcgKyBwcm9wKVxuICAgICAgICAgICAgICB9KVxuXG4gICAgICAgICAgICAgIHZhciBGQUNUT1IgPSBzY29wZS5kZWYodmFsdWUsICcuZmFjdG9yfDAnKVxuICAgICAgICAgICAgICB2YXIgVU5JVFMgPSBzY29wZS5kZWYodmFsdWUsICcudW5pdHN8MCcpXG5cbiAgICAgICAgICAgICAgcmV0dXJuIFtGQUNUT1IsIFVOSVRTXVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfQ1VMTF9GQUNFOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIHZhciBmYWNlID0gMFxuICAgICAgICAgICAgICBpZiAodmFsdWUgPT09ICdmcm9udCcpIHtcbiAgICAgICAgICAgICAgICBmYWNlID0gR0xfRlJPTlRcbiAgICAgICAgICAgICAgfSBlbHNlIGlmICh2YWx1ZSA9PT0gJ2JhY2snKSB7XG4gICAgICAgICAgICAgICAgZmFjZSA9IEdMX0JBQ0tcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBjaGVjay5jb21tYW5kKCEhZmFjZSwgcGFyYW0sIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICByZXR1cm4gZmFjZVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgZW52LmFzc2VydChzY29wZSxcbiAgICAgICAgICAgICAgICAgIHZhbHVlICsgJz09PVwiZnJvbnRcInx8JyArXG4gICAgICAgICAgICAgICAgICB2YWx1ZSArICc9PT1cImJhY2tcIicsXG4gICAgICAgICAgICAgICAgICAnaW52YWxpZCBjdWxsLmZhY2UnKVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKHZhbHVlLCAnPT09XCJmcm9udFwiPycsIEdMX0ZST05ULCAnOicsIEdMX0JBQ0spXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19MSU5FX1dJRFRIOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmQoXG4gICAgICAgICAgICAgICAgdHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyAmJlxuICAgICAgICAgICAgICAgIHZhbHVlID49IGxpbWl0cy5saW5lV2lkdGhEaW1zWzBdICYmXG4gICAgICAgICAgICAgICAgdmFsdWUgPD0gbGltaXRzLmxpbmVXaWR0aERpbXNbMV0sXG4gICAgICAgICAgICAgICAgJ2ludmFsaWQgbGluZSB3aWR0aCwgbXVzdCBwb3NpdGl2ZSBudW1iZXIgYmV0d2VlbiAnICtcbiAgICAgICAgICAgICAgICBsaW1pdHMubGluZVdpZHRoRGltc1swXSArICcgYW5kICcgKyBsaW1pdHMubGluZVdpZHRoRGltc1sxXSwgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgZW52LmFzc2VydChzY29wZSxcbiAgICAgICAgICAgICAgICAgICd0eXBlb2YgJyArIHZhbHVlICsgJz09PVwibnVtYmVyXCImJicgK1xuICAgICAgICAgICAgICAgICAgdmFsdWUgKyAnPj0nICsgbGltaXRzLmxpbmVXaWR0aERpbXNbMF0gKyAnJiYnICtcbiAgICAgICAgICAgICAgICAgIHZhbHVlICsgJzw9JyArIGxpbWl0cy5saW5lV2lkdGhEaW1zWzFdLFxuICAgICAgICAgICAgICAgICAgJ2ludmFsaWQgbGluZSB3aWR0aCcpXG4gICAgICAgICAgICAgIH0pXG5cbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19GUk9OVF9GQUNFOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmRQYXJhbWV0ZXIodmFsdWUsIG9yaWVudGF0aW9uVHlwZSwgcGFyYW0sIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICByZXR1cm4gb3JpZW50YXRpb25UeXBlW3ZhbHVlXVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgZW52LmFzc2VydChzY29wZSxcbiAgICAgICAgICAgICAgICAgIHZhbHVlICsgJz09PVwiY3dcInx8JyArXG4gICAgICAgICAgICAgICAgICB2YWx1ZSArICc9PT1cImNjd1wiJyxcbiAgICAgICAgICAgICAgICAgICdpbnZhbGlkIGZyb250RmFjZSwgbXVzdCBiZSBvbmUgb2YgY3csY2N3JylcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZih2YWx1ZSArICc9PT1cImN3XCI/JyArIEdMX0NXICsgJzonICsgR0xfQ0NXKVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfQ09MT1JfTUFTSzpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBjaGVjay5jb21tYW5kKFxuICAgICAgICAgICAgICAgIGlzQXJyYXlMaWtlKHZhbHVlKSAmJiB2YWx1ZS5sZW5ndGggPT09IDQsXG4gICAgICAgICAgICAgICAgJ2NvbG9yLm1hc2sgbXVzdCBiZSBsZW5ndGggNCBhcnJheScsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICByZXR1cm4gdmFsdWUubWFwKGZ1bmN0aW9uICh2KSB7IHJldHVybiAhIXYgfSlcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXG4gICAgICAgICAgICAgICAgICBlbnYuc2hhcmVkLmlzQXJyYXlMaWtlICsgJygnICsgdmFsdWUgKyAnKSYmJyArXG4gICAgICAgICAgICAgICAgICB2YWx1ZSArICcubGVuZ3RoPT09NCcsXG4gICAgICAgICAgICAgICAgICAnaW52YWxpZCBjb2xvci5tYXNrJylcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgcmV0dXJuIGxvb3AoNCwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gJyEhJyArIHZhbHVlICsgJ1snICsgaSArICddJ1xuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfU0FNUExFX0NPVkVSQUdFOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmQodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSwgcGFyYW0sIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICB2YXIgc2FtcGxlVmFsdWUgPSAndmFsdWUnIGluIHZhbHVlID8gdmFsdWUudmFsdWUgOiAxXG4gICAgICAgICAgICAgIHZhciBzYW1wbGVJbnZlcnQgPSAhIXZhbHVlLmludmVydFxuICAgICAgICAgICAgICBjaGVjay5jb21tYW5kKFxuICAgICAgICAgICAgICAgIHR5cGVvZiBzYW1wbGVWYWx1ZSA9PT0gJ251bWJlcicgJiZcbiAgICAgICAgICAgICAgICBzYW1wbGVWYWx1ZSA+PSAwICYmIHNhbXBsZVZhbHVlIDw9IDEsXG4gICAgICAgICAgICAgICAgJ3NhbXBsZS5jb3ZlcmFnZS52YWx1ZSBtdXN0IGJlIGEgbnVtYmVyIGJldHdlZW4gMCBhbmQgMScsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICByZXR1cm4gW3NhbXBsZVZhbHVlLCBzYW1wbGVJbnZlcnRdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxuICAgICAgICAgICAgICAgICAgdmFsdWUgKyAnJiZ0eXBlb2YgJyArIHZhbHVlICsgJz09PVwib2JqZWN0XCInLFxuICAgICAgICAgICAgICAgICAgJ2ludmFsaWQgc2FtcGxlLmNvdmVyYWdlJylcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgdmFyIFZBTFVFID0gc2NvcGUuZGVmKFxuICAgICAgICAgICAgICAgICdcInZhbHVlXCIgaW4gJywgdmFsdWUsICc/KycsIHZhbHVlLCAnLnZhbHVlOjEnKVxuICAgICAgICAgICAgICB2YXIgSU5WRVJUID0gc2NvcGUuZGVmKCchIScsIHZhbHVlLCAnLmludmVydCcpXG4gICAgICAgICAgICAgIHJldHVybiBbVkFMVUUsIElOVkVSVF1cbiAgICAgICAgICAgIH0pXG4gICAgICB9XG4gICAgfSlcblxuICAgIHJldHVybiBTVEFURVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VVbmlmb3JtcyAodW5pZm9ybXMsIGVudikge1xuICAgIHZhciBzdGF0aWNVbmlmb3JtcyA9IHVuaWZvcm1zLnN0YXRpY1xuICAgIHZhciBkeW5hbWljVW5pZm9ybXMgPSB1bmlmb3Jtcy5keW5hbWljXG5cbiAgICB2YXIgVU5JRk9STVMgPSB7fVxuXG4gICAgT2JqZWN0LmtleXMoc3RhdGljVW5pZm9ybXMpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHZhciB2YWx1ZSA9IHN0YXRpY1VuaWZvcm1zW25hbWVdXG4gICAgICB2YXIgcmVzdWx0XG4gICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyB8fFxuICAgICAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgIHJlc3VsdCA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHJldHVybiB2YWx1ZVxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgdmFsdWUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgdmFyIHJlZ2xUeXBlID0gdmFsdWUuX3JlZ2xUeXBlXG4gICAgICAgIGlmIChyZWdsVHlwZSA9PT0gJ3RleHR1cmUyZCcgfHxcbiAgICAgICAgICAgIHJlZ2xUeXBlID09PSAndGV4dHVyZUN1YmUnKSB7XG4gICAgICAgICAgcmVzdWx0ID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52KSB7XG4gICAgICAgICAgICByZXR1cm4gZW52LmxpbmsodmFsdWUpXG4gICAgICAgICAgfSlcbiAgICAgICAgfSBlbHNlIGlmIChyZWdsVHlwZSA9PT0gJ2ZyYW1lYnVmZmVyJyB8fFxuICAgICAgICAgICAgICAgICAgIHJlZ2xUeXBlID09PSAnZnJhbWVidWZmZXJDdWJlJykge1xuICAgICAgICAgIGNoZWNrLmNvbW1hbmQodmFsdWUuY29sb3IubGVuZ3RoID4gMCxcbiAgICAgICAgICAgICdtaXNzaW5nIGNvbG9yIGF0dGFjaG1lbnQgZm9yIGZyYW1lYnVmZmVyIHNlbnQgdG8gdW5pZm9ybSBcIicgKyBuYW1lICsgJ1wiJywgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgcmVzdWx0ID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52KSB7XG4gICAgICAgICAgICByZXR1cm4gZW52LmxpbmsodmFsdWUuY29sb3JbMF0pXG4gICAgICAgICAgfSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjaGVjay5jb21tYW5kUmFpc2UoJ2ludmFsaWQgZGF0YSBmb3IgdW5pZm9ybSBcIicgKyBuYW1lICsgJ1wiJywgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoaXNBcnJheUxpa2UodmFsdWUpKSB7XG4gICAgICAgIHJlc3VsdCA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudikge1xuICAgICAgICAgIHZhciBJVEVNID0gZW52Lmdsb2JhbC5kZWYoJ1snLFxuICAgICAgICAgICAgbG9vcCh2YWx1ZS5sZW5ndGgsIGZ1bmN0aW9uIChpKSB7XG4gICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmQoXG4gICAgICAgICAgICAgICAgdHlwZW9mIHZhbHVlW2ldID09PSAnbnVtYmVyJyB8fFxuICAgICAgICAgICAgICAgIHR5cGVvZiB2YWx1ZVtpXSA9PT0gJ2Jvb2xlYW4nLFxuICAgICAgICAgICAgICAgICdpbnZhbGlkIHVuaWZvcm0gJyArIG5hbWUsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICByZXR1cm4gdmFsdWVbaV1cbiAgICAgICAgICAgIH0pLCAnXScpXG4gICAgICAgICAgcmV0dXJuIElURU1cbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNoZWNrLmNvbW1hbmRSYWlzZSgnaW52YWxpZCBvciBtaXNzaW5nIGRhdGEgZm9yIHVuaWZvcm0gXCInICsgbmFtZSArICdcIicsIGVudi5jb21tYW5kU3RyKVxuICAgICAgfVxuICAgICAgcmVzdWx0LnZhbHVlID0gdmFsdWVcbiAgICAgIFVOSUZPUk1TW25hbWVdID0gcmVzdWx0XG4gICAgfSlcblxuICAgIE9iamVjdC5rZXlzKGR5bmFtaWNVbmlmb3JtcykuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICB2YXIgZHluID0gZHluYW1pY1VuaWZvcm1zW2tleV1cbiAgICAgIFVOSUZPUk1TW2tleV0gPSBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgIHJldHVybiBlbnYuaW52b2tlKHNjb3BlLCBkeW4pXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICByZXR1cm4gVU5JRk9STVNcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlQXR0cmlidXRlcyAoYXR0cmlidXRlcywgZW52KSB7XG4gICAgdmFyIHN0YXRpY0F0dHJpYnV0ZXMgPSBhdHRyaWJ1dGVzLnN0YXRpY1xuICAgIHZhciBkeW5hbWljQXR0cmlidXRlcyA9IGF0dHJpYnV0ZXMuZHluYW1pY1xuXG4gICAgdmFyIGF0dHJpYnV0ZURlZnMgPSB7fVxuXG4gICAgT2JqZWN0LmtleXMoc3RhdGljQXR0cmlidXRlcykuZm9yRWFjaChmdW5jdGlvbiAoYXR0cmlidXRlKSB7XG4gICAgICB2YXIgdmFsdWUgPSBzdGF0aWNBdHRyaWJ1dGVzW2F0dHJpYnV0ZV1cbiAgICAgIHZhciBpZCA9IHN0cmluZ1N0b3JlLmlkKGF0dHJpYnV0ZSlcblxuICAgICAgdmFyIHJlY29yZCA9IG5ldyBBdHRyaWJ1dGVSZWNvcmQoKVxuICAgICAgaWYgKGlzQnVmZmVyQXJncyh2YWx1ZSkpIHtcbiAgICAgICAgcmVjb3JkLnN0YXRlID0gQVRUUklCX1NUQVRFX1BPSU5URVJcbiAgICAgICAgcmVjb3JkLmJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmdldEJ1ZmZlcihcbiAgICAgICAgICBidWZmZXJTdGF0ZS5jcmVhdGUodmFsdWUsIEdMX0FSUkFZX0JVRkZFUiwgZmFsc2UsIHRydWUpKVxuICAgICAgICByZWNvcmQudHlwZSA9IDBcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBidWZmZXIgPSBidWZmZXJTdGF0ZS5nZXRCdWZmZXIodmFsdWUpXG4gICAgICAgIGlmIChidWZmZXIpIHtcbiAgICAgICAgICByZWNvcmQuc3RhdGUgPSBBVFRSSUJfU1RBVEVfUE9JTlRFUlxuICAgICAgICAgIHJlY29yZC5idWZmZXIgPSBidWZmZXJcbiAgICAgICAgICByZWNvcmQudHlwZSA9IDBcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjaGVjay5jb21tYW5kKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUsXG4gICAgICAgICAgICAnaW52YWxpZCBkYXRhIGZvciBhdHRyaWJ1dGUgJyArIGF0dHJpYnV0ZSwgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgaWYgKHZhbHVlLmNvbnN0YW50KSB7XG4gICAgICAgICAgICB2YXIgY29uc3RhbnQgPSB2YWx1ZS5jb25zdGFudFxuICAgICAgICAgICAgcmVjb3JkLmJ1ZmZlciA9ICdudWxsJ1xuICAgICAgICAgICAgcmVjb3JkLnN0YXRlID0gQVRUUklCX1NUQVRFX0NPTlNUQU5UXG4gICAgICAgICAgICBpZiAodHlwZW9mIGNvbnN0YW50ID09PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgICByZWNvcmQueCA9IGNvbnN0YW50XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBjaGVjay5jb21tYW5kKFxuICAgICAgICAgICAgICAgIGlzQXJyYXlMaWtlKGNvbnN0YW50KSAmJlxuICAgICAgICAgICAgICAgIGNvbnN0YW50Lmxlbmd0aCA+IDAgJiZcbiAgICAgICAgICAgICAgICBjb25zdGFudC5sZW5ndGggPD0gNCxcbiAgICAgICAgICAgICAgICAnaW52YWxpZCBjb25zdGFudCBmb3IgYXR0cmlidXRlICcgKyBhdHRyaWJ1dGUsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICBDVVRFX0NPTVBPTkVOVFMuZm9yRWFjaChmdW5jdGlvbiAoYywgaSkge1xuICAgICAgICAgICAgICAgIGlmIChpIDwgY29uc3RhbnQubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICByZWNvcmRbY10gPSBjb25zdGFudFtpXVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKGlzQnVmZmVyQXJncyh2YWx1ZS5idWZmZXIpKSB7XG4gICAgICAgICAgICAgIGJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmdldEJ1ZmZlcihcbiAgICAgICAgICAgICAgICBidWZmZXJTdGF0ZS5jcmVhdGUodmFsdWUuYnVmZmVyLCBHTF9BUlJBWV9CVUZGRVIsIGZhbHNlLCB0cnVlKSlcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmdldEJ1ZmZlcih2YWx1ZS5idWZmZXIpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjaGVjay5jb21tYW5kKCEhYnVmZmVyLCAnbWlzc2luZyBidWZmZXIgZm9yIGF0dHJpYnV0ZSBcIicgKyBhdHRyaWJ1dGUgKyAnXCInLCBlbnYuY29tbWFuZFN0cilcblxuICAgICAgICAgICAgdmFyIG9mZnNldCA9IHZhbHVlLm9mZnNldCB8IDBcbiAgICAgICAgICAgIGNoZWNrLmNvbW1hbmQob2Zmc2V0ID49IDAsXG4gICAgICAgICAgICAgICdpbnZhbGlkIG9mZnNldCBmb3IgYXR0cmlidXRlIFwiJyArIGF0dHJpYnV0ZSArICdcIicsIGVudi5jb21tYW5kU3RyKVxuXG4gICAgICAgICAgICB2YXIgc3RyaWRlID0gdmFsdWUuc3RyaWRlIHwgMFxuICAgICAgICAgICAgY2hlY2suY29tbWFuZChzdHJpZGUgPj0gMCAmJiBzdHJpZGUgPCAyNTYsXG4gICAgICAgICAgICAgICdpbnZhbGlkIHN0cmlkZSBmb3IgYXR0cmlidXRlIFwiJyArIGF0dHJpYnV0ZSArICdcIiwgbXVzdCBiZSBpbnRlZ2VyIGJldHdlZWVuIFswLCAyNTVdJywgZW52LmNvbW1hbmRTdHIpXG5cbiAgICAgICAgICAgIHZhciBzaXplID0gdmFsdWUuc2l6ZSB8IDBcbiAgICAgICAgICAgIGNoZWNrLmNvbW1hbmQoISgnc2l6ZScgaW4gdmFsdWUpIHx8IChzaXplID4gMCAmJiBzaXplIDw9IDQpLFxuICAgICAgICAgICAgICAnaW52YWxpZCBzaXplIGZvciBhdHRyaWJ1dGUgXCInICsgYXR0cmlidXRlICsgJ1wiLCBtdXN0IGJlIDEsMiwzLDQnLCBlbnYuY29tbWFuZFN0cilcblxuICAgICAgICAgICAgdmFyIG5vcm1hbGl6ZWQgPSAhIXZhbHVlLm5vcm1hbGl6ZWRcblxuICAgICAgICAgICAgdmFyIHR5cGUgPSAwXG4gICAgICAgICAgICBpZiAoJ3R5cGUnIGluIHZhbHVlKSB7XG4gICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmRQYXJhbWV0ZXIoXG4gICAgICAgICAgICAgICAgdmFsdWUudHlwZSwgZ2xUeXBlcyxcbiAgICAgICAgICAgICAgICAnaW52YWxpZCB0eXBlIGZvciBhdHRyaWJ1dGUgJyArIGF0dHJpYnV0ZSwgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgIHR5cGUgPSBnbFR5cGVzW3ZhbHVlLnR5cGVdXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBkaXZpc29yID0gdmFsdWUuZGl2aXNvciB8IDBcbiAgICAgICAgICAgIGlmICgnZGl2aXNvcicgaW4gdmFsdWUpIHtcbiAgICAgICAgICAgICAgY2hlY2suY29tbWFuZChkaXZpc29yID09PSAwIHx8IGV4dEluc3RhbmNpbmcsXG4gICAgICAgICAgICAgICAgJ2Nhbm5vdCBzcGVjaWZ5IGRpdmlzb3IgZm9yIGF0dHJpYnV0ZSBcIicgKyBhdHRyaWJ1dGUgKyAnXCIsIGluc3RhbmNpbmcgbm90IHN1cHBvcnRlZCcsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICBjaGVjay5jb21tYW5kKGRpdmlzb3IgPj0gMCxcbiAgICAgICAgICAgICAgICAnaW52YWxpZCBkaXZpc29yIGZvciBhdHRyaWJ1dGUgXCInICsgYXR0cmlidXRlICsgJ1wiJywgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgdmFyIGNvbW1hbmQgPSBlbnYuY29tbWFuZFN0clxuXG4gICAgICAgICAgICAgIHZhciBWQUxJRF9LRVlTID0gW1xuICAgICAgICAgICAgICAgICdidWZmZXInLFxuICAgICAgICAgICAgICAgICdvZmZzZXQnLFxuICAgICAgICAgICAgICAgICdkaXZpc29yJyxcbiAgICAgICAgICAgICAgICAnbm9ybWFsaXplZCcsXG4gICAgICAgICAgICAgICAgJ3R5cGUnLFxuICAgICAgICAgICAgICAgICdzaXplJyxcbiAgICAgICAgICAgICAgICAnc3RyaWRlJ1xuICAgICAgICAgICAgICBdXG5cbiAgICAgICAgICAgICAgT2JqZWN0LmtleXModmFsdWUpLmZvckVhY2goZnVuY3Rpb24gKHByb3ApIHtcbiAgICAgICAgICAgICAgICBjaGVjay5jb21tYW5kKFxuICAgICAgICAgICAgICAgICAgVkFMSURfS0VZUy5pbmRleE9mKHByb3ApID49IDAsXG4gICAgICAgICAgICAgICAgICAndW5rbm93biBwYXJhbWV0ZXIgXCInICsgcHJvcCArICdcIiBmb3IgYXR0cmlidXRlIHBvaW50ZXIgXCInICsgYXR0cmlidXRlICsgJ1wiICh2YWxpZCBwYXJhbWV0ZXJzIGFyZSAnICsgVkFMSURfS0VZUyArICcpJyxcbiAgICAgICAgICAgICAgICAgIGNvbW1hbmQpXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgICAgICByZWNvcmQuYnVmZmVyID0gYnVmZmVyXG4gICAgICAgICAgICByZWNvcmQuc3RhdGUgPSBBVFRSSUJfU1RBVEVfUE9JTlRFUlxuICAgICAgICAgICAgcmVjb3JkLnNpemUgPSBzaXplXG4gICAgICAgICAgICByZWNvcmQubm9ybWFsaXplZCA9IG5vcm1hbGl6ZWRcbiAgICAgICAgICAgIHJlY29yZC50eXBlID0gdHlwZSB8fCBidWZmZXIuZHR5cGVcbiAgICAgICAgICAgIHJlY29yZC5vZmZzZXQgPSBvZmZzZXRcbiAgICAgICAgICAgIHJlY29yZC5zdHJpZGUgPSBzdHJpZGVcbiAgICAgICAgICAgIHJlY29yZC5kaXZpc29yID0gZGl2aXNvclxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBhdHRyaWJ1dGVEZWZzW2F0dHJpYnV0ZV0gPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgIHZhciBjYWNoZSA9IGVudi5hdHRyaWJDYWNoZVxuICAgICAgICBpZiAoaWQgaW4gY2FjaGUpIHtcbiAgICAgICAgICByZXR1cm4gY2FjaGVbaWRdXG4gICAgICAgIH1cbiAgICAgICAgdmFyIHJlc3VsdCA9IHtcbiAgICAgICAgICBpc1N0cmVhbTogZmFsc2VcbiAgICAgICAgfVxuICAgICAgICBPYmplY3Qua2V5cyhyZWNvcmQpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgICAgIHJlc3VsdFtrZXldID0gcmVjb3JkW2tleV1cbiAgICAgICAgfSlcbiAgICAgICAgaWYgKHJlY29yZC5idWZmZXIpIHtcbiAgICAgICAgICByZXN1bHQuYnVmZmVyID0gZW52LmxpbmsocmVjb3JkLmJ1ZmZlcilcbiAgICAgICAgICByZXN1bHQudHlwZSA9IHJlc3VsdC50eXBlIHx8IChyZXN1bHQuYnVmZmVyICsgJy5kdHlwZScpXG4gICAgICAgIH1cbiAgICAgICAgY2FjaGVbaWRdID0gcmVzdWx0XG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIE9iamVjdC5rZXlzKGR5bmFtaWNBdHRyaWJ1dGVzKS5mb3JFYWNoKGZ1bmN0aW9uIChhdHRyaWJ1dGUpIHtcbiAgICAgIHZhciBkeW4gPSBkeW5hbWljQXR0cmlidXRlc1thdHRyaWJ1dGVdXG5cbiAgICAgIGZ1bmN0aW9uIGFwcGVuZEF0dHJpYnV0ZUNvZGUgKGVudiwgYmxvY2spIHtcbiAgICAgICAgdmFyIFZBTFVFID0gZW52Lmludm9rZShibG9jaywgZHluKVxuXG4gICAgICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG5cbiAgICAgICAgdmFyIElTX0JVRkZFUl9BUkdTID0gc2hhcmVkLmlzQnVmZmVyQXJnc1xuICAgICAgICB2YXIgQlVGRkVSX1NUQVRFID0gc2hhcmVkLmJ1ZmZlclxuXG4gICAgICAgIC8vIFBlcmZvcm0gdmFsaWRhdGlvbiBvbiBhdHRyaWJ1dGVcbiAgICAgICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGVudi5hc3NlcnQoYmxvY2ssXG4gICAgICAgICAgICBWQUxVRSArICcmJih0eXBlb2YgJyArIFZBTFVFICsgJz09PVwib2JqZWN0XCJ8fHR5cGVvZiAnICtcbiAgICAgICAgICAgIFZBTFVFICsgJz09PVwiZnVuY3Rpb25cIikmJignICtcbiAgICAgICAgICAgIElTX0JVRkZFUl9BUkdTICsgJygnICsgVkFMVUUgKyAnKXx8JyArXG4gICAgICAgICAgICBCVUZGRVJfU1RBVEUgKyAnLmdldEJ1ZmZlcignICsgVkFMVUUgKyAnKXx8JyArXG4gICAgICAgICAgICBCVUZGRVJfU1RBVEUgKyAnLmdldEJ1ZmZlcignICsgVkFMVUUgKyAnLmJ1ZmZlcil8fCcgK1xuICAgICAgICAgICAgSVNfQlVGRkVSX0FSR1MgKyAnKCcgKyBWQUxVRSArICcuYnVmZmVyKXx8JyArXG4gICAgICAgICAgICAnKFwiY29uc3RhbnRcIiBpbiAnICsgVkFMVUUgK1xuICAgICAgICAgICAgJyYmKHR5cGVvZiAnICsgVkFMVUUgKyAnLmNvbnN0YW50PT09XCJudW1iZXJcInx8JyArXG4gICAgICAgICAgICBzaGFyZWQuaXNBcnJheUxpa2UgKyAnKCcgKyBWQUxVRSArICcuY29uc3RhbnQpKSkpJyxcbiAgICAgICAgICAgICdpbnZhbGlkIGR5bmFtaWMgYXR0cmlidXRlIFwiJyArIGF0dHJpYnV0ZSArICdcIicpXG4gICAgICAgIH0pXG5cbiAgICAgICAgLy8gYWxsb2NhdGUgbmFtZXMgZm9yIHJlc3VsdFxuICAgICAgICB2YXIgcmVzdWx0ID0ge1xuICAgICAgICAgIGlzU3RyZWFtOiBibG9jay5kZWYoZmFsc2UpXG4gICAgICAgIH1cbiAgICAgICAgdmFyIGRlZmF1bHRSZWNvcmQgPSBuZXcgQXR0cmlidXRlUmVjb3JkKClcbiAgICAgICAgZGVmYXVsdFJlY29yZC5zdGF0ZSA9IEFUVFJJQl9TVEFURV9QT0lOVEVSXG4gICAgICAgIE9iamVjdC5rZXlzKGRlZmF1bHRSZWNvcmQpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgICAgIHJlc3VsdFtrZXldID0gYmxvY2suZGVmKCcnICsgZGVmYXVsdFJlY29yZFtrZXldKVxuICAgICAgICB9KVxuXG4gICAgICAgIHZhciBCVUZGRVIgPSByZXN1bHQuYnVmZmVyXG4gICAgICAgIHZhciBUWVBFID0gcmVzdWx0LnR5cGVcbiAgICAgICAgYmxvY2soXG4gICAgICAgICAgJ2lmKCcsIElTX0JVRkZFUl9BUkdTLCAnKCcsIFZBTFVFLCAnKSl7JyxcbiAgICAgICAgICByZXN1bHQuaXNTdHJlYW0sICc9dHJ1ZTsnLFxuICAgICAgICAgIEJVRkZFUiwgJz0nLCBCVUZGRVJfU1RBVEUsICcuY3JlYXRlU3RyZWFtKCcsIEdMX0FSUkFZX0JVRkZFUiwgJywnLCBWQUxVRSwgJyk7JyxcbiAgICAgICAgICBUWVBFLCAnPScsIEJVRkZFUiwgJy5kdHlwZTsnLFxuICAgICAgICAgICd9ZWxzZXsnLFxuICAgICAgICAgIEJVRkZFUiwgJz0nLCBCVUZGRVJfU1RBVEUsICcuZ2V0QnVmZmVyKCcsIFZBTFVFLCAnKTsnLFxuICAgICAgICAgICdpZignLCBCVUZGRVIsICcpeycsXG4gICAgICAgICAgVFlQRSwgJz0nLCBCVUZGRVIsICcuZHR5cGU7JyxcbiAgICAgICAgICAnfWVsc2UgaWYoXCJjb25zdGFudFwiIGluICcsIFZBTFVFLCAnKXsnLFxuICAgICAgICAgIHJlc3VsdC5zdGF0ZSwgJz0nLCBBVFRSSUJfU1RBVEVfQ09OU1RBTlQsICc7JyxcbiAgICAgICAgICAnaWYodHlwZW9mICcgKyBWQUxVRSArICcuY29uc3RhbnQgPT09IFwibnVtYmVyXCIpeycsXG4gICAgICAgICAgcmVzdWx0W0NVVEVfQ09NUE9ORU5UU1swXV0sICc9JywgVkFMVUUsICcuY29uc3RhbnQ7JyxcbiAgICAgICAgICBDVVRFX0NPTVBPTkVOVFMuc2xpY2UoMSkubWFwKGZ1bmN0aW9uIChuKSB7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0W25dXG4gICAgICAgICAgfSkuam9pbignPScpLCAnPTA7JyxcbiAgICAgICAgICAnfWVsc2V7JyxcbiAgICAgICAgICBDVVRFX0NPTVBPTkVOVFMubWFwKGZ1bmN0aW9uIChuYW1lLCBpKSB7XG4gICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICByZXN1bHRbbmFtZV0gKyAnPScgKyBWQUxVRSArICcuY29uc3RhbnQubGVuZ3RoPj0nICsgaSArXG4gICAgICAgICAgICAgICc/JyArIFZBTFVFICsgJy5jb25zdGFudFsnICsgaSArICddOjA7J1xuICAgICAgICAgICAgKVxuICAgICAgICAgIH0pLmpvaW4oJycpLFxuICAgICAgICAgICd9fWVsc2V7JyxcbiAgICAgICAgICAnaWYoJywgSVNfQlVGRkVSX0FSR1MsICcoJywgVkFMVUUsICcuYnVmZmVyKSl7JyxcbiAgICAgICAgICBCVUZGRVIsICc9JywgQlVGRkVSX1NUQVRFLCAnLmNyZWF0ZVN0cmVhbSgnLCBHTF9BUlJBWV9CVUZGRVIsICcsJywgVkFMVUUsICcuYnVmZmVyKTsnLFxuICAgICAgICAgICd9ZWxzZXsnLFxuICAgICAgICAgIEJVRkZFUiwgJz0nLCBCVUZGRVJfU1RBVEUsICcuZ2V0QnVmZmVyKCcsIFZBTFVFLCAnLmJ1ZmZlcik7JyxcbiAgICAgICAgICAnfScsXG4gICAgICAgICAgVFlQRSwgJz1cInR5cGVcIiBpbiAnLCBWQUxVRSwgJz8nLFxuICAgICAgICAgIHNoYXJlZC5nbFR5cGVzLCAnWycsIFZBTFVFLCAnLnR5cGVdOicsIEJVRkZFUiwgJy5kdHlwZTsnLFxuICAgICAgICAgIHJlc3VsdC5ub3JtYWxpemVkLCAnPSEhJywgVkFMVUUsICcubm9ybWFsaXplZDsnKVxuICAgICAgICBmdW5jdGlvbiBlbWl0UmVhZFJlY29yZCAobmFtZSkge1xuICAgICAgICAgIGJsb2NrKHJlc3VsdFtuYW1lXSwgJz0nLCBWQUxVRSwgJy4nLCBuYW1lLCAnfDA7JylcbiAgICAgICAgfVxuICAgICAgICBlbWl0UmVhZFJlY29yZCgnc2l6ZScpXG4gICAgICAgIGVtaXRSZWFkUmVjb3JkKCdvZmZzZXQnKVxuICAgICAgICBlbWl0UmVhZFJlY29yZCgnc3RyaWRlJylcbiAgICAgICAgZW1pdFJlYWRSZWNvcmQoJ2Rpdmlzb3InKVxuXG4gICAgICAgIGJsb2NrKCd9fScpXG5cbiAgICAgICAgYmxvY2suZXhpdChcbiAgICAgICAgICAnaWYoJywgcmVzdWx0LmlzU3RyZWFtLCAnKXsnLFxuICAgICAgICAgIEJVRkZFUl9TVEFURSwgJy5kZXN0cm95U3RyZWFtKCcsIEJVRkZFUiwgJyk7JyxcbiAgICAgICAgICAnfScpXG5cbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgfVxuXG4gICAgICBhdHRyaWJ1dGVEZWZzW2F0dHJpYnV0ZV0gPSBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGFwcGVuZEF0dHJpYnV0ZUNvZGUpXG4gICAgfSlcblxuICAgIHJldHVybiBhdHRyaWJ1dGVEZWZzXG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZUNvbnRleHQgKGNvbnRleHQpIHtcbiAgICB2YXIgc3RhdGljQ29udGV4dCA9IGNvbnRleHQuc3RhdGljXG4gICAgdmFyIGR5bmFtaWNDb250ZXh0ID0gY29udGV4dC5keW5hbWljXG4gICAgdmFyIHJlc3VsdCA9IHt9XG5cbiAgICBPYmplY3Qua2V5cyhzdGF0aWNDb250ZXh0KS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICB2YXIgdmFsdWUgPSBzdGF0aWNDb250ZXh0W25hbWVdXG4gICAgICByZXN1bHRbbmFtZV0gPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInIHx8IHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgcmV0dXJuICcnICsgdmFsdWVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gZW52LmxpbmsodmFsdWUpXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgfSlcblxuICAgIE9iamVjdC5rZXlzKGR5bmFtaWNDb250ZXh0KS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICB2YXIgZHluID0gZHluYW1pY0NvbnRleHRbbmFtZV1cbiAgICAgIHJlc3VsdFtuYW1lXSA9IGNyZWF0ZUR5bmFtaWNEZWNsKGR5biwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgcmV0dXJuIGVudi5pbnZva2Uoc2NvcGUsIGR5bilcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIHJldHVybiByZXN1bHRcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlQXJndW1lbnRzIChvcHRpb25zLCBhdHRyaWJ1dGVzLCB1bmlmb3JtcywgY29udGV4dCwgZW52KSB7XG4gICAgdmFyIHN0YXRpY09wdGlvbnMgPSBvcHRpb25zLnN0YXRpY1xuICAgIHZhciBkeW5hbWljT3B0aW9ucyA9IG9wdGlvbnMuZHluYW1pY1xuXG4gICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIEtFWV9OQU1FUyA9IFtcbiAgICAgICAgU19GUkFNRUJVRkZFUixcbiAgICAgICAgU19WRVJULFxuICAgICAgICBTX0ZSQUcsXG4gICAgICAgIFNfRUxFTUVOVFMsXG4gICAgICAgIFNfUFJJTUlUSVZFLFxuICAgICAgICBTX09GRlNFVCxcbiAgICAgICAgU19DT1VOVCxcbiAgICAgICAgU19JTlNUQU5DRVMsXG4gICAgICAgIFNfUFJPRklMRVxuICAgICAgXS5jb25jYXQoR0xfU1RBVEVfTkFNRVMpXG5cbiAgICAgIGZ1bmN0aW9uIGNoZWNrS2V5cyAoZGljdCkge1xuICAgICAgICBPYmplY3Qua2V5cyhkaWN0KS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgICBjaGVjay5jb21tYW5kKFxuICAgICAgICAgICAgS0VZX05BTUVTLmluZGV4T2Yoa2V5KSA+PSAwLFxuICAgICAgICAgICAgJ3Vua25vd24gcGFyYW1ldGVyIFwiJyArIGtleSArICdcIicsXG4gICAgICAgICAgICBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgfSlcbiAgICAgIH1cblxuICAgICAgY2hlY2tLZXlzKHN0YXRpY09wdGlvbnMpXG4gICAgICBjaGVja0tleXMoZHluYW1pY09wdGlvbnMpXG4gICAgfSlcblxuICAgIHZhciBmcmFtZWJ1ZmZlciA9IHBhcnNlRnJhbWVidWZmZXIob3B0aW9ucywgZW52KVxuICAgIHZhciB2aWV3cG9ydEFuZFNjaXNzb3IgPSBwYXJzZVZpZXdwb3J0U2Npc3NvcihvcHRpb25zLCBmcmFtZWJ1ZmZlciwgZW52KVxuICAgIHZhciBkcmF3ID0gcGFyc2VEcmF3KG9wdGlvbnMsIGVudilcbiAgICB2YXIgc3RhdGUgPSBwYXJzZUdMU3RhdGUob3B0aW9ucywgZW52KVxuICAgIHZhciBzaGFkZXIgPSBwYXJzZVByb2dyYW0ob3B0aW9ucywgZW52KVxuXG4gICAgZnVuY3Rpb24gY29weUJveCAobmFtZSkge1xuICAgICAgdmFyIGRlZm4gPSB2aWV3cG9ydEFuZFNjaXNzb3JbbmFtZV1cbiAgICAgIGlmIChkZWZuKSB7XG4gICAgICAgIHN0YXRlW25hbWVdID0gZGVmblxuICAgICAgfVxuICAgIH1cbiAgICBjb3B5Qm94KFNfVklFV1BPUlQpXG4gICAgY29weUJveChwcm9wTmFtZShTX1NDSVNTT1JfQk9YKSlcblxuICAgIHZhciBkaXJ0eSA9IE9iamVjdC5rZXlzKHN0YXRlKS5sZW5ndGggPiAwXG5cbiAgICB2YXIgcmVzdWx0ID0ge1xuICAgICAgZnJhbWVidWZmZXI6IGZyYW1lYnVmZmVyLFxuICAgICAgZHJhdzogZHJhdyxcbiAgICAgIHNoYWRlcjogc2hhZGVyLFxuICAgICAgc3RhdGU6IHN0YXRlLFxuICAgICAgZGlydHk6IGRpcnR5XG4gICAgfVxuXG4gICAgcmVzdWx0LnByb2ZpbGUgPSBwYXJzZVByb2ZpbGUob3B0aW9ucywgZW52KVxuICAgIHJlc3VsdC51bmlmb3JtcyA9IHBhcnNlVW5pZm9ybXModW5pZm9ybXMsIGVudilcbiAgICByZXN1bHQuYXR0cmlidXRlcyA9IHBhcnNlQXR0cmlidXRlcyhhdHRyaWJ1dGVzLCBlbnYpXG4gICAgcmVzdWx0LmNvbnRleHQgPSBwYXJzZUNvbnRleHQoY29udGV4dCwgZW52KVxuICAgIHJldHVybiByZXN1bHRcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gQ09NTU9OIFVQREFURSBGVU5DVElPTlNcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICBmdW5jdGlvbiBlbWl0Q29udGV4dCAoZW52LCBzY29wZSwgY29udGV4dCkge1xuICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgdmFyIENPTlRFWFQgPSBzaGFyZWQuY29udGV4dFxuXG4gICAgdmFyIGNvbnRleHRFbnRlciA9IGVudi5zY29wZSgpXG5cbiAgICBPYmplY3Qua2V5cyhjb250ZXh0KS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICBzY29wZS5zYXZlKENPTlRFWFQsICcuJyArIG5hbWUpXG4gICAgICB2YXIgZGVmbiA9IGNvbnRleHRbbmFtZV1cbiAgICAgIGNvbnRleHRFbnRlcihDT05URVhULCAnLicsIG5hbWUsICc9JywgZGVmbi5hcHBlbmQoZW52LCBzY29wZSksICc7JylcbiAgICB9KVxuXG4gICAgc2NvcGUoY29udGV4dEVudGVyKVxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBDT01NT04gRFJBV0lORyBGVU5DVElPTlNcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICBmdW5jdGlvbiBlbWl0UG9sbEZyYW1lYnVmZmVyIChlbnYsIHNjb3BlLCBmcmFtZWJ1ZmZlciwgc2tpcENoZWNrKSB7XG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcblxuICAgIHZhciBHTCA9IHNoYXJlZC5nbFxuICAgIHZhciBGUkFNRUJVRkZFUl9TVEFURSA9IHNoYXJlZC5mcmFtZWJ1ZmZlclxuICAgIHZhciBFWFRfRFJBV19CVUZGRVJTXG4gICAgaWYgKGV4dERyYXdCdWZmZXJzKSB7XG4gICAgICBFWFRfRFJBV19CVUZGRVJTID0gc2NvcGUuZGVmKHNoYXJlZC5leHRlbnNpb25zLCAnLndlYmdsX2RyYXdfYnVmZmVycycpXG4gICAgfVxuXG4gICAgdmFyIGNvbnN0YW50cyA9IGVudi5jb25zdGFudHNcblxuICAgIHZhciBEUkFXX0JVRkZFUlMgPSBjb25zdGFudHMuZHJhd0J1ZmZlclxuICAgIHZhciBCQUNLX0JVRkZFUiA9IGNvbnN0YW50cy5iYWNrQnVmZmVyXG5cbiAgICB2YXIgTkVYVFxuICAgIGlmIChmcmFtZWJ1ZmZlcikge1xuICAgICAgTkVYVCA9IGZyYW1lYnVmZmVyLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgIH0gZWxzZSB7XG4gICAgICBORVhUID0gc2NvcGUuZGVmKEZSQU1FQlVGRkVSX1NUQVRFLCAnLm5leHQnKVxuICAgIH1cblxuICAgIGlmICghc2tpcENoZWNrKSB7XG4gICAgICBzY29wZSgnaWYoJywgTkVYVCwgJyE9PScsIEZSQU1FQlVGRkVSX1NUQVRFLCAnLmN1cil7JylcbiAgICB9XG4gICAgc2NvcGUoXG4gICAgICAnaWYoJywgTkVYVCwgJyl7JyxcbiAgICAgIEdMLCAnLmJpbmRGcmFtZWJ1ZmZlcignLCBHTF9GUkFNRUJVRkZFUiwgJywnLCBORVhULCAnLmZyYW1lYnVmZmVyKTsnKVxuICAgIGlmIChleHREcmF3QnVmZmVycykge1xuICAgICAgc2NvcGUoRVhUX0RSQVdfQlVGRkVSUywgJy5kcmF3QnVmZmVyc1dFQkdMKCcsXG4gICAgICAgIERSQVdfQlVGRkVSUywgJ1snLCBORVhULCAnLmNvbG9yQXR0YWNobWVudHMubGVuZ3RoXSk7JylcbiAgICB9XG4gICAgc2NvcGUoJ31lbHNleycsXG4gICAgICBHTCwgJy5iaW5kRnJhbWVidWZmZXIoJywgR0xfRlJBTUVCVUZGRVIsICcsbnVsbCk7JylcbiAgICBpZiAoZXh0RHJhd0J1ZmZlcnMpIHtcbiAgICAgIHNjb3BlKEVYVF9EUkFXX0JVRkZFUlMsICcuZHJhd0J1ZmZlcnNXRUJHTCgnLCBCQUNLX0JVRkZFUiwgJyk7JylcbiAgICB9XG4gICAgc2NvcGUoXG4gICAgICAnfScsXG4gICAgICBGUkFNRUJVRkZFUl9TVEFURSwgJy5jdXI9JywgTkVYVCwgJzsnKVxuICAgIGlmICghc2tpcENoZWNrKSB7XG4gICAgICBzY29wZSgnfScpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZW1pdFBvbGxTdGF0ZSAoZW52LCBzY29wZSwgYXJncykge1xuICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG5cbiAgICB2YXIgR0wgPSBzaGFyZWQuZ2xcblxuICAgIHZhciBDVVJSRU5UX1ZBUlMgPSBlbnYuY3VycmVudFxuICAgIHZhciBORVhUX1ZBUlMgPSBlbnYubmV4dFxuICAgIHZhciBDVVJSRU5UX1NUQVRFID0gc2hhcmVkLmN1cnJlbnRcbiAgICB2YXIgTkVYVF9TVEFURSA9IHNoYXJlZC5uZXh0XG5cbiAgICB2YXIgYmxvY2sgPSBlbnYuY29uZChDVVJSRU5UX1NUQVRFLCAnLmRpcnR5JylcblxuICAgIEdMX1NUQVRFX05BTUVTLmZvckVhY2goZnVuY3Rpb24gKHByb3ApIHtcbiAgICAgIHZhciBwYXJhbSA9IHByb3BOYW1lKHByb3ApXG4gICAgICBpZiAocGFyYW0gaW4gYXJncy5zdGF0ZSkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgdmFyIE5FWFQsIENVUlJFTlRcbiAgICAgIGlmIChwYXJhbSBpbiBORVhUX1ZBUlMpIHtcbiAgICAgICAgTkVYVCA9IE5FWFRfVkFSU1twYXJhbV1cbiAgICAgICAgQ1VSUkVOVCA9IENVUlJFTlRfVkFSU1twYXJhbV1cbiAgICAgICAgdmFyIHBhcnRzID0gbG9vcChjdXJyZW50U3RhdGVbcGFyYW1dLmxlbmd0aCwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICByZXR1cm4gYmxvY2suZGVmKE5FWFQsICdbJywgaSwgJ10nKVxuICAgICAgICB9KVxuICAgICAgICBibG9jayhlbnYuY29uZChwYXJ0cy5tYXAoZnVuY3Rpb24gKHAsIGkpIHtcbiAgICAgICAgICByZXR1cm4gcCArICchPT0nICsgQ1VSUkVOVCArICdbJyArIGkgKyAnXSdcbiAgICAgICAgfSkuam9pbignfHwnKSlcbiAgICAgICAgICAudGhlbihcbiAgICAgICAgICAgIEdMLCAnLicsIEdMX1ZBUklBQkxFU1twYXJhbV0sICcoJywgcGFydHMsICcpOycsXG4gICAgICAgICAgICBwYXJ0cy5tYXAoZnVuY3Rpb24gKHAsIGkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIENVUlJFTlQgKyAnWycgKyBpICsgJ109JyArIHBcbiAgICAgICAgICAgIH0pLmpvaW4oJzsnKSwgJzsnKSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIE5FWFQgPSBibG9jay5kZWYoTkVYVF9TVEFURSwgJy4nLCBwYXJhbSlcbiAgICAgICAgdmFyIGlmdGUgPSBlbnYuY29uZChORVhULCAnIT09JywgQ1VSUkVOVF9TVEFURSwgJy4nLCBwYXJhbSlcbiAgICAgICAgYmxvY2soaWZ0ZSlcbiAgICAgICAgaWYgKHBhcmFtIGluIEdMX0ZMQUdTKSB7XG4gICAgICAgICAgaWZ0ZShcbiAgICAgICAgICAgIGVudi5jb25kKE5FWFQpXG4gICAgICAgICAgICAgICAgLnRoZW4oR0wsICcuZW5hYmxlKCcsIEdMX0ZMQUdTW3BhcmFtXSwgJyk7JylcbiAgICAgICAgICAgICAgICAuZWxzZShHTCwgJy5kaXNhYmxlKCcsIEdMX0ZMQUdTW3BhcmFtXSwgJyk7JyksXG4gICAgICAgICAgICBDVVJSRU5UX1NUQVRFLCAnLicsIHBhcmFtLCAnPScsIE5FWFQsICc7JylcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZnRlKFxuICAgICAgICAgICAgR0wsICcuJywgR0xfVkFSSUFCTEVTW3BhcmFtXSwgJygnLCBORVhULCAnKTsnLFxuICAgICAgICAgICAgQ1VSUkVOVF9TVEFURSwgJy4nLCBwYXJhbSwgJz0nLCBORVhULCAnOycpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KVxuICAgIGlmIChPYmplY3Qua2V5cyhhcmdzLnN0YXRlKS5sZW5ndGggPT09IDApIHtcbiAgICAgIGJsb2NrKENVUlJFTlRfU1RBVEUsICcuZGlydHk9ZmFsc2U7JylcbiAgICB9XG4gICAgc2NvcGUoYmxvY2spXG4gIH1cblxuICBmdW5jdGlvbiBlbWl0U2V0T3B0aW9ucyAoZW52LCBzY29wZSwgb3B0aW9ucywgZmlsdGVyKSB7XG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcbiAgICB2YXIgQ1VSUkVOVF9WQVJTID0gZW52LmN1cnJlbnRcbiAgICB2YXIgQ1VSUkVOVF9TVEFURSA9IHNoYXJlZC5jdXJyZW50XG4gICAgdmFyIEdMID0gc2hhcmVkLmdsXG4gICAgc29ydFN0YXRlKE9iamVjdC5rZXlzKG9wdGlvbnMpKS5mb3JFYWNoKGZ1bmN0aW9uIChwYXJhbSkge1xuICAgICAgdmFyIGRlZm4gPSBvcHRpb25zW3BhcmFtXVxuICAgICAgaWYgKGZpbHRlciAmJiAhZmlsdGVyKGRlZm4pKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgdmFyIHZhcmlhYmxlID0gZGVmbi5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgIGlmIChHTF9GTEFHU1twYXJhbV0pIHtcbiAgICAgICAgdmFyIGZsYWcgPSBHTF9GTEFHU1twYXJhbV1cbiAgICAgICAgaWYgKGlzU3RhdGljKGRlZm4pKSB7XG4gICAgICAgICAgaWYgKHZhcmlhYmxlKSB7XG4gICAgICAgICAgICBzY29wZShHTCwgJy5lbmFibGUoJywgZmxhZywgJyk7JylcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc2NvcGUoR0wsICcuZGlzYWJsZSgnLCBmbGFnLCAnKTsnKVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzY29wZShlbnYuY29uZCh2YXJpYWJsZSlcbiAgICAgICAgICAgIC50aGVuKEdMLCAnLmVuYWJsZSgnLCBmbGFnLCAnKTsnKVxuICAgICAgICAgICAgLmVsc2UoR0wsICcuZGlzYWJsZSgnLCBmbGFnLCAnKTsnKSlcbiAgICAgICAgfVxuICAgICAgICBzY29wZShDVVJSRU5UX1NUQVRFLCAnLicsIHBhcmFtLCAnPScsIHZhcmlhYmxlLCAnOycpXG4gICAgICB9IGVsc2UgaWYgKGlzQXJyYXlMaWtlKHZhcmlhYmxlKSkge1xuICAgICAgICB2YXIgQ1VSUkVOVCA9IENVUlJFTlRfVkFSU1twYXJhbV1cbiAgICAgICAgc2NvcGUoXG4gICAgICAgICAgR0wsICcuJywgR0xfVkFSSUFCTEVTW3BhcmFtXSwgJygnLCB2YXJpYWJsZSwgJyk7JyxcbiAgICAgICAgICB2YXJpYWJsZS5tYXAoZnVuY3Rpb24gKHYsIGkpIHtcbiAgICAgICAgICAgIHJldHVybiBDVVJSRU5UICsgJ1snICsgaSArICddPScgKyB2XG4gICAgICAgICAgfSkuam9pbignOycpLCAnOycpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzY29wZShcbiAgICAgICAgICBHTCwgJy4nLCBHTF9WQVJJQUJMRVNbcGFyYW1dLCAnKCcsIHZhcmlhYmxlLCAnKTsnLFxuICAgICAgICAgIENVUlJFTlRfU1RBVEUsICcuJywgcGFyYW0sICc9JywgdmFyaWFibGUsICc7JylcbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgZnVuY3Rpb24gaW5qZWN0RXh0ZW5zaW9ucyAoZW52LCBzY29wZSkge1xuICAgIGlmIChleHRJbnN0YW5jaW5nKSB7XG4gICAgICBlbnYuaW5zdGFuY2luZyA9IHNjb3BlLmRlZihcbiAgICAgICAgZW52LnNoYXJlZC5leHRlbnNpb25zLCAnLmFuZ2xlX2luc3RhbmNlZF9hcnJheXMnKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGVtaXRQcm9maWxlIChlbnYsIHNjb3BlLCBhcmdzLCB1c2VTY29wZSwgaW5jcmVtZW50Q291bnRlcikge1xuICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgdmFyIFNUQVRTID0gZW52LnN0YXRzXG4gICAgdmFyIENVUlJFTlRfU1RBVEUgPSBzaGFyZWQuY3VycmVudFxuICAgIHZhciBUSU1FUiA9IHNoYXJlZC50aW1lclxuICAgIHZhciBwcm9maWxlQXJnID0gYXJncy5wcm9maWxlXG5cbiAgICBmdW5jdGlvbiBwZXJmQ291bnRlciAoKSB7XG4gICAgICBpZiAodHlwZW9mIHBlcmZvcm1hbmNlID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICByZXR1cm4gJ0RhdGUubm93KCknXG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gJ3BlcmZvcm1hbmNlLm5vdygpJ1xuICAgICAgfVxuICAgIH1cblxuICAgIHZhciBDUFVfU1RBUlQsIFFVRVJZX0NPVU5URVJcbiAgICBmdW5jdGlvbiBlbWl0UHJvZmlsZVN0YXJ0IChibG9jaykge1xuICAgICAgQ1BVX1NUQVJUID0gc2NvcGUuZGVmKClcbiAgICAgIGJsb2NrKENQVV9TVEFSVCwgJz0nLCBwZXJmQ291bnRlcigpLCAnOycpXG4gICAgICBpZiAodHlwZW9mIGluY3JlbWVudENvdW50ZXIgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGJsb2NrKFNUQVRTLCAnLmNvdW50Kz0nLCBpbmNyZW1lbnRDb3VudGVyLCAnOycpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBibG9jayhTVEFUUywgJy5jb3VudCsrOycpXG4gICAgICB9XG4gICAgICBpZiAodGltZXIpIHtcbiAgICAgICAgaWYgKHVzZVNjb3BlKSB7XG4gICAgICAgICAgUVVFUllfQ09VTlRFUiA9IHNjb3BlLmRlZigpXG4gICAgICAgICAgYmxvY2soUVVFUllfQ09VTlRFUiwgJz0nLCBUSU1FUiwgJy5nZXROdW1QZW5kaW5nUXVlcmllcygpOycpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYmxvY2soVElNRVIsICcuYmVnaW5RdWVyeSgnLCBTVEFUUywgJyk7JylcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGVtaXRQcm9maWxlRW5kIChibG9jaykge1xuICAgICAgYmxvY2soU1RBVFMsICcuY3B1VGltZSs9JywgcGVyZkNvdW50ZXIoKSwgJy0nLCBDUFVfU1RBUlQsICc7JylcbiAgICAgIGlmICh0aW1lcikge1xuICAgICAgICBpZiAodXNlU2NvcGUpIHtcbiAgICAgICAgICBibG9jayhUSU1FUiwgJy5wdXNoU2NvcGVTdGF0cygnLFxuICAgICAgICAgICAgUVVFUllfQ09VTlRFUiwgJywnLFxuICAgICAgICAgICAgVElNRVIsICcuZ2V0TnVtUGVuZGluZ1F1ZXJpZXMoKSwnLFxuICAgICAgICAgICAgU1RBVFMsICcpOycpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYmxvY2soVElNRVIsICcuZW5kUXVlcnkoKTsnKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2NvcGVQcm9maWxlICh2YWx1ZSkge1xuICAgICAgdmFyIHByZXYgPSBzY29wZS5kZWYoQ1VSUkVOVF9TVEFURSwgJy5wcm9maWxlJylcbiAgICAgIHNjb3BlKENVUlJFTlRfU1RBVEUsICcucHJvZmlsZT0nLCB2YWx1ZSwgJzsnKVxuICAgICAgc2NvcGUuZXhpdChDVVJSRU5UX1NUQVRFLCAnLnByb2ZpbGU9JywgcHJldiwgJzsnKVxuICAgIH1cblxuICAgIHZhciBVU0VfUFJPRklMRVxuICAgIGlmIChwcm9maWxlQXJnKSB7XG4gICAgICBpZiAoaXNTdGF0aWMocHJvZmlsZUFyZykpIHtcbiAgICAgICAgaWYgKHByb2ZpbGVBcmcuZW5hYmxlKSB7XG4gICAgICAgICAgZW1pdFByb2ZpbGVTdGFydChzY29wZSlcbiAgICAgICAgICBlbWl0UHJvZmlsZUVuZChzY29wZS5leGl0KVxuICAgICAgICAgIHNjb3BlUHJvZmlsZSgndHJ1ZScpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc2NvcGVQcm9maWxlKCdmYWxzZScpXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICBVU0VfUFJPRklMRSA9IHByb2ZpbGVBcmcuYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgICBzY29wZVByb2ZpbGUoVVNFX1BST0ZJTEUpXG4gICAgfSBlbHNlIHtcbiAgICAgIFVTRV9QUk9GSUxFID0gc2NvcGUuZGVmKENVUlJFTlRfU1RBVEUsICcucHJvZmlsZScpXG4gICAgfVxuXG4gICAgdmFyIHN0YXJ0ID0gZW52LmJsb2NrKClcbiAgICBlbWl0UHJvZmlsZVN0YXJ0KHN0YXJ0KVxuICAgIHNjb3BlKCdpZignLCBVU0VfUFJPRklMRSwgJyl7Jywgc3RhcnQsICd9JylcbiAgICB2YXIgZW5kID0gZW52LmJsb2NrKClcbiAgICBlbWl0UHJvZmlsZUVuZChlbmQpXG4gICAgc2NvcGUuZXhpdCgnaWYoJywgVVNFX1BST0ZJTEUsICcpeycsIGVuZCwgJ30nKVxuICB9XG5cbiAgZnVuY3Rpb24gZW1pdEF0dHJpYnV0ZXMgKGVudiwgc2NvcGUsIGFyZ3MsIGF0dHJpYnV0ZXMsIGZpbHRlcikge1xuICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG5cbiAgICBmdW5jdGlvbiB0eXBlTGVuZ3RoICh4KSB7XG4gICAgICBzd2l0Y2ggKHgpIHtcbiAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUMyOlxuICAgICAgICBjYXNlIEdMX0lOVF9WRUMyOlxuICAgICAgICBjYXNlIEdMX0JPT0xfVkVDMjpcbiAgICAgICAgICByZXR1cm4gMlxuICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzM6XG4gICAgICAgIGNhc2UgR0xfSU5UX1ZFQzM6XG4gICAgICAgIGNhc2UgR0xfQk9PTF9WRUMzOlxuICAgICAgICAgIHJldHVybiAzXG4gICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDNDpcbiAgICAgICAgY2FzZSBHTF9JTlRfVkVDNDpcbiAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzQ6XG4gICAgICAgICAgcmV0dXJuIDRcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICByZXR1cm4gMVxuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGVtaXRCaW5kQXR0cmlidXRlIChBVFRSSUJVVEUsIHNpemUsIHJlY29yZCkge1xuICAgICAgdmFyIEdMID0gc2hhcmVkLmdsXG5cbiAgICAgIHZhciBMT0NBVElPTiA9IHNjb3BlLmRlZihBVFRSSUJVVEUsICcubG9jYXRpb24nKVxuICAgICAgdmFyIEJJTkRJTkcgPSBzY29wZS5kZWYoc2hhcmVkLmF0dHJpYnV0ZXMsICdbJywgTE9DQVRJT04sICddJylcblxuICAgICAgdmFyIFNUQVRFID0gcmVjb3JkLnN0YXRlXG4gICAgICB2YXIgQlVGRkVSID0gcmVjb3JkLmJ1ZmZlclxuICAgICAgdmFyIENPTlNUX0NPTVBPTkVOVFMgPSBbXG4gICAgICAgIHJlY29yZC54LFxuICAgICAgICByZWNvcmQueSxcbiAgICAgICAgcmVjb3JkLnosXG4gICAgICAgIHJlY29yZC53XG4gICAgICBdXG5cbiAgICAgIHZhciBDT01NT05fS0VZUyA9IFtcbiAgICAgICAgJ2J1ZmZlcicsXG4gICAgICAgICdub3JtYWxpemVkJyxcbiAgICAgICAgJ29mZnNldCcsXG4gICAgICAgICdzdHJpZGUnXG4gICAgICBdXG5cbiAgICAgIGZ1bmN0aW9uIGVtaXRCdWZmZXIgKCkge1xuICAgICAgICBzY29wZShcbiAgICAgICAgICAnaWYoIScsIEJJTkRJTkcsICcuYnVmZmVyKXsnLFxuICAgICAgICAgIEdMLCAnLmVuYWJsZVZlcnRleEF0dHJpYkFycmF5KCcsIExPQ0FUSU9OLCAnKTt9JylcblxuICAgICAgICB2YXIgVFlQRSA9IHJlY29yZC50eXBlXG4gICAgICAgIHZhciBTSVpFXG4gICAgICAgIGlmICghcmVjb3JkLnNpemUpIHtcbiAgICAgICAgICBTSVpFID0gc2l6ZVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIFNJWkUgPSBzY29wZS5kZWYocmVjb3JkLnNpemUsICd8fCcsIHNpemUpXG4gICAgICAgIH1cblxuICAgICAgICBzY29wZSgnaWYoJyxcbiAgICAgICAgICBCSU5ESU5HLCAnLnR5cGUhPT0nLCBUWVBFLCAnfHwnLFxuICAgICAgICAgIEJJTkRJTkcsICcuc2l6ZSE9PScsIFNJWkUsICd8fCcsXG4gICAgICAgICAgQ09NTU9OX0tFWVMubWFwKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgICAgIHJldHVybiBCSU5ESU5HICsgJy4nICsga2V5ICsgJyE9PScgKyByZWNvcmRba2V5XVxuICAgICAgICAgIH0pLmpvaW4oJ3x8JyksXG4gICAgICAgICAgJyl7JyxcbiAgICAgICAgICBHTCwgJy5iaW5kQnVmZmVyKCcsIEdMX0FSUkFZX0JVRkZFUiwgJywnLCBCVUZGRVIsICcuYnVmZmVyKTsnLFxuICAgICAgICAgIEdMLCAnLnZlcnRleEF0dHJpYlBvaW50ZXIoJywgW1xuICAgICAgICAgICAgTE9DQVRJT04sXG4gICAgICAgICAgICBTSVpFLFxuICAgICAgICAgICAgVFlQRSxcbiAgICAgICAgICAgIHJlY29yZC5ub3JtYWxpemVkLFxuICAgICAgICAgICAgcmVjb3JkLnN0cmlkZSxcbiAgICAgICAgICAgIHJlY29yZC5vZmZzZXRcbiAgICAgICAgICBdLCAnKTsnLFxuICAgICAgICAgIEJJTkRJTkcsICcudHlwZT0nLCBUWVBFLCAnOycsXG4gICAgICAgICAgQklORElORywgJy5zaXplPScsIFNJWkUsICc7JyxcbiAgICAgICAgICBDT01NT05fS0VZUy5tYXAoZnVuY3Rpb24gKGtleSkge1xuICAgICAgICAgICAgcmV0dXJuIEJJTkRJTkcgKyAnLicgKyBrZXkgKyAnPScgKyByZWNvcmRba2V5XSArICc7J1xuICAgICAgICAgIH0pLmpvaW4oJycpLFxuICAgICAgICAgICd9JylcblxuICAgICAgICBpZiAoZXh0SW5zdGFuY2luZykge1xuICAgICAgICAgIHZhciBESVZJU09SID0gcmVjb3JkLmRpdmlzb3JcbiAgICAgICAgICBzY29wZShcbiAgICAgICAgICAgICdpZignLCBCSU5ESU5HLCAnLmRpdmlzb3IhPT0nLCBESVZJU09SLCAnKXsnLFxuICAgICAgICAgICAgZW52Lmluc3RhbmNpbmcsICcudmVydGV4QXR0cmliRGl2aXNvckFOR0xFKCcsIFtMT0NBVElPTiwgRElWSVNPUl0sICcpOycsXG4gICAgICAgICAgICBCSU5ESU5HLCAnLmRpdmlzb3I9JywgRElWSVNPUiwgJzt9JylcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBlbWl0Q29uc3RhbnQgKCkge1xuICAgICAgICBzY29wZShcbiAgICAgICAgICAnaWYoJywgQklORElORywgJy5idWZmZXIpeycsXG4gICAgICAgICAgR0wsICcuZGlzYWJsZVZlcnRleEF0dHJpYkFycmF5KCcsIExPQ0FUSU9OLCAnKTsnLFxuICAgICAgICAgICd9aWYoJywgQ1VURV9DT01QT05FTlRTLm1hcChmdW5jdGlvbiAoYywgaSkge1xuICAgICAgICAgICAgcmV0dXJuIEJJTkRJTkcgKyAnLicgKyBjICsgJyE9PScgKyBDT05TVF9DT01QT05FTlRTW2ldXG4gICAgICAgICAgfSkuam9pbignfHwnKSwgJyl7JyxcbiAgICAgICAgICBHTCwgJy52ZXJ0ZXhBdHRyaWI0ZignLCBMT0NBVElPTiwgJywnLCBDT05TVF9DT01QT05FTlRTLCAnKTsnLFxuICAgICAgICAgIENVVEVfQ09NUE9ORU5UUy5tYXAoZnVuY3Rpb24gKGMsIGkpIHtcbiAgICAgICAgICAgIHJldHVybiBCSU5ESU5HICsgJy4nICsgYyArICc9JyArIENPTlNUX0NPTVBPTkVOVFNbaV0gKyAnOydcbiAgICAgICAgICB9KS5qb2luKCcnKSxcbiAgICAgICAgICAnfScpXG4gICAgICB9XG5cbiAgICAgIGlmIChTVEFURSA9PT0gQVRUUklCX1NUQVRFX1BPSU5URVIpIHtcbiAgICAgICAgZW1pdEJ1ZmZlcigpXG4gICAgICB9IGVsc2UgaWYgKFNUQVRFID09PSBBVFRSSUJfU1RBVEVfQ09OU1RBTlQpIHtcbiAgICAgICAgZW1pdENvbnN0YW50KClcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNjb3BlKCdpZignLCBTVEFURSwgJz09PScsIEFUVFJJQl9TVEFURV9QT0lOVEVSLCAnKXsnKVxuICAgICAgICBlbWl0QnVmZmVyKClcbiAgICAgICAgc2NvcGUoJ31lbHNleycpXG4gICAgICAgIGVtaXRDb25zdGFudCgpXG4gICAgICAgIHNjb3BlKCd9JylcbiAgICAgIH1cbiAgICB9XG5cbiAgICBhdHRyaWJ1dGVzLmZvckVhY2goZnVuY3Rpb24gKGF0dHJpYnV0ZSkge1xuICAgICAgdmFyIG5hbWUgPSBhdHRyaWJ1dGUubmFtZVxuICAgICAgdmFyIGFyZyA9IGFyZ3MuYXR0cmlidXRlc1tuYW1lXVxuICAgICAgdmFyIHJlY29yZFxuICAgICAgaWYgKGFyZykge1xuICAgICAgICBpZiAoIWZpbHRlcihhcmcpKSB7XG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cbiAgICAgICAgcmVjb3JkID0gYXJnLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKCFmaWx0ZXIoU0NPUEVfREVDTCkpIHtcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuICAgICAgICB2YXIgc2NvcGVBdHRyaWIgPSBlbnYuc2NvcGVBdHRyaWIobmFtZSlcbiAgICAgICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXG4gICAgICAgICAgICBzY29wZUF0dHJpYiArICcuc3RhdGUnLFxuICAgICAgICAgICAgJ21pc3NpbmcgYXR0cmlidXRlICcgKyBuYW1lKVxuICAgICAgICB9KVxuICAgICAgICByZWNvcmQgPSB7fVxuICAgICAgICBPYmplY3Qua2V5cyhuZXcgQXR0cmlidXRlUmVjb3JkKCkpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgICAgIHJlY29yZFtrZXldID0gc2NvcGUuZGVmKHNjb3BlQXR0cmliLCAnLicsIGtleSlcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICAgIGVtaXRCaW5kQXR0cmlidXRlKFxuICAgICAgICBlbnYubGluayhhdHRyaWJ1dGUpLCB0eXBlTGVuZ3RoKGF0dHJpYnV0ZS5pbmZvLnR5cGUpLCByZWNvcmQpXG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGVtaXRVbmlmb3JtcyAoZW52LCBzY29wZSwgYXJncywgdW5pZm9ybXMsIGZpbHRlcikge1xuICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgdmFyIEdMID0gc2hhcmVkLmdsXG5cbiAgICB2YXIgaW5maXhcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHVuaWZvcm1zLmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgdW5pZm9ybSA9IHVuaWZvcm1zW2ldXG4gICAgICB2YXIgbmFtZSA9IHVuaWZvcm0ubmFtZVxuICAgICAgdmFyIHR5cGUgPSB1bmlmb3JtLmluZm8udHlwZVxuICAgICAgdmFyIGFyZyA9IGFyZ3MudW5pZm9ybXNbbmFtZV1cbiAgICAgIHZhciBVTklGT1JNID0gZW52LmxpbmsodW5pZm9ybSlcbiAgICAgIHZhciBMT0NBVElPTiA9IFVOSUZPUk0gKyAnLmxvY2F0aW9uJ1xuXG4gICAgICB2YXIgVkFMVUVcbiAgICAgIGlmIChhcmcpIHtcbiAgICAgICAgaWYgKCFmaWx0ZXIoYXJnKSkge1xuICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgIH1cbiAgICAgICAgaWYgKGlzU3RhdGljKGFyZykpIHtcbiAgICAgICAgICB2YXIgdmFsdWUgPSBhcmcudmFsdWVcbiAgICAgICAgICBjaGVjay5jb21tYW5kKFxuICAgICAgICAgICAgdmFsdWUgIT09IG51bGwgJiYgdHlwZW9mIHZhbHVlICE9PSAndW5kZWZpbmVkJyxcbiAgICAgICAgICAgICdtaXNzaW5nIHVuaWZvcm0gXCInICsgbmFtZSArICdcIicsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgIGlmICh0eXBlID09PSBHTF9TQU1QTEVSXzJEIHx8IHR5cGUgPT09IEdMX1NBTVBMRVJfQ1VCRSkge1xuICAgICAgICAgICAgY2hlY2suY29tbWFuZChcbiAgICAgICAgICAgICAgdHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nICYmXG4gICAgICAgICAgICAgICgodHlwZSA9PT0gR0xfU0FNUExFUl8yRCAmJlxuICAgICAgICAgICAgICAgICh2YWx1ZS5fcmVnbFR5cGUgPT09ICd0ZXh0dXJlMmQnIHx8XG4gICAgICAgICAgICAgICAgdmFsdWUuX3JlZ2xUeXBlID09PSAnZnJhbWVidWZmZXInKSkgfHxcbiAgICAgICAgICAgICAgKHR5cGUgPT09IEdMX1NBTVBMRVJfQ1VCRSAmJlxuICAgICAgICAgICAgICAgICh2YWx1ZS5fcmVnbFR5cGUgPT09ICd0ZXh0dXJlQ3ViZScgfHxcbiAgICAgICAgICAgICAgICB2YWx1ZS5fcmVnbFR5cGUgPT09ICdmcmFtZWJ1ZmZlckN1YmUnKSkpLFxuICAgICAgICAgICAgICAnaW52YWxpZCB0ZXh0dXJlIGZvciB1bmlmb3JtICcgKyBuYW1lLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgIHZhciBURVhfVkFMVUUgPSBlbnYubGluayh2YWx1ZS5fdGV4dHVyZSB8fCB2YWx1ZS5jb2xvclswXS5fdGV4dHVyZSlcbiAgICAgICAgICAgIHNjb3BlKEdMLCAnLnVuaWZvcm0xaSgnLCBMT0NBVElPTiwgJywnLCBURVhfVkFMVUUgKyAnLmJpbmQoKSk7JylcbiAgICAgICAgICAgIHNjb3BlLmV4aXQoVEVYX1ZBTFVFLCAnLnVuYmluZCgpOycpXG4gICAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICAgIHR5cGUgPT09IEdMX0ZMT0FUX01BVDIgfHxcbiAgICAgICAgICAgIHR5cGUgPT09IEdMX0ZMT0FUX01BVDMgfHxcbiAgICAgICAgICAgIHR5cGUgPT09IEdMX0ZMT0FUX01BVDQpIHtcbiAgICAgICAgICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgY2hlY2suY29tbWFuZChpc0FycmF5TGlrZSh2YWx1ZSksXG4gICAgICAgICAgICAgICAgJ2ludmFsaWQgbWF0cml4IGZvciB1bmlmb3JtICcgKyBuYW1lLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgY2hlY2suY29tbWFuZChcbiAgICAgICAgICAgICAgICAodHlwZSA9PT0gR0xfRkxPQVRfTUFUMiAmJiB2YWx1ZS5sZW5ndGggPT09IDQpIHx8XG4gICAgICAgICAgICAgICAgKHR5cGUgPT09IEdMX0ZMT0FUX01BVDMgJiYgdmFsdWUubGVuZ3RoID09PSA5KSB8fFxuICAgICAgICAgICAgICAgICh0eXBlID09PSBHTF9GTE9BVF9NQVQ0ICYmIHZhbHVlLmxlbmd0aCA9PT0gMTYpLFxuICAgICAgICAgICAgICAgICdpbnZhbGlkIGxlbmd0aCBmb3IgbWF0cml4IHVuaWZvcm0gJyArIG5hbWUsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIHZhciBNQVRfVkFMVUUgPSBlbnYuZ2xvYmFsLmRlZignbmV3IEZsb2F0MzJBcnJheShbJyArXG4gICAgICAgICAgICAgIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKHZhbHVlKSArICddKScpXG4gICAgICAgICAgICB2YXIgZGltID0gMlxuICAgICAgICAgICAgaWYgKHR5cGUgPT09IEdMX0ZMT0FUX01BVDMpIHtcbiAgICAgICAgICAgICAgZGltID0gM1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlID09PSBHTF9GTE9BVF9NQVQ0KSB7XG4gICAgICAgICAgICAgIGRpbSA9IDRcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHNjb3BlKFxuICAgICAgICAgICAgICBHTCwgJy51bmlmb3JtTWF0cml4JywgZGltLCAnZnYoJyxcbiAgICAgICAgICAgICAgTE9DQVRJT04sICcsZmFsc2UsJywgTUFUX1ZBTFVFLCAnKTsnKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgICAgICAgICAgY2FzZSBHTF9GTE9BVDpcbiAgICAgICAgICAgICAgICBjaGVjay5jb21tYW5kVHlwZSh2YWx1ZSwgJ251bWJlcicsICd1bmlmb3JtICcgKyBuYW1lLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICcxZidcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzI6XG4gICAgICAgICAgICAgICAgY2hlY2suY29tbWFuZChcbiAgICAgICAgICAgICAgICAgIGlzQXJyYXlMaWtlKHZhbHVlKSAmJiB2YWx1ZS5sZW5ndGggPT09IDIsXG4gICAgICAgICAgICAgICAgICAndW5pZm9ybSAnICsgbmFtZSwgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgICAgaW5maXggPSAnMmYnXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUMzOlxuICAgICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmQoXG4gICAgICAgICAgICAgICAgICBpc0FycmF5TGlrZSh2YWx1ZSkgJiYgdmFsdWUubGVuZ3RoID09PSAzLFxuICAgICAgICAgICAgICAgICAgJ3VuaWZvcm0gJyArIG5hbWUsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICAgIGluZml4ID0gJzNmJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDNDpcbiAgICAgICAgICAgICAgICBjaGVjay5jb21tYW5kKFxuICAgICAgICAgICAgICAgICAgaXNBcnJheUxpa2UodmFsdWUpICYmIHZhbHVlLmxlbmd0aCA9PT0gNCxcbiAgICAgICAgICAgICAgICAgICd1bmlmb3JtICcgKyBuYW1lLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICc0ZidcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0JPT0w6XG4gICAgICAgICAgICAgICAgY2hlY2suY29tbWFuZFR5cGUodmFsdWUsICdib29sZWFuJywgJ3VuaWZvcm0gJyArIG5hbWUsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICAgIGluZml4ID0gJzFpJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfSU5UOlxuICAgICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmRUeXBlKHZhbHVlLCAnbnVtYmVyJywgJ3VuaWZvcm0gJyArIG5hbWUsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICAgIGluZml4ID0gJzFpJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfQk9PTF9WRUMyOlxuICAgICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmQoXG4gICAgICAgICAgICAgICAgICBpc0FycmF5TGlrZSh2YWx1ZSkgJiYgdmFsdWUubGVuZ3RoID09PSAyLFxuICAgICAgICAgICAgICAgICAgJ3VuaWZvcm0gJyArIG5hbWUsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICAgIGluZml4ID0gJzJpJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfSU5UX1ZFQzI6XG4gICAgICAgICAgICAgICAgY2hlY2suY29tbWFuZChcbiAgICAgICAgICAgICAgICAgIGlzQXJyYXlMaWtlKHZhbHVlKSAmJiB2YWx1ZS5sZW5ndGggPT09IDIsXG4gICAgICAgICAgICAgICAgICAndW5pZm9ybSAnICsgbmFtZSwgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgICAgaW5maXggPSAnMmknXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzM6XG4gICAgICAgICAgICAgICAgY2hlY2suY29tbWFuZChcbiAgICAgICAgICAgICAgICAgIGlzQXJyYXlMaWtlKHZhbHVlKSAmJiB2YWx1ZS5sZW5ndGggPT09IDMsXG4gICAgICAgICAgICAgICAgICAndW5pZm9ybSAnICsgbmFtZSwgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgICAgaW5maXggPSAnM2knXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9JTlRfVkVDMzpcbiAgICAgICAgICAgICAgICBjaGVjay5jb21tYW5kKFxuICAgICAgICAgICAgICAgICAgaXNBcnJheUxpa2UodmFsdWUpICYmIHZhbHVlLmxlbmd0aCA9PT0gMyxcbiAgICAgICAgICAgICAgICAgICd1bmlmb3JtICcgKyBuYW1lLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICczaSdcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0JPT0xfVkVDNDpcbiAgICAgICAgICAgICAgICBjaGVjay5jb21tYW5kKFxuICAgICAgICAgICAgICAgICAgaXNBcnJheUxpa2UodmFsdWUpICYmIHZhbHVlLmxlbmd0aCA9PT0gNCxcbiAgICAgICAgICAgICAgICAgICd1bmlmb3JtICcgKyBuYW1lLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICc0aSdcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0lOVF9WRUM0OlxuICAgICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmQoXG4gICAgICAgICAgICAgICAgICBpc0FycmF5TGlrZSh2YWx1ZSkgJiYgdmFsdWUubGVuZ3RoID09PSA0LFxuICAgICAgICAgICAgICAgICAgJ3VuaWZvcm0gJyArIG5hbWUsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICAgIGluZml4ID0gJzRpJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzY29wZShHTCwgJy51bmlmb3JtJywgaW5maXgsICcoJywgTE9DQVRJT04sICcsJyxcbiAgICAgICAgICAgICAgaXNBcnJheUxpa2UodmFsdWUpID8gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwodmFsdWUpIDogdmFsdWUsXG4gICAgICAgICAgICAgICcpOycpXG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgVkFMVUUgPSBhcmcuYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmICghZmlsdGVyKFNDT1BFX0RFQ0wpKSB7XG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfVxuICAgICAgICBWQUxVRSA9IHNjb3BlLmRlZihzaGFyZWQudW5pZm9ybXMsICdbJywgc3RyaW5nU3RvcmUuaWQobmFtZSksICddJylcbiAgICAgIH1cblxuICAgICAgaWYgKHR5cGUgPT09IEdMX1NBTVBMRVJfMkQpIHtcbiAgICAgICAgc2NvcGUoXG4gICAgICAgICAgJ2lmKCcsIFZBTFVFLCAnJiYnLCBWQUxVRSwgJy5fcmVnbFR5cGU9PT1cImZyYW1lYnVmZmVyXCIpeycsXG4gICAgICAgICAgVkFMVUUsICc9JywgVkFMVUUsICcuY29sb3JbMF07JyxcbiAgICAgICAgICAnfScpXG4gICAgICB9IGVsc2UgaWYgKHR5cGUgPT09IEdMX1NBTVBMRVJfQ1VCRSkge1xuICAgICAgICBzY29wZShcbiAgICAgICAgICAnaWYoJywgVkFMVUUsICcmJicsIFZBTFVFLCAnLl9yZWdsVHlwZT09PVwiZnJhbWVidWZmZXJDdWJlXCIpeycsXG4gICAgICAgICAgVkFMVUUsICc9JywgVkFMVUUsICcuY29sb3JbMF07JyxcbiAgICAgICAgICAnfScpXG4gICAgICB9XG5cbiAgICAgIC8vIHBlcmZvcm0gdHlwZSB2YWxpZGF0aW9uXG4gICAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICAgIGZ1bmN0aW9uIGNoZWNrIChwcmVkLCBtZXNzYWdlKSB7XG4gICAgICAgICAgZW52LmFzc2VydChzY29wZSwgcHJlZCxcbiAgICAgICAgICAgICdiYWQgZGF0YSBvciBtaXNzaW5nIGZvciB1bmlmb3JtIFwiJyArIG5hbWUgKyAnXCIuICAnICsgbWVzc2FnZSlcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGNoZWNrVHlwZSAodHlwZSkge1xuICAgICAgICAgIGNoZWNrKFxuICAgICAgICAgICAgJ3R5cGVvZiAnICsgVkFMVUUgKyAnPT09XCInICsgdHlwZSArICdcIicsXG4gICAgICAgICAgICAnaW52YWxpZCB0eXBlLCBleHBlY3RlZCAnICsgdHlwZSlcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGNoZWNrVmVjdG9yIChuLCB0eXBlKSB7XG4gICAgICAgICAgY2hlY2soXG4gICAgICAgICAgICBzaGFyZWQuaXNBcnJheUxpa2UgKyAnKCcgKyBWQUxVRSArICcpJiYnICsgVkFMVUUgKyAnLmxlbmd0aD09PScgKyBuLFxuICAgICAgICAgICAgJ2ludmFsaWQgdmVjdG9yLCBzaG91bGQgaGF2ZSBsZW5ndGggJyArIG4sIGVudi5jb21tYW5kU3RyKVxuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gY2hlY2tUZXh0dXJlICh0YXJnZXQpIHtcbiAgICAgICAgICBjaGVjayhcbiAgICAgICAgICAgICd0eXBlb2YgJyArIFZBTFVFICsgJz09PVwiZnVuY3Rpb25cIiYmJyArXG4gICAgICAgICAgICBWQUxVRSArICcuX3JlZ2xUeXBlPT09XCJ0ZXh0dXJlJyArXG4gICAgICAgICAgICAodGFyZ2V0ID09PSBHTF9URVhUVVJFXzJEID8gJzJkJyA6ICdDdWJlJykgKyAnXCInLFxuICAgICAgICAgICAgJ2ludmFsaWQgdGV4dHVyZSB0eXBlJywgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgIH1cblxuICAgICAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgICAgICBjYXNlIEdMX0lOVDpcbiAgICAgICAgICAgIGNoZWNrVHlwZSgnbnVtYmVyJylcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSBHTF9JTlRfVkVDMjpcbiAgICAgICAgICAgIGNoZWNrVmVjdG9yKDIsICdudW1iZXInKVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlIEdMX0lOVF9WRUMzOlxuICAgICAgICAgICAgY2hlY2tWZWN0b3IoMywgJ251bWJlcicpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgR0xfSU5UX1ZFQzQ6XG4gICAgICAgICAgICBjaGVja1ZlY3Rvcig0LCAnbnVtYmVyJylcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSBHTF9GTE9BVDpcbiAgICAgICAgICAgIGNoZWNrVHlwZSgnbnVtYmVyJylcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUMyOlxuICAgICAgICAgICAgY2hlY2tWZWN0b3IoMiwgJ251bWJlcicpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDMzpcbiAgICAgICAgICAgIGNoZWNrVmVjdG9yKDMsICdudW1iZXInKVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzQ6XG4gICAgICAgICAgICBjaGVja1ZlY3Rvcig0LCAnbnVtYmVyJylcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSBHTF9CT09MOlxuICAgICAgICAgICAgY2hlY2tUeXBlKCdib29sZWFuJylcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzI6XG4gICAgICAgICAgICBjaGVja1ZlY3RvcigyLCAnYm9vbGVhbicpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgR0xfQk9PTF9WRUMzOlxuICAgICAgICAgICAgY2hlY2tWZWN0b3IoMywgJ2Jvb2xlYW4nKVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlIEdMX0JPT0xfVkVDNDpcbiAgICAgICAgICAgIGNoZWNrVmVjdG9yKDQsICdib29sZWFuJylcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSBHTF9GTE9BVF9NQVQyOlxuICAgICAgICAgICAgY2hlY2tWZWN0b3IoNCwgJ251bWJlcicpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgR0xfRkxPQVRfTUFUMzpcbiAgICAgICAgICAgIGNoZWNrVmVjdG9yKDksICdudW1iZXInKVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlIEdMX0ZMT0FUX01BVDQ6XG4gICAgICAgICAgICBjaGVja1ZlY3RvcigxNiwgJ251bWJlcicpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgR0xfU0FNUExFUl8yRDpcbiAgICAgICAgICAgIGNoZWNrVGV4dHVyZShHTF9URVhUVVJFXzJEKVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlIEdMX1NBTVBMRVJfQ1VCRTpcbiAgICAgICAgICAgIGNoZWNrVGV4dHVyZShHTF9URVhUVVJFX0NVQkVfTUFQKVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgfVxuICAgICAgfSlcblxuICAgICAgdmFyIHVucm9sbCA9IDFcbiAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICBjYXNlIEdMX1NBTVBMRVJfMkQ6XG4gICAgICAgIGNhc2UgR0xfU0FNUExFUl9DVUJFOlxuICAgICAgICAgIHZhciBURVggPSBzY29wZS5kZWYoVkFMVUUsICcuX3RleHR1cmUnKVxuICAgICAgICAgIHNjb3BlKEdMLCAnLnVuaWZvcm0xaSgnLCBMT0NBVElPTiwgJywnLCBURVgsICcuYmluZCgpKTsnKVxuICAgICAgICAgIHNjb3BlLmV4aXQoVEVYLCAnLnVuYmluZCgpOycpXG4gICAgICAgICAgY29udGludWVcblxuICAgICAgICBjYXNlIEdMX0lOVDpcbiAgICAgICAgY2FzZSBHTF9CT09MOlxuICAgICAgICAgIGluZml4ID0gJzFpJ1xuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9JTlRfVkVDMjpcbiAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzI6XG4gICAgICAgICAgaW5maXggPSAnMmknXG4gICAgICAgICAgdW5yb2xsID0gMlxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9JTlRfVkVDMzpcbiAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzM6XG4gICAgICAgICAgaW5maXggPSAnM2knXG4gICAgICAgICAgdW5yb2xsID0gM1xuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9JTlRfVkVDNDpcbiAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzQ6XG4gICAgICAgICAgaW5maXggPSAnNGknXG4gICAgICAgICAgdW5yb2xsID0gNFxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9GTE9BVDpcbiAgICAgICAgICBpbmZpeCA9ICcxZidcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDMjpcbiAgICAgICAgICBpbmZpeCA9ICcyZidcbiAgICAgICAgICB1bnJvbGwgPSAyXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzM6XG4gICAgICAgICAgaW5maXggPSAnM2YnXG4gICAgICAgICAgdW5yb2xsID0gM1xuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUM0OlxuICAgICAgICAgIGluZml4ID0gJzRmJ1xuICAgICAgICAgIHVucm9sbCA9IDRcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfRkxPQVRfTUFUMjpcbiAgICAgICAgICBpbmZpeCA9ICdNYXRyaXgyZnYnXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0ZMT0FUX01BVDM6XG4gICAgICAgICAgaW5maXggPSAnTWF0cml4M2Z2J1xuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9GTE9BVF9NQVQ0OlxuICAgICAgICAgIGluZml4ID0gJ01hdHJpeDRmdidcbiAgICAgICAgICBicmVha1xuICAgICAgfVxuXG4gICAgICBzY29wZShHTCwgJy51bmlmb3JtJywgaW5maXgsICcoJywgTE9DQVRJT04sICcsJylcbiAgICAgIGlmIChpbmZpeC5jaGFyQXQoMCkgPT09ICdNJykge1xuICAgICAgICB2YXIgbWF0U2l6ZSA9IE1hdGgucG93KHR5cGUgLSBHTF9GTE9BVF9NQVQyICsgMiwgMilcbiAgICAgICAgdmFyIFNUT1JBR0UgPSBlbnYuZ2xvYmFsLmRlZignbmV3IEZsb2F0MzJBcnJheSgnLCBtYXRTaXplLCAnKScpXG4gICAgICAgIHNjb3BlKFxuICAgICAgICAgICdmYWxzZSwoQXJyYXkuaXNBcnJheSgnLCBWQUxVRSwgJyl8fCcsIFZBTFVFLCAnIGluc3RhbmNlb2YgRmxvYXQzMkFycmF5KT8nLCBWQUxVRSwgJzooJyxcbiAgICAgICAgICBsb29wKG1hdFNpemUsIGZ1bmN0aW9uIChpKSB7XG4gICAgICAgICAgICByZXR1cm4gU1RPUkFHRSArICdbJyArIGkgKyAnXT0nICsgVkFMVUUgKyAnWycgKyBpICsgJ10nXG4gICAgICAgICAgfSksICcsJywgU1RPUkFHRSwgJyknKVxuICAgICAgfSBlbHNlIGlmICh1bnJvbGwgPiAxKSB7XG4gICAgICAgIHNjb3BlKGxvb3AodW5yb2xsLCBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgIHJldHVybiBWQUxVRSArICdbJyArIGkgKyAnXSdcbiAgICAgICAgfSkpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzY29wZShWQUxVRSlcbiAgICAgIH1cbiAgICAgIHNjb3BlKCcpOycpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZW1pdERyYXcgKGVudiwgb3V0ZXIsIGlubmVyLCBhcmdzKSB7XG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcbiAgICB2YXIgR0wgPSBzaGFyZWQuZ2xcbiAgICB2YXIgRFJBV19TVEFURSA9IHNoYXJlZC5kcmF3XG5cbiAgICB2YXIgZHJhd09wdGlvbnMgPSBhcmdzLmRyYXdcblxuICAgIGZ1bmN0aW9uIGVtaXRFbGVtZW50cyAoKSB7XG4gICAgICB2YXIgZGVmbiA9IGRyYXdPcHRpb25zLmVsZW1lbnRzXG4gICAgICB2YXIgRUxFTUVOVFNcbiAgICAgIHZhciBzY29wZSA9IG91dGVyXG4gICAgICBpZiAoZGVmbikge1xuICAgICAgICBpZiAoKGRlZm4uY29udGV4dERlcCAmJiBhcmdzLmNvbnRleHREeW5hbWljKSB8fCBkZWZuLnByb3BEZXApIHtcbiAgICAgICAgICBzY29wZSA9IGlubmVyXG4gICAgICAgIH1cbiAgICAgICAgRUxFTUVOVFMgPSBkZWZuLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgRUxFTUVOVFMgPSBzY29wZS5kZWYoRFJBV19TVEFURSwgJy4nLCBTX0VMRU1FTlRTKVxuICAgICAgfVxuICAgICAgaWYgKEVMRU1FTlRTKSB7XG4gICAgICAgIHNjb3BlKFxuICAgICAgICAgICdpZignICsgRUxFTUVOVFMgKyAnKScgK1xuICAgICAgICAgIEdMICsgJy5iaW5kQnVmZmVyKCcgKyBHTF9FTEVNRU5UX0FSUkFZX0JVRkZFUiArICcsJyArIEVMRU1FTlRTICsgJy5idWZmZXIuYnVmZmVyKTsnKVxuICAgICAgfVxuICAgICAgcmV0dXJuIEVMRU1FTlRTXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZW1pdENvdW50ICgpIHtcbiAgICAgIHZhciBkZWZuID0gZHJhd09wdGlvbnMuY291bnRcbiAgICAgIHZhciBDT1VOVFxuICAgICAgdmFyIHNjb3BlID0gb3V0ZXJcbiAgICAgIGlmIChkZWZuKSB7XG4gICAgICAgIGlmICgoZGVmbi5jb250ZXh0RGVwICYmIGFyZ3MuY29udGV4dER5bmFtaWMpIHx8IGRlZm4ucHJvcERlcCkge1xuICAgICAgICAgIHNjb3BlID0gaW5uZXJcbiAgICAgICAgfVxuICAgICAgICBDT1VOVCA9IGRlZm4uYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBpZiAoZGVmbi5NSVNTSU5HKSB7XG4gICAgICAgICAgICBlbnYuYXNzZXJ0KG91dGVyLCAnZmFsc2UnLCAnbWlzc2luZyB2ZXJ0ZXggY291bnQnKVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZGVmbi5EWU5BTUlDKSB7XG4gICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLCBDT1VOVCArICc+PTAnLCAnbWlzc2luZyB2ZXJ0ZXggY291bnQnKVxuICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIENPVU5UID0gc2NvcGUuZGVmKERSQVdfU1RBVEUsICcuJywgU19DT1VOVClcbiAgICAgICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsIENPVU5UICsgJz49MCcsICdtaXNzaW5nIHZlcnRleCBjb3VudCcpXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgICByZXR1cm4gQ09VTlRcbiAgICB9XG5cbiAgICB2YXIgRUxFTUVOVFMgPSBlbWl0RWxlbWVudHMoKVxuICAgIGZ1bmN0aW9uIGVtaXRWYWx1ZSAobmFtZSkge1xuICAgICAgdmFyIGRlZm4gPSBkcmF3T3B0aW9uc1tuYW1lXVxuICAgICAgaWYgKGRlZm4pIHtcbiAgICAgICAgaWYgKChkZWZuLmNvbnRleHREZXAgJiYgYXJncy5jb250ZXh0RHluYW1pYykgfHwgZGVmbi5wcm9wRGVwKSB7XG4gICAgICAgICAgcmV0dXJuIGRlZm4uYXBwZW5kKGVudiwgaW5uZXIpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIGRlZm4uYXBwZW5kKGVudiwgb3V0ZXIpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBvdXRlci5kZWYoRFJBV19TVEFURSwgJy4nLCBuYW1lKVxuICAgICAgfVxuICAgIH1cblxuICAgIHZhciBQUklNSVRJVkUgPSBlbWl0VmFsdWUoU19QUklNSVRJVkUpXG4gICAgdmFyIE9GRlNFVCA9IGVtaXRWYWx1ZShTX09GRlNFVClcblxuICAgIHZhciBDT1VOVCA9IGVtaXRDb3VudCgpXG4gICAgaWYgKHR5cGVvZiBDT1VOVCA9PT0gJ251bWJlcicpIHtcbiAgICAgIGlmIChDT1VOVCA9PT0gMCkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgaW5uZXIoJ2lmKCcsIENPVU5ULCAnKXsnKVxuICAgICAgaW5uZXIuZXhpdCgnfScpXG4gICAgfVxuXG4gICAgdmFyIElOU1RBTkNFUywgRVhUX0lOU1RBTkNJTkdcbiAgICBpZiAoZXh0SW5zdGFuY2luZykge1xuICAgICAgSU5TVEFOQ0VTID0gZW1pdFZhbHVlKFNfSU5TVEFOQ0VTKVxuICAgICAgRVhUX0lOU1RBTkNJTkcgPSBlbnYuaW5zdGFuY2luZ1xuICAgIH1cblxuICAgIHZhciBFTEVNRU5UX1RZUEUgPSBFTEVNRU5UUyArICcudHlwZSdcblxuICAgIHZhciBlbGVtZW50c1N0YXRpYyA9IGRyYXdPcHRpb25zLmVsZW1lbnRzICYmIGlzU3RhdGljKGRyYXdPcHRpb25zLmVsZW1lbnRzKVxuXG4gICAgZnVuY3Rpb24gZW1pdEluc3RhbmNpbmcgKCkge1xuICAgICAgZnVuY3Rpb24gZHJhd0VsZW1lbnRzICgpIHtcbiAgICAgICAgaW5uZXIoRVhUX0lOU1RBTkNJTkcsICcuZHJhd0VsZW1lbnRzSW5zdGFuY2VkQU5HTEUoJywgW1xuICAgICAgICAgIFBSSU1JVElWRSxcbiAgICAgICAgICBDT1VOVCxcbiAgICAgICAgICBFTEVNRU5UX1RZUEUsXG4gICAgICAgICAgT0ZGU0VUICsgJzw8KCgnICsgRUxFTUVOVF9UWVBFICsgJy0nICsgR0xfVU5TSUdORURfQllURSArICcpPj4xKScsXG4gICAgICAgICAgSU5TVEFOQ0VTXG4gICAgICAgIF0sICcpOycpXG4gICAgICB9XG5cbiAgICAgIGZ1bmN0aW9uIGRyYXdBcnJheXMgKCkge1xuICAgICAgICBpbm5lcihFWFRfSU5TVEFOQ0lORywgJy5kcmF3QXJyYXlzSW5zdGFuY2VkQU5HTEUoJyxcbiAgICAgICAgICBbUFJJTUlUSVZFLCBPRkZTRVQsIENPVU5ULCBJTlNUQU5DRVNdLCAnKTsnKVxuICAgICAgfVxuXG4gICAgICBpZiAoRUxFTUVOVFMpIHtcbiAgICAgICAgaWYgKCFlbGVtZW50c1N0YXRpYykge1xuICAgICAgICAgIGlubmVyKCdpZignLCBFTEVNRU5UUywgJyl7JylcbiAgICAgICAgICBkcmF3RWxlbWVudHMoKVxuICAgICAgICAgIGlubmVyKCd9ZWxzZXsnKVxuICAgICAgICAgIGRyYXdBcnJheXMoKVxuICAgICAgICAgIGlubmVyKCd9JylcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBkcmF3RWxlbWVudHMoKVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkcmF3QXJyYXlzKClcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBlbWl0UmVndWxhciAoKSB7XG4gICAgICBmdW5jdGlvbiBkcmF3RWxlbWVudHMgKCkge1xuICAgICAgICBpbm5lcihHTCArICcuZHJhd0VsZW1lbnRzKCcgKyBbXG4gICAgICAgICAgUFJJTUlUSVZFLFxuICAgICAgICAgIENPVU5ULFxuICAgICAgICAgIEVMRU1FTlRfVFlQRSxcbiAgICAgICAgICBPRkZTRVQgKyAnPDwoKCcgKyBFTEVNRU5UX1RZUEUgKyAnLScgKyBHTF9VTlNJR05FRF9CWVRFICsgJyk+PjEpJ1xuICAgICAgICBdICsgJyk7JylcbiAgICAgIH1cblxuICAgICAgZnVuY3Rpb24gZHJhd0FycmF5cyAoKSB7XG4gICAgICAgIGlubmVyKEdMICsgJy5kcmF3QXJyYXlzKCcgKyBbUFJJTUlUSVZFLCBPRkZTRVQsIENPVU5UXSArICcpOycpXG4gICAgICB9XG5cbiAgICAgIGlmIChFTEVNRU5UUykge1xuICAgICAgICBpZiAoIWVsZW1lbnRzU3RhdGljKSB7XG4gICAgICAgICAgaW5uZXIoJ2lmKCcsIEVMRU1FTlRTLCAnKXsnKVxuICAgICAgICAgIGRyYXdFbGVtZW50cygpXG4gICAgICAgICAgaW5uZXIoJ31lbHNleycpXG4gICAgICAgICAgZHJhd0FycmF5cygpXG4gICAgICAgICAgaW5uZXIoJ30nKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGRyYXdFbGVtZW50cygpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRyYXdBcnJheXMoKVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChleHRJbnN0YW5jaW5nICYmICh0eXBlb2YgSU5TVEFOQ0VTICE9PSAnbnVtYmVyJyB8fCBJTlNUQU5DRVMgPj0gMCkpIHtcbiAgICAgIGlmICh0eXBlb2YgSU5TVEFOQ0VTID09PSAnc3RyaW5nJykge1xuICAgICAgICBpbm5lcignaWYoJywgSU5TVEFOQ0VTLCAnPjApeycpXG4gICAgICAgIGVtaXRJbnN0YW5jaW5nKClcbiAgICAgICAgaW5uZXIoJ31lbHNlIGlmKCcsIElOU1RBTkNFUywgJzwwKXsnKVxuICAgICAgICBlbWl0UmVndWxhcigpXG4gICAgICAgIGlubmVyKCd9JylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGVtaXRJbnN0YW5jaW5nKClcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgZW1pdFJlZ3VsYXIoKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZUJvZHkgKGVtaXRCb2R5LCBwYXJlbnRFbnYsIGFyZ3MsIHByb2dyYW0sIGNvdW50KSB7XG4gICAgdmFyIGVudiA9IGNyZWF0ZVJFR0xFbnZpcm9ubWVudCgpXG4gICAgdmFyIHNjb3BlID0gZW52LnByb2MoJ2JvZHknLCBjb3VudClcbiAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICBlbnYuY29tbWFuZFN0ciA9IHBhcmVudEVudi5jb21tYW5kU3RyXG4gICAgICBlbnYuY29tbWFuZCA9IGVudi5saW5rKHBhcmVudEVudi5jb21tYW5kU3RyKVxuICAgIH0pXG4gICAgaWYgKGV4dEluc3RhbmNpbmcpIHtcbiAgICAgIGVudi5pbnN0YW5jaW5nID0gc2NvcGUuZGVmKFxuICAgICAgICBlbnYuc2hhcmVkLmV4dGVuc2lvbnMsICcuYW5nbGVfaW5zdGFuY2VkX2FycmF5cycpXG4gICAgfVxuICAgIGVtaXRCb2R5KGVudiwgc2NvcGUsIGFyZ3MsIHByb2dyYW0pXG4gICAgcmV0dXJuIGVudi5jb21waWxlKCkuYm9keVxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBEUkFXIFBST0NcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICBmdW5jdGlvbiBlbWl0RHJhd0JvZHkgKGVudiwgZHJhdywgYXJncywgcHJvZ3JhbSkge1xuICAgIGluamVjdEV4dGVuc2lvbnMoZW52LCBkcmF3KVxuICAgIGVtaXRBdHRyaWJ1dGVzKGVudiwgZHJhdywgYXJncywgcHJvZ3JhbS5hdHRyaWJ1dGVzLCBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIH0pXG4gICAgZW1pdFVuaWZvcm1zKGVudiwgZHJhdywgYXJncywgcHJvZ3JhbS51bmlmb3JtcywgZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIHRydWVcbiAgICB9KVxuICAgIGVtaXREcmF3KGVudiwgZHJhdywgZHJhdywgYXJncylcbiAgfVxuXG4gIGZ1bmN0aW9uIGVtaXREcmF3UHJvYyAoZW52LCBhcmdzKSB7XG4gICAgdmFyIGRyYXcgPSBlbnYucHJvYygnZHJhdycsIDEpXG5cbiAgICBpbmplY3RFeHRlbnNpb25zKGVudiwgZHJhdylcblxuICAgIGVtaXRDb250ZXh0KGVudiwgZHJhdywgYXJncy5jb250ZXh0KVxuICAgIGVtaXRQb2xsRnJhbWVidWZmZXIoZW52LCBkcmF3LCBhcmdzLmZyYW1lYnVmZmVyKVxuXG4gICAgZW1pdFBvbGxTdGF0ZShlbnYsIGRyYXcsIGFyZ3MpXG4gICAgZW1pdFNldE9wdGlvbnMoZW52LCBkcmF3LCBhcmdzLnN0YXRlKVxuXG4gICAgZW1pdFByb2ZpbGUoZW52LCBkcmF3LCBhcmdzLCBmYWxzZSwgdHJ1ZSlcblxuICAgIHZhciBwcm9ncmFtID0gYXJncy5zaGFkZXIucHJvZ1Zhci5hcHBlbmQoZW52LCBkcmF3KVxuICAgIGRyYXcoZW52LnNoYXJlZC5nbCwgJy51c2VQcm9ncmFtKCcsIHByb2dyYW0sICcucHJvZ3JhbSk7JylcblxuICAgIGlmIChhcmdzLnNoYWRlci5wcm9ncmFtKSB7XG4gICAgICBlbWl0RHJhd0JvZHkoZW52LCBkcmF3LCBhcmdzLCBhcmdzLnNoYWRlci5wcm9ncmFtKVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgZHJhd0NhY2hlID0gZW52Lmdsb2JhbC5kZWYoJ3t9JylcbiAgICAgIHZhciBQUk9HX0lEID0gZHJhdy5kZWYocHJvZ3JhbSwgJy5pZCcpXG4gICAgICB2YXIgQ0FDSEVEX1BST0MgPSBkcmF3LmRlZihkcmF3Q2FjaGUsICdbJywgUFJPR19JRCwgJ10nKVxuICAgICAgZHJhdyhcbiAgICAgICAgZW52LmNvbmQoQ0FDSEVEX1BST0MpXG4gICAgICAgICAgLnRoZW4oQ0FDSEVEX1BST0MsICcuY2FsbCh0aGlzLGEwKTsnKVxuICAgICAgICAgIC5lbHNlKFxuICAgICAgICAgICAgQ0FDSEVEX1BST0MsICc9JywgZHJhd0NhY2hlLCAnWycsIFBST0dfSUQsICddPScsXG4gICAgICAgICAgICBlbnYubGluayhmdW5jdGlvbiAocHJvZ3JhbSkge1xuICAgICAgICAgICAgICByZXR1cm4gY3JlYXRlQm9keShlbWl0RHJhd0JvZHksIGVudiwgYXJncywgcHJvZ3JhbSwgMSlcbiAgICAgICAgICAgIH0pLCAnKCcsIHByb2dyYW0sICcpOycsXG4gICAgICAgICAgICBDQUNIRURfUFJPQywgJy5jYWxsKHRoaXMsYTApOycpKVxuICAgIH1cblxuICAgIGlmIChPYmplY3Qua2V5cyhhcmdzLnN0YXRlKS5sZW5ndGggPiAwKSB7XG4gICAgICBkcmF3KGVudi5zaGFyZWQuY3VycmVudCwgJy5kaXJ0eT10cnVlOycpXG4gICAgfVxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBCQVRDSCBQUk9DXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICBmdW5jdGlvbiBlbWl0QmF0Y2hEeW5hbWljU2hhZGVyQm9keSAoZW52LCBzY29wZSwgYXJncywgcHJvZ3JhbSkge1xuICAgIGVudi5iYXRjaElkID0gJ2ExJ1xuXG4gICAgaW5qZWN0RXh0ZW5zaW9ucyhlbnYsIHNjb3BlKVxuXG4gICAgZnVuY3Rpb24gYWxsICgpIHtcbiAgICAgIHJldHVybiB0cnVlXG4gICAgfVxuXG4gICAgZW1pdEF0dHJpYnV0ZXMoZW52LCBzY29wZSwgYXJncywgcHJvZ3JhbS5hdHRyaWJ1dGVzLCBhbGwpXG4gICAgZW1pdFVuaWZvcm1zKGVudiwgc2NvcGUsIGFyZ3MsIHByb2dyYW0udW5pZm9ybXMsIGFsbClcbiAgICBlbWl0RHJhdyhlbnYsIHNjb3BlLCBzY29wZSwgYXJncylcbiAgfVxuXG4gIGZ1bmN0aW9uIGVtaXRCYXRjaEJvZHkgKGVudiwgc2NvcGUsIGFyZ3MsIHByb2dyYW0pIHtcbiAgICBpbmplY3RFeHRlbnNpb25zKGVudiwgc2NvcGUpXG5cbiAgICB2YXIgY29udGV4dER5bmFtaWMgPSBhcmdzLmNvbnRleHREZXBcblxuICAgIHZhciBCQVRDSF9JRCA9IHNjb3BlLmRlZigpXG4gICAgdmFyIFBST1BfTElTVCA9ICdhMCdcbiAgICB2YXIgTlVNX1BST1BTID0gJ2ExJ1xuICAgIHZhciBQUk9QUyA9IHNjb3BlLmRlZigpXG4gICAgZW52LnNoYXJlZC5wcm9wcyA9IFBST1BTXG4gICAgZW52LmJhdGNoSWQgPSBCQVRDSF9JRFxuXG4gICAgdmFyIG91dGVyID0gZW52LnNjb3BlKClcbiAgICB2YXIgaW5uZXIgPSBlbnYuc2NvcGUoKVxuXG4gICAgc2NvcGUoXG4gICAgICBvdXRlci5lbnRyeSxcbiAgICAgICdmb3IoJywgQkFUQ0hfSUQsICc9MDsnLCBCQVRDSF9JRCwgJzwnLCBOVU1fUFJPUFMsICc7KysnLCBCQVRDSF9JRCwgJyl7JyxcbiAgICAgIFBST1BTLCAnPScsIFBST1BfTElTVCwgJ1snLCBCQVRDSF9JRCwgJ107JyxcbiAgICAgIGlubmVyLFxuICAgICAgJ30nLFxuICAgICAgb3V0ZXIuZXhpdClcblxuICAgIGZ1bmN0aW9uIGlzSW5uZXJEZWZuIChkZWZuKSB7XG4gICAgICByZXR1cm4gKChkZWZuLmNvbnRleHREZXAgJiYgY29udGV4dER5bmFtaWMpIHx8IGRlZm4ucHJvcERlcClcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBpc091dGVyRGVmbiAoZGVmbikge1xuICAgICAgcmV0dXJuICFpc0lubmVyRGVmbihkZWZuKVxuICAgIH1cblxuICAgIGlmIChhcmdzLm5lZWRzQ29udGV4dCkge1xuICAgICAgZW1pdENvbnRleHQoZW52LCBpbm5lciwgYXJncy5jb250ZXh0KVxuICAgIH1cbiAgICBpZiAoYXJncy5uZWVkc0ZyYW1lYnVmZmVyKSB7XG4gICAgICBlbWl0UG9sbEZyYW1lYnVmZmVyKGVudiwgaW5uZXIsIGFyZ3MuZnJhbWVidWZmZXIpXG4gICAgfVxuICAgIGVtaXRTZXRPcHRpb25zKGVudiwgaW5uZXIsIGFyZ3Muc3RhdGUsIGlzSW5uZXJEZWZuKVxuXG4gICAgaWYgKGFyZ3MucHJvZmlsZSAmJiBpc0lubmVyRGVmbihhcmdzLnByb2ZpbGUpKSB7XG4gICAgICBlbWl0UHJvZmlsZShlbnYsIGlubmVyLCBhcmdzLCBmYWxzZSwgdHJ1ZSlcbiAgICB9XG5cbiAgICBpZiAoIXByb2dyYW0pIHtcbiAgICAgIHZhciBwcm9nQ2FjaGUgPSBlbnYuZ2xvYmFsLmRlZigne30nKVxuICAgICAgdmFyIFBST0dSQU0gPSBhcmdzLnNoYWRlci5wcm9nVmFyLmFwcGVuZChlbnYsIGlubmVyKVxuICAgICAgdmFyIFBST0dfSUQgPSBpbm5lci5kZWYoUFJPR1JBTSwgJy5pZCcpXG4gICAgICB2YXIgQ0FDSEVEX1BST0MgPSBpbm5lci5kZWYocHJvZ0NhY2hlLCAnWycsIFBST0dfSUQsICddJylcbiAgICAgIGlubmVyKFxuICAgICAgICBlbnYuc2hhcmVkLmdsLCAnLnVzZVByb2dyYW0oJywgUFJPR1JBTSwgJy5wcm9ncmFtKTsnLFxuICAgICAgICAnaWYoIScsIENBQ0hFRF9QUk9DLCAnKXsnLFxuICAgICAgICBDQUNIRURfUFJPQywgJz0nLCBwcm9nQ2FjaGUsICdbJywgUFJPR19JRCwgJ109JyxcbiAgICAgICAgZW52LmxpbmsoZnVuY3Rpb24gKHByb2dyYW0pIHtcbiAgICAgICAgICByZXR1cm4gY3JlYXRlQm9keShcbiAgICAgICAgICAgIGVtaXRCYXRjaER5bmFtaWNTaGFkZXJCb2R5LCBlbnYsIGFyZ3MsIHByb2dyYW0sIDIpXG4gICAgICAgIH0pLCAnKCcsIFBST0dSQU0sICcpO30nLFxuICAgICAgICBDQUNIRURfUFJPQywgJy5jYWxsKHRoaXMsYTBbJywgQkFUQ0hfSUQsICddLCcsIEJBVENIX0lELCAnKTsnKVxuICAgIH0gZWxzZSB7XG4gICAgICBlbWl0QXR0cmlidXRlcyhlbnYsIG91dGVyLCBhcmdzLCBwcm9ncmFtLmF0dHJpYnV0ZXMsIGlzT3V0ZXJEZWZuKVxuICAgICAgZW1pdEF0dHJpYnV0ZXMoZW52LCBpbm5lciwgYXJncywgcHJvZ3JhbS5hdHRyaWJ1dGVzLCBpc0lubmVyRGVmbilcbiAgICAgIGVtaXRVbmlmb3JtcyhlbnYsIG91dGVyLCBhcmdzLCBwcm9ncmFtLnVuaWZvcm1zLCBpc091dGVyRGVmbilcbiAgICAgIGVtaXRVbmlmb3JtcyhlbnYsIGlubmVyLCBhcmdzLCBwcm9ncmFtLnVuaWZvcm1zLCBpc0lubmVyRGVmbilcbiAgICAgIGVtaXREcmF3KGVudiwgb3V0ZXIsIGlubmVyLCBhcmdzKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGVtaXRCYXRjaFByb2MgKGVudiwgYXJncykge1xuICAgIHZhciBiYXRjaCA9IGVudi5wcm9jKCdiYXRjaCcsIDIpXG4gICAgZW52LmJhdGNoSWQgPSAnMCdcblxuICAgIGluamVjdEV4dGVuc2lvbnMoZW52LCBiYXRjaClcblxuICAgIC8vIENoZWNrIGlmIGFueSBjb250ZXh0IHZhcmlhYmxlcyBkZXBlbmQgb24gcHJvcHNcbiAgICB2YXIgY29udGV4dER5bmFtaWMgPSBmYWxzZVxuICAgIHZhciBuZWVkc0NvbnRleHQgPSB0cnVlXG4gICAgT2JqZWN0LmtleXMoYXJncy5jb250ZXh0KS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICBjb250ZXh0RHluYW1pYyA9IGNvbnRleHREeW5hbWljIHx8IGFyZ3MuY29udGV4dFtuYW1lXS5wcm9wRGVwXG4gICAgfSlcbiAgICBpZiAoIWNvbnRleHREeW5hbWljKSB7XG4gICAgICBlbWl0Q29udGV4dChlbnYsIGJhdGNoLCBhcmdzLmNvbnRleHQpXG4gICAgICBuZWVkc0NvbnRleHQgPSBmYWxzZVxuICAgIH1cblxuICAgIC8vIGZyYW1lYnVmZmVyIHN0YXRlIGFmZmVjdHMgZnJhbWVidWZmZXJXaWR0aC9oZWlnaHQgY29udGV4dCB2YXJzXG4gICAgdmFyIGZyYW1lYnVmZmVyID0gYXJncy5mcmFtZWJ1ZmZlclxuICAgIHZhciBuZWVkc0ZyYW1lYnVmZmVyID0gZmFsc2VcbiAgICBpZiAoZnJhbWVidWZmZXIpIHtcbiAgICAgIGlmIChmcmFtZWJ1ZmZlci5wcm9wRGVwKSB7XG4gICAgICAgIGNvbnRleHREeW5hbWljID0gbmVlZHNGcmFtZWJ1ZmZlciA9IHRydWVcbiAgICAgIH0gZWxzZSBpZiAoZnJhbWVidWZmZXIuY29udGV4dERlcCAmJiBjb250ZXh0RHluYW1pYykge1xuICAgICAgICBuZWVkc0ZyYW1lYnVmZmVyID0gdHJ1ZVxuICAgICAgfVxuICAgICAgaWYgKCFuZWVkc0ZyYW1lYnVmZmVyKSB7XG4gICAgICAgIGVtaXRQb2xsRnJhbWVidWZmZXIoZW52LCBiYXRjaCwgZnJhbWVidWZmZXIpXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGVtaXRQb2xsRnJhbWVidWZmZXIoZW52LCBiYXRjaCwgbnVsbClcbiAgICB9XG5cbiAgICAvLyB2aWV3cG9ydCBpcyB3ZWlyZCBiZWNhdXNlIGl0IGNhbiBhZmZlY3QgY29udGV4dCB2YXJzXG4gICAgaWYgKGFyZ3Muc3RhdGUudmlld3BvcnQgJiYgYXJncy5zdGF0ZS52aWV3cG9ydC5wcm9wRGVwKSB7XG4gICAgICBjb250ZXh0RHluYW1pYyA9IHRydWVcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBpc0lubmVyRGVmbiAoZGVmbikge1xuICAgICAgcmV0dXJuIChkZWZuLmNvbnRleHREZXAgJiYgY29udGV4dER5bmFtaWMpIHx8IGRlZm4ucHJvcERlcFxuICAgIH1cblxuICAgIC8vIHNldCB3ZWJnbCBvcHRpb25zXG4gICAgZW1pdFBvbGxTdGF0ZShlbnYsIGJhdGNoLCBhcmdzKVxuICAgIGVtaXRTZXRPcHRpb25zKGVudiwgYmF0Y2gsIGFyZ3Muc3RhdGUsIGZ1bmN0aW9uIChkZWZuKSB7XG4gICAgICByZXR1cm4gIWlzSW5uZXJEZWZuKGRlZm4pXG4gICAgfSlcblxuICAgIGlmICghYXJncy5wcm9maWxlIHx8ICFpc0lubmVyRGVmbihhcmdzLnByb2ZpbGUpKSB7XG4gICAgICBlbWl0UHJvZmlsZShlbnYsIGJhdGNoLCBhcmdzLCBmYWxzZSwgJ2ExJylcbiAgICB9XG5cbiAgICAvLyBTYXZlIHRoZXNlIHZhbHVlcyB0byBhcmdzIHNvIHRoYXQgdGhlIGJhdGNoIGJvZHkgcm91dGluZSBjYW4gdXNlIHRoZW1cbiAgICBhcmdzLmNvbnRleHREZXAgPSBjb250ZXh0RHluYW1pY1xuICAgIGFyZ3MubmVlZHNDb250ZXh0ID0gbmVlZHNDb250ZXh0XG4gICAgYXJncy5uZWVkc0ZyYW1lYnVmZmVyID0gbmVlZHNGcmFtZWJ1ZmZlclxuXG4gICAgLy8gZGV0ZXJtaW5lIGlmIHNoYWRlciBpcyBkeW5hbWljXG4gICAgdmFyIHByb2dEZWZuID0gYXJncy5zaGFkZXIucHJvZ1ZhclxuICAgIGlmICgocHJvZ0RlZm4uY29udGV4dERlcCAmJiBjb250ZXh0RHluYW1pYykgfHwgcHJvZ0RlZm4ucHJvcERlcCkge1xuICAgICAgZW1pdEJhdGNoQm9keShcbiAgICAgICAgZW52LFxuICAgICAgICBiYXRjaCxcbiAgICAgICAgYXJncyxcbiAgICAgICAgbnVsbClcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIFBST0dSQU0gPSBwcm9nRGVmbi5hcHBlbmQoZW52LCBiYXRjaClcbiAgICAgIGJhdGNoKGVudi5zaGFyZWQuZ2wsICcudXNlUHJvZ3JhbSgnLCBQUk9HUkFNLCAnLnByb2dyYW0pOycpXG4gICAgICBpZiAoYXJncy5zaGFkZXIucHJvZ3JhbSkge1xuICAgICAgICBlbWl0QmF0Y2hCb2R5KFxuICAgICAgICAgIGVudixcbiAgICAgICAgICBiYXRjaCxcbiAgICAgICAgICBhcmdzLFxuICAgICAgICAgIGFyZ3Muc2hhZGVyLnByb2dyYW0pXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgYmF0Y2hDYWNoZSA9IGVudi5nbG9iYWwuZGVmKCd7fScpXG4gICAgICAgIHZhciBQUk9HX0lEID0gYmF0Y2guZGVmKFBST0dSQU0sICcuaWQnKVxuICAgICAgICB2YXIgQ0FDSEVEX1BST0MgPSBiYXRjaC5kZWYoYmF0Y2hDYWNoZSwgJ1snLCBQUk9HX0lELCAnXScpXG4gICAgICAgIGJhdGNoKFxuICAgICAgICAgIGVudi5jb25kKENBQ0hFRF9QUk9DKVxuICAgICAgICAgICAgLnRoZW4oQ0FDSEVEX1BST0MsICcuY2FsbCh0aGlzLGEwLGExKTsnKVxuICAgICAgICAgICAgLmVsc2UoXG4gICAgICAgICAgICAgIENBQ0hFRF9QUk9DLCAnPScsIGJhdGNoQ2FjaGUsICdbJywgUFJPR19JRCwgJ109JyxcbiAgICAgICAgICAgICAgZW52LmxpbmsoZnVuY3Rpb24gKHByb2dyYW0pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gY3JlYXRlQm9keShlbWl0QmF0Y2hCb2R5LCBlbnYsIGFyZ3MsIHByb2dyYW0sIDIpXG4gICAgICAgICAgICAgIH0pLCAnKCcsIFBST0dSQU0sICcpOycsXG4gICAgICAgICAgICAgIENBQ0hFRF9QUk9DLCAnLmNhbGwodGhpcyxhMCxhMSk7JykpXG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKE9iamVjdC5rZXlzKGFyZ3Muc3RhdGUpLmxlbmd0aCA+IDApIHtcbiAgICAgIGJhdGNoKGVudi5zaGFyZWQuY3VycmVudCwgJy5kaXJ0eT10cnVlOycpXG4gICAgfVxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBTQ09QRSBDT01NQU5EXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgZnVuY3Rpb24gZW1pdFNjb3BlUHJvYyAoZW52LCBhcmdzKSB7XG4gICAgdmFyIHNjb3BlID0gZW52LnByb2MoJ3Njb3BlJywgMylcbiAgICBlbnYuYmF0Y2hJZCA9ICdhMidcblxuICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgdmFyIENVUlJFTlRfU1RBVEUgPSBzaGFyZWQuY3VycmVudFxuXG4gICAgZW1pdENvbnRleHQoZW52LCBzY29wZSwgYXJncy5jb250ZXh0KVxuXG4gICAgaWYgKGFyZ3MuZnJhbWVidWZmZXIpIHtcbiAgICAgIGFyZ3MuZnJhbWVidWZmZXIuYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgfVxuXG4gICAgc29ydFN0YXRlKE9iamVjdC5rZXlzKGFyZ3Muc3RhdGUpKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICB2YXIgZGVmbiA9IGFyZ3Muc3RhdGVbbmFtZV1cbiAgICAgIHZhciB2YWx1ZSA9IGRlZm4uYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgICBpZiAoaXNBcnJheUxpa2UodmFsdWUpKSB7XG4gICAgICAgIHZhbHVlLmZvckVhY2goZnVuY3Rpb24gKHYsIGkpIHtcbiAgICAgICAgICBzY29wZS5zZXQoZW52Lm5leHRbbmFtZV0sICdbJyArIGkgKyAnXScsIHYpXG4gICAgICAgIH0pXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzY29wZS5zZXQoc2hhcmVkLm5leHQsICcuJyArIG5hbWUsIHZhbHVlKVxuICAgICAgfVxuICAgIH0pXG5cbiAgICBlbWl0UHJvZmlsZShlbnYsIHNjb3BlLCBhcmdzLCB0cnVlLCB0cnVlKVxuXG4gICAgO1tTX0VMRU1FTlRTLCBTX09GRlNFVCwgU19DT1VOVCwgU19JTlNUQU5DRVMsIFNfUFJJTUlUSVZFXS5mb3JFYWNoKFxuICAgICAgZnVuY3Rpb24gKG9wdCkge1xuICAgICAgICB2YXIgdmFyaWFibGUgPSBhcmdzLmRyYXdbb3B0XVxuICAgICAgICBpZiAoIXZhcmlhYmxlKSB7XG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cbiAgICAgICAgc2NvcGUuc2V0KHNoYXJlZC5kcmF3LCAnLicgKyBvcHQsICcnICsgdmFyaWFibGUuYXBwZW5kKGVudiwgc2NvcGUpKVxuICAgICAgfSlcblxuICAgIE9iamVjdC5rZXlzKGFyZ3MudW5pZm9ybXMpLmZvckVhY2goZnVuY3Rpb24gKG9wdCkge1xuICAgICAgc2NvcGUuc2V0KFxuICAgICAgICBzaGFyZWQudW5pZm9ybXMsXG4gICAgICAgICdbJyArIHN0cmluZ1N0b3JlLmlkKG9wdCkgKyAnXScsXG4gICAgICAgIGFyZ3MudW5pZm9ybXNbb3B0XS5hcHBlbmQoZW52LCBzY29wZSkpXG4gICAgfSlcblxuICAgIE9iamVjdC5rZXlzKGFyZ3MuYXR0cmlidXRlcykuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgdmFyIHJlY29yZCA9IGFyZ3MuYXR0cmlidXRlc1tuYW1lXS5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgIHZhciBzY29wZUF0dHJpYiA9IGVudi5zY29wZUF0dHJpYihuYW1lKVxuICAgICAgT2JqZWN0LmtleXMobmV3IEF0dHJpYnV0ZVJlY29yZCgpKS5mb3JFYWNoKGZ1bmN0aW9uIChwcm9wKSB7XG4gICAgICAgIHNjb3BlLnNldChzY29wZUF0dHJpYiwgJy4nICsgcHJvcCwgcmVjb3JkW3Byb3BdKVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgZnVuY3Rpb24gc2F2ZVNoYWRlciAobmFtZSkge1xuICAgICAgdmFyIHNoYWRlciA9IGFyZ3Muc2hhZGVyW25hbWVdXG4gICAgICBpZiAoc2hhZGVyKSB7XG4gICAgICAgIHNjb3BlLnNldChzaGFyZWQuc2hhZGVyLCAnLicgKyBuYW1lLCBzaGFkZXIuYXBwZW5kKGVudiwgc2NvcGUpKVxuICAgICAgfVxuICAgIH1cbiAgICBzYXZlU2hhZGVyKFNfVkVSVClcbiAgICBzYXZlU2hhZGVyKFNfRlJBRylcblxuICAgIGlmIChPYmplY3Qua2V5cyhhcmdzLnN0YXRlKS5sZW5ndGggPiAwKSB7XG4gICAgICBzY29wZShDVVJSRU5UX1NUQVRFLCAnLmRpcnR5PXRydWU7JylcbiAgICAgIHNjb3BlLmV4aXQoQ1VSUkVOVF9TVEFURSwgJy5kaXJ0eT10cnVlOycpXG4gICAgfVxuXG4gICAgc2NvcGUoJ2ExKCcsIGVudi5zaGFyZWQuY29udGV4dCwgJyxhMCwnLCBlbnYuYmF0Y2hJZCwgJyk7JylcbiAgfVxuXG4gIGZ1bmN0aW9uIGlzRHluYW1pY09iamVjdCAob2JqZWN0KSB7XG4gICAgaWYgKHR5cGVvZiBvYmplY3QgIT09ICdvYmplY3QnIHx8IGlzQXJyYXlMaWtlKG9iamVjdCkpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICB2YXIgcHJvcHMgPSBPYmplY3Qua2V5cyhvYmplY3QpXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwcm9wcy5sZW5ndGg7ICsraSkge1xuICAgICAgaWYgKGR5bmFtaWMuaXNEeW5hbWljKG9iamVjdFtwcm9wc1tpXV0pKSB7XG4gICAgICAgIHJldHVybiB0cnVlXG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmYWxzZVxuICB9XG5cbiAgZnVuY3Rpb24gc3BsYXRPYmplY3QgKGVudiwgb3B0aW9ucywgbmFtZSkge1xuICAgIHZhciBvYmplY3QgPSBvcHRpb25zLnN0YXRpY1tuYW1lXVxuICAgIGlmICghb2JqZWN0IHx8ICFpc0R5bmFtaWNPYmplY3Qob2JqZWN0KSkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgdmFyIGdsb2JhbHMgPSBlbnYuZ2xvYmFsXG4gICAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhvYmplY3QpXG4gICAgdmFyIHRoaXNEZXAgPSBmYWxzZVxuICAgIHZhciBjb250ZXh0RGVwID0gZmFsc2VcbiAgICB2YXIgcHJvcERlcCA9IGZhbHNlXG4gICAgdmFyIG9iamVjdFJlZiA9IGVudi5nbG9iYWwuZGVmKCd7fScpXG4gICAga2V5cy5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgIHZhciB2YWx1ZSA9IG9iamVjdFtrZXldXG4gICAgICBpZiAoZHluYW1pYy5pc0R5bmFtaWModmFsdWUpKSB7XG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICB2YWx1ZSA9IG9iamVjdFtrZXldID0gZHluYW1pYy51bmJveCh2YWx1ZSlcbiAgICAgICAgfVxuICAgICAgICB2YXIgZGVwcyA9IGNyZWF0ZUR5bmFtaWNEZWNsKHZhbHVlLCBudWxsKVxuICAgICAgICB0aGlzRGVwID0gdGhpc0RlcCB8fCBkZXBzLnRoaXNEZXBcbiAgICAgICAgcHJvcERlcCA9IHByb3BEZXAgfHwgZGVwcy5wcm9wRGVwXG4gICAgICAgIGNvbnRleHREZXAgPSBjb250ZXh0RGVwIHx8IGRlcHMuY29udGV4dERlcFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZ2xvYmFscyhvYmplY3RSZWYsICcuJywga2V5LCAnPScpXG4gICAgICAgIHN3aXRjaCAodHlwZW9mIHZhbHVlKSB7XG4gICAgICAgICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgICAgICAgIGdsb2JhbHModmFsdWUpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICAgICAgICBnbG9iYWxzKCdcIicsIHZhbHVlLCAnXCInKVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlICdvYmplY3QnOlxuICAgICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG4gICAgICAgICAgICAgIGdsb2JhbHMoJ1snLCB2YWx1ZS5qb2luKCksICddJylcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIGdsb2JhbHMoZW52LmxpbmsodmFsdWUpKVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgfVxuICAgICAgICBnbG9iYWxzKCc7JylcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgZnVuY3Rpb24gYXBwZW5kQmxvY2sgKGVudiwgYmxvY2spIHtcbiAgICAgIGtleXMuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgIHZhciB2YWx1ZSA9IG9iamVjdFtrZXldXG4gICAgICAgIGlmICghZHluYW1pYy5pc0R5bmFtaWModmFsdWUpKSB7XG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cbiAgICAgICAgdmFyIHJlZiA9IGVudi5pbnZva2UoYmxvY2ssIHZhbHVlKVxuICAgICAgICBibG9jayhvYmplY3RSZWYsICcuJywga2V5LCAnPScsIHJlZiwgJzsnKVxuICAgICAgfSlcbiAgICB9XG5cbiAgICBvcHRpb25zLmR5bmFtaWNbbmFtZV0gPSBuZXcgZHluYW1pYy5EeW5hbWljVmFyaWFibGUoRFlOX1RIVU5LLCB7XG4gICAgICB0aGlzRGVwOiB0aGlzRGVwLFxuICAgICAgY29udGV4dERlcDogY29udGV4dERlcCxcbiAgICAgIHByb3BEZXA6IHByb3BEZXAsXG4gICAgICByZWY6IG9iamVjdFJlZixcbiAgICAgIGFwcGVuZDogYXBwZW5kQmxvY2tcbiAgICB9KVxuICAgIGRlbGV0ZSBvcHRpb25zLnN0YXRpY1tuYW1lXVxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBNQUlOIERSQVcgQ09NTUFORFxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIGNvbXBpbGVDb21tYW5kIChvcHRpb25zLCBhdHRyaWJ1dGVzLCB1bmlmb3JtcywgY29udGV4dCwgc3RhdHMpIHtcbiAgICB2YXIgZW52ID0gY3JlYXRlUkVHTEVudmlyb25tZW50KClcblxuICAgIC8vIGxpbmsgc3RhdHMsIHNvIHRoYXQgd2UgY2FuIGVhc2lseSBhY2Nlc3MgaXQgaW4gdGhlIHByb2dyYW0uXG4gICAgZW52LnN0YXRzID0gZW52Lmxpbmsoc3RhdHMpXG5cbiAgICAvLyBzcGxhdCBvcHRpb25zIGFuZCBhdHRyaWJ1dGVzIHRvIGFsbG93IGZvciBkeW5hbWljIG5lc3RlZCBwcm9wZXJ0aWVzXG4gICAgT2JqZWN0LmtleXMoYXR0cmlidXRlcy5zdGF0aWMpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgc3BsYXRPYmplY3QoZW52LCBhdHRyaWJ1dGVzLCBrZXkpXG4gICAgfSlcbiAgICBORVNURURfT1BUSU9OUy5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICBzcGxhdE9iamVjdChlbnYsIG9wdGlvbnMsIG5hbWUpXG4gICAgfSlcblxuICAgIHZhciBhcmdzID0gcGFyc2VBcmd1bWVudHMob3B0aW9ucywgYXR0cmlidXRlcywgdW5pZm9ybXMsIGNvbnRleHQsIGVudilcblxuICAgIGVtaXREcmF3UHJvYyhlbnYsIGFyZ3MpXG4gICAgZW1pdFNjb3BlUHJvYyhlbnYsIGFyZ3MpXG4gICAgZW1pdEJhdGNoUHJvYyhlbnYsIGFyZ3MpXG5cbiAgICByZXR1cm4gZW52LmNvbXBpbGUoKVxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBQT0xMIC8gUkVGUkVTSFxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIHJldHVybiB7XG4gICAgbmV4dDogbmV4dFN0YXRlLFxuICAgIGN1cnJlbnQ6IGN1cnJlbnRTdGF0ZSxcbiAgICBwcm9jczogKGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBlbnYgPSBjcmVhdGVSRUdMRW52aXJvbm1lbnQoKVxuICAgICAgdmFyIHBvbGwgPSBlbnYucHJvYygncG9sbCcpXG4gICAgICB2YXIgcmVmcmVzaCA9IGVudi5wcm9jKCdyZWZyZXNoJylcbiAgICAgIHZhciBjb21tb24gPSBlbnYuYmxvY2soKVxuICAgICAgcG9sbChjb21tb24pXG4gICAgICByZWZyZXNoKGNvbW1vbilcblxuICAgICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcbiAgICAgIHZhciBHTCA9IHNoYXJlZC5nbFxuICAgICAgdmFyIE5FWFRfU1RBVEUgPSBzaGFyZWQubmV4dFxuICAgICAgdmFyIENVUlJFTlRfU1RBVEUgPSBzaGFyZWQuY3VycmVudFxuXG4gICAgICBjb21tb24oQ1VSUkVOVF9TVEFURSwgJy5kaXJ0eT1mYWxzZTsnKVxuXG4gICAgICBlbWl0UG9sbEZyYW1lYnVmZmVyKGVudiwgcG9sbClcbiAgICAgIGVtaXRQb2xsRnJhbWVidWZmZXIoZW52LCByZWZyZXNoLCBudWxsLCB0cnVlKVxuXG4gICAgICAvLyBSZWZyZXNoIHVwZGF0ZXMgYWxsIGF0dHJpYnV0ZSBzdGF0ZSBjaGFuZ2VzXG4gICAgICB2YXIgZXh0SW5zdGFuY2luZyA9IGdsLmdldEV4dGVuc2lvbignYW5nbGVfaW5zdGFuY2VkX2FycmF5cycpXG4gICAgICB2YXIgSU5TVEFOQ0lOR1xuICAgICAgaWYgKGV4dEluc3RhbmNpbmcpIHtcbiAgICAgICAgSU5TVEFOQ0lORyA9IGVudi5saW5rKGV4dEluc3RhbmNpbmcpXG4gICAgICB9XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxpbWl0cy5tYXhBdHRyaWJ1dGVzOyArK2kpIHtcbiAgICAgICAgdmFyIEJJTkRJTkcgPSByZWZyZXNoLmRlZihzaGFyZWQuYXR0cmlidXRlcywgJ1snLCBpLCAnXScpXG4gICAgICAgIHZhciBpZnRlID0gZW52LmNvbmQoQklORElORywgJy5idWZmZXInKVxuICAgICAgICBpZnRlLnRoZW4oXG4gICAgICAgICAgR0wsICcuZW5hYmxlVmVydGV4QXR0cmliQXJyYXkoJywgaSwgJyk7JyxcbiAgICAgICAgICBHTCwgJy5iaW5kQnVmZmVyKCcsXG4gICAgICAgICAgICBHTF9BUlJBWV9CVUZGRVIsICcsJyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcuYnVmZmVyLmJ1ZmZlcik7JyxcbiAgICAgICAgICBHTCwgJy52ZXJ0ZXhBdHRyaWJQb2ludGVyKCcsXG4gICAgICAgICAgICBpLCAnLCcsXG4gICAgICAgICAgICBCSU5ESU5HLCAnLnNpemUsJyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcudHlwZSwnLFxuICAgICAgICAgICAgQklORElORywgJy5ub3JtYWxpemVkLCcsXG4gICAgICAgICAgICBCSU5ESU5HLCAnLnN0cmlkZSwnLFxuICAgICAgICAgICAgQklORElORywgJy5vZmZzZXQpOydcbiAgICAgICAgKS5lbHNlKFxuICAgICAgICAgIEdMLCAnLmRpc2FibGVWZXJ0ZXhBdHRyaWJBcnJheSgnLCBpLCAnKTsnLFxuICAgICAgICAgIEdMLCAnLnZlcnRleEF0dHJpYjRmKCcsXG4gICAgICAgICAgICBpLCAnLCcsXG4gICAgICAgICAgICBCSU5ESU5HLCAnLngsJyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcueSwnLFxuICAgICAgICAgICAgQklORElORywgJy56LCcsXG4gICAgICAgICAgICBCSU5ESU5HLCAnLncpOycsXG4gICAgICAgICAgQklORElORywgJy5idWZmZXI9bnVsbDsnKVxuICAgICAgICByZWZyZXNoKGlmdGUpXG4gICAgICAgIGlmIChleHRJbnN0YW5jaW5nKSB7XG4gICAgICAgICAgcmVmcmVzaChcbiAgICAgICAgICAgIElOU1RBTkNJTkcsICcudmVydGV4QXR0cmliRGl2aXNvckFOR0xFKCcsXG4gICAgICAgICAgICBpLCAnLCcsXG4gICAgICAgICAgICBCSU5ESU5HLCAnLmRpdmlzb3IpOycpXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgT2JqZWN0LmtleXMoR0xfRkxBR1MpLmZvckVhY2goZnVuY3Rpb24gKGZsYWcpIHtcbiAgICAgICAgdmFyIGNhcCA9IEdMX0ZMQUdTW2ZsYWddXG4gICAgICAgIHZhciBORVhUID0gY29tbW9uLmRlZihORVhUX1NUQVRFLCAnLicsIGZsYWcpXG4gICAgICAgIHZhciBibG9jayA9IGVudi5ibG9jaygpXG4gICAgICAgIGJsb2NrKCdpZignLCBORVhULCAnKXsnLFxuICAgICAgICAgIEdMLCAnLmVuYWJsZSgnLCBjYXAsICcpfWVsc2V7JyxcbiAgICAgICAgICBHTCwgJy5kaXNhYmxlKCcsIGNhcCwgJyl9JyxcbiAgICAgICAgICBDVVJSRU5UX1NUQVRFLCAnLicsIGZsYWcsICc9JywgTkVYVCwgJzsnKVxuICAgICAgICByZWZyZXNoKGJsb2NrKVxuICAgICAgICBwb2xsKFxuICAgICAgICAgICdpZignLCBORVhULCAnIT09JywgQ1VSUkVOVF9TVEFURSwgJy4nLCBmbGFnLCAnKXsnLFxuICAgICAgICAgIGJsb2NrLFxuICAgICAgICAgICd9JylcbiAgICAgIH0pXG5cbiAgICAgIE9iamVjdC5rZXlzKEdMX1ZBUklBQkxFUykuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgICB2YXIgZnVuYyA9IEdMX1ZBUklBQkxFU1tuYW1lXVxuICAgICAgICB2YXIgaW5pdCA9IGN1cnJlbnRTdGF0ZVtuYW1lXVxuICAgICAgICB2YXIgTkVYVCwgQ1VSUkVOVFxuICAgICAgICB2YXIgYmxvY2sgPSBlbnYuYmxvY2soKVxuICAgICAgICBibG9jayhHTCwgJy4nLCBmdW5jLCAnKCcpXG4gICAgICAgIGlmIChpc0FycmF5TGlrZShpbml0KSkge1xuICAgICAgICAgIHZhciBuID0gaW5pdC5sZW5ndGhcbiAgICAgICAgICBORVhUID0gZW52Lmdsb2JhbC5kZWYoTkVYVF9TVEFURSwgJy4nLCBuYW1lKVxuICAgICAgICAgIENVUlJFTlQgPSBlbnYuZ2xvYmFsLmRlZihDVVJSRU5UX1NUQVRFLCAnLicsIG5hbWUpXG4gICAgICAgICAgYmxvY2soXG4gICAgICAgICAgICBsb29wKG4sIGZ1bmN0aW9uIChpKSB7XG4gICAgICAgICAgICAgIHJldHVybiBORVhUICsgJ1snICsgaSArICddJ1xuICAgICAgICAgICAgfSksICcpOycsXG4gICAgICAgICAgICBsb29wKG4sIGZ1bmN0aW9uIChpKSB7XG4gICAgICAgICAgICAgIHJldHVybiBDVVJSRU5UICsgJ1snICsgaSArICddPScgKyBORVhUICsgJ1snICsgaSArICddOydcbiAgICAgICAgICAgIH0pLmpvaW4oJycpKVxuICAgICAgICAgIHBvbGwoXG4gICAgICAgICAgICAnaWYoJywgbG9vcChuLCBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgICAgICByZXR1cm4gTkVYVCArICdbJyArIGkgKyAnXSE9PScgKyBDVVJSRU5UICsgJ1snICsgaSArICddJ1xuICAgICAgICAgICAgfSkuam9pbignfHwnKSwgJyl7JyxcbiAgICAgICAgICAgIGJsb2NrLFxuICAgICAgICAgICAgJ30nKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIE5FWFQgPSBjb21tb24uZGVmKE5FWFRfU1RBVEUsICcuJywgbmFtZSlcbiAgICAgICAgICBDVVJSRU5UID0gY29tbW9uLmRlZihDVVJSRU5UX1NUQVRFLCAnLicsIG5hbWUpXG4gICAgICAgICAgYmxvY2soXG4gICAgICAgICAgICBORVhULCAnKTsnLFxuICAgICAgICAgICAgQ1VSUkVOVF9TVEFURSwgJy4nLCBuYW1lLCAnPScsIE5FWFQsICc7JylcbiAgICAgICAgICBwb2xsKFxuICAgICAgICAgICAgJ2lmKCcsIE5FWFQsICchPT0nLCBDVVJSRU5ULCAnKXsnLFxuICAgICAgICAgICAgYmxvY2ssXG4gICAgICAgICAgICAnfScpXG4gICAgICAgIH1cbiAgICAgICAgcmVmcmVzaChibG9jaylcbiAgICAgIH0pXG5cbiAgICAgIHJldHVybiBlbnYuY29tcGlsZSgpXG4gICAgfSkoKSxcbiAgICBjb21waWxlOiBjb21waWxlQ29tbWFuZFxuICB9XG59XG4iLCJ2YXIgVkFSSUFCTEVfQ09VTlRFUiA9IDBcblxudmFyIERZTl9GVU5DID0gMFxuXG5mdW5jdGlvbiBEeW5hbWljVmFyaWFibGUgKHR5cGUsIGRhdGEpIHtcbiAgdGhpcy5pZCA9IChWQVJJQUJMRV9DT1VOVEVSKyspXG4gIHRoaXMudHlwZSA9IHR5cGVcbiAgdGhpcy5kYXRhID0gZGF0YVxufVxuXG5mdW5jdGlvbiBlc2NhcGVTdHIgKHN0cikge1xuICByZXR1cm4gc3RyLnJlcGxhY2UoL1xcXFwvZywgJ1xcXFxcXFxcJykucmVwbGFjZSgvXCIvZywgJ1xcXFxcIicpXG59XG5cbmZ1bmN0aW9uIHNwbGl0UGFydHMgKHN0cikge1xuICBpZiAoc3RyLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiBbXVxuICB9XG5cbiAgdmFyIGZpcnN0Q2hhciA9IHN0ci5jaGFyQXQoMClcbiAgdmFyIGxhc3RDaGFyID0gc3RyLmNoYXJBdChzdHIubGVuZ3RoIC0gMSlcblxuICBpZiAoc3RyLmxlbmd0aCA+IDEgJiZcbiAgICAgIGZpcnN0Q2hhciA9PT0gbGFzdENoYXIgJiZcbiAgICAgIChmaXJzdENoYXIgPT09ICdcIicgfHwgZmlyc3RDaGFyID09PSBcIidcIikpIHtcbiAgICByZXR1cm4gWydcIicgKyBlc2NhcGVTdHIoc3RyLnN1YnN0cigxLCBzdHIubGVuZ3RoIC0gMikpICsgJ1wiJ11cbiAgfVxuXG4gIHZhciBwYXJ0cyA9IC9cXFsoZmFsc2V8dHJ1ZXxudWxsfFxcZCt8J1teJ10qJ3xcIlteXCJdKlwiKVxcXS8uZXhlYyhzdHIpXG4gIGlmIChwYXJ0cykge1xuICAgIHJldHVybiAoXG4gICAgICBzcGxpdFBhcnRzKHN0ci5zdWJzdHIoMCwgcGFydHMuaW5kZXgpKVxuICAgICAgLmNvbmNhdChzcGxpdFBhcnRzKHBhcnRzWzFdKSlcbiAgICAgIC5jb25jYXQoc3BsaXRQYXJ0cyhzdHIuc3Vic3RyKHBhcnRzLmluZGV4ICsgcGFydHNbMF0ubGVuZ3RoKSkpXG4gICAgKVxuICB9XG5cbiAgdmFyIHN1YnBhcnRzID0gc3RyLnNwbGl0KCcuJylcbiAgaWYgKHN1YnBhcnRzLmxlbmd0aCA9PT0gMSkge1xuICAgIHJldHVybiBbJ1wiJyArIGVzY2FwZVN0cihzdHIpICsgJ1wiJ11cbiAgfVxuXG4gIHZhciByZXN1bHQgPSBbXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHN1YnBhcnRzLmxlbmd0aDsgKytpKSB7XG4gICAgcmVzdWx0ID0gcmVzdWx0LmNvbmNhdChzcGxpdFBhcnRzKHN1YnBhcnRzW2ldKSlcbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG5cbmZ1bmN0aW9uIHRvQWNjZXNzb3JTdHJpbmcgKHN0cikge1xuICByZXR1cm4gJ1snICsgc3BsaXRQYXJ0cyhzdHIpLmpvaW4oJ11bJykgKyAnXSdcbn1cblxuZnVuY3Rpb24gZGVmaW5lRHluYW1pYyAodHlwZSwgZGF0YSkge1xuICByZXR1cm4gbmV3IER5bmFtaWNWYXJpYWJsZSh0eXBlLCB0b0FjY2Vzc29yU3RyaW5nKGRhdGEgKyAnJykpXG59XG5cbmZ1bmN0aW9uIGlzRHluYW1pYyAoeCkge1xuICByZXR1cm4gKHR5cGVvZiB4ID09PSAnZnVuY3Rpb24nICYmICF4Ll9yZWdsVHlwZSkgfHxcbiAgICAgICAgIHggaW5zdGFuY2VvZiBEeW5hbWljVmFyaWFibGVcbn1cblxuZnVuY3Rpb24gdW5ib3ggKHgsIHBhdGgpIHtcbiAgaWYgKHR5cGVvZiB4ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgcmV0dXJuIG5ldyBEeW5hbWljVmFyaWFibGUoRFlOX0ZVTkMsIHgpXG4gIH1cbiAgcmV0dXJuIHhcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIER5bmFtaWNWYXJpYWJsZTogRHluYW1pY1ZhcmlhYmxlLFxuICBkZWZpbmU6IGRlZmluZUR5bmFtaWMsXG4gIGlzRHluYW1pYzogaXNEeW5hbWljLFxuICB1bmJveDogdW5ib3gsXG4gIGFjY2Vzc29yOiB0b0FjY2Vzc29yU3RyaW5nXG59XG4iLCJ2YXIgY2hlY2sgPSByZXF1aXJlKCcuL3V0aWwvY2hlY2snKVxudmFyIGlzVHlwZWRBcnJheSA9IHJlcXVpcmUoJy4vdXRpbC9pcy10eXBlZC1hcnJheScpXG52YXIgaXNOREFycmF5TGlrZSA9IHJlcXVpcmUoJy4vdXRpbC9pcy1uZGFycmF5JylcbnZhciB2YWx1ZXMgPSByZXF1aXJlKCcuL3V0aWwvdmFsdWVzJylcblxudmFyIHByaW1UeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL3ByaW1pdGl2ZXMuanNvbicpXG52YXIgdXNhZ2VUeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL3VzYWdlLmpzb24nKVxuXG52YXIgR0xfUE9JTlRTID0gMFxudmFyIEdMX0xJTkVTID0gMVxudmFyIEdMX1RSSUFOR0xFUyA9IDRcblxudmFyIEdMX0JZVEUgPSA1MTIwXG52YXIgR0xfVU5TSUdORURfQllURSA9IDUxMjFcbnZhciBHTF9TSE9SVCA9IDUxMjJcbnZhciBHTF9VTlNJR05FRF9TSE9SVCA9IDUxMjNcbnZhciBHTF9JTlQgPSA1MTI0XG52YXIgR0xfVU5TSUdORURfSU5UID0gNTEyNVxuXG52YXIgR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIgPSAzNDk2M1xuXG52YXIgR0xfU1RSRUFNX0RSQVcgPSAweDg4RTBcbnZhciBHTF9TVEFUSUNfRFJBVyA9IDB4ODhFNFxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBFbGVtZW50c1N0YXRlIChnbCwgZXh0ZW5zaW9ucywgYnVmZmVyU3RhdGUsIHN0YXRzKSB7XG4gIHZhciBlbGVtZW50U2V0ID0ge31cbiAgdmFyIGVsZW1lbnRDb3VudCA9IDBcblxuICB2YXIgZWxlbWVudFR5cGVzID0ge1xuICAgICd1aW50OCc6IEdMX1VOU0lHTkVEX0JZVEUsXG4gICAgJ3VpbnQxNic6IEdMX1VOU0lHTkVEX1NIT1JUXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5vZXNfZWxlbWVudF9pbmRleF91aW50KSB7XG4gICAgZWxlbWVudFR5cGVzLnVpbnQzMiA9IEdMX1VOU0lHTkVEX0lOVFxuICB9XG5cbiAgZnVuY3Rpb24gUkVHTEVsZW1lbnRCdWZmZXIgKGJ1ZmZlcikge1xuICAgIHRoaXMuaWQgPSBlbGVtZW50Q291bnQrK1xuICAgIGVsZW1lbnRTZXRbdGhpcy5pZF0gPSB0aGlzXG4gICAgdGhpcy5idWZmZXIgPSBidWZmZXJcbiAgICB0aGlzLnByaW1UeXBlID0gR0xfVFJJQU5HTEVTXG4gICAgdGhpcy52ZXJ0Q291bnQgPSAwXG4gICAgdGhpcy50eXBlID0gMFxuICB9XG5cbiAgUkVHTEVsZW1lbnRCdWZmZXIucHJvdG90eXBlLmJpbmQgPSBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5idWZmZXIuYmluZCgpXG4gIH1cblxuICB2YXIgYnVmZmVyUG9vbCA9IFtdXG5cbiAgZnVuY3Rpb24gY3JlYXRlRWxlbWVudFN0cmVhbSAoZGF0YSkge1xuICAgIHZhciByZXN1bHQgPSBidWZmZXJQb29sLnBvcCgpXG4gICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgIHJlc3VsdCA9IG5ldyBSRUdMRWxlbWVudEJ1ZmZlcihidWZmZXJTdGF0ZS5jcmVhdGUoXG4gICAgICAgIG51bGwsXG4gICAgICAgIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSLFxuICAgICAgICB0cnVlLFxuICAgICAgICBmYWxzZSkuX2J1ZmZlcilcbiAgICB9XG4gICAgaW5pdEVsZW1lbnRzKHJlc3VsdCwgZGF0YSwgR0xfU1RSRUFNX0RSQVcsIC0xLCAtMSwgMCwgMClcbiAgICByZXR1cm4gcmVzdWx0XG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95RWxlbWVudFN0cmVhbSAoZWxlbWVudHMpIHtcbiAgICBidWZmZXJQb29sLnB1c2goZWxlbWVudHMpXG4gIH1cblxuICBmdW5jdGlvbiBpbml0RWxlbWVudHMgKFxuICAgIGVsZW1lbnRzLFxuICAgIGRhdGEsXG4gICAgdXNhZ2UsXG4gICAgcHJpbSxcbiAgICBjb3VudCxcbiAgICBieXRlTGVuZ3RoLFxuICAgIHR5cGUpIHtcbiAgICBlbGVtZW50cy5idWZmZXIuYmluZCgpXG4gICAgaWYgKGRhdGEpIHtcbiAgICAgIHZhciBwcmVkaWN0ZWRUeXBlID0gdHlwZVxuICAgICAgaWYgKCF0eXBlICYmIChcbiAgICAgICAgICAhaXNUeXBlZEFycmF5KGRhdGEpIHx8XG4gICAgICAgICAoaXNOREFycmF5TGlrZShkYXRhKSAmJiAhaXNUeXBlZEFycmF5KGRhdGEuZGF0YSkpKSkge1xuICAgICAgICBwcmVkaWN0ZWRUeXBlID0gZXh0ZW5zaW9ucy5vZXNfZWxlbWVudF9pbmRleF91aW50XG4gICAgICAgICAgPyBHTF9VTlNJR05FRF9JTlRcbiAgICAgICAgICA6IEdMX1VOU0lHTkVEX1NIT1JUXG4gICAgICB9XG4gICAgICBidWZmZXJTdGF0ZS5faW5pdEJ1ZmZlcihcbiAgICAgICAgZWxlbWVudHMuYnVmZmVyLFxuICAgICAgICBkYXRhLFxuICAgICAgICB1c2FnZSxcbiAgICAgICAgcHJlZGljdGVkVHlwZSxcbiAgICAgICAgMylcbiAgICB9IGVsc2Uge1xuICAgICAgZ2wuYnVmZmVyRGF0YShHTF9FTEVNRU5UX0FSUkFZX0JVRkZFUiwgYnl0ZUxlbmd0aCwgdXNhZ2UpXG4gICAgICBlbGVtZW50cy5idWZmZXIuZHR5cGUgPSBkdHlwZSB8fCBHTF9VTlNJR05FRF9CWVRFXG4gICAgICBlbGVtZW50cy5idWZmZXIudXNhZ2UgPSB1c2FnZVxuICAgICAgZWxlbWVudHMuYnVmZmVyLmRpbWVuc2lvbiA9IDNcbiAgICAgIGVsZW1lbnRzLmJ1ZmZlci5ieXRlTGVuZ3RoID0gYnl0ZUxlbmd0aFxuICAgIH1cblxuICAgIHZhciBkdHlwZSA9IHR5cGVcbiAgICBpZiAoIXR5cGUpIHtcbiAgICAgIHN3aXRjaCAoZWxlbWVudHMuYnVmZmVyLmR0eXBlKSB7XG4gICAgICAgIGNhc2UgR0xfVU5TSUdORURfQllURTpcbiAgICAgICAgY2FzZSBHTF9CWVRFOlxuICAgICAgICAgIGR0eXBlID0gR0xfVU5TSUdORURfQllURVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9TSE9SVDpcbiAgICAgICAgY2FzZSBHTF9TSE9SVDpcbiAgICAgICAgICBkdHlwZSA9IEdMX1VOU0lHTkVEX1NIT1JUXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX0lOVDpcbiAgICAgICAgY2FzZSBHTF9JTlQ6XG4gICAgICAgICAgZHR5cGUgPSBHTF9VTlNJR05FRF9JTlRcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgY2hlY2sucmFpc2UoJ3Vuc3VwcG9ydGVkIHR5cGUgZm9yIGVsZW1lbnQgYXJyYXknKVxuICAgICAgfVxuICAgICAgZWxlbWVudHMuYnVmZmVyLmR0eXBlID0gZHR5cGVcbiAgICB9XG4gICAgZWxlbWVudHMudHlwZSA9IGR0eXBlXG5cbiAgICAvLyBDaGVjayBvZXNfZWxlbWVudF9pbmRleF91aW50IGV4dGVuc2lvblxuICAgIGNoZWNrKFxuICAgICAgZHR5cGUgIT09IEdMX1VOU0lHTkVEX0lOVCB8fFxuICAgICAgISFleHRlbnNpb25zLm9lc19lbGVtZW50X2luZGV4X3VpbnQsXG4gICAgICAnMzIgYml0IGVsZW1lbnQgYnVmZmVycyBub3Qgc3VwcG9ydGVkLCBlbmFibGUgb2VzX2VsZW1lbnRfaW5kZXhfdWludCBmaXJzdCcpXG5cbiAgICAvLyB0cnkgdG8gZ3Vlc3MgZGVmYXVsdCBwcmltaXRpdmUgdHlwZSBhbmQgYXJndW1lbnRzXG4gICAgdmFyIHZlcnRDb3VudCA9IGNvdW50XG4gICAgaWYgKHZlcnRDb3VudCA8IDApIHtcbiAgICAgIHZlcnRDb3VudCA9IGVsZW1lbnRzLmJ1ZmZlci5ieXRlTGVuZ3RoXG4gICAgICBpZiAoZHR5cGUgPT09IEdMX1VOU0lHTkVEX1NIT1JUKSB7XG4gICAgICAgIHZlcnRDb3VudCA+Pj0gMVxuICAgICAgfSBlbHNlIGlmIChkdHlwZSA9PT0gR0xfVU5TSUdORURfSU5UKSB7XG4gICAgICAgIHZlcnRDb3VudCA+Pj0gMlxuICAgICAgfVxuICAgIH1cbiAgICBlbGVtZW50cy52ZXJ0Q291bnQgPSB2ZXJ0Q291bnRcblxuICAgIC8vIHRyeSB0byBndWVzcyBwcmltaXRpdmUgdHlwZSBmcm9tIGNlbGwgZGltZW5zaW9uXG4gICAgdmFyIHByaW1UeXBlID0gcHJpbVxuICAgIGlmIChwcmltIDwgMCkge1xuICAgICAgcHJpbVR5cGUgPSBHTF9UUklBTkdMRVNcbiAgICAgIHZhciBkaW1lbnNpb24gPSBlbGVtZW50cy5idWZmZXIuZGltZW5zaW9uXG4gICAgICBpZiAoZGltZW5zaW9uID09PSAxKSBwcmltVHlwZSA9IEdMX1BPSU5UU1xuICAgICAgaWYgKGRpbWVuc2lvbiA9PT0gMikgcHJpbVR5cGUgPSBHTF9MSU5FU1xuICAgICAgaWYgKGRpbWVuc2lvbiA9PT0gMykgcHJpbVR5cGUgPSBHTF9UUklBTkdMRVNcbiAgICB9XG4gICAgZWxlbWVudHMucHJpbVR5cGUgPSBwcmltVHlwZVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveUVsZW1lbnRzIChlbGVtZW50cykge1xuICAgIHN0YXRzLmVsZW1lbnRzQ291bnQtLVxuXG4gICAgY2hlY2soZWxlbWVudHMuYnVmZmVyICE9PSBudWxsLCAnbXVzdCBub3QgZG91YmxlIGRlc3Ryb3kgZWxlbWVudHMnKVxuICAgIGRlbGV0ZSBlbGVtZW50U2V0W2VsZW1lbnRzLmlkXVxuICAgIGVsZW1lbnRzLmJ1ZmZlci5kZXN0cm95KClcbiAgICBlbGVtZW50cy5idWZmZXIgPSBudWxsXG4gIH1cblxuICBmdW5jdGlvbiBjcmVhdGVFbGVtZW50cyAob3B0aW9ucywgcGVyc2lzdGVudCkge1xuICAgIHZhciBidWZmZXIgPSBidWZmZXJTdGF0ZS5jcmVhdGUobnVsbCwgR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIsIHRydWUpXG4gICAgdmFyIGVsZW1lbnRzID0gbmV3IFJFR0xFbGVtZW50QnVmZmVyKGJ1ZmZlci5fYnVmZmVyKVxuICAgIHN0YXRzLmVsZW1lbnRzQ291bnQrK1xuXG4gICAgZnVuY3Rpb24gcmVnbEVsZW1lbnRzIChvcHRpb25zKSB7XG4gICAgICBpZiAoIW9wdGlvbnMpIHtcbiAgICAgICAgYnVmZmVyKClcbiAgICAgICAgZWxlbWVudHMucHJpbVR5cGUgPSBHTF9UUklBTkdMRVNcbiAgICAgICAgZWxlbWVudHMudmVydENvdW50ID0gMFxuICAgICAgICBlbGVtZW50cy50eXBlID0gR0xfVU5TSUdORURfQllURVxuICAgICAgfSBlbHNlIGlmICh0eXBlb2Ygb3B0aW9ucyA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgYnVmZmVyKG9wdGlvbnMpXG4gICAgICAgIGVsZW1lbnRzLnByaW1UeXBlID0gR0xfVFJJQU5HTEVTXG4gICAgICAgIGVsZW1lbnRzLnZlcnRDb3VudCA9IG9wdGlvbnMgfCAwXG4gICAgICAgIGVsZW1lbnRzLnR5cGUgPSBHTF9VTlNJR05FRF9CWVRFXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgZGF0YSA9IG51bGxcbiAgICAgICAgdmFyIHVzYWdlID0gR0xfU1RBVElDX0RSQVdcbiAgICAgICAgdmFyIHByaW1UeXBlID0gLTFcbiAgICAgICAgdmFyIHZlcnRDb3VudCA9IC0xXG4gICAgICAgIHZhciBieXRlTGVuZ3RoID0gMFxuICAgICAgICB2YXIgZHR5cGUgPSAwXG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KG9wdGlvbnMpIHx8XG4gICAgICAgICAgICBpc1R5cGVkQXJyYXkob3B0aW9ucykgfHxcbiAgICAgICAgICAgIGlzTkRBcnJheUxpa2Uob3B0aW9ucykpIHtcbiAgICAgICAgICBkYXRhID0gb3B0aW9uc1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNoZWNrLnR5cGUob3B0aW9ucywgJ29iamVjdCcsICdpbnZhbGlkIGFyZ3VtZW50cyBmb3IgZWxlbWVudHMnKVxuICAgICAgICAgIGlmICgnZGF0YScgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgZGF0YSA9IG9wdGlvbnMuZGF0YVxuICAgICAgICAgICAgY2hlY2soXG4gICAgICAgICAgICAgICAgQXJyYXkuaXNBcnJheShkYXRhKSB8fFxuICAgICAgICAgICAgICAgIGlzVHlwZWRBcnJheShkYXRhKSB8fFxuICAgICAgICAgICAgICAgIGlzTkRBcnJheUxpa2UoZGF0YSksXG4gICAgICAgICAgICAgICAgJ2ludmFsaWQgZGF0YSBmb3IgZWxlbWVudCBidWZmZXInKVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoJ3VzYWdlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBjaGVjay5wYXJhbWV0ZXIoXG4gICAgICAgICAgICAgIG9wdGlvbnMudXNhZ2UsXG4gICAgICAgICAgICAgIHVzYWdlVHlwZXMsXG4gICAgICAgICAgICAgICdpbnZhbGlkIGVsZW1lbnQgYnVmZmVyIHVzYWdlJylcbiAgICAgICAgICAgIHVzYWdlID0gdXNhZ2VUeXBlc1tvcHRpb25zLnVzYWdlXVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoJ3ByaW1pdGl2ZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgY2hlY2sucGFyYW1ldGVyKFxuICAgICAgICAgICAgICBvcHRpb25zLnByaW1pdGl2ZSxcbiAgICAgICAgICAgICAgcHJpbVR5cGVzLFxuICAgICAgICAgICAgICAnaW52YWxpZCBlbGVtZW50IGJ1ZmZlciBwcmltaXRpdmUnKVxuICAgICAgICAgICAgcHJpbVR5cGUgPSBwcmltVHlwZXNbb3B0aW9ucy5wcmltaXRpdmVdXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgnY291bnQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGNoZWNrKFxuICAgICAgICAgICAgICB0eXBlb2Ygb3B0aW9ucy5jb3VudCA9PT0gJ251bWJlcicgJiYgb3B0aW9ucy5jb3VudCA+PSAwLFxuICAgICAgICAgICAgICAnaW52YWxpZCB2ZXJ0ZXggY291bnQgZm9yIGVsZW1lbnRzJylcbiAgICAgICAgICAgIHZlcnRDb3VudCA9IG9wdGlvbnMuY291bnQgfCAwXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgndHlwZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgY2hlY2sucGFyYW1ldGVyKFxuICAgICAgICAgICAgICBvcHRpb25zLnR5cGUsXG4gICAgICAgICAgICAgIGVsZW1lbnRUeXBlcyxcbiAgICAgICAgICAgICAgJ2ludmFsaWQgYnVmZmVyIHR5cGUnKVxuICAgICAgICAgICAgZHR5cGUgPSBlbGVtZW50VHlwZXNbb3B0aW9ucy50eXBlXVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoJ2xlbmd0aCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgYnl0ZUxlbmd0aCA9IG9wdGlvbnMubGVuZ3RoIHwgMFxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBieXRlTGVuZ3RoID0gdmVydENvdW50XG4gICAgICAgICAgICBpZiAoZHR5cGUgPT09IEdMX1VOU0lHTkVEX1NIT1JUIHx8IGR0eXBlID09PSBHTF9TSE9SVCkge1xuICAgICAgICAgICAgICBieXRlTGVuZ3RoICo9IDJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZHR5cGUgPT09IEdMX1VOU0lHTkVEX0lOVCB8fCBkdHlwZSA9PT0gR0xfSU5UKSB7XG4gICAgICAgICAgICAgIGJ5dGVMZW5ndGggKj0gNFxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpbml0RWxlbWVudHMoXG4gICAgICAgICAgZWxlbWVudHMsXG4gICAgICAgICAgZGF0YSxcbiAgICAgICAgICB1c2FnZSxcbiAgICAgICAgICBwcmltVHlwZSxcbiAgICAgICAgICB2ZXJ0Q291bnQsXG4gICAgICAgICAgYnl0ZUxlbmd0aCxcbiAgICAgICAgICBkdHlwZSlcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJlZ2xFbGVtZW50c1xuICAgIH1cblxuICAgIHJlZ2xFbGVtZW50cyhvcHRpb25zKVxuXG4gICAgcmVnbEVsZW1lbnRzLl9yZWdsVHlwZSA9ICdlbGVtZW50cydcbiAgICByZWdsRWxlbWVudHMuX2VsZW1lbnRzID0gZWxlbWVudHNcbiAgICByZWdsRWxlbWVudHMuc3ViZGF0YSA9IGZ1bmN0aW9uIChkYXRhLCBvZmZzZXQpIHtcbiAgICAgIGJ1ZmZlci5zdWJkYXRhKGRhdGEsIG9mZnNldClcbiAgICAgIHJldHVybiByZWdsRWxlbWVudHNcbiAgICB9XG4gICAgcmVnbEVsZW1lbnRzLmRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7XG4gICAgICBkZXN0cm95RWxlbWVudHMoZWxlbWVudHMpXG4gICAgfVxuXG4gICAgcmV0dXJuIHJlZ2xFbGVtZW50c1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjcmVhdGU6IGNyZWF0ZUVsZW1lbnRzLFxuICAgIGNyZWF0ZVN0cmVhbTogY3JlYXRlRWxlbWVudFN0cmVhbSxcbiAgICBkZXN0cm95U3RyZWFtOiBkZXN0cm95RWxlbWVudFN0cmVhbSxcbiAgICBnZXRFbGVtZW50czogZnVuY3Rpb24gKGVsZW1lbnRzKSB7XG4gICAgICBpZiAodHlwZW9mIGVsZW1lbnRzID09PSAnZnVuY3Rpb24nICYmXG4gICAgICAgICAgZWxlbWVudHMuX2VsZW1lbnRzIGluc3RhbmNlb2YgUkVHTEVsZW1lbnRCdWZmZXIpIHtcbiAgICAgICAgcmV0dXJuIGVsZW1lbnRzLl9lbGVtZW50c1xuICAgICAgfVxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9LFxuICAgIGNsZWFyOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YWx1ZXMoZWxlbWVudFNldCkuZm9yRWFjaChkZXN0cm95RWxlbWVudHMpXG4gICAgfVxuICB9XG59XG4iLCJ2YXIgY2hlY2sgPSByZXF1aXJlKCcuL3V0aWwvY2hlY2snKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNyZWF0ZUV4dGVuc2lvbkNhY2hlIChnbCwgY29uZmlnKSB7XG4gIHZhciBleHRlbnNpb25zID0ge31cblxuICBmdW5jdGlvbiB0cnlMb2FkRXh0ZW5zaW9uIChuYW1lXykge1xuICAgIGNoZWNrLnR5cGUobmFtZV8sICdzdHJpbmcnLCAnZXh0ZW5zaW9uIG5hbWUgbXVzdCBiZSBzdHJpbmcnKVxuICAgIHZhciBuYW1lID0gbmFtZV8udG9Mb3dlckNhc2UoKVxuICAgIHZhciBleHRcbiAgICB0cnkge1xuICAgICAgZXh0ID0gZXh0ZW5zaW9uc1tuYW1lXSA9IGdsLmdldEV4dGVuc2lvbihuYW1lKVxuICAgIH0gY2F0Y2ggKGUpIHt9XG4gICAgcmV0dXJuICEhZXh0XG4gIH1cblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGNvbmZpZy5leHRlbnNpb25zLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIG5hbWUgPSBjb25maWcuZXh0ZW5zaW9uc1tpXVxuICAgIGlmICghdHJ5TG9hZEV4dGVuc2lvbihuYW1lKSkge1xuICAgICAgY29uZmlnLm9uRGVzdHJveSgpXG4gICAgICBjb25maWcub25Eb25lKCdcIicgKyBuYW1lICsgJ1wiIGV4dGVuc2lvbiBpcyBub3Qgc3VwcG9ydGVkIGJ5IHRoZSBjdXJyZW50IFdlYkdMIGNvbnRleHQsIHRyeSB1cGdyYWRpbmcgeW91ciBzeXN0ZW0gb3IgYSBkaWZmZXJlbnQgYnJvd3NlcicpXG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cbiAgfVxuXG4gIGNvbmZpZy5vcHRpb25hbEV4dGVuc2lvbnMuZm9yRWFjaCh0cnlMb2FkRXh0ZW5zaW9uKVxuXG4gIHJldHVybiB7XG4gICAgZXh0ZW5zaW9uczogZXh0ZW5zaW9ucyxcbiAgICByZXN0b3JlOiBmdW5jdGlvbiAoKSB7XG4gICAgICBPYmplY3Qua2V5cyhleHRlbnNpb25zKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICAgIGlmICghdHJ5TG9hZEV4dGVuc2lvbihuYW1lKSkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignKHJlZ2wpOiBlcnJvciByZXN0b3JpbmcgZXh0ZW5zaW9uICcgKyBuYW1lKVxuICAgICAgICB9XG4gICAgICB9KVxuICAgIH1cbiAgfVxufVxuIiwidmFyIGNoZWNrID0gcmVxdWlyZSgnLi91dGlsL2NoZWNrJylcbnZhciB2YWx1ZXMgPSByZXF1aXJlKCcuL3V0aWwvdmFsdWVzJylcbnZhciBleHRlbmQgPSByZXF1aXJlKCcuL3V0aWwvZXh0ZW5kJylcblxuLy8gV2Ugc3RvcmUgdGhlc2UgY29uc3RhbnRzIHNvIHRoYXQgdGhlIG1pbmlmaWVyIGNhbiBpbmxpbmUgdGhlbVxudmFyIEdMX0ZSQU1FQlVGRkVSID0gMHg4RDQwXG52YXIgR0xfUkVOREVSQlVGRkVSID0gMHg4RDQxXG5cbnZhciBHTF9URVhUVVJFXzJEID0gMHgwREUxXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YID0gMHg4NTE1XG5cbnZhciBHTF9DT0xPUl9BVFRBQ0hNRU5UMCA9IDB4OENFMFxudmFyIEdMX0RFUFRIX0FUVEFDSE1FTlQgPSAweDhEMDBcbnZhciBHTF9TVEVOQ0lMX0FUVEFDSE1FTlQgPSAweDhEMjBcbnZhciBHTF9ERVBUSF9TVEVOQ0lMX0FUVEFDSE1FTlQgPSAweDgyMUFcblxudmFyIEdMX0ZSQU1FQlVGRkVSX0NPTVBMRVRFID0gMHg4Q0Q1XG52YXIgR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9BVFRBQ0hNRU5UID0gMHg4Q0Q2XG52YXIgR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9NSVNTSU5HX0FUVEFDSE1FTlQgPSAweDhDRDdcbnZhciBHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX0RJTUVOU0lPTlMgPSAweDhDRDlcbnZhciBHTF9GUkFNRUJVRkZFUl9VTlNVUFBPUlRFRCA9IDB4OENERFxuXG52YXIgR0xfSEFMRl9GTE9BVF9PRVMgPSAweDhENjFcbnZhciBHTF9VTlNJR05FRF9CWVRFID0gMHgxNDAxXG52YXIgR0xfRkxPQVQgPSAweDE0MDZcblxudmFyIEdMX1JHQkEgPSAweDE5MDhcblxudmFyIEdMX0RFUFRIX0NPTVBPTkVOVCA9IDB4MTkwMlxuXG52YXIgY29sb3JUZXh0dXJlRm9ybWF0RW51bXMgPSBbXG4gIEdMX1JHQkFcbl1cblxuLy8gZm9yIGV2ZXJ5IHRleHR1cmUgZm9ybWF0LCBzdG9yZVxuLy8gdGhlIG51bWJlciBvZiBjaGFubmVsc1xudmFyIHRleHR1cmVGb3JtYXRDaGFubmVscyA9IFtdXG50ZXh0dXJlRm9ybWF0Q2hhbm5lbHNbR0xfUkdCQV0gPSA0XG5cbi8vIGZvciBldmVyeSB0ZXh0dXJlIHR5cGUsIHN0b3JlXG4vLyB0aGUgc2l6ZSBpbiBieXRlcy5cbnZhciB0ZXh0dXJlVHlwZVNpemVzID0gW11cbnRleHR1cmVUeXBlU2l6ZXNbR0xfVU5TSUdORURfQllURV0gPSAxXG50ZXh0dXJlVHlwZVNpemVzW0dMX0ZMT0FUXSA9IDRcbnRleHR1cmVUeXBlU2l6ZXNbR0xfSEFMRl9GTE9BVF9PRVNdID0gMlxuXG52YXIgR0xfUkdCQTQgPSAweDgwNTZcbnZhciBHTF9SR0I1X0ExID0gMHg4MDU3XG52YXIgR0xfUkdCNTY1ID0gMHg4RDYyXG52YXIgR0xfREVQVEhfQ09NUE9ORU5UMTYgPSAweDgxQTVcbnZhciBHTF9TVEVOQ0lMX0lOREVYOCA9IDB4OEQ0OFxudmFyIEdMX0RFUFRIX1NURU5DSUwgPSAweDg0RjlcblxudmFyIEdMX1NSR0I4X0FMUEhBOF9FWFQgPSAweDhDNDNcblxudmFyIEdMX1JHQkEzMkZfRVhUID0gMHg4ODE0XG5cbnZhciBHTF9SR0JBMTZGX0VYVCA9IDB4ODgxQVxudmFyIEdMX1JHQjE2Rl9FWFQgPSAweDg4MUJcblxudmFyIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0RW51bXMgPSBbXG4gIEdMX1JHQkE0LFxuICBHTF9SR0I1X0ExLFxuICBHTF9SR0I1NjUsXG4gIEdMX1NSR0I4X0FMUEhBOF9FWFQsXG4gIEdMX1JHQkExNkZfRVhULFxuICBHTF9SR0IxNkZfRVhULFxuICBHTF9SR0JBMzJGX0VYVFxuXVxuXG52YXIgc3RhdHVzQ29kZSA9IHt9XG5zdGF0dXNDb2RlW0dMX0ZSQU1FQlVGRkVSX0NPTVBMRVRFXSA9ICdjb21wbGV0ZSdcbnN0YXR1c0NvZGVbR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9BVFRBQ0hNRU5UXSA9ICdpbmNvbXBsZXRlIGF0dGFjaG1lbnQnXG5zdGF0dXNDb2RlW0dMX0ZSQU1FQlVGRkVSX0lOQ09NUExFVEVfRElNRU5TSU9OU10gPSAnaW5jb21wbGV0ZSBkaW1lbnNpb25zJ1xuc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX01JU1NJTkdfQVRUQUNITUVOVF0gPSAnaW5jb21wbGV0ZSwgbWlzc2luZyBhdHRhY2htZW50J1xuc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9VTlNVUFBPUlRFRF0gPSAndW5zdXBwb3J0ZWQnXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcEZCT1N0YXRlIChcbiAgZ2wsXG4gIGV4dGVuc2lvbnMsXG4gIGxpbWl0cyxcbiAgdGV4dHVyZVN0YXRlLFxuICByZW5kZXJidWZmZXJTdGF0ZSxcbiAgc3RhdHMpIHtcbiAgdmFyIGZyYW1lYnVmZmVyU3RhdGUgPSB7XG4gICAgY3VyOiBudWxsLFxuICAgIG5leHQ6IG51bGwsXG4gICAgZGlydHk6IGZhbHNlLFxuICAgIHNldEZCTzogbnVsbFxuICB9XG5cbiAgdmFyIGNvbG9yVGV4dHVyZUZvcm1hdHMgPSBbJ3JnYmEnXVxuICB2YXIgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzID0gWydyZ2JhNCcsICdyZ2I1NjUnLCAncmdiNSBhMSddXG5cbiAgaWYgKGV4dGVuc2lvbnMuZXh0X3NyZ2IpIHtcbiAgICBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHMucHVzaCgnc3JnYmEnKVxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMuZXh0X2NvbG9yX2J1ZmZlcl9oYWxmX2Zsb2F0KSB7XG4gICAgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzLnB1c2goJ3JnYmExNmYnLCAncmdiMTZmJylcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2NvbG9yX2J1ZmZlcl9mbG9hdCkge1xuICAgIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0cy5wdXNoKCdyZ2JhMzJmJylcbiAgfVxuXG4gIHZhciBjb2xvclR5cGVzID0gWyd1aW50OCddXG4gIGlmIChleHRlbnNpb25zLm9lc190ZXh0dXJlX2hhbGZfZmxvYXQpIHtcbiAgICBjb2xvclR5cGVzLnB1c2goJ2hhbGYgZmxvYXQnLCAnZmxvYXQxNicpXG4gIH1cbiAgaWYgKGV4dGVuc2lvbnMub2VzX3RleHR1cmVfZmxvYXQpIHtcbiAgICBjb2xvclR5cGVzLnB1c2goJ2Zsb2F0JywgJ2Zsb2F0MzInKVxuICB9XG5cbiAgZnVuY3Rpb24gRnJhbWVidWZmZXJBdHRhY2htZW50ICh0YXJnZXQsIHRleHR1cmUsIHJlbmRlcmJ1ZmZlcikge1xuICAgIHRoaXMudGFyZ2V0ID0gdGFyZ2V0XG4gICAgdGhpcy50ZXh0dXJlID0gdGV4dHVyZVxuICAgIHRoaXMucmVuZGVyYnVmZmVyID0gcmVuZGVyYnVmZmVyXG5cbiAgICB2YXIgdyA9IDBcbiAgICB2YXIgaCA9IDBcbiAgICBpZiAodGV4dHVyZSkge1xuICAgICAgdyA9IHRleHR1cmUud2lkdGhcbiAgICAgIGggPSB0ZXh0dXJlLmhlaWdodFxuICAgIH0gZWxzZSBpZiAocmVuZGVyYnVmZmVyKSB7XG4gICAgICB3ID0gcmVuZGVyYnVmZmVyLndpZHRoXG4gICAgICBoID0gcmVuZGVyYnVmZmVyLmhlaWdodFxuICAgIH1cbiAgICB0aGlzLndpZHRoID0gd1xuICAgIHRoaXMuaGVpZ2h0ID0gaFxuICB9XG5cbiAgZnVuY3Rpb24gZGVjUmVmIChhdHRhY2htZW50KSB7XG4gICAgaWYgKGF0dGFjaG1lbnQpIHtcbiAgICAgIGlmIChhdHRhY2htZW50LnRleHR1cmUpIHtcbiAgICAgICAgYXR0YWNobWVudC50ZXh0dXJlLl90ZXh0dXJlLmRlY1JlZigpXG4gICAgICB9XG4gICAgICBpZiAoYXR0YWNobWVudC5yZW5kZXJidWZmZXIpIHtcbiAgICAgICAgYXR0YWNobWVudC5yZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlci5kZWNSZWYoKVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGluY1JlZkFuZENoZWNrU2hhcGUgKGF0dGFjaG1lbnQsIHdpZHRoLCBoZWlnaHQpIHtcbiAgICBpZiAoIWF0dGFjaG1lbnQpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBpZiAoYXR0YWNobWVudC50ZXh0dXJlKSB7XG4gICAgICB2YXIgdGV4dHVyZSA9IGF0dGFjaG1lbnQudGV4dHVyZS5fdGV4dHVyZVxuICAgICAgdmFyIHR3ID0gTWF0aC5tYXgoMSwgdGV4dHVyZS53aWR0aClcbiAgICAgIHZhciB0aCA9IE1hdGgubWF4KDEsIHRleHR1cmUuaGVpZ2h0KVxuICAgICAgY2hlY2sodHcgPT09IHdpZHRoICYmIHRoID09PSBoZWlnaHQsXG4gICAgICAgICdpbmNvbnNpc3RlbnQgd2lkdGgvaGVpZ2h0IGZvciBzdXBwbGllZCB0ZXh0dXJlJylcbiAgICAgIHRleHR1cmUucmVmQ291bnQgKz0gMVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgcmVuZGVyYnVmZmVyID0gYXR0YWNobWVudC5yZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlclxuICAgICAgY2hlY2soXG4gICAgICAgIHJlbmRlcmJ1ZmZlci53aWR0aCA9PT0gd2lkdGggJiYgcmVuZGVyYnVmZmVyLmhlaWdodCA9PT0gaGVpZ2h0LFxuICAgICAgICAnaW5jb25zaXN0ZW50IHdpZHRoL2hlaWdodCBmb3IgcmVuZGVyYnVmZmVyJylcbiAgICAgIHJlbmRlcmJ1ZmZlci5yZWZDb3VudCArPSAxXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gYXR0YWNoIChsb2NhdGlvbiwgYXR0YWNobWVudCkge1xuICAgIGlmIChhdHRhY2htZW50KSB7XG4gICAgICBpZiAoYXR0YWNobWVudC50ZXh0dXJlKSB7XG4gICAgICAgIGdsLmZyYW1lYnVmZmVyVGV4dHVyZTJEKFxuICAgICAgICAgIEdMX0ZSQU1FQlVGRkVSLFxuICAgICAgICAgIGxvY2F0aW9uLFxuICAgICAgICAgIGF0dGFjaG1lbnQudGFyZ2V0LFxuICAgICAgICAgIGF0dGFjaG1lbnQudGV4dHVyZS5fdGV4dHVyZS50ZXh0dXJlLFxuICAgICAgICAgIDApXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBnbC5mcmFtZWJ1ZmZlclJlbmRlcmJ1ZmZlcihcbiAgICAgICAgICBHTF9GUkFNRUJVRkZFUixcbiAgICAgICAgICBsb2NhdGlvbixcbiAgICAgICAgICBHTF9SRU5ERVJCVUZGRVIsXG4gICAgICAgICAgYXR0YWNobWVudC5yZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlci5yZW5kZXJidWZmZXIpXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VBdHRhY2htZW50IChhdHRhY2htZW50KSB7XG4gICAgdmFyIHRhcmdldCA9IEdMX1RFWFRVUkVfMkRcbiAgICB2YXIgdGV4dHVyZSA9IG51bGxcbiAgICB2YXIgcmVuZGVyYnVmZmVyID0gbnVsbFxuXG4gICAgdmFyIGRhdGEgPSBhdHRhY2htZW50XG4gICAgaWYgKHR5cGVvZiBhdHRhY2htZW50ID09PSAnb2JqZWN0Jykge1xuICAgICAgZGF0YSA9IGF0dGFjaG1lbnQuZGF0YVxuICAgICAgaWYgKCd0YXJnZXQnIGluIGF0dGFjaG1lbnQpIHtcbiAgICAgICAgdGFyZ2V0ID0gYXR0YWNobWVudC50YXJnZXQgfCAwXG4gICAgICB9XG4gICAgfVxuXG4gICAgY2hlY2sudHlwZShkYXRhLCAnZnVuY3Rpb24nLCAnaW52YWxpZCBhdHRhY2htZW50IGRhdGEnKVxuXG4gICAgdmFyIHR5cGUgPSBkYXRhLl9yZWdsVHlwZVxuICAgIGlmICh0eXBlID09PSAndGV4dHVyZTJkJykge1xuICAgICAgdGV4dHVyZSA9IGRhdGFcbiAgICAgIGNoZWNrKHRhcmdldCA9PT0gR0xfVEVYVFVSRV8yRClcbiAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICd0ZXh0dXJlQ3ViZScpIHtcbiAgICAgIHRleHR1cmUgPSBkYXRhXG4gICAgICBjaGVjayhcbiAgICAgICAgdGFyZ2V0ID49IEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCAmJlxuICAgICAgICB0YXJnZXQgPCBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1ggKyA2LFxuICAgICAgICAnaW52YWxpZCBjdWJlIG1hcCB0YXJnZXQnKVxuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3JlbmRlcmJ1ZmZlcicpIHtcbiAgICAgIHJlbmRlcmJ1ZmZlciA9IGRhdGFcbiAgICAgIHRhcmdldCA9IEdMX1JFTkRFUkJVRkZFUlxuICAgIH0gZWxzZSB7XG4gICAgICBjaGVjay5yYWlzZSgnaW52YWxpZCByZWdsIG9iamVjdCBmb3IgYXR0YWNobWVudCcpXG4gICAgfVxuXG4gICAgcmV0dXJuIG5ldyBGcmFtZWJ1ZmZlckF0dGFjaG1lbnQodGFyZ2V0LCB0ZXh0dXJlLCByZW5kZXJidWZmZXIpXG4gIH1cblxuICBmdW5jdGlvbiBhbGxvY0F0dGFjaG1lbnQgKFxuICAgIHdpZHRoLFxuICAgIGhlaWdodCxcbiAgICBpc1RleHR1cmUsXG4gICAgZm9ybWF0LFxuICAgIHR5cGUpIHtcbiAgICBpZiAoaXNUZXh0dXJlKSB7XG4gICAgICB2YXIgdGV4dHVyZSA9IHRleHR1cmVTdGF0ZS5jcmVhdGUyRCh7XG4gICAgICAgIHdpZHRoOiB3aWR0aCxcbiAgICAgICAgaGVpZ2h0OiBoZWlnaHQsXG4gICAgICAgIGZvcm1hdDogZm9ybWF0LFxuICAgICAgICB0eXBlOiB0eXBlXG4gICAgICB9KVxuICAgICAgdGV4dHVyZS5fdGV4dHVyZS5yZWZDb3VudCA9IDBcbiAgICAgIHJldHVybiBuZXcgRnJhbWVidWZmZXJBdHRhY2htZW50KEdMX1RFWFRVUkVfMkQsIHRleHR1cmUsIG51bGwpXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciByYiA9IHJlbmRlcmJ1ZmZlclN0YXRlLmNyZWF0ZSh7XG4gICAgICAgIHdpZHRoOiB3aWR0aCxcbiAgICAgICAgaGVpZ2h0OiBoZWlnaHQsXG4gICAgICAgIGZvcm1hdDogZm9ybWF0XG4gICAgICB9KVxuICAgICAgcmIuX3JlbmRlcmJ1ZmZlci5yZWZDb3VudCA9IDBcbiAgICAgIHJldHVybiBuZXcgRnJhbWVidWZmZXJBdHRhY2htZW50KEdMX1JFTkRFUkJVRkZFUiwgbnVsbCwgcmIpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gdW53cmFwQXR0YWNobWVudCAoYXR0YWNobWVudCkge1xuICAgIHJldHVybiBhdHRhY2htZW50ICYmIChhdHRhY2htZW50LnRleHR1cmUgfHwgYXR0YWNobWVudC5yZW5kZXJidWZmZXIpXG4gIH1cblxuICBmdW5jdGlvbiByZXNpemVBdHRhY2htZW50IChhdHRhY2htZW50LCB3LCBoKSB7XG4gICAgaWYgKGF0dGFjaG1lbnQpIHtcbiAgICAgIGlmIChhdHRhY2htZW50LnRleHR1cmUpIHtcbiAgICAgICAgYXR0YWNobWVudC50ZXh0dXJlLnJlc2l6ZSh3LCBoKVxuICAgICAgfSBlbHNlIGlmIChhdHRhY2htZW50LnJlbmRlcmJ1ZmZlcikge1xuICAgICAgICBhdHRhY2htZW50LnJlbmRlcmJ1ZmZlci5yZXNpemUodywgaClcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICB2YXIgZnJhbWVidWZmZXJDb3VudCA9IDBcbiAgdmFyIGZyYW1lYnVmZmVyU2V0ID0ge31cblxuICBmdW5jdGlvbiBSRUdMRnJhbWVidWZmZXIgKCkge1xuICAgIHRoaXMuaWQgPSBmcmFtZWJ1ZmZlckNvdW50KytcbiAgICBmcmFtZWJ1ZmZlclNldFt0aGlzLmlkXSA9IHRoaXNcblxuICAgIHRoaXMuZnJhbWVidWZmZXIgPSBnbC5jcmVhdGVGcmFtZWJ1ZmZlcigpXG4gICAgdGhpcy53aWR0aCA9IDBcbiAgICB0aGlzLmhlaWdodCA9IDBcblxuICAgIHRoaXMuY29sb3JBdHRhY2htZW50cyA9IFtdXG4gICAgdGhpcy5kZXB0aEF0dGFjaG1lbnQgPSBudWxsXG4gICAgdGhpcy5zdGVuY2lsQXR0YWNobWVudCA9IG51bGxcbiAgICB0aGlzLmRlcHRoU3RlbmNpbEF0dGFjaG1lbnQgPSBudWxsXG4gIH1cblxuICBmdW5jdGlvbiBkZWNGQk9SZWZzIChmcmFtZWJ1ZmZlcikge1xuICAgIGZyYW1lYnVmZmVyLmNvbG9yQXR0YWNobWVudHMuZm9yRWFjaChkZWNSZWYpXG4gICAgZGVjUmVmKGZyYW1lYnVmZmVyLmRlcHRoQXR0YWNobWVudClcbiAgICBkZWNSZWYoZnJhbWVidWZmZXIuc3RlbmNpbEF0dGFjaG1lbnQpXG4gICAgZGVjUmVmKGZyYW1lYnVmZmVyLmRlcHRoU3RlbmNpbEF0dGFjaG1lbnQpXG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95IChmcmFtZWJ1ZmZlcikge1xuICAgIHZhciBoYW5kbGUgPSBmcmFtZWJ1ZmZlci5mcmFtZWJ1ZmZlclxuICAgIGNoZWNrKGhhbmRsZSwgJ211c3Qgbm90IGRvdWJsZSBkZXN0cm95IGZyYW1lYnVmZmVyJylcbiAgICBnbC5kZWxldGVGcmFtZWJ1ZmZlcihoYW5kbGUpXG4gICAgZnJhbWVidWZmZXIuZnJhbWVidWZmZXIgPSBudWxsXG4gICAgc3RhdHMuZnJhbWVidWZmZXJDb3VudC0tXG4gICAgZGVsZXRlIGZyYW1lYnVmZmVyU2V0W2ZyYW1lYnVmZmVyLmlkXVxuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlRnJhbWVidWZmZXIgKGZyYW1lYnVmZmVyKSB7XG4gICAgdmFyIGlcblxuICAgIGdsLmJpbmRGcmFtZWJ1ZmZlcihHTF9GUkFNRUJVRkZFUiwgZnJhbWVidWZmZXIuZnJhbWVidWZmZXIpXG4gICAgdmFyIGNvbG9yQXR0YWNobWVudHMgPSBmcmFtZWJ1ZmZlci5jb2xvckF0dGFjaG1lbnRzXG4gICAgZm9yIChpID0gMDsgaSA8IGNvbG9yQXR0YWNobWVudHMubGVuZ3RoOyArK2kpIHtcbiAgICAgIGF0dGFjaChHTF9DT0xPUl9BVFRBQ0hNRU5UMCArIGksIGNvbG9yQXR0YWNobWVudHNbaV0pXG4gICAgfVxuICAgIGZvciAoaSA9IGNvbG9yQXR0YWNobWVudHMubGVuZ3RoOyBpIDwgbGltaXRzLm1heENvbG9yQXR0YWNobWVudHM7ICsraSkge1xuICAgICAgZ2wuZnJhbWVidWZmZXJUZXh0dXJlMkQoXG4gICAgICAgIEdMX0ZSQU1FQlVGRkVSLFxuICAgICAgICBHTF9DT0xPUl9BVFRBQ0hNRU5UMCArIGksXG4gICAgICAgIEdMX1RFWFRVUkVfMkQsXG4gICAgICAgIG51bGwsXG4gICAgICAgIDApXG4gICAgfVxuXG4gICAgZ2wuZnJhbWVidWZmZXJUZXh0dXJlMkQoXG4gICAgICBHTF9GUkFNRUJVRkZFUixcbiAgICAgIEdMX0RFUFRIX1NURU5DSUxfQVRUQUNITUVOVCxcbiAgICAgIEdMX1RFWFRVUkVfMkQsXG4gICAgICBudWxsLFxuICAgICAgMClcbiAgICBnbC5mcmFtZWJ1ZmZlclRleHR1cmUyRChcbiAgICAgIEdMX0ZSQU1FQlVGRkVSLFxuICAgICAgR0xfREVQVEhfQVRUQUNITUVOVCxcbiAgICAgIEdMX1RFWFRVUkVfMkQsXG4gICAgICBudWxsLFxuICAgICAgMClcbiAgICBnbC5mcmFtZWJ1ZmZlclRleHR1cmUyRChcbiAgICAgIEdMX0ZSQU1FQlVGRkVSLFxuICAgICAgR0xfU1RFTkNJTF9BVFRBQ0hNRU5ULFxuICAgICAgR0xfVEVYVFVSRV8yRCxcbiAgICAgIG51bGwsXG4gICAgICAwKVxuXG4gICAgYXR0YWNoKEdMX0RFUFRIX0FUVEFDSE1FTlQsIGZyYW1lYnVmZmVyLmRlcHRoQXR0YWNobWVudClcbiAgICBhdHRhY2goR0xfU1RFTkNJTF9BVFRBQ0hNRU5ULCBmcmFtZWJ1ZmZlci5zdGVuY2lsQXR0YWNobWVudClcbiAgICBhdHRhY2goR0xfREVQVEhfU1RFTkNJTF9BVFRBQ0hNRU5ULCBmcmFtZWJ1ZmZlci5kZXB0aFN0ZW5jaWxBdHRhY2htZW50KVxuXG4gICAgLy8gQ2hlY2sgc3RhdHVzIGNvZGVcbiAgICB2YXIgc3RhdHVzID0gZ2wuY2hlY2tGcmFtZWJ1ZmZlclN0YXR1cyhHTF9GUkFNRUJVRkZFUilcbiAgICBpZiAoc3RhdHVzICE9PSBHTF9GUkFNRUJVRkZFUl9DT01QTEVURSkge1xuICAgICAgY2hlY2sucmFpc2UoJ2ZyYW1lYnVmZmVyIGNvbmZpZ3VyYXRpb24gbm90IHN1cHBvcnRlZCwgc3RhdHVzID0gJyArXG4gICAgICAgIHN0YXR1c0NvZGVbc3RhdHVzXSlcbiAgICB9XG5cbiAgICBnbC5iaW5kRnJhbWVidWZmZXIoR0xfRlJBTUVCVUZGRVIsIGZyYW1lYnVmZmVyU3RhdGUubmV4dClcbiAgICBmcmFtZWJ1ZmZlclN0YXRlLmN1ciA9IGZyYW1lYnVmZmVyU3RhdGUubmV4dFxuXG4gICAgLy8gRklYTUU6IENsZWFyIGVycm9yIGNvZGUgaGVyZS4gIFRoaXMgaXMgYSB3b3JrIGFyb3VuZCBmb3IgYSBidWcgaW5cbiAgICAvLyBoZWFkbGVzcy1nbFxuICAgIGdsLmdldEVycm9yKClcbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZUZCTyAoYTAsIGExKSB7XG4gICAgdmFyIGZyYW1lYnVmZmVyID0gbmV3IFJFR0xGcmFtZWJ1ZmZlcigpXG4gICAgc3RhdHMuZnJhbWVidWZmZXJDb3VudCsrXG5cbiAgICBmdW5jdGlvbiByZWdsRnJhbWVidWZmZXIgKGEsIGIpIHtcbiAgICAgIHZhciBpXG5cbiAgICAgIGNoZWNrKGZyYW1lYnVmZmVyU3RhdGUubmV4dCAhPT0gZnJhbWVidWZmZXIsXG4gICAgICAgICdjYW4gbm90IHVwZGF0ZSBmcmFtZWJ1ZmZlciB3aGljaCBpcyBjdXJyZW50bHkgaW4gdXNlJylcblxuICAgICAgdmFyIGV4dERyYXdCdWZmZXJzID0gZXh0ZW5zaW9ucy53ZWJnbF9kcmF3X2J1ZmZlcnNcblxuICAgICAgdmFyIHdpZHRoID0gMFxuICAgICAgdmFyIGhlaWdodCA9IDBcblxuICAgICAgdmFyIG5lZWRzRGVwdGggPSB0cnVlXG4gICAgICB2YXIgbmVlZHNTdGVuY2lsID0gdHJ1ZVxuXG4gICAgICB2YXIgY29sb3JCdWZmZXIgPSBudWxsXG4gICAgICB2YXIgY29sb3JUZXh0dXJlID0gdHJ1ZVxuICAgICAgdmFyIGNvbG9yRm9ybWF0ID0gJ3JnYmEnXG4gICAgICB2YXIgY29sb3JUeXBlID0gJ3VpbnQ4J1xuICAgICAgdmFyIGNvbG9yQ291bnQgPSAxXG5cbiAgICAgIHZhciBkZXB0aEJ1ZmZlciA9IG51bGxcbiAgICAgIHZhciBzdGVuY2lsQnVmZmVyID0gbnVsbFxuICAgICAgdmFyIGRlcHRoU3RlbmNpbEJ1ZmZlciA9IG51bGxcbiAgICAgIHZhciBkZXB0aFN0ZW5jaWxUZXh0dXJlID0gZmFsc2VcblxuICAgICAgaWYgKHR5cGVvZiBhID09PSAnbnVtYmVyJykge1xuICAgICAgICB3aWR0aCA9IGEgfCAwXG4gICAgICAgIGhlaWdodCA9IChiIHwgMCkgfHwgd2lkdGhcbiAgICAgIH0gZWxzZSBpZiAoIWEpIHtcbiAgICAgICAgd2lkdGggPSBoZWlnaHQgPSAxXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjaGVjay50eXBlKGEsICdvYmplY3QnLCAnaW52YWxpZCBhcmd1bWVudHMgZm9yIGZyYW1lYnVmZmVyJylcbiAgICAgICAgdmFyIG9wdGlvbnMgPSBhXG5cbiAgICAgICAgaWYgKCdzaGFwZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHZhciBzaGFwZSA9IG9wdGlvbnMuc2hhcGVcbiAgICAgICAgICBjaGVjayhBcnJheS5pc0FycmF5KHNoYXBlKSAmJiBzaGFwZS5sZW5ndGggPj0gMixcbiAgICAgICAgICAgICdpbnZhbGlkIHNoYXBlIGZvciBmcmFtZWJ1ZmZlcicpXG4gICAgICAgICAgd2lkdGggPSBzaGFwZVswXVxuICAgICAgICAgIGhlaWdodCA9IHNoYXBlWzFdXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWYgKCdyYWRpdXMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIHdpZHRoID0gaGVpZ2h0ID0gb3B0aW9ucy5yYWRpdXNcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCd3aWR0aCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgd2lkdGggPSBvcHRpb25zLndpZHRoXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgnaGVpZ2h0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBoZWlnaHQgPSBvcHRpb25zLmhlaWdodFxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnY29sb3InIGluIG9wdGlvbnMgfHxcbiAgICAgICAgICAgICdjb2xvcnMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBjb2xvckJ1ZmZlciA9XG4gICAgICAgICAgICBvcHRpb25zLmNvbG9yIHx8XG4gICAgICAgICAgICBvcHRpb25zLmNvbG9yc1xuICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KGNvbG9yQnVmZmVyKSkge1xuICAgICAgICAgICAgY2hlY2soXG4gICAgICAgICAgICAgIGNvbG9yQnVmZmVyLmxlbmd0aCA9PT0gMSB8fCBleHREcmF3QnVmZmVycyxcbiAgICAgICAgICAgICAgJ211bHRpcGxlIHJlbmRlciB0YXJnZXRzIG5vdCBzdXBwb3J0ZWQnKVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghY29sb3JCdWZmZXIpIHtcbiAgICAgICAgICBpZiAoJ2NvbG9yQ291bnQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGNvbG9yQ291bnQgPSBvcHRpb25zLmNvbG9yQ291bnQgfCAwXG4gICAgICAgICAgICBjaGVjayhjb2xvckNvdW50ID4gMCwgJ2ludmFsaWQgY29sb3IgYnVmZmVyIGNvdW50JylcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoJ2NvbG9yVGV4dHVyZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgY29sb3JUZXh0dXJlID0gISFvcHRpb25zLmNvbG9yVGV4dHVyZVxuICAgICAgICAgICAgY29sb3JGb3JtYXQgPSAncmdiYTQnXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKCdjb2xvclR5cGUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGNvbG9yVHlwZSA9IG9wdGlvbnMuY29sb3JUeXBlXG4gICAgICAgICAgICBpZiAoIWNvbG9yVGV4dHVyZSkge1xuICAgICAgICAgICAgICBpZiAoY29sb3JUeXBlID09PSAnaGFsZiBmbG9hdCcgfHwgY29sb3JUeXBlID09PSAnZmxvYXQxNicpIHtcbiAgICAgICAgICAgICAgICBjaGVjayhleHRlbnNpb25zLmV4dF9jb2xvcl9idWZmZXJfaGFsZl9mbG9hdCxcbiAgICAgICAgICAgICAgICAgICd5b3UgbXVzdCBlbmFibGUgRVhUX2NvbG9yX2J1ZmZlcl9oYWxmX2Zsb2F0IHRvIHVzZSAxNi1iaXQgcmVuZGVyIGJ1ZmZlcnMnKVxuICAgICAgICAgICAgICAgIGNvbG9yRm9ybWF0ID0gJ3JnYmExNmYnXG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAoY29sb3JUeXBlID09PSAnZmxvYXQnIHx8IGNvbG9yVHlwZSA9PT0gJ2Zsb2F0MzInKSB7XG4gICAgICAgICAgICAgICAgY2hlY2soZXh0ZW5zaW9ucy53ZWJnbF9jb2xvcl9idWZmZXJfZmxvYXQsXG4gICAgICAgICAgICAgICAgICAneW91IG11c3QgZW5hYmxlIFdFQkdMX2NvbG9yX2J1ZmZlcl9mbG9hdCBpbiBvcmRlciB0byB1c2UgMzItYml0IGZsb2F0aW5nIHBvaW50IHJlbmRlcmJ1ZmZlcnMnKVxuICAgICAgICAgICAgICAgIGNvbG9yRm9ybWF0ID0gJ3JnYmEzMmYnXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGNoZWNrKGV4dGVuc2lvbnMub2VzX3RleHR1cmVfZmxvYXQgfHxcbiAgICAgICAgICAgICAgICAhKGNvbG9yVHlwZSA9PT0gJ2Zsb2F0JyB8fCBjb2xvclR5cGUgPT09ICdmbG9hdDMyJyksXG4gICAgICAgICAgICAgICAgJ3lvdSBtdXN0IGVuYWJsZSBPRVNfdGV4dHVyZV9mbG9hdCBpbiBvcmRlciB0byB1c2UgZmxvYXRpbmcgcG9pbnQgZnJhbWVidWZmZXIgb2JqZWN0cycpXG4gICAgICAgICAgICAgIGNoZWNrKGV4dGVuc2lvbnMub2VzX3RleHR1cmVfaGFsZl9mbG9hdCB8fFxuICAgICAgICAgICAgICAgICEoY29sb3JUeXBlID09PSAnaGFsZiBmbG9hdCcgfHwgY29sb3JUeXBlID09PSAnZmxvYXQxNicpLFxuICAgICAgICAgICAgICAgICd5b3UgbXVzdCBlbmFibGUgT0VTX3RleHR1cmVfaGFsZl9mbG9hdCBpbiBvcmRlciB0byB1c2UgMTYtYml0IGZsb2F0aW5nIHBvaW50IGZyYW1lYnVmZmVyIG9iamVjdHMnKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2hlY2sub25lT2YoY29sb3JUeXBlLCBjb2xvclR5cGVzLCAnaW52YWxpZCBjb2xvciB0eXBlJylcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoJ2NvbG9yRm9ybWF0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBjb2xvckZvcm1hdCA9IG9wdGlvbnMuY29sb3JGb3JtYXRcbiAgICAgICAgICAgIGlmIChjb2xvclRleHR1cmVGb3JtYXRzLmluZGV4T2YoY29sb3JGb3JtYXQpID49IDApIHtcbiAgICAgICAgICAgICAgY29sb3JUZXh0dXJlID0gdHJ1ZVxuICAgICAgICAgICAgfSBlbHNlIGlmIChjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHMuaW5kZXhPZihjb2xvckZvcm1hdCkgPj0gMCkge1xuICAgICAgICAgICAgICBjb2xvclRleHR1cmUgPSBmYWxzZVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgaWYgKGNvbG9yVGV4dHVyZSkge1xuICAgICAgICAgICAgICAgIGNoZWNrLm9uZU9mKFxuICAgICAgICAgICAgICAgICAgb3B0aW9ucy5jb2xvckZvcm1hdCwgY29sb3JUZXh0dXJlRm9ybWF0cyxcbiAgICAgICAgICAgICAgICAgICdpbnZhbGlkIGNvbG9yIGZvcm1hdCBmb3IgdGV4dHVyZScpXG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY2hlY2sub25lT2YoXG4gICAgICAgICAgICAgICAgICBvcHRpb25zLmNvbG9yRm9ybWF0LCBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHMsXG4gICAgICAgICAgICAgICAgICAnaW52YWxpZCBjb2xvciBmb3JtYXQgZm9yIHJlbmRlcmJ1ZmZlcicpXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ2RlcHRoVGV4dHVyZScgaW4gb3B0aW9ucyB8fCAnZGVwdGhTdGVuY2lsVGV4dHVyZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGRlcHRoU3RlbmNpbFRleHR1cmUgPSAhIShvcHRpb25zLmRlcHRoVGV4dHVyZSB8fFxuICAgICAgICAgICAgb3B0aW9ucy5kZXB0aFN0ZW5jaWxUZXh0dXJlKVxuICAgICAgICAgIGNoZWNrKCFkZXB0aFN0ZW5jaWxUZXh0dXJlIHx8IGV4dGVuc2lvbnMud2ViZ2xfZGVwdGhfdGV4dHVyZSxcbiAgICAgICAgICAgICd3ZWJnbF9kZXB0aF90ZXh0dXJlIGV4dGVuc2lvbiBub3Qgc3VwcG9ydGVkJylcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnZGVwdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBpZiAodHlwZW9mIG9wdGlvbnMuZGVwdGggPT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgbmVlZHNEZXB0aCA9IG9wdGlvbnMuZGVwdGhcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZGVwdGhCdWZmZXIgPSBvcHRpb25zLmRlcHRoXG4gICAgICAgICAgICBuZWVkc1N0ZW5jaWwgPSBmYWxzZVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnc3RlbmNpbCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5zdGVuY2lsID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgIG5lZWRzU3RlbmNpbCA9IG9wdGlvbnMuc3RlbmNpbFxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzdGVuY2lsQnVmZmVyID0gb3B0aW9ucy5zdGVuY2lsXG4gICAgICAgICAgICBuZWVkc0RlcHRoID0gZmFsc2VcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ2RlcHRoU3RlbmNpbCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5kZXB0aFN0ZW5jaWwgPT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgbmVlZHNEZXB0aCA9IG5lZWRzU3RlbmNpbCA9IG9wdGlvbnMuZGVwdGhTdGVuY2lsXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGRlcHRoU3RlbmNpbEJ1ZmZlciA9IG9wdGlvbnMuZGVwdGhTdGVuY2lsXG4gICAgICAgICAgICBuZWVkc0RlcHRoID0gZmFsc2VcbiAgICAgICAgICAgIG5lZWRzU3RlbmNpbCA9IGZhbHNlXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIHBhcnNlIGF0dGFjaG1lbnRzXG4gICAgICB2YXIgY29sb3JBdHRhY2htZW50cyA9IG51bGxcbiAgICAgIHZhciBkZXB0aEF0dGFjaG1lbnQgPSBudWxsXG4gICAgICB2YXIgc3RlbmNpbEF0dGFjaG1lbnQgPSBudWxsXG4gICAgICB2YXIgZGVwdGhTdGVuY2lsQXR0YWNobWVudCA9IG51bGxcblxuICAgICAgLy8gU2V0IHVwIGNvbG9yIGF0dGFjaG1lbnRzXG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShjb2xvckJ1ZmZlcikpIHtcbiAgICAgICAgY29sb3JBdHRhY2htZW50cyA9IGNvbG9yQnVmZmVyLm1hcChwYXJzZUF0dGFjaG1lbnQpXG4gICAgICB9IGVsc2UgaWYgKGNvbG9yQnVmZmVyKSB7XG4gICAgICAgIGNvbG9yQXR0YWNobWVudHMgPSBbcGFyc2VBdHRhY2htZW50KGNvbG9yQnVmZmVyKV1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbG9yQXR0YWNobWVudHMgPSBuZXcgQXJyYXkoY29sb3JDb3VudClcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGNvbG9yQ291bnQ7ICsraSkge1xuICAgICAgICAgIGNvbG9yQXR0YWNobWVudHNbaV0gPSBhbGxvY0F0dGFjaG1lbnQoXG4gICAgICAgICAgICB3aWR0aCxcbiAgICAgICAgICAgIGhlaWdodCxcbiAgICAgICAgICAgIGNvbG9yVGV4dHVyZSxcbiAgICAgICAgICAgIGNvbG9yRm9ybWF0LFxuICAgICAgICAgICAgY29sb3JUeXBlKVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNoZWNrKGV4dGVuc2lvbnMud2ViZ2xfZHJhd19idWZmZXJzIHx8IGNvbG9yQXR0YWNobWVudHMubGVuZ3RoIDw9IDEsXG4gICAgICAgICd5b3UgbXVzdCBlbmFibGUgdGhlIFdFQkdMX2RyYXdfYnVmZmVycyBleHRlbnNpb24gaW4gb3JkZXIgdG8gdXNlIG11bHRpcGxlIGNvbG9yIGJ1ZmZlcnMuJylcbiAgICAgIGNoZWNrKGNvbG9yQXR0YWNobWVudHMubGVuZ3RoIDw9IGxpbWl0cy5tYXhDb2xvckF0dGFjaG1lbnRzLFxuICAgICAgICAndG9vIG1hbnkgY29sb3IgYXR0YWNobWVudHMsIG5vdCBzdXBwb3J0ZWQnKVxuXG4gICAgICB3aWR0aCA9IHdpZHRoIHx8IGNvbG9yQXR0YWNobWVudHNbMF0ud2lkdGhcbiAgICAgIGhlaWdodCA9IGhlaWdodCB8fCBjb2xvckF0dGFjaG1lbnRzWzBdLmhlaWdodFxuXG4gICAgICBpZiAoZGVwdGhCdWZmZXIpIHtcbiAgICAgICAgZGVwdGhBdHRhY2htZW50ID0gcGFyc2VBdHRhY2htZW50KGRlcHRoQnVmZmVyKVxuICAgICAgfSBlbHNlIGlmIChuZWVkc0RlcHRoICYmICFuZWVkc1N0ZW5jaWwpIHtcbiAgICAgICAgZGVwdGhBdHRhY2htZW50ID0gYWxsb2NBdHRhY2htZW50KFxuICAgICAgICAgIHdpZHRoLFxuICAgICAgICAgIGhlaWdodCxcbiAgICAgICAgICBkZXB0aFN0ZW5jaWxUZXh0dXJlLFxuICAgICAgICAgICdkZXB0aCcsXG4gICAgICAgICAgJ3VpbnQzMicpXG4gICAgICB9XG5cbiAgICAgIGlmIChzdGVuY2lsQnVmZmVyKSB7XG4gICAgICAgIHN0ZW5jaWxBdHRhY2htZW50ID0gcGFyc2VBdHRhY2htZW50KHN0ZW5jaWxCdWZmZXIpXG4gICAgICB9IGVsc2UgaWYgKG5lZWRzU3RlbmNpbCAmJiAhbmVlZHNEZXB0aCkge1xuICAgICAgICBzdGVuY2lsQXR0YWNobWVudCA9IGFsbG9jQXR0YWNobWVudChcbiAgICAgICAgICB3aWR0aCxcbiAgICAgICAgICBoZWlnaHQsXG4gICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgJ3N0ZW5jaWwnLFxuICAgICAgICAgICd1aW50OCcpXG4gICAgICB9XG5cbiAgICAgIGlmIChkZXB0aFN0ZW5jaWxCdWZmZXIpIHtcbiAgICAgICAgZGVwdGhTdGVuY2lsQXR0YWNobWVudCA9IHBhcnNlQXR0YWNobWVudChkZXB0aFN0ZW5jaWxCdWZmZXIpXG4gICAgICB9IGVsc2UgaWYgKCFkZXB0aEJ1ZmZlciAmJiAhc3RlbmNpbEJ1ZmZlciAmJiBuZWVkc1N0ZW5jaWwgJiYgbmVlZHNEZXB0aCkge1xuICAgICAgICBkZXB0aFN0ZW5jaWxBdHRhY2htZW50ID0gYWxsb2NBdHRhY2htZW50KFxuICAgICAgICAgIHdpZHRoLFxuICAgICAgICAgIGhlaWdodCxcbiAgICAgICAgICBkZXB0aFN0ZW5jaWxUZXh0dXJlLFxuICAgICAgICAgICdkZXB0aCBzdGVuY2lsJyxcbiAgICAgICAgICAnZGVwdGggc3RlbmNpbCcpXG4gICAgICB9XG5cbiAgICAgIGNoZWNrKFxuICAgICAgICAoISFkZXB0aEJ1ZmZlcikgKyAoISFzdGVuY2lsQnVmZmVyKSArICghIWRlcHRoU3RlbmNpbEJ1ZmZlcikgPD0gMSxcbiAgICAgICAgJ2ludmFsaWQgZnJhbWVidWZmZXIgY29uZmlndXJhdGlvbiwgY2FuIHNwZWNpZnkgZXhhY3RseSBvbmUgZGVwdGgvc3RlbmNpbCBhdHRhY2htZW50JylcblxuICAgICAgdmFyIGNvbW1vbkNvbG9yQXR0YWNobWVudFNpemUgPSBudWxsXG5cbiAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xvckF0dGFjaG1lbnRzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgIGluY1JlZkFuZENoZWNrU2hhcGUoY29sb3JBdHRhY2htZW50c1tpXSwgd2lkdGgsIGhlaWdodClcbiAgICAgICAgY2hlY2soIWNvbG9yQXR0YWNobWVudHNbaV0gfHxcbiAgICAgICAgICAoY29sb3JBdHRhY2htZW50c1tpXS50ZXh0dXJlICYmXG4gICAgICAgICAgICBjb2xvclRleHR1cmVGb3JtYXRFbnVtcy5pbmRleE9mKGNvbG9yQXR0YWNobWVudHNbaV0udGV4dHVyZS5fdGV4dHVyZS5mb3JtYXQpID49IDApIHx8XG4gICAgICAgICAgKGNvbG9yQXR0YWNobWVudHNbaV0ucmVuZGVyYnVmZmVyICYmXG4gICAgICAgICAgICBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdEVudW1zLmluZGV4T2YoY29sb3JBdHRhY2htZW50c1tpXS5yZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlci5mb3JtYXQpID49IDApLFxuICAgICAgICAgICdmcmFtZWJ1ZmZlciBjb2xvciBhdHRhY2htZW50ICcgKyBpICsgJyBpcyBpbnZhbGlkJylcblxuICAgICAgICBpZiAoY29sb3JBdHRhY2htZW50c1tpXSAmJiBjb2xvckF0dGFjaG1lbnRzW2ldLnRleHR1cmUpIHtcbiAgICAgICAgICB2YXIgY29sb3JBdHRhY2htZW50U2l6ZSA9XG4gICAgICAgICAgICAgIHRleHR1cmVGb3JtYXRDaGFubmVsc1tjb2xvckF0dGFjaG1lbnRzW2ldLnRleHR1cmUuX3RleHR1cmUuZm9ybWF0XSAqXG4gICAgICAgICAgICAgIHRleHR1cmVUeXBlU2l6ZXNbY29sb3JBdHRhY2htZW50c1tpXS50ZXh0dXJlLl90ZXh0dXJlLnR5cGVdXG5cbiAgICAgICAgICBpZiAoY29tbW9uQ29sb3JBdHRhY2htZW50U2l6ZSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgY29tbW9uQ29sb3JBdHRhY2htZW50U2l6ZSA9IGNvbG9yQXR0YWNobWVudFNpemVcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gV2UgbmVlZCB0byBtYWtlIHN1cmUgdGhhdCBhbGwgY29sb3IgYXR0YWNobWVudHMgaGF2ZSB0aGUgc2FtZSBudW1iZXIgb2YgYml0cGxhbmVzXG4gICAgICAgICAgICAvLyAodGhhdCBpcywgdGhlIHNhbWUgbnVtZXIgb2YgYml0cyBwZXIgcGl4ZWwpXG4gICAgICAgICAgICAvLyBUaGlzIGlzIHJlcXVpcmVkIGJ5IHRoZSBHTEVTMi4wIHN0YW5kYXJkLiBTZWUgdGhlIGJlZ2lubmluZyBvZiBDaGFwdGVyIDQgaW4gdGhhdCBkb2N1bWVudC5cbiAgICAgICAgICAgIGNoZWNrKGNvbW1vbkNvbG9yQXR0YWNobWVudFNpemUgPT09IGNvbG9yQXR0YWNobWVudFNpemUsXG4gICAgICAgICAgICAgICAgICAnYWxsIGNvbG9yIGF0dGFjaG1lbnRzIG11Y2ggaGF2ZSB0aGUgc2FtZSBudW1iZXIgb2YgYml0cyBwZXIgcGl4ZWwuJylcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGluY1JlZkFuZENoZWNrU2hhcGUoZGVwdGhBdHRhY2htZW50LCB3aWR0aCwgaGVpZ2h0KVxuICAgICAgY2hlY2soIWRlcHRoQXR0YWNobWVudCB8fFxuICAgICAgICAoZGVwdGhBdHRhY2htZW50LnRleHR1cmUgJiZcbiAgICAgICAgICBkZXB0aEF0dGFjaG1lbnQudGV4dHVyZS5fdGV4dHVyZS5mb3JtYXQgPT09IEdMX0RFUFRIX0NPTVBPTkVOVCkgfHxcbiAgICAgICAgKGRlcHRoQXR0YWNobWVudC5yZW5kZXJidWZmZXIgJiZcbiAgICAgICAgICBkZXB0aEF0dGFjaG1lbnQucmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXIuZm9ybWF0ID09PSBHTF9ERVBUSF9DT01QT05FTlQxNiksXG4gICAgICAgICdpbnZhbGlkIGRlcHRoIGF0dGFjaG1lbnQgZm9yIGZyYW1lYnVmZmVyIG9iamVjdCcpXG4gICAgICBpbmNSZWZBbmRDaGVja1NoYXBlKHN0ZW5jaWxBdHRhY2htZW50LCB3aWR0aCwgaGVpZ2h0KVxuICAgICAgY2hlY2soIXN0ZW5jaWxBdHRhY2htZW50IHx8XG4gICAgICAgIChzdGVuY2lsQXR0YWNobWVudC5yZW5kZXJidWZmZXIgJiZcbiAgICAgICAgICBzdGVuY2lsQXR0YWNobWVudC5yZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlci5mb3JtYXQgPT09IEdMX1NURU5DSUxfSU5ERVg4KSxcbiAgICAgICAgJ2ludmFsaWQgc3RlbmNpbCBhdHRhY2htZW50IGZvciBmcmFtZWJ1ZmZlciBvYmplY3QnKVxuICAgICAgaW5jUmVmQW5kQ2hlY2tTaGFwZShkZXB0aFN0ZW5jaWxBdHRhY2htZW50LCB3aWR0aCwgaGVpZ2h0KVxuICAgICAgY2hlY2soIWRlcHRoU3RlbmNpbEF0dGFjaG1lbnQgfHxcbiAgICAgICAgKGRlcHRoU3RlbmNpbEF0dGFjaG1lbnQudGV4dHVyZSAmJlxuICAgICAgICAgIGRlcHRoU3RlbmNpbEF0dGFjaG1lbnQudGV4dHVyZS5fdGV4dHVyZS5mb3JtYXQgPT09IEdMX0RFUFRIX1NURU5DSUwpIHx8XG4gICAgICAgIChkZXB0aFN0ZW5jaWxBdHRhY2htZW50LnJlbmRlcmJ1ZmZlciAmJlxuICAgICAgICAgIGRlcHRoU3RlbmNpbEF0dGFjaG1lbnQucmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXIuZm9ybWF0ID09PSBHTF9ERVBUSF9TVEVOQ0lMKSxcbiAgICAgICAgJ2ludmFsaWQgZGVwdGgtc3RlbmNpbCBhdHRhY2htZW50IGZvciBmcmFtZWJ1ZmZlciBvYmplY3QnKVxuXG4gICAgICAvLyBkZWNyZW1lbnQgcmVmZXJlbmNlc1xuICAgICAgZGVjRkJPUmVmcyhmcmFtZWJ1ZmZlcilcblxuICAgICAgZnJhbWVidWZmZXIud2lkdGggPSB3aWR0aFxuICAgICAgZnJhbWVidWZmZXIuaGVpZ2h0ID0gaGVpZ2h0XG5cbiAgICAgIGZyYW1lYnVmZmVyLmNvbG9yQXR0YWNobWVudHMgPSBjb2xvckF0dGFjaG1lbnRzXG4gICAgICBmcmFtZWJ1ZmZlci5kZXB0aEF0dGFjaG1lbnQgPSBkZXB0aEF0dGFjaG1lbnRcbiAgICAgIGZyYW1lYnVmZmVyLnN0ZW5jaWxBdHRhY2htZW50ID0gc3RlbmNpbEF0dGFjaG1lbnRcbiAgICAgIGZyYW1lYnVmZmVyLmRlcHRoU3RlbmNpbEF0dGFjaG1lbnQgPSBkZXB0aFN0ZW5jaWxBdHRhY2htZW50XG5cbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci5jb2xvciA9IGNvbG9yQXR0YWNobWVudHMubWFwKHVud3JhcEF0dGFjaG1lbnQpXG4gICAgICByZWdsRnJhbWVidWZmZXIuZGVwdGggPSB1bndyYXBBdHRhY2htZW50KGRlcHRoQXR0YWNobWVudClcbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci5zdGVuY2lsID0gdW53cmFwQXR0YWNobWVudChzdGVuY2lsQXR0YWNobWVudClcbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci5kZXB0aFN0ZW5jaWwgPSB1bndyYXBBdHRhY2htZW50KGRlcHRoU3RlbmNpbEF0dGFjaG1lbnQpXG5cbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci53aWR0aCA9IGZyYW1lYnVmZmVyLndpZHRoXG4gICAgICByZWdsRnJhbWVidWZmZXIuaGVpZ2h0ID0gZnJhbWVidWZmZXIuaGVpZ2h0XG5cbiAgICAgIHVwZGF0ZUZyYW1lYnVmZmVyKGZyYW1lYnVmZmVyKVxuXG4gICAgICByZXR1cm4gcmVnbEZyYW1lYnVmZmVyXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVzaXplICh3XywgaF8pIHtcbiAgICAgIGNoZWNrKGZyYW1lYnVmZmVyU3RhdGUubmV4dCAhPT0gZnJhbWVidWZmZXIsXG4gICAgICAgICdjYW4gbm90IHJlc2l6ZSBhIGZyYW1lYnVmZmVyIHdoaWNoIGlzIGN1cnJlbnRseSBpbiB1c2UnKVxuXG4gICAgICB2YXIgdyA9IHdfIHwgMFxuICAgICAgdmFyIGggPSAoaF8gfCAwKSB8fCB3XG4gICAgICBpZiAodyA9PT0gZnJhbWVidWZmZXIud2lkdGggJiYgaCA9PT0gZnJhbWVidWZmZXIuaGVpZ2h0KSB7XG4gICAgICAgIHJldHVybiByZWdsRnJhbWVidWZmZXJcbiAgICAgIH1cblxuICAgICAgLy8gcmVzaXplIGFsbCBidWZmZXJzXG4gICAgICB2YXIgY29sb3JBdHRhY2htZW50cyA9IGZyYW1lYnVmZmVyLmNvbG9yQXR0YWNobWVudHNcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY29sb3JBdHRhY2htZW50cy5sZW5ndGg7ICsraSkge1xuICAgICAgICByZXNpemVBdHRhY2htZW50KGNvbG9yQXR0YWNobWVudHNbaV0sIHcsIGgpXG4gICAgICB9XG4gICAgICByZXNpemVBdHRhY2htZW50KGZyYW1lYnVmZmVyLmRlcHRoQXR0YWNobWVudCwgdywgaClcbiAgICAgIHJlc2l6ZUF0dGFjaG1lbnQoZnJhbWVidWZmZXIuc3RlbmNpbEF0dGFjaG1lbnQsIHcsIGgpXG4gICAgICByZXNpemVBdHRhY2htZW50KGZyYW1lYnVmZmVyLmRlcHRoU3RlbmNpbEF0dGFjaG1lbnQsIHcsIGgpXG5cbiAgICAgIGZyYW1lYnVmZmVyLndpZHRoID0gcmVnbEZyYW1lYnVmZmVyLndpZHRoID0gd1xuICAgICAgZnJhbWVidWZmZXIuaGVpZ2h0ID0gcmVnbEZyYW1lYnVmZmVyLmhlaWdodCA9IGhcblxuICAgICAgdXBkYXRlRnJhbWVidWZmZXIoZnJhbWVidWZmZXIpXG5cbiAgICAgIHJldHVybiByZWdsRnJhbWVidWZmZXJcbiAgICB9XG5cbiAgICByZWdsRnJhbWVidWZmZXIoYTAsIGExKVxuXG4gICAgcmV0dXJuIGV4dGVuZChyZWdsRnJhbWVidWZmZXIsIHtcbiAgICAgIHJlc2l6ZTogcmVzaXplLFxuICAgICAgX3JlZ2xUeXBlOiAnZnJhbWVidWZmZXInLFxuICAgICAgX2ZyYW1lYnVmZmVyOiBmcmFtZWJ1ZmZlcixcbiAgICAgIGRlc3Ryb3k6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgZGVzdHJveShmcmFtZWJ1ZmZlcilcbiAgICAgICAgZGVjRkJPUmVmcyhmcmFtZWJ1ZmZlcilcbiAgICAgIH0sXG4gICAgICBiaW5kOiBmdW5jdGlvbiAoYmxvY2spIHtcbiAgICAgICAgZnJhbWVidWZmZXJTdGF0ZS5zZXRGQk8oe1xuICAgICAgICAgIGZyYW1lYnVmZmVyOiByZWdsRnJhbWVidWZmZXJcbiAgICAgICAgfSwgYmxvY2spXG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZUN1YmVGQk8gKG9wdGlvbnMpIHtcbiAgICB2YXIgZmFjZXMgPSBBcnJheSg2KVxuXG4gICAgZnVuY3Rpb24gcmVnbEZyYW1lYnVmZmVyQ3ViZSAoYSkge1xuICAgICAgdmFyIGlcblxuICAgICAgY2hlY2soZmFjZXMuaW5kZXhPZihmcmFtZWJ1ZmZlclN0YXRlLm5leHQpIDwgMCxcbiAgICAgICAgJ2NhbiBub3QgdXBkYXRlIGZyYW1lYnVmZmVyIHdoaWNoIGlzIGN1cnJlbnRseSBpbiB1c2UnKVxuXG4gICAgICB2YXIgZXh0RHJhd0J1ZmZlcnMgPSBleHRlbnNpb25zLndlYmdsX2RyYXdfYnVmZmVyc1xuXG4gICAgICB2YXIgcGFyYW1zID0ge1xuICAgICAgICBjb2xvcjogbnVsbFxuICAgICAgfVxuXG4gICAgICB2YXIgcmFkaXVzID0gMFxuXG4gICAgICB2YXIgY29sb3JCdWZmZXIgPSBudWxsXG4gICAgICB2YXIgY29sb3JGb3JtYXQgPSAncmdiYSdcbiAgICAgIHZhciBjb2xvclR5cGUgPSAndWludDgnXG4gICAgICB2YXIgY29sb3JDb3VudCA9IDFcblxuICAgICAgaWYgKHR5cGVvZiBhID09PSAnbnVtYmVyJykge1xuICAgICAgICByYWRpdXMgPSBhIHwgMFxuICAgICAgfSBlbHNlIGlmICghYSkge1xuICAgICAgICByYWRpdXMgPSAxXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjaGVjay50eXBlKGEsICdvYmplY3QnLCAnaW52YWxpZCBhcmd1bWVudHMgZm9yIGZyYW1lYnVmZmVyJylcbiAgICAgICAgdmFyIG9wdGlvbnMgPSBhXG5cbiAgICAgICAgaWYgKCdzaGFwZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHZhciBzaGFwZSA9IG9wdGlvbnMuc2hhcGVcbiAgICAgICAgICBjaGVjayhcbiAgICAgICAgICAgIEFycmF5LmlzQXJyYXkoc2hhcGUpICYmIHNoYXBlLmxlbmd0aCA+PSAyLFxuICAgICAgICAgICAgJ2ludmFsaWQgc2hhcGUgZm9yIGZyYW1lYnVmZmVyJylcbiAgICAgICAgICBjaGVjayhcbiAgICAgICAgICAgIHNoYXBlWzBdID09PSBzaGFwZVsxXSxcbiAgICAgICAgICAgICdjdWJlIGZyYW1lYnVmZmVyIG11c3QgYmUgc3F1YXJlJylcbiAgICAgICAgICByYWRpdXMgPSBzaGFwZVswXVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmICgncmFkaXVzJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICByYWRpdXMgPSBvcHRpb25zLnJhZGl1cyB8IDBcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCd3aWR0aCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgcmFkaXVzID0gb3B0aW9ucy53aWR0aCB8IDBcbiAgICAgICAgICAgIGlmICgnaGVpZ2h0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICAgIGNoZWNrKG9wdGlvbnMuaGVpZ2h0ID09PSByYWRpdXMsICdtdXN0IGJlIHNxdWFyZScpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIGlmICgnaGVpZ2h0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICByYWRpdXMgPSBvcHRpb25zLmhlaWdodCB8IDBcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ2NvbG9yJyBpbiBvcHRpb25zIHx8XG4gICAgICAgICAgICAnY29sb3JzJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgY29sb3JCdWZmZXIgPVxuICAgICAgICAgICAgb3B0aW9ucy5jb2xvciB8fFxuICAgICAgICAgICAgb3B0aW9ucy5jb2xvcnNcbiAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShjb2xvckJ1ZmZlcikpIHtcbiAgICAgICAgICAgIGNoZWNrKFxuICAgICAgICAgICAgICBjb2xvckJ1ZmZlci5sZW5ndGggPT09IDEgfHwgZXh0RHJhd0J1ZmZlcnMsXG4gICAgICAgICAgICAgICdtdWx0aXBsZSByZW5kZXIgdGFyZ2V0cyBub3Qgc3VwcG9ydGVkJylcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWNvbG9yQnVmZmVyKSB7XG4gICAgICAgICAgaWYgKCdjb2xvckNvdW50JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBjb2xvckNvdW50ID0gb3B0aW9ucy5jb2xvckNvdW50IHwgMFxuICAgICAgICAgICAgY2hlY2soY29sb3JDb3VudCA+IDAsICdpbnZhbGlkIGNvbG9yIGJ1ZmZlciBjb3VudCcpXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKCdjb2xvclR5cGUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGNoZWNrLm9uZU9mKFxuICAgICAgICAgICAgICBvcHRpb25zLmNvbG9yVHlwZSwgY29sb3JUeXBlcyxcbiAgICAgICAgICAgICAgJ2ludmFsaWQgY29sb3IgdHlwZScpXG4gICAgICAgICAgICBjb2xvclR5cGUgPSBvcHRpb25zLmNvbG9yVHlwZVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmICgnY29sb3JGb3JtYXQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGNvbG9yRm9ybWF0ID0gb3B0aW9ucy5jb2xvckZvcm1hdFxuICAgICAgICAgICAgY2hlY2sub25lT2YoXG4gICAgICAgICAgICAgIG9wdGlvbnMuY29sb3JGb3JtYXQsIGNvbG9yVGV4dHVyZUZvcm1hdHMsXG4gICAgICAgICAgICAgICdpbnZhbGlkIGNvbG9yIGZvcm1hdCBmb3IgdGV4dHVyZScpXG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdkZXB0aCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHBhcmFtcy5kZXB0aCA9IG9wdGlvbnMuZGVwdGhcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnc3RlbmNpbCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHBhcmFtcy5zdGVuY2lsID0gb3B0aW9ucy5zdGVuY2lsXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ2RlcHRoU3RlbmNpbCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHBhcmFtcy5kZXB0aFN0ZW5jaWwgPSBvcHRpb25zLmRlcHRoU3RlbmNpbFxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHZhciBjb2xvckN1YmVzXG4gICAgICBpZiAoY29sb3JCdWZmZXIpIHtcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoY29sb3JCdWZmZXIpKSB7XG4gICAgICAgICAgY29sb3JDdWJlcyA9IFtdXG4gICAgICAgICAgZm9yIChpID0gMDsgaSA8IGNvbG9yQnVmZmVyLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgICBjb2xvckN1YmVzW2ldID0gY29sb3JCdWZmZXJbaV1cbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29sb3JDdWJlcyA9IFsgY29sb3JCdWZmZXIgXVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb2xvckN1YmVzID0gQXJyYXkoY29sb3JDb3VudClcbiAgICAgICAgdmFyIGN1YmVNYXBQYXJhbXMgPSB7XG4gICAgICAgICAgcmFkaXVzOiByYWRpdXMsXG4gICAgICAgICAgZm9ybWF0OiBjb2xvckZvcm1hdCxcbiAgICAgICAgICB0eXBlOiBjb2xvclR5cGVcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY29sb3JDb3VudDsgKytpKSB7XG4gICAgICAgICAgY29sb3JDdWJlc1tpXSA9IHRleHR1cmVTdGF0ZS5jcmVhdGVDdWJlKGN1YmVNYXBQYXJhbXMpXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gQ2hlY2sgY29sb3IgY3ViZXNcbiAgICAgIHBhcmFtcy5jb2xvciA9IEFycmF5KGNvbG9yQ3ViZXMubGVuZ3RoKVxuICAgICAgZm9yIChpID0gMDsgaSA8IGNvbG9yQ3ViZXMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgdmFyIGN1YmUgPSBjb2xvckN1YmVzW2ldXG4gICAgICAgIGNoZWNrKFxuICAgICAgICAgIHR5cGVvZiBjdWJlID09PSAnZnVuY3Rpb24nICYmIGN1YmUuX3JlZ2xUeXBlID09PSAndGV4dHVyZUN1YmUnLFxuICAgICAgICAgICdpbnZhbGlkIGN1YmUgbWFwJylcbiAgICAgICAgcmFkaXVzID0gcmFkaXVzIHx8IGN1YmUud2lkdGhcbiAgICAgICAgY2hlY2soXG4gICAgICAgICAgY3ViZS53aWR0aCA9PT0gcmFkaXVzICYmIGN1YmUuaGVpZ2h0ID09PSByYWRpdXMsXG4gICAgICAgICAgJ2ludmFsaWQgY3ViZSBtYXAgc2hhcGUnKVxuICAgICAgICBwYXJhbXMuY29sb3JbaV0gPSB7XG4gICAgICAgICAgdGFyZ2V0OiBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1gsXG4gICAgICAgICAgZGF0YTogY29sb3JDdWJlc1tpXVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGZvciAoaSA9IDA7IGkgPCA2OyArK2kpIHtcbiAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBjb2xvckN1YmVzLmxlbmd0aDsgKytqKSB7XG4gICAgICAgICAgcGFyYW1zLmNvbG9yW2pdLnRhcmdldCA9IEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCArIGlcbiAgICAgICAgfVxuICAgICAgICAvLyByZXVzZSBkZXB0aC1zdGVuY2lsIGF0dGFjaG1lbnRzIGFjcm9zcyBhbGwgY3ViZSBtYXBzXG4gICAgICAgIGlmIChpID4gMCkge1xuICAgICAgICAgIHBhcmFtcy5kZXB0aCA9IGZhY2VzWzBdLmRlcHRoXG4gICAgICAgICAgcGFyYW1zLnN0ZW5jaWwgPSBmYWNlc1swXS5zdGVuY2lsXG4gICAgICAgICAgcGFyYW1zLmRlcHRoU3RlbmNpbCA9IGZhY2VzWzBdLmRlcHRoU3RlbmNpbFxuICAgICAgICB9XG4gICAgICAgIGlmIChmYWNlc1tpXSkge1xuICAgICAgICAgIChmYWNlc1tpXSkocGFyYW1zKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGZhY2VzW2ldID0gY3JlYXRlRkJPKHBhcmFtcylcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gZXh0ZW5kKHJlZ2xGcmFtZWJ1ZmZlckN1YmUsIHtcbiAgICAgICAgd2lkdGg6IHJhZGl1cyxcbiAgICAgICAgaGVpZ2h0OiByYWRpdXMsXG4gICAgICAgIGNvbG9yOiBjb2xvckN1YmVzXG4gICAgICB9KVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlc2l6ZSAocmFkaXVzXykge1xuICAgICAgdmFyIGlcbiAgICAgIHZhciByYWRpdXMgPSByYWRpdXNfIHwgMFxuICAgICAgY2hlY2socmFkaXVzID4gMCAmJiByYWRpdXMgPD0gbGltaXRzLm1heEN1YmVNYXBTaXplLFxuICAgICAgICAnaW52YWxpZCByYWRpdXMgZm9yIGN1YmUgZmJvJylcblxuICAgICAgaWYgKHJhZGl1cyA9PT0gcmVnbEZyYW1lYnVmZmVyQ3ViZS53aWR0aCkge1xuICAgICAgICByZXR1cm4gcmVnbEZyYW1lYnVmZmVyQ3ViZVxuICAgICAgfVxuXG4gICAgICB2YXIgY29sb3JzID0gcmVnbEZyYW1lYnVmZmVyQ3ViZS5jb2xvclxuICAgICAgZm9yIChpID0gMDsgaSA8IGNvbG9ycy5sZW5ndGg7ICsraSkge1xuICAgICAgICBjb2xvcnNbaV0ucmVzaXplKHJhZGl1cylcbiAgICAgIH1cblxuICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICBmYWNlc1tpXS5yZXNpemUocmFkaXVzKVxuICAgICAgfVxuXG4gICAgICByZWdsRnJhbWVidWZmZXJDdWJlLndpZHRoID0gcmVnbEZyYW1lYnVmZmVyQ3ViZS5oZWlnaHQgPSByYWRpdXNcblxuICAgICAgcmV0dXJuIHJlZ2xGcmFtZWJ1ZmZlckN1YmVcbiAgICB9XG5cbiAgICByZWdsRnJhbWVidWZmZXJDdWJlKG9wdGlvbnMpXG5cbiAgICByZXR1cm4gZXh0ZW5kKHJlZ2xGcmFtZWJ1ZmZlckN1YmUsIHtcbiAgICAgIGZhY2VzOiBmYWNlcyxcbiAgICAgIHJlc2l6ZTogcmVzaXplLFxuICAgICAgX3JlZ2xUeXBlOiAnZnJhbWVidWZmZXJDdWJlJyxcbiAgICAgIGRlc3Ryb3k6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgZmFjZXMuZm9yRWFjaChmdW5jdGlvbiAoZikge1xuICAgICAgICAgIGYuZGVzdHJveSgpXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlc3RvcmVGcmFtZWJ1ZmZlcnMgKCkge1xuICAgIHZhbHVlcyhmcmFtZWJ1ZmZlclNldCkuZm9yRWFjaChmdW5jdGlvbiAoZmIpIHtcbiAgICAgIGZiLmZyYW1lYnVmZmVyID0gZ2wuY3JlYXRlRnJhbWVidWZmZXIoKVxuICAgICAgdXBkYXRlRnJhbWVidWZmZXIoZmIpXG4gICAgfSlcbiAgfVxuXG4gIHJldHVybiBleHRlbmQoZnJhbWVidWZmZXJTdGF0ZSwge1xuICAgIGdldEZyYW1lYnVmZmVyOiBmdW5jdGlvbiAob2JqZWN0KSB7XG4gICAgICBpZiAodHlwZW9mIG9iamVjdCA9PT0gJ2Z1bmN0aW9uJyAmJiBvYmplY3QuX3JlZ2xUeXBlID09PSAnZnJhbWVidWZmZXInKSB7XG4gICAgICAgIHZhciBmYm8gPSBvYmplY3QuX2ZyYW1lYnVmZmVyXG4gICAgICAgIGlmIChmYm8gaW5zdGFuY2VvZiBSRUdMRnJhbWVidWZmZXIpIHtcbiAgICAgICAgICByZXR1cm4gZmJvXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsXG4gICAgfSxcbiAgICBjcmVhdGU6IGNyZWF0ZUZCTyxcbiAgICBjcmVhdGVDdWJlOiBjcmVhdGVDdWJlRkJPLFxuICAgIGNsZWFyOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YWx1ZXMoZnJhbWVidWZmZXJTZXQpLmZvckVhY2goZGVzdHJveSlcbiAgICB9LFxuICAgIHJlc3RvcmU6IHJlc3RvcmVGcmFtZWJ1ZmZlcnNcbiAgfSlcbn1cbiIsInZhciBHTF9TVUJQSVhFTF9CSVRTID0gMHgwRDUwXG52YXIgR0xfUkVEX0JJVFMgPSAweDBENTJcbnZhciBHTF9HUkVFTl9CSVRTID0gMHgwRDUzXG52YXIgR0xfQkxVRV9CSVRTID0gMHgwRDU0XG52YXIgR0xfQUxQSEFfQklUUyA9IDB4MEQ1NVxudmFyIEdMX0RFUFRIX0JJVFMgPSAweDBENTZcbnZhciBHTF9TVEVOQ0lMX0JJVFMgPSAweDBENTdcblxudmFyIEdMX0FMSUFTRURfUE9JTlRfU0laRV9SQU5HRSA9IDB4ODQ2RFxudmFyIEdMX0FMSUFTRURfTElORV9XSURUSF9SQU5HRSA9IDB4ODQ2RVxuXG52YXIgR0xfTUFYX1RFWFRVUkVfU0laRSA9IDB4MEQzM1xudmFyIEdMX01BWF9WSUVXUE9SVF9ESU1TID0gMHgwRDNBXG52YXIgR0xfTUFYX1ZFUlRFWF9BVFRSSUJTID0gMHg4ODY5XG52YXIgR0xfTUFYX1ZFUlRFWF9VTklGT1JNX1ZFQ1RPUlMgPSAweDhERkJcbnZhciBHTF9NQVhfVkFSWUlOR19WRUNUT1JTID0gMHg4REZDXG52YXIgR0xfTUFYX0NPTUJJTkVEX1RFWFRVUkVfSU1BR0VfVU5JVFMgPSAweDhCNERcbnZhciBHTF9NQVhfVkVSVEVYX1RFWFRVUkVfSU1BR0VfVU5JVFMgPSAweDhCNENcbnZhciBHTF9NQVhfVEVYVFVSRV9JTUFHRV9VTklUUyA9IDB4ODg3MlxudmFyIEdMX01BWF9GUkFHTUVOVF9VTklGT1JNX1ZFQ1RPUlMgPSAweDhERkRcbnZhciBHTF9NQVhfQ1VCRV9NQVBfVEVYVFVSRV9TSVpFID0gMHg4NTFDXG52YXIgR0xfTUFYX1JFTkRFUkJVRkZFUl9TSVpFID0gMHg4NEU4XG5cbnZhciBHTF9WRU5ET1IgPSAweDFGMDBcbnZhciBHTF9SRU5ERVJFUiA9IDB4MUYwMVxudmFyIEdMX1ZFUlNJT04gPSAweDFGMDJcbnZhciBHTF9TSEFESU5HX0xBTkdVQUdFX1ZFUlNJT04gPSAweDhCOENcblxudmFyIEdMX01BWF9URVhUVVJFX01BWF9BTklTT1RST1BZX0VYVCA9IDB4ODRGRlxuXG52YXIgR0xfTUFYX0NPTE9SX0FUVEFDSE1FTlRTX1dFQkdMID0gMHg4Q0RGXG52YXIgR0xfTUFYX0RSQVdfQlVGRkVSU19XRUJHTCA9IDB4ODgyNFxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChnbCwgZXh0ZW5zaW9ucykge1xuICB2YXIgbWF4QW5pc290cm9waWMgPSAxXG4gIGlmIChleHRlbnNpb25zLmV4dF90ZXh0dXJlX2ZpbHRlcl9hbmlzb3Ryb3BpYykge1xuICAgIG1heEFuaXNvdHJvcGljID0gZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9URVhUVVJFX01BWF9BTklTT1RST1BZX0VYVClcbiAgfVxuXG4gIHZhciBtYXhEcmF3YnVmZmVycyA9IDFcbiAgdmFyIG1heENvbG9yQXR0YWNobWVudHMgPSAxXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2RyYXdfYnVmZmVycykge1xuICAgIG1heERyYXdidWZmZXJzID0gZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9EUkFXX0JVRkZFUlNfV0VCR0wpXG4gICAgbWF4Q29sb3JBdHRhY2htZW50cyA9IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfQ09MT1JfQVRUQUNITUVOVFNfV0VCR0wpXG4gIH1cblxuICByZXR1cm4ge1xuICAgIC8vIGRyYXdpbmcgYnVmZmVyIGJpdCBkZXB0aFxuICAgIGNvbG9yQml0czogW1xuICAgICAgZ2wuZ2V0UGFyYW1ldGVyKEdMX1JFRF9CSVRTKSxcbiAgICAgIGdsLmdldFBhcmFtZXRlcihHTF9HUkVFTl9CSVRTKSxcbiAgICAgIGdsLmdldFBhcmFtZXRlcihHTF9CTFVFX0JJVFMpLFxuICAgICAgZ2wuZ2V0UGFyYW1ldGVyKEdMX0FMUEhBX0JJVFMpXG4gICAgXSxcbiAgICBkZXB0aEJpdHM6IGdsLmdldFBhcmFtZXRlcihHTF9ERVBUSF9CSVRTKSxcbiAgICBzdGVuY2lsQml0czogZ2wuZ2V0UGFyYW1ldGVyKEdMX1NURU5DSUxfQklUUyksXG4gICAgc3VicGl4ZWxCaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfU1VCUElYRUxfQklUUyksXG5cbiAgICAvLyBzdXBwb3J0ZWQgZXh0ZW5zaW9uc1xuICAgIGV4dGVuc2lvbnM6IE9iamVjdC5rZXlzKGV4dGVuc2lvbnMpLmZpbHRlcihmdW5jdGlvbiAoZXh0KSB7XG4gICAgICByZXR1cm4gISFleHRlbnNpb25zW2V4dF1cbiAgICB9KSxcblxuICAgIC8vIG1heCBhbmlzbyBzYW1wbGVzXG4gICAgbWF4QW5pc290cm9waWM6IG1heEFuaXNvdHJvcGljLFxuXG4gICAgLy8gbWF4IGRyYXcgYnVmZmVyc1xuICAgIG1heERyYXdidWZmZXJzOiBtYXhEcmF3YnVmZmVycyxcbiAgICBtYXhDb2xvckF0dGFjaG1lbnRzOiBtYXhDb2xvckF0dGFjaG1lbnRzLFxuXG4gICAgLy8gcG9pbnQgYW5kIGxpbmUgc2l6ZSByYW5nZXNcbiAgICBwb2ludFNpemVEaW1zOiBnbC5nZXRQYXJhbWV0ZXIoR0xfQUxJQVNFRF9QT0lOVF9TSVpFX1JBTkdFKSxcbiAgICBsaW5lV2lkdGhEaW1zOiBnbC5nZXRQYXJhbWV0ZXIoR0xfQUxJQVNFRF9MSU5FX1dJRFRIX1JBTkdFKSxcbiAgICBtYXhWaWV3cG9ydERpbXM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVklFV1BPUlRfRElNUyksXG4gICAgbWF4Q29tYmluZWRUZXh0dXJlVW5pdHM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfQ09NQklORURfVEVYVFVSRV9JTUFHRV9VTklUUyksXG4gICAgbWF4Q3ViZU1hcFNpemU6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfQ1VCRV9NQVBfVEVYVFVSRV9TSVpFKSxcbiAgICBtYXhSZW5kZXJidWZmZXJTaXplOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1JFTkRFUkJVRkZFUl9TSVpFKSxcbiAgICBtYXhUZXh0dXJlVW5pdHM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVEVYVFVSRV9JTUFHRV9VTklUUyksXG4gICAgbWF4VGV4dHVyZVNpemU6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVEVYVFVSRV9TSVpFKSxcbiAgICBtYXhBdHRyaWJ1dGVzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1ZFUlRFWF9BVFRSSUJTKSxcbiAgICBtYXhWZXJ0ZXhVbmlmb3JtczogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9WRVJURVhfVU5JRk9STV9WRUNUT1JTKSxcbiAgICBtYXhWZXJ0ZXhUZXh0dXJlVW5pdHM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVkVSVEVYX1RFWFRVUkVfSU1BR0VfVU5JVFMpLFxuICAgIG1heFZhcnlpbmdWZWN0b3JzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1ZBUllJTkdfVkVDVE9SUyksXG4gICAgbWF4RnJhZ21lbnRVbmlmb3JtczogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9GUkFHTUVOVF9VTklGT1JNX1ZFQ1RPUlMpLFxuXG4gICAgLy8gdmVuZG9yIGluZm9cbiAgICBnbHNsOiBnbC5nZXRQYXJhbWV0ZXIoR0xfU0hBRElOR19MQU5HVUFHRV9WRVJTSU9OKSxcbiAgICByZW5kZXJlcjogZ2wuZ2V0UGFyYW1ldGVyKEdMX1JFTkRFUkVSKSxcbiAgICB2ZW5kb3I6IGdsLmdldFBhcmFtZXRlcihHTF9WRU5ET1IpLFxuICAgIHZlcnNpb246IGdsLmdldFBhcmFtZXRlcihHTF9WRVJTSU9OKVxuICB9XG59XG4iLCJ2YXIgY2hlY2sgPSByZXF1aXJlKCcuL3V0aWwvY2hlY2snKVxudmFyIGlzVHlwZWRBcnJheSA9IHJlcXVpcmUoJy4vdXRpbC9pcy10eXBlZC1hcnJheScpXG5cbnZhciBHTF9SR0JBID0gNjQwOFxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSA1MTIxXG52YXIgR0xfUEFDS19BTElHTk1FTlQgPSAweDBEMDVcbnZhciBHTF9GTE9BVCA9IDB4MTQwNiAvLyA1MTI2XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcFJlYWRQaXhlbHMgKFxuICBnbCxcbiAgZnJhbWVidWZmZXJTdGF0ZSxcbiAgcmVnbFBvbGwsXG4gIGNvbnRleHQsXG4gIGdsQXR0cmlidXRlcyxcbiAgZXh0ZW5zaW9ucykge1xuICBmdW5jdGlvbiByZWFkUGl4ZWxzSW1wbCAoaW5wdXQpIHtcbiAgICB2YXIgdHlwZVxuICAgIGlmIChmcmFtZWJ1ZmZlclN0YXRlLm5leHQgPT09IG51bGwpIHtcbiAgICAgIGNoZWNrKFxuICAgICAgICBnbEF0dHJpYnV0ZXMucHJlc2VydmVEcmF3aW5nQnVmZmVyLFxuICAgICAgICAneW91IG11c3QgY3JlYXRlIGEgd2ViZ2wgY29udGV4dCB3aXRoIFwicHJlc2VydmVEcmF3aW5nQnVmZmVyXCI6dHJ1ZSBpbiBvcmRlciB0byByZWFkIHBpeGVscyBmcm9tIHRoZSBkcmF3aW5nIGJ1ZmZlcicpXG4gICAgICB0eXBlID0gR0xfVU5TSUdORURfQllURVxuICAgIH0gZWxzZSB7XG4gICAgICBjaGVjayhcbiAgICAgICAgZnJhbWVidWZmZXJTdGF0ZS5uZXh0LmNvbG9yQXR0YWNobWVudHNbMF0udGV4dHVyZSAhPT0gbnVsbCxcbiAgICAgICAgICAnWW91IGNhbm5vdCByZWFkIGZyb20gYSByZW5kZXJidWZmZXInKVxuICAgICAgdHlwZSA9IGZyYW1lYnVmZmVyU3RhdGUubmV4dC5jb2xvckF0dGFjaG1lbnRzWzBdLnRleHR1cmUuX3RleHR1cmUudHlwZVxuXG4gICAgICBpZiAoZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9mbG9hdCkge1xuICAgICAgICBjaGVjayhcbiAgICAgICAgICB0eXBlID09PSBHTF9VTlNJR05FRF9CWVRFIHx8IHR5cGUgPT09IEdMX0ZMT0FULFxuICAgICAgICAgICdSZWFkaW5nIGZyb20gYSBmcmFtZWJ1ZmZlciBpcyBvbmx5IGFsbG93ZWQgZm9yIHRoZSB0eXBlcyBcXCd1aW50OFxcJyBhbmQgXFwnZmxvYXRcXCcnKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY2hlY2soXG4gICAgICAgICAgdHlwZSA9PT0gR0xfVU5TSUdORURfQllURSxcbiAgICAgICAgICAnUmVhZGluZyBmcm9tIGEgZnJhbWVidWZmZXIgaXMgb25seSBhbGxvd2VkIGZvciB0aGUgdHlwZSBcXCd1aW50OFxcJycpXG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFyIHggPSAwXG4gICAgdmFyIHkgPSAwXG4gICAgdmFyIHdpZHRoID0gY29udGV4dC5mcmFtZWJ1ZmZlcldpZHRoXG4gICAgdmFyIGhlaWdodCA9IGNvbnRleHQuZnJhbWVidWZmZXJIZWlnaHRcbiAgICB2YXIgZGF0YSA9IG51bGxcblxuICAgIGlmIChpc1R5cGVkQXJyYXkoaW5wdXQpKSB7XG4gICAgICBkYXRhID0gaW5wdXRcbiAgICB9IGVsc2UgaWYgKGlucHV0KSB7XG4gICAgICBjaGVjay50eXBlKGlucHV0LCAnb2JqZWN0JywgJ2ludmFsaWQgYXJndW1lbnRzIHRvIHJlZ2wucmVhZCgpJylcbiAgICAgIHggPSBpbnB1dC54IHwgMFxuICAgICAgeSA9IGlucHV0LnkgfCAwXG4gICAgICBjaGVjayhcbiAgICAgICAgeCA+PSAwICYmIHggPCBjb250ZXh0LmZyYW1lYnVmZmVyV2lkdGgsXG4gICAgICAgICdpbnZhbGlkIHggb2Zmc2V0IGZvciByZWdsLnJlYWQnKVxuICAgICAgY2hlY2soXG4gICAgICAgIHkgPj0gMCAmJiB5IDwgY29udGV4dC5mcmFtZWJ1ZmZlckhlaWdodCxcbiAgICAgICAgJ2ludmFsaWQgeSBvZmZzZXQgZm9yIHJlZ2wucmVhZCcpXG4gICAgICB3aWR0aCA9IChpbnB1dC53aWR0aCB8fCAoY29udGV4dC5mcmFtZWJ1ZmZlcldpZHRoIC0geCkpIHwgMFxuICAgICAgaGVpZ2h0ID0gKGlucHV0LmhlaWdodCB8fCAoY29udGV4dC5mcmFtZWJ1ZmZlckhlaWdodCAtIHkpKSB8IDBcbiAgICAgIGRhdGEgPSBpbnB1dC5kYXRhIHx8IG51bGxcbiAgICB9XG5cbiAgICAvLyBzYW5pdHkgY2hlY2sgaW5wdXQuZGF0YVxuICAgIGlmIChkYXRhKSB7XG4gICAgICBpZiAodHlwZSA9PT0gR0xfVU5TSUdORURfQllURSkge1xuICAgICAgICBjaGVjayhcbiAgICAgICAgICBkYXRhIGluc3RhbmNlb2YgVWludDhBcnJheSxcbiAgICAgICAgICAnYnVmZmVyIG11c3QgYmUgXFwnVWludDhBcnJheVxcJyB3aGVuIHJlYWRpbmcgZnJvbSBhIGZyYW1lYnVmZmVyIG9mIHR5cGUgXFwndWludDhcXCcnKVxuICAgICAgfSBlbHNlIGlmICh0eXBlID09PSBHTF9GTE9BVCkge1xuICAgICAgICBjaGVjayhcbiAgICAgICAgICBkYXRhIGluc3RhbmNlb2YgRmxvYXQzMkFycmF5LFxuICAgICAgICAgICdidWZmZXIgbXVzdCBiZSBcXCdGbG9hdDMyQXJyYXlcXCcgd2hlbiByZWFkaW5nIGZyb20gYSBmcmFtZWJ1ZmZlciBvZiB0eXBlIFxcJ2Zsb2F0XFwnJylcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjaGVjayhcbiAgICAgIHdpZHRoID4gMCAmJiB3aWR0aCArIHggPD0gY29udGV4dC5mcmFtZWJ1ZmZlcldpZHRoLFxuICAgICAgJ2ludmFsaWQgd2lkdGggZm9yIHJlYWQgcGl4ZWxzJylcbiAgICBjaGVjayhcbiAgICAgIGhlaWdodCA+IDAgJiYgaGVpZ2h0ICsgeSA8PSBjb250ZXh0LmZyYW1lYnVmZmVySGVpZ2h0LFxuICAgICAgJ2ludmFsaWQgaGVpZ2h0IGZvciByZWFkIHBpeGVscycpXG5cbiAgICAvLyBVcGRhdGUgV2ViR0wgc3RhdGVcbiAgICByZWdsUG9sbCgpXG5cbiAgICAvLyBDb21wdXRlIHNpemVcbiAgICB2YXIgc2l6ZSA9IHdpZHRoICogaGVpZ2h0ICogNFxuXG4gICAgLy8gQWxsb2NhdGUgZGF0YVxuICAgIGlmICghZGF0YSkge1xuICAgICAgaWYgKHR5cGUgPT09IEdMX1VOU0lHTkVEX0JZVEUpIHtcbiAgICAgICAgZGF0YSA9IG5ldyBVaW50OEFycmF5KHNpemUpXG4gICAgICB9IGVsc2UgaWYgKHR5cGUgPT09IEdMX0ZMT0FUKSB7XG4gICAgICAgIGRhdGEgPSBkYXRhIHx8IG5ldyBGbG9hdDMyQXJyYXkoc2l6ZSlcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBUeXBlIGNoZWNrXG4gICAgY2hlY2suaXNUeXBlZEFycmF5KGRhdGEsICdkYXRhIGJ1ZmZlciBmb3IgcmVnbC5yZWFkKCkgbXVzdCBiZSBhIHR5cGVkYXJyYXknKVxuICAgIGNoZWNrKGRhdGEuYnl0ZUxlbmd0aCA+PSBzaXplLCAnZGF0YSBidWZmZXIgZm9yIHJlZ2wucmVhZCgpIHRvbyBzbWFsbCcpXG5cbiAgICAvLyBSdW4gcmVhZCBwaXhlbHNcbiAgICBnbC5waXhlbFN0b3JlaShHTF9QQUNLX0FMSUdOTUVOVCwgNClcbiAgICBnbC5yZWFkUGl4ZWxzKHgsIHksIHdpZHRoLCBoZWlnaHQsIEdMX1JHQkEsXG4gICAgICAgICAgICAgICAgICB0eXBlLFxuICAgICAgICAgICAgICAgICAgZGF0YSlcblxuICAgIHJldHVybiBkYXRhXG4gIH1cblxuICBmdW5jdGlvbiByZWFkUGl4ZWxzRkJPIChvcHRpb25zKSB7XG4gICAgdmFyIHJlc3VsdFxuICAgIGZyYW1lYnVmZmVyU3RhdGUuc2V0RkJPKHtcbiAgICAgIGZyYW1lYnVmZmVyOiBvcHRpb25zLmZyYW1lYnVmZmVyXG4gICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgcmVzdWx0ID0gcmVhZFBpeGVsc0ltcGwob3B0aW9ucylcbiAgICB9KVxuICAgIHJldHVybiByZXN1bHRcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlYWRQaXhlbHMgKG9wdGlvbnMpIHtcbiAgICBpZiAoIW9wdGlvbnMgfHwgISgnZnJhbWVidWZmZXInIGluIG9wdGlvbnMpKSB7XG4gICAgICByZXR1cm4gcmVhZFBpeGVsc0ltcGwob3B0aW9ucylcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHJlYWRQaXhlbHNGQk8ob3B0aW9ucylcbiAgICB9XG4gIH1cblxuICByZXR1cm4gcmVhZFBpeGVsc1xufVxuIiwidmFyIGNoZWNrID0gcmVxdWlyZSgnLi91dGlsL2NoZWNrJylcbnZhciB2YWx1ZXMgPSByZXF1aXJlKCcuL3V0aWwvdmFsdWVzJylcblxudmFyIEdMX1JFTkRFUkJVRkZFUiA9IDB4OEQ0MVxuXG52YXIgR0xfUkdCQTQgPSAweDgwNTZcbnZhciBHTF9SR0I1X0ExID0gMHg4MDU3XG52YXIgR0xfUkdCNTY1ID0gMHg4RDYyXG52YXIgR0xfREVQVEhfQ09NUE9ORU5UMTYgPSAweDgxQTVcbnZhciBHTF9TVEVOQ0lMX0lOREVYOCA9IDB4OEQ0OFxudmFyIEdMX0RFUFRIX1NURU5DSUwgPSAweDg0RjlcblxudmFyIEdMX1NSR0I4X0FMUEhBOF9FWFQgPSAweDhDNDNcblxudmFyIEdMX1JHQkEzMkZfRVhUID0gMHg4ODE0XG5cbnZhciBHTF9SR0JBMTZGX0VYVCA9IDB4ODgxQVxudmFyIEdMX1JHQjE2Rl9FWFQgPSAweDg4MUJcblxudmFyIEZPUk1BVF9TSVpFUyA9IFtdXG5cbkZPUk1BVF9TSVpFU1tHTF9SR0JBNF0gPSAyXG5GT1JNQVRfU0laRVNbR0xfUkdCNV9BMV0gPSAyXG5GT1JNQVRfU0laRVNbR0xfUkdCNTY1XSA9IDJcblxuRk9STUFUX1NJWkVTW0dMX0RFUFRIX0NPTVBPTkVOVDE2XSA9IDJcbkZPUk1BVF9TSVpFU1tHTF9TVEVOQ0lMX0lOREVYOF0gPSAxXG5GT1JNQVRfU0laRVNbR0xfREVQVEhfU1RFTkNJTF0gPSA0XG5cbkZPUk1BVF9TSVpFU1tHTF9TUkdCOF9BTFBIQThfRVhUXSA9IDRcbkZPUk1BVF9TSVpFU1tHTF9SR0JBMzJGX0VYVF0gPSAxNlxuRk9STUFUX1NJWkVTW0dMX1JHQkExNkZfRVhUXSA9IDhcbkZPUk1BVF9TSVpFU1tHTF9SR0IxNkZfRVhUXSA9IDZcblxuZnVuY3Rpb24gZ2V0UmVuZGVyYnVmZmVyU2l6ZSAoZm9ybWF0LCB3aWR0aCwgaGVpZ2h0KSB7XG4gIHJldHVybiBGT1JNQVRfU0laRVNbZm9ybWF0XSAqIHdpZHRoICogaGVpZ2h0XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGdsLCBleHRlbnNpb25zLCBsaW1pdHMsIHN0YXRzLCBjb25maWcpIHtcbiAgdmFyIGZvcm1hdFR5cGVzID0ge1xuICAgICdyZ2JhNCc6IEdMX1JHQkE0LFxuICAgICdyZ2I1NjUnOiBHTF9SR0I1NjUsXG4gICAgJ3JnYjUgYTEnOiBHTF9SR0I1X0ExLFxuICAgICdkZXB0aCc6IEdMX0RFUFRIX0NPTVBPTkVOVDE2LFxuICAgICdzdGVuY2lsJzogR0xfU1RFTkNJTF9JTkRFWDgsXG4gICAgJ2RlcHRoIHN0ZW5jaWwnOiBHTF9ERVBUSF9TVEVOQ0lMXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5leHRfc3JnYikge1xuICAgIGZvcm1hdFR5cGVzWydzcmdiYSddID0gR0xfU1JHQjhfQUxQSEE4X0VYVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMuZXh0X2NvbG9yX2J1ZmZlcl9oYWxmX2Zsb2F0KSB7XG4gICAgZm9ybWF0VHlwZXNbJ3JnYmExNmYnXSA9IEdMX1JHQkExNkZfRVhUXG4gICAgZm9ybWF0VHlwZXNbJ3JnYjE2ZiddID0gR0xfUkdCMTZGX0VYVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29sb3JfYnVmZmVyX2Zsb2F0KSB7XG4gICAgZm9ybWF0VHlwZXNbJ3JnYmEzMmYnXSA9IEdMX1JHQkEzMkZfRVhUXG4gIH1cblxuICB2YXIgZm9ybWF0VHlwZXNJbnZlcnQgPSBbXVxuICBPYmplY3Qua2V5cyhmb3JtYXRUeXBlcykuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgdmFyIHZhbCA9IGZvcm1hdFR5cGVzW2tleV1cbiAgICBmb3JtYXRUeXBlc0ludmVydFt2YWxdID0ga2V5XG4gIH0pXG5cbiAgdmFyIHJlbmRlcmJ1ZmZlckNvdW50ID0gMFxuICB2YXIgcmVuZGVyYnVmZmVyU2V0ID0ge31cblxuICBmdW5jdGlvbiBSRUdMUmVuZGVyYnVmZmVyIChyZW5kZXJidWZmZXIpIHtcbiAgICB0aGlzLmlkID0gcmVuZGVyYnVmZmVyQ291bnQrK1xuICAgIHRoaXMucmVmQ291bnQgPSAxXG5cbiAgICB0aGlzLnJlbmRlcmJ1ZmZlciA9IHJlbmRlcmJ1ZmZlclxuXG4gICAgdGhpcy5mb3JtYXQgPSBHTF9SR0JBNFxuICAgIHRoaXMud2lkdGggPSAwXG4gICAgdGhpcy5oZWlnaHQgPSAwXG5cbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgIHRoaXMuc3RhdHMgPSB7c2l6ZTogMH1cbiAgICB9XG4gIH1cblxuICBSRUdMUmVuZGVyYnVmZmVyLnByb3RvdHlwZS5kZWNSZWYgPSBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKC0tdGhpcy5yZWZDb3VudCA8PSAwKSB7XG4gICAgICBkZXN0cm95KHRoaXMpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSAocmIpIHtcbiAgICB2YXIgaGFuZGxlID0gcmIucmVuZGVyYnVmZmVyXG4gICAgY2hlY2soaGFuZGxlLCAnbXVzdCBub3QgZG91YmxlIGRlc3Ryb3kgcmVuZGVyYnVmZmVyJylcbiAgICBnbC5iaW5kUmVuZGVyYnVmZmVyKEdMX1JFTkRFUkJVRkZFUiwgbnVsbClcbiAgICBnbC5kZWxldGVSZW5kZXJidWZmZXIoaGFuZGxlKVxuICAgIHJiLnJlbmRlcmJ1ZmZlciA9IG51bGxcbiAgICByYi5yZWZDb3VudCA9IDBcbiAgICBkZWxldGUgcmVuZGVyYnVmZmVyU2V0W3JiLmlkXVxuICAgIHN0YXRzLnJlbmRlcmJ1ZmZlckNvdW50LS1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZVJlbmRlcmJ1ZmZlciAoYSwgYikge1xuICAgIHZhciByZW5kZXJidWZmZXIgPSBuZXcgUkVHTFJlbmRlcmJ1ZmZlcihnbC5jcmVhdGVSZW5kZXJidWZmZXIoKSlcbiAgICByZW5kZXJidWZmZXJTZXRbcmVuZGVyYnVmZmVyLmlkXSA9IHJlbmRlcmJ1ZmZlclxuICAgIHN0YXRzLnJlbmRlcmJ1ZmZlckNvdW50KytcblxuICAgIGZ1bmN0aW9uIHJlZ2xSZW5kZXJidWZmZXIgKGEsIGIpIHtcbiAgICAgIHZhciB3ID0gMFxuICAgICAgdmFyIGggPSAwXG4gICAgICB2YXIgZm9ybWF0ID0gR0xfUkdCQTRcblxuICAgICAgaWYgKHR5cGVvZiBhID09PSAnb2JqZWN0JyAmJiBhKSB7XG4gICAgICAgIHZhciBvcHRpb25zID0gYVxuICAgICAgICBpZiAoJ3NoYXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgdmFyIHNoYXBlID0gb3B0aW9ucy5zaGFwZVxuICAgICAgICAgIGNoZWNrKEFycmF5LmlzQXJyYXkoc2hhcGUpICYmIHNoYXBlLmxlbmd0aCA+PSAyLFxuICAgICAgICAgICAgJ2ludmFsaWQgcmVuZGVyYnVmZmVyIHNoYXBlJylcbiAgICAgICAgICB3ID0gc2hhcGVbMF0gfCAwXG4gICAgICAgICAgaCA9IHNoYXBlWzFdIHwgMFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmICgncmFkaXVzJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICB3ID0gaCA9IG9wdGlvbnMucmFkaXVzIHwgMFxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoJ3dpZHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICB3ID0gb3B0aW9ucy53aWR0aCB8IDBcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCdoZWlnaHQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGggPSBvcHRpb25zLmhlaWdodCB8IDBcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCdmb3JtYXQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBjaGVjay5wYXJhbWV0ZXIob3B0aW9ucy5mb3JtYXQsIGZvcm1hdFR5cGVzLFxuICAgICAgICAgICAgJ2ludmFsaWQgcmVuZGVyYnVmZmVyIGZvcm1hdCcpXG4gICAgICAgICAgZm9ybWF0ID0gZm9ybWF0VHlwZXNbb3B0aW9ucy5mb3JtYXRdXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGEgPT09ICdudW1iZXInKSB7XG4gICAgICAgIHcgPSBhIHwgMFxuICAgICAgICBpZiAodHlwZW9mIGIgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgaCA9IGIgfCAwXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaCA9IHdcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICghYSkge1xuICAgICAgICB3ID0gaCA9IDFcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNoZWNrLnJhaXNlKCdpbnZhbGlkIGFyZ3VtZW50cyB0byByZW5kZXJidWZmZXIgY29uc3RydWN0b3InKVxuICAgICAgfVxuXG4gICAgICAvLyBjaGVjayBzaGFwZVxuICAgICAgY2hlY2soXG4gICAgICAgIHcgPiAwICYmIGggPiAwICYmXG4gICAgICAgIHcgPD0gbGltaXRzLm1heFJlbmRlcmJ1ZmZlclNpemUgJiYgaCA8PSBsaW1pdHMubWF4UmVuZGVyYnVmZmVyU2l6ZSxcbiAgICAgICAgJ2ludmFsaWQgcmVuZGVyYnVmZmVyIHNpemUnKVxuXG4gICAgICBpZiAodyA9PT0gcmVuZGVyYnVmZmVyLndpZHRoICYmXG4gICAgICAgICAgaCA9PT0gcmVuZGVyYnVmZmVyLmhlaWdodCAmJlxuICAgICAgICAgIGZvcm1hdCA9PT0gcmVuZGVyYnVmZmVyLmZvcm1hdCkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgcmVnbFJlbmRlcmJ1ZmZlci53aWR0aCA9IHJlbmRlcmJ1ZmZlci53aWR0aCA9IHdcbiAgICAgIHJlZ2xSZW5kZXJidWZmZXIuaGVpZ2h0ID0gcmVuZGVyYnVmZmVyLmhlaWdodCA9IGhcbiAgICAgIHJlbmRlcmJ1ZmZlci5mb3JtYXQgPSBmb3JtYXRcblxuICAgICAgZ2wuYmluZFJlbmRlcmJ1ZmZlcihHTF9SRU5ERVJCVUZGRVIsIHJlbmRlcmJ1ZmZlci5yZW5kZXJidWZmZXIpXG4gICAgICBnbC5yZW5kZXJidWZmZXJTdG9yYWdlKEdMX1JFTkRFUkJVRkZFUiwgZm9ybWF0LCB3LCBoKVxuXG4gICAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgICAgcmVuZGVyYnVmZmVyLnN0YXRzLnNpemUgPSBnZXRSZW5kZXJidWZmZXJTaXplKHJlbmRlcmJ1ZmZlci5mb3JtYXQsIHJlbmRlcmJ1ZmZlci53aWR0aCwgcmVuZGVyYnVmZmVyLmhlaWdodClcbiAgICAgIH1cbiAgICAgIHJlZ2xSZW5kZXJidWZmZXIuZm9ybWF0ID0gZm9ybWF0VHlwZXNJbnZlcnRbcmVuZGVyYnVmZmVyLmZvcm1hdF1cblxuICAgICAgcmV0dXJuIHJlZ2xSZW5kZXJidWZmZXJcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZXNpemUgKHdfLCBoXykge1xuICAgICAgdmFyIHcgPSB3XyB8IDBcbiAgICAgIHZhciBoID0gKGhfIHwgMCkgfHwgd1xuXG4gICAgICBpZiAodyA9PT0gcmVuZGVyYnVmZmVyLndpZHRoICYmIGggPT09IHJlbmRlcmJ1ZmZlci5oZWlnaHQpIHtcbiAgICAgICAgcmV0dXJuIHJlZ2xSZW5kZXJidWZmZXJcbiAgICAgIH1cblxuICAgICAgLy8gY2hlY2sgc2hhcGVcbiAgICAgIGNoZWNrKFxuICAgICAgICB3ID4gMCAmJiBoID4gMCAmJlxuICAgICAgICB3IDw9IGxpbWl0cy5tYXhSZW5kZXJidWZmZXJTaXplICYmIGggPD0gbGltaXRzLm1heFJlbmRlcmJ1ZmZlclNpemUsXG4gICAgICAgICdpbnZhbGlkIHJlbmRlcmJ1ZmZlciBzaXplJylcblxuICAgICAgcmVnbFJlbmRlcmJ1ZmZlci53aWR0aCA9IHJlbmRlcmJ1ZmZlci53aWR0aCA9IHdcbiAgICAgIHJlZ2xSZW5kZXJidWZmZXIuaGVpZ2h0ID0gcmVuZGVyYnVmZmVyLmhlaWdodCA9IGhcblxuICAgICAgZ2wuYmluZFJlbmRlcmJ1ZmZlcihHTF9SRU5ERVJCVUZGRVIsIHJlbmRlcmJ1ZmZlci5yZW5kZXJidWZmZXIpXG4gICAgICBnbC5yZW5kZXJidWZmZXJTdG9yYWdlKEdMX1JFTkRFUkJVRkZFUiwgcmVuZGVyYnVmZmVyLmZvcm1hdCwgdywgaClcblxuICAgICAgLy8gYWxzbywgcmVjb21wdXRlIHNpemUuXG4gICAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgICAgcmVuZGVyYnVmZmVyLnN0YXRzLnNpemUgPSBnZXRSZW5kZXJidWZmZXJTaXplKFxuICAgICAgICAgIHJlbmRlcmJ1ZmZlci5mb3JtYXQsIHJlbmRlcmJ1ZmZlci53aWR0aCwgcmVuZGVyYnVmZmVyLmhlaWdodClcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJlZ2xSZW5kZXJidWZmZXJcbiAgICB9XG5cbiAgICByZWdsUmVuZGVyYnVmZmVyKGEsIGIpXG5cbiAgICByZWdsUmVuZGVyYnVmZmVyLnJlc2l6ZSA9IHJlc2l6ZVxuICAgIHJlZ2xSZW5kZXJidWZmZXIuX3JlZ2xUeXBlID0gJ3JlbmRlcmJ1ZmZlcidcbiAgICByZWdsUmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXIgPSByZW5kZXJidWZmZXJcbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgIHJlZ2xSZW5kZXJidWZmZXIuc3RhdHMgPSByZW5kZXJidWZmZXIuc3RhdHNcbiAgICB9XG4gICAgcmVnbFJlbmRlcmJ1ZmZlci5kZXN0cm95ID0gZnVuY3Rpb24gKCkge1xuICAgICAgcmVuZGVyYnVmZmVyLmRlY1JlZigpXG4gICAgfVxuXG4gICAgcmV0dXJuIHJlZ2xSZW5kZXJidWZmZXJcbiAgfVxuXG4gIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgIHN0YXRzLmdldFRvdGFsUmVuZGVyYnVmZmVyU2l6ZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciB0b3RhbCA9IDBcbiAgICAgIE9iamVjdC5rZXlzKHJlbmRlcmJ1ZmZlclNldCkuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgIHRvdGFsICs9IHJlbmRlcmJ1ZmZlclNldFtrZXldLnN0YXRzLnNpemVcbiAgICAgIH0pXG4gICAgICByZXR1cm4gdG90YWxcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiByZXN0b3JlUmVuZGVyYnVmZmVycyAoKSB7XG4gICAgdmFsdWVzKHJlbmRlcmJ1ZmZlclNldCkuZm9yRWFjaChmdW5jdGlvbiAocmIpIHtcbiAgICAgIHJiLnJlbmRlcmJ1ZmZlciA9IGdsLmNyZWF0ZVJlbmRlcmJ1ZmZlcigpXG4gICAgICBnbC5iaW5kUmVuZGVyYnVmZmVyKEdMX1JFTkRFUkJVRkZFUiwgcmIucmVuZGVyYnVmZmVyKVxuICAgICAgZ2wucmVuZGVyYnVmZmVyU3RvcmFnZShHTF9SRU5ERVJCVUZGRVIsIHJiLmZvcm1hdCwgcmIud2lkdGgsIHJiLmhlaWdodClcbiAgICB9KVxuICAgIGdsLmJpbmRSZW5kZXJidWZmZXIoR0xfUkVOREVSQlVGRkVSLCBudWxsKVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjcmVhdGU6IGNyZWF0ZVJlbmRlcmJ1ZmZlcixcbiAgICBjbGVhcjogZnVuY3Rpb24gKCkge1xuICAgICAgdmFsdWVzKHJlbmRlcmJ1ZmZlclNldCkuZm9yRWFjaChkZXN0cm95KVxuICAgIH0sXG4gICAgcmVzdG9yZTogcmVzdG9yZVJlbmRlcmJ1ZmZlcnNcbiAgfVxufVxuIiwidmFyIGNoZWNrID0gcmVxdWlyZSgnLi91dGlsL2NoZWNrJylcbnZhciB2YWx1ZXMgPSByZXF1aXJlKCcuL3V0aWwvdmFsdWVzJylcblxudmFyIEdMX0ZSQUdNRU5UX1NIQURFUiA9IDM1NjMyXG52YXIgR0xfVkVSVEVYX1NIQURFUiA9IDM1NjMzXG5cbnZhciBHTF9BQ1RJVkVfVU5JRk9STVMgPSAweDhCODZcbnZhciBHTF9BQ1RJVkVfQVRUUklCVVRFUyA9IDB4OEI4OVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBTaGFkZXJTdGF0ZSAoZ2wsIHN0cmluZ1N0b3JlLCBzdGF0cywgY29uZmlnKSB7XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBnbHNsIGNvbXBpbGF0aW9uIGFuZCBsaW5raW5nXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICB2YXIgZnJhZ1NoYWRlcnMgPSB7fVxuICB2YXIgdmVydFNoYWRlcnMgPSB7fVxuXG4gIGZ1bmN0aW9uIEFjdGl2ZUluZm8gKG5hbWUsIGlkLCBsb2NhdGlvbiwgaW5mbykge1xuICAgIHRoaXMubmFtZSA9IG5hbWVcbiAgICB0aGlzLmlkID0gaWRcbiAgICB0aGlzLmxvY2F0aW9uID0gbG9jYXRpb25cbiAgICB0aGlzLmluZm8gPSBpbmZvXG4gIH1cblxuICBmdW5jdGlvbiBpbnNlcnRBY3RpdmVJbmZvIChsaXN0LCBpbmZvKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgKytpKSB7XG4gICAgICBpZiAobGlzdFtpXS5pZCA9PT0gaW5mby5pZCkge1xuICAgICAgICBsaXN0W2ldLmxvY2F0aW9uID0gaW5mby5sb2NhdGlvblxuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICB9XG4gICAgbGlzdC5wdXNoKGluZm8pXG4gIH1cblxuICBmdW5jdGlvbiBnZXRTaGFkZXIgKHR5cGUsIGlkLCBjb21tYW5kKSB7XG4gICAgdmFyIGNhY2hlID0gdHlwZSA9PT0gR0xfRlJBR01FTlRfU0hBREVSID8gZnJhZ1NoYWRlcnMgOiB2ZXJ0U2hhZGVyc1xuICAgIHZhciBzaGFkZXIgPSBjYWNoZVtpZF1cblxuICAgIGlmICghc2hhZGVyKSB7XG4gICAgICB2YXIgc291cmNlID0gc3RyaW5nU3RvcmUuc3RyKGlkKVxuICAgICAgc2hhZGVyID0gZ2wuY3JlYXRlU2hhZGVyKHR5cGUpXG4gICAgICBnbC5zaGFkZXJTb3VyY2Uoc2hhZGVyLCBzb3VyY2UpXG4gICAgICBnbC5jb21waWxlU2hhZGVyKHNoYWRlcilcbiAgICAgIGNoZWNrLnNoYWRlckVycm9yKGdsLCBzaGFkZXIsIHNvdXJjZSwgdHlwZSwgY29tbWFuZClcbiAgICAgIGNhY2hlW2lkXSA9IHNoYWRlclxuICAgIH1cblxuICAgIHJldHVybiBzaGFkZXJcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBwcm9ncmFtIGxpbmtpbmdcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIHZhciBwcm9ncmFtQ2FjaGUgPSB7fVxuICB2YXIgcHJvZ3JhbUxpc3QgPSBbXVxuXG4gIHZhciBQUk9HUkFNX0NPVU5URVIgPSAwXG5cbiAgZnVuY3Rpb24gUkVHTFByb2dyYW0gKGZyYWdJZCwgdmVydElkKSB7XG4gICAgdGhpcy5pZCA9IFBST0dSQU1fQ09VTlRFUisrXG4gICAgdGhpcy5mcmFnSWQgPSBmcmFnSWRcbiAgICB0aGlzLnZlcnRJZCA9IHZlcnRJZFxuICAgIHRoaXMucHJvZ3JhbSA9IG51bGxcbiAgICB0aGlzLnVuaWZvcm1zID0gW11cbiAgICB0aGlzLmF0dHJpYnV0ZXMgPSBbXVxuXG4gICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICB0aGlzLnN0YXRzID0ge1xuICAgICAgICB1bmlmb3Jtc0NvdW50OiAwLFxuICAgICAgICBhdHRyaWJ1dGVzQ291bnQ6IDBcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBsaW5rUHJvZ3JhbSAoZGVzYywgY29tbWFuZCkge1xuICAgIHZhciBpLCBpbmZvXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gY29tcGlsZSAmIGxpbmtcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgdmFyIGZyYWdTaGFkZXIgPSBnZXRTaGFkZXIoR0xfRlJBR01FTlRfU0hBREVSLCBkZXNjLmZyYWdJZClcbiAgICB2YXIgdmVydFNoYWRlciA9IGdldFNoYWRlcihHTF9WRVJURVhfU0hBREVSLCBkZXNjLnZlcnRJZClcblxuICAgIHZhciBwcm9ncmFtID0gZGVzYy5wcm9ncmFtID0gZ2wuY3JlYXRlUHJvZ3JhbSgpXG4gICAgZ2wuYXR0YWNoU2hhZGVyKHByb2dyYW0sIGZyYWdTaGFkZXIpXG4gICAgZ2wuYXR0YWNoU2hhZGVyKHByb2dyYW0sIHZlcnRTaGFkZXIpXG4gICAgZ2wubGlua1Byb2dyYW0ocHJvZ3JhbSlcbiAgICBjaGVjay5saW5rRXJyb3IoXG4gICAgICBnbCxcbiAgICAgIHByb2dyYW0sXG4gICAgICBzdHJpbmdTdG9yZS5zdHIoZGVzYy5mcmFnSWQpLFxuICAgICAgc3RyaW5nU3RvcmUuc3RyKGRlc2MudmVydElkKSxcbiAgICAgIGNvbW1hbmQpXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gZ3JhYiB1bmlmb3Jtc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICB2YXIgbnVtVW5pZm9ybXMgPSBnbC5nZXRQcm9ncmFtUGFyYW1ldGVyKHByb2dyYW0sIEdMX0FDVElWRV9VTklGT1JNUylcbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgIGRlc2Muc3RhdHMudW5pZm9ybXNDb3VudCA9IG51bVVuaWZvcm1zXG4gICAgfVxuICAgIHZhciB1bmlmb3JtcyA9IGRlc2MudW5pZm9ybXNcbiAgICBmb3IgKGkgPSAwOyBpIDwgbnVtVW5pZm9ybXM7ICsraSkge1xuICAgICAgaW5mbyA9IGdsLmdldEFjdGl2ZVVuaWZvcm0ocHJvZ3JhbSwgaSlcbiAgICAgIGlmIChpbmZvKSB7XG4gICAgICAgIGlmIChpbmZvLnNpemUgPiAxKSB7XG4gICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBpbmZvLnNpemU7ICsraikge1xuICAgICAgICAgICAgdmFyIG5hbWUgPSBpbmZvLm5hbWUucmVwbGFjZSgnWzBdJywgJ1snICsgaiArICddJylcbiAgICAgICAgICAgIGluc2VydEFjdGl2ZUluZm8odW5pZm9ybXMsIG5ldyBBY3RpdmVJbmZvKFxuICAgICAgICAgICAgICBuYW1lLFxuICAgICAgICAgICAgICBzdHJpbmdTdG9yZS5pZChuYW1lKSxcbiAgICAgICAgICAgICAgZ2wuZ2V0VW5pZm9ybUxvY2F0aW9uKHByb2dyYW0sIG5hbWUpLFxuICAgICAgICAgICAgICBpbmZvKSlcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaW5zZXJ0QWN0aXZlSW5mbyh1bmlmb3JtcywgbmV3IEFjdGl2ZUluZm8oXG4gICAgICAgICAgICBpbmZvLm5hbWUsXG4gICAgICAgICAgICBzdHJpbmdTdG9yZS5pZChpbmZvLm5hbWUpLFxuICAgICAgICAgICAgZ2wuZ2V0VW5pZm9ybUxvY2F0aW9uKHByb2dyYW0sIGluZm8ubmFtZSksXG4gICAgICAgICAgICBpbmZvKSlcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBncmFiIGF0dHJpYnV0ZXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgdmFyIG51bUF0dHJpYnV0ZXMgPSBnbC5nZXRQcm9ncmFtUGFyYW1ldGVyKHByb2dyYW0sIEdMX0FDVElWRV9BVFRSSUJVVEVTKVxuICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgZGVzYy5zdGF0cy5hdHRyaWJ1dGVzQ291bnQgPSBudW1BdHRyaWJ1dGVzXG4gICAgfVxuXG4gICAgdmFyIGF0dHJpYnV0ZXMgPSBkZXNjLmF0dHJpYnV0ZXNcbiAgICBmb3IgKGkgPSAwOyBpIDwgbnVtQXR0cmlidXRlczsgKytpKSB7XG4gICAgICBpbmZvID0gZ2wuZ2V0QWN0aXZlQXR0cmliKHByb2dyYW0sIGkpXG4gICAgICBpZiAoaW5mbykge1xuICAgICAgICBpbnNlcnRBY3RpdmVJbmZvKGF0dHJpYnV0ZXMsIG5ldyBBY3RpdmVJbmZvKFxuICAgICAgICAgIGluZm8ubmFtZSxcbiAgICAgICAgICBzdHJpbmdTdG9yZS5pZChpbmZvLm5hbWUpLFxuICAgICAgICAgIGdsLmdldEF0dHJpYkxvY2F0aW9uKHByb2dyYW0sIGluZm8ubmFtZSksXG4gICAgICAgICAgaW5mbykpXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgc3RhdHMuZ2V0TWF4VW5pZm9ybXNDb3VudCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBtID0gMFxuICAgICAgcHJvZ3JhbUxpc3QuZm9yRWFjaChmdW5jdGlvbiAoZGVzYykge1xuICAgICAgICBpZiAoZGVzYy5zdGF0cy51bmlmb3Jtc0NvdW50ID4gbSkge1xuICAgICAgICAgIG0gPSBkZXNjLnN0YXRzLnVuaWZvcm1zQ291bnRcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIHJldHVybiBtXG4gICAgfVxuXG4gICAgc3RhdHMuZ2V0TWF4QXR0cmlidXRlc0NvdW50ID0gZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIG0gPSAwXG4gICAgICBwcm9ncmFtTGlzdC5mb3JFYWNoKGZ1bmN0aW9uIChkZXNjKSB7XG4gICAgICAgIGlmIChkZXNjLnN0YXRzLmF0dHJpYnV0ZXNDb3VudCA+IG0pIHtcbiAgICAgICAgICBtID0gZGVzYy5zdGF0cy5hdHRyaWJ1dGVzQ291bnRcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIHJldHVybiBtXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcmVzdG9yZVNoYWRlcnMgKCkge1xuICAgIGZyYWdTaGFkZXJzID0ge31cbiAgICB2ZXJ0U2hhZGVycyA9IHt9XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwcm9ncmFtTGlzdC5sZW5ndGg7ICsraSkge1xuICAgICAgbGlua1Byb2dyYW0ocHJvZ3JhbUxpc3RbaV0pXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjbGVhcjogZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIGRlbGV0ZVNoYWRlciA9IGdsLmRlbGV0ZVNoYWRlci5iaW5kKGdsKVxuICAgICAgdmFsdWVzKGZyYWdTaGFkZXJzKS5mb3JFYWNoKGRlbGV0ZVNoYWRlcilcbiAgICAgIGZyYWdTaGFkZXJzID0ge31cbiAgICAgIHZhbHVlcyh2ZXJ0U2hhZGVycykuZm9yRWFjaChkZWxldGVTaGFkZXIpXG4gICAgICB2ZXJ0U2hhZGVycyA9IHt9XG5cbiAgICAgIHByb2dyYW1MaXN0LmZvckVhY2goZnVuY3Rpb24gKGRlc2MpIHtcbiAgICAgICAgZ2wuZGVsZXRlUHJvZ3JhbShkZXNjLnByb2dyYW0pXG4gICAgICB9KVxuICAgICAgcHJvZ3JhbUxpc3QubGVuZ3RoID0gMFxuICAgICAgcHJvZ3JhbUNhY2hlID0ge31cblxuICAgICAgc3RhdHMuc2hhZGVyQ291bnQgPSAwXG4gICAgfSxcblxuICAgIHByb2dyYW06IGZ1bmN0aW9uICh2ZXJ0SWQsIGZyYWdJZCwgY29tbWFuZCkge1xuICAgICAgY2hlY2suY29tbWFuZCh2ZXJ0SWQgPj0gMCwgJ21pc3NpbmcgdmVydGV4IHNoYWRlcicsIGNvbW1hbmQpXG4gICAgICBjaGVjay5jb21tYW5kKGZyYWdJZCA+PSAwLCAnbWlzc2luZyBmcmFnbWVudCBzaGFkZXInLCBjb21tYW5kKVxuXG4gICAgICB2YXIgY2FjaGUgPSBwcm9ncmFtQ2FjaGVbZnJhZ0lkXVxuICAgICAgaWYgKCFjYWNoZSkge1xuICAgICAgICBjYWNoZSA9IHByb2dyYW1DYWNoZVtmcmFnSWRdID0ge31cbiAgICAgIH1cbiAgICAgIHZhciBwcm9ncmFtID0gY2FjaGVbdmVydElkXVxuICAgICAgaWYgKCFwcm9ncmFtKSB7XG4gICAgICAgIHByb2dyYW0gPSBuZXcgUkVHTFByb2dyYW0oZnJhZ0lkLCB2ZXJ0SWQpXG4gICAgICAgIHN0YXRzLnNoYWRlckNvdW50KytcblxuICAgICAgICBsaW5rUHJvZ3JhbShwcm9ncmFtLCBjb21tYW5kKVxuICAgICAgICBjYWNoZVt2ZXJ0SWRdID0gcHJvZ3JhbVxuICAgICAgICBwcm9ncmFtTGlzdC5wdXNoKHByb2dyYW0pXG4gICAgICB9XG4gICAgICByZXR1cm4gcHJvZ3JhbVxuICAgIH0sXG5cbiAgICByZXN0b3JlOiByZXN0b3JlU2hhZGVycyxcblxuICAgIHNoYWRlcjogZ2V0U2hhZGVyLFxuXG4gICAgZnJhZzogLTEsXG4gICAgdmVydDogLTFcbiAgfVxufVxuIiwiXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHN0YXRzICgpIHtcbiAgcmV0dXJuIHtcbiAgICBidWZmZXJDb3VudDogMCxcbiAgICBlbGVtZW50c0NvdW50OiAwLFxuICAgIGZyYW1lYnVmZmVyQ291bnQ6IDAsXG4gICAgc2hhZGVyQ291bnQ6IDAsXG4gICAgdGV4dHVyZUNvdW50OiAwLFxuICAgIGN1YmVDb3VudDogMCxcbiAgICByZW5kZXJidWZmZXJDb3VudDogMCxcblxuICAgIG1heFRleHR1cmVVbml0czogMFxuICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNyZWF0ZVN0cmluZ1N0b3JlICgpIHtcbiAgdmFyIHN0cmluZ0lkcyA9IHsnJzogMH1cbiAgdmFyIHN0cmluZ1ZhbHVlcyA9IFsnJ11cbiAgcmV0dXJuIHtcbiAgICBpZDogZnVuY3Rpb24gKHN0cikge1xuICAgICAgdmFyIHJlc3VsdCA9IHN0cmluZ0lkc1tzdHJdXG4gICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH1cbiAgICAgIHJlc3VsdCA9IHN0cmluZ0lkc1tzdHJdID0gc3RyaW5nVmFsdWVzLmxlbmd0aFxuICAgICAgc3RyaW5nVmFsdWVzLnB1c2goc3RyKVxuICAgICAgcmV0dXJuIHJlc3VsdFxuICAgIH0sXG5cbiAgICBzdHI6IGZ1bmN0aW9uIChpZCkge1xuICAgICAgcmV0dXJuIHN0cmluZ1ZhbHVlc1tpZF1cbiAgICB9XG4gIH1cbn1cbiIsInZhciBjaGVjayA9IHJlcXVpcmUoJy4vdXRpbC9jaGVjaycpXG52YXIgZXh0ZW5kID0gcmVxdWlyZSgnLi91dGlsL2V4dGVuZCcpXG52YXIgdmFsdWVzID0gcmVxdWlyZSgnLi91dGlsL3ZhbHVlcycpXG52YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi91dGlsL2lzLXR5cGVkLWFycmF5JylcbnZhciBpc05EQXJyYXlMaWtlID0gcmVxdWlyZSgnLi91dGlsL2lzLW5kYXJyYXknKVxudmFyIHBvb2wgPSByZXF1aXJlKCcuL3V0aWwvcG9vbCcpXG52YXIgY29udmVydFRvSGFsZkZsb2F0ID0gcmVxdWlyZSgnLi91dGlsL3RvLWhhbGYtZmxvYXQnKVxudmFyIGlzQXJyYXlMaWtlID0gcmVxdWlyZSgnLi91dGlsL2lzLWFycmF5LWxpa2UnKVxudmFyIGZsYXR0ZW5VdGlscyA9IHJlcXVpcmUoJy4vdXRpbC9mbGF0dGVuJylcblxudmFyIGR0eXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL2FycmF5dHlwZXMuanNvbicpXG52YXIgYXJyYXlUeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL2FycmF5dHlwZXMuanNvbicpXG5cbnZhciBHTF9DT01QUkVTU0VEX1RFWFRVUkVfRk9STUFUUyA9IDB4ODZBM1xuXG52YXIgR0xfVEVYVFVSRV8yRCA9IDB4MERFMVxudmFyIEdMX1RFWFRVUkVfQ1VCRV9NQVAgPSAweDg1MTNcbnZhciBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1ggPSAweDg1MTVcblxudmFyIEdMX1JHQkEgPSAweDE5MDhcbnZhciBHTF9BTFBIQSA9IDB4MTkwNlxudmFyIEdMX1JHQiA9IDB4MTkwN1xudmFyIEdMX0xVTUlOQU5DRSA9IDB4MTkwOVxudmFyIEdMX0xVTUlOQU5DRV9BTFBIQSA9IDB4MTkwQVxuXG52YXIgR0xfUkdCQTQgPSAweDgwNTZcbnZhciBHTF9SR0I1X0ExID0gMHg4MDU3XG52YXIgR0xfUkdCNTY1ID0gMHg4RDYyXG5cbnZhciBHTF9VTlNJR05FRF9TSE9SVF80XzRfNF80ID0gMHg4MDMzXG52YXIgR0xfVU5TSUdORURfU0hPUlRfNV81XzVfMSA9IDB4ODAzNFxudmFyIEdMX1VOU0lHTkVEX1NIT1JUXzVfNl81ID0gMHg4MzYzXG52YXIgR0xfVU5TSUdORURfSU5UXzI0XzhfV0VCR0wgPSAweDg0RkFcblxudmFyIEdMX0RFUFRIX0NPTVBPTkVOVCA9IDB4MTkwMlxudmFyIEdMX0RFUFRIX1NURU5DSUwgPSAweDg0RjlcblxudmFyIEdMX1NSR0JfRVhUID0gMHg4QzQwXG52YXIgR0xfU1JHQl9BTFBIQV9FWFQgPSAweDhDNDJcblxudmFyIEdMX0hBTEZfRkxPQVRfT0VTID0gMHg4RDYxXG5cbnZhciBHTF9DT01QUkVTU0VEX1JHQl9TM1RDX0RYVDFfRVhUID0gMHg4M0YwXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUMV9FWFQgPSAweDgzRjFcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQzX0VYVCA9IDB4ODNGMlxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDVfRVhUID0gMHg4M0YzXG5cbnZhciBHTF9DT01QUkVTU0VEX1JHQl9BVENfV0VCR0wgPSAweDhDOTJcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfQVRDX0VYUExJQ0lUX0FMUEhBX1dFQkdMID0gMHg4QzkzXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19JTlRFUlBPTEFURURfQUxQSEFfV0VCR0wgPSAweDg3RUVcblxudmFyIEdMX0NPTVBSRVNTRURfUkdCX1BWUlRDXzRCUFBWMV9JTUcgPSAweDhDMDBcbnZhciBHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ18yQlBQVjFfSU1HID0gMHg4QzAxXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1BWUlRDXzRCUFBWMV9JTUcgPSAweDhDMDJcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUFZSVENfMkJQUFYxX0lNRyA9IDB4OEMwM1xuXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfRVRDMV9XRUJHTCA9IDB4OEQ2NFxuXG52YXIgR0xfVU5TSUdORURfQllURSA9IDB4MTQwMVxudmFyIEdMX1VOU0lHTkVEX1NIT1JUID0gMHgxNDAzXG52YXIgR0xfVU5TSUdORURfSU5UID0gMHgxNDA1XG52YXIgR0xfRkxPQVQgPSAweDE0MDZcblxudmFyIEdMX1RFWFRVUkVfV1JBUF9TID0gMHgyODAyXG52YXIgR0xfVEVYVFVSRV9XUkFQX1QgPSAweDI4MDNcblxudmFyIEdMX1JFUEVBVCA9IDB4MjkwMVxudmFyIEdMX0NMQU1QX1RPX0VER0UgPSAweDgxMkZcbnZhciBHTF9NSVJST1JFRF9SRVBFQVQgPSAweDgzNzBcblxudmFyIEdMX1RFWFRVUkVfTUFHX0ZJTFRFUiA9IDB4MjgwMFxudmFyIEdMX1RFWFRVUkVfTUlOX0ZJTFRFUiA9IDB4MjgwMVxuXG52YXIgR0xfTkVBUkVTVCA9IDB4MjYwMFxudmFyIEdMX0xJTkVBUiA9IDB4MjYwMVxudmFyIEdMX05FQVJFU1RfTUlQTUFQX05FQVJFU1QgPSAweDI3MDBcbnZhciBHTF9MSU5FQVJfTUlQTUFQX05FQVJFU1QgPSAweDI3MDFcbnZhciBHTF9ORUFSRVNUX01JUE1BUF9MSU5FQVIgPSAweDI3MDJcbnZhciBHTF9MSU5FQVJfTUlQTUFQX0xJTkVBUiA9IDB4MjcwM1xuXG52YXIgR0xfR0VORVJBVEVfTUlQTUFQX0hJTlQgPSAweDgxOTJcbnZhciBHTF9ET05UX0NBUkUgPSAweDExMDBcbnZhciBHTF9GQVNURVNUID0gMHgxMTAxXG52YXIgR0xfTklDRVNUID0gMHgxMTAyXG5cbnZhciBHTF9URVhUVVJFX01BWF9BTklTT1RST1BZX0VYVCA9IDB4ODRGRVxuXG52YXIgR0xfVU5QQUNLX0FMSUdOTUVOVCA9IDB4MENGNVxudmFyIEdMX1VOUEFDS19GTElQX1lfV0VCR0wgPSAweDkyNDBcbnZhciBHTF9VTlBBQ0tfUFJFTVVMVElQTFlfQUxQSEFfV0VCR0wgPSAweDkyNDFcbnZhciBHTF9VTlBBQ0tfQ09MT1JTUEFDRV9DT05WRVJTSU9OX1dFQkdMID0gMHg5MjQzXG5cbnZhciBHTF9CUk9XU0VSX0RFRkFVTFRfV0VCR0wgPSAweDkyNDRcblxudmFyIEdMX1RFWFRVUkUwID0gMHg4NEMwXG5cbnZhciBNSVBNQVBfRklMVEVSUyA9IFtcbiAgR0xfTkVBUkVTVF9NSVBNQVBfTkVBUkVTVCxcbiAgR0xfTkVBUkVTVF9NSVBNQVBfTElORUFSLFxuICBHTF9MSU5FQVJfTUlQTUFQX05FQVJFU1QsXG4gIEdMX0xJTkVBUl9NSVBNQVBfTElORUFSXG5dXG5cbnZhciBDSEFOTkVMU19GT1JNQVQgPSBbXG4gIDAsXG4gIEdMX0xVTUlOQU5DRSxcbiAgR0xfTFVNSU5BTkNFX0FMUEhBLFxuICBHTF9SR0IsXG4gIEdMX1JHQkFcbl1cblxudmFyIEZPUk1BVF9DSEFOTkVMUyA9IHt9XG5GT1JNQVRfQ0hBTk5FTFNbR0xfTFVNSU5BTkNFXSA9XG5GT1JNQVRfQ0hBTk5FTFNbR0xfQUxQSEFdID1cbkZPUk1BVF9DSEFOTkVMU1tHTF9ERVBUSF9DT01QT05FTlRdID0gMVxuRk9STUFUX0NIQU5ORUxTW0dMX0RFUFRIX1NURU5DSUxdID1cbkZPUk1BVF9DSEFOTkVMU1tHTF9MVU1JTkFOQ0VfQUxQSEFdID0gMlxuRk9STUFUX0NIQU5ORUxTW0dMX1JHQl0gPVxuRk9STUFUX0NIQU5ORUxTW0dMX1NSR0JfRVhUXSA9IDNcbkZPUk1BVF9DSEFOTkVMU1tHTF9SR0JBXSA9XG5GT1JNQVRfQ0hBTk5FTFNbR0xfU1JHQl9BTFBIQV9FWFRdID0gNFxuXG52YXIgZm9ybWF0VHlwZXMgPSB7fVxuZm9ybWF0VHlwZXNbR0xfUkdCQTRdID0gR0xfVU5TSUdORURfU0hPUlRfNF80XzRfNFxuZm9ybWF0VHlwZXNbR0xfUkdCNTY1XSA9IEdMX1VOU0lHTkVEX1NIT1JUXzVfNl81XG5mb3JtYXRUeXBlc1tHTF9SR0I1X0ExXSA9IEdMX1VOU0lHTkVEX1NIT1JUXzVfNV81XzFcbmZvcm1hdFR5cGVzW0dMX0RFUFRIX0NPTVBPTkVOVF0gPSBHTF9VTlNJR05FRF9JTlRcbmZvcm1hdFR5cGVzW0dMX0RFUFRIX1NURU5DSUxdID0gR0xfVU5TSUdORURfSU5UXzI0XzhfV0VCR0xcblxuZnVuY3Rpb24gb2JqZWN0TmFtZSAoc3RyKSB7XG4gIHJldHVybiAnW29iamVjdCAnICsgc3RyICsgJ10nXG59XG5cbnZhciBDQU5WQVNfQ0xBU1MgPSBvYmplY3ROYW1lKCdIVE1MQ2FudmFzRWxlbWVudCcpXG52YXIgQ09OVEVYVDJEX0NMQVNTID0gb2JqZWN0TmFtZSgnQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEJylcbnZhciBJTUFHRV9DTEFTUyA9IG9iamVjdE5hbWUoJ0hUTUxJbWFnZUVsZW1lbnQnKVxudmFyIFZJREVPX0NMQVNTID0gb2JqZWN0TmFtZSgnSFRNTFZpZGVvRWxlbWVudCcpXG5cbnZhciBQSVhFTF9DTEFTU0VTID0gT2JqZWN0LmtleXMoZHR5cGVzKS5jb25jYXQoW1xuICBDQU5WQVNfQ0xBU1MsXG4gIENPTlRFWFQyRF9DTEFTUyxcbiAgSU1BR0VfQ0xBU1MsXG4gIFZJREVPX0NMQVNTXG5dKVxuXG4vLyBmb3IgZXZlcnkgdGV4dHVyZSB0eXBlLCBzdG9yZVxuLy8gdGhlIHNpemUgaW4gYnl0ZXMuXG52YXIgVFlQRV9TSVpFUyA9IFtdXG5UWVBFX1NJWkVTW0dMX1VOU0lHTkVEX0JZVEVdID0gMVxuVFlQRV9TSVpFU1tHTF9GTE9BVF0gPSA0XG5UWVBFX1NJWkVTW0dMX0hBTEZfRkxPQVRfT0VTXSA9IDJcblxuVFlQRV9TSVpFU1tHTF9VTlNJR05FRF9TSE9SVF0gPSAyXG5UWVBFX1NJWkVTW0dMX1VOU0lHTkVEX0lOVF0gPSA0XG5cbnZhciBGT1JNQVRfU0laRVNfU1BFQ0lBTCA9IFtdXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9SR0JBNF0gPSAyXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9SR0I1X0ExXSA9IDJcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX1JHQjU2NV0gPSAyXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9ERVBUSF9TVEVOQ0lMXSA9IDRcblxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JfUzNUQ19EWFQxX0VYVF0gPSAwLjVcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDFfRVhUXSA9IDAuNVxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUM19FWFRdID0gMVxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUNV9FWFRdID0gMVxuXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQl9BVENfV0VCR0xdID0gMC41XG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQkFfQVRDX0VYUExJQ0lUX0FMUEhBX1dFQkdMXSA9IDFcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCQV9BVENfSU5URVJQT0xBVEVEX0FMUEhBX1dFQkdMXSA9IDFcblxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JfUFZSVENfNEJQUFYxX0lNR10gPSAwLjVcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCX1BWUlRDXzJCUFBWMV9JTUddID0gMC4yNVxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JBX1BWUlRDXzRCUFBWMV9JTUddID0gMC41XG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQkFfUFZSVENfMkJQUFYxX0lNR10gPSAwLjI1XG5cbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCX0VUQzFfV0VCR0xdID0gMC41XG5cbmZ1bmN0aW9uIGlzTnVtZXJpY0FycmF5IChhcnIpIHtcbiAgcmV0dXJuIChcbiAgICBBcnJheS5pc0FycmF5KGFycikgJiZcbiAgICAoYXJyLmxlbmd0aCA9PT0gMCB8fFxuICAgIHR5cGVvZiBhcnJbMF0gPT09ICdudW1iZXInKSlcbn1cblxuZnVuY3Rpb24gaXNSZWN0QXJyYXkgKGFycikge1xuICBpZiAoIUFycmF5LmlzQXJyYXkoYXJyKSkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG4gIHZhciB3aWR0aCA9IGFyci5sZW5ndGhcbiAgaWYgKHdpZHRoID09PSAwIHx8ICFpc0FycmF5TGlrZShhcnJbMF0pKSB7XG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cbiAgcmV0dXJuIHRydWVcbn1cblxuZnVuY3Rpb24gY2xhc3NTdHJpbmcgKHgpIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh4KVxufVxuXG5mdW5jdGlvbiBpc0NhbnZhc0VsZW1lbnQgKG9iamVjdCkge1xuICByZXR1cm4gY2xhc3NTdHJpbmcob2JqZWN0KSA9PT0gQ0FOVkFTX0NMQVNTXG59XG5cbmZ1bmN0aW9uIGlzQ29udGV4dDJEIChvYmplY3QpIHtcbiAgcmV0dXJuIGNsYXNzU3RyaW5nKG9iamVjdCkgPT09IENPTlRFWFQyRF9DTEFTU1xufVxuXG5mdW5jdGlvbiBpc0ltYWdlRWxlbWVudCAob2JqZWN0KSB7XG4gIHJldHVybiBjbGFzc1N0cmluZyhvYmplY3QpID09PSBJTUFHRV9DTEFTU1xufVxuXG5mdW5jdGlvbiBpc1ZpZGVvRWxlbWVudCAob2JqZWN0KSB7XG4gIHJldHVybiBjbGFzc1N0cmluZyhvYmplY3QpID09PSBWSURFT19DTEFTU1xufVxuXG5mdW5jdGlvbiBpc1BpeGVsRGF0YSAob2JqZWN0KSB7XG4gIGlmICghb2JqZWN0KSB7XG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cbiAgdmFyIGNsYXNzTmFtZSA9IGNsYXNzU3RyaW5nKG9iamVjdClcbiAgaWYgKFBJWEVMX0NMQVNTRVMuaW5kZXhPZihjbGFzc05hbWUpID49IDApIHtcbiAgICByZXR1cm4gdHJ1ZVxuICB9XG4gIHJldHVybiAoXG4gICAgaXNOdW1lcmljQXJyYXkob2JqZWN0KSB8fFxuICAgIGlzUmVjdEFycmF5KG9iamVjdCkgfHxcbiAgICBpc05EQXJyYXlMaWtlKG9iamVjdCkpXG59XG5cbmZ1bmN0aW9uIHR5cGVkQXJyYXlDb2RlIChkYXRhKSB7XG4gIHJldHVybiBhcnJheVR5cGVzW09iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChkYXRhKV0gfCAwXG59XG5cbmZ1bmN0aW9uIGNvbnZlcnREYXRhIChyZXN1bHQsIGRhdGEpIHtcbiAgdmFyIG4gPSBkYXRhLmxlbmd0aFxuICBzd2l0Y2ggKHJlc3VsdC50eXBlKSB7XG4gICAgY2FzZSBHTF9VTlNJR05FRF9CWVRFOlxuICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlQ6XG4gICAgY2FzZSBHTF9VTlNJR05FRF9JTlQ6XG4gICAgY2FzZSBHTF9GTE9BVDpcbiAgICAgIHZhciBjb252ZXJ0ZWQgPSBwb29sLmFsbG9jVHlwZShyZXN1bHQudHlwZSwgbilcbiAgICAgIGNvbnZlcnRlZC5zZXQoZGF0YSlcbiAgICAgIHJlc3VsdC5kYXRhID0gY29udmVydGVkXG4gICAgICBicmVha1xuXG4gICAgY2FzZSBHTF9IQUxGX0ZMT0FUX09FUzpcbiAgICAgIHJlc3VsdC5kYXRhID0gY29udmVydFRvSGFsZkZsb2F0KGRhdGEpXG4gICAgICBicmVha1xuXG4gICAgZGVmYXVsdDpcbiAgICAgIGNoZWNrLnJhaXNlKCd1bnN1cHBvcnRlZCB0ZXh0dXJlIHR5cGUsIG11c3Qgc3BlY2lmeSBhIHR5cGVkIGFycmF5JylcbiAgfVxufVxuXG5mdW5jdGlvbiBwcmVDb252ZXJ0IChpbWFnZSwgbikge1xuICByZXR1cm4gcG9vbC5hbGxvY1R5cGUoXG4gICAgaW1hZ2UudHlwZSA9PT0gR0xfSEFMRl9GTE9BVF9PRVNcbiAgICAgID8gR0xfRkxPQVRcbiAgICAgIDogaW1hZ2UudHlwZSwgbilcbn1cblxuZnVuY3Rpb24gcG9zdENvbnZlcnQgKGltYWdlLCBkYXRhKSB7XG4gIGlmIChpbWFnZS50eXBlID09PSBHTF9IQUxGX0ZMT0FUX09FUykge1xuICAgIGltYWdlLmRhdGEgPSBjb252ZXJ0VG9IYWxmRmxvYXQoZGF0YSlcbiAgICBwb29sLmZyZWVUeXBlKGRhdGEpXG4gIH0gZWxzZSB7XG4gICAgaW1hZ2UuZGF0YSA9IGRhdGFcbiAgfVxufVxuXG5mdW5jdGlvbiB0cmFuc3Bvc2VEYXRhIChpbWFnZSwgYXJyYXksIHN0cmlkZVgsIHN0cmlkZVksIHN0cmlkZUMsIG9mZnNldCkge1xuICB2YXIgdyA9IGltYWdlLndpZHRoXG4gIHZhciBoID0gaW1hZ2UuaGVpZ2h0XG4gIHZhciBjID0gaW1hZ2UuY2hhbm5lbHNcbiAgdmFyIG4gPSB3ICogaCAqIGNcbiAgdmFyIGRhdGEgPSBwcmVDb252ZXJ0KGltYWdlLCBuKVxuXG4gIHZhciBwID0gMFxuICBmb3IgKHZhciBpID0gMDsgaSA8IGg7ICsraSkge1xuICAgIGZvciAodmFyIGogPSAwOyBqIDwgdzsgKytqKSB7XG4gICAgICBmb3IgKHZhciBrID0gMDsgayA8IGM7ICsraykge1xuICAgICAgICBkYXRhW3ArK10gPSBhcnJheVtzdHJpZGVYICogaiArIHN0cmlkZVkgKiBpICsgc3RyaWRlQyAqIGsgKyBvZmZzZXRdXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcG9zdENvbnZlcnQoaW1hZ2UsIGRhdGEpXG59XG5cbmZ1bmN0aW9uIGdldFRleHR1cmVTaXplIChmb3JtYXQsIHR5cGUsIHdpZHRoLCBoZWlnaHQsIGlzTWlwbWFwLCBpc0N1YmUpIHtcbiAgdmFyIHNcbiAgaWYgKHR5cGVvZiBGT1JNQVRfU0laRVNfU1BFQ0lBTFtmb3JtYXRdICE9PSAndW5kZWZpbmVkJykge1xuICAgIC8vIHdlIGhhdmUgYSBzcGVjaWFsIGFycmF5IGZvciBkZWFsaW5nIHdpdGggd2VpcmQgY29sb3IgZm9ybWF0cyBzdWNoIGFzIFJHQjVBMVxuICAgIHMgPSBGT1JNQVRfU0laRVNfU1BFQ0lBTFtmb3JtYXRdXG4gIH0gZWxzZSB7XG4gICAgcyA9IEZPUk1BVF9DSEFOTkVMU1tmb3JtYXRdICogVFlQRV9TSVpFU1t0eXBlXVxuICB9XG5cbiAgaWYgKGlzQ3ViZSkge1xuICAgIHMgKj0gNlxuICB9XG5cbiAgaWYgKGlzTWlwbWFwKSB7XG4gICAgLy8gY29tcHV0ZSB0aGUgdG90YWwgc2l6ZSBvZiBhbGwgdGhlIG1pcG1hcHMuXG4gICAgdmFyIHRvdGFsID0gMFxuXG4gICAgdmFyIHcgPSB3aWR0aFxuICAgIHdoaWxlICh3ID49IDEpIHtcbiAgICAgIC8vIHdlIGNhbiBvbmx5IHVzZSBtaXBtYXBzIG9uIGEgc3F1YXJlIGltYWdlLFxuICAgICAgLy8gc28gd2UgY2FuIHNpbXBseSB1c2UgdGhlIHdpZHRoIGFuZCBpZ25vcmUgdGhlIGhlaWdodDpcbiAgICAgIHRvdGFsICs9IHMgKiB3ICogd1xuICAgICAgdyAvPSAyXG4gICAgfVxuICAgIHJldHVybiB0b3RhbFxuICB9IGVsc2Uge1xuICAgIHJldHVybiBzICogd2lkdGggKiBoZWlnaHRcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNyZWF0ZVRleHR1cmVTZXQgKFxuICBnbCwgZXh0ZW5zaW9ucywgbGltaXRzLCByZWdsUG9sbCwgY29udGV4dFN0YXRlLCBzdGF0cywgY29uZmlnKSB7XG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gSW5pdGlhbGl6ZSBjb25zdGFudHMgYW5kIHBhcmFtZXRlciB0YWJsZXMgaGVyZVxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIHZhciBtaXBtYXBIaW50ID0ge1xuICAgIFwiZG9uJ3QgY2FyZVwiOiBHTF9ET05UX0NBUkUsXG4gICAgJ2RvbnQgY2FyZSc6IEdMX0RPTlRfQ0FSRSxcbiAgICAnbmljZSc6IEdMX05JQ0VTVCxcbiAgICAnZmFzdCc6IEdMX0ZBU1RFU1RcbiAgfVxuXG4gIHZhciB3cmFwTW9kZXMgPSB7XG4gICAgJ3JlcGVhdCc6IEdMX1JFUEVBVCxcbiAgICAnY2xhbXAnOiBHTF9DTEFNUF9UT19FREdFLFxuICAgICdtaXJyb3InOiBHTF9NSVJST1JFRF9SRVBFQVRcbiAgfVxuXG4gIHZhciBtYWdGaWx0ZXJzID0ge1xuICAgICduZWFyZXN0JzogR0xfTkVBUkVTVCxcbiAgICAnbGluZWFyJzogR0xfTElORUFSXG4gIH1cblxuICB2YXIgbWluRmlsdGVycyA9IGV4dGVuZCh7XG4gICAgJ21pcG1hcCc6IEdMX0xJTkVBUl9NSVBNQVBfTElORUFSLFxuICAgICduZWFyZXN0IG1pcG1hcCBuZWFyZXN0JzogR0xfTkVBUkVTVF9NSVBNQVBfTkVBUkVTVCxcbiAgICAnbGluZWFyIG1pcG1hcCBuZWFyZXN0JzogR0xfTElORUFSX01JUE1BUF9ORUFSRVNULFxuICAgICduZWFyZXN0IG1pcG1hcCBsaW5lYXInOiBHTF9ORUFSRVNUX01JUE1BUF9MSU5FQVIsXG4gICAgJ2xpbmVhciBtaXBtYXAgbGluZWFyJzogR0xfTElORUFSX01JUE1BUF9MSU5FQVJcbiAgfSwgbWFnRmlsdGVycylcblxuICB2YXIgY29sb3JTcGFjZSA9IHtcbiAgICAnbm9uZSc6IDAsXG4gICAgJ2Jyb3dzZXInOiBHTF9CUk9XU0VSX0RFRkFVTFRfV0VCR0xcbiAgfVxuXG4gIHZhciB0ZXh0dXJlVHlwZXMgPSB7XG4gICAgJ3VpbnQ4JzogR0xfVU5TSUdORURfQllURSxcbiAgICAncmdiYTQnOiBHTF9VTlNJR05FRF9TSE9SVF80XzRfNF80LFxuICAgICdyZ2I1NjUnOiBHTF9VTlNJR05FRF9TSE9SVF81XzZfNSxcbiAgICAncmdiNSBhMSc6IEdMX1VOU0lHTkVEX1NIT1JUXzVfNV81XzFcbiAgfVxuXG4gIHZhciB0ZXh0dXJlRm9ybWF0cyA9IHtcbiAgICAnYWxwaGEnOiBHTF9BTFBIQSxcbiAgICAnbHVtaW5hbmNlJzogR0xfTFVNSU5BTkNFLFxuICAgICdsdW1pbmFuY2UgYWxwaGEnOiBHTF9MVU1JTkFOQ0VfQUxQSEEsXG4gICAgJ3JnYic6IEdMX1JHQixcbiAgICAncmdiYSc6IEdMX1JHQkEsXG4gICAgJ3JnYmE0JzogR0xfUkdCQTQsXG4gICAgJ3JnYjUgYTEnOiBHTF9SR0I1X0ExLFxuICAgICdyZ2I1NjUnOiBHTF9SR0I1NjVcbiAgfVxuXG4gIHZhciBjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHMgPSB7fVxuXG4gIGlmIChleHRlbnNpb25zLmV4dF9zcmdiKSB7XG4gICAgdGV4dHVyZUZvcm1hdHMuc3JnYiA9IEdMX1NSR0JfRVhUXG4gICAgdGV4dHVyZUZvcm1hdHMuc3JnYmEgPSBHTF9TUkdCX0FMUEhBX0VYVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMub2VzX3RleHR1cmVfZmxvYXQpIHtcbiAgICB0ZXh0dXJlVHlwZXMuZmxvYXQzMiA9IHRleHR1cmVUeXBlcy5mbG9hdCA9IEdMX0ZMT0FUXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9oYWxmX2Zsb2F0KSB7XG4gICAgdGV4dHVyZVR5cGVzWydmbG9hdDE2J10gPSB0ZXh0dXJlVHlwZXNbJ2hhbGYgZmxvYXQnXSA9IEdMX0hBTEZfRkxPQVRfT0VTXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9kZXB0aF90ZXh0dXJlKSB7XG4gICAgZXh0ZW5kKHRleHR1cmVGb3JtYXRzLCB7XG4gICAgICAnZGVwdGgnOiBHTF9ERVBUSF9DT01QT05FTlQsXG4gICAgICAnZGVwdGggc3RlbmNpbCc6IEdMX0RFUFRIX1NURU5DSUxcbiAgICB9KVxuXG4gICAgZXh0ZW5kKHRleHR1cmVUeXBlcywge1xuICAgICAgJ3VpbnQxNic6IEdMX1VOU0lHTkVEX1NIT1JULFxuICAgICAgJ3VpbnQzMic6IEdMX1VOU0lHTkVEX0lOVCxcbiAgICAgICdkZXB0aCBzdGVuY2lsJzogR0xfVU5TSUdORURfSU5UXzI0XzhfV0VCR0xcbiAgICB9KVxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29tcHJlc3NlZF90ZXh0dXJlX3MzdGMpIHtcbiAgICBleHRlbmQoY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzLCB7XG4gICAgICAncmdiIHMzdGMgZHh0MSc6IEdMX0NPTVBSRVNTRURfUkdCX1MzVENfRFhUMV9FWFQsXG4gICAgICAncmdiYSBzM3RjIGR4dDEnOiBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQxX0VYVCxcbiAgICAgICdyZ2JhIHMzdGMgZHh0Myc6IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDNfRVhULFxuICAgICAgJ3JnYmEgczN0YyBkeHQ1JzogR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUNV9FWFRcbiAgICB9KVxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29tcHJlc3NlZF90ZXh0dXJlX2F0Yykge1xuICAgIGV4dGVuZChjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHMsIHtcbiAgICAgICdyZ2IgYXRjJzogR0xfQ09NUFJFU1NFRF9SR0JfQVRDX1dFQkdMLFxuICAgICAgJ3JnYmEgYXRjIGV4cGxpY2l0IGFscGhhJzogR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19FWFBMSUNJVF9BTFBIQV9XRUJHTCxcbiAgICAgICdyZ2JhIGF0YyBpbnRlcnBvbGF0ZWQgYWxwaGEnOiBHTF9DT01QUkVTU0VEX1JHQkFfQVRDX0lOVEVSUE9MQVRFRF9BTFBIQV9XRUJHTFxuICAgIH0pXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb21wcmVzc2VkX3RleHR1cmVfcHZydGMpIHtcbiAgICBleHRlbmQoY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzLCB7XG4gICAgICAncmdiIHB2cnRjIDRicHB2MSc6IEdMX0NPTVBSRVNTRURfUkdCX1BWUlRDXzRCUFBWMV9JTUcsXG4gICAgICAncmdiIHB2cnRjIDJicHB2MSc6IEdMX0NPTVBSRVNTRURfUkdCX1BWUlRDXzJCUFBWMV9JTUcsXG4gICAgICAncmdiYSBwdnJ0YyA0YnBwdjEnOiBHTF9DT01QUkVTU0VEX1JHQkFfUFZSVENfNEJQUFYxX0lNRyxcbiAgICAgICdyZ2JhIHB2cnRjIDJicHB2MSc6IEdMX0NPTVBSRVNTRURfUkdCQV9QVlJUQ18yQlBQVjFfSU1HXG4gICAgfSlcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9ldGMxKSB7XG4gICAgY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzWydyZ2IgZXRjMSddID0gR0xfQ09NUFJFU1NFRF9SR0JfRVRDMV9XRUJHTFxuICB9XG5cbiAgLy8gQ29weSBvdmVyIGFsbCB0ZXh0dXJlIGZvcm1hdHNcbiAgdmFyIHN1cHBvcnRlZENvbXByZXNzZWRGb3JtYXRzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoXG4gICAgZ2wuZ2V0UGFyYW1ldGVyKEdMX0NPTVBSRVNTRURfVEVYVFVSRV9GT1JNQVRTKSlcbiAgT2JqZWN0LmtleXMoY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdmFyIGZvcm1hdCA9IGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0c1tuYW1lXVxuICAgIGlmIChzdXBwb3J0ZWRDb21wcmVzc2VkRm9ybWF0cy5pbmRleE9mKGZvcm1hdCkgPj0gMCkge1xuICAgICAgdGV4dHVyZUZvcm1hdHNbbmFtZV0gPSBmb3JtYXRcbiAgICB9XG4gIH0pXG5cbiAgdmFyIHN1cHBvcnRlZEZvcm1hdHMgPSBPYmplY3Qua2V5cyh0ZXh0dXJlRm9ybWF0cylcbiAgbGltaXRzLnRleHR1cmVGb3JtYXRzID0gc3VwcG9ydGVkRm9ybWF0c1xuXG4gIC8vIGFzc29jaWF0ZSB3aXRoIGV2ZXJ5IGZvcm1hdCBzdHJpbmcgaXRzXG4gIC8vIGNvcnJlc3BvbmRpbmcgR0wtdmFsdWUuXG4gIHZhciB0ZXh0dXJlRm9ybWF0c0ludmVydCA9IFtdXG4gIE9iamVjdC5rZXlzKHRleHR1cmVGb3JtYXRzKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICB2YXIgdmFsID0gdGV4dHVyZUZvcm1hdHNba2V5XVxuICAgIHRleHR1cmVGb3JtYXRzSW52ZXJ0W3ZhbF0gPSBrZXlcbiAgfSlcblxuICAvLyBhc3NvY2lhdGUgd2l0aCBldmVyeSB0eXBlIHN0cmluZyBpdHNcbiAgLy8gY29ycmVzcG9uZGluZyBHTC12YWx1ZS5cbiAgdmFyIHRleHR1cmVUeXBlc0ludmVydCA9IFtdXG4gIE9iamVjdC5rZXlzKHRleHR1cmVUeXBlcykuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgdmFyIHZhbCA9IHRleHR1cmVUeXBlc1trZXldXG4gICAgdGV4dHVyZVR5cGVzSW52ZXJ0W3ZhbF0gPSBrZXlcbiAgfSlcblxuICB2YXIgbWFnRmlsdGVyc0ludmVydCA9IFtdXG4gIE9iamVjdC5rZXlzKG1hZ0ZpbHRlcnMpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgIHZhciB2YWwgPSBtYWdGaWx0ZXJzW2tleV1cbiAgICBtYWdGaWx0ZXJzSW52ZXJ0W3ZhbF0gPSBrZXlcbiAgfSlcblxuICB2YXIgbWluRmlsdGVyc0ludmVydCA9IFtdXG4gIE9iamVjdC5rZXlzKG1pbkZpbHRlcnMpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgIHZhciB2YWwgPSBtaW5GaWx0ZXJzW2tleV1cbiAgICBtaW5GaWx0ZXJzSW52ZXJ0W3ZhbF0gPSBrZXlcbiAgfSlcblxuICB2YXIgd3JhcE1vZGVzSW52ZXJ0ID0gW11cbiAgT2JqZWN0LmtleXMod3JhcE1vZGVzKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICB2YXIgdmFsID0gd3JhcE1vZGVzW2tleV1cbiAgICB3cmFwTW9kZXNJbnZlcnRbdmFsXSA9IGtleVxuICB9KVxuXG4gIC8vIGNvbG9yRm9ybWF0c1tdIGdpdmVzIHRoZSBmb3JtYXQgKGNoYW5uZWxzKSBhc3NvY2lhdGVkIHRvIGFuXG4gIC8vIGludGVybmFsZm9ybWF0XG4gIHZhciBjb2xvckZvcm1hdHMgPSBzdXBwb3J0ZWRGb3JtYXRzLnJlZHVjZShmdW5jdGlvbiAoY29sb3IsIGtleSkge1xuICAgIHZhciBnbGVudW0gPSB0ZXh0dXJlRm9ybWF0c1trZXldXG4gICAgaWYgKGdsZW51bSA9PT0gR0xfTFVNSU5BTkNFIHx8XG4gICAgICAgIGdsZW51bSA9PT0gR0xfQUxQSEEgfHxcbiAgICAgICAgZ2xlbnVtID09PSBHTF9MVU1JTkFOQ0UgfHxcbiAgICAgICAgZ2xlbnVtID09PSBHTF9MVU1JTkFOQ0VfQUxQSEEgfHxcbiAgICAgICAgZ2xlbnVtID09PSBHTF9ERVBUSF9DT01QT05FTlQgfHxcbiAgICAgICAgZ2xlbnVtID09PSBHTF9ERVBUSF9TVEVOQ0lMKSB7XG4gICAgICBjb2xvcltnbGVudW1dID0gZ2xlbnVtXG4gICAgfSBlbHNlIGlmIChnbGVudW0gPT09IEdMX1JHQjVfQTEgfHwga2V5LmluZGV4T2YoJ3JnYmEnKSA+PSAwKSB7XG4gICAgICBjb2xvcltnbGVudW1dID0gR0xfUkdCQVxuICAgIH0gZWxzZSB7XG4gICAgICBjb2xvcltnbGVudW1dID0gR0xfUkdCXG4gICAgfVxuICAgIHJldHVybiBjb2xvclxuICB9LCB7fSlcblxuICBmdW5jdGlvbiBUZXhGbGFncyAoKSB7XG4gICAgLy8gZm9ybWF0IGluZm9cbiAgICB0aGlzLmludGVybmFsZm9ybWF0ID0gR0xfUkdCQVxuICAgIHRoaXMuZm9ybWF0ID0gR0xfUkdCQVxuICAgIHRoaXMudHlwZSA9IEdMX1VOU0lHTkVEX0JZVEVcbiAgICB0aGlzLmNvbXByZXNzZWQgPSBmYWxzZVxuXG4gICAgLy8gcGl4ZWwgc3RvcmFnZVxuICAgIHRoaXMucHJlbXVsdGlwbHlBbHBoYSA9IGZhbHNlXG4gICAgdGhpcy5mbGlwWSA9IGZhbHNlXG4gICAgdGhpcy51bnBhY2tBbGlnbm1lbnQgPSAxXG4gICAgdGhpcy5jb2xvclNwYWNlID0gMFxuXG4gICAgLy8gc2hhcGUgaW5mb1xuICAgIHRoaXMud2lkdGggPSAwXG4gICAgdGhpcy5oZWlnaHQgPSAwXG4gICAgdGhpcy5jaGFubmVscyA9IDBcbiAgfVxuXG4gIGZ1bmN0aW9uIGNvcHlGbGFncyAocmVzdWx0LCBvdGhlcikge1xuICAgIHJlc3VsdC5pbnRlcm5hbGZvcm1hdCA9IG90aGVyLmludGVybmFsZm9ybWF0XG4gICAgcmVzdWx0LmZvcm1hdCA9IG90aGVyLmZvcm1hdFxuICAgIHJlc3VsdC50eXBlID0gb3RoZXIudHlwZVxuICAgIHJlc3VsdC5jb21wcmVzc2VkID0gb3RoZXIuY29tcHJlc3NlZFxuXG4gICAgcmVzdWx0LnByZW11bHRpcGx5QWxwaGEgPSBvdGhlci5wcmVtdWx0aXBseUFscGhhXG4gICAgcmVzdWx0LmZsaXBZID0gb3RoZXIuZmxpcFlcbiAgICByZXN1bHQudW5wYWNrQWxpZ25tZW50ID0gb3RoZXIudW5wYWNrQWxpZ25tZW50XG4gICAgcmVzdWx0LmNvbG9yU3BhY2UgPSBvdGhlci5jb2xvclNwYWNlXG5cbiAgICByZXN1bHQud2lkdGggPSBvdGhlci53aWR0aFxuICAgIHJlc3VsdC5oZWlnaHQgPSBvdGhlci5oZWlnaHRcbiAgICByZXN1bHQuY2hhbm5lbHMgPSBvdGhlci5jaGFubmVsc1xuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VGbGFncyAoZmxhZ3MsIG9wdGlvbnMpIHtcbiAgICBpZiAodHlwZW9mIG9wdGlvbnMgIT09ICdvYmplY3QnIHx8ICFvcHRpb25zKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBpZiAoJ3ByZW11bHRpcGx5QWxwaGEnIGluIG9wdGlvbnMpIHtcbiAgICAgIGNoZWNrLnR5cGUob3B0aW9ucy5wcmVtdWx0aXBseUFscGhhLCAnYm9vbGVhbicsXG4gICAgICAgICdpbnZhbGlkIHByZW11bHRpcGx5QWxwaGEnKVxuICAgICAgZmxhZ3MucHJlbXVsdGlwbHlBbHBoYSA9IG9wdGlvbnMucHJlbXVsdGlwbHlBbHBoYVxuICAgIH1cblxuICAgIGlmICgnZmxpcFknIGluIG9wdGlvbnMpIHtcbiAgICAgIGNoZWNrLnR5cGUob3B0aW9ucy5mbGlwWSwgJ2Jvb2xlYW4nLFxuICAgICAgICAnaW52YWxpZCB0ZXh0dXJlIGZsaXAnKVxuICAgICAgZmxhZ3MuZmxpcFkgPSBvcHRpb25zLmZsaXBZXG4gICAgfVxuXG4gICAgaWYgKCdhbGlnbm1lbnQnIGluIG9wdGlvbnMpIHtcbiAgICAgIGNoZWNrLm9uZU9mKG9wdGlvbnMuYWxpZ25tZW50LCBbMSwgMiwgNCwgOF0sXG4gICAgICAgICdpbnZhbGlkIHRleHR1cmUgdW5wYWNrIGFsaWdubWVudCcpXG4gICAgICBmbGFncy51bnBhY2tBbGlnbm1lbnQgPSBvcHRpb25zLmFsaWdubWVudFxuICAgIH1cblxuICAgIGlmICgnY29sb3JTcGFjZScgaW4gb3B0aW9ucykge1xuICAgICAgY2hlY2sucGFyYW1ldGVyKG9wdGlvbnMuY29sb3JTcGFjZSwgY29sb3JTcGFjZSxcbiAgICAgICAgJ2ludmFsaWQgY29sb3JTcGFjZScpXG4gICAgICBmbGFncy5jb2xvclNwYWNlID0gY29sb3JTcGFjZVtvcHRpb25zLmNvbG9yU3BhY2VdXG4gICAgfVxuXG4gICAgaWYgKCd0eXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICB2YXIgdHlwZSA9IG9wdGlvbnMudHlwZVxuICAgICAgY2hlY2soZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9mbG9hdCB8fFxuICAgICAgICAhKHR5cGUgPT09ICdmbG9hdCcgfHwgdHlwZSA9PT0gJ2Zsb2F0MzInKSxcbiAgICAgICAgJ3lvdSBtdXN0IGVuYWJsZSB0aGUgT0VTX3RleHR1cmVfZmxvYXQgZXh0ZW5zaW9uIGluIG9yZGVyIHRvIHVzZSBmbG9hdGluZyBwb2ludCB0ZXh0dXJlcy4nKVxuICAgICAgY2hlY2soZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9oYWxmX2Zsb2F0IHx8XG4gICAgICAgICEodHlwZSA9PT0gJ2hhbGYgZmxvYXQnIHx8IHR5cGUgPT09ICdmbG9hdDE2JyksXG4gICAgICAgICd5b3UgbXVzdCBlbmFibGUgdGhlIE9FU190ZXh0dXJlX2hhbGZfZmxvYXQgZXh0ZW5zaW9uIGluIG9yZGVyIHRvIHVzZSAxNi1iaXQgZmxvYXRpbmcgcG9pbnQgdGV4dHVyZXMuJylcbiAgICAgIGNoZWNrKGV4dGVuc2lvbnMud2ViZ2xfZGVwdGhfdGV4dHVyZSB8fFxuICAgICAgICAhKHR5cGUgPT09ICd1aW50MTYnIHx8IHR5cGUgPT09ICd1aW50MzInIHx8IHR5cGUgPT09ICdkZXB0aCBzdGVuY2lsJyksXG4gICAgICAgICd5b3UgbXVzdCBlbmFibGUgdGhlIFdFQkdMX2RlcHRoX3RleHR1cmUgZXh0ZW5zaW9uIGluIG9yZGVyIHRvIHVzZSBkZXB0aC9zdGVuY2lsIHRleHR1cmVzLicpXG4gICAgICBjaGVjay5wYXJhbWV0ZXIodHlwZSwgdGV4dHVyZVR5cGVzLFxuICAgICAgICAnaW52YWxpZCB0ZXh0dXJlIHR5cGUnKVxuICAgICAgZmxhZ3MudHlwZSA9IHRleHR1cmVUeXBlc1t0eXBlXVxuICAgIH1cblxuICAgIHZhciB3ID0gZmxhZ3Mud2lkdGhcbiAgICB2YXIgaCA9IGZsYWdzLmhlaWdodFxuICAgIHZhciBjID0gZmxhZ3MuY2hhbm5lbHNcbiAgICB2YXIgaGFzQ2hhbm5lbHMgPSBmYWxzZVxuICAgIGlmICgnc2hhcGUnIGluIG9wdGlvbnMpIHtcbiAgICAgIGNoZWNrKEFycmF5LmlzQXJyYXkob3B0aW9ucy5zaGFwZSkgJiYgb3B0aW9ucy5zaGFwZS5sZW5ndGggPj0gMixcbiAgICAgICAgJ3NoYXBlIG11c3QgYmUgYW4gYXJyYXknKVxuICAgICAgdyA9IG9wdGlvbnMuc2hhcGVbMF1cbiAgICAgIGggPSBvcHRpb25zLnNoYXBlWzFdXG4gICAgICBpZiAob3B0aW9ucy5zaGFwZS5sZW5ndGggPT09IDMpIHtcbiAgICAgICAgYyA9IG9wdGlvbnMuc2hhcGVbMl1cbiAgICAgICAgY2hlY2soYyA+IDAgJiYgYyA8PSA0LCAnaW52YWxpZCBudW1iZXIgb2YgY2hhbm5lbHMnKVxuICAgICAgICBoYXNDaGFubmVscyA9IHRydWVcbiAgICAgIH1cbiAgICAgIGNoZWNrKHcgPj0gMCAmJiB3IDw9IGxpbWl0cy5tYXhUZXh0dXJlU2l6ZSwgJ2ludmFsaWQgd2lkdGgnKVxuICAgICAgY2hlY2soaCA+PSAwICYmIGggPD0gbGltaXRzLm1heFRleHR1cmVTaXplLCAnaW52YWxpZCBoZWlnaHQnKVxuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoJ3JhZGl1cycgaW4gb3B0aW9ucykge1xuICAgICAgICB3ID0gaCA9IG9wdGlvbnMucmFkaXVzXG4gICAgICAgIGNoZWNrKHcgPj0gMCAmJiB3IDw9IGxpbWl0cy5tYXhUZXh0dXJlU2l6ZSwgJ2ludmFsaWQgcmFkaXVzJylcbiAgICAgIH1cbiAgICAgIGlmICgnd2lkdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdyA9IG9wdGlvbnMud2lkdGhcbiAgICAgICAgY2hlY2sodyA+PSAwICYmIHcgPD0gbGltaXRzLm1heFRleHR1cmVTaXplLCAnaW52YWxpZCB3aWR0aCcpXG4gICAgICB9XG4gICAgICBpZiAoJ2hlaWdodCcgaW4gb3B0aW9ucykge1xuICAgICAgICBoID0gb3B0aW9ucy5oZWlnaHRcbiAgICAgICAgY2hlY2soaCA+PSAwICYmIGggPD0gbGltaXRzLm1heFRleHR1cmVTaXplLCAnaW52YWxpZCBoZWlnaHQnKVxuICAgICAgfVxuICAgICAgaWYgKCdjaGFubmVscycgaW4gb3B0aW9ucykge1xuICAgICAgICBjID0gb3B0aW9ucy5jaGFubmVsc1xuICAgICAgICBjaGVjayhjID4gMCAmJiBjIDw9IDQsICdpbnZhbGlkIG51bWJlciBvZiBjaGFubmVscycpXG4gICAgICAgIGhhc0NoYW5uZWxzID0gdHJ1ZVxuICAgICAgfVxuICAgIH1cbiAgICBmbGFncy53aWR0aCA9IHcgfCAwXG4gICAgZmxhZ3MuaGVpZ2h0ID0gaCB8IDBcbiAgICBmbGFncy5jaGFubmVscyA9IGMgfCAwXG5cbiAgICB2YXIgaGFzRm9ybWF0ID0gZmFsc2VcbiAgICBpZiAoJ2Zvcm1hdCcgaW4gb3B0aW9ucykge1xuICAgICAgdmFyIGZvcm1hdFN0ciA9IG9wdGlvbnMuZm9ybWF0XG4gICAgICBjaGVjayhleHRlbnNpb25zLndlYmdsX2RlcHRoX3RleHR1cmUgfHxcbiAgICAgICAgIShmb3JtYXRTdHIgPT09ICdkZXB0aCcgfHwgZm9ybWF0U3RyID09PSAnZGVwdGggc3RlbmNpbCcpLFxuICAgICAgICAneW91IG11c3QgZW5hYmxlIHRoZSBXRUJHTF9kZXB0aF90ZXh0dXJlIGV4dGVuc2lvbiBpbiBvcmRlciB0byB1c2UgZGVwdGgvc3RlbmNpbCB0ZXh0dXJlcy4nKVxuICAgICAgY2hlY2sucGFyYW1ldGVyKGZvcm1hdFN0ciwgdGV4dHVyZUZvcm1hdHMsXG4gICAgICAgICdpbnZhbGlkIHRleHR1cmUgZm9ybWF0JylcbiAgICAgIHZhciBpbnRlcm5hbGZvcm1hdCA9IGZsYWdzLmludGVybmFsZm9ybWF0ID0gdGV4dHVyZUZvcm1hdHNbZm9ybWF0U3RyXVxuICAgICAgZmxhZ3MuZm9ybWF0ID0gY29sb3JGb3JtYXRzW2ludGVybmFsZm9ybWF0XVxuICAgICAgaWYgKGZvcm1hdFN0ciBpbiB0ZXh0dXJlVHlwZXMpIHtcbiAgICAgICAgaWYgKCEoJ3R5cGUnIGluIG9wdGlvbnMpKSB7XG4gICAgICAgICAgZmxhZ3MudHlwZSA9IHRleHR1cmVUeXBlc1tmb3JtYXRTdHJdXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChmb3JtYXRTdHIgaW4gY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzKSB7XG4gICAgICAgIGZsYWdzLmNvbXByZXNzZWQgPSB0cnVlXG4gICAgICB9XG4gICAgICBoYXNGb3JtYXQgPSB0cnVlXG4gICAgfVxuXG4gICAgLy8gUmVjb25jaWxlIGNoYW5uZWxzIGFuZCBmb3JtYXRcbiAgICBpZiAoIWhhc0NoYW5uZWxzICYmIGhhc0Zvcm1hdCkge1xuICAgICAgZmxhZ3MuY2hhbm5lbHMgPSBGT1JNQVRfQ0hBTk5FTFNbZmxhZ3MuZm9ybWF0XVxuICAgIH0gZWxzZSBpZiAoaGFzQ2hhbm5lbHMgJiYgIWhhc0Zvcm1hdCkge1xuICAgICAgaWYgKGZsYWdzLmNoYW5uZWxzICE9PSBDSEFOTkVMU19GT1JNQVRbZmxhZ3MuZm9ybWF0XSkge1xuICAgICAgICBmbGFncy5mb3JtYXQgPSBmbGFncy5pbnRlcm5hbGZvcm1hdCA9IENIQU5ORUxTX0ZPUk1BVFtmbGFncy5jaGFubmVsc11cbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGhhc0Zvcm1hdCAmJiBoYXNDaGFubmVscykge1xuICAgICAgY2hlY2soXG4gICAgICAgIGZsYWdzLmNoYW5uZWxzID09PSBGT1JNQVRfQ0hBTk5FTFNbZmxhZ3MuZm9ybWF0XSxcbiAgICAgICAgJ251bWJlciBvZiBjaGFubmVscyBpbmNvbnNpc3RlbnQgd2l0aCBzcGVjaWZpZWQgZm9ybWF0JylcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzZXRGbGFncyAoZmxhZ3MpIHtcbiAgICBnbC5waXhlbFN0b3JlaShHTF9VTlBBQ0tfRkxJUF9ZX1dFQkdMLCBmbGFncy5mbGlwWSlcbiAgICBnbC5waXhlbFN0b3JlaShHTF9VTlBBQ0tfUFJFTVVMVElQTFlfQUxQSEFfV0VCR0wsIGZsYWdzLnByZW11bHRpcGx5QWxwaGEpXG4gICAgZ2wucGl4ZWxTdG9yZWkoR0xfVU5QQUNLX0NPTE9SU1BBQ0VfQ09OVkVSU0lPTl9XRUJHTCwgZmxhZ3MuY29sb3JTcGFjZSlcbiAgICBnbC5waXhlbFN0b3JlaShHTF9VTlBBQ0tfQUxJR05NRU5ULCBmbGFncy51bnBhY2tBbGlnbm1lbnQpXG4gIH1cblxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIFRleCBpbWFnZSBkYXRhXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgZnVuY3Rpb24gVGV4SW1hZ2UgKCkge1xuICAgIFRleEZsYWdzLmNhbGwodGhpcylcblxuICAgIHRoaXMueE9mZnNldCA9IDBcbiAgICB0aGlzLnlPZmZzZXQgPSAwXG5cbiAgICAvLyBkYXRhXG4gICAgdGhpcy5kYXRhID0gbnVsbFxuICAgIHRoaXMubmVlZHNGcmVlID0gZmFsc2VcblxuICAgIC8vIGh0bWwgZWxlbWVudFxuICAgIHRoaXMuZWxlbWVudCA9IG51bGxcblxuICAgIC8vIGNvcHlUZXhJbWFnZSBpbmZvXG4gICAgdGhpcy5uZWVkc0NvcHkgPSBmYWxzZVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VJbWFnZSAoaW1hZ2UsIG9wdGlvbnMpIHtcbiAgICB2YXIgZGF0YSA9IG51bGxcbiAgICBpZiAoaXNQaXhlbERhdGEob3B0aW9ucykpIHtcbiAgICAgIGRhdGEgPSBvcHRpb25zXG4gICAgfSBlbHNlIGlmIChvcHRpb25zKSB7XG4gICAgICBjaGVjay50eXBlKG9wdGlvbnMsICdvYmplY3QnLCAnaW52YWxpZCBwaXhlbCBkYXRhIHR5cGUnKVxuICAgICAgcGFyc2VGbGFncyhpbWFnZSwgb3B0aW9ucylcbiAgICAgIGlmICgneCcgaW4gb3B0aW9ucykge1xuICAgICAgICBpbWFnZS54T2Zmc2V0ID0gb3B0aW9ucy54IHwgMFxuICAgICAgfVxuICAgICAgaWYgKCd5JyBpbiBvcHRpb25zKSB7XG4gICAgICAgIGltYWdlLnlPZmZzZXQgPSBvcHRpb25zLnkgfCAwXG4gICAgICB9XG4gICAgICBpZiAoaXNQaXhlbERhdGEob3B0aW9ucy5kYXRhKSkge1xuICAgICAgICBkYXRhID0gb3B0aW9ucy5kYXRhXG4gICAgICB9XG4gICAgfVxuXG4gICAgY2hlY2soXG4gICAgICAhaW1hZ2UuY29tcHJlc3NlZCB8fFxuICAgICAgZGF0YSBpbnN0YW5jZW9mIFVpbnQ4QXJyYXksXG4gICAgICAnY29tcHJlc3NlZCB0ZXh0dXJlIGRhdGEgbXVzdCBiZSBzdG9yZWQgaW4gYSB1aW50OGFycmF5JylcblxuICAgIGlmIChvcHRpb25zLmNvcHkpIHtcbiAgICAgIGNoZWNrKCFkYXRhLCAnY2FuIG5vdCBzcGVjaWZ5IGNvcHkgYW5kIGRhdGEgZmllbGQgZm9yIHRoZSBzYW1lIHRleHR1cmUnKVxuICAgICAgdmFyIHZpZXdXID0gY29udGV4dFN0YXRlLnZpZXdwb3J0V2lkdGhcbiAgICAgIHZhciB2aWV3SCA9IGNvbnRleHRTdGF0ZS52aWV3cG9ydEhlaWdodFxuICAgICAgaW1hZ2Uud2lkdGggPSBpbWFnZS53aWR0aCB8fCAodmlld1cgLSBpbWFnZS54T2Zmc2V0KVxuICAgICAgaW1hZ2UuaGVpZ2h0ID0gaW1hZ2UuaGVpZ2h0IHx8ICh2aWV3SCAtIGltYWdlLnlPZmZzZXQpXG4gICAgICBpbWFnZS5uZWVkc0NvcHkgPSB0cnVlXG4gICAgICBjaGVjayhpbWFnZS54T2Zmc2V0ID49IDAgJiYgaW1hZ2UueE9mZnNldCA8IHZpZXdXICYmXG4gICAgICAgICAgICBpbWFnZS55T2Zmc2V0ID49IDAgJiYgaW1hZ2UueU9mZnNldCA8IHZpZXdIICYmXG4gICAgICAgICAgICBpbWFnZS53aWR0aCA+IDAgJiYgaW1hZ2Uud2lkdGggPD0gdmlld1cgJiZcbiAgICAgICAgICAgIGltYWdlLmhlaWdodCA+IDAgJiYgaW1hZ2UuaGVpZ2h0IDw9IHZpZXdILFxuICAgICAgICAgICAgJ2NvcHkgdGV4dHVyZSByZWFkIG91dCBvZiBib3VuZHMnKVxuICAgIH0gZWxzZSBpZiAoIWRhdGEpIHtcbiAgICAgIGltYWdlLndpZHRoID0gaW1hZ2Uud2lkdGggfHwgMVxuICAgICAgaW1hZ2UuaGVpZ2h0ID0gaW1hZ2UuaGVpZ2h0IHx8IDFcbiAgICAgIGltYWdlLmNoYW5uZWxzID0gaW1hZ2UuY2hhbm5lbHMgfHwgNFxuICAgIH0gZWxzZSBpZiAoaXNUeXBlZEFycmF5KGRhdGEpKSB7XG4gICAgICBpbWFnZS5jaGFubmVscyA9IGltYWdlLmNoYW5uZWxzIHx8IDRcbiAgICAgIGltYWdlLmRhdGEgPSBkYXRhXG4gICAgICBpZiAoISgndHlwZScgaW4gb3B0aW9ucykgJiYgaW1hZ2UudHlwZSA9PT0gR0xfVU5TSUdORURfQllURSkge1xuICAgICAgICBpbWFnZS50eXBlID0gdHlwZWRBcnJheUNvZGUoZGF0YSlcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGlzTnVtZXJpY0FycmF5KGRhdGEpKSB7XG4gICAgICBpbWFnZS5jaGFubmVscyA9IGltYWdlLmNoYW5uZWxzIHx8IDRcbiAgICAgIGNvbnZlcnREYXRhKGltYWdlLCBkYXRhKVxuICAgICAgaW1hZ2UuYWxpZ25tZW50ID0gMVxuICAgICAgaW1hZ2UubmVlZHNGcmVlID0gdHJ1ZVxuICAgIH0gZWxzZSBpZiAoaXNOREFycmF5TGlrZShkYXRhKSkge1xuICAgICAgdmFyIGFycmF5ID0gZGF0YS5kYXRhXG4gICAgICBpZiAoIUFycmF5LmlzQXJyYXkoYXJyYXkpICYmIGltYWdlLnR5cGUgPT09IEdMX1VOU0lHTkVEX0JZVEUpIHtcbiAgICAgICAgaW1hZ2UudHlwZSA9IHR5cGVkQXJyYXlDb2RlKGFycmF5KVxuICAgICAgfVxuICAgICAgdmFyIHNoYXBlID0gZGF0YS5zaGFwZVxuICAgICAgdmFyIHN0cmlkZSA9IGRhdGEuc3RyaWRlXG4gICAgICB2YXIgc2hhcGVYLCBzaGFwZVksIHNoYXBlQywgc3RyaWRlWCwgc3RyaWRlWSwgc3RyaWRlQ1xuICAgICAgaWYgKHNoYXBlLmxlbmd0aCA9PT0gMykge1xuICAgICAgICBzaGFwZUMgPSBzaGFwZVsyXVxuICAgICAgICBzdHJpZGVDID0gc3RyaWRlWzJdXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjaGVjayhzaGFwZS5sZW5ndGggPT09IDIsICdpbnZhbGlkIG5kYXJyYXkgcGl4ZWwgZGF0YSwgbXVzdCBiZSAyIG9yIDNEJylcbiAgICAgICAgc2hhcGVDID0gMVxuICAgICAgICBzdHJpZGVDID0gMVxuICAgICAgfVxuICAgICAgc2hhcGVYID0gc2hhcGVbMF1cbiAgICAgIHNoYXBlWSA9IHNoYXBlWzFdXG4gICAgICBzdHJpZGVYID0gc3RyaWRlWzBdXG4gICAgICBzdHJpZGVZID0gc3RyaWRlWzFdXG4gICAgICBpbWFnZS5hbGlnbm1lbnQgPSAxXG4gICAgICBpbWFnZS53aWR0aCA9IHNoYXBlWFxuICAgICAgaW1hZ2UuaGVpZ2h0ID0gc2hhcGVZXG4gICAgICBpbWFnZS5jaGFubmVscyA9IHNoYXBlQ1xuICAgICAgaW1hZ2UuZm9ybWF0ID0gaW1hZ2UuaW50ZXJuYWxmb3JtYXQgPSBDSEFOTkVMU19GT1JNQVRbc2hhcGVDXVxuICAgICAgaW1hZ2UubmVlZHNGcmVlID0gdHJ1ZVxuICAgICAgdHJhbnNwb3NlRGF0YShpbWFnZSwgYXJyYXksIHN0cmlkZVgsIHN0cmlkZVksIHN0cmlkZUMsIGRhdGEub2Zmc2V0KVxuICAgIH0gZWxzZSBpZiAoaXNDYW52YXNFbGVtZW50KGRhdGEpIHx8IGlzQ29udGV4dDJEKGRhdGEpKSB7XG4gICAgICBpZiAoaXNDYW52YXNFbGVtZW50KGRhdGEpKSB7XG4gICAgICAgIGltYWdlLmVsZW1lbnQgPSBkYXRhXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpbWFnZS5lbGVtZW50ID0gZGF0YS5jYW52YXNcbiAgICAgIH1cbiAgICAgIGltYWdlLndpZHRoID0gaW1hZ2UuZWxlbWVudC53aWR0aFxuICAgICAgaW1hZ2UuaGVpZ2h0ID0gaW1hZ2UuZWxlbWVudC5oZWlnaHRcbiAgICAgIGltYWdlLmNoYW5uZWxzID0gNFxuICAgIH0gZWxzZSBpZiAoaXNJbWFnZUVsZW1lbnQoZGF0YSkpIHtcbiAgICAgIGltYWdlLmVsZW1lbnQgPSBkYXRhXG4gICAgICBpbWFnZS53aWR0aCA9IGRhdGEubmF0dXJhbFdpZHRoXG4gICAgICBpbWFnZS5oZWlnaHQgPSBkYXRhLm5hdHVyYWxIZWlnaHRcbiAgICAgIGltYWdlLmNoYW5uZWxzID0gNFxuICAgIH0gZWxzZSBpZiAoaXNWaWRlb0VsZW1lbnQoZGF0YSkpIHtcbiAgICAgIGltYWdlLmVsZW1lbnQgPSBkYXRhXG4gICAgICBpbWFnZS53aWR0aCA9IGRhdGEudmlkZW9XaWR0aFxuICAgICAgaW1hZ2UuaGVpZ2h0ID0gZGF0YS52aWRlb0hlaWdodFxuICAgICAgaW1hZ2UuY2hhbm5lbHMgPSA0XG4gICAgfSBlbHNlIGlmIChpc1JlY3RBcnJheShkYXRhKSkge1xuICAgICAgdmFyIHcgPSBpbWFnZS53aWR0aCB8fCBkYXRhWzBdLmxlbmd0aFxuICAgICAgdmFyIGggPSBpbWFnZS5oZWlnaHQgfHwgZGF0YS5sZW5ndGhcbiAgICAgIHZhciBjID0gaW1hZ2UuY2hhbm5lbHNcbiAgICAgIGlmIChpc0FycmF5TGlrZShkYXRhWzBdWzBdKSkge1xuICAgICAgICBjID0gYyB8fCBkYXRhWzBdWzBdLmxlbmd0aFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYyA9IGMgfHwgMVxuICAgICAgfVxuICAgICAgdmFyIGFycmF5U2hhcGUgPSBmbGF0dGVuVXRpbHMuc2hhcGUoZGF0YSlcbiAgICAgIHZhciBuID0gMVxuICAgICAgZm9yICh2YXIgZGQgPSAwOyBkZCA8IGFycmF5U2hhcGUubGVuZ3RoOyArK2RkKSB7XG4gICAgICAgIG4gKj0gYXJyYXlTaGFwZVtkZF1cbiAgICAgIH1cbiAgICAgIHZhciBhbGxvY0RhdGEgPSBwcmVDb252ZXJ0KGltYWdlLCBuKVxuICAgICAgZmxhdHRlblV0aWxzLmZsYXR0ZW4oZGF0YSwgYXJyYXlTaGFwZSwgJycsIGFsbG9jRGF0YSlcbiAgICAgIHBvc3RDb252ZXJ0KGltYWdlLCBhbGxvY0RhdGEpXG4gICAgICBpbWFnZS5hbGlnbm1lbnQgPSAxXG4gICAgICBpbWFnZS53aWR0aCA9IHdcbiAgICAgIGltYWdlLmhlaWdodCA9IGhcbiAgICAgIGltYWdlLmNoYW5uZWxzID0gY1xuICAgICAgaW1hZ2UuZm9ybWF0ID0gaW1hZ2UuaW50ZXJuYWxmb3JtYXQgPSBDSEFOTkVMU19GT1JNQVRbY11cbiAgICAgIGltYWdlLm5lZWRzRnJlZSA9IHRydWVcbiAgICB9XG5cbiAgICBpZiAoaW1hZ2UudHlwZSA9PT0gR0xfRkxPQVQpIHtcbiAgICAgIGNoZWNrKGxpbWl0cy5leHRlbnNpb25zLmluZGV4T2YoJ29lc190ZXh0dXJlX2Zsb2F0JykgPj0gMCxcbiAgICAgICAgJ29lc190ZXh0dXJlX2Zsb2F0IGV4dGVuc2lvbiBub3QgZW5hYmxlZCcpXG4gICAgfSBlbHNlIGlmIChpbWFnZS50eXBlID09PSBHTF9IQUxGX0ZMT0FUX09FUykge1xuICAgICAgY2hlY2sobGltaXRzLmV4dGVuc2lvbnMuaW5kZXhPZignb2VzX3RleHR1cmVfaGFsZl9mbG9hdCcpID49IDAsXG4gICAgICAgICdvZXNfdGV4dHVyZV9oYWxmX2Zsb2F0IGV4dGVuc2lvbiBub3QgZW5hYmxlZCcpXG4gICAgfVxuXG4gICAgLy8gZG8gY29tcHJlc3NlZCB0ZXh0dXJlICB2YWxpZGF0aW9uIGhlcmUuXG4gIH1cblxuICBmdW5jdGlvbiBzZXRJbWFnZSAoaW5mbywgdGFyZ2V0LCBtaXBsZXZlbCkge1xuICAgIHZhciBlbGVtZW50ID0gaW5mby5lbGVtZW50XG4gICAgdmFyIGRhdGEgPSBpbmZvLmRhdGFcbiAgICB2YXIgaW50ZXJuYWxmb3JtYXQgPSBpbmZvLmludGVybmFsZm9ybWF0XG4gICAgdmFyIGZvcm1hdCA9IGluZm8uZm9ybWF0XG4gICAgdmFyIHR5cGUgPSBpbmZvLnR5cGVcbiAgICB2YXIgd2lkdGggPSBpbmZvLndpZHRoXG4gICAgdmFyIGhlaWdodCA9IGluZm8uaGVpZ2h0XG5cbiAgICBzZXRGbGFncyhpbmZvKVxuXG4gICAgaWYgKGVsZW1lbnQpIHtcbiAgICAgIGdsLnRleEltYWdlMkQodGFyZ2V0LCBtaXBsZXZlbCwgZm9ybWF0LCBmb3JtYXQsIHR5cGUsIGVsZW1lbnQpXG4gICAgfSBlbHNlIGlmIChpbmZvLmNvbXByZXNzZWQpIHtcbiAgICAgIGdsLmNvbXByZXNzZWRUZXhJbWFnZTJEKHRhcmdldCwgbWlwbGV2ZWwsIGludGVybmFsZm9ybWF0LCB3aWR0aCwgaGVpZ2h0LCAwLCBkYXRhKVxuICAgIH0gZWxzZSBpZiAoaW5mby5uZWVkc0NvcHkpIHtcbiAgICAgIHJlZ2xQb2xsKClcbiAgICAgIGdsLmNvcHlUZXhJbWFnZTJEKFxuICAgICAgICB0YXJnZXQsIG1pcGxldmVsLCBmb3JtYXQsIGluZm8ueE9mZnNldCwgaW5mby55T2Zmc2V0LCB3aWR0aCwgaGVpZ2h0LCAwKVxuICAgIH0gZWxzZSB7XG4gICAgICBnbC50ZXhJbWFnZTJEKFxuICAgICAgICB0YXJnZXQsIG1pcGxldmVsLCBmb3JtYXQsIHdpZHRoLCBoZWlnaHQsIDAsIGZvcm1hdCwgdHlwZSwgZGF0YSlcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzZXRTdWJJbWFnZSAoaW5mbywgdGFyZ2V0LCB4LCB5LCBtaXBsZXZlbCkge1xuICAgIHZhciBlbGVtZW50ID0gaW5mby5lbGVtZW50XG4gICAgdmFyIGRhdGEgPSBpbmZvLmRhdGFcbiAgICB2YXIgaW50ZXJuYWxmb3JtYXQgPSBpbmZvLmludGVybmFsZm9ybWF0XG4gICAgdmFyIGZvcm1hdCA9IGluZm8uZm9ybWF0XG4gICAgdmFyIHR5cGUgPSBpbmZvLnR5cGVcbiAgICB2YXIgd2lkdGggPSBpbmZvLndpZHRoXG4gICAgdmFyIGhlaWdodCA9IGluZm8uaGVpZ2h0XG5cbiAgICBzZXRGbGFncyhpbmZvKVxuXG4gICAgaWYgKGVsZW1lbnQpIHtcbiAgICAgIGdsLnRleFN1YkltYWdlMkQoXG4gICAgICAgIHRhcmdldCwgbWlwbGV2ZWwsIHgsIHksIGZvcm1hdCwgdHlwZSwgZWxlbWVudClcbiAgICB9IGVsc2UgaWYgKGluZm8uY29tcHJlc3NlZCkge1xuICAgICAgZ2wuY29tcHJlc3NlZFRleFN1YkltYWdlMkQoXG4gICAgICAgIHRhcmdldCwgbWlwbGV2ZWwsIHgsIHksIGludGVybmFsZm9ybWF0LCB3aWR0aCwgaGVpZ2h0LCBkYXRhKVxuICAgIH0gZWxzZSBpZiAoaW5mby5uZWVkc0NvcHkpIHtcbiAgICAgIHJlZ2xQb2xsKClcbiAgICAgIGdsLmNvcHlUZXhTdWJJbWFnZTJEKFxuICAgICAgICB0YXJnZXQsIG1pcGxldmVsLCB4LCB5LCBpbmZvLnhPZmZzZXQsIGluZm8ueU9mZnNldCwgd2lkdGgsIGhlaWdodClcbiAgICB9IGVsc2Uge1xuICAgICAgZ2wudGV4U3ViSW1hZ2UyRChcbiAgICAgICAgdGFyZ2V0LCBtaXBsZXZlbCwgeCwgeSwgd2lkdGgsIGhlaWdodCwgZm9ybWF0LCB0eXBlLCBkYXRhKVxuICAgIH1cbiAgfVxuXG4gIC8vIHRleEltYWdlIHBvb2xcbiAgdmFyIGltYWdlUG9vbCA9IFtdXG5cbiAgZnVuY3Rpb24gYWxsb2NJbWFnZSAoKSB7XG4gICAgcmV0dXJuIGltYWdlUG9vbC5wb3AoKSB8fCBuZXcgVGV4SW1hZ2UoKVxuICB9XG5cbiAgZnVuY3Rpb24gZnJlZUltYWdlIChpbWFnZSkge1xuICAgIGlmIChpbWFnZS5uZWVkc0ZyZWUpIHtcbiAgICAgIHBvb2wuZnJlZVR5cGUoaW1hZ2UuZGF0YSlcbiAgICB9XG4gICAgVGV4SW1hZ2UuY2FsbChpbWFnZSlcbiAgICBpbWFnZVBvb2wucHVzaChpbWFnZSlcbiAgfVxuXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gTWlwIG1hcFxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIGZ1bmN0aW9uIE1pcE1hcCAoKSB7XG4gICAgVGV4RmxhZ3MuY2FsbCh0aGlzKVxuXG4gICAgdGhpcy5nZW5NaXBtYXBzID0gZmFsc2VcbiAgICB0aGlzLm1pcG1hcEhpbnQgPSBHTF9ET05UX0NBUkVcbiAgICB0aGlzLm1pcG1hc2sgPSAwXG4gICAgdGhpcy5pbWFnZXMgPSBBcnJheSgxNilcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlTWlwTWFwRnJvbVNoYXBlIChtaXBtYXAsIHdpZHRoLCBoZWlnaHQpIHtcbiAgICB2YXIgaW1nID0gbWlwbWFwLmltYWdlc1swXSA9IGFsbG9jSW1hZ2UoKVxuICAgIG1pcG1hcC5taXBtYXNrID0gMVxuICAgIGltZy53aWR0aCA9IG1pcG1hcC53aWR0aCA9IHdpZHRoXG4gICAgaW1nLmhlaWdodCA9IG1pcG1hcC5oZWlnaHQgPSBoZWlnaHRcbiAgICBpbWcuY2hhbm5lbHMgPSBtaXBtYXAuY2hhbm5lbHMgPSA0XG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZU1pcE1hcEZyb21PYmplY3QgKG1pcG1hcCwgb3B0aW9ucykge1xuICAgIHZhciBpbWdEYXRhID0gbnVsbFxuICAgIGlmIChpc1BpeGVsRGF0YShvcHRpb25zKSkge1xuICAgICAgaW1nRGF0YSA9IG1pcG1hcC5pbWFnZXNbMF0gPSBhbGxvY0ltYWdlKClcbiAgICAgIGNvcHlGbGFncyhpbWdEYXRhLCBtaXBtYXApXG4gICAgICBwYXJzZUltYWdlKGltZ0RhdGEsIG9wdGlvbnMpXG4gICAgICBtaXBtYXAubWlwbWFzayA9IDFcbiAgICB9IGVsc2Uge1xuICAgICAgcGFyc2VGbGFncyhtaXBtYXAsIG9wdGlvbnMpXG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShvcHRpb25zLm1pcG1hcCkpIHtcbiAgICAgICAgdmFyIG1pcERhdGEgPSBvcHRpb25zLm1pcG1hcFxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG1pcERhdGEubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICBpbWdEYXRhID0gbWlwbWFwLmltYWdlc1tpXSA9IGFsbG9jSW1hZ2UoKVxuICAgICAgICAgIGNvcHlGbGFncyhpbWdEYXRhLCBtaXBtYXApXG4gICAgICAgICAgaW1nRGF0YS53aWR0aCA+Pj0gaVxuICAgICAgICAgIGltZ0RhdGEuaGVpZ2h0ID4+PSBpXG4gICAgICAgICAgcGFyc2VJbWFnZShpbWdEYXRhLCBtaXBEYXRhW2ldKVxuICAgICAgICAgIG1pcG1hcC5taXBtYXNrIHw9ICgxIDw8IGkpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGltZ0RhdGEgPSBtaXBtYXAuaW1hZ2VzWzBdID0gYWxsb2NJbWFnZSgpXG4gICAgICAgIGNvcHlGbGFncyhpbWdEYXRhLCBtaXBtYXApXG4gICAgICAgIHBhcnNlSW1hZ2UoaW1nRGF0YSwgb3B0aW9ucylcbiAgICAgICAgbWlwbWFwLm1pcG1hc2sgPSAxXG4gICAgICB9XG4gICAgfVxuICAgIGNvcHlGbGFncyhtaXBtYXAsIG1pcG1hcC5pbWFnZXNbMF0pXG5cbiAgICAvLyBGb3IgdGV4dHVyZXMgb2YgdGhlIGNvbXByZXNzZWQgZm9ybWF0IFdFQkdMX2NvbXByZXNzZWRfdGV4dHVyZV9zM3RjXG4gICAgLy8gd2UgbXVzdCBoYXZlIHRoYXRcbiAgICAvL1xuICAgIC8vIFwiV2hlbiBsZXZlbCBlcXVhbHMgemVybyB3aWR0aCBhbmQgaGVpZ2h0IG11c3QgYmUgYSBtdWx0aXBsZSBvZiA0LlxuICAgIC8vIFdoZW4gbGV2ZWwgaXMgZ3JlYXRlciB0aGFuIDAgd2lkdGggYW5kIGhlaWdodCBtdXN0IGJlIDAsIDEsIDIgb3IgYSBtdWx0aXBsZSBvZiA0LiBcIlxuICAgIC8vXG4gICAgLy8gYnV0IHdlIGRvIG5vdCB5ZXQgc3VwcG9ydCBoYXZpbmcgbXVsdGlwbGUgbWlwbWFwIGxldmVscyBmb3IgY29tcHJlc3NlZCB0ZXh0dXJlcyxcbiAgICAvLyBzbyB3ZSBvbmx5IHRlc3QgZm9yIGxldmVsIHplcm8uXG5cbiAgICBpZiAobWlwbWFwLmNvbXByZXNzZWQgJiZcbiAgICAgICAgKG1pcG1hcC5pbnRlcm5hbGZvcm1hdCA9PT0gR0xfQ09NUFJFU1NFRF9SR0JfUzNUQ19EWFQxX0VYVCkgfHxcbiAgICAgICAgKG1pcG1hcC5pbnRlcm5hbGZvcm1hdCA9PT0gR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUMV9FWFQpIHx8XG4gICAgICAgIChtaXBtYXAuaW50ZXJuYWxmb3JtYXQgPT09IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDNfRVhUKSB8fFxuICAgICAgICAobWlwbWFwLmludGVybmFsZm9ybWF0ID09PSBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQ1X0VYVCkpIHtcbiAgICAgIGNoZWNrKG1pcG1hcC53aWR0aCAlIDQgPT09IDAgJiZcbiAgICAgICAgICAgIG1pcG1hcC5oZWlnaHQgJSA0ID09PSAwLFxuICAgICAgICAgICAgJ2ZvciBjb21wcmVzc2VkIHRleHR1cmUgZm9ybWF0cywgbWlwbWFwIGxldmVsIDAgbXVzdCBoYXZlIHdpZHRoIGFuZCBoZWlnaHQgdGhhdCBhcmUgYSBtdWx0aXBsZSBvZiA0JylcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzZXRNaXBNYXAgKG1pcG1hcCwgdGFyZ2V0KSB7XG4gICAgdmFyIGltYWdlcyA9IG1pcG1hcC5pbWFnZXNcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGltYWdlcy5sZW5ndGg7ICsraSkge1xuICAgICAgaWYgKCFpbWFnZXNbaV0pIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICBzZXRJbWFnZShpbWFnZXNbaV0sIHRhcmdldCwgaSlcbiAgICB9XG4gIH1cblxuICB2YXIgbWlwUG9vbCA9IFtdXG5cbiAgZnVuY3Rpb24gYWxsb2NNaXBNYXAgKCkge1xuICAgIHZhciByZXN1bHQgPSBtaXBQb29sLnBvcCgpIHx8IG5ldyBNaXBNYXAoKVxuICAgIFRleEZsYWdzLmNhbGwocmVzdWx0KVxuICAgIHJlc3VsdC5taXBtYXNrID0gMFxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgMTY7ICsraSkge1xuICAgICAgcmVzdWx0LmltYWdlc1tpXSA9IG51bGxcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG5cbiAgZnVuY3Rpb24gZnJlZU1pcE1hcCAobWlwbWFwKSB7XG4gICAgdmFyIGltYWdlcyA9IG1pcG1hcC5pbWFnZXNcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGltYWdlcy5sZW5ndGg7ICsraSkge1xuICAgICAgaWYgKGltYWdlc1tpXSkge1xuICAgICAgICBmcmVlSW1hZ2UoaW1hZ2VzW2ldKVxuICAgICAgfVxuICAgICAgaW1hZ2VzW2ldID0gbnVsbFxuICAgIH1cbiAgICBtaXBQb29sLnB1c2gobWlwbWFwKVxuICB9XG5cbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAvLyBUZXggaW5mb1xuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIGZ1bmN0aW9uIFRleEluZm8gKCkge1xuICAgIHRoaXMubWluRmlsdGVyID0gR0xfTkVBUkVTVFxuICAgIHRoaXMubWFnRmlsdGVyID0gR0xfTkVBUkVTVFxuXG4gICAgdGhpcy53cmFwUyA9IEdMX0NMQU1QX1RPX0VER0VcbiAgICB0aGlzLndyYXBUID0gR0xfQ0xBTVBfVE9fRURHRVxuXG4gICAgdGhpcy5hbmlzb3Ryb3BpYyA9IDFcblxuICAgIHRoaXMuZ2VuTWlwbWFwcyA9IGZhbHNlXG4gICAgdGhpcy5taXBtYXBIaW50ID0gR0xfRE9OVF9DQVJFXG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZVRleEluZm8gKGluZm8sIG9wdGlvbnMpIHtcbiAgICBpZiAoJ21pbicgaW4gb3B0aW9ucykge1xuICAgICAgdmFyIG1pbkZpbHRlciA9IG9wdGlvbnMubWluXG4gICAgICBjaGVjay5wYXJhbWV0ZXIobWluRmlsdGVyLCBtaW5GaWx0ZXJzKVxuICAgICAgaW5mby5taW5GaWx0ZXIgPSBtaW5GaWx0ZXJzW21pbkZpbHRlcl1cbiAgICAgIGlmIChNSVBNQVBfRklMVEVSUy5pbmRleE9mKGluZm8ubWluRmlsdGVyKSA+PSAwKSB7XG4gICAgICAgIGluZm8uZ2VuTWlwbWFwcyA9IHRydWVcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoJ21hZycgaW4gb3B0aW9ucykge1xuICAgICAgdmFyIG1hZ0ZpbHRlciA9IG9wdGlvbnMubWFnXG4gICAgICBjaGVjay5wYXJhbWV0ZXIobWFnRmlsdGVyLCBtYWdGaWx0ZXJzKVxuICAgICAgaW5mby5tYWdGaWx0ZXIgPSBtYWdGaWx0ZXJzW21hZ0ZpbHRlcl1cbiAgICB9XG5cbiAgICB2YXIgd3JhcFMgPSBpbmZvLndyYXBTXG4gICAgdmFyIHdyYXBUID0gaW5mby53cmFwVFxuICAgIGlmICgnd3JhcCcgaW4gb3B0aW9ucykge1xuICAgICAgdmFyIHdyYXAgPSBvcHRpb25zLndyYXBcbiAgICAgIGlmICh0eXBlb2Ygd3JhcCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgY2hlY2sucGFyYW1ldGVyKHdyYXAsIHdyYXBNb2RlcylcbiAgICAgICAgd3JhcFMgPSB3cmFwVCA9IHdyYXBNb2Rlc1t3cmFwXVxuICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KHdyYXApKSB7XG4gICAgICAgIGNoZWNrLnBhcmFtZXRlcih3cmFwWzBdLCB3cmFwTW9kZXMpXG4gICAgICAgIGNoZWNrLnBhcmFtZXRlcih3cmFwWzFdLCB3cmFwTW9kZXMpXG4gICAgICAgIHdyYXBTID0gd3JhcE1vZGVzW3dyYXBbMF1dXG4gICAgICAgIHdyYXBUID0gd3JhcE1vZGVzW3dyYXBbMV1dXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmICgnd3JhcFMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIG9wdFdyYXBTID0gb3B0aW9ucy53cmFwU1xuICAgICAgICBjaGVjay5wYXJhbWV0ZXIob3B0V3JhcFMsIHdyYXBNb2RlcylcbiAgICAgICAgd3JhcFMgPSB3cmFwTW9kZXNbb3B0V3JhcFNdXG4gICAgICB9XG4gICAgICBpZiAoJ3dyYXBUJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBvcHRXcmFwVCA9IG9wdGlvbnMud3JhcFRcbiAgICAgICAgY2hlY2sucGFyYW1ldGVyKG9wdFdyYXBULCB3cmFwTW9kZXMpXG4gICAgICAgIHdyYXBUID0gd3JhcE1vZGVzW29wdFdyYXBUXVxuICAgICAgfVxuICAgIH1cbiAgICBpbmZvLndyYXBTID0gd3JhcFNcbiAgICBpbmZvLndyYXBUID0gd3JhcFRcblxuICAgIGlmICgnYW5pc290cm9waWMnIGluIG9wdGlvbnMpIHtcbiAgICAgIHZhciBhbmlzb3Ryb3BpYyA9IG9wdGlvbnMuYW5pc290cm9waWNcbiAgICAgIGNoZWNrKHR5cGVvZiBhbmlzb3Ryb3BpYyA9PT0gJ251bWJlcicgJiZcbiAgICAgICAgIGFuaXNvdHJvcGljID49IDEgJiYgYW5pc290cm9waWMgPD0gbGltaXRzLm1heEFuaXNvdHJvcGljLFxuICAgICAgICAnYW5pc28gc2FtcGxlcyBtdXN0IGJlIGJldHdlZW4gMSBhbmQgJylcbiAgICAgIGluZm8uYW5pc290cm9waWMgPSBvcHRpb25zLmFuaXNvdHJvcGljXG4gICAgfVxuXG4gICAgaWYgKCdtaXBtYXAnIGluIG9wdGlvbnMpIHtcbiAgICAgIHZhciBoYXNNaXBNYXAgPSBmYWxzZVxuICAgICAgc3dpdGNoICh0eXBlb2Ygb3B0aW9ucy5taXBtYXApIHtcbiAgICAgICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgICAgICBjaGVjay5wYXJhbWV0ZXIob3B0aW9ucy5taXBtYXAsIG1pcG1hcEhpbnQsXG4gICAgICAgICAgICAnaW52YWxpZCBtaXBtYXAgaGludCcpXG4gICAgICAgICAgaW5mby5taXBtYXBIaW50ID0gbWlwbWFwSGludFtvcHRpb25zLm1pcG1hcF1cbiAgICAgICAgICBpbmZvLmdlbk1pcG1hcHMgPSB0cnVlXG4gICAgICAgICAgaGFzTWlwTWFwID0gdHJ1ZVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICAgICAgaGFzTWlwTWFwID0gaW5mby5nZW5NaXBtYXBzID0gb3B0aW9ucy5taXBtYXBcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICAgICAgY2hlY2soQXJyYXkuaXNBcnJheShvcHRpb25zLm1pcG1hcCksICdpbnZhbGlkIG1pcG1hcCB0eXBlJylcbiAgICAgICAgICBpbmZvLmdlbk1pcG1hcHMgPSBmYWxzZVxuICAgICAgICAgIGhhc01pcE1hcCA9IHRydWVcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgY2hlY2sucmFpc2UoJ2ludmFsaWQgbWlwbWFwIHR5cGUnKVxuICAgICAgfVxuICAgICAgaWYgKGhhc01pcE1hcCAmJiAhKCdtaW4nIGluIG9wdGlvbnMpKSB7XG4gICAgICAgIGluZm8ubWluRmlsdGVyID0gR0xfTkVBUkVTVF9NSVBNQVBfTkVBUkVTVFxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHNldFRleEluZm8gKGluZm8sIHRhcmdldCkge1xuICAgIGdsLnRleFBhcmFtZXRlcmkodGFyZ2V0LCBHTF9URVhUVVJFX01JTl9GSUxURVIsIGluZm8ubWluRmlsdGVyKVxuICAgIGdsLnRleFBhcmFtZXRlcmkodGFyZ2V0LCBHTF9URVhUVVJFX01BR19GSUxURVIsIGluZm8ubWFnRmlsdGVyKVxuICAgIGdsLnRleFBhcmFtZXRlcmkodGFyZ2V0LCBHTF9URVhUVVJFX1dSQVBfUywgaW5mby53cmFwUylcbiAgICBnbC50ZXhQYXJhbWV0ZXJpKHRhcmdldCwgR0xfVEVYVFVSRV9XUkFQX1QsIGluZm8ud3JhcFQpXG4gICAgaWYgKGV4dGVuc2lvbnMuZXh0X3RleHR1cmVfZmlsdGVyX2FuaXNvdHJvcGljKSB7XG4gICAgICBnbC50ZXhQYXJhbWV0ZXJpKHRhcmdldCwgR0xfVEVYVFVSRV9NQVhfQU5JU09UUk9QWV9FWFQsIGluZm8uYW5pc290cm9waWMpXG4gICAgfVxuICAgIGlmIChpbmZvLmdlbk1pcG1hcHMpIHtcbiAgICAgIGdsLmhpbnQoR0xfR0VORVJBVEVfTUlQTUFQX0hJTlQsIGluZm8ubWlwbWFwSGludClcbiAgICAgIGdsLmdlbmVyYXRlTWlwbWFwKHRhcmdldClcbiAgICB9XG4gIH1cblxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIEZ1bGwgdGV4dHVyZSBvYmplY3RcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICB2YXIgdGV4dHVyZUNvdW50ID0gMFxuICB2YXIgdGV4dHVyZVNldCA9IHt9XG4gIHZhciBudW1UZXhVbml0cyA9IGxpbWl0cy5tYXhUZXh0dXJlVW5pdHNcbiAgdmFyIHRleHR1cmVVbml0cyA9IEFycmF5KG51bVRleFVuaXRzKS5tYXAoZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBudWxsXG4gIH0pXG5cbiAgZnVuY3Rpb24gUkVHTFRleHR1cmUgKHRhcmdldCkge1xuICAgIFRleEZsYWdzLmNhbGwodGhpcylcbiAgICB0aGlzLm1pcG1hc2sgPSAwXG4gICAgdGhpcy5pbnRlcm5hbGZvcm1hdCA9IEdMX1JHQkFcblxuICAgIHRoaXMuaWQgPSB0ZXh0dXJlQ291bnQrK1xuXG4gICAgdGhpcy5yZWZDb3VudCA9IDFcblxuICAgIHRoaXMudGFyZ2V0ID0gdGFyZ2V0XG4gICAgdGhpcy50ZXh0dXJlID0gZ2wuY3JlYXRlVGV4dHVyZSgpXG5cbiAgICB0aGlzLnVuaXQgPSAtMVxuICAgIHRoaXMuYmluZENvdW50ID0gMFxuXG4gICAgdGhpcy50ZXhJbmZvID0gbmV3IFRleEluZm8oKVxuXG4gICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICB0aGlzLnN0YXRzID0ge3NpemU6IDB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gdGVtcEJpbmQgKHRleHR1cmUpIHtcbiAgICBnbC5hY3RpdmVUZXh0dXJlKEdMX1RFWFRVUkUwKVxuICAgIGdsLmJpbmRUZXh0dXJlKHRleHR1cmUudGFyZ2V0LCB0ZXh0dXJlLnRleHR1cmUpXG4gIH1cblxuICBmdW5jdGlvbiB0ZW1wUmVzdG9yZSAoKSB7XG4gICAgdmFyIHByZXYgPSB0ZXh0dXJlVW5pdHNbMF1cbiAgICBpZiAocHJldikge1xuICAgICAgZ2wuYmluZFRleHR1cmUocHJldi50YXJnZXQsIHByZXYudGV4dHVyZSlcbiAgICB9IGVsc2Uge1xuICAgICAgZ2wuYmluZFRleHR1cmUoR0xfVEVYVFVSRV8yRCwgbnVsbClcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95ICh0ZXh0dXJlKSB7XG4gICAgdmFyIGhhbmRsZSA9IHRleHR1cmUudGV4dHVyZVxuICAgIGNoZWNrKGhhbmRsZSwgJ211c3Qgbm90IGRvdWJsZSBkZXN0cm95IHRleHR1cmUnKVxuICAgIHZhciB1bml0ID0gdGV4dHVyZS51bml0XG4gICAgdmFyIHRhcmdldCA9IHRleHR1cmUudGFyZ2V0XG4gICAgaWYgKHVuaXQgPj0gMCkge1xuICAgICAgZ2wuYWN0aXZlVGV4dHVyZShHTF9URVhUVVJFMCArIHVuaXQpXG4gICAgICBnbC5iaW5kVGV4dHVyZSh0YXJnZXQsIG51bGwpXG4gICAgICB0ZXh0dXJlVW5pdHNbdW5pdF0gPSBudWxsXG4gICAgfVxuICAgIGdsLmRlbGV0ZVRleHR1cmUoaGFuZGxlKVxuICAgIHRleHR1cmUudGV4dHVyZSA9IG51bGxcbiAgICB0ZXh0dXJlLnBhcmFtcyA9IG51bGxcbiAgICB0ZXh0dXJlLnBpeGVscyA9IG51bGxcbiAgICB0ZXh0dXJlLnJlZkNvdW50ID0gMFxuICAgIGRlbGV0ZSB0ZXh0dXJlU2V0W3RleHR1cmUuaWRdXG4gICAgc3RhdHMudGV4dHVyZUNvdW50LS1cbiAgfVxuXG4gIGV4dGVuZChSRUdMVGV4dHVyZS5wcm90b3R5cGUsIHtcbiAgICBiaW5kOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgdGV4dHVyZSA9IHRoaXNcbiAgICAgIHRleHR1cmUuYmluZENvdW50ICs9IDFcbiAgICAgIHZhciB1bml0ID0gdGV4dHVyZS51bml0XG4gICAgICBpZiAodW5pdCA8IDApIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBudW1UZXhVbml0czsgKytpKSB7XG4gICAgICAgICAgdmFyIG90aGVyID0gdGV4dHVyZVVuaXRzW2ldXG4gICAgICAgICAgaWYgKG90aGVyKSB7XG4gICAgICAgICAgICBpZiAob3RoZXIuYmluZENvdW50ID4gMCkge1xuICAgICAgICAgICAgICBjb250aW51ZVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgb3RoZXIudW5pdCA9IC0xXG4gICAgICAgICAgfVxuICAgICAgICAgIHRleHR1cmVVbml0c1tpXSA9IHRleHR1cmVcbiAgICAgICAgICB1bml0ID0gaVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIH1cbiAgICAgICAgaWYgKHVuaXQgPj0gbnVtVGV4VW5pdHMpIHtcbiAgICAgICAgICBjaGVjay5yYWlzZSgnaW5zdWZmaWNpZW50IG51bWJlciBvZiB0ZXh0dXJlIHVuaXRzJylcbiAgICAgICAgfVxuICAgICAgICBpZiAoY29uZmlnLnByb2ZpbGUgJiYgc3RhdHMubWF4VGV4dHVyZVVuaXRzIDwgKHVuaXQgKyAxKSkge1xuICAgICAgICAgIHN0YXRzLm1heFRleHR1cmVVbml0cyA9IHVuaXQgKyAxIC8vICsxLCBzaW5jZSB0aGUgdW5pdHMgYXJlIHplcm8tYmFzZWRcbiAgICAgICAgfVxuICAgICAgICB0ZXh0dXJlLnVuaXQgPSB1bml0XG4gICAgICAgIGdsLmFjdGl2ZVRleHR1cmUoR0xfVEVYVFVSRTAgKyB1bml0KVxuICAgICAgICBnbC5iaW5kVGV4dHVyZSh0ZXh0dXJlLnRhcmdldCwgdGV4dHVyZS50ZXh0dXJlKVxuICAgICAgfVxuICAgICAgcmV0dXJuIHVuaXRcbiAgICB9LFxuXG4gICAgdW5iaW5kOiBmdW5jdGlvbiAoKSB7XG4gICAgICB0aGlzLmJpbmRDb3VudCAtPSAxXG4gICAgfSxcblxuICAgIGRlY1JlZjogZnVuY3Rpb24gKCkge1xuICAgICAgaWYgKC0tdGhpcy5yZWZDb3VudCA8PSAwKSB7XG4gICAgICAgIGRlc3Ryb3kodGhpcylcbiAgICAgIH1cbiAgICB9XG4gIH0pXG5cbiAgZnVuY3Rpb24gY3JlYXRlVGV4dHVyZTJEIChhLCBiKSB7XG4gICAgdmFyIHRleHR1cmUgPSBuZXcgUkVHTFRleHR1cmUoR0xfVEVYVFVSRV8yRClcbiAgICB0ZXh0dXJlU2V0W3RleHR1cmUuaWRdID0gdGV4dHVyZVxuICAgIHN0YXRzLnRleHR1cmVDb3VudCsrXG5cbiAgICBmdW5jdGlvbiByZWdsVGV4dHVyZTJEIChhLCBiKSB7XG4gICAgICB2YXIgdGV4SW5mbyA9IHRleHR1cmUudGV4SW5mb1xuICAgICAgVGV4SW5mby5jYWxsKHRleEluZm8pXG4gICAgICB2YXIgbWlwRGF0YSA9IGFsbG9jTWlwTWFwKClcblxuICAgICAgaWYgKHR5cGVvZiBhID09PSAnbnVtYmVyJykge1xuICAgICAgICBpZiAodHlwZW9mIGIgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgcGFyc2VNaXBNYXBGcm9tU2hhcGUobWlwRGF0YSwgYSB8IDAsIGIgfCAwKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbVNoYXBlKG1pcERhdGEsIGEgfCAwLCBhIHwgMClcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChhKSB7XG4gICAgICAgIGNoZWNrLnR5cGUoYSwgJ29iamVjdCcsICdpbnZhbGlkIGFyZ3VtZW50cyB0byByZWdsLnRleHR1cmUnKVxuICAgICAgICBwYXJzZVRleEluZm8odGV4SW5mbywgYSlcbiAgICAgICAgcGFyc2VNaXBNYXBGcm9tT2JqZWN0KG1pcERhdGEsIGEpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBlbXB0eSB0ZXh0dXJlcyBnZXQgYXNzaWduZWQgYSBkZWZhdWx0IHNoYXBlIG9mIDF4MVxuICAgICAgICBwYXJzZU1pcE1hcEZyb21TaGFwZShtaXBEYXRhLCAxLCAxKVxuICAgICAgfVxuXG4gICAgICBpZiAodGV4SW5mby5nZW5NaXBtYXBzKSB7XG4gICAgICAgIG1pcERhdGEubWlwbWFzayA9IChtaXBEYXRhLndpZHRoIDw8IDEpIC0gMVxuICAgICAgfVxuICAgICAgdGV4dHVyZS5taXBtYXNrID0gbWlwRGF0YS5taXBtYXNrXG5cbiAgICAgIGNvcHlGbGFncyh0ZXh0dXJlLCBtaXBEYXRhKVxuXG4gICAgICBjaGVjay50ZXh0dXJlMkQodGV4SW5mbywgbWlwRGF0YSwgbGltaXRzKVxuICAgICAgdGV4dHVyZS5pbnRlcm5hbGZvcm1hdCA9IG1pcERhdGEuaW50ZXJuYWxmb3JtYXRcblxuICAgICAgcmVnbFRleHR1cmUyRC53aWR0aCA9IG1pcERhdGEud2lkdGhcbiAgICAgIHJlZ2xUZXh0dXJlMkQuaGVpZ2h0ID0gbWlwRGF0YS5oZWlnaHRcblxuICAgICAgdGVtcEJpbmQodGV4dHVyZSlcbiAgICAgIHNldE1pcE1hcChtaXBEYXRhLCBHTF9URVhUVVJFXzJEKVxuICAgICAgc2V0VGV4SW5mbyh0ZXhJbmZvLCBHTF9URVhUVVJFXzJEKVxuICAgICAgdGVtcFJlc3RvcmUoKVxuXG4gICAgICBmcmVlTWlwTWFwKG1pcERhdGEpXG5cbiAgICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgICB0ZXh0dXJlLnN0YXRzLnNpemUgPSBnZXRUZXh0dXJlU2l6ZShcbiAgICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0LFxuICAgICAgICAgIHRleHR1cmUudHlwZSxcbiAgICAgICAgICBtaXBEYXRhLndpZHRoLFxuICAgICAgICAgIG1pcERhdGEuaGVpZ2h0LFxuICAgICAgICAgIHRleEluZm8uZ2VuTWlwbWFwcyxcbiAgICAgICAgICBmYWxzZSlcbiAgICAgIH1cbiAgICAgIHJlZ2xUZXh0dXJlMkQuZm9ybWF0ID0gdGV4dHVyZUZvcm1hdHNJbnZlcnRbdGV4dHVyZS5pbnRlcm5hbGZvcm1hdF1cbiAgICAgIHJlZ2xUZXh0dXJlMkQudHlwZSA9IHRleHR1cmVUeXBlc0ludmVydFt0ZXh0dXJlLnR5cGVdXG5cbiAgICAgIHJlZ2xUZXh0dXJlMkQubWFnID0gbWFnRmlsdGVyc0ludmVydFt0ZXhJbmZvLm1hZ0ZpbHRlcl1cbiAgICAgIHJlZ2xUZXh0dXJlMkQubWluID0gbWluRmlsdGVyc0ludmVydFt0ZXhJbmZvLm1pbkZpbHRlcl1cblxuICAgICAgcmVnbFRleHR1cmUyRC53cmFwUyA9IHdyYXBNb2Rlc0ludmVydFt0ZXhJbmZvLndyYXBTXVxuICAgICAgcmVnbFRleHR1cmUyRC53cmFwVCA9IHdyYXBNb2Rlc0ludmVydFt0ZXhJbmZvLndyYXBUXVxuXG4gICAgICByZXR1cm4gcmVnbFRleHR1cmUyRFxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHN1YmltYWdlIChpbWFnZSwgeF8sIHlfLCBsZXZlbF8pIHtcbiAgICAgIGNoZWNrKCEhaW1hZ2UsICdtdXN0IHNwZWNpZnkgaW1hZ2UgZGF0YScpXG5cbiAgICAgIHZhciB4ID0geF8gfCAwXG4gICAgICB2YXIgeSA9IHlfIHwgMFxuICAgICAgdmFyIGxldmVsID0gbGV2ZWxfIHwgMFxuXG4gICAgICB2YXIgaW1hZ2VEYXRhID0gYWxsb2NJbWFnZSgpXG4gICAgICBjb3B5RmxhZ3MoaW1hZ2VEYXRhLCB0ZXh0dXJlKVxuICAgICAgaW1hZ2VEYXRhLndpZHRoID0gMFxuICAgICAgaW1hZ2VEYXRhLmhlaWdodCA9IDBcbiAgICAgIHBhcnNlSW1hZ2UoaW1hZ2VEYXRhLCBpbWFnZSlcbiAgICAgIGltYWdlRGF0YS53aWR0aCA9IGltYWdlRGF0YS53aWR0aCB8fCAoKHRleHR1cmUud2lkdGggPj4gbGV2ZWwpIC0geClcbiAgICAgIGltYWdlRGF0YS5oZWlnaHQgPSBpbWFnZURhdGEuaGVpZ2h0IHx8ICgodGV4dHVyZS5oZWlnaHQgPj4gbGV2ZWwpIC0geSlcblxuICAgICAgY2hlY2soXG4gICAgICAgIHRleHR1cmUudHlwZSA9PT0gaW1hZ2VEYXRhLnR5cGUgJiZcbiAgICAgICAgdGV4dHVyZS5mb3JtYXQgPT09IGltYWdlRGF0YS5mb3JtYXQgJiZcbiAgICAgICAgdGV4dHVyZS5pbnRlcm5hbGZvcm1hdCA9PT0gaW1hZ2VEYXRhLmludGVybmFsZm9ybWF0LFxuICAgICAgICAnaW5jb21wYXRpYmxlIGZvcm1hdCBmb3IgdGV4dHVyZS5zdWJpbWFnZScpXG4gICAgICBjaGVjayhcbiAgICAgICAgeCA+PSAwICYmIHkgPj0gMCAmJlxuICAgICAgICB4ICsgaW1hZ2VEYXRhLndpZHRoIDw9IHRleHR1cmUud2lkdGggJiZcbiAgICAgICAgeSArIGltYWdlRGF0YS5oZWlnaHQgPD0gdGV4dHVyZS5oZWlnaHQsXG4gICAgICAgICd0ZXh0dXJlLnN1YmltYWdlIHdyaXRlIG91dCBvZiBib3VuZHMnKVxuICAgICAgY2hlY2soXG4gICAgICAgIHRleHR1cmUubWlwbWFzayAmICgxIDw8IGxldmVsKSxcbiAgICAgICAgJ21pc3NpbmcgbWlwbWFwIGRhdGEnKVxuICAgICAgY2hlY2soXG4gICAgICAgIGltYWdlRGF0YS5kYXRhIHx8IGltYWdlRGF0YS5lbGVtZW50IHx8IGltYWdlRGF0YS5uZWVkc0NvcHksXG4gICAgICAgICdtaXNzaW5nIGltYWdlIGRhdGEnKVxuXG4gICAgICB0ZW1wQmluZCh0ZXh0dXJlKVxuICAgICAgc2V0U3ViSW1hZ2UoaW1hZ2VEYXRhLCBHTF9URVhUVVJFXzJELCB4LCB5LCBsZXZlbClcbiAgICAgIHRlbXBSZXN0b3JlKClcblxuICAgICAgZnJlZUltYWdlKGltYWdlRGF0YSlcblxuICAgICAgcmV0dXJuIHJlZ2xUZXh0dXJlMkRcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZXNpemUgKHdfLCBoXykge1xuICAgICAgdmFyIHcgPSB3XyB8IDBcbiAgICAgIHZhciBoID0gKGhfIHwgMCkgfHwgd1xuICAgICAgaWYgKHcgPT09IHRleHR1cmUud2lkdGggJiYgaCA9PT0gdGV4dHVyZS5oZWlnaHQpIHtcbiAgICAgICAgcmV0dXJuIHJlZ2xUZXh0dXJlMkRcbiAgICAgIH1cblxuICAgICAgcmVnbFRleHR1cmUyRC53aWR0aCA9IHRleHR1cmUud2lkdGggPSB3XG4gICAgICByZWdsVGV4dHVyZTJELmhlaWdodCA9IHRleHR1cmUuaGVpZ2h0ID0gaFxuXG4gICAgICB0ZW1wQmluZCh0ZXh0dXJlKVxuICAgICAgZm9yICh2YXIgaSA9IDA7IHRleHR1cmUubWlwbWFzayA+PiBpOyArK2kpIHtcbiAgICAgICAgZ2wudGV4SW1hZ2UyRChcbiAgICAgICAgICBHTF9URVhUVVJFXzJELFxuICAgICAgICAgIGksXG4gICAgICAgICAgdGV4dHVyZS5mb3JtYXQsXG4gICAgICAgICAgdyA+PiBpLFxuICAgICAgICAgIGggPj4gaSxcbiAgICAgICAgICAwLFxuICAgICAgICAgIHRleHR1cmUuZm9ybWF0LFxuICAgICAgICAgIHRleHR1cmUudHlwZSxcbiAgICAgICAgICBudWxsKVxuICAgICAgfVxuICAgICAgdGVtcFJlc3RvcmUoKVxuXG4gICAgICAvLyBhbHNvLCByZWNvbXB1dGUgdGhlIHRleHR1cmUgc2l6ZS5cbiAgICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgICB0ZXh0dXJlLnN0YXRzLnNpemUgPSBnZXRUZXh0dXJlU2l6ZShcbiAgICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0LFxuICAgICAgICAgIHRleHR1cmUudHlwZSxcbiAgICAgICAgICB3LFxuICAgICAgICAgIGgsXG4gICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgZmFsc2UpXG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZWdsVGV4dHVyZTJEXG4gICAgfVxuXG4gICAgcmVnbFRleHR1cmUyRChhLCBiKVxuXG4gICAgcmVnbFRleHR1cmUyRC5zdWJpbWFnZSA9IHN1YmltYWdlXG4gICAgcmVnbFRleHR1cmUyRC5yZXNpemUgPSByZXNpemVcbiAgICByZWdsVGV4dHVyZTJELl9yZWdsVHlwZSA9ICd0ZXh0dXJlMmQnXG4gICAgcmVnbFRleHR1cmUyRC5fdGV4dHVyZSA9IHRleHR1cmVcbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgIHJlZ2xUZXh0dXJlMkQuc3RhdHMgPSB0ZXh0dXJlLnN0YXRzXG4gICAgfVxuICAgIHJlZ2xUZXh0dXJlMkQuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHRleHR1cmUuZGVjUmVmKClcbiAgICB9XG5cbiAgICByZXR1cm4gcmVnbFRleHR1cmUyRFxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlVGV4dHVyZUN1YmUgKGEwLCBhMSwgYTIsIGEzLCBhNCwgYTUpIHtcbiAgICB2YXIgdGV4dHVyZSA9IG5ldyBSRUdMVGV4dHVyZShHTF9URVhUVVJFX0NVQkVfTUFQKVxuICAgIHRleHR1cmVTZXRbdGV4dHVyZS5pZF0gPSB0ZXh0dXJlXG4gICAgc3RhdHMuY3ViZUNvdW50KytcblxuICAgIHZhciBmYWNlcyA9IG5ldyBBcnJheSg2KVxuXG4gICAgZnVuY3Rpb24gcmVnbFRleHR1cmVDdWJlIChhMCwgYTEsIGEyLCBhMywgYTQsIGE1KSB7XG4gICAgICB2YXIgaVxuICAgICAgdmFyIHRleEluZm8gPSB0ZXh0dXJlLnRleEluZm9cbiAgICAgIFRleEluZm8uY2FsbCh0ZXhJbmZvKVxuICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICBmYWNlc1tpXSA9IGFsbG9jTWlwTWFwKClcbiAgICAgIH1cblxuICAgICAgaWYgKHR5cGVvZiBhMCA9PT0gJ251bWJlcicgfHwgIWEwKSB7XG4gICAgICAgIHZhciBzID0gKGEwIHwgMCkgfHwgMVxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgICAgcGFyc2VNaXBNYXBGcm9tU2hhcGUoZmFjZXNbaV0sIHMsIHMpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGEwID09PSAnb2JqZWN0Jykge1xuICAgICAgICBpZiAoYTEpIHtcbiAgICAgICAgICBwYXJzZU1pcE1hcEZyb21PYmplY3QoZmFjZXNbMF0sIGEwKVxuICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbU9iamVjdChmYWNlc1sxXSwgYTEpXG4gICAgICAgICAgcGFyc2VNaXBNYXBGcm9tT2JqZWN0KGZhY2VzWzJdLCBhMilcbiAgICAgICAgICBwYXJzZU1pcE1hcEZyb21PYmplY3QoZmFjZXNbM10sIGEzKVxuICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbU9iamVjdChmYWNlc1s0XSwgYTQpXG4gICAgICAgICAgcGFyc2VNaXBNYXBGcm9tT2JqZWN0KGZhY2VzWzVdLCBhNSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwYXJzZVRleEluZm8odGV4SW5mbywgYTApXG4gICAgICAgICAgcGFyc2VGbGFncyh0ZXh0dXJlLCBhMClcbiAgICAgICAgICBpZiAoJ2ZhY2VzJyBpbiBhMCkge1xuICAgICAgICAgICAgdmFyIGZhY2VfaW5wdXQgPSBhMC5mYWNlc1xuICAgICAgICAgICAgY2hlY2soQXJyYXkuaXNBcnJheShmYWNlX2lucHV0KSAmJiBmYWNlX2lucHV0Lmxlbmd0aCA9PT0gNixcbiAgICAgICAgICAgICAgJ2N1YmUgZmFjZXMgbXVzdCBiZSBhIGxlbmd0aCA2IGFycmF5JylcbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCA2OyArK2kpIHtcbiAgICAgICAgICAgICAgY2hlY2sodHlwZW9mIGZhY2VfaW5wdXRbaV0gPT09ICdvYmplY3QnICYmICEhZmFjZV9pbnB1dFtpXSxcbiAgICAgICAgICAgICAgICAnaW52YWxpZCBpbnB1dCBmb3IgY3ViZSBtYXAgZmFjZScpXG4gICAgICAgICAgICAgIGNvcHlGbGFncyhmYWNlc1tpXSwgdGV4dHVyZSlcbiAgICAgICAgICAgICAgcGFyc2VNaXBNYXBGcm9tT2JqZWN0KGZhY2VzW2ldLCBmYWNlX2lucHV0W2ldKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbU9iamVjdChmYWNlc1tpXSwgYTApXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjaGVjay5yYWlzZSgnaW52YWxpZCBhcmd1bWVudHMgdG8gY3ViZSBtYXAnKVxuICAgICAgfVxuXG4gICAgICBjb3B5RmxhZ3ModGV4dHVyZSwgZmFjZXNbMF0pXG4gICAgICBpZiAodGV4SW5mby5nZW5NaXBtYXBzKSB7XG4gICAgICAgIHRleHR1cmUubWlwbWFzayA9IChmYWNlc1swXS53aWR0aCA8PCAxKSAtIDFcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRleHR1cmUubWlwbWFzayA9IGZhY2VzWzBdLm1pcG1hc2tcbiAgICAgIH1cblxuICAgICAgY2hlY2sudGV4dHVyZUN1YmUodGV4dHVyZSwgdGV4SW5mbywgZmFjZXMsIGxpbWl0cylcbiAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQgPSBmYWNlc1swXS5pbnRlcm5hbGZvcm1hdFxuXG4gICAgICByZWdsVGV4dHVyZUN1YmUud2lkdGggPSBmYWNlc1swXS53aWR0aFxuICAgICAgcmVnbFRleHR1cmVDdWJlLmhlaWdodCA9IGZhY2VzWzBdLmhlaWdodFxuXG4gICAgICB0ZW1wQmluZCh0ZXh0dXJlKVxuICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICBzZXRNaXBNYXAoZmFjZXNbaV0sIEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCArIGkpXG4gICAgICB9XG4gICAgICBzZXRUZXhJbmZvKHRleEluZm8sIEdMX1RFWFRVUkVfQ1VCRV9NQVApXG4gICAgICB0ZW1wUmVzdG9yZSgpXG5cbiAgICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgICB0ZXh0dXJlLnN0YXRzLnNpemUgPSBnZXRUZXh0dXJlU2l6ZShcbiAgICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0LFxuICAgICAgICAgIHRleHR1cmUudHlwZSxcbiAgICAgICAgICByZWdsVGV4dHVyZUN1YmUud2lkdGgsXG4gICAgICAgICAgcmVnbFRleHR1cmVDdWJlLmhlaWdodCxcbiAgICAgICAgICB0ZXhJbmZvLmdlbk1pcG1hcHMsXG4gICAgICAgICAgdHJ1ZSlcbiAgICAgIH1cblxuICAgICAgcmVnbFRleHR1cmVDdWJlLmZvcm1hdCA9IHRleHR1cmVGb3JtYXRzSW52ZXJ0W3RleHR1cmUuaW50ZXJuYWxmb3JtYXRdXG4gICAgICByZWdsVGV4dHVyZUN1YmUudHlwZSA9IHRleHR1cmVUeXBlc0ludmVydFt0ZXh0dXJlLnR5cGVdXG5cbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS5tYWcgPSBtYWdGaWx0ZXJzSW52ZXJ0W3RleEluZm8ubWFnRmlsdGVyXVxuICAgICAgcmVnbFRleHR1cmVDdWJlLm1pbiA9IG1pbkZpbHRlcnNJbnZlcnRbdGV4SW5mby5taW5GaWx0ZXJdXG5cbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS53cmFwUyA9IHdyYXBNb2Rlc0ludmVydFt0ZXhJbmZvLndyYXBTXVxuICAgICAgcmVnbFRleHR1cmVDdWJlLndyYXBUID0gd3JhcE1vZGVzSW52ZXJ0W3RleEluZm8ud3JhcFRdXG5cbiAgICAgIGZvciAoaSA9IDA7IGkgPCA2OyArK2kpIHtcbiAgICAgICAgZnJlZU1pcE1hcChmYWNlc1tpXSlcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJlZ2xUZXh0dXJlQ3ViZVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHN1YmltYWdlIChmYWNlLCBpbWFnZSwgeF8sIHlfLCBsZXZlbF8pIHtcbiAgICAgIGNoZWNrKCEhaW1hZ2UsICdtdXN0IHNwZWNpZnkgaW1hZ2UgZGF0YScpXG4gICAgICBjaGVjayh0eXBlb2YgZmFjZSA9PT0gJ251bWJlcicgJiYgZmFjZSA9PT0gKGZhY2UgfCAwKSAmJlxuICAgICAgICBmYWNlID49IDAgJiYgZmFjZSA8IDYsICdpbnZhbGlkIGZhY2UnKVxuXG4gICAgICB2YXIgeCA9IHhfIHwgMFxuICAgICAgdmFyIHkgPSB5XyB8IDBcbiAgICAgIHZhciBsZXZlbCA9IGxldmVsXyB8IDBcblxuICAgICAgdmFyIGltYWdlRGF0YSA9IGFsbG9jSW1hZ2UoKVxuICAgICAgY29weUZsYWdzKGltYWdlRGF0YSwgdGV4dHVyZSlcbiAgICAgIGltYWdlRGF0YS53aWR0aCA9IDBcbiAgICAgIGltYWdlRGF0YS5oZWlnaHQgPSAwXG4gICAgICBwYXJzZUltYWdlKGltYWdlRGF0YSwgaW1hZ2UpXG4gICAgICBpbWFnZURhdGEud2lkdGggPSBpbWFnZURhdGEud2lkdGggfHwgKCh0ZXh0dXJlLndpZHRoID4+IGxldmVsKSAtIHgpXG4gICAgICBpbWFnZURhdGEuaGVpZ2h0ID0gaW1hZ2VEYXRhLmhlaWdodCB8fCAoKHRleHR1cmUuaGVpZ2h0ID4+IGxldmVsKSAtIHkpXG5cbiAgICAgIGNoZWNrKFxuICAgICAgICB0ZXh0dXJlLnR5cGUgPT09IGltYWdlRGF0YS50eXBlICYmXG4gICAgICAgIHRleHR1cmUuZm9ybWF0ID09PSBpbWFnZURhdGEuZm9ybWF0ICYmXG4gICAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQgPT09IGltYWdlRGF0YS5pbnRlcm5hbGZvcm1hdCxcbiAgICAgICAgJ2luY29tcGF0aWJsZSBmb3JtYXQgZm9yIHRleHR1cmUuc3ViaW1hZ2UnKVxuICAgICAgY2hlY2soXG4gICAgICAgIHggPj0gMCAmJiB5ID49IDAgJiZcbiAgICAgICAgeCArIGltYWdlRGF0YS53aWR0aCA8PSB0ZXh0dXJlLndpZHRoICYmXG4gICAgICAgIHkgKyBpbWFnZURhdGEuaGVpZ2h0IDw9IHRleHR1cmUuaGVpZ2h0LFxuICAgICAgICAndGV4dHVyZS5zdWJpbWFnZSB3cml0ZSBvdXQgb2YgYm91bmRzJylcbiAgICAgIGNoZWNrKFxuICAgICAgICB0ZXh0dXJlLm1pcG1hc2sgJiAoMSA8PCBsZXZlbCksXG4gICAgICAgICdtaXNzaW5nIG1pcG1hcCBkYXRhJylcbiAgICAgIGNoZWNrKFxuICAgICAgICBpbWFnZURhdGEuZGF0YSB8fCBpbWFnZURhdGEuZWxlbWVudCB8fCBpbWFnZURhdGEubmVlZHNDb3B5LFxuICAgICAgICAnbWlzc2luZyBpbWFnZSBkYXRhJylcblxuICAgICAgdGVtcEJpbmQodGV4dHVyZSlcbiAgICAgIHNldFN1YkltYWdlKGltYWdlRGF0YSwgR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YICsgZmFjZSwgeCwgeSwgbGV2ZWwpXG4gICAgICB0ZW1wUmVzdG9yZSgpXG5cbiAgICAgIGZyZWVJbWFnZShpbWFnZURhdGEpXG5cbiAgICAgIHJldHVybiByZWdsVGV4dHVyZUN1YmVcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZXNpemUgKHJhZGl1c18pIHtcbiAgICAgIHZhciByYWRpdXMgPSByYWRpdXNfIHwgMFxuICAgICAgaWYgKHJhZGl1cyA9PT0gdGV4dHVyZS53aWR0aCkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgcmVnbFRleHR1cmVDdWJlLndpZHRoID0gdGV4dHVyZS53aWR0aCA9IHJhZGl1c1xuICAgICAgcmVnbFRleHR1cmVDdWJlLmhlaWdodCA9IHRleHR1cmUuaGVpZ2h0ID0gcmFkaXVzXG5cbiAgICAgIHRlbXBCaW5kKHRleHR1cmUpXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICBmb3IgKHZhciBqID0gMDsgdGV4dHVyZS5taXBtYXNrID4+IGo7ICsraikge1xuICAgICAgICAgIGdsLnRleEltYWdlMkQoXG4gICAgICAgICAgICBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1ggKyBpLFxuICAgICAgICAgICAgaixcbiAgICAgICAgICAgIHRleHR1cmUuZm9ybWF0LFxuICAgICAgICAgICAgcmFkaXVzID4+IGosXG4gICAgICAgICAgICByYWRpdXMgPj4gaixcbiAgICAgICAgICAgIDAsXG4gICAgICAgICAgICB0ZXh0dXJlLmZvcm1hdCxcbiAgICAgICAgICAgIHRleHR1cmUudHlwZSxcbiAgICAgICAgICAgIG51bGwpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHRlbXBSZXN0b3JlKClcblxuICAgICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICAgIHRleHR1cmUuc3RhdHMuc2l6ZSA9IGdldFRleHR1cmVTaXplKFxuICAgICAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQsXG4gICAgICAgICAgdGV4dHVyZS50eXBlLFxuICAgICAgICAgIHJlZ2xUZXh0dXJlQ3ViZS53aWR0aCxcbiAgICAgICAgICByZWdsVGV4dHVyZUN1YmUuaGVpZ2h0LFxuICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgIHRydWUpXG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZWdsVGV4dHVyZUN1YmVcbiAgICB9XG5cbiAgICByZWdsVGV4dHVyZUN1YmUoYTAsIGExLCBhMiwgYTMsIGE0LCBhNSlcblxuICAgIHJlZ2xUZXh0dXJlQ3ViZS5zdWJpbWFnZSA9IHN1YmltYWdlXG4gICAgcmVnbFRleHR1cmVDdWJlLnJlc2l6ZSA9IHJlc2l6ZVxuICAgIHJlZ2xUZXh0dXJlQ3ViZS5fcmVnbFR5cGUgPSAndGV4dHVyZUN1YmUnXG4gICAgcmVnbFRleHR1cmVDdWJlLl90ZXh0dXJlID0gdGV4dHVyZVxuICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgcmVnbFRleHR1cmVDdWJlLnN0YXRzID0gdGV4dHVyZS5zdGF0c1xuICAgIH1cbiAgICByZWdsVGV4dHVyZUN1YmUuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHRleHR1cmUuZGVjUmVmKClcbiAgICB9XG5cbiAgICByZXR1cm4gcmVnbFRleHR1cmVDdWJlXG4gIH1cblxuICAvLyBDYWxsZWQgd2hlbiByZWdsIGlzIGRlc3Ryb3llZFxuICBmdW5jdGlvbiBkZXN0cm95VGV4dHVyZXMgKCkge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbnVtVGV4VW5pdHM7ICsraSkge1xuICAgICAgZ2wuYWN0aXZlVGV4dHVyZShHTF9URVhUVVJFMCArIGkpXG4gICAgICBnbC5iaW5kVGV4dHVyZShHTF9URVhUVVJFXzJELCBudWxsKVxuICAgICAgdGV4dHVyZVVuaXRzW2ldID0gbnVsbFxuICAgIH1cbiAgICB2YWx1ZXModGV4dHVyZVNldCkuZm9yRWFjaChkZXN0cm95KVxuXG4gICAgc3RhdHMuY3ViZUNvdW50ID0gMFxuICAgIHN0YXRzLnRleHR1cmVDb3VudCA9IDBcbiAgfVxuXG4gIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgIHN0YXRzLmdldFRvdGFsVGV4dHVyZVNpemUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgdG90YWwgPSAwXG4gICAgICBPYmplY3Qua2V5cyh0ZXh0dXJlU2V0KS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgdG90YWwgKz0gdGV4dHVyZVNldFtrZXldLnN0YXRzLnNpemVcbiAgICAgIH0pXG4gICAgICByZXR1cm4gdG90YWxcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiByZXN0b3JlVGV4dHVyZXMgKCkge1xuICAgIHZhbHVlcyh0ZXh0dXJlU2V0KS5mb3JFYWNoKGZ1bmN0aW9uICh0ZXh0dXJlKSB7XG4gICAgICB0ZXh0dXJlLnRleHR1cmUgPSBnbC5jcmVhdGVUZXh0dXJlKClcbiAgICAgIGdsLmJpbmRUZXh0dXJlKHRleHR1cmUudGFyZ2V0LCB0ZXh0dXJlLnRleHR1cmUpXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IDMyOyArK2kpIHtcbiAgICAgICAgaWYgKCh0ZXh0dXJlLm1pcG1hc2sgJiAoMSA8PCBpKSkgPT09IDApIHtcbiAgICAgICAgICBjb250aW51ZVxuICAgICAgICB9XG4gICAgICAgIGlmICh0ZXh0dXJlLnRhcmdldCA9PT0gR0xfVEVYVFVSRV8yRCkge1xuICAgICAgICAgIGdsLnRleEltYWdlMkQoR0xfVEVYVFVSRV8yRCxcbiAgICAgICAgICAgIGksXG4gICAgICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0LFxuICAgICAgICAgICAgdGV4dHVyZS53aWR0aCA+PiBpLFxuICAgICAgICAgICAgdGV4dHVyZS5oZWlnaHQgPj4gaSxcbiAgICAgICAgICAgIDAsXG4gICAgICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0LFxuICAgICAgICAgICAgdGV4dHVyZS50eXBlLFxuICAgICAgICAgICAgbnVsbClcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IDY7ICsraikge1xuICAgICAgICAgICAgZ2wudGV4SW1hZ2UyRChHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1ggKyBqLFxuICAgICAgICAgICAgICBpLFxuICAgICAgICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0LFxuICAgICAgICAgICAgICB0ZXh0dXJlLndpZHRoID4+IGksXG4gICAgICAgICAgICAgIHRleHR1cmUuaGVpZ2h0ID4+IGksXG4gICAgICAgICAgICAgIDAsXG4gICAgICAgICAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQsXG4gICAgICAgICAgICAgIHRleHR1cmUudHlwZSxcbiAgICAgICAgICAgICAgbnVsbClcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHNldFRleEluZm8odGV4dHVyZS50ZXhJbmZvLCB0ZXh0dXJlLnRhcmdldClcbiAgICB9KVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjcmVhdGUyRDogY3JlYXRlVGV4dHVyZTJELFxuICAgIGNyZWF0ZUN1YmU6IGNyZWF0ZVRleHR1cmVDdWJlLFxuICAgIGNsZWFyOiBkZXN0cm95VGV4dHVyZXMsXG4gICAgZ2V0VGV4dHVyZTogZnVuY3Rpb24gKHdyYXBwZXIpIHtcbiAgICAgIHJldHVybiBudWxsXG4gICAgfSxcbiAgICByZXN0b3JlOiByZXN0b3JlVGV4dHVyZXNcbiAgfVxufVxuIiwidmFyIEdMX1FVRVJZX1JFU1VMVF9FWFQgPSAweDg4NjZcbnZhciBHTF9RVUVSWV9SRVNVTFRfQVZBSUxBQkxFX0VYVCA9IDB4ODg2N1xudmFyIEdMX1RJTUVfRUxBUFNFRF9FWFQgPSAweDg4QkZcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoZ2wsIGV4dGVuc2lvbnMpIHtcbiAgdmFyIGV4dFRpbWVyID0gZXh0ZW5zaW9ucy5leHRfZGlzam9pbnRfdGltZXJfcXVlcnlcblxuICBpZiAoIWV4dFRpbWVyKSB7XG4gICAgcmV0dXJuIG51bGxcbiAgfVxuXG4gIC8vIFFVRVJZIFBPT0wgQkVHSU5cbiAgdmFyIHF1ZXJ5UG9vbCA9IFtdXG4gIGZ1bmN0aW9uIGFsbG9jUXVlcnkgKCkge1xuICAgIHJldHVybiBxdWVyeVBvb2wucG9wKCkgfHwgZXh0VGltZXIuY3JlYXRlUXVlcnlFWFQoKVxuICB9XG4gIGZ1bmN0aW9uIGZyZWVRdWVyeSAocXVlcnkpIHtcbiAgICBxdWVyeVBvb2wucHVzaChxdWVyeSlcbiAgfVxuICAvLyBRVUVSWSBQT09MIEVORFxuXG4gIHZhciBwZW5kaW5nUXVlcmllcyA9IFtdXG4gIGZ1bmN0aW9uIGJlZ2luUXVlcnkgKHN0YXRzKSB7XG4gICAgdmFyIHF1ZXJ5ID0gYWxsb2NRdWVyeSgpXG4gICAgZXh0VGltZXIuYmVnaW5RdWVyeUVYVChHTF9USU1FX0VMQVBTRURfRVhULCBxdWVyeSlcbiAgICBwZW5kaW5nUXVlcmllcy5wdXNoKHF1ZXJ5KVxuICAgIHB1c2hTY29wZVN0YXRzKHBlbmRpbmdRdWVyaWVzLmxlbmd0aCAtIDEsIHBlbmRpbmdRdWVyaWVzLmxlbmd0aCwgc3RhdHMpXG4gIH1cblxuICBmdW5jdGlvbiBlbmRRdWVyeSAoKSB7XG4gICAgZXh0VGltZXIuZW5kUXVlcnlFWFQoR0xfVElNRV9FTEFQU0VEX0VYVClcbiAgfVxuXG4gIC8vXG4gIC8vIFBlbmRpbmcgc3RhdHMgcG9vbC5cbiAgLy9cbiAgZnVuY3Rpb24gUGVuZGluZ1N0YXRzICgpIHtcbiAgICB0aGlzLnN0YXJ0UXVlcnlJbmRleCA9IC0xXG4gICAgdGhpcy5lbmRRdWVyeUluZGV4ID0gLTFcbiAgICB0aGlzLnN1bSA9IDBcbiAgICB0aGlzLnN0YXRzID0gbnVsbFxuICB9XG4gIHZhciBwZW5kaW5nU3RhdHNQb29sID0gW11cbiAgZnVuY3Rpb24gYWxsb2NQZW5kaW5nU3RhdHMgKCkge1xuICAgIHJldHVybiBwZW5kaW5nU3RhdHNQb29sLnBvcCgpIHx8IG5ldyBQZW5kaW5nU3RhdHMoKVxuICB9XG4gIGZ1bmN0aW9uIGZyZWVQZW5kaW5nU3RhdHMgKHBlbmRpbmdTdGF0cykge1xuICAgIHBlbmRpbmdTdGF0c1Bvb2wucHVzaChwZW5kaW5nU3RhdHMpXG4gIH1cbiAgLy8gUGVuZGluZyBzdGF0cyBwb29sIGVuZFxuXG4gIHZhciBwZW5kaW5nU3RhdHMgPSBbXVxuICBmdW5jdGlvbiBwdXNoU2NvcGVTdGF0cyAoc3RhcnQsIGVuZCwgc3RhdHMpIHtcbiAgICB2YXIgcHMgPSBhbGxvY1BlbmRpbmdTdGF0cygpXG4gICAgcHMuc3RhcnRRdWVyeUluZGV4ID0gc3RhcnRcbiAgICBwcy5lbmRRdWVyeUluZGV4ID0gZW5kXG4gICAgcHMuc3VtID0gMFxuICAgIHBzLnN0YXRzID0gc3RhdHNcbiAgICBwZW5kaW5nU3RhdHMucHVzaChwcylcbiAgfVxuXG4gIC8vIHdlIHNob3VsZCBjYWxsIHRoaXMgYXQgdGhlIGJlZ2lubmluZyBvZiB0aGUgZnJhbWUsXG4gIC8vIGluIG9yZGVyIHRvIHVwZGF0ZSBncHVUaW1lXG4gIHZhciB0aW1lU3VtID0gW11cbiAgdmFyIHF1ZXJ5UHRyID0gW11cbiAgZnVuY3Rpb24gdXBkYXRlICgpIHtcbiAgICB2YXIgcHRyLCBpXG5cbiAgICB2YXIgbiA9IHBlbmRpbmdRdWVyaWVzLmxlbmd0aFxuICAgIGlmIChuID09PSAwKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICAvLyBSZXNlcnZlIHNwYWNlXG4gICAgcXVlcnlQdHIubGVuZ3RoID0gTWF0aC5tYXgocXVlcnlQdHIubGVuZ3RoLCBuICsgMSlcbiAgICB0aW1lU3VtLmxlbmd0aCA9IE1hdGgubWF4KHRpbWVTdW0ubGVuZ3RoLCBuICsgMSlcbiAgICB0aW1lU3VtWzBdID0gMFxuICAgIHF1ZXJ5UHRyWzBdID0gMFxuXG4gICAgLy8gVXBkYXRlIGFsbCBwZW5kaW5nIHRpbWVyIHF1ZXJpZXNcbiAgICB2YXIgcXVlcnlUaW1lID0gMFxuICAgIHB0ciA9IDBcbiAgICBmb3IgKGkgPSAwOyBpIDwgcGVuZGluZ1F1ZXJpZXMubGVuZ3RoOyArK2kpIHtcbiAgICAgIHZhciBxdWVyeSA9IHBlbmRpbmdRdWVyaWVzW2ldXG4gICAgICBpZiAoZXh0VGltZXIuZ2V0UXVlcnlPYmplY3RFWFQocXVlcnksIEdMX1FVRVJZX1JFU1VMVF9BVkFJTEFCTEVfRVhUKSkge1xuICAgICAgICBxdWVyeVRpbWUgKz0gZXh0VGltZXIuZ2V0UXVlcnlPYmplY3RFWFQocXVlcnksIEdMX1FVRVJZX1JFU1VMVF9FWFQpXG4gICAgICAgIGZyZWVRdWVyeShxdWVyeSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBlbmRpbmdRdWVyaWVzW3B0cisrXSA9IHF1ZXJ5XG4gICAgICB9XG4gICAgICB0aW1lU3VtW2kgKyAxXSA9IHF1ZXJ5VGltZVxuICAgICAgcXVlcnlQdHJbaSArIDFdID0gcHRyXG4gICAgfVxuICAgIHBlbmRpbmdRdWVyaWVzLmxlbmd0aCA9IHB0clxuXG4gICAgLy8gVXBkYXRlIGFsbCBwZW5kaW5nIHN0YXQgcXVlcmllc1xuICAgIHB0ciA9IDBcbiAgICBmb3IgKGkgPSAwOyBpIDwgcGVuZGluZ1N0YXRzLmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgc3RhdHMgPSBwZW5kaW5nU3RhdHNbaV1cbiAgICAgIHZhciBzdGFydCA9IHN0YXRzLnN0YXJ0UXVlcnlJbmRleFxuICAgICAgdmFyIGVuZCA9IHN0YXRzLmVuZFF1ZXJ5SW5kZXhcbiAgICAgIHN0YXRzLnN1bSArPSB0aW1lU3VtW2VuZF0gLSB0aW1lU3VtW3N0YXJ0XVxuICAgICAgdmFyIHN0YXJ0UHRyID0gcXVlcnlQdHJbc3RhcnRdXG4gICAgICB2YXIgZW5kUHRyID0gcXVlcnlQdHJbZW5kXVxuICAgICAgaWYgKGVuZFB0ciA9PT0gc3RhcnRQdHIpIHtcbiAgICAgICAgc3RhdHMuc3RhdHMuZ3B1VGltZSArPSBzdGF0cy5zdW0gLyAxZTZcbiAgICAgICAgZnJlZVBlbmRpbmdTdGF0cyhzdGF0cylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN0YXRzLnN0YXJ0UXVlcnlJbmRleCA9IHN0YXJ0UHRyXG4gICAgICAgIHN0YXRzLmVuZFF1ZXJ5SW5kZXggPSBlbmRQdHJcbiAgICAgICAgcGVuZGluZ1N0YXRzW3B0cisrXSA9IHN0YXRzXG4gICAgICB9XG4gICAgfVxuICAgIHBlbmRpbmdTdGF0cy5sZW5ndGggPSBwdHJcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgYmVnaW5RdWVyeTogYmVnaW5RdWVyeSxcbiAgICBlbmRRdWVyeTogZW5kUXVlcnksXG4gICAgcHVzaFNjb3BlU3RhdHM6IHB1c2hTY29wZVN0YXRzLFxuICAgIHVwZGF0ZTogdXBkYXRlLFxuICAgIGdldE51bVBlbmRpbmdRdWVyaWVzOiBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gcGVuZGluZ1F1ZXJpZXMubGVuZ3RoXG4gICAgfSxcbiAgICBjbGVhcjogZnVuY3Rpb24gKCkge1xuICAgICAgcXVlcnlQb29sLnB1c2guYXBwbHkocXVlcnlQb29sLCBwZW5kaW5nUXVlcmllcylcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcXVlcnlQb29sLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGV4dFRpbWVyLmRlbGV0ZVF1ZXJ5RVhUKHF1ZXJ5UG9vbFtpXSlcbiAgICAgIH1cbiAgICAgIHBlbmRpbmdRdWVyaWVzLmxlbmd0aCA9IDBcbiAgICAgIHF1ZXJ5UG9vbC5sZW5ndGggPSAwXG4gICAgfSxcbiAgICByZXN0b3JlOiBmdW5jdGlvbiAoKSB7XG4gICAgICBwZW5kaW5nUXVlcmllcy5sZW5ndGggPSAwXG4gICAgICBxdWVyeVBvb2wubGVuZ3RoID0gMFxuICAgIH1cbiAgfVxufVxuIiwiLy8gRXJyb3IgY2hlY2tpbmcgYW5kIHBhcmFtZXRlciB2YWxpZGF0aW9uLlxuLy9cbi8vIFN0YXRlbWVudHMgZm9yIHRoZSBmb3JtIGBjaGVjay5zb21lUHJvY2VkdXJlKC4uLilgIGdldCByZW1vdmVkIGJ5XG4vLyBhIGJyb3dzZXJpZnkgdHJhbnNmb3JtIGZvciBvcHRpbWl6ZWQvbWluaWZpZWQgYnVuZGxlcy5cbi8vXG4vKiBnbG9iYWxzIGJ0b2EgKi9cbnZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL2lzLXR5cGVkLWFycmF5JylcbnZhciBleHRlbmQgPSByZXF1aXJlKCcuL2V4dGVuZCcpXG5cbi8vIG9ubHkgdXNlZCBmb3IgZXh0cmFjdGluZyBzaGFkZXIgbmFtZXMuICBpZiBidG9hIG5vdCBwcmVzZW50LCB0aGVuIGVycm9yc1xuLy8gd2lsbCBiZSBzbGlnaHRseSBjcmFwcGllclxuZnVuY3Rpb24gZGVjb2RlQjY0IChzdHIpIHtcbiAgaWYgKHR5cGVvZiBidG9hICE9PSAndW5kZWZpbmVkJykge1xuICAgIHJldHVybiBidG9hKHN0cilcbiAgfVxuICByZXR1cm4gJ2Jhc2U2NDonICsgc3RyXG59XG5cbmZ1bmN0aW9uIHJhaXNlIChtZXNzYWdlKSB7XG4gIHZhciBlcnJvciA9IG5ldyBFcnJvcignKHJlZ2wpICcgKyBtZXNzYWdlKVxuICBjb25zb2xlLmVycm9yKGVycm9yKVxuICB0aHJvdyBlcnJvclxufVxuXG5mdW5jdGlvbiBjaGVjayAocHJlZCwgbWVzc2FnZSkge1xuICBpZiAoIXByZWQpIHtcbiAgICByYWlzZShtZXNzYWdlKVxuICB9XG59XG5cbmZ1bmN0aW9uIGVuY29sb24gKG1lc3NhZ2UpIHtcbiAgaWYgKG1lc3NhZ2UpIHtcbiAgICByZXR1cm4gJzogJyArIG1lc3NhZ2VcbiAgfVxuICByZXR1cm4gJydcbn1cblxuZnVuY3Rpb24gY2hlY2tQYXJhbWV0ZXIgKHBhcmFtLCBwb3NzaWJpbGl0aWVzLCBtZXNzYWdlKSB7XG4gIGlmICghKHBhcmFtIGluIHBvc3NpYmlsaXRpZXMpKSB7XG4gICAgcmFpc2UoJ3Vua25vd24gcGFyYW1ldGVyICgnICsgcGFyYW0gKyAnKScgKyBlbmNvbG9uKG1lc3NhZ2UpICtcbiAgICAgICAgICAnLiBwb3NzaWJsZSB2YWx1ZXM6ICcgKyBPYmplY3Qua2V5cyhwb3NzaWJpbGl0aWVzKS5qb2luKCkpXG4gIH1cbn1cblxuZnVuY3Rpb24gY2hlY2tJc1R5cGVkQXJyYXkgKGRhdGEsIG1lc3NhZ2UpIHtcbiAgaWYgKCFpc1R5cGVkQXJyYXkoZGF0YSkpIHtcbiAgICByYWlzZShcbiAgICAgICdpbnZhbGlkIHBhcmFtZXRlciB0eXBlJyArIGVuY29sb24obWVzc2FnZSkgK1xuICAgICAgJy4gbXVzdCBiZSBhIHR5cGVkIGFycmF5JylcbiAgfVxufVxuXG5mdW5jdGlvbiBjaGVja1R5cGVPZiAodmFsdWUsIHR5cGUsIG1lc3NhZ2UpIHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gdHlwZSkge1xuICAgIHJhaXNlKFxuICAgICAgJ2ludmFsaWQgcGFyYW1ldGVyIHR5cGUnICsgZW5jb2xvbihtZXNzYWdlKSArXG4gICAgICAnLiBleHBlY3RlZCAnICsgdHlwZSArICcsIGdvdCAnICsgKHR5cGVvZiB2YWx1ZSkpXG4gIH1cbn1cblxuZnVuY3Rpb24gY2hlY2tOb25OZWdhdGl2ZUludCAodmFsdWUsIG1lc3NhZ2UpIHtcbiAgaWYgKCEoKHZhbHVlID49IDApICYmXG4gICAgICAgICgodmFsdWUgfCAwKSA9PT0gdmFsdWUpKSkge1xuICAgIHJhaXNlKCdpbnZhbGlkIHBhcmFtZXRlciB0eXBlLCAoJyArIHZhbHVlICsgJyknICsgZW5jb2xvbihtZXNzYWdlKSArXG4gICAgICAgICAgJy4gbXVzdCBiZSBhIG5vbm5lZ2F0aXZlIGludGVnZXInKVxuICB9XG59XG5cbmZ1bmN0aW9uIGNoZWNrT25lT2YgKHZhbHVlLCBsaXN0LCBtZXNzYWdlKSB7XG4gIGlmIChsaXN0LmluZGV4T2YodmFsdWUpIDwgMCkge1xuICAgIHJhaXNlKCdpbnZhbGlkIHZhbHVlJyArIGVuY29sb24obWVzc2FnZSkgKyAnLiBtdXN0IGJlIG9uZSBvZjogJyArIGxpc3QpXG4gIH1cbn1cblxudmFyIGNvbnN0cnVjdG9yS2V5cyA9IFtcbiAgJ2dsJyxcbiAgJ2NhbnZhcycsXG4gICdjb250YWluZXInLFxuICAnYXR0cmlidXRlcycsXG4gICdwaXhlbFJhdGlvJyxcbiAgJ2V4dGVuc2lvbnMnLFxuICAnb3B0aW9uYWxFeHRlbnNpb25zJyxcbiAgJ3Byb2ZpbGUnLFxuICAnb25Eb25lJ1xuXVxuXG5mdW5jdGlvbiBjaGVja0NvbnN0cnVjdG9yIChvYmopIHtcbiAgT2JqZWN0LmtleXMob2JqKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICBpZiAoY29uc3RydWN0b3JLZXlzLmluZGV4T2Yoa2V5KSA8IDApIHtcbiAgICAgIHJhaXNlKCdpbnZhbGlkIHJlZ2wgY29uc3RydWN0b3IgYXJndW1lbnQgXCInICsga2V5ICsgJ1wiLiBtdXN0IGJlIG9uZSBvZiAnICsgY29uc3RydWN0b3JLZXlzKVxuICAgIH1cbiAgfSlcbn1cblxuZnVuY3Rpb24gbGVmdFBhZCAoc3RyLCBuKSB7XG4gIHN0ciA9IHN0ciArICcnXG4gIHdoaWxlIChzdHIubGVuZ3RoIDwgbikge1xuICAgIHN0ciA9ICcgJyArIHN0clxuICB9XG4gIHJldHVybiBzdHJcbn1cblxuZnVuY3Rpb24gU2hhZGVyRmlsZSAoKSB7XG4gIHRoaXMubmFtZSA9ICd1bmtub3duJ1xuICB0aGlzLmxpbmVzID0gW11cbiAgdGhpcy5pbmRleCA9IHt9XG4gIHRoaXMuaGFzRXJyb3JzID0gZmFsc2Vcbn1cblxuZnVuY3Rpb24gU2hhZGVyTGluZSAobnVtYmVyLCBsaW5lKSB7XG4gIHRoaXMubnVtYmVyID0gbnVtYmVyXG4gIHRoaXMubGluZSA9IGxpbmVcbiAgdGhpcy5lcnJvcnMgPSBbXVxufVxuXG5mdW5jdGlvbiBTaGFkZXJFcnJvciAoZmlsZU51bWJlciwgbGluZU51bWJlciwgbWVzc2FnZSkge1xuICB0aGlzLmZpbGUgPSBmaWxlTnVtYmVyXG4gIHRoaXMubGluZSA9IGxpbmVOdW1iZXJcbiAgdGhpcy5tZXNzYWdlID0gbWVzc2FnZVxufVxuXG5mdW5jdGlvbiBndWVzc0NvbW1hbmQgKCkge1xuICB2YXIgZXJyb3IgPSBuZXcgRXJyb3IoKVxuICB2YXIgc3RhY2sgPSAoZXJyb3Iuc3RhY2sgfHwgZXJyb3IpLnRvU3RyaW5nKClcbiAgdmFyIHBhdCA9IC9jb21waWxlUHJvY2VkdXJlLipcXG5cXHMqYXQuKlxcKCguKilcXCkvLmV4ZWMoc3RhY2spXG4gIGlmIChwYXQpIHtcbiAgICByZXR1cm4gcGF0WzFdXG4gIH1cbiAgdmFyIHBhdDIgPSAvY29tcGlsZVByb2NlZHVyZS4qXFxuXFxzKmF0XFxzKyguKikoXFxufCQpLy5leGVjKHN0YWNrKVxuICBpZiAocGF0Mikge1xuICAgIHJldHVybiBwYXQyWzFdXG4gIH1cbiAgcmV0dXJuICd1bmtub3duJ1xufVxuXG5mdW5jdGlvbiBndWVzc0NhbGxTaXRlICgpIHtcbiAgdmFyIGVycm9yID0gbmV3IEVycm9yKClcbiAgdmFyIHN0YWNrID0gKGVycm9yLnN0YWNrIHx8IGVycm9yKS50b1N0cmluZygpXG4gIHZhciBwYXQgPSAvYXQgUkVHTENvbW1hbmQuKlxcblxccythdC4qXFwoKC4qKVxcKS8uZXhlYyhzdGFjaylcbiAgaWYgKHBhdCkge1xuICAgIHJldHVybiBwYXRbMV1cbiAgfVxuICB2YXIgcGF0MiA9IC9hdCBSRUdMQ29tbWFuZC4qXFxuXFxzK2F0XFxzKyguKilcXG4vLmV4ZWMoc3RhY2spXG4gIGlmIChwYXQyKSB7XG4gICAgcmV0dXJuIHBhdDJbMV1cbiAgfVxuICByZXR1cm4gJ3Vua25vd24nXG59XG5cbmZ1bmN0aW9uIHBhcnNlU291cmNlIChzb3VyY2UsIGNvbW1hbmQpIHtcbiAgdmFyIGxpbmVzID0gc291cmNlLnNwbGl0KCdcXG4nKVxuICB2YXIgbGluZU51bWJlciA9IDFcbiAgdmFyIGZpbGVOdW1iZXIgPSAwXG4gIHZhciBmaWxlcyA9IHtcbiAgICB1bmtub3duOiBuZXcgU2hhZGVyRmlsZSgpLFxuICAgIDA6IG5ldyBTaGFkZXJGaWxlKClcbiAgfVxuICBmaWxlcy51bmtub3duLm5hbWUgPSBmaWxlc1swXS5uYW1lID0gY29tbWFuZCB8fCBndWVzc0NvbW1hbmQoKVxuICBmaWxlcy51bmtub3duLmxpbmVzLnB1c2gobmV3IFNoYWRlckxpbmUoMCwgJycpKVxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxpbmVzLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIGxpbmUgPSBsaW5lc1tpXVxuICAgIHZhciBwYXJ0cyA9IC9eXFxzKlxcI1xccyooXFx3KylcXHMrKC4rKVxccyokLy5leGVjKGxpbmUpXG4gICAgaWYgKHBhcnRzKSB7XG4gICAgICBzd2l0Y2ggKHBhcnRzWzFdKSB7XG4gICAgICAgIGNhc2UgJ2xpbmUnOlxuICAgICAgICAgIHZhciBsaW5lTnVtYmVySW5mbyA9IC8oXFxkKykoXFxzK1xcZCspPy8uZXhlYyhwYXJ0c1syXSlcbiAgICAgICAgICBpZiAobGluZU51bWJlckluZm8pIHtcbiAgICAgICAgICAgIGxpbmVOdW1iZXIgPSBsaW5lTnVtYmVySW5mb1sxXSB8IDBcbiAgICAgICAgICAgIGlmIChsaW5lTnVtYmVySW5mb1syXSkge1xuICAgICAgICAgICAgICBmaWxlTnVtYmVyID0gbGluZU51bWJlckluZm9bMl0gfCAwXG4gICAgICAgICAgICAgIGlmICghKGZpbGVOdW1iZXIgaW4gZmlsZXMpKSB7XG4gICAgICAgICAgICAgICAgZmlsZXNbZmlsZU51bWJlcl0gPSBuZXcgU2hhZGVyRmlsZSgpXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSAnZGVmaW5lJzpcbiAgICAgICAgICB2YXIgbmFtZUluZm8gPSAvU0hBREVSX05BTUUoX0I2NCk/XFxzKyguKikkLy5leGVjKHBhcnRzWzJdKVxuICAgICAgICAgIGlmIChuYW1lSW5mbykge1xuICAgICAgICAgICAgZmlsZXNbZmlsZU51bWJlcl0ubmFtZSA9IChuYW1lSW5mb1sxXVxuICAgICAgICAgICAgICAgID8gZGVjb2RlQjY0KG5hbWVJbmZvWzJdKVxuICAgICAgICAgICAgICAgIDogbmFtZUluZm9bMl0pXG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrXG4gICAgICB9XG4gICAgfVxuICAgIGZpbGVzW2ZpbGVOdW1iZXJdLmxpbmVzLnB1c2gobmV3IFNoYWRlckxpbmUobGluZU51bWJlcisrLCBsaW5lKSlcbiAgfVxuICBPYmplY3Qua2V5cyhmaWxlcykuZm9yRWFjaChmdW5jdGlvbiAoZmlsZU51bWJlcikge1xuICAgIHZhciBmaWxlID0gZmlsZXNbZmlsZU51bWJlcl1cbiAgICBmaWxlLmxpbmVzLmZvckVhY2goZnVuY3Rpb24gKGxpbmUpIHtcbiAgICAgIGZpbGUuaW5kZXhbbGluZS5udW1iZXJdID0gbGluZVxuICAgIH0pXG4gIH0pXG4gIHJldHVybiBmaWxlc1xufVxuXG5mdW5jdGlvbiBwYXJzZUVycm9yTG9nIChlcnJMb2cpIHtcbiAgdmFyIHJlc3VsdCA9IFtdXG4gIGVyckxvZy5zcGxpdCgnXFxuJykuZm9yRWFjaChmdW5jdGlvbiAoZXJyTXNnKSB7XG4gICAgaWYgKGVyck1zZy5sZW5ndGggPCA1KSB7XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgdmFyIHBhcnRzID0gL15FUlJPUlxcOlxccysoXFxkKylcXDooXFxkKylcXDpcXHMqKC4qKSQvLmV4ZWMoZXJyTXNnKVxuICAgIGlmIChwYXJ0cykge1xuICAgICAgcmVzdWx0LnB1c2gobmV3IFNoYWRlckVycm9yKFxuICAgICAgICBwYXJ0c1sxXSB8IDAsXG4gICAgICAgIHBhcnRzWzJdIHwgMCxcbiAgICAgICAgcGFydHNbM10udHJpbSgpKSlcbiAgICB9IGVsc2UgaWYgKGVyck1zZy5sZW5ndGggPiAwKSB7XG4gICAgICByZXN1bHQucHVzaChuZXcgU2hhZGVyRXJyb3IoJ3Vua25vd24nLCAwLCBlcnJNc2cpKVxuICAgIH1cbiAgfSlcbiAgcmV0dXJuIHJlc3VsdFxufVxuXG5mdW5jdGlvbiBhbm5vdGF0ZUZpbGVzIChmaWxlcywgZXJyb3JzKSB7XG4gIGVycm9ycy5mb3JFYWNoKGZ1bmN0aW9uIChlcnJvcikge1xuICAgIHZhciBmaWxlID0gZmlsZXNbZXJyb3IuZmlsZV1cbiAgICBpZiAoZmlsZSkge1xuICAgICAgdmFyIGxpbmUgPSBmaWxlLmluZGV4W2Vycm9yLmxpbmVdXG4gICAgICBpZiAobGluZSkge1xuICAgICAgICBsaW5lLmVycm9ycy5wdXNoKGVycm9yKVxuICAgICAgICBmaWxlLmhhc0Vycm9ycyA9IHRydWVcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgfVxuICAgIGZpbGVzLnVua25vd24uaGFzRXJyb3JzID0gdHJ1ZVxuICAgIGZpbGVzLnVua25vd24ubGluZXNbMF0uZXJyb3JzLnB1c2goZXJyb3IpXG4gIH0pXG59XG5cbmZ1bmN0aW9uIGNoZWNrU2hhZGVyRXJyb3IgKGdsLCBzaGFkZXIsIHNvdXJjZSwgdHlwZSwgY29tbWFuZCkge1xuICBpZiAoIWdsLmdldFNoYWRlclBhcmFtZXRlcihzaGFkZXIsIGdsLkNPTVBJTEVfU1RBVFVTKSkge1xuICAgIHZhciBlcnJMb2cgPSBnbC5nZXRTaGFkZXJJbmZvTG9nKHNoYWRlcilcbiAgICB2YXIgdHlwZU5hbWUgPSB0eXBlID09PSBnbC5GUkFHTUVOVF9TSEFERVIgPyAnZnJhZ21lbnQnIDogJ3ZlcnRleCdcbiAgICBjaGVja0NvbW1hbmRUeXBlKHNvdXJjZSwgJ3N0cmluZycsIHR5cGVOYW1lICsgJyBzaGFkZXIgc291cmNlIG11c3QgYmUgYSBzdHJpbmcnLCBjb21tYW5kKVxuICAgIHZhciBmaWxlcyA9IHBhcnNlU291cmNlKHNvdXJjZSwgY29tbWFuZClcbiAgICB2YXIgZXJyb3JzID0gcGFyc2VFcnJvckxvZyhlcnJMb2cpXG4gICAgYW5ub3RhdGVGaWxlcyhmaWxlcywgZXJyb3JzKVxuXG4gICAgT2JqZWN0LmtleXMoZmlsZXMpLmZvckVhY2goZnVuY3Rpb24gKGZpbGVOdW1iZXIpIHtcbiAgICAgIHZhciBmaWxlID0gZmlsZXNbZmlsZU51bWJlcl1cbiAgICAgIGlmICghZmlsZS5oYXNFcnJvcnMpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG5cbiAgICAgIHZhciBzdHJpbmdzID0gWycnXVxuICAgICAgdmFyIHN0eWxlcyA9IFsnJ11cblxuICAgICAgZnVuY3Rpb24gcHVzaCAoc3RyLCBzdHlsZSkge1xuICAgICAgICBzdHJpbmdzLnB1c2goc3RyKVxuICAgICAgICBzdHlsZXMucHVzaChzdHlsZSB8fCAnJylcbiAgICAgIH1cblxuICAgICAgcHVzaCgnZmlsZSBudW1iZXIgJyArIGZpbGVOdW1iZXIgKyAnOiAnICsgZmlsZS5uYW1lICsgJ1xcbicsICdjb2xvcjpyZWQ7dGV4dC1kZWNvcmF0aW9uOnVuZGVybGluZTtmb250LXdlaWdodDpib2xkJylcblxuICAgICAgZmlsZS5saW5lcy5mb3JFYWNoKGZ1bmN0aW9uIChsaW5lKSB7XG4gICAgICAgIGlmIChsaW5lLmVycm9ycy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgcHVzaChsZWZ0UGFkKGxpbmUubnVtYmVyLCA0KSArICd8ICAnLCAnYmFja2dyb3VuZC1jb2xvcjp5ZWxsb3c7IGZvbnQtd2VpZ2h0OmJvbGQnKVxuICAgICAgICAgIHB1c2gobGluZS5saW5lICsgJ1xcbicsICdjb2xvcjpyZWQ7IGJhY2tncm91bmQtY29sb3I6eWVsbG93OyBmb250LXdlaWdodDpib2xkJylcblxuICAgICAgICAgIC8vIHRyeSB0byBndWVzcyB0b2tlblxuICAgICAgICAgIHZhciBvZmZzZXQgPSAwXG4gICAgICAgICAgbGluZS5lcnJvcnMuZm9yRWFjaChmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIHZhciBtZXNzYWdlID0gZXJyb3IubWVzc2FnZVxuICAgICAgICAgICAgdmFyIHRva2VuID0gL15cXHMqXFwnKC4qKVxcJ1xccypcXDpcXHMqKC4qKSQvLmV4ZWMobWVzc2FnZSlcbiAgICAgICAgICAgIGlmICh0b2tlbikge1xuICAgICAgICAgICAgICB2YXIgdG9rZW5QYXQgPSB0b2tlblsxXVxuICAgICAgICAgICAgICBtZXNzYWdlID0gdG9rZW5bMl1cbiAgICAgICAgICAgICAgc3dpdGNoICh0b2tlblBhdCkge1xuICAgICAgICAgICAgICAgIGNhc2UgJ2Fzc2lnbic6XG4gICAgICAgICAgICAgICAgICB0b2tlblBhdCA9ICc9J1xuICAgICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBvZmZzZXQgPSBNYXRoLm1heChsaW5lLmxpbmUuaW5kZXhPZih0b2tlblBhdCwgb2Zmc2V0KSwgMClcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIG9mZnNldCA9IDBcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcHVzaChsZWZ0UGFkKCd8ICcsIDYpKVxuICAgICAgICAgICAgcHVzaChsZWZ0UGFkKCdeXl4nLCBvZmZzZXQgKyAzKSArICdcXG4nLCAnZm9udC13ZWlnaHQ6Ym9sZCcpXG4gICAgICAgICAgICBwdXNoKGxlZnRQYWQoJ3wgJywgNikpXG4gICAgICAgICAgICBwdXNoKG1lc3NhZ2UgKyAnXFxuJywgJ2ZvbnQtd2VpZ2h0OmJvbGQnKVxuICAgICAgICAgIH0pXG4gICAgICAgICAgcHVzaChsZWZ0UGFkKCd8ICcsIDYpICsgJ1xcbicpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcHVzaChsZWZ0UGFkKGxpbmUubnVtYmVyLCA0KSArICd8ICAnKVxuICAgICAgICAgIHB1c2gobGluZS5saW5lICsgJ1xcbicsICdjb2xvcjpyZWQnKVxuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgaWYgKHR5cGVvZiBkb2N1bWVudCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgc3R5bGVzWzBdID0gc3RyaW5ncy5qb2luKCclYycpXG4gICAgICAgIGNvbnNvbGUubG9nLmFwcGx5KGNvbnNvbGUsIHN0eWxlcylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUubG9nKHN0cmluZ3Muam9pbignJykpXG4gICAgICB9XG4gICAgfSlcblxuICAgIGNoZWNrLnJhaXNlKCdFcnJvciBjb21waWxpbmcgJyArIHR5cGVOYW1lICsgJyBzaGFkZXIsICcgKyBmaWxlc1swXS5uYW1lKVxuICB9XG59XG5cbmZ1bmN0aW9uIGNoZWNrTGlua0Vycm9yIChnbCwgcHJvZ3JhbSwgZnJhZ1NoYWRlciwgdmVydFNoYWRlciwgY29tbWFuZCkge1xuICBpZiAoIWdsLmdldFByb2dyYW1QYXJhbWV0ZXIocHJvZ3JhbSwgZ2wuTElOS19TVEFUVVMpKSB7XG4gICAgdmFyIGVyckxvZyA9IGdsLmdldFByb2dyYW1JbmZvTG9nKHByb2dyYW0pXG4gICAgdmFyIGZyYWdQYXJzZSA9IHBhcnNlU291cmNlKGZyYWdTaGFkZXIsIGNvbW1hbmQpXG4gICAgdmFyIHZlcnRQYXJzZSA9IHBhcnNlU291cmNlKHZlcnRTaGFkZXIsIGNvbW1hbmQpXG5cbiAgICB2YXIgaGVhZGVyID0gJ0Vycm9yIGxpbmtpbmcgcHJvZ3JhbSB3aXRoIHZlcnRleCBzaGFkZXIsIFwiJyArXG4gICAgICB2ZXJ0UGFyc2VbMF0ubmFtZSArICdcIiwgYW5kIGZyYWdtZW50IHNoYWRlciBcIicgKyBmcmFnUGFyc2VbMF0ubmFtZSArICdcIidcblxuICAgIGlmICh0eXBlb2YgZG9jdW1lbnQgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBjb25zb2xlLmxvZygnJWMnICsgaGVhZGVyICsgJ1xcbiVjJyArIGVyckxvZyxcbiAgICAgICAgJ2NvbG9yOnJlZDt0ZXh0LWRlY29yYXRpb246dW5kZXJsaW5lO2ZvbnQtd2VpZ2h0OmJvbGQnLFxuICAgICAgICAnY29sb3I6cmVkJylcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coaGVhZGVyICsgJ1xcbicgKyBlcnJMb2cpXG4gICAgfVxuICAgIGNoZWNrLnJhaXNlKGhlYWRlcilcbiAgfVxufVxuXG5mdW5jdGlvbiBzYXZlQ29tbWFuZFJlZiAob2JqZWN0KSB7XG4gIG9iamVjdC5fY29tbWFuZFJlZiA9IGd1ZXNzQ29tbWFuZCgpXG59XG5cbmZ1bmN0aW9uIHNhdmVEcmF3Q29tbWFuZEluZm8gKG9wdHMsIHVuaWZvcm1zLCBhdHRyaWJ1dGVzLCBzdHJpbmdTdG9yZSkge1xuICBzYXZlQ29tbWFuZFJlZihvcHRzKVxuXG4gIGZ1bmN0aW9uIGlkIChzdHIpIHtcbiAgICBpZiAoc3RyKSB7XG4gICAgICByZXR1cm4gc3RyaW5nU3RvcmUuaWQoc3RyKVxuICAgIH1cbiAgICByZXR1cm4gMFxuICB9XG4gIG9wdHMuX2ZyYWdJZCA9IGlkKG9wdHMuc3RhdGljLmZyYWcpXG4gIG9wdHMuX3ZlcnRJZCA9IGlkKG9wdHMuc3RhdGljLnZlcnQpXG5cbiAgZnVuY3Rpb24gYWRkUHJvcHMgKGRpY3QsIHNldCkge1xuICAgIE9iamVjdC5rZXlzKHNldCkuZm9yRWFjaChmdW5jdGlvbiAodSkge1xuICAgICAgZGljdFtzdHJpbmdTdG9yZS5pZCh1KV0gPSB0cnVlXG4gICAgfSlcbiAgfVxuXG4gIHZhciB1bmlmb3JtU2V0ID0gb3B0cy5fdW5pZm9ybVNldCA9IHt9XG4gIGFkZFByb3BzKHVuaWZvcm1TZXQsIHVuaWZvcm1zLnN0YXRpYylcbiAgYWRkUHJvcHModW5pZm9ybVNldCwgdW5pZm9ybXMuZHluYW1pYylcblxuICB2YXIgYXR0cmlidXRlU2V0ID0gb3B0cy5fYXR0cmlidXRlU2V0ID0ge31cbiAgYWRkUHJvcHMoYXR0cmlidXRlU2V0LCBhdHRyaWJ1dGVzLnN0YXRpYylcbiAgYWRkUHJvcHMoYXR0cmlidXRlU2V0LCBhdHRyaWJ1dGVzLmR5bmFtaWMpXG5cbiAgb3B0cy5faGFzQ291bnQgPSAoXG4gICAgJ2NvdW50JyBpbiBvcHRzLnN0YXRpYyB8fFxuICAgICdjb3VudCcgaW4gb3B0cy5keW5hbWljIHx8XG4gICAgJ2VsZW1lbnRzJyBpbiBvcHRzLnN0YXRpYyB8fFxuICAgICdlbGVtZW50cycgaW4gb3B0cy5keW5hbWljKVxufVxuXG5mdW5jdGlvbiBjb21tYW5kUmFpc2UgKG1lc3NhZ2UsIGNvbW1hbmQpIHtcbiAgdmFyIGNhbGxTaXRlID0gZ3Vlc3NDYWxsU2l0ZSgpXG4gIHJhaXNlKG1lc3NhZ2UgK1xuICAgICcgaW4gY29tbWFuZCAnICsgKGNvbW1hbmQgfHwgZ3Vlc3NDb21tYW5kKCkpICtcbiAgICAoY2FsbFNpdGUgPT09ICd1bmtub3duJyA/ICcnIDogJyBjYWxsZWQgZnJvbSAnICsgY2FsbFNpdGUpKVxufVxuXG5mdW5jdGlvbiBjaGVja0NvbW1hbmQgKHByZWQsIG1lc3NhZ2UsIGNvbW1hbmQpIHtcbiAgaWYgKCFwcmVkKSB7XG4gICAgY29tbWFuZFJhaXNlKG1lc3NhZ2UsIGNvbW1hbmQgfHwgZ3Vlc3NDb21tYW5kKCkpXG4gIH1cbn1cblxuZnVuY3Rpb24gY2hlY2tQYXJhbWV0ZXJDb21tYW5kIChwYXJhbSwgcG9zc2liaWxpdGllcywgbWVzc2FnZSwgY29tbWFuZCkge1xuICBpZiAoIShwYXJhbSBpbiBwb3NzaWJpbGl0aWVzKSkge1xuICAgIGNvbW1hbmRSYWlzZShcbiAgICAgICd1bmtub3duIHBhcmFtZXRlciAoJyArIHBhcmFtICsgJyknICsgZW5jb2xvbihtZXNzYWdlKSArXG4gICAgICAnLiBwb3NzaWJsZSB2YWx1ZXM6ICcgKyBPYmplY3Qua2V5cyhwb3NzaWJpbGl0aWVzKS5qb2luKCksXG4gICAgICBjb21tYW5kIHx8IGd1ZXNzQ29tbWFuZCgpKVxuICB9XG59XG5cbmZ1bmN0aW9uIGNoZWNrQ29tbWFuZFR5cGUgKHZhbHVlLCB0eXBlLCBtZXNzYWdlLCBjb21tYW5kKSB7XG4gIGlmICh0eXBlb2YgdmFsdWUgIT09IHR5cGUpIHtcbiAgICBjb21tYW5kUmFpc2UoXG4gICAgICAnaW52YWxpZCBwYXJhbWV0ZXIgdHlwZScgKyBlbmNvbG9uKG1lc3NhZ2UpICtcbiAgICAgICcuIGV4cGVjdGVkICcgKyB0eXBlICsgJywgZ290ICcgKyAodHlwZW9mIHZhbHVlKSxcbiAgICAgIGNvbW1hbmQgfHwgZ3Vlc3NDb21tYW5kKCkpXG4gIH1cbn1cblxuZnVuY3Rpb24gY2hlY2tPcHRpb25hbCAoYmxvY2spIHtcbiAgYmxvY2soKVxufVxuXG5mdW5jdGlvbiBjaGVja0ZyYW1lYnVmZmVyRm9ybWF0IChhdHRhY2htZW50LCB0ZXhGb3JtYXRzLCByYkZvcm1hdHMpIHtcbiAgaWYgKGF0dGFjaG1lbnQudGV4dHVyZSkge1xuICAgIGNoZWNrT25lT2YoXG4gICAgICBhdHRhY2htZW50LnRleHR1cmUuX3RleHR1cmUuaW50ZXJuYWxmb3JtYXQsXG4gICAgICB0ZXhGb3JtYXRzLFxuICAgICAgJ3Vuc3VwcG9ydGVkIHRleHR1cmUgZm9ybWF0IGZvciBhdHRhY2htZW50JylcbiAgfSBlbHNlIHtcbiAgICBjaGVja09uZU9mKFxuICAgICAgYXR0YWNobWVudC5yZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlci5mb3JtYXQsXG4gICAgICByYkZvcm1hdHMsXG4gICAgICAndW5zdXBwb3J0ZWQgcmVuZGVyYnVmZmVyIGZvcm1hdCBmb3IgYXR0YWNobWVudCcpXG4gIH1cbn1cblxudmFyIEdMX0NMQU1QX1RPX0VER0UgPSAweDgxMkZcblxudmFyIEdMX05FQVJFU1QgPSAweDI2MDBcbnZhciBHTF9ORUFSRVNUX01JUE1BUF9ORUFSRVNUID0gMHgyNzAwXG52YXIgR0xfTElORUFSX01JUE1BUF9ORUFSRVNUID0gMHgyNzAxXG52YXIgR0xfTkVBUkVTVF9NSVBNQVBfTElORUFSID0gMHgyNzAyXG52YXIgR0xfTElORUFSX01JUE1BUF9MSU5FQVIgPSAweDI3MDNcblxudmFyIEdMX0JZVEUgPSA1MTIwXG52YXIgR0xfVU5TSUdORURfQllURSA9IDUxMjFcbnZhciBHTF9TSE9SVCA9IDUxMjJcbnZhciBHTF9VTlNJR05FRF9TSE9SVCA9IDUxMjNcbnZhciBHTF9JTlQgPSA1MTI0XG52YXIgR0xfVU5TSUdORURfSU5UID0gNTEyNVxudmFyIEdMX0ZMT0FUID0gNTEyNlxuXG52YXIgR0xfVU5TSUdORURfU0hPUlRfNF80XzRfNCA9IDB4ODAzM1xudmFyIEdMX1VOU0lHTkVEX1NIT1JUXzVfNV81XzEgPSAweDgwMzRcbnZhciBHTF9VTlNJR05FRF9TSE9SVF81XzZfNSA9IDB4ODM2M1xudmFyIEdMX1VOU0lHTkVEX0lOVF8yNF84X1dFQkdMID0gMHg4NEZBXG5cbnZhciBHTF9IQUxGX0ZMT0FUX09FUyA9IDB4OEQ2MVxuXG52YXIgVFlQRV9TSVpFID0ge31cblxuVFlQRV9TSVpFW0dMX0JZVEVdID1cblRZUEVfU0laRVtHTF9VTlNJR05FRF9CWVRFXSA9IDFcblxuVFlQRV9TSVpFW0dMX1NIT1JUXSA9XG5UWVBFX1NJWkVbR0xfVU5TSUdORURfU0hPUlRdID1cblRZUEVfU0laRVtHTF9IQUxGX0ZMT0FUX09FU10gPVxuVFlQRV9TSVpFW0dMX1VOU0lHTkVEX1NIT1JUXzVfNl81XSA9XG5UWVBFX1NJWkVbR0xfVU5TSUdORURfU0hPUlRfNF80XzRfNF0gPVxuVFlQRV9TSVpFW0dMX1VOU0lHTkVEX1NIT1JUXzVfNV81XzFdID0gMlxuXG5UWVBFX1NJWkVbR0xfSU5UXSA9XG5UWVBFX1NJWkVbR0xfVU5TSUdORURfSU5UXSA9XG5UWVBFX1NJWkVbR0xfRkxPQVRdID1cblRZUEVfU0laRVtHTF9VTlNJR05FRF9JTlRfMjRfOF9XRUJHTF0gPSA0XG5cbmZ1bmN0aW9uIHBpeGVsU2l6ZSAodHlwZSwgY2hhbm5lbHMpIHtcbiAgaWYgKHR5cGUgPT09IEdMX1VOU0lHTkVEX1NIT1JUXzVfNV81XzEgfHxcbiAgICAgIHR5cGUgPT09IEdMX1VOU0lHTkVEX1NIT1JUXzRfNF80XzQgfHxcbiAgICAgIHR5cGUgPT09IEdMX1VOU0lHTkVEX1NIT1JUXzVfNl81KSB7XG4gICAgcmV0dXJuIDJcbiAgfSBlbHNlIGlmICh0eXBlID09PSBHTF9VTlNJR05FRF9JTlRfMjRfOF9XRUJHTCkge1xuICAgIHJldHVybiA0XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIFRZUEVfU0laRVt0eXBlXSAqIGNoYW5uZWxzXG4gIH1cbn1cblxuZnVuY3Rpb24gaXNQb3cyICh2KSB7XG4gIHJldHVybiAhKHYgJiAodiAtIDEpKSAmJiAoISF2KVxufVxuXG5mdW5jdGlvbiBjaGVja1RleHR1cmUyRCAoaW5mbywgbWlwRGF0YSwgbGltaXRzKSB7XG4gIHZhciBpXG4gIHZhciB3ID0gbWlwRGF0YS53aWR0aFxuICB2YXIgaCA9IG1pcERhdGEuaGVpZ2h0XG4gIHZhciBjID0gbWlwRGF0YS5jaGFubmVsc1xuXG4gIC8vIENoZWNrIHRleHR1cmUgc2hhcGVcbiAgY2hlY2sodyA+IDAgJiYgdyA8PSBsaW1pdHMubWF4VGV4dHVyZVNpemUgJiZcbiAgICAgICAgaCA+IDAgJiYgaCA8PSBsaW1pdHMubWF4VGV4dHVyZVNpemUsXG4gICAgICAgICdpbnZhbGlkIHRleHR1cmUgc2hhcGUnKVxuXG4gIC8vIGNoZWNrIHdyYXAgbW9kZVxuICBpZiAoaW5mby53cmFwUyAhPT0gR0xfQ0xBTVBfVE9fRURHRSB8fCBpbmZvLndyYXBUICE9PSBHTF9DTEFNUF9UT19FREdFKSB7XG4gICAgY2hlY2soaXNQb3cyKHcpICYmIGlzUG93MihoKSxcbiAgICAgICdpbmNvbXBhdGlibGUgd3JhcCBtb2RlIGZvciB0ZXh0dXJlLCBib3RoIHdpZHRoIGFuZCBoZWlnaHQgbXVzdCBiZSBwb3dlciBvZiAyJylcbiAgfVxuXG4gIGlmIChtaXBEYXRhLm1pcG1hc2sgPT09IDEpIHtcbiAgICBpZiAodyAhPT0gMSAmJiBoICE9PSAxKSB7XG4gICAgICBjaGVjayhcbiAgICAgICAgaW5mby5taW5GaWx0ZXIgIT09IEdMX05FQVJFU1RfTUlQTUFQX05FQVJFU1QgJiZcbiAgICAgICAgaW5mby5taW5GaWx0ZXIgIT09IEdMX05FQVJFU1RfTUlQTUFQX0xJTkVBUiAmJlxuICAgICAgICBpbmZvLm1pbkZpbHRlciAhPT0gR0xfTElORUFSX01JUE1BUF9ORUFSRVNUICYmXG4gICAgICAgIGluZm8ubWluRmlsdGVyICE9PSBHTF9MSU5FQVJfTUlQTUFQX0xJTkVBUixcbiAgICAgICAgJ21pbiBmaWx0ZXIgcmVxdWlyZXMgbWlwbWFwJylcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgLy8gdGV4dHVyZSBtdXN0IGJlIHBvd2VyIG9mIDJcbiAgICBjaGVjayhpc1BvdzIodykgJiYgaXNQb3cyKGgpLFxuICAgICAgJ3RleHR1cmUgbXVzdCBiZSBhIHNxdWFyZSBwb3dlciBvZiAyIHRvIHN1cHBvcnQgbWlwbWFwcGluZycpXG4gICAgY2hlY2sobWlwRGF0YS5taXBtYXNrID09PSAodyA8PCAxKSAtIDEsXG4gICAgICAnbWlzc2luZyBvciBpbmNvbXBsZXRlIG1pcG1hcCBkYXRhJylcbiAgfVxuXG4gIGlmIChtaXBEYXRhLnR5cGUgPT09IEdMX0ZMT0FUKSB7XG4gICAgaWYgKGxpbWl0cy5leHRlbnNpb25zLmluZGV4T2YoJ29lc190ZXh0dXJlX2Zsb2F0X2xpbmVhcicpIDwgMCkge1xuICAgICAgY2hlY2soaW5mby5taW5GaWx0ZXIgPT09IEdMX05FQVJFU1QgJiYgaW5mby5tYWdGaWx0ZXIgPT09IEdMX05FQVJFU1QsXG4gICAgICAgICdmaWx0ZXIgbm90IHN1cHBvcnRlZCwgbXVzdCBlbmFibGUgb2VzX3RleHR1cmVfZmxvYXRfbGluZWFyJylcbiAgICB9XG4gICAgY2hlY2soIWluZm8uZ2VuTWlwbWFwcyxcbiAgICAgICdtaXBtYXAgZ2VuZXJhdGlvbiBub3Qgc3VwcG9ydGVkIHdpdGggZmxvYXQgdGV4dHVyZXMnKVxuICB9XG5cbiAgLy8gY2hlY2sgaW1hZ2UgY29tcGxldGVcbiAgdmFyIG1pcGltYWdlcyA9IG1pcERhdGEuaW1hZ2VzXG4gIGZvciAoaSA9IDA7IGkgPCAxNjsgKytpKSB7XG4gICAgaWYgKG1pcGltYWdlc1tpXSkge1xuICAgICAgdmFyIG13ID0gdyA+PiBpXG4gICAgICB2YXIgbWggPSBoID4+IGlcbiAgICAgIGNoZWNrKG1pcERhdGEubWlwbWFzayAmICgxIDw8IGkpLCAnbWlzc2luZyBtaXBtYXAgZGF0YScpXG5cbiAgICAgIHZhciBpbWcgPSBtaXBpbWFnZXNbaV1cblxuICAgICAgY2hlY2soXG4gICAgICAgIGltZy53aWR0aCA9PT0gbXcgJiZcbiAgICAgICAgaW1nLmhlaWdodCA9PT0gbWgsXG4gICAgICAgICdpbnZhbGlkIHNoYXBlIGZvciBtaXAgaW1hZ2VzJylcblxuICAgICAgY2hlY2soXG4gICAgICAgIGltZy5mb3JtYXQgPT09IG1pcERhdGEuZm9ybWF0ICYmXG4gICAgICAgIGltZy5pbnRlcm5hbGZvcm1hdCA9PT0gbWlwRGF0YS5pbnRlcm5hbGZvcm1hdCAmJlxuICAgICAgICBpbWcudHlwZSA9PT0gbWlwRGF0YS50eXBlLFxuICAgICAgICAnaW5jb21wYXRpYmxlIHR5cGUgZm9yIG1pcCBpbWFnZScpXG5cbiAgICAgIGlmIChpbWcuY29tcHJlc3NlZCkge1xuICAgICAgICAvLyBUT0RPOiBjaGVjayBzaXplIGZvciBjb21wcmVzc2VkIGltYWdlc1xuICAgICAgfSBlbHNlIGlmIChpbWcuZGF0YSkge1xuICAgICAgICBjaGVjayhpbWcuZGF0YS5ieXRlTGVuZ3RoID09PSBtdyAqIG1oICpcbiAgICAgICAgICBNYXRoLm1heChwaXhlbFNpemUoaW1nLnR5cGUsIGMpLCBpbWcudW5wYWNrQWxpZ25tZW50KSxcbiAgICAgICAgICAnaW52YWxpZCBkYXRhIGZvciBpbWFnZSwgYnVmZmVyIHNpemUgaXMgaW5jb25zaXN0ZW50IHdpdGggaW1hZ2UgZm9ybWF0JylcbiAgICAgIH0gZWxzZSBpZiAoaW1nLmVsZW1lbnQpIHtcbiAgICAgICAgLy8gVE9ETzogY2hlY2sgZWxlbWVudCBjYW4gYmUgbG9hZGVkXG4gICAgICB9IGVsc2UgaWYgKGltZy5jb3B5KSB7XG4gICAgICAgIC8vIFRPRE86IGNoZWNrIGNvbXBhdGlibGUgZm9ybWF0IGFuZCB0eXBlXG4gICAgICB9XG4gICAgfSBlbHNlIGlmICghaW5mby5nZW5NaXBtYXBzKSB7XG4gICAgICBjaGVjaygobWlwRGF0YS5taXBtYXNrICYgKDEgPDwgaSkpID09PSAwLCAnZXh0cmEgbWlwbWFwIGRhdGEnKVxuICAgIH1cbiAgfVxuXG4gIGlmIChtaXBEYXRhLmNvbXByZXNzZWQpIHtcbiAgICBjaGVjayghaW5mby5nZW5NaXBtYXBzLFxuICAgICAgJ21pcG1hcCBnZW5lcmF0aW9uIGZvciBjb21wcmVzc2VkIGltYWdlcyBub3Qgc3VwcG9ydGVkJylcbiAgfVxufVxuXG5mdW5jdGlvbiBjaGVja1RleHR1cmVDdWJlICh0ZXh0dXJlLCBpbmZvLCBmYWNlcywgbGltaXRzKSB7XG4gIHZhciB3ID0gdGV4dHVyZS53aWR0aFxuICB2YXIgaCA9IHRleHR1cmUuaGVpZ2h0XG4gIHZhciBjID0gdGV4dHVyZS5jaGFubmVsc1xuXG4gIC8vIENoZWNrIHRleHR1cmUgc2hhcGVcbiAgY2hlY2soXG4gICAgdyA+IDAgJiYgdyA8PSBsaW1pdHMubWF4VGV4dHVyZVNpemUgJiYgaCA+IDAgJiYgaCA8PSBsaW1pdHMubWF4VGV4dHVyZVNpemUsXG4gICAgJ2ludmFsaWQgdGV4dHVyZSBzaGFwZScpXG4gIGNoZWNrKFxuICAgIHcgPT09IGgsXG4gICAgJ2N1YmUgbWFwIG11c3QgYmUgc3F1YXJlJylcbiAgY2hlY2soXG4gICAgaW5mby53cmFwUyA9PT0gR0xfQ0xBTVBfVE9fRURHRSAmJiBpbmZvLndyYXBUID09PSBHTF9DTEFNUF9UT19FREdFLFxuICAgICd3cmFwIG1vZGUgbm90IHN1cHBvcnRlZCBieSBjdWJlIG1hcCcpXG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBmYWNlcy5sZW5ndGg7ICsraSkge1xuICAgIHZhciBmYWNlID0gZmFjZXNbaV1cbiAgICBjaGVjayhcbiAgICAgIGZhY2Uud2lkdGggPT09IHcgJiYgZmFjZS5oZWlnaHQgPT09IGgsXG4gICAgICAnaW5jb25zaXN0ZW50IGN1YmUgbWFwIGZhY2Ugc2hhcGUnKVxuXG4gICAgaWYgKGluZm8uZ2VuTWlwbWFwcykge1xuICAgICAgY2hlY2soIWZhY2UuY29tcHJlc3NlZCxcbiAgICAgICAgJ2NhbiBub3QgZ2VuZXJhdGUgbWlwbWFwIGZvciBjb21wcmVzc2VkIHRleHR1cmVzJylcbiAgICAgIGNoZWNrKGZhY2UubWlwbWFzayA9PT0gMSxcbiAgICAgICAgJ2NhbiBub3Qgc3BlY2lmeSBtaXBtYXBzIGFuZCBnZW5lcmF0ZSBtaXBtYXBzJylcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gVE9ETzogY2hlY2sgbWlwIGFuZCBmaWx0ZXIgbW9kZVxuICAgIH1cblxuICAgIHZhciBtaXBtYXBzID0gZmFjZS5pbWFnZXNcbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IDE2OyArK2opIHtcbiAgICAgIHZhciBpbWcgPSBtaXBtYXBzW2pdXG4gICAgICBpZiAoaW1nKSB7XG4gICAgICAgIHZhciBtdyA9IHcgPj4galxuICAgICAgICB2YXIgbWggPSBoID4+IGpcbiAgICAgICAgY2hlY2soZmFjZS5taXBtYXNrICYgKDEgPDwgaiksICdtaXNzaW5nIG1pcG1hcCBkYXRhJylcbiAgICAgICAgY2hlY2soXG4gICAgICAgICAgaW1nLndpZHRoID09PSBtdyAmJlxuICAgICAgICAgIGltZy5oZWlnaHQgPT09IG1oLFxuICAgICAgICAgICdpbnZhbGlkIHNoYXBlIGZvciBtaXAgaW1hZ2VzJylcbiAgICAgICAgY2hlY2soXG4gICAgICAgICAgaW1nLmZvcm1hdCA9PT0gdGV4dHVyZS5mb3JtYXQgJiZcbiAgICAgICAgICBpbWcuaW50ZXJuYWxmb3JtYXQgPT09IHRleHR1cmUuaW50ZXJuYWxmb3JtYXQgJiZcbiAgICAgICAgICBpbWcudHlwZSA9PT0gdGV4dHVyZS50eXBlLFxuICAgICAgICAgICdpbmNvbXBhdGlibGUgdHlwZSBmb3IgbWlwIGltYWdlJylcblxuICAgICAgICBpZiAoaW1nLmNvbXByZXNzZWQpIHtcbiAgICAgICAgICAvLyBUT0RPOiBjaGVjayBzaXplIGZvciBjb21wcmVzc2VkIGltYWdlc1xuICAgICAgICB9IGVsc2UgaWYgKGltZy5kYXRhKSB7XG4gICAgICAgICAgY2hlY2soaW1nLmRhdGEuYnl0ZUxlbmd0aCA9PT0gbXcgKiBtaCAqXG4gICAgICAgICAgICBNYXRoLm1heChwaXhlbFNpemUoaW1nLnR5cGUsIGMpLCBpbWcudW5wYWNrQWxpZ25tZW50KSxcbiAgICAgICAgICAgICdpbnZhbGlkIGRhdGEgZm9yIGltYWdlLCBidWZmZXIgc2l6ZSBpcyBpbmNvbnNpc3RlbnQgd2l0aCBpbWFnZSBmb3JtYXQnKVxuICAgICAgICB9IGVsc2UgaWYgKGltZy5lbGVtZW50KSB7XG4gICAgICAgICAgLy8gVE9ETzogY2hlY2sgZWxlbWVudCBjYW4gYmUgbG9hZGVkXG4gICAgICAgIH0gZWxzZSBpZiAoaW1nLmNvcHkpIHtcbiAgICAgICAgICAvLyBUT0RPOiBjaGVjayBjb21wYXRpYmxlIGZvcm1hdCBhbmQgdHlwZVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZXh0ZW5kKGNoZWNrLCB7XG4gIG9wdGlvbmFsOiBjaGVja09wdGlvbmFsLFxuICByYWlzZTogcmFpc2UsXG4gIGNvbW1hbmRSYWlzZTogY29tbWFuZFJhaXNlLFxuICBjb21tYW5kOiBjaGVja0NvbW1hbmQsXG4gIHBhcmFtZXRlcjogY2hlY2tQYXJhbWV0ZXIsXG4gIGNvbW1hbmRQYXJhbWV0ZXI6IGNoZWNrUGFyYW1ldGVyQ29tbWFuZCxcbiAgY29uc3RydWN0b3I6IGNoZWNrQ29uc3RydWN0b3IsXG4gIHR5cGU6IGNoZWNrVHlwZU9mLFxuICBjb21tYW5kVHlwZTogY2hlY2tDb21tYW5kVHlwZSxcbiAgaXNUeXBlZEFycmF5OiBjaGVja0lzVHlwZWRBcnJheSxcbiAgbm5pOiBjaGVja05vbk5lZ2F0aXZlSW50LFxuICBvbmVPZjogY2hlY2tPbmVPZixcbiAgc2hhZGVyRXJyb3I6IGNoZWNrU2hhZGVyRXJyb3IsXG4gIGxpbmtFcnJvcjogY2hlY2tMaW5rRXJyb3IsXG4gIGNhbGxTaXRlOiBndWVzc0NhbGxTaXRlLFxuICBzYXZlQ29tbWFuZFJlZjogc2F2ZUNvbW1hbmRSZWYsXG4gIHNhdmVEcmF3SW5mbzogc2F2ZURyYXdDb21tYW5kSW5mbyxcbiAgZnJhbWVidWZmZXJGb3JtYXQ6IGNoZWNrRnJhbWVidWZmZXJGb3JtYXQsXG4gIGd1ZXNzQ29tbWFuZDogZ3Vlc3NDb21tYW5kLFxuICB0ZXh0dXJlMkQ6IGNoZWNrVGV4dHVyZTJELFxuICB0ZXh0dXJlQ3ViZTogY2hlY2tUZXh0dXJlQ3ViZVxufSlcbiIsIi8qIGdsb2JhbHMgcGVyZm9ybWFuY2UgKi9cbm1vZHVsZS5leHBvcnRzID1cbiAgKHR5cGVvZiBwZXJmb3JtYW5jZSAhPT0gJ3VuZGVmaW5lZCcgJiYgcGVyZm9ybWFuY2Uubm93KVxuICA/IGZ1bmN0aW9uICgpIHsgcmV0dXJuIHBlcmZvcm1hbmNlLm5vdygpIH1cbiAgOiBmdW5jdGlvbiAoKSB7IHJldHVybiArKG5ldyBEYXRlKCkpIH1cbiIsInZhciBleHRlbmQgPSByZXF1aXJlKCcuL2V4dGVuZCcpXG5cbmZ1bmN0aW9uIHNsaWNlICh4KSB7XG4gIHJldHVybiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbCh4KVxufVxuXG5mdW5jdGlvbiBqb2luICh4KSB7XG4gIHJldHVybiBzbGljZSh4KS5qb2luKCcnKVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNyZWF0ZUVudmlyb25tZW50ICgpIHtcbiAgLy8gVW5pcXVlIHZhcmlhYmxlIGlkIGNvdW50ZXJcbiAgdmFyIHZhckNvdW50ZXIgPSAwXG5cbiAgLy8gTGlua2VkIHZhbHVlcyBhcmUgcGFzc2VkIGZyb20gdGhpcyBzY29wZSBpbnRvIHRoZSBnZW5lcmF0ZWQgY29kZSBibG9ja1xuICAvLyBDYWxsaW5nIGxpbmsoKSBwYXNzZXMgYSB2YWx1ZSBpbnRvIHRoZSBnZW5lcmF0ZWQgc2NvcGUgYW5kIHJldHVybnNcbiAgLy8gdGhlIHZhcmlhYmxlIG5hbWUgd2hpY2ggaXQgaXMgYm91bmQgdG9cbiAgdmFyIGxpbmtlZE5hbWVzID0gW11cbiAgdmFyIGxpbmtlZFZhbHVlcyA9IFtdXG4gIGZ1bmN0aW9uIGxpbmsgKHZhbHVlKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsaW5rZWRWYWx1ZXMubGVuZ3RoOyArK2kpIHtcbiAgICAgIGlmIChsaW5rZWRWYWx1ZXNbaV0gPT09IHZhbHVlKSB7XG4gICAgICAgIHJldHVybiBsaW5rZWROYW1lc1tpXVxuICAgICAgfVxuICAgIH1cblxuICAgIHZhciBuYW1lID0gJ2cnICsgKHZhckNvdW50ZXIrKylcbiAgICBsaW5rZWROYW1lcy5wdXNoKG5hbWUpXG4gICAgbGlua2VkVmFsdWVzLnB1c2godmFsdWUpXG4gICAgcmV0dXJuIG5hbWVcbiAgfVxuXG4gIC8vIGNyZWF0ZSBhIGNvZGUgYmxvY2tcbiAgZnVuY3Rpb24gYmxvY2sgKCkge1xuICAgIHZhciBjb2RlID0gW11cbiAgICBmdW5jdGlvbiBwdXNoICgpIHtcbiAgICAgIGNvZGUucHVzaC5hcHBseShjb2RlLCBzbGljZShhcmd1bWVudHMpKVxuICAgIH1cblxuICAgIHZhciB2YXJzID0gW11cbiAgICBmdW5jdGlvbiBkZWYgKCkge1xuICAgICAgdmFyIG5hbWUgPSAndicgKyAodmFyQ291bnRlcisrKVxuICAgICAgdmFycy5wdXNoKG5hbWUpXG5cbiAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb2RlLnB1c2gobmFtZSwgJz0nKVxuICAgICAgICBjb2RlLnB1c2guYXBwbHkoY29kZSwgc2xpY2UoYXJndW1lbnRzKSlcbiAgICAgICAgY29kZS5wdXNoKCc7JylcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG5hbWVcbiAgICB9XG5cbiAgICByZXR1cm4gZXh0ZW5kKHB1c2gsIHtcbiAgICAgIGRlZjogZGVmLFxuICAgICAgdG9TdHJpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIGpvaW4oW1xuICAgICAgICAgICh2YXJzLmxlbmd0aCA+IDAgPyAndmFyICcgKyB2YXJzICsgJzsnIDogJycpLFxuICAgICAgICAgIGpvaW4oY29kZSlcbiAgICAgICAgXSlcbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgZnVuY3Rpb24gc2NvcGUgKCkge1xuICAgIHZhciBlbnRyeSA9IGJsb2NrKClcbiAgICB2YXIgZXhpdCA9IGJsb2NrKClcblxuICAgIHZhciBlbnRyeVRvU3RyaW5nID0gZW50cnkudG9TdHJpbmdcbiAgICB2YXIgZXhpdFRvU3RyaW5nID0gZXhpdC50b1N0cmluZ1xuXG4gICAgZnVuY3Rpb24gc2F2ZSAob2JqZWN0LCBwcm9wKSB7XG4gICAgICBleGl0KG9iamVjdCwgcHJvcCwgJz0nLCBlbnRyeS5kZWYob2JqZWN0LCBwcm9wKSwgJzsnKVxuICAgIH1cblxuICAgIHJldHVybiBleHRlbmQoZnVuY3Rpb24gKCkge1xuICAgICAgZW50cnkuYXBwbHkoZW50cnksIHNsaWNlKGFyZ3VtZW50cykpXG4gICAgfSwge1xuICAgICAgZGVmOiBlbnRyeS5kZWYsXG4gICAgICBlbnRyeTogZW50cnksXG4gICAgICBleGl0OiBleGl0LFxuICAgICAgc2F2ZTogc2F2ZSxcbiAgICAgIHNldDogZnVuY3Rpb24gKG9iamVjdCwgcHJvcCwgdmFsdWUpIHtcbiAgICAgICAgc2F2ZShvYmplY3QsIHByb3ApXG4gICAgICAgIGVudHJ5KG9iamVjdCwgcHJvcCwgJz0nLCB2YWx1ZSwgJzsnKVxuICAgICAgfSxcbiAgICAgIHRvU3RyaW5nOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBlbnRyeVRvU3RyaW5nKCkgKyBleGl0VG9TdHJpbmcoKVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiBjb25kaXRpb25hbCAoKSB7XG4gICAgdmFyIHByZWQgPSBqb2luKGFyZ3VtZW50cylcbiAgICB2YXIgdGhlbkJsb2NrID0gc2NvcGUoKVxuICAgIHZhciBlbHNlQmxvY2sgPSBzY29wZSgpXG5cbiAgICB2YXIgdGhlblRvU3RyaW5nID0gdGhlbkJsb2NrLnRvU3RyaW5nXG4gICAgdmFyIGVsc2VUb1N0cmluZyA9IGVsc2VCbG9jay50b1N0cmluZ1xuXG4gICAgcmV0dXJuIGV4dGVuZCh0aGVuQmxvY2ssIHtcbiAgICAgIHRoZW46IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhlbkJsb2NrLmFwcGx5KHRoZW5CbG9jaywgc2xpY2UoYXJndW1lbnRzKSlcbiAgICAgICAgcmV0dXJuIHRoaXNcbiAgICAgIH0sXG4gICAgICBlbHNlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGVsc2VCbG9jay5hcHBseShlbHNlQmxvY2ssIHNsaWNlKGFyZ3VtZW50cykpXG4gICAgICAgIHJldHVybiB0aGlzXG4gICAgICB9LFxuICAgICAgdG9TdHJpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGVsc2VDbGF1c2UgPSBlbHNlVG9TdHJpbmcoKVxuICAgICAgICBpZiAoZWxzZUNsYXVzZSkge1xuICAgICAgICAgIGVsc2VDbGF1c2UgPSAnZWxzZXsnICsgZWxzZUNsYXVzZSArICd9J1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBqb2luKFtcbiAgICAgICAgICAnaWYoJywgcHJlZCwgJyl7JyxcbiAgICAgICAgICB0aGVuVG9TdHJpbmcoKSxcbiAgICAgICAgICAnfScsIGVsc2VDbGF1c2VcbiAgICAgICAgXSlcbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgLy8gcHJvY2VkdXJlIGxpc3RcbiAgdmFyIGdsb2JhbEJsb2NrID0gYmxvY2soKVxuICB2YXIgcHJvY2VkdXJlcyA9IHt9XG4gIGZ1bmN0aW9uIHByb2MgKG5hbWUsIGNvdW50KSB7XG4gICAgdmFyIGFyZ3MgPSBbXVxuICAgIGZ1bmN0aW9uIGFyZyAoKSB7XG4gICAgICB2YXIgbmFtZSA9ICdhJyArIGFyZ3MubGVuZ3RoXG4gICAgICBhcmdzLnB1c2gobmFtZSlcbiAgICAgIHJldHVybiBuYW1lXG4gICAgfVxuXG4gICAgY291bnQgPSBjb3VudCB8fCAwXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjb3VudDsgKytpKSB7XG4gICAgICBhcmcoKVxuICAgIH1cblxuICAgIHZhciBib2R5ID0gc2NvcGUoKVxuICAgIHZhciBib2R5VG9TdHJpbmcgPSBib2R5LnRvU3RyaW5nXG5cbiAgICB2YXIgcmVzdWx0ID0gcHJvY2VkdXJlc1tuYW1lXSA9IGV4dGVuZChib2R5LCB7XG4gICAgICBhcmc6IGFyZyxcbiAgICAgIHRvU3RyaW5nOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBqb2luKFtcbiAgICAgICAgICAnZnVuY3Rpb24oJywgYXJncy5qb2luKCksICcpeycsXG4gICAgICAgICAgYm9keVRvU3RyaW5nKCksXG4gICAgICAgICAgJ30nXG4gICAgICAgIF0pXG4gICAgICB9XG4gICAgfSlcblxuICAgIHJldHVybiByZXN1bHRcbiAgfVxuXG4gIGZ1bmN0aW9uIGNvbXBpbGUgKCkge1xuICAgIHZhciBjb2RlID0gWydcInVzZSBzdHJpY3RcIjsnLFxuICAgICAgZ2xvYmFsQmxvY2ssXG4gICAgICAncmV0dXJuIHsnXVxuICAgIE9iamVjdC5rZXlzKHByb2NlZHVyZXMpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIGNvZGUucHVzaCgnXCInLCBuYW1lLCAnXCI6JywgcHJvY2VkdXJlc1tuYW1lXS50b1N0cmluZygpLCAnLCcpXG4gICAgfSlcbiAgICBjb2RlLnB1c2goJ30nKVxuICAgIHZhciBzcmMgPSBqb2luKGNvZGUpXG4gICAgICAucmVwbGFjZSgvOy9nLCAnO1xcbicpXG4gICAgICAucmVwbGFjZSgvfS9nLCAnfVxcbicpXG4gICAgICAucmVwbGFjZSgvey9nLCAne1xcbicpXG4gICAgdmFyIHByb2MgPSBGdW5jdGlvbi5hcHBseShudWxsLCBsaW5rZWROYW1lcy5jb25jYXQoc3JjKSlcbiAgICByZXR1cm4gcHJvYy5hcHBseShudWxsLCBsaW5rZWRWYWx1ZXMpXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGdsb2JhbDogZ2xvYmFsQmxvY2ssXG4gICAgbGluazogbGluayxcbiAgICBibG9jazogYmxvY2ssXG4gICAgcHJvYzogcHJvYyxcbiAgICBzY29wZTogc2NvcGUsXG4gICAgY29uZDogY29uZGl0aW9uYWwsXG4gICAgY29tcGlsZTogY29tcGlsZVxuICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChiYXNlLCBvcHRzKSB7XG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXMob3B0cylcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBrZXlzLmxlbmd0aDsgKytpKSB7XG4gICAgYmFzZVtrZXlzW2ldXSA9IG9wdHNba2V5c1tpXV1cbiAgfVxuICByZXR1cm4gYmFzZVxufVxuIiwidmFyIHBvb2wgPSByZXF1aXJlKCcuL3Bvb2wnKVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgc2hhcGU6IGFycmF5U2hhcGUsXG4gIGZsYXR0ZW46IGZsYXR0ZW5BcnJheVxufVxuXG5mdW5jdGlvbiBmbGF0dGVuMUQgKGFycmF5LCBueCwgb3V0KSB7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbng7ICsraSkge1xuICAgIG91dFtpXSA9IGFycmF5W2ldXG4gIH1cbn1cblxuZnVuY3Rpb24gZmxhdHRlbjJEIChhcnJheSwgbngsIG55LCBvdXQpIHtcbiAgdmFyIHB0ciA9IDBcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBueDsgKytpKSB7XG4gICAgdmFyIHJvdyA9IGFycmF5W2ldXG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBueTsgKytqKSB7XG4gICAgICBvdXRbcHRyKytdID0gcm93W2pdXG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGZsYXR0ZW4zRCAoYXJyYXksIG54LCBueSwgbnosIG91dCwgcHRyXykge1xuICB2YXIgcHRyID0gcHRyX1xuICBmb3IgKHZhciBpID0gMDsgaSA8IG54OyArK2kpIHtcbiAgICB2YXIgcm93ID0gYXJyYXlbaV1cbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IG55OyArK2opIHtcbiAgICAgIHZhciBjb2wgPSByb3dbal1cbiAgICAgIGZvciAodmFyIGsgPSAwOyBrIDwgbno7ICsraykge1xuICAgICAgICBvdXRbcHRyKytdID0gY29sW2tdXG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGZsYXR0ZW5SZWMgKGFycmF5LCBzaGFwZSwgbGV2ZWwsIG91dCwgcHRyKSB7XG4gIHZhciBzdHJpZGUgPSAxXG4gIGZvciAodmFyIGkgPSBsZXZlbCArIDE7IGkgPCBzaGFwZS5sZW5ndGg7ICsraSkge1xuICAgIHN0cmlkZSAqPSBzaGFwZVtpXVxuICB9XG4gIHZhciBuID0gc2hhcGVbbGV2ZWxdXG4gIGlmIChzaGFwZS5sZW5ndGggLSBsZXZlbCA9PT0gNCkge1xuICAgIHZhciBueCA9IHNoYXBlW2xldmVsICsgMV1cbiAgICB2YXIgbnkgPSBzaGFwZVtsZXZlbCArIDJdXG4gICAgdmFyIG56ID0gc2hhcGVbbGV2ZWwgKyAzXVxuICAgIGZvciAoaSA9IDA7IGkgPCBuOyArK2kpIHtcbiAgICAgIGZsYXR0ZW4zRChhcnJheVtpXSwgbngsIG55LCBueiwgb3V0LCBwdHIpXG4gICAgICBwdHIgKz0gc3RyaWRlXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGZvciAoaSA9IDA7IGkgPCBuOyArK2kpIHtcbiAgICAgIGZsYXR0ZW5SZWMoYXJyYXlbaV0sIHNoYXBlLCBsZXZlbCArIDEsIG91dCwgcHRyKVxuICAgICAgcHRyICs9IHN0cmlkZVxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBmbGF0dGVuQXJyYXkgKGFycmF5LCBzaGFwZSwgdHlwZSwgb3V0Xykge1xuICB2YXIgc3ogPSAxXG4gIGlmIChzaGFwZS5sZW5ndGgpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHNoYXBlLmxlbmd0aDsgKytpKSB7XG4gICAgICBzeiAqPSBzaGFwZVtpXVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBzeiA9IDBcbiAgfVxuICB2YXIgb3V0ID0gb3V0XyB8fCBwb29sLmFsbG9jVHlwZSh0eXBlLCBzeilcbiAgc3dpdGNoIChzaGFwZS5sZW5ndGgpIHtcbiAgICBjYXNlIDA6XG4gICAgICBicmVha1xuICAgIGNhc2UgMTpcbiAgICAgIGZsYXR0ZW4xRChhcnJheSwgc2hhcGVbMF0sIG91dClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAyOlxuICAgICAgZmxhdHRlbjJEKGFycmF5LCBzaGFwZVswXSwgc2hhcGVbMV0sIG91dClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAzOlxuICAgICAgZmxhdHRlbjNEKGFycmF5LCBzaGFwZVswXSwgc2hhcGVbMV0sIHNoYXBlWzJdLCBvdXQsIDApXG4gICAgICBicmVha1xuICAgIGRlZmF1bHQ6XG4gICAgICBmbGF0dGVuUmVjKGFycmF5LCBzaGFwZSwgMCwgb3V0LCAwKVxuICB9XG4gIHJldHVybiBvdXRcbn1cblxuZnVuY3Rpb24gYXJyYXlTaGFwZSAoYXJyYXlfKSB7XG4gIHZhciBzaGFwZSA9IFtdXG4gIGZvciAodmFyIGFycmF5ID0gYXJyYXlfOyBhcnJheS5sZW5ndGg7IGFycmF5ID0gYXJyYXlbMF0pIHtcbiAgICBzaGFwZS5wdXNoKGFycmF5Lmxlbmd0aClcbiAgfVxuICByZXR1cm4gc2hhcGVcbn1cbiIsInZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL2lzLXR5cGVkLWFycmF5Jylcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaXNBcnJheUxpa2UgKHMpIHtcbiAgcmV0dXJuIEFycmF5LmlzQXJyYXkocykgfHwgaXNUeXBlZEFycmF5KHMpXG59XG4iLCJ2YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi9pcy10eXBlZC1hcnJheScpXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaXNOREFycmF5TGlrZSAob2JqKSB7XG4gIHJldHVybiAoXG4gICAgISFvYmogJiZcbiAgICB0eXBlb2Ygb2JqID09PSAnb2JqZWN0JyAmJlxuICAgIEFycmF5LmlzQXJyYXkob2JqLnNoYXBlKSAmJlxuICAgIEFycmF5LmlzQXJyYXkob2JqLnN0cmlkZSkgJiZcbiAgICB0eXBlb2Ygb2JqLm9mZnNldCA9PT0gJ251bWJlcicgJiZcbiAgICBvYmouc2hhcGUubGVuZ3RoID09PSBvYmouc3RyaWRlLmxlbmd0aCAmJlxuICAgIChBcnJheS5pc0FycmF5KG9iai5kYXRhKSB8fFxuICAgICAgaXNUeXBlZEFycmF5KG9iai5kYXRhKSkpXG59XG4iLCJ2YXIgZHR5cGVzID0gcmVxdWlyZSgnLi4vY29uc3RhbnRzL2FycmF5dHlwZXMuanNvbicpXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uICh4KSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoeCkgaW4gZHR5cGVzXG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGxvb3AgKG4sIGYpIHtcbiAgdmFyIHJlc3VsdCA9IEFycmF5KG4pXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbjsgKytpKSB7XG4gICAgcmVzdWx0W2ldID0gZihpKVxuICB9XG4gIHJldHVybiByZXN1bHRcbn1cbiIsInZhciBsb29wID0gcmVxdWlyZSgnLi9sb29wJylcblxudmFyIEdMX0JZVEUgPSA1MTIwXG52YXIgR0xfVU5TSUdORURfQllURSA9IDUxMjFcbnZhciBHTF9TSE9SVCA9IDUxMjJcbnZhciBHTF9VTlNJR05FRF9TSE9SVCA9IDUxMjNcbnZhciBHTF9JTlQgPSA1MTI0XG52YXIgR0xfVU5TSUdORURfSU5UID0gNTEyNVxudmFyIEdMX0ZMT0FUID0gNTEyNlxuXG52YXIgYnVmZmVyUG9vbCA9IGxvb3AoOCwgZnVuY3Rpb24gKCkge1xuICByZXR1cm4gW11cbn0pXG5cbmZ1bmN0aW9uIG5leHRQb3cxNiAodikge1xuICBmb3IgKHZhciBpID0gMTY7IGkgPD0gKDEgPDwgMjgpOyBpICo9IDE2KSB7XG4gICAgaWYgKHYgPD0gaSkge1xuICAgICAgcmV0dXJuIGlcbiAgICB9XG4gIH1cbiAgcmV0dXJuIDBcbn1cblxuZnVuY3Rpb24gbG9nMiAodikge1xuICB2YXIgciwgc2hpZnRcbiAgciA9ICh2ID4gMHhGRkZGKSA8PCA0XG4gIHYgPj4+PSByXG4gIHNoaWZ0ID0gKHYgPiAweEZGKSA8PCAzXG4gIHYgPj4+PSBzaGlmdDsgciB8PSBzaGlmdFxuICBzaGlmdCA9ICh2ID4gMHhGKSA8PCAyXG4gIHYgPj4+PSBzaGlmdDsgciB8PSBzaGlmdFxuICBzaGlmdCA9ICh2ID4gMHgzKSA8PCAxXG4gIHYgPj4+PSBzaGlmdDsgciB8PSBzaGlmdFxuICByZXR1cm4gciB8ICh2ID4+IDEpXG59XG5cbmZ1bmN0aW9uIGFsbG9jIChuKSB7XG4gIHZhciBzeiA9IG5leHRQb3cxNihuKVxuICB2YXIgYmluID0gYnVmZmVyUG9vbFtsb2cyKHN6KSA+PiAyXVxuICBpZiAoYmluLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4gYmluLnBvcCgpXG4gIH1cbiAgcmV0dXJuIG5ldyBBcnJheUJ1ZmZlcihzeilcbn1cblxuZnVuY3Rpb24gZnJlZSAoYnVmKSB7XG4gIGJ1ZmZlclBvb2xbbG9nMihidWYuYnl0ZUxlbmd0aCkgPj4gMl0ucHVzaChidWYpXG59XG5cbmZ1bmN0aW9uIGFsbG9jVHlwZSAodHlwZSwgbikge1xuICB2YXIgcmVzdWx0ID0gbnVsbFxuICBzd2l0Y2ggKHR5cGUpIHtcbiAgICBjYXNlIEdMX0JZVEU6XG4gICAgICByZXN1bHQgPSBuZXcgSW50OEFycmF5KGFsbG9jKG4pLCAwLCBuKVxuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX1VOU0lHTkVEX0JZVEU6XG4gICAgICByZXN1bHQgPSBuZXcgVWludDhBcnJheShhbGxvYyhuKSwgMCwgbilcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9TSE9SVDpcbiAgICAgIHJlc3VsdCA9IG5ldyBJbnQxNkFycmF5KGFsbG9jKDIgKiBuKSwgMCwgbilcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9VTlNJR05FRF9TSE9SVDpcbiAgICAgIHJlc3VsdCA9IG5ldyBVaW50MTZBcnJheShhbGxvYygyICogbiksIDAsIG4pXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfSU5UOlxuICAgICAgcmVzdWx0ID0gbmV3IEludDMyQXJyYXkoYWxsb2MoNCAqIG4pLCAwLCBuKVxuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX1VOU0lHTkVEX0lOVDpcbiAgICAgIHJlc3VsdCA9IG5ldyBVaW50MzJBcnJheShhbGxvYyg0ICogbiksIDAsIG4pXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfRkxPQVQ6XG4gICAgICByZXN1bHQgPSBuZXcgRmxvYXQzMkFycmF5KGFsbG9jKDQgKiBuKSwgMCwgbilcbiAgICAgIGJyZWFrXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBudWxsXG4gIH1cbiAgaWYgKHJlc3VsdC5sZW5ndGggIT09IG4pIHtcbiAgICByZXR1cm4gcmVzdWx0LnN1YmFycmF5KDAsIG4pXG4gIH1cbiAgcmV0dXJuIHJlc3VsdFxufVxuXG5mdW5jdGlvbiBmcmVlVHlwZSAoYXJyYXkpIHtcbiAgZnJlZShhcnJheS5idWZmZXIpXG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBhbGxvYzogYWxsb2MsXG4gIGZyZWU6IGZyZWUsXG4gIGFsbG9jVHlwZTogYWxsb2NUeXBlLFxuICBmcmVlVHlwZTogZnJlZVR5cGVcbn1cbiIsIi8qIGdsb2JhbHMgcmVxdWVzdEFuaW1hdGlvbkZyYW1lLCBjYW5jZWxBbmltYXRpb25GcmFtZSAqL1xubW9kdWxlLmV4cG9ydHMgPSB7XG4gIG5leHQ6IHR5cGVvZiByZXF1ZXN0QW5pbWF0aW9uRnJhbWUgPT09ICdmdW5jdGlvbidcbiAgICA/IGZ1bmN0aW9uIChjYikgeyByZXR1cm4gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKGNiKSB9XG4gICAgOiBmdW5jdGlvbiAoY2IpIHsgcmV0dXJuIHNldFRpbWVvdXQoY2IsIDE2KSB9LFxuICBjYW5jZWw6IHR5cGVvZiBjYW5jZWxBbmltYXRpb25GcmFtZSA9PT0gJ2Z1bmN0aW9uJ1xuICAgID8gZnVuY3Rpb24gKHJhZikgeyByZXR1cm4gY2FuY2VsQW5pbWF0aW9uRnJhbWUocmFmKSB9XG4gICAgOiBjbGVhclRpbWVvdXRcbn1cbiIsInZhciBwb29sID0gcmVxdWlyZSgnLi9wb29sJylcblxudmFyIEZMT0FUID0gbmV3IEZsb2F0MzJBcnJheSgxKVxudmFyIElOVCA9IG5ldyBVaW50MzJBcnJheShGTE9BVC5idWZmZXIpXG5cbnZhciBHTF9VTlNJR05FRF9TSE9SVCA9IDUxMjNcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjb252ZXJ0VG9IYWxmRmxvYXQgKGFycmF5KSB7XG4gIHZhciB1c2hvcnRzID0gcG9vbC5hbGxvY1R5cGUoR0xfVU5TSUdORURfU0hPUlQsIGFycmF5Lmxlbmd0aClcblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGFycmF5Lmxlbmd0aDsgKytpKSB7XG4gICAgaWYgKGlzTmFOKGFycmF5W2ldKSkge1xuICAgICAgdXNob3J0c1tpXSA9IDB4ZmZmZlxuICAgIH0gZWxzZSBpZiAoYXJyYXlbaV0gPT09IEluZmluaXR5KSB7XG4gICAgICB1c2hvcnRzW2ldID0gMHg3YzAwXG4gICAgfSBlbHNlIGlmIChhcnJheVtpXSA9PT0gLUluZmluaXR5KSB7XG4gICAgICB1c2hvcnRzW2ldID0gMHhmYzAwXG4gICAgfSBlbHNlIHtcbiAgICAgIEZMT0FUWzBdID0gYXJyYXlbaV1cbiAgICAgIHZhciB4ID0gSU5UWzBdXG5cbiAgICAgIHZhciBzZ24gPSAoeCA+Pj4gMzEpIDw8IDE1XG4gICAgICB2YXIgZXhwID0gKCh4IDw8IDEpID4+PiAyNCkgLSAxMjdcbiAgICAgIHZhciBmcmFjID0gKHggPj4gMTMpICYgKCgxIDw8IDEwKSAtIDEpXG5cbiAgICAgIGlmIChleHAgPCAtMjQpIHtcbiAgICAgICAgLy8gcm91bmQgbm9uLXJlcHJlc2VudGFibGUgZGVub3JtYWxzIHRvIDBcbiAgICAgICAgdXNob3J0c1tpXSA9IHNnblxuICAgICAgfSBlbHNlIGlmIChleHAgPCAtMTQpIHtcbiAgICAgICAgLy8gaGFuZGxlIGRlbm9ybWFsc1xuICAgICAgICB2YXIgcyA9IC0xNCAtIGV4cFxuICAgICAgICB1c2hvcnRzW2ldID0gc2duICsgKChmcmFjICsgKDEgPDwgMTApKSA+PiBzKVxuICAgICAgfSBlbHNlIGlmIChleHAgPiAxNSkge1xuICAgICAgICAvLyByb3VuZCBvdmVyZmxvdyB0byArLy0gSW5maW5pdHlcbiAgICAgICAgdXNob3J0c1tpXSA9IHNnbiArIDB4N2MwMFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gb3RoZXJ3aXNlIGNvbnZlcnQgZGlyZWN0bHlcbiAgICAgICAgdXNob3J0c1tpXSA9IHNnbiArICgoZXhwICsgMTUpIDw8IDEwKSArIGZyYWNcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gdXNob3J0c1xufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAob2JqKSB7XG4gIHJldHVybiBPYmplY3Qua2V5cyhvYmopLm1hcChmdW5jdGlvbiAoa2V5KSB7IHJldHVybiBvYmpba2V5XSB9KVxufVxuIiwiLy8gQ29udGV4dCBhbmQgY2FudmFzIGNyZWF0aW9uIGhlbHBlciBmdW5jdGlvbnNcbnZhciBjaGVjayA9IHJlcXVpcmUoJy4vdXRpbC9jaGVjaycpXG52YXIgZXh0ZW5kID0gcmVxdWlyZSgnLi91dGlsL2V4dGVuZCcpXG5cbmZ1bmN0aW9uIGNyZWF0ZUNhbnZhcyAoZWxlbWVudCwgb25Eb25lLCBwaXhlbFJhdGlvKSB7XG4gIHZhciBjYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKVxuICBleHRlbmQoY2FudmFzLnN0eWxlLCB7XG4gICAgYm9yZGVyOiAwLFxuICAgIG1hcmdpbjogMCxcbiAgICBwYWRkaW5nOiAwLFxuICAgIHRvcDogMCxcbiAgICBsZWZ0OiAwXG4gIH0pXG4gIGVsZW1lbnQuYXBwZW5kQ2hpbGQoY2FudmFzKVxuXG4gIGlmIChlbGVtZW50ID09PSBkb2N1bWVudC5ib2R5KSB7XG4gICAgY2FudmFzLnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJ1xuICAgIGV4dGVuZChlbGVtZW50LnN0eWxlLCB7XG4gICAgICBtYXJnaW46IDAsXG4gICAgICBwYWRkaW5nOiAwXG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlc2l6ZSAoKSB7XG4gICAgdmFyIHcgPSB3aW5kb3cuaW5uZXJXaWR0aFxuICAgIHZhciBoID0gd2luZG93LmlubmVySGVpZ2h0XG4gICAgaWYgKGVsZW1lbnQgIT09IGRvY3VtZW50LmJvZHkpIHtcbiAgICAgIHZhciBib3VuZHMgPSBlbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpXG4gICAgICB3ID0gYm91bmRzLnJpZ2h0IC0gYm91bmRzLmxlZnRcbiAgICAgIGggPSBib3VuZHMuYm90dG9tIC0gYm91bmRzLnRvcFxuICAgIH1cbiAgICBjYW52YXMud2lkdGggPSBwaXhlbFJhdGlvICogd1xuICAgIGNhbnZhcy5oZWlnaHQgPSBwaXhlbFJhdGlvICogaFxuICAgIGV4dGVuZChjYW52YXMuc3R5bGUsIHtcbiAgICAgIHdpZHRoOiB3ICsgJ3B4JyxcbiAgICAgIGhlaWdodDogaCArICdweCdcbiAgICB9KVxuICB9XG5cbiAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIHJlc2l6ZSwgZmFsc2UpXG5cbiAgZnVuY3Rpb24gb25EZXN0cm95ICgpIHtcbiAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigncmVzaXplJywgcmVzaXplKVxuICAgIGVsZW1lbnQucmVtb3ZlQ2hpbGQoY2FudmFzKVxuICB9XG5cbiAgcmVzaXplKClcblxuICByZXR1cm4ge1xuICAgIGNhbnZhczogY2FudmFzLFxuICAgIG9uRGVzdHJveTogb25EZXN0cm95XG4gIH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlQ29udGV4dCAoY2FudmFzLCBjb250ZXhBdHRyaWJ1dGVzKSB7XG4gIGZ1bmN0aW9uIGdldCAobmFtZSkge1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gY2FudmFzLmdldENvbnRleHQobmFtZSwgY29udGV4QXR0cmlidXRlcylcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cbiAgfVxuICByZXR1cm4gKFxuICAgIGdldCgnd2ViZ2wnKSB8fFxuICAgIGdldCgnZXhwZXJpbWVudGFsLXdlYmdsJykgfHxcbiAgICBnZXQoJ3dlYmdsLWV4cGVyaW1lbnRhbCcpXG4gIClcbn1cblxuZnVuY3Rpb24gaXNIVE1MRWxlbWVudCAob2JqKSB7XG4gIHJldHVybiAoXG4gICAgdHlwZW9mIG9iai5ub2RlTmFtZSA9PT0gJ3N0cmluZycgJiZcbiAgICB0eXBlb2Ygb2JqLmFwcGVuZENoaWxkID09PSAnZnVuY3Rpb24nICYmXG4gICAgdHlwZW9mIG9iai5nZXRCb3VuZGluZ0NsaWVudFJlY3QgPT09ICdmdW5jdGlvbidcbiAgKVxufVxuXG5mdW5jdGlvbiBpc1dlYkdMQ29udGV4dCAob2JqKSB7XG4gIHJldHVybiAoXG4gICAgdHlwZW9mIG9iai5kcmF3QXJyYXlzID09PSAnZnVuY3Rpb24nIHx8XG4gICAgdHlwZW9mIG9iai5kcmF3RWxlbWVudHMgPT09ICdmdW5jdGlvbidcbiAgKVxufVxuXG5mdW5jdGlvbiBwYXJzZUV4dGVuc2lvbnMgKGlucHV0KSB7XG4gIGlmICh0eXBlb2YgaW5wdXQgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIGlucHV0LnNwbGl0KClcbiAgfVxuICBjaGVjayhBcnJheS5pc0FycmF5KGlucHV0KSwgJ2ludmFsaWQgZXh0ZW5zaW9uIGFycmF5JylcbiAgcmV0dXJuIGlucHV0XG59XG5cbmZ1bmN0aW9uIGdldEVsZW1lbnQgKGRlc2MpIHtcbiAgaWYgKHR5cGVvZiBkZXNjID09PSAnc3RyaW5nJykge1xuICAgIGNoZWNrKHR5cGVvZiBkb2N1bWVudCAhPT0gJ3VuZGVmaW5lZCcsICdub3Qgc3VwcG9ydGVkIG91dHNpZGUgb2YgRE9NJylcbiAgICByZXR1cm4gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihkZXNjKVxuICB9XG4gIHJldHVybiBkZXNjXG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcGFyc2VBcmdzIChhcmdzXykge1xuICB2YXIgYXJncyA9IGFyZ3NfIHx8IHt9XG4gIHZhciBlbGVtZW50LCBjb250YWluZXIsIGNhbnZhcywgZ2xcbiAgdmFyIGNvbnRleHRBdHRyaWJ1dGVzID0ge31cbiAgdmFyIGV4dGVuc2lvbnMgPSBbXVxuICB2YXIgb3B0aW9uYWxFeHRlbnNpb25zID0gW11cbiAgdmFyIHBpeGVsUmF0aW8gPSAodHlwZW9mIHdpbmRvdyA9PT0gJ3VuZGVmaW5lZCcgPyAxIDogd2luZG93LmRldmljZVBpeGVsUmF0aW8pXG4gIHZhciBwcm9maWxlID0gZmFsc2VcbiAgdmFyIG9uRG9uZSA9IGZ1bmN0aW9uIChlcnIpIHtcbiAgICBpZiAoZXJyKSB7XG4gICAgICBjaGVjay5yYWlzZShlcnIpXG4gICAgfVxuICB9XG4gIHZhciBvbkRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7fVxuICBpZiAodHlwZW9mIGFyZ3MgPT09ICdzdHJpbmcnKSB7XG4gICAgY2hlY2soXG4gICAgICB0eXBlb2YgZG9jdW1lbnQgIT09ICd1bmRlZmluZWQnLFxuICAgICAgJ3NlbGVjdG9yIHF1ZXJpZXMgb25seSBzdXBwb3J0ZWQgaW4gRE9NIGVudmlyb21lbnRzJylcbiAgICBlbGVtZW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihhcmdzKVxuICAgIGNoZWNrKGVsZW1lbnQsICdpbnZhbGlkIHF1ZXJ5IHN0cmluZyBmb3IgZWxlbWVudCcpXG4gIH0gZWxzZSBpZiAodHlwZW9mIGFyZ3MgPT09ICdvYmplY3QnKSB7XG4gICAgaWYgKGlzSFRNTEVsZW1lbnQoYXJncykpIHtcbiAgICAgIGVsZW1lbnQgPSBhcmdzXG4gICAgfSBlbHNlIGlmIChpc1dlYkdMQ29udGV4dChhcmdzKSkge1xuICAgICAgZ2wgPSBhcmdzXG4gICAgICBjYW52YXMgPSBnbC5jYW52YXNcbiAgICB9IGVsc2Uge1xuICAgICAgY2hlY2suY29uc3RydWN0b3IoYXJncylcbiAgICAgIGlmICgnZ2wnIGluIGFyZ3MpIHtcbiAgICAgICAgZ2wgPSBhcmdzLmdsXG4gICAgICB9IGVsc2UgaWYgKCdjYW52YXMnIGluIGFyZ3MpIHtcbiAgICAgICAgY2FudmFzID0gZ2V0RWxlbWVudChhcmdzLmNhbnZhcylcbiAgICAgIH0gZWxzZSBpZiAoJ2NvbnRhaW5lcicgaW4gYXJncykge1xuICAgICAgICBjb250YWluZXIgPSBnZXRFbGVtZW50KGFyZ3MuY29udGFpbmVyKVxuICAgICAgfVxuICAgICAgaWYgKCdhdHRyaWJ1dGVzJyBpbiBhcmdzKSB7XG4gICAgICAgIGNvbnRleHRBdHRyaWJ1dGVzID0gYXJncy5hdHRyaWJ1dGVzXG4gICAgICAgIGNoZWNrLnR5cGUoY29udGV4dEF0dHJpYnV0ZXMsICdvYmplY3QnLCAnaW52YWxpZCBjb250ZXh0IGF0dHJpYnV0ZXMnKVxuICAgICAgfVxuICAgICAgaWYgKCdleHRlbnNpb25zJyBpbiBhcmdzKSB7XG4gICAgICAgIGV4dGVuc2lvbnMgPSBwYXJzZUV4dGVuc2lvbnMoYXJncy5leHRlbnNpb25zKVxuICAgICAgfVxuICAgICAgaWYgKCdvcHRpb25hbEV4dGVuc2lvbnMnIGluIGFyZ3MpIHtcbiAgICAgICAgb3B0aW9uYWxFeHRlbnNpb25zID0gcGFyc2VFeHRlbnNpb25zKGFyZ3Mub3B0aW9uYWxFeHRlbnNpb25zKVxuICAgICAgfVxuICAgICAgaWYgKCdvbkRvbmUnIGluIGFyZ3MpIHtcbiAgICAgICAgY2hlY2sudHlwZShcbiAgICAgICAgICBhcmdzLm9uRG9uZSwgJ2Z1bmN0aW9uJyxcbiAgICAgICAgICAnaW52YWxpZCBvciBtaXNzaW5nIG9uRG9uZSBjYWxsYmFjaycpXG4gICAgICAgIG9uRG9uZSA9IGFyZ3Mub25Eb25lXG4gICAgICB9XG4gICAgICBpZiAoJ3Byb2ZpbGUnIGluIGFyZ3MpIHtcbiAgICAgICAgcHJvZmlsZSA9ICEhYXJncy5wcm9maWxlXG4gICAgICB9XG4gICAgICBpZiAoJ3BpeGVsUmF0aW8nIGluIGFyZ3MpIHtcbiAgICAgICAgcGl4ZWxSYXRpbyA9ICthcmdzLnBpeGVsUmF0aW9cbiAgICAgICAgY2hlY2socGl4ZWxSYXRpbyA+IDAsICdpbnZhbGlkIHBpeGVsIHJhdGlvJylcbiAgICAgIH1cbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgY2hlY2sucmFpc2UoJ2ludmFsaWQgYXJndW1lbnRzIHRvIHJlZ2wnKVxuICB9XG5cbiAgaWYgKGVsZW1lbnQpIHtcbiAgICBpZiAoZWxlbWVudC5ub2RlTmFtZS50b0xvd2VyQ2FzZSgpID09PSAnY2FudmFzJykge1xuICAgICAgY2FudmFzID0gZWxlbWVudFxuICAgIH0gZWxzZSB7XG4gICAgICBjb250YWluZXIgPSBlbGVtZW50XG4gICAgfVxuICB9XG5cbiAgaWYgKCFnbCkge1xuICAgIGlmICghY2FudmFzKSB7XG4gICAgICBjaGVjayhcbiAgICAgICAgdHlwZW9mIGRvY3VtZW50ICE9PSAndW5kZWZpbmVkJyxcbiAgICAgICAgJ211c3QgbWFudWFsbHkgc3BlY2lmeSB3ZWJnbCBjb250ZXh0IG91dHNpZGUgb2YgRE9NIGVudmlyb25tZW50cycpXG4gICAgICB2YXIgcmVzdWx0ID0gY3JlYXRlQ2FudmFzKGNvbnRhaW5lciB8fCBkb2N1bWVudC5ib2R5LCBvbkRvbmUsIHBpeGVsUmF0aW8pXG4gICAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgICByZXR1cm4gbnVsbFxuICAgICAgfVxuICAgICAgY2FudmFzID0gcmVzdWx0LmNhbnZhc1xuICAgICAgb25EZXN0cm95ID0gcmVzdWx0Lm9uRGVzdHJveVxuICAgIH1cbiAgICBnbCA9IGNyZWF0ZUNvbnRleHQoY2FudmFzLCBjb250ZXh0QXR0cmlidXRlcylcbiAgfVxuXG4gIGlmICghZ2wpIHtcbiAgICBvbkRlc3Ryb3koKVxuICAgIG9uRG9uZSgnd2ViZ2wgbm90IHN1cHBvcnRlZCwgdHJ5IHVwZ3JhZGluZyB5b3VyIGJyb3dzZXIgb3IgZ3JhcGhpY3MgZHJpdmVycyBodHRwOi8vZ2V0LndlYmdsLm9yZycpXG4gICAgcmV0dXJuIG51bGxcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgZ2w6IGdsLFxuICAgIGNhbnZhczogY2FudmFzLFxuICAgIGNvbnRhaW5lcjogY29udGFpbmVyLFxuICAgIGV4dGVuc2lvbnM6IGV4dGVuc2lvbnMsXG4gICAgb3B0aW9uYWxFeHRlbnNpb25zOiBvcHRpb25hbEV4dGVuc2lvbnMsXG4gICAgcGl4ZWxSYXRpbzogcGl4ZWxSYXRpbyxcbiAgICBwcm9maWxlOiBwcm9maWxlLFxuICAgIG9uRG9uZTogb25Eb25lLFxuICAgIG9uRGVzdHJveTogb25EZXN0cm95XG4gIH1cbn1cbiIsIi8qIGdsb2JhbCBYTUxIdHRwUmVxdWVzdCAqL1xudmFyIGNvbmZpZ1BhcmFtZXRlcnMgPSBbXG4gICdtYW5pZmVzdCcsXG4gICdvbkRvbmUnLFxuICAnb25Qcm9ncmVzcycsXG4gICdvbkVycm9yJ1xuXVxuXG52YXIgbWFuaWZlc3RQYXJhbWV0ZXJzID0gW1xuICAndHlwZScsXG4gICdzcmMnLFxuICAnc3RyZWFtJyxcbiAgJ2NyZWRlbnRpYWxzJyxcbiAgJ3BhcnNlcidcbl1cblxudmFyIHBhcnNlclBhcmFtZXRlcnMgPSBbXG4gICdvbkRhdGEnLFxuICAnb25Eb25lJ1xuXVxuXG52YXIgU1RBVEVfRVJST1IgPSAtMVxudmFyIFNUQVRFX0RBVEEgPSAwXG52YXIgU1RBVEVfQ09NUExFVEUgPSAxXG5cbmZ1bmN0aW9uIHJhaXNlIChtZXNzYWdlKSB7XG4gIHRocm93IG5ldyBFcnJvcigncmVzbDogJyArIG1lc3NhZ2UpXG59XG5cbmZ1bmN0aW9uIGNoZWNrVHlwZSAob2JqZWN0LCBwYXJhbWV0ZXJzLCBuYW1lKSB7XG4gIE9iamVjdC5rZXlzKG9iamVjdCkuZm9yRWFjaChmdW5jdGlvbiAocGFyYW0pIHtcbiAgICBpZiAocGFyYW1ldGVycy5pbmRleE9mKHBhcmFtKSA8IDApIHtcbiAgICAgIHJhaXNlKCdpbnZhbGlkIHBhcmFtZXRlciBcIicgKyBwYXJhbSArICdcIiBpbiAnICsgbmFtZSlcbiAgICB9XG4gIH0pXG59XG5cbmZ1bmN0aW9uIExvYWRlciAobmFtZSwgY2FuY2VsKSB7XG4gIHRoaXMuc3RhdGUgPSBTVEFURV9EQVRBXG4gIHRoaXMucmVhZHkgPSBmYWxzZVxuICB0aGlzLnByb2dyZXNzID0gMFxuICB0aGlzLm5hbWUgPSBuYW1lXG4gIHRoaXMuY2FuY2VsID0gY2FuY2VsXG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcmVzbCAoY29uZmlnKSB7XG4gIGlmICh0eXBlb2YgY29uZmlnICE9PSAnb2JqZWN0JyB8fCAhY29uZmlnKSB7XG4gICAgcmFpc2UoJ2ludmFsaWQgb3IgbWlzc2luZyBjb25maWd1cmF0aW9uJylcbiAgfVxuXG4gIGNoZWNrVHlwZShjb25maWcsIGNvbmZpZ1BhcmFtZXRlcnMsICdjb25maWcnKVxuXG4gIHZhciBtYW5pZmVzdCA9IGNvbmZpZy5tYW5pZmVzdFxuICBpZiAodHlwZW9mIG1hbmlmZXN0ICE9PSAnb2JqZWN0JyB8fCAhbWFuaWZlc3QpIHtcbiAgICByYWlzZSgnbWlzc2luZyBtYW5pZmVzdCcpXG4gIH1cblxuICBmdW5jdGlvbiBnZXRGdW5jdGlvbiAobmFtZSwgZGZsdCkge1xuICAgIGlmIChuYW1lIGluIGNvbmZpZykge1xuICAgICAgdmFyIGZ1bmMgPSBjb25maWdbbmFtZV1cbiAgICAgIGlmICh0eXBlb2YgZnVuYyAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICByYWlzZSgnaW52YWxpZCBjYWxsYmFjayBcIicgKyBuYW1lICsgJ1wiJylcbiAgICAgIH1cbiAgICAgIHJldHVybiBmdW5jXG4gICAgfVxuICAgIHJldHVybiBudWxsXG4gIH1cblxuICB2YXIgb25Eb25lID0gZ2V0RnVuY3Rpb24oJ29uRG9uZScpXG4gIGlmICghb25Eb25lKSB7XG4gICAgcmFpc2UoJ21pc3Npbmcgb25Eb25lKCkgY2FsbGJhY2snKVxuICB9XG5cbiAgdmFyIG9uUHJvZ3Jlc3MgPSBnZXRGdW5jdGlvbignb25Qcm9ncmVzcycpXG4gIHZhciBvbkVycm9yID0gZ2V0RnVuY3Rpb24oJ29uRXJyb3InKVxuXG4gIHZhciBhc3NldHMgPSB7fVxuXG4gIHZhciBzdGF0ZSA9IFNUQVRFX0RBVEFcblxuICBmdW5jdGlvbiBsb2FkWEhSIChyZXF1ZXN0KSB7XG4gICAgdmFyIG5hbWUgPSByZXF1ZXN0Lm5hbWVcbiAgICB2YXIgc3RyZWFtID0gcmVxdWVzdC5zdHJlYW1cbiAgICB2YXIgYmluYXJ5ID0gcmVxdWVzdC50eXBlID09PSAnYmluYXJ5J1xuICAgIHZhciBwYXJzZXIgPSByZXF1ZXN0LnBhcnNlclxuXG4gICAgdmFyIHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpXG4gICAgdmFyIGFzc2V0ID0gbnVsbFxuXG4gICAgdmFyIGxvYWRlciA9IG5ldyBMb2FkZXIobmFtZSwgY2FuY2VsKVxuXG4gICAgaWYgKHN0cmVhbSkge1xuICAgICAgeGhyLm9ucmVhZHlzdGF0ZWNoYW5nZSA9IG9uUmVhZHlTdGF0ZUNoYW5nZVxuICAgIH0gZWxzZSB7XG4gICAgICB4aHIub25yZWFkeXN0YXRlY2hhbmdlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAoeGhyLnJlYWR5U3RhdGUgPT09IDQpIHtcbiAgICAgICAgICBvblJlYWR5U3RhdGVDaGFuZ2UoKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGJpbmFyeSkge1xuICAgICAgeGhyLnJlc3BvbnNlVHlwZSA9ICdhcnJheWJ1ZmZlcidcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBvblJlYWR5U3RhdGVDaGFuZ2UgKCkge1xuICAgICAgaWYgKHhoci5yZWFkeVN0YXRlIDwgMiB8fFxuICAgICAgICAgIGxvYWRlci5zdGF0ZSA9PT0gU1RBVEVfQ09NUExFVEUgfHxcbiAgICAgICAgICBsb2FkZXIuc3RhdGUgPT09IFNUQVRFX0VSUk9SKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgaWYgKHhoci5zdGF0dXMgIT09IDIwMCkge1xuICAgICAgICByZXR1cm4gYWJvcnQoJ2Vycm9yIGxvYWRpbmcgcmVzb3VyY2UgXCInICsgcmVxdWVzdC5uYW1lICsgJ1wiJylcbiAgICAgIH1cbiAgICAgIGlmICh4aHIucmVhZHlTdGF0ZSA+IDIgJiYgbG9hZGVyLnN0YXRlID09PSBTVEFURV9EQVRBKSB7XG4gICAgICAgIHZhciByZXNwb25zZVxuICAgICAgICBpZiAocmVxdWVzdC50eXBlID09PSAnYmluYXJ5Jykge1xuICAgICAgICAgIHJlc3BvbnNlID0geGhyLnJlc3BvbnNlXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmVzcG9uc2UgPSB4aHIucmVzcG9uc2VUZXh0XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHBhcnNlci5kYXRhKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGFzc2V0ID0gcGFyc2VyLmRhdGEocmVzcG9uc2UpXG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgcmV0dXJuIGFib3J0KGUpXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGFzc2V0ID0gcmVzcG9uc2VcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKHhoci5yZWFkeVN0YXRlID4gMyAmJiBsb2FkZXIuc3RhdGUgPT09IFNUQVRFX0RBVEEpIHtcbiAgICAgICAgaWYgKHBhcnNlci5kb25lKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGFzc2V0ID0gcGFyc2VyLmRvbmUoKVxuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIHJldHVybiBhYm9ydChlKVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBsb2FkZXIuc3RhdGUgPSBTVEFURV9DT01QTEVURVxuICAgICAgfVxuICAgICAgYXNzZXRzW25hbWVdID0gYXNzZXRcbiAgICAgIGxvYWRlci5wcm9ncmVzcyA9IDAuNzUgKiBsb2FkZXIucHJvZ3Jlc3MgKyAwLjI1XG4gICAgICBsb2FkZXIucmVhZHkgPVxuICAgICAgICAocmVxdWVzdC5zdHJlYW0gJiYgISFhc3NldCkgfHxcbiAgICAgICAgbG9hZGVyLnN0YXRlID09PSBTVEFURV9DT01QTEVURVxuICAgICAgbm90aWZ5UHJvZ3Jlc3MoKVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNhbmNlbCAoKSB7XG4gICAgICBpZiAobG9hZGVyLnN0YXRlID09PSBTVEFURV9DT01QTEVURSB8fCBsb2FkZXIuc3RhdGUgPT09IFNUQVRFX0VSUk9SKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgeGhyLm9ucmVhZHlzdGF0ZWNoYW5nZSA9IG51bGxcbiAgICAgIHhoci5hYm9ydCgpXG4gICAgICBsb2FkZXIuc3RhdGUgPSBTVEFURV9FUlJPUlxuICAgIH1cblxuICAgIC8vIHNldCB1cCByZXF1ZXN0XG4gICAgaWYgKHJlcXVlc3QuY3JlZGVudGlhbHMpIHtcbiAgICAgIHhoci53aXRoQ3JlZGVudGlhbHMgPSB0cnVlXG4gICAgfVxuICAgIHhoci5vcGVuKCdHRVQnLCByZXF1ZXN0LnNyYywgdHJ1ZSlcbiAgICB4aHIuc2VuZCgpXG5cbiAgICByZXR1cm4gbG9hZGVyXG4gIH1cblxuICBmdW5jdGlvbiBsb2FkRWxlbWVudCAocmVxdWVzdCwgZWxlbWVudCkge1xuICAgIHZhciBuYW1lID0gcmVxdWVzdC5uYW1lXG4gICAgdmFyIHBhcnNlciA9IHJlcXVlc3QucGFyc2VyXG5cbiAgICB2YXIgbG9hZGVyID0gbmV3IExvYWRlcihuYW1lLCBjYW5jZWwpXG4gICAgdmFyIGFzc2V0ID0gZWxlbWVudFxuXG4gICAgZnVuY3Rpb24gaGFuZGxlUHJvZ3Jlc3MgKCkge1xuICAgICAgaWYgKGxvYWRlci5zdGF0ZSA9PT0gU1RBVEVfREFUQSkge1xuICAgICAgICBpZiAocGFyc2VyLmRhdGEpIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXNzZXQgPSBwYXJzZXIuZGF0YShlbGVtZW50KVxuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIHJldHVybiBhYm9ydChlKVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBhc3NldCA9IGVsZW1lbnRcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIG9uUHJvZ3Jlc3MgKGUpIHtcbiAgICAgIGhhbmRsZVByb2dyZXNzKClcbiAgICAgIGFzc2V0c1tuYW1lXSA9IGFzc2V0XG4gICAgICBpZiAoZS5sZW5ndGhDb21wdXRhYmxlKSB7XG4gICAgICAgIGxvYWRlci5wcm9ncmVzcyA9IE1hdGgubWF4KGxvYWRlci5wcm9ncmVzcywgZS5sb2FkZWQgLyBlLnRvdGFsKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbG9hZGVyLnByb2dyZXNzID0gMC43NSAqIGxvYWRlci5wcm9ncmVzcyArIDAuMjVcbiAgICAgIH1cbiAgICAgIG5vdGlmeVByb2dyZXNzKG5hbWUpXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gb25Db21wbGV0ZSAoKSB7XG4gICAgICBoYW5kbGVQcm9ncmVzcygpXG4gICAgICBpZiAobG9hZGVyLnN0YXRlID09PSBTVEFURV9EQVRBKSB7XG4gICAgICAgIGlmIChwYXJzZXIuZG9uZSkge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhc3NldCA9IHBhcnNlci5kb25lKClcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICByZXR1cm4gYWJvcnQoZSlcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgbG9hZGVyLnN0YXRlID0gU1RBVEVfQ09NUExFVEVcbiAgICAgIH1cbiAgICAgIGxvYWRlci5wcm9ncmVzcyA9IDFcbiAgICAgIGxvYWRlci5yZWFkeSA9IHRydWVcbiAgICAgIGFzc2V0c1tuYW1lXSA9IGFzc2V0XG4gICAgICByZW1vdmVMaXN0ZW5lcnMoKVxuICAgICAgbm90aWZ5UHJvZ3Jlc3MoJ2ZpbmlzaCAnICsgbmFtZSlcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBvbkVycm9yICgpIHtcbiAgICAgIGFib3J0KCdlcnJvciBsb2FkaW5nIGFzc2V0IFwiJyArIG5hbWUgKyAnXCInKVxuICAgIH1cblxuICAgIGlmIChyZXF1ZXN0LnN0cmVhbSkge1xuICAgICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdwcm9ncmVzcycsIG9uUHJvZ3Jlc3MpXG4gICAgfVxuICAgIGlmIChyZXF1ZXN0LnR5cGUgPT09ICdpbWFnZScpIHtcbiAgICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbG9hZCcsIG9uQ29tcGxldGUpXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBjYW5QbGF5ID0gZmFsc2VcbiAgICAgIHZhciBsb2FkZWRNZXRhRGF0YSA9IGZhbHNlXG4gICAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2xvYWRlZG1ldGFkYXRhJywgZnVuY3Rpb24gKCkge1xuICAgICAgICBsb2FkZWRNZXRhRGF0YSA9IHRydWVcbiAgICAgICAgaWYgKGNhblBsYXkpIHtcbiAgICAgICAgICBvbkNvbXBsZXRlKClcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2FucGxheScsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgY2FuUGxheSA9IHRydWVcbiAgICAgICAgaWYgKGxvYWRlZE1ldGFEYXRhKSB7XG4gICAgICAgICAgb25Db21wbGV0ZSgpXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgfVxuICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignZXJyb3InLCBvbkVycm9yKVxuXG4gICAgZnVuY3Rpb24gcmVtb3ZlTGlzdGVuZXJzICgpIHtcbiAgICAgIGlmIChyZXF1ZXN0LnN0cmVhbSkge1xuICAgICAgICBlbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3Byb2dyZXNzJywgb25Qcm9ncmVzcylcbiAgICAgIH1cbiAgICAgIGlmIChyZXF1ZXN0LnR5cGUgPT09ICdpbWFnZScpIHtcbiAgICAgICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdsb2FkJywgb25Db21wbGV0ZSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2FucGxheScsIG9uQ29tcGxldGUpXG4gICAgICB9XG4gICAgICBlbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2Vycm9yJywgb25FcnJvcilcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjYW5jZWwgKCkge1xuICAgICAgaWYgKGxvYWRlci5zdGF0ZSA9PT0gU1RBVEVfQ09NUExFVEUgfHwgbG9hZGVyLnN0YXRlID09PSBTVEFURV9FUlJPUikge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIGxvYWRlci5zdGF0ZSA9IFNUQVRFX0VSUk9SXG4gICAgICByZW1vdmVMaXN0ZW5lcnMoKVxuICAgICAgZWxlbWVudC5zcmMgPSAnJ1xuICAgIH1cblxuICAgIC8vIHNldCB1cCByZXF1ZXN0XG4gICAgaWYgKHJlcXVlc3QuY3JlZGVudGlhbHMpIHtcbiAgICAgIGVsZW1lbnQuY3Jvc3NPcmlnaW4gPSAndXNlLWNyZWRlbnRpYWxzJ1xuICAgIH0gZWxzZSB7XG4gICAgICBlbGVtZW50LmNyb3NzT3JpZ2luID0gJ2Fub255bW91cydcbiAgICB9XG4gICAgZWxlbWVudC5zcmMgPSByZXF1ZXN0LnNyY1xuXG4gICAgcmV0dXJuIGxvYWRlclxuICB9XG5cbiAgdmFyIGxvYWRlcnMgPSB7XG4gICAgdGV4dDogbG9hZFhIUixcbiAgICBiaW5hcnk6IGZ1bmN0aW9uIChyZXF1ZXN0KSB7XG4gICAgICAvLyBUT0RPIHVzZSBmZXRjaCBBUEkgZm9yIHN0cmVhbWluZyBpZiBzdXBwb3J0ZWRcbiAgICAgIHJldHVybiBsb2FkWEhSKHJlcXVlc3QpXG4gICAgfSxcbiAgICBpbWFnZTogZnVuY3Rpb24gKHJlcXVlc3QpIHtcbiAgICAgIHJldHVybiBsb2FkRWxlbWVudChyZXF1ZXN0LCBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdpbWcnKSlcbiAgICB9LFxuICAgIHZpZGVvOiBmdW5jdGlvbiAocmVxdWVzdCkge1xuICAgICAgcmV0dXJuIGxvYWRFbGVtZW50KHJlcXVlc3QsIGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3ZpZGVvJykpXG4gICAgfSxcbiAgICBhdWRpbzogZnVuY3Rpb24gKHJlcXVlc3QpIHtcbiAgICAgIHJldHVybiBsb2FkRWxlbWVudChyZXF1ZXN0LCBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhdWRpbycpKVxuICAgIH1cbiAgfVxuXG4gIC8vIEZpcnN0IHdlIHBhcnNlIGFsbCBvYmplY3RzIGluIG9yZGVyIHRvIHZlcmlmeSB0aGF0IGFsbCB0eXBlIGluZm9ybWF0aW9uXG4gIC8vIGlzIGNvcnJlY3RcbiAgdmFyIHBlbmRpbmcgPSBPYmplY3Qua2V5cyhtYW5pZmVzdCkubWFwKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdmFyIHJlcXVlc3QgPSBtYW5pZmVzdFtuYW1lXVxuICAgIGlmICh0eXBlb2YgcmVxdWVzdCA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHJlcXVlc3QgPSB7XG4gICAgICAgIHNyYzogcmVxdWVzdFxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAodHlwZW9mIHJlcXVlc3QgIT09ICdvYmplY3QnIHx8ICFyZXF1ZXN0KSB7XG4gICAgICByYWlzZSgnaW52YWxpZCBhc3NldCBkZWZpbml0aW9uIFwiJyArIG5hbWUgKyAnXCInKVxuICAgIH1cblxuICAgIGNoZWNrVHlwZShyZXF1ZXN0LCBtYW5pZmVzdFBhcmFtZXRlcnMsICdhc3NldCBcIicgKyBuYW1lICsgJ1wiJylcblxuICAgIGZ1bmN0aW9uIGdldFBhcmFtZXRlciAocHJvcCwgYWNjZXB0ZWQsIGluaXQpIHtcbiAgICAgIHZhciB2YWx1ZSA9IGluaXRcbiAgICAgIGlmIChwcm9wIGluIHJlcXVlc3QpIHtcbiAgICAgICAgdmFsdWUgPSByZXF1ZXN0W3Byb3BdXG4gICAgICB9XG4gICAgICBpZiAoYWNjZXB0ZWQuaW5kZXhPZih2YWx1ZSkgPCAwKSB7XG4gICAgICAgIHJhaXNlKCdpbnZhbGlkICcgKyBwcm9wICsgJyBcIicgKyB2YWx1ZSArICdcIiBmb3IgYXNzZXQgXCInICsgbmFtZSArICdcIiwgcG9zc2libGUgdmFsdWVzOiAnICsgYWNjZXB0ZWQpXG4gICAgICB9XG4gICAgICByZXR1cm4gdmFsdWVcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRTdHJpbmcgKHByb3AsIHJlcXVpcmVkLCBpbml0KSB7XG4gICAgICB2YXIgdmFsdWUgPSBpbml0XG4gICAgICBpZiAocHJvcCBpbiByZXF1ZXN0KSB7XG4gICAgICAgIHZhbHVlID0gcmVxdWVzdFtwcm9wXVxuICAgICAgfSBlbHNlIGlmIChyZXF1aXJlZCkge1xuICAgICAgICByYWlzZSgnbWlzc2luZyAnICsgcHJvcCArICcgZm9yIGFzc2V0IFwiJyArIG5hbWUgKyAnXCInKVxuICAgICAgfVxuICAgICAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgcmFpc2UoJ2ludmFsaWQgJyArIHByb3AgKyAnIGZvciBhc3NldCBcIicgKyBuYW1lICsgJ1wiLCBtdXN0IGJlIGEgc3RyaW5nJylcbiAgICAgIH1cbiAgICAgIHJldHVybiB2YWx1ZVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldFBhcnNlRnVuYyAobmFtZSwgZGZsdCkge1xuICAgICAgaWYgKG5hbWUgaW4gcmVxdWVzdC5wYXJzZXIpIHtcbiAgICAgICAgdmFyIHJlc3VsdCA9IHJlcXVlc3QucGFyc2VyW25hbWVdXG4gICAgICAgIGlmICh0eXBlb2YgcmVzdWx0ICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgcmFpc2UoJ2ludmFsaWQgcGFyc2VyIGNhbGxiYWNrICcgKyBuYW1lICsgJyBmb3IgYXNzZXQgXCInICsgbmFtZSArICdcIicpXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGRmbHRcbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgcGFyc2VyID0ge31cbiAgICBpZiAoJ3BhcnNlcicgaW4gcmVxdWVzdCkge1xuICAgICAgaWYgKHR5cGVvZiByZXF1ZXN0LnBhcnNlciA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBwYXJzZXIgPSB7XG4gICAgICAgICAgZGF0YTogcmVxdWVzdC5wYXJzZXJcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgcmVxdWVzdC5wYXJzZXIgPT09ICdvYmplY3QnICYmIHJlcXVlc3QucGFyc2VyKSB7XG4gICAgICAgIGNoZWNrVHlwZShwYXJzZXIsIHBhcnNlclBhcmFtZXRlcnMsICdwYXJzZXIgZm9yIGFzc2V0IFwiJyArIG5hbWUgKyAnXCInKVxuICAgICAgICBpZiAoISgnb25EYXRhJyBpbiBwYXJzZXIpKSB7XG4gICAgICAgICAgcmFpc2UoJ21pc3Npbmcgb25EYXRhIGNhbGxiYWNrIGZvciBwYXJzZXIgaW4gYXNzZXQgXCInICsgbmFtZSArICdcIicpXG4gICAgICAgIH1cbiAgICAgICAgcGFyc2VyID0ge1xuICAgICAgICAgIGRhdGE6IGdldFBhcnNlRnVuYygnb25EYXRhJyksXG4gICAgICAgICAgZG9uZTogZ2V0UGFyc2VGdW5jKCdvbkRvbmUnKVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByYWlzZSgnaW52YWxpZCBwYXJzZXIgZm9yIGFzc2V0IFwiJyArIG5hbWUgKyAnXCInKVxuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBuYW1lOiBuYW1lLFxuICAgICAgdHlwZTogZ2V0UGFyYW1ldGVyKCd0eXBlJywgT2JqZWN0LmtleXMobG9hZGVycyksICd0ZXh0JyksXG4gICAgICBzdHJlYW06ICEhcmVxdWVzdC5zdHJlYW0sXG4gICAgICBjcmVkZW50aWFsczogISFyZXF1ZXN0LmNyZWRlbnRpYWxzLFxuICAgICAgc3JjOiBnZXRTdHJpbmcoJ3NyYycsIHRydWUsICcnKSxcbiAgICAgIHBhcnNlcjogcGFyc2VyXG4gICAgfVxuICB9KS5tYXAoZnVuY3Rpb24gKHJlcXVlc3QpIHtcbiAgICByZXR1cm4gKGxvYWRlcnNbcmVxdWVzdC50eXBlXSkocmVxdWVzdClcbiAgfSlcblxuICBmdW5jdGlvbiBhYm9ydCAobWVzc2FnZSkge1xuICAgIGlmIChzdGF0ZSA9PT0gU1RBVEVfRVJST1IgfHwgc3RhdGUgPT09IFNUQVRFX0NPTVBMRVRFKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgc3RhdGUgPSBTVEFURV9FUlJPUlxuICAgIHBlbmRpbmcuZm9yRWFjaChmdW5jdGlvbiAobG9hZGVyKSB7XG4gICAgICBsb2FkZXIuY2FuY2VsKClcbiAgICB9KVxuICAgIGlmIChvbkVycm9yKSB7XG4gICAgICBpZiAodHlwZW9mIG1lc3NhZ2UgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIG9uRXJyb3IobmV3IEVycm9yKCdyZXNsOiAnICsgbWVzc2FnZSkpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBvbkVycm9yKG1lc3NhZ2UpXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ3Jlc2wgZXJyb3I6JywgbWVzc2FnZSlcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBub3RpZnlQcm9ncmVzcyAobWVzc2FnZSkge1xuICAgIGlmIChzdGF0ZSA9PT0gU1RBVEVfRVJST1IgfHwgc3RhdGUgPT09IFNUQVRFX0NPTVBMRVRFKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICB2YXIgcHJvZ3Jlc3MgPSAwXG4gICAgdmFyIG51bVJlYWR5ID0gMFxuICAgIHBlbmRpbmcuZm9yRWFjaChmdW5jdGlvbiAobG9hZGVyKSB7XG4gICAgICBpZiAobG9hZGVyLnJlYWR5KSB7XG4gICAgICAgIG51bVJlYWR5ICs9IDFcbiAgICAgIH1cbiAgICAgIHByb2dyZXNzICs9IGxvYWRlci5wcm9ncmVzc1xuICAgIH0pXG5cbiAgICBpZiAobnVtUmVhZHkgPT09IHBlbmRpbmcubGVuZ3RoKSB7XG4gICAgICBzdGF0ZSA9IFNUQVRFX0NPTVBMRVRFXG4gICAgICBvbkRvbmUoYXNzZXRzKVxuICAgIH0gZWxzZSB7XG4gICAgICBpZiAob25Qcm9ncmVzcykge1xuICAgICAgICBvblByb2dyZXNzKHByb2dyZXNzIC8gcGVuZGluZy5sZW5ndGgsIG1lc3NhZ2UpXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgaWYgKHBlbmRpbmcubGVuZ3RoID09PSAwKSB7XG4gICAgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICBub3RpZnlQcm9ncmVzcygnZG9uZScpXG4gICAgfSwgMSlcbiAgfVxufVxuIiwidmFyIGNoZWNrID0gcmVxdWlyZSgnLi9saWIvdXRpbC9jaGVjaycpXG52YXIgZXh0ZW5kID0gcmVxdWlyZSgnLi9saWIvdXRpbC9leHRlbmQnKVxudmFyIGR5bmFtaWMgPSByZXF1aXJlKCcuL2xpYi9keW5hbWljJylcbnZhciByYWYgPSByZXF1aXJlKCcuL2xpYi91dGlsL3JhZicpXG52YXIgY2xvY2sgPSByZXF1aXJlKCcuL2xpYi91dGlsL2Nsb2NrJylcbnZhciBjcmVhdGVTdHJpbmdTdG9yZSA9IHJlcXVpcmUoJy4vbGliL3N0cmluZ3MnKVxudmFyIGluaXRXZWJHTCA9IHJlcXVpcmUoJy4vbGliL3dlYmdsJylcbnZhciB3cmFwRXh0ZW5zaW9ucyA9IHJlcXVpcmUoJy4vbGliL2V4dGVuc2lvbicpXG52YXIgd3JhcExpbWl0cyA9IHJlcXVpcmUoJy4vbGliL2xpbWl0cycpXG52YXIgd3JhcEJ1ZmZlcnMgPSByZXF1aXJlKCcuL2xpYi9idWZmZXInKVxudmFyIHdyYXBFbGVtZW50cyA9IHJlcXVpcmUoJy4vbGliL2VsZW1lbnRzJylcbnZhciB3cmFwVGV4dHVyZXMgPSByZXF1aXJlKCcuL2xpYi90ZXh0dXJlJylcbnZhciB3cmFwUmVuZGVyYnVmZmVycyA9IHJlcXVpcmUoJy4vbGliL3JlbmRlcmJ1ZmZlcicpXG52YXIgd3JhcEZyYW1lYnVmZmVycyA9IHJlcXVpcmUoJy4vbGliL2ZyYW1lYnVmZmVyJylcbnZhciB3cmFwQXR0cmlidXRlcyA9IHJlcXVpcmUoJy4vbGliL2F0dHJpYnV0ZScpXG52YXIgd3JhcFNoYWRlcnMgPSByZXF1aXJlKCcuL2xpYi9zaGFkZXInKVxudmFyIHdyYXBSZWFkID0gcmVxdWlyZSgnLi9saWIvcmVhZCcpXG52YXIgY3JlYXRlQ29yZSA9IHJlcXVpcmUoJy4vbGliL2NvcmUnKVxudmFyIGNyZWF0ZVN0YXRzID0gcmVxdWlyZSgnLi9saWIvc3RhdHMnKVxudmFyIGNyZWF0ZVRpbWVyID0gcmVxdWlyZSgnLi9saWIvdGltZXInKVxuXG52YXIgR0xfQ09MT1JfQlVGRkVSX0JJVCA9IDE2Mzg0XG52YXIgR0xfREVQVEhfQlVGRkVSX0JJVCA9IDI1NlxudmFyIEdMX1NURU5DSUxfQlVGRkVSX0JJVCA9IDEwMjRcblxudmFyIEdMX0FSUkFZX0JVRkZFUiA9IDM0OTYyXG5cbnZhciBDT05URVhUX0xPU1RfRVZFTlQgPSAnd2ViZ2xjb250ZXh0bG9zdCdcbnZhciBDT05URVhUX1JFU1RPUkVEX0VWRU5UID0gJ3dlYmdsY29udGV4dHJlc3RvcmVkJ1xuXG52YXIgRFlOX1BST1AgPSAxXG52YXIgRFlOX0NPTlRFWFQgPSAyXG52YXIgRFlOX1NUQVRFID0gM1xuXG5mdW5jdGlvbiBmaW5kIChoYXlzdGFjaywgbmVlZGxlKSB7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgaGF5c3RhY2subGVuZ3RoOyArK2kpIHtcbiAgICBpZiAoaGF5c3RhY2tbaV0gPT09IG5lZWRsZSkge1xuICAgICAgcmV0dXJuIGlcbiAgICB9XG4gIH1cbiAgcmV0dXJuIC0xXG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcFJFR0wgKGFyZ3MpIHtcbiAgdmFyIGNvbmZpZyA9IGluaXRXZWJHTChhcmdzKVxuICBpZiAoIWNvbmZpZykge1xuICAgIHJldHVybiBudWxsXG4gIH1cblxuICB2YXIgZ2wgPSBjb25maWcuZ2xcbiAgdmFyIGdsQXR0cmlidXRlcyA9IGdsLmdldENvbnRleHRBdHRyaWJ1dGVzKClcbiAgdmFyIGNvbnRleHRMb3N0ID0gZ2wuaXNDb250ZXh0TG9zdCgpXG5cbiAgdmFyIGV4dGVuc2lvblN0YXRlID0gd3JhcEV4dGVuc2lvbnMoZ2wsIGNvbmZpZylcbiAgaWYgKCFleHRlbnNpb25TdGF0ZSkge1xuICAgIHJldHVybiBudWxsXG4gIH1cblxuICB2YXIgc3RyaW5nU3RvcmUgPSBjcmVhdGVTdHJpbmdTdG9yZSgpXG4gIHZhciBzdGF0cyA9IGNyZWF0ZVN0YXRzKClcbiAgdmFyIGV4dGVuc2lvbnMgPSBleHRlbnNpb25TdGF0ZS5leHRlbnNpb25zXG4gIHZhciB0aW1lciA9IGNyZWF0ZVRpbWVyKGdsLCBleHRlbnNpb25zKVxuXG4gIHZhciBTVEFSVF9USU1FID0gY2xvY2soKVxuICB2YXIgV0lEVEggPSBnbC5kcmF3aW5nQnVmZmVyV2lkdGhcbiAgdmFyIEhFSUdIVCA9IGdsLmRyYXdpbmdCdWZmZXJIZWlnaHRcblxuICB2YXIgY29udGV4dFN0YXRlID0ge1xuICAgIHRpY2s6IDAsXG4gICAgdGltZTogMCxcbiAgICB2aWV3cG9ydFdpZHRoOiBXSURUSCxcbiAgICB2aWV3cG9ydEhlaWdodDogSEVJR0hULFxuICAgIGZyYW1lYnVmZmVyV2lkdGg6IFdJRFRILFxuICAgIGZyYW1lYnVmZmVySGVpZ2h0OiBIRUlHSFQsXG4gICAgZHJhd2luZ0J1ZmZlcldpZHRoOiBXSURUSCxcbiAgICBkcmF3aW5nQnVmZmVySGVpZ2h0OiBIRUlHSFQsXG4gICAgcGl4ZWxSYXRpbzogY29uZmlnLnBpeGVsUmF0aW9cbiAgfVxuICB2YXIgdW5pZm9ybVN0YXRlID0ge31cbiAgdmFyIGRyYXdTdGF0ZSA9IHtcbiAgICBlbGVtZW50czogbnVsbCxcbiAgICBwcmltaXRpdmU6IDQsIC8vIEdMX1RSSUFOR0xFU1xuICAgIGNvdW50OiAtMSxcbiAgICBvZmZzZXQ6IDAsXG4gICAgaW5zdGFuY2VzOiAtMVxuICB9XG5cbiAgdmFyIGxpbWl0cyA9IHdyYXBMaW1pdHMoZ2wsIGV4dGVuc2lvbnMpXG4gIHZhciBidWZmZXJTdGF0ZSA9IHdyYXBCdWZmZXJzKGdsLCBzdGF0cywgY29uZmlnKVxuICB2YXIgZWxlbWVudFN0YXRlID0gd3JhcEVsZW1lbnRzKGdsLCBleHRlbnNpb25zLCBidWZmZXJTdGF0ZSwgc3RhdHMpXG4gIHZhciBhdHRyaWJ1dGVTdGF0ZSA9IHdyYXBBdHRyaWJ1dGVzKFxuICAgIGdsLFxuICAgIGV4dGVuc2lvbnMsXG4gICAgbGltaXRzLFxuICAgIGJ1ZmZlclN0YXRlLFxuICAgIHN0cmluZ1N0b3JlKVxuICB2YXIgc2hhZGVyU3RhdGUgPSB3cmFwU2hhZGVycyhnbCwgc3RyaW5nU3RvcmUsIHN0YXRzLCBjb25maWcpXG4gIHZhciB0ZXh0dXJlU3RhdGUgPSB3cmFwVGV4dHVyZXMoXG4gICAgZ2wsXG4gICAgZXh0ZW5zaW9ucyxcbiAgICBsaW1pdHMsXG4gICAgZnVuY3Rpb24gKCkgeyBjb3JlLnByb2NzLnBvbGwoKSB9LFxuICAgIGNvbnRleHRTdGF0ZSxcbiAgICBzdGF0cyxcbiAgICBjb25maWcpXG4gIHZhciByZW5kZXJidWZmZXJTdGF0ZSA9IHdyYXBSZW5kZXJidWZmZXJzKGdsLCBleHRlbnNpb25zLCBsaW1pdHMsIHN0YXRzLCBjb25maWcpXG4gIHZhciBmcmFtZWJ1ZmZlclN0YXRlID0gd3JhcEZyYW1lYnVmZmVycyhcbiAgICBnbCxcbiAgICBleHRlbnNpb25zLFxuICAgIGxpbWl0cyxcbiAgICB0ZXh0dXJlU3RhdGUsXG4gICAgcmVuZGVyYnVmZmVyU3RhdGUsXG4gICAgc3RhdHMpXG4gIHZhciBjb3JlID0gY3JlYXRlQ29yZShcbiAgICBnbCxcbiAgICBzdHJpbmdTdG9yZSxcbiAgICBleHRlbnNpb25zLFxuICAgIGxpbWl0cyxcbiAgICBidWZmZXJTdGF0ZSxcbiAgICBlbGVtZW50U3RhdGUsXG4gICAgdGV4dHVyZVN0YXRlLFxuICAgIGZyYW1lYnVmZmVyU3RhdGUsXG4gICAgdW5pZm9ybVN0YXRlLFxuICAgIGF0dHJpYnV0ZVN0YXRlLFxuICAgIHNoYWRlclN0YXRlLFxuICAgIGRyYXdTdGF0ZSxcbiAgICBjb250ZXh0U3RhdGUsXG4gICAgdGltZXIsXG4gICAgY29uZmlnKVxuICB2YXIgcmVhZFBpeGVscyA9IHdyYXBSZWFkKFxuICAgIGdsLFxuICAgIGZyYW1lYnVmZmVyU3RhdGUsXG4gICAgY29yZS5wcm9jcy5wb2xsLFxuICAgIGNvbnRleHRTdGF0ZSxcbiAgICBnbEF0dHJpYnV0ZXMsIGV4dGVuc2lvbnMpXG5cbiAgdmFyIG5leHRTdGF0ZSA9IGNvcmUubmV4dFxuICB2YXIgY2FudmFzID0gZ2wuY2FudmFzXG5cbiAgdmFyIHJhZkNhbGxiYWNrcyA9IFtdXG4gIHZhciBsb3NzQ2FsbGJhY2tzID0gW11cbiAgdmFyIHJlc3RvcmVDYWxsYmFja3MgPSBbXVxuICB2YXIgZGVzdHJveUNhbGxiYWNrcyA9IFtjb25maWcub25EZXN0cm95XVxuXG4gIHZhciBhY3RpdmVSQUYgPSBudWxsXG4gIGZ1bmN0aW9uIGhhbmRsZVJBRiAoKSB7XG4gICAgaWYgKHJhZkNhbGxiYWNrcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGlmICh0aW1lcikge1xuICAgICAgICB0aW1lci51cGRhdGUoKVxuICAgICAgfVxuICAgICAgYWN0aXZlUkFGID0gbnVsbFxuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgLy8gc2NoZWR1bGUgbmV4dCBhbmltYXRpb24gZnJhbWVcbiAgICBhY3RpdmVSQUYgPSByYWYubmV4dChoYW5kbGVSQUYpXG5cbiAgICAvLyBwb2xsIGZvciBjaGFuZ2VzXG4gICAgcG9sbCgpXG5cbiAgICAvLyBmaXJlIGEgY2FsbGJhY2sgZm9yIGFsbCBwZW5kaW5nIHJhZnNcbiAgICBmb3IgKHZhciBpID0gcmFmQ2FsbGJhY2tzLmxlbmd0aCAtIDE7IGkgPj0gMDsgLS1pKSB7XG4gICAgICB2YXIgY2IgPSByYWZDYWxsYmFja3NbaV1cbiAgICAgIGlmIChjYikge1xuICAgICAgICBjYihjb250ZXh0U3RhdGUsIG51bGwsIDApXG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gZmx1c2ggYWxsIHBlbmRpbmcgd2ViZ2wgY2FsbHNcbiAgICBnbC5mbHVzaCgpXG5cbiAgICAvLyBwb2xsIEdQVSB0aW1lcnMgKmFmdGVyKiBnbC5mbHVzaCBzbyB3ZSBkb24ndCBkZWxheSBjb21tYW5kIGRpc3BhdGNoXG4gICAgaWYgKHRpbWVyKSB7XG4gICAgICB0aW1lci51cGRhdGUoKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHN0YXJ0UkFGICgpIHtcbiAgICBpZiAoIWFjdGl2ZVJBRiAmJiByYWZDYWxsYmFja3MubGVuZ3RoID4gMCkge1xuICAgICAgYWN0aXZlUkFGID0gcmFmLm5leHQoaGFuZGxlUkFGKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHN0b3BSQUYgKCkge1xuICAgIGlmIChhY3RpdmVSQUYpIHtcbiAgICAgIHJhZi5jYW5jZWwoaGFuZGxlUkFGKVxuICAgICAgYWN0aXZlUkFGID0gbnVsbFxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZUNvbnRleHRMb3NzIChldmVudCkge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KClcblxuICAgIC8vIHNldCBjb250ZXh0IGxvc3QgZmxhZ1xuICAgIGNvbnRleHRMb3N0ID0gdHJ1ZVxuXG4gICAgLy8gcGF1c2UgcmVxdWVzdCBhbmltYXRpb24gZnJhbWVcbiAgICBzdG9wUkFGKClcblxuICAgIC8vIGxvc2UgY29udGV4dFxuICAgIGxvc3NDYWxsYmFja3MuZm9yRWFjaChmdW5jdGlvbiAoY2IpIHtcbiAgICAgIGNiKClcbiAgICB9KVxuICB9XG5cbiAgZnVuY3Rpb24gaGFuZGxlQ29udGV4dFJlc3RvcmVkIChldmVudCkge1xuICAgIC8vIGNsZWFyIGVycm9yIGNvZGVcbiAgICBnbC5nZXRFcnJvcigpXG5cbiAgICAvLyBjbGVhciBjb250ZXh0IGxvc3QgZmxhZ1xuICAgIGNvbnRleHRMb3N0ID0gZmFsc2VcblxuICAgIC8vIHJlZnJlc2ggc3RhdGVcbiAgICBleHRlbnNpb25TdGF0ZS5yZXN0b3JlKClcbiAgICBzaGFkZXJTdGF0ZS5yZXN0b3JlKClcbiAgICBidWZmZXJTdGF0ZS5yZXN0b3JlKClcbiAgICB0ZXh0dXJlU3RhdGUucmVzdG9yZSgpXG4gICAgcmVuZGVyYnVmZmVyU3RhdGUucmVzdG9yZSgpXG4gICAgZnJhbWVidWZmZXJTdGF0ZS5yZXN0b3JlKClcbiAgICBpZiAodGltZXIpIHtcbiAgICAgIHRpbWVyLnJlc3RvcmUoKVxuICAgIH1cblxuICAgIC8vIHJlZnJlc2ggc3RhdGVcbiAgICBjb3JlLnByb2NzLnJlZnJlc2goKVxuXG4gICAgLy8gcmVzdGFydCBSQUZcbiAgICBzdGFydFJBRigpXG5cbiAgICAvLyByZXN0b3JlIGNvbnRleHRcbiAgICByZXN0b3JlQ2FsbGJhY2tzLmZvckVhY2goZnVuY3Rpb24gKGNiKSB7XG4gICAgICBjYigpXG4gICAgfSlcbiAgfVxuXG4gIGlmIChjYW52YXMpIHtcbiAgICBjYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihDT05URVhUX0xPU1RfRVZFTlQsIGhhbmRsZUNvbnRleHRMb3NzLCBmYWxzZSlcbiAgICBjYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihDT05URVhUX1JFU1RPUkVEX0VWRU5ULCBoYW5kbGVDb250ZXh0UmVzdG9yZWQsIGZhbHNlKVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSAoKSB7XG4gICAgcmFmQ2FsbGJhY2tzLmxlbmd0aCA9IDBcbiAgICBzdG9wUkFGKClcblxuICAgIGlmIChjYW52YXMpIHtcbiAgICAgIGNhbnZhcy5yZW1vdmVFdmVudExpc3RlbmVyKENPTlRFWFRfTE9TVF9FVkVOVCwgaGFuZGxlQ29udGV4dExvc3MpXG4gICAgICBjYW52YXMucmVtb3ZlRXZlbnRMaXN0ZW5lcihDT05URVhUX1JFU1RPUkVEX0VWRU5ULCBoYW5kbGVDb250ZXh0UmVzdG9yZWQpXG4gICAgfVxuXG4gICAgc2hhZGVyU3RhdGUuY2xlYXIoKVxuICAgIGZyYW1lYnVmZmVyU3RhdGUuY2xlYXIoKVxuICAgIHJlbmRlcmJ1ZmZlclN0YXRlLmNsZWFyKClcbiAgICB0ZXh0dXJlU3RhdGUuY2xlYXIoKVxuICAgIGVsZW1lbnRTdGF0ZS5jbGVhcigpXG4gICAgYnVmZmVyU3RhdGUuY2xlYXIoKVxuXG4gICAgaWYgKHRpbWVyKSB7XG4gICAgICB0aW1lci5jbGVhcigpXG4gICAgfVxuXG4gICAgZGVzdHJveUNhbGxiYWNrcy5mb3JFYWNoKGZ1bmN0aW9uIChjYikge1xuICAgICAgY2IoKVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiBjb21waWxlUHJvY2VkdXJlIChvcHRpb25zKSB7XG4gICAgY2hlY2soISFvcHRpb25zLCAnaW52YWxpZCBhcmdzIHRvIHJlZ2woey4uLn0pJylcbiAgICBjaGVjay50eXBlKG9wdGlvbnMsICdvYmplY3QnLCAnaW52YWxpZCBhcmdzIHRvIHJlZ2woey4uLn0pJylcblxuICAgIGZ1bmN0aW9uIGZsYXR0ZW5OZXN0ZWRPcHRpb25zIChvcHRpb25zKSB7XG4gICAgICB2YXIgcmVzdWx0ID0gZXh0ZW5kKHt9LCBvcHRpb25zKVxuICAgICAgZGVsZXRlIHJlc3VsdC51bmlmb3Jtc1xuICAgICAgZGVsZXRlIHJlc3VsdC5hdHRyaWJ1dGVzXG4gICAgICBkZWxldGUgcmVzdWx0LmNvbnRleHRcblxuICAgICAgaWYgKCdzdGVuY2lsJyBpbiByZXN1bHQgJiYgcmVzdWx0LnN0ZW5jaWwub3ApIHtcbiAgICAgICAgcmVzdWx0LnN0ZW5jaWwub3BCYWNrID0gcmVzdWx0LnN0ZW5jaWwub3BGcm9udCA9IHJlc3VsdC5zdGVuY2lsLm9wXG4gICAgICAgIGRlbGV0ZSByZXN1bHQuc3RlbmNpbC5vcFxuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBtZXJnZSAobmFtZSkge1xuICAgICAgICBpZiAobmFtZSBpbiByZXN1bHQpIHtcbiAgICAgICAgICB2YXIgY2hpbGQgPSByZXN1bHRbbmFtZV1cbiAgICAgICAgICBkZWxldGUgcmVzdWx0W25hbWVdXG4gICAgICAgICAgT2JqZWN0LmtleXMoY2hpbGQpLmZvckVhY2goZnVuY3Rpb24gKHByb3ApIHtcbiAgICAgICAgICAgIHJlc3VsdFtuYW1lICsgJy4nICsgcHJvcF0gPSBjaGlsZFtwcm9wXVxuICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIG1lcmdlKCdibGVuZCcpXG4gICAgICBtZXJnZSgnZGVwdGgnKVxuICAgICAgbWVyZ2UoJ2N1bGwnKVxuICAgICAgbWVyZ2UoJ3N0ZW5jaWwnKVxuICAgICAgbWVyZ2UoJ3BvbHlnb25PZmZzZXQnKVxuICAgICAgbWVyZ2UoJ3NjaXNzb3InKVxuICAgICAgbWVyZ2UoJ3NhbXBsZScpXG5cbiAgICAgIHJldHVybiByZXN1bHRcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzZXBhcmF0ZUR5bmFtaWMgKG9iamVjdCkge1xuICAgICAgdmFyIHN0YXRpY0l0ZW1zID0ge31cbiAgICAgIHZhciBkeW5hbWljSXRlbXMgPSB7fVxuICAgICAgT2JqZWN0LmtleXMob2JqZWN0KS5mb3JFYWNoKGZ1bmN0aW9uIChvcHRpb24pIHtcbiAgICAgICAgdmFyIHZhbHVlID0gb2JqZWN0W29wdGlvbl1cbiAgICAgICAgaWYgKGR5bmFtaWMuaXNEeW5hbWljKHZhbHVlKSkge1xuICAgICAgICAgIGR5bmFtaWNJdGVtc1tvcHRpb25dID0gZHluYW1pYy51bmJveCh2YWx1ZSwgb3B0aW9uKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHN0YXRpY0l0ZW1zW29wdGlvbl0gPSB2YWx1ZVxuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgZHluYW1pYzogZHluYW1pY0l0ZW1zLFxuICAgICAgICBzdGF0aWM6IHN0YXRpY0l0ZW1zXG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gVHJlYXQgY29udGV4dCB2YXJpYWJsZXMgc2VwYXJhdGUgZnJvbSBvdGhlciBkeW5hbWljIHZhcmlhYmxlc1xuICAgIHZhciBjb250ZXh0ID0gc2VwYXJhdGVEeW5hbWljKG9wdGlvbnMuY29udGV4dCB8fCB7fSlcbiAgICB2YXIgdW5pZm9ybXMgPSBzZXBhcmF0ZUR5bmFtaWMob3B0aW9ucy51bmlmb3JtcyB8fCB7fSlcbiAgICB2YXIgYXR0cmlidXRlcyA9IHNlcGFyYXRlRHluYW1pYyhvcHRpb25zLmF0dHJpYnV0ZXMgfHwge30pXG4gICAgdmFyIG9wdHMgPSBzZXBhcmF0ZUR5bmFtaWMoZmxhdHRlbk5lc3RlZE9wdGlvbnMob3B0aW9ucykpXG5cbiAgICB2YXIgc3RhdHMgPSB7XG4gICAgICBncHVUaW1lOiAwLjAsXG4gICAgICBjcHVUaW1lOiAwLjAsXG4gICAgICBjb3VudDogMFxuICAgIH1cblxuICAgIHZhciBjb21waWxlZCA9IGNvcmUuY29tcGlsZShvcHRzLCBhdHRyaWJ1dGVzLCB1bmlmb3JtcywgY29udGV4dCwgc3RhdHMpXG5cbiAgICB2YXIgZHJhdyA9IGNvbXBpbGVkLmRyYXdcbiAgICB2YXIgYmF0Y2ggPSBjb21waWxlZC5iYXRjaFxuICAgIHZhciBzY29wZSA9IGNvbXBpbGVkLnNjb3BlXG5cbiAgICAvLyBGSVhNRTogd2Ugc2hvdWxkIG1vZGlmeSBjb2RlIGdlbmVyYXRpb24gZm9yIGJhdGNoIGNvbW1hbmRzIHNvIHRoaXNcbiAgICAvLyBpc24ndCBuZWNlc3NhcnlcbiAgICB2YXIgRU1QVFlfQVJSQVkgPSBbXVxuICAgIGZ1bmN0aW9uIHJlc2VydmUgKGNvdW50KSB7XG4gICAgICB3aGlsZSAoRU1QVFlfQVJSQVkubGVuZ3RoIDwgY291bnQpIHtcbiAgICAgICAgRU1QVFlfQVJSQVkucHVzaChudWxsKVxuICAgICAgfVxuICAgICAgcmV0dXJuIEVNUFRZX0FSUkFZXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gUkVHTENvbW1hbmQgKGFyZ3MsIGJvZHkpIHtcbiAgICAgIHZhciBpXG4gICAgICBpZiAoY29udGV4dExvc3QpIHtcbiAgICAgICAgY2hlY2sucmFpc2UoJ2NvbnRleHQgbG9zdCcpXG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIGFyZ3MgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgcmV0dXJuIHNjb3BlLmNhbGwodGhpcywgbnVsbCwgYXJncywgMClcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGJvZHkgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBhcmdzID09PSAnbnVtYmVyJykge1xuICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBhcmdzOyArK2kpIHtcbiAgICAgICAgICAgIHNjb3BlLmNhbGwodGhpcywgbnVsbCwgYm9keSwgaSlcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShhcmdzKSkge1xuICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBhcmdzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgICBzY29wZS5jYWxsKHRoaXMsIGFyZ3NbaV0sIGJvZHksIGkpXG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVyblxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBzY29wZS5jYWxsKHRoaXMsIGFyZ3MsIGJvZHksIDApXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGFyZ3MgPT09ICdudW1iZXInKSB7XG4gICAgICAgIGlmIChhcmdzID4gMCkge1xuICAgICAgICAgIHJldHVybiBiYXRjaC5jYWxsKHRoaXMsIHJlc2VydmUoYXJncyB8IDApLCBhcmdzIHwgMClcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGFyZ3MpKSB7XG4gICAgICAgIGlmIChhcmdzLmxlbmd0aCkge1xuICAgICAgICAgIHJldHVybiBiYXRjaC5jYWxsKHRoaXMsIGFyZ3MsIGFyZ3MubGVuZ3RoKVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZHJhdy5jYWxsKHRoaXMsIGFyZ3MpXG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGV4dGVuZChSRUdMQ29tbWFuZCwge1xuICAgICAgc3RhdHM6IHN0YXRzXG4gICAgfSlcbiAgfVxuXG4gIHZhciBzZXRGQk8gPSBmcmFtZWJ1ZmZlclN0YXRlLnNldEZCTyA9IGNvbXBpbGVQcm9jZWR1cmUoe1xuICAgIGZyYW1lYnVmZmVyOiBkeW5hbWljLmRlZmluZS5jYWxsKG51bGwsIERZTl9QUk9QLCAnZnJhbWVidWZmZXInKVxuICB9KVxuXG4gIGZ1bmN0aW9uIGNsZWFySW1wbCAoXywgb3B0aW9ucykge1xuICAgIHZhciBjbGVhckZsYWdzID0gMFxuICAgIGNvcmUucHJvY3MucG9sbCgpXG5cbiAgICB2YXIgYyA9IG9wdGlvbnMuY29sb3JcbiAgICBpZiAoYykge1xuICAgICAgZ2wuY2xlYXJDb2xvcigrY1swXSB8fCAwLCArY1sxXSB8fCAwLCArY1syXSB8fCAwLCArY1szXSB8fCAwKVxuICAgICAgY2xlYXJGbGFncyB8PSBHTF9DT0xPUl9CVUZGRVJfQklUXG4gICAgfVxuICAgIGlmICgnZGVwdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgIGdsLmNsZWFyRGVwdGgoK29wdGlvbnMuZGVwdGgpXG4gICAgICBjbGVhckZsYWdzIHw9IEdMX0RFUFRIX0JVRkZFUl9CSVRcbiAgICB9XG4gICAgaWYgKCdzdGVuY2lsJyBpbiBvcHRpb25zKSB7XG4gICAgICBnbC5jbGVhclN0ZW5jaWwob3B0aW9ucy5zdGVuY2lsIHwgMClcbiAgICAgIGNsZWFyRmxhZ3MgfD0gR0xfU1RFTkNJTF9CVUZGRVJfQklUXG4gICAgfVxuXG4gICAgY2hlY2soISFjbGVhckZsYWdzLCAnY2FsbGVkIHJlZ2wuY2xlYXIgd2l0aCBubyBidWZmZXIgc3BlY2lmaWVkJylcbiAgICBnbC5jbGVhcihjbGVhckZsYWdzKVxuICB9XG5cbiAgZnVuY3Rpb24gY2xlYXIgKG9wdGlvbnMpIHtcbiAgICBjaGVjayhcbiAgICAgIHR5cGVvZiBvcHRpb25zID09PSAnb2JqZWN0JyAmJiBvcHRpb25zLFxuICAgICAgJ3JlZ2wuY2xlYXIoKSB0YWtlcyBhbiBvYmplY3QgYXMgaW5wdXQnKVxuICAgIGlmICgnZnJhbWVidWZmZXInIGluIG9wdGlvbnMpIHtcbiAgICAgIGlmIChvcHRpb25zLmZyYW1lYnVmZmVyICYmXG4gICAgICAgICAgb3B0aW9ucy5mcmFtZWJ1ZmZlcl9yZWdsVHlwZSA9PT0gJ2ZyYW1lYnVmZmVyQ3ViZScpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCA2OyArK2kpIHtcbiAgICAgICAgICBzZXRGQk8oZXh0ZW5kKHtcbiAgICAgICAgICAgIGZyYW1lYnVmZmVyOiBvcHRpb25zLmZyYW1lYnVmZmVyLmZhY2VzW2ldXG4gICAgICAgICAgfSwgb3B0aW9ucyksIGNsZWFySW1wbClcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2V0RkJPKG9wdGlvbnMsIGNsZWFySW1wbClcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY2xlYXJJbXBsKG51bGwsIG9wdGlvbnMpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZnJhbWUgKGNiKSB7XG4gICAgY2hlY2sudHlwZShjYiwgJ2Z1bmN0aW9uJywgJ3JlZ2wuZnJhbWUoKSBjYWxsYmFjayBtdXN0IGJlIGEgZnVuY3Rpb24nKVxuICAgIHJhZkNhbGxiYWNrcy5wdXNoKGNiKVxuXG4gICAgZnVuY3Rpb24gY2FuY2VsICgpIHtcbiAgICAgIC8vIEZJWE1FOiAgc2hvdWxkIHdlIGNoZWNrIHNvbWV0aGluZyBvdGhlciB0aGFuIGVxdWFscyBjYiBoZXJlP1xuICAgICAgLy8gd2hhdCBpZiBhIHVzZXIgY2FsbHMgZnJhbWUgdHdpY2Ugd2l0aCB0aGUgc2FtZSBjYWxsYmFjay4uLlxuICAgICAgLy9cbiAgICAgIHZhciBpID0gZmluZChyYWZDYWxsYmFja3MsIGNiKVxuICAgICAgY2hlY2soaSA+PSAwLCAnY2Fubm90IGNhbmNlbCBhIGZyYW1lIHR3aWNlJylcbiAgICAgIGZ1bmN0aW9uIHBlbmRpbmdDYW5jZWwgKCkge1xuICAgICAgICB2YXIgaW5kZXggPSBmaW5kKHJhZkNhbGxiYWNrcywgcGVuZGluZ0NhbmNlbClcbiAgICAgICAgcmFmQ2FsbGJhY2tzW2luZGV4XSA9IHJhZkNhbGxiYWNrc1tyYWZDYWxsYmFja3MubGVuZ3RoIC0gMV1cbiAgICAgICAgcmFmQ2FsbGJhY2tzLmxlbmd0aCAtPSAxXG4gICAgICAgIGlmIChyYWZDYWxsYmFja3MubGVuZ3RoIDw9IDApIHtcbiAgICAgICAgICBzdG9wUkFGKClcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmFmQ2FsbGJhY2tzW2ldID0gcGVuZGluZ0NhbmNlbFxuICAgIH1cblxuICAgIHN0YXJ0UkFGKClcblxuICAgIHJldHVybiB7XG4gICAgICBjYW5jZWw6IGNhbmNlbFxuICAgIH1cbiAgfVxuXG4gIC8vIHBvbGwgdmlld3BvcnRcbiAgZnVuY3Rpb24gcG9sbFZpZXdwb3J0ICgpIHtcbiAgICB2YXIgdmlld3BvcnQgPSBuZXh0U3RhdGUudmlld3BvcnRcbiAgICB2YXIgc2Npc3NvckJveCA9IG5leHRTdGF0ZS5zY2lzc29yX2JveFxuICAgIHZpZXdwb3J0WzBdID0gdmlld3BvcnRbMV0gPSBzY2lzc29yQm94WzBdID0gc2Npc3NvckJveFsxXSA9IDBcbiAgICBjb250ZXh0U3RhdGUudmlld3BvcnRXaWR0aCA9XG4gICAgICBjb250ZXh0U3RhdGUuZnJhbWVidWZmZXJXaWR0aCA9XG4gICAgICBjb250ZXh0U3RhdGUuZHJhd2luZ0J1ZmZlcldpZHRoID1cbiAgICAgIHZpZXdwb3J0WzJdID1cbiAgICAgIHNjaXNzb3JCb3hbMl0gPSBnbC5kcmF3aW5nQnVmZmVyV2lkdGhcbiAgICBjb250ZXh0U3RhdGUudmlld3BvcnRIZWlnaHQgPVxuICAgICAgY29udGV4dFN0YXRlLmZyYW1lYnVmZmVySGVpZ2h0ID1cbiAgICAgIGNvbnRleHRTdGF0ZS5kcmF3aW5nQnVmZmVySGVpZ2h0ID1cbiAgICAgIHZpZXdwb3J0WzNdID1cbiAgICAgIHNjaXNzb3JCb3hbM10gPSBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0XG4gIH1cblxuICBmdW5jdGlvbiBwb2xsICgpIHtcbiAgICBjb250ZXh0U3RhdGUudGljayArPSAxXG4gICAgY29udGV4dFN0YXRlLnRpbWUgPSBub3coKVxuICAgIHBvbGxWaWV3cG9ydCgpXG4gICAgY29yZS5wcm9jcy5wb2xsKClcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlZnJlc2ggKCkge1xuICAgIHBvbGxWaWV3cG9ydCgpXG4gICAgY29yZS5wcm9jcy5yZWZyZXNoKClcbiAgICBpZiAodGltZXIpIHtcbiAgICAgIHRpbWVyLnVwZGF0ZSgpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gbm93ICgpIHtcbiAgICByZXR1cm4gKGNsb2NrKCkgLSBTVEFSVF9USU1FKSAvIDEwMDAuMFxuICB9XG5cbiAgcmVmcmVzaCgpXG5cbiAgZnVuY3Rpb24gYWRkTGlzdGVuZXIgKGV2ZW50LCBjYWxsYmFjaykge1xuICAgIGNoZWNrLnR5cGUoY2FsbGJhY2ssICdmdW5jdGlvbicsICdsaXN0ZW5lciBjYWxsYmFjayBtdXN0IGJlIGEgZnVuY3Rpb24nKVxuXG4gICAgdmFyIGNhbGxiYWNrc1xuICAgIHN3aXRjaCAoZXZlbnQpIHtcbiAgICAgIGNhc2UgJ2ZyYW1lJzpcbiAgICAgICAgcmV0dXJuIGZyYW1lKGNhbGxiYWNrKVxuICAgICAgY2FzZSAnbG9zdCc6XG4gICAgICAgIGNhbGxiYWNrcyA9IGxvc3NDYWxsYmFja3NcbiAgICAgICAgYnJlYWtcbiAgICAgIGNhc2UgJ3Jlc3RvcmUnOlxuICAgICAgICBjYWxsYmFja3MgPSByZXN0b3JlQ2FsbGJhY2tzXG4gICAgICAgIGJyZWFrXG4gICAgICBjYXNlICdkZXN0cm95JzpcbiAgICAgICAgY2FsbGJhY2tzID0gZGVzdHJveUNhbGxiYWNrc1xuICAgICAgICBicmVha1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgY2hlY2sucmFpc2UoJ2ludmFsaWQgZXZlbnQsIG11c3QgYmUgb25lIG9mIGZyYW1lLGxvc3QscmVzdG9yZSxkZXN0cm95JylcbiAgICB9XG5cbiAgICBjYWxsYmFja3MucHVzaChjYWxsYmFjaylcbiAgICByZXR1cm4ge1xuICAgICAgY2FuY2VsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY2FsbGJhY2tzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgaWYgKGNhbGxiYWNrc1tpXSA9PT0gY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGNhbGxiYWNrc1tpXSA9IGNhbGxiYWNrc1tjYWxsYmFja3MubGVuZ3RoIC0gMV1cbiAgICAgICAgICAgIGNhbGxiYWNrcy5wb3AoKVxuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgdmFyIHJlZ2wgPSBleHRlbmQoY29tcGlsZVByb2NlZHVyZSwge1xuICAgIC8vIENsZWFyIGN1cnJlbnQgRkJPXG4gICAgY2xlYXI6IGNsZWFyLFxuXG4gICAgLy8gU2hvcnQgY3V0cyBmb3IgZHluYW1pYyB2YXJpYWJsZXNcbiAgICBwcm9wOiBkeW5hbWljLmRlZmluZS5iaW5kKG51bGwsIERZTl9QUk9QKSxcbiAgICBjb250ZXh0OiBkeW5hbWljLmRlZmluZS5iaW5kKG51bGwsIERZTl9DT05URVhUKSxcbiAgICB0aGlzOiBkeW5hbWljLmRlZmluZS5iaW5kKG51bGwsIERZTl9TVEFURSksXG5cbiAgICAvLyBleGVjdXRlcyBhbiBlbXB0eSBkcmF3IGNvbW1hbmRcbiAgICBkcmF3OiBjb21waWxlUHJvY2VkdXJlKHt9KSxcblxuICAgIC8vIFJlc291cmNlc1xuICAgIGJ1ZmZlcjogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgIHJldHVybiBidWZmZXJTdGF0ZS5jcmVhdGUob3B0aW9ucywgR0xfQVJSQVlfQlVGRkVSLCBmYWxzZSwgZmFsc2UpXG4gICAgfSxcbiAgICBlbGVtZW50czogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgIHJldHVybiBlbGVtZW50U3RhdGUuY3JlYXRlKG9wdGlvbnMsIGZhbHNlKVxuICAgIH0sXG4gICAgdGV4dHVyZTogdGV4dHVyZVN0YXRlLmNyZWF0ZTJELFxuICAgIGN1YmU6IHRleHR1cmVTdGF0ZS5jcmVhdGVDdWJlLFxuICAgIHJlbmRlcmJ1ZmZlcjogcmVuZGVyYnVmZmVyU3RhdGUuY3JlYXRlLFxuICAgIGZyYW1lYnVmZmVyOiBmcmFtZWJ1ZmZlclN0YXRlLmNyZWF0ZSxcbiAgICBmcmFtZWJ1ZmZlckN1YmU6IGZyYW1lYnVmZmVyU3RhdGUuY3JlYXRlQ3ViZSxcblxuICAgIC8vIEV4cG9zZSBjb250ZXh0IGF0dHJpYnV0ZXNcbiAgICBhdHRyaWJ1dGVzOiBnbEF0dHJpYnV0ZXMsXG5cbiAgICAvLyBGcmFtZSByZW5kZXJpbmdcbiAgICBmcmFtZTogZnJhbWUsXG4gICAgb246IGFkZExpc3RlbmVyLFxuXG4gICAgLy8gU3lzdGVtIGxpbWl0c1xuICAgIGxpbWl0czogbGltaXRzLFxuICAgIGhhc0V4dGVuc2lvbjogZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHJldHVybiBsaW1pdHMuZXh0ZW5zaW9ucy5pbmRleE9mKG5hbWUudG9Mb3dlckNhc2UoKSkgPj0gMFxuICAgIH0sXG5cbiAgICAvLyBSZWFkIHBpeGVsc1xuICAgIHJlYWQ6IHJlYWRQaXhlbHMsXG5cbiAgICAvLyBEZXN0cm95IHJlZ2wgYW5kIGFsbCBhc3NvY2lhdGVkIHJlc291cmNlc1xuICAgIGRlc3Ryb3k6IGRlc3Ryb3ksXG5cbiAgICAvLyBEaXJlY3QgR0wgc3RhdGUgbWFuaXB1bGF0aW9uXG4gICAgX2dsOiBnbCxcbiAgICBfcmVmcmVzaDogcmVmcmVzaCxcblxuICAgIHBvbGw6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHBvbGwoKVxuICAgICAgaWYgKHRpbWVyKSB7XG4gICAgICAgIHRpbWVyLnVwZGF0ZSgpXG4gICAgICB9XG4gICAgfSxcblxuICAgIC8vIEN1cnJlbnQgdGltZVxuICAgIG5vdzogbm93LFxuXG4gICAgLy8gcmVnbCBTdGF0aXN0aWNzIEluZm9ybWF0aW9uXG4gICAgc3RhdHM6IHN0YXRzXG4gIH0pXG5cbiAgY29uZmlnLm9uRG9uZShudWxsLCByZWdsKVxuXG4gIHJldHVybiByZWdsXG59XG4iXX0=
