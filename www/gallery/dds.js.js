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

},{"../regl":36,"parse-dds":34,"resl":35}],2:[function(require,module,exports){
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

},{}],35:[function(require,module,exports){
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJleGFtcGxlL2Rkcy5qcyIsImxpYi9hdHRyaWJ1dGUuanMiLCJsaWIvYnVmZmVyLmpzIiwibGliL2NvbnN0YW50cy9hcnJheXR5cGVzLmpzb24iLCJsaWIvY29uc3RhbnRzL2R0eXBlcy5qc29uIiwibGliL2NvbnN0YW50cy9wcmltaXRpdmVzLmpzb24iLCJsaWIvY29uc3RhbnRzL3VzYWdlLmpzb24iLCJsaWIvY29yZS5qcyIsImxpYi9keW5hbWljLmpzIiwibGliL2VsZW1lbnRzLmpzIiwibGliL2V4dGVuc2lvbi5qcyIsImxpYi9mcmFtZWJ1ZmZlci5qcyIsImxpYi9saW1pdHMuanMiLCJsaWIvcmVhZC5qcyIsImxpYi9yZW5kZXJidWZmZXIuanMiLCJsaWIvc2hhZGVyLmpzIiwibGliL3N0YXRzLmpzIiwibGliL3N0cmluZ3MuanMiLCJsaWIvdGV4dHVyZS5qcyIsImxpYi90aW1lci5qcyIsImxpYi91dGlsL2Nsb2NrLmpzIiwibGliL3V0aWwvY29kZWdlbi5qcyIsImxpYi91dGlsL2V4dGVuZC5qcyIsImxpYi91dGlsL2ZsYXR0ZW4uanMiLCJsaWIvdXRpbC9pcy1hcnJheS1saWtlLmpzIiwibGliL3V0aWwvaXMtbmRhcnJheS5qcyIsImxpYi91dGlsL2lzLXR5cGVkLWFycmF5LmpzIiwibGliL3V0aWwvbG9vcC5qcyIsImxpYi91dGlsL3Bvb2wuanMiLCJsaWIvdXRpbC9yYWYuanMiLCJsaWIvdXRpbC90by1oYWxmLWZsb2F0LmpzIiwibGliL3V0aWwvdmFsdWVzLmpzIiwibGliL3dlYmdsLmpzIiwibm9kZV9tb2R1bGVzL3BhcnNlLWRkcy9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9yZXNsL2luZGV4LmpzIiwicmVnbC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBOzs7OztBQUtBLElBQU0sT0FBTyxRQUFRLFNBQVIsRUFBbUI7QUFDOUIsY0FBWTtBQURr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QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcExBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFD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QU8sVUFBUCxDQUFrQixPQUFsQixDQUEwQixLQUFLLFdBQUwsRUFBMUIsS0FBaUQsQ0FBeEQ7QUFDRCxLQXBDaUM7O0FBc0NsQztBQUNBLFVBQU0sVUF2QzRCOztBQXlDbEM7QUFDQSxhQUFTLE9BMUN5Qjs7QUE0Q2xDO0FBQ0EsU0FBSyxFQTdDNkI7QUE4Q2xDLGNBQVUsT0E5Q3dCOztBQWdEbEMsVUFBTSxZQUFZO0FBQ2hCO0FBQ0EsVUFBSSxLQUFKLEVBQVc7QUFDVCxjQUFNLE1BQU47QUFDRDtBQUNGLEtBckRpQzs7QUF1RGxDO0FBQ0EsU0FBSyxHQXhENkI7O0FBMERsQztBQUNBLFdBQU87QUEzRDJCLEdBQXpCLENBQVg7O0FBOERBLFNBQU8sTUFBUCxDQUFjLElBQWQsRUFBb0IsSUFBcEI7O0FBRUEsU0FBTyxJQUFQO0FBQ0QsQ0FsaEJEIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8qXG4gIHRhZ3M6IGFkdmFuY2VkXG4gIDxwPlRoaXMgZXhhbXBsZSBzaG93cyBob3cgeW91IGNhbiBwYXJzZSBkZHMgZmlsZXMgd2l0aCByZXNsLjwvcD5cbiAqL1xuXG5jb25zdCByZWdsID0gcmVxdWlyZSgnLi4vcmVnbCcpKHtcbiAgZXh0ZW5zaW9uczogJ1dFQkdMX2NvbXByZXNzZWRfdGV4dHVyZV9zM3RjJ1xufSlcbmNvbnN0IHBhcnNlRERTID0gcmVxdWlyZSgncGFyc2UtZGRzJylcblxucmVxdWlyZSgncmVzbCcpKHtcbiAgbWFuaWZlc3Q6IHtcbiAgICBkaWZmdXNlOiB7XG4gICAgICB0eXBlOiAnYmluYXJ5JyxcbiAgICAgIHNyYzogJ2Fzc2V0cy9hbHBpbmVfY2xpZmZfYS5kZHMnLFxuICAgICAgcGFyc2VyOiAoZGF0YSkgPT4ge1xuICAgICAgICBjb25zdCBkZHMgPSBwYXJzZUREUyhkYXRhKVxuICAgICAgICBjb25zdCBpbWFnZSA9IGRkcy5pbWFnZXNbMF1cbiAgICAgICAgcmV0dXJuIHJlZ2wudGV4dHVyZSh7XG4gICAgICAgICAgZm9ybWF0OiAncmdiYSBzM3RjICcgKyBkZHMuZm9ybWF0LFxuICAgICAgICAgIHNoYXBlOiBkZHMuc2hhcGUsXG4gICAgICAgICAgbWFnOiAnbGluZWFyJyxcbiAgICAgICAgICBkYXRhOiBuZXcgVWludDhBcnJheShkYXRhLCBpbWFnZS5vZmZzZXQsIGltYWdlLmxlbmd0aClcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICB9LFxuXG4gICAgc3BlY3VsYXI6IHtcbiAgICAgIHR5cGU6ICdpbWFnZScsXG4gICAgICBzcmM6ICdhc3NldHMvYWxwaW5lX2NsaWZmX2Ffc3BlYy5wbmcnLFxuICAgICAgcGFyc2VyOiAoZGF0YSkgPT4gcmVnbC50ZXh0dXJlKHtcbiAgICAgICAgbWFnOiAnbGluZWFyJyxcbiAgICAgICAgZGF0YTogZGF0YVxuICAgICAgfSlcbiAgICB9LFxuXG4gICAgbm9ybWFsczoge1xuICAgICAgdHlwZTogJ2ltYWdlJyxcbiAgICAgIHNyYzogJ2Fzc2V0cy9hbHBpbmVfY2xpZmZfYV9ub3JtLnBuZycsXG4gICAgICBwYXJzZXI6IChkYXRhKSA9PiByZWdsLnRleHR1cmUoe1xuICAgICAgICBtYWc6ICdsaW5lYXInLFxuICAgICAgICBkYXRhOiBkYXRhXG4gICAgICB9KVxuICAgIH1cbiAgfSxcblxuICBvbkRvbmU6ICh7IGRpZmZ1c2UsIHNwZWN1bGFyLCBub3JtYWxzIH0pID0+IHtcbiAgICBjb25zdCBkcmF3ID0gcmVnbCh7XG4gICAgICBmcmFnOiBgXG4gICAgICBwcmVjaXNpb24gbWVkaXVtcCBmbG9hdDtcbiAgICAgIHVuaWZvcm0gc2FtcGxlcjJEIHNwZWN1bGFyLCBub3JtYWxzLCBkaWZmdXNlO1xuICAgICAgdmFyeWluZyB2ZWMzIGxpZ2h0RGlyLCBleWVEaXI7XG4gICAgICB2YXJ5aW5nIHZlYzIgdXY7XG4gICAgICB2b2lkIG1haW4gKCkge1xuICAgICAgICBmbG9hdCBkID0gbGVuZ3RoKGxpZ2h0RGlyKTtcbiAgICAgICAgdmVjMyBMID0gbm9ybWFsaXplKGxpZ2h0RGlyKTtcbiAgICAgICAgdmVjMyBFID0gbm9ybWFsaXplKGV5ZURpcik7XG4gICAgICAgIHZlYzMgTiA9IG5vcm1hbGl6ZSgyLjAgKiB0ZXh0dXJlMkQobm9ybWFscywgdXYpLnJnYiAtIDEuMCk7XG4gICAgICAgIE4gPSB2ZWMzKC1OLngsIE4ueXopO1xuICAgICAgICB2ZWMzIEQgPSB0ZXh0dXJlMkQoZGlmZnVzZSwgdXYpLnJnYjtcbiAgICAgICAgdmVjMyBrRCA9IEQgKiAoMC4wMSArXG4gICAgICAgICAgbWF4KDAuMCwgZG90KEwsIE4pICogKDAuNiArIDAuOCAvIGQpICkpO1xuICAgICAgICB2ZWMzIFMgPSB0ZXh0dXJlMkQoc3BlY3VsYXIsIHV2KS5yZ2I7XG4gICAgICAgIHZlYzMga1MgPSAyLjAgKiBwb3cobWF4KDAuMCwgZG90KG5vcm1hbGl6ZShOICsgTCksIC1FKSksIDEwLjApICogUztcbiAgICAgICAgZ2xfRnJhZ0NvbG9yID0gdmVjNChrRCArIGtTLCAxKTtcbiAgICAgIH1gLFxuXG4gICAgICB2ZXJ0OiBgXG4gICAgICBwcmVjaXNpb24gbWVkaXVtcCBmbG9hdDtcbiAgICAgIGF0dHJpYnV0ZSB2ZWMyIHBvc2l0aW9uO1xuICAgICAgdW5pZm9ybSB2ZWMyIGxpZ2h0UG9zaXRpb247XG4gICAgICB2YXJ5aW5nIHZlYzMgbGlnaHREaXIsIGV5ZURpcjtcbiAgICAgIHZhcnlpbmcgdmVjMiB1djtcbiAgICAgIHZvaWQgbWFpbiAoKSB7XG4gICAgICAgIHZlYzIgUCA9IDEuMCAtIDIuMCAqIHBvc2l0aW9uO1xuICAgICAgICB1diA9IHZlYzIocG9zaXRpb24ueCwgMS4wIC0gcG9zaXRpb24ueSk7XG4gICAgICAgIGV5ZURpciA9IC12ZWMzKFAsIDEpO1xuICAgICAgICBsaWdodERpciA9IHZlYzMobGlnaHRQb3NpdGlvbiAtIFAsIDEpO1xuICAgICAgICBnbF9Qb3NpdGlvbiA9IHZlYzQoUCwgMCwgMSk7XG4gICAgICB9YCxcblxuICAgICAgYXR0cmlidXRlczoge1xuICAgICAgICBwb3NpdGlvbjogW1xuICAgICAgICAgIC0yLCAwLFxuICAgICAgICAgIDAsIC0yLFxuICAgICAgICAgIDIsIDJcbiAgICAgICAgXVxuICAgICAgfSxcblxuICAgICAgdW5pZm9ybXM6IHtcbiAgICAgICAgc3BlY3VsYXI6IHNwZWN1bGFyLFxuICAgICAgICBub3JtYWxzOiBub3JtYWxzLFxuICAgICAgICBkaWZmdXNlOiBkaWZmdXNlLFxuICAgICAgICBsaWdodFBvc2l0aW9uOiAoe3RpY2t9KSA9PiB7XG4gICAgICAgICAgdmFyIHQgPSAwLjAyNSAqIHRpY2tcbiAgICAgICAgICByZXR1cm4gWzIuMCAqIE1hdGguY29zKHQpLCAyLjAgKiBNYXRoLnNpbih0KV1cbiAgICAgICAgfVxuICAgICAgfSxcblxuICAgICAgY291bnQ6IDNcbiAgICB9KVxuXG4gICAgcmVnbC5mcmFtZSgoKSA9PiB7XG4gICAgICBkcmF3KClcbiAgICB9KVxuICB9XG59KVxuIiwidmFyIEdMX0ZMT0FUID0gNTEyNlxuXG5mdW5jdGlvbiBBdHRyaWJ1dGVSZWNvcmQgKCkge1xuICB0aGlzLnN0YXRlID0gMFxuXG4gIHRoaXMueCA9IDAuMFxuICB0aGlzLnkgPSAwLjBcbiAgdGhpcy56ID0gMC4wXG4gIHRoaXMudyA9IDAuMFxuXG4gIHRoaXMuYnVmZmVyID0gbnVsbFxuICB0aGlzLnNpemUgPSAwXG4gIHRoaXMubm9ybWFsaXplZCA9IGZhbHNlXG4gIHRoaXMudHlwZSA9IEdMX0ZMT0FUXG4gIHRoaXMub2Zmc2V0ID0gMFxuICB0aGlzLnN0cmlkZSA9IDBcbiAgdGhpcy5kaXZpc29yID0gMFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBBdHRyaWJ1dGVTdGF0ZSAoXG4gIGdsLFxuICBleHRlbnNpb25zLFxuICBsaW1pdHMsXG4gIGJ1ZmZlclN0YXRlLFxuICBzdHJpbmdTdG9yZSkge1xuICB2YXIgTlVNX0FUVFJJQlVURVMgPSBsaW1pdHMubWF4QXR0cmlidXRlc1xuICB2YXIgYXR0cmlidXRlQmluZGluZ3MgPSBuZXcgQXJyYXkoTlVNX0FUVFJJQlVURVMpXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgTlVNX0FUVFJJQlVURVM7ICsraSkge1xuICAgIGF0dHJpYnV0ZUJpbmRpbmdzW2ldID0gbmV3IEF0dHJpYnV0ZVJlY29yZCgpXG4gIH1cblxuICByZXR1cm4ge1xuICAgIFJlY29yZDogQXR0cmlidXRlUmVjb3JkLFxuICAgIHNjb3BlOiB7fSxcbiAgICBzdGF0ZTogYXR0cmlidXRlQmluZGluZ3NcbiAgfVxufVxuIiwiXG52YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi91dGlsL2lzLXR5cGVkLWFycmF5JylcbnZhciBpc05EQXJyYXlMaWtlID0gcmVxdWlyZSgnLi91dGlsL2lzLW5kYXJyYXknKVxudmFyIHZhbHVlcyA9IHJlcXVpcmUoJy4vdXRpbC92YWx1ZXMnKVxudmFyIHBvb2wgPSByZXF1aXJlKCcuL3V0aWwvcG9vbCcpXG52YXIgZmxhdHRlblV0aWwgPSByZXF1aXJlKCcuL3V0aWwvZmxhdHRlbicpXG5cbnZhciBhcnJheUZsYXR0ZW4gPSBmbGF0dGVuVXRpbC5mbGF0dGVuXG52YXIgYXJyYXlTaGFwZSA9IGZsYXR0ZW5VdGlsLnNoYXBlXG5cbnZhciBhcnJheVR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvYXJyYXl0eXBlcy5qc29uJylcbnZhciBidWZmZXJUeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL2R0eXBlcy5qc29uJylcbnZhciB1c2FnZVR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvdXNhZ2UuanNvbicpXG5cbnZhciBHTF9TVEFUSUNfRFJBVyA9IDB4ODhFNFxudmFyIEdMX1NUUkVBTV9EUkFXID0gMHg4OEUwXG5cbnZhciBHTF9VTlNJR05FRF9CWVRFID0gNTEyMVxudmFyIEdMX0ZMT0FUID0gNTEyNlxuXG52YXIgRFRZUEVTX1NJWkVTID0gW11cbkRUWVBFU19TSVpFU1s1MTIwXSA9IDEgLy8gaW50OFxuRFRZUEVTX1NJWkVTWzUxMjJdID0gMiAvLyBpbnQxNlxuRFRZUEVTX1NJWkVTWzUxMjRdID0gNCAvLyBpbnQzMlxuRFRZUEVTX1NJWkVTWzUxMjFdID0gMSAvLyB1aW50OFxuRFRZUEVTX1NJWkVTWzUxMjNdID0gMiAvLyB1aW50MTZcbkRUWVBFU19TSVpFU1s1MTI1XSA9IDQgLy8gdWludDMyXG5EVFlQRVNfU0laRVNbNTEyNl0gPSA0IC8vIGZsb2F0MzJcblxuZnVuY3Rpb24gdHlwZWRBcnJheUNvZGUgKGRhdGEpIHtcbiAgcmV0dXJuIGFycmF5VHlwZXNbT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGRhdGEpXSB8IDBcbn1cblxuZnVuY3Rpb24gY29weUFycmF5IChvdXQsIGlucCkge1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGlucC5sZW5ndGg7ICsraSkge1xuICAgIG91dFtpXSA9IGlucFtpXVxuICB9XG59XG5cbmZ1bmN0aW9uIHRyYW5zcG9zZSAoXG4gIHJlc3VsdCwgZGF0YSwgc2hhcGVYLCBzaGFwZVksIHN0cmlkZVgsIHN0cmlkZVksIG9mZnNldCkge1xuICB2YXIgcHRyID0gMFxuICBmb3IgKHZhciBpID0gMDsgaSA8IHNoYXBlWDsgKytpKSB7XG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBzaGFwZVk7ICsraikge1xuICAgICAgcmVzdWx0W3B0cisrXSA9IGRhdGFbc3RyaWRlWCAqIGkgKyBzdHJpZGVZICogaiArIG9mZnNldF1cbiAgICB9XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwQnVmZmVyU3RhdGUgKGdsLCBzdGF0cywgY29uZmlnKSB7XG4gIHZhciBidWZmZXJDb3VudCA9IDBcbiAgdmFyIGJ1ZmZlclNldCA9IHt9XG5cbiAgZnVuY3Rpb24gUkVHTEJ1ZmZlciAodHlwZSkge1xuICAgIHRoaXMuaWQgPSBidWZmZXJDb3VudCsrXG4gICAgdGhpcy5idWZmZXIgPSBnbC5jcmVhdGVCdWZmZXIoKVxuICAgIHRoaXMudHlwZSA9IHR5cGVcbiAgICB0aGlzLnVzYWdlID0gR0xfU1RBVElDX0RSQVdcbiAgICB0aGlzLmJ5dGVMZW5ndGggPSAwXG4gICAgdGhpcy5kaW1lbnNpb24gPSAxXG4gICAgdGhpcy5kdHlwZSA9IEdMX1VOU0lHTkVEX0JZVEVcblxuICAgIHRoaXMucGVyc2lzdGVudERhdGEgPSBudWxsXG5cbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgIHRoaXMuc3RhdHMgPSB7c2l6ZTogMH1cbiAgICB9XG4gIH1cblxuICBSRUdMQnVmZmVyLnByb3RvdHlwZS5iaW5kID0gZnVuY3Rpb24gKCkge1xuICAgIGdsLmJpbmRCdWZmZXIodGhpcy50eXBlLCB0aGlzLmJ1ZmZlcilcbiAgfVxuXG4gIFJFR0xCdWZmZXIucHJvdG90eXBlLmRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7XG4gICAgZGVzdHJveSh0aGlzKVxuICB9XG5cbiAgdmFyIHN0cmVhbVBvb2wgPSBbXVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZVN0cmVhbSAodHlwZSwgZGF0YSkge1xuICAgIHZhciBidWZmZXIgPSBzdHJlYW1Qb29sLnBvcCgpXG4gICAgaWYgKCFidWZmZXIpIHtcbiAgICAgIGJ1ZmZlciA9IG5ldyBSRUdMQnVmZmVyKHR5cGUpXG4gICAgfVxuICAgIGJ1ZmZlci5iaW5kKClcbiAgICBpbml0QnVmZmVyRnJvbURhdGEoYnVmZmVyLCBkYXRhLCBHTF9TVFJFQU1fRFJBVywgMCwgMSwgZmFsc2UpXG4gICAgcmV0dXJuIGJ1ZmZlclxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveVN0cmVhbSAoc3RyZWFtKSB7XG4gICAgc3RyZWFtUG9vbC5wdXNoKHN0cmVhbSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGluaXRCdWZmZXJGcm9tVHlwZWRBcnJheSAoYnVmZmVyLCBkYXRhLCB1c2FnZSkge1xuICAgIGJ1ZmZlci5ieXRlTGVuZ3RoID0gZGF0YS5ieXRlTGVuZ3RoXG4gICAgZ2wuYnVmZmVyRGF0YShidWZmZXIudHlwZSwgZGF0YSwgdXNhZ2UpXG4gIH1cblxuICBmdW5jdGlvbiBpbml0QnVmZmVyRnJvbURhdGEgKGJ1ZmZlciwgZGF0YSwgdXNhZ2UsIGR0eXBlLCBkaW1lbnNpb24sIHBlcnNpc3QpIHtcbiAgICB2YXIgc2hhcGVcbiAgICBidWZmZXIudXNhZ2UgPSB1c2FnZVxuICAgIGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XG4gICAgICBidWZmZXIuZHR5cGUgPSBkdHlwZSB8fCBHTF9GTE9BVFxuICAgICAgaWYgKGRhdGEubGVuZ3RoID4gMCkge1xuICAgICAgICB2YXIgZmxhdERhdGFcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YVswXSkpIHtcbiAgICAgICAgICBzaGFwZSA9IGFycmF5U2hhcGUoZGF0YSlcbiAgICAgICAgICB2YXIgZGltID0gMVxuICAgICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgc2hhcGUubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICAgIGRpbSAqPSBzaGFwZVtpXVxuICAgICAgICAgIH1cbiAgICAgICAgICBidWZmZXIuZGltZW5zaW9uID0gZGltXG4gICAgICAgICAgZmxhdERhdGEgPSBhcnJheUZsYXR0ZW4oZGF0YSwgc2hhcGUsIGJ1ZmZlci5kdHlwZSlcbiAgICAgICAgICBpbml0QnVmZmVyRnJvbVR5cGVkQXJyYXkoYnVmZmVyLCBmbGF0RGF0YSwgdXNhZ2UpXG4gICAgICAgICAgaWYgKHBlcnNpc3QpIHtcbiAgICAgICAgICAgIGJ1ZmZlci5wZXJzaXN0ZW50RGF0YSA9IGZsYXREYXRhXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBvb2wuZnJlZVR5cGUoZmxhdERhdGEpXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBkYXRhWzBdID09PSAnbnVtYmVyJykge1xuICAgICAgICAgIGJ1ZmZlci5kaW1lbnNpb24gPSBkaW1lbnNpb25cbiAgICAgICAgICB2YXIgdHlwZWREYXRhID0gcG9vbC5hbGxvY1R5cGUoYnVmZmVyLmR0eXBlLCBkYXRhLmxlbmd0aClcbiAgICAgICAgICBjb3B5QXJyYXkodHlwZWREYXRhLCBkYXRhKVxuICAgICAgICAgIGluaXRCdWZmZXJGcm9tVHlwZWRBcnJheShidWZmZXIsIHR5cGVkRGF0YSwgdXNhZ2UpXG4gICAgICAgICAgaWYgKHBlcnNpc3QpIHtcbiAgICAgICAgICAgIGJ1ZmZlci5wZXJzaXN0ZW50RGF0YSA9IHR5cGVkRGF0YVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwb29sLmZyZWVUeXBlKHR5cGVkRGF0YSlcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoaXNUeXBlZEFycmF5KGRhdGFbMF0pKSB7XG4gICAgICAgICAgYnVmZmVyLmRpbWVuc2lvbiA9IGRhdGFbMF0ubGVuZ3RoXG4gICAgICAgICAgYnVmZmVyLmR0eXBlID0gZHR5cGUgfHwgdHlwZWRBcnJheUNvZGUoZGF0YVswXSkgfHwgR0xfRkxPQVRcbiAgICAgICAgICBmbGF0RGF0YSA9IGFycmF5RmxhdHRlbihcbiAgICAgICAgICAgIGRhdGEsXG4gICAgICAgICAgICBbZGF0YS5sZW5ndGgsIGRhdGFbMF0ubGVuZ3RoXSxcbiAgICAgICAgICAgIGJ1ZmZlci5kdHlwZSlcbiAgICAgICAgICBpbml0QnVmZmVyRnJvbVR5cGVkQXJyYXkoYnVmZmVyLCBmbGF0RGF0YSwgdXNhZ2UpXG4gICAgICAgICAgaWYgKHBlcnNpc3QpIHtcbiAgICAgICAgICAgIGJ1ZmZlci5wZXJzaXN0ZW50RGF0YSA9IGZsYXREYXRhXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBvb2wuZnJlZVR5cGUoZmxhdERhdGEpXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIFxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChpc1R5cGVkQXJyYXkoZGF0YSkpIHtcbiAgICAgIGJ1ZmZlci5kdHlwZSA9IGR0eXBlIHx8IHR5cGVkQXJyYXlDb2RlKGRhdGEpXG4gICAgICBidWZmZXIuZGltZW5zaW9uID0gZGltZW5zaW9uXG4gICAgICBpbml0QnVmZmVyRnJvbVR5cGVkQXJyYXkoYnVmZmVyLCBkYXRhLCB1c2FnZSlcbiAgICAgIGlmIChwZXJzaXN0KSB7XG4gICAgICAgIGJ1ZmZlci5wZXJzaXN0ZW50RGF0YSA9IG5ldyBVaW50OEFycmF5KG5ldyBVaW50OEFycmF5KGRhdGEuYnVmZmVyKSlcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGlzTkRBcnJheUxpa2UoZGF0YSkpIHtcbiAgICAgIHNoYXBlID0gZGF0YS5zaGFwZVxuICAgICAgdmFyIHN0cmlkZSA9IGRhdGEuc3RyaWRlXG4gICAgICB2YXIgb2Zmc2V0ID0gZGF0YS5vZmZzZXRcblxuICAgICAgdmFyIHNoYXBlWCA9IDBcbiAgICAgIHZhciBzaGFwZVkgPSAwXG4gICAgICB2YXIgc3RyaWRlWCA9IDBcbiAgICAgIHZhciBzdHJpZGVZID0gMFxuICAgICAgaWYgKHNoYXBlLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICBzaGFwZVggPSBzaGFwZVswXVxuICAgICAgICBzaGFwZVkgPSAxXG4gICAgICAgIHN0cmlkZVggPSBzdHJpZGVbMF1cbiAgICAgICAgc3RyaWRlWSA9IDBcbiAgICAgIH0gZWxzZSBpZiAoc2hhcGUubGVuZ3RoID09PSAyKSB7XG4gICAgICAgIHNoYXBlWCA9IHNoYXBlWzBdXG4gICAgICAgIHNoYXBlWSA9IHNoYXBlWzFdXG4gICAgICAgIHN0cmlkZVggPSBzdHJpZGVbMF1cbiAgICAgICAgc3RyaWRlWSA9IHN0cmlkZVsxXVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgXG4gICAgICB9XG5cbiAgICAgIGJ1ZmZlci5kdHlwZSA9IGR0eXBlIHx8IHR5cGVkQXJyYXlDb2RlKGRhdGEuZGF0YSkgfHwgR0xfRkxPQVRcbiAgICAgIGJ1ZmZlci5kaW1lbnNpb24gPSBzaGFwZVlcblxuICAgICAgdmFyIHRyYW5zcG9zZURhdGEgPSBwb29sLmFsbG9jVHlwZShidWZmZXIuZHR5cGUsIHNoYXBlWCAqIHNoYXBlWSlcbiAgICAgIHRyYW5zcG9zZSh0cmFuc3Bvc2VEYXRhLFxuICAgICAgICBkYXRhLmRhdGEsXG4gICAgICAgIHNoYXBlWCwgc2hhcGVZLFxuICAgICAgICBzdHJpZGVYLCBzdHJpZGVZLFxuICAgICAgICBvZmZzZXQpXG4gICAgICBpbml0QnVmZmVyRnJvbVR5cGVkQXJyYXkoYnVmZmVyLCB0cmFuc3Bvc2VEYXRhLCB1c2FnZSlcbiAgICAgIGlmIChwZXJzaXN0KSB7XG4gICAgICAgIGJ1ZmZlci5wZXJzaXN0ZW50RGF0YSA9IHRyYW5zcG9zZURhdGFcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBvb2wuZnJlZVR5cGUodHJhbnNwb3NlRGF0YSlcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSAoYnVmZmVyKSB7XG4gICAgc3RhdHMuYnVmZmVyQ291bnQtLVxuXG4gICAgdmFyIGhhbmRsZSA9IGJ1ZmZlci5idWZmZXJcbiAgICBcbiAgICBnbC5kZWxldGVCdWZmZXIoaGFuZGxlKVxuICAgIGJ1ZmZlci5idWZmZXIgPSBudWxsXG4gICAgZGVsZXRlIGJ1ZmZlclNldFtidWZmZXIuaWRdXG4gIH1cblxuICBmdW5jdGlvbiBjcmVhdGVCdWZmZXIgKG9wdGlvbnMsIHR5cGUsIGRlZmVySW5pdCwgcGVyc2lzdGVudCkge1xuICAgIHN0YXRzLmJ1ZmZlckNvdW50KytcblxuICAgIHZhciBidWZmZXIgPSBuZXcgUkVHTEJ1ZmZlcih0eXBlKVxuICAgIGJ1ZmZlclNldFtidWZmZXIuaWRdID0gYnVmZmVyXG5cbiAgICBmdW5jdGlvbiByZWdsQnVmZmVyIChvcHRpb25zKSB7XG4gICAgICB2YXIgdXNhZ2UgPSBHTF9TVEFUSUNfRFJBV1xuICAgICAgdmFyIGRhdGEgPSBudWxsXG4gICAgICB2YXIgYnl0ZUxlbmd0aCA9IDBcbiAgICAgIHZhciBkdHlwZSA9IDBcbiAgICAgIHZhciBkaW1lbnNpb24gPSAxXG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShvcHRpb25zKSB8fFxuICAgICAgICAgIGlzVHlwZWRBcnJheShvcHRpb25zKSB8fFxuICAgICAgICAgIGlzTkRBcnJheUxpa2Uob3B0aW9ucykpIHtcbiAgICAgICAgZGF0YSA9IG9wdGlvbnNcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIG9wdGlvbnMgPT09ICdudW1iZXInKSB7XG4gICAgICAgIGJ5dGVMZW5ndGggPSBvcHRpb25zIHwgMFxuICAgICAgfSBlbHNlIGlmIChvcHRpb25zKSB7XG4gICAgICAgIFxuXG4gICAgICAgIGlmICgnZGF0YScgaW4gb3B0aW9ucykge1xuICAgICAgICAgIFxuICAgICAgICAgIGRhdGEgPSBvcHRpb25zLmRhdGFcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgndXNhZ2UnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBcbiAgICAgICAgICB1c2FnZSA9IHVzYWdlVHlwZXNbb3B0aW9ucy51c2FnZV1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgndHlwZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgIFxuICAgICAgICAgIGR0eXBlID0gYnVmZmVyVHlwZXNbb3B0aW9ucy50eXBlXVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdkaW1lbnNpb24nIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBcbiAgICAgICAgICBkaW1lbnNpb24gPSBvcHRpb25zLmRpbWVuc2lvbiB8IDBcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnbGVuZ3RoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgXG4gICAgICAgICAgYnl0ZUxlbmd0aCA9IG9wdGlvbnMubGVuZ3RoIHwgMFxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGJ1ZmZlci5iaW5kKClcbiAgICAgIGlmICghZGF0YSkge1xuICAgICAgICBnbC5idWZmZXJEYXRhKGJ1ZmZlci50eXBlLCBieXRlTGVuZ3RoLCB1c2FnZSlcbiAgICAgICAgYnVmZmVyLmR0eXBlID0gZHR5cGUgfHwgR0xfVU5TSUdORURfQllURVxuICAgICAgICBidWZmZXIudXNhZ2UgPSB1c2FnZVxuICAgICAgICBidWZmZXIuZGltZW5zaW9uID0gZGltZW5zaW9uXG4gICAgICAgIGJ1ZmZlci5ieXRlTGVuZ3RoID0gYnl0ZUxlbmd0aFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaW5pdEJ1ZmZlckZyb21EYXRhKGJ1ZmZlciwgZGF0YSwgdXNhZ2UsIGR0eXBlLCBkaW1lbnNpb24sIHBlcnNpc3RlbnQpXG4gICAgICB9XG5cbiAgICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgICBidWZmZXIuc3RhdHMuc2l6ZSA9IGJ1ZmZlci5ieXRlTGVuZ3RoICogRFRZUEVTX1NJWkVTW2J1ZmZlci5kdHlwZV1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJlZ2xCdWZmZXJcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzZXRTdWJEYXRhIChkYXRhLCBvZmZzZXQpIHtcbiAgICAgIFxuXG4gICAgICBnbC5idWZmZXJTdWJEYXRhKGJ1ZmZlci50eXBlLCBvZmZzZXQsIGRhdGEpXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc3ViZGF0YSAoZGF0YSwgb2Zmc2V0Xykge1xuICAgICAgdmFyIG9mZnNldCA9IChvZmZzZXRfIHx8IDApIHwgMFxuICAgICAgdmFyIHNoYXBlXG4gICAgICBidWZmZXIuYmluZCgpXG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShkYXRhKSkge1xuICAgICAgICBpZiAoZGF0YS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiBkYXRhWzBdID09PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgdmFyIGNvbnZlcnRlZCA9IHBvb2wuYWxsb2NUeXBlKGJ1ZmZlci5kdHlwZSwgZGF0YS5sZW5ndGgpXG4gICAgICAgICAgICBjb3B5QXJyYXkoY29udmVydGVkLCBkYXRhKVxuICAgICAgICAgICAgc2V0U3ViRGF0YShjb252ZXJ0ZWQsIG9mZnNldClcbiAgICAgICAgICAgIHBvb2wuZnJlZVR5cGUoY29udmVydGVkKVxuICAgICAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShkYXRhWzBdKSB8fCBpc1R5cGVkQXJyYXkoZGF0YVswXSkpIHtcbiAgICAgICAgICAgIHNoYXBlID0gYXJyYXlTaGFwZShkYXRhKVxuICAgICAgICAgICAgdmFyIGZsYXREYXRhID0gYXJyYXlGbGF0dGVuKGRhdGEsIHNoYXBlLCBidWZmZXIuZHR5cGUpXG4gICAgICAgICAgICBzZXRTdWJEYXRhKGZsYXREYXRhLCBvZmZzZXQpXG4gICAgICAgICAgICBwb29sLmZyZWVUeXBlKGZsYXREYXRhKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoaXNUeXBlZEFycmF5KGRhdGEpKSB7XG4gICAgICAgIHNldFN1YkRhdGEoZGF0YSwgb2Zmc2V0KVxuICAgICAgfSBlbHNlIGlmIChpc05EQXJyYXlMaWtlKGRhdGEpKSB7XG4gICAgICAgIHNoYXBlID0gZGF0YS5zaGFwZVxuICAgICAgICB2YXIgc3RyaWRlID0gZGF0YS5zdHJpZGVcblxuICAgICAgICB2YXIgc2hhcGVYID0gMFxuICAgICAgICB2YXIgc2hhcGVZID0gMFxuICAgICAgICB2YXIgc3RyaWRlWCA9IDBcbiAgICAgICAgdmFyIHN0cmlkZVkgPSAwXG4gICAgICAgIGlmIChzaGFwZS5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICBzaGFwZVggPSBzaGFwZVswXVxuICAgICAgICAgIHNoYXBlWSA9IDFcbiAgICAgICAgICBzdHJpZGVYID0gc3RyaWRlWzBdXG4gICAgICAgICAgc3RyaWRlWSA9IDBcbiAgICAgICAgfSBlbHNlIGlmIChzaGFwZS5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgICBzaGFwZVggPSBzaGFwZVswXVxuICAgICAgICAgIHNoYXBlWSA9IHNoYXBlWzFdXG4gICAgICAgICAgc3RyaWRlWCA9IHN0cmlkZVswXVxuICAgICAgICAgIHN0cmlkZVkgPSBzdHJpZGVbMV1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBcbiAgICAgICAgfVxuICAgICAgICB2YXIgZHR5cGUgPSBBcnJheS5pc0FycmF5KGRhdGEuZGF0YSlcbiAgICAgICAgICA/IGJ1ZmZlci5kdHlwZVxuICAgICAgICAgIDogdHlwZWRBcnJheUNvZGUoZGF0YS5kYXRhKVxuXG4gICAgICAgIHZhciB0cmFuc3Bvc2VEYXRhID0gcG9vbC5hbGxvY1R5cGUoZHR5cGUsIHNoYXBlWCAqIHNoYXBlWSlcbiAgICAgICAgdHJhbnNwb3NlKHRyYW5zcG9zZURhdGEsXG4gICAgICAgICAgZGF0YS5kYXRhLFxuICAgICAgICAgIHNoYXBlWCwgc2hhcGVZLFxuICAgICAgICAgIHN0cmlkZVgsIHN0cmlkZVksXG4gICAgICAgICAgZGF0YS5vZmZzZXQpXG4gICAgICAgIHNldFN1YkRhdGEodHJhbnNwb3NlRGF0YSwgb2Zmc2V0KVxuICAgICAgICBwb29sLmZyZWVUeXBlKHRyYW5zcG9zZURhdGEpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBcbiAgICAgIH1cbiAgICAgIHJldHVybiByZWdsQnVmZmVyXG4gICAgfVxuXG4gICAgaWYgKCFkZWZlckluaXQpIHtcbiAgICAgIHJlZ2xCdWZmZXIob3B0aW9ucylcbiAgICB9XG5cbiAgICByZWdsQnVmZmVyLl9yZWdsVHlwZSA9ICdidWZmZXInXG4gICAgcmVnbEJ1ZmZlci5fYnVmZmVyID0gYnVmZmVyXG4gICAgcmVnbEJ1ZmZlci5zdWJkYXRhID0gc3ViZGF0YVxuICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgcmVnbEJ1ZmZlci5zdGF0cyA9IGJ1ZmZlci5zdGF0c1xuICAgIH1cbiAgICByZWdsQnVmZmVyLmRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7IGRlc3Ryb3koYnVmZmVyKSB9XG5cbiAgICByZXR1cm4gcmVnbEJ1ZmZlclxuICB9XG5cbiAgZnVuY3Rpb24gcmVzdG9yZUJ1ZmZlcnMgKCkge1xuICAgIHZhbHVlcyhidWZmZXJTZXQpLmZvckVhY2goZnVuY3Rpb24gKGJ1ZmZlcikge1xuICAgICAgYnVmZmVyLmJ1ZmZlciA9IGdsLmNyZWF0ZUJ1ZmZlcigpXG4gICAgICBnbC5iaW5kQnVmZmVyKGJ1ZmZlci50eXBlLCBidWZmZXIuYnVmZmVyKVxuICAgICAgZ2wuYnVmZmVyRGF0YShcbiAgICAgICAgYnVmZmVyLnR5cGUsIGJ1ZmZlci5wZXJzaXN0ZW50RGF0YSB8fCBidWZmZXIuYnl0ZUxlbmd0aCwgYnVmZmVyLnVzYWdlKVxuICAgIH0pXG4gIH1cblxuICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICBzdGF0cy5nZXRUb3RhbEJ1ZmZlclNpemUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgdG90YWwgPSAwXG4gICAgICAvLyBUT0RPOiBSaWdodCBub3csIHRoZSBzdHJlYW1zIGFyZSBub3QgcGFydCBvZiB0aGUgdG90YWwgY291bnQuXG4gICAgICBPYmplY3Qua2V5cyhidWZmZXJTZXQpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgICB0b3RhbCArPSBidWZmZXJTZXRba2V5XS5zdGF0cy5zaXplXG4gICAgICB9KVxuICAgICAgcmV0dXJuIHRvdGFsXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjcmVhdGU6IGNyZWF0ZUJ1ZmZlcixcblxuICAgIGNyZWF0ZVN0cmVhbTogY3JlYXRlU3RyZWFtLFxuICAgIGRlc3Ryb3lTdHJlYW06IGRlc3Ryb3lTdHJlYW0sXG5cbiAgICBjbGVhcjogZnVuY3Rpb24gKCkge1xuICAgICAgdmFsdWVzKGJ1ZmZlclNldCkuZm9yRWFjaChkZXN0cm95KVxuICAgICAgc3RyZWFtUG9vbC5mb3JFYWNoKGRlc3Ryb3kpXG4gICAgfSxcblxuICAgIGdldEJ1ZmZlcjogZnVuY3Rpb24gKHdyYXBwZXIpIHtcbiAgICAgIGlmICh3cmFwcGVyICYmIHdyYXBwZXIuX2J1ZmZlciBpbnN0YW5jZW9mIFJFR0xCdWZmZXIpIHtcbiAgICAgICAgcmV0dXJuIHdyYXBwZXIuX2J1ZmZlclxuICAgICAgfVxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9LFxuXG4gICAgcmVzdG9yZTogcmVzdG9yZUJ1ZmZlcnMsXG5cbiAgICBfaW5pdEJ1ZmZlcjogaW5pdEJ1ZmZlckZyb21EYXRhXG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgXCJbb2JqZWN0IEludDhBcnJheV1cIjogNTEyMFxuLCBcIltvYmplY3QgSW50MTZBcnJheV1cIjogNTEyMlxuLCBcIltvYmplY3QgSW50MzJBcnJheV1cIjogNTEyNFxuLCBcIltvYmplY3QgVWludDhBcnJheV1cIjogNTEyMVxuLCBcIltvYmplY3QgVWludDhDbGFtcGVkQXJyYXldXCI6IDUxMjFcbiwgXCJbb2JqZWN0IFVpbnQxNkFycmF5XVwiOiA1MTIzXG4sIFwiW29iamVjdCBVaW50MzJBcnJheV1cIjogNTEyNVxuLCBcIltvYmplY3QgRmxvYXQzMkFycmF5XVwiOiA1MTI2XG4sIFwiW29iamVjdCBGbG9hdDY0QXJyYXldXCI6IDUxMjFcbiwgXCJbb2JqZWN0IEFycmF5QnVmZmVyXVwiOiA1MTIxXG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gIFwiaW50OFwiOiA1MTIwXG4sIFwiaW50MTZcIjogNTEyMlxuLCBcImludDMyXCI6IDUxMjRcbiwgXCJ1aW50OFwiOiA1MTIxXG4sIFwidWludDE2XCI6IDUxMjNcbiwgXCJ1aW50MzJcIjogNTEyNVxuLCBcImZsb2F0XCI6IDUxMjZcbiwgXCJmbG9hdDMyXCI6IDUxMjZcbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgXCJwb2ludHNcIjogMCxcbiAgXCJwb2ludFwiOiAwLFxuICBcImxpbmVzXCI6IDEsXG4gIFwibGluZVwiOiAxLFxuICBcImxpbmUgbG9vcFwiOiAyLFxuICBcImxpbmUgc3RyaXBcIjogMyxcbiAgXCJ0cmlhbmdsZXNcIjogNCxcbiAgXCJ0cmlhbmdsZVwiOiA0LFxuICBcInRyaWFuZ2xlIHN0cmlwXCI6IDUsXG4gIFwidHJpYW5nbGUgZmFuXCI6IDZcbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgXCJzdGF0aWNcIjogMzUwNDQsXG4gIFwiZHluYW1pY1wiOiAzNTA0OCxcbiAgXCJzdHJlYW1cIjogMzUwNDBcbn1cbiIsIlxudmFyIGNyZWF0ZUVudmlyb25tZW50ID0gcmVxdWlyZSgnLi91dGlsL2NvZGVnZW4nKVxudmFyIGxvb3AgPSByZXF1aXJlKCcuL3V0aWwvbG9vcCcpXG52YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi91dGlsL2lzLXR5cGVkLWFycmF5JylcbnZhciBpc05EQXJyYXkgPSByZXF1aXJlKCcuL3V0aWwvaXMtbmRhcnJheScpXG52YXIgaXNBcnJheUxpa2UgPSByZXF1aXJlKCcuL3V0aWwvaXMtYXJyYXktbGlrZScpXG52YXIgZHluYW1pYyA9IHJlcXVpcmUoJy4vZHluYW1pYycpXG5cbnZhciBwcmltVHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9wcmltaXRpdmVzLmpzb24nKVxudmFyIGdsVHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9kdHlwZXMuanNvbicpXG5cbi8vIFwiY3V0ZVwiIG5hbWVzIGZvciB2ZWN0b3IgY29tcG9uZW50c1xudmFyIENVVEVfQ09NUE9ORU5UUyA9ICd4eXp3Jy5zcGxpdCgnJylcblxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSA1MTIxXG5cbnZhciBBVFRSSUJfU1RBVEVfUE9JTlRFUiA9IDFcbnZhciBBVFRSSUJfU1RBVEVfQ09OU1RBTlQgPSAyXG5cbnZhciBEWU5fRlVOQyA9IDBcbnZhciBEWU5fUFJPUCA9IDFcbnZhciBEWU5fQ09OVEVYVCA9IDJcbnZhciBEWU5fU1RBVEUgPSAzXG52YXIgRFlOX1RIVU5LID0gNFxuXG52YXIgU19ESVRIRVIgPSAnZGl0aGVyJ1xudmFyIFNfQkxFTkRfRU5BQkxFID0gJ2JsZW5kLmVuYWJsZSdcbnZhciBTX0JMRU5EX0NPTE9SID0gJ2JsZW5kLmNvbG9yJ1xudmFyIFNfQkxFTkRfRVFVQVRJT04gPSAnYmxlbmQuZXF1YXRpb24nXG52YXIgU19CTEVORF9GVU5DID0gJ2JsZW5kLmZ1bmMnXG52YXIgU19ERVBUSF9FTkFCTEUgPSAnZGVwdGguZW5hYmxlJ1xudmFyIFNfREVQVEhfRlVOQyA9ICdkZXB0aC5mdW5jJ1xudmFyIFNfREVQVEhfUkFOR0UgPSAnZGVwdGgucmFuZ2UnXG52YXIgU19ERVBUSF9NQVNLID0gJ2RlcHRoLm1hc2snXG52YXIgU19DT0xPUl9NQVNLID0gJ2NvbG9yTWFzaydcbnZhciBTX0NVTExfRU5BQkxFID0gJ2N1bGwuZW5hYmxlJ1xudmFyIFNfQ1VMTF9GQUNFID0gJ2N1bGwuZmFjZSdcbnZhciBTX0ZST05UX0ZBQ0UgPSAnZnJvbnRGYWNlJ1xudmFyIFNfTElORV9XSURUSCA9ICdsaW5lV2lkdGgnXG52YXIgU19QT0xZR09OX09GRlNFVF9FTkFCTEUgPSAncG9seWdvbk9mZnNldC5lbmFibGUnXG52YXIgU19QT0xZR09OX09GRlNFVF9PRkZTRVQgPSAncG9seWdvbk9mZnNldC5vZmZzZXQnXG52YXIgU19TQU1QTEVfQUxQSEEgPSAnc2FtcGxlLmFscGhhJ1xudmFyIFNfU0FNUExFX0VOQUJMRSA9ICdzYW1wbGUuZW5hYmxlJ1xudmFyIFNfU0FNUExFX0NPVkVSQUdFID0gJ3NhbXBsZS5jb3ZlcmFnZSdcbnZhciBTX1NURU5DSUxfRU5BQkxFID0gJ3N0ZW5jaWwuZW5hYmxlJ1xudmFyIFNfU1RFTkNJTF9NQVNLID0gJ3N0ZW5jaWwubWFzaydcbnZhciBTX1NURU5DSUxfRlVOQyA9ICdzdGVuY2lsLmZ1bmMnXG52YXIgU19TVEVOQ0lMX09QRlJPTlQgPSAnc3RlbmNpbC5vcEZyb250J1xudmFyIFNfU1RFTkNJTF9PUEJBQ0sgPSAnc3RlbmNpbC5vcEJhY2snXG52YXIgU19TQ0lTU09SX0VOQUJMRSA9ICdzY2lzc29yLmVuYWJsZSdcbnZhciBTX1NDSVNTT1JfQk9YID0gJ3NjaXNzb3IuYm94J1xudmFyIFNfVklFV1BPUlQgPSAndmlld3BvcnQnXG5cbnZhciBTX1BST0ZJTEUgPSAncHJvZmlsZSdcblxudmFyIFNfRlJBTUVCVUZGRVIgPSAnZnJhbWVidWZmZXInXG52YXIgU19WRVJUID0gJ3ZlcnQnXG52YXIgU19GUkFHID0gJ2ZyYWcnXG52YXIgU19FTEVNRU5UUyA9ICdlbGVtZW50cydcbnZhciBTX1BSSU1JVElWRSA9ICdwcmltaXRpdmUnXG52YXIgU19DT1VOVCA9ICdjb3VudCdcbnZhciBTX09GRlNFVCA9ICdvZmZzZXQnXG52YXIgU19JTlNUQU5DRVMgPSAnaW5zdGFuY2VzJ1xuXG52YXIgU1VGRklYX1dJRFRIID0gJ1dpZHRoJ1xudmFyIFNVRkZJWF9IRUlHSFQgPSAnSGVpZ2h0J1xuXG52YXIgU19GUkFNRUJVRkZFUl9XSURUSCA9IFNfRlJBTUVCVUZGRVIgKyBTVUZGSVhfV0lEVEhcbnZhciBTX0ZSQU1FQlVGRkVSX0hFSUdIVCA9IFNfRlJBTUVCVUZGRVIgKyBTVUZGSVhfSEVJR0hUXG52YXIgU19WSUVXUE9SVF9XSURUSCA9IFNfVklFV1BPUlQgKyBTVUZGSVhfV0lEVEhcbnZhciBTX1ZJRVdQT1JUX0hFSUdIVCA9IFNfVklFV1BPUlQgKyBTVUZGSVhfSEVJR0hUXG52YXIgU19EUkFXSU5HQlVGRkVSID0gJ2RyYXdpbmdCdWZmZXInXG52YXIgU19EUkFXSU5HQlVGRkVSX1dJRFRIID0gU19EUkFXSU5HQlVGRkVSICsgU1VGRklYX1dJRFRIXG52YXIgU19EUkFXSU5HQlVGRkVSX0hFSUdIVCA9IFNfRFJBV0lOR0JVRkZFUiArIFNVRkZJWF9IRUlHSFRcblxudmFyIE5FU1RFRF9PUFRJT05TID0gW1xuICBTX0JMRU5EX0ZVTkMsXG4gIFNfQkxFTkRfRVFVQVRJT04sXG4gIFNfU1RFTkNJTF9GVU5DLFxuICBTX1NURU5DSUxfT1BGUk9OVCxcbiAgU19TVEVOQ0lMX09QQkFDSyxcbiAgU19TQU1QTEVfQ09WRVJBR0UsXG4gIFNfVklFV1BPUlQsXG4gIFNfU0NJU1NPUl9CT1gsXG4gIFNfUE9MWUdPTl9PRkZTRVRfT0ZGU0VUXG5dXG5cbnZhciBHTF9BUlJBWV9CVUZGRVIgPSAzNDk2MlxudmFyIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSID0gMzQ5NjNcblxudmFyIEdMX0ZSQUdNRU5UX1NIQURFUiA9IDM1NjMyXG52YXIgR0xfVkVSVEVYX1NIQURFUiA9IDM1NjMzXG5cbnZhciBHTF9URVhUVVJFXzJEID0gMHgwREUxXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUCA9IDB4ODUxM1xuXG52YXIgR0xfQ1VMTF9GQUNFID0gMHgwQjQ0XG52YXIgR0xfQkxFTkQgPSAweDBCRTJcbnZhciBHTF9ESVRIRVIgPSAweDBCRDBcbnZhciBHTF9TVEVOQ0lMX1RFU1QgPSAweDBCOTBcbnZhciBHTF9ERVBUSF9URVNUID0gMHgwQjcxXG52YXIgR0xfU0NJU1NPUl9URVNUID0gMHgwQzExXG52YXIgR0xfUE9MWUdPTl9PRkZTRVRfRklMTCA9IDB4ODAzN1xudmFyIEdMX1NBTVBMRV9BTFBIQV9UT19DT1ZFUkFHRSA9IDB4ODA5RVxudmFyIEdMX1NBTVBMRV9DT1ZFUkFHRSA9IDB4ODBBMFxuXG52YXIgR0xfRkxPQVQgPSA1MTI2XG52YXIgR0xfRkxPQVRfVkVDMiA9IDM1NjY0XG52YXIgR0xfRkxPQVRfVkVDMyA9IDM1NjY1XG52YXIgR0xfRkxPQVRfVkVDNCA9IDM1NjY2XG52YXIgR0xfSU5UID0gNTEyNFxudmFyIEdMX0lOVF9WRUMyID0gMzU2NjdcbnZhciBHTF9JTlRfVkVDMyA9IDM1NjY4XG52YXIgR0xfSU5UX1ZFQzQgPSAzNTY2OVxudmFyIEdMX0JPT0wgPSAzNTY3MFxudmFyIEdMX0JPT0xfVkVDMiA9IDM1NjcxXG52YXIgR0xfQk9PTF9WRUMzID0gMzU2NzJcbnZhciBHTF9CT09MX1ZFQzQgPSAzNTY3M1xudmFyIEdMX0ZMT0FUX01BVDIgPSAzNTY3NFxudmFyIEdMX0ZMT0FUX01BVDMgPSAzNTY3NVxudmFyIEdMX0ZMT0FUX01BVDQgPSAzNTY3NlxudmFyIEdMX1NBTVBMRVJfMkQgPSAzNTY3OFxudmFyIEdMX1NBTVBMRVJfQ1VCRSA9IDM1NjgwXG5cbnZhciBHTF9UUklBTkdMRVMgPSA0XG5cbnZhciBHTF9GUk9OVCA9IDEwMjhcbnZhciBHTF9CQUNLID0gMTAyOVxudmFyIEdMX0NXID0gMHgwOTAwXG52YXIgR0xfQ0NXID0gMHgwOTAxXG52YXIgR0xfTUlOX0VYVCA9IDB4ODAwN1xudmFyIEdMX01BWF9FWFQgPSAweDgwMDhcbnZhciBHTF9BTFdBWVMgPSA1MTlcbnZhciBHTF9LRUVQID0gNzY4MFxudmFyIEdMX1pFUk8gPSAwXG52YXIgR0xfT05FID0gMVxudmFyIEdMX0ZVTkNfQUREID0gMHg4MDA2XG52YXIgR0xfTEVTUyA9IDUxM1xuXG52YXIgR0xfRlJBTUVCVUZGRVIgPSAweDhENDBcbnZhciBHTF9DT0xPUl9BVFRBQ0hNRU5UMCA9IDB4OENFMFxuXG52YXIgYmxlbmRGdW5jcyA9IHtcbiAgJzAnOiAwLFxuICAnMSc6IDEsXG4gICd6ZXJvJzogMCxcbiAgJ29uZSc6IDEsXG4gICdzcmMgY29sb3InOiA3NjgsXG4gICdvbmUgbWludXMgc3JjIGNvbG9yJzogNzY5LFxuICAnc3JjIGFscGhhJzogNzcwLFxuICAnb25lIG1pbnVzIHNyYyBhbHBoYSc6IDc3MSxcbiAgJ2RzdCBjb2xvcic6IDc3NCxcbiAgJ29uZSBtaW51cyBkc3QgY29sb3InOiA3NzUsXG4gICdkc3QgYWxwaGEnOiA3NzIsXG4gICdvbmUgbWludXMgZHN0IGFscGhhJzogNzczLFxuICAnY29uc3RhbnQgY29sb3InOiAzMjc2OSxcbiAgJ29uZSBtaW51cyBjb25zdGFudCBjb2xvcic6IDMyNzcwLFxuICAnY29uc3RhbnQgYWxwaGEnOiAzMjc3MSxcbiAgJ29uZSBtaW51cyBjb25zdGFudCBhbHBoYSc6IDMyNzcyLFxuICAnc3JjIGFscGhhIHNhdHVyYXRlJzogNzc2XG59XG5cbi8vIFRoZXJlIGFyZSBpbnZhbGlkIHZhbHVlcyBmb3Igc3JjUkdCIGFuZCBkc3RSR0IuIFNlZTpcbi8vIGh0dHBzOi8vd3d3Lmtocm9ub3Mub3JnL3JlZ2lzdHJ5L3dlYmdsL3NwZWNzLzEuMC8jNi4xM1xuLy8gaHR0cHM6Ly9naXRodWIuY29tL0tocm9ub3NHcm91cC9XZWJHTC9ibG9iLzBkMzIwMWY1ZjdlYzNjMDA2MGJjMWYwNDA3NzQ2MTU0MWYxOTg3YjkvY29uZm9ybWFuY2Utc3VpdGVzLzEuMC4zL2NvbmZvcm1hbmNlL21pc2Mvd2ViZ2wtc3BlY2lmaWMuaHRtbCNMNTZcbnZhciBpbnZhbGlkQmxlbmRDb21iaW5hdGlvbnMgPSBbXG4gICdjb25zdGFudCBjb2xvciwgY29uc3RhbnQgYWxwaGEnLFxuICAnb25lIG1pbnVzIGNvbnN0YW50IGNvbG9yLCBjb25zdGFudCBhbHBoYScsXG4gICdjb25zdGFudCBjb2xvciwgb25lIG1pbnVzIGNvbnN0YW50IGFscGhhJyxcbiAgJ29uZSBtaW51cyBjb25zdGFudCBjb2xvciwgb25lIG1pbnVzIGNvbnN0YW50IGFscGhhJyxcbiAgJ2NvbnN0YW50IGFscGhhLCBjb25zdGFudCBjb2xvcicsXG4gICdjb25zdGFudCBhbHBoYSwgb25lIG1pbnVzIGNvbnN0YW50IGNvbG9yJyxcbiAgJ29uZSBtaW51cyBjb25zdGFudCBhbHBoYSwgY29uc3RhbnQgY29sb3InLFxuICAnb25lIG1pbnVzIGNvbnN0YW50IGFscGhhLCBvbmUgbWludXMgY29uc3RhbnQgY29sb3InXG5dXG5cbnZhciBjb21wYXJlRnVuY3MgPSB7XG4gICduZXZlcic6IDUxMixcbiAgJ2xlc3MnOiA1MTMsXG4gICc8JzogNTEzLFxuICAnZXF1YWwnOiA1MTQsXG4gICc9JzogNTE0LFxuICAnPT0nOiA1MTQsXG4gICc9PT0nOiA1MTQsXG4gICdsZXF1YWwnOiA1MTUsXG4gICc8PSc6IDUxNSxcbiAgJ2dyZWF0ZXInOiA1MTYsXG4gICc+JzogNTE2LFxuICAnbm90ZXF1YWwnOiA1MTcsXG4gICchPSc6IDUxNyxcbiAgJyE9PSc6IDUxNyxcbiAgJ2dlcXVhbCc6IDUxOCxcbiAgJz49JzogNTE4LFxuICAnYWx3YXlzJzogNTE5XG59XG5cbnZhciBzdGVuY2lsT3BzID0ge1xuICAnMCc6IDAsXG4gICd6ZXJvJzogMCxcbiAgJ2tlZXAnOiA3NjgwLFxuICAncmVwbGFjZSc6IDc2ODEsXG4gICdpbmNyZW1lbnQnOiA3NjgyLFxuICAnZGVjcmVtZW50JzogNzY4MyxcbiAgJ2luY3JlbWVudCB3cmFwJzogMzQwNTUsXG4gICdkZWNyZW1lbnQgd3JhcCc6IDM0MDU2LFxuICAnaW52ZXJ0JzogNTM4NlxufVxuXG52YXIgc2hhZGVyVHlwZSA9IHtcbiAgJ2ZyYWcnOiBHTF9GUkFHTUVOVF9TSEFERVIsXG4gICd2ZXJ0JzogR0xfVkVSVEVYX1NIQURFUlxufVxuXG52YXIgb3JpZW50YXRpb25UeXBlID0ge1xuICAnY3cnOiBHTF9DVyxcbiAgJ2Njdyc6IEdMX0NDV1xufVxuXG5mdW5jdGlvbiBpc0J1ZmZlckFyZ3MgKHgpIHtcbiAgcmV0dXJuIEFycmF5LmlzQXJyYXkoeCkgfHxcbiAgICBpc1R5cGVkQXJyYXkoeCkgfHxcbiAgICBpc05EQXJyYXkoeClcbn1cblxuLy8gTWFrZSBzdXJlIHZpZXdwb3J0IGlzIHByb2Nlc3NlZCBmaXJzdFxuZnVuY3Rpb24gc29ydFN0YXRlIChzdGF0ZSkge1xuICByZXR1cm4gc3RhdGUuc29ydChmdW5jdGlvbiAoYSwgYikge1xuICAgIGlmIChhID09PSBTX1ZJRVdQT1JUKSB7XG4gICAgICByZXR1cm4gLTFcbiAgICB9IGVsc2UgaWYgKGIgPT09IFNfVklFV1BPUlQpIHtcbiAgICAgIHJldHVybiAxXG4gICAgfVxuICAgIHJldHVybiAoYSA8IGIpID8gLTEgOiAxXG4gIH0pXG59XG5cbmZ1bmN0aW9uIERlY2xhcmF0aW9uICh0aGlzRGVwLCBjb250ZXh0RGVwLCBwcm9wRGVwLCBhcHBlbmQpIHtcbiAgdGhpcy50aGlzRGVwID0gdGhpc0RlcFxuICB0aGlzLmNvbnRleHREZXAgPSBjb250ZXh0RGVwXG4gIHRoaXMucHJvcERlcCA9IHByb3BEZXBcbiAgdGhpcy5hcHBlbmQgPSBhcHBlbmRcbn1cblxuZnVuY3Rpb24gaXNTdGF0aWMgKGRlY2wpIHtcbiAgcmV0dXJuIGRlY2wgJiYgIShkZWNsLnRoaXNEZXAgfHwgZGVjbC5jb250ZXh0RGVwIHx8IGRlY2wucHJvcERlcClcbn1cblxuZnVuY3Rpb24gY3JlYXRlU3RhdGljRGVjbCAoYXBwZW5kKSB7XG4gIHJldHVybiBuZXcgRGVjbGFyYXRpb24oZmFsc2UsIGZhbHNlLCBmYWxzZSwgYXBwZW5kKVxufVxuXG5mdW5jdGlvbiBjcmVhdGVEeW5hbWljRGVjbCAoZHluLCBhcHBlbmQpIHtcbiAgdmFyIHR5cGUgPSBkeW4udHlwZVxuICBpZiAodHlwZSA9PT0gRFlOX0ZVTkMpIHtcbiAgICB2YXIgbnVtQXJncyA9IGR5bi5kYXRhLmxlbmd0aFxuICAgIHJldHVybiBuZXcgRGVjbGFyYXRpb24oXG4gICAgICB0cnVlLFxuICAgICAgbnVtQXJncyA+PSAxLFxuICAgICAgbnVtQXJncyA+PSAyLFxuICAgICAgYXBwZW5kKVxuICB9IGVsc2UgaWYgKHR5cGUgPT09IERZTl9USFVOSykge1xuICAgIHZhciBkYXRhID0gZHluLmRhdGFcbiAgICByZXR1cm4gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgZGF0YS50aGlzRGVwLFxuICAgICAgZGF0YS5jb250ZXh0RGVwLFxuICAgICAgZGF0YS5wcm9wRGVwLFxuICAgICAgYXBwZW5kKVxuICB9IGVsc2Uge1xuICAgIHJldHVybiBuZXcgRGVjbGFyYXRpb24oXG4gICAgICB0eXBlID09PSBEWU5fU1RBVEUsXG4gICAgICB0eXBlID09PSBEWU5fQ09OVEVYVCxcbiAgICAgIHR5cGUgPT09IERZTl9QUk9QLFxuICAgICAgYXBwZW5kKVxuICB9XG59XG5cbnZhciBTQ09QRV9ERUNMID0gbmV3IERlY2xhcmF0aW9uKGZhbHNlLCBmYWxzZSwgZmFsc2UsIGZ1bmN0aW9uICgpIHt9KVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHJlZ2xDb3JlIChcbiAgZ2wsXG4gIHN0cmluZ1N0b3JlLFxuICBleHRlbnNpb25zLFxuICBsaW1pdHMsXG4gIGJ1ZmZlclN0YXRlLFxuICBlbGVtZW50U3RhdGUsXG4gIHRleHR1cmVTdGF0ZSxcbiAgZnJhbWVidWZmZXJTdGF0ZSxcbiAgdW5pZm9ybVN0YXRlLFxuICBhdHRyaWJ1dGVTdGF0ZSxcbiAgc2hhZGVyU3RhdGUsXG4gIGRyYXdTdGF0ZSxcbiAgY29udGV4dFN0YXRlLFxuICB0aW1lcixcbiAgY29uZmlnKSB7XG4gIHZhciBBdHRyaWJ1dGVSZWNvcmQgPSBhdHRyaWJ1dGVTdGF0ZS5SZWNvcmRcblxuICB2YXIgYmxlbmRFcXVhdGlvbnMgPSB7XG4gICAgJ2FkZCc6IDMyNzc0LFxuICAgICdzdWJ0cmFjdCc6IDMyNzc4LFxuICAgICdyZXZlcnNlIHN1YnRyYWN0JzogMzI3NzlcbiAgfVxuICBpZiAoZXh0ZW5zaW9ucy5leHRfYmxlbmRfbWlubWF4KSB7XG4gICAgYmxlbmRFcXVhdGlvbnMubWluID0gR0xfTUlOX0VYVFxuICAgIGJsZW5kRXF1YXRpb25zLm1heCA9IEdMX01BWF9FWFRcbiAgfVxuXG4gIHZhciBleHRJbnN0YW5jaW5nID0gZXh0ZW5zaW9ucy5hbmdsZV9pbnN0YW5jZWRfYXJyYXlzXG4gIHZhciBleHREcmF3QnVmZmVycyA9IGV4dGVuc2lvbnMud2ViZ2xfZHJhd19idWZmZXJzXG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBXRUJHTCBTVEFURVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIHZhciBjdXJyZW50U3RhdGUgPSB7XG4gICAgZGlydHk6IHRydWUsXG4gICAgcHJvZmlsZTogY29uZmlnLnByb2ZpbGVcbiAgfVxuICB2YXIgbmV4dFN0YXRlID0ge31cbiAgdmFyIEdMX1NUQVRFX05BTUVTID0gW11cbiAgdmFyIEdMX0ZMQUdTID0ge31cbiAgdmFyIEdMX1ZBUklBQkxFUyA9IHt9XG5cbiAgZnVuY3Rpb24gcHJvcE5hbWUgKG5hbWUpIHtcbiAgICByZXR1cm4gbmFtZS5yZXBsYWNlKCcuJywgJ18nKVxuICB9XG5cbiAgZnVuY3Rpb24gc3RhdGVGbGFnIChzbmFtZSwgY2FwLCBpbml0KSB7XG4gICAgdmFyIG5hbWUgPSBwcm9wTmFtZShzbmFtZSlcbiAgICBHTF9TVEFURV9OQU1FUy5wdXNoKHNuYW1lKVxuICAgIG5leHRTdGF0ZVtuYW1lXSA9IGN1cnJlbnRTdGF0ZVtuYW1lXSA9ICEhaW5pdFxuICAgIEdMX0ZMQUdTW25hbWVdID0gY2FwXG4gIH1cblxuICBmdW5jdGlvbiBzdGF0ZVZhcmlhYmxlIChzbmFtZSwgZnVuYywgaW5pdCkge1xuICAgIHZhciBuYW1lID0gcHJvcE5hbWUoc25hbWUpXG4gICAgR0xfU1RBVEVfTkFNRVMucHVzaChzbmFtZSlcbiAgICBpZiAoQXJyYXkuaXNBcnJheShpbml0KSkge1xuICAgICAgY3VycmVudFN0YXRlW25hbWVdID0gaW5pdC5zbGljZSgpXG4gICAgICBuZXh0U3RhdGVbbmFtZV0gPSBpbml0LnNsaWNlKClcbiAgICB9IGVsc2Uge1xuICAgICAgY3VycmVudFN0YXRlW25hbWVdID0gbmV4dFN0YXRlW25hbWVdID0gaW5pdFxuICAgIH1cbiAgICBHTF9WQVJJQUJMRVNbbmFtZV0gPSBmdW5jXG4gIH1cblxuICAvLyBEaXRoZXJpbmdcbiAgc3RhdGVGbGFnKFNfRElUSEVSLCBHTF9ESVRIRVIpXG5cbiAgLy8gQmxlbmRpbmdcbiAgc3RhdGVGbGFnKFNfQkxFTkRfRU5BQkxFLCBHTF9CTEVORClcbiAgc3RhdGVWYXJpYWJsZShTX0JMRU5EX0NPTE9SLCAnYmxlbmRDb2xvcicsIFswLCAwLCAwLCAwXSlcbiAgc3RhdGVWYXJpYWJsZShTX0JMRU5EX0VRVUFUSU9OLCAnYmxlbmRFcXVhdGlvblNlcGFyYXRlJyxcbiAgICBbR0xfRlVOQ19BREQsIEdMX0ZVTkNfQUREXSlcbiAgc3RhdGVWYXJpYWJsZShTX0JMRU5EX0ZVTkMsICdibGVuZEZ1bmNTZXBhcmF0ZScsXG4gICAgW0dMX09ORSwgR0xfWkVSTywgR0xfT05FLCBHTF9aRVJPXSlcblxuICAvLyBEZXB0aFxuICBzdGF0ZUZsYWcoU19ERVBUSF9FTkFCTEUsIEdMX0RFUFRIX1RFU1QsIHRydWUpXG4gIHN0YXRlVmFyaWFibGUoU19ERVBUSF9GVU5DLCAnZGVwdGhGdW5jJywgR0xfTEVTUylcbiAgc3RhdGVWYXJpYWJsZShTX0RFUFRIX1JBTkdFLCAnZGVwdGhSYW5nZScsIFswLCAxXSlcbiAgc3RhdGVWYXJpYWJsZShTX0RFUFRIX01BU0ssICdkZXB0aE1hc2snLCB0cnVlKVxuXG4gIC8vIENvbG9yIG1hc2tcbiAgc3RhdGVWYXJpYWJsZShTX0NPTE9SX01BU0ssIFNfQ09MT1JfTUFTSywgW3RydWUsIHRydWUsIHRydWUsIHRydWVdKVxuXG4gIC8vIEZhY2UgY3VsbGluZ1xuICBzdGF0ZUZsYWcoU19DVUxMX0VOQUJMRSwgR0xfQ1VMTF9GQUNFKVxuICBzdGF0ZVZhcmlhYmxlKFNfQ1VMTF9GQUNFLCAnY3VsbEZhY2UnLCBHTF9CQUNLKVxuXG4gIC8vIEZyb250IGZhY2Ugb3JpZW50YXRpb25cbiAgc3RhdGVWYXJpYWJsZShTX0ZST05UX0ZBQ0UsIFNfRlJPTlRfRkFDRSwgR0xfQ0NXKVxuXG4gIC8vIExpbmUgd2lkdGhcbiAgc3RhdGVWYXJpYWJsZShTX0xJTkVfV0lEVEgsIFNfTElORV9XSURUSCwgMSlcblxuICAvLyBQb2x5Z29uIG9mZnNldFxuICBzdGF0ZUZsYWcoU19QT0xZR09OX09GRlNFVF9FTkFCTEUsIEdMX1BPTFlHT05fT0ZGU0VUX0ZJTEwpXG4gIHN0YXRlVmFyaWFibGUoU19QT0xZR09OX09GRlNFVF9PRkZTRVQsICdwb2x5Z29uT2Zmc2V0JywgWzAsIDBdKVxuXG4gIC8vIFNhbXBsZSBjb3ZlcmFnZVxuICBzdGF0ZUZsYWcoU19TQU1QTEVfQUxQSEEsIEdMX1NBTVBMRV9BTFBIQV9UT19DT1ZFUkFHRSlcbiAgc3RhdGVGbGFnKFNfU0FNUExFX0VOQUJMRSwgR0xfU0FNUExFX0NPVkVSQUdFKVxuICBzdGF0ZVZhcmlhYmxlKFNfU0FNUExFX0NPVkVSQUdFLCAnc2FtcGxlQ292ZXJhZ2UnLCBbMSwgZmFsc2VdKVxuXG4gIC8vIFN0ZW5jaWxcbiAgc3RhdGVGbGFnKFNfU1RFTkNJTF9FTkFCTEUsIEdMX1NURU5DSUxfVEVTVClcbiAgc3RhdGVWYXJpYWJsZShTX1NURU5DSUxfTUFTSywgJ3N0ZW5jaWxNYXNrJywgLTEpXG4gIHN0YXRlVmFyaWFibGUoU19TVEVOQ0lMX0ZVTkMsICdzdGVuY2lsRnVuYycsIFtHTF9BTFdBWVMsIDAsIC0xXSlcbiAgc3RhdGVWYXJpYWJsZShTX1NURU5DSUxfT1BGUk9OVCwgJ3N0ZW5jaWxPcFNlcGFyYXRlJyxcbiAgICBbR0xfRlJPTlQsIEdMX0tFRVAsIEdMX0tFRVAsIEdMX0tFRVBdKVxuICBzdGF0ZVZhcmlhYmxlKFNfU1RFTkNJTF9PUEJBQ0ssICdzdGVuY2lsT3BTZXBhcmF0ZScsXG4gICAgW0dMX0JBQ0ssIEdMX0tFRVAsIEdMX0tFRVAsIEdMX0tFRVBdKVxuXG4gIC8vIFNjaXNzb3JcbiAgc3RhdGVGbGFnKFNfU0NJU1NPUl9FTkFCTEUsIEdMX1NDSVNTT1JfVEVTVClcbiAgc3RhdGVWYXJpYWJsZShTX1NDSVNTT1JfQk9YLCAnc2Npc3NvcicsXG4gICAgWzAsIDAsIGdsLmRyYXdpbmdCdWZmZXJXaWR0aCwgZ2wuZHJhd2luZ0J1ZmZlckhlaWdodF0pXG5cbiAgLy8gVmlld3BvcnRcbiAgc3RhdGVWYXJpYWJsZShTX1ZJRVdQT1JULCBTX1ZJRVdQT1JULFxuICAgIFswLCAwLCBnbC5kcmF3aW5nQnVmZmVyV2lkdGgsIGdsLmRyYXdpbmdCdWZmZXJIZWlnaHRdKVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gRU5WSVJPTk1FTlRcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICB2YXIgc2hhcmVkU3RhdGUgPSB7XG4gICAgZ2w6IGdsLFxuICAgIGNvbnRleHQ6IGNvbnRleHRTdGF0ZSxcbiAgICBzdHJpbmdzOiBzdHJpbmdTdG9yZSxcbiAgICBuZXh0OiBuZXh0U3RhdGUsXG4gICAgY3VycmVudDogY3VycmVudFN0YXRlLFxuICAgIGRyYXc6IGRyYXdTdGF0ZSxcbiAgICBlbGVtZW50czogZWxlbWVudFN0YXRlLFxuICAgIGJ1ZmZlcjogYnVmZmVyU3RhdGUsXG4gICAgc2hhZGVyOiBzaGFkZXJTdGF0ZSxcbiAgICBhdHRyaWJ1dGVzOiBhdHRyaWJ1dGVTdGF0ZS5zdGF0ZSxcbiAgICB1bmlmb3JtczogdW5pZm9ybVN0YXRlLFxuICAgIGZyYW1lYnVmZmVyOiBmcmFtZWJ1ZmZlclN0YXRlLFxuICAgIGV4dGVuc2lvbnM6IGV4dGVuc2lvbnMsXG5cbiAgICB0aW1lcjogdGltZXIsXG4gICAgaXNCdWZmZXJBcmdzOiBpc0J1ZmZlckFyZ3NcbiAgfVxuXG4gIHZhciBzaGFyZWRDb25zdGFudHMgPSB7XG4gICAgcHJpbVR5cGVzOiBwcmltVHlwZXMsXG4gICAgY29tcGFyZUZ1bmNzOiBjb21wYXJlRnVuY3MsXG4gICAgYmxlbmRGdW5jczogYmxlbmRGdW5jcyxcbiAgICBibGVuZEVxdWF0aW9uczogYmxlbmRFcXVhdGlvbnMsXG4gICAgc3RlbmNpbE9wczogc3RlbmNpbE9wcyxcbiAgICBnbFR5cGVzOiBnbFR5cGVzLFxuICAgIG9yaWVudGF0aW9uVHlwZTogb3JpZW50YXRpb25UeXBlXG4gIH1cblxuICBcblxuICBpZiAoZXh0RHJhd0J1ZmZlcnMpIHtcbiAgICBzaGFyZWRDb25zdGFudHMuYmFja0J1ZmZlciA9IFtHTF9CQUNLXVxuICAgIHNoYXJlZENvbnN0YW50cy5kcmF3QnVmZmVyID0gbG9vcChsaW1pdHMubWF4RHJhd2J1ZmZlcnMsIGZ1bmN0aW9uIChpKSB7XG4gICAgICBpZiAoaSA9PT0gMCkge1xuICAgICAgICByZXR1cm4gWzBdXG4gICAgICB9XG4gICAgICByZXR1cm4gbG9vcChpLCBmdW5jdGlvbiAoaikge1xuICAgICAgICByZXR1cm4gR0xfQ09MT1JfQVRUQUNITUVOVDAgKyBqXG4gICAgICB9KVxuICAgIH0pXG4gIH1cblxuICB2YXIgZHJhd0NhbGxDb3VudGVyID0gMFxuICBmdW5jdGlvbiBjcmVhdGVSRUdMRW52aXJvbm1lbnQgKCkge1xuICAgIHZhciBlbnYgPSBjcmVhdGVFbnZpcm9ubWVudCgpXG4gICAgdmFyIGxpbmsgPSBlbnYubGlua1xuICAgIHZhciBnbG9iYWwgPSBlbnYuZ2xvYmFsXG4gICAgZW52LmlkID0gZHJhd0NhbGxDb3VudGVyKytcblxuICAgIGVudi5iYXRjaElkID0gJzAnXG5cbiAgICAvLyBsaW5rIHNoYXJlZCBzdGF0ZVxuICAgIHZhciBTSEFSRUQgPSBsaW5rKHNoYXJlZFN0YXRlKVxuICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkID0ge1xuICAgICAgcHJvcHM6ICdhMCdcbiAgICB9XG4gICAgT2JqZWN0LmtleXMoc2hhcmVkU3RhdGUpLmZvckVhY2goZnVuY3Rpb24gKHByb3ApIHtcbiAgICAgIHNoYXJlZFtwcm9wXSA9IGdsb2JhbC5kZWYoU0hBUkVELCAnLicsIHByb3ApXG4gICAgfSlcblxuICAgIC8vIEluamVjdCBydW50aW1lIGFzc2VydGlvbiBzdHVmZiBmb3IgZGVidWcgYnVpbGRzXG4gICAgXG5cbiAgICAvLyBDb3B5IEdMIHN0YXRlIHZhcmlhYmxlcyBvdmVyXG4gICAgdmFyIG5leHRWYXJzID0gZW52Lm5leHQgPSB7fVxuICAgIHZhciBjdXJyZW50VmFycyA9IGVudi5jdXJyZW50ID0ge31cbiAgICBPYmplY3Qua2V5cyhHTF9WQVJJQUJMRVMpLmZvckVhY2goZnVuY3Rpb24gKHZhcmlhYmxlKSB7XG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShjdXJyZW50U3RhdGVbdmFyaWFibGVdKSkge1xuICAgICAgICBuZXh0VmFyc1t2YXJpYWJsZV0gPSBnbG9iYWwuZGVmKHNoYXJlZC5uZXh0LCAnLicsIHZhcmlhYmxlKVxuICAgICAgICBjdXJyZW50VmFyc1t2YXJpYWJsZV0gPSBnbG9iYWwuZGVmKHNoYXJlZC5jdXJyZW50LCAnLicsIHZhcmlhYmxlKVxuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyBJbml0aWFsaXplIHNoYXJlZCBjb25zdGFudHNcbiAgICB2YXIgY29uc3RhbnRzID0gZW52LmNvbnN0YW50cyA9IHt9XG4gICAgT2JqZWN0LmtleXMoc2hhcmVkQ29uc3RhbnRzKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICBjb25zdGFudHNbbmFtZV0gPSBnbG9iYWwuZGVmKEpTT04uc3RyaW5naWZ5KHNoYXJlZENvbnN0YW50c1tuYW1lXSkpXG4gICAgfSlcblxuICAgIC8vIEhlbHBlciBmdW5jdGlvbiBmb3IgY2FsbGluZyBhIGJsb2NrXG4gICAgZW52Lmludm9rZSA9IGZ1bmN0aW9uIChibG9jaywgeCkge1xuICAgICAgc3dpdGNoICh4LnR5cGUpIHtcbiAgICAgICAgY2FzZSBEWU5fRlVOQzpcbiAgICAgICAgICB2YXIgYXJnTGlzdCA9IFtcbiAgICAgICAgICAgICd0aGlzJyxcbiAgICAgICAgICAgIHNoYXJlZC5jb250ZXh0LFxuICAgICAgICAgICAgc2hhcmVkLnByb3BzLFxuICAgICAgICAgICAgZW52LmJhdGNoSWRcbiAgICAgICAgICBdXG4gICAgICAgICAgcmV0dXJuIGJsb2NrLmRlZihcbiAgICAgICAgICAgIGxpbmsoeC5kYXRhKSwgJy5jYWxsKCcsXG4gICAgICAgICAgICAgIGFyZ0xpc3Quc2xpY2UoMCwgTWF0aC5tYXgoeC5kYXRhLmxlbmd0aCArIDEsIDQpKSxcbiAgICAgICAgICAgICAnKScpXG4gICAgICAgIGNhc2UgRFlOX1BST1A6XG4gICAgICAgICAgcmV0dXJuIGJsb2NrLmRlZihzaGFyZWQucHJvcHMsIHguZGF0YSlcbiAgICAgICAgY2FzZSBEWU5fQ09OVEVYVDpcbiAgICAgICAgICByZXR1cm4gYmxvY2suZGVmKHNoYXJlZC5jb250ZXh0LCB4LmRhdGEpXG4gICAgICAgIGNhc2UgRFlOX1NUQVRFOlxuICAgICAgICAgIHJldHVybiBibG9jay5kZWYoJ3RoaXMnLCB4LmRhdGEpXG4gICAgICAgIGNhc2UgRFlOX1RIVU5LOlxuICAgICAgICAgIHguZGF0YS5hcHBlbmQoZW52LCBibG9jaylcbiAgICAgICAgICByZXR1cm4geC5kYXRhLnJlZlxuICAgICAgfVxuICAgIH1cblxuICAgIGVudi5hdHRyaWJDYWNoZSA9IHt9XG5cbiAgICB2YXIgc2NvcGVBdHRyaWJzID0ge31cbiAgICBlbnYuc2NvcGVBdHRyaWIgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgICAgdmFyIGlkID0gc3RyaW5nU3RvcmUuaWQobmFtZSlcbiAgICAgIGlmIChpZCBpbiBzY29wZUF0dHJpYnMpIHtcbiAgICAgICAgcmV0dXJuIHNjb3BlQXR0cmlic1tpZF1cbiAgICAgIH1cbiAgICAgIHZhciBiaW5kaW5nID0gYXR0cmlidXRlU3RhdGUuc2NvcGVbaWRdXG4gICAgICBpZiAoIWJpbmRpbmcpIHtcbiAgICAgICAgYmluZGluZyA9IGF0dHJpYnV0ZVN0YXRlLnNjb3BlW2lkXSA9IG5ldyBBdHRyaWJ1dGVSZWNvcmQoKVxuICAgICAgfVxuICAgICAgdmFyIHJlc3VsdCA9IHNjb3BlQXR0cmlic1tpZF0gPSBsaW5rKGJpbmRpbmcpXG4gICAgICByZXR1cm4gcmVzdWx0XG4gICAgfVxuXG4gICAgcmV0dXJuIGVudlxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBQQVJTSU5HXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgZnVuY3Rpb24gcGFyc2VQcm9maWxlIChvcHRpb25zKSB7XG4gICAgdmFyIHN0YXRpY09wdGlvbnMgPSBvcHRpb25zLnN0YXRpY1xuICAgIHZhciBkeW5hbWljT3B0aW9ucyA9IG9wdGlvbnMuZHluYW1pY1xuXG4gICAgdmFyIHByb2ZpbGVFbmFibGVcbiAgICBpZiAoU19QUk9GSUxFIGluIHN0YXRpY09wdGlvbnMpIHtcbiAgICAgIHZhciB2YWx1ZSA9ICEhc3RhdGljT3B0aW9uc1tTX1BST0ZJTEVdXG4gICAgICBwcm9maWxlRW5hYmxlID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICByZXR1cm4gdmFsdWVcbiAgICAgIH0pXG4gICAgICBwcm9maWxlRW5hYmxlLmVuYWJsZSA9IHZhbHVlXG4gICAgfSBlbHNlIGlmIChTX1BST0ZJTEUgaW4gZHluYW1pY09wdGlvbnMpIHtcbiAgICAgIHZhciBkeW4gPSBkeW5hbWljT3B0aW9uc1tTX1BST0ZJTEVdXG4gICAgICBwcm9maWxlRW5hYmxlID0gY3JlYXRlRHluYW1pY0RlY2woZHluLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICByZXR1cm4gZW52Lmludm9rZShzY29wZSwgZHluKVxuICAgICAgfSlcbiAgICB9XG5cbiAgICByZXR1cm4gcHJvZmlsZUVuYWJsZVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VGcmFtZWJ1ZmZlciAob3B0aW9ucywgZW52KSB7XG4gICAgdmFyIHN0YXRpY09wdGlvbnMgPSBvcHRpb25zLnN0YXRpY1xuICAgIHZhciBkeW5hbWljT3B0aW9ucyA9IG9wdGlvbnMuZHluYW1pY1xuXG4gICAgaWYgKFNfRlJBTUVCVUZGRVIgaW4gc3RhdGljT3B0aW9ucykge1xuICAgICAgdmFyIGZyYW1lYnVmZmVyID0gc3RhdGljT3B0aW9uc1tTX0ZSQU1FQlVGRkVSXVxuICAgICAgaWYgKGZyYW1lYnVmZmVyKSB7XG4gICAgICAgIGZyYW1lYnVmZmVyID0gZnJhbWVidWZmZXJTdGF0ZS5nZXRGcmFtZWJ1ZmZlcihmcmFtZWJ1ZmZlcilcbiAgICAgICAgXG4gICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIGJsb2NrKSB7XG4gICAgICAgICAgdmFyIEZSQU1FQlVGRkVSID0gZW52LmxpbmsoZnJhbWVidWZmZXIpXG4gICAgICAgICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcbiAgICAgICAgICBibG9jay5zZXQoXG4gICAgICAgICAgICBzaGFyZWQuZnJhbWVidWZmZXIsXG4gICAgICAgICAgICAnLm5leHQnLFxuICAgICAgICAgICAgRlJBTUVCVUZGRVIpXG4gICAgICAgICAgdmFyIENPTlRFWFQgPSBzaGFyZWQuY29udGV4dFxuICAgICAgICAgIGJsb2NrLnNldChcbiAgICAgICAgICAgIENPTlRFWFQsXG4gICAgICAgICAgICAnLicgKyBTX0ZSQU1FQlVGRkVSX1dJRFRILFxuICAgICAgICAgICAgRlJBTUVCVUZGRVIgKyAnLndpZHRoJylcbiAgICAgICAgICBibG9jay5zZXQoXG4gICAgICAgICAgICBDT05URVhULFxuICAgICAgICAgICAgJy4nICsgU19GUkFNRUJVRkZFUl9IRUlHSFQsXG4gICAgICAgICAgICBGUkFNRUJVRkZFUiArICcuaGVpZ2h0JylcbiAgICAgICAgICByZXR1cm4gRlJBTUVCVUZGRVJcbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcbiAgICAgICAgICBzY29wZS5zZXQoXG4gICAgICAgICAgICBzaGFyZWQuZnJhbWVidWZmZXIsXG4gICAgICAgICAgICAnLm5leHQnLFxuICAgICAgICAgICAgJ251bGwnKVxuICAgICAgICAgIHZhciBDT05URVhUID0gc2hhcmVkLmNvbnRleHRcbiAgICAgICAgICBzY29wZS5zZXQoXG4gICAgICAgICAgICBDT05URVhULFxuICAgICAgICAgICAgJy4nICsgU19GUkFNRUJVRkZFUl9XSURUSCxcbiAgICAgICAgICAgIENPTlRFWFQgKyAnLicgKyBTX0RSQVdJTkdCVUZGRVJfV0lEVEgpXG4gICAgICAgICAgc2NvcGUuc2V0KFxuICAgICAgICAgICAgQ09OVEVYVCxcbiAgICAgICAgICAgICcuJyArIFNfRlJBTUVCVUZGRVJfSEVJR0hULFxuICAgICAgICAgICAgQ09OVEVYVCArICcuJyArIFNfRFJBV0lOR0JVRkZFUl9IRUlHSFQpXG4gICAgICAgICAgcmV0dXJuICdudWxsJ1xuICAgICAgICB9KVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoU19GUkFNRUJVRkZFUiBpbiBkeW5hbWljT3B0aW9ucykge1xuICAgICAgdmFyIGR5biA9IGR5bmFtaWNPcHRpb25zW1NfRlJBTUVCVUZGRVJdXG4gICAgICByZXR1cm4gY3JlYXRlRHluYW1pY0RlY2woZHluLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICB2YXIgRlJBTUVCVUZGRVJfRlVOQyA9IGVudi5pbnZva2Uoc2NvcGUsIGR5bilcbiAgICAgICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcbiAgICAgICAgdmFyIEZSQU1FQlVGRkVSX1NUQVRFID0gc2hhcmVkLmZyYW1lYnVmZmVyXG4gICAgICAgIHZhciBGUkFNRUJVRkZFUiA9IHNjb3BlLmRlZihcbiAgICAgICAgICBGUkFNRUJVRkZFUl9TVEFURSwgJy5nZXRGcmFtZWJ1ZmZlcignLCBGUkFNRUJVRkZFUl9GVU5DLCAnKScpXG5cbiAgICAgICAgXG5cbiAgICAgICAgc2NvcGUuc2V0KFxuICAgICAgICAgIEZSQU1FQlVGRkVSX1NUQVRFLFxuICAgICAgICAgICcubmV4dCcsXG4gICAgICAgICAgRlJBTUVCVUZGRVIpXG4gICAgICAgIHZhciBDT05URVhUID0gc2hhcmVkLmNvbnRleHRcbiAgICAgICAgc2NvcGUuc2V0KFxuICAgICAgICAgIENPTlRFWFQsXG4gICAgICAgICAgJy4nICsgU19GUkFNRUJVRkZFUl9XSURUSCxcbiAgICAgICAgICBGUkFNRUJVRkZFUiArICc/JyArIEZSQU1FQlVGRkVSICsgJy53aWR0aDonICtcbiAgICAgICAgICBDT05URVhUICsgJy4nICsgU19EUkFXSU5HQlVGRkVSX1dJRFRIKVxuICAgICAgICBzY29wZS5zZXQoXG4gICAgICAgICAgQ09OVEVYVCxcbiAgICAgICAgICAnLicgKyBTX0ZSQU1FQlVGRkVSX0hFSUdIVCxcbiAgICAgICAgICBGUkFNRUJVRkZFUiArXG4gICAgICAgICAgJz8nICsgRlJBTUVCVUZGRVIgKyAnLmhlaWdodDonICtcbiAgICAgICAgICBDT05URVhUICsgJy4nICsgU19EUkFXSU5HQlVGRkVSX0hFSUdIVClcbiAgICAgICAgcmV0dXJuIEZSQU1FQlVGRkVSXG4gICAgICB9KVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlVmlld3BvcnRTY2lzc29yIChvcHRpb25zLCBmcmFtZWJ1ZmZlciwgZW52KSB7XG4gICAgdmFyIHN0YXRpY09wdGlvbnMgPSBvcHRpb25zLnN0YXRpY1xuICAgIHZhciBkeW5hbWljT3B0aW9ucyA9IG9wdGlvbnMuZHluYW1pY1xuXG4gICAgZnVuY3Rpb24gcGFyc2VCb3ggKHBhcmFtKSB7XG4gICAgICBpZiAocGFyYW0gaW4gc3RhdGljT3B0aW9ucykge1xuICAgICAgICB2YXIgYm94ID0gc3RhdGljT3B0aW9uc1twYXJhbV1cbiAgICAgICAgXG5cbiAgICAgICAgdmFyIGlzU3RhdGljID0gdHJ1ZVxuICAgICAgICB2YXIgeCA9IGJveC54IHwgMFxuICAgICAgICB2YXIgeSA9IGJveC55IHwgMFxuICAgICAgICB2YXIgdywgaFxuICAgICAgICBpZiAoJ3dpZHRoJyBpbiBib3gpIHtcbiAgICAgICAgICB3ID0gYm94LndpZHRoIHwgMFxuICAgICAgICAgIFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlzU3RhdGljID0gZmFsc2VcbiAgICAgICAgfVxuICAgICAgICBpZiAoJ2hlaWdodCcgaW4gYm94KSB7XG4gICAgICAgICAgaCA9IGJveC5oZWlnaHQgfCAwXG4gICAgICAgICAgXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaXNTdGF0aWMgPSBmYWxzZVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG5ldyBEZWNsYXJhdGlvbihcbiAgICAgICAgICAhaXNTdGF0aWMgJiYgZnJhbWVidWZmZXIgJiYgZnJhbWVidWZmZXIudGhpc0RlcCxcbiAgICAgICAgICAhaXNTdGF0aWMgJiYgZnJhbWVidWZmZXIgJiYgZnJhbWVidWZmZXIuY29udGV4dERlcCxcbiAgICAgICAgICAhaXNTdGF0aWMgJiYgZnJhbWVidWZmZXIgJiYgZnJhbWVidWZmZXIucHJvcERlcCxcbiAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgICAgdmFyIENPTlRFWFQgPSBlbnYuc2hhcmVkLmNvbnRleHRcbiAgICAgICAgICAgIHZhciBCT1hfVyA9IHdcbiAgICAgICAgICAgIGlmICghKCd3aWR0aCcgaW4gYm94KSkge1xuICAgICAgICAgICAgICBCT1hfVyA9IHNjb3BlLmRlZihDT05URVhULCAnLicsIFNfRlJBTUVCVUZGRVJfV0lEVEgsICctJywgeClcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhciBCT1hfSCA9IGhcbiAgICAgICAgICAgIGlmICghKCdoZWlnaHQnIGluIGJveCkpIHtcbiAgICAgICAgICAgICAgQk9YX0ggPSBzY29wZS5kZWYoQ09OVEVYVCwgJy4nLCBTX0ZSQU1FQlVGRkVSX0hFSUdIVCwgJy0nLCB5KVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIFt4LCB5LCBCT1hfVywgQk9YX0hdXG4gICAgICAgICAgfSlcbiAgICAgIH0gZWxzZSBpZiAocGFyYW0gaW4gZHluYW1pY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIGR5bkJveCA9IGR5bmFtaWNPcHRpb25zW3BhcmFtXVxuICAgICAgICB2YXIgcmVzdWx0ID0gY3JlYXRlRHluYW1pY0RlY2woZHluQm94LCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciBCT1ggPSBlbnYuaW52b2tlKHNjb3BlLCBkeW5Cb3gpXG5cbiAgICAgICAgICBcblxuICAgICAgICAgIHZhciBDT05URVhUID0gZW52LnNoYXJlZC5jb250ZXh0XG4gICAgICAgICAgdmFyIEJPWF9YID0gc2NvcGUuZGVmKEJPWCwgJy54fDAnKVxuICAgICAgICAgIHZhciBCT1hfWSA9IHNjb3BlLmRlZihCT1gsICcueXwwJylcbiAgICAgICAgICB2YXIgQk9YX1cgPSBzY29wZS5kZWYoXG4gICAgICAgICAgICAnXCJ3aWR0aFwiIGluICcsIEJPWCwgJz8nLCBCT1gsICcud2lkdGh8MDonLFxuICAgICAgICAgICAgJygnLCBDT05URVhULCAnLicsIFNfRlJBTUVCVUZGRVJfV0lEVEgsICctJywgQk9YX1gsICcpJylcbiAgICAgICAgICB2YXIgQk9YX0ggPSBzY29wZS5kZWYoXG4gICAgICAgICAgICAnXCJoZWlnaHRcIiBpbiAnLCBCT1gsICc/JywgQk9YLCAnLmhlaWdodHwwOicsXG4gICAgICAgICAgICAnKCcsIENPTlRFWFQsICcuJywgU19GUkFNRUJVRkZFUl9IRUlHSFQsICctJywgQk9YX1ksICcpJylcblxuICAgICAgICAgIFxuXG4gICAgICAgICAgcmV0dXJuIFtCT1hfWCwgQk9YX1ksIEJPWF9XLCBCT1hfSF1cbiAgICAgICAgfSlcbiAgICAgICAgaWYgKGZyYW1lYnVmZmVyKSB7XG4gICAgICAgICAgcmVzdWx0LnRoaXNEZXAgPSByZXN1bHQudGhpc0RlcCB8fCBmcmFtZWJ1ZmZlci50aGlzRGVwXG4gICAgICAgICAgcmVzdWx0LmNvbnRleHREZXAgPSByZXN1bHQuY29udGV4dERlcCB8fCBmcmFtZWJ1ZmZlci5jb250ZXh0RGVwXG4gICAgICAgICAgcmVzdWx0LnByb3BEZXAgPSByZXN1bHQucHJvcERlcCB8fCBmcmFtZWJ1ZmZlci5wcm9wRGVwXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgfSBlbHNlIGlmIChmcmFtZWJ1ZmZlcikge1xuICAgICAgICByZXR1cm4gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgICAgIGZyYW1lYnVmZmVyLnRoaXNEZXAsXG4gICAgICAgICAgZnJhbWVidWZmZXIuY29udGV4dERlcCxcbiAgICAgICAgICBmcmFtZWJ1ZmZlci5wcm9wRGVwLFxuICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgICB2YXIgQ09OVEVYVCA9IGVudi5zaGFyZWQuY29udGV4dFxuICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgMCwgMCxcbiAgICAgICAgICAgICAgc2NvcGUuZGVmKENPTlRFWFQsICcuJywgU19GUkFNRUJVRkZFUl9XSURUSCksXG4gICAgICAgICAgICAgIHNjb3BlLmRlZihDT05URVhULCAnLicsIFNfRlJBTUVCVUZGRVJfSEVJR0hUKV1cbiAgICAgICAgICB9KVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIG51bGxcbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgdmlld3BvcnQgPSBwYXJzZUJveChTX1ZJRVdQT1JUKVxuXG4gICAgaWYgKHZpZXdwb3J0KSB7XG4gICAgICB2YXIgcHJldlZpZXdwb3J0ID0gdmlld3BvcnRcbiAgICAgIHZpZXdwb3J0ID0gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgICB2aWV3cG9ydC50aGlzRGVwLFxuICAgICAgICB2aWV3cG9ydC5jb250ZXh0RGVwLFxuICAgICAgICB2aWV3cG9ydC5wcm9wRGVwLFxuICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciBWSUVXUE9SVCA9IHByZXZWaWV3cG9ydC5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgICAgICB2YXIgQ09OVEVYVCA9IGVudi5zaGFyZWQuY29udGV4dFxuICAgICAgICAgIHNjb3BlLnNldChcbiAgICAgICAgICAgIENPTlRFWFQsXG4gICAgICAgICAgICAnLicgKyBTX1ZJRVdQT1JUX1dJRFRILFxuICAgICAgICAgICAgVklFV1BPUlRbMl0pXG4gICAgICAgICAgc2NvcGUuc2V0KFxuICAgICAgICAgICAgQ09OVEVYVCxcbiAgICAgICAgICAgICcuJyArIFNfVklFV1BPUlRfSEVJR0hULFxuICAgICAgICAgICAgVklFV1BPUlRbM10pXG4gICAgICAgICAgcmV0dXJuIFZJRVdQT1JUXG4gICAgICAgIH0pXG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIHZpZXdwb3J0OiB2aWV3cG9ydCxcbiAgICAgIHNjaXNzb3JfYm94OiBwYXJzZUJveChTX1NDSVNTT1JfQk9YKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlUHJvZ3JhbSAob3B0aW9ucykge1xuICAgIHZhciBzdGF0aWNPcHRpb25zID0gb3B0aW9ucy5zdGF0aWNcbiAgICB2YXIgZHluYW1pY09wdGlvbnMgPSBvcHRpb25zLmR5bmFtaWNcblxuICAgIGZ1bmN0aW9uIHBhcnNlU2hhZGVyIChuYW1lKSB7XG4gICAgICBpZiAobmFtZSBpbiBzdGF0aWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBpZCA9IHN0cmluZ1N0b3JlLmlkKHN0YXRpY09wdGlvbnNbbmFtZV0pXG4gICAgICAgIFxuICAgICAgICB2YXIgcmVzdWx0ID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcmV0dXJuIGlkXG4gICAgICAgIH0pXG4gICAgICAgIHJlc3VsdC5pZCA9IGlkXG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH0gZWxzZSBpZiAobmFtZSBpbiBkeW5hbWljT3B0aW9ucykge1xuICAgICAgICB2YXIgZHluID0gZHluYW1pY09wdGlvbnNbbmFtZV1cbiAgICAgICAgcmV0dXJuIGNyZWF0ZUR5bmFtaWNEZWNsKGR5biwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICB2YXIgc3RyID0gZW52Lmludm9rZShzY29wZSwgZHluKVxuICAgICAgICAgIHZhciBpZCA9IHNjb3BlLmRlZihlbnYuc2hhcmVkLnN0cmluZ3MsICcuaWQoJywgc3RyLCAnKScpXG4gICAgICAgICAgXG4gICAgICAgICAgcmV0dXJuIGlkXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cblxuICAgIHZhciBmcmFnID0gcGFyc2VTaGFkZXIoU19GUkFHKVxuICAgIHZhciB2ZXJ0ID0gcGFyc2VTaGFkZXIoU19WRVJUKVxuXG4gICAgdmFyIHByb2dyYW0gPSBudWxsXG4gICAgdmFyIHByb2dWYXJcbiAgICBpZiAoaXNTdGF0aWMoZnJhZykgJiYgaXNTdGF0aWModmVydCkpIHtcbiAgICAgIHByb2dyYW0gPSBzaGFkZXJTdGF0ZS5wcm9ncmFtKHZlcnQuaWQsIGZyYWcuaWQpXG4gICAgICBwcm9nVmFyID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICByZXR1cm4gZW52LmxpbmsocHJvZ3JhbSlcbiAgICAgIH0pXG4gICAgfSBlbHNlIHtcbiAgICAgIHByb2dWYXIgPSBuZXcgRGVjbGFyYXRpb24oXG4gICAgICAgIChmcmFnICYmIGZyYWcudGhpc0RlcCkgfHwgKHZlcnQgJiYgdmVydC50aGlzRGVwKSxcbiAgICAgICAgKGZyYWcgJiYgZnJhZy5jb250ZXh0RGVwKSB8fCAodmVydCAmJiB2ZXJ0LmNvbnRleHREZXApLFxuICAgICAgICAoZnJhZyAmJiBmcmFnLnByb3BEZXApIHx8ICh2ZXJ0ICYmIHZlcnQucHJvcERlcCksXG4gICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgdmFyIFNIQURFUl9TVEFURSA9IGVudi5zaGFyZWQuc2hhZGVyXG4gICAgICAgICAgdmFyIGZyYWdJZFxuICAgICAgICAgIGlmIChmcmFnKSB7XG4gICAgICAgICAgICBmcmFnSWQgPSBmcmFnLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBmcmFnSWQgPSBzY29wZS5kZWYoU0hBREVSX1NUQVRFLCAnLicsIFNfRlJBRylcbiAgICAgICAgICB9XG4gICAgICAgICAgdmFyIHZlcnRJZFxuICAgICAgICAgIGlmICh2ZXJ0KSB7XG4gICAgICAgICAgICB2ZXJ0SWQgPSB2ZXJ0LmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2ZXJ0SWQgPSBzY29wZS5kZWYoU0hBREVSX1NUQVRFLCAnLicsIFNfVkVSVClcbiAgICAgICAgICB9XG4gICAgICAgICAgdmFyIHByb2dEZWYgPSBTSEFERVJfU1RBVEUgKyAnLnByb2dyYW0oJyArIHZlcnRJZCArICcsJyArIGZyYWdJZFxuICAgICAgICAgIFxuICAgICAgICAgIHJldHVybiBzY29wZS5kZWYocHJvZ0RlZiArICcpJylcbiAgICAgICAgfSlcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgZnJhZzogZnJhZyxcbiAgICAgIHZlcnQ6IHZlcnQsXG4gICAgICBwcm9nVmFyOiBwcm9nVmFyLFxuICAgICAgcHJvZ3JhbTogcHJvZ3JhbVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlRHJhdyAob3B0aW9ucywgZW52KSB7XG4gICAgdmFyIHN0YXRpY09wdGlvbnMgPSBvcHRpb25zLnN0YXRpY1xuICAgIHZhciBkeW5hbWljT3B0aW9ucyA9IG9wdGlvbnMuZHluYW1pY1xuXG4gICAgZnVuY3Rpb24gcGFyc2VFbGVtZW50cyAoKSB7XG4gICAgICBpZiAoU19FTEVNRU5UUyBpbiBzdGF0aWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBlbGVtZW50cyA9IHN0YXRpY09wdGlvbnNbU19FTEVNRU5UU11cbiAgICAgICAgaWYgKGlzQnVmZmVyQXJncyhlbGVtZW50cykpIHtcbiAgICAgICAgICBlbGVtZW50cyA9IGVsZW1lbnRTdGF0ZS5nZXRFbGVtZW50cyhlbGVtZW50U3RhdGUuY3JlYXRlKGVsZW1lbnRzLCB0cnVlKSlcbiAgICAgICAgfSBlbHNlIGlmIChlbGVtZW50cykge1xuICAgICAgICAgIGVsZW1lbnRzID0gZWxlbWVudFN0YXRlLmdldEVsZW1lbnRzKGVsZW1lbnRzKVxuICAgICAgICAgIFxuICAgICAgICB9XG4gICAgICAgIHZhciByZXN1bHQgPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgaWYgKGVsZW1lbnRzKSB7XG4gICAgICAgICAgICB2YXIgcmVzdWx0ID0gZW52LmxpbmsoZWxlbWVudHMpXG4gICAgICAgICAgICBlbnYuRUxFTUVOVFMgPSByZXN1bHRcbiAgICAgICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgICAgICB9XG4gICAgICAgICAgZW52LkVMRU1FTlRTID0gbnVsbFxuICAgICAgICAgIHJldHVybiBudWxsXG4gICAgICAgIH0pXG4gICAgICAgIHJlc3VsdC52YWx1ZSA9IGVsZW1lbnRzXG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH0gZWxzZSBpZiAoU19FTEVNRU5UUyBpbiBkeW5hbWljT3B0aW9ucykge1xuICAgICAgICB2YXIgZHluID0gZHluYW1pY09wdGlvbnNbU19FTEVNRU5UU11cbiAgICAgICAgcmV0dXJuIGNyZWF0ZUR5bmFtaWNEZWNsKGR5biwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuXG4gICAgICAgICAgdmFyIElTX0JVRkZFUl9BUkdTID0gc2hhcmVkLmlzQnVmZmVyQXJnc1xuICAgICAgICAgIHZhciBFTEVNRU5UX1NUQVRFID0gc2hhcmVkLmVsZW1lbnRzXG5cbiAgICAgICAgICB2YXIgZWxlbWVudERlZm4gPSBlbnYuaW52b2tlKHNjb3BlLCBkeW4pXG4gICAgICAgICAgdmFyIGVsZW1lbnRzID0gc2NvcGUuZGVmKCdudWxsJylcbiAgICAgICAgICB2YXIgZWxlbWVudFN0cmVhbSA9IHNjb3BlLmRlZihJU19CVUZGRVJfQVJHUywgJygnLCBlbGVtZW50RGVmbiwgJyknKVxuXG4gICAgICAgICAgdmFyIGlmdGUgPSBlbnYuY29uZChlbGVtZW50U3RyZWFtKVxuICAgICAgICAgICAgLnRoZW4oZWxlbWVudHMsICc9JywgRUxFTUVOVF9TVEFURSwgJy5jcmVhdGVTdHJlYW0oJywgZWxlbWVudERlZm4sICcpOycpXG4gICAgICAgICAgICAuZWxzZShlbGVtZW50cywgJz0nLCBFTEVNRU5UX1NUQVRFLCAnLmdldEVsZW1lbnRzKCcsIGVsZW1lbnREZWZuLCAnKTsnKVxuXG4gICAgICAgICAgXG5cbiAgICAgICAgICBzY29wZS5lbnRyeShpZnRlKVxuICAgICAgICAgIHNjb3BlLmV4aXQoXG4gICAgICAgICAgICBlbnYuY29uZChlbGVtZW50U3RyZWFtKVxuICAgICAgICAgICAgICAudGhlbihFTEVNRU5UX1NUQVRFLCAnLmRlc3Ryb3lTdHJlYW0oJywgZWxlbWVudHMsICcpOycpKVxuXG4gICAgICAgICAgZW52LkVMRU1FTlRTID0gZWxlbWVudHNcblxuICAgICAgICAgIHJldHVybiBlbGVtZW50c1xuICAgICAgICB9KVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cblxuICAgIHZhciBlbGVtZW50cyA9IHBhcnNlRWxlbWVudHMoKVxuXG4gICAgZnVuY3Rpb24gcGFyc2VQcmltaXRpdmUgKCkge1xuICAgICAgaWYgKFNfUFJJTUlUSVZFIGluIHN0YXRpY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIHByaW1pdGl2ZSA9IHN0YXRpY09wdGlvbnNbU19QUklNSVRJVkVdXG4gICAgICAgIFxuICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHJldHVybiBwcmltVHlwZXNbcHJpbWl0aXZlXVxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIGlmIChTX1BSSU1JVElWRSBpbiBkeW5hbWljT3B0aW9ucykge1xuICAgICAgICB2YXIgZHluUHJpbWl0aXZlID0gZHluYW1pY09wdGlvbnNbU19QUklNSVRJVkVdXG4gICAgICAgIHJldHVybiBjcmVhdGVEeW5hbWljRGVjbChkeW5QcmltaXRpdmUsIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgdmFyIFBSSU1fVFlQRVMgPSBlbnYuY29uc3RhbnRzLnByaW1UeXBlc1xuICAgICAgICAgIHZhciBwcmltID0gZW52Lmludm9rZShzY29wZSwgZHluUHJpbWl0aXZlKVxuICAgICAgICAgIFxuICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoUFJJTV9UWVBFUywgJ1snLCBwcmltLCAnXScpXG4gICAgICAgIH0pXG4gICAgICB9IGVsc2UgaWYgKGVsZW1lbnRzKSB7XG4gICAgICAgIGlmIChpc1N0YXRpYyhlbGVtZW50cykpIHtcbiAgICAgICAgICBpZiAoZWxlbWVudHMudmFsdWUpIHtcbiAgICAgICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoZW52LkVMRU1FTlRTLCAnLnByaW1UeXBlJylcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIEdMX1RSSUFOR0xFU1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIG5ldyBEZWNsYXJhdGlvbihcbiAgICAgICAgICAgIGVsZW1lbnRzLnRoaXNEZXAsXG4gICAgICAgICAgICBlbGVtZW50cy5jb250ZXh0RGVwLFxuICAgICAgICAgICAgZWxlbWVudHMucHJvcERlcCxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgICAgIHZhciBlbGVtZW50cyA9IGVudi5FTEVNRU5UU1xuICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKGVsZW1lbnRzLCAnPycsIGVsZW1lbnRzLCAnLnByaW1UeXBlOicsIEdMX1RSSUFOR0xFUylcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcGFyc2VQYXJhbSAocGFyYW0sIGlzT2Zmc2V0KSB7XG4gICAgICBpZiAocGFyYW0gaW4gc3RhdGljT3B0aW9ucykge1xuICAgICAgICB2YXIgdmFsdWUgPSBzdGF0aWNPcHRpb25zW3BhcmFtXSB8IDBcbiAgICAgICAgXG4gICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgaWYgKGlzT2Zmc2V0KSB7XG4gICAgICAgICAgICBlbnYuT0ZGU0VUID0gdmFsdWVcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHZhbHVlXG4gICAgICAgIH0pXG4gICAgICB9IGVsc2UgaWYgKHBhcmFtIGluIGR5bmFtaWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBkeW5WYWx1ZSA9IGR5bmFtaWNPcHRpb25zW3BhcmFtXVxuICAgICAgICByZXR1cm4gY3JlYXRlRHluYW1pY0RlY2woZHluVmFsdWUsIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgdmFyIHJlc3VsdCA9IGVudi5pbnZva2Uoc2NvcGUsIGR5blZhbHVlKVxuICAgICAgICAgIGlmIChpc09mZnNldCkge1xuICAgICAgICAgICAgZW52Lk9GRlNFVCA9IHJlc3VsdFxuICAgICAgICAgICAgXG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSBpZiAoaXNPZmZzZXQgJiYgZWxlbWVudHMpIHtcbiAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICBlbnYuT0ZGU0VUID0gJzAnXG4gICAgICAgICAgcmV0dXJuIDBcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuXG4gICAgdmFyIE9GRlNFVCA9IHBhcnNlUGFyYW0oU19PRkZTRVQsIHRydWUpXG5cbiAgICBmdW5jdGlvbiBwYXJzZVZlcnRDb3VudCAoKSB7XG4gICAgICBpZiAoU19DT1VOVCBpbiBzdGF0aWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBjb3VudCA9IHN0YXRpY09wdGlvbnNbU19DT1VOVF0gfCAwXG4gICAgICAgIFxuICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcmV0dXJuIGNvdW50XG4gICAgICAgIH0pXG4gICAgICB9IGVsc2UgaWYgKFNfQ09VTlQgaW4gZHluYW1pY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIGR5bkNvdW50ID0gZHluYW1pY09wdGlvbnNbU19DT1VOVF1cbiAgICAgICAgcmV0dXJuIGNyZWF0ZUR5bmFtaWNEZWNsKGR5bkNvdW50LCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciByZXN1bHQgPSBlbnYuaW52b2tlKHNjb3BlLCBkeW5Db3VudClcbiAgICAgICAgICBcbiAgICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICAgIH0pXG4gICAgICB9IGVsc2UgaWYgKGVsZW1lbnRzKSB7XG4gICAgICAgIGlmIChpc1N0YXRpYyhlbGVtZW50cykpIHtcbiAgICAgICAgICBpZiAoZWxlbWVudHMpIHtcbiAgICAgICAgICAgIGlmIChPRkZTRVQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG5ldyBEZWNsYXJhdGlvbihcbiAgICAgICAgICAgICAgICBPRkZTRVQudGhpc0RlcCxcbiAgICAgICAgICAgICAgICBPRkZTRVQuY29udGV4dERlcCxcbiAgICAgICAgICAgICAgICBPRkZTRVQucHJvcERlcCxcbiAgICAgICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgICAgICAgICAgdmFyIHJlc3VsdCA9IHNjb3BlLmRlZihcbiAgICAgICAgICAgICAgICAgICAgZW52LkVMRU1FTlRTLCAnLnZlcnRDb3VudC0nLCBlbnYuT0ZGU0VUKVxuXG4gICAgICAgICAgICAgICAgICBcblxuICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoZW52LkVMRU1FTlRTLCAnLnZlcnRDb3VudCcpXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciByZXN1bHQgPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIC0xXG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHZhciB2YXJpYWJsZSA9IG5ldyBEZWNsYXJhdGlvbihcbiAgICAgICAgICAgIGVsZW1lbnRzLnRoaXNEZXAgfHwgT0ZGU0VULnRoaXNEZXAsXG4gICAgICAgICAgICBlbGVtZW50cy5jb250ZXh0RGVwIHx8IE9GRlNFVC5jb250ZXh0RGVwLFxuICAgICAgICAgICAgZWxlbWVudHMucHJvcERlcCB8fCBPRkZTRVQucHJvcERlcCxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgICAgIHZhciBlbGVtZW50cyA9IGVudi5FTEVNRU5UU1xuICAgICAgICAgICAgICBpZiAoZW52Lk9GRlNFVCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoZWxlbWVudHMsICc/JywgZWxlbWVudHMsICcudmVydENvdW50LScsXG4gICAgICAgICAgICAgICAgICBlbnYuT0ZGU0VULCAnOi0xJylcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKGVsZW1lbnRzLCAnPycsIGVsZW1lbnRzLCAnLnZlcnRDb3VudDotMScpXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIFxuICAgICAgICAgIHJldHVybiB2YXJpYWJsZVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBlbGVtZW50czogZWxlbWVudHMsXG4gICAgICBwcmltaXRpdmU6IHBhcnNlUHJpbWl0aXZlKCksXG4gICAgICBjb3VudDogcGFyc2VWZXJ0Q291bnQoKSxcbiAgICAgIGluc3RhbmNlczogcGFyc2VQYXJhbShTX0lOU1RBTkNFUywgZmFsc2UpLFxuICAgICAgb2Zmc2V0OiBPRkZTRVRcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZUdMU3RhdGUgKG9wdGlvbnMsIGVudikge1xuICAgIHZhciBzdGF0aWNPcHRpb25zID0gb3B0aW9ucy5zdGF0aWNcbiAgICB2YXIgZHluYW1pY09wdGlvbnMgPSBvcHRpb25zLmR5bmFtaWNcblxuICAgIHZhciBTVEFURSA9IHt9XG5cbiAgICBHTF9TVEFURV9OQU1FUy5mb3JFYWNoKGZ1bmN0aW9uIChwcm9wKSB7XG4gICAgICB2YXIgcGFyYW0gPSBwcm9wTmFtZShwcm9wKVxuXG4gICAgICBmdW5jdGlvbiBwYXJzZVBhcmFtIChwYXJzZVN0YXRpYywgcGFyc2VEeW5hbWljKSB7XG4gICAgICAgIGlmIChwcm9wIGluIHN0YXRpY09wdGlvbnMpIHtcbiAgICAgICAgICB2YXIgdmFsdWUgPSBwYXJzZVN0YXRpYyhzdGF0aWNPcHRpb25zW3Byb3BdKVxuICAgICAgICAgIFNUQVRFW3BhcmFtXSA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHZhbHVlXG4gICAgICAgICAgfSlcbiAgICAgICAgfSBlbHNlIGlmIChwcm9wIGluIGR5bmFtaWNPcHRpb25zKSB7XG4gICAgICAgICAgdmFyIGR5biA9IGR5bmFtaWNPcHRpb25zW3Byb3BdXG4gICAgICAgICAgU1RBVEVbcGFyYW1dID0gY3JlYXRlRHluYW1pY0RlY2woZHluLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgICAgcmV0dXJuIHBhcnNlRHluYW1pYyhlbnYsIHNjb3BlLCBlbnYuaW52b2tlKHNjb3BlLCBkeW4pKVxuICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgc3dpdGNoIChwcm9wKSB7XG4gICAgICAgIGNhc2UgU19DVUxMX0VOQUJMRTpcbiAgICAgICAgY2FzZSBTX0JMRU5EX0VOQUJMRTpcbiAgICAgICAgY2FzZSBTX0RJVEhFUjpcbiAgICAgICAgY2FzZSBTX1NURU5DSUxfRU5BQkxFOlxuICAgICAgICBjYXNlIFNfREVQVEhfRU5BQkxFOlxuICAgICAgICBjYXNlIFNfU0NJU1NPUl9FTkFCTEU6XG4gICAgICAgIGNhc2UgU19QT0xZR09OX09GRlNFVF9FTkFCTEU6XG4gICAgICAgIGNhc2UgU19TQU1QTEVfQUxQSEE6XG4gICAgICAgIGNhc2UgU19TQU1QTEVfRU5BQkxFOlxuICAgICAgICBjYXNlIFNfREVQVEhfTUFTSzpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gdmFsdWVcbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX0RFUFRIX0ZVTkM6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBjb21wYXJlRnVuY3NbdmFsdWVdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIHZhciBDT01QQVJFX0ZVTkNTID0gZW52LmNvbnN0YW50cy5jb21wYXJlRnVuY3NcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoQ09NUEFSRV9GVU5DUywgJ1snLCB2YWx1ZSwgJ10nKVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfREVQVEhfUkFOR0U6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBcblxuICAgICAgICAgICAgICB2YXIgWl9ORUFSID0gc2NvcGUuZGVmKCcrJywgdmFsdWUsICdbMF0nKVxuICAgICAgICAgICAgICB2YXIgWl9GQVIgPSBzY29wZS5kZWYoJysnLCB2YWx1ZSwgJ1sxXScpXG4gICAgICAgICAgICAgIHJldHVybiBbWl9ORUFSLCBaX0ZBUl1cbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX0JMRU5EX0ZVTkM6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHZhciBzcmNSR0IgPSAoJ3NyY1JHQicgaW4gdmFsdWUgPyB2YWx1ZS5zcmNSR0IgOiB2YWx1ZS5zcmMpXG4gICAgICAgICAgICAgIHZhciBzcmNBbHBoYSA9ICgnc3JjQWxwaGEnIGluIHZhbHVlID8gdmFsdWUuc3JjQWxwaGEgOiB2YWx1ZS5zcmMpXG4gICAgICAgICAgICAgIHZhciBkc3RSR0IgPSAoJ2RzdFJHQicgaW4gdmFsdWUgPyB2YWx1ZS5kc3RSR0IgOiB2YWx1ZS5kc3QpXG4gICAgICAgICAgICAgIHZhciBkc3RBbHBoYSA9ICgnZHN0QWxwaGEnIGluIHZhbHVlID8gdmFsdWUuZHN0QWxwaGEgOiB2YWx1ZS5kc3QpXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICAgICAgYmxlbmRGdW5jc1tzcmNSR0JdLFxuICAgICAgICAgICAgICAgIGJsZW5kRnVuY3NbZHN0UkdCXSxcbiAgICAgICAgICAgICAgICBibGVuZEZ1bmNzW3NyY0FscGhhXSxcbiAgICAgICAgICAgICAgICBibGVuZEZ1bmNzW2RzdEFscGhhXVxuICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIHZhciBCTEVORF9GVU5DUyA9IGVudi5jb25zdGFudHMuYmxlbmRGdW5jc1xuXG4gICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgIGZ1bmN0aW9uIHJlYWQgKHByZWZpeCwgc3VmZml4KSB7XG4gICAgICAgICAgICAgICAgdmFyIGZ1bmMgPSBzY29wZS5kZWYoXG4gICAgICAgICAgICAgICAgICAnXCInLCBwcmVmaXgsIHN1ZmZpeCwgJ1wiIGluICcsIHZhbHVlLFxuICAgICAgICAgICAgICAgICAgJz8nLCB2YWx1ZSwgJy4nLCBwcmVmaXgsIHN1ZmZpeCxcbiAgICAgICAgICAgICAgICAgICc6JywgdmFsdWUsICcuJywgcHJlZml4KVxuXG4gICAgICAgICAgICAgICAgXG5cbiAgICAgICAgICAgICAgICByZXR1cm4gZnVuY1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgdmFyIHNyY1JHQiA9IHJlYWQoJ3NyYycsICdSR0InKVxuICAgICAgICAgICAgICB2YXIgZHN0UkdCID0gcmVhZCgnZHN0JywgJ1JHQicpXG5cbiAgICAgICAgICAgICAgXG5cbiAgICAgICAgICAgICAgdmFyIFNSQ19SR0IgPSBzY29wZS5kZWYoQkxFTkRfRlVOQ1MsICdbJywgc3JjUkdCLCAnXScpXG4gICAgICAgICAgICAgIHZhciBTUkNfQUxQSEEgPSBzY29wZS5kZWYoQkxFTkRfRlVOQ1MsICdbJywgcmVhZCgnc3JjJywgJ0FscGhhJyksICddJylcbiAgICAgICAgICAgICAgdmFyIERTVF9SR0IgPSBzY29wZS5kZWYoQkxFTkRfRlVOQ1MsICdbJywgZHN0UkdCLCAnXScpXG4gICAgICAgICAgICAgIHZhciBEU1RfQUxQSEEgPSBzY29wZS5kZWYoQkxFTkRfRlVOQ1MsICdbJywgcmVhZCgnZHN0JywgJ0FscGhhJyksICddJylcblxuICAgICAgICAgICAgICByZXR1cm4gW1NSQ19SR0IsIERTVF9SR0IsIFNSQ19BTFBIQSwgRFNUX0FMUEhBXVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfQkxFTkRfRVFVQVRJT046XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgICAgICAgYmxlbmRFcXVhdGlvbnNbdmFsdWVdLFxuICAgICAgICAgICAgICAgICAgYmxlbmRFcXVhdGlvbnNbdmFsdWVdXG4gICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgICAgICAgYmxlbmRFcXVhdGlvbnNbdmFsdWUucmdiXSxcbiAgICAgICAgICAgICAgICAgIGJsZW5kRXF1YXRpb25zW3ZhbHVlLmFscGhhXVxuICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICB2YXIgQkxFTkRfRVFVQVRJT05TID0gZW52LmNvbnN0YW50cy5ibGVuZEVxdWF0aW9uc1xuXG4gICAgICAgICAgICAgIHZhciBSR0IgPSBzY29wZS5kZWYoKVxuICAgICAgICAgICAgICB2YXIgQUxQSEEgPSBzY29wZS5kZWYoKVxuXG4gICAgICAgICAgICAgIHZhciBpZnRlID0gZW52LmNvbmQoJ3R5cGVvZiAnLCB2YWx1ZSwgJz09PVwic3RyaW5nXCInKVxuXG4gICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgIGlmdGUudGhlbihcbiAgICAgICAgICAgICAgICBSR0IsICc9JywgQUxQSEEsICc9JywgQkxFTkRfRVFVQVRJT05TLCAnWycsIHZhbHVlLCAnXTsnKVxuICAgICAgICAgICAgICBpZnRlLmVsc2UoXG4gICAgICAgICAgICAgICAgUkdCLCAnPScsIEJMRU5EX0VRVUFUSU9OUywgJ1snLCB2YWx1ZSwgJy5yZ2JdOycsXG4gICAgICAgICAgICAgICAgQUxQSEEsICc9JywgQkxFTkRfRVFVQVRJT05TLCAnWycsIHZhbHVlLCAnLmFscGhhXTsnKVxuXG4gICAgICAgICAgICAgIHNjb3BlKGlmdGUpXG5cbiAgICAgICAgICAgICAgcmV0dXJuIFtSR0IsIEFMUEhBXVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfQkxFTkRfQ09MT1I6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBsb29wKDQsIGZ1bmN0aW9uIChpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICt2YWx1ZVtpXVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIGxvb3AoNCwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKCcrJywgdmFsdWUsICdbJywgaSwgJ10nKVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfU1RFTkNJTF9NQVNLOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gdmFsdWUgfCAwXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKHZhbHVlLCAnfDAnKVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfU1RFTkNJTF9GVU5DOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICB2YXIgY21wID0gdmFsdWUuY21wIHx8ICdrZWVwJ1xuICAgICAgICAgICAgICB2YXIgcmVmID0gdmFsdWUucmVmIHx8IDBcbiAgICAgICAgICAgICAgdmFyIG1hc2sgPSAnbWFzaycgaW4gdmFsdWUgPyB2YWx1ZS5tYXNrIDogLTFcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgICBjb21wYXJlRnVuY3NbY21wXSxcbiAgICAgICAgICAgICAgICByZWYsXG4gICAgICAgICAgICAgICAgbWFza1xuICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIHZhciBDT01QQVJFX0ZVTkNTID0gZW52LmNvbnN0YW50cy5jb21wYXJlRnVuY3NcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHZhciBjbXAgPSBzY29wZS5kZWYoXG4gICAgICAgICAgICAgICAgJ1wiY21wXCIgaW4gJywgdmFsdWUsXG4gICAgICAgICAgICAgICAgJz8nLCBDT01QQVJFX0ZVTkNTLCAnWycsIHZhbHVlLCAnLmNtcF0nLFxuICAgICAgICAgICAgICAgICc6JywgR0xfS0VFUClcbiAgICAgICAgICAgICAgdmFyIHJlZiA9IHNjb3BlLmRlZih2YWx1ZSwgJy5yZWZ8MCcpXG4gICAgICAgICAgICAgIHZhciBtYXNrID0gc2NvcGUuZGVmKFxuICAgICAgICAgICAgICAgICdcIm1hc2tcIiBpbiAnLCB2YWx1ZSxcbiAgICAgICAgICAgICAgICAnPycsIHZhbHVlLCAnLm1hc2t8MDotMScpXG4gICAgICAgICAgICAgIHJldHVybiBbY21wLCByZWYsIG1hc2tdXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19TVEVOQ0lMX09QRlJPTlQ6XG4gICAgICAgIGNhc2UgU19TVEVOQ0lMX09QQkFDSzpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgdmFyIGZhaWwgPSB2YWx1ZS5mYWlsIHx8ICdrZWVwJ1xuICAgICAgICAgICAgICB2YXIgemZhaWwgPSB2YWx1ZS56ZmFpbCB8fCAna2VlcCdcbiAgICAgICAgICAgICAgdmFyIHpwYXNzID0gdmFsdWUuenBhc3MgfHwgJ2tlZXAnXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICAgICAgcHJvcCA9PT0gU19TVEVOQ0lMX09QQkFDSyA/IEdMX0JBQ0sgOiBHTF9GUk9OVCxcbiAgICAgICAgICAgICAgICBzdGVuY2lsT3BzW2ZhaWxdLFxuICAgICAgICAgICAgICAgIHN0ZW5jaWxPcHNbemZhaWxdLFxuICAgICAgICAgICAgICAgIHN0ZW5jaWxPcHNbenBhc3NdXG4gICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgdmFyIFNURU5DSUxfT1BTID0gZW52LmNvbnN0YW50cy5zdGVuY2lsT3BzXG5cbiAgICAgICAgICAgICAgXG5cbiAgICAgICAgICAgICAgZnVuY3Rpb24gcmVhZCAobmFtZSkge1xuICAgICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihcbiAgICAgICAgICAgICAgICAgICdcIicsIG5hbWUsICdcIiBpbiAnLCB2YWx1ZSxcbiAgICAgICAgICAgICAgICAgICc/JywgU1RFTkNJTF9PUFMsICdbJywgdmFsdWUsICcuJywgbmFtZSwgJ106JyxcbiAgICAgICAgICAgICAgICAgIEdMX0tFRVApXG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgICAgIHByb3AgPT09IFNfU1RFTkNJTF9PUEJBQ0sgPyBHTF9CQUNLIDogR0xfRlJPTlQsXG4gICAgICAgICAgICAgICAgcmVhZCgnZmFpbCcpLFxuICAgICAgICAgICAgICAgIHJlYWQoJ3pmYWlsJyksXG4gICAgICAgICAgICAgICAgcmVhZCgnenBhc3MnKVxuICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19QT0xZR09OX09GRlNFVF9PRkZTRVQ6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHZhciBmYWN0b3IgPSB2YWx1ZS5mYWN0b3IgfCAwXG4gICAgICAgICAgICAgIHZhciB1bml0cyA9IHZhbHVlLnVuaXRzIHwgMFxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBbZmFjdG9yLCB1bml0c11cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgXG5cbiAgICAgICAgICAgICAgdmFyIEZBQ1RPUiA9IHNjb3BlLmRlZih2YWx1ZSwgJy5mYWN0b3J8MCcpXG4gICAgICAgICAgICAgIHZhciBVTklUUyA9IHNjb3BlLmRlZih2YWx1ZSwgJy51bml0c3wwJylcblxuICAgICAgICAgICAgICByZXR1cm4gW0ZBQ1RPUiwgVU5JVFNdXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19DVUxMX0ZBQ0U6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgdmFyIGZhY2UgPSAwXG4gICAgICAgICAgICAgIGlmICh2YWx1ZSA9PT0gJ2Zyb250Jykge1xuICAgICAgICAgICAgICAgIGZhY2UgPSBHTF9GUk9OVFxuICAgICAgICAgICAgICB9IGVsc2UgaWYgKHZhbHVlID09PSAnYmFjaycpIHtcbiAgICAgICAgICAgICAgICBmYWNlID0gR0xfQkFDS1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gZmFjZVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZih2YWx1ZSwgJz09PVwiZnJvbnRcIj8nLCBHTF9GUk9OVCwgJzonLCBHTF9CQUNLKVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfTElORV9XSURUSDpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfRlJPTlRfRkFDRTpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIG9yaWVudGF0aW9uVHlwZVt2YWx1ZV1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYodmFsdWUgKyAnPT09XCJjd1wiPycgKyBHTF9DVyArICc6JyArIEdMX0NDVylcbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX0NPTE9SX01BU0s6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZS5tYXAoZnVuY3Rpb24gKHYpIHsgcmV0dXJuICEhdiB9KVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIGxvb3AoNCwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gJyEhJyArIHZhbHVlICsgJ1snICsgaSArICddJ1xuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfU0FNUExFX0NPVkVSQUdFOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICB2YXIgc2FtcGxlVmFsdWUgPSAndmFsdWUnIGluIHZhbHVlID8gdmFsdWUudmFsdWUgOiAxXG4gICAgICAgICAgICAgIHZhciBzYW1wbGVJbnZlcnQgPSAhIXZhbHVlLmludmVydFxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIFtzYW1wbGVWYWx1ZSwgc2FtcGxlSW52ZXJ0XVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgdmFyIFZBTFVFID0gc2NvcGUuZGVmKFxuICAgICAgICAgICAgICAgICdcInZhbHVlXCIgaW4gJywgdmFsdWUsICc/KycsIHZhbHVlLCAnLnZhbHVlOjEnKVxuICAgICAgICAgICAgICB2YXIgSU5WRVJUID0gc2NvcGUuZGVmKCchIScsIHZhbHVlLCAnLmludmVydCcpXG4gICAgICAgICAgICAgIHJldHVybiBbVkFMVUUsIElOVkVSVF1cbiAgICAgICAgICAgIH0pXG4gICAgICB9XG4gICAgfSlcblxuICAgIHJldHVybiBTVEFURVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VVbmlmb3JtcyAodW5pZm9ybXMsIGVudikge1xuICAgIHZhciBzdGF0aWNVbmlmb3JtcyA9IHVuaWZvcm1zLnN0YXRpY1xuICAgIHZhciBkeW5hbWljVW5pZm9ybXMgPSB1bmlmb3Jtcy5keW5hbWljXG5cbiAgICB2YXIgVU5JRk9STVMgPSB7fVxuXG4gICAgT2JqZWN0LmtleXMoc3RhdGljVW5pZm9ybXMpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHZhciB2YWx1ZSA9IHN0YXRpY1VuaWZvcm1zW25hbWVdXG4gICAgICB2YXIgcmVzdWx0XG4gICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyB8fFxuICAgICAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgIHJlc3VsdCA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHJldHVybiB2YWx1ZVxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgdmFsdWUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgdmFyIHJlZ2xUeXBlID0gdmFsdWUuX3JlZ2xUeXBlXG4gICAgICAgIGlmIChyZWdsVHlwZSA9PT0gJ3RleHR1cmUyZCcgfHxcbiAgICAgICAgICAgIHJlZ2xUeXBlID09PSAndGV4dHVyZUN1YmUnKSB7XG4gICAgICAgICAgcmVzdWx0ID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52KSB7XG4gICAgICAgICAgICByZXR1cm4gZW52LmxpbmsodmFsdWUpXG4gICAgICAgICAgfSlcbiAgICAgICAgfSBlbHNlIGlmIChyZWdsVHlwZSA9PT0gJ2ZyYW1lYnVmZmVyJyB8fFxuICAgICAgICAgICAgICAgICAgIHJlZ2xUeXBlID09PSAnZnJhbWVidWZmZXJDdWJlJykge1xuICAgICAgICAgIFxuICAgICAgICAgIHJlc3VsdCA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudikge1xuICAgICAgICAgICAgcmV0dXJuIGVudi5saW5rKHZhbHVlLmNvbG9yWzBdKVxuICAgICAgICAgIH0pXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoaXNBcnJheUxpa2UodmFsdWUpKSB7XG4gICAgICAgIHJlc3VsdCA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudikge1xuICAgICAgICAgIHZhciBJVEVNID0gZW52Lmdsb2JhbC5kZWYoJ1snLFxuICAgICAgICAgICAgbG9vcCh2YWx1ZS5sZW5ndGgsIGZ1bmN0aW9uIChpKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gdmFsdWVbaV1cbiAgICAgICAgICAgIH0pLCAnXScpXG4gICAgICAgICAgcmV0dXJuIElURU1cbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIFxuICAgICAgfVxuICAgICAgcmVzdWx0LnZhbHVlID0gdmFsdWVcbiAgICAgIFVOSUZPUk1TW25hbWVdID0gcmVzdWx0XG4gICAgfSlcblxuICAgIE9iamVjdC5rZXlzKGR5bmFtaWNVbmlmb3JtcykuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICB2YXIgZHluID0gZHluYW1pY1VuaWZvcm1zW2tleV1cbiAgICAgIFVOSUZPUk1TW2tleV0gPSBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgIHJldHVybiBlbnYuaW52b2tlKHNjb3BlLCBkeW4pXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICByZXR1cm4gVU5JRk9STVNcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlQXR0cmlidXRlcyAoYXR0cmlidXRlcywgZW52KSB7XG4gICAgdmFyIHN0YXRpY0F0dHJpYnV0ZXMgPSBhdHRyaWJ1dGVzLnN0YXRpY1xuICAgIHZhciBkeW5hbWljQXR0cmlidXRlcyA9IGF0dHJpYnV0ZXMuZHluYW1pY1xuXG4gICAgdmFyIGF0dHJpYnV0ZURlZnMgPSB7fVxuXG4gICAgT2JqZWN0LmtleXMoc3RhdGljQXR0cmlidXRlcykuZm9yRWFjaChmdW5jdGlvbiAoYXR0cmlidXRlKSB7XG4gICAgICB2YXIgdmFsdWUgPSBzdGF0aWNBdHRyaWJ1dGVzW2F0dHJpYnV0ZV1cbiAgICAgIHZhciBpZCA9IHN0cmluZ1N0b3JlLmlkKGF0dHJpYnV0ZSlcblxuICAgICAgdmFyIHJlY29yZCA9IG5ldyBBdHRyaWJ1dGVSZWNvcmQoKVxuICAgICAgaWYgKGlzQnVmZmVyQXJncyh2YWx1ZSkpIHtcbiAgICAgICAgcmVjb3JkLnN0YXRlID0gQVRUUklCX1NUQVRFX1BPSU5URVJcbiAgICAgICAgcmVjb3JkLmJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmdldEJ1ZmZlcihcbiAgICAgICAgICBidWZmZXJTdGF0ZS5jcmVhdGUodmFsdWUsIEdMX0FSUkFZX0JVRkZFUiwgZmFsc2UsIHRydWUpKVxuICAgICAgICByZWNvcmQudHlwZSA9IDBcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBidWZmZXIgPSBidWZmZXJTdGF0ZS5nZXRCdWZmZXIodmFsdWUpXG4gICAgICAgIGlmIChidWZmZXIpIHtcbiAgICAgICAgICByZWNvcmQuc3RhdGUgPSBBVFRSSUJfU1RBVEVfUE9JTlRFUlxuICAgICAgICAgIHJlY29yZC5idWZmZXIgPSBidWZmZXJcbiAgICAgICAgICByZWNvcmQudHlwZSA9IDBcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBcbiAgICAgICAgICBpZiAodmFsdWUuY29uc3RhbnQpIHtcbiAgICAgICAgICAgIHZhciBjb25zdGFudCA9IHZhbHVlLmNvbnN0YW50XG4gICAgICAgICAgICByZWNvcmQuYnVmZmVyID0gJ251bGwnXG4gICAgICAgICAgICByZWNvcmQuc3RhdGUgPSBBVFRSSUJfU1RBVEVfQ09OU1RBTlRcbiAgICAgICAgICAgIGlmICh0eXBlb2YgY29uc3RhbnQgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICAgIHJlY29yZC54ID0gY29uc3RhbnRcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBDVVRFX0NPTVBPTkVOVFMuZm9yRWFjaChmdW5jdGlvbiAoYywgaSkge1xuICAgICAgICAgICAgICAgIGlmIChpIDwgY29uc3RhbnQubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICByZWNvcmRbY10gPSBjb25zdGFudFtpXVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKGlzQnVmZmVyQXJncyh2YWx1ZS5idWZmZXIpKSB7XG4gICAgICAgICAgICAgIGJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmdldEJ1ZmZlcihcbiAgICAgICAgICAgICAgICBidWZmZXJTdGF0ZS5jcmVhdGUodmFsdWUuYnVmZmVyLCBHTF9BUlJBWV9CVUZGRVIsIGZhbHNlLCB0cnVlKSlcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmdldEJ1ZmZlcih2YWx1ZS5idWZmZXIpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcblxuICAgICAgICAgICAgdmFyIG9mZnNldCA9IHZhbHVlLm9mZnNldCB8IDBcbiAgICAgICAgICAgIFxuXG4gICAgICAgICAgICB2YXIgc3RyaWRlID0gdmFsdWUuc3RyaWRlIHwgMFxuICAgICAgICAgICAgXG5cbiAgICAgICAgICAgIHZhciBzaXplID0gdmFsdWUuc2l6ZSB8IDBcbiAgICAgICAgICAgIFxuXG4gICAgICAgICAgICB2YXIgbm9ybWFsaXplZCA9ICEhdmFsdWUubm9ybWFsaXplZFxuXG4gICAgICAgICAgICB2YXIgdHlwZSA9IDBcbiAgICAgICAgICAgIGlmICgndHlwZScgaW4gdmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHR5cGUgPSBnbFR5cGVzW3ZhbHVlLnR5cGVdXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBkaXZpc29yID0gdmFsdWUuZGl2aXNvciB8IDBcbiAgICAgICAgICAgIGlmICgnZGl2aXNvcicgaW4gdmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBcblxuICAgICAgICAgICAgcmVjb3JkLmJ1ZmZlciA9IGJ1ZmZlclxuICAgICAgICAgICAgcmVjb3JkLnN0YXRlID0gQVRUUklCX1NUQVRFX1BPSU5URVJcbiAgICAgICAgICAgIHJlY29yZC5zaXplID0gc2l6ZVxuICAgICAgICAgICAgcmVjb3JkLm5vcm1hbGl6ZWQgPSBub3JtYWxpemVkXG4gICAgICAgICAgICByZWNvcmQudHlwZSA9IHR5cGUgfHwgYnVmZmVyLmR0eXBlXG4gICAgICAgICAgICByZWNvcmQub2Zmc2V0ID0gb2Zmc2V0XG4gICAgICAgICAgICByZWNvcmQuc3RyaWRlID0gc3RyaWRlXG4gICAgICAgICAgICByZWNvcmQuZGl2aXNvciA9IGRpdmlzb3JcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgYXR0cmlidXRlRGVmc1thdHRyaWJ1dGVdID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICB2YXIgY2FjaGUgPSBlbnYuYXR0cmliQ2FjaGVcbiAgICAgICAgaWYgKGlkIGluIGNhY2hlKSB7XG4gICAgICAgICAgcmV0dXJuIGNhY2hlW2lkXVxuICAgICAgICB9XG4gICAgICAgIHZhciByZXN1bHQgPSB7XG4gICAgICAgICAgaXNTdHJlYW06IGZhbHNlXG4gICAgICAgIH1cbiAgICAgICAgT2JqZWN0LmtleXMocmVjb3JkKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgICByZXN1bHRba2V5XSA9IHJlY29yZFtrZXldXG4gICAgICAgIH0pXG4gICAgICAgIGlmIChyZWNvcmQuYnVmZmVyKSB7XG4gICAgICAgICAgcmVzdWx0LmJ1ZmZlciA9IGVudi5saW5rKHJlY29yZC5idWZmZXIpXG4gICAgICAgICAgcmVzdWx0LnR5cGUgPSByZXN1bHQudHlwZSB8fCAocmVzdWx0LmJ1ZmZlciArICcuZHR5cGUnKVxuICAgICAgICB9XG4gICAgICAgIGNhY2hlW2lkXSA9IHJlc3VsdFxuICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBPYmplY3Qua2V5cyhkeW5hbWljQXR0cmlidXRlcykuZm9yRWFjaChmdW5jdGlvbiAoYXR0cmlidXRlKSB7XG4gICAgICB2YXIgZHluID0gZHluYW1pY0F0dHJpYnV0ZXNbYXR0cmlidXRlXVxuXG4gICAgICBmdW5jdGlvbiBhcHBlbmRBdHRyaWJ1dGVDb2RlIChlbnYsIGJsb2NrKSB7XG4gICAgICAgIHZhciBWQUxVRSA9IGVudi5pbnZva2UoYmxvY2ssIGR5bilcblxuICAgICAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuXG4gICAgICAgIHZhciBJU19CVUZGRVJfQVJHUyA9IHNoYXJlZC5pc0J1ZmZlckFyZ3NcbiAgICAgICAgdmFyIEJVRkZFUl9TVEFURSA9IHNoYXJlZC5idWZmZXJcblxuICAgICAgICAvLyBQZXJmb3JtIHZhbGlkYXRpb24gb24gYXR0cmlidXRlXG4gICAgICAgIFxuXG4gICAgICAgIC8vIGFsbG9jYXRlIG5hbWVzIGZvciByZXN1bHRcbiAgICAgICAgdmFyIHJlc3VsdCA9IHtcbiAgICAgICAgICBpc1N0cmVhbTogYmxvY2suZGVmKGZhbHNlKVxuICAgICAgICB9XG4gICAgICAgIHZhciBkZWZhdWx0UmVjb3JkID0gbmV3IEF0dHJpYnV0ZVJlY29yZCgpXG4gICAgICAgIGRlZmF1bHRSZWNvcmQuc3RhdGUgPSBBVFRSSUJfU1RBVEVfUE9JTlRFUlxuICAgICAgICBPYmplY3Qua2V5cyhkZWZhdWx0UmVjb3JkKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgICByZXN1bHRba2V5XSA9IGJsb2NrLmRlZignJyArIGRlZmF1bHRSZWNvcmRba2V5XSlcbiAgICAgICAgfSlcblxuICAgICAgICB2YXIgQlVGRkVSID0gcmVzdWx0LmJ1ZmZlclxuICAgICAgICB2YXIgVFlQRSA9IHJlc3VsdC50eXBlXG4gICAgICAgIGJsb2NrKFxuICAgICAgICAgICdpZignLCBJU19CVUZGRVJfQVJHUywgJygnLCBWQUxVRSwgJykpeycsXG4gICAgICAgICAgcmVzdWx0LmlzU3RyZWFtLCAnPXRydWU7JyxcbiAgICAgICAgICBCVUZGRVIsICc9JywgQlVGRkVSX1NUQVRFLCAnLmNyZWF0ZVN0cmVhbSgnLCBHTF9BUlJBWV9CVUZGRVIsICcsJywgVkFMVUUsICcpOycsXG4gICAgICAgICAgVFlQRSwgJz0nLCBCVUZGRVIsICcuZHR5cGU7JyxcbiAgICAgICAgICAnfWVsc2V7JyxcbiAgICAgICAgICBCVUZGRVIsICc9JywgQlVGRkVSX1NUQVRFLCAnLmdldEJ1ZmZlcignLCBWQUxVRSwgJyk7JyxcbiAgICAgICAgICAnaWYoJywgQlVGRkVSLCAnKXsnLFxuICAgICAgICAgIFRZUEUsICc9JywgQlVGRkVSLCAnLmR0eXBlOycsXG4gICAgICAgICAgJ31lbHNlIGlmKFwiY29uc3RhbnRcIiBpbiAnLCBWQUxVRSwgJyl7JyxcbiAgICAgICAgICByZXN1bHQuc3RhdGUsICc9JywgQVRUUklCX1NUQVRFX0NPTlNUQU5ULCAnOycsXG4gICAgICAgICAgJ2lmKHR5cGVvZiAnICsgVkFMVUUgKyAnLmNvbnN0YW50ID09PSBcIm51bWJlclwiKXsnLFxuICAgICAgICAgIHJlc3VsdFtDVVRFX0NPTVBPTkVOVFNbMF1dLCAnPScsIFZBTFVFLCAnLmNvbnN0YW50OycsXG4gICAgICAgICAgQ1VURV9DT01QT05FTlRTLnNsaWNlKDEpLm1hcChmdW5jdGlvbiAobikge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdFtuXVxuICAgICAgICAgIH0pLmpvaW4oJz0nKSwgJz0wOycsXG4gICAgICAgICAgJ31lbHNleycsXG4gICAgICAgICAgQ1VURV9DT01QT05FTlRTLm1hcChmdW5jdGlvbiAobmFtZSwgaSkge1xuICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgcmVzdWx0W25hbWVdICsgJz0nICsgVkFMVUUgKyAnLmNvbnN0YW50Lmxlbmd0aD49JyArIGkgK1xuICAgICAgICAgICAgICAnPycgKyBWQUxVRSArICcuY29uc3RhbnRbJyArIGkgKyAnXTowOydcbiAgICAgICAgICAgIClcbiAgICAgICAgICB9KS5qb2luKCcnKSxcbiAgICAgICAgICAnfX1lbHNleycsXG4gICAgICAgICAgJ2lmKCcsIElTX0JVRkZFUl9BUkdTLCAnKCcsIFZBTFVFLCAnLmJ1ZmZlcikpeycsXG4gICAgICAgICAgQlVGRkVSLCAnPScsIEJVRkZFUl9TVEFURSwgJy5jcmVhdGVTdHJlYW0oJywgR0xfQVJSQVlfQlVGRkVSLCAnLCcsIFZBTFVFLCAnLmJ1ZmZlcik7JyxcbiAgICAgICAgICAnfWVsc2V7JyxcbiAgICAgICAgICBCVUZGRVIsICc9JywgQlVGRkVSX1NUQVRFLCAnLmdldEJ1ZmZlcignLCBWQUxVRSwgJy5idWZmZXIpOycsXG4gICAgICAgICAgJ30nLFxuICAgICAgICAgIFRZUEUsICc9XCJ0eXBlXCIgaW4gJywgVkFMVUUsICc/JyxcbiAgICAgICAgICBzaGFyZWQuZ2xUeXBlcywgJ1snLCBWQUxVRSwgJy50eXBlXTonLCBCVUZGRVIsICcuZHR5cGU7JyxcbiAgICAgICAgICByZXN1bHQubm9ybWFsaXplZCwgJz0hIScsIFZBTFVFLCAnLm5vcm1hbGl6ZWQ7JylcbiAgICAgICAgZnVuY3Rpb24gZW1pdFJlYWRSZWNvcmQgKG5hbWUpIHtcbiAgICAgICAgICBibG9jayhyZXN1bHRbbmFtZV0sICc9JywgVkFMVUUsICcuJywgbmFtZSwgJ3wwOycpXG4gICAgICAgIH1cbiAgICAgICAgZW1pdFJlYWRSZWNvcmQoJ3NpemUnKVxuICAgICAgICBlbWl0UmVhZFJlY29yZCgnb2Zmc2V0JylcbiAgICAgICAgZW1pdFJlYWRSZWNvcmQoJ3N0cmlkZScpXG4gICAgICAgIGVtaXRSZWFkUmVjb3JkKCdkaXZpc29yJylcblxuICAgICAgICBibG9jaygnfX0nKVxuXG4gICAgICAgIGJsb2NrLmV4aXQoXG4gICAgICAgICAgJ2lmKCcsIHJlc3VsdC5pc1N0cmVhbSwgJyl7JyxcbiAgICAgICAgICBCVUZGRVJfU1RBVEUsICcuZGVzdHJveVN0cmVhbSgnLCBCVUZGRVIsICcpOycsXG4gICAgICAgICAgJ30nKVxuXG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH1cblxuICAgICAgYXR0cmlidXRlRGVmc1thdHRyaWJ1dGVdID0gY3JlYXRlRHluYW1pY0RlY2woZHluLCBhcHBlbmRBdHRyaWJ1dGVDb2RlKVxuICAgIH0pXG5cbiAgICByZXR1cm4gYXR0cmlidXRlRGVmc1xuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VDb250ZXh0IChjb250ZXh0KSB7XG4gICAgdmFyIHN0YXRpY0NvbnRleHQgPSBjb250ZXh0LnN0YXRpY1xuICAgIHZhciBkeW5hbWljQ29udGV4dCA9IGNvbnRleHQuZHluYW1pY1xuICAgIHZhciByZXN1bHQgPSB7fVxuXG4gICAgT2JqZWN0LmtleXMoc3RhdGljQ29udGV4dCkuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgdmFyIHZhbHVlID0gc3RhdGljQ29udGV4dFtuYW1lXVxuICAgICAgcmVzdWx0W25hbWVdID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyB8fCB0eXBlb2YgdmFsdWUgPT09ICdib29sZWFuJykge1xuICAgICAgICAgIHJldHVybiAnJyArIHZhbHVlXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIGVudi5saW5rKHZhbHVlKVxuICAgICAgICB9XG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBPYmplY3Qua2V5cyhkeW5hbWljQ29udGV4dCkuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgdmFyIGR5biA9IGR5bmFtaWNDb250ZXh0W25hbWVdXG4gICAgICByZXN1bHRbbmFtZV0gPSBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgIHJldHVybiBlbnYuaW52b2tlKHNjb3BlLCBkeW4pXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICByZXR1cm4gcmVzdWx0XG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZUFyZ3VtZW50cyAob3B0aW9ucywgYXR0cmlidXRlcywgdW5pZm9ybXMsIGNvbnRleHQsIGVudikge1xuICAgIHZhciBzdGF0aWNPcHRpb25zID0gb3B0aW9ucy5zdGF0aWNcbiAgICB2YXIgZHluYW1pY09wdGlvbnMgPSBvcHRpb25zLmR5bmFtaWNcblxuICAgIFxuXG4gICAgdmFyIGZyYW1lYnVmZmVyID0gcGFyc2VGcmFtZWJ1ZmZlcihvcHRpb25zLCBlbnYpXG4gICAgdmFyIHZpZXdwb3J0QW5kU2Npc3NvciA9IHBhcnNlVmlld3BvcnRTY2lzc29yKG9wdGlvbnMsIGZyYW1lYnVmZmVyLCBlbnYpXG4gICAgdmFyIGRyYXcgPSBwYXJzZURyYXcob3B0aW9ucywgZW52KVxuICAgIHZhciBzdGF0ZSA9IHBhcnNlR0xTdGF0ZShvcHRpb25zLCBlbnYpXG4gICAgdmFyIHNoYWRlciA9IHBhcnNlUHJvZ3JhbShvcHRpb25zLCBlbnYpXG5cbiAgICBmdW5jdGlvbiBjb3B5Qm94IChuYW1lKSB7XG4gICAgICB2YXIgZGVmbiA9IHZpZXdwb3J0QW5kU2Npc3NvcltuYW1lXVxuICAgICAgaWYgKGRlZm4pIHtcbiAgICAgICAgc3RhdGVbbmFtZV0gPSBkZWZuXG4gICAgICB9XG4gICAgfVxuICAgIGNvcHlCb3goU19WSUVXUE9SVClcbiAgICBjb3B5Qm94KHByb3BOYW1lKFNfU0NJU1NPUl9CT1gpKVxuXG4gICAgdmFyIGRpcnR5ID0gT2JqZWN0LmtleXMoc3RhdGUpLmxlbmd0aCA+IDBcblxuICAgIHZhciByZXN1bHQgPSB7XG4gICAgICBmcmFtZWJ1ZmZlcjogZnJhbWVidWZmZXIsXG4gICAgICBkcmF3OiBkcmF3LFxuICAgICAgc2hhZGVyOiBzaGFkZXIsXG4gICAgICBzdGF0ZTogc3RhdGUsXG4gICAgICBkaXJ0eTogZGlydHlcbiAgICB9XG5cbiAgICByZXN1bHQucHJvZmlsZSA9IHBhcnNlUHJvZmlsZShvcHRpb25zLCBlbnYpXG4gICAgcmVzdWx0LnVuaWZvcm1zID0gcGFyc2VVbmlmb3Jtcyh1bmlmb3JtcywgZW52KVxuICAgIHJlc3VsdC5hdHRyaWJ1dGVzID0gcGFyc2VBdHRyaWJ1dGVzKGF0dHJpYnV0ZXMsIGVudilcbiAgICByZXN1bHQuY29udGV4dCA9IHBhcnNlQ29udGV4dChjb250ZXh0LCBlbnYpXG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBDT01NT04gVVBEQVRFIEZVTkNUSU9OU1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIGVtaXRDb250ZXh0IChlbnYsIHNjb3BlLCBjb250ZXh0KSB7XG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcbiAgICB2YXIgQ09OVEVYVCA9IHNoYXJlZC5jb250ZXh0XG5cbiAgICB2YXIgY29udGV4dEVudGVyID0gZW52LnNjb3BlKClcblxuICAgIE9iamVjdC5rZXlzKGNvbnRleHQpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHNjb3BlLnNhdmUoQ09OVEVYVCwgJy4nICsgbmFtZSlcbiAgICAgIHZhciBkZWZuID0gY29udGV4dFtuYW1lXVxuICAgICAgY29udGV4dEVudGVyKENPTlRFWFQsICcuJywgbmFtZSwgJz0nLCBkZWZuLmFwcGVuZChlbnYsIHNjb3BlKSwgJzsnKVxuICAgIH0pXG5cbiAgICBzY29wZShjb250ZXh0RW50ZXIpXG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIENPTU1PTiBEUkFXSU5HIEZVTkNUSU9OU1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIGVtaXRQb2xsRnJhbWVidWZmZXIgKGVudiwgc2NvcGUsIGZyYW1lYnVmZmVyLCBza2lwQ2hlY2spIHtcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuXG4gICAgdmFyIEdMID0gc2hhcmVkLmdsXG4gICAgdmFyIEZSQU1FQlVGRkVSX1NUQVRFID0gc2hhcmVkLmZyYW1lYnVmZmVyXG4gICAgdmFyIEVYVF9EUkFXX0JVRkZFUlNcbiAgICBpZiAoZXh0RHJhd0J1ZmZlcnMpIHtcbiAgICAgIEVYVF9EUkFXX0JVRkZFUlMgPSBzY29wZS5kZWYoc2hhcmVkLmV4dGVuc2lvbnMsICcud2ViZ2xfZHJhd19idWZmZXJzJylcbiAgICB9XG5cbiAgICB2YXIgY29uc3RhbnRzID0gZW52LmNvbnN0YW50c1xuXG4gICAgdmFyIERSQVdfQlVGRkVSUyA9IGNvbnN0YW50cy5kcmF3QnVmZmVyXG4gICAgdmFyIEJBQ0tfQlVGRkVSID0gY29uc3RhbnRzLmJhY2tCdWZmZXJcblxuICAgIHZhciBORVhUXG4gICAgaWYgKGZyYW1lYnVmZmVyKSB7XG4gICAgICBORVhUID0gZnJhbWVidWZmZXIuYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgfSBlbHNlIHtcbiAgICAgIE5FWFQgPSBzY29wZS5kZWYoRlJBTUVCVUZGRVJfU1RBVEUsICcubmV4dCcpXG4gICAgfVxuXG4gICAgaWYgKCFza2lwQ2hlY2spIHtcbiAgICAgIHNjb3BlKCdpZignLCBORVhULCAnIT09JywgRlJBTUVCVUZGRVJfU1RBVEUsICcuY3VyKXsnKVxuICAgIH1cbiAgICBzY29wZShcbiAgICAgICdpZignLCBORVhULCAnKXsnLFxuICAgICAgR0wsICcuYmluZEZyYW1lYnVmZmVyKCcsIEdMX0ZSQU1FQlVGRkVSLCAnLCcsIE5FWFQsICcuZnJhbWVidWZmZXIpOycpXG4gICAgaWYgKGV4dERyYXdCdWZmZXJzKSB7XG4gICAgICBzY29wZShFWFRfRFJBV19CVUZGRVJTLCAnLmRyYXdCdWZmZXJzV0VCR0woJyxcbiAgICAgICAgRFJBV19CVUZGRVJTLCAnWycsIE5FWFQsICcuY29sb3JBdHRhY2htZW50cy5sZW5ndGhdKTsnKVxuICAgIH1cbiAgICBzY29wZSgnfWVsc2V7JyxcbiAgICAgIEdMLCAnLmJpbmRGcmFtZWJ1ZmZlcignLCBHTF9GUkFNRUJVRkZFUiwgJyxudWxsKTsnKVxuICAgIGlmIChleHREcmF3QnVmZmVycykge1xuICAgICAgc2NvcGUoRVhUX0RSQVdfQlVGRkVSUywgJy5kcmF3QnVmZmVyc1dFQkdMKCcsIEJBQ0tfQlVGRkVSLCAnKTsnKVxuICAgIH1cbiAgICBzY29wZShcbiAgICAgICd9JyxcbiAgICAgIEZSQU1FQlVGRkVSX1NUQVRFLCAnLmN1cj0nLCBORVhULCAnOycpXG4gICAgaWYgKCFza2lwQ2hlY2spIHtcbiAgICAgIHNjb3BlKCd9JylcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBlbWl0UG9sbFN0YXRlIChlbnYsIHNjb3BlLCBhcmdzKSB7XG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcblxuICAgIHZhciBHTCA9IHNoYXJlZC5nbFxuXG4gICAgdmFyIENVUlJFTlRfVkFSUyA9IGVudi5jdXJyZW50XG4gICAgdmFyIE5FWFRfVkFSUyA9IGVudi5uZXh0XG4gICAgdmFyIENVUlJFTlRfU1RBVEUgPSBzaGFyZWQuY3VycmVudFxuICAgIHZhciBORVhUX1NUQVRFID0gc2hhcmVkLm5leHRcblxuICAgIHZhciBibG9jayA9IGVudi5jb25kKENVUlJFTlRfU1RBVEUsICcuZGlydHknKVxuXG4gICAgR0xfU1RBVEVfTkFNRVMuZm9yRWFjaChmdW5jdGlvbiAocHJvcCkge1xuICAgICAgdmFyIHBhcmFtID0gcHJvcE5hbWUocHJvcClcbiAgICAgIGlmIChwYXJhbSBpbiBhcmdzLnN0YXRlKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuXG4gICAgICB2YXIgTkVYVCwgQ1VSUkVOVFxuICAgICAgaWYgKHBhcmFtIGluIE5FWFRfVkFSUykge1xuICAgICAgICBORVhUID0gTkVYVF9WQVJTW3BhcmFtXVxuICAgICAgICBDVVJSRU5UID0gQ1VSUkVOVF9WQVJTW3BhcmFtXVxuICAgICAgICB2YXIgcGFydHMgPSBsb29wKGN1cnJlbnRTdGF0ZVtwYXJhbV0ubGVuZ3RoLCBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgIHJldHVybiBibG9jay5kZWYoTkVYVCwgJ1snLCBpLCAnXScpXG4gICAgICAgIH0pXG4gICAgICAgIGJsb2NrKGVudi5jb25kKHBhcnRzLm1hcChmdW5jdGlvbiAocCwgaSkge1xuICAgICAgICAgIHJldHVybiBwICsgJyE9PScgKyBDVVJSRU5UICsgJ1snICsgaSArICddJ1xuICAgICAgICB9KS5qb2luKCd8fCcpKVxuICAgICAgICAgIC50aGVuKFxuICAgICAgICAgICAgR0wsICcuJywgR0xfVkFSSUFCTEVTW3BhcmFtXSwgJygnLCBwYXJ0cywgJyk7JyxcbiAgICAgICAgICAgIHBhcnRzLm1hcChmdW5jdGlvbiAocCwgaSkge1xuICAgICAgICAgICAgICByZXR1cm4gQ1VSUkVOVCArICdbJyArIGkgKyAnXT0nICsgcFxuICAgICAgICAgICAgfSkuam9pbignOycpLCAnOycpKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgTkVYVCA9IGJsb2NrLmRlZihORVhUX1NUQVRFLCAnLicsIHBhcmFtKVxuICAgICAgICB2YXIgaWZ0ZSA9IGVudi5jb25kKE5FWFQsICchPT0nLCBDVVJSRU5UX1NUQVRFLCAnLicsIHBhcmFtKVxuICAgICAgICBibG9jayhpZnRlKVxuICAgICAgICBpZiAocGFyYW0gaW4gR0xfRkxBR1MpIHtcbiAgICAgICAgICBpZnRlKFxuICAgICAgICAgICAgZW52LmNvbmQoTkVYVClcbiAgICAgICAgICAgICAgICAudGhlbihHTCwgJy5lbmFibGUoJywgR0xfRkxBR1NbcGFyYW1dLCAnKTsnKVxuICAgICAgICAgICAgICAgIC5lbHNlKEdMLCAnLmRpc2FibGUoJywgR0xfRkxBR1NbcGFyYW1dLCAnKTsnKSxcbiAgICAgICAgICAgIENVUlJFTlRfU1RBVEUsICcuJywgcGFyYW0sICc9JywgTkVYVCwgJzsnKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmdGUoXG4gICAgICAgICAgICBHTCwgJy4nLCBHTF9WQVJJQUJMRVNbcGFyYW1dLCAnKCcsIE5FWFQsICcpOycsXG4gICAgICAgICAgICBDVVJSRU5UX1NUQVRFLCAnLicsIHBhcmFtLCAnPScsIE5FWFQsICc7JylcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pXG4gICAgaWYgKE9iamVjdC5rZXlzKGFyZ3Muc3RhdGUpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgYmxvY2soQ1VSUkVOVF9TVEFURSwgJy5kaXJ0eT1mYWxzZTsnKVxuICAgIH1cbiAgICBzY29wZShibG9jaylcbiAgfVxuXG4gIGZ1bmN0aW9uIGVtaXRTZXRPcHRpb25zIChlbnYsIHNjb3BlLCBvcHRpb25zLCBmaWx0ZXIpIHtcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuICAgIHZhciBDVVJSRU5UX1ZBUlMgPSBlbnYuY3VycmVudFxuICAgIHZhciBDVVJSRU5UX1NUQVRFID0gc2hhcmVkLmN1cnJlbnRcbiAgICB2YXIgR0wgPSBzaGFyZWQuZ2xcbiAgICBzb3J0U3RhdGUoT2JqZWN0LmtleXMob3B0aW9ucykpLmZvckVhY2goZnVuY3Rpb24gKHBhcmFtKSB7XG4gICAgICB2YXIgZGVmbiA9IG9wdGlvbnNbcGFyYW1dXG4gICAgICBpZiAoZmlsdGVyICYmICFmaWx0ZXIoZGVmbikpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICB2YXIgdmFyaWFibGUgPSBkZWZuLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgaWYgKEdMX0ZMQUdTW3BhcmFtXSkge1xuICAgICAgICB2YXIgZmxhZyA9IEdMX0ZMQUdTW3BhcmFtXVxuICAgICAgICBpZiAoaXNTdGF0aWMoZGVmbikpIHtcbiAgICAgICAgICBpZiAodmFyaWFibGUpIHtcbiAgICAgICAgICAgIHNjb3BlKEdMLCAnLmVuYWJsZSgnLCBmbGFnLCAnKTsnKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzY29wZShHTCwgJy5kaXNhYmxlKCcsIGZsYWcsICcpOycpXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHNjb3BlKGVudi5jb25kKHZhcmlhYmxlKVxuICAgICAgICAgICAgLnRoZW4oR0wsICcuZW5hYmxlKCcsIGZsYWcsICcpOycpXG4gICAgICAgICAgICAuZWxzZShHTCwgJy5kaXNhYmxlKCcsIGZsYWcsICcpOycpKVxuICAgICAgICB9XG4gICAgICAgIHNjb3BlKENVUlJFTlRfU1RBVEUsICcuJywgcGFyYW0sICc9JywgdmFyaWFibGUsICc7JylcbiAgICAgIH0gZWxzZSBpZiAoaXNBcnJheUxpa2UodmFyaWFibGUpKSB7XG4gICAgICAgIHZhciBDVVJSRU5UID0gQ1VSUkVOVF9WQVJTW3BhcmFtXVxuICAgICAgICBzY29wZShcbiAgICAgICAgICBHTCwgJy4nLCBHTF9WQVJJQUJMRVNbcGFyYW1dLCAnKCcsIHZhcmlhYmxlLCAnKTsnLFxuICAgICAgICAgIHZhcmlhYmxlLm1hcChmdW5jdGlvbiAodiwgaSkge1xuICAgICAgICAgICAgcmV0dXJuIENVUlJFTlQgKyAnWycgKyBpICsgJ109JyArIHZcbiAgICAgICAgICB9KS5qb2luKCc7JyksICc7JylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNjb3BlKFxuICAgICAgICAgIEdMLCAnLicsIEdMX1ZBUklBQkxFU1twYXJhbV0sICcoJywgdmFyaWFibGUsICcpOycsXG4gICAgICAgICAgQ1VSUkVOVF9TVEFURSwgJy4nLCBwYXJhbSwgJz0nLCB2YXJpYWJsZSwgJzsnKVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiBpbmplY3RFeHRlbnNpb25zIChlbnYsIHNjb3BlKSB7XG4gICAgaWYgKGV4dEluc3RhbmNpbmcpIHtcbiAgICAgIGVudi5pbnN0YW5jaW5nID0gc2NvcGUuZGVmKFxuICAgICAgICBlbnYuc2hhcmVkLmV4dGVuc2lvbnMsICcuYW5nbGVfaW5zdGFuY2VkX2FycmF5cycpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZW1pdFByb2ZpbGUgKGVudiwgc2NvcGUsIGFyZ3MsIHVzZVNjb3BlLCBpbmNyZW1lbnRDb3VudGVyKSB7XG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcbiAgICB2YXIgU1RBVFMgPSBlbnYuc3RhdHNcbiAgICB2YXIgQ1VSUkVOVF9TVEFURSA9IHNoYXJlZC5jdXJyZW50XG4gICAgdmFyIFRJTUVSID0gc2hhcmVkLnRpbWVyXG4gICAgdmFyIHByb2ZpbGVBcmcgPSBhcmdzLnByb2ZpbGVcblxuICAgIGZ1bmN0aW9uIHBlcmZDb3VudGVyICgpIHtcbiAgICAgIGlmICh0eXBlb2YgcGVyZm9ybWFuY2UgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHJldHVybiAnRGF0ZS5ub3coKSdcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiAncGVyZm9ybWFuY2Uubm93KCknXG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFyIENQVV9TVEFSVCwgUVVFUllfQ09VTlRFUlxuICAgIGZ1bmN0aW9uIGVtaXRQcm9maWxlU3RhcnQgKGJsb2NrKSB7XG4gICAgICBDUFVfU1RBUlQgPSBzY29wZS5kZWYoKVxuICAgICAgYmxvY2soQ1BVX1NUQVJULCAnPScsIHBlcmZDb3VudGVyKCksICc7JylcbiAgICAgIGlmICh0eXBlb2YgaW5jcmVtZW50Q291bnRlciA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgYmxvY2soU1RBVFMsICcuY291bnQrPScsIGluY3JlbWVudENvdW50ZXIsICc7JylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGJsb2NrKFNUQVRTLCAnLmNvdW50Kys7JylcbiAgICAgIH1cbiAgICAgIGlmICh0aW1lcikge1xuICAgICAgICBpZiAodXNlU2NvcGUpIHtcbiAgICAgICAgICBRVUVSWV9DT1VOVEVSID0gc2NvcGUuZGVmKClcbiAgICAgICAgICBibG9jayhRVUVSWV9DT1VOVEVSLCAnPScsIFRJTUVSLCAnLmdldE51bVBlbmRpbmdRdWVyaWVzKCk7JylcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBibG9jayhUSU1FUiwgJy5iZWdpblF1ZXJ5KCcsIFNUQVRTLCAnKTsnKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZW1pdFByb2ZpbGVFbmQgKGJsb2NrKSB7XG4gICAgICBibG9jayhTVEFUUywgJy5jcHVUaW1lKz0nLCBwZXJmQ291bnRlcigpLCAnLScsIENQVV9TVEFSVCwgJzsnKVxuICAgICAgaWYgKHRpbWVyKSB7XG4gICAgICAgIGlmICh1c2VTY29wZSkge1xuICAgICAgICAgIGJsb2NrKFRJTUVSLCAnLnB1c2hTY29wZVN0YXRzKCcsXG4gICAgICAgICAgICBRVUVSWV9DT1VOVEVSLCAnLCcsXG4gICAgICAgICAgICBUSU1FUiwgJy5nZXROdW1QZW5kaW5nUXVlcmllcygpLCcsXG4gICAgICAgICAgICBTVEFUUywgJyk7JylcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBibG9jayhUSU1FUiwgJy5lbmRRdWVyeSgpOycpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzY29wZVByb2ZpbGUgKHZhbHVlKSB7XG4gICAgICB2YXIgcHJldiA9IHNjb3BlLmRlZihDVVJSRU5UX1NUQVRFLCAnLnByb2ZpbGUnKVxuICAgICAgc2NvcGUoQ1VSUkVOVF9TVEFURSwgJy5wcm9maWxlPScsIHZhbHVlLCAnOycpXG4gICAgICBzY29wZS5leGl0KENVUlJFTlRfU1RBVEUsICcucHJvZmlsZT0nLCBwcmV2LCAnOycpXG4gICAgfVxuXG4gICAgdmFyIFVTRV9QUk9GSUxFXG4gICAgaWYgKHByb2ZpbGVBcmcpIHtcbiAgICAgIGlmIChpc1N0YXRpYyhwcm9maWxlQXJnKSkge1xuICAgICAgICBpZiAocHJvZmlsZUFyZy5lbmFibGUpIHtcbiAgICAgICAgICBlbWl0UHJvZmlsZVN0YXJ0KHNjb3BlKVxuICAgICAgICAgIGVtaXRQcm9maWxlRW5kKHNjb3BlLmV4aXQpXG4gICAgICAgICAgc2NvcGVQcm9maWxlKCd0cnVlJylcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzY29wZVByb2ZpbGUoJ2ZhbHNlJylcbiAgICAgICAgfVxuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIFVTRV9QUk9GSUxFID0gcHJvZmlsZUFyZy5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgIHNjb3BlUHJvZmlsZShVU0VfUFJPRklMRSlcbiAgICB9IGVsc2Uge1xuICAgICAgVVNFX1BST0ZJTEUgPSBzY29wZS5kZWYoQ1VSUkVOVF9TVEFURSwgJy5wcm9maWxlJylcbiAgICB9XG5cbiAgICB2YXIgc3RhcnQgPSBlbnYuYmxvY2soKVxuICAgIGVtaXRQcm9maWxlU3RhcnQoc3RhcnQpXG4gICAgc2NvcGUoJ2lmKCcsIFVTRV9QUk9GSUxFLCAnKXsnLCBzdGFydCwgJ30nKVxuICAgIHZhciBlbmQgPSBlbnYuYmxvY2soKVxuICAgIGVtaXRQcm9maWxlRW5kKGVuZClcbiAgICBzY29wZS5leGl0KCdpZignLCBVU0VfUFJPRklMRSwgJyl7JywgZW5kLCAnfScpXG4gIH1cblxuICBmdW5jdGlvbiBlbWl0QXR0cmlidXRlcyAoZW52LCBzY29wZSwgYXJncywgYXR0cmlidXRlcywgZmlsdGVyKSB7XG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcblxuICAgIGZ1bmN0aW9uIHR5cGVMZW5ndGggKHgpIHtcbiAgICAgIHN3aXRjaCAoeCkge1xuICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzI6XG4gICAgICAgIGNhc2UgR0xfSU5UX1ZFQzI6XG4gICAgICAgIGNhc2UgR0xfQk9PTF9WRUMyOlxuICAgICAgICAgIHJldHVybiAyXG4gICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDMzpcbiAgICAgICAgY2FzZSBHTF9JTlRfVkVDMzpcbiAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzM6XG4gICAgICAgICAgcmV0dXJuIDNcbiAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUM0OlxuICAgICAgICBjYXNlIEdMX0lOVF9WRUM0OlxuICAgICAgICBjYXNlIEdMX0JPT0xfVkVDNDpcbiAgICAgICAgICByZXR1cm4gNFxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIHJldHVybiAxXG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZW1pdEJpbmRBdHRyaWJ1dGUgKEFUVFJJQlVURSwgc2l6ZSwgcmVjb3JkKSB7XG4gICAgICB2YXIgR0wgPSBzaGFyZWQuZ2xcblxuICAgICAgdmFyIExPQ0FUSU9OID0gc2NvcGUuZGVmKEFUVFJJQlVURSwgJy5sb2NhdGlvbicpXG4gICAgICB2YXIgQklORElORyA9IHNjb3BlLmRlZihzaGFyZWQuYXR0cmlidXRlcywgJ1snLCBMT0NBVElPTiwgJ10nKVxuXG4gICAgICB2YXIgU1RBVEUgPSByZWNvcmQuc3RhdGVcbiAgICAgIHZhciBCVUZGRVIgPSByZWNvcmQuYnVmZmVyXG4gICAgICB2YXIgQ09OU1RfQ09NUE9ORU5UUyA9IFtcbiAgICAgICAgcmVjb3JkLngsXG4gICAgICAgIHJlY29yZC55LFxuICAgICAgICByZWNvcmQueixcbiAgICAgICAgcmVjb3JkLndcbiAgICAgIF1cblxuICAgICAgdmFyIENPTU1PTl9LRVlTID0gW1xuICAgICAgICAnYnVmZmVyJyxcbiAgICAgICAgJ25vcm1hbGl6ZWQnLFxuICAgICAgICAnb2Zmc2V0JyxcbiAgICAgICAgJ3N0cmlkZSdcbiAgICAgIF1cblxuICAgICAgZnVuY3Rpb24gZW1pdEJ1ZmZlciAoKSB7XG4gICAgICAgIHNjb3BlKFxuICAgICAgICAgICdpZighJywgQklORElORywgJy5idWZmZXIpeycsXG4gICAgICAgICAgR0wsICcuZW5hYmxlVmVydGV4QXR0cmliQXJyYXkoJywgTE9DQVRJT04sICcpO30nKVxuXG4gICAgICAgIHZhciBUWVBFID0gcmVjb3JkLnR5cGVcbiAgICAgICAgdmFyIFNJWkVcbiAgICAgICAgaWYgKCFyZWNvcmQuc2l6ZSkge1xuICAgICAgICAgIFNJWkUgPSBzaXplXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgU0laRSA9IHNjb3BlLmRlZihyZWNvcmQuc2l6ZSwgJ3x8Jywgc2l6ZSlcbiAgICAgICAgfVxuXG4gICAgICAgIHNjb3BlKCdpZignLFxuICAgICAgICAgIEJJTkRJTkcsICcudHlwZSE9PScsIFRZUEUsICd8fCcsXG4gICAgICAgICAgQklORElORywgJy5zaXplIT09JywgU0laRSwgJ3x8JyxcbiAgICAgICAgICBDT01NT05fS0VZUy5tYXAoZnVuY3Rpb24gKGtleSkge1xuICAgICAgICAgICAgcmV0dXJuIEJJTkRJTkcgKyAnLicgKyBrZXkgKyAnIT09JyArIHJlY29yZFtrZXldXG4gICAgICAgICAgfSkuam9pbignfHwnKSxcbiAgICAgICAgICAnKXsnLFxuICAgICAgICAgIEdMLCAnLmJpbmRCdWZmZXIoJywgR0xfQVJSQVlfQlVGRkVSLCAnLCcsIEJVRkZFUiwgJy5idWZmZXIpOycsXG4gICAgICAgICAgR0wsICcudmVydGV4QXR0cmliUG9pbnRlcignLCBbXG4gICAgICAgICAgICBMT0NBVElPTixcbiAgICAgICAgICAgIFNJWkUsXG4gICAgICAgICAgICBUWVBFLFxuICAgICAgICAgICAgcmVjb3JkLm5vcm1hbGl6ZWQsXG4gICAgICAgICAgICByZWNvcmQuc3RyaWRlLFxuICAgICAgICAgICAgcmVjb3JkLm9mZnNldFxuICAgICAgICAgIF0sICcpOycsXG4gICAgICAgICAgQklORElORywgJy50eXBlPScsIFRZUEUsICc7JyxcbiAgICAgICAgICBCSU5ESU5HLCAnLnNpemU9JywgU0laRSwgJzsnLFxuICAgICAgICAgIENPTU1PTl9LRVlTLm1hcChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgICAgICByZXR1cm4gQklORElORyArICcuJyArIGtleSArICc9JyArIHJlY29yZFtrZXldICsgJzsnXG4gICAgICAgICAgfSkuam9pbignJyksXG4gICAgICAgICAgJ30nKVxuXG4gICAgICAgIGlmIChleHRJbnN0YW5jaW5nKSB7XG4gICAgICAgICAgdmFyIERJVklTT1IgPSByZWNvcmQuZGl2aXNvclxuICAgICAgICAgIHNjb3BlKFxuICAgICAgICAgICAgJ2lmKCcsIEJJTkRJTkcsICcuZGl2aXNvciE9PScsIERJVklTT1IsICcpeycsXG4gICAgICAgICAgICBlbnYuaW5zdGFuY2luZywgJy52ZXJ0ZXhBdHRyaWJEaXZpc29yQU5HTEUoJywgW0xPQ0FUSU9OLCBESVZJU09SXSwgJyk7JyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcuZGl2aXNvcj0nLCBESVZJU09SLCAnO30nKVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGZ1bmN0aW9uIGVtaXRDb25zdGFudCAoKSB7XG4gICAgICAgIHNjb3BlKFxuICAgICAgICAgICdpZignLCBCSU5ESU5HLCAnLmJ1ZmZlcil7JyxcbiAgICAgICAgICBHTCwgJy5kaXNhYmxlVmVydGV4QXR0cmliQXJyYXkoJywgTE9DQVRJT04sICcpOycsXG4gICAgICAgICAgJ31pZignLCBDVVRFX0NPTVBPTkVOVFMubWFwKGZ1bmN0aW9uIChjLCBpKSB7XG4gICAgICAgICAgICByZXR1cm4gQklORElORyArICcuJyArIGMgKyAnIT09JyArIENPTlNUX0NPTVBPTkVOVFNbaV1cbiAgICAgICAgICB9KS5qb2luKCd8fCcpLCAnKXsnLFxuICAgICAgICAgIEdMLCAnLnZlcnRleEF0dHJpYjRmKCcsIExPQ0FUSU9OLCAnLCcsIENPTlNUX0NPTVBPTkVOVFMsICcpOycsXG4gICAgICAgICAgQ1VURV9DT01QT05FTlRTLm1hcChmdW5jdGlvbiAoYywgaSkge1xuICAgICAgICAgICAgcmV0dXJuIEJJTkRJTkcgKyAnLicgKyBjICsgJz0nICsgQ09OU1RfQ09NUE9ORU5UU1tpXSArICc7J1xuICAgICAgICAgIH0pLmpvaW4oJycpLFxuICAgICAgICAgICd9JylcbiAgICAgIH1cblxuICAgICAgaWYgKFNUQVRFID09PSBBVFRSSUJfU1RBVEVfUE9JTlRFUikge1xuICAgICAgICBlbWl0QnVmZmVyKClcbiAgICAgIH0gZWxzZSBpZiAoU1RBVEUgPT09IEFUVFJJQl9TVEFURV9DT05TVEFOVCkge1xuICAgICAgICBlbWl0Q29uc3RhbnQoKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2NvcGUoJ2lmKCcsIFNUQVRFLCAnPT09JywgQVRUUklCX1NUQVRFX1BPSU5URVIsICcpeycpXG4gICAgICAgIGVtaXRCdWZmZXIoKVxuICAgICAgICBzY29wZSgnfWVsc2V7JylcbiAgICAgICAgZW1pdENvbnN0YW50KClcbiAgICAgICAgc2NvcGUoJ30nKVxuICAgICAgfVxuICAgIH1cblxuICAgIGF0dHJpYnV0ZXMuZm9yRWFjaChmdW5jdGlvbiAoYXR0cmlidXRlKSB7XG4gICAgICB2YXIgbmFtZSA9IGF0dHJpYnV0ZS5uYW1lXG4gICAgICB2YXIgYXJnID0gYXJncy5hdHRyaWJ1dGVzW25hbWVdXG4gICAgICB2YXIgcmVjb3JkXG4gICAgICBpZiAoYXJnKSB7XG4gICAgICAgIGlmICghZmlsdGVyKGFyZykpIHtcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuICAgICAgICByZWNvcmQgPSBhcmcuYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoIWZpbHRlcihTQ09QRV9ERUNMKSkge1xuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG4gICAgICAgIHZhciBzY29wZUF0dHJpYiA9IGVudi5zY29wZUF0dHJpYihuYW1lKVxuICAgICAgICBcbiAgICAgICAgcmVjb3JkID0ge31cbiAgICAgICAgT2JqZWN0LmtleXMobmV3IEF0dHJpYnV0ZVJlY29yZCgpKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgICByZWNvcmRba2V5XSA9IHNjb3BlLmRlZihzY29wZUF0dHJpYiwgJy4nLCBrZXkpXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgICBlbWl0QmluZEF0dHJpYnV0ZShcbiAgICAgICAgZW52LmxpbmsoYXR0cmlidXRlKSwgdHlwZUxlbmd0aChhdHRyaWJ1dGUuaW5mby50eXBlKSwgcmVjb3JkKVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiBlbWl0VW5pZm9ybXMgKGVudiwgc2NvcGUsIGFyZ3MsIHVuaWZvcm1zLCBmaWx0ZXIpIHtcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuICAgIHZhciBHTCA9IHNoYXJlZC5nbFxuXG4gICAgdmFyIGluZml4XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB1bmlmb3Jtcy5sZW5ndGg7ICsraSkge1xuICAgICAgdmFyIHVuaWZvcm0gPSB1bmlmb3Jtc1tpXVxuICAgICAgdmFyIG5hbWUgPSB1bmlmb3JtLm5hbWVcbiAgICAgIHZhciB0eXBlID0gdW5pZm9ybS5pbmZvLnR5cGVcbiAgICAgIHZhciBhcmcgPSBhcmdzLnVuaWZvcm1zW25hbWVdXG4gICAgICB2YXIgVU5JRk9STSA9IGVudi5saW5rKHVuaWZvcm0pXG4gICAgICB2YXIgTE9DQVRJT04gPSBVTklGT1JNICsgJy5sb2NhdGlvbidcblxuICAgICAgdmFyIFZBTFVFXG4gICAgICBpZiAoYXJnKSB7XG4gICAgICAgIGlmICghZmlsdGVyKGFyZykpIHtcbiAgICAgICAgICBjb250aW51ZVxuICAgICAgICB9XG4gICAgICAgIGlmIChpc1N0YXRpYyhhcmcpKSB7XG4gICAgICAgICAgdmFyIHZhbHVlID0gYXJnLnZhbHVlXG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKHR5cGUgPT09IEdMX1NBTVBMRVJfMkQgfHwgdHlwZSA9PT0gR0xfU0FNUExFUl9DVUJFKSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHZhciBURVhfVkFMVUUgPSBlbnYubGluayh2YWx1ZS5fdGV4dHVyZSB8fCB2YWx1ZS5jb2xvclswXS5fdGV4dHVyZSlcbiAgICAgICAgICAgIHNjb3BlKEdMLCAnLnVuaWZvcm0xaSgnLCBMT0NBVElPTiwgJywnLCBURVhfVkFMVUUgKyAnLmJpbmQoKSk7JylcbiAgICAgICAgICAgIHNjb3BlLmV4aXQoVEVYX1ZBTFVFLCAnLnVuYmluZCgpOycpXG4gICAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICAgIHR5cGUgPT09IEdMX0ZMT0FUX01BVDIgfHxcbiAgICAgICAgICAgIHR5cGUgPT09IEdMX0ZMT0FUX01BVDMgfHxcbiAgICAgICAgICAgIHR5cGUgPT09IEdMX0ZMT0FUX01BVDQpIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdmFyIE1BVF9WQUxVRSA9IGVudi5nbG9iYWwuZGVmKCduZXcgRmxvYXQzMkFycmF5KFsnICtcbiAgICAgICAgICAgICAgQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwodmFsdWUpICsgJ10pJylcbiAgICAgICAgICAgIHZhciBkaW0gPSAyXG4gICAgICAgICAgICBpZiAodHlwZSA9PT0gR0xfRkxPQVRfTUFUMykge1xuICAgICAgICAgICAgICBkaW0gPSAzXG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGUgPT09IEdMX0ZMT0FUX01BVDQpIHtcbiAgICAgICAgICAgICAgZGltID0gNFxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc2NvcGUoXG4gICAgICAgICAgICAgIEdMLCAnLnVuaWZvcm1NYXRyaXgnLCBkaW0sICdmdignLFxuICAgICAgICAgICAgICBMT0NBVElPTiwgJyxmYWxzZSwnLCBNQVRfVkFMVUUsICcpOycpXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICAgICAgICBjYXNlIEdMX0ZMT0FUOlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGluZml4ID0gJzFmJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDMjpcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICcyZidcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzM6XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaW5maXggPSAnM2YnXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUM0OlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGluZml4ID0gJzRmJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfQk9PTDpcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICcxaSdcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0lOVDpcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICcxaSdcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0JPT0xfVkVDMjpcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICcyaSdcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0lOVF9WRUMyOlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGluZml4ID0gJzJpJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfQk9PTF9WRUMzOlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGluZml4ID0gJzNpJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfSU5UX1ZFQzM6XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaW5maXggPSAnM2knXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzQ6XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaW5maXggPSAnNGknXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9JTlRfVkVDNDpcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICc0aSdcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc2NvcGUoR0wsICcudW5pZm9ybScsIGluZml4LCAnKCcsIExPQ0FUSU9OLCAnLCcsXG4gICAgICAgICAgICAgIGlzQXJyYXlMaWtlKHZhbHVlKSA/IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKHZhbHVlKSA6IHZhbHVlLFxuICAgICAgICAgICAgICAnKTsnKVxuICAgICAgICAgIH1cbiAgICAgICAgICBjb250aW51ZVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIFZBTFVFID0gYXJnLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoIWZpbHRlcihTQ09QRV9ERUNMKSkge1xuICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgIH1cbiAgICAgICAgVkFMVUUgPSBzY29wZS5kZWYoc2hhcmVkLnVuaWZvcm1zLCAnWycsIHN0cmluZ1N0b3JlLmlkKG5hbWUpLCAnXScpXG4gICAgICB9XG5cbiAgICAgIGlmICh0eXBlID09PSBHTF9TQU1QTEVSXzJEKSB7XG4gICAgICAgIHNjb3BlKFxuICAgICAgICAgICdpZignLCBWQUxVRSwgJyYmJywgVkFMVUUsICcuX3JlZ2xUeXBlPT09XCJmcmFtZWJ1ZmZlclwiKXsnLFxuICAgICAgICAgIFZBTFVFLCAnPScsIFZBTFVFLCAnLmNvbG9yWzBdOycsXG4gICAgICAgICAgJ30nKVxuICAgICAgfSBlbHNlIGlmICh0eXBlID09PSBHTF9TQU1QTEVSX0NVQkUpIHtcbiAgICAgICAgc2NvcGUoXG4gICAgICAgICAgJ2lmKCcsIFZBTFVFLCAnJiYnLCBWQUxVRSwgJy5fcmVnbFR5cGU9PT1cImZyYW1lYnVmZmVyQ3ViZVwiKXsnLFxuICAgICAgICAgIFZBTFVFLCAnPScsIFZBTFVFLCAnLmNvbG9yWzBdOycsXG4gICAgICAgICAgJ30nKVxuICAgICAgfVxuXG4gICAgICAvLyBwZXJmb3JtIHR5cGUgdmFsaWRhdGlvblxuICAgICAgXG5cbiAgICAgIHZhciB1bnJvbGwgPSAxXG4gICAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgICAgY2FzZSBHTF9TQU1QTEVSXzJEOlxuICAgICAgICBjYXNlIEdMX1NBTVBMRVJfQ1VCRTpcbiAgICAgICAgICB2YXIgVEVYID0gc2NvcGUuZGVmKFZBTFVFLCAnLl90ZXh0dXJlJylcbiAgICAgICAgICBzY29wZShHTCwgJy51bmlmb3JtMWkoJywgTE9DQVRJT04sICcsJywgVEVYLCAnLmJpbmQoKSk7JylcbiAgICAgICAgICBzY29wZS5leGl0KFRFWCwgJy51bmJpbmQoKTsnKVxuICAgICAgICAgIGNvbnRpbnVlXG5cbiAgICAgICAgY2FzZSBHTF9JTlQ6XG4gICAgICAgIGNhc2UgR0xfQk9PTDpcbiAgICAgICAgICBpbmZpeCA9ICcxaSdcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfSU5UX1ZFQzI6XG4gICAgICAgIGNhc2UgR0xfQk9PTF9WRUMyOlxuICAgICAgICAgIGluZml4ID0gJzJpJ1xuICAgICAgICAgIHVucm9sbCA9IDJcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfSU5UX1ZFQzM6XG4gICAgICAgIGNhc2UgR0xfQk9PTF9WRUMzOlxuICAgICAgICAgIGluZml4ID0gJzNpJ1xuICAgICAgICAgIHVucm9sbCA9IDNcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfSU5UX1ZFQzQ6XG4gICAgICAgIGNhc2UgR0xfQk9PTF9WRUM0OlxuICAgICAgICAgIGluZml4ID0gJzRpJ1xuICAgICAgICAgIHVucm9sbCA9IDRcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfRkxPQVQ6XG4gICAgICAgICAgaW5maXggPSAnMWYnXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzI6XG4gICAgICAgICAgaW5maXggPSAnMmYnXG4gICAgICAgICAgdW5yb2xsID0gMlxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUMzOlxuICAgICAgICAgIGluZml4ID0gJzNmJ1xuICAgICAgICAgIHVucm9sbCA9IDNcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDNDpcbiAgICAgICAgICBpbmZpeCA9ICc0ZidcbiAgICAgICAgICB1bnJvbGwgPSA0XG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0ZMT0FUX01BVDI6XG4gICAgICAgICAgaW5maXggPSAnTWF0cml4MmZ2J1xuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9GTE9BVF9NQVQzOlxuICAgICAgICAgIGluZml4ID0gJ01hdHJpeDNmdidcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfRkxPQVRfTUFUNDpcbiAgICAgICAgICBpbmZpeCA9ICdNYXRyaXg0ZnYnXG4gICAgICAgICAgYnJlYWtcbiAgICAgIH1cblxuICAgICAgc2NvcGUoR0wsICcudW5pZm9ybScsIGluZml4LCAnKCcsIExPQ0FUSU9OLCAnLCcpXG4gICAgICBpZiAoaW5maXguY2hhckF0KDApID09PSAnTScpIHtcbiAgICAgICAgdmFyIG1hdFNpemUgPSBNYXRoLnBvdyh0eXBlIC0gR0xfRkxPQVRfTUFUMiArIDIsIDIpXG4gICAgICAgIHZhciBTVE9SQUdFID0gZW52Lmdsb2JhbC5kZWYoJ25ldyBGbG9hdDMyQXJyYXkoJywgbWF0U2l6ZSwgJyknKVxuICAgICAgICBzY29wZShcbiAgICAgICAgICAnZmFsc2UsKEFycmF5LmlzQXJyYXkoJywgVkFMVUUsICcpfHwnLCBWQUxVRSwgJyBpbnN0YW5jZW9mIEZsb2F0MzJBcnJheSk/JywgVkFMVUUsICc6KCcsXG4gICAgICAgICAgbG9vcChtYXRTaXplLCBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgICAgcmV0dXJuIFNUT1JBR0UgKyAnWycgKyBpICsgJ109JyArIFZBTFVFICsgJ1snICsgaSArICddJ1xuICAgICAgICAgIH0pLCAnLCcsIFNUT1JBR0UsICcpJylcbiAgICAgIH0gZWxzZSBpZiAodW5yb2xsID4gMSkge1xuICAgICAgICBzY29wZShsb29wKHVucm9sbCwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICByZXR1cm4gVkFMVUUgKyAnWycgKyBpICsgJ10nXG4gICAgICAgIH0pKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2NvcGUoVkFMVUUpXG4gICAgICB9XG4gICAgICBzY29wZSgnKTsnKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGVtaXREcmF3IChlbnYsIG91dGVyLCBpbm5lciwgYXJncykge1xuICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgdmFyIEdMID0gc2hhcmVkLmdsXG4gICAgdmFyIERSQVdfU1RBVEUgPSBzaGFyZWQuZHJhd1xuXG4gICAgdmFyIGRyYXdPcHRpb25zID0gYXJncy5kcmF3XG5cbiAgICBmdW5jdGlvbiBlbWl0RWxlbWVudHMgKCkge1xuICAgICAgdmFyIGRlZm4gPSBkcmF3T3B0aW9ucy5lbGVtZW50c1xuICAgICAgdmFyIEVMRU1FTlRTXG4gICAgICB2YXIgc2NvcGUgPSBvdXRlclxuICAgICAgaWYgKGRlZm4pIHtcbiAgICAgICAgaWYgKChkZWZuLmNvbnRleHREZXAgJiYgYXJncy5jb250ZXh0RHluYW1pYykgfHwgZGVmbi5wcm9wRGVwKSB7XG4gICAgICAgICAgc2NvcGUgPSBpbm5lclxuICAgICAgICB9XG4gICAgICAgIEVMRU1FTlRTID0gZGVmbi5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIEVMRU1FTlRTID0gc2NvcGUuZGVmKERSQVdfU1RBVEUsICcuJywgU19FTEVNRU5UUylcbiAgICAgIH1cbiAgICAgIGlmIChFTEVNRU5UUykge1xuICAgICAgICBzY29wZShcbiAgICAgICAgICAnaWYoJyArIEVMRU1FTlRTICsgJyknICtcbiAgICAgICAgICBHTCArICcuYmluZEJ1ZmZlcignICsgR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIgKyAnLCcgKyBFTEVNRU5UUyArICcuYnVmZmVyLmJ1ZmZlcik7JylcbiAgICAgIH1cbiAgICAgIHJldHVybiBFTEVNRU5UU1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGVtaXRDb3VudCAoKSB7XG4gICAgICB2YXIgZGVmbiA9IGRyYXdPcHRpb25zLmNvdW50XG4gICAgICB2YXIgQ09VTlRcbiAgICAgIHZhciBzY29wZSA9IG91dGVyXG4gICAgICBpZiAoZGVmbikge1xuICAgICAgICBpZiAoKGRlZm4uY29udGV4dERlcCAmJiBhcmdzLmNvbnRleHREeW5hbWljKSB8fCBkZWZuLnByb3BEZXApIHtcbiAgICAgICAgICBzY29wZSA9IGlubmVyXG4gICAgICAgIH1cbiAgICAgICAgQ09VTlQgPSBkZWZuLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgICBcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIENPVU5UID0gc2NvcGUuZGVmKERSQVdfU1RBVEUsICcuJywgU19DT1VOVClcbiAgICAgICAgXG4gICAgICB9XG4gICAgICByZXR1cm4gQ09VTlRcbiAgICB9XG5cbiAgICB2YXIgRUxFTUVOVFMgPSBlbWl0RWxlbWVudHMoKVxuICAgIGZ1bmN0aW9uIGVtaXRWYWx1ZSAobmFtZSkge1xuICAgICAgdmFyIGRlZm4gPSBkcmF3T3B0aW9uc1tuYW1lXVxuICAgICAgaWYgKGRlZm4pIHtcbiAgICAgICAgaWYgKChkZWZuLmNvbnRleHREZXAgJiYgYXJncy5jb250ZXh0RHluYW1pYykgfHwgZGVmbi5wcm9wRGVwKSB7XG4gICAgICAgICAgcmV0dXJuIGRlZm4uYXBwZW5kKGVudiwgaW5uZXIpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIGRlZm4uYXBwZW5kKGVudiwgb3V0ZXIpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBvdXRlci5kZWYoRFJBV19TVEFURSwgJy4nLCBuYW1lKVxuICAgICAgfVxuICAgIH1cblxuICAgIHZhciBQUklNSVRJVkUgPSBlbWl0VmFsdWUoU19QUklNSVRJVkUpXG4gICAgdmFyIE9GRlNFVCA9IGVtaXRWYWx1ZShTX09GRlNFVClcblxuICAgIHZhciBDT1VOVCA9IGVtaXRDb3VudCgpXG4gICAgaWYgKHR5cGVvZiBDT1VOVCA9PT0gJ251bWJlcicpIHtcbiAgICAgIGlmIChDT1VOVCA9PT0gMCkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgaW5uZXIoJ2lmKCcsIENPVU5ULCAnKXsnKVxuICAgICAgaW5uZXIuZXhpdCgnfScpXG4gICAgfVxuXG4gICAgdmFyIElOU1RBTkNFUywgRVhUX0lOU1RBTkNJTkdcbiAgICBpZiAoZXh0SW5zdGFuY2luZykge1xuICAgICAgSU5TVEFOQ0VTID0gZW1pdFZhbHVlKFNfSU5TVEFOQ0VTKVxuICAgICAgRVhUX0lOU1RBTkNJTkcgPSBlbnYuaW5zdGFuY2luZ1xuICAgIH1cblxuICAgIHZhciBFTEVNRU5UX1RZUEUgPSBFTEVNRU5UUyArICcudHlwZSdcblxuICAgIHZhciBlbGVtZW50c1N0YXRpYyA9IGRyYXdPcHRpb25zLmVsZW1lbnRzICYmIGlzU3RhdGljKGRyYXdPcHRpb25zLmVsZW1lbnRzKVxuXG4gICAgZnVuY3Rpb24gZW1pdEluc3RhbmNpbmcgKCkge1xuICAgICAgZnVuY3Rpb24gZHJhd0VsZW1lbnRzICgpIHtcbiAgICAgICAgaW5uZXIoRVhUX0lOU1RBTkNJTkcsICcuZHJhd0VsZW1lbnRzSW5zdGFuY2VkQU5HTEUoJywgW1xuICAgICAgICAgIFBSSU1JVElWRSxcbiAgICAgICAgICBDT1VOVCxcbiAgICAgICAgICBFTEVNRU5UX1RZUEUsXG4gICAgICAgICAgT0ZGU0VUICsgJzw8KCgnICsgRUxFTUVOVF9UWVBFICsgJy0nICsgR0xfVU5TSUdORURfQllURSArICcpPj4xKScsXG4gICAgICAgICAgSU5TVEFOQ0VTXG4gICAgICAgIF0sICcpOycpXG4gICAgICB9XG5cbiAgICAgIGZ1bmN0aW9uIGRyYXdBcnJheXMgKCkge1xuICAgICAgICBpbm5lcihFWFRfSU5TVEFOQ0lORywgJy5kcmF3QXJyYXlzSW5zdGFuY2VkQU5HTEUoJyxcbiAgICAgICAgICBbUFJJTUlUSVZFLCBPRkZTRVQsIENPVU5ULCBJTlNUQU5DRVNdLCAnKTsnKVxuICAgICAgfVxuXG4gICAgICBpZiAoRUxFTUVOVFMpIHtcbiAgICAgICAgaWYgKCFlbGVtZW50c1N0YXRpYykge1xuICAgICAgICAgIGlubmVyKCdpZignLCBFTEVNRU5UUywgJyl7JylcbiAgICAgICAgICBkcmF3RWxlbWVudHMoKVxuICAgICAgICAgIGlubmVyKCd9ZWxzZXsnKVxuICAgICAgICAgIGRyYXdBcnJheXMoKVxuICAgICAgICAgIGlubmVyKCd9JylcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBkcmF3RWxlbWVudHMoKVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkcmF3QXJyYXlzKClcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBlbWl0UmVndWxhciAoKSB7XG4gICAgICBmdW5jdGlvbiBkcmF3RWxlbWVudHMgKCkge1xuICAgICAgICBpbm5lcihHTCArICcuZHJhd0VsZW1lbnRzKCcgKyBbXG4gICAgICAgICAgUFJJTUlUSVZFLFxuICAgICAgICAgIENPVU5ULFxuICAgICAgICAgIEVMRU1FTlRfVFlQRSxcbiAgICAgICAgICBPRkZTRVQgKyAnPDwoKCcgKyBFTEVNRU5UX1RZUEUgKyAnLScgKyBHTF9VTlNJR05FRF9CWVRFICsgJyk+PjEpJ1xuICAgICAgICBdICsgJyk7JylcbiAgICAgIH1cblxuICAgICAgZnVuY3Rpb24gZHJhd0FycmF5cyAoKSB7XG4gICAgICAgIGlubmVyKEdMICsgJy5kcmF3QXJyYXlzKCcgKyBbUFJJTUlUSVZFLCBPRkZTRVQsIENPVU5UXSArICcpOycpXG4gICAgICB9XG5cbiAgICAgIGlmIChFTEVNRU5UUykge1xuICAgICAgICBpZiAoIWVsZW1lbnRzU3RhdGljKSB7XG4gICAgICAgICAgaW5uZXIoJ2lmKCcsIEVMRU1FTlRTLCAnKXsnKVxuICAgICAgICAgIGRyYXdFbGVtZW50cygpXG4gICAgICAgICAgaW5uZXIoJ31lbHNleycpXG4gICAgICAgICAgZHJhd0FycmF5cygpXG4gICAgICAgICAgaW5uZXIoJ30nKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGRyYXdFbGVtZW50cygpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRyYXdBcnJheXMoKVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChleHRJbnN0YW5jaW5nICYmICh0eXBlb2YgSU5TVEFOQ0VTICE9PSAnbnVtYmVyJyB8fCBJTlNUQU5DRVMgPj0gMCkpIHtcbiAgICAgIGlmICh0eXBlb2YgSU5TVEFOQ0VTID09PSAnc3RyaW5nJykge1xuICAgICAgICBpbm5lcignaWYoJywgSU5TVEFOQ0VTLCAnPjApeycpXG4gICAgICAgIGVtaXRJbnN0YW5jaW5nKClcbiAgICAgICAgaW5uZXIoJ31lbHNlIGlmKCcsIElOU1RBTkNFUywgJzwwKXsnKVxuICAgICAgICBlbWl0UmVndWxhcigpXG4gICAgICAgIGlubmVyKCd9JylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGVtaXRJbnN0YW5jaW5nKClcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgZW1pdFJlZ3VsYXIoKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZUJvZHkgKGVtaXRCb2R5LCBwYXJlbnRFbnYsIGFyZ3MsIHByb2dyYW0sIGNvdW50KSB7XG4gICAgdmFyIGVudiA9IGNyZWF0ZVJFR0xFbnZpcm9ubWVudCgpXG4gICAgdmFyIHNjb3BlID0gZW52LnByb2MoJ2JvZHknLCBjb3VudClcbiAgICBcbiAgICBpZiAoZXh0SW5zdGFuY2luZykge1xuICAgICAgZW52Lmluc3RhbmNpbmcgPSBzY29wZS5kZWYoXG4gICAgICAgIGVudi5zaGFyZWQuZXh0ZW5zaW9ucywgJy5hbmdsZV9pbnN0YW5jZWRfYXJyYXlzJylcbiAgICB9XG4gICAgZW1pdEJvZHkoZW52LCBzY29wZSwgYXJncywgcHJvZ3JhbSlcbiAgICByZXR1cm4gZW52LmNvbXBpbGUoKS5ib2R5XG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIERSQVcgUFJPQ1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIGVtaXREcmF3Qm9keSAoZW52LCBkcmF3LCBhcmdzLCBwcm9ncmFtKSB7XG4gICAgaW5qZWN0RXh0ZW5zaW9ucyhlbnYsIGRyYXcpXG4gICAgZW1pdEF0dHJpYnV0ZXMoZW52LCBkcmF3LCBhcmdzLCBwcm9ncmFtLmF0dHJpYnV0ZXMsIGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiB0cnVlXG4gICAgfSlcbiAgICBlbWl0VW5pZm9ybXMoZW52LCBkcmF3LCBhcmdzLCBwcm9ncmFtLnVuaWZvcm1zLCBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIH0pXG4gICAgZW1pdERyYXcoZW52LCBkcmF3LCBkcmF3LCBhcmdzKVxuICB9XG5cbiAgZnVuY3Rpb24gZW1pdERyYXdQcm9jIChlbnYsIGFyZ3MpIHtcbiAgICB2YXIgZHJhdyA9IGVudi5wcm9jKCdkcmF3JywgMSlcblxuICAgIGluamVjdEV4dGVuc2lvbnMoZW52LCBkcmF3KVxuXG4gICAgZW1pdENvbnRleHQoZW52LCBkcmF3LCBhcmdzLmNvbnRleHQpXG4gICAgZW1pdFBvbGxGcmFtZWJ1ZmZlcihlbnYsIGRyYXcsIGFyZ3MuZnJhbWVidWZmZXIpXG5cbiAgICBlbWl0UG9sbFN0YXRlKGVudiwgZHJhdywgYXJncylcbiAgICBlbWl0U2V0T3B0aW9ucyhlbnYsIGRyYXcsIGFyZ3Muc3RhdGUpXG5cbiAgICBlbWl0UHJvZmlsZShlbnYsIGRyYXcsIGFyZ3MsIGZhbHNlLCB0cnVlKVxuXG4gICAgdmFyIHByb2dyYW0gPSBhcmdzLnNoYWRlci5wcm9nVmFyLmFwcGVuZChlbnYsIGRyYXcpXG4gICAgZHJhdyhlbnYuc2hhcmVkLmdsLCAnLnVzZVByb2dyYW0oJywgcHJvZ3JhbSwgJy5wcm9ncmFtKTsnKVxuXG4gICAgaWYgKGFyZ3Muc2hhZGVyLnByb2dyYW0pIHtcbiAgICAgIGVtaXREcmF3Qm9keShlbnYsIGRyYXcsIGFyZ3MsIGFyZ3Muc2hhZGVyLnByb2dyYW0pXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBkcmF3Q2FjaGUgPSBlbnYuZ2xvYmFsLmRlZigne30nKVxuICAgICAgdmFyIFBST0dfSUQgPSBkcmF3LmRlZihwcm9ncmFtLCAnLmlkJylcbiAgICAgIHZhciBDQUNIRURfUFJPQyA9IGRyYXcuZGVmKGRyYXdDYWNoZSwgJ1snLCBQUk9HX0lELCAnXScpXG4gICAgICBkcmF3KFxuICAgICAgICBlbnYuY29uZChDQUNIRURfUFJPQylcbiAgICAgICAgICAudGhlbihDQUNIRURfUFJPQywgJy5jYWxsKHRoaXMsYTApOycpXG4gICAgICAgICAgLmVsc2UoXG4gICAgICAgICAgICBDQUNIRURfUFJPQywgJz0nLCBkcmF3Q2FjaGUsICdbJywgUFJPR19JRCwgJ109JyxcbiAgICAgICAgICAgIGVudi5saW5rKGZ1bmN0aW9uIChwcm9ncmFtKSB7XG4gICAgICAgICAgICAgIHJldHVybiBjcmVhdGVCb2R5KGVtaXREcmF3Qm9keSwgZW52LCBhcmdzLCBwcm9ncmFtLCAxKVxuICAgICAgICAgICAgfSksICcoJywgcHJvZ3JhbSwgJyk7JyxcbiAgICAgICAgICAgIENBQ0hFRF9QUk9DLCAnLmNhbGwodGhpcyxhMCk7JykpXG4gICAgfVxuXG4gICAgaWYgKE9iamVjdC5rZXlzKGFyZ3Muc3RhdGUpLmxlbmd0aCA+IDApIHtcbiAgICAgIGRyYXcoZW52LnNoYXJlZC5jdXJyZW50LCAnLmRpcnR5PXRydWU7JylcbiAgICB9XG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIEJBVENIIFBST0NcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gIGZ1bmN0aW9uIGVtaXRCYXRjaER5bmFtaWNTaGFkZXJCb2R5IChlbnYsIHNjb3BlLCBhcmdzLCBwcm9ncmFtKSB7XG4gICAgZW52LmJhdGNoSWQgPSAnYTEnXG5cbiAgICBpbmplY3RFeHRlbnNpb25zKGVudiwgc2NvcGUpXG5cbiAgICBmdW5jdGlvbiBhbGwgKCkge1xuICAgICAgcmV0dXJuIHRydWVcbiAgICB9XG5cbiAgICBlbWl0QXR0cmlidXRlcyhlbnYsIHNjb3BlLCBhcmdzLCBwcm9ncmFtLmF0dHJpYnV0ZXMsIGFsbClcbiAgICBlbWl0VW5pZm9ybXMoZW52LCBzY29wZSwgYXJncywgcHJvZ3JhbS51bmlmb3JtcywgYWxsKVxuICAgIGVtaXREcmF3KGVudiwgc2NvcGUsIHNjb3BlLCBhcmdzKVxuICB9XG5cbiAgZnVuY3Rpb24gZW1pdEJhdGNoQm9keSAoZW52LCBzY29wZSwgYXJncywgcHJvZ3JhbSkge1xuICAgIGluamVjdEV4dGVuc2lvbnMoZW52LCBzY29wZSlcblxuICAgIHZhciBjb250ZXh0RHluYW1pYyA9IGFyZ3MuY29udGV4dERlcFxuXG4gICAgdmFyIEJBVENIX0lEID0gc2NvcGUuZGVmKClcbiAgICB2YXIgUFJPUF9MSVNUID0gJ2EwJ1xuICAgIHZhciBOVU1fUFJPUFMgPSAnYTEnXG4gICAgdmFyIFBST1BTID0gc2NvcGUuZGVmKClcbiAgICBlbnYuc2hhcmVkLnByb3BzID0gUFJPUFNcbiAgICBlbnYuYmF0Y2hJZCA9IEJBVENIX0lEXG5cbiAgICB2YXIgb3V0ZXIgPSBlbnYuc2NvcGUoKVxuICAgIHZhciBpbm5lciA9IGVudi5zY29wZSgpXG5cbiAgICBzY29wZShcbiAgICAgIG91dGVyLmVudHJ5LFxuICAgICAgJ2ZvcignLCBCQVRDSF9JRCwgJz0wOycsIEJBVENIX0lELCAnPCcsIE5VTV9QUk9QUywgJzsrKycsIEJBVENIX0lELCAnKXsnLFxuICAgICAgUFJPUFMsICc9JywgUFJPUF9MSVNULCAnWycsIEJBVENIX0lELCAnXTsnLFxuICAgICAgaW5uZXIsXG4gICAgICAnfScsXG4gICAgICBvdXRlci5leGl0KVxuXG4gICAgZnVuY3Rpb24gaXNJbm5lckRlZm4gKGRlZm4pIHtcbiAgICAgIHJldHVybiAoKGRlZm4uY29udGV4dERlcCAmJiBjb250ZXh0RHluYW1pYykgfHwgZGVmbi5wcm9wRGVwKVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGlzT3V0ZXJEZWZuIChkZWZuKSB7XG4gICAgICByZXR1cm4gIWlzSW5uZXJEZWZuKGRlZm4pXG4gICAgfVxuXG4gICAgaWYgKGFyZ3MubmVlZHNDb250ZXh0KSB7XG4gICAgICBlbWl0Q29udGV4dChlbnYsIGlubmVyLCBhcmdzLmNvbnRleHQpXG4gICAgfVxuICAgIGlmIChhcmdzLm5lZWRzRnJhbWVidWZmZXIpIHtcbiAgICAgIGVtaXRQb2xsRnJhbWVidWZmZXIoZW52LCBpbm5lciwgYXJncy5mcmFtZWJ1ZmZlcilcbiAgICB9XG4gICAgZW1pdFNldE9wdGlvbnMoZW52LCBpbm5lciwgYXJncy5zdGF0ZSwgaXNJbm5lckRlZm4pXG5cbiAgICBpZiAoYXJncy5wcm9maWxlICYmIGlzSW5uZXJEZWZuKGFyZ3MucHJvZmlsZSkpIHtcbiAgICAgIGVtaXRQcm9maWxlKGVudiwgaW5uZXIsIGFyZ3MsIGZhbHNlLCB0cnVlKVxuICAgIH1cblxuICAgIGlmICghcHJvZ3JhbSkge1xuICAgICAgdmFyIHByb2dDYWNoZSA9IGVudi5nbG9iYWwuZGVmKCd7fScpXG4gICAgICB2YXIgUFJPR1JBTSA9IGFyZ3Muc2hhZGVyLnByb2dWYXIuYXBwZW5kKGVudiwgaW5uZXIpXG4gICAgICB2YXIgUFJPR19JRCA9IGlubmVyLmRlZihQUk9HUkFNLCAnLmlkJylcbiAgICAgIHZhciBDQUNIRURfUFJPQyA9IGlubmVyLmRlZihwcm9nQ2FjaGUsICdbJywgUFJPR19JRCwgJ10nKVxuICAgICAgaW5uZXIoXG4gICAgICAgIGVudi5zaGFyZWQuZ2wsICcudXNlUHJvZ3JhbSgnLCBQUk9HUkFNLCAnLnByb2dyYW0pOycsXG4gICAgICAgICdpZighJywgQ0FDSEVEX1BST0MsICcpeycsXG4gICAgICAgIENBQ0hFRF9QUk9DLCAnPScsIHByb2dDYWNoZSwgJ1snLCBQUk9HX0lELCAnXT0nLFxuICAgICAgICBlbnYubGluayhmdW5jdGlvbiAocHJvZ3JhbSkge1xuICAgICAgICAgIHJldHVybiBjcmVhdGVCb2R5KFxuICAgICAgICAgICAgZW1pdEJhdGNoRHluYW1pY1NoYWRlckJvZHksIGVudiwgYXJncywgcHJvZ3JhbSwgMilcbiAgICAgICAgfSksICcoJywgUFJPR1JBTSwgJyk7fScsXG4gICAgICAgIENBQ0hFRF9QUk9DLCAnLmNhbGwodGhpcyxhMFsnLCBCQVRDSF9JRCwgJ10sJywgQkFUQ0hfSUQsICcpOycpXG4gICAgfSBlbHNlIHtcbiAgICAgIGVtaXRBdHRyaWJ1dGVzKGVudiwgb3V0ZXIsIGFyZ3MsIHByb2dyYW0uYXR0cmlidXRlcywgaXNPdXRlckRlZm4pXG4gICAgICBlbWl0QXR0cmlidXRlcyhlbnYsIGlubmVyLCBhcmdzLCBwcm9ncmFtLmF0dHJpYnV0ZXMsIGlzSW5uZXJEZWZuKVxuICAgICAgZW1pdFVuaWZvcm1zKGVudiwgb3V0ZXIsIGFyZ3MsIHByb2dyYW0udW5pZm9ybXMsIGlzT3V0ZXJEZWZuKVxuICAgICAgZW1pdFVuaWZvcm1zKGVudiwgaW5uZXIsIGFyZ3MsIHByb2dyYW0udW5pZm9ybXMsIGlzSW5uZXJEZWZuKVxuICAgICAgZW1pdERyYXcoZW52LCBvdXRlciwgaW5uZXIsIGFyZ3MpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZW1pdEJhdGNoUHJvYyAoZW52LCBhcmdzKSB7XG4gICAgdmFyIGJhdGNoID0gZW52LnByb2MoJ2JhdGNoJywgMilcbiAgICBlbnYuYmF0Y2hJZCA9ICcwJ1xuXG4gICAgaW5qZWN0RXh0ZW5zaW9ucyhlbnYsIGJhdGNoKVxuXG4gICAgLy8gQ2hlY2sgaWYgYW55IGNvbnRleHQgdmFyaWFibGVzIGRlcGVuZCBvbiBwcm9wc1xuICAgIHZhciBjb250ZXh0RHluYW1pYyA9IGZhbHNlXG4gICAgdmFyIG5lZWRzQ29udGV4dCA9IHRydWVcbiAgICBPYmplY3Qua2V5cyhhcmdzLmNvbnRleHQpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIGNvbnRleHREeW5hbWljID0gY29udGV4dER5bmFtaWMgfHwgYXJncy5jb250ZXh0W25hbWVdLnByb3BEZXBcbiAgICB9KVxuICAgIGlmICghY29udGV4dER5bmFtaWMpIHtcbiAgICAgIGVtaXRDb250ZXh0KGVudiwgYmF0Y2gsIGFyZ3MuY29udGV4dClcbiAgICAgIG5lZWRzQ29udGV4dCA9IGZhbHNlXG4gICAgfVxuXG4gICAgLy8gZnJhbWVidWZmZXIgc3RhdGUgYWZmZWN0cyBmcmFtZWJ1ZmZlcldpZHRoL2hlaWdodCBjb250ZXh0IHZhcnNcbiAgICB2YXIgZnJhbWVidWZmZXIgPSBhcmdzLmZyYW1lYnVmZmVyXG4gICAgdmFyIG5lZWRzRnJhbWVidWZmZXIgPSBmYWxzZVxuICAgIGlmIChmcmFtZWJ1ZmZlcikge1xuICAgICAgaWYgKGZyYW1lYnVmZmVyLnByb3BEZXApIHtcbiAgICAgICAgY29udGV4dER5bmFtaWMgPSBuZWVkc0ZyYW1lYnVmZmVyID0gdHJ1ZVxuICAgICAgfSBlbHNlIGlmIChmcmFtZWJ1ZmZlci5jb250ZXh0RGVwICYmIGNvbnRleHREeW5hbWljKSB7XG4gICAgICAgIG5lZWRzRnJhbWVidWZmZXIgPSB0cnVlXG4gICAgICB9XG4gICAgICBpZiAoIW5lZWRzRnJhbWVidWZmZXIpIHtcbiAgICAgICAgZW1pdFBvbGxGcmFtZWJ1ZmZlcihlbnYsIGJhdGNoLCBmcmFtZWJ1ZmZlcilcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgZW1pdFBvbGxGcmFtZWJ1ZmZlcihlbnYsIGJhdGNoLCBudWxsKVxuICAgIH1cblxuICAgIC8vIHZpZXdwb3J0IGlzIHdlaXJkIGJlY2F1c2UgaXQgY2FuIGFmZmVjdCBjb250ZXh0IHZhcnNcbiAgICBpZiAoYXJncy5zdGF0ZS52aWV3cG9ydCAmJiBhcmdzLnN0YXRlLnZpZXdwb3J0LnByb3BEZXApIHtcbiAgICAgIGNvbnRleHREeW5hbWljID0gdHJ1ZVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGlzSW5uZXJEZWZuIChkZWZuKSB7XG4gICAgICByZXR1cm4gKGRlZm4uY29udGV4dERlcCAmJiBjb250ZXh0RHluYW1pYykgfHwgZGVmbi5wcm9wRGVwXG4gICAgfVxuXG4gICAgLy8gc2V0IHdlYmdsIG9wdGlvbnNcbiAgICBlbWl0UG9sbFN0YXRlKGVudiwgYmF0Y2gsIGFyZ3MpXG4gICAgZW1pdFNldE9wdGlvbnMoZW52LCBiYXRjaCwgYXJncy5zdGF0ZSwgZnVuY3Rpb24gKGRlZm4pIHtcbiAgICAgIHJldHVybiAhaXNJbm5lckRlZm4oZGVmbilcbiAgICB9KVxuXG4gICAgaWYgKCFhcmdzLnByb2ZpbGUgfHwgIWlzSW5uZXJEZWZuKGFyZ3MucHJvZmlsZSkpIHtcbiAgICAgIGVtaXRQcm9maWxlKGVudiwgYmF0Y2gsIGFyZ3MsIGZhbHNlLCAnYTEnKVxuICAgIH1cblxuICAgIC8vIFNhdmUgdGhlc2UgdmFsdWVzIHRvIGFyZ3Mgc28gdGhhdCB0aGUgYmF0Y2ggYm9keSByb3V0aW5lIGNhbiB1c2UgdGhlbVxuICAgIGFyZ3MuY29udGV4dERlcCA9IGNvbnRleHREeW5hbWljXG4gICAgYXJncy5uZWVkc0NvbnRleHQgPSBuZWVkc0NvbnRleHRcbiAgICBhcmdzLm5lZWRzRnJhbWVidWZmZXIgPSBuZWVkc0ZyYW1lYnVmZmVyXG5cbiAgICAvLyBkZXRlcm1pbmUgaWYgc2hhZGVyIGlzIGR5bmFtaWNcbiAgICB2YXIgcHJvZ0RlZm4gPSBhcmdzLnNoYWRlci5wcm9nVmFyXG4gICAgaWYgKChwcm9nRGVmbi5jb250ZXh0RGVwICYmIGNvbnRleHREeW5hbWljKSB8fCBwcm9nRGVmbi5wcm9wRGVwKSB7XG4gICAgICBlbWl0QmF0Y2hCb2R5KFxuICAgICAgICBlbnYsXG4gICAgICAgIGJhdGNoLFxuICAgICAgICBhcmdzLFxuICAgICAgICBudWxsKVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgUFJPR1JBTSA9IHByb2dEZWZuLmFwcGVuZChlbnYsIGJhdGNoKVxuICAgICAgYmF0Y2goZW52LnNoYXJlZC5nbCwgJy51c2VQcm9ncmFtKCcsIFBST0dSQU0sICcucHJvZ3JhbSk7JylcbiAgICAgIGlmIChhcmdzLnNoYWRlci5wcm9ncmFtKSB7XG4gICAgICAgIGVtaXRCYXRjaEJvZHkoXG4gICAgICAgICAgZW52LFxuICAgICAgICAgIGJhdGNoLFxuICAgICAgICAgIGFyZ3MsXG4gICAgICAgICAgYXJncy5zaGFkZXIucHJvZ3JhbSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBiYXRjaENhY2hlID0gZW52Lmdsb2JhbC5kZWYoJ3t9JylcbiAgICAgICAgdmFyIFBST0dfSUQgPSBiYXRjaC5kZWYoUFJPR1JBTSwgJy5pZCcpXG4gICAgICAgIHZhciBDQUNIRURfUFJPQyA9IGJhdGNoLmRlZihiYXRjaENhY2hlLCAnWycsIFBST0dfSUQsICddJylcbiAgICAgICAgYmF0Y2goXG4gICAgICAgICAgZW52LmNvbmQoQ0FDSEVEX1BST0MpXG4gICAgICAgICAgICAudGhlbihDQUNIRURfUFJPQywgJy5jYWxsKHRoaXMsYTAsYTEpOycpXG4gICAgICAgICAgICAuZWxzZShcbiAgICAgICAgICAgICAgQ0FDSEVEX1BST0MsICc9JywgYmF0Y2hDYWNoZSwgJ1snLCBQUk9HX0lELCAnXT0nLFxuICAgICAgICAgICAgICBlbnYubGluayhmdW5jdGlvbiAocHJvZ3JhbSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBjcmVhdGVCb2R5KGVtaXRCYXRjaEJvZHksIGVudiwgYXJncywgcHJvZ3JhbSwgMilcbiAgICAgICAgICAgICAgfSksICcoJywgUFJPR1JBTSwgJyk7JyxcbiAgICAgICAgICAgICAgQ0FDSEVEX1BST0MsICcuY2FsbCh0aGlzLGEwLGExKTsnKSlcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoT2JqZWN0LmtleXMoYXJncy5zdGF0ZSkubGVuZ3RoID4gMCkge1xuICAgICAgYmF0Y2goZW52LnNoYXJlZC5jdXJyZW50LCAnLmRpcnR5PXRydWU7JylcbiAgICB9XG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIFNDT1BFIENPTU1BTkRcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICBmdW5jdGlvbiBlbWl0U2NvcGVQcm9jIChlbnYsIGFyZ3MpIHtcbiAgICB2YXIgc2NvcGUgPSBlbnYucHJvYygnc2NvcGUnLCAzKVxuICAgIGVudi5iYXRjaElkID0gJ2EyJ1xuXG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcbiAgICB2YXIgQ1VSUkVOVF9TVEFURSA9IHNoYXJlZC5jdXJyZW50XG5cbiAgICBlbWl0Q29udGV4dChlbnYsIHNjb3BlLCBhcmdzLmNvbnRleHQpXG5cbiAgICBpZiAoYXJncy5mcmFtZWJ1ZmZlcikge1xuICAgICAgYXJncy5mcmFtZWJ1ZmZlci5hcHBlbmQoZW52LCBzY29wZSlcbiAgICB9XG5cbiAgICBzb3J0U3RhdGUoT2JqZWN0LmtleXMoYXJncy5zdGF0ZSkpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHZhciBkZWZuID0gYXJncy5zdGF0ZVtuYW1lXVxuICAgICAgdmFyIHZhbHVlID0gZGVmbi5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgIGlmIChpc0FycmF5TGlrZSh2YWx1ZSkpIHtcbiAgICAgICAgdmFsdWUuZm9yRWFjaChmdW5jdGlvbiAodiwgaSkge1xuICAgICAgICAgIHNjb3BlLnNldChlbnYubmV4dFtuYW1lXSwgJ1snICsgaSArICddJywgdilcbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNjb3BlLnNldChzaGFyZWQubmV4dCwgJy4nICsgbmFtZSwgdmFsdWUpXG4gICAgICB9XG4gICAgfSlcblxuICAgIGVtaXRQcm9maWxlKGVudiwgc2NvcGUsIGFyZ3MsIHRydWUsIHRydWUpXG5cbiAgICA7W1NfRUxFTUVOVFMsIFNfT0ZGU0VULCBTX0NPVU5ULCBTX0lOU1RBTkNFUywgU19QUklNSVRJVkVdLmZvckVhY2goXG4gICAgICBmdW5jdGlvbiAob3B0KSB7XG4gICAgICAgIHZhciB2YXJpYWJsZSA9IGFyZ3MuZHJhd1tvcHRdXG4gICAgICAgIGlmICghdmFyaWFibGUpIHtcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuICAgICAgICBzY29wZS5zZXQoc2hhcmVkLmRyYXcsICcuJyArIG9wdCwgJycgKyB2YXJpYWJsZS5hcHBlbmQoZW52LCBzY29wZSkpXG4gICAgICB9KVxuXG4gICAgT2JqZWN0LmtleXMoYXJncy51bmlmb3JtcykuZm9yRWFjaChmdW5jdGlvbiAob3B0KSB7XG4gICAgICBzY29wZS5zZXQoXG4gICAgICAgIHNoYXJlZC51bmlmb3JtcyxcbiAgICAgICAgJ1snICsgc3RyaW5nU3RvcmUuaWQob3B0KSArICddJyxcbiAgICAgICAgYXJncy51bmlmb3Jtc1tvcHRdLmFwcGVuZChlbnYsIHNjb3BlKSlcbiAgICB9KVxuXG4gICAgT2JqZWN0LmtleXMoYXJncy5hdHRyaWJ1dGVzKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICB2YXIgcmVjb3JkID0gYXJncy5hdHRyaWJ1dGVzW25hbWVdLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgdmFyIHNjb3BlQXR0cmliID0gZW52LnNjb3BlQXR0cmliKG5hbWUpXG4gICAgICBPYmplY3Qua2V5cyhuZXcgQXR0cmlidXRlUmVjb3JkKCkpLmZvckVhY2goZnVuY3Rpb24gKHByb3ApIHtcbiAgICAgICAgc2NvcGUuc2V0KHNjb3BlQXR0cmliLCAnLicgKyBwcm9wLCByZWNvcmRbcHJvcF0pXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBmdW5jdGlvbiBzYXZlU2hhZGVyIChuYW1lKSB7XG4gICAgICB2YXIgc2hhZGVyID0gYXJncy5zaGFkZXJbbmFtZV1cbiAgICAgIGlmIChzaGFkZXIpIHtcbiAgICAgICAgc2NvcGUuc2V0KHNoYXJlZC5zaGFkZXIsICcuJyArIG5hbWUsIHNoYWRlci5hcHBlbmQoZW52LCBzY29wZSkpXG4gICAgICB9XG4gICAgfVxuICAgIHNhdmVTaGFkZXIoU19WRVJUKVxuICAgIHNhdmVTaGFkZXIoU19GUkFHKVxuXG4gICAgaWYgKE9iamVjdC5rZXlzKGFyZ3Muc3RhdGUpLmxlbmd0aCA+IDApIHtcbiAgICAgIHNjb3BlKENVUlJFTlRfU1RBVEUsICcuZGlydHk9dHJ1ZTsnKVxuICAgICAgc2NvcGUuZXhpdChDVVJSRU5UX1NUQVRFLCAnLmRpcnR5PXRydWU7JylcbiAgICB9XG5cbiAgICBzY29wZSgnYTEoJywgZW52LnNoYXJlZC5jb250ZXh0LCAnLGEwLCcsIGVudi5iYXRjaElkLCAnKTsnKVxuICB9XG5cbiAgZnVuY3Rpb24gaXNEeW5hbWljT2JqZWN0IChvYmplY3QpIHtcbiAgICBpZiAodHlwZW9mIG9iamVjdCAhPT0gJ29iamVjdCcgfHwgaXNBcnJheUxpa2Uob2JqZWN0KSkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIHZhciBwcm9wcyA9IE9iamVjdC5rZXlzKG9iamVjdClcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHByb3BzLmxlbmd0aDsgKytpKSB7XG4gICAgICBpZiAoZHluYW1pYy5pc0R5bmFtaWMob2JqZWN0W3Byb3BzW2ldXSkpIHtcbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cblxuICBmdW5jdGlvbiBzcGxhdE9iamVjdCAoZW52LCBvcHRpb25zLCBuYW1lKSB7XG4gICAgdmFyIG9iamVjdCA9IG9wdGlvbnMuc3RhdGljW25hbWVdXG4gICAgaWYgKCFvYmplY3QgfHwgIWlzRHluYW1pY09iamVjdChvYmplY3QpKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICB2YXIgZ2xvYmFscyA9IGVudi5nbG9iYWxcbiAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKG9iamVjdClcbiAgICB2YXIgdGhpc0RlcCA9IGZhbHNlXG4gICAgdmFyIGNvbnRleHREZXAgPSBmYWxzZVxuICAgIHZhciBwcm9wRGVwID0gZmFsc2VcbiAgICB2YXIgb2JqZWN0UmVmID0gZW52Lmdsb2JhbC5kZWYoJ3t9JylcbiAgICBrZXlzLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgdmFyIHZhbHVlID0gb2JqZWN0W2tleV1cbiAgICAgIGlmIChkeW5hbWljLmlzRHluYW1pYyh2YWx1ZSkpIHtcbiAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgIHZhbHVlID0gb2JqZWN0W2tleV0gPSBkeW5hbWljLnVuYm94KHZhbHVlKVxuICAgICAgICB9XG4gICAgICAgIHZhciBkZXBzID0gY3JlYXRlRHluYW1pY0RlY2wodmFsdWUsIG51bGwpXG4gICAgICAgIHRoaXNEZXAgPSB0aGlzRGVwIHx8IGRlcHMudGhpc0RlcFxuICAgICAgICBwcm9wRGVwID0gcHJvcERlcCB8fCBkZXBzLnByb3BEZXBcbiAgICAgICAgY29udGV4dERlcCA9IGNvbnRleHREZXAgfHwgZGVwcy5jb250ZXh0RGVwXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBnbG9iYWxzKG9iamVjdFJlZiwgJy4nLCBrZXksICc9JylcbiAgICAgICAgc3dpdGNoICh0eXBlb2YgdmFsdWUpIHtcbiAgICAgICAgICBjYXNlICdudW1iZXInOlxuICAgICAgICAgICAgZ2xvYmFscyh2YWx1ZSlcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgICAgICAgIGdsb2JhbHMoJ1wiJywgdmFsdWUsICdcIicpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcbiAgICAgICAgICAgICAgZ2xvYmFscygnWycsIHZhbHVlLmpvaW4oKSwgJ10nKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgZ2xvYmFscyhlbnYubGluayh2YWx1ZSkpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICB9XG4gICAgICAgIGdsb2JhbHMoJzsnKVxuICAgICAgfVxuICAgIH0pXG5cbiAgICBmdW5jdGlvbiBhcHBlbmRCbG9jayAoZW52LCBibG9jaykge1xuICAgICAga2V5cy5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgdmFyIHZhbHVlID0gb2JqZWN0W2tleV1cbiAgICAgICAgaWYgKCFkeW5hbWljLmlzRHluYW1pYyh2YWx1ZSkpIHtcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuICAgICAgICB2YXIgcmVmID0gZW52Lmludm9rZShibG9jaywgdmFsdWUpXG4gICAgICAgIGJsb2NrKG9iamVjdFJlZiwgJy4nLCBrZXksICc9JywgcmVmLCAnOycpXG4gICAgICB9KVxuICAgIH1cblxuICAgIG9wdGlvbnMuZHluYW1pY1tuYW1lXSA9IG5ldyBkeW5hbWljLkR5bmFtaWNWYXJpYWJsZShEWU5fVEhVTkssIHtcbiAgICAgIHRoaXNEZXA6IHRoaXNEZXAsXG4gICAgICBjb250ZXh0RGVwOiBjb250ZXh0RGVwLFxuICAgICAgcHJvcERlcDogcHJvcERlcCxcbiAgICAgIHJlZjogb2JqZWN0UmVmLFxuICAgICAgYXBwZW5kOiBhcHBlbmRCbG9ja1xuICAgIH0pXG4gICAgZGVsZXRlIG9wdGlvbnMuc3RhdGljW25hbWVdXG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIE1BSU4gRFJBVyBDT01NQU5EXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgZnVuY3Rpb24gY29tcGlsZUNvbW1hbmQgKG9wdGlvbnMsIGF0dHJpYnV0ZXMsIHVuaWZvcm1zLCBjb250ZXh0LCBzdGF0cykge1xuICAgIHZhciBlbnYgPSBjcmVhdGVSRUdMRW52aXJvbm1lbnQoKVxuXG4gICAgLy8gbGluayBzdGF0cywgc28gdGhhdCB3ZSBjYW4gZWFzaWx5IGFjY2VzcyBpdCBpbiB0aGUgcHJvZ3JhbS5cbiAgICBlbnYuc3RhdHMgPSBlbnYubGluayhzdGF0cylcblxuICAgIC8vIHNwbGF0IG9wdGlvbnMgYW5kIGF0dHJpYnV0ZXMgdG8gYWxsb3cgZm9yIGR5bmFtaWMgbmVzdGVkIHByb3BlcnRpZXNcbiAgICBPYmplY3Qua2V5cyhhdHRyaWJ1dGVzLnN0YXRpYykuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICBzcGxhdE9iamVjdChlbnYsIGF0dHJpYnV0ZXMsIGtleSlcbiAgICB9KVxuICAgIE5FU1RFRF9PUFRJT05TLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHNwbGF0T2JqZWN0KGVudiwgb3B0aW9ucywgbmFtZSlcbiAgICB9KVxuXG4gICAgdmFyIGFyZ3MgPSBwYXJzZUFyZ3VtZW50cyhvcHRpb25zLCBhdHRyaWJ1dGVzLCB1bmlmb3JtcywgY29udGV4dCwgZW52KVxuXG4gICAgZW1pdERyYXdQcm9jKGVudiwgYXJncylcbiAgICBlbWl0U2NvcGVQcm9jKGVudiwgYXJncylcbiAgICBlbWl0QmF0Y2hQcm9jKGVudiwgYXJncylcblxuICAgIHJldHVybiBlbnYuY29tcGlsZSgpXG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIFBPTEwgLyBSRUZSRVNIXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgcmV0dXJuIHtcbiAgICBuZXh0OiBuZXh0U3RhdGUsXG4gICAgY3VycmVudDogY3VycmVudFN0YXRlLFxuICAgIHByb2NzOiAoZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIGVudiA9IGNyZWF0ZVJFR0xFbnZpcm9ubWVudCgpXG4gICAgICB2YXIgcG9sbCA9IGVudi5wcm9jKCdwb2xsJylcbiAgICAgIHZhciByZWZyZXNoID0gZW52LnByb2MoJ3JlZnJlc2gnKVxuICAgICAgdmFyIGNvbW1vbiA9IGVudi5ibG9jaygpXG4gICAgICBwb2xsKGNvbW1vbilcbiAgICAgIHJlZnJlc2goY29tbW9uKVxuXG4gICAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuICAgICAgdmFyIEdMID0gc2hhcmVkLmdsXG4gICAgICB2YXIgTkVYVF9TVEFURSA9IHNoYXJlZC5uZXh0XG4gICAgICB2YXIgQ1VSUkVOVF9TVEFURSA9IHNoYXJlZC5jdXJyZW50XG5cbiAgICAgIGNvbW1vbihDVVJSRU5UX1NUQVRFLCAnLmRpcnR5PWZhbHNlOycpXG5cbiAgICAgIGVtaXRQb2xsRnJhbWVidWZmZXIoZW52LCBwb2xsKVxuICAgICAgZW1pdFBvbGxGcmFtZWJ1ZmZlcihlbnYsIHJlZnJlc2gsIG51bGwsIHRydWUpXG5cbiAgICAgIC8vIFJlZnJlc2ggdXBkYXRlcyBhbGwgYXR0cmlidXRlIHN0YXRlIGNoYW5nZXNcbiAgICAgIHZhciBleHRJbnN0YW5jaW5nID0gZ2wuZ2V0RXh0ZW5zaW9uKCdhbmdsZV9pbnN0YW5jZWRfYXJyYXlzJylcbiAgICAgIHZhciBJTlNUQU5DSU5HXG4gICAgICBpZiAoZXh0SW5zdGFuY2luZykge1xuICAgICAgICBJTlNUQU5DSU5HID0gZW52LmxpbmsoZXh0SW5zdGFuY2luZylcbiAgICAgIH1cbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGltaXRzLm1heEF0dHJpYnV0ZXM7ICsraSkge1xuICAgICAgICB2YXIgQklORElORyA9IHJlZnJlc2guZGVmKHNoYXJlZC5hdHRyaWJ1dGVzLCAnWycsIGksICddJylcbiAgICAgICAgdmFyIGlmdGUgPSBlbnYuY29uZChCSU5ESU5HLCAnLmJ1ZmZlcicpXG4gICAgICAgIGlmdGUudGhlbihcbiAgICAgICAgICBHTCwgJy5lbmFibGVWZXJ0ZXhBdHRyaWJBcnJheSgnLCBpLCAnKTsnLFxuICAgICAgICAgIEdMLCAnLmJpbmRCdWZmZXIoJyxcbiAgICAgICAgICAgIEdMX0FSUkFZX0JVRkZFUiwgJywnLFxuICAgICAgICAgICAgQklORElORywgJy5idWZmZXIuYnVmZmVyKTsnLFxuICAgICAgICAgIEdMLCAnLnZlcnRleEF0dHJpYlBvaW50ZXIoJyxcbiAgICAgICAgICAgIGksICcsJyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcuc2l6ZSwnLFxuICAgICAgICAgICAgQklORElORywgJy50eXBlLCcsXG4gICAgICAgICAgICBCSU5ESU5HLCAnLm5vcm1hbGl6ZWQsJyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcuc3RyaWRlLCcsXG4gICAgICAgICAgICBCSU5ESU5HLCAnLm9mZnNldCk7J1xuICAgICAgICApLmVsc2UoXG4gICAgICAgICAgR0wsICcuZGlzYWJsZVZlcnRleEF0dHJpYkFycmF5KCcsIGksICcpOycsXG4gICAgICAgICAgR0wsICcudmVydGV4QXR0cmliNGYoJyxcbiAgICAgICAgICAgIGksICcsJyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcueCwnLFxuICAgICAgICAgICAgQklORElORywgJy55LCcsXG4gICAgICAgICAgICBCSU5ESU5HLCAnLnosJyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcudyk7JyxcbiAgICAgICAgICBCSU5ESU5HLCAnLmJ1ZmZlcj1udWxsOycpXG4gICAgICAgIHJlZnJlc2goaWZ0ZSlcbiAgICAgICAgaWYgKGV4dEluc3RhbmNpbmcpIHtcbiAgICAgICAgICByZWZyZXNoKFxuICAgICAgICAgICAgSU5TVEFOQ0lORywgJy52ZXJ0ZXhBdHRyaWJEaXZpc29yQU5HTEUoJyxcbiAgICAgICAgICAgIGksICcsJyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcuZGl2aXNvcik7JylcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBPYmplY3Qua2V5cyhHTF9GTEFHUykuZm9yRWFjaChmdW5jdGlvbiAoZmxhZykge1xuICAgICAgICB2YXIgY2FwID0gR0xfRkxBR1NbZmxhZ11cbiAgICAgICAgdmFyIE5FWFQgPSBjb21tb24uZGVmKE5FWFRfU1RBVEUsICcuJywgZmxhZylcbiAgICAgICAgdmFyIGJsb2NrID0gZW52LmJsb2NrKClcbiAgICAgICAgYmxvY2soJ2lmKCcsIE5FWFQsICcpeycsXG4gICAgICAgICAgR0wsICcuZW5hYmxlKCcsIGNhcCwgJyl9ZWxzZXsnLFxuICAgICAgICAgIEdMLCAnLmRpc2FibGUoJywgY2FwLCAnKX0nLFxuICAgICAgICAgIENVUlJFTlRfU1RBVEUsICcuJywgZmxhZywgJz0nLCBORVhULCAnOycpXG4gICAgICAgIHJlZnJlc2goYmxvY2spXG4gICAgICAgIHBvbGwoXG4gICAgICAgICAgJ2lmKCcsIE5FWFQsICchPT0nLCBDVVJSRU5UX1NUQVRFLCAnLicsIGZsYWcsICcpeycsXG4gICAgICAgICAgYmxvY2ssXG4gICAgICAgICAgJ30nKVxuICAgICAgfSlcblxuICAgICAgT2JqZWN0LmtleXMoR0xfVkFSSUFCTEVTKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICAgIHZhciBmdW5jID0gR0xfVkFSSUFCTEVTW25hbWVdXG4gICAgICAgIHZhciBpbml0ID0gY3VycmVudFN0YXRlW25hbWVdXG4gICAgICAgIHZhciBORVhULCBDVVJSRU5UXG4gICAgICAgIHZhciBibG9jayA9IGVudi5ibG9jaygpXG4gICAgICAgIGJsb2NrKEdMLCAnLicsIGZ1bmMsICcoJylcbiAgICAgICAgaWYgKGlzQXJyYXlMaWtlKGluaXQpKSB7XG4gICAgICAgICAgdmFyIG4gPSBpbml0Lmxlbmd0aFxuICAgICAgICAgIE5FWFQgPSBlbnYuZ2xvYmFsLmRlZihORVhUX1NUQVRFLCAnLicsIG5hbWUpXG4gICAgICAgICAgQ1VSUkVOVCA9IGVudi5nbG9iYWwuZGVmKENVUlJFTlRfU1RBVEUsICcuJywgbmFtZSlcbiAgICAgICAgICBibG9jayhcbiAgICAgICAgICAgIGxvb3AobiwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIE5FWFQgKyAnWycgKyBpICsgJ10nXG4gICAgICAgICAgICB9KSwgJyk7JyxcbiAgICAgICAgICAgIGxvb3AobiwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIENVUlJFTlQgKyAnWycgKyBpICsgJ109JyArIE5FWFQgKyAnWycgKyBpICsgJ107J1xuICAgICAgICAgICAgfSkuam9pbignJykpXG4gICAgICAgICAgcG9sbChcbiAgICAgICAgICAgICdpZignLCBsb29wKG4sIGZ1bmN0aW9uIChpKSB7XG4gICAgICAgICAgICAgIHJldHVybiBORVhUICsgJ1snICsgaSArICddIT09JyArIENVUlJFTlQgKyAnWycgKyBpICsgJ10nXG4gICAgICAgICAgICB9KS5qb2luKCd8fCcpLCAnKXsnLFxuICAgICAgICAgICAgYmxvY2ssXG4gICAgICAgICAgICAnfScpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgTkVYVCA9IGNvbW1vbi5kZWYoTkVYVF9TVEFURSwgJy4nLCBuYW1lKVxuICAgICAgICAgIENVUlJFTlQgPSBjb21tb24uZGVmKENVUlJFTlRfU1RBVEUsICcuJywgbmFtZSlcbiAgICAgICAgICBibG9jayhcbiAgICAgICAgICAgIE5FWFQsICcpOycsXG4gICAgICAgICAgICBDVVJSRU5UX1NUQVRFLCAnLicsIG5hbWUsICc9JywgTkVYVCwgJzsnKVxuICAgICAgICAgIHBvbGwoXG4gICAgICAgICAgICAnaWYoJywgTkVYVCwgJyE9PScsIENVUlJFTlQsICcpeycsXG4gICAgICAgICAgICBibG9jayxcbiAgICAgICAgICAgICd9JylcbiAgICAgICAgfVxuICAgICAgICByZWZyZXNoKGJsb2NrKVxuICAgICAgfSlcblxuICAgICAgcmV0dXJuIGVudi5jb21waWxlKClcbiAgICB9KSgpLFxuICAgIGNvbXBpbGU6IGNvbXBpbGVDb21tYW5kXG4gIH1cbn1cbiIsInZhciBWQVJJQUJMRV9DT1VOVEVSID0gMFxuXG52YXIgRFlOX0ZVTkMgPSAwXG5cbmZ1bmN0aW9uIER5bmFtaWNWYXJpYWJsZSAodHlwZSwgZGF0YSkge1xuICB0aGlzLmlkID0gKFZBUklBQkxFX0NPVU5URVIrKylcbiAgdGhpcy50eXBlID0gdHlwZVxuICB0aGlzLmRhdGEgPSBkYXRhXG59XG5cbmZ1bmN0aW9uIGVzY2FwZVN0ciAoc3RyKSB7XG4gIHJldHVybiBzdHIucmVwbGFjZSgvXFxcXC9nLCAnXFxcXFxcXFwnKS5yZXBsYWNlKC9cIi9nLCAnXFxcXFwiJylcbn1cblxuZnVuY3Rpb24gc3BsaXRQYXJ0cyAoc3RyKSB7XG4gIGlmIChzdHIubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIFtdXG4gIH1cblxuICB2YXIgZmlyc3RDaGFyID0gc3RyLmNoYXJBdCgwKVxuICB2YXIgbGFzdENoYXIgPSBzdHIuY2hhckF0KHN0ci5sZW5ndGggLSAxKVxuXG4gIGlmIChzdHIubGVuZ3RoID4gMSAmJlxuICAgICAgZmlyc3RDaGFyID09PSBsYXN0Q2hhciAmJlxuICAgICAgKGZpcnN0Q2hhciA9PT0gJ1wiJyB8fCBmaXJzdENoYXIgPT09IFwiJ1wiKSkge1xuICAgIHJldHVybiBbJ1wiJyArIGVzY2FwZVN0cihzdHIuc3Vic3RyKDEsIHN0ci5sZW5ndGggLSAyKSkgKyAnXCInXVxuICB9XG5cbiAgdmFyIHBhcnRzID0gL1xcWyhmYWxzZXx0cnVlfG51bGx8XFxkK3wnW14nXSonfFwiW15cIl0qXCIpXFxdLy5leGVjKHN0cilcbiAgaWYgKHBhcnRzKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHNwbGl0UGFydHMoc3RyLnN1YnN0cigwLCBwYXJ0cy5pbmRleCkpXG4gICAgICAuY29uY2F0KHNwbGl0UGFydHMocGFydHNbMV0pKVxuICAgICAgLmNvbmNhdChzcGxpdFBhcnRzKHN0ci5zdWJzdHIocGFydHMuaW5kZXggKyBwYXJ0c1swXS5sZW5ndGgpKSlcbiAgICApXG4gIH1cblxuICB2YXIgc3VicGFydHMgPSBzdHIuc3BsaXQoJy4nKVxuICBpZiAoc3VicGFydHMubGVuZ3RoID09PSAxKSB7XG4gICAgcmV0dXJuIFsnXCInICsgZXNjYXBlU3RyKHN0cikgKyAnXCInXVxuICB9XG5cbiAgdmFyIHJlc3VsdCA9IFtdXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3VicGFydHMubGVuZ3RoOyArK2kpIHtcbiAgICByZXN1bHQgPSByZXN1bHQuY29uY2F0KHNwbGl0UGFydHMoc3VicGFydHNbaV0pKVxuICB9XG4gIHJldHVybiByZXN1bHRcbn1cblxuZnVuY3Rpb24gdG9BY2Nlc3NvclN0cmluZyAoc3RyKSB7XG4gIHJldHVybiAnWycgKyBzcGxpdFBhcnRzKHN0cikuam9pbignXVsnKSArICddJ1xufVxuXG5mdW5jdGlvbiBkZWZpbmVEeW5hbWljICh0eXBlLCBkYXRhKSB7XG4gIHJldHVybiBuZXcgRHluYW1pY1ZhcmlhYmxlKHR5cGUsIHRvQWNjZXNzb3JTdHJpbmcoZGF0YSArICcnKSlcbn1cblxuZnVuY3Rpb24gaXNEeW5hbWljICh4KSB7XG4gIHJldHVybiAodHlwZW9mIHggPT09ICdmdW5jdGlvbicgJiYgIXguX3JlZ2xUeXBlKSB8fFxuICAgICAgICAgeCBpbnN0YW5jZW9mIER5bmFtaWNWYXJpYWJsZVxufVxuXG5mdW5jdGlvbiB1bmJveCAoeCwgcGF0aCkge1xuICBpZiAodHlwZW9mIHggPT09ICdmdW5jdGlvbicpIHtcbiAgICByZXR1cm4gbmV3IER5bmFtaWNWYXJpYWJsZShEWU5fRlVOQywgeClcbiAgfVxuICByZXR1cm4geFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgRHluYW1pY1ZhcmlhYmxlOiBEeW5hbWljVmFyaWFibGUsXG4gIGRlZmluZTogZGVmaW5lRHluYW1pYyxcbiAgaXNEeW5hbWljOiBpc0R5bmFtaWMsXG4gIHVuYm94OiB1bmJveCxcbiAgYWNjZXNzb3I6IHRvQWNjZXNzb3JTdHJpbmdcbn1cbiIsIlxudmFyIGlzVHlwZWRBcnJheSA9IHJlcXVpcmUoJy4vdXRpbC9pcy10eXBlZC1hcnJheScpXG52YXIgaXNOREFycmF5TGlrZSA9IHJlcXVpcmUoJy4vdXRpbC9pcy1uZGFycmF5JylcbnZhciB2YWx1ZXMgPSByZXF1aXJlKCcuL3V0aWwvdmFsdWVzJylcblxudmFyIHByaW1UeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL3ByaW1pdGl2ZXMuanNvbicpXG52YXIgdXNhZ2VUeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL3VzYWdlLmpzb24nKVxuXG52YXIgR0xfUE9JTlRTID0gMFxudmFyIEdMX0xJTkVTID0gMVxudmFyIEdMX1RSSUFOR0xFUyA9IDRcblxudmFyIEdMX0JZVEUgPSA1MTIwXG52YXIgR0xfVU5TSUdORURfQllURSA9IDUxMjFcbnZhciBHTF9TSE9SVCA9IDUxMjJcbnZhciBHTF9VTlNJR05FRF9TSE9SVCA9IDUxMjNcbnZhciBHTF9JTlQgPSA1MTI0XG52YXIgR0xfVU5TSUdORURfSU5UID0gNTEyNVxuXG52YXIgR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIgPSAzNDk2M1xuXG52YXIgR0xfU1RSRUFNX0RSQVcgPSAweDg4RTBcbnZhciBHTF9TVEFUSUNfRFJBVyA9IDB4ODhFNFxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBFbGVtZW50c1N0YXRlIChnbCwgZXh0ZW5zaW9ucywgYnVmZmVyU3RhdGUsIHN0YXRzKSB7XG4gIHZhciBlbGVtZW50U2V0ID0ge31cbiAgdmFyIGVsZW1lbnRDb3VudCA9IDBcblxuICB2YXIgZWxlbWVudFR5cGVzID0ge1xuICAgICd1aW50OCc6IEdMX1VOU0lHTkVEX0JZVEUsXG4gICAgJ3VpbnQxNic6IEdMX1VOU0lHTkVEX1NIT1JUXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5vZXNfZWxlbWVudF9pbmRleF91aW50KSB7XG4gICAgZWxlbWVudFR5cGVzLnVpbnQzMiA9IEdMX1VOU0lHTkVEX0lOVFxuICB9XG5cbiAgZnVuY3Rpb24gUkVHTEVsZW1lbnRCdWZmZXIgKGJ1ZmZlcikge1xuICAgIHRoaXMuaWQgPSBlbGVtZW50Q291bnQrK1xuICAgIGVsZW1lbnRTZXRbdGhpcy5pZF0gPSB0aGlzXG4gICAgdGhpcy5idWZmZXIgPSBidWZmZXJcbiAgICB0aGlzLnByaW1UeXBlID0gR0xfVFJJQU5HTEVTXG4gICAgdGhpcy52ZXJ0Q291bnQgPSAwXG4gICAgdGhpcy50eXBlID0gMFxuICB9XG5cbiAgUkVHTEVsZW1lbnRCdWZmZXIucHJvdG90eXBlLmJpbmQgPSBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5idWZmZXIuYmluZCgpXG4gIH1cblxuICB2YXIgYnVmZmVyUG9vbCA9IFtdXG5cbiAgZnVuY3Rpb24gY3JlYXRlRWxlbWVudFN0cmVhbSAoZGF0YSkge1xuICAgIHZhciByZXN1bHQgPSBidWZmZXJQb29sLnBvcCgpXG4gICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgIHJlc3VsdCA9IG5ldyBSRUdMRWxlbWVudEJ1ZmZlcihidWZmZXJTdGF0ZS5jcmVhdGUoXG4gICAgICAgIG51bGwsXG4gICAgICAgIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSLFxuICAgICAgICB0cnVlLFxuICAgICAgICBmYWxzZSkuX2J1ZmZlcilcbiAgICB9XG4gICAgaW5pdEVsZW1lbnRzKHJlc3VsdCwgZGF0YSwgR0xfU1RSRUFNX0RSQVcsIC0xLCAtMSwgMCwgMClcbiAgICByZXR1cm4gcmVzdWx0XG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95RWxlbWVudFN0cmVhbSAoZWxlbWVudHMpIHtcbiAgICBidWZmZXJQb29sLnB1c2goZWxlbWVudHMpXG4gIH1cblxuICBmdW5jdGlvbiBpbml0RWxlbWVudHMgKFxuICAgIGVsZW1lbnRzLFxuICAgIGRhdGEsXG4gICAgdXNhZ2UsXG4gICAgcHJpbSxcbiAgICBjb3VudCxcbiAgICBieXRlTGVuZ3RoLFxuICAgIHR5cGUpIHtcbiAgICBlbGVtZW50cy5idWZmZXIuYmluZCgpXG4gICAgaWYgKGRhdGEpIHtcbiAgICAgIHZhciBwcmVkaWN0ZWRUeXBlID0gdHlwZVxuICAgICAgaWYgKCF0eXBlICYmIChcbiAgICAgICAgICAhaXNUeXBlZEFycmF5KGRhdGEpIHx8XG4gICAgICAgICAoaXNOREFycmF5TGlrZShkYXRhKSAmJiAhaXNUeXBlZEFycmF5KGRhdGEuZGF0YSkpKSkge1xuICAgICAgICBwcmVkaWN0ZWRUeXBlID0gZXh0ZW5zaW9ucy5vZXNfZWxlbWVudF9pbmRleF91aW50XG4gICAgICAgICAgPyBHTF9VTlNJR05FRF9JTlRcbiAgICAgICAgICA6IEdMX1VOU0lHTkVEX1NIT1JUXG4gICAgICB9XG4gICAgICBidWZmZXJTdGF0ZS5faW5pdEJ1ZmZlcihcbiAgICAgICAgZWxlbWVudHMuYnVmZmVyLFxuICAgICAgICBkYXRhLFxuICAgICAgICB1c2FnZSxcbiAgICAgICAgcHJlZGljdGVkVHlwZSxcbiAgICAgICAgMylcbiAgICB9IGVsc2Uge1xuICAgICAgZ2wuYnVmZmVyRGF0YShHTF9FTEVNRU5UX0FSUkFZX0JVRkZFUiwgYnl0ZUxlbmd0aCwgdXNhZ2UpXG4gICAgICBlbGVtZW50cy5idWZmZXIuZHR5cGUgPSBkdHlwZSB8fCBHTF9VTlNJR05FRF9CWVRFXG4gICAgICBlbGVtZW50cy5idWZmZXIudXNhZ2UgPSB1c2FnZVxuICAgICAgZWxlbWVudHMuYnVmZmVyLmRpbWVuc2lvbiA9IDNcbiAgICAgIGVsZW1lbnRzLmJ1ZmZlci5ieXRlTGVuZ3RoID0gYnl0ZUxlbmd0aFxuICAgIH1cblxuICAgIHZhciBkdHlwZSA9IHR5cGVcbiAgICBpZiAoIXR5cGUpIHtcbiAgICAgIHN3aXRjaCAoZWxlbWVudHMuYnVmZmVyLmR0eXBlKSB7XG4gICAgICAgIGNhc2UgR0xfVU5TSUdORURfQllURTpcbiAgICAgICAgY2FzZSBHTF9CWVRFOlxuICAgICAgICAgIGR0eXBlID0gR0xfVU5TSUdORURfQllURVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9TSE9SVDpcbiAgICAgICAgY2FzZSBHTF9TSE9SVDpcbiAgICAgICAgICBkdHlwZSA9IEdMX1VOU0lHTkVEX1NIT1JUXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX0lOVDpcbiAgICAgICAgY2FzZSBHTF9JTlQ6XG4gICAgICAgICAgZHR5cGUgPSBHTF9VTlNJR05FRF9JTlRcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgXG4gICAgICB9XG4gICAgICBlbGVtZW50cy5idWZmZXIuZHR5cGUgPSBkdHlwZVxuICAgIH1cbiAgICBlbGVtZW50cy50eXBlID0gZHR5cGVcblxuICAgIC8vIENoZWNrIG9lc19lbGVtZW50X2luZGV4X3VpbnQgZXh0ZW5zaW9uXG4gICAgXG5cbiAgICAvLyB0cnkgdG8gZ3Vlc3MgZGVmYXVsdCBwcmltaXRpdmUgdHlwZSBhbmQgYXJndW1lbnRzXG4gICAgdmFyIHZlcnRDb3VudCA9IGNvdW50XG4gICAgaWYgKHZlcnRDb3VudCA8IDApIHtcbiAgICAgIHZlcnRDb3VudCA9IGVsZW1lbnRzLmJ1ZmZlci5ieXRlTGVuZ3RoXG4gICAgICBpZiAoZHR5cGUgPT09IEdMX1VOU0lHTkVEX1NIT1JUKSB7XG4gICAgICAgIHZlcnRDb3VudCA+Pj0gMVxuICAgICAgfSBlbHNlIGlmIChkdHlwZSA9PT0gR0xfVU5TSUdORURfSU5UKSB7XG4gICAgICAgIHZlcnRDb3VudCA+Pj0gMlxuICAgICAgfVxuICAgIH1cbiAgICBlbGVtZW50cy52ZXJ0Q291bnQgPSB2ZXJ0Q291bnRcblxuICAgIC8vIHRyeSB0byBndWVzcyBwcmltaXRpdmUgdHlwZSBmcm9tIGNlbGwgZGltZW5zaW9uXG4gICAgdmFyIHByaW1UeXBlID0gcHJpbVxuICAgIGlmIChwcmltIDwgMCkge1xuICAgICAgcHJpbVR5cGUgPSBHTF9UUklBTkdMRVNcbiAgICAgIHZhciBkaW1lbnNpb24gPSBlbGVtZW50cy5idWZmZXIuZGltZW5zaW9uXG4gICAgICBpZiAoZGltZW5zaW9uID09PSAxKSBwcmltVHlwZSA9IEdMX1BPSU5UU1xuICAgICAgaWYgKGRpbWVuc2lvbiA9PT0gMikgcHJpbVR5cGUgPSBHTF9MSU5FU1xuICAgICAgaWYgKGRpbWVuc2lvbiA9PT0gMykgcHJpbVR5cGUgPSBHTF9UUklBTkdMRVNcbiAgICB9XG4gICAgZWxlbWVudHMucHJpbVR5cGUgPSBwcmltVHlwZVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveUVsZW1lbnRzIChlbGVtZW50cykge1xuICAgIHN0YXRzLmVsZW1lbnRzQ291bnQtLVxuXG4gICAgXG4gICAgZGVsZXRlIGVsZW1lbnRTZXRbZWxlbWVudHMuaWRdXG4gICAgZWxlbWVudHMuYnVmZmVyLmRlc3Ryb3koKVxuICAgIGVsZW1lbnRzLmJ1ZmZlciA9IG51bGxcbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZUVsZW1lbnRzIChvcHRpb25zLCBwZXJzaXN0ZW50KSB7XG4gICAgdmFyIGJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmNyZWF0ZShudWxsLCBHTF9FTEVNRU5UX0FSUkFZX0JVRkZFUiwgdHJ1ZSlcbiAgICB2YXIgZWxlbWVudHMgPSBuZXcgUkVHTEVsZW1lbnRCdWZmZXIoYnVmZmVyLl9idWZmZXIpXG4gICAgc3RhdHMuZWxlbWVudHNDb3VudCsrXG5cbiAgICBmdW5jdGlvbiByZWdsRWxlbWVudHMgKG9wdGlvbnMpIHtcbiAgICAgIGlmICghb3B0aW9ucykge1xuICAgICAgICBidWZmZXIoKVxuICAgICAgICBlbGVtZW50cy5wcmltVHlwZSA9IEdMX1RSSUFOR0xFU1xuICAgICAgICBlbGVtZW50cy52ZXJ0Q291bnQgPSAwXG4gICAgICAgIGVsZW1lbnRzLnR5cGUgPSBHTF9VTlNJR05FRF9CWVRFXG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBvcHRpb25zID09PSAnbnVtYmVyJykge1xuICAgICAgICBidWZmZXIob3B0aW9ucylcbiAgICAgICAgZWxlbWVudHMucHJpbVR5cGUgPSBHTF9UUklBTkdMRVNcbiAgICAgICAgZWxlbWVudHMudmVydENvdW50ID0gb3B0aW9ucyB8IDBcbiAgICAgICAgZWxlbWVudHMudHlwZSA9IEdMX1VOU0lHTkVEX0JZVEVcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBkYXRhID0gbnVsbFxuICAgICAgICB2YXIgdXNhZ2UgPSBHTF9TVEFUSUNfRFJBV1xuICAgICAgICB2YXIgcHJpbVR5cGUgPSAtMVxuICAgICAgICB2YXIgdmVydENvdW50ID0gLTFcbiAgICAgICAgdmFyIGJ5dGVMZW5ndGggPSAwXG4gICAgICAgIHZhciBkdHlwZSA9IDBcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkob3B0aW9ucykgfHxcbiAgICAgICAgICAgIGlzVHlwZWRBcnJheShvcHRpb25zKSB8fFxuICAgICAgICAgICAgaXNOREFycmF5TGlrZShvcHRpb25zKSkge1xuICAgICAgICAgIGRhdGEgPSBvcHRpb25zXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKCdkYXRhJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBkYXRhID0gb3B0aW9ucy5kYXRhXG4gICAgICAgICAgICBcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCd1c2FnZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgXG4gICAgICAgICAgICB1c2FnZSA9IHVzYWdlVHlwZXNbb3B0aW9ucy51c2FnZV1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCdwcmltaXRpdmUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgcHJpbVR5cGUgPSBwcmltVHlwZXNbb3B0aW9ucy5wcmltaXRpdmVdXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgnY291bnQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdmVydENvdW50ID0gb3B0aW9ucy5jb3VudCB8IDBcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCd0eXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGR0eXBlID0gZWxlbWVudFR5cGVzW29wdGlvbnMudHlwZV1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCdsZW5ndGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGJ5dGVMZW5ndGggPSBvcHRpb25zLmxlbmd0aCB8IDBcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYnl0ZUxlbmd0aCA9IHZlcnRDb3VudFxuICAgICAgICAgICAgaWYgKGR0eXBlID09PSBHTF9VTlNJR05FRF9TSE9SVCB8fCBkdHlwZSA9PT0gR0xfU0hPUlQpIHtcbiAgICAgICAgICAgICAgYnl0ZUxlbmd0aCAqPSAyXG4gICAgICAgICAgICB9IGVsc2UgaWYgKGR0eXBlID09PSBHTF9VTlNJR05FRF9JTlQgfHwgZHR5cGUgPT09IEdMX0lOVCkge1xuICAgICAgICAgICAgICBieXRlTGVuZ3RoICo9IDRcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaW5pdEVsZW1lbnRzKFxuICAgICAgICAgIGVsZW1lbnRzLFxuICAgICAgICAgIGRhdGEsXG4gICAgICAgICAgdXNhZ2UsXG4gICAgICAgICAgcHJpbVR5cGUsXG4gICAgICAgICAgdmVydENvdW50LFxuICAgICAgICAgIGJ5dGVMZW5ndGgsXG4gICAgICAgICAgZHR5cGUpXG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZWdsRWxlbWVudHNcbiAgICB9XG5cbiAgICByZWdsRWxlbWVudHMob3B0aW9ucylcblxuICAgIHJlZ2xFbGVtZW50cy5fcmVnbFR5cGUgPSAnZWxlbWVudHMnXG4gICAgcmVnbEVsZW1lbnRzLl9lbGVtZW50cyA9IGVsZW1lbnRzXG4gICAgcmVnbEVsZW1lbnRzLnN1YmRhdGEgPSBmdW5jdGlvbiAoZGF0YSwgb2Zmc2V0KSB7XG4gICAgICBidWZmZXIuc3ViZGF0YShkYXRhLCBvZmZzZXQpXG4gICAgICByZXR1cm4gcmVnbEVsZW1lbnRzXG4gICAgfVxuICAgIHJlZ2xFbGVtZW50cy5kZXN0cm95ID0gZnVuY3Rpb24gKCkge1xuICAgICAgZGVzdHJveUVsZW1lbnRzKGVsZW1lbnRzKVxuICAgIH1cblxuICAgIHJldHVybiByZWdsRWxlbWVudHNcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY3JlYXRlOiBjcmVhdGVFbGVtZW50cyxcbiAgICBjcmVhdGVTdHJlYW06IGNyZWF0ZUVsZW1lbnRTdHJlYW0sXG4gICAgZGVzdHJveVN0cmVhbTogZGVzdHJveUVsZW1lbnRTdHJlYW0sXG4gICAgZ2V0RWxlbWVudHM6IGZ1bmN0aW9uIChlbGVtZW50cykge1xuICAgICAgaWYgKHR5cGVvZiBlbGVtZW50cyA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgICAgIGVsZW1lbnRzLl9lbGVtZW50cyBpbnN0YW5jZW9mIFJFR0xFbGVtZW50QnVmZmVyKSB7XG4gICAgICAgIHJldHVybiBlbGVtZW50cy5fZWxlbWVudHNcbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsXG4gICAgfSxcbiAgICBjbGVhcjogZnVuY3Rpb24gKCkge1xuICAgICAgdmFsdWVzKGVsZW1lbnRTZXQpLmZvckVhY2goZGVzdHJveUVsZW1lbnRzKVxuICAgIH1cbiAgfVxufVxuIiwiXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY3JlYXRlRXh0ZW5zaW9uQ2FjaGUgKGdsLCBjb25maWcpIHtcbiAgdmFyIGV4dGVuc2lvbnMgPSB7fVxuXG4gIGZ1bmN0aW9uIHRyeUxvYWRFeHRlbnNpb24gKG5hbWVfKSB7XG4gICAgXG4gICAgdmFyIG5hbWUgPSBuYW1lXy50b0xvd2VyQ2FzZSgpXG4gICAgdmFyIGV4dFxuICAgIHRyeSB7XG4gICAgICBleHQgPSBleHRlbnNpb25zW25hbWVdID0gZ2wuZ2V0RXh0ZW5zaW9uKG5hbWUpXG4gICAgfSBjYXRjaCAoZSkge31cbiAgICByZXR1cm4gISFleHRcbiAgfVxuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgY29uZmlnLmV4dGVuc2lvbnMubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgbmFtZSA9IGNvbmZpZy5leHRlbnNpb25zW2ldXG4gICAgaWYgKCF0cnlMb2FkRXh0ZW5zaW9uKG5hbWUpKSB7XG4gICAgICBjb25maWcub25EZXN0cm95KClcbiAgICAgIGNvbmZpZy5vbkRvbmUoJ1wiJyArIG5hbWUgKyAnXCIgZXh0ZW5zaW9uIGlzIG5vdCBzdXBwb3J0ZWQgYnkgdGhlIGN1cnJlbnQgV2ViR0wgY29udGV4dCwgdHJ5IHVwZ3JhZGluZyB5b3VyIHN5c3RlbSBvciBhIGRpZmZlcmVudCBicm93c2VyJylcbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuICB9XG5cbiAgY29uZmlnLm9wdGlvbmFsRXh0ZW5zaW9ucy5mb3JFYWNoKHRyeUxvYWRFeHRlbnNpb24pXG5cbiAgcmV0dXJuIHtcbiAgICBleHRlbnNpb25zOiBleHRlbnNpb25zLFxuICAgIHJlc3RvcmU6IGZ1bmN0aW9uICgpIHtcbiAgICAgIE9iamVjdC5rZXlzKGV4dGVuc2lvbnMpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgaWYgKCF0cnlMb2FkRXh0ZW5zaW9uKG5hbWUpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCcocmVnbCk6IGVycm9yIHJlc3RvcmluZyBleHRlbnNpb24gJyArIG5hbWUpXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgfVxuICB9XG59XG4iLCJcbnZhciB2YWx1ZXMgPSByZXF1aXJlKCcuL3V0aWwvdmFsdWVzJylcbnZhciBleHRlbmQgPSByZXF1aXJlKCcuL3V0aWwvZXh0ZW5kJylcblxuLy8gV2Ugc3RvcmUgdGhlc2UgY29uc3RhbnRzIHNvIHRoYXQgdGhlIG1pbmlmaWVyIGNhbiBpbmxpbmUgdGhlbVxudmFyIEdMX0ZSQU1FQlVGRkVSID0gMHg4RDQwXG52YXIgR0xfUkVOREVSQlVGRkVSID0gMHg4RDQxXG5cbnZhciBHTF9URVhUVVJFXzJEID0gMHgwREUxXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YID0gMHg4NTE1XG5cbnZhciBHTF9DT0xPUl9BVFRBQ0hNRU5UMCA9IDB4OENFMFxudmFyIEdMX0RFUFRIX0FUVEFDSE1FTlQgPSAweDhEMDBcbnZhciBHTF9TVEVOQ0lMX0FUVEFDSE1FTlQgPSAweDhEMjBcbnZhciBHTF9ERVBUSF9TVEVOQ0lMX0FUVEFDSE1FTlQgPSAweDgyMUFcblxudmFyIEdMX0ZSQU1FQlVGRkVSX0NPTVBMRVRFID0gMHg4Q0Q1XG52YXIgR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9BVFRBQ0hNRU5UID0gMHg4Q0Q2XG52YXIgR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9NSVNTSU5HX0FUVEFDSE1FTlQgPSAweDhDRDdcbnZhciBHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX0RJTUVOU0lPTlMgPSAweDhDRDlcbnZhciBHTF9GUkFNRUJVRkZFUl9VTlNVUFBPUlRFRCA9IDB4OENERFxuXG52YXIgR0xfSEFMRl9GTE9BVF9PRVMgPSAweDhENjFcbnZhciBHTF9VTlNJR05FRF9CWVRFID0gMHgxNDAxXG52YXIgR0xfRkxPQVQgPSAweDE0MDZcblxudmFyIEdMX1JHQkEgPSAweDE5MDhcblxudmFyIEdMX0RFUFRIX0NPTVBPTkVOVCA9IDB4MTkwMlxuXG52YXIgY29sb3JUZXh0dXJlRm9ybWF0RW51bXMgPSBbXG4gIEdMX1JHQkFcbl1cblxuLy8gZm9yIGV2ZXJ5IHRleHR1cmUgZm9ybWF0LCBzdG9yZVxuLy8gdGhlIG51bWJlciBvZiBjaGFubmVsc1xudmFyIHRleHR1cmVGb3JtYXRDaGFubmVscyA9IFtdXG50ZXh0dXJlRm9ybWF0Q2hhbm5lbHNbR0xfUkdCQV0gPSA0XG5cbi8vIGZvciBldmVyeSB0ZXh0dXJlIHR5cGUsIHN0b3JlXG4vLyB0aGUgc2l6ZSBpbiBieXRlcy5cbnZhciB0ZXh0dXJlVHlwZVNpemVzID0gW11cbnRleHR1cmVUeXBlU2l6ZXNbR0xfVU5TSUdORURfQllURV0gPSAxXG50ZXh0dXJlVHlwZVNpemVzW0dMX0ZMT0FUXSA9IDRcbnRleHR1cmVUeXBlU2l6ZXNbR0xfSEFMRl9GTE9BVF9PRVNdID0gMlxuXG52YXIgR0xfUkdCQTQgPSAweDgwNTZcbnZhciBHTF9SR0I1X0ExID0gMHg4MDU3XG52YXIgR0xfUkdCNTY1ID0gMHg4RDYyXG52YXIgR0xfREVQVEhfQ09NUE9ORU5UMTYgPSAweDgxQTVcbnZhciBHTF9TVEVOQ0lMX0lOREVYOCA9IDB4OEQ0OFxudmFyIEdMX0RFUFRIX1NURU5DSUwgPSAweDg0RjlcblxudmFyIEdMX1NSR0I4X0FMUEhBOF9FWFQgPSAweDhDNDNcblxudmFyIEdMX1JHQkEzMkZfRVhUID0gMHg4ODE0XG5cbnZhciBHTF9SR0JBMTZGX0VYVCA9IDB4ODgxQVxudmFyIEdMX1JHQjE2Rl9FWFQgPSAweDg4MUJcblxudmFyIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0RW51bXMgPSBbXG4gIEdMX1JHQkE0LFxuICBHTF9SR0I1X0ExLFxuICBHTF9SR0I1NjUsXG4gIEdMX1NSR0I4X0FMUEhBOF9FWFQsXG4gIEdMX1JHQkExNkZfRVhULFxuICBHTF9SR0IxNkZfRVhULFxuICBHTF9SR0JBMzJGX0VYVFxuXVxuXG52YXIgc3RhdHVzQ29kZSA9IHt9XG5zdGF0dXNDb2RlW0dMX0ZSQU1FQlVGRkVSX0NPTVBMRVRFXSA9ICdjb21wbGV0ZSdcbnN0YXR1c0NvZGVbR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9BVFRBQ0hNRU5UXSA9ICdpbmNvbXBsZXRlIGF0dGFjaG1lbnQnXG5zdGF0dXNDb2RlW0dMX0ZSQU1FQlVGRkVSX0lOQ09NUExFVEVfRElNRU5TSU9OU10gPSAnaW5jb21wbGV0ZSBkaW1lbnNpb25zJ1xuc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX01JU1NJTkdfQVRUQUNITUVOVF0gPSAnaW5jb21wbGV0ZSwgbWlzc2luZyBhdHRhY2htZW50J1xuc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9VTlNVUFBPUlRFRF0gPSAndW5zdXBwb3J0ZWQnXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcEZCT1N0YXRlIChcbiAgZ2wsXG4gIGV4dGVuc2lvbnMsXG4gIGxpbWl0cyxcbiAgdGV4dHVyZVN0YXRlLFxuICByZW5kZXJidWZmZXJTdGF0ZSxcbiAgc3RhdHMpIHtcbiAgdmFyIGZyYW1lYnVmZmVyU3RhdGUgPSB7XG4gICAgY3VyOiBudWxsLFxuICAgIG5leHQ6IG51bGwsXG4gICAgZGlydHk6IGZhbHNlXG4gIH1cblxuICB2YXIgY29sb3JUZXh0dXJlRm9ybWF0cyA9IFsncmdiYSddXG4gIHZhciBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHMgPSBbJ3JnYmE0JywgJ3JnYjU2NScsICdyZ2I1IGExJ11cblxuICBpZiAoZXh0ZW5zaW9ucy5leHRfc3JnYikge1xuICAgIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0cy5wdXNoKCdzcmdiYScpXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5leHRfY29sb3JfYnVmZmVyX2hhbGZfZmxvYXQpIHtcbiAgICBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHMucHVzaCgncmdiYTE2ZicsICdyZ2IxNmYnKVxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29sb3JfYnVmZmVyX2Zsb2F0KSB7XG4gICAgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzLnB1c2goJ3JnYmEzMmYnKVxuICB9XG5cbiAgdmFyIGNvbG9yVHlwZXMgPSBbJ3VpbnQ4J11cbiAgaWYgKGV4dGVuc2lvbnMub2VzX3RleHR1cmVfaGFsZl9mbG9hdCkge1xuICAgIGNvbG9yVHlwZXMucHVzaCgnaGFsZiBmbG9hdCcsICdmbG9hdDE2JylcbiAgfVxuICBpZiAoZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9mbG9hdCkge1xuICAgIGNvbG9yVHlwZXMucHVzaCgnZmxvYXQnLCAnZmxvYXQzMicpXG4gIH1cblxuICBmdW5jdGlvbiBGcmFtZWJ1ZmZlckF0dGFjaG1lbnQgKHRhcmdldCwgdGV4dHVyZSwgcmVuZGVyYnVmZmVyKSB7XG4gICAgdGhpcy50YXJnZXQgPSB0YXJnZXRcbiAgICB0aGlzLnRleHR1cmUgPSB0ZXh0dXJlXG4gICAgdGhpcy5yZW5kZXJidWZmZXIgPSByZW5kZXJidWZmZXJcblxuICAgIHZhciB3ID0gMFxuICAgIHZhciBoID0gMFxuICAgIGlmICh0ZXh0dXJlKSB7XG4gICAgICB3ID0gdGV4dHVyZS53aWR0aFxuICAgICAgaCA9IHRleHR1cmUuaGVpZ2h0XG4gICAgfSBlbHNlIGlmIChyZW5kZXJidWZmZXIpIHtcbiAgICAgIHcgPSByZW5kZXJidWZmZXIud2lkdGhcbiAgICAgIGggPSByZW5kZXJidWZmZXIuaGVpZ2h0XG4gICAgfVxuICAgIHRoaXMud2lkdGggPSB3XG4gICAgdGhpcy5oZWlnaHQgPSBoXG4gIH1cblxuICBmdW5jdGlvbiBkZWNSZWYgKGF0dGFjaG1lbnQpIHtcbiAgICBpZiAoYXR0YWNobWVudCkge1xuICAgICAgaWYgKGF0dGFjaG1lbnQudGV4dHVyZSkge1xuICAgICAgICBhdHRhY2htZW50LnRleHR1cmUuX3RleHR1cmUuZGVjUmVmKClcbiAgICAgIH1cbiAgICAgIGlmIChhdHRhY2htZW50LnJlbmRlcmJ1ZmZlcikge1xuICAgICAgICBhdHRhY2htZW50LnJlbmRlcmJ1ZmZlci5fcmVuZGVyYnVmZmVyLmRlY1JlZigpXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaW5jUmVmQW5kQ2hlY2tTaGFwZSAoYXR0YWNobWVudCwgd2lkdGgsIGhlaWdodCkge1xuICAgIGlmICghYXR0YWNobWVudCkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIGlmIChhdHRhY2htZW50LnRleHR1cmUpIHtcbiAgICAgIHZhciB0ZXh0dXJlID0gYXR0YWNobWVudC50ZXh0dXJlLl90ZXh0dXJlXG4gICAgICB2YXIgdHcgPSBNYXRoLm1heCgxLCB0ZXh0dXJlLndpZHRoKVxuICAgICAgdmFyIHRoID0gTWF0aC5tYXgoMSwgdGV4dHVyZS5oZWlnaHQpXG4gICAgICBcbiAgICAgIHRleHR1cmUucmVmQ291bnQgKz0gMVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgcmVuZGVyYnVmZmVyID0gYXR0YWNobWVudC5yZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlclxuICAgICAgXG4gICAgICByZW5kZXJidWZmZXIucmVmQ291bnQgKz0gMVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGF0dGFjaCAobG9jYXRpb24sIGF0dGFjaG1lbnQpIHtcbiAgICBpZiAoYXR0YWNobWVudCkge1xuICAgICAgaWYgKGF0dGFjaG1lbnQudGV4dHVyZSkge1xuICAgICAgICBnbC5mcmFtZWJ1ZmZlclRleHR1cmUyRChcbiAgICAgICAgICBHTF9GUkFNRUJVRkZFUixcbiAgICAgICAgICBsb2NhdGlvbixcbiAgICAgICAgICBhdHRhY2htZW50LnRhcmdldCxcbiAgICAgICAgICBhdHRhY2htZW50LnRleHR1cmUuX3RleHR1cmUudGV4dHVyZSxcbiAgICAgICAgICAwKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZ2wuZnJhbWVidWZmZXJSZW5kZXJidWZmZXIoXG4gICAgICAgICAgR0xfRlJBTUVCVUZGRVIsXG4gICAgICAgICAgbG9jYXRpb24sXG4gICAgICAgICAgR0xfUkVOREVSQlVGRkVSLFxuICAgICAgICAgIGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXIucmVuZGVyYnVmZmVyKVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlQXR0YWNobWVudCAoYXR0YWNobWVudCkge1xuICAgIHZhciB0YXJnZXQgPSBHTF9URVhUVVJFXzJEXG4gICAgdmFyIHRleHR1cmUgPSBudWxsXG4gICAgdmFyIHJlbmRlcmJ1ZmZlciA9IG51bGxcblxuICAgIHZhciBkYXRhID0gYXR0YWNobWVudFxuICAgIGlmICh0eXBlb2YgYXR0YWNobWVudCA9PT0gJ29iamVjdCcpIHtcbiAgICAgIGRhdGEgPSBhdHRhY2htZW50LmRhdGFcbiAgICAgIGlmICgndGFyZ2V0JyBpbiBhdHRhY2htZW50KSB7XG4gICAgICAgIHRhcmdldCA9IGF0dGFjaG1lbnQudGFyZ2V0IHwgMFxuICAgICAgfVxuICAgIH1cblxuICAgIFxuXG4gICAgdmFyIHR5cGUgPSBkYXRhLl9yZWdsVHlwZVxuICAgIGlmICh0eXBlID09PSAndGV4dHVyZTJkJykge1xuICAgICAgdGV4dHVyZSA9IGRhdGFcbiAgICAgIFxuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3RleHR1cmVDdWJlJykge1xuICAgICAgdGV4dHVyZSA9IGRhdGFcbiAgICAgIFxuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3JlbmRlcmJ1ZmZlcicpIHtcbiAgICAgIHJlbmRlcmJ1ZmZlciA9IGRhdGFcbiAgICAgIHRhcmdldCA9IEdMX1JFTkRFUkJVRkZFUlxuICAgIH0gZWxzZSB7XG4gICAgICBcbiAgICB9XG5cbiAgICByZXR1cm4gbmV3IEZyYW1lYnVmZmVyQXR0YWNobWVudCh0YXJnZXQsIHRleHR1cmUsIHJlbmRlcmJ1ZmZlcilcbiAgfVxuXG4gIGZ1bmN0aW9uIGFsbG9jQXR0YWNobWVudCAoXG4gICAgd2lkdGgsXG4gICAgaGVpZ2h0LFxuICAgIGlzVGV4dHVyZSxcbiAgICBmb3JtYXQsXG4gICAgdHlwZSkge1xuICAgIGlmIChpc1RleHR1cmUpIHtcbiAgICAgIHZhciB0ZXh0dXJlID0gdGV4dHVyZVN0YXRlLmNyZWF0ZTJEKHtcbiAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICBoZWlnaHQ6IGhlaWdodCxcbiAgICAgICAgZm9ybWF0OiBmb3JtYXQsXG4gICAgICAgIHR5cGU6IHR5cGVcbiAgICAgIH0pXG4gICAgICB0ZXh0dXJlLl90ZXh0dXJlLnJlZkNvdW50ID0gMFxuICAgICAgcmV0dXJuIG5ldyBGcmFtZWJ1ZmZlckF0dGFjaG1lbnQoR0xfVEVYVFVSRV8yRCwgdGV4dHVyZSwgbnVsbClcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIHJiID0gcmVuZGVyYnVmZmVyU3RhdGUuY3JlYXRlKHtcbiAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICBoZWlnaHQ6IGhlaWdodCxcbiAgICAgICAgZm9ybWF0OiBmb3JtYXRcbiAgICAgIH0pXG4gICAgICByYi5fcmVuZGVyYnVmZmVyLnJlZkNvdW50ID0gMFxuICAgICAgcmV0dXJuIG5ldyBGcmFtZWJ1ZmZlckF0dGFjaG1lbnQoR0xfUkVOREVSQlVGRkVSLCBudWxsLCByYilcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiB1bndyYXBBdHRhY2htZW50IChhdHRhY2htZW50KSB7XG4gICAgcmV0dXJuIGF0dGFjaG1lbnQgJiYgKGF0dGFjaG1lbnQudGV4dHVyZSB8fCBhdHRhY2htZW50LnJlbmRlcmJ1ZmZlcilcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlc2l6ZUF0dGFjaG1lbnQgKGF0dGFjaG1lbnQsIHcsIGgpIHtcbiAgICBpZiAoYXR0YWNobWVudCkge1xuICAgICAgaWYgKGF0dGFjaG1lbnQudGV4dHVyZSkge1xuICAgICAgICBhdHRhY2htZW50LnRleHR1cmUucmVzaXplKHcsIGgpXG4gICAgICB9IGVsc2UgaWYgKGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyKSB7XG4gICAgICAgIGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyLnJlc2l6ZSh3LCBoKVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHZhciBmcmFtZWJ1ZmZlckNvdW50ID0gMFxuICB2YXIgZnJhbWVidWZmZXJTZXQgPSB7fVxuXG4gIGZ1bmN0aW9uIFJFR0xGcmFtZWJ1ZmZlciAoKSB7XG4gICAgdGhpcy5pZCA9IGZyYW1lYnVmZmVyQ291bnQrK1xuICAgIGZyYW1lYnVmZmVyU2V0W3RoaXMuaWRdID0gdGhpc1xuXG4gICAgdGhpcy5mcmFtZWJ1ZmZlciA9IGdsLmNyZWF0ZUZyYW1lYnVmZmVyKClcbiAgICB0aGlzLndpZHRoID0gMFxuICAgIHRoaXMuaGVpZ2h0ID0gMFxuXG4gICAgdGhpcy5jb2xvckF0dGFjaG1lbnRzID0gW11cbiAgICB0aGlzLmRlcHRoQXR0YWNobWVudCA9IG51bGxcbiAgICB0aGlzLnN0ZW5jaWxBdHRhY2htZW50ID0gbnVsbFxuICAgIHRoaXMuZGVwdGhTdGVuY2lsQXR0YWNobWVudCA9IG51bGxcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlY0ZCT1JlZnMgKGZyYW1lYnVmZmVyKSB7XG4gICAgZnJhbWVidWZmZXIuY29sb3JBdHRhY2htZW50cy5mb3JFYWNoKGRlY1JlZilcbiAgICBkZWNSZWYoZnJhbWVidWZmZXIuZGVwdGhBdHRhY2htZW50KVxuICAgIGRlY1JlZihmcmFtZWJ1ZmZlci5zdGVuY2lsQXR0YWNobWVudClcbiAgICBkZWNSZWYoZnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsQXR0YWNobWVudClcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3kgKGZyYW1lYnVmZmVyKSB7XG4gICAgdmFyIGhhbmRsZSA9IGZyYW1lYnVmZmVyLmZyYW1lYnVmZmVyXG4gICAgXG4gICAgZ2wuZGVsZXRlRnJhbWVidWZmZXIoaGFuZGxlKVxuICAgIGZyYW1lYnVmZmVyLmZyYW1lYnVmZmVyID0gbnVsbFxuICAgIHN0YXRzLmZyYW1lYnVmZmVyQ291bnQtLVxuICAgIGRlbGV0ZSBmcmFtZWJ1ZmZlclNldFtmcmFtZWJ1ZmZlci5pZF1cbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZUZyYW1lYnVmZmVyIChmcmFtZWJ1ZmZlcikge1xuICAgIHZhciBpXG5cbiAgICBnbC5iaW5kRnJhbWVidWZmZXIoR0xfRlJBTUVCVUZGRVIsIGZyYW1lYnVmZmVyLmZyYW1lYnVmZmVyKVxuICAgIHZhciBjb2xvckF0dGFjaG1lbnRzID0gZnJhbWVidWZmZXIuY29sb3JBdHRhY2htZW50c1xuICAgIGZvciAoaSA9IDA7IGkgPCBjb2xvckF0dGFjaG1lbnRzLmxlbmd0aDsgKytpKSB7XG4gICAgICBhdHRhY2goR0xfQ09MT1JfQVRUQUNITUVOVDAgKyBpLCBjb2xvckF0dGFjaG1lbnRzW2ldKVxuICAgIH1cbiAgICBmb3IgKGkgPSBjb2xvckF0dGFjaG1lbnRzLmxlbmd0aDsgaSA8IGxpbWl0cy5tYXhDb2xvckF0dGFjaG1lbnRzOyArK2kpIHtcbiAgICAgIGdsLmZyYW1lYnVmZmVyVGV4dHVyZTJEKFxuICAgICAgICBHTF9GUkFNRUJVRkZFUixcbiAgICAgICAgR0xfQ09MT1JfQVRUQUNITUVOVDAgKyBpLFxuICAgICAgICBHTF9URVhUVVJFXzJELFxuICAgICAgICBudWxsLFxuICAgICAgICAwKVxuICAgIH1cblxuICAgIGdsLmZyYW1lYnVmZmVyVGV4dHVyZTJEKFxuICAgICAgR0xfRlJBTUVCVUZGRVIsXG4gICAgICBHTF9ERVBUSF9TVEVOQ0lMX0FUVEFDSE1FTlQsXG4gICAgICBHTF9URVhUVVJFXzJELFxuICAgICAgbnVsbCxcbiAgICAgIDApXG4gICAgZ2wuZnJhbWVidWZmZXJUZXh0dXJlMkQoXG4gICAgICBHTF9GUkFNRUJVRkZFUixcbiAgICAgIEdMX0RFUFRIX0FUVEFDSE1FTlQsXG4gICAgICBHTF9URVhUVVJFXzJELFxuICAgICAgbnVsbCxcbiAgICAgIDApXG4gICAgZ2wuZnJhbWVidWZmZXJUZXh0dXJlMkQoXG4gICAgICBHTF9GUkFNRUJVRkZFUixcbiAgICAgIEdMX1NURU5DSUxfQVRUQUNITUVOVCxcbiAgICAgIEdMX1RFWFRVUkVfMkQsXG4gICAgICBudWxsLFxuICAgICAgMClcblxuICAgIGF0dGFjaChHTF9ERVBUSF9BVFRBQ0hNRU5ULCBmcmFtZWJ1ZmZlci5kZXB0aEF0dGFjaG1lbnQpXG4gICAgYXR0YWNoKEdMX1NURU5DSUxfQVRUQUNITUVOVCwgZnJhbWVidWZmZXIuc3RlbmNpbEF0dGFjaG1lbnQpXG4gICAgYXR0YWNoKEdMX0RFUFRIX1NURU5DSUxfQVRUQUNITUVOVCwgZnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsQXR0YWNobWVudClcblxuICAgIC8vIENoZWNrIHN0YXR1cyBjb2RlXG4gICAgdmFyIHN0YXR1cyA9IGdsLmNoZWNrRnJhbWVidWZmZXJTdGF0dXMoR0xfRlJBTUVCVUZGRVIpXG4gICAgaWYgKHN0YXR1cyAhPT0gR0xfRlJBTUVCVUZGRVJfQ09NUExFVEUpIHtcbiAgICAgIFxuICAgIH1cblxuICAgIGdsLmJpbmRGcmFtZWJ1ZmZlcihHTF9GUkFNRUJVRkZFUiwgZnJhbWVidWZmZXJTdGF0ZS5uZXh0KVxuICAgIGZyYW1lYnVmZmVyU3RhdGUuY3VyID0gZnJhbWVidWZmZXJTdGF0ZS5uZXh0XG5cbiAgICAvLyBGSVhNRTogQ2xlYXIgZXJyb3IgY29kZSBoZXJlLiAgVGhpcyBpcyBhIHdvcmsgYXJvdW5kIGZvciBhIGJ1ZyBpblxuICAgIC8vIGhlYWRsZXNzLWdsXG4gICAgZ2wuZ2V0RXJyb3IoKVxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlRkJPIChhMCwgYTEpIHtcbiAgICB2YXIgZnJhbWVidWZmZXIgPSBuZXcgUkVHTEZyYW1lYnVmZmVyKClcbiAgICBzdGF0cy5mcmFtZWJ1ZmZlckNvdW50KytcblxuICAgIGZ1bmN0aW9uIHJlZ2xGcmFtZWJ1ZmZlciAoYSwgYikge1xuICAgICAgdmFyIGlcblxuICAgICAgXG5cbiAgICAgIHZhciBleHREcmF3QnVmZmVycyA9IGV4dGVuc2lvbnMud2ViZ2xfZHJhd19idWZmZXJzXG5cbiAgICAgIHZhciB3aWR0aCA9IDBcbiAgICAgIHZhciBoZWlnaHQgPSAwXG5cbiAgICAgIHZhciBuZWVkc0RlcHRoID0gdHJ1ZVxuICAgICAgdmFyIG5lZWRzU3RlbmNpbCA9IHRydWVcblxuICAgICAgdmFyIGNvbG9yQnVmZmVyID0gbnVsbFxuICAgICAgdmFyIGNvbG9yVGV4dHVyZSA9IHRydWVcbiAgICAgIHZhciBjb2xvckZvcm1hdCA9ICdyZ2JhJ1xuICAgICAgdmFyIGNvbG9yVHlwZSA9ICd1aW50OCdcbiAgICAgIHZhciBjb2xvckNvdW50ID0gMVxuXG4gICAgICB2YXIgZGVwdGhCdWZmZXIgPSBudWxsXG4gICAgICB2YXIgc3RlbmNpbEJ1ZmZlciA9IG51bGxcbiAgICAgIHZhciBkZXB0aFN0ZW5jaWxCdWZmZXIgPSBudWxsXG4gICAgICB2YXIgZGVwdGhTdGVuY2lsVGV4dHVyZSA9IGZhbHNlXG5cbiAgICAgIGlmICh0eXBlb2YgYSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgd2lkdGggPSBhIHwgMFxuICAgICAgICBoZWlnaHQgPSAoYiB8IDApIHx8IHdpZHRoXG4gICAgICB9IGVsc2UgaWYgKCFhKSB7XG4gICAgICAgIHdpZHRoID0gaGVpZ2h0ID0gMVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgXG4gICAgICAgIHZhciBvcHRpb25zID0gYVxuXG4gICAgICAgIGlmICgnc2hhcGUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB2YXIgc2hhcGUgPSBvcHRpb25zLnNoYXBlXG4gICAgICAgICAgXG4gICAgICAgICAgd2lkdGggPSBzaGFwZVswXVxuICAgICAgICAgIGhlaWdodCA9IHNoYXBlWzFdXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWYgKCdyYWRpdXMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIHdpZHRoID0gaGVpZ2h0ID0gb3B0aW9ucy5yYWRpdXNcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCd3aWR0aCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgd2lkdGggPSBvcHRpb25zLndpZHRoXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgnaGVpZ2h0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBoZWlnaHQgPSBvcHRpb25zLmhlaWdodFxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnY29sb3InIGluIG9wdGlvbnMgfHxcbiAgICAgICAgICAgICdjb2xvcnMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBjb2xvckJ1ZmZlciA9XG4gICAgICAgICAgICBvcHRpb25zLmNvbG9yIHx8XG4gICAgICAgICAgICBvcHRpb25zLmNvbG9yc1xuICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KGNvbG9yQnVmZmVyKSkge1xuICAgICAgICAgICAgXG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFjb2xvckJ1ZmZlcikge1xuICAgICAgICAgIGlmICgnY29sb3JDb3VudCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgY29sb3JDb3VudCA9IG9wdGlvbnMuY29sb3JDb3VudCB8IDBcbiAgICAgICAgICAgIFxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmICgnY29sb3JUZXh0dXJlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBjb2xvclRleHR1cmUgPSAhIW9wdGlvbnMuY29sb3JUZXh0dXJlXG4gICAgICAgICAgICBjb2xvckZvcm1hdCA9ICdyZ2JhNCdcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoJ2NvbG9yVHlwZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgY29sb3JUeXBlID0gb3B0aW9ucy5jb2xvclR5cGVcbiAgICAgICAgICAgIGlmICghY29sb3JUZXh0dXJlKSB7XG4gICAgICAgICAgICAgIGlmIChjb2xvclR5cGUgPT09ICdoYWxmIGZsb2F0JyB8fCBjb2xvclR5cGUgPT09ICdmbG9hdDE2Jykge1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGNvbG9yRm9ybWF0ID0gJ3JnYmExNmYnXG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAoY29sb3JUeXBlID09PSAnZmxvYXQnIHx8IGNvbG9yVHlwZSA9PT0gJ2Zsb2F0MzInKSB7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgY29sb3JGb3JtYXQgPSAncmdiYTMyZidcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKCdjb2xvckZvcm1hdCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgY29sb3JGb3JtYXQgPSBvcHRpb25zLmNvbG9yRm9ybWF0XG4gICAgICAgICAgICBpZiAoY29sb3JUZXh0dXJlRm9ybWF0cy5pbmRleE9mKGNvbG9yRm9ybWF0KSA+PSAwKSB7XG4gICAgICAgICAgICAgIGNvbG9yVGV4dHVyZSA9IHRydWVcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzLmluZGV4T2YoY29sb3JGb3JtYXQpID49IDApIHtcbiAgICAgICAgICAgICAgY29sb3JUZXh0dXJlID0gZmFsc2VcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGlmIChjb2xvclRleHR1cmUpIHtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnZGVwdGhUZXh0dXJlJyBpbiBvcHRpb25zIHx8ICdkZXB0aFN0ZW5jaWxUZXh0dXJlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgZGVwdGhTdGVuY2lsVGV4dHVyZSA9ICEhKG9wdGlvbnMuZGVwdGhUZXh0dXJlIHx8XG4gICAgICAgICAgICBvcHRpb25zLmRlcHRoU3RlbmNpbFRleHR1cmUpXG4gICAgICAgICAgXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ2RlcHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiBvcHRpb25zLmRlcHRoID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgIG5lZWRzRGVwdGggPSBvcHRpb25zLmRlcHRoXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGRlcHRoQnVmZmVyID0gb3B0aW9ucy5kZXB0aFxuICAgICAgICAgICAgbmVlZHNTdGVuY2lsID0gZmFsc2VcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ3N0ZW5jaWwnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBpZiAodHlwZW9mIG9wdGlvbnMuc3RlbmNpbCA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgICBuZWVkc1N0ZW5jaWwgPSBvcHRpb25zLnN0ZW5jaWxcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc3RlbmNpbEJ1ZmZlciA9IG9wdGlvbnMuc3RlbmNpbFxuICAgICAgICAgICAgbmVlZHNEZXB0aCA9IGZhbHNlXG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdkZXB0aFN0ZW5jaWwnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBpZiAodHlwZW9mIG9wdGlvbnMuZGVwdGhTdGVuY2lsID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgIG5lZWRzRGVwdGggPSBuZWVkc1N0ZW5jaWwgPSBvcHRpb25zLmRlcHRoU3RlbmNpbFxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBkZXB0aFN0ZW5jaWxCdWZmZXIgPSBvcHRpb25zLmRlcHRoU3RlbmNpbFxuICAgICAgICAgICAgbmVlZHNEZXB0aCA9IGZhbHNlXG4gICAgICAgICAgICBuZWVkc1N0ZW5jaWwgPSBmYWxzZVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBwYXJzZSBhdHRhY2htZW50c1xuICAgICAgdmFyIGNvbG9yQXR0YWNobWVudHMgPSBudWxsXG4gICAgICB2YXIgZGVwdGhBdHRhY2htZW50ID0gbnVsbFxuICAgICAgdmFyIHN0ZW5jaWxBdHRhY2htZW50ID0gbnVsbFxuICAgICAgdmFyIGRlcHRoU3RlbmNpbEF0dGFjaG1lbnQgPSBudWxsXG5cbiAgICAgIC8vIFNldCB1cCBjb2xvciBhdHRhY2htZW50c1xuICAgICAgaWYgKEFycmF5LmlzQXJyYXkoY29sb3JCdWZmZXIpKSB7XG4gICAgICAgIGNvbG9yQXR0YWNobWVudHMgPSBjb2xvckJ1ZmZlci5tYXAocGFyc2VBdHRhY2htZW50KVxuICAgICAgfSBlbHNlIGlmIChjb2xvckJ1ZmZlcikge1xuICAgICAgICBjb2xvckF0dGFjaG1lbnRzID0gW3BhcnNlQXR0YWNobWVudChjb2xvckJ1ZmZlcildXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb2xvckF0dGFjaG1lbnRzID0gbmV3IEFycmF5KGNvbG9yQ291bnQpXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xvckNvdW50OyArK2kpIHtcbiAgICAgICAgICBjb2xvckF0dGFjaG1lbnRzW2ldID0gYWxsb2NBdHRhY2htZW50KFxuICAgICAgICAgICAgd2lkdGgsXG4gICAgICAgICAgICBoZWlnaHQsXG4gICAgICAgICAgICBjb2xvclRleHR1cmUsXG4gICAgICAgICAgICBjb2xvckZvcm1hdCxcbiAgICAgICAgICAgIGNvbG9yVHlwZSlcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBcbiAgICAgIFxuXG4gICAgICB3aWR0aCA9IHdpZHRoIHx8IGNvbG9yQXR0YWNobWVudHNbMF0ud2lkdGhcbiAgICAgIGhlaWdodCA9IGhlaWdodCB8fCBjb2xvckF0dGFjaG1lbnRzWzBdLmhlaWdodFxuXG4gICAgICBpZiAoZGVwdGhCdWZmZXIpIHtcbiAgICAgICAgZGVwdGhBdHRhY2htZW50ID0gcGFyc2VBdHRhY2htZW50KGRlcHRoQnVmZmVyKVxuICAgICAgfSBlbHNlIGlmIChuZWVkc0RlcHRoICYmICFuZWVkc1N0ZW5jaWwpIHtcbiAgICAgICAgZGVwdGhBdHRhY2htZW50ID0gYWxsb2NBdHRhY2htZW50KFxuICAgICAgICAgIHdpZHRoLFxuICAgICAgICAgIGhlaWdodCxcbiAgICAgICAgICBkZXB0aFN0ZW5jaWxUZXh0dXJlLFxuICAgICAgICAgICdkZXB0aCcsXG4gICAgICAgICAgJ3VpbnQzMicpXG4gICAgICB9XG5cbiAgICAgIGlmIChzdGVuY2lsQnVmZmVyKSB7XG4gICAgICAgIHN0ZW5jaWxBdHRhY2htZW50ID0gcGFyc2VBdHRhY2htZW50KHN0ZW5jaWxCdWZmZXIpXG4gICAgICB9IGVsc2UgaWYgKG5lZWRzU3RlbmNpbCAmJiAhbmVlZHNEZXB0aCkge1xuICAgICAgICBzdGVuY2lsQXR0YWNobWVudCA9IGFsbG9jQXR0YWNobWVudChcbiAgICAgICAgICB3aWR0aCxcbiAgICAgICAgICBoZWlnaHQsXG4gICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgJ3N0ZW5jaWwnLFxuICAgICAgICAgICd1aW50OCcpXG4gICAgICB9XG5cbiAgICAgIGlmIChkZXB0aFN0ZW5jaWxCdWZmZXIpIHtcbiAgICAgICAgZGVwdGhTdGVuY2lsQXR0YWNobWVudCA9IHBhcnNlQXR0YWNobWVudChkZXB0aFN0ZW5jaWxCdWZmZXIpXG4gICAgICB9IGVsc2UgaWYgKCFkZXB0aEJ1ZmZlciAmJiAhc3RlbmNpbEJ1ZmZlciAmJiBuZWVkc1N0ZW5jaWwgJiYgbmVlZHNEZXB0aCkge1xuICAgICAgICBkZXB0aFN0ZW5jaWxBdHRhY2htZW50ID0gYWxsb2NBdHRhY2htZW50KFxuICAgICAgICAgIHdpZHRoLFxuICAgICAgICAgIGhlaWdodCxcbiAgICAgICAgICBkZXB0aFN0ZW5jaWxUZXh0dXJlLFxuICAgICAgICAgICdkZXB0aCBzdGVuY2lsJyxcbiAgICAgICAgICAnZGVwdGggc3RlbmNpbCcpXG4gICAgICB9XG5cbiAgICAgIFxuXG4gICAgICB2YXIgY29tbW9uQ29sb3JBdHRhY2htZW50U2l6ZSA9IG51bGxcblxuICAgICAgZm9yIChpID0gMDsgaSA8IGNvbG9yQXR0YWNobWVudHMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgaW5jUmVmQW5kQ2hlY2tTaGFwZShjb2xvckF0dGFjaG1lbnRzW2ldLCB3aWR0aCwgaGVpZ2h0KVxuICAgICAgICBcblxuICAgICAgICBpZiAoY29sb3JBdHRhY2htZW50c1tpXSAmJiBjb2xvckF0dGFjaG1lbnRzW2ldLnRleHR1cmUpIHtcbiAgICAgICAgICB2YXIgY29sb3JBdHRhY2htZW50U2l6ZSA9XG4gICAgICAgICAgICAgIHRleHR1cmVGb3JtYXRDaGFubmVsc1tjb2xvckF0dGFjaG1lbnRzW2ldLnRleHR1cmUuX3RleHR1cmUuZm9ybWF0XSAqXG4gICAgICAgICAgICAgIHRleHR1cmVUeXBlU2l6ZXNbY29sb3JBdHRhY2htZW50c1tpXS50ZXh0dXJlLl90ZXh0dXJlLnR5cGVdXG5cbiAgICAgICAgICBpZiAoY29tbW9uQ29sb3JBdHRhY2htZW50U2l6ZSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgY29tbW9uQ29sb3JBdHRhY2htZW50U2l6ZSA9IGNvbG9yQXR0YWNobWVudFNpemVcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gV2UgbmVlZCB0byBtYWtlIHN1cmUgdGhhdCBhbGwgY29sb3IgYXR0YWNobWVudHMgaGF2ZSB0aGUgc2FtZSBudW1iZXIgb2YgYml0cGxhbmVzXG4gICAgICAgICAgICAvLyAodGhhdCBpcywgdGhlIHNhbWUgbnVtZXIgb2YgYml0cyBwZXIgcGl4ZWwpXG4gICAgICAgICAgICAvLyBUaGlzIGlzIHJlcXVpcmVkIGJ5IHRoZSBHTEVTMi4wIHN0YW5kYXJkLiBTZWUgdGhlIGJlZ2lubmluZyBvZiBDaGFwdGVyIDQgaW4gdGhhdCBkb2N1bWVudC5cbiAgICAgICAgICAgIFxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaW5jUmVmQW5kQ2hlY2tTaGFwZShkZXB0aEF0dGFjaG1lbnQsIHdpZHRoLCBoZWlnaHQpXG4gICAgICBcbiAgICAgIGluY1JlZkFuZENoZWNrU2hhcGUoc3RlbmNpbEF0dGFjaG1lbnQsIHdpZHRoLCBoZWlnaHQpXG4gICAgICBcbiAgICAgIGluY1JlZkFuZENoZWNrU2hhcGUoZGVwdGhTdGVuY2lsQXR0YWNobWVudCwgd2lkdGgsIGhlaWdodClcbiAgICAgIFxuXG4gICAgICAvLyBkZWNyZW1lbnQgcmVmZXJlbmNlc1xuICAgICAgZGVjRkJPUmVmcyhmcmFtZWJ1ZmZlcilcblxuICAgICAgZnJhbWVidWZmZXIud2lkdGggPSB3aWR0aFxuICAgICAgZnJhbWVidWZmZXIuaGVpZ2h0ID0gaGVpZ2h0XG5cbiAgICAgIGZyYW1lYnVmZmVyLmNvbG9yQXR0YWNobWVudHMgPSBjb2xvckF0dGFjaG1lbnRzXG4gICAgICBmcmFtZWJ1ZmZlci5kZXB0aEF0dGFjaG1lbnQgPSBkZXB0aEF0dGFjaG1lbnRcbiAgICAgIGZyYW1lYnVmZmVyLnN0ZW5jaWxBdHRhY2htZW50ID0gc3RlbmNpbEF0dGFjaG1lbnRcbiAgICAgIGZyYW1lYnVmZmVyLmRlcHRoU3RlbmNpbEF0dGFjaG1lbnQgPSBkZXB0aFN0ZW5jaWxBdHRhY2htZW50XG5cbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci5jb2xvciA9IGNvbG9yQXR0YWNobWVudHMubWFwKHVud3JhcEF0dGFjaG1lbnQpXG4gICAgICByZWdsRnJhbWVidWZmZXIuZGVwdGggPSB1bndyYXBBdHRhY2htZW50KGRlcHRoQXR0YWNobWVudClcbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci5zdGVuY2lsID0gdW53cmFwQXR0YWNobWVudChzdGVuY2lsQXR0YWNobWVudClcbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci5kZXB0aFN0ZW5jaWwgPSB1bndyYXBBdHRhY2htZW50KGRlcHRoU3RlbmNpbEF0dGFjaG1lbnQpXG5cbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci53aWR0aCA9IGZyYW1lYnVmZmVyLndpZHRoXG4gICAgICByZWdsRnJhbWVidWZmZXIuaGVpZ2h0ID0gZnJhbWVidWZmZXIuaGVpZ2h0XG5cbiAgICAgIHVwZGF0ZUZyYW1lYnVmZmVyKGZyYW1lYnVmZmVyKVxuXG4gICAgICByZXR1cm4gcmVnbEZyYW1lYnVmZmVyXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVzaXplICh3XywgaF8pIHtcbiAgICAgIFxuXG4gICAgICB2YXIgdyA9IHdfIHwgMFxuICAgICAgdmFyIGggPSAoaF8gfCAwKSB8fCB3XG4gICAgICBpZiAodyA9PT0gZnJhbWVidWZmZXIud2lkdGggJiYgaCA9PT0gZnJhbWVidWZmZXIuaGVpZ2h0KSB7XG4gICAgICAgIHJldHVybiByZWdsRnJhbWVidWZmZXJcbiAgICAgIH1cblxuICAgICAgLy8gcmVzaXplIGFsbCBidWZmZXJzXG4gICAgICB2YXIgY29sb3JBdHRhY2htZW50cyA9IGZyYW1lYnVmZmVyLmNvbG9yQXR0YWNobWVudHNcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY29sb3JBdHRhY2htZW50cy5sZW5ndGg7ICsraSkge1xuICAgICAgICByZXNpemVBdHRhY2htZW50KGNvbG9yQXR0YWNobWVudHNbaV0sIHcsIGgpXG4gICAgICB9XG4gICAgICByZXNpemVBdHRhY2htZW50KGZyYW1lYnVmZmVyLmRlcHRoQXR0YWNobWVudCwgdywgaClcbiAgICAgIHJlc2l6ZUF0dGFjaG1lbnQoZnJhbWVidWZmZXIuc3RlbmNpbEF0dGFjaG1lbnQsIHcsIGgpXG4gICAgICByZXNpemVBdHRhY2htZW50KGZyYW1lYnVmZmVyLmRlcHRoU3RlbmNpbEF0dGFjaG1lbnQsIHcsIGgpXG5cbiAgICAgIGZyYW1lYnVmZmVyLndpZHRoID0gcmVnbEZyYW1lYnVmZmVyLndpZHRoID0gd1xuICAgICAgZnJhbWVidWZmZXIuaGVpZ2h0ID0gcmVnbEZyYW1lYnVmZmVyLmhlaWdodCA9IGhcblxuICAgICAgdXBkYXRlRnJhbWVidWZmZXIoZnJhbWVidWZmZXIpXG5cbiAgICAgIHJldHVybiByZWdsRnJhbWVidWZmZXJcbiAgICB9XG5cbiAgICByZWdsRnJhbWVidWZmZXIoYTAsIGExKVxuXG4gICAgcmV0dXJuIGV4dGVuZChyZWdsRnJhbWVidWZmZXIsIHtcbiAgICAgIHJlc2l6ZTogcmVzaXplLFxuICAgICAgX3JlZ2xUeXBlOiAnZnJhbWVidWZmZXInLFxuICAgICAgX2ZyYW1lYnVmZmVyOiBmcmFtZWJ1ZmZlcixcbiAgICAgIGRlc3Ryb3k6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgZGVzdHJveShmcmFtZWJ1ZmZlcilcbiAgICAgICAgZGVjRkJPUmVmcyhmcmFtZWJ1ZmZlcilcbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlQ3ViZUZCTyAob3B0aW9ucykge1xuICAgIHZhciBmYWNlcyA9IEFycmF5KDYpXG5cbiAgICBmdW5jdGlvbiByZWdsRnJhbWVidWZmZXJDdWJlIChhKSB7XG4gICAgICB2YXIgaVxuXG4gICAgICBcblxuICAgICAgdmFyIGV4dERyYXdCdWZmZXJzID0gZXh0ZW5zaW9ucy53ZWJnbF9kcmF3X2J1ZmZlcnNcblxuICAgICAgdmFyIHBhcmFtcyA9IHtcbiAgICAgICAgY29sb3I6IG51bGxcbiAgICAgIH1cblxuICAgICAgdmFyIHJhZGl1cyA9IDBcblxuICAgICAgdmFyIGNvbG9yQnVmZmVyID0gbnVsbFxuICAgICAgdmFyIGNvbG9yRm9ybWF0ID0gJ3JnYmEnXG4gICAgICB2YXIgY29sb3JUeXBlID0gJ3VpbnQ4J1xuICAgICAgdmFyIGNvbG9yQ291bnQgPSAxXG5cbiAgICAgIGlmICh0eXBlb2YgYSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgcmFkaXVzID0gYSB8IDBcbiAgICAgIH0gZWxzZSBpZiAoIWEpIHtcbiAgICAgICAgcmFkaXVzID0gMVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgXG4gICAgICAgIHZhciBvcHRpb25zID0gYVxuXG4gICAgICAgIGlmICgnc2hhcGUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICB2YXIgc2hhcGUgPSBvcHRpb25zLnNoYXBlXG4gICAgICAgICAgXG4gICAgICAgICAgXG4gICAgICAgICAgcmFkaXVzID0gc2hhcGVbMF1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAoJ3JhZGl1cycgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgcmFkaXVzID0gb3B0aW9ucy5yYWRpdXMgfCAwXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgnd2lkdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIHJhZGl1cyA9IG9wdGlvbnMud2lkdGggfCAwXG4gICAgICAgICAgICBpZiAoJ2hlaWdodCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2UgaWYgKCdoZWlnaHQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIHJhZGl1cyA9IG9wdGlvbnMuaGVpZ2h0IHwgMFxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnY29sb3InIGluIG9wdGlvbnMgfHxcbiAgICAgICAgICAgICdjb2xvcnMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBjb2xvckJ1ZmZlciA9XG4gICAgICAgICAgICBvcHRpb25zLmNvbG9yIHx8XG4gICAgICAgICAgICBvcHRpb25zLmNvbG9yc1xuICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KGNvbG9yQnVmZmVyKSkge1xuICAgICAgICAgICAgXG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFjb2xvckJ1ZmZlcikge1xuICAgICAgICAgIGlmICgnY29sb3JDb3VudCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgY29sb3JDb3VudCA9IG9wdGlvbnMuY29sb3JDb3VudCB8IDBcbiAgICAgICAgICAgIFxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmICgnY29sb3JUeXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbG9yVHlwZSA9IG9wdGlvbnMuY29sb3JUeXBlXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKCdjb2xvckZvcm1hdCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgY29sb3JGb3JtYXQgPSBvcHRpb25zLmNvbG9yRm9ybWF0XG4gICAgICAgICAgICBcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ2RlcHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgcGFyYW1zLmRlcHRoID0gb3B0aW9ucy5kZXB0aFxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdzdGVuY2lsJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgcGFyYW1zLnN0ZW5jaWwgPSBvcHRpb25zLnN0ZW5jaWxcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnZGVwdGhTdGVuY2lsJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgcGFyYW1zLmRlcHRoU3RlbmNpbCA9IG9wdGlvbnMuZGVwdGhTdGVuY2lsXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgdmFyIGNvbG9yQ3ViZXNcbiAgICAgIGlmIChjb2xvckJ1ZmZlcikge1xuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShjb2xvckJ1ZmZlcikpIHtcbiAgICAgICAgICBjb2xvckN1YmVzID0gW11cbiAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY29sb3JCdWZmZXIubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICAgIGNvbG9yQ3ViZXNbaV0gPSBjb2xvckJ1ZmZlcltpXVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb2xvckN1YmVzID0gWyBjb2xvckJ1ZmZlciBdXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbG9yQ3ViZXMgPSBBcnJheShjb2xvckNvdW50KVxuICAgICAgICB2YXIgY3ViZU1hcFBhcmFtcyA9IHtcbiAgICAgICAgICByYWRpdXM6IHJhZGl1cyxcbiAgICAgICAgICBmb3JtYXQ6IGNvbG9yRm9ybWF0LFxuICAgICAgICAgIHR5cGU6IGNvbG9yVHlwZVxuICAgICAgICB9XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xvckNvdW50OyArK2kpIHtcbiAgICAgICAgICBjb2xvckN1YmVzW2ldID0gdGV4dHVyZVN0YXRlLmNyZWF0ZUN1YmUoY3ViZU1hcFBhcmFtcylcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBDaGVjayBjb2xvciBjdWJlc1xuICAgICAgcGFyYW1zLmNvbG9yID0gQXJyYXkoY29sb3JDdWJlcy5sZW5ndGgpXG4gICAgICBmb3IgKGkgPSAwOyBpIDwgY29sb3JDdWJlcy5sZW5ndGg7ICsraSkge1xuICAgICAgICB2YXIgY3ViZSA9IGNvbG9yQ3ViZXNbaV1cbiAgICAgICAgXG4gICAgICAgIHJhZGl1cyA9IHJhZGl1cyB8fCBjdWJlLndpZHRoXG4gICAgICAgIFxuICAgICAgICBwYXJhbXMuY29sb3JbaV0gPSB7XG4gICAgICAgICAgdGFyZ2V0OiBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1gsXG4gICAgICAgICAgZGF0YTogY29sb3JDdWJlc1tpXVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGZvciAoaSA9IDA7IGkgPCA2OyArK2kpIHtcbiAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBjb2xvckN1YmVzLmxlbmd0aDsgKytqKSB7XG4gICAgICAgICAgcGFyYW1zLmNvbG9yW2pdLnRhcmdldCA9IEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCArIGlcbiAgICAgICAgfVxuICAgICAgICAvLyByZXVzZSBkZXB0aC1zdGVuY2lsIGF0dGFjaG1lbnRzIGFjcm9zcyBhbGwgY3ViZSBtYXBzXG4gICAgICAgIGlmIChpID4gMCkge1xuICAgICAgICAgIHBhcmFtcy5kZXB0aCA9IGZhY2VzWzBdLmRlcHRoXG4gICAgICAgICAgcGFyYW1zLnN0ZW5jaWwgPSBmYWNlc1swXS5zdGVuY2lsXG4gICAgICAgICAgcGFyYW1zLmRlcHRoU3RlbmNpbCA9IGZhY2VzWzBdLmRlcHRoU3RlbmNpbFxuICAgICAgICB9XG4gICAgICAgIGlmIChmYWNlc1tpXSkge1xuICAgICAgICAgIChmYWNlc1tpXSkocGFyYW1zKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGZhY2VzW2ldID0gY3JlYXRlRkJPKHBhcmFtcylcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gZXh0ZW5kKHJlZ2xGcmFtZWJ1ZmZlckN1YmUsIHtcbiAgICAgICAgd2lkdGg6IHJhZGl1cyxcbiAgICAgICAgaGVpZ2h0OiByYWRpdXMsXG4gICAgICAgIGNvbG9yOiBjb2xvckN1YmVzXG4gICAgICB9KVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlc2l6ZSAocmFkaXVzXykge1xuICAgICAgdmFyIGlcbiAgICAgIHZhciByYWRpdXMgPSByYWRpdXNfIHwgMFxuICAgICAgXG5cbiAgICAgIGlmIChyYWRpdXMgPT09IHJlZ2xGcmFtZWJ1ZmZlckN1YmUud2lkdGgpIHtcbiAgICAgICAgcmV0dXJuIHJlZ2xGcmFtZWJ1ZmZlckN1YmVcbiAgICAgIH1cblxuICAgICAgdmFyIGNvbG9ycyA9IHJlZ2xGcmFtZWJ1ZmZlckN1YmUuY29sb3JcbiAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xvcnMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgY29sb3JzW2ldLnJlc2l6ZShyYWRpdXMpXG4gICAgICB9XG5cbiAgICAgIGZvciAoaSA9IDA7IGkgPCA2OyArK2kpIHtcbiAgICAgICAgZmFjZXNbaV0ucmVzaXplKHJhZGl1cylcbiAgICAgIH1cblxuICAgICAgcmVnbEZyYW1lYnVmZmVyQ3ViZS53aWR0aCA9IHJlZ2xGcmFtZWJ1ZmZlckN1YmUuaGVpZ2h0ID0gcmFkaXVzXG5cbiAgICAgIHJldHVybiByZWdsRnJhbWVidWZmZXJDdWJlXG4gICAgfVxuXG4gICAgcmVnbEZyYW1lYnVmZmVyQ3ViZShvcHRpb25zKVxuXG4gICAgcmV0dXJuIGV4dGVuZChyZWdsRnJhbWVidWZmZXJDdWJlLCB7XG4gICAgICBmYWNlczogZmFjZXMsXG4gICAgICByZXNpemU6IHJlc2l6ZSxcbiAgICAgIF9yZWdsVHlwZTogJ2ZyYW1lYnVmZmVyQ3ViZScsXG4gICAgICBkZXN0cm95OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGZhY2VzLmZvckVhY2goZnVuY3Rpb24gKGYpIHtcbiAgICAgICAgICBmLmRlc3Ryb3koKVxuICAgICAgICB9KVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiByZXN0b3JlRnJhbWVidWZmZXJzICgpIHtcbiAgICB2YWx1ZXMoZnJhbWVidWZmZXJTZXQpLmZvckVhY2goZnVuY3Rpb24gKGZiKSB7XG4gICAgICBmYi5mcmFtZWJ1ZmZlciA9IGdsLmNyZWF0ZUZyYW1lYnVmZmVyKClcbiAgICAgIHVwZGF0ZUZyYW1lYnVmZmVyKGZiKVxuICAgIH0pXG4gIH1cblxuICByZXR1cm4gZXh0ZW5kKGZyYW1lYnVmZmVyU3RhdGUsIHtcbiAgICBnZXRGcmFtZWJ1ZmZlcjogZnVuY3Rpb24gKG9iamVjdCkge1xuICAgICAgaWYgKHR5cGVvZiBvYmplY3QgPT09ICdmdW5jdGlvbicgJiYgb2JqZWN0Ll9yZWdsVHlwZSA9PT0gJ2ZyYW1lYnVmZmVyJykge1xuICAgICAgICB2YXIgZmJvID0gb2JqZWN0Ll9mcmFtZWJ1ZmZlclxuICAgICAgICBpZiAoZmJvIGluc3RhbmNlb2YgUkVHTEZyYW1lYnVmZmVyKSB7XG4gICAgICAgICAgcmV0dXJuIGZib1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH0sXG4gICAgY3JlYXRlOiBjcmVhdGVGQk8sXG4gICAgY3JlYXRlQ3ViZTogY3JlYXRlQ3ViZUZCTyxcbiAgICBjbGVhcjogZnVuY3Rpb24gKCkge1xuICAgICAgdmFsdWVzKGZyYW1lYnVmZmVyU2V0KS5mb3JFYWNoKGRlc3Ryb3kpXG4gICAgfSxcbiAgICByZXN0b3JlOiByZXN0b3JlRnJhbWVidWZmZXJzXG4gIH0pXG59XG4iLCJ2YXIgR0xfU1VCUElYRUxfQklUUyA9IDB4MEQ1MFxudmFyIEdMX1JFRF9CSVRTID0gMHgwRDUyXG52YXIgR0xfR1JFRU5fQklUUyA9IDB4MEQ1M1xudmFyIEdMX0JMVUVfQklUUyA9IDB4MEQ1NFxudmFyIEdMX0FMUEhBX0JJVFMgPSAweDBENTVcbnZhciBHTF9ERVBUSF9CSVRTID0gMHgwRDU2XG52YXIgR0xfU1RFTkNJTF9CSVRTID0gMHgwRDU3XG5cbnZhciBHTF9BTElBU0VEX1BPSU5UX1NJWkVfUkFOR0UgPSAweDg0NkRcbnZhciBHTF9BTElBU0VEX0xJTkVfV0lEVEhfUkFOR0UgPSAweDg0NkVcblxudmFyIEdMX01BWF9URVhUVVJFX1NJWkUgPSAweDBEMzNcbnZhciBHTF9NQVhfVklFV1BPUlRfRElNUyA9IDB4MEQzQVxudmFyIEdMX01BWF9WRVJURVhfQVRUUklCUyA9IDB4ODg2OVxudmFyIEdMX01BWF9WRVJURVhfVU5JRk9STV9WRUNUT1JTID0gMHg4REZCXG52YXIgR0xfTUFYX1ZBUllJTkdfVkVDVE9SUyA9IDB4OERGQ1xudmFyIEdMX01BWF9DT01CSU5FRF9URVhUVVJFX0lNQUdFX1VOSVRTID0gMHg4QjREXG52YXIgR0xfTUFYX1ZFUlRFWF9URVhUVVJFX0lNQUdFX1VOSVRTID0gMHg4QjRDXG52YXIgR0xfTUFYX1RFWFRVUkVfSU1BR0VfVU5JVFMgPSAweDg4NzJcbnZhciBHTF9NQVhfRlJBR01FTlRfVU5JRk9STV9WRUNUT1JTID0gMHg4REZEXG52YXIgR0xfTUFYX0NVQkVfTUFQX1RFWFRVUkVfU0laRSA9IDB4ODUxQ1xudmFyIEdMX01BWF9SRU5ERVJCVUZGRVJfU0laRSA9IDB4ODRFOFxuXG52YXIgR0xfVkVORE9SID0gMHgxRjAwXG52YXIgR0xfUkVOREVSRVIgPSAweDFGMDFcbnZhciBHTF9WRVJTSU9OID0gMHgxRjAyXG52YXIgR0xfU0hBRElOR19MQU5HVUFHRV9WRVJTSU9OID0gMHg4QjhDXG5cbnZhciBHTF9NQVhfVEVYVFVSRV9NQVhfQU5JU09UUk9QWV9FWFQgPSAweDg0RkZcblxudmFyIEdMX01BWF9DT0xPUl9BVFRBQ0hNRU5UU19XRUJHTCA9IDB4OENERlxudmFyIEdMX01BWF9EUkFXX0JVRkZFUlNfV0VCR0wgPSAweDg4MjRcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoZ2wsIGV4dGVuc2lvbnMpIHtcbiAgdmFyIG1heEFuaXNvdHJvcGljID0gMVxuICBpZiAoZXh0ZW5zaW9ucy5leHRfdGV4dHVyZV9maWx0ZXJfYW5pc290cm9waWMpIHtcbiAgICBtYXhBbmlzb3Ryb3BpYyA9IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVEVYVFVSRV9NQVhfQU5JU09UUk9QWV9FWFQpXG4gIH1cblxuICB2YXIgbWF4RHJhd2J1ZmZlcnMgPSAxXG4gIHZhciBtYXhDb2xvckF0dGFjaG1lbnRzID0gMVxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9kcmF3X2J1ZmZlcnMpIHtcbiAgICBtYXhEcmF3YnVmZmVycyA9IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfRFJBV19CVUZGRVJTX1dFQkdMKVxuICAgIG1heENvbG9yQXR0YWNobWVudHMgPSBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0NPTE9SX0FUVEFDSE1FTlRTX1dFQkdMKVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICAvLyBkcmF3aW5nIGJ1ZmZlciBiaXQgZGVwdGhcbiAgICBjb2xvckJpdHM6IFtcbiAgICAgIGdsLmdldFBhcmFtZXRlcihHTF9SRURfQklUUyksXG4gICAgICBnbC5nZXRQYXJhbWV0ZXIoR0xfR1JFRU5fQklUUyksXG4gICAgICBnbC5nZXRQYXJhbWV0ZXIoR0xfQkxVRV9CSVRTKSxcbiAgICAgIGdsLmdldFBhcmFtZXRlcihHTF9BTFBIQV9CSVRTKVxuICAgIF0sXG4gICAgZGVwdGhCaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfREVQVEhfQklUUyksXG4gICAgc3RlbmNpbEJpdHM6IGdsLmdldFBhcmFtZXRlcihHTF9TVEVOQ0lMX0JJVFMpLFxuICAgIHN1YnBpeGVsQml0czogZ2wuZ2V0UGFyYW1ldGVyKEdMX1NVQlBJWEVMX0JJVFMpLFxuXG4gICAgLy8gc3VwcG9ydGVkIGV4dGVuc2lvbnNcbiAgICBleHRlbnNpb25zOiBPYmplY3Qua2V5cyhleHRlbnNpb25zKS5maWx0ZXIoZnVuY3Rpb24gKGV4dCkge1xuICAgICAgcmV0dXJuICEhZXh0ZW5zaW9uc1tleHRdXG4gICAgfSksXG5cbiAgICAvLyBtYXggYW5pc28gc2FtcGxlc1xuICAgIG1heEFuaXNvdHJvcGljOiBtYXhBbmlzb3Ryb3BpYyxcblxuICAgIC8vIG1heCBkcmF3IGJ1ZmZlcnNcbiAgICBtYXhEcmF3YnVmZmVyczogbWF4RHJhd2J1ZmZlcnMsXG4gICAgbWF4Q29sb3JBdHRhY2htZW50czogbWF4Q29sb3JBdHRhY2htZW50cyxcblxuICAgIC8vIHBvaW50IGFuZCBsaW5lIHNpemUgcmFuZ2VzXG4gICAgcG9pbnRTaXplRGltczogZ2wuZ2V0UGFyYW1ldGVyKEdMX0FMSUFTRURfUE9JTlRfU0laRV9SQU5HRSksXG4gICAgbGluZVdpZHRoRGltczogZ2wuZ2V0UGFyYW1ldGVyKEdMX0FMSUFTRURfTElORV9XSURUSF9SQU5HRSksXG4gICAgbWF4Vmlld3BvcnREaW1zOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1ZJRVdQT1JUX0RJTVMpLFxuICAgIG1heENvbWJpbmVkVGV4dHVyZVVuaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0NPTUJJTkVEX1RFWFRVUkVfSU1BR0VfVU5JVFMpLFxuICAgIG1heEN1YmVNYXBTaXplOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0NVQkVfTUFQX1RFWFRVUkVfU0laRSksXG4gICAgbWF4UmVuZGVyYnVmZmVyU2l6ZTogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9SRU5ERVJCVUZGRVJfU0laRSksXG4gICAgbWF4VGV4dHVyZVVuaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1RFWFRVUkVfSU1BR0VfVU5JVFMpLFxuICAgIG1heFRleHR1cmVTaXplOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1RFWFRVUkVfU0laRSksXG4gICAgbWF4QXR0cmlidXRlczogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9WRVJURVhfQVRUUklCUyksXG4gICAgbWF4VmVydGV4VW5pZm9ybXM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVkVSVEVYX1VOSUZPUk1fVkVDVE9SUyksXG4gICAgbWF4VmVydGV4VGV4dHVyZVVuaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1ZFUlRFWF9URVhUVVJFX0lNQUdFX1VOSVRTKSxcbiAgICBtYXhWYXJ5aW5nVmVjdG9yczogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9WQVJZSU5HX1ZFQ1RPUlMpLFxuICAgIG1heEZyYWdtZW50VW5pZm9ybXM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfRlJBR01FTlRfVU5JRk9STV9WRUNUT1JTKSxcblxuICAgIC8vIHZlbmRvciBpbmZvXG4gICAgZ2xzbDogZ2wuZ2V0UGFyYW1ldGVyKEdMX1NIQURJTkdfTEFOR1VBR0VfVkVSU0lPTiksXG4gICAgcmVuZGVyZXI6IGdsLmdldFBhcmFtZXRlcihHTF9SRU5ERVJFUiksXG4gICAgdmVuZG9yOiBnbC5nZXRQYXJhbWV0ZXIoR0xfVkVORE9SKSxcbiAgICB2ZXJzaW9uOiBnbC5nZXRQYXJhbWV0ZXIoR0xfVkVSU0lPTilcbiAgfVxufVxuIiwiXG52YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi91dGlsL2lzLXR5cGVkLWFycmF5JylcblxudmFyIEdMX1JHQkEgPSA2NDA4XG52YXIgR0xfVU5TSUdORURfQllURSA9IDUxMjFcbnZhciBHTF9QQUNLX0FMSUdOTUVOVCA9IDB4MEQwNVxudmFyIEdMX0ZMT0FUID0gMHgxNDA2IC8vIDUxMjZcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwUmVhZFBpeGVscyAoXG4gIGdsLFxuICBmcmFtZWJ1ZmZlclN0YXRlLFxuICByZWdsUG9sbCxcbiAgY29udGV4dCxcbiAgZ2xBdHRyaWJ1dGVzLFxuICBleHRlbnNpb25zKSB7XG4gIGZ1bmN0aW9uIHJlYWRQaXhlbHMgKGlucHV0KSB7XG4gICAgdmFyIHR5cGVcbiAgICBpZiAoZnJhbWVidWZmZXJTdGF0ZS5uZXh0ID09PSBudWxsKSB7XG4gICAgICBcbiAgICAgIHR5cGUgPSBHTF9VTlNJR05FRF9CWVRFXG4gICAgfSBlbHNlIHtcbiAgICAgIFxuICAgICAgdHlwZSA9IGZyYW1lYnVmZmVyU3RhdGUubmV4dC5jb2xvckF0dGFjaG1lbnRzWzBdLnRleHR1cmUuX3RleHR1cmUudHlwZVxuXG4gICAgICBpZiAoZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9mbG9hdCkge1xuICAgICAgICBcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIFxuICAgICAgfVxuICAgIH1cblxuICAgIHZhciB4ID0gMFxuICAgIHZhciB5ID0gMFxuICAgIHZhciB3aWR0aCA9IGNvbnRleHQuZnJhbWVidWZmZXJXaWR0aFxuICAgIHZhciBoZWlnaHQgPSBjb250ZXh0LmZyYW1lYnVmZmVySGVpZ2h0XG4gICAgdmFyIGRhdGEgPSBudWxsXG5cbiAgICBpZiAoaXNUeXBlZEFycmF5KGlucHV0KSkge1xuICAgICAgZGF0YSA9IGlucHV0XG4gICAgfSBlbHNlIGlmIChpbnB1dCkge1xuICAgICAgXG4gICAgICB4ID0gaW5wdXQueCB8IDBcbiAgICAgIHkgPSBpbnB1dC55IHwgMFxuICAgICAgXG4gICAgICBcbiAgICAgIHdpZHRoID0gKGlucHV0LndpZHRoIHx8IChjb250ZXh0LmZyYW1lYnVmZmVyV2lkdGggLSB4KSkgfCAwXG4gICAgICBoZWlnaHQgPSAoaW5wdXQuaGVpZ2h0IHx8IChjb250ZXh0LmZyYW1lYnVmZmVySGVpZ2h0IC0geSkpIHwgMFxuICAgICAgZGF0YSA9IGlucHV0LmRhdGEgfHwgbnVsbFxuICAgIH1cblxuICAgIC8vIHNhbml0eSBjaGVjayBpbnB1dC5kYXRhXG4gICAgaWYgKGRhdGEpIHtcbiAgICAgIGlmICh0eXBlID09PSBHTF9VTlNJR05FRF9CWVRFKSB7XG4gICAgICAgIFxuICAgICAgfSBlbHNlIGlmICh0eXBlID09PSBHTF9GTE9BVCkge1xuICAgICAgICBcbiAgICAgIH1cbiAgICB9XG5cbiAgICBcbiAgICBcblxuICAgIC8vIFVwZGF0ZSBXZWJHTCBzdGF0ZVxuICAgIHJlZ2xQb2xsKClcblxuICAgIC8vIENvbXB1dGUgc2l6ZVxuICAgIHZhciBzaXplID0gd2lkdGggKiBoZWlnaHQgKiA0XG5cbiAgICAvLyBBbGxvY2F0ZSBkYXRhXG4gICAgaWYgKCFkYXRhKSB7XG4gICAgICBpZiAodHlwZSA9PT0gR0xfVU5TSUdORURfQllURSkge1xuICAgICAgICBkYXRhID0gbmV3IFVpbnQ4QXJyYXkoc2l6ZSlcbiAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gR0xfRkxPQVQpIHtcbiAgICAgICAgZGF0YSA9IGRhdGEgfHwgbmV3IEZsb2F0MzJBcnJheShzaXplKVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFR5cGUgY2hlY2tcbiAgICBcbiAgICBcblxuICAgIC8vIFJ1biByZWFkIHBpeGVsc1xuICAgIGdsLnBpeGVsU3RvcmVpKEdMX1BBQ0tfQUxJR05NRU5ULCA0KVxuICAgIGdsLnJlYWRQaXhlbHMoeCwgeSwgd2lkdGgsIGhlaWdodCwgR0xfUkdCQSxcbiAgICAgICAgICAgICAgICAgIHR5cGUsXG4gICAgICAgICAgICAgICAgICBkYXRhKVxuXG4gICAgcmV0dXJuIGRhdGFcbiAgfVxuXG4gIHJldHVybiByZWFkUGl4ZWxzXG59XG4iLCJcbnZhciB2YWx1ZXMgPSByZXF1aXJlKCcuL3V0aWwvdmFsdWVzJylcblxudmFyIEdMX1JFTkRFUkJVRkZFUiA9IDB4OEQ0MVxuXG52YXIgR0xfUkdCQTQgPSAweDgwNTZcbnZhciBHTF9SR0I1X0ExID0gMHg4MDU3XG52YXIgR0xfUkdCNTY1ID0gMHg4RDYyXG52YXIgR0xfREVQVEhfQ09NUE9ORU5UMTYgPSAweDgxQTVcbnZhciBHTF9TVEVOQ0lMX0lOREVYOCA9IDB4OEQ0OFxudmFyIEdMX0RFUFRIX1NURU5DSUwgPSAweDg0RjlcblxudmFyIEdMX1NSR0I4X0FMUEhBOF9FWFQgPSAweDhDNDNcblxudmFyIEdMX1JHQkEzMkZfRVhUID0gMHg4ODE0XG5cbnZhciBHTF9SR0JBMTZGX0VYVCA9IDB4ODgxQVxudmFyIEdMX1JHQjE2Rl9FWFQgPSAweDg4MUJcblxudmFyIEZPUk1BVF9TSVpFUyA9IFtdXG5cbkZPUk1BVF9TSVpFU1tHTF9SR0JBNF0gPSAyXG5GT1JNQVRfU0laRVNbR0xfUkdCNV9BMV0gPSAyXG5GT1JNQVRfU0laRVNbR0xfUkdCNTY1XSA9IDJcblxuRk9STUFUX1NJWkVTW0dMX0RFUFRIX0NPTVBPTkVOVDE2XSA9IDJcbkZPUk1BVF9TSVpFU1tHTF9TVEVOQ0lMX0lOREVYOF0gPSAxXG5GT1JNQVRfU0laRVNbR0xfREVQVEhfU1RFTkNJTF0gPSA0XG5cbkZPUk1BVF9TSVpFU1tHTF9TUkdCOF9BTFBIQThfRVhUXSA9IDRcbkZPUk1BVF9TSVpFU1tHTF9SR0JBMzJGX0VYVF0gPSAxNlxuRk9STUFUX1NJWkVTW0dMX1JHQkExNkZfRVhUXSA9IDhcbkZPUk1BVF9TSVpFU1tHTF9SR0IxNkZfRVhUXSA9IDZcblxuZnVuY3Rpb24gZ2V0UmVuZGVyYnVmZmVyU2l6ZSAoZm9ybWF0LCB3aWR0aCwgaGVpZ2h0KSB7XG4gIHJldHVybiBGT1JNQVRfU0laRVNbZm9ybWF0XSAqIHdpZHRoICogaGVpZ2h0XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGdsLCBleHRlbnNpb25zLCBsaW1pdHMsIHN0YXRzLCBjb25maWcpIHtcbiAgdmFyIGZvcm1hdFR5cGVzID0ge1xuICAgICdyZ2JhNCc6IEdMX1JHQkE0LFxuICAgICdyZ2I1NjUnOiBHTF9SR0I1NjUsXG4gICAgJ3JnYjUgYTEnOiBHTF9SR0I1X0ExLFxuICAgICdkZXB0aCc6IEdMX0RFUFRIX0NPTVBPTkVOVDE2LFxuICAgICdzdGVuY2lsJzogR0xfU1RFTkNJTF9JTkRFWDgsXG4gICAgJ2RlcHRoIHN0ZW5jaWwnOiBHTF9ERVBUSF9TVEVOQ0lMXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5leHRfc3JnYikge1xuICAgIGZvcm1hdFR5cGVzWydzcmdiYSddID0gR0xfU1JHQjhfQUxQSEE4X0VYVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMuZXh0X2NvbG9yX2J1ZmZlcl9oYWxmX2Zsb2F0KSB7XG4gICAgZm9ybWF0VHlwZXNbJ3JnYmExNmYnXSA9IEdMX1JHQkExNkZfRVhUXG4gICAgZm9ybWF0VHlwZXNbJ3JnYjE2ZiddID0gR0xfUkdCMTZGX0VYVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29sb3JfYnVmZmVyX2Zsb2F0KSB7XG4gICAgZm9ybWF0VHlwZXNbJ3JnYmEzMmYnXSA9IEdMX1JHQkEzMkZfRVhUXG4gIH1cblxuICB2YXIgZm9ybWF0VHlwZXNJbnZlcnQgPSBbXVxuICBPYmplY3Qua2V5cyhmb3JtYXRUeXBlcykuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgdmFyIHZhbCA9IGZvcm1hdFR5cGVzW2tleV1cbiAgICBmb3JtYXRUeXBlc0ludmVydFt2YWxdID0ga2V5XG4gIH0pXG5cbiAgdmFyIHJlbmRlcmJ1ZmZlckNvdW50ID0gMFxuICB2YXIgcmVuZGVyYnVmZmVyU2V0ID0ge31cblxuICBmdW5jdGlvbiBSRUdMUmVuZGVyYnVmZmVyIChyZW5kZXJidWZmZXIpIHtcbiAgICB0aGlzLmlkID0gcmVuZGVyYnVmZmVyQ291bnQrK1xuICAgIHRoaXMucmVmQ291bnQgPSAxXG5cbiAgICB0aGlzLnJlbmRlcmJ1ZmZlciA9IHJlbmRlcmJ1ZmZlclxuXG4gICAgdGhpcy5mb3JtYXQgPSBHTF9SR0JBNFxuICAgIHRoaXMud2lkdGggPSAwXG4gICAgdGhpcy5oZWlnaHQgPSAwXG5cbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgIHRoaXMuc3RhdHMgPSB7c2l6ZTogMH1cbiAgICB9XG4gIH1cblxuICBSRUdMUmVuZGVyYnVmZmVyLnByb3RvdHlwZS5kZWNSZWYgPSBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKC0tdGhpcy5yZWZDb3VudCA8PSAwKSB7XG4gICAgICBkZXN0cm95KHRoaXMpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSAocmIpIHtcbiAgICB2YXIgaGFuZGxlID0gcmIucmVuZGVyYnVmZmVyXG4gICAgXG4gICAgZ2wuYmluZFJlbmRlcmJ1ZmZlcihHTF9SRU5ERVJCVUZGRVIsIG51bGwpXG4gICAgZ2wuZGVsZXRlUmVuZGVyYnVmZmVyKGhhbmRsZSlcbiAgICByYi5yZW5kZXJidWZmZXIgPSBudWxsXG4gICAgcmIucmVmQ291bnQgPSAwXG4gICAgZGVsZXRlIHJlbmRlcmJ1ZmZlclNldFtyYi5pZF1cbiAgICBzdGF0cy5yZW5kZXJidWZmZXJDb3VudC0tXG4gIH1cblxuICBmdW5jdGlvbiBjcmVhdGVSZW5kZXJidWZmZXIgKGEsIGIpIHtcbiAgICB2YXIgcmVuZGVyYnVmZmVyID0gbmV3IFJFR0xSZW5kZXJidWZmZXIoZ2wuY3JlYXRlUmVuZGVyYnVmZmVyKCkpXG4gICAgcmVuZGVyYnVmZmVyU2V0W3JlbmRlcmJ1ZmZlci5pZF0gPSByZW5kZXJidWZmZXJcbiAgICBzdGF0cy5yZW5kZXJidWZmZXJDb3VudCsrXG5cbiAgICBmdW5jdGlvbiByZWdsUmVuZGVyYnVmZmVyIChhLCBiKSB7XG4gICAgICB2YXIgdyA9IDBcbiAgICAgIHZhciBoID0gMFxuICAgICAgdmFyIGZvcm1hdCA9IEdMX1JHQkE0XG5cbiAgICAgIGlmICh0eXBlb2YgYSA9PT0gJ29iamVjdCcgJiYgYSkge1xuICAgICAgICB2YXIgb3B0aW9ucyA9IGFcbiAgICAgICAgaWYgKCdzaGFwZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHZhciBzaGFwZSA9IG9wdGlvbnMuc2hhcGVcbiAgICAgICAgICBcbiAgICAgICAgICB3ID0gc2hhcGVbMF0gfCAwXG4gICAgICAgICAgaCA9IHNoYXBlWzFdIHwgMFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmICgncmFkaXVzJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICB3ID0gaCA9IG9wdGlvbnMucmFkaXVzIHwgMFxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoJ3dpZHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICB3ID0gb3B0aW9ucy53aWR0aCB8IDBcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCdoZWlnaHQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGggPSBvcHRpb25zLmhlaWdodCB8IDBcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCdmb3JtYXQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBcbiAgICAgICAgICBmb3JtYXQgPSBmb3JtYXRUeXBlc1tvcHRpb25zLmZvcm1hdF1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgYSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgdyA9IGEgfCAwXG4gICAgICAgIGlmICh0eXBlb2YgYiA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICBoID0gYiB8IDBcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBoID0gd1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKCFhKSB7XG4gICAgICAgIHcgPSBoID0gMVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgXG4gICAgICB9XG5cbiAgICAgIC8vIGNoZWNrIHNoYXBlXG4gICAgICBcblxuICAgICAgaWYgKHcgPT09IHJlbmRlcmJ1ZmZlci53aWR0aCAmJlxuICAgICAgICAgIGggPT09IHJlbmRlcmJ1ZmZlci5oZWlnaHQgJiZcbiAgICAgICAgICBmb3JtYXQgPT09IHJlbmRlcmJ1ZmZlci5mb3JtYXQpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG5cbiAgICAgIHJlZ2xSZW5kZXJidWZmZXIud2lkdGggPSByZW5kZXJidWZmZXIud2lkdGggPSB3XG4gICAgICByZWdsUmVuZGVyYnVmZmVyLmhlaWdodCA9IHJlbmRlcmJ1ZmZlci5oZWlnaHQgPSBoXG4gICAgICByZW5kZXJidWZmZXIuZm9ybWF0ID0gZm9ybWF0XG5cbiAgICAgIGdsLmJpbmRSZW5kZXJidWZmZXIoR0xfUkVOREVSQlVGRkVSLCByZW5kZXJidWZmZXIucmVuZGVyYnVmZmVyKVxuICAgICAgZ2wucmVuZGVyYnVmZmVyU3RvcmFnZShHTF9SRU5ERVJCVUZGRVIsIGZvcm1hdCwgdywgaClcblxuICAgICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICAgIHJlbmRlcmJ1ZmZlci5zdGF0cy5zaXplID0gZ2V0UmVuZGVyYnVmZmVyU2l6ZShyZW5kZXJidWZmZXIuZm9ybWF0LCByZW5kZXJidWZmZXIud2lkdGgsIHJlbmRlcmJ1ZmZlci5oZWlnaHQpXG4gICAgICB9XG4gICAgICByZWdsUmVuZGVyYnVmZmVyLmZvcm1hdCA9IGZvcm1hdFR5cGVzSW52ZXJ0W3JlbmRlcmJ1ZmZlci5mb3JtYXRdXG5cbiAgICAgIHJldHVybiByZWdsUmVuZGVyYnVmZmVyXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVzaXplICh3XywgaF8pIHtcbiAgICAgIHZhciB3ID0gd18gfCAwXG4gICAgICB2YXIgaCA9IChoXyB8IDApIHx8IHdcblxuICAgICAgaWYgKHcgPT09IHJlbmRlcmJ1ZmZlci53aWR0aCAmJiBoID09PSByZW5kZXJidWZmZXIuaGVpZ2h0KSB7XG4gICAgICAgIHJldHVybiByZWdsUmVuZGVyYnVmZmVyXG4gICAgICB9XG5cbiAgICAgIC8vIGNoZWNrIHNoYXBlXG4gICAgICBcblxuICAgICAgcmVnbFJlbmRlcmJ1ZmZlci53aWR0aCA9IHJlbmRlcmJ1ZmZlci53aWR0aCA9IHdcbiAgICAgIHJlZ2xSZW5kZXJidWZmZXIuaGVpZ2h0ID0gcmVuZGVyYnVmZmVyLmhlaWdodCA9IGhcblxuICAgICAgZ2wuYmluZFJlbmRlcmJ1ZmZlcihHTF9SRU5ERVJCVUZGRVIsIHJlbmRlcmJ1ZmZlci5yZW5kZXJidWZmZXIpXG4gICAgICBnbC5yZW5kZXJidWZmZXJTdG9yYWdlKEdMX1JFTkRFUkJVRkZFUiwgcmVuZGVyYnVmZmVyLmZvcm1hdCwgdywgaClcblxuICAgICAgLy8gYWxzbywgcmVjb21wdXRlIHNpemUuXG4gICAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgICAgcmVuZGVyYnVmZmVyLnN0YXRzLnNpemUgPSBnZXRSZW5kZXJidWZmZXJTaXplKFxuICAgICAgICAgIHJlbmRlcmJ1ZmZlci5mb3JtYXQsIHJlbmRlcmJ1ZmZlci53aWR0aCwgcmVuZGVyYnVmZmVyLmhlaWdodClcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJlZ2xSZW5kZXJidWZmZXJcbiAgICB9XG5cbiAgICByZWdsUmVuZGVyYnVmZmVyKGEsIGIpXG5cbiAgICByZWdsUmVuZGVyYnVmZmVyLnJlc2l6ZSA9IHJlc2l6ZVxuICAgIHJlZ2xSZW5kZXJidWZmZXIuX3JlZ2xUeXBlID0gJ3JlbmRlcmJ1ZmZlcidcbiAgICByZWdsUmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXIgPSByZW5kZXJidWZmZXJcbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgIHJlZ2xSZW5kZXJidWZmZXIuc3RhdHMgPSByZW5kZXJidWZmZXIuc3RhdHNcbiAgICB9XG4gICAgcmVnbFJlbmRlcmJ1ZmZlci5kZXN0cm95ID0gZnVuY3Rpb24gKCkge1xuICAgICAgcmVuZGVyYnVmZmVyLmRlY1JlZigpXG4gICAgfVxuXG4gICAgcmV0dXJuIHJlZ2xSZW5kZXJidWZmZXJcbiAgfVxuXG4gIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgIHN0YXRzLmdldFRvdGFsUmVuZGVyYnVmZmVyU2l6ZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciB0b3RhbCA9IDBcbiAgICAgIE9iamVjdC5rZXlzKHJlbmRlcmJ1ZmZlclNldCkuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgIHRvdGFsICs9IHJlbmRlcmJ1ZmZlclNldFtrZXldLnN0YXRzLnNpemVcbiAgICAgIH0pXG4gICAgICByZXR1cm4gdG90YWxcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiByZXN0b3JlUmVuZGVyYnVmZmVycyAoKSB7XG4gICAgdmFsdWVzKHJlbmRlcmJ1ZmZlclNldCkuZm9yRWFjaChmdW5jdGlvbiAocmIpIHtcbiAgICAgIHJiLnJlbmRlcmJ1ZmZlciA9IGdsLmNyZWF0ZVJlbmRlcmJ1ZmZlcigpXG4gICAgICBnbC5iaW5kUmVuZGVyYnVmZmVyKEdMX1JFTkRFUkJVRkZFUiwgcmIucmVuZGVyYnVmZmVyKVxuICAgICAgZ2wucmVuZGVyYnVmZmVyU3RvcmFnZShHTF9SRU5ERVJCVUZGRVIsIHJiLmZvcm1hdCwgcmIud2lkdGgsIHJiLmhlaWdodClcbiAgICB9KVxuICAgIGdsLmJpbmRSZW5kZXJidWZmZXIoR0xfUkVOREVSQlVGRkVSLCBudWxsKVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjcmVhdGU6IGNyZWF0ZVJlbmRlcmJ1ZmZlcixcbiAgICBjbGVhcjogZnVuY3Rpb24gKCkge1xuICAgICAgdmFsdWVzKHJlbmRlcmJ1ZmZlclNldCkuZm9yRWFjaChkZXN0cm95KVxuICAgIH0sXG4gICAgcmVzdG9yZTogcmVzdG9yZVJlbmRlcmJ1ZmZlcnNcbiAgfVxufVxuIiwiXG52YXIgdmFsdWVzID0gcmVxdWlyZSgnLi91dGlsL3ZhbHVlcycpXG5cbnZhciBHTF9GUkFHTUVOVF9TSEFERVIgPSAzNTYzMlxudmFyIEdMX1ZFUlRFWF9TSEFERVIgPSAzNTYzM1xuXG52YXIgR0xfQUNUSVZFX1VOSUZPUk1TID0gMHg4Qjg2XG52YXIgR0xfQUNUSVZFX0FUVFJJQlVURVMgPSAweDhCODlcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwU2hhZGVyU3RhdGUgKGdsLCBzdHJpbmdTdG9yZSwgc3RhdHMsIGNvbmZpZykge1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gZ2xzbCBjb21waWxhdGlvbiBhbmQgbGlua2luZ1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgdmFyIGZyYWdTaGFkZXJzID0ge31cbiAgdmFyIHZlcnRTaGFkZXJzID0ge31cblxuICBmdW5jdGlvbiBBY3RpdmVJbmZvIChuYW1lLCBpZCwgbG9jYXRpb24sIGluZm8pIHtcbiAgICB0aGlzLm5hbWUgPSBuYW1lXG4gICAgdGhpcy5pZCA9IGlkXG4gICAgdGhpcy5sb2NhdGlvbiA9IGxvY2F0aW9uXG4gICAgdGhpcy5pbmZvID0gaW5mb1xuICB9XG5cbiAgZnVuY3Rpb24gaW5zZXJ0QWN0aXZlSW5mbyAobGlzdCwgaW5mbykge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGlzdC5sZW5ndGg7ICsraSkge1xuICAgICAgaWYgKGxpc3RbaV0uaWQgPT09IGluZm8uaWQpIHtcbiAgICAgICAgbGlzdFtpXS5sb2NhdGlvbiA9IGluZm8ubG9jYXRpb25cbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgfVxuICAgIGxpc3QucHVzaChpbmZvKVxuICB9XG5cbiAgZnVuY3Rpb24gZ2V0U2hhZGVyICh0eXBlLCBpZCwgY29tbWFuZCkge1xuICAgIHZhciBjYWNoZSA9IHR5cGUgPT09IEdMX0ZSQUdNRU5UX1NIQURFUiA/IGZyYWdTaGFkZXJzIDogdmVydFNoYWRlcnNcbiAgICB2YXIgc2hhZGVyID0gY2FjaGVbaWRdXG5cbiAgICBpZiAoIXNoYWRlcikge1xuICAgICAgdmFyIHNvdXJjZSA9IHN0cmluZ1N0b3JlLnN0cihpZClcbiAgICAgIHNoYWRlciA9IGdsLmNyZWF0ZVNoYWRlcih0eXBlKVxuICAgICAgZ2wuc2hhZGVyU291cmNlKHNoYWRlciwgc291cmNlKVxuICAgICAgZ2wuY29tcGlsZVNoYWRlcihzaGFkZXIpXG4gICAgICBcbiAgICAgIGNhY2hlW2lkXSA9IHNoYWRlclxuICAgIH1cblxuICAgIHJldHVybiBzaGFkZXJcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBwcm9ncmFtIGxpbmtpbmdcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIHZhciBwcm9ncmFtQ2FjaGUgPSB7fVxuICB2YXIgcHJvZ3JhbUxpc3QgPSBbXVxuXG4gIHZhciBQUk9HUkFNX0NPVU5URVIgPSAwXG5cbiAgZnVuY3Rpb24gUkVHTFByb2dyYW0gKGZyYWdJZCwgdmVydElkKSB7XG4gICAgdGhpcy5pZCA9IFBST0dSQU1fQ09VTlRFUisrXG4gICAgdGhpcy5mcmFnSWQgPSBmcmFnSWRcbiAgICB0aGlzLnZlcnRJZCA9IHZlcnRJZFxuICAgIHRoaXMucHJvZ3JhbSA9IG51bGxcbiAgICB0aGlzLnVuaWZvcm1zID0gW11cbiAgICB0aGlzLmF0dHJpYnV0ZXMgPSBbXVxuXG4gICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICB0aGlzLnN0YXRzID0ge1xuICAgICAgICB1bmlmb3Jtc0NvdW50OiAwLFxuICAgICAgICBhdHRyaWJ1dGVzQ291bnQ6IDBcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBsaW5rUHJvZ3JhbSAoZGVzYywgY29tbWFuZCkge1xuICAgIHZhciBpLCBpbmZvXG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gY29tcGlsZSAmIGxpbmtcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgdmFyIGZyYWdTaGFkZXIgPSBnZXRTaGFkZXIoR0xfRlJBR01FTlRfU0hBREVSLCBkZXNjLmZyYWdJZClcbiAgICB2YXIgdmVydFNoYWRlciA9IGdldFNoYWRlcihHTF9WRVJURVhfU0hBREVSLCBkZXNjLnZlcnRJZClcblxuICAgIHZhciBwcm9ncmFtID0gZGVzYy5wcm9ncmFtID0gZ2wuY3JlYXRlUHJvZ3JhbSgpXG4gICAgZ2wuYXR0YWNoU2hhZGVyKHByb2dyYW0sIGZyYWdTaGFkZXIpXG4gICAgZ2wuYXR0YWNoU2hhZGVyKHByb2dyYW0sIHZlcnRTaGFkZXIpXG4gICAgZ2wubGlua1Byb2dyYW0ocHJvZ3JhbSlcbiAgICBcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBncmFiIHVuaWZvcm1zXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHZhciBudW1Vbmlmb3JtcyA9IGdsLmdldFByb2dyYW1QYXJhbWV0ZXIocHJvZ3JhbSwgR0xfQUNUSVZFX1VOSUZPUk1TKVxuICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgZGVzYy5zdGF0cy51bmlmb3Jtc0NvdW50ID0gbnVtVW5pZm9ybXNcbiAgICB9XG4gICAgdmFyIHVuaWZvcm1zID0gZGVzYy51bmlmb3Jtc1xuICAgIGZvciAoaSA9IDA7IGkgPCBudW1Vbmlmb3JtczsgKytpKSB7XG4gICAgICBpbmZvID0gZ2wuZ2V0QWN0aXZlVW5pZm9ybShwcm9ncmFtLCBpKVxuICAgICAgaWYgKGluZm8pIHtcbiAgICAgICAgaWYgKGluZm8uc2l6ZSA+IDEpIHtcbiAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGluZm8uc2l6ZTsgKytqKSB7XG4gICAgICAgICAgICB2YXIgbmFtZSA9IGluZm8ubmFtZS5yZXBsYWNlKCdbMF0nLCAnWycgKyBqICsgJ10nKVxuICAgICAgICAgICAgaW5zZXJ0QWN0aXZlSW5mbyh1bmlmb3JtcywgbmV3IEFjdGl2ZUluZm8oXG4gICAgICAgICAgICAgIG5hbWUsXG4gICAgICAgICAgICAgIHN0cmluZ1N0b3JlLmlkKG5hbWUpLFxuICAgICAgICAgICAgICBnbC5nZXRVbmlmb3JtTG9jYXRpb24ocHJvZ3JhbSwgbmFtZSksXG4gICAgICAgICAgICAgIGluZm8pKVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpbnNlcnRBY3RpdmVJbmZvKHVuaWZvcm1zLCBuZXcgQWN0aXZlSW5mbyhcbiAgICAgICAgICAgIGluZm8ubmFtZSxcbiAgICAgICAgICAgIHN0cmluZ1N0b3JlLmlkKGluZm8ubmFtZSksXG4gICAgICAgICAgICBnbC5nZXRVbmlmb3JtTG9jYXRpb24ocHJvZ3JhbSwgaW5mby5uYW1lKSxcbiAgICAgICAgICAgIGluZm8pKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGdyYWIgYXR0cmlidXRlc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICB2YXIgbnVtQXR0cmlidXRlcyA9IGdsLmdldFByb2dyYW1QYXJhbWV0ZXIocHJvZ3JhbSwgR0xfQUNUSVZFX0FUVFJJQlVURVMpXG4gICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICBkZXNjLnN0YXRzLmF0dHJpYnV0ZXNDb3VudCA9IG51bUF0dHJpYnV0ZXNcbiAgICB9XG5cbiAgICB2YXIgYXR0cmlidXRlcyA9IGRlc2MuYXR0cmlidXRlc1xuICAgIGZvciAoaSA9IDA7IGkgPCBudW1BdHRyaWJ1dGVzOyArK2kpIHtcbiAgICAgIGluZm8gPSBnbC5nZXRBY3RpdmVBdHRyaWIocHJvZ3JhbSwgaSlcbiAgICAgIGlmIChpbmZvKSB7XG4gICAgICAgIGluc2VydEFjdGl2ZUluZm8oYXR0cmlidXRlcywgbmV3IEFjdGl2ZUluZm8oXG4gICAgICAgICAgaW5mby5uYW1lLFxuICAgICAgICAgIHN0cmluZ1N0b3JlLmlkKGluZm8ubmFtZSksXG4gICAgICAgICAgZ2wuZ2V0QXR0cmliTG9jYXRpb24ocHJvZ3JhbSwgaW5mby5uYW1lKSxcbiAgICAgICAgICBpbmZvKSlcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICBzdGF0cy5nZXRNYXhVbmlmb3Jtc0NvdW50ID0gZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIG0gPSAwXG4gICAgICBwcm9ncmFtTGlzdC5mb3JFYWNoKGZ1bmN0aW9uIChkZXNjKSB7XG4gICAgICAgIGlmIChkZXNjLnN0YXRzLnVuaWZvcm1zQ291bnQgPiBtKSB7XG4gICAgICAgICAgbSA9IGRlc2Muc3RhdHMudW5pZm9ybXNDb3VudFxuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgcmV0dXJuIG1cbiAgICB9XG5cbiAgICBzdGF0cy5nZXRNYXhBdHRyaWJ1dGVzQ291bnQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgbSA9IDBcbiAgICAgIHByb2dyYW1MaXN0LmZvckVhY2goZnVuY3Rpb24gKGRlc2MpIHtcbiAgICAgICAgaWYgKGRlc2Muc3RhdHMuYXR0cmlidXRlc0NvdW50ID4gbSkge1xuICAgICAgICAgIG0gPSBkZXNjLnN0YXRzLmF0dHJpYnV0ZXNDb3VudFxuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgcmV0dXJuIG1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiByZXN0b3JlU2hhZGVycyAoKSB7XG4gICAgZnJhZ1NoYWRlcnMgPSB7fVxuICAgIHZlcnRTaGFkZXJzID0ge31cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHByb2dyYW1MaXN0Lmxlbmd0aDsgKytpKSB7XG4gICAgICBsaW5rUHJvZ3JhbShwcm9ncmFtTGlzdFtpXSlcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNsZWFyOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgZGVsZXRlU2hhZGVyID0gZ2wuZGVsZXRlU2hhZGVyLmJpbmQoZ2wpXG4gICAgICB2YWx1ZXMoZnJhZ1NoYWRlcnMpLmZvckVhY2goZGVsZXRlU2hhZGVyKVxuICAgICAgZnJhZ1NoYWRlcnMgPSB7fVxuICAgICAgdmFsdWVzKHZlcnRTaGFkZXJzKS5mb3JFYWNoKGRlbGV0ZVNoYWRlcilcbiAgICAgIHZlcnRTaGFkZXJzID0ge31cblxuICAgICAgcHJvZ3JhbUxpc3QuZm9yRWFjaChmdW5jdGlvbiAoZGVzYykge1xuICAgICAgICBnbC5kZWxldGVQcm9ncmFtKGRlc2MucHJvZ3JhbSlcbiAgICAgIH0pXG4gICAgICBwcm9ncmFtTGlzdC5sZW5ndGggPSAwXG4gICAgICBwcm9ncmFtQ2FjaGUgPSB7fVxuXG4gICAgICBzdGF0cy5zaGFkZXJDb3VudCA9IDBcbiAgICB9LFxuXG4gICAgcHJvZ3JhbTogZnVuY3Rpb24gKHZlcnRJZCwgZnJhZ0lkLCBjb21tYW5kKSB7XG4gICAgICBcbiAgICAgIFxuXG4gICAgICBzdGF0cy5zaGFkZXJDb3VudCsrXG5cbiAgICAgIHZhciBjYWNoZSA9IHByb2dyYW1DYWNoZVtmcmFnSWRdXG4gICAgICBpZiAoIWNhY2hlKSB7XG4gICAgICAgIGNhY2hlID0gcHJvZ3JhbUNhY2hlW2ZyYWdJZF0gPSB7fVxuICAgICAgfVxuICAgICAgdmFyIHByb2dyYW0gPSBjYWNoZVt2ZXJ0SWRdXG4gICAgICBpZiAoIXByb2dyYW0pIHtcbiAgICAgICAgcHJvZ3JhbSA9IG5ldyBSRUdMUHJvZ3JhbShmcmFnSWQsIHZlcnRJZClcbiAgICAgICAgbGlua1Byb2dyYW0ocHJvZ3JhbSwgY29tbWFuZClcbiAgICAgICAgY2FjaGVbdmVydElkXSA9IHByb2dyYW1cbiAgICAgICAgcHJvZ3JhbUxpc3QucHVzaChwcm9ncmFtKVxuICAgICAgfVxuICAgICAgcmV0dXJuIHByb2dyYW1cbiAgICB9LFxuXG4gICAgcmVzdG9yZTogcmVzdG9yZVNoYWRlcnMsXG5cbiAgICBzaGFkZXI6IGdldFNoYWRlcixcblxuICAgIGZyYWc6IC0xLFxuICAgIHZlcnQ6IC0xXG4gIH1cbn1cbiIsIlxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBzdGF0cyAoKSB7XG4gIHJldHVybiB7XG4gICAgYnVmZmVyQ291bnQ6IDAsXG4gICAgZWxlbWVudHNDb3VudDogMCxcbiAgICBmcmFtZWJ1ZmZlckNvdW50OiAwLFxuICAgIHNoYWRlckNvdW50OiAwLFxuICAgIHRleHR1cmVDb3VudDogMCxcbiAgICBjdWJlQ291bnQ6IDAsXG4gICAgcmVuZGVyYnVmZmVyQ291bnQ6IDAsXG5cbiAgICBtYXhUZXh0dXJlVW5pdHM6IDBcbiAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjcmVhdGVTdHJpbmdTdG9yZSAoKSB7XG4gIHZhciBzdHJpbmdJZHMgPSB7Jyc6IDB9XG4gIHZhciBzdHJpbmdWYWx1ZXMgPSBbJyddXG4gIHJldHVybiB7XG4gICAgaWQ6IGZ1bmN0aW9uIChzdHIpIHtcbiAgICAgIHZhciByZXN1bHQgPSBzdHJpbmdJZHNbc3RyXVxuICAgICAgaWYgKHJlc3VsdCkge1xuICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICB9XG4gICAgICByZXN1bHQgPSBzdHJpbmdJZHNbc3RyXSA9IHN0cmluZ1ZhbHVlcy5sZW5ndGhcbiAgICAgIHN0cmluZ1ZhbHVlcy5wdXNoKHN0cilcbiAgICAgIHJldHVybiByZXN1bHRcbiAgICB9LFxuXG4gICAgc3RyOiBmdW5jdGlvbiAoaWQpIHtcbiAgICAgIHJldHVybiBzdHJpbmdWYWx1ZXNbaWRdXG4gICAgfVxuICB9XG59XG4iLCJcbnZhciBleHRlbmQgPSByZXF1aXJlKCcuL3V0aWwvZXh0ZW5kJylcbnZhciB2YWx1ZXMgPSByZXF1aXJlKCcuL3V0aWwvdmFsdWVzJylcbnZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL3V0aWwvaXMtdHlwZWQtYXJyYXknKVxudmFyIGlzTkRBcnJheUxpa2UgPSByZXF1aXJlKCcuL3V0aWwvaXMtbmRhcnJheScpXG52YXIgcG9vbCA9IHJlcXVpcmUoJy4vdXRpbC9wb29sJylcbnZhciBjb252ZXJ0VG9IYWxmRmxvYXQgPSByZXF1aXJlKCcuL3V0aWwvdG8taGFsZi1mbG9hdCcpXG52YXIgaXNBcnJheUxpa2UgPSByZXF1aXJlKCcuL3V0aWwvaXMtYXJyYXktbGlrZScpXG52YXIgZmxhdHRlblV0aWxzID0gcmVxdWlyZSgnLi91dGlsL2ZsYXR0ZW4nKVxuXG52YXIgZHR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvYXJyYXl0eXBlcy5qc29uJylcbnZhciBhcnJheVR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvYXJyYXl0eXBlcy5qc29uJylcblxudmFyIEdMX0NPTVBSRVNTRURfVEVYVFVSRV9GT1JNQVRTID0gMHg4NkEzXG5cbnZhciBHTF9URVhUVVJFXzJEID0gMHgwREUxXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUCA9IDB4ODUxM1xudmFyIEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCA9IDB4ODUxNVxuXG52YXIgR0xfUkdCQSA9IDB4MTkwOFxudmFyIEdMX0FMUEhBID0gMHgxOTA2XG52YXIgR0xfUkdCID0gMHgxOTA3XG52YXIgR0xfTFVNSU5BTkNFID0gMHgxOTA5XG52YXIgR0xfTFVNSU5BTkNFX0FMUEhBID0gMHgxOTBBXG5cbnZhciBHTF9SR0JBNCA9IDB4ODA1NlxudmFyIEdMX1JHQjVfQTEgPSAweDgwNTdcbnZhciBHTF9SR0I1NjUgPSAweDhENjJcblxudmFyIEdMX1VOU0lHTkVEX1NIT1JUXzRfNF80XzQgPSAweDgwMzNcbnZhciBHTF9VTlNJR05FRF9TSE9SVF81XzVfNV8xID0gMHg4MDM0XG52YXIgR0xfVU5TSUdORURfU0hPUlRfNV82XzUgPSAweDgzNjNcbnZhciBHTF9VTlNJR05FRF9JTlRfMjRfOF9XRUJHTCA9IDB4ODRGQVxuXG52YXIgR0xfREVQVEhfQ09NUE9ORU5UID0gMHgxOTAyXG52YXIgR0xfREVQVEhfU1RFTkNJTCA9IDB4ODRGOVxuXG52YXIgR0xfU1JHQl9FWFQgPSAweDhDNDBcbnZhciBHTF9TUkdCX0FMUEhBX0VYVCA9IDB4OEM0MlxuXG52YXIgR0xfSEFMRl9GTE9BVF9PRVMgPSAweDhENjFcblxudmFyIEdMX0NPTVBSRVNTRURfUkdCX1MzVENfRFhUMV9FWFQgPSAweDgzRjBcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQxX0VYVCA9IDB4ODNGMVxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDNfRVhUID0gMHg4M0YyXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUNV9FWFQgPSAweDgzRjNcblxudmFyIEdMX0NPTVBSRVNTRURfUkdCX0FUQ19XRUJHTCA9IDB4OEM5MlxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9BVENfRVhQTElDSVRfQUxQSEFfV0VCR0wgPSAweDhDOTNcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfQVRDX0lOVEVSUE9MQVRFRF9BTFBIQV9XRUJHTCA9IDB4ODdFRVxuXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfUFZSVENfNEJQUFYxX0lNRyA9IDB4OEMwMFxudmFyIEdMX0NPTVBSRVNTRURfUkdCX1BWUlRDXzJCUFBWMV9JTUcgPSAweDhDMDFcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUFZSVENfNEJQUFYxX0lNRyA9IDB4OEMwMlxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9QVlJUQ18yQlBQVjFfSU1HID0gMHg4QzAzXG5cbnZhciBHTF9DT01QUkVTU0VEX1JHQl9FVEMxX1dFQkdMID0gMHg4RDY0XG5cbnZhciBHTF9VTlNJR05FRF9CWVRFID0gMHgxNDAxXG52YXIgR0xfVU5TSUdORURfU0hPUlQgPSAweDE0MDNcbnZhciBHTF9VTlNJR05FRF9JTlQgPSAweDE0MDVcbnZhciBHTF9GTE9BVCA9IDB4MTQwNlxuXG52YXIgR0xfVEVYVFVSRV9XUkFQX1MgPSAweDI4MDJcbnZhciBHTF9URVhUVVJFX1dSQVBfVCA9IDB4MjgwM1xuXG52YXIgR0xfUkVQRUFUID0gMHgyOTAxXG52YXIgR0xfQ0xBTVBfVE9fRURHRSA9IDB4ODEyRlxudmFyIEdMX01JUlJPUkVEX1JFUEVBVCA9IDB4ODM3MFxuXG52YXIgR0xfVEVYVFVSRV9NQUdfRklMVEVSID0gMHgyODAwXG52YXIgR0xfVEVYVFVSRV9NSU5fRklMVEVSID0gMHgyODAxXG5cbnZhciBHTF9ORUFSRVNUID0gMHgyNjAwXG52YXIgR0xfTElORUFSID0gMHgyNjAxXG52YXIgR0xfTkVBUkVTVF9NSVBNQVBfTkVBUkVTVCA9IDB4MjcwMFxudmFyIEdMX0xJTkVBUl9NSVBNQVBfTkVBUkVTVCA9IDB4MjcwMVxudmFyIEdMX05FQVJFU1RfTUlQTUFQX0xJTkVBUiA9IDB4MjcwMlxudmFyIEdMX0xJTkVBUl9NSVBNQVBfTElORUFSID0gMHgyNzAzXG5cbnZhciBHTF9HRU5FUkFURV9NSVBNQVBfSElOVCA9IDB4ODE5MlxudmFyIEdMX0RPTlRfQ0FSRSA9IDB4MTEwMFxudmFyIEdMX0ZBU1RFU1QgPSAweDExMDFcbnZhciBHTF9OSUNFU1QgPSAweDExMDJcblxudmFyIEdMX1RFWFRVUkVfTUFYX0FOSVNPVFJPUFlfRVhUID0gMHg4NEZFXG5cbnZhciBHTF9VTlBBQ0tfQUxJR05NRU5UID0gMHgwQ0Y1XG52YXIgR0xfVU5QQUNLX0ZMSVBfWV9XRUJHTCA9IDB4OTI0MFxudmFyIEdMX1VOUEFDS19QUkVNVUxUSVBMWV9BTFBIQV9XRUJHTCA9IDB4OTI0MVxudmFyIEdMX1VOUEFDS19DT0xPUlNQQUNFX0NPTlZFUlNJT05fV0VCR0wgPSAweDkyNDNcblxudmFyIEdMX0JST1dTRVJfREVGQVVMVF9XRUJHTCA9IDB4OTI0NFxuXG52YXIgR0xfVEVYVFVSRTAgPSAweDg0QzBcblxudmFyIE1JUE1BUF9GSUxURVJTID0gW1xuICBHTF9ORUFSRVNUX01JUE1BUF9ORUFSRVNULFxuICBHTF9ORUFSRVNUX01JUE1BUF9MSU5FQVIsXG4gIEdMX0xJTkVBUl9NSVBNQVBfTkVBUkVTVCxcbiAgR0xfTElORUFSX01JUE1BUF9MSU5FQVJcbl1cblxudmFyIENIQU5ORUxTX0ZPUk1BVCA9IFtcbiAgMCxcbiAgR0xfTFVNSU5BTkNFLFxuICBHTF9MVU1JTkFOQ0VfQUxQSEEsXG4gIEdMX1JHQixcbiAgR0xfUkdCQVxuXVxuXG52YXIgRk9STUFUX0NIQU5ORUxTID0ge31cbkZPUk1BVF9DSEFOTkVMU1tHTF9MVU1JTkFOQ0VdID1cbkZPUk1BVF9DSEFOTkVMU1tHTF9BTFBIQV0gPVxuRk9STUFUX0NIQU5ORUxTW0dMX0RFUFRIX0NPTVBPTkVOVF0gPSAxXG5GT1JNQVRfQ0hBTk5FTFNbR0xfREVQVEhfU1RFTkNJTF0gPVxuRk9STUFUX0NIQU5ORUxTW0dMX0xVTUlOQU5DRV9BTFBIQV0gPSAyXG5GT1JNQVRfQ0hBTk5FTFNbR0xfUkdCXSA9XG5GT1JNQVRfQ0hBTk5FTFNbR0xfU1JHQl9FWFRdID0gM1xuRk9STUFUX0NIQU5ORUxTW0dMX1JHQkFdID1cbkZPUk1BVF9DSEFOTkVMU1tHTF9TUkdCX0FMUEhBX0VYVF0gPSA0XG5cbnZhciBmb3JtYXRUeXBlcyA9IHt9XG5mb3JtYXRUeXBlc1tHTF9SR0JBNF0gPSBHTF9VTlNJR05FRF9TSE9SVF80XzRfNF80XG5mb3JtYXRUeXBlc1tHTF9SR0I1NjVdID0gR0xfVU5TSUdORURfU0hPUlRfNV82XzVcbmZvcm1hdFR5cGVzW0dMX1JHQjVfQTFdID0gR0xfVU5TSUdORURfU0hPUlRfNV81XzVfMVxuZm9ybWF0VHlwZXNbR0xfREVQVEhfQ09NUE9ORU5UXSA9IEdMX1VOU0lHTkVEX0lOVFxuZm9ybWF0VHlwZXNbR0xfREVQVEhfU1RFTkNJTF0gPSBHTF9VTlNJR05FRF9JTlRfMjRfOF9XRUJHTFxuXG5mdW5jdGlvbiBvYmplY3ROYW1lIChzdHIpIHtcbiAgcmV0dXJuICdbb2JqZWN0ICcgKyBzdHIgKyAnXSdcbn1cblxudmFyIENBTlZBU19DTEFTUyA9IG9iamVjdE5hbWUoJ0hUTUxDYW52YXNFbGVtZW50JylcbnZhciBDT05URVhUMkRfQ0xBU1MgPSBvYmplY3ROYW1lKCdDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQnKVxudmFyIElNQUdFX0NMQVNTID0gb2JqZWN0TmFtZSgnSFRNTEltYWdlRWxlbWVudCcpXG52YXIgVklERU9fQ0xBU1MgPSBvYmplY3ROYW1lKCdIVE1MVmlkZW9FbGVtZW50JylcblxudmFyIFBJWEVMX0NMQVNTRVMgPSBPYmplY3Qua2V5cyhkdHlwZXMpLmNvbmNhdChbXG4gIENBTlZBU19DTEFTUyxcbiAgQ09OVEVYVDJEX0NMQVNTLFxuICBJTUFHRV9DTEFTUyxcbiAgVklERU9fQ0xBU1Ncbl0pXG5cbi8vIGZvciBldmVyeSB0ZXh0dXJlIHR5cGUsIHN0b3JlXG4vLyB0aGUgc2l6ZSBpbiBieXRlcy5cbnZhciBUWVBFX1NJWkVTID0gW11cblRZUEVfU0laRVNbR0xfVU5TSUdORURfQllURV0gPSAxXG5UWVBFX1NJWkVTW0dMX0ZMT0FUXSA9IDRcblRZUEVfU0laRVNbR0xfSEFMRl9GTE9BVF9PRVNdID0gMlxuXG5UWVBFX1NJWkVTW0dMX1VOU0lHTkVEX1NIT1JUXSA9IDJcblRZUEVfU0laRVNbR0xfVU5TSUdORURfSU5UXSA9IDRcblxudmFyIEZPUk1BVF9TSVpFU19TUEVDSUFMID0gW11cbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX1JHQkE0XSA9IDJcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX1JHQjVfQTFdID0gMlxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfUkdCNTY1XSA9IDJcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0RFUFRIX1NURU5DSUxdID0gNFxuXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQl9TM1RDX0RYVDFfRVhUXSA9IDAuNVxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUMV9FWFRdID0gMC41XG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQzX0VYVF0gPSAxXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQ1X0VYVF0gPSAxXG5cbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCX0FUQ19XRUJHTF0gPSAwLjVcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCQV9BVENfRVhQTElDSVRfQUxQSEFfV0VCR0xdID0gMVxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19JTlRFUlBPTEFURURfQUxQSEFfV0VCR0xdID0gMVxuXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ180QlBQVjFfSU1HXSA9IDAuNVxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JfUFZSVENfMkJQUFYxX0lNR10gPSAwLjI1XG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQkFfUFZSVENfNEJQUFYxX0lNR10gPSAwLjVcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCQV9QVlJUQ18yQlBQVjFfSU1HXSA9IDAuMjVcblxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JfRVRDMV9XRUJHTF0gPSAwLjVcblxuZnVuY3Rpb24gaXNOdW1lcmljQXJyYXkgKGFycikge1xuICByZXR1cm4gKFxuICAgIEFycmF5LmlzQXJyYXkoYXJyKSAmJlxuICAgIChhcnIubGVuZ3RoID09PSAwIHx8XG4gICAgdHlwZW9mIGFyclswXSA9PT0gJ251bWJlcicpKVxufVxuXG5mdW5jdGlvbiBpc1JlY3RBcnJheSAoYXJyKSB7XG4gIGlmICghQXJyYXkuaXNBcnJheShhcnIpKSB7XG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cbiAgdmFyIHdpZHRoID0gYXJyLmxlbmd0aFxuICBpZiAod2lkdGggPT09IDAgfHwgIWlzQXJyYXlMaWtlKGFyclswXSkpIHtcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxuICByZXR1cm4gdHJ1ZVxufVxuXG5mdW5jdGlvbiBjbGFzc1N0cmluZyAoeCkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHgpXG59XG5cbmZ1bmN0aW9uIGlzQ2FudmFzRWxlbWVudCAob2JqZWN0KSB7XG4gIHJldHVybiBjbGFzc1N0cmluZyhvYmplY3QpID09PSBDQU5WQVNfQ0xBU1Ncbn1cblxuZnVuY3Rpb24gaXNDb250ZXh0MkQgKG9iamVjdCkge1xuICByZXR1cm4gY2xhc3NTdHJpbmcob2JqZWN0KSA9PT0gQ09OVEVYVDJEX0NMQVNTXG59XG5cbmZ1bmN0aW9uIGlzSW1hZ2VFbGVtZW50IChvYmplY3QpIHtcbiAgcmV0dXJuIGNsYXNzU3RyaW5nKG9iamVjdCkgPT09IElNQUdFX0NMQVNTXG59XG5cbmZ1bmN0aW9uIGlzVmlkZW9FbGVtZW50IChvYmplY3QpIHtcbiAgcmV0dXJuIGNsYXNzU3RyaW5nKG9iamVjdCkgPT09IFZJREVPX0NMQVNTXG59XG5cbmZ1bmN0aW9uIGlzUGl4ZWxEYXRhIChvYmplY3QpIHtcbiAgaWYgKCFvYmplY3QpIHtcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxuICB2YXIgY2xhc3NOYW1lID0gY2xhc3NTdHJpbmcob2JqZWN0KVxuICBpZiAoUElYRUxfQ0xBU1NFUy5pbmRleE9mKGNsYXNzTmFtZSkgPj0gMCkge1xuICAgIHJldHVybiB0cnVlXG4gIH1cbiAgcmV0dXJuIChcbiAgICBpc051bWVyaWNBcnJheShvYmplY3QpIHx8XG4gICAgaXNSZWN0QXJyYXkob2JqZWN0KSB8fFxuICAgIGlzTkRBcnJheUxpa2Uob2JqZWN0KSlcbn1cblxuZnVuY3Rpb24gdHlwZWRBcnJheUNvZGUgKGRhdGEpIHtcbiAgcmV0dXJuIGFycmF5VHlwZXNbT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGRhdGEpXSB8IDBcbn1cblxuZnVuY3Rpb24gY29udmVydERhdGEgKHJlc3VsdCwgZGF0YSkge1xuICB2YXIgbiA9IGRhdGEubGVuZ3RoXG4gIHN3aXRjaCAocmVzdWx0LnR5cGUpIHtcbiAgICBjYXNlIEdMX1VOU0lHTkVEX0JZVEU6XG4gICAgY2FzZSBHTF9VTlNJR05FRF9TSE9SVDpcbiAgICBjYXNlIEdMX1VOU0lHTkVEX0lOVDpcbiAgICBjYXNlIEdMX0ZMT0FUOlxuICAgICAgdmFyIGNvbnZlcnRlZCA9IHBvb2wuYWxsb2NUeXBlKHJlc3VsdC50eXBlLCBuKVxuICAgICAgY29udmVydGVkLnNldChkYXRhKVxuICAgICAgcmVzdWx0LmRhdGEgPSBjb252ZXJ0ZWRcbiAgICAgIGJyZWFrXG5cbiAgICBjYXNlIEdMX0hBTEZfRkxPQVRfT0VTOlxuICAgICAgcmVzdWx0LmRhdGEgPSBjb252ZXJ0VG9IYWxmRmxvYXQoZGF0YSlcbiAgICAgIGJyZWFrXG5cbiAgICBkZWZhdWx0OlxuICAgICAgXG4gIH1cbn1cblxuZnVuY3Rpb24gcHJlQ29udmVydCAoaW1hZ2UsIG4pIHtcbiAgcmV0dXJuIHBvb2wuYWxsb2NUeXBlKFxuICAgIGltYWdlLnR5cGUgPT09IEdMX0hBTEZfRkxPQVRfT0VTXG4gICAgICA/IEdMX0ZMT0FUXG4gICAgICA6IGltYWdlLnR5cGUsIG4pXG59XG5cbmZ1bmN0aW9uIHBvc3RDb252ZXJ0IChpbWFnZSwgZGF0YSkge1xuICBpZiAoaW1hZ2UudHlwZSA9PT0gR0xfSEFMRl9GTE9BVF9PRVMpIHtcbiAgICBpbWFnZS5kYXRhID0gY29udmVydFRvSGFsZkZsb2F0KGRhdGEpXG4gICAgcG9vbC5mcmVlVHlwZShkYXRhKVxuICB9IGVsc2Uge1xuICAgIGltYWdlLmRhdGEgPSBkYXRhXG4gIH1cbn1cblxuZnVuY3Rpb24gdHJhbnNwb3NlRGF0YSAoaW1hZ2UsIGFycmF5LCBzdHJpZGVYLCBzdHJpZGVZLCBzdHJpZGVDLCBvZmZzZXQpIHtcbiAgdmFyIHcgPSBpbWFnZS53aWR0aFxuICB2YXIgaCA9IGltYWdlLmhlaWdodFxuICB2YXIgYyA9IGltYWdlLmNoYW5uZWxzXG4gIHZhciBuID0gdyAqIGggKiBjXG4gIHZhciBkYXRhID0gcHJlQ29udmVydChpbWFnZSwgbilcblxuICB2YXIgcCA9IDBcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBoOyArK2kpIHtcbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IHc7ICsraikge1xuICAgICAgZm9yICh2YXIgayA9IDA7IGsgPCBjOyArK2spIHtcbiAgICAgICAgZGF0YVtwKytdID0gYXJyYXlbc3RyaWRlWCAqIGogKyBzdHJpZGVZICogaSArIHN0cmlkZUMgKiBrICsgb2Zmc2V0XVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHBvc3RDb252ZXJ0KGltYWdlLCBkYXRhKVxufVxuXG5mdW5jdGlvbiBnZXRUZXh0dXJlU2l6ZSAoZm9ybWF0LCB0eXBlLCB3aWR0aCwgaGVpZ2h0LCBpc01pcG1hcCwgaXNDdWJlKSB7XG4gIHZhciBzXG4gIGlmICh0eXBlb2YgRk9STUFUX1NJWkVTX1NQRUNJQUxbZm9ybWF0XSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAvLyB3ZSBoYXZlIGEgc3BlY2lhbCBhcnJheSBmb3IgZGVhbGluZyB3aXRoIHdlaXJkIGNvbG9yIGZvcm1hdHMgc3VjaCBhcyBSR0I1QTFcbiAgICBzID0gRk9STUFUX1NJWkVTX1NQRUNJQUxbZm9ybWF0XVxuICB9IGVsc2Uge1xuICAgIHMgPSBGT1JNQVRfQ0hBTk5FTFNbZm9ybWF0XSAqIFRZUEVfU0laRVNbdHlwZV1cbiAgfVxuXG4gIGlmIChpc0N1YmUpIHtcbiAgICBzICo9IDZcbiAgfVxuXG4gIGlmIChpc01pcG1hcCkge1xuICAgIC8vIGNvbXB1dGUgdGhlIHRvdGFsIHNpemUgb2YgYWxsIHRoZSBtaXBtYXBzLlxuICAgIHZhciB0b3RhbCA9IDBcblxuICAgIHZhciB3ID0gd2lkdGhcbiAgICB3aGlsZSAodyA+PSAxKSB7XG4gICAgICAvLyB3ZSBjYW4gb25seSB1c2UgbWlwbWFwcyBvbiBhIHNxdWFyZSBpbWFnZSxcbiAgICAgIC8vIHNvIHdlIGNhbiBzaW1wbHkgdXNlIHRoZSB3aWR0aCBhbmQgaWdub3JlIHRoZSBoZWlnaHQ6XG4gICAgICB0b3RhbCArPSBzICogdyAqIHdcbiAgICAgIHcgLz0gMlxuICAgIH1cbiAgICByZXR1cm4gdG90YWxcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gcyAqIHdpZHRoICogaGVpZ2h0XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjcmVhdGVUZXh0dXJlU2V0IChcbiAgZ2wsIGV4dGVuc2lvbnMsIGxpbWl0cywgcmVnbFBvbGwsIGNvbnRleHRTdGF0ZSwgc3RhdHMsIGNvbmZpZykge1xuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIEluaXRpYWxpemUgY29uc3RhbnRzIGFuZCBwYXJhbWV0ZXIgdGFibGVzIGhlcmVcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICB2YXIgbWlwbWFwSGludCA9IHtcbiAgICBcImRvbid0IGNhcmVcIjogR0xfRE9OVF9DQVJFLFxuICAgICdkb250IGNhcmUnOiBHTF9ET05UX0NBUkUsXG4gICAgJ25pY2UnOiBHTF9OSUNFU1QsXG4gICAgJ2Zhc3QnOiBHTF9GQVNURVNUXG4gIH1cblxuICB2YXIgd3JhcE1vZGVzID0ge1xuICAgICdyZXBlYXQnOiBHTF9SRVBFQVQsXG4gICAgJ2NsYW1wJzogR0xfQ0xBTVBfVE9fRURHRSxcbiAgICAnbWlycm9yJzogR0xfTUlSUk9SRURfUkVQRUFUXG4gIH1cblxuICB2YXIgbWFnRmlsdGVycyA9IHtcbiAgICAnbmVhcmVzdCc6IEdMX05FQVJFU1QsXG4gICAgJ2xpbmVhcic6IEdMX0xJTkVBUlxuICB9XG5cbiAgdmFyIG1pbkZpbHRlcnMgPSBleHRlbmQoe1xuICAgICdtaXBtYXAnOiBHTF9MSU5FQVJfTUlQTUFQX0xJTkVBUixcbiAgICAnbmVhcmVzdCBtaXBtYXAgbmVhcmVzdCc6IEdMX05FQVJFU1RfTUlQTUFQX05FQVJFU1QsXG4gICAgJ2xpbmVhciBtaXBtYXAgbmVhcmVzdCc6IEdMX0xJTkVBUl9NSVBNQVBfTkVBUkVTVCxcbiAgICAnbmVhcmVzdCBtaXBtYXAgbGluZWFyJzogR0xfTkVBUkVTVF9NSVBNQVBfTElORUFSLFxuICAgICdsaW5lYXIgbWlwbWFwIGxpbmVhcic6IEdMX0xJTkVBUl9NSVBNQVBfTElORUFSXG4gIH0sIG1hZ0ZpbHRlcnMpXG5cbiAgdmFyIGNvbG9yU3BhY2UgPSB7XG4gICAgJ25vbmUnOiAwLFxuICAgICdicm93c2VyJzogR0xfQlJPV1NFUl9ERUZBVUxUX1dFQkdMXG4gIH1cblxuICB2YXIgdGV4dHVyZVR5cGVzID0ge1xuICAgICd1aW50OCc6IEdMX1VOU0lHTkVEX0JZVEUsXG4gICAgJ3JnYmE0JzogR0xfVU5TSUdORURfU0hPUlRfNF80XzRfNCxcbiAgICAncmdiNTY1JzogR0xfVU5TSUdORURfU0hPUlRfNV82XzUsXG4gICAgJ3JnYjUgYTEnOiBHTF9VTlNJR05FRF9TSE9SVF81XzVfNV8xXG4gIH1cblxuICB2YXIgdGV4dHVyZUZvcm1hdHMgPSB7XG4gICAgJ2FscGhhJzogR0xfQUxQSEEsXG4gICAgJ2x1bWluYW5jZSc6IEdMX0xVTUlOQU5DRSxcbiAgICAnbHVtaW5hbmNlIGFscGhhJzogR0xfTFVNSU5BTkNFX0FMUEhBLFxuICAgICdyZ2InOiBHTF9SR0IsXG4gICAgJ3JnYmEnOiBHTF9SR0JBLFxuICAgICdyZ2JhNCc6IEdMX1JHQkE0LFxuICAgICdyZ2I1IGExJzogR0xfUkdCNV9BMSxcbiAgICAncmdiNTY1JzogR0xfUkdCNTY1XG4gIH1cblxuICB2YXIgY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzID0ge31cblxuICBpZiAoZXh0ZW5zaW9ucy5leHRfc3JnYikge1xuICAgIHRleHR1cmVGb3JtYXRzLnNyZ2IgPSBHTF9TUkdCX0VYVFxuICAgIHRleHR1cmVGb3JtYXRzLnNyZ2JhID0gR0xfU1JHQl9BTFBIQV9FWFRcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLm9lc190ZXh0dXJlX2Zsb2F0KSB7XG4gICAgdGV4dHVyZVR5cGVzLmZsb2F0MzIgPSB0ZXh0dXJlVHlwZXMuZmxvYXQgPSBHTF9GTE9BVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMub2VzX3RleHR1cmVfaGFsZl9mbG9hdCkge1xuICAgIHRleHR1cmVUeXBlc1snZmxvYXQxNiddID0gdGV4dHVyZVR5cGVzWydoYWxmIGZsb2F0J10gPSBHTF9IQUxGX0ZMT0FUX09FU1xuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfZGVwdGhfdGV4dHVyZSkge1xuICAgIGV4dGVuZCh0ZXh0dXJlRm9ybWF0cywge1xuICAgICAgJ2RlcHRoJzogR0xfREVQVEhfQ09NUE9ORU5ULFxuICAgICAgJ2RlcHRoIHN0ZW5jaWwnOiBHTF9ERVBUSF9TVEVOQ0lMXG4gICAgfSlcblxuICAgIGV4dGVuZCh0ZXh0dXJlVHlwZXMsIHtcbiAgICAgICd1aW50MTYnOiBHTF9VTlNJR05FRF9TSE9SVCxcbiAgICAgICd1aW50MzInOiBHTF9VTlNJR05FRF9JTlQsXG4gICAgICAnZGVwdGggc3RlbmNpbCc6IEdMX1VOU0lHTkVEX0lOVF8yNF84X1dFQkdMXG4gICAgfSlcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9zM3RjKSB7XG4gICAgZXh0ZW5kKGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cywge1xuICAgICAgJ3JnYiBzM3RjIGR4dDEnOiBHTF9DT01QUkVTU0VEX1JHQl9TM1RDX0RYVDFfRVhULFxuICAgICAgJ3JnYmEgczN0YyBkeHQxJzogR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUMV9FWFQsXG4gICAgICAncmdiYSBzM3RjIGR4dDMnOiBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQzX0VYVCxcbiAgICAgICdyZ2JhIHMzdGMgZHh0NSc6IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDVfRVhUXG4gICAgfSlcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9hdGMpIHtcbiAgICBleHRlbmQoY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzLCB7XG4gICAgICAncmdiIGF0Yyc6IEdMX0NPTVBSRVNTRURfUkdCX0FUQ19XRUJHTCxcbiAgICAgICdyZ2JhIGF0YyBleHBsaWNpdCBhbHBoYSc6IEdMX0NPTVBSRVNTRURfUkdCQV9BVENfRVhQTElDSVRfQUxQSEFfV0VCR0wsXG4gICAgICAncmdiYSBhdGMgaW50ZXJwb2xhdGVkIGFscGhhJzogR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19JTlRFUlBPTEFURURfQUxQSEFfV0VCR0xcbiAgICB9KVxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29tcHJlc3NlZF90ZXh0dXJlX3B2cnRjKSB7XG4gICAgZXh0ZW5kKGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cywge1xuICAgICAgJ3JnYiBwdnJ0YyA0YnBwdjEnOiBHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ180QlBQVjFfSU1HLFxuICAgICAgJ3JnYiBwdnJ0YyAyYnBwdjEnOiBHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ18yQlBQVjFfSU1HLFxuICAgICAgJ3JnYmEgcHZydGMgNGJwcHYxJzogR0xfQ09NUFJFU1NFRF9SR0JBX1BWUlRDXzRCUFBWMV9JTUcsXG4gICAgICAncmdiYSBwdnJ0YyAyYnBwdjEnOiBHTF9DT01QUkVTU0VEX1JHQkFfUFZSVENfMkJQUFYxX0lNR1xuICAgIH0pXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb21wcmVzc2VkX3RleHR1cmVfZXRjMSkge1xuICAgIGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0c1sncmdiIGV0YzEnXSA9IEdMX0NPTVBSRVNTRURfUkdCX0VUQzFfV0VCR0xcbiAgfVxuXG4gIC8vIENvcHkgb3ZlciBhbGwgdGV4dHVyZSBmb3JtYXRzXG4gIHZhciBzdXBwb3J0ZWRDb21wcmVzc2VkRm9ybWF0cyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKFxuICAgIGdsLmdldFBhcmFtZXRlcihHTF9DT01QUkVTU0VEX1RFWFRVUkVfRk9STUFUUykpXG4gIE9iamVjdC5rZXlzKGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cykuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgIHZhciBmb3JtYXQgPSBjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHNbbmFtZV1cbiAgICBpZiAoc3VwcG9ydGVkQ29tcHJlc3NlZEZvcm1hdHMuaW5kZXhPZihmb3JtYXQpID49IDApIHtcbiAgICAgIHRleHR1cmVGb3JtYXRzW25hbWVdID0gZm9ybWF0XG4gICAgfVxuICB9KVxuXG4gIHZhciBzdXBwb3J0ZWRGb3JtYXRzID0gT2JqZWN0LmtleXModGV4dHVyZUZvcm1hdHMpXG4gIGxpbWl0cy50ZXh0dXJlRm9ybWF0cyA9IHN1cHBvcnRlZEZvcm1hdHNcblxuICAvLyBhc3NvY2lhdGUgd2l0aCBldmVyeSBmb3JtYXQgc3RyaW5nIGl0c1xuICAvLyBjb3JyZXNwb25kaW5nIEdMLXZhbHVlLlxuICB2YXIgdGV4dHVyZUZvcm1hdHNJbnZlcnQgPSBbXVxuICBPYmplY3Qua2V5cyh0ZXh0dXJlRm9ybWF0cykuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgdmFyIHZhbCA9IHRleHR1cmVGb3JtYXRzW2tleV1cbiAgICB0ZXh0dXJlRm9ybWF0c0ludmVydFt2YWxdID0ga2V5XG4gIH0pXG5cbiAgLy8gYXNzb2NpYXRlIHdpdGggZXZlcnkgdHlwZSBzdHJpbmcgaXRzXG4gIC8vIGNvcnJlc3BvbmRpbmcgR0wtdmFsdWUuXG4gIHZhciB0ZXh0dXJlVHlwZXNJbnZlcnQgPSBbXVxuICBPYmplY3Qua2V5cyh0ZXh0dXJlVHlwZXMpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgIHZhciB2YWwgPSB0ZXh0dXJlVHlwZXNba2V5XVxuICAgIHRleHR1cmVUeXBlc0ludmVydFt2YWxdID0ga2V5XG4gIH0pXG5cbiAgdmFyIG1hZ0ZpbHRlcnNJbnZlcnQgPSBbXVxuICBPYmplY3Qua2V5cyhtYWdGaWx0ZXJzKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICB2YXIgdmFsID0gbWFnRmlsdGVyc1trZXldXG4gICAgbWFnRmlsdGVyc0ludmVydFt2YWxdID0ga2V5XG4gIH0pXG5cbiAgdmFyIG1pbkZpbHRlcnNJbnZlcnQgPSBbXVxuICBPYmplY3Qua2V5cyhtaW5GaWx0ZXJzKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICB2YXIgdmFsID0gbWluRmlsdGVyc1trZXldXG4gICAgbWluRmlsdGVyc0ludmVydFt2YWxdID0ga2V5XG4gIH0pXG5cbiAgdmFyIHdyYXBNb2Rlc0ludmVydCA9IFtdXG4gIE9iamVjdC5rZXlzKHdyYXBNb2RlcykuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgdmFyIHZhbCA9IHdyYXBNb2Rlc1trZXldXG4gICAgd3JhcE1vZGVzSW52ZXJ0W3ZhbF0gPSBrZXlcbiAgfSlcblxuICAvLyBjb2xvckZvcm1hdHNbXSBnaXZlcyB0aGUgZm9ybWF0IChjaGFubmVscykgYXNzb2NpYXRlZCB0byBhblxuICAvLyBpbnRlcm5hbGZvcm1hdFxuICB2YXIgY29sb3JGb3JtYXRzID0gc3VwcG9ydGVkRm9ybWF0cy5yZWR1Y2UoZnVuY3Rpb24gKGNvbG9yLCBrZXkpIHtcbiAgICB2YXIgZ2xlbnVtID0gdGV4dHVyZUZvcm1hdHNba2V5XVxuICAgIGlmIChnbGVudW0gPT09IEdMX0xVTUlOQU5DRSB8fFxuICAgICAgICBnbGVudW0gPT09IEdMX0FMUEhBIHx8XG4gICAgICAgIGdsZW51bSA9PT0gR0xfTFVNSU5BTkNFIHx8XG4gICAgICAgIGdsZW51bSA9PT0gR0xfTFVNSU5BTkNFX0FMUEhBIHx8XG4gICAgICAgIGdsZW51bSA9PT0gR0xfREVQVEhfQ09NUE9ORU5UIHx8XG4gICAgICAgIGdsZW51bSA9PT0gR0xfREVQVEhfU1RFTkNJTCkge1xuICAgICAgY29sb3JbZ2xlbnVtXSA9IGdsZW51bVxuICAgIH0gZWxzZSBpZiAoZ2xlbnVtID09PSBHTF9SR0I1X0ExIHx8IGtleS5pbmRleE9mKCdyZ2JhJykgPj0gMCkge1xuICAgICAgY29sb3JbZ2xlbnVtXSA9IEdMX1JHQkFcbiAgICB9IGVsc2Uge1xuICAgICAgY29sb3JbZ2xlbnVtXSA9IEdMX1JHQlxuICAgIH1cbiAgICByZXR1cm4gY29sb3JcbiAgfSwge30pXG5cbiAgZnVuY3Rpb24gVGV4RmxhZ3MgKCkge1xuICAgIC8vIGZvcm1hdCBpbmZvXG4gICAgdGhpcy5pbnRlcm5hbGZvcm1hdCA9IEdMX1JHQkFcbiAgICB0aGlzLmZvcm1hdCA9IEdMX1JHQkFcbiAgICB0aGlzLnR5cGUgPSBHTF9VTlNJR05FRF9CWVRFXG4gICAgdGhpcy5jb21wcmVzc2VkID0gZmFsc2VcblxuICAgIC8vIHBpeGVsIHN0b3JhZ2VcbiAgICB0aGlzLnByZW11bHRpcGx5QWxwaGEgPSBmYWxzZVxuICAgIHRoaXMuZmxpcFkgPSBmYWxzZVxuICAgIHRoaXMudW5wYWNrQWxpZ25tZW50ID0gMVxuICAgIHRoaXMuY29sb3JTcGFjZSA9IDBcblxuICAgIC8vIHNoYXBlIGluZm9cbiAgICB0aGlzLndpZHRoID0gMFxuICAgIHRoaXMuaGVpZ2h0ID0gMFxuICAgIHRoaXMuY2hhbm5lbHMgPSAwXG4gIH1cblxuICBmdW5jdGlvbiBjb3B5RmxhZ3MgKHJlc3VsdCwgb3RoZXIpIHtcbiAgICByZXN1bHQuaW50ZXJuYWxmb3JtYXQgPSBvdGhlci5pbnRlcm5hbGZvcm1hdFxuICAgIHJlc3VsdC5mb3JtYXQgPSBvdGhlci5mb3JtYXRcbiAgICByZXN1bHQudHlwZSA9IG90aGVyLnR5cGVcbiAgICByZXN1bHQuY29tcHJlc3NlZCA9IG90aGVyLmNvbXByZXNzZWRcblxuICAgIHJlc3VsdC5wcmVtdWx0aXBseUFscGhhID0gb3RoZXIucHJlbXVsdGlwbHlBbHBoYVxuICAgIHJlc3VsdC5mbGlwWSA9IG90aGVyLmZsaXBZXG4gICAgcmVzdWx0LnVucGFja0FsaWdubWVudCA9IG90aGVyLnVucGFja0FsaWdubWVudFxuICAgIHJlc3VsdC5jb2xvclNwYWNlID0gb3RoZXIuY29sb3JTcGFjZVxuXG4gICAgcmVzdWx0LndpZHRoID0gb3RoZXIud2lkdGhcbiAgICByZXN1bHQuaGVpZ2h0ID0gb3RoZXIuaGVpZ2h0XG4gICAgcmVzdWx0LmNoYW5uZWxzID0gb3RoZXIuY2hhbm5lbHNcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlRmxhZ3MgKGZsYWdzLCBvcHRpb25zKSB7XG4gICAgaWYgKHR5cGVvZiBvcHRpb25zICE9PSAnb2JqZWN0JyB8fCAhb3B0aW9ucykge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgaWYgKCdwcmVtdWx0aXBseUFscGhhJyBpbiBvcHRpb25zKSB7XG4gICAgICBcbiAgICAgIGZsYWdzLnByZW11bHRpcGx5QWxwaGEgPSBvcHRpb25zLnByZW11bHRpcGx5QWxwaGFcbiAgICB9XG5cbiAgICBpZiAoJ2ZsaXBZJyBpbiBvcHRpb25zKSB7XG4gICAgICBcbiAgICAgIGZsYWdzLmZsaXBZID0gb3B0aW9ucy5mbGlwWVxuICAgIH1cblxuICAgIGlmICgnYWxpZ25tZW50JyBpbiBvcHRpb25zKSB7XG4gICAgICBcbiAgICAgIGZsYWdzLnVucGFja0FsaWdubWVudCA9IG9wdGlvbnMuYWxpZ25tZW50XG4gICAgfVxuXG4gICAgaWYgKCdjb2xvclNwYWNlJyBpbiBvcHRpb25zKSB7XG4gICAgICBcbiAgICAgIGZsYWdzLmNvbG9yU3BhY2UgPSBjb2xvclNwYWNlW29wdGlvbnMuY29sb3JTcGFjZV1cbiAgICB9XG5cbiAgICBpZiAoJ3R5cGUnIGluIG9wdGlvbnMpIHtcbiAgICAgIHZhciB0eXBlID0gb3B0aW9ucy50eXBlXG4gICAgICBcbiAgICAgIFxuICAgICAgXG4gICAgICBcbiAgICAgIGZsYWdzLnR5cGUgPSB0ZXh0dXJlVHlwZXNbdHlwZV1cbiAgICB9XG5cbiAgICB2YXIgdyA9IGZsYWdzLndpZHRoXG4gICAgdmFyIGggPSBmbGFncy5oZWlnaHRcbiAgICB2YXIgYyA9IGZsYWdzLmNoYW5uZWxzXG4gICAgdmFyIGhhc0NoYW5uZWxzID0gZmFsc2VcbiAgICBpZiAoJ3NoYXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICBcbiAgICAgIHcgPSBvcHRpb25zLnNoYXBlWzBdXG4gICAgICBoID0gb3B0aW9ucy5zaGFwZVsxXVxuICAgICAgaWYgKG9wdGlvbnMuc2hhcGUubGVuZ3RoID09PSAzKSB7XG4gICAgICAgIGMgPSBvcHRpb25zLnNoYXBlWzJdXG4gICAgICAgIFxuICAgICAgICBoYXNDaGFubmVscyA9IHRydWVcbiAgICAgIH1cbiAgICAgIFxuICAgICAgXG4gICAgfSBlbHNlIHtcbiAgICAgIGlmICgncmFkaXVzJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHcgPSBoID0gb3B0aW9ucy5yYWRpdXNcbiAgICAgICAgXG4gICAgICB9XG4gICAgICBpZiAoJ3dpZHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHcgPSBvcHRpb25zLndpZHRoXG4gICAgICAgIFxuICAgICAgfVxuICAgICAgaWYgKCdoZWlnaHQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgaCA9IG9wdGlvbnMuaGVpZ2h0XG4gICAgICAgIFxuICAgICAgfVxuICAgICAgaWYgKCdjaGFubmVscycgaW4gb3B0aW9ucykge1xuICAgICAgICBjID0gb3B0aW9ucy5jaGFubmVsc1xuICAgICAgICBcbiAgICAgICAgaGFzQ2hhbm5lbHMgPSB0cnVlXG4gICAgICB9XG4gICAgfVxuICAgIGZsYWdzLndpZHRoID0gdyB8IDBcbiAgICBmbGFncy5oZWlnaHQgPSBoIHwgMFxuICAgIGZsYWdzLmNoYW5uZWxzID0gYyB8IDBcblxuICAgIHZhciBoYXNGb3JtYXQgPSBmYWxzZVxuICAgIGlmICgnZm9ybWF0JyBpbiBvcHRpb25zKSB7XG4gICAgICB2YXIgZm9ybWF0U3RyID0gb3B0aW9ucy5mb3JtYXRcbiAgICAgIFxuICAgICAgXG4gICAgICB2YXIgaW50ZXJuYWxmb3JtYXQgPSBmbGFncy5pbnRlcm5hbGZvcm1hdCA9IHRleHR1cmVGb3JtYXRzW2Zvcm1hdFN0cl1cbiAgICAgIGZsYWdzLmZvcm1hdCA9IGNvbG9yRm9ybWF0c1tpbnRlcm5hbGZvcm1hdF1cbiAgICAgIGlmIChmb3JtYXRTdHIgaW4gdGV4dHVyZVR5cGVzKSB7XG4gICAgICAgIGlmICghKCd0eXBlJyBpbiBvcHRpb25zKSkge1xuICAgICAgICAgIGZsYWdzLnR5cGUgPSB0ZXh0dXJlVHlwZXNbZm9ybWF0U3RyXVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoZm9ybWF0U3RyIGluIGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cykge1xuICAgICAgICBmbGFncy5jb21wcmVzc2VkID0gdHJ1ZVxuICAgICAgfVxuICAgICAgaGFzRm9ybWF0ID0gdHJ1ZVxuICAgIH1cblxuICAgIC8vIFJlY29uY2lsZSBjaGFubmVscyBhbmQgZm9ybWF0XG4gICAgaWYgKCFoYXNDaGFubmVscyAmJiBoYXNGb3JtYXQpIHtcbiAgICAgIGZsYWdzLmNoYW5uZWxzID0gRk9STUFUX0NIQU5ORUxTW2ZsYWdzLmZvcm1hdF1cbiAgICB9IGVsc2UgaWYgKGhhc0NoYW5uZWxzICYmICFoYXNGb3JtYXQpIHtcbiAgICAgIGlmIChmbGFncy5jaGFubmVscyAhPT0gQ0hBTk5FTFNfRk9STUFUW2ZsYWdzLmZvcm1hdF0pIHtcbiAgICAgICAgZmxhZ3MuZm9ybWF0ID0gZmxhZ3MuaW50ZXJuYWxmb3JtYXQgPSBDSEFOTkVMU19GT1JNQVRbZmxhZ3MuY2hhbm5lbHNdXG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChoYXNGb3JtYXQgJiYgaGFzQ2hhbm5lbHMpIHtcbiAgICAgIFxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHNldEZsYWdzIChmbGFncykge1xuICAgIGdsLnBpeGVsU3RvcmVpKEdMX1VOUEFDS19GTElQX1lfV0VCR0wsIGZsYWdzLmZsaXBZKVxuICAgIGdsLnBpeGVsU3RvcmVpKEdMX1VOUEFDS19QUkVNVUxUSVBMWV9BTFBIQV9XRUJHTCwgZmxhZ3MucHJlbXVsdGlwbHlBbHBoYSlcbiAgICBnbC5waXhlbFN0b3JlaShHTF9VTlBBQ0tfQ09MT1JTUEFDRV9DT05WRVJTSU9OX1dFQkdMLCBmbGFncy5jb2xvclNwYWNlKVxuICAgIGdsLnBpeGVsU3RvcmVpKEdMX1VOUEFDS19BTElHTk1FTlQsIGZsYWdzLnVucGFja0FsaWdubWVudClcbiAgfVxuXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gVGV4IGltYWdlIGRhdGFcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICBmdW5jdGlvbiBUZXhJbWFnZSAoKSB7XG4gICAgVGV4RmxhZ3MuY2FsbCh0aGlzKVxuXG4gICAgdGhpcy54T2Zmc2V0ID0gMFxuICAgIHRoaXMueU9mZnNldCA9IDBcblxuICAgIC8vIGRhdGFcbiAgICB0aGlzLmRhdGEgPSBudWxsXG4gICAgdGhpcy5uZWVkc0ZyZWUgPSBmYWxzZVxuXG4gICAgLy8gaHRtbCBlbGVtZW50XG4gICAgdGhpcy5lbGVtZW50ID0gbnVsbFxuXG4gICAgLy8gY29weVRleEltYWdlIGluZm9cbiAgICB0aGlzLm5lZWRzQ29weSA9IGZhbHNlXG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZUltYWdlIChpbWFnZSwgb3B0aW9ucykge1xuICAgIHZhciBkYXRhID0gbnVsbFxuICAgIGlmIChpc1BpeGVsRGF0YShvcHRpb25zKSkge1xuICAgICAgZGF0YSA9IG9wdGlvbnNcbiAgICB9IGVsc2UgaWYgKG9wdGlvbnMpIHtcbiAgICAgIFxuICAgICAgcGFyc2VGbGFncyhpbWFnZSwgb3B0aW9ucylcbiAgICAgIGlmICgneCcgaW4gb3B0aW9ucykge1xuICAgICAgICBpbWFnZS54T2Zmc2V0ID0gb3B0aW9ucy54IHwgMFxuICAgICAgfVxuICAgICAgaWYgKCd5JyBpbiBvcHRpb25zKSB7XG4gICAgICAgIGltYWdlLnlPZmZzZXQgPSBvcHRpb25zLnkgfCAwXG4gICAgICB9XG4gICAgICBpZiAoaXNQaXhlbERhdGEob3B0aW9ucy5kYXRhKSkge1xuICAgICAgICBkYXRhID0gb3B0aW9ucy5kYXRhXG4gICAgICB9XG4gICAgfVxuXG4gICAgXG5cbiAgICBpZiAob3B0aW9ucy5jb3B5KSB7XG4gICAgICBcbiAgICAgIHZhciB2aWV3VyA9IGNvbnRleHRTdGF0ZS52aWV3cG9ydFdpZHRoXG4gICAgICB2YXIgdmlld0ggPSBjb250ZXh0U3RhdGUudmlld3BvcnRIZWlnaHRcbiAgICAgIGltYWdlLndpZHRoID0gaW1hZ2Uud2lkdGggfHwgKHZpZXdXIC0gaW1hZ2UueE9mZnNldClcbiAgICAgIGltYWdlLmhlaWdodCA9IGltYWdlLmhlaWdodCB8fCAodmlld0ggLSBpbWFnZS55T2Zmc2V0KVxuICAgICAgaW1hZ2UubmVlZHNDb3B5ID0gdHJ1ZVxuICAgICAgXG4gICAgfSBlbHNlIGlmICghZGF0YSkge1xuICAgICAgaW1hZ2Uud2lkdGggPSBpbWFnZS53aWR0aCB8fCAxXG4gICAgICBpbWFnZS5oZWlnaHQgPSBpbWFnZS5oZWlnaHQgfHwgMVxuICAgICAgaW1hZ2UuY2hhbm5lbHMgPSBpbWFnZS5jaGFubmVscyB8fCA0XG4gICAgfSBlbHNlIGlmIChpc1R5cGVkQXJyYXkoZGF0YSkpIHtcbiAgICAgIGltYWdlLmNoYW5uZWxzID0gaW1hZ2UuY2hhbm5lbHMgfHwgNFxuICAgICAgaW1hZ2UuZGF0YSA9IGRhdGFcbiAgICAgIGlmICghKCd0eXBlJyBpbiBvcHRpb25zKSAmJiBpbWFnZS50eXBlID09PSBHTF9VTlNJR05FRF9CWVRFKSB7XG4gICAgICAgIGltYWdlLnR5cGUgPSB0eXBlZEFycmF5Q29kZShkYXRhKVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoaXNOdW1lcmljQXJyYXkoZGF0YSkpIHtcbiAgICAgIGltYWdlLmNoYW5uZWxzID0gaW1hZ2UuY2hhbm5lbHMgfHwgNFxuICAgICAgY29udmVydERhdGEoaW1hZ2UsIGRhdGEpXG4gICAgICBpbWFnZS5hbGlnbm1lbnQgPSAxXG4gICAgICBpbWFnZS5uZWVkc0ZyZWUgPSB0cnVlXG4gICAgfSBlbHNlIGlmIChpc05EQXJyYXlMaWtlKGRhdGEpKSB7XG4gICAgICB2YXIgYXJyYXkgPSBkYXRhLmRhdGFcbiAgICAgIGlmICghQXJyYXkuaXNBcnJheShhcnJheSkgJiYgaW1hZ2UudHlwZSA9PT0gR0xfVU5TSUdORURfQllURSkge1xuICAgICAgICBpbWFnZS50eXBlID0gdHlwZWRBcnJheUNvZGUoYXJyYXkpXG4gICAgICB9XG4gICAgICB2YXIgc2hhcGUgPSBkYXRhLnNoYXBlXG4gICAgICB2YXIgc3RyaWRlID0gZGF0YS5zdHJpZGVcbiAgICAgIHZhciBzaGFwZVgsIHNoYXBlWSwgc2hhcGVDLCBzdHJpZGVYLCBzdHJpZGVZLCBzdHJpZGVDXG4gICAgICBpZiAoc2hhcGUubGVuZ3RoID09PSAzKSB7XG4gICAgICAgIHNoYXBlQyA9IHNoYXBlWzJdXG4gICAgICAgIHN0cmlkZUMgPSBzdHJpZGVbMl1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIFxuICAgICAgICBzaGFwZUMgPSAxXG4gICAgICAgIHN0cmlkZUMgPSAxXG4gICAgICB9XG4gICAgICBzaGFwZVggPSBzaGFwZVswXVxuICAgICAgc2hhcGVZID0gc2hhcGVbMV1cbiAgICAgIHN0cmlkZVggPSBzdHJpZGVbMF1cbiAgICAgIHN0cmlkZVkgPSBzdHJpZGVbMV1cbiAgICAgIGltYWdlLmFsaWdubWVudCA9IDFcbiAgICAgIGltYWdlLndpZHRoID0gc2hhcGVYXG4gICAgICBpbWFnZS5oZWlnaHQgPSBzaGFwZVlcbiAgICAgIGltYWdlLmNoYW5uZWxzID0gc2hhcGVDXG4gICAgICBpbWFnZS5mb3JtYXQgPSBpbWFnZS5pbnRlcm5hbGZvcm1hdCA9IENIQU5ORUxTX0ZPUk1BVFtzaGFwZUNdXG4gICAgICBpbWFnZS5uZWVkc0ZyZWUgPSB0cnVlXG4gICAgICB0cmFuc3Bvc2VEYXRhKGltYWdlLCBhcnJheSwgc3RyaWRlWCwgc3RyaWRlWSwgc3RyaWRlQywgZGF0YS5vZmZzZXQpXG4gICAgfSBlbHNlIGlmIChpc0NhbnZhc0VsZW1lbnQoZGF0YSkgfHwgaXNDb250ZXh0MkQoZGF0YSkpIHtcbiAgICAgIGlmIChpc0NhbnZhc0VsZW1lbnQoZGF0YSkpIHtcbiAgICAgICAgaW1hZ2UuZWxlbWVudCA9IGRhdGFcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGltYWdlLmVsZW1lbnQgPSBkYXRhLmNhbnZhc1xuICAgICAgfVxuICAgICAgaW1hZ2Uud2lkdGggPSBpbWFnZS5lbGVtZW50LndpZHRoXG4gICAgICBpbWFnZS5oZWlnaHQgPSBpbWFnZS5lbGVtZW50LmhlaWdodFxuICAgICAgaW1hZ2UuY2hhbm5lbHMgPSA0XG4gICAgfSBlbHNlIGlmIChpc0ltYWdlRWxlbWVudChkYXRhKSkge1xuICAgICAgaW1hZ2UuZWxlbWVudCA9IGRhdGFcbiAgICAgIGltYWdlLndpZHRoID0gZGF0YS5uYXR1cmFsV2lkdGhcbiAgICAgIGltYWdlLmhlaWdodCA9IGRhdGEubmF0dXJhbEhlaWdodFxuICAgICAgaW1hZ2UuY2hhbm5lbHMgPSA0XG4gICAgfSBlbHNlIGlmIChpc1ZpZGVvRWxlbWVudChkYXRhKSkge1xuICAgICAgaW1hZ2UuZWxlbWVudCA9IGRhdGFcbiAgICAgIGltYWdlLndpZHRoID0gZGF0YS52aWRlb1dpZHRoXG4gICAgICBpbWFnZS5oZWlnaHQgPSBkYXRhLnZpZGVvSGVpZ2h0XG4gICAgICBpbWFnZS5jaGFubmVscyA9IDRcbiAgICB9IGVsc2UgaWYgKGlzUmVjdEFycmF5KGRhdGEpKSB7XG4gICAgICB2YXIgdyA9IGltYWdlLndpZHRoIHx8IGRhdGFbMF0ubGVuZ3RoXG4gICAgICB2YXIgaCA9IGltYWdlLmhlaWdodCB8fCBkYXRhLmxlbmd0aFxuICAgICAgdmFyIGMgPSBpbWFnZS5jaGFubmVsc1xuICAgICAgaWYgKGlzQXJyYXlMaWtlKGRhdGFbMF1bMF0pKSB7XG4gICAgICAgIGMgPSBjIHx8IGRhdGFbMF1bMF0ubGVuZ3RoXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjID0gYyB8fCAxXG4gICAgICB9XG4gICAgICB2YXIgYXJyYXlTaGFwZSA9IGZsYXR0ZW5VdGlscy5zaGFwZShkYXRhKVxuICAgICAgdmFyIG4gPSAxXG4gICAgICBmb3IgKHZhciBkZCA9IDA7IGRkIDwgYXJyYXlTaGFwZS5sZW5ndGg7ICsrZGQpIHtcbiAgICAgICAgbiAqPSBhcnJheVNoYXBlW2RkXVxuICAgICAgfVxuICAgICAgdmFyIGFsbG9jRGF0YSA9IHByZUNvbnZlcnQoaW1hZ2UsIG4pXG4gICAgICBmbGF0dGVuVXRpbHMuZmxhdHRlbihkYXRhLCBhcnJheVNoYXBlLCAnJywgYWxsb2NEYXRhKVxuICAgICAgcG9zdENvbnZlcnQoaW1hZ2UsIGFsbG9jRGF0YSlcbiAgICAgIGltYWdlLmFsaWdubWVudCA9IDFcbiAgICAgIGltYWdlLndpZHRoID0gd1xuICAgICAgaW1hZ2UuaGVpZ2h0ID0gaFxuICAgICAgaW1hZ2UuY2hhbm5lbHMgPSBjXG4gICAgICBpbWFnZS5mb3JtYXQgPSBpbWFnZS5pbnRlcm5hbGZvcm1hdCA9IENIQU5ORUxTX0ZPUk1BVFtjXVxuICAgICAgaW1hZ2UubmVlZHNGcmVlID0gdHJ1ZVxuICAgIH1cblxuICAgIGlmIChpbWFnZS50eXBlID09PSBHTF9GTE9BVCkge1xuICAgICAgXG4gICAgfSBlbHNlIGlmIChpbWFnZS50eXBlID09PSBHTF9IQUxGX0ZMT0FUX09FUykge1xuICAgICAgXG4gICAgfVxuXG4gICAgLy8gZG8gY29tcHJlc3NlZCB0ZXh0dXJlICB2YWxpZGF0aW9uIGhlcmUuXG4gIH1cblxuICBmdW5jdGlvbiBzZXRJbWFnZSAoaW5mbywgdGFyZ2V0LCBtaXBsZXZlbCkge1xuICAgIHZhciBlbGVtZW50ID0gaW5mby5lbGVtZW50XG4gICAgdmFyIGRhdGEgPSBpbmZvLmRhdGFcbiAgICB2YXIgaW50ZXJuYWxmb3JtYXQgPSBpbmZvLmludGVybmFsZm9ybWF0XG4gICAgdmFyIGZvcm1hdCA9IGluZm8uZm9ybWF0XG4gICAgdmFyIHR5cGUgPSBpbmZvLnR5cGVcbiAgICB2YXIgd2lkdGggPSBpbmZvLndpZHRoXG4gICAgdmFyIGhlaWdodCA9IGluZm8uaGVpZ2h0XG5cbiAgICBzZXRGbGFncyhpbmZvKVxuXG4gICAgaWYgKGVsZW1lbnQpIHtcbiAgICAgIGdsLnRleEltYWdlMkQodGFyZ2V0LCBtaXBsZXZlbCwgZm9ybWF0LCBmb3JtYXQsIHR5cGUsIGVsZW1lbnQpXG4gICAgfSBlbHNlIGlmIChpbmZvLmNvbXByZXNzZWQpIHtcbiAgICAgIGdsLmNvbXByZXNzZWRUZXhJbWFnZTJEKHRhcmdldCwgbWlwbGV2ZWwsIGludGVybmFsZm9ybWF0LCB3aWR0aCwgaGVpZ2h0LCAwLCBkYXRhKVxuICAgIH0gZWxzZSBpZiAoaW5mby5uZWVkc0NvcHkpIHtcbiAgICAgIHJlZ2xQb2xsKClcbiAgICAgIGdsLmNvcHlUZXhJbWFnZTJEKFxuICAgICAgICB0YXJnZXQsIG1pcGxldmVsLCBmb3JtYXQsIGluZm8ueE9mZnNldCwgaW5mby55T2Zmc2V0LCB3aWR0aCwgaGVpZ2h0LCAwKVxuICAgIH0gZWxzZSB7XG4gICAgICBnbC50ZXhJbWFnZTJEKFxuICAgICAgICB0YXJnZXQsIG1pcGxldmVsLCBmb3JtYXQsIHdpZHRoLCBoZWlnaHQsIDAsIGZvcm1hdCwgdHlwZSwgZGF0YSlcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzZXRTdWJJbWFnZSAoaW5mbywgdGFyZ2V0LCB4LCB5LCBtaXBsZXZlbCkge1xuICAgIHZhciBlbGVtZW50ID0gaW5mby5lbGVtZW50XG4gICAgdmFyIGRhdGEgPSBpbmZvLmRhdGFcbiAgICB2YXIgaW50ZXJuYWxmb3JtYXQgPSBpbmZvLmludGVybmFsZm9ybWF0XG4gICAgdmFyIGZvcm1hdCA9IGluZm8uZm9ybWF0XG4gICAgdmFyIHR5cGUgPSBpbmZvLnR5cGVcbiAgICB2YXIgd2lkdGggPSBpbmZvLndpZHRoXG4gICAgdmFyIGhlaWdodCA9IGluZm8uaGVpZ2h0XG5cbiAgICBzZXRGbGFncyhpbmZvKVxuXG4gICAgaWYgKGVsZW1lbnQpIHtcbiAgICAgIGdsLnRleFN1YkltYWdlMkQoXG4gICAgICAgIHRhcmdldCwgbWlwbGV2ZWwsIHgsIHksIGZvcm1hdCwgdHlwZSwgZWxlbWVudClcbiAgICB9IGVsc2UgaWYgKGluZm8uY29tcHJlc3NlZCkge1xuICAgICAgZ2wuY29tcHJlc3NlZFRleFN1YkltYWdlMkQoXG4gICAgICAgIHRhcmdldCwgbWlwbGV2ZWwsIHgsIHksIGludGVybmFsZm9ybWF0LCB3aWR0aCwgaGVpZ2h0LCBkYXRhKVxuICAgIH0gZWxzZSBpZiAoaW5mby5uZWVkc0NvcHkpIHtcbiAgICAgIHJlZ2xQb2xsKClcbiAgICAgIGdsLmNvcHlUZXhTdWJJbWFnZTJEKFxuICAgICAgICB0YXJnZXQsIG1pcGxldmVsLCB4LCB5LCBpbmZvLnhPZmZzZXQsIGluZm8ueU9mZnNldCwgd2lkdGgsIGhlaWdodClcbiAgICB9IGVsc2Uge1xuICAgICAgZ2wudGV4U3ViSW1hZ2UyRChcbiAgICAgICAgdGFyZ2V0LCBtaXBsZXZlbCwgeCwgeSwgd2lkdGgsIGhlaWdodCwgZm9ybWF0LCB0eXBlLCBkYXRhKVxuICAgIH1cbiAgfVxuXG4gIC8vIHRleEltYWdlIHBvb2xcbiAgdmFyIGltYWdlUG9vbCA9IFtdXG5cbiAgZnVuY3Rpb24gYWxsb2NJbWFnZSAoKSB7XG4gICAgcmV0dXJuIGltYWdlUG9vbC5wb3AoKSB8fCBuZXcgVGV4SW1hZ2UoKVxuICB9XG5cbiAgZnVuY3Rpb24gZnJlZUltYWdlIChpbWFnZSkge1xuICAgIGlmIChpbWFnZS5uZWVkc0ZyZWUpIHtcbiAgICAgIHBvb2wuZnJlZVR5cGUoaW1hZ2UuZGF0YSlcbiAgICB9XG4gICAgVGV4SW1hZ2UuY2FsbChpbWFnZSlcbiAgICBpbWFnZVBvb2wucHVzaChpbWFnZSlcbiAgfVxuXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gTWlwIG1hcFxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIGZ1bmN0aW9uIE1pcE1hcCAoKSB7XG4gICAgVGV4RmxhZ3MuY2FsbCh0aGlzKVxuXG4gICAgdGhpcy5nZW5NaXBtYXBzID0gZmFsc2VcbiAgICB0aGlzLm1pcG1hcEhpbnQgPSBHTF9ET05UX0NBUkVcbiAgICB0aGlzLm1pcG1hc2sgPSAwXG4gICAgdGhpcy5pbWFnZXMgPSBBcnJheSgxNilcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlTWlwTWFwRnJvbVNoYXBlIChtaXBtYXAsIHdpZHRoLCBoZWlnaHQpIHtcbiAgICB2YXIgaW1nID0gbWlwbWFwLmltYWdlc1swXSA9IGFsbG9jSW1hZ2UoKVxuICAgIG1pcG1hcC5taXBtYXNrID0gMVxuICAgIGltZy53aWR0aCA9IG1pcG1hcC53aWR0aCA9IHdpZHRoXG4gICAgaW1nLmhlaWdodCA9IG1pcG1hcC5oZWlnaHQgPSBoZWlnaHRcbiAgICBpbWcuY2hhbm5lbHMgPSBtaXBtYXAuY2hhbm5lbHMgPSA0XG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZU1pcE1hcEZyb21PYmplY3QgKG1pcG1hcCwgb3B0aW9ucykge1xuICAgIHZhciBpbWdEYXRhID0gbnVsbFxuICAgIGlmIChpc1BpeGVsRGF0YShvcHRpb25zKSkge1xuICAgICAgaW1nRGF0YSA9IG1pcG1hcC5pbWFnZXNbMF0gPSBhbGxvY0ltYWdlKClcbiAgICAgIGNvcHlGbGFncyhpbWdEYXRhLCBtaXBtYXApXG4gICAgICBwYXJzZUltYWdlKGltZ0RhdGEsIG9wdGlvbnMpXG4gICAgICBtaXBtYXAubWlwbWFzayA9IDFcbiAgICB9IGVsc2Uge1xuICAgICAgcGFyc2VGbGFncyhtaXBtYXAsIG9wdGlvbnMpXG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShvcHRpb25zLm1pcG1hcCkpIHtcbiAgICAgICAgdmFyIG1pcERhdGEgPSBvcHRpb25zLm1pcG1hcFxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG1pcERhdGEubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICBpbWdEYXRhID0gbWlwbWFwLmltYWdlc1tpXSA9IGFsbG9jSW1hZ2UoKVxuICAgICAgICAgIGNvcHlGbGFncyhpbWdEYXRhLCBtaXBtYXApXG4gICAgICAgICAgaW1nRGF0YS53aWR0aCA+Pj0gaVxuICAgICAgICAgIGltZ0RhdGEuaGVpZ2h0ID4+PSBpXG4gICAgICAgICAgcGFyc2VJbWFnZShpbWdEYXRhLCBtaXBEYXRhW2ldKVxuICAgICAgICAgIG1pcG1hcC5taXBtYXNrIHw9ICgxIDw8IGkpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGltZ0RhdGEgPSBtaXBtYXAuaW1hZ2VzWzBdID0gYWxsb2NJbWFnZSgpXG4gICAgICAgIGNvcHlGbGFncyhpbWdEYXRhLCBtaXBtYXApXG4gICAgICAgIHBhcnNlSW1hZ2UoaW1nRGF0YSwgb3B0aW9ucylcbiAgICAgICAgbWlwbWFwLm1pcG1hc2sgPSAxXG4gICAgICB9XG4gICAgfVxuICAgIGNvcHlGbGFncyhtaXBtYXAsIG1pcG1hcC5pbWFnZXNbMF0pXG5cbiAgICAvLyBGb3IgdGV4dHVyZXMgb2YgdGhlIGNvbXByZXNzZWQgZm9ybWF0IFdFQkdMX2NvbXByZXNzZWRfdGV4dHVyZV9zM3RjXG4gICAgLy8gd2UgbXVzdCBoYXZlIHRoYXRcbiAgICAvL1xuICAgIC8vIFwiV2hlbiBsZXZlbCBlcXVhbHMgemVybyB3aWR0aCBhbmQgaGVpZ2h0IG11c3QgYmUgYSBtdWx0aXBsZSBvZiA0LlxuICAgIC8vIFdoZW4gbGV2ZWwgaXMgZ3JlYXRlciB0aGFuIDAgd2lkdGggYW5kIGhlaWdodCBtdXN0IGJlIDAsIDEsIDIgb3IgYSBtdWx0aXBsZSBvZiA0LiBcIlxuICAgIC8vXG4gICAgLy8gYnV0IHdlIGRvIG5vdCB5ZXQgc3VwcG9ydCBoYXZpbmcgbXVsdGlwbGUgbWlwbWFwIGxldmVscyBmb3IgY29tcHJlc3NlZCB0ZXh0dXJlcyxcbiAgICAvLyBzbyB3ZSBvbmx5IHRlc3QgZm9yIGxldmVsIHplcm8uXG5cbiAgICBpZiAobWlwbWFwLmNvbXByZXNzZWQgJiZcbiAgICAgICAgKG1pcG1hcC5pbnRlcm5hbGZvcm1hdCA9PT0gR0xfQ09NUFJFU1NFRF9SR0JfUzNUQ19EWFQxX0VYVCkgfHxcbiAgICAgICAgKG1pcG1hcC5pbnRlcm5hbGZvcm1hdCA9PT0gR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUMV9FWFQpIHx8XG4gICAgICAgIChtaXBtYXAuaW50ZXJuYWxmb3JtYXQgPT09IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDNfRVhUKSB8fFxuICAgICAgICAobWlwbWFwLmludGVybmFsZm9ybWF0ID09PSBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQ1X0VYVCkpIHtcbiAgICAgIFxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHNldE1pcE1hcCAobWlwbWFwLCB0YXJnZXQpIHtcbiAgICB2YXIgaW1hZ2VzID0gbWlwbWFwLmltYWdlc1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgaW1hZ2VzLmxlbmd0aDsgKytpKSB7XG4gICAgICBpZiAoIWltYWdlc1tpXSkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIHNldEltYWdlKGltYWdlc1tpXSwgdGFyZ2V0LCBpKVxuICAgIH1cbiAgfVxuXG4gIHZhciBtaXBQb29sID0gW11cblxuICBmdW5jdGlvbiBhbGxvY01pcE1hcCAoKSB7XG4gICAgdmFyIHJlc3VsdCA9IG1pcFBvb2wucG9wKCkgfHwgbmV3IE1pcE1hcCgpXG4gICAgVGV4RmxhZ3MuY2FsbChyZXN1bHQpXG4gICAgcmVzdWx0Lm1pcG1hc2sgPSAwXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCAxNjsgKytpKSB7XG4gICAgICByZXN1bHQuaW1hZ2VzW2ldID0gbnVsbFxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0XG4gIH1cblxuICBmdW5jdGlvbiBmcmVlTWlwTWFwIChtaXBtYXApIHtcbiAgICB2YXIgaW1hZ2VzID0gbWlwbWFwLmltYWdlc1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgaW1hZ2VzLmxlbmd0aDsgKytpKSB7XG4gICAgICBpZiAoaW1hZ2VzW2ldKSB7XG4gICAgICAgIGZyZWVJbWFnZShpbWFnZXNbaV0pXG4gICAgICB9XG4gICAgICBpbWFnZXNbaV0gPSBudWxsXG4gICAgfVxuICAgIG1pcFBvb2wucHVzaChtaXBtYXApXG4gIH1cblxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIFRleCBpbmZvXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgZnVuY3Rpb24gVGV4SW5mbyAoKSB7XG4gICAgdGhpcy5taW5GaWx0ZXIgPSBHTF9ORUFSRVNUXG4gICAgdGhpcy5tYWdGaWx0ZXIgPSBHTF9ORUFSRVNUXG5cbiAgICB0aGlzLndyYXBTID0gR0xfQ0xBTVBfVE9fRURHRVxuICAgIHRoaXMud3JhcFQgPSBHTF9DTEFNUF9UT19FREdFXG5cbiAgICB0aGlzLmFuaXNvdHJvcGljID0gMVxuXG4gICAgdGhpcy5nZW5NaXBtYXBzID0gZmFsc2VcbiAgICB0aGlzLm1pcG1hcEhpbnQgPSBHTF9ET05UX0NBUkVcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlVGV4SW5mbyAoaW5mbywgb3B0aW9ucykge1xuICAgIGlmICgnbWluJyBpbiBvcHRpb25zKSB7XG4gICAgICB2YXIgbWluRmlsdGVyID0gb3B0aW9ucy5taW5cbiAgICAgIFxuICAgICAgaW5mby5taW5GaWx0ZXIgPSBtaW5GaWx0ZXJzW21pbkZpbHRlcl1cbiAgICAgIGlmIChNSVBNQVBfRklMVEVSUy5pbmRleE9mKGluZm8ubWluRmlsdGVyKSA+PSAwKSB7XG4gICAgICAgIGluZm8uZ2VuTWlwbWFwcyA9IHRydWVcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoJ21hZycgaW4gb3B0aW9ucykge1xuICAgICAgdmFyIG1hZ0ZpbHRlciA9IG9wdGlvbnMubWFnXG4gICAgICBcbiAgICAgIGluZm8ubWFnRmlsdGVyID0gbWFnRmlsdGVyc1ttYWdGaWx0ZXJdXG4gICAgfVxuXG4gICAgdmFyIHdyYXBTID0gaW5mby53cmFwU1xuICAgIHZhciB3cmFwVCA9IGluZm8ud3JhcFRcbiAgICBpZiAoJ3dyYXAnIGluIG9wdGlvbnMpIHtcbiAgICAgIHZhciB3cmFwID0gb3B0aW9ucy53cmFwXG4gICAgICBpZiAodHlwZW9mIHdyYXAgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIFxuICAgICAgICB3cmFwUyA9IHdyYXBUID0gd3JhcE1vZGVzW3dyYXBdXG4gICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkod3JhcCkpIHtcbiAgICAgICAgXG4gICAgICAgIFxuICAgICAgICB3cmFwUyA9IHdyYXBNb2Rlc1t3cmFwWzBdXVxuICAgICAgICB3cmFwVCA9IHdyYXBNb2Rlc1t3cmFwWzFdXVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoJ3dyYXBTJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBvcHRXcmFwUyA9IG9wdGlvbnMud3JhcFNcbiAgICAgICAgXG4gICAgICAgIHdyYXBTID0gd3JhcE1vZGVzW29wdFdyYXBTXVxuICAgICAgfVxuICAgICAgaWYgKCd3cmFwVCcgaW4gb3B0aW9ucykge1xuICAgICAgICB2YXIgb3B0V3JhcFQgPSBvcHRpb25zLndyYXBUXG4gICAgICAgIFxuICAgICAgICB3cmFwVCA9IHdyYXBNb2Rlc1tvcHRXcmFwVF1cbiAgICAgIH1cbiAgICB9XG4gICAgaW5mby53cmFwUyA9IHdyYXBTXG4gICAgaW5mby53cmFwVCA9IHdyYXBUXG5cbiAgICBpZiAoJ2FuaXNvdHJvcGljJyBpbiBvcHRpb25zKSB7XG4gICAgICB2YXIgYW5pc290cm9waWMgPSBvcHRpb25zLmFuaXNvdHJvcGljXG4gICAgICBcbiAgICAgIGluZm8uYW5pc290cm9waWMgPSBvcHRpb25zLmFuaXNvdHJvcGljXG4gICAgfVxuXG4gICAgaWYgKCdtaXBtYXAnIGluIG9wdGlvbnMpIHtcbiAgICAgIHZhciBoYXNNaXBNYXAgPSBmYWxzZVxuICAgICAgc3dpdGNoICh0eXBlb2Ygb3B0aW9ucy5taXBtYXApIHtcbiAgICAgICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgICAgICBcbiAgICAgICAgICBpbmZvLm1pcG1hcEhpbnQgPSBtaXBtYXBIaW50W29wdGlvbnMubWlwbWFwXVxuICAgICAgICAgIGluZm8uZ2VuTWlwbWFwcyA9IHRydWVcbiAgICAgICAgICBoYXNNaXBNYXAgPSB0cnVlXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdib29sZWFuJzpcbiAgICAgICAgICBoYXNNaXBNYXAgPSBpbmZvLmdlbk1pcG1hcHMgPSBvcHRpb25zLm1pcG1hcFxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgICAgICBcbiAgICAgICAgICBpbmZvLmdlbk1pcG1hcHMgPSBmYWxzZVxuICAgICAgICAgIGhhc01pcE1hcCA9IHRydWVcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgXG4gICAgICB9XG4gICAgICBpZiAoaGFzTWlwTWFwICYmICEoJ21pbicgaW4gb3B0aW9ucykpIHtcbiAgICAgICAgaW5mby5taW5GaWx0ZXIgPSBHTF9ORUFSRVNUX01JUE1BUF9ORUFSRVNUXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc2V0VGV4SW5mbyAoaW5mbywgdGFyZ2V0KSB7XG4gICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfTUlOX0ZJTFRFUiwgaW5mby5taW5GaWx0ZXIpXG4gICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfTUFHX0ZJTFRFUiwgaW5mby5tYWdGaWx0ZXIpXG4gICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfV1JBUF9TLCBpbmZvLndyYXBTKVxuICAgIGdsLnRleFBhcmFtZXRlcmkodGFyZ2V0LCBHTF9URVhUVVJFX1dSQVBfVCwgaW5mby53cmFwVClcbiAgICBpZiAoZXh0ZW5zaW9ucy5leHRfdGV4dHVyZV9maWx0ZXJfYW5pc290cm9waWMpIHtcbiAgICAgIGdsLnRleFBhcmFtZXRlcmkodGFyZ2V0LCBHTF9URVhUVVJFX01BWF9BTklTT1RST1BZX0VYVCwgaW5mby5hbmlzb3Ryb3BpYylcbiAgICB9XG4gICAgaWYgKGluZm8uZ2VuTWlwbWFwcykge1xuICAgICAgZ2wuaGludChHTF9HRU5FUkFURV9NSVBNQVBfSElOVCwgaW5mby5taXBtYXBIaW50KVxuICAgICAgZ2wuZ2VuZXJhdGVNaXBtYXAodGFyZ2V0KVxuICAgIH1cbiAgfVxuXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gRnVsbCB0ZXh0dXJlIG9iamVjdFxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIHZhciB0ZXh0dXJlQ291bnQgPSAwXG4gIHZhciB0ZXh0dXJlU2V0ID0ge31cbiAgdmFyIG51bVRleFVuaXRzID0gbGltaXRzLm1heFRleHR1cmVVbml0c1xuICB2YXIgdGV4dHVyZVVuaXRzID0gQXJyYXkobnVtVGV4VW5pdHMpLm1hcChmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIG51bGxcbiAgfSlcblxuICBmdW5jdGlvbiBSRUdMVGV4dHVyZSAodGFyZ2V0KSB7XG4gICAgVGV4RmxhZ3MuY2FsbCh0aGlzKVxuICAgIHRoaXMubWlwbWFzayA9IDBcbiAgICB0aGlzLmludGVybmFsZm9ybWF0ID0gR0xfUkdCQVxuXG4gICAgdGhpcy5pZCA9IHRleHR1cmVDb3VudCsrXG5cbiAgICB0aGlzLnJlZkNvdW50ID0gMVxuXG4gICAgdGhpcy50YXJnZXQgPSB0YXJnZXRcbiAgICB0aGlzLnRleHR1cmUgPSBnbC5jcmVhdGVUZXh0dXJlKClcblxuICAgIHRoaXMudW5pdCA9IC0xXG4gICAgdGhpcy5iaW5kQ291bnQgPSAwXG5cbiAgICB0aGlzLnRleEluZm8gPSBuZXcgVGV4SW5mbygpXG5cbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgIHRoaXMuc3RhdHMgPSB7c2l6ZTogMH1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiB0ZW1wQmluZCAodGV4dHVyZSkge1xuICAgIGdsLmFjdGl2ZVRleHR1cmUoR0xfVEVYVFVSRTApXG4gICAgZ2wuYmluZFRleHR1cmUodGV4dHVyZS50YXJnZXQsIHRleHR1cmUudGV4dHVyZSlcbiAgfVxuXG4gIGZ1bmN0aW9uIHRlbXBSZXN0b3JlICgpIHtcbiAgICB2YXIgcHJldiA9IHRleHR1cmVVbml0c1swXVxuICAgIGlmIChwcmV2KSB7XG4gICAgICBnbC5iaW5kVGV4dHVyZShwcmV2LnRhcmdldCwgcHJldi50ZXh0dXJlKVxuICAgIH0gZWxzZSB7XG4gICAgICBnbC5iaW5kVGV4dHVyZShHTF9URVhUVVJFXzJELCBudWxsKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3kgKHRleHR1cmUpIHtcbiAgICB2YXIgaGFuZGxlID0gdGV4dHVyZS50ZXh0dXJlXG4gICAgXG4gICAgdmFyIHVuaXQgPSB0ZXh0dXJlLnVuaXRcbiAgICB2YXIgdGFyZ2V0ID0gdGV4dHVyZS50YXJnZXRcbiAgICBpZiAodW5pdCA+PSAwKSB7XG4gICAgICBnbC5hY3RpdmVUZXh0dXJlKEdMX1RFWFRVUkUwICsgdW5pdClcbiAgICAgIGdsLmJpbmRUZXh0dXJlKHRhcmdldCwgbnVsbClcbiAgICAgIHRleHR1cmVVbml0c1t1bml0XSA9IG51bGxcbiAgICB9XG4gICAgZ2wuZGVsZXRlVGV4dHVyZShoYW5kbGUpXG4gICAgdGV4dHVyZS50ZXh0dXJlID0gbnVsbFxuICAgIHRleHR1cmUucGFyYW1zID0gbnVsbFxuICAgIHRleHR1cmUucGl4ZWxzID0gbnVsbFxuICAgIHRleHR1cmUucmVmQ291bnQgPSAwXG4gICAgZGVsZXRlIHRleHR1cmVTZXRbdGV4dHVyZS5pZF1cbiAgICBzdGF0cy50ZXh0dXJlQ291bnQtLVxuICB9XG5cbiAgZXh0ZW5kKFJFR0xUZXh0dXJlLnByb3RvdHlwZSwge1xuICAgIGJpbmQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciB0ZXh0dXJlID0gdGhpc1xuICAgICAgdGV4dHVyZS5iaW5kQ291bnQgKz0gMVxuICAgICAgdmFyIHVuaXQgPSB0ZXh0dXJlLnVuaXRcbiAgICAgIGlmICh1bml0IDwgMCkge1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG51bVRleFVuaXRzOyArK2kpIHtcbiAgICAgICAgICB2YXIgb3RoZXIgPSB0ZXh0dXJlVW5pdHNbaV1cbiAgICAgICAgICBpZiAob3RoZXIpIHtcbiAgICAgICAgICAgIGlmIChvdGhlci5iaW5kQ291bnQgPiAwKSB7XG4gICAgICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBvdGhlci51bml0ID0gLTFcbiAgICAgICAgICB9XG4gICAgICAgICAgdGV4dHVyZVVuaXRzW2ldID0gdGV4dHVyZVxuICAgICAgICAgIHVuaXQgPSBpXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgfVxuICAgICAgICBpZiAodW5pdCA+PSBudW1UZXhVbml0cykge1xuICAgICAgICAgIFxuICAgICAgICB9XG4gICAgICAgIGlmIChjb25maWcucHJvZmlsZSAmJiBzdGF0cy5tYXhUZXh0dXJlVW5pdHMgPCAodW5pdCArIDEpKSB7XG4gICAgICAgICAgc3RhdHMubWF4VGV4dHVyZVVuaXRzID0gdW5pdCArIDEgLy8gKzEsIHNpbmNlIHRoZSB1bml0cyBhcmUgemVyby1iYXNlZFxuICAgICAgICB9XG4gICAgICAgIHRleHR1cmUudW5pdCA9IHVuaXRcbiAgICAgICAgZ2wuYWN0aXZlVGV4dHVyZShHTF9URVhUVVJFMCArIHVuaXQpXG4gICAgICAgIGdsLmJpbmRUZXh0dXJlKHRleHR1cmUudGFyZ2V0LCB0ZXh0dXJlLnRleHR1cmUpXG4gICAgICB9XG4gICAgICByZXR1cm4gdW5pdFxuICAgIH0sXG5cbiAgICB1bmJpbmQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHRoaXMuYmluZENvdW50IC09IDFcbiAgICB9LFxuXG4gICAgZGVjUmVmOiBmdW5jdGlvbiAoKSB7XG4gICAgICBpZiAoLS10aGlzLnJlZkNvdW50IDw9IDApIHtcbiAgICAgICAgZGVzdHJveSh0aGlzKVxuICAgICAgfVxuICAgIH1cbiAgfSlcblxuICBmdW5jdGlvbiBjcmVhdGVUZXh0dXJlMkQgKGEsIGIpIHtcbiAgICB2YXIgdGV4dHVyZSA9IG5ldyBSRUdMVGV4dHVyZShHTF9URVhUVVJFXzJEKVxuICAgIHRleHR1cmVTZXRbdGV4dHVyZS5pZF0gPSB0ZXh0dXJlXG4gICAgc3RhdHMudGV4dHVyZUNvdW50KytcblxuICAgIGZ1bmN0aW9uIHJlZ2xUZXh0dXJlMkQgKGEsIGIpIHtcbiAgICAgIHZhciB0ZXhJbmZvID0gdGV4dHVyZS50ZXhJbmZvXG4gICAgICBUZXhJbmZvLmNhbGwodGV4SW5mbylcbiAgICAgIHZhciBtaXBEYXRhID0gYWxsb2NNaXBNYXAoKVxuXG4gICAgICBpZiAodHlwZW9mIGEgPT09ICdudW1iZXInKSB7XG4gICAgICAgIGlmICh0eXBlb2YgYiA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICBwYXJzZU1pcE1hcEZyb21TaGFwZShtaXBEYXRhLCBhIHwgMCwgYiB8IDApXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcGFyc2VNaXBNYXBGcm9tU2hhcGUobWlwRGF0YSwgYSB8IDAsIGEgfCAwKVxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGEpIHtcbiAgICAgICAgXG4gICAgICAgIHBhcnNlVGV4SW5mbyh0ZXhJbmZvLCBhKVxuICAgICAgICBwYXJzZU1pcE1hcEZyb21PYmplY3QobWlwRGF0YSwgYSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIGVtcHR5IHRleHR1cmVzIGdldCBhc3NpZ25lZCBhIGRlZmF1bHQgc2hhcGUgb2YgMXgxXG4gICAgICAgIHBhcnNlTWlwTWFwRnJvbVNoYXBlKG1pcERhdGEsIDEsIDEpXG4gICAgICB9XG5cbiAgICAgIGlmICh0ZXhJbmZvLmdlbk1pcG1hcHMpIHtcbiAgICAgICAgbWlwRGF0YS5taXBtYXNrID0gKG1pcERhdGEud2lkdGggPDwgMSkgLSAxXG4gICAgICB9XG4gICAgICB0ZXh0dXJlLm1pcG1hc2sgPSBtaXBEYXRhLm1pcG1hc2tcblxuICAgICAgY29weUZsYWdzKHRleHR1cmUsIG1pcERhdGEpXG5cbiAgICAgIFxuICAgICAgdGV4dHVyZS5pbnRlcm5hbGZvcm1hdCA9IG1pcERhdGEuaW50ZXJuYWxmb3JtYXRcblxuICAgICAgcmVnbFRleHR1cmUyRC53aWR0aCA9IG1pcERhdGEud2lkdGhcbiAgICAgIHJlZ2xUZXh0dXJlMkQuaGVpZ2h0ID0gbWlwRGF0YS5oZWlnaHRcblxuICAgICAgdGVtcEJpbmQodGV4dHVyZSlcbiAgICAgIHNldE1pcE1hcChtaXBEYXRhLCBHTF9URVhUVVJFXzJEKVxuICAgICAgc2V0VGV4SW5mbyh0ZXhJbmZvLCBHTF9URVhUVVJFXzJEKVxuICAgICAgdGVtcFJlc3RvcmUoKVxuXG4gICAgICBmcmVlTWlwTWFwKG1pcERhdGEpXG5cbiAgICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgICB0ZXh0dXJlLnN0YXRzLnNpemUgPSBnZXRUZXh0dXJlU2l6ZShcbiAgICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0LFxuICAgICAgICAgIHRleHR1cmUudHlwZSxcbiAgICAgICAgICBtaXBEYXRhLndpZHRoLFxuICAgICAgICAgIG1pcERhdGEuaGVpZ2h0LFxuICAgICAgICAgIHRleEluZm8uZ2VuTWlwbWFwcyxcbiAgICAgICAgICBmYWxzZSlcbiAgICAgIH1cbiAgICAgIHJlZ2xUZXh0dXJlMkQuZm9ybWF0ID0gdGV4dHVyZUZvcm1hdHNJbnZlcnRbdGV4dHVyZS5pbnRlcm5hbGZvcm1hdF1cbiAgICAgIHJlZ2xUZXh0dXJlMkQudHlwZSA9IHRleHR1cmVUeXBlc0ludmVydFt0ZXh0dXJlLnR5cGVdXG5cbiAgICAgIHJlZ2xUZXh0dXJlMkQubWFnID0gbWFnRmlsdGVyc0ludmVydFt0ZXhJbmZvLm1hZ0ZpbHRlcl1cbiAgICAgIHJlZ2xUZXh0dXJlMkQubWluID0gbWluRmlsdGVyc0ludmVydFt0ZXhJbmZvLm1pbkZpbHRlcl1cblxuICAgICAgcmVnbFRleHR1cmUyRC53cmFwUyA9IHdyYXBNb2Rlc0ludmVydFt0ZXhJbmZvLndyYXBTXVxuICAgICAgcmVnbFRleHR1cmUyRC53cmFwVCA9IHdyYXBNb2Rlc0ludmVydFt0ZXhJbmZvLndyYXBUXVxuXG4gICAgICByZXR1cm4gcmVnbFRleHR1cmUyRFxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHN1YmltYWdlIChpbWFnZSwgeF8sIHlfLCBsZXZlbF8pIHtcbiAgICAgIFxuXG4gICAgICB2YXIgeCA9IHhfIHwgMFxuICAgICAgdmFyIHkgPSB5XyB8IDBcbiAgICAgIHZhciBsZXZlbCA9IGxldmVsXyB8IDBcblxuICAgICAgdmFyIGltYWdlRGF0YSA9IGFsbG9jSW1hZ2UoKVxuICAgICAgY29weUZsYWdzKGltYWdlRGF0YSwgdGV4dHVyZSlcbiAgICAgIGltYWdlRGF0YS53aWR0aCA9IDBcbiAgICAgIGltYWdlRGF0YS5oZWlnaHQgPSAwXG4gICAgICBwYXJzZUltYWdlKGltYWdlRGF0YSwgaW1hZ2UpXG4gICAgICBpbWFnZURhdGEud2lkdGggPSBpbWFnZURhdGEud2lkdGggfHwgKCh0ZXh0dXJlLndpZHRoID4+IGxldmVsKSAtIHgpXG4gICAgICBpbWFnZURhdGEuaGVpZ2h0ID0gaW1hZ2VEYXRhLmhlaWdodCB8fCAoKHRleHR1cmUuaGVpZ2h0ID4+IGxldmVsKSAtIHkpXG5cbiAgICAgIFxuICAgICAgXG4gICAgICBcbiAgICAgIFxuXG4gICAgICB0ZW1wQmluZCh0ZXh0dXJlKVxuICAgICAgc2V0U3ViSW1hZ2UoaW1hZ2VEYXRhLCBHTF9URVhUVVJFXzJELCB4LCB5LCBsZXZlbClcbiAgICAgIHRlbXBSZXN0b3JlKClcblxuICAgICAgZnJlZUltYWdlKGltYWdlRGF0YSlcblxuICAgICAgcmV0dXJuIHJlZ2xUZXh0dXJlMkRcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZXNpemUgKHdfLCBoXykge1xuICAgICAgdmFyIHcgPSB3XyB8IDBcbiAgICAgIHZhciBoID0gKGhfIHwgMCkgfHwgd1xuICAgICAgaWYgKHcgPT09IHRleHR1cmUud2lkdGggJiYgaCA9PT0gdGV4dHVyZS5oZWlnaHQpIHtcbiAgICAgICAgcmV0dXJuIHJlZ2xUZXh0dXJlMkRcbiAgICAgIH1cblxuICAgICAgcmVnbFRleHR1cmUyRC53aWR0aCA9IHRleHR1cmUud2lkdGggPSB3XG4gICAgICByZWdsVGV4dHVyZTJELmhlaWdodCA9IHRleHR1cmUuaGVpZ2h0ID0gaFxuXG4gICAgICB0ZW1wQmluZCh0ZXh0dXJlKVxuICAgICAgZm9yICh2YXIgaSA9IDA7IHRleHR1cmUubWlwbWFzayA+PiBpOyArK2kpIHtcbiAgICAgICAgZ2wudGV4SW1hZ2UyRChcbiAgICAgICAgICBHTF9URVhUVVJFXzJELFxuICAgICAgICAgIGksXG4gICAgICAgICAgdGV4dHVyZS5mb3JtYXQsXG4gICAgICAgICAgdyA+PiBpLFxuICAgICAgICAgIGggPj4gaSxcbiAgICAgICAgICAwLFxuICAgICAgICAgIHRleHR1cmUuZm9ybWF0LFxuICAgICAgICAgIHRleHR1cmUudHlwZSxcbiAgICAgICAgICBudWxsKVxuICAgICAgfVxuICAgICAgdGVtcFJlc3RvcmUoKVxuXG4gICAgICAvLyBhbHNvLCByZWNvbXB1dGUgdGhlIHRleHR1cmUgc2l6ZS5cbiAgICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgICB0ZXh0dXJlLnN0YXRzLnNpemUgPSBnZXRUZXh0dXJlU2l6ZShcbiAgICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0LFxuICAgICAgICAgIHRleHR1cmUudHlwZSxcbiAgICAgICAgICB3LFxuICAgICAgICAgIGgsXG4gICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgZmFsc2UpXG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZWdsVGV4dHVyZTJEXG4gICAgfVxuXG4gICAgcmVnbFRleHR1cmUyRChhLCBiKVxuXG4gICAgcmVnbFRleHR1cmUyRC5zdWJpbWFnZSA9IHN1YmltYWdlXG4gICAgcmVnbFRleHR1cmUyRC5yZXNpemUgPSByZXNpemVcbiAgICByZWdsVGV4dHVyZTJELl9yZWdsVHlwZSA9ICd0ZXh0dXJlMmQnXG4gICAgcmVnbFRleHR1cmUyRC5fdGV4dHVyZSA9IHRleHR1cmVcbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgIHJlZ2xUZXh0dXJlMkQuc3RhdHMgPSB0ZXh0dXJlLnN0YXRzXG4gICAgfVxuICAgIHJlZ2xUZXh0dXJlMkQuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHRleHR1cmUuZGVjUmVmKClcbiAgICB9XG5cbiAgICByZXR1cm4gcmVnbFRleHR1cmUyRFxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlVGV4dHVyZUN1YmUgKGEwLCBhMSwgYTIsIGEzLCBhNCwgYTUpIHtcbiAgICB2YXIgdGV4dHVyZSA9IG5ldyBSRUdMVGV4dHVyZShHTF9URVhUVVJFX0NVQkVfTUFQKVxuICAgIHRleHR1cmVTZXRbdGV4dHVyZS5pZF0gPSB0ZXh0dXJlXG4gICAgc3RhdHMuY3ViZUNvdW50KytcblxuICAgIHZhciBmYWNlcyA9IG5ldyBBcnJheSg2KVxuXG4gICAgZnVuY3Rpb24gcmVnbFRleHR1cmVDdWJlIChhMCwgYTEsIGEyLCBhMywgYTQsIGE1KSB7XG4gICAgICB2YXIgaVxuICAgICAgdmFyIHRleEluZm8gPSB0ZXh0dXJlLnRleEluZm9cbiAgICAgIFRleEluZm8uY2FsbCh0ZXhJbmZvKVxuICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICBmYWNlc1tpXSA9IGFsbG9jTWlwTWFwKClcbiAgICAgIH1cblxuICAgICAgaWYgKHR5cGVvZiBhMCA9PT0gJ251bWJlcicgfHwgIWEwKSB7XG4gICAgICAgIHZhciBzID0gKGEwIHwgMCkgfHwgMVxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgICAgcGFyc2VNaXBNYXBGcm9tU2hhcGUoZmFjZXNbaV0sIHMsIHMpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGEwID09PSAnb2JqZWN0Jykge1xuICAgICAgICBpZiAoYTEpIHtcbiAgICAgICAgICBwYXJzZU1pcE1hcEZyb21PYmplY3QoZmFjZXNbMF0sIGEwKVxuICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbU9iamVjdChmYWNlc1sxXSwgYTEpXG4gICAgICAgICAgcGFyc2VNaXBNYXBGcm9tT2JqZWN0KGZhY2VzWzJdLCBhMilcbiAgICAgICAgICBwYXJzZU1pcE1hcEZyb21PYmplY3QoZmFjZXNbM10sIGEzKVxuICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbU9iamVjdChmYWNlc1s0XSwgYTQpXG4gICAgICAgICAgcGFyc2VNaXBNYXBGcm9tT2JqZWN0KGZhY2VzWzVdLCBhNSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwYXJzZVRleEluZm8odGV4SW5mbywgYTApXG4gICAgICAgICAgcGFyc2VGbGFncyh0ZXh0dXJlLCBhMClcbiAgICAgICAgICBpZiAoJ2ZhY2VzJyBpbiBhMCkge1xuICAgICAgICAgICAgdmFyIGZhY2VfaW5wdXQgPSBhMC5mYWNlc1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBjb3B5RmxhZ3MoZmFjZXNbaV0sIHRleHR1cmUpXG4gICAgICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbU9iamVjdChmYWNlc1tpXSwgZmFjZV9pbnB1dFtpXSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICAgICAgICBwYXJzZU1pcE1hcEZyb21PYmplY3QoZmFjZXNbaV0sIGEwKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgXG4gICAgICB9XG5cbiAgICAgIGNvcHlGbGFncyh0ZXh0dXJlLCBmYWNlc1swXSlcbiAgICAgIGlmICh0ZXhJbmZvLmdlbk1pcG1hcHMpIHtcbiAgICAgICAgdGV4dHVyZS5taXBtYXNrID0gKGZhY2VzWzBdLndpZHRoIDw8IDEpIC0gMVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGV4dHVyZS5taXBtYXNrID0gZmFjZXNbMF0ubWlwbWFza1xuICAgICAgfVxuXG4gICAgICBcbiAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQgPSBmYWNlc1swXS5pbnRlcm5hbGZvcm1hdFxuXG4gICAgICByZWdsVGV4dHVyZUN1YmUud2lkdGggPSBmYWNlc1swXS53aWR0aFxuICAgICAgcmVnbFRleHR1cmVDdWJlLmhlaWdodCA9IGZhY2VzWzBdLmhlaWdodFxuXG4gICAgICB0ZW1wQmluZCh0ZXh0dXJlKVxuICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICBzZXRNaXBNYXAoZmFjZXNbaV0sIEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCArIGkpXG4gICAgICB9XG4gICAgICBzZXRUZXhJbmZvKHRleEluZm8sIEdMX1RFWFRVUkVfQ1VCRV9NQVApXG4gICAgICB0ZW1wUmVzdG9yZSgpXG5cbiAgICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgICB0ZXh0dXJlLnN0YXRzLnNpemUgPSBnZXRUZXh0dXJlU2l6ZShcbiAgICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0LFxuICAgICAgICAgIHRleHR1cmUudHlwZSxcbiAgICAgICAgICByZWdsVGV4dHVyZUN1YmUud2lkdGgsXG4gICAgICAgICAgcmVnbFRleHR1cmVDdWJlLmhlaWdodCxcbiAgICAgICAgICB0ZXhJbmZvLmdlbk1pcG1hcHMsXG4gICAgICAgICAgdHJ1ZSlcbiAgICAgIH1cblxuICAgICAgcmVnbFRleHR1cmVDdWJlLmZvcm1hdCA9IHRleHR1cmVGb3JtYXRzSW52ZXJ0W3RleHR1cmUuaW50ZXJuYWxmb3JtYXRdXG4gICAgICByZWdsVGV4dHVyZUN1YmUudHlwZSA9IHRleHR1cmVUeXBlc0ludmVydFt0ZXh0dXJlLnR5cGVdXG5cbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS5tYWcgPSBtYWdGaWx0ZXJzSW52ZXJ0W3RleEluZm8ubWFnRmlsdGVyXVxuICAgICAgcmVnbFRleHR1cmVDdWJlLm1pbiA9IG1pbkZpbHRlcnNJbnZlcnRbdGV4SW5mby5taW5GaWx0ZXJdXG5cbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS53cmFwUyA9IHdyYXBNb2Rlc0ludmVydFt0ZXhJbmZvLndyYXBTXVxuICAgICAgcmVnbFRleHR1cmVDdWJlLndyYXBUID0gd3JhcE1vZGVzSW52ZXJ0W3RleEluZm8ud3JhcFRdXG5cbiAgICAgIGZvciAoaSA9IDA7IGkgPCA2OyArK2kpIHtcbiAgICAgICAgZnJlZU1pcE1hcChmYWNlc1tpXSlcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJlZ2xUZXh0dXJlQ3ViZVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHN1YmltYWdlIChmYWNlLCBpbWFnZSwgeF8sIHlfLCBsZXZlbF8pIHtcbiAgICAgIFxuICAgICAgXG5cbiAgICAgIHZhciB4ID0geF8gfCAwXG4gICAgICB2YXIgeSA9IHlfIHwgMFxuICAgICAgdmFyIGxldmVsID0gbGV2ZWxfIHwgMFxuXG4gICAgICB2YXIgaW1hZ2VEYXRhID0gYWxsb2NJbWFnZSgpXG4gICAgICBjb3B5RmxhZ3MoaW1hZ2VEYXRhLCB0ZXh0dXJlKVxuICAgICAgaW1hZ2VEYXRhLndpZHRoID0gMFxuICAgICAgaW1hZ2VEYXRhLmhlaWdodCA9IDBcbiAgICAgIHBhcnNlSW1hZ2UoaW1hZ2VEYXRhLCBpbWFnZSlcbiAgICAgIGltYWdlRGF0YS53aWR0aCA9IGltYWdlRGF0YS53aWR0aCB8fCAoKHRleHR1cmUud2lkdGggPj4gbGV2ZWwpIC0geClcbiAgICAgIGltYWdlRGF0YS5oZWlnaHQgPSBpbWFnZURhdGEuaGVpZ2h0IHx8ICgodGV4dHVyZS5oZWlnaHQgPj4gbGV2ZWwpIC0geSlcblxuICAgICAgXG4gICAgICBcbiAgICAgIFxuICAgICAgXG5cbiAgICAgIHRlbXBCaW5kKHRleHR1cmUpXG4gICAgICBzZXRTdWJJbWFnZShpbWFnZURhdGEsIEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCArIGZhY2UsIHgsIHksIGxldmVsKVxuICAgICAgdGVtcFJlc3RvcmUoKVxuXG4gICAgICBmcmVlSW1hZ2UoaW1hZ2VEYXRhKVxuXG4gICAgICByZXR1cm4gcmVnbFRleHR1cmVDdWJlXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVzaXplIChyYWRpdXNfKSB7XG4gICAgICB2YXIgcmFkaXVzID0gcmFkaXVzXyB8IDBcbiAgICAgIGlmIChyYWRpdXMgPT09IHRleHR1cmUud2lkdGgpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG5cbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS53aWR0aCA9IHRleHR1cmUud2lkdGggPSByYWRpdXNcbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS5oZWlnaHQgPSB0ZXh0dXJlLmhlaWdodCA9IHJhZGl1c1xuXG4gICAgICB0ZW1wQmluZCh0ZXh0dXJlKVxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCA2OyArK2kpIHtcbiAgICAgICAgZm9yICh2YXIgaiA9IDA7IHRleHR1cmUubWlwbWFzayA+PiBqOyArK2opIHtcbiAgICAgICAgICBnbC50ZXhJbWFnZTJEKFxuICAgICAgICAgICAgR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YICsgaSxcbiAgICAgICAgICAgIGosXG4gICAgICAgICAgICB0ZXh0dXJlLmZvcm1hdCxcbiAgICAgICAgICAgIHJhZGl1cyA+PiBqLFxuICAgICAgICAgICAgcmFkaXVzID4+IGosXG4gICAgICAgICAgICAwLFxuICAgICAgICAgICAgdGV4dHVyZS5mb3JtYXQsXG4gICAgICAgICAgICB0ZXh0dXJlLnR5cGUsXG4gICAgICAgICAgICBudWxsKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICB0ZW1wUmVzdG9yZSgpXG5cbiAgICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgICB0ZXh0dXJlLnN0YXRzLnNpemUgPSBnZXRUZXh0dXJlU2l6ZShcbiAgICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0LFxuICAgICAgICAgIHRleHR1cmUudHlwZSxcbiAgICAgICAgICByZWdsVGV4dHVyZUN1YmUud2lkdGgsXG4gICAgICAgICAgcmVnbFRleHR1cmVDdWJlLmhlaWdodCxcbiAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICB0cnVlKVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmVnbFRleHR1cmVDdWJlXG4gICAgfVxuXG4gICAgcmVnbFRleHR1cmVDdWJlKGEwLCBhMSwgYTIsIGEzLCBhNCwgYTUpXG5cbiAgICByZWdsVGV4dHVyZUN1YmUuc3ViaW1hZ2UgPSBzdWJpbWFnZVxuICAgIHJlZ2xUZXh0dXJlQ3ViZS5yZXNpemUgPSByZXNpemVcbiAgICByZWdsVGV4dHVyZUN1YmUuX3JlZ2xUeXBlID0gJ3RleHR1cmVDdWJlJ1xuICAgIHJlZ2xUZXh0dXJlQ3ViZS5fdGV4dHVyZSA9IHRleHR1cmVcbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS5zdGF0cyA9IHRleHR1cmUuc3RhdHNcbiAgICB9XG4gICAgcmVnbFRleHR1cmVDdWJlLmRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB0ZXh0dXJlLmRlY1JlZigpXG4gICAgfVxuXG4gICAgcmV0dXJuIHJlZ2xUZXh0dXJlQ3ViZVxuICB9XG5cbiAgLy8gQ2FsbGVkIHdoZW4gcmVnbCBpcyBkZXN0cm95ZWRcbiAgZnVuY3Rpb24gZGVzdHJveVRleHR1cmVzICgpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG51bVRleFVuaXRzOyArK2kpIHtcbiAgICAgIGdsLmFjdGl2ZVRleHR1cmUoR0xfVEVYVFVSRTAgKyBpKVxuICAgICAgZ2wuYmluZFRleHR1cmUoR0xfVEVYVFVSRV8yRCwgbnVsbClcbiAgICAgIHRleHR1cmVVbml0c1tpXSA9IG51bGxcbiAgICB9XG4gICAgdmFsdWVzKHRleHR1cmVTZXQpLmZvckVhY2goZGVzdHJveSlcblxuICAgIHN0YXRzLmN1YmVDb3VudCA9IDBcbiAgICBzdGF0cy50ZXh0dXJlQ291bnQgPSAwXG4gIH1cblxuICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICBzdGF0cy5nZXRUb3RhbFRleHR1cmVTaXplID0gZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIHRvdGFsID0gMFxuICAgICAgT2JqZWN0LmtleXModGV4dHVyZVNldCkuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgIHRvdGFsICs9IHRleHR1cmVTZXRba2V5XS5zdGF0cy5zaXplXG4gICAgICB9KVxuICAgICAgcmV0dXJuIHRvdGFsXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcmVzdG9yZVRleHR1cmVzICgpIHtcbiAgICB2YWx1ZXModGV4dHVyZVNldCkuZm9yRWFjaChmdW5jdGlvbiAodGV4dHVyZSkge1xuICAgICAgdGV4dHVyZS50ZXh0dXJlID0gZ2wuY3JlYXRlVGV4dHVyZSgpXG4gICAgICBnbC5iaW5kVGV4dHVyZSh0ZXh0dXJlLnRhcmdldCwgdGV4dHVyZS50ZXh0dXJlKVxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCAzMjsgKytpKSB7XG4gICAgICAgIGlmICgodGV4dHVyZS5taXBtYXNrICYgKDEgPDwgaSkpID09PSAwKSB7XG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfVxuICAgICAgICBpZiAodGV4dHVyZS50YXJnZXQgPT09IEdMX1RFWFRVUkVfMkQpIHtcbiAgICAgICAgICBnbC50ZXhJbWFnZTJEKEdMX1RFWFRVUkVfMkQsXG4gICAgICAgICAgICBpLFxuICAgICAgICAgICAgdGV4dHVyZS5pbnRlcm5hbGZvcm1hdCxcbiAgICAgICAgICAgIHRleHR1cmUud2lkdGggPj4gaSxcbiAgICAgICAgICAgIHRleHR1cmUuaGVpZ2h0ID4+IGksXG4gICAgICAgICAgICAwLFxuICAgICAgICAgICAgdGV4dHVyZS5pbnRlcm5hbGZvcm1hdCxcbiAgICAgICAgICAgIHRleHR1cmUudHlwZSxcbiAgICAgICAgICAgIG51bGwpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCA2OyArK2opIHtcbiAgICAgICAgICAgIGdsLnRleEltYWdlMkQoR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YICsgaixcbiAgICAgICAgICAgICAgaSxcbiAgICAgICAgICAgICAgdGV4dHVyZS5pbnRlcm5hbGZvcm1hdCxcbiAgICAgICAgICAgICAgdGV4dHVyZS53aWR0aCA+PiBpLFxuICAgICAgICAgICAgICB0ZXh0dXJlLmhlaWdodCA+PiBpLFxuICAgICAgICAgICAgICAwLFxuICAgICAgICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0LFxuICAgICAgICAgICAgICB0ZXh0dXJlLnR5cGUsXG4gICAgICAgICAgICAgIG51bGwpXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBzZXRUZXhJbmZvKHRleHR1cmUudGV4SW5mbywgdGV4dHVyZS50YXJnZXQpXG4gICAgfSlcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY3JlYXRlMkQ6IGNyZWF0ZVRleHR1cmUyRCxcbiAgICBjcmVhdGVDdWJlOiBjcmVhdGVUZXh0dXJlQ3ViZSxcbiAgICBjbGVhcjogZGVzdHJveVRleHR1cmVzLFxuICAgIGdldFRleHR1cmU6IGZ1bmN0aW9uICh3cmFwcGVyKSB7XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH0sXG4gICAgcmVzdG9yZTogcmVzdG9yZVRleHR1cmVzXG4gIH1cbn1cbiIsInZhciBHTF9RVUVSWV9SRVNVTFRfRVhUID0gMHg4ODY2XG52YXIgR0xfUVVFUllfUkVTVUxUX0FWQUlMQUJMRV9FWFQgPSAweDg4NjdcbnZhciBHTF9USU1FX0VMQVBTRURfRVhUID0gMHg4OEJGXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGdsLCBleHRlbnNpb25zKSB7XG4gIHZhciBleHRUaW1lciA9IGV4dGVuc2lvbnMuZXh0X2Rpc2pvaW50X3RpbWVyX3F1ZXJ5XG5cbiAgaWYgKCFleHRUaW1lcikge1xuICAgIHJldHVybiBudWxsXG4gIH1cblxuICAvLyBRVUVSWSBQT09MIEJFR0lOXG4gIHZhciBxdWVyeVBvb2wgPSBbXVxuICBmdW5jdGlvbiBhbGxvY1F1ZXJ5ICgpIHtcbiAgICByZXR1cm4gcXVlcnlQb29sLnBvcCgpIHx8IGV4dFRpbWVyLmNyZWF0ZVF1ZXJ5RVhUKClcbiAgfVxuICBmdW5jdGlvbiBmcmVlUXVlcnkgKHF1ZXJ5KSB7XG4gICAgcXVlcnlQb29sLnB1c2gocXVlcnkpXG4gIH1cbiAgLy8gUVVFUlkgUE9PTCBFTkRcblxuICB2YXIgcGVuZGluZ1F1ZXJpZXMgPSBbXVxuICBmdW5jdGlvbiBiZWdpblF1ZXJ5IChzdGF0cykge1xuICAgIHZhciBxdWVyeSA9IGFsbG9jUXVlcnkoKVxuICAgIGV4dFRpbWVyLmJlZ2luUXVlcnlFWFQoR0xfVElNRV9FTEFQU0VEX0VYVCwgcXVlcnkpXG4gICAgcGVuZGluZ1F1ZXJpZXMucHVzaChxdWVyeSlcbiAgICBwdXNoU2NvcGVTdGF0cyhwZW5kaW5nUXVlcmllcy5sZW5ndGggLSAxLCBwZW5kaW5nUXVlcmllcy5sZW5ndGgsIHN0YXRzKVxuICB9XG5cbiAgZnVuY3Rpb24gZW5kUXVlcnkgKCkge1xuICAgIGV4dFRpbWVyLmVuZFF1ZXJ5RVhUKEdMX1RJTUVfRUxBUFNFRF9FWFQpXG4gIH1cblxuICAvL1xuICAvLyBQZW5kaW5nIHN0YXRzIHBvb2wuXG4gIC8vXG4gIGZ1bmN0aW9uIFBlbmRpbmdTdGF0cyAoKSB7XG4gICAgdGhpcy5zdGFydFF1ZXJ5SW5kZXggPSAtMVxuICAgIHRoaXMuZW5kUXVlcnlJbmRleCA9IC0xXG4gICAgdGhpcy5zdW0gPSAwXG4gICAgdGhpcy5zdGF0cyA9IG51bGxcbiAgfVxuICB2YXIgcGVuZGluZ1N0YXRzUG9vbCA9IFtdXG4gIGZ1bmN0aW9uIGFsbG9jUGVuZGluZ1N0YXRzICgpIHtcbiAgICByZXR1cm4gcGVuZGluZ1N0YXRzUG9vbC5wb3AoKSB8fCBuZXcgUGVuZGluZ1N0YXRzKClcbiAgfVxuICBmdW5jdGlvbiBmcmVlUGVuZGluZ1N0YXRzIChwZW5kaW5nU3RhdHMpIHtcbiAgICBwZW5kaW5nU3RhdHNQb29sLnB1c2gocGVuZGluZ1N0YXRzKVxuICB9XG4gIC8vIFBlbmRpbmcgc3RhdHMgcG9vbCBlbmRcblxuICB2YXIgcGVuZGluZ1N0YXRzID0gW11cbiAgZnVuY3Rpb24gcHVzaFNjb3BlU3RhdHMgKHN0YXJ0LCBlbmQsIHN0YXRzKSB7XG4gICAgdmFyIHBzID0gYWxsb2NQZW5kaW5nU3RhdHMoKVxuICAgIHBzLnN0YXJ0UXVlcnlJbmRleCA9IHN0YXJ0XG4gICAgcHMuZW5kUXVlcnlJbmRleCA9IGVuZFxuICAgIHBzLnN1bSA9IDBcbiAgICBwcy5zdGF0cyA9IHN0YXRzXG4gICAgcGVuZGluZ1N0YXRzLnB1c2gocHMpXG4gIH1cblxuICAvLyB3ZSBzaG91bGQgY2FsbCB0aGlzIGF0IHRoZSBiZWdpbm5pbmcgb2YgdGhlIGZyYW1lLFxuICAvLyBpbiBvcmRlciB0byB1cGRhdGUgZ3B1VGltZVxuICB2YXIgdGltZVN1bSA9IFtdXG4gIHZhciBxdWVyeVB0ciA9IFtdXG4gIGZ1bmN0aW9uIHVwZGF0ZSAoKSB7XG4gICAgdmFyIHB0ciwgaVxuXG4gICAgdmFyIG4gPSBwZW5kaW5nUXVlcmllcy5sZW5ndGhcbiAgICBpZiAobiA9PT0gMCkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgLy8gUmVzZXJ2ZSBzcGFjZVxuICAgIHF1ZXJ5UHRyLmxlbmd0aCA9IE1hdGgubWF4KHF1ZXJ5UHRyLmxlbmd0aCwgbiArIDEpXG4gICAgdGltZVN1bS5sZW5ndGggPSBNYXRoLm1heCh0aW1lU3VtLmxlbmd0aCwgbiArIDEpXG4gICAgdGltZVN1bVswXSA9IDBcbiAgICBxdWVyeVB0clswXSA9IDBcblxuICAgIC8vIFVwZGF0ZSBhbGwgcGVuZGluZyB0aW1lciBxdWVyaWVzXG4gICAgdmFyIHF1ZXJ5VGltZSA9IDBcbiAgICBwdHIgPSAwXG4gICAgZm9yIChpID0gMDsgaSA8IHBlbmRpbmdRdWVyaWVzLmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgcXVlcnkgPSBwZW5kaW5nUXVlcmllc1tpXVxuICAgICAgaWYgKGV4dFRpbWVyLmdldFF1ZXJ5T2JqZWN0RVhUKHF1ZXJ5LCBHTF9RVUVSWV9SRVNVTFRfQVZBSUxBQkxFX0VYVCkpIHtcbiAgICAgICAgcXVlcnlUaW1lICs9IGV4dFRpbWVyLmdldFF1ZXJ5T2JqZWN0RVhUKHF1ZXJ5LCBHTF9RVUVSWV9SRVNVTFRfRVhUKVxuICAgICAgICBmcmVlUXVlcnkocXVlcnkpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwZW5kaW5nUXVlcmllc1twdHIrK10gPSBxdWVyeVxuICAgICAgfVxuICAgICAgdGltZVN1bVtpICsgMV0gPSBxdWVyeVRpbWVcbiAgICAgIHF1ZXJ5UHRyW2kgKyAxXSA9IHB0clxuICAgIH1cbiAgICBwZW5kaW5nUXVlcmllcy5sZW5ndGggPSBwdHJcblxuICAgIC8vIFVwZGF0ZSBhbGwgcGVuZGluZyBzdGF0IHF1ZXJpZXNcbiAgICBwdHIgPSAwXG4gICAgZm9yIChpID0gMDsgaSA8IHBlbmRpbmdTdGF0cy5sZW5ndGg7ICsraSkge1xuICAgICAgdmFyIHN0YXRzID0gcGVuZGluZ1N0YXRzW2ldXG4gICAgICB2YXIgc3RhcnQgPSBzdGF0cy5zdGFydFF1ZXJ5SW5kZXhcbiAgICAgIHZhciBlbmQgPSBzdGF0cy5lbmRRdWVyeUluZGV4XG4gICAgICBzdGF0cy5zdW0gKz0gdGltZVN1bVtlbmRdIC0gdGltZVN1bVtzdGFydF1cbiAgICAgIHZhciBzdGFydFB0ciA9IHF1ZXJ5UHRyW3N0YXJ0XVxuICAgICAgdmFyIGVuZFB0ciA9IHF1ZXJ5UHRyW2VuZF1cbiAgICAgIGlmIChlbmRQdHIgPT09IHN0YXJ0UHRyKSB7XG4gICAgICAgIHN0YXRzLnN0YXRzLmdwdVRpbWUgKz0gc3RhdHMuc3VtIC8gMWU2XG4gICAgICAgIGZyZWVQZW5kaW5nU3RhdHMoc3RhdHMpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzdGF0cy5zdGFydFF1ZXJ5SW5kZXggPSBzdGFydFB0clxuICAgICAgICBzdGF0cy5lbmRRdWVyeUluZGV4ID0gZW5kUHRyXG4gICAgICAgIHBlbmRpbmdTdGF0c1twdHIrK10gPSBzdGF0c1xuICAgICAgfVxuICAgIH1cbiAgICBwZW5kaW5nU3RhdHMubGVuZ3RoID0gcHRyXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGJlZ2luUXVlcnk6IGJlZ2luUXVlcnksXG4gICAgZW5kUXVlcnk6IGVuZFF1ZXJ5LFxuICAgIHB1c2hTY29wZVN0YXRzOiBwdXNoU2NvcGVTdGF0cyxcbiAgICB1cGRhdGU6IHVwZGF0ZSxcbiAgICBnZXROdW1QZW5kaW5nUXVlcmllczogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIHBlbmRpbmdRdWVyaWVzLmxlbmd0aFxuICAgIH0sXG4gICAgY2xlYXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHF1ZXJ5UG9vbC5wdXNoLmFwcGx5KHF1ZXJ5UG9vbCwgcGVuZGluZ1F1ZXJpZXMpXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHF1ZXJ5UG9vbC5sZW5ndGg7IGkrKykge1xuICAgICAgICBleHRUaW1lci5kZWxldGVRdWVyeUVYVChxdWVyeVBvb2xbaV0pXG4gICAgICB9XG4gICAgICBwZW5kaW5nUXVlcmllcy5sZW5ndGggPSAwXG4gICAgICBxdWVyeVBvb2wubGVuZ3RoID0gMFxuICAgIH0sXG4gICAgcmVzdG9yZTogZnVuY3Rpb24gKCkge1xuICAgICAgcGVuZGluZ1F1ZXJpZXMubGVuZ3RoID0gMFxuICAgICAgcXVlcnlQb29sLmxlbmd0aCA9IDBcbiAgICB9XG4gIH1cbn1cbiIsIi8qIGdsb2JhbHMgcGVyZm9ybWFuY2UgKi9cbm1vZHVsZS5leHBvcnRzID1cbiAgKHR5cGVvZiBwZXJmb3JtYW5jZSAhPT0gJ3VuZGVmaW5lZCcgJiYgcGVyZm9ybWFuY2Uubm93KVxuICA/IGZ1bmN0aW9uICgpIHsgcmV0dXJuIHBlcmZvcm1hbmNlLm5vdygpIH1cbiAgOiBmdW5jdGlvbiAoKSB7IHJldHVybiArKG5ldyBEYXRlKCkpIH1cbiIsInZhciBleHRlbmQgPSByZXF1aXJlKCcuL2V4dGVuZCcpXG5cbmZ1bmN0aW9uIHNsaWNlICh4KSB7XG4gIHJldHVybiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbCh4KVxufVxuXG5mdW5jdGlvbiBqb2luICh4KSB7XG4gIHJldHVybiBzbGljZSh4KS5qb2luKCcnKVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNyZWF0ZUVudmlyb25tZW50ICgpIHtcbiAgLy8gVW5pcXVlIHZhcmlhYmxlIGlkIGNvdW50ZXJcbiAgdmFyIHZhckNvdW50ZXIgPSAwXG5cbiAgLy8gTGlua2VkIHZhbHVlcyBhcmUgcGFzc2VkIGZyb20gdGhpcyBzY29wZSBpbnRvIHRoZSBnZW5lcmF0ZWQgY29kZSBibG9ja1xuICAvLyBDYWxsaW5nIGxpbmsoKSBwYXNzZXMgYSB2YWx1ZSBpbnRvIHRoZSBnZW5lcmF0ZWQgc2NvcGUgYW5kIHJldHVybnNcbiAgLy8gdGhlIHZhcmlhYmxlIG5hbWUgd2hpY2ggaXQgaXMgYm91bmQgdG9cbiAgdmFyIGxpbmtlZE5hbWVzID0gW11cbiAgdmFyIGxpbmtlZFZhbHVlcyA9IFtdXG4gIGZ1bmN0aW9uIGxpbmsgKHZhbHVlKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsaW5rZWRWYWx1ZXMubGVuZ3RoOyArK2kpIHtcbiAgICAgIGlmIChsaW5rZWRWYWx1ZXNbaV0gPT09IHZhbHVlKSB7XG4gICAgICAgIHJldHVybiBsaW5rZWROYW1lc1tpXVxuICAgICAgfVxuICAgIH1cblxuICAgIHZhciBuYW1lID0gJ2cnICsgKHZhckNvdW50ZXIrKylcbiAgICBsaW5rZWROYW1lcy5wdXNoKG5hbWUpXG4gICAgbGlua2VkVmFsdWVzLnB1c2godmFsdWUpXG4gICAgcmV0dXJuIG5hbWVcbiAgfVxuXG4gIC8vIGNyZWF0ZSBhIGNvZGUgYmxvY2tcbiAgZnVuY3Rpb24gYmxvY2sgKCkge1xuICAgIHZhciBjb2RlID0gW11cbiAgICBmdW5jdGlvbiBwdXNoICgpIHtcbiAgICAgIGNvZGUucHVzaC5hcHBseShjb2RlLCBzbGljZShhcmd1bWVudHMpKVxuICAgIH1cblxuICAgIHZhciB2YXJzID0gW11cbiAgICBmdW5jdGlvbiBkZWYgKCkge1xuICAgICAgdmFyIG5hbWUgPSAndicgKyAodmFyQ291bnRlcisrKVxuICAgICAgdmFycy5wdXNoKG5hbWUpXG5cbiAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb2RlLnB1c2gobmFtZSwgJz0nKVxuICAgICAgICBjb2RlLnB1c2guYXBwbHkoY29kZSwgc2xpY2UoYXJndW1lbnRzKSlcbiAgICAgICAgY29kZS5wdXNoKCc7JylcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG5hbWVcbiAgICB9XG5cbiAgICByZXR1cm4gZXh0ZW5kKHB1c2gsIHtcbiAgICAgIGRlZjogZGVmLFxuICAgICAgdG9TdHJpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIGpvaW4oW1xuICAgICAgICAgICh2YXJzLmxlbmd0aCA+IDAgPyAndmFyICcgKyB2YXJzICsgJzsnIDogJycpLFxuICAgICAgICAgIGpvaW4oY29kZSlcbiAgICAgICAgXSlcbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgZnVuY3Rpb24gc2NvcGUgKCkge1xuICAgIHZhciBlbnRyeSA9IGJsb2NrKClcbiAgICB2YXIgZXhpdCA9IGJsb2NrKClcblxuICAgIHZhciBlbnRyeVRvU3RyaW5nID0gZW50cnkudG9TdHJpbmdcbiAgICB2YXIgZXhpdFRvU3RyaW5nID0gZXhpdC50b1N0cmluZ1xuXG4gICAgZnVuY3Rpb24gc2F2ZSAob2JqZWN0LCBwcm9wKSB7XG4gICAgICBleGl0KG9iamVjdCwgcHJvcCwgJz0nLCBlbnRyeS5kZWYob2JqZWN0LCBwcm9wKSwgJzsnKVxuICAgIH1cblxuICAgIHJldHVybiBleHRlbmQoZnVuY3Rpb24gKCkge1xuICAgICAgZW50cnkuYXBwbHkoZW50cnksIHNsaWNlKGFyZ3VtZW50cykpXG4gICAgfSwge1xuICAgICAgZGVmOiBlbnRyeS5kZWYsXG4gICAgICBlbnRyeTogZW50cnksXG4gICAgICBleGl0OiBleGl0LFxuICAgICAgc2F2ZTogc2F2ZSxcbiAgICAgIHNldDogZnVuY3Rpb24gKG9iamVjdCwgcHJvcCwgdmFsdWUpIHtcbiAgICAgICAgc2F2ZShvYmplY3QsIHByb3ApXG4gICAgICAgIGVudHJ5KG9iamVjdCwgcHJvcCwgJz0nLCB2YWx1ZSwgJzsnKVxuICAgICAgfSxcbiAgICAgIHRvU3RyaW5nOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBlbnRyeVRvU3RyaW5nKCkgKyBleGl0VG9TdHJpbmcoKVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiBjb25kaXRpb25hbCAoKSB7XG4gICAgdmFyIHByZWQgPSBqb2luKGFyZ3VtZW50cylcbiAgICB2YXIgdGhlbkJsb2NrID0gc2NvcGUoKVxuICAgIHZhciBlbHNlQmxvY2sgPSBzY29wZSgpXG5cbiAgICB2YXIgdGhlblRvU3RyaW5nID0gdGhlbkJsb2NrLnRvU3RyaW5nXG4gICAgdmFyIGVsc2VUb1N0cmluZyA9IGVsc2VCbG9jay50b1N0cmluZ1xuXG4gICAgcmV0dXJuIGV4dGVuZCh0aGVuQmxvY2ssIHtcbiAgICAgIHRoZW46IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhlbkJsb2NrLmFwcGx5KHRoZW5CbG9jaywgc2xpY2UoYXJndW1lbnRzKSlcbiAgICAgICAgcmV0dXJuIHRoaXNcbiAgICAgIH0sXG4gICAgICBlbHNlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGVsc2VCbG9jay5hcHBseShlbHNlQmxvY2ssIHNsaWNlKGFyZ3VtZW50cykpXG4gICAgICAgIHJldHVybiB0aGlzXG4gICAgICB9LFxuICAgICAgdG9TdHJpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGVsc2VDbGF1c2UgPSBlbHNlVG9TdHJpbmcoKVxuICAgICAgICBpZiAoZWxzZUNsYXVzZSkge1xuICAgICAgICAgIGVsc2VDbGF1c2UgPSAnZWxzZXsnICsgZWxzZUNsYXVzZSArICd9J1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBqb2luKFtcbiAgICAgICAgICAnaWYoJywgcHJlZCwgJyl7JyxcbiAgICAgICAgICB0aGVuVG9TdHJpbmcoKSxcbiAgICAgICAgICAnfScsIGVsc2VDbGF1c2VcbiAgICAgICAgXSlcbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgLy8gcHJvY2VkdXJlIGxpc3RcbiAgdmFyIGdsb2JhbEJsb2NrID0gYmxvY2soKVxuICB2YXIgcHJvY2VkdXJlcyA9IHt9XG4gIGZ1bmN0aW9uIHByb2MgKG5hbWUsIGNvdW50KSB7XG4gICAgdmFyIGFyZ3MgPSBbXVxuICAgIGZ1bmN0aW9uIGFyZyAoKSB7XG4gICAgICB2YXIgbmFtZSA9ICdhJyArIGFyZ3MubGVuZ3RoXG4gICAgICBhcmdzLnB1c2gobmFtZSlcbiAgICAgIHJldHVybiBuYW1lXG4gICAgfVxuXG4gICAgY291bnQgPSBjb3VudCB8fCAwXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjb3VudDsgKytpKSB7XG4gICAgICBhcmcoKVxuICAgIH1cblxuICAgIHZhciBib2R5ID0gc2NvcGUoKVxuICAgIHZhciBib2R5VG9TdHJpbmcgPSBib2R5LnRvU3RyaW5nXG5cbiAgICB2YXIgcmVzdWx0ID0gcHJvY2VkdXJlc1tuYW1lXSA9IGV4dGVuZChib2R5LCB7XG4gICAgICBhcmc6IGFyZyxcbiAgICAgIHRvU3RyaW5nOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBqb2luKFtcbiAgICAgICAgICAnZnVuY3Rpb24oJywgYXJncy5qb2luKCksICcpeycsXG4gICAgICAgICAgYm9keVRvU3RyaW5nKCksXG4gICAgICAgICAgJ30nXG4gICAgICAgIF0pXG4gICAgICB9XG4gICAgfSlcblxuICAgIHJldHVybiByZXN1bHRcbiAgfVxuXG4gIGZ1bmN0aW9uIGNvbXBpbGUgKCkge1xuICAgIHZhciBjb2RlID0gWydcInVzZSBzdHJpY3RcIjsnLFxuICAgICAgZ2xvYmFsQmxvY2ssXG4gICAgICAncmV0dXJuIHsnXVxuICAgIE9iamVjdC5rZXlzKHByb2NlZHVyZXMpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIGNvZGUucHVzaCgnXCInLCBuYW1lLCAnXCI6JywgcHJvY2VkdXJlc1tuYW1lXS50b1N0cmluZygpLCAnLCcpXG4gICAgfSlcbiAgICBjb2RlLnB1c2goJ30nKVxuICAgIHZhciBzcmMgPSBqb2luKGNvZGUpXG4gICAgICAucmVwbGFjZSgvOy9nLCAnO1xcbicpXG4gICAgICAucmVwbGFjZSgvfS9nLCAnfVxcbicpXG4gICAgICAucmVwbGFjZSgvey9nLCAne1xcbicpXG4gICAgdmFyIHByb2MgPSBGdW5jdGlvbi5hcHBseShudWxsLCBsaW5rZWROYW1lcy5jb25jYXQoc3JjKSlcbiAgICByZXR1cm4gcHJvYy5hcHBseShudWxsLCBsaW5rZWRWYWx1ZXMpXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGdsb2JhbDogZ2xvYmFsQmxvY2ssXG4gICAgbGluazogbGluayxcbiAgICBibG9jazogYmxvY2ssXG4gICAgcHJvYzogcHJvYyxcbiAgICBzY29wZTogc2NvcGUsXG4gICAgY29uZDogY29uZGl0aW9uYWwsXG4gICAgY29tcGlsZTogY29tcGlsZVxuICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChiYXNlLCBvcHRzKSB7XG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXMob3B0cylcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBrZXlzLmxlbmd0aDsgKytpKSB7XG4gICAgYmFzZVtrZXlzW2ldXSA9IG9wdHNba2V5c1tpXV1cbiAgfVxuICByZXR1cm4gYmFzZVxufVxuIiwidmFyIHBvb2wgPSByZXF1aXJlKCcuL3Bvb2wnKVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgc2hhcGU6IGFycmF5U2hhcGUsXG4gIGZsYXR0ZW46IGZsYXR0ZW5BcnJheVxufVxuXG5mdW5jdGlvbiBmbGF0dGVuMUQgKGFycmF5LCBueCwgb3V0KSB7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbng7ICsraSkge1xuICAgIG91dFtpXSA9IGFycmF5W2ldXG4gIH1cbn1cblxuZnVuY3Rpb24gZmxhdHRlbjJEIChhcnJheSwgbngsIG55LCBvdXQpIHtcbiAgdmFyIHB0ciA9IDBcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBueDsgKytpKSB7XG4gICAgdmFyIHJvdyA9IGFycmF5W2ldXG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBueTsgKytqKSB7XG4gICAgICBvdXRbcHRyKytdID0gcm93W2pdXG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGZsYXR0ZW4zRCAoYXJyYXksIG54LCBueSwgbnosIG91dCwgcHRyXykge1xuICB2YXIgcHRyID0gcHRyX1xuICBmb3IgKHZhciBpID0gMDsgaSA8IG54OyArK2kpIHtcbiAgICB2YXIgcm93ID0gYXJyYXlbaV1cbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IG55OyArK2opIHtcbiAgICAgIHZhciBjb2wgPSByb3dbal1cbiAgICAgIGZvciAodmFyIGsgPSAwOyBrIDwgbno7ICsraykge1xuICAgICAgICBvdXRbcHRyKytdID0gY29sW2tdXG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGZsYXR0ZW5SZWMgKGFycmF5LCBzaGFwZSwgbGV2ZWwsIG91dCwgcHRyKSB7XG4gIHZhciBzdHJpZGUgPSAxXG4gIGZvciAodmFyIGkgPSBsZXZlbCArIDE7IGkgPCBzaGFwZS5sZW5ndGg7ICsraSkge1xuICAgIHN0cmlkZSAqPSBzaGFwZVtpXVxuICB9XG4gIHZhciBuID0gc2hhcGVbbGV2ZWxdXG4gIGlmIChzaGFwZS5sZW5ndGggLSBsZXZlbCA9PT0gNCkge1xuICAgIHZhciBueCA9IHNoYXBlW2xldmVsICsgMV1cbiAgICB2YXIgbnkgPSBzaGFwZVtsZXZlbCArIDJdXG4gICAgdmFyIG56ID0gc2hhcGVbbGV2ZWwgKyAzXVxuICAgIGZvciAoaSA9IDA7IGkgPCBuOyArK2kpIHtcbiAgICAgIGZsYXR0ZW4zRChhcnJheVtpXSwgbngsIG55LCBueiwgb3V0LCBwdHIpXG4gICAgICBwdHIgKz0gc3RyaWRlXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGZvciAoaSA9IDA7IGkgPCBuOyArK2kpIHtcbiAgICAgIGZsYXR0ZW5SZWMoYXJyYXlbaV0sIHNoYXBlLCBsZXZlbCArIDEsIG91dCwgcHRyKVxuICAgICAgcHRyICs9IHN0cmlkZVxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBmbGF0dGVuQXJyYXkgKGFycmF5LCBzaGFwZSwgdHlwZSwgb3V0Xykge1xuICB2YXIgc3ogPSAxXG4gIGlmIChzaGFwZS5sZW5ndGgpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHNoYXBlLmxlbmd0aDsgKytpKSB7XG4gICAgICBzeiAqPSBzaGFwZVtpXVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBzeiA9IDBcbiAgfVxuICB2YXIgb3V0ID0gb3V0XyB8fCBwb29sLmFsbG9jVHlwZSh0eXBlLCBzeilcbiAgc3dpdGNoIChzaGFwZS5sZW5ndGgpIHtcbiAgICBjYXNlIDA6XG4gICAgICBicmVha1xuICAgIGNhc2UgMTpcbiAgICAgIGZsYXR0ZW4xRChhcnJheSwgc2hhcGVbMF0sIG91dClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAyOlxuICAgICAgZmxhdHRlbjJEKGFycmF5LCBzaGFwZVswXSwgc2hhcGVbMV0sIG91dClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAzOlxuICAgICAgZmxhdHRlbjNEKGFycmF5LCBzaGFwZVswXSwgc2hhcGVbMV0sIHNoYXBlWzJdLCBvdXQsIDApXG4gICAgICBicmVha1xuICAgIGRlZmF1bHQ6XG4gICAgICBmbGF0dGVuUmVjKGFycmF5LCBzaGFwZSwgMCwgb3V0LCAwKVxuICB9XG4gIHJldHVybiBvdXRcbn1cblxuZnVuY3Rpb24gYXJyYXlTaGFwZSAoYXJyYXlfKSB7XG4gIHZhciBzaGFwZSA9IFtdXG4gIGZvciAodmFyIGFycmF5ID0gYXJyYXlfOyBhcnJheS5sZW5ndGg7IGFycmF5ID0gYXJyYXlbMF0pIHtcbiAgICBzaGFwZS5wdXNoKGFycmF5Lmxlbmd0aClcbiAgfVxuICByZXR1cm4gc2hhcGVcbn1cbiIsInZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL2lzLXR5cGVkLWFycmF5Jylcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaXNBcnJheUxpa2UgKHMpIHtcbiAgcmV0dXJuIEFycmF5LmlzQXJyYXkocykgfHwgaXNUeXBlZEFycmF5KHMpXG59XG4iLCJ2YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi9pcy10eXBlZC1hcnJheScpXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaXNOREFycmF5TGlrZSAob2JqKSB7XG4gIHJldHVybiAoXG4gICAgISFvYmogJiZcbiAgICB0eXBlb2Ygb2JqID09PSAnb2JqZWN0JyAmJlxuICAgIEFycmF5LmlzQXJyYXkob2JqLnNoYXBlKSAmJlxuICAgIEFycmF5LmlzQXJyYXkob2JqLnN0cmlkZSkgJiZcbiAgICB0eXBlb2Ygb2JqLm9mZnNldCA9PT0gJ251bWJlcicgJiZcbiAgICBvYmouc2hhcGUubGVuZ3RoID09PSBvYmouc3RyaWRlLmxlbmd0aCAmJlxuICAgIChBcnJheS5pc0FycmF5KG9iai5kYXRhKSB8fFxuICAgICAgaXNUeXBlZEFycmF5KG9iai5kYXRhKSkpXG59XG4iLCJ2YXIgZHR5cGVzID0gcmVxdWlyZSgnLi4vY29uc3RhbnRzL2FycmF5dHlwZXMuanNvbicpXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uICh4KSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoeCkgaW4gZHR5cGVzXG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGxvb3AgKG4sIGYpIHtcbiAgdmFyIHJlc3VsdCA9IEFycmF5KG4pXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbjsgKytpKSB7XG4gICAgcmVzdWx0W2ldID0gZihpKVxuICB9XG4gIHJldHVybiByZXN1bHRcbn1cbiIsInZhciBsb29wID0gcmVxdWlyZSgnLi9sb29wJylcblxudmFyIEdMX0JZVEUgPSA1MTIwXG52YXIgR0xfVU5TSUdORURfQllURSA9IDUxMjFcbnZhciBHTF9TSE9SVCA9IDUxMjJcbnZhciBHTF9VTlNJR05FRF9TSE9SVCA9IDUxMjNcbnZhciBHTF9JTlQgPSA1MTI0XG52YXIgR0xfVU5TSUdORURfSU5UID0gNTEyNVxudmFyIEdMX0ZMT0FUID0gNTEyNlxuXG52YXIgYnVmZmVyUG9vbCA9IGxvb3AoOCwgZnVuY3Rpb24gKCkge1xuICByZXR1cm4gW11cbn0pXG5cbmZ1bmN0aW9uIG5leHRQb3cxNiAodikge1xuICBmb3IgKHZhciBpID0gMTY7IGkgPD0gKDEgPDwgMjgpOyBpICo9IDE2KSB7XG4gICAgaWYgKHYgPD0gaSkge1xuICAgICAgcmV0dXJuIGlcbiAgICB9XG4gIH1cbiAgcmV0dXJuIDBcbn1cblxuZnVuY3Rpb24gbG9nMiAodikge1xuICB2YXIgciwgc2hpZnRcbiAgciA9ICh2ID4gMHhGRkZGKSA8PCA0XG4gIHYgPj4+PSByXG4gIHNoaWZ0ID0gKHYgPiAweEZGKSA8PCAzXG4gIHYgPj4+PSBzaGlmdDsgciB8PSBzaGlmdFxuICBzaGlmdCA9ICh2ID4gMHhGKSA8PCAyXG4gIHYgPj4+PSBzaGlmdDsgciB8PSBzaGlmdFxuICBzaGlmdCA9ICh2ID4gMHgzKSA8PCAxXG4gIHYgPj4+PSBzaGlmdDsgciB8PSBzaGlmdFxuICByZXR1cm4gciB8ICh2ID4+IDEpXG59XG5cbmZ1bmN0aW9uIGFsbG9jIChuKSB7XG4gIHZhciBzeiA9IG5leHRQb3cxNihuKVxuICB2YXIgYmluID0gYnVmZmVyUG9vbFtsb2cyKHN6KSA+PiAyXVxuICBpZiAoYmluLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4gYmluLnBvcCgpXG4gIH1cbiAgcmV0dXJuIG5ldyBBcnJheUJ1ZmZlcihzeilcbn1cblxuZnVuY3Rpb24gZnJlZSAoYnVmKSB7XG4gIGJ1ZmZlclBvb2xbbG9nMihidWYuYnl0ZUxlbmd0aCkgPj4gMl0ucHVzaChidWYpXG59XG5cbmZ1bmN0aW9uIGFsbG9jVHlwZSAodHlwZSwgbikge1xuICB2YXIgcmVzdWx0ID0gbnVsbFxuICBzd2l0Y2ggKHR5cGUpIHtcbiAgICBjYXNlIEdMX0JZVEU6XG4gICAgICByZXN1bHQgPSBuZXcgSW50OEFycmF5KGFsbG9jKG4pLCAwLCBuKVxuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX1VOU0lHTkVEX0JZVEU6XG4gICAgICByZXN1bHQgPSBuZXcgVWludDhBcnJheShhbGxvYyhuKSwgMCwgbilcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9TSE9SVDpcbiAgICAgIHJlc3VsdCA9IG5ldyBJbnQxNkFycmF5KGFsbG9jKDIgKiBuKSwgMCwgbilcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9VTlNJR05FRF9TSE9SVDpcbiAgICAgIHJlc3VsdCA9IG5ldyBVaW50MTZBcnJheShhbGxvYygyICogbiksIDAsIG4pXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfSU5UOlxuICAgICAgcmVzdWx0ID0gbmV3IEludDMyQXJyYXkoYWxsb2MoNCAqIG4pLCAwLCBuKVxuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX1VOU0lHTkVEX0lOVDpcbiAgICAgIHJlc3VsdCA9IG5ldyBVaW50MzJBcnJheShhbGxvYyg0ICogbiksIDAsIG4pXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfRkxPQVQ6XG4gICAgICByZXN1bHQgPSBuZXcgRmxvYXQzMkFycmF5KGFsbG9jKDQgKiBuKSwgMCwgbilcbiAgICAgIGJyZWFrXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBudWxsXG4gIH1cbiAgaWYgKHJlc3VsdC5sZW5ndGggIT09IG4pIHtcbiAgICByZXR1cm4gcmVzdWx0LnN1YmFycmF5KDAsIG4pXG4gIH1cbiAgcmV0dXJuIHJlc3VsdFxufVxuXG5mdW5jdGlvbiBmcmVlVHlwZSAoYXJyYXkpIHtcbiAgZnJlZShhcnJheS5idWZmZXIpXG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBhbGxvYzogYWxsb2MsXG4gIGZyZWU6IGZyZWUsXG4gIGFsbG9jVHlwZTogYWxsb2NUeXBlLFxuICBmcmVlVHlwZTogZnJlZVR5cGVcbn1cbiIsIi8qIGdsb2JhbHMgcmVxdWVzdEFuaW1hdGlvbkZyYW1lLCBjYW5jZWxBbmltYXRpb25GcmFtZSAqL1xuaWYgKHR5cGVvZiByZXF1ZXN0QW5pbWF0aW9uRnJhbWUgPT09ICdmdW5jdGlvbicgJiZcbiAgICB0eXBlb2YgY2FuY2VsQW5pbWF0aW9uRnJhbWUgPT09ICdmdW5jdGlvbicpIHtcbiAgbW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgbmV4dDogZnVuY3Rpb24gKHgpIHsgcmV0dXJuIHJlcXVlc3RBbmltYXRpb25GcmFtZSh4KSB9LFxuICAgIGNhbmNlbDogZnVuY3Rpb24gKHgpIHsgcmV0dXJuIGNhbmNlbEFuaW1hdGlvbkZyYW1lKHgpIH1cbiAgfVxufSBlbHNlIHtcbiAgbW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgbmV4dDogZnVuY3Rpb24gKGNiKSB7XG4gICAgICByZXR1cm4gc2V0VGltZW91dChjYiwgMTYpXG4gICAgfSxcbiAgICBjYW5jZWw6IGNsZWFyVGltZW91dFxuICB9XG59XG4iLCJ2YXIgcG9vbCA9IHJlcXVpcmUoJy4vcG9vbCcpXG5cbnZhciBGTE9BVCA9IG5ldyBGbG9hdDMyQXJyYXkoMSlcbnZhciBJTlQgPSBuZXcgVWludDMyQXJyYXkoRkxPQVQuYnVmZmVyKVxuXG52YXIgR0xfVU5TSUdORURfU0hPUlQgPSA1MTIzXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY29udmVydFRvSGFsZkZsb2F0IChhcnJheSkge1xuICB2YXIgdXNob3J0cyA9IHBvb2wuYWxsb2NUeXBlKEdMX1VOU0lHTkVEX1NIT1JULCBhcnJheS5sZW5ndGgpXG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnJheS5sZW5ndGg7ICsraSkge1xuICAgIGlmIChpc05hTihhcnJheVtpXSkpIHtcbiAgICAgIHVzaG9ydHNbaV0gPSAweGZmZmZcbiAgICB9IGVsc2UgaWYgKGFycmF5W2ldID09PSBJbmZpbml0eSkge1xuICAgICAgdXNob3J0c1tpXSA9IDB4N2MwMFxuICAgIH0gZWxzZSBpZiAoYXJyYXlbaV0gPT09IC1JbmZpbml0eSkge1xuICAgICAgdXNob3J0c1tpXSA9IDB4ZmMwMFxuICAgIH0gZWxzZSB7XG4gICAgICBGTE9BVFswXSA9IGFycmF5W2ldXG4gICAgICB2YXIgeCA9IElOVFswXVxuXG4gICAgICB2YXIgc2duID0gKHggPj4+IDMxKSA8PCAxNVxuICAgICAgdmFyIGV4cCA9ICgoeCA8PCAxKSA+Pj4gMjQpIC0gMTI3XG4gICAgICB2YXIgZnJhYyA9ICh4ID4+IDEzKSAmICgoMSA8PCAxMCkgLSAxKVxuXG4gICAgICBpZiAoZXhwIDwgLTI0KSB7XG4gICAgICAgIC8vIHJvdW5kIG5vbi1yZXByZXNlbnRhYmxlIGRlbm9ybWFscyB0byAwXG4gICAgICAgIHVzaG9ydHNbaV0gPSBzZ25cbiAgICAgIH0gZWxzZSBpZiAoZXhwIDwgLTE0KSB7XG4gICAgICAgIC8vIGhhbmRsZSBkZW5vcm1hbHNcbiAgICAgICAgdmFyIHMgPSAtMTQgLSBleHBcbiAgICAgICAgdXNob3J0c1tpXSA9IHNnbiArICgoZnJhYyArICgxIDw8IDEwKSkgPj4gcylcbiAgICAgIH0gZWxzZSBpZiAoZXhwID4gMTUpIHtcbiAgICAgICAgLy8gcm91bmQgb3ZlcmZsb3cgdG8gKy8tIEluZmluaXR5XG4gICAgICAgIHVzaG9ydHNbaV0gPSBzZ24gKyAweDdjMDBcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIG90aGVyd2lzZSBjb252ZXJ0IGRpcmVjdGx5XG4gICAgICAgIHVzaG9ydHNbaV0gPSBzZ24gKyAoKGV4cCArIDE1KSA8PCAxMCkgKyBmcmFjXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHVzaG9ydHNcbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKG9iaikge1xuICByZXR1cm4gT2JqZWN0LmtleXMob2JqKS5tYXAoZnVuY3Rpb24gKGtleSkgeyByZXR1cm4gb2JqW2tleV0gfSlcbn1cbiIsIi8vIENvbnRleHQgYW5kIGNhbnZhcyBjcmVhdGlvbiBoZWxwZXIgZnVuY3Rpb25zXG5cbnZhciBleHRlbmQgPSByZXF1aXJlKCcuL3V0aWwvZXh0ZW5kJylcblxuZnVuY3Rpb24gY3JlYXRlQ2FudmFzIChlbGVtZW50LCBvbkRvbmUsIHBpeGVsUmF0aW8pIHtcbiAgdmFyIGNhbnZhcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpXG4gIGV4dGVuZChjYW52YXMuc3R5bGUsIHtcbiAgICBib3JkZXI6IDAsXG4gICAgbWFyZ2luOiAwLFxuICAgIHBhZGRpbmc6IDAsXG4gICAgdG9wOiAwLFxuICAgIGxlZnQ6IDBcbiAgfSlcbiAgZWxlbWVudC5hcHBlbmRDaGlsZChjYW52YXMpXG5cbiAgaWYgKGVsZW1lbnQgPT09IGRvY3VtZW50LmJvZHkpIHtcbiAgICBjYW52YXMuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnXG4gICAgZXh0ZW5kKGVsZW1lbnQuc3R5bGUsIHtcbiAgICAgIG1hcmdpbjogMCxcbiAgICAgIHBhZGRpbmc6IDBcbiAgICB9KVxuICB9XG5cbiAgZnVuY3Rpb24gcmVzaXplICgpIHtcbiAgICB2YXIgdyA9IHdpbmRvdy5pbm5lcldpZHRoXG4gICAgdmFyIGggPSB3aW5kb3cuaW5uZXJIZWlnaHRcbiAgICBpZiAoZWxlbWVudCAhPT0gZG9jdW1lbnQuYm9keSkge1xuICAgICAgdmFyIGJvdW5kcyA9IGVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KClcbiAgICAgIHcgPSBib3VuZHMucmlnaHQgLSBib3VuZHMubGVmdFxuICAgICAgaCA9IGJvdW5kcy50b3AgLSBib3VuZHMuYm90dG9tXG4gICAgfVxuICAgIGNhbnZhcy53aWR0aCA9IHBpeGVsUmF0aW8gKiB3XG4gICAgY2FudmFzLmhlaWdodCA9IHBpeGVsUmF0aW8gKiBoXG4gICAgZXh0ZW5kKGNhbnZhcy5zdHlsZSwge1xuICAgICAgd2lkdGg6IHcgKyAncHgnLFxuICAgICAgaGVpZ2h0OiBoICsgJ3B4J1xuICAgIH0pXG4gIH1cblxuICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgcmVzaXplLCBmYWxzZSlcblxuICBmdW5jdGlvbiBvbkRlc3Ryb3kgKCkge1xuICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdyZXNpemUnLCByZXNpemUpXG4gICAgZWxlbWVudC5yZW1vdmVDaGlsZChjYW52YXMpXG4gIH1cblxuICByZXNpemUoKVxuXG4gIHJldHVybiB7XG4gICAgY2FudmFzOiBjYW52YXMsXG4gICAgb25EZXN0cm95OiBvbkRlc3Ryb3lcbiAgfVxufVxuXG5mdW5jdGlvbiBjcmVhdGVDb250ZXh0IChjYW52YXMsIGNvbnRleEF0dHJpYnV0ZXMpIHtcbiAgZnVuY3Rpb24gZ2V0IChuYW1lKSB7XG4gICAgdHJ5IHtcbiAgICAgIHJldHVybiBjYW52YXMuZ2V0Q29udGV4dChuYW1lLCBjb250ZXhBdHRyaWJ1dGVzKVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuICB9XG4gIHJldHVybiAoXG4gICAgZ2V0KCd3ZWJnbCcpIHx8XG4gICAgZ2V0KCdleHBlcmltZW50YWwtd2ViZ2wnKSB8fFxuICAgIGdldCgnd2ViZ2wtZXhwZXJpbWVudGFsJylcbiAgKVxufVxuXG5mdW5jdGlvbiBpc0hUTUxFbGVtZW50IChvYmopIHtcbiAgcmV0dXJuIChcbiAgICB0eXBlb2Ygb2JqLm5vZGVOYW1lID09PSAnc3RyaW5nJyAmJlxuICAgIHR5cGVvZiBvYmouYXBwZW5kQ2hpbGQgPT09ICdmdW5jdGlvbicgJiZcbiAgICB0eXBlb2Ygb2JqLmdldEJvdW5kaW5nQ2xpZW50UmVjdCA9PT0gJ2Z1bmN0aW9uJ1xuICApXG59XG5cbmZ1bmN0aW9uIGlzV2ViR0xDb250ZXh0IChvYmopIHtcbiAgcmV0dXJuIChcbiAgICB0eXBlb2Ygb2JqLmRyYXdBcnJheXMgPT09ICdmdW5jdGlvbicgfHxcbiAgICB0eXBlb2Ygb2JqLmRyYXdFbGVtZW50cyA9PT0gJ2Z1bmN0aW9uJ1xuICApXG59XG5cbmZ1bmN0aW9uIHBhcnNlRXh0ZW5zaW9ucyAoaW5wdXQpIHtcbiAgaWYgKHR5cGVvZiBpbnB1dCA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gaW5wdXQuc3BsaXQoKVxuICB9XG4gIFxuICByZXR1cm4gaW5wdXRcbn1cblxuZnVuY3Rpb24gZ2V0RWxlbWVudCAoZGVzYykge1xuICBpZiAodHlwZW9mIGRlc2MgPT09ICdzdHJpbmcnKSB7XG4gICAgXG4gICAgcmV0dXJuIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoZGVzYylcbiAgfVxuICByZXR1cm4gZGVzY1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHBhcnNlQXJncyAoYXJnc18pIHtcbiAgdmFyIGFyZ3MgPSBhcmdzXyB8fCB7fVxuICB2YXIgZWxlbWVudCwgY29udGFpbmVyLCBjYW52YXMsIGdsXG4gIHZhciBjb250ZXh0QXR0cmlidXRlcyA9IHt9XG4gIHZhciBleHRlbnNpb25zID0gW11cbiAgdmFyIG9wdGlvbmFsRXh0ZW5zaW9ucyA9IFtdXG4gIHZhciBwaXhlbFJhdGlvID0gKHR5cGVvZiB3aW5kb3cgPT09ICd1bmRlZmluZWQnID8gMSA6IHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvKVxuICB2YXIgcHJvZmlsZSA9IGZhbHNlXG4gIHZhciBvbkRvbmUgPSBmdW5jdGlvbiAoZXJyKSB7XG4gICAgaWYgKGVycikge1xuICAgICAgXG4gICAgfVxuICB9XG4gIHZhciBvbkRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7fVxuICBpZiAodHlwZW9mIGFyZ3MgPT09ICdzdHJpbmcnKSB7XG4gICAgXG4gICAgZWxlbWVudCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYXJncylcbiAgICBcbiAgfSBlbHNlIGlmICh0eXBlb2YgYXJncyA9PT0gJ29iamVjdCcpIHtcbiAgICBpZiAoaXNIVE1MRWxlbWVudChhcmdzKSkge1xuICAgICAgZWxlbWVudCA9IGFyZ3NcbiAgICB9IGVsc2UgaWYgKGlzV2ViR0xDb250ZXh0KGFyZ3MpKSB7XG4gICAgICBnbCA9IGFyZ3NcbiAgICAgIGNhbnZhcyA9IGdsLmNhbnZhc1xuICAgIH0gZWxzZSB7XG4gICAgICBcbiAgICAgIGlmICgnZ2wnIGluIGFyZ3MpIHtcbiAgICAgICAgZ2wgPSBhcmdzLmdsXG4gICAgICB9IGVsc2UgaWYgKCdjYW52YXMnIGluIGFyZ3MpIHtcbiAgICAgICAgY2FudmFzID0gZ2V0RWxlbWVudChhcmdzLmNhbnZhcylcbiAgICAgIH0gZWxzZSBpZiAoJ2NvbnRhaW5lcicgaW4gYXJncykge1xuICAgICAgICBjb250YWluZXIgPSBnZXRFbGVtZW50KGFyZ3MuY29udGFpbmVyKVxuICAgICAgfVxuICAgICAgaWYgKCdhdHRyaWJ1dGVzJyBpbiBhcmdzKSB7XG4gICAgICAgIGNvbnRleHRBdHRyaWJ1dGVzID0gYXJncy5hdHRyaWJ1dGVzXG4gICAgICAgIFxuICAgICAgfVxuICAgICAgaWYgKCdleHRlbnNpb25zJyBpbiBhcmdzKSB7XG4gICAgICAgIGV4dGVuc2lvbnMgPSBwYXJzZUV4dGVuc2lvbnMoYXJncy5leHRlbnNpb25zKVxuICAgICAgfVxuICAgICAgaWYgKCdvcHRpb25hbEV4dGVuc2lvbnMnIGluIGFyZ3MpIHtcbiAgICAgICAgb3B0aW9uYWxFeHRlbnNpb25zID0gcGFyc2VFeHRlbnNpb25zKGFyZ3Mub3B0aW9uYWxFeHRlbnNpb25zKVxuICAgICAgfVxuICAgICAgaWYgKCdvbkRvbmUnIGluIGFyZ3MpIHtcbiAgICAgICAgXG4gICAgICAgIG9uRG9uZSA9IGFyZ3Mub25Eb25lXG4gICAgICB9XG4gICAgICBpZiAoJ3Byb2ZpbGUnIGluIGFyZ3MpIHtcbiAgICAgICAgcHJvZmlsZSA9ICEhYXJncy5wcm9maWxlXG4gICAgICB9XG4gICAgICBpZiAoJ3BpeGVsUmF0aW8nIGluIGFyZ3MpIHtcbiAgICAgICAgcGl4ZWxSYXRpbyA9ICthcmdzLnBpeGVsUmF0aW9cbiAgICAgICAgXG4gICAgICB9XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIFxuICB9XG5cbiAgaWYgKGVsZW1lbnQpIHtcbiAgICBpZiAoZWxlbWVudC5ub2RlTmFtZS50b0xvd2VyQ2FzZSgpID09PSAnY2FudmFzJykge1xuICAgICAgY2FudmFzID0gZWxlbWVudFxuICAgIH0gZWxzZSB7XG4gICAgICBjb250YWluZXIgPSBlbGVtZW50XG4gICAgfVxuICB9XG5cbiAgaWYgKCFnbCkge1xuICAgIGlmICghY2FudmFzKSB7XG4gICAgICBcbiAgICAgIHZhciByZXN1bHQgPSBjcmVhdGVDYW52YXMoY29udGFpbmVyIHx8IGRvY3VtZW50LmJvZHksIG9uRG9uZSwgcGl4ZWxSYXRpbylcbiAgICAgIGlmICghcmVzdWx0KSB7XG4gICAgICAgIHJldHVybiBudWxsXG4gICAgICB9XG4gICAgICBjYW52YXMgPSByZXN1bHQuY2FudmFzXG4gICAgICBvbkRlc3Ryb3kgPSByZXN1bHQub25EZXN0cm95XG4gICAgfVxuICAgIGdsID0gY3JlYXRlQ29udGV4dChjYW52YXMsIGNvbnRleHRBdHRyaWJ1dGVzKVxuICB9XG5cbiAgaWYgKCFnbCkge1xuICAgIG9uRGVzdHJveSgpXG4gICAgb25Eb25lKCd3ZWJnbCBub3Qgc3VwcG9ydGVkLCB0cnkgdXBncmFkaW5nIHlvdXIgYnJvd3NlciBvciBncmFwaGljcyBkcml2ZXJzIGh0dHA6Ly9nZXQud2ViZ2wub3JnJylcbiAgICByZXR1cm4gbnVsbFxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBnbDogZ2wsXG4gICAgY2FudmFzOiBjYW52YXMsXG4gICAgY29udGFpbmVyOiBjb250YWluZXIsXG4gICAgZXh0ZW5zaW9uczogZXh0ZW5zaW9ucyxcbiAgICBvcHRpb25hbEV4dGVuc2lvbnM6IG9wdGlvbmFsRXh0ZW5zaW9ucyxcbiAgICBwaXhlbFJhdGlvOiBwaXhlbFJhdGlvLFxuICAgIHByb2ZpbGU6IHByb2ZpbGUsXG4gICAgb25Eb25lOiBvbkRvbmUsXG4gICAgb25EZXN0cm95OiBvbkRlc3Ryb3lcbiAgfVxufVxuIiwiLy8gQWxsIHZhbHVlcyBhbmQgc3RydWN0dXJlcyByZWZlcmVuY2VkIGZyb206XG4vLyBodHRwOi8vbXNkbi5taWNyb3NvZnQuY29tL2VuLXVzL2xpYnJhcnkvYmI5NDM5OTEuYXNweC9cbi8vXG4vLyBEWDEwIEN1YmVtYXAgc3VwcG9ydCBiYXNlZCBvblxuLy8gaHR0cHM6Ly9naXRodWIuY29tL2RhcmlvbWFuZXNrdS9jbWZ0L2lzc3Vlcy83I2lzc3VlY29tbWVudC02OTUxNjg0NFxuLy8gaHR0cHM6Ly9tc2RuLm1pY3Jvc29mdC5jb20vZW4tdXMvbGlicmFyeS93aW5kb3dzL2Rlc2t0b3AvYmI5NDM5ODModj12cy44NSkuYXNweFxuLy8gaHR0cHM6Ly9naXRodWIuY29tL3BsYXljYW52YXMvZW5naW5lL2Jsb2IvbWFzdGVyL3NyYy9yZXNvdXJjZXMvcmVzb3VyY2VzX3RleHR1cmUuanNcblxudmFyIEREU19NQUdJQyA9IDB4MjA1MzQ0NDRcbnZhciBERFNEX01JUE1BUENPVU5UID0gMHgyMDAwMFxudmFyIEREUEZfRk9VUkNDID0gMHg0XG5cbnZhciBGT1VSQ0NfRFhUMSA9IGZvdXJDQ1RvSW50MzIoJ0RYVDEnKVxudmFyIEZPVVJDQ19EWFQzID0gZm91ckNDVG9JbnQzMignRFhUMycpXG52YXIgRk9VUkNDX0RYVDUgPSBmb3VyQ0NUb0ludDMyKCdEWFQ1JylcbnZhciBGT1VSQ0NfRFgxMCA9IGZvdXJDQ1RvSW50MzIoJ0RYMTAnKVxudmFyIEZPVVJDQ19GUDMyRiA9IDExNiAvLyBEWEdJX0ZPUk1BVF9SMzJHMzJCMzJBMzJfRkxPQVRcblxudmFyIEREU0NBUFMyX0NVQkVNQVAgPSAweDIwMFxudmFyIEQzRDEwX1JFU09VUkNFX0RJTUVOU0lPTl9URVhUVVJFMkQgPSAzXG52YXIgRFhHSV9GT1JNQVRfUjMyRzMyQjMyQTMyX0ZMT0FUID0gMlxuXG4vLyBUaGUgaGVhZGVyIGxlbmd0aCBpbiAzMiBiaXQgaW50c1xudmFyIGhlYWRlckxlbmd0aEludCA9IDMxXG5cbi8vIE9mZnNldHMgaW50byB0aGUgaGVhZGVyIGFycmF5XG52YXIgb2ZmX21hZ2ljID0gMFxudmFyIG9mZl9zaXplID0gMVxudmFyIG9mZl9mbGFncyA9IDJcbnZhciBvZmZfaGVpZ2h0ID0gM1xudmFyIG9mZl93aWR0aCA9IDRcbnZhciBvZmZfbWlwbWFwQ291bnQgPSA3XG52YXIgb2ZmX3BmRmxhZ3MgPSAyMFxudmFyIG9mZl9wZkZvdXJDQyA9IDIxXG52YXIgb2ZmX2NhcHMyID0gMjhcblxubW9kdWxlLmV4cG9ydHMgPSBwYXJzZUhlYWRlcnNcblxuZnVuY3Rpb24gcGFyc2VIZWFkZXJzIChhcnJheUJ1ZmZlcikge1xuICB2YXIgaGVhZGVyID0gbmV3IEludDMyQXJyYXkoYXJyYXlCdWZmZXIsIDAsIGhlYWRlckxlbmd0aEludClcblxuICBpZiAoaGVhZGVyW29mZl9tYWdpY10gIT09IEREU19NQUdJQykge1xuICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBtYWdpYyBudW1iZXIgaW4gRERTIGhlYWRlcicpXG4gIH1cblxuICBpZiAoIWhlYWRlcltvZmZfcGZGbGFnc10gJiBERFBGX0ZPVVJDQykge1xuICAgIHRocm93IG5ldyBFcnJvcignVW5zdXBwb3J0ZWQgZm9ybWF0LCBtdXN0IGNvbnRhaW4gYSBGb3VyQ0MgY29kZScpXG4gIH1cblxuICB2YXIgYmxvY2tCeXRlc1xuICB2YXIgZm9ybWF0XG4gIHZhciBmb3VyQ0MgPSBoZWFkZXJbb2ZmX3BmRm91ckNDXVxuICBzd2l0Y2ggKGZvdXJDQykge1xuICAgIGNhc2UgRk9VUkNDX0RYVDE6XG4gICAgICBibG9ja0J5dGVzID0gOFxuICAgICAgZm9ybWF0ID0gJ2R4dDEnXG4gICAgICBicmVha1xuICAgIGNhc2UgRk9VUkNDX0RYVDM6XG4gICAgICBibG9ja0J5dGVzID0gMTZcbiAgICAgIGZvcm1hdCA9ICdkeHQzJ1xuICAgICAgYnJlYWtcbiAgICBjYXNlIEZPVVJDQ19EWFQ1OlxuICAgICAgYmxvY2tCeXRlcyA9IDE2XG4gICAgICBmb3JtYXQgPSAnZHh0NSdcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBGT1VSQ0NfRlAzMkY6XG4gICAgICBmb3JtYXQgPSAncmdiYTMyZidcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBGT1VSQ0NfRFgxMDpcbiAgICAgIHZhciBkeDEwSGVhZGVyID0gbmV3IFVpbnQzMkFycmF5KGFycmF5QnVmZmVyLnNsaWNlKDEyOCwgMTI4ICsgMjApKVxuICAgICAgZm9ybWF0ID0gZHgxMEhlYWRlclswXVxuICAgICAgdmFyIHJlc291cmNlRGltZW5zaW9uID0gZHgxMEhlYWRlclsxXVxuICAgICAgdmFyIG1pc2NGbGFnID0gZHgxMEhlYWRlclsyXVxuICAgICAgdmFyIGFycmF5U2l6ZSA9IGR4MTBIZWFkZXJbM11cbiAgICAgIHZhciBtaXNjRmxhZ3MyID0gZHgxMEhlYWRlcls0XVxuXG4gICAgICBpZiAocmVzb3VyY2VEaW1lbnNpb24gPT09IEQzRDEwX1JFU09VUkNFX0RJTUVOU0lPTl9URVhUVVJFMkQgJiYgZm9ybWF0ID09PSBEWEdJX0ZPUk1BVF9SMzJHMzJCMzJBMzJfRkxPQVQpIHtcbiAgICAgICAgZm9ybWF0ID0gJ3JnYmEzMmYnXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vuc3VwcG9ydGVkIERYMTAgdGV4dHVyZSBmb3JtYXQgJyArIGZvcm1hdClcbiAgICAgIH1cbiAgICAgIGJyZWFrXG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5zdXBwb3J0ZWQgRm91ckNDIGNvZGU6ICcgKyBpbnQzMlRvRm91ckNDKGZvdXJDQykpXG4gIH1cblxuICB2YXIgZmxhZ3MgPSBoZWFkZXJbb2ZmX2ZsYWdzXVxuICB2YXIgbWlwbWFwQ291bnQgPSAxXG5cbiAgaWYgKGZsYWdzICYgRERTRF9NSVBNQVBDT1VOVCkge1xuICAgIG1pcG1hcENvdW50ID0gTWF0aC5tYXgoMSwgaGVhZGVyW29mZl9taXBtYXBDb3VudF0pXG4gIH1cblxuICB2YXIgY3ViZW1hcCA9IGZhbHNlXG4gIHZhciBjYXBzMiA9IGhlYWRlcltvZmZfY2FwczJdXG4gIGlmIChjYXBzMiAmIEREU0NBUFMyX0NVQkVNQVApIHtcbiAgICBjdWJlbWFwID0gdHJ1ZVxuICB9XG5cbiAgdmFyIHdpZHRoID0gaGVhZGVyW29mZl93aWR0aF1cbiAgdmFyIGhlaWdodCA9IGhlYWRlcltvZmZfaGVpZ2h0XVxuICB2YXIgZGF0YU9mZnNldCA9IGhlYWRlcltvZmZfc2l6ZV0gKyA0XG4gIHZhciB0ZXhXaWR0aCA9IHdpZHRoXG4gIHZhciB0ZXhIZWlnaHQgPSBoZWlnaHRcbiAgdmFyIGltYWdlcyA9IFtdXG4gIHZhciBkYXRhTGVuZ3RoXG5cbiAgaWYgKGZvdXJDQyA9PT0gRk9VUkNDX0RYMTApIHtcbiAgICBkYXRhT2Zmc2V0ICs9IDIwXG4gIH1cblxuICBpZiAoY3ViZW1hcCkge1xuICAgIGZvciAodmFyIGYgPSAwOyBmIDwgNjsgZisrKSB7XG4gICAgICBpZiAoZm9ybWF0ICE9PSAncmdiYTMyZicpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdPbmx5IFJHQkEzMmYgY3ViZW1hcHMgYXJlIHN1cHBvcnRlZCcpXG4gICAgICB9XG4gICAgICB2YXIgYnBwID0gNCAqIDMyIC8gOFxuXG4gICAgICB3aWR0aCA9IHRleFdpZHRoXG4gICAgICBoZWlnaHQgPSB0ZXhIZWlnaHRcblxuICAgICAgLy8gY3ViZW1hcCBzaG91bGQgaGF2ZSBhbGwgbWlwbWFwIGxldmVscyBkZWZpbmVkXG4gICAgICAvLyBNYXRoLmxvZzIod2lkdGgpICsgMVxuICAgICAgdmFyIHJlcXVpcmVkTWlwTGV2ZWxzID0gTWF0aC5sb2cod2lkdGgpIC8gTWF0aC5sb2coMikgKyAxXG5cbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmVxdWlyZWRNaXBMZXZlbHM7IGkrKykge1xuICAgICAgICBkYXRhTGVuZ3RoID0gd2lkdGggKiBoZWlnaHQgKiBicHBcbiAgICAgICAgaW1hZ2VzLnB1c2goe1xuICAgICAgICAgIG9mZnNldDogZGF0YU9mZnNldCxcbiAgICAgICAgICBsZW5ndGg6IGRhdGFMZW5ndGgsXG4gICAgICAgICAgc2hhcGU6IFsgd2lkdGgsIGhlaWdodCBdXG4gICAgICAgIH0pXG4gICAgICAgIC8vIFJldXNlIGRhdGEgZnJvbSB0aGUgcHJldmlvdXMgbGV2ZWwgaWYgd2UgYXJlIGJleW9uZCBtaXBtYXBDb3VudFxuICAgICAgICAvLyBUaGlzIGlzIGhhY2sgZm9yIENNRlQgbm90IHB1Ymxpc2hpbmcgZnVsbCBtaXBtYXAgY2hhaW4gaHR0cHM6Ly9naXRodWIuY29tL2RhcmlvbWFuZXNrdS9jbWZ0L2lzc3Vlcy8xMFxuICAgICAgICBpZiAoaSA8IG1pcG1hcENvdW50KSB7XG4gICAgICAgICAgZGF0YU9mZnNldCArPSBkYXRhTGVuZ3RoXG4gICAgICAgIH1cbiAgICAgICAgd2lkdGggPSBNYXRoLmZsb29yKHdpZHRoIC8gMilcbiAgICAgICAgaGVpZ2h0ID0gTWF0aC5mbG9vcihoZWlnaHQgLyAyKVxuICAgICAgfVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG1pcG1hcENvdW50OyBpKyspIHtcbiAgICAgIGRhdGFMZW5ndGggPSBNYXRoLm1heCg0LCB3aWR0aCkgLyA0ICogTWF0aC5tYXgoNCwgaGVpZ2h0KSAvIDQgKiBibG9ja0J5dGVzXG5cbiAgICAgIGltYWdlcy5wdXNoKHtcbiAgICAgICAgb2Zmc2V0OiBkYXRhT2Zmc2V0LFxuICAgICAgICBsZW5ndGg6IGRhdGFMZW5ndGgsXG4gICAgICAgIHNoYXBlOiBbIHdpZHRoLCBoZWlnaHQgXVxuICAgICAgfSlcbiAgICAgIGRhdGFPZmZzZXQgKz0gZGF0YUxlbmd0aFxuICAgICAgd2lkdGggPSBNYXRoLmZsb29yKHdpZHRoIC8gMilcbiAgICAgIGhlaWdodCA9IE1hdGguZmxvb3IoaGVpZ2h0IC8gMilcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIHNoYXBlOiBbIHRleFdpZHRoLCB0ZXhIZWlnaHQgXSxcbiAgICBpbWFnZXM6IGltYWdlcyxcbiAgICBmb3JtYXQ6IGZvcm1hdCxcbiAgICBmbGFnczogZmxhZ3MsXG4gICAgY3ViZW1hcDogY3ViZW1hcFxuICB9XG59XG5cbmZ1bmN0aW9uIGZvdXJDQ1RvSW50MzIgKHZhbHVlKSB7XG4gIHJldHVybiB2YWx1ZS5jaGFyQ29kZUF0KDApICtcbiAgICAodmFsdWUuY2hhckNvZGVBdCgxKSA8PCA4KSArXG4gICAgKHZhbHVlLmNoYXJDb2RlQXQoMikgPDwgMTYpICtcbiAgICAodmFsdWUuY2hhckNvZGVBdCgzKSA8PCAyNClcbn1cblxuZnVuY3Rpb24gaW50MzJUb0ZvdXJDQyAodmFsdWUpIHtcbiAgcmV0dXJuIFN0cmluZy5mcm9tQ2hhckNvZGUoXG4gICAgdmFsdWUgJiAweGZmLFxuICAgICh2YWx1ZSA+PiA4KSAmIDB4ZmYsXG4gICAgKHZhbHVlID4+IDE2KSAmIDB4ZmYsXG4gICAgKHZhbHVlID4+IDI0KSAmIDB4ZmZcbiAgKVxufVxuIiwiLyogZ2xvYmFsIFhNTEh0dHBSZXF1ZXN0ICovXG52YXIgY29uZmlnUGFyYW1ldGVycyA9IFtcbiAgJ21hbmlmZXN0JyxcbiAgJ29uRG9uZScsXG4gICdvblByb2dyZXNzJyxcbiAgJ29uRXJyb3InXG5dXG5cbnZhciBtYW5pZmVzdFBhcmFtZXRlcnMgPSBbXG4gICd0eXBlJyxcbiAgJ3NyYycsXG4gICdzdHJlYW0nLFxuICAnY3JlZGVudGlhbHMnLFxuICAncGFyc2VyJ1xuXVxuXG52YXIgcGFyc2VyUGFyYW1ldGVycyA9IFtcbiAgJ29uRGF0YScsXG4gICdvbkRvbmUnXG5dXG5cbnZhciBTVEFURV9FUlJPUiA9IC0xXG52YXIgU1RBVEVfREFUQSA9IDBcbnZhciBTVEFURV9DT01QTEVURSA9IDFcblxuZnVuY3Rpb24gcmFpc2UgKG1lc3NhZ2UpIHtcbiAgdGhyb3cgbmV3IEVycm9yKCdyZXNsOiAnICsgbWVzc2FnZSlcbn1cblxuZnVuY3Rpb24gY2hlY2tUeXBlIChvYmplY3QsIHBhcmFtZXRlcnMsIG5hbWUpIHtcbiAgT2JqZWN0LmtleXMob2JqZWN0KS5mb3JFYWNoKGZ1bmN0aW9uIChwYXJhbSkge1xuICAgIGlmIChwYXJhbWV0ZXJzLmluZGV4T2YocGFyYW0pIDwgMCkge1xuICAgICAgcmFpc2UoJ2ludmFsaWQgcGFyYW1ldGVyIFwiJyArIHBhcmFtICsgJ1wiIGluICcgKyBuYW1lKVxuICAgIH1cbiAgfSlcbn1cblxuZnVuY3Rpb24gTG9hZGVyIChuYW1lLCBjYW5jZWwpIHtcbiAgdGhpcy5zdGF0ZSA9IFNUQVRFX0RBVEFcbiAgdGhpcy5yZWFkeSA9IGZhbHNlXG4gIHRoaXMucHJvZ3Jlc3MgPSAwXG4gIHRoaXMubmFtZSA9IG5hbWVcbiAgdGhpcy5jYW5jZWwgPSBjYW5jZWxcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiByZXNsIChjb25maWcpIHtcbiAgaWYgKHR5cGVvZiBjb25maWcgIT09ICdvYmplY3QnIHx8ICFjb25maWcpIHtcbiAgICByYWlzZSgnaW52YWxpZCBvciBtaXNzaW5nIGNvbmZpZ3VyYXRpb24nKVxuICB9XG5cbiAgY2hlY2tUeXBlKGNvbmZpZywgY29uZmlnUGFyYW1ldGVycywgJ2NvbmZpZycpXG5cbiAgdmFyIG1hbmlmZXN0ID0gY29uZmlnLm1hbmlmZXN0XG4gIGlmICh0eXBlb2YgbWFuaWZlc3QgIT09ICdvYmplY3QnIHx8ICFtYW5pZmVzdCkge1xuICAgIHJhaXNlKCdtaXNzaW5nIG1hbmlmZXN0JylcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldEZ1bmN0aW9uIChuYW1lLCBkZmx0KSB7XG4gICAgaWYgKG5hbWUgaW4gY29uZmlnKSB7XG4gICAgICB2YXIgZnVuYyA9IGNvbmZpZ1tuYW1lXVxuICAgICAgaWYgKHR5cGVvZiBmdW5jICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHJhaXNlKCdpbnZhbGlkIGNhbGxiYWNrIFwiJyArIG5hbWUgKyAnXCInKVxuICAgICAgfVxuICAgICAgcmV0dXJuIGZ1bmNcbiAgICB9XG4gICAgcmV0dXJuIG51bGxcbiAgfVxuXG4gIHZhciBvbkRvbmUgPSBnZXRGdW5jdGlvbignb25Eb25lJylcbiAgaWYgKCFvbkRvbmUpIHtcbiAgICByYWlzZSgnbWlzc2luZyBvbkRvbmUoKSBjYWxsYmFjaycpXG4gIH1cblxuICB2YXIgb25Qcm9ncmVzcyA9IGdldEZ1bmN0aW9uKCdvblByb2dyZXNzJylcbiAgdmFyIG9uRXJyb3IgPSBnZXRGdW5jdGlvbignb25FcnJvcicpXG5cbiAgdmFyIGFzc2V0cyA9IHt9XG5cbiAgdmFyIHN0YXRlID0gU1RBVEVfREFUQVxuXG4gIGZ1bmN0aW9uIGxvYWRYSFIgKHJlcXVlc3QpIHtcbiAgICB2YXIgbmFtZSA9IHJlcXVlc3QubmFtZVxuICAgIHZhciBzdHJlYW0gPSByZXF1ZXN0LnN0cmVhbVxuICAgIHZhciBiaW5hcnkgPSByZXF1ZXN0LnR5cGUgPT09ICdiaW5hcnknXG4gICAgdmFyIHBhcnNlciA9IHJlcXVlc3QucGFyc2VyXG5cbiAgICB2YXIgeGhyID0gbmV3IFhNTEh0dHBSZXF1ZXN0KClcbiAgICB2YXIgYXNzZXQgPSBudWxsXG5cbiAgICB2YXIgbG9hZGVyID0gbmV3IExvYWRlcihuYW1lLCBjYW5jZWwpXG5cbiAgICBpZiAoc3RyZWFtKSB7XG4gICAgICB4aHIub25yZWFkeXN0YXRlY2hhbmdlID0gb25SZWFkeVN0YXRlQ2hhbmdlXG4gICAgfSBlbHNlIHtcbiAgICAgIHhoci5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh4aHIucmVhZHlTdGF0ZSA9PT0gNCkge1xuICAgICAgICAgIG9uUmVhZHlTdGF0ZUNoYW5nZSgpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoYmluYXJ5KSB7XG4gICAgICB4aHIucmVzcG9uc2VUeXBlID0gJ2FycmF5YnVmZmVyJ1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIG9uUmVhZHlTdGF0ZUNoYW5nZSAoKSB7XG4gICAgICBpZiAoeGhyLnJlYWR5U3RhdGUgPCAyIHx8XG4gICAgICAgICAgbG9hZGVyLnN0YXRlID09PSBTVEFURV9DT01QTEVURSB8fFxuICAgICAgICAgIGxvYWRlci5zdGF0ZSA9PT0gU1RBVEVfRVJST1IpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICBpZiAoeGhyLnN0YXR1cyAhPT0gMjAwKSB7XG4gICAgICAgIHJldHVybiBhYm9ydCgnZXJyb3IgbG9hZGluZyByZXNvdXJjZSBcIicgKyByZXF1ZXN0Lm5hbWUgKyAnXCInKVxuICAgICAgfVxuICAgICAgaWYgKHhoci5yZWFkeVN0YXRlID4gMiAmJiBsb2FkZXIuc3RhdGUgPT09IFNUQVRFX0RBVEEpIHtcbiAgICAgICAgdmFyIHJlc3BvbnNlXG4gICAgICAgIGlmIChyZXF1ZXN0LnR5cGUgPT09ICdiaW5hcnknKSB7XG4gICAgICAgICAgcmVzcG9uc2UgPSB4aHIucmVzcG9uc2VcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXNwb25zZSA9IHhoci5yZXNwb25zZVRleHRcbiAgICAgICAgfVxuICAgICAgICBpZiAocGFyc2VyLmRhdGEpIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXNzZXQgPSBwYXJzZXIuZGF0YShyZXNwb25zZSlcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICByZXR1cm4gYWJvcnQoZSlcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYXNzZXQgPSByZXNwb25zZVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoeGhyLnJlYWR5U3RhdGUgPiAzICYmIGxvYWRlci5zdGF0ZSA9PT0gU1RBVEVfREFUQSkge1xuICAgICAgICBpZiAocGFyc2VyLmRvbmUpIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXNzZXQgPSBwYXJzZXIuZG9uZSgpXG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgcmV0dXJuIGFib3J0KGUpXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGxvYWRlci5zdGF0ZSA9IFNUQVRFX0NPTVBMRVRFXG4gICAgICB9XG4gICAgICBhc3NldHNbbmFtZV0gPSBhc3NldFxuICAgICAgbG9hZGVyLnByb2dyZXNzID0gMC43NSAqIGxvYWRlci5wcm9ncmVzcyArIDAuMjVcbiAgICAgIGxvYWRlci5yZWFkeSA9XG4gICAgICAgIChyZXF1ZXN0LnN0cmVhbSAmJiAhIWFzc2V0KSB8fFxuICAgICAgICBsb2FkZXIuc3RhdGUgPT09IFNUQVRFX0NPTVBMRVRFXG4gICAgICBub3RpZnlQcm9ncmVzcygpXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY2FuY2VsICgpIHtcbiAgICAgIGlmIChsb2FkZXIuc3RhdGUgPT09IFNUQVRFX0NPTVBMRVRFIHx8IGxvYWRlci5zdGF0ZSA9PT0gU1RBVEVfRVJST1IpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICB4aHIub25yZWFkeXN0YXRlY2hhbmdlID0gbnVsbFxuICAgICAgeGhyLmFib3J0KClcbiAgICAgIGxvYWRlci5zdGF0ZSA9IFNUQVRFX0VSUk9SXG4gICAgfVxuXG4gICAgLy8gc2V0IHVwIHJlcXVlc3RcbiAgICBpZiAocmVxdWVzdC5jcmVkZW50aWFscykge1xuICAgICAgeGhyLndpdGhDcmVkZW50aWFscyA9IHRydWVcbiAgICB9XG4gICAgeGhyLm9wZW4oJ0dFVCcsIHJlcXVlc3Quc3JjLCB0cnVlKVxuICAgIHhoci5zZW5kKClcblxuICAgIHJldHVybiBsb2FkZXJcbiAgfVxuXG4gIGZ1bmN0aW9uIGxvYWRFbGVtZW50IChyZXF1ZXN0LCBlbGVtZW50KSB7XG4gICAgdmFyIG5hbWUgPSByZXF1ZXN0Lm5hbWVcbiAgICB2YXIgcGFyc2VyID0gcmVxdWVzdC5wYXJzZXJcblxuICAgIHZhciBsb2FkZXIgPSBuZXcgTG9hZGVyKG5hbWUsIGNhbmNlbClcbiAgICB2YXIgYXNzZXQgPSBlbGVtZW50XG5cbiAgICBmdW5jdGlvbiBoYW5kbGVQcm9ncmVzcyAoKSB7XG4gICAgICBpZiAobG9hZGVyLnN0YXRlID09PSBTVEFURV9EQVRBKSB7XG4gICAgICAgIGlmIChwYXJzZXIuZGF0YSkge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhc3NldCA9IHBhcnNlci5kYXRhKGVsZW1lbnQpXG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgcmV0dXJuIGFib3J0KGUpXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGFzc2V0ID0gZWxlbWVudFxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gb25Qcm9ncmVzcyAoZSkge1xuICAgICAgaGFuZGxlUHJvZ3Jlc3MoKVxuICAgICAgYXNzZXRzW25hbWVdID0gYXNzZXRcbiAgICAgIGlmIChlLmxlbmd0aENvbXB1dGFibGUpIHtcbiAgICAgICAgbG9hZGVyLnByb2dyZXNzID0gTWF0aC5tYXgobG9hZGVyLnByb2dyZXNzLCBlLmxvYWRlZCAvIGUudG90YWwpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsb2FkZXIucHJvZ3Jlc3MgPSAwLjc1ICogbG9hZGVyLnByb2dyZXNzICsgMC4yNVxuICAgICAgfVxuICAgICAgbm90aWZ5UHJvZ3Jlc3MobmFtZSlcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBvbkNvbXBsZXRlICgpIHtcbiAgICAgIGhhbmRsZVByb2dyZXNzKClcbiAgICAgIGlmIChsb2FkZXIuc3RhdGUgPT09IFNUQVRFX0RBVEEpIHtcbiAgICAgICAgaWYgKHBhcnNlci5kb25lKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGFzc2V0ID0gcGFyc2VyLmRvbmUoKVxuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIHJldHVybiBhYm9ydChlKVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBsb2FkZXIuc3RhdGUgPSBTVEFURV9DT01QTEVURVxuICAgICAgfVxuICAgICAgbG9hZGVyLnByb2dyZXNzID0gMVxuICAgICAgbG9hZGVyLnJlYWR5ID0gdHJ1ZVxuICAgICAgYXNzZXRzW25hbWVdID0gYXNzZXRcbiAgICAgIHJlbW92ZUxpc3RlbmVycygpXG4gICAgICBub3RpZnlQcm9ncmVzcygnZmluaXNoICcgKyBuYW1lKVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIG9uRXJyb3IgKCkge1xuICAgICAgYWJvcnQoJ2Vycm9yIGxvYWRpbmcgYXNzZXQgXCInICsgbmFtZSArICdcIicpXG4gICAgfVxuXG4gICAgaWYgKHJlcXVlc3Quc3RyZWFtKSB7XG4gICAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ3Byb2dyZXNzJywgb25Qcm9ncmVzcylcbiAgICB9XG4gICAgaWYgKHJlcXVlc3QudHlwZSA9PT0gJ2ltYWdlJykge1xuICAgICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdsb2FkJywgb25Db21wbGV0ZSlcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGNhblBsYXkgPSBmYWxzZVxuICAgICAgdmFyIGxvYWRlZE1ldGFEYXRhID0gZmFsc2VcbiAgICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbG9hZGVkbWV0YWRhdGEnLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGxvYWRlZE1ldGFEYXRhID0gdHJ1ZVxuICAgICAgICBpZiAoY2FuUGxheSkge1xuICAgICAgICAgIG9uQ29tcGxldGUoKVxuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdjYW5wbGF5JywgZnVuY3Rpb24gKCkge1xuICAgICAgICBjYW5QbGF5ID0gdHJ1ZVxuICAgICAgICBpZiAobG9hZGVkTWV0YURhdGEpIHtcbiAgICAgICAgICBvbkNvbXBsZXRlKClcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICB9XG4gICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdlcnJvcicsIG9uRXJyb3IpXG5cbiAgICBmdW5jdGlvbiByZW1vdmVMaXN0ZW5lcnMgKCkge1xuICAgICAgaWYgKHJlcXVlc3Quc3RyZWFtKSB7XG4gICAgICAgIGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcigncHJvZ3Jlc3MnLCBvblByb2dyZXNzKVxuICAgICAgfVxuICAgICAgaWYgKHJlcXVlc3QudHlwZSA9PT0gJ2ltYWdlJykge1xuICAgICAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2xvYWQnLCBvbkNvbXBsZXRlKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdjYW5wbGF5Jywgb25Db21wbGV0ZSlcbiAgICAgIH1cbiAgICAgIGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignZXJyb3InLCBvbkVycm9yKVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNhbmNlbCAoKSB7XG4gICAgICBpZiAobG9hZGVyLnN0YXRlID09PSBTVEFURV9DT01QTEVURSB8fCBsb2FkZXIuc3RhdGUgPT09IFNUQVRFX0VSUk9SKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgbG9hZGVyLnN0YXRlID0gU1RBVEVfRVJST1JcbiAgICAgIHJlbW92ZUxpc3RlbmVycygpXG4gICAgICBlbGVtZW50LnNyYyA9ICcnXG4gICAgfVxuXG4gICAgLy8gc2V0IHVwIHJlcXVlc3RcbiAgICBpZiAocmVxdWVzdC5jcmVkZW50aWFscykge1xuICAgICAgZWxlbWVudC5jcm9zc09yaWdpbiA9ICd1c2UtY3JlZGVudGlhbHMnXG4gICAgfSBlbHNlIHtcbiAgICAgIGVsZW1lbnQuY3Jvc3NPcmlnaW4gPSAnYW5vbnltb3VzJ1xuICAgIH1cbiAgICBlbGVtZW50LnNyYyA9IHJlcXVlc3Quc3JjXG5cbiAgICByZXR1cm4gbG9hZGVyXG4gIH1cblxuICB2YXIgbG9hZGVycyA9IHtcbiAgICB0ZXh0OiBsb2FkWEhSLFxuICAgIGJpbmFyeTogZnVuY3Rpb24gKHJlcXVlc3QpIHtcbiAgICAgIC8vIFRPRE8gdXNlIGZldGNoIEFQSSBmb3Igc3RyZWFtaW5nIGlmIHN1cHBvcnRlZFxuICAgICAgcmV0dXJuIGxvYWRYSFIocmVxdWVzdClcbiAgICB9LFxuICAgIGltYWdlOiBmdW5jdGlvbiAocmVxdWVzdCkge1xuICAgICAgcmV0dXJuIGxvYWRFbGVtZW50KHJlcXVlc3QsIGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2ltZycpKVxuICAgIH0sXG4gICAgdmlkZW86IGZ1bmN0aW9uIChyZXF1ZXN0KSB7XG4gICAgICByZXR1cm4gbG9hZEVsZW1lbnQocmVxdWVzdCwgZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndmlkZW8nKSlcbiAgICB9LFxuICAgIGF1ZGlvOiBmdW5jdGlvbiAocmVxdWVzdCkge1xuICAgICAgcmV0dXJuIGxvYWRFbGVtZW50KHJlcXVlc3QsIGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2F1ZGlvJykpXG4gICAgfVxuICB9XG5cbiAgLy8gRmlyc3Qgd2UgcGFyc2UgYWxsIG9iamVjdHMgaW4gb3JkZXIgdG8gdmVyaWZ5IHRoYXQgYWxsIHR5cGUgaW5mb3JtYXRpb25cbiAgLy8gaXMgY29ycmVjdFxuICB2YXIgcGVuZGluZyA9IE9iamVjdC5rZXlzKG1hbmlmZXN0KS5tYXAoZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB2YXIgcmVxdWVzdCA9IG1hbmlmZXN0W25hbWVdXG4gICAgaWYgKHR5cGVvZiByZXF1ZXN0ID09PSAnc3RyaW5nJykge1xuICAgICAgcmVxdWVzdCA9IHtcbiAgICAgICAgc3JjOiByZXF1ZXN0XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgcmVxdWVzdCAhPT0gJ29iamVjdCcgfHwgIXJlcXVlc3QpIHtcbiAgICAgIHJhaXNlKCdpbnZhbGlkIGFzc2V0IGRlZmluaXRpb24gXCInICsgbmFtZSArICdcIicpXG4gICAgfVxuXG4gICAgY2hlY2tUeXBlKHJlcXVlc3QsIG1hbmlmZXN0UGFyYW1ldGVycywgJ2Fzc2V0IFwiJyArIG5hbWUgKyAnXCInKVxuXG4gICAgZnVuY3Rpb24gZ2V0UGFyYW1ldGVyIChwcm9wLCBhY2NlcHRlZCwgaW5pdCkge1xuICAgICAgdmFyIHZhbHVlID0gaW5pdFxuICAgICAgaWYgKHByb3AgaW4gcmVxdWVzdCkge1xuICAgICAgICB2YWx1ZSA9IHJlcXVlc3RbcHJvcF1cbiAgICAgIH1cbiAgICAgIGlmIChhY2NlcHRlZC5pbmRleE9mKHZhbHVlKSA8IDApIHtcbiAgICAgICAgcmFpc2UoJ2ludmFsaWQgJyArIHByb3AgKyAnIFwiJyArIHZhbHVlICsgJ1wiIGZvciBhc3NldCBcIicgKyBuYW1lICsgJ1wiLCBwb3NzaWJsZSB2YWx1ZXM6ICcgKyBhY2NlcHRlZClcbiAgICAgIH1cbiAgICAgIHJldHVybiB2YWx1ZVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldFN0cmluZyAocHJvcCwgcmVxdWlyZWQsIGluaXQpIHtcbiAgICAgIHZhciB2YWx1ZSA9IGluaXRcbiAgICAgIGlmIChwcm9wIGluIHJlcXVlc3QpIHtcbiAgICAgICAgdmFsdWUgPSByZXF1ZXN0W3Byb3BdXG4gICAgICB9IGVsc2UgaWYgKHJlcXVpcmVkKSB7XG4gICAgICAgIHJhaXNlKCdtaXNzaW5nICcgKyBwcm9wICsgJyBmb3IgYXNzZXQgXCInICsgbmFtZSArICdcIicpXG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJykge1xuICAgICAgICByYWlzZSgnaW52YWxpZCAnICsgcHJvcCArICcgZm9yIGFzc2V0IFwiJyArIG5hbWUgKyAnXCIsIG11c3QgYmUgYSBzdHJpbmcnKVxuICAgICAgfVxuICAgICAgcmV0dXJuIHZhbHVlXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0UGFyc2VGdW5jIChuYW1lLCBkZmx0KSB7XG4gICAgICBpZiAobmFtZSBpbiByZXF1ZXN0LnBhcnNlcikge1xuICAgICAgICB2YXIgcmVzdWx0ID0gcmVxdWVzdC5wYXJzZXJbbmFtZV1cbiAgICAgICAgaWYgKHR5cGVvZiByZXN1bHQgIT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICByYWlzZSgnaW52YWxpZCBwYXJzZXIgY2FsbGJhY2sgJyArIG5hbWUgKyAnIGZvciBhc3NldCBcIicgKyBuYW1lICsgJ1wiJylcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZGZsdFxuICAgICAgfVxuICAgIH1cblxuICAgIHZhciBwYXJzZXIgPSB7fVxuICAgIGlmICgncGFyc2VyJyBpbiByZXF1ZXN0KSB7XG4gICAgICBpZiAodHlwZW9mIHJlcXVlc3QucGFyc2VyID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHBhcnNlciA9IHtcbiAgICAgICAgICBkYXRhOiByZXF1ZXN0LnBhcnNlclxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiByZXF1ZXN0LnBhcnNlciA9PT0gJ29iamVjdCcgJiYgcmVxdWVzdC5wYXJzZXIpIHtcbiAgICAgICAgY2hlY2tUeXBlKHBhcnNlciwgcGFyc2VyUGFyYW1ldGVycywgJ3BhcnNlciBmb3IgYXNzZXQgXCInICsgbmFtZSArICdcIicpXG4gICAgICAgIGlmICghKCdvbkRhdGEnIGluIHBhcnNlcikpIHtcbiAgICAgICAgICByYWlzZSgnbWlzc2luZyBvbkRhdGEgY2FsbGJhY2sgZm9yIHBhcnNlciBpbiBhc3NldCBcIicgKyBuYW1lICsgJ1wiJylcbiAgICAgICAgfVxuICAgICAgICBwYXJzZXIgPSB7XG4gICAgICAgICAgZGF0YTogZ2V0UGFyc2VGdW5jKCdvbkRhdGEnKSxcbiAgICAgICAgICBkb25lOiBnZXRQYXJzZUZ1bmMoJ29uRG9uZScpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJhaXNlKCdpbnZhbGlkIHBhcnNlciBmb3IgYXNzZXQgXCInICsgbmFtZSArICdcIicpXG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIG5hbWU6IG5hbWUsXG4gICAgICB0eXBlOiBnZXRQYXJhbWV0ZXIoJ3R5cGUnLCBPYmplY3Qua2V5cyhsb2FkZXJzKSwgJ3RleHQnKSxcbiAgICAgIHN0cmVhbTogISFyZXF1ZXN0LnN0cmVhbSxcbiAgICAgIGNyZWRlbnRpYWxzOiAhIXJlcXVlc3QuY3JlZGVudGlhbHMsXG4gICAgICBzcmM6IGdldFN0cmluZygnc3JjJywgdHJ1ZSwgJycpLFxuICAgICAgcGFyc2VyOiBwYXJzZXJcbiAgICB9XG4gIH0pLm1hcChmdW5jdGlvbiAocmVxdWVzdCkge1xuICAgIHJldHVybiAobG9hZGVyc1tyZXF1ZXN0LnR5cGVdKShyZXF1ZXN0KVxuICB9KVxuXG4gIGZ1bmN0aW9uIGFib3J0IChtZXNzYWdlKSB7XG4gICAgaWYgKHN0YXRlID09PSBTVEFURV9FUlJPUiB8fCBzdGF0ZSA9PT0gU1RBVEVfQ09NUExFVEUpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBzdGF0ZSA9IFNUQVRFX0VSUk9SXG4gICAgcGVuZGluZy5mb3JFYWNoKGZ1bmN0aW9uIChsb2FkZXIpIHtcbiAgICAgIGxvYWRlci5jYW5jZWwoKVxuICAgIH0pXG4gICAgaWYgKG9uRXJyb3IpIHtcbiAgICAgIGlmICh0eXBlb2YgbWVzc2FnZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgb25FcnJvcihuZXcgRXJyb3IoJ3Jlc2w6ICcgKyBtZXNzYWdlKSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG9uRXJyb3IobWVzc2FnZSlcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5lcnJvcigncmVzbCBlcnJvcjonLCBtZXNzYWdlKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIG5vdGlmeVByb2dyZXNzIChtZXNzYWdlKSB7XG4gICAgaWYgKHN0YXRlID09PSBTVEFURV9FUlJPUiB8fCBzdGF0ZSA9PT0gU1RBVEVfQ09NUExFVEUpIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIHZhciBwcm9ncmVzcyA9IDBcbiAgICB2YXIgbnVtUmVhZHkgPSAwXG4gICAgcGVuZGluZy5mb3JFYWNoKGZ1bmN0aW9uIChsb2FkZXIpIHtcbiAgICAgIGlmIChsb2FkZXIucmVhZHkpIHtcbiAgICAgICAgbnVtUmVhZHkgKz0gMVxuICAgICAgfVxuICAgICAgcHJvZ3Jlc3MgKz0gbG9hZGVyLnByb2dyZXNzXG4gICAgfSlcblxuICAgIGlmIChudW1SZWFkeSA9PT0gcGVuZGluZy5sZW5ndGgpIHtcbiAgICAgIHN0YXRlID0gU1RBVEVfQ09NUExFVEVcbiAgICAgIG9uRG9uZShhc3NldHMpXG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChvblByb2dyZXNzKSB7XG4gICAgICAgIG9uUHJvZ3Jlc3MocHJvZ3Jlc3MgLyBwZW5kaW5nLmxlbmd0aCwgbWVzc2FnZSlcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBpZiAocGVuZGluZy5sZW5ndGggPT09IDApIHtcbiAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgIG5vdGlmeVByb2dyZXNzKCdkb25lJylcbiAgICB9LCAxKVxuICB9XG59XG4iLCJcbnZhciBleHRlbmQgPSByZXF1aXJlKCcuL2xpYi91dGlsL2V4dGVuZCcpXG52YXIgZHluYW1pYyA9IHJlcXVpcmUoJy4vbGliL2R5bmFtaWMnKVxudmFyIHJhZiA9IHJlcXVpcmUoJy4vbGliL3V0aWwvcmFmJylcbnZhciBjbG9jayA9IHJlcXVpcmUoJy4vbGliL3V0aWwvY2xvY2snKVxudmFyIGNyZWF0ZVN0cmluZ1N0b3JlID0gcmVxdWlyZSgnLi9saWIvc3RyaW5ncycpXG52YXIgaW5pdFdlYkdMID0gcmVxdWlyZSgnLi9saWIvd2ViZ2wnKVxudmFyIHdyYXBFeHRlbnNpb25zID0gcmVxdWlyZSgnLi9saWIvZXh0ZW5zaW9uJylcbnZhciB3cmFwTGltaXRzID0gcmVxdWlyZSgnLi9saWIvbGltaXRzJylcbnZhciB3cmFwQnVmZmVycyA9IHJlcXVpcmUoJy4vbGliL2J1ZmZlcicpXG52YXIgd3JhcEVsZW1lbnRzID0gcmVxdWlyZSgnLi9saWIvZWxlbWVudHMnKVxudmFyIHdyYXBUZXh0dXJlcyA9IHJlcXVpcmUoJy4vbGliL3RleHR1cmUnKVxudmFyIHdyYXBSZW5kZXJidWZmZXJzID0gcmVxdWlyZSgnLi9saWIvcmVuZGVyYnVmZmVyJylcbnZhciB3cmFwRnJhbWVidWZmZXJzID0gcmVxdWlyZSgnLi9saWIvZnJhbWVidWZmZXInKVxudmFyIHdyYXBBdHRyaWJ1dGVzID0gcmVxdWlyZSgnLi9saWIvYXR0cmlidXRlJylcbnZhciB3cmFwU2hhZGVycyA9IHJlcXVpcmUoJy4vbGliL3NoYWRlcicpXG52YXIgd3JhcFJlYWQgPSByZXF1aXJlKCcuL2xpYi9yZWFkJylcbnZhciBjcmVhdGVDb3JlID0gcmVxdWlyZSgnLi9saWIvY29yZScpXG52YXIgY3JlYXRlU3RhdHMgPSByZXF1aXJlKCcuL2xpYi9zdGF0cycpXG52YXIgY3JlYXRlVGltZXIgPSByZXF1aXJlKCcuL2xpYi90aW1lcicpXG5cbnZhciBHTF9DT0xPUl9CVUZGRVJfQklUID0gMTYzODRcbnZhciBHTF9ERVBUSF9CVUZGRVJfQklUID0gMjU2XG52YXIgR0xfU1RFTkNJTF9CVUZGRVJfQklUID0gMTAyNFxuXG52YXIgR0xfQVJSQVlfQlVGRkVSID0gMzQ5NjJcblxudmFyIENPTlRFWFRfTE9TVF9FVkVOVCA9ICd3ZWJnbGNvbnRleHRsb3N0J1xudmFyIENPTlRFWFRfUkVTVE9SRURfRVZFTlQgPSAnd2ViZ2xjb250ZXh0cmVzdG9yZWQnXG5cbnZhciBEWU5fUFJPUCA9IDFcbnZhciBEWU5fQ09OVEVYVCA9IDJcbnZhciBEWU5fU1RBVEUgPSAzXG5cbmZ1bmN0aW9uIGZpbmQgKGhheXN0YWNrLCBuZWVkbGUpIHtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBoYXlzdGFjay5sZW5ndGg7ICsraSkge1xuICAgIGlmIChoYXlzdGFja1tpXSA9PT0gbmVlZGxlKSB7XG4gICAgICByZXR1cm4gaVxuICAgIH1cbiAgfVxuICByZXR1cm4gLTFcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwUkVHTCAoYXJncykge1xuICB2YXIgY29uZmlnID0gaW5pdFdlYkdMKGFyZ3MpXG4gIGlmICghY29uZmlnKSB7XG4gICAgcmV0dXJuIG51bGxcbiAgfVxuXG4gIHZhciBnbCA9IGNvbmZpZy5nbFxuICB2YXIgZ2xBdHRyaWJ1dGVzID0gZ2wuZ2V0Q29udGV4dEF0dHJpYnV0ZXMoKVxuICB2YXIgY29udGV4dExvc3QgPSBnbC5pc0NvbnRleHRMb3N0KClcblxuICB2YXIgZXh0ZW5zaW9uU3RhdGUgPSB3cmFwRXh0ZW5zaW9ucyhnbCwgY29uZmlnKVxuICBpZiAoIWV4dGVuc2lvblN0YXRlKSB7XG4gICAgcmV0dXJuIG51bGxcbiAgfVxuXG4gIHZhciBzdHJpbmdTdG9yZSA9IGNyZWF0ZVN0cmluZ1N0b3JlKClcbiAgdmFyIHN0YXRzID0gY3JlYXRlU3RhdHMoKVxuICB2YXIgZXh0ZW5zaW9ucyA9IGV4dGVuc2lvblN0YXRlLmV4dGVuc2lvbnNcbiAgdmFyIHRpbWVyID0gY3JlYXRlVGltZXIoZ2wsIGV4dGVuc2lvbnMpXG5cbiAgdmFyIFNUQVJUX1RJTUUgPSBjbG9jaygpXG4gIHZhciBXSURUSCA9IGdsLmRyYXdpbmdCdWZmZXJXaWR0aFxuICB2YXIgSEVJR0hUID0gZ2wuZHJhd2luZ0J1ZmZlckhlaWdodFxuXG4gIHZhciBjb250ZXh0U3RhdGUgPSB7XG4gICAgdGljazogMCxcbiAgICB0aW1lOiAwLFxuICAgIHZpZXdwb3J0V2lkdGg6IFdJRFRILFxuICAgIHZpZXdwb3J0SGVpZ2h0OiBIRUlHSFQsXG4gICAgZnJhbWVidWZmZXJXaWR0aDogV0lEVEgsXG4gICAgZnJhbWVidWZmZXJIZWlnaHQ6IEhFSUdIVCxcbiAgICBkcmF3aW5nQnVmZmVyV2lkdGg6IFdJRFRILFxuICAgIGRyYXdpbmdCdWZmZXJIZWlnaHQ6IEhFSUdIVCxcbiAgICBwaXhlbFJhdGlvOiBjb25maWcucGl4ZWxSYXRpb1xuICB9XG4gIHZhciB1bmlmb3JtU3RhdGUgPSB7fVxuICB2YXIgZHJhd1N0YXRlID0ge1xuICAgIGVsZW1lbnRzOiBudWxsLFxuICAgIHByaW1pdGl2ZTogNCwgLy8gR0xfVFJJQU5HTEVTXG4gICAgY291bnQ6IC0xLFxuICAgIG9mZnNldDogMCxcbiAgICBpbnN0YW5jZXM6IC0xXG4gIH1cblxuICB2YXIgbGltaXRzID0gd3JhcExpbWl0cyhnbCwgZXh0ZW5zaW9ucylcbiAgdmFyIGJ1ZmZlclN0YXRlID0gd3JhcEJ1ZmZlcnMoZ2wsIHN0YXRzLCBjb25maWcpXG4gIHZhciBlbGVtZW50U3RhdGUgPSB3cmFwRWxlbWVudHMoZ2wsIGV4dGVuc2lvbnMsIGJ1ZmZlclN0YXRlLCBzdGF0cylcbiAgdmFyIGF0dHJpYnV0ZVN0YXRlID0gd3JhcEF0dHJpYnV0ZXMoXG4gICAgZ2wsXG4gICAgZXh0ZW5zaW9ucyxcbiAgICBsaW1pdHMsXG4gICAgYnVmZmVyU3RhdGUsXG4gICAgc3RyaW5nU3RvcmUpXG4gIHZhciBzaGFkZXJTdGF0ZSA9IHdyYXBTaGFkZXJzKGdsLCBzdHJpbmdTdG9yZSwgc3RhdHMsIGNvbmZpZylcbiAgdmFyIHRleHR1cmVTdGF0ZSA9IHdyYXBUZXh0dXJlcyhcbiAgICBnbCxcbiAgICBleHRlbnNpb25zLFxuICAgIGxpbWl0cyxcbiAgICBmdW5jdGlvbiAoKSB7IGNvcmUucHJvY3MucG9sbCgpIH0sXG4gICAgY29udGV4dFN0YXRlLFxuICAgIHN0YXRzLFxuICAgIGNvbmZpZylcbiAgdmFyIHJlbmRlcmJ1ZmZlclN0YXRlID0gd3JhcFJlbmRlcmJ1ZmZlcnMoZ2wsIGV4dGVuc2lvbnMsIGxpbWl0cywgc3RhdHMsIGNvbmZpZylcbiAgdmFyIGZyYW1lYnVmZmVyU3RhdGUgPSB3cmFwRnJhbWVidWZmZXJzKFxuICAgIGdsLFxuICAgIGV4dGVuc2lvbnMsXG4gICAgbGltaXRzLFxuICAgIHRleHR1cmVTdGF0ZSxcbiAgICByZW5kZXJidWZmZXJTdGF0ZSxcbiAgICBzdGF0cylcbiAgdmFyIGNvcmUgPSBjcmVhdGVDb3JlKFxuICAgIGdsLFxuICAgIHN0cmluZ1N0b3JlLFxuICAgIGV4dGVuc2lvbnMsXG4gICAgbGltaXRzLFxuICAgIGJ1ZmZlclN0YXRlLFxuICAgIGVsZW1lbnRTdGF0ZSxcbiAgICB0ZXh0dXJlU3RhdGUsXG4gICAgZnJhbWVidWZmZXJTdGF0ZSxcbiAgICB1bmlmb3JtU3RhdGUsXG4gICAgYXR0cmlidXRlU3RhdGUsXG4gICAgc2hhZGVyU3RhdGUsXG4gICAgZHJhd1N0YXRlLFxuICAgIGNvbnRleHRTdGF0ZSxcbiAgICB0aW1lcixcbiAgICBjb25maWcpXG4gIHZhciByZWFkUGl4ZWxzID0gd3JhcFJlYWQoXG4gICAgZ2wsXG4gICAgZnJhbWVidWZmZXJTdGF0ZSxcbiAgICBjb3JlLnByb2NzLnBvbGwsXG4gICAgY29udGV4dFN0YXRlLFxuICAgIGdsQXR0cmlidXRlcywgZXh0ZW5zaW9ucylcblxuICB2YXIgbmV4dFN0YXRlID0gY29yZS5uZXh0XG4gIHZhciBjYW52YXMgPSBnbC5jYW52YXNcblxuICB2YXIgcmFmQ2FsbGJhY2tzID0gW11cbiAgdmFyIGxvc3NDYWxsYmFja3MgPSBbXVxuICB2YXIgcmVzdG9yZUNhbGxiYWNrcyA9IFtdXG4gIHZhciBkZXN0cm95Q2FsbGJhY2tzID0gW2NvbmZpZy5vbkRlc3Ryb3ldXG5cbiAgdmFyIGFjdGl2ZVJBRiA9IG51bGxcbiAgZnVuY3Rpb24gaGFuZGxlUkFGICgpIHtcbiAgICBpZiAocmFmQ2FsbGJhY2tzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgaWYgKHRpbWVyKSB7XG4gICAgICAgIHRpbWVyLnVwZGF0ZSgpXG4gICAgICB9XG4gICAgICBhY3RpdmVSQUYgPSBudWxsXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICAvLyBzY2hlZHVsZSBuZXh0IGFuaW1hdGlvbiBmcmFtZVxuICAgIGFjdGl2ZVJBRiA9IHJhZi5uZXh0KGhhbmRsZVJBRilcblxuICAgIC8vIHBvbGwgZm9yIGNoYW5nZXNcbiAgICBwb2xsKClcblxuICAgIC8vIGZpcmUgYSBjYWxsYmFjayBmb3IgYWxsIHBlbmRpbmcgcmFmc1xuICAgIGZvciAodmFyIGkgPSByYWZDYWxsYmFja3MubGVuZ3RoIC0gMTsgaSA+PSAwOyAtLWkpIHtcbiAgICAgIHZhciBjYiA9IHJhZkNhbGxiYWNrc1tpXVxuICAgICAgaWYgKGNiKSB7XG4gICAgICAgIGNiKGNvbnRleHRTdGF0ZSwgbnVsbCwgMClcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBmbHVzaCBhbGwgcGVuZGluZyB3ZWJnbCBjYWxsc1xuICAgIGdsLmZsdXNoKClcblxuICAgIC8vIHBvbGwgR1BVIHRpbWVycyAqYWZ0ZXIqIGdsLmZsdXNoIHNvIHdlIGRvbid0IGRlbGF5IGNvbW1hbmQgZGlzcGF0Y2hcbiAgICBpZiAodGltZXIpIHtcbiAgICAgIHRpbWVyLnVwZGF0ZSgpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc3RhcnRSQUYgKCkge1xuICAgIGlmICghYWN0aXZlUkFGICYmIHJhZkNhbGxiYWNrcy5sZW5ndGggPiAwKSB7XG4gICAgICBhY3RpdmVSQUYgPSByYWYubmV4dChoYW5kbGVSQUYpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc3RvcFJBRiAoKSB7XG4gICAgaWYgKGFjdGl2ZVJBRikge1xuICAgICAgcmFmLmNhbmNlbChoYW5kbGVSQUYpXG4gICAgICBhY3RpdmVSQUYgPSBudWxsXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaGFuZGxlQ29udGV4dExvc3MgKGV2ZW50KSB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKVxuXG4gICAgLy8gc2V0IGNvbnRleHQgbG9zdCBmbGFnXG4gICAgY29udGV4dExvc3QgPSB0cnVlXG5cbiAgICAvLyBwYXVzZSByZXF1ZXN0IGFuaW1hdGlvbiBmcmFtZVxuICAgIHN0b3BSQUYoKVxuXG4gICAgLy8gbG9zZSBjb250ZXh0XG4gICAgbG9zc0NhbGxiYWNrcy5mb3JFYWNoKGZ1bmN0aW9uIChjYikge1xuICAgICAgY2IoKVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVDb250ZXh0UmVzdG9yZWQgKGV2ZW50KSB7XG4gICAgLy8gY2xlYXIgZXJyb3IgY29kZVxuICAgIGdsLmdldEVycm9yKClcblxuICAgIC8vIGNsZWFyIGNvbnRleHQgbG9zdCBmbGFnXG4gICAgY29udGV4dExvc3QgPSBmYWxzZVxuXG4gICAgLy8gcmVmcmVzaCBzdGF0ZVxuICAgIGV4dGVuc2lvblN0YXRlLnJlc3RvcmUoKVxuICAgIHNoYWRlclN0YXRlLnJlc3RvcmUoKVxuICAgIGJ1ZmZlclN0YXRlLnJlc3RvcmUoKVxuICAgIHRleHR1cmVTdGF0ZS5yZXN0b3JlKClcbiAgICByZW5kZXJidWZmZXJTdGF0ZS5yZXN0b3JlKClcbiAgICBmcmFtZWJ1ZmZlclN0YXRlLnJlc3RvcmUoKVxuICAgIGlmICh0aW1lcikge1xuICAgICAgdGltZXIucmVzdG9yZSgpXG4gICAgfVxuXG4gICAgLy8gcmVmcmVzaCBzdGF0ZVxuICAgIGNvcmUucHJvY3MucmVmcmVzaCgpXG5cbiAgICAvLyByZXN0YXJ0IFJBRlxuICAgIHN0YXJ0UkFGKClcblxuICAgIC8vIHJlc3RvcmUgY29udGV4dFxuICAgIHJlc3RvcmVDYWxsYmFja3MuZm9yRWFjaChmdW5jdGlvbiAoY2IpIHtcbiAgICAgIGNiKClcbiAgICB9KVxuICB9XG5cbiAgaWYgKGNhbnZhcykge1xuICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKENPTlRFWFRfTE9TVF9FVkVOVCwgaGFuZGxlQ29udGV4dExvc3MsIGZhbHNlKVxuICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKENPTlRFWFRfUkVTVE9SRURfRVZFTlQsIGhhbmRsZUNvbnRleHRSZXN0b3JlZCwgZmFsc2UpXG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95ICgpIHtcbiAgICByYWZDYWxsYmFja3MubGVuZ3RoID0gMFxuICAgIHN0b3BSQUYoKVxuXG4gICAgaWYgKGNhbnZhcykge1xuICAgICAgY2FudmFzLnJlbW92ZUV2ZW50TGlzdGVuZXIoQ09OVEVYVF9MT1NUX0VWRU5ULCBoYW5kbGVDb250ZXh0TG9zcylcbiAgICAgIGNhbnZhcy5yZW1vdmVFdmVudExpc3RlbmVyKENPTlRFWFRfUkVTVE9SRURfRVZFTlQsIGhhbmRsZUNvbnRleHRSZXN0b3JlZClcbiAgICB9XG5cbiAgICBzaGFkZXJTdGF0ZS5jbGVhcigpXG4gICAgZnJhbWVidWZmZXJTdGF0ZS5jbGVhcigpXG4gICAgcmVuZGVyYnVmZmVyU3RhdGUuY2xlYXIoKVxuICAgIHRleHR1cmVTdGF0ZS5jbGVhcigpXG4gICAgZWxlbWVudFN0YXRlLmNsZWFyKClcbiAgICBidWZmZXJTdGF0ZS5jbGVhcigpXG5cbiAgICBpZiAodGltZXIpIHtcbiAgICAgIHRpbWVyLmNsZWFyKClcbiAgICB9XG5cbiAgICBkZXN0cm95Q2FsbGJhY2tzLmZvckVhY2goZnVuY3Rpb24gKGNiKSB7XG4gICAgICBjYigpXG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGNvbXBpbGVQcm9jZWR1cmUgKG9wdGlvbnMpIHtcbiAgICBcbiAgICBcblxuICAgIGZ1bmN0aW9uIGZsYXR0ZW5OZXN0ZWRPcHRpb25zIChvcHRpb25zKSB7XG4gICAgICB2YXIgcmVzdWx0ID0gZXh0ZW5kKHt9LCBvcHRpb25zKVxuICAgICAgZGVsZXRlIHJlc3VsdC51bmlmb3Jtc1xuICAgICAgZGVsZXRlIHJlc3VsdC5hdHRyaWJ1dGVzXG4gICAgICBkZWxldGUgcmVzdWx0LmNvbnRleHRcblxuICAgICAgaWYgKCdzdGVuY2lsJyBpbiByZXN1bHQgJiYgcmVzdWx0LnN0ZW5jaWwub3ApIHtcbiAgICAgICAgcmVzdWx0LnN0ZW5jaWwub3BCYWNrID0gcmVzdWx0LnN0ZW5jaWwub3BGcm9udCA9IHJlc3VsdC5zdGVuY2lsLm9wXG4gICAgICAgIGRlbGV0ZSByZXN1bHQuc3RlbmNpbC5vcFxuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBtZXJnZSAobmFtZSkge1xuICAgICAgICBpZiAobmFtZSBpbiByZXN1bHQpIHtcbiAgICAgICAgICB2YXIgY2hpbGQgPSByZXN1bHRbbmFtZV1cbiAgICAgICAgICBkZWxldGUgcmVzdWx0W25hbWVdXG4gICAgICAgICAgT2JqZWN0LmtleXMoY2hpbGQpLmZvckVhY2goZnVuY3Rpb24gKHByb3ApIHtcbiAgICAgICAgICAgIHJlc3VsdFtuYW1lICsgJy4nICsgcHJvcF0gPSBjaGlsZFtwcm9wXVxuICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIG1lcmdlKCdibGVuZCcpXG4gICAgICBtZXJnZSgnZGVwdGgnKVxuICAgICAgbWVyZ2UoJ2N1bGwnKVxuICAgICAgbWVyZ2UoJ3N0ZW5jaWwnKVxuICAgICAgbWVyZ2UoJ3BvbHlnb25PZmZzZXQnKVxuICAgICAgbWVyZ2UoJ3NjaXNzb3InKVxuICAgICAgbWVyZ2UoJ3NhbXBsZScpXG5cbiAgICAgIHJldHVybiByZXN1bHRcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzZXBhcmF0ZUR5bmFtaWMgKG9iamVjdCkge1xuICAgICAgdmFyIHN0YXRpY0l0ZW1zID0ge31cbiAgICAgIHZhciBkeW5hbWljSXRlbXMgPSB7fVxuICAgICAgT2JqZWN0LmtleXMob2JqZWN0KS5mb3JFYWNoKGZ1bmN0aW9uIChvcHRpb24pIHtcbiAgICAgICAgdmFyIHZhbHVlID0gb2JqZWN0W29wdGlvbl1cbiAgICAgICAgaWYgKGR5bmFtaWMuaXNEeW5hbWljKHZhbHVlKSkge1xuICAgICAgICAgIGR5bmFtaWNJdGVtc1tvcHRpb25dID0gZHluYW1pYy51bmJveCh2YWx1ZSwgb3B0aW9uKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHN0YXRpY0l0ZW1zW29wdGlvbl0gPSB2YWx1ZVxuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgZHluYW1pYzogZHluYW1pY0l0ZW1zLFxuICAgICAgICBzdGF0aWM6IHN0YXRpY0l0ZW1zXG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gVHJlYXQgY29udGV4dCB2YXJpYWJsZXMgc2VwYXJhdGUgZnJvbSBvdGhlciBkeW5hbWljIHZhcmlhYmxlc1xuICAgIHZhciBjb250ZXh0ID0gc2VwYXJhdGVEeW5hbWljKG9wdGlvbnMuY29udGV4dCB8fCB7fSlcbiAgICB2YXIgdW5pZm9ybXMgPSBzZXBhcmF0ZUR5bmFtaWMob3B0aW9ucy51bmlmb3JtcyB8fCB7fSlcbiAgICB2YXIgYXR0cmlidXRlcyA9IHNlcGFyYXRlRHluYW1pYyhvcHRpb25zLmF0dHJpYnV0ZXMgfHwge30pXG4gICAgdmFyIG9wdHMgPSBzZXBhcmF0ZUR5bmFtaWMoZmxhdHRlbk5lc3RlZE9wdGlvbnMob3B0aW9ucykpXG5cbiAgICB2YXIgc3RhdHMgPSB7XG4gICAgICBncHVUaW1lOiAwLjAsXG4gICAgICBjcHVUaW1lOiAwLjAsXG4gICAgICBjb3VudDogMFxuICAgIH1cblxuICAgIHZhciBjb21waWxlZCA9IGNvcmUuY29tcGlsZShvcHRzLCBhdHRyaWJ1dGVzLCB1bmlmb3JtcywgY29udGV4dCwgc3RhdHMpXG5cbiAgICB2YXIgZHJhdyA9IGNvbXBpbGVkLmRyYXdcbiAgICB2YXIgYmF0Y2ggPSBjb21waWxlZC5iYXRjaFxuICAgIHZhciBzY29wZSA9IGNvbXBpbGVkLnNjb3BlXG5cbiAgICAvLyBGSVhNRTogd2Ugc2hvdWxkIG1vZGlmeSBjb2RlIGdlbmVyYXRpb24gZm9yIGJhdGNoIGNvbW1hbmRzIHNvIHRoaXNcbiAgICAvLyBpc24ndCBuZWNlc3NhcnlcbiAgICB2YXIgRU1QVFlfQVJSQVkgPSBbXVxuICAgIGZ1bmN0aW9uIHJlc2VydmUgKGNvdW50KSB7XG4gICAgICB3aGlsZSAoRU1QVFlfQVJSQVkubGVuZ3RoIDwgY291bnQpIHtcbiAgICAgICAgRU1QVFlfQVJSQVkucHVzaChudWxsKVxuICAgICAgfVxuICAgICAgcmV0dXJuIEVNUFRZX0FSUkFZXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gUkVHTENvbW1hbmQgKGFyZ3MsIGJvZHkpIHtcbiAgICAgIHZhciBpXG4gICAgICBpZiAoY29udGV4dExvc3QpIHtcbiAgICAgICAgXG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIGFyZ3MgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgcmV0dXJuIHNjb3BlLmNhbGwodGhpcywgbnVsbCwgYXJncywgMClcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGJvZHkgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBhcmdzID09PSAnbnVtYmVyJykge1xuICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBhcmdzOyArK2kpIHtcbiAgICAgICAgICAgIHNjb3BlLmNhbGwodGhpcywgbnVsbCwgYm9keSwgaSlcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShhcmdzKSkge1xuICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBhcmdzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgICBzY29wZS5jYWxsKHRoaXMsIGFyZ3NbaV0sIGJvZHksIGkpXG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVyblxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBzY29wZS5jYWxsKHRoaXMsIGFyZ3MsIGJvZHksIDApXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGFyZ3MgPT09ICdudW1iZXInKSB7XG4gICAgICAgIGlmIChhcmdzID4gMCkge1xuICAgICAgICAgIHJldHVybiBiYXRjaC5jYWxsKHRoaXMsIHJlc2VydmUoYXJncyB8IDApLCBhcmdzIHwgMClcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGFyZ3MpKSB7XG4gICAgICAgIGlmIChhcmdzLmxlbmd0aCkge1xuICAgICAgICAgIHJldHVybiBiYXRjaC5jYWxsKHRoaXMsIGFyZ3MsIGFyZ3MubGVuZ3RoKVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZHJhdy5jYWxsKHRoaXMsIGFyZ3MpXG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGV4dGVuZChSRUdMQ29tbWFuZCwge1xuICAgICAgc3RhdHM6IHN0YXRzXG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGNsZWFyIChvcHRpb25zKSB7XG4gICAgXG5cbiAgICB2YXIgY2xlYXJGbGFncyA9IDBcbiAgICBjb3JlLnByb2NzLnBvbGwoKVxuXG4gICAgdmFyIGMgPSBvcHRpb25zLmNvbG9yXG4gICAgaWYgKGMpIHtcbiAgICAgIGdsLmNsZWFyQ29sb3IoK2NbMF0gfHwgMCwgK2NbMV0gfHwgMCwgK2NbMl0gfHwgMCwgK2NbM10gfHwgMClcbiAgICAgIGNsZWFyRmxhZ3MgfD0gR0xfQ09MT1JfQlVGRkVSX0JJVFxuICAgIH1cbiAgICBpZiAoJ2RlcHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICBnbC5jbGVhckRlcHRoKCtvcHRpb25zLmRlcHRoKVxuICAgICAgY2xlYXJGbGFncyB8PSBHTF9ERVBUSF9CVUZGRVJfQklUXG4gICAgfVxuICAgIGlmICgnc3RlbmNpbCcgaW4gb3B0aW9ucykge1xuICAgICAgZ2wuY2xlYXJTdGVuY2lsKG9wdGlvbnMuc3RlbmNpbCB8IDApXG4gICAgICBjbGVhckZsYWdzIHw9IEdMX1NURU5DSUxfQlVGRkVSX0JJVFxuICAgIH1cblxuICAgIFxuICAgIGdsLmNsZWFyKGNsZWFyRmxhZ3MpXG4gIH1cblxuICBmdW5jdGlvbiBmcmFtZSAoY2IpIHtcbiAgICBcbiAgICByYWZDYWxsYmFja3MucHVzaChjYilcblxuICAgIGZ1bmN0aW9uIGNhbmNlbCAoKSB7XG4gICAgICAvLyBGSVhNRTogIHNob3VsZCB3ZSBjaGVjayBzb21ldGhpbmcgb3RoZXIgdGhhbiBlcXVhbHMgY2IgaGVyZT9cbiAgICAgIC8vIHdoYXQgaWYgYSB1c2VyIGNhbGxzIGZyYW1lIHR3aWNlIHdpdGggdGhlIHNhbWUgY2FsbGJhY2suLi5cbiAgICAgIC8vXG4gICAgICB2YXIgaSA9IGZpbmQocmFmQ2FsbGJhY2tzLCBjYilcbiAgICAgIFxuICAgICAgZnVuY3Rpb24gcGVuZGluZ0NhbmNlbCAoKSB7XG4gICAgICAgIHZhciBpbmRleCA9IGZpbmQocmFmQ2FsbGJhY2tzLCBwZW5kaW5nQ2FuY2VsKVxuICAgICAgICByYWZDYWxsYmFja3NbaW5kZXhdID0gcmFmQ2FsbGJhY2tzW3JhZkNhbGxiYWNrcy5sZW5ndGggLSAxXVxuICAgICAgICByYWZDYWxsYmFja3MubGVuZ3RoIC09IDFcbiAgICAgICAgaWYgKHJhZkNhbGxiYWNrcy5sZW5ndGggPD0gMCkge1xuICAgICAgICAgIHN0b3BSQUYoKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICByYWZDYWxsYmFja3NbaV0gPSBwZW5kaW5nQ2FuY2VsXG4gICAgfVxuXG4gICAgc3RhcnRSQUYoKVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGNhbmNlbDogY2FuY2VsXG4gICAgfVxuICB9XG5cbiAgLy8gcG9sbCB2aWV3cG9ydFxuICBmdW5jdGlvbiBwb2xsVmlld3BvcnQgKCkge1xuICAgIHZhciB2aWV3cG9ydCA9IG5leHRTdGF0ZS52aWV3cG9ydFxuICAgIHZhciBzY2lzc29yQm94ID0gbmV4dFN0YXRlLnNjaXNzb3JfYm94XG4gICAgdmlld3BvcnRbMF0gPSB2aWV3cG9ydFsxXSA9IHNjaXNzb3JCb3hbMF0gPSBzY2lzc29yQm94WzFdID0gMFxuICAgIGNvbnRleHRTdGF0ZS52aWV3cG9ydFdpZHRoID1cbiAgICAgIGNvbnRleHRTdGF0ZS5mcmFtZWJ1ZmZlcldpZHRoID1cbiAgICAgIGNvbnRleHRTdGF0ZS5kcmF3aW5nQnVmZmVyV2lkdGggPVxuICAgICAgdmlld3BvcnRbMl0gPVxuICAgICAgc2Npc3NvckJveFsyXSA9IGdsLmRyYXdpbmdCdWZmZXJXaWR0aFxuICAgIGNvbnRleHRTdGF0ZS52aWV3cG9ydEhlaWdodCA9XG4gICAgICBjb250ZXh0U3RhdGUuZnJhbWVidWZmZXJIZWlnaHQgPVxuICAgICAgY29udGV4dFN0YXRlLmRyYXdpbmdCdWZmZXJIZWlnaHQgPVxuICAgICAgdmlld3BvcnRbM10gPVxuICAgICAgc2Npc3NvckJveFszXSA9IGdsLmRyYXdpbmdCdWZmZXJIZWlnaHRcbiAgfVxuXG4gIGZ1bmN0aW9uIHBvbGwgKCkge1xuICAgIGNvbnRleHRTdGF0ZS50aWNrICs9IDFcbiAgICBjb250ZXh0U3RhdGUudGltZSA9IG5vdygpXG4gICAgcG9sbFZpZXdwb3J0KClcbiAgICBjb3JlLnByb2NzLnBvbGwoKVxuICB9XG5cbiAgZnVuY3Rpb24gcmVmcmVzaCAoKSB7XG4gICAgcG9sbFZpZXdwb3J0KClcbiAgICBjb3JlLnByb2NzLnJlZnJlc2goKVxuICAgIGlmICh0aW1lcikge1xuICAgICAgdGltZXIudXBkYXRlKClcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBub3cgKCkge1xuICAgIHJldHVybiAoY2xvY2soKSAtIFNUQVJUX1RJTUUpIC8gMTAwMC4wXG4gIH1cblxuICByZWZyZXNoKClcblxuICBmdW5jdGlvbiBhZGRMaXN0ZW5lciAoZXZlbnQsIGNhbGxiYWNrKSB7XG4gICAgXG5cbiAgICB2YXIgY2FsbGJhY2tzXG4gICAgc3dpdGNoIChldmVudCkge1xuICAgICAgY2FzZSAnZnJhbWUnOlxuICAgICAgICByZXR1cm4gZnJhbWUoY2FsbGJhY2spXG4gICAgICBjYXNlICdsb3N0JzpcbiAgICAgICAgY2FsbGJhY2tzID0gbG9zc0NhbGxiYWNrc1xuICAgICAgICBicmVha1xuICAgICAgY2FzZSAncmVzdG9yZSc6XG4gICAgICAgIGNhbGxiYWNrcyA9IHJlc3RvcmVDYWxsYmFja3NcbiAgICAgICAgYnJlYWtcbiAgICAgIGNhc2UgJ2Rlc3Ryb3knOlxuICAgICAgICBjYWxsYmFja3MgPSBkZXN0cm95Q2FsbGJhY2tzXG4gICAgICAgIGJyZWFrXG4gICAgICBkZWZhdWx0OlxuICAgICAgICBcbiAgICB9XG5cbiAgICBjYWxsYmFja3MucHVzaChjYWxsYmFjaylcbiAgICByZXR1cm4ge1xuICAgICAgY2FuY2VsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY2FsbGJhY2tzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgaWYgKGNhbGxiYWNrc1tpXSA9PT0gY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGNhbGxiYWNrc1tpXSA9IGNhbGxiYWNrc1tjYWxsYmFja3MubGVuZ3RoIC0gMV1cbiAgICAgICAgICAgIGNhbGxiYWNrcy5wb3AoKVxuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgdmFyIHJlZ2wgPSBleHRlbmQoY29tcGlsZVByb2NlZHVyZSwge1xuICAgIC8vIENsZWFyIGN1cnJlbnQgRkJPXG4gICAgY2xlYXI6IGNsZWFyLFxuXG4gICAgLy8gU2hvcnQgY3V0cyBmb3IgZHluYW1pYyB2YXJpYWJsZXNcbiAgICBwcm9wOiBkeW5hbWljLmRlZmluZS5iaW5kKG51bGwsIERZTl9QUk9QKSxcbiAgICBjb250ZXh0OiBkeW5hbWljLmRlZmluZS5iaW5kKG51bGwsIERZTl9DT05URVhUKSxcbiAgICB0aGlzOiBkeW5hbWljLmRlZmluZS5iaW5kKG51bGwsIERZTl9TVEFURSksXG5cbiAgICAvLyBleGVjdXRlcyBhbiBlbXB0eSBkcmF3IGNvbW1hbmRcbiAgICBkcmF3OiBjb21waWxlUHJvY2VkdXJlKHt9KSxcblxuICAgIC8vIFJlc291cmNlc1xuICAgIGJ1ZmZlcjogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgIHJldHVybiBidWZmZXJTdGF0ZS5jcmVhdGUob3B0aW9ucywgR0xfQVJSQVlfQlVGRkVSLCBmYWxzZSwgZmFsc2UpXG4gICAgfSxcbiAgICBlbGVtZW50czogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgIHJldHVybiBlbGVtZW50U3RhdGUuY3JlYXRlKG9wdGlvbnMsIGZhbHNlKVxuICAgIH0sXG4gICAgdGV4dHVyZTogdGV4dHVyZVN0YXRlLmNyZWF0ZTJELFxuICAgIGN1YmU6IHRleHR1cmVTdGF0ZS5jcmVhdGVDdWJlLFxuICAgIHJlbmRlcmJ1ZmZlcjogcmVuZGVyYnVmZmVyU3RhdGUuY3JlYXRlLFxuICAgIGZyYW1lYnVmZmVyOiBmcmFtZWJ1ZmZlclN0YXRlLmNyZWF0ZSxcbiAgICBmcmFtZWJ1ZmZlckN1YmU6IGZyYW1lYnVmZmVyU3RhdGUuY3JlYXRlQ3ViZSxcblxuICAgIC8vIEV4cG9zZSBjb250ZXh0IGF0dHJpYnV0ZXNcbiAgICBhdHRyaWJ1dGVzOiBnbEF0dHJpYnV0ZXMsXG5cbiAgICAvLyBGcmFtZSByZW5kZXJpbmdcbiAgICBmcmFtZTogZnJhbWUsXG4gICAgb246IGFkZExpc3RlbmVyLFxuXG4gICAgLy8gU3lzdGVtIGxpbWl0c1xuICAgIGxpbWl0czogbGltaXRzLFxuICAgIGhhc0V4dGVuc2lvbjogZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHJldHVybiBsaW1pdHMuZXh0ZW5zaW9ucy5pbmRleE9mKG5hbWUudG9Mb3dlckNhc2UoKSkgPj0gMFxuICAgIH0sXG5cbiAgICAvLyBSZWFkIHBpeGVsc1xuICAgIHJlYWQ6IHJlYWRQaXhlbHMsXG5cbiAgICAvLyBEZXN0cm95IHJlZ2wgYW5kIGFsbCBhc3NvY2lhdGVkIHJlc291cmNlc1xuICAgIGRlc3Ryb3k6IGRlc3Ryb3ksXG5cbiAgICAvLyBEaXJlY3QgR0wgc3RhdGUgbWFuaXB1bGF0aW9uXG4gICAgX2dsOiBnbCxcbiAgICBfcmVmcmVzaDogcmVmcmVzaCxcblxuICAgIHBvbGw6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHBvbGwoKVxuICAgICAgaWYgKHRpbWVyKSB7XG4gICAgICAgIHRpbWVyLnVwZGF0ZSgpXG4gICAgICB9XG4gICAgfSxcblxuICAgIC8vIEN1cnJlbnQgdGltZVxuICAgIG5vdzogbm93LFxuXG4gICAgLy8gcmVnbCBTdGF0aXN0aWNzIEluZm9ybWF0aW9uXG4gICAgc3RhdHM6IHN0YXRzXG4gIH0pXG5cbiAgY29uZmlnLm9uRG9uZShudWxsLCByZWdsKVxuXG4gIHJldHVybiByZWdsXG59XG4iXX0=
