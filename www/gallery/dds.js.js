(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*
  tags: advanced
  <p>This example shows how you can parse dds files with resl.</p>
 */

var regl = require('../regl')({
  extensions: 'WEBGL_compressed_texture_s3tc'
});
var parseDDS = require('parse-dds');

require('resl')({
  manifest: {
    diffuse: {
      type: 'binary',
      src: 'assets/alpine_cliff_a.dds',
      parser: function (data) {
        var dds = parseDDS(data);
        var image = dds.images[0];
        return regl.texture({
          format: 'rgba s3tc ' + dds.format,
          shape: dds.shape,
          mag: 'linear',
          data: new Uint8Array(data, image.offset, image.length)
        });
      }
    },

    specular: {
      type: 'image',
      src: 'assets/alpine_cliff_a_spec.png',
      parser: function (data) {
        return regl.texture({
          mag: 'linear',
          data: data
        });
      }
    },

    normals: {
      type: 'image',
      src: 'assets/alpine_cliff_a_norm.png',
      parser: function (data) {
        return regl.texture({
          mag: 'linear',
          data: data
        });
      }
    }
  },

  onDone: function ({ diffuse, specular, normals }) {
    var draw = regl({
      frag: '\n      precision mediump float;\n      uniform sampler2D specular, normals, diffuse;\n      varying vec3 lightDir, eyeDir;\n      varying vec2 uv;\n      void main () {\n        float d = length(lightDir);\n        vec3 L = normalize(lightDir);\n        vec3 E = normalize(eyeDir);\n        vec3 N = normalize(2.0 * texture2D(normals, uv).rgb - 1.0);\n        N = vec3(-N.x, N.yz);\n        vec3 D = texture2D(diffuse, uv).rgb;\n        vec3 kD = D * (0.01 +\n          max(0.0, dot(L, N) * (0.6 + 0.8 / d) ));\n        vec3 S = texture2D(specular, uv).rgb;\n        vec3 kS = 2.0 * pow(max(0.0, dot(normalize(N + L), -E)), 10.0) * S;\n        gl_FragColor = vec4(kD + kS, 1);\n      }',

      vert: '\n      precision mediump float;\n      attribute vec2 position;\n      uniform vec2 lightPosition;\n      varying vec3 lightDir, eyeDir;\n      varying vec2 uv;\n      void main () {\n        vec2 P = 1.0 - 2.0 * position;\n        uv = vec2(position.x, 1.0 - position.y);\n        eyeDir = -vec3(P, 1);\n        lightDir = vec3(lightPosition - P, 1);\n        gl_Position = vec4(P, 0, 1);\n      }',

      attributes: {
        position: [-2, 0, 0, -2, 2, 2]
      },

      uniforms: {
        specular: specular,
        normals: normals,
        diffuse: diffuse,
        lightPosition: function ({ tick }) {
          var t = 0.025 * tick;
          return [2.0 * Math.cos(t), 2.0 * Math.sin(t)];
        }
      },

      count: 3
    });

    regl.frame(function () {
      draw();
    });
  }
});

},{"../regl":37,"parse-dds":35,"resl":36}],2:[function(require,module,exports){
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
// All values and structures referenced from:
// http://msdn.microsoft.com/en-us/library/bb943991.aspx/
//
// DX10 Cubemap support based on
// https://github.com/dariomanesku/cmft/issues/7#issuecomment-69516844
// https://msdn.microsoft.com/en-us/library/windows/desktop/bb943983(v=vs.85).aspx
// https://github.com/playcanvas/engine/blob/master/src/resources/resources_texture.js

var DDS_MAGIC = 0x20534444
var DDSD_MIPMAPCOUNT = 0x20000
var DDPF_FOURCC = 0x4

var FOURCC_DXT1 = fourCCToInt32('DXT1')
var FOURCC_DXT3 = fourCCToInt32('DXT3')
var FOURCC_DXT5 = fourCCToInt32('DXT5')
var FOURCC_DX10 = fourCCToInt32('DX10')
var FOURCC_FP32F = 116 // DXGI_FORMAT_R32G32B32A32_FLOAT

var DDSCAPS2_CUBEMAP = 0x200
var D3D10_RESOURCE_DIMENSION_TEXTURE2D = 3
var DXGI_FORMAT_R32G32B32A32_FLOAT = 2

// The header length in 32 bit ints
var headerLengthInt = 31

// Offsets into the header array
var off_magic = 0
var off_size = 1
var off_flags = 2
var off_height = 3
var off_width = 4
var off_mipmapCount = 7
var off_pfFlags = 20
var off_pfFourCC = 21
var off_caps2 = 28

module.exports = parseHeaders

function parseHeaders (arrayBuffer) {
  var header = new Int32Array(arrayBuffer, 0, headerLengthInt)

  if (header[off_magic] !== DDS_MAGIC) {
    throw new Error('Invalid magic number in DDS header')
  }

  if (!header[off_pfFlags] & DDPF_FOURCC) {
    throw new Error('Unsupported format, must contain a FourCC code')
  }

  var blockBytes
  var format
  var fourCC = header[off_pfFourCC]
  switch (fourCC) {
    case FOURCC_DXT1:
      blockBytes = 8
      format = 'dxt1'
      break
    case FOURCC_DXT3:
      blockBytes = 16
      format = 'dxt3'
      break
    case FOURCC_DXT5:
      blockBytes = 16
      format = 'dxt5'
      break
    case FOURCC_FP32F:
      format = 'rgba32f'
      break
    case FOURCC_DX10:
      var dx10Header = new Uint32Array(arrayBuffer.slice(128, 128 + 20))
      format = dx10Header[0]
      var resourceDimension = dx10Header[1]
      var miscFlag = dx10Header[2]
      var arraySize = dx10Header[3]
      var miscFlags2 = dx10Header[4]

      if (resourceDimension === D3D10_RESOURCE_DIMENSION_TEXTURE2D && format === DXGI_FORMAT_R32G32B32A32_FLOAT) {
        format = 'rgba32f'
      } else {
        throw new Error('Unsupported DX10 texture format ' + format)
      }
      break
    default:
      throw new Error('Unsupported FourCC code: ' + int32ToFourCC(fourCC))
  }

  var flags = header[off_flags]
  var mipmapCount = 1

  if (flags & DDSD_MIPMAPCOUNT) {
    mipmapCount = Math.max(1, header[off_mipmapCount])
  }

  var cubemap = false
  var caps2 = header[off_caps2]
  if (caps2 & DDSCAPS2_CUBEMAP) {
    cubemap = true
  }

  var width = header[off_width]
  var height = header[off_height]
  var dataOffset = header[off_size] + 4
  var texWidth = width
  var texHeight = height
  var images = []
  var dataLength

  if (fourCC === FOURCC_DX10) {
    dataOffset += 20
  }

  if (cubemap) {
    for (var f = 0; f < 6; f++) {
      if (format !== 'rgba32f') {
        throw new Error('Only RGBA32f cubemaps are supported')
      }
      var bpp = 4 * 32 / 8

      width = texWidth
      height = texHeight

      // cubemap should have all mipmap levels defined
      // Math.log2(width) + 1
      var requiredMipLevels = Math.log(width) / Math.log(2) + 1

      for (var i = 0; i < requiredMipLevels; i++) {
        dataLength = width * height * bpp
        images.push({
          offset: dataOffset,
          length: dataLength,
          shape: [ width, height ]
        })
        // Reuse data from the previous level if we are beyond mipmapCount
        // This is hack for CMFT not publishing full mipmap chain https://github.com/dariomanesku/cmft/issues/10
        if (i < mipmapCount) {
          dataOffset += dataLength
        }
        width = Math.floor(width / 2)
        height = Math.floor(height / 2)
      }
    }
  } else {
    for (var i = 0; i < mipmapCount; i++) {
      dataLength = Math.max(4, width) / 4 * Math.max(4, height) / 4 * blockBytes

      images.push({
        offset: dataOffset,
        length: dataLength,
        shape: [ width, height ]
      })
      dataOffset += dataLength
      width = Math.floor(width / 2)
      height = Math.floor(height / 2)
    }
  }

  return {
    shape: [ texWidth, texHeight ],
    images: images,
    format: format,
    flags: flags,
    cubemap: cubemap
  }
}

function fourCCToInt32 (value) {
  return value.charCodeAt(0) +
    (value.charCodeAt(1) << 8) +
    (value.charCodeAt(2) << 16) +
    (value.charCodeAt(3) << 24)
}

function int32ToFourCC (value) {
  return String.fromCharCode(
    value & 0xff,
    (value >> 8) & 0xff,
    (value >> 16) & 0xff,
    (value >> 24) & 0xff
  )
}

},{}],36:[function(require,module,exports){
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJleGFtcGxlL2Rkcy5qcyIsImxpYi9hdHRyaWJ1dGUuanMiLCJsaWIvYnVmZmVyLmpzIiwibGliL2NvbnN0YW50cy9hcnJheXR5cGVzLmpzb24iLCJsaWIvY29uc3RhbnRzL2R0eXBlcy5qc29uIiwibGliL2NvbnN0YW50cy9wcmltaXRpdmVzLmpzb24iLCJsaWIvY29uc3RhbnRzL3VzYWdlLmpzb24iLCJsaWIvY29yZS5qcyIsImxpYi9keW5hbWljLmpzIiwibGliL2VsZW1lbnRzLmpzIiwibGliL2V4dGVuc2lvbi5qcyIsImxpYi9mcmFtZWJ1ZmZlci5qcyIsImxpYi9saW1pdHMuanMiLCJsaWIvcmVhZC5qcyIsImxpYi9yZW5kZXJidWZmZXIuanMiLCJsaWIvc2hhZGVyLmpzIiwibGliL3N0YXRzLmpzIiwibGliL3N0cmluZ3MuanMiLCJsaWIvdGV4dHVyZS5qcyIsImxpYi90aW1lci5qcyIsImxpYi91dGlsL2NoZWNrLmpzIiwibGliL3V0aWwvY2xvY2suanMiLCJsaWIvdXRpbC9jb2RlZ2VuLmpzIiwibGliL3V0aWwvZXh0ZW5kLmpzIiwibGliL3V0aWwvZmxhdHRlbi5qcyIsImxpYi91dGlsL2lzLWFycmF5LWxpa2UuanMiLCJsaWIvdXRpbC9pcy1uZGFycmF5LmpzIiwibGliL3V0aWwvaXMtdHlwZWQtYXJyYXkuanMiLCJsaWIvdXRpbC9sb29wLmpzIiwibGliL3V0aWwvcG9vbC5qcyIsImxpYi91dGlsL3JhZi5qcyIsImxpYi91dGlsL3RvLWhhbGYtZmxvYXQuanMiLCJsaWIvdXRpbC92YWx1ZXMuanMiLCJsaWIvd2ViZ2wuanMiLCJub2RlX21vZHVsZXMvcGFyc2UtZGRzL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3Jlc2wvaW5kZXguanMiLCJyZWdsLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7Ozs7O0FBS0EsSUFBTSxPQUFPLFFBQVEsU0FBUixF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O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FB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aUQsQ0FBeEQ7QUFDRCxLQXBDaUM7O0FBc0NsQztBQUNBLFVBQU0sVUF2QzRCOztBQXlDbEM7QUFDQSxhQUFTLE9BMUN5Qjs7QUE0Q2xDO0FBQ0EsU0FBSyxFQTdDNkI7QUE4Q2xDLGNBQVUsT0E5Q3dCOztBQWdEbEMsVUFBTSxZQUFZO0FBQ2hCO0FBQ0EsVUFBSSxLQUFKLEVBQVc7QUFDVCxjQUFNLE1BQU47QUFDRDtBQUNGLEtBckRpQzs7QUF1RGxDO0FBQ0EsU0FBSyxHQXhENkI7O0FBMERsQztBQUNBLFdBQU87QUEzRDJCLEdBQXpCLENBQVg7O0FBOERBLFNBQU8sTUFBUCxDQUFjLElBQWQsRUFBb0IsSUFBcEI7O0FBRUEsU0FBTyxJQUFQO0FBQ0QsQ0F4aUJEIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8qXG4gIHRhZ3M6IGFkdmFuY2VkXG4gIDxwPlRoaXMgZXhhbXBsZSBzaG93cyBob3cgeW91IGNhbiBwYXJzZSBkZHMgZmlsZXMgd2l0aCByZXNsLjwvcD5cbiAqL1xuXG5jb25zdCByZWdsID0gcmVxdWlyZSgnLi4vcmVnbCcpKHtcbiAgZXh0ZW5zaW9uczogJ1dFQkdMX2NvbXByZXNzZWRfdGV4dHVyZV9zM3RjJ1xufSlcbmNvbnN0IHBhcnNlRERTID0gcmVxdWlyZSgncGFyc2UtZGRzJylcblxucmVxdWlyZSgncmVzbCcpKHtcbiAgbWFuaWZlc3Q6IHtcbiAgICBkaWZmdXNlOiB7XG4gICAgICB0eXBlOiAnYmluYXJ5JyxcbiAgICAgIHNyYzogJ2Fzc2V0cy9hbHBpbmVfY2xpZmZfYS5kZHMnLFxuICAgICAgcGFyc2VyOiAoZGF0YSkgPT4ge1xuICAgICAgICBjb25zdCBkZHMgPSBwYXJzZUREUyhkYXRhKVxuICAgICAgICBjb25zdCBpbWFnZSA9IGRkcy5pbWFnZXNbMF1cbiAgICAgICAgcmV0dXJuIHJlZ2wudGV4dHVyZSh7XG4gICAgICAgICAgZm9ybWF0OiAncmdiYSBzM3RjICcgKyBkZHMuZm9ybWF0LFxuICAgICAgICAgIHNoYXBlOiBkZHMuc2hhcGUsXG4gICAgICAgICAgbWFnOiAnbGluZWFyJyxcbiAgICAgICAgICBkYXRhOiBuZXcgVWludDhBcnJheShkYXRhLCBpbWFnZS5vZmZzZXQsIGltYWdlLmxlbmd0aClcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICB9LFxuXG4gICAgc3BlY3VsYXI6IHtcbiAgICAgIHR5cGU6ICdpbWFnZScsXG4gICAgICBzcmM6ICdhc3NldHMvYWxwaW5lX2NsaWZmX2Ffc3BlYy5wbmcnLFxuICAgICAgcGFyc2VyOiAoZGF0YSkgPT4gcmVnbC50ZXh0dXJlKHtcbiAgICAgICAgbWFnOiAnbGluZWFyJyxcbiAgICAgICAgZGF0YTogZGF0YVxuICAgICAgfSlcbiAgICB9LFxuXG4gICAgbm9ybWFsczoge1xuICAgICAgdHlwZTogJ2ltYWdlJyxcbiAgICAgIHNyYzogJ2Fzc2V0cy9hbHBpbmVfY2xpZmZfYV9ub3JtLnBuZycsXG4gICAgICBwYXJzZXI6IChkYXRhKSA9PiByZWdsLnRleHR1cmUoe1xuICAgICAgICBtYWc6ICdsaW5lYXInLFxuICAgICAgICBkYXRhOiBkYXRhXG4gICAgICB9KVxuICAgIH1cbiAgfSxcblxuICBvbkRvbmU6ICh7IGRpZmZ1c2UsIHNwZWN1bGFyLCBub3JtYWxzIH0pID0+IHtcbiAgICBjb25zdCBkcmF3ID0gcmVnbCh7XG4gICAgICBmcmFnOiBgXG4gICAgICBwcmVjaXNpb24gbWVkaXVtcCBmbG9hdDtcbiAgICAgIHVuaWZvcm0gc2FtcGxlcjJEIHNwZWN1bGFyLCBub3JtYWxzLCBkaWZmdXNlO1xuICAgICAgdmFyeWluZyB2ZWMzIGxpZ2h0RGlyLCBleWVEaXI7XG4gICAgICB2YXJ5aW5nIHZlYzIgdXY7XG4gICAgICB2b2lkIG1haW4gKCkge1xuICAgICAgICBmbG9hdCBkID0gbGVuZ3RoKGxpZ2h0RGlyKTtcbiAgICAgICAgdmVjMyBMID0gbm9ybWFsaXplKGxpZ2h0RGlyKTtcbiAgICAgICAgdmVjMyBFID0gbm9ybWFsaXplKGV5ZURpcik7XG4gICAgICAgIHZlYzMgTiA9IG5vcm1hbGl6ZSgyLjAgKiB0ZXh0dXJlMkQobm9ybWFscywgdXYpLnJnYiAtIDEuMCk7XG4gICAgICAgIE4gPSB2ZWMzKC1OLngsIE4ueXopO1xuICAgICAgICB2ZWMzIEQgPSB0ZXh0dXJlMkQoZGlmZnVzZSwgdXYpLnJnYjtcbiAgICAgICAgdmVjMyBrRCA9IEQgKiAoMC4wMSArXG4gICAgICAgICAgbWF4KDAuMCwgZG90KEwsIE4pICogKDAuNiArIDAuOCAvIGQpICkpO1xuICAgICAgICB2ZWMzIFMgPSB0ZXh0dXJlMkQoc3BlY3VsYXIsIHV2KS5yZ2I7XG4gICAgICAgIHZlYzMga1MgPSAyLjAgKiBwb3cobWF4KDAuMCwgZG90KG5vcm1hbGl6ZShOICsgTCksIC1FKSksIDEwLjApICogUztcbiAgICAgICAgZ2xfRnJhZ0NvbG9yID0gdmVjNChrRCArIGtTLCAxKTtcbiAgICAgIH1gLFxuXG4gICAgICB2ZXJ0OiBgXG4gICAgICBwcmVjaXNpb24gbWVkaXVtcCBmbG9hdDtcbiAgICAgIGF0dHJpYnV0ZSB2ZWMyIHBvc2l0aW9uO1xuICAgICAgdW5pZm9ybSB2ZWMyIGxpZ2h0UG9zaXRpb247XG4gICAgICB2YXJ5aW5nIHZlYzMgbGlnaHREaXIsIGV5ZURpcjtcbiAgICAgIHZhcnlpbmcgdmVjMiB1djtcbiAgICAgIHZvaWQgbWFpbiAoKSB7XG4gICAgICAgIHZlYzIgUCA9IDEuMCAtIDIuMCAqIHBvc2l0aW9uO1xuICAgICAgICB1diA9IHZlYzIocG9zaXRpb24ueCwgMS4wIC0gcG9zaXRpb24ueSk7XG4gICAgICAgIGV5ZURpciA9IC12ZWMzKFAsIDEpO1xuICAgICAgICBsaWdodERpciA9IHZlYzMobGlnaHRQb3NpdGlvbiAtIFAsIDEpO1xuICAgICAgICBnbF9Qb3NpdGlvbiA9IHZlYzQoUCwgMCwgMSk7XG4gICAgICB9YCxcblxuICAgICAgYXR0cmlidXRlczoge1xuICAgICAgICBwb3NpdGlvbjogW1xuICAgICAgICAgIC0yLCAwLFxuICAgICAgICAgIDAsIC0yLFxuICAgICAgICAgIDIsIDJcbiAgICAgICAgXVxuICAgICAgfSxcblxuICAgICAgdW5pZm9ybXM6IHtcbiAgICAgICAgc3BlY3VsYXI6IHNwZWN1bGFyLFxuICAgICAgICBub3JtYWxzOiBub3JtYWxzLFxuICAgICAgICBkaWZmdXNlOiBkaWZmdXNlLFxuICAgICAgICBsaWdodFBvc2l0aW9uOiAoe3RpY2t9KSA9PiB7XG4gICAgICAgICAgdmFyIHQgPSAwLjAyNSAqIHRpY2tcbiAgICAgICAgICByZXR1cm4gWzIuMCAqIE1hdGguY29zKHQpLCAyLjAgKiBNYXRoLnNpbih0KV1cbiAgICAgICAgfVxuICAgICAgfSxcblxuICAgICAgY291bnQ6IDNcbiAgICB9KVxuXG4gICAgcmVnbC5mcmFtZSgoKSA9PiB7XG4gICAgICBkcmF3KClcbiAgICB9KVxuICB9XG59KVxuIiwidmFyIEdMX0ZMT0FUID0gNTEyNlxuXG5mdW5jdGlvbiBBdHRyaWJ1dGVSZWNvcmQgKCkge1xuICB0aGlzLnN0YXRlID0gMFxuXG4gIHRoaXMueCA9IDAuMFxuICB0aGlzLnkgPSAwLjBcbiAgdGhpcy56ID0gMC4wXG4gIHRoaXMudyA9IDAuMFxuXG4gIHRoaXMuYnVmZmVyID0gbnVsbFxuICB0aGlzLnNpemUgPSAwXG4gIHRoaXMubm9ybWFsaXplZCA9IGZhbHNlXG4gIHRoaXMudHlwZSA9IEdMX0ZMT0FUXG4gIHRoaXMub2Zmc2V0ID0gMFxuICB0aGlzLnN0cmlkZSA9IDBcbiAgdGhpcy5kaXZpc29yID0gMFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBBdHRyaWJ1dGVTdGF0ZSAoXG4gIGdsLFxuICBleHRlbnNpb25zLFxuICBsaW1pdHMsXG4gIGJ1ZmZlclN0YXRlLFxuICBzdHJpbmdTdG9yZSkge1xuICB2YXIgTlVNX0FUVFJJQlVURVMgPSBsaW1pdHMubWF4QXR0cmlidXRlc1xuICB2YXIgYXR0cmlidXRlQmluZGluZ3MgPSBuZXcgQXJyYXkoTlVNX0FUVFJJQlVURVMpXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgTlVNX0FUVFJJQlVURVM7ICsraSkge1xuICAgIGF0dHJpYnV0ZUJpbmRpbmdzW2ldID0gbmV3IEF0dHJpYnV0ZVJlY29yZCgpXG4gIH1cblxuICByZXR1cm4ge1xuICAgIFJlY29yZDogQXR0cmlidXRlUmVjb3JkLFxuICAgIHNjb3BlOiB7fSxcbiAgICBzdGF0ZTogYXR0cmlidXRlQmluZGluZ3NcbiAgfVxufVxuIiwidmFyIGNoZWNrID0gcmVxdWlyZSgnLi91dGlsL2NoZWNrJylcbnZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL3V0aWwvaXMtdHlwZWQtYXJyYXknKVxudmFyIGlzTkRBcnJheUxpa2UgPSByZXF1aXJlKCcuL3V0aWwvaXMtbmRhcnJheScpXG52YXIgdmFsdWVzID0gcmVxdWlyZSgnLi91dGlsL3ZhbHVlcycpXG52YXIgcG9vbCA9IHJlcXVpcmUoJy4vdXRpbC9wb29sJylcbnZhciBmbGF0dGVuVXRpbCA9IHJlcXVpcmUoJy4vdXRpbC9mbGF0dGVuJylcblxudmFyIGFycmF5RmxhdHRlbiA9IGZsYXR0ZW5VdGlsLmZsYXR0ZW5cbnZhciBhcnJheVNoYXBlID0gZmxhdHRlblV0aWwuc2hhcGVcblxudmFyIGFycmF5VHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9hcnJheXR5cGVzLmpzb24nKVxudmFyIGJ1ZmZlclR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvZHR5cGVzLmpzb24nKVxudmFyIHVzYWdlVHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy91c2FnZS5qc29uJylcblxudmFyIEdMX1NUQVRJQ19EUkFXID0gMHg4OEU0XG52YXIgR0xfU1RSRUFNX0RSQVcgPSAweDg4RTBcblxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSA1MTIxXG52YXIgR0xfRkxPQVQgPSA1MTI2XG5cbnZhciBEVFlQRVNfU0laRVMgPSBbXVxuRFRZUEVTX1NJWkVTWzUxMjBdID0gMSAvLyBpbnQ4XG5EVFlQRVNfU0laRVNbNTEyMl0gPSAyIC8vIGludDE2XG5EVFlQRVNfU0laRVNbNTEyNF0gPSA0IC8vIGludDMyXG5EVFlQRVNfU0laRVNbNTEyMV0gPSAxIC8vIHVpbnQ4XG5EVFlQRVNfU0laRVNbNTEyM10gPSAyIC8vIHVpbnQxNlxuRFRZUEVTX1NJWkVTWzUxMjVdID0gNCAvLyB1aW50MzJcbkRUWVBFU19TSVpFU1s1MTI2XSA9IDQgLy8gZmxvYXQzMlxuXG5mdW5jdGlvbiB0eXBlZEFycmF5Q29kZSAoZGF0YSkge1xuICByZXR1cm4gYXJyYXlUeXBlc1tPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoZGF0YSldIHwgMFxufVxuXG5mdW5jdGlvbiBjb3B5QXJyYXkgKG91dCwgaW5wKSB7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgaW5wLmxlbmd0aDsgKytpKSB7XG4gICAgb3V0W2ldID0gaW5wW2ldXG4gIH1cbn1cblxuZnVuY3Rpb24gdHJhbnNwb3NlIChcbiAgcmVzdWx0LCBkYXRhLCBzaGFwZVgsIHNoYXBlWSwgc3RyaWRlWCwgc3RyaWRlWSwgb2Zmc2V0KSB7XG4gIHZhciBwdHIgPSAwXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc2hhcGVYOyArK2kpIHtcbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IHNoYXBlWTsgKytqKSB7XG4gICAgICByZXN1bHRbcHRyKytdID0gZGF0YVtzdHJpZGVYICogaSArIHN0cmlkZVkgKiBqICsgb2Zmc2V0XVxuICAgIH1cbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBCdWZmZXJTdGF0ZSAoZ2wsIHN0YXRzLCBjb25maWcpIHtcbiAgdmFyIGJ1ZmZlckNvdW50ID0gMFxuICB2YXIgYnVmZmVyU2V0ID0ge31cblxuICBmdW5jdGlvbiBSRUdMQnVmZmVyICh0eXBlKSB7XG4gICAgdGhpcy5pZCA9IGJ1ZmZlckNvdW50KytcbiAgICB0aGlzLmJ1ZmZlciA9IGdsLmNyZWF0ZUJ1ZmZlcigpXG4gICAgdGhpcy50eXBlID0gdHlwZVxuICAgIHRoaXMudXNhZ2UgPSBHTF9TVEFUSUNfRFJBV1xuICAgIHRoaXMuYnl0ZUxlbmd0aCA9IDBcbiAgICB0aGlzLmRpbWVuc2lvbiA9IDFcbiAgICB0aGlzLmR0eXBlID0gR0xfVU5TSUdORURfQllURVxuXG4gICAgdGhpcy5wZXJzaXN0ZW50RGF0YSA9IG51bGxcblxuICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgdGhpcy5zdGF0cyA9IHtzaXplOiAwfVxuICAgIH1cbiAgfVxuXG4gIFJFR0xCdWZmZXIucHJvdG90eXBlLmJpbmQgPSBmdW5jdGlvbiAoKSB7XG4gICAgZ2wuYmluZEJ1ZmZlcih0aGlzLnR5cGUsIHRoaXMuYnVmZmVyKVxuICB9XG5cbiAgUkVHTEJ1ZmZlci5wcm90b3R5cGUuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgICBkZXN0cm95KHRoaXMpXG4gIH1cblxuICB2YXIgc3RyZWFtUG9vbCA9IFtdXG5cbiAgZnVuY3Rpb24gY3JlYXRlU3RyZWFtICh0eXBlLCBkYXRhKSB7XG4gICAgdmFyIGJ1ZmZlciA9IHN0cmVhbVBvb2wucG9wKClcbiAgICBpZiAoIWJ1ZmZlcikge1xuICAgICAgYnVmZmVyID0gbmV3IFJFR0xCdWZmZXIodHlwZSlcbiAgICB9XG4gICAgYnVmZmVyLmJpbmQoKVxuICAgIGluaXRCdWZmZXJGcm9tRGF0YShidWZmZXIsIGRhdGEsIEdMX1NUUkVBTV9EUkFXLCAwLCAxLCBmYWxzZSlcbiAgICByZXR1cm4gYnVmZmVyXG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95U3RyZWFtIChzdHJlYW0pIHtcbiAgICBzdHJlYW1Qb29sLnB1c2goc3RyZWFtKVxuICB9XG5cbiAgZnVuY3Rpb24gaW5pdEJ1ZmZlckZyb21UeXBlZEFycmF5IChidWZmZXIsIGRhdGEsIHVzYWdlKSB7XG4gICAgYnVmZmVyLmJ5dGVMZW5ndGggPSBkYXRhLmJ5dGVMZW5ndGhcbiAgICBnbC5idWZmZXJEYXRhKGJ1ZmZlci50eXBlLCBkYXRhLCB1c2FnZSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGluaXRCdWZmZXJGcm9tRGF0YSAoYnVmZmVyLCBkYXRhLCB1c2FnZSwgZHR5cGUsIGRpbWVuc2lvbiwgcGVyc2lzdCkge1xuICAgIHZhciBzaGFwZVxuICAgIGJ1ZmZlci51c2FnZSA9IHVzYWdlXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YSkpIHtcbiAgICAgIGJ1ZmZlci5kdHlwZSA9IGR0eXBlIHx8IEdMX0ZMT0FUXG4gICAgICBpZiAoZGF0YS5sZW5ndGggPiAwKSB7XG4gICAgICAgIHZhciBmbGF0RGF0YVxuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShkYXRhWzBdKSkge1xuICAgICAgICAgIHNoYXBlID0gYXJyYXlTaGFwZShkYXRhKVxuICAgICAgICAgIHZhciBkaW0gPSAxXG4gICAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCBzaGFwZS5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgZGltICo9IHNoYXBlW2ldXG4gICAgICAgICAgfVxuICAgICAgICAgIGJ1ZmZlci5kaW1lbnNpb24gPSBkaW1cbiAgICAgICAgICBmbGF0RGF0YSA9IGFycmF5RmxhdHRlbihkYXRhLCBzaGFwZSwgYnVmZmVyLmR0eXBlKVxuICAgICAgICAgIGluaXRCdWZmZXJGcm9tVHlwZWRBcnJheShidWZmZXIsIGZsYXREYXRhLCB1c2FnZSlcbiAgICAgICAgICBpZiAocGVyc2lzdCkge1xuICAgICAgICAgICAgYnVmZmVyLnBlcnNpc3RlbnREYXRhID0gZmxhdERhdGFcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcG9vbC5mcmVlVHlwZShmbGF0RGF0YSlcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGRhdGFbMF0gPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgYnVmZmVyLmRpbWVuc2lvbiA9IGRpbWVuc2lvblxuICAgICAgICAgIHZhciB0eXBlZERhdGEgPSBwb29sLmFsbG9jVHlwZShidWZmZXIuZHR5cGUsIGRhdGEubGVuZ3RoKVxuICAgICAgICAgIGNvcHlBcnJheSh0eXBlZERhdGEsIGRhdGEpXG4gICAgICAgICAgaW5pdEJ1ZmZlckZyb21UeXBlZEFycmF5KGJ1ZmZlciwgdHlwZWREYXRhLCB1c2FnZSlcbiAgICAgICAgICBpZiAocGVyc2lzdCkge1xuICAgICAgICAgICAgYnVmZmVyLnBlcnNpc3RlbnREYXRhID0gdHlwZWREYXRhXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBvb2wuZnJlZVR5cGUodHlwZWREYXRhKVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChpc1R5cGVkQXJyYXkoZGF0YVswXSkpIHtcbiAgICAgICAgICBidWZmZXIuZGltZW5zaW9uID0gZGF0YVswXS5sZW5ndGhcbiAgICAgICAgICBidWZmZXIuZHR5cGUgPSBkdHlwZSB8fCB0eXBlZEFycmF5Q29kZShkYXRhWzBdKSB8fCBHTF9GTE9BVFxuICAgICAgICAgIGZsYXREYXRhID0gYXJyYXlGbGF0dGVuKFxuICAgICAgICAgICAgZGF0YSxcbiAgICAgICAgICAgIFtkYXRhLmxlbmd0aCwgZGF0YVswXS5sZW5ndGhdLFxuICAgICAgICAgICAgYnVmZmVyLmR0eXBlKVxuICAgICAgICAgIGluaXRCdWZmZXJGcm9tVHlwZWRBcnJheShidWZmZXIsIGZsYXREYXRhLCB1c2FnZSlcbiAgICAgICAgICBpZiAocGVyc2lzdCkge1xuICAgICAgICAgICAgYnVmZmVyLnBlcnNpc3RlbnREYXRhID0gZmxhdERhdGFcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcG9vbC5mcmVlVHlwZShmbGF0RGF0YSlcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY2hlY2sucmFpc2UoJ2ludmFsaWQgYnVmZmVyIGRhdGEnKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChpc1R5cGVkQXJyYXkoZGF0YSkpIHtcbiAgICAgIGJ1ZmZlci5kdHlwZSA9IGR0eXBlIHx8IHR5cGVkQXJyYXlDb2RlKGRhdGEpXG4gICAgICBidWZmZXIuZGltZW5zaW9uID0gZGltZW5zaW9uXG4gICAgICBpbml0QnVmZmVyRnJvbVR5cGVkQXJyYXkoYnVmZmVyLCBkYXRhLCB1c2FnZSlcbiAgICAgIGlmIChwZXJzaXN0KSB7XG4gICAgICAgIGJ1ZmZlci5wZXJzaXN0ZW50RGF0YSA9IG5ldyBVaW50OEFycmF5KG5ldyBVaW50OEFycmF5KGRhdGEuYnVmZmVyKSlcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGlzTkRBcnJheUxpa2UoZGF0YSkpIHtcbiAgICAgIHNoYXBlID0gZGF0YS5zaGFwZVxuICAgICAgdmFyIHN0cmlkZSA9IGRhdGEuc3RyaWRlXG4gICAgICB2YXIgb2Zmc2V0ID0gZGF0YS5vZmZzZXRcblxuICAgICAgdmFyIHNoYXBlWCA9IDBcbiAgICAgIHZhciBzaGFwZVkgPSAwXG4gICAgICB2YXIgc3RyaWRlWCA9IDBcbiAgICAgIHZhciBzdHJpZGVZID0gMFxuICAgICAgaWYgKHNoYXBlLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICBzaGFwZVggPSBzaGFwZVswXVxuICAgICAgICBzaGFwZVkgPSAxXG4gICAgICAgIHN0cmlkZVggPSBzdHJpZGVbMF1cbiAgICAgICAgc3RyaWRlWSA9IDBcbiAgICAgIH0gZWxzZSBpZiAoc2hhcGUubGVuZ3RoID09PSAyKSB7XG4gICAgICAgIHNoYXBlWCA9IHNoYXBlWzBdXG4gICAgICAgIHNoYXBlWSA9IHNoYXBlWzFdXG4gICAgICAgIHN0cmlkZVggPSBzdHJpZGVbMF1cbiAgICAgICAgc3RyaWRlWSA9IHN0cmlkZVsxXVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY2hlY2sucmFpc2UoJ2ludmFsaWQgc2hhcGUnKVxuICAgICAgfVxuXG4gICAgICBidWZmZXIuZHR5cGUgPSBkdHlwZSB8fCB0eXBlZEFycmF5Q29kZShkYXRhLmRhdGEpIHx8IEdMX0ZMT0FUXG4gICAgICBidWZmZXIuZGltZW5zaW9uID0gc2hhcGVZXG5cbiAgICAgIHZhciB0cmFuc3Bvc2VEYXRhID0gcG9vbC5hbGxvY1R5cGUoYnVmZmVyLmR0eXBlLCBzaGFwZVggKiBzaGFwZVkpXG4gICAgICB0cmFuc3Bvc2UodHJhbnNwb3NlRGF0YSxcbiAgICAgICAgZGF0YS5kYXRhLFxuICAgICAgICBzaGFwZVgsIHNoYXBlWSxcbiAgICAgICAgc3RyaWRlWCwgc3RyaWRlWSxcbiAgICAgICAgb2Zmc2V0KVxuICAgICAgaW5pdEJ1ZmZlckZyb21UeXBlZEFycmF5KGJ1ZmZlciwgdHJhbnNwb3NlRGF0YSwgdXNhZ2UpXG4gICAgICBpZiAocGVyc2lzdCkge1xuICAgICAgICBidWZmZXIucGVyc2lzdGVudERhdGEgPSB0cmFuc3Bvc2VEYXRhXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwb29sLmZyZWVUeXBlKHRyYW5zcG9zZURhdGEpXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNoZWNrLnJhaXNlKCdpbnZhbGlkIGJ1ZmZlciBkYXRhJylcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95IChidWZmZXIpIHtcbiAgICBzdGF0cy5idWZmZXJDb3VudC0tXG5cbiAgICB2YXIgaGFuZGxlID0gYnVmZmVyLmJ1ZmZlclxuICAgIGNoZWNrKGhhbmRsZSwgJ2J1ZmZlciBtdXN0IG5vdCBiZSBkZWxldGVkIGFscmVhZHknKVxuICAgIGdsLmRlbGV0ZUJ1ZmZlcihoYW5kbGUpXG4gICAgYnVmZmVyLmJ1ZmZlciA9IG51bGxcbiAgICBkZWxldGUgYnVmZmVyU2V0W2J1ZmZlci5pZF1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZUJ1ZmZlciAob3B0aW9ucywgdHlwZSwgZGVmZXJJbml0LCBwZXJzaXN0ZW50KSB7XG4gICAgc3RhdHMuYnVmZmVyQ291bnQrK1xuXG4gICAgdmFyIGJ1ZmZlciA9IG5ldyBSRUdMQnVmZmVyKHR5cGUpXG4gICAgYnVmZmVyU2V0W2J1ZmZlci5pZF0gPSBidWZmZXJcblxuICAgIGZ1bmN0aW9uIHJlZ2xCdWZmZXIgKG9wdGlvbnMpIHtcbiAgICAgIHZhciB1c2FnZSA9IEdMX1NUQVRJQ19EUkFXXG4gICAgICB2YXIgZGF0YSA9IG51bGxcbiAgICAgIHZhciBieXRlTGVuZ3RoID0gMFxuICAgICAgdmFyIGR0eXBlID0gMFxuICAgICAgdmFyIGRpbWVuc2lvbiA9IDFcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KG9wdGlvbnMpIHx8XG4gICAgICAgICAgaXNUeXBlZEFycmF5KG9wdGlvbnMpIHx8XG4gICAgICAgICAgaXNOREFycmF5TGlrZShvcHRpb25zKSkge1xuICAgICAgICBkYXRhID0gb3B0aW9uc1xuICAgICAgfSBlbHNlIGlmICh0eXBlb2Ygb3B0aW9ucyA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgYnl0ZUxlbmd0aCA9IG9wdGlvbnMgfCAwXG4gICAgICB9IGVsc2UgaWYgKG9wdGlvbnMpIHtcbiAgICAgICAgY2hlY2sudHlwZShcbiAgICAgICAgICBvcHRpb25zLCAnb2JqZWN0JyxcbiAgICAgICAgICAnYnVmZmVyIGFyZ3VtZW50cyBtdXN0IGJlIGFuIG9iamVjdCwgYSBudW1iZXIgb3IgYW4gYXJyYXknKVxuXG4gICAgICAgIGlmICgnZGF0YScgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGNoZWNrKFxuICAgICAgICAgICAgZGF0YSA9PT0gbnVsbCB8fFxuICAgICAgICAgICAgQXJyYXkuaXNBcnJheShkYXRhKSB8fFxuICAgICAgICAgICAgaXNUeXBlZEFycmF5KGRhdGEpIHx8XG4gICAgICAgICAgICBpc05EQXJyYXlMaWtlKGRhdGEpLFxuICAgICAgICAgICAgJ2ludmFsaWQgZGF0YSBmb3IgYnVmZmVyJylcbiAgICAgICAgICBkYXRhID0gb3B0aW9ucy5kYXRhXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ3VzYWdlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgY2hlY2sucGFyYW1ldGVyKG9wdGlvbnMudXNhZ2UsIHVzYWdlVHlwZXMsICdpbnZhbGlkIGJ1ZmZlciB1c2FnZScpXG4gICAgICAgICAgdXNhZ2UgPSB1c2FnZVR5cGVzW29wdGlvbnMudXNhZ2VdXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ3R5cGUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBjaGVjay5wYXJhbWV0ZXIob3B0aW9ucy50eXBlLCBidWZmZXJUeXBlcywgJ2ludmFsaWQgYnVmZmVyIHR5cGUnKVxuICAgICAgICAgIGR0eXBlID0gYnVmZmVyVHlwZXNbb3B0aW9ucy50eXBlXVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdkaW1lbnNpb24nIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBjaGVjay50eXBlKG9wdGlvbnMuZGltZW5zaW9uLCAnbnVtYmVyJywgJ2ludmFsaWQgZGltZW5zaW9uJylcbiAgICAgICAgICBkaW1lbnNpb24gPSBvcHRpb25zLmRpbWVuc2lvbiB8IDBcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnbGVuZ3RoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgY2hlY2subm5pKGJ5dGVMZW5ndGgsICdidWZmZXIgbGVuZ3RoIG11c3QgYmUgYSBub25uZWdhdGl2ZSBpbnRlZ2VyJylcbiAgICAgICAgICBieXRlTGVuZ3RoID0gb3B0aW9ucy5sZW5ndGggfCAwXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgYnVmZmVyLmJpbmQoKVxuICAgICAgaWYgKCFkYXRhKSB7XG4gICAgICAgIGdsLmJ1ZmZlckRhdGEoYnVmZmVyLnR5cGUsIGJ5dGVMZW5ndGgsIHVzYWdlKVxuICAgICAgICBidWZmZXIuZHR5cGUgPSBkdHlwZSB8fCBHTF9VTlNJR05FRF9CWVRFXG4gICAgICAgIGJ1ZmZlci51c2FnZSA9IHVzYWdlXG4gICAgICAgIGJ1ZmZlci5kaW1lbnNpb24gPSBkaW1lbnNpb25cbiAgICAgICAgYnVmZmVyLmJ5dGVMZW5ndGggPSBieXRlTGVuZ3RoXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpbml0QnVmZmVyRnJvbURhdGEoYnVmZmVyLCBkYXRhLCB1c2FnZSwgZHR5cGUsIGRpbWVuc2lvbiwgcGVyc2lzdGVudClcbiAgICAgIH1cblxuICAgICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICAgIGJ1ZmZlci5zdGF0cy5zaXplID0gYnVmZmVyLmJ5dGVMZW5ndGggKiBEVFlQRVNfU0laRVNbYnVmZmVyLmR0eXBlXVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmVnbEJ1ZmZlclxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHNldFN1YkRhdGEgKGRhdGEsIG9mZnNldCkge1xuICAgICAgY2hlY2sob2Zmc2V0ICsgZGF0YS5ieXRlTGVuZ3RoIDw9IGJ1ZmZlci5ieXRlTGVuZ3RoLFxuICAgICAgICAnaW52YWxpZCBidWZmZXIgc3ViZGF0YSBjYWxsLCBidWZmZXIgaXMgdG9vIHNtYWxsLiAnICsgJyBDYW5cXCd0IHdyaXRlIGRhdGEgb2Ygc2l6ZSAnICsgZGF0YS5ieXRlTGVuZ3RoICsgJyBzdGFydGluZyBmcm9tIG9mZnNldCAnICsgb2Zmc2V0ICsgJyB0byBhIGJ1ZmZlciBvZiBzaXplICcgKyBidWZmZXIuYnl0ZUxlbmd0aClcblxuICAgICAgZ2wuYnVmZmVyU3ViRGF0YShidWZmZXIudHlwZSwgb2Zmc2V0LCBkYXRhKVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHN1YmRhdGEgKGRhdGEsIG9mZnNldF8pIHtcbiAgICAgIHZhciBvZmZzZXQgPSAob2Zmc2V0XyB8fCAwKSB8IDBcbiAgICAgIHZhciBzaGFwZVxuICAgICAgYnVmZmVyLmJpbmQoKVxuICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YSkpIHtcbiAgICAgICAgaWYgKGRhdGEubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGlmICh0eXBlb2YgZGF0YVswXSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgIHZhciBjb252ZXJ0ZWQgPSBwb29sLmFsbG9jVHlwZShidWZmZXIuZHR5cGUsIGRhdGEubGVuZ3RoKVxuICAgICAgICAgICAgY29weUFycmF5KGNvbnZlcnRlZCwgZGF0YSlcbiAgICAgICAgICAgIHNldFN1YkRhdGEoY29udmVydGVkLCBvZmZzZXQpXG4gICAgICAgICAgICBwb29sLmZyZWVUeXBlKGNvbnZlcnRlZClcbiAgICAgICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoZGF0YVswXSkgfHwgaXNUeXBlZEFycmF5KGRhdGFbMF0pKSB7XG4gICAgICAgICAgICBzaGFwZSA9IGFycmF5U2hhcGUoZGF0YSlcbiAgICAgICAgICAgIHZhciBmbGF0RGF0YSA9IGFycmF5RmxhdHRlbihkYXRhLCBzaGFwZSwgYnVmZmVyLmR0eXBlKVxuICAgICAgICAgICAgc2V0U3ViRGF0YShmbGF0RGF0YSwgb2Zmc2V0KVxuICAgICAgICAgICAgcG9vbC5mcmVlVHlwZShmbGF0RGF0YSlcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY2hlY2sucmFpc2UoJ2ludmFsaWQgYnVmZmVyIGRhdGEnKVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChpc1R5cGVkQXJyYXkoZGF0YSkpIHtcbiAgICAgICAgc2V0U3ViRGF0YShkYXRhLCBvZmZzZXQpXG4gICAgICB9IGVsc2UgaWYgKGlzTkRBcnJheUxpa2UoZGF0YSkpIHtcbiAgICAgICAgc2hhcGUgPSBkYXRhLnNoYXBlXG4gICAgICAgIHZhciBzdHJpZGUgPSBkYXRhLnN0cmlkZVxuXG4gICAgICAgIHZhciBzaGFwZVggPSAwXG4gICAgICAgIHZhciBzaGFwZVkgPSAwXG4gICAgICAgIHZhciBzdHJpZGVYID0gMFxuICAgICAgICB2YXIgc3RyaWRlWSA9IDBcbiAgICAgICAgaWYgKHNoYXBlLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgIHNoYXBlWCA9IHNoYXBlWzBdXG4gICAgICAgICAgc2hhcGVZID0gMVxuICAgICAgICAgIHN0cmlkZVggPSBzdHJpZGVbMF1cbiAgICAgICAgICBzdHJpZGVZID0gMFxuICAgICAgICB9IGVsc2UgaWYgKHNoYXBlLmxlbmd0aCA9PT0gMikge1xuICAgICAgICAgIHNoYXBlWCA9IHNoYXBlWzBdXG4gICAgICAgICAgc2hhcGVZID0gc2hhcGVbMV1cbiAgICAgICAgICBzdHJpZGVYID0gc3RyaWRlWzBdXG4gICAgICAgICAgc3RyaWRlWSA9IHN0cmlkZVsxXVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNoZWNrLnJhaXNlKCdpbnZhbGlkIHNoYXBlJylcbiAgICAgICAgfVxuICAgICAgICB2YXIgZHR5cGUgPSBBcnJheS5pc0FycmF5KGRhdGEuZGF0YSlcbiAgICAgICAgICA/IGJ1ZmZlci5kdHlwZVxuICAgICAgICAgIDogdHlwZWRBcnJheUNvZGUoZGF0YS5kYXRhKVxuXG4gICAgICAgIHZhciB0cmFuc3Bvc2VEYXRhID0gcG9vbC5hbGxvY1R5cGUoZHR5cGUsIHNoYXBlWCAqIHNoYXBlWSlcbiAgICAgICAgdHJhbnNwb3NlKHRyYW5zcG9zZURhdGEsXG4gICAgICAgICAgZGF0YS5kYXRhLFxuICAgICAgICAgIHNoYXBlWCwgc2hhcGVZLFxuICAgICAgICAgIHN0cmlkZVgsIHN0cmlkZVksXG4gICAgICAgICAgZGF0YS5vZmZzZXQpXG4gICAgICAgIHNldFN1YkRhdGEodHJhbnNwb3NlRGF0YSwgb2Zmc2V0KVxuICAgICAgICBwb29sLmZyZWVUeXBlKHRyYW5zcG9zZURhdGEpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjaGVjay5yYWlzZSgnaW52YWxpZCBkYXRhIGZvciBidWZmZXIgc3ViZGF0YScpXG4gICAgICB9XG4gICAgICByZXR1cm4gcmVnbEJ1ZmZlclxuICAgIH1cblxuICAgIGlmICghZGVmZXJJbml0KSB7XG4gICAgICByZWdsQnVmZmVyKG9wdGlvbnMpXG4gICAgfVxuXG4gICAgcmVnbEJ1ZmZlci5fcmVnbFR5cGUgPSAnYnVmZmVyJ1xuICAgIHJlZ2xCdWZmZXIuX2J1ZmZlciA9IGJ1ZmZlclxuICAgIHJlZ2xCdWZmZXIuc3ViZGF0YSA9IHN1YmRhdGFcbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgIHJlZ2xCdWZmZXIuc3RhdHMgPSBidWZmZXIuc3RhdHNcbiAgICB9XG4gICAgcmVnbEJ1ZmZlci5kZXN0cm95ID0gZnVuY3Rpb24gKCkgeyBkZXN0cm95KGJ1ZmZlcikgfVxuXG4gICAgcmV0dXJuIHJlZ2xCdWZmZXJcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlc3RvcmVCdWZmZXJzICgpIHtcbiAgICB2YWx1ZXMoYnVmZmVyU2V0KS5mb3JFYWNoKGZ1bmN0aW9uIChidWZmZXIpIHtcbiAgICAgIGJ1ZmZlci5idWZmZXIgPSBnbC5jcmVhdGVCdWZmZXIoKVxuICAgICAgZ2wuYmluZEJ1ZmZlcihidWZmZXIudHlwZSwgYnVmZmVyLmJ1ZmZlcilcbiAgICAgIGdsLmJ1ZmZlckRhdGEoXG4gICAgICAgIGJ1ZmZlci50eXBlLCBidWZmZXIucGVyc2lzdGVudERhdGEgfHwgYnVmZmVyLmJ5dGVMZW5ndGgsIGJ1ZmZlci51c2FnZSlcbiAgICB9KVxuICB9XG5cbiAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgc3RhdHMuZ2V0VG90YWxCdWZmZXJTaXplID0gZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIHRvdGFsID0gMFxuICAgICAgLy8gVE9ETzogUmlnaHQgbm93LCB0aGUgc3RyZWFtcyBhcmUgbm90IHBhcnQgb2YgdGhlIHRvdGFsIGNvdW50LlxuICAgICAgT2JqZWN0LmtleXMoYnVmZmVyU2V0KS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgdG90YWwgKz0gYnVmZmVyU2V0W2tleV0uc3RhdHMuc2l6ZVxuICAgICAgfSlcbiAgICAgIHJldHVybiB0b3RhbFxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY3JlYXRlOiBjcmVhdGVCdWZmZXIsXG5cbiAgICBjcmVhdGVTdHJlYW06IGNyZWF0ZVN0cmVhbSxcbiAgICBkZXN0cm95U3RyZWFtOiBkZXN0cm95U3RyZWFtLFxuXG4gICAgY2xlYXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhbHVlcyhidWZmZXJTZXQpLmZvckVhY2goZGVzdHJveSlcbiAgICAgIHN0cmVhbVBvb2wuZm9yRWFjaChkZXN0cm95KVxuICAgIH0sXG5cbiAgICBnZXRCdWZmZXI6IGZ1bmN0aW9uICh3cmFwcGVyKSB7XG4gICAgICBpZiAod3JhcHBlciAmJiB3cmFwcGVyLl9idWZmZXIgaW5zdGFuY2VvZiBSRUdMQnVmZmVyKSB7XG4gICAgICAgIHJldHVybiB3cmFwcGVyLl9idWZmZXJcbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsXG4gICAgfSxcblxuICAgIHJlc3RvcmU6IHJlc3RvcmVCdWZmZXJzLFxuXG4gICAgX2luaXRCdWZmZXI6IGluaXRCdWZmZXJGcm9tRGF0YVxuICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gIFwiW29iamVjdCBJbnQ4QXJyYXldXCI6IDUxMjBcbiwgXCJbb2JqZWN0IEludDE2QXJyYXldXCI6IDUxMjJcbiwgXCJbb2JqZWN0IEludDMyQXJyYXldXCI6IDUxMjRcbiwgXCJbb2JqZWN0IFVpbnQ4QXJyYXldXCI6IDUxMjFcbiwgXCJbb2JqZWN0IFVpbnQ4Q2xhbXBlZEFycmF5XVwiOiA1MTIxXG4sIFwiW29iamVjdCBVaW50MTZBcnJheV1cIjogNTEyM1xuLCBcIltvYmplY3QgVWludDMyQXJyYXldXCI6IDUxMjVcbiwgXCJbb2JqZWN0IEZsb2F0MzJBcnJheV1cIjogNTEyNlxuLCBcIltvYmplY3QgRmxvYXQ2NEFycmF5XVwiOiA1MTIxXG4sIFwiW29iamVjdCBBcnJheUJ1ZmZlcl1cIjogNTEyMVxufVxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICBcImludDhcIjogNTEyMFxuLCBcImludDE2XCI6IDUxMjJcbiwgXCJpbnQzMlwiOiA1MTI0XG4sIFwidWludDhcIjogNTEyMVxuLCBcInVpbnQxNlwiOiA1MTIzXG4sIFwidWludDMyXCI6IDUxMjVcbiwgXCJmbG9hdFwiOiA1MTI2XG4sIFwiZmxvYXQzMlwiOiA1MTI2XG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gIFwicG9pbnRzXCI6IDAsXG4gIFwicG9pbnRcIjogMCxcbiAgXCJsaW5lc1wiOiAxLFxuICBcImxpbmVcIjogMSxcbiAgXCJsaW5lIGxvb3BcIjogMixcbiAgXCJsaW5lIHN0cmlwXCI6IDMsXG4gIFwidHJpYW5nbGVzXCI6IDQsXG4gIFwidHJpYW5nbGVcIjogNCxcbiAgXCJ0cmlhbmdsZSBzdHJpcFwiOiA1LFxuICBcInRyaWFuZ2xlIGZhblwiOiA2XG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gIFwic3RhdGljXCI6IDM1MDQ0LFxuICBcImR5bmFtaWNcIjogMzUwNDgsXG4gIFwic3RyZWFtXCI6IDM1MDQwXG59XG4iLCJ2YXIgY2hlY2sgPSByZXF1aXJlKCcuL3V0aWwvY2hlY2snKVxudmFyIGNyZWF0ZUVudmlyb25tZW50ID0gcmVxdWlyZSgnLi91dGlsL2NvZGVnZW4nKVxudmFyIGxvb3AgPSByZXF1aXJlKCcuL3V0aWwvbG9vcCcpXG52YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi91dGlsL2lzLXR5cGVkLWFycmF5JylcbnZhciBpc05EQXJyYXkgPSByZXF1aXJlKCcuL3V0aWwvaXMtbmRhcnJheScpXG52YXIgaXNBcnJheUxpa2UgPSByZXF1aXJlKCcuL3V0aWwvaXMtYXJyYXktbGlrZScpXG52YXIgZHluYW1pYyA9IHJlcXVpcmUoJy4vZHluYW1pYycpXG5cbnZhciBwcmltVHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9wcmltaXRpdmVzLmpzb24nKVxudmFyIGdsVHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9kdHlwZXMuanNvbicpXG5cbi8vIFwiY3V0ZVwiIG5hbWVzIGZvciB2ZWN0b3IgY29tcG9uZW50c1xudmFyIENVVEVfQ09NUE9ORU5UUyA9ICd4eXp3Jy5zcGxpdCgnJylcblxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSA1MTIxXG5cbnZhciBBVFRSSUJfU1RBVEVfUE9JTlRFUiA9IDFcbnZhciBBVFRSSUJfU1RBVEVfQ09OU1RBTlQgPSAyXG5cbnZhciBEWU5fRlVOQyA9IDBcbnZhciBEWU5fUFJPUCA9IDFcbnZhciBEWU5fQ09OVEVYVCA9IDJcbnZhciBEWU5fU1RBVEUgPSAzXG52YXIgRFlOX1RIVU5LID0gNFxuXG52YXIgU19ESVRIRVIgPSAnZGl0aGVyJ1xudmFyIFNfQkxFTkRfRU5BQkxFID0gJ2JsZW5kLmVuYWJsZSdcbnZhciBTX0JMRU5EX0NPTE9SID0gJ2JsZW5kLmNvbG9yJ1xudmFyIFNfQkxFTkRfRVFVQVRJT04gPSAnYmxlbmQuZXF1YXRpb24nXG52YXIgU19CTEVORF9GVU5DID0gJ2JsZW5kLmZ1bmMnXG52YXIgU19ERVBUSF9FTkFCTEUgPSAnZGVwdGguZW5hYmxlJ1xudmFyIFNfREVQVEhfRlVOQyA9ICdkZXB0aC5mdW5jJ1xudmFyIFNfREVQVEhfUkFOR0UgPSAnZGVwdGgucmFuZ2UnXG52YXIgU19ERVBUSF9NQVNLID0gJ2RlcHRoLm1hc2snXG52YXIgU19DT0xPUl9NQVNLID0gJ2NvbG9yTWFzaydcbnZhciBTX0NVTExfRU5BQkxFID0gJ2N1bGwuZW5hYmxlJ1xudmFyIFNfQ1VMTF9GQUNFID0gJ2N1bGwuZmFjZSdcbnZhciBTX0ZST05UX0ZBQ0UgPSAnZnJvbnRGYWNlJ1xudmFyIFNfTElORV9XSURUSCA9ICdsaW5lV2lkdGgnXG52YXIgU19QT0xZR09OX09GRlNFVF9FTkFCTEUgPSAncG9seWdvbk9mZnNldC5lbmFibGUnXG52YXIgU19QT0xZR09OX09GRlNFVF9PRkZTRVQgPSAncG9seWdvbk9mZnNldC5vZmZzZXQnXG52YXIgU19TQU1QTEVfQUxQSEEgPSAnc2FtcGxlLmFscGhhJ1xudmFyIFNfU0FNUExFX0VOQUJMRSA9ICdzYW1wbGUuZW5hYmxlJ1xudmFyIFNfU0FNUExFX0NPVkVSQUdFID0gJ3NhbXBsZS5jb3ZlcmFnZSdcbnZhciBTX1NURU5DSUxfRU5BQkxFID0gJ3N0ZW5jaWwuZW5hYmxlJ1xudmFyIFNfU1RFTkNJTF9NQVNLID0gJ3N0ZW5jaWwubWFzaydcbnZhciBTX1NURU5DSUxfRlVOQyA9ICdzdGVuY2lsLmZ1bmMnXG52YXIgU19TVEVOQ0lMX09QRlJPTlQgPSAnc3RlbmNpbC5vcEZyb250J1xudmFyIFNfU1RFTkNJTF9PUEJBQ0sgPSAnc3RlbmNpbC5vcEJhY2snXG52YXIgU19TQ0lTU09SX0VOQUJMRSA9ICdzY2lzc29yLmVuYWJsZSdcbnZhciBTX1NDSVNTT1JfQk9YID0gJ3NjaXNzb3IuYm94J1xudmFyIFNfVklFV1BPUlQgPSAndmlld3BvcnQnXG5cbnZhciBTX1BST0ZJTEUgPSAncHJvZmlsZSdcblxudmFyIFNfRlJBTUVCVUZGRVIgPSAnZnJhbWVidWZmZXInXG52YXIgU19WRVJUID0gJ3ZlcnQnXG52YXIgU19GUkFHID0gJ2ZyYWcnXG52YXIgU19FTEVNRU5UUyA9ICdlbGVtZW50cydcbnZhciBTX1BSSU1JVElWRSA9ICdwcmltaXRpdmUnXG52YXIgU19DT1VOVCA9ICdjb3VudCdcbnZhciBTX09GRlNFVCA9ICdvZmZzZXQnXG52YXIgU19JTlNUQU5DRVMgPSAnaW5zdGFuY2VzJ1xuXG52YXIgU1VGRklYX1dJRFRIID0gJ1dpZHRoJ1xudmFyIFNVRkZJWF9IRUlHSFQgPSAnSGVpZ2h0J1xuXG52YXIgU19GUkFNRUJVRkZFUl9XSURUSCA9IFNfRlJBTUVCVUZGRVIgKyBTVUZGSVhfV0lEVEhcbnZhciBTX0ZSQU1FQlVGRkVSX0hFSUdIVCA9IFNfRlJBTUVCVUZGRVIgKyBTVUZGSVhfSEVJR0hUXG52YXIgU19WSUVXUE9SVF9XSURUSCA9IFNfVklFV1BPUlQgKyBTVUZGSVhfV0lEVEhcbnZhciBTX1ZJRVdQT1JUX0hFSUdIVCA9IFNfVklFV1BPUlQgKyBTVUZGSVhfSEVJR0hUXG52YXIgU19EUkFXSU5HQlVGRkVSID0gJ2RyYXdpbmdCdWZmZXInXG52YXIgU19EUkFXSU5HQlVGRkVSX1dJRFRIID0gU19EUkFXSU5HQlVGRkVSICsgU1VGRklYX1dJRFRIXG52YXIgU19EUkFXSU5HQlVGRkVSX0hFSUdIVCA9IFNfRFJBV0lOR0JVRkZFUiArIFNVRkZJWF9IRUlHSFRcblxudmFyIE5FU1RFRF9PUFRJT05TID0gW1xuICBTX0JMRU5EX0ZVTkMsXG4gIFNfQkxFTkRfRVFVQVRJT04sXG4gIFNfU1RFTkNJTF9GVU5DLFxuICBTX1NURU5DSUxfT1BGUk9OVCxcbiAgU19TVEVOQ0lMX09QQkFDSyxcbiAgU19TQU1QTEVfQ09WRVJBR0UsXG4gIFNfVklFV1BPUlQsXG4gIFNfU0NJU1NPUl9CT1gsXG4gIFNfUE9MWUdPTl9PRkZTRVRfT0ZGU0VUXG5dXG5cbnZhciBHTF9BUlJBWV9CVUZGRVIgPSAzNDk2MlxudmFyIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSID0gMzQ5NjNcblxudmFyIEdMX0ZSQUdNRU5UX1NIQURFUiA9IDM1NjMyXG52YXIgR0xfVkVSVEVYX1NIQURFUiA9IDM1NjMzXG5cbnZhciBHTF9URVhUVVJFXzJEID0gMHgwREUxXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUCA9IDB4ODUxM1xuXG52YXIgR0xfQ1VMTF9GQUNFID0gMHgwQjQ0XG52YXIgR0xfQkxFTkQgPSAweDBCRTJcbnZhciBHTF9ESVRIRVIgPSAweDBCRDBcbnZhciBHTF9TVEVOQ0lMX1RFU1QgPSAweDBCOTBcbnZhciBHTF9ERVBUSF9URVNUID0gMHgwQjcxXG52YXIgR0xfU0NJU1NPUl9URVNUID0gMHgwQzExXG52YXIgR0xfUE9MWUdPTl9PRkZTRVRfRklMTCA9IDB4ODAzN1xudmFyIEdMX1NBTVBMRV9BTFBIQV9UT19DT1ZFUkFHRSA9IDB4ODA5RVxudmFyIEdMX1NBTVBMRV9DT1ZFUkFHRSA9IDB4ODBBMFxuXG52YXIgR0xfRkxPQVQgPSA1MTI2XG52YXIgR0xfRkxPQVRfVkVDMiA9IDM1NjY0XG52YXIgR0xfRkxPQVRfVkVDMyA9IDM1NjY1XG52YXIgR0xfRkxPQVRfVkVDNCA9IDM1NjY2XG52YXIgR0xfSU5UID0gNTEyNFxudmFyIEdMX0lOVF9WRUMyID0gMzU2NjdcbnZhciBHTF9JTlRfVkVDMyA9IDM1NjY4XG52YXIgR0xfSU5UX1ZFQzQgPSAzNTY2OVxudmFyIEdMX0JPT0wgPSAzNTY3MFxudmFyIEdMX0JPT0xfVkVDMiA9IDM1NjcxXG52YXIgR0xfQk9PTF9WRUMzID0gMzU2NzJcbnZhciBHTF9CT09MX1ZFQzQgPSAzNTY3M1xudmFyIEdMX0ZMT0FUX01BVDIgPSAzNTY3NFxudmFyIEdMX0ZMT0FUX01BVDMgPSAzNTY3NVxudmFyIEdMX0ZMT0FUX01BVDQgPSAzNTY3NlxudmFyIEdMX1NBTVBMRVJfMkQgPSAzNTY3OFxudmFyIEdMX1NBTVBMRVJfQ1VCRSA9IDM1NjgwXG5cbnZhciBHTF9UUklBTkdMRVMgPSA0XG5cbnZhciBHTF9GUk9OVCA9IDEwMjhcbnZhciBHTF9CQUNLID0gMTAyOVxudmFyIEdMX0NXID0gMHgwOTAwXG52YXIgR0xfQ0NXID0gMHgwOTAxXG52YXIgR0xfTUlOX0VYVCA9IDB4ODAwN1xudmFyIEdMX01BWF9FWFQgPSAweDgwMDhcbnZhciBHTF9BTFdBWVMgPSA1MTlcbnZhciBHTF9LRUVQID0gNzY4MFxudmFyIEdMX1pFUk8gPSAwXG52YXIgR0xfT05FID0gMVxudmFyIEdMX0ZVTkNfQUREID0gMHg4MDA2XG52YXIgR0xfTEVTUyA9IDUxM1xuXG52YXIgR0xfRlJBTUVCVUZGRVIgPSAweDhENDBcbnZhciBHTF9DT0xPUl9BVFRBQ0hNRU5UMCA9IDB4OENFMFxuXG52YXIgYmxlbmRGdW5jcyA9IHtcbiAgJzAnOiAwLFxuICAnMSc6IDEsXG4gICd6ZXJvJzogMCxcbiAgJ29uZSc6IDEsXG4gICdzcmMgY29sb3InOiA3NjgsXG4gICdvbmUgbWludXMgc3JjIGNvbG9yJzogNzY5LFxuICAnc3JjIGFscGhhJzogNzcwLFxuICAnb25lIG1pbnVzIHNyYyBhbHBoYSc6IDc3MSxcbiAgJ2RzdCBjb2xvcic6IDc3NCxcbiAgJ29uZSBtaW51cyBkc3QgY29sb3InOiA3NzUsXG4gICdkc3QgYWxwaGEnOiA3NzIsXG4gICdvbmUgbWludXMgZHN0IGFscGhhJzogNzczLFxuICAnY29uc3RhbnQgY29sb3InOiAzMjc2OSxcbiAgJ29uZSBtaW51cyBjb25zdGFudCBjb2xvcic6IDMyNzcwLFxuICAnY29uc3RhbnQgYWxwaGEnOiAzMjc3MSxcbiAgJ29uZSBtaW51cyBjb25zdGFudCBhbHBoYSc6IDMyNzcyLFxuICAnc3JjIGFscGhhIHNhdHVyYXRlJzogNzc2XG59XG5cbi8vIFRoZXJlIGFyZSBpbnZhbGlkIHZhbHVlcyBmb3Igc3JjUkdCIGFuZCBkc3RSR0IuIFNlZTpcbi8vIGh0dHBzOi8vd3d3Lmtocm9ub3Mub3JnL3JlZ2lzdHJ5L3dlYmdsL3NwZWNzLzEuMC8jNi4xM1xuLy8gaHR0cHM6Ly9naXRodWIuY29tL0tocm9ub3NHcm91cC9XZWJHTC9ibG9iLzBkMzIwMWY1ZjdlYzNjMDA2MGJjMWYwNDA3NzQ2MTU0MWYxOTg3YjkvY29uZm9ybWFuY2Utc3VpdGVzLzEuMC4zL2NvbmZvcm1hbmNlL21pc2Mvd2ViZ2wtc3BlY2lmaWMuaHRtbCNMNTZcbnZhciBpbnZhbGlkQmxlbmRDb21iaW5hdGlvbnMgPSBbXG4gICdjb25zdGFudCBjb2xvciwgY29uc3RhbnQgYWxwaGEnLFxuICAnb25lIG1pbnVzIGNvbnN0YW50IGNvbG9yLCBjb25zdGFudCBhbHBoYScsXG4gICdjb25zdGFudCBjb2xvciwgb25lIG1pbnVzIGNvbnN0YW50IGFscGhhJyxcbiAgJ29uZSBtaW51cyBjb25zdGFudCBjb2xvciwgb25lIG1pbnVzIGNvbnN0YW50IGFscGhhJyxcbiAgJ2NvbnN0YW50IGFscGhhLCBjb25zdGFudCBjb2xvcicsXG4gICdjb25zdGFudCBhbHBoYSwgb25lIG1pbnVzIGNvbnN0YW50IGNvbG9yJyxcbiAgJ29uZSBtaW51cyBjb25zdGFudCBhbHBoYSwgY29uc3RhbnQgY29sb3InLFxuICAnb25lIG1pbnVzIGNvbnN0YW50IGFscGhhLCBvbmUgbWludXMgY29uc3RhbnQgY29sb3InXG5dXG5cbnZhciBjb21wYXJlRnVuY3MgPSB7XG4gICduZXZlcic6IDUxMixcbiAgJ2xlc3MnOiA1MTMsXG4gICc8JzogNTEzLFxuICAnZXF1YWwnOiA1MTQsXG4gICc9JzogNTE0LFxuICAnPT0nOiA1MTQsXG4gICc9PT0nOiA1MTQsXG4gICdsZXF1YWwnOiA1MTUsXG4gICc8PSc6IDUxNSxcbiAgJ2dyZWF0ZXInOiA1MTYsXG4gICc+JzogNTE2LFxuICAnbm90ZXF1YWwnOiA1MTcsXG4gICchPSc6IDUxNyxcbiAgJyE9PSc6IDUxNyxcbiAgJ2dlcXVhbCc6IDUxOCxcbiAgJz49JzogNTE4LFxuICAnYWx3YXlzJzogNTE5XG59XG5cbnZhciBzdGVuY2lsT3BzID0ge1xuICAnMCc6IDAsXG4gICd6ZXJvJzogMCxcbiAgJ2tlZXAnOiA3NjgwLFxuICAncmVwbGFjZSc6IDc2ODEsXG4gICdpbmNyZW1lbnQnOiA3NjgyLFxuICAnZGVjcmVtZW50JzogNzY4MyxcbiAgJ2luY3JlbWVudCB3cmFwJzogMzQwNTUsXG4gICdkZWNyZW1lbnQgd3JhcCc6IDM0MDU2LFxuICAnaW52ZXJ0JzogNTM4NlxufVxuXG52YXIgc2hhZGVyVHlwZSA9IHtcbiAgJ2ZyYWcnOiBHTF9GUkFHTUVOVF9TSEFERVIsXG4gICd2ZXJ0JzogR0xfVkVSVEVYX1NIQURFUlxufVxuXG52YXIgb3JpZW50YXRpb25UeXBlID0ge1xuICAnY3cnOiBHTF9DVyxcbiAgJ2Njdyc6IEdMX0NDV1xufVxuXG5mdW5jdGlvbiBpc0J1ZmZlckFyZ3MgKHgpIHtcbiAgcmV0dXJuIEFycmF5LmlzQXJyYXkoeCkgfHxcbiAgICBpc1R5cGVkQXJyYXkoeCkgfHxcbiAgICBpc05EQXJyYXkoeClcbn1cblxuLy8gTWFrZSBzdXJlIHZpZXdwb3J0IGlzIHByb2Nlc3NlZCBmaXJzdFxuZnVuY3Rpb24gc29ydFN0YXRlIChzdGF0ZSkge1xuICByZXR1cm4gc3RhdGUuc29ydChmdW5jdGlvbiAoYSwgYikge1xuICAgIGlmIChhID09PSBTX1ZJRVdQT1JUKSB7XG4gICAgICByZXR1cm4gLTFcbiAgICB9IGVsc2UgaWYgKGIgPT09IFNfVklFV1BPUlQpIHtcbiAgICAgIHJldHVybiAxXG4gICAgfVxuICAgIHJldHVybiAoYSA8IGIpID8gLTEgOiAxXG4gIH0pXG59XG5cbmZ1bmN0aW9uIERlY2xhcmF0aW9uICh0aGlzRGVwLCBjb250ZXh0RGVwLCBwcm9wRGVwLCBhcHBlbmQpIHtcbiAgdGhpcy50aGlzRGVwID0gdGhpc0RlcFxuICB0aGlzLmNvbnRleHREZXAgPSBjb250ZXh0RGVwXG4gIHRoaXMucHJvcERlcCA9IHByb3BEZXBcbiAgdGhpcy5hcHBlbmQgPSBhcHBlbmRcbn1cblxuZnVuY3Rpb24gaXNTdGF0aWMgKGRlY2wpIHtcbiAgcmV0dXJuIGRlY2wgJiYgIShkZWNsLnRoaXNEZXAgfHwgZGVjbC5jb250ZXh0RGVwIHx8IGRlY2wucHJvcERlcClcbn1cblxuZnVuY3Rpb24gY3JlYXRlU3RhdGljRGVjbCAoYXBwZW5kKSB7XG4gIHJldHVybiBuZXcgRGVjbGFyYXRpb24oZmFsc2UsIGZhbHNlLCBmYWxzZSwgYXBwZW5kKVxufVxuXG5mdW5jdGlvbiBjcmVhdGVEeW5hbWljRGVjbCAoZHluLCBhcHBlbmQpIHtcbiAgdmFyIHR5cGUgPSBkeW4udHlwZVxuICBpZiAodHlwZSA9PT0gRFlOX0ZVTkMpIHtcbiAgICB2YXIgbnVtQXJncyA9IGR5bi5kYXRhLmxlbmd0aFxuICAgIHJldHVybiBuZXcgRGVjbGFyYXRpb24oXG4gICAgICB0cnVlLFxuICAgICAgbnVtQXJncyA+PSAxLFxuICAgICAgbnVtQXJncyA+PSAyLFxuICAgICAgYXBwZW5kKVxuICB9IGVsc2UgaWYgKHR5cGUgPT09IERZTl9USFVOSykge1xuICAgIHZhciBkYXRhID0gZHluLmRhdGFcbiAgICByZXR1cm4gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgZGF0YS50aGlzRGVwLFxuICAgICAgZGF0YS5jb250ZXh0RGVwLFxuICAgICAgZGF0YS5wcm9wRGVwLFxuICAgICAgYXBwZW5kKVxuICB9IGVsc2Uge1xuICAgIHJldHVybiBuZXcgRGVjbGFyYXRpb24oXG4gICAgICB0eXBlID09PSBEWU5fU1RBVEUsXG4gICAgICB0eXBlID09PSBEWU5fQ09OVEVYVCxcbiAgICAgIHR5cGUgPT09IERZTl9QUk9QLFxuICAgICAgYXBwZW5kKVxuICB9XG59XG5cbnZhciBTQ09QRV9ERUNMID0gbmV3IERlY2xhcmF0aW9uKGZhbHNlLCBmYWxzZSwgZmFsc2UsIGZ1bmN0aW9uICgpIHt9KVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHJlZ2xDb3JlIChcbiAgZ2wsXG4gIHN0cmluZ1N0b3JlLFxuICBleHRlbnNpb25zLFxuICBsaW1pdHMsXG4gIGJ1ZmZlclN0YXRlLFxuICBlbGVtZW50U3RhdGUsXG4gIHRleHR1cmVTdGF0ZSxcbiAgZnJhbWVidWZmZXJTdGF0ZSxcbiAgdW5pZm9ybVN0YXRlLFxuICBhdHRyaWJ1dGVTdGF0ZSxcbiAgc2hhZGVyU3RhdGUsXG4gIGRyYXdTdGF0ZSxcbiAgY29udGV4dFN0YXRlLFxuICB0aW1lcixcbiAgY29uZmlnKSB7XG4gIHZhciBBdHRyaWJ1dGVSZWNvcmQgPSBhdHRyaWJ1dGVTdGF0ZS5SZWNvcmRcblxuICB2YXIgYmxlbmRFcXVhdGlvbnMgPSB7XG4gICAgJ2FkZCc6IDMyNzc0LFxuICAgICdzdWJ0cmFjdCc6IDMyNzc4LFxuICAgICdyZXZlcnNlIHN1YnRyYWN0JzogMzI3NzlcbiAgfVxuICBpZiAoZXh0ZW5zaW9ucy5leHRfYmxlbmRfbWlubWF4KSB7XG4gICAgYmxlbmRFcXVhdGlvbnMubWluID0gR0xfTUlOX0VYVFxuICAgIGJsZW5kRXF1YXRpb25zLm1heCA9IEdMX01BWF9FWFRcbiAgfVxuXG4gIHZhciBleHRJbnN0YW5jaW5nID0gZXh0ZW5zaW9ucy5hbmdsZV9pbnN0YW5jZWRfYXJyYXlzXG4gIHZhciBleHREcmF3QnVmZmVycyA9IGV4dGVuc2lvbnMud2ViZ2xfZHJhd19idWZmZXJzXG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBXRUJHTCBTVEFURVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIHZhciBjdXJyZW50U3RhdGUgPSB7XG4gICAgZGlydHk6IHRydWUsXG4gICAgcHJvZmlsZTogY29uZmlnLnByb2ZpbGVcbiAgfVxuICB2YXIgbmV4dFN0YXRlID0ge31cbiAgdmFyIEdMX1NUQVRFX05BTUVTID0gW11cbiAgdmFyIEdMX0ZMQUdTID0ge31cbiAgdmFyIEdMX1ZBUklBQkxFUyA9IHt9XG5cbiAgZnVuY3Rpb24gcHJvcE5hbWUgKG5hbWUpIHtcbiAgICByZXR1cm4gbmFtZS5yZXBsYWNlKCcuJywgJ18nKVxuICB9XG5cbiAgZnVuY3Rpb24gc3RhdGVGbGFnIChzbmFtZSwgY2FwLCBpbml0KSB7XG4gICAgdmFyIG5hbWUgPSBwcm9wTmFtZShzbmFtZSlcbiAgICBHTF9TVEFURV9OQU1FUy5wdXNoKHNuYW1lKVxuICAgIG5leHRTdGF0ZVtuYW1lXSA9IGN1cnJlbnRTdGF0ZVtuYW1lXSA9ICEhaW5pdFxuICAgIEdMX0ZMQUdTW25hbWVdID0gY2FwXG4gIH1cblxuICBmdW5jdGlvbiBzdGF0ZVZhcmlhYmxlIChzbmFtZSwgZnVuYywgaW5pdCkge1xuICAgIHZhciBuYW1lID0gcHJvcE5hbWUoc25hbWUpXG4gICAgR0xfU1RBVEVfTkFNRVMucHVzaChzbmFtZSlcbiAgICBpZiAoQXJyYXkuaXNBcnJheShpbml0KSkge1xuICAgICAgY3VycmVudFN0YXRlW25hbWVdID0gaW5pdC5zbGljZSgpXG4gICAgICBuZXh0U3RhdGVbbmFtZV0gPSBpbml0LnNsaWNlKClcbiAgICB9IGVsc2Uge1xuICAgICAgY3VycmVudFN0YXRlW25hbWVdID0gbmV4dFN0YXRlW25hbWVdID0gaW5pdFxuICAgIH1cbiAgICBHTF9WQVJJQUJMRVNbbmFtZV0gPSBmdW5jXG4gIH1cblxuICAvLyBEaXRoZXJpbmdcbiAgc3RhdGVGbGFnKFNfRElUSEVSLCBHTF9ESVRIRVIpXG5cbiAgLy8gQmxlbmRpbmdcbiAgc3RhdGVGbGFnKFNfQkxFTkRfRU5BQkxFLCBHTF9CTEVORClcbiAgc3RhdGVWYXJpYWJsZShTX0JMRU5EX0NPTE9SLCAnYmxlbmRDb2xvcicsIFswLCAwLCAwLCAwXSlcbiAgc3RhdGVWYXJpYWJsZShTX0JMRU5EX0VRVUFUSU9OLCAnYmxlbmRFcXVhdGlvblNlcGFyYXRlJyxcbiAgICBbR0xfRlVOQ19BREQsIEdMX0ZVTkNfQUREXSlcbiAgc3RhdGVWYXJpYWJsZShTX0JMRU5EX0ZVTkMsICdibGVuZEZ1bmNTZXBhcmF0ZScsXG4gICAgW0dMX09ORSwgR0xfWkVSTywgR0xfT05FLCBHTF9aRVJPXSlcblxuICAvLyBEZXB0aFxuICBzdGF0ZUZsYWcoU19ERVBUSF9FTkFCTEUsIEdMX0RFUFRIX1RFU1QsIHRydWUpXG4gIHN0YXRlVmFyaWFibGUoU19ERVBUSF9GVU5DLCAnZGVwdGhGdW5jJywgR0xfTEVTUylcbiAgc3RhdGVWYXJpYWJsZShTX0RFUFRIX1JBTkdFLCAnZGVwdGhSYW5nZScsIFswLCAxXSlcbiAgc3RhdGVWYXJpYWJsZShTX0RFUFRIX01BU0ssICdkZXB0aE1hc2snLCB0cnVlKVxuXG4gIC8vIENvbG9yIG1hc2tcbiAgc3RhdGVWYXJpYWJsZShTX0NPTE9SX01BU0ssIFNfQ09MT1JfTUFTSywgW3RydWUsIHRydWUsIHRydWUsIHRydWVdKVxuXG4gIC8vIEZhY2UgY3VsbGluZ1xuICBzdGF0ZUZsYWcoU19DVUxMX0VOQUJMRSwgR0xfQ1VMTF9GQUNFKVxuICBzdGF0ZVZhcmlhYmxlKFNfQ1VMTF9GQUNFLCAnY3VsbEZhY2UnLCBHTF9CQUNLKVxuXG4gIC8vIEZyb250IGZhY2Ugb3JpZW50YXRpb25cbiAgc3RhdGVWYXJpYWJsZShTX0ZST05UX0ZBQ0UsIFNfRlJPTlRfRkFDRSwgR0xfQ0NXKVxuXG4gIC8vIExpbmUgd2lkdGhcbiAgc3RhdGVWYXJpYWJsZShTX0xJTkVfV0lEVEgsIFNfTElORV9XSURUSCwgMSlcblxuICAvLyBQb2x5Z29uIG9mZnNldFxuICBzdGF0ZUZsYWcoU19QT0xZR09OX09GRlNFVF9FTkFCTEUsIEdMX1BPTFlHT05fT0ZGU0VUX0ZJTEwpXG4gIHN0YXRlVmFyaWFibGUoU19QT0xZR09OX09GRlNFVF9PRkZTRVQsICdwb2x5Z29uT2Zmc2V0JywgWzAsIDBdKVxuXG4gIC8vIFNhbXBsZSBjb3ZlcmFnZVxuICBzdGF0ZUZsYWcoU19TQU1QTEVfQUxQSEEsIEdMX1NBTVBMRV9BTFBIQV9UT19DT1ZFUkFHRSlcbiAgc3RhdGVGbGFnKFNfU0FNUExFX0VOQUJMRSwgR0xfU0FNUExFX0NPVkVSQUdFKVxuICBzdGF0ZVZhcmlhYmxlKFNfU0FNUExFX0NPVkVSQUdFLCAnc2FtcGxlQ292ZXJhZ2UnLCBbMSwgZmFsc2VdKVxuXG4gIC8vIFN0ZW5jaWxcbiAgc3RhdGVGbGFnKFNfU1RFTkNJTF9FTkFCTEUsIEdMX1NURU5DSUxfVEVTVClcbiAgc3RhdGVWYXJpYWJsZShTX1NURU5DSUxfTUFTSywgJ3N0ZW5jaWxNYXNrJywgLTEpXG4gIHN0YXRlVmFyaWFibGUoU19TVEVOQ0lMX0ZVTkMsICdzdGVuY2lsRnVuYycsIFtHTF9BTFdBWVMsIDAsIC0xXSlcbiAgc3RhdGVWYXJpYWJsZShTX1NURU5DSUxfT1BGUk9OVCwgJ3N0ZW5jaWxPcFNlcGFyYXRlJyxcbiAgICBbR0xfRlJPTlQsIEdMX0tFRVAsIEdMX0tFRVAsIEdMX0tFRVBdKVxuICBzdGF0ZVZhcmlhYmxlKFNfU1RFTkNJTF9PUEJBQ0ssICdzdGVuY2lsT3BTZXBhcmF0ZScsXG4gICAgW0dMX0JBQ0ssIEdMX0tFRVAsIEdMX0tFRVAsIEdMX0tFRVBdKVxuXG4gIC8vIFNjaXNzb3JcbiAgc3RhdGVGbGFnKFNfU0NJU1NPUl9FTkFCTEUsIEdMX1NDSVNTT1JfVEVTVClcbiAgc3RhdGVWYXJpYWJsZShTX1NDSVNTT1JfQk9YLCAnc2Npc3NvcicsXG4gICAgWzAsIDAsIGdsLmRyYXdpbmdCdWZmZXJXaWR0aCwgZ2wuZHJhd2luZ0J1ZmZlckhlaWdodF0pXG5cbiAgLy8gVmlld3BvcnRcbiAgc3RhdGVWYXJpYWJsZShTX1ZJRVdQT1JULCBTX1ZJRVdQT1JULFxuICAgIFswLCAwLCBnbC5kcmF3aW5nQnVmZmVyV2lkdGgsIGdsLmRyYXdpbmdCdWZmZXJIZWlnaHRdKVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gRU5WSVJPTk1FTlRcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICB2YXIgc2hhcmVkU3RhdGUgPSB7XG4gICAgZ2w6IGdsLFxuICAgIGNvbnRleHQ6IGNvbnRleHRTdGF0ZSxcbiAgICBzdHJpbmdzOiBzdHJpbmdTdG9yZSxcbiAgICBuZXh0OiBuZXh0U3RhdGUsXG4gICAgY3VycmVudDogY3VycmVudFN0YXRlLFxuICAgIGRyYXc6IGRyYXdTdGF0ZSxcbiAgICBlbGVtZW50czogZWxlbWVudFN0YXRlLFxuICAgIGJ1ZmZlcjogYnVmZmVyU3RhdGUsXG4gICAgc2hhZGVyOiBzaGFkZXJTdGF0ZSxcbiAgICBhdHRyaWJ1dGVzOiBhdHRyaWJ1dGVTdGF0ZS5zdGF0ZSxcbiAgICB1bmlmb3JtczogdW5pZm9ybVN0YXRlLFxuICAgIGZyYW1lYnVmZmVyOiBmcmFtZWJ1ZmZlclN0YXRlLFxuICAgIGV4dGVuc2lvbnM6IGV4dGVuc2lvbnMsXG5cbiAgICB0aW1lcjogdGltZXIsXG4gICAgaXNCdWZmZXJBcmdzOiBpc0J1ZmZlckFyZ3NcbiAgfVxuXG4gIHZhciBzaGFyZWRDb25zdGFudHMgPSB7XG4gICAgcHJpbVR5cGVzOiBwcmltVHlwZXMsXG4gICAgY29tcGFyZUZ1bmNzOiBjb21wYXJlRnVuY3MsXG4gICAgYmxlbmRGdW5jczogYmxlbmRGdW5jcyxcbiAgICBibGVuZEVxdWF0aW9uczogYmxlbmRFcXVhdGlvbnMsXG4gICAgc3RlbmNpbE9wczogc3RlbmNpbE9wcyxcbiAgICBnbFR5cGVzOiBnbFR5cGVzLFxuICAgIG9yaWVudGF0aW9uVHlwZTogb3JpZW50YXRpb25UeXBlXG4gIH1cblxuICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgc2hhcmVkU3RhdGUuaXNBcnJheUxpa2UgPSBpc0FycmF5TGlrZVxuICB9KVxuXG4gIGlmIChleHREcmF3QnVmZmVycykge1xuICAgIHNoYXJlZENvbnN0YW50cy5iYWNrQnVmZmVyID0gW0dMX0JBQ0tdXG4gICAgc2hhcmVkQ29uc3RhbnRzLmRyYXdCdWZmZXIgPSBsb29wKGxpbWl0cy5tYXhEcmF3YnVmZmVycywgZnVuY3Rpb24gKGkpIHtcbiAgICAgIGlmIChpID09PSAwKSB7XG4gICAgICAgIHJldHVybiBbMF1cbiAgICAgIH1cbiAgICAgIHJldHVybiBsb29wKGksIGZ1bmN0aW9uIChqKSB7XG4gICAgICAgIHJldHVybiBHTF9DT0xPUl9BVFRBQ0hNRU5UMCArIGpcbiAgICAgIH0pXG4gICAgfSlcbiAgfVxuXG4gIHZhciBkcmF3Q2FsbENvdW50ZXIgPSAwXG4gIGZ1bmN0aW9uIGNyZWF0ZVJFR0xFbnZpcm9ubWVudCAoKSB7XG4gICAgdmFyIGVudiA9IGNyZWF0ZUVudmlyb25tZW50KClcbiAgICB2YXIgbGluayA9IGVudi5saW5rXG4gICAgdmFyIGdsb2JhbCA9IGVudi5nbG9iYWxcbiAgICBlbnYuaWQgPSBkcmF3Q2FsbENvdW50ZXIrK1xuXG4gICAgZW52LmJhdGNoSWQgPSAnMCdcblxuICAgIC8vIGxpbmsgc2hhcmVkIHN0YXRlXG4gICAgdmFyIFNIQVJFRCA9IGxpbmsoc2hhcmVkU3RhdGUpXG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWQgPSB7XG4gICAgICBwcm9wczogJ2EwJ1xuICAgIH1cbiAgICBPYmplY3Qua2V5cyhzaGFyZWRTdGF0ZSkuZm9yRWFjaChmdW5jdGlvbiAocHJvcCkge1xuICAgICAgc2hhcmVkW3Byb3BdID0gZ2xvYmFsLmRlZihTSEFSRUQsICcuJywgcHJvcClcbiAgICB9KVxuXG4gICAgLy8gSW5qZWN0IHJ1bnRpbWUgYXNzZXJ0aW9uIHN0dWZmIGZvciBkZWJ1ZyBidWlsZHNcbiAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICBlbnYuQ0hFQ0sgPSBsaW5rKGNoZWNrKVxuICAgICAgZW52LmNvbW1hbmRTdHIgPSBjaGVjay5ndWVzc0NvbW1hbmQoKVxuICAgICAgZW52LmNvbW1hbmQgPSBsaW5rKGVudi5jb21tYW5kU3RyKVxuICAgICAgZW52LmFzc2VydCA9IGZ1bmN0aW9uIChibG9jaywgcHJlZCwgbWVzc2FnZSkge1xuICAgICAgICBibG9jayhcbiAgICAgICAgICAnaWYoISgnLCBwcmVkLCAnKSknLFxuICAgICAgICAgIHRoaXMuQ0hFQ0ssICcuY29tbWFuZFJhaXNlKCcsIGxpbmsobWVzc2FnZSksICcsJywgdGhpcy5jb21tYW5kLCAnKTsnKVxuICAgICAgfVxuXG4gICAgICBzaGFyZWRDb25zdGFudHMuaW52YWxpZEJsZW5kQ29tYmluYXRpb25zID0gaW52YWxpZEJsZW5kQ29tYmluYXRpb25zXG4gICAgfSlcblxuICAgIC8vIENvcHkgR0wgc3RhdGUgdmFyaWFibGVzIG92ZXJcbiAgICB2YXIgbmV4dFZhcnMgPSBlbnYubmV4dCA9IHt9XG4gICAgdmFyIGN1cnJlbnRWYXJzID0gZW52LmN1cnJlbnQgPSB7fVxuICAgIE9iamVjdC5rZXlzKEdMX1ZBUklBQkxFUykuZm9yRWFjaChmdW5jdGlvbiAodmFyaWFibGUpIHtcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KGN1cnJlbnRTdGF0ZVt2YXJpYWJsZV0pKSB7XG4gICAgICAgIG5leHRWYXJzW3ZhcmlhYmxlXSA9IGdsb2JhbC5kZWYoc2hhcmVkLm5leHQsICcuJywgdmFyaWFibGUpXG4gICAgICAgIGN1cnJlbnRWYXJzW3ZhcmlhYmxlXSA9IGdsb2JhbC5kZWYoc2hhcmVkLmN1cnJlbnQsICcuJywgdmFyaWFibGUpXG4gICAgICB9XG4gICAgfSlcblxuICAgIC8vIEluaXRpYWxpemUgc2hhcmVkIGNvbnN0YW50c1xuICAgIHZhciBjb25zdGFudHMgPSBlbnYuY29uc3RhbnRzID0ge31cbiAgICBPYmplY3Qua2V5cyhzaGFyZWRDb25zdGFudHMpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIGNvbnN0YW50c1tuYW1lXSA9IGdsb2JhbC5kZWYoSlNPTi5zdHJpbmdpZnkoc2hhcmVkQ29uc3RhbnRzW25hbWVdKSlcbiAgICB9KVxuXG4gICAgLy8gSGVscGVyIGZ1bmN0aW9uIGZvciBjYWxsaW5nIGEgYmxvY2tcbiAgICBlbnYuaW52b2tlID0gZnVuY3Rpb24gKGJsb2NrLCB4KSB7XG4gICAgICBzd2l0Y2ggKHgudHlwZSkge1xuICAgICAgICBjYXNlIERZTl9GVU5DOlxuICAgICAgICAgIHZhciBhcmdMaXN0ID0gW1xuICAgICAgICAgICAgJ3RoaXMnLFxuICAgICAgICAgICAgc2hhcmVkLmNvbnRleHQsXG4gICAgICAgICAgICBzaGFyZWQucHJvcHMsXG4gICAgICAgICAgICBlbnYuYmF0Y2hJZFxuICAgICAgICAgIF1cbiAgICAgICAgICByZXR1cm4gYmxvY2suZGVmKFxuICAgICAgICAgICAgbGluayh4LmRhdGEpLCAnLmNhbGwoJyxcbiAgICAgICAgICAgICAgYXJnTGlzdC5zbGljZSgwLCBNYXRoLm1heCh4LmRhdGEubGVuZ3RoICsgMSwgNCkpLFxuICAgICAgICAgICAgICcpJylcbiAgICAgICAgY2FzZSBEWU5fUFJPUDpcbiAgICAgICAgICByZXR1cm4gYmxvY2suZGVmKHNoYXJlZC5wcm9wcywgeC5kYXRhKVxuICAgICAgICBjYXNlIERZTl9DT05URVhUOlxuICAgICAgICAgIHJldHVybiBibG9jay5kZWYoc2hhcmVkLmNvbnRleHQsIHguZGF0YSlcbiAgICAgICAgY2FzZSBEWU5fU1RBVEU6XG4gICAgICAgICAgcmV0dXJuIGJsb2NrLmRlZigndGhpcycsIHguZGF0YSlcbiAgICAgICAgY2FzZSBEWU5fVEhVTks6XG4gICAgICAgICAgeC5kYXRhLmFwcGVuZChlbnYsIGJsb2NrKVxuICAgICAgICAgIHJldHVybiB4LmRhdGEucmVmXG4gICAgICB9XG4gICAgfVxuXG4gICAgZW52LmF0dHJpYkNhY2hlID0ge31cblxuICAgIHZhciBzY29wZUF0dHJpYnMgPSB7fVxuICAgIGVudi5zY29wZUF0dHJpYiA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICB2YXIgaWQgPSBzdHJpbmdTdG9yZS5pZChuYW1lKVxuICAgICAgaWYgKGlkIGluIHNjb3BlQXR0cmlicykge1xuICAgICAgICByZXR1cm4gc2NvcGVBdHRyaWJzW2lkXVxuICAgICAgfVxuICAgICAgdmFyIGJpbmRpbmcgPSBhdHRyaWJ1dGVTdGF0ZS5zY29wZVtpZF1cbiAgICAgIGlmICghYmluZGluZykge1xuICAgICAgICBiaW5kaW5nID0gYXR0cmlidXRlU3RhdGUuc2NvcGVbaWRdID0gbmV3IEF0dHJpYnV0ZVJlY29yZCgpXG4gICAgICB9XG4gICAgICB2YXIgcmVzdWx0ID0gc2NvcGVBdHRyaWJzW2lkXSA9IGxpbmsoYmluZGluZylcbiAgICAgIHJldHVybiByZXN1bHRcbiAgICB9XG5cbiAgICByZXR1cm4gZW52XG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIFBBUlNJTkdcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICBmdW5jdGlvbiBwYXJzZVByb2ZpbGUgKG9wdGlvbnMpIHtcbiAgICB2YXIgc3RhdGljT3B0aW9ucyA9IG9wdGlvbnMuc3RhdGljXG4gICAgdmFyIGR5bmFtaWNPcHRpb25zID0gb3B0aW9ucy5keW5hbWljXG5cbiAgICB2YXIgcHJvZmlsZUVuYWJsZVxuICAgIGlmIChTX1BST0ZJTEUgaW4gc3RhdGljT3B0aW9ucykge1xuICAgICAgdmFyIHZhbHVlID0gISFzdGF0aWNPcHRpb25zW1NfUFJPRklMRV1cbiAgICAgIHByb2ZpbGVFbmFibGUgPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgIHJldHVybiB2YWx1ZVxuICAgICAgfSlcbiAgICAgIHByb2ZpbGVFbmFibGUuZW5hYmxlID0gdmFsdWVcbiAgICB9IGVsc2UgaWYgKFNfUFJPRklMRSBpbiBkeW5hbWljT3B0aW9ucykge1xuICAgICAgdmFyIGR5biA9IGR5bmFtaWNPcHRpb25zW1NfUFJPRklMRV1cbiAgICAgIHByb2ZpbGVFbmFibGUgPSBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgIHJldHVybiBlbnYuaW52b2tlKHNjb3BlLCBkeW4pXG4gICAgICB9KVxuICAgIH1cblxuICAgIHJldHVybiBwcm9maWxlRW5hYmxlXG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZUZyYW1lYnVmZmVyIChvcHRpb25zLCBlbnYpIHtcbiAgICB2YXIgc3RhdGljT3B0aW9ucyA9IG9wdGlvbnMuc3RhdGljXG4gICAgdmFyIGR5bmFtaWNPcHRpb25zID0gb3B0aW9ucy5keW5hbWljXG5cbiAgICBpZiAoU19GUkFNRUJVRkZFUiBpbiBzdGF0aWNPcHRpb25zKSB7XG4gICAgICB2YXIgZnJhbWVidWZmZXIgPSBzdGF0aWNPcHRpb25zW1NfRlJBTUVCVUZGRVJdXG4gICAgICBpZiAoZnJhbWVidWZmZXIpIHtcbiAgICAgICAgZnJhbWVidWZmZXIgPSBmcmFtZWJ1ZmZlclN0YXRlLmdldEZyYW1lYnVmZmVyKGZyYW1lYnVmZmVyKVxuICAgICAgICBjaGVjay5jb21tYW5kKGZyYW1lYnVmZmVyLCAnaW52YWxpZCBmcmFtZWJ1ZmZlciBvYmplY3QnKVxuICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBibG9jaykge1xuICAgICAgICAgIHZhciBGUkFNRUJVRkZFUiA9IGVudi5saW5rKGZyYW1lYnVmZmVyKVxuICAgICAgICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgICAgICAgYmxvY2suc2V0KFxuICAgICAgICAgICAgc2hhcmVkLmZyYW1lYnVmZmVyLFxuICAgICAgICAgICAgJy5uZXh0JyxcbiAgICAgICAgICAgIEZSQU1FQlVGRkVSKVxuICAgICAgICAgIHZhciBDT05URVhUID0gc2hhcmVkLmNvbnRleHRcbiAgICAgICAgICBibG9jay5zZXQoXG4gICAgICAgICAgICBDT05URVhULFxuICAgICAgICAgICAgJy4nICsgU19GUkFNRUJVRkZFUl9XSURUSCxcbiAgICAgICAgICAgIEZSQU1FQlVGRkVSICsgJy53aWR0aCcpXG4gICAgICAgICAgYmxvY2suc2V0KFxuICAgICAgICAgICAgQ09OVEVYVCxcbiAgICAgICAgICAgICcuJyArIFNfRlJBTUVCVUZGRVJfSEVJR0hULFxuICAgICAgICAgICAgRlJBTUVCVUZGRVIgKyAnLmhlaWdodCcpXG4gICAgICAgICAgcmV0dXJuIEZSQU1FQlVGRkVSXG4gICAgICAgIH0pXG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgICAgICAgc2NvcGUuc2V0KFxuICAgICAgICAgICAgc2hhcmVkLmZyYW1lYnVmZmVyLFxuICAgICAgICAgICAgJy5uZXh0JyxcbiAgICAgICAgICAgICdudWxsJylcbiAgICAgICAgICB2YXIgQ09OVEVYVCA9IHNoYXJlZC5jb250ZXh0XG4gICAgICAgICAgc2NvcGUuc2V0KFxuICAgICAgICAgICAgQ09OVEVYVCxcbiAgICAgICAgICAgICcuJyArIFNfRlJBTUVCVUZGRVJfV0lEVEgsXG4gICAgICAgICAgICBDT05URVhUICsgJy4nICsgU19EUkFXSU5HQlVGRkVSX1dJRFRIKVxuICAgICAgICAgIHNjb3BlLnNldChcbiAgICAgICAgICAgIENPTlRFWFQsXG4gICAgICAgICAgICAnLicgKyBTX0ZSQU1FQlVGRkVSX0hFSUdIVCxcbiAgICAgICAgICAgIENPTlRFWFQgKyAnLicgKyBTX0RSQVdJTkdCVUZGRVJfSEVJR0hUKVxuICAgICAgICAgIHJldHVybiAnbnVsbCdcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKFNfRlJBTUVCVUZGRVIgaW4gZHluYW1pY09wdGlvbnMpIHtcbiAgICAgIHZhciBkeW4gPSBkeW5hbWljT3B0aW9uc1tTX0ZSQU1FQlVGRkVSXVxuICAgICAgcmV0dXJuIGNyZWF0ZUR5bmFtaWNEZWNsKGR5biwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgdmFyIEZSQU1FQlVGRkVSX0ZVTkMgPSBlbnYuaW52b2tlKHNjb3BlLCBkeW4pXG4gICAgICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgICAgIHZhciBGUkFNRUJVRkZFUl9TVEFURSA9IHNoYXJlZC5mcmFtZWJ1ZmZlclxuICAgICAgICB2YXIgRlJBTUVCVUZGRVIgPSBzY29wZS5kZWYoXG4gICAgICAgICAgRlJBTUVCVUZGRVJfU1RBVEUsICcuZ2V0RnJhbWVidWZmZXIoJywgRlJBTUVCVUZGRVJfRlVOQywgJyknKVxuXG4gICAgICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxuICAgICAgICAgICAgJyEnICsgRlJBTUVCVUZGRVJfRlVOQyArICd8fCcgKyBGUkFNRUJVRkZFUixcbiAgICAgICAgICAgICdpbnZhbGlkIGZyYW1lYnVmZmVyIG9iamVjdCcpXG4gICAgICAgIH0pXG5cbiAgICAgICAgc2NvcGUuc2V0KFxuICAgICAgICAgIEZSQU1FQlVGRkVSX1NUQVRFLFxuICAgICAgICAgICcubmV4dCcsXG4gICAgICAgICAgRlJBTUVCVUZGRVIpXG4gICAgICAgIHZhciBDT05URVhUID0gc2hhcmVkLmNvbnRleHRcbiAgICAgICAgc2NvcGUuc2V0KFxuICAgICAgICAgIENPTlRFWFQsXG4gICAgICAgICAgJy4nICsgU19GUkFNRUJVRkZFUl9XSURUSCxcbiAgICAgICAgICBGUkFNRUJVRkZFUiArICc/JyArIEZSQU1FQlVGRkVSICsgJy53aWR0aDonICtcbiAgICAgICAgICBDT05URVhUICsgJy4nICsgU19EUkFXSU5HQlVGRkVSX1dJRFRIKVxuICAgICAgICBzY29wZS5zZXQoXG4gICAgICAgICAgQ09OVEVYVCxcbiAgICAgICAgICAnLicgKyBTX0ZSQU1FQlVGRkVSX0hFSUdIVCxcbiAgICAgICAgICBGUkFNRUJVRkZFUiArXG4gICAgICAgICAgJz8nICsgRlJBTUVCVUZGRVIgKyAnLmhlaWdodDonICtcbiAgICAgICAgICBDT05URVhUICsgJy4nICsgU19EUkFXSU5HQlVGRkVSX0hFSUdIVClcbiAgICAgICAgcmV0dXJuIEZSQU1FQlVGRkVSXG4gICAgICB9KVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlVmlld3BvcnRTY2lzc29yIChvcHRpb25zLCBmcmFtZWJ1ZmZlciwgZW52KSB7XG4gICAgdmFyIHN0YXRpY09wdGlvbnMgPSBvcHRpb25zLnN0YXRpY1xuICAgIHZhciBkeW5hbWljT3B0aW9ucyA9IG9wdGlvbnMuZHluYW1pY1xuXG4gICAgZnVuY3Rpb24gcGFyc2VCb3ggKHBhcmFtKSB7XG4gICAgICBpZiAocGFyYW0gaW4gc3RhdGljT3B0aW9ucykge1xuICAgICAgICB2YXIgYm94ID0gc3RhdGljT3B0aW9uc1twYXJhbV1cbiAgICAgICAgY2hlY2suY29tbWFuZFR5cGUoYm94LCAnb2JqZWN0JywgJ2ludmFsaWQgJyArIHBhcmFtLCBlbnYuY29tbWFuZFN0cilcblxuICAgICAgICB2YXIgaXNTdGF0aWMgPSB0cnVlXG4gICAgICAgIHZhciB4ID0gYm94LnggfCAwXG4gICAgICAgIHZhciB5ID0gYm94LnkgfCAwXG4gICAgICAgIHZhciB3LCBoXG4gICAgICAgIGlmICgnd2lkdGgnIGluIGJveCkge1xuICAgICAgICAgIHcgPSBib3gud2lkdGggfCAwXG4gICAgICAgICAgY2hlY2suY29tbWFuZCh3ID49IDAsICdpbnZhbGlkICcgKyBwYXJhbSwgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaXNTdGF0aWMgPSBmYWxzZVxuICAgICAgICB9XG4gICAgICAgIGlmICgnaGVpZ2h0JyBpbiBib3gpIHtcbiAgICAgICAgICBoID0gYm94LmhlaWdodCB8IDBcbiAgICAgICAgICBjaGVjay5jb21tYW5kKGggPj0gMCwgJ2ludmFsaWQgJyArIHBhcmFtLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpc1N0YXRpYyA9IGZhbHNlXG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgICAgICFpc1N0YXRpYyAmJiBmcmFtZWJ1ZmZlciAmJiBmcmFtZWJ1ZmZlci50aGlzRGVwLFxuICAgICAgICAgICFpc1N0YXRpYyAmJiBmcmFtZWJ1ZmZlciAmJiBmcmFtZWJ1ZmZlci5jb250ZXh0RGVwLFxuICAgICAgICAgICFpc1N0YXRpYyAmJiBmcmFtZWJ1ZmZlciAmJiBmcmFtZWJ1ZmZlci5wcm9wRGVwLFxuICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgICB2YXIgQ09OVEVYVCA9IGVudi5zaGFyZWQuY29udGV4dFxuICAgICAgICAgICAgdmFyIEJPWF9XID0gd1xuICAgICAgICAgICAgaWYgKCEoJ3dpZHRoJyBpbiBib3gpKSB7XG4gICAgICAgICAgICAgIEJPWF9XID0gc2NvcGUuZGVmKENPTlRFWFQsICcuJywgU19GUkFNRUJVRkZFUl9XSURUSCwgJy0nLCB4KVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIEJPWF9IID0gaFxuICAgICAgICAgICAgaWYgKCEoJ2hlaWdodCcgaW4gYm94KSkge1xuICAgICAgICAgICAgICBCT1hfSCA9IHNjb3BlLmRlZihDT05URVhULCAnLicsIFNfRlJBTUVCVUZGRVJfSEVJR0hULCAnLScsIHkpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gW3gsIHksIEJPWF9XLCBCT1hfSF1cbiAgICAgICAgICB9KVxuICAgICAgfSBlbHNlIGlmIChwYXJhbSBpbiBkeW5hbWljT3B0aW9ucykge1xuICAgICAgICB2YXIgZHluQm94ID0gZHluYW1pY09wdGlvbnNbcGFyYW1dXG4gICAgICAgIHZhciByZXN1bHQgPSBjcmVhdGVEeW5hbWljRGVjbChkeW5Cb3gsIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgdmFyIEJPWCA9IGVudi5pbnZva2Uoc2NvcGUsIGR5bkJveClcblxuICAgICAgICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXG4gICAgICAgICAgICAgIEJPWCArICcmJnR5cGVvZiAnICsgQk9YICsgJz09PVwib2JqZWN0XCInLFxuICAgICAgICAgICAgICAnaW52YWxpZCAnICsgcGFyYW0pXG4gICAgICAgICAgfSlcblxuICAgICAgICAgIHZhciBDT05URVhUID0gZW52LnNoYXJlZC5jb250ZXh0XG4gICAgICAgICAgdmFyIEJPWF9YID0gc2NvcGUuZGVmKEJPWCwgJy54fDAnKVxuICAgICAgICAgIHZhciBCT1hfWSA9IHNjb3BlLmRlZihCT1gsICcueXwwJylcbiAgICAgICAgICB2YXIgQk9YX1cgPSBzY29wZS5kZWYoXG4gICAgICAgICAgICAnXCJ3aWR0aFwiIGluICcsIEJPWCwgJz8nLCBCT1gsICcud2lkdGh8MDonLFxuICAgICAgICAgICAgJygnLCBDT05URVhULCAnLicsIFNfRlJBTUVCVUZGRVJfV0lEVEgsICctJywgQk9YX1gsICcpJylcbiAgICAgICAgICB2YXIgQk9YX0ggPSBzY29wZS5kZWYoXG4gICAgICAgICAgICAnXCJoZWlnaHRcIiBpbiAnLCBCT1gsICc/JywgQk9YLCAnLmhlaWdodHwwOicsXG4gICAgICAgICAgICAnKCcsIENPTlRFWFQsICcuJywgU19GUkFNRUJVRkZFUl9IRUlHSFQsICctJywgQk9YX1ksICcpJylcblxuICAgICAgICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXG4gICAgICAgICAgICAgIEJPWF9XICsgJz49MCYmJyArXG4gICAgICAgICAgICAgIEJPWF9IICsgJz49MCcsXG4gICAgICAgICAgICAgICdpbnZhbGlkICcgKyBwYXJhbSlcbiAgICAgICAgICB9KVxuXG4gICAgICAgICAgcmV0dXJuIFtCT1hfWCwgQk9YX1ksIEJPWF9XLCBCT1hfSF1cbiAgICAgICAgfSlcbiAgICAgICAgaWYgKGZyYW1lYnVmZmVyKSB7XG4gICAgICAgICAgcmVzdWx0LnRoaXNEZXAgPSByZXN1bHQudGhpc0RlcCB8fCBmcmFtZWJ1ZmZlci50aGlzRGVwXG4gICAgICAgICAgcmVzdWx0LmNvbnRleHREZXAgPSByZXN1bHQuY29udGV4dERlcCB8fCBmcmFtZWJ1ZmZlci5jb250ZXh0RGVwXG4gICAgICAgICAgcmVzdWx0LnByb3BEZXAgPSByZXN1bHQucHJvcERlcCB8fCBmcmFtZWJ1ZmZlci5wcm9wRGVwXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgfSBlbHNlIGlmIChmcmFtZWJ1ZmZlcikge1xuICAgICAgICByZXR1cm4gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgICAgIGZyYW1lYnVmZmVyLnRoaXNEZXAsXG4gICAgICAgICAgZnJhbWVidWZmZXIuY29udGV4dERlcCxcbiAgICAgICAgICBmcmFtZWJ1ZmZlci5wcm9wRGVwLFxuICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgICB2YXIgQ09OVEVYVCA9IGVudi5zaGFyZWQuY29udGV4dFxuICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgMCwgMCxcbiAgICAgICAgICAgICAgc2NvcGUuZGVmKENPTlRFWFQsICcuJywgU19GUkFNRUJVRkZFUl9XSURUSCksXG4gICAgICAgICAgICAgIHNjb3BlLmRlZihDT05URVhULCAnLicsIFNfRlJBTUVCVUZGRVJfSEVJR0hUKV1cbiAgICAgICAgICB9KVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIG51bGxcbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgdmlld3BvcnQgPSBwYXJzZUJveChTX1ZJRVdQT1JUKVxuXG4gICAgaWYgKHZpZXdwb3J0KSB7XG4gICAgICB2YXIgcHJldlZpZXdwb3J0ID0gdmlld3BvcnRcbiAgICAgIHZpZXdwb3J0ID0gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgICB2aWV3cG9ydC50aGlzRGVwLFxuICAgICAgICB2aWV3cG9ydC5jb250ZXh0RGVwLFxuICAgICAgICB2aWV3cG9ydC5wcm9wRGVwLFxuICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciBWSUVXUE9SVCA9IHByZXZWaWV3cG9ydC5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgICAgICB2YXIgQ09OVEVYVCA9IGVudi5zaGFyZWQuY29udGV4dFxuICAgICAgICAgIHNjb3BlLnNldChcbiAgICAgICAgICAgIENPTlRFWFQsXG4gICAgICAgICAgICAnLicgKyBTX1ZJRVdQT1JUX1dJRFRILFxuICAgICAgICAgICAgVklFV1BPUlRbMl0pXG4gICAgICAgICAgc2NvcGUuc2V0KFxuICAgICAgICAgICAgQ09OVEVYVCxcbiAgICAgICAgICAgICcuJyArIFNfVklFV1BPUlRfSEVJR0hULFxuICAgICAgICAgICAgVklFV1BPUlRbM10pXG4gICAgICAgICAgcmV0dXJuIFZJRVdQT1JUXG4gICAgICAgIH0pXG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIHZpZXdwb3J0OiB2aWV3cG9ydCxcbiAgICAgIHNjaXNzb3JfYm94OiBwYXJzZUJveChTX1NDSVNTT1JfQk9YKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlUHJvZ3JhbSAob3B0aW9ucykge1xuICAgIHZhciBzdGF0aWNPcHRpb25zID0gb3B0aW9ucy5zdGF0aWNcbiAgICB2YXIgZHluYW1pY09wdGlvbnMgPSBvcHRpb25zLmR5bmFtaWNcblxuICAgIGZ1bmN0aW9uIHBhcnNlU2hhZGVyIChuYW1lKSB7XG4gICAgICBpZiAobmFtZSBpbiBzdGF0aWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBpZCA9IHN0cmluZ1N0b3JlLmlkKHN0YXRpY09wdGlvbnNbbmFtZV0pXG4gICAgICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBzaGFkZXJTdGF0ZS5zaGFkZXIoc2hhZGVyVHlwZVtuYW1lXSwgaWQsIGNoZWNrLmd1ZXNzQ29tbWFuZCgpKVxuICAgICAgICB9KVxuICAgICAgICB2YXIgcmVzdWx0ID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcmV0dXJuIGlkXG4gICAgICAgIH0pXG4gICAgICAgIHJlc3VsdC5pZCA9IGlkXG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH0gZWxzZSBpZiAobmFtZSBpbiBkeW5hbWljT3B0aW9ucykge1xuICAgICAgICB2YXIgZHluID0gZHluYW1pY09wdGlvbnNbbmFtZV1cbiAgICAgICAgcmV0dXJuIGNyZWF0ZUR5bmFtaWNEZWNsKGR5biwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICB2YXIgc3RyID0gZW52Lmludm9rZShzY29wZSwgZHluKVxuICAgICAgICAgIHZhciBpZCA9IHNjb3BlLmRlZihlbnYuc2hhcmVkLnN0cmluZ3MsICcuaWQoJywgc3RyLCAnKScpXG4gICAgICAgICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgc2NvcGUoXG4gICAgICAgICAgICAgIGVudi5zaGFyZWQuc2hhZGVyLCAnLnNoYWRlcignLFxuICAgICAgICAgICAgICBzaGFkZXJUeXBlW25hbWVdLCAnLCcsXG4gICAgICAgICAgICAgIGlkLCAnLCcsXG4gICAgICAgICAgICAgIGVudi5jb21tYW5kLCAnKTsnKVxuICAgICAgICAgIH0pXG4gICAgICAgICAgcmV0dXJuIGlkXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cblxuICAgIHZhciBmcmFnID0gcGFyc2VTaGFkZXIoU19GUkFHKVxuICAgIHZhciB2ZXJ0ID0gcGFyc2VTaGFkZXIoU19WRVJUKVxuXG4gICAgdmFyIHByb2dyYW0gPSBudWxsXG4gICAgdmFyIHByb2dWYXJcbiAgICBpZiAoaXNTdGF0aWMoZnJhZykgJiYgaXNTdGF0aWModmVydCkpIHtcbiAgICAgIHByb2dyYW0gPSBzaGFkZXJTdGF0ZS5wcm9ncmFtKHZlcnQuaWQsIGZyYWcuaWQpXG4gICAgICBwcm9nVmFyID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICByZXR1cm4gZW52LmxpbmsocHJvZ3JhbSlcbiAgICAgIH0pXG4gICAgfSBlbHNlIHtcbiAgICAgIHByb2dWYXIgPSBuZXcgRGVjbGFyYXRpb24oXG4gICAgICAgIChmcmFnICYmIGZyYWcudGhpc0RlcCkgfHwgKHZlcnQgJiYgdmVydC50aGlzRGVwKSxcbiAgICAgICAgKGZyYWcgJiYgZnJhZy5jb250ZXh0RGVwKSB8fCAodmVydCAmJiB2ZXJ0LmNvbnRleHREZXApLFxuICAgICAgICAoZnJhZyAmJiBmcmFnLnByb3BEZXApIHx8ICh2ZXJ0ICYmIHZlcnQucHJvcERlcCksXG4gICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgdmFyIFNIQURFUl9TVEFURSA9IGVudi5zaGFyZWQuc2hhZGVyXG4gICAgICAgICAgdmFyIGZyYWdJZFxuICAgICAgICAgIGlmIChmcmFnKSB7XG4gICAgICAgICAgICBmcmFnSWQgPSBmcmFnLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBmcmFnSWQgPSBzY29wZS5kZWYoU0hBREVSX1NUQVRFLCAnLicsIFNfRlJBRylcbiAgICAgICAgICB9XG4gICAgICAgICAgdmFyIHZlcnRJZFxuICAgICAgICAgIGlmICh2ZXJ0KSB7XG4gICAgICAgICAgICB2ZXJ0SWQgPSB2ZXJ0LmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2ZXJ0SWQgPSBzY29wZS5kZWYoU0hBREVSX1NUQVRFLCAnLicsIFNfVkVSVClcbiAgICAgICAgICB9XG4gICAgICAgICAgdmFyIHByb2dEZWYgPSBTSEFERVJfU1RBVEUgKyAnLnByb2dyYW0oJyArIHZlcnRJZCArICcsJyArIGZyYWdJZFxuICAgICAgICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHByb2dEZWYgKz0gJywnICsgZW52LmNvbW1hbmRcbiAgICAgICAgICB9KVxuICAgICAgICAgIHJldHVybiBzY29wZS5kZWYocHJvZ0RlZiArICcpJylcbiAgICAgICAgfSlcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgZnJhZzogZnJhZyxcbiAgICAgIHZlcnQ6IHZlcnQsXG4gICAgICBwcm9nVmFyOiBwcm9nVmFyLFxuICAgICAgcHJvZ3JhbTogcHJvZ3JhbVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlRHJhdyAob3B0aW9ucywgZW52KSB7XG4gICAgdmFyIHN0YXRpY09wdGlvbnMgPSBvcHRpb25zLnN0YXRpY1xuICAgIHZhciBkeW5hbWljT3B0aW9ucyA9IG9wdGlvbnMuZHluYW1pY1xuXG4gICAgZnVuY3Rpb24gcGFyc2VFbGVtZW50cyAoKSB7XG4gICAgICBpZiAoU19FTEVNRU5UUyBpbiBzdGF0aWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBlbGVtZW50cyA9IHN0YXRpY09wdGlvbnNbU19FTEVNRU5UU11cbiAgICAgICAgaWYgKGlzQnVmZmVyQXJncyhlbGVtZW50cykpIHtcbiAgICAgICAgICBlbGVtZW50cyA9IGVsZW1lbnRTdGF0ZS5nZXRFbGVtZW50cyhlbGVtZW50U3RhdGUuY3JlYXRlKGVsZW1lbnRzLCB0cnVlKSlcbiAgICAgICAgfSBlbHNlIGlmIChlbGVtZW50cykge1xuICAgICAgICAgIGVsZW1lbnRzID0gZWxlbWVudFN0YXRlLmdldEVsZW1lbnRzKGVsZW1lbnRzKVxuICAgICAgICAgIGNoZWNrLmNvbW1hbmQoZWxlbWVudHMsICdpbnZhbGlkIGVsZW1lbnRzJywgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgIH1cbiAgICAgICAgdmFyIHJlc3VsdCA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICBpZiAoZWxlbWVudHMpIHtcbiAgICAgICAgICAgIHZhciByZXN1bHQgPSBlbnYubGluayhlbGVtZW50cylcbiAgICAgICAgICAgIGVudi5FTEVNRU5UUyA9IHJlc3VsdFxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgICAgIH1cbiAgICAgICAgICBlbnYuRUxFTUVOVFMgPSBudWxsXG4gICAgICAgICAgcmV0dXJuIG51bGxcbiAgICAgICAgfSlcbiAgICAgICAgcmVzdWx0LnZhbHVlID0gZWxlbWVudHNcbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgfSBlbHNlIGlmIChTX0VMRU1FTlRTIGluIGR5bmFtaWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBkeW4gPSBkeW5hbWljT3B0aW9uc1tTX0VMRU1FTlRTXVxuICAgICAgICByZXR1cm4gY3JlYXRlRHluYW1pY0RlY2woZHluLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG5cbiAgICAgICAgICB2YXIgSVNfQlVGRkVSX0FSR1MgPSBzaGFyZWQuaXNCdWZmZXJBcmdzXG4gICAgICAgICAgdmFyIEVMRU1FTlRfU1RBVEUgPSBzaGFyZWQuZWxlbWVudHNcblxuICAgICAgICAgIHZhciBlbGVtZW50RGVmbiA9IGVudi5pbnZva2Uoc2NvcGUsIGR5bilcbiAgICAgICAgICB2YXIgZWxlbWVudHMgPSBzY29wZS5kZWYoJ251bGwnKVxuICAgICAgICAgIHZhciBlbGVtZW50U3RyZWFtID0gc2NvcGUuZGVmKElTX0JVRkZFUl9BUkdTLCAnKCcsIGVsZW1lbnREZWZuLCAnKScpXG5cbiAgICAgICAgICB2YXIgaWZ0ZSA9IGVudi5jb25kKGVsZW1lbnRTdHJlYW0pXG4gICAgICAgICAgICAudGhlbihlbGVtZW50cywgJz0nLCBFTEVNRU5UX1NUQVRFLCAnLmNyZWF0ZVN0cmVhbSgnLCBlbGVtZW50RGVmbiwgJyk7JylcbiAgICAgICAgICAgIC5lbHNlKGVsZW1lbnRzLCAnPScsIEVMRU1FTlRfU1RBVEUsICcuZ2V0RWxlbWVudHMoJywgZWxlbWVudERlZm4sICcpOycpXG5cbiAgICAgICAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBlbnYuYXNzZXJ0KGlmdGUuZWxzZSxcbiAgICAgICAgICAgICAgJyEnICsgZWxlbWVudERlZm4gKyAnfHwnICsgZWxlbWVudHMsXG4gICAgICAgICAgICAgICdpbnZhbGlkIGVsZW1lbnRzJylcbiAgICAgICAgICB9KVxuXG4gICAgICAgICAgc2NvcGUuZW50cnkoaWZ0ZSlcbiAgICAgICAgICBzY29wZS5leGl0KFxuICAgICAgICAgICAgZW52LmNvbmQoZWxlbWVudFN0cmVhbSlcbiAgICAgICAgICAgICAgLnRoZW4oRUxFTUVOVF9TVEFURSwgJy5kZXN0cm95U3RyZWFtKCcsIGVsZW1lbnRzLCAnKTsnKSlcblxuICAgICAgICAgIGVudi5FTEVNRU5UUyA9IGVsZW1lbnRzXG5cbiAgICAgICAgICByZXR1cm4gZWxlbWVudHNcbiAgICAgICAgfSlcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG5cbiAgICB2YXIgZWxlbWVudHMgPSBwYXJzZUVsZW1lbnRzKClcblxuICAgIGZ1bmN0aW9uIHBhcnNlUHJpbWl0aXZlICgpIHtcbiAgICAgIGlmIChTX1BSSU1JVElWRSBpbiBzdGF0aWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBwcmltaXRpdmUgPSBzdGF0aWNPcHRpb25zW1NfUFJJTUlUSVZFXVxuICAgICAgICBjaGVjay5jb21tYW5kUGFyYW1ldGVyKHByaW1pdGl2ZSwgcHJpbVR5cGVzLCAnaW52YWxpZCBwcmltaXR2ZScsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHJldHVybiBwcmltVHlwZXNbcHJpbWl0aXZlXVxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIGlmIChTX1BSSU1JVElWRSBpbiBkeW5hbWljT3B0aW9ucykge1xuICAgICAgICB2YXIgZHluUHJpbWl0aXZlID0gZHluYW1pY09wdGlvbnNbU19QUklNSVRJVkVdXG4gICAgICAgIHJldHVybiBjcmVhdGVEeW5hbWljRGVjbChkeW5QcmltaXRpdmUsIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgdmFyIFBSSU1fVFlQRVMgPSBlbnYuY29uc3RhbnRzLnByaW1UeXBlc1xuICAgICAgICAgIHZhciBwcmltID0gZW52Lmludm9rZShzY29wZSwgZHluUHJpbWl0aXZlKVxuICAgICAgICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXG4gICAgICAgICAgICAgIHByaW0gKyAnIGluICcgKyBQUklNX1RZUEVTLFxuICAgICAgICAgICAgICAnaW52YWxpZCBwcmltaXRpdmUsIG11c3QgYmUgb25lIG9mICcgKyBPYmplY3Qua2V5cyhwcmltVHlwZXMpKVxuICAgICAgICAgIH0pXG4gICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihQUklNX1RZUEVTLCAnWycsIHByaW0sICddJylcbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSBpZiAoZWxlbWVudHMpIHtcbiAgICAgICAgaWYgKGlzU3RhdGljKGVsZW1lbnRzKSkge1xuICAgICAgICAgIGlmIChlbGVtZW50cy52YWx1ZSkge1xuICAgICAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihlbnYuRUxFTUVOVFMsICcucHJpbVR5cGUnKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICByZXR1cm4gR0xfVFJJQU5HTEVTXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgICAgICAgZWxlbWVudHMudGhpc0RlcCxcbiAgICAgICAgICAgIGVsZW1lbnRzLmNvbnRleHREZXAsXG4gICAgICAgICAgICBlbGVtZW50cy5wcm9wRGVwLFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICAgICAgdmFyIGVsZW1lbnRzID0gZW52LkVMRU1FTlRTXG4gICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoZWxlbWVudHMsICc/JywgZWxlbWVudHMsICcucHJpbVR5cGU6JywgR0xfVFJJQU5HTEVTKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwYXJzZVBhcmFtIChwYXJhbSwgaXNPZmZzZXQpIHtcbiAgICAgIGlmIChwYXJhbSBpbiBzdGF0aWNPcHRpb25zKSB7XG4gICAgICAgIHZhciB2YWx1ZSA9IHN0YXRpY09wdGlvbnNbcGFyYW1dIHwgMFxuICAgICAgICBjaGVjay5jb21tYW5kKCFpc09mZnNldCB8fCB2YWx1ZSA+PSAwLCAnaW52YWxpZCAnICsgcGFyYW0sIGVudi5jb21tYW5kU3RyKVxuICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIGlmIChpc09mZnNldCkge1xuICAgICAgICAgICAgZW52Lk9GRlNFVCA9IHZhbHVlXG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB2YWx1ZVxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIGlmIChwYXJhbSBpbiBkeW5hbWljT3B0aW9ucykge1xuICAgICAgICB2YXIgZHluVmFsdWUgPSBkeW5hbWljT3B0aW9uc1twYXJhbV1cbiAgICAgICAgcmV0dXJuIGNyZWF0ZUR5bmFtaWNEZWNsKGR5blZhbHVlLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciByZXN1bHQgPSBlbnYuaW52b2tlKHNjb3BlLCBkeW5WYWx1ZSlcbiAgICAgICAgICBpZiAoaXNPZmZzZXQpIHtcbiAgICAgICAgICAgIGVudi5PRkZTRVQgPSByZXN1bHRcbiAgICAgICAgICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgZW52LmFzc2VydChzY29wZSxcbiAgICAgICAgICAgICAgICByZXN1bHQgKyAnPj0wJyxcbiAgICAgICAgICAgICAgICAnaW52YWxpZCAnICsgcGFyYW0pXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICAgIH0pXG4gICAgICB9IGVsc2UgaWYgKGlzT2Zmc2V0ICYmIGVsZW1lbnRzKSB7XG4gICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgZW52Lk9GRlNFVCA9ICcwJ1xuICAgICAgICAgIHJldHVybiAwXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cblxuICAgIHZhciBPRkZTRVQgPSBwYXJzZVBhcmFtKFNfT0ZGU0VULCB0cnVlKVxuXG4gICAgZnVuY3Rpb24gcGFyc2VWZXJ0Q291bnQgKCkge1xuICAgICAgaWYgKFNfQ09VTlQgaW4gc3RhdGljT3B0aW9ucykge1xuICAgICAgICB2YXIgY291bnQgPSBzdGF0aWNPcHRpb25zW1NfQ09VTlRdIHwgMFxuICAgICAgICBjaGVjay5jb21tYW5kKFxuICAgICAgICAgIHR5cGVvZiBjb3VudCA9PT0gJ251bWJlcicgJiYgY291bnQgPj0gMCwgJ2ludmFsaWQgdmVydGV4IGNvdW50JywgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICByZXR1cm4gY291bnRcbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSBpZiAoU19DT1VOVCBpbiBkeW5hbWljT3B0aW9ucykge1xuICAgICAgICB2YXIgZHluQ291bnQgPSBkeW5hbWljT3B0aW9uc1tTX0NPVU5UXVxuICAgICAgICByZXR1cm4gY3JlYXRlRHluYW1pY0RlY2woZHluQ291bnQsIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgdmFyIHJlc3VsdCA9IGVudi5pbnZva2Uoc2NvcGUsIGR5bkNvdW50KVxuICAgICAgICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXG4gICAgICAgICAgICAgICd0eXBlb2YgJyArIHJlc3VsdCArICc9PT1cIm51bWJlclwiJiYnICtcbiAgICAgICAgICAgICAgcmVzdWx0ICsgJz49MCYmJyArXG4gICAgICAgICAgICAgIHJlc3VsdCArICc9PT0oJyArIHJlc3VsdCArICd8MCknLFxuICAgICAgICAgICAgICAnaW52YWxpZCB2ZXJ0ZXggY291bnQnKVxuICAgICAgICAgIH0pXG4gICAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIGlmIChlbGVtZW50cykge1xuICAgICAgICBpZiAoaXNTdGF0aWMoZWxlbWVudHMpKSB7XG4gICAgICAgICAgaWYgKGVsZW1lbnRzKSB7XG4gICAgICAgICAgICBpZiAoT0ZGU0VUKSB7XG4gICAgICAgICAgICAgIHJldHVybiBuZXcgRGVjbGFyYXRpb24oXG4gICAgICAgICAgICAgICAgT0ZGU0VULnRoaXNEZXAsXG4gICAgICAgICAgICAgICAgT0ZGU0VULmNvbnRleHREZXAsXG4gICAgICAgICAgICAgICAgT0ZGU0VULnByb3BEZXAsXG4gICAgICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICAgICAgICAgIHZhciByZXN1bHQgPSBzY29wZS5kZWYoXG4gICAgICAgICAgICAgICAgICAgIGVudi5FTEVNRU5UUywgJy52ZXJ0Q291bnQtJywgZW52Lk9GRlNFVClcblxuICAgICAgICAgICAgICAgICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxuICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdCArICc+PTAnLFxuICAgICAgICAgICAgICAgICAgICAgICdpbnZhbGlkIHZlcnRleCBvZmZzZXQvZWxlbWVudCBidWZmZXIgdG9vIHNtYWxsJylcbiAgICAgICAgICAgICAgICAgIH0pXG5cbiAgICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKGVudi5FTEVNRU5UUywgJy52ZXJ0Q291bnQnKVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgcmVzdWx0ID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgIHJldHVybiAtMVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgcmVzdWx0Lk1JU1NJTkcgPSB0cnVlXG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB2YXIgdmFyaWFibGUgPSBuZXcgRGVjbGFyYXRpb24oXG4gICAgICAgICAgICBlbGVtZW50cy50aGlzRGVwIHx8IE9GRlNFVC50aGlzRGVwLFxuICAgICAgICAgICAgZWxlbWVudHMuY29udGV4dERlcCB8fCBPRkZTRVQuY29udGV4dERlcCxcbiAgICAgICAgICAgIGVsZW1lbnRzLnByb3BEZXAgfHwgT0ZGU0VULnByb3BEZXAsXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgICAgICB2YXIgZWxlbWVudHMgPSBlbnYuRUxFTUVOVFNcbiAgICAgICAgICAgICAgaWYgKGVudi5PRkZTRVQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKGVsZW1lbnRzLCAnPycsIGVsZW1lbnRzLCAnLnZlcnRDb3VudC0nLFxuICAgICAgICAgICAgICAgICAgZW52Lk9GRlNFVCwgJzotMScpXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihlbGVtZW50cywgJz8nLCBlbGVtZW50cywgJy52ZXJ0Q291bnQ6LTEnKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXJpYWJsZS5EWU5BTUlDID0gdHJ1ZVxuICAgICAgICAgIH0pXG4gICAgICAgICAgcmV0dXJuIHZhcmlhYmxlXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGVsZW1lbnRzOiBlbGVtZW50cyxcbiAgICAgIHByaW1pdGl2ZTogcGFyc2VQcmltaXRpdmUoKSxcbiAgICAgIGNvdW50OiBwYXJzZVZlcnRDb3VudCgpLFxuICAgICAgaW5zdGFuY2VzOiBwYXJzZVBhcmFtKFNfSU5TVEFOQ0VTLCBmYWxzZSksXG4gICAgICBvZmZzZXQ6IE9GRlNFVFxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlR0xTdGF0ZSAob3B0aW9ucywgZW52KSB7XG4gICAgdmFyIHN0YXRpY09wdGlvbnMgPSBvcHRpb25zLnN0YXRpY1xuICAgIHZhciBkeW5hbWljT3B0aW9ucyA9IG9wdGlvbnMuZHluYW1pY1xuXG4gICAgdmFyIFNUQVRFID0ge31cblxuICAgIEdMX1NUQVRFX05BTUVTLmZvckVhY2goZnVuY3Rpb24gKHByb3ApIHtcbiAgICAgIHZhciBwYXJhbSA9IHByb3BOYW1lKHByb3ApXG5cbiAgICAgIGZ1bmN0aW9uIHBhcnNlUGFyYW0gKHBhcnNlU3RhdGljLCBwYXJzZUR5bmFtaWMpIHtcbiAgICAgICAgaWYgKHByb3AgaW4gc3RhdGljT3B0aW9ucykge1xuICAgICAgICAgIHZhciB2YWx1ZSA9IHBhcnNlU3RhdGljKHN0YXRpY09wdGlvbnNbcHJvcF0pXG4gICAgICAgICAgU1RBVEVbcGFyYW1dID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gdmFsdWVcbiAgICAgICAgICB9KVxuICAgICAgICB9IGVsc2UgaWYgKHByb3AgaW4gZHluYW1pY09wdGlvbnMpIHtcbiAgICAgICAgICB2YXIgZHluID0gZHluYW1pY09wdGlvbnNbcHJvcF1cbiAgICAgICAgICBTVEFURVtwYXJhbV0gPSBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgICByZXR1cm4gcGFyc2VEeW5hbWljKGVudiwgc2NvcGUsIGVudi5pbnZva2Uoc2NvcGUsIGR5bikpXG4gICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBzd2l0Y2ggKHByb3ApIHtcbiAgICAgICAgY2FzZSBTX0NVTExfRU5BQkxFOlxuICAgICAgICBjYXNlIFNfQkxFTkRfRU5BQkxFOlxuICAgICAgICBjYXNlIFNfRElUSEVSOlxuICAgICAgICBjYXNlIFNfU1RFTkNJTF9FTkFCTEU6XG4gICAgICAgIGNhc2UgU19ERVBUSF9FTkFCTEU6XG4gICAgICAgIGNhc2UgU19TQ0lTU09SX0VOQUJMRTpcbiAgICAgICAgY2FzZSBTX1BPTFlHT05fT0ZGU0VUX0VOQUJMRTpcbiAgICAgICAgY2FzZSBTX1NBTVBMRV9BTFBIQTpcbiAgICAgICAgY2FzZSBTX1NBTVBMRV9FTkFCTEU6XG4gICAgICAgIGNhc2UgU19ERVBUSF9NQVNLOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmRUeXBlKHZhbHVlLCAnYm9vbGVhbicsIHByb3AsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICByZXR1cm4gdmFsdWVcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXG4gICAgICAgICAgICAgICAgICAndHlwZW9mICcgKyB2YWx1ZSArICc9PT1cImJvb2xlYW5cIicsXG4gICAgICAgICAgICAgICAgICAnaW52YWxpZCBmbGFnICcgKyBwcm9wLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19ERVBUSF9GVU5DOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmRQYXJhbWV0ZXIodmFsdWUsIGNvbXBhcmVGdW5jcywgJ2ludmFsaWQgJyArIHByb3AsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICByZXR1cm4gY29tcGFyZUZ1bmNzW3ZhbHVlXVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICB2YXIgQ09NUEFSRV9GVU5DUyA9IGVudi5jb25zdGFudHMuY29tcGFyZUZ1bmNzXG4gICAgICAgICAgICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxuICAgICAgICAgICAgICAgICAgdmFsdWUgKyAnIGluICcgKyBDT01QQVJFX0ZVTkNTLFxuICAgICAgICAgICAgICAgICAgJ2ludmFsaWQgJyArIHByb3AgKyAnLCBtdXN0IGJlIG9uZSBvZiAnICsgT2JqZWN0LmtleXMoY29tcGFyZUZ1bmNzKSlcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihDT01QQVJFX0ZVTkNTLCAnWycsIHZhbHVlLCAnXScpXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19ERVBUSF9SQU5HRTpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBjaGVjay5jb21tYW5kKFxuICAgICAgICAgICAgICAgIGlzQXJyYXlMaWtlKHZhbHVlKSAmJlxuICAgICAgICAgICAgICAgIHZhbHVlLmxlbmd0aCA9PT0gMiAmJlxuICAgICAgICAgICAgICAgIHR5cGVvZiB2YWx1ZVswXSA9PT0gJ251bWJlcicgJiZcbiAgICAgICAgICAgICAgICB0eXBlb2YgdmFsdWVbMV0gPT09ICdudW1iZXInICYmXG4gICAgICAgICAgICAgICAgdmFsdWVbMF0gPD0gdmFsdWVbMV0sXG4gICAgICAgICAgICAgICAgJ2RlcHRoIHJhbmdlIGlzIDJkIGFycmF5JyxcbiAgICAgICAgICAgICAgICBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxuICAgICAgICAgICAgICAgICAgZW52LnNoYXJlZC5pc0FycmF5TGlrZSArICcoJyArIHZhbHVlICsgJykmJicgK1xuICAgICAgICAgICAgICAgICAgdmFsdWUgKyAnLmxlbmd0aD09PTImJicgK1xuICAgICAgICAgICAgICAgICAgJ3R5cGVvZiAnICsgdmFsdWUgKyAnWzBdPT09XCJudW1iZXJcIiYmJyArXG4gICAgICAgICAgICAgICAgICAndHlwZW9mICcgKyB2YWx1ZSArICdbMV09PT1cIm51bWJlclwiJiYnICtcbiAgICAgICAgICAgICAgICAgIHZhbHVlICsgJ1swXTw9JyArIHZhbHVlICsgJ1sxXScsXG4gICAgICAgICAgICAgICAgICAnZGVwdGggcmFuZ2UgbXVzdCBiZSBhIDJkIGFycmF5JylcbiAgICAgICAgICAgICAgfSlcblxuICAgICAgICAgICAgICB2YXIgWl9ORUFSID0gc2NvcGUuZGVmKCcrJywgdmFsdWUsICdbMF0nKVxuICAgICAgICAgICAgICB2YXIgWl9GQVIgPSBzY29wZS5kZWYoJysnLCB2YWx1ZSwgJ1sxXScpXG4gICAgICAgICAgICAgIHJldHVybiBbWl9ORUFSLCBaX0ZBUl1cbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX0JMRU5EX0ZVTkM6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgY2hlY2suY29tbWFuZFR5cGUodmFsdWUsICdvYmplY3QnLCAnYmxlbmQuZnVuYycsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICB2YXIgc3JjUkdCID0gKCdzcmNSR0InIGluIHZhbHVlID8gdmFsdWUuc3JjUkdCIDogdmFsdWUuc3JjKVxuICAgICAgICAgICAgICB2YXIgc3JjQWxwaGEgPSAoJ3NyY0FscGhhJyBpbiB2YWx1ZSA/IHZhbHVlLnNyY0FscGhhIDogdmFsdWUuc3JjKVxuICAgICAgICAgICAgICB2YXIgZHN0UkdCID0gKCdkc3RSR0InIGluIHZhbHVlID8gdmFsdWUuZHN0UkdCIDogdmFsdWUuZHN0KVxuICAgICAgICAgICAgICB2YXIgZHN0QWxwaGEgPSAoJ2RzdEFscGhhJyBpbiB2YWx1ZSA/IHZhbHVlLmRzdEFscGhhIDogdmFsdWUuZHN0KVxuICAgICAgICAgICAgICBjaGVjay5jb21tYW5kUGFyYW1ldGVyKHNyY1JHQiwgYmxlbmRGdW5jcywgcGFyYW0gKyAnLnNyY1JHQicsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICBjaGVjay5jb21tYW5kUGFyYW1ldGVyKHNyY0FscGhhLCBibGVuZEZ1bmNzLCBwYXJhbSArICcuc3JjQWxwaGEnLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgY2hlY2suY29tbWFuZFBhcmFtZXRlcihkc3RSR0IsIGJsZW5kRnVuY3MsIHBhcmFtICsgJy5kc3RSR0InLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgY2hlY2suY29tbWFuZFBhcmFtZXRlcihkc3RBbHBoYSwgYmxlbmRGdW5jcywgcGFyYW0gKyAnLmRzdEFscGhhJywgZW52LmNvbW1hbmRTdHIpXG5cbiAgICAgICAgICAgICAgY2hlY2suY29tbWFuZChcbiAgICAgICAgICAgICAgICAoaW52YWxpZEJsZW5kQ29tYmluYXRpb25zLmluZGV4T2Yoc3JjUkdCICsgJywgJyArIGRzdFJHQikgPT09IC0xKSxcbiAgICAgICAgICAgICAgICAndW5hbGxvd2VkIGJsZW5kaW5nIGNvbWJpbmF0aW9uIChzcmNSR0IsIGRzdFJHQikgPSAoJyArIHNyY1JHQiArICcsICcgKyBkc3RSR0IgKyAnKScsIGVudi5jb21tYW5kU3RyKVxuXG4gICAgICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICAgICAgYmxlbmRGdW5jc1tzcmNSR0JdLFxuICAgICAgICAgICAgICAgIGJsZW5kRnVuY3NbZHN0UkdCXSxcbiAgICAgICAgICAgICAgICBibGVuZEZ1bmNzW3NyY0FscGhhXSxcbiAgICAgICAgICAgICAgICBibGVuZEZ1bmNzW2RzdEFscGhhXVxuICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIHZhciBCTEVORF9GVU5DUyA9IGVudi5jb25zdGFudHMuYmxlbmRGdW5jc1xuXG4gICAgICAgICAgICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxuICAgICAgICAgICAgICAgICAgdmFsdWUgKyAnJiZ0eXBlb2YgJyArIHZhbHVlICsgJz09PVwib2JqZWN0XCInLFxuICAgICAgICAgICAgICAgICAgJ2ludmFsaWQgYmxlbmQgZnVuYywgbXVzdCBiZSBhbiBvYmplY3QnKVxuICAgICAgICAgICAgICB9KVxuXG4gICAgICAgICAgICAgIGZ1bmN0aW9uIHJlYWQgKHByZWZpeCwgc3VmZml4KSB7XG4gICAgICAgICAgICAgICAgdmFyIGZ1bmMgPSBzY29wZS5kZWYoXG4gICAgICAgICAgICAgICAgICAnXCInLCBwcmVmaXgsIHN1ZmZpeCwgJ1wiIGluICcsIHZhbHVlLFxuICAgICAgICAgICAgICAgICAgJz8nLCB2YWx1ZSwgJy4nLCBwcmVmaXgsIHN1ZmZpeCxcbiAgICAgICAgICAgICAgICAgICc6JywgdmFsdWUsICcuJywgcHJlZml4KVxuXG4gICAgICAgICAgICAgICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgZW52LmFzc2VydChzY29wZSxcbiAgICAgICAgICAgICAgICAgICAgZnVuYyArICcgaW4gJyArIEJMRU5EX0ZVTkNTLFxuICAgICAgICAgICAgICAgICAgICAnaW52YWxpZCAnICsgcHJvcCArICcuJyArIHByZWZpeCArIHN1ZmZpeCArICcsIG11c3QgYmUgb25lIG9mICcgKyBPYmplY3Qua2V5cyhibGVuZEZ1bmNzKSlcbiAgICAgICAgICAgICAgICB9KVxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZ1bmNcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIHZhciBzcmNSR0IgPSByZWFkKCdzcmMnLCAnUkdCJylcbiAgICAgICAgICAgICAgdmFyIGRzdFJHQiA9IHJlYWQoJ2RzdCcsICdSR0InKVxuXG4gICAgICAgICAgICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICB2YXIgSU5WQUxJRF9CTEVORF9DT01CSU5BVElPTlMgPSBlbnYuY29uc3RhbnRzLmludmFsaWRCbGVuZENvbWJpbmF0aW9uc1xuXG4gICAgICAgICAgICAgICAgZW52LmFzc2VydChzY29wZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIElOVkFMSURfQkxFTkRfQ09NQklOQVRJT05TICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICcuaW5kZXhPZignICsgc3JjUkdCICsgJytcIiwgXCIrJyArIGRzdFJHQiArICcpID09PSAtMSAnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgJ3VuYWxsb3dlZCBibGVuZGluZyBjb21iaW5hdGlvbiBmb3IgKHNyY1JHQiwgZHN0UkdCKSdcbiAgICAgICAgICAgICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICB9KVxuXG4gICAgICAgICAgICAgIHZhciBTUkNfUkdCID0gc2NvcGUuZGVmKEJMRU5EX0ZVTkNTLCAnWycsIHNyY1JHQiwgJ10nKVxuICAgICAgICAgICAgICB2YXIgU1JDX0FMUEhBID0gc2NvcGUuZGVmKEJMRU5EX0ZVTkNTLCAnWycsIHJlYWQoJ3NyYycsICdBbHBoYScpLCAnXScpXG4gICAgICAgICAgICAgIHZhciBEU1RfUkdCID0gc2NvcGUuZGVmKEJMRU5EX0ZVTkNTLCAnWycsIGRzdFJHQiwgJ10nKVxuICAgICAgICAgICAgICB2YXIgRFNUX0FMUEhBID0gc2NvcGUuZGVmKEJMRU5EX0ZVTkNTLCAnWycsIHJlYWQoJ2RzdCcsICdBbHBoYScpLCAnXScpXG5cbiAgICAgICAgICAgICAgcmV0dXJuIFtTUkNfUkdCLCBEU1RfUkdCLCBTUkNfQUxQSEEsIERTVF9BTFBIQV1cbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX0JMRU5EX0VRVUFUSU9OOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgY2hlY2suY29tbWFuZFBhcmFtZXRlcih2YWx1ZSwgYmxlbmRFcXVhdGlvbnMsICdpbnZhbGlkICcgKyBwcm9wLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgICAgICAgYmxlbmRFcXVhdGlvbnNbdmFsdWVdLFxuICAgICAgICAgICAgICAgICAgYmxlbmRFcXVhdGlvbnNbdmFsdWVdXG4gICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICBjaGVjay5jb21tYW5kUGFyYW1ldGVyKFxuICAgICAgICAgICAgICAgICAgdmFsdWUucmdiLCBibGVuZEVxdWF0aW9ucywgcHJvcCArICcucmdiJywgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgICAgY2hlY2suY29tbWFuZFBhcmFtZXRlcihcbiAgICAgICAgICAgICAgICAgIHZhbHVlLmFscGhhLCBibGVuZEVxdWF0aW9ucywgcHJvcCArICcuYWxwaGEnLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgICAgICAgYmxlbmRFcXVhdGlvbnNbdmFsdWUucmdiXSxcbiAgICAgICAgICAgICAgICAgIGJsZW5kRXF1YXRpb25zW3ZhbHVlLmFscGhhXVxuICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjaGVjay5jb21tYW5kUmFpc2UoJ2ludmFsaWQgYmxlbmQuZXF1YXRpb24nLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICB2YXIgQkxFTkRfRVFVQVRJT05TID0gZW52LmNvbnN0YW50cy5ibGVuZEVxdWF0aW9uc1xuXG4gICAgICAgICAgICAgIHZhciBSR0IgPSBzY29wZS5kZWYoKVxuICAgICAgICAgICAgICB2YXIgQUxQSEEgPSBzY29wZS5kZWYoKVxuXG4gICAgICAgICAgICAgIHZhciBpZnRlID0gZW52LmNvbmQoJ3R5cGVvZiAnLCB2YWx1ZSwgJz09PVwic3RyaW5nXCInKVxuXG4gICAgICAgICAgICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBmdW5jdGlvbiBjaGVja1Byb3AgKGJsb2NrLCBuYW1lLCB2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgZW52LmFzc2VydChibG9jayxcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgKyAnIGluICcgKyBCTEVORF9FUVVBVElPTlMsXG4gICAgICAgICAgICAgICAgICAgICdpbnZhbGlkICcgKyBuYW1lICsgJywgbXVzdCBiZSBvbmUgb2YgJyArIE9iamVjdC5rZXlzKGJsZW5kRXF1YXRpb25zKSlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2hlY2tQcm9wKGlmdGUudGhlbiwgcHJvcCwgdmFsdWUpXG5cbiAgICAgICAgICAgICAgICBlbnYuYXNzZXJ0KGlmdGUuZWxzZSxcbiAgICAgICAgICAgICAgICAgIHZhbHVlICsgJyYmdHlwZW9mICcgKyB2YWx1ZSArICc9PT1cIm9iamVjdFwiJyxcbiAgICAgICAgICAgICAgICAgICdpbnZhbGlkICcgKyBwcm9wKVxuICAgICAgICAgICAgICAgIGNoZWNrUHJvcChpZnRlLmVsc2UsIHByb3AgKyAnLnJnYicsIHZhbHVlICsgJy5yZ2InKVxuICAgICAgICAgICAgICAgIGNoZWNrUHJvcChpZnRlLmVsc2UsIHByb3AgKyAnLmFscGhhJywgdmFsdWUgKyAnLmFscGhhJylcbiAgICAgICAgICAgICAgfSlcblxuICAgICAgICAgICAgICBpZnRlLnRoZW4oXG4gICAgICAgICAgICAgICAgUkdCLCAnPScsIEFMUEhBLCAnPScsIEJMRU5EX0VRVUFUSU9OUywgJ1snLCB2YWx1ZSwgJ107JylcbiAgICAgICAgICAgICAgaWZ0ZS5lbHNlKFxuICAgICAgICAgICAgICAgIFJHQiwgJz0nLCBCTEVORF9FUVVBVElPTlMsICdbJywgdmFsdWUsICcucmdiXTsnLFxuICAgICAgICAgICAgICAgIEFMUEhBLCAnPScsIEJMRU5EX0VRVUFUSU9OUywgJ1snLCB2YWx1ZSwgJy5hbHBoYV07JylcblxuICAgICAgICAgICAgICBzY29wZShpZnRlKVxuXG4gICAgICAgICAgICAgIHJldHVybiBbUkdCLCBBTFBIQV1cbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX0JMRU5EX0NPTE9SOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmQoXG4gICAgICAgICAgICAgICAgaXNBcnJheUxpa2UodmFsdWUpICYmXG4gICAgICAgICAgICAgICAgdmFsdWUubGVuZ3RoID09PSA0LFxuICAgICAgICAgICAgICAgICdibGVuZC5jb2xvciBtdXN0IGJlIGEgNGQgYXJyYXknLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgcmV0dXJuIGxvb3AoNCwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gK3ZhbHVlW2ldXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxuICAgICAgICAgICAgICAgICAgZW52LnNoYXJlZC5pc0FycmF5TGlrZSArICcoJyArIHZhbHVlICsgJykmJicgK1xuICAgICAgICAgICAgICAgICAgdmFsdWUgKyAnLmxlbmd0aD09PTQnLFxuICAgICAgICAgICAgICAgICAgJ2JsZW5kLmNvbG9yIG11c3QgYmUgYSA0ZCBhcnJheScpXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIHJldHVybiBsb29wKDQsIGZ1bmN0aW9uIChpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZignKycsIHZhbHVlLCAnWycsIGksICddJylcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX1NURU5DSUxfTUFTSzpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBjaGVjay5jb21tYW5kVHlwZSh2YWx1ZSwgJ251bWJlcicsIHBhcmFtLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlIHwgMFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgZW52LmFzc2VydChzY29wZSxcbiAgICAgICAgICAgICAgICAgICd0eXBlb2YgJyArIHZhbHVlICsgJz09PVwibnVtYmVyXCInLFxuICAgICAgICAgICAgICAgICAgJ2ludmFsaWQgc3RlbmNpbC5tYXNrJylcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZih2YWx1ZSwgJ3wwJylcbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX1NURU5DSUxfRlVOQzpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBjaGVjay5jb21tYW5kVHlwZSh2YWx1ZSwgJ29iamVjdCcsIHBhcmFtLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgdmFyIGNtcCA9IHZhbHVlLmNtcCB8fCAna2VlcCdcbiAgICAgICAgICAgICAgdmFyIHJlZiA9IHZhbHVlLnJlZiB8fCAwXG4gICAgICAgICAgICAgIHZhciBtYXNrID0gJ21hc2snIGluIHZhbHVlID8gdmFsdWUubWFzayA6IC0xXG4gICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmRQYXJhbWV0ZXIoY21wLCBjb21wYXJlRnVuY3MsIHByb3AgKyAnLmNtcCcsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICBjaGVjay5jb21tYW5kVHlwZShyZWYsICdudW1iZXInLCBwcm9wICsgJy5yZWYnLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgY2hlY2suY29tbWFuZFR5cGUobWFzaywgJ251bWJlcicsIHByb3AgKyAnLm1hc2snLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgICBjb21wYXJlRnVuY3NbY21wXSxcbiAgICAgICAgICAgICAgICByZWYsXG4gICAgICAgICAgICAgICAgbWFza1xuICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIHZhciBDT01QQVJFX0ZVTkNTID0gZW52LmNvbnN0YW50cy5jb21wYXJlRnVuY3NcbiAgICAgICAgICAgICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGZ1bmN0aW9uIGFzc2VydCAoKSB7XG4gICAgICAgICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxuICAgICAgICAgICAgICAgICAgICBBcnJheS5wcm90b3R5cGUuam9pbi5jYWxsKGFyZ3VtZW50cywgJycpLFxuICAgICAgICAgICAgICAgICAgICAnaW52YWxpZCBzdGVuY2lsLmZ1bmMnKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBhc3NlcnQodmFsdWUgKyAnJiZ0eXBlb2YgJywgdmFsdWUsICc9PT1cIm9iamVjdFwiJylcbiAgICAgICAgICAgICAgICBhc3NlcnQoJyEoXCJjbXBcIiBpbiAnLCB2YWx1ZSwgJyl8fCgnLFxuICAgICAgICAgICAgICAgICAgdmFsdWUsICcuY21wIGluICcsIENPTVBBUkVfRlVOQ1MsICcpJylcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgdmFyIGNtcCA9IHNjb3BlLmRlZihcbiAgICAgICAgICAgICAgICAnXCJjbXBcIiBpbiAnLCB2YWx1ZSxcbiAgICAgICAgICAgICAgICAnPycsIENPTVBBUkVfRlVOQ1MsICdbJywgdmFsdWUsICcuY21wXScsXG4gICAgICAgICAgICAgICAgJzonLCBHTF9LRUVQKVxuICAgICAgICAgICAgICB2YXIgcmVmID0gc2NvcGUuZGVmKHZhbHVlLCAnLnJlZnwwJylcbiAgICAgICAgICAgICAgdmFyIG1hc2sgPSBzY29wZS5kZWYoXG4gICAgICAgICAgICAgICAgJ1wibWFza1wiIGluICcsIHZhbHVlLFxuICAgICAgICAgICAgICAgICc/JywgdmFsdWUsICcubWFza3wwOi0xJylcbiAgICAgICAgICAgICAgcmV0dXJuIFtjbXAsIHJlZiwgbWFza11cbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX1NURU5DSUxfT1BGUk9OVDpcbiAgICAgICAgY2FzZSBTX1NURU5DSUxfT1BCQUNLOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmRUeXBlKHZhbHVlLCAnb2JqZWN0JywgcGFyYW0sIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICB2YXIgZmFpbCA9IHZhbHVlLmZhaWwgfHwgJ2tlZXAnXG4gICAgICAgICAgICAgIHZhciB6ZmFpbCA9IHZhbHVlLnpmYWlsIHx8ICdrZWVwJ1xuICAgICAgICAgICAgICB2YXIgenBhc3MgPSB2YWx1ZS56cGFzcyB8fCAna2VlcCdcbiAgICAgICAgICAgICAgY2hlY2suY29tbWFuZFBhcmFtZXRlcihmYWlsLCBzdGVuY2lsT3BzLCBwcm9wICsgJy5mYWlsJywgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmRQYXJhbWV0ZXIoemZhaWwsIHN0ZW5jaWxPcHMsIHByb3AgKyAnLnpmYWlsJywgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmRQYXJhbWV0ZXIoenBhc3MsIHN0ZW5jaWxPcHMsIHByb3AgKyAnLnpwYXNzJywgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICAgICAgcHJvcCA9PT0gU19TVEVOQ0lMX09QQkFDSyA/IEdMX0JBQ0sgOiBHTF9GUk9OVCxcbiAgICAgICAgICAgICAgICBzdGVuY2lsT3BzW2ZhaWxdLFxuICAgICAgICAgICAgICAgIHN0ZW5jaWxPcHNbemZhaWxdLFxuICAgICAgICAgICAgICAgIHN0ZW5jaWxPcHNbenBhc3NdXG4gICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgdmFyIFNURU5DSUxfT1BTID0gZW52LmNvbnN0YW50cy5zdGVuY2lsT3BzXG5cbiAgICAgICAgICAgICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXG4gICAgICAgICAgICAgICAgICB2YWx1ZSArICcmJnR5cGVvZiAnICsgdmFsdWUgKyAnPT09XCJvYmplY3RcIicsXG4gICAgICAgICAgICAgICAgICAnaW52YWxpZCAnICsgcHJvcClcbiAgICAgICAgICAgICAgfSlcblxuICAgICAgICAgICAgICBmdW5jdGlvbiByZWFkIChuYW1lKSB7XG4gICAgICAgICAgICAgICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgZW52LmFzc2VydChzY29wZSxcbiAgICAgICAgICAgICAgICAgICAgJyEoXCInICsgbmFtZSArICdcIiBpbiAnICsgdmFsdWUgKyAnKXx8JyArXG4gICAgICAgICAgICAgICAgICAgICcoJyArIHZhbHVlICsgJy4nICsgbmFtZSArICcgaW4gJyArIFNURU5DSUxfT1BTICsgJyknLFxuICAgICAgICAgICAgICAgICAgICAnaW52YWxpZCAnICsgcHJvcCArICcuJyArIG5hbWUgKyAnLCBtdXN0IGJlIG9uZSBvZiAnICsgT2JqZWN0LmtleXMoc3RlbmNpbE9wcykpXG4gICAgICAgICAgICAgICAgfSlcblxuICAgICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoXG4gICAgICAgICAgICAgICAgICAnXCInLCBuYW1lLCAnXCIgaW4gJywgdmFsdWUsXG4gICAgICAgICAgICAgICAgICAnPycsIFNURU5DSUxfT1BTLCAnWycsIHZhbHVlLCAnLicsIG5hbWUsICddOicsXG4gICAgICAgICAgICAgICAgICBHTF9LRUVQKVxuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgICBwcm9wID09PSBTX1NURU5DSUxfT1BCQUNLID8gR0xfQkFDSyA6IEdMX0ZST05ULFxuICAgICAgICAgICAgICAgIHJlYWQoJ2ZhaWwnKSxcbiAgICAgICAgICAgICAgICByZWFkKCd6ZmFpbCcpLFxuICAgICAgICAgICAgICAgIHJlYWQoJ3pwYXNzJylcbiAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfUE9MWUdPTl9PRkZTRVRfT0ZGU0VUOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmRUeXBlKHZhbHVlLCAnb2JqZWN0JywgcGFyYW0sIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICB2YXIgZmFjdG9yID0gdmFsdWUuZmFjdG9yIHwgMFxuICAgICAgICAgICAgICB2YXIgdW5pdHMgPSB2YWx1ZS51bml0cyB8IDBcbiAgICAgICAgICAgICAgY2hlY2suY29tbWFuZFR5cGUoZmFjdG9yLCAnbnVtYmVyJywgcGFyYW0gKyAnLmZhY3RvcicsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICBjaGVjay5jb21tYW5kVHlwZSh1bml0cywgJ251bWJlcicsIHBhcmFtICsgJy51bml0cycsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICByZXR1cm4gW2ZhY3RvciwgdW5pdHNdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxuICAgICAgICAgICAgICAgICAgdmFsdWUgKyAnJiZ0eXBlb2YgJyArIHZhbHVlICsgJz09PVwib2JqZWN0XCInLFxuICAgICAgICAgICAgICAgICAgJ2ludmFsaWQgJyArIHByb3ApXG4gICAgICAgICAgICAgIH0pXG5cbiAgICAgICAgICAgICAgdmFyIEZBQ1RPUiA9IHNjb3BlLmRlZih2YWx1ZSwgJy5mYWN0b3J8MCcpXG4gICAgICAgICAgICAgIHZhciBVTklUUyA9IHNjb3BlLmRlZih2YWx1ZSwgJy51bml0c3wwJylcblxuICAgICAgICAgICAgICByZXR1cm4gW0ZBQ1RPUiwgVU5JVFNdXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19DVUxMX0ZBQ0U6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgdmFyIGZhY2UgPSAwXG4gICAgICAgICAgICAgIGlmICh2YWx1ZSA9PT0gJ2Zyb250Jykge1xuICAgICAgICAgICAgICAgIGZhY2UgPSBHTF9GUk9OVFxuICAgICAgICAgICAgICB9IGVsc2UgaWYgKHZhbHVlID09PSAnYmFjaycpIHtcbiAgICAgICAgICAgICAgICBmYWNlID0gR0xfQkFDS1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmQoISFmYWNlLCBwYXJhbSwgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgIHJldHVybiBmYWNlXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxuICAgICAgICAgICAgICAgICAgdmFsdWUgKyAnPT09XCJmcm9udFwifHwnICtcbiAgICAgICAgICAgICAgICAgIHZhbHVlICsgJz09PVwiYmFja1wiJyxcbiAgICAgICAgICAgICAgICAgICdpbnZhbGlkIGN1bGwuZmFjZScpXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYodmFsdWUsICc9PT1cImZyb250XCI/JywgR0xfRlJPTlQsICc6JywgR0xfQkFDSylcbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX0xJTkVfV0lEVEg6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgY2hlY2suY29tbWFuZChcbiAgICAgICAgICAgICAgICB0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInICYmXG4gICAgICAgICAgICAgICAgdmFsdWUgPj0gbGltaXRzLmxpbmVXaWR0aERpbXNbMF0gJiZcbiAgICAgICAgICAgICAgICB2YWx1ZSA8PSBsaW1pdHMubGluZVdpZHRoRGltc1sxXSxcbiAgICAgICAgICAgICAgICAnaW52YWxpZCBsaW5lIHdpZHRoLCBtdXN0IHBvc2l0aXZlIG51bWJlciBiZXR3ZWVuICcgK1xuICAgICAgICAgICAgICAgIGxpbWl0cy5saW5lV2lkdGhEaW1zWzBdICsgJyBhbmQgJyArIGxpbWl0cy5saW5lV2lkdGhEaW1zWzFdLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxuICAgICAgICAgICAgICAgICAgJ3R5cGVvZiAnICsgdmFsdWUgKyAnPT09XCJudW1iZXJcIiYmJyArXG4gICAgICAgICAgICAgICAgICB2YWx1ZSArICc+PScgKyBsaW1pdHMubGluZVdpZHRoRGltc1swXSArICcmJicgK1xuICAgICAgICAgICAgICAgICAgdmFsdWUgKyAnPD0nICsgbGltaXRzLmxpbmVXaWR0aERpbXNbMV0sXG4gICAgICAgICAgICAgICAgICAnaW52YWxpZCBsaW5lIHdpZHRoJylcbiAgICAgICAgICAgICAgfSlcblxuICAgICAgICAgICAgICByZXR1cm4gdmFsdWVcbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX0ZST05UX0ZBQ0U6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgY2hlY2suY29tbWFuZFBhcmFtZXRlcih2YWx1ZSwgb3JpZW50YXRpb25UeXBlLCBwYXJhbSwgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgIHJldHVybiBvcmllbnRhdGlvblR5cGVbdmFsdWVdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxuICAgICAgICAgICAgICAgICAgdmFsdWUgKyAnPT09XCJjd1wifHwnICtcbiAgICAgICAgICAgICAgICAgIHZhbHVlICsgJz09PVwiY2N3XCInLFxuICAgICAgICAgICAgICAgICAgJ2ludmFsaWQgZnJvbnRGYWNlLCBtdXN0IGJlIG9uZSBvZiBjdyxjY3cnKVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKHZhbHVlICsgJz09PVwiY3dcIj8nICsgR0xfQ1cgKyAnOicgKyBHTF9DQ1cpXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19DT0xPUl9NQVNLOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmQoXG4gICAgICAgICAgICAgICAgaXNBcnJheUxpa2UodmFsdWUpICYmIHZhbHVlLmxlbmd0aCA9PT0gNCxcbiAgICAgICAgICAgICAgICAnY29sb3IubWFzayBtdXN0IGJlIGxlbmd0aCA0IGFycmF5JywgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZS5tYXAoZnVuY3Rpb24gKHYpIHsgcmV0dXJuICEhdiB9KVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgZW52LmFzc2VydChzY29wZSxcbiAgICAgICAgICAgICAgICAgIGVudi5zaGFyZWQuaXNBcnJheUxpa2UgKyAnKCcgKyB2YWx1ZSArICcpJiYnICtcbiAgICAgICAgICAgICAgICAgIHZhbHVlICsgJy5sZW5ndGg9PT00JyxcbiAgICAgICAgICAgICAgICAgICdpbnZhbGlkIGNvbG9yLm1hc2snKVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICByZXR1cm4gbG9vcCg0LCBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgICAgICAgIHJldHVybiAnISEnICsgdmFsdWUgKyAnWycgKyBpICsgJ10nXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19TQU1QTEVfQ09WRVJBR0U6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgY2hlY2suY29tbWFuZCh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlLCBwYXJhbSwgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgIHZhciBzYW1wbGVWYWx1ZSA9ICd2YWx1ZScgaW4gdmFsdWUgPyB2YWx1ZS52YWx1ZSA6IDFcbiAgICAgICAgICAgICAgdmFyIHNhbXBsZUludmVydCA9ICEhdmFsdWUuaW52ZXJ0XG4gICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmQoXG4gICAgICAgICAgICAgICAgdHlwZW9mIHNhbXBsZVZhbHVlID09PSAnbnVtYmVyJyAmJlxuICAgICAgICAgICAgICAgIHNhbXBsZVZhbHVlID49IDAgJiYgc2FtcGxlVmFsdWUgPD0gMSxcbiAgICAgICAgICAgICAgICAnc2FtcGxlLmNvdmVyYWdlLnZhbHVlIG11c3QgYmUgYSBudW1iZXIgYmV0d2VlbiAwIGFuZCAxJywgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgIHJldHVybiBbc2FtcGxlVmFsdWUsIHNhbXBsZUludmVydF1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXG4gICAgICAgICAgICAgICAgICB2YWx1ZSArICcmJnR5cGVvZiAnICsgdmFsdWUgKyAnPT09XCJvYmplY3RcIicsXG4gICAgICAgICAgICAgICAgICAnaW52YWxpZCBzYW1wbGUuY292ZXJhZ2UnKVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICB2YXIgVkFMVUUgPSBzY29wZS5kZWYoXG4gICAgICAgICAgICAgICAgJ1widmFsdWVcIiBpbiAnLCB2YWx1ZSwgJz8rJywgdmFsdWUsICcudmFsdWU6MScpXG4gICAgICAgICAgICAgIHZhciBJTlZFUlQgPSBzY29wZS5kZWYoJyEhJywgdmFsdWUsICcuaW52ZXJ0JylcbiAgICAgICAgICAgICAgcmV0dXJuIFtWQUxVRSwgSU5WRVJUXVxuICAgICAgICAgICAgfSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgcmV0dXJuIFNUQVRFXG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZVVuaWZvcm1zICh1bmlmb3JtcywgZW52KSB7XG4gICAgdmFyIHN0YXRpY1VuaWZvcm1zID0gdW5pZm9ybXMuc3RhdGljXG4gICAgdmFyIGR5bmFtaWNVbmlmb3JtcyA9IHVuaWZvcm1zLmR5bmFtaWNcblxuICAgIHZhciBVTklGT1JNUyA9IHt9XG5cbiAgICBPYmplY3Qua2V5cyhzdGF0aWNVbmlmb3JtcykuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgdmFyIHZhbHVlID0gc3RhdGljVW5pZm9ybXNbbmFtZV1cbiAgICAgIHZhciByZXN1bHRcbiAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInIHx8XG4gICAgICAgICAgdHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgcmVzdWx0ID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcmV0dXJuIHZhbHVlXG4gICAgICAgIH0pXG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICB2YXIgcmVnbFR5cGUgPSB2YWx1ZS5fcmVnbFR5cGVcbiAgICAgICAgaWYgKHJlZ2xUeXBlID09PSAndGV4dHVyZTJkJyB8fFxuICAgICAgICAgICAgcmVnbFR5cGUgPT09ICd0ZXh0dXJlQ3ViZScpIHtcbiAgICAgICAgICByZXN1bHQgPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYpIHtcbiAgICAgICAgICAgIHJldHVybiBlbnYubGluayh2YWx1ZSlcbiAgICAgICAgICB9KVxuICAgICAgICB9IGVsc2UgaWYgKHJlZ2xUeXBlID09PSAnZnJhbWVidWZmZXInIHx8XG4gICAgICAgICAgICAgICAgICAgcmVnbFR5cGUgPT09ICdmcmFtZWJ1ZmZlckN1YmUnKSB7XG4gICAgICAgICAgY2hlY2suY29tbWFuZCh2YWx1ZS5jb2xvci5sZW5ndGggPiAwLFxuICAgICAgICAgICAgJ21pc3NpbmcgY29sb3IgYXR0YWNobWVudCBmb3IgZnJhbWVidWZmZXIgc2VudCB0byB1bmlmb3JtIFwiJyArIG5hbWUgKyAnXCInLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICByZXN1bHQgPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYpIHtcbiAgICAgICAgICAgIHJldHVybiBlbnYubGluayh2YWx1ZS5jb2xvclswXSlcbiAgICAgICAgICB9KVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNoZWNrLmNvbW1hbmRSYWlzZSgnaW52YWxpZCBkYXRhIGZvciB1bmlmb3JtIFwiJyArIG5hbWUgKyAnXCInLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChpc0FycmF5TGlrZSh2YWx1ZSkpIHtcbiAgICAgICAgcmVzdWx0ID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52KSB7XG4gICAgICAgICAgdmFyIElURU0gPSBlbnYuZ2xvYmFsLmRlZignWycsXG4gICAgICAgICAgICBsb29wKHZhbHVlLmxlbmd0aCwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICAgICAgY2hlY2suY29tbWFuZChcbiAgICAgICAgICAgICAgICB0eXBlb2YgdmFsdWVbaV0gPT09ICdudW1iZXInIHx8XG4gICAgICAgICAgICAgICAgdHlwZW9mIHZhbHVlW2ldID09PSAnYm9vbGVhbicsXG4gICAgICAgICAgICAgICAgJ2ludmFsaWQgdW5pZm9ybSAnICsgbmFtZSwgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZVtpXVxuICAgICAgICAgICAgfSksICddJylcbiAgICAgICAgICByZXR1cm4gSVRFTVxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY2hlY2suY29tbWFuZFJhaXNlKCdpbnZhbGlkIG9yIG1pc3NpbmcgZGF0YSBmb3IgdW5pZm9ybSBcIicgKyBuYW1lICsgJ1wiJywgZW52LmNvbW1hbmRTdHIpXG4gICAgICB9XG4gICAgICByZXN1bHQudmFsdWUgPSB2YWx1ZVxuICAgICAgVU5JRk9STVNbbmFtZV0gPSByZXN1bHRcbiAgICB9KVxuXG4gICAgT2JqZWN0LmtleXMoZHluYW1pY1VuaWZvcm1zKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgIHZhciBkeW4gPSBkeW5hbWljVW5pZm9ybXNba2V5XVxuICAgICAgVU5JRk9STVNba2V5XSA9IGNyZWF0ZUR5bmFtaWNEZWNsKGR5biwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgcmV0dXJuIGVudi5pbnZva2Uoc2NvcGUsIGR5bilcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIHJldHVybiBVTklGT1JNU1xuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VBdHRyaWJ1dGVzIChhdHRyaWJ1dGVzLCBlbnYpIHtcbiAgICB2YXIgc3RhdGljQXR0cmlidXRlcyA9IGF0dHJpYnV0ZXMuc3RhdGljXG4gICAgdmFyIGR5bmFtaWNBdHRyaWJ1dGVzID0gYXR0cmlidXRlcy5keW5hbWljXG5cbiAgICB2YXIgYXR0cmlidXRlRGVmcyA9IHt9XG5cbiAgICBPYmplY3Qua2V5cyhzdGF0aWNBdHRyaWJ1dGVzKS5mb3JFYWNoKGZ1bmN0aW9uIChhdHRyaWJ1dGUpIHtcbiAgICAgIHZhciB2YWx1ZSA9IHN0YXRpY0F0dHJpYnV0ZXNbYXR0cmlidXRlXVxuICAgICAgdmFyIGlkID0gc3RyaW5nU3RvcmUuaWQoYXR0cmlidXRlKVxuXG4gICAgICB2YXIgcmVjb3JkID0gbmV3IEF0dHJpYnV0ZVJlY29yZCgpXG4gICAgICBpZiAoaXNCdWZmZXJBcmdzKHZhbHVlKSkge1xuICAgICAgICByZWNvcmQuc3RhdGUgPSBBVFRSSUJfU1RBVEVfUE9JTlRFUlxuICAgICAgICByZWNvcmQuYnVmZmVyID0gYnVmZmVyU3RhdGUuZ2V0QnVmZmVyKFxuICAgICAgICAgIGJ1ZmZlclN0YXRlLmNyZWF0ZSh2YWx1ZSwgR0xfQVJSQVlfQlVGRkVSLCBmYWxzZSwgdHJ1ZSkpXG4gICAgICAgIHJlY29yZC50eXBlID0gMFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIGJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmdldEJ1ZmZlcih2YWx1ZSlcbiAgICAgICAgaWYgKGJ1ZmZlcikge1xuICAgICAgICAgIHJlY29yZC5zdGF0ZSA9IEFUVFJJQl9TVEFURV9QT0lOVEVSXG4gICAgICAgICAgcmVjb3JkLmJ1ZmZlciA9IGJ1ZmZlclxuICAgICAgICAgIHJlY29yZC50eXBlID0gMFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNoZWNrLmNvbW1hbmQodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSxcbiAgICAgICAgICAgICdpbnZhbGlkIGRhdGEgZm9yIGF0dHJpYnV0ZSAnICsgYXR0cmlidXRlLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICBpZiAodmFsdWUuY29uc3RhbnQpIHtcbiAgICAgICAgICAgIHZhciBjb25zdGFudCA9IHZhbHVlLmNvbnN0YW50XG4gICAgICAgICAgICByZWNvcmQuYnVmZmVyID0gJ251bGwnXG4gICAgICAgICAgICByZWNvcmQuc3RhdGUgPSBBVFRSSUJfU1RBVEVfQ09OU1RBTlRcbiAgICAgICAgICAgIGlmICh0eXBlb2YgY29uc3RhbnQgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICAgIHJlY29yZC54ID0gY29uc3RhbnRcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmQoXG4gICAgICAgICAgICAgICAgaXNBcnJheUxpa2UoY29uc3RhbnQpICYmXG4gICAgICAgICAgICAgICAgY29uc3RhbnQubGVuZ3RoID4gMCAmJlxuICAgICAgICAgICAgICAgIGNvbnN0YW50Lmxlbmd0aCA8PSA0LFxuICAgICAgICAgICAgICAgICdpbnZhbGlkIGNvbnN0YW50IGZvciBhdHRyaWJ1dGUgJyArIGF0dHJpYnV0ZSwgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgIENVVEVfQ09NUE9ORU5UUy5mb3JFYWNoKGZ1bmN0aW9uIChjLCBpKSB7XG4gICAgICAgICAgICAgICAgaWYgKGkgPCBjb25zdGFudC5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgIHJlY29yZFtjXSA9IGNvbnN0YW50W2ldXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAoaXNCdWZmZXJBcmdzKHZhbHVlLmJ1ZmZlcikpIHtcbiAgICAgICAgICAgICAgYnVmZmVyID0gYnVmZmVyU3RhdGUuZ2V0QnVmZmVyKFxuICAgICAgICAgICAgICAgIGJ1ZmZlclN0YXRlLmNyZWF0ZSh2YWx1ZS5idWZmZXIsIEdMX0FSUkFZX0JVRkZFUiwgZmFsc2UsIHRydWUpKVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgYnVmZmVyID0gYnVmZmVyU3RhdGUuZ2V0QnVmZmVyKHZhbHVlLmJ1ZmZlcilcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNoZWNrLmNvbW1hbmQoISFidWZmZXIsICdtaXNzaW5nIGJ1ZmZlciBmb3IgYXR0cmlidXRlIFwiJyArIGF0dHJpYnV0ZSArICdcIicsIGVudi5jb21tYW5kU3RyKVxuXG4gICAgICAgICAgICB2YXIgb2Zmc2V0ID0gdmFsdWUub2Zmc2V0IHwgMFxuICAgICAgICAgICAgY2hlY2suY29tbWFuZChvZmZzZXQgPj0gMCxcbiAgICAgICAgICAgICAgJ2ludmFsaWQgb2Zmc2V0IGZvciBhdHRyaWJ1dGUgXCInICsgYXR0cmlidXRlICsgJ1wiJywgZW52LmNvbW1hbmRTdHIpXG5cbiAgICAgICAgICAgIHZhciBzdHJpZGUgPSB2YWx1ZS5zdHJpZGUgfCAwXG4gICAgICAgICAgICBjaGVjay5jb21tYW5kKHN0cmlkZSA+PSAwICYmIHN0cmlkZSA8IDI1NixcbiAgICAgICAgICAgICAgJ2ludmFsaWQgc3RyaWRlIGZvciBhdHRyaWJ1dGUgXCInICsgYXR0cmlidXRlICsgJ1wiLCBtdXN0IGJlIGludGVnZXIgYmV0d2VlZW4gWzAsIDI1NV0nLCBlbnYuY29tbWFuZFN0cilcblxuICAgICAgICAgICAgdmFyIHNpemUgPSB2YWx1ZS5zaXplIHwgMFxuICAgICAgICAgICAgY2hlY2suY29tbWFuZCghKCdzaXplJyBpbiB2YWx1ZSkgfHwgKHNpemUgPiAwICYmIHNpemUgPD0gNCksXG4gICAgICAgICAgICAgICdpbnZhbGlkIHNpemUgZm9yIGF0dHJpYnV0ZSBcIicgKyBhdHRyaWJ1dGUgKyAnXCIsIG11c3QgYmUgMSwyLDMsNCcsIGVudi5jb21tYW5kU3RyKVxuXG4gICAgICAgICAgICB2YXIgbm9ybWFsaXplZCA9ICEhdmFsdWUubm9ybWFsaXplZFxuXG4gICAgICAgICAgICB2YXIgdHlwZSA9IDBcbiAgICAgICAgICAgIGlmICgndHlwZScgaW4gdmFsdWUpIHtcbiAgICAgICAgICAgICAgY2hlY2suY29tbWFuZFBhcmFtZXRlcihcbiAgICAgICAgICAgICAgICB2YWx1ZS50eXBlLCBnbFR5cGVzLFxuICAgICAgICAgICAgICAgICdpbnZhbGlkIHR5cGUgZm9yIGF0dHJpYnV0ZSAnICsgYXR0cmlidXRlLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgdHlwZSA9IGdsVHlwZXNbdmFsdWUudHlwZV1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIGRpdmlzb3IgPSB2YWx1ZS5kaXZpc29yIHwgMFxuICAgICAgICAgICAgaWYgKCdkaXZpc29yJyBpbiB2YWx1ZSkge1xuICAgICAgICAgICAgICBjaGVjay5jb21tYW5kKGRpdmlzb3IgPT09IDAgfHwgZXh0SW5zdGFuY2luZyxcbiAgICAgICAgICAgICAgICAnY2Fubm90IHNwZWNpZnkgZGl2aXNvciBmb3IgYXR0cmlidXRlIFwiJyArIGF0dHJpYnV0ZSArICdcIiwgaW5zdGFuY2luZyBub3Qgc3VwcG9ydGVkJywgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmQoZGl2aXNvciA+PSAwLFxuICAgICAgICAgICAgICAgICdpbnZhbGlkIGRpdmlzb3IgZm9yIGF0dHJpYnV0ZSBcIicgKyBhdHRyaWJ1dGUgKyAnXCInLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICB2YXIgY29tbWFuZCA9IGVudi5jb21tYW5kU3RyXG5cbiAgICAgICAgICAgICAgdmFyIFZBTElEX0tFWVMgPSBbXG4gICAgICAgICAgICAgICAgJ2J1ZmZlcicsXG4gICAgICAgICAgICAgICAgJ29mZnNldCcsXG4gICAgICAgICAgICAgICAgJ2Rpdmlzb3InLFxuICAgICAgICAgICAgICAgICdub3JtYWxpemVkJyxcbiAgICAgICAgICAgICAgICAndHlwZScsXG4gICAgICAgICAgICAgICAgJ3NpemUnLFxuICAgICAgICAgICAgICAgICdzdHJpZGUnXG4gICAgICAgICAgICAgIF1cblxuICAgICAgICAgICAgICBPYmplY3Qua2V5cyh2YWx1ZSkuZm9yRWFjaChmdW5jdGlvbiAocHJvcCkge1xuICAgICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmQoXG4gICAgICAgICAgICAgICAgICBWQUxJRF9LRVlTLmluZGV4T2YocHJvcCkgPj0gMCxcbiAgICAgICAgICAgICAgICAgICd1bmtub3duIHBhcmFtZXRlciBcIicgKyBwcm9wICsgJ1wiIGZvciBhdHRyaWJ1dGUgcG9pbnRlciBcIicgKyBhdHRyaWJ1dGUgKyAnXCIgKHZhbGlkIHBhcmFtZXRlcnMgYXJlICcgKyBWQUxJRF9LRVlTICsgJyknLFxuICAgICAgICAgICAgICAgICAgY29tbWFuZClcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgICAgIHJlY29yZC5idWZmZXIgPSBidWZmZXJcbiAgICAgICAgICAgIHJlY29yZC5zdGF0ZSA9IEFUVFJJQl9TVEFURV9QT0lOVEVSXG4gICAgICAgICAgICByZWNvcmQuc2l6ZSA9IHNpemVcbiAgICAgICAgICAgIHJlY29yZC5ub3JtYWxpemVkID0gbm9ybWFsaXplZFxuICAgICAgICAgICAgcmVjb3JkLnR5cGUgPSB0eXBlIHx8IGJ1ZmZlci5kdHlwZVxuICAgICAgICAgICAgcmVjb3JkLm9mZnNldCA9IG9mZnNldFxuICAgICAgICAgICAgcmVjb3JkLnN0cmlkZSA9IHN0cmlkZVxuICAgICAgICAgICAgcmVjb3JkLmRpdmlzb3IgPSBkaXZpc29yXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGF0dHJpYnV0ZURlZnNbYXR0cmlidXRlXSA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgdmFyIGNhY2hlID0gZW52LmF0dHJpYkNhY2hlXG4gICAgICAgIGlmIChpZCBpbiBjYWNoZSkge1xuICAgICAgICAgIHJldHVybiBjYWNoZVtpZF1cbiAgICAgICAgfVxuICAgICAgICB2YXIgcmVzdWx0ID0ge1xuICAgICAgICAgIGlzU3RyZWFtOiBmYWxzZVxuICAgICAgICB9XG4gICAgICAgIE9iamVjdC5rZXlzKHJlY29yZCkuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgICAgcmVzdWx0W2tleV0gPSByZWNvcmRba2V5XVxuICAgICAgICB9KVxuICAgICAgICBpZiAocmVjb3JkLmJ1ZmZlcikge1xuICAgICAgICAgIHJlc3VsdC5idWZmZXIgPSBlbnYubGluayhyZWNvcmQuYnVmZmVyKVxuICAgICAgICAgIHJlc3VsdC50eXBlID0gcmVzdWx0LnR5cGUgfHwgKHJlc3VsdC5idWZmZXIgKyAnLmR0eXBlJylcbiAgICAgICAgfVxuICAgICAgICBjYWNoZVtpZF0gPSByZXN1bHRcbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgT2JqZWN0LmtleXMoZHluYW1pY0F0dHJpYnV0ZXMpLmZvckVhY2goZnVuY3Rpb24gKGF0dHJpYnV0ZSkge1xuICAgICAgdmFyIGR5biA9IGR5bmFtaWNBdHRyaWJ1dGVzW2F0dHJpYnV0ZV1cblxuICAgICAgZnVuY3Rpb24gYXBwZW5kQXR0cmlidXRlQ29kZSAoZW52LCBibG9jaykge1xuICAgICAgICB2YXIgVkFMVUUgPSBlbnYuaW52b2tlKGJsb2NrLCBkeW4pXG5cbiAgICAgICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcblxuICAgICAgICB2YXIgSVNfQlVGRkVSX0FSR1MgPSBzaGFyZWQuaXNCdWZmZXJBcmdzXG4gICAgICAgIHZhciBCVUZGRVJfU1RBVEUgPSBzaGFyZWQuYnVmZmVyXG5cbiAgICAgICAgLy8gUGVyZm9ybSB2YWxpZGF0aW9uIG9uIGF0dHJpYnV0ZVxuICAgICAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZW52LmFzc2VydChibG9jayxcbiAgICAgICAgICAgIFZBTFVFICsgJyYmKHR5cGVvZiAnICsgVkFMVUUgKyAnPT09XCJvYmplY3RcInx8dHlwZW9mICcgK1xuICAgICAgICAgICAgVkFMVUUgKyAnPT09XCJmdW5jdGlvblwiKSYmKCcgK1xuICAgICAgICAgICAgSVNfQlVGRkVSX0FSR1MgKyAnKCcgKyBWQUxVRSArICcpfHwnICtcbiAgICAgICAgICAgIEJVRkZFUl9TVEFURSArICcuZ2V0QnVmZmVyKCcgKyBWQUxVRSArICcpfHwnICtcbiAgICAgICAgICAgIEJVRkZFUl9TVEFURSArICcuZ2V0QnVmZmVyKCcgKyBWQUxVRSArICcuYnVmZmVyKXx8JyArXG4gICAgICAgICAgICBJU19CVUZGRVJfQVJHUyArICcoJyArIFZBTFVFICsgJy5idWZmZXIpfHwnICtcbiAgICAgICAgICAgICcoXCJjb25zdGFudFwiIGluICcgKyBWQUxVRSArXG4gICAgICAgICAgICAnJiYodHlwZW9mICcgKyBWQUxVRSArICcuY29uc3RhbnQ9PT1cIm51bWJlclwifHwnICtcbiAgICAgICAgICAgIHNoYXJlZC5pc0FycmF5TGlrZSArICcoJyArIFZBTFVFICsgJy5jb25zdGFudCkpKSknLFxuICAgICAgICAgICAgJ2ludmFsaWQgZHluYW1pYyBhdHRyaWJ1dGUgXCInICsgYXR0cmlidXRlICsgJ1wiJylcbiAgICAgICAgfSlcblxuICAgICAgICAvLyBhbGxvY2F0ZSBuYW1lcyBmb3IgcmVzdWx0XG4gICAgICAgIHZhciByZXN1bHQgPSB7XG4gICAgICAgICAgaXNTdHJlYW06IGJsb2NrLmRlZihmYWxzZSlcbiAgICAgICAgfVxuICAgICAgICB2YXIgZGVmYXVsdFJlY29yZCA9IG5ldyBBdHRyaWJ1dGVSZWNvcmQoKVxuICAgICAgICBkZWZhdWx0UmVjb3JkLnN0YXRlID0gQVRUUklCX1NUQVRFX1BPSU5URVJcbiAgICAgICAgT2JqZWN0LmtleXMoZGVmYXVsdFJlY29yZCkuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgICAgcmVzdWx0W2tleV0gPSBibG9jay5kZWYoJycgKyBkZWZhdWx0UmVjb3JkW2tleV0pXG4gICAgICAgIH0pXG5cbiAgICAgICAgdmFyIEJVRkZFUiA9IHJlc3VsdC5idWZmZXJcbiAgICAgICAgdmFyIFRZUEUgPSByZXN1bHQudHlwZVxuICAgICAgICBibG9jayhcbiAgICAgICAgICAnaWYoJywgSVNfQlVGRkVSX0FSR1MsICcoJywgVkFMVUUsICcpKXsnLFxuICAgICAgICAgIHJlc3VsdC5pc1N0cmVhbSwgJz10cnVlOycsXG4gICAgICAgICAgQlVGRkVSLCAnPScsIEJVRkZFUl9TVEFURSwgJy5jcmVhdGVTdHJlYW0oJywgR0xfQVJSQVlfQlVGRkVSLCAnLCcsIFZBTFVFLCAnKTsnLFxuICAgICAgICAgIFRZUEUsICc9JywgQlVGRkVSLCAnLmR0eXBlOycsXG4gICAgICAgICAgJ31lbHNleycsXG4gICAgICAgICAgQlVGRkVSLCAnPScsIEJVRkZFUl9TVEFURSwgJy5nZXRCdWZmZXIoJywgVkFMVUUsICcpOycsXG4gICAgICAgICAgJ2lmKCcsIEJVRkZFUiwgJyl7JyxcbiAgICAgICAgICBUWVBFLCAnPScsIEJVRkZFUiwgJy5kdHlwZTsnLFxuICAgICAgICAgICd9ZWxzZSBpZihcImNvbnN0YW50XCIgaW4gJywgVkFMVUUsICcpeycsXG4gICAgICAgICAgcmVzdWx0LnN0YXRlLCAnPScsIEFUVFJJQl9TVEFURV9DT05TVEFOVCwgJzsnLFxuICAgICAgICAgICdpZih0eXBlb2YgJyArIFZBTFVFICsgJy5jb25zdGFudCA9PT0gXCJudW1iZXJcIil7JyxcbiAgICAgICAgICByZXN1bHRbQ1VURV9DT01QT05FTlRTWzBdXSwgJz0nLCBWQUxVRSwgJy5jb25zdGFudDsnLFxuICAgICAgICAgIENVVEVfQ09NUE9ORU5UUy5zbGljZSgxKS5tYXAoZnVuY3Rpb24gKG4pIHtcbiAgICAgICAgICAgIHJldHVybiByZXN1bHRbbl1cbiAgICAgICAgICB9KS5qb2luKCc9JyksICc9MDsnLFxuICAgICAgICAgICd9ZWxzZXsnLFxuICAgICAgICAgIENVVEVfQ09NUE9ORU5UUy5tYXAoZnVuY3Rpb24gKG5hbWUsIGkpIHtcbiAgICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICAgIHJlc3VsdFtuYW1lXSArICc9JyArIFZBTFVFICsgJy5jb25zdGFudC5sZW5ndGg+PScgKyBpICtcbiAgICAgICAgICAgICAgJz8nICsgVkFMVUUgKyAnLmNvbnN0YW50WycgKyBpICsgJ106MDsnXG4gICAgICAgICAgICApXG4gICAgICAgICAgfSkuam9pbignJyksXG4gICAgICAgICAgJ319ZWxzZXsnLFxuICAgICAgICAgICdpZignLCBJU19CVUZGRVJfQVJHUywgJygnLCBWQUxVRSwgJy5idWZmZXIpKXsnLFxuICAgICAgICAgIEJVRkZFUiwgJz0nLCBCVUZGRVJfU1RBVEUsICcuY3JlYXRlU3RyZWFtKCcsIEdMX0FSUkFZX0JVRkZFUiwgJywnLCBWQUxVRSwgJy5idWZmZXIpOycsXG4gICAgICAgICAgJ31lbHNleycsXG4gICAgICAgICAgQlVGRkVSLCAnPScsIEJVRkZFUl9TVEFURSwgJy5nZXRCdWZmZXIoJywgVkFMVUUsICcuYnVmZmVyKTsnLFxuICAgICAgICAgICd9JyxcbiAgICAgICAgICBUWVBFLCAnPVwidHlwZVwiIGluICcsIFZBTFVFLCAnPycsXG4gICAgICAgICAgc2hhcmVkLmdsVHlwZXMsICdbJywgVkFMVUUsICcudHlwZV06JywgQlVGRkVSLCAnLmR0eXBlOycsXG4gICAgICAgICAgcmVzdWx0Lm5vcm1hbGl6ZWQsICc9ISEnLCBWQUxVRSwgJy5ub3JtYWxpemVkOycpXG4gICAgICAgIGZ1bmN0aW9uIGVtaXRSZWFkUmVjb3JkIChuYW1lKSB7XG4gICAgICAgICAgYmxvY2socmVzdWx0W25hbWVdLCAnPScsIFZBTFVFLCAnLicsIG5hbWUsICd8MDsnKVxuICAgICAgICB9XG4gICAgICAgIGVtaXRSZWFkUmVjb3JkKCdzaXplJylcbiAgICAgICAgZW1pdFJlYWRSZWNvcmQoJ29mZnNldCcpXG4gICAgICAgIGVtaXRSZWFkUmVjb3JkKCdzdHJpZGUnKVxuICAgICAgICBlbWl0UmVhZFJlY29yZCgnZGl2aXNvcicpXG5cbiAgICAgICAgYmxvY2soJ319JylcblxuICAgICAgICBibG9jay5leGl0KFxuICAgICAgICAgICdpZignLCByZXN1bHQuaXNTdHJlYW0sICcpeycsXG4gICAgICAgICAgQlVGRkVSX1NUQVRFLCAnLmRlc3Ryb3lTdHJlYW0oJywgQlVGRkVSLCAnKTsnLFxuICAgICAgICAgICd9JylcblxuICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICB9XG5cbiAgICAgIGF0dHJpYnV0ZURlZnNbYXR0cmlidXRlXSA9IGNyZWF0ZUR5bmFtaWNEZWNsKGR5biwgYXBwZW5kQXR0cmlidXRlQ29kZSlcbiAgICB9KVxuXG4gICAgcmV0dXJuIGF0dHJpYnV0ZURlZnNcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlQ29udGV4dCAoY29udGV4dCkge1xuICAgIHZhciBzdGF0aWNDb250ZXh0ID0gY29udGV4dC5zdGF0aWNcbiAgICB2YXIgZHluYW1pY0NvbnRleHQgPSBjb250ZXh0LmR5bmFtaWNcbiAgICB2YXIgcmVzdWx0ID0ge31cblxuICAgIE9iamVjdC5rZXlzKHN0YXRpY0NvbnRleHQpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHZhciB2YWx1ZSA9IHN0YXRpY0NvbnRleHRbbmFtZV1cbiAgICAgIHJlc3VsdFtuYW1lXSA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgfHwgdHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICByZXR1cm4gJycgKyB2YWx1ZVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBlbnYubGluayh2YWx1ZSlcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgT2JqZWN0LmtleXMoZHluYW1pY0NvbnRleHQpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHZhciBkeW4gPSBkeW5hbWljQ29udGV4dFtuYW1lXVxuICAgICAgcmVzdWx0W25hbWVdID0gY3JlYXRlRHluYW1pY0RlY2woZHluLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICByZXR1cm4gZW52Lmludm9rZShzY29wZSwgZHluKVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VBcmd1bWVudHMgKG9wdGlvbnMsIGF0dHJpYnV0ZXMsIHVuaWZvcm1zLCBjb250ZXh0LCBlbnYpIHtcbiAgICB2YXIgc3RhdGljT3B0aW9ucyA9IG9wdGlvbnMuc3RhdGljXG4gICAgdmFyIGR5bmFtaWNPcHRpb25zID0gb3B0aW9ucy5keW5hbWljXG5cbiAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgS0VZX05BTUVTID0gW1xuICAgICAgICBTX0ZSQU1FQlVGRkVSLFxuICAgICAgICBTX1ZFUlQsXG4gICAgICAgIFNfRlJBRyxcbiAgICAgICAgU19FTEVNRU5UUyxcbiAgICAgICAgU19QUklNSVRJVkUsXG4gICAgICAgIFNfT0ZGU0VULFxuICAgICAgICBTX0NPVU5ULFxuICAgICAgICBTX0lOU1RBTkNFUyxcbiAgICAgICAgU19QUk9GSUxFXG4gICAgICBdLmNvbmNhdChHTF9TVEFURV9OQU1FUylcblxuICAgICAgZnVuY3Rpb24gY2hlY2tLZXlzIChkaWN0KSB7XG4gICAgICAgIE9iamVjdC5rZXlzKGRpY3QpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgICAgIGNoZWNrLmNvbW1hbmQoXG4gICAgICAgICAgICBLRVlfTkFNRVMuaW5kZXhPZihrZXkpID49IDAsXG4gICAgICAgICAgICAndW5rbm93biBwYXJhbWV0ZXIgXCInICsga2V5ICsgJ1wiJyxcbiAgICAgICAgICAgIGVudi5jb21tYW5kU3RyKVxuICAgICAgICB9KVxuICAgICAgfVxuXG4gICAgICBjaGVja0tleXMoc3RhdGljT3B0aW9ucylcbiAgICAgIGNoZWNrS2V5cyhkeW5hbWljT3B0aW9ucylcbiAgICB9KVxuXG4gICAgdmFyIGZyYW1lYnVmZmVyID0gcGFyc2VGcmFtZWJ1ZmZlcihvcHRpb25zLCBlbnYpXG4gICAgdmFyIHZpZXdwb3J0QW5kU2Npc3NvciA9IHBhcnNlVmlld3BvcnRTY2lzc29yKG9wdGlvbnMsIGZyYW1lYnVmZmVyLCBlbnYpXG4gICAgdmFyIGRyYXcgPSBwYXJzZURyYXcob3B0aW9ucywgZW52KVxuICAgIHZhciBzdGF0ZSA9IHBhcnNlR0xTdGF0ZShvcHRpb25zLCBlbnYpXG4gICAgdmFyIHNoYWRlciA9IHBhcnNlUHJvZ3JhbShvcHRpb25zLCBlbnYpXG5cbiAgICBmdW5jdGlvbiBjb3B5Qm94IChuYW1lKSB7XG4gICAgICB2YXIgZGVmbiA9IHZpZXdwb3J0QW5kU2Npc3NvcltuYW1lXVxuICAgICAgaWYgKGRlZm4pIHtcbiAgICAgICAgc3RhdGVbbmFtZV0gPSBkZWZuXG4gICAgICB9XG4gICAgfVxuICAgIGNvcHlCb3goU19WSUVXUE9SVClcbiAgICBjb3B5Qm94KHByb3BOYW1lKFNfU0NJU1NPUl9CT1gpKVxuXG4gICAgdmFyIGRpcnR5ID0gT2JqZWN0LmtleXMoc3RhdGUpLmxlbmd0aCA+IDBcblxuICAgIHZhciByZXN1bHQgPSB7XG4gICAgICBmcmFtZWJ1ZmZlcjogZnJhbWVidWZmZXIsXG4gICAgICBkcmF3OiBkcmF3LFxuICAgICAgc2hhZGVyOiBzaGFkZXIsXG4gICAgICBzdGF0ZTogc3RhdGUsXG4gICAgICBkaXJ0eTogZGlydHlcbiAgICB9XG5cbiAgICByZXN1bHQucHJvZmlsZSA9IHBhcnNlUHJvZmlsZShvcHRpb25zLCBlbnYpXG4gICAgcmVzdWx0LnVuaWZvcm1zID0gcGFyc2VVbmlmb3Jtcyh1bmlmb3JtcywgZW52KVxuICAgIHJlc3VsdC5hdHRyaWJ1dGVzID0gcGFyc2VBdHRyaWJ1dGVzKGF0dHJpYnV0ZXMsIGVudilcbiAgICByZXN1bHQuY29udGV4dCA9IHBhcnNlQ29udGV4dChjb250ZXh0LCBlbnYpXG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBDT01NT04gVVBEQVRFIEZVTkNUSU9OU1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIGVtaXRDb250ZXh0IChlbnYsIHNjb3BlLCBjb250ZXh0KSB7XG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcbiAgICB2YXIgQ09OVEVYVCA9IHNoYXJlZC5jb250ZXh0XG5cbiAgICB2YXIgY29udGV4dEVudGVyID0gZW52LnNjb3BlKClcblxuICAgIE9iamVjdC5rZXlzKGNvbnRleHQpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHNjb3BlLnNhdmUoQ09OVEVYVCwgJy4nICsgbmFtZSlcbiAgICAgIHZhciBkZWZuID0gY29udGV4dFtuYW1lXVxuICAgICAgY29udGV4dEVudGVyKENPTlRFWFQsICcuJywgbmFtZSwgJz0nLCBkZWZuLmFwcGVuZChlbnYsIHNjb3BlKSwgJzsnKVxuICAgIH0pXG5cbiAgICBzY29wZShjb250ZXh0RW50ZXIpXG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIENPTU1PTiBEUkFXSU5HIEZVTkNUSU9OU1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIGVtaXRQb2xsRnJhbWVidWZmZXIgKGVudiwgc2NvcGUsIGZyYW1lYnVmZmVyLCBza2lwQ2hlY2spIHtcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuXG4gICAgdmFyIEdMID0gc2hhcmVkLmdsXG4gICAgdmFyIEZSQU1FQlVGRkVSX1NUQVRFID0gc2hhcmVkLmZyYW1lYnVmZmVyXG4gICAgdmFyIEVYVF9EUkFXX0JVRkZFUlNcbiAgICBpZiAoZXh0RHJhd0J1ZmZlcnMpIHtcbiAgICAgIEVYVF9EUkFXX0JVRkZFUlMgPSBzY29wZS5kZWYoc2hhcmVkLmV4dGVuc2lvbnMsICcud2ViZ2xfZHJhd19idWZmZXJzJylcbiAgICB9XG5cbiAgICB2YXIgY29uc3RhbnRzID0gZW52LmNvbnN0YW50c1xuXG4gICAgdmFyIERSQVdfQlVGRkVSUyA9IGNvbnN0YW50cy5kcmF3QnVmZmVyXG4gICAgdmFyIEJBQ0tfQlVGRkVSID0gY29uc3RhbnRzLmJhY2tCdWZmZXJcblxuICAgIHZhciBORVhUXG4gICAgaWYgKGZyYW1lYnVmZmVyKSB7XG4gICAgICBORVhUID0gZnJhbWVidWZmZXIuYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgfSBlbHNlIHtcbiAgICAgIE5FWFQgPSBzY29wZS5kZWYoRlJBTUVCVUZGRVJfU1RBVEUsICcubmV4dCcpXG4gICAgfVxuXG4gICAgaWYgKCFza2lwQ2hlY2spIHtcbiAgICAgIHNjb3BlKCdpZignLCBORVhULCAnIT09JywgRlJBTUVCVUZGRVJfU1RBVEUsICcuY3VyKXsnKVxuICAgIH1cbiAgICBzY29wZShcbiAgICAgICdpZignLCBORVhULCAnKXsnLFxuICAgICAgR0wsICcuYmluZEZyYW1lYnVmZmVyKCcsIEdMX0ZSQU1FQlVGRkVSLCAnLCcsIE5FWFQsICcuZnJhbWVidWZmZXIpOycpXG4gICAgaWYgKGV4dERyYXdCdWZmZXJzKSB7XG4gICAgICBzY29wZShFWFRfRFJBV19CVUZGRVJTLCAnLmRyYXdCdWZmZXJzV0VCR0woJyxcbiAgICAgICAgRFJBV19CVUZGRVJTLCAnWycsIE5FWFQsICcuY29sb3JBdHRhY2htZW50cy5sZW5ndGhdKTsnKVxuICAgIH1cbiAgICBzY29wZSgnfWVsc2V7JyxcbiAgICAgIEdMLCAnLmJpbmRGcmFtZWJ1ZmZlcignLCBHTF9GUkFNRUJVRkZFUiwgJyxudWxsKTsnKVxuICAgIGlmIChleHREcmF3QnVmZmVycykge1xuICAgICAgc2NvcGUoRVhUX0RSQVdfQlVGRkVSUywgJy5kcmF3QnVmZmVyc1dFQkdMKCcsIEJBQ0tfQlVGRkVSLCAnKTsnKVxuICAgIH1cbiAgICBzY29wZShcbiAgICAgICd9JyxcbiAgICAgIEZSQU1FQlVGRkVSX1NUQVRFLCAnLmN1cj0nLCBORVhULCAnOycpXG4gICAgaWYgKCFza2lwQ2hlY2spIHtcbiAgICAgIHNjb3BlKCd9JylcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBlbWl0UG9sbFN0YXRlIChlbnYsIHNjb3BlLCBhcmdzKSB7XG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcblxuICAgIHZhciBHTCA9IHNoYXJlZC5nbFxuXG4gICAgdmFyIENVUlJFTlRfVkFSUyA9IGVudi5jdXJyZW50XG4gICAgdmFyIE5FWFRfVkFSUyA9IGVudi5uZXh0XG4gICAgdmFyIENVUlJFTlRfU1RBVEUgPSBzaGFyZWQuY3VycmVudFxuICAgIHZhciBORVhUX1NUQVRFID0gc2hhcmVkLm5leHRcblxuICAgIHZhciBibG9jayA9IGVudi5jb25kKENVUlJFTlRfU1RBVEUsICcuZGlydHknKVxuXG4gICAgR0xfU1RBVEVfTkFNRVMuZm9yRWFjaChmdW5jdGlvbiAocHJvcCkge1xuICAgICAgdmFyIHBhcmFtID0gcHJvcE5hbWUocHJvcClcbiAgICAgIGlmIChwYXJhbSBpbiBhcmdzLnN0YXRlKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuXG4gICAgICB2YXIgTkVYVCwgQ1VSUkVOVFxuICAgICAgaWYgKHBhcmFtIGluIE5FWFRfVkFSUykge1xuICAgICAgICBORVhUID0gTkVYVF9WQVJTW3BhcmFtXVxuICAgICAgICBDVVJSRU5UID0gQ1VSUkVOVF9WQVJTW3BhcmFtXVxuICAgICAgICB2YXIgcGFydHMgPSBsb29wKGN1cnJlbnRTdGF0ZVtwYXJhbV0ubGVuZ3RoLCBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgIHJldHVybiBibG9jay5kZWYoTkVYVCwgJ1snLCBpLCAnXScpXG4gICAgICAgIH0pXG4gICAgICAgIGJsb2NrKGVudi5jb25kKHBhcnRzLm1hcChmdW5jdGlvbiAocCwgaSkge1xuICAgICAgICAgIHJldHVybiBwICsgJyE9PScgKyBDVVJSRU5UICsgJ1snICsgaSArICddJ1xuICAgICAgICB9KS5qb2luKCd8fCcpKVxuICAgICAgICAgIC50aGVuKFxuICAgICAgICAgICAgR0wsICcuJywgR0xfVkFSSUFCTEVTW3BhcmFtXSwgJygnLCBwYXJ0cywgJyk7JyxcbiAgICAgICAgICAgIHBhcnRzLm1hcChmdW5jdGlvbiAocCwgaSkge1xuICAgICAgICAgICAgICByZXR1cm4gQ1VSUkVOVCArICdbJyArIGkgKyAnXT0nICsgcFxuICAgICAgICAgICAgfSkuam9pbignOycpLCAnOycpKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgTkVYVCA9IGJsb2NrLmRlZihORVhUX1NUQVRFLCAnLicsIHBhcmFtKVxuICAgICAgICB2YXIgaWZ0ZSA9IGVudi5jb25kKE5FWFQsICchPT0nLCBDVVJSRU5UX1NUQVRFLCAnLicsIHBhcmFtKVxuICAgICAgICBibG9jayhpZnRlKVxuICAgICAgICBpZiAocGFyYW0gaW4gR0xfRkxBR1MpIHtcbiAgICAgICAgICBpZnRlKFxuICAgICAgICAgICAgZW52LmNvbmQoTkVYVClcbiAgICAgICAgICAgICAgICAudGhlbihHTCwgJy5lbmFibGUoJywgR0xfRkxBR1NbcGFyYW1dLCAnKTsnKVxuICAgICAgICAgICAgICAgIC5lbHNlKEdMLCAnLmRpc2FibGUoJywgR0xfRkxBR1NbcGFyYW1dLCAnKTsnKSxcbiAgICAgICAgICAgIENVUlJFTlRfU1RBVEUsICcuJywgcGFyYW0sICc9JywgTkVYVCwgJzsnKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmdGUoXG4gICAgICAgICAgICBHTCwgJy4nLCBHTF9WQVJJQUJMRVNbcGFyYW1dLCAnKCcsIE5FWFQsICcpOycsXG4gICAgICAgICAgICBDVVJSRU5UX1NUQVRFLCAnLicsIHBhcmFtLCAnPScsIE5FWFQsICc7JylcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pXG4gICAgaWYgKE9iamVjdC5rZXlzKGFyZ3Muc3RhdGUpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgYmxvY2soQ1VSUkVOVF9TVEFURSwgJy5kaXJ0eT1mYWxzZTsnKVxuICAgIH1cbiAgICBzY29wZShibG9jaylcbiAgfVxuXG4gIGZ1bmN0aW9uIGVtaXRTZXRPcHRpb25zIChlbnYsIHNjb3BlLCBvcHRpb25zLCBmaWx0ZXIpIHtcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuICAgIHZhciBDVVJSRU5UX1ZBUlMgPSBlbnYuY3VycmVudFxuICAgIHZhciBDVVJSRU5UX1NUQVRFID0gc2hhcmVkLmN1cnJlbnRcbiAgICB2YXIgR0wgPSBzaGFyZWQuZ2xcbiAgICBzb3J0U3RhdGUoT2JqZWN0LmtleXMob3B0aW9ucykpLmZvckVhY2goZnVuY3Rpb24gKHBhcmFtKSB7XG4gICAgICB2YXIgZGVmbiA9IG9wdGlvbnNbcGFyYW1dXG4gICAgICBpZiAoZmlsdGVyICYmICFmaWx0ZXIoZGVmbikpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICB2YXIgdmFyaWFibGUgPSBkZWZuLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgaWYgKEdMX0ZMQUdTW3BhcmFtXSkge1xuICAgICAgICB2YXIgZmxhZyA9IEdMX0ZMQUdTW3BhcmFtXVxuICAgICAgICBpZiAoaXNTdGF0aWMoZGVmbikpIHtcbiAgICAgICAgICBpZiAodmFyaWFibGUpIHtcbiAgICAgICAgICAgIHNjb3BlKEdMLCAnLmVuYWJsZSgnLCBmbGFnLCAnKTsnKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzY29wZShHTCwgJy5kaXNhYmxlKCcsIGZsYWcsICcpOycpXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHNjb3BlKGVudi5jb25kKHZhcmlhYmxlKVxuICAgICAgICAgICAgLnRoZW4oR0wsICcuZW5hYmxlKCcsIGZsYWcsICcpOycpXG4gICAgICAgICAgICAuZWxzZShHTCwgJy5kaXNhYmxlKCcsIGZsYWcsICcpOycpKVxuICAgICAgICB9XG4gICAgICAgIHNjb3BlKENVUlJFTlRfU1RBVEUsICcuJywgcGFyYW0sICc9JywgdmFyaWFibGUsICc7JylcbiAgICAgIH0gZWxzZSBpZiAoaXNBcnJheUxpa2UodmFyaWFibGUpKSB7XG4gICAgICAgIHZhciBDVVJSRU5UID0gQ1VSUkVOVF9WQVJTW3BhcmFtXVxuICAgICAgICBzY29wZShcbiAgICAgICAgICBHTCwgJy4nLCBHTF9WQVJJQUJMRVNbcGFyYW1dLCAnKCcsIHZhcmlhYmxlLCAnKTsnLFxuICAgICAgICAgIHZhcmlhYmxlLm1hcChmdW5jdGlvbiAodiwgaSkge1xuICAgICAgICAgICAgcmV0dXJuIENVUlJFTlQgKyAnWycgKyBpICsgJ109JyArIHZcbiAgICAgICAgICB9KS5qb2luKCc7JyksICc7JylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNjb3BlKFxuICAgICAgICAgIEdMLCAnLicsIEdMX1ZBUklBQkxFU1twYXJhbV0sICcoJywgdmFyaWFibGUsICcpOycsXG4gICAgICAgICAgQ1VSUkVOVF9TVEFURSwgJy4nLCBwYXJhbSwgJz0nLCB2YXJpYWJsZSwgJzsnKVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiBpbmplY3RFeHRlbnNpb25zIChlbnYsIHNjb3BlKSB7XG4gICAgaWYgKGV4dEluc3RhbmNpbmcpIHtcbiAgICAgIGVudi5pbnN0YW5jaW5nID0gc2NvcGUuZGVmKFxuICAgICAgICBlbnYuc2hhcmVkLmV4dGVuc2lvbnMsICcuYW5nbGVfaW5zdGFuY2VkX2FycmF5cycpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZW1pdFByb2ZpbGUgKGVudiwgc2NvcGUsIGFyZ3MsIHVzZVNjb3BlLCBpbmNyZW1lbnRDb3VudGVyKSB7XG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcbiAgICB2YXIgU1RBVFMgPSBlbnYuc3RhdHNcbiAgICB2YXIgQ1VSUkVOVF9TVEFURSA9IHNoYXJlZC5jdXJyZW50XG4gICAgdmFyIFRJTUVSID0gc2hhcmVkLnRpbWVyXG4gICAgdmFyIHByb2ZpbGVBcmcgPSBhcmdzLnByb2ZpbGVcblxuICAgIGZ1bmN0aW9uIHBlcmZDb3VudGVyICgpIHtcbiAgICAgIGlmICh0eXBlb2YgcGVyZm9ybWFuY2UgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHJldHVybiAnRGF0ZS5ub3coKSdcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiAncGVyZm9ybWFuY2Uubm93KCknXG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFyIENQVV9TVEFSVCwgUVVFUllfQ09VTlRFUlxuICAgIGZ1bmN0aW9uIGVtaXRQcm9maWxlU3RhcnQgKGJsb2NrKSB7XG4gICAgICBDUFVfU1RBUlQgPSBzY29wZS5kZWYoKVxuICAgICAgYmxvY2soQ1BVX1NUQVJULCAnPScsIHBlcmZDb3VudGVyKCksICc7JylcbiAgICAgIGlmICh0eXBlb2YgaW5jcmVtZW50Q291bnRlciA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgYmxvY2soU1RBVFMsICcuY291bnQrPScsIGluY3JlbWVudENvdW50ZXIsICc7JylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGJsb2NrKFNUQVRTLCAnLmNvdW50Kys7JylcbiAgICAgIH1cbiAgICAgIGlmICh0aW1lcikge1xuICAgICAgICBpZiAodXNlU2NvcGUpIHtcbiAgICAgICAgICBRVUVSWV9DT1VOVEVSID0gc2NvcGUuZGVmKClcbiAgICAgICAgICBibG9jayhRVUVSWV9DT1VOVEVSLCAnPScsIFRJTUVSLCAnLmdldE51bVBlbmRpbmdRdWVyaWVzKCk7JylcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBibG9jayhUSU1FUiwgJy5iZWdpblF1ZXJ5KCcsIFNUQVRTLCAnKTsnKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZW1pdFByb2ZpbGVFbmQgKGJsb2NrKSB7XG4gICAgICBibG9jayhTVEFUUywgJy5jcHVUaW1lKz0nLCBwZXJmQ291bnRlcigpLCAnLScsIENQVV9TVEFSVCwgJzsnKVxuICAgICAgaWYgKHRpbWVyKSB7XG4gICAgICAgIGlmICh1c2VTY29wZSkge1xuICAgICAgICAgIGJsb2NrKFRJTUVSLCAnLnB1c2hTY29wZVN0YXRzKCcsXG4gICAgICAgICAgICBRVUVSWV9DT1VOVEVSLCAnLCcsXG4gICAgICAgICAgICBUSU1FUiwgJy5nZXROdW1QZW5kaW5nUXVlcmllcygpLCcsXG4gICAgICAgICAgICBTVEFUUywgJyk7JylcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBibG9jayhUSU1FUiwgJy5lbmRRdWVyeSgpOycpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzY29wZVByb2ZpbGUgKHZhbHVlKSB7XG4gICAgICB2YXIgcHJldiA9IHNjb3BlLmRlZihDVVJSRU5UX1NUQVRFLCAnLnByb2ZpbGUnKVxuICAgICAgc2NvcGUoQ1VSUkVOVF9TVEFURSwgJy5wcm9maWxlPScsIHZhbHVlLCAnOycpXG4gICAgICBzY29wZS5leGl0KENVUlJFTlRfU1RBVEUsICcucHJvZmlsZT0nLCBwcmV2LCAnOycpXG4gICAgfVxuXG4gICAgdmFyIFVTRV9QUk9GSUxFXG4gICAgaWYgKHByb2ZpbGVBcmcpIHtcbiAgICAgIGlmIChpc1N0YXRpYyhwcm9maWxlQXJnKSkge1xuICAgICAgICBpZiAocHJvZmlsZUFyZy5lbmFibGUpIHtcbiAgICAgICAgICBlbWl0UHJvZmlsZVN0YXJ0KHNjb3BlKVxuICAgICAgICAgIGVtaXRQcm9maWxlRW5kKHNjb3BlLmV4aXQpXG4gICAgICAgICAgc2NvcGVQcm9maWxlKCd0cnVlJylcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzY29wZVByb2ZpbGUoJ2ZhbHNlJylcbiAgICAgICAgfVxuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIFVTRV9QUk9GSUxFID0gcHJvZmlsZUFyZy5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgIHNjb3BlUHJvZmlsZShVU0VfUFJPRklMRSlcbiAgICB9IGVsc2Uge1xuICAgICAgVVNFX1BST0ZJTEUgPSBzY29wZS5kZWYoQ1VSUkVOVF9TVEFURSwgJy5wcm9maWxlJylcbiAgICB9XG5cbiAgICB2YXIgc3RhcnQgPSBlbnYuYmxvY2soKVxuICAgIGVtaXRQcm9maWxlU3RhcnQoc3RhcnQpXG4gICAgc2NvcGUoJ2lmKCcsIFVTRV9QUk9GSUxFLCAnKXsnLCBzdGFydCwgJ30nKVxuICAgIHZhciBlbmQgPSBlbnYuYmxvY2soKVxuICAgIGVtaXRQcm9maWxlRW5kKGVuZClcbiAgICBzY29wZS5leGl0KCdpZignLCBVU0VfUFJPRklMRSwgJyl7JywgZW5kLCAnfScpXG4gIH1cblxuICBmdW5jdGlvbiBlbWl0QXR0cmlidXRlcyAoZW52LCBzY29wZSwgYXJncywgYXR0cmlidXRlcywgZmlsdGVyKSB7XG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcblxuICAgIGZ1bmN0aW9uIHR5cGVMZW5ndGggKHgpIHtcbiAgICAgIHN3aXRjaCAoeCkge1xuICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzI6XG4gICAgICAgIGNhc2UgR0xfSU5UX1ZFQzI6XG4gICAgICAgIGNhc2UgR0xfQk9PTF9WRUMyOlxuICAgICAgICAgIHJldHVybiAyXG4gICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDMzpcbiAgICAgICAgY2FzZSBHTF9JTlRfVkVDMzpcbiAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzM6XG4gICAgICAgICAgcmV0dXJuIDNcbiAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUM0OlxuICAgICAgICBjYXNlIEdMX0lOVF9WRUM0OlxuICAgICAgICBjYXNlIEdMX0JPT0xfVkVDNDpcbiAgICAgICAgICByZXR1cm4gNFxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIHJldHVybiAxXG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZW1pdEJpbmRBdHRyaWJ1dGUgKEFUVFJJQlVURSwgc2l6ZSwgcmVjb3JkKSB7XG4gICAgICB2YXIgR0wgPSBzaGFyZWQuZ2xcblxuICAgICAgdmFyIExPQ0FUSU9OID0gc2NvcGUuZGVmKEFUVFJJQlVURSwgJy5sb2NhdGlvbicpXG4gICAgICB2YXIgQklORElORyA9IHNjb3BlLmRlZihzaGFyZWQuYXR0cmlidXRlcywgJ1snLCBMT0NBVElPTiwgJ10nKVxuXG4gICAgICB2YXIgU1RBVEUgPSByZWNvcmQuc3RhdGVcbiAgICAgIHZhciBCVUZGRVIgPSByZWNvcmQuYnVmZmVyXG4gICAgICB2YXIgQ09OU1RfQ09NUE9ORU5UUyA9IFtcbiAgICAgICAgcmVjb3JkLngsXG4gICAgICAgIHJlY29yZC55LFxuICAgICAgICByZWNvcmQueixcbiAgICAgICAgcmVjb3JkLndcbiAgICAgIF1cblxuICAgICAgdmFyIENPTU1PTl9LRVlTID0gW1xuICAgICAgICAnYnVmZmVyJyxcbiAgICAgICAgJ25vcm1hbGl6ZWQnLFxuICAgICAgICAnb2Zmc2V0JyxcbiAgICAgICAgJ3N0cmlkZSdcbiAgICAgIF1cblxuICAgICAgZnVuY3Rpb24gZW1pdEJ1ZmZlciAoKSB7XG4gICAgICAgIHNjb3BlKFxuICAgICAgICAgICdpZighJywgQklORElORywgJy5idWZmZXIpeycsXG4gICAgICAgICAgR0wsICcuZW5hYmxlVmVydGV4QXR0cmliQXJyYXkoJywgTE9DQVRJT04sICcpO30nKVxuXG4gICAgICAgIHZhciBUWVBFID0gcmVjb3JkLnR5cGVcbiAgICAgICAgdmFyIFNJWkVcbiAgICAgICAgaWYgKCFyZWNvcmQuc2l6ZSkge1xuICAgICAgICAgIFNJWkUgPSBzaXplXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgU0laRSA9IHNjb3BlLmRlZihyZWNvcmQuc2l6ZSwgJ3x8Jywgc2l6ZSlcbiAgICAgICAgfVxuXG4gICAgICAgIHNjb3BlKCdpZignLFxuICAgICAgICAgIEJJTkRJTkcsICcudHlwZSE9PScsIFRZUEUsICd8fCcsXG4gICAgICAgICAgQklORElORywgJy5zaXplIT09JywgU0laRSwgJ3x8JyxcbiAgICAgICAgICBDT01NT05fS0VZUy5tYXAoZnVuY3Rpb24gKGtleSkge1xuICAgICAgICAgICAgcmV0dXJuIEJJTkRJTkcgKyAnLicgKyBrZXkgKyAnIT09JyArIHJlY29yZFtrZXldXG4gICAgICAgICAgfSkuam9pbignfHwnKSxcbiAgICAgICAgICAnKXsnLFxuICAgICAgICAgIEdMLCAnLmJpbmRCdWZmZXIoJywgR0xfQVJSQVlfQlVGRkVSLCAnLCcsIEJVRkZFUiwgJy5idWZmZXIpOycsXG4gICAgICAgICAgR0wsICcudmVydGV4QXR0cmliUG9pbnRlcignLCBbXG4gICAgICAgICAgICBMT0NBVElPTixcbiAgICAgICAgICAgIFNJWkUsXG4gICAgICAgICAgICBUWVBFLFxuICAgICAgICAgICAgcmVjb3JkLm5vcm1hbGl6ZWQsXG4gICAgICAgICAgICByZWNvcmQuc3RyaWRlLFxuICAgICAgICAgICAgcmVjb3JkLm9mZnNldFxuICAgICAgICAgIF0sICcpOycsXG4gICAgICAgICAgQklORElORywgJy50eXBlPScsIFRZUEUsICc7JyxcbiAgICAgICAgICBCSU5ESU5HLCAnLnNpemU9JywgU0laRSwgJzsnLFxuICAgICAgICAgIENPTU1PTl9LRVlTLm1hcChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgICAgICByZXR1cm4gQklORElORyArICcuJyArIGtleSArICc9JyArIHJlY29yZFtrZXldICsgJzsnXG4gICAgICAgICAgfSkuam9pbignJyksXG4gICAgICAgICAgJ30nKVxuXG4gICAgICAgIGlmIChleHRJbnN0YW5jaW5nKSB7XG4gICAgICAgICAgdmFyIERJVklTT1IgPSByZWNvcmQuZGl2aXNvclxuICAgICAgICAgIHNjb3BlKFxuICAgICAgICAgICAgJ2lmKCcsIEJJTkRJTkcsICcuZGl2aXNvciE9PScsIERJVklTT1IsICcpeycsXG4gICAgICAgICAgICBlbnYuaW5zdGFuY2luZywgJy52ZXJ0ZXhBdHRyaWJEaXZpc29yQU5HTEUoJywgW0xPQ0FUSU9OLCBESVZJU09SXSwgJyk7JyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcuZGl2aXNvcj0nLCBESVZJU09SLCAnO30nKVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGZ1bmN0aW9uIGVtaXRDb25zdGFudCAoKSB7XG4gICAgICAgIHNjb3BlKFxuICAgICAgICAgICdpZignLCBCSU5ESU5HLCAnLmJ1ZmZlcil7JyxcbiAgICAgICAgICBHTCwgJy5kaXNhYmxlVmVydGV4QXR0cmliQXJyYXkoJywgTE9DQVRJT04sICcpOycsXG4gICAgICAgICAgJ31pZignLCBDVVRFX0NPTVBPTkVOVFMubWFwKGZ1bmN0aW9uIChjLCBpKSB7XG4gICAgICAgICAgICByZXR1cm4gQklORElORyArICcuJyArIGMgKyAnIT09JyArIENPTlNUX0NPTVBPTkVOVFNbaV1cbiAgICAgICAgICB9KS5qb2luKCd8fCcpLCAnKXsnLFxuICAgICAgICAgIEdMLCAnLnZlcnRleEF0dHJpYjRmKCcsIExPQ0FUSU9OLCAnLCcsIENPTlNUX0NPTVBPTkVOVFMsICcpOycsXG4gICAgICAgICAgQ1VURV9DT01QT05FTlRTLm1hcChmdW5jdGlvbiAoYywgaSkge1xuICAgICAgICAgICAgcmV0dXJuIEJJTkRJTkcgKyAnLicgKyBjICsgJz0nICsgQ09OU1RfQ09NUE9ORU5UU1tpXSArICc7J1xuICAgICAgICAgIH0pLmpvaW4oJycpLFxuICAgICAgICAgICd9JylcbiAgICAgIH1cblxuICAgICAgaWYgKFNUQVRFID09PSBBVFRSSUJfU1RBVEVfUE9JTlRFUikge1xuICAgICAgICBlbWl0QnVmZmVyKClcbiAgICAgIH0gZWxzZSBpZiAoU1RBVEUgPT09IEFUVFJJQl9TVEFURV9DT05TVEFOVCkge1xuICAgICAgICBlbWl0Q29uc3RhbnQoKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2NvcGUoJ2lmKCcsIFNUQVRFLCAnPT09JywgQVRUUklCX1NUQVRFX1BPSU5URVIsICcpeycpXG4gICAgICAgIGVtaXRCdWZmZXIoKVxuICAgICAgICBzY29wZSgnfWVsc2V7JylcbiAgICAgICAgZW1pdENvbnN0YW50KClcbiAgICAgICAgc2NvcGUoJ30nKVxuICAgICAgfVxuICAgIH1cblxuICAgIGF0dHJpYnV0ZXMuZm9yRWFjaChmdW5jdGlvbiAoYXR0cmlidXRlKSB7XG4gICAgICB2YXIgbmFtZSA9IGF0dHJpYnV0ZS5uYW1lXG4gICAgICB2YXIgYXJnID0gYXJncy5hdHRyaWJ1dGVzW25hbWVdXG4gICAgICB2YXIgcmVjb3JkXG4gICAgICBpZiAoYXJnKSB7XG4gICAgICAgIGlmICghZmlsdGVyKGFyZykpIHtcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuICAgICAgICByZWNvcmQgPSBhcmcuYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoIWZpbHRlcihTQ09QRV9ERUNMKSkge1xuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG4gICAgICAgIHZhciBzY29wZUF0dHJpYiA9IGVudi5zY29wZUF0dHJpYihuYW1lKVxuICAgICAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZW52LmFzc2VydChzY29wZSxcbiAgICAgICAgICAgIHNjb3BlQXR0cmliICsgJy5zdGF0ZScsXG4gICAgICAgICAgICAnbWlzc2luZyBhdHRyaWJ1dGUgJyArIG5hbWUpXG4gICAgICAgIH0pXG4gICAgICAgIHJlY29yZCA9IHt9XG4gICAgICAgIE9iamVjdC5rZXlzKG5ldyBBdHRyaWJ1dGVSZWNvcmQoKSkuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgICAgcmVjb3JkW2tleV0gPSBzY29wZS5kZWYoc2NvcGVBdHRyaWIsICcuJywga2V5KVxuICAgICAgICB9KVxuICAgICAgfVxuICAgICAgZW1pdEJpbmRBdHRyaWJ1dGUoXG4gICAgICAgIGVudi5saW5rKGF0dHJpYnV0ZSksIHR5cGVMZW5ndGgoYXR0cmlidXRlLmluZm8udHlwZSksIHJlY29yZClcbiAgICB9KVxuICB9XG5cbiAgZnVuY3Rpb24gZW1pdFVuaWZvcm1zIChlbnYsIHNjb3BlLCBhcmdzLCB1bmlmb3JtcywgZmlsdGVyKSB7XG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcbiAgICB2YXIgR0wgPSBzaGFyZWQuZ2xcblxuICAgIHZhciBpbmZpeFxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdW5pZm9ybXMubGVuZ3RoOyArK2kpIHtcbiAgICAgIHZhciB1bmlmb3JtID0gdW5pZm9ybXNbaV1cbiAgICAgIHZhciBuYW1lID0gdW5pZm9ybS5uYW1lXG4gICAgICB2YXIgdHlwZSA9IHVuaWZvcm0uaW5mby50eXBlXG4gICAgICB2YXIgYXJnID0gYXJncy51bmlmb3Jtc1tuYW1lXVxuICAgICAgdmFyIFVOSUZPUk0gPSBlbnYubGluayh1bmlmb3JtKVxuICAgICAgdmFyIExPQ0FUSU9OID0gVU5JRk9STSArICcubG9jYXRpb24nXG5cbiAgICAgIHZhciBWQUxVRVxuICAgICAgaWYgKGFyZykge1xuICAgICAgICBpZiAoIWZpbHRlcihhcmcpKSB7XG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfVxuICAgICAgICBpZiAoaXNTdGF0aWMoYXJnKSkge1xuICAgICAgICAgIHZhciB2YWx1ZSA9IGFyZy52YWx1ZVxuICAgICAgICAgIGNoZWNrLmNvbW1hbmQoXG4gICAgICAgICAgICB2YWx1ZSAhPT0gbnVsbCAmJiB0eXBlb2YgdmFsdWUgIT09ICd1bmRlZmluZWQnLFxuICAgICAgICAgICAgJ21pc3NpbmcgdW5pZm9ybSBcIicgKyBuYW1lICsgJ1wiJywgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgaWYgKHR5cGUgPT09IEdMX1NBTVBMRVJfMkQgfHwgdHlwZSA9PT0gR0xfU0FNUExFUl9DVUJFKSB7XG4gICAgICAgICAgICBjaGVjay5jb21tYW5kKFxuICAgICAgICAgICAgICB0eXBlb2YgdmFsdWUgPT09ICdmdW5jdGlvbicgJiZcbiAgICAgICAgICAgICAgKCh0eXBlID09PSBHTF9TQU1QTEVSXzJEICYmXG4gICAgICAgICAgICAgICAgKHZhbHVlLl9yZWdsVHlwZSA9PT0gJ3RleHR1cmUyZCcgfHxcbiAgICAgICAgICAgICAgICB2YWx1ZS5fcmVnbFR5cGUgPT09ICdmcmFtZWJ1ZmZlcicpKSB8fFxuICAgICAgICAgICAgICAodHlwZSA9PT0gR0xfU0FNUExFUl9DVUJFICYmXG4gICAgICAgICAgICAgICAgKHZhbHVlLl9yZWdsVHlwZSA9PT0gJ3RleHR1cmVDdWJlJyB8fFxuICAgICAgICAgICAgICAgIHZhbHVlLl9yZWdsVHlwZSA9PT0gJ2ZyYW1lYnVmZmVyQ3ViZScpKSksXG4gICAgICAgICAgICAgICdpbnZhbGlkIHRleHR1cmUgZm9yIHVuaWZvcm0gJyArIG5hbWUsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgdmFyIFRFWF9WQUxVRSA9IGVudi5saW5rKHZhbHVlLl90ZXh0dXJlIHx8IHZhbHVlLmNvbG9yWzBdLl90ZXh0dXJlKVxuICAgICAgICAgICAgc2NvcGUoR0wsICcudW5pZm9ybTFpKCcsIExPQ0FUSU9OLCAnLCcsIFRFWF9WQUxVRSArICcuYmluZCgpKTsnKVxuICAgICAgICAgICAgc2NvcGUuZXhpdChURVhfVkFMVUUsICcudW5iaW5kKCk7JylcbiAgICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgICAgdHlwZSA9PT0gR0xfRkxPQVRfTUFUMiB8fFxuICAgICAgICAgICAgdHlwZSA9PT0gR0xfRkxPQVRfTUFUMyB8fFxuICAgICAgICAgICAgdHlwZSA9PT0gR0xfRkxPQVRfTUFUNCkge1xuICAgICAgICAgICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICBjaGVjay5jb21tYW5kKGlzQXJyYXlMaWtlKHZhbHVlKSxcbiAgICAgICAgICAgICAgICAnaW52YWxpZCBtYXRyaXggZm9yIHVuaWZvcm0gJyArIG5hbWUsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICBjaGVjay5jb21tYW5kKFxuICAgICAgICAgICAgICAgICh0eXBlID09PSBHTF9GTE9BVF9NQVQyICYmIHZhbHVlLmxlbmd0aCA9PT0gNCkgfHxcbiAgICAgICAgICAgICAgICAodHlwZSA9PT0gR0xfRkxPQVRfTUFUMyAmJiB2YWx1ZS5sZW5ndGggPT09IDkpIHx8XG4gICAgICAgICAgICAgICAgKHR5cGUgPT09IEdMX0ZMT0FUX01BVDQgJiYgdmFsdWUubGVuZ3RoID09PSAxNiksXG4gICAgICAgICAgICAgICAgJ2ludmFsaWQgbGVuZ3RoIGZvciBtYXRyaXggdW5pZm9ybSAnICsgbmFtZSwgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgdmFyIE1BVF9WQUxVRSA9IGVudi5nbG9iYWwuZGVmKCduZXcgRmxvYXQzMkFycmF5KFsnICtcbiAgICAgICAgICAgICAgQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwodmFsdWUpICsgJ10pJylcbiAgICAgICAgICAgIHZhciBkaW0gPSAyXG4gICAgICAgICAgICBpZiAodHlwZSA9PT0gR0xfRkxPQVRfTUFUMykge1xuICAgICAgICAgICAgICBkaW0gPSAzXG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGUgPT09IEdMX0ZMT0FUX01BVDQpIHtcbiAgICAgICAgICAgICAgZGltID0gNFxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc2NvcGUoXG4gICAgICAgICAgICAgIEdMLCAnLnVuaWZvcm1NYXRyaXgnLCBkaW0sICdmdignLFxuICAgICAgICAgICAgICBMT0NBVElPTiwgJyxmYWxzZSwnLCBNQVRfVkFMVUUsICcpOycpXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICAgICAgICBjYXNlIEdMX0ZMT0FUOlxuICAgICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmRUeXBlKHZhbHVlLCAnbnVtYmVyJywgJ3VuaWZvcm0gJyArIG5hbWUsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICAgIGluZml4ID0gJzFmJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDMjpcbiAgICAgICAgICAgICAgICBjaGVjay5jb21tYW5kKFxuICAgICAgICAgICAgICAgICAgaXNBcnJheUxpa2UodmFsdWUpICYmIHZhbHVlLmxlbmd0aCA9PT0gMixcbiAgICAgICAgICAgICAgICAgICd1bmlmb3JtICcgKyBuYW1lLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICcyZidcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzM6XG4gICAgICAgICAgICAgICAgY2hlY2suY29tbWFuZChcbiAgICAgICAgICAgICAgICAgIGlzQXJyYXlMaWtlKHZhbHVlKSAmJiB2YWx1ZS5sZW5ndGggPT09IDMsXG4gICAgICAgICAgICAgICAgICAndW5pZm9ybSAnICsgbmFtZSwgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgICAgaW5maXggPSAnM2YnXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUM0OlxuICAgICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmQoXG4gICAgICAgICAgICAgICAgICBpc0FycmF5TGlrZSh2YWx1ZSkgJiYgdmFsdWUubGVuZ3RoID09PSA0LFxuICAgICAgICAgICAgICAgICAgJ3VuaWZvcm0gJyArIG5hbWUsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICAgIGluZml4ID0gJzRmJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfQk9PTDpcbiAgICAgICAgICAgICAgICBjaGVjay5jb21tYW5kVHlwZSh2YWx1ZSwgJ2Jvb2xlYW4nLCAndW5pZm9ybSAnICsgbmFtZSwgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgICAgaW5maXggPSAnMWknXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9JTlQ6XG4gICAgICAgICAgICAgICAgY2hlY2suY29tbWFuZFR5cGUodmFsdWUsICdudW1iZXInLCAndW5pZm9ybSAnICsgbmFtZSwgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgICAgaW5maXggPSAnMWknXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzI6XG4gICAgICAgICAgICAgICAgY2hlY2suY29tbWFuZChcbiAgICAgICAgICAgICAgICAgIGlzQXJyYXlMaWtlKHZhbHVlKSAmJiB2YWx1ZS5sZW5ndGggPT09IDIsXG4gICAgICAgICAgICAgICAgICAndW5pZm9ybSAnICsgbmFtZSwgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgICAgaW5maXggPSAnMmknXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9JTlRfVkVDMjpcbiAgICAgICAgICAgICAgICBjaGVjay5jb21tYW5kKFxuICAgICAgICAgICAgICAgICAgaXNBcnJheUxpa2UodmFsdWUpICYmIHZhbHVlLmxlbmd0aCA9PT0gMixcbiAgICAgICAgICAgICAgICAgICd1bmlmb3JtICcgKyBuYW1lLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICcyaSdcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0JPT0xfVkVDMzpcbiAgICAgICAgICAgICAgICBjaGVjay5jb21tYW5kKFxuICAgICAgICAgICAgICAgICAgaXNBcnJheUxpa2UodmFsdWUpICYmIHZhbHVlLmxlbmd0aCA9PT0gMyxcbiAgICAgICAgICAgICAgICAgICd1bmlmb3JtICcgKyBuYW1lLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICczaSdcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0lOVF9WRUMzOlxuICAgICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmQoXG4gICAgICAgICAgICAgICAgICBpc0FycmF5TGlrZSh2YWx1ZSkgJiYgdmFsdWUubGVuZ3RoID09PSAzLFxuICAgICAgICAgICAgICAgICAgJ3VuaWZvcm0gJyArIG5hbWUsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICAgIGluZml4ID0gJzNpJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfQk9PTF9WRUM0OlxuICAgICAgICAgICAgICAgIGNoZWNrLmNvbW1hbmQoXG4gICAgICAgICAgICAgICAgICBpc0FycmF5TGlrZSh2YWx1ZSkgJiYgdmFsdWUubGVuZ3RoID09PSA0LFxuICAgICAgICAgICAgICAgICAgJ3VuaWZvcm0gJyArIG5hbWUsIGVudi5jb21tYW5kU3RyKVxuICAgICAgICAgICAgICAgIGluZml4ID0gJzRpJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfSU5UX1ZFQzQ6XG4gICAgICAgICAgICAgICAgY2hlY2suY29tbWFuZChcbiAgICAgICAgICAgICAgICAgIGlzQXJyYXlMaWtlKHZhbHVlKSAmJiB2YWx1ZS5sZW5ndGggPT09IDQsXG4gICAgICAgICAgICAgICAgICAndW5pZm9ybSAnICsgbmFtZSwgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgICAgICAgICAgaW5maXggPSAnNGknXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHNjb3BlKEdMLCAnLnVuaWZvcm0nLCBpbmZpeCwgJygnLCBMT0NBVElPTiwgJywnLFxuICAgICAgICAgICAgICBpc0FycmF5TGlrZSh2YWx1ZSkgPyBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbCh2YWx1ZSkgOiB2YWx1ZSxcbiAgICAgICAgICAgICAgJyk7JylcbiAgICAgICAgICB9XG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBWQUxVRSA9IGFyZy5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKCFmaWx0ZXIoU0NPUEVfREVDTCkpIHtcbiAgICAgICAgICBjb250aW51ZVxuICAgICAgICB9XG4gICAgICAgIFZBTFVFID0gc2NvcGUuZGVmKHNoYXJlZC51bmlmb3JtcywgJ1snLCBzdHJpbmdTdG9yZS5pZChuYW1lKSwgJ10nKVxuICAgICAgfVxuXG4gICAgICBpZiAodHlwZSA9PT0gR0xfU0FNUExFUl8yRCkge1xuICAgICAgICBzY29wZShcbiAgICAgICAgICAnaWYoJywgVkFMVUUsICcmJicsIFZBTFVFLCAnLl9yZWdsVHlwZT09PVwiZnJhbWVidWZmZXJcIil7JyxcbiAgICAgICAgICBWQUxVRSwgJz0nLCBWQUxVRSwgJy5jb2xvclswXTsnLFxuICAgICAgICAgICd9JylcbiAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gR0xfU0FNUExFUl9DVUJFKSB7XG4gICAgICAgIHNjb3BlKFxuICAgICAgICAgICdpZignLCBWQUxVRSwgJyYmJywgVkFMVUUsICcuX3JlZ2xUeXBlPT09XCJmcmFtZWJ1ZmZlckN1YmVcIil7JyxcbiAgICAgICAgICBWQUxVRSwgJz0nLCBWQUxVRSwgJy5jb2xvclswXTsnLFxuICAgICAgICAgICd9JylcbiAgICAgIH1cblxuICAgICAgLy8gcGVyZm9ybSB0eXBlIHZhbGlkYXRpb25cbiAgICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgZnVuY3Rpb24gY2hlY2sgKHByZWQsIG1lc3NhZ2UpIHtcbiAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLCBwcmVkLFxuICAgICAgICAgICAgJ2JhZCBkYXRhIG9yIG1pc3NpbmcgZm9yIHVuaWZvcm0gXCInICsgbmFtZSArICdcIi4gICcgKyBtZXNzYWdlKVxuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gY2hlY2tUeXBlICh0eXBlKSB7XG4gICAgICAgICAgY2hlY2soXG4gICAgICAgICAgICAndHlwZW9mICcgKyBWQUxVRSArICc9PT1cIicgKyB0eXBlICsgJ1wiJyxcbiAgICAgICAgICAgICdpbnZhbGlkIHR5cGUsIGV4cGVjdGVkICcgKyB0eXBlKVxuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gY2hlY2tWZWN0b3IgKG4sIHR5cGUpIHtcbiAgICAgICAgICBjaGVjayhcbiAgICAgICAgICAgIHNoYXJlZC5pc0FycmF5TGlrZSArICcoJyArIFZBTFVFICsgJykmJicgKyBWQUxVRSArICcubGVuZ3RoPT09JyArIG4sXG4gICAgICAgICAgICAnaW52YWxpZCB2ZWN0b3IsIHNob3VsZCBoYXZlIGxlbmd0aCAnICsgbiwgZW52LmNvbW1hbmRTdHIpXG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBjaGVja1RleHR1cmUgKHRhcmdldCkge1xuICAgICAgICAgIGNoZWNrKFxuICAgICAgICAgICAgJ3R5cGVvZiAnICsgVkFMVUUgKyAnPT09XCJmdW5jdGlvblwiJiYnICtcbiAgICAgICAgICAgIFZBTFVFICsgJy5fcmVnbFR5cGU9PT1cInRleHR1cmUnICtcbiAgICAgICAgICAgICh0YXJnZXQgPT09IEdMX1RFWFRVUkVfMkQgPyAnMmQnIDogJ0N1YmUnKSArICdcIicsXG4gICAgICAgICAgICAnaW52YWxpZCB0ZXh0dXJlIHR5cGUnLCBlbnYuY29tbWFuZFN0cilcbiAgICAgICAgfVxuXG4gICAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICAgIGNhc2UgR0xfSU5UOlxuICAgICAgICAgICAgY2hlY2tUeXBlKCdudW1iZXInKVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlIEdMX0lOVF9WRUMyOlxuICAgICAgICAgICAgY2hlY2tWZWN0b3IoMiwgJ251bWJlcicpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgR0xfSU5UX1ZFQzM6XG4gICAgICAgICAgICBjaGVja1ZlY3RvcigzLCAnbnVtYmVyJylcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSBHTF9JTlRfVkVDNDpcbiAgICAgICAgICAgIGNoZWNrVmVjdG9yKDQsICdudW1iZXInKVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlIEdMX0ZMT0FUOlxuICAgICAgICAgICAgY2hlY2tUeXBlKCdudW1iZXInKVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzI6XG4gICAgICAgICAgICBjaGVja1ZlY3RvcigyLCAnbnVtYmVyJylcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUMzOlxuICAgICAgICAgICAgY2hlY2tWZWN0b3IoMywgJ251bWJlcicpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDNDpcbiAgICAgICAgICAgIGNoZWNrVmVjdG9yKDQsICdudW1iZXInKVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlIEdMX0JPT0w6XG4gICAgICAgICAgICBjaGVja1R5cGUoJ2Jvb2xlYW4nKVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlIEdMX0JPT0xfVkVDMjpcbiAgICAgICAgICAgIGNoZWNrVmVjdG9yKDIsICdib29sZWFuJylcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzM6XG4gICAgICAgICAgICBjaGVja1ZlY3RvcigzLCAnYm9vbGVhbicpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgR0xfQk9PTF9WRUM0OlxuICAgICAgICAgICAgY2hlY2tWZWN0b3IoNCwgJ2Jvb2xlYW4nKVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlIEdMX0ZMT0FUX01BVDI6XG4gICAgICAgICAgICBjaGVja1ZlY3Rvcig0LCAnbnVtYmVyJylcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSBHTF9GTE9BVF9NQVQzOlxuICAgICAgICAgICAgY2hlY2tWZWN0b3IoOSwgJ251bWJlcicpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgR0xfRkxPQVRfTUFUNDpcbiAgICAgICAgICAgIGNoZWNrVmVjdG9yKDE2LCAnbnVtYmVyJylcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSBHTF9TQU1QTEVSXzJEOlxuICAgICAgICAgICAgY2hlY2tUZXh0dXJlKEdMX1RFWFRVUkVfMkQpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgR0xfU0FNUExFUl9DVUJFOlxuICAgICAgICAgICAgY2hlY2tUZXh0dXJlKEdMX1RFWFRVUkVfQ1VCRV9NQVApXG4gICAgICAgICAgICBicmVha1xuICAgICAgICB9XG4gICAgICB9KVxuXG4gICAgICB2YXIgdW5yb2xsID0gMVxuICAgICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICAgIGNhc2UgR0xfU0FNUExFUl8yRDpcbiAgICAgICAgY2FzZSBHTF9TQU1QTEVSX0NVQkU6XG4gICAgICAgICAgdmFyIFRFWCA9IHNjb3BlLmRlZihWQUxVRSwgJy5fdGV4dHVyZScpXG4gICAgICAgICAgc2NvcGUoR0wsICcudW5pZm9ybTFpKCcsIExPQ0FUSU9OLCAnLCcsIFRFWCwgJy5iaW5kKCkpOycpXG4gICAgICAgICAgc2NvcGUuZXhpdChURVgsICcudW5iaW5kKCk7JylcbiAgICAgICAgICBjb250aW51ZVxuXG4gICAgICAgIGNhc2UgR0xfSU5UOlxuICAgICAgICBjYXNlIEdMX0JPT0w6XG4gICAgICAgICAgaW5maXggPSAnMWknXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0lOVF9WRUMyOlxuICAgICAgICBjYXNlIEdMX0JPT0xfVkVDMjpcbiAgICAgICAgICBpbmZpeCA9ICcyaSdcbiAgICAgICAgICB1bnJvbGwgPSAyXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0lOVF9WRUMzOlxuICAgICAgICBjYXNlIEdMX0JPT0xfVkVDMzpcbiAgICAgICAgICBpbmZpeCA9ICczaSdcbiAgICAgICAgICB1bnJvbGwgPSAzXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0lOVF9WRUM0OlxuICAgICAgICBjYXNlIEdMX0JPT0xfVkVDNDpcbiAgICAgICAgICBpbmZpeCA9ICc0aSdcbiAgICAgICAgICB1bnJvbGwgPSA0XG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0ZMT0FUOlxuICAgICAgICAgIGluZml4ID0gJzFmJ1xuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUMyOlxuICAgICAgICAgIGluZml4ID0gJzJmJ1xuICAgICAgICAgIHVucm9sbCA9IDJcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDMzpcbiAgICAgICAgICBpbmZpeCA9ICczZidcbiAgICAgICAgICB1bnJvbGwgPSAzXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzQ6XG4gICAgICAgICAgaW5maXggPSAnNGYnXG4gICAgICAgICAgdW5yb2xsID0gNFxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9GTE9BVF9NQVQyOlxuICAgICAgICAgIGluZml4ID0gJ01hdHJpeDJmdidcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfRkxPQVRfTUFUMzpcbiAgICAgICAgICBpbmZpeCA9ICdNYXRyaXgzZnYnXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0ZMT0FUX01BVDQ6XG4gICAgICAgICAgaW5maXggPSAnTWF0cml4NGZ2J1xuICAgICAgICAgIGJyZWFrXG4gICAgICB9XG5cbiAgICAgIHNjb3BlKEdMLCAnLnVuaWZvcm0nLCBpbmZpeCwgJygnLCBMT0NBVElPTiwgJywnKVxuICAgICAgaWYgKGluZml4LmNoYXJBdCgwKSA9PT0gJ00nKSB7XG4gICAgICAgIHZhciBtYXRTaXplID0gTWF0aC5wb3codHlwZSAtIEdMX0ZMT0FUX01BVDIgKyAyLCAyKVxuICAgICAgICB2YXIgU1RPUkFHRSA9IGVudi5nbG9iYWwuZGVmKCduZXcgRmxvYXQzMkFycmF5KCcsIG1hdFNpemUsICcpJylcbiAgICAgICAgc2NvcGUoXG4gICAgICAgICAgJ2ZhbHNlLChBcnJheS5pc0FycmF5KCcsIFZBTFVFLCAnKXx8JywgVkFMVUUsICcgaW5zdGFuY2VvZiBGbG9hdDMyQXJyYXkpPycsIFZBTFVFLCAnOignLFxuICAgICAgICAgIGxvb3AobWF0U2l6ZSwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICAgIHJldHVybiBTVE9SQUdFICsgJ1snICsgaSArICddPScgKyBWQUxVRSArICdbJyArIGkgKyAnXSdcbiAgICAgICAgICB9KSwgJywnLCBTVE9SQUdFLCAnKScpXG4gICAgICB9IGVsc2UgaWYgKHVucm9sbCA+IDEpIHtcbiAgICAgICAgc2NvcGUobG9vcCh1bnJvbGwsIGZ1bmN0aW9uIChpKSB7XG4gICAgICAgICAgcmV0dXJuIFZBTFVFICsgJ1snICsgaSArICddJ1xuICAgICAgICB9KSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNjb3BlKFZBTFVFKVxuICAgICAgfVxuICAgICAgc2NvcGUoJyk7JylcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBlbWl0RHJhdyAoZW52LCBvdXRlciwgaW5uZXIsIGFyZ3MpIHtcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuICAgIHZhciBHTCA9IHNoYXJlZC5nbFxuICAgIHZhciBEUkFXX1NUQVRFID0gc2hhcmVkLmRyYXdcblxuICAgIHZhciBkcmF3T3B0aW9ucyA9IGFyZ3MuZHJhd1xuXG4gICAgZnVuY3Rpb24gZW1pdEVsZW1lbnRzICgpIHtcbiAgICAgIHZhciBkZWZuID0gZHJhd09wdGlvbnMuZWxlbWVudHNcbiAgICAgIHZhciBFTEVNRU5UU1xuICAgICAgdmFyIHNjb3BlID0gb3V0ZXJcbiAgICAgIGlmIChkZWZuKSB7XG4gICAgICAgIGlmICgoZGVmbi5jb250ZXh0RGVwICYmIGFyZ3MuY29udGV4dER5bmFtaWMpIHx8IGRlZm4ucHJvcERlcCkge1xuICAgICAgICAgIHNjb3BlID0gaW5uZXJcbiAgICAgICAgfVxuICAgICAgICBFTEVNRU5UUyA9IGRlZm4uYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBFTEVNRU5UUyA9IHNjb3BlLmRlZihEUkFXX1NUQVRFLCAnLicsIFNfRUxFTUVOVFMpXG4gICAgICB9XG4gICAgICBpZiAoRUxFTUVOVFMpIHtcbiAgICAgICAgc2NvcGUoXG4gICAgICAgICAgJ2lmKCcgKyBFTEVNRU5UUyArICcpJyArXG4gICAgICAgICAgR0wgKyAnLmJpbmRCdWZmZXIoJyArIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSICsgJywnICsgRUxFTUVOVFMgKyAnLmJ1ZmZlci5idWZmZXIpOycpXG4gICAgICB9XG4gICAgICByZXR1cm4gRUxFTUVOVFNcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBlbWl0Q291bnQgKCkge1xuICAgICAgdmFyIGRlZm4gPSBkcmF3T3B0aW9ucy5jb3VudFxuICAgICAgdmFyIENPVU5UXG4gICAgICB2YXIgc2NvcGUgPSBvdXRlclxuICAgICAgaWYgKGRlZm4pIHtcbiAgICAgICAgaWYgKChkZWZuLmNvbnRleHREZXAgJiYgYXJncy5jb250ZXh0RHluYW1pYykgfHwgZGVmbi5wcm9wRGVwKSB7XG4gICAgICAgICAgc2NvcGUgPSBpbm5lclxuICAgICAgICB9XG4gICAgICAgIENPVU5UID0gZGVmbi5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgICAgY2hlY2sub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGlmIChkZWZuLk1JU1NJTkcpIHtcbiAgICAgICAgICAgIGVudi5hc3NlcnQob3V0ZXIsICdmYWxzZScsICdtaXNzaW5nIHZlcnRleCBjb3VudCcpXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChkZWZuLkRZTkFNSUMpIHtcbiAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsIENPVU5UICsgJz49MCcsICdtaXNzaW5nIHZlcnRleCBjb3VudCcpXG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgQ09VTlQgPSBzY29wZS5kZWYoRFJBV19TVEFURSwgJy4nLCBTX0NPVU5UKVxuICAgICAgICBjaGVjay5vcHRpb25hbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZW52LmFzc2VydChzY29wZSwgQ09VTlQgKyAnPj0wJywgJ21pc3NpbmcgdmVydGV4IGNvdW50JylcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICAgIHJldHVybiBDT1VOVFxuICAgIH1cblxuICAgIHZhciBFTEVNRU5UUyA9IGVtaXRFbGVtZW50cygpXG4gICAgZnVuY3Rpb24gZW1pdFZhbHVlIChuYW1lKSB7XG4gICAgICB2YXIgZGVmbiA9IGRyYXdPcHRpb25zW25hbWVdXG4gICAgICBpZiAoZGVmbikge1xuICAgICAgICBpZiAoKGRlZm4uY29udGV4dERlcCAmJiBhcmdzLmNvbnRleHREeW5hbWljKSB8fCBkZWZuLnByb3BEZXApIHtcbiAgICAgICAgICByZXR1cm4gZGVmbi5hcHBlbmQoZW52LCBpbm5lcilcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gZGVmbi5hcHBlbmQoZW52LCBvdXRlcilcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIG91dGVyLmRlZihEUkFXX1NUQVRFLCAnLicsIG5hbWUpXG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFyIFBSSU1JVElWRSA9IGVtaXRWYWx1ZShTX1BSSU1JVElWRSlcbiAgICB2YXIgT0ZGU0VUID0gZW1pdFZhbHVlKFNfT0ZGU0VUKVxuXG4gICAgdmFyIENPVU5UID0gZW1pdENvdW50KClcbiAgICBpZiAodHlwZW9mIENPVU5UID09PSAnbnVtYmVyJykge1xuICAgICAgaWYgKENPVU5UID09PSAwKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBpbm5lcignaWYoJywgQ09VTlQsICcpeycpXG4gICAgICBpbm5lci5leGl0KCd9JylcbiAgICB9XG5cbiAgICB2YXIgSU5TVEFOQ0VTLCBFWFRfSU5TVEFOQ0lOR1xuICAgIGlmIChleHRJbnN0YW5jaW5nKSB7XG4gICAgICBJTlNUQU5DRVMgPSBlbWl0VmFsdWUoU19JTlNUQU5DRVMpXG4gICAgICBFWFRfSU5TVEFOQ0lORyA9IGVudi5pbnN0YW5jaW5nXG4gICAgfVxuXG4gICAgdmFyIEVMRU1FTlRfVFlQRSA9IEVMRU1FTlRTICsgJy50eXBlJ1xuXG4gICAgdmFyIGVsZW1lbnRzU3RhdGljID0gZHJhd09wdGlvbnMuZWxlbWVudHMgJiYgaXNTdGF0aWMoZHJhd09wdGlvbnMuZWxlbWVudHMpXG5cbiAgICBmdW5jdGlvbiBlbWl0SW5zdGFuY2luZyAoKSB7XG4gICAgICBmdW5jdGlvbiBkcmF3RWxlbWVudHMgKCkge1xuICAgICAgICBpbm5lcihFWFRfSU5TVEFOQ0lORywgJy5kcmF3RWxlbWVudHNJbnN0YW5jZWRBTkdMRSgnLCBbXG4gICAgICAgICAgUFJJTUlUSVZFLFxuICAgICAgICAgIENPVU5ULFxuICAgICAgICAgIEVMRU1FTlRfVFlQRSxcbiAgICAgICAgICBPRkZTRVQgKyAnPDwoKCcgKyBFTEVNRU5UX1RZUEUgKyAnLScgKyBHTF9VTlNJR05FRF9CWVRFICsgJyk+PjEpJyxcbiAgICAgICAgICBJTlNUQU5DRVNcbiAgICAgICAgXSwgJyk7JylcbiAgICAgIH1cblxuICAgICAgZnVuY3Rpb24gZHJhd0FycmF5cyAoKSB7XG4gICAgICAgIGlubmVyKEVYVF9JTlNUQU5DSU5HLCAnLmRyYXdBcnJheXNJbnN0YW5jZWRBTkdMRSgnLFxuICAgICAgICAgIFtQUklNSVRJVkUsIE9GRlNFVCwgQ09VTlQsIElOU1RBTkNFU10sICcpOycpXG4gICAgICB9XG5cbiAgICAgIGlmIChFTEVNRU5UUykge1xuICAgICAgICBpZiAoIWVsZW1lbnRzU3RhdGljKSB7XG4gICAgICAgICAgaW5uZXIoJ2lmKCcsIEVMRU1FTlRTLCAnKXsnKVxuICAgICAgICAgIGRyYXdFbGVtZW50cygpXG4gICAgICAgICAgaW5uZXIoJ31lbHNleycpXG4gICAgICAgICAgZHJhd0FycmF5cygpXG4gICAgICAgICAgaW5uZXIoJ30nKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGRyYXdFbGVtZW50cygpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRyYXdBcnJheXMoKVxuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGVtaXRSZWd1bGFyICgpIHtcbiAgICAgIGZ1bmN0aW9uIGRyYXdFbGVtZW50cyAoKSB7XG4gICAgICAgIGlubmVyKEdMICsgJy5kcmF3RWxlbWVudHMoJyArIFtcbiAgICAgICAgICBQUklNSVRJVkUsXG4gICAgICAgICAgQ09VTlQsXG4gICAgICAgICAgRUxFTUVOVF9UWVBFLFxuICAgICAgICAgIE9GRlNFVCArICc8PCgoJyArIEVMRU1FTlRfVFlQRSArICctJyArIEdMX1VOU0lHTkVEX0JZVEUgKyAnKT4+MSknXG4gICAgICAgIF0gKyAnKTsnKVxuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBkcmF3QXJyYXlzICgpIHtcbiAgICAgICAgaW5uZXIoR0wgKyAnLmRyYXdBcnJheXMoJyArIFtQUklNSVRJVkUsIE9GRlNFVCwgQ09VTlRdICsgJyk7JylcbiAgICAgIH1cblxuICAgICAgaWYgKEVMRU1FTlRTKSB7XG4gICAgICAgIGlmICghZWxlbWVudHNTdGF0aWMpIHtcbiAgICAgICAgICBpbm5lcignaWYoJywgRUxFTUVOVFMsICcpeycpXG4gICAgICAgICAgZHJhd0VsZW1lbnRzKClcbiAgICAgICAgICBpbm5lcignfWVsc2V7JylcbiAgICAgICAgICBkcmF3QXJyYXlzKClcbiAgICAgICAgICBpbm5lcignfScpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZHJhd0VsZW1lbnRzKClcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZHJhd0FycmF5cygpXG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGV4dEluc3RhbmNpbmcgJiYgKHR5cGVvZiBJTlNUQU5DRVMgIT09ICdudW1iZXInIHx8IElOU1RBTkNFUyA+PSAwKSkge1xuICAgICAgaWYgKHR5cGVvZiBJTlNUQU5DRVMgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGlubmVyKCdpZignLCBJTlNUQU5DRVMsICc+MCl7JylcbiAgICAgICAgZW1pdEluc3RhbmNpbmcoKVxuICAgICAgICBpbm5lcignfWVsc2UgaWYoJywgSU5TVEFOQ0VTLCAnPDApeycpXG4gICAgICAgIGVtaXRSZWd1bGFyKClcbiAgICAgICAgaW5uZXIoJ30nKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZW1pdEluc3RhbmNpbmcoKVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBlbWl0UmVndWxhcigpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlQm9keSAoZW1pdEJvZHksIHBhcmVudEVudiwgYXJncywgcHJvZ3JhbSwgY291bnQpIHtcbiAgICB2YXIgZW52ID0gY3JlYXRlUkVHTEVudmlyb25tZW50KClcbiAgICB2YXIgc2NvcGUgPSBlbnYucHJvYygnYm9keScsIGNvdW50KVxuICAgIGNoZWNrLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgIGVudi5jb21tYW5kU3RyID0gcGFyZW50RW52LmNvbW1hbmRTdHJcbiAgICAgIGVudi5jb21tYW5kID0gZW52LmxpbmsocGFyZW50RW52LmNvbW1hbmRTdHIpXG4gICAgfSlcbiAgICBpZiAoZXh0SW5zdGFuY2luZykge1xuICAgICAgZW52Lmluc3RhbmNpbmcgPSBzY29wZS5kZWYoXG4gICAgICAgIGVudi5zaGFyZWQuZXh0ZW5zaW9ucywgJy5hbmdsZV9pbnN0YW5jZWRfYXJyYXlzJylcbiAgICB9XG4gICAgZW1pdEJvZHkoZW52LCBzY29wZSwgYXJncywgcHJvZ3JhbSlcbiAgICByZXR1cm4gZW52LmNvbXBpbGUoKS5ib2R5XG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIERSQVcgUFJPQ1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIGVtaXREcmF3Qm9keSAoZW52LCBkcmF3LCBhcmdzLCBwcm9ncmFtKSB7XG4gICAgaW5qZWN0RXh0ZW5zaW9ucyhlbnYsIGRyYXcpXG4gICAgZW1pdEF0dHJpYnV0ZXMoZW52LCBkcmF3LCBhcmdzLCBwcm9ncmFtLmF0dHJpYnV0ZXMsIGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiB0cnVlXG4gICAgfSlcbiAgICBlbWl0VW5pZm9ybXMoZW52LCBkcmF3LCBhcmdzLCBwcm9ncmFtLnVuaWZvcm1zLCBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIH0pXG4gICAgZW1pdERyYXcoZW52LCBkcmF3LCBkcmF3LCBhcmdzKVxuICB9XG5cbiAgZnVuY3Rpb24gZW1pdERyYXdQcm9jIChlbnYsIGFyZ3MpIHtcbiAgICB2YXIgZHJhdyA9IGVudi5wcm9jKCdkcmF3JywgMSlcblxuICAgIGluamVjdEV4dGVuc2lvbnMoZW52LCBkcmF3KVxuXG4gICAgZW1pdENvbnRleHQoZW52LCBkcmF3LCBhcmdzLmNvbnRleHQpXG4gICAgZW1pdFBvbGxGcmFtZWJ1ZmZlcihlbnYsIGRyYXcsIGFyZ3MuZnJhbWVidWZmZXIpXG5cbiAgICBlbWl0UG9sbFN0YXRlKGVudiwgZHJhdywgYXJncylcbiAgICBlbWl0U2V0T3B0aW9ucyhlbnYsIGRyYXcsIGFyZ3Muc3RhdGUpXG5cbiAgICBlbWl0UHJvZmlsZShlbnYsIGRyYXcsIGFyZ3MsIGZhbHNlLCB0cnVlKVxuXG4gICAgdmFyIHByb2dyYW0gPSBhcmdzLnNoYWRlci5wcm9nVmFyLmFwcGVuZChlbnYsIGRyYXcpXG4gICAgZHJhdyhlbnYuc2hhcmVkLmdsLCAnLnVzZVByb2dyYW0oJywgcHJvZ3JhbSwgJy5wcm9ncmFtKTsnKVxuXG4gICAgaWYgKGFyZ3Muc2hhZGVyLnByb2dyYW0pIHtcbiAgICAgIGVtaXREcmF3Qm9keShlbnYsIGRyYXcsIGFyZ3MsIGFyZ3Muc2hhZGVyLnByb2dyYW0pXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBkcmF3Q2FjaGUgPSBlbnYuZ2xvYmFsLmRlZigne30nKVxuICAgICAgdmFyIFBST0dfSUQgPSBkcmF3LmRlZihwcm9ncmFtLCAnLmlkJylcbiAgICAgIHZhciBDQUNIRURfUFJPQyA9IGRyYXcuZGVmKGRyYXdDYWNoZSwgJ1snLCBQUk9HX0lELCAnXScpXG4gICAgICBkcmF3KFxuICAgICAgICBlbnYuY29uZChDQUNIRURfUFJPQylcbiAgICAgICAgICAudGhlbihDQUNIRURfUFJPQywgJy5jYWxsKHRoaXMsYTApOycpXG4gICAgICAgICAgLmVsc2UoXG4gICAgICAgICAgICBDQUNIRURfUFJPQywgJz0nLCBkcmF3Q2FjaGUsICdbJywgUFJPR19JRCwgJ109JyxcbiAgICAgICAgICAgIGVudi5saW5rKGZ1bmN0aW9uIChwcm9ncmFtKSB7XG4gICAgICAgICAgICAgIHJldHVybiBjcmVhdGVCb2R5KGVtaXREcmF3Qm9keSwgZW52LCBhcmdzLCBwcm9ncmFtLCAxKVxuICAgICAgICAgICAgfSksICcoJywgcHJvZ3JhbSwgJyk7JyxcbiAgICAgICAgICAgIENBQ0hFRF9QUk9DLCAnLmNhbGwodGhpcyxhMCk7JykpXG4gICAgfVxuXG4gICAgaWYgKE9iamVjdC5rZXlzKGFyZ3Muc3RhdGUpLmxlbmd0aCA+IDApIHtcbiAgICAgIGRyYXcoZW52LnNoYXJlZC5jdXJyZW50LCAnLmRpcnR5PXRydWU7JylcbiAgICB9XG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIEJBVENIIFBST0NcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gIGZ1bmN0aW9uIGVtaXRCYXRjaER5bmFtaWNTaGFkZXJCb2R5IChlbnYsIHNjb3BlLCBhcmdzLCBwcm9ncmFtKSB7XG4gICAgZW52LmJhdGNoSWQgPSAnYTEnXG5cbiAgICBpbmplY3RFeHRlbnNpb25zKGVudiwgc2NvcGUpXG5cbiAgICBmdW5jdGlvbiBhbGwgKCkge1xuICAgICAgcmV0dXJuIHRydWVcbiAgICB9XG5cbiAgICBlbWl0QXR0cmlidXRlcyhlbnYsIHNjb3BlLCBhcmdzLCBwcm9ncmFtLmF0dHJpYnV0ZXMsIGFsbClcbiAgICBlbWl0VW5pZm9ybXMoZW52LCBzY29wZSwgYXJncywgcHJvZ3JhbS51bmlmb3JtcywgYWxsKVxuICAgIGVtaXREcmF3KGVudiwgc2NvcGUsIHNjb3BlLCBhcmdzKVxuICB9XG5cbiAgZnVuY3Rpb24gZW1pdEJhdGNoQm9keSAoZW52LCBzY29wZSwgYXJncywgcHJvZ3JhbSkge1xuICAgIGluamVjdEV4dGVuc2lvbnMoZW52LCBzY29wZSlcblxuICAgIHZhciBjb250ZXh0RHluYW1pYyA9IGFyZ3MuY29udGV4dERlcFxuXG4gICAgdmFyIEJBVENIX0lEID0gc2NvcGUuZGVmKClcbiAgICB2YXIgUFJPUF9MSVNUID0gJ2EwJ1xuICAgIHZhciBOVU1fUFJPUFMgPSAnYTEnXG4gICAgdmFyIFBST1BTID0gc2NvcGUuZGVmKClcbiAgICBlbnYuc2hhcmVkLnByb3BzID0gUFJPUFNcbiAgICBlbnYuYmF0Y2hJZCA9IEJBVENIX0lEXG5cbiAgICB2YXIgb3V0ZXIgPSBlbnYuc2NvcGUoKVxuICAgIHZhciBpbm5lciA9IGVudi5zY29wZSgpXG5cbiAgICBzY29wZShcbiAgICAgIG91dGVyLmVudHJ5LFxuICAgICAgJ2ZvcignLCBCQVRDSF9JRCwgJz0wOycsIEJBVENIX0lELCAnPCcsIE5VTV9QUk9QUywgJzsrKycsIEJBVENIX0lELCAnKXsnLFxuICAgICAgUFJPUFMsICc9JywgUFJPUF9MSVNULCAnWycsIEJBVENIX0lELCAnXTsnLFxuICAgICAgaW5uZXIsXG4gICAgICAnfScsXG4gICAgICBvdXRlci5leGl0KVxuXG4gICAgZnVuY3Rpb24gaXNJbm5lckRlZm4gKGRlZm4pIHtcbiAgICAgIHJldHVybiAoKGRlZm4uY29udGV4dERlcCAmJiBjb250ZXh0RHluYW1pYykgfHwgZGVmbi5wcm9wRGVwKVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGlzT3V0ZXJEZWZuIChkZWZuKSB7XG4gICAgICByZXR1cm4gIWlzSW5uZXJEZWZuKGRlZm4pXG4gICAgfVxuXG4gICAgaWYgKGFyZ3MubmVlZHNDb250ZXh0KSB7XG4gICAgICBlbWl0Q29udGV4dChlbnYsIGlubmVyLCBhcmdzLmNvbnRleHQpXG4gICAgfVxuICAgIGlmIChhcmdzLm5lZWRzRnJhbWVidWZmZXIpIHtcbiAgICAgIGVtaXRQb2xsRnJhbWVidWZmZXIoZW52LCBpbm5lciwgYXJncy5mcmFtZWJ1ZmZlcilcbiAgICB9XG4gICAgZW1pdFNldE9wdGlvbnMoZW52LCBpbm5lciwgYXJncy5zdGF0ZSwgaXNJbm5lckRlZm4pXG5cbiAgICBpZiAoYXJncy5wcm9maWxlICYmIGlzSW5uZXJEZWZuKGFyZ3MucHJvZmlsZSkpIHtcbiAgICAgIGVtaXRQcm9maWxlKGVudiwgaW5uZXIsIGFyZ3MsIGZhbHNlLCB0cnVlKVxuICAgIH1cblxuICAgIGlmICghcHJvZ3JhbSkge1xuICAgICAgdmFyIHByb2dDYWNoZSA9IGVudi5nbG9iYWwuZGVmKCd7fScpXG4gICAgICB2YXIgUFJPR1JBTSA9IGFyZ3Muc2hhZGVyLnByb2dWYXIuYXBwZW5kKGVudiwgaW5uZXIpXG4gICAgICB2YXIgUFJPR19JRCA9IGlubmVyLmRlZihQUk9HUkFNLCAnLmlkJylcbiAgICAgIHZhciBDQUNIRURfUFJPQyA9IGlubmVyLmRlZihwcm9nQ2FjaGUsICdbJywgUFJPR19JRCwgJ10nKVxuICAgICAgaW5uZXIoXG4gICAgICAgIGVudi5zaGFyZWQuZ2wsICcudXNlUHJvZ3JhbSgnLCBQUk9HUkFNLCAnLnByb2dyYW0pOycsXG4gICAgICAgICdpZighJywgQ0FDSEVEX1BST0MsICcpeycsXG4gICAgICAgIENBQ0hFRF9QUk9DLCAnPScsIHByb2dDYWNoZSwgJ1snLCBQUk9HX0lELCAnXT0nLFxuICAgICAgICBlbnYubGluayhmdW5jdGlvbiAocHJvZ3JhbSkge1xuICAgICAgICAgIHJldHVybiBjcmVhdGVCb2R5KFxuICAgICAgICAgICAgZW1pdEJhdGNoRHluYW1pY1NoYWRlckJvZHksIGVudiwgYXJncywgcHJvZ3JhbSwgMilcbiAgICAgICAgfSksICcoJywgUFJPR1JBTSwgJyk7fScsXG4gICAgICAgIENBQ0hFRF9QUk9DLCAnLmNhbGwodGhpcyxhMFsnLCBCQVRDSF9JRCwgJ10sJywgQkFUQ0hfSUQsICcpOycpXG4gICAgfSBlbHNlIHtcbiAgICAgIGVtaXRBdHRyaWJ1dGVzKGVudiwgb3V0ZXIsIGFyZ3MsIHByb2dyYW0uYXR0cmlidXRlcywgaXNPdXRlckRlZm4pXG4gICAgICBlbWl0QXR0cmlidXRlcyhlbnYsIGlubmVyLCBhcmdzLCBwcm9ncmFtLmF0dHJpYnV0ZXMsIGlzSW5uZXJEZWZuKVxuICAgICAgZW1pdFVuaWZvcm1zKGVudiwgb3V0ZXIsIGFyZ3MsIHByb2dyYW0udW5pZm9ybXMsIGlzT3V0ZXJEZWZuKVxuICAgICAgZW1pdFVuaWZvcm1zKGVudiwgaW5uZXIsIGFyZ3MsIHByb2dyYW0udW5pZm9ybXMsIGlzSW5uZXJEZWZuKVxuICAgICAgZW1pdERyYXcoZW52LCBvdXRlciwgaW5uZXIsIGFyZ3MpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZW1pdEJhdGNoUHJvYyAoZW52LCBhcmdzKSB7XG4gICAgdmFyIGJhdGNoID0gZW52LnByb2MoJ2JhdGNoJywgMilcbiAgICBlbnYuYmF0Y2hJZCA9ICcwJ1xuXG4gICAgaW5qZWN0RXh0ZW5zaW9ucyhlbnYsIGJhdGNoKVxuXG4gICAgLy8gQ2hlY2sgaWYgYW55IGNvbnRleHQgdmFyaWFibGVzIGRlcGVuZCBvbiBwcm9wc1xuICAgIHZhciBjb250ZXh0RHluYW1pYyA9IGZhbHNlXG4gICAgdmFyIG5lZWRzQ29udGV4dCA9IHRydWVcbiAgICBPYmplY3Qua2V5cyhhcmdzLmNvbnRleHQpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIGNvbnRleHREeW5hbWljID0gY29udGV4dER5bmFtaWMgfHwgYXJncy5jb250ZXh0W25hbWVdLnByb3BEZXBcbiAgICB9KVxuICAgIGlmICghY29udGV4dER5bmFtaWMpIHtcbiAgICAgIGVtaXRDb250ZXh0KGVudiwgYmF0Y2gsIGFyZ3MuY29udGV4dClcbiAgICAgIG5lZWRzQ29udGV4dCA9IGZhbHNlXG4gICAgfVxuXG4gICAgLy8gZnJhbWVidWZmZXIgc3RhdGUgYWZmZWN0cyBmcmFtZWJ1ZmZlcldpZHRoL2hlaWdodCBjb250ZXh0IHZhcnNcbiAgICB2YXIgZnJhbWVidWZmZXIgPSBhcmdzLmZyYW1lYnVmZmVyXG4gICAgdmFyIG5lZWRzRnJhbWVidWZmZXIgPSBmYWxzZVxuICAgIGlmIChmcmFtZWJ1ZmZlcikge1xuICAgICAgaWYgKGZyYW1lYnVmZmVyLnByb3BEZXApIHtcbiAgICAgICAgY29udGV4dER5bmFtaWMgPSBuZWVkc0ZyYW1lYnVmZmVyID0gdHJ1ZVxuICAgICAgfSBlbHNlIGlmIChmcmFtZWJ1ZmZlci5jb250ZXh0RGVwICYmIGNvbnRleHREeW5hbWljKSB7XG4gICAgICAgIG5lZWRzRnJhbWVidWZmZXIgPSB0cnVlXG4gICAgICB9XG4gICAgICBpZiAoIW5lZWRzRnJhbWVidWZmZXIpIHtcbiAgICAgICAgZW1pdFBvbGxGcmFtZWJ1ZmZlcihlbnYsIGJhdGNoLCBmcmFtZWJ1ZmZlcilcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgZW1pdFBvbGxGcmFtZWJ1ZmZlcihlbnYsIGJhdGNoLCBudWxsKVxuICAgIH1cblxuICAgIC8vIHZpZXdwb3J0IGlzIHdlaXJkIGJlY2F1c2UgaXQgY2FuIGFmZmVjdCBjb250ZXh0IHZhcnNcbiAgICBpZiAoYXJncy5zdGF0ZS52aWV3cG9ydCAmJiBhcmdzLnN0YXRlLnZpZXdwb3J0LnByb3BEZXApIHtcbiAgICAgIGNvbnRleHREeW5hbWljID0gdHJ1ZVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGlzSW5uZXJEZWZuIChkZWZuKSB7XG4gICAgICByZXR1cm4gKGRlZm4uY29udGV4dERlcCAmJiBjb250ZXh0RHluYW1pYykgfHwgZGVmbi5wcm9wRGVwXG4gICAgfVxuXG4gICAgLy8gc2V0IHdlYmdsIG9wdGlvbnNcbiAgICBlbWl0UG9sbFN0YXRlKGVudiwgYmF0Y2gsIGFyZ3MpXG4gICAgZW1pdFNldE9wdGlvbnMoZW52LCBiYXRjaCwgYXJncy5zdGF0ZSwgZnVuY3Rpb24gKGRlZm4pIHtcbiAgICAgIHJldHVybiAhaXNJbm5lckRlZm4oZGVmbilcbiAgICB9KVxuXG4gICAgaWYgKCFhcmdzLnByb2ZpbGUgfHwgIWlzSW5uZXJEZWZuKGFyZ3MucHJvZmlsZSkpIHtcbiAgICAgIGVtaXRQcm9maWxlKGVudiwgYmF0Y2gsIGFyZ3MsIGZhbHNlLCAnYTEnKVxuICAgIH1cblxuICAgIC8vIFNhdmUgdGhlc2UgdmFsdWVzIHRvIGFyZ3Mgc28gdGhhdCB0aGUgYmF0Y2ggYm9keSByb3V0aW5lIGNhbiB1c2UgdGhlbVxuICAgIGFyZ3MuY29udGV4dERlcCA9IGNvbnRleHREeW5hbWljXG4gICAgYXJncy5uZWVkc0NvbnRleHQgPSBuZWVkc0NvbnRleHRcbiAgICBhcmdzLm5lZWRzRnJhbWVidWZmZXIgPSBuZWVkc0ZyYW1lYnVmZmVyXG5cbiAgICAvLyBkZXRlcm1pbmUgaWYgc2hhZGVyIGlzIGR5bmFtaWNcbiAgICB2YXIgcHJvZ0RlZm4gPSBhcmdzLnNoYWRlci5wcm9nVmFyXG4gICAgaWYgKChwcm9nRGVmbi5jb250ZXh0RGVwICYmIGNvbnRleHREeW5hbWljKSB8fCBwcm9nRGVmbi5wcm9wRGVwKSB7XG4gICAgICBlbWl0QmF0Y2hCb2R5KFxuICAgICAgICBlbnYsXG4gICAgICAgIGJhdGNoLFxuICAgICAgICBhcmdzLFxuICAgICAgICBudWxsKVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgUFJPR1JBTSA9IHByb2dEZWZuLmFwcGVuZChlbnYsIGJhdGNoKVxuICAgICAgYmF0Y2goZW52LnNoYXJlZC5nbCwgJy51c2VQcm9ncmFtKCcsIFBST0dSQU0sICcucHJvZ3JhbSk7JylcbiAgICAgIGlmIChhcmdzLnNoYWRlci5wcm9ncmFtKSB7XG4gICAgICAgIGVtaXRCYXRjaEJvZHkoXG4gICAgICAgICAgZW52LFxuICAgICAgICAgIGJhdGNoLFxuICAgICAgICAgIGFyZ3MsXG4gICAgICAgICAgYXJncy5zaGFkZXIucHJvZ3JhbSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBiYXRjaENhY2hlID0gZW52Lmdsb2JhbC5kZWYoJ3t9JylcbiAgICAgICAgdmFyIFBST0dfSUQgPSBiYXRjaC5kZWYoUFJPR1JBTSwgJy5pZCcpXG4gICAgICAgIHZhciBDQUNIRURfUFJPQyA9IGJhdGNoLmRlZihiYXRjaENhY2hlLCAnWycsIFBST0dfSUQsICddJylcbiAgICAgICAgYmF0Y2goXG4gICAgICAgICAgZW52LmNvbmQoQ0FDSEVEX1BST0MpXG4gICAgICAgICAgICAudGhlbihDQUNIRURfUFJPQywgJy5jYWxsKHRoaXMsYTAsYTEpOycpXG4gICAgICAgICAgICAuZWxzZShcbiAgICAgICAgICAgICAgQ0FDSEVEX1BST0MsICc9JywgYmF0Y2hDYWNoZSwgJ1snLCBQUk9HX0lELCAnXT0nLFxuICAgICAgICAgICAgICBlbnYubGluayhmdW5jdGlvbiAocHJvZ3JhbSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBjcmVhdGVCb2R5KGVtaXRCYXRjaEJvZHksIGVudiwgYXJncywgcHJvZ3JhbSwgMilcbiAgICAgICAgICAgICAgfSksICcoJywgUFJPR1JBTSwgJyk7JyxcbiAgICAgICAgICAgICAgQ0FDSEVEX1BST0MsICcuY2FsbCh0aGlzLGEwLGExKTsnKSlcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoT2JqZWN0LmtleXMoYXJncy5zdGF0ZSkubGVuZ3RoID4gMCkge1xuICAgICAgYmF0Y2goZW52LnNoYXJlZC5jdXJyZW50LCAnLmRpcnR5PXRydWU7JylcbiAgICB9XG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIFNDT1BFIENPTU1BTkRcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICBmdW5jdGlvbiBlbWl0U2NvcGVQcm9jIChlbnYsIGFyZ3MpIHtcbiAgICB2YXIgc2NvcGUgPSBlbnYucHJvYygnc2NvcGUnLCAzKVxuICAgIGVudi5iYXRjaElkID0gJ2EyJ1xuXG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcbiAgICB2YXIgQ1VSUkVOVF9TVEFURSA9IHNoYXJlZC5jdXJyZW50XG5cbiAgICBlbWl0Q29udGV4dChlbnYsIHNjb3BlLCBhcmdzLmNvbnRleHQpXG5cbiAgICBpZiAoYXJncy5mcmFtZWJ1ZmZlcikge1xuICAgICAgYXJncy5mcmFtZWJ1ZmZlci5hcHBlbmQoZW52LCBzY29wZSlcbiAgICB9XG5cbiAgICBzb3J0U3RhdGUoT2JqZWN0LmtleXMoYXJncy5zdGF0ZSkpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHZhciBkZWZuID0gYXJncy5zdGF0ZVtuYW1lXVxuICAgICAgdmFyIHZhbHVlID0gZGVmbi5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgIGlmIChpc0FycmF5TGlrZSh2YWx1ZSkpIHtcbiAgICAgICAgdmFsdWUuZm9yRWFjaChmdW5jdGlvbiAodiwgaSkge1xuICAgICAgICAgIHNjb3BlLnNldChlbnYubmV4dFtuYW1lXSwgJ1snICsgaSArICddJywgdilcbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNjb3BlLnNldChzaGFyZWQubmV4dCwgJy4nICsgbmFtZSwgdmFsdWUpXG4gICAgICB9XG4gICAgfSlcblxuICAgIGVtaXRQcm9maWxlKGVudiwgc2NvcGUsIGFyZ3MsIHRydWUsIHRydWUpXG5cbiAgICA7W1NfRUxFTUVOVFMsIFNfT0ZGU0VULCBTX0NPVU5ULCBTX0lOU1RBTkNFUywgU19QUklNSVRJVkVdLmZvckVhY2goXG4gICAgICBmdW5jdGlvbiAob3B0KSB7XG4gICAgICAgIHZhciB2YXJpYWJsZSA9IGFyZ3MuZHJhd1tvcHRdXG4gICAgICAgIGlmICghdmFyaWFibGUpIHtcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuICAgICAgICBzY29wZS5zZXQoc2hhcmVkLmRyYXcsICcuJyArIG9wdCwgJycgKyB2YXJpYWJsZS5hcHBlbmQoZW52LCBzY29wZSkpXG4gICAgICB9KVxuXG4gICAgT2JqZWN0LmtleXMoYXJncy51bmlmb3JtcykuZm9yRWFjaChmdW5jdGlvbiAob3B0KSB7XG4gICAgICBzY29wZS5zZXQoXG4gICAgICAgIHNoYXJlZC51bmlmb3JtcyxcbiAgICAgICAgJ1snICsgc3RyaW5nU3RvcmUuaWQob3B0KSArICddJyxcbiAgICAgICAgYXJncy51bmlmb3Jtc1tvcHRdLmFwcGVuZChlbnYsIHNjb3BlKSlcbiAgICB9KVxuXG4gICAgT2JqZWN0LmtleXMoYXJncy5hdHRyaWJ1dGVzKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICB2YXIgcmVjb3JkID0gYXJncy5hdHRyaWJ1dGVzW25hbWVdLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgdmFyIHNjb3BlQXR0cmliID0gZW52LnNjb3BlQXR0cmliKG5hbWUpXG4gICAgICBPYmplY3Qua2V5cyhuZXcgQXR0cmlidXRlUmVjb3JkKCkpLmZvckVhY2goZnVuY3Rpb24gKHByb3ApIHtcbiAgICAgICAgc2NvcGUuc2V0KHNjb3BlQXR0cmliLCAnLicgKyBwcm9wLCByZWNvcmRbcHJvcF0pXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBmdW5jdGlvbiBzYXZlU2hhZGVyIChuYW1lKSB7XG4gICAgICB2YXIgc2hhZGVyID0gYXJncy5zaGFkZXJbbmFtZV1cbiAgICAgIGlmIChzaGFkZXIpIHtcbiAgICAgICAgc2NvcGUuc2V0KHNoYXJlZC5zaGFkZXIsICcuJyArIG5hbWUsIHNoYWRlci5hcHBlbmQoZW52LCBzY29wZSkpXG4gICAgICB9XG4gICAgfVxuICAgIHNhdmVTaGFkZXIoU19WRVJUKVxuICAgIHNhdmVTaGFkZXIoU19GUkFHKVxuXG4gICAgaWYgKE9iamVjdC5rZXlzKGFyZ3Muc3RhdGUpLmxlbmd0aCA+IDApIHtcbiAgICAgIHNjb3BlKENVUlJFTlRfU1RBVEUsICcuZGlydHk9dHJ1ZTsnKVxuICAgICAgc2NvcGUuZXhpdChDVVJSRU5UX1NUQVRFLCAnLmRpcnR5PXRydWU7JylcbiAgICB9XG5cbiAgICBzY29wZSgnYTEoJywgZW52LnNoYXJlZC5jb250ZXh0LCAnLGEwLCcsIGVudi5iYXRjaElkLCAnKTsnKVxuICB9XG5cbiAgZnVuY3Rpb24gaXNEeW5hbWljT2JqZWN0IChvYmplY3QpIHtcbiAgICBpZiAodHlwZW9mIG9iamVjdCAhPT0gJ29iamVjdCcgfHwgaXNBcnJheUxpa2Uob2JqZWN0KSkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIHZhciBwcm9wcyA9IE9iamVjdC5rZXlzKG9iamVjdClcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHByb3BzLmxlbmd0aDsgKytpKSB7XG4gICAgICBpZiAoZHluYW1pYy5pc0R5bmFtaWMob2JqZWN0W3Byb3BzW2ldXSkpIHtcbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cblxuICBmdW5jdGlvbiBzcGxhdE9iamVjdCAoZW52LCBvcHRpb25zLCBuYW1lKSB7XG4gICAgdmFyIG9iamVjdCA9IG9wdGlvbnMuc3RhdGljW25hbWVdXG4gICAgaWYgKCFvYmplY3QgfHwgIWlzRHluYW1pY09iamVjdChvYmplY3QpKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICB2YXIgZ2xvYmFscyA9IGVudi5nbG9iYWxcbiAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKG9iamVjdClcbiAgICB2YXIgdGhpc0RlcCA9IGZhbHNlXG4gICAgdmFyIGNvbnRleHREZXAgPSBmYWxzZVxuICAgIHZhciBwcm9wRGVwID0gZmFsc2VcbiAgICB2YXIgb2JqZWN0UmVmID0gZW52Lmdsb2JhbC5kZWYoJ3t9JylcbiAgICBrZXlzLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgdmFyIHZhbHVlID0gb2JqZWN0W2tleV1cbiAgICAgIGlmIChkeW5hbWljLmlzRHluYW1pYyh2YWx1ZSkpIHtcbiAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgIHZhbHVlID0gb2JqZWN0W2tleV0gPSBkeW5hbWljLnVuYm94KHZhbHVlKVxuICAgICAgICB9XG4gICAgICAgIHZhciBkZXBzID0gY3JlYXRlRHluYW1pY0RlY2wodmFsdWUsIG51bGwpXG4gICAgICAgIHRoaXNEZXAgPSB0aGlzRGVwIHx8IGRlcHMudGhpc0RlcFxuICAgICAgICBwcm9wRGVwID0gcHJvcERlcCB8fCBkZXBzLnByb3BEZXBcbiAgICAgICAgY29udGV4dERlcCA9IGNvbnRleHREZXAgfHwgZGVwcy5jb250ZXh0RGVwXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBnbG9iYWxzKG9iamVjdFJlZiwgJy4nLCBrZXksICc9JylcbiAgICAgICAgc3dpdGNoICh0eXBlb2YgdmFsdWUpIHtcbiAgICAgICAgICBjYXNlICdudW1iZXInOlxuICAgICAgICAgICAgZ2xvYmFscyh2YWx1ZSlcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgICAgICAgIGdsb2JhbHMoJ1wiJywgdmFsdWUsICdcIicpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcbiAgICAgICAgICAgICAgZ2xvYmFscygnWycsIHZhbHVlLmpvaW4oKSwgJ10nKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgZ2xvYmFscyhlbnYubGluayh2YWx1ZSkpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICB9XG4gICAgICAgIGdsb2JhbHMoJzsnKVxuICAgICAgfVxuICAgIH0pXG5cbiAgICBmdW5jdGlvbiBhcHBlbmRCbG9jayAoZW52LCBibG9jaykge1xuICAgICAga2V5cy5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgdmFyIHZhbHVlID0gb2JqZWN0W2tleV1cbiAgICAgICAgaWYgKCFkeW5hbWljLmlzRHluYW1pYyh2YWx1ZSkpIHtcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuICAgICAgICB2YXIgcmVmID0gZW52Lmludm9rZShibG9jaywgdmFsdWUpXG4gICAgICAgIGJsb2NrKG9iamVjdFJlZiwgJy4nLCBrZXksICc9JywgcmVmLCAnOycpXG4gICAgICB9KVxuICAgIH1cblxuICAgIG9wdGlvbnMuZHluYW1pY1tuYW1lXSA9IG5ldyBkeW5hbWljLkR5bmFtaWNWYXJpYWJsZShEWU5fVEhVTkssIHtcbiAgICAgIHRoaXNEZXA6IHRoaXNEZXAsXG4gICAgICBjb250ZXh0RGVwOiBjb250ZXh0RGVwLFxuICAgICAgcHJvcERlcDogcHJvcERlcCxcbiAgICAgIHJlZjogb2JqZWN0UmVmLFxuICAgICAgYXBwZW5kOiBhcHBlbmRCbG9ja1xuICAgIH0pXG4gICAgZGVsZXRlIG9wdGlvbnMuc3RhdGljW25hbWVdXG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIE1BSU4gRFJBVyBDT01NQU5EXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgZnVuY3Rpb24gY29tcGlsZUNvbW1hbmQgKG9wdGlvbnMsIGF0dHJpYnV0ZXMsIHVuaWZvcm1zLCBjb250ZXh0LCBzdGF0cykge1xuICAgIHZhciBlbnYgPSBjcmVhdGVSRUdMRW52aXJvbm1lbnQoKVxuXG4gICAgLy8gbGluayBzdGF0cywgc28gdGhhdCB3ZSBjYW4gZWFzaWx5IGFjY2VzcyBpdCBpbiB0aGUgcHJvZ3JhbS5cbiAgICBlbnYuc3RhdHMgPSBlbnYubGluayhzdGF0cylcblxuICAgIC8vIHNwbGF0IG9wdGlvbnMgYW5kIGF0dHJpYnV0ZXMgdG8gYWxsb3cgZm9yIGR5bmFtaWMgbmVzdGVkIHByb3BlcnRpZXNcbiAgICBPYmplY3Qua2V5cyhhdHRyaWJ1dGVzLnN0YXRpYykuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICBzcGxhdE9iamVjdChlbnYsIGF0dHJpYnV0ZXMsIGtleSlcbiAgICB9KVxuICAgIE5FU1RFRF9PUFRJT05TLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHNwbGF0T2JqZWN0KGVudiwgb3B0aW9ucywgbmFtZSlcbiAgICB9KVxuXG4gICAgdmFyIGFyZ3MgPSBwYXJzZUFyZ3VtZW50cyhvcHRpb25zLCBhdHRyaWJ1dGVzLCB1bmlmb3JtcywgY29udGV4dCwgZW52KVxuXG4gICAgZW1pdERyYXdQcm9jKGVudiwgYXJncylcbiAgICBlbWl0U2NvcGVQcm9jKGVudiwgYXJncylcbiAgICBlbWl0QmF0Y2hQcm9jKGVudiwgYXJncylcblxuICAgIHJldHVybiBlbnYuY29tcGlsZSgpXG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIFBPTEwgLyBSRUZSRVNIXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgcmV0dXJuIHtcbiAgICBuZXh0OiBuZXh0U3RhdGUsXG4gICAgY3VycmVudDogY3VycmVudFN0YXRlLFxuICAgIHByb2NzOiAoZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIGVudiA9IGNyZWF0ZVJFR0xFbnZpcm9ubWVudCgpXG4gICAgICB2YXIgcG9sbCA9IGVudi5wcm9jKCdwb2xsJylcbiAgICAgIHZhciByZWZyZXNoID0gZW52LnByb2MoJ3JlZnJlc2gnKVxuICAgICAgdmFyIGNvbW1vbiA9IGVudi5ibG9jaygpXG4gICAgICBwb2xsKGNvbW1vbilcbiAgICAgIHJlZnJlc2goY29tbW9uKVxuXG4gICAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuICAgICAgdmFyIEdMID0gc2hhcmVkLmdsXG4gICAgICB2YXIgTkVYVF9TVEFURSA9IHNoYXJlZC5uZXh0XG4gICAgICB2YXIgQ1VSUkVOVF9TVEFURSA9IHNoYXJlZC5jdXJyZW50XG5cbiAgICAgIGNvbW1vbihDVVJSRU5UX1NUQVRFLCAnLmRpcnR5PWZhbHNlOycpXG5cbiAgICAgIGVtaXRQb2xsRnJhbWVidWZmZXIoZW52LCBwb2xsKVxuICAgICAgZW1pdFBvbGxGcmFtZWJ1ZmZlcihlbnYsIHJlZnJlc2gsIG51bGwsIHRydWUpXG5cbiAgICAgIC8vIFJlZnJlc2ggdXBkYXRlcyBhbGwgYXR0cmlidXRlIHN0YXRlIGNoYW5nZXNcbiAgICAgIHZhciBleHRJbnN0YW5jaW5nID0gZ2wuZ2V0RXh0ZW5zaW9uKCdhbmdsZV9pbnN0YW5jZWRfYXJyYXlzJylcbiAgICAgIHZhciBJTlNUQU5DSU5HXG4gICAgICBpZiAoZXh0SW5zdGFuY2luZykge1xuICAgICAgICBJTlNUQU5DSU5HID0gZW52LmxpbmsoZXh0SW5zdGFuY2luZylcbiAgICAgIH1cbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGltaXRzLm1heEF0dHJpYnV0ZXM7ICsraSkge1xuICAgICAgICB2YXIgQklORElORyA9IHJlZnJlc2guZGVmKHNoYXJlZC5hdHRyaWJ1dGVzLCAnWycsIGksICddJylcbiAgICAgICAgdmFyIGlmdGUgPSBlbnYuY29uZChCSU5ESU5HLCAnLmJ1ZmZlcicpXG4gICAgICAgIGlmdGUudGhlbihcbiAgICAgICAgICBHTCwgJy5lbmFibGVWZXJ0ZXhBdHRyaWJBcnJheSgnLCBpLCAnKTsnLFxuICAgICAgICAgIEdMLCAnLmJpbmRCdWZmZXIoJyxcbiAgICAgICAgICAgIEdMX0FSUkFZX0JVRkZFUiwgJywnLFxuICAgICAgICAgICAgQklORElORywgJy5idWZmZXIuYnVmZmVyKTsnLFxuICAgICAgICAgIEdMLCAnLnZlcnRleEF0dHJpYlBvaW50ZXIoJyxcbiAgICAgICAgICAgIGksICcsJyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcuc2l6ZSwnLFxuICAgICAgICAgICAgQklORElORywgJy50eXBlLCcsXG4gICAgICAgICAgICBCSU5ESU5HLCAnLm5vcm1hbGl6ZWQsJyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcuc3RyaWRlLCcsXG4gICAgICAgICAgICBCSU5ESU5HLCAnLm9mZnNldCk7J1xuICAgICAgICApLmVsc2UoXG4gICAgICAgICAgR0wsICcuZGlzYWJsZVZlcnRleEF0dHJpYkFycmF5KCcsIGksICcpOycsXG4gICAgICAgICAgR0wsICcudmVydGV4QXR0cmliNGYoJyxcbiAgICAgICAgICAgIGksICcsJyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcueCwnLFxuICAgICAgICAgICAgQklORElORywgJy55LCcsXG4gICAgICAgICAgICBCSU5ESU5HLCAnLnosJyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcudyk7JyxcbiAgICAgICAgICBCSU5ESU5HLCAnLmJ1ZmZlcj1udWxsOycpXG4gICAgICAgIHJlZnJlc2goaWZ0ZSlcbiAgICAgICAgaWYgKGV4dEluc3RhbmNpbmcpIHtcbiAgICAgICAgICByZWZyZXNoKFxuICAgICAgICAgICAgSU5TVEFOQ0lORywgJy52ZXJ0ZXhBdHRyaWJEaXZpc29yQU5HTEUoJyxcbiAgICAgICAgICAgIGksICcsJyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcuZGl2aXNvcik7JylcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBPYmplY3Qua2V5cyhHTF9GTEFHUykuZm9yRWFjaChmdW5jdGlvbiAoZmxhZykge1xuICAgICAgICB2YXIgY2FwID0gR0xfRkxBR1NbZmxhZ11cbiAgICAgICAgdmFyIE5FWFQgPSBjb21tb24uZGVmKE5FWFRfU1RBVEUsICcuJywgZmxhZylcbiAgICAgICAgdmFyIGJsb2NrID0gZW52LmJsb2NrKClcbiAgICAgICAgYmxvY2soJ2lmKCcsIE5FWFQsICcpeycsXG4gICAgICAgICAgR0wsICcuZW5hYmxlKCcsIGNhcCwgJyl9ZWxzZXsnLFxuICAgICAgICAgIEdMLCAnLmRpc2FibGUoJywgY2FwLCAnKX0nLFxuICAgICAgICAgIENVUlJFTlRfU1RBVEUsICcuJywgZmxhZywgJz0nLCBORVhULCAnOycpXG4gICAgICAgIHJlZnJlc2goYmxvY2spXG4gICAgICAgIHBvbGwoXG4gICAgICAgICAgJ2lmKCcsIE5FWFQsICchPT0nLCBDVVJSRU5UX1NUQVRFLCAnLicsIGZsYWcsICcpeycsXG4gICAgICAgICAgYmxvY2ssXG4gICAgICAgICAgJ30nKVxuICAgICAgfSlcblxuICAgICAgT2JqZWN0LmtleXMoR0xfVkFSSUFCTEVTKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICAgIHZhciBmdW5jID0gR0xfVkFSSUFCTEVTW25hbWVdXG4gICAgICAgIHZhciBpbml0ID0gY3VycmVudFN0YXRlW25hbWVdXG4gICAgICAgIHZhciBORVhULCBDVVJSRU5UXG4gICAgICAgIHZhciBibG9jayA9IGVudi5ibG9jaygpXG4gICAgICAgIGJsb2NrKEdMLCAnLicsIGZ1bmMsICcoJylcbiAgICAgICAgaWYgKGlzQXJyYXlMaWtlKGluaXQpKSB7XG4gICAgICAgICAgdmFyIG4gPSBpbml0Lmxlbmd0aFxuICAgICAgICAgIE5FWFQgPSBlbnYuZ2xvYmFsLmRlZihORVhUX1NUQVRFLCAnLicsIG5hbWUpXG4gICAgICAgICAgQ1VSUkVOVCA9IGVudi5nbG9iYWwuZGVmKENVUlJFTlRfU1RBVEUsICcuJywgbmFtZSlcbiAgICAgICAgICBibG9jayhcbiAgICAgICAgICAgIGxvb3AobiwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIE5FWFQgKyAnWycgKyBpICsgJ10nXG4gICAgICAgICAgICB9KSwgJyk7JyxcbiAgICAgICAgICAgIGxvb3AobiwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIENVUlJFTlQgKyAnWycgKyBpICsgJ109JyArIE5FWFQgKyAnWycgKyBpICsgJ107J1xuICAgICAgICAgICAgfSkuam9pbignJykpXG4gICAgICAgICAgcG9sbChcbiAgICAgICAgICAgICdpZignLCBsb29wKG4sIGZ1bmN0aW9uIChpKSB7XG4gICAgICAgICAgICAgIHJldHVybiBORVhUICsgJ1snICsgaSArICddIT09JyArIENVUlJFTlQgKyAnWycgKyBpICsgJ10nXG4gICAgICAgICAgICB9KS5qb2luKCd8fCcpLCAnKXsnLFxuICAgICAgICAgICAgYmxvY2ssXG4gICAgICAgICAgICAnfScpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgTkVYVCA9IGNvbW1vbi5kZWYoTkVYVF9TVEFURSwgJy4nLCBuYW1lKVxuICAgICAgICAgIENVUlJFTlQgPSBjb21tb24uZGVmKENVUlJFTlRfU1RBVEUsICcuJywgbmFtZSlcbiAgICAgICAgICBibG9jayhcbiAgICAgICAgICAgIE5FWFQsICcpOycsXG4gICAgICAgICAgICBDVVJSRU5UX1NUQVRFLCAnLicsIG5hbWUsICc9JywgTkVYVCwgJzsnKVxuICAgICAgICAgIHBvbGwoXG4gICAgICAgICAgICAnaWYoJywgTkVYVCwgJyE9PScsIENVUlJFTlQsICcpeycsXG4gICAgICAgICAgICBibG9jayxcbiAgICAgICAgICAgICd9JylcbiAgICAgICAgfVxuICAgICAgICByZWZyZXNoKGJsb2NrKVxuICAgICAgfSlcblxuICAgICAgcmV0dXJuIGVudi5jb21waWxlKClcbiAgICB9KSgpLFxuICAgIGNvbXBpbGU6IGNvbXBpbGVDb21tYW5kXG4gIH1cbn1cbiIsInZhciBWQVJJQUJMRV9DT1VOVEVSID0gMFxuXG52YXIgRFlOX0ZVTkMgPSAwXG5cbmZ1bmN0aW9uIER5bmFtaWNWYXJpYWJsZSAodHlwZSwgZGF0YSkge1xuICB0aGlzLmlkID0gKFZBUklBQkxFX0NPVU5URVIrKylcbiAgdGhpcy50eXBlID0gdHlwZVxuICB0aGlzLmRhdGEgPSBkYXRhXG59XG5cbmZ1bmN0aW9uIGVzY2FwZVN0ciAoc3RyKSB7XG4gIHJldHVybiBzdHIucmVwbGFjZSgvXFxcXC9nLCAnXFxcXFxcXFwnKS5yZXBsYWNlKC9cIi9nLCAnXFxcXFwiJylcbn1cblxuZnVuY3Rpb24gc3BsaXRQYXJ0cyAoc3RyKSB7XG4gIGlmIChzdHIubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIFtdXG4gIH1cblxuICB2YXIgZmlyc3RDaGFyID0gc3RyLmNoYXJBdCgwKVxuICB2YXIgbGFzdENoYXIgPSBzdHIuY2hhckF0KHN0ci5sZW5ndGggLSAxKVxuXG4gIGlmIChzdHIubGVuZ3RoID4gMSAmJlxuICAgICAgZmlyc3RDaGFyID09PSBsYXN0Q2hhciAmJlxuICAgICAgKGZpcnN0Q2hhciA9PT0gJ1wiJyB8fCBmaXJzdENoYXIgPT09IFwiJ1wiKSkge1xuICAgIHJldHVybiBbJ1wiJyArIGVzY2FwZVN0cihzdHIuc3Vic3RyKDEsIHN0ci5sZW5ndGggLSAyKSkgKyAnXCInXVxuICB9XG5cbiAgdmFyIHBhcnRzID0gL1xcWyhmYWxzZXx0cnVlfG51bGx8XFxkK3wnW14nXSonfFwiW15cIl0qXCIpXFxdLy5leGVjKHN0cilcbiAgaWYgKHBhcnRzKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHNwbGl0UGFydHMoc3RyLnN1YnN0cigwLCBwYXJ0cy5pbmRleCkpXG4gICAgICAuY29uY2F0KHNwbGl0UGFydHMocGFydHNbMV0pKVxuICAgICAgLmNvbmNhdChzcGxpdFBhcnRzKHN0ci5zdWJzdHIocGFydHMuaW5kZXggKyBwYXJ0c1swXS5sZW5ndGgpKSlcbiAgICApXG4gIH1cblxuICB2YXIgc3VicGFydHMgPSBzdHIuc3BsaXQoJy4nKVxuICBpZiAoc3VicGFydHMubGVuZ3RoID09PSAxKSB7XG4gICAgcmV0dXJuIFsnXCInICsgZXNjYXBlU3RyKHN0cikgKyAnXCInXVxuICB9XG5cbiAgdmFyIHJlc3VsdCA9IFtdXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3VicGFydHMubGVuZ3RoOyArK2kpIHtcbiAgICByZXN1bHQgPSByZXN1bHQuY29uY2F0KHNwbGl0UGFydHMoc3VicGFydHNbaV0pKVxuICB9XG4gIHJldHVybiByZXN1bHRcbn1cblxuZnVuY3Rpb24gdG9BY2Nlc3NvclN0cmluZyAoc3RyKSB7XG4gIHJldHVybiAnWycgKyBzcGxpdFBhcnRzKHN0cikuam9pbignXVsnKSArICddJ1xufVxuXG5mdW5jdGlvbiBkZWZpbmVEeW5hbWljICh0eXBlLCBkYXRhKSB7XG4gIHJldHVybiBuZXcgRHluYW1pY1ZhcmlhYmxlKHR5cGUsIHRvQWNjZXNzb3JTdHJpbmcoZGF0YSArICcnKSlcbn1cblxuZnVuY3Rpb24gaXNEeW5hbWljICh4KSB7XG4gIHJldHVybiAodHlwZW9mIHggPT09ICdmdW5jdGlvbicgJiYgIXguX3JlZ2xUeXBlKSB8fFxuICAgICAgICAgeCBpbnN0YW5jZW9mIER5bmFtaWNWYXJpYWJsZVxufVxuXG5mdW5jdGlvbiB1bmJveCAoeCwgcGF0aCkge1xuICBpZiAodHlwZW9mIHggPT09ICdmdW5jdGlvbicpIHtcbiAgICByZXR1cm4gbmV3IER5bmFtaWNWYXJpYWJsZShEWU5fRlVOQywgeClcbiAgfVxuICByZXR1cm4geFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgRHluYW1pY1ZhcmlhYmxlOiBEeW5hbWljVmFyaWFibGUsXG4gIGRlZmluZTogZGVmaW5lRHluYW1pYyxcbiAgaXNEeW5hbWljOiBpc0R5bmFtaWMsXG4gIHVuYm94OiB1bmJveCxcbiAgYWNjZXNzb3I6IHRvQWNjZXNzb3JTdHJpbmdcbn1cbiIsInZhciBjaGVjayA9IHJlcXVpcmUoJy4vdXRpbC9jaGVjaycpXG52YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi91dGlsL2lzLXR5cGVkLWFycmF5JylcbnZhciBpc05EQXJyYXlMaWtlID0gcmVxdWlyZSgnLi91dGlsL2lzLW5kYXJyYXknKVxudmFyIHZhbHVlcyA9IHJlcXVpcmUoJy4vdXRpbC92YWx1ZXMnKVxuXG52YXIgcHJpbVR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvcHJpbWl0aXZlcy5qc29uJylcbnZhciB1c2FnZVR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvdXNhZ2UuanNvbicpXG5cbnZhciBHTF9QT0lOVFMgPSAwXG52YXIgR0xfTElORVMgPSAxXG52YXIgR0xfVFJJQU5HTEVTID0gNFxuXG52YXIgR0xfQllURSA9IDUxMjBcbnZhciBHTF9VTlNJR05FRF9CWVRFID0gNTEyMVxudmFyIEdMX1NIT1JUID0gNTEyMlxudmFyIEdMX1VOU0lHTkVEX1NIT1JUID0gNTEyM1xudmFyIEdMX0lOVCA9IDUxMjRcbnZhciBHTF9VTlNJR05FRF9JTlQgPSA1MTI1XG5cbnZhciBHTF9FTEVNRU5UX0FSUkFZX0JVRkZFUiA9IDM0OTYzXG5cbnZhciBHTF9TVFJFQU1fRFJBVyA9IDB4ODhFMFxudmFyIEdMX1NUQVRJQ19EUkFXID0gMHg4OEU0XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcEVsZW1lbnRzU3RhdGUgKGdsLCBleHRlbnNpb25zLCBidWZmZXJTdGF0ZSwgc3RhdHMpIHtcbiAgdmFyIGVsZW1lbnRTZXQgPSB7fVxuICB2YXIgZWxlbWVudENvdW50ID0gMFxuXG4gIHZhciBlbGVtZW50VHlwZXMgPSB7XG4gICAgJ3VpbnQ4JzogR0xfVU5TSUdORURfQllURSxcbiAgICAndWludDE2JzogR0xfVU5TSUdORURfU0hPUlRcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLm9lc19lbGVtZW50X2luZGV4X3VpbnQpIHtcbiAgICBlbGVtZW50VHlwZXMudWludDMyID0gR0xfVU5TSUdORURfSU5UXG4gIH1cblxuICBmdW5jdGlvbiBSRUdMRWxlbWVudEJ1ZmZlciAoYnVmZmVyKSB7XG4gICAgdGhpcy5pZCA9IGVsZW1lbnRDb3VudCsrXG4gICAgZWxlbWVudFNldFt0aGlzLmlkXSA9IHRoaXNcbiAgICB0aGlzLmJ1ZmZlciA9IGJ1ZmZlclxuICAgIHRoaXMucHJpbVR5cGUgPSBHTF9UUklBTkdMRVNcbiAgICB0aGlzLnZlcnRDb3VudCA9IDBcbiAgICB0aGlzLnR5cGUgPSAwXG4gIH1cblxuICBSRUdMRWxlbWVudEJ1ZmZlci5wcm90b3R5cGUuYmluZCA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmJ1ZmZlci5iaW5kKClcbiAgfVxuXG4gIHZhciBidWZmZXJQb29sID0gW11cblxuICBmdW5jdGlvbiBjcmVhdGVFbGVtZW50U3RyZWFtIChkYXRhKSB7XG4gICAgdmFyIHJlc3VsdCA9IGJ1ZmZlclBvb2wucG9wKClcbiAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgcmVzdWx0ID0gbmV3IFJFR0xFbGVtZW50QnVmZmVyKGJ1ZmZlclN0YXRlLmNyZWF0ZShcbiAgICAgICAgbnVsbCxcbiAgICAgICAgR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIsXG4gICAgICAgIHRydWUsXG4gICAgICAgIGZhbHNlKS5fYnVmZmVyKVxuICAgIH1cbiAgICBpbml0RWxlbWVudHMocmVzdWx0LCBkYXRhLCBHTF9TVFJFQU1fRFJBVywgLTEsIC0xLCAwLCAwKVxuICAgIHJldHVybiByZXN1bHRcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3lFbGVtZW50U3RyZWFtIChlbGVtZW50cykge1xuICAgIGJ1ZmZlclBvb2wucHVzaChlbGVtZW50cylcbiAgfVxuXG4gIGZ1bmN0aW9uIGluaXRFbGVtZW50cyAoXG4gICAgZWxlbWVudHMsXG4gICAgZGF0YSxcbiAgICB1c2FnZSxcbiAgICBwcmltLFxuICAgIGNvdW50LFxuICAgIGJ5dGVMZW5ndGgsXG4gICAgdHlwZSkge1xuICAgIGVsZW1lbnRzLmJ1ZmZlci5iaW5kKClcbiAgICBpZiAoZGF0YSkge1xuICAgICAgdmFyIHByZWRpY3RlZFR5cGUgPSB0eXBlXG4gICAgICBpZiAoIXR5cGUgJiYgKFxuICAgICAgICAgICFpc1R5cGVkQXJyYXkoZGF0YSkgfHxcbiAgICAgICAgIChpc05EQXJyYXlMaWtlKGRhdGEpICYmICFpc1R5cGVkQXJyYXkoZGF0YS5kYXRhKSkpKSB7XG4gICAgICAgIHByZWRpY3RlZFR5cGUgPSBleHRlbnNpb25zLm9lc19lbGVtZW50X2luZGV4X3VpbnRcbiAgICAgICAgICA/IEdMX1VOU0lHTkVEX0lOVFxuICAgICAgICAgIDogR0xfVU5TSUdORURfU0hPUlRcbiAgICAgIH1cbiAgICAgIGJ1ZmZlclN0YXRlLl9pbml0QnVmZmVyKFxuICAgICAgICBlbGVtZW50cy5idWZmZXIsXG4gICAgICAgIGRhdGEsXG4gICAgICAgIHVzYWdlLFxuICAgICAgICBwcmVkaWN0ZWRUeXBlLFxuICAgICAgICAzKVxuICAgIH0gZWxzZSB7XG4gICAgICBnbC5idWZmZXJEYXRhKEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSLCBieXRlTGVuZ3RoLCB1c2FnZSlcbiAgICAgIGVsZW1lbnRzLmJ1ZmZlci5kdHlwZSA9IGR0eXBlIHx8IEdMX1VOU0lHTkVEX0JZVEVcbiAgICAgIGVsZW1lbnRzLmJ1ZmZlci51c2FnZSA9IHVzYWdlXG4gICAgICBlbGVtZW50cy5idWZmZXIuZGltZW5zaW9uID0gM1xuICAgICAgZWxlbWVudHMuYnVmZmVyLmJ5dGVMZW5ndGggPSBieXRlTGVuZ3RoXG4gICAgfVxuXG4gICAgdmFyIGR0eXBlID0gdHlwZVxuICAgIGlmICghdHlwZSkge1xuICAgICAgc3dpdGNoIChlbGVtZW50cy5idWZmZXIuZHR5cGUpIHtcbiAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9CWVRFOlxuICAgICAgICBjYXNlIEdMX0JZVEU6XG4gICAgICAgICAgZHR5cGUgPSBHTF9VTlNJR05FRF9CWVRFXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUOlxuICAgICAgICBjYXNlIEdMX1NIT1JUOlxuICAgICAgICAgIGR0eXBlID0gR0xfVU5TSUdORURfU0hPUlRcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfVU5TSUdORURfSU5UOlxuICAgICAgICBjYXNlIEdMX0lOVDpcbiAgICAgICAgICBkdHlwZSA9IEdMX1VOU0lHTkVEX0lOVFxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICBjaGVjay5yYWlzZSgndW5zdXBwb3J0ZWQgdHlwZSBmb3IgZWxlbWVudCBhcnJheScpXG4gICAgICB9XG4gICAgICBlbGVtZW50cy5idWZmZXIuZHR5cGUgPSBkdHlwZVxuICAgIH1cbiAgICBlbGVtZW50cy50eXBlID0gZHR5cGVcblxuICAgIC8vIENoZWNrIG9lc19lbGVtZW50X2luZGV4X3VpbnQgZXh0ZW5zaW9uXG4gICAgY2hlY2soXG4gICAgICBkdHlwZSAhPT0gR0xfVU5TSUdORURfSU5UIHx8XG4gICAgICAhIWV4dGVuc2lvbnMub2VzX2VsZW1lbnRfaW5kZXhfdWludCxcbiAgICAgICczMiBiaXQgZWxlbWVudCBidWZmZXJzIG5vdCBzdXBwb3J0ZWQsIGVuYWJsZSBvZXNfZWxlbWVudF9pbmRleF91aW50IGZpcnN0JylcblxuICAgIC8vIHRyeSB0byBndWVzcyBkZWZhdWx0IHByaW1pdGl2ZSB0eXBlIGFuZCBhcmd1bWVudHNcbiAgICB2YXIgdmVydENvdW50ID0gY291bnRcbiAgICBpZiAodmVydENvdW50IDwgMCkge1xuICAgICAgdmVydENvdW50ID0gZWxlbWVudHMuYnVmZmVyLmJ5dGVMZW5ndGhcbiAgICAgIGlmIChkdHlwZSA9PT0gR0xfVU5TSUdORURfU0hPUlQpIHtcbiAgICAgICAgdmVydENvdW50ID4+PSAxXG4gICAgICB9IGVsc2UgaWYgKGR0eXBlID09PSBHTF9VTlNJR05FRF9JTlQpIHtcbiAgICAgICAgdmVydENvdW50ID4+PSAyXG4gICAgICB9XG4gICAgfVxuICAgIGVsZW1lbnRzLnZlcnRDb3VudCA9IHZlcnRDb3VudFxuXG4gICAgLy8gdHJ5IHRvIGd1ZXNzIHByaW1pdGl2ZSB0eXBlIGZyb20gY2VsbCBkaW1lbnNpb25cbiAgICB2YXIgcHJpbVR5cGUgPSBwcmltXG4gICAgaWYgKHByaW0gPCAwKSB7XG4gICAgICBwcmltVHlwZSA9IEdMX1RSSUFOR0xFU1xuICAgICAgdmFyIGRpbWVuc2lvbiA9IGVsZW1lbnRzLmJ1ZmZlci5kaW1lbnNpb25cbiAgICAgIGlmIChkaW1lbnNpb24gPT09IDEpIHByaW1UeXBlID0gR0xfUE9JTlRTXG4gICAgICBpZiAoZGltZW5zaW9uID09PSAyKSBwcmltVHlwZSA9IEdMX0xJTkVTXG4gICAgICBpZiAoZGltZW5zaW9uID09PSAzKSBwcmltVHlwZSA9IEdMX1RSSUFOR0xFU1xuICAgIH1cbiAgICBlbGVtZW50cy5wcmltVHlwZSA9IHByaW1UeXBlXG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95RWxlbWVudHMgKGVsZW1lbnRzKSB7XG4gICAgc3RhdHMuZWxlbWVudHNDb3VudC0tXG5cbiAgICBjaGVjayhlbGVtZW50cy5idWZmZXIgIT09IG51bGwsICdtdXN0IG5vdCBkb3VibGUgZGVzdHJveSBlbGVtZW50cycpXG4gICAgZGVsZXRlIGVsZW1lbnRTZXRbZWxlbWVudHMuaWRdXG4gICAgZWxlbWVudHMuYnVmZmVyLmRlc3Ryb3koKVxuICAgIGVsZW1lbnRzLmJ1ZmZlciA9IG51bGxcbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZUVsZW1lbnRzIChvcHRpb25zLCBwZXJzaXN0ZW50KSB7XG4gICAgdmFyIGJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmNyZWF0ZShudWxsLCBHTF9FTEVNRU5UX0FSUkFZX0JVRkZFUiwgdHJ1ZSlcbiAgICB2YXIgZWxlbWVudHMgPSBuZXcgUkVHTEVsZW1lbnRCdWZmZXIoYnVmZmVyLl9idWZmZXIpXG4gICAgc3RhdHMuZWxlbWVudHNDb3VudCsrXG5cbiAgICBmdW5jdGlvbiByZWdsRWxlbWVudHMgKG9wdGlvbnMpIHtcbiAgICAgIGlmICghb3B0aW9ucykge1xuICAgICAgICBidWZmZXIoKVxuICAgICAgICBlbGVtZW50cy5wcmltVHlwZSA9IEdMX1RSSUFOR0xFU1xuICAgICAgICBlbGVtZW50cy52ZXJ0Q291bnQgPSAwXG4gICAgICAgIGVsZW1lbnRzLnR5cGUgPSBHTF9VTlNJR05FRF9CWVRFXG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBvcHRpb25zID09PSAnbnVtYmVyJykge1xuICAgICAgICBidWZmZXIob3B0aW9ucylcbiAgICAgICAgZWxlbWVudHMucHJpbVR5cGUgPSBHTF9UUklBTkdMRVNcbiAgICAgICAgZWxlbWVudHMudmVydENvdW50ID0gb3B0aW9ucyB8IDBcbiAgICAgICAgZWxlbWVudHMudHlwZSA9IEdMX1VOU0lHTkVEX0JZVEVcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBkYXRhID0gbnVsbFxuICAgICAgICB2YXIgdXNhZ2UgPSBHTF9TVEFUSUNfRFJBV1xuICAgICAgICB2YXIgcHJpbVR5cGUgPSAtMVxuICAgICAgICB2YXIgdmVydENvdW50ID0gLTFcbiAgICAgICAgdmFyIGJ5dGVMZW5ndGggPSAwXG4gICAgICAgIHZhciBkdHlwZSA9IDBcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkob3B0aW9ucykgfHxcbiAgICAgICAgICAgIGlzVHlwZWRBcnJheShvcHRpb25zKSB8fFxuICAgICAgICAgICAgaXNOREFycmF5TGlrZShvcHRpb25zKSkge1xuICAgICAgICAgIGRhdGEgPSBvcHRpb25zXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY2hlY2sudHlwZShvcHRpb25zLCAnb2JqZWN0JywgJ2ludmFsaWQgYXJndW1lbnRzIGZvciBlbGVtZW50cycpXG4gICAgICAgICAgaWYgKCdkYXRhJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBkYXRhID0gb3B0aW9ucy5kYXRhXG4gICAgICAgICAgICBjaGVjayhcbiAgICAgICAgICAgICAgICBBcnJheS5pc0FycmF5KGRhdGEpIHx8XG4gICAgICAgICAgICAgICAgaXNUeXBlZEFycmF5KGRhdGEpIHx8XG4gICAgICAgICAgICAgICAgaXNOREFycmF5TGlrZShkYXRhKSxcbiAgICAgICAgICAgICAgICAnaW52YWxpZCBkYXRhIGZvciBlbGVtZW50IGJ1ZmZlcicpXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgndXNhZ2UnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGNoZWNrLnBhcmFtZXRlcihcbiAgICAgICAgICAgICAgb3B0aW9ucy51c2FnZSxcbiAgICAgICAgICAgICAgdXNhZ2VUeXBlcyxcbiAgICAgICAgICAgICAgJ2ludmFsaWQgZWxlbWVudCBidWZmZXIgdXNhZ2UnKVxuICAgICAgICAgICAgdXNhZ2UgPSB1c2FnZVR5cGVzW29wdGlvbnMudXNhZ2VdXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgncHJpbWl0aXZlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBjaGVjay5wYXJhbWV0ZXIoXG4gICAgICAgICAgICAgIG9wdGlvbnMucHJpbWl0aXZlLFxuICAgICAgICAgICAgICBwcmltVHlwZXMsXG4gICAgICAgICAgICAgICdpbnZhbGlkIGVsZW1lbnQgYnVmZmVyIHByaW1pdGl2ZScpXG4gICAgICAgICAgICBwcmltVHlwZSA9IHByaW1UeXBlc1tvcHRpb25zLnByaW1pdGl2ZV1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCdjb3VudCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgY2hlY2soXG4gICAgICAgICAgICAgIHR5cGVvZiBvcHRpb25zLmNvdW50ID09PSAnbnVtYmVyJyAmJiBvcHRpb25zLmNvdW50ID49IDAsXG4gICAgICAgICAgICAgICdpbnZhbGlkIHZlcnRleCBjb3VudCBmb3IgZWxlbWVudHMnKVxuICAgICAgICAgICAgdmVydENvdW50ID0gb3B0aW9ucy5jb3VudCB8IDBcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCd0eXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBjaGVjay5wYXJhbWV0ZXIoXG4gICAgICAgICAgICAgIG9wdGlvbnMudHlwZSxcbiAgICAgICAgICAgICAgZWxlbWVudFR5cGVzLFxuICAgICAgICAgICAgICAnaW52YWxpZCBidWZmZXIgdHlwZScpXG4gICAgICAgICAgICBkdHlwZSA9IGVsZW1lbnRUeXBlc1tvcHRpb25zLnR5cGVdXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgnbGVuZ3RoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBieXRlTGVuZ3RoID0gb3B0aW9ucy5sZW5ndGggfCAwXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGJ5dGVMZW5ndGggPSB2ZXJ0Q291bnRcbiAgICAgICAgICAgIGlmIChkdHlwZSA9PT0gR0xfVU5TSUdORURfU0hPUlQgfHwgZHR5cGUgPT09IEdMX1NIT1JUKSB7XG4gICAgICAgICAgICAgIGJ5dGVMZW5ndGggKj0gMlxuICAgICAgICAgICAgfSBlbHNlIGlmIChkdHlwZSA9PT0gR0xfVU5TSUdORURfSU5UIHx8IGR0eXBlID09PSBHTF9JTlQpIHtcbiAgICAgICAgICAgICAgYnl0ZUxlbmd0aCAqPSA0XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGluaXRFbGVtZW50cyhcbiAgICAgICAgICBlbGVtZW50cyxcbiAgICAgICAgICBkYXRhLFxuICAgICAgICAgIHVzYWdlLFxuICAgICAgICAgIHByaW1UeXBlLFxuICAgICAgICAgIHZlcnRDb3VudCxcbiAgICAgICAgICBieXRlTGVuZ3RoLFxuICAgICAgICAgIGR0eXBlKVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmVnbEVsZW1lbnRzXG4gICAgfVxuXG4gICAgcmVnbEVsZW1lbnRzKG9wdGlvbnMpXG5cbiAgICByZWdsRWxlbWVudHMuX3JlZ2xUeXBlID0gJ2VsZW1lbnRzJ1xuICAgIHJlZ2xFbGVtZW50cy5fZWxlbWVudHMgPSBlbGVtZW50c1xuICAgIHJlZ2xFbGVtZW50cy5zdWJkYXRhID0gZnVuY3Rpb24gKGRhdGEsIG9mZnNldCkge1xuICAgICAgYnVmZmVyLnN1YmRhdGEoZGF0YSwgb2Zmc2V0KVxuICAgICAgcmV0dXJuIHJlZ2xFbGVtZW50c1xuICAgIH1cbiAgICByZWdsRWxlbWVudHMuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIGRlc3Ryb3lFbGVtZW50cyhlbGVtZW50cylcbiAgICB9XG5cbiAgICByZXR1cm4gcmVnbEVsZW1lbnRzXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNyZWF0ZTogY3JlYXRlRWxlbWVudHMsXG4gICAgY3JlYXRlU3RyZWFtOiBjcmVhdGVFbGVtZW50U3RyZWFtLFxuICAgIGRlc3Ryb3lTdHJlYW06IGRlc3Ryb3lFbGVtZW50U3RyZWFtLFxuICAgIGdldEVsZW1lbnRzOiBmdW5jdGlvbiAoZWxlbWVudHMpIHtcbiAgICAgIGlmICh0eXBlb2YgZWxlbWVudHMgPT09ICdmdW5jdGlvbicgJiZcbiAgICAgICAgICBlbGVtZW50cy5fZWxlbWVudHMgaW5zdGFuY2VvZiBSRUdMRWxlbWVudEJ1ZmZlcikge1xuICAgICAgICByZXR1cm4gZWxlbWVudHMuX2VsZW1lbnRzXG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH0sXG4gICAgY2xlYXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhbHVlcyhlbGVtZW50U2V0KS5mb3JFYWNoKGRlc3Ryb3lFbGVtZW50cylcbiAgICB9XG4gIH1cbn1cbiIsInZhciBjaGVjayA9IHJlcXVpcmUoJy4vdXRpbC9jaGVjaycpXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY3JlYXRlRXh0ZW5zaW9uQ2FjaGUgKGdsLCBjb25maWcpIHtcbiAgdmFyIGV4dGVuc2lvbnMgPSB7fVxuXG4gIGZ1bmN0aW9uIHRyeUxvYWRFeHRlbnNpb24gKG5hbWVfKSB7XG4gICAgY2hlY2sudHlwZShuYW1lXywgJ3N0cmluZycsICdleHRlbnNpb24gbmFtZSBtdXN0IGJlIHN0cmluZycpXG4gICAgdmFyIG5hbWUgPSBuYW1lXy50b0xvd2VyQ2FzZSgpXG4gICAgdmFyIGV4dFxuICAgIHRyeSB7XG4gICAgICBleHQgPSBleHRlbnNpb25zW25hbWVdID0gZ2wuZ2V0RXh0ZW5zaW9uKG5hbWUpXG4gICAgfSBjYXRjaCAoZSkge31cbiAgICByZXR1cm4gISFleHRcbiAgfVxuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgY29uZmlnLmV4dGVuc2lvbnMubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgbmFtZSA9IGNvbmZpZy5leHRlbnNpb25zW2ldXG4gICAgaWYgKCF0cnlMb2FkRXh0ZW5zaW9uKG5hbWUpKSB7XG4gICAgICBjb25maWcub25EZXN0cm95KClcbiAgICAgIGNvbmZpZy5vbkRvbmUoJ1wiJyArIG5hbWUgKyAnXCIgZXh0ZW5zaW9uIGlzIG5vdCBzdXBwb3J0ZWQgYnkgdGhlIGN1cnJlbnQgV2ViR0wgY29udGV4dCwgdHJ5IHVwZ3JhZGluZyB5b3VyIHN5c3RlbSBvciBhIGRpZmZlcmVudCBicm93c2VyJylcbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuICB9XG5cbiAgY29uZmlnLm9wdGlvbmFsRXh0ZW5zaW9ucy5mb3JFYWNoKHRyeUxvYWRFeHRlbnNpb24pXG5cbiAgcmV0dXJuIHtcbiAgICBleHRlbnNpb25zOiBleHRlbnNpb25zLFxuICAgIHJlc3RvcmU6IGZ1bmN0aW9uICgpIHtcbiAgICAgIE9iamVjdC5rZXlzKGV4dGVuc2lvbnMpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgaWYgKCF0cnlMb2FkRXh0ZW5zaW9uKG5hbWUpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCcocmVnbCk6IGVycm9yIHJlc3RvcmluZyBleHRlbnNpb24gJyArIG5hbWUpXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgfVxuICB9XG59XG4iLCJ2YXIgY2hlY2sgPSByZXF1aXJlKCcuL3V0aWwvY2hlY2snKVxudmFyIHZhbHVlcyA9IHJlcXVpcmUoJy4vdXRpbC92YWx1ZXMnKVxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vdXRpbC9leHRlbmQnKVxuXG4vLyBXZSBzdG9yZSB0aGVzZSBjb25zdGFudHMgc28gdGhhdCB0aGUgbWluaWZpZXIgY2FuIGlubGluZSB0aGVtXG52YXIgR0xfRlJBTUVCVUZGRVIgPSAweDhENDBcbnZhciBHTF9SRU5ERVJCVUZGRVIgPSAweDhENDFcblxudmFyIEdMX1RFWFRVUkVfMkQgPSAweDBERTFcbnZhciBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1ggPSAweDg1MTVcblxudmFyIEdMX0NPTE9SX0FUVEFDSE1FTlQwID0gMHg4Q0UwXG52YXIgR0xfREVQVEhfQVRUQUNITUVOVCA9IDB4OEQwMFxudmFyIEdMX1NURU5DSUxfQVRUQUNITUVOVCA9IDB4OEQyMFxudmFyIEdMX0RFUFRIX1NURU5DSUxfQVRUQUNITUVOVCA9IDB4ODIxQVxuXG52YXIgR0xfRlJBTUVCVUZGRVJfQ09NUExFVEUgPSAweDhDRDVcbnZhciBHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX0FUVEFDSE1FTlQgPSAweDhDRDZcbnZhciBHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX01JU1NJTkdfQVRUQUNITUVOVCA9IDB4OENEN1xudmFyIEdMX0ZSQU1FQlVGRkVSX0lOQ09NUExFVEVfRElNRU5TSU9OUyA9IDB4OENEOVxudmFyIEdMX0ZSQU1FQlVGRkVSX1VOU1VQUE9SVEVEID0gMHg4Q0REXG5cbnZhciBHTF9IQUxGX0ZMT0FUX09FUyA9IDB4OEQ2MVxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSAweDE0MDFcbnZhciBHTF9GTE9BVCA9IDB4MTQwNlxuXG52YXIgR0xfUkdCQSA9IDB4MTkwOFxuXG52YXIgR0xfREVQVEhfQ09NUE9ORU5UID0gMHgxOTAyXG5cbnZhciBjb2xvclRleHR1cmVGb3JtYXRFbnVtcyA9IFtcbiAgR0xfUkdCQVxuXVxuXG4vLyBmb3IgZXZlcnkgdGV4dHVyZSBmb3JtYXQsIHN0b3JlXG4vLyB0aGUgbnVtYmVyIG9mIGNoYW5uZWxzXG52YXIgdGV4dHVyZUZvcm1hdENoYW5uZWxzID0gW11cbnRleHR1cmVGb3JtYXRDaGFubmVsc1tHTF9SR0JBXSA9IDRcblxuLy8gZm9yIGV2ZXJ5IHRleHR1cmUgdHlwZSwgc3RvcmVcbi8vIHRoZSBzaXplIGluIGJ5dGVzLlxudmFyIHRleHR1cmVUeXBlU2l6ZXMgPSBbXVxudGV4dHVyZVR5cGVTaXplc1tHTF9VTlNJR05FRF9CWVRFXSA9IDFcbnRleHR1cmVUeXBlU2l6ZXNbR0xfRkxPQVRdID0gNFxudGV4dHVyZVR5cGVTaXplc1tHTF9IQUxGX0ZMT0FUX09FU10gPSAyXG5cbnZhciBHTF9SR0JBNCA9IDB4ODA1NlxudmFyIEdMX1JHQjVfQTEgPSAweDgwNTdcbnZhciBHTF9SR0I1NjUgPSAweDhENjJcbnZhciBHTF9ERVBUSF9DT01QT05FTlQxNiA9IDB4ODFBNVxudmFyIEdMX1NURU5DSUxfSU5ERVg4ID0gMHg4RDQ4XG52YXIgR0xfREVQVEhfU1RFTkNJTCA9IDB4ODRGOVxuXG52YXIgR0xfU1JHQjhfQUxQSEE4X0VYVCA9IDB4OEM0M1xuXG52YXIgR0xfUkdCQTMyRl9FWFQgPSAweDg4MTRcblxudmFyIEdMX1JHQkExNkZfRVhUID0gMHg4ODFBXG52YXIgR0xfUkdCMTZGX0VYVCA9IDB4ODgxQlxuXG52YXIgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRFbnVtcyA9IFtcbiAgR0xfUkdCQTQsXG4gIEdMX1JHQjVfQTEsXG4gIEdMX1JHQjU2NSxcbiAgR0xfU1JHQjhfQUxQSEE4X0VYVCxcbiAgR0xfUkdCQTE2Rl9FWFQsXG4gIEdMX1JHQjE2Rl9FWFQsXG4gIEdMX1JHQkEzMkZfRVhUXG5dXG5cbnZhciBzdGF0dXNDb2RlID0ge31cbnN0YXR1c0NvZGVbR0xfRlJBTUVCVUZGRVJfQ09NUExFVEVdID0gJ2NvbXBsZXRlJ1xuc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX0FUVEFDSE1FTlRdID0gJ2luY29tcGxldGUgYXR0YWNobWVudCdcbnN0YXR1c0NvZGVbR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9ESU1FTlNJT05TXSA9ICdpbmNvbXBsZXRlIGRpbWVuc2lvbnMnXG5zdGF0dXNDb2RlW0dMX0ZSQU1FQlVGRkVSX0lOQ09NUExFVEVfTUlTU0lOR19BVFRBQ0hNRU5UXSA9ICdpbmNvbXBsZXRlLCBtaXNzaW5nIGF0dGFjaG1lbnQnXG5zdGF0dXNDb2RlW0dMX0ZSQU1FQlVGRkVSX1VOU1VQUE9SVEVEXSA9ICd1bnN1cHBvcnRlZCdcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwRkJPU3RhdGUgKFxuICBnbCxcbiAgZXh0ZW5zaW9ucyxcbiAgbGltaXRzLFxuICB0ZXh0dXJlU3RhdGUsXG4gIHJlbmRlcmJ1ZmZlclN0YXRlLFxuICBzdGF0cykge1xuICB2YXIgZnJhbWVidWZmZXJTdGF0ZSA9IHtcbiAgICBjdXI6IG51bGwsXG4gICAgbmV4dDogbnVsbCxcbiAgICBkaXJ0eTogZmFsc2UsXG4gICAgc2V0RkJPOiBudWxsXG4gIH1cblxuICB2YXIgY29sb3JUZXh0dXJlRm9ybWF0cyA9IFsncmdiYSddXG4gIHZhciBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHMgPSBbJ3JnYmE0JywgJ3JnYjU2NScsICdyZ2I1IGExJ11cblxuICBpZiAoZXh0ZW5zaW9ucy5leHRfc3JnYikge1xuICAgIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0cy5wdXNoKCdzcmdiYScpXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5leHRfY29sb3JfYnVmZmVyX2hhbGZfZmxvYXQpIHtcbiAgICBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHMucHVzaCgncmdiYTE2ZicsICdyZ2IxNmYnKVxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29sb3JfYnVmZmVyX2Zsb2F0KSB7XG4gICAgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzLnB1c2goJ3JnYmEzMmYnKVxuICB9XG5cbiAgdmFyIGNvbG9yVHlwZXMgPSBbJ3VpbnQ4J11cbiAgaWYgKGV4dGVuc2lvbnMub2VzX3RleHR1cmVfaGFsZl9mbG9hdCkge1xuICAgIGNvbG9yVHlwZXMucHVzaCgnaGFsZiBmbG9hdCcsICdmbG9hdDE2JylcbiAgfVxuICBpZiAoZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9mbG9hdCkge1xuICAgIGNvbG9yVHlwZXMucHVzaCgnZmxvYXQnLCAnZmxvYXQzMicpXG4gIH1cblxuICBmdW5jdGlvbiBGcmFtZWJ1ZmZlckF0dGFjaG1lbnQgKHRhcmdldCwgdGV4dHVyZSwgcmVuZGVyYnVmZmVyKSB7XG4gICAgdGhpcy50YXJnZXQgPSB0YXJnZXRcbiAgICB0aGlzLnRleHR1cmUgPSB0ZXh0dXJlXG4gICAgdGhpcy5yZW5kZXJidWZmZXIgPSByZW5kZXJidWZmZXJcblxuICAgIHZhciB3ID0gMFxuICAgIHZhciBoID0gMFxuICAgIGlmICh0ZXh0dXJlKSB7XG4gICAgICB3ID0gdGV4dHVyZS53aWR0aFxuICAgICAgaCA9IHRleHR1cmUuaGVpZ2h0XG4gICAgfSBlbHNlIGlmIChyZW5kZXJidWZmZXIpIHtcbiAgICAgIHcgPSByZW5kZXJidWZmZXIud2lkdGhcbiAgICAgIGggPSByZW5kZXJidWZmZXIuaGVpZ2h0XG4gICAgfVxuICAgIHRoaXMud2lkdGggPSB3XG4gICAgdGhpcy5oZWlnaHQgPSBoXG4gIH1cblxuICBmdW5jdGlvbiBkZWNSZWYgKGF0dGFjaG1lbnQpIHtcbiAgICBpZiAoYXR0YWNobWVudCkge1xuICAgICAgaWYgKGF0dGFjaG1lbnQudGV4dHVyZSkge1xuICAgICAgICBhdHRhY2htZW50LnRleHR1cmUuX3RleHR1cmUuZGVjUmVmKClcbiAgICAgIH1cbiAgICAgIGlmIChhdHRhY2htZW50LnJlbmRlcmJ1ZmZlcikge1xuICAgICAgICBhdHRhY2htZW50LnJlbmRlcmJ1ZmZlci5fcmVuZGVyYnVmZmVyLmRlY1JlZigpXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaW5jUmVmQW5kQ2hlY2tTaGFwZSAoYXR0YWNobWVudCwgd2lkdGgsIGhlaWdodCkge1xuICAgIGlmICghYXR0YWNobWVudCkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIGlmIChhdHRhY2htZW50LnRleHR1cmUpIHtcbiAgICAgIHZhciB0ZXh0dXJlID0gYXR0YWNobWVudC50ZXh0dXJlLl90ZXh0dXJlXG4gICAgICB2YXIgdHcgPSBNYXRoLm1heCgxLCB0ZXh0dXJlLndpZHRoKVxuICAgICAgdmFyIHRoID0gTWF0aC5tYXgoMSwgdGV4dHVyZS5oZWlnaHQpXG4gICAgICBjaGVjayh0dyA9PT0gd2lkdGggJiYgdGggPT09IGhlaWdodCxcbiAgICAgICAgJ2luY29uc2lzdGVudCB3aWR0aC9oZWlnaHQgZm9yIHN1cHBsaWVkIHRleHR1cmUnKVxuICAgICAgdGV4dHVyZS5yZWZDb3VudCArPSAxXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciByZW5kZXJidWZmZXIgPSBhdHRhY2htZW50LnJlbmRlcmJ1ZmZlci5fcmVuZGVyYnVmZmVyXG4gICAgICBjaGVjayhcbiAgICAgICAgcmVuZGVyYnVmZmVyLndpZHRoID09PSB3aWR0aCAmJiByZW5kZXJidWZmZXIuaGVpZ2h0ID09PSBoZWlnaHQsXG4gICAgICAgICdpbmNvbnNpc3RlbnQgd2lkdGgvaGVpZ2h0IGZvciByZW5kZXJidWZmZXInKVxuICAgICAgcmVuZGVyYnVmZmVyLnJlZkNvdW50ICs9IDFcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBhdHRhY2ggKGxvY2F0aW9uLCBhdHRhY2htZW50KSB7XG4gICAgaWYgKGF0dGFjaG1lbnQpIHtcbiAgICAgIGlmIChhdHRhY2htZW50LnRleHR1cmUpIHtcbiAgICAgICAgZ2wuZnJhbWVidWZmZXJUZXh0dXJlMkQoXG4gICAgICAgICAgR0xfRlJBTUVCVUZGRVIsXG4gICAgICAgICAgbG9jYXRpb24sXG4gICAgICAgICAgYXR0YWNobWVudC50YXJnZXQsXG4gICAgICAgICAgYXR0YWNobWVudC50ZXh0dXJlLl90ZXh0dXJlLnRleHR1cmUsXG4gICAgICAgICAgMClcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGdsLmZyYW1lYnVmZmVyUmVuZGVyYnVmZmVyKFxuICAgICAgICAgIEdMX0ZSQU1FQlVGRkVSLFxuICAgICAgICAgIGxvY2F0aW9uLFxuICAgICAgICAgIEdMX1JFTkRFUkJVRkZFUixcbiAgICAgICAgICBhdHRhY2htZW50LnJlbmRlcmJ1ZmZlci5fcmVuZGVyYnVmZmVyLnJlbmRlcmJ1ZmZlcilcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZUF0dGFjaG1lbnQgKGF0dGFjaG1lbnQpIHtcbiAgICB2YXIgdGFyZ2V0ID0gR0xfVEVYVFVSRV8yRFxuICAgIHZhciB0ZXh0dXJlID0gbnVsbFxuICAgIHZhciByZW5kZXJidWZmZXIgPSBudWxsXG5cbiAgICB2YXIgZGF0YSA9IGF0dGFjaG1lbnRcbiAgICBpZiAodHlwZW9mIGF0dGFjaG1lbnQgPT09ICdvYmplY3QnKSB7XG4gICAgICBkYXRhID0gYXR0YWNobWVudC5kYXRhXG4gICAgICBpZiAoJ3RhcmdldCcgaW4gYXR0YWNobWVudCkge1xuICAgICAgICB0YXJnZXQgPSBhdHRhY2htZW50LnRhcmdldCB8IDBcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjaGVjay50eXBlKGRhdGEsICdmdW5jdGlvbicsICdpbnZhbGlkIGF0dGFjaG1lbnQgZGF0YScpXG5cbiAgICB2YXIgdHlwZSA9IGRhdGEuX3JlZ2xUeXBlXG4gICAgaWYgKHR5cGUgPT09ICd0ZXh0dXJlMmQnKSB7XG4gICAgICB0ZXh0dXJlID0gZGF0YVxuICAgICAgY2hlY2sodGFyZ2V0ID09PSBHTF9URVhUVVJFXzJEKVxuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3RleHR1cmVDdWJlJykge1xuICAgICAgdGV4dHVyZSA9IGRhdGFcbiAgICAgIGNoZWNrKFxuICAgICAgICB0YXJnZXQgPj0gR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YICYmXG4gICAgICAgIHRhcmdldCA8IEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCArIDYsXG4gICAgICAgICdpbnZhbGlkIGN1YmUgbWFwIHRhcmdldCcpXG4gICAgfSBlbHNlIGlmICh0eXBlID09PSAncmVuZGVyYnVmZmVyJykge1xuICAgICAgcmVuZGVyYnVmZmVyID0gZGF0YVxuICAgICAgdGFyZ2V0ID0gR0xfUkVOREVSQlVGRkVSXG4gICAgfSBlbHNlIHtcbiAgICAgIGNoZWNrLnJhaXNlKCdpbnZhbGlkIHJlZ2wgb2JqZWN0IGZvciBhdHRhY2htZW50JylcbiAgICB9XG5cbiAgICByZXR1cm4gbmV3IEZyYW1lYnVmZmVyQXR0YWNobWVudCh0YXJnZXQsIHRleHR1cmUsIHJlbmRlcmJ1ZmZlcilcbiAgfVxuXG4gIGZ1bmN0aW9uIGFsbG9jQXR0YWNobWVudCAoXG4gICAgd2lkdGgsXG4gICAgaGVpZ2h0LFxuICAgIGlzVGV4dHVyZSxcbiAgICBmb3JtYXQsXG4gICAgdHlwZSkge1xuICAgIGlmIChpc1RleHR1cmUpIHtcbiAgICAgIHZhciB0ZXh0dXJlID0gdGV4dHVyZVN0YXRlLmNyZWF0ZTJEKHtcbiAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICBoZWlnaHQ6IGhlaWdodCxcbiAgICAgICAgZm9ybWF0OiBmb3JtYXQsXG4gICAgICAgIHR5cGU6IHR5cGVcbiAgICAgIH0pXG4gICAgICB0ZXh0dXJlLl90ZXh0dXJlLnJlZkNvdW50ID0gMFxuICAgICAgcmV0dXJuIG5ldyBGcmFtZWJ1ZmZlckF0dGFjaG1lbnQoR0xfVEVYVFVSRV8yRCwgdGV4dHVyZSwgbnVsbClcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIHJiID0gcmVuZGVyYnVmZmVyU3RhdGUuY3JlYXRlKHtcbiAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICBoZWlnaHQ6IGhlaWdodCxcbiAgICAgICAgZm9ybWF0OiBmb3JtYXRcbiAgICAgIH0pXG4gICAgICByYi5fcmVuZGVyYnVmZmVyLnJlZkNvdW50ID0gMFxuICAgICAgcmV0dXJuIG5ldyBGcmFtZWJ1ZmZlckF0dGFjaG1lbnQoR0xfUkVOREVSQlVGRkVSLCBudWxsLCByYilcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiB1bndyYXBBdHRhY2htZW50IChhdHRhY2htZW50KSB7XG4gICAgcmV0dXJuIGF0dGFjaG1lbnQgJiYgKGF0dGFjaG1lbnQudGV4dHVyZSB8fCBhdHRhY2htZW50LnJlbmRlcmJ1ZmZlcilcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlc2l6ZUF0dGFjaG1lbnQgKGF0dGFjaG1lbnQsIHcsIGgpIHtcbiAgICBpZiAoYXR0YWNobWVudCkge1xuICAgICAgaWYgKGF0dGFjaG1lbnQudGV4dHVyZSkge1xuICAgICAgICBhdHRhY2htZW50LnRleHR1cmUucmVzaXplKHcsIGgpXG4gICAgICB9IGVsc2UgaWYgKGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyKSB7XG4gICAgICAgIGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyLnJlc2l6ZSh3LCBoKVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHZhciBmcmFtZWJ1ZmZlckNvdW50ID0gMFxuICB2YXIgZnJhbWVidWZmZXJTZXQgPSB7fVxuXG4gIGZ1bmN0aW9uIFJFR0xGcmFtZWJ1ZmZlciAoKSB7XG4gICAgdGhpcy5pZCA9IGZyYW1lYnVmZmVyQ291bnQrK1xuICAgIGZyYW1lYnVmZmVyU2V0W3RoaXMuaWRdID0gdGhpc1xuXG4gICAgdGhpcy5mcmFtZWJ1ZmZlciA9IGdsLmNyZWF0ZUZyYW1lYnVmZmVyKClcbiAgICB0aGlzLndpZHRoID0gMFxuICAgIHRoaXMuaGVpZ2h0ID0gMFxuXG4gICAgdGhpcy5jb2xvckF0dGFjaG1lbnRzID0gW11cbiAgICB0aGlzLmRlcHRoQXR0YWNobWVudCA9IG51bGxcbiAgICB0aGlzLnN0ZW5jaWxBdHRhY2htZW50ID0gbnVsbFxuICAgIHRoaXMuZGVwdGhTdGVuY2lsQXR0YWNobWVudCA9IG51bGxcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlY0ZCT1JlZnMgKGZyYW1lYnVmZmVyKSB7XG4gICAgZnJhbWVidWZmZXIuY29sb3JBdHRhY2htZW50cy5mb3JFYWNoKGRlY1JlZilcbiAgICBkZWNSZWYoZnJhbWVidWZmZXIuZGVwdGhBdHRhY2htZW50KVxuICAgIGRlY1JlZihmcmFtZWJ1ZmZlci5zdGVuY2lsQXR0YWNobWVudClcbiAgICBkZWNSZWYoZnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsQXR0YWNobWVudClcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3kgKGZyYW1lYnVmZmVyKSB7XG4gICAgdmFyIGhhbmRsZSA9IGZyYW1lYnVmZmVyLmZyYW1lYnVmZmVyXG4gICAgY2hlY2soaGFuZGxlLCAnbXVzdCBub3QgZG91YmxlIGRlc3Ryb3kgZnJhbWVidWZmZXInKVxuICAgIGdsLmRlbGV0ZUZyYW1lYnVmZmVyKGhhbmRsZSlcbiAgICBmcmFtZWJ1ZmZlci5mcmFtZWJ1ZmZlciA9IG51bGxcbiAgICBzdGF0cy5mcmFtZWJ1ZmZlckNvdW50LS1cbiAgICBkZWxldGUgZnJhbWVidWZmZXJTZXRbZnJhbWVidWZmZXIuaWRdXG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVGcmFtZWJ1ZmZlciAoZnJhbWVidWZmZXIpIHtcbiAgICB2YXIgaVxuXG4gICAgZ2wuYmluZEZyYW1lYnVmZmVyKEdMX0ZSQU1FQlVGRkVSLCBmcmFtZWJ1ZmZlci5mcmFtZWJ1ZmZlcilcbiAgICB2YXIgY29sb3JBdHRhY2htZW50cyA9IGZyYW1lYnVmZmVyLmNvbG9yQXR0YWNobWVudHNcbiAgICBmb3IgKGkgPSAwOyBpIDwgY29sb3JBdHRhY2htZW50cy5sZW5ndGg7ICsraSkge1xuICAgICAgYXR0YWNoKEdMX0NPTE9SX0FUVEFDSE1FTlQwICsgaSwgY29sb3JBdHRhY2htZW50c1tpXSlcbiAgICB9XG4gICAgZm9yIChpID0gY29sb3JBdHRhY2htZW50cy5sZW5ndGg7IGkgPCBsaW1pdHMubWF4Q29sb3JBdHRhY2htZW50czsgKytpKSB7XG4gICAgICBnbC5mcmFtZWJ1ZmZlclRleHR1cmUyRChcbiAgICAgICAgR0xfRlJBTUVCVUZGRVIsXG4gICAgICAgIEdMX0NPTE9SX0FUVEFDSE1FTlQwICsgaSxcbiAgICAgICAgR0xfVEVYVFVSRV8yRCxcbiAgICAgICAgbnVsbCxcbiAgICAgICAgMClcbiAgICB9XG5cbiAgICBnbC5mcmFtZWJ1ZmZlclRleHR1cmUyRChcbiAgICAgIEdMX0ZSQU1FQlVGRkVSLFxuICAgICAgR0xfREVQVEhfU1RFTkNJTF9BVFRBQ0hNRU5ULFxuICAgICAgR0xfVEVYVFVSRV8yRCxcbiAgICAgIG51bGwsXG4gICAgICAwKVxuICAgIGdsLmZyYW1lYnVmZmVyVGV4dHVyZTJEKFxuICAgICAgR0xfRlJBTUVCVUZGRVIsXG4gICAgICBHTF9ERVBUSF9BVFRBQ0hNRU5ULFxuICAgICAgR0xfVEVYVFVSRV8yRCxcbiAgICAgIG51bGwsXG4gICAgICAwKVxuICAgIGdsLmZyYW1lYnVmZmVyVGV4dHVyZTJEKFxuICAgICAgR0xfRlJBTUVCVUZGRVIsXG4gICAgICBHTF9TVEVOQ0lMX0FUVEFDSE1FTlQsXG4gICAgICBHTF9URVhUVVJFXzJELFxuICAgICAgbnVsbCxcbiAgICAgIDApXG5cbiAgICBhdHRhY2goR0xfREVQVEhfQVRUQUNITUVOVCwgZnJhbWVidWZmZXIuZGVwdGhBdHRhY2htZW50KVxuICAgIGF0dGFjaChHTF9TVEVOQ0lMX0FUVEFDSE1FTlQsIGZyYW1lYnVmZmVyLnN0ZW5jaWxBdHRhY2htZW50KVxuICAgIGF0dGFjaChHTF9ERVBUSF9TVEVOQ0lMX0FUVEFDSE1FTlQsIGZyYW1lYnVmZmVyLmRlcHRoU3RlbmNpbEF0dGFjaG1lbnQpXG5cbiAgICAvLyBDaGVjayBzdGF0dXMgY29kZVxuICAgIHZhciBzdGF0dXMgPSBnbC5jaGVja0ZyYW1lYnVmZmVyU3RhdHVzKEdMX0ZSQU1FQlVGRkVSKVxuICAgIGlmIChzdGF0dXMgIT09IEdMX0ZSQU1FQlVGRkVSX0NPTVBMRVRFKSB7XG4gICAgICBjaGVjay5yYWlzZSgnZnJhbWVidWZmZXIgY29uZmlndXJhdGlvbiBub3Qgc3VwcG9ydGVkLCBzdGF0dXMgPSAnICtcbiAgICAgICAgc3RhdHVzQ29kZVtzdGF0dXNdKVxuICAgIH1cblxuICAgIGdsLmJpbmRGcmFtZWJ1ZmZlcihHTF9GUkFNRUJVRkZFUiwgZnJhbWVidWZmZXJTdGF0ZS5uZXh0KVxuICAgIGZyYW1lYnVmZmVyU3RhdGUuY3VyID0gZnJhbWVidWZmZXJTdGF0ZS5uZXh0XG5cbiAgICAvLyBGSVhNRTogQ2xlYXIgZXJyb3IgY29kZSBoZXJlLiAgVGhpcyBpcyBhIHdvcmsgYXJvdW5kIGZvciBhIGJ1ZyBpblxuICAgIC8vIGhlYWRsZXNzLWdsXG4gICAgZ2wuZ2V0RXJyb3IoKVxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlRkJPIChhMCwgYTEpIHtcbiAgICB2YXIgZnJhbWVidWZmZXIgPSBuZXcgUkVHTEZyYW1lYnVmZmVyKClcbiAgICBzdGF0cy5mcmFtZWJ1ZmZlckNvdW50KytcblxuICAgIGZ1bmN0aW9uIHJlZ2xGcmFtZWJ1ZmZlciAoYSwgYikge1xuICAgICAgdmFyIGlcblxuICAgICAgY2hlY2soZnJhbWVidWZmZXJTdGF0ZS5uZXh0ICE9PSBmcmFtZWJ1ZmZlcixcbiAgICAgICAgJ2NhbiBub3QgdXBkYXRlIGZyYW1lYnVmZmVyIHdoaWNoIGlzIGN1cnJlbnRseSBpbiB1c2UnKVxuXG4gICAgICB2YXIgZXh0RHJhd0J1ZmZlcnMgPSBleHRlbnNpb25zLndlYmdsX2RyYXdfYnVmZmVyc1xuXG4gICAgICB2YXIgd2lkdGggPSAwXG4gICAgICB2YXIgaGVpZ2h0ID0gMFxuXG4gICAgICB2YXIgbmVlZHNEZXB0aCA9IHRydWVcbiAgICAgIHZhciBuZWVkc1N0ZW5jaWwgPSB0cnVlXG5cbiAgICAgIHZhciBjb2xvckJ1ZmZlciA9IG51bGxcbiAgICAgIHZhciBjb2xvclRleHR1cmUgPSB0cnVlXG4gICAgICB2YXIgY29sb3JGb3JtYXQgPSAncmdiYSdcbiAgICAgIHZhciBjb2xvclR5cGUgPSAndWludDgnXG4gICAgICB2YXIgY29sb3JDb3VudCA9IDFcblxuICAgICAgdmFyIGRlcHRoQnVmZmVyID0gbnVsbFxuICAgICAgdmFyIHN0ZW5jaWxCdWZmZXIgPSBudWxsXG4gICAgICB2YXIgZGVwdGhTdGVuY2lsQnVmZmVyID0gbnVsbFxuICAgICAgdmFyIGRlcHRoU3RlbmNpbFRleHR1cmUgPSBmYWxzZVxuXG4gICAgICBpZiAodHlwZW9mIGEgPT09ICdudW1iZXInKSB7XG4gICAgICAgIHdpZHRoID0gYSB8IDBcbiAgICAgICAgaGVpZ2h0ID0gKGIgfCAwKSB8fCB3aWR0aFxuICAgICAgfSBlbHNlIGlmICghYSkge1xuICAgICAgICB3aWR0aCA9IGhlaWdodCA9IDFcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNoZWNrLnR5cGUoYSwgJ29iamVjdCcsICdpbnZhbGlkIGFyZ3VtZW50cyBmb3IgZnJhbWVidWZmZXInKVxuICAgICAgICB2YXIgb3B0aW9ucyA9IGFcblxuICAgICAgICBpZiAoJ3NoYXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgdmFyIHNoYXBlID0gb3B0aW9ucy5zaGFwZVxuICAgICAgICAgIGNoZWNrKEFycmF5LmlzQXJyYXkoc2hhcGUpICYmIHNoYXBlLmxlbmd0aCA+PSAyLFxuICAgICAgICAgICAgJ2ludmFsaWQgc2hhcGUgZm9yIGZyYW1lYnVmZmVyJylcbiAgICAgICAgICB3aWR0aCA9IHNoYXBlWzBdXG4gICAgICAgICAgaGVpZ2h0ID0gc2hhcGVbMV1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAoJ3JhZGl1cycgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgd2lkdGggPSBoZWlnaHQgPSBvcHRpb25zLnJhZGl1c1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoJ3dpZHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICB3aWR0aCA9IG9wdGlvbnMud2lkdGhcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCdoZWlnaHQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGhlaWdodCA9IG9wdGlvbnMuaGVpZ2h0XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdjb2xvcicgaW4gb3B0aW9ucyB8fFxuICAgICAgICAgICAgJ2NvbG9ycycgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGNvbG9yQnVmZmVyID1cbiAgICAgICAgICAgIG9wdGlvbnMuY29sb3IgfHxcbiAgICAgICAgICAgIG9wdGlvbnMuY29sb3JzXG4gICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoY29sb3JCdWZmZXIpKSB7XG4gICAgICAgICAgICBjaGVjayhcbiAgICAgICAgICAgICAgY29sb3JCdWZmZXIubGVuZ3RoID09PSAxIHx8IGV4dERyYXdCdWZmZXJzLFxuICAgICAgICAgICAgICAnbXVsdGlwbGUgcmVuZGVyIHRhcmdldHMgbm90IHN1cHBvcnRlZCcpXG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFjb2xvckJ1ZmZlcikge1xuICAgICAgICAgIGlmICgnY29sb3JDb3VudCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgY29sb3JDb3VudCA9IG9wdGlvbnMuY29sb3JDb3VudCB8IDBcbiAgICAgICAgICAgIGNoZWNrKGNvbG9yQ291bnQgPiAwLCAnaW52YWxpZCBjb2xvciBidWZmZXIgY291bnQnKVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmICgnY29sb3JUZXh0dXJlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBjb2xvclRleHR1cmUgPSAhIW9wdGlvbnMuY29sb3JUZXh0dXJlXG4gICAgICAgICAgICBjb2xvckZvcm1hdCA9ICdyZ2JhNCdcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoJ2NvbG9yVHlwZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgY29sb3JUeXBlID0gb3B0aW9ucy5jb2xvclR5cGVcbiAgICAgICAgICAgIGlmICghY29sb3JUZXh0dXJlKSB7XG4gICAgICAgICAgICAgIGlmIChjb2xvclR5cGUgPT09ICdoYWxmIGZsb2F0JyB8fCBjb2xvclR5cGUgPT09ICdmbG9hdDE2Jykge1xuICAgICAgICAgICAgICAgIGNoZWNrKGV4dGVuc2lvbnMuZXh0X2NvbG9yX2J1ZmZlcl9oYWxmX2Zsb2F0LFxuICAgICAgICAgICAgICAgICAgJ3lvdSBtdXN0IGVuYWJsZSBFWFRfY29sb3JfYnVmZmVyX2hhbGZfZmxvYXQgdG8gdXNlIDE2LWJpdCByZW5kZXIgYnVmZmVycycpXG4gICAgICAgICAgICAgICAgY29sb3JGb3JtYXQgPSAncmdiYTE2ZidcbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChjb2xvclR5cGUgPT09ICdmbG9hdCcgfHwgY29sb3JUeXBlID09PSAnZmxvYXQzMicpIHtcbiAgICAgICAgICAgICAgICBjaGVjayhleHRlbnNpb25zLndlYmdsX2NvbG9yX2J1ZmZlcl9mbG9hdCxcbiAgICAgICAgICAgICAgICAgICd5b3UgbXVzdCBlbmFibGUgV0VCR0xfY29sb3JfYnVmZmVyX2Zsb2F0IGluIG9yZGVyIHRvIHVzZSAzMi1iaXQgZmxvYXRpbmcgcG9pbnQgcmVuZGVyYnVmZmVycycpXG4gICAgICAgICAgICAgICAgY29sb3JGb3JtYXQgPSAncmdiYTMyZidcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgY2hlY2soZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9mbG9hdCB8fFxuICAgICAgICAgICAgICAgICEoY29sb3JUeXBlID09PSAnZmxvYXQnIHx8IGNvbG9yVHlwZSA9PT0gJ2Zsb2F0MzInKSxcbiAgICAgICAgICAgICAgICAneW91IG11c3QgZW5hYmxlIE9FU190ZXh0dXJlX2Zsb2F0IGluIG9yZGVyIHRvIHVzZSBmbG9hdGluZyBwb2ludCBmcmFtZWJ1ZmZlciBvYmplY3RzJylcbiAgICAgICAgICAgICAgY2hlY2soZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9oYWxmX2Zsb2F0IHx8XG4gICAgICAgICAgICAgICAgIShjb2xvclR5cGUgPT09ICdoYWxmIGZsb2F0JyB8fCBjb2xvclR5cGUgPT09ICdmbG9hdDE2JyksXG4gICAgICAgICAgICAgICAgJ3lvdSBtdXN0IGVuYWJsZSBPRVNfdGV4dHVyZV9oYWxmX2Zsb2F0IGluIG9yZGVyIHRvIHVzZSAxNi1iaXQgZmxvYXRpbmcgcG9pbnQgZnJhbWVidWZmZXIgb2JqZWN0cycpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjaGVjay5vbmVPZihjb2xvclR5cGUsIGNvbG9yVHlwZXMsICdpbnZhbGlkIGNvbG9yIHR5cGUnKVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmICgnY29sb3JGb3JtYXQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGNvbG9yRm9ybWF0ID0gb3B0aW9ucy5jb2xvckZvcm1hdFxuICAgICAgICAgICAgaWYgKGNvbG9yVGV4dHVyZUZvcm1hdHMuaW5kZXhPZihjb2xvckZvcm1hdCkgPj0gMCkge1xuICAgICAgICAgICAgICBjb2xvclRleHR1cmUgPSB0cnVlXG4gICAgICAgICAgICB9IGVsc2UgaWYgKGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0cy5pbmRleE9mKGNvbG9yRm9ybWF0KSA+PSAwKSB7XG4gICAgICAgICAgICAgIGNvbG9yVGV4dHVyZSA9IGZhbHNlXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBpZiAoY29sb3JUZXh0dXJlKSB7XG4gICAgICAgICAgICAgICAgY2hlY2sub25lT2YoXG4gICAgICAgICAgICAgICAgICBvcHRpb25zLmNvbG9yRm9ybWF0LCBjb2xvclRleHR1cmVGb3JtYXRzLFxuICAgICAgICAgICAgICAgICAgJ2ludmFsaWQgY29sb3IgZm9ybWF0IGZvciB0ZXh0dXJlJylcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjaGVjay5vbmVPZihcbiAgICAgICAgICAgICAgICAgIG9wdGlvbnMuY29sb3JGb3JtYXQsIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0cyxcbiAgICAgICAgICAgICAgICAgICdpbnZhbGlkIGNvbG9yIGZvcm1hdCBmb3IgcmVuZGVyYnVmZmVyJylcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnZGVwdGhUZXh0dXJlJyBpbiBvcHRpb25zIHx8ICdkZXB0aFN0ZW5jaWxUZXh0dXJlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgZGVwdGhTdGVuY2lsVGV4dHVyZSA9ICEhKG9wdGlvbnMuZGVwdGhUZXh0dXJlIHx8XG4gICAgICAgICAgICBvcHRpb25zLmRlcHRoU3RlbmNpbFRleHR1cmUpXG4gICAgICAgICAgY2hlY2soIWRlcHRoU3RlbmNpbFRleHR1cmUgfHwgZXh0ZW5zaW9ucy53ZWJnbF9kZXB0aF90ZXh0dXJlLFxuICAgICAgICAgICAgJ3dlYmdsX2RlcHRoX3RleHR1cmUgZXh0ZW5zaW9uIG5vdCBzdXBwb3J0ZWQnKVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdkZXB0aCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5kZXB0aCA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgICBuZWVkc0RlcHRoID0gb3B0aW9ucy5kZXB0aFxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBkZXB0aEJ1ZmZlciA9IG9wdGlvbnMuZGVwdGhcbiAgICAgICAgICAgIG5lZWRzU3RlbmNpbCA9IGZhbHNlXG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdzdGVuY2lsJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiBvcHRpb25zLnN0ZW5jaWwgPT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgbmVlZHNTdGVuY2lsID0gb3B0aW9ucy5zdGVuY2lsXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHN0ZW5jaWxCdWZmZXIgPSBvcHRpb25zLnN0ZW5jaWxcbiAgICAgICAgICAgIG5lZWRzRGVwdGggPSBmYWxzZVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnZGVwdGhTdGVuY2lsJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiBvcHRpb25zLmRlcHRoU3RlbmNpbCA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgICBuZWVkc0RlcHRoID0gbmVlZHNTdGVuY2lsID0gb3B0aW9ucy5kZXB0aFN0ZW5jaWxcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZGVwdGhTdGVuY2lsQnVmZmVyID0gb3B0aW9ucy5kZXB0aFN0ZW5jaWxcbiAgICAgICAgICAgIG5lZWRzRGVwdGggPSBmYWxzZVxuICAgICAgICAgICAgbmVlZHNTdGVuY2lsID0gZmFsc2VcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gcGFyc2UgYXR0YWNobWVudHNcbiAgICAgIHZhciBjb2xvckF0dGFjaG1lbnRzID0gbnVsbFxuICAgICAgdmFyIGRlcHRoQXR0YWNobWVudCA9IG51bGxcbiAgICAgIHZhciBzdGVuY2lsQXR0YWNobWVudCA9IG51bGxcbiAgICAgIHZhciBkZXB0aFN0ZW5jaWxBdHRhY2htZW50ID0gbnVsbFxuXG4gICAgICAvLyBTZXQgdXAgY29sb3IgYXR0YWNobWVudHNcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KGNvbG9yQnVmZmVyKSkge1xuICAgICAgICBjb2xvckF0dGFjaG1lbnRzID0gY29sb3JCdWZmZXIubWFwKHBhcnNlQXR0YWNobWVudClcbiAgICAgIH0gZWxzZSBpZiAoY29sb3JCdWZmZXIpIHtcbiAgICAgICAgY29sb3JBdHRhY2htZW50cyA9IFtwYXJzZUF0dGFjaG1lbnQoY29sb3JCdWZmZXIpXVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29sb3JBdHRhY2htZW50cyA9IG5ldyBBcnJheShjb2xvckNvdW50KVxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY29sb3JDb3VudDsgKytpKSB7XG4gICAgICAgICAgY29sb3JBdHRhY2htZW50c1tpXSA9IGFsbG9jQXR0YWNobWVudChcbiAgICAgICAgICAgIHdpZHRoLFxuICAgICAgICAgICAgaGVpZ2h0LFxuICAgICAgICAgICAgY29sb3JUZXh0dXJlLFxuICAgICAgICAgICAgY29sb3JGb3JtYXQsXG4gICAgICAgICAgICBjb2xvclR5cGUpXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY2hlY2soZXh0ZW5zaW9ucy53ZWJnbF9kcmF3X2J1ZmZlcnMgfHwgY29sb3JBdHRhY2htZW50cy5sZW5ndGggPD0gMSxcbiAgICAgICAgJ3lvdSBtdXN0IGVuYWJsZSB0aGUgV0VCR0xfZHJhd19idWZmZXJzIGV4dGVuc2lvbiBpbiBvcmRlciB0byB1c2UgbXVsdGlwbGUgY29sb3IgYnVmZmVycy4nKVxuICAgICAgY2hlY2soY29sb3JBdHRhY2htZW50cy5sZW5ndGggPD0gbGltaXRzLm1heENvbG9yQXR0YWNobWVudHMsXG4gICAgICAgICd0b28gbWFueSBjb2xvciBhdHRhY2htZW50cywgbm90IHN1cHBvcnRlZCcpXG5cbiAgICAgIHdpZHRoID0gd2lkdGggfHwgY29sb3JBdHRhY2htZW50c1swXS53aWR0aFxuICAgICAgaGVpZ2h0ID0gaGVpZ2h0IHx8IGNvbG9yQXR0YWNobWVudHNbMF0uaGVpZ2h0XG5cbiAgICAgIGlmIChkZXB0aEJ1ZmZlcikge1xuICAgICAgICBkZXB0aEF0dGFjaG1lbnQgPSBwYXJzZUF0dGFjaG1lbnQoZGVwdGhCdWZmZXIpXG4gICAgICB9IGVsc2UgaWYgKG5lZWRzRGVwdGggJiYgIW5lZWRzU3RlbmNpbCkge1xuICAgICAgICBkZXB0aEF0dGFjaG1lbnQgPSBhbGxvY0F0dGFjaG1lbnQoXG4gICAgICAgICAgd2lkdGgsXG4gICAgICAgICAgaGVpZ2h0LFxuICAgICAgICAgIGRlcHRoU3RlbmNpbFRleHR1cmUsXG4gICAgICAgICAgJ2RlcHRoJyxcbiAgICAgICAgICAndWludDMyJylcbiAgICAgIH1cblxuICAgICAgaWYgKHN0ZW5jaWxCdWZmZXIpIHtcbiAgICAgICAgc3RlbmNpbEF0dGFjaG1lbnQgPSBwYXJzZUF0dGFjaG1lbnQoc3RlbmNpbEJ1ZmZlcilcbiAgICAgIH0gZWxzZSBpZiAobmVlZHNTdGVuY2lsICYmICFuZWVkc0RlcHRoKSB7XG4gICAgICAgIHN0ZW5jaWxBdHRhY2htZW50ID0gYWxsb2NBdHRhY2htZW50KFxuICAgICAgICAgIHdpZHRoLFxuICAgICAgICAgIGhlaWdodCxcbiAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICAnc3RlbmNpbCcsXG4gICAgICAgICAgJ3VpbnQ4JylcbiAgICAgIH1cblxuICAgICAgaWYgKGRlcHRoU3RlbmNpbEJ1ZmZlcikge1xuICAgICAgICBkZXB0aFN0ZW5jaWxBdHRhY2htZW50ID0gcGFyc2VBdHRhY2htZW50KGRlcHRoU3RlbmNpbEJ1ZmZlcilcbiAgICAgIH0gZWxzZSBpZiAoIWRlcHRoQnVmZmVyICYmICFzdGVuY2lsQnVmZmVyICYmIG5lZWRzU3RlbmNpbCAmJiBuZWVkc0RlcHRoKSB7XG4gICAgICAgIGRlcHRoU3RlbmNpbEF0dGFjaG1lbnQgPSBhbGxvY0F0dGFjaG1lbnQoXG4gICAgICAgICAgd2lkdGgsXG4gICAgICAgICAgaGVpZ2h0LFxuICAgICAgICAgIGRlcHRoU3RlbmNpbFRleHR1cmUsXG4gICAgICAgICAgJ2RlcHRoIHN0ZW5jaWwnLFxuICAgICAgICAgICdkZXB0aCBzdGVuY2lsJylcbiAgICAgIH1cblxuICAgICAgY2hlY2soXG4gICAgICAgICghIWRlcHRoQnVmZmVyKSArICghIXN0ZW5jaWxCdWZmZXIpICsgKCEhZGVwdGhTdGVuY2lsQnVmZmVyKSA8PSAxLFxuICAgICAgICAnaW52YWxpZCBmcmFtZWJ1ZmZlciBjb25maWd1cmF0aW9uLCBjYW4gc3BlY2lmeSBleGFjdGx5IG9uZSBkZXB0aC9zdGVuY2lsIGF0dGFjaG1lbnQnKVxuXG4gICAgICB2YXIgY29tbW9uQ29sb3JBdHRhY2htZW50U2l6ZSA9IG51bGxcblxuICAgICAgZm9yIChpID0gMDsgaSA8IGNvbG9yQXR0YWNobWVudHMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgaW5jUmVmQW5kQ2hlY2tTaGFwZShjb2xvckF0dGFjaG1lbnRzW2ldLCB3aWR0aCwgaGVpZ2h0KVxuICAgICAgICBjaGVjayghY29sb3JBdHRhY2htZW50c1tpXSB8fFxuICAgICAgICAgIChjb2xvckF0dGFjaG1lbnRzW2ldLnRleHR1cmUgJiZcbiAgICAgICAgICAgIGNvbG9yVGV4dHVyZUZvcm1hdEVudW1zLmluZGV4T2YoY29sb3JBdHRhY2htZW50c1tpXS50ZXh0dXJlLl90ZXh0dXJlLmZvcm1hdCkgPj0gMCkgfHxcbiAgICAgICAgICAoY29sb3JBdHRhY2htZW50c1tpXS5yZW5kZXJidWZmZXIgJiZcbiAgICAgICAgICAgIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0RW51bXMuaW5kZXhPZihjb2xvckF0dGFjaG1lbnRzW2ldLnJlbmRlcmJ1ZmZlci5fcmVuZGVyYnVmZmVyLmZvcm1hdCkgPj0gMCksXG4gICAgICAgICAgJ2ZyYW1lYnVmZmVyIGNvbG9yIGF0dGFjaG1lbnQgJyArIGkgKyAnIGlzIGludmFsaWQnKVxuXG4gICAgICAgIGlmIChjb2xvckF0dGFjaG1lbnRzW2ldICYmIGNvbG9yQXR0YWNobWVudHNbaV0udGV4dHVyZSkge1xuICAgICAgICAgIHZhciBjb2xvckF0dGFjaG1lbnRTaXplID1cbiAgICAgICAgICAgICAgdGV4dHVyZUZvcm1hdENoYW5uZWxzW2NvbG9yQXR0YWNobWVudHNbaV0udGV4dHVyZS5fdGV4dHVyZS5mb3JtYXRdICpcbiAgICAgICAgICAgICAgdGV4dHVyZVR5cGVTaXplc1tjb2xvckF0dGFjaG1lbnRzW2ldLnRleHR1cmUuX3RleHR1cmUudHlwZV1cblxuICAgICAgICAgIGlmIChjb21tb25Db2xvckF0dGFjaG1lbnRTaXplID09PSBudWxsKSB7XG4gICAgICAgICAgICBjb21tb25Db2xvckF0dGFjaG1lbnRTaXplID0gY29sb3JBdHRhY2htZW50U2l6ZVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBXZSBuZWVkIHRvIG1ha2Ugc3VyZSB0aGF0IGFsbCBjb2xvciBhdHRhY2htZW50cyBoYXZlIHRoZSBzYW1lIG51bWJlciBvZiBiaXRwbGFuZXNcbiAgICAgICAgICAgIC8vICh0aGF0IGlzLCB0aGUgc2FtZSBudW1lciBvZiBiaXRzIHBlciBwaXhlbClcbiAgICAgICAgICAgIC8vIFRoaXMgaXMgcmVxdWlyZWQgYnkgdGhlIEdMRVMyLjAgc3RhbmRhcmQuIFNlZSB0aGUgYmVnaW5uaW5nIG9mIENoYXB0ZXIgNCBpbiB0aGF0IGRvY3VtZW50LlxuICAgICAgICAgICAgY2hlY2soY29tbW9uQ29sb3JBdHRhY2htZW50U2l6ZSA9PT0gY29sb3JBdHRhY2htZW50U2l6ZSxcbiAgICAgICAgICAgICAgICAgICdhbGwgY29sb3IgYXR0YWNobWVudHMgbXVjaCBoYXZlIHRoZSBzYW1lIG51bWJlciBvZiBiaXRzIHBlciBwaXhlbC4nKVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaW5jUmVmQW5kQ2hlY2tTaGFwZShkZXB0aEF0dGFjaG1lbnQsIHdpZHRoLCBoZWlnaHQpXG4gICAgICBjaGVjayghZGVwdGhBdHRhY2htZW50IHx8XG4gICAgICAgIChkZXB0aEF0dGFjaG1lbnQudGV4dHVyZSAmJlxuICAgICAgICAgIGRlcHRoQXR0YWNobWVudC50ZXh0dXJlLl90ZXh0dXJlLmZvcm1hdCA9PT0gR0xfREVQVEhfQ09NUE9ORU5UKSB8fFxuICAgICAgICAoZGVwdGhBdHRhY2htZW50LnJlbmRlcmJ1ZmZlciAmJlxuICAgICAgICAgIGRlcHRoQXR0YWNobWVudC5yZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlci5mb3JtYXQgPT09IEdMX0RFUFRIX0NPTVBPTkVOVDE2KSxcbiAgICAgICAgJ2ludmFsaWQgZGVwdGggYXR0YWNobWVudCBmb3IgZnJhbWVidWZmZXIgb2JqZWN0JylcbiAgICAgIGluY1JlZkFuZENoZWNrU2hhcGUoc3RlbmNpbEF0dGFjaG1lbnQsIHdpZHRoLCBoZWlnaHQpXG4gICAgICBjaGVjayghc3RlbmNpbEF0dGFjaG1lbnQgfHxcbiAgICAgICAgKHN0ZW5jaWxBdHRhY2htZW50LnJlbmRlcmJ1ZmZlciAmJlxuICAgICAgICAgIHN0ZW5jaWxBdHRhY2htZW50LnJlbmRlcmJ1ZmZlci5fcmVuZGVyYnVmZmVyLmZvcm1hdCA9PT0gR0xfU1RFTkNJTF9JTkRFWDgpLFxuICAgICAgICAnaW52YWxpZCBzdGVuY2lsIGF0dGFjaG1lbnQgZm9yIGZyYW1lYnVmZmVyIG9iamVjdCcpXG4gICAgICBpbmNSZWZBbmRDaGVja1NoYXBlKGRlcHRoU3RlbmNpbEF0dGFjaG1lbnQsIHdpZHRoLCBoZWlnaHQpXG4gICAgICBjaGVjayghZGVwdGhTdGVuY2lsQXR0YWNobWVudCB8fFxuICAgICAgICAoZGVwdGhTdGVuY2lsQXR0YWNobWVudC50ZXh0dXJlICYmXG4gICAgICAgICAgZGVwdGhTdGVuY2lsQXR0YWNobWVudC50ZXh0dXJlLl90ZXh0dXJlLmZvcm1hdCA9PT0gR0xfREVQVEhfU1RFTkNJTCkgfHxcbiAgICAgICAgKGRlcHRoU3RlbmNpbEF0dGFjaG1lbnQucmVuZGVyYnVmZmVyICYmXG4gICAgICAgICAgZGVwdGhTdGVuY2lsQXR0YWNobWVudC5yZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlci5mb3JtYXQgPT09IEdMX0RFUFRIX1NURU5DSUwpLFxuICAgICAgICAnaW52YWxpZCBkZXB0aC1zdGVuY2lsIGF0dGFjaG1lbnQgZm9yIGZyYW1lYnVmZmVyIG9iamVjdCcpXG5cbiAgICAgIC8vIGRlY3JlbWVudCByZWZlcmVuY2VzXG4gICAgICBkZWNGQk9SZWZzKGZyYW1lYnVmZmVyKVxuXG4gICAgICBmcmFtZWJ1ZmZlci53aWR0aCA9IHdpZHRoXG4gICAgICBmcmFtZWJ1ZmZlci5oZWlnaHQgPSBoZWlnaHRcblxuICAgICAgZnJhbWVidWZmZXIuY29sb3JBdHRhY2htZW50cyA9IGNvbG9yQXR0YWNobWVudHNcbiAgICAgIGZyYW1lYnVmZmVyLmRlcHRoQXR0YWNobWVudCA9IGRlcHRoQXR0YWNobWVudFxuICAgICAgZnJhbWVidWZmZXIuc3RlbmNpbEF0dGFjaG1lbnQgPSBzdGVuY2lsQXR0YWNobWVudFxuICAgICAgZnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsQXR0YWNobWVudCA9IGRlcHRoU3RlbmNpbEF0dGFjaG1lbnRcblxuICAgICAgcmVnbEZyYW1lYnVmZmVyLmNvbG9yID0gY29sb3JBdHRhY2htZW50cy5tYXAodW53cmFwQXR0YWNobWVudClcbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci5kZXB0aCA9IHVud3JhcEF0dGFjaG1lbnQoZGVwdGhBdHRhY2htZW50KVxuICAgICAgcmVnbEZyYW1lYnVmZmVyLnN0ZW5jaWwgPSB1bndyYXBBdHRhY2htZW50KHN0ZW5jaWxBdHRhY2htZW50KVxuICAgICAgcmVnbEZyYW1lYnVmZmVyLmRlcHRoU3RlbmNpbCA9IHVud3JhcEF0dGFjaG1lbnQoZGVwdGhTdGVuY2lsQXR0YWNobWVudClcblxuICAgICAgcmVnbEZyYW1lYnVmZmVyLndpZHRoID0gZnJhbWVidWZmZXIud2lkdGhcbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci5oZWlnaHQgPSBmcmFtZWJ1ZmZlci5oZWlnaHRcblxuICAgICAgdXBkYXRlRnJhbWVidWZmZXIoZnJhbWVidWZmZXIpXG5cbiAgICAgIHJldHVybiByZWdsRnJhbWVidWZmZXJcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZXNpemUgKHdfLCBoXykge1xuICAgICAgY2hlY2soZnJhbWVidWZmZXJTdGF0ZS5uZXh0ICE9PSBmcmFtZWJ1ZmZlcixcbiAgICAgICAgJ2NhbiBub3QgcmVzaXplIGEgZnJhbWVidWZmZXIgd2hpY2ggaXMgY3VycmVudGx5IGluIHVzZScpXG5cbiAgICAgIHZhciB3ID0gd18gfCAwXG4gICAgICB2YXIgaCA9IChoXyB8IDApIHx8IHdcbiAgICAgIGlmICh3ID09PSBmcmFtZWJ1ZmZlci53aWR0aCAmJiBoID09PSBmcmFtZWJ1ZmZlci5oZWlnaHQpIHtcbiAgICAgICAgcmV0dXJuIHJlZ2xGcmFtZWJ1ZmZlclxuICAgICAgfVxuXG4gICAgICAvLyByZXNpemUgYWxsIGJ1ZmZlcnNcbiAgICAgIHZhciBjb2xvckF0dGFjaG1lbnRzID0gZnJhbWVidWZmZXIuY29sb3JBdHRhY2htZW50c1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjb2xvckF0dGFjaG1lbnRzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgIHJlc2l6ZUF0dGFjaG1lbnQoY29sb3JBdHRhY2htZW50c1tpXSwgdywgaClcbiAgICAgIH1cbiAgICAgIHJlc2l6ZUF0dGFjaG1lbnQoZnJhbWVidWZmZXIuZGVwdGhBdHRhY2htZW50LCB3LCBoKVxuICAgICAgcmVzaXplQXR0YWNobWVudChmcmFtZWJ1ZmZlci5zdGVuY2lsQXR0YWNobWVudCwgdywgaClcbiAgICAgIHJlc2l6ZUF0dGFjaG1lbnQoZnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsQXR0YWNobWVudCwgdywgaClcblxuICAgICAgZnJhbWVidWZmZXIud2lkdGggPSByZWdsRnJhbWVidWZmZXIud2lkdGggPSB3XG4gICAgICBmcmFtZWJ1ZmZlci5oZWlnaHQgPSByZWdsRnJhbWVidWZmZXIuaGVpZ2h0ID0gaFxuXG4gICAgICB1cGRhdGVGcmFtZWJ1ZmZlcihmcmFtZWJ1ZmZlcilcblxuICAgICAgcmV0dXJuIHJlZ2xGcmFtZWJ1ZmZlclxuICAgIH1cblxuICAgIHJlZ2xGcmFtZWJ1ZmZlcihhMCwgYTEpXG5cbiAgICByZXR1cm4gZXh0ZW5kKHJlZ2xGcmFtZWJ1ZmZlciwge1xuICAgICAgcmVzaXplOiByZXNpemUsXG4gICAgICBfcmVnbFR5cGU6ICdmcmFtZWJ1ZmZlcicsXG4gICAgICBfZnJhbWVidWZmZXI6IGZyYW1lYnVmZmVyLFxuICAgICAgZGVzdHJveTogZnVuY3Rpb24gKCkge1xuICAgICAgICBkZXN0cm95KGZyYW1lYnVmZmVyKVxuICAgICAgICBkZWNGQk9SZWZzKGZyYW1lYnVmZmVyKVxuICAgICAgfSxcbiAgICAgIGJpbmQ6IGZ1bmN0aW9uIChibG9jaykge1xuICAgICAgICBmcmFtZWJ1ZmZlclN0YXRlLnNldEZCTyh7XG4gICAgICAgICAgZnJhbWVidWZmZXI6IHJlZ2xGcmFtZWJ1ZmZlclxuICAgICAgICB9LCBibG9jaylcbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlQ3ViZUZCTyAob3B0aW9ucykge1xuICAgIHZhciBmYWNlcyA9IEFycmF5KDYpXG5cbiAgICBmdW5jdGlvbiByZWdsRnJhbWVidWZmZXJDdWJlIChhKSB7XG4gICAgICB2YXIgaVxuXG4gICAgICBjaGVjayhmYWNlcy5pbmRleE9mKGZyYW1lYnVmZmVyU3RhdGUubmV4dCkgPCAwLFxuICAgICAgICAnY2FuIG5vdCB1cGRhdGUgZnJhbWVidWZmZXIgd2hpY2ggaXMgY3VycmVudGx5IGluIHVzZScpXG5cbiAgICAgIHZhciBleHREcmF3QnVmZmVycyA9IGV4dGVuc2lvbnMud2ViZ2xfZHJhd19idWZmZXJzXG5cbiAgICAgIHZhciBwYXJhbXMgPSB7XG4gICAgICAgIGNvbG9yOiBudWxsXG4gICAgICB9XG5cbiAgICAgIHZhciByYWRpdXMgPSAwXG5cbiAgICAgIHZhciBjb2xvckJ1ZmZlciA9IG51bGxcbiAgICAgIHZhciBjb2xvckZvcm1hdCA9ICdyZ2JhJ1xuICAgICAgdmFyIGNvbG9yVHlwZSA9ICd1aW50OCdcbiAgICAgIHZhciBjb2xvckNvdW50ID0gMVxuXG4gICAgICBpZiAodHlwZW9mIGEgPT09ICdudW1iZXInKSB7XG4gICAgICAgIHJhZGl1cyA9IGEgfCAwXG4gICAgICB9IGVsc2UgaWYgKCFhKSB7XG4gICAgICAgIHJhZGl1cyA9IDFcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNoZWNrLnR5cGUoYSwgJ29iamVjdCcsICdpbnZhbGlkIGFyZ3VtZW50cyBmb3IgZnJhbWVidWZmZXInKVxuICAgICAgICB2YXIgb3B0aW9ucyA9IGFcblxuICAgICAgICBpZiAoJ3NoYXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgdmFyIHNoYXBlID0gb3B0aW9ucy5zaGFwZVxuICAgICAgICAgIGNoZWNrKFxuICAgICAgICAgICAgQXJyYXkuaXNBcnJheShzaGFwZSkgJiYgc2hhcGUubGVuZ3RoID49IDIsXG4gICAgICAgICAgICAnaW52YWxpZCBzaGFwZSBmb3IgZnJhbWVidWZmZXInKVxuICAgICAgICAgIGNoZWNrKFxuICAgICAgICAgICAgc2hhcGVbMF0gPT09IHNoYXBlWzFdLFxuICAgICAgICAgICAgJ2N1YmUgZnJhbWVidWZmZXIgbXVzdCBiZSBzcXVhcmUnKVxuICAgICAgICAgIHJhZGl1cyA9IHNoYXBlWzBdXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWYgKCdyYWRpdXMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIHJhZGl1cyA9IG9wdGlvbnMucmFkaXVzIHwgMFxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoJ3dpZHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICByYWRpdXMgPSBvcHRpb25zLndpZHRoIHwgMFxuICAgICAgICAgICAgaWYgKCdoZWlnaHQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgICAgY2hlY2sob3B0aW9ucy5oZWlnaHQgPT09IHJhZGl1cywgJ211c3QgYmUgc3F1YXJlJylcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2UgaWYgKCdoZWlnaHQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIHJhZGl1cyA9IG9wdGlvbnMuaGVpZ2h0IHwgMFxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnY29sb3InIGluIG9wdGlvbnMgfHxcbiAgICAgICAgICAgICdjb2xvcnMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBjb2xvckJ1ZmZlciA9XG4gICAgICAgICAgICBvcHRpb25zLmNvbG9yIHx8XG4gICAgICAgICAgICBvcHRpb25zLmNvbG9yc1xuICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KGNvbG9yQnVmZmVyKSkge1xuICAgICAgICAgICAgY2hlY2soXG4gICAgICAgICAgICAgIGNvbG9yQnVmZmVyLmxlbmd0aCA9PT0gMSB8fCBleHREcmF3QnVmZmVycyxcbiAgICAgICAgICAgICAgJ211bHRpcGxlIHJlbmRlciB0YXJnZXRzIG5vdCBzdXBwb3J0ZWQnKVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghY29sb3JCdWZmZXIpIHtcbiAgICAgICAgICBpZiAoJ2NvbG9yQ291bnQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGNvbG9yQ291bnQgPSBvcHRpb25zLmNvbG9yQ291bnQgfCAwXG4gICAgICAgICAgICBjaGVjayhjb2xvckNvdW50ID4gMCwgJ2ludmFsaWQgY29sb3IgYnVmZmVyIGNvdW50JylcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoJ2NvbG9yVHlwZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgY2hlY2sub25lT2YoXG4gICAgICAgICAgICAgIG9wdGlvbnMuY29sb3JUeXBlLCBjb2xvclR5cGVzLFxuICAgICAgICAgICAgICAnaW52YWxpZCBjb2xvciB0eXBlJylcbiAgICAgICAgICAgIGNvbG9yVHlwZSA9IG9wdGlvbnMuY29sb3JUeXBlXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKCdjb2xvckZvcm1hdCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgY29sb3JGb3JtYXQgPSBvcHRpb25zLmNvbG9yRm9ybWF0XG4gICAgICAgICAgICBjaGVjay5vbmVPZihcbiAgICAgICAgICAgICAgb3B0aW9ucy5jb2xvckZvcm1hdCwgY29sb3JUZXh0dXJlRm9ybWF0cyxcbiAgICAgICAgICAgICAgJ2ludmFsaWQgY29sb3IgZm9ybWF0IGZvciB0ZXh0dXJlJylcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ2RlcHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgcGFyYW1zLmRlcHRoID0gb3B0aW9ucy5kZXB0aFxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdzdGVuY2lsJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgcGFyYW1zLnN0ZW5jaWwgPSBvcHRpb25zLnN0ZW5jaWxcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnZGVwdGhTdGVuY2lsJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgcGFyYW1zLmRlcHRoU3RlbmNpbCA9IG9wdGlvbnMuZGVwdGhTdGVuY2lsXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgdmFyIGNvbG9yQ3ViZXNcbiAgICAgIGlmIChjb2xvckJ1ZmZlcikge1xuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShjb2xvckJ1ZmZlcikpIHtcbiAgICAgICAgICBjb2xvckN1YmVzID0gW11cbiAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY29sb3JCdWZmZXIubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICAgIGNvbG9yQ3ViZXNbaV0gPSBjb2xvckJ1ZmZlcltpXVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb2xvckN1YmVzID0gWyBjb2xvckJ1ZmZlciBdXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbG9yQ3ViZXMgPSBBcnJheShjb2xvckNvdW50KVxuICAgICAgICB2YXIgY3ViZU1hcFBhcmFtcyA9IHtcbiAgICAgICAgICByYWRpdXM6IHJhZGl1cyxcbiAgICAgICAgICBmb3JtYXQ6IGNvbG9yRm9ybWF0LFxuICAgICAgICAgIHR5cGU6IGNvbG9yVHlwZVxuICAgICAgICB9XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xvckNvdW50OyArK2kpIHtcbiAgICAgICAgICBjb2xvckN1YmVzW2ldID0gdGV4dHVyZVN0YXRlLmNyZWF0ZUN1YmUoY3ViZU1hcFBhcmFtcylcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBDaGVjayBjb2xvciBjdWJlc1xuICAgICAgcGFyYW1zLmNvbG9yID0gQXJyYXkoY29sb3JDdWJlcy5sZW5ndGgpXG4gICAgICBmb3IgKGkgPSAwOyBpIDwgY29sb3JDdWJlcy5sZW5ndGg7ICsraSkge1xuICAgICAgICB2YXIgY3ViZSA9IGNvbG9yQ3ViZXNbaV1cbiAgICAgICAgY2hlY2soXG4gICAgICAgICAgdHlwZW9mIGN1YmUgPT09ICdmdW5jdGlvbicgJiYgY3ViZS5fcmVnbFR5cGUgPT09ICd0ZXh0dXJlQ3ViZScsXG4gICAgICAgICAgJ2ludmFsaWQgY3ViZSBtYXAnKVxuICAgICAgICByYWRpdXMgPSByYWRpdXMgfHwgY3ViZS53aWR0aFxuICAgICAgICBjaGVjayhcbiAgICAgICAgICBjdWJlLndpZHRoID09PSByYWRpdXMgJiYgY3ViZS5oZWlnaHQgPT09IHJhZGl1cyxcbiAgICAgICAgICAnaW52YWxpZCBjdWJlIG1hcCBzaGFwZScpXG4gICAgICAgIHBhcmFtcy5jb2xvcltpXSA9IHtcbiAgICAgICAgICB0YXJnZXQ6IEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCxcbiAgICAgICAgICBkYXRhOiBjb2xvckN1YmVzW2ldXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGNvbG9yQ3ViZXMubGVuZ3RoOyArK2opIHtcbiAgICAgICAgICBwYXJhbXMuY29sb3Jbal0udGFyZ2V0ID0gR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YICsgaVxuICAgICAgICB9XG4gICAgICAgIC8vIHJldXNlIGRlcHRoLXN0ZW5jaWwgYXR0YWNobWVudHMgYWNyb3NzIGFsbCBjdWJlIG1hcHNcbiAgICAgICAgaWYgKGkgPiAwKSB7XG4gICAgICAgICAgcGFyYW1zLmRlcHRoID0gZmFjZXNbMF0uZGVwdGhcbiAgICAgICAgICBwYXJhbXMuc3RlbmNpbCA9IGZhY2VzWzBdLnN0ZW5jaWxcbiAgICAgICAgICBwYXJhbXMuZGVwdGhTdGVuY2lsID0gZmFjZXNbMF0uZGVwdGhTdGVuY2lsXG4gICAgICAgIH1cbiAgICAgICAgaWYgKGZhY2VzW2ldKSB7XG4gICAgICAgICAgKGZhY2VzW2ldKShwYXJhbXMpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZmFjZXNbaV0gPSBjcmVhdGVGQk8ocGFyYW1zKVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBleHRlbmQocmVnbEZyYW1lYnVmZmVyQ3ViZSwge1xuICAgICAgICB3aWR0aDogcmFkaXVzLFxuICAgICAgICBoZWlnaHQ6IHJhZGl1cyxcbiAgICAgICAgY29sb3I6IGNvbG9yQ3ViZXNcbiAgICAgIH0pXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVzaXplIChyYWRpdXNfKSB7XG4gICAgICB2YXIgaVxuICAgICAgdmFyIHJhZGl1cyA9IHJhZGl1c18gfCAwXG4gICAgICBjaGVjayhyYWRpdXMgPiAwICYmIHJhZGl1cyA8PSBsaW1pdHMubWF4Q3ViZU1hcFNpemUsXG4gICAgICAgICdpbnZhbGlkIHJhZGl1cyBmb3IgY3ViZSBmYm8nKVxuXG4gICAgICBpZiAocmFkaXVzID09PSByZWdsRnJhbWVidWZmZXJDdWJlLndpZHRoKSB7XG4gICAgICAgIHJldHVybiByZWdsRnJhbWVidWZmZXJDdWJlXG4gICAgICB9XG5cbiAgICAgIHZhciBjb2xvcnMgPSByZWdsRnJhbWVidWZmZXJDdWJlLmNvbG9yXG4gICAgICBmb3IgKGkgPSAwOyBpIDwgY29sb3JzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgIGNvbG9yc1tpXS5yZXNpemUocmFkaXVzKVxuICAgICAgfVxuXG4gICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgIGZhY2VzW2ldLnJlc2l6ZShyYWRpdXMpXG4gICAgICB9XG5cbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlckN1YmUud2lkdGggPSByZWdsRnJhbWVidWZmZXJDdWJlLmhlaWdodCA9IHJhZGl1c1xuXG4gICAgICByZXR1cm4gcmVnbEZyYW1lYnVmZmVyQ3ViZVxuICAgIH1cblxuICAgIHJlZ2xGcmFtZWJ1ZmZlckN1YmUob3B0aW9ucylcblxuICAgIHJldHVybiBleHRlbmQocmVnbEZyYW1lYnVmZmVyQ3ViZSwge1xuICAgICAgZmFjZXM6IGZhY2VzLFxuICAgICAgcmVzaXplOiByZXNpemUsXG4gICAgICBfcmVnbFR5cGU6ICdmcmFtZWJ1ZmZlckN1YmUnLFxuICAgICAgZGVzdHJveTogZnVuY3Rpb24gKCkge1xuICAgICAgICBmYWNlcy5mb3JFYWNoKGZ1bmN0aW9uIChmKSB7XG4gICAgICAgICAgZi5kZXN0cm95KClcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgZnVuY3Rpb24gcmVzdG9yZUZyYW1lYnVmZmVycyAoKSB7XG4gICAgdmFsdWVzKGZyYW1lYnVmZmVyU2V0KS5mb3JFYWNoKGZ1bmN0aW9uIChmYikge1xuICAgICAgZmIuZnJhbWVidWZmZXIgPSBnbC5jcmVhdGVGcmFtZWJ1ZmZlcigpXG4gICAgICB1cGRhdGVGcmFtZWJ1ZmZlcihmYilcbiAgICB9KVxuICB9XG5cbiAgcmV0dXJuIGV4dGVuZChmcmFtZWJ1ZmZlclN0YXRlLCB7XG4gICAgZ2V0RnJhbWVidWZmZXI6IGZ1bmN0aW9uIChvYmplY3QpIHtcbiAgICAgIGlmICh0eXBlb2Ygb2JqZWN0ID09PSAnZnVuY3Rpb24nICYmIG9iamVjdC5fcmVnbFR5cGUgPT09ICdmcmFtZWJ1ZmZlcicpIHtcbiAgICAgICAgdmFyIGZibyA9IG9iamVjdC5fZnJhbWVidWZmZXJcbiAgICAgICAgaWYgKGZibyBpbnN0YW5jZW9mIFJFR0xGcmFtZWJ1ZmZlcikge1xuICAgICAgICAgIHJldHVybiBmYm9cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9LFxuICAgIGNyZWF0ZTogY3JlYXRlRkJPLFxuICAgIGNyZWF0ZUN1YmU6IGNyZWF0ZUN1YmVGQk8sXG4gICAgY2xlYXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhbHVlcyhmcmFtZWJ1ZmZlclNldCkuZm9yRWFjaChkZXN0cm95KVxuICAgIH0sXG4gICAgcmVzdG9yZTogcmVzdG9yZUZyYW1lYnVmZmVyc1xuICB9KVxufVxuIiwidmFyIEdMX1NVQlBJWEVMX0JJVFMgPSAweDBENTBcbnZhciBHTF9SRURfQklUUyA9IDB4MEQ1MlxudmFyIEdMX0dSRUVOX0JJVFMgPSAweDBENTNcbnZhciBHTF9CTFVFX0JJVFMgPSAweDBENTRcbnZhciBHTF9BTFBIQV9CSVRTID0gMHgwRDU1XG52YXIgR0xfREVQVEhfQklUUyA9IDB4MEQ1NlxudmFyIEdMX1NURU5DSUxfQklUUyA9IDB4MEQ1N1xuXG52YXIgR0xfQUxJQVNFRF9QT0lOVF9TSVpFX1JBTkdFID0gMHg4NDZEXG52YXIgR0xfQUxJQVNFRF9MSU5FX1dJRFRIX1JBTkdFID0gMHg4NDZFXG5cbnZhciBHTF9NQVhfVEVYVFVSRV9TSVpFID0gMHgwRDMzXG52YXIgR0xfTUFYX1ZJRVdQT1JUX0RJTVMgPSAweDBEM0FcbnZhciBHTF9NQVhfVkVSVEVYX0FUVFJJQlMgPSAweDg4NjlcbnZhciBHTF9NQVhfVkVSVEVYX1VOSUZPUk1fVkVDVE9SUyA9IDB4OERGQlxudmFyIEdMX01BWF9WQVJZSU5HX1ZFQ1RPUlMgPSAweDhERkNcbnZhciBHTF9NQVhfQ09NQklORURfVEVYVFVSRV9JTUFHRV9VTklUUyA9IDB4OEI0RFxudmFyIEdMX01BWF9WRVJURVhfVEVYVFVSRV9JTUFHRV9VTklUUyA9IDB4OEI0Q1xudmFyIEdMX01BWF9URVhUVVJFX0lNQUdFX1VOSVRTID0gMHg4ODcyXG52YXIgR0xfTUFYX0ZSQUdNRU5UX1VOSUZPUk1fVkVDVE9SUyA9IDB4OERGRFxudmFyIEdMX01BWF9DVUJFX01BUF9URVhUVVJFX1NJWkUgPSAweDg1MUNcbnZhciBHTF9NQVhfUkVOREVSQlVGRkVSX1NJWkUgPSAweDg0RThcblxudmFyIEdMX1ZFTkRPUiA9IDB4MUYwMFxudmFyIEdMX1JFTkRFUkVSID0gMHgxRjAxXG52YXIgR0xfVkVSU0lPTiA9IDB4MUYwMlxudmFyIEdMX1NIQURJTkdfTEFOR1VBR0VfVkVSU0lPTiA9IDB4OEI4Q1xuXG52YXIgR0xfTUFYX1RFWFRVUkVfTUFYX0FOSVNPVFJPUFlfRVhUID0gMHg4NEZGXG5cbnZhciBHTF9NQVhfQ09MT1JfQVRUQUNITUVOVFNfV0VCR0wgPSAweDhDREZcbnZhciBHTF9NQVhfRFJBV19CVUZGRVJTX1dFQkdMID0gMHg4ODI0XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGdsLCBleHRlbnNpb25zKSB7XG4gIHZhciBtYXhBbmlzb3Ryb3BpYyA9IDFcbiAgaWYgKGV4dGVuc2lvbnMuZXh0X3RleHR1cmVfZmlsdGVyX2FuaXNvdHJvcGljKSB7XG4gICAgbWF4QW5pc290cm9waWMgPSBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1RFWFRVUkVfTUFYX0FOSVNPVFJPUFlfRVhUKVxuICB9XG5cbiAgdmFyIG1heERyYXdidWZmZXJzID0gMVxuICB2YXIgbWF4Q29sb3JBdHRhY2htZW50cyA9IDFcbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfZHJhd19idWZmZXJzKSB7XG4gICAgbWF4RHJhd2J1ZmZlcnMgPSBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0RSQVdfQlVGRkVSU19XRUJHTClcbiAgICBtYXhDb2xvckF0dGFjaG1lbnRzID0gZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9DT0xPUl9BVFRBQ0hNRU5UU19XRUJHTClcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgLy8gZHJhd2luZyBidWZmZXIgYml0IGRlcHRoXG4gICAgY29sb3JCaXRzOiBbXG4gICAgICBnbC5nZXRQYXJhbWV0ZXIoR0xfUkVEX0JJVFMpLFxuICAgICAgZ2wuZ2V0UGFyYW1ldGVyKEdMX0dSRUVOX0JJVFMpLFxuICAgICAgZ2wuZ2V0UGFyYW1ldGVyKEdMX0JMVUVfQklUUyksXG4gICAgICBnbC5nZXRQYXJhbWV0ZXIoR0xfQUxQSEFfQklUUylcbiAgICBdLFxuICAgIGRlcHRoQml0czogZ2wuZ2V0UGFyYW1ldGVyKEdMX0RFUFRIX0JJVFMpLFxuICAgIHN0ZW5jaWxCaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfU1RFTkNJTF9CSVRTKSxcbiAgICBzdWJwaXhlbEJpdHM6IGdsLmdldFBhcmFtZXRlcihHTF9TVUJQSVhFTF9CSVRTKSxcblxuICAgIC8vIHN1cHBvcnRlZCBleHRlbnNpb25zXG4gICAgZXh0ZW5zaW9uczogT2JqZWN0LmtleXMoZXh0ZW5zaW9ucykuZmlsdGVyKGZ1bmN0aW9uIChleHQpIHtcbiAgICAgIHJldHVybiAhIWV4dGVuc2lvbnNbZXh0XVxuICAgIH0pLFxuXG4gICAgLy8gbWF4IGFuaXNvIHNhbXBsZXNcbiAgICBtYXhBbmlzb3Ryb3BpYzogbWF4QW5pc290cm9waWMsXG5cbiAgICAvLyBtYXggZHJhdyBidWZmZXJzXG4gICAgbWF4RHJhd2J1ZmZlcnM6IG1heERyYXdidWZmZXJzLFxuICAgIG1heENvbG9yQXR0YWNobWVudHM6IG1heENvbG9yQXR0YWNobWVudHMsXG5cbiAgICAvLyBwb2ludCBhbmQgbGluZSBzaXplIHJhbmdlc1xuICAgIHBvaW50U2l6ZURpbXM6IGdsLmdldFBhcmFtZXRlcihHTF9BTElBU0VEX1BPSU5UX1NJWkVfUkFOR0UpLFxuICAgIGxpbmVXaWR0aERpbXM6IGdsLmdldFBhcmFtZXRlcihHTF9BTElBU0VEX0xJTkVfV0lEVEhfUkFOR0UpLFxuICAgIG1heFZpZXdwb3J0RGltczogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9WSUVXUE9SVF9ESU1TKSxcbiAgICBtYXhDb21iaW5lZFRleHR1cmVVbml0czogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9DT01CSU5FRF9URVhUVVJFX0lNQUdFX1VOSVRTKSxcbiAgICBtYXhDdWJlTWFwU2l6ZTogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9DVUJFX01BUF9URVhUVVJFX1NJWkUpLFxuICAgIG1heFJlbmRlcmJ1ZmZlclNpemU6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfUkVOREVSQlVGRkVSX1NJWkUpLFxuICAgIG1heFRleHR1cmVVbml0czogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9URVhUVVJFX0lNQUdFX1VOSVRTKSxcbiAgICBtYXhUZXh0dXJlU2l6ZTogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9URVhUVVJFX1NJWkUpLFxuICAgIG1heEF0dHJpYnV0ZXM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVkVSVEVYX0FUVFJJQlMpLFxuICAgIG1heFZlcnRleFVuaWZvcm1zOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1ZFUlRFWF9VTklGT1JNX1ZFQ1RPUlMpLFxuICAgIG1heFZlcnRleFRleHR1cmVVbml0czogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9WRVJURVhfVEVYVFVSRV9JTUFHRV9VTklUUyksXG4gICAgbWF4VmFyeWluZ1ZlY3RvcnM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVkFSWUlOR19WRUNUT1JTKSxcbiAgICBtYXhGcmFnbWVudFVuaWZvcm1zOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0ZSQUdNRU5UX1VOSUZPUk1fVkVDVE9SUyksXG5cbiAgICAvLyB2ZW5kb3IgaW5mb1xuICAgIGdsc2w6IGdsLmdldFBhcmFtZXRlcihHTF9TSEFESU5HX0xBTkdVQUdFX1ZFUlNJT04pLFxuICAgIHJlbmRlcmVyOiBnbC5nZXRQYXJhbWV0ZXIoR0xfUkVOREVSRVIpLFxuICAgIHZlbmRvcjogZ2wuZ2V0UGFyYW1ldGVyKEdMX1ZFTkRPUiksXG4gICAgdmVyc2lvbjogZ2wuZ2V0UGFyYW1ldGVyKEdMX1ZFUlNJT04pXG4gIH1cbn1cbiIsInZhciBjaGVjayA9IHJlcXVpcmUoJy4vdXRpbC9jaGVjaycpXG52YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi91dGlsL2lzLXR5cGVkLWFycmF5JylcblxudmFyIEdMX1JHQkEgPSA2NDA4XG52YXIgR0xfVU5TSUdORURfQllURSA9IDUxMjFcbnZhciBHTF9QQUNLX0FMSUdOTUVOVCA9IDB4MEQwNVxudmFyIEdMX0ZMT0FUID0gMHgxNDA2IC8vIDUxMjZcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwUmVhZFBpeGVscyAoXG4gIGdsLFxuICBmcmFtZWJ1ZmZlclN0YXRlLFxuICByZWdsUG9sbCxcbiAgY29udGV4dCxcbiAgZ2xBdHRyaWJ1dGVzLFxuICBleHRlbnNpb25zKSB7XG4gIGZ1bmN0aW9uIHJlYWRQaXhlbHNJbXBsIChpbnB1dCkge1xuICAgIHZhciB0eXBlXG4gICAgaWYgKGZyYW1lYnVmZmVyU3RhdGUubmV4dCA9PT0gbnVsbCkge1xuICAgICAgY2hlY2soXG4gICAgICAgIGdsQXR0cmlidXRlcy5wcmVzZXJ2ZURyYXdpbmdCdWZmZXIsXG4gICAgICAgICd5b3UgbXVzdCBjcmVhdGUgYSB3ZWJnbCBjb250ZXh0IHdpdGggXCJwcmVzZXJ2ZURyYXdpbmdCdWZmZXJcIjp0cnVlIGluIG9yZGVyIHRvIHJlYWQgcGl4ZWxzIGZyb20gdGhlIGRyYXdpbmcgYnVmZmVyJylcbiAgICAgIHR5cGUgPSBHTF9VTlNJR05FRF9CWVRFXG4gICAgfSBlbHNlIHtcbiAgICAgIGNoZWNrKFxuICAgICAgICBmcmFtZWJ1ZmZlclN0YXRlLm5leHQuY29sb3JBdHRhY2htZW50c1swXS50ZXh0dXJlICE9PSBudWxsLFxuICAgICAgICAgICdZb3UgY2Fubm90IHJlYWQgZnJvbSBhIHJlbmRlcmJ1ZmZlcicpXG4gICAgICB0eXBlID0gZnJhbWVidWZmZXJTdGF0ZS5uZXh0LmNvbG9yQXR0YWNobWVudHNbMF0udGV4dHVyZS5fdGV4dHVyZS50eXBlXG5cbiAgICAgIGlmIChleHRlbnNpb25zLm9lc190ZXh0dXJlX2Zsb2F0KSB7XG4gICAgICAgIGNoZWNrKFxuICAgICAgICAgIHR5cGUgPT09IEdMX1VOU0lHTkVEX0JZVEUgfHwgdHlwZSA9PT0gR0xfRkxPQVQsXG4gICAgICAgICAgJ1JlYWRpbmcgZnJvbSBhIGZyYW1lYnVmZmVyIGlzIG9ubHkgYWxsb3dlZCBmb3IgdGhlIHR5cGVzIFxcJ3VpbnQ4XFwnIGFuZCBcXCdmbG9hdFxcJycpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjaGVjayhcbiAgICAgICAgICB0eXBlID09PSBHTF9VTlNJR05FRF9CWVRFLFxuICAgICAgICAgICdSZWFkaW5nIGZyb20gYSBmcmFtZWJ1ZmZlciBpcyBvbmx5IGFsbG93ZWQgZm9yIHRoZSB0eXBlIFxcJ3VpbnQ4XFwnJylcbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgeCA9IDBcbiAgICB2YXIgeSA9IDBcbiAgICB2YXIgd2lkdGggPSBjb250ZXh0LmZyYW1lYnVmZmVyV2lkdGhcbiAgICB2YXIgaGVpZ2h0ID0gY29udGV4dC5mcmFtZWJ1ZmZlckhlaWdodFxuICAgIHZhciBkYXRhID0gbnVsbFxuXG4gICAgaWYgKGlzVHlwZWRBcnJheShpbnB1dCkpIHtcbiAgICAgIGRhdGEgPSBpbnB1dFxuICAgIH0gZWxzZSBpZiAoaW5wdXQpIHtcbiAgICAgIGNoZWNrLnR5cGUoaW5wdXQsICdvYmplY3QnLCAnaW52YWxpZCBhcmd1bWVudHMgdG8gcmVnbC5yZWFkKCknKVxuICAgICAgeCA9IGlucHV0LnggfCAwXG4gICAgICB5ID0gaW5wdXQueSB8IDBcbiAgICAgIGNoZWNrKFxuICAgICAgICB4ID49IDAgJiYgeCA8IGNvbnRleHQuZnJhbWVidWZmZXJXaWR0aCxcbiAgICAgICAgJ2ludmFsaWQgeCBvZmZzZXQgZm9yIHJlZ2wucmVhZCcpXG4gICAgICBjaGVjayhcbiAgICAgICAgeSA+PSAwICYmIHkgPCBjb250ZXh0LmZyYW1lYnVmZmVySGVpZ2h0LFxuICAgICAgICAnaW52YWxpZCB5IG9mZnNldCBmb3IgcmVnbC5yZWFkJylcbiAgICAgIHdpZHRoID0gKGlucHV0LndpZHRoIHx8IChjb250ZXh0LmZyYW1lYnVmZmVyV2lkdGggLSB4KSkgfCAwXG4gICAgICBoZWlnaHQgPSAoaW5wdXQuaGVpZ2h0IHx8IChjb250ZXh0LmZyYW1lYnVmZmVySGVpZ2h0IC0geSkpIHwgMFxuICAgICAgZGF0YSA9IGlucHV0LmRhdGEgfHwgbnVsbFxuICAgIH1cblxuICAgIC8vIHNhbml0eSBjaGVjayBpbnB1dC5kYXRhXG4gICAgaWYgKGRhdGEpIHtcbiAgICAgIGlmICh0eXBlID09PSBHTF9VTlNJR05FRF9CWVRFKSB7XG4gICAgICAgIGNoZWNrKFxuICAgICAgICAgIGRhdGEgaW5zdGFuY2VvZiBVaW50OEFycmF5LFxuICAgICAgICAgICdidWZmZXIgbXVzdCBiZSBcXCdVaW50OEFycmF5XFwnIHdoZW4gcmVhZGluZyBmcm9tIGEgZnJhbWVidWZmZXIgb2YgdHlwZSBcXCd1aW50OFxcJycpXG4gICAgICB9IGVsc2UgaWYgKHR5cGUgPT09IEdMX0ZMT0FUKSB7XG4gICAgICAgIGNoZWNrKFxuICAgICAgICAgIGRhdGEgaW5zdGFuY2VvZiBGbG9hdDMyQXJyYXksXG4gICAgICAgICAgJ2J1ZmZlciBtdXN0IGJlIFxcJ0Zsb2F0MzJBcnJheVxcJyB3aGVuIHJlYWRpbmcgZnJvbSBhIGZyYW1lYnVmZmVyIG9mIHR5cGUgXFwnZmxvYXRcXCcnKVxuICAgICAgfVxuICAgIH1cblxuICAgIGNoZWNrKFxuICAgICAgd2lkdGggPiAwICYmIHdpZHRoICsgeCA8PSBjb250ZXh0LmZyYW1lYnVmZmVyV2lkdGgsXG4gICAgICAnaW52YWxpZCB3aWR0aCBmb3IgcmVhZCBwaXhlbHMnKVxuICAgIGNoZWNrKFxuICAgICAgaGVpZ2h0ID4gMCAmJiBoZWlnaHQgKyB5IDw9IGNvbnRleHQuZnJhbWVidWZmZXJIZWlnaHQsXG4gICAgICAnaW52YWxpZCBoZWlnaHQgZm9yIHJlYWQgcGl4ZWxzJylcblxuICAgIC8vIFVwZGF0ZSBXZWJHTCBzdGF0ZVxuICAgIHJlZ2xQb2xsKClcblxuICAgIC8vIENvbXB1dGUgc2l6ZVxuICAgIHZhciBzaXplID0gd2lkdGggKiBoZWlnaHQgKiA0XG5cbiAgICAvLyBBbGxvY2F0ZSBkYXRhXG4gICAgaWYgKCFkYXRhKSB7XG4gICAgICBpZiAodHlwZSA9PT0gR0xfVU5TSUdORURfQllURSkge1xuICAgICAgICBkYXRhID0gbmV3IFVpbnQ4QXJyYXkoc2l6ZSlcbiAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gR0xfRkxPQVQpIHtcbiAgICAgICAgZGF0YSA9IGRhdGEgfHwgbmV3IEZsb2F0MzJBcnJheShzaXplKVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFR5cGUgY2hlY2tcbiAgICBjaGVjay5pc1R5cGVkQXJyYXkoZGF0YSwgJ2RhdGEgYnVmZmVyIGZvciByZWdsLnJlYWQoKSBtdXN0IGJlIGEgdHlwZWRhcnJheScpXG4gICAgY2hlY2soZGF0YS5ieXRlTGVuZ3RoID49IHNpemUsICdkYXRhIGJ1ZmZlciBmb3IgcmVnbC5yZWFkKCkgdG9vIHNtYWxsJylcblxuICAgIC8vIFJ1biByZWFkIHBpeGVsc1xuICAgIGdsLnBpeGVsU3RvcmVpKEdMX1BBQ0tfQUxJR05NRU5ULCA0KVxuICAgIGdsLnJlYWRQaXhlbHMoeCwgeSwgd2lkdGgsIGhlaWdodCwgR0xfUkdCQSxcbiAgICAgICAgICAgICAgICAgIHR5cGUsXG4gICAgICAgICAgICAgICAgICBkYXRhKVxuXG4gICAgcmV0dXJuIGRhdGFcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlYWRQaXhlbHNGQk8gKG9wdGlvbnMpIHtcbiAgICB2YXIgcmVzdWx0XG4gICAgZnJhbWVidWZmZXJTdGF0ZS5zZXRGQk8oe1xuICAgICAgZnJhbWVidWZmZXI6IG9wdGlvbnMuZnJhbWVidWZmZXJcbiAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICByZXN1bHQgPSByZWFkUGl4ZWxzSW1wbChvcHRpb25zKVxuICAgIH0pXG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG5cbiAgZnVuY3Rpb24gcmVhZFBpeGVscyAob3B0aW9ucykge1xuICAgIGlmICghb3B0aW9ucyB8fCAhKCdmcmFtZWJ1ZmZlcicgaW4gb3B0aW9ucykpIHtcbiAgICAgIHJldHVybiByZWFkUGl4ZWxzSW1wbChvcHRpb25zKVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gcmVhZFBpeGVsc0ZCTyhvcHRpb25zKVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiByZWFkUGl4ZWxzXG59XG4iLCJ2YXIgY2hlY2sgPSByZXF1aXJlKCcuL3V0aWwvY2hlY2snKVxudmFyIHZhbHVlcyA9IHJlcXVpcmUoJy4vdXRpbC92YWx1ZXMnKVxuXG52YXIgR0xfUkVOREVSQlVGRkVSID0gMHg4RDQxXG5cbnZhciBHTF9SR0JBNCA9IDB4ODA1NlxudmFyIEdMX1JHQjVfQTEgPSAweDgwNTdcbnZhciBHTF9SR0I1NjUgPSAweDhENjJcbnZhciBHTF9ERVBUSF9DT01QT05FTlQxNiA9IDB4ODFBNVxudmFyIEdMX1NURU5DSUxfSU5ERVg4ID0gMHg4RDQ4XG52YXIgR0xfREVQVEhfU1RFTkNJTCA9IDB4ODRGOVxuXG52YXIgR0xfU1JHQjhfQUxQSEE4X0VYVCA9IDB4OEM0M1xuXG52YXIgR0xfUkdCQTMyRl9FWFQgPSAweDg4MTRcblxudmFyIEdMX1JHQkExNkZfRVhUID0gMHg4ODFBXG52YXIgR0xfUkdCMTZGX0VYVCA9IDB4ODgxQlxuXG52YXIgRk9STUFUX1NJWkVTID0gW11cblxuRk9STUFUX1NJWkVTW0dMX1JHQkE0XSA9IDJcbkZPUk1BVF9TSVpFU1tHTF9SR0I1X0ExXSA9IDJcbkZPUk1BVF9TSVpFU1tHTF9SR0I1NjVdID0gMlxuXG5GT1JNQVRfU0laRVNbR0xfREVQVEhfQ09NUE9ORU5UMTZdID0gMlxuRk9STUFUX1NJWkVTW0dMX1NURU5DSUxfSU5ERVg4XSA9IDFcbkZPUk1BVF9TSVpFU1tHTF9ERVBUSF9TVEVOQ0lMXSA9IDRcblxuRk9STUFUX1NJWkVTW0dMX1NSR0I4X0FMUEhBOF9FWFRdID0gNFxuRk9STUFUX1NJWkVTW0dMX1JHQkEzMkZfRVhUXSA9IDE2XG5GT1JNQVRfU0laRVNbR0xfUkdCQTE2Rl9FWFRdID0gOFxuRk9STUFUX1NJWkVTW0dMX1JHQjE2Rl9FWFRdID0gNlxuXG5mdW5jdGlvbiBnZXRSZW5kZXJidWZmZXJTaXplIChmb3JtYXQsIHdpZHRoLCBoZWlnaHQpIHtcbiAgcmV0dXJuIEZPUk1BVF9TSVpFU1tmb3JtYXRdICogd2lkdGggKiBoZWlnaHRcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoZ2wsIGV4dGVuc2lvbnMsIGxpbWl0cywgc3RhdHMsIGNvbmZpZykge1xuICB2YXIgZm9ybWF0VHlwZXMgPSB7XG4gICAgJ3JnYmE0JzogR0xfUkdCQTQsXG4gICAgJ3JnYjU2NSc6IEdMX1JHQjU2NSxcbiAgICAncmdiNSBhMSc6IEdMX1JHQjVfQTEsXG4gICAgJ2RlcHRoJzogR0xfREVQVEhfQ09NUE9ORU5UMTYsXG4gICAgJ3N0ZW5jaWwnOiBHTF9TVEVOQ0lMX0lOREVYOCxcbiAgICAnZGVwdGggc3RlbmNpbCc6IEdMX0RFUFRIX1NURU5DSUxcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLmV4dF9zcmdiKSB7XG4gICAgZm9ybWF0VHlwZXNbJ3NyZ2JhJ10gPSBHTF9TUkdCOF9BTFBIQThfRVhUXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5leHRfY29sb3JfYnVmZmVyX2hhbGZfZmxvYXQpIHtcbiAgICBmb3JtYXRUeXBlc1sncmdiYTE2ZiddID0gR0xfUkdCQTE2Rl9FWFRcbiAgICBmb3JtYXRUeXBlc1sncmdiMTZmJ10gPSBHTF9SR0IxNkZfRVhUXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb2xvcl9idWZmZXJfZmxvYXQpIHtcbiAgICBmb3JtYXRUeXBlc1sncmdiYTMyZiddID0gR0xfUkdCQTMyRl9FWFRcbiAgfVxuXG4gIHZhciBmb3JtYXRUeXBlc0ludmVydCA9IFtdXG4gIE9iamVjdC5rZXlzKGZvcm1hdFR5cGVzKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICB2YXIgdmFsID0gZm9ybWF0VHlwZXNba2V5XVxuICAgIGZvcm1hdFR5cGVzSW52ZXJ0W3ZhbF0gPSBrZXlcbiAgfSlcblxuICB2YXIgcmVuZGVyYnVmZmVyQ291bnQgPSAwXG4gIHZhciByZW5kZXJidWZmZXJTZXQgPSB7fVxuXG4gIGZ1bmN0aW9uIFJFR0xSZW5kZXJidWZmZXIgKHJlbmRlcmJ1ZmZlcikge1xuICAgIHRoaXMuaWQgPSByZW5kZXJidWZmZXJDb3VudCsrXG4gICAgdGhpcy5yZWZDb3VudCA9IDFcblxuICAgIHRoaXMucmVuZGVyYnVmZmVyID0gcmVuZGVyYnVmZmVyXG5cbiAgICB0aGlzLmZvcm1hdCA9IEdMX1JHQkE0XG4gICAgdGhpcy53aWR0aCA9IDBcbiAgICB0aGlzLmhlaWdodCA9IDBcblxuICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgdGhpcy5zdGF0cyA9IHtzaXplOiAwfVxuICAgIH1cbiAgfVxuXG4gIFJFR0xSZW5kZXJidWZmZXIucHJvdG90eXBlLmRlY1JlZiA9IGZ1bmN0aW9uICgpIHtcbiAgICBpZiAoLS10aGlzLnJlZkNvdW50IDw9IDApIHtcbiAgICAgIGRlc3Ryb3kodGhpcylcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95IChyYikge1xuICAgIHZhciBoYW5kbGUgPSByYi5yZW5kZXJidWZmZXJcbiAgICBjaGVjayhoYW5kbGUsICdtdXN0IG5vdCBkb3VibGUgZGVzdHJveSByZW5kZXJidWZmZXInKVxuICAgIGdsLmJpbmRSZW5kZXJidWZmZXIoR0xfUkVOREVSQlVGRkVSLCBudWxsKVxuICAgIGdsLmRlbGV0ZVJlbmRlcmJ1ZmZlcihoYW5kbGUpXG4gICAgcmIucmVuZGVyYnVmZmVyID0gbnVsbFxuICAgIHJiLnJlZkNvdW50ID0gMFxuICAgIGRlbGV0ZSByZW5kZXJidWZmZXJTZXRbcmIuaWRdXG4gICAgc3RhdHMucmVuZGVyYnVmZmVyQ291bnQtLVxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlUmVuZGVyYnVmZmVyIChhLCBiKSB7XG4gICAgdmFyIHJlbmRlcmJ1ZmZlciA9IG5ldyBSRUdMUmVuZGVyYnVmZmVyKGdsLmNyZWF0ZVJlbmRlcmJ1ZmZlcigpKVxuICAgIHJlbmRlcmJ1ZmZlclNldFtyZW5kZXJidWZmZXIuaWRdID0gcmVuZGVyYnVmZmVyXG4gICAgc3RhdHMucmVuZGVyYnVmZmVyQ291bnQrK1xuXG4gICAgZnVuY3Rpb24gcmVnbFJlbmRlcmJ1ZmZlciAoYSwgYikge1xuICAgICAgdmFyIHcgPSAwXG4gICAgICB2YXIgaCA9IDBcbiAgICAgIHZhciBmb3JtYXQgPSBHTF9SR0JBNFxuXG4gICAgICBpZiAodHlwZW9mIGEgPT09ICdvYmplY3QnICYmIGEpIHtcbiAgICAgICAgdmFyIG9wdGlvbnMgPSBhXG4gICAgICAgIGlmICgnc2hhcGUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB2YXIgc2hhcGUgPSBvcHRpb25zLnNoYXBlXG4gICAgICAgICAgY2hlY2soQXJyYXkuaXNBcnJheShzaGFwZSkgJiYgc2hhcGUubGVuZ3RoID49IDIsXG4gICAgICAgICAgICAnaW52YWxpZCByZW5kZXJidWZmZXIgc2hhcGUnKVxuICAgICAgICAgIHcgPSBzaGFwZVswXSB8IDBcbiAgICAgICAgICBoID0gc2hhcGVbMV0gfCAwXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWYgKCdyYWRpdXMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIHcgPSBoID0gb3B0aW9ucy5yYWRpdXMgfCAwXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgnd2lkdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIHcgPSBvcHRpb25zLndpZHRoIHwgMFxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoJ2hlaWdodCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgaCA9IG9wdGlvbnMuaGVpZ2h0IHwgMFxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoJ2Zvcm1hdCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGNoZWNrLnBhcmFtZXRlcihvcHRpb25zLmZvcm1hdCwgZm9ybWF0VHlwZXMsXG4gICAgICAgICAgICAnaW52YWxpZCByZW5kZXJidWZmZXIgZm9ybWF0JylcbiAgICAgICAgICBmb3JtYXQgPSBmb3JtYXRUeXBlc1tvcHRpb25zLmZvcm1hdF1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgYSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgdyA9IGEgfCAwXG4gICAgICAgIGlmICh0eXBlb2YgYiA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICBoID0gYiB8IDBcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBoID0gd1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKCFhKSB7XG4gICAgICAgIHcgPSBoID0gMVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY2hlY2sucmFpc2UoJ2ludmFsaWQgYXJndW1lbnRzIHRvIHJlbmRlcmJ1ZmZlciBjb25zdHJ1Y3RvcicpXG4gICAgICB9XG5cbiAgICAgIC8vIGNoZWNrIHNoYXBlXG4gICAgICBjaGVjayhcbiAgICAgICAgdyA+IDAgJiYgaCA+IDAgJiZcbiAgICAgICAgdyA8PSBsaW1pdHMubWF4UmVuZGVyYnVmZmVyU2l6ZSAmJiBoIDw9IGxpbWl0cy5tYXhSZW5kZXJidWZmZXJTaXplLFxuICAgICAgICAnaW52YWxpZCByZW5kZXJidWZmZXIgc2l6ZScpXG5cbiAgICAgIGlmICh3ID09PSByZW5kZXJidWZmZXIud2lkdGggJiZcbiAgICAgICAgICBoID09PSByZW5kZXJidWZmZXIuaGVpZ2h0ICYmXG4gICAgICAgICAgZm9ybWF0ID09PSByZW5kZXJidWZmZXIuZm9ybWF0KSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuXG4gICAgICByZWdsUmVuZGVyYnVmZmVyLndpZHRoID0gcmVuZGVyYnVmZmVyLndpZHRoID0gd1xuICAgICAgcmVnbFJlbmRlcmJ1ZmZlci5oZWlnaHQgPSByZW5kZXJidWZmZXIuaGVpZ2h0ID0gaFxuICAgICAgcmVuZGVyYnVmZmVyLmZvcm1hdCA9IGZvcm1hdFxuXG4gICAgICBnbC5iaW5kUmVuZGVyYnVmZmVyKEdMX1JFTkRFUkJVRkZFUiwgcmVuZGVyYnVmZmVyLnJlbmRlcmJ1ZmZlcilcbiAgICAgIGdsLnJlbmRlcmJ1ZmZlclN0b3JhZ2UoR0xfUkVOREVSQlVGRkVSLCBmb3JtYXQsIHcsIGgpXG5cbiAgICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgICByZW5kZXJidWZmZXIuc3RhdHMuc2l6ZSA9IGdldFJlbmRlcmJ1ZmZlclNpemUocmVuZGVyYnVmZmVyLmZvcm1hdCwgcmVuZGVyYnVmZmVyLndpZHRoLCByZW5kZXJidWZmZXIuaGVpZ2h0KVxuICAgICAgfVxuICAgICAgcmVnbFJlbmRlcmJ1ZmZlci5mb3JtYXQgPSBmb3JtYXRUeXBlc0ludmVydFtyZW5kZXJidWZmZXIuZm9ybWF0XVxuXG4gICAgICByZXR1cm4gcmVnbFJlbmRlcmJ1ZmZlclxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlc2l6ZSAod18sIGhfKSB7XG4gICAgICB2YXIgdyA9IHdfIHwgMFxuICAgICAgdmFyIGggPSAoaF8gfCAwKSB8fCB3XG5cbiAgICAgIGlmICh3ID09PSByZW5kZXJidWZmZXIud2lkdGggJiYgaCA9PT0gcmVuZGVyYnVmZmVyLmhlaWdodCkge1xuICAgICAgICByZXR1cm4gcmVnbFJlbmRlcmJ1ZmZlclxuICAgICAgfVxuXG4gICAgICAvLyBjaGVjayBzaGFwZVxuICAgICAgY2hlY2soXG4gICAgICAgIHcgPiAwICYmIGggPiAwICYmXG4gICAgICAgIHcgPD0gbGltaXRzLm1heFJlbmRlcmJ1ZmZlclNpemUgJiYgaCA8PSBsaW1pdHMubWF4UmVuZGVyYnVmZmVyU2l6ZSxcbiAgICAgICAgJ2ludmFsaWQgcmVuZGVyYnVmZmVyIHNpemUnKVxuXG4gICAgICByZWdsUmVuZGVyYnVmZmVyLndpZHRoID0gcmVuZGVyYnVmZmVyLndpZHRoID0gd1xuICAgICAgcmVnbFJlbmRlcmJ1ZmZlci5oZWlnaHQgPSByZW5kZXJidWZmZXIuaGVpZ2h0ID0gaFxuXG4gICAgICBnbC5iaW5kUmVuZGVyYnVmZmVyKEdMX1JFTkRFUkJVRkZFUiwgcmVuZGVyYnVmZmVyLnJlbmRlcmJ1ZmZlcilcbiAgICAgIGdsLnJlbmRlcmJ1ZmZlclN0b3JhZ2UoR0xfUkVOREVSQlVGRkVSLCByZW5kZXJidWZmZXIuZm9ybWF0LCB3LCBoKVxuXG4gICAgICAvLyBhbHNvLCByZWNvbXB1dGUgc2l6ZS5cbiAgICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgICByZW5kZXJidWZmZXIuc3RhdHMuc2l6ZSA9IGdldFJlbmRlcmJ1ZmZlclNpemUoXG4gICAgICAgICAgcmVuZGVyYnVmZmVyLmZvcm1hdCwgcmVuZGVyYnVmZmVyLndpZHRoLCByZW5kZXJidWZmZXIuaGVpZ2h0KVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmVnbFJlbmRlcmJ1ZmZlclxuICAgIH1cblxuICAgIHJlZ2xSZW5kZXJidWZmZXIoYSwgYilcblxuICAgIHJlZ2xSZW5kZXJidWZmZXIucmVzaXplID0gcmVzaXplXG4gICAgcmVnbFJlbmRlcmJ1ZmZlci5fcmVnbFR5cGUgPSAncmVuZGVyYnVmZmVyJ1xuICAgIHJlZ2xSZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlciA9IHJlbmRlcmJ1ZmZlclxuICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgcmVnbFJlbmRlcmJ1ZmZlci5zdGF0cyA9IHJlbmRlcmJ1ZmZlci5zdGF0c1xuICAgIH1cbiAgICByZWdsUmVuZGVyYnVmZmVyLmRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7XG4gICAgICByZW5kZXJidWZmZXIuZGVjUmVmKClcbiAgICB9XG5cbiAgICByZXR1cm4gcmVnbFJlbmRlcmJ1ZmZlclxuICB9XG5cbiAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgc3RhdHMuZ2V0VG90YWxSZW5kZXJidWZmZXJTaXplID0gZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIHRvdGFsID0gMFxuICAgICAgT2JqZWN0LmtleXMocmVuZGVyYnVmZmVyU2V0KS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgdG90YWwgKz0gcmVuZGVyYnVmZmVyU2V0W2tleV0uc3RhdHMuc2l6ZVxuICAgICAgfSlcbiAgICAgIHJldHVybiB0b3RhbFxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHJlc3RvcmVSZW5kZXJidWZmZXJzICgpIHtcbiAgICB2YWx1ZXMocmVuZGVyYnVmZmVyU2V0KS5mb3JFYWNoKGZ1bmN0aW9uIChyYikge1xuICAgICAgcmIucmVuZGVyYnVmZmVyID0gZ2wuY3JlYXRlUmVuZGVyYnVmZmVyKClcbiAgICAgIGdsLmJpbmRSZW5kZXJidWZmZXIoR0xfUkVOREVSQlVGRkVSLCByYi5yZW5kZXJidWZmZXIpXG4gICAgICBnbC5yZW5kZXJidWZmZXJTdG9yYWdlKEdMX1JFTkRFUkJVRkZFUiwgcmIuZm9ybWF0LCByYi53aWR0aCwgcmIuaGVpZ2h0KVxuICAgIH0pXG4gICAgZ2wuYmluZFJlbmRlcmJ1ZmZlcihHTF9SRU5ERVJCVUZGRVIsIG51bGwpXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNyZWF0ZTogY3JlYXRlUmVuZGVyYnVmZmVyLFxuICAgIGNsZWFyOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YWx1ZXMocmVuZGVyYnVmZmVyU2V0KS5mb3JFYWNoKGRlc3Ryb3kpXG4gICAgfSxcbiAgICByZXN0b3JlOiByZXN0b3JlUmVuZGVyYnVmZmVyc1xuICB9XG59XG4iLCJ2YXIgY2hlY2sgPSByZXF1aXJlKCcuL3V0aWwvY2hlY2snKVxudmFyIHZhbHVlcyA9IHJlcXVpcmUoJy4vdXRpbC92YWx1ZXMnKVxuXG52YXIgR0xfRlJBR01FTlRfU0hBREVSID0gMzU2MzJcbnZhciBHTF9WRVJURVhfU0hBREVSID0gMzU2MzNcblxudmFyIEdMX0FDVElWRV9VTklGT1JNUyA9IDB4OEI4NlxudmFyIEdMX0FDVElWRV9BVFRSSUJVVEVTID0gMHg4Qjg5XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcFNoYWRlclN0YXRlIChnbCwgc3RyaW5nU3RvcmUsIHN0YXRzLCBjb25maWcpIHtcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIGdsc2wgY29tcGlsYXRpb24gYW5kIGxpbmtpbmdcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIHZhciBmcmFnU2hhZGVycyA9IHt9XG4gIHZhciB2ZXJ0U2hhZGVycyA9IHt9XG5cbiAgZnVuY3Rpb24gQWN0aXZlSW5mbyAobmFtZSwgaWQsIGxvY2F0aW9uLCBpbmZvKSB7XG4gICAgdGhpcy5uYW1lID0gbmFtZVxuICAgIHRoaXMuaWQgPSBpZFxuICAgIHRoaXMubG9jYXRpb24gPSBsb2NhdGlvblxuICAgIHRoaXMuaW5mbyA9IGluZm9cbiAgfVxuXG4gIGZ1bmN0aW9uIGluc2VydEFjdGl2ZUluZm8gKGxpc3QsIGluZm8pIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxpc3QubGVuZ3RoOyArK2kpIHtcbiAgICAgIGlmIChsaXN0W2ldLmlkID09PSBpbmZvLmlkKSB7XG4gICAgICAgIGxpc3RbaV0ubG9jYXRpb24gPSBpbmZvLmxvY2F0aW9uXG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgIH1cbiAgICBsaXN0LnB1c2goaW5mbylcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldFNoYWRlciAodHlwZSwgaWQsIGNvbW1hbmQpIHtcbiAgICB2YXIgY2FjaGUgPSB0eXBlID09PSBHTF9GUkFHTUVOVF9TSEFERVIgPyBmcmFnU2hhZGVycyA6IHZlcnRTaGFkZXJzXG4gICAgdmFyIHNoYWRlciA9IGNhY2hlW2lkXVxuXG4gICAgaWYgKCFzaGFkZXIpIHtcbiAgICAgIHZhciBzb3VyY2UgPSBzdHJpbmdTdG9yZS5zdHIoaWQpXG4gICAgICBzaGFkZXIgPSBnbC5jcmVhdGVTaGFkZXIodHlwZSlcbiAgICAgIGdsLnNoYWRlclNvdXJjZShzaGFkZXIsIHNvdXJjZSlcbiAgICAgIGdsLmNvbXBpbGVTaGFkZXIoc2hhZGVyKVxuICAgICAgY2hlY2suc2hhZGVyRXJyb3IoZ2wsIHNoYWRlciwgc291cmNlLCB0eXBlLCBjb21tYW5kKVxuICAgICAgY2FjaGVbaWRdID0gc2hhZGVyXG4gICAgfVxuXG4gICAgcmV0dXJuIHNoYWRlclxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIHByb2dyYW0gbGlua2luZ1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgdmFyIHByb2dyYW1DYWNoZSA9IHt9XG4gIHZhciBwcm9ncmFtTGlzdCA9IFtdXG5cbiAgdmFyIFBST0dSQU1fQ09VTlRFUiA9IDBcblxuICBmdW5jdGlvbiBSRUdMUHJvZ3JhbSAoZnJhZ0lkLCB2ZXJ0SWQpIHtcbiAgICB0aGlzLmlkID0gUFJPR1JBTV9DT1VOVEVSKytcbiAgICB0aGlzLmZyYWdJZCA9IGZyYWdJZFxuICAgIHRoaXMudmVydElkID0gdmVydElkXG4gICAgdGhpcy5wcm9ncmFtID0gbnVsbFxuICAgIHRoaXMudW5pZm9ybXMgPSBbXVxuICAgIHRoaXMuYXR0cmlidXRlcyA9IFtdXG5cbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgIHRoaXMuc3RhdHMgPSB7XG4gICAgICAgIHVuaWZvcm1zQ291bnQ6IDAsXG4gICAgICAgIGF0dHJpYnV0ZXNDb3VudDogMFxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGxpbmtQcm9ncmFtIChkZXNjLCBjb21tYW5kKSB7XG4gICAgdmFyIGksIGluZm9cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBjb21waWxlICYgbGlua1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICB2YXIgZnJhZ1NoYWRlciA9IGdldFNoYWRlcihHTF9GUkFHTUVOVF9TSEFERVIsIGRlc2MuZnJhZ0lkKVxuICAgIHZhciB2ZXJ0U2hhZGVyID0gZ2V0U2hhZGVyKEdMX1ZFUlRFWF9TSEFERVIsIGRlc2MudmVydElkKVxuXG4gICAgdmFyIHByb2dyYW0gPSBkZXNjLnByb2dyYW0gPSBnbC5jcmVhdGVQcm9ncmFtKClcbiAgICBnbC5hdHRhY2hTaGFkZXIocHJvZ3JhbSwgZnJhZ1NoYWRlcilcbiAgICBnbC5hdHRhY2hTaGFkZXIocHJvZ3JhbSwgdmVydFNoYWRlcilcbiAgICBnbC5saW5rUHJvZ3JhbShwcm9ncmFtKVxuICAgIGNoZWNrLmxpbmtFcnJvcihcbiAgICAgIGdsLFxuICAgICAgcHJvZ3JhbSxcbiAgICAgIHN0cmluZ1N0b3JlLnN0cihkZXNjLmZyYWdJZCksXG4gICAgICBzdHJpbmdTdG9yZS5zdHIoZGVzYy52ZXJ0SWQpLFxuICAgICAgY29tbWFuZClcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBncmFiIHVuaWZvcm1zXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHZhciBudW1Vbmlmb3JtcyA9IGdsLmdldFByb2dyYW1QYXJhbWV0ZXIocHJvZ3JhbSwgR0xfQUNUSVZFX1VOSUZPUk1TKVxuICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgZGVzYy5zdGF0cy51bmlmb3Jtc0NvdW50ID0gbnVtVW5pZm9ybXNcbiAgICB9XG4gICAgdmFyIHVuaWZvcm1zID0gZGVzYy51bmlmb3Jtc1xuICAgIGZvciAoaSA9IDA7IGkgPCBudW1Vbmlmb3JtczsgKytpKSB7XG4gICAgICBpbmZvID0gZ2wuZ2V0QWN0aXZlVW5pZm9ybShwcm9ncmFtLCBpKVxuICAgICAgaWYgKGluZm8pIHtcbiAgICAgICAgaWYgKGluZm8uc2l6ZSA+IDEpIHtcbiAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGluZm8uc2l6ZTsgKytqKSB7XG4gICAgICAgICAgICB2YXIgbmFtZSA9IGluZm8ubmFtZS5yZXBsYWNlKCdbMF0nLCAnWycgKyBqICsgJ10nKVxuICAgICAgICAgICAgaW5zZXJ0QWN0aXZlSW5mbyh1bmlmb3JtcywgbmV3IEFjdGl2ZUluZm8oXG4gICAgICAgICAgICAgIG5hbWUsXG4gICAgICAgICAgICAgIHN0cmluZ1N0b3JlLmlkKG5hbWUpLFxuICAgICAgICAgICAgICBnbC5nZXRVbmlmb3JtTG9jYXRpb24ocHJvZ3JhbSwgbmFtZSksXG4gICAgICAgICAgICAgIGluZm8pKVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpbnNlcnRBY3RpdmVJbmZvKHVuaWZvcm1zLCBuZXcgQWN0aXZlSW5mbyhcbiAgICAgICAgICAgIGluZm8ubmFtZSxcbiAgICAgICAgICAgIHN0cmluZ1N0b3JlLmlkKGluZm8ubmFtZSksXG4gICAgICAgICAgICBnbC5nZXRVbmlmb3JtTG9jYXRpb24ocHJvZ3JhbSwgaW5mby5uYW1lKSxcbiAgICAgICAgICAgIGluZm8pKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGdyYWIgYXR0cmlidXRlc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICB2YXIgbnVtQXR0cmlidXRlcyA9IGdsLmdldFByb2dyYW1QYXJhbWV0ZXIocHJvZ3JhbSwgR0xfQUNUSVZFX0FUVFJJQlVURVMpXG4gICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICBkZXNjLnN0YXRzLmF0dHJpYnV0ZXNDb3VudCA9IG51bUF0dHJpYnV0ZXNcbiAgICB9XG5cbiAgICB2YXIgYXR0cmlidXRlcyA9IGRlc2MuYXR0cmlidXRlc1xuICAgIGZvciAoaSA9IDA7IGkgPCBudW1BdHRyaWJ1dGVzOyArK2kpIHtcbiAgICAgIGluZm8gPSBnbC5nZXRBY3RpdmVBdHRyaWIocHJvZ3JhbSwgaSlcbiAgICAgIGlmIChpbmZvKSB7XG4gICAgICAgIGluc2VydEFjdGl2ZUluZm8oYXR0cmlidXRlcywgbmV3IEFjdGl2ZUluZm8oXG4gICAgICAgICAgaW5mby5uYW1lLFxuICAgICAgICAgIHN0cmluZ1N0b3JlLmlkKGluZm8ubmFtZSksXG4gICAgICAgICAgZ2wuZ2V0QXR0cmliTG9jYXRpb24ocHJvZ3JhbSwgaW5mby5uYW1lKSxcbiAgICAgICAgICBpbmZvKSlcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICBzdGF0cy5nZXRNYXhVbmlmb3Jtc0NvdW50ID0gZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIG0gPSAwXG4gICAgICBwcm9ncmFtTGlzdC5mb3JFYWNoKGZ1bmN0aW9uIChkZXNjKSB7XG4gICAgICAgIGlmIChkZXNjLnN0YXRzLnVuaWZvcm1zQ291bnQgPiBtKSB7XG4gICAgICAgICAgbSA9IGRlc2Muc3RhdHMudW5pZm9ybXNDb3VudFxuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgcmV0dXJuIG1cbiAgICB9XG5cbiAgICBzdGF0cy5nZXRNYXhBdHRyaWJ1dGVzQ291bnQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgbSA9IDBcbiAgICAgIHByb2dyYW1MaXN0LmZvckVhY2goZnVuY3Rpb24gKGRlc2MpIHtcbiAgICAgICAgaWYgKGRlc2Muc3RhdHMuYXR0cmlidXRlc0NvdW50ID4gbSkge1xuICAgICAgICAgIG0gPSBkZXNjLnN0YXRzLmF0dHJpYnV0ZXNDb3VudFxuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgcmV0dXJuIG1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiByZXN0b3JlU2hhZGVycyAoKSB7XG4gICAgZnJhZ1NoYWRlcnMgPSB7fVxuICAgIHZlcnRTaGFkZXJzID0ge31cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHByb2dyYW1MaXN0Lmxlbmd0aDsgKytpKSB7XG4gICAgICBsaW5rUHJvZ3JhbShwcm9ncmFtTGlzdFtpXSlcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNsZWFyOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgZGVsZXRlU2hhZGVyID0gZ2wuZGVsZXRlU2hhZGVyLmJpbmQoZ2wpXG4gICAgICB2YWx1ZXMoZnJhZ1NoYWRlcnMpLmZvckVhY2goZGVsZXRlU2hhZGVyKVxuICAgICAgZnJhZ1NoYWRlcnMgPSB7fVxuICAgICAgdmFsdWVzKHZlcnRTaGFkZXJzKS5mb3JFYWNoKGRlbGV0ZVNoYWRlcilcbiAgICAgIHZlcnRTaGFkZXJzID0ge31cblxuICAgICAgcHJvZ3JhbUxpc3QuZm9yRWFjaChmdW5jdGlvbiAoZGVzYykge1xuICAgICAgICBnbC5kZWxldGVQcm9ncmFtKGRlc2MucHJvZ3JhbSlcbiAgICAgIH0pXG4gICAgICBwcm9ncmFtTGlzdC5sZW5ndGggPSAwXG4gICAgICBwcm9ncmFtQ2FjaGUgPSB7fVxuXG4gICAgICBzdGF0cy5zaGFkZXJDb3VudCA9IDBcbiAgICB9LFxuXG4gICAgcHJvZ3JhbTogZnVuY3Rpb24gKHZlcnRJZCwgZnJhZ0lkLCBjb21tYW5kKSB7XG4gICAgICBjaGVjay5jb21tYW5kKHZlcnRJZCA+PSAwLCAnbWlzc2luZyB2ZXJ0ZXggc2hhZGVyJywgY29tbWFuZClcbiAgICAgIGNoZWNrLmNvbW1hbmQoZnJhZ0lkID49IDAsICdtaXNzaW5nIGZyYWdtZW50IHNoYWRlcicsIGNvbW1hbmQpXG5cbiAgICAgIHZhciBjYWNoZSA9IHByb2dyYW1DYWNoZVtmcmFnSWRdXG4gICAgICBpZiAoIWNhY2hlKSB7XG4gICAgICAgIGNhY2hlID0gcHJvZ3JhbUNhY2hlW2ZyYWdJZF0gPSB7fVxuICAgICAgfVxuICAgICAgdmFyIHByb2dyYW0gPSBjYWNoZVt2ZXJ0SWRdXG4gICAgICBpZiAoIXByb2dyYW0pIHtcbiAgICAgICAgcHJvZ3JhbSA9IG5ldyBSRUdMUHJvZ3JhbShmcmFnSWQsIHZlcnRJZClcbiAgICAgICAgc3RhdHMuc2hhZGVyQ291bnQrK1xuXG4gICAgICAgIGxpbmtQcm9ncmFtKHByb2dyYW0sIGNvbW1hbmQpXG4gICAgICAgIGNhY2hlW3ZlcnRJZF0gPSBwcm9ncmFtXG4gICAgICAgIHByb2dyYW1MaXN0LnB1c2gocHJvZ3JhbSlcbiAgICAgIH1cbiAgICAgIHJldHVybiBwcm9ncmFtXG4gICAgfSxcblxuICAgIHJlc3RvcmU6IHJlc3RvcmVTaGFkZXJzLFxuXG4gICAgc2hhZGVyOiBnZXRTaGFkZXIsXG5cbiAgICBmcmFnOiAtMSxcbiAgICB2ZXJ0OiAtMVxuICB9XG59XG4iLCJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gc3RhdHMgKCkge1xuICByZXR1cm4ge1xuICAgIGJ1ZmZlckNvdW50OiAwLFxuICAgIGVsZW1lbnRzQ291bnQ6IDAsXG4gICAgZnJhbWVidWZmZXJDb3VudDogMCxcbiAgICBzaGFkZXJDb3VudDogMCxcbiAgICB0ZXh0dXJlQ291bnQ6IDAsXG4gICAgY3ViZUNvdW50OiAwLFxuICAgIHJlbmRlcmJ1ZmZlckNvdW50OiAwLFxuXG4gICAgbWF4VGV4dHVyZVVuaXRzOiAwXG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY3JlYXRlU3RyaW5nU3RvcmUgKCkge1xuICB2YXIgc3RyaW5nSWRzID0geycnOiAwfVxuICB2YXIgc3RyaW5nVmFsdWVzID0gWycnXVxuICByZXR1cm4ge1xuICAgIGlkOiBmdW5jdGlvbiAoc3RyKSB7XG4gICAgICB2YXIgcmVzdWx0ID0gc3RyaW5nSWRzW3N0cl1cbiAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgfVxuICAgICAgcmVzdWx0ID0gc3RyaW5nSWRzW3N0cl0gPSBzdHJpbmdWYWx1ZXMubGVuZ3RoXG4gICAgICBzdHJpbmdWYWx1ZXMucHVzaChzdHIpXG4gICAgICByZXR1cm4gcmVzdWx0XG4gICAgfSxcblxuICAgIHN0cjogZnVuY3Rpb24gKGlkKSB7XG4gICAgICByZXR1cm4gc3RyaW5nVmFsdWVzW2lkXVxuICAgIH1cbiAgfVxufVxuIiwidmFyIGNoZWNrID0gcmVxdWlyZSgnLi91dGlsL2NoZWNrJylcbnZhciBleHRlbmQgPSByZXF1aXJlKCcuL3V0aWwvZXh0ZW5kJylcbnZhciB2YWx1ZXMgPSByZXF1aXJlKCcuL3V0aWwvdmFsdWVzJylcbnZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL3V0aWwvaXMtdHlwZWQtYXJyYXknKVxudmFyIGlzTkRBcnJheUxpa2UgPSByZXF1aXJlKCcuL3V0aWwvaXMtbmRhcnJheScpXG52YXIgcG9vbCA9IHJlcXVpcmUoJy4vdXRpbC9wb29sJylcbnZhciBjb252ZXJ0VG9IYWxmRmxvYXQgPSByZXF1aXJlKCcuL3V0aWwvdG8taGFsZi1mbG9hdCcpXG52YXIgaXNBcnJheUxpa2UgPSByZXF1aXJlKCcuL3V0aWwvaXMtYXJyYXktbGlrZScpXG52YXIgZmxhdHRlblV0aWxzID0gcmVxdWlyZSgnLi91dGlsL2ZsYXR0ZW4nKVxuXG52YXIgZHR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvYXJyYXl0eXBlcy5qc29uJylcbnZhciBhcnJheVR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvYXJyYXl0eXBlcy5qc29uJylcblxudmFyIEdMX0NPTVBSRVNTRURfVEVYVFVSRV9GT1JNQVRTID0gMHg4NkEzXG5cbnZhciBHTF9URVhUVVJFXzJEID0gMHgwREUxXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUCA9IDB4ODUxM1xudmFyIEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCA9IDB4ODUxNVxuXG52YXIgR0xfUkdCQSA9IDB4MTkwOFxudmFyIEdMX0FMUEhBID0gMHgxOTA2XG52YXIgR0xfUkdCID0gMHgxOTA3XG52YXIgR0xfTFVNSU5BTkNFID0gMHgxOTA5XG52YXIgR0xfTFVNSU5BTkNFX0FMUEhBID0gMHgxOTBBXG5cbnZhciBHTF9SR0JBNCA9IDB4ODA1NlxudmFyIEdMX1JHQjVfQTEgPSAweDgwNTdcbnZhciBHTF9SR0I1NjUgPSAweDhENjJcblxudmFyIEdMX1VOU0lHTkVEX1NIT1JUXzRfNF80XzQgPSAweDgwMzNcbnZhciBHTF9VTlNJR05FRF9TSE9SVF81XzVfNV8xID0gMHg4MDM0XG52YXIgR0xfVU5TSUdORURfU0hPUlRfNV82XzUgPSAweDgzNjNcbnZhciBHTF9VTlNJR05FRF9JTlRfMjRfOF9XRUJHTCA9IDB4ODRGQVxuXG52YXIgR0xfREVQVEhfQ09NUE9ORU5UID0gMHgxOTAyXG52YXIgR0xfREVQVEhfU1RFTkNJTCA9IDB4ODRGOVxuXG52YXIgR0xfU1JHQl9FWFQgPSAweDhDNDBcbnZhciBHTF9TUkdCX0FMUEhBX0VYVCA9IDB4OEM0MlxuXG52YXIgR0xfSEFMRl9GTE9BVF9PRVMgPSAweDhENjFcblxudmFyIEdMX0NPTVBSRVNTRURfUkdCX1MzVENfRFhUMV9FWFQgPSAweDgzRjBcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQxX0VYVCA9IDB4ODNGMVxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDNfRVhUID0gMHg4M0YyXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUNV9FWFQgPSAweDgzRjNcblxudmFyIEdMX0NPTVBSRVNTRURfUkdCX0FUQ19XRUJHTCA9IDB4OEM5MlxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9BVENfRVhQTElDSVRfQUxQSEFfV0VCR0wgPSAweDhDOTNcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfQVRDX0lOVEVSUE9MQVRFRF9BTFBIQV9XRUJHTCA9IDB4ODdFRVxuXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfUFZSVENfNEJQUFYxX0lNRyA9IDB4OEMwMFxudmFyIEdMX0NPTVBSRVNTRURfUkdCX1BWUlRDXzJCUFBWMV9JTUcgPSAweDhDMDFcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUFZSVENfNEJQUFYxX0lNRyA9IDB4OEMwMlxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9QVlJUQ18yQlBQVjFfSU1HID0gMHg4QzAzXG5cbnZhciBHTF9DT01QUkVTU0VEX1JHQl9FVEMxX1dFQkdMID0gMHg4RDY0XG5cbnZhciBHTF9VTlNJR05FRF9CWVRFID0gMHgxNDAxXG52YXIgR0xfVU5TSUdORURfU0hPUlQgPSAweDE0MDNcbnZhciBHTF9VTlNJR05FRF9JTlQgPSAweDE0MDVcbnZhciBHTF9GTE9BVCA9IDB4MTQwNlxuXG52YXIgR0xfVEVYVFVSRV9XUkFQX1MgPSAweDI4MDJcbnZhciBHTF9URVhUVVJFX1dSQVBfVCA9IDB4MjgwM1xuXG52YXIgR0xfUkVQRUFUID0gMHgyOTAxXG52YXIgR0xfQ0xBTVBfVE9fRURHRSA9IDB4ODEyRlxudmFyIEdMX01JUlJPUkVEX1JFUEVBVCA9IDB4ODM3MFxuXG52YXIgR0xfVEVYVFVSRV9NQUdfRklMVEVSID0gMHgyODAwXG52YXIgR0xfVEVYVFVSRV9NSU5fRklMVEVSID0gMHgyODAxXG5cbnZhciBHTF9ORUFSRVNUID0gMHgyNjAwXG52YXIgR0xfTElORUFSID0gMHgyNjAxXG52YXIgR0xfTkVBUkVTVF9NSVBNQVBfTkVBUkVTVCA9IDB4MjcwMFxudmFyIEdMX0xJTkVBUl9NSVBNQVBfTkVBUkVTVCA9IDB4MjcwMVxudmFyIEdMX05FQVJFU1RfTUlQTUFQX0xJTkVBUiA9IDB4MjcwMlxudmFyIEdMX0xJTkVBUl9NSVBNQVBfTElORUFSID0gMHgyNzAzXG5cbnZhciBHTF9HRU5FUkFURV9NSVBNQVBfSElOVCA9IDB4ODE5MlxudmFyIEdMX0RPTlRfQ0FSRSA9IDB4MTEwMFxudmFyIEdMX0ZBU1RFU1QgPSAweDExMDFcbnZhciBHTF9OSUNFU1QgPSAweDExMDJcblxudmFyIEdMX1RFWFRVUkVfTUFYX0FOSVNPVFJPUFlfRVhUID0gMHg4NEZFXG5cbnZhciBHTF9VTlBBQ0tfQUxJR05NRU5UID0gMHgwQ0Y1XG52YXIgR0xfVU5QQUNLX0ZMSVBfWV9XRUJHTCA9IDB4OTI0MFxudmFyIEdMX1VOUEFDS19QUkVNVUxUSVBMWV9BTFBIQV9XRUJHTCA9IDB4OTI0MVxudmFyIEdMX1VOUEFDS19DT0xPUlNQQUNFX0NPTlZFUlNJT05fV0VCR0wgPSAweDkyNDNcblxudmFyIEdMX0JST1dTRVJfREVGQVVMVF9XRUJHTCA9IDB4OTI0NFxuXG52YXIgR0xfVEVYVFVSRTAgPSAweDg0QzBcblxudmFyIE1JUE1BUF9GSUxURVJTID0gW1xuICBHTF9ORUFSRVNUX01JUE1BUF9ORUFSRVNULFxuICBHTF9ORUFSRVNUX01JUE1BUF9MSU5FQVIsXG4gIEdMX0xJTkVBUl9NSVBNQVBfTkVBUkVTVCxcbiAgR0xfTElORUFSX01JUE1BUF9MSU5FQVJcbl1cblxudmFyIENIQU5ORUxTX0ZPUk1BVCA9IFtcbiAgMCxcbiAgR0xfTFVNSU5BTkNFLFxuICBHTF9MVU1JTkFOQ0VfQUxQSEEsXG4gIEdMX1JHQixcbiAgR0xfUkdCQVxuXVxuXG52YXIgRk9STUFUX0NIQU5ORUxTID0ge31cbkZPUk1BVF9DSEFOTkVMU1tHTF9MVU1JTkFOQ0VdID1cbkZPUk1BVF9DSEFOTkVMU1tHTF9BTFBIQV0gPVxuRk9STUFUX0NIQU5ORUxTW0dMX0RFUFRIX0NPTVBPTkVOVF0gPSAxXG5GT1JNQVRfQ0hBTk5FTFNbR0xfREVQVEhfU1RFTkNJTF0gPVxuRk9STUFUX0NIQU5ORUxTW0dMX0xVTUlOQU5DRV9BTFBIQV0gPSAyXG5GT1JNQVRfQ0hBTk5FTFNbR0xfUkdCXSA9XG5GT1JNQVRfQ0hBTk5FTFNbR0xfU1JHQl9FWFRdID0gM1xuRk9STUFUX0NIQU5ORUxTW0dMX1JHQkFdID1cbkZPUk1BVF9DSEFOTkVMU1tHTF9TUkdCX0FMUEhBX0VYVF0gPSA0XG5cbnZhciBmb3JtYXRUeXBlcyA9IHt9XG5mb3JtYXRUeXBlc1tHTF9SR0JBNF0gPSBHTF9VTlNJR05FRF9TSE9SVF80XzRfNF80XG5mb3JtYXRUeXBlc1tHTF9SR0I1NjVdID0gR0xfVU5TSUdORURfU0hPUlRfNV82XzVcbmZvcm1hdFR5cGVzW0dMX1JHQjVfQTFdID0gR0xfVU5TSUdORURfU0hPUlRfNV81XzVfMVxuZm9ybWF0VHlwZXNbR0xfREVQVEhfQ09NUE9ORU5UXSA9IEdMX1VOU0lHTkVEX0lOVFxuZm9ybWF0VHlwZXNbR0xfREVQVEhfU1RFTkNJTF0gPSBHTF9VTlNJR05FRF9JTlRfMjRfOF9XRUJHTFxuXG5mdW5jdGlvbiBvYmplY3ROYW1lIChzdHIpIHtcbiAgcmV0dXJuICdbb2JqZWN0ICcgKyBzdHIgKyAnXSdcbn1cblxudmFyIENBTlZBU19DTEFTUyA9IG9iamVjdE5hbWUoJ0hUTUxDYW52YXNFbGVtZW50JylcbnZhciBDT05URVhUMkRfQ0xBU1MgPSBvYmplY3ROYW1lKCdDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQnKVxudmFyIElNQUdFX0NMQVNTID0gb2JqZWN0TmFtZSgnSFRNTEltYWdlRWxlbWVudCcpXG52YXIgVklERU9fQ0xBU1MgPSBvYmplY3ROYW1lKCdIVE1MVmlkZW9FbGVtZW50JylcblxudmFyIFBJWEVMX0NMQVNTRVMgPSBPYmplY3Qua2V5cyhkdHlwZXMpLmNvbmNhdChbXG4gIENBTlZBU19DTEFTUyxcbiAgQ09OVEVYVDJEX0NMQVNTLFxuICBJTUFHRV9DTEFTUyxcbiAgVklERU9fQ0xBU1Ncbl0pXG5cbi8vIGZvciBldmVyeSB0ZXh0dXJlIHR5cGUsIHN0b3JlXG4vLyB0aGUgc2l6ZSBpbiBieXRlcy5cbnZhciBUWVBFX1NJWkVTID0gW11cblRZUEVfU0laRVNbR0xfVU5TSUdORURfQllURV0gPSAxXG5UWVBFX1NJWkVTW0dMX0ZMT0FUXSA9IDRcblRZUEVfU0laRVNbR0xfSEFMRl9GTE9BVF9PRVNdID0gMlxuXG5UWVBFX1NJWkVTW0dMX1VOU0lHTkVEX1NIT1JUXSA9IDJcblRZUEVfU0laRVNbR0xfVU5TSUdORURfSU5UXSA9IDRcblxudmFyIEZPUk1BVF9TSVpFU19TUEVDSUFMID0gW11cbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX1JHQkE0XSA9IDJcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX1JHQjVfQTFdID0gMlxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfUkdCNTY1XSA9IDJcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0RFUFRIX1NURU5DSUxdID0gNFxuXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQl9TM1RDX0RYVDFfRVhUXSA9IDAuNVxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUMV9FWFRdID0gMC41XG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQzX0VYVF0gPSAxXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQ1X0VYVF0gPSAxXG5cbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCX0FUQ19XRUJHTF0gPSAwLjVcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCQV9BVENfRVhQTElDSVRfQUxQSEFfV0VCR0xdID0gMVxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19JTlRFUlBPTEFURURfQUxQSEFfV0VCR0xdID0gMVxuXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ180QlBQVjFfSU1HXSA9IDAuNVxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JfUFZSVENfMkJQUFYxX0lNR10gPSAwLjI1XG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQkFfUFZSVENfNEJQUFYxX0lNR10gPSAwLjVcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCQV9QVlJUQ18yQlBQVjFfSU1HXSA9IDAuMjVcblxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JfRVRDMV9XRUJHTF0gPSAwLjVcblxuZnVuY3Rpb24gaXNOdW1lcmljQXJyYXkgKGFycikge1xuICByZXR1cm4gKFxuICAgIEFycmF5LmlzQXJyYXkoYXJyKSAmJlxuICAgIChhcnIubGVuZ3RoID09PSAwIHx8XG4gICAgdHlwZW9mIGFyclswXSA9PT0gJ251bWJlcicpKVxufVxuXG5mdW5jdGlvbiBpc1JlY3RBcnJheSAoYXJyKSB7XG4gIGlmICghQXJyYXkuaXNBcnJheShhcnIpKSB7XG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cbiAgdmFyIHdpZHRoID0gYXJyLmxlbmd0aFxuICBpZiAod2lkdGggPT09IDAgfHwgIWlzQXJyYXlMaWtlKGFyclswXSkpIHtcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxuICByZXR1cm4gdHJ1ZVxufVxuXG5mdW5jdGlvbiBjbGFzc1N0cmluZyAoeCkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHgpXG59XG5cbmZ1bmN0aW9uIGlzQ2FudmFzRWxlbWVudCAob2JqZWN0KSB7XG4gIHJldHVybiBjbGFzc1N0cmluZyhvYmplY3QpID09PSBDQU5WQVNfQ0xBU1Ncbn1cblxuZnVuY3Rpb24gaXNDb250ZXh0MkQgKG9iamVjdCkge1xuICByZXR1cm4gY2xhc3NTdHJpbmcob2JqZWN0KSA9PT0gQ09OVEVYVDJEX0NMQVNTXG59XG5cbmZ1bmN0aW9uIGlzSW1hZ2VFbGVtZW50IChvYmplY3QpIHtcbiAgcmV0dXJuIGNsYXNzU3RyaW5nKG9iamVjdCkgPT09IElNQUdFX0NMQVNTXG59XG5cbmZ1bmN0aW9uIGlzVmlkZW9FbGVtZW50IChvYmplY3QpIHtcbiAgcmV0dXJuIGNsYXNzU3RyaW5nKG9iamVjdCkgPT09IFZJREVPX0NMQVNTXG59XG5cbmZ1bmN0aW9uIGlzUGl4ZWxEYXRhIChvYmplY3QpIHtcbiAgaWYgKCFvYmplY3QpIHtcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxuICB2YXIgY2xhc3NOYW1lID0gY2xhc3NTdHJpbmcob2JqZWN0KVxuICBpZiAoUElYRUxfQ0xBU1NFUy5pbmRleE9mKGNsYXNzTmFtZSkgPj0gMCkge1xuICAgIHJldHVybiB0cnVlXG4gIH1cbiAgcmV0dXJuIChcbiAgICBpc051bWVyaWNBcnJheShvYmplY3QpIHx8XG4gICAgaXNSZWN0QXJyYXkob2JqZWN0KSB8fFxuICAgIGlzTkRBcnJheUxpa2Uob2JqZWN0KSlcbn1cblxuZnVuY3Rpb24gdHlwZWRBcnJheUNvZGUgKGRhdGEpIHtcbiAgcmV0dXJuIGFycmF5VHlwZXNbT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGRhdGEpXSB8IDBcbn1cblxuZnVuY3Rpb24gY29udmVydERhdGEgKHJlc3VsdCwgZGF0YSkge1xuICB2YXIgbiA9IGRhdGEubGVuZ3RoXG4gIHN3aXRjaCAocmVzdWx0LnR5cGUpIHtcbiAgICBjYXNlIEdMX1VOU0lHTkVEX0JZVEU6XG4gICAgY2FzZSBHTF9VTlNJR05FRF9TSE9SVDpcbiAgICBjYXNlIEdMX1VOU0lHTkVEX0lOVDpcbiAgICBjYXNlIEdMX0ZMT0FUOlxuICAgICAgdmFyIGNvbnZlcnRlZCA9IHBvb2wuYWxsb2NUeXBlKHJlc3VsdC50eXBlLCBuKVxuICAgICAgY29udmVydGVkLnNldChkYXRhKVxuICAgICAgcmVzdWx0LmRhdGEgPSBjb252ZXJ0ZWRcbiAgICAgIGJyZWFrXG5cbiAgICBjYXNlIEdMX0hBTEZfRkxPQVRfT0VTOlxuICAgICAgcmVzdWx0LmRhdGEgPSBjb252ZXJ0VG9IYWxmRmxvYXQoZGF0YSlcbiAgICAgIGJyZWFrXG5cbiAgICBkZWZhdWx0OlxuICAgICAgY2hlY2sucmFpc2UoJ3Vuc3VwcG9ydGVkIHRleHR1cmUgdHlwZSwgbXVzdCBzcGVjaWZ5IGEgdHlwZWQgYXJyYXknKVxuICB9XG59XG5cbmZ1bmN0aW9uIHByZUNvbnZlcnQgKGltYWdlLCBuKSB7XG4gIHJldHVybiBwb29sLmFsbG9jVHlwZShcbiAgICBpbWFnZS50eXBlID09PSBHTF9IQUxGX0ZMT0FUX09FU1xuICAgICAgPyBHTF9GTE9BVFxuICAgICAgOiBpbWFnZS50eXBlLCBuKVxufVxuXG5mdW5jdGlvbiBwb3N0Q29udmVydCAoaW1hZ2UsIGRhdGEpIHtcbiAgaWYgKGltYWdlLnR5cGUgPT09IEdMX0hBTEZfRkxPQVRfT0VTKSB7XG4gICAgaW1hZ2UuZGF0YSA9IGNvbnZlcnRUb0hhbGZGbG9hdChkYXRhKVxuICAgIHBvb2wuZnJlZVR5cGUoZGF0YSlcbiAgfSBlbHNlIHtcbiAgICBpbWFnZS5kYXRhID0gZGF0YVxuICB9XG59XG5cbmZ1bmN0aW9uIHRyYW5zcG9zZURhdGEgKGltYWdlLCBhcnJheSwgc3RyaWRlWCwgc3RyaWRlWSwgc3RyaWRlQywgb2Zmc2V0KSB7XG4gIHZhciB3ID0gaW1hZ2Uud2lkdGhcbiAgdmFyIGggPSBpbWFnZS5oZWlnaHRcbiAgdmFyIGMgPSBpbWFnZS5jaGFubmVsc1xuICB2YXIgbiA9IHcgKiBoICogY1xuICB2YXIgZGF0YSA9IHByZUNvbnZlcnQoaW1hZ2UsIG4pXG5cbiAgdmFyIHAgPSAwXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgaDsgKytpKSB7XG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCB3OyArK2opIHtcbiAgICAgIGZvciAodmFyIGsgPSAwOyBrIDwgYzsgKytrKSB7XG4gICAgICAgIGRhdGFbcCsrXSA9IGFycmF5W3N0cmlkZVggKiBqICsgc3RyaWRlWSAqIGkgKyBzdHJpZGVDICogayArIG9mZnNldF1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwb3N0Q29udmVydChpbWFnZSwgZGF0YSlcbn1cblxuZnVuY3Rpb24gZ2V0VGV4dHVyZVNpemUgKGZvcm1hdCwgdHlwZSwgd2lkdGgsIGhlaWdodCwgaXNNaXBtYXAsIGlzQ3ViZSkge1xuICB2YXIgc1xuICBpZiAodHlwZW9mIEZPUk1BVF9TSVpFU19TUEVDSUFMW2Zvcm1hdF0gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgLy8gd2UgaGF2ZSBhIHNwZWNpYWwgYXJyYXkgZm9yIGRlYWxpbmcgd2l0aCB3ZWlyZCBjb2xvciBmb3JtYXRzIHN1Y2ggYXMgUkdCNUExXG4gICAgcyA9IEZPUk1BVF9TSVpFU19TUEVDSUFMW2Zvcm1hdF1cbiAgfSBlbHNlIHtcbiAgICBzID0gRk9STUFUX0NIQU5ORUxTW2Zvcm1hdF0gKiBUWVBFX1NJWkVTW3R5cGVdXG4gIH1cblxuICBpZiAoaXNDdWJlKSB7XG4gICAgcyAqPSA2XG4gIH1cblxuICBpZiAoaXNNaXBtYXApIHtcbiAgICAvLyBjb21wdXRlIHRoZSB0b3RhbCBzaXplIG9mIGFsbCB0aGUgbWlwbWFwcy5cbiAgICB2YXIgdG90YWwgPSAwXG5cbiAgICB2YXIgdyA9IHdpZHRoXG4gICAgd2hpbGUgKHcgPj0gMSkge1xuICAgICAgLy8gd2UgY2FuIG9ubHkgdXNlIG1pcG1hcHMgb24gYSBzcXVhcmUgaW1hZ2UsXG4gICAgICAvLyBzbyB3ZSBjYW4gc2ltcGx5IHVzZSB0aGUgd2lkdGggYW5kIGlnbm9yZSB0aGUgaGVpZ2h0OlxuICAgICAgdG90YWwgKz0gcyAqIHcgKiB3XG4gICAgICB3IC89IDJcbiAgICB9XG4gICAgcmV0dXJuIHRvdGFsXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIHMgKiB3aWR0aCAqIGhlaWdodFxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY3JlYXRlVGV4dHVyZVNldCAoXG4gIGdsLCBleHRlbnNpb25zLCBsaW1pdHMsIHJlZ2xQb2xsLCBjb250ZXh0U3RhdGUsIHN0YXRzLCBjb25maWcpIHtcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAvLyBJbml0aWFsaXplIGNvbnN0YW50cyBhbmQgcGFyYW1ldGVyIHRhYmxlcyBoZXJlXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgdmFyIG1pcG1hcEhpbnQgPSB7XG4gICAgXCJkb24ndCBjYXJlXCI6IEdMX0RPTlRfQ0FSRSxcbiAgICAnZG9udCBjYXJlJzogR0xfRE9OVF9DQVJFLFxuICAgICduaWNlJzogR0xfTklDRVNULFxuICAgICdmYXN0JzogR0xfRkFTVEVTVFxuICB9XG5cbiAgdmFyIHdyYXBNb2RlcyA9IHtcbiAgICAncmVwZWF0JzogR0xfUkVQRUFULFxuICAgICdjbGFtcCc6IEdMX0NMQU1QX1RPX0VER0UsXG4gICAgJ21pcnJvcic6IEdMX01JUlJPUkVEX1JFUEVBVFxuICB9XG5cbiAgdmFyIG1hZ0ZpbHRlcnMgPSB7XG4gICAgJ25lYXJlc3QnOiBHTF9ORUFSRVNULFxuICAgICdsaW5lYXInOiBHTF9MSU5FQVJcbiAgfVxuXG4gIHZhciBtaW5GaWx0ZXJzID0gZXh0ZW5kKHtcbiAgICAnbWlwbWFwJzogR0xfTElORUFSX01JUE1BUF9MSU5FQVIsXG4gICAgJ25lYXJlc3QgbWlwbWFwIG5lYXJlc3QnOiBHTF9ORUFSRVNUX01JUE1BUF9ORUFSRVNULFxuICAgICdsaW5lYXIgbWlwbWFwIG5lYXJlc3QnOiBHTF9MSU5FQVJfTUlQTUFQX05FQVJFU1QsXG4gICAgJ25lYXJlc3QgbWlwbWFwIGxpbmVhcic6IEdMX05FQVJFU1RfTUlQTUFQX0xJTkVBUixcbiAgICAnbGluZWFyIG1pcG1hcCBsaW5lYXInOiBHTF9MSU5FQVJfTUlQTUFQX0xJTkVBUlxuICB9LCBtYWdGaWx0ZXJzKVxuXG4gIHZhciBjb2xvclNwYWNlID0ge1xuICAgICdub25lJzogMCxcbiAgICAnYnJvd3Nlcic6IEdMX0JST1dTRVJfREVGQVVMVF9XRUJHTFxuICB9XG5cbiAgdmFyIHRleHR1cmVUeXBlcyA9IHtcbiAgICAndWludDgnOiBHTF9VTlNJR05FRF9CWVRFLFxuICAgICdyZ2JhNCc6IEdMX1VOU0lHTkVEX1NIT1JUXzRfNF80XzQsXG4gICAgJ3JnYjU2NSc6IEdMX1VOU0lHTkVEX1NIT1JUXzVfNl81LFxuICAgICdyZ2I1IGExJzogR0xfVU5TSUdORURfU0hPUlRfNV81XzVfMVxuICB9XG5cbiAgdmFyIHRleHR1cmVGb3JtYXRzID0ge1xuICAgICdhbHBoYSc6IEdMX0FMUEhBLFxuICAgICdsdW1pbmFuY2UnOiBHTF9MVU1JTkFOQ0UsXG4gICAgJ2x1bWluYW5jZSBhbHBoYSc6IEdMX0xVTUlOQU5DRV9BTFBIQSxcbiAgICAncmdiJzogR0xfUkdCLFxuICAgICdyZ2JhJzogR0xfUkdCQSxcbiAgICAncmdiYTQnOiBHTF9SR0JBNCxcbiAgICAncmdiNSBhMSc6IEdMX1JHQjVfQTEsXG4gICAgJ3JnYjU2NSc6IEdMX1JHQjU2NVxuICB9XG5cbiAgdmFyIGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cyA9IHt9XG5cbiAgaWYgKGV4dGVuc2lvbnMuZXh0X3NyZ2IpIHtcbiAgICB0ZXh0dXJlRm9ybWF0cy5zcmdiID0gR0xfU1JHQl9FWFRcbiAgICB0ZXh0dXJlRm9ybWF0cy5zcmdiYSA9IEdMX1NSR0JfQUxQSEFfRVhUXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9mbG9hdCkge1xuICAgIHRleHR1cmVUeXBlcy5mbG9hdDMyID0gdGV4dHVyZVR5cGVzLmZsb2F0ID0gR0xfRkxPQVRcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLm9lc190ZXh0dXJlX2hhbGZfZmxvYXQpIHtcbiAgICB0ZXh0dXJlVHlwZXNbJ2Zsb2F0MTYnXSA9IHRleHR1cmVUeXBlc1snaGFsZiBmbG9hdCddID0gR0xfSEFMRl9GTE9BVF9PRVNcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2RlcHRoX3RleHR1cmUpIHtcbiAgICBleHRlbmQodGV4dHVyZUZvcm1hdHMsIHtcbiAgICAgICdkZXB0aCc6IEdMX0RFUFRIX0NPTVBPTkVOVCxcbiAgICAgICdkZXB0aCBzdGVuY2lsJzogR0xfREVQVEhfU1RFTkNJTFxuICAgIH0pXG5cbiAgICBleHRlbmQodGV4dHVyZVR5cGVzLCB7XG4gICAgICAndWludDE2JzogR0xfVU5TSUdORURfU0hPUlQsXG4gICAgICAndWludDMyJzogR0xfVU5TSUdORURfSU5ULFxuICAgICAgJ2RlcHRoIHN0ZW5jaWwnOiBHTF9VTlNJR05FRF9JTlRfMjRfOF9XRUJHTFxuICAgIH0pXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb21wcmVzc2VkX3RleHR1cmVfczN0Yykge1xuICAgIGV4dGVuZChjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHMsIHtcbiAgICAgICdyZ2IgczN0YyBkeHQxJzogR0xfQ09NUFJFU1NFRF9SR0JfUzNUQ19EWFQxX0VYVCxcbiAgICAgICdyZ2JhIHMzdGMgZHh0MSc6IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDFfRVhULFxuICAgICAgJ3JnYmEgczN0YyBkeHQzJzogR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUM19FWFQsXG4gICAgICAncmdiYSBzM3RjIGR4dDUnOiBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQ1X0VYVFxuICAgIH0pXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb21wcmVzc2VkX3RleHR1cmVfYXRjKSB7XG4gICAgZXh0ZW5kKGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cywge1xuICAgICAgJ3JnYiBhdGMnOiBHTF9DT01QUkVTU0VEX1JHQl9BVENfV0VCR0wsXG4gICAgICAncmdiYSBhdGMgZXhwbGljaXQgYWxwaGEnOiBHTF9DT01QUkVTU0VEX1JHQkFfQVRDX0VYUExJQ0lUX0FMUEhBX1dFQkdMLFxuICAgICAgJ3JnYmEgYXRjIGludGVycG9sYXRlZCBhbHBoYSc6IEdMX0NPTVBSRVNTRURfUkdCQV9BVENfSU5URVJQT0xBVEVEX0FMUEhBX1dFQkdMXG4gICAgfSlcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9wdnJ0Yykge1xuICAgIGV4dGVuZChjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHMsIHtcbiAgICAgICdyZ2IgcHZydGMgNGJwcHYxJzogR0xfQ09NUFJFU1NFRF9SR0JfUFZSVENfNEJQUFYxX0lNRyxcbiAgICAgICdyZ2IgcHZydGMgMmJwcHYxJzogR0xfQ09NUFJFU1NFRF9SR0JfUFZSVENfMkJQUFYxX0lNRyxcbiAgICAgICdyZ2JhIHB2cnRjIDRicHB2MSc6IEdMX0NPTVBSRVNTRURfUkdCQV9QVlJUQ180QlBQVjFfSU1HLFxuICAgICAgJ3JnYmEgcHZydGMgMmJwcHYxJzogR0xfQ09NUFJFU1NFRF9SR0JBX1BWUlRDXzJCUFBWMV9JTUdcbiAgICB9KVxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29tcHJlc3NlZF90ZXh0dXJlX2V0YzEpIHtcbiAgICBjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHNbJ3JnYiBldGMxJ10gPSBHTF9DT01QUkVTU0VEX1JHQl9FVEMxX1dFQkdMXG4gIH1cblxuICAvLyBDb3B5IG92ZXIgYWxsIHRleHR1cmUgZm9ybWF0c1xuICB2YXIgc3VwcG9ydGVkQ29tcHJlc3NlZEZvcm1hdHMgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChcbiAgICBnbC5nZXRQYXJhbWV0ZXIoR0xfQ09NUFJFU1NFRF9URVhUVVJFX0ZPUk1BVFMpKVxuICBPYmplY3Qua2V5cyhjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHMpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB2YXIgZm9ybWF0ID0gY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzW25hbWVdXG4gICAgaWYgKHN1cHBvcnRlZENvbXByZXNzZWRGb3JtYXRzLmluZGV4T2YoZm9ybWF0KSA+PSAwKSB7XG4gICAgICB0ZXh0dXJlRm9ybWF0c1tuYW1lXSA9IGZvcm1hdFxuICAgIH1cbiAgfSlcblxuICB2YXIgc3VwcG9ydGVkRm9ybWF0cyA9IE9iamVjdC5rZXlzKHRleHR1cmVGb3JtYXRzKVxuICBsaW1pdHMudGV4dHVyZUZvcm1hdHMgPSBzdXBwb3J0ZWRGb3JtYXRzXG5cbiAgLy8gYXNzb2NpYXRlIHdpdGggZXZlcnkgZm9ybWF0IHN0cmluZyBpdHNcbiAgLy8gY29ycmVzcG9uZGluZyBHTC12YWx1ZS5cbiAgdmFyIHRleHR1cmVGb3JtYXRzSW52ZXJ0ID0gW11cbiAgT2JqZWN0LmtleXModGV4dHVyZUZvcm1hdHMpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgIHZhciB2YWwgPSB0ZXh0dXJlRm9ybWF0c1trZXldXG4gICAgdGV4dHVyZUZvcm1hdHNJbnZlcnRbdmFsXSA9IGtleVxuICB9KVxuXG4gIC8vIGFzc29jaWF0ZSB3aXRoIGV2ZXJ5IHR5cGUgc3RyaW5nIGl0c1xuICAvLyBjb3JyZXNwb25kaW5nIEdMLXZhbHVlLlxuICB2YXIgdGV4dHVyZVR5cGVzSW52ZXJ0ID0gW11cbiAgT2JqZWN0LmtleXModGV4dHVyZVR5cGVzKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICB2YXIgdmFsID0gdGV4dHVyZVR5cGVzW2tleV1cbiAgICB0ZXh0dXJlVHlwZXNJbnZlcnRbdmFsXSA9IGtleVxuICB9KVxuXG4gIHZhciBtYWdGaWx0ZXJzSW52ZXJ0ID0gW11cbiAgT2JqZWN0LmtleXMobWFnRmlsdGVycykuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgdmFyIHZhbCA9IG1hZ0ZpbHRlcnNba2V5XVxuICAgIG1hZ0ZpbHRlcnNJbnZlcnRbdmFsXSA9IGtleVxuICB9KVxuXG4gIHZhciBtaW5GaWx0ZXJzSW52ZXJ0ID0gW11cbiAgT2JqZWN0LmtleXMobWluRmlsdGVycykuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgdmFyIHZhbCA9IG1pbkZpbHRlcnNba2V5XVxuICAgIG1pbkZpbHRlcnNJbnZlcnRbdmFsXSA9IGtleVxuICB9KVxuXG4gIHZhciB3cmFwTW9kZXNJbnZlcnQgPSBbXVxuICBPYmplY3Qua2V5cyh3cmFwTW9kZXMpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgIHZhciB2YWwgPSB3cmFwTW9kZXNba2V5XVxuICAgIHdyYXBNb2Rlc0ludmVydFt2YWxdID0ga2V5XG4gIH0pXG5cbiAgLy8gY29sb3JGb3JtYXRzW10gZ2l2ZXMgdGhlIGZvcm1hdCAoY2hhbm5lbHMpIGFzc29jaWF0ZWQgdG8gYW5cbiAgLy8gaW50ZXJuYWxmb3JtYXRcbiAgdmFyIGNvbG9yRm9ybWF0cyA9IHN1cHBvcnRlZEZvcm1hdHMucmVkdWNlKGZ1bmN0aW9uIChjb2xvciwga2V5KSB7XG4gICAgdmFyIGdsZW51bSA9IHRleHR1cmVGb3JtYXRzW2tleV1cbiAgICBpZiAoZ2xlbnVtID09PSBHTF9MVU1JTkFOQ0UgfHxcbiAgICAgICAgZ2xlbnVtID09PSBHTF9BTFBIQSB8fFxuICAgICAgICBnbGVudW0gPT09IEdMX0xVTUlOQU5DRSB8fFxuICAgICAgICBnbGVudW0gPT09IEdMX0xVTUlOQU5DRV9BTFBIQSB8fFxuICAgICAgICBnbGVudW0gPT09IEdMX0RFUFRIX0NPTVBPTkVOVCB8fFxuICAgICAgICBnbGVudW0gPT09IEdMX0RFUFRIX1NURU5DSUwpIHtcbiAgICAgIGNvbG9yW2dsZW51bV0gPSBnbGVudW1cbiAgICB9IGVsc2UgaWYgKGdsZW51bSA9PT0gR0xfUkdCNV9BMSB8fCBrZXkuaW5kZXhPZigncmdiYScpID49IDApIHtcbiAgICAgIGNvbG9yW2dsZW51bV0gPSBHTF9SR0JBXG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbG9yW2dsZW51bV0gPSBHTF9SR0JcbiAgICB9XG4gICAgcmV0dXJuIGNvbG9yXG4gIH0sIHt9KVxuXG4gIGZ1bmN0aW9uIFRleEZsYWdzICgpIHtcbiAgICAvLyBmb3JtYXQgaW5mb1xuICAgIHRoaXMuaW50ZXJuYWxmb3JtYXQgPSBHTF9SR0JBXG4gICAgdGhpcy5mb3JtYXQgPSBHTF9SR0JBXG4gICAgdGhpcy50eXBlID0gR0xfVU5TSUdORURfQllURVxuICAgIHRoaXMuY29tcHJlc3NlZCA9IGZhbHNlXG5cbiAgICAvLyBwaXhlbCBzdG9yYWdlXG4gICAgdGhpcy5wcmVtdWx0aXBseUFscGhhID0gZmFsc2VcbiAgICB0aGlzLmZsaXBZID0gZmFsc2VcbiAgICB0aGlzLnVucGFja0FsaWdubWVudCA9IDFcbiAgICB0aGlzLmNvbG9yU3BhY2UgPSAwXG5cbiAgICAvLyBzaGFwZSBpbmZvXG4gICAgdGhpcy53aWR0aCA9IDBcbiAgICB0aGlzLmhlaWdodCA9IDBcbiAgICB0aGlzLmNoYW5uZWxzID0gMFxuICB9XG5cbiAgZnVuY3Rpb24gY29weUZsYWdzIChyZXN1bHQsIG90aGVyKSB7XG4gICAgcmVzdWx0LmludGVybmFsZm9ybWF0ID0gb3RoZXIuaW50ZXJuYWxmb3JtYXRcbiAgICByZXN1bHQuZm9ybWF0ID0gb3RoZXIuZm9ybWF0XG4gICAgcmVzdWx0LnR5cGUgPSBvdGhlci50eXBlXG4gICAgcmVzdWx0LmNvbXByZXNzZWQgPSBvdGhlci5jb21wcmVzc2VkXG5cbiAgICByZXN1bHQucHJlbXVsdGlwbHlBbHBoYSA9IG90aGVyLnByZW11bHRpcGx5QWxwaGFcbiAgICByZXN1bHQuZmxpcFkgPSBvdGhlci5mbGlwWVxuICAgIHJlc3VsdC51bnBhY2tBbGlnbm1lbnQgPSBvdGhlci51bnBhY2tBbGlnbm1lbnRcbiAgICByZXN1bHQuY29sb3JTcGFjZSA9IG90aGVyLmNvbG9yU3BhY2VcblxuICAgIHJlc3VsdC53aWR0aCA9IG90aGVyLndpZHRoXG4gICAgcmVzdWx0LmhlaWdodCA9IG90aGVyLmhlaWdodFxuICAgIHJlc3VsdC5jaGFubmVscyA9IG90aGVyLmNoYW5uZWxzXG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZUZsYWdzIChmbGFncywgb3B0aW9ucykge1xuICAgIGlmICh0eXBlb2Ygb3B0aW9ucyAhPT0gJ29iamVjdCcgfHwgIW9wdGlvbnMpIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGlmICgncHJlbXVsdGlwbHlBbHBoYScgaW4gb3B0aW9ucykge1xuICAgICAgY2hlY2sudHlwZShvcHRpb25zLnByZW11bHRpcGx5QWxwaGEsICdib29sZWFuJyxcbiAgICAgICAgJ2ludmFsaWQgcHJlbXVsdGlwbHlBbHBoYScpXG4gICAgICBmbGFncy5wcmVtdWx0aXBseUFscGhhID0gb3B0aW9ucy5wcmVtdWx0aXBseUFscGhhXG4gICAgfVxuXG4gICAgaWYgKCdmbGlwWScgaW4gb3B0aW9ucykge1xuICAgICAgY2hlY2sudHlwZShvcHRpb25zLmZsaXBZLCAnYm9vbGVhbicsXG4gICAgICAgICdpbnZhbGlkIHRleHR1cmUgZmxpcCcpXG4gICAgICBmbGFncy5mbGlwWSA9IG9wdGlvbnMuZmxpcFlcbiAgICB9XG5cbiAgICBpZiAoJ2FsaWdubWVudCcgaW4gb3B0aW9ucykge1xuICAgICAgY2hlY2sub25lT2Yob3B0aW9ucy5hbGlnbm1lbnQsIFsxLCAyLCA0LCA4XSxcbiAgICAgICAgJ2ludmFsaWQgdGV4dHVyZSB1bnBhY2sgYWxpZ25tZW50JylcbiAgICAgIGZsYWdzLnVucGFja0FsaWdubWVudCA9IG9wdGlvbnMuYWxpZ25tZW50XG4gICAgfVxuXG4gICAgaWYgKCdjb2xvclNwYWNlJyBpbiBvcHRpb25zKSB7XG4gICAgICBjaGVjay5wYXJhbWV0ZXIob3B0aW9ucy5jb2xvclNwYWNlLCBjb2xvclNwYWNlLFxuICAgICAgICAnaW52YWxpZCBjb2xvclNwYWNlJylcbiAgICAgIGZsYWdzLmNvbG9yU3BhY2UgPSBjb2xvclNwYWNlW29wdGlvbnMuY29sb3JTcGFjZV1cbiAgICB9XG5cbiAgICBpZiAoJ3R5cGUnIGluIG9wdGlvbnMpIHtcbiAgICAgIHZhciB0eXBlID0gb3B0aW9ucy50eXBlXG4gICAgICBjaGVjayhleHRlbnNpb25zLm9lc190ZXh0dXJlX2Zsb2F0IHx8XG4gICAgICAgICEodHlwZSA9PT0gJ2Zsb2F0JyB8fCB0eXBlID09PSAnZmxvYXQzMicpLFxuICAgICAgICAneW91IG11c3QgZW5hYmxlIHRoZSBPRVNfdGV4dHVyZV9mbG9hdCBleHRlbnNpb24gaW4gb3JkZXIgdG8gdXNlIGZsb2F0aW5nIHBvaW50IHRleHR1cmVzLicpXG4gICAgICBjaGVjayhleHRlbnNpb25zLm9lc190ZXh0dXJlX2hhbGZfZmxvYXQgfHxcbiAgICAgICAgISh0eXBlID09PSAnaGFsZiBmbG9hdCcgfHwgdHlwZSA9PT0gJ2Zsb2F0MTYnKSxcbiAgICAgICAgJ3lvdSBtdXN0IGVuYWJsZSB0aGUgT0VTX3RleHR1cmVfaGFsZl9mbG9hdCBleHRlbnNpb24gaW4gb3JkZXIgdG8gdXNlIDE2LWJpdCBmbG9hdGluZyBwb2ludCB0ZXh0dXJlcy4nKVxuICAgICAgY2hlY2soZXh0ZW5zaW9ucy53ZWJnbF9kZXB0aF90ZXh0dXJlIHx8XG4gICAgICAgICEodHlwZSA9PT0gJ3VpbnQxNicgfHwgdHlwZSA9PT0gJ3VpbnQzMicgfHwgdHlwZSA9PT0gJ2RlcHRoIHN0ZW5jaWwnKSxcbiAgICAgICAgJ3lvdSBtdXN0IGVuYWJsZSB0aGUgV0VCR0xfZGVwdGhfdGV4dHVyZSBleHRlbnNpb24gaW4gb3JkZXIgdG8gdXNlIGRlcHRoL3N0ZW5jaWwgdGV4dHVyZXMuJylcbiAgICAgIGNoZWNrLnBhcmFtZXRlcih0eXBlLCB0ZXh0dXJlVHlwZXMsXG4gICAgICAgICdpbnZhbGlkIHRleHR1cmUgdHlwZScpXG4gICAgICBmbGFncy50eXBlID0gdGV4dHVyZVR5cGVzW3R5cGVdXG4gICAgfVxuXG4gICAgdmFyIHcgPSBmbGFncy53aWR0aFxuICAgIHZhciBoID0gZmxhZ3MuaGVpZ2h0XG4gICAgdmFyIGMgPSBmbGFncy5jaGFubmVsc1xuICAgIHZhciBoYXNDaGFubmVscyA9IGZhbHNlXG4gICAgaWYgKCdzaGFwZScgaW4gb3B0aW9ucykge1xuICAgICAgY2hlY2soQXJyYXkuaXNBcnJheShvcHRpb25zLnNoYXBlKSAmJiBvcHRpb25zLnNoYXBlLmxlbmd0aCA+PSAyLFxuICAgICAgICAnc2hhcGUgbXVzdCBiZSBhbiBhcnJheScpXG4gICAgICB3ID0gb3B0aW9ucy5zaGFwZVswXVxuICAgICAgaCA9IG9wdGlvbnMuc2hhcGVbMV1cbiAgICAgIGlmIChvcHRpb25zLnNoYXBlLmxlbmd0aCA9PT0gMykge1xuICAgICAgICBjID0gb3B0aW9ucy5zaGFwZVsyXVxuICAgICAgICBjaGVjayhjID4gMCAmJiBjIDw9IDQsICdpbnZhbGlkIG51bWJlciBvZiBjaGFubmVscycpXG4gICAgICAgIGhhc0NoYW5uZWxzID0gdHJ1ZVxuICAgICAgfVxuICAgICAgY2hlY2sodyA+PSAwICYmIHcgPD0gbGltaXRzLm1heFRleHR1cmVTaXplLCAnaW52YWxpZCB3aWR0aCcpXG4gICAgICBjaGVjayhoID49IDAgJiYgaCA8PSBsaW1pdHMubWF4VGV4dHVyZVNpemUsICdpbnZhbGlkIGhlaWdodCcpXG4gICAgfSBlbHNlIHtcbiAgICAgIGlmICgncmFkaXVzJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHcgPSBoID0gb3B0aW9ucy5yYWRpdXNcbiAgICAgICAgY2hlY2sodyA+PSAwICYmIHcgPD0gbGltaXRzLm1heFRleHR1cmVTaXplLCAnaW52YWxpZCByYWRpdXMnKVxuICAgICAgfVxuICAgICAgaWYgKCd3aWR0aCcgaW4gb3B0aW9ucykge1xuICAgICAgICB3ID0gb3B0aW9ucy53aWR0aFxuICAgICAgICBjaGVjayh3ID49IDAgJiYgdyA8PSBsaW1pdHMubWF4VGV4dHVyZVNpemUsICdpbnZhbGlkIHdpZHRoJylcbiAgICAgIH1cbiAgICAgIGlmICgnaGVpZ2h0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgIGggPSBvcHRpb25zLmhlaWdodFxuICAgICAgICBjaGVjayhoID49IDAgJiYgaCA8PSBsaW1pdHMubWF4VGV4dHVyZVNpemUsICdpbnZhbGlkIGhlaWdodCcpXG4gICAgICB9XG4gICAgICBpZiAoJ2NoYW5uZWxzJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIGMgPSBvcHRpb25zLmNoYW5uZWxzXG4gICAgICAgIGNoZWNrKGMgPiAwICYmIGMgPD0gNCwgJ2ludmFsaWQgbnVtYmVyIG9mIGNoYW5uZWxzJylcbiAgICAgICAgaGFzQ2hhbm5lbHMgPSB0cnVlXG4gICAgICB9XG4gICAgfVxuICAgIGZsYWdzLndpZHRoID0gdyB8IDBcbiAgICBmbGFncy5oZWlnaHQgPSBoIHwgMFxuICAgIGZsYWdzLmNoYW5uZWxzID0gYyB8IDBcblxuICAgIHZhciBoYXNGb3JtYXQgPSBmYWxzZVxuICAgIGlmICgnZm9ybWF0JyBpbiBvcHRpb25zKSB7XG4gICAgICB2YXIgZm9ybWF0U3RyID0gb3B0aW9ucy5mb3JtYXRcbiAgICAgIGNoZWNrKGV4dGVuc2lvbnMud2ViZ2xfZGVwdGhfdGV4dHVyZSB8fFxuICAgICAgICAhKGZvcm1hdFN0ciA9PT0gJ2RlcHRoJyB8fCBmb3JtYXRTdHIgPT09ICdkZXB0aCBzdGVuY2lsJyksXG4gICAgICAgICd5b3UgbXVzdCBlbmFibGUgdGhlIFdFQkdMX2RlcHRoX3RleHR1cmUgZXh0ZW5zaW9uIGluIG9yZGVyIHRvIHVzZSBkZXB0aC9zdGVuY2lsIHRleHR1cmVzLicpXG4gICAgICBjaGVjay5wYXJhbWV0ZXIoZm9ybWF0U3RyLCB0ZXh0dXJlRm9ybWF0cyxcbiAgICAgICAgJ2ludmFsaWQgdGV4dHVyZSBmb3JtYXQnKVxuICAgICAgdmFyIGludGVybmFsZm9ybWF0ID0gZmxhZ3MuaW50ZXJuYWxmb3JtYXQgPSB0ZXh0dXJlRm9ybWF0c1tmb3JtYXRTdHJdXG4gICAgICBmbGFncy5mb3JtYXQgPSBjb2xvckZvcm1hdHNbaW50ZXJuYWxmb3JtYXRdXG4gICAgICBpZiAoZm9ybWF0U3RyIGluIHRleHR1cmVUeXBlcykge1xuICAgICAgICBpZiAoISgndHlwZScgaW4gb3B0aW9ucykpIHtcbiAgICAgICAgICBmbGFncy50eXBlID0gdGV4dHVyZVR5cGVzW2Zvcm1hdFN0cl1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGZvcm1hdFN0ciBpbiBjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHMpIHtcbiAgICAgICAgZmxhZ3MuY29tcHJlc3NlZCA9IHRydWVcbiAgICAgIH1cbiAgICAgIGhhc0Zvcm1hdCA9IHRydWVcbiAgICB9XG5cbiAgICAvLyBSZWNvbmNpbGUgY2hhbm5lbHMgYW5kIGZvcm1hdFxuICAgIGlmICghaGFzQ2hhbm5lbHMgJiYgaGFzRm9ybWF0KSB7XG4gICAgICBmbGFncy5jaGFubmVscyA9IEZPUk1BVF9DSEFOTkVMU1tmbGFncy5mb3JtYXRdXG4gICAgfSBlbHNlIGlmIChoYXNDaGFubmVscyAmJiAhaGFzRm9ybWF0KSB7XG4gICAgICBpZiAoZmxhZ3MuY2hhbm5lbHMgIT09IENIQU5ORUxTX0ZPUk1BVFtmbGFncy5mb3JtYXRdKSB7XG4gICAgICAgIGZsYWdzLmZvcm1hdCA9IGZsYWdzLmludGVybmFsZm9ybWF0ID0gQ0hBTk5FTFNfRk9STUFUW2ZsYWdzLmNoYW5uZWxzXVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoaGFzRm9ybWF0ICYmIGhhc0NoYW5uZWxzKSB7XG4gICAgICBjaGVjayhcbiAgICAgICAgZmxhZ3MuY2hhbm5lbHMgPT09IEZPUk1BVF9DSEFOTkVMU1tmbGFncy5mb3JtYXRdLFxuICAgICAgICAnbnVtYmVyIG9mIGNoYW5uZWxzIGluY29uc2lzdGVudCB3aXRoIHNwZWNpZmllZCBmb3JtYXQnKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHNldEZsYWdzIChmbGFncykge1xuICAgIGdsLnBpeGVsU3RvcmVpKEdMX1VOUEFDS19GTElQX1lfV0VCR0wsIGZsYWdzLmZsaXBZKVxuICAgIGdsLnBpeGVsU3RvcmVpKEdMX1VOUEFDS19QUkVNVUxUSVBMWV9BTFBIQV9XRUJHTCwgZmxhZ3MucHJlbXVsdGlwbHlBbHBoYSlcbiAgICBnbC5waXhlbFN0b3JlaShHTF9VTlBBQ0tfQ09MT1JTUEFDRV9DT05WRVJTSU9OX1dFQkdMLCBmbGFncy5jb2xvclNwYWNlKVxuICAgIGdsLnBpeGVsU3RvcmVpKEdMX1VOUEFDS19BTElHTk1FTlQsIGZsYWdzLnVucGFja0FsaWdubWVudClcbiAgfVxuXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gVGV4IGltYWdlIGRhdGFcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICBmdW5jdGlvbiBUZXhJbWFnZSAoKSB7XG4gICAgVGV4RmxhZ3MuY2FsbCh0aGlzKVxuXG4gICAgdGhpcy54T2Zmc2V0ID0gMFxuICAgIHRoaXMueU9mZnNldCA9IDBcblxuICAgIC8vIGRhdGFcbiAgICB0aGlzLmRhdGEgPSBudWxsXG4gICAgdGhpcy5uZWVkc0ZyZWUgPSBmYWxzZVxuXG4gICAgLy8gaHRtbCBlbGVtZW50XG4gICAgdGhpcy5lbGVtZW50ID0gbnVsbFxuXG4gICAgLy8gY29weVRleEltYWdlIGluZm9cbiAgICB0aGlzLm5lZWRzQ29weSA9IGZhbHNlXG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZUltYWdlIChpbWFnZSwgb3B0aW9ucykge1xuICAgIHZhciBkYXRhID0gbnVsbFxuICAgIGlmIChpc1BpeGVsRGF0YShvcHRpb25zKSkge1xuICAgICAgZGF0YSA9IG9wdGlvbnNcbiAgICB9IGVsc2UgaWYgKG9wdGlvbnMpIHtcbiAgICAgIGNoZWNrLnR5cGUob3B0aW9ucywgJ29iamVjdCcsICdpbnZhbGlkIHBpeGVsIGRhdGEgdHlwZScpXG4gICAgICBwYXJzZUZsYWdzKGltYWdlLCBvcHRpb25zKVxuICAgICAgaWYgKCd4JyBpbiBvcHRpb25zKSB7XG4gICAgICAgIGltYWdlLnhPZmZzZXQgPSBvcHRpb25zLnggfCAwXG4gICAgICB9XG4gICAgICBpZiAoJ3knIGluIG9wdGlvbnMpIHtcbiAgICAgICAgaW1hZ2UueU9mZnNldCA9IG9wdGlvbnMueSB8IDBcbiAgICAgIH1cbiAgICAgIGlmIChpc1BpeGVsRGF0YShvcHRpb25zLmRhdGEpKSB7XG4gICAgICAgIGRhdGEgPSBvcHRpb25zLmRhdGFcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjaGVjayhcbiAgICAgICFpbWFnZS5jb21wcmVzc2VkIHx8XG4gICAgICBkYXRhIGluc3RhbmNlb2YgVWludDhBcnJheSxcbiAgICAgICdjb21wcmVzc2VkIHRleHR1cmUgZGF0YSBtdXN0IGJlIHN0b3JlZCBpbiBhIHVpbnQ4YXJyYXknKVxuXG4gICAgaWYgKG9wdGlvbnMuY29weSkge1xuICAgICAgY2hlY2soIWRhdGEsICdjYW4gbm90IHNwZWNpZnkgY29weSBhbmQgZGF0YSBmaWVsZCBmb3IgdGhlIHNhbWUgdGV4dHVyZScpXG4gICAgICB2YXIgdmlld1cgPSBjb250ZXh0U3RhdGUudmlld3BvcnRXaWR0aFxuICAgICAgdmFyIHZpZXdIID0gY29udGV4dFN0YXRlLnZpZXdwb3J0SGVpZ2h0XG4gICAgICBpbWFnZS53aWR0aCA9IGltYWdlLndpZHRoIHx8ICh2aWV3VyAtIGltYWdlLnhPZmZzZXQpXG4gICAgICBpbWFnZS5oZWlnaHQgPSBpbWFnZS5oZWlnaHQgfHwgKHZpZXdIIC0gaW1hZ2UueU9mZnNldClcbiAgICAgIGltYWdlLm5lZWRzQ29weSA9IHRydWVcbiAgICAgIGNoZWNrKGltYWdlLnhPZmZzZXQgPj0gMCAmJiBpbWFnZS54T2Zmc2V0IDwgdmlld1cgJiZcbiAgICAgICAgICAgIGltYWdlLnlPZmZzZXQgPj0gMCAmJiBpbWFnZS55T2Zmc2V0IDwgdmlld0ggJiZcbiAgICAgICAgICAgIGltYWdlLndpZHRoID4gMCAmJiBpbWFnZS53aWR0aCA8PSB2aWV3VyAmJlxuICAgICAgICAgICAgaW1hZ2UuaGVpZ2h0ID4gMCAmJiBpbWFnZS5oZWlnaHQgPD0gdmlld0gsXG4gICAgICAgICAgICAnY29weSB0ZXh0dXJlIHJlYWQgb3V0IG9mIGJvdW5kcycpXG4gICAgfSBlbHNlIGlmICghZGF0YSkge1xuICAgICAgaW1hZ2Uud2lkdGggPSBpbWFnZS53aWR0aCB8fCAxXG4gICAgICBpbWFnZS5oZWlnaHQgPSBpbWFnZS5oZWlnaHQgfHwgMVxuICAgICAgaW1hZ2UuY2hhbm5lbHMgPSBpbWFnZS5jaGFubmVscyB8fCA0XG4gICAgfSBlbHNlIGlmIChpc1R5cGVkQXJyYXkoZGF0YSkpIHtcbiAgICAgIGltYWdlLmNoYW5uZWxzID0gaW1hZ2UuY2hhbm5lbHMgfHwgNFxuICAgICAgaW1hZ2UuZGF0YSA9IGRhdGFcbiAgICAgIGlmICghKCd0eXBlJyBpbiBvcHRpb25zKSAmJiBpbWFnZS50eXBlID09PSBHTF9VTlNJR05FRF9CWVRFKSB7XG4gICAgICAgIGltYWdlLnR5cGUgPSB0eXBlZEFycmF5Q29kZShkYXRhKVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoaXNOdW1lcmljQXJyYXkoZGF0YSkpIHtcbiAgICAgIGltYWdlLmNoYW5uZWxzID0gaW1hZ2UuY2hhbm5lbHMgfHwgNFxuICAgICAgY29udmVydERhdGEoaW1hZ2UsIGRhdGEpXG4gICAgICBpbWFnZS5hbGlnbm1lbnQgPSAxXG4gICAgICBpbWFnZS5uZWVkc0ZyZWUgPSB0cnVlXG4gICAgfSBlbHNlIGlmIChpc05EQXJyYXlMaWtlKGRhdGEpKSB7XG4gICAgICB2YXIgYXJyYXkgPSBkYXRhLmRhdGFcbiAgICAgIGlmICghQXJyYXkuaXNBcnJheShhcnJheSkgJiYgaW1hZ2UudHlwZSA9PT0gR0xfVU5TSUdORURfQllURSkge1xuICAgICAgICBpbWFnZS50eXBlID0gdHlwZWRBcnJheUNvZGUoYXJyYXkpXG4gICAgICB9XG4gICAgICB2YXIgc2hhcGUgPSBkYXRhLnNoYXBlXG4gICAgICB2YXIgc3RyaWRlID0gZGF0YS5zdHJpZGVcbiAgICAgIHZhciBzaGFwZVgsIHNoYXBlWSwgc2hhcGVDLCBzdHJpZGVYLCBzdHJpZGVZLCBzdHJpZGVDXG4gICAgICBpZiAoc2hhcGUubGVuZ3RoID09PSAzKSB7XG4gICAgICAgIHNoYXBlQyA9IHNoYXBlWzJdXG4gICAgICAgIHN0cmlkZUMgPSBzdHJpZGVbMl1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNoZWNrKHNoYXBlLmxlbmd0aCA9PT0gMiwgJ2ludmFsaWQgbmRhcnJheSBwaXhlbCBkYXRhLCBtdXN0IGJlIDIgb3IgM0QnKVxuICAgICAgICBzaGFwZUMgPSAxXG4gICAgICAgIHN0cmlkZUMgPSAxXG4gICAgICB9XG4gICAgICBzaGFwZVggPSBzaGFwZVswXVxuICAgICAgc2hhcGVZID0gc2hhcGVbMV1cbiAgICAgIHN0cmlkZVggPSBzdHJpZGVbMF1cbiAgICAgIHN0cmlkZVkgPSBzdHJpZGVbMV1cbiAgICAgIGltYWdlLmFsaWdubWVudCA9IDFcbiAgICAgIGltYWdlLndpZHRoID0gc2hhcGVYXG4gICAgICBpbWFnZS5oZWlnaHQgPSBzaGFwZVlcbiAgICAgIGltYWdlLmNoYW5uZWxzID0gc2hhcGVDXG4gICAgICBpbWFnZS5mb3JtYXQgPSBpbWFnZS5pbnRlcm5hbGZvcm1hdCA9IENIQU5ORUxTX0ZPUk1BVFtzaGFwZUNdXG4gICAgICBpbWFnZS5uZWVkc0ZyZWUgPSB0cnVlXG4gICAgICB0cmFuc3Bvc2VEYXRhKGltYWdlLCBhcnJheSwgc3RyaWRlWCwgc3RyaWRlWSwgc3RyaWRlQywgZGF0YS5vZmZzZXQpXG4gICAgfSBlbHNlIGlmIChpc0NhbnZhc0VsZW1lbnQoZGF0YSkgfHwgaXNDb250ZXh0MkQoZGF0YSkpIHtcbiAgICAgIGlmIChpc0NhbnZhc0VsZW1lbnQoZGF0YSkpIHtcbiAgICAgICAgaW1hZ2UuZWxlbWVudCA9IGRhdGFcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGltYWdlLmVsZW1lbnQgPSBkYXRhLmNhbnZhc1xuICAgICAgfVxuICAgICAgaW1hZ2Uud2lkdGggPSBpbWFnZS5lbGVtZW50LndpZHRoXG4gICAgICBpbWFnZS5oZWlnaHQgPSBpbWFnZS5lbGVtZW50LmhlaWdodFxuICAgICAgaW1hZ2UuY2hhbm5lbHMgPSA0XG4gICAgfSBlbHNlIGlmIChpc0ltYWdlRWxlbWVudChkYXRhKSkge1xuICAgICAgaW1hZ2UuZWxlbWVudCA9IGRhdGFcbiAgICAgIGltYWdlLndpZHRoID0gZGF0YS5uYXR1cmFsV2lkdGhcbiAgICAgIGltYWdlLmhlaWdodCA9IGRhdGEubmF0dXJhbEhlaWdodFxuICAgICAgaW1hZ2UuY2hhbm5lbHMgPSA0XG4gICAgfSBlbHNlIGlmIChpc1ZpZGVvRWxlbWVudChkYXRhKSkge1xuICAgICAgaW1hZ2UuZWxlbWVudCA9IGRhdGFcbiAgICAgIGltYWdlLndpZHRoID0gZGF0YS52aWRlb1dpZHRoXG4gICAgICBpbWFnZS5oZWlnaHQgPSBkYXRhLnZpZGVvSGVpZ2h0XG4gICAgICBpbWFnZS5jaGFubmVscyA9IDRcbiAgICB9IGVsc2UgaWYgKGlzUmVjdEFycmF5KGRhdGEpKSB7XG4gICAgICB2YXIgdyA9IGltYWdlLndpZHRoIHx8IGRhdGFbMF0ubGVuZ3RoXG4gICAgICB2YXIgaCA9IGltYWdlLmhlaWdodCB8fCBkYXRhLmxlbmd0aFxuICAgICAgdmFyIGMgPSBpbWFnZS5jaGFubmVsc1xuICAgICAgaWYgKGlzQXJyYXlMaWtlKGRhdGFbMF1bMF0pKSB7XG4gICAgICAgIGMgPSBjIHx8IGRhdGFbMF1bMF0ubGVuZ3RoXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjID0gYyB8fCAxXG4gICAgICB9XG4gICAgICB2YXIgYXJyYXlTaGFwZSA9IGZsYXR0ZW5VdGlscy5zaGFwZShkYXRhKVxuICAgICAgdmFyIG4gPSAxXG4gICAgICBmb3IgKHZhciBkZCA9IDA7IGRkIDwgYXJyYXlTaGFwZS5sZW5ndGg7ICsrZGQpIHtcbiAgICAgICAgbiAqPSBhcnJheVNoYXBlW2RkXVxuICAgICAgfVxuICAgICAgdmFyIGFsbG9jRGF0YSA9IHByZUNvbnZlcnQoaW1hZ2UsIG4pXG4gICAgICBmbGF0dGVuVXRpbHMuZmxhdHRlbihkYXRhLCBhcnJheVNoYXBlLCAnJywgYWxsb2NEYXRhKVxuICAgICAgcG9zdENvbnZlcnQoaW1hZ2UsIGFsbG9jRGF0YSlcbiAgICAgIGltYWdlLmFsaWdubWVudCA9IDFcbiAgICAgIGltYWdlLndpZHRoID0gd1xuICAgICAgaW1hZ2UuaGVpZ2h0ID0gaFxuICAgICAgaW1hZ2UuY2hhbm5lbHMgPSBjXG4gICAgICBpbWFnZS5mb3JtYXQgPSBpbWFnZS5pbnRlcm5hbGZvcm1hdCA9IENIQU5ORUxTX0ZPUk1BVFtjXVxuICAgICAgaW1hZ2UubmVlZHNGcmVlID0gdHJ1ZVxuICAgIH1cblxuICAgIGlmIChpbWFnZS50eXBlID09PSBHTF9GTE9BVCkge1xuICAgICAgY2hlY2sobGltaXRzLmV4dGVuc2lvbnMuaW5kZXhPZignb2VzX3RleHR1cmVfZmxvYXQnKSA+PSAwLFxuICAgICAgICAnb2VzX3RleHR1cmVfZmxvYXQgZXh0ZW5zaW9uIG5vdCBlbmFibGVkJylcbiAgICB9IGVsc2UgaWYgKGltYWdlLnR5cGUgPT09IEdMX0hBTEZfRkxPQVRfT0VTKSB7XG4gICAgICBjaGVjayhsaW1pdHMuZXh0ZW5zaW9ucy5pbmRleE9mKCdvZXNfdGV4dHVyZV9oYWxmX2Zsb2F0JykgPj0gMCxcbiAgICAgICAgJ29lc190ZXh0dXJlX2hhbGZfZmxvYXQgZXh0ZW5zaW9uIG5vdCBlbmFibGVkJylcbiAgICB9XG5cbiAgICAvLyBkbyBjb21wcmVzc2VkIHRleHR1cmUgIHZhbGlkYXRpb24gaGVyZS5cbiAgfVxuXG4gIGZ1bmN0aW9uIHNldEltYWdlIChpbmZvLCB0YXJnZXQsIG1pcGxldmVsKSB7XG4gICAgdmFyIGVsZW1lbnQgPSBpbmZvLmVsZW1lbnRcbiAgICB2YXIgZGF0YSA9IGluZm8uZGF0YVxuICAgIHZhciBpbnRlcm5hbGZvcm1hdCA9IGluZm8uaW50ZXJuYWxmb3JtYXRcbiAgICB2YXIgZm9ybWF0ID0gaW5mby5mb3JtYXRcbiAgICB2YXIgdHlwZSA9IGluZm8udHlwZVxuICAgIHZhciB3aWR0aCA9IGluZm8ud2lkdGhcbiAgICB2YXIgaGVpZ2h0ID0gaW5mby5oZWlnaHRcblxuICAgIHNldEZsYWdzKGluZm8pXG5cbiAgICBpZiAoZWxlbWVudCkge1xuICAgICAgZ2wudGV4SW1hZ2UyRCh0YXJnZXQsIG1pcGxldmVsLCBmb3JtYXQsIGZvcm1hdCwgdHlwZSwgZWxlbWVudClcbiAgICB9IGVsc2UgaWYgKGluZm8uY29tcHJlc3NlZCkge1xuICAgICAgZ2wuY29tcHJlc3NlZFRleEltYWdlMkQodGFyZ2V0LCBtaXBsZXZlbCwgaW50ZXJuYWxmb3JtYXQsIHdpZHRoLCBoZWlnaHQsIDAsIGRhdGEpXG4gICAgfSBlbHNlIGlmIChpbmZvLm5lZWRzQ29weSkge1xuICAgICAgcmVnbFBvbGwoKVxuICAgICAgZ2wuY29weVRleEltYWdlMkQoXG4gICAgICAgIHRhcmdldCwgbWlwbGV2ZWwsIGZvcm1hdCwgaW5mby54T2Zmc2V0LCBpbmZvLnlPZmZzZXQsIHdpZHRoLCBoZWlnaHQsIDApXG4gICAgfSBlbHNlIHtcbiAgICAgIGdsLnRleEltYWdlMkQoXG4gICAgICAgIHRhcmdldCwgbWlwbGV2ZWwsIGZvcm1hdCwgd2lkdGgsIGhlaWdodCwgMCwgZm9ybWF0LCB0eXBlLCBkYXRhKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHNldFN1YkltYWdlIChpbmZvLCB0YXJnZXQsIHgsIHksIG1pcGxldmVsKSB7XG4gICAgdmFyIGVsZW1lbnQgPSBpbmZvLmVsZW1lbnRcbiAgICB2YXIgZGF0YSA9IGluZm8uZGF0YVxuICAgIHZhciBpbnRlcm5hbGZvcm1hdCA9IGluZm8uaW50ZXJuYWxmb3JtYXRcbiAgICB2YXIgZm9ybWF0ID0gaW5mby5mb3JtYXRcbiAgICB2YXIgdHlwZSA9IGluZm8udHlwZVxuICAgIHZhciB3aWR0aCA9IGluZm8ud2lkdGhcbiAgICB2YXIgaGVpZ2h0ID0gaW5mby5oZWlnaHRcblxuICAgIHNldEZsYWdzKGluZm8pXG5cbiAgICBpZiAoZWxlbWVudCkge1xuICAgICAgZ2wudGV4U3ViSW1hZ2UyRChcbiAgICAgICAgdGFyZ2V0LCBtaXBsZXZlbCwgeCwgeSwgZm9ybWF0LCB0eXBlLCBlbGVtZW50KVxuICAgIH0gZWxzZSBpZiAoaW5mby5jb21wcmVzc2VkKSB7XG4gICAgICBnbC5jb21wcmVzc2VkVGV4U3ViSW1hZ2UyRChcbiAgICAgICAgdGFyZ2V0LCBtaXBsZXZlbCwgeCwgeSwgaW50ZXJuYWxmb3JtYXQsIHdpZHRoLCBoZWlnaHQsIGRhdGEpXG4gICAgfSBlbHNlIGlmIChpbmZvLm5lZWRzQ29weSkge1xuICAgICAgcmVnbFBvbGwoKVxuICAgICAgZ2wuY29weVRleFN1YkltYWdlMkQoXG4gICAgICAgIHRhcmdldCwgbWlwbGV2ZWwsIHgsIHksIGluZm8ueE9mZnNldCwgaW5mby55T2Zmc2V0LCB3aWR0aCwgaGVpZ2h0KVxuICAgIH0gZWxzZSB7XG4gICAgICBnbC50ZXhTdWJJbWFnZTJEKFxuICAgICAgICB0YXJnZXQsIG1pcGxldmVsLCB4LCB5LCB3aWR0aCwgaGVpZ2h0LCBmb3JtYXQsIHR5cGUsIGRhdGEpXG4gICAgfVxuICB9XG5cbiAgLy8gdGV4SW1hZ2UgcG9vbFxuICB2YXIgaW1hZ2VQb29sID0gW11cblxuICBmdW5jdGlvbiBhbGxvY0ltYWdlICgpIHtcbiAgICByZXR1cm4gaW1hZ2VQb29sLnBvcCgpIHx8IG5ldyBUZXhJbWFnZSgpXG4gIH1cblxuICBmdW5jdGlvbiBmcmVlSW1hZ2UgKGltYWdlKSB7XG4gICAgaWYgKGltYWdlLm5lZWRzRnJlZSkge1xuICAgICAgcG9vbC5mcmVlVHlwZShpbWFnZS5kYXRhKVxuICAgIH1cbiAgICBUZXhJbWFnZS5jYWxsKGltYWdlKVxuICAgIGltYWdlUG9vbC5wdXNoKGltYWdlKVxuICB9XG5cbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAvLyBNaXAgbWFwXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgZnVuY3Rpb24gTWlwTWFwICgpIHtcbiAgICBUZXhGbGFncy5jYWxsKHRoaXMpXG5cbiAgICB0aGlzLmdlbk1pcG1hcHMgPSBmYWxzZVxuICAgIHRoaXMubWlwbWFwSGludCA9IEdMX0RPTlRfQ0FSRVxuICAgIHRoaXMubWlwbWFzayA9IDBcbiAgICB0aGlzLmltYWdlcyA9IEFycmF5KDE2KVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VNaXBNYXBGcm9tU2hhcGUgKG1pcG1hcCwgd2lkdGgsIGhlaWdodCkge1xuICAgIHZhciBpbWcgPSBtaXBtYXAuaW1hZ2VzWzBdID0gYWxsb2NJbWFnZSgpXG4gICAgbWlwbWFwLm1pcG1hc2sgPSAxXG4gICAgaW1nLndpZHRoID0gbWlwbWFwLndpZHRoID0gd2lkdGhcbiAgICBpbWcuaGVpZ2h0ID0gbWlwbWFwLmhlaWdodCA9IGhlaWdodFxuICAgIGltZy5jaGFubmVscyA9IG1pcG1hcC5jaGFubmVscyA9IDRcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlTWlwTWFwRnJvbU9iamVjdCAobWlwbWFwLCBvcHRpb25zKSB7XG4gICAgdmFyIGltZ0RhdGEgPSBudWxsXG4gICAgaWYgKGlzUGl4ZWxEYXRhKG9wdGlvbnMpKSB7XG4gICAgICBpbWdEYXRhID0gbWlwbWFwLmltYWdlc1swXSA9IGFsbG9jSW1hZ2UoKVxuICAgICAgY29weUZsYWdzKGltZ0RhdGEsIG1pcG1hcClcbiAgICAgIHBhcnNlSW1hZ2UoaW1nRGF0YSwgb3B0aW9ucylcbiAgICAgIG1pcG1hcC5taXBtYXNrID0gMVxuICAgIH0gZWxzZSB7XG4gICAgICBwYXJzZUZsYWdzKG1pcG1hcCwgb3B0aW9ucylcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KG9wdGlvbnMubWlwbWFwKSkge1xuICAgICAgICB2YXIgbWlwRGF0YSA9IG9wdGlvbnMubWlwbWFwXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbWlwRGF0YS5sZW5ndGg7ICsraSkge1xuICAgICAgICAgIGltZ0RhdGEgPSBtaXBtYXAuaW1hZ2VzW2ldID0gYWxsb2NJbWFnZSgpXG4gICAgICAgICAgY29weUZsYWdzKGltZ0RhdGEsIG1pcG1hcClcbiAgICAgICAgICBpbWdEYXRhLndpZHRoID4+PSBpXG4gICAgICAgICAgaW1nRGF0YS5oZWlnaHQgPj49IGlcbiAgICAgICAgICBwYXJzZUltYWdlKGltZ0RhdGEsIG1pcERhdGFbaV0pXG4gICAgICAgICAgbWlwbWFwLm1pcG1hc2sgfD0gKDEgPDwgaSlcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaW1nRGF0YSA9IG1pcG1hcC5pbWFnZXNbMF0gPSBhbGxvY0ltYWdlKClcbiAgICAgICAgY29weUZsYWdzKGltZ0RhdGEsIG1pcG1hcClcbiAgICAgICAgcGFyc2VJbWFnZShpbWdEYXRhLCBvcHRpb25zKVxuICAgICAgICBtaXBtYXAubWlwbWFzayA9IDFcbiAgICAgIH1cbiAgICB9XG4gICAgY29weUZsYWdzKG1pcG1hcCwgbWlwbWFwLmltYWdlc1swXSlcblxuICAgIC8vIEZvciB0ZXh0dXJlcyBvZiB0aGUgY29tcHJlc3NlZCBmb3JtYXQgV0VCR0xfY29tcHJlc3NlZF90ZXh0dXJlX3MzdGNcbiAgICAvLyB3ZSBtdXN0IGhhdmUgdGhhdFxuICAgIC8vXG4gICAgLy8gXCJXaGVuIGxldmVsIGVxdWFscyB6ZXJvIHdpZHRoIGFuZCBoZWlnaHQgbXVzdCBiZSBhIG11bHRpcGxlIG9mIDQuXG4gICAgLy8gV2hlbiBsZXZlbCBpcyBncmVhdGVyIHRoYW4gMCB3aWR0aCBhbmQgaGVpZ2h0IG11c3QgYmUgMCwgMSwgMiBvciBhIG11bHRpcGxlIG9mIDQuIFwiXG4gICAgLy9cbiAgICAvLyBidXQgd2UgZG8gbm90IHlldCBzdXBwb3J0IGhhdmluZyBtdWx0aXBsZSBtaXBtYXAgbGV2ZWxzIGZvciBjb21wcmVzc2VkIHRleHR1cmVzLFxuICAgIC8vIHNvIHdlIG9ubHkgdGVzdCBmb3IgbGV2ZWwgemVyby5cblxuICAgIGlmIChtaXBtYXAuY29tcHJlc3NlZCAmJlxuICAgICAgICAobWlwbWFwLmludGVybmFsZm9ybWF0ID09PSBHTF9DT01QUkVTU0VEX1JHQl9TM1RDX0RYVDFfRVhUKSB8fFxuICAgICAgICAobWlwbWFwLmludGVybmFsZm9ybWF0ID09PSBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQxX0VYVCkgfHxcbiAgICAgICAgKG1pcG1hcC5pbnRlcm5hbGZvcm1hdCA9PT0gR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUM19FWFQpIHx8XG4gICAgICAgIChtaXBtYXAuaW50ZXJuYWxmb3JtYXQgPT09IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDVfRVhUKSkge1xuICAgICAgY2hlY2sobWlwbWFwLndpZHRoICUgNCA9PT0gMCAmJlxuICAgICAgICAgICAgbWlwbWFwLmhlaWdodCAlIDQgPT09IDAsXG4gICAgICAgICAgICAnZm9yIGNvbXByZXNzZWQgdGV4dHVyZSBmb3JtYXRzLCBtaXBtYXAgbGV2ZWwgMCBtdXN0IGhhdmUgd2lkdGggYW5kIGhlaWdodCB0aGF0IGFyZSBhIG11bHRpcGxlIG9mIDQnKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHNldE1pcE1hcCAobWlwbWFwLCB0YXJnZXQpIHtcbiAgICB2YXIgaW1hZ2VzID0gbWlwbWFwLmltYWdlc1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgaW1hZ2VzLmxlbmd0aDsgKytpKSB7XG4gICAgICBpZiAoIWltYWdlc1tpXSkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIHNldEltYWdlKGltYWdlc1tpXSwgdGFyZ2V0LCBpKVxuICAgIH1cbiAgfVxuXG4gIHZhciBtaXBQb29sID0gW11cblxuICBmdW5jdGlvbiBhbGxvY01pcE1hcCAoKSB7XG4gICAgdmFyIHJlc3VsdCA9IG1pcFBvb2wucG9wKCkgfHwgbmV3IE1pcE1hcCgpXG4gICAgVGV4RmxhZ3MuY2FsbChyZXN1bHQpXG4gICAgcmVzdWx0Lm1pcG1hc2sgPSAwXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCAxNjsgKytpKSB7XG4gICAgICByZXN1bHQuaW1hZ2VzW2ldID0gbnVsbFxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0XG4gIH1cblxuICBmdW5jdGlvbiBmcmVlTWlwTWFwIChtaXBtYXApIHtcbiAgICB2YXIgaW1hZ2VzID0gbWlwbWFwLmltYWdlc1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgaW1hZ2VzLmxlbmd0aDsgKytpKSB7XG4gICAgICBpZiAoaW1hZ2VzW2ldKSB7XG4gICAgICAgIGZyZWVJbWFnZShpbWFnZXNbaV0pXG4gICAgICB9XG4gICAgICBpbWFnZXNbaV0gPSBudWxsXG4gICAgfVxuICAgIG1pcFBvb2wucHVzaChtaXBtYXApXG4gIH1cblxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIFRleCBpbmZvXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgZnVuY3Rpb24gVGV4SW5mbyAoKSB7XG4gICAgdGhpcy5taW5GaWx0ZXIgPSBHTF9ORUFSRVNUXG4gICAgdGhpcy5tYWdGaWx0ZXIgPSBHTF9ORUFSRVNUXG5cbiAgICB0aGlzLndyYXBTID0gR0xfQ0xBTVBfVE9fRURHRVxuICAgIHRoaXMud3JhcFQgPSBHTF9DTEFNUF9UT19FREdFXG5cbiAgICB0aGlzLmFuaXNvdHJvcGljID0gMVxuXG4gICAgdGhpcy5nZW5NaXBtYXBzID0gZmFsc2VcbiAgICB0aGlzLm1pcG1hcEhpbnQgPSBHTF9ET05UX0NBUkVcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlVGV4SW5mbyAoaW5mbywgb3B0aW9ucykge1xuICAgIGlmICgnbWluJyBpbiBvcHRpb25zKSB7XG4gICAgICB2YXIgbWluRmlsdGVyID0gb3B0aW9ucy5taW5cbiAgICAgIGNoZWNrLnBhcmFtZXRlcihtaW5GaWx0ZXIsIG1pbkZpbHRlcnMpXG4gICAgICBpbmZvLm1pbkZpbHRlciA9IG1pbkZpbHRlcnNbbWluRmlsdGVyXVxuICAgICAgaWYgKE1JUE1BUF9GSUxURVJTLmluZGV4T2YoaW5mby5taW5GaWx0ZXIpID49IDApIHtcbiAgICAgICAgaW5mby5nZW5NaXBtYXBzID0gdHJ1ZVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmICgnbWFnJyBpbiBvcHRpb25zKSB7XG4gICAgICB2YXIgbWFnRmlsdGVyID0gb3B0aW9ucy5tYWdcbiAgICAgIGNoZWNrLnBhcmFtZXRlcihtYWdGaWx0ZXIsIG1hZ0ZpbHRlcnMpXG4gICAgICBpbmZvLm1hZ0ZpbHRlciA9IG1hZ0ZpbHRlcnNbbWFnRmlsdGVyXVxuICAgIH1cblxuICAgIHZhciB3cmFwUyA9IGluZm8ud3JhcFNcbiAgICB2YXIgd3JhcFQgPSBpbmZvLndyYXBUXG4gICAgaWYgKCd3cmFwJyBpbiBvcHRpb25zKSB7XG4gICAgICB2YXIgd3JhcCA9IG9wdGlvbnMud3JhcFxuICAgICAgaWYgKHR5cGVvZiB3cmFwID09PSAnc3RyaW5nJykge1xuICAgICAgICBjaGVjay5wYXJhbWV0ZXIod3JhcCwgd3JhcE1vZGVzKVxuICAgICAgICB3cmFwUyA9IHdyYXBUID0gd3JhcE1vZGVzW3dyYXBdXG4gICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkod3JhcCkpIHtcbiAgICAgICAgY2hlY2sucGFyYW1ldGVyKHdyYXBbMF0sIHdyYXBNb2RlcylcbiAgICAgICAgY2hlY2sucGFyYW1ldGVyKHdyYXBbMV0sIHdyYXBNb2RlcylcbiAgICAgICAgd3JhcFMgPSB3cmFwTW9kZXNbd3JhcFswXV1cbiAgICAgICAgd3JhcFQgPSB3cmFwTW9kZXNbd3JhcFsxXV1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKCd3cmFwUycgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgb3B0V3JhcFMgPSBvcHRpb25zLndyYXBTXG4gICAgICAgIGNoZWNrLnBhcmFtZXRlcihvcHRXcmFwUywgd3JhcE1vZGVzKVxuICAgICAgICB3cmFwUyA9IHdyYXBNb2Rlc1tvcHRXcmFwU11cbiAgICAgIH1cbiAgICAgIGlmICgnd3JhcFQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIG9wdFdyYXBUID0gb3B0aW9ucy53cmFwVFxuICAgICAgICBjaGVjay5wYXJhbWV0ZXIob3B0V3JhcFQsIHdyYXBNb2RlcylcbiAgICAgICAgd3JhcFQgPSB3cmFwTW9kZXNbb3B0V3JhcFRdXG4gICAgICB9XG4gICAgfVxuICAgIGluZm8ud3JhcFMgPSB3cmFwU1xuICAgIGluZm8ud3JhcFQgPSB3cmFwVFxuXG4gICAgaWYgKCdhbmlzb3Ryb3BpYycgaW4gb3B0aW9ucykge1xuICAgICAgdmFyIGFuaXNvdHJvcGljID0gb3B0aW9ucy5hbmlzb3Ryb3BpY1xuICAgICAgY2hlY2sodHlwZW9mIGFuaXNvdHJvcGljID09PSAnbnVtYmVyJyAmJlxuICAgICAgICAgYW5pc290cm9waWMgPj0gMSAmJiBhbmlzb3Ryb3BpYyA8PSBsaW1pdHMubWF4QW5pc290cm9waWMsXG4gICAgICAgICdhbmlzbyBzYW1wbGVzIG11c3QgYmUgYmV0d2VlbiAxIGFuZCAnKVxuICAgICAgaW5mby5hbmlzb3Ryb3BpYyA9IG9wdGlvbnMuYW5pc290cm9waWNcbiAgICB9XG5cbiAgICBpZiAoJ21pcG1hcCcgaW4gb3B0aW9ucykge1xuICAgICAgdmFyIGhhc01pcE1hcCA9IGZhbHNlXG4gICAgICBzd2l0Y2ggKHR5cGVvZiBvcHRpb25zLm1pcG1hcCkge1xuICAgICAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgICAgIGNoZWNrLnBhcmFtZXRlcihvcHRpb25zLm1pcG1hcCwgbWlwbWFwSGludCxcbiAgICAgICAgICAgICdpbnZhbGlkIG1pcG1hcCBoaW50JylcbiAgICAgICAgICBpbmZvLm1pcG1hcEhpbnQgPSBtaXBtYXBIaW50W29wdGlvbnMubWlwbWFwXVxuICAgICAgICAgIGluZm8uZ2VuTWlwbWFwcyA9IHRydWVcbiAgICAgICAgICBoYXNNaXBNYXAgPSB0cnVlXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdib29sZWFuJzpcbiAgICAgICAgICBoYXNNaXBNYXAgPSBpbmZvLmdlbk1pcG1hcHMgPSBvcHRpb25zLm1pcG1hcFxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgICAgICBjaGVjayhBcnJheS5pc0FycmF5KG9wdGlvbnMubWlwbWFwKSwgJ2ludmFsaWQgbWlwbWFwIHR5cGUnKVxuICAgICAgICAgIGluZm8uZ2VuTWlwbWFwcyA9IGZhbHNlXG4gICAgICAgICAgaGFzTWlwTWFwID0gdHJ1ZVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICBjaGVjay5yYWlzZSgnaW52YWxpZCBtaXBtYXAgdHlwZScpXG4gICAgICB9XG4gICAgICBpZiAoaGFzTWlwTWFwICYmICEoJ21pbicgaW4gb3B0aW9ucykpIHtcbiAgICAgICAgaW5mby5taW5GaWx0ZXIgPSBHTF9ORUFSRVNUX01JUE1BUF9ORUFSRVNUXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc2V0VGV4SW5mbyAoaW5mbywgdGFyZ2V0KSB7XG4gICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfTUlOX0ZJTFRFUiwgaW5mby5taW5GaWx0ZXIpXG4gICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfTUFHX0ZJTFRFUiwgaW5mby5tYWdGaWx0ZXIpXG4gICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfV1JBUF9TLCBpbmZvLndyYXBTKVxuICAgIGdsLnRleFBhcmFtZXRlcmkodGFyZ2V0LCBHTF9URVhUVVJFX1dSQVBfVCwgaW5mby53cmFwVClcbiAgICBpZiAoZXh0ZW5zaW9ucy5leHRfdGV4dHVyZV9maWx0ZXJfYW5pc290cm9waWMpIHtcbiAgICAgIGdsLnRleFBhcmFtZXRlcmkodGFyZ2V0LCBHTF9URVhUVVJFX01BWF9BTklTT1RST1BZX0VYVCwgaW5mby5hbmlzb3Ryb3BpYylcbiAgICB9XG4gICAgaWYgKGluZm8uZ2VuTWlwbWFwcykge1xuICAgICAgZ2wuaGludChHTF9HRU5FUkFURV9NSVBNQVBfSElOVCwgaW5mby5taXBtYXBIaW50KVxuICAgICAgZ2wuZ2VuZXJhdGVNaXBtYXAodGFyZ2V0KVxuICAgIH1cbiAgfVxuXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gRnVsbCB0ZXh0dXJlIG9iamVjdFxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIHZhciB0ZXh0dXJlQ291bnQgPSAwXG4gIHZhciB0ZXh0dXJlU2V0ID0ge31cbiAgdmFyIG51bVRleFVuaXRzID0gbGltaXRzLm1heFRleHR1cmVVbml0c1xuICB2YXIgdGV4dHVyZVVuaXRzID0gQXJyYXkobnVtVGV4VW5pdHMpLm1hcChmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIG51bGxcbiAgfSlcblxuICBmdW5jdGlvbiBSRUdMVGV4dHVyZSAodGFyZ2V0KSB7XG4gICAgVGV4RmxhZ3MuY2FsbCh0aGlzKVxuICAgIHRoaXMubWlwbWFzayA9IDBcbiAgICB0aGlzLmludGVybmFsZm9ybWF0ID0gR0xfUkdCQVxuXG4gICAgdGhpcy5pZCA9IHRleHR1cmVDb3VudCsrXG5cbiAgICB0aGlzLnJlZkNvdW50ID0gMVxuXG4gICAgdGhpcy50YXJnZXQgPSB0YXJnZXRcbiAgICB0aGlzLnRleHR1cmUgPSBnbC5jcmVhdGVUZXh0dXJlKClcblxuICAgIHRoaXMudW5pdCA9IC0xXG4gICAgdGhpcy5iaW5kQ291bnQgPSAwXG5cbiAgICB0aGlzLnRleEluZm8gPSBuZXcgVGV4SW5mbygpXG5cbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgIHRoaXMuc3RhdHMgPSB7c2l6ZTogMH1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiB0ZW1wQmluZCAodGV4dHVyZSkge1xuICAgIGdsLmFjdGl2ZVRleHR1cmUoR0xfVEVYVFVSRTApXG4gICAgZ2wuYmluZFRleHR1cmUodGV4dHVyZS50YXJnZXQsIHRleHR1cmUudGV4dHVyZSlcbiAgfVxuXG4gIGZ1bmN0aW9uIHRlbXBSZXN0b3JlICgpIHtcbiAgICB2YXIgcHJldiA9IHRleHR1cmVVbml0c1swXVxuICAgIGlmIChwcmV2KSB7XG4gICAgICBnbC5iaW5kVGV4dHVyZShwcmV2LnRhcmdldCwgcHJldi50ZXh0dXJlKVxuICAgIH0gZWxzZSB7XG4gICAgICBnbC5iaW5kVGV4dHVyZShHTF9URVhUVVJFXzJELCBudWxsKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3kgKHRleHR1cmUpIHtcbiAgICB2YXIgaGFuZGxlID0gdGV4dHVyZS50ZXh0dXJlXG4gICAgY2hlY2soaGFuZGxlLCAnbXVzdCBub3QgZG91YmxlIGRlc3Ryb3kgdGV4dHVyZScpXG4gICAgdmFyIHVuaXQgPSB0ZXh0dXJlLnVuaXRcbiAgICB2YXIgdGFyZ2V0ID0gdGV4dHVyZS50YXJnZXRcbiAgICBpZiAodW5pdCA+PSAwKSB7XG4gICAgICBnbC5hY3RpdmVUZXh0dXJlKEdMX1RFWFRVUkUwICsgdW5pdClcbiAgICAgIGdsLmJpbmRUZXh0dXJlKHRhcmdldCwgbnVsbClcbiAgICAgIHRleHR1cmVVbml0c1t1bml0XSA9IG51bGxcbiAgICB9XG4gICAgZ2wuZGVsZXRlVGV4dHVyZShoYW5kbGUpXG4gICAgdGV4dHVyZS50ZXh0dXJlID0gbnVsbFxuICAgIHRleHR1cmUucGFyYW1zID0gbnVsbFxuICAgIHRleHR1cmUucGl4ZWxzID0gbnVsbFxuICAgIHRleHR1cmUucmVmQ291bnQgPSAwXG4gICAgZGVsZXRlIHRleHR1cmVTZXRbdGV4dHVyZS5pZF1cbiAgICBzdGF0cy50ZXh0dXJlQ291bnQtLVxuICB9XG5cbiAgZXh0ZW5kKFJFR0xUZXh0dXJlLnByb3RvdHlwZSwge1xuICAgIGJpbmQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciB0ZXh0dXJlID0gdGhpc1xuICAgICAgdGV4dHVyZS5iaW5kQ291bnQgKz0gMVxuICAgICAgdmFyIHVuaXQgPSB0ZXh0dXJlLnVuaXRcbiAgICAgIGlmICh1bml0IDwgMCkge1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG51bVRleFVuaXRzOyArK2kpIHtcbiAgICAgICAgICB2YXIgb3RoZXIgPSB0ZXh0dXJlVW5pdHNbaV1cbiAgICAgICAgICBpZiAob3RoZXIpIHtcbiAgICAgICAgICAgIGlmIChvdGhlci5iaW5kQ291bnQgPiAwKSB7XG4gICAgICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBvdGhlci51bml0ID0gLTFcbiAgICAgICAgICB9XG4gICAgICAgICAgdGV4dHVyZVVuaXRzW2ldID0gdGV4dHVyZVxuICAgICAgICAgIHVuaXQgPSBpXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgfVxuICAgICAgICBpZiAodW5pdCA+PSBudW1UZXhVbml0cykge1xuICAgICAgICAgIGNoZWNrLnJhaXNlKCdpbnN1ZmZpY2llbnQgbnVtYmVyIG9mIHRleHR1cmUgdW5pdHMnKVxuICAgICAgICB9XG4gICAgICAgIGlmIChjb25maWcucHJvZmlsZSAmJiBzdGF0cy5tYXhUZXh0dXJlVW5pdHMgPCAodW5pdCArIDEpKSB7XG4gICAgICAgICAgc3RhdHMubWF4VGV4dHVyZVVuaXRzID0gdW5pdCArIDEgLy8gKzEsIHNpbmNlIHRoZSB1bml0cyBhcmUgemVyby1iYXNlZFxuICAgICAgICB9XG4gICAgICAgIHRleHR1cmUudW5pdCA9IHVuaXRcbiAgICAgICAgZ2wuYWN0aXZlVGV4dHVyZShHTF9URVhUVVJFMCArIHVuaXQpXG4gICAgICAgIGdsLmJpbmRUZXh0dXJlKHRleHR1cmUudGFyZ2V0LCB0ZXh0dXJlLnRleHR1cmUpXG4gICAgICB9XG4gICAgICByZXR1cm4gdW5pdFxuICAgIH0sXG5cbiAgICB1bmJpbmQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHRoaXMuYmluZENvdW50IC09IDFcbiAgICB9LFxuXG4gICAgZGVjUmVmOiBmdW5jdGlvbiAoKSB7XG4gICAgICBpZiAoLS10aGlzLnJlZkNvdW50IDw9IDApIHtcbiAgICAgICAgZGVzdHJveSh0aGlzKVxuICAgICAgfVxuICAgIH1cbiAgfSlcblxuICBmdW5jdGlvbiBjcmVhdGVUZXh0dXJlMkQgKGEsIGIpIHtcbiAgICB2YXIgdGV4dHVyZSA9IG5ldyBSRUdMVGV4dHVyZShHTF9URVhUVVJFXzJEKVxuICAgIHRleHR1cmVTZXRbdGV4dHVyZS5pZF0gPSB0ZXh0dXJlXG4gICAgc3RhdHMudGV4dHVyZUNvdW50KytcblxuICAgIGZ1bmN0aW9uIHJlZ2xUZXh0dXJlMkQgKGEsIGIpIHtcbiAgICAgIHZhciB0ZXhJbmZvID0gdGV4dHVyZS50ZXhJbmZvXG4gICAgICBUZXhJbmZvLmNhbGwodGV4SW5mbylcbiAgICAgIHZhciBtaXBEYXRhID0gYWxsb2NNaXBNYXAoKVxuXG4gICAgICBpZiAodHlwZW9mIGEgPT09ICdudW1iZXInKSB7XG4gICAgICAgIGlmICh0eXBlb2YgYiA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICBwYXJzZU1pcE1hcEZyb21TaGFwZShtaXBEYXRhLCBhIHwgMCwgYiB8IDApXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcGFyc2VNaXBNYXBGcm9tU2hhcGUobWlwRGF0YSwgYSB8IDAsIGEgfCAwKVxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGEpIHtcbiAgICAgICAgY2hlY2sudHlwZShhLCAnb2JqZWN0JywgJ2ludmFsaWQgYXJndW1lbnRzIHRvIHJlZ2wudGV4dHVyZScpXG4gICAgICAgIHBhcnNlVGV4SW5mbyh0ZXhJbmZvLCBhKVxuICAgICAgICBwYXJzZU1pcE1hcEZyb21PYmplY3QobWlwRGF0YSwgYSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIGVtcHR5IHRleHR1cmVzIGdldCBhc3NpZ25lZCBhIGRlZmF1bHQgc2hhcGUgb2YgMXgxXG4gICAgICAgIHBhcnNlTWlwTWFwRnJvbVNoYXBlKG1pcERhdGEsIDEsIDEpXG4gICAgICB9XG5cbiAgICAgIGlmICh0ZXhJbmZvLmdlbk1pcG1hcHMpIHtcbiAgICAgICAgbWlwRGF0YS5taXBtYXNrID0gKG1pcERhdGEud2lkdGggPDwgMSkgLSAxXG4gICAgICB9XG4gICAgICB0ZXh0dXJlLm1pcG1hc2sgPSBtaXBEYXRhLm1pcG1hc2tcblxuICAgICAgY29weUZsYWdzKHRleHR1cmUsIG1pcERhdGEpXG5cbiAgICAgIGNoZWNrLnRleHR1cmUyRCh0ZXhJbmZvLCBtaXBEYXRhLCBsaW1pdHMpXG4gICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0ID0gbWlwRGF0YS5pbnRlcm5hbGZvcm1hdFxuXG4gICAgICByZWdsVGV4dHVyZTJELndpZHRoID0gbWlwRGF0YS53aWR0aFxuICAgICAgcmVnbFRleHR1cmUyRC5oZWlnaHQgPSBtaXBEYXRhLmhlaWdodFxuXG4gICAgICB0ZW1wQmluZCh0ZXh0dXJlKVxuICAgICAgc2V0TWlwTWFwKG1pcERhdGEsIEdMX1RFWFRVUkVfMkQpXG4gICAgICBzZXRUZXhJbmZvKHRleEluZm8sIEdMX1RFWFRVUkVfMkQpXG4gICAgICB0ZW1wUmVzdG9yZSgpXG5cbiAgICAgIGZyZWVNaXBNYXAobWlwRGF0YSlcblxuICAgICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICAgIHRleHR1cmUuc3RhdHMuc2l6ZSA9IGdldFRleHR1cmVTaXplKFxuICAgICAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQsXG4gICAgICAgICAgdGV4dHVyZS50eXBlLFxuICAgICAgICAgIG1pcERhdGEud2lkdGgsXG4gICAgICAgICAgbWlwRGF0YS5oZWlnaHQsXG4gICAgICAgICAgdGV4SW5mby5nZW5NaXBtYXBzLFxuICAgICAgICAgIGZhbHNlKVxuICAgICAgfVxuICAgICAgcmVnbFRleHR1cmUyRC5mb3JtYXQgPSB0ZXh0dXJlRm9ybWF0c0ludmVydFt0ZXh0dXJlLmludGVybmFsZm9ybWF0XVxuICAgICAgcmVnbFRleHR1cmUyRC50eXBlID0gdGV4dHVyZVR5cGVzSW52ZXJ0W3RleHR1cmUudHlwZV1cblxuICAgICAgcmVnbFRleHR1cmUyRC5tYWcgPSBtYWdGaWx0ZXJzSW52ZXJ0W3RleEluZm8ubWFnRmlsdGVyXVxuICAgICAgcmVnbFRleHR1cmUyRC5taW4gPSBtaW5GaWx0ZXJzSW52ZXJ0W3RleEluZm8ubWluRmlsdGVyXVxuXG4gICAgICByZWdsVGV4dHVyZTJELndyYXBTID0gd3JhcE1vZGVzSW52ZXJ0W3RleEluZm8ud3JhcFNdXG4gICAgICByZWdsVGV4dHVyZTJELndyYXBUID0gd3JhcE1vZGVzSW52ZXJ0W3RleEluZm8ud3JhcFRdXG5cbiAgICAgIHJldHVybiByZWdsVGV4dHVyZTJEXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc3ViaW1hZ2UgKGltYWdlLCB4XywgeV8sIGxldmVsXykge1xuICAgICAgY2hlY2soISFpbWFnZSwgJ211c3Qgc3BlY2lmeSBpbWFnZSBkYXRhJylcblxuICAgICAgdmFyIHggPSB4XyB8IDBcbiAgICAgIHZhciB5ID0geV8gfCAwXG4gICAgICB2YXIgbGV2ZWwgPSBsZXZlbF8gfCAwXG5cbiAgICAgIHZhciBpbWFnZURhdGEgPSBhbGxvY0ltYWdlKClcbiAgICAgIGNvcHlGbGFncyhpbWFnZURhdGEsIHRleHR1cmUpXG4gICAgICBpbWFnZURhdGEud2lkdGggPSAwXG4gICAgICBpbWFnZURhdGEuaGVpZ2h0ID0gMFxuICAgICAgcGFyc2VJbWFnZShpbWFnZURhdGEsIGltYWdlKVxuICAgICAgaW1hZ2VEYXRhLndpZHRoID0gaW1hZ2VEYXRhLndpZHRoIHx8ICgodGV4dHVyZS53aWR0aCA+PiBsZXZlbCkgLSB4KVxuICAgICAgaW1hZ2VEYXRhLmhlaWdodCA9IGltYWdlRGF0YS5oZWlnaHQgfHwgKCh0ZXh0dXJlLmhlaWdodCA+PiBsZXZlbCkgLSB5KVxuXG4gICAgICBjaGVjayhcbiAgICAgICAgdGV4dHVyZS50eXBlID09PSBpbWFnZURhdGEudHlwZSAmJlxuICAgICAgICB0ZXh0dXJlLmZvcm1hdCA9PT0gaW1hZ2VEYXRhLmZvcm1hdCAmJlxuICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0ID09PSBpbWFnZURhdGEuaW50ZXJuYWxmb3JtYXQsXG4gICAgICAgICdpbmNvbXBhdGlibGUgZm9ybWF0IGZvciB0ZXh0dXJlLnN1YmltYWdlJylcbiAgICAgIGNoZWNrKFxuICAgICAgICB4ID49IDAgJiYgeSA+PSAwICYmXG4gICAgICAgIHggKyBpbWFnZURhdGEud2lkdGggPD0gdGV4dHVyZS53aWR0aCAmJlxuICAgICAgICB5ICsgaW1hZ2VEYXRhLmhlaWdodCA8PSB0ZXh0dXJlLmhlaWdodCxcbiAgICAgICAgJ3RleHR1cmUuc3ViaW1hZ2Ugd3JpdGUgb3V0IG9mIGJvdW5kcycpXG4gICAgICBjaGVjayhcbiAgICAgICAgdGV4dHVyZS5taXBtYXNrICYgKDEgPDwgbGV2ZWwpLFxuICAgICAgICAnbWlzc2luZyBtaXBtYXAgZGF0YScpXG4gICAgICBjaGVjayhcbiAgICAgICAgaW1hZ2VEYXRhLmRhdGEgfHwgaW1hZ2VEYXRhLmVsZW1lbnQgfHwgaW1hZ2VEYXRhLm5lZWRzQ29weSxcbiAgICAgICAgJ21pc3NpbmcgaW1hZ2UgZGF0YScpXG5cbiAgICAgIHRlbXBCaW5kKHRleHR1cmUpXG4gICAgICBzZXRTdWJJbWFnZShpbWFnZURhdGEsIEdMX1RFWFRVUkVfMkQsIHgsIHksIGxldmVsKVxuICAgICAgdGVtcFJlc3RvcmUoKVxuXG4gICAgICBmcmVlSW1hZ2UoaW1hZ2VEYXRhKVxuXG4gICAgICByZXR1cm4gcmVnbFRleHR1cmUyRFxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlc2l6ZSAod18sIGhfKSB7XG4gICAgICB2YXIgdyA9IHdfIHwgMFxuICAgICAgdmFyIGggPSAoaF8gfCAwKSB8fCB3XG4gICAgICBpZiAodyA9PT0gdGV4dHVyZS53aWR0aCAmJiBoID09PSB0ZXh0dXJlLmhlaWdodCkge1xuICAgICAgICByZXR1cm4gcmVnbFRleHR1cmUyRFxuICAgICAgfVxuXG4gICAgICByZWdsVGV4dHVyZTJELndpZHRoID0gdGV4dHVyZS53aWR0aCA9IHdcbiAgICAgIHJlZ2xUZXh0dXJlMkQuaGVpZ2h0ID0gdGV4dHVyZS5oZWlnaHQgPSBoXG5cbiAgICAgIHRlbXBCaW5kKHRleHR1cmUpXG4gICAgICBmb3IgKHZhciBpID0gMDsgdGV4dHVyZS5taXBtYXNrID4+IGk7ICsraSkge1xuICAgICAgICBnbC50ZXhJbWFnZTJEKFxuICAgICAgICAgIEdMX1RFWFRVUkVfMkQsXG4gICAgICAgICAgaSxcbiAgICAgICAgICB0ZXh0dXJlLmZvcm1hdCxcbiAgICAgICAgICB3ID4+IGksXG4gICAgICAgICAgaCA+PiBpLFxuICAgICAgICAgIDAsXG4gICAgICAgICAgdGV4dHVyZS5mb3JtYXQsXG4gICAgICAgICAgdGV4dHVyZS50eXBlLFxuICAgICAgICAgIG51bGwpXG4gICAgICB9XG4gICAgICB0ZW1wUmVzdG9yZSgpXG5cbiAgICAgIC8vIGFsc28sIHJlY29tcHV0ZSB0aGUgdGV4dHVyZSBzaXplLlxuICAgICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICAgIHRleHR1cmUuc3RhdHMuc2l6ZSA9IGdldFRleHR1cmVTaXplKFxuICAgICAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQsXG4gICAgICAgICAgdGV4dHVyZS50eXBlLFxuICAgICAgICAgIHcsXG4gICAgICAgICAgaCxcbiAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICBmYWxzZSlcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJlZ2xUZXh0dXJlMkRcbiAgICB9XG5cbiAgICByZWdsVGV4dHVyZTJEKGEsIGIpXG5cbiAgICByZWdsVGV4dHVyZTJELnN1YmltYWdlID0gc3ViaW1hZ2VcbiAgICByZWdsVGV4dHVyZTJELnJlc2l6ZSA9IHJlc2l6ZVxuICAgIHJlZ2xUZXh0dXJlMkQuX3JlZ2xUeXBlID0gJ3RleHR1cmUyZCdcbiAgICByZWdsVGV4dHVyZTJELl90ZXh0dXJlID0gdGV4dHVyZVxuICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgcmVnbFRleHR1cmUyRC5zdGF0cyA9IHRleHR1cmUuc3RhdHNcbiAgICB9XG4gICAgcmVnbFRleHR1cmUyRC5kZXN0cm95ID0gZnVuY3Rpb24gKCkge1xuICAgICAgdGV4dHVyZS5kZWNSZWYoKVxuICAgIH1cblxuICAgIHJldHVybiByZWdsVGV4dHVyZTJEXG4gIH1cblxuICBmdW5jdGlvbiBjcmVhdGVUZXh0dXJlQ3ViZSAoYTAsIGExLCBhMiwgYTMsIGE0LCBhNSkge1xuICAgIHZhciB0ZXh0dXJlID0gbmV3IFJFR0xUZXh0dXJlKEdMX1RFWFRVUkVfQ1VCRV9NQVApXG4gICAgdGV4dHVyZVNldFt0ZXh0dXJlLmlkXSA9IHRleHR1cmVcbiAgICBzdGF0cy5jdWJlQ291bnQrK1xuXG4gICAgdmFyIGZhY2VzID0gbmV3IEFycmF5KDYpXG5cbiAgICBmdW5jdGlvbiByZWdsVGV4dHVyZUN1YmUgKGEwLCBhMSwgYTIsIGEzLCBhNCwgYTUpIHtcbiAgICAgIHZhciBpXG4gICAgICB2YXIgdGV4SW5mbyA9IHRleHR1cmUudGV4SW5mb1xuICAgICAgVGV4SW5mby5jYWxsKHRleEluZm8pXG4gICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgIGZhY2VzW2ldID0gYWxsb2NNaXBNYXAoKVxuICAgICAgfVxuXG4gICAgICBpZiAodHlwZW9mIGEwID09PSAnbnVtYmVyJyB8fCAhYTApIHtcbiAgICAgICAgdmFyIHMgPSAoYTAgfCAwKSB8fCAxXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCA2OyArK2kpIHtcbiAgICAgICAgICBwYXJzZU1pcE1hcEZyb21TaGFwZShmYWNlc1tpXSwgcywgcylcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgYTAgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIGlmIChhMSkge1xuICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbU9iamVjdChmYWNlc1swXSwgYTApXG4gICAgICAgICAgcGFyc2VNaXBNYXBGcm9tT2JqZWN0KGZhY2VzWzFdLCBhMSlcbiAgICAgICAgICBwYXJzZU1pcE1hcEZyb21PYmplY3QoZmFjZXNbMl0sIGEyKVxuICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbU9iamVjdChmYWNlc1szXSwgYTMpXG4gICAgICAgICAgcGFyc2VNaXBNYXBGcm9tT2JqZWN0KGZhY2VzWzRdLCBhNClcbiAgICAgICAgICBwYXJzZU1pcE1hcEZyb21PYmplY3QoZmFjZXNbNV0sIGE1KVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHBhcnNlVGV4SW5mbyh0ZXhJbmZvLCBhMClcbiAgICAgICAgICBwYXJzZUZsYWdzKHRleHR1cmUsIGEwKVxuICAgICAgICAgIGlmICgnZmFjZXMnIGluIGEwKSB7XG4gICAgICAgICAgICB2YXIgZmFjZV9pbnB1dCA9IGEwLmZhY2VzXG4gICAgICAgICAgICBjaGVjayhBcnJheS5pc0FycmF5KGZhY2VfaW5wdXQpICYmIGZhY2VfaW5wdXQubGVuZ3RoID09PSA2LFxuICAgICAgICAgICAgICAnY3ViZSBmYWNlcyBtdXN0IGJlIGEgbGVuZ3RoIDYgYXJyYXknKVxuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICAgICAgICBjaGVjayh0eXBlb2YgZmFjZV9pbnB1dFtpXSA9PT0gJ29iamVjdCcgJiYgISFmYWNlX2lucHV0W2ldLFxuICAgICAgICAgICAgICAgICdpbnZhbGlkIGlucHV0IGZvciBjdWJlIG1hcCBmYWNlJylcbiAgICAgICAgICAgICAgY29weUZsYWdzKGZhY2VzW2ldLCB0ZXh0dXJlKVxuICAgICAgICAgICAgICBwYXJzZU1pcE1hcEZyb21PYmplY3QoZmFjZXNbaV0sIGZhY2VfaW5wdXRbaV0pXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCA2OyArK2kpIHtcbiAgICAgICAgICAgICAgcGFyc2VNaXBNYXBGcm9tT2JqZWN0KGZhY2VzW2ldLCBhMClcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNoZWNrLnJhaXNlKCdpbnZhbGlkIGFyZ3VtZW50cyB0byBjdWJlIG1hcCcpXG4gICAgICB9XG5cbiAgICAgIGNvcHlGbGFncyh0ZXh0dXJlLCBmYWNlc1swXSlcbiAgICAgIGlmICh0ZXhJbmZvLmdlbk1pcG1hcHMpIHtcbiAgICAgICAgdGV4dHVyZS5taXBtYXNrID0gKGZhY2VzWzBdLndpZHRoIDw8IDEpIC0gMVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGV4dHVyZS5taXBtYXNrID0gZmFjZXNbMF0ubWlwbWFza1xuICAgICAgfVxuXG4gICAgICBjaGVjay50ZXh0dXJlQ3ViZSh0ZXh0dXJlLCB0ZXhJbmZvLCBmYWNlcywgbGltaXRzKVxuICAgICAgdGV4dHVyZS5pbnRlcm5hbGZvcm1hdCA9IGZhY2VzWzBdLmludGVybmFsZm9ybWF0XG5cbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS53aWR0aCA9IGZhY2VzWzBdLndpZHRoXG4gICAgICByZWdsVGV4dHVyZUN1YmUuaGVpZ2h0ID0gZmFjZXNbMF0uaGVpZ2h0XG5cbiAgICAgIHRlbXBCaW5kKHRleHR1cmUpXG4gICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgIHNldE1pcE1hcChmYWNlc1tpXSwgR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YICsgaSlcbiAgICAgIH1cbiAgICAgIHNldFRleEluZm8odGV4SW5mbywgR0xfVEVYVFVSRV9DVUJFX01BUClcbiAgICAgIHRlbXBSZXN0b3JlKClcblxuICAgICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICAgIHRleHR1cmUuc3RhdHMuc2l6ZSA9IGdldFRleHR1cmVTaXplKFxuICAgICAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQsXG4gICAgICAgICAgdGV4dHVyZS50eXBlLFxuICAgICAgICAgIHJlZ2xUZXh0dXJlQ3ViZS53aWR0aCxcbiAgICAgICAgICByZWdsVGV4dHVyZUN1YmUuaGVpZ2h0LFxuICAgICAgICAgIHRleEluZm8uZ2VuTWlwbWFwcyxcbiAgICAgICAgICB0cnVlKVxuICAgICAgfVxuXG4gICAgICByZWdsVGV4dHVyZUN1YmUuZm9ybWF0ID0gdGV4dHVyZUZvcm1hdHNJbnZlcnRbdGV4dHVyZS5pbnRlcm5hbGZvcm1hdF1cbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS50eXBlID0gdGV4dHVyZVR5cGVzSW52ZXJ0W3RleHR1cmUudHlwZV1cblxuICAgICAgcmVnbFRleHR1cmVDdWJlLm1hZyA9IG1hZ0ZpbHRlcnNJbnZlcnRbdGV4SW5mby5tYWdGaWx0ZXJdXG4gICAgICByZWdsVGV4dHVyZUN1YmUubWluID0gbWluRmlsdGVyc0ludmVydFt0ZXhJbmZvLm1pbkZpbHRlcl1cblxuICAgICAgcmVnbFRleHR1cmVDdWJlLndyYXBTID0gd3JhcE1vZGVzSW52ZXJ0W3RleEluZm8ud3JhcFNdXG4gICAgICByZWdsVGV4dHVyZUN1YmUud3JhcFQgPSB3cmFwTW9kZXNJbnZlcnRbdGV4SW5mby53cmFwVF1cblxuICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICBmcmVlTWlwTWFwKGZhY2VzW2ldKVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmVnbFRleHR1cmVDdWJlXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc3ViaW1hZ2UgKGZhY2UsIGltYWdlLCB4XywgeV8sIGxldmVsXykge1xuICAgICAgY2hlY2soISFpbWFnZSwgJ211c3Qgc3BlY2lmeSBpbWFnZSBkYXRhJylcbiAgICAgIGNoZWNrKHR5cGVvZiBmYWNlID09PSAnbnVtYmVyJyAmJiBmYWNlID09PSAoZmFjZSB8IDApICYmXG4gICAgICAgIGZhY2UgPj0gMCAmJiBmYWNlIDwgNiwgJ2ludmFsaWQgZmFjZScpXG5cbiAgICAgIHZhciB4ID0geF8gfCAwXG4gICAgICB2YXIgeSA9IHlfIHwgMFxuICAgICAgdmFyIGxldmVsID0gbGV2ZWxfIHwgMFxuXG4gICAgICB2YXIgaW1hZ2VEYXRhID0gYWxsb2NJbWFnZSgpXG4gICAgICBjb3B5RmxhZ3MoaW1hZ2VEYXRhLCB0ZXh0dXJlKVxuICAgICAgaW1hZ2VEYXRhLndpZHRoID0gMFxuICAgICAgaW1hZ2VEYXRhLmhlaWdodCA9IDBcbiAgICAgIHBhcnNlSW1hZ2UoaW1hZ2VEYXRhLCBpbWFnZSlcbiAgICAgIGltYWdlRGF0YS53aWR0aCA9IGltYWdlRGF0YS53aWR0aCB8fCAoKHRleHR1cmUud2lkdGggPj4gbGV2ZWwpIC0geClcbiAgICAgIGltYWdlRGF0YS5oZWlnaHQgPSBpbWFnZURhdGEuaGVpZ2h0IHx8ICgodGV4dHVyZS5oZWlnaHQgPj4gbGV2ZWwpIC0geSlcblxuICAgICAgY2hlY2soXG4gICAgICAgIHRleHR1cmUudHlwZSA9PT0gaW1hZ2VEYXRhLnR5cGUgJiZcbiAgICAgICAgdGV4dHVyZS5mb3JtYXQgPT09IGltYWdlRGF0YS5mb3JtYXQgJiZcbiAgICAgICAgdGV4dHVyZS5pbnRlcm5hbGZvcm1hdCA9PT0gaW1hZ2VEYXRhLmludGVybmFsZm9ybWF0LFxuICAgICAgICAnaW5jb21wYXRpYmxlIGZvcm1hdCBmb3IgdGV4dHVyZS5zdWJpbWFnZScpXG4gICAgICBjaGVjayhcbiAgICAgICAgeCA+PSAwICYmIHkgPj0gMCAmJlxuICAgICAgICB4ICsgaW1hZ2VEYXRhLndpZHRoIDw9IHRleHR1cmUud2lkdGggJiZcbiAgICAgICAgeSArIGltYWdlRGF0YS5oZWlnaHQgPD0gdGV4dHVyZS5oZWlnaHQsXG4gICAgICAgICd0ZXh0dXJlLnN1YmltYWdlIHdyaXRlIG91dCBvZiBib3VuZHMnKVxuICAgICAgY2hlY2soXG4gICAgICAgIHRleHR1cmUubWlwbWFzayAmICgxIDw8IGxldmVsKSxcbiAgICAgICAgJ21pc3NpbmcgbWlwbWFwIGRhdGEnKVxuICAgICAgY2hlY2soXG4gICAgICAgIGltYWdlRGF0YS5kYXRhIHx8IGltYWdlRGF0YS5lbGVtZW50IHx8IGltYWdlRGF0YS5uZWVkc0NvcHksXG4gICAgICAgICdtaXNzaW5nIGltYWdlIGRhdGEnKVxuXG4gICAgICB0ZW1wQmluZCh0ZXh0dXJlKVxuICAgICAgc2V0U3ViSW1hZ2UoaW1hZ2VEYXRhLCBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1ggKyBmYWNlLCB4LCB5LCBsZXZlbClcbiAgICAgIHRlbXBSZXN0b3JlKClcblxuICAgICAgZnJlZUltYWdlKGltYWdlRGF0YSlcblxuICAgICAgcmV0dXJuIHJlZ2xUZXh0dXJlQ3ViZVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlc2l6ZSAocmFkaXVzXykge1xuICAgICAgdmFyIHJhZGl1cyA9IHJhZGl1c18gfCAwXG4gICAgICBpZiAocmFkaXVzID09PSB0ZXh0dXJlLndpZHRoKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuXG4gICAgICByZWdsVGV4dHVyZUN1YmUud2lkdGggPSB0ZXh0dXJlLndpZHRoID0gcmFkaXVzXG4gICAgICByZWdsVGV4dHVyZUN1YmUuaGVpZ2h0ID0gdGV4dHVyZS5oZWlnaHQgPSByYWRpdXNcblxuICAgICAgdGVtcEJpbmQodGV4dHVyZSlcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgIGZvciAodmFyIGogPSAwOyB0ZXh0dXJlLm1pcG1hc2sgPj4gajsgKytqKSB7XG4gICAgICAgICAgZ2wudGV4SW1hZ2UyRChcbiAgICAgICAgICAgIEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCArIGksXG4gICAgICAgICAgICBqLFxuICAgICAgICAgICAgdGV4dHVyZS5mb3JtYXQsXG4gICAgICAgICAgICByYWRpdXMgPj4gaixcbiAgICAgICAgICAgIHJhZGl1cyA+PiBqLFxuICAgICAgICAgICAgMCxcbiAgICAgICAgICAgIHRleHR1cmUuZm9ybWF0LFxuICAgICAgICAgICAgdGV4dHVyZS50eXBlLFxuICAgICAgICAgICAgbnVsbClcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgdGVtcFJlc3RvcmUoKVxuXG4gICAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgICAgdGV4dHVyZS5zdGF0cy5zaXplID0gZ2V0VGV4dHVyZVNpemUoXG4gICAgICAgICAgdGV4dHVyZS5pbnRlcm5hbGZvcm1hdCxcbiAgICAgICAgICB0ZXh0dXJlLnR5cGUsXG4gICAgICAgICAgcmVnbFRleHR1cmVDdWJlLndpZHRoLFxuICAgICAgICAgIHJlZ2xUZXh0dXJlQ3ViZS5oZWlnaHQsXG4gICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgdHJ1ZSlcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJlZ2xUZXh0dXJlQ3ViZVxuICAgIH1cblxuICAgIHJlZ2xUZXh0dXJlQ3ViZShhMCwgYTEsIGEyLCBhMywgYTQsIGE1KVxuXG4gICAgcmVnbFRleHR1cmVDdWJlLnN1YmltYWdlID0gc3ViaW1hZ2VcbiAgICByZWdsVGV4dHVyZUN1YmUucmVzaXplID0gcmVzaXplXG4gICAgcmVnbFRleHR1cmVDdWJlLl9yZWdsVHlwZSA9ICd0ZXh0dXJlQ3ViZSdcbiAgICByZWdsVGV4dHVyZUN1YmUuX3RleHR1cmUgPSB0ZXh0dXJlXG4gICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICByZWdsVGV4dHVyZUN1YmUuc3RhdHMgPSB0ZXh0dXJlLnN0YXRzXG4gICAgfVxuICAgIHJlZ2xUZXh0dXJlQ3ViZS5kZXN0cm95ID0gZnVuY3Rpb24gKCkge1xuICAgICAgdGV4dHVyZS5kZWNSZWYoKVxuICAgIH1cblxuICAgIHJldHVybiByZWdsVGV4dHVyZUN1YmVcbiAgfVxuXG4gIC8vIENhbGxlZCB3aGVuIHJlZ2wgaXMgZGVzdHJveWVkXG4gIGZ1bmN0aW9uIGRlc3Ryb3lUZXh0dXJlcyAoKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBudW1UZXhVbml0czsgKytpKSB7XG4gICAgICBnbC5hY3RpdmVUZXh0dXJlKEdMX1RFWFRVUkUwICsgaSlcbiAgICAgIGdsLmJpbmRUZXh0dXJlKEdMX1RFWFRVUkVfMkQsIG51bGwpXG4gICAgICB0ZXh0dXJlVW5pdHNbaV0gPSBudWxsXG4gICAgfVxuICAgIHZhbHVlcyh0ZXh0dXJlU2V0KS5mb3JFYWNoKGRlc3Ryb3kpXG5cbiAgICBzdGF0cy5jdWJlQ291bnQgPSAwXG4gICAgc3RhdHMudGV4dHVyZUNvdW50ID0gMFxuICB9XG5cbiAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgc3RhdHMuZ2V0VG90YWxUZXh0dXJlU2l6ZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciB0b3RhbCA9IDBcbiAgICAgIE9iamVjdC5rZXlzKHRleHR1cmVTZXQpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgICB0b3RhbCArPSB0ZXh0dXJlU2V0W2tleV0uc3RhdHMuc2l6ZVxuICAgICAgfSlcbiAgICAgIHJldHVybiB0b3RhbFxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHJlc3RvcmVUZXh0dXJlcyAoKSB7XG4gICAgdmFsdWVzKHRleHR1cmVTZXQpLmZvckVhY2goZnVuY3Rpb24gKHRleHR1cmUpIHtcbiAgICAgIHRleHR1cmUudGV4dHVyZSA9IGdsLmNyZWF0ZVRleHR1cmUoKVxuICAgICAgZ2wuYmluZFRleHR1cmUodGV4dHVyZS50YXJnZXQsIHRleHR1cmUudGV4dHVyZSlcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgMzI7ICsraSkge1xuICAgICAgICBpZiAoKHRleHR1cmUubWlwbWFzayAmICgxIDw8IGkpKSA9PT0gMCkge1xuICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRleHR1cmUudGFyZ2V0ID09PSBHTF9URVhUVVJFXzJEKSB7XG4gICAgICAgICAgZ2wudGV4SW1hZ2UyRChHTF9URVhUVVJFXzJELFxuICAgICAgICAgICAgaSxcbiAgICAgICAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQsXG4gICAgICAgICAgICB0ZXh0dXJlLndpZHRoID4+IGksXG4gICAgICAgICAgICB0ZXh0dXJlLmhlaWdodCA+PiBpLFxuICAgICAgICAgICAgMCxcbiAgICAgICAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQsXG4gICAgICAgICAgICB0ZXh0dXJlLnR5cGUsXG4gICAgICAgICAgICBudWxsKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgNjsgKytqKSB7XG4gICAgICAgICAgICBnbC50ZXhJbWFnZTJEKEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCArIGosXG4gICAgICAgICAgICAgIGksXG4gICAgICAgICAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQsXG4gICAgICAgICAgICAgIHRleHR1cmUud2lkdGggPj4gaSxcbiAgICAgICAgICAgICAgdGV4dHVyZS5oZWlnaHQgPj4gaSxcbiAgICAgICAgICAgICAgMCxcbiAgICAgICAgICAgICAgdGV4dHVyZS5pbnRlcm5hbGZvcm1hdCxcbiAgICAgICAgICAgICAgdGV4dHVyZS50eXBlLFxuICAgICAgICAgICAgICBudWxsKVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgc2V0VGV4SW5mbyh0ZXh0dXJlLnRleEluZm8sIHRleHR1cmUudGFyZ2V0KVxuICAgIH0pXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNyZWF0ZTJEOiBjcmVhdGVUZXh0dXJlMkQsXG4gICAgY3JlYXRlQ3ViZTogY3JlYXRlVGV4dHVyZUN1YmUsXG4gICAgY2xlYXI6IGRlc3Ryb3lUZXh0dXJlcyxcbiAgICBnZXRUZXh0dXJlOiBmdW5jdGlvbiAod3JhcHBlcikge1xuICAgICAgcmV0dXJuIG51bGxcbiAgICB9LFxuICAgIHJlc3RvcmU6IHJlc3RvcmVUZXh0dXJlc1xuICB9XG59XG4iLCJ2YXIgR0xfUVVFUllfUkVTVUxUX0VYVCA9IDB4ODg2NlxudmFyIEdMX1FVRVJZX1JFU1VMVF9BVkFJTEFCTEVfRVhUID0gMHg4ODY3XG52YXIgR0xfVElNRV9FTEFQU0VEX0VYVCA9IDB4ODhCRlxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChnbCwgZXh0ZW5zaW9ucykge1xuICB2YXIgZXh0VGltZXIgPSBleHRlbnNpb25zLmV4dF9kaXNqb2ludF90aW1lcl9xdWVyeVxuXG4gIGlmICghZXh0VGltZXIpIHtcbiAgICByZXR1cm4gbnVsbFxuICB9XG5cbiAgLy8gUVVFUlkgUE9PTCBCRUdJTlxuICB2YXIgcXVlcnlQb29sID0gW11cbiAgZnVuY3Rpb24gYWxsb2NRdWVyeSAoKSB7XG4gICAgcmV0dXJuIHF1ZXJ5UG9vbC5wb3AoKSB8fCBleHRUaW1lci5jcmVhdGVRdWVyeUVYVCgpXG4gIH1cbiAgZnVuY3Rpb24gZnJlZVF1ZXJ5IChxdWVyeSkge1xuICAgIHF1ZXJ5UG9vbC5wdXNoKHF1ZXJ5KVxuICB9XG4gIC8vIFFVRVJZIFBPT0wgRU5EXG5cbiAgdmFyIHBlbmRpbmdRdWVyaWVzID0gW11cbiAgZnVuY3Rpb24gYmVnaW5RdWVyeSAoc3RhdHMpIHtcbiAgICB2YXIgcXVlcnkgPSBhbGxvY1F1ZXJ5KClcbiAgICBleHRUaW1lci5iZWdpblF1ZXJ5RVhUKEdMX1RJTUVfRUxBUFNFRF9FWFQsIHF1ZXJ5KVxuICAgIHBlbmRpbmdRdWVyaWVzLnB1c2gocXVlcnkpXG4gICAgcHVzaFNjb3BlU3RhdHMocGVuZGluZ1F1ZXJpZXMubGVuZ3RoIC0gMSwgcGVuZGluZ1F1ZXJpZXMubGVuZ3RoLCBzdGF0cylcbiAgfVxuXG4gIGZ1bmN0aW9uIGVuZFF1ZXJ5ICgpIHtcbiAgICBleHRUaW1lci5lbmRRdWVyeUVYVChHTF9USU1FX0VMQVBTRURfRVhUKVxuICB9XG5cbiAgLy9cbiAgLy8gUGVuZGluZyBzdGF0cyBwb29sLlxuICAvL1xuICBmdW5jdGlvbiBQZW5kaW5nU3RhdHMgKCkge1xuICAgIHRoaXMuc3RhcnRRdWVyeUluZGV4ID0gLTFcbiAgICB0aGlzLmVuZFF1ZXJ5SW5kZXggPSAtMVxuICAgIHRoaXMuc3VtID0gMFxuICAgIHRoaXMuc3RhdHMgPSBudWxsXG4gIH1cbiAgdmFyIHBlbmRpbmdTdGF0c1Bvb2wgPSBbXVxuICBmdW5jdGlvbiBhbGxvY1BlbmRpbmdTdGF0cyAoKSB7XG4gICAgcmV0dXJuIHBlbmRpbmdTdGF0c1Bvb2wucG9wKCkgfHwgbmV3IFBlbmRpbmdTdGF0cygpXG4gIH1cbiAgZnVuY3Rpb24gZnJlZVBlbmRpbmdTdGF0cyAocGVuZGluZ1N0YXRzKSB7XG4gICAgcGVuZGluZ1N0YXRzUG9vbC5wdXNoKHBlbmRpbmdTdGF0cylcbiAgfVxuICAvLyBQZW5kaW5nIHN0YXRzIHBvb2wgZW5kXG5cbiAgdmFyIHBlbmRpbmdTdGF0cyA9IFtdXG4gIGZ1bmN0aW9uIHB1c2hTY29wZVN0YXRzIChzdGFydCwgZW5kLCBzdGF0cykge1xuICAgIHZhciBwcyA9IGFsbG9jUGVuZGluZ1N0YXRzKClcbiAgICBwcy5zdGFydFF1ZXJ5SW5kZXggPSBzdGFydFxuICAgIHBzLmVuZFF1ZXJ5SW5kZXggPSBlbmRcbiAgICBwcy5zdW0gPSAwXG4gICAgcHMuc3RhdHMgPSBzdGF0c1xuICAgIHBlbmRpbmdTdGF0cy5wdXNoKHBzKVxuICB9XG5cbiAgLy8gd2Ugc2hvdWxkIGNhbGwgdGhpcyBhdCB0aGUgYmVnaW5uaW5nIG9mIHRoZSBmcmFtZSxcbiAgLy8gaW4gb3JkZXIgdG8gdXBkYXRlIGdwdVRpbWVcbiAgdmFyIHRpbWVTdW0gPSBbXVxuICB2YXIgcXVlcnlQdHIgPSBbXVxuICBmdW5jdGlvbiB1cGRhdGUgKCkge1xuICAgIHZhciBwdHIsIGlcblxuICAgIHZhciBuID0gcGVuZGluZ1F1ZXJpZXMubGVuZ3RoXG4gICAgaWYgKG4gPT09IDApIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIC8vIFJlc2VydmUgc3BhY2VcbiAgICBxdWVyeVB0ci5sZW5ndGggPSBNYXRoLm1heChxdWVyeVB0ci5sZW5ndGgsIG4gKyAxKVxuICAgIHRpbWVTdW0ubGVuZ3RoID0gTWF0aC5tYXgodGltZVN1bS5sZW5ndGgsIG4gKyAxKVxuICAgIHRpbWVTdW1bMF0gPSAwXG4gICAgcXVlcnlQdHJbMF0gPSAwXG5cbiAgICAvLyBVcGRhdGUgYWxsIHBlbmRpbmcgdGltZXIgcXVlcmllc1xuICAgIHZhciBxdWVyeVRpbWUgPSAwXG4gICAgcHRyID0gMFxuICAgIGZvciAoaSA9IDA7IGkgPCBwZW5kaW5nUXVlcmllcy5sZW5ndGg7ICsraSkge1xuICAgICAgdmFyIHF1ZXJ5ID0gcGVuZGluZ1F1ZXJpZXNbaV1cbiAgICAgIGlmIChleHRUaW1lci5nZXRRdWVyeU9iamVjdEVYVChxdWVyeSwgR0xfUVVFUllfUkVTVUxUX0FWQUlMQUJMRV9FWFQpKSB7XG4gICAgICAgIHF1ZXJ5VGltZSArPSBleHRUaW1lci5nZXRRdWVyeU9iamVjdEVYVChxdWVyeSwgR0xfUVVFUllfUkVTVUxUX0VYVClcbiAgICAgICAgZnJlZVF1ZXJ5KHF1ZXJ5KVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGVuZGluZ1F1ZXJpZXNbcHRyKytdID0gcXVlcnlcbiAgICAgIH1cbiAgICAgIHRpbWVTdW1baSArIDFdID0gcXVlcnlUaW1lXG4gICAgICBxdWVyeVB0cltpICsgMV0gPSBwdHJcbiAgICB9XG4gICAgcGVuZGluZ1F1ZXJpZXMubGVuZ3RoID0gcHRyXG5cbiAgICAvLyBVcGRhdGUgYWxsIHBlbmRpbmcgc3RhdCBxdWVyaWVzXG4gICAgcHRyID0gMFxuICAgIGZvciAoaSA9IDA7IGkgPCBwZW5kaW5nU3RhdHMubGVuZ3RoOyArK2kpIHtcbiAgICAgIHZhciBzdGF0cyA9IHBlbmRpbmdTdGF0c1tpXVxuICAgICAgdmFyIHN0YXJ0ID0gc3RhdHMuc3RhcnRRdWVyeUluZGV4XG4gICAgICB2YXIgZW5kID0gc3RhdHMuZW5kUXVlcnlJbmRleFxuICAgICAgc3RhdHMuc3VtICs9IHRpbWVTdW1bZW5kXSAtIHRpbWVTdW1bc3RhcnRdXG4gICAgICB2YXIgc3RhcnRQdHIgPSBxdWVyeVB0cltzdGFydF1cbiAgICAgIHZhciBlbmRQdHIgPSBxdWVyeVB0cltlbmRdXG4gICAgICBpZiAoZW5kUHRyID09PSBzdGFydFB0cikge1xuICAgICAgICBzdGF0cy5zdGF0cy5ncHVUaW1lICs9IHN0YXRzLnN1bSAvIDFlNlxuICAgICAgICBmcmVlUGVuZGluZ1N0YXRzKHN0YXRzKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc3RhdHMuc3RhcnRRdWVyeUluZGV4ID0gc3RhcnRQdHJcbiAgICAgICAgc3RhdHMuZW5kUXVlcnlJbmRleCA9IGVuZFB0clxuICAgICAgICBwZW5kaW5nU3RhdHNbcHRyKytdID0gc3RhdHNcbiAgICAgIH1cbiAgICB9XG4gICAgcGVuZGluZ1N0YXRzLmxlbmd0aCA9IHB0clxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBiZWdpblF1ZXJ5OiBiZWdpblF1ZXJ5LFxuICAgIGVuZFF1ZXJ5OiBlbmRRdWVyeSxcbiAgICBwdXNoU2NvcGVTdGF0czogcHVzaFNjb3BlU3RhdHMsXG4gICAgdXBkYXRlOiB1cGRhdGUsXG4gICAgZ2V0TnVtUGVuZGluZ1F1ZXJpZXM6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiBwZW5kaW5nUXVlcmllcy5sZW5ndGhcbiAgICB9LFxuICAgIGNsZWFyOiBmdW5jdGlvbiAoKSB7XG4gICAgICBxdWVyeVBvb2wucHVzaC5hcHBseShxdWVyeVBvb2wsIHBlbmRpbmdRdWVyaWVzKVxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBxdWVyeVBvb2wubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgZXh0VGltZXIuZGVsZXRlUXVlcnlFWFQocXVlcnlQb29sW2ldKVxuICAgICAgfVxuICAgICAgcGVuZGluZ1F1ZXJpZXMubGVuZ3RoID0gMFxuICAgICAgcXVlcnlQb29sLmxlbmd0aCA9IDBcbiAgICB9LFxuICAgIHJlc3RvcmU6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHBlbmRpbmdRdWVyaWVzLmxlbmd0aCA9IDBcbiAgICAgIHF1ZXJ5UG9vbC5sZW5ndGggPSAwXG4gICAgfVxuICB9XG59XG4iLCIvLyBFcnJvciBjaGVja2luZyBhbmQgcGFyYW1ldGVyIHZhbGlkYXRpb24uXG4vL1xuLy8gU3RhdGVtZW50cyBmb3IgdGhlIGZvcm0gYGNoZWNrLnNvbWVQcm9jZWR1cmUoLi4uKWAgZ2V0IHJlbW92ZWQgYnlcbi8vIGEgYnJvd3NlcmlmeSB0cmFuc2Zvcm0gZm9yIG9wdGltaXplZC9taW5pZmllZCBidW5kbGVzLlxuLy9cbi8qIGdsb2JhbHMgYnRvYSAqL1xudmFyIGlzVHlwZWRBcnJheSA9IHJlcXVpcmUoJy4vaXMtdHlwZWQtYXJyYXknKVxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vZXh0ZW5kJylcblxuLy8gb25seSB1c2VkIGZvciBleHRyYWN0aW5nIHNoYWRlciBuYW1lcy4gIGlmIGJ0b2Egbm90IHByZXNlbnQsIHRoZW4gZXJyb3JzXG4vLyB3aWxsIGJlIHNsaWdodGx5IGNyYXBwaWVyXG5mdW5jdGlvbiBkZWNvZGVCNjQgKHN0cikge1xuICBpZiAodHlwZW9mIGJ0b2EgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgcmV0dXJuIGJ0b2Eoc3RyKVxuICB9XG4gIHJldHVybiAnYmFzZTY0OicgKyBzdHJcbn1cblxuZnVuY3Rpb24gcmFpc2UgKG1lc3NhZ2UpIHtcbiAgdmFyIGVycm9yID0gbmV3IEVycm9yKCcocmVnbCkgJyArIG1lc3NhZ2UpXG4gIGNvbnNvbGUuZXJyb3IoZXJyb3IpXG4gIHRocm93IGVycm9yXG59XG5cbmZ1bmN0aW9uIGNoZWNrIChwcmVkLCBtZXNzYWdlKSB7XG4gIGlmICghcHJlZCkge1xuICAgIHJhaXNlKG1lc3NhZ2UpXG4gIH1cbn1cblxuZnVuY3Rpb24gZW5jb2xvbiAobWVzc2FnZSkge1xuICBpZiAobWVzc2FnZSkge1xuICAgIHJldHVybiAnOiAnICsgbWVzc2FnZVxuICB9XG4gIHJldHVybiAnJ1xufVxuXG5mdW5jdGlvbiBjaGVja1BhcmFtZXRlciAocGFyYW0sIHBvc3NpYmlsaXRpZXMsIG1lc3NhZ2UpIHtcbiAgaWYgKCEocGFyYW0gaW4gcG9zc2liaWxpdGllcykpIHtcbiAgICByYWlzZSgndW5rbm93biBwYXJhbWV0ZXIgKCcgKyBwYXJhbSArICcpJyArIGVuY29sb24obWVzc2FnZSkgK1xuICAgICAgICAgICcuIHBvc3NpYmxlIHZhbHVlczogJyArIE9iamVjdC5rZXlzKHBvc3NpYmlsaXRpZXMpLmpvaW4oKSlcbiAgfVxufVxuXG5mdW5jdGlvbiBjaGVja0lzVHlwZWRBcnJheSAoZGF0YSwgbWVzc2FnZSkge1xuICBpZiAoIWlzVHlwZWRBcnJheShkYXRhKSkge1xuICAgIHJhaXNlKFxuICAgICAgJ2ludmFsaWQgcGFyYW1ldGVyIHR5cGUnICsgZW5jb2xvbihtZXNzYWdlKSArXG4gICAgICAnLiBtdXN0IGJlIGEgdHlwZWQgYXJyYXknKVxuICB9XG59XG5cbmZ1bmN0aW9uIGNoZWNrVHlwZU9mICh2YWx1ZSwgdHlwZSwgbWVzc2FnZSkge1xuICBpZiAodHlwZW9mIHZhbHVlICE9PSB0eXBlKSB7XG4gICAgcmFpc2UoXG4gICAgICAnaW52YWxpZCBwYXJhbWV0ZXIgdHlwZScgKyBlbmNvbG9uKG1lc3NhZ2UpICtcbiAgICAgICcuIGV4cGVjdGVkICcgKyB0eXBlICsgJywgZ290ICcgKyAodHlwZW9mIHZhbHVlKSlcbiAgfVxufVxuXG5mdW5jdGlvbiBjaGVja05vbk5lZ2F0aXZlSW50ICh2YWx1ZSwgbWVzc2FnZSkge1xuICBpZiAoISgodmFsdWUgPj0gMCkgJiZcbiAgICAgICAgKCh2YWx1ZSB8IDApID09PSB2YWx1ZSkpKSB7XG4gICAgcmFpc2UoJ2ludmFsaWQgcGFyYW1ldGVyIHR5cGUsICgnICsgdmFsdWUgKyAnKScgKyBlbmNvbG9uKG1lc3NhZ2UpICtcbiAgICAgICAgICAnLiBtdXN0IGJlIGEgbm9ubmVnYXRpdmUgaW50ZWdlcicpXG4gIH1cbn1cblxuZnVuY3Rpb24gY2hlY2tPbmVPZiAodmFsdWUsIGxpc3QsIG1lc3NhZ2UpIHtcbiAgaWYgKGxpc3QuaW5kZXhPZih2YWx1ZSkgPCAwKSB7XG4gICAgcmFpc2UoJ2ludmFsaWQgdmFsdWUnICsgZW5jb2xvbihtZXNzYWdlKSArICcuIG11c3QgYmUgb25lIG9mOiAnICsgbGlzdClcbiAgfVxufVxuXG52YXIgY29uc3RydWN0b3JLZXlzID0gW1xuICAnZ2wnLFxuICAnY2FudmFzJyxcbiAgJ2NvbnRhaW5lcicsXG4gICdhdHRyaWJ1dGVzJyxcbiAgJ3BpeGVsUmF0aW8nLFxuICAnZXh0ZW5zaW9ucycsXG4gICdvcHRpb25hbEV4dGVuc2lvbnMnLFxuICAncHJvZmlsZScsXG4gICdvbkRvbmUnXG5dXG5cbmZ1bmN0aW9uIGNoZWNrQ29uc3RydWN0b3IgKG9iaikge1xuICBPYmplY3Qua2V5cyhvYmopLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgIGlmIChjb25zdHJ1Y3RvcktleXMuaW5kZXhPZihrZXkpIDwgMCkge1xuICAgICAgcmFpc2UoJ2ludmFsaWQgcmVnbCBjb25zdHJ1Y3RvciBhcmd1bWVudCBcIicgKyBrZXkgKyAnXCIuIG11c3QgYmUgb25lIG9mICcgKyBjb25zdHJ1Y3RvcktleXMpXG4gICAgfVxuICB9KVxufVxuXG5mdW5jdGlvbiBsZWZ0UGFkIChzdHIsIG4pIHtcbiAgc3RyID0gc3RyICsgJydcbiAgd2hpbGUgKHN0ci5sZW5ndGggPCBuKSB7XG4gICAgc3RyID0gJyAnICsgc3RyXG4gIH1cbiAgcmV0dXJuIHN0clxufVxuXG5mdW5jdGlvbiBTaGFkZXJGaWxlICgpIHtcbiAgdGhpcy5uYW1lID0gJ3Vua25vd24nXG4gIHRoaXMubGluZXMgPSBbXVxuICB0aGlzLmluZGV4ID0ge31cbiAgdGhpcy5oYXNFcnJvcnMgPSBmYWxzZVxufVxuXG5mdW5jdGlvbiBTaGFkZXJMaW5lIChudW1iZXIsIGxpbmUpIHtcbiAgdGhpcy5udW1iZXIgPSBudW1iZXJcbiAgdGhpcy5saW5lID0gbGluZVxuICB0aGlzLmVycm9ycyA9IFtdXG59XG5cbmZ1bmN0aW9uIFNoYWRlckVycm9yIChmaWxlTnVtYmVyLCBsaW5lTnVtYmVyLCBtZXNzYWdlKSB7XG4gIHRoaXMuZmlsZSA9IGZpbGVOdW1iZXJcbiAgdGhpcy5saW5lID0gbGluZU51bWJlclxuICB0aGlzLm1lc3NhZ2UgPSBtZXNzYWdlXG59XG5cbmZ1bmN0aW9uIGd1ZXNzQ29tbWFuZCAoKSB7XG4gIHZhciBlcnJvciA9IG5ldyBFcnJvcigpXG4gIHZhciBzdGFjayA9IChlcnJvci5zdGFjayB8fCBlcnJvcikudG9TdHJpbmcoKVxuICB2YXIgcGF0ID0gL2NvbXBpbGVQcm9jZWR1cmUuKlxcblxccyphdC4qXFwoKC4qKVxcKS8uZXhlYyhzdGFjaylcbiAgaWYgKHBhdCkge1xuICAgIHJldHVybiBwYXRbMV1cbiAgfVxuICB2YXIgcGF0MiA9IC9jb21waWxlUHJvY2VkdXJlLipcXG5cXHMqYXRcXHMrKC4qKShcXG58JCkvLmV4ZWMoc3RhY2spXG4gIGlmIChwYXQyKSB7XG4gICAgcmV0dXJuIHBhdDJbMV1cbiAgfVxuICByZXR1cm4gJ3Vua25vd24nXG59XG5cbmZ1bmN0aW9uIGd1ZXNzQ2FsbFNpdGUgKCkge1xuICB2YXIgZXJyb3IgPSBuZXcgRXJyb3IoKVxuICB2YXIgc3RhY2sgPSAoZXJyb3Iuc3RhY2sgfHwgZXJyb3IpLnRvU3RyaW5nKClcbiAgdmFyIHBhdCA9IC9hdCBSRUdMQ29tbWFuZC4qXFxuXFxzK2F0LipcXCgoLiopXFwpLy5leGVjKHN0YWNrKVxuICBpZiAocGF0KSB7XG4gICAgcmV0dXJuIHBhdFsxXVxuICB9XG4gIHZhciBwYXQyID0gL2F0IFJFR0xDb21tYW5kLipcXG5cXHMrYXRcXHMrKC4qKVxcbi8uZXhlYyhzdGFjaylcbiAgaWYgKHBhdDIpIHtcbiAgICByZXR1cm4gcGF0MlsxXVxuICB9XG4gIHJldHVybiAndW5rbm93bidcbn1cblxuZnVuY3Rpb24gcGFyc2VTb3VyY2UgKHNvdXJjZSwgY29tbWFuZCkge1xuICB2YXIgbGluZXMgPSBzb3VyY2Uuc3BsaXQoJ1xcbicpXG4gIHZhciBsaW5lTnVtYmVyID0gMVxuICB2YXIgZmlsZU51bWJlciA9IDBcbiAgdmFyIGZpbGVzID0ge1xuICAgIHVua25vd246IG5ldyBTaGFkZXJGaWxlKCksXG4gICAgMDogbmV3IFNoYWRlckZpbGUoKVxuICB9XG4gIGZpbGVzLnVua25vd24ubmFtZSA9IGZpbGVzWzBdLm5hbWUgPSBjb21tYW5kIHx8IGd1ZXNzQ29tbWFuZCgpXG4gIGZpbGVzLnVua25vd24ubGluZXMucHVzaChuZXcgU2hhZGVyTGluZSgwLCAnJykpXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGluZXMubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgbGluZSA9IGxpbmVzW2ldXG4gICAgdmFyIHBhcnRzID0gL15cXHMqXFwjXFxzKihcXHcrKVxccysoLispXFxzKiQvLmV4ZWMobGluZSlcbiAgICBpZiAocGFydHMpIHtcbiAgICAgIHN3aXRjaCAocGFydHNbMV0pIHtcbiAgICAgICAgY2FzZSAnbGluZSc6XG4gICAgICAgICAgdmFyIGxpbmVOdW1iZXJJbmZvID0gLyhcXGQrKShcXHMrXFxkKyk/Ly5leGVjKHBhcnRzWzJdKVxuICAgICAgICAgIGlmIChsaW5lTnVtYmVySW5mbykge1xuICAgICAgICAgICAgbGluZU51bWJlciA9IGxpbmVOdW1iZXJJbmZvWzFdIHwgMFxuICAgICAgICAgICAgaWYgKGxpbmVOdW1iZXJJbmZvWzJdKSB7XG4gICAgICAgICAgICAgIGZpbGVOdW1iZXIgPSBsaW5lTnVtYmVySW5mb1syXSB8IDBcbiAgICAgICAgICAgICAgaWYgKCEoZmlsZU51bWJlciBpbiBmaWxlcykpIHtcbiAgICAgICAgICAgICAgICBmaWxlc1tmaWxlTnVtYmVyXSA9IG5ldyBTaGFkZXJGaWxlKClcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlICdkZWZpbmUnOlxuICAgICAgICAgIHZhciBuYW1lSW5mbyA9IC9TSEFERVJfTkFNRShfQjY0KT9cXHMrKC4qKSQvLmV4ZWMocGFydHNbMl0pXG4gICAgICAgICAgaWYgKG5hbWVJbmZvKSB7XG4gICAgICAgICAgICBmaWxlc1tmaWxlTnVtYmVyXS5uYW1lID0gKG5hbWVJbmZvWzFdXG4gICAgICAgICAgICAgICAgPyBkZWNvZGVCNjQobmFtZUluZm9bMl0pXG4gICAgICAgICAgICAgICAgOiBuYW1lSW5mb1syXSlcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWtcbiAgICAgIH1cbiAgICB9XG4gICAgZmlsZXNbZmlsZU51bWJlcl0ubGluZXMucHVzaChuZXcgU2hhZGVyTGluZShsaW5lTnVtYmVyKyssIGxpbmUpKVxuICB9XG4gIE9iamVjdC5rZXlzKGZpbGVzKS5mb3JFYWNoKGZ1bmN0aW9uIChmaWxlTnVtYmVyKSB7XG4gICAgdmFyIGZpbGUgPSBmaWxlc1tmaWxlTnVtYmVyXVxuICAgIGZpbGUubGluZXMuZm9yRWFjaChmdW5jdGlvbiAobGluZSkge1xuICAgICAgZmlsZS5pbmRleFtsaW5lLm51bWJlcl0gPSBsaW5lXG4gICAgfSlcbiAgfSlcbiAgcmV0dXJuIGZpbGVzXG59XG5cbmZ1bmN0aW9uIHBhcnNlRXJyb3JMb2cgKGVyckxvZykge1xuICB2YXIgcmVzdWx0ID0gW11cbiAgZXJyTG9nLnNwbGl0KCdcXG4nKS5mb3JFYWNoKGZ1bmN0aW9uIChlcnJNc2cpIHtcbiAgICBpZiAoZXJyTXNnLmxlbmd0aCA8IDUpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICB2YXIgcGFydHMgPSAvXkVSUk9SXFw6XFxzKyhcXGQrKVxcOihcXGQrKVxcOlxccyooLiopJC8uZXhlYyhlcnJNc2cpXG4gICAgaWYgKHBhcnRzKSB7XG4gICAgICByZXN1bHQucHVzaChuZXcgU2hhZGVyRXJyb3IoXG4gICAgICAgIHBhcnRzWzFdIHwgMCxcbiAgICAgICAgcGFydHNbMl0gfCAwLFxuICAgICAgICBwYXJ0c1szXS50cmltKCkpKVxuICAgIH0gZWxzZSBpZiAoZXJyTXNnLmxlbmd0aCA+IDApIHtcbiAgICAgIHJlc3VsdC5wdXNoKG5ldyBTaGFkZXJFcnJvcigndW5rbm93bicsIDAsIGVyck1zZykpXG4gICAgfVxuICB9KVxuICByZXR1cm4gcmVzdWx0XG59XG5cbmZ1bmN0aW9uIGFubm90YXRlRmlsZXMgKGZpbGVzLCBlcnJvcnMpIHtcbiAgZXJyb3JzLmZvckVhY2goZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgdmFyIGZpbGUgPSBmaWxlc1tlcnJvci5maWxlXVxuICAgIGlmIChmaWxlKSB7XG4gICAgICB2YXIgbGluZSA9IGZpbGUuaW5kZXhbZXJyb3IubGluZV1cbiAgICAgIGlmIChsaW5lKSB7XG4gICAgICAgIGxpbmUuZXJyb3JzLnB1c2goZXJyb3IpXG4gICAgICAgIGZpbGUuaGFzRXJyb3JzID0gdHJ1ZVxuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICB9XG4gICAgZmlsZXMudW5rbm93bi5oYXNFcnJvcnMgPSB0cnVlXG4gICAgZmlsZXMudW5rbm93bi5saW5lc1swXS5lcnJvcnMucHVzaChlcnJvcilcbiAgfSlcbn1cblxuZnVuY3Rpb24gY2hlY2tTaGFkZXJFcnJvciAoZ2wsIHNoYWRlciwgc291cmNlLCB0eXBlLCBjb21tYW5kKSB7XG4gIGlmICghZ2wuZ2V0U2hhZGVyUGFyYW1ldGVyKHNoYWRlciwgZ2wuQ09NUElMRV9TVEFUVVMpKSB7XG4gICAgdmFyIGVyckxvZyA9IGdsLmdldFNoYWRlckluZm9Mb2coc2hhZGVyKVxuICAgIHZhciB0eXBlTmFtZSA9IHR5cGUgPT09IGdsLkZSQUdNRU5UX1NIQURFUiA/ICdmcmFnbWVudCcgOiAndmVydGV4J1xuICAgIGNoZWNrQ29tbWFuZFR5cGUoc291cmNlLCAnc3RyaW5nJywgdHlwZU5hbWUgKyAnIHNoYWRlciBzb3VyY2UgbXVzdCBiZSBhIHN0cmluZycsIGNvbW1hbmQpXG4gICAgdmFyIGZpbGVzID0gcGFyc2VTb3VyY2Uoc291cmNlLCBjb21tYW5kKVxuICAgIHZhciBlcnJvcnMgPSBwYXJzZUVycm9yTG9nKGVyckxvZylcbiAgICBhbm5vdGF0ZUZpbGVzKGZpbGVzLCBlcnJvcnMpXG5cbiAgICBPYmplY3Qua2V5cyhmaWxlcykuZm9yRWFjaChmdW5jdGlvbiAoZmlsZU51bWJlcikge1xuICAgICAgdmFyIGZpbGUgPSBmaWxlc1tmaWxlTnVtYmVyXVxuICAgICAgaWYgKCFmaWxlLmhhc0Vycm9ycykge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgdmFyIHN0cmluZ3MgPSBbJyddXG4gICAgICB2YXIgc3R5bGVzID0gWycnXVxuXG4gICAgICBmdW5jdGlvbiBwdXNoIChzdHIsIHN0eWxlKSB7XG4gICAgICAgIHN0cmluZ3MucHVzaChzdHIpXG4gICAgICAgIHN0eWxlcy5wdXNoKHN0eWxlIHx8ICcnKVxuICAgICAgfVxuXG4gICAgICBwdXNoKCdmaWxlIG51bWJlciAnICsgZmlsZU51bWJlciArICc6ICcgKyBmaWxlLm5hbWUgKyAnXFxuJywgJ2NvbG9yOnJlZDt0ZXh0LWRlY29yYXRpb246dW5kZXJsaW5lO2ZvbnQtd2VpZ2h0OmJvbGQnKVxuXG4gICAgICBmaWxlLmxpbmVzLmZvckVhY2goZnVuY3Rpb24gKGxpbmUpIHtcbiAgICAgICAgaWYgKGxpbmUuZXJyb3JzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBwdXNoKGxlZnRQYWQobGluZS5udW1iZXIsIDQpICsgJ3wgICcsICdiYWNrZ3JvdW5kLWNvbG9yOnllbGxvdzsgZm9udC13ZWlnaHQ6Ym9sZCcpXG4gICAgICAgICAgcHVzaChsaW5lLmxpbmUgKyAnXFxuJywgJ2NvbG9yOnJlZDsgYmFja2dyb3VuZC1jb2xvcjp5ZWxsb3c7IGZvbnQtd2VpZ2h0OmJvbGQnKVxuXG4gICAgICAgICAgLy8gdHJ5IHRvIGd1ZXNzIHRva2VuXG4gICAgICAgICAgdmFyIG9mZnNldCA9IDBcbiAgICAgICAgICBsaW5lLmVycm9ycy5mb3JFYWNoKGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgdmFyIG1lc3NhZ2UgPSBlcnJvci5tZXNzYWdlXG4gICAgICAgICAgICB2YXIgdG9rZW4gPSAvXlxccypcXCcoLiopXFwnXFxzKlxcOlxccyooLiopJC8uZXhlYyhtZXNzYWdlKVxuICAgICAgICAgICAgaWYgKHRva2VuKSB7XG4gICAgICAgICAgICAgIHZhciB0b2tlblBhdCA9IHRva2VuWzFdXG4gICAgICAgICAgICAgIG1lc3NhZ2UgPSB0b2tlblsyXVxuICAgICAgICAgICAgICBzd2l0Y2ggKHRva2VuUGF0KSB7XG4gICAgICAgICAgICAgICAgY2FzZSAnYXNzaWduJzpcbiAgICAgICAgICAgICAgICAgIHRva2VuUGF0ID0gJz0nXG4gICAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIG9mZnNldCA9IE1hdGgubWF4KGxpbmUubGluZS5pbmRleE9mKHRva2VuUGF0LCBvZmZzZXQpLCAwKVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgb2Zmc2V0ID0gMFxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBwdXNoKGxlZnRQYWQoJ3wgJywgNikpXG4gICAgICAgICAgICBwdXNoKGxlZnRQYWQoJ15eXicsIG9mZnNldCArIDMpICsgJ1xcbicsICdmb250LXdlaWdodDpib2xkJylcbiAgICAgICAgICAgIHB1c2gobGVmdFBhZCgnfCAnLCA2KSlcbiAgICAgICAgICAgIHB1c2gobWVzc2FnZSArICdcXG4nLCAnZm9udC13ZWlnaHQ6Ym9sZCcpXG4gICAgICAgICAgfSlcbiAgICAgICAgICBwdXNoKGxlZnRQYWQoJ3wgJywgNikgKyAnXFxuJylcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwdXNoKGxlZnRQYWQobGluZS5udW1iZXIsIDQpICsgJ3wgICcpXG4gICAgICAgICAgcHVzaChsaW5lLmxpbmUgKyAnXFxuJywgJ2NvbG9yOnJlZCcpXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICBpZiAodHlwZW9mIGRvY3VtZW50ICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICBzdHlsZXNbMF0gPSBzdHJpbmdzLmpvaW4oJyVjJylcbiAgICAgICAgY29uc29sZS5sb2cuYXBwbHkoY29uc29sZSwgc3R5bGVzKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5sb2coc3RyaW5ncy5qb2luKCcnKSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgY2hlY2sucmFpc2UoJ0Vycm9yIGNvbXBpbGluZyAnICsgdHlwZU5hbWUgKyAnIHNoYWRlciwgJyArIGZpbGVzWzBdLm5hbWUpXG4gIH1cbn1cblxuZnVuY3Rpb24gY2hlY2tMaW5rRXJyb3IgKGdsLCBwcm9ncmFtLCBmcmFnU2hhZGVyLCB2ZXJ0U2hhZGVyLCBjb21tYW5kKSB7XG4gIGlmICghZ2wuZ2V0UHJvZ3JhbVBhcmFtZXRlcihwcm9ncmFtLCBnbC5MSU5LX1NUQVRVUykpIHtcbiAgICB2YXIgZXJyTG9nID0gZ2wuZ2V0UHJvZ3JhbUluZm9Mb2cocHJvZ3JhbSlcbiAgICB2YXIgZnJhZ1BhcnNlID0gcGFyc2VTb3VyY2UoZnJhZ1NoYWRlciwgY29tbWFuZClcbiAgICB2YXIgdmVydFBhcnNlID0gcGFyc2VTb3VyY2UodmVydFNoYWRlciwgY29tbWFuZClcblxuICAgIHZhciBoZWFkZXIgPSAnRXJyb3IgbGlua2luZyBwcm9ncmFtIHdpdGggdmVydGV4IHNoYWRlciwgXCInICtcbiAgICAgIHZlcnRQYXJzZVswXS5uYW1lICsgJ1wiLCBhbmQgZnJhZ21lbnQgc2hhZGVyIFwiJyArIGZyYWdQYXJzZVswXS5uYW1lICsgJ1wiJ1xuXG4gICAgaWYgKHR5cGVvZiBkb2N1bWVudCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGNvbnNvbGUubG9nKCclYycgKyBoZWFkZXIgKyAnXFxuJWMnICsgZXJyTG9nLFxuICAgICAgICAnY29sb3I6cmVkO3RleHQtZGVjb3JhdGlvbjp1bmRlcmxpbmU7Zm9udC13ZWlnaHQ6Ym9sZCcsXG4gICAgICAgICdjb2xvcjpyZWQnKVxuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZyhoZWFkZXIgKyAnXFxuJyArIGVyckxvZylcbiAgICB9XG4gICAgY2hlY2sucmFpc2UoaGVhZGVyKVxuICB9XG59XG5cbmZ1bmN0aW9uIHNhdmVDb21tYW5kUmVmIChvYmplY3QpIHtcbiAgb2JqZWN0Ll9jb21tYW5kUmVmID0gZ3Vlc3NDb21tYW5kKClcbn1cblxuZnVuY3Rpb24gc2F2ZURyYXdDb21tYW5kSW5mbyAob3B0cywgdW5pZm9ybXMsIGF0dHJpYnV0ZXMsIHN0cmluZ1N0b3JlKSB7XG4gIHNhdmVDb21tYW5kUmVmKG9wdHMpXG5cbiAgZnVuY3Rpb24gaWQgKHN0cikge1xuICAgIGlmIChzdHIpIHtcbiAgICAgIHJldHVybiBzdHJpbmdTdG9yZS5pZChzdHIpXG4gICAgfVxuICAgIHJldHVybiAwXG4gIH1cbiAgb3B0cy5fZnJhZ0lkID0gaWQob3B0cy5zdGF0aWMuZnJhZylcbiAgb3B0cy5fdmVydElkID0gaWQob3B0cy5zdGF0aWMudmVydClcblxuICBmdW5jdGlvbiBhZGRQcm9wcyAoZGljdCwgc2V0KSB7XG4gICAgT2JqZWN0LmtleXMoc2V0KS5mb3JFYWNoKGZ1bmN0aW9uICh1KSB7XG4gICAgICBkaWN0W3N0cmluZ1N0b3JlLmlkKHUpXSA9IHRydWVcbiAgICB9KVxuICB9XG5cbiAgdmFyIHVuaWZvcm1TZXQgPSBvcHRzLl91bmlmb3JtU2V0ID0ge31cbiAgYWRkUHJvcHModW5pZm9ybVNldCwgdW5pZm9ybXMuc3RhdGljKVxuICBhZGRQcm9wcyh1bmlmb3JtU2V0LCB1bmlmb3Jtcy5keW5hbWljKVxuXG4gIHZhciBhdHRyaWJ1dGVTZXQgPSBvcHRzLl9hdHRyaWJ1dGVTZXQgPSB7fVxuICBhZGRQcm9wcyhhdHRyaWJ1dGVTZXQsIGF0dHJpYnV0ZXMuc3RhdGljKVxuICBhZGRQcm9wcyhhdHRyaWJ1dGVTZXQsIGF0dHJpYnV0ZXMuZHluYW1pYylcblxuICBvcHRzLl9oYXNDb3VudCA9IChcbiAgICAnY291bnQnIGluIG9wdHMuc3RhdGljIHx8XG4gICAgJ2NvdW50JyBpbiBvcHRzLmR5bmFtaWMgfHxcbiAgICAnZWxlbWVudHMnIGluIG9wdHMuc3RhdGljIHx8XG4gICAgJ2VsZW1lbnRzJyBpbiBvcHRzLmR5bmFtaWMpXG59XG5cbmZ1bmN0aW9uIGNvbW1hbmRSYWlzZSAobWVzc2FnZSwgY29tbWFuZCkge1xuICB2YXIgY2FsbFNpdGUgPSBndWVzc0NhbGxTaXRlKClcbiAgcmFpc2UobWVzc2FnZSArXG4gICAgJyBpbiBjb21tYW5kICcgKyAoY29tbWFuZCB8fCBndWVzc0NvbW1hbmQoKSkgK1xuICAgIChjYWxsU2l0ZSA9PT0gJ3Vua25vd24nID8gJycgOiAnIGNhbGxlZCBmcm9tICcgKyBjYWxsU2l0ZSkpXG59XG5cbmZ1bmN0aW9uIGNoZWNrQ29tbWFuZCAocHJlZCwgbWVzc2FnZSwgY29tbWFuZCkge1xuICBpZiAoIXByZWQpIHtcbiAgICBjb21tYW5kUmFpc2UobWVzc2FnZSwgY29tbWFuZCB8fCBndWVzc0NvbW1hbmQoKSlcbiAgfVxufVxuXG5mdW5jdGlvbiBjaGVja1BhcmFtZXRlckNvbW1hbmQgKHBhcmFtLCBwb3NzaWJpbGl0aWVzLCBtZXNzYWdlLCBjb21tYW5kKSB7XG4gIGlmICghKHBhcmFtIGluIHBvc3NpYmlsaXRpZXMpKSB7XG4gICAgY29tbWFuZFJhaXNlKFxuICAgICAgJ3Vua25vd24gcGFyYW1ldGVyICgnICsgcGFyYW0gKyAnKScgKyBlbmNvbG9uKG1lc3NhZ2UpICtcbiAgICAgICcuIHBvc3NpYmxlIHZhbHVlczogJyArIE9iamVjdC5rZXlzKHBvc3NpYmlsaXRpZXMpLmpvaW4oKSxcbiAgICAgIGNvbW1hbmQgfHwgZ3Vlc3NDb21tYW5kKCkpXG4gIH1cbn1cblxuZnVuY3Rpb24gY2hlY2tDb21tYW5kVHlwZSAodmFsdWUsIHR5cGUsIG1lc3NhZ2UsIGNvbW1hbmQpIHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gdHlwZSkge1xuICAgIGNvbW1hbmRSYWlzZShcbiAgICAgICdpbnZhbGlkIHBhcmFtZXRlciB0eXBlJyArIGVuY29sb24obWVzc2FnZSkgK1xuICAgICAgJy4gZXhwZWN0ZWQgJyArIHR5cGUgKyAnLCBnb3QgJyArICh0eXBlb2YgdmFsdWUpLFxuICAgICAgY29tbWFuZCB8fCBndWVzc0NvbW1hbmQoKSlcbiAgfVxufVxuXG5mdW5jdGlvbiBjaGVja09wdGlvbmFsIChibG9jaykge1xuICBibG9jaygpXG59XG5cbmZ1bmN0aW9uIGNoZWNrRnJhbWVidWZmZXJGb3JtYXQgKGF0dGFjaG1lbnQsIHRleEZvcm1hdHMsIHJiRm9ybWF0cykge1xuICBpZiAoYXR0YWNobWVudC50ZXh0dXJlKSB7XG4gICAgY2hlY2tPbmVPZihcbiAgICAgIGF0dGFjaG1lbnQudGV4dHVyZS5fdGV4dHVyZS5pbnRlcm5hbGZvcm1hdCxcbiAgICAgIHRleEZvcm1hdHMsXG4gICAgICAndW5zdXBwb3J0ZWQgdGV4dHVyZSBmb3JtYXQgZm9yIGF0dGFjaG1lbnQnKVxuICB9IGVsc2Uge1xuICAgIGNoZWNrT25lT2YoXG4gICAgICBhdHRhY2htZW50LnJlbmRlcmJ1ZmZlci5fcmVuZGVyYnVmZmVyLmZvcm1hdCxcbiAgICAgIHJiRm9ybWF0cyxcbiAgICAgICd1bnN1cHBvcnRlZCByZW5kZXJidWZmZXIgZm9ybWF0IGZvciBhdHRhY2htZW50JylcbiAgfVxufVxuXG52YXIgR0xfQ0xBTVBfVE9fRURHRSA9IDB4ODEyRlxuXG52YXIgR0xfTkVBUkVTVCA9IDB4MjYwMFxudmFyIEdMX05FQVJFU1RfTUlQTUFQX05FQVJFU1QgPSAweDI3MDBcbnZhciBHTF9MSU5FQVJfTUlQTUFQX05FQVJFU1QgPSAweDI3MDFcbnZhciBHTF9ORUFSRVNUX01JUE1BUF9MSU5FQVIgPSAweDI3MDJcbnZhciBHTF9MSU5FQVJfTUlQTUFQX0xJTkVBUiA9IDB4MjcwM1xuXG52YXIgR0xfQllURSA9IDUxMjBcbnZhciBHTF9VTlNJR05FRF9CWVRFID0gNTEyMVxudmFyIEdMX1NIT1JUID0gNTEyMlxudmFyIEdMX1VOU0lHTkVEX1NIT1JUID0gNTEyM1xudmFyIEdMX0lOVCA9IDUxMjRcbnZhciBHTF9VTlNJR05FRF9JTlQgPSA1MTI1XG52YXIgR0xfRkxPQVQgPSA1MTI2XG5cbnZhciBHTF9VTlNJR05FRF9TSE9SVF80XzRfNF80ID0gMHg4MDMzXG52YXIgR0xfVU5TSUdORURfU0hPUlRfNV81XzVfMSA9IDB4ODAzNFxudmFyIEdMX1VOU0lHTkVEX1NIT1JUXzVfNl81ID0gMHg4MzYzXG52YXIgR0xfVU5TSUdORURfSU5UXzI0XzhfV0VCR0wgPSAweDg0RkFcblxudmFyIEdMX0hBTEZfRkxPQVRfT0VTID0gMHg4RDYxXG5cbnZhciBUWVBFX1NJWkUgPSB7fVxuXG5UWVBFX1NJWkVbR0xfQllURV0gPVxuVFlQRV9TSVpFW0dMX1VOU0lHTkVEX0JZVEVdID0gMVxuXG5UWVBFX1NJWkVbR0xfU0hPUlRdID1cblRZUEVfU0laRVtHTF9VTlNJR05FRF9TSE9SVF0gPVxuVFlQRV9TSVpFW0dMX0hBTEZfRkxPQVRfT0VTXSA9XG5UWVBFX1NJWkVbR0xfVU5TSUdORURfU0hPUlRfNV82XzVdID1cblRZUEVfU0laRVtHTF9VTlNJR05FRF9TSE9SVF80XzRfNF80XSA9XG5UWVBFX1NJWkVbR0xfVU5TSUdORURfU0hPUlRfNV81XzVfMV0gPSAyXG5cblRZUEVfU0laRVtHTF9JTlRdID1cblRZUEVfU0laRVtHTF9VTlNJR05FRF9JTlRdID1cblRZUEVfU0laRVtHTF9GTE9BVF0gPVxuVFlQRV9TSVpFW0dMX1VOU0lHTkVEX0lOVF8yNF84X1dFQkdMXSA9IDRcblxuZnVuY3Rpb24gcGl4ZWxTaXplICh0eXBlLCBjaGFubmVscykge1xuICBpZiAodHlwZSA9PT0gR0xfVU5TSUdORURfU0hPUlRfNV81XzVfMSB8fFxuICAgICAgdHlwZSA9PT0gR0xfVU5TSUdORURfU0hPUlRfNF80XzRfNCB8fFxuICAgICAgdHlwZSA9PT0gR0xfVU5TSUdORURfU0hPUlRfNV82XzUpIHtcbiAgICByZXR1cm4gMlxuICB9IGVsc2UgaWYgKHR5cGUgPT09IEdMX1VOU0lHTkVEX0lOVF8yNF84X1dFQkdMKSB7XG4gICAgcmV0dXJuIDRcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gVFlQRV9TSVpFW3R5cGVdICogY2hhbm5lbHNcbiAgfVxufVxuXG5mdW5jdGlvbiBpc1BvdzIgKHYpIHtcbiAgcmV0dXJuICEodiAmICh2IC0gMSkpICYmICghIXYpXG59XG5cbmZ1bmN0aW9uIGNoZWNrVGV4dHVyZTJEIChpbmZvLCBtaXBEYXRhLCBsaW1pdHMpIHtcbiAgdmFyIGlcbiAgdmFyIHcgPSBtaXBEYXRhLndpZHRoXG4gIHZhciBoID0gbWlwRGF0YS5oZWlnaHRcbiAgdmFyIGMgPSBtaXBEYXRhLmNoYW5uZWxzXG5cbiAgLy8gQ2hlY2sgdGV4dHVyZSBzaGFwZVxuICBjaGVjayh3ID4gMCAmJiB3IDw9IGxpbWl0cy5tYXhUZXh0dXJlU2l6ZSAmJlxuICAgICAgICBoID4gMCAmJiBoIDw9IGxpbWl0cy5tYXhUZXh0dXJlU2l6ZSxcbiAgICAgICAgJ2ludmFsaWQgdGV4dHVyZSBzaGFwZScpXG5cbiAgLy8gY2hlY2sgd3JhcCBtb2RlXG4gIGlmIChpbmZvLndyYXBTICE9PSBHTF9DTEFNUF9UT19FREdFIHx8IGluZm8ud3JhcFQgIT09IEdMX0NMQU1QX1RPX0VER0UpIHtcbiAgICBjaGVjayhpc1BvdzIodykgJiYgaXNQb3cyKGgpLFxuICAgICAgJ2luY29tcGF0aWJsZSB3cmFwIG1vZGUgZm9yIHRleHR1cmUsIGJvdGggd2lkdGggYW5kIGhlaWdodCBtdXN0IGJlIHBvd2VyIG9mIDInKVxuICB9XG5cbiAgaWYgKG1pcERhdGEubWlwbWFzayA9PT0gMSkge1xuICAgIGlmICh3ICE9PSAxICYmIGggIT09IDEpIHtcbiAgICAgIGNoZWNrKFxuICAgICAgICBpbmZvLm1pbkZpbHRlciAhPT0gR0xfTkVBUkVTVF9NSVBNQVBfTkVBUkVTVCAmJlxuICAgICAgICBpbmZvLm1pbkZpbHRlciAhPT0gR0xfTkVBUkVTVF9NSVBNQVBfTElORUFSICYmXG4gICAgICAgIGluZm8ubWluRmlsdGVyICE9PSBHTF9MSU5FQVJfTUlQTUFQX05FQVJFU1QgJiZcbiAgICAgICAgaW5mby5taW5GaWx0ZXIgIT09IEdMX0xJTkVBUl9NSVBNQVBfTElORUFSLFxuICAgICAgICAnbWluIGZpbHRlciByZXF1aXJlcyBtaXBtYXAnKVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICAvLyB0ZXh0dXJlIG11c3QgYmUgcG93ZXIgb2YgMlxuICAgIGNoZWNrKGlzUG93Mih3KSAmJiBpc1BvdzIoaCksXG4gICAgICAndGV4dHVyZSBtdXN0IGJlIGEgc3F1YXJlIHBvd2VyIG9mIDIgdG8gc3VwcG9ydCBtaXBtYXBwaW5nJylcbiAgICBjaGVjayhtaXBEYXRhLm1pcG1hc2sgPT09ICh3IDw8IDEpIC0gMSxcbiAgICAgICdtaXNzaW5nIG9yIGluY29tcGxldGUgbWlwbWFwIGRhdGEnKVxuICB9XG5cbiAgaWYgKG1pcERhdGEudHlwZSA9PT0gR0xfRkxPQVQpIHtcbiAgICBpZiAobGltaXRzLmV4dGVuc2lvbnMuaW5kZXhPZignb2VzX3RleHR1cmVfZmxvYXRfbGluZWFyJykgPCAwKSB7XG4gICAgICBjaGVjayhpbmZvLm1pbkZpbHRlciA9PT0gR0xfTkVBUkVTVCAmJiBpbmZvLm1hZ0ZpbHRlciA9PT0gR0xfTkVBUkVTVCxcbiAgICAgICAgJ2ZpbHRlciBub3Qgc3VwcG9ydGVkLCBtdXN0IGVuYWJsZSBvZXNfdGV4dHVyZV9mbG9hdF9saW5lYXInKVxuICAgIH1cbiAgICBjaGVjayghaW5mby5nZW5NaXBtYXBzLFxuICAgICAgJ21pcG1hcCBnZW5lcmF0aW9uIG5vdCBzdXBwb3J0ZWQgd2l0aCBmbG9hdCB0ZXh0dXJlcycpXG4gIH1cblxuICAvLyBjaGVjayBpbWFnZSBjb21wbGV0ZVxuICB2YXIgbWlwaW1hZ2VzID0gbWlwRGF0YS5pbWFnZXNcbiAgZm9yIChpID0gMDsgaSA8IDE2OyArK2kpIHtcbiAgICBpZiAobWlwaW1hZ2VzW2ldKSB7XG4gICAgICB2YXIgbXcgPSB3ID4+IGlcbiAgICAgIHZhciBtaCA9IGggPj4gaVxuICAgICAgY2hlY2sobWlwRGF0YS5taXBtYXNrICYgKDEgPDwgaSksICdtaXNzaW5nIG1pcG1hcCBkYXRhJylcblxuICAgICAgdmFyIGltZyA9IG1pcGltYWdlc1tpXVxuXG4gICAgICBjaGVjayhcbiAgICAgICAgaW1nLndpZHRoID09PSBtdyAmJlxuICAgICAgICBpbWcuaGVpZ2h0ID09PSBtaCxcbiAgICAgICAgJ2ludmFsaWQgc2hhcGUgZm9yIG1pcCBpbWFnZXMnKVxuXG4gICAgICBjaGVjayhcbiAgICAgICAgaW1nLmZvcm1hdCA9PT0gbWlwRGF0YS5mb3JtYXQgJiZcbiAgICAgICAgaW1nLmludGVybmFsZm9ybWF0ID09PSBtaXBEYXRhLmludGVybmFsZm9ybWF0ICYmXG4gICAgICAgIGltZy50eXBlID09PSBtaXBEYXRhLnR5cGUsXG4gICAgICAgICdpbmNvbXBhdGlibGUgdHlwZSBmb3IgbWlwIGltYWdlJylcblxuICAgICAgaWYgKGltZy5jb21wcmVzc2VkKSB7XG4gICAgICAgIC8vIFRPRE86IGNoZWNrIHNpemUgZm9yIGNvbXByZXNzZWQgaW1hZ2VzXG4gICAgICB9IGVsc2UgaWYgKGltZy5kYXRhKSB7XG4gICAgICAgIGNoZWNrKGltZy5kYXRhLmJ5dGVMZW5ndGggPT09IG13ICogbWggKlxuICAgICAgICAgIE1hdGgubWF4KHBpeGVsU2l6ZShpbWcudHlwZSwgYyksIGltZy51bnBhY2tBbGlnbm1lbnQpLFxuICAgICAgICAgICdpbnZhbGlkIGRhdGEgZm9yIGltYWdlLCBidWZmZXIgc2l6ZSBpcyBpbmNvbnNpc3RlbnQgd2l0aCBpbWFnZSBmb3JtYXQnKVxuICAgICAgfSBlbHNlIGlmIChpbWcuZWxlbWVudCkge1xuICAgICAgICAvLyBUT0RPOiBjaGVjayBlbGVtZW50IGNhbiBiZSBsb2FkZWRcbiAgICAgIH0gZWxzZSBpZiAoaW1nLmNvcHkpIHtcbiAgICAgICAgLy8gVE9ETzogY2hlY2sgY29tcGF0aWJsZSBmb3JtYXQgYW5kIHR5cGVcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKCFpbmZvLmdlbk1pcG1hcHMpIHtcbiAgICAgIGNoZWNrKChtaXBEYXRhLm1pcG1hc2sgJiAoMSA8PCBpKSkgPT09IDAsICdleHRyYSBtaXBtYXAgZGF0YScpXG4gICAgfVxuICB9XG5cbiAgaWYgKG1pcERhdGEuY29tcHJlc3NlZCkge1xuICAgIGNoZWNrKCFpbmZvLmdlbk1pcG1hcHMsXG4gICAgICAnbWlwbWFwIGdlbmVyYXRpb24gZm9yIGNvbXByZXNzZWQgaW1hZ2VzIG5vdCBzdXBwb3J0ZWQnKVxuICB9XG59XG5cbmZ1bmN0aW9uIGNoZWNrVGV4dHVyZUN1YmUgKHRleHR1cmUsIGluZm8sIGZhY2VzLCBsaW1pdHMpIHtcbiAgdmFyIHcgPSB0ZXh0dXJlLndpZHRoXG4gIHZhciBoID0gdGV4dHVyZS5oZWlnaHRcbiAgdmFyIGMgPSB0ZXh0dXJlLmNoYW5uZWxzXG5cbiAgLy8gQ2hlY2sgdGV4dHVyZSBzaGFwZVxuICBjaGVjayhcbiAgICB3ID4gMCAmJiB3IDw9IGxpbWl0cy5tYXhUZXh0dXJlU2l6ZSAmJiBoID4gMCAmJiBoIDw9IGxpbWl0cy5tYXhUZXh0dXJlU2l6ZSxcbiAgICAnaW52YWxpZCB0ZXh0dXJlIHNoYXBlJylcbiAgY2hlY2soXG4gICAgdyA9PT0gaCxcbiAgICAnY3ViZSBtYXAgbXVzdCBiZSBzcXVhcmUnKVxuICBjaGVjayhcbiAgICBpbmZvLndyYXBTID09PSBHTF9DTEFNUF9UT19FREdFICYmIGluZm8ud3JhcFQgPT09IEdMX0NMQU1QX1RPX0VER0UsXG4gICAgJ3dyYXAgbW9kZSBub3Qgc3VwcG9ydGVkIGJ5IGN1YmUgbWFwJylcblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGZhY2VzLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIGZhY2UgPSBmYWNlc1tpXVxuICAgIGNoZWNrKFxuICAgICAgZmFjZS53aWR0aCA9PT0gdyAmJiBmYWNlLmhlaWdodCA9PT0gaCxcbiAgICAgICdpbmNvbnNpc3RlbnQgY3ViZSBtYXAgZmFjZSBzaGFwZScpXG5cbiAgICBpZiAoaW5mby5nZW5NaXBtYXBzKSB7XG4gICAgICBjaGVjayghZmFjZS5jb21wcmVzc2VkLFxuICAgICAgICAnY2FuIG5vdCBnZW5lcmF0ZSBtaXBtYXAgZm9yIGNvbXByZXNzZWQgdGV4dHVyZXMnKVxuICAgICAgY2hlY2soZmFjZS5taXBtYXNrID09PSAxLFxuICAgICAgICAnY2FuIG5vdCBzcGVjaWZ5IG1pcG1hcHMgYW5kIGdlbmVyYXRlIG1pcG1hcHMnKVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBUT0RPOiBjaGVjayBtaXAgYW5kIGZpbHRlciBtb2RlXG4gICAgfVxuXG4gICAgdmFyIG1pcG1hcHMgPSBmYWNlLmltYWdlc1xuICAgIGZvciAodmFyIGogPSAwOyBqIDwgMTY7ICsraikge1xuICAgICAgdmFyIGltZyA9IG1pcG1hcHNbal1cbiAgICAgIGlmIChpbWcpIHtcbiAgICAgICAgdmFyIG13ID0gdyA+PiBqXG4gICAgICAgIHZhciBtaCA9IGggPj4galxuICAgICAgICBjaGVjayhmYWNlLm1pcG1hc2sgJiAoMSA8PCBqKSwgJ21pc3NpbmcgbWlwbWFwIGRhdGEnKVxuICAgICAgICBjaGVjayhcbiAgICAgICAgICBpbWcud2lkdGggPT09IG13ICYmXG4gICAgICAgICAgaW1nLmhlaWdodCA9PT0gbWgsXG4gICAgICAgICAgJ2ludmFsaWQgc2hhcGUgZm9yIG1pcCBpbWFnZXMnKVxuICAgICAgICBjaGVjayhcbiAgICAgICAgICBpbWcuZm9ybWF0ID09PSB0ZXh0dXJlLmZvcm1hdCAmJlxuICAgICAgICAgIGltZy5pbnRlcm5hbGZvcm1hdCA9PT0gdGV4dHVyZS5pbnRlcm5hbGZvcm1hdCAmJlxuICAgICAgICAgIGltZy50eXBlID09PSB0ZXh0dXJlLnR5cGUsXG4gICAgICAgICAgJ2luY29tcGF0aWJsZSB0eXBlIGZvciBtaXAgaW1hZ2UnKVxuXG4gICAgICAgIGlmIChpbWcuY29tcHJlc3NlZCkge1xuICAgICAgICAgIC8vIFRPRE86IGNoZWNrIHNpemUgZm9yIGNvbXByZXNzZWQgaW1hZ2VzXG4gICAgICAgIH0gZWxzZSBpZiAoaW1nLmRhdGEpIHtcbiAgICAgICAgICBjaGVjayhpbWcuZGF0YS5ieXRlTGVuZ3RoID09PSBtdyAqIG1oICpcbiAgICAgICAgICAgIE1hdGgubWF4KHBpeGVsU2l6ZShpbWcudHlwZSwgYyksIGltZy51bnBhY2tBbGlnbm1lbnQpLFxuICAgICAgICAgICAgJ2ludmFsaWQgZGF0YSBmb3IgaW1hZ2UsIGJ1ZmZlciBzaXplIGlzIGluY29uc2lzdGVudCB3aXRoIGltYWdlIGZvcm1hdCcpXG4gICAgICAgIH0gZWxzZSBpZiAoaW1nLmVsZW1lbnQpIHtcbiAgICAgICAgICAvLyBUT0RPOiBjaGVjayBlbGVtZW50IGNhbiBiZSBsb2FkZWRcbiAgICAgICAgfSBlbHNlIGlmIChpbWcuY29weSkge1xuICAgICAgICAgIC8vIFRPRE86IGNoZWNrIGNvbXBhdGlibGUgZm9ybWF0IGFuZCB0eXBlXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBleHRlbmQoY2hlY2ssIHtcbiAgb3B0aW9uYWw6IGNoZWNrT3B0aW9uYWwsXG4gIHJhaXNlOiByYWlzZSxcbiAgY29tbWFuZFJhaXNlOiBjb21tYW5kUmFpc2UsXG4gIGNvbW1hbmQ6IGNoZWNrQ29tbWFuZCxcbiAgcGFyYW1ldGVyOiBjaGVja1BhcmFtZXRlcixcbiAgY29tbWFuZFBhcmFtZXRlcjogY2hlY2tQYXJhbWV0ZXJDb21tYW5kLFxuICBjb25zdHJ1Y3RvcjogY2hlY2tDb25zdHJ1Y3RvcixcbiAgdHlwZTogY2hlY2tUeXBlT2YsXG4gIGNvbW1hbmRUeXBlOiBjaGVja0NvbW1hbmRUeXBlLFxuICBpc1R5cGVkQXJyYXk6IGNoZWNrSXNUeXBlZEFycmF5LFxuICBubmk6IGNoZWNrTm9uTmVnYXRpdmVJbnQsXG4gIG9uZU9mOiBjaGVja09uZU9mLFxuICBzaGFkZXJFcnJvcjogY2hlY2tTaGFkZXJFcnJvcixcbiAgbGlua0Vycm9yOiBjaGVja0xpbmtFcnJvcixcbiAgY2FsbFNpdGU6IGd1ZXNzQ2FsbFNpdGUsXG4gIHNhdmVDb21tYW5kUmVmOiBzYXZlQ29tbWFuZFJlZixcbiAgc2F2ZURyYXdJbmZvOiBzYXZlRHJhd0NvbW1hbmRJbmZvLFxuICBmcmFtZWJ1ZmZlckZvcm1hdDogY2hlY2tGcmFtZWJ1ZmZlckZvcm1hdCxcbiAgZ3Vlc3NDb21tYW5kOiBndWVzc0NvbW1hbmQsXG4gIHRleHR1cmUyRDogY2hlY2tUZXh0dXJlMkQsXG4gIHRleHR1cmVDdWJlOiBjaGVja1RleHR1cmVDdWJlXG59KVxuIiwiLyogZ2xvYmFscyBwZXJmb3JtYW5jZSAqL1xubW9kdWxlLmV4cG9ydHMgPVxuICAodHlwZW9mIHBlcmZvcm1hbmNlICE9PSAndW5kZWZpbmVkJyAmJiBwZXJmb3JtYW5jZS5ub3cpXG4gID8gZnVuY3Rpb24gKCkgeyByZXR1cm4gcGVyZm9ybWFuY2Uubm93KCkgfVxuICA6IGZ1bmN0aW9uICgpIHsgcmV0dXJuICsobmV3IERhdGUoKSkgfVxuIiwidmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vZXh0ZW5kJylcblxuZnVuY3Rpb24gc2xpY2UgKHgpIHtcbiAgcmV0dXJuIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKHgpXG59XG5cbmZ1bmN0aW9uIGpvaW4gKHgpIHtcbiAgcmV0dXJuIHNsaWNlKHgpLmpvaW4oJycpXG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY3JlYXRlRW52aXJvbm1lbnQgKCkge1xuICAvLyBVbmlxdWUgdmFyaWFibGUgaWQgY291bnRlclxuICB2YXIgdmFyQ291bnRlciA9IDBcblxuICAvLyBMaW5rZWQgdmFsdWVzIGFyZSBwYXNzZWQgZnJvbSB0aGlzIHNjb3BlIGludG8gdGhlIGdlbmVyYXRlZCBjb2RlIGJsb2NrXG4gIC8vIENhbGxpbmcgbGluaygpIHBhc3NlcyBhIHZhbHVlIGludG8gdGhlIGdlbmVyYXRlZCBzY29wZSBhbmQgcmV0dXJuc1xuICAvLyB0aGUgdmFyaWFibGUgbmFtZSB3aGljaCBpdCBpcyBib3VuZCB0b1xuICB2YXIgbGlua2VkTmFtZXMgPSBbXVxuICB2YXIgbGlua2VkVmFsdWVzID0gW11cbiAgZnVuY3Rpb24gbGluayAodmFsdWUpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxpbmtlZFZhbHVlcy5sZW5ndGg7ICsraSkge1xuICAgICAgaWYgKGxpbmtlZFZhbHVlc1tpXSA9PT0gdmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIGxpbmtlZE5hbWVzW2ldXG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFyIG5hbWUgPSAnZycgKyAodmFyQ291bnRlcisrKVxuICAgIGxpbmtlZE5hbWVzLnB1c2gobmFtZSlcbiAgICBsaW5rZWRWYWx1ZXMucHVzaCh2YWx1ZSlcbiAgICByZXR1cm4gbmFtZVxuICB9XG5cbiAgLy8gY3JlYXRlIGEgY29kZSBibG9ja1xuICBmdW5jdGlvbiBibG9jayAoKSB7XG4gICAgdmFyIGNvZGUgPSBbXVxuICAgIGZ1bmN0aW9uIHB1c2ggKCkge1xuICAgICAgY29kZS5wdXNoLmFwcGx5KGNvZGUsIHNsaWNlKGFyZ3VtZW50cykpXG4gICAgfVxuXG4gICAgdmFyIHZhcnMgPSBbXVxuICAgIGZ1bmN0aW9uIGRlZiAoKSB7XG4gICAgICB2YXIgbmFtZSA9ICd2JyArICh2YXJDb3VudGVyKyspXG4gICAgICB2YXJzLnB1c2gobmFtZSlcblxuICAgICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGNvZGUucHVzaChuYW1lLCAnPScpXG4gICAgICAgIGNvZGUucHVzaC5hcHBseShjb2RlLCBzbGljZShhcmd1bWVudHMpKVxuICAgICAgICBjb2RlLnB1c2goJzsnKVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gbmFtZVxuICAgIH1cblxuICAgIHJldHVybiBleHRlbmQocHVzaCwge1xuICAgICAgZGVmOiBkZWYsXG4gICAgICB0b1N0cmluZzogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gam9pbihbXG4gICAgICAgICAgKHZhcnMubGVuZ3RoID4gMCA/ICd2YXIgJyArIHZhcnMgKyAnOycgOiAnJyksXG4gICAgICAgICAgam9pbihjb2RlKVxuICAgICAgICBdKVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiBzY29wZSAoKSB7XG4gICAgdmFyIGVudHJ5ID0gYmxvY2soKVxuICAgIHZhciBleGl0ID0gYmxvY2soKVxuXG4gICAgdmFyIGVudHJ5VG9TdHJpbmcgPSBlbnRyeS50b1N0cmluZ1xuICAgIHZhciBleGl0VG9TdHJpbmcgPSBleGl0LnRvU3RyaW5nXG5cbiAgICBmdW5jdGlvbiBzYXZlIChvYmplY3QsIHByb3ApIHtcbiAgICAgIGV4aXQob2JqZWN0LCBwcm9wLCAnPScsIGVudHJ5LmRlZihvYmplY3QsIHByb3ApLCAnOycpXG4gICAgfVxuXG4gICAgcmV0dXJuIGV4dGVuZChmdW5jdGlvbiAoKSB7XG4gICAgICBlbnRyeS5hcHBseShlbnRyeSwgc2xpY2UoYXJndW1lbnRzKSlcbiAgICB9LCB7XG4gICAgICBkZWY6IGVudHJ5LmRlZixcbiAgICAgIGVudHJ5OiBlbnRyeSxcbiAgICAgIGV4aXQ6IGV4aXQsXG4gICAgICBzYXZlOiBzYXZlLFxuICAgICAgc2V0OiBmdW5jdGlvbiAob2JqZWN0LCBwcm9wLCB2YWx1ZSkge1xuICAgICAgICBzYXZlKG9iamVjdCwgcHJvcClcbiAgICAgICAgZW50cnkob2JqZWN0LCBwcm9wLCAnPScsIHZhbHVlLCAnOycpXG4gICAgICB9LFxuICAgICAgdG9TdHJpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIGVudHJ5VG9TdHJpbmcoKSArIGV4aXRUb1N0cmluZygpXG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGNvbmRpdGlvbmFsICgpIHtcbiAgICB2YXIgcHJlZCA9IGpvaW4oYXJndW1lbnRzKVxuICAgIHZhciB0aGVuQmxvY2sgPSBzY29wZSgpXG4gICAgdmFyIGVsc2VCbG9jayA9IHNjb3BlKClcblxuICAgIHZhciB0aGVuVG9TdHJpbmcgPSB0aGVuQmxvY2sudG9TdHJpbmdcbiAgICB2YXIgZWxzZVRvU3RyaW5nID0gZWxzZUJsb2NrLnRvU3RyaW5nXG5cbiAgICByZXR1cm4gZXh0ZW5kKHRoZW5CbG9jaywge1xuICAgICAgdGhlbjogZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGVuQmxvY2suYXBwbHkodGhlbkJsb2NrLCBzbGljZShhcmd1bWVudHMpKVxuICAgICAgICByZXR1cm4gdGhpc1xuICAgICAgfSxcbiAgICAgIGVsc2U6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgZWxzZUJsb2NrLmFwcGx5KGVsc2VCbG9jaywgc2xpY2UoYXJndW1lbnRzKSlcbiAgICAgICAgcmV0dXJuIHRoaXNcbiAgICAgIH0sXG4gICAgICB0b1N0cmluZzogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZWxzZUNsYXVzZSA9IGVsc2VUb1N0cmluZygpXG4gICAgICAgIGlmIChlbHNlQ2xhdXNlKSB7XG4gICAgICAgICAgZWxzZUNsYXVzZSA9ICdlbHNleycgKyBlbHNlQ2xhdXNlICsgJ30nXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGpvaW4oW1xuICAgICAgICAgICdpZignLCBwcmVkLCAnKXsnLFxuICAgICAgICAgIHRoZW5Ub1N0cmluZygpLFxuICAgICAgICAgICd9JywgZWxzZUNsYXVzZVxuICAgICAgICBdKVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICAvLyBwcm9jZWR1cmUgbGlzdFxuICB2YXIgZ2xvYmFsQmxvY2sgPSBibG9jaygpXG4gIHZhciBwcm9jZWR1cmVzID0ge31cbiAgZnVuY3Rpb24gcHJvYyAobmFtZSwgY291bnQpIHtcbiAgICB2YXIgYXJncyA9IFtdXG4gICAgZnVuY3Rpb24gYXJnICgpIHtcbiAgICAgIHZhciBuYW1lID0gJ2EnICsgYXJncy5sZW5ndGhcbiAgICAgIGFyZ3MucHVzaChuYW1lKVxuICAgICAgcmV0dXJuIG5hbWVcbiAgICB9XG5cbiAgICBjb3VudCA9IGNvdW50IHx8IDBcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNvdW50OyArK2kpIHtcbiAgICAgIGFyZygpXG4gICAgfVxuXG4gICAgdmFyIGJvZHkgPSBzY29wZSgpXG4gICAgdmFyIGJvZHlUb1N0cmluZyA9IGJvZHkudG9TdHJpbmdcblxuICAgIHZhciByZXN1bHQgPSBwcm9jZWR1cmVzW25hbWVdID0gZXh0ZW5kKGJvZHksIHtcbiAgICAgIGFyZzogYXJnLFxuICAgICAgdG9TdHJpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIGpvaW4oW1xuICAgICAgICAgICdmdW5jdGlvbignLCBhcmdzLmpvaW4oKSwgJyl7JyxcbiAgICAgICAgICBib2R5VG9TdHJpbmcoKSxcbiAgICAgICAgICAnfSdcbiAgICAgICAgXSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG5cbiAgZnVuY3Rpb24gY29tcGlsZSAoKSB7XG4gICAgdmFyIGNvZGUgPSBbJ1widXNlIHN0cmljdFwiOycsXG4gICAgICBnbG9iYWxCbG9jayxcbiAgICAgICdyZXR1cm4geyddXG4gICAgT2JqZWN0LmtleXMocHJvY2VkdXJlcykuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgY29kZS5wdXNoKCdcIicsIG5hbWUsICdcIjonLCBwcm9jZWR1cmVzW25hbWVdLnRvU3RyaW5nKCksICcsJylcbiAgICB9KVxuICAgIGNvZGUucHVzaCgnfScpXG4gICAgdmFyIHNyYyA9IGpvaW4oY29kZSlcbiAgICAgIC5yZXBsYWNlKC87L2csICc7XFxuJylcbiAgICAgIC5yZXBsYWNlKC99L2csICd9XFxuJylcbiAgICAgIC5yZXBsYWNlKC97L2csICd7XFxuJylcbiAgICB2YXIgcHJvYyA9IEZ1bmN0aW9uLmFwcGx5KG51bGwsIGxpbmtlZE5hbWVzLmNvbmNhdChzcmMpKVxuICAgIHJldHVybiBwcm9jLmFwcGx5KG51bGwsIGxpbmtlZFZhbHVlcylcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgZ2xvYmFsOiBnbG9iYWxCbG9jayxcbiAgICBsaW5rOiBsaW5rLFxuICAgIGJsb2NrOiBibG9jayxcbiAgICBwcm9jOiBwcm9jLFxuICAgIHNjb3BlOiBzY29wZSxcbiAgICBjb25kOiBjb25kaXRpb25hbCxcbiAgICBjb21waWxlOiBjb21waWxlXG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGJhc2UsIG9wdHMpIHtcbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhvcHRzKVxuICBmb3IgKHZhciBpID0gMDsgaSA8IGtleXMubGVuZ3RoOyArK2kpIHtcbiAgICBiYXNlW2tleXNbaV1dID0gb3B0c1trZXlzW2ldXVxuICB9XG4gIHJldHVybiBiYXNlXG59XG4iLCJ2YXIgcG9vbCA9IHJlcXVpcmUoJy4vcG9vbCcpXG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBzaGFwZTogYXJyYXlTaGFwZSxcbiAgZmxhdHRlbjogZmxhdHRlbkFycmF5XG59XG5cbmZ1bmN0aW9uIGZsYXR0ZW4xRCAoYXJyYXksIG54LCBvdXQpIHtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBueDsgKytpKSB7XG4gICAgb3V0W2ldID0gYXJyYXlbaV1cbiAgfVxufVxuXG5mdW5jdGlvbiBmbGF0dGVuMkQgKGFycmF5LCBueCwgbnksIG91dCkge1xuICB2YXIgcHRyID0gMFxuICBmb3IgKHZhciBpID0gMDsgaSA8IG54OyArK2kpIHtcbiAgICB2YXIgcm93ID0gYXJyYXlbaV1cbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IG55OyArK2opIHtcbiAgICAgIG91dFtwdHIrK10gPSByb3dbal1cbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gZmxhdHRlbjNEIChhcnJheSwgbngsIG55LCBueiwgb3V0LCBwdHJfKSB7XG4gIHZhciBwdHIgPSBwdHJfXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbng7ICsraSkge1xuICAgIHZhciByb3cgPSBhcnJheVtpXVxuICAgIGZvciAodmFyIGogPSAwOyBqIDwgbnk7ICsraikge1xuICAgICAgdmFyIGNvbCA9IHJvd1tqXVxuICAgICAgZm9yICh2YXIgayA9IDA7IGsgPCBuejsgKytrKSB7XG4gICAgICAgIG91dFtwdHIrK10gPSBjb2xba11cbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gZmxhdHRlblJlYyAoYXJyYXksIHNoYXBlLCBsZXZlbCwgb3V0LCBwdHIpIHtcbiAgdmFyIHN0cmlkZSA9IDFcbiAgZm9yICh2YXIgaSA9IGxldmVsICsgMTsgaSA8IHNoYXBlLmxlbmd0aDsgKytpKSB7XG4gICAgc3RyaWRlICo9IHNoYXBlW2ldXG4gIH1cbiAgdmFyIG4gPSBzaGFwZVtsZXZlbF1cbiAgaWYgKHNoYXBlLmxlbmd0aCAtIGxldmVsID09PSA0KSB7XG4gICAgdmFyIG54ID0gc2hhcGVbbGV2ZWwgKyAxXVxuICAgIHZhciBueSA9IHNoYXBlW2xldmVsICsgMl1cbiAgICB2YXIgbnogPSBzaGFwZVtsZXZlbCArIDNdXG4gICAgZm9yIChpID0gMDsgaSA8IG47ICsraSkge1xuICAgICAgZmxhdHRlbjNEKGFycmF5W2ldLCBueCwgbnksIG56LCBvdXQsIHB0cilcbiAgICAgIHB0ciArPSBzdHJpZGVcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgZm9yIChpID0gMDsgaSA8IG47ICsraSkge1xuICAgICAgZmxhdHRlblJlYyhhcnJheVtpXSwgc2hhcGUsIGxldmVsICsgMSwgb3V0LCBwdHIpXG4gICAgICBwdHIgKz0gc3RyaWRlXG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGZsYXR0ZW5BcnJheSAoYXJyYXksIHNoYXBlLCB0eXBlLCBvdXRfKSB7XG4gIHZhciBzeiA9IDFcbiAgaWYgKHNoYXBlLmxlbmd0aCkge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc2hhcGUubGVuZ3RoOyArK2kpIHtcbiAgICAgIHN6ICo9IHNoYXBlW2ldXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHN6ID0gMFxuICB9XG4gIHZhciBvdXQgPSBvdXRfIHx8IHBvb2wuYWxsb2NUeXBlKHR5cGUsIHN6KVxuICBzd2l0Y2ggKHNoYXBlLmxlbmd0aCkge1xuICAgIGNhc2UgMDpcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAxOlxuICAgICAgZmxhdHRlbjFEKGFycmF5LCBzaGFwZVswXSwgb3V0KVxuICAgICAgYnJlYWtcbiAgICBjYXNlIDI6XG4gICAgICBmbGF0dGVuMkQoYXJyYXksIHNoYXBlWzBdLCBzaGFwZVsxXSwgb3V0KVxuICAgICAgYnJlYWtcbiAgICBjYXNlIDM6XG4gICAgICBmbGF0dGVuM0QoYXJyYXksIHNoYXBlWzBdLCBzaGFwZVsxXSwgc2hhcGVbMl0sIG91dCwgMClcbiAgICAgIGJyZWFrXG4gICAgZGVmYXVsdDpcbiAgICAgIGZsYXR0ZW5SZWMoYXJyYXksIHNoYXBlLCAwLCBvdXQsIDApXG4gIH1cbiAgcmV0dXJuIG91dFxufVxuXG5mdW5jdGlvbiBhcnJheVNoYXBlIChhcnJheV8pIHtcbiAgdmFyIHNoYXBlID0gW11cbiAgZm9yICh2YXIgYXJyYXkgPSBhcnJheV87IGFycmF5Lmxlbmd0aDsgYXJyYXkgPSBhcnJheVswXSkge1xuICAgIHNoYXBlLnB1c2goYXJyYXkubGVuZ3RoKVxuICB9XG4gIHJldHVybiBzaGFwZVxufVxuIiwidmFyIGlzVHlwZWRBcnJheSA9IHJlcXVpcmUoJy4vaXMtdHlwZWQtYXJyYXknKVxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpc0FycmF5TGlrZSAocykge1xuICByZXR1cm4gQXJyYXkuaXNBcnJheShzKSB8fCBpc1R5cGVkQXJyYXkocylcbn1cbiIsInZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL2lzLXR5cGVkLWFycmF5JylcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpc05EQXJyYXlMaWtlIChvYmopIHtcbiAgcmV0dXJuIChcbiAgICAhIW9iaiAmJlxuICAgIHR5cGVvZiBvYmogPT09ICdvYmplY3QnICYmXG4gICAgQXJyYXkuaXNBcnJheShvYmouc2hhcGUpICYmXG4gICAgQXJyYXkuaXNBcnJheShvYmouc3RyaWRlKSAmJlxuICAgIHR5cGVvZiBvYmoub2Zmc2V0ID09PSAnbnVtYmVyJyAmJlxuICAgIG9iai5zaGFwZS5sZW5ndGggPT09IG9iai5zdHJpZGUubGVuZ3RoICYmXG4gICAgKEFycmF5LmlzQXJyYXkob2JqLmRhdGEpIHx8XG4gICAgICBpc1R5cGVkQXJyYXkob2JqLmRhdGEpKSlcbn1cbiIsInZhciBkdHlwZXMgPSByZXF1aXJlKCcuLi9jb25zdGFudHMvYXJyYXl0eXBlcy5qc29uJylcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHgpIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh4KSBpbiBkdHlwZXNcbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gbG9vcCAobiwgZikge1xuICB2YXIgcmVzdWx0ID0gQXJyYXkobilcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBuOyArK2kpIHtcbiAgICByZXN1bHRbaV0gPSBmKGkpXG4gIH1cbiAgcmV0dXJuIHJlc3VsdFxufVxuIiwidmFyIGxvb3AgPSByZXF1aXJlKCcuL2xvb3AnKVxuXG52YXIgR0xfQllURSA9IDUxMjBcbnZhciBHTF9VTlNJR05FRF9CWVRFID0gNTEyMVxudmFyIEdMX1NIT1JUID0gNTEyMlxudmFyIEdMX1VOU0lHTkVEX1NIT1JUID0gNTEyM1xudmFyIEdMX0lOVCA9IDUxMjRcbnZhciBHTF9VTlNJR05FRF9JTlQgPSA1MTI1XG52YXIgR0xfRkxPQVQgPSA1MTI2XG5cbnZhciBidWZmZXJQb29sID0gbG9vcCg4LCBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiBbXVxufSlcblxuZnVuY3Rpb24gbmV4dFBvdzE2ICh2KSB7XG4gIGZvciAodmFyIGkgPSAxNjsgaSA8PSAoMSA8PCAyOCk7IGkgKj0gMTYpIHtcbiAgICBpZiAodiA8PSBpKSB7XG4gICAgICByZXR1cm4gaVxuICAgIH1cbiAgfVxuICByZXR1cm4gMFxufVxuXG5mdW5jdGlvbiBsb2cyICh2KSB7XG4gIHZhciByLCBzaGlmdFxuICByID0gKHYgPiAweEZGRkYpIDw8IDRcbiAgdiA+Pj49IHJcbiAgc2hpZnQgPSAodiA+IDB4RkYpIDw8IDNcbiAgdiA+Pj49IHNoaWZ0OyByIHw9IHNoaWZ0XG4gIHNoaWZ0ID0gKHYgPiAweEYpIDw8IDJcbiAgdiA+Pj49IHNoaWZ0OyByIHw9IHNoaWZ0XG4gIHNoaWZ0ID0gKHYgPiAweDMpIDw8IDFcbiAgdiA+Pj49IHNoaWZ0OyByIHw9IHNoaWZ0XG4gIHJldHVybiByIHwgKHYgPj4gMSlcbn1cblxuZnVuY3Rpb24gYWxsb2MgKG4pIHtcbiAgdmFyIHN6ID0gbmV4dFBvdzE2KG4pXG4gIHZhciBiaW4gPSBidWZmZXJQb29sW2xvZzIoc3opID4+IDJdXG4gIGlmIChiaW4ubGVuZ3RoID4gMCkge1xuICAgIHJldHVybiBiaW4ucG9wKClcbiAgfVxuICByZXR1cm4gbmV3IEFycmF5QnVmZmVyKHN6KVxufVxuXG5mdW5jdGlvbiBmcmVlIChidWYpIHtcbiAgYnVmZmVyUG9vbFtsb2cyKGJ1Zi5ieXRlTGVuZ3RoKSA+PiAyXS5wdXNoKGJ1Zilcbn1cblxuZnVuY3Rpb24gYWxsb2NUeXBlICh0eXBlLCBuKSB7XG4gIHZhciByZXN1bHQgPSBudWxsXG4gIHN3aXRjaCAodHlwZSkge1xuICAgIGNhc2UgR0xfQllURTpcbiAgICAgIHJlc3VsdCA9IG5ldyBJbnQ4QXJyYXkoYWxsb2MobiksIDAsIG4pXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfVU5TSUdORURfQllURTpcbiAgICAgIHJlc3VsdCA9IG5ldyBVaW50OEFycmF5KGFsbG9jKG4pLCAwLCBuKVxuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX1NIT1JUOlxuICAgICAgcmVzdWx0ID0gbmV3IEludDE2QXJyYXkoYWxsb2MoMiAqIG4pLCAwLCBuKVxuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUOlxuICAgICAgcmVzdWx0ID0gbmV3IFVpbnQxNkFycmF5KGFsbG9jKDIgKiBuKSwgMCwgbilcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9JTlQ6XG4gICAgICByZXN1bHQgPSBuZXcgSW50MzJBcnJheShhbGxvYyg0ICogbiksIDAsIG4pXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfVU5TSUdORURfSU5UOlxuICAgICAgcmVzdWx0ID0gbmV3IFVpbnQzMkFycmF5KGFsbG9jKDQgKiBuKSwgMCwgbilcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9GTE9BVDpcbiAgICAgIHJlc3VsdCA9IG5ldyBGbG9hdDMyQXJyYXkoYWxsb2MoNCAqIG4pLCAwLCBuKVxuICAgICAgYnJlYWtcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIG51bGxcbiAgfVxuICBpZiAocmVzdWx0Lmxlbmd0aCAhPT0gbikge1xuICAgIHJldHVybiByZXN1bHQuc3ViYXJyYXkoMCwgbilcbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG5cbmZ1bmN0aW9uIGZyZWVUeXBlIChhcnJheSkge1xuICBmcmVlKGFycmF5LmJ1ZmZlcilcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGFsbG9jOiBhbGxvYyxcbiAgZnJlZTogZnJlZSxcbiAgYWxsb2NUeXBlOiBhbGxvY1R5cGUsXG4gIGZyZWVUeXBlOiBmcmVlVHlwZVxufVxuIiwiLyogZ2xvYmFscyByZXF1ZXN0QW5pbWF0aW9uRnJhbWUsIGNhbmNlbEFuaW1hdGlvbkZyYW1lICovXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgbmV4dDogdHlwZW9mIHJlcXVlc3RBbmltYXRpb25GcmFtZSA9PT0gJ2Z1bmN0aW9uJ1xuICAgID8gZnVuY3Rpb24gKGNiKSB7IHJldHVybiByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoY2IpIH1cbiAgICA6IGZ1bmN0aW9uIChjYikgeyByZXR1cm4gc2V0VGltZW91dChjYiwgMTYpIH0sXG4gIGNhbmNlbDogdHlwZW9mIGNhbmNlbEFuaW1hdGlvbkZyYW1lID09PSAnZnVuY3Rpb24nXG4gICAgPyBmdW5jdGlvbiAocmFmKSB7IHJldHVybiBjYW5jZWxBbmltYXRpb25GcmFtZShyYWYpIH1cbiAgICA6IGNsZWFyVGltZW91dFxufVxuIiwidmFyIHBvb2wgPSByZXF1aXJlKCcuL3Bvb2wnKVxuXG52YXIgRkxPQVQgPSBuZXcgRmxvYXQzMkFycmF5KDEpXG52YXIgSU5UID0gbmV3IFVpbnQzMkFycmF5KEZMT0FULmJ1ZmZlcilcblxudmFyIEdMX1VOU0lHTkVEX1NIT1JUID0gNTEyM1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNvbnZlcnRUb0hhbGZGbG9hdCAoYXJyYXkpIHtcbiAgdmFyIHVzaG9ydHMgPSBwb29sLmFsbG9jVHlwZShHTF9VTlNJR05FRF9TSE9SVCwgYXJyYXkubGVuZ3RoKVxuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgYXJyYXkubGVuZ3RoOyArK2kpIHtcbiAgICBpZiAoaXNOYU4oYXJyYXlbaV0pKSB7XG4gICAgICB1c2hvcnRzW2ldID0gMHhmZmZmXG4gICAgfSBlbHNlIGlmIChhcnJheVtpXSA9PT0gSW5maW5pdHkpIHtcbiAgICAgIHVzaG9ydHNbaV0gPSAweDdjMDBcbiAgICB9IGVsc2UgaWYgKGFycmF5W2ldID09PSAtSW5maW5pdHkpIHtcbiAgICAgIHVzaG9ydHNbaV0gPSAweGZjMDBcbiAgICB9IGVsc2Uge1xuICAgICAgRkxPQVRbMF0gPSBhcnJheVtpXVxuICAgICAgdmFyIHggPSBJTlRbMF1cblxuICAgICAgdmFyIHNnbiA9ICh4ID4+PiAzMSkgPDwgMTVcbiAgICAgIHZhciBleHAgPSAoKHggPDwgMSkgPj4+IDI0KSAtIDEyN1xuICAgICAgdmFyIGZyYWMgPSAoeCA+PiAxMykgJiAoKDEgPDwgMTApIC0gMSlcblxuICAgICAgaWYgKGV4cCA8IC0yNCkge1xuICAgICAgICAvLyByb3VuZCBub24tcmVwcmVzZW50YWJsZSBkZW5vcm1hbHMgdG8gMFxuICAgICAgICB1c2hvcnRzW2ldID0gc2duXG4gICAgICB9IGVsc2UgaWYgKGV4cCA8IC0xNCkge1xuICAgICAgICAvLyBoYW5kbGUgZGVub3JtYWxzXG4gICAgICAgIHZhciBzID0gLTE0IC0gZXhwXG4gICAgICAgIHVzaG9ydHNbaV0gPSBzZ24gKyAoKGZyYWMgKyAoMSA8PCAxMCkpID4+IHMpXG4gICAgICB9IGVsc2UgaWYgKGV4cCA+IDE1KSB7XG4gICAgICAgIC8vIHJvdW5kIG92ZXJmbG93IHRvICsvLSBJbmZpbml0eVxuICAgICAgICB1c2hvcnRzW2ldID0gc2duICsgMHg3YzAwXG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBvdGhlcndpc2UgY29udmVydCBkaXJlY3RseVxuICAgICAgICB1c2hvcnRzW2ldID0gc2duICsgKChleHAgKyAxNSkgPDwgMTApICsgZnJhY1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB1c2hvcnRzXG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChvYmopIHtcbiAgcmV0dXJuIE9iamVjdC5rZXlzKG9iaikubWFwKGZ1bmN0aW9uIChrZXkpIHsgcmV0dXJuIG9ialtrZXldIH0pXG59XG4iLCIvLyBDb250ZXh0IGFuZCBjYW52YXMgY3JlYXRpb24gaGVscGVyIGZ1bmN0aW9uc1xudmFyIGNoZWNrID0gcmVxdWlyZSgnLi91dGlsL2NoZWNrJylcbnZhciBleHRlbmQgPSByZXF1aXJlKCcuL3V0aWwvZXh0ZW5kJylcblxuZnVuY3Rpb24gY3JlYXRlQ2FudmFzIChlbGVtZW50LCBvbkRvbmUsIHBpeGVsUmF0aW8pIHtcbiAgdmFyIGNhbnZhcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpXG4gIGV4dGVuZChjYW52YXMuc3R5bGUsIHtcbiAgICBib3JkZXI6IDAsXG4gICAgbWFyZ2luOiAwLFxuICAgIHBhZGRpbmc6IDAsXG4gICAgdG9wOiAwLFxuICAgIGxlZnQ6IDBcbiAgfSlcbiAgZWxlbWVudC5hcHBlbmRDaGlsZChjYW52YXMpXG5cbiAgaWYgKGVsZW1lbnQgPT09IGRvY3VtZW50LmJvZHkpIHtcbiAgICBjYW52YXMuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnXG4gICAgZXh0ZW5kKGVsZW1lbnQuc3R5bGUsIHtcbiAgICAgIG1hcmdpbjogMCxcbiAgICAgIHBhZGRpbmc6IDBcbiAgICB9KVxuICB9XG5cbiAgZnVuY3Rpb24gcmVzaXplICgpIHtcbiAgICB2YXIgdyA9IHdpbmRvdy5pbm5lcldpZHRoXG4gICAgdmFyIGggPSB3aW5kb3cuaW5uZXJIZWlnaHRcbiAgICBpZiAoZWxlbWVudCAhPT0gZG9jdW1lbnQuYm9keSkge1xuICAgICAgdmFyIGJvdW5kcyA9IGVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KClcbiAgICAgIHcgPSBib3VuZHMucmlnaHQgLSBib3VuZHMubGVmdFxuICAgICAgaCA9IGJvdW5kcy5ib3R0b20gLSBib3VuZHMudG9wXG4gICAgfVxuICAgIGNhbnZhcy53aWR0aCA9IHBpeGVsUmF0aW8gKiB3XG4gICAgY2FudmFzLmhlaWdodCA9IHBpeGVsUmF0aW8gKiBoXG4gICAgZXh0ZW5kKGNhbnZhcy5zdHlsZSwge1xuICAgICAgd2lkdGg6IHcgKyAncHgnLFxuICAgICAgaGVpZ2h0OiBoICsgJ3B4J1xuICAgIH0pXG4gIH1cblxuICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgcmVzaXplLCBmYWxzZSlcblxuICBmdW5jdGlvbiBvbkRlc3Ryb3kgKCkge1xuICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdyZXNpemUnLCByZXNpemUpXG4gICAgZWxlbWVudC5yZW1vdmVDaGlsZChjYW52YXMpXG4gIH1cblxuICByZXNpemUoKVxuXG4gIHJldHVybiB7XG4gICAgY2FudmFzOiBjYW52YXMsXG4gICAgb25EZXN0cm95OiBvbkRlc3Ryb3lcbiAgfVxufVxuXG5mdW5jdGlvbiBjcmVhdGVDb250ZXh0IChjYW52YXMsIGNvbnRleEF0dHJpYnV0ZXMpIHtcbiAgZnVuY3Rpb24gZ2V0IChuYW1lKSB7XG4gICAgdHJ5IHtcbiAgICAgIHJldHVybiBjYW52YXMuZ2V0Q29udGV4dChuYW1lLCBjb250ZXhBdHRyaWJ1dGVzKVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuICB9XG4gIHJldHVybiAoXG4gICAgZ2V0KCd3ZWJnbCcpIHx8XG4gICAgZ2V0KCdleHBlcmltZW50YWwtd2ViZ2wnKSB8fFxuICAgIGdldCgnd2ViZ2wtZXhwZXJpbWVudGFsJylcbiAgKVxufVxuXG5mdW5jdGlvbiBpc0hUTUxFbGVtZW50IChvYmopIHtcbiAgcmV0dXJuIChcbiAgICB0eXBlb2Ygb2JqLm5vZGVOYW1lID09PSAnc3RyaW5nJyAmJlxuICAgIHR5cGVvZiBvYmouYXBwZW5kQ2hpbGQgPT09ICdmdW5jdGlvbicgJiZcbiAgICB0eXBlb2Ygb2JqLmdldEJvdW5kaW5nQ2xpZW50UmVjdCA9PT0gJ2Z1bmN0aW9uJ1xuICApXG59XG5cbmZ1bmN0aW9uIGlzV2ViR0xDb250ZXh0IChvYmopIHtcbiAgcmV0dXJuIChcbiAgICB0eXBlb2Ygb2JqLmRyYXdBcnJheXMgPT09ICdmdW5jdGlvbicgfHxcbiAgICB0eXBlb2Ygb2JqLmRyYXdFbGVtZW50cyA9PT0gJ2Z1bmN0aW9uJ1xuICApXG59XG5cbmZ1bmN0aW9uIHBhcnNlRXh0ZW5zaW9ucyAoaW5wdXQpIHtcbiAgaWYgKHR5cGVvZiBpbnB1dCA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gaW5wdXQuc3BsaXQoKVxuICB9XG4gIGNoZWNrKEFycmF5LmlzQXJyYXkoaW5wdXQpLCAnaW52YWxpZCBleHRlbnNpb24gYXJyYXknKVxuICByZXR1cm4gaW5wdXRcbn1cblxuZnVuY3Rpb24gZ2V0RWxlbWVudCAoZGVzYykge1xuICBpZiAodHlwZW9mIGRlc2MgPT09ICdzdHJpbmcnKSB7XG4gICAgY2hlY2sodHlwZW9mIGRvY3VtZW50ICE9PSAndW5kZWZpbmVkJywgJ25vdCBzdXBwb3J0ZWQgb3V0c2lkZSBvZiBET00nKVxuICAgIHJldHVybiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGRlc2MpXG4gIH1cbiAgcmV0dXJuIGRlc2Ncbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBwYXJzZUFyZ3MgKGFyZ3NfKSB7XG4gIHZhciBhcmdzID0gYXJnc18gfHwge31cbiAgdmFyIGVsZW1lbnQsIGNvbnRhaW5lciwgY2FudmFzLCBnbFxuICB2YXIgY29udGV4dEF0dHJpYnV0ZXMgPSB7fVxuICB2YXIgZXh0ZW5zaW9ucyA9IFtdXG4gIHZhciBvcHRpb25hbEV4dGVuc2lvbnMgPSBbXVxuICB2YXIgcGl4ZWxSYXRpbyA9ICh0eXBlb2Ygd2luZG93ID09PSAndW5kZWZpbmVkJyA/IDEgOiB3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbylcbiAgdmFyIHByb2ZpbGUgPSBmYWxzZVxuICB2YXIgb25Eb25lID0gZnVuY3Rpb24gKGVycikge1xuICAgIGlmIChlcnIpIHtcbiAgICAgIGNoZWNrLnJhaXNlKGVycilcbiAgICB9XG4gIH1cbiAgdmFyIG9uRGVzdHJveSA9IGZ1bmN0aW9uICgpIHt9XG4gIGlmICh0eXBlb2YgYXJncyA9PT0gJ3N0cmluZycpIHtcbiAgICBjaGVjayhcbiAgICAgIHR5cGVvZiBkb2N1bWVudCAhPT0gJ3VuZGVmaW5lZCcsXG4gICAgICAnc2VsZWN0b3IgcXVlcmllcyBvbmx5IHN1cHBvcnRlZCBpbiBET00gZW52aXJvbWVudHMnKVxuICAgIGVsZW1lbnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGFyZ3MpXG4gICAgY2hlY2soZWxlbWVudCwgJ2ludmFsaWQgcXVlcnkgc3RyaW5nIGZvciBlbGVtZW50JylcbiAgfSBlbHNlIGlmICh0eXBlb2YgYXJncyA9PT0gJ29iamVjdCcpIHtcbiAgICBpZiAoaXNIVE1MRWxlbWVudChhcmdzKSkge1xuICAgICAgZWxlbWVudCA9IGFyZ3NcbiAgICB9IGVsc2UgaWYgKGlzV2ViR0xDb250ZXh0KGFyZ3MpKSB7XG4gICAgICBnbCA9IGFyZ3NcbiAgICAgIGNhbnZhcyA9IGdsLmNhbnZhc1xuICAgIH0gZWxzZSB7XG4gICAgICBjaGVjay5jb25zdHJ1Y3RvcihhcmdzKVxuICAgICAgaWYgKCdnbCcgaW4gYXJncykge1xuICAgICAgICBnbCA9IGFyZ3MuZ2xcbiAgICAgIH0gZWxzZSBpZiAoJ2NhbnZhcycgaW4gYXJncykge1xuICAgICAgICBjYW52YXMgPSBnZXRFbGVtZW50KGFyZ3MuY2FudmFzKVxuICAgICAgfSBlbHNlIGlmICgnY29udGFpbmVyJyBpbiBhcmdzKSB7XG4gICAgICAgIGNvbnRhaW5lciA9IGdldEVsZW1lbnQoYXJncy5jb250YWluZXIpXG4gICAgICB9XG4gICAgICBpZiAoJ2F0dHJpYnV0ZXMnIGluIGFyZ3MpIHtcbiAgICAgICAgY29udGV4dEF0dHJpYnV0ZXMgPSBhcmdzLmF0dHJpYnV0ZXNcbiAgICAgICAgY2hlY2sudHlwZShjb250ZXh0QXR0cmlidXRlcywgJ29iamVjdCcsICdpbnZhbGlkIGNvbnRleHQgYXR0cmlidXRlcycpXG4gICAgICB9XG4gICAgICBpZiAoJ2V4dGVuc2lvbnMnIGluIGFyZ3MpIHtcbiAgICAgICAgZXh0ZW5zaW9ucyA9IHBhcnNlRXh0ZW5zaW9ucyhhcmdzLmV4dGVuc2lvbnMpXG4gICAgICB9XG4gICAgICBpZiAoJ29wdGlvbmFsRXh0ZW5zaW9ucycgaW4gYXJncykge1xuICAgICAgICBvcHRpb25hbEV4dGVuc2lvbnMgPSBwYXJzZUV4dGVuc2lvbnMoYXJncy5vcHRpb25hbEV4dGVuc2lvbnMpXG4gICAgICB9XG4gICAgICBpZiAoJ29uRG9uZScgaW4gYXJncykge1xuICAgICAgICBjaGVjay50eXBlKFxuICAgICAgICAgIGFyZ3Mub25Eb25lLCAnZnVuY3Rpb24nLFxuICAgICAgICAgICdpbnZhbGlkIG9yIG1pc3Npbmcgb25Eb25lIGNhbGxiYWNrJylcbiAgICAgICAgb25Eb25lID0gYXJncy5vbkRvbmVcbiAgICAgIH1cbiAgICAgIGlmICgncHJvZmlsZScgaW4gYXJncykge1xuICAgICAgICBwcm9maWxlID0gISFhcmdzLnByb2ZpbGVcbiAgICAgIH1cbiAgICAgIGlmICgncGl4ZWxSYXRpbycgaW4gYXJncykge1xuICAgICAgICBwaXhlbFJhdGlvID0gK2FyZ3MucGl4ZWxSYXRpb1xuICAgICAgICBjaGVjayhwaXhlbFJhdGlvID4gMCwgJ2ludmFsaWQgcGl4ZWwgcmF0aW8nKVxuICAgICAgfVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBjaGVjay5yYWlzZSgnaW52YWxpZCBhcmd1bWVudHMgdG8gcmVnbCcpXG4gIH1cblxuICBpZiAoZWxlbWVudCkge1xuICAgIGlmIChlbGVtZW50Lm5vZGVOYW1lLnRvTG93ZXJDYXNlKCkgPT09ICdjYW52YXMnKSB7XG4gICAgICBjYW52YXMgPSBlbGVtZW50XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnRhaW5lciA9IGVsZW1lbnRcbiAgICB9XG4gIH1cblxuICBpZiAoIWdsKSB7XG4gICAgaWYgKCFjYW52YXMpIHtcbiAgICAgIGNoZWNrKFxuICAgICAgICB0eXBlb2YgZG9jdW1lbnQgIT09ICd1bmRlZmluZWQnLFxuICAgICAgICAnbXVzdCBtYW51YWxseSBzcGVjaWZ5IHdlYmdsIGNvbnRleHQgb3V0c2lkZSBvZiBET00gZW52aXJvbm1lbnRzJylcbiAgICAgIHZhciByZXN1bHQgPSBjcmVhdGVDYW52YXMoY29udGFpbmVyIHx8IGRvY3VtZW50LmJvZHksIG9uRG9uZSwgcGl4ZWxSYXRpbylcbiAgICAgIGlmICghcmVzdWx0KSB7XG4gICAgICAgIHJldHVybiBudWxsXG4gICAgICB9XG4gICAgICBjYW52YXMgPSByZXN1bHQuY2FudmFzXG4gICAgICBvbkRlc3Ryb3kgPSByZXN1bHQub25EZXN0cm95XG4gICAgfVxuICAgIGdsID0gY3JlYXRlQ29udGV4dChjYW52YXMsIGNvbnRleHRBdHRyaWJ1dGVzKVxuICB9XG5cbiAgaWYgKCFnbCkge1xuICAgIG9uRGVzdHJveSgpXG4gICAgb25Eb25lKCd3ZWJnbCBub3Qgc3VwcG9ydGVkLCB0cnkgdXBncmFkaW5nIHlvdXIgYnJvd3NlciBvciBncmFwaGljcyBkcml2ZXJzIGh0dHA6Ly9nZXQud2ViZ2wub3JnJylcbiAgICByZXR1cm4gbnVsbFxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBnbDogZ2wsXG4gICAgY2FudmFzOiBjYW52YXMsXG4gICAgY29udGFpbmVyOiBjb250YWluZXIsXG4gICAgZXh0ZW5zaW9uczogZXh0ZW5zaW9ucyxcbiAgICBvcHRpb25hbEV4dGVuc2lvbnM6IG9wdGlvbmFsRXh0ZW5zaW9ucyxcbiAgICBwaXhlbFJhdGlvOiBwaXhlbFJhdGlvLFxuICAgIHByb2ZpbGU6IHByb2ZpbGUsXG4gICAgb25Eb25lOiBvbkRvbmUsXG4gICAgb25EZXN0cm95OiBvbkRlc3Ryb3lcbiAgfVxufVxuIiwiLy8gQWxsIHZhbHVlcyBhbmQgc3RydWN0dXJlcyByZWZlcmVuY2VkIGZyb206XG4vLyBodHRwOi8vbXNkbi5taWNyb3NvZnQuY29tL2VuLXVzL2xpYnJhcnkvYmI5NDM5OTEuYXNweC9cbi8vXG4vLyBEWDEwIEN1YmVtYXAgc3VwcG9ydCBiYXNlZCBvblxuLy8gaHR0cHM6Ly9naXRodWIuY29tL2RhcmlvbWFuZXNrdS9jbWZ0L2lzc3Vlcy83I2lzc3VlY29tbWVudC02OTUxNjg0NFxuLy8gaHR0cHM6Ly9tc2RuLm1pY3Jvc29mdC5jb20vZW4tdXMvbGlicmFyeS93aW5kb3dzL2Rlc2t0b3AvYmI5NDM5ODModj12cy44NSkuYXNweFxuLy8gaHR0cHM6Ly9naXRodWIuY29tL3BsYXljYW52YXMvZW5naW5lL2Jsb2IvbWFzdGVyL3NyYy9yZXNvdXJjZXMvcmVzb3VyY2VzX3RleHR1cmUuanNcblxudmFyIEREU19NQUdJQyA9IDB4MjA1MzQ0NDRcbnZhciBERFNEX01JUE1BUENPVU5UID0gMHgyMDAwMFxudmFyIEREUEZfRk9VUkNDID0gMHg0XG5cbnZhciBGT1VSQ0NfRFhUMSA9IGZvdXJDQ1RvSW50MzIoJ0RYVDEnKVxudmFyIEZPVVJDQ19EWFQzID0gZm91ckNDVG9JbnQzMignRFhUMycpXG52YXIgRk9VUkNDX0RYVDUgPSBmb3VyQ0NUb0ludDMyKCdEWFQ1JylcbnZhciBGT1VSQ0NfRFgxMCA9IGZvdXJDQ1RvSW50MzIoJ0RYMTAnKVxudmFyIEZPVVJDQ19GUDMyRiA9IDExNiAvLyBEWEdJX0ZPUk1BVF9SMzJHMzJCMzJBMzJfRkxPQVRcblxudmFyIEREU0NBUFMyX0NVQkVNQVAgPSAweDIwMFxudmFyIEQzRDEwX1JFU09VUkNFX0RJTUVOU0lPTl9URVhUVVJFMkQgPSAzXG52YXIgRFhHSV9GT1JNQVRfUjMyRzMyQjMyQTMyX0ZMT0FUID0gMlxuXG4vLyBUaGUgaGVhZGVyIGxlbmd0aCBpbiAzMiBiaXQgaW50c1xudmFyIGhlYWRlckxlbmd0aEludCA9IDMxXG5cbi8vIE9mZnNldHMgaW50byB0aGUgaGVhZGVyIGFycmF5XG52YXIgb2ZmX21hZ2ljID0gMFxudmFyIG9mZl9zaXplID0gMVxudmFyIG9mZl9mbGFncyA9IDJcbnZhciBvZmZfaGVpZ2h0ID0gM1xudmFyIG9mZl93aWR0aCA9IDRcbnZhciBvZmZfbWlwbWFwQ291bnQgPSA3XG52YXIgb2ZmX3BmRmxhZ3MgPSAyMFxudmFyIG9mZl9wZkZvdXJDQyA9IDIxXG52YXIgb2ZmX2NhcHMyID0gMjhcblxubW9kdWxlLmV4cG9ydHMgPSBwYXJzZUhlYWRlcnNcblxuZnVuY3Rpb24gcGFyc2VIZWFkZXJzIChhcnJheUJ1ZmZlcikge1xuICB2YXIgaGVhZGVyID0gbmV3IEludDMyQXJyYXkoYXJyYXlCdWZmZXIsIDAsIGhlYWRlckxlbmd0aEludClcblxuICBpZiAoaGVhZGVyW29mZl9tYWdpY10gIT09IEREU19NQUdJQykge1xuICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBtYWdpYyBudW1iZXIgaW4gRERTIGhlYWRlcicpXG4gIH1cblxuICBpZiAoIWhlYWRlcltvZmZfcGZGbGFnc10gJiBERFBGX0ZPVVJDQykge1xuICAgIHRocm93IG5ldyBFcnJvcignVW5zdXBwb3J0ZWQgZm9ybWF0LCBtdXN0IGNvbnRhaW4gYSBGb3VyQ0MgY29kZScpXG4gIH1cblxuICB2YXIgYmxvY2tCeXRlc1xuICB2YXIgZm9ybWF0XG4gIHZhciBmb3VyQ0MgPSBoZWFkZXJbb2ZmX3BmRm91ckNDXVxuICBzd2l0Y2ggKGZvdXJDQykge1xuICAgIGNhc2UgRk9VUkNDX0RYVDE6XG4gICAgICBibG9ja0J5dGVzID0gOFxuICAgICAgZm9ybWF0ID0gJ2R4dDEnXG4gICAgICBicmVha1xuICAgIGNhc2UgRk9VUkNDX0RYVDM6XG4gICAgICBibG9ja0J5dGVzID0gMTZcbiAgICAgIGZvcm1hdCA9ICdkeHQzJ1xuICAgICAgYnJlYWtcbiAgICBjYXNlIEZPVVJDQ19EWFQ1OlxuICAgICAgYmxvY2tCeXRlcyA9IDE2XG4gICAgICBmb3JtYXQgPSAnZHh0NSdcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBGT1VSQ0NfRlAzMkY6XG4gICAgICBmb3JtYXQgPSAncmdiYTMyZidcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBGT1VSQ0NfRFgxMDpcbiAgICAgIHZhciBkeDEwSGVhZGVyID0gbmV3IFVpbnQzMkFycmF5KGFycmF5QnVmZmVyLnNsaWNlKDEyOCwgMTI4ICsgMjApKVxuICAgICAgZm9ybWF0ID0gZHgxMEhlYWRlclswXVxuICAgICAgdmFyIHJlc291cmNlRGltZW5zaW9uID0gZHgxMEhlYWRlclsxXVxuICAgICAgdmFyIG1pc2NGbGFnID0gZHgxMEhlYWRlclsyXVxuICAgICAgdmFyIGFycmF5U2l6ZSA9IGR4MTBIZWFkZXJbM11cbiAgICAgIHZhciBtaXNjRmxhZ3MyID0gZHgxMEhlYWRlcls0XVxuXG4gICAgICBpZiAocmVzb3VyY2VEaW1lbnNpb24gPT09IEQzRDEwX1JFU09VUkNFX0RJTUVOU0lPTl9URVhUVVJFMkQgJiYgZm9ybWF0ID09PSBEWEdJX0ZPUk1BVF9SMzJHMzJCMzJBMzJfRkxPQVQpIHtcbiAgICAgICAgZm9ybWF0ID0gJ3JnYmEzMmYnXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vuc3VwcG9ydGVkIERYMTAgdGV4dHVyZSBmb3JtYXQgJyArIGZvcm1hdClcbiAgICAgIH1cbiAgICAgIGJyZWFrXG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5zdXBwb3J0ZWQgRm91ckNDIGNvZGU6ICcgKyBpbnQzMlRvRm91ckNDKGZvdXJDQykpXG4gIH1cblxuICB2YXIgZmxhZ3MgPSBoZWFkZXJbb2ZmX2ZsYWdzXVxuICB2YXIgbWlwbWFwQ291bnQgPSAxXG5cbiAgaWYgKGZsYWdzICYgRERTRF9NSVBNQVBDT1VOVCkge1xuICAgIG1pcG1hcENvdW50ID0gTWF0aC5tYXgoMSwgaGVhZGVyW29mZl9taXBtYXBDb3VudF0pXG4gIH1cblxuICB2YXIgY3ViZW1hcCA9IGZhbHNlXG4gIHZhciBjYXBzMiA9IGhlYWRlcltvZmZfY2FwczJdXG4gIGlmIChjYXBzMiAmIEREU0NBUFMyX0NVQkVNQVApIHtcbiAgICBjdWJlbWFwID0gdHJ1ZVxuICB9XG5cbiAgdmFyIHdpZHRoID0gaGVhZGVyW29mZl93aWR0aF1cbiAgdmFyIGhlaWdodCA9IGhlYWRlcltvZmZfaGVpZ2h0XVxuICB2YXIgZGF0YU9mZnNldCA9IGhlYWRlcltvZmZfc2l6ZV0gKyA0XG4gIHZhciB0ZXhXaWR0aCA9IHdpZHRoXG4gIHZhciB0ZXhIZWlnaHQgPSBoZWlnaHRcbiAgdmFyIGltYWdlcyA9IFtdXG4gIHZhciBkYXRhTGVuZ3RoXG5cbiAgaWYgKGZvdXJDQyA9PT0gRk9VUkNDX0RYMTApIHtcbiAgICBkYXRhT2Zmc2V0ICs9IDIwXG4gIH1cblxuICBpZiAoY3ViZW1hcCkge1xuICAgIGZvciAodmFyIGYgPSAwOyBmIDwgNjsgZisrKSB7XG4gICAgICBpZiAoZm9ybWF0ICE9PSAncmdiYTMyZicpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdPbmx5IFJHQkEzMmYgY3ViZW1hcHMgYXJlIHN1cHBvcnRlZCcpXG4gICAgICB9XG4gICAgICB2YXIgYnBwID0gNCAqIDMyIC8gOFxuXG4gICAgICB3aWR0aCA9IHRleFdpZHRoXG4gICAgICBoZWlnaHQgPSB0ZXhIZWlnaHRcblxuICAgICAgLy8gY3ViZW1hcCBzaG91bGQgaGF2ZSBhbGwgbWlwbWFwIGxldmVscyBkZWZpbmVkXG4gICAgICAvLyBNYXRoLmxvZzIod2lkdGgpICsgMVxuICAgICAgdmFyIHJlcXVpcmVkTWlwTGV2ZWxzID0gTWF0aC5sb2cod2lkdGgpIC8gTWF0aC5sb2coMikgKyAxXG5cbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmVxdWlyZWRNaXBMZXZlbHM7IGkrKykge1xuICAgICAgICBkYXRhTGVuZ3RoID0gd2lkdGggKiBoZWlnaHQgKiBicHBcbiAgICAgICAgaW1hZ2VzLnB1c2goe1xuICAgICAgICAgIG9mZnNldDogZGF0YU9mZnNldCxcbiAgICAgICAgICBsZW5ndGg6IGRhdGFMZW5ndGgsXG4gICAgICAgICAgc2hhcGU6IFsgd2lkdGgsIGhlaWdodCBdXG4gICAgICAgIH0pXG4gICAgICAgIC8vIFJldXNlIGRhdGEgZnJvbSB0aGUgcHJldmlvdXMgbGV2ZWwgaWYgd2UgYXJlIGJleW9uZCBtaXBtYXBDb3VudFxuICAgICAgICAvLyBUaGlzIGlzIGhhY2sgZm9yIENNRlQgbm90IHB1Ymxpc2hpbmcgZnVsbCBtaXBtYXAgY2hhaW4gaHR0cHM6Ly9naXRodWIuY29tL2RhcmlvbWFuZXNrdS9jbWZ0L2lzc3Vlcy8xMFxuICAgICAgICBpZiAoaSA8IG1pcG1hcENvdW50KSB7XG4gICAgICAgICAgZGF0YU9mZnNldCArPSBkYXRhTGVuZ3RoXG4gICAgICAgIH1cbiAgICAgICAgd2lkdGggPSBNYXRoLmZsb29yKHdpZHRoIC8gMilcbiAgICAgICAgaGVpZ2h0ID0gTWF0aC5mbG9vcihoZWlnaHQgLyAyKVxuICAgICAgfVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG1pcG1hcENvdW50OyBpKyspIHtcbiAgICAgIGRhdGFMZW5ndGggPSBNYXRoLm1heCg0LCB3aWR0aCkgLyA0ICogTWF0aC5tYXgoNCwgaGVpZ2h0KSAvIDQgKiBibG9ja0J5dGVzXG5cbiAgICAgIGltYWdlcy5wdXNoKHtcbiAgICAgICAgb2Zmc2V0OiBkYXRhT2Zmc2V0LFxuICAgICAgICBsZW5ndGg6IGRhdGFMZW5ndGgsXG4gICAgICAgIHNoYXBlOiBbIHdpZHRoLCBoZWlnaHQgXVxuICAgICAgfSlcbiAgICAgIGRhdGFPZmZzZXQgKz0gZGF0YUxlbmd0aFxuICAgICAgd2lkdGggPSBNYXRoLmZsb29yKHdpZHRoIC8gMilcbiAgICAgIGhlaWdodCA9IE1hdGguZmxvb3IoaGVpZ2h0IC8gMilcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIHNoYXBlOiBbIHRleFdpZHRoLCB0ZXhIZWlnaHQgXSxcbiAgICBpbWFnZXM6IGltYWdlcyxcbiAgICBmb3JtYXQ6IGZvcm1hdCxcbiAgICBmbGFnczogZmxhZ3MsXG4gICAgY3ViZW1hcDogY3ViZW1hcFxuICB9XG59XG5cbmZ1bmN0aW9uIGZvdXJDQ1RvSW50MzIgKHZhbHVlKSB7XG4gIHJldHVybiB2YWx1ZS5jaGFyQ29kZUF0KDApICtcbiAgICAodmFsdWUuY2hhckNvZGVBdCgxKSA8PCA4KSArXG4gICAgKHZhbHVlLmNoYXJDb2RlQXQoMikgPDwgMTYpICtcbiAgICAodmFsdWUuY2hhckNvZGVBdCgzKSA8PCAyNClcbn1cblxuZnVuY3Rpb24gaW50MzJUb0ZvdXJDQyAodmFsdWUpIHtcbiAgcmV0dXJuIFN0cmluZy5mcm9tQ2hhckNvZGUoXG4gICAgdmFsdWUgJiAweGZmLFxuICAgICh2YWx1ZSA+PiA4KSAmIDB4ZmYsXG4gICAgKHZhbHVlID4+IDE2KSAmIDB4ZmYsXG4gICAgKHZhbHVlID4+IDI0KSAmIDB4ZmZcbiAgKVxufVxuIiwiLyogZ2xvYmFsIFhNTEh0dHBSZXF1ZXN0ICovXG52YXIgY29uZmlnUGFyYW1ldGVycyA9IFtcbiAgJ21hbmlmZXN0JyxcbiAgJ29uRG9uZScsXG4gICdvblByb2dyZXNzJyxcbiAgJ29uRXJyb3InXG5dXG5cbnZhciBtYW5pZmVzdFBhcmFtZXRlcnMgPSBbXG4gICd0eXBlJyxcbiAgJ3NyYycsXG4gICdzdHJlYW0nLFxuICAnY3JlZGVudGlhbHMnLFxuICAncGFyc2VyJ1xuXVxuXG52YXIgcGFyc2VyUGFyYW1ldGVycyA9IFtcbiAgJ29uRGF0YScsXG4gICdvbkRvbmUnXG5dXG5cbnZhciBTVEFURV9FUlJPUiA9IC0xXG52YXIgU1RBVEVfREFUQSA9IDBcbnZhciBTVEFURV9DT01QTEVURSA9IDFcblxuZnVuY3Rpb24gcmFpc2UgKG1lc3NhZ2UpIHtcbiAgdGhyb3cgbmV3IEVycm9yKCdyZXNsOiAnICsgbWVzc2FnZSlcbn1cblxuZnVuY3Rpb24gY2hlY2tUeXBlIChvYmplY3QsIHBhcmFtZXRlcnMsIG5hbWUpIHtcbiAgT2JqZWN0LmtleXMob2JqZWN0KS5mb3JFYWNoKGZ1bmN0aW9uIChwYXJhbSkge1xuICAgIGlmIChwYXJhbWV0ZXJzLmluZGV4T2YocGFyYW0pIDwgMCkge1xuICAgICAgcmFpc2UoJ2ludmFsaWQgcGFyYW1ldGVyIFwiJyArIHBhcmFtICsgJ1wiIGluICcgKyBuYW1lKVxuICAgIH1cbiAgfSlcbn1cblxuZnVuY3Rpb24gTG9hZGVyIChuYW1lLCBjYW5jZWwpIHtcbiAgdGhpcy5zdGF0ZSA9IFNUQVRFX0RBVEFcbiAgdGhpcy5yZWFkeSA9IGZhbHNlXG4gIHRoaXMucHJvZ3Jlc3MgPSAwXG4gIHRoaXMubmFtZSA9IG5hbWVcbiAgdGhpcy5jYW5jZWwgPSBjYW5jZWxcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiByZXNsIChjb25maWcpIHtcbiAgaWYgKHR5cGVvZiBjb25maWcgIT09ICdvYmplY3QnIHx8ICFjb25maWcpIHtcbiAgICByYWlzZSgnaW52YWxpZCBvciBtaXNzaW5nIGNvbmZpZ3VyYXRpb24nKVxuICB9XG5cbiAgY2hlY2tUeXBlKGNvbmZpZywgY29uZmlnUGFyYW1ldGVycywgJ2NvbmZpZycpXG5cbiAgdmFyIG1hbmlmZXN0ID0gY29uZmlnLm1hbmlmZXN0XG4gIGlmICh0eXBlb2YgbWFuaWZlc3QgIT09ICdvYmplY3QnIHx8ICFtYW5pZmVzdCkge1xuICAgIHJhaXNlKCdtaXNzaW5nIG1hbmlmZXN0JylcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldEZ1bmN0aW9uIChuYW1lLCBkZmx0KSB7XG4gICAgaWYgKG5hbWUgaW4gY29uZmlnKSB7XG4gICAgICB2YXIgZnVuYyA9IGNvbmZpZ1tuYW1lXVxuICAgICAgaWYgKHR5cGVvZiBmdW5jICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHJhaXNlKCdpbnZhbGlkIGNhbGxiYWNrIFwiJyArIG5hbWUgKyAnXCInKVxuICAgICAgfVxuICAgICAgcmV0dXJuIGZ1bmNcbiAgICB9XG4gICAgcmV0dXJuIG51bGxcbiAgfVxuXG4gIHZhciBvbkRvbmUgPSBnZXRGdW5jdGlvbignb25Eb25lJylcbiAgaWYgKCFvbkRvbmUpIHtcbiAgICByYWlzZSgnbWlzc2luZyBvbkRvbmUoKSBjYWxsYmFjaycpXG4gIH1cblxuICB2YXIgb25Qcm9ncmVzcyA9IGdldEZ1bmN0aW9uKCdvblByb2dyZXNzJylcbiAgdmFyIG9uRXJyb3IgPSBnZXRGdW5jdGlvbignb25FcnJvcicpXG5cbiAgdmFyIGFzc2V0cyA9IHt9XG5cbiAgdmFyIHN0YXRlID0gU1RBVEVfREFUQVxuXG4gIGZ1bmN0aW9uIGxvYWRYSFIgKHJlcXVlc3QpIHtcbiAgICB2YXIgbmFtZSA9IHJlcXVlc3QubmFtZVxuICAgIHZhciBzdHJlYW0gPSByZXF1ZXN0LnN0cmVhbVxuICAgIHZhciBiaW5hcnkgPSByZXF1ZXN0LnR5cGUgPT09ICdiaW5hcnknXG4gICAgdmFyIHBhcnNlciA9IHJlcXVlc3QucGFyc2VyXG5cbiAgICB2YXIgeGhyID0gbmV3IFhNTEh0dHBSZXF1ZXN0KClcbiAgICB2YXIgYXNzZXQgPSBudWxsXG5cbiAgICB2YXIgbG9hZGVyID0gbmV3IExvYWRlcihuYW1lLCBjYW5jZWwpXG5cbiAgICBpZiAoc3RyZWFtKSB7XG4gICAgICB4aHIub25yZWFkeXN0YXRlY2hhbmdlID0gb25SZWFkeVN0YXRlQ2hhbmdlXG4gICAgfSBlbHNlIHtcbiAgICAgIHhoci5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh4aHIucmVhZHlTdGF0ZSA9PT0gNCkge1xuICAgICAgICAgIG9uUmVhZHlTdGF0ZUNoYW5nZSgpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoYmluYXJ5KSB7XG4gICAgICB4aHIucmVzcG9uc2VUeXBlID0gJ2FycmF5YnVmZmVyJ1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIG9uUmVhZHlTdGF0ZUNoYW5nZSAoKSB7XG4gICAgICBpZiAoeGhyLnJlYWR5U3RhdGUgPCAyIHx8XG4gICAgICAgICAgbG9hZGVyLnN0YXRlID09PSBTVEFURV9DT01QTEVURSB8fFxuICAgICAgICAgIGxvYWRlci5zdGF0ZSA9PT0gU1RBVEVfRVJST1IpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICBpZiAoeGhyLnN0YXR1cyAhPT0gMjAwKSB7XG4gICAgICAgIHJldHVybiBhYm9ydCgnZXJyb3IgbG9hZGluZyByZXNvdXJjZSBcIicgKyByZXF1ZXN0Lm5hbWUgKyAnXCInKVxuICAgICAgfVxuICAgICAgaWYgKHhoci5yZWFkeVN0YXRlID4gMiAmJiBsb2FkZXIuc3RhdGUgPT09IFNUQVRFX0RBVEEpIHtcbiAgICAgICAgdmFyIHJlc3BvbnNlXG4gICAgICAgIGlmIChyZXF1ZXN0LnR5cGUgPT09ICdiaW5hcnknKSB7XG4gICAgICAgICAgcmVzcG9uc2UgPSB4aHIucmVzcG9uc2VcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXNwb25zZSA9IHhoci5yZXNwb25zZVRleHRcbiAgICAgICAgfVxuICAgICAgICBpZiAocGFyc2VyLmRhdGEpIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXNzZXQgPSBwYXJzZXIuZGF0YShyZXNwb25zZSlcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICByZXR1cm4gYWJvcnQoZSlcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYXNzZXQgPSByZXNwb25zZVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoeGhyLnJlYWR5U3RhdGUgPiAzICYmIGxvYWRlci5zdGF0ZSA9PT0gU1RBVEVfREFUQSkge1xuICAgICAgICBpZiAocGFyc2VyLmRvbmUpIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXNzZXQgPSBwYXJzZXIuZG9uZSgpXG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgcmV0dXJuIGFib3J0KGUpXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGxvYWRlci5zdGF0ZSA9IFNUQVRFX0NPTVBMRVRFXG4gICAgICB9XG4gICAgICBhc3NldHNbbmFtZV0gPSBhc3NldFxuICAgICAgbG9hZGVyLnByb2dyZXNzID0gMC43NSAqIGxvYWRlci5wcm9ncmVzcyArIDAuMjVcbiAgICAgIGxvYWRlci5yZWFkeSA9XG4gICAgICAgIChyZXF1ZXN0LnN0cmVhbSAmJiAhIWFzc2V0KSB8fFxuICAgICAgICBsb2FkZXIuc3RhdGUgPT09IFNUQVRFX0NPTVBMRVRFXG4gICAgICBub3RpZnlQcm9ncmVzcygpXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY2FuY2VsICgpIHtcbiAgICAgIGlmIChsb2FkZXIuc3RhdGUgPT09IFNUQVRFX0NPTVBMRVRFIHx8IGxvYWRlci5zdGF0ZSA9PT0gU1RBVEVfRVJST1IpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICB4aHIub25yZWFkeXN0YXRlY2hhbmdlID0gbnVsbFxuICAgICAgeGhyLmFib3J0KClcbiAgICAgIGxvYWRlci5zdGF0ZSA9IFNUQVRFX0VSUk9SXG4gICAgfVxuXG4gICAgLy8gc2V0IHVwIHJlcXVlc3RcbiAgICBpZiAocmVxdWVzdC5jcmVkZW50aWFscykge1xuICAgICAgeGhyLndpdGhDcmVkZW50aWFscyA9IHRydWVcbiAgICB9XG4gICAgeGhyLm9wZW4oJ0dFVCcsIHJlcXVlc3Quc3JjLCB0cnVlKVxuICAgIHhoci5zZW5kKClcblxuICAgIHJldHVybiBsb2FkZXJcbiAgfVxuXG4gIGZ1bmN0aW9uIGxvYWRFbGVtZW50IChyZXF1ZXN0LCBlbGVtZW50KSB7XG4gICAgdmFyIG5hbWUgPSByZXF1ZXN0Lm5hbWVcbiAgICB2YXIgcGFyc2VyID0gcmVxdWVzdC5wYXJzZXJcblxuICAgIHZhciBsb2FkZXIgPSBuZXcgTG9hZGVyKG5hbWUsIGNhbmNlbClcbiAgICB2YXIgYXNzZXQgPSBlbGVtZW50XG5cbiAgICBmdW5jdGlvbiBoYW5kbGVQcm9ncmVzcyAoKSB7XG4gICAgICBpZiAobG9hZGVyLnN0YXRlID09PSBTVEFURV9EQVRBKSB7XG4gICAgICAgIGlmIChwYXJzZXIuZGF0YSkge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhc3NldCA9IHBhcnNlci5kYXRhKGVsZW1lbnQpXG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgcmV0dXJuIGFib3J0KGUpXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGFzc2V0ID0gZWxlbWVudFxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gb25Qcm9ncmVzcyAoZSkge1xuICAgICAgaGFuZGxlUHJvZ3Jlc3MoKVxuICAgICAgYXNzZXRzW25hbWVdID0gYXNzZXRcbiAgICAgIGlmIChlLmxlbmd0aENvbXB1dGFibGUpIHtcbiAgICAgICAgbG9hZGVyLnByb2dyZXNzID0gTWF0aC5tYXgobG9hZGVyLnByb2dyZXNzLCBlLmxvYWRlZCAvIGUudG90YWwpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsb2FkZXIucHJvZ3Jlc3MgPSAwLjc1ICogbG9hZGVyLnByb2dyZXNzICsgMC4yNVxuICAgICAgfVxuICAgICAgbm90aWZ5UHJvZ3Jlc3MobmFtZSlcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBvbkNvbXBsZXRlICgpIHtcbiAgICAgIGhhbmRsZVByb2dyZXNzKClcbiAgICAgIGlmIChsb2FkZXIuc3RhdGUgPT09IFNUQVRFX0RBVEEpIHtcbiAgICAgICAgaWYgKHBhcnNlci5kb25lKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGFzc2V0ID0gcGFyc2VyLmRvbmUoKVxuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIHJldHVybiBhYm9ydChlKVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBsb2FkZXIuc3RhdGUgPSBTVEFURV9DT01QTEVURVxuICAgICAgfVxuICAgICAgbG9hZGVyLnByb2dyZXNzID0gMVxuICAgICAgbG9hZGVyLnJlYWR5ID0gdHJ1ZVxuICAgICAgYXNzZXRzW25hbWVdID0gYXNzZXRcbiAgICAgIHJlbW92ZUxpc3RlbmVycygpXG4gICAgICBub3RpZnlQcm9ncmVzcygnZmluaXNoICcgKyBuYW1lKVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIG9uRXJyb3IgKCkge1xuICAgICAgYWJvcnQoJ2Vycm9yIGxvYWRpbmcgYXNzZXQgXCInICsgbmFtZSArICdcIicpXG4gICAgfVxuXG4gICAgaWYgKHJlcXVlc3Quc3RyZWFtKSB7XG4gICAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ3Byb2dyZXNzJywgb25Qcm9ncmVzcylcbiAgICB9XG4gICAgaWYgKHJlcXVlc3QudHlwZSA9PT0gJ2ltYWdlJykge1xuICAgICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdsb2FkJywgb25Db21wbGV0ZSlcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGNhblBsYXkgPSBmYWxzZVxuICAgICAgdmFyIGxvYWRlZE1ldGFEYXRhID0gZmFsc2VcbiAgICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbG9hZGVkbWV0YWRhdGEnLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGxvYWRlZE1ldGFEYXRhID0gdHJ1ZVxuICAgICAgICBpZiAoY2FuUGxheSkge1xuICAgICAgICAgIG9uQ29tcGxldGUoKVxuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdjYW5wbGF5JywgZnVuY3Rpb24gKCkge1xuICAgICAgICBjYW5QbGF5ID0gdHJ1ZVxuICAgICAgICBpZiAobG9hZGVkTWV0YURhdGEpIHtcbiAgICAgICAgICBvbkNvbXBsZXRlKClcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICB9XG4gICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdlcnJvcicsIG9uRXJyb3IpXG5cbiAgICBmdW5jdGlvbiByZW1vdmVMaXN0ZW5lcnMgKCkge1xuICAgICAgaWYgKHJlcXVlc3Quc3RyZWFtKSB7XG4gICAgICAgIGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcigncHJvZ3Jlc3MnLCBvblByb2dyZXNzKVxuICAgICAgfVxuICAgICAgaWYgKHJlcXVlc3QudHlwZSA9PT0gJ2ltYWdlJykge1xuICAgICAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2xvYWQnLCBvbkNvbXBsZXRlKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdjYW5wbGF5Jywgb25Db21wbGV0ZSlcbiAgICAgIH1cbiAgICAgIGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignZXJyb3InLCBvbkVycm9yKVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNhbmNlbCAoKSB7XG4gICAgICBpZiAobG9hZGVyLnN0YXRlID09PSBTVEFURV9DT01QTEVURSB8fCBsb2FkZXIuc3RhdGUgPT09IFNUQVRFX0VSUk9SKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgbG9hZGVyLnN0YXRlID0gU1RBVEVfRVJST1JcbiAgICAgIHJlbW92ZUxpc3RlbmVycygpXG4gICAgICBlbGVtZW50LnNyYyA9ICcnXG4gICAgfVxuXG4gICAgLy8gc2V0IHVwIHJlcXVlc3RcbiAgICBpZiAocmVxdWVzdC5jcmVkZW50aWFscykge1xuICAgICAgZWxlbWVudC5jcm9zc09yaWdpbiA9ICd1c2UtY3JlZGVudGlhbHMnXG4gICAgfSBlbHNlIHtcbiAgICAgIGVsZW1lbnQuY3Jvc3NPcmlnaW4gPSAnYW5vbnltb3VzJ1xuICAgIH1cbiAgICBlbGVtZW50LnNyYyA9IHJlcXVlc3Quc3JjXG5cbiAgICByZXR1cm4gbG9hZGVyXG4gIH1cblxuICB2YXIgbG9hZGVycyA9IHtcbiAgICB0ZXh0OiBsb2FkWEhSLFxuICAgIGJpbmFyeTogZnVuY3Rpb24gKHJlcXVlc3QpIHtcbiAgICAgIC8vIFRPRE8gdXNlIGZldGNoIEFQSSBmb3Igc3RyZWFtaW5nIGlmIHN1cHBvcnRlZFxuICAgICAgcmV0dXJuIGxvYWRYSFIocmVxdWVzdClcbiAgICB9LFxuICAgIGltYWdlOiBmdW5jdGlvbiAocmVxdWVzdCkge1xuICAgICAgcmV0dXJuIGxvYWRFbGVtZW50KHJlcXVlc3QsIGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2ltZycpKVxuICAgIH0sXG4gICAgdmlkZW86IGZ1bmN0aW9uIChyZXF1ZXN0KSB7XG4gICAgICByZXR1cm4gbG9hZEVsZW1lbnQocmVxdWVzdCwgZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndmlkZW8nKSlcbiAgICB9LFxuICAgIGF1ZGlvOiBmdW5jdGlvbiAocmVxdWVzdCkge1xuICAgICAgcmV0dXJuIGxvYWRFbGVtZW50KHJlcXVlc3QsIGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2F1ZGlvJykpXG4gICAgfVxuICB9XG5cbiAgLy8gRmlyc3Qgd2UgcGFyc2UgYWxsIG9iamVjdHMgaW4gb3JkZXIgdG8gdmVyaWZ5IHRoYXQgYWxsIHR5cGUgaW5mb3JtYXRpb25cbiAgLy8gaXMgY29ycmVjdFxuICB2YXIgcGVuZGluZyA9IE9iamVjdC5rZXlzKG1hbmlmZXN0KS5tYXAoZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB2YXIgcmVxdWVzdCA9IG1hbmlmZXN0W25hbWVdXG4gICAgaWYgKHR5cGVvZiByZXF1ZXN0ID09PSAnc3RyaW5nJykge1xuICAgICAgcmVxdWVzdCA9IHtcbiAgICAgICAgc3JjOiByZXF1ZXN0XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgcmVxdWVzdCAhPT0gJ29iamVjdCcgfHwgIXJlcXVlc3QpIHtcbiAgICAgIHJhaXNlKCdpbnZhbGlkIGFzc2V0IGRlZmluaXRpb24gXCInICsgbmFtZSArICdcIicpXG4gICAgfVxuXG4gICAgY2hlY2tUeXBlKHJlcXVlc3QsIG1hbmlmZXN0UGFyYW1ldGVycywgJ2Fzc2V0IFwiJyArIG5hbWUgKyAnXCInKVxuXG4gICAgZnVuY3Rpb24gZ2V0UGFyYW1ldGVyIChwcm9wLCBhY2NlcHRlZCwgaW5pdCkge1xuICAgICAgdmFyIHZhbHVlID0gaW5pdFxuICAgICAgaWYgKHByb3AgaW4gcmVxdWVzdCkge1xuICAgICAgICB2YWx1ZSA9IHJlcXVlc3RbcHJvcF1cbiAgICAgIH1cbiAgICAgIGlmIChhY2NlcHRlZC5pbmRleE9mKHZhbHVlKSA8IDApIHtcbiAgICAgICAgcmFpc2UoJ2ludmFsaWQgJyArIHByb3AgKyAnIFwiJyArIHZhbHVlICsgJ1wiIGZvciBhc3NldCBcIicgKyBuYW1lICsgJ1wiLCBwb3NzaWJsZSB2YWx1ZXM6ICcgKyBhY2NlcHRlZClcbiAgICAgIH1cbiAgICAgIHJldHVybiB2YWx1ZVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldFN0cmluZyAocHJvcCwgcmVxdWlyZWQsIGluaXQpIHtcbiAgICAgIHZhciB2YWx1ZSA9IGluaXRcbiAgICAgIGlmIChwcm9wIGluIHJlcXVlc3QpIHtcbiAgICAgICAgdmFsdWUgPSByZXF1ZXN0W3Byb3BdXG4gICAgICB9IGVsc2UgaWYgKHJlcXVpcmVkKSB7XG4gICAgICAgIHJhaXNlKCdtaXNzaW5nICcgKyBwcm9wICsgJyBmb3IgYXNzZXQgXCInICsgbmFtZSArICdcIicpXG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJykge1xuICAgICAgICByYWlzZSgnaW52YWxpZCAnICsgcHJvcCArICcgZm9yIGFzc2V0IFwiJyArIG5hbWUgKyAnXCIsIG11c3QgYmUgYSBzdHJpbmcnKVxuICAgICAgfVxuICAgICAgcmV0dXJuIHZhbHVlXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0UGFyc2VGdW5jIChuYW1lLCBkZmx0KSB7XG4gICAgICBpZiAobmFtZSBpbiByZXF1ZXN0LnBhcnNlcikge1xuICAgICAgICB2YXIgcmVzdWx0ID0gcmVxdWVzdC5wYXJzZXJbbmFtZV1cbiAgICAgICAgaWYgKHR5cGVvZiByZXN1bHQgIT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICByYWlzZSgnaW52YWxpZCBwYXJzZXIgY2FsbGJhY2sgJyArIG5hbWUgKyAnIGZvciBhc3NldCBcIicgKyBuYW1lICsgJ1wiJylcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZGZsdFxuICAgICAgfVxuICAgIH1cblxuICAgIHZhciBwYXJzZXIgPSB7fVxuICAgIGlmICgncGFyc2VyJyBpbiByZXF1ZXN0KSB7XG4gICAgICBpZiAodHlwZW9mIHJlcXVlc3QucGFyc2VyID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHBhcnNlciA9IHtcbiAgICAgICAgICBkYXRhOiByZXF1ZXN0LnBhcnNlclxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiByZXF1ZXN0LnBhcnNlciA9PT0gJ29iamVjdCcgJiYgcmVxdWVzdC5wYXJzZXIpIHtcbiAgICAgICAgY2hlY2tUeXBlKHBhcnNlciwgcGFyc2VyUGFyYW1ldGVycywgJ3BhcnNlciBmb3IgYXNzZXQgXCInICsgbmFtZSArICdcIicpXG4gICAgICAgIGlmICghKCdvbkRhdGEnIGluIHBhcnNlcikpIHtcbiAgICAgICAgICByYWlzZSgnbWlzc2luZyBvbkRhdGEgY2FsbGJhY2sgZm9yIHBhcnNlciBpbiBhc3NldCBcIicgKyBuYW1lICsgJ1wiJylcbiAgICAgICAgfVxuICAgICAgICBwYXJzZXIgPSB7XG4gICAgICAgICAgZGF0YTogZ2V0UGFyc2VGdW5jKCdvbkRhdGEnKSxcbiAgICAgICAgICBkb25lOiBnZXRQYXJzZUZ1bmMoJ29uRG9uZScpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJhaXNlKCdpbnZhbGlkIHBhcnNlciBmb3IgYXNzZXQgXCInICsgbmFtZSArICdcIicpXG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIG5hbWU6IG5hbWUsXG4gICAgICB0eXBlOiBnZXRQYXJhbWV0ZXIoJ3R5cGUnLCBPYmplY3Qua2V5cyhsb2FkZXJzKSwgJ3RleHQnKSxcbiAgICAgIHN0cmVhbTogISFyZXF1ZXN0LnN0cmVhbSxcbiAgICAgIGNyZWRlbnRpYWxzOiAhIXJlcXVlc3QuY3JlZGVudGlhbHMsXG4gICAgICBzcmM6IGdldFN0cmluZygnc3JjJywgdHJ1ZSwgJycpLFxuICAgICAgcGFyc2VyOiBwYXJzZXJcbiAgICB9XG4gIH0pLm1hcChmdW5jdGlvbiAocmVxdWVzdCkge1xuICAgIHJldHVybiAobG9hZGVyc1tyZXF1ZXN0LnR5cGVdKShyZXF1ZXN0KVxuICB9KVxuXG4gIGZ1bmN0aW9uIGFib3J0IChtZXNzYWdlKSB7XG4gICAgaWYgKHN0YXRlID09PSBTVEFURV9FUlJPUiB8fCBzdGF0ZSA9PT0gU1RBVEVfQ09NUExFVEUpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBzdGF0ZSA9IFNUQVRFX0VSUk9SXG4gICAgcGVuZGluZy5mb3JFYWNoKGZ1bmN0aW9uIChsb2FkZXIpIHtcbiAgICAgIGxvYWRlci5jYW5jZWwoKVxuICAgIH0pXG4gICAgaWYgKG9uRXJyb3IpIHtcbiAgICAgIGlmICh0eXBlb2YgbWVzc2FnZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgb25FcnJvcihuZXcgRXJyb3IoJ3Jlc2w6ICcgKyBtZXNzYWdlKSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG9uRXJyb3IobWVzc2FnZSlcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5lcnJvcigncmVzbCBlcnJvcjonLCBtZXNzYWdlKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIG5vdGlmeVByb2dyZXNzIChtZXNzYWdlKSB7XG4gICAgaWYgKHN0YXRlID09PSBTVEFURV9FUlJPUiB8fCBzdGF0ZSA9PT0gU1RBVEVfQ09NUExFVEUpIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIHZhciBwcm9ncmVzcyA9IDBcbiAgICB2YXIgbnVtUmVhZHkgPSAwXG4gICAgcGVuZGluZy5mb3JFYWNoKGZ1bmN0aW9uIChsb2FkZXIpIHtcbiAgICAgIGlmIChsb2FkZXIucmVhZHkpIHtcbiAgICAgICAgbnVtUmVhZHkgKz0gMVxuICAgICAgfVxuICAgICAgcHJvZ3Jlc3MgKz0gbG9hZGVyLnByb2dyZXNzXG4gICAgfSlcblxuICAgIGlmIChudW1SZWFkeSA9PT0gcGVuZGluZy5sZW5ndGgpIHtcbiAgICAgIHN0YXRlID0gU1RBVEVfQ09NUExFVEVcbiAgICAgIG9uRG9uZShhc3NldHMpXG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChvblByb2dyZXNzKSB7XG4gICAgICAgIG9uUHJvZ3Jlc3MocHJvZ3Jlc3MgLyBwZW5kaW5nLmxlbmd0aCwgbWVzc2FnZSlcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBpZiAocGVuZGluZy5sZW5ndGggPT09IDApIHtcbiAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgIG5vdGlmeVByb2dyZXNzKCdkb25lJylcbiAgICB9LCAxKVxuICB9XG59XG4iLCJ2YXIgY2hlY2sgPSByZXF1aXJlKCcuL2xpYi91dGlsL2NoZWNrJylcbnZhciBleHRlbmQgPSByZXF1aXJlKCcuL2xpYi91dGlsL2V4dGVuZCcpXG52YXIgZHluYW1pYyA9IHJlcXVpcmUoJy4vbGliL2R5bmFtaWMnKVxudmFyIHJhZiA9IHJlcXVpcmUoJy4vbGliL3V0aWwvcmFmJylcbnZhciBjbG9jayA9IHJlcXVpcmUoJy4vbGliL3V0aWwvY2xvY2snKVxudmFyIGNyZWF0ZVN0cmluZ1N0b3JlID0gcmVxdWlyZSgnLi9saWIvc3RyaW5ncycpXG52YXIgaW5pdFdlYkdMID0gcmVxdWlyZSgnLi9saWIvd2ViZ2wnKVxudmFyIHdyYXBFeHRlbnNpb25zID0gcmVxdWlyZSgnLi9saWIvZXh0ZW5zaW9uJylcbnZhciB3cmFwTGltaXRzID0gcmVxdWlyZSgnLi9saWIvbGltaXRzJylcbnZhciB3cmFwQnVmZmVycyA9IHJlcXVpcmUoJy4vbGliL2J1ZmZlcicpXG52YXIgd3JhcEVsZW1lbnRzID0gcmVxdWlyZSgnLi9saWIvZWxlbWVudHMnKVxudmFyIHdyYXBUZXh0dXJlcyA9IHJlcXVpcmUoJy4vbGliL3RleHR1cmUnKVxudmFyIHdyYXBSZW5kZXJidWZmZXJzID0gcmVxdWlyZSgnLi9saWIvcmVuZGVyYnVmZmVyJylcbnZhciB3cmFwRnJhbWVidWZmZXJzID0gcmVxdWlyZSgnLi9saWIvZnJhbWVidWZmZXInKVxudmFyIHdyYXBBdHRyaWJ1dGVzID0gcmVxdWlyZSgnLi9saWIvYXR0cmlidXRlJylcbnZhciB3cmFwU2hhZGVycyA9IHJlcXVpcmUoJy4vbGliL3NoYWRlcicpXG52YXIgd3JhcFJlYWQgPSByZXF1aXJlKCcuL2xpYi9yZWFkJylcbnZhciBjcmVhdGVDb3JlID0gcmVxdWlyZSgnLi9saWIvY29yZScpXG52YXIgY3JlYXRlU3RhdHMgPSByZXF1aXJlKCcuL2xpYi9zdGF0cycpXG52YXIgY3JlYXRlVGltZXIgPSByZXF1aXJlKCcuL2xpYi90aW1lcicpXG5cbnZhciBHTF9DT0xPUl9CVUZGRVJfQklUID0gMTYzODRcbnZhciBHTF9ERVBUSF9CVUZGRVJfQklUID0gMjU2XG52YXIgR0xfU1RFTkNJTF9CVUZGRVJfQklUID0gMTAyNFxuXG52YXIgR0xfQVJSQVlfQlVGRkVSID0gMzQ5NjJcblxudmFyIENPTlRFWFRfTE9TVF9FVkVOVCA9ICd3ZWJnbGNvbnRleHRsb3N0J1xudmFyIENPTlRFWFRfUkVTVE9SRURfRVZFTlQgPSAnd2ViZ2xjb250ZXh0cmVzdG9yZWQnXG5cbnZhciBEWU5fUFJPUCA9IDFcbnZhciBEWU5fQ09OVEVYVCA9IDJcbnZhciBEWU5fU1RBVEUgPSAzXG5cbmZ1bmN0aW9uIGZpbmQgKGhheXN0YWNrLCBuZWVkbGUpIHtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBoYXlzdGFjay5sZW5ndGg7ICsraSkge1xuICAgIGlmIChoYXlzdGFja1tpXSA9PT0gbmVlZGxlKSB7XG4gICAgICByZXR1cm4gaVxuICAgIH1cbiAgfVxuICByZXR1cm4gLTFcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwUkVHTCAoYXJncykge1xuICB2YXIgY29uZmlnID0gaW5pdFdlYkdMKGFyZ3MpXG4gIGlmICghY29uZmlnKSB7XG4gICAgcmV0dXJuIG51bGxcbiAgfVxuXG4gIHZhciBnbCA9IGNvbmZpZy5nbFxuICB2YXIgZ2xBdHRyaWJ1dGVzID0gZ2wuZ2V0Q29udGV4dEF0dHJpYnV0ZXMoKVxuICB2YXIgY29udGV4dExvc3QgPSBnbC5pc0NvbnRleHRMb3N0KClcblxuICB2YXIgZXh0ZW5zaW9uU3RhdGUgPSB3cmFwRXh0ZW5zaW9ucyhnbCwgY29uZmlnKVxuICBpZiAoIWV4dGVuc2lvblN0YXRlKSB7XG4gICAgcmV0dXJuIG51bGxcbiAgfVxuXG4gIHZhciBzdHJpbmdTdG9yZSA9IGNyZWF0ZVN0cmluZ1N0b3JlKClcbiAgdmFyIHN0YXRzID0gY3JlYXRlU3RhdHMoKVxuICB2YXIgZXh0ZW5zaW9ucyA9IGV4dGVuc2lvblN0YXRlLmV4dGVuc2lvbnNcbiAgdmFyIHRpbWVyID0gY3JlYXRlVGltZXIoZ2wsIGV4dGVuc2lvbnMpXG5cbiAgdmFyIFNUQVJUX1RJTUUgPSBjbG9jaygpXG4gIHZhciBXSURUSCA9IGdsLmRyYXdpbmdCdWZmZXJXaWR0aFxuICB2YXIgSEVJR0hUID0gZ2wuZHJhd2luZ0J1ZmZlckhlaWdodFxuXG4gIHZhciBjb250ZXh0U3RhdGUgPSB7XG4gICAgdGljazogMCxcbiAgICB0aW1lOiAwLFxuICAgIHZpZXdwb3J0V2lkdGg6IFdJRFRILFxuICAgIHZpZXdwb3J0SGVpZ2h0OiBIRUlHSFQsXG4gICAgZnJhbWVidWZmZXJXaWR0aDogV0lEVEgsXG4gICAgZnJhbWVidWZmZXJIZWlnaHQ6IEhFSUdIVCxcbiAgICBkcmF3aW5nQnVmZmVyV2lkdGg6IFdJRFRILFxuICAgIGRyYXdpbmdCdWZmZXJIZWlnaHQ6IEhFSUdIVCxcbiAgICBwaXhlbFJhdGlvOiBjb25maWcucGl4ZWxSYXRpb1xuICB9XG4gIHZhciB1bmlmb3JtU3RhdGUgPSB7fVxuICB2YXIgZHJhd1N0YXRlID0ge1xuICAgIGVsZW1lbnRzOiBudWxsLFxuICAgIHByaW1pdGl2ZTogNCwgLy8gR0xfVFJJQU5HTEVTXG4gICAgY291bnQ6IC0xLFxuICAgIG9mZnNldDogMCxcbiAgICBpbnN0YW5jZXM6IC0xXG4gIH1cblxuICB2YXIgbGltaXRzID0gd3JhcExpbWl0cyhnbCwgZXh0ZW5zaW9ucylcbiAgdmFyIGJ1ZmZlclN0YXRlID0gd3JhcEJ1ZmZlcnMoZ2wsIHN0YXRzLCBjb25maWcpXG4gIHZhciBlbGVtZW50U3RhdGUgPSB3cmFwRWxlbWVudHMoZ2wsIGV4dGVuc2lvbnMsIGJ1ZmZlclN0YXRlLCBzdGF0cylcbiAgdmFyIGF0dHJpYnV0ZVN0YXRlID0gd3JhcEF0dHJpYnV0ZXMoXG4gICAgZ2wsXG4gICAgZXh0ZW5zaW9ucyxcbiAgICBsaW1pdHMsXG4gICAgYnVmZmVyU3RhdGUsXG4gICAgc3RyaW5nU3RvcmUpXG4gIHZhciBzaGFkZXJTdGF0ZSA9IHdyYXBTaGFkZXJzKGdsLCBzdHJpbmdTdG9yZSwgc3RhdHMsIGNvbmZpZylcbiAgdmFyIHRleHR1cmVTdGF0ZSA9IHdyYXBUZXh0dXJlcyhcbiAgICBnbCxcbiAgICBleHRlbnNpb25zLFxuICAgIGxpbWl0cyxcbiAgICBmdW5jdGlvbiAoKSB7IGNvcmUucHJvY3MucG9sbCgpIH0sXG4gICAgY29udGV4dFN0YXRlLFxuICAgIHN0YXRzLFxuICAgIGNvbmZpZylcbiAgdmFyIHJlbmRlcmJ1ZmZlclN0YXRlID0gd3JhcFJlbmRlcmJ1ZmZlcnMoZ2wsIGV4dGVuc2lvbnMsIGxpbWl0cywgc3RhdHMsIGNvbmZpZylcbiAgdmFyIGZyYW1lYnVmZmVyU3RhdGUgPSB3cmFwRnJhbWVidWZmZXJzKFxuICAgIGdsLFxuICAgIGV4dGVuc2lvbnMsXG4gICAgbGltaXRzLFxuICAgIHRleHR1cmVTdGF0ZSxcbiAgICByZW5kZXJidWZmZXJTdGF0ZSxcbiAgICBzdGF0cylcbiAgdmFyIGNvcmUgPSBjcmVhdGVDb3JlKFxuICAgIGdsLFxuICAgIHN0cmluZ1N0b3JlLFxuICAgIGV4dGVuc2lvbnMsXG4gICAgbGltaXRzLFxuICAgIGJ1ZmZlclN0YXRlLFxuICAgIGVsZW1lbnRTdGF0ZSxcbiAgICB0ZXh0dXJlU3RhdGUsXG4gICAgZnJhbWVidWZmZXJTdGF0ZSxcbiAgICB1bmlmb3JtU3RhdGUsXG4gICAgYXR0cmlidXRlU3RhdGUsXG4gICAgc2hhZGVyU3RhdGUsXG4gICAgZHJhd1N0YXRlLFxuICAgIGNvbnRleHRTdGF0ZSxcbiAgICB0aW1lcixcbiAgICBjb25maWcpXG4gIHZhciByZWFkUGl4ZWxzID0gd3JhcFJlYWQoXG4gICAgZ2wsXG4gICAgZnJhbWVidWZmZXJTdGF0ZSxcbiAgICBjb3JlLnByb2NzLnBvbGwsXG4gICAgY29udGV4dFN0YXRlLFxuICAgIGdsQXR0cmlidXRlcywgZXh0ZW5zaW9ucylcblxuICB2YXIgbmV4dFN0YXRlID0gY29yZS5uZXh0XG4gIHZhciBjYW52YXMgPSBnbC5jYW52YXNcblxuICB2YXIgcmFmQ2FsbGJhY2tzID0gW11cbiAgdmFyIGxvc3NDYWxsYmFja3MgPSBbXVxuICB2YXIgcmVzdG9yZUNhbGxiYWNrcyA9IFtdXG4gIHZhciBkZXN0cm95Q2FsbGJhY2tzID0gW2NvbmZpZy5vbkRlc3Ryb3ldXG5cbiAgdmFyIGFjdGl2ZVJBRiA9IG51bGxcbiAgZnVuY3Rpb24gaGFuZGxlUkFGICgpIHtcbiAgICBpZiAocmFmQ2FsbGJhY2tzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgaWYgKHRpbWVyKSB7XG4gICAgICAgIHRpbWVyLnVwZGF0ZSgpXG4gICAgICB9XG4gICAgICBhY3RpdmVSQUYgPSBudWxsXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICAvLyBzY2hlZHVsZSBuZXh0IGFuaW1hdGlvbiBmcmFtZVxuICAgIGFjdGl2ZVJBRiA9IHJhZi5uZXh0KGhhbmRsZVJBRilcblxuICAgIC8vIHBvbGwgZm9yIGNoYW5nZXNcbiAgICBwb2xsKClcblxuICAgIC8vIGZpcmUgYSBjYWxsYmFjayBmb3IgYWxsIHBlbmRpbmcgcmFmc1xuICAgIGZvciAodmFyIGkgPSByYWZDYWxsYmFja3MubGVuZ3RoIC0gMTsgaSA+PSAwOyAtLWkpIHtcbiAgICAgIHZhciBjYiA9IHJhZkNhbGxiYWNrc1tpXVxuICAgICAgaWYgKGNiKSB7XG4gICAgICAgIGNiKGNvbnRleHRTdGF0ZSwgbnVsbCwgMClcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBmbHVzaCBhbGwgcGVuZGluZyB3ZWJnbCBjYWxsc1xuICAgIGdsLmZsdXNoKClcblxuICAgIC8vIHBvbGwgR1BVIHRpbWVycyAqYWZ0ZXIqIGdsLmZsdXNoIHNvIHdlIGRvbid0IGRlbGF5IGNvbW1hbmQgZGlzcGF0Y2hcbiAgICBpZiAodGltZXIpIHtcbiAgICAgIHRpbWVyLnVwZGF0ZSgpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc3RhcnRSQUYgKCkge1xuICAgIGlmICghYWN0aXZlUkFGICYmIHJhZkNhbGxiYWNrcy5sZW5ndGggPiAwKSB7XG4gICAgICBhY3RpdmVSQUYgPSByYWYubmV4dChoYW5kbGVSQUYpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc3RvcFJBRiAoKSB7XG4gICAgaWYgKGFjdGl2ZVJBRikge1xuICAgICAgcmFmLmNhbmNlbChoYW5kbGVSQUYpXG4gICAgICBhY3RpdmVSQUYgPSBudWxsXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaGFuZGxlQ29udGV4dExvc3MgKGV2ZW50KSB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKVxuXG4gICAgLy8gc2V0IGNvbnRleHQgbG9zdCBmbGFnXG4gICAgY29udGV4dExvc3QgPSB0cnVlXG5cbiAgICAvLyBwYXVzZSByZXF1ZXN0IGFuaW1hdGlvbiBmcmFtZVxuICAgIHN0b3BSQUYoKVxuXG4gICAgLy8gbG9zZSBjb250ZXh0XG4gICAgbG9zc0NhbGxiYWNrcy5mb3JFYWNoKGZ1bmN0aW9uIChjYikge1xuICAgICAgY2IoKVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVDb250ZXh0UmVzdG9yZWQgKGV2ZW50KSB7XG4gICAgLy8gY2xlYXIgZXJyb3IgY29kZVxuICAgIGdsLmdldEVycm9yKClcblxuICAgIC8vIGNsZWFyIGNvbnRleHQgbG9zdCBmbGFnXG4gICAgY29udGV4dExvc3QgPSBmYWxzZVxuXG4gICAgLy8gcmVmcmVzaCBzdGF0ZVxuICAgIGV4dGVuc2lvblN0YXRlLnJlc3RvcmUoKVxuICAgIHNoYWRlclN0YXRlLnJlc3RvcmUoKVxuICAgIGJ1ZmZlclN0YXRlLnJlc3RvcmUoKVxuICAgIHRleHR1cmVTdGF0ZS5yZXN0b3JlKClcbiAgICByZW5kZXJidWZmZXJTdGF0ZS5yZXN0b3JlKClcbiAgICBmcmFtZWJ1ZmZlclN0YXRlLnJlc3RvcmUoKVxuICAgIGlmICh0aW1lcikge1xuICAgICAgdGltZXIucmVzdG9yZSgpXG4gICAgfVxuXG4gICAgLy8gcmVmcmVzaCBzdGF0ZVxuICAgIGNvcmUucHJvY3MucmVmcmVzaCgpXG5cbiAgICAvLyByZXN0YXJ0IFJBRlxuICAgIHN0YXJ0UkFGKClcblxuICAgIC8vIHJlc3RvcmUgY29udGV4dFxuICAgIHJlc3RvcmVDYWxsYmFja3MuZm9yRWFjaChmdW5jdGlvbiAoY2IpIHtcbiAgICAgIGNiKClcbiAgICB9KVxuICB9XG5cbiAgaWYgKGNhbnZhcykge1xuICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKENPTlRFWFRfTE9TVF9FVkVOVCwgaGFuZGxlQ29udGV4dExvc3MsIGZhbHNlKVxuICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKENPTlRFWFRfUkVTVE9SRURfRVZFTlQsIGhhbmRsZUNvbnRleHRSZXN0b3JlZCwgZmFsc2UpXG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95ICgpIHtcbiAgICByYWZDYWxsYmFja3MubGVuZ3RoID0gMFxuICAgIHN0b3BSQUYoKVxuXG4gICAgaWYgKGNhbnZhcykge1xuICAgICAgY2FudmFzLnJlbW92ZUV2ZW50TGlzdGVuZXIoQ09OVEVYVF9MT1NUX0VWRU5ULCBoYW5kbGVDb250ZXh0TG9zcylcbiAgICAgIGNhbnZhcy5yZW1vdmVFdmVudExpc3RlbmVyKENPTlRFWFRfUkVTVE9SRURfRVZFTlQsIGhhbmRsZUNvbnRleHRSZXN0b3JlZClcbiAgICB9XG5cbiAgICBzaGFkZXJTdGF0ZS5jbGVhcigpXG4gICAgZnJhbWVidWZmZXJTdGF0ZS5jbGVhcigpXG4gICAgcmVuZGVyYnVmZmVyU3RhdGUuY2xlYXIoKVxuICAgIHRleHR1cmVTdGF0ZS5jbGVhcigpXG4gICAgZWxlbWVudFN0YXRlLmNsZWFyKClcbiAgICBidWZmZXJTdGF0ZS5jbGVhcigpXG5cbiAgICBpZiAodGltZXIpIHtcbiAgICAgIHRpbWVyLmNsZWFyKClcbiAgICB9XG5cbiAgICBkZXN0cm95Q2FsbGJhY2tzLmZvckVhY2goZnVuY3Rpb24gKGNiKSB7XG4gICAgICBjYigpXG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGNvbXBpbGVQcm9jZWR1cmUgKG9wdGlvbnMpIHtcbiAgICBjaGVjayghIW9wdGlvbnMsICdpbnZhbGlkIGFyZ3MgdG8gcmVnbCh7Li4ufSknKVxuICAgIGNoZWNrLnR5cGUob3B0aW9ucywgJ29iamVjdCcsICdpbnZhbGlkIGFyZ3MgdG8gcmVnbCh7Li4ufSknKVxuXG4gICAgZnVuY3Rpb24gZmxhdHRlbk5lc3RlZE9wdGlvbnMgKG9wdGlvbnMpIHtcbiAgICAgIHZhciByZXN1bHQgPSBleHRlbmQoe30sIG9wdGlvbnMpXG4gICAgICBkZWxldGUgcmVzdWx0LnVuaWZvcm1zXG4gICAgICBkZWxldGUgcmVzdWx0LmF0dHJpYnV0ZXNcbiAgICAgIGRlbGV0ZSByZXN1bHQuY29udGV4dFxuXG4gICAgICBpZiAoJ3N0ZW5jaWwnIGluIHJlc3VsdCAmJiByZXN1bHQuc3RlbmNpbC5vcCkge1xuICAgICAgICByZXN1bHQuc3RlbmNpbC5vcEJhY2sgPSByZXN1bHQuc3RlbmNpbC5vcEZyb250ID0gcmVzdWx0LnN0ZW5jaWwub3BcbiAgICAgICAgZGVsZXRlIHJlc3VsdC5zdGVuY2lsLm9wXG4gICAgICB9XG5cbiAgICAgIGZ1bmN0aW9uIG1lcmdlIChuYW1lKSB7XG4gICAgICAgIGlmIChuYW1lIGluIHJlc3VsdCkge1xuICAgICAgICAgIHZhciBjaGlsZCA9IHJlc3VsdFtuYW1lXVxuICAgICAgICAgIGRlbGV0ZSByZXN1bHRbbmFtZV1cbiAgICAgICAgICBPYmplY3Qua2V5cyhjaGlsZCkuZm9yRWFjaChmdW5jdGlvbiAocHJvcCkge1xuICAgICAgICAgICAgcmVzdWx0W25hbWUgKyAnLicgKyBwcm9wXSA9IGNoaWxkW3Byb3BdXG4gICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgbWVyZ2UoJ2JsZW5kJylcbiAgICAgIG1lcmdlKCdkZXB0aCcpXG4gICAgICBtZXJnZSgnY3VsbCcpXG4gICAgICBtZXJnZSgnc3RlbmNpbCcpXG4gICAgICBtZXJnZSgncG9seWdvbk9mZnNldCcpXG4gICAgICBtZXJnZSgnc2Npc3NvcicpXG4gICAgICBtZXJnZSgnc2FtcGxlJylcblxuICAgICAgcmV0dXJuIHJlc3VsdFxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHNlcGFyYXRlRHluYW1pYyAob2JqZWN0KSB7XG4gICAgICB2YXIgc3RhdGljSXRlbXMgPSB7fVxuICAgICAgdmFyIGR5bmFtaWNJdGVtcyA9IHt9XG4gICAgICBPYmplY3Qua2V5cyhvYmplY3QpLmZvckVhY2goZnVuY3Rpb24gKG9wdGlvbikge1xuICAgICAgICB2YXIgdmFsdWUgPSBvYmplY3Rbb3B0aW9uXVxuICAgICAgICBpZiAoZHluYW1pYy5pc0R5bmFtaWModmFsdWUpKSB7XG4gICAgICAgICAgZHluYW1pY0l0ZW1zW29wdGlvbl0gPSBkeW5hbWljLnVuYm94KHZhbHVlLCBvcHRpb24pXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc3RhdGljSXRlbXNbb3B0aW9uXSA9IHZhbHVlXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICByZXR1cm4ge1xuICAgICAgICBkeW5hbWljOiBkeW5hbWljSXRlbXMsXG4gICAgICAgIHN0YXRpYzogc3RhdGljSXRlbXNcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBUcmVhdCBjb250ZXh0IHZhcmlhYmxlcyBzZXBhcmF0ZSBmcm9tIG90aGVyIGR5bmFtaWMgdmFyaWFibGVzXG4gICAgdmFyIGNvbnRleHQgPSBzZXBhcmF0ZUR5bmFtaWMob3B0aW9ucy5jb250ZXh0IHx8IHt9KVxuICAgIHZhciB1bmlmb3JtcyA9IHNlcGFyYXRlRHluYW1pYyhvcHRpb25zLnVuaWZvcm1zIHx8IHt9KVxuICAgIHZhciBhdHRyaWJ1dGVzID0gc2VwYXJhdGVEeW5hbWljKG9wdGlvbnMuYXR0cmlidXRlcyB8fCB7fSlcbiAgICB2YXIgb3B0cyA9IHNlcGFyYXRlRHluYW1pYyhmbGF0dGVuTmVzdGVkT3B0aW9ucyhvcHRpb25zKSlcblxuICAgIHZhciBzdGF0cyA9IHtcbiAgICAgIGdwdVRpbWU6IDAuMCxcbiAgICAgIGNwdVRpbWU6IDAuMCxcbiAgICAgIGNvdW50OiAwXG4gICAgfVxuXG4gICAgdmFyIGNvbXBpbGVkID0gY29yZS5jb21waWxlKG9wdHMsIGF0dHJpYnV0ZXMsIHVuaWZvcm1zLCBjb250ZXh0LCBzdGF0cylcblxuICAgIHZhciBkcmF3ID0gY29tcGlsZWQuZHJhd1xuICAgIHZhciBiYXRjaCA9IGNvbXBpbGVkLmJhdGNoXG4gICAgdmFyIHNjb3BlID0gY29tcGlsZWQuc2NvcGVcblxuICAgIC8vIEZJWE1FOiB3ZSBzaG91bGQgbW9kaWZ5IGNvZGUgZ2VuZXJhdGlvbiBmb3IgYmF0Y2ggY29tbWFuZHMgc28gdGhpc1xuICAgIC8vIGlzbid0IG5lY2Vzc2FyeVxuICAgIHZhciBFTVBUWV9BUlJBWSA9IFtdXG4gICAgZnVuY3Rpb24gcmVzZXJ2ZSAoY291bnQpIHtcbiAgICAgIHdoaWxlIChFTVBUWV9BUlJBWS5sZW5ndGggPCBjb3VudCkge1xuICAgICAgICBFTVBUWV9BUlJBWS5wdXNoKG51bGwpXG4gICAgICB9XG4gICAgICByZXR1cm4gRU1QVFlfQVJSQVlcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBSRUdMQ29tbWFuZCAoYXJncywgYm9keSkge1xuICAgICAgdmFyIGlcbiAgICAgIGlmIChjb250ZXh0TG9zdCkge1xuICAgICAgICBjaGVjay5yYWlzZSgnY29udGV4dCBsb3N0JylcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlb2YgYXJncyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICByZXR1cm4gc2NvcGUuY2FsbCh0aGlzLCBudWxsLCBhcmdzLCAwKVxuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgYm9keSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBpZiAodHlwZW9mIGFyZ3MgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgZm9yIChpID0gMDsgaSA8IGFyZ3M7ICsraSkge1xuICAgICAgICAgICAgc2NvcGUuY2FsbCh0aGlzLCBudWxsLCBib2R5LCBpKVxuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGFyZ3MpKSB7XG4gICAgICAgICAgZm9yIChpID0gMDsgaSA8IGFyZ3MubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICAgIHNjb3BlLmNhbGwodGhpcywgYXJnc1tpXSwgYm9keSwgaSlcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIHNjb3BlLmNhbGwodGhpcywgYXJncywgYm9keSwgMClcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgYXJncyA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgaWYgKGFyZ3MgPiAwKSB7XG4gICAgICAgICAgcmV0dXJuIGJhdGNoLmNhbGwodGhpcywgcmVzZXJ2ZShhcmdzIHwgMCksIGFyZ3MgfCAwKVxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoYXJncykpIHtcbiAgICAgICAgaWYgKGFyZ3MubGVuZ3RoKSB7XG4gICAgICAgICAgcmV0dXJuIGJhdGNoLmNhbGwodGhpcywgYXJncywgYXJncy5sZW5ndGgpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBkcmF3LmNhbGwodGhpcywgYXJncylcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gZXh0ZW5kKFJFR0xDb21tYW5kLCB7XG4gICAgICBzdGF0czogc3RhdHNcbiAgICB9KVxuICB9XG5cbiAgdmFyIHNldEZCTyA9IGZyYW1lYnVmZmVyU3RhdGUuc2V0RkJPID0gY29tcGlsZVByb2NlZHVyZSh7XG4gICAgZnJhbWVidWZmZXI6IGR5bmFtaWMuZGVmaW5lLmNhbGwobnVsbCwgRFlOX1BST1AsICdmcmFtZWJ1ZmZlcicpXG4gIH0pXG5cbiAgZnVuY3Rpb24gY2xlYXJJbXBsIChfLCBvcHRpb25zKSB7XG4gICAgdmFyIGNsZWFyRmxhZ3MgPSAwXG4gICAgY29yZS5wcm9jcy5wb2xsKClcblxuICAgIHZhciBjID0gb3B0aW9ucy5jb2xvclxuICAgIGlmIChjKSB7XG4gICAgICBnbC5jbGVhckNvbG9yKCtjWzBdIHx8IDAsICtjWzFdIHx8IDAsICtjWzJdIHx8IDAsICtjWzNdIHx8IDApXG4gICAgICBjbGVhckZsYWdzIHw9IEdMX0NPTE9SX0JVRkZFUl9CSVRcbiAgICB9XG4gICAgaWYgKCdkZXB0aCcgaW4gb3B0aW9ucykge1xuICAgICAgZ2wuY2xlYXJEZXB0aCgrb3B0aW9ucy5kZXB0aClcbiAgICAgIGNsZWFyRmxhZ3MgfD0gR0xfREVQVEhfQlVGRkVSX0JJVFxuICAgIH1cbiAgICBpZiAoJ3N0ZW5jaWwnIGluIG9wdGlvbnMpIHtcbiAgICAgIGdsLmNsZWFyU3RlbmNpbChvcHRpb25zLnN0ZW5jaWwgfCAwKVxuICAgICAgY2xlYXJGbGFncyB8PSBHTF9TVEVOQ0lMX0JVRkZFUl9CSVRcbiAgICB9XG5cbiAgICBjaGVjayghIWNsZWFyRmxhZ3MsICdjYWxsZWQgcmVnbC5jbGVhciB3aXRoIG5vIGJ1ZmZlciBzcGVjaWZpZWQnKVxuICAgIGdsLmNsZWFyKGNsZWFyRmxhZ3MpXG4gIH1cblxuICBmdW5jdGlvbiBjbGVhciAob3B0aW9ucykge1xuICAgIGNoZWNrKFxuICAgICAgdHlwZW9mIG9wdGlvbnMgPT09ICdvYmplY3QnICYmIG9wdGlvbnMsXG4gICAgICAncmVnbC5jbGVhcigpIHRha2VzIGFuIG9iamVjdCBhcyBpbnB1dCcpXG4gICAgaWYgKCdmcmFtZWJ1ZmZlcicgaW4gb3B0aW9ucykge1xuICAgICAgaWYgKG9wdGlvbnMuZnJhbWVidWZmZXIgJiZcbiAgICAgICAgICBvcHRpb25zLmZyYW1lYnVmZmVyX3JlZ2xUeXBlID09PSAnZnJhbWVidWZmZXJDdWJlJykge1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICAgIHNldEZCTyhleHRlbmQoe1xuICAgICAgICAgICAgZnJhbWVidWZmZXI6IG9wdGlvbnMuZnJhbWVidWZmZXIuZmFjZXNbaV1cbiAgICAgICAgICB9LCBvcHRpb25zKSwgY2xlYXJJbXBsKVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzZXRGQk8ob3B0aW9ucywgY2xlYXJJbXBsKVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjbGVhckltcGwobnVsbCwgb3B0aW9ucylcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBmcmFtZSAoY2IpIHtcbiAgICBjaGVjay50eXBlKGNiLCAnZnVuY3Rpb24nLCAncmVnbC5mcmFtZSgpIGNhbGxiYWNrIG11c3QgYmUgYSBmdW5jdGlvbicpXG4gICAgcmFmQ2FsbGJhY2tzLnB1c2goY2IpXG5cbiAgICBmdW5jdGlvbiBjYW5jZWwgKCkge1xuICAgICAgLy8gRklYTUU6ICBzaG91bGQgd2UgY2hlY2sgc29tZXRoaW5nIG90aGVyIHRoYW4gZXF1YWxzIGNiIGhlcmU/XG4gICAgICAvLyB3aGF0IGlmIGEgdXNlciBjYWxscyBmcmFtZSB0d2ljZSB3aXRoIHRoZSBzYW1lIGNhbGxiYWNrLi4uXG4gICAgICAvL1xuICAgICAgdmFyIGkgPSBmaW5kKHJhZkNhbGxiYWNrcywgY2IpXG4gICAgICBjaGVjayhpID49IDAsICdjYW5ub3QgY2FuY2VsIGEgZnJhbWUgdHdpY2UnKVxuICAgICAgZnVuY3Rpb24gcGVuZGluZ0NhbmNlbCAoKSB7XG4gICAgICAgIHZhciBpbmRleCA9IGZpbmQocmFmQ2FsbGJhY2tzLCBwZW5kaW5nQ2FuY2VsKVxuICAgICAgICByYWZDYWxsYmFja3NbaW5kZXhdID0gcmFmQ2FsbGJhY2tzW3JhZkNhbGxiYWNrcy5sZW5ndGggLSAxXVxuICAgICAgICByYWZDYWxsYmFja3MubGVuZ3RoIC09IDFcbiAgICAgICAgaWYgKHJhZkNhbGxiYWNrcy5sZW5ndGggPD0gMCkge1xuICAgICAgICAgIHN0b3BSQUYoKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICByYWZDYWxsYmFja3NbaV0gPSBwZW5kaW5nQ2FuY2VsXG4gICAgfVxuXG4gICAgc3RhcnRSQUYoKVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGNhbmNlbDogY2FuY2VsXG4gICAgfVxuICB9XG5cbiAgLy8gcG9sbCB2aWV3cG9ydFxuICBmdW5jdGlvbiBwb2xsVmlld3BvcnQgKCkge1xuICAgIHZhciB2aWV3cG9ydCA9IG5leHRTdGF0ZS52aWV3cG9ydFxuICAgIHZhciBzY2lzc29yQm94ID0gbmV4dFN0YXRlLnNjaXNzb3JfYm94XG4gICAgdmlld3BvcnRbMF0gPSB2aWV3cG9ydFsxXSA9IHNjaXNzb3JCb3hbMF0gPSBzY2lzc29yQm94WzFdID0gMFxuICAgIGNvbnRleHRTdGF0ZS52aWV3cG9ydFdpZHRoID1cbiAgICAgIGNvbnRleHRTdGF0ZS5mcmFtZWJ1ZmZlcldpZHRoID1cbiAgICAgIGNvbnRleHRTdGF0ZS5kcmF3aW5nQnVmZmVyV2lkdGggPVxuICAgICAgdmlld3BvcnRbMl0gPVxuICAgICAgc2Npc3NvckJveFsyXSA9IGdsLmRyYXdpbmdCdWZmZXJXaWR0aFxuICAgIGNvbnRleHRTdGF0ZS52aWV3cG9ydEhlaWdodCA9XG4gICAgICBjb250ZXh0U3RhdGUuZnJhbWVidWZmZXJIZWlnaHQgPVxuICAgICAgY29udGV4dFN0YXRlLmRyYXdpbmdCdWZmZXJIZWlnaHQgPVxuICAgICAgdmlld3BvcnRbM10gPVxuICAgICAgc2Npc3NvckJveFszXSA9IGdsLmRyYXdpbmdCdWZmZXJIZWlnaHRcbiAgfVxuXG4gIGZ1bmN0aW9uIHBvbGwgKCkge1xuICAgIGNvbnRleHRTdGF0ZS50aWNrICs9IDFcbiAgICBjb250ZXh0U3RhdGUudGltZSA9IG5vdygpXG4gICAgcG9sbFZpZXdwb3J0KClcbiAgICBjb3JlLnByb2NzLnBvbGwoKVxuICB9XG5cbiAgZnVuY3Rpb24gcmVmcmVzaCAoKSB7XG4gICAgcG9sbFZpZXdwb3J0KClcbiAgICBjb3JlLnByb2NzLnJlZnJlc2goKVxuICAgIGlmICh0aW1lcikge1xuICAgICAgdGltZXIudXBkYXRlKClcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBub3cgKCkge1xuICAgIHJldHVybiAoY2xvY2soKSAtIFNUQVJUX1RJTUUpIC8gMTAwMC4wXG4gIH1cblxuICByZWZyZXNoKClcblxuICBmdW5jdGlvbiBhZGRMaXN0ZW5lciAoZXZlbnQsIGNhbGxiYWNrKSB7XG4gICAgY2hlY2sudHlwZShjYWxsYmFjaywgJ2Z1bmN0aW9uJywgJ2xpc3RlbmVyIGNhbGxiYWNrIG11c3QgYmUgYSBmdW5jdGlvbicpXG5cbiAgICB2YXIgY2FsbGJhY2tzXG4gICAgc3dpdGNoIChldmVudCkge1xuICAgICAgY2FzZSAnZnJhbWUnOlxuICAgICAgICByZXR1cm4gZnJhbWUoY2FsbGJhY2spXG4gICAgICBjYXNlICdsb3N0JzpcbiAgICAgICAgY2FsbGJhY2tzID0gbG9zc0NhbGxiYWNrc1xuICAgICAgICBicmVha1xuICAgICAgY2FzZSAncmVzdG9yZSc6XG4gICAgICAgIGNhbGxiYWNrcyA9IHJlc3RvcmVDYWxsYmFja3NcbiAgICAgICAgYnJlYWtcbiAgICAgIGNhc2UgJ2Rlc3Ryb3knOlxuICAgICAgICBjYWxsYmFja3MgPSBkZXN0cm95Q2FsbGJhY2tzXG4gICAgICAgIGJyZWFrXG4gICAgICBkZWZhdWx0OlxuICAgICAgICBjaGVjay5yYWlzZSgnaW52YWxpZCBldmVudCwgbXVzdCBiZSBvbmUgb2YgZnJhbWUsbG9zdCxyZXN0b3JlLGRlc3Ryb3knKVxuICAgIH1cblxuICAgIGNhbGxiYWNrcy5wdXNoKGNhbGxiYWNrKVxuICAgIHJldHVybiB7XG4gICAgICBjYW5jZWw6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjYWxsYmFja3MubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICBpZiAoY2FsbGJhY2tzW2ldID09PSBjYWxsYmFjaykge1xuICAgICAgICAgICAgY2FsbGJhY2tzW2ldID0gY2FsbGJhY2tzW2NhbGxiYWNrcy5sZW5ndGggLSAxXVxuICAgICAgICAgICAgY2FsbGJhY2tzLnBvcCgpXG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICB2YXIgcmVnbCA9IGV4dGVuZChjb21waWxlUHJvY2VkdXJlLCB7XG4gICAgLy8gQ2xlYXIgY3VycmVudCBGQk9cbiAgICBjbGVhcjogY2xlYXIsXG5cbiAgICAvLyBTaG9ydCBjdXRzIGZvciBkeW5hbWljIHZhcmlhYmxlc1xuICAgIHByb3A6IGR5bmFtaWMuZGVmaW5lLmJpbmQobnVsbCwgRFlOX1BST1ApLFxuICAgIGNvbnRleHQ6IGR5bmFtaWMuZGVmaW5lLmJpbmQobnVsbCwgRFlOX0NPTlRFWFQpLFxuICAgIHRoaXM6IGR5bmFtaWMuZGVmaW5lLmJpbmQobnVsbCwgRFlOX1NUQVRFKSxcblxuICAgIC8vIGV4ZWN1dGVzIGFuIGVtcHR5IGRyYXcgY29tbWFuZFxuICAgIGRyYXc6IGNvbXBpbGVQcm9jZWR1cmUoe30pLFxuXG4gICAgLy8gUmVzb3VyY2VzXG4gICAgYnVmZmVyOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgcmV0dXJuIGJ1ZmZlclN0YXRlLmNyZWF0ZShvcHRpb25zLCBHTF9BUlJBWV9CVUZGRVIsIGZhbHNlLCBmYWxzZSlcbiAgICB9LFxuICAgIGVsZW1lbnRzOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgcmV0dXJuIGVsZW1lbnRTdGF0ZS5jcmVhdGUob3B0aW9ucywgZmFsc2UpXG4gICAgfSxcbiAgICB0ZXh0dXJlOiB0ZXh0dXJlU3RhdGUuY3JlYXRlMkQsXG4gICAgY3ViZTogdGV4dHVyZVN0YXRlLmNyZWF0ZUN1YmUsXG4gICAgcmVuZGVyYnVmZmVyOiByZW5kZXJidWZmZXJTdGF0ZS5jcmVhdGUsXG4gICAgZnJhbWVidWZmZXI6IGZyYW1lYnVmZmVyU3RhdGUuY3JlYXRlLFxuICAgIGZyYW1lYnVmZmVyQ3ViZTogZnJhbWVidWZmZXJTdGF0ZS5jcmVhdGVDdWJlLFxuXG4gICAgLy8gRXhwb3NlIGNvbnRleHQgYXR0cmlidXRlc1xuICAgIGF0dHJpYnV0ZXM6IGdsQXR0cmlidXRlcyxcblxuICAgIC8vIEZyYW1lIHJlbmRlcmluZ1xuICAgIGZyYW1lOiBmcmFtZSxcbiAgICBvbjogYWRkTGlzdGVuZXIsXG5cbiAgICAvLyBTeXN0ZW0gbGltaXRzXG4gICAgbGltaXRzOiBsaW1pdHMsXG4gICAgaGFzRXh0ZW5zaW9uOiBmdW5jdGlvbiAobmFtZSkge1xuICAgICAgcmV0dXJuIGxpbWl0cy5leHRlbnNpb25zLmluZGV4T2YobmFtZS50b0xvd2VyQ2FzZSgpKSA+PSAwXG4gICAgfSxcblxuICAgIC8vIFJlYWQgcGl4ZWxzXG4gICAgcmVhZDogcmVhZFBpeGVscyxcblxuICAgIC8vIERlc3Ryb3kgcmVnbCBhbmQgYWxsIGFzc29jaWF0ZWQgcmVzb3VyY2VzXG4gICAgZGVzdHJveTogZGVzdHJveSxcblxuICAgIC8vIERpcmVjdCBHTCBzdGF0ZSBtYW5pcHVsYXRpb25cbiAgICBfZ2w6IGdsLFxuICAgIF9yZWZyZXNoOiByZWZyZXNoLFxuXG4gICAgcG9sbDogZnVuY3Rpb24gKCkge1xuICAgICAgcG9sbCgpXG4gICAgICBpZiAodGltZXIpIHtcbiAgICAgICAgdGltZXIudXBkYXRlKClcbiAgICAgIH1cbiAgICB9LFxuXG4gICAgLy8gQ3VycmVudCB0aW1lXG4gICAgbm93OiBub3csXG5cbiAgICAvLyByZWdsIFN0YXRpc3RpY3MgSW5mb3JtYXRpb25cbiAgICBzdGF0czogc3RhdHNcbiAgfSlcblxuICBjb25maWcub25Eb25lKG51bGwsIHJlZ2wpXG5cbiAgcmV0dXJuIHJlZ2xcbn1cbiJdfQ==
