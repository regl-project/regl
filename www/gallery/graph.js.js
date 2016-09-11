(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*
  tags: gpgpu, advanced

  <p>No description.</p>

 */

var regl = require('../regl')({
  extensions: ['webgl_draw_buffers', 'oes_texture_float']
});
var mouse = require('mouse-change')();

var VERTEX_TEXTURE_SIZE = 64;

var EDGE_LENGTH = 0.5 / VERTEX_TEXTURE_SIZE;
var EDGE_STIFFNESS = 0.08;

var FIELD_RES = 1024;
var BLUR_RADIUS = 16;
var BLUR_PASSES = 2;
var DT = 0.0001;
var DAMPING = 0.98;
var FIELD_STRENGTH = 0.05;
var MOUSE_SIZE = 32;

function vertexIndex(v) {
  return [v % VERTEX_TEXTURE_SIZE, v / VERTEX_TEXTURE_SIZE | 0];
}

function indexVertex(i, j) {
  return i + j * VERTEX_TEXTURE_SIZE;
}

// Initialize vertex data
var VERTEX_COUNT = VERTEX_TEXTURE_SIZE * VERTEX_TEXTURE_SIZE;
var VERTEX_STATE_DATA = new Float32Array(4 * VERTEX_COUNT);
var VERTEX_IDS = new Float32Array(2 * VERTEX_COUNT);(function () {
  for (var i = 0; i < VERTEX_TEXTURE_SIZE; ++i) {
    for (var j = 0; j < VERTEX_TEXTURE_SIZE; ++j) {
      var ptr = VERTEX_TEXTURE_SIZE * i + j;
      VERTEX_IDS[2 * ptr] = i / VERTEX_TEXTURE_SIZE;
      VERTEX_IDS[2 * ptr + 1] = j / VERTEX_TEXTURE_SIZE;

      // Initial configuration of vertices
      VERTEX_STATE_DATA[4 * ptr] = Math.random();
      VERTEX_STATE_DATA[4 * ptr + 1] = Math.random();
    }
  }
})();
var VERTEX_ID_BUFFER = regl.buffer(VERTEX_IDS);
var VERTEX_STATE = [regl.framebuffer({
  color: regl.texture({
    radius: VERTEX_TEXTURE_SIZE,
    data: VERTEX_STATE_DATA,
    type: 'float'
  }),
  depthStencil: false
}), regl.framebuffer({
  radius: VERTEX_TEXTURE_SIZE,
  colorType: 'float',
  depthStencil: false
})];

// Initialize edges
var ARCS = [];(function () {
  function edge(si, sj, ti, tj) {
    var s = indexVertex(si, sj);
    var t = indexVertex(ti, tj);
    ARCS.push([s, t], [t, s]);
  }
  for (var i = 0; i < VERTEX_TEXTURE_SIZE; ++i) {
    for (var j = 0; j < VERTEX_TEXTURE_SIZE; ++j) {
      if (i < VERTEX_TEXTURE_SIZE - 1) {
        edge(i, j, i + 1, j);
      }
      if (j < VERTEX_TEXTURE_SIZE - 1) {
        edge(i, j, i, j + 1);
      }
    }
  }
})();

// Initialize fields
var FIELDS = [regl.framebuffer({
  color: regl.texture({
    type: 'float',
    wrap: 'repeat',
    radius: FIELD_RES
  }),
  depthStencil: false
}), regl.framebuffer({
  color: regl.texture({
    type: 'float',
    wrap: 'repeat',
    radius: FIELD_RES
  }),
  depthStencil: false
})];

// ------------------------------------
// Potential field computation
// ------------------------------------
var setFBO = regl({
  framebuffer: regl.prop('framebuffer')
});

var splatVerts = regl({
  vert: '\n  precision highp float;\n  attribute vec2 id;\n  uniform sampler2D vertexState;\n  void main () {\n    vec4 state = texture2D(vertexState, id);\n    gl_Position = vec4(2.0 * fract(state.xy) - 1.0, 0, 1);\n  }',

  frag: '\n  precision highp float;\n  void main () {\n    gl_FragColor = vec4(1, 0, 0, 0);\n  }',

  attributes: {
    id: VERTEX_ID_BUFFER
  },
  uniforms: {
    vertexState: regl.prop('vertexState')
  },
  blend: {
    enable: true,
    func: {
      src: 1,
      dst: 1
    },
    equation: 'add'
  },
  depth: { enable: false, mask: false },
  primitive: 'points',
  count: VERTEX_COUNT,
  elements: null
});

var blurPass = regl({
  framebuffer: regl.prop('dest'),

  vert: '\n  precision highp float;\n  attribute vec2 p;\n  varying vec2 uv;\n  void main () {\n    uv = 0.5 * (p + 1.0);\n    gl_Position = vec4(p, 0, 1);\n  }',

  frag: '\n  precision highp float;\n  uniform sampler2D src;\n  uniform vec2 axis;\n  varying vec2 uv;\n  void main () {\n    float f = 0.0;\n    for (int i = -' + BLUR_RADIUS + '; i <= ' + BLUR_RADIUS + '; ++i) {\n      f += (' + (BLUR_RADIUS + 1) + '.0 - abs(float(i))) / ' + (2 * BLUR_RADIUS + 1) + '.0 *\n          texture2D(src, axis * float(i) + uv).r;\n    }\n    gl_FragColor = vec4(f, 0, 0, 1);\n  }',

  attributes: {
    p: [-4, 0, 4, 4, 4, -4]
  },
  uniforms: {
    src: function (context, props) {
      return props.src;
    },
    axis: function (context, props) {
      var result = [0, 0];
      result[props.axis] = 1.0 / FIELD_RES;
      return result;
    }
  },
  depth: { enable: false, mask: false },
  count: 3
});

var gradPass = regl({
  framebuffer: regl.prop('dest'),

  vert: '\n  precision highp float;\n  attribute vec2 p;\n  varying vec2 uv;\n  void main () {\n    uv = 0.5 * (p + 1.0);\n    gl_Position = vec4(p, 0, 1);\n  }',

  frag: '\n  precision highp float;\n  uniform sampler2D src;\n  uniform vec2 deriv;\n  varying vec2 uv;\n  void main () {\n    float f01 = texture2D(src, uv - vec2(deriv.x, 0)).x;\n    float f21 = texture2D(src, uv + vec2(deriv.x, 0)).x;\n    float f10 = texture2D(src, uv - vec2(0, deriv.y)).x;\n    float f12 = texture2D(src, uv + vec2(0, deriv.y)).x;\n    gl_FragColor = vec4(f21 - f01, f12 - f10, 0, 1);\n  }',

  attributes: {
    p: [-4, 0, 4, 4, 4, -4]
  },
  uniforms: {
    src: regl.prop('src'),
    deriv: function (context, props) {
      return [1 / props.src.width, 1 / props.src.height];
    }
  },
  depth: { enable: false, mask: false },
  count: 3
});

var applySpringForces = regl({
  framebuffer: regl.prop('dest'),

  vert: '\n  precision highp float;\n  attribute vec4 edge;\n  varying vec2 force;\n  uniform sampler2D vertexState;\n  uniform float restLength, stiffness;\n  void main () {\n    vec4 s0 = texture2D(vertexState, edge.rg);\n    vec4 s1 = texture2D(vertexState, edge.ba);\n    vec2 d = s1.xy - s0.xy;\n    float l = max(length(d), 0.001);\n    force = stiffness * log(l / restLength) * d / l;\n    gl_Position = vec4(2.0 * edge.xy - 1.0 + 1.0 / ' + VERTEX_TEXTURE_SIZE + '.0, 0, 1);\n  }',

  frag: '\n  precision highp float;\n  varying vec2 force;\n  void main () {\n    gl_FragColor = vec4(0, 0, force);\n  }',

  attributes: {
    edge: ARCS.map(function (arc) {
      var ps = vertexIndex(arc[0]);
      var pt = vertexIndex(arc[1]);
      return [ps[0] / VERTEX_TEXTURE_SIZE, ps[1] / VERTEX_TEXTURE_SIZE, pt[0] / VERTEX_TEXTURE_SIZE, pt[1] / VERTEX_TEXTURE_SIZE];
    })
  },

  uniforms: {
    vertexState: regl.prop('src'),
    restLength: EDGE_LENGTH,
    stiffness: EDGE_STIFFNESS
  },

  blend: {
    enable: true,
    func: {
      src: 1,
      dst: 1
    },
    equation: 'add'
  },
  depth: { enable: false, mask: false },
  count: ARCS.length,
  primitive: 'points'
});

// ------------------------------------
// Vertex advection
// ------------------------------------
var integrateVerts = regl({
  framebuffer: regl.prop('dest'),

  vert: '\n  precision highp float;\n  attribute vec2 p;\n  varying vec2 id;\n  void main () {\n    id = 0.5 * (p + 1.0);\n    gl_Position = vec4(p, 0, 1);\n  }',

  frag: '\n  precision highp float;\n  uniform sampler2D vertexState, field;\n  uniform float temperature, t;\n  varying vec2 id;\n\n  float rnd (vec2 co) {\n  \treturn fract(sin(t*0.1+dot(co.xy, vec2(12.9898,78.233))) * 43758.5453);\n  }\n\n  void main () {\n    vec4 state = texture2D(vertexState, id);\n    vec2 p = state.rg;\n    vec2 v = state.ba;\n    vec2 force = texture2D(field, p).xy;\n    p += ' + DT + ' * v;\n    v = float(' + DAMPING + ') * (v - float(' + FIELD_STRENGTH + ') * force);\n    vec2 jitter = vec2(rnd(id), rnd(id + 1000.0)) - 0.5;\n    gl_FragColor = vec4(p + temperature * jitter, v);\n  }',
  attributes: {
    p: [-4, 0, 4, -4, 4, 4]
  },
  uniforms: {
    vertexState: regl.prop('src'),
    field: regl.prop('field'),
    temperature: function ({ tick }) {
      return 1.0 / (0.5 * tick + 20.0);
    },
    t: regl.context('tick')
  },
  count: 3
});

var renderPoints = regl({
  vert: '\n  precision highp float;\n  attribute vec2 id;\n  uniform sampler2D vertexState;\n  void main () {\n    vec4 state = texture2D(vertexState, id);\n    gl_PointSize = 2.0;\n    gl_Position = vec4(2.0 * fract(state.xy) - 1.0, 0, 1);\n  }',

  frag: '\n  precision highp float;\n  void main () {\n    gl_FragColor = vec4(0, 0, 0, 1);\n  }',

  attributes: {
    id: VERTEX_ID_BUFFER
  },
  uniforms: {
    vertexState: function ({ tick }) {
      return VERTEX_STATE[tick % 2];
    }
  },
  depth: { enable: false, mask: false },
  primitive: 'points',
  count: VERTEX_COUNT,
  elements: null
});

var lineWidth = 2;
if (lineWidth > regl.limits.lineWidthDims[1]) {
  lineWidth = regl.limits.lineWidthDims[1];
}

var renderEdges = regl({
  vert: '\n  precision highp float;\n  attribute vec4 id;\n  attribute float arcDir;\n  uniform float dir;\n  uniform sampler2D vertexState;\n  void main () {\n    float side = arcDir + dir - 2.0 * dir * arcDir;\n    vec2 s0 = texture2D(vertexState, id.rg).xy;\n    vec2 s1 = texture2D(vertexState, id.ba).xy;\n    vec2 shift = mix(fract(s0) - s0, fract(s1) - s1, side);\n    gl_Position = vec4(2.0 * (s0.xy + shift) - 1.0, 0, 1);\n  }',

  frag: '\n  void main () {\n    gl_FragColor = vec4(0.1, 0, 1, 1);\n  }',

  attributes: {
    id: ARCS.map(function (arc) {
      var s = vertexIndex(arc[0]);
      var t = vertexIndex(arc[1]);
      return [s[0] / VERTEX_TEXTURE_SIZE, s[1] / VERTEX_TEXTURE_SIZE, t[0] / VERTEX_TEXTURE_SIZE, t[1] / VERTEX_TEXTURE_SIZE];
    }),
    arcDir: ARCS.map(function (arc, i) {
      return i % 2;
    })
  },
  uniforms: {
    vertexState: function ({ tick }) {
      return VERTEX_STATE[tick % 2];
    },
    dir: regl.prop('dir')
  },
  depth: { enable: false, mask: false },
  count: ARCS.length,
  primitive: 'lines',
  lineWidth: lineWidth
});

var splatMouse = regl({
  vert: '\n  uniform vec2 mouse;\n  attribute float p;\n  void main () {\n    gl_PointSize = ' + MOUSE_SIZE + '.0;\n    gl_Position = vec4(mouse, p, 1);\n  }',
  frag: '\n  precision highp float;\n  uniform float strength;\n  void main () {\n    float s = strength * exp(-16.0 * dot(gl_PointCoord.xy, gl_PointCoord.xy));\n    gl_FragColor = vec4(s, 0, 0, 1);\n  }',
  attributes: { p: [0] },
  uniforms: {
    mouse: function ({ drawingBufferWidth, drawingBufferHeight, pixelRatio }) {
      return [2.0 * pixelRatio * mouse.x / drawingBufferWidth - 1.0, 1.0 - 2.0 * pixelRatio * mouse.y / drawingBufferHeight];
    },
    strength: function () {
      return mouse.buttons ? 5.0 : 1.0;
    }
  },
  count: 1,
  primitive: 'points'
});

// Main integration loop
function step({ tick }) {
  setFBO({ framebuffer: FIELDS[0] }, function () {
    regl.clear({ color: [0, 0, 0, 1] });
    splatMouse();
    splatVerts({
      vertexState: VERTEX_STATE[(tick + 1) % 2]
    });
  });
  for (var i = 0; i < 2 * BLUR_PASSES; ++i) {
    blurPass({
      dest: FIELDS[(i + 1) % 2],
      src: FIELDS[i % 2],
      axis: i % 2
    });
  }
  gradPass({
    dest: FIELDS[1],
    src: FIELDS[0]
  });
  applySpringForces({
    dest: VERTEX_STATE[(tick + 1) % 2],
    src: VERTEX_STATE[tick % 2]
  });
  integrateVerts({
    dest: VERTEX_STATE[tick % 2],
    src: VERTEX_STATE[(tick + 1) % 2],
    field: FIELDS[1]
  });
}

regl.frame(function (context) {
  step(context);
  regl.clear({
    color: [1, 1, 1, 1]
  });
  renderEdges([{ dir: 0 }, { dir: 1 }]);
  renderPoints();
});

},{"../regl":36,"mouse-change":34}],2:[function(require,module,exports){
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

},{"mouse-event":35}],35:[function(require,module,exports){
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJleGFtcGxlL2dyYXBoLmpzIiwibGliL2F0dHJpYnV0ZS5qcyIsImxpYi9idWZmZXIuanMiLCJsaWIvY29uc3RhbnRzL2FycmF5dHlwZXMuanNvbiIsImxpYi9jb25zdGFudHMvZHR5cGVzLmpzb24iLCJsaWIvY29uc3RhbnRzL3ByaW1pdGl2ZXMuanNvbiIsImxpYi9jb25zdGFudHMvdXNhZ2UuanNvbiIsImxpYi9jb3JlLmpzIiwibGliL2R5bmFtaWMuanMiLCJsaWIvZWxlbWVudHMuanMiLCJsaWIvZXh0ZW5zaW9uLmpzIiwibGliL2ZyYW1lYnVmZmVyLmpzIiwibGliL2xpbWl0cy5qcyIsImxpYi9yZWFkLmpzIiwibGliL3JlbmRlcmJ1ZmZlci5qcyIsImxpYi9zaGFkZXIuanMiLCJsaWIvc3RhdHMuanMiLCJsaWIvc3RyaW5ncy5qcyIsImxpYi90ZXh0dXJlLmpzIiwibGliL3RpbWVyLmpzIiwibGliL3V0aWwvY2xvY2suanMiLCJsaWIvdXRpbC9jb2RlZ2VuLmpzIiwibGliL3V0aWwvZXh0ZW5kLmpzIiwibGliL3V0aWwvZmxhdHRlbi5qcyIsImxpYi91dGlsL2lzLWFycmF5LWxpa2UuanMiLCJsaWIvdXRpbC9pcy1uZGFycmF5LmpzIiwibGliL3V0aWwvaXMtdHlwZWQtYXJyYXkuanMiLCJsaWIvdXRpbC9sb29wLmpzIiwibGliL3V0aWwvcG9vbC5qcyIsImxpYi91dGlsL3JhZi5qcyIsImxpYi91dGlsL3RvLWhhbGYtZmxvYXQuanMiLCJsaWIvdXRpbC92YWx1ZXMuanMiLCJsaWIvd2ViZ2wuanMiLCJub2RlX21vZHVsZXMvbW91c2UtY2hhbmdlL21vdXNlLWxpc3Rlbi5qcyIsIm5vZGVfbW9kdWxlcy9tb3VzZS1ldmVudC9tb3VzZS5qcyIsInJlZ2wuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTs7Ozs7OztBQU9BLElBQU0sT0FBTyxRQUFRLFNBQVIs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QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7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QUFKLEVBQVc7QUFDVCxjQUFNLE1BQU47QUFDRDtBQUNGLEtBckRpQzs7QUF1RGxDO0FBQ0EsU0FBSyxHQXhENkI7O0FBMERsQztBQUNBLFdBQU87QUEzRDJCLEdBQXpCLENBQVg7O0FBOERBLFNBQU8sTUFBUCxDQUFjLElBQWQsRUFBb0IsSUFBcEI7O0FBRUEsU0FBTyxJQUFQO0FBQ0QsQ0FsaEJEIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8qXG4gIHRhZ3M6IGdwZ3B1LCBhZHZhbmNlZFxuXG4gIDxwPk5vIGRlc2NyaXB0aW9uLjwvcD5cblxuICovXG5cbmNvbnN0IHJlZ2wgPSByZXF1aXJlKCcuLi9yZWdsJykoe1xuICBleHRlbnNpb25zOiBbJ3dlYmdsX2RyYXdfYnVmZmVycycsICdvZXNfdGV4dHVyZV9mbG9hdCddXG59KVxuY29uc3QgbW91c2UgPSByZXF1aXJlKCdtb3VzZS1jaGFuZ2UnKSgpXG5cbmNvbnN0IFZFUlRFWF9URVhUVVJFX1NJWkUgPSA2NFxuXG5jb25zdCBFREdFX0xFTkdUSCA9IDAuNSAvIFZFUlRFWF9URVhUVVJFX1NJWkVcbmNvbnN0IEVER0VfU1RJRkZORVNTID0gMC4wOFxuXG5jb25zdCBGSUVMRF9SRVMgPSAxMDI0XG5jb25zdCBCTFVSX1JBRElVUyA9IDE2XG5jb25zdCBCTFVSX1BBU1NFUyA9IDJcbmNvbnN0IERUID0gMC4wMDAxXG5jb25zdCBEQU1QSU5HID0gMC45OFxuY29uc3QgRklFTERfU1RSRU5HVEggPSAwLjA1XG5jb25zdCBNT1VTRV9TSVpFID0gMzJcblxuZnVuY3Rpb24gdmVydGV4SW5kZXggKHYpIHtcbiAgcmV0dXJuIFsgdiAlIFZFUlRFWF9URVhUVVJFX1NJWkUsICh2IC8gVkVSVEVYX1RFWFRVUkVfU0laRSkgfCAwIF1cbn1cblxuZnVuY3Rpb24gaW5kZXhWZXJ0ZXggKGksIGopIHtcbiAgcmV0dXJuIGkgKyBqICogVkVSVEVYX1RFWFRVUkVfU0laRVxufVxuXG4vLyBJbml0aWFsaXplIHZlcnRleCBkYXRhXG5jb25zdCBWRVJURVhfQ09VTlQgPSBWRVJURVhfVEVYVFVSRV9TSVpFICogVkVSVEVYX1RFWFRVUkVfU0laRVxuY29uc3QgVkVSVEVYX1NUQVRFX0RBVEEgPSBuZXcgRmxvYXQzMkFycmF5KDQgKiBWRVJURVhfQ09VTlQpXG5jb25zdCBWRVJURVhfSURTID0gbmV3IEZsb2F0MzJBcnJheSgyICogVkVSVEVYX0NPVU5UKVxuOygoKSA9PiB7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgVkVSVEVYX1RFWFRVUkVfU0laRTsgKytpKSB7XG4gICAgZm9yIChsZXQgaiA9IDA7IGogPCBWRVJURVhfVEVYVFVSRV9TSVpFOyArK2opIHtcbiAgICAgIGNvbnN0IHB0ciA9IFZFUlRFWF9URVhUVVJFX1NJWkUgKiBpICsgalxuICAgICAgVkVSVEVYX0lEU1syICogcHRyXSA9IGkgLyBWRVJURVhfVEVYVFVSRV9TSVpFXG4gICAgICBWRVJURVhfSURTWzIgKiBwdHIgKyAxXSA9IGogLyBWRVJURVhfVEVYVFVSRV9TSVpFXG5cbiAgICAgIC8vIEluaXRpYWwgY29uZmlndXJhdGlvbiBvZiB2ZXJ0aWNlc1xuICAgICAgVkVSVEVYX1NUQVRFX0RBVEFbNCAqIHB0cl0gPSBNYXRoLnJhbmRvbSgpXG4gICAgICBWRVJURVhfU1RBVEVfREFUQVs0ICogcHRyICsgMV0gPSBNYXRoLnJhbmRvbSgpXG4gICAgfVxuICB9XG59KSgpXG5jb25zdCBWRVJURVhfSURfQlVGRkVSID0gcmVnbC5idWZmZXIoVkVSVEVYX0lEUylcbmNvbnN0IFZFUlRFWF9TVEFURSA9IFtcbiAgcmVnbC5mcmFtZWJ1ZmZlcih7XG4gICAgY29sb3I6IHJlZ2wudGV4dHVyZSh7XG4gICAgICByYWRpdXM6IFZFUlRFWF9URVhUVVJFX1NJWkUsXG4gICAgICBkYXRhOiBWRVJURVhfU1RBVEVfREFUQSxcbiAgICAgIHR5cGU6ICdmbG9hdCdcbiAgICB9KSxcbiAgICBkZXB0aFN0ZW5jaWw6IGZhbHNlXG4gIH0pLFxuICByZWdsLmZyYW1lYnVmZmVyKHtcbiAgICByYWRpdXM6IFZFUlRFWF9URVhUVVJFX1NJWkUsXG4gICAgY29sb3JUeXBlOiAnZmxvYXQnLFxuICAgIGRlcHRoU3RlbmNpbDogZmFsc2VcbiAgfSlcbl1cblxuLy8gSW5pdGlhbGl6ZSBlZGdlc1xuY29uc3QgQVJDUyA9IFtdXG47KCgpID0+IHtcbiAgZnVuY3Rpb24gZWRnZSAoc2ksIHNqLCB0aSwgdGopIHtcbiAgICBjb25zdCBzID0gaW5kZXhWZXJ0ZXgoc2ksIHNqKVxuICAgIGNvbnN0IHQgPSBpbmRleFZlcnRleCh0aSwgdGopXG4gICAgQVJDUy5wdXNoKFtzLCB0XSwgW3QsIHNdKVxuICB9XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgVkVSVEVYX1RFWFRVUkVfU0laRTsgKytpKSB7XG4gICAgZm9yIChsZXQgaiA9IDA7IGogPCBWRVJURVhfVEVYVFVSRV9TSVpFOyArK2opIHtcbiAgICAgIGlmIChpIDwgVkVSVEVYX1RFWFRVUkVfU0laRSAtIDEpIHtcbiAgICAgICAgZWRnZShpLCBqLCBpICsgMSwgailcbiAgICAgIH1cbiAgICAgIGlmIChqIDwgVkVSVEVYX1RFWFRVUkVfU0laRSAtIDEpIHtcbiAgICAgICAgZWRnZShpLCBqLCBpLCBqICsgMSlcbiAgICAgIH1cbiAgICB9XG4gIH1cbn0pKClcblxuLy8gSW5pdGlhbGl6ZSBmaWVsZHNcbmNvbnN0IEZJRUxEUyA9IFtcbiAgcmVnbC5mcmFtZWJ1ZmZlcih7XG4gICAgY29sb3I6IHJlZ2wudGV4dHVyZSh7XG4gICAgICB0eXBlOiAnZmxvYXQnLFxuICAgICAgd3JhcDogJ3JlcGVhdCcsXG4gICAgICByYWRpdXM6IEZJRUxEX1JFU1xuICAgIH0pLFxuICAgIGRlcHRoU3RlbmNpbDogZmFsc2VcbiAgfSksXG4gIHJlZ2wuZnJhbWVidWZmZXIoe1xuICAgIGNvbG9yOiByZWdsLnRleHR1cmUoe1xuICAgICAgdHlwZTogJ2Zsb2F0JyxcbiAgICAgIHdyYXA6ICdyZXBlYXQnLFxuICAgICAgcmFkaXVzOiBGSUVMRF9SRVNcbiAgICB9KSxcbiAgICBkZXB0aFN0ZW5jaWw6IGZhbHNlXG4gIH0pXG5dXG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gUG90ZW50aWFsIGZpZWxkIGNvbXB1dGF0aW9uXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbmNvbnN0IHNldEZCTyA9IHJlZ2woe1xuICBmcmFtZWJ1ZmZlcjogcmVnbC5wcm9wKCdmcmFtZWJ1ZmZlcicpXG59KVxuXG5jb25zdCBzcGxhdFZlcnRzID0gcmVnbCh7XG4gIHZlcnQ6IGBcbiAgcHJlY2lzaW9uIGhpZ2hwIGZsb2F0O1xuICBhdHRyaWJ1dGUgdmVjMiBpZDtcbiAgdW5pZm9ybSBzYW1wbGVyMkQgdmVydGV4U3RhdGU7XG4gIHZvaWQgbWFpbiAoKSB7XG4gICAgdmVjNCBzdGF0ZSA9IHRleHR1cmUyRCh2ZXJ0ZXhTdGF0ZSwgaWQpO1xuICAgIGdsX1Bvc2l0aW9uID0gdmVjNCgyLjAgKiBmcmFjdChzdGF0ZS54eSkgLSAxLjAsIDAsIDEpO1xuICB9YCxcblxuICBmcmFnOiBgXG4gIHByZWNpc2lvbiBoaWdocCBmbG9hdDtcbiAgdm9pZCBtYWluICgpIHtcbiAgICBnbF9GcmFnQ29sb3IgPSB2ZWM0KDEsIDAsIDAsIDApO1xuICB9YCxcblxuICBhdHRyaWJ1dGVzOiB7XG4gICAgaWQ6IFZFUlRFWF9JRF9CVUZGRVJcbiAgfSxcbiAgdW5pZm9ybXM6IHtcbiAgICB2ZXJ0ZXhTdGF0ZTogcmVnbC5wcm9wKCd2ZXJ0ZXhTdGF0ZScpXG4gIH0sXG4gIGJsZW5kOiB7XG4gICAgZW5hYmxlOiB0cnVlLFxuICAgIGZ1bmM6IHtcbiAgICAgIHNyYzogMSxcbiAgICAgIGRzdDogMVxuICAgIH0sXG4gICAgZXF1YXRpb246ICdhZGQnXG4gIH0sXG4gIGRlcHRoOiB7ZW5hYmxlOiBmYWxzZSwgbWFzazogZmFsc2V9LFxuICBwcmltaXRpdmU6ICdwb2ludHMnLFxuICBjb3VudDogVkVSVEVYX0NPVU5ULFxuICBlbGVtZW50czogbnVsbFxufSlcblxuY29uc3QgYmx1clBhc3MgPSByZWdsKHtcbiAgZnJhbWVidWZmZXI6IHJlZ2wucHJvcCgnZGVzdCcpLFxuXG4gIHZlcnQ6IGBcbiAgcHJlY2lzaW9uIGhpZ2hwIGZsb2F0O1xuICBhdHRyaWJ1dGUgdmVjMiBwO1xuICB2YXJ5aW5nIHZlYzIgdXY7XG4gIHZvaWQgbWFpbiAoKSB7XG4gICAgdXYgPSAwLjUgKiAocCArIDEuMCk7XG4gICAgZ2xfUG9zaXRpb24gPSB2ZWM0KHAsIDAsIDEpO1xuICB9YCxcblxuICBmcmFnOiBgXG4gIHByZWNpc2lvbiBoaWdocCBmbG9hdDtcbiAgdW5pZm9ybSBzYW1wbGVyMkQgc3JjO1xuICB1bmlmb3JtIHZlYzIgYXhpcztcbiAgdmFyeWluZyB2ZWMyIHV2O1xuICB2b2lkIG1haW4gKCkge1xuICAgIGZsb2F0IGYgPSAwLjA7XG4gICAgZm9yIChpbnQgaSA9IC0ke0JMVVJfUkFESVVTfTsgaSA8PSAke0JMVVJfUkFESVVTfTsgKytpKSB7XG4gICAgICBmICs9ICgke0JMVVJfUkFESVVTICsgMX0uMCAtIGFicyhmbG9hdChpKSkpIC8gJHsyICogQkxVUl9SQURJVVMgKyAxfS4wICpcbiAgICAgICAgICB0ZXh0dXJlMkQoc3JjLCBheGlzICogZmxvYXQoaSkgKyB1dikucjtcbiAgICB9XG4gICAgZ2xfRnJhZ0NvbG9yID0gdmVjNChmLCAwLCAwLCAxKTtcbiAgfWAsXG5cbiAgYXR0cmlidXRlczoge1xuICAgIHA6IFsgLTQsIDAsIDQsIDQsIDQsIC00IF1cbiAgfSxcbiAgdW5pZm9ybXM6IHtcbiAgICBzcmM6IChjb250ZXh0LCBwcm9wcykgPT4ge1xuICAgICAgcmV0dXJuIHByb3BzLnNyY1xuICAgIH0sXG4gICAgYXhpczogKGNvbnRleHQsIHByb3BzKSA9PiB7XG4gICAgICBsZXQgcmVzdWx0ID0gWzAsIDBdXG4gICAgICByZXN1bHRbcHJvcHMuYXhpc10gPSAxLjAgLyBGSUVMRF9SRVNcbiAgICAgIHJldHVybiByZXN1bHRcbiAgICB9XG4gIH0sXG4gIGRlcHRoOiB7ZW5hYmxlOiBmYWxzZSwgbWFzazogZmFsc2V9LFxuICBjb3VudDogM1xufSlcblxuY29uc3QgZ3JhZFBhc3MgPSByZWdsKHtcbiAgZnJhbWVidWZmZXI6IHJlZ2wucHJvcCgnZGVzdCcpLFxuXG4gIHZlcnQ6IGBcbiAgcHJlY2lzaW9uIGhpZ2hwIGZsb2F0O1xuICBhdHRyaWJ1dGUgdmVjMiBwO1xuICB2YXJ5aW5nIHZlYzIgdXY7XG4gIHZvaWQgbWFpbiAoKSB7XG4gICAgdXYgPSAwLjUgKiAocCArIDEuMCk7XG4gICAgZ2xfUG9zaXRpb24gPSB2ZWM0KHAsIDAsIDEpO1xuICB9YCxcblxuICBmcmFnOiBgXG4gIHByZWNpc2lvbiBoaWdocCBmbG9hdDtcbiAgdW5pZm9ybSBzYW1wbGVyMkQgc3JjO1xuICB1bmlmb3JtIHZlYzIgZGVyaXY7XG4gIHZhcnlpbmcgdmVjMiB1djtcbiAgdm9pZCBtYWluICgpIHtcbiAgICBmbG9hdCBmMDEgPSB0ZXh0dXJlMkQoc3JjLCB1diAtIHZlYzIoZGVyaXYueCwgMCkpLng7XG4gICAgZmxvYXQgZjIxID0gdGV4dHVyZTJEKHNyYywgdXYgKyB2ZWMyKGRlcml2LngsIDApKS54O1xuICAgIGZsb2F0IGYxMCA9IHRleHR1cmUyRChzcmMsIHV2IC0gdmVjMigwLCBkZXJpdi55KSkueDtcbiAgICBmbG9hdCBmMTIgPSB0ZXh0dXJlMkQoc3JjLCB1diArIHZlYzIoMCwgZGVyaXYueSkpLng7XG4gICAgZ2xfRnJhZ0NvbG9yID0gdmVjNChmMjEgLSBmMDEsIGYxMiAtIGYxMCwgMCwgMSk7XG4gIH1gLFxuXG4gIGF0dHJpYnV0ZXM6IHtcbiAgICBwOiBbIC00LCAwLCA0LCA0LCA0LCAtNCBdXG4gIH0sXG4gIHVuaWZvcm1zOiB7XG4gICAgc3JjOiByZWdsLnByb3AoJ3NyYycpLFxuICAgIGRlcml2OiAoY29udGV4dCwgcHJvcHMpID0+IHtcbiAgICAgIHJldHVybiBbMSAvIHByb3BzLnNyYy53aWR0aCwgMSAvIHByb3BzLnNyYy5oZWlnaHRdXG4gICAgfVxuICB9LFxuICBkZXB0aDoge2VuYWJsZTogZmFsc2UsIG1hc2s6IGZhbHNlfSxcbiAgY291bnQ6IDNcbn0pXG5cbmNvbnN0IGFwcGx5U3ByaW5nRm9yY2VzID0gcmVnbCh7XG4gIGZyYW1lYnVmZmVyOiByZWdsLnByb3AoJ2Rlc3QnKSxcblxuICB2ZXJ0OiBgXG4gIHByZWNpc2lvbiBoaWdocCBmbG9hdDtcbiAgYXR0cmlidXRlIHZlYzQgZWRnZTtcbiAgdmFyeWluZyB2ZWMyIGZvcmNlO1xuICB1bmlmb3JtIHNhbXBsZXIyRCB2ZXJ0ZXhTdGF0ZTtcbiAgdW5pZm9ybSBmbG9hdCByZXN0TGVuZ3RoLCBzdGlmZm5lc3M7XG4gIHZvaWQgbWFpbiAoKSB7XG4gICAgdmVjNCBzMCA9IHRleHR1cmUyRCh2ZXJ0ZXhTdGF0ZSwgZWRnZS5yZyk7XG4gICAgdmVjNCBzMSA9IHRleHR1cmUyRCh2ZXJ0ZXhTdGF0ZSwgZWRnZS5iYSk7XG4gICAgdmVjMiBkID0gczEueHkgLSBzMC54eTtcbiAgICBmbG9hdCBsID0gbWF4KGxlbmd0aChkKSwgMC4wMDEpO1xuICAgIGZvcmNlID0gc3RpZmZuZXNzICogbG9nKGwgLyByZXN0TGVuZ3RoKSAqIGQgLyBsO1xuICAgIGdsX1Bvc2l0aW9uID0gdmVjNCgyLjAgKiBlZGdlLnh5IC0gMS4wICsgMS4wIC8gJHtWRVJURVhfVEVYVFVSRV9TSVpFfS4wLCAwLCAxKTtcbiAgfWAsXG5cbiAgZnJhZzogYFxuICBwcmVjaXNpb24gaGlnaHAgZmxvYXQ7XG4gIHZhcnlpbmcgdmVjMiBmb3JjZTtcbiAgdm9pZCBtYWluICgpIHtcbiAgICBnbF9GcmFnQ29sb3IgPSB2ZWM0KDAsIDAsIGZvcmNlKTtcbiAgfWAsXG5cbiAgYXR0cmlidXRlczoge1xuICAgIGVkZ2U6IEFSQ1MubWFwKChhcmMpID0+IHtcbiAgICAgIGNvbnN0IHBzID0gdmVydGV4SW5kZXgoYXJjWzBdKVxuICAgICAgY29uc3QgcHQgPSB2ZXJ0ZXhJbmRleChhcmNbMV0pXG4gICAgICByZXR1cm4gW1xuICAgICAgICBwc1swXSAvIFZFUlRFWF9URVhUVVJFX1NJWkUsXG4gICAgICAgIHBzWzFdIC8gVkVSVEVYX1RFWFRVUkVfU0laRSxcbiAgICAgICAgcHRbMF0gLyBWRVJURVhfVEVYVFVSRV9TSVpFLFxuICAgICAgICBwdFsxXSAvIFZFUlRFWF9URVhUVVJFX1NJWkVcbiAgICAgIF1cbiAgICB9KVxuICB9LFxuXG4gIHVuaWZvcm1zOiB7XG4gICAgdmVydGV4U3RhdGU6IHJlZ2wucHJvcCgnc3JjJyksXG4gICAgcmVzdExlbmd0aDogRURHRV9MRU5HVEgsXG4gICAgc3RpZmZuZXNzOiBFREdFX1NUSUZGTkVTU1xuICB9LFxuXG4gIGJsZW5kOiB7XG4gICAgZW5hYmxlOiB0cnVlLFxuICAgIGZ1bmM6IHtcbiAgICAgIHNyYzogMSxcbiAgICAgIGRzdDogMVxuICAgIH0sXG4gICAgZXF1YXRpb246ICdhZGQnXG4gIH0sXG4gIGRlcHRoOiB7ZW5hYmxlOiBmYWxzZSwgbWFzazogZmFsc2V9LFxuICBjb3VudDogQVJDUy5sZW5ndGgsXG4gIHByaW1pdGl2ZTogJ3BvaW50cydcbn0pXG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gVmVydGV4IGFkdmVjdGlvblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5jb25zdCBpbnRlZ3JhdGVWZXJ0cyA9IHJlZ2woe1xuICBmcmFtZWJ1ZmZlcjogcmVnbC5wcm9wKCdkZXN0JyksXG5cbiAgdmVydDogYFxuICBwcmVjaXNpb24gaGlnaHAgZmxvYXQ7XG4gIGF0dHJpYnV0ZSB2ZWMyIHA7XG4gIHZhcnlpbmcgdmVjMiBpZDtcbiAgdm9pZCBtYWluICgpIHtcbiAgICBpZCA9IDAuNSAqIChwICsgMS4wKTtcbiAgICBnbF9Qb3NpdGlvbiA9IHZlYzQocCwgMCwgMSk7XG4gIH1gLFxuXG4gIGZyYWc6IGBcbiAgcHJlY2lzaW9uIGhpZ2hwIGZsb2F0O1xuICB1bmlmb3JtIHNhbXBsZXIyRCB2ZXJ0ZXhTdGF0ZSwgZmllbGQ7XG4gIHVuaWZvcm0gZmxvYXQgdGVtcGVyYXR1cmUsIHQ7XG4gIHZhcnlpbmcgdmVjMiBpZDtcblxuICBmbG9hdCBybmQgKHZlYzIgY28pIHtcbiAgXHRyZXR1cm4gZnJhY3Qoc2luKHQqMC4xK2RvdChjby54eSwgdmVjMigxMi45ODk4LDc4LjIzMykpKSAqIDQzNzU4LjU0NTMpO1xuICB9XG5cbiAgdm9pZCBtYWluICgpIHtcbiAgICB2ZWM0IHN0YXRlID0gdGV4dHVyZTJEKHZlcnRleFN0YXRlLCBpZCk7XG4gICAgdmVjMiBwID0gc3RhdGUucmc7XG4gICAgdmVjMiB2ID0gc3RhdGUuYmE7XG4gICAgdmVjMiBmb3JjZSA9IHRleHR1cmUyRChmaWVsZCwgcCkueHk7XG4gICAgcCArPSAke0RUfSAqIHY7XG4gICAgdiA9IGZsb2F0KCR7REFNUElOR30pICogKHYgLSBmbG9hdCgke0ZJRUxEX1NUUkVOR1RIfSkgKiBmb3JjZSk7XG4gICAgdmVjMiBqaXR0ZXIgPSB2ZWMyKHJuZChpZCksIHJuZChpZCArIDEwMDAuMCkpIC0gMC41O1xuICAgIGdsX0ZyYWdDb2xvciA9IHZlYzQocCArIHRlbXBlcmF0dXJlICogaml0dGVyLCB2KTtcbiAgfWAsXG4gIGF0dHJpYnV0ZXM6IHtcbiAgICBwOiBbLTQsIDAsIDQsIC00LCA0LCA0XVxuICB9LFxuICB1bmlmb3Jtczoge1xuICAgIHZlcnRleFN0YXRlOiByZWdsLnByb3AoJ3NyYycpLFxuICAgIGZpZWxkOiByZWdsLnByb3AoJ2ZpZWxkJyksXG4gICAgdGVtcGVyYXR1cmU6ICh7dGlja30pID0+IDEuMCAvICgwLjUgKiB0aWNrICsgMjAuMCksXG4gICAgdDogcmVnbC5jb250ZXh0KCd0aWNrJylcbiAgfSxcbiAgY291bnQ6IDNcbn0pXG5cbmNvbnN0IHJlbmRlclBvaW50cyA9IHJlZ2woe1xuICB2ZXJ0OiBgXG4gIHByZWNpc2lvbiBoaWdocCBmbG9hdDtcbiAgYXR0cmlidXRlIHZlYzIgaWQ7XG4gIHVuaWZvcm0gc2FtcGxlcjJEIHZlcnRleFN0YXRlO1xuICB2b2lkIG1haW4gKCkge1xuICAgIHZlYzQgc3RhdGUgPSB0ZXh0dXJlMkQodmVydGV4U3RhdGUsIGlkKTtcbiAgICBnbF9Qb2ludFNpemUgPSAyLjA7XG4gICAgZ2xfUG9zaXRpb24gPSB2ZWM0KDIuMCAqIGZyYWN0KHN0YXRlLnh5KSAtIDEuMCwgMCwgMSk7XG4gIH1gLFxuXG4gIGZyYWc6IGBcbiAgcHJlY2lzaW9uIGhpZ2hwIGZsb2F0O1xuICB2b2lkIG1haW4gKCkge1xuICAgIGdsX0ZyYWdDb2xvciA9IHZlYzQoMCwgMCwgMCwgMSk7XG4gIH1gLFxuXG4gIGF0dHJpYnV0ZXM6IHtcbiAgICBpZDogVkVSVEVYX0lEX0JVRkZFUlxuICB9LFxuICB1bmlmb3Jtczoge1xuICAgIHZlcnRleFN0YXRlOiAoe3RpY2t9KSA9PiBWRVJURVhfU1RBVEVbdGljayAlIDJdXG4gIH0sXG4gIGRlcHRoOiB7ZW5hYmxlOiBmYWxzZSwgbWFzazogZmFsc2V9LFxuICBwcmltaXRpdmU6ICdwb2ludHMnLFxuICBjb3VudDogVkVSVEVYX0NPVU5ULFxuICBlbGVtZW50czogbnVsbFxufSlcblxudmFyIGxpbmVXaWR0aCA9IDJcbmlmIChsaW5lV2lkdGggPiByZWdsLmxpbWl0cy5saW5lV2lkdGhEaW1zWzFdKSB7XG4gIGxpbmVXaWR0aCA9IHJlZ2wubGltaXRzLmxpbmVXaWR0aERpbXNbMV1cbn1cblxuY29uc3QgcmVuZGVyRWRnZXMgPSByZWdsKHtcbiAgdmVydDogYFxuICBwcmVjaXNpb24gaGlnaHAgZmxvYXQ7XG4gIGF0dHJpYnV0ZSB2ZWM0IGlkO1xuICBhdHRyaWJ1dGUgZmxvYXQgYXJjRGlyO1xuICB1bmlmb3JtIGZsb2F0IGRpcjtcbiAgdW5pZm9ybSBzYW1wbGVyMkQgdmVydGV4U3RhdGU7XG4gIHZvaWQgbWFpbiAoKSB7XG4gICAgZmxvYXQgc2lkZSA9IGFyY0RpciArIGRpciAtIDIuMCAqIGRpciAqIGFyY0RpcjtcbiAgICB2ZWMyIHMwID0gdGV4dHVyZTJEKHZlcnRleFN0YXRlLCBpZC5yZykueHk7XG4gICAgdmVjMiBzMSA9IHRleHR1cmUyRCh2ZXJ0ZXhTdGF0ZSwgaWQuYmEpLnh5O1xuICAgIHZlYzIgc2hpZnQgPSBtaXgoZnJhY3QoczApIC0gczAsIGZyYWN0KHMxKSAtIHMxLCBzaWRlKTtcbiAgICBnbF9Qb3NpdGlvbiA9IHZlYzQoMi4wICogKHMwLnh5ICsgc2hpZnQpIC0gMS4wLCAwLCAxKTtcbiAgfWAsXG5cbiAgZnJhZzogYFxuICB2b2lkIG1haW4gKCkge1xuICAgIGdsX0ZyYWdDb2xvciA9IHZlYzQoMC4xLCAwLCAxLCAxKTtcbiAgfWAsXG5cbiAgYXR0cmlidXRlczoge1xuICAgIGlkOiBBUkNTLm1hcCgoYXJjKSA9PiB7XG4gICAgICBjb25zdCBzID0gdmVydGV4SW5kZXgoYXJjWzBdKVxuICAgICAgY29uc3QgdCA9IHZlcnRleEluZGV4KGFyY1sxXSlcbiAgICAgIHJldHVybiBbXG4gICAgICAgIHNbMF0gLyBWRVJURVhfVEVYVFVSRV9TSVpFLFxuICAgICAgICBzWzFdIC8gVkVSVEVYX1RFWFRVUkVfU0laRSxcbiAgICAgICAgdFswXSAvIFZFUlRFWF9URVhUVVJFX1NJWkUsXG4gICAgICAgIHRbMV0gLyBWRVJURVhfVEVYVFVSRV9TSVpFXG4gICAgICBdXG4gICAgfSksXG4gICAgYXJjRGlyOiBBUkNTLm1hcCgoYXJjLCBpKSA9PiBpICUgMilcbiAgfSxcbiAgdW5pZm9ybXM6IHtcbiAgICB2ZXJ0ZXhTdGF0ZTogKHt0aWNrfSkgPT4gVkVSVEVYX1NUQVRFW3RpY2sgJSAyXSxcbiAgICBkaXI6IHJlZ2wucHJvcCgnZGlyJylcbiAgfSxcbiAgZGVwdGg6IHtlbmFibGU6IGZhbHNlLCBtYXNrOiBmYWxzZX0sXG4gIGNvdW50OiBBUkNTLmxlbmd0aCxcbiAgcHJpbWl0aXZlOiAnbGluZXMnLFxuICBsaW5lV2lkdGg6IGxpbmVXaWR0aFxufSlcblxuY29uc3Qgc3BsYXRNb3VzZSA9IHJlZ2woe1xuICB2ZXJ0OiBgXG4gIHVuaWZvcm0gdmVjMiBtb3VzZTtcbiAgYXR0cmlidXRlIGZsb2F0IHA7XG4gIHZvaWQgbWFpbiAoKSB7XG4gICAgZ2xfUG9pbnRTaXplID0gJHtNT1VTRV9TSVpFfS4wO1xuICAgIGdsX1Bvc2l0aW9uID0gdmVjNChtb3VzZSwgcCwgMSk7XG4gIH1gLFxuICBmcmFnOiBgXG4gIHByZWNpc2lvbiBoaWdocCBmbG9hdDtcbiAgdW5pZm9ybSBmbG9hdCBzdHJlbmd0aDtcbiAgdm9pZCBtYWluICgpIHtcbiAgICBmbG9hdCBzID0gc3RyZW5ndGggKiBleHAoLTE2LjAgKiBkb3QoZ2xfUG9pbnRDb29yZC54eSwgZ2xfUG9pbnRDb29yZC54eSkpO1xuICAgIGdsX0ZyYWdDb2xvciA9IHZlYzQocywgMCwgMCwgMSk7XG4gIH1gLFxuICBhdHRyaWJ1dGVzOiB7IHA6IFswXSB9LFxuICB1bmlmb3Jtczoge1xuICAgIG1vdXNlOiAoe2RyYXdpbmdCdWZmZXJXaWR0aCwgZHJhd2luZ0J1ZmZlckhlaWdodCwgcGl4ZWxSYXRpb30pID0+IFtcbiAgICAgIDIuMCAqIHBpeGVsUmF0aW8gKiBtb3VzZS54IC8gZHJhd2luZ0J1ZmZlcldpZHRoIC0gMS4wLFxuICAgICAgMS4wIC0gMi4wICogcGl4ZWxSYXRpbyAqIG1vdXNlLnkgLyBkcmF3aW5nQnVmZmVySGVpZ2h0XG4gICAgXSxcbiAgICBzdHJlbmd0aDogKCkgPT4gbW91c2UuYnV0dG9ucyA/IDUuMCA6IDEuMFxuICB9LFxuICBjb3VudDogMSxcbiAgcHJpbWl0aXZlOiAncG9pbnRzJ1xufSlcblxuLy8gTWFpbiBpbnRlZ3JhdGlvbiBsb29wXG5mdW5jdGlvbiBzdGVwICh7dGlja30pIHtcbiAgc2V0RkJPKHsgZnJhbWVidWZmZXI6IEZJRUxEU1swXSB9LCAoKSA9PiB7XG4gICAgcmVnbC5jbGVhcih7IGNvbG9yOiBbMCwgMCwgMCwgMV0gfSlcbiAgICBzcGxhdE1vdXNlKClcbiAgICBzcGxhdFZlcnRzKHtcbiAgICAgIHZlcnRleFN0YXRlOiBWRVJURVhfU1RBVEVbKHRpY2sgKyAxKSAlIDJdXG4gICAgfSlcbiAgfSlcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCAyICogQkxVUl9QQVNTRVM7ICsraSkge1xuICAgIGJsdXJQYXNzKHtcbiAgICAgIGRlc3Q6IEZJRUxEU1soaSArIDEpICUgMl0sXG4gICAgICBzcmM6IEZJRUxEU1tpICUgMl0sXG4gICAgICBheGlzOiAoaSAlIDIpXG4gICAgfSlcbiAgfVxuICBncmFkUGFzcyh7XG4gICAgZGVzdDogRklFTERTWzFdLFxuICAgIHNyYzogRklFTERTWzBdXG4gIH0pXG4gIGFwcGx5U3ByaW5nRm9yY2VzKHtcbiAgICBkZXN0OiBWRVJURVhfU1RBVEVbKHRpY2sgKyAxKSAlIDJdLFxuICAgIHNyYzogVkVSVEVYX1NUQVRFW3RpY2sgJSAyXVxuICB9KVxuICBpbnRlZ3JhdGVWZXJ0cyh7XG4gICAgZGVzdDogVkVSVEVYX1NUQVRFW3RpY2sgJSAyXSxcbiAgICBzcmM6IFZFUlRFWF9TVEFURVsodGljayArIDEpICUgMl0sXG4gICAgZmllbGQ6IEZJRUxEU1sxXVxuICB9KVxufVxuXG5yZWdsLmZyYW1lKChjb250ZXh0KSA9PiB7XG4gIHN0ZXAoY29udGV4dClcbiAgcmVnbC5jbGVhcih7XG4gICAgY29sb3I6IFsxLCAxLCAxLCAxXVxuICB9KVxuICByZW5kZXJFZGdlcyhbe2RpcjogMH0sIHtkaXI6IDF9XSlcbiAgcmVuZGVyUG9pbnRzKClcbn0pXG4iLCJ2YXIgR0xfRkxPQVQgPSA1MTI2XG5cbmZ1bmN0aW9uIEF0dHJpYnV0ZVJlY29yZCAoKSB7XG4gIHRoaXMuc3RhdGUgPSAwXG5cbiAgdGhpcy54ID0gMC4wXG4gIHRoaXMueSA9IDAuMFxuICB0aGlzLnogPSAwLjBcbiAgdGhpcy53ID0gMC4wXG5cbiAgdGhpcy5idWZmZXIgPSBudWxsXG4gIHRoaXMuc2l6ZSA9IDBcbiAgdGhpcy5ub3JtYWxpemVkID0gZmFsc2VcbiAgdGhpcy50eXBlID0gR0xfRkxPQVRcbiAgdGhpcy5vZmZzZXQgPSAwXG4gIHRoaXMuc3RyaWRlID0gMFxuICB0aGlzLmRpdmlzb3IgPSAwXG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcEF0dHJpYnV0ZVN0YXRlIChcbiAgZ2wsXG4gIGV4dGVuc2lvbnMsXG4gIGxpbWl0cyxcbiAgYnVmZmVyU3RhdGUsXG4gIHN0cmluZ1N0b3JlKSB7XG4gIHZhciBOVU1fQVRUUklCVVRFUyA9IGxpbWl0cy5tYXhBdHRyaWJ1dGVzXG4gIHZhciBhdHRyaWJ1dGVCaW5kaW5ncyA9IG5ldyBBcnJheShOVU1fQVRUUklCVVRFUylcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBOVU1fQVRUUklCVVRFUzsgKytpKSB7XG4gICAgYXR0cmlidXRlQmluZGluZ3NbaV0gPSBuZXcgQXR0cmlidXRlUmVjb3JkKClcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgUmVjb3JkOiBBdHRyaWJ1dGVSZWNvcmQsXG4gICAgc2NvcGU6IHt9LFxuICAgIHN0YXRlOiBhdHRyaWJ1dGVCaW5kaW5nc1xuICB9XG59XG4iLCJcbnZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL3V0aWwvaXMtdHlwZWQtYXJyYXknKVxudmFyIGlzTkRBcnJheUxpa2UgPSByZXF1aXJlKCcuL3V0aWwvaXMtbmRhcnJheScpXG52YXIgdmFsdWVzID0gcmVxdWlyZSgnLi91dGlsL3ZhbHVlcycpXG52YXIgcG9vbCA9IHJlcXVpcmUoJy4vdXRpbC9wb29sJylcbnZhciBmbGF0dGVuVXRpbCA9IHJlcXVpcmUoJy4vdXRpbC9mbGF0dGVuJylcblxudmFyIGFycmF5RmxhdHRlbiA9IGZsYXR0ZW5VdGlsLmZsYXR0ZW5cbnZhciBhcnJheVNoYXBlID0gZmxhdHRlblV0aWwuc2hhcGVcblxudmFyIGFycmF5VHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9hcnJheXR5cGVzLmpzb24nKVxudmFyIGJ1ZmZlclR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvZHR5cGVzLmpzb24nKVxudmFyIHVzYWdlVHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy91c2FnZS5qc29uJylcblxudmFyIEdMX1NUQVRJQ19EUkFXID0gMHg4OEU0XG52YXIgR0xfU1RSRUFNX0RSQVcgPSAweDg4RTBcblxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSA1MTIxXG52YXIgR0xfRkxPQVQgPSA1MTI2XG5cbnZhciBEVFlQRVNfU0laRVMgPSBbXVxuRFRZUEVTX1NJWkVTWzUxMjBdID0gMSAvLyBpbnQ4XG5EVFlQRVNfU0laRVNbNTEyMl0gPSAyIC8vIGludDE2XG5EVFlQRVNfU0laRVNbNTEyNF0gPSA0IC8vIGludDMyXG5EVFlQRVNfU0laRVNbNTEyMV0gPSAxIC8vIHVpbnQ4XG5EVFlQRVNfU0laRVNbNTEyM10gPSAyIC8vIHVpbnQxNlxuRFRZUEVTX1NJWkVTWzUxMjVdID0gNCAvLyB1aW50MzJcbkRUWVBFU19TSVpFU1s1MTI2XSA9IDQgLy8gZmxvYXQzMlxuXG5mdW5jdGlvbiB0eXBlZEFycmF5Q29kZSAoZGF0YSkge1xuICByZXR1cm4gYXJyYXlUeXBlc1tPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoZGF0YSldIHwgMFxufVxuXG5mdW5jdGlvbiBjb3B5QXJyYXkgKG91dCwgaW5wKSB7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgaW5wLmxlbmd0aDsgKytpKSB7XG4gICAgb3V0W2ldID0gaW5wW2ldXG4gIH1cbn1cblxuZnVuY3Rpb24gdHJhbnNwb3NlIChcbiAgcmVzdWx0LCBkYXRhLCBzaGFwZVgsIHNoYXBlWSwgc3RyaWRlWCwgc3RyaWRlWSwgb2Zmc2V0KSB7XG4gIHZhciBwdHIgPSAwXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc2hhcGVYOyArK2kpIHtcbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IHNoYXBlWTsgKytqKSB7XG4gICAgICByZXN1bHRbcHRyKytdID0gZGF0YVtzdHJpZGVYICogaSArIHN0cmlkZVkgKiBqICsgb2Zmc2V0XVxuICAgIH1cbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBCdWZmZXJTdGF0ZSAoZ2wsIHN0YXRzLCBjb25maWcpIHtcbiAgdmFyIGJ1ZmZlckNvdW50ID0gMFxuICB2YXIgYnVmZmVyU2V0ID0ge31cblxuICBmdW5jdGlvbiBSRUdMQnVmZmVyICh0eXBlKSB7XG4gICAgdGhpcy5pZCA9IGJ1ZmZlckNvdW50KytcbiAgICB0aGlzLmJ1ZmZlciA9IGdsLmNyZWF0ZUJ1ZmZlcigpXG4gICAgdGhpcy50eXBlID0gdHlwZVxuICAgIHRoaXMudXNhZ2UgPSBHTF9TVEFUSUNfRFJBV1xuICAgIHRoaXMuYnl0ZUxlbmd0aCA9IDBcbiAgICB0aGlzLmRpbWVuc2lvbiA9IDFcbiAgICB0aGlzLmR0eXBlID0gR0xfVU5TSUdORURfQllURVxuXG4gICAgdGhpcy5wZXJzaXN0ZW50RGF0YSA9IG51bGxcblxuICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgdGhpcy5zdGF0cyA9IHtzaXplOiAwfVxuICAgIH1cbiAgfVxuXG4gIFJFR0xCdWZmZXIucHJvdG90eXBlLmJpbmQgPSBmdW5jdGlvbiAoKSB7XG4gICAgZ2wuYmluZEJ1ZmZlcih0aGlzLnR5cGUsIHRoaXMuYnVmZmVyKVxuICB9XG5cbiAgUkVHTEJ1ZmZlci5wcm90b3R5cGUuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgICBkZXN0cm95KHRoaXMpXG4gIH1cblxuICB2YXIgc3RyZWFtUG9vbCA9IFtdXG5cbiAgZnVuY3Rpb24gY3JlYXRlU3RyZWFtICh0eXBlLCBkYXRhKSB7XG4gICAgdmFyIGJ1ZmZlciA9IHN0cmVhbVBvb2wucG9wKClcbiAgICBpZiAoIWJ1ZmZlcikge1xuICAgICAgYnVmZmVyID0gbmV3IFJFR0xCdWZmZXIodHlwZSlcbiAgICB9XG4gICAgYnVmZmVyLmJpbmQoKVxuICAgIGluaXRCdWZmZXJGcm9tRGF0YShidWZmZXIsIGRhdGEsIEdMX1NUUkVBTV9EUkFXLCAwLCAxLCBmYWxzZSlcbiAgICByZXR1cm4gYnVmZmVyXG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95U3RyZWFtIChzdHJlYW0pIHtcbiAgICBzdHJlYW1Qb29sLnB1c2goc3RyZWFtKVxuICB9XG5cbiAgZnVuY3Rpb24gaW5pdEJ1ZmZlckZyb21UeXBlZEFycmF5IChidWZmZXIsIGRhdGEsIHVzYWdlKSB7XG4gICAgYnVmZmVyLmJ5dGVMZW5ndGggPSBkYXRhLmJ5dGVMZW5ndGhcbiAgICBnbC5idWZmZXJEYXRhKGJ1ZmZlci50eXBlLCBkYXRhLCB1c2FnZSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGluaXRCdWZmZXJGcm9tRGF0YSAoYnVmZmVyLCBkYXRhLCB1c2FnZSwgZHR5cGUsIGRpbWVuc2lvbiwgcGVyc2lzdCkge1xuICAgIHZhciBzaGFwZVxuICAgIGJ1ZmZlci51c2FnZSA9IHVzYWdlXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YSkpIHtcbiAgICAgIGJ1ZmZlci5kdHlwZSA9IGR0eXBlIHx8IEdMX0ZMT0FUXG4gICAgICBpZiAoZGF0YS5sZW5ndGggPiAwKSB7XG4gICAgICAgIHZhciBmbGF0RGF0YVxuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShkYXRhWzBdKSkge1xuICAgICAgICAgIHNoYXBlID0gYXJyYXlTaGFwZShkYXRhKVxuICAgICAgICAgIHZhciBkaW0gPSAxXG4gICAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCBzaGFwZS5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgZGltICo9IHNoYXBlW2ldXG4gICAgICAgICAgfVxuICAgICAgICAgIGJ1ZmZlci5kaW1lbnNpb24gPSBkaW1cbiAgICAgICAgICBmbGF0RGF0YSA9IGFycmF5RmxhdHRlbihkYXRhLCBzaGFwZSwgYnVmZmVyLmR0eXBlKVxuICAgICAgICAgIGluaXRCdWZmZXJGcm9tVHlwZWRBcnJheShidWZmZXIsIGZsYXREYXRhLCB1c2FnZSlcbiAgICAgICAgICBpZiAocGVyc2lzdCkge1xuICAgICAgICAgICAgYnVmZmVyLnBlcnNpc3RlbnREYXRhID0gZmxhdERhdGFcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcG9vbC5mcmVlVHlwZShmbGF0RGF0YSlcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGRhdGFbMF0gPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgYnVmZmVyLmRpbWVuc2lvbiA9IGRpbWVuc2lvblxuICAgICAgICAgIHZhciB0eXBlZERhdGEgPSBwb29sLmFsbG9jVHlwZShidWZmZXIuZHR5cGUsIGRhdGEubGVuZ3RoKVxuICAgICAgICAgIGNvcHlBcnJheSh0eXBlZERhdGEsIGRhdGEpXG4gICAgICAgICAgaW5pdEJ1ZmZlckZyb21UeXBlZEFycmF5KGJ1ZmZlciwgdHlwZWREYXRhLCB1c2FnZSlcbiAgICAgICAgICBpZiAocGVyc2lzdCkge1xuICAgICAgICAgICAgYnVmZmVyLnBlcnNpc3RlbnREYXRhID0gdHlwZWREYXRhXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBvb2wuZnJlZVR5cGUodHlwZWREYXRhKVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChpc1R5cGVkQXJyYXkoZGF0YVswXSkpIHtcbiAgICAgICAgICBidWZmZXIuZGltZW5zaW9uID0gZGF0YVswXS5sZW5ndGhcbiAgICAgICAgICBidWZmZXIuZHR5cGUgPSBkdHlwZSB8fCB0eXBlZEFycmF5Q29kZShkYXRhWzBdKSB8fCBHTF9GTE9BVFxuICAgICAgICAgIGZsYXREYXRhID0gYXJyYXlGbGF0dGVuKFxuICAgICAgICAgICAgZGF0YSxcbiAgICAgICAgICAgIFtkYXRhLmxlbmd0aCwgZGF0YVswXS5sZW5ndGhdLFxuICAgICAgICAgICAgYnVmZmVyLmR0eXBlKVxuICAgICAgICAgIGluaXRCdWZmZXJGcm9tVHlwZWRBcnJheShidWZmZXIsIGZsYXREYXRhLCB1c2FnZSlcbiAgICAgICAgICBpZiAocGVyc2lzdCkge1xuICAgICAgICAgICAgYnVmZmVyLnBlcnNpc3RlbnREYXRhID0gZmxhdERhdGFcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcG9vbC5mcmVlVHlwZShmbGF0RGF0YSlcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGlzVHlwZWRBcnJheShkYXRhKSkge1xuICAgICAgYnVmZmVyLmR0eXBlID0gZHR5cGUgfHwgdHlwZWRBcnJheUNvZGUoZGF0YSlcbiAgICAgIGJ1ZmZlci5kaW1lbnNpb24gPSBkaW1lbnNpb25cbiAgICAgIGluaXRCdWZmZXJGcm9tVHlwZWRBcnJheShidWZmZXIsIGRhdGEsIHVzYWdlKVxuICAgICAgaWYgKHBlcnNpc3QpIHtcbiAgICAgICAgYnVmZmVyLnBlcnNpc3RlbnREYXRhID0gbmV3IFVpbnQ4QXJyYXkobmV3IFVpbnQ4QXJyYXkoZGF0YS5idWZmZXIpKVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoaXNOREFycmF5TGlrZShkYXRhKSkge1xuICAgICAgc2hhcGUgPSBkYXRhLnNoYXBlXG4gICAgICB2YXIgc3RyaWRlID0gZGF0YS5zdHJpZGVcbiAgICAgIHZhciBvZmZzZXQgPSBkYXRhLm9mZnNldFxuXG4gICAgICB2YXIgc2hhcGVYID0gMFxuICAgICAgdmFyIHNoYXBlWSA9IDBcbiAgICAgIHZhciBzdHJpZGVYID0gMFxuICAgICAgdmFyIHN0cmlkZVkgPSAwXG4gICAgICBpZiAoc2hhcGUubGVuZ3RoID09PSAxKSB7XG4gICAgICAgIHNoYXBlWCA9IHNoYXBlWzBdXG4gICAgICAgIHNoYXBlWSA9IDFcbiAgICAgICAgc3RyaWRlWCA9IHN0cmlkZVswXVxuICAgICAgICBzdHJpZGVZID0gMFxuICAgICAgfSBlbHNlIGlmIChzaGFwZS5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgc2hhcGVYID0gc2hhcGVbMF1cbiAgICAgICAgc2hhcGVZID0gc2hhcGVbMV1cbiAgICAgICAgc3RyaWRlWCA9IHN0cmlkZVswXVxuICAgICAgICBzdHJpZGVZID0gc3RyaWRlWzFdXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBcbiAgICAgIH1cblxuICAgICAgYnVmZmVyLmR0eXBlID0gZHR5cGUgfHwgdHlwZWRBcnJheUNvZGUoZGF0YS5kYXRhKSB8fCBHTF9GTE9BVFxuICAgICAgYnVmZmVyLmRpbWVuc2lvbiA9IHNoYXBlWVxuXG4gICAgICB2YXIgdHJhbnNwb3NlRGF0YSA9IHBvb2wuYWxsb2NUeXBlKGJ1ZmZlci5kdHlwZSwgc2hhcGVYICogc2hhcGVZKVxuICAgICAgdHJhbnNwb3NlKHRyYW5zcG9zZURhdGEsXG4gICAgICAgIGRhdGEuZGF0YSxcbiAgICAgICAgc2hhcGVYLCBzaGFwZVksXG4gICAgICAgIHN0cmlkZVgsIHN0cmlkZVksXG4gICAgICAgIG9mZnNldClcbiAgICAgIGluaXRCdWZmZXJGcm9tVHlwZWRBcnJheShidWZmZXIsIHRyYW5zcG9zZURhdGEsIHVzYWdlKVxuICAgICAgaWYgKHBlcnNpc3QpIHtcbiAgICAgICAgYnVmZmVyLnBlcnNpc3RlbnREYXRhID0gdHJhbnNwb3NlRGF0YVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcG9vbC5mcmVlVHlwZSh0cmFuc3Bvc2VEYXRhKVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95IChidWZmZXIpIHtcbiAgICBzdGF0cy5idWZmZXJDb3VudC0tXG5cbiAgICB2YXIgaGFuZGxlID0gYnVmZmVyLmJ1ZmZlclxuICAgIFxuICAgIGdsLmRlbGV0ZUJ1ZmZlcihoYW5kbGUpXG4gICAgYnVmZmVyLmJ1ZmZlciA9IG51bGxcbiAgICBkZWxldGUgYnVmZmVyU2V0W2J1ZmZlci5pZF1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZUJ1ZmZlciAob3B0aW9ucywgdHlwZSwgZGVmZXJJbml0LCBwZXJzaXN0ZW50KSB7XG4gICAgc3RhdHMuYnVmZmVyQ291bnQrK1xuXG4gICAgdmFyIGJ1ZmZlciA9IG5ldyBSRUdMQnVmZmVyKHR5cGUpXG4gICAgYnVmZmVyU2V0W2J1ZmZlci5pZF0gPSBidWZmZXJcblxuICAgIGZ1bmN0aW9uIHJlZ2xCdWZmZXIgKG9wdGlvbnMpIHtcbiAgICAgIHZhciB1c2FnZSA9IEdMX1NUQVRJQ19EUkFXXG4gICAgICB2YXIgZGF0YSA9IG51bGxcbiAgICAgIHZhciBieXRlTGVuZ3RoID0gMFxuICAgICAgdmFyIGR0eXBlID0gMFxuICAgICAgdmFyIGRpbWVuc2lvbiA9IDFcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KG9wdGlvbnMpIHx8XG4gICAgICAgICAgaXNUeXBlZEFycmF5KG9wdGlvbnMpIHx8XG4gICAgICAgICAgaXNOREFycmF5TGlrZShvcHRpb25zKSkge1xuICAgICAgICBkYXRhID0gb3B0aW9uc1xuICAgICAgfSBlbHNlIGlmICh0eXBlb2Ygb3B0aW9ucyA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgYnl0ZUxlbmd0aCA9IG9wdGlvbnMgfCAwXG4gICAgICB9IGVsc2UgaWYgKG9wdGlvbnMpIHtcbiAgICAgICAgXG5cbiAgICAgICAgaWYgKCdkYXRhJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgXG4gICAgICAgICAgZGF0YSA9IG9wdGlvbnMuZGF0YVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCd1c2FnZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgIFxuICAgICAgICAgIHVzYWdlID0gdXNhZ2VUeXBlc1tvcHRpb25zLnVzYWdlXVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCd0eXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgXG4gICAgICAgICAgZHR5cGUgPSBidWZmZXJUeXBlc1tvcHRpb25zLnR5cGVdXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ2RpbWVuc2lvbicgaW4gb3B0aW9ucykge1xuICAgICAgICAgIFxuICAgICAgICAgIGRpbWVuc2lvbiA9IG9wdGlvbnMuZGltZW5zaW9uIHwgMFxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdsZW5ndGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBcbiAgICAgICAgICBieXRlTGVuZ3RoID0gb3B0aW9ucy5sZW5ndGggfCAwXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgYnVmZmVyLmJpbmQoKVxuICAgICAgaWYgKCFkYXRhKSB7XG4gICAgICAgIGdsLmJ1ZmZlckRhdGEoYnVmZmVyLnR5cGUsIGJ5dGVMZW5ndGgsIHVzYWdlKVxuICAgICAgICBidWZmZXIuZHR5cGUgPSBkdHlwZSB8fCBHTF9VTlNJR05FRF9CWVRFXG4gICAgICAgIGJ1ZmZlci51c2FnZSA9IHVzYWdlXG4gICAgICAgIGJ1ZmZlci5kaW1lbnNpb24gPSBkaW1lbnNpb25cbiAgICAgICAgYnVmZmVyLmJ5dGVMZW5ndGggPSBieXRlTGVuZ3RoXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpbml0QnVmZmVyRnJvbURhdGEoYnVmZmVyLCBkYXRhLCB1c2FnZSwgZHR5cGUsIGRpbWVuc2lvbiwgcGVyc2lzdGVudClcbiAgICAgIH1cblxuICAgICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICAgIGJ1ZmZlci5zdGF0cy5zaXplID0gYnVmZmVyLmJ5dGVMZW5ndGggKiBEVFlQRVNfU0laRVNbYnVmZmVyLmR0eXBlXVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmVnbEJ1ZmZlclxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHNldFN1YkRhdGEgKGRhdGEsIG9mZnNldCkge1xuICAgICAgXG5cbiAgICAgIGdsLmJ1ZmZlclN1YkRhdGEoYnVmZmVyLnR5cGUsIG9mZnNldCwgZGF0YSlcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzdWJkYXRhIChkYXRhLCBvZmZzZXRfKSB7XG4gICAgICB2YXIgb2Zmc2V0ID0gKG9mZnNldF8gfHwgMCkgfCAwXG4gICAgICB2YXIgc2hhcGVcbiAgICAgIGJ1ZmZlci5iaW5kKClcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XG4gICAgICAgIGlmIChkYXRhLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBpZiAodHlwZW9mIGRhdGFbMF0gPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICB2YXIgY29udmVydGVkID0gcG9vbC5hbGxvY1R5cGUoYnVmZmVyLmR0eXBlLCBkYXRhLmxlbmd0aClcbiAgICAgICAgICAgIGNvcHlBcnJheShjb252ZXJ0ZWQsIGRhdGEpXG4gICAgICAgICAgICBzZXRTdWJEYXRhKGNvbnZlcnRlZCwgb2Zmc2V0KVxuICAgICAgICAgICAgcG9vbC5mcmVlVHlwZShjb252ZXJ0ZWQpXG4gICAgICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGRhdGFbMF0pIHx8IGlzVHlwZWRBcnJheShkYXRhWzBdKSkge1xuICAgICAgICAgICAgc2hhcGUgPSBhcnJheVNoYXBlKGRhdGEpXG4gICAgICAgICAgICB2YXIgZmxhdERhdGEgPSBhcnJheUZsYXR0ZW4oZGF0YSwgc2hhcGUsIGJ1ZmZlci5kdHlwZSlcbiAgICAgICAgICAgIHNldFN1YkRhdGEoZmxhdERhdGEsIG9mZnNldClcbiAgICAgICAgICAgIHBvb2wuZnJlZVR5cGUoZmxhdERhdGEpXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChpc1R5cGVkQXJyYXkoZGF0YSkpIHtcbiAgICAgICAgc2V0U3ViRGF0YShkYXRhLCBvZmZzZXQpXG4gICAgICB9IGVsc2UgaWYgKGlzTkRBcnJheUxpa2UoZGF0YSkpIHtcbiAgICAgICAgc2hhcGUgPSBkYXRhLnNoYXBlXG4gICAgICAgIHZhciBzdHJpZGUgPSBkYXRhLnN0cmlkZVxuXG4gICAgICAgIHZhciBzaGFwZVggPSAwXG4gICAgICAgIHZhciBzaGFwZVkgPSAwXG4gICAgICAgIHZhciBzdHJpZGVYID0gMFxuICAgICAgICB2YXIgc3RyaWRlWSA9IDBcbiAgICAgICAgaWYgKHNoYXBlLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgIHNoYXBlWCA9IHNoYXBlWzBdXG4gICAgICAgICAgc2hhcGVZID0gMVxuICAgICAgICAgIHN0cmlkZVggPSBzdHJpZGVbMF1cbiAgICAgICAgICBzdHJpZGVZID0gMFxuICAgICAgICB9IGVsc2UgaWYgKHNoYXBlLmxlbmd0aCA9PT0gMikge1xuICAgICAgICAgIHNoYXBlWCA9IHNoYXBlWzBdXG4gICAgICAgICAgc2hhcGVZID0gc2hhcGVbMV1cbiAgICAgICAgICBzdHJpZGVYID0gc3RyaWRlWzBdXG4gICAgICAgICAgc3RyaWRlWSA9IHN0cmlkZVsxXVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIFxuICAgICAgICB9XG4gICAgICAgIHZhciBkdHlwZSA9IEFycmF5LmlzQXJyYXkoZGF0YS5kYXRhKVxuICAgICAgICAgID8gYnVmZmVyLmR0eXBlXG4gICAgICAgICAgOiB0eXBlZEFycmF5Q29kZShkYXRhLmRhdGEpXG5cbiAgICAgICAgdmFyIHRyYW5zcG9zZURhdGEgPSBwb29sLmFsbG9jVHlwZShkdHlwZSwgc2hhcGVYICogc2hhcGVZKVxuICAgICAgICB0cmFuc3Bvc2UodHJhbnNwb3NlRGF0YSxcbiAgICAgICAgICBkYXRhLmRhdGEsXG4gICAgICAgICAgc2hhcGVYLCBzaGFwZVksXG4gICAgICAgICAgc3RyaWRlWCwgc3RyaWRlWSxcbiAgICAgICAgICBkYXRhLm9mZnNldClcbiAgICAgICAgc2V0U3ViRGF0YSh0cmFuc3Bvc2VEYXRhLCBvZmZzZXQpXG4gICAgICAgIHBvb2wuZnJlZVR5cGUodHJhbnNwb3NlRGF0YSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIFxuICAgICAgfVxuICAgICAgcmV0dXJuIHJlZ2xCdWZmZXJcbiAgICB9XG5cbiAgICBpZiAoIWRlZmVySW5pdCkge1xuICAgICAgcmVnbEJ1ZmZlcihvcHRpb25zKVxuICAgIH1cblxuICAgIHJlZ2xCdWZmZXIuX3JlZ2xUeXBlID0gJ2J1ZmZlcidcbiAgICByZWdsQnVmZmVyLl9idWZmZXIgPSBidWZmZXJcbiAgICByZWdsQnVmZmVyLnN1YmRhdGEgPSBzdWJkYXRhXG4gICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICByZWdsQnVmZmVyLnN0YXRzID0gYnVmZmVyLnN0YXRzXG4gICAgfVxuICAgIHJlZ2xCdWZmZXIuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHsgZGVzdHJveShidWZmZXIpIH1cblxuICAgIHJldHVybiByZWdsQnVmZmVyXG4gIH1cblxuICBmdW5jdGlvbiByZXN0b3JlQnVmZmVycyAoKSB7XG4gICAgdmFsdWVzKGJ1ZmZlclNldCkuZm9yRWFjaChmdW5jdGlvbiAoYnVmZmVyKSB7XG4gICAgICBidWZmZXIuYnVmZmVyID0gZ2wuY3JlYXRlQnVmZmVyKClcbiAgICAgIGdsLmJpbmRCdWZmZXIoYnVmZmVyLnR5cGUsIGJ1ZmZlci5idWZmZXIpXG4gICAgICBnbC5idWZmZXJEYXRhKFxuICAgICAgICBidWZmZXIudHlwZSwgYnVmZmVyLnBlcnNpc3RlbnREYXRhIHx8IGJ1ZmZlci5ieXRlTGVuZ3RoLCBidWZmZXIudXNhZ2UpXG4gICAgfSlcbiAgfVxuXG4gIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgIHN0YXRzLmdldFRvdGFsQnVmZmVyU2l6ZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciB0b3RhbCA9IDBcbiAgICAgIC8vIFRPRE86IFJpZ2h0IG5vdywgdGhlIHN0cmVhbXMgYXJlIG5vdCBwYXJ0IG9mIHRoZSB0b3RhbCBjb3VudC5cbiAgICAgIE9iamVjdC5rZXlzKGJ1ZmZlclNldCkuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgIHRvdGFsICs9IGJ1ZmZlclNldFtrZXldLnN0YXRzLnNpemVcbiAgICAgIH0pXG4gICAgICByZXR1cm4gdG90YWxcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNyZWF0ZTogY3JlYXRlQnVmZmVyLFxuXG4gICAgY3JlYXRlU3RyZWFtOiBjcmVhdGVTdHJlYW0sXG4gICAgZGVzdHJveVN0cmVhbTogZGVzdHJveVN0cmVhbSxcblxuICAgIGNsZWFyOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YWx1ZXMoYnVmZmVyU2V0KS5mb3JFYWNoKGRlc3Ryb3kpXG4gICAgICBzdHJlYW1Qb29sLmZvckVhY2goZGVzdHJveSlcbiAgICB9LFxuXG4gICAgZ2V0QnVmZmVyOiBmdW5jdGlvbiAod3JhcHBlcikge1xuICAgICAgaWYgKHdyYXBwZXIgJiYgd3JhcHBlci5fYnVmZmVyIGluc3RhbmNlb2YgUkVHTEJ1ZmZlcikge1xuICAgICAgICByZXR1cm4gd3JhcHBlci5fYnVmZmVyXG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH0sXG5cbiAgICByZXN0b3JlOiByZXN0b3JlQnVmZmVycyxcblxuICAgIF9pbml0QnVmZmVyOiBpbml0QnVmZmVyRnJvbURhdGFcbiAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICBcIltvYmplY3QgSW50OEFycmF5XVwiOiA1MTIwXG4sIFwiW29iamVjdCBJbnQxNkFycmF5XVwiOiA1MTIyXG4sIFwiW29iamVjdCBJbnQzMkFycmF5XVwiOiA1MTI0XG4sIFwiW29iamVjdCBVaW50OEFycmF5XVwiOiA1MTIxXG4sIFwiW29iamVjdCBVaW50OENsYW1wZWRBcnJheV1cIjogNTEyMVxuLCBcIltvYmplY3QgVWludDE2QXJyYXldXCI6IDUxMjNcbiwgXCJbb2JqZWN0IFVpbnQzMkFycmF5XVwiOiA1MTI1XG4sIFwiW29iamVjdCBGbG9hdDMyQXJyYXldXCI6IDUxMjZcbiwgXCJbb2JqZWN0IEZsb2F0NjRBcnJheV1cIjogNTEyMVxuLCBcIltvYmplY3QgQXJyYXlCdWZmZXJdXCI6IDUxMjFcbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgXCJpbnQ4XCI6IDUxMjBcbiwgXCJpbnQxNlwiOiA1MTIyXG4sIFwiaW50MzJcIjogNTEyNFxuLCBcInVpbnQ4XCI6IDUxMjFcbiwgXCJ1aW50MTZcIjogNTEyM1xuLCBcInVpbnQzMlwiOiA1MTI1XG4sIFwiZmxvYXRcIjogNTEyNlxuLCBcImZsb2F0MzJcIjogNTEyNlxufVxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICBcInBvaW50c1wiOiAwLFxuICBcInBvaW50XCI6IDAsXG4gIFwibGluZXNcIjogMSxcbiAgXCJsaW5lXCI6IDEsXG4gIFwibGluZSBsb29wXCI6IDIsXG4gIFwibGluZSBzdHJpcFwiOiAzLFxuICBcInRyaWFuZ2xlc1wiOiA0LFxuICBcInRyaWFuZ2xlXCI6IDQsXG4gIFwidHJpYW5nbGUgc3RyaXBcIjogNSxcbiAgXCJ0cmlhbmdsZSBmYW5cIjogNlxufVxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICBcInN0YXRpY1wiOiAzNTA0NCxcbiAgXCJkeW5hbWljXCI6IDM1MDQ4LFxuICBcInN0cmVhbVwiOiAzNTA0MFxufVxuIiwiXG52YXIgY3JlYXRlRW52aXJvbm1lbnQgPSByZXF1aXJlKCcuL3V0aWwvY29kZWdlbicpXG52YXIgbG9vcCA9IHJlcXVpcmUoJy4vdXRpbC9sb29wJylcbnZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL3V0aWwvaXMtdHlwZWQtYXJyYXknKVxudmFyIGlzTkRBcnJheSA9IHJlcXVpcmUoJy4vdXRpbC9pcy1uZGFycmF5JylcbnZhciBpc0FycmF5TGlrZSA9IHJlcXVpcmUoJy4vdXRpbC9pcy1hcnJheS1saWtlJylcbnZhciBkeW5hbWljID0gcmVxdWlyZSgnLi9keW5hbWljJylcblxudmFyIHByaW1UeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL3ByaW1pdGl2ZXMuanNvbicpXG52YXIgZ2xUeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL2R0eXBlcy5qc29uJylcblxuLy8gXCJjdXRlXCIgbmFtZXMgZm9yIHZlY3RvciBjb21wb25lbnRzXG52YXIgQ1VURV9DT01QT05FTlRTID0gJ3h5encnLnNwbGl0KCcnKVxuXG52YXIgR0xfVU5TSUdORURfQllURSA9IDUxMjFcblxudmFyIEFUVFJJQl9TVEFURV9QT0lOVEVSID0gMVxudmFyIEFUVFJJQl9TVEFURV9DT05TVEFOVCA9IDJcblxudmFyIERZTl9GVU5DID0gMFxudmFyIERZTl9QUk9QID0gMVxudmFyIERZTl9DT05URVhUID0gMlxudmFyIERZTl9TVEFURSA9IDNcbnZhciBEWU5fVEhVTksgPSA0XG5cbnZhciBTX0RJVEhFUiA9ICdkaXRoZXInXG52YXIgU19CTEVORF9FTkFCTEUgPSAnYmxlbmQuZW5hYmxlJ1xudmFyIFNfQkxFTkRfQ09MT1IgPSAnYmxlbmQuY29sb3InXG52YXIgU19CTEVORF9FUVVBVElPTiA9ICdibGVuZC5lcXVhdGlvbidcbnZhciBTX0JMRU5EX0ZVTkMgPSAnYmxlbmQuZnVuYydcbnZhciBTX0RFUFRIX0VOQUJMRSA9ICdkZXB0aC5lbmFibGUnXG52YXIgU19ERVBUSF9GVU5DID0gJ2RlcHRoLmZ1bmMnXG52YXIgU19ERVBUSF9SQU5HRSA9ICdkZXB0aC5yYW5nZSdcbnZhciBTX0RFUFRIX01BU0sgPSAnZGVwdGgubWFzaydcbnZhciBTX0NPTE9SX01BU0sgPSAnY29sb3JNYXNrJ1xudmFyIFNfQ1VMTF9FTkFCTEUgPSAnY3VsbC5lbmFibGUnXG52YXIgU19DVUxMX0ZBQ0UgPSAnY3VsbC5mYWNlJ1xudmFyIFNfRlJPTlRfRkFDRSA9ICdmcm9udEZhY2UnXG52YXIgU19MSU5FX1dJRFRIID0gJ2xpbmVXaWR0aCdcbnZhciBTX1BPTFlHT05fT0ZGU0VUX0VOQUJMRSA9ICdwb2x5Z29uT2Zmc2V0LmVuYWJsZSdcbnZhciBTX1BPTFlHT05fT0ZGU0VUX09GRlNFVCA9ICdwb2x5Z29uT2Zmc2V0Lm9mZnNldCdcbnZhciBTX1NBTVBMRV9BTFBIQSA9ICdzYW1wbGUuYWxwaGEnXG52YXIgU19TQU1QTEVfRU5BQkxFID0gJ3NhbXBsZS5lbmFibGUnXG52YXIgU19TQU1QTEVfQ09WRVJBR0UgPSAnc2FtcGxlLmNvdmVyYWdlJ1xudmFyIFNfU1RFTkNJTF9FTkFCTEUgPSAnc3RlbmNpbC5lbmFibGUnXG52YXIgU19TVEVOQ0lMX01BU0sgPSAnc3RlbmNpbC5tYXNrJ1xudmFyIFNfU1RFTkNJTF9GVU5DID0gJ3N0ZW5jaWwuZnVuYydcbnZhciBTX1NURU5DSUxfT1BGUk9OVCA9ICdzdGVuY2lsLm9wRnJvbnQnXG52YXIgU19TVEVOQ0lMX09QQkFDSyA9ICdzdGVuY2lsLm9wQmFjaydcbnZhciBTX1NDSVNTT1JfRU5BQkxFID0gJ3NjaXNzb3IuZW5hYmxlJ1xudmFyIFNfU0NJU1NPUl9CT1ggPSAnc2Npc3Nvci5ib3gnXG52YXIgU19WSUVXUE9SVCA9ICd2aWV3cG9ydCdcblxudmFyIFNfUFJPRklMRSA9ICdwcm9maWxlJ1xuXG52YXIgU19GUkFNRUJVRkZFUiA9ICdmcmFtZWJ1ZmZlcidcbnZhciBTX1ZFUlQgPSAndmVydCdcbnZhciBTX0ZSQUcgPSAnZnJhZydcbnZhciBTX0VMRU1FTlRTID0gJ2VsZW1lbnRzJ1xudmFyIFNfUFJJTUlUSVZFID0gJ3ByaW1pdGl2ZSdcbnZhciBTX0NPVU5UID0gJ2NvdW50J1xudmFyIFNfT0ZGU0VUID0gJ29mZnNldCdcbnZhciBTX0lOU1RBTkNFUyA9ICdpbnN0YW5jZXMnXG5cbnZhciBTVUZGSVhfV0lEVEggPSAnV2lkdGgnXG52YXIgU1VGRklYX0hFSUdIVCA9ICdIZWlnaHQnXG5cbnZhciBTX0ZSQU1FQlVGRkVSX1dJRFRIID0gU19GUkFNRUJVRkZFUiArIFNVRkZJWF9XSURUSFxudmFyIFNfRlJBTUVCVUZGRVJfSEVJR0hUID0gU19GUkFNRUJVRkZFUiArIFNVRkZJWF9IRUlHSFRcbnZhciBTX1ZJRVdQT1JUX1dJRFRIID0gU19WSUVXUE9SVCArIFNVRkZJWF9XSURUSFxudmFyIFNfVklFV1BPUlRfSEVJR0hUID0gU19WSUVXUE9SVCArIFNVRkZJWF9IRUlHSFRcbnZhciBTX0RSQVdJTkdCVUZGRVIgPSAnZHJhd2luZ0J1ZmZlcidcbnZhciBTX0RSQVdJTkdCVUZGRVJfV0lEVEggPSBTX0RSQVdJTkdCVUZGRVIgKyBTVUZGSVhfV0lEVEhcbnZhciBTX0RSQVdJTkdCVUZGRVJfSEVJR0hUID0gU19EUkFXSU5HQlVGRkVSICsgU1VGRklYX0hFSUdIVFxuXG52YXIgTkVTVEVEX09QVElPTlMgPSBbXG4gIFNfQkxFTkRfRlVOQyxcbiAgU19CTEVORF9FUVVBVElPTixcbiAgU19TVEVOQ0lMX0ZVTkMsXG4gIFNfU1RFTkNJTF9PUEZST05ULFxuICBTX1NURU5DSUxfT1BCQUNLLFxuICBTX1NBTVBMRV9DT1ZFUkFHRSxcbiAgU19WSUVXUE9SVCxcbiAgU19TQ0lTU09SX0JPWCxcbiAgU19QT0xZR09OX09GRlNFVF9PRkZTRVRcbl1cblxudmFyIEdMX0FSUkFZX0JVRkZFUiA9IDM0OTYyXG52YXIgR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIgPSAzNDk2M1xuXG52YXIgR0xfRlJBR01FTlRfU0hBREVSID0gMzU2MzJcbnZhciBHTF9WRVJURVhfU0hBREVSID0gMzU2MzNcblxudmFyIEdMX1RFWFRVUkVfMkQgPSAweDBERTFcbnZhciBHTF9URVhUVVJFX0NVQkVfTUFQID0gMHg4NTEzXG5cbnZhciBHTF9DVUxMX0ZBQ0UgPSAweDBCNDRcbnZhciBHTF9CTEVORCA9IDB4MEJFMlxudmFyIEdMX0RJVEhFUiA9IDB4MEJEMFxudmFyIEdMX1NURU5DSUxfVEVTVCA9IDB4MEI5MFxudmFyIEdMX0RFUFRIX1RFU1QgPSAweDBCNzFcbnZhciBHTF9TQ0lTU09SX1RFU1QgPSAweDBDMTFcbnZhciBHTF9QT0xZR09OX09GRlNFVF9GSUxMID0gMHg4MDM3XG52YXIgR0xfU0FNUExFX0FMUEhBX1RPX0NPVkVSQUdFID0gMHg4MDlFXG52YXIgR0xfU0FNUExFX0NPVkVSQUdFID0gMHg4MEEwXG5cbnZhciBHTF9GTE9BVCA9IDUxMjZcbnZhciBHTF9GTE9BVF9WRUMyID0gMzU2NjRcbnZhciBHTF9GTE9BVF9WRUMzID0gMzU2NjVcbnZhciBHTF9GTE9BVF9WRUM0ID0gMzU2NjZcbnZhciBHTF9JTlQgPSA1MTI0XG52YXIgR0xfSU5UX1ZFQzIgPSAzNTY2N1xudmFyIEdMX0lOVF9WRUMzID0gMzU2NjhcbnZhciBHTF9JTlRfVkVDNCA9IDM1NjY5XG52YXIgR0xfQk9PTCA9IDM1NjcwXG52YXIgR0xfQk9PTF9WRUMyID0gMzU2NzFcbnZhciBHTF9CT09MX1ZFQzMgPSAzNTY3MlxudmFyIEdMX0JPT0xfVkVDNCA9IDM1NjczXG52YXIgR0xfRkxPQVRfTUFUMiA9IDM1Njc0XG52YXIgR0xfRkxPQVRfTUFUMyA9IDM1Njc1XG52YXIgR0xfRkxPQVRfTUFUNCA9IDM1Njc2XG52YXIgR0xfU0FNUExFUl8yRCA9IDM1Njc4XG52YXIgR0xfU0FNUExFUl9DVUJFID0gMzU2ODBcblxudmFyIEdMX1RSSUFOR0xFUyA9IDRcblxudmFyIEdMX0ZST05UID0gMTAyOFxudmFyIEdMX0JBQ0sgPSAxMDI5XG52YXIgR0xfQ1cgPSAweDA5MDBcbnZhciBHTF9DQ1cgPSAweDA5MDFcbnZhciBHTF9NSU5fRVhUID0gMHg4MDA3XG52YXIgR0xfTUFYX0VYVCA9IDB4ODAwOFxudmFyIEdMX0FMV0FZUyA9IDUxOVxudmFyIEdMX0tFRVAgPSA3NjgwXG52YXIgR0xfWkVSTyA9IDBcbnZhciBHTF9PTkUgPSAxXG52YXIgR0xfRlVOQ19BREQgPSAweDgwMDZcbnZhciBHTF9MRVNTID0gNTEzXG5cbnZhciBHTF9GUkFNRUJVRkZFUiA9IDB4OEQ0MFxudmFyIEdMX0NPTE9SX0FUVEFDSE1FTlQwID0gMHg4Q0UwXG5cbnZhciBibGVuZEZ1bmNzID0ge1xuICAnMCc6IDAsXG4gICcxJzogMSxcbiAgJ3plcm8nOiAwLFxuICAnb25lJzogMSxcbiAgJ3NyYyBjb2xvcic6IDc2OCxcbiAgJ29uZSBtaW51cyBzcmMgY29sb3InOiA3NjksXG4gICdzcmMgYWxwaGEnOiA3NzAsXG4gICdvbmUgbWludXMgc3JjIGFscGhhJzogNzcxLFxuICAnZHN0IGNvbG9yJzogNzc0LFxuICAnb25lIG1pbnVzIGRzdCBjb2xvcic6IDc3NSxcbiAgJ2RzdCBhbHBoYSc6IDc3MixcbiAgJ29uZSBtaW51cyBkc3QgYWxwaGEnOiA3NzMsXG4gICdjb25zdGFudCBjb2xvcic6IDMyNzY5LFxuICAnb25lIG1pbnVzIGNvbnN0YW50IGNvbG9yJzogMzI3NzAsXG4gICdjb25zdGFudCBhbHBoYSc6IDMyNzcxLFxuICAnb25lIG1pbnVzIGNvbnN0YW50IGFscGhhJzogMzI3NzIsXG4gICdzcmMgYWxwaGEgc2F0dXJhdGUnOiA3NzZcbn1cblxuLy8gVGhlcmUgYXJlIGludmFsaWQgdmFsdWVzIGZvciBzcmNSR0IgYW5kIGRzdFJHQi4gU2VlOlxuLy8gaHR0cHM6Ly93d3cua2hyb25vcy5vcmcvcmVnaXN0cnkvd2ViZ2wvc3BlY3MvMS4wLyM2LjEzXG4vLyBodHRwczovL2dpdGh1Yi5jb20vS2hyb25vc0dyb3VwL1dlYkdML2Jsb2IvMGQzMjAxZjVmN2VjM2MwMDYwYmMxZjA0MDc3NDYxNTQxZjE5ODdiOS9jb25mb3JtYW5jZS1zdWl0ZXMvMS4wLjMvY29uZm9ybWFuY2UvbWlzYy93ZWJnbC1zcGVjaWZpYy5odG1sI0w1NlxudmFyIGludmFsaWRCbGVuZENvbWJpbmF0aW9ucyA9IFtcbiAgJ2NvbnN0YW50IGNvbG9yLCBjb25zdGFudCBhbHBoYScsXG4gICdvbmUgbWludXMgY29uc3RhbnQgY29sb3IsIGNvbnN0YW50IGFscGhhJyxcbiAgJ2NvbnN0YW50IGNvbG9yLCBvbmUgbWludXMgY29uc3RhbnQgYWxwaGEnLFxuICAnb25lIG1pbnVzIGNvbnN0YW50IGNvbG9yLCBvbmUgbWludXMgY29uc3RhbnQgYWxwaGEnLFxuICAnY29uc3RhbnQgYWxwaGEsIGNvbnN0YW50IGNvbG9yJyxcbiAgJ2NvbnN0YW50IGFscGhhLCBvbmUgbWludXMgY29uc3RhbnQgY29sb3InLFxuICAnb25lIG1pbnVzIGNvbnN0YW50IGFscGhhLCBjb25zdGFudCBjb2xvcicsXG4gICdvbmUgbWludXMgY29uc3RhbnQgYWxwaGEsIG9uZSBtaW51cyBjb25zdGFudCBjb2xvcidcbl1cblxudmFyIGNvbXBhcmVGdW5jcyA9IHtcbiAgJ25ldmVyJzogNTEyLFxuICAnbGVzcyc6IDUxMyxcbiAgJzwnOiA1MTMsXG4gICdlcXVhbCc6IDUxNCxcbiAgJz0nOiA1MTQsXG4gICc9PSc6IDUxNCxcbiAgJz09PSc6IDUxNCxcbiAgJ2xlcXVhbCc6IDUxNSxcbiAgJzw9JzogNTE1LFxuICAnZ3JlYXRlcic6IDUxNixcbiAgJz4nOiA1MTYsXG4gICdub3RlcXVhbCc6IDUxNyxcbiAgJyE9JzogNTE3LFxuICAnIT09JzogNTE3LFxuICAnZ2VxdWFsJzogNTE4LFxuICAnPj0nOiA1MTgsXG4gICdhbHdheXMnOiA1MTlcbn1cblxudmFyIHN0ZW5jaWxPcHMgPSB7XG4gICcwJzogMCxcbiAgJ3plcm8nOiAwLFxuICAna2VlcCc6IDc2ODAsXG4gICdyZXBsYWNlJzogNzY4MSxcbiAgJ2luY3JlbWVudCc6IDc2ODIsXG4gICdkZWNyZW1lbnQnOiA3NjgzLFxuICAnaW5jcmVtZW50IHdyYXAnOiAzNDA1NSxcbiAgJ2RlY3JlbWVudCB3cmFwJzogMzQwNTYsXG4gICdpbnZlcnQnOiA1Mzg2XG59XG5cbnZhciBzaGFkZXJUeXBlID0ge1xuICAnZnJhZyc6IEdMX0ZSQUdNRU5UX1NIQURFUixcbiAgJ3ZlcnQnOiBHTF9WRVJURVhfU0hBREVSXG59XG5cbnZhciBvcmllbnRhdGlvblR5cGUgPSB7XG4gICdjdyc6IEdMX0NXLFxuICAnY2N3JzogR0xfQ0NXXG59XG5cbmZ1bmN0aW9uIGlzQnVmZmVyQXJncyAoeCkge1xuICByZXR1cm4gQXJyYXkuaXNBcnJheSh4KSB8fFxuICAgIGlzVHlwZWRBcnJheSh4KSB8fFxuICAgIGlzTkRBcnJheSh4KVxufVxuXG4vLyBNYWtlIHN1cmUgdmlld3BvcnQgaXMgcHJvY2Vzc2VkIGZpcnN0XG5mdW5jdGlvbiBzb3J0U3RhdGUgKHN0YXRlKSB7XG4gIHJldHVybiBzdGF0ZS5zb3J0KGZ1bmN0aW9uIChhLCBiKSB7XG4gICAgaWYgKGEgPT09IFNfVklFV1BPUlQpIHtcbiAgICAgIHJldHVybiAtMVxuICAgIH0gZWxzZSBpZiAoYiA9PT0gU19WSUVXUE9SVCkge1xuICAgICAgcmV0dXJuIDFcbiAgICB9XG4gICAgcmV0dXJuIChhIDwgYikgPyAtMSA6IDFcbiAgfSlcbn1cblxuZnVuY3Rpb24gRGVjbGFyYXRpb24gKHRoaXNEZXAsIGNvbnRleHREZXAsIHByb3BEZXAsIGFwcGVuZCkge1xuICB0aGlzLnRoaXNEZXAgPSB0aGlzRGVwXG4gIHRoaXMuY29udGV4dERlcCA9IGNvbnRleHREZXBcbiAgdGhpcy5wcm9wRGVwID0gcHJvcERlcFxuICB0aGlzLmFwcGVuZCA9IGFwcGVuZFxufVxuXG5mdW5jdGlvbiBpc1N0YXRpYyAoZGVjbCkge1xuICByZXR1cm4gZGVjbCAmJiAhKGRlY2wudGhpc0RlcCB8fCBkZWNsLmNvbnRleHREZXAgfHwgZGVjbC5wcm9wRGVwKVxufVxuXG5mdW5jdGlvbiBjcmVhdGVTdGF0aWNEZWNsIChhcHBlbmQpIHtcbiAgcmV0dXJuIG5ldyBEZWNsYXJhdGlvbihmYWxzZSwgZmFsc2UsIGZhbHNlLCBhcHBlbmQpXG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUR5bmFtaWNEZWNsIChkeW4sIGFwcGVuZCkge1xuICB2YXIgdHlwZSA9IGR5bi50eXBlXG4gIGlmICh0eXBlID09PSBEWU5fRlVOQykge1xuICAgIHZhciBudW1BcmdzID0gZHluLmRhdGEubGVuZ3RoXG4gICAgcmV0dXJuIG5ldyBEZWNsYXJhdGlvbihcbiAgICAgIHRydWUsXG4gICAgICBudW1BcmdzID49IDEsXG4gICAgICBudW1BcmdzID49IDIsXG4gICAgICBhcHBlbmQpXG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gRFlOX1RIVU5LKSB7XG4gICAgdmFyIGRhdGEgPSBkeW4uZGF0YVxuICAgIHJldHVybiBuZXcgRGVjbGFyYXRpb24oXG4gICAgICBkYXRhLnRoaXNEZXAsXG4gICAgICBkYXRhLmNvbnRleHREZXAsXG4gICAgICBkYXRhLnByb3BEZXAsXG4gICAgICBhcHBlbmQpXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIG5ldyBEZWNsYXJhdGlvbihcbiAgICAgIHR5cGUgPT09IERZTl9TVEFURSxcbiAgICAgIHR5cGUgPT09IERZTl9DT05URVhULFxuICAgICAgdHlwZSA9PT0gRFlOX1BST1AsXG4gICAgICBhcHBlbmQpXG4gIH1cbn1cblxudmFyIFNDT1BFX0RFQ0wgPSBuZXcgRGVjbGFyYXRpb24oZmFsc2UsIGZhbHNlLCBmYWxzZSwgZnVuY3Rpb24gKCkge30pXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcmVnbENvcmUgKFxuICBnbCxcbiAgc3RyaW5nU3RvcmUsXG4gIGV4dGVuc2lvbnMsXG4gIGxpbWl0cyxcbiAgYnVmZmVyU3RhdGUsXG4gIGVsZW1lbnRTdGF0ZSxcbiAgdGV4dHVyZVN0YXRlLFxuICBmcmFtZWJ1ZmZlclN0YXRlLFxuICB1bmlmb3JtU3RhdGUsXG4gIGF0dHJpYnV0ZVN0YXRlLFxuICBzaGFkZXJTdGF0ZSxcbiAgZHJhd1N0YXRlLFxuICBjb250ZXh0U3RhdGUsXG4gIHRpbWVyLFxuICBjb25maWcpIHtcbiAgdmFyIEF0dHJpYnV0ZVJlY29yZCA9IGF0dHJpYnV0ZVN0YXRlLlJlY29yZFxuXG4gIHZhciBibGVuZEVxdWF0aW9ucyA9IHtcbiAgICAnYWRkJzogMzI3NzQsXG4gICAgJ3N1YnRyYWN0JzogMzI3NzgsXG4gICAgJ3JldmVyc2Ugc3VidHJhY3QnOiAzMjc3OVxuICB9XG4gIGlmIChleHRlbnNpb25zLmV4dF9ibGVuZF9taW5tYXgpIHtcbiAgICBibGVuZEVxdWF0aW9ucy5taW4gPSBHTF9NSU5fRVhUXG4gICAgYmxlbmRFcXVhdGlvbnMubWF4ID0gR0xfTUFYX0VYVFxuICB9XG5cbiAgdmFyIGV4dEluc3RhbmNpbmcgPSBleHRlbnNpb25zLmFuZ2xlX2luc3RhbmNlZF9hcnJheXNcbiAgdmFyIGV4dERyYXdCdWZmZXJzID0gZXh0ZW5zaW9ucy53ZWJnbF9kcmF3X2J1ZmZlcnNcblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIFdFQkdMIFNUQVRFXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgdmFyIGN1cnJlbnRTdGF0ZSA9IHtcbiAgICBkaXJ0eTogdHJ1ZSxcbiAgICBwcm9maWxlOiBjb25maWcucHJvZmlsZVxuICB9XG4gIHZhciBuZXh0U3RhdGUgPSB7fVxuICB2YXIgR0xfU1RBVEVfTkFNRVMgPSBbXVxuICB2YXIgR0xfRkxBR1MgPSB7fVxuICB2YXIgR0xfVkFSSUFCTEVTID0ge31cblxuICBmdW5jdGlvbiBwcm9wTmFtZSAobmFtZSkge1xuICAgIHJldHVybiBuYW1lLnJlcGxhY2UoJy4nLCAnXycpXG4gIH1cblxuICBmdW5jdGlvbiBzdGF0ZUZsYWcgKHNuYW1lLCBjYXAsIGluaXQpIHtcbiAgICB2YXIgbmFtZSA9IHByb3BOYW1lKHNuYW1lKVxuICAgIEdMX1NUQVRFX05BTUVTLnB1c2goc25hbWUpXG4gICAgbmV4dFN0YXRlW25hbWVdID0gY3VycmVudFN0YXRlW25hbWVdID0gISFpbml0XG4gICAgR0xfRkxBR1NbbmFtZV0gPSBjYXBcbiAgfVxuXG4gIGZ1bmN0aW9uIHN0YXRlVmFyaWFibGUgKHNuYW1lLCBmdW5jLCBpbml0KSB7XG4gICAgdmFyIG5hbWUgPSBwcm9wTmFtZShzbmFtZSlcbiAgICBHTF9TVEFURV9OQU1FUy5wdXNoKHNuYW1lKVxuICAgIGlmIChBcnJheS5pc0FycmF5KGluaXQpKSB7XG4gICAgICBjdXJyZW50U3RhdGVbbmFtZV0gPSBpbml0LnNsaWNlKClcbiAgICAgIG5leHRTdGF0ZVtuYW1lXSA9IGluaXQuc2xpY2UoKVxuICAgIH0gZWxzZSB7XG4gICAgICBjdXJyZW50U3RhdGVbbmFtZV0gPSBuZXh0U3RhdGVbbmFtZV0gPSBpbml0XG4gICAgfVxuICAgIEdMX1ZBUklBQkxFU1tuYW1lXSA9IGZ1bmNcbiAgfVxuXG4gIC8vIERpdGhlcmluZ1xuICBzdGF0ZUZsYWcoU19ESVRIRVIsIEdMX0RJVEhFUilcblxuICAvLyBCbGVuZGluZ1xuICBzdGF0ZUZsYWcoU19CTEVORF9FTkFCTEUsIEdMX0JMRU5EKVxuICBzdGF0ZVZhcmlhYmxlKFNfQkxFTkRfQ09MT1IsICdibGVuZENvbG9yJywgWzAsIDAsIDAsIDBdKVxuICBzdGF0ZVZhcmlhYmxlKFNfQkxFTkRfRVFVQVRJT04sICdibGVuZEVxdWF0aW9uU2VwYXJhdGUnLFxuICAgIFtHTF9GVU5DX0FERCwgR0xfRlVOQ19BRERdKVxuICBzdGF0ZVZhcmlhYmxlKFNfQkxFTkRfRlVOQywgJ2JsZW5kRnVuY1NlcGFyYXRlJyxcbiAgICBbR0xfT05FLCBHTF9aRVJPLCBHTF9PTkUsIEdMX1pFUk9dKVxuXG4gIC8vIERlcHRoXG4gIHN0YXRlRmxhZyhTX0RFUFRIX0VOQUJMRSwgR0xfREVQVEhfVEVTVCwgdHJ1ZSlcbiAgc3RhdGVWYXJpYWJsZShTX0RFUFRIX0ZVTkMsICdkZXB0aEZ1bmMnLCBHTF9MRVNTKVxuICBzdGF0ZVZhcmlhYmxlKFNfREVQVEhfUkFOR0UsICdkZXB0aFJhbmdlJywgWzAsIDFdKVxuICBzdGF0ZVZhcmlhYmxlKFNfREVQVEhfTUFTSywgJ2RlcHRoTWFzaycsIHRydWUpXG5cbiAgLy8gQ29sb3IgbWFza1xuICBzdGF0ZVZhcmlhYmxlKFNfQ09MT1JfTUFTSywgU19DT0xPUl9NQVNLLCBbdHJ1ZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZV0pXG5cbiAgLy8gRmFjZSBjdWxsaW5nXG4gIHN0YXRlRmxhZyhTX0NVTExfRU5BQkxFLCBHTF9DVUxMX0ZBQ0UpXG4gIHN0YXRlVmFyaWFibGUoU19DVUxMX0ZBQ0UsICdjdWxsRmFjZScsIEdMX0JBQ0spXG5cbiAgLy8gRnJvbnQgZmFjZSBvcmllbnRhdGlvblxuICBzdGF0ZVZhcmlhYmxlKFNfRlJPTlRfRkFDRSwgU19GUk9OVF9GQUNFLCBHTF9DQ1cpXG5cbiAgLy8gTGluZSB3aWR0aFxuICBzdGF0ZVZhcmlhYmxlKFNfTElORV9XSURUSCwgU19MSU5FX1dJRFRILCAxKVxuXG4gIC8vIFBvbHlnb24gb2Zmc2V0XG4gIHN0YXRlRmxhZyhTX1BPTFlHT05fT0ZGU0VUX0VOQUJMRSwgR0xfUE9MWUdPTl9PRkZTRVRfRklMTClcbiAgc3RhdGVWYXJpYWJsZShTX1BPTFlHT05fT0ZGU0VUX09GRlNFVCwgJ3BvbHlnb25PZmZzZXQnLCBbMCwgMF0pXG5cbiAgLy8gU2FtcGxlIGNvdmVyYWdlXG4gIHN0YXRlRmxhZyhTX1NBTVBMRV9BTFBIQSwgR0xfU0FNUExFX0FMUEhBX1RPX0NPVkVSQUdFKVxuICBzdGF0ZUZsYWcoU19TQU1QTEVfRU5BQkxFLCBHTF9TQU1QTEVfQ09WRVJBR0UpXG4gIHN0YXRlVmFyaWFibGUoU19TQU1QTEVfQ09WRVJBR0UsICdzYW1wbGVDb3ZlcmFnZScsIFsxLCBmYWxzZV0pXG5cbiAgLy8gU3RlbmNpbFxuICBzdGF0ZUZsYWcoU19TVEVOQ0lMX0VOQUJMRSwgR0xfU1RFTkNJTF9URVNUKVxuICBzdGF0ZVZhcmlhYmxlKFNfU1RFTkNJTF9NQVNLLCAnc3RlbmNpbE1hc2snLCAtMSlcbiAgc3RhdGVWYXJpYWJsZShTX1NURU5DSUxfRlVOQywgJ3N0ZW5jaWxGdW5jJywgW0dMX0FMV0FZUywgMCwgLTFdKVxuICBzdGF0ZVZhcmlhYmxlKFNfU1RFTkNJTF9PUEZST05ULCAnc3RlbmNpbE9wU2VwYXJhdGUnLFxuICAgIFtHTF9GUk9OVCwgR0xfS0VFUCwgR0xfS0VFUCwgR0xfS0VFUF0pXG4gIHN0YXRlVmFyaWFibGUoU19TVEVOQ0lMX09QQkFDSywgJ3N0ZW5jaWxPcFNlcGFyYXRlJyxcbiAgICBbR0xfQkFDSywgR0xfS0VFUCwgR0xfS0VFUCwgR0xfS0VFUF0pXG5cbiAgLy8gU2Npc3NvclxuICBzdGF0ZUZsYWcoU19TQ0lTU09SX0VOQUJMRSwgR0xfU0NJU1NPUl9URVNUKVxuICBzdGF0ZVZhcmlhYmxlKFNfU0NJU1NPUl9CT1gsICdzY2lzc29yJyxcbiAgICBbMCwgMCwgZ2wuZHJhd2luZ0J1ZmZlcldpZHRoLCBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0XSlcblxuICAvLyBWaWV3cG9ydFxuICBzdGF0ZVZhcmlhYmxlKFNfVklFV1BPUlQsIFNfVklFV1BPUlQsXG4gICAgWzAsIDAsIGdsLmRyYXdpbmdCdWZmZXJXaWR0aCwgZ2wuZHJhd2luZ0J1ZmZlckhlaWdodF0pXG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBFTlZJUk9OTUVOVFxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIHZhciBzaGFyZWRTdGF0ZSA9IHtcbiAgICBnbDogZ2wsXG4gICAgY29udGV4dDogY29udGV4dFN0YXRlLFxuICAgIHN0cmluZ3M6IHN0cmluZ1N0b3JlLFxuICAgIG5leHQ6IG5leHRTdGF0ZSxcbiAgICBjdXJyZW50OiBjdXJyZW50U3RhdGUsXG4gICAgZHJhdzogZHJhd1N0YXRlLFxuICAgIGVsZW1lbnRzOiBlbGVtZW50U3RhdGUsXG4gICAgYnVmZmVyOiBidWZmZXJTdGF0ZSxcbiAgICBzaGFkZXI6IHNoYWRlclN0YXRlLFxuICAgIGF0dHJpYnV0ZXM6IGF0dHJpYnV0ZVN0YXRlLnN0YXRlLFxuICAgIHVuaWZvcm1zOiB1bmlmb3JtU3RhdGUsXG4gICAgZnJhbWVidWZmZXI6IGZyYW1lYnVmZmVyU3RhdGUsXG4gICAgZXh0ZW5zaW9uczogZXh0ZW5zaW9ucyxcblxuICAgIHRpbWVyOiB0aW1lcixcbiAgICBpc0J1ZmZlckFyZ3M6IGlzQnVmZmVyQXJnc1xuICB9XG5cbiAgdmFyIHNoYXJlZENvbnN0YW50cyA9IHtcbiAgICBwcmltVHlwZXM6IHByaW1UeXBlcyxcbiAgICBjb21wYXJlRnVuY3M6IGNvbXBhcmVGdW5jcyxcbiAgICBibGVuZEZ1bmNzOiBibGVuZEZ1bmNzLFxuICAgIGJsZW5kRXF1YXRpb25zOiBibGVuZEVxdWF0aW9ucyxcbiAgICBzdGVuY2lsT3BzOiBzdGVuY2lsT3BzLFxuICAgIGdsVHlwZXM6IGdsVHlwZXMsXG4gICAgb3JpZW50YXRpb25UeXBlOiBvcmllbnRhdGlvblR5cGVcbiAgfVxuXG4gIFxuXG4gIGlmIChleHREcmF3QnVmZmVycykge1xuICAgIHNoYXJlZENvbnN0YW50cy5iYWNrQnVmZmVyID0gW0dMX0JBQ0tdXG4gICAgc2hhcmVkQ29uc3RhbnRzLmRyYXdCdWZmZXIgPSBsb29wKGxpbWl0cy5tYXhEcmF3YnVmZmVycywgZnVuY3Rpb24gKGkpIHtcbiAgICAgIGlmIChpID09PSAwKSB7XG4gICAgICAgIHJldHVybiBbMF1cbiAgICAgIH1cbiAgICAgIHJldHVybiBsb29wKGksIGZ1bmN0aW9uIChqKSB7XG4gICAgICAgIHJldHVybiBHTF9DT0xPUl9BVFRBQ0hNRU5UMCArIGpcbiAgICAgIH0pXG4gICAgfSlcbiAgfVxuXG4gIHZhciBkcmF3Q2FsbENvdW50ZXIgPSAwXG4gIGZ1bmN0aW9uIGNyZWF0ZVJFR0xFbnZpcm9ubWVudCAoKSB7XG4gICAgdmFyIGVudiA9IGNyZWF0ZUVudmlyb25tZW50KClcbiAgICB2YXIgbGluayA9IGVudi5saW5rXG4gICAgdmFyIGdsb2JhbCA9IGVudi5nbG9iYWxcbiAgICBlbnYuaWQgPSBkcmF3Q2FsbENvdW50ZXIrK1xuXG4gICAgZW52LmJhdGNoSWQgPSAnMCdcblxuICAgIC8vIGxpbmsgc2hhcmVkIHN0YXRlXG4gICAgdmFyIFNIQVJFRCA9IGxpbmsoc2hhcmVkU3RhdGUpXG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWQgPSB7XG4gICAgICBwcm9wczogJ2EwJ1xuICAgIH1cbiAgICBPYmplY3Qua2V5cyhzaGFyZWRTdGF0ZSkuZm9yRWFjaChmdW5jdGlvbiAocHJvcCkge1xuICAgICAgc2hhcmVkW3Byb3BdID0gZ2xvYmFsLmRlZihTSEFSRUQsICcuJywgcHJvcClcbiAgICB9KVxuXG4gICAgLy8gSW5qZWN0IHJ1bnRpbWUgYXNzZXJ0aW9uIHN0dWZmIGZvciBkZWJ1ZyBidWlsZHNcbiAgICBcblxuICAgIC8vIENvcHkgR0wgc3RhdGUgdmFyaWFibGVzIG92ZXJcbiAgICB2YXIgbmV4dFZhcnMgPSBlbnYubmV4dCA9IHt9XG4gICAgdmFyIGN1cnJlbnRWYXJzID0gZW52LmN1cnJlbnQgPSB7fVxuICAgIE9iamVjdC5rZXlzKEdMX1ZBUklBQkxFUykuZm9yRWFjaChmdW5jdGlvbiAodmFyaWFibGUpIHtcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KGN1cnJlbnRTdGF0ZVt2YXJpYWJsZV0pKSB7XG4gICAgICAgIG5leHRWYXJzW3ZhcmlhYmxlXSA9IGdsb2JhbC5kZWYoc2hhcmVkLm5leHQsICcuJywgdmFyaWFibGUpXG4gICAgICAgIGN1cnJlbnRWYXJzW3ZhcmlhYmxlXSA9IGdsb2JhbC5kZWYoc2hhcmVkLmN1cnJlbnQsICcuJywgdmFyaWFibGUpXG4gICAgICB9XG4gICAgfSlcblxuICAgIC8vIEluaXRpYWxpemUgc2hhcmVkIGNvbnN0YW50c1xuICAgIHZhciBjb25zdGFudHMgPSBlbnYuY29uc3RhbnRzID0ge31cbiAgICBPYmplY3Qua2V5cyhzaGFyZWRDb25zdGFudHMpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIGNvbnN0YW50c1tuYW1lXSA9IGdsb2JhbC5kZWYoSlNPTi5zdHJpbmdpZnkoc2hhcmVkQ29uc3RhbnRzW25hbWVdKSlcbiAgICB9KVxuXG4gICAgLy8gSGVscGVyIGZ1bmN0aW9uIGZvciBjYWxsaW5nIGEgYmxvY2tcbiAgICBlbnYuaW52b2tlID0gZnVuY3Rpb24gKGJsb2NrLCB4KSB7XG4gICAgICBzd2l0Y2ggKHgudHlwZSkge1xuICAgICAgICBjYXNlIERZTl9GVU5DOlxuICAgICAgICAgIHZhciBhcmdMaXN0ID0gW1xuICAgICAgICAgICAgJ3RoaXMnLFxuICAgICAgICAgICAgc2hhcmVkLmNvbnRleHQsXG4gICAgICAgICAgICBzaGFyZWQucHJvcHMsXG4gICAgICAgICAgICBlbnYuYmF0Y2hJZFxuICAgICAgICAgIF1cbiAgICAgICAgICByZXR1cm4gYmxvY2suZGVmKFxuICAgICAgICAgICAgbGluayh4LmRhdGEpLCAnLmNhbGwoJyxcbiAgICAgICAgICAgICAgYXJnTGlzdC5zbGljZSgwLCBNYXRoLm1heCh4LmRhdGEubGVuZ3RoICsgMSwgNCkpLFxuICAgICAgICAgICAgICcpJylcbiAgICAgICAgY2FzZSBEWU5fUFJPUDpcbiAgICAgICAgICByZXR1cm4gYmxvY2suZGVmKHNoYXJlZC5wcm9wcywgeC5kYXRhKVxuICAgICAgICBjYXNlIERZTl9DT05URVhUOlxuICAgICAgICAgIHJldHVybiBibG9jay5kZWYoc2hhcmVkLmNvbnRleHQsIHguZGF0YSlcbiAgICAgICAgY2FzZSBEWU5fU1RBVEU6XG4gICAgICAgICAgcmV0dXJuIGJsb2NrLmRlZigndGhpcycsIHguZGF0YSlcbiAgICAgICAgY2FzZSBEWU5fVEhVTks6XG4gICAgICAgICAgeC5kYXRhLmFwcGVuZChlbnYsIGJsb2NrKVxuICAgICAgICAgIHJldHVybiB4LmRhdGEucmVmXG4gICAgICB9XG4gICAgfVxuXG4gICAgZW52LmF0dHJpYkNhY2hlID0ge31cblxuICAgIHZhciBzY29wZUF0dHJpYnMgPSB7fVxuICAgIGVudi5zY29wZUF0dHJpYiA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICB2YXIgaWQgPSBzdHJpbmdTdG9yZS5pZChuYW1lKVxuICAgICAgaWYgKGlkIGluIHNjb3BlQXR0cmlicykge1xuICAgICAgICByZXR1cm4gc2NvcGVBdHRyaWJzW2lkXVxuICAgICAgfVxuICAgICAgdmFyIGJpbmRpbmcgPSBhdHRyaWJ1dGVTdGF0ZS5zY29wZVtpZF1cbiAgICAgIGlmICghYmluZGluZykge1xuICAgICAgICBiaW5kaW5nID0gYXR0cmlidXRlU3RhdGUuc2NvcGVbaWRdID0gbmV3IEF0dHJpYnV0ZVJlY29yZCgpXG4gICAgICB9XG4gICAgICB2YXIgcmVzdWx0ID0gc2NvcGVBdHRyaWJzW2lkXSA9IGxpbmsoYmluZGluZylcbiAgICAgIHJldHVybiByZXN1bHRcbiAgICB9XG5cbiAgICByZXR1cm4gZW52XG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIFBBUlNJTkdcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICBmdW5jdGlvbiBwYXJzZVByb2ZpbGUgKG9wdGlvbnMpIHtcbiAgICB2YXIgc3RhdGljT3B0aW9ucyA9IG9wdGlvbnMuc3RhdGljXG4gICAgdmFyIGR5bmFtaWNPcHRpb25zID0gb3B0aW9ucy5keW5hbWljXG5cbiAgICB2YXIgcHJvZmlsZUVuYWJsZVxuICAgIGlmIChTX1BST0ZJTEUgaW4gc3RhdGljT3B0aW9ucykge1xuICAgICAgdmFyIHZhbHVlID0gISFzdGF0aWNPcHRpb25zW1NfUFJPRklMRV1cbiAgICAgIHByb2ZpbGVFbmFibGUgPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgIHJldHVybiB2YWx1ZVxuICAgICAgfSlcbiAgICAgIHByb2ZpbGVFbmFibGUuZW5hYmxlID0gdmFsdWVcbiAgICB9IGVsc2UgaWYgKFNfUFJPRklMRSBpbiBkeW5hbWljT3B0aW9ucykge1xuICAgICAgdmFyIGR5biA9IGR5bmFtaWNPcHRpb25zW1NfUFJPRklMRV1cbiAgICAgIHByb2ZpbGVFbmFibGUgPSBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgIHJldHVybiBlbnYuaW52b2tlKHNjb3BlLCBkeW4pXG4gICAgICB9KVxuICAgIH1cblxuICAgIHJldHVybiBwcm9maWxlRW5hYmxlXG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZUZyYW1lYnVmZmVyIChvcHRpb25zLCBlbnYpIHtcbiAgICB2YXIgc3RhdGljT3B0aW9ucyA9IG9wdGlvbnMuc3RhdGljXG4gICAgdmFyIGR5bmFtaWNPcHRpb25zID0gb3B0aW9ucy5keW5hbWljXG5cbiAgICBpZiAoU19GUkFNRUJVRkZFUiBpbiBzdGF0aWNPcHRpb25zKSB7XG4gICAgICB2YXIgZnJhbWVidWZmZXIgPSBzdGF0aWNPcHRpb25zW1NfRlJBTUVCVUZGRVJdXG4gICAgICBpZiAoZnJhbWVidWZmZXIpIHtcbiAgICAgICAgZnJhbWVidWZmZXIgPSBmcmFtZWJ1ZmZlclN0YXRlLmdldEZyYW1lYnVmZmVyKGZyYW1lYnVmZmVyKVxuICAgICAgICBcbiAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgYmxvY2spIHtcbiAgICAgICAgICB2YXIgRlJBTUVCVUZGRVIgPSBlbnYubGluayhmcmFtZWJ1ZmZlcilcbiAgICAgICAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuICAgICAgICAgIGJsb2NrLnNldChcbiAgICAgICAgICAgIHNoYXJlZC5mcmFtZWJ1ZmZlcixcbiAgICAgICAgICAgICcubmV4dCcsXG4gICAgICAgICAgICBGUkFNRUJVRkZFUilcbiAgICAgICAgICB2YXIgQ09OVEVYVCA9IHNoYXJlZC5jb250ZXh0XG4gICAgICAgICAgYmxvY2suc2V0KFxuICAgICAgICAgICAgQ09OVEVYVCxcbiAgICAgICAgICAgICcuJyArIFNfRlJBTUVCVUZGRVJfV0lEVEgsXG4gICAgICAgICAgICBGUkFNRUJVRkZFUiArICcud2lkdGgnKVxuICAgICAgICAgIGJsb2NrLnNldChcbiAgICAgICAgICAgIENPTlRFWFQsXG4gICAgICAgICAgICAnLicgKyBTX0ZSQU1FQlVGRkVSX0hFSUdIVCxcbiAgICAgICAgICAgIEZSQU1FQlVGRkVSICsgJy5oZWlnaHQnKVxuICAgICAgICAgIHJldHVybiBGUkFNRUJVRkZFUlxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuICAgICAgICAgIHNjb3BlLnNldChcbiAgICAgICAgICAgIHNoYXJlZC5mcmFtZWJ1ZmZlcixcbiAgICAgICAgICAgICcubmV4dCcsXG4gICAgICAgICAgICAnbnVsbCcpXG4gICAgICAgICAgdmFyIENPTlRFWFQgPSBzaGFyZWQuY29udGV4dFxuICAgICAgICAgIHNjb3BlLnNldChcbiAgICAgICAgICAgIENPTlRFWFQsXG4gICAgICAgICAgICAnLicgKyBTX0ZSQU1FQlVGRkVSX1dJRFRILFxuICAgICAgICAgICAgQ09OVEVYVCArICcuJyArIFNfRFJBV0lOR0JVRkZFUl9XSURUSClcbiAgICAgICAgICBzY29wZS5zZXQoXG4gICAgICAgICAgICBDT05URVhULFxuICAgICAgICAgICAgJy4nICsgU19GUkFNRUJVRkZFUl9IRUlHSFQsXG4gICAgICAgICAgICBDT05URVhUICsgJy4nICsgU19EUkFXSU5HQlVGRkVSX0hFSUdIVClcbiAgICAgICAgICByZXR1cm4gJ251bGwnXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChTX0ZSQU1FQlVGRkVSIGluIGR5bmFtaWNPcHRpb25zKSB7XG4gICAgICB2YXIgZHluID0gZHluYW1pY09wdGlvbnNbU19GUkFNRUJVRkZFUl1cbiAgICAgIHJldHVybiBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgIHZhciBGUkFNRUJVRkZFUl9GVU5DID0gZW52Lmludm9rZShzY29wZSwgZHluKVxuICAgICAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuICAgICAgICB2YXIgRlJBTUVCVUZGRVJfU1RBVEUgPSBzaGFyZWQuZnJhbWVidWZmZXJcbiAgICAgICAgdmFyIEZSQU1FQlVGRkVSID0gc2NvcGUuZGVmKFxuICAgICAgICAgIEZSQU1FQlVGRkVSX1NUQVRFLCAnLmdldEZyYW1lYnVmZmVyKCcsIEZSQU1FQlVGRkVSX0ZVTkMsICcpJylcblxuICAgICAgICBcblxuICAgICAgICBzY29wZS5zZXQoXG4gICAgICAgICAgRlJBTUVCVUZGRVJfU1RBVEUsXG4gICAgICAgICAgJy5uZXh0JyxcbiAgICAgICAgICBGUkFNRUJVRkZFUilcbiAgICAgICAgdmFyIENPTlRFWFQgPSBzaGFyZWQuY29udGV4dFxuICAgICAgICBzY29wZS5zZXQoXG4gICAgICAgICAgQ09OVEVYVCxcbiAgICAgICAgICAnLicgKyBTX0ZSQU1FQlVGRkVSX1dJRFRILFxuICAgICAgICAgIEZSQU1FQlVGRkVSICsgJz8nICsgRlJBTUVCVUZGRVIgKyAnLndpZHRoOicgK1xuICAgICAgICAgIENPTlRFWFQgKyAnLicgKyBTX0RSQVdJTkdCVUZGRVJfV0lEVEgpXG4gICAgICAgIHNjb3BlLnNldChcbiAgICAgICAgICBDT05URVhULFxuICAgICAgICAgICcuJyArIFNfRlJBTUVCVUZGRVJfSEVJR0hULFxuICAgICAgICAgIEZSQU1FQlVGRkVSICtcbiAgICAgICAgICAnPycgKyBGUkFNRUJVRkZFUiArICcuaGVpZ2h0OicgK1xuICAgICAgICAgIENPTlRFWFQgKyAnLicgKyBTX0RSQVdJTkdCVUZGRVJfSEVJR0hUKVxuICAgICAgICByZXR1cm4gRlJBTUVCVUZGRVJcbiAgICAgIH0pXG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VWaWV3cG9ydFNjaXNzb3IgKG9wdGlvbnMsIGZyYW1lYnVmZmVyLCBlbnYpIHtcbiAgICB2YXIgc3RhdGljT3B0aW9ucyA9IG9wdGlvbnMuc3RhdGljXG4gICAgdmFyIGR5bmFtaWNPcHRpb25zID0gb3B0aW9ucy5keW5hbWljXG5cbiAgICBmdW5jdGlvbiBwYXJzZUJveCAocGFyYW0pIHtcbiAgICAgIGlmIChwYXJhbSBpbiBzdGF0aWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBib3ggPSBzdGF0aWNPcHRpb25zW3BhcmFtXVxuICAgICAgICBcblxuICAgICAgICB2YXIgaXNTdGF0aWMgPSB0cnVlXG4gICAgICAgIHZhciB4ID0gYm94LnggfCAwXG4gICAgICAgIHZhciB5ID0gYm94LnkgfCAwXG4gICAgICAgIHZhciB3LCBoXG4gICAgICAgIGlmICgnd2lkdGgnIGluIGJveCkge1xuICAgICAgICAgIHcgPSBib3gud2lkdGggfCAwXG4gICAgICAgICAgXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaXNTdGF0aWMgPSBmYWxzZVxuICAgICAgICB9XG4gICAgICAgIGlmICgnaGVpZ2h0JyBpbiBib3gpIHtcbiAgICAgICAgICBoID0gYm94LmhlaWdodCB8IDBcbiAgICAgICAgICBcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpc1N0YXRpYyA9IGZhbHNlXG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgICAgICFpc1N0YXRpYyAmJiBmcmFtZWJ1ZmZlciAmJiBmcmFtZWJ1ZmZlci50aGlzRGVwLFxuICAgICAgICAgICFpc1N0YXRpYyAmJiBmcmFtZWJ1ZmZlciAmJiBmcmFtZWJ1ZmZlci5jb250ZXh0RGVwLFxuICAgICAgICAgICFpc1N0YXRpYyAmJiBmcmFtZWJ1ZmZlciAmJiBmcmFtZWJ1ZmZlci5wcm9wRGVwLFxuICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgICB2YXIgQ09OVEVYVCA9IGVudi5zaGFyZWQuY29udGV4dFxuICAgICAgICAgICAgdmFyIEJPWF9XID0gd1xuICAgICAgICAgICAgaWYgKCEoJ3dpZHRoJyBpbiBib3gpKSB7XG4gICAgICAgICAgICAgIEJPWF9XID0gc2NvcGUuZGVmKENPTlRFWFQsICcuJywgU19GUkFNRUJVRkZFUl9XSURUSCwgJy0nLCB4KVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIEJPWF9IID0gaFxuICAgICAgICAgICAgaWYgKCEoJ2hlaWdodCcgaW4gYm94KSkge1xuICAgICAgICAgICAgICBCT1hfSCA9IHNjb3BlLmRlZihDT05URVhULCAnLicsIFNfRlJBTUVCVUZGRVJfSEVJR0hULCAnLScsIHkpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gW3gsIHksIEJPWF9XLCBCT1hfSF1cbiAgICAgICAgICB9KVxuICAgICAgfSBlbHNlIGlmIChwYXJhbSBpbiBkeW5hbWljT3B0aW9ucykge1xuICAgICAgICB2YXIgZHluQm94ID0gZHluYW1pY09wdGlvbnNbcGFyYW1dXG4gICAgICAgIHZhciByZXN1bHQgPSBjcmVhdGVEeW5hbWljRGVjbChkeW5Cb3gsIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgdmFyIEJPWCA9IGVudi5pbnZva2Uoc2NvcGUsIGR5bkJveClcblxuICAgICAgICAgIFxuXG4gICAgICAgICAgdmFyIENPTlRFWFQgPSBlbnYuc2hhcmVkLmNvbnRleHRcbiAgICAgICAgICB2YXIgQk9YX1ggPSBzY29wZS5kZWYoQk9YLCAnLnh8MCcpXG4gICAgICAgICAgdmFyIEJPWF9ZID0gc2NvcGUuZGVmKEJPWCwgJy55fDAnKVxuICAgICAgICAgIHZhciBCT1hfVyA9IHNjb3BlLmRlZihcbiAgICAgICAgICAgICdcIndpZHRoXCIgaW4gJywgQk9YLCAnPycsIEJPWCwgJy53aWR0aHwwOicsXG4gICAgICAgICAgICAnKCcsIENPTlRFWFQsICcuJywgU19GUkFNRUJVRkZFUl9XSURUSCwgJy0nLCBCT1hfWCwgJyknKVxuICAgICAgICAgIHZhciBCT1hfSCA9IHNjb3BlLmRlZihcbiAgICAgICAgICAgICdcImhlaWdodFwiIGluICcsIEJPWCwgJz8nLCBCT1gsICcuaGVpZ2h0fDA6JyxcbiAgICAgICAgICAgICcoJywgQ09OVEVYVCwgJy4nLCBTX0ZSQU1FQlVGRkVSX0hFSUdIVCwgJy0nLCBCT1hfWSwgJyknKVxuXG4gICAgICAgICAgXG5cbiAgICAgICAgICByZXR1cm4gW0JPWF9YLCBCT1hfWSwgQk9YX1csIEJPWF9IXVxuICAgICAgICB9KVxuICAgICAgICBpZiAoZnJhbWVidWZmZXIpIHtcbiAgICAgICAgICByZXN1bHQudGhpc0RlcCA9IHJlc3VsdC50aGlzRGVwIHx8IGZyYW1lYnVmZmVyLnRoaXNEZXBcbiAgICAgICAgICByZXN1bHQuY29udGV4dERlcCA9IHJlc3VsdC5jb250ZXh0RGVwIHx8IGZyYW1lYnVmZmVyLmNvbnRleHREZXBcbiAgICAgICAgICByZXN1bHQucHJvcERlcCA9IHJlc3VsdC5wcm9wRGVwIHx8IGZyYW1lYnVmZmVyLnByb3BEZXBcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICB9IGVsc2UgaWYgKGZyYW1lYnVmZmVyKSB7XG4gICAgICAgIHJldHVybiBuZXcgRGVjbGFyYXRpb24oXG4gICAgICAgICAgZnJhbWVidWZmZXIudGhpc0RlcCxcbiAgICAgICAgICBmcmFtZWJ1ZmZlci5jb250ZXh0RGVwLFxuICAgICAgICAgIGZyYW1lYnVmZmVyLnByb3BEZXAsXG4gICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICAgIHZhciBDT05URVhUID0gZW52LnNoYXJlZC5jb250ZXh0XG4gICAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgICAwLCAwLFxuICAgICAgICAgICAgICBzY29wZS5kZWYoQ09OVEVYVCwgJy4nLCBTX0ZSQU1FQlVGRkVSX1dJRFRIKSxcbiAgICAgICAgICAgICAgc2NvcGUuZGVmKENPTlRFWFQsICcuJywgU19GUkFNRUJVRkZFUl9IRUlHSFQpXVxuICAgICAgICAgIH0pXG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gbnVsbFxuICAgICAgfVxuICAgIH1cblxuICAgIHZhciB2aWV3cG9ydCA9IHBhcnNlQm94KFNfVklFV1BPUlQpXG5cbiAgICBpZiAodmlld3BvcnQpIHtcbiAgICAgIHZhciBwcmV2Vmlld3BvcnQgPSB2aWV3cG9ydFxuICAgICAgdmlld3BvcnQgPSBuZXcgRGVjbGFyYXRpb24oXG4gICAgICAgIHZpZXdwb3J0LnRoaXNEZXAsXG4gICAgICAgIHZpZXdwb3J0LmNvbnRleHREZXAsXG4gICAgICAgIHZpZXdwb3J0LnByb3BEZXAsXG4gICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgdmFyIFZJRVdQT1JUID0gcHJldlZpZXdwb3J0LmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgICAgIHZhciBDT05URVhUID0gZW52LnNoYXJlZC5jb250ZXh0XG4gICAgICAgICAgc2NvcGUuc2V0KFxuICAgICAgICAgICAgQ09OVEVYVCxcbiAgICAgICAgICAgICcuJyArIFNfVklFV1BPUlRfV0lEVEgsXG4gICAgICAgICAgICBWSUVXUE9SVFsyXSlcbiAgICAgICAgICBzY29wZS5zZXQoXG4gICAgICAgICAgICBDT05URVhULFxuICAgICAgICAgICAgJy4nICsgU19WSUVXUE9SVF9IRUlHSFQsXG4gICAgICAgICAgICBWSUVXUE9SVFszXSlcbiAgICAgICAgICByZXR1cm4gVklFV1BPUlRcbiAgICAgICAgfSlcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgdmlld3BvcnQ6IHZpZXdwb3J0LFxuICAgICAgc2Npc3Nvcl9ib3g6IHBhcnNlQm94KFNfU0NJU1NPUl9CT1gpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VQcm9ncmFtIChvcHRpb25zKSB7XG4gICAgdmFyIHN0YXRpY09wdGlvbnMgPSBvcHRpb25zLnN0YXRpY1xuICAgIHZhciBkeW5hbWljT3B0aW9ucyA9IG9wdGlvbnMuZHluYW1pY1xuXG4gICAgZnVuY3Rpb24gcGFyc2VTaGFkZXIgKG5hbWUpIHtcbiAgICAgIGlmIChuYW1lIGluIHN0YXRpY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIGlkID0gc3RyaW5nU3RvcmUuaWQoc3RhdGljT3B0aW9uc1tuYW1lXSlcbiAgICAgICAgXG4gICAgICAgIHZhciByZXN1bHQgPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICByZXR1cm4gaWRcbiAgICAgICAgfSlcbiAgICAgICAgcmVzdWx0LmlkID0gaWRcbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgfSBlbHNlIGlmIChuYW1lIGluIGR5bmFtaWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBkeW4gPSBkeW5hbWljT3B0aW9uc1tuYW1lXVxuICAgICAgICByZXR1cm4gY3JlYXRlRHluYW1pY0RlY2woZHluLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciBzdHIgPSBlbnYuaW52b2tlKHNjb3BlLCBkeW4pXG4gICAgICAgICAgdmFyIGlkID0gc2NvcGUuZGVmKGVudi5zaGFyZWQuc3RyaW5ncywgJy5pZCgnLCBzdHIsICcpJylcbiAgICAgICAgICBcbiAgICAgICAgICByZXR1cm4gaWRcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuXG4gICAgdmFyIGZyYWcgPSBwYXJzZVNoYWRlcihTX0ZSQUcpXG4gICAgdmFyIHZlcnQgPSBwYXJzZVNoYWRlcihTX1ZFUlQpXG5cbiAgICB2YXIgcHJvZ3JhbSA9IG51bGxcbiAgICB2YXIgcHJvZ1ZhclxuICAgIGlmIChpc1N0YXRpYyhmcmFnKSAmJiBpc1N0YXRpYyh2ZXJ0KSkge1xuICAgICAgcHJvZ3JhbSA9IHNoYWRlclN0YXRlLnByb2dyYW0odmVydC5pZCwgZnJhZy5pZClcbiAgICAgIHByb2dWYXIgPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgIHJldHVybiBlbnYubGluayhwcm9ncmFtKVxuICAgICAgfSlcbiAgICB9IGVsc2Uge1xuICAgICAgcHJvZ1ZhciA9IG5ldyBEZWNsYXJhdGlvbihcbiAgICAgICAgKGZyYWcgJiYgZnJhZy50aGlzRGVwKSB8fCAodmVydCAmJiB2ZXJ0LnRoaXNEZXApLFxuICAgICAgICAoZnJhZyAmJiBmcmFnLmNvbnRleHREZXApIHx8ICh2ZXJ0ICYmIHZlcnQuY29udGV4dERlcCksXG4gICAgICAgIChmcmFnICYmIGZyYWcucHJvcERlcCkgfHwgKHZlcnQgJiYgdmVydC5wcm9wRGVwKSxcbiAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICB2YXIgU0hBREVSX1NUQVRFID0gZW52LnNoYXJlZC5zaGFkZXJcbiAgICAgICAgICB2YXIgZnJhZ0lkXG4gICAgICAgICAgaWYgKGZyYWcpIHtcbiAgICAgICAgICAgIGZyYWdJZCA9IGZyYWcuYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGZyYWdJZCA9IHNjb3BlLmRlZihTSEFERVJfU1RBVEUsICcuJywgU19GUkFHKVxuICAgICAgICAgIH1cbiAgICAgICAgICB2YXIgdmVydElkXG4gICAgICAgICAgaWYgKHZlcnQpIHtcbiAgICAgICAgICAgIHZlcnRJZCA9IHZlcnQuYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZlcnRJZCA9IHNjb3BlLmRlZihTSEFERVJfU1RBVEUsICcuJywgU19WRVJUKVxuICAgICAgICAgIH1cbiAgICAgICAgICB2YXIgcHJvZ0RlZiA9IFNIQURFUl9TVEFURSArICcucHJvZ3JhbSgnICsgdmVydElkICsgJywnICsgZnJhZ0lkXG4gICAgICAgICAgXG4gICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihwcm9nRGVmICsgJyknKVxuICAgICAgICB9KVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBmcmFnOiBmcmFnLFxuICAgICAgdmVydDogdmVydCxcbiAgICAgIHByb2dWYXI6IHByb2dWYXIsXG4gICAgICBwcm9ncmFtOiBwcm9ncmFtXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VEcmF3IChvcHRpb25zLCBlbnYpIHtcbiAgICB2YXIgc3RhdGljT3B0aW9ucyA9IG9wdGlvbnMuc3RhdGljXG4gICAgdmFyIGR5bmFtaWNPcHRpb25zID0gb3B0aW9ucy5keW5hbWljXG5cbiAgICBmdW5jdGlvbiBwYXJzZUVsZW1lbnRzICgpIHtcbiAgICAgIGlmIChTX0VMRU1FTlRTIGluIHN0YXRpY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIGVsZW1lbnRzID0gc3RhdGljT3B0aW9uc1tTX0VMRU1FTlRTXVxuICAgICAgICBpZiAoaXNCdWZmZXJBcmdzKGVsZW1lbnRzKSkge1xuICAgICAgICAgIGVsZW1lbnRzID0gZWxlbWVudFN0YXRlLmdldEVsZW1lbnRzKGVsZW1lbnRTdGF0ZS5jcmVhdGUoZWxlbWVudHMsIHRydWUpKVxuICAgICAgICB9IGVsc2UgaWYgKGVsZW1lbnRzKSB7XG4gICAgICAgICAgZWxlbWVudHMgPSBlbGVtZW50U3RhdGUuZ2V0RWxlbWVudHMoZWxlbWVudHMpXG4gICAgICAgICAgXG4gICAgICAgIH1cbiAgICAgICAgdmFyIHJlc3VsdCA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICBpZiAoZWxlbWVudHMpIHtcbiAgICAgICAgICAgIHZhciByZXN1bHQgPSBlbnYubGluayhlbGVtZW50cylcbiAgICAgICAgICAgIGVudi5FTEVNRU5UUyA9IHJlc3VsdFxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgICAgIH1cbiAgICAgICAgICBlbnYuRUxFTUVOVFMgPSBudWxsXG4gICAgICAgICAgcmV0dXJuIG51bGxcbiAgICAgICAgfSlcbiAgICAgICAgcmVzdWx0LnZhbHVlID0gZWxlbWVudHNcbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgfSBlbHNlIGlmIChTX0VMRU1FTlRTIGluIGR5bmFtaWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBkeW4gPSBkeW5hbWljT3B0aW9uc1tTX0VMRU1FTlRTXVxuICAgICAgICByZXR1cm4gY3JlYXRlRHluYW1pY0RlY2woZHluLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG5cbiAgICAgICAgICB2YXIgSVNfQlVGRkVSX0FSR1MgPSBzaGFyZWQuaXNCdWZmZXJBcmdzXG4gICAgICAgICAgdmFyIEVMRU1FTlRfU1RBVEUgPSBzaGFyZWQuZWxlbWVudHNcblxuICAgICAgICAgIHZhciBlbGVtZW50RGVmbiA9IGVudi5pbnZva2Uoc2NvcGUsIGR5bilcbiAgICAgICAgICB2YXIgZWxlbWVudHMgPSBzY29wZS5kZWYoJ251bGwnKVxuICAgICAgICAgIHZhciBlbGVtZW50U3RyZWFtID0gc2NvcGUuZGVmKElTX0JVRkZFUl9BUkdTLCAnKCcsIGVsZW1lbnREZWZuLCAnKScpXG5cbiAgICAgICAgICB2YXIgaWZ0ZSA9IGVudi5jb25kKGVsZW1lbnRTdHJlYW0pXG4gICAgICAgICAgICAudGhlbihlbGVtZW50cywgJz0nLCBFTEVNRU5UX1NUQVRFLCAnLmNyZWF0ZVN0cmVhbSgnLCBlbGVtZW50RGVmbiwgJyk7JylcbiAgICAgICAgICAgIC5lbHNlKGVsZW1lbnRzLCAnPScsIEVMRU1FTlRfU1RBVEUsICcuZ2V0RWxlbWVudHMoJywgZWxlbWVudERlZm4sICcpOycpXG5cbiAgICAgICAgICBcblxuICAgICAgICAgIHNjb3BlLmVudHJ5KGlmdGUpXG4gICAgICAgICAgc2NvcGUuZXhpdChcbiAgICAgICAgICAgIGVudi5jb25kKGVsZW1lbnRTdHJlYW0pXG4gICAgICAgICAgICAgIC50aGVuKEVMRU1FTlRfU1RBVEUsICcuZGVzdHJveVN0cmVhbSgnLCBlbGVtZW50cywgJyk7JykpXG5cbiAgICAgICAgICBlbnYuRUxFTUVOVFMgPSBlbGVtZW50c1xuXG4gICAgICAgICAgcmV0dXJuIGVsZW1lbnRzXG4gICAgICAgIH0pXG4gICAgICB9XG5cbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuXG4gICAgdmFyIGVsZW1lbnRzID0gcGFyc2VFbGVtZW50cygpXG5cbiAgICBmdW5jdGlvbiBwYXJzZVByaW1pdGl2ZSAoKSB7XG4gICAgICBpZiAoU19QUklNSVRJVkUgaW4gc3RhdGljT3B0aW9ucykge1xuICAgICAgICB2YXIgcHJpbWl0aXZlID0gc3RhdGljT3B0aW9uc1tTX1BSSU1JVElWRV1cbiAgICAgICAgXG4gICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgcmV0dXJuIHByaW1UeXBlc1twcmltaXRpdmVdXG4gICAgICAgIH0pXG4gICAgICB9IGVsc2UgaWYgKFNfUFJJTUlUSVZFIGluIGR5bmFtaWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBkeW5QcmltaXRpdmUgPSBkeW5hbWljT3B0aW9uc1tTX1BSSU1JVElWRV1cbiAgICAgICAgcmV0dXJuIGNyZWF0ZUR5bmFtaWNEZWNsKGR5blByaW1pdGl2ZSwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICB2YXIgUFJJTV9UWVBFUyA9IGVudi5jb25zdGFudHMucHJpbVR5cGVzXG4gICAgICAgICAgdmFyIHByaW0gPSBlbnYuaW52b2tlKHNjb3BlLCBkeW5QcmltaXRpdmUpXG4gICAgICAgICAgXG4gICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihQUklNX1RZUEVTLCAnWycsIHByaW0sICddJylcbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSBpZiAoZWxlbWVudHMpIHtcbiAgICAgICAgaWYgKGlzU3RhdGljKGVsZW1lbnRzKSkge1xuICAgICAgICAgIGlmIChlbGVtZW50cy52YWx1ZSkge1xuICAgICAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihlbnYuRUxFTUVOVFMsICcucHJpbVR5cGUnKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICByZXR1cm4gR0xfVFJJQU5HTEVTXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgICAgICAgZWxlbWVudHMudGhpc0RlcCxcbiAgICAgICAgICAgIGVsZW1lbnRzLmNvbnRleHREZXAsXG4gICAgICAgICAgICBlbGVtZW50cy5wcm9wRGVwLFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICAgICAgdmFyIGVsZW1lbnRzID0gZW52LkVMRU1FTlRTXG4gICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoZWxlbWVudHMsICc/JywgZWxlbWVudHMsICcucHJpbVR5cGU6JywgR0xfVFJJQU5HTEVTKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwYXJzZVBhcmFtIChwYXJhbSwgaXNPZmZzZXQpIHtcbiAgICAgIGlmIChwYXJhbSBpbiBzdGF0aWNPcHRpb25zKSB7XG4gICAgICAgIHZhciB2YWx1ZSA9IHN0YXRpY09wdGlvbnNbcGFyYW1dIHwgMFxuICAgICAgICBcbiAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICBpZiAoaXNPZmZzZXQpIHtcbiAgICAgICAgICAgIGVudi5PRkZTRVQgPSB2YWx1ZVxuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdmFsdWVcbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSBpZiAocGFyYW0gaW4gZHluYW1pY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIGR5blZhbHVlID0gZHluYW1pY09wdGlvbnNbcGFyYW1dXG4gICAgICAgIHJldHVybiBjcmVhdGVEeW5hbWljRGVjbChkeW5WYWx1ZSwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICB2YXIgcmVzdWx0ID0gZW52Lmludm9rZShzY29wZSwgZHluVmFsdWUpXG4gICAgICAgICAgaWYgKGlzT2Zmc2V0KSB7XG4gICAgICAgICAgICBlbnYuT0ZGU0VUID0gcmVzdWx0XG4gICAgICAgICAgICBcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIGlmIChpc09mZnNldCAmJiBlbGVtZW50cykge1xuICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIGVudi5PRkZTRVQgPSAnMCdcbiAgICAgICAgICByZXR1cm4gMFxuICAgICAgICB9KVxuICAgICAgfVxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG5cbiAgICB2YXIgT0ZGU0VUID0gcGFyc2VQYXJhbShTX09GRlNFVCwgdHJ1ZSlcblxuICAgIGZ1bmN0aW9uIHBhcnNlVmVydENvdW50ICgpIHtcbiAgICAgIGlmIChTX0NPVU5UIGluIHN0YXRpY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIGNvdW50ID0gc3RhdGljT3B0aW9uc1tTX0NPVU5UXSB8IDBcbiAgICAgICAgXG4gICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICByZXR1cm4gY291bnRcbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSBpZiAoU19DT1VOVCBpbiBkeW5hbWljT3B0aW9ucykge1xuICAgICAgICB2YXIgZHluQ291bnQgPSBkeW5hbWljT3B0aW9uc1tTX0NPVU5UXVxuICAgICAgICByZXR1cm4gY3JlYXRlRHluYW1pY0RlY2woZHluQ291bnQsIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgdmFyIHJlc3VsdCA9IGVudi5pbnZva2Uoc2NvcGUsIGR5bkNvdW50KVxuICAgICAgICAgIFxuICAgICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSBpZiAoZWxlbWVudHMpIHtcbiAgICAgICAgaWYgKGlzU3RhdGljKGVsZW1lbnRzKSkge1xuICAgICAgICAgIGlmIChlbGVtZW50cykge1xuICAgICAgICAgICAgaWYgKE9GRlNFVCkge1xuICAgICAgICAgICAgICByZXR1cm4gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgICAgICAgICAgIE9GRlNFVC50aGlzRGVwLFxuICAgICAgICAgICAgICAgIE9GRlNFVC5jb250ZXh0RGVwLFxuICAgICAgICAgICAgICAgIE9GRlNFVC5wcm9wRGVwLFxuICAgICAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgICAgICAgICB2YXIgcmVzdWx0ID0gc2NvcGUuZGVmKFxuICAgICAgICAgICAgICAgICAgICBlbnYuRUxFTUVOVFMsICcudmVydENvdW50LScsIGVudi5PRkZTRVQpXG5cbiAgICAgICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihlbnYuRUxFTUVOVFMsICcudmVydENvdW50JylcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFyIHJlc3VsdCA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICByZXR1cm4gLTFcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdmFyIHZhcmlhYmxlID0gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgICAgICAgZWxlbWVudHMudGhpc0RlcCB8fCBPRkZTRVQudGhpc0RlcCxcbiAgICAgICAgICAgIGVsZW1lbnRzLmNvbnRleHREZXAgfHwgT0ZGU0VULmNvbnRleHREZXAsXG4gICAgICAgICAgICBlbGVtZW50cy5wcm9wRGVwIHx8IE9GRlNFVC5wcm9wRGVwLFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICAgICAgdmFyIGVsZW1lbnRzID0gZW52LkVMRU1FTlRTXG4gICAgICAgICAgICAgIGlmIChlbnYuT0ZGU0VUKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihlbGVtZW50cywgJz8nLCBlbGVtZW50cywgJy52ZXJ0Q291bnQtJyxcbiAgICAgICAgICAgICAgICAgIGVudi5PRkZTRVQsICc6LTEnKVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoZWxlbWVudHMsICc/JywgZWxlbWVudHMsICcudmVydENvdW50Oi0xJylcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgXG4gICAgICAgICAgcmV0dXJuIHZhcmlhYmxlXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGVsZW1lbnRzOiBlbGVtZW50cyxcbiAgICAgIHByaW1pdGl2ZTogcGFyc2VQcmltaXRpdmUoKSxcbiAgICAgIGNvdW50OiBwYXJzZVZlcnRDb3VudCgpLFxuICAgICAgaW5zdGFuY2VzOiBwYXJzZVBhcmFtKFNfSU5TVEFOQ0VTLCBmYWxzZSksXG4gICAgICBvZmZzZXQ6IE9GRlNFVFxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlR0xTdGF0ZSAob3B0aW9ucywgZW52KSB7XG4gICAgdmFyIHN0YXRpY09wdGlvbnMgPSBvcHRpb25zLnN0YXRpY1xuICAgIHZhciBkeW5hbWljT3B0aW9ucyA9IG9wdGlvbnMuZHluYW1pY1xuXG4gICAgdmFyIFNUQVRFID0ge31cblxuICAgIEdMX1NUQVRFX05BTUVTLmZvckVhY2goZnVuY3Rpb24gKHByb3ApIHtcbiAgICAgIHZhciBwYXJhbSA9IHByb3BOYW1lKHByb3ApXG5cbiAgICAgIGZ1bmN0aW9uIHBhcnNlUGFyYW0gKHBhcnNlU3RhdGljLCBwYXJzZUR5bmFtaWMpIHtcbiAgICAgICAgaWYgKHByb3AgaW4gc3RhdGljT3B0aW9ucykge1xuICAgICAgICAgIHZhciB2YWx1ZSA9IHBhcnNlU3RhdGljKHN0YXRpY09wdGlvbnNbcHJvcF0pXG4gICAgICAgICAgU1RBVEVbcGFyYW1dID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gdmFsdWVcbiAgICAgICAgICB9KVxuICAgICAgICB9IGVsc2UgaWYgKHByb3AgaW4gZHluYW1pY09wdGlvbnMpIHtcbiAgICAgICAgICB2YXIgZHluID0gZHluYW1pY09wdGlvbnNbcHJvcF1cbiAgICAgICAgICBTVEFURVtwYXJhbV0gPSBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgICByZXR1cm4gcGFyc2VEeW5hbWljKGVudiwgc2NvcGUsIGVudi5pbnZva2Uoc2NvcGUsIGR5bikpXG4gICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBzd2l0Y2ggKHByb3ApIHtcbiAgICAgICAgY2FzZSBTX0NVTExfRU5BQkxFOlxuICAgICAgICBjYXNlIFNfQkxFTkRfRU5BQkxFOlxuICAgICAgICBjYXNlIFNfRElUSEVSOlxuICAgICAgICBjYXNlIFNfU1RFTkNJTF9FTkFCTEU6XG4gICAgICAgIGNhc2UgU19ERVBUSF9FTkFCTEU6XG4gICAgICAgIGNhc2UgU19TQ0lTU09SX0VOQUJMRTpcbiAgICAgICAgY2FzZSBTX1BPTFlHT05fT0ZGU0VUX0VOQUJMRTpcbiAgICAgICAgY2FzZSBTX1NBTVBMRV9BTFBIQTpcbiAgICAgICAgY2FzZSBTX1NBTVBMRV9FTkFCTEU6XG4gICAgICAgIGNhc2UgU19ERVBUSF9NQVNLOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gdmFsdWVcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfREVQVEhfRlVOQzpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIGNvbXBhcmVGdW5jc1t2YWx1ZV1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgdmFyIENPTVBBUkVfRlVOQ1MgPSBlbnYuY29uc3RhbnRzLmNvbXBhcmVGdW5jc1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihDT01QQVJFX0ZVTkNTLCAnWycsIHZhbHVlLCAnXScpXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19ERVBUSF9SQU5HRTpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgIHZhciBaX05FQVIgPSBzY29wZS5kZWYoJysnLCB2YWx1ZSwgJ1swXScpXG4gICAgICAgICAgICAgIHZhciBaX0ZBUiA9IHNjb3BlLmRlZignKycsIHZhbHVlLCAnWzFdJylcbiAgICAgICAgICAgICAgcmV0dXJuIFtaX05FQVIsIFpfRkFSXVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfQkxFTkRfRlVOQzpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgdmFyIHNyY1JHQiA9ICgnc3JjUkdCJyBpbiB2YWx1ZSA/IHZhbHVlLnNyY1JHQiA6IHZhbHVlLnNyYylcbiAgICAgICAgICAgICAgdmFyIHNyY0FscGhhID0gKCdzcmNBbHBoYScgaW4gdmFsdWUgPyB2YWx1ZS5zcmNBbHBoYSA6IHZhbHVlLnNyYylcbiAgICAgICAgICAgICAgdmFyIGRzdFJHQiA9ICgnZHN0UkdCJyBpbiB2YWx1ZSA/IHZhbHVlLmRzdFJHQiA6IHZhbHVlLmRzdClcbiAgICAgICAgICAgICAgdmFyIGRzdEFscGhhID0gKCdkc3RBbHBoYScgaW4gdmFsdWUgPyB2YWx1ZS5kc3RBbHBoYSA6IHZhbHVlLmRzdClcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgXG5cbiAgICAgICAgICAgICAgXG5cbiAgICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgICBibGVuZEZ1bmNzW3NyY1JHQl0sXG4gICAgICAgICAgICAgICAgYmxlbmRGdW5jc1tkc3RSR0JdLFxuICAgICAgICAgICAgICAgIGJsZW5kRnVuY3Nbc3JjQWxwaGFdLFxuICAgICAgICAgICAgICAgIGJsZW5kRnVuY3NbZHN0QWxwaGFdXG4gICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgdmFyIEJMRU5EX0ZVTkNTID0gZW52LmNvbnN0YW50cy5ibGVuZEZ1bmNzXG5cbiAgICAgICAgICAgICAgXG5cbiAgICAgICAgICAgICAgZnVuY3Rpb24gcmVhZCAocHJlZml4LCBzdWZmaXgpIHtcbiAgICAgICAgICAgICAgICB2YXIgZnVuYyA9IHNjb3BlLmRlZihcbiAgICAgICAgICAgICAgICAgICdcIicsIHByZWZpeCwgc3VmZml4LCAnXCIgaW4gJywgdmFsdWUsXG4gICAgICAgICAgICAgICAgICAnPycsIHZhbHVlLCAnLicsIHByZWZpeCwgc3VmZml4LFxuICAgICAgICAgICAgICAgICAgJzonLCB2YWx1ZSwgJy4nLCBwcmVmaXgpXG5cbiAgICAgICAgICAgICAgICBcblxuICAgICAgICAgICAgICAgIHJldHVybiBmdW5jXG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICB2YXIgc3JjUkdCID0gcmVhZCgnc3JjJywgJ1JHQicpXG4gICAgICAgICAgICAgIHZhciBkc3RSR0IgPSByZWFkKCdkc3QnLCAnUkdCJylcblxuICAgICAgICAgICAgICBcblxuICAgICAgICAgICAgICB2YXIgU1JDX1JHQiA9IHNjb3BlLmRlZihCTEVORF9GVU5DUywgJ1snLCBzcmNSR0IsICddJylcbiAgICAgICAgICAgICAgdmFyIFNSQ19BTFBIQSA9IHNjb3BlLmRlZihCTEVORF9GVU5DUywgJ1snLCByZWFkKCdzcmMnLCAnQWxwaGEnKSwgJ10nKVxuICAgICAgICAgICAgICB2YXIgRFNUX1JHQiA9IHNjb3BlLmRlZihCTEVORF9GVU5DUywgJ1snLCBkc3RSR0IsICddJylcbiAgICAgICAgICAgICAgdmFyIERTVF9BTFBIQSA9IHNjb3BlLmRlZihCTEVORF9GVU5DUywgJ1snLCByZWFkKCdkc3QnLCAnQWxwaGEnKSwgJ10nKVxuXG4gICAgICAgICAgICAgIHJldHVybiBbU1JDX1JHQiwgRFNUX1JHQiwgU1JDX0FMUEhBLCBEU1RfQUxQSEFdXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19CTEVORF9FUVVBVElPTjpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICAgICAgICBibGVuZEVxdWF0aW9uc1t2YWx1ZV0sXG4gICAgICAgICAgICAgICAgICBibGVuZEVxdWF0aW9uc1t2YWx1ZV1cbiAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICAgICAgICBibGVuZEVxdWF0aW9uc1t2YWx1ZS5yZ2JdLFxuICAgICAgICAgICAgICAgICAgYmxlbmRFcXVhdGlvbnNbdmFsdWUuYWxwaGFdXG4gICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIHZhciBCTEVORF9FUVVBVElPTlMgPSBlbnYuY29uc3RhbnRzLmJsZW5kRXF1YXRpb25zXG5cbiAgICAgICAgICAgICAgdmFyIFJHQiA9IHNjb3BlLmRlZigpXG4gICAgICAgICAgICAgIHZhciBBTFBIQSA9IHNjb3BlLmRlZigpXG5cbiAgICAgICAgICAgICAgdmFyIGlmdGUgPSBlbnYuY29uZCgndHlwZW9mICcsIHZhbHVlLCAnPT09XCJzdHJpbmdcIicpXG5cbiAgICAgICAgICAgICAgXG5cbiAgICAgICAgICAgICAgaWZ0ZS50aGVuKFxuICAgICAgICAgICAgICAgIFJHQiwgJz0nLCBBTFBIQSwgJz0nLCBCTEVORF9FUVVBVElPTlMsICdbJywgdmFsdWUsICddOycpXG4gICAgICAgICAgICAgIGlmdGUuZWxzZShcbiAgICAgICAgICAgICAgICBSR0IsICc9JywgQkxFTkRfRVFVQVRJT05TLCAnWycsIHZhbHVlLCAnLnJnYl07JyxcbiAgICAgICAgICAgICAgICBBTFBIQSwgJz0nLCBCTEVORF9FUVVBVElPTlMsICdbJywgdmFsdWUsICcuYWxwaGFdOycpXG5cbiAgICAgICAgICAgICAgc2NvcGUoaWZ0ZSlcblxuICAgICAgICAgICAgICByZXR1cm4gW1JHQiwgQUxQSEFdXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19CTEVORF9DT0xPUjpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIGxvb3AoNCwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gK3ZhbHVlW2ldXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gbG9vcCg0LCBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoJysnLCB2YWx1ZSwgJ1snLCBpLCAnXScpXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19TVEVOQ0lMX01BU0s6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZSB8IDBcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYodmFsdWUsICd8MCcpXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19TVEVOQ0lMX0ZVTkM6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHZhciBjbXAgPSB2YWx1ZS5jbXAgfHwgJ2tlZXAnXG4gICAgICAgICAgICAgIHZhciByZWYgPSB2YWx1ZS5yZWYgfHwgMFxuICAgICAgICAgICAgICB2YXIgbWFzayA9ICdtYXNrJyBpbiB2YWx1ZSA/IHZhbHVlLm1hc2sgOiAtMVxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgICAgIGNvbXBhcmVGdW5jc1tjbXBdLFxuICAgICAgICAgICAgICAgIHJlZixcbiAgICAgICAgICAgICAgICBtYXNrXG4gICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgdmFyIENPTVBBUkVfRlVOQ1MgPSBlbnYuY29uc3RhbnRzLmNvbXBhcmVGdW5jc1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgdmFyIGNtcCA9IHNjb3BlLmRlZihcbiAgICAgICAgICAgICAgICAnXCJjbXBcIiBpbiAnLCB2YWx1ZSxcbiAgICAgICAgICAgICAgICAnPycsIENPTVBBUkVfRlVOQ1MsICdbJywgdmFsdWUsICcuY21wXScsXG4gICAgICAgICAgICAgICAgJzonLCBHTF9LRUVQKVxuICAgICAgICAgICAgICB2YXIgcmVmID0gc2NvcGUuZGVmKHZhbHVlLCAnLnJlZnwwJylcbiAgICAgICAgICAgICAgdmFyIG1hc2sgPSBzY29wZS5kZWYoXG4gICAgICAgICAgICAgICAgJ1wibWFza1wiIGluICcsIHZhbHVlLFxuICAgICAgICAgICAgICAgICc/JywgdmFsdWUsICcubWFza3wwOi0xJylcbiAgICAgICAgICAgICAgcmV0dXJuIFtjbXAsIHJlZiwgbWFza11cbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX1NURU5DSUxfT1BGUk9OVDpcbiAgICAgICAgY2FzZSBTX1NURU5DSUxfT1BCQUNLOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICB2YXIgZmFpbCA9IHZhbHVlLmZhaWwgfHwgJ2tlZXAnXG4gICAgICAgICAgICAgIHZhciB6ZmFpbCA9IHZhbHVlLnpmYWlsIHx8ICdrZWVwJ1xuICAgICAgICAgICAgICB2YXIgenBhc3MgPSB2YWx1ZS56cGFzcyB8fCAna2VlcCdcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgICBwcm9wID09PSBTX1NURU5DSUxfT1BCQUNLID8gR0xfQkFDSyA6IEdMX0ZST05ULFxuICAgICAgICAgICAgICAgIHN0ZW5jaWxPcHNbZmFpbF0sXG4gICAgICAgICAgICAgICAgc3RlbmNpbE9wc1t6ZmFpbF0sXG4gICAgICAgICAgICAgICAgc3RlbmNpbE9wc1t6cGFzc11cbiAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICB2YXIgU1RFTkNJTF9PUFMgPSBlbnYuY29uc3RhbnRzLnN0ZW5jaWxPcHNcblxuICAgICAgICAgICAgICBcblxuICAgICAgICAgICAgICBmdW5jdGlvbiByZWFkIChuYW1lKSB7XG4gICAgICAgICAgICAgICAgXG5cbiAgICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKFxuICAgICAgICAgICAgICAgICAgJ1wiJywgbmFtZSwgJ1wiIGluICcsIHZhbHVlLFxuICAgICAgICAgICAgICAgICAgJz8nLCBTVEVOQ0lMX09QUywgJ1snLCB2YWx1ZSwgJy4nLCBuYW1lLCAnXTonLFxuICAgICAgICAgICAgICAgICAgR0xfS0VFUClcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICAgICAgcHJvcCA9PT0gU19TVEVOQ0lMX09QQkFDSyA/IEdMX0JBQ0sgOiBHTF9GUk9OVCxcbiAgICAgICAgICAgICAgICByZWFkKCdmYWlsJyksXG4gICAgICAgICAgICAgICAgcmVhZCgnemZhaWwnKSxcbiAgICAgICAgICAgICAgICByZWFkKCd6cGFzcycpXG4gICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX1BPTFlHT05fT0ZGU0VUX09GRlNFVDpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgdmFyIGZhY3RvciA9IHZhbHVlLmZhY3RvciB8IDBcbiAgICAgICAgICAgICAgdmFyIHVuaXRzID0gdmFsdWUudW5pdHMgfCAwXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIFtmYWN0b3IsIHVuaXRzXVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBcblxuICAgICAgICAgICAgICB2YXIgRkFDVE9SID0gc2NvcGUuZGVmKHZhbHVlLCAnLmZhY3RvcnwwJylcbiAgICAgICAgICAgICAgdmFyIFVOSVRTID0gc2NvcGUuZGVmKHZhbHVlLCAnLnVuaXRzfDAnKVxuXG4gICAgICAgICAgICAgIHJldHVybiBbRkFDVE9SLCBVTklUU11cbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX0NVTExfRkFDRTpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICB2YXIgZmFjZSA9IDBcbiAgICAgICAgICAgICAgaWYgKHZhbHVlID09PSAnZnJvbnQnKSB7XG4gICAgICAgICAgICAgICAgZmFjZSA9IEdMX0ZST05UXG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAodmFsdWUgPT09ICdiYWNrJykge1xuICAgICAgICAgICAgICAgIGZhY2UgPSBHTF9CQUNLXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBmYWNlXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKHZhbHVlLCAnPT09XCJmcm9udFwiPycsIEdMX0ZST05ULCAnOicsIEdMX0JBQ0spXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19MSU5FX1dJRFRIOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gdmFsdWVcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgXG5cbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19GUk9OVF9GQUNFOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gb3JpZW50YXRpb25UeXBlW3ZhbHVlXVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZih2YWx1ZSArICc9PT1cImN3XCI/JyArIEdMX0NXICsgJzonICsgR0xfQ0NXKVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfQ09MT1JfTUFTSzpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlLm1hcChmdW5jdGlvbiAodikgeyByZXR1cm4gISF2IH0pXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gbG9vcCg0LCBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgICAgICAgIHJldHVybiAnISEnICsgdmFsdWUgKyAnWycgKyBpICsgJ10nXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19TQU1QTEVfQ09WRVJBR0U6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHZhciBzYW1wbGVWYWx1ZSA9ICd2YWx1ZScgaW4gdmFsdWUgPyB2YWx1ZS52YWx1ZSA6IDFcbiAgICAgICAgICAgICAgdmFyIHNhbXBsZUludmVydCA9ICEhdmFsdWUuaW52ZXJ0XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gW3NhbXBsZVZhbHVlLCBzYW1wbGVJbnZlcnRdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICB2YXIgVkFMVUUgPSBzY29wZS5kZWYoXG4gICAgICAgICAgICAgICAgJ1widmFsdWVcIiBpbiAnLCB2YWx1ZSwgJz8rJywgdmFsdWUsICcudmFsdWU6MScpXG4gICAgICAgICAgICAgIHZhciBJTlZFUlQgPSBzY29wZS5kZWYoJyEhJywgdmFsdWUsICcuaW52ZXJ0JylcbiAgICAgICAgICAgICAgcmV0dXJuIFtWQUxVRSwgSU5WRVJUXVxuICAgICAgICAgICAgfSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgcmV0dXJuIFNUQVRFXG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZVVuaWZvcm1zICh1bmlmb3JtcywgZW52KSB7XG4gICAgdmFyIHN0YXRpY1VuaWZvcm1zID0gdW5pZm9ybXMuc3RhdGljXG4gICAgdmFyIGR5bmFtaWNVbmlmb3JtcyA9IHVuaWZvcm1zLmR5bmFtaWNcblxuICAgIHZhciBVTklGT1JNUyA9IHt9XG5cbiAgICBPYmplY3Qua2V5cyhzdGF0aWNVbmlmb3JtcykuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgdmFyIHZhbHVlID0gc3RhdGljVW5pZm9ybXNbbmFtZV1cbiAgICAgIHZhciByZXN1bHRcbiAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInIHx8XG4gICAgICAgICAgdHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgcmVzdWx0ID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcmV0dXJuIHZhbHVlXG4gICAgICAgIH0pXG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICB2YXIgcmVnbFR5cGUgPSB2YWx1ZS5fcmVnbFR5cGVcbiAgICAgICAgaWYgKHJlZ2xUeXBlID09PSAndGV4dHVyZTJkJyB8fFxuICAgICAgICAgICAgcmVnbFR5cGUgPT09ICd0ZXh0dXJlQ3ViZScpIHtcbiAgICAgICAgICByZXN1bHQgPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYpIHtcbiAgICAgICAgICAgIHJldHVybiBlbnYubGluayh2YWx1ZSlcbiAgICAgICAgICB9KVxuICAgICAgICB9IGVsc2UgaWYgKHJlZ2xUeXBlID09PSAnZnJhbWVidWZmZXInIHx8XG4gICAgICAgICAgICAgICAgICAgcmVnbFR5cGUgPT09ICdmcmFtZWJ1ZmZlckN1YmUnKSB7XG4gICAgICAgICAgXG4gICAgICAgICAgcmVzdWx0ID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52KSB7XG4gICAgICAgICAgICByZXR1cm4gZW52LmxpbmsodmFsdWUuY29sb3JbMF0pXG4gICAgICAgICAgfSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChpc0FycmF5TGlrZSh2YWx1ZSkpIHtcbiAgICAgICAgcmVzdWx0ID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52KSB7XG4gICAgICAgICAgdmFyIElURU0gPSBlbnYuZ2xvYmFsLmRlZignWycsXG4gICAgICAgICAgICBsb29wKHZhbHVlLmxlbmd0aCwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZVtpXVxuICAgICAgICAgICAgfSksICddJylcbiAgICAgICAgICByZXR1cm4gSVRFTVxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgXG4gICAgICB9XG4gICAgICByZXN1bHQudmFsdWUgPSB2YWx1ZVxuICAgICAgVU5JRk9STVNbbmFtZV0gPSByZXN1bHRcbiAgICB9KVxuXG4gICAgT2JqZWN0LmtleXMoZHluYW1pY1VuaWZvcm1zKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgIHZhciBkeW4gPSBkeW5hbWljVW5pZm9ybXNba2V5XVxuICAgICAgVU5JRk9STVNba2V5XSA9IGNyZWF0ZUR5bmFtaWNEZWNsKGR5biwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgcmV0dXJuIGVudi5pbnZva2Uoc2NvcGUsIGR5bilcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIHJldHVybiBVTklGT1JNU1xuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VBdHRyaWJ1dGVzIChhdHRyaWJ1dGVzLCBlbnYpIHtcbiAgICB2YXIgc3RhdGljQXR0cmlidXRlcyA9IGF0dHJpYnV0ZXMuc3RhdGljXG4gICAgdmFyIGR5bmFtaWNBdHRyaWJ1dGVzID0gYXR0cmlidXRlcy5keW5hbWljXG5cbiAgICB2YXIgYXR0cmlidXRlRGVmcyA9IHt9XG5cbiAgICBPYmplY3Qua2V5cyhzdGF0aWNBdHRyaWJ1dGVzKS5mb3JFYWNoKGZ1bmN0aW9uIChhdHRyaWJ1dGUpIHtcbiAgICAgIHZhciB2YWx1ZSA9IHN0YXRpY0F0dHJpYnV0ZXNbYXR0cmlidXRlXVxuICAgICAgdmFyIGlkID0gc3RyaW5nU3RvcmUuaWQoYXR0cmlidXRlKVxuXG4gICAgICB2YXIgcmVjb3JkID0gbmV3IEF0dHJpYnV0ZVJlY29yZCgpXG4gICAgICBpZiAoaXNCdWZmZXJBcmdzKHZhbHVlKSkge1xuICAgICAgICByZWNvcmQuc3RhdGUgPSBBVFRSSUJfU1RBVEVfUE9JTlRFUlxuICAgICAgICByZWNvcmQuYnVmZmVyID0gYnVmZmVyU3RhdGUuZ2V0QnVmZmVyKFxuICAgICAgICAgIGJ1ZmZlclN0YXRlLmNyZWF0ZSh2YWx1ZSwgR0xfQVJSQVlfQlVGRkVSLCBmYWxzZSwgdHJ1ZSkpXG4gICAgICAgIHJlY29yZC50eXBlID0gMFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIGJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmdldEJ1ZmZlcih2YWx1ZSlcbiAgICAgICAgaWYgKGJ1ZmZlcikge1xuICAgICAgICAgIHJlY29yZC5zdGF0ZSA9IEFUVFJJQl9TVEFURV9QT0lOVEVSXG4gICAgICAgICAgcmVjb3JkLmJ1ZmZlciA9IGJ1ZmZlclxuICAgICAgICAgIHJlY29yZC50eXBlID0gMFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIFxuICAgICAgICAgIGlmICh2YWx1ZS5jb25zdGFudCkge1xuICAgICAgICAgICAgdmFyIGNvbnN0YW50ID0gdmFsdWUuY29uc3RhbnRcbiAgICAgICAgICAgIHJlY29yZC5idWZmZXIgPSAnbnVsbCdcbiAgICAgICAgICAgIHJlY29yZC5zdGF0ZSA9IEFUVFJJQl9TVEFURV9DT05TVEFOVFxuICAgICAgICAgICAgaWYgKHR5cGVvZiBjb25zdGFudCA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgICAgcmVjb3JkLnggPSBjb25zdGFudFxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIENVVEVfQ09NUE9ORU5UUy5mb3JFYWNoKGZ1bmN0aW9uIChjLCBpKSB7XG4gICAgICAgICAgICAgICAgaWYgKGkgPCBjb25zdGFudC5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgIHJlY29yZFtjXSA9IGNvbnN0YW50W2ldXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAoaXNCdWZmZXJBcmdzKHZhbHVlLmJ1ZmZlcikpIHtcbiAgICAgICAgICAgICAgYnVmZmVyID0gYnVmZmVyU3RhdGUuZ2V0QnVmZmVyKFxuICAgICAgICAgICAgICAgIGJ1ZmZlclN0YXRlLmNyZWF0ZSh2YWx1ZS5idWZmZXIsIEdMX0FSUkFZX0JVRkZFUiwgZmFsc2UsIHRydWUpKVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgYnVmZmVyID0gYnVmZmVyU3RhdGUuZ2V0QnVmZmVyKHZhbHVlLmJ1ZmZlcilcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuXG4gICAgICAgICAgICB2YXIgb2Zmc2V0ID0gdmFsdWUub2Zmc2V0IHwgMFxuICAgICAgICAgICAgXG5cbiAgICAgICAgICAgIHZhciBzdHJpZGUgPSB2YWx1ZS5zdHJpZGUgfCAwXG4gICAgICAgICAgICBcblxuICAgICAgICAgICAgdmFyIHNpemUgPSB2YWx1ZS5zaXplIHwgMFxuICAgICAgICAgICAgXG5cbiAgICAgICAgICAgIHZhciBub3JtYWxpemVkID0gISF2YWx1ZS5ub3JtYWxpemVkXG5cbiAgICAgICAgICAgIHZhciB0eXBlID0gMFxuICAgICAgICAgICAgaWYgKCd0eXBlJyBpbiB2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgdHlwZSA9IGdsVHlwZXNbdmFsdWUudHlwZV1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIGRpdmlzb3IgPSB2YWx1ZS5kaXZpc29yIHwgMFxuICAgICAgICAgICAgaWYgKCdkaXZpc29yJyBpbiB2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIFxuXG4gICAgICAgICAgICByZWNvcmQuYnVmZmVyID0gYnVmZmVyXG4gICAgICAgICAgICByZWNvcmQuc3RhdGUgPSBBVFRSSUJfU1RBVEVfUE9JTlRFUlxuICAgICAgICAgICAgcmVjb3JkLnNpemUgPSBzaXplXG4gICAgICAgICAgICByZWNvcmQubm9ybWFsaXplZCA9IG5vcm1hbGl6ZWRcbiAgICAgICAgICAgIHJlY29yZC50eXBlID0gdHlwZSB8fCBidWZmZXIuZHR5cGVcbiAgICAgICAgICAgIHJlY29yZC5vZmZzZXQgPSBvZmZzZXRcbiAgICAgICAgICAgIHJlY29yZC5zdHJpZGUgPSBzdHJpZGVcbiAgICAgICAgICAgIHJlY29yZC5kaXZpc29yID0gZGl2aXNvclxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBhdHRyaWJ1dGVEZWZzW2F0dHJpYnV0ZV0gPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgIHZhciBjYWNoZSA9IGVudi5hdHRyaWJDYWNoZVxuICAgICAgICBpZiAoaWQgaW4gY2FjaGUpIHtcbiAgICAgICAgICByZXR1cm4gY2FjaGVbaWRdXG4gICAgICAgIH1cbiAgICAgICAgdmFyIHJlc3VsdCA9IHtcbiAgICAgICAgICBpc1N0cmVhbTogZmFsc2VcbiAgICAgICAgfVxuICAgICAgICBPYmplY3Qua2V5cyhyZWNvcmQpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgICAgIHJlc3VsdFtrZXldID0gcmVjb3JkW2tleV1cbiAgICAgICAgfSlcbiAgICAgICAgaWYgKHJlY29yZC5idWZmZXIpIHtcbiAgICAgICAgICByZXN1bHQuYnVmZmVyID0gZW52LmxpbmsocmVjb3JkLmJ1ZmZlcilcbiAgICAgICAgICByZXN1bHQudHlwZSA9IHJlc3VsdC50eXBlIHx8IChyZXN1bHQuYnVmZmVyICsgJy5kdHlwZScpXG4gICAgICAgIH1cbiAgICAgICAgY2FjaGVbaWRdID0gcmVzdWx0XG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIE9iamVjdC5rZXlzKGR5bmFtaWNBdHRyaWJ1dGVzKS5mb3JFYWNoKGZ1bmN0aW9uIChhdHRyaWJ1dGUpIHtcbiAgICAgIHZhciBkeW4gPSBkeW5hbWljQXR0cmlidXRlc1thdHRyaWJ1dGVdXG5cbiAgICAgIGZ1bmN0aW9uIGFwcGVuZEF0dHJpYnV0ZUNvZGUgKGVudiwgYmxvY2spIHtcbiAgICAgICAgdmFyIFZBTFVFID0gZW52Lmludm9rZShibG9jaywgZHluKVxuXG4gICAgICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG5cbiAgICAgICAgdmFyIElTX0JVRkZFUl9BUkdTID0gc2hhcmVkLmlzQnVmZmVyQXJnc1xuICAgICAgICB2YXIgQlVGRkVSX1NUQVRFID0gc2hhcmVkLmJ1ZmZlclxuXG4gICAgICAgIC8vIFBlcmZvcm0gdmFsaWRhdGlvbiBvbiBhdHRyaWJ1dGVcbiAgICAgICAgXG5cbiAgICAgICAgLy8gYWxsb2NhdGUgbmFtZXMgZm9yIHJlc3VsdFxuICAgICAgICB2YXIgcmVzdWx0ID0ge1xuICAgICAgICAgIGlzU3RyZWFtOiBibG9jay5kZWYoZmFsc2UpXG4gICAgICAgIH1cbiAgICAgICAgdmFyIGRlZmF1bHRSZWNvcmQgPSBuZXcgQXR0cmlidXRlUmVjb3JkKClcbiAgICAgICAgZGVmYXVsdFJlY29yZC5zdGF0ZSA9IEFUVFJJQl9TVEFURV9QT0lOVEVSXG4gICAgICAgIE9iamVjdC5rZXlzKGRlZmF1bHRSZWNvcmQpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgICAgIHJlc3VsdFtrZXldID0gYmxvY2suZGVmKCcnICsgZGVmYXVsdFJlY29yZFtrZXldKVxuICAgICAgICB9KVxuXG4gICAgICAgIHZhciBCVUZGRVIgPSByZXN1bHQuYnVmZmVyXG4gICAgICAgIHZhciBUWVBFID0gcmVzdWx0LnR5cGVcbiAgICAgICAgYmxvY2soXG4gICAgICAgICAgJ2lmKCcsIElTX0JVRkZFUl9BUkdTLCAnKCcsIFZBTFVFLCAnKSl7JyxcbiAgICAgICAgICByZXN1bHQuaXNTdHJlYW0sICc9dHJ1ZTsnLFxuICAgICAgICAgIEJVRkZFUiwgJz0nLCBCVUZGRVJfU1RBVEUsICcuY3JlYXRlU3RyZWFtKCcsIEdMX0FSUkFZX0JVRkZFUiwgJywnLCBWQUxVRSwgJyk7JyxcbiAgICAgICAgICBUWVBFLCAnPScsIEJVRkZFUiwgJy5kdHlwZTsnLFxuICAgICAgICAgICd9ZWxzZXsnLFxuICAgICAgICAgIEJVRkZFUiwgJz0nLCBCVUZGRVJfU1RBVEUsICcuZ2V0QnVmZmVyKCcsIFZBTFVFLCAnKTsnLFxuICAgICAgICAgICdpZignLCBCVUZGRVIsICcpeycsXG4gICAgICAgICAgVFlQRSwgJz0nLCBCVUZGRVIsICcuZHR5cGU7JyxcbiAgICAgICAgICAnfWVsc2UgaWYoXCJjb25zdGFudFwiIGluICcsIFZBTFVFLCAnKXsnLFxuICAgICAgICAgIHJlc3VsdC5zdGF0ZSwgJz0nLCBBVFRSSUJfU1RBVEVfQ09OU1RBTlQsICc7JyxcbiAgICAgICAgICAnaWYodHlwZW9mICcgKyBWQUxVRSArICcuY29uc3RhbnQgPT09IFwibnVtYmVyXCIpeycsXG4gICAgICAgICAgcmVzdWx0W0NVVEVfQ09NUE9ORU5UU1swXV0sICc9JywgVkFMVUUsICcuY29uc3RhbnQ7JyxcbiAgICAgICAgICBDVVRFX0NPTVBPTkVOVFMuc2xpY2UoMSkubWFwKGZ1bmN0aW9uIChuKSB7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0W25dXG4gICAgICAgICAgfSkuam9pbignPScpLCAnPTA7JyxcbiAgICAgICAgICAnfWVsc2V7JyxcbiAgICAgICAgICBDVVRFX0NPTVBPTkVOVFMubWFwKGZ1bmN0aW9uIChuYW1lLCBpKSB7XG4gICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICByZXN1bHRbbmFtZV0gKyAnPScgKyBWQUxVRSArICcuY29uc3RhbnQubGVuZ3RoPj0nICsgaSArXG4gICAgICAgICAgICAgICc/JyArIFZBTFVFICsgJy5jb25zdGFudFsnICsgaSArICddOjA7J1xuICAgICAgICAgICAgKVxuICAgICAgICAgIH0pLmpvaW4oJycpLFxuICAgICAgICAgICd9fWVsc2V7JyxcbiAgICAgICAgICAnaWYoJywgSVNfQlVGRkVSX0FSR1MsICcoJywgVkFMVUUsICcuYnVmZmVyKSl7JyxcbiAgICAgICAgICBCVUZGRVIsICc9JywgQlVGRkVSX1NUQVRFLCAnLmNyZWF0ZVN0cmVhbSgnLCBHTF9BUlJBWV9CVUZGRVIsICcsJywgVkFMVUUsICcuYnVmZmVyKTsnLFxuICAgICAgICAgICd9ZWxzZXsnLFxuICAgICAgICAgIEJVRkZFUiwgJz0nLCBCVUZGRVJfU1RBVEUsICcuZ2V0QnVmZmVyKCcsIFZBTFVFLCAnLmJ1ZmZlcik7JyxcbiAgICAgICAgICAnfScsXG4gICAgICAgICAgVFlQRSwgJz1cInR5cGVcIiBpbiAnLCBWQUxVRSwgJz8nLFxuICAgICAgICAgIHNoYXJlZC5nbFR5cGVzLCAnWycsIFZBTFVFLCAnLnR5cGVdOicsIEJVRkZFUiwgJy5kdHlwZTsnLFxuICAgICAgICAgIHJlc3VsdC5ub3JtYWxpemVkLCAnPSEhJywgVkFMVUUsICcubm9ybWFsaXplZDsnKVxuICAgICAgICBmdW5jdGlvbiBlbWl0UmVhZFJlY29yZCAobmFtZSkge1xuICAgICAgICAgIGJsb2NrKHJlc3VsdFtuYW1lXSwgJz0nLCBWQUxVRSwgJy4nLCBuYW1lLCAnfDA7JylcbiAgICAgICAgfVxuICAgICAgICBlbWl0UmVhZFJlY29yZCgnc2l6ZScpXG4gICAgICAgIGVtaXRSZWFkUmVjb3JkKCdvZmZzZXQnKVxuICAgICAgICBlbWl0UmVhZFJlY29yZCgnc3RyaWRlJylcbiAgICAgICAgZW1pdFJlYWRSZWNvcmQoJ2Rpdmlzb3InKVxuXG4gICAgICAgIGJsb2NrKCd9fScpXG5cbiAgICAgICAgYmxvY2suZXhpdChcbiAgICAgICAgICAnaWYoJywgcmVzdWx0LmlzU3RyZWFtLCAnKXsnLFxuICAgICAgICAgIEJVRkZFUl9TVEFURSwgJy5kZXN0cm95U3RyZWFtKCcsIEJVRkZFUiwgJyk7JyxcbiAgICAgICAgICAnfScpXG5cbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgfVxuXG4gICAgICBhdHRyaWJ1dGVEZWZzW2F0dHJpYnV0ZV0gPSBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGFwcGVuZEF0dHJpYnV0ZUNvZGUpXG4gICAgfSlcblxuICAgIHJldHVybiBhdHRyaWJ1dGVEZWZzXG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZUNvbnRleHQgKGNvbnRleHQpIHtcbiAgICB2YXIgc3RhdGljQ29udGV4dCA9IGNvbnRleHQuc3RhdGljXG4gICAgdmFyIGR5bmFtaWNDb250ZXh0ID0gY29udGV4dC5keW5hbWljXG4gICAgdmFyIHJlc3VsdCA9IHt9XG5cbiAgICBPYmplY3Qua2V5cyhzdGF0aWNDb250ZXh0KS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICB2YXIgdmFsdWUgPSBzdGF0aWNDb250ZXh0W25hbWVdXG4gICAgICByZXN1bHRbbmFtZV0gPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInIHx8IHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgcmV0dXJuICcnICsgdmFsdWVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gZW52LmxpbmsodmFsdWUpXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgfSlcblxuICAgIE9iamVjdC5rZXlzKGR5bmFtaWNDb250ZXh0KS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICB2YXIgZHluID0gZHluYW1pY0NvbnRleHRbbmFtZV1cbiAgICAgIHJlc3VsdFtuYW1lXSA9IGNyZWF0ZUR5bmFtaWNEZWNsKGR5biwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgcmV0dXJuIGVudi5pbnZva2Uoc2NvcGUsIGR5bilcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIHJldHVybiByZXN1bHRcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlQXJndW1lbnRzIChvcHRpb25zLCBhdHRyaWJ1dGVzLCB1bmlmb3JtcywgY29udGV4dCwgZW52KSB7XG4gICAgdmFyIHN0YXRpY09wdGlvbnMgPSBvcHRpb25zLnN0YXRpY1xuICAgIHZhciBkeW5hbWljT3B0aW9ucyA9IG9wdGlvbnMuZHluYW1pY1xuXG4gICAgXG5cbiAgICB2YXIgZnJhbWVidWZmZXIgPSBwYXJzZUZyYW1lYnVmZmVyKG9wdGlvbnMsIGVudilcbiAgICB2YXIgdmlld3BvcnRBbmRTY2lzc29yID0gcGFyc2VWaWV3cG9ydFNjaXNzb3Iob3B0aW9ucywgZnJhbWVidWZmZXIsIGVudilcbiAgICB2YXIgZHJhdyA9IHBhcnNlRHJhdyhvcHRpb25zLCBlbnYpXG4gICAgdmFyIHN0YXRlID0gcGFyc2VHTFN0YXRlKG9wdGlvbnMsIGVudilcbiAgICB2YXIgc2hhZGVyID0gcGFyc2VQcm9ncmFtKG9wdGlvbnMsIGVudilcblxuICAgIGZ1bmN0aW9uIGNvcHlCb3ggKG5hbWUpIHtcbiAgICAgIHZhciBkZWZuID0gdmlld3BvcnRBbmRTY2lzc29yW25hbWVdXG4gICAgICBpZiAoZGVmbikge1xuICAgICAgICBzdGF0ZVtuYW1lXSA9IGRlZm5cbiAgICAgIH1cbiAgICB9XG4gICAgY29weUJveChTX1ZJRVdQT1JUKVxuICAgIGNvcHlCb3gocHJvcE5hbWUoU19TQ0lTU09SX0JPWCkpXG5cbiAgICB2YXIgZGlydHkgPSBPYmplY3Qua2V5cyhzdGF0ZSkubGVuZ3RoID4gMFxuXG4gICAgdmFyIHJlc3VsdCA9IHtcbiAgICAgIGZyYW1lYnVmZmVyOiBmcmFtZWJ1ZmZlcixcbiAgICAgIGRyYXc6IGRyYXcsXG4gICAgICBzaGFkZXI6IHNoYWRlcixcbiAgICAgIHN0YXRlOiBzdGF0ZSxcbiAgICAgIGRpcnR5OiBkaXJ0eVxuICAgIH1cblxuICAgIHJlc3VsdC5wcm9maWxlID0gcGFyc2VQcm9maWxlKG9wdGlvbnMsIGVudilcbiAgICByZXN1bHQudW5pZm9ybXMgPSBwYXJzZVVuaWZvcm1zKHVuaWZvcm1zLCBlbnYpXG4gICAgcmVzdWx0LmF0dHJpYnV0ZXMgPSBwYXJzZUF0dHJpYnV0ZXMoYXR0cmlidXRlcywgZW52KVxuICAgIHJlc3VsdC5jb250ZXh0ID0gcGFyc2VDb250ZXh0KGNvbnRleHQsIGVudilcbiAgICByZXR1cm4gcmVzdWx0XG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIENPTU1PTiBVUERBVEUgRlVOQ1RJT05TXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgZnVuY3Rpb24gZW1pdENvbnRleHQgKGVudiwgc2NvcGUsIGNvbnRleHQpIHtcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuICAgIHZhciBDT05URVhUID0gc2hhcmVkLmNvbnRleHRcblxuICAgIHZhciBjb250ZXh0RW50ZXIgPSBlbnYuc2NvcGUoKVxuXG4gICAgT2JqZWN0LmtleXMoY29udGV4dCkuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgc2NvcGUuc2F2ZShDT05URVhULCAnLicgKyBuYW1lKVxuICAgICAgdmFyIGRlZm4gPSBjb250ZXh0W25hbWVdXG4gICAgICBjb250ZXh0RW50ZXIoQ09OVEVYVCwgJy4nLCBuYW1lLCAnPScsIGRlZm4uYXBwZW5kKGVudiwgc2NvcGUpLCAnOycpXG4gICAgfSlcblxuICAgIHNjb3BlKGNvbnRleHRFbnRlcilcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gQ09NTU9OIERSQVdJTkcgRlVOQ1RJT05TXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgZnVuY3Rpb24gZW1pdFBvbGxGcmFtZWJ1ZmZlciAoZW52LCBzY29wZSwgZnJhbWVidWZmZXIsIHNraXBDaGVjaykge1xuICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG5cbiAgICB2YXIgR0wgPSBzaGFyZWQuZ2xcbiAgICB2YXIgRlJBTUVCVUZGRVJfU1RBVEUgPSBzaGFyZWQuZnJhbWVidWZmZXJcbiAgICB2YXIgRVhUX0RSQVdfQlVGRkVSU1xuICAgIGlmIChleHREcmF3QnVmZmVycykge1xuICAgICAgRVhUX0RSQVdfQlVGRkVSUyA9IHNjb3BlLmRlZihzaGFyZWQuZXh0ZW5zaW9ucywgJy53ZWJnbF9kcmF3X2J1ZmZlcnMnKVxuICAgIH1cblxuICAgIHZhciBjb25zdGFudHMgPSBlbnYuY29uc3RhbnRzXG5cbiAgICB2YXIgRFJBV19CVUZGRVJTID0gY29uc3RhbnRzLmRyYXdCdWZmZXJcbiAgICB2YXIgQkFDS19CVUZGRVIgPSBjb25zdGFudHMuYmFja0J1ZmZlclxuXG4gICAgdmFyIE5FWFRcbiAgICBpZiAoZnJhbWVidWZmZXIpIHtcbiAgICAgIE5FWFQgPSBmcmFtZWJ1ZmZlci5hcHBlbmQoZW52LCBzY29wZSlcbiAgICB9IGVsc2Uge1xuICAgICAgTkVYVCA9IHNjb3BlLmRlZihGUkFNRUJVRkZFUl9TVEFURSwgJy5uZXh0JylcbiAgICB9XG5cbiAgICBpZiAoIXNraXBDaGVjaykge1xuICAgICAgc2NvcGUoJ2lmKCcsIE5FWFQsICchPT0nLCBGUkFNRUJVRkZFUl9TVEFURSwgJy5jdXIpeycpXG4gICAgfVxuICAgIHNjb3BlKFxuICAgICAgJ2lmKCcsIE5FWFQsICcpeycsXG4gICAgICBHTCwgJy5iaW5kRnJhbWVidWZmZXIoJywgR0xfRlJBTUVCVUZGRVIsICcsJywgTkVYVCwgJy5mcmFtZWJ1ZmZlcik7JylcbiAgICBpZiAoZXh0RHJhd0J1ZmZlcnMpIHtcbiAgICAgIHNjb3BlKEVYVF9EUkFXX0JVRkZFUlMsICcuZHJhd0J1ZmZlcnNXRUJHTCgnLFxuICAgICAgICBEUkFXX0JVRkZFUlMsICdbJywgTkVYVCwgJy5jb2xvckF0dGFjaG1lbnRzLmxlbmd0aF0pOycpXG4gICAgfVxuICAgIHNjb3BlKCd9ZWxzZXsnLFxuICAgICAgR0wsICcuYmluZEZyYW1lYnVmZmVyKCcsIEdMX0ZSQU1FQlVGRkVSLCAnLG51bGwpOycpXG4gICAgaWYgKGV4dERyYXdCdWZmZXJzKSB7XG4gICAgICBzY29wZShFWFRfRFJBV19CVUZGRVJTLCAnLmRyYXdCdWZmZXJzV0VCR0woJywgQkFDS19CVUZGRVIsICcpOycpXG4gICAgfVxuICAgIHNjb3BlKFxuICAgICAgJ30nLFxuICAgICAgRlJBTUVCVUZGRVJfU1RBVEUsICcuY3VyPScsIE5FWFQsICc7JylcbiAgICBpZiAoIXNraXBDaGVjaykge1xuICAgICAgc2NvcGUoJ30nKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGVtaXRQb2xsU3RhdGUgKGVudiwgc2NvcGUsIGFyZ3MpIHtcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuXG4gICAgdmFyIEdMID0gc2hhcmVkLmdsXG5cbiAgICB2YXIgQ1VSUkVOVF9WQVJTID0gZW52LmN1cnJlbnRcbiAgICB2YXIgTkVYVF9WQVJTID0gZW52Lm5leHRcbiAgICB2YXIgQ1VSUkVOVF9TVEFURSA9IHNoYXJlZC5jdXJyZW50XG4gICAgdmFyIE5FWFRfU1RBVEUgPSBzaGFyZWQubmV4dFxuXG4gICAgdmFyIGJsb2NrID0gZW52LmNvbmQoQ1VSUkVOVF9TVEFURSwgJy5kaXJ0eScpXG5cbiAgICBHTF9TVEFURV9OQU1FUy5mb3JFYWNoKGZ1bmN0aW9uIChwcm9wKSB7XG4gICAgICB2YXIgcGFyYW0gPSBwcm9wTmFtZShwcm9wKVxuICAgICAgaWYgKHBhcmFtIGluIGFyZ3Muc3RhdGUpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG5cbiAgICAgIHZhciBORVhULCBDVVJSRU5UXG4gICAgICBpZiAocGFyYW0gaW4gTkVYVF9WQVJTKSB7XG4gICAgICAgIE5FWFQgPSBORVhUX1ZBUlNbcGFyYW1dXG4gICAgICAgIENVUlJFTlQgPSBDVVJSRU5UX1ZBUlNbcGFyYW1dXG4gICAgICAgIHZhciBwYXJ0cyA9IGxvb3AoY3VycmVudFN0YXRlW3BhcmFtXS5sZW5ndGgsIGZ1bmN0aW9uIChpKSB7XG4gICAgICAgICAgcmV0dXJuIGJsb2NrLmRlZihORVhULCAnWycsIGksICddJylcbiAgICAgICAgfSlcbiAgICAgICAgYmxvY2soZW52LmNvbmQocGFydHMubWFwKGZ1bmN0aW9uIChwLCBpKSB7XG4gICAgICAgICAgcmV0dXJuIHAgKyAnIT09JyArIENVUlJFTlQgKyAnWycgKyBpICsgJ10nXG4gICAgICAgIH0pLmpvaW4oJ3x8JykpXG4gICAgICAgICAgLnRoZW4oXG4gICAgICAgICAgICBHTCwgJy4nLCBHTF9WQVJJQUJMRVNbcGFyYW1dLCAnKCcsIHBhcnRzLCAnKTsnLFxuICAgICAgICAgICAgcGFydHMubWFwKGZ1bmN0aW9uIChwLCBpKSB7XG4gICAgICAgICAgICAgIHJldHVybiBDVVJSRU5UICsgJ1snICsgaSArICddPScgKyBwXG4gICAgICAgICAgICB9KS5qb2luKCc7JyksICc7JykpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBORVhUID0gYmxvY2suZGVmKE5FWFRfU1RBVEUsICcuJywgcGFyYW0pXG4gICAgICAgIHZhciBpZnRlID0gZW52LmNvbmQoTkVYVCwgJyE9PScsIENVUlJFTlRfU1RBVEUsICcuJywgcGFyYW0pXG4gICAgICAgIGJsb2NrKGlmdGUpXG4gICAgICAgIGlmIChwYXJhbSBpbiBHTF9GTEFHUykge1xuICAgICAgICAgIGlmdGUoXG4gICAgICAgICAgICBlbnYuY29uZChORVhUKVxuICAgICAgICAgICAgICAgIC50aGVuKEdMLCAnLmVuYWJsZSgnLCBHTF9GTEFHU1twYXJhbV0sICcpOycpXG4gICAgICAgICAgICAgICAgLmVsc2UoR0wsICcuZGlzYWJsZSgnLCBHTF9GTEFHU1twYXJhbV0sICcpOycpLFxuICAgICAgICAgICAgQ1VSUkVOVF9TVEFURSwgJy4nLCBwYXJhbSwgJz0nLCBORVhULCAnOycpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWZ0ZShcbiAgICAgICAgICAgIEdMLCAnLicsIEdMX1ZBUklBQkxFU1twYXJhbV0sICcoJywgTkVYVCwgJyk7JyxcbiAgICAgICAgICAgIENVUlJFTlRfU1RBVEUsICcuJywgcGFyYW0sICc9JywgTkVYVCwgJzsnKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSlcbiAgICBpZiAoT2JqZWN0LmtleXMoYXJncy5zdGF0ZSkubGVuZ3RoID09PSAwKSB7XG4gICAgICBibG9jayhDVVJSRU5UX1NUQVRFLCAnLmRpcnR5PWZhbHNlOycpXG4gICAgfVxuICAgIHNjb3BlKGJsb2NrKVxuICB9XG5cbiAgZnVuY3Rpb24gZW1pdFNldE9wdGlvbnMgKGVudiwgc2NvcGUsIG9wdGlvbnMsIGZpbHRlcikge1xuICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgdmFyIENVUlJFTlRfVkFSUyA9IGVudi5jdXJyZW50XG4gICAgdmFyIENVUlJFTlRfU1RBVEUgPSBzaGFyZWQuY3VycmVudFxuICAgIHZhciBHTCA9IHNoYXJlZC5nbFxuICAgIHNvcnRTdGF0ZShPYmplY3Qua2V5cyhvcHRpb25zKSkuZm9yRWFjaChmdW5jdGlvbiAocGFyYW0pIHtcbiAgICAgIHZhciBkZWZuID0gb3B0aW9uc1twYXJhbV1cbiAgICAgIGlmIChmaWx0ZXIgJiYgIWZpbHRlcihkZWZuKSkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIHZhciB2YXJpYWJsZSA9IGRlZm4uYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgICBpZiAoR0xfRkxBR1NbcGFyYW1dKSB7XG4gICAgICAgIHZhciBmbGFnID0gR0xfRkxBR1NbcGFyYW1dXG4gICAgICAgIGlmIChpc1N0YXRpYyhkZWZuKSkge1xuICAgICAgICAgIGlmICh2YXJpYWJsZSkge1xuICAgICAgICAgICAgc2NvcGUoR0wsICcuZW5hYmxlKCcsIGZsYWcsICcpOycpXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNjb3BlKEdMLCAnLmRpc2FibGUoJywgZmxhZywgJyk7JylcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc2NvcGUoZW52LmNvbmQodmFyaWFibGUpXG4gICAgICAgICAgICAudGhlbihHTCwgJy5lbmFibGUoJywgZmxhZywgJyk7JylcbiAgICAgICAgICAgIC5lbHNlKEdMLCAnLmRpc2FibGUoJywgZmxhZywgJyk7JykpXG4gICAgICAgIH1cbiAgICAgICAgc2NvcGUoQ1VSUkVOVF9TVEFURSwgJy4nLCBwYXJhbSwgJz0nLCB2YXJpYWJsZSwgJzsnKVxuICAgICAgfSBlbHNlIGlmIChpc0FycmF5TGlrZSh2YXJpYWJsZSkpIHtcbiAgICAgICAgdmFyIENVUlJFTlQgPSBDVVJSRU5UX1ZBUlNbcGFyYW1dXG4gICAgICAgIHNjb3BlKFxuICAgICAgICAgIEdMLCAnLicsIEdMX1ZBUklBQkxFU1twYXJhbV0sICcoJywgdmFyaWFibGUsICcpOycsXG4gICAgICAgICAgdmFyaWFibGUubWFwKGZ1bmN0aW9uICh2LCBpKSB7XG4gICAgICAgICAgICByZXR1cm4gQ1VSUkVOVCArICdbJyArIGkgKyAnXT0nICsgdlxuICAgICAgICAgIH0pLmpvaW4oJzsnKSwgJzsnKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2NvcGUoXG4gICAgICAgICAgR0wsICcuJywgR0xfVkFSSUFCTEVTW3BhcmFtXSwgJygnLCB2YXJpYWJsZSwgJyk7JyxcbiAgICAgICAgICBDVVJSRU5UX1NUQVRFLCAnLicsIHBhcmFtLCAnPScsIHZhcmlhYmxlLCAnOycpXG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGluamVjdEV4dGVuc2lvbnMgKGVudiwgc2NvcGUpIHtcbiAgICBpZiAoZXh0SW5zdGFuY2luZykge1xuICAgICAgZW52Lmluc3RhbmNpbmcgPSBzY29wZS5kZWYoXG4gICAgICAgIGVudi5zaGFyZWQuZXh0ZW5zaW9ucywgJy5hbmdsZV9pbnN0YW5jZWRfYXJyYXlzJylcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBlbWl0UHJvZmlsZSAoZW52LCBzY29wZSwgYXJncywgdXNlU2NvcGUsIGluY3JlbWVudENvdW50ZXIpIHtcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuICAgIHZhciBTVEFUUyA9IGVudi5zdGF0c1xuICAgIHZhciBDVVJSRU5UX1NUQVRFID0gc2hhcmVkLmN1cnJlbnRcbiAgICB2YXIgVElNRVIgPSBzaGFyZWQudGltZXJcbiAgICB2YXIgcHJvZmlsZUFyZyA9IGFyZ3MucHJvZmlsZVxuXG4gICAgZnVuY3Rpb24gcGVyZkNvdW50ZXIgKCkge1xuICAgICAgaWYgKHR5cGVvZiBwZXJmb3JtYW5jZSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgcmV0dXJuICdEYXRlLm5vdygpJ1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuICdwZXJmb3JtYW5jZS5ub3coKSdcbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgQ1BVX1NUQVJULCBRVUVSWV9DT1VOVEVSXG4gICAgZnVuY3Rpb24gZW1pdFByb2ZpbGVTdGFydCAoYmxvY2spIHtcbiAgICAgIENQVV9TVEFSVCA9IHNjb3BlLmRlZigpXG4gICAgICBibG9jayhDUFVfU1RBUlQsICc9JywgcGVyZkNvdW50ZXIoKSwgJzsnKVxuICAgICAgaWYgKHR5cGVvZiBpbmNyZW1lbnRDb3VudGVyID09PSAnc3RyaW5nJykge1xuICAgICAgICBibG9jayhTVEFUUywgJy5jb3VudCs9JywgaW5jcmVtZW50Q291bnRlciwgJzsnKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYmxvY2soU1RBVFMsICcuY291bnQrKzsnKVxuICAgICAgfVxuICAgICAgaWYgKHRpbWVyKSB7XG4gICAgICAgIGlmICh1c2VTY29wZSkge1xuICAgICAgICAgIFFVRVJZX0NPVU5URVIgPSBzY29wZS5kZWYoKVxuICAgICAgICAgIGJsb2NrKFFVRVJZX0NPVU5URVIsICc9JywgVElNRVIsICcuZ2V0TnVtUGVuZGluZ1F1ZXJpZXMoKTsnKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGJsb2NrKFRJTUVSLCAnLmJlZ2luUXVlcnkoJywgU1RBVFMsICcpOycpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBlbWl0UHJvZmlsZUVuZCAoYmxvY2spIHtcbiAgICAgIGJsb2NrKFNUQVRTLCAnLmNwdVRpbWUrPScsIHBlcmZDb3VudGVyKCksICctJywgQ1BVX1NUQVJULCAnOycpXG4gICAgICBpZiAodGltZXIpIHtcbiAgICAgICAgaWYgKHVzZVNjb3BlKSB7XG4gICAgICAgICAgYmxvY2soVElNRVIsICcucHVzaFNjb3BlU3RhdHMoJyxcbiAgICAgICAgICAgIFFVRVJZX0NPVU5URVIsICcsJyxcbiAgICAgICAgICAgIFRJTUVSLCAnLmdldE51bVBlbmRpbmdRdWVyaWVzKCksJyxcbiAgICAgICAgICAgIFNUQVRTLCAnKTsnKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGJsb2NrKFRJTUVSLCAnLmVuZFF1ZXJ5KCk7JylcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHNjb3BlUHJvZmlsZSAodmFsdWUpIHtcbiAgICAgIHZhciBwcmV2ID0gc2NvcGUuZGVmKENVUlJFTlRfU1RBVEUsICcucHJvZmlsZScpXG4gICAgICBzY29wZShDVVJSRU5UX1NUQVRFLCAnLnByb2ZpbGU9JywgdmFsdWUsICc7JylcbiAgICAgIHNjb3BlLmV4aXQoQ1VSUkVOVF9TVEFURSwgJy5wcm9maWxlPScsIHByZXYsICc7JylcbiAgICB9XG5cbiAgICB2YXIgVVNFX1BST0ZJTEVcbiAgICBpZiAocHJvZmlsZUFyZykge1xuICAgICAgaWYgKGlzU3RhdGljKHByb2ZpbGVBcmcpKSB7XG4gICAgICAgIGlmIChwcm9maWxlQXJnLmVuYWJsZSkge1xuICAgICAgICAgIGVtaXRQcm9maWxlU3RhcnQoc2NvcGUpXG4gICAgICAgICAgZW1pdFByb2ZpbGVFbmQoc2NvcGUuZXhpdClcbiAgICAgICAgICBzY29wZVByb2ZpbGUoJ3RydWUnKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHNjb3BlUHJvZmlsZSgnZmFsc2UnKVxuICAgICAgICB9XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgVVNFX1BST0ZJTEUgPSBwcm9maWxlQXJnLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgc2NvcGVQcm9maWxlKFVTRV9QUk9GSUxFKVxuICAgIH0gZWxzZSB7XG4gICAgICBVU0VfUFJPRklMRSA9IHNjb3BlLmRlZihDVVJSRU5UX1NUQVRFLCAnLnByb2ZpbGUnKVxuICAgIH1cblxuICAgIHZhciBzdGFydCA9IGVudi5ibG9jaygpXG4gICAgZW1pdFByb2ZpbGVTdGFydChzdGFydClcbiAgICBzY29wZSgnaWYoJywgVVNFX1BST0ZJTEUsICcpeycsIHN0YXJ0LCAnfScpXG4gICAgdmFyIGVuZCA9IGVudi5ibG9jaygpXG4gICAgZW1pdFByb2ZpbGVFbmQoZW5kKVxuICAgIHNjb3BlLmV4aXQoJ2lmKCcsIFVTRV9QUk9GSUxFLCAnKXsnLCBlbmQsICd9JylcbiAgfVxuXG4gIGZ1bmN0aW9uIGVtaXRBdHRyaWJ1dGVzIChlbnYsIHNjb3BlLCBhcmdzLCBhdHRyaWJ1dGVzLCBmaWx0ZXIpIHtcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuXG4gICAgZnVuY3Rpb24gdHlwZUxlbmd0aCAoeCkge1xuICAgICAgc3dpdGNoICh4KSB7XG4gICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDMjpcbiAgICAgICAgY2FzZSBHTF9JTlRfVkVDMjpcbiAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzI6XG4gICAgICAgICAgcmV0dXJuIDJcbiAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUMzOlxuICAgICAgICBjYXNlIEdMX0lOVF9WRUMzOlxuICAgICAgICBjYXNlIEdMX0JPT0xfVkVDMzpcbiAgICAgICAgICByZXR1cm4gM1xuICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzQ6XG4gICAgICAgIGNhc2UgR0xfSU5UX1ZFQzQ6XG4gICAgICAgIGNhc2UgR0xfQk9PTF9WRUM0OlxuICAgICAgICAgIHJldHVybiA0XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgcmV0dXJuIDFcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBlbWl0QmluZEF0dHJpYnV0ZSAoQVRUUklCVVRFLCBzaXplLCByZWNvcmQpIHtcbiAgICAgIHZhciBHTCA9IHNoYXJlZC5nbFxuXG4gICAgICB2YXIgTE9DQVRJT04gPSBzY29wZS5kZWYoQVRUUklCVVRFLCAnLmxvY2F0aW9uJylcbiAgICAgIHZhciBCSU5ESU5HID0gc2NvcGUuZGVmKHNoYXJlZC5hdHRyaWJ1dGVzLCAnWycsIExPQ0FUSU9OLCAnXScpXG5cbiAgICAgIHZhciBTVEFURSA9IHJlY29yZC5zdGF0ZVxuICAgICAgdmFyIEJVRkZFUiA9IHJlY29yZC5idWZmZXJcbiAgICAgIHZhciBDT05TVF9DT01QT05FTlRTID0gW1xuICAgICAgICByZWNvcmQueCxcbiAgICAgICAgcmVjb3JkLnksXG4gICAgICAgIHJlY29yZC56LFxuICAgICAgICByZWNvcmQud1xuICAgICAgXVxuXG4gICAgICB2YXIgQ09NTU9OX0tFWVMgPSBbXG4gICAgICAgICdidWZmZXInLFxuICAgICAgICAnbm9ybWFsaXplZCcsXG4gICAgICAgICdvZmZzZXQnLFxuICAgICAgICAnc3RyaWRlJ1xuICAgICAgXVxuXG4gICAgICBmdW5jdGlvbiBlbWl0QnVmZmVyICgpIHtcbiAgICAgICAgc2NvcGUoXG4gICAgICAgICAgJ2lmKCEnLCBCSU5ESU5HLCAnLmJ1ZmZlcil7JyxcbiAgICAgICAgICBHTCwgJy5lbmFibGVWZXJ0ZXhBdHRyaWJBcnJheSgnLCBMT0NBVElPTiwgJyk7fScpXG5cbiAgICAgICAgdmFyIFRZUEUgPSByZWNvcmQudHlwZVxuICAgICAgICB2YXIgU0laRVxuICAgICAgICBpZiAoIXJlY29yZC5zaXplKSB7XG4gICAgICAgICAgU0laRSA9IHNpemVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBTSVpFID0gc2NvcGUuZGVmKHJlY29yZC5zaXplLCAnfHwnLCBzaXplKVxuICAgICAgICB9XG5cbiAgICAgICAgc2NvcGUoJ2lmKCcsXG4gICAgICAgICAgQklORElORywgJy50eXBlIT09JywgVFlQRSwgJ3x8JyxcbiAgICAgICAgICBCSU5ESU5HLCAnLnNpemUhPT0nLCBTSVpFLCAnfHwnLFxuICAgICAgICAgIENPTU1PTl9LRVlTLm1hcChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgICAgICByZXR1cm4gQklORElORyArICcuJyArIGtleSArICchPT0nICsgcmVjb3JkW2tleV1cbiAgICAgICAgICB9KS5qb2luKCd8fCcpLFxuICAgICAgICAgICcpeycsXG4gICAgICAgICAgR0wsICcuYmluZEJ1ZmZlcignLCBHTF9BUlJBWV9CVUZGRVIsICcsJywgQlVGRkVSLCAnLmJ1ZmZlcik7JyxcbiAgICAgICAgICBHTCwgJy52ZXJ0ZXhBdHRyaWJQb2ludGVyKCcsIFtcbiAgICAgICAgICAgIExPQ0FUSU9OLFxuICAgICAgICAgICAgU0laRSxcbiAgICAgICAgICAgIFRZUEUsXG4gICAgICAgICAgICByZWNvcmQubm9ybWFsaXplZCxcbiAgICAgICAgICAgIHJlY29yZC5zdHJpZGUsXG4gICAgICAgICAgICByZWNvcmQub2Zmc2V0XG4gICAgICAgICAgXSwgJyk7JyxcbiAgICAgICAgICBCSU5ESU5HLCAnLnR5cGU9JywgVFlQRSwgJzsnLFxuICAgICAgICAgIEJJTkRJTkcsICcuc2l6ZT0nLCBTSVpFLCAnOycsXG4gICAgICAgICAgQ09NTU9OX0tFWVMubWFwKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgICAgIHJldHVybiBCSU5ESU5HICsgJy4nICsga2V5ICsgJz0nICsgcmVjb3JkW2tleV0gKyAnOydcbiAgICAgICAgICB9KS5qb2luKCcnKSxcbiAgICAgICAgICAnfScpXG5cbiAgICAgICAgaWYgKGV4dEluc3RhbmNpbmcpIHtcbiAgICAgICAgICB2YXIgRElWSVNPUiA9IHJlY29yZC5kaXZpc29yXG4gICAgICAgICAgc2NvcGUoXG4gICAgICAgICAgICAnaWYoJywgQklORElORywgJy5kaXZpc29yIT09JywgRElWSVNPUiwgJyl7JyxcbiAgICAgICAgICAgIGVudi5pbnN0YW5jaW5nLCAnLnZlcnRleEF0dHJpYkRpdmlzb3JBTkdMRSgnLCBbTE9DQVRJT04sIERJVklTT1JdLCAnKTsnLFxuICAgICAgICAgICAgQklORElORywgJy5kaXZpc29yPScsIERJVklTT1IsICc7fScpXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgZnVuY3Rpb24gZW1pdENvbnN0YW50ICgpIHtcbiAgICAgICAgc2NvcGUoXG4gICAgICAgICAgJ2lmKCcsIEJJTkRJTkcsICcuYnVmZmVyKXsnLFxuICAgICAgICAgIEdMLCAnLmRpc2FibGVWZXJ0ZXhBdHRyaWJBcnJheSgnLCBMT0NBVElPTiwgJyk7JyxcbiAgICAgICAgICAnfWlmKCcsIENVVEVfQ09NUE9ORU5UUy5tYXAoZnVuY3Rpb24gKGMsIGkpIHtcbiAgICAgICAgICAgIHJldHVybiBCSU5ESU5HICsgJy4nICsgYyArICchPT0nICsgQ09OU1RfQ09NUE9ORU5UU1tpXVxuICAgICAgICAgIH0pLmpvaW4oJ3x8JyksICcpeycsXG4gICAgICAgICAgR0wsICcudmVydGV4QXR0cmliNGYoJywgTE9DQVRJT04sICcsJywgQ09OU1RfQ09NUE9ORU5UUywgJyk7JyxcbiAgICAgICAgICBDVVRFX0NPTVBPTkVOVFMubWFwKGZ1bmN0aW9uIChjLCBpKSB7XG4gICAgICAgICAgICByZXR1cm4gQklORElORyArICcuJyArIGMgKyAnPScgKyBDT05TVF9DT01QT05FTlRTW2ldICsgJzsnXG4gICAgICAgICAgfSkuam9pbignJyksXG4gICAgICAgICAgJ30nKVxuICAgICAgfVxuXG4gICAgICBpZiAoU1RBVEUgPT09IEFUVFJJQl9TVEFURV9QT0lOVEVSKSB7XG4gICAgICAgIGVtaXRCdWZmZXIoKVxuICAgICAgfSBlbHNlIGlmIChTVEFURSA9PT0gQVRUUklCX1NUQVRFX0NPTlNUQU5UKSB7XG4gICAgICAgIGVtaXRDb25zdGFudCgpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzY29wZSgnaWYoJywgU1RBVEUsICc9PT0nLCBBVFRSSUJfU1RBVEVfUE9JTlRFUiwgJyl7JylcbiAgICAgICAgZW1pdEJ1ZmZlcigpXG4gICAgICAgIHNjb3BlKCd9ZWxzZXsnKVxuICAgICAgICBlbWl0Q29uc3RhbnQoKVxuICAgICAgICBzY29wZSgnfScpXG4gICAgICB9XG4gICAgfVxuXG4gICAgYXR0cmlidXRlcy5mb3JFYWNoKGZ1bmN0aW9uIChhdHRyaWJ1dGUpIHtcbiAgICAgIHZhciBuYW1lID0gYXR0cmlidXRlLm5hbWVcbiAgICAgIHZhciBhcmcgPSBhcmdzLmF0dHJpYnV0ZXNbbmFtZV1cbiAgICAgIHZhciByZWNvcmRcbiAgICAgIGlmIChhcmcpIHtcbiAgICAgICAgaWYgKCFmaWx0ZXIoYXJnKSkge1xuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG4gICAgICAgIHJlY29yZCA9IGFyZy5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmICghZmlsdGVyKFNDT1BFX0RFQ0wpKSB7XG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cbiAgICAgICAgdmFyIHNjb3BlQXR0cmliID0gZW52LnNjb3BlQXR0cmliKG5hbWUpXG4gICAgICAgIFxuICAgICAgICByZWNvcmQgPSB7fVxuICAgICAgICBPYmplY3Qua2V5cyhuZXcgQXR0cmlidXRlUmVjb3JkKCkpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgICAgIHJlY29yZFtrZXldID0gc2NvcGUuZGVmKHNjb3BlQXR0cmliLCAnLicsIGtleSlcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICAgIGVtaXRCaW5kQXR0cmlidXRlKFxuICAgICAgICBlbnYubGluayhhdHRyaWJ1dGUpLCB0eXBlTGVuZ3RoKGF0dHJpYnV0ZS5pbmZvLnR5cGUpLCByZWNvcmQpXG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGVtaXRVbmlmb3JtcyAoZW52LCBzY29wZSwgYXJncywgdW5pZm9ybXMsIGZpbHRlcikge1xuICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgdmFyIEdMID0gc2hhcmVkLmdsXG5cbiAgICB2YXIgaW5maXhcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHVuaWZvcm1zLmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgdW5pZm9ybSA9IHVuaWZvcm1zW2ldXG4gICAgICB2YXIgbmFtZSA9IHVuaWZvcm0ubmFtZVxuICAgICAgdmFyIHR5cGUgPSB1bmlmb3JtLmluZm8udHlwZVxuICAgICAgdmFyIGFyZyA9IGFyZ3MudW5pZm9ybXNbbmFtZV1cbiAgICAgIHZhciBVTklGT1JNID0gZW52LmxpbmsodW5pZm9ybSlcbiAgICAgIHZhciBMT0NBVElPTiA9IFVOSUZPUk0gKyAnLmxvY2F0aW9uJ1xuXG4gICAgICB2YXIgVkFMVUVcbiAgICAgIGlmIChhcmcpIHtcbiAgICAgICAgaWYgKCFmaWx0ZXIoYXJnKSkge1xuICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgIH1cbiAgICAgICAgaWYgKGlzU3RhdGljKGFyZykpIHtcbiAgICAgICAgICB2YXIgdmFsdWUgPSBhcmcudmFsdWVcbiAgICAgICAgICBcbiAgICAgICAgICBpZiAodHlwZSA9PT0gR0xfU0FNUExFUl8yRCB8fCB0eXBlID09PSBHTF9TQU1QTEVSX0NVQkUpIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdmFyIFRFWF9WQUxVRSA9IGVudi5saW5rKHZhbHVlLl90ZXh0dXJlIHx8IHZhbHVlLmNvbG9yWzBdLl90ZXh0dXJlKVxuICAgICAgICAgICAgc2NvcGUoR0wsICcudW5pZm9ybTFpKCcsIExPQ0FUSU9OLCAnLCcsIFRFWF9WQUxVRSArICcuYmluZCgpKTsnKVxuICAgICAgICAgICAgc2NvcGUuZXhpdChURVhfVkFMVUUsICcudW5iaW5kKCk7JylcbiAgICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgICAgdHlwZSA9PT0gR0xfRkxPQVRfTUFUMiB8fFxuICAgICAgICAgICAgdHlwZSA9PT0gR0xfRkxPQVRfTUFUMyB8fFxuICAgICAgICAgICAgdHlwZSA9PT0gR0xfRkxPQVRfTUFUNCkge1xuICAgICAgICAgICAgXG4gICAgICAgICAgICB2YXIgTUFUX1ZBTFVFID0gZW52Lmdsb2JhbC5kZWYoJ25ldyBGbG9hdDMyQXJyYXkoWycgK1xuICAgICAgICAgICAgICBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbCh2YWx1ZSkgKyAnXSknKVxuICAgICAgICAgICAgdmFyIGRpbSA9IDJcbiAgICAgICAgICAgIGlmICh0eXBlID09PSBHTF9GTE9BVF9NQVQzKSB7XG4gICAgICAgICAgICAgIGRpbSA9IDNcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gR0xfRkxPQVRfTUFUNCkge1xuICAgICAgICAgICAgICBkaW0gPSA0XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzY29wZShcbiAgICAgICAgICAgICAgR0wsICcudW5pZm9ybU1hdHJpeCcsIGRpbSwgJ2Z2KCcsXG4gICAgICAgICAgICAgIExPQ0FUSU9OLCAnLGZhbHNlLCcsIE1BVF9WQUxVRSwgJyk7JylcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICAgICAgICAgIGNhc2UgR0xfRkxPQVQ6XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaW5maXggPSAnMWYnXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUMyOlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGluZml4ID0gJzJmJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDMzpcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICczZidcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzQ6XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaW5maXggPSAnNGYnXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9CT09MOlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGluZml4ID0gJzFpJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfSU5UOlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGluZml4ID0gJzFpJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfQk9PTF9WRUMyOlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGluZml4ID0gJzJpJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfSU5UX1ZFQzI6XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaW5maXggPSAnMmknXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzM6XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaW5maXggPSAnM2knXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9JTlRfVkVDMzpcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICczaSdcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0JPT0xfVkVDNDpcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICc0aSdcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0lOVF9WRUM0OlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGluZml4ID0gJzRpJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzY29wZShHTCwgJy51bmlmb3JtJywgaW5maXgsICcoJywgTE9DQVRJT04sICcsJyxcbiAgICAgICAgICAgICAgaXNBcnJheUxpa2UodmFsdWUpID8gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwodmFsdWUpIDogdmFsdWUsXG4gICAgICAgICAgICAgICcpOycpXG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgVkFMVUUgPSBhcmcuYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmICghZmlsdGVyKFNDT1BFX0RFQ0wpKSB7XG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfVxuICAgICAgICBWQUxVRSA9IHNjb3BlLmRlZihzaGFyZWQudW5pZm9ybXMsICdbJywgc3RyaW5nU3RvcmUuaWQobmFtZSksICddJylcbiAgICAgIH1cblxuICAgICAgaWYgKHR5cGUgPT09IEdMX1NBTVBMRVJfMkQpIHtcbiAgICAgICAgc2NvcGUoXG4gICAgICAgICAgJ2lmKCcsIFZBTFVFLCAnJiYnLCBWQUxVRSwgJy5fcmVnbFR5cGU9PT1cImZyYW1lYnVmZmVyXCIpeycsXG4gICAgICAgICAgVkFMVUUsICc9JywgVkFMVUUsICcuY29sb3JbMF07JyxcbiAgICAgICAgICAnfScpXG4gICAgICB9IGVsc2UgaWYgKHR5cGUgPT09IEdMX1NBTVBMRVJfQ1VCRSkge1xuICAgICAgICBzY29wZShcbiAgICAgICAgICAnaWYoJywgVkFMVUUsICcmJicsIFZBTFVFLCAnLl9yZWdsVHlwZT09PVwiZnJhbWVidWZmZXJDdWJlXCIpeycsXG4gICAgICAgICAgVkFMVUUsICc9JywgVkFMVUUsICcuY29sb3JbMF07JyxcbiAgICAgICAgICAnfScpXG4gICAgICB9XG5cbiAgICAgIC8vIHBlcmZvcm0gdHlwZSB2YWxpZGF0aW9uXG4gICAgICBcblxuICAgICAgdmFyIHVucm9sbCA9IDFcbiAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICBjYXNlIEdMX1NBTVBMRVJfMkQ6XG4gICAgICAgIGNhc2UgR0xfU0FNUExFUl9DVUJFOlxuICAgICAgICAgIHZhciBURVggPSBzY29wZS5kZWYoVkFMVUUsICcuX3RleHR1cmUnKVxuICAgICAgICAgIHNjb3BlKEdMLCAnLnVuaWZvcm0xaSgnLCBMT0NBVElPTiwgJywnLCBURVgsICcuYmluZCgpKTsnKVxuICAgICAgICAgIHNjb3BlLmV4aXQoVEVYLCAnLnVuYmluZCgpOycpXG4gICAgICAgICAgY29udGludWVcblxuICAgICAgICBjYXNlIEdMX0lOVDpcbiAgICAgICAgY2FzZSBHTF9CT09MOlxuICAgICAgICAgIGluZml4ID0gJzFpJ1xuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9JTlRfVkVDMjpcbiAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzI6XG4gICAgICAgICAgaW5maXggPSAnMmknXG4gICAgICAgICAgdW5yb2xsID0gMlxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9JTlRfVkVDMzpcbiAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzM6XG4gICAgICAgICAgaW5maXggPSAnM2knXG4gICAgICAgICAgdW5yb2xsID0gM1xuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9JTlRfVkVDNDpcbiAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzQ6XG4gICAgICAgICAgaW5maXggPSAnNGknXG4gICAgICAgICAgdW5yb2xsID0gNFxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9GTE9BVDpcbiAgICAgICAgICBpbmZpeCA9ICcxZidcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDMjpcbiAgICAgICAgICBpbmZpeCA9ICcyZidcbiAgICAgICAgICB1bnJvbGwgPSAyXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzM6XG4gICAgICAgICAgaW5maXggPSAnM2YnXG4gICAgICAgICAgdW5yb2xsID0gM1xuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUM0OlxuICAgICAgICAgIGluZml4ID0gJzRmJ1xuICAgICAgICAgIHVucm9sbCA9IDRcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfRkxPQVRfTUFUMjpcbiAgICAgICAgICBpbmZpeCA9ICdNYXRyaXgyZnYnXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0ZMT0FUX01BVDM6XG4gICAgICAgICAgaW5maXggPSAnTWF0cml4M2Z2J1xuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9GTE9BVF9NQVQ0OlxuICAgICAgICAgIGluZml4ID0gJ01hdHJpeDRmdidcbiAgICAgICAgICBicmVha1xuICAgICAgfVxuXG4gICAgICBzY29wZShHTCwgJy51bmlmb3JtJywgaW5maXgsICcoJywgTE9DQVRJT04sICcsJylcbiAgICAgIGlmIChpbmZpeC5jaGFyQXQoMCkgPT09ICdNJykge1xuICAgICAgICB2YXIgbWF0U2l6ZSA9IE1hdGgucG93KHR5cGUgLSBHTF9GTE9BVF9NQVQyICsgMiwgMilcbiAgICAgICAgdmFyIFNUT1JBR0UgPSBlbnYuZ2xvYmFsLmRlZignbmV3IEZsb2F0MzJBcnJheSgnLCBtYXRTaXplLCAnKScpXG4gICAgICAgIHNjb3BlKFxuICAgICAgICAgICdmYWxzZSwoQXJyYXkuaXNBcnJheSgnLCBWQUxVRSwgJyl8fCcsIFZBTFVFLCAnIGluc3RhbmNlb2YgRmxvYXQzMkFycmF5KT8nLCBWQUxVRSwgJzooJyxcbiAgICAgICAgICBsb29wKG1hdFNpemUsIGZ1bmN0aW9uIChpKSB7XG4gICAgICAgICAgICByZXR1cm4gU1RPUkFHRSArICdbJyArIGkgKyAnXT0nICsgVkFMVUUgKyAnWycgKyBpICsgJ10nXG4gICAgICAgICAgfSksICcsJywgU1RPUkFHRSwgJyknKVxuICAgICAgfSBlbHNlIGlmICh1bnJvbGwgPiAxKSB7XG4gICAgICAgIHNjb3BlKGxvb3AodW5yb2xsLCBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgIHJldHVybiBWQUxVRSArICdbJyArIGkgKyAnXSdcbiAgICAgICAgfSkpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzY29wZShWQUxVRSlcbiAgICAgIH1cbiAgICAgIHNjb3BlKCcpOycpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZW1pdERyYXcgKGVudiwgb3V0ZXIsIGlubmVyLCBhcmdzKSB7XG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcbiAgICB2YXIgR0wgPSBzaGFyZWQuZ2xcbiAgICB2YXIgRFJBV19TVEFURSA9IHNoYXJlZC5kcmF3XG5cbiAgICB2YXIgZHJhd09wdGlvbnMgPSBhcmdzLmRyYXdcblxuICAgIGZ1bmN0aW9uIGVtaXRFbGVtZW50cyAoKSB7XG4gICAgICB2YXIgZGVmbiA9IGRyYXdPcHRpb25zLmVsZW1lbnRzXG4gICAgICB2YXIgRUxFTUVOVFNcbiAgICAgIHZhciBzY29wZSA9IG91dGVyXG4gICAgICBpZiAoZGVmbikge1xuICAgICAgICBpZiAoKGRlZm4uY29udGV4dERlcCAmJiBhcmdzLmNvbnRleHREeW5hbWljKSB8fCBkZWZuLnByb3BEZXApIHtcbiAgICAgICAgICBzY29wZSA9IGlubmVyXG4gICAgICAgIH1cbiAgICAgICAgRUxFTUVOVFMgPSBkZWZuLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgRUxFTUVOVFMgPSBzY29wZS5kZWYoRFJBV19TVEFURSwgJy4nLCBTX0VMRU1FTlRTKVxuICAgICAgfVxuICAgICAgaWYgKEVMRU1FTlRTKSB7XG4gICAgICAgIHNjb3BlKFxuICAgICAgICAgICdpZignICsgRUxFTUVOVFMgKyAnKScgK1xuICAgICAgICAgIEdMICsgJy5iaW5kQnVmZmVyKCcgKyBHTF9FTEVNRU5UX0FSUkFZX0JVRkZFUiArICcsJyArIEVMRU1FTlRTICsgJy5idWZmZXIuYnVmZmVyKTsnKVxuICAgICAgfVxuICAgICAgcmV0dXJuIEVMRU1FTlRTXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZW1pdENvdW50ICgpIHtcbiAgICAgIHZhciBkZWZuID0gZHJhd09wdGlvbnMuY291bnRcbiAgICAgIHZhciBDT1VOVFxuICAgICAgdmFyIHNjb3BlID0gb3V0ZXJcbiAgICAgIGlmIChkZWZuKSB7XG4gICAgICAgIGlmICgoZGVmbi5jb250ZXh0RGVwICYmIGFyZ3MuY29udGV4dER5bmFtaWMpIHx8IGRlZm4ucHJvcERlcCkge1xuICAgICAgICAgIHNjb3BlID0gaW5uZXJcbiAgICAgICAgfVxuICAgICAgICBDT1VOVCA9IGRlZm4uYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgICAgIFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgQ09VTlQgPSBzY29wZS5kZWYoRFJBV19TVEFURSwgJy4nLCBTX0NPVU5UKVxuICAgICAgICBcbiAgICAgIH1cbiAgICAgIHJldHVybiBDT1VOVFxuICAgIH1cblxuICAgIHZhciBFTEVNRU5UUyA9IGVtaXRFbGVtZW50cygpXG4gICAgZnVuY3Rpb24gZW1pdFZhbHVlIChuYW1lKSB7XG4gICAgICB2YXIgZGVmbiA9IGRyYXdPcHRpb25zW25hbWVdXG4gICAgICBpZiAoZGVmbikge1xuICAgICAgICBpZiAoKGRlZm4uY29udGV4dERlcCAmJiBhcmdzLmNvbnRleHREeW5hbWljKSB8fCBkZWZuLnByb3BEZXApIHtcbiAgICAgICAgICByZXR1cm4gZGVmbi5hcHBlbmQoZW52LCBpbm5lcilcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gZGVmbi5hcHBlbmQoZW52LCBvdXRlcilcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIG91dGVyLmRlZihEUkFXX1NUQVRFLCAnLicsIG5hbWUpXG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFyIFBSSU1JVElWRSA9IGVtaXRWYWx1ZShTX1BSSU1JVElWRSlcbiAgICB2YXIgT0ZGU0VUID0gZW1pdFZhbHVlKFNfT0ZGU0VUKVxuXG4gICAgdmFyIENPVU5UID0gZW1pdENvdW50KClcbiAgICBpZiAodHlwZW9mIENPVU5UID09PSAnbnVtYmVyJykge1xuICAgICAgaWYgKENPVU5UID09PSAwKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBpbm5lcignaWYoJywgQ09VTlQsICcpeycpXG4gICAgICBpbm5lci5leGl0KCd9JylcbiAgICB9XG5cbiAgICB2YXIgSU5TVEFOQ0VTLCBFWFRfSU5TVEFOQ0lOR1xuICAgIGlmIChleHRJbnN0YW5jaW5nKSB7XG4gICAgICBJTlNUQU5DRVMgPSBlbWl0VmFsdWUoU19JTlNUQU5DRVMpXG4gICAgICBFWFRfSU5TVEFOQ0lORyA9IGVudi5pbnN0YW5jaW5nXG4gICAgfVxuXG4gICAgdmFyIEVMRU1FTlRfVFlQRSA9IEVMRU1FTlRTICsgJy50eXBlJ1xuXG4gICAgdmFyIGVsZW1lbnRzU3RhdGljID0gZHJhd09wdGlvbnMuZWxlbWVudHMgJiYgaXNTdGF0aWMoZHJhd09wdGlvbnMuZWxlbWVudHMpXG5cbiAgICBmdW5jdGlvbiBlbWl0SW5zdGFuY2luZyAoKSB7XG4gICAgICBmdW5jdGlvbiBkcmF3RWxlbWVudHMgKCkge1xuICAgICAgICBpbm5lcihFWFRfSU5TVEFOQ0lORywgJy5kcmF3RWxlbWVudHNJbnN0YW5jZWRBTkdMRSgnLCBbXG4gICAgICAgICAgUFJJTUlUSVZFLFxuICAgICAgICAgIENPVU5ULFxuICAgICAgICAgIEVMRU1FTlRfVFlQRSxcbiAgICAgICAgICBPRkZTRVQgKyAnPDwoKCcgKyBFTEVNRU5UX1RZUEUgKyAnLScgKyBHTF9VTlNJR05FRF9CWVRFICsgJyk+PjEpJyxcbiAgICAgICAgICBJTlNUQU5DRVNcbiAgICAgICAgXSwgJyk7JylcbiAgICAgIH1cblxuICAgICAgZnVuY3Rpb24gZHJhd0FycmF5cyAoKSB7XG4gICAgICAgIGlubmVyKEVYVF9JTlNUQU5DSU5HLCAnLmRyYXdBcnJheXNJbnN0YW5jZWRBTkdMRSgnLFxuICAgICAgICAgIFtQUklNSVRJVkUsIE9GRlNFVCwgQ09VTlQsIElOU1RBTkNFU10sICcpOycpXG4gICAgICB9XG5cbiAgICAgIGlmIChFTEVNRU5UUykge1xuICAgICAgICBpZiAoIWVsZW1lbnRzU3RhdGljKSB7XG4gICAgICAgICAgaW5uZXIoJ2lmKCcsIEVMRU1FTlRTLCAnKXsnKVxuICAgICAgICAgIGRyYXdFbGVtZW50cygpXG4gICAgICAgICAgaW5uZXIoJ31lbHNleycpXG4gICAgICAgICAgZHJhd0FycmF5cygpXG4gICAgICAgICAgaW5uZXIoJ30nKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGRyYXdFbGVtZW50cygpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRyYXdBcnJheXMoKVxuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGVtaXRSZWd1bGFyICgpIHtcbiAgICAgIGZ1bmN0aW9uIGRyYXdFbGVtZW50cyAoKSB7XG4gICAgICAgIGlubmVyKEdMICsgJy5kcmF3RWxlbWVudHMoJyArIFtcbiAgICAgICAgICBQUklNSVRJVkUsXG4gICAgICAgICAgQ09VTlQsXG4gICAgICAgICAgRUxFTUVOVF9UWVBFLFxuICAgICAgICAgIE9GRlNFVCArICc8PCgoJyArIEVMRU1FTlRfVFlQRSArICctJyArIEdMX1VOU0lHTkVEX0JZVEUgKyAnKT4+MSknXG4gICAgICAgIF0gKyAnKTsnKVxuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBkcmF3QXJyYXlzICgpIHtcbiAgICAgICAgaW5uZXIoR0wgKyAnLmRyYXdBcnJheXMoJyArIFtQUklNSVRJVkUsIE9GRlNFVCwgQ09VTlRdICsgJyk7JylcbiAgICAgIH1cblxuICAgICAgaWYgKEVMRU1FTlRTKSB7XG4gICAgICAgIGlmICghZWxlbWVudHNTdGF0aWMpIHtcbiAgICAgICAgICBpbm5lcignaWYoJywgRUxFTUVOVFMsICcpeycpXG4gICAgICAgICAgZHJhd0VsZW1lbnRzKClcbiAgICAgICAgICBpbm5lcignfWVsc2V7JylcbiAgICAgICAgICBkcmF3QXJyYXlzKClcbiAgICAgICAgICBpbm5lcignfScpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZHJhd0VsZW1lbnRzKClcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZHJhd0FycmF5cygpXG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGV4dEluc3RhbmNpbmcgJiYgKHR5cGVvZiBJTlNUQU5DRVMgIT09ICdudW1iZXInIHx8IElOU1RBTkNFUyA+PSAwKSkge1xuICAgICAgaWYgKHR5cGVvZiBJTlNUQU5DRVMgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGlubmVyKCdpZignLCBJTlNUQU5DRVMsICc+MCl7JylcbiAgICAgICAgZW1pdEluc3RhbmNpbmcoKVxuICAgICAgICBpbm5lcignfWVsc2UgaWYoJywgSU5TVEFOQ0VTLCAnPDApeycpXG4gICAgICAgIGVtaXRSZWd1bGFyKClcbiAgICAgICAgaW5uZXIoJ30nKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZW1pdEluc3RhbmNpbmcoKVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBlbWl0UmVndWxhcigpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlQm9keSAoZW1pdEJvZHksIHBhcmVudEVudiwgYXJncywgcHJvZ3JhbSwgY291bnQpIHtcbiAgICB2YXIgZW52ID0gY3JlYXRlUkVHTEVudmlyb25tZW50KClcbiAgICB2YXIgc2NvcGUgPSBlbnYucHJvYygnYm9keScsIGNvdW50KVxuICAgIFxuICAgIGlmIChleHRJbnN0YW5jaW5nKSB7XG4gICAgICBlbnYuaW5zdGFuY2luZyA9IHNjb3BlLmRlZihcbiAgICAgICAgZW52LnNoYXJlZC5leHRlbnNpb25zLCAnLmFuZ2xlX2luc3RhbmNlZF9hcnJheXMnKVxuICAgIH1cbiAgICBlbWl0Qm9keShlbnYsIHNjb3BlLCBhcmdzLCBwcm9ncmFtKVxuICAgIHJldHVybiBlbnYuY29tcGlsZSgpLmJvZHlcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gRFJBVyBQUk9DXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgZnVuY3Rpb24gZW1pdERyYXdCb2R5IChlbnYsIGRyYXcsIGFyZ3MsIHByb2dyYW0pIHtcbiAgICBpbmplY3RFeHRlbnNpb25zKGVudiwgZHJhdylcbiAgICBlbWl0QXR0cmlidXRlcyhlbnYsIGRyYXcsIGFyZ3MsIHByb2dyYW0uYXR0cmlidXRlcywgZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIHRydWVcbiAgICB9KVxuICAgIGVtaXRVbmlmb3JtcyhlbnYsIGRyYXcsIGFyZ3MsIHByb2dyYW0udW5pZm9ybXMsIGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiB0cnVlXG4gICAgfSlcbiAgICBlbWl0RHJhdyhlbnYsIGRyYXcsIGRyYXcsIGFyZ3MpXG4gIH1cblxuICBmdW5jdGlvbiBlbWl0RHJhd1Byb2MgKGVudiwgYXJncykge1xuICAgIHZhciBkcmF3ID0gZW52LnByb2MoJ2RyYXcnLCAxKVxuXG4gICAgaW5qZWN0RXh0ZW5zaW9ucyhlbnYsIGRyYXcpXG5cbiAgICBlbWl0Q29udGV4dChlbnYsIGRyYXcsIGFyZ3MuY29udGV4dClcbiAgICBlbWl0UG9sbEZyYW1lYnVmZmVyKGVudiwgZHJhdywgYXJncy5mcmFtZWJ1ZmZlcilcblxuICAgIGVtaXRQb2xsU3RhdGUoZW52LCBkcmF3LCBhcmdzKVxuICAgIGVtaXRTZXRPcHRpb25zKGVudiwgZHJhdywgYXJncy5zdGF0ZSlcblxuICAgIGVtaXRQcm9maWxlKGVudiwgZHJhdywgYXJncywgZmFsc2UsIHRydWUpXG5cbiAgICB2YXIgcHJvZ3JhbSA9IGFyZ3Muc2hhZGVyLnByb2dWYXIuYXBwZW5kKGVudiwgZHJhdylcbiAgICBkcmF3KGVudi5zaGFyZWQuZ2wsICcudXNlUHJvZ3JhbSgnLCBwcm9ncmFtLCAnLnByb2dyYW0pOycpXG5cbiAgICBpZiAoYXJncy5zaGFkZXIucHJvZ3JhbSkge1xuICAgICAgZW1pdERyYXdCb2R5KGVudiwgZHJhdywgYXJncywgYXJncy5zaGFkZXIucHJvZ3JhbSlcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGRyYXdDYWNoZSA9IGVudi5nbG9iYWwuZGVmKCd7fScpXG4gICAgICB2YXIgUFJPR19JRCA9IGRyYXcuZGVmKHByb2dyYW0sICcuaWQnKVxuICAgICAgdmFyIENBQ0hFRF9QUk9DID0gZHJhdy5kZWYoZHJhd0NhY2hlLCAnWycsIFBST0dfSUQsICddJylcbiAgICAgIGRyYXcoXG4gICAgICAgIGVudi5jb25kKENBQ0hFRF9QUk9DKVxuICAgICAgICAgIC50aGVuKENBQ0hFRF9QUk9DLCAnLmNhbGwodGhpcyxhMCk7JylcbiAgICAgICAgICAuZWxzZShcbiAgICAgICAgICAgIENBQ0hFRF9QUk9DLCAnPScsIGRyYXdDYWNoZSwgJ1snLCBQUk9HX0lELCAnXT0nLFxuICAgICAgICAgICAgZW52LmxpbmsoZnVuY3Rpb24gKHByb2dyYW0pIHtcbiAgICAgICAgICAgICAgcmV0dXJuIGNyZWF0ZUJvZHkoZW1pdERyYXdCb2R5LCBlbnYsIGFyZ3MsIHByb2dyYW0sIDEpXG4gICAgICAgICAgICB9KSwgJygnLCBwcm9ncmFtLCAnKTsnLFxuICAgICAgICAgICAgQ0FDSEVEX1BST0MsICcuY2FsbCh0aGlzLGEwKTsnKSlcbiAgICB9XG5cbiAgICBpZiAoT2JqZWN0LmtleXMoYXJncy5zdGF0ZSkubGVuZ3RoID4gMCkge1xuICAgICAgZHJhdyhlbnYuc2hhcmVkLmN1cnJlbnQsICcuZGlydHk9dHJ1ZTsnKVxuICAgIH1cbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gQkFUQ0ggUFJPQ1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgZnVuY3Rpb24gZW1pdEJhdGNoRHluYW1pY1NoYWRlckJvZHkgKGVudiwgc2NvcGUsIGFyZ3MsIHByb2dyYW0pIHtcbiAgICBlbnYuYmF0Y2hJZCA9ICdhMSdcblxuICAgIGluamVjdEV4dGVuc2lvbnMoZW52LCBzY29wZSlcblxuICAgIGZ1bmN0aW9uIGFsbCAoKSB7XG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIH1cblxuICAgIGVtaXRBdHRyaWJ1dGVzKGVudiwgc2NvcGUsIGFyZ3MsIHByb2dyYW0uYXR0cmlidXRlcywgYWxsKVxuICAgIGVtaXRVbmlmb3JtcyhlbnYsIHNjb3BlLCBhcmdzLCBwcm9ncmFtLnVuaWZvcm1zLCBhbGwpXG4gICAgZW1pdERyYXcoZW52LCBzY29wZSwgc2NvcGUsIGFyZ3MpXG4gIH1cblxuICBmdW5jdGlvbiBlbWl0QmF0Y2hCb2R5IChlbnYsIHNjb3BlLCBhcmdzLCBwcm9ncmFtKSB7XG4gICAgaW5qZWN0RXh0ZW5zaW9ucyhlbnYsIHNjb3BlKVxuXG4gICAgdmFyIGNvbnRleHREeW5hbWljID0gYXJncy5jb250ZXh0RGVwXG5cbiAgICB2YXIgQkFUQ0hfSUQgPSBzY29wZS5kZWYoKVxuICAgIHZhciBQUk9QX0xJU1QgPSAnYTAnXG4gICAgdmFyIE5VTV9QUk9QUyA9ICdhMSdcbiAgICB2YXIgUFJPUFMgPSBzY29wZS5kZWYoKVxuICAgIGVudi5zaGFyZWQucHJvcHMgPSBQUk9QU1xuICAgIGVudi5iYXRjaElkID0gQkFUQ0hfSURcblxuICAgIHZhciBvdXRlciA9IGVudi5zY29wZSgpXG4gICAgdmFyIGlubmVyID0gZW52LnNjb3BlKClcblxuICAgIHNjb3BlKFxuICAgICAgb3V0ZXIuZW50cnksXG4gICAgICAnZm9yKCcsIEJBVENIX0lELCAnPTA7JywgQkFUQ0hfSUQsICc8JywgTlVNX1BST1BTLCAnOysrJywgQkFUQ0hfSUQsICcpeycsXG4gICAgICBQUk9QUywgJz0nLCBQUk9QX0xJU1QsICdbJywgQkFUQ0hfSUQsICddOycsXG4gICAgICBpbm5lcixcbiAgICAgICd9JyxcbiAgICAgIG91dGVyLmV4aXQpXG5cbiAgICBmdW5jdGlvbiBpc0lubmVyRGVmbiAoZGVmbikge1xuICAgICAgcmV0dXJuICgoZGVmbi5jb250ZXh0RGVwICYmIGNvbnRleHREeW5hbWljKSB8fCBkZWZuLnByb3BEZXApXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaXNPdXRlckRlZm4gKGRlZm4pIHtcbiAgICAgIHJldHVybiAhaXNJbm5lckRlZm4oZGVmbilcbiAgICB9XG5cbiAgICBpZiAoYXJncy5uZWVkc0NvbnRleHQpIHtcbiAgICAgIGVtaXRDb250ZXh0KGVudiwgaW5uZXIsIGFyZ3MuY29udGV4dClcbiAgICB9XG4gICAgaWYgKGFyZ3MubmVlZHNGcmFtZWJ1ZmZlcikge1xuICAgICAgZW1pdFBvbGxGcmFtZWJ1ZmZlcihlbnYsIGlubmVyLCBhcmdzLmZyYW1lYnVmZmVyKVxuICAgIH1cbiAgICBlbWl0U2V0T3B0aW9ucyhlbnYsIGlubmVyLCBhcmdzLnN0YXRlLCBpc0lubmVyRGVmbilcblxuICAgIGlmIChhcmdzLnByb2ZpbGUgJiYgaXNJbm5lckRlZm4oYXJncy5wcm9maWxlKSkge1xuICAgICAgZW1pdFByb2ZpbGUoZW52LCBpbm5lciwgYXJncywgZmFsc2UsIHRydWUpXG4gICAgfVxuXG4gICAgaWYgKCFwcm9ncmFtKSB7XG4gICAgICB2YXIgcHJvZ0NhY2hlID0gZW52Lmdsb2JhbC5kZWYoJ3t9JylcbiAgICAgIHZhciBQUk9HUkFNID0gYXJncy5zaGFkZXIucHJvZ1Zhci5hcHBlbmQoZW52LCBpbm5lcilcbiAgICAgIHZhciBQUk9HX0lEID0gaW5uZXIuZGVmKFBST0dSQU0sICcuaWQnKVxuICAgICAgdmFyIENBQ0hFRF9QUk9DID0gaW5uZXIuZGVmKHByb2dDYWNoZSwgJ1snLCBQUk9HX0lELCAnXScpXG4gICAgICBpbm5lcihcbiAgICAgICAgZW52LnNoYXJlZC5nbCwgJy51c2VQcm9ncmFtKCcsIFBST0dSQU0sICcucHJvZ3JhbSk7JyxcbiAgICAgICAgJ2lmKCEnLCBDQUNIRURfUFJPQywgJyl7JyxcbiAgICAgICAgQ0FDSEVEX1BST0MsICc9JywgcHJvZ0NhY2hlLCAnWycsIFBST0dfSUQsICddPScsXG4gICAgICAgIGVudi5saW5rKGZ1bmN0aW9uIChwcm9ncmFtKSB7XG4gICAgICAgICAgcmV0dXJuIGNyZWF0ZUJvZHkoXG4gICAgICAgICAgICBlbWl0QmF0Y2hEeW5hbWljU2hhZGVyQm9keSwgZW52LCBhcmdzLCBwcm9ncmFtLCAyKVxuICAgICAgICB9KSwgJygnLCBQUk9HUkFNLCAnKTt9JyxcbiAgICAgICAgQ0FDSEVEX1BST0MsICcuY2FsbCh0aGlzLGEwWycsIEJBVENIX0lELCAnXSwnLCBCQVRDSF9JRCwgJyk7JylcbiAgICB9IGVsc2Uge1xuICAgICAgZW1pdEF0dHJpYnV0ZXMoZW52LCBvdXRlciwgYXJncywgcHJvZ3JhbS5hdHRyaWJ1dGVzLCBpc091dGVyRGVmbilcbiAgICAgIGVtaXRBdHRyaWJ1dGVzKGVudiwgaW5uZXIsIGFyZ3MsIHByb2dyYW0uYXR0cmlidXRlcywgaXNJbm5lckRlZm4pXG4gICAgICBlbWl0VW5pZm9ybXMoZW52LCBvdXRlciwgYXJncywgcHJvZ3JhbS51bmlmb3JtcywgaXNPdXRlckRlZm4pXG4gICAgICBlbWl0VW5pZm9ybXMoZW52LCBpbm5lciwgYXJncywgcHJvZ3JhbS51bmlmb3JtcywgaXNJbm5lckRlZm4pXG4gICAgICBlbWl0RHJhdyhlbnYsIG91dGVyLCBpbm5lciwgYXJncylcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBlbWl0QmF0Y2hQcm9jIChlbnYsIGFyZ3MpIHtcbiAgICB2YXIgYmF0Y2ggPSBlbnYucHJvYygnYmF0Y2gnLCAyKVxuICAgIGVudi5iYXRjaElkID0gJzAnXG5cbiAgICBpbmplY3RFeHRlbnNpb25zKGVudiwgYmF0Y2gpXG5cbiAgICAvLyBDaGVjayBpZiBhbnkgY29udGV4dCB2YXJpYWJsZXMgZGVwZW5kIG9uIHByb3BzXG4gICAgdmFyIGNvbnRleHREeW5hbWljID0gZmFsc2VcbiAgICB2YXIgbmVlZHNDb250ZXh0ID0gdHJ1ZVxuICAgIE9iamVjdC5rZXlzKGFyZ3MuY29udGV4dCkuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgY29udGV4dER5bmFtaWMgPSBjb250ZXh0RHluYW1pYyB8fCBhcmdzLmNvbnRleHRbbmFtZV0ucHJvcERlcFxuICAgIH0pXG4gICAgaWYgKCFjb250ZXh0RHluYW1pYykge1xuICAgICAgZW1pdENvbnRleHQoZW52LCBiYXRjaCwgYXJncy5jb250ZXh0KVxuICAgICAgbmVlZHNDb250ZXh0ID0gZmFsc2VcbiAgICB9XG5cbiAgICAvLyBmcmFtZWJ1ZmZlciBzdGF0ZSBhZmZlY3RzIGZyYW1lYnVmZmVyV2lkdGgvaGVpZ2h0IGNvbnRleHQgdmFyc1xuICAgIHZhciBmcmFtZWJ1ZmZlciA9IGFyZ3MuZnJhbWVidWZmZXJcbiAgICB2YXIgbmVlZHNGcmFtZWJ1ZmZlciA9IGZhbHNlXG4gICAgaWYgKGZyYW1lYnVmZmVyKSB7XG4gICAgICBpZiAoZnJhbWVidWZmZXIucHJvcERlcCkge1xuICAgICAgICBjb250ZXh0RHluYW1pYyA9IG5lZWRzRnJhbWVidWZmZXIgPSB0cnVlXG4gICAgICB9IGVsc2UgaWYgKGZyYW1lYnVmZmVyLmNvbnRleHREZXAgJiYgY29udGV4dER5bmFtaWMpIHtcbiAgICAgICAgbmVlZHNGcmFtZWJ1ZmZlciA9IHRydWVcbiAgICAgIH1cbiAgICAgIGlmICghbmVlZHNGcmFtZWJ1ZmZlcikge1xuICAgICAgICBlbWl0UG9sbEZyYW1lYnVmZmVyKGVudiwgYmF0Y2gsIGZyYW1lYnVmZmVyKVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBlbWl0UG9sbEZyYW1lYnVmZmVyKGVudiwgYmF0Y2gsIG51bGwpXG4gICAgfVxuXG4gICAgLy8gdmlld3BvcnQgaXMgd2VpcmQgYmVjYXVzZSBpdCBjYW4gYWZmZWN0IGNvbnRleHQgdmFyc1xuICAgIGlmIChhcmdzLnN0YXRlLnZpZXdwb3J0ICYmIGFyZ3Muc3RhdGUudmlld3BvcnQucHJvcERlcCkge1xuICAgICAgY29udGV4dER5bmFtaWMgPSB0cnVlXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaXNJbm5lckRlZm4gKGRlZm4pIHtcbiAgICAgIHJldHVybiAoZGVmbi5jb250ZXh0RGVwICYmIGNvbnRleHREeW5hbWljKSB8fCBkZWZuLnByb3BEZXBcbiAgICB9XG5cbiAgICAvLyBzZXQgd2ViZ2wgb3B0aW9uc1xuICAgIGVtaXRQb2xsU3RhdGUoZW52LCBiYXRjaCwgYXJncylcbiAgICBlbWl0U2V0T3B0aW9ucyhlbnYsIGJhdGNoLCBhcmdzLnN0YXRlLCBmdW5jdGlvbiAoZGVmbikge1xuICAgICAgcmV0dXJuICFpc0lubmVyRGVmbihkZWZuKVxuICAgIH0pXG5cbiAgICBpZiAoIWFyZ3MucHJvZmlsZSB8fCAhaXNJbm5lckRlZm4oYXJncy5wcm9maWxlKSkge1xuICAgICAgZW1pdFByb2ZpbGUoZW52LCBiYXRjaCwgYXJncywgZmFsc2UsICdhMScpXG4gICAgfVxuXG4gICAgLy8gU2F2ZSB0aGVzZSB2YWx1ZXMgdG8gYXJncyBzbyB0aGF0IHRoZSBiYXRjaCBib2R5IHJvdXRpbmUgY2FuIHVzZSB0aGVtXG4gICAgYXJncy5jb250ZXh0RGVwID0gY29udGV4dER5bmFtaWNcbiAgICBhcmdzLm5lZWRzQ29udGV4dCA9IG5lZWRzQ29udGV4dFxuICAgIGFyZ3MubmVlZHNGcmFtZWJ1ZmZlciA9IG5lZWRzRnJhbWVidWZmZXJcblxuICAgIC8vIGRldGVybWluZSBpZiBzaGFkZXIgaXMgZHluYW1pY1xuICAgIHZhciBwcm9nRGVmbiA9IGFyZ3Muc2hhZGVyLnByb2dWYXJcbiAgICBpZiAoKHByb2dEZWZuLmNvbnRleHREZXAgJiYgY29udGV4dER5bmFtaWMpIHx8IHByb2dEZWZuLnByb3BEZXApIHtcbiAgICAgIGVtaXRCYXRjaEJvZHkoXG4gICAgICAgIGVudixcbiAgICAgICAgYmF0Y2gsXG4gICAgICAgIGFyZ3MsXG4gICAgICAgIG51bGwpXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBQUk9HUkFNID0gcHJvZ0RlZm4uYXBwZW5kKGVudiwgYmF0Y2gpXG4gICAgICBiYXRjaChlbnYuc2hhcmVkLmdsLCAnLnVzZVByb2dyYW0oJywgUFJPR1JBTSwgJy5wcm9ncmFtKTsnKVxuICAgICAgaWYgKGFyZ3Muc2hhZGVyLnByb2dyYW0pIHtcbiAgICAgICAgZW1pdEJhdGNoQm9keShcbiAgICAgICAgICBlbnYsXG4gICAgICAgICAgYmF0Y2gsXG4gICAgICAgICAgYXJncyxcbiAgICAgICAgICBhcmdzLnNoYWRlci5wcm9ncmFtKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIGJhdGNoQ2FjaGUgPSBlbnYuZ2xvYmFsLmRlZigne30nKVxuICAgICAgICB2YXIgUFJPR19JRCA9IGJhdGNoLmRlZihQUk9HUkFNLCAnLmlkJylcbiAgICAgICAgdmFyIENBQ0hFRF9QUk9DID0gYmF0Y2guZGVmKGJhdGNoQ2FjaGUsICdbJywgUFJPR19JRCwgJ10nKVxuICAgICAgICBiYXRjaChcbiAgICAgICAgICBlbnYuY29uZChDQUNIRURfUFJPQylcbiAgICAgICAgICAgIC50aGVuKENBQ0hFRF9QUk9DLCAnLmNhbGwodGhpcyxhMCxhMSk7JylcbiAgICAgICAgICAgIC5lbHNlKFxuICAgICAgICAgICAgICBDQUNIRURfUFJPQywgJz0nLCBiYXRjaENhY2hlLCAnWycsIFBST0dfSUQsICddPScsXG4gICAgICAgICAgICAgIGVudi5saW5rKGZ1bmN0aW9uIChwcm9ncmFtKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNyZWF0ZUJvZHkoZW1pdEJhdGNoQm9keSwgZW52LCBhcmdzLCBwcm9ncmFtLCAyKVxuICAgICAgICAgICAgICB9KSwgJygnLCBQUk9HUkFNLCAnKTsnLFxuICAgICAgICAgICAgICBDQUNIRURfUFJPQywgJy5jYWxsKHRoaXMsYTAsYTEpOycpKVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChPYmplY3Qua2V5cyhhcmdzLnN0YXRlKS5sZW5ndGggPiAwKSB7XG4gICAgICBiYXRjaChlbnYuc2hhcmVkLmN1cnJlbnQsICcuZGlydHk9dHJ1ZTsnKVxuICAgIH1cbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gU0NPUEUgQ09NTUFORFxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIGVtaXRTY29wZVByb2MgKGVudiwgYXJncykge1xuICAgIHZhciBzY29wZSA9IGVudi5wcm9jKCdzY29wZScsIDMpXG4gICAgZW52LmJhdGNoSWQgPSAnYTInXG5cbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuICAgIHZhciBDVVJSRU5UX1NUQVRFID0gc2hhcmVkLmN1cnJlbnRcblxuICAgIGVtaXRDb250ZXh0KGVudiwgc2NvcGUsIGFyZ3MuY29udGV4dClcblxuICAgIGlmIChhcmdzLmZyYW1lYnVmZmVyKSB7XG4gICAgICBhcmdzLmZyYW1lYnVmZmVyLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgIH1cblxuICAgIHNvcnRTdGF0ZShPYmplY3Qua2V5cyhhcmdzLnN0YXRlKSkuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgdmFyIGRlZm4gPSBhcmdzLnN0YXRlW25hbWVdXG4gICAgICB2YXIgdmFsdWUgPSBkZWZuLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgaWYgKGlzQXJyYXlMaWtlKHZhbHVlKSkge1xuICAgICAgICB2YWx1ZS5mb3JFYWNoKGZ1bmN0aW9uICh2LCBpKSB7XG4gICAgICAgICAgc2NvcGUuc2V0KGVudi5uZXh0W25hbWVdLCAnWycgKyBpICsgJ10nLCB2KVxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2NvcGUuc2V0KHNoYXJlZC5uZXh0LCAnLicgKyBuYW1lLCB2YWx1ZSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgZW1pdFByb2ZpbGUoZW52LCBzY29wZSwgYXJncywgdHJ1ZSwgdHJ1ZSlcblxuICAgIDtbU19FTEVNRU5UUywgU19PRkZTRVQsIFNfQ09VTlQsIFNfSU5TVEFOQ0VTLCBTX1BSSU1JVElWRV0uZm9yRWFjaChcbiAgICAgIGZ1bmN0aW9uIChvcHQpIHtcbiAgICAgICAgdmFyIHZhcmlhYmxlID0gYXJncy5kcmF3W29wdF1cbiAgICAgICAgaWYgKCF2YXJpYWJsZSkge1xuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG4gICAgICAgIHNjb3BlLnNldChzaGFyZWQuZHJhdywgJy4nICsgb3B0LCAnJyArIHZhcmlhYmxlLmFwcGVuZChlbnYsIHNjb3BlKSlcbiAgICAgIH0pXG5cbiAgICBPYmplY3Qua2V5cyhhcmdzLnVuaWZvcm1zKS5mb3JFYWNoKGZ1bmN0aW9uIChvcHQpIHtcbiAgICAgIHNjb3BlLnNldChcbiAgICAgICAgc2hhcmVkLnVuaWZvcm1zLFxuICAgICAgICAnWycgKyBzdHJpbmdTdG9yZS5pZChvcHQpICsgJ10nLFxuICAgICAgICBhcmdzLnVuaWZvcm1zW29wdF0uYXBwZW5kKGVudiwgc2NvcGUpKVxuICAgIH0pXG5cbiAgICBPYmplY3Qua2V5cyhhcmdzLmF0dHJpYnV0ZXMpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHZhciByZWNvcmQgPSBhcmdzLmF0dHJpYnV0ZXNbbmFtZV0uYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgICB2YXIgc2NvcGVBdHRyaWIgPSBlbnYuc2NvcGVBdHRyaWIobmFtZSlcbiAgICAgIE9iamVjdC5rZXlzKG5ldyBBdHRyaWJ1dGVSZWNvcmQoKSkuZm9yRWFjaChmdW5jdGlvbiAocHJvcCkge1xuICAgICAgICBzY29wZS5zZXQoc2NvcGVBdHRyaWIsICcuJyArIHByb3AsIHJlY29yZFtwcm9wXSlcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGZ1bmN0aW9uIHNhdmVTaGFkZXIgKG5hbWUpIHtcbiAgICAgIHZhciBzaGFkZXIgPSBhcmdzLnNoYWRlcltuYW1lXVxuICAgICAgaWYgKHNoYWRlcikge1xuICAgICAgICBzY29wZS5zZXQoc2hhcmVkLnNoYWRlciwgJy4nICsgbmFtZSwgc2hhZGVyLmFwcGVuZChlbnYsIHNjb3BlKSlcbiAgICAgIH1cbiAgICB9XG4gICAgc2F2ZVNoYWRlcihTX1ZFUlQpXG4gICAgc2F2ZVNoYWRlcihTX0ZSQUcpXG5cbiAgICBpZiAoT2JqZWN0LmtleXMoYXJncy5zdGF0ZSkubGVuZ3RoID4gMCkge1xuICAgICAgc2NvcGUoQ1VSUkVOVF9TVEFURSwgJy5kaXJ0eT10cnVlOycpXG4gICAgICBzY29wZS5leGl0KENVUlJFTlRfU1RBVEUsICcuZGlydHk9dHJ1ZTsnKVxuICAgIH1cblxuICAgIHNjb3BlKCdhMSgnLCBlbnYuc2hhcmVkLmNvbnRleHQsICcsYTAsJywgZW52LmJhdGNoSWQsICcpOycpXG4gIH1cblxuICBmdW5jdGlvbiBpc0R5bmFtaWNPYmplY3QgKG9iamVjdCkge1xuICAgIGlmICh0eXBlb2Ygb2JqZWN0ICE9PSAnb2JqZWN0JyB8fCBpc0FycmF5TGlrZShvYmplY3QpKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgdmFyIHByb3BzID0gT2JqZWN0LmtleXMob2JqZWN0KVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcHJvcHMubGVuZ3RoOyArK2kpIHtcbiAgICAgIGlmIChkeW5hbWljLmlzRHluYW1pYyhvYmplY3RbcHJvcHNbaV1dKSkge1xuICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2VcbiAgfVxuXG4gIGZ1bmN0aW9uIHNwbGF0T2JqZWN0IChlbnYsIG9wdGlvbnMsIG5hbWUpIHtcbiAgICB2YXIgb2JqZWN0ID0gb3B0aW9ucy5zdGF0aWNbbmFtZV1cbiAgICBpZiAoIW9iamVjdCB8fCAhaXNEeW5hbWljT2JqZWN0KG9iamVjdCkpIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIHZhciBnbG9iYWxzID0gZW52Lmdsb2JhbFxuICAgIHZhciBrZXlzID0gT2JqZWN0LmtleXMob2JqZWN0KVxuICAgIHZhciB0aGlzRGVwID0gZmFsc2VcbiAgICB2YXIgY29udGV4dERlcCA9IGZhbHNlXG4gICAgdmFyIHByb3BEZXAgPSBmYWxzZVxuICAgIHZhciBvYmplY3RSZWYgPSBlbnYuZ2xvYmFsLmRlZigne30nKVxuICAgIGtleXMuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICB2YXIgdmFsdWUgPSBvYmplY3Rba2V5XVxuICAgICAgaWYgKGR5bmFtaWMuaXNEeW5hbWljKHZhbHVlKSkge1xuICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgdmFsdWUgPSBvYmplY3Rba2V5XSA9IGR5bmFtaWMudW5ib3godmFsdWUpXG4gICAgICAgIH1cbiAgICAgICAgdmFyIGRlcHMgPSBjcmVhdGVEeW5hbWljRGVjbCh2YWx1ZSwgbnVsbClcbiAgICAgICAgdGhpc0RlcCA9IHRoaXNEZXAgfHwgZGVwcy50aGlzRGVwXG4gICAgICAgIHByb3BEZXAgPSBwcm9wRGVwIHx8IGRlcHMucHJvcERlcFxuICAgICAgICBjb250ZXh0RGVwID0gY29udGV4dERlcCB8fCBkZXBzLmNvbnRleHREZXBcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGdsb2JhbHMob2JqZWN0UmVmLCAnLicsIGtleSwgJz0nKVxuICAgICAgICBzd2l0Y2ggKHR5cGVvZiB2YWx1ZSkge1xuICAgICAgICAgIGNhc2UgJ251bWJlcic6XG4gICAgICAgICAgICBnbG9iYWxzKHZhbHVlKVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgICAgICAgZ2xvYmFscygnXCInLCB2YWx1ZSwgJ1wiJylcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuICAgICAgICAgICAgICBnbG9iYWxzKCdbJywgdmFsdWUuam9pbigpLCAnXScpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICBnbG9iYWxzKGVudi5saW5rKHZhbHVlKSlcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgIH1cbiAgICAgICAgZ2xvYmFscygnOycpXG4gICAgICB9XG4gICAgfSlcblxuICAgIGZ1bmN0aW9uIGFwcGVuZEJsb2NrIChlbnYsIGJsb2NrKSB7XG4gICAgICBrZXlzLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgICB2YXIgdmFsdWUgPSBvYmplY3Rba2V5XVxuICAgICAgICBpZiAoIWR5bmFtaWMuaXNEeW5hbWljKHZhbHVlKSkge1xuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG4gICAgICAgIHZhciByZWYgPSBlbnYuaW52b2tlKGJsb2NrLCB2YWx1ZSlcbiAgICAgICAgYmxvY2sob2JqZWN0UmVmLCAnLicsIGtleSwgJz0nLCByZWYsICc7JylcbiAgICAgIH0pXG4gICAgfVxuXG4gICAgb3B0aW9ucy5keW5hbWljW25hbWVdID0gbmV3IGR5bmFtaWMuRHluYW1pY1ZhcmlhYmxlKERZTl9USFVOSywge1xuICAgICAgdGhpc0RlcDogdGhpc0RlcCxcbiAgICAgIGNvbnRleHREZXA6IGNvbnRleHREZXAsXG4gICAgICBwcm9wRGVwOiBwcm9wRGVwLFxuICAgICAgcmVmOiBvYmplY3RSZWYsXG4gICAgICBhcHBlbmQ6IGFwcGVuZEJsb2NrXG4gICAgfSlcbiAgICBkZWxldGUgb3B0aW9ucy5zdGF0aWNbbmFtZV1cbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gTUFJTiBEUkFXIENPTU1BTkRcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICBmdW5jdGlvbiBjb21waWxlQ29tbWFuZCAob3B0aW9ucywgYXR0cmlidXRlcywgdW5pZm9ybXMsIGNvbnRleHQsIHN0YXRzKSB7XG4gICAgdmFyIGVudiA9IGNyZWF0ZVJFR0xFbnZpcm9ubWVudCgpXG5cbiAgICAvLyBsaW5rIHN0YXRzLCBzbyB0aGF0IHdlIGNhbiBlYXNpbHkgYWNjZXNzIGl0IGluIHRoZSBwcm9ncmFtLlxuICAgIGVudi5zdGF0cyA9IGVudi5saW5rKHN0YXRzKVxuXG4gICAgLy8gc3BsYXQgb3B0aW9ucyBhbmQgYXR0cmlidXRlcyB0byBhbGxvdyBmb3IgZHluYW1pYyBuZXN0ZWQgcHJvcGVydGllc1xuICAgIE9iamVjdC5rZXlzKGF0dHJpYnV0ZXMuc3RhdGljKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgIHNwbGF0T2JqZWN0KGVudiwgYXR0cmlidXRlcywga2V5KVxuICAgIH0pXG4gICAgTkVTVEVEX09QVElPTlMuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgc3BsYXRPYmplY3QoZW52LCBvcHRpb25zLCBuYW1lKVxuICAgIH0pXG5cbiAgICB2YXIgYXJncyA9IHBhcnNlQXJndW1lbnRzKG9wdGlvbnMsIGF0dHJpYnV0ZXMsIHVuaWZvcm1zLCBjb250ZXh0LCBlbnYpXG5cbiAgICBlbWl0RHJhd1Byb2MoZW52LCBhcmdzKVxuICAgIGVtaXRTY29wZVByb2MoZW52LCBhcmdzKVxuICAgIGVtaXRCYXRjaFByb2MoZW52LCBhcmdzKVxuXG4gICAgcmV0dXJuIGVudi5jb21waWxlKClcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gUE9MTCAvIFJFRlJFU0hcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICByZXR1cm4ge1xuICAgIG5leHQ6IG5leHRTdGF0ZSxcbiAgICBjdXJyZW50OiBjdXJyZW50U3RhdGUsXG4gICAgcHJvY3M6IChmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgZW52ID0gY3JlYXRlUkVHTEVudmlyb25tZW50KClcbiAgICAgIHZhciBwb2xsID0gZW52LnByb2MoJ3BvbGwnKVxuICAgICAgdmFyIHJlZnJlc2ggPSBlbnYucHJvYygncmVmcmVzaCcpXG4gICAgICB2YXIgY29tbW9uID0gZW52LmJsb2NrKClcbiAgICAgIHBvbGwoY29tbW9uKVxuICAgICAgcmVmcmVzaChjb21tb24pXG5cbiAgICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgICB2YXIgR0wgPSBzaGFyZWQuZ2xcbiAgICAgIHZhciBORVhUX1NUQVRFID0gc2hhcmVkLm5leHRcbiAgICAgIHZhciBDVVJSRU5UX1NUQVRFID0gc2hhcmVkLmN1cnJlbnRcblxuICAgICAgY29tbW9uKENVUlJFTlRfU1RBVEUsICcuZGlydHk9ZmFsc2U7JylcblxuICAgICAgZW1pdFBvbGxGcmFtZWJ1ZmZlcihlbnYsIHBvbGwpXG4gICAgICBlbWl0UG9sbEZyYW1lYnVmZmVyKGVudiwgcmVmcmVzaCwgbnVsbCwgdHJ1ZSlcblxuICAgICAgLy8gUmVmcmVzaCB1cGRhdGVzIGFsbCBhdHRyaWJ1dGUgc3RhdGUgY2hhbmdlc1xuICAgICAgdmFyIGV4dEluc3RhbmNpbmcgPSBnbC5nZXRFeHRlbnNpb24oJ2FuZ2xlX2luc3RhbmNlZF9hcnJheXMnKVxuICAgICAgdmFyIElOU1RBTkNJTkdcbiAgICAgIGlmIChleHRJbnN0YW5jaW5nKSB7XG4gICAgICAgIElOU1RBTkNJTkcgPSBlbnYubGluayhleHRJbnN0YW5jaW5nKVxuICAgICAgfVxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsaW1pdHMubWF4QXR0cmlidXRlczsgKytpKSB7XG4gICAgICAgIHZhciBCSU5ESU5HID0gcmVmcmVzaC5kZWYoc2hhcmVkLmF0dHJpYnV0ZXMsICdbJywgaSwgJ10nKVxuICAgICAgICB2YXIgaWZ0ZSA9IGVudi5jb25kKEJJTkRJTkcsICcuYnVmZmVyJylcbiAgICAgICAgaWZ0ZS50aGVuKFxuICAgICAgICAgIEdMLCAnLmVuYWJsZVZlcnRleEF0dHJpYkFycmF5KCcsIGksICcpOycsXG4gICAgICAgICAgR0wsICcuYmluZEJ1ZmZlcignLFxuICAgICAgICAgICAgR0xfQVJSQVlfQlVGRkVSLCAnLCcsXG4gICAgICAgICAgICBCSU5ESU5HLCAnLmJ1ZmZlci5idWZmZXIpOycsXG4gICAgICAgICAgR0wsICcudmVydGV4QXR0cmliUG9pbnRlcignLFxuICAgICAgICAgICAgaSwgJywnLFxuICAgICAgICAgICAgQklORElORywgJy5zaXplLCcsXG4gICAgICAgICAgICBCSU5ESU5HLCAnLnR5cGUsJyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcubm9ybWFsaXplZCwnLFxuICAgICAgICAgICAgQklORElORywgJy5zdHJpZGUsJyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcub2Zmc2V0KTsnXG4gICAgICAgICkuZWxzZShcbiAgICAgICAgICBHTCwgJy5kaXNhYmxlVmVydGV4QXR0cmliQXJyYXkoJywgaSwgJyk7JyxcbiAgICAgICAgICBHTCwgJy52ZXJ0ZXhBdHRyaWI0ZignLFxuICAgICAgICAgICAgaSwgJywnLFxuICAgICAgICAgICAgQklORElORywgJy54LCcsXG4gICAgICAgICAgICBCSU5ESU5HLCAnLnksJyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcueiwnLFxuICAgICAgICAgICAgQklORElORywgJy53KTsnLFxuICAgICAgICAgIEJJTkRJTkcsICcuYnVmZmVyPW51bGw7JylcbiAgICAgICAgcmVmcmVzaChpZnRlKVxuICAgICAgICBpZiAoZXh0SW5zdGFuY2luZykge1xuICAgICAgICAgIHJlZnJlc2goXG4gICAgICAgICAgICBJTlNUQU5DSU5HLCAnLnZlcnRleEF0dHJpYkRpdmlzb3JBTkdMRSgnLFxuICAgICAgICAgICAgaSwgJywnLFxuICAgICAgICAgICAgQklORElORywgJy5kaXZpc29yKTsnKVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIE9iamVjdC5rZXlzKEdMX0ZMQUdTKS5mb3JFYWNoKGZ1bmN0aW9uIChmbGFnKSB7XG4gICAgICAgIHZhciBjYXAgPSBHTF9GTEFHU1tmbGFnXVxuICAgICAgICB2YXIgTkVYVCA9IGNvbW1vbi5kZWYoTkVYVF9TVEFURSwgJy4nLCBmbGFnKVxuICAgICAgICB2YXIgYmxvY2sgPSBlbnYuYmxvY2soKVxuICAgICAgICBibG9jaygnaWYoJywgTkVYVCwgJyl7JyxcbiAgICAgICAgICBHTCwgJy5lbmFibGUoJywgY2FwLCAnKX1lbHNleycsXG4gICAgICAgICAgR0wsICcuZGlzYWJsZSgnLCBjYXAsICcpfScsXG4gICAgICAgICAgQ1VSUkVOVF9TVEFURSwgJy4nLCBmbGFnLCAnPScsIE5FWFQsICc7JylcbiAgICAgICAgcmVmcmVzaChibG9jaylcbiAgICAgICAgcG9sbChcbiAgICAgICAgICAnaWYoJywgTkVYVCwgJyE9PScsIENVUlJFTlRfU1RBVEUsICcuJywgZmxhZywgJyl7JyxcbiAgICAgICAgICBibG9jayxcbiAgICAgICAgICAnfScpXG4gICAgICB9KVxuXG4gICAgICBPYmplY3Qua2V5cyhHTF9WQVJJQUJMRVMpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgdmFyIGZ1bmMgPSBHTF9WQVJJQUJMRVNbbmFtZV1cbiAgICAgICAgdmFyIGluaXQgPSBjdXJyZW50U3RhdGVbbmFtZV1cbiAgICAgICAgdmFyIE5FWFQsIENVUlJFTlRcbiAgICAgICAgdmFyIGJsb2NrID0gZW52LmJsb2NrKClcbiAgICAgICAgYmxvY2soR0wsICcuJywgZnVuYywgJygnKVxuICAgICAgICBpZiAoaXNBcnJheUxpa2UoaW5pdCkpIHtcbiAgICAgICAgICB2YXIgbiA9IGluaXQubGVuZ3RoXG4gICAgICAgICAgTkVYVCA9IGVudi5nbG9iYWwuZGVmKE5FWFRfU1RBVEUsICcuJywgbmFtZSlcbiAgICAgICAgICBDVVJSRU5UID0gZW52Lmdsb2JhbC5kZWYoQ1VSUkVOVF9TVEFURSwgJy4nLCBuYW1lKVxuICAgICAgICAgIGJsb2NrKFxuICAgICAgICAgICAgbG9vcChuLCBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgICAgICByZXR1cm4gTkVYVCArICdbJyArIGkgKyAnXSdcbiAgICAgICAgICAgIH0pLCAnKTsnLFxuICAgICAgICAgICAgbG9vcChuLCBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgICAgICByZXR1cm4gQ1VSUkVOVCArICdbJyArIGkgKyAnXT0nICsgTkVYVCArICdbJyArIGkgKyAnXTsnXG4gICAgICAgICAgICB9KS5qb2luKCcnKSlcbiAgICAgICAgICBwb2xsKFxuICAgICAgICAgICAgJ2lmKCcsIGxvb3AobiwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIE5FWFQgKyAnWycgKyBpICsgJ10hPT0nICsgQ1VSUkVOVCArICdbJyArIGkgKyAnXSdcbiAgICAgICAgICAgIH0pLmpvaW4oJ3x8JyksICcpeycsXG4gICAgICAgICAgICBibG9jayxcbiAgICAgICAgICAgICd9JylcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBORVhUID0gY29tbW9uLmRlZihORVhUX1NUQVRFLCAnLicsIG5hbWUpXG4gICAgICAgICAgQ1VSUkVOVCA9IGNvbW1vbi5kZWYoQ1VSUkVOVF9TVEFURSwgJy4nLCBuYW1lKVxuICAgICAgICAgIGJsb2NrKFxuICAgICAgICAgICAgTkVYVCwgJyk7JyxcbiAgICAgICAgICAgIENVUlJFTlRfU1RBVEUsICcuJywgbmFtZSwgJz0nLCBORVhULCAnOycpXG4gICAgICAgICAgcG9sbChcbiAgICAgICAgICAgICdpZignLCBORVhULCAnIT09JywgQ1VSUkVOVCwgJyl7JyxcbiAgICAgICAgICAgIGJsb2NrLFxuICAgICAgICAgICAgJ30nKVxuICAgICAgICB9XG4gICAgICAgIHJlZnJlc2goYmxvY2spXG4gICAgICB9KVxuXG4gICAgICByZXR1cm4gZW52LmNvbXBpbGUoKVxuICAgIH0pKCksXG4gICAgY29tcGlsZTogY29tcGlsZUNvbW1hbmRcbiAgfVxufVxuIiwidmFyIFZBUklBQkxFX0NPVU5URVIgPSAwXG5cbnZhciBEWU5fRlVOQyA9IDBcblxuZnVuY3Rpb24gRHluYW1pY1ZhcmlhYmxlICh0eXBlLCBkYXRhKSB7XG4gIHRoaXMuaWQgPSAoVkFSSUFCTEVfQ09VTlRFUisrKVxuICB0aGlzLnR5cGUgPSB0eXBlXG4gIHRoaXMuZGF0YSA9IGRhdGFcbn1cblxuZnVuY3Rpb24gZXNjYXBlU3RyIChzdHIpIHtcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC9cXFxcL2csICdcXFxcXFxcXCcpLnJlcGxhY2UoL1wiL2csICdcXFxcXCInKVxufVxuXG5mdW5jdGlvbiBzcGxpdFBhcnRzIChzdHIpIHtcbiAgaWYgKHN0ci5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gW11cbiAgfVxuXG4gIHZhciBmaXJzdENoYXIgPSBzdHIuY2hhckF0KDApXG4gIHZhciBsYXN0Q2hhciA9IHN0ci5jaGFyQXQoc3RyLmxlbmd0aCAtIDEpXG5cbiAgaWYgKHN0ci5sZW5ndGggPiAxICYmXG4gICAgICBmaXJzdENoYXIgPT09IGxhc3RDaGFyICYmXG4gICAgICAoZmlyc3RDaGFyID09PSAnXCInIHx8IGZpcnN0Q2hhciA9PT0gXCInXCIpKSB7XG4gICAgcmV0dXJuIFsnXCInICsgZXNjYXBlU3RyKHN0ci5zdWJzdHIoMSwgc3RyLmxlbmd0aCAtIDIpKSArICdcIiddXG4gIH1cblxuICB2YXIgcGFydHMgPSAvXFxbKGZhbHNlfHRydWV8bnVsbHxcXGQrfCdbXiddKid8XCJbXlwiXSpcIilcXF0vLmV4ZWMoc3RyKVxuICBpZiAocGFydHMpIHtcbiAgICByZXR1cm4gKFxuICAgICAgc3BsaXRQYXJ0cyhzdHIuc3Vic3RyKDAsIHBhcnRzLmluZGV4KSlcbiAgICAgIC5jb25jYXQoc3BsaXRQYXJ0cyhwYXJ0c1sxXSkpXG4gICAgICAuY29uY2F0KHNwbGl0UGFydHMoc3RyLnN1YnN0cihwYXJ0cy5pbmRleCArIHBhcnRzWzBdLmxlbmd0aCkpKVxuICAgIClcbiAgfVxuXG4gIHZhciBzdWJwYXJ0cyA9IHN0ci5zcGxpdCgnLicpXG4gIGlmIChzdWJwYXJ0cy5sZW5ndGggPT09IDEpIHtcbiAgICByZXR1cm4gWydcIicgKyBlc2NhcGVTdHIoc3RyKSArICdcIiddXG4gIH1cblxuICB2YXIgcmVzdWx0ID0gW11cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdWJwYXJ0cy5sZW5ndGg7ICsraSkge1xuICAgIHJlc3VsdCA9IHJlc3VsdC5jb25jYXQoc3BsaXRQYXJ0cyhzdWJwYXJ0c1tpXSkpXG4gIH1cbiAgcmV0dXJuIHJlc3VsdFxufVxuXG5mdW5jdGlvbiB0b0FjY2Vzc29yU3RyaW5nIChzdHIpIHtcbiAgcmV0dXJuICdbJyArIHNwbGl0UGFydHMoc3RyKS5qb2luKCddWycpICsgJ10nXG59XG5cbmZ1bmN0aW9uIGRlZmluZUR5bmFtaWMgKHR5cGUsIGRhdGEpIHtcbiAgcmV0dXJuIG5ldyBEeW5hbWljVmFyaWFibGUodHlwZSwgdG9BY2Nlc3NvclN0cmluZyhkYXRhICsgJycpKVxufVxuXG5mdW5jdGlvbiBpc0R5bmFtaWMgKHgpIHtcbiAgcmV0dXJuICh0eXBlb2YgeCA9PT0gJ2Z1bmN0aW9uJyAmJiAheC5fcmVnbFR5cGUpIHx8XG4gICAgICAgICB4IGluc3RhbmNlb2YgRHluYW1pY1ZhcmlhYmxlXG59XG5cbmZ1bmN0aW9uIHVuYm94ICh4LCBwYXRoKSB7XG4gIGlmICh0eXBlb2YgeCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHJldHVybiBuZXcgRHluYW1pY1ZhcmlhYmxlKERZTl9GVU5DLCB4KVxuICB9XG4gIHJldHVybiB4XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBEeW5hbWljVmFyaWFibGU6IER5bmFtaWNWYXJpYWJsZSxcbiAgZGVmaW5lOiBkZWZpbmVEeW5hbWljLFxuICBpc0R5bmFtaWM6IGlzRHluYW1pYyxcbiAgdW5ib3g6IHVuYm94LFxuICBhY2Nlc3NvcjogdG9BY2Nlc3NvclN0cmluZ1xufVxuIiwiXG52YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi91dGlsL2lzLXR5cGVkLWFycmF5JylcbnZhciBpc05EQXJyYXlMaWtlID0gcmVxdWlyZSgnLi91dGlsL2lzLW5kYXJyYXknKVxudmFyIHZhbHVlcyA9IHJlcXVpcmUoJy4vdXRpbC92YWx1ZXMnKVxuXG52YXIgcHJpbVR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvcHJpbWl0aXZlcy5qc29uJylcbnZhciB1c2FnZVR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvdXNhZ2UuanNvbicpXG5cbnZhciBHTF9QT0lOVFMgPSAwXG52YXIgR0xfTElORVMgPSAxXG52YXIgR0xfVFJJQU5HTEVTID0gNFxuXG52YXIgR0xfQllURSA9IDUxMjBcbnZhciBHTF9VTlNJR05FRF9CWVRFID0gNTEyMVxudmFyIEdMX1NIT1JUID0gNTEyMlxudmFyIEdMX1VOU0lHTkVEX1NIT1JUID0gNTEyM1xudmFyIEdMX0lOVCA9IDUxMjRcbnZhciBHTF9VTlNJR05FRF9JTlQgPSA1MTI1XG5cbnZhciBHTF9FTEVNRU5UX0FSUkFZX0JVRkZFUiA9IDM0OTYzXG5cbnZhciBHTF9TVFJFQU1fRFJBVyA9IDB4ODhFMFxudmFyIEdMX1NUQVRJQ19EUkFXID0gMHg4OEU0XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcEVsZW1lbnRzU3RhdGUgKGdsLCBleHRlbnNpb25zLCBidWZmZXJTdGF0ZSwgc3RhdHMpIHtcbiAgdmFyIGVsZW1lbnRTZXQgPSB7fVxuICB2YXIgZWxlbWVudENvdW50ID0gMFxuXG4gIHZhciBlbGVtZW50VHlwZXMgPSB7XG4gICAgJ3VpbnQ4JzogR0xfVU5TSUdORURfQllURSxcbiAgICAndWludDE2JzogR0xfVU5TSUdORURfU0hPUlRcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLm9lc19lbGVtZW50X2luZGV4X3VpbnQpIHtcbiAgICBlbGVtZW50VHlwZXMudWludDMyID0gR0xfVU5TSUdORURfSU5UXG4gIH1cblxuICBmdW5jdGlvbiBSRUdMRWxlbWVudEJ1ZmZlciAoYnVmZmVyKSB7XG4gICAgdGhpcy5pZCA9IGVsZW1lbnRDb3VudCsrXG4gICAgZWxlbWVudFNldFt0aGlzLmlkXSA9IHRoaXNcbiAgICB0aGlzLmJ1ZmZlciA9IGJ1ZmZlclxuICAgIHRoaXMucHJpbVR5cGUgPSBHTF9UUklBTkdMRVNcbiAgICB0aGlzLnZlcnRDb3VudCA9IDBcbiAgICB0aGlzLnR5cGUgPSAwXG4gIH1cblxuICBSRUdMRWxlbWVudEJ1ZmZlci5wcm90b3R5cGUuYmluZCA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmJ1ZmZlci5iaW5kKClcbiAgfVxuXG4gIHZhciBidWZmZXJQb29sID0gW11cblxuICBmdW5jdGlvbiBjcmVhdGVFbGVtZW50U3RyZWFtIChkYXRhKSB7XG4gICAgdmFyIHJlc3VsdCA9IGJ1ZmZlclBvb2wucG9wKClcbiAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgcmVzdWx0ID0gbmV3IFJFR0xFbGVtZW50QnVmZmVyKGJ1ZmZlclN0YXRlLmNyZWF0ZShcbiAgICAgICAgbnVsbCxcbiAgICAgICAgR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIsXG4gICAgICAgIHRydWUsXG4gICAgICAgIGZhbHNlKS5fYnVmZmVyKVxuICAgIH1cbiAgICBpbml0RWxlbWVudHMocmVzdWx0LCBkYXRhLCBHTF9TVFJFQU1fRFJBVywgLTEsIC0xLCAwLCAwKVxuICAgIHJldHVybiByZXN1bHRcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3lFbGVtZW50U3RyZWFtIChlbGVtZW50cykge1xuICAgIGJ1ZmZlclBvb2wucHVzaChlbGVtZW50cylcbiAgfVxuXG4gIGZ1bmN0aW9uIGluaXRFbGVtZW50cyAoXG4gICAgZWxlbWVudHMsXG4gICAgZGF0YSxcbiAgICB1c2FnZSxcbiAgICBwcmltLFxuICAgIGNvdW50LFxuICAgIGJ5dGVMZW5ndGgsXG4gICAgdHlwZSkge1xuICAgIGVsZW1lbnRzLmJ1ZmZlci5iaW5kKClcbiAgICBpZiAoZGF0YSkge1xuICAgICAgdmFyIHByZWRpY3RlZFR5cGUgPSB0eXBlXG4gICAgICBpZiAoIXR5cGUgJiYgKFxuICAgICAgICAgICFpc1R5cGVkQXJyYXkoZGF0YSkgfHxcbiAgICAgICAgIChpc05EQXJyYXlMaWtlKGRhdGEpICYmICFpc1R5cGVkQXJyYXkoZGF0YS5kYXRhKSkpKSB7XG4gICAgICAgIHByZWRpY3RlZFR5cGUgPSBleHRlbnNpb25zLm9lc19lbGVtZW50X2luZGV4X3VpbnRcbiAgICAgICAgICA/IEdMX1VOU0lHTkVEX0lOVFxuICAgICAgICAgIDogR0xfVU5TSUdORURfU0hPUlRcbiAgICAgIH1cbiAgICAgIGJ1ZmZlclN0YXRlLl9pbml0QnVmZmVyKFxuICAgICAgICBlbGVtZW50cy5idWZmZXIsXG4gICAgICAgIGRhdGEsXG4gICAgICAgIHVzYWdlLFxuICAgICAgICBwcmVkaWN0ZWRUeXBlLFxuICAgICAgICAzKVxuICAgIH0gZWxzZSB7XG4gICAgICBnbC5idWZmZXJEYXRhKEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSLCBieXRlTGVuZ3RoLCB1c2FnZSlcbiAgICAgIGVsZW1lbnRzLmJ1ZmZlci5kdHlwZSA9IGR0eXBlIHx8IEdMX1VOU0lHTkVEX0JZVEVcbiAgICAgIGVsZW1lbnRzLmJ1ZmZlci51c2FnZSA9IHVzYWdlXG4gICAgICBlbGVtZW50cy5idWZmZXIuZGltZW5zaW9uID0gM1xuICAgICAgZWxlbWVudHMuYnVmZmVyLmJ5dGVMZW5ndGggPSBieXRlTGVuZ3RoXG4gICAgfVxuXG4gICAgdmFyIGR0eXBlID0gdHlwZVxuICAgIGlmICghdHlwZSkge1xuICAgICAgc3dpdGNoIChlbGVtZW50cy5idWZmZXIuZHR5cGUpIHtcbiAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9CWVRFOlxuICAgICAgICBjYXNlIEdMX0JZVEU6XG4gICAgICAgICAgZHR5cGUgPSBHTF9VTlNJR05FRF9CWVRFXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUOlxuICAgICAgICBjYXNlIEdMX1NIT1JUOlxuICAgICAgICAgIGR0eXBlID0gR0xfVU5TSUdORURfU0hPUlRcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfVU5TSUdORURfSU5UOlxuICAgICAgICBjYXNlIEdMX0lOVDpcbiAgICAgICAgICBkdHlwZSA9IEdMX1VOU0lHTkVEX0lOVFxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICBcbiAgICAgIH1cbiAgICAgIGVsZW1lbnRzLmJ1ZmZlci5kdHlwZSA9IGR0eXBlXG4gICAgfVxuICAgIGVsZW1lbnRzLnR5cGUgPSBkdHlwZVxuXG4gICAgLy8gQ2hlY2sgb2VzX2VsZW1lbnRfaW5kZXhfdWludCBleHRlbnNpb25cbiAgICBcblxuICAgIC8vIHRyeSB0byBndWVzcyBkZWZhdWx0IHByaW1pdGl2ZSB0eXBlIGFuZCBhcmd1bWVudHNcbiAgICB2YXIgdmVydENvdW50ID0gY291bnRcbiAgICBpZiAodmVydENvdW50IDwgMCkge1xuICAgICAgdmVydENvdW50ID0gZWxlbWVudHMuYnVmZmVyLmJ5dGVMZW5ndGhcbiAgICAgIGlmIChkdHlwZSA9PT0gR0xfVU5TSUdORURfU0hPUlQpIHtcbiAgICAgICAgdmVydENvdW50ID4+PSAxXG4gICAgICB9IGVsc2UgaWYgKGR0eXBlID09PSBHTF9VTlNJR05FRF9JTlQpIHtcbiAgICAgICAgdmVydENvdW50ID4+PSAyXG4gICAgICB9XG4gICAgfVxuICAgIGVsZW1lbnRzLnZlcnRDb3VudCA9IHZlcnRDb3VudFxuXG4gICAgLy8gdHJ5IHRvIGd1ZXNzIHByaW1pdGl2ZSB0eXBlIGZyb20gY2VsbCBkaW1lbnNpb25cbiAgICB2YXIgcHJpbVR5cGUgPSBwcmltXG4gICAgaWYgKHByaW0gPCAwKSB7XG4gICAgICBwcmltVHlwZSA9IEdMX1RSSUFOR0xFU1xuICAgICAgdmFyIGRpbWVuc2lvbiA9IGVsZW1lbnRzLmJ1ZmZlci5kaW1lbnNpb25cbiAgICAgIGlmIChkaW1lbnNpb24gPT09IDEpIHByaW1UeXBlID0gR0xfUE9JTlRTXG4gICAgICBpZiAoZGltZW5zaW9uID09PSAyKSBwcmltVHlwZSA9IEdMX0xJTkVTXG4gICAgICBpZiAoZGltZW5zaW9uID09PSAzKSBwcmltVHlwZSA9IEdMX1RSSUFOR0xFU1xuICAgIH1cbiAgICBlbGVtZW50cy5wcmltVHlwZSA9IHByaW1UeXBlXG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95RWxlbWVudHMgKGVsZW1lbnRzKSB7XG4gICAgc3RhdHMuZWxlbWVudHNDb3VudC0tXG5cbiAgICBcbiAgICBkZWxldGUgZWxlbWVudFNldFtlbGVtZW50cy5pZF1cbiAgICBlbGVtZW50cy5idWZmZXIuZGVzdHJveSgpXG4gICAgZWxlbWVudHMuYnVmZmVyID0gbnVsbFxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlRWxlbWVudHMgKG9wdGlvbnMsIHBlcnNpc3RlbnQpIHtcbiAgICB2YXIgYnVmZmVyID0gYnVmZmVyU3RhdGUuY3JlYXRlKG51bGwsIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSLCB0cnVlKVxuICAgIHZhciBlbGVtZW50cyA9IG5ldyBSRUdMRWxlbWVudEJ1ZmZlcihidWZmZXIuX2J1ZmZlcilcbiAgICBzdGF0cy5lbGVtZW50c0NvdW50KytcblxuICAgIGZ1bmN0aW9uIHJlZ2xFbGVtZW50cyAob3B0aW9ucykge1xuICAgICAgaWYgKCFvcHRpb25zKSB7XG4gICAgICAgIGJ1ZmZlcigpXG4gICAgICAgIGVsZW1lbnRzLnByaW1UeXBlID0gR0xfVFJJQU5HTEVTXG4gICAgICAgIGVsZW1lbnRzLnZlcnRDb3VudCA9IDBcbiAgICAgICAgZWxlbWVudHMudHlwZSA9IEdMX1VOU0lHTkVEX0JZVEVcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIG9wdGlvbnMgPT09ICdudW1iZXInKSB7XG4gICAgICAgIGJ1ZmZlcihvcHRpb25zKVxuICAgICAgICBlbGVtZW50cy5wcmltVHlwZSA9IEdMX1RSSUFOR0xFU1xuICAgICAgICBlbGVtZW50cy52ZXJ0Q291bnQgPSBvcHRpb25zIHwgMFxuICAgICAgICBlbGVtZW50cy50eXBlID0gR0xfVU5TSUdORURfQllURVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIGRhdGEgPSBudWxsXG4gICAgICAgIHZhciB1c2FnZSA9IEdMX1NUQVRJQ19EUkFXXG4gICAgICAgIHZhciBwcmltVHlwZSA9IC0xXG4gICAgICAgIHZhciB2ZXJ0Q291bnQgPSAtMVxuICAgICAgICB2YXIgYnl0ZUxlbmd0aCA9IDBcbiAgICAgICAgdmFyIGR0eXBlID0gMFxuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShvcHRpb25zKSB8fFxuICAgICAgICAgICAgaXNUeXBlZEFycmF5KG9wdGlvbnMpIHx8XG4gICAgICAgICAgICBpc05EQXJyYXlMaWtlKG9wdGlvbnMpKSB7XG4gICAgICAgICAgZGF0YSA9IG9wdGlvbnNcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBcbiAgICAgICAgICBpZiAoJ2RhdGEnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGRhdGEgPSBvcHRpb25zLmRhdGFcbiAgICAgICAgICAgIFxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoJ3VzYWdlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHVzYWdlID0gdXNhZ2VUeXBlc1tvcHRpb25zLnVzYWdlXVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoJ3ByaW1pdGl2ZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBwcmltVHlwZSA9IHByaW1UeXBlc1tvcHRpb25zLnByaW1pdGl2ZV1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCdjb3VudCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgXG4gICAgICAgICAgICB2ZXJ0Q291bnQgPSBvcHRpb25zLmNvdW50IHwgMFxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoJ3R5cGUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZHR5cGUgPSBlbGVtZW50VHlwZXNbb3B0aW9ucy50eXBlXVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoJ2xlbmd0aCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgYnl0ZUxlbmd0aCA9IG9wdGlvbnMubGVuZ3RoIHwgMFxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBieXRlTGVuZ3RoID0gdmVydENvdW50XG4gICAgICAgICAgICBpZiAoZHR5cGUgPT09IEdMX1VOU0lHTkVEX1NIT1JUIHx8IGR0eXBlID09PSBHTF9TSE9SVCkge1xuICAgICAgICAgICAgICBieXRlTGVuZ3RoICo9IDJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZHR5cGUgPT09IEdMX1VOU0lHTkVEX0lOVCB8fCBkdHlwZSA9PT0gR0xfSU5UKSB7XG4gICAgICAgICAgICAgIGJ5dGVMZW5ndGggKj0gNFxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpbml0RWxlbWVudHMoXG4gICAgICAgICAgZWxlbWVudHMsXG4gICAgICAgICAgZGF0YSxcbiAgICAgICAgICB1c2FnZSxcbiAgICAgICAgICBwcmltVHlwZSxcbiAgICAgICAgICB2ZXJ0Q291bnQsXG4gICAgICAgICAgYnl0ZUxlbmd0aCxcbiAgICAgICAgICBkdHlwZSlcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJlZ2xFbGVtZW50c1xuICAgIH1cblxuICAgIHJlZ2xFbGVtZW50cyhvcHRpb25zKVxuXG4gICAgcmVnbEVsZW1lbnRzLl9yZWdsVHlwZSA9ICdlbGVtZW50cydcbiAgICByZWdsRWxlbWVudHMuX2VsZW1lbnRzID0gZWxlbWVudHNcbiAgICByZWdsRWxlbWVudHMuc3ViZGF0YSA9IGZ1bmN0aW9uIChkYXRhLCBvZmZzZXQpIHtcbiAgICAgIGJ1ZmZlci5zdWJkYXRhKGRhdGEsIG9mZnNldClcbiAgICAgIHJldHVybiByZWdsRWxlbWVudHNcbiAgICB9XG4gICAgcmVnbEVsZW1lbnRzLmRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7XG4gICAgICBkZXN0cm95RWxlbWVudHMoZWxlbWVudHMpXG4gICAgfVxuXG4gICAgcmV0dXJuIHJlZ2xFbGVtZW50c1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjcmVhdGU6IGNyZWF0ZUVsZW1lbnRzLFxuICAgIGNyZWF0ZVN0cmVhbTogY3JlYXRlRWxlbWVudFN0cmVhbSxcbiAgICBkZXN0cm95U3RyZWFtOiBkZXN0cm95RWxlbWVudFN0cmVhbSxcbiAgICBnZXRFbGVtZW50czogZnVuY3Rpb24gKGVsZW1lbnRzKSB7XG4gICAgICBpZiAodHlwZW9mIGVsZW1lbnRzID09PSAnZnVuY3Rpb24nICYmXG4gICAgICAgICAgZWxlbWVudHMuX2VsZW1lbnRzIGluc3RhbmNlb2YgUkVHTEVsZW1lbnRCdWZmZXIpIHtcbiAgICAgICAgcmV0dXJuIGVsZW1lbnRzLl9lbGVtZW50c1xuICAgICAgfVxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9LFxuICAgIGNsZWFyOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YWx1ZXMoZWxlbWVudFNldCkuZm9yRWFjaChkZXN0cm95RWxlbWVudHMpXG4gICAgfVxuICB9XG59XG4iLCJcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjcmVhdGVFeHRlbnNpb25DYWNoZSAoZ2wsIGNvbmZpZykge1xuICB2YXIgZXh0ZW5zaW9ucyA9IHt9XG5cbiAgZnVuY3Rpb24gdHJ5TG9hZEV4dGVuc2lvbiAobmFtZV8pIHtcbiAgICBcbiAgICB2YXIgbmFtZSA9IG5hbWVfLnRvTG93ZXJDYXNlKClcbiAgICB2YXIgZXh0XG4gICAgdHJ5IHtcbiAgICAgIGV4dCA9IGV4dGVuc2lvbnNbbmFtZV0gPSBnbC5nZXRFeHRlbnNpb24obmFtZSlcbiAgICB9IGNhdGNoIChlKSB7fVxuICAgIHJldHVybiAhIWV4dFxuICB9XG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBjb25maWcuZXh0ZW5zaW9ucy5sZW5ndGg7ICsraSkge1xuICAgIHZhciBuYW1lID0gY29uZmlnLmV4dGVuc2lvbnNbaV1cbiAgICBpZiAoIXRyeUxvYWRFeHRlbnNpb24obmFtZSkpIHtcbiAgICAgIGNvbmZpZy5vbkRlc3Ryb3koKVxuICAgICAgY29uZmlnLm9uRG9uZSgnXCInICsgbmFtZSArICdcIiBleHRlbnNpb24gaXMgbm90IHN1cHBvcnRlZCBieSB0aGUgY3VycmVudCBXZWJHTCBjb250ZXh0LCB0cnkgdXBncmFkaW5nIHlvdXIgc3lzdGVtIG9yIGEgZGlmZmVyZW50IGJyb3dzZXInKVxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG4gIH1cblxuICBjb25maWcub3B0aW9uYWxFeHRlbnNpb25zLmZvckVhY2godHJ5TG9hZEV4dGVuc2lvbilcblxuICByZXR1cm4ge1xuICAgIGV4dGVuc2lvbnM6IGV4dGVuc2lvbnMsXG4gICAgcmVzdG9yZTogZnVuY3Rpb24gKCkge1xuICAgICAgT2JqZWN0LmtleXMoZXh0ZW5zaW9ucykuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgICBpZiAoIXRyeUxvYWRFeHRlbnNpb24obmFtZSkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJyhyZWdsKTogZXJyb3IgcmVzdG9yaW5nIGV4dGVuc2lvbiAnICsgbmFtZSlcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICB9XG4gIH1cbn1cbiIsIlxudmFyIHZhbHVlcyA9IHJlcXVpcmUoJy4vdXRpbC92YWx1ZXMnKVxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vdXRpbC9leHRlbmQnKVxuXG4vLyBXZSBzdG9yZSB0aGVzZSBjb25zdGFudHMgc28gdGhhdCB0aGUgbWluaWZpZXIgY2FuIGlubGluZSB0aGVtXG52YXIgR0xfRlJBTUVCVUZGRVIgPSAweDhENDBcbnZhciBHTF9SRU5ERVJCVUZGRVIgPSAweDhENDFcblxudmFyIEdMX1RFWFRVUkVfMkQgPSAweDBERTFcbnZhciBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1ggPSAweDg1MTVcblxudmFyIEdMX0NPTE9SX0FUVEFDSE1FTlQwID0gMHg4Q0UwXG52YXIgR0xfREVQVEhfQVRUQUNITUVOVCA9IDB4OEQwMFxudmFyIEdMX1NURU5DSUxfQVRUQUNITUVOVCA9IDB4OEQyMFxudmFyIEdMX0RFUFRIX1NURU5DSUxfQVRUQUNITUVOVCA9IDB4ODIxQVxuXG52YXIgR0xfRlJBTUVCVUZGRVJfQ09NUExFVEUgPSAweDhDRDVcbnZhciBHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX0FUVEFDSE1FTlQgPSAweDhDRDZcbnZhciBHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX01JU1NJTkdfQVRUQUNITUVOVCA9IDB4OENEN1xudmFyIEdMX0ZSQU1FQlVGRkVSX0lOQ09NUExFVEVfRElNRU5TSU9OUyA9IDB4OENEOVxudmFyIEdMX0ZSQU1FQlVGRkVSX1VOU1VQUE9SVEVEID0gMHg4Q0REXG5cbnZhciBHTF9IQUxGX0ZMT0FUX09FUyA9IDB4OEQ2MVxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSAweDE0MDFcbnZhciBHTF9GTE9BVCA9IDB4MTQwNlxuXG52YXIgR0xfUkdCQSA9IDB4MTkwOFxuXG52YXIgR0xfREVQVEhfQ09NUE9ORU5UID0gMHgxOTAyXG5cbnZhciBjb2xvclRleHR1cmVGb3JtYXRFbnVtcyA9IFtcbiAgR0xfUkdCQVxuXVxuXG4vLyBmb3IgZXZlcnkgdGV4dHVyZSBmb3JtYXQsIHN0b3JlXG4vLyB0aGUgbnVtYmVyIG9mIGNoYW5uZWxzXG52YXIgdGV4dHVyZUZvcm1hdENoYW5uZWxzID0gW11cbnRleHR1cmVGb3JtYXRDaGFubmVsc1tHTF9SR0JBXSA9IDRcblxuLy8gZm9yIGV2ZXJ5IHRleHR1cmUgdHlwZSwgc3RvcmVcbi8vIHRoZSBzaXplIGluIGJ5dGVzLlxudmFyIHRleHR1cmVUeXBlU2l6ZXMgPSBbXVxudGV4dHVyZVR5cGVTaXplc1tHTF9VTlNJR05FRF9CWVRFXSA9IDFcbnRleHR1cmVUeXBlU2l6ZXNbR0xfRkxPQVRdID0gNFxudGV4dHVyZVR5cGVTaXplc1tHTF9IQUxGX0ZMT0FUX09FU10gPSAyXG5cbnZhciBHTF9SR0JBNCA9IDB4ODA1NlxudmFyIEdMX1JHQjVfQTEgPSAweDgwNTdcbnZhciBHTF9SR0I1NjUgPSAweDhENjJcbnZhciBHTF9ERVBUSF9DT01QT05FTlQxNiA9IDB4ODFBNVxudmFyIEdMX1NURU5DSUxfSU5ERVg4ID0gMHg4RDQ4XG52YXIgR0xfREVQVEhfU1RFTkNJTCA9IDB4ODRGOVxuXG52YXIgR0xfU1JHQjhfQUxQSEE4X0VYVCA9IDB4OEM0M1xuXG52YXIgR0xfUkdCQTMyRl9FWFQgPSAweDg4MTRcblxudmFyIEdMX1JHQkExNkZfRVhUID0gMHg4ODFBXG52YXIgR0xfUkdCMTZGX0VYVCA9IDB4ODgxQlxuXG52YXIgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRFbnVtcyA9IFtcbiAgR0xfUkdCQTQsXG4gIEdMX1JHQjVfQTEsXG4gIEdMX1JHQjU2NSxcbiAgR0xfU1JHQjhfQUxQSEE4X0VYVCxcbiAgR0xfUkdCQTE2Rl9FWFQsXG4gIEdMX1JHQjE2Rl9FWFQsXG4gIEdMX1JHQkEzMkZfRVhUXG5dXG5cbnZhciBzdGF0dXNDb2RlID0ge31cbnN0YXR1c0NvZGVbR0xfRlJBTUVCVUZGRVJfQ09NUExFVEVdID0gJ2NvbXBsZXRlJ1xuc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX0FUVEFDSE1FTlRdID0gJ2luY29tcGxldGUgYXR0YWNobWVudCdcbnN0YXR1c0NvZGVbR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9ESU1FTlNJT05TXSA9ICdpbmNvbXBsZXRlIGRpbWVuc2lvbnMnXG5zdGF0dXNDb2RlW0dMX0ZSQU1FQlVGRkVSX0lOQ09NUExFVEVfTUlTU0lOR19BVFRBQ0hNRU5UXSA9ICdpbmNvbXBsZXRlLCBtaXNzaW5nIGF0dGFjaG1lbnQnXG5zdGF0dXNDb2RlW0dMX0ZSQU1FQlVGRkVSX1VOU1VQUE9SVEVEXSA9ICd1bnN1cHBvcnRlZCdcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwRkJPU3RhdGUgKFxuICBnbCxcbiAgZXh0ZW5zaW9ucyxcbiAgbGltaXRzLFxuICB0ZXh0dXJlU3RhdGUsXG4gIHJlbmRlcmJ1ZmZlclN0YXRlLFxuICBzdGF0cykge1xuICB2YXIgZnJhbWVidWZmZXJTdGF0ZSA9IHtcbiAgICBjdXI6IG51bGwsXG4gICAgbmV4dDogbnVsbCxcbiAgICBkaXJ0eTogZmFsc2VcbiAgfVxuXG4gIHZhciBjb2xvclRleHR1cmVGb3JtYXRzID0gWydyZ2JhJ11cbiAgdmFyIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0cyA9IFsncmdiYTQnLCAncmdiNTY1JywgJ3JnYjUgYTEnXVxuXG4gIGlmIChleHRlbnNpb25zLmV4dF9zcmdiKSB7XG4gICAgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzLnB1c2goJ3NyZ2JhJylcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLmV4dF9jb2xvcl9idWZmZXJfaGFsZl9mbG9hdCkge1xuICAgIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0cy5wdXNoKCdyZ2JhMTZmJywgJ3JnYjE2ZicpXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb2xvcl9idWZmZXJfZmxvYXQpIHtcbiAgICBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHMucHVzaCgncmdiYTMyZicpXG4gIH1cblxuICB2YXIgY29sb3JUeXBlcyA9IFsndWludDgnXVxuICBpZiAoZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9oYWxmX2Zsb2F0KSB7XG4gICAgY29sb3JUeXBlcy5wdXNoKCdoYWxmIGZsb2F0JywgJ2Zsb2F0MTYnKVxuICB9XG4gIGlmIChleHRlbnNpb25zLm9lc190ZXh0dXJlX2Zsb2F0KSB7XG4gICAgY29sb3JUeXBlcy5wdXNoKCdmbG9hdCcsICdmbG9hdDMyJylcbiAgfVxuXG4gIGZ1bmN0aW9uIEZyYW1lYnVmZmVyQXR0YWNobWVudCAodGFyZ2V0LCB0ZXh0dXJlLCByZW5kZXJidWZmZXIpIHtcbiAgICB0aGlzLnRhcmdldCA9IHRhcmdldFxuICAgIHRoaXMudGV4dHVyZSA9IHRleHR1cmVcbiAgICB0aGlzLnJlbmRlcmJ1ZmZlciA9IHJlbmRlcmJ1ZmZlclxuXG4gICAgdmFyIHcgPSAwXG4gICAgdmFyIGggPSAwXG4gICAgaWYgKHRleHR1cmUpIHtcbiAgICAgIHcgPSB0ZXh0dXJlLndpZHRoXG4gICAgICBoID0gdGV4dHVyZS5oZWlnaHRcbiAgICB9IGVsc2UgaWYgKHJlbmRlcmJ1ZmZlcikge1xuICAgICAgdyA9IHJlbmRlcmJ1ZmZlci53aWR0aFxuICAgICAgaCA9IHJlbmRlcmJ1ZmZlci5oZWlnaHRcbiAgICB9XG4gICAgdGhpcy53aWR0aCA9IHdcbiAgICB0aGlzLmhlaWdodCA9IGhcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlY1JlZiAoYXR0YWNobWVudCkge1xuICAgIGlmIChhdHRhY2htZW50KSB7XG4gICAgICBpZiAoYXR0YWNobWVudC50ZXh0dXJlKSB7XG4gICAgICAgIGF0dGFjaG1lbnQudGV4dHVyZS5fdGV4dHVyZS5kZWNSZWYoKVxuICAgICAgfVxuICAgICAgaWYgKGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyKSB7XG4gICAgICAgIGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXIuZGVjUmVmKClcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBpbmNSZWZBbmRDaGVja1NoYXBlIChhdHRhY2htZW50LCB3aWR0aCwgaGVpZ2h0KSB7XG4gICAgaWYgKCFhdHRhY2htZW50KSB7XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgaWYgKGF0dGFjaG1lbnQudGV4dHVyZSkge1xuICAgICAgdmFyIHRleHR1cmUgPSBhdHRhY2htZW50LnRleHR1cmUuX3RleHR1cmVcbiAgICAgIHZhciB0dyA9IE1hdGgubWF4KDEsIHRleHR1cmUud2lkdGgpXG4gICAgICB2YXIgdGggPSBNYXRoLm1heCgxLCB0ZXh0dXJlLmhlaWdodClcbiAgICAgIFxuICAgICAgdGV4dHVyZS5yZWZDb3VudCArPSAxXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciByZW5kZXJidWZmZXIgPSBhdHRhY2htZW50LnJlbmRlcmJ1ZmZlci5fcmVuZGVyYnVmZmVyXG4gICAgICBcbiAgICAgIHJlbmRlcmJ1ZmZlci5yZWZDb3VudCArPSAxXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gYXR0YWNoIChsb2NhdGlvbiwgYXR0YWNobWVudCkge1xuICAgIGlmIChhdHRhY2htZW50KSB7XG4gICAgICBpZiAoYXR0YWNobWVudC50ZXh0dXJlKSB7XG4gICAgICAgIGdsLmZyYW1lYnVmZmVyVGV4dHVyZTJEKFxuICAgICAgICAgIEdMX0ZSQU1FQlVGRkVSLFxuICAgICAgICAgIGxvY2F0aW9uLFxuICAgICAgICAgIGF0dGFjaG1lbnQudGFyZ2V0LFxuICAgICAgICAgIGF0dGFjaG1lbnQudGV4dHVyZS5fdGV4dHVyZS50ZXh0dXJlLFxuICAgICAgICAgIDApXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBnbC5mcmFtZWJ1ZmZlclJlbmRlcmJ1ZmZlcihcbiAgICAgICAgICBHTF9GUkFNRUJVRkZFUixcbiAgICAgICAgICBsb2NhdGlvbixcbiAgICAgICAgICBHTF9SRU5ERVJCVUZGRVIsXG4gICAgICAgICAgYXR0YWNobWVudC5yZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlci5yZW5kZXJidWZmZXIpXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VBdHRhY2htZW50IChhdHRhY2htZW50KSB7XG4gICAgdmFyIHRhcmdldCA9IEdMX1RFWFRVUkVfMkRcbiAgICB2YXIgdGV4dHVyZSA9IG51bGxcbiAgICB2YXIgcmVuZGVyYnVmZmVyID0gbnVsbFxuXG4gICAgdmFyIGRhdGEgPSBhdHRhY2htZW50XG4gICAgaWYgKHR5cGVvZiBhdHRhY2htZW50ID09PSAnb2JqZWN0Jykge1xuICAgICAgZGF0YSA9IGF0dGFjaG1lbnQuZGF0YVxuICAgICAgaWYgKCd0YXJnZXQnIGluIGF0dGFjaG1lbnQpIHtcbiAgICAgICAgdGFyZ2V0ID0gYXR0YWNobWVudC50YXJnZXQgfCAwXG4gICAgICB9XG4gICAgfVxuXG4gICAgXG5cbiAgICB2YXIgdHlwZSA9IGRhdGEuX3JlZ2xUeXBlXG4gICAgaWYgKHR5cGUgPT09ICd0ZXh0dXJlMmQnKSB7XG4gICAgICB0ZXh0dXJlID0gZGF0YVxuICAgICAgXG4gICAgfSBlbHNlIGlmICh0eXBlID09PSAndGV4dHVyZUN1YmUnKSB7XG4gICAgICB0ZXh0dXJlID0gZGF0YVxuICAgICAgXG4gICAgfSBlbHNlIGlmICh0eXBlID09PSAncmVuZGVyYnVmZmVyJykge1xuICAgICAgcmVuZGVyYnVmZmVyID0gZGF0YVxuICAgICAgdGFyZ2V0ID0gR0xfUkVOREVSQlVGRkVSXG4gICAgfSBlbHNlIHtcbiAgICAgIFxuICAgIH1cblxuICAgIHJldHVybiBuZXcgRnJhbWVidWZmZXJBdHRhY2htZW50KHRhcmdldCwgdGV4dHVyZSwgcmVuZGVyYnVmZmVyKVxuICB9XG5cbiAgZnVuY3Rpb24gYWxsb2NBdHRhY2htZW50IChcbiAgICB3aWR0aCxcbiAgICBoZWlnaHQsXG4gICAgaXNUZXh0dXJlLFxuICAgIGZvcm1hdCxcbiAgICB0eXBlKSB7XG4gICAgaWYgKGlzVGV4dHVyZSkge1xuICAgICAgdmFyIHRleHR1cmUgPSB0ZXh0dXJlU3RhdGUuY3JlYXRlMkQoe1xuICAgICAgICB3aWR0aDogd2lkdGgsXG4gICAgICAgIGhlaWdodDogaGVpZ2h0LFxuICAgICAgICBmb3JtYXQ6IGZvcm1hdCxcbiAgICAgICAgdHlwZTogdHlwZVxuICAgICAgfSlcbiAgICAgIHRleHR1cmUuX3RleHR1cmUucmVmQ291bnQgPSAwXG4gICAgICByZXR1cm4gbmV3IEZyYW1lYnVmZmVyQXR0YWNobWVudChHTF9URVhUVVJFXzJELCB0ZXh0dXJlLCBudWxsKVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgcmIgPSByZW5kZXJidWZmZXJTdGF0ZS5jcmVhdGUoe1xuICAgICAgICB3aWR0aDogd2lkdGgsXG4gICAgICAgIGhlaWdodDogaGVpZ2h0LFxuICAgICAgICBmb3JtYXQ6IGZvcm1hdFxuICAgICAgfSlcbiAgICAgIHJiLl9yZW5kZXJidWZmZXIucmVmQ291bnQgPSAwXG4gICAgICByZXR1cm4gbmV3IEZyYW1lYnVmZmVyQXR0YWNobWVudChHTF9SRU5ERVJCVUZGRVIsIG51bGwsIHJiKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHVud3JhcEF0dGFjaG1lbnQgKGF0dGFjaG1lbnQpIHtcbiAgICByZXR1cm4gYXR0YWNobWVudCAmJiAoYXR0YWNobWVudC50ZXh0dXJlIHx8IGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyKVxuICB9XG5cbiAgZnVuY3Rpb24gcmVzaXplQXR0YWNobWVudCAoYXR0YWNobWVudCwgdywgaCkge1xuICAgIGlmIChhdHRhY2htZW50KSB7XG4gICAgICBpZiAoYXR0YWNobWVudC50ZXh0dXJlKSB7XG4gICAgICAgIGF0dGFjaG1lbnQudGV4dHVyZS5yZXNpemUodywgaClcbiAgICAgIH0gZWxzZSBpZiAoYXR0YWNobWVudC5yZW5kZXJidWZmZXIpIHtcbiAgICAgICAgYXR0YWNobWVudC5yZW5kZXJidWZmZXIucmVzaXplKHcsIGgpXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgdmFyIGZyYW1lYnVmZmVyQ291bnQgPSAwXG4gIHZhciBmcmFtZWJ1ZmZlclNldCA9IHt9XG5cbiAgZnVuY3Rpb24gUkVHTEZyYW1lYnVmZmVyICgpIHtcbiAgICB0aGlzLmlkID0gZnJhbWVidWZmZXJDb3VudCsrXG4gICAgZnJhbWVidWZmZXJTZXRbdGhpcy5pZF0gPSB0aGlzXG5cbiAgICB0aGlzLmZyYW1lYnVmZmVyID0gZ2wuY3JlYXRlRnJhbWVidWZmZXIoKVxuICAgIHRoaXMud2lkdGggPSAwXG4gICAgdGhpcy5oZWlnaHQgPSAwXG5cbiAgICB0aGlzLmNvbG9yQXR0YWNobWVudHMgPSBbXVxuICAgIHRoaXMuZGVwdGhBdHRhY2htZW50ID0gbnVsbFxuICAgIHRoaXMuc3RlbmNpbEF0dGFjaG1lbnQgPSBudWxsXG4gICAgdGhpcy5kZXB0aFN0ZW5jaWxBdHRhY2htZW50ID0gbnVsbFxuICB9XG5cbiAgZnVuY3Rpb24gZGVjRkJPUmVmcyAoZnJhbWVidWZmZXIpIHtcbiAgICBmcmFtZWJ1ZmZlci5jb2xvckF0dGFjaG1lbnRzLmZvckVhY2goZGVjUmVmKVxuICAgIGRlY1JlZihmcmFtZWJ1ZmZlci5kZXB0aEF0dGFjaG1lbnQpXG4gICAgZGVjUmVmKGZyYW1lYnVmZmVyLnN0ZW5jaWxBdHRhY2htZW50KVxuICAgIGRlY1JlZihmcmFtZWJ1ZmZlci5kZXB0aFN0ZW5jaWxBdHRhY2htZW50KVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSAoZnJhbWVidWZmZXIpIHtcbiAgICB2YXIgaGFuZGxlID0gZnJhbWVidWZmZXIuZnJhbWVidWZmZXJcbiAgICBcbiAgICBnbC5kZWxldGVGcmFtZWJ1ZmZlcihoYW5kbGUpXG4gICAgZnJhbWVidWZmZXIuZnJhbWVidWZmZXIgPSBudWxsXG4gICAgc3RhdHMuZnJhbWVidWZmZXJDb3VudC0tXG4gICAgZGVsZXRlIGZyYW1lYnVmZmVyU2V0W2ZyYW1lYnVmZmVyLmlkXVxuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlRnJhbWVidWZmZXIgKGZyYW1lYnVmZmVyKSB7XG4gICAgdmFyIGlcblxuICAgIGdsLmJpbmRGcmFtZWJ1ZmZlcihHTF9GUkFNRUJVRkZFUiwgZnJhbWVidWZmZXIuZnJhbWVidWZmZXIpXG4gICAgdmFyIGNvbG9yQXR0YWNobWVudHMgPSBmcmFtZWJ1ZmZlci5jb2xvckF0dGFjaG1lbnRzXG4gICAgZm9yIChpID0gMDsgaSA8IGNvbG9yQXR0YWNobWVudHMubGVuZ3RoOyArK2kpIHtcbiAgICAgIGF0dGFjaChHTF9DT0xPUl9BVFRBQ0hNRU5UMCArIGksIGNvbG9yQXR0YWNobWVudHNbaV0pXG4gICAgfVxuICAgIGZvciAoaSA9IGNvbG9yQXR0YWNobWVudHMubGVuZ3RoOyBpIDwgbGltaXRzLm1heENvbG9yQXR0YWNobWVudHM7ICsraSkge1xuICAgICAgZ2wuZnJhbWVidWZmZXJUZXh0dXJlMkQoXG4gICAgICAgIEdMX0ZSQU1FQlVGRkVSLFxuICAgICAgICBHTF9DT0xPUl9BVFRBQ0hNRU5UMCArIGksXG4gICAgICAgIEdMX1RFWFRVUkVfMkQsXG4gICAgICAgIG51bGwsXG4gICAgICAgIDApXG4gICAgfVxuXG4gICAgZ2wuZnJhbWVidWZmZXJUZXh0dXJlMkQoXG4gICAgICBHTF9GUkFNRUJVRkZFUixcbiAgICAgIEdMX0RFUFRIX1NURU5DSUxfQVRUQUNITUVOVCxcbiAgICAgIEdMX1RFWFRVUkVfMkQsXG4gICAgICBudWxsLFxuICAgICAgMClcbiAgICBnbC5mcmFtZWJ1ZmZlclRleHR1cmUyRChcbiAgICAgIEdMX0ZSQU1FQlVGRkVSLFxuICAgICAgR0xfREVQVEhfQVRUQUNITUVOVCxcbiAgICAgIEdMX1RFWFRVUkVfMkQsXG4gICAgICBudWxsLFxuICAgICAgMClcbiAgICBnbC5mcmFtZWJ1ZmZlclRleHR1cmUyRChcbiAgICAgIEdMX0ZSQU1FQlVGRkVSLFxuICAgICAgR0xfU1RFTkNJTF9BVFRBQ0hNRU5ULFxuICAgICAgR0xfVEVYVFVSRV8yRCxcbiAgICAgIG51bGwsXG4gICAgICAwKVxuXG4gICAgYXR0YWNoKEdMX0RFUFRIX0FUVEFDSE1FTlQsIGZyYW1lYnVmZmVyLmRlcHRoQXR0YWNobWVudClcbiAgICBhdHRhY2goR0xfU1RFTkNJTF9BVFRBQ0hNRU5ULCBmcmFtZWJ1ZmZlci5zdGVuY2lsQXR0YWNobWVudClcbiAgICBhdHRhY2goR0xfREVQVEhfU1RFTkNJTF9BVFRBQ0hNRU5ULCBmcmFtZWJ1ZmZlci5kZXB0aFN0ZW5jaWxBdHRhY2htZW50KVxuXG4gICAgLy8gQ2hlY2sgc3RhdHVzIGNvZGVcbiAgICB2YXIgc3RhdHVzID0gZ2wuY2hlY2tGcmFtZWJ1ZmZlclN0YXR1cyhHTF9GUkFNRUJVRkZFUilcbiAgICBpZiAoc3RhdHVzICE9PSBHTF9GUkFNRUJVRkZFUl9DT01QTEVURSkge1xuICAgICAgXG4gICAgfVxuXG4gICAgZ2wuYmluZEZyYW1lYnVmZmVyKEdMX0ZSQU1FQlVGRkVSLCBmcmFtZWJ1ZmZlclN0YXRlLm5leHQpXG4gICAgZnJhbWVidWZmZXJTdGF0ZS5jdXIgPSBmcmFtZWJ1ZmZlclN0YXRlLm5leHRcblxuICAgIC8vIEZJWE1FOiBDbGVhciBlcnJvciBjb2RlIGhlcmUuICBUaGlzIGlzIGEgd29yayBhcm91bmQgZm9yIGEgYnVnIGluXG4gICAgLy8gaGVhZGxlc3MtZ2xcbiAgICBnbC5nZXRFcnJvcigpXG4gIH1cblxuICBmdW5jdGlvbiBjcmVhdGVGQk8gKGEwLCBhMSkge1xuICAgIHZhciBmcmFtZWJ1ZmZlciA9IG5ldyBSRUdMRnJhbWVidWZmZXIoKVxuICAgIHN0YXRzLmZyYW1lYnVmZmVyQ291bnQrK1xuXG4gICAgZnVuY3Rpb24gcmVnbEZyYW1lYnVmZmVyIChhLCBiKSB7XG4gICAgICB2YXIgaVxuXG4gICAgICBcblxuICAgICAgdmFyIGV4dERyYXdCdWZmZXJzID0gZXh0ZW5zaW9ucy53ZWJnbF9kcmF3X2J1ZmZlcnNcblxuICAgICAgdmFyIHdpZHRoID0gMFxuICAgICAgdmFyIGhlaWdodCA9IDBcblxuICAgICAgdmFyIG5lZWRzRGVwdGggPSB0cnVlXG4gICAgICB2YXIgbmVlZHNTdGVuY2lsID0gdHJ1ZVxuXG4gICAgICB2YXIgY29sb3JCdWZmZXIgPSBudWxsXG4gICAgICB2YXIgY29sb3JUZXh0dXJlID0gdHJ1ZVxuICAgICAgdmFyIGNvbG9yRm9ybWF0ID0gJ3JnYmEnXG4gICAgICB2YXIgY29sb3JUeXBlID0gJ3VpbnQ4J1xuICAgICAgdmFyIGNvbG9yQ291bnQgPSAxXG5cbiAgICAgIHZhciBkZXB0aEJ1ZmZlciA9IG51bGxcbiAgICAgIHZhciBzdGVuY2lsQnVmZmVyID0gbnVsbFxuICAgICAgdmFyIGRlcHRoU3RlbmNpbEJ1ZmZlciA9IG51bGxcbiAgICAgIHZhciBkZXB0aFN0ZW5jaWxUZXh0dXJlID0gZmFsc2VcblxuICAgICAgaWYgKHR5cGVvZiBhID09PSAnbnVtYmVyJykge1xuICAgICAgICB3aWR0aCA9IGEgfCAwXG4gICAgICAgIGhlaWdodCA9IChiIHwgMCkgfHwgd2lkdGhcbiAgICAgIH0gZWxzZSBpZiAoIWEpIHtcbiAgICAgICAgd2lkdGggPSBoZWlnaHQgPSAxXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBcbiAgICAgICAgdmFyIG9wdGlvbnMgPSBhXG5cbiAgICAgICAgaWYgKCdzaGFwZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHZhciBzaGFwZSA9IG9wdGlvbnMuc2hhcGVcbiAgICAgICAgICBcbiAgICAgICAgICB3aWR0aCA9IHNoYXBlWzBdXG4gICAgICAgICAgaGVpZ2h0ID0gc2hhcGVbMV1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAoJ3JhZGl1cycgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgd2lkdGggPSBoZWlnaHQgPSBvcHRpb25zLnJhZGl1c1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoJ3dpZHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICB3aWR0aCA9IG9wdGlvbnMud2lkdGhcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCdoZWlnaHQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGhlaWdodCA9IG9wdGlvbnMuaGVpZ2h0XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdjb2xvcicgaW4gb3B0aW9ucyB8fFxuICAgICAgICAgICAgJ2NvbG9ycycgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGNvbG9yQnVmZmVyID1cbiAgICAgICAgICAgIG9wdGlvbnMuY29sb3IgfHxcbiAgICAgICAgICAgIG9wdGlvbnMuY29sb3JzXG4gICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoY29sb3JCdWZmZXIpKSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWNvbG9yQnVmZmVyKSB7XG4gICAgICAgICAgaWYgKCdjb2xvckNvdW50JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBjb2xvckNvdW50ID0gb3B0aW9ucy5jb2xvckNvdW50IHwgMFxuICAgICAgICAgICAgXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKCdjb2xvclRleHR1cmUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGNvbG9yVGV4dHVyZSA9ICEhb3B0aW9ucy5jb2xvclRleHR1cmVcbiAgICAgICAgICAgIGNvbG9yRm9ybWF0ID0gJ3JnYmE0J1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmICgnY29sb3JUeXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBjb2xvclR5cGUgPSBvcHRpb25zLmNvbG9yVHlwZVxuICAgICAgICAgICAgaWYgKCFjb2xvclRleHR1cmUpIHtcbiAgICAgICAgICAgICAgaWYgKGNvbG9yVHlwZSA9PT0gJ2hhbGYgZmxvYXQnIHx8IGNvbG9yVHlwZSA9PT0gJ2Zsb2F0MTYnKSB7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgY29sb3JGb3JtYXQgPSAncmdiYTE2ZidcbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChjb2xvclR5cGUgPT09ICdmbG9hdCcgfHwgY29sb3JUeXBlID09PSAnZmxvYXQzMicpIHtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBjb2xvckZvcm1hdCA9ICdyZ2JhMzJmJ1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoJ2NvbG9yRm9ybWF0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBjb2xvckZvcm1hdCA9IG9wdGlvbnMuY29sb3JGb3JtYXRcbiAgICAgICAgICAgIGlmIChjb2xvclRleHR1cmVGb3JtYXRzLmluZGV4T2YoY29sb3JGb3JtYXQpID49IDApIHtcbiAgICAgICAgICAgICAgY29sb3JUZXh0dXJlID0gdHJ1ZVxuICAgICAgICAgICAgfSBlbHNlIGlmIChjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHMuaW5kZXhPZihjb2xvckZvcm1hdCkgPj0gMCkge1xuICAgICAgICAgICAgICBjb2xvclRleHR1cmUgPSBmYWxzZVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgaWYgKGNvbG9yVGV4dHVyZSkge1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdkZXB0aFRleHR1cmUnIGluIG9wdGlvbnMgfHwgJ2RlcHRoU3RlbmNpbFRleHR1cmUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBkZXB0aFN0ZW5jaWxUZXh0dXJlID0gISEob3B0aW9ucy5kZXB0aFRleHR1cmUgfHxcbiAgICAgICAgICAgIG9wdGlvbnMuZGVwdGhTdGVuY2lsVGV4dHVyZSlcbiAgICAgICAgICBcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnZGVwdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBpZiAodHlwZW9mIG9wdGlvbnMuZGVwdGggPT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgbmVlZHNEZXB0aCA9IG9wdGlvbnMuZGVwdGhcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZGVwdGhCdWZmZXIgPSBvcHRpb25zLmRlcHRoXG4gICAgICAgICAgICBuZWVkc1N0ZW5jaWwgPSBmYWxzZVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnc3RlbmNpbCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5zdGVuY2lsID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgIG5lZWRzU3RlbmNpbCA9IG9wdGlvbnMuc3RlbmNpbFxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzdGVuY2lsQnVmZmVyID0gb3B0aW9ucy5zdGVuY2lsXG4gICAgICAgICAgICBuZWVkc0RlcHRoID0gZmFsc2VcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ2RlcHRoU3RlbmNpbCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5kZXB0aFN0ZW5jaWwgPT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgbmVlZHNEZXB0aCA9IG5lZWRzU3RlbmNpbCA9IG9wdGlvbnMuZGVwdGhTdGVuY2lsXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGRlcHRoU3RlbmNpbEJ1ZmZlciA9IG9wdGlvbnMuZGVwdGhTdGVuY2lsXG4gICAgICAgICAgICBuZWVkc0RlcHRoID0gZmFsc2VcbiAgICAgICAgICAgIG5lZWRzU3RlbmNpbCA9IGZhbHNlXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIHBhcnNlIGF0dGFjaG1lbnRzXG4gICAgICB2YXIgY29sb3JBdHRhY2htZW50cyA9IG51bGxcbiAgICAgIHZhciBkZXB0aEF0dGFjaG1lbnQgPSBudWxsXG4gICAgICB2YXIgc3RlbmNpbEF0dGFjaG1lbnQgPSBudWxsXG4gICAgICB2YXIgZGVwdGhTdGVuY2lsQXR0YWNobWVudCA9IG51bGxcblxuICAgICAgLy8gU2V0IHVwIGNvbG9yIGF0dGFjaG1lbnRzXG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShjb2xvckJ1ZmZlcikpIHtcbiAgICAgICAgY29sb3JBdHRhY2htZW50cyA9IGNvbG9yQnVmZmVyLm1hcChwYXJzZUF0dGFjaG1lbnQpXG4gICAgICB9IGVsc2UgaWYgKGNvbG9yQnVmZmVyKSB7XG4gICAgICAgIGNvbG9yQXR0YWNobWVudHMgPSBbcGFyc2VBdHRhY2htZW50KGNvbG9yQnVmZmVyKV1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbG9yQXR0YWNobWVudHMgPSBuZXcgQXJyYXkoY29sb3JDb3VudClcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGNvbG9yQ291bnQ7ICsraSkge1xuICAgICAgICAgIGNvbG9yQXR0YWNobWVudHNbaV0gPSBhbGxvY0F0dGFjaG1lbnQoXG4gICAgICAgICAgICB3aWR0aCxcbiAgICAgICAgICAgIGhlaWdodCxcbiAgICAgICAgICAgIGNvbG9yVGV4dHVyZSxcbiAgICAgICAgICAgIGNvbG9yRm9ybWF0LFxuICAgICAgICAgICAgY29sb3JUeXBlKVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIFxuICAgICAgXG5cbiAgICAgIHdpZHRoID0gd2lkdGggfHwgY29sb3JBdHRhY2htZW50c1swXS53aWR0aFxuICAgICAgaGVpZ2h0ID0gaGVpZ2h0IHx8IGNvbG9yQXR0YWNobWVudHNbMF0uaGVpZ2h0XG5cbiAgICAgIGlmIChkZXB0aEJ1ZmZlcikge1xuICAgICAgICBkZXB0aEF0dGFjaG1lbnQgPSBwYXJzZUF0dGFjaG1lbnQoZGVwdGhCdWZmZXIpXG4gICAgICB9IGVsc2UgaWYgKG5lZWRzRGVwdGggJiYgIW5lZWRzU3RlbmNpbCkge1xuICAgICAgICBkZXB0aEF0dGFjaG1lbnQgPSBhbGxvY0F0dGFjaG1lbnQoXG4gICAgICAgICAgd2lkdGgsXG4gICAgICAgICAgaGVpZ2h0LFxuICAgICAgICAgIGRlcHRoU3RlbmNpbFRleHR1cmUsXG4gICAgICAgICAgJ2RlcHRoJyxcbiAgICAgICAgICAndWludDMyJylcbiAgICAgIH1cblxuICAgICAgaWYgKHN0ZW5jaWxCdWZmZXIpIHtcbiAgICAgICAgc3RlbmNpbEF0dGFjaG1lbnQgPSBwYXJzZUF0dGFjaG1lbnQoc3RlbmNpbEJ1ZmZlcilcbiAgICAgIH0gZWxzZSBpZiAobmVlZHNTdGVuY2lsICYmICFuZWVkc0RlcHRoKSB7XG4gICAgICAgIHN0ZW5jaWxBdHRhY2htZW50ID0gYWxsb2NBdHRhY2htZW50KFxuICAgICAgICAgIHdpZHRoLFxuICAgICAgICAgIGhlaWdodCxcbiAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICAnc3RlbmNpbCcsXG4gICAgICAgICAgJ3VpbnQ4JylcbiAgICAgIH1cblxuICAgICAgaWYgKGRlcHRoU3RlbmNpbEJ1ZmZlcikge1xuICAgICAgICBkZXB0aFN0ZW5jaWxBdHRhY2htZW50ID0gcGFyc2VBdHRhY2htZW50KGRlcHRoU3RlbmNpbEJ1ZmZlcilcbiAgICAgIH0gZWxzZSBpZiAoIWRlcHRoQnVmZmVyICYmICFzdGVuY2lsQnVmZmVyICYmIG5lZWRzU3RlbmNpbCAmJiBuZWVkc0RlcHRoKSB7XG4gICAgICAgIGRlcHRoU3RlbmNpbEF0dGFjaG1lbnQgPSBhbGxvY0F0dGFjaG1lbnQoXG4gICAgICAgICAgd2lkdGgsXG4gICAgICAgICAgaGVpZ2h0LFxuICAgICAgICAgIGRlcHRoU3RlbmNpbFRleHR1cmUsXG4gICAgICAgICAgJ2RlcHRoIHN0ZW5jaWwnLFxuICAgICAgICAgICdkZXB0aCBzdGVuY2lsJylcbiAgICAgIH1cblxuICAgICAgXG5cbiAgICAgIHZhciBjb21tb25Db2xvckF0dGFjaG1lbnRTaXplID0gbnVsbFxuXG4gICAgICBmb3IgKGkgPSAwOyBpIDwgY29sb3JBdHRhY2htZW50cy5sZW5ndGg7ICsraSkge1xuICAgICAgICBpbmNSZWZBbmRDaGVja1NoYXBlKGNvbG9yQXR0YWNobWVudHNbaV0sIHdpZHRoLCBoZWlnaHQpXG4gICAgICAgIFxuXG4gICAgICAgIGlmIChjb2xvckF0dGFjaG1lbnRzW2ldICYmIGNvbG9yQXR0YWNobWVudHNbaV0udGV4dHVyZSkge1xuICAgICAgICAgIHZhciBjb2xvckF0dGFjaG1lbnRTaXplID1cbiAgICAgICAgICAgICAgdGV4dHVyZUZvcm1hdENoYW5uZWxzW2NvbG9yQXR0YWNobWVudHNbaV0udGV4dHVyZS5fdGV4dHVyZS5mb3JtYXRdICpcbiAgICAgICAgICAgICAgdGV4dHVyZVR5cGVTaXplc1tjb2xvckF0dGFjaG1lbnRzW2ldLnRleHR1cmUuX3RleHR1cmUudHlwZV1cblxuICAgICAgICAgIGlmIChjb21tb25Db2xvckF0dGFjaG1lbnRTaXplID09PSBudWxsKSB7XG4gICAgICAgICAgICBjb21tb25Db2xvckF0dGFjaG1lbnRTaXplID0gY29sb3JBdHRhY2htZW50U2l6ZVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBXZSBuZWVkIHRvIG1ha2Ugc3VyZSB0aGF0IGFsbCBjb2xvciBhdHRhY2htZW50cyBoYXZlIHRoZSBzYW1lIG51bWJlciBvZiBiaXRwbGFuZXNcbiAgICAgICAgICAgIC8vICh0aGF0IGlzLCB0aGUgc2FtZSBudW1lciBvZiBiaXRzIHBlciBwaXhlbClcbiAgICAgICAgICAgIC8vIFRoaXMgaXMgcmVxdWlyZWQgYnkgdGhlIEdMRVMyLjAgc3RhbmRhcmQuIFNlZSB0aGUgYmVnaW5uaW5nIG9mIENoYXB0ZXIgNCBpbiB0aGF0IGRvY3VtZW50LlxuICAgICAgICAgICAgXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpbmNSZWZBbmRDaGVja1NoYXBlKGRlcHRoQXR0YWNobWVudCwgd2lkdGgsIGhlaWdodClcbiAgICAgIFxuICAgICAgaW5jUmVmQW5kQ2hlY2tTaGFwZShzdGVuY2lsQXR0YWNobWVudCwgd2lkdGgsIGhlaWdodClcbiAgICAgIFxuICAgICAgaW5jUmVmQW5kQ2hlY2tTaGFwZShkZXB0aFN0ZW5jaWxBdHRhY2htZW50LCB3aWR0aCwgaGVpZ2h0KVxuICAgICAgXG5cbiAgICAgIC8vIGRlY3JlbWVudCByZWZlcmVuY2VzXG4gICAgICBkZWNGQk9SZWZzKGZyYW1lYnVmZmVyKVxuXG4gICAgICBmcmFtZWJ1ZmZlci53aWR0aCA9IHdpZHRoXG4gICAgICBmcmFtZWJ1ZmZlci5oZWlnaHQgPSBoZWlnaHRcblxuICAgICAgZnJhbWVidWZmZXIuY29sb3JBdHRhY2htZW50cyA9IGNvbG9yQXR0YWNobWVudHNcbiAgICAgIGZyYW1lYnVmZmVyLmRlcHRoQXR0YWNobWVudCA9IGRlcHRoQXR0YWNobWVudFxuICAgICAgZnJhbWVidWZmZXIuc3RlbmNpbEF0dGFjaG1lbnQgPSBzdGVuY2lsQXR0YWNobWVudFxuICAgICAgZnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsQXR0YWNobWVudCA9IGRlcHRoU3RlbmNpbEF0dGFjaG1lbnRcblxuICAgICAgcmVnbEZyYW1lYnVmZmVyLmNvbG9yID0gY29sb3JBdHRhY2htZW50cy5tYXAodW53cmFwQXR0YWNobWVudClcbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci5kZXB0aCA9IHVud3JhcEF0dGFjaG1lbnQoZGVwdGhBdHRhY2htZW50KVxuICAgICAgcmVnbEZyYW1lYnVmZmVyLnN0ZW5jaWwgPSB1bndyYXBBdHRhY2htZW50KHN0ZW5jaWxBdHRhY2htZW50KVxuICAgICAgcmVnbEZyYW1lYnVmZmVyLmRlcHRoU3RlbmNpbCA9IHVud3JhcEF0dGFjaG1lbnQoZGVwdGhTdGVuY2lsQXR0YWNobWVudClcblxuICAgICAgcmVnbEZyYW1lYnVmZmVyLndpZHRoID0gZnJhbWVidWZmZXIud2lkdGhcbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci5oZWlnaHQgPSBmcmFtZWJ1ZmZlci5oZWlnaHRcblxuICAgICAgdXBkYXRlRnJhbWVidWZmZXIoZnJhbWVidWZmZXIpXG5cbiAgICAgIHJldHVybiByZWdsRnJhbWVidWZmZXJcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZXNpemUgKHdfLCBoXykge1xuICAgICAgXG5cbiAgICAgIHZhciB3ID0gd18gfCAwXG4gICAgICB2YXIgaCA9IChoXyB8IDApIHx8IHdcbiAgICAgIGlmICh3ID09PSBmcmFtZWJ1ZmZlci53aWR0aCAmJiBoID09PSBmcmFtZWJ1ZmZlci5oZWlnaHQpIHtcbiAgICAgICAgcmV0dXJuIHJlZ2xGcmFtZWJ1ZmZlclxuICAgICAgfVxuXG4gICAgICAvLyByZXNpemUgYWxsIGJ1ZmZlcnNcbiAgICAgIHZhciBjb2xvckF0dGFjaG1lbnRzID0gZnJhbWVidWZmZXIuY29sb3JBdHRhY2htZW50c1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjb2xvckF0dGFjaG1lbnRzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgIHJlc2l6ZUF0dGFjaG1lbnQoY29sb3JBdHRhY2htZW50c1tpXSwgdywgaClcbiAgICAgIH1cbiAgICAgIHJlc2l6ZUF0dGFjaG1lbnQoZnJhbWVidWZmZXIuZGVwdGhBdHRhY2htZW50LCB3LCBoKVxuICAgICAgcmVzaXplQXR0YWNobWVudChmcmFtZWJ1ZmZlci5zdGVuY2lsQXR0YWNobWVudCwgdywgaClcbiAgICAgIHJlc2l6ZUF0dGFjaG1lbnQoZnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsQXR0YWNobWVudCwgdywgaClcblxuICAgICAgZnJhbWVidWZmZXIud2lkdGggPSByZWdsRnJhbWVidWZmZXIud2lkdGggPSB3XG4gICAgICBmcmFtZWJ1ZmZlci5oZWlnaHQgPSByZWdsRnJhbWVidWZmZXIuaGVpZ2h0ID0gaFxuXG4gICAgICB1cGRhdGVGcmFtZWJ1ZmZlcihmcmFtZWJ1ZmZlcilcblxuICAgICAgcmV0dXJuIHJlZ2xGcmFtZWJ1ZmZlclxuICAgIH1cblxuICAgIHJlZ2xGcmFtZWJ1ZmZlcihhMCwgYTEpXG5cbiAgICByZXR1cm4gZXh0ZW5kKHJlZ2xGcmFtZWJ1ZmZlciwge1xuICAgICAgcmVzaXplOiByZXNpemUsXG4gICAgICBfcmVnbFR5cGU6ICdmcmFtZWJ1ZmZlcicsXG4gICAgICBfZnJhbWVidWZmZXI6IGZyYW1lYnVmZmVyLFxuICAgICAgZGVzdHJveTogZnVuY3Rpb24gKCkge1xuICAgICAgICBkZXN0cm95KGZyYW1lYnVmZmVyKVxuICAgICAgICBkZWNGQk9SZWZzKGZyYW1lYnVmZmVyKVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiBjcmVhdGVDdWJlRkJPIChvcHRpb25zKSB7XG4gICAgdmFyIGZhY2VzID0gQXJyYXkoNilcblxuICAgIGZ1bmN0aW9uIHJlZ2xGcmFtZWJ1ZmZlckN1YmUgKGEpIHtcbiAgICAgIHZhciBpXG5cbiAgICAgIFxuXG4gICAgICB2YXIgZXh0RHJhd0J1ZmZlcnMgPSBleHRlbnNpb25zLndlYmdsX2RyYXdfYnVmZmVyc1xuXG4gICAgICB2YXIgcGFyYW1zID0ge1xuICAgICAgICBjb2xvcjogbnVsbFxuICAgICAgfVxuXG4gICAgICB2YXIgcmFkaXVzID0gMFxuXG4gICAgICB2YXIgY29sb3JCdWZmZXIgPSBudWxsXG4gICAgICB2YXIgY29sb3JGb3JtYXQgPSAncmdiYSdcbiAgICAgIHZhciBjb2xvclR5cGUgPSAndWludDgnXG4gICAgICB2YXIgY29sb3JDb3VudCA9IDFcblxuICAgICAgaWYgKHR5cGVvZiBhID09PSAnbnVtYmVyJykge1xuICAgICAgICByYWRpdXMgPSBhIHwgMFxuICAgICAgfSBlbHNlIGlmICghYSkge1xuICAgICAgICByYWRpdXMgPSAxXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBcbiAgICAgICAgdmFyIG9wdGlvbnMgPSBhXG5cbiAgICAgICAgaWYgKCdzaGFwZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHZhciBzaGFwZSA9IG9wdGlvbnMuc2hhcGVcbiAgICAgICAgICBcbiAgICAgICAgICBcbiAgICAgICAgICByYWRpdXMgPSBzaGFwZVswXVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmICgncmFkaXVzJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICByYWRpdXMgPSBvcHRpb25zLnJhZGl1cyB8IDBcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCd3aWR0aCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgcmFkaXVzID0gb3B0aW9ucy53aWR0aCB8IDBcbiAgICAgICAgICAgIGlmICgnaGVpZ2h0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSBpZiAoJ2hlaWdodCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgcmFkaXVzID0gb3B0aW9ucy5oZWlnaHQgfCAwXG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdjb2xvcicgaW4gb3B0aW9ucyB8fFxuICAgICAgICAgICAgJ2NvbG9ycycgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGNvbG9yQnVmZmVyID1cbiAgICAgICAgICAgIG9wdGlvbnMuY29sb3IgfHxcbiAgICAgICAgICAgIG9wdGlvbnMuY29sb3JzXG4gICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoY29sb3JCdWZmZXIpKSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWNvbG9yQnVmZmVyKSB7XG4gICAgICAgICAgaWYgKCdjb2xvckNvdW50JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBjb2xvckNvdW50ID0gb3B0aW9ucy5jb2xvckNvdW50IHwgMFxuICAgICAgICAgICAgXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKCdjb2xvclR5cGUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY29sb3JUeXBlID0gb3B0aW9ucy5jb2xvclR5cGVcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoJ2NvbG9yRm9ybWF0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBjb2xvckZvcm1hdCA9IG9wdGlvbnMuY29sb3JGb3JtYXRcbiAgICAgICAgICAgIFxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnZGVwdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBwYXJhbXMuZGVwdGggPSBvcHRpb25zLmRlcHRoXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ3N0ZW5jaWwnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBwYXJhbXMuc3RlbmNpbCA9IG9wdGlvbnMuc3RlbmNpbFxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdkZXB0aFN0ZW5jaWwnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBwYXJhbXMuZGVwdGhTdGVuY2lsID0gb3B0aW9ucy5kZXB0aFN0ZW5jaWxcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICB2YXIgY29sb3JDdWJlc1xuICAgICAgaWYgKGNvbG9yQnVmZmVyKSB7XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KGNvbG9yQnVmZmVyKSkge1xuICAgICAgICAgIGNvbG9yQ3ViZXMgPSBbXVxuICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xvckJ1ZmZlci5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgY29sb3JDdWJlc1tpXSA9IGNvbG9yQnVmZmVyW2ldXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbG9yQ3ViZXMgPSBbIGNvbG9yQnVmZmVyIF1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29sb3JDdWJlcyA9IEFycmF5KGNvbG9yQ291bnQpXG4gICAgICAgIHZhciBjdWJlTWFwUGFyYW1zID0ge1xuICAgICAgICAgIHJhZGl1czogcmFkaXVzLFxuICAgICAgICAgIGZvcm1hdDogY29sb3JGb3JtYXQsXG4gICAgICAgICAgdHlwZTogY29sb3JUeXBlXG4gICAgICAgIH1cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGNvbG9yQ291bnQ7ICsraSkge1xuICAgICAgICAgIGNvbG9yQ3ViZXNbaV0gPSB0ZXh0dXJlU3RhdGUuY3JlYXRlQ3ViZShjdWJlTWFwUGFyYW1zKVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIENoZWNrIGNvbG9yIGN1YmVzXG4gICAgICBwYXJhbXMuY29sb3IgPSBBcnJheShjb2xvckN1YmVzLmxlbmd0aClcbiAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xvckN1YmVzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgIHZhciBjdWJlID0gY29sb3JDdWJlc1tpXVxuICAgICAgICBcbiAgICAgICAgcmFkaXVzID0gcmFkaXVzIHx8IGN1YmUud2lkdGhcbiAgICAgICAgXG4gICAgICAgIHBhcmFtcy5jb2xvcltpXSA9IHtcbiAgICAgICAgICB0YXJnZXQ6IEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCxcbiAgICAgICAgICBkYXRhOiBjb2xvckN1YmVzW2ldXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGNvbG9yQ3ViZXMubGVuZ3RoOyArK2opIHtcbiAgICAgICAgICBwYXJhbXMuY29sb3Jbal0udGFyZ2V0ID0gR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YICsgaVxuICAgICAgICB9XG4gICAgICAgIC8vIHJldXNlIGRlcHRoLXN0ZW5jaWwgYXR0YWNobWVudHMgYWNyb3NzIGFsbCBjdWJlIG1hcHNcbiAgICAgICAgaWYgKGkgPiAwKSB7XG4gICAgICAgICAgcGFyYW1zLmRlcHRoID0gZmFjZXNbMF0uZGVwdGhcbiAgICAgICAgICBwYXJhbXMuc3RlbmNpbCA9IGZhY2VzWzBdLnN0ZW5jaWxcbiAgICAgICAgICBwYXJhbXMuZGVwdGhTdGVuY2lsID0gZmFjZXNbMF0uZGVwdGhTdGVuY2lsXG4gICAgICAgIH1cbiAgICAgICAgaWYgKGZhY2VzW2ldKSB7XG4gICAgICAgICAgKGZhY2VzW2ldKShwYXJhbXMpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZmFjZXNbaV0gPSBjcmVhdGVGQk8ocGFyYW1zKVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBleHRlbmQocmVnbEZyYW1lYnVmZmVyQ3ViZSwge1xuICAgICAgICB3aWR0aDogcmFkaXVzLFxuICAgICAgICBoZWlnaHQ6IHJhZGl1cyxcbiAgICAgICAgY29sb3I6IGNvbG9yQ3ViZXNcbiAgICAgIH0pXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVzaXplIChyYWRpdXNfKSB7XG4gICAgICB2YXIgaVxuICAgICAgdmFyIHJhZGl1cyA9IHJhZGl1c18gfCAwXG4gICAgICBcblxuICAgICAgaWYgKHJhZGl1cyA9PT0gcmVnbEZyYW1lYnVmZmVyQ3ViZS53aWR0aCkge1xuICAgICAgICByZXR1cm4gcmVnbEZyYW1lYnVmZmVyQ3ViZVxuICAgICAgfVxuXG4gICAgICB2YXIgY29sb3JzID0gcmVnbEZyYW1lYnVmZmVyQ3ViZS5jb2xvclxuICAgICAgZm9yIChpID0gMDsgaSA8IGNvbG9ycy5sZW5ndGg7ICsraSkge1xuICAgICAgICBjb2xvcnNbaV0ucmVzaXplKHJhZGl1cylcbiAgICAgIH1cblxuICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICBmYWNlc1tpXS5yZXNpemUocmFkaXVzKVxuICAgICAgfVxuXG4gICAgICByZWdsRnJhbWVidWZmZXJDdWJlLndpZHRoID0gcmVnbEZyYW1lYnVmZmVyQ3ViZS5oZWlnaHQgPSByYWRpdXNcblxuICAgICAgcmV0dXJuIHJlZ2xGcmFtZWJ1ZmZlckN1YmVcbiAgICB9XG5cbiAgICByZWdsRnJhbWVidWZmZXJDdWJlKG9wdGlvbnMpXG5cbiAgICByZXR1cm4gZXh0ZW5kKHJlZ2xGcmFtZWJ1ZmZlckN1YmUsIHtcbiAgICAgIGZhY2VzOiBmYWNlcyxcbiAgICAgIHJlc2l6ZTogcmVzaXplLFxuICAgICAgX3JlZ2xUeXBlOiAnZnJhbWVidWZmZXJDdWJlJyxcbiAgICAgIGRlc3Ryb3k6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgZmFjZXMuZm9yRWFjaChmdW5jdGlvbiAoZikge1xuICAgICAgICAgIGYuZGVzdHJveSgpXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlc3RvcmVGcmFtZWJ1ZmZlcnMgKCkge1xuICAgIHZhbHVlcyhmcmFtZWJ1ZmZlclNldCkuZm9yRWFjaChmdW5jdGlvbiAoZmIpIHtcbiAgICAgIGZiLmZyYW1lYnVmZmVyID0gZ2wuY3JlYXRlRnJhbWVidWZmZXIoKVxuICAgICAgdXBkYXRlRnJhbWVidWZmZXIoZmIpXG4gICAgfSlcbiAgfVxuXG4gIHJldHVybiBleHRlbmQoZnJhbWVidWZmZXJTdGF0ZSwge1xuICAgIGdldEZyYW1lYnVmZmVyOiBmdW5jdGlvbiAob2JqZWN0KSB7XG4gICAgICBpZiAodHlwZW9mIG9iamVjdCA9PT0gJ2Z1bmN0aW9uJyAmJiBvYmplY3QuX3JlZ2xUeXBlID09PSAnZnJhbWVidWZmZXInKSB7XG4gICAgICAgIHZhciBmYm8gPSBvYmplY3QuX2ZyYW1lYnVmZmVyXG4gICAgICAgIGlmIChmYm8gaW5zdGFuY2VvZiBSRUdMRnJhbWVidWZmZXIpIHtcbiAgICAgICAgICByZXR1cm4gZmJvXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsXG4gICAgfSxcbiAgICBjcmVhdGU6IGNyZWF0ZUZCTyxcbiAgICBjcmVhdGVDdWJlOiBjcmVhdGVDdWJlRkJPLFxuICAgIGNsZWFyOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YWx1ZXMoZnJhbWVidWZmZXJTZXQpLmZvckVhY2goZGVzdHJveSlcbiAgICB9LFxuICAgIHJlc3RvcmU6IHJlc3RvcmVGcmFtZWJ1ZmZlcnNcbiAgfSlcbn1cbiIsInZhciBHTF9TVUJQSVhFTF9CSVRTID0gMHgwRDUwXG52YXIgR0xfUkVEX0JJVFMgPSAweDBENTJcbnZhciBHTF9HUkVFTl9CSVRTID0gMHgwRDUzXG52YXIgR0xfQkxVRV9CSVRTID0gMHgwRDU0XG52YXIgR0xfQUxQSEFfQklUUyA9IDB4MEQ1NVxudmFyIEdMX0RFUFRIX0JJVFMgPSAweDBENTZcbnZhciBHTF9TVEVOQ0lMX0JJVFMgPSAweDBENTdcblxudmFyIEdMX0FMSUFTRURfUE9JTlRfU0laRV9SQU5HRSA9IDB4ODQ2RFxudmFyIEdMX0FMSUFTRURfTElORV9XSURUSF9SQU5HRSA9IDB4ODQ2RVxuXG52YXIgR0xfTUFYX1RFWFRVUkVfU0laRSA9IDB4MEQzM1xudmFyIEdMX01BWF9WSUVXUE9SVF9ESU1TID0gMHgwRDNBXG52YXIgR0xfTUFYX1ZFUlRFWF9BVFRSSUJTID0gMHg4ODY5XG52YXIgR0xfTUFYX1ZFUlRFWF9VTklGT1JNX1ZFQ1RPUlMgPSAweDhERkJcbnZhciBHTF9NQVhfVkFSWUlOR19WRUNUT1JTID0gMHg4REZDXG52YXIgR0xfTUFYX0NPTUJJTkVEX1RFWFRVUkVfSU1BR0VfVU5JVFMgPSAweDhCNERcbnZhciBHTF9NQVhfVkVSVEVYX1RFWFRVUkVfSU1BR0VfVU5JVFMgPSAweDhCNENcbnZhciBHTF9NQVhfVEVYVFVSRV9JTUFHRV9VTklUUyA9IDB4ODg3MlxudmFyIEdMX01BWF9GUkFHTUVOVF9VTklGT1JNX1ZFQ1RPUlMgPSAweDhERkRcbnZhciBHTF9NQVhfQ1VCRV9NQVBfVEVYVFVSRV9TSVpFID0gMHg4NTFDXG52YXIgR0xfTUFYX1JFTkRFUkJVRkZFUl9TSVpFID0gMHg4NEU4XG5cbnZhciBHTF9WRU5ET1IgPSAweDFGMDBcbnZhciBHTF9SRU5ERVJFUiA9IDB4MUYwMVxudmFyIEdMX1ZFUlNJT04gPSAweDFGMDJcbnZhciBHTF9TSEFESU5HX0xBTkdVQUdFX1ZFUlNJT04gPSAweDhCOENcblxudmFyIEdMX01BWF9URVhUVVJFX01BWF9BTklTT1RST1BZX0VYVCA9IDB4ODRGRlxuXG52YXIgR0xfTUFYX0NPTE9SX0FUVEFDSE1FTlRTX1dFQkdMID0gMHg4Q0RGXG52YXIgR0xfTUFYX0RSQVdfQlVGRkVSU19XRUJHTCA9IDB4ODgyNFxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChnbCwgZXh0ZW5zaW9ucykge1xuICB2YXIgbWF4QW5pc290cm9waWMgPSAxXG4gIGlmIChleHRlbnNpb25zLmV4dF90ZXh0dXJlX2ZpbHRlcl9hbmlzb3Ryb3BpYykge1xuICAgIG1heEFuaXNvdHJvcGljID0gZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9URVhUVVJFX01BWF9BTklTT1RST1BZX0VYVClcbiAgfVxuXG4gIHZhciBtYXhEcmF3YnVmZmVycyA9IDFcbiAgdmFyIG1heENvbG9yQXR0YWNobWVudHMgPSAxXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2RyYXdfYnVmZmVycykge1xuICAgIG1heERyYXdidWZmZXJzID0gZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9EUkFXX0JVRkZFUlNfV0VCR0wpXG4gICAgbWF4Q29sb3JBdHRhY2htZW50cyA9IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfQ09MT1JfQVRUQUNITUVOVFNfV0VCR0wpXG4gIH1cblxuICByZXR1cm4ge1xuICAgIC8vIGRyYXdpbmcgYnVmZmVyIGJpdCBkZXB0aFxuICAgIGNvbG9yQml0czogW1xuICAgICAgZ2wuZ2V0UGFyYW1ldGVyKEdMX1JFRF9CSVRTKSxcbiAgICAgIGdsLmdldFBhcmFtZXRlcihHTF9HUkVFTl9CSVRTKSxcbiAgICAgIGdsLmdldFBhcmFtZXRlcihHTF9CTFVFX0JJVFMpLFxuICAgICAgZ2wuZ2V0UGFyYW1ldGVyKEdMX0FMUEhBX0JJVFMpXG4gICAgXSxcbiAgICBkZXB0aEJpdHM6IGdsLmdldFBhcmFtZXRlcihHTF9ERVBUSF9CSVRTKSxcbiAgICBzdGVuY2lsQml0czogZ2wuZ2V0UGFyYW1ldGVyKEdMX1NURU5DSUxfQklUUyksXG4gICAgc3VicGl4ZWxCaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfU1VCUElYRUxfQklUUyksXG5cbiAgICAvLyBzdXBwb3J0ZWQgZXh0ZW5zaW9uc1xuICAgIGV4dGVuc2lvbnM6IE9iamVjdC5rZXlzKGV4dGVuc2lvbnMpLmZpbHRlcihmdW5jdGlvbiAoZXh0KSB7XG4gICAgICByZXR1cm4gISFleHRlbnNpb25zW2V4dF1cbiAgICB9KSxcblxuICAgIC8vIG1heCBhbmlzbyBzYW1wbGVzXG4gICAgbWF4QW5pc290cm9waWM6IG1heEFuaXNvdHJvcGljLFxuXG4gICAgLy8gbWF4IGRyYXcgYnVmZmVyc1xuICAgIG1heERyYXdidWZmZXJzOiBtYXhEcmF3YnVmZmVycyxcbiAgICBtYXhDb2xvckF0dGFjaG1lbnRzOiBtYXhDb2xvckF0dGFjaG1lbnRzLFxuXG4gICAgLy8gcG9pbnQgYW5kIGxpbmUgc2l6ZSByYW5nZXNcbiAgICBwb2ludFNpemVEaW1zOiBnbC5nZXRQYXJhbWV0ZXIoR0xfQUxJQVNFRF9QT0lOVF9TSVpFX1JBTkdFKSxcbiAgICBsaW5lV2lkdGhEaW1zOiBnbC5nZXRQYXJhbWV0ZXIoR0xfQUxJQVNFRF9MSU5FX1dJRFRIX1JBTkdFKSxcbiAgICBtYXhWaWV3cG9ydERpbXM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVklFV1BPUlRfRElNUyksXG4gICAgbWF4Q29tYmluZWRUZXh0dXJlVW5pdHM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfQ09NQklORURfVEVYVFVSRV9JTUFHRV9VTklUUyksXG4gICAgbWF4Q3ViZU1hcFNpemU6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfQ1VCRV9NQVBfVEVYVFVSRV9TSVpFKSxcbiAgICBtYXhSZW5kZXJidWZmZXJTaXplOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1JFTkRFUkJVRkZFUl9TSVpFKSxcbiAgICBtYXhUZXh0dXJlVW5pdHM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVEVYVFVSRV9JTUFHRV9VTklUUyksXG4gICAgbWF4VGV4dHVyZVNpemU6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVEVYVFVSRV9TSVpFKSxcbiAgICBtYXhBdHRyaWJ1dGVzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1ZFUlRFWF9BVFRSSUJTKSxcbiAgICBtYXhWZXJ0ZXhVbmlmb3JtczogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9WRVJURVhfVU5JRk9STV9WRUNUT1JTKSxcbiAgICBtYXhWZXJ0ZXhUZXh0dXJlVW5pdHM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVkVSVEVYX1RFWFRVUkVfSU1BR0VfVU5JVFMpLFxuICAgIG1heFZhcnlpbmdWZWN0b3JzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1ZBUllJTkdfVkVDVE9SUyksXG4gICAgbWF4RnJhZ21lbnRVbmlmb3JtczogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9GUkFHTUVOVF9VTklGT1JNX1ZFQ1RPUlMpLFxuXG4gICAgLy8gdmVuZG9yIGluZm9cbiAgICBnbHNsOiBnbC5nZXRQYXJhbWV0ZXIoR0xfU0hBRElOR19MQU5HVUFHRV9WRVJTSU9OKSxcbiAgICByZW5kZXJlcjogZ2wuZ2V0UGFyYW1ldGVyKEdMX1JFTkRFUkVSKSxcbiAgICB2ZW5kb3I6IGdsLmdldFBhcmFtZXRlcihHTF9WRU5ET1IpLFxuICAgIHZlcnNpb246IGdsLmdldFBhcmFtZXRlcihHTF9WRVJTSU9OKVxuICB9XG59XG4iLCJcbnZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL3V0aWwvaXMtdHlwZWQtYXJyYXknKVxuXG52YXIgR0xfUkdCQSA9IDY0MDhcbnZhciBHTF9VTlNJR05FRF9CWVRFID0gNTEyMVxudmFyIEdMX1BBQ0tfQUxJR05NRU5UID0gMHgwRDA1XG52YXIgR0xfRkxPQVQgPSAweDE0MDYgLy8gNTEyNlxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBSZWFkUGl4ZWxzIChcbiAgZ2wsXG4gIGZyYW1lYnVmZmVyU3RhdGUsXG4gIHJlZ2xQb2xsLFxuICBjb250ZXh0LFxuICBnbEF0dHJpYnV0ZXMsXG4gIGV4dGVuc2lvbnMpIHtcbiAgZnVuY3Rpb24gcmVhZFBpeGVscyAoaW5wdXQpIHtcbiAgICB2YXIgdHlwZVxuICAgIGlmIChmcmFtZWJ1ZmZlclN0YXRlLm5leHQgPT09IG51bGwpIHtcbiAgICAgIFxuICAgICAgdHlwZSA9IEdMX1VOU0lHTkVEX0JZVEVcbiAgICB9IGVsc2Uge1xuICAgICAgXG4gICAgICB0eXBlID0gZnJhbWVidWZmZXJTdGF0ZS5uZXh0LmNvbG9yQXR0YWNobWVudHNbMF0udGV4dHVyZS5fdGV4dHVyZS50eXBlXG5cbiAgICAgIGlmIChleHRlbnNpb25zLm9lc190ZXh0dXJlX2Zsb2F0KSB7XG4gICAgICAgIFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgXG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFyIHggPSAwXG4gICAgdmFyIHkgPSAwXG4gICAgdmFyIHdpZHRoID0gY29udGV4dC5mcmFtZWJ1ZmZlcldpZHRoXG4gICAgdmFyIGhlaWdodCA9IGNvbnRleHQuZnJhbWVidWZmZXJIZWlnaHRcbiAgICB2YXIgZGF0YSA9IG51bGxcblxuICAgIGlmIChpc1R5cGVkQXJyYXkoaW5wdXQpKSB7XG4gICAgICBkYXRhID0gaW5wdXRcbiAgICB9IGVsc2UgaWYgKGlucHV0KSB7XG4gICAgICBcbiAgICAgIHggPSBpbnB1dC54IHwgMFxuICAgICAgeSA9IGlucHV0LnkgfCAwXG4gICAgICBcbiAgICAgIFxuICAgICAgd2lkdGggPSAoaW5wdXQud2lkdGggfHwgKGNvbnRleHQuZnJhbWVidWZmZXJXaWR0aCAtIHgpKSB8IDBcbiAgICAgIGhlaWdodCA9IChpbnB1dC5oZWlnaHQgfHwgKGNvbnRleHQuZnJhbWVidWZmZXJIZWlnaHQgLSB5KSkgfCAwXG4gICAgICBkYXRhID0gaW5wdXQuZGF0YSB8fCBudWxsXG4gICAgfVxuXG4gICAgLy8gc2FuaXR5IGNoZWNrIGlucHV0LmRhdGFcbiAgICBpZiAoZGF0YSkge1xuICAgICAgaWYgKHR5cGUgPT09IEdMX1VOU0lHTkVEX0JZVEUpIHtcbiAgICAgICAgXG4gICAgICB9IGVsc2UgaWYgKHR5cGUgPT09IEdMX0ZMT0FUKSB7XG4gICAgICAgIFxuICAgICAgfVxuICAgIH1cblxuICAgIFxuICAgIFxuXG4gICAgLy8gVXBkYXRlIFdlYkdMIHN0YXRlXG4gICAgcmVnbFBvbGwoKVxuXG4gICAgLy8gQ29tcHV0ZSBzaXplXG4gICAgdmFyIHNpemUgPSB3aWR0aCAqIGhlaWdodCAqIDRcblxuICAgIC8vIEFsbG9jYXRlIGRhdGFcbiAgICBpZiAoIWRhdGEpIHtcbiAgICAgIGlmICh0eXBlID09PSBHTF9VTlNJR05FRF9CWVRFKSB7XG4gICAgICAgIGRhdGEgPSBuZXcgVWludDhBcnJheShzaXplKVxuICAgICAgfSBlbHNlIGlmICh0eXBlID09PSBHTF9GTE9BVCkge1xuICAgICAgICBkYXRhID0gZGF0YSB8fCBuZXcgRmxvYXQzMkFycmF5KHNpemUpXG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gVHlwZSBjaGVja1xuICAgIFxuICAgIFxuXG4gICAgLy8gUnVuIHJlYWQgcGl4ZWxzXG4gICAgZ2wucGl4ZWxTdG9yZWkoR0xfUEFDS19BTElHTk1FTlQsIDQpXG4gICAgZ2wucmVhZFBpeGVscyh4LCB5LCB3aWR0aCwgaGVpZ2h0LCBHTF9SR0JBLFxuICAgICAgICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgICAgICAgIGRhdGEpXG5cbiAgICByZXR1cm4gZGF0YVxuICB9XG5cbiAgcmV0dXJuIHJlYWRQaXhlbHNcbn1cbiIsIlxudmFyIHZhbHVlcyA9IHJlcXVpcmUoJy4vdXRpbC92YWx1ZXMnKVxuXG52YXIgR0xfUkVOREVSQlVGRkVSID0gMHg4RDQxXG5cbnZhciBHTF9SR0JBNCA9IDB4ODA1NlxudmFyIEdMX1JHQjVfQTEgPSAweDgwNTdcbnZhciBHTF9SR0I1NjUgPSAweDhENjJcbnZhciBHTF9ERVBUSF9DT01QT05FTlQxNiA9IDB4ODFBNVxudmFyIEdMX1NURU5DSUxfSU5ERVg4ID0gMHg4RDQ4XG52YXIgR0xfREVQVEhfU1RFTkNJTCA9IDB4ODRGOVxuXG52YXIgR0xfU1JHQjhfQUxQSEE4X0VYVCA9IDB4OEM0M1xuXG52YXIgR0xfUkdCQTMyRl9FWFQgPSAweDg4MTRcblxudmFyIEdMX1JHQkExNkZfRVhUID0gMHg4ODFBXG52YXIgR0xfUkdCMTZGX0VYVCA9IDB4ODgxQlxuXG52YXIgRk9STUFUX1NJWkVTID0gW11cblxuRk9STUFUX1NJWkVTW0dMX1JHQkE0XSA9IDJcbkZPUk1BVF9TSVpFU1tHTF9SR0I1X0ExXSA9IDJcbkZPUk1BVF9TSVpFU1tHTF9SR0I1NjVdID0gMlxuXG5GT1JNQVRfU0laRVNbR0xfREVQVEhfQ09NUE9ORU5UMTZdID0gMlxuRk9STUFUX1NJWkVTW0dMX1NURU5DSUxfSU5ERVg4XSA9IDFcbkZPUk1BVF9TSVpFU1tHTF9ERVBUSF9TVEVOQ0lMXSA9IDRcblxuRk9STUFUX1NJWkVTW0dMX1NSR0I4X0FMUEhBOF9FWFRdID0gNFxuRk9STUFUX1NJWkVTW0dMX1JHQkEzMkZfRVhUXSA9IDE2XG5GT1JNQVRfU0laRVNbR0xfUkdCQTE2Rl9FWFRdID0gOFxuRk9STUFUX1NJWkVTW0dMX1JHQjE2Rl9FWFRdID0gNlxuXG5mdW5jdGlvbiBnZXRSZW5kZXJidWZmZXJTaXplIChmb3JtYXQsIHdpZHRoLCBoZWlnaHQpIHtcbiAgcmV0dXJuIEZPUk1BVF9TSVpFU1tmb3JtYXRdICogd2lkdGggKiBoZWlnaHRcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoZ2wsIGV4dGVuc2lvbnMsIGxpbWl0cywgc3RhdHMsIGNvbmZpZykge1xuICB2YXIgZm9ybWF0VHlwZXMgPSB7XG4gICAgJ3JnYmE0JzogR0xfUkdCQTQsXG4gICAgJ3JnYjU2NSc6IEdMX1JHQjU2NSxcbiAgICAncmdiNSBhMSc6IEdMX1JHQjVfQTEsXG4gICAgJ2RlcHRoJzogR0xfREVQVEhfQ09NUE9ORU5UMTYsXG4gICAgJ3N0ZW5jaWwnOiBHTF9TVEVOQ0lMX0lOREVYOCxcbiAgICAnZGVwdGggc3RlbmNpbCc6IEdMX0RFUFRIX1NURU5DSUxcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLmV4dF9zcmdiKSB7XG4gICAgZm9ybWF0VHlwZXNbJ3NyZ2JhJ10gPSBHTF9TUkdCOF9BTFBIQThfRVhUXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5leHRfY29sb3JfYnVmZmVyX2hhbGZfZmxvYXQpIHtcbiAgICBmb3JtYXRUeXBlc1sncmdiYTE2ZiddID0gR0xfUkdCQTE2Rl9FWFRcbiAgICBmb3JtYXRUeXBlc1sncmdiMTZmJ10gPSBHTF9SR0IxNkZfRVhUXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb2xvcl9idWZmZXJfZmxvYXQpIHtcbiAgICBmb3JtYXRUeXBlc1sncmdiYTMyZiddID0gR0xfUkdCQTMyRl9FWFRcbiAgfVxuXG4gIHZhciBmb3JtYXRUeXBlc0ludmVydCA9IFtdXG4gIE9iamVjdC5rZXlzKGZvcm1hdFR5cGVzKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICB2YXIgdmFsID0gZm9ybWF0VHlwZXNba2V5XVxuICAgIGZvcm1hdFR5cGVzSW52ZXJ0W3ZhbF0gPSBrZXlcbiAgfSlcblxuICB2YXIgcmVuZGVyYnVmZmVyQ291bnQgPSAwXG4gIHZhciByZW5kZXJidWZmZXJTZXQgPSB7fVxuXG4gIGZ1bmN0aW9uIFJFR0xSZW5kZXJidWZmZXIgKHJlbmRlcmJ1ZmZlcikge1xuICAgIHRoaXMuaWQgPSByZW5kZXJidWZmZXJDb3VudCsrXG4gICAgdGhpcy5yZWZDb3VudCA9IDFcblxuICAgIHRoaXMucmVuZGVyYnVmZmVyID0gcmVuZGVyYnVmZmVyXG5cbiAgICB0aGlzLmZvcm1hdCA9IEdMX1JHQkE0XG4gICAgdGhpcy53aWR0aCA9IDBcbiAgICB0aGlzLmhlaWdodCA9IDBcblxuICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgdGhpcy5zdGF0cyA9IHtzaXplOiAwfVxuICAgIH1cbiAgfVxuXG4gIFJFR0xSZW5kZXJidWZmZXIucHJvdG90eXBlLmRlY1JlZiA9IGZ1bmN0aW9uICgpIHtcbiAgICBpZiAoLS10aGlzLnJlZkNvdW50IDw9IDApIHtcbiAgICAgIGRlc3Ryb3kodGhpcylcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95IChyYikge1xuICAgIHZhciBoYW5kbGUgPSByYi5yZW5kZXJidWZmZXJcbiAgICBcbiAgICBnbC5iaW5kUmVuZGVyYnVmZmVyKEdMX1JFTkRFUkJVRkZFUiwgbnVsbClcbiAgICBnbC5kZWxldGVSZW5kZXJidWZmZXIoaGFuZGxlKVxuICAgIHJiLnJlbmRlcmJ1ZmZlciA9IG51bGxcbiAgICByYi5yZWZDb3VudCA9IDBcbiAgICBkZWxldGUgcmVuZGVyYnVmZmVyU2V0W3JiLmlkXVxuICAgIHN0YXRzLnJlbmRlcmJ1ZmZlckNvdW50LS1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZVJlbmRlcmJ1ZmZlciAoYSwgYikge1xuICAgIHZhciByZW5kZXJidWZmZXIgPSBuZXcgUkVHTFJlbmRlcmJ1ZmZlcihnbC5jcmVhdGVSZW5kZXJidWZmZXIoKSlcbiAgICByZW5kZXJidWZmZXJTZXRbcmVuZGVyYnVmZmVyLmlkXSA9IHJlbmRlcmJ1ZmZlclxuICAgIHN0YXRzLnJlbmRlcmJ1ZmZlckNvdW50KytcblxuICAgIGZ1bmN0aW9uIHJlZ2xSZW5kZXJidWZmZXIgKGEsIGIpIHtcbiAgICAgIHZhciB3ID0gMFxuICAgICAgdmFyIGggPSAwXG4gICAgICB2YXIgZm9ybWF0ID0gR0xfUkdCQTRcblxuICAgICAgaWYgKHR5cGVvZiBhID09PSAnb2JqZWN0JyAmJiBhKSB7XG4gICAgICAgIHZhciBvcHRpb25zID0gYVxuICAgICAgICBpZiAoJ3NoYXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgdmFyIHNoYXBlID0gb3B0aW9ucy5zaGFwZVxuICAgICAgICAgIFxuICAgICAgICAgIHcgPSBzaGFwZVswXSB8IDBcbiAgICAgICAgICBoID0gc2hhcGVbMV0gfCAwXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWYgKCdyYWRpdXMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIHcgPSBoID0gb3B0aW9ucy5yYWRpdXMgfCAwXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgnd2lkdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIHcgPSBvcHRpb25zLndpZHRoIHwgMFxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoJ2hlaWdodCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgaCA9IG9wdGlvbnMuaGVpZ2h0IHwgMFxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoJ2Zvcm1hdCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIFxuICAgICAgICAgIGZvcm1hdCA9IGZvcm1hdFR5cGVzW29wdGlvbnMuZm9ybWF0XVxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBhID09PSAnbnVtYmVyJykge1xuICAgICAgICB3ID0gYSB8IDBcbiAgICAgICAgaWYgKHR5cGVvZiBiID09PSAnbnVtYmVyJykge1xuICAgICAgICAgIGggPSBiIHwgMFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGggPSB3XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoIWEpIHtcbiAgICAgICAgdyA9IGggPSAxXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBcbiAgICAgIH1cblxuICAgICAgLy8gY2hlY2sgc2hhcGVcbiAgICAgIFxuXG4gICAgICBpZiAodyA9PT0gcmVuZGVyYnVmZmVyLndpZHRoICYmXG4gICAgICAgICAgaCA9PT0gcmVuZGVyYnVmZmVyLmhlaWdodCAmJlxuICAgICAgICAgIGZvcm1hdCA9PT0gcmVuZGVyYnVmZmVyLmZvcm1hdCkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgcmVnbFJlbmRlcmJ1ZmZlci53aWR0aCA9IHJlbmRlcmJ1ZmZlci53aWR0aCA9IHdcbiAgICAgIHJlZ2xSZW5kZXJidWZmZXIuaGVpZ2h0ID0gcmVuZGVyYnVmZmVyLmhlaWdodCA9IGhcbiAgICAgIHJlbmRlcmJ1ZmZlci5mb3JtYXQgPSBmb3JtYXRcblxuICAgICAgZ2wuYmluZFJlbmRlcmJ1ZmZlcihHTF9SRU5ERVJCVUZGRVIsIHJlbmRlcmJ1ZmZlci5yZW5kZXJidWZmZXIpXG4gICAgICBnbC5yZW5kZXJidWZmZXJTdG9yYWdlKEdMX1JFTkRFUkJVRkZFUiwgZm9ybWF0LCB3LCBoKVxuXG4gICAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgICAgcmVuZGVyYnVmZmVyLnN0YXRzLnNpemUgPSBnZXRSZW5kZXJidWZmZXJTaXplKHJlbmRlcmJ1ZmZlci5mb3JtYXQsIHJlbmRlcmJ1ZmZlci53aWR0aCwgcmVuZGVyYnVmZmVyLmhlaWdodClcbiAgICAgIH1cbiAgICAgIHJlZ2xSZW5kZXJidWZmZXIuZm9ybWF0ID0gZm9ybWF0VHlwZXNJbnZlcnRbcmVuZGVyYnVmZmVyLmZvcm1hdF1cblxuICAgICAgcmV0dXJuIHJlZ2xSZW5kZXJidWZmZXJcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZXNpemUgKHdfLCBoXykge1xuICAgICAgdmFyIHcgPSB3XyB8IDBcbiAgICAgIHZhciBoID0gKGhfIHwgMCkgfHwgd1xuXG4gICAgICBpZiAodyA9PT0gcmVuZGVyYnVmZmVyLndpZHRoICYmIGggPT09IHJlbmRlcmJ1ZmZlci5oZWlnaHQpIHtcbiAgICAgICAgcmV0dXJuIHJlZ2xSZW5kZXJidWZmZXJcbiAgICAgIH1cblxuICAgICAgLy8gY2hlY2sgc2hhcGVcbiAgICAgIFxuXG4gICAgICByZWdsUmVuZGVyYnVmZmVyLndpZHRoID0gcmVuZGVyYnVmZmVyLndpZHRoID0gd1xuICAgICAgcmVnbFJlbmRlcmJ1ZmZlci5oZWlnaHQgPSByZW5kZXJidWZmZXIuaGVpZ2h0ID0gaFxuXG4gICAgICBnbC5iaW5kUmVuZGVyYnVmZmVyKEdMX1JFTkRFUkJVRkZFUiwgcmVuZGVyYnVmZmVyLnJlbmRlcmJ1ZmZlcilcbiAgICAgIGdsLnJlbmRlcmJ1ZmZlclN0b3JhZ2UoR0xfUkVOREVSQlVGRkVSLCByZW5kZXJidWZmZXIuZm9ybWF0LCB3LCBoKVxuXG4gICAgICAvLyBhbHNvLCByZWNvbXB1dGUgc2l6ZS5cbiAgICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgICByZW5kZXJidWZmZXIuc3RhdHMuc2l6ZSA9IGdldFJlbmRlcmJ1ZmZlclNpemUoXG4gICAgICAgICAgcmVuZGVyYnVmZmVyLmZvcm1hdCwgcmVuZGVyYnVmZmVyLndpZHRoLCByZW5kZXJidWZmZXIuaGVpZ2h0KVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmVnbFJlbmRlcmJ1ZmZlclxuICAgIH1cblxuICAgIHJlZ2xSZW5kZXJidWZmZXIoYSwgYilcblxuICAgIHJlZ2xSZW5kZXJidWZmZXIucmVzaXplID0gcmVzaXplXG4gICAgcmVnbFJlbmRlcmJ1ZmZlci5fcmVnbFR5cGUgPSAncmVuZGVyYnVmZmVyJ1xuICAgIHJlZ2xSZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlciA9IHJlbmRlcmJ1ZmZlclxuICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgcmVnbFJlbmRlcmJ1ZmZlci5zdGF0cyA9IHJlbmRlcmJ1ZmZlci5zdGF0c1xuICAgIH1cbiAgICByZWdsUmVuZGVyYnVmZmVyLmRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7XG4gICAgICByZW5kZXJidWZmZXIuZGVjUmVmKClcbiAgICB9XG5cbiAgICByZXR1cm4gcmVnbFJlbmRlcmJ1ZmZlclxuICB9XG5cbiAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgc3RhdHMuZ2V0VG90YWxSZW5kZXJidWZmZXJTaXplID0gZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIHRvdGFsID0gMFxuICAgICAgT2JqZWN0LmtleXMocmVuZGVyYnVmZmVyU2V0KS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgdG90YWwgKz0gcmVuZGVyYnVmZmVyU2V0W2tleV0uc3RhdHMuc2l6ZVxuICAgICAgfSlcbiAgICAgIHJldHVybiB0b3RhbFxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHJlc3RvcmVSZW5kZXJidWZmZXJzICgpIHtcbiAgICB2YWx1ZXMocmVuZGVyYnVmZmVyU2V0KS5mb3JFYWNoKGZ1bmN0aW9uIChyYikge1xuICAgICAgcmIucmVuZGVyYnVmZmVyID0gZ2wuY3JlYXRlUmVuZGVyYnVmZmVyKClcbiAgICAgIGdsLmJpbmRSZW5kZXJidWZmZXIoR0xfUkVOREVSQlVGRkVSLCByYi5yZW5kZXJidWZmZXIpXG4gICAgICBnbC5yZW5kZXJidWZmZXJTdG9yYWdlKEdMX1JFTkRFUkJVRkZFUiwgcmIuZm9ybWF0LCByYi53aWR0aCwgcmIuaGVpZ2h0KVxuICAgIH0pXG4gICAgZ2wuYmluZFJlbmRlcmJ1ZmZlcihHTF9SRU5ERVJCVUZGRVIsIG51bGwpXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNyZWF0ZTogY3JlYXRlUmVuZGVyYnVmZmVyLFxuICAgIGNsZWFyOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YWx1ZXMocmVuZGVyYnVmZmVyU2V0KS5mb3JFYWNoKGRlc3Ryb3kpXG4gICAgfSxcbiAgICByZXN0b3JlOiByZXN0b3JlUmVuZGVyYnVmZmVyc1xuICB9XG59XG4iLCJcbnZhciB2YWx1ZXMgPSByZXF1aXJlKCcuL3V0aWwvdmFsdWVzJylcblxudmFyIEdMX0ZSQUdNRU5UX1NIQURFUiA9IDM1NjMyXG52YXIgR0xfVkVSVEVYX1NIQURFUiA9IDM1NjMzXG5cbnZhciBHTF9BQ1RJVkVfVU5JRk9STVMgPSAweDhCODZcbnZhciBHTF9BQ1RJVkVfQVRUUklCVVRFUyA9IDB4OEI4OVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBTaGFkZXJTdGF0ZSAoZ2wsIHN0cmluZ1N0b3JlLCBzdGF0cywgY29uZmlnKSB7XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBnbHNsIGNvbXBpbGF0aW9uIGFuZCBsaW5raW5nXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICB2YXIgZnJhZ1NoYWRlcnMgPSB7fVxuICB2YXIgdmVydFNoYWRlcnMgPSB7fVxuXG4gIGZ1bmN0aW9uIEFjdGl2ZUluZm8gKG5hbWUsIGlkLCBsb2NhdGlvbiwgaW5mbykge1xuICAgIHRoaXMubmFtZSA9IG5hbWVcbiAgICB0aGlzLmlkID0gaWRcbiAgICB0aGlzLmxvY2F0aW9uID0gbG9jYXRpb25cbiAgICB0aGlzLmluZm8gPSBpbmZvXG4gIH1cblxuICBmdW5jdGlvbiBpbnNlcnRBY3RpdmVJbmZvIChsaXN0LCBpbmZvKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgKytpKSB7XG4gICAgICBpZiAobGlzdFtpXS5pZCA9PT0gaW5mby5pZCkge1xuICAgICAgICBsaXN0W2ldLmxvY2F0aW9uID0gaW5mby5sb2NhdGlvblxuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICB9XG4gICAgbGlzdC5wdXNoKGluZm8pXG4gIH1cblxuICBmdW5jdGlvbiBnZXRTaGFkZXIgKHR5cGUsIGlkLCBjb21tYW5kKSB7XG4gICAgdmFyIGNhY2hlID0gdHlwZSA9PT0gR0xfRlJBR01FTlRfU0hBREVSID8gZnJhZ1NoYWRlcnMgOiB2ZXJ0U2hhZGVyc1xuICAgIHZhciBzaGFkZXIgPSBjYWNoZVtpZF1cblxuICAgIGlmICghc2hhZGVyKSB7XG4gICAgICB2YXIgc291cmNlID0gc3RyaW5nU3RvcmUuc3RyKGlkKVxuICAgICAgc2hhZGVyID0gZ2wuY3JlYXRlU2hhZGVyKHR5cGUpXG4gICAgICBnbC5zaGFkZXJTb3VyY2Uoc2hhZGVyLCBzb3VyY2UpXG4gICAgICBnbC5jb21waWxlU2hhZGVyKHNoYWRlcilcbiAgICAgIFxuICAgICAgY2FjaGVbaWRdID0gc2hhZGVyXG4gICAgfVxuXG4gICAgcmV0dXJuIHNoYWRlclxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIHByb2dyYW0gbGlua2luZ1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgdmFyIHByb2dyYW1DYWNoZSA9IHt9XG4gIHZhciBwcm9ncmFtTGlzdCA9IFtdXG5cbiAgdmFyIFBST0dSQU1fQ09VTlRFUiA9IDBcblxuICBmdW5jdGlvbiBSRUdMUHJvZ3JhbSAoZnJhZ0lkLCB2ZXJ0SWQpIHtcbiAgICB0aGlzLmlkID0gUFJPR1JBTV9DT1VOVEVSKytcbiAgICB0aGlzLmZyYWdJZCA9IGZyYWdJZFxuICAgIHRoaXMudmVydElkID0gdmVydElkXG4gICAgdGhpcy5wcm9ncmFtID0gbnVsbFxuICAgIHRoaXMudW5pZm9ybXMgPSBbXVxuICAgIHRoaXMuYXR0cmlidXRlcyA9IFtdXG5cbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgIHRoaXMuc3RhdHMgPSB7XG4gICAgICAgIHVuaWZvcm1zQ291bnQ6IDAsXG4gICAgICAgIGF0dHJpYnV0ZXNDb3VudDogMFxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGxpbmtQcm9ncmFtIChkZXNjLCBjb21tYW5kKSB7XG4gICAgdmFyIGksIGluZm9cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBjb21waWxlICYgbGlua1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICB2YXIgZnJhZ1NoYWRlciA9IGdldFNoYWRlcihHTF9GUkFHTUVOVF9TSEFERVIsIGRlc2MuZnJhZ0lkKVxuICAgIHZhciB2ZXJ0U2hhZGVyID0gZ2V0U2hhZGVyKEdMX1ZFUlRFWF9TSEFERVIsIGRlc2MudmVydElkKVxuXG4gICAgdmFyIHByb2dyYW0gPSBkZXNjLnByb2dyYW0gPSBnbC5jcmVhdGVQcm9ncmFtKClcbiAgICBnbC5hdHRhY2hTaGFkZXIocHJvZ3JhbSwgZnJhZ1NoYWRlcilcbiAgICBnbC5hdHRhY2hTaGFkZXIocHJvZ3JhbSwgdmVydFNoYWRlcilcbiAgICBnbC5saW5rUHJvZ3JhbShwcm9ncmFtKVxuICAgIFxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGdyYWIgdW5pZm9ybXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgdmFyIG51bVVuaWZvcm1zID0gZ2wuZ2V0UHJvZ3JhbVBhcmFtZXRlcihwcm9ncmFtLCBHTF9BQ1RJVkVfVU5JRk9STVMpXG4gICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICBkZXNjLnN0YXRzLnVuaWZvcm1zQ291bnQgPSBudW1Vbmlmb3Jtc1xuICAgIH1cbiAgICB2YXIgdW5pZm9ybXMgPSBkZXNjLnVuaWZvcm1zXG4gICAgZm9yIChpID0gMDsgaSA8IG51bVVuaWZvcm1zOyArK2kpIHtcbiAgICAgIGluZm8gPSBnbC5nZXRBY3RpdmVVbmlmb3JtKHByb2dyYW0sIGkpXG4gICAgICBpZiAoaW5mbykge1xuICAgICAgICBpZiAoaW5mby5zaXplID4gMSkge1xuICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgaW5mby5zaXplOyArK2opIHtcbiAgICAgICAgICAgIHZhciBuYW1lID0gaW5mby5uYW1lLnJlcGxhY2UoJ1swXScsICdbJyArIGogKyAnXScpXG4gICAgICAgICAgICBpbnNlcnRBY3RpdmVJbmZvKHVuaWZvcm1zLCBuZXcgQWN0aXZlSW5mbyhcbiAgICAgICAgICAgICAgbmFtZSxcbiAgICAgICAgICAgICAgc3RyaW5nU3RvcmUuaWQobmFtZSksXG4gICAgICAgICAgICAgIGdsLmdldFVuaWZvcm1Mb2NhdGlvbihwcm9ncmFtLCBuYW1lKSxcbiAgICAgICAgICAgICAgaW5mbykpXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGluc2VydEFjdGl2ZUluZm8odW5pZm9ybXMsIG5ldyBBY3RpdmVJbmZvKFxuICAgICAgICAgICAgaW5mby5uYW1lLFxuICAgICAgICAgICAgc3RyaW5nU3RvcmUuaWQoaW5mby5uYW1lKSxcbiAgICAgICAgICAgIGdsLmdldFVuaWZvcm1Mb2NhdGlvbihwcm9ncmFtLCBpbmZvLm5hbWUpLFxuICAgICAgICAgICAgaW5mbykpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gZ3JhYiBhdHRyaWJ1dGVzXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHZhciBudW1BdHRyaWJ1dGVzID0gZ2wuZ2V0UHJvZ3JhbVBhcmFtZXRlcihwcm9ncmFtLCBHTF9BQ1RJVkVfQVRUUklCVVRFUylcbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgIGRlc2Muc3RhdHMuYXR0cmlidXRlc0NvdW50ID0gbnVtQXR0cmlidXRlc1xuICAgIH1cblxuICAgIHZhciBhdHRyaWJ1dGVzID0gZGVzYy5hdHRyaWJ1dGVzXG4gICAgZm9yIChpID0gMDsgaSA8IG51bUF0dHJpYnV0ZXM7ICsraSkge1xuICAgICAgaW5mbyA9IGdsLmdldEFjdGl2ZUF0dHJpYihwcm9ncmFtLCBpKVxuICAgICAgaWYgKGluZm8pIHtcbiAgICAgICAgaW5zZXJ0QWN0aXZlSW5mbyhhdHRyaWJ1dGVzLCBuZXcgQWN0aXZlSW5mbyhcbiAgICAgICAgICBpbmZvLm5hbWUsXG4gICAgICAgICAgc3RyaW5nU3RvcmUuaWQoaW5mby5uYW1lKSxcbiAgICAgICAgICBnbC5nZXRBdHRyaWJMb2NhdGlvbihwcm9ncmFtLCBpbmZvLm5hbWUpLFxuICAgICAgICAgIGluZm8pKVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgIHN0YXRzLmdldE1heFVuaWZvcm1zQ291bnQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgbSA9IDBcbiAgICAgIHByb2dyYW1MaXN0LmZvckVhY2goZnVuY3Rpb24gKGRlc2MpIHtcbiAgICAgICAgaWYgKGRlc2Muc3RhdHMudW5pZm9ybXNDb3VudCA+IG0pIHtcbiAgICAgICAgICBtID0gZGVzYy5zdGF0cy51bmlmb3Jtc0NvdW50XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICByZXR1cm4gbVxuICAgIH1cblxuICAgIHN0YXRzLmdldE1heEF0dHJpYnV0ZXNDb3VudCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBtID0gMFxuICAgICAgcHJvZ3JhbUxpc3QuZm9yRWFjaChmdW5jdGlvbiAoZGVzYykge1xuICAgICAgICBpZiAoZGVzYy5zdGF0cy5hdHRyaWJ1dGVzQ291bnQgPiBtKSB7XG4gICAgICAgICAgbSA9IGRlc2Muc3RhdHMuYXR0cmlidXRlc0NvdW50XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICByZXR1cm4gbVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHJlc3RvcmVTaGFkZXJzICgpIHtcbiAgICBmcmFnU2hhZGVycyA9IHt9XG4gICAgdmVydFNoYWRlcnMgPSB7fVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcHJvZ3JhbUxpc3QubGVuZ3RoOyArK2kpIHtcbiAgICAgIGxpbmtQcm9ncmFtKHByb2dyYW1MaXN0W2ldKVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY2xlYXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBkZWxldGVTaGFkZXIgPSBnbC5kZWxldGVTaGFkZXIuYmluZChnbClcbiAgICAgIHZhbHVlcyhmcmFnU2hhZGVycykuZm9yRWFjaChkZWxldGVTaGFkZXIpXG4gICAgICBmcmFnU2hhZGVycyA9IHt9XG4gICAgICB2YWx1ZXModmVydFNoYWRlcnMpLmZvckVhY2goZGVsZXRlU2hhZGVyKVxuICAgICAgdmVydFNoYWRlcnMgPSB7fVxuXG4gICAgICBwcm9ncmFtTGlzdC5mb3JFYWNoKGZ1bmN0aW9uIChkZXNjKSB7XG4gICAgICAgIGdsLmRlbGV0ZVByb2dyYW0oZGVzYy5wcm9ncmFtKVxuICAgICAgfSlcbiAgICAgIHByb2dyYW1MaXN0Lmxlbmd0aCA9IDBcbiAgICAgIHByb2dyYW1DYWNoZSA9IHt9XG5cbiAgICAgIHN0YXRzLnNoYWRlckNvdW50ID0gMFxuICAgIH0sXG5cbiAgICBwcm9ncmFtOiBmdW5jdGlvbiAodmVydElkLCBmcmFnSWQsIGNvbW1hbmQpIHtcbiAgICAgIFxuICAgICAgXG5cbiAgICAgIHN0YXRzLnNoYWRlckNvdW50KytcblxuICAgICAgdmFyIGNhY2hlID0gcHJvZ3JhbUNhY2hlW2ZyYWdJZF1cbiAgICAgIGlmICghY2FjaGUpIHtcbiAgICAgICAgY2FjaGUgPSBwcm9ncmFtQ2FjaGVbZnJhZ0lkXSA9IHt9XG4gICAgICB9XG4gICAgICB2YXIgcHJvZ3JhbSA9IGNhY2hlW3ZlcnRJZF1cbiAgICAgIGlmICghcHJvZ3JhbSkge1xuICAgICAgICBwcm9ncmFtID0gbmV3IFJFR0xQcm9ncmFtKGZyYWdJZCwgdmVydElkKVxuICAgICAgICBsaW5rUHJvZ3JhbShwcm9ncmFtLCBjb21tYW5kKVxuICAgICAgICBjYWNoZVt2ZXJ0SWRdID0gcHJvZ3JhbVxuICAgICAgICBwcm9ncmFtTGlzdC5wdXNoKHByb2dyYW0pXG4gICAgICB9XG4gICAgICByZXR1cm4gcHJvZ3JhbVxuICAgIH0sXG5cbiAgICByZXN0b3JlOiByZXN0b3JlU2hhZGVycyxcblxuICAgIHNoYWRlcjogZ2V0U2hhZGVyLFxuXG4gICAgZnJhZzogLTEsXG4gICAgdmVydDogLTFcbiAgfVxufVxuIiwiXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHN0YXRzICgpIHtcbiAgcmV0dXJuIHtcbiAgICBidWZmZXJDb3VudDogMCxcbiAgICBlbGVtZW50c0NvdW50OiAwLFxuICAgIGZyYW1lYnVmZmVyQ291bnQ6IDAsXG4gICAgc2hhZGVyQ291bnQ6IDAsXG4gICAgdGV4dHVyZUNvdW50OiAwLFxuICAgIGN1YmVDb3VudDogMCxcbiAgICByZW5kZXJidWZmZXJDb3VudDogMCxcblxuICAgIG1heFRleHR1cmVVbml0czogMFxuICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNyZWF0ZVN0cmluZ1N0b3JlICgpIHtcbiAgdmFyIHN0cmluZ0lkcyA9IHsnJzogMH1cbiAgdmFyIHN0cmluZ1ZhbHVlcyA9IFsnJ11cbiAgcmV0dXJuIHtcbiAgICBpZDogZnVuY3Rpb24gKHN0cikge1xuICAgICAgdmFyIHJlc3VsdCA9IHN0cmluZ0lkc1tzdHJdXG4gICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH1cbiAgICAgIHJlc3VsdCA9IHN0cmluZ0lkc1tzdHJdID0gc3RyaW5nVmFsdWVzLmxlbmd0aFxuICAgICAgc3RyaW5nVmFsdWVzLnB1c2goc3RyKVxuICAgICAgcmV0dXJuIHJlc3VsdFxuICAgIH0sXG5cbiAgICBzdHI6IGZ1bmN0aW9uIChpZCkge1xuICAgICAgcmV0dXJuIHN0cmluZ1ZhbHVlc1tpZF1cbiAgICB9XG4gIH1cbn1cbiIsIlxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vdXRpbC9leHRlbmQnKVxudmFyIHZhbHVlcyA9IHJlcXVpcmUoJy4vdXRpbC92YWx1ZXMnKVxudmFyIGlzVHlwZWRBcnJheSA9IHJlcXVpcmUoJy4vdXRpbC9pcy10eXBlZC1hcnJheScpXG52YXIgaXNOREFycmF5TGlrZSA9IHJlcXVpcmUoJy4vdXRpbC9pcy1uZGFycmF5JylcbnZhciBwb29sID0gcmVxdWlyZSgnLi91dGlsL3Bvb2wnKVxudmFyIGNvbnZlcnRUb0hhbGZGbG9hdCA9IHJlcXVpcmUoJy4vdXRpbC90by1oYWxmLWZsb2F0JylcbnZhciBpc0FycmF5TGlrZSA9IHJlcXVpcmUoJy4vdXRpbC9pcy1hcnJheS1saWtlJylcbnZhciBmbGF0dGVuVXRpbHMgPSByZXF1aXJlKCcuL3V0aWwvZmxhdHRlbicpXG5cbnZhciBkdHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9hcnJheXR5cGVzLmpzb24nKVxudmFyIGFycmF5VHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9hcnJheXR5cGVzLmpzb24nKVxuXG52YXIgR0xfQ09NUFJFU1NFRF9URVhUVVJFX0ZPUk1BVFMgPSAweDg2QTNcblxudmFyIEdMX1RFWFRVUkVfMkQgPSAweDBERTFcbnZhciBHTF9URVhUVVJFX0NVQkVfTUFQID0gMHg4NTEzXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YID0gMHg4NTE1XG5cbnZhciBHTF9SR0JBID0gMHgxOTA4XG52YXIgR0xfQUxQSEEgPSAweDE5MDZcbnZhciBHTF9SR0IgPSAweDE5MDdcbnZhciBHTF9MVU1JTkFOQ0UgPSAweDE5MDlcbnZhciBHTF9MVU1JTkFOQ0VfQUxQSEEgPSAweDE5MEFcblxudmFyIEdMX1JHQkE0ID0gMHg4MDU2XG52YXIgR0xfUkdCNV9BMSA9IDB4ODA1N1xudmFyIEdMX1JHQjU2NSA9IDB4OEQ2MlxuXG52YXIgR0xfVU5TSUdORURfU0hPUlRfNF80XzRfNCA9IDB4ODAzM1xudmFyIEdMX1VOU0lHTkVEX1NIT1JUXzVfNV81XzEgPSAweDgwMzRcbnZhciBHTF9VTlNJR05FRF9TSE9SVF81XzZfNSA9IDB4ODM2M1xudmFyIEdMX1VOU0lHTkVEX0lOVF8yNF84X1dFQkdMID0gMHg4NEZBXG5cbnZhciBHTF9ERVBUSF9DT01QT05FTlQgPSAweDE5MDJcbnZhciBHTF9ERVBUSF9TVEVOQ0lMID0gMHg4NEY5XG5cbnZhciBHTF9TUkdCX0VYVCA9IDB4OEM0MFxudmFyIEdMX1NSR0JfQUxQSEFfRVhUID0gMHg4QzQyXG5cbnZhciBHTF9IQUxGX0ZMT0FUX09FUyA9IDB4OEQ2MVxuXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfUzNUQ19EWFQxX0VYVCA9IDB4ODNGMFxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDFfRVhUID0gMHg4M0YxXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUM19FWFQgPSAweDgzRjJcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQ1X0VYVCA9IDB4ODNGM1xuXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfQVRDX1dFQkdMID0gMHg4QzkyXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19FWFBMSUNJVF9BTFBIQV9XRUJHTCA9IDB4OEM5M1xudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9BVENfSU5URVJQT0xBVEVEX0FMUEhBX1dFQkdMID0gMHg4N0VFXG5cbnZhciBHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ180QlBQVjFfSU1HID0gMHg4QzAwXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfUFZSVENfMkJQUFYxX0lNRyA9IDB4OEMwMVxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9QVlJUQ180QlBQVjFfSU1HID0gMHg4QzAyXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1BWUlRDXzJCUFBWMV9JTUcgPSAweDhDMDNcblxudmFyIEdMX0NPTVBSRVNTRURfUkdCX0VUQzFfV0VCR0wgPSAweDhENjRcblxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSAweDE0MDFcbnZhciBHTF9VTlNJR05FRF9TSE9SVCA9IDB4MTQwM1xudmFyIEdMX1VOU0lHTkVEX0lOVCA9IDB4MTQwNVxudmFyIEdMX0ZMT0FUID0gMHgxNDA2XG5cbnZhciBHTF9URVhUVVJFX1dSQVBfUyA9IDB4MjgwMlxudmFyIEdMX1RFWFRVUkVfV1JBUF9UID0gMHgyODAzXG5cbnZhciBHTF9SRVBFQVQgPSAweDI5MDFcbnZhciBHTF9DTEFNUF9UT19FREdFID0gMHg4MTJGXG52YXIgR0xfTUlSUk9SRURfUkVQRUFUID0gMHg4MzcwXG5cbnZhciBHTF9URVhUVVJFX01BR19GSUxURVIgPSAweDI4MDBcbnZhciBHTF9URVhUVVJFX01JTl9GSUxURVIgPSAweDI4MDFcblxudmFyIEdMX05FQVJFU1QgPSAweDI2MDBcbnZhciBHTF9MSU5FQVIgPSAweDI2MDFcbnZhciBHTF9ORUFSRVNUX01JUE1BUF9ORUFSRVNUID0gMHgyNzAwXG52YXIgR0xfTElORUFSX01JUE1BUF9ORUFSRVNUID0gMHgyNzAxXG52YXIgR0xfTkVBUkVTVF9NSVBNQVBfTElORUFSID0gMHgyNzAyXG52YXIgR0xfTElORUFSX01JUE1BUF9MSU5FQVIgPSAweDI3MDNcblxudmFyIEdMX0dFTkVSQVRFX01JUE1BUF9ISU5UID0gMHg4MTkyXG52YXIgR0xfRE9OVF9DQVJFID0gMHgxMTAwXG52YXIgR0xfRkFTVEVTVCA9IDB4MTEwMVxudmFyIEdMX05JQ0VTVCA9IDB4MTEwMlxuXG52YXIgR0xfVEVYVFVSRV9NQVhfQU5JU09UUk9QWV9FWFQgPSAweDg0RkVcblxudmFyIEdMX1VOUEFDS19BTElHTk1FTlQgPSAweDBDRjVcbnZhciBHTF9VTlBBQ0tfRkxJUF9ZX1dFQkdMID0gMHg5MjQwXG52YXIgR0xfVU5QQUNLX1BSRU1VTFRJUExZX0FMUEhBX1dFQkdMID0gMHg5MjQxXG52YXIgR0xfVU5QQUNLX0NPTE9SU1BBQ0VfQ09OVkVSU0lPTl9XRUJHTCA9IDB4OTI0M1xuXG52YXIgR0xfQlJPV1NFUl9ERUZBVUxUX1dFQkdMID0gMHg5MjQ0XG5cbnZhciBHTF9URVhUVVJFMCA9IDB4ODRDMFxuXG52YXIgTUlQTUFQX0ZJTFRFUlMgPSBbXG4gIEdMX05FQVJFU1RfTUlQTUFQX05FQVJFU1QsXG4gIEdMX05FQVJFU1RfTUlQTUFQX0xJTkVBUixcbiAgR0xfTElORUFSX01JUE1BUF9ORUFSRVNULFxuICBHTF9MSU5FQVJfTUlQTUFQX0xJTkVBUlxuXVxuXG52YXIgQ0hBTk5FTFNfRk9STUFUID0gW1xuICAwLFxuICBHTF9MVU1JTkFOQ0UsXG4gIEdMX0xVTUlOQU5DRV9BTFBIQSxcbiAgR0xfUkdCLFxuICBHTF9SR0JBXG5dXG5cbnZhciBGT1JNQVRfQ0hBTk5FTFMgPSB7fVxuRk9STUFUX0NIQU5ORUxTW0dMX0xVTUlOQU5DRV0gPVxuRk9STUFUX0NIQU5ORUxTW0dMX0FMUEhBXSA9XG5GT1JNQVRfQ0hBTk5FTFNbR0xfREVQVEhfQ09NUE9ORU5UXSA9IDFcbkZPUk1BVF9DSEFOTkVMU1tHTF9ERVBUSF9TVEVOQ0lMXSA9XG5GT1JNQVRfQ0hBTk5FTFNbR0xfTFVNSU5BTkNFX0FMUEhBXSA9IDJcbkZPUk1BVF9DSEFOTkVMU1tHTF9SR0JdID1cbkZPUk1BVF9DSEFOTkVMU1tHTF9TUkdCX0VYVF0gPSAzXG5GT1JNQVRfQ0hBTk5FTFNbR0xfUkdCQV0gPVxuRk9STUFUX0NIQU5ORUxTW0dMX1NSR0JfQUxQSEFfRVhUXSA9IDRcblxudmFyIGZvcm1hdFR5cGVzID0ge31cbmZvcm1hdFR5cGVzW0dMX1JHQkE0XSA9IEdMX1VOU0lHTkVEX1NIT1JUXzRfNF80XzRcbmZvcm1hdFR5cGVzW0dMX1JHQjU2NV0gPSBHTF9VTlNJR05FRF9TSE9SVF81XzZfNVxuZm9ybWF0VHlwZXNbR0xfUkdCNV9BMV0gPSBHTF9VTlNJR05FRF9TSE9SVF81XzVfNV8xXG5mb3JtYXRUeXBlc1tHTF9ERVBUSF9DT01QT05FTlRdID0gR0xfVU5TSUdORURfSU5UXG5mb3JtYXRUeXBlc1tHTF9ERVBUSF9TVEVOQ0lMXSA9IEdMX1VOU0lHTkVEX0lOVF8yNF84X1dFQkdMXG5cbmZ1bmN0aW9uIG9iamVjdE5hbWUgKHN0cikge1xuICByZXR1cm4gJ1tvYmplY3QgJyArIHN0ciArICddJ1xufVxuXG52YXIgQ0FOVkFTX0NMQVNTID0gb2JqZWN0TmFtZSgnSFRNTENhbnZhc0VsZW1lbnQnKVxudmFyIENPTlRFWFQyRF9DTEFTUyA9IG9iamVjdE5hbWUoJ0NhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCcpXG52YXIgSU1BR0VfQ0xBU1MgPSBvYmplY3ROYW1lKCdIVE1MSW1hZ2VFbGVtZW50JylcbnZhciBWSURFT19DTEFTUyA9IG9iamVjdE5hbWUoJ0hUTUxWaWRlb0VsZW1lbnQnKVxuXG52YXIgUElYRUxfQ0xBU1NFUyA9IE9iamVjdC5rZXlzKGR0eXBlcykuY29uY2F0KFtcbiAgQ0FOVkFTX0NMQVNTLFxuICBDT05URVhUMkRfQ0xBU1MsXG4gIElNQUdFX0NMQVNTLFxuICBWSURFT19DTEFTU1xuXSlcblxuLy8gZm9yIGV2ZXJ5IHRleHR1cmUgdHlwZSwgc3RvcmVcbi8vIHRoZSBzaXplIGluIGJ5dGVzLlxudmFyIFRZUEVfU0laRVMgPSBbXVxuVFlQRV9TSVpFU1tHTF9VTlNJR05FRF9CWVRFXSA9IDFcblRZUEVfU0laRVNbR0xfRkxPQVRdID0gNFxuVFlQRV9TSVpFU1tHTF9IQUxGX0ZMT0FUX09FU10gPSAyXG5cblRZUEVfU0laRVNbR0xfVU5TSUdORURfU0hPUlRdID0gMlxuVFlQRV9TSVpFU1tHTF9VTlNJR05FRF9JTlRdID0gNFxuXG52YXIgRk9STUFUX1NJWkVTX1NQRUNJQUwgPSBbXVxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfUkdCQTRdID0gMlxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfUkdCNV9BMV0gPSAyXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9SR0I1NjVdID0gMlxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfREVQVEhfU1RFTkNJTF0gPSA0XG5cbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCX1MzVENfRFhUMV9FWFRdID0gMC41XG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQxX0VYVF0gPSAwLjVcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDNfRVhUXSA9IDFcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDVfRVhUXSA9IDFcblxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JfQVRDX1dFQkdMXSA9IDAuNVxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19FWFBMSUNJVF9BTFBIQV9XRUJHTF0gPSAxXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQkFfQVRDX0lOVEVSUE9MQVRFRF9BTFBIQV9XRUJHTF0gPSAxXG5cbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCX1BWUlRDXzRCUFBWMV9JTUddID0gMC41XG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ18yQlBQVjFfSU1HXSA9IDAuMjVcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCQV9QVlJUQ180QlBQVjFfSU1HXSA9IDAuNVxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JBX1BWUlRDXzJCUFBWMV9JTUddID0gMC4yNVxuXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQl9FVEMxX1dFQkdMXSA9IDAuNVxuXG5mdW5jdGlvbiBpc051bWVyaWNBcnJheSAoYXJyKSB7XG4gIHJldHVybiAoXG4gICAgQXJyYXkuaXNBcnJheShhcnIpICYmXG4gICAgKGFyci5sZW5ndGggPT09IDAgfHxcbiAgICB0eXBlb2YgYXJyWzBdID09PSAnbnVtYmVyJykpXG59XG5cbmZ1bmN0aW9uIGlzUmVjdEFycmF5IChhcnIpIHtcbiAgaWYgKCFBcnJheS5pc0FycmF5KGFycikpIHtcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxuICB2YXIgd2lkdGggPSBhcnIubGVuZ3RoXG4gIGlmICh3aWR0aCA9PT0gMCB8fCAhaXNBcnJheUxpa2UoYXJyWzBdKSkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG4gIHJldHVybiB0cnVlXG59XG5cbmZ1bmN0aW9uIGNsYXNzU3RyaW5nICh4KSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoeClcbn1cblxuZnVuY3Rpb24gaXNDYW52YXNFbGVtZW50IChvYmplY3QpIHtcbiAgcmV0dXJuIGNsYXNzU3RyaW5nKG9iamVjdCkgPT09IENBTlZBU19DTEFTU1xufVxuXG5mdW5jdGlvbiBpc0NvbnRleHQyRCAob2JqZWN0KSB7XG4gIHJldHVybiBjbGFzc1N0cmluZyhvYmplY3QpID09PSBDT05URVhUMkRfQ0xBU1Ncbn1cblxuZnVuY3Rpb24gaXNJbWFnZUVsZW1lbnQgKG9iamVjdCkge1xuICByZXR1cm4gY2xhc3NTdHJpbmcob2JqZWN0KSA9PT0gSU1BR0VfQ0xBU1Ncbn1cblxuZnVuY3Rpb24gaXNWaWRlb0VsZW1lbnQgKG9iamVjdCkge1xuICByZXR1cm4gY2xhc3NTdHJpbmcob2JqZWN0KSA9PT0gVklERU9fQ0xBU1Ncbn1cblxuZnVuY3Rpb24gaXNQaXhlbERhdGEgKG9iamVjdCkge1xuICBpZiAoIW9iamVjdCkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG4gIHZhciBjbGFzc05hbWUgPSBjbGFzc1N0cmluZyhvYmplY3QpXG4gIGlmIChQSVhFTF9DTEFTU0VTLmluZGV4T2YoY2xhc3NOYW1lKSA+PSAwKSB7XG4gICAgcmV0dXJuIHRydWVcbiAgfVxuICByZXR1cm4gKFxuICAgIGlzTnVtZXJpY0FycmF5KG9iamVjdCkgfHxcbiAgICBpc1JlY3RBcnJheShvYmplY3QpIHx8XG4gICAgaXNOREFycmF5TGlrZShvYmplY3QpKVxufVxuXG5mdW5jdGlvbiB0eXBlZEFycmF5Q29kZSAoZGF0YSkge1xuICByZXR1cm4gYXJyYXlUeXBlc1tPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoZGF0YSldIHwgMFxufVxuXG5mdW5jdGlvbiBjb252ZXJ0RGF0YSAocmVzdWx0LCBkYXRhKSB7XG4gIHZhciBuID0gZGF0YS5sZW5ndGhcbiAgc3dpdGNoIChyZXN1bHQudHlwZSkge1xuICAgIGNhc2UgR0xfVU5TSUdORURfQllURTpcbiAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUOlxuICAgIGNhc2UgR0xfVU5TSUdORURfSU5UOlxuICAgIGNhc2UgR0xfRkxPQVQ6XG4gICAgICB2YXIgY29udmVydGVkID0gcG9vbC5hbGxvY1R5cGUocmVzdWx0LnR5cGUsIG4pXG4gICAgICBjb252ZXJ0ZWQuc2V0KGRhdGEpXG4gICAgICByZXN1bHQuZGF0YSA9IGNvbnZlcnRlZFxuICAgICAgYnJlYWtcblxuICAgIGNhc2UgR0xfSEFMRl9GTE9BVF9PRVM6XG4gICAgICByZXN1bHQuZGF0YSA9IGNvbnZlcnRUb0hhbGZGbG9hdChkYXRhKVxuICAgICAgYnJlYWtcblxuICAgIGRlZmF1bHQ6XG4gICAgICBcbiAgfVxufVxuXG5mdW5jdGlvbiBwcmVDb252ZXJ0IChpbWFnZSwgbikge1xuICByZXR1cm4gcG9vbC5hbGxvY1R5cGUoXG4gICAgaW1hZ2UudHlwZSA9PT0gR0xfSEFMRl9GTE9BVF9PRVNcbiAgICAgID8gR0xfRkxPQVRcbiAgICAgIDogaW1hZ2UudHlwZSwgbilcbn1cblxuZnVuY3Rpb24gcG9zdENvbnZlcnQgKGltYWdlLCBkYXRhKSB7XG4gIGlmIChpbWFnZS50eXBlID09PSBHTF9IQUxGX0ZMT0FUX09FUykge1xuICAgIGltYWdlLmRhdGEgPSBjb252ZXJ0VG9IYWxmRmxvYXQoZGF0YSlcbiAgICBwb29sLmZyZWVUeXBlKGRhdGEpXG4gIH0gZWxzZSB7XG4gICAgaW1hZ2UuZGF0YSA9IGRhdGFcbiAgfVxufVxuXG5mdW5jdGlvbiB0cmFuc3Bvc2VEYXRhIChpbWFnZSwgYXJyYXksIHN0cmlkZVgsIHN0cmlkZVksIHN0cmlkZUMsIG9mZnNldCkge1xuICB2YXIgdyA9IGltYWdlLndpZHRoXG4gIHZhciBoID0gaW1hZ2UuaGVpZ2h0XG4gIHZhciBjID0gaW1hZ2UuY2hhbm5lbHNcbiAgdmFyIG4gPSB3ICogaCAqIGNcbiAgdmFyIGRhdGEgPSBwcmVDb252ZXJ0KGltYWdlLCBuKVxuXG4gIHZhciBwID0gMFxuICBmb3IgKHZhciBpID0gMDsgaSA8IGg7ICsraSkge1xuICAgIGZvciAodmFyIGogPSAwOyBqIDwgdzsgKytqKSB7XG4gICAgICBmb3IgKHZhciBrID0gMDsgayA8IGM7ICsraykge1xuICAgICAgICBkYXRhW3ArK10gPSBhcnJheVtzdHJpZGVYICogaiArIHN0cmlkZVkgKiBpICsgc3RyaWRlQyAqIGsgKyBvZmZzZXRdXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcG9zdENvbnZlcnQoaW1hZ2UsIGRhdGEpXG59XG5cbmZ1bmN0aW9uIGdldFRleHR1cmVTaXplIChmb3JtYXQsIHR5cGUsIHdpZHRoLCBoZWlnaHQsIGlzTWlwbWFwLCBpc0N1YmUpIHtcbiAgdmFyIHNcbiAgaWYgKHR5cGVvZiBGT1JNQVRfU0laRVNfU1BFQ0lBTFtmb3JtYXRdICE9PSAndW5kZWZpbmVkJykge1xuICAgIC8vIHdlIGhhdmUgYSBzcGVjaWFsIGFycmF5IGZvciBkZWFsaW5nIHdpdGggd2VpcmQgY29sb3IgZm9ybWF0cyBzdWNoIGFzIFJHQjVBMVxuICAgIHMgPSBGT1JNQVRfU0laRVNfU1BFQ0lBTFtmb3JtYXRdXG4gIH0gZWxzZSB7XG4gICAgcyA9IEZPUk1BVF9DSEFOTkVMU1tmb3JtYXRdICogVFlQRV9TSVpFU1t0eXBlXVxuICB9XG5cbiAgaWYgKGlzQ3ViZSkge1xuICAgIHMgKj0gNlxuICB9XG5cbiAgaWYgKGlzTWlwbWFwKSB7XG4gICAgLy8gY29tcHV0ZSB0aGUgdG90YWwgc2l6ZSBvZiBhbGwgdGhlIG1pcG1hcHMuXG4gICAgdmFyIHRvdGFsID0gMFxuXG4gICAgdmFyIHcgPSB3aWR0aFxuICAgIHdoaWxlICh3ID49IDEpIHtcbiAgICAgIC8vIHdlIGNhbiBvbmx5IHVzZSBtaXBtYXBzIG9uIGEgc3F1YXJlIGltYWdlLFxuICAgICAgLy8gc28gd2UgY2FuIHNpbXBseSB1c2UgdGhlIHdpZHRoIGFuZCBpZ25vcmUgdGhlIGhlaWdodDpcbiAgICAgIHRvdGFsICs9IHMgKiB3ICogd1xuICAgICAgdyAvPSAyXG4gICAgfVxuICAgIHJldHVybiB0b3RhbFxuICB9IGVsc2Uge1xuICAgIHJldHVybiBzICogd2lkdGggKiBoZWlnaHRcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNyZWF0ZVRleHR1cmVTZXQgKFxuICBnbCwgZXh0ZW5zaW9ucywgbGltaXRzLCByZWdsUG9sbCwgY29udGV4dFN0YXRlLCBzdGF0cywgY29uZmlnKSB7XG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gSW5pdGlhbGl6ZSBjb25zdGFudHMgYW5kIHBhcmFtZXRlciB0YWJsZXMgaGVyZVxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIHZhciBtaXBtYXBIaW50ID0ge1xuICAgIFwiZG9uJ3QgY2FyZVwiOiBHTF9ET05UX0NBUkUsXG4gICAgJ2RvbnQgY2FyZSc6IEdMX0RPTlRfQ0FSRSxcbiAgICAnbmljZSc6IEdMX05JQ0VTVCxcbiAgICAnZmFzdCc6IEdMX0ZBU1RFU1RcbiAgfVxuXG4gIHZhciB3cmFwTW9kZXMgPSB7XG4gICAgJ3JlcGVhdCc6IEdMX1JFUEVBVCxcbiAgICAnY2xhbXAnOiBHTF9DTEFNUF9UT19FREdFLFxuICAgICdtaXJyb3InOiBHTF9NSVJST1JFRF9SRVBFQVRcbiAgfVxuXG4gIHZhciBtYWdGaWx0ZXJzID0ge1xuICAgICduZWFyZXN0JzogR0xfTkVBUkVTVCxcbiAgICAnbGluZWFyJzogR0xfTElORUFSXG4gIH1cblxuICB2YXIgbWluRmlsdGVycyA9IGV4dGVuZCh7XG4gICAgJ21pcG1hcCc6IEdMX0xJTkVBUl9NSVBNQVBfTElORUFSLFxuICAgICduZWFyZXN0IG1pcG1hcCBuZWFyZXN0JzogR0xfTkVBUkVTVF9NSVBNQVBfTkVBUkVTVCxcbiAgICAnbGluZWFyIG1pcG1hcCBuZWFyZXN0JzogR0xfTElORUFSX01JUE1BUF9ORUFSRVNULFxuICAgICduZWFyZXN0IG1pcG1hcCBsaW5lYXInOiBHTF9ORUFSRVNUX01JUE1BUF9MSU5FQVIsXG4gICAgJ2xpbmVhciBtaXBtYXAgbGluZWFyJzogR0xfTElORUFSX01JUE1BUF9MSU5FQVJcbiAgfSwgbWFnRmlsdGVycylcblxuICB2YXIgY29sb3JTcGFjZSA9IHtcbiAgICAnbm9uZSc6IDAsXG4gICAgJ2Jyb3dzZXInOiBHTF9CUk9XU0VSX0RFRkFVTFRfV0VCR0xcbiAgfVxuXG4gIHZhciB0ZXh0dXJlVHlwZXMgPSB7XG4gICAgJ3VpbnQ4JzogR0xfVU5TSUdORURfQllURSxcbiAgICAncmdiYTQnOiBHTF9VTlNJR05FRF9TSE9SVF80XzRfNF80LFxuICAgICdyZ2I1NjUnOiBHTF9VTlNJR05FRF9TSE9SVF81XzZfNSxcbiAgICAncmdiNSBhMSc6IEdMX1VOU0lHTkVEX1NIT1JUXzVfNV81XzFcbiAgfVxuXG4gIHZhciB0ZXh0dXJlRm9ybWF0cyA9IHtcbiAgICAnYWxwaGEnOiBHTF9BTFBIQSxcbiAgICAnbHVtaW5hbmNlJzogR0xfTFVNSU5BTkNFLFxuICAgICdsdW1pbmFuY2UgYWxwaGEnOiBHTF9MVU1JTkFOQ0VfQUxQSEEsXG4gICAgJ3JnYic6IEdMX1JHQixcbiAgICAncmdiYSc6IEdMX1JHQkEsXG4gICAgJ3JnYmE0JzogR0xfUkdCQTQsXG4gICAgJ3JnYjUgYTEnOiBHTF9SR0I1X0ExLFxuICAgICdyZ2I1NjUnOiBHTF9SR0I1NjVcbiAgfVxuXG4gIHZhciBjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHMgPSB7fVxuXG4gIGlmIChleHRlbnNpb25zLmV4dF9zcmdiKSB7XG4gICAgdGV4dHVyZUZvcm1hdHMuc3JnYiA9IEdMX1NSR0JfRVhUXG4gICAgdGV4dHVyZUZvcm1hdHMuc3JnYmEgPSBHTF9TUkdCX0FMUEhBX0VYVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMub2VzX3RleHR1cmVfZmxvYXQpIHtcbiAgICB0ZXh0dXJlVHlwZXMuZmxvYXQzMiA9IHRleHR1cmVUeXBlcy5mbG9hdCA9IEdMX0ZMT0FUXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9oYWxmX2Zsb2F0KSB7XG4gICAgdGV4dHVyZVR5cGVzWydmbG9hdDE2J10gPSB0ZXh0dXJlVHlwZXNbJ2hhbGYgZmxvYXQnXSA9IEdMX0hBTEZfRkxPQVRfT0VTXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9kZXB0aF90ZXh0dXJlKSB7XG4gICAgZXh0ZW5kKHRleHR1cmVGb3JtYXRzLCB7XG4gICAgICAnZGVwdGgnOiBHTF9ERVBUSF9DT01QT05FTlQsXG4gICAgICAnZGVwdGggc3RlbmNpbCc6IEdMX0RFUFRIX1NURU5DSUxcbiAgICB9KVxuXG4gICAgZXh0ZW5kKHRleHR1cmVUeXBlcywge1xuICAgICAgJ3VpbnQxNic6IEdMX1VOU0lHTkVEX1NIT1JULFxuICAgICAgJ3VpbnQzMic6IEdMX1VOU0lHTkVEX0lOVCxcbiAgICAgICdkZXB0aCBzdGVuY2lsJzogR0xfVU5TSUdORURfSU5UXzI0XzhfV0VCR0xcbiAgICB9KVxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29tcHJlc3NlZF90ZXh0dXJlX3MzdGMpIHtcbiAgICBleHRlbmQoY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzLCB7XG4gICAgICAncmdiIHMzdGMgZHh0MSc6IEdMX0NPTVBSRVNTRURfUkdCX1MzVENfRFhUMV9FWFQsXG4gICAgICAncmdiYSBzM3RjIGR4dDEnOiBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQxX0VYVCxcbiAgICAgICdyZ2JhIHMzdGMgZHh0Myc6IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDNfRVhULFxuICAgICAgJ3JnYmEgczN0YyBkeHQ1JzogR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUNV9FWFRcbiAgICB9KVxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29tcHJlc3NlZF90ZXh0dXJlX2F0Yykge1xuICAgIGV4dGVuZChjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHMsIHtcbiAgICAgICdyZ2IgYXRjJzogR0xfQ09NUFJFU1NFRF9SR0JfQVRDX1dFQkdMLFxuICAgICAgJ3JnYmEgYXRjIGV4cGxpY2l0IGFscGhhJzogR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19FWFBMSUNJVF9BTFBIQV9XRUJHTCxcbiAgICAgICdyZ2JhIGF0YyBpbnRlcnBvbGF0ZWQgYWxwaGEnOiBHTF9DT01QUkVTU0VEX1JHQkFfQVRDX0lOVEVSUE9MQVRFRF9BTFBIQV9XRUJHTFxuICAgIH0pXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb21wcmVzc2VkX3RleHR1cmVfcHZydGMpIHtcbiAgICBleHRlbmQoY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzLCB7XG4gICAgICAncmdiIHB2cnRjIDRicHB2MSc6IEdMX0NPTVBSRVNTRURfUkdCX1BWUlRDXzRCUFBWMV9JTUcsXG4gICAgICAncmdiIHB2cnRjIDJicHB2MSc6IEdMX0NPTVBSRVNTRURfUkdCX1BWUlRDXzJCUFBWMV9JTUcsXG4gICAgICAncmdiYSBwdnJ0YyA0YnBwdjEnOiBHTF9DT01QUkVTU0VEX1JHQkFfUFZSVENfNEJQUFYxX0lNRyxcbiAgICAgICdyZ2JhIHB2cnRjIDJicHB2MSc6IEdMX0NPTVBSRVNTRURfUkdCQV9QVlJUQ18yQlBQVjFfSU1HXG4gICAgfSlcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9ldGMxKSB7XG4gICAgY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzWydyZ2IgZXRjMSddID0gR0xfQ09NUFJFU1NFRF9SR0JfRVRDMV9XRUJHTFxuICB9XG5cbiAgLy8gQ29weSBvdmVyIGFsbCB0ZXh0dXJlIGZvcm1hdHNcbiAgdmFyIHN1cHBvcnRlZENvbXByZXNzZWRGb3JtYXRzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoXG4gICAgZ2wuZ2V0UGFyYW1ldGVyKEdMX0NPTVBSRVNTRURfVEVYVFVSRV9GT1JNQVRTKSlcbiAgT2JqZWN0LmtleXMoY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdmFyIGZvcm1hdCA9IGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0c1tuYW1lXVxuICAgIGlmIChzdXBwb3J0ZWRDb21wcmVzc2VkRm9ybWF0cy5pbmRleE9mKGZvcm1hdCkgPj0gMCkge1xuICAgICAgdGV4dHVyZUZvcm1hdHNbbmFtZV0gPSBmb3JtYXRcbiAgICB9XG4gIH0pXG5cbiAgdmFyIHN1cHBvcnRlZEZvcm1hdHMgPSBPYmplY3Qua2V5cyh0ZXh0dXJlRm9ybWF0cylcbiAgbGltaXRzLnRleHR1cmVGb3JtYXRzID0gc3VwcG9ydGVkRm9ybWF0c1xuXG4gIC8vIGFzc29jaWF0ZSB3aXRoIGV2ZXJ5IGZvcm1hdCBzdHJpbmcgaXRzXG4gIC8vIGNvcnJlc3BvbmRpbmcgR0wtdmFsdWUuXG4gIHZhciB0ZXh0dXJlRm9ybWF0c0ludmVydCA9IFtdXG4gIE9iamVjdC5rZXlzKHRleHR1cmVGb3JtYXRzKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICB2YXIgdmFsID0gdGV4dHVyZUZvcm1hdHNba2V5XVxuICAgIHRleHR1cmVGb3JtYXRzSW52ZXJ0W3ZhbF0gPSBrZXlcbiAgfSlcblxuICAvLyBhc3NvY2lhdGUgd2l0aCBldmVyeSB0eXBlIHN0cmluZyBpdHNcbiAgLy8gY29ycmVzcG9uZGluZyBHTC12YWx1ZS5cbiAgdmFyIHRleHR1cmVUeXBlc0ludmVydCA9IFtdXG4gIE9iamVjdC5rZXlzKHRleHR1cmVUeXBlcykuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgdmFyIHZhbCA9IHRleHR1cmVUeXBlc1trZXldXG4gICAgdGV4dHVyZVR5cGVzSW52ZXJ0W3ZhbF0gPSBrZXlcbiAgfSlcblxuICB2YXIgbWFnRmlsdGVyc0ludmVydCA9IFtdXG4gIE9iamVjdC5rZXlzKG1hZ0ZpbHRlcnMpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgIHZhciB2YWwgPSBtYWdGaWx0ZXJzW2tleV1cbiAgICBtYWdGaWx0ZXJzSW52ZXJ0W3ZhbF0gPSBrZXlcbiAgfSlcblxuICB2YXIgbWluRmlsdGVyc0ludmVydCA9IFtdXG4gIE9iamVjdC5rZXlzKG1pbkZpbHRlcnMpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgIHZhciB2YWwgPSBtaW5GaWx0ZXJzW2tleV1cbiAgICBtaW5GaWx0ZXJzSW52ZXJ0W3ZhbF0gPSBrZXlcbiAgfSlcblxuICB2YXIgd3JhcE1vZGVzSW52ZXJ0ID0gW11cbiAgT2JqZWN0LmtleXMod3JhcE1vZGVzKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICB2YXIgdmFsID0gd3JhcE1vZGVzW2tleV1cbiAgICB3cmFwTW9kZXNJbnZlcnRbdmFsXSA9IGtleVxuICB9KVxuXG4gIC8vIGNvbG9yRm9ybWF0c1tdIGdpdmVzIHRoZSBmb3JtYXQgKGNoYW5uZWxzKSBhc3NvY2lhdGVkIHRvIGFuXG4gIC8vIGludGVybmFsZm9ybWF0XG4gIHZhciBjb2xvckZvcm1hdHMgPSBzdXBwb3J0ZWRGb3JtYXRzLnJlZHVjZShmdW5jdGlvbiAoY29sb3IsIGtleSkge1xuICAgIHZhciBnbGVudW0gPSB0ZXh0dXJlRm9ybWF0c1trZXldXG4gICAgaWYgKGdsZW51bSA9PT0gR0xfTFVNSU5BTkNFIHx8XG4gICAgICAgIGdsZW51bSA9PT0gR0xfQUxQSEEgfHxcbiAgICAgICAgZ2xlbnVtID09PSBHTF9MVU1JTkFOQ0UgfHxcbiAgICAgICAgZ2xlbnVtID09PSBHTF9MVU1JTkFOQ0VfQUxQSEEgfHxcbiAgICAgICAgZ2xlbnVtID09PSBHTF9ERVBUSF9DT01QT05FTlQgfHxcbiAgICAgICAgZ2xlbnVtID09PSBHTF9ERVBUSF9TVEVOQ0lMKSB7XG4gICAgICBjb2xvcltnbGVudW1dID0gZ2xlbnVtXG4gICAgfSBlbHNlIGlmIChnbGVudW0gPT09IEdMX1JHQjVfQTEgfHwga2V5LmluZGV4T2YoJ3JnYmEnKSA+PSAwKSB7XG4gICAgICBjb2xvcltnbGVudW1dID0gR0xfUkdCQVxuICAgIH0gZWxzZSB7XG4gICAgICBjb2xvcltnbGVudW1dID0gR0xfUkdCXG4gICAgfVxuICAgIHJldHVybiBjb2xvclxuICB9LCB7fSlcblxuICBmdW5jdGlvbiBUZXhGbGFncyAoKSB7XG4gICAgLy8gZm9ybWF0IGluZm9cbiAgICB0aGlzLmludGVybmFsZm9ybWF0ID0gR0xfUkdCQVxuICAgIHRoaXMuZm9ybWF0ID0gR0xfUkdCQVxuICAgIHRoaXMudHlwZSA9IEdMX1VOU0lHTkVEX0JZVEVcbiAgICB0aGlzLmNvbXByZXNzZWQgPSBmYWxzZVxuXG4gICAgLy8gcGl4ZWwgc3RvcmFnZVxuICAgIHRoaXMucHJlbXVsdGlwbHlBbHBoYSA9IGZhbHNlXG4gICAgdGhpcy5mbGlwWSA9IGZhbHNlXG4gICAgdGhpcy51bnBhY2tBbGlnbm1lbnQgPSAxXG4gICAgdGhpcy5jb2xvclNwYWNlID0gMFxuXG4gICAgLy8gc2hhcGUgaW5mb1xuICAgIHRoaXMud2lkdGggPSAwXG4gICAgdGhpcy5oZWlnaHQgPSAwXG4gICAgdGhpcy5jaGFubmVscyA9IDBcbiAgfVxuXG4gIGZ1bmN0aW9uIGNvcHlGbGFncyAocmVzdWx0LCBvdGhlcikge1xuICAgIHJlc3VsdC5pbnRlcm5hbGZvcm1hdCA9IG90aGVyLmludGVybmFsZm9ybWF0XG4gICAgcmVzdWx0LmZvcm1hdCA9IG90aGVyLmZvcm1hdFxuICAgIHJlc3VsdC50eXBlID0gb3RoZXIudHlwZVxuICAgIHJlc3VsdC5jb21wcmVzc2VkID0gb3RoZXIuY29tcHJlc3NlZFxuXG4gICAgcmVzdWx0LnByZW11bHRpcGx5QWxwaGEgPSBvdGhlci5wcmVtdWx0aXBseUFscGhhXG4gICAgcmVzdWx0LmZsaXBZID0gb3RoZXIuZmxpcFlcbiAgICByZXN1bHQudW5wYWNrQWxpZ25tZW50ID0gb3RoZXIudW5wYWNrQWxpZ25tZW50XG4gICAgcmVzdWx0LmNvbG9yU3BhY2UgPSBvdGhlci5jb2xvclNwYWNlXG5cbiAgICByZXN1bHQud2lkdGggPSBvdGhlci53aWR0aFxuICAgIHJlc3VsdC5oZWlnaHQgPSBvdGhlci5oZWlnaHRcbiAgICByZXN1bHQuY2hhbm5lbHMgPSBvdGhlci5jaGFubmVsc1xuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VGbGFncyAoZmxhZ3MsIG9wdGlvbnMpIHtcbiAgICBpZiAodHlwZW9mIG9wdGlvbnMgIT09ICdvYmplY3QnIHx8ICFvcHRpb25zKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBpZiAoJ3ByZW11bHRpcGx5QWxwaGEnIGluIG9wdGlvbnMpIHtcbiAgICAgIFxuICAgICAgZmxhZ3MucHJlbXVsdGlwbHlBbHBoYSA9IG9wdGlvbnMucHJlbXVsdGlwbHlBbHBoYVxuICAgIH1cblxuICAgIGlmICgnZmxpcFknIGluIG9wdGlvbnMpIHtcbiAgICAgIFxuICAgICAgZmxhZ3MuZmxpcFkgPSBvcHRpb25zLmZsaXBZXG4gICAgfVxuXG4gICAgaWYgKCdhbGlnbm1lbnQnIGluIG9wdGlvbnMpIHtcbiAgICAgIFxuICAgICAgZmxhZ3MudW5wYWNrQWxpZ25tZW50ID0gb3B0aW9ucy5hbGlnbm1lbnRcbiAgICB9XG5cbiAgICBpZiAoJ2NvbG9yU3BhY2UnIGluIG9wdGlvbnMpIHtcbiAgICAgIFxuICAgICAgZmxhZ3MuY29sb3JTcGFjZSA9IGNvbG9yU3BhY2Vbb3B0aW9ucy5jb2xvclNwYWNlXVxuICAgIH1cblxuICAgIGlmICgndHlwZScgaW4gb3B0aW9ucykge1xuICAgICAgdmFyIHR5cGUgPSBvcHRpb25zLnR5cGVcbiAgICAgIFxuICAgICAgXG4gICAgICBcbiAgICAgIFxuICAgICAgZmxhZ3MudHlwZSA9IHRleHR1cmVUeXBlc1t0eXBlXVxuICAgIH1cblxuICAgIHZhciB3ID0gZmxhZ3Mud2lkdGhcbiAgICB2YXIgaCA9IGZsYWdzLmhlaWdodFxuICAgIHZhciBjID0gZmxhZ3MuY2hhbm5lbHNcbiAgICB2YXIgaGFzQ2hhbm5lbHMgPSBmYWxzZVxuICAgIGlmICgnc2hhcGUnIGluIG9wdGlvbnMpIHtcbiAgICAgIFxuICAgICAgdyA9IG9wdGlvbnMuc2hhcGVbMF1cbiAgICAgIGggPSBvcHRpb25zLnNoYXBlWzFdXG4gICAgICBpZiAob3B0aW9ucy5zaGFwZS5sZW5ndGggPT09IDMpIHtcbiAgICAgICAgYyA9IG9wdGlvbnMuc2hhcGVbMl1cbiAgICAgICAgXG4gICAgICAgIGhhc0NoYW5uZWxzID0gdHJ1ZVxuICAgICAgfVxuICAgICAgXG4gICAgICBcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKCdyYWRpdXMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdyA9IGggPSBvcHRpb25zLnJhZGl1c1xuICAgICAgICBcbiAgICAgIH1cbiAgICAgIGlmICgnd2lkdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdyA9IG9wdGlvbnMud2lkdGhcbiAgICAgICAgXG4gICAgICB9XG4gICAgICBpZiAoJ2hlaWdodCcgaW4gb3B0aW9ucykge1xuICAgICAgICBoID0gb3B0aW9ucy5oZWlnaHRcbiAgICAgICAgXG4gICAgICB9XG4gICAgICBpZiAoJ2NoYW5uZWxzJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIGMgPSBvcHRpb25zLmNoYW5uZWxzXG4gICAgICAgIFxuICAgICAgICBoYXNDaGFubmVscyA9IHRydWVcbiAgICAgIH1cbiAgICB9XG4gICAgZmxhZ3Mud2lkdGggPSB3IHwgMFxuICAgIGZsYWdzLmhlaWdodCA9IGggfCAwXG4gICAgZmxhZ3MuY2hhbm5lbHMgPSBjIHwgMFxuXG4gICAgdmFyIGhhc0Zvcm1hdCA9IGZhbHNlXG4gICAgaWYgKCdmb3JtYXQnIGluIG9wdGlvbnMpIHtcbiAgICAgIHZhciBmb3JtYXRTdHIgPSBvcHRpb25zLmZvcm1hdFxuICAgICAgXG4gICAgICBcbiAgICAgIHZhciBpbnRlcm5hbGZvcm1hdCA9IGZsYWdzLmludGVybmFsZm9ybWF0ID0gdGV4dHVyZUZvcm1hdHNbZm9ybWF0U3RyXVxuICAgICAgZmxhZ3MuZm9ybWF0ID0gY29sb3JGb3JtYXRzW2ludGVybmFsZm9ybWF0XVxuICAgICAgaWYgKGZvcm1hdFN0ciBpbiB0ZXh0dXJlVHlwZXMpIHtcbiAgICAgICAgaWYgKCEoJ3R5cGUnIGluIG9wdGlvbnMpKSB7XG4gICAgICAgICAgZmxhZ3MudHlwZSA9IHRleHR1cmVUeXBlc1tmb3JtYXRTdHJdXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChmb3JtYXRTdHIgaW4gY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzKSB7XG4gICAgICAgIGZsYWdzLmNvbXByZXNzZWQgPSB0cnVlXG4gICAgICB9XG4gICAgICBoYXNGb3JtYXQgPSB0cnVlXG4gICAgfVxuXG4gICAgLy8gUmVjb25jaWxlIGNoYW5uZWxzIGFuZCBmb3JtYXRcbiAgICBpZiAoIWhhc0NoYW5uZWxzICYmIGhhc0Zvcm1hdCkge1xuICAgICAgZmxhZ3MuY2hhbm5lbHMgPSBGT1JNQVRfQ0hBTk5FTFNbZmxhZ3MuZm9ybWF0XVxuICAgIH0gZWxzZSBpZiAoaGFzQ2hhbm5lbHMgJiYgIWhhc0Zvcm1hdCkge1xuICAgICAgaWYgKGZsYWdzLmNoYW5uZWxzICE9PSBDSEFOTkVMU19GT1JNQVRbZmxhZ3MuZm9ybWF0XSkge1xuICAgICAgICBmbGFncy5mb3JtYXQgPSBmbGFncy5pbnRlcm5hbGZvcm1hdCA9IENIQU5ORUxTX0ZPUk1BVFtmbGFncy5jaGFubmVsc11cbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGhhc0Zvcm1hdCAmJiBoYXNDaGFubmVscykge1xuICAgICAgXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc2V0RmxhZ3MgKGZsYWdzKSB7XG4gICAgZ2wucGl4ZWxTdG9yZWkoR0xfVU5QQUNLX0ZMSVBfWV9XRUJHTCwgZmxhZ3MuZmxpcFkpXG4gICAgZ2wucGl4ZWxTdG9yZWkoR0xfVU5QQUNLX1BSRU1VTFRJUExZX0FMUEhBX1dFQkdMLCBmbGFncy5wcmVtdWx0aXBseUFscGhhKVxuICAgIGdsLnBpeGVsU3RvcmVpKEdMX1VOUEFDS19DT0xPUlNQQUNFX0NPTlZFUlNJT05fV0VCR0wsIGZsYWdzLmNvbG9yU3BhY2UpXG4gICAgZ2wucGl4ZWxTdG9yZWkoR0xfVU5QQUNLX0FMSUdOTUVOVCwgZmxhZ3MudW5wYWNrQWxpZ25tZW50KVxuICB9XG5cbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAvLyBUZXggaW1hZ2UgZGF0YVxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIGZ1bmN0aW9uIFRleEltYWdlICgpIHtcbiAgICBUZXhGbGFncy5jYWxsKHRoaXMpXG5cbiAgICB0aGlzLnhPZmZzZXQgPSAwXG4gICAgdGhpcy55T2Zmc2V0ID0gMFxuXG4gICAgLy8gZGF0YVxuICAgIHRoaXMuZGF0YSA9IG51bGxcbiAgICB0aGlzLm5lZWRzRnJlZSA9IGZhbHNlXG5cbiAgICAvLyBodG1sIGVsZW1lbnRcbiAgICB0aGlzLmVsZW1lbnQgPSBudWxsXG5cbiAgICAvLyBjb3B5VGV4SW1hZ2UgaW5mb1xuICAgIHRoaXMubmVlZHNDb3B5ID0gZmFsc2VcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlSW1hZ2UgKGltYWdlLCBvcHRpb25zKSB7XG4gICAgdmFyIGRhdGEgPSBudWxsXG4gICAgaWYgKGlzUGl4ZWxEYXRhKG9wdGlvbnMpKSB7XG4gICAgICBkYXRhID0gb3B0aW9uc1xuICAgIH0gZWxzZSBpZiAob3B0aW9ucykge1xuICAgICAgXG4gICAgICBwYXJzZUZsYWdzKGltYWdlLCBvcHRpb25zKVxuICAgICAgaWYgKCd4JyBpbiBvcHRpb25zKSB7XG4gICAgICAgIGltYWdlLnhPZmZzZXQgPSBvcHRpb25zLnggfCAwXG4gICAgICB9XG4gICAgICBpZiAoJ3knIGluIG9wdGlvbnMpIHtcbiAgICAgICAgaW1hZ2UueU9mZnNldCA9IG9wdGlvbnMueSB8IDBcbiAgICAgIH1cbiAgICAgIGlmIChpc1BpeGVsRGF0YShvcHRpb25zLmRhdGEpKSB7XG4gICAgICAgIGRhdGEgPSBvcHRpb25zLmRhdGFcbiAgICAgIH1cbiAgICB9XG5cbiAgICBcblxuICAgIGlmIChvcHRpb25zLmNvcHkpIHtcbiAgICAgIFxuICAgICAgdmFyIHZpZXdXID0gY29udGV4dFN0YXRlLnZpZXdwb3J0V2lkdGhcbiAgICAgIHZhciB2aWV3SCA9IGNvbnRleHRTdGF0ZS52aWV3cG9ydEhlaWdodFxuICAgICAgaW1hZ2Uud2lkdGggPSBpbWFnZS53aWR0aCB8fCAodmlld1cgLSBpbWFnZS54T2Zmc2V0KVxuICAgICAgaW1hZ2UuaGVpZ2h0ID0gaW1hZ2UuaGVpZ2h0IHx8ICh2aWV3SCAtIGltYWdlLnlPZmZzZXQpXG4gICAgICBpbWFnZS5uZWVkc0NvcHkgPSB0cnVlXG4gICAgICBcbiAgICB9IGVsc2UgaWYgKCFkYXRhKSB7XG4gICAgICBpbWFnZS53aWR0aCA9IGltYWdlLndpZHRoIHx8IDFcbiAgICAgIGltYWdlLmhlaWdodCA9IGltYWdlLmhlaWdodCB8fCAxXG4gICAgICBpbWFnZS5jaGFubmVscyA9IGltYWdlLmNoYW5uZWxzIHx8IDRcbiAgICB9IGVsc2UgaWYgKGlzVHlwZWRBcnJheShkYXRhKSkge1xuICAgICAgaW1hZ2UuY2hhbm5lbHMgPSBpbWFnZS5jaGFubmVscyB8fCA0XG4gICAgICBpbWFnZS5kYXRhID0gZGF0YVxuICAgICAgaWYgKCEoJ3R5cGUnIGluIG9wdGlvbnMpICYmIGltYWdlLnR5cGUgPT09IEdMX1VOU0lHTkVEX0JZVEUpIHtcbiAgICAgICAgaW1hZ2UudHlwZSA9IHR5cGVkQXJyYXlDb2RlKGRhdGEpXG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChpc051bWVyaWNBcnJheShkYXRhKSkge1xuICAgICAgaW1hZ2UuY2hhbm5lbHMgPSBpbWFnZS5jaGFubmVscyB8fCA0XG4gICAgICBjb252ZXJ0RGF0YShpbWFnZSwgZGF0YSlcbiAgICAgIGltYWdlLmFsaWdubWVudCA9IDFcbiAgICAgIGltYWdlLm5lZWRzRnJlZSA9IHRydWVcbiAgICB9IGVsc2UgaWYgKGlzTkRBcnJheUxpa2UoZGF0YSkpIHtcbiAgICAgIHZhciBhcnJheSA9IGRhdGEuZGF0YVxuICAgICAgaWYgKCFBcnJheS5pc0FycmF5KGFycmF5KSAmJiBpbWFnZS50eXBlID09PSBHTF9VTlNJR05FRF9CWVRFKSB7XG4gICAgICAgIGltYWdlLnR5cGUgPSB0eXBlZEFycmF5Q29kZShhcnJheSlcbiAgICAgIH1cbiAgICAgIHZhciBzaGFwZSA9IGRhdGEuc2hhcGVcbiAgICAgIHZhciBzdHJpZGUgPSBkYXRhLnN0cmlkZVxuICAgICAgdmFyIHNoYXBlWCwgc2hhcGVZLCBzaGFwZUMsIHN0cmlkZVgsIHN0cmlkZVksIHN0cmlkZUNcbiAgICAgIGlmIChzaGFwZS5sZW5ndGggPT09IDMpIHtcbiAgICAgICAgc2hhcGVDID0gc2hhcGVbMl1cbiAgICAgICAgc3RyaWRlQyA9IHN0cmlkZVsyXVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgXG4gICAgICAgIHNoYXBlQyA9IDFcbiAgICAgICAgc3RyaWRlQyA9IDFcbiAgICAgIH1cbiAgICAgIHNoYXBlWCA9IHNoYXBlWzBdXG4gICAgICBzaGFwZVkgPSBzaGFwZVsxXVxuICAgICAgc3RyaWRlWCA9IHN0cmlkZVswXVxuICAgICAgc3RyaWRlWSA9IHN0cmlkZVsxXVxuICAgICAgaW1hZ2UuYWxpZ25tZW50ID0gMVxuICAgICAgaW1hZ2Uud2lkdGggPSBzaGFwZVhcbiAgICAgIGltYWdlLmhlaWdodCA9IHNoYXBlWVxuICAgICAgaW1hZ2UuY2hhbm5lbHMgPSBzaGFwZUNcbiAgICAgIGltYWdlLmZvcm1hdCA9IGltYWdlLmludGVybmFsZm9ybWF0ID0gQ0hBTk5FTFNfRk9STUFUW3NoYXBlQ11cbiAgICAgIGltYWdlLm5lZWRzRnJlZSA9IHRydWVcbiAgICAgIHRyYW5zcG9zZURhdGEoaW1hZ2UsIGFycmF5LCBzdHJpZGVYLCBzdHJpZGVZLCBzdHJpZGVDLCBkYXRhLm9mZnNldClcbiAgICB9IGVsc2UgaWYgKGlzQ2FudmFzRWxlbWVudChkYXRhKSB8fCBpc0NvbnRleHQyRChkYXRhKSkge1xuICAgICAgaWYgKGlzQ2FudmFzRWxlbWVudChkYXRhKSkge1xuICAgICAgICBpbWFnZS5lbGVtZW50ID0gZGF0YVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaW1hZ2UuZWxlbWVudCA9IGRhdGEuY2FudmFzXG4gICAgICB9XG4gICAgICBpbWFnZS53aWR0aCA9IGltYWdlLmVsZW1lbnQud2lkdGhcbiAgICAgIGltYWdlLmhlaWdodCA9IGltYWdlLmVsZW1lbnQuaGVpZ2h0XG4gICAgICBpbWFnZS5jaGFubmVscyA9IDRcbiAgICB9IGVsc2UgaWYgKGlzSW1hZ2VFbGVtZW50KGRhdGEpKSB7XG4gICAgICBpbWFnZS5lbGVtZW50ID0gZGF0YVxuICAgICAgaW1hZ2Uud2lkdGggPSBkYXRhLm5hdHVyYWxXaWR0aFxuICAgICAgaW1hZ2UuaGVpZ2h0ID0gZGF0YS5uYXR1cmFsSGVpZ2h0XG4gICAgICBpbWFnZS5jaGFubmVscyA9IDRcbiAgICB9IGVsc2UgaWYgKGlzVmlkZW9FbGVtZW50KGRhdGEpKSB7XG4gICAgICBpbWFnZS5lbGVtZW50ID0gZGF0YVxuICAgICAgaW1hZ2Uud2lkdGggPSBkYXRhLnZpZGVvV2lkdGhcbiAgICAgIGltYWdlLmhlaWdodCA9IGRhdGEudmlkZW9IZWlnaHRcbiAgICAgIGltYWdlLmNoYW5uZWxzID0gNFxuICAgIH0gZWxzZSBpZiAoaXNSZWN0QXJyYXkoZGF0YSkpIHtcbiAgICAgIHZhciB3ID0gaW1hZ2Uud2lkdGggfHwgZGF0YVswXS5sZW5ndGhcbiAgICAgIHZhciBoID0gaW1hZ2UuaGVpZ2h0IHx8IGRhdGEubGVuZ3RoXG4gICAgICB2YXIgYyA9IGltYWdlLmNoYW5uZWxzXG4gICAgICBpZiAoaXNBcnJheUxpa2UoZGF0YVswXVswXSkpIHtcbiAgICAgICAgYyA9IGMgfHwgZGF0YVswXVswXS5sZW5ndGhcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGMgPSBjIHx8IDFcbiAgICAgIH1cbiAgICAgIHZhciBhcnJheVNoYXBlID0gZmxhdHRlblV0aWxzLnNoYXBlKGRhdGEpXG4gICAgICB2YXIgbiA9IDFcbiAgICAgIGZvciAodmFyIGRkID0gMDsgZGQgPCBhcnJheVNoYXBlLmxlbmd0aDsgKytkZCkge1xuICAgICAgICBuICo9IGFycmF5U2hhcGVbZGRdXG4gICAgICB9XG4gICAgICB2YXIgYWxsb2NEYXRhID0gcHJlQ29udmVydChpbWFnZSwgbilcbiAgICAgIGZsYXR0ZW5VdGlscy5mbGF0dGVuKGRhdGEsIGFycmF5U2hhcGUsICcnLCBhbGxvY0RhdGEpXG4gICAgICBwb3N0Q29udmVydChpbWFnZSwgYWxsb2NEYXRhKVxuICAgICAgaW1hZ2UuYWxpZ25tZW50ID0gMVxuICAgICAgaW1hZ2Uud2lkdGggPSB3XG4gICAgICBpbWFnZS5oZWlnaHQgPSBoXG4gICAgICBpbWFnZS5jaGFubmVscyA9IGNcbiAgICAgIGltYWdlLmZvcm1hdCA9IGltYWdlLmludGVybmFsZm9ybWF0ID0gQ0hBTk5FTFNfRk9STUFUW2NdXG4gICAgICBpbWFnZS5uZWVkc0ZyZWUgPSB0cnVlXG4gICAgfVxuXG4gICAgaWYgKGltYWdlLnR5cGUgPT09IEdMX0ZMT0FUKSB7XG4gICAgICBcbiAgICB9IGVsc2UgaWYgKGltYWdlLnR5cGUgPT09IEdMX0hBTEZfRkxPQVRfT0VTKSB7XG4gICAgICBcbiAgICB9XG5cbiAgICAvLyBkbyBjb21wcmVzc2VkIHRleHR1cmUgIHZhbGlkYXRpb24gaGVyZS5cbiAgfVxuXG4gIGZ1bmN0aW9uIHNldEltYWdlIChpbmZvLCB0YXJnZXQsIG1pcGxldmVsKSB7XG4gICAgdmFyIGVsZW1lbnQgPSBpbmZvLmVsZW1lbnRcbiAgICB2YXIgZGF0YSA9IGluZm8uZGF0YVxuICAgIHZhciBpbnRlcm5hbGZvcm1hdCA9IGluZm8uaW50ZXJuYWxmb3JtYXRcbiAgICB2YXIgZm9ybWF0ID0gaW5mby5mb3JtYXRcbiAgICB2YXIgdHlwZSA9IGluZm8udHlwZVxuICAgIHZhciB3aWR0aCA9IGluZm8ud2lkdGhcbiAgICB2YXIgaGVpZ2h0ID0gaW5mby5oZWlnaHRcblxuICAgIHNldEZsYWdzKGluZm8pXG5cbiAgICBpZiAoZWxlbWVudCkge1xuICAgICAgZ2wudGV4SW1hZ2UyRCh0YXJnZXQsIG1pcGxldmVsLCBmb3JtYXQsIGZvcm1hdCwgdHlwZSwgZWxlbWVudClcbiAgICB9IGVsc2UgaWYgKGluZm8uY29tcHJlc3NlZCkge1xuICAgICAgZ2wuY29tcHJlc3NlZFRleEltYWdlMkQodGFyZ2V0LCBtaXBsZXZlbCwgaW50ZXJuYWxmb3JtYXQsIHdpZHRoLCBoZWlnaHQsIDAsIGRhdGEpXG4gICAgfSBlbHNlIGlmIChpbmZvLm5lZWRzQ29weSkge1xuICAgICAgcmVnbFBvbGwoKVxuICAgICAgZ2wuY29weVRleEltYWdlMkQoXG4gICAgICAgIHRhcmdldCwgbWlwbGV2ZWwsIGZvcm1hdCwgaW5mby54T2Zmc2V0LCBpbmZvLnlPZmZzZXQsIHdpZHRoLCBoZWlnaHQsIDApXG4gICAgfSBlbHNlIHtcbiAgICAgIGdsLnRleEltYWdlMkQoXG4gICAgICAgIHRhcmdldCwgbWlwbGV2ZWwsIGZvcm1hdCwgd2lkdGgsIGhlaWdodCwgMCwgZm9ybWF0LCB0eXBlLCBkYXRhKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHNldFN1YkltYWdlIChpbmZvLCB0YXJnZXQsIHgsIHksIG1pcGxldmVsKSB7XG4gICAgdmFyIGVsZW1lbnQgPSBpbmZvLmVsZW1lbnRcbiAgICB2YXIgZGF0YSA9IGluZm8uZGF0YVxuICAgIHZhciBpbnRlcm5hbGZvcm1hdCA9IGluZm8uaW50ZXJuYWxmb3JtYXRcbiAgICB2YXIgZm9ybWF0ID0gaW5mby5mb3JtYXRcbiAgICB2YXIgdHlwZSA9IGluZm8udHlwZVxuICAgIHZhciB3aWR0aCA9IGluZm8ud2lkdGhcbiAgICB2YXIgaGVpZ2h0ID0gaW5mby5oZWlnaHRcblxuICAgIHNldEZsYWdzKGluZm8pXG5cbiAgICBpZiAoZWxlbWVudCkge1xuICAgICAgZ2wudGV4U3ViSW1hZ2UyRChcbiAgICAgICAgdGFyZ2V0LCBtaXBsZXZlbCwgeCwgeSwgZm9ybWF0LCB0eXBlLCBlbGVtZW50KVxuICAgIH0gZWxzZSBpZiAoaW5mby5jb21wcmVzc2VkKSB7XG4gICAgICBnbC5jb21wcmVzc2VkVGV4U3ViSW1hZ2UyRChcbiAgICAgICAgdGFyZ2V0LCBtaXBsZXZlbCwgeCwgeSwgaW50ZXJuYWxmb3JtYXQsIHdpZHRoLCBoZWlnaHQsIGRhdGEpXG4gICAgfSBlbHNlIGlmIChpbmZvLm5lZWRzQ29weSkge1xuICAgICAgcmVnbFBvbGwoKVxuICAgICAgZ2wuY29weVRleFN1YkltYWdlMkQoXG4gICAgICAgIHRhcmdldCwgbWlwbGV2ZWwsIHgsIHksIGluZm8ueE9mZnNldCwgaW5mby55T2Zmc2V0LCB3aWR0aCwgaGVpZ2h0KVxuICAgIH0gZWxzZSB7XG4gICAgICBnbC50ZXhTdWJJbWFnZTJEKFxuICAgICAgICB0YXJnZXQsIG1pcGxldmVsLCB4LCB5LCB3aWR0aCwgaGVpZ2h0LCBmb3JtYXQsIHR5cGUsIGRhdGEpXG4gICAgfVxuICB9XG5cbiAgLy8gdGV4SW1hZ2UgcG9vbFxuICB2YXIgaW1hZ2VQb29sID0gW11cblxuICBmdW5jdGlvbiBhbGxvY0ltYWdlICgpIHtcbiAgICByZXR1cm4gaW1hZ2VQb29sLnBvcCgpIHx8IG5ldyBUZXhJbWFnZSgpXG4gIH1cblxuICBmdW5jdGlvbiBmcmVlSW1hZ2UgKGltYWdlKSB7XG4gICAgaWYgKGltYWdlLm5lZWRzRnJlZSkge1xuICAgICAgcG9vbC5mcmVlVHlwZShpbWFnZS5kYXRhKVxuICAgIH1cbiAgICBUZXhJbWFnZS5jYWxsKGltYWdlKVxuICAgIGltYWdlUG9vbC5wdXNoKGltYWdlKVxuICB9XG5cbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAvLyBNaXAgbWFwXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgZnVuY3Rpb24gTWlwTWFwICgpIHtcbiAgICBUZXhGbGFncy5jYWxsKHRoaXMpXG5cbiAgICB0aGlzLmdlbk1pcG1hcHMgPSBmYWxzZVxuICAgIHRoaXMubWlwbWFwSGludCA9IEdMX0RPTlRfQ0FSRVxuICAgIHRoaXMubWlwbWFzayA9IDBcbiAgICB0aGlzLmltYWdlcyA9IEFycmF5KDE2KVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VNaXBNYXBGcm9tU2hhcGUgKG1pcG1hcCwgd2lkdGgsIGhlaWdodCkge1xuICAgIHZhciBpbWcgPSBtaXBtYXAuaW1hZ2VzWzBdID0gYWxsb2NJbWFnZSgpXG4gICAgbWlwbWFwLm1pcG1hc2sgPSAxXG4gICAgaW1nLndpZHRoID0gbWlwbWFwLndpZHRoID0gd2lkdGhcbiAgICBpbWcuaGVpZ2h0ID0gbWlwbWFwLmhlaWdodCA9IGhlaWdodFxuICAgIGltZy5jaGFubmVscyA9IG1pcG1hcC5jaGFubmVscyA9IDRcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlTWlwTWFwRnJvbU9iamVjdCAobWlwbWFwLCBvcHRpb25zKSB7XG4gICAgdmFyIGltZ0RhdGEgPSBudWxsXG4gICAgaWYgKGlzUGl4ZWxEYXRhKG9wdGlvbnMpKSB7XG4gICAgICBpbWdEYXRhID0gbWlwbWFwLmltYWdlc1swXSA9IGFsbG9jSW1hZ2UoKVxuICAgICAgY29weUZsYWdzKGltZ0RhdGEsIG1pcG1hcClcbiAgICAgIHBhcnNlSW1hZ2UoaW1nRGF0YSwgb3B0aW9ucylcbiAgICAgIG1pcG1hcC5taXBtYXNrID0gMVxuICAgIH0gZWxzZSB7XG4gICAgICBwYXJzZUZsYWdzKG1pcG1hcCwgb3B0aW9ucylcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KG9wdGlvbnMubWlwbWFwKSkge1xuICAgICAgICB2YXIgbWlwRGF0YSA9IG9wdGlvbnMubWlwbWFwXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbWlwRGF0YS5sZW5ndGg7ICsraSkge1xuICAgICAgICAgIGltZ0RhdGEgPSBtaXBtYXAuaW1hZ2VzW2ldID0gYWxsb2NJbWFnZSgpXG4gICAgICAgICAgY29weUZsYWdzKGltZ0RhdGEsIG1pcG1hcClcbiAgICAgICAgICBpbWdEYXRhLndpZHRoID4+PSBpXG4gICAgICAgICAgaW1nRGF0YS5oZWlnaHQgPj49IGlcbiAgICAgICAgICBwYXJzZUltYWdlKGltZ0RhdGEsIG1pcERhdGFbaV0pXG4gICAgICAgICAgbWlwbWFwLm1pcG1hc2sgfD0gKDEgPDwgaSlcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaW1nRGF0YSA9IG1pcG1hcC5pbWFnZXNbMF0gPSBhbGxvY0ltYWdlKClcbiAgICAgICAgY29weUZsYWdzKGltZ0RhdGEsIG1pcG1hcClcbiAgICAgICAgcGFyc2VJbWFnZShpbWdEYXRhLCBvcHRpb25zKVxuICAgICAgICBtaXBtYXAubWlwbWFzayA9IDFcbiAgICAgIH1cbiAgICB9XG4gICAgY29weUZsYWdzKG1pcG1hcCwgbWlwbWFwLmltYWdlc1swXSlcblxuICAgIC8vIEZvciB0ZXh0dXJlcyBvZiB0aGUgY29tcHJlc3NlZCBmb3JtYXQgV0VCR0xfY29tcHJlc3NlZF90ZXh0dXJlX3MzdGNcbiAgICAvLyB3ZSBtdXN0IGhhdmUgdGhhdFxuICAgIC8vXG4gICAgLy8gXCJXaGVuIGxldmVsIGVxdWFscyB6ZXJvIHdpZHRoIGFuZCBoZWlnaHQgbXVzdCBiZSBhIG11bHRpcGxlIG9mIDQuXG4gICAgLy8gV2hlbiBsZXZlbCBpcyBncmVhdGVyIHRoYW4gMCB3aWR0aCBhbmQgaGVpZ2h0IG11c3QgYmUgMCwgMSwgMiBvciBhIG11bHRpcGxlIG9mIDQuIFwiXG4gICAgLy9cbiAgICAvLyBidXQgd2UgZG8gbm90IHlldCBzdXBwb3J0IGhhdmluZyBtdWx0aXBsZSBtaXBtYXAgbGV2ZWxzIGZvciBjb21wcmVzc2VkIHRleHR1cmVzLFxuICAgIC8vIHNvIHdlIG9ubHkgdGVzdCBmb3IgbGV2ZWwgemVyby5cblxuICAgIGlmIChtaXBtYXAuY29tcHJlc3NlZCAmJlxuICAgICAgICAobWlwbWFwLmludGVybmFsZm9ybWF0ID09PSBHTF9DT01QUkVTU0VEX1JHQl9TM1RDX0RYVDFfRVhUKSB8fFxuICAgICAgICAobWlwbWFwLmludGVybmFsZm9ybWF0ID09PSBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQxX0VYVCkgfHxcbiAgICAgICAgKG1pcG1hcC5pbnRlcm5hbGZvcm1hdCA9PT0gR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUM19FWFQpIHx8XG4gICAgICAgIChtaXBtYXAuaW50ZXJuYWxmb3JtYXQgPT09IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDVfRVhUKSkge1xuICAgICAgXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc2V0TWlwTWFwIChtaXBtYXAsIHRhcmdldCkge1xuICAgIHZhciBpbWFnZXMgPSBtaXBtYXAuaW1hZ2VzXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBpbWFnZXMubGVuZ3RoOyArK2kpIHtcbiAgICAgIGlmICghaW1hZ2VzW2ldKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgc2V0SW1hZ2UoaW1hZ2VzW2ldLCB0YXJnZXQsIGkpXG4gICAgfVxuICB9XG5cbiAgdmFyIG1pcFBvb2wgPSBbXVxuXG4gIGZ1bmN0aW9uIGFsbG9jTWlwTWFwICgpIHtcbiAgICB2YXIgcmVzdWx0ID0gbWlwUG9vbC5wb3AoKSB8fCBuZXcgTWlwTWFwKClcbiAgICBUZXhGbGFncy5jYWxsKHJlc3VsdClcbiAgICByZXN1bHQubWlwbWFzayA9IDBcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IDE2OyArK2kpIHtcbiAgICAgIHJlc3VsdC5pbWFnZXNbaV0gPSBudWxsXG4gICAgfVxuICAgIHJldHVybiByZXN1bHRcbiAgfVxuXG4gIGZ1bmN0aW9uIGZyZWVNaXBNYXAgKG1pcG1hcCkge1xuICAgIHZhciBpbWFnZXMgPSBtaXBtYXAuaW1hZ2VzXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBpbWFnZXMubGVuZ3RoOyArK2kpIHtcbiAgICAgIGlmIChpbWFnZXNbaV0pIHtcbiAgICAgICAgZnJlZUltYWdlKGltYWdlc1tpXSlcbiAgICAgIH1cbiAgICAgIGltYWdlc1tpXSA9IG51bGxcbiAgICB9XG4gICAgbWlwUG9vbC5wdXNoKG1pcG1hcClcbiAgfVxuXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gVGV4IGluZm9cbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICBmdW5jdGlvbiBUZXhJbmZvICgpIHtcbiAgICB0aGlzLm1pbkZpbHRlciA9IEdMX05FQVJFU1RcbiAgICB0aGlzLm1hZ0ZpbHRlciA9IEdMX05FQVJFU1RcblxuICAgIHRoaXMud3JhcFMgPSBHTF9DTEFNUF9UT19FREdFXG4gICAgdGhpcy53cmFwVCA9IEdMX0NMQU1QX1RPX0VER0VcblxuICAgIHRoaXMuYW5pc290cm9waWMgPSAxXG5cbiAgICB0aGlzLmdlbk1pcG1hcHMgPSBmYWxzZVxuICAgIHRoaXMubWlwbWFwSGludCA9IEdMX0RPTlRfQ0FSRVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VUZXhJbmZvIChpbmZvLCBvcHRpb25zKSB7XG4gICAgaWYgKCdtaW4nIGluIG9wdGlvbnMpIHtcbiAgICAgIHZhciBtaW5GaWx0ZXIgPSBvcHRpb25zLm1pblxuICAgICAgXG4gICAgICBpbmZvLm1pbkZpbHRlciA9IG1pbkZpbHRlcnNbbWluRmlsdGVyXVxuICAgICAgaWYgKE1JUE1BUF9GSUxURVJTLmluZGV4T2YoaW5mby5taW5GaWx0ZXIpID49IDApIHtcbiAgICAgICAgaW5mby5nZW5NaXBtYXBzID0gdHJ1ZVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmICgnbWFnJyBpbiBvcHRpb25zKSB7XG4gICAgICB2YXIgbWFnRmlsdGVyID0gb3B0aW9ucy5tYWdcbiAgICAgIFxuICAgICAgaW5mby5tYWdGaWx0ZXIgPSBtYWdGaWx0ZXJzW21hZ0ZpbHRlcl1cbiAgICB9XG5cbiAgICB2YXIgd3JhcFMgPSBpbmZvLndyYXBTXG4gICAgdmFyIHdyYXBUID0gaW5mby53cmFwVFxuICAgIGlmICgnd3JhcCcgaW4gb3B0aW9ucykge1xuICAgICAgdmFyIHdyYXAgPSBvcHRpb25zLndyYXBcbiAgICAgIGlmICh0eXBlb2Ygd3JhcCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgXG4gICAgICAgIHdyYXBTID0gd3JhcFQgPSB3cmFwTW9kZXNbd3JhcF1cbiAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheSh3cmFwKSkge1xuICAgICAgICBcbiAgICAgICAgXG4gICAgICAgIHdyYXBTID0gd3JhcE1vZGVzW3dyYXBbMF1dXG4gICAgICAgIHdyYXBUID0gd3JhcE1vZGVzW3dyYXBbMV1dXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmICgnd3JhcFMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIG9wdFdyYXBTID0gb3B0aW9ucy53cmFwU1xuICAgICAgICBcbiAgICAgICAgd3JhcFMgPSB3cmFwTW9kZXNbb3B0V3JhcFNdXG4gICAgICB9XG4gICAgICBpZiAoJ3dyYXBUJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBvcHRXcmFwVCA9IG9wdGlvbnMud3JhcFRcbiAgICAgICAgXG4gICAgICAgIHdyYXBUID0gd3JhcE1vZGVzW29wdFdyYXBUXVxuICAgICAgfVxuICAgIH1cbiAgICBpbmZvLndyYXBTID0gd3JhcFNcbiAgICBpbmZvLndyYXBUID0gd3JhcFRcblxuICAgIGlmICgnYW5pc290cm9waWMnIGluIG9wdGlvbnMpIHtcbiAgICAgIHZhciBhbmlzb3Ryb3BpYyA9IG9wdGlvbnMuYW5pc290cm9waWNcbiAgICAgIFxuICAgICAgaW5mby5hbmlzb3Ryb3BpYyA9IG9wdGlvbnMuYW5pc290cm9waWNcbiAgICB9XG5cbiAgICBpZiAoJ21pcG1hcCcgaW4gb3B0aW9ucykge1xuICAgICAgdmFyIGhhc01pcE1hcCA9IGZhbHNlXG4gICAgICBzd2l0Y2ggKHR5cGVvZiBvcHRpb25zLm1pcG1hcCkge1xuICAgICAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgICAgIFxuICAgICAgICAgIGluZm8ubWlwbWFwSGludCA9IG1pcG1hcEhpbnRbb3B0aW9ucy5taXBtYXBdXG4gICAgICAgICAgaW5mby5nZW5NaXBtYXBzID0gdHJ1ZVxuICAgICAgICAgIGhhc01pcE1hcCA9IHRydWVcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgICAgIGhhc01pcE1hcCA9IGluZm8uZ2VuTWlwbWFwcyA9IG9wdGlvbnMubWlwbWFwXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdvYmplY3QnOlxuICAgICAgICAgIFxuICAgICAgICAgIGluZm8uZ2VuTWlwbWFwcyA9IGZhbHNlXG4gICAgICAgICAgaGFzTWlwTWFwID0gdHJ1ZVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICBcbiAgICAgIH1cbiAgICAgIGlmIChoYXNNaXBNYXAgJiYgISgnbWluJyBpbiBvcHRpb25zKSkge1xuICAgICAgICBpbmZvLm1pbkZpbHRlciA9IEdMX05FQVJFU1RfTUlQTUFQX05FQVJFU1RcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzZXRUZXhJbmZvIChpbmZvLCB0YXJnZXQpIHtcbiAgICBnbC50ZXhQYXJhbWV0ZXJpKHRhcmdldCwgR0xfVEVYVFVSRV9NSU5fRklMVEVSLCBpbmZvLm1pbkZpbHRlcilcbiAgICBnbC50ZXhQYXJhbWV0ZXJpKHRhcmdldCwgR0xfVEVYVFVSRV9NQUdfRklMVEVSLCBpbmZvLm1hZ0ZpbHRlcilcbiAgICBnbC50ZXhQYXJhbWV0ZXJpKHRhcmdldCwgR0xfVEVYVFVSRV9XUkFQX1MsIGluZm8ud3JhcFMpXG4gICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfV1JBUF9ULCBpbmZvLndyYXBUKVxuICAgIGlmIChleHRlbnNpb25zLmV4dF90ZXh0dXJlX2ZpbHRlcl9hbmlzb3Ryb3BpYykge1xuICAgICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfTUFYX0FOSVNPVFJPUFlfRVhULCBpbmZvLmFuaXNvdHJvcGljKVxuICAgIH1cbiAgICBpZiAoaW5mby5nZW5NaXBtYXBzKSB7XG4gICAgICBnbC5oaW50KEdMX0dFTkVSQVRFX01JUE1BUF9ISU5ULCBpbmZvLm1pcG1hcEhpbnQpXG4gICAgICBnbC5nZW5lcmF0ZU1pcG1hcCh0YXJnZXQpXG4gICAgfVxuICB9XG5cbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAvLyBGdWxsIHRleHR1cmUgb2JqZWN0XG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgdmFyIHRleHR1cmVDb3VudCA9IDBcbiAgdmFyIHRleHR1cmVTZXQgPSB7fVxuICB2YXIgbnVtVGV4VW5pdHMgPSBsaW1pdHMubWF4VGV4dHVyZVVuaXRzXG4gIHZhciB0ZXh0dXJlVW5pdHMgPSBBcnJheShudW1UZXhVbml0cykubWFwKGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gbnVsbFxuICB9KVxuXG4gIGZ1bmN0aW9uIFJFR0xUZXh0dXJlICh0YXJnZXQpIHtcbiAgICBUZXhGbGFncy5jYWxsKHRoaXMpXG4gICAgdGhpcy5taXBtYXNrID0gMFxuICAgIHRoaXMuaW50ZXJuYWxmb3JtYXQgPSBHTF9SR0JBXG5cbiAgICB0aGlzLmlkID0gdGV4dHVyZUNvdW50KytcblxuICAgIHRoaXMucmVmQ291bnQgPSAxXG5cbiAgICB0aGlzLnRhcmdldCA9IHRhcmdldFxuICAgIHRoaXMudGV4dHVyZSA9IGdsLmNyZWF0ZVRleHR1cmUoKVxuXG4gICAgdGhpcy51bml0ID0gLTFcbiAgICB0aGlzLmJpbmRDb3VudCA9IDBcblxuICAgIHRoaXMudGV4SW5mbyA9IG5ldyBUZXhJbmZvKClcblxuICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgdGhpcy5zdGF0cyA9IHtzaXplOiAwfVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHRlbXBCaW5kICh0ZXh0dXJlKSB7XG4gICAgZ2wuYWN0aXZlVGV4dHVyZShHTF9URVhUVVJFMClcbiAgICBnbC5iaW5kVGV4dHVyZSh0ZXh0dXJlLnRhcmdldCwgdGV4dHVyZS50ZXh0dXJlKVxuICB9XG5cbiAgZnVuY3Rpb24gdGVtcFJlc3RvcmUgKCkge1xuICAgIHZhciBwcmV2ID0gdGV4dHVyZVVuaXRzWzBdXG4gICAgaWYgKHByZXYpIHtcbiAgICAgIGdsLmJpbmRUZXh0dXJlKHByZXYudGFyZ2V0LCBwcmV2LnRleHR1cmUpXG4gICAgfSBlbHNlIHtcbiAgICAgIGdsLmJpbmRUZXh0dXJlKEdMX1RFWFRVUkVfMkQsIG51bGwpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSAodGV4dHVyZSkge1xuICAgIHZhciBoYW5kbGUgPSB0ZXh0dXJlLnRleHR1cmVcbiAgICBcbiAgICB2YXIgdW5pdCA9IHRleHR1cmUudW5pdFxuICAgIHZhciB0YXJnZXQgPSB0ZXh0dXJlLnRhcmdldFxuICAgIGlmICh1bml0ID49IDApIHtcbiAgICAgIGdsLmFjdGl2ZVRleHR1cmUoR0xfVEVYVFVSRTAgKyB1bml0KVxuICAgICAgZ2wuYmluZFRleHR1cmUodGFyZ2V0LCBudWxsKVxuICAgICAgdGV4dHVyZVVuaXRzW3VuaXRdID0gbnVsbFxuICAgIH1cbiAgICBnbC5kZWxldGVUZXh0dXJlKGhhbmRsZSlcbiAgICB0ZXh0dXJlLnRleHR1cmUgPSBudWxsXG4gICAgdGV4dHVyZS5wYXJhbXMgPSBudWxsXG4gICAgdGV4dHVyZS5waXhlbHMgPSBudWxsXG4gICAgdGV4dHVyZS5yZWZDb3VudCA9IDBcbiAgICBkZWxldGUgdGV4dHVyZVNldFt0ZXh0dXJlLmlkXVxuICAgIHN0YXRzLnRleHR1cmVDb3VudC0tXG4gIH1cblxuICBleHRlbmQoUkVHTFRleHR1cmUucHJvdG90eXBlLCB7XG4gICAgYmluZDogZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIHRleHR1cmUgPSB0aGlzXG4gICAgICB0ZXh0dXJlLmJpbmRDb3VudCArPSAxXG4gICAgICB2YXIgdW5pdCA9IHRleHR1cmUudW5pdFxuICAgICAgaWYgKHVuaXQgPCAwKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbnVtVGV4VW5pdHM7ICsraSkge1xuICAgICAgICAgIHZhciBvdGhlciA9IHRleHR1cmVVbml0c1tpXVxuICAgICAgICAgIGlmIChvdGhlcikge1xuICAgICAgICAgICAgaWYgKG90aGVyLmJpbmRDb3VudCA+IDApIHtcbiAgICAgICAgICAgICAgY29udGludWVcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG90aGVyLnVuaXQgPSAtMVxuICAgICAgICAgIH1cbiAgICAgICAgICB0ZXh0dXJlVW5pdHNbaV0gPSB0ZXh0dXJlXG4gICAgICAgICAgdW5pdCA9IGlcbiAgICAgICAgICBicmVha1xuICAgICAgICB9XG4gICAgICAgIGlmICh1bml0ID49IG51bVRleFVuaXRzKSB7XG4gICAgICAgICAgXG4gICAgICAgIH1cbiAgICAgICAgaWYgKGNvbmZpZy5wcm9maWxlICYmIHN0YXRzLm1heFRleHR1cmVVbml0cyA8ICh1bml0ICsgMSkpIHtcbiAgICAgICAgICBzdGF0cy5tYXhUZXh0dXJlVW5pdHMgPSB1bml0ICsgMSAvLyArMSwgc2luY2UgdGhlIHVuaXRzIGFyZSB6ZXJvLWJhc2VkXG4gICAgICAgIH1cbiAgICAgICAgdGV4dHVyZS51bml0ID0gdW5pdFxuICAgICAgICBnbC5hY3RpdmVUZXh0dXJlKEdMX1RFWFRVUkUwICsgdW5pdClcbiAgICAgICAgZ2wuYmluZFRleHR1cmUodGV4dHVyZS50YXJnZXQsIHRleHR1cmUudGV4dHVyZSlcbiAgICAgIH1cbiAgICAgIHJldHVybiB1bml0XG4gICAgfSxcblxuICAgIHVuYmluZDogZnVuY3Rpb24gKCkge1xuICAgICAgdGhpcy5iaW5kQ291bnQgLT0gMVxuICAgIH0sXG5cbiAgICBkZWNSZWY6IGZ1bmN0aW9uICgpIHtcbiAgICAgIGlmICgtLXRoaXMucmVmQ291bnQgPD0gMCkge1xuICAgICAgICBkZXN0cm95KHRoaXMpXG4gICAgICB9XG4gICAgfVxuICB9KVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZVRleHR1cmUyRCAoYSwgYikge1xuICAgIHZhciB0ZXh0dXJlID0gbmV3IFJFR0xUZXh0dXJlKEdMX1RFWFRVUkVfMkQpXG4gICAgdGV4dHVyZVNldFt0ZXh0dXJlLmlkXSA9IHRleHR1cmVcbiAgICBzdGF0cy50ZXh0dXJlQ291bnQrK1xuXG4gICAgZnVuY3Rpb24gcmVnbFRleHR1cmUyRCAoYSwgYikge1xuICAgICAgdmFyIHRleEluZm8gPSB0ZXh0dXJlLnRleEluZm9cbiAgICAgIFRleEluZm8uY2FsbCh0ZXhJbmZvKVxuICAgICAgdmFyIG1pcERhdGEgPSBhbGxvY01pcE1hcCgpXG5cbiAgICAgIGlmICh0eXBlb2YgYSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBiID09PSAnbnVtYmVyJykge1xuICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbVNoYXBlKG1pcERhdGEsIGEgfCAwLCBiIHwgMClcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwYXJzZU1pcE1hcEZyb21TaGFwZShtaXBEYXRhLCBhIHwgMCwgYSB8IDApXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoYSkge1xuICAgICAgICBcbiAgICAgICAgcGFyc2VUZXhJbmZvKHRleEluZm8sIGEpXG4gICAgICAgIHBhcnNlTWlwTWFwRnJvbU9iamVjdChtaXBEYXRhLCBhKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gZW1wdHkgdGV4dHVyZXMgZ2V0IGFzc2lnbmVkIGEgZGVmYXVsdCBzaGFwZSBvZiAxeDFcbiAgICAgICAgcGFyc2VNaXBNYXBGcm9tU2hhcGUobWlwRGF0YSwgMSwgMSlcbiAgICAgIH1cblxuICAgICAgaWYgKHRleEluZm8uZ2VuTWlwbWFwcykge1xuICAgICAgICBtaXBEYXRhLm1pcG1hc2sgPSAobWlwRGF0YS53aWR0aCA8PCAxKSAtIDFcbiAgICAgIH1cbiAgICAgIHRleHR1cmUubWlwbWFzayA9IG1pcERhdGEubWlwbWFza1xuXG4gICAgICBjb3B5RmxhZ3ModGV4dHVyZSwgbWlwRGF0YSlcblxuICAgICAgXG4gICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0ID0gbWlwRGF0YS5pbnRlcm5hbGZvcm1hdFxuXG4gICAgICByZWdsVGV4dHVyZTJELndpZHRoID0gbWlwRGF0YS53aWR0aFxuICAgICAgcmVnbFRleHR1cmUyRC5oZWlnaHQgPSBtaXBEYXRhLmhlaWdodFxuXG4gICAgICB0ZW1wQmluZCh0ZXh0dXJlKVxuICAgICAgc2V0TWlwTWFwKG1pcERhdGEsIEdMX1RFWFRVUkVfMkQpXG4gICAgICBzZXRUZXhJbmZvKHRleEluZm8sIEdMX1RFWFRVUkVfMkQpXG4gICAgICB0ZW1wUmVzdG9yZSgpXG5cbiAgICAgIGZyZWVNaXBNYXAobWlwRGF0YSlcblxuICAgICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICAgIHRleHR1cmUuc3RhdHMuc2l6ZSA9IGdldFRleHR1cmVTaXplKFxuICAgICAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQsXG4gICAgICAgICAgdGV4dHVyZS50eXBlLFxuICAgICAgICAgIG1pcERhdGEud2lkdGgsXG4gICAgICAgICAgbWlwRGF0YS5oZWlnaHQsXG4gICAgICAgICAgdGV4SW5mby5nZW5NaXBtYXBzLFxuICAgICAgICAgIGZhbHNlKVxuICAgICAgfVxuICAgICAgcmVnbFRleHR1cmUyRC5mb3JtYXQgPSB0ZXh0dXJlRm9ybWF0c0ludmVydFt0ZXh0dXJlLmludGVybmFsZm9ybWF0XVxuICAgICAgcmVnbFRleHR1cmUyRC50eXBlID0gdGV4dHVyZVR5cGVzSW52ZXJ0W3RleHR1cmUudHlwZV1cblxuICAgICAgcmVnbFRleHR1cmUyRC5tYWcgPSBtYWdGaWx0ZXJzSW52ZXJ0W3RleEluZm8ubWFnRmlsdGVyXVxuICAgICAgcmVnbFRleHR1cmUyRC5taW4gPSBtaW5GaWx0ZXJzSW52ZXJ0W3RleEluZm8ubWluRmlsdGVyXVxuXG4gICAgICByZWdsVGV4dHVyZTJELndyYXBTID0gd3JhcE1vZGVzSW52ZXJ0W3RleEluZm8ud3JhcFNdXG4gICAgICByZWdsVGV4dHVyZTJELndyYXBUID0gd3JhcE1vZGVzSW52ZXJ0W3RleEluZm8ud3JhcFRdXG5cbiAgICAgIHJldHVybiByZWdsVGV4dHVyZTJEXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc3ViaW1hZ2UgKGltYWdlLCB4XywgeV8sIGxldmVsXykge1xuICAgICAgXG5cbiAgICAgIHZhciB4ID0geF8gfCAwXG4gICAgICB2YXIgeSA9IHlfIHwgMFxuICAgICAgdmFyIGxldmVsID0gbGV2ZWxfIHwgMFxuXG4gICAgICB2YXIgaW1hZ2VEYXRhID0gYWxsb2NJbWFnZSgpXG4gICAgICBjb3B5RmxhZ3MoaW1hZ2VEYXRhLCB0ZXh0dXJlKVxuICAgICAgaW1hZ2VEYXRhLndpZHRoID0gMFxuICAgICAgaW1hZ2VEYXRhLmhlaWdodCA9IDBcbiAgICAgIHBhcnNlSW1hZ2UoaW1hZ2VEYXRhLCBpbWFnZSlcbiAgICAgIGltYWdlRGF0YS53aWR0aCA9IGltYWdlRGF0YS53aWR0aCB8fCAoKHRleHR1cmUud2lkdGggPj4gbGV2ZWwpIC0geClcbiAgICAgIGltYWdlRGF0YS5oZWlnaHQgPSBpbWFnZURhdGEuaGVpZ2h0IHx8ICgodGV4dHVyZS5oZWlnaHQgPj4gbGV2ZWwpIC0geSlcblxuICAgICAgXG4gICAgICBcbiAgICAgIFxuICAgICAgXG5cbiAgICAgIHRlbXBCaW5kKHRleHR1cmUpXG4gICAgICBzZXRTdWJJbWFnZShpbWFnZURhdGEsIEdMX1RFWFRVUkVfMkQsIHgsIHksIGxldmVsKVxuICAgICAgdGVtcFJlc3RvcmUoKVxuXG4gICAgICBmcmVlSW1hZ2UoaW1hZ2VEYXRhKVxuXG4gICAgICByZXR1cm4gcmVnbFRleHR1cmUyRFxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlc2l6ZSAod18sIGhfKSB7XG4gICAgICB2YXIgdyA9IHdfIHwgMFxuICAgICAgdmFyIGggPSAoaF8gfCAwKSB8fCB3XG4gICAgICBpZiAodyA9PT0gdGV4dHVyZS53aWR0aCAmJiBoID09PSB0ZXh0dXJlLmhlaWdodCkge1xuICAgICAgICByZXR1cm4gcmVnbFRleHR1cmUyRFxuICAgICAgfVxuXG4gICAgICByZWdsVGV4dHVyZTJELndpZHRoID0gdGV4dHVyZS53aWR0aCA9IHdcbiAgICAgIHJlZ2xUZXh0dXJlMkQuaGVpZ2h0ID0gdGV4dHVyZS5oZWlnaHQgPSBoXG5cbiAgICAgIHRlbXBCaW5kKHRleHR1cmUpXG4gICAgICBmb3IgKHZhciBpID0gMDsgdGV4dHVyZS5taXBtYXNrID4+IGk7ICsraSkge1xuICAgICAgICBnbC50ZXhJbWFnZTJEKFxuICAgICAgICAgIEdMX1RFWFRVUkVfMkQsXG4gICAgICAgICAgaSxcbiAgICAgICAgICB0ZXh0dXJlLmZvcm1hdCxcbiAgICAgICAgICB3ID4+IGksXG4gICAgICAgICAgaCA+PiBpLFxuICAgICAgICAgIDAsXG4gICAgICAgICAgdGV4dHVyZS5mb3JtYXQsXG4gICAgICAgICAgdGV4dHVyZS50eXBlLFxuICAgICAgICAgIG51bGwpXG4gICAgICB9XG4gICAgICB0ZW1wUmVzdG9yZSgpXG5cbiAgICAgIC8vIGFsc28sIHJlY29tcHV0ZSB0aGUgdGV4dHVyZSBzaXplLlxuICAgICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICAgIHRleHR1cmUuc3RhdHMuc2l6ZSA9IGdldFRleHR1cmVTaXplKFxuICAgICAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQsXG4gICAgICAgICAgdGV4dHVyZS50eXBlLFxuICAgICAgICAgIHcsXG4gICAgICAgICAgaCxcbiAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICBmYWxzZSlcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJlZ2xUZXh0dXJlMkRcbiAgICB9XG5cbiAgICByZWdsVGV4dHVyZTJEKGEsIGIpXG5cbiAgICByZWdsVGV4dHVyZTJELnN1YmltYWdlID0gc3ViaW1hZ2VcbiAgICByZWdsVGV4dHVyZTJELnJlc2l6ZSA9IHJlc2l6ZVxuICAgIHJlZ2xUZXh0dXJlMkQuX3JlZ2xUeXBlID0gJ3RleHR1cmUyZCdcbiAgICByZWdsVGV4dHVyZTJELl90ZXh0dXJlID0gdGV4dHVyZVxuICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgcmVnbFRleHR1cmUyRC5zdGF0cyA9IHRleHR1cmUuc3RhdHNcbiAgICB9XG4gICAgcmVnbFRleHR1cmUyRC5kZXN0cm95ID0gZnVuY3Rpb24gKCkge1xuICAgICAgdGV4dHVyZS5kZWNSZWYoKVxuICAgIH1cblxuICAgIHJldHVybiByZWdsVGV4dHVyZTJEXG4gIH1cblxuICBmdW5jdGlvbiBjcmVhdGVUZXh0dXJlQ3ViZSAoYTAsIGExLCBhMiwgYTMsIGE0LCBhNSkge1xuICAgIHZhciB0ZXh0dXJlID0gbmV3IFJFR0xUZXh0dXJlKEdMX1RFWFRVUkVfQ1VCRV9NQVApXG4gICAgdGV4dHVyZVNldFt0ZXh0dXJlLmlkXSA9IHRleHR1cmVcbiAgICBzdGF0cy5jdWJlQ291bnQrK1xuXG4gICAgdmFyIGZhY2VzID0gbmV3IEFycmF5KDYpXG5cbiAgICBmdW5jdGlvbiByZWdsVGV4dHVyZUN1YmUgKGEwLCBhMSwgYTIsIGEzLCBhNCwgYTUpIHtcbiAgICAgIHZhciBpXG4gICAgICB2YXIgdGV4SW5mbyA9IHRleHR1cmUudGV4SW5mb1xuICAgICAgVGV4SW5mby5jYWxsKHRleEluZm8pXG4gICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgIGZhY2VzW2ldID0gYWxsb2NNaXBNYXAoKVxuICAgICAgfVxuXG4gICAgICBpZiAodHlwZW9mIGEwID09PSAnbnVtYmVyJyB8fCAhYTApIHtcbiAgICAgICAgdmFyIHMgPSAoYTAgfCAwKSB8fCAxXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCA2OyArK2kpIHtcbiAgICAgICAgICBwYXJzZU1pcE1hcEZyb21TaGFwZShmYWNlc1tpXSwgcywgcylcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgYTAgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIGlmIChhMSkge1xuICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbU9iamVjdChmYWNlc1swXSwgYTApXG4gICAgICAgICAgcGFyc2VNaXBNYXBGcm9tT2JqZWN0KGZhY2VzWzFdLCBhMSlcbiAgICAgICAgICBwYXJzZU1pcE1hcEZyb21PYmplY3QoZmFjZXNbMl0sIGEyKVxuICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbU9iamVjdChmYWNlc1szXSwgYTMpXG4gICAgICAgICAgcGFyc2VNaXBNYXBGcm9tT2JqZWN0KGZhY2VzWzRdLCBhNClcbiAgICAgICAgICBwYXJzZU1pcE1hcEZyb21PYmplY3QoZmFjZXNbNV0sIGE1KVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHBhcnNlVGV4SW5mbyh0ZXhJbmZvLCBhMClcbiAgICAgICAgICBwYXJzZUZsYWdzKHRleHR1cmUsIGEwKVxuICAgICAgICAgIGlmICgnZmFjZXMnIGluIGEwKSB7XG4gICAgICAgICAgICB2YXIgZmFjZV9pbnB1dCA9IGEwLmZhY2VzXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCA2OyArK2kpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIGNvcHlGbGFncyhmYWNlc1tpXSwgdGV4dHVyZSlcbiAgICAgICAgICAgICAgcGFyc2VNaXBNYXBGcm9tT2JqZWN0KGZhY2VzW2ldLCBmYWNlX2lucHV0W2ldKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbU9iamVjdChmYWNlc1tpXSwgYTApXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBcbiAgICAgIH1cblxuICAgICAgY29weUZsYWdzKHRleHR1cmUsIGZhY2VzWzBdKVxuICAgICAgaWYgKHRleEluZm8uZ2VuTWlwbWFwcykge1xuICAgICAgICB0ZXh0dXJlLm1pcG1hc2sgPSAoZmFjZXNbMF0ud2lkdGggPDwgMSkgLSAxXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0ZXh0dXJlLm1pcG1hc2sgPSBmYWNlc1swXS5taXBtYXNrXG4gICAgICB9XG5cbiAgICAgIFxuICAgICAgdGV4dHVyZS5pbnRlcm5hbGZvcm1hdCA9IGZhY2VzWzBdLmludGVybmFsZm9ybWF0XG5cbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS53aWR0aCA9IGZhY2VzWzBdLndpZHRoXG4gICAgICByZWdsVGV4dHVyZUN1YmUuaGVpZ2h0ID0gZmFjZXNbMF0uaGVpZ2h0XG5cbiAgICAgIHRlbXBCaW5kKHRleHR1cmUpXG4gICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgIHNldE1pcE1hcChmYWNlc1tpXSwgR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YICsgaSlcbiAgICAgIH1cbiAgICAgIHNldFRleEluZm8odGV4SW5mbywgR0xfVEVYVFVSRV9DVUJFX01BUClcbiAgICAgIHRlbXBSZXN0b3JlKClcblxuICAgICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICAgIHRleHR1cmUuc3RhdHMuc2l6ZSA9IGdldFRleHR1cmVTaXplKFxuICAgICAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQsXG4gICAgICAgICAgdGV4dHVyZS50eXBlLFxuICAgICAgICAgIHJlZ2xUZXh0dXJlQ3ViZS53aWR0aCxcbiAgICAgICAgICByZWdsVGV4dHVyZUN1YmUuaGVpZ2h0LFxuICAgICAgICAgIHRleEluZm8uZ2VuTWlwbWFwcyxcbiAgICAgICAgICB0cnVlKVxuICAgICAgfVxuXG4gICAgICByZWdsVGV4dHVyZUN1YmUuZm9ybWF0ID0gdGV4dHVyZUZvcm1hdHNJbnZlcnRbdGV4dHVyZS5pbnRlcm5hbGZvcm1hdF1cbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS50eXBlID0gdGV4dHVyZVR5cGVzSW52ZXJ0W3RleHR1cmUudHlwZV1cblxuICAgICAgcmVnbFRleHR1cmVDdWJlLm1hZyA9IG1hZ0ZpbHRlcnNJbnZlcnRbdGV4SW5mby5tYWdGaWx0ZXJdXG4gICAgICByZWdsVGV4dHVyZUN1YmUubWluID0gbWluRmlsdGVyc0ludmVydFt0ZXhJbmZvLm1pbkZpbHRlcl1cblxuICAgICAgcmVnbFRleHR1cmVDdWJlLndyYXBTID0gd3JhcE1vZGVzSW52ZXJ0W3RleEluZm8ud3JhcFNdXG4gICAgICByZWdsVGV4dHVyZUN1YmUud3JhcFQgPSB3cmFwTW9kZXNJbnZlcnRbdGV4SW5mby53cmFwVF1cblxuICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICBmcmVlTWlwTWFwKGZhY2VzW2ldKVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmVnbFRleHR1cmVDdWJlXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc3ViaW1hZ2UgKGZhY2UsIGltYWdlLCB4XywgeV8sIGxldmVsXykge1xuICAgICAgXG4gICAgICBcblxuICAgICAgdmFyIHggPSB4XyB8IDBcbiAgICAgIHZhciB5ID0geV8gfCAwXG4gICAgICB2YXIgbGV2ZWwgPSBsZXZlbF8gfCAwXG5cbiAgICAgIHZhciBpbWFnZURhdGEgPSBhbGxvY0ltYWdlKClcbiAgICAgIGNvcHlGbGFncyhpbWFnZURhdGEsIHRleHR1cmUpXG4gICAgICBpbWFnZURhdGEud2lkdGggPSAwXG4gICAgICBpbWFnZURhdGEuaGVpZ2h0ID0gMFxuICAgICAgcGFyc2VJbWFnZShpbWFnZURhdGEsIGltYWdlKVxuICAgICAgaW1hZ2VEYXRhLndpZHRoID0gaW1hZ2VEYXRhLndpZHRoIHx8ICgodGV4dHVyZS53aWR0aCA+PiBsZXZlbCkgLSB4KVxuICAgICAgaW1hZ2VEYXRhLmhlaWdodCA9IGltYWdlRGF0YS5oZWlnaHQgfHwgKCh0ZXh0dXJlLmhlaWdodCA+PiBsZXZlbCkgLSB5KVxuXG4gICAgICBcbiAgICAgIFxuICAgICAgXG4gICAgICBcblxuICAgICAgdGVtcEJpbmQodGV4dHVyZSlcbiAgICAgIHNldFN1YkltYWdlKGltYWdlRGF0YSwgR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YICsgZmFjZSwgeCwgeSwgbGV2ZWwpXG4gICAgICB0ZW1wUmVzdG9yZSgpXG5cbiAgICAgIGZyZWVJbWFnZShpbWFnZURhdGEpXG5cbiAgICAgIHJldHVybiByZWdsVGV4dHVyZUN1YmVcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZXNpemUgKHJhZGl1c18pIHtcbiAgICAgIHZhciByYWRpdXMgPSByYWRpdXNfIHwgMFxuICAgICAgaWYgKHJhZGl1cyA9PT0gdGV4dHVyZS53aWR0aCkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgcmVnbFRleHR1cmVDdWJlLndpZHRoID0gdGV4dHVyZS53aWR0aCA9IHJhZGl1c1xuICAgICAgcmVnbFRleHR1cmVDdWJlLmhlaWdodCA9IHRleHR1cmUuaGVpZ2h0ID0gcmFkaXVzXG5cbiAgICAgIHRlbXBCaW5kKHRleHR1cmUpXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICBmb3IgKHZhciBqID0gMDsgdGV4dHVyZS5taXBtYXNrID4+IGo7ICsraikge1xuICAgICAgICAgIGdsLnRleEltYWdlMkQoXG4gICAgICAgICAgICBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1ggKyBpLFxuICAgICAgICAgICAgaixcbiAgICAgICAgICAgIHRleHR1cmUuZm9ybWF0LFxuICAgICAgICAgICAgcmFkaXVzID4+IGosXG4gICAgICAgICAgICByYWRpdXMgPj4gaixcbiAgICAgICAgICAgIDAsXG4gICAgICAgICAgICB0ZXh0dXJlLmZvcm1hdCxcbiAgICAgICAgICAgIHRleHR1cmUudHlwZSxcbiAgICAgICAgICAgIG51bGwpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHRlbXBSZXN0b3JlKClcblxuICAgICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICAgIHRleHR1cmUuc3RhdHMuc2l6ZSA9IGdldFRleHR1cmVTaXplKFxuICAgICAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQsXG4gICAgICAgICAgdGV4dHVyZS50eXBlLFxuICAgICAgICAgIHJlZ2xUZXh0dXJlQ3ViZS53aWR0aCxcbiAgICAgICAgICByZWdsVGV4dHVyZUN1YmUuaGVpZ2h0LFxuICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgIHRydWUpXG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZWdsVGV4dHVyZUN1YmVcbiAgICB9XG5cbiAgICByZWdsVGV4dHVyZUN1YmUoYTAsIGExLCBhMiwgYTMsIGE0LCBhNSlcblxuICAgIHJlZ2xUZXh0dXJlQ3ViZS5zdWJpbWFnZSA9IHN1YmltYWdlXG4gICAgcmVnbFRleHR1cmVDdWJlLnJlc2l6ZSA9IHJlc2l6ZVxuICAgIHJlZ2xUZXh0dXJlQ3ViZS5fcmVnbFR5cGUgPSAndGV4dHVyZUN1YmUnXG4gICAgcmVnbFRleHR1cmVDdWJlLl90ZXh0dXJlID0gdGV4dHVyZVxuICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgcmVnbFRleHR1cmVDdWJlLnN0YXRzID0gdGV4dHVyZS5zdGF0c1xuICAgIH1cbiAgICByZWdsVGV4dHVyZUN1YmUuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHRleHR1cmUuZGVjUmVmKClcbiAgICB9XG5cbiAgICByZXR1cm4gcmVnbFRleHR1cmVDdWJlXG4gIH1cblxuICAvLyBDYWxsZWQgd2hlbiByZWdsIGlzIGRlc3Ryb3llZFxuICBmdW5jdGlvbiBkZXN0cm95VGV4dHVyZXMgKCkge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbnVtVGV4VW5pdHM7ICsraSkge1xuICAgICAgZ2wuYWN0aXZlVGV4dHVyZShHTF9URVhUVVJFMCArIGkpXG4gICAgICBnbC5iaW5kVGV4dHVyZShHTF9URVhUVVJFXzJELCBudWxsKVxuICAgICAgdGV4dHVyZVVuaXRzW2ldID0gbnVsbFxuICAgIH1cbiAgICB2YWx1ZXModGV4dHVyZVNldCkuZm9yRWFjaChkZXN0cm95KVxuXG4gICAgc3RhdHMuY3ViZUNvdW50ID0gMFxuICAgIHN0YXRzLnRleHR1cmVDb3VudCA9IDBcbiAgfVxuXG4gIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgIHN0YXRzLmdldFRvdGFsVGV4dHVyZVNpemUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgdG90YWwgPSAwXG4gICAgICBPYmplY3Qua2V5cyh0ZXh0dXJlU2V0KS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgdG90YWwgKz0gdGV4dHVyZVNldFtrZXldLnN0YXRzLnNpemVcbiAgICAgIH0pXG4gICAgICByZXR1cm4gdG90YWxcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiByZXN0b3JlVGV4dHVyZXMgKCkge1xuICAgIHZhbHVlcyh0ZXh0dXJlU2V0KS5mb3JFYWNoKGZ1bmN0aW9uICh0ZXh0dXJlKSB7XG4gICAgICB0ZXh0dXJlLnRleHR1cmUgPSBnbC5jcmVhdGVUZXh0dXJlKClcbiAgICAgIGdsLmJpbmRUZXh0dXJlKHRleHR1cmUudGFyZ2V0LCB0ZXh0dXJlLnRleHR1cmUpXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IDMyOyArK2kpIHtcbiAgICAgICAgaWYgKCh0ZXh0dXJlLm1pcG1hc2sgJiAoMSA8PCBpKSkgPT09IDApIHtcbiAgICAgICAgICBjb250aW51ZVxuICAgICAgICB9XG4gICAgICAgIGlmICh0ZXh0dXJlLnRhcmdldCA9PT0gR0xfVEVYVFVSRV8yRCkge1xuICAgICAgICAgIGdsLnRleEltYWdlMkQoR0xfVEVYVFVSRV8yRCxcbiAgICAgICAgICAgIGksXG4gICAgICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0LFxuICAgICAgICAgICAgdGV4dHVyZS53aWR0aCA+PiBpLFxuICAgICAgICAgICAgdGV4dHVyZS5oZWlnaHQgPj4gaSxcbiAgICAgICAgICAgIDAsXG4gICAgICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0LFxuICAgICAgICAgICAgdGV4dHVyZS50eXBlLFxuICAgICAgICAgICAgbnVsbClcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IDY7ICsraikge1xuICAgICAgICAgICAgZ2wudGV4SW1hZ2UyRChHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1ggKyBqLFxuICAgICAgICAgICAgICBpLFxuICAgICAgICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0LFxuICAgICAgICAgICAgICB0ZXh0dXJlLndpZHRoID4+IGksXG4gICAgICAgICAgICAgIHRleHR1cmUuaGVpZ2h0ID4+IGksXG4gICAgICAgICAgICAgIDAsXG4gICAgICAgICAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQsXG4gICAgICAgICAgICAgIHRleHR1cmUudHlwZSxcbiAgICAgICAgICAgICAgbnVsbClcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHNldFRleEluZm8odGV4dHVyZS50ZXhJbmZvLCB0ZXh0dXJlLnRhcmdldClcbiAgICB9KVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjcmVhdGUyRDogY3JlYXRlVGV4dHVyZTJELFxuICAgIGNyZWF0ZUN1YmU6IGNyZWF0ZVRleHR1cmVDdWJlLFxuICAgIGNsZWFyOiBkZXN0cm95VGV4dHVyZXMsXG4gICAgZ2V0VGV4dHVyZTogZnVuY3Rpb24gKHdyYXBwZXIpIHtcbiAgICAgIHJldHVybiBudWxsXG4gICAgfSxcbiAgICByZXN0b3JlOiByZXN0b3JlVGV4dHVyZXNcbiAgfVxufVxuIiwidmFyIEdMX1FVRVJZX1JFU1VMVF9FWFQgPSAweDg4NjZcbnZhciBHTF9RVUVSWV9SRVNVTFRfQVZBSUxBQkxFX0VYVCA9IDB4ODg2N1xudmFyIEdMX1RJTUVfRUxBUFNFRF9FWFQgPSAweDg4QkZcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoZ2wsIGV4dGVuc2lvbnMpIHtcbiAgdmFyIGV4dFRpbWVyID0gZXh0ZW5zaW9ucy5leHRfZGlzam9pbnRfdGltZXJfcXVlcnlcblxuICBpZiAoIWV4dFRpbWVyKSB7XG4gICAgcmV0dXJuIG51bGxcbiAgfVxuXG4gIC8vIFFVRVJZIFBPT0wgQkVHSU5cbiAgdmFyIHF1ZXJ5UG9vbCA9IFtdXG4gIGZ1bmN0aW9uIGFsbG9jUXVlcnkgKCkge1xuICAgIHJldHVybiBxdWVyeVBvb2wucG9wKCkgfHwgZXh0VGltZXIuY3JlYXRlUXVlcnlFWFQoKVxuICB9XG4gIGZ1bmN0aW9uIGZyZWVRdWVyeSAocXVlcnkpIHtcbiAgICBxdWVyeVBvb2wucHVzaChxdWVyeSlcbiAgfVxuICAvLyBRVUVSWSBQT09MIEVORFxuXG4gIHZhciBwZW5kaW5nUXVlcmllcyA9IFtdXG4gIGZ1bmN0aW9uIGJlZ2luUXVlcnkgKHN0YXRzKSB7XG4gICAgdmFyIHF1ZXJ5ID0gYWxsb2NRdWVyeSgpXG4gICAgZXh0VGltZXIuYmVnaW5RdWVyeUVYVChHTF9USU1FX0VMQVBTRURfRVhULCBxdWVyeSlcbiAgICBwZW5kaW5nUXVlcmllcy5wdXNoKHF1ZXJ5KVxuICAgIHB1c2hTY29wZVN0YXRzKHBlbmRpbmdRdWVyaWVzLmxlbmd0aCAtIDEsIHBlbmRpbmdRdWVyaWVzLmxlbmd0aCwgc3RhdHMpXG4gIH1cblxuICBmdW5jdGlvbiBlbmRRdWVyeSAoKSB7XG4gICAgZXh0VGltZXIuZW5kUXVlcnlFWFQoR0xfVElNRV9FTEFQU0VEX0VYVClcbiAgfVxuXG4gIC8vXG4gIC8vIFBlbmRpbmcgc3RhdHMgcG9vbC5cbiAgLy9cbiAgZnVuY3Rpb24gUGVuZGluZ1N0YXRzICgpIHtcbiAgICB0aGlzLnN0YXJ0UXVlcnlJbmRleCA9IC0xXG4gICAgdGhpcy5lbmRRdWVyeUluZGV4ID0gLTFcbiAgICB0aGlzLnN1bSA9IDBcbiAgICB0aGlzLnN0YXRzID0gbnVsbFxuICB9XG4gIHZhciBwZW5kaW5nU3RhdHNQb29sID0gW11cbiAgZnVuY3Rpb24gYWxsb2NQZW5kaW5nU3RhdHMgKCkge1xuICAgIHJldHVybiBwZW5kaW5nU3RhdHNQb29sLnBvcCgpIHx8IG5ldyBQZW5kaW5nU3RhdHMoKVxuICB9XG4gIGZ1bmN0aW9uIGZyZWVQZW5kaW5nU3RhdHMgKHBlbmRpbmdTdGF0cykge1xuICAgIHBlbmRpbmdTdGF0c1Bvb2wucHVzaChwZW5kaW5nU3RhdHMpXG4gIH1cbiAgLy8gUGVuZGluZyBzdGF0cyBwb29sIGVuZFxuXG4gIHZhciBwZW5kaW5nU3RhdHMgPSBbXVxuICBmdW5jdGlvbiBwdXNoU2NvcGVTdGF0cyAoc3RhcnQsIGVuZCwgc3RhdHMpIHtcbiAgICB2YXIgcHMgPSBhbGxvY1BlbmRpbmdTdGF0cygpXG4gICAgcHMuc3RhcnRRdWVyeUluZGV4ID0gc3RhcnRcbiAgICBwcy5lbmRRdWVyeUluZGV4ID0gZW5kXG4gICAgcHMuc3VtID0gMFxuICAgIHBzLnN0YXRzID0gc3RhdHNcbiAgICBwZW5kaW5nU3RhdHMucHVzaChwcylcbiAgfVxuXG4gIC8vIHdlIHNob3VsZCBjYWxsIHRoaXMgYXQgdGhlIGJlZ2lubmluZyBvZiB0aGUgZnJhbWUsXG4gIC8vIGluIG9yZGVyIHRvIHVwZGF0ZSBncHVUaW1lXG4gIHZhciB0aW1lU3VtID0gW11cbiAgdmFyIHF1ZXJ5UHRyID0gW11cbiAgZnVuY3Rpb24gdXBkYXRlICgpIHtcbiAgICB2YXIgcHRyLCBpXG5cbiAgICB2YXIgbiA9IHBlbmRpbmdRdWVyaWVzLmxlbmd0aFxuICAgIGlmIChuID09PSAwKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICAvLyBSZXNlcnZlIHNwYWNlXG4gICAgcXVlcnlQdHIubGVuZ3RoID0gTWF0aC5tYXgocXVlcnlQdHIubGVuZ3RoLCBuICsgMSlcbiAgICB0aW1lU3VtLmxlbmd0aCA9IE1hdGgubWF4KHRpbWVTdW0ubGVuZ3RoLCBuICsgMSlcbiAgICB0aW1lU3VtWzBdID0gMFxuICAgIHF1ZXJ5UHRyWzBdID0gMFxuXG4gICAgLy8gVXBkYXRlIGFsbCBwZW5kaW5nIHRpbWVyIHF1ZXJpZXNcbiAgICB2YXIgcXVlcnlUaW1lID0gMFxuICAgIHB0ciA9IDBcbiAgICBmb3IgKGkgPSAwOyBpIDwgcGVuZGluZ1F1ZXJpZXMubGVuZ3RoOyArK2kpIHtcbiAgICAgIHZhciBxdWVyeSA9IHBlbmRpbmdRdWVyaWVzW2ldXG4gICAgICBpZiAoZXh0VGltZXIuZ2V0UXVlcnlPYmplY3RFWFQocXVlcnksIEdMX1FVRVJZX1JFU1VMVF9BVkFJTEFCTEVfRVhUKSkge1xuICAgICAgICBxdWVyeVRpbWUgKz0gZXh0VGltZXIuZ2V0UXVlcnlPYmplY3RFWFQocXVlcnksIEdMX1FVRVJZX1JFU1VMVF9FWFQpXG4gICAgICAgIGZyZWVRdWVyeShxdWVyeSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBlbmRpbmdRdWVyaWVzW3B0cisrXSA9IHF1ZXJ5XG4gICAgICB9XG4gICAgICB0aW1lU3VtW2kgKyAxXSA9IHF1ZXJ5VGltZVxuICAgICAgcXVlcnlQdHJbaSArIDFdID0gcHRyXG4gICAgfVxuICAgIHBlbmRpbmdRdWVyaWVzLmxlbmd0aCA9IHB0clxuXG4gICAgLy8gVXBkYXRlIGFsbCBwZW5kaW5nIHN0YXQgcXVlcmllc1xuICAgIHB0ciA9IDBcbiAgICBmb3IgKGkgPSAwOyBpIDwgcGVuZGluZ1N0YXRzLmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgc3RhdHMgPSBwZW5kaW5nU3RhdHNbaV1cbiAgICAgIHZhciBzdGFydCA9IHN0YXRzLnN0YXJ0UXVlcnlJbmRleFxuICAgICAgdmFyIGVuZCA9IHN0YXRzLmVuZFF1ZXJ5SW5kZXhcbiAgICAgIHN0YXRzLnN1bSArPSB0aW1lU3VtW2VuZF0gLSB0aW1lU3VtW3N0YXJ0XVxuICAgICAgdmFyIHN0YXJ0UHRyID0gcXVlcnlQdHJbc3RhcnRdXG4gICAgICB2YXIgZW5kUHRyID0gcXVlcnlQdHJbZW5kXVxuICAgICAgaWYgKGVuZFB0ciA9PT0gc3RhcnRQdHIpIHtcbiAgICAgICAgc3RhdHMuc3RhdHMuZ3B1VGltZSArPSBzdGF0cy5zdW0gLyAxZTZcbiAgICAgICAgZnJlZVBlbmRpbmdTdGF0cyhzdGF0cylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN0YXRzLnN0YXJ0UXVlcnlJbmRleCA9IHN0YXJ0UHRyXG4gICAgICAgIHN0YXRzLmVuZFF1ZXJ5SW5kZXggPSBlbmRQdHJcbiAgICAgICAgcGVuZGluZ1N0YXRzW3B0cisrXSA9IHN0YXRzXG4gICAgICB9XG4gICAgfVxuICAgIHBlbmRpbmdTdGF0cy5sZW5ndGggPSBwdHJcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgYmVnaW5RdWVyeTogYmVnaW5RdWVyeSxcbiAgICBlbmRRdWVyeTogZW5kUXVlcnksXG4gICAgcHVzaFNjb3BlU3RhdHM6IHB1c2hTY29wZVN0YXRzLFxuICAgIHVwZGF0ZTogdXBkYXRlLFxuICAgIGdldE51bVBlbmRpbmdRdWVyaWVzOiBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gcGVuZGluZ1F1ZXJpZXMubGVuZ3RoXG4gICAgfSxcbiAgICBjbGVhcjogZnVuY3Rpb24gKCkge1xuICAgICAgcXVlcnlQb29sLnB1c2guYXBwbHkocXVlcnlQb29sLCBwZW5kaW5nUXVlcmllcylcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcXVlcnlQb29sLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGV4dFRpbWVyLmRlbGV0ZVF1ZXJ5RVhUKHF1ZXJ5UG9vbFtpXSlcbiAgICAgIH1cbiAgICAgIHBlbmRpbmdRdWVyaWVzLmxlbmd0aCA9IDBcbiAgICAgIHF1ZXJ5UG9vbC5sZW5ndGggPSAwXG4gICAgfSxcbiAgICByZXN0b3JlOiBmdW5jdGlvbiAoKSB7XG4gICAgICBwZW5kaW5nUXVlcmllcy5sZW5ndGggPSAwXG4gICAgICBxdWVyeVBvb2wubGVuZ3RoID0gMFxuICAgIH1cbiAgfVxufVxuIiwiLyogZ2xvYmFscyBwZXJmb3JtYW5jZSAqL1xubW9kdWxlLmV4cG9ydHMgPVxuICAodHlwZW9mIHBlcmZvcm1hbmNlICE9PSAndW5kZWZpbmVkJyAmJiBwZXJmb3JtYW5jZS5ub3cpXG4gID8gZnVuY3Rpb24gKCkgeyByZXR1cm4gcGVyZm9ybWFuY2Uubm93KCkgfVxuICA6IGZ1bmN0aW9uICgpIHsgcmV0dXJuICsobmV3IERhdGUoKSkgfVxuIiwidmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vZXh0ZW5kJylcblxuZnVuY3Rpb24gc2xpY2UgKHgpIHtcbiAgcmV0dXJuIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKHgpXG59XG5cbmZ1bmN0aW9uIGpvaW4gKHgpIHtcbiAgcmV0dXJuIHNsaWNlKHgpLmpvaW4oJycpXG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY3JlYXRlRW52aXJvbm1lbnQgKCkge1xuICAvLyBVbmlxdWUgdmFyaWFibGUgaWQgY291bnRlclxuICB2YXIgdmFyQ291bnRlciA9IDBcblxuICAvLyBMaW5rZWQgdmFsdWVzIGFyZSBwYXNzZWQgZnJvbSB0aGlzIHNjb3BlIGludG8gdGhlIGdlbmVyYXRlZCBjb2RlIGJsb2NrXG4gIC8vIENhbGxpbmcgbGluaygpIHBhc3NlcyBhIHZhbHVlIGludG8gdGhlIGdlbmVyYXRlZCBzY29wZSBhbmQgcmV0dXJuc1xuICAvLyB0aGUgdmFyaWFibGUgbmFtZSB3aGljaCBpdCBpcyBib3VuZCB0b1xuICB2YXIgbGlua2VkTmFtZXMgPSBbXVxuICB2YXIgbGlua2VkVmFsdWVzID0gW11cbiAgZnVuY3Rpb24gbGluayAodmFsdWUpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxpbmtlZFZhbHVlcy5sZW5ndGg7ICsraSkge1xuICAgICAgaWYgKGxpbmtlZFZhbHVlc1tpXSA9PT0gdmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIGxpbmtlZE5hbWVzW2ldXG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFyIG5hbWUgPSAnZycgKyAodmFyQ291bnRlcisrKVxuICAgIGxpbmtlZE5hbWVzLnB1c2gobmFtZSlcbiAgICBsaW5rZWRWYWx1ZXMucHVzaCh2YWx1ZSlcbiAgICByZXR1cm4gbmFtZVxuICB9XG5cbiAgLy8gY3JlYXRlIGEgY29kZSBibG9ja1xuICBmdW5jdGlvbiBibG9jayAoKSB7XG4gICAgdmFyIGNvZGUgPSBbXVxuICAgIGZ1bmN0aW9uIHB1c2ggKCkge1xuICAgICAgY29kZS5wdXNoLmFwcGx5KGNvZGUsIHNsaWNlKGFyZ3VtZW50cykpXG4gICAgfVxuXG4gICAgdmFyIHZhcnMgPSBbXVxuICAgIGZ1bmN0aW9uIGRlZiAoKSB7XG4gICAgICB2YXIgbmFtZSA9ICd2JyArICh2YXJDb3VudGVyKyspXG4gICAgICB2YXJzLnB1c2gobmFtZSlcblxuICAgICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGNvZGUucHVzaChuYW1lLCAnPScpXG4gICAgICAgIGNvZGUucHVzaC5hcHBseShjb2RlLCBzbGljZShhcmd1bWVudHMpKVxuICAgICAgICBjb2RlLnB1c2goJzsnKVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gbmFtZVxuICAgIH1cblxuICAgIHJldHVybiBleHRlbmQocHVzaCwge1xuICAgICAgZGVmOiBkZWYsXG4gICAgICB0b1N0cmluZzogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gam9pbihbXG4gICAgICAgICAgKHZhcnMubGVuZ3RoID4gMCA/ICd2YXIgJyArIHZhcnMgKyAnOycgOiAnJyksXG4gICAgICAgICAgam9pbihjb2RlKVxuICAgICAgICBdKVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiBzY29wZSAoKSB7XG4gICAgdmFyIGVudHJ5ID0gYmxvY2soKVxuICAgIHZhciBleGl0ID0gYmxvY2soKVxuXG4gICAgdmFyIGVudHJ5VG9TdHJpbmcgPSBlbnRyeS50b1N0cmluZ1xuICAgIHZhciBleGl0VG9TdHJpbmcgPSBleGl0LnRvU3RyaW5nXG5cbiAgICBmdW5jdGlvbiBzYXZlIChvYmplY3QsIHByb3ApIHtcbiAgICAgIGV4aXQob2JqZWN0LCBwcm9wLCAnPScsIGVudHJ5LmRlZihvYmplY3QsIHByb3ApLCAnOycpXG4gICAgfVxuXG4gICAgcmV0dXJuIGV4dGVuZChmdW5jdGlvbiAoKSB7XG4gICAgICBlbnRyeS5hcHBseShlbnRyeSwgc2xpY2UoYXJndW1lbnRzKSlcbiAgICB9LCB7XG4gICAgICBkZWY6IGVudHJ5LmRlZixcbiAgICAgIGVudHJ5OiBlbnRyeSxcbiAgICAgIGV4aXQ6IGV4aXQsXG4gICAgICBzYXZlOiBzYXZlLFxuICAgICAgc2V0OiBmdW5jdGlvbiAob2JqZWN0LCBwcm9wLCB2YWx1ZSkge1xuICAgICAgICBzYXZlKG9iamVjdCwgcHJvcClcbiAgICAgICAgZW50cnkob2JqZWN0LCBwcm9wLCAnPScsIHZhbHVlLCAnOycpXG4gICAgICB9LFxuICAgICAgdG9TdHJpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIGVudHJ5VG9TdHJpbmcoKSArIGV4aXRUb1N0cmluZygpXG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGNvbmRpdGlvbmFsICgpIHtcbiAgICB2YXIgcHJlZCA9IGpvaW4oYXJndW1lbnRzKVxuICAgIHZhciB0aGVuQmxvY2sgPSBzY29wZSgpXG4gICAgdmFyIGVsc2VCbG9jayA9IHNjb3BlKClcblxuICAgIHZhciB0aGVuVG9TdHJpbmcgPSB0aGVuQmxvY2sudG9TdHJpbmdcbiAgICB2YXIgZWxzZVRvU3RyaW5nID0gZWxzZUJsb2NrLnRvU3RyaW5nXG5cbiAgICByZXR1cm4gZXh0ZW5kKHRoZW5CbG9jaywge1xuICAgICAgdGhlbjogZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGVuQmxvY2suYXBwbHkodGhlbkJsb2NrLCBzbGljZShhcmd1bWVudHMpKVxuICAgICAgICByZXR1cm4gdGhpc1xuICAgICAgfSxcbiAgICAgIGVsc2U6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgZWxzZUJsb2NrLmFwcGx5KGVsc2VCbG9jaywgc2xpY2UoYXJndW1lbnRzKSlcbiAgICAgICAgcmV0dXJuIHRoaXNcbiAgICAgIH0sXG4gICAgICB0b1N0cmluZzogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZWxzZUNsYXVzZSA9IGVsc2VUb1N0cmluZygpXG4gICAgICAgIGlmIChlbHNlQ2xhdXNlKSB7XG4gICAgICAgICAgZWxzZUNsYXVzZSA9ICdlbHNleycgKyBlbHNlQ2xhdXNlICsgJ30nXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGpvaW4oW1xuICAgICAgICAgICdpZignLCBwcmVkLCAnKXsnLFxuICAgICAgICAgIHRoZW5Ub1N0cmluZygpLFxuICAgICAgICAgICd9JywgZWxzZUNsYXVzZVxuICAgICAgICBdKVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICAvLyBwcm9jZWR1cmUgbGlzdFxuICB2YXIgZ2xvYmFsQmxvY2sgPSBibG9jaygpXG4gIHZhciBwcm9jZWR1cmVzID0ge31cbiAgZnVuY3Rpb24gcHJvYyAobmFtZSwgY291bnQpIHtcbiAgICB2YXIgYXJncyA9IFtdXG4gICAgZnVuY3Rpb24gYXJnICgpIHtcbiAgICAgIHZhciBuYW1lID0gJ2EnICsgYXJncy5sZW5ndGhcbiAgICAgIGFyZ3MucHVzaChuYW1lKVxuICAgICAgcmV0dXJuIG5hbWVcbiAgICB9XG5cbiAgICBjb3VudCA9IGNvdW50IHx8IDBcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNvdW50OyArK2kpIHtcbiAgICAgIGFyZygpXG4gICAgfVxuXG4gICAgdmFyIGJvZHkgPSBzY29wZSgpXG4gICAgdmFyIGJvZHlUb1N0cmluZyA9IGJvZHkudG9TdHJpbmdcblxuICAgIHZhciByZXN1bHQgPSBwcm9jZWR1cmVzW25hbWVdID0gZXh0ZW5kKGJvZHksIHtcbiAgICAgIGFyZzogYXJnLFxuICAgICAgdG9TdHJpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIGpvaW4oW1xuICAgICAgICAgICdmdW5jdGlvbignLCBhcmdzLmpvaW4oKSwgJyl7JyxcbiAgICAgICAgICBib2R5VG9TdHJpbmcoKSxcbiAgICAgICAgICAnfSdcbiAgICAgICAgXSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG5cbiAgZnVuY3Rpb24gY29tcGlsZSAoKSB7XG4gICAgdmFyIGNvZGUgPSBbJ1widXNlIHN0cmljdFwiOycsXG4gICAgICBnbG9iYWxCbG9jayxcbiAgICAgICdyZXR1cm4geyddXG4gICAgT2JqZWN0LmtleXMocHJvY2VkdXJlcykuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgY29kZS5wdXNoKCdcIicsIG5hbWUsICdcIjonLCBwcm9jZWR1cmVzW25hbWVdLnRvU3RyaW5nKCksICcsJylcbiAgICB9KVxuICAgIGNvZGUucHVzaCgnfScpXG4gICAgdmFyIHNyYyA9IGpvaW4oY29kZSlcbiAgICAgIC5yZXBsYWNlKC87L2csICc7XFxuJylcbiAgICAgIC5yZXBsYWNlKC99L2csICd9XFxuJylcbiAgICAgIC5yZXBsYWNlKC97L2csICd7XFxuJylcbiAgICB2YXIgcHJvYyA9IEZ1bmN0aW9uLmFwcGx5KG51bGwsIGxpbmtlZE5hbWVzLmNvbmNhdChzcmMpKVxuICAgIHJldHVybiBwcm9jLmFwcGx5KG51bGwsIGxpbmtlZFZhbHVlcylcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgZ2xvYmFsOiBnbG9iYWxCbG9jayxcbiAgICBsaW5rOiBsaW5rLFxuICAgIGJsb2NrOiBibG9jayxcbiAgICBwcm9jOiBwcm9jLFxuICAgIHNjb3BlOiBzY29wZSxcbiAgICBjb25kOiBjb25kaXRpb25hbCxcbiAgICBjb21waWxlOiBjb21waWxlXG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGJhc2UsIG9wdHMpIHtcbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhvcHRzKVxuICBmb3IgKHZhciBpID0gMDsgaSA8IGtleXMubGVuZ3RoOyArK2kpIHtcbiAgICBiYXNlW2tleXNbaV1dID0gb3B0c1trZXlzW2ldXVxuICB9XG4gIHJldHVybiBiYXNlXG59XG4iLCJ2YXIgcG9vbCA9IHJlcXVpcmUoJy4vcG9vbCcpXG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBzaGFwZTogYXJyYXlTaGFwZSxcbiAgZmxhdHRlbjogZmxhdHRlbkFycmF5XG59XG5cbmZ1bmN0aW9uIGZsYXR0ZW4xRCAoYXJyYXksIG54LCBvdXQpIHtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBueDsgKytpKSB7XG4gICAgb3V0W2ldID0gYXJyYXlbaV1cbiAgfVxufVxuXG5mdW5jdGlvbiBmbGF0dGVuMkQgKGFycmF5LCBueCwgbnksIG91dCkge1xuICB2YXIgcHRyID0gMFxuICBmb3IgKHZhciBpID0gMDsgaSA8IG54OyArK2kpIHtcbiAgICB2YXIgcm93ID0gYXJyYXlbaV1cbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IG55OyArK2opIHtcbiAgICAgIG91dFtwdHIrK10gPSByb3dbal1cbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gZmxhdHRlbjNEIChhcnJheSwgbngsIG55LCBueiwgb3V0LCBwdHJfKSB7XG4gIHZhciBwdHIgPSBwdHJfXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbng7ICsraSkge1xuICAgIHZhciByb3cgPSBhcnJheVtpXVxuICAgIGZvciAodmFyIGogPSAwOyBqIDwgbnk7ICsraikge1xuICAgICAgdmFyIGNvbCA9IHJvd1tqXVxuICAgICAgZm9yICh2YXIgayA9IDA7IGsgPCBuejsgKytrKSB7XG4gICAgICAgIG91dFtwdHIrK10gPSBjb2xba11cbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gZmxhdHRlblJlYyAoYXJyYXksIHNoYXBlLCBsZXZlbCwgb3V0LCBwdHIpIHtcbiAgdmFyIHN0cmlkZSA9IDFcbiAgZm9yICh2YXIgaSA9IGxldmVsICsgMTsgaSA8IHNoYXBlLmxlbmd0aDsgKytpKSB7XG4gICAgc3RyaWRlICo9IHNoYXBlW2ldXG4gIH1cbiAgdmFyIG4gPSBzaGFwZVtsZXZlbF1cbiAgaWYgKHNoYXBlLmxlbmd0aCAtIGxldmVsID09PSA0KSB7XG4gICAgdmFyIG54ID0gc2hhcGVbbGV2ZWwgKyAxXVxuICAgIHZhciBueSA9IHNoYXBlW2xldmVsICsgMl1cbiAgICB2YXIgbnogPSBzaGFwZVtsZXZlbCArIDNdXG4gICAgZm9yIChpID0gMDsgaSA8IG47ICsraSkge1xuICAgICAgZmxhdHRlbjNEKGFycmF5W2ldLCBueCwgbnksIG56LCBvdXQsIHB0cilcbiAgICAgIHB0ciArPSBzdHJpZGVcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgZm9yIChpID0gMDsgaSA8IG47ICsraSkge1xuICAgICAgZmxhdHRlblJlYyhhcnJheVtpXSwgc2hhcGUsIGxldmVsICsgMSwgb3V0LCBwdHIpXG4gICAgICBwdHIgKz0gc3RyaWRlXG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGZsYXR0ZW5BcnJheSAoYXJyYXksIHNoYXBlLCB0eXBlLCBvdXRfKSB7XG4gIHZhciBzeiA9IDFcbiAgaWYgKHNoYXBlLmxlbmd0aCkge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc2hhcGUubGVuZ3RoOyArK2kpIHtcbiAgICAgIHN6ICo9IHNoYXBlW2ldXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHN6ID0gMFxuICB9XG4gIHZhciBvdXQgPSBvdXRfIHx8IHBvb2wuYWxsb2NUeXBlKHR5cGUsIHN6KVxuICBzd2l0Y2ggKHNoYXBlLmxlbmd0aCkge1xuICAgIGNhc2UgMDpcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAxOlxuICAgICAgZmxhdHRlbjFEKGFycmF5LCBzaGFwZVswXSwgb3V0KVxuICAgICAgYnJlYWtcbiAgICBjYXNlIDI6XG4gICAgICBmbGF0dGVuMkQoYXJyYXksIHNoYXBlWzBdLCBzaGFwZVsxXSwgb3V0KVxuICAgICAgYnJlYWtcbiAgICBjYXNlIDM6XG4gICAgICBmbGF0dGVuM0QoYXJyYXksIHNoYXBlWzBdLCBzaGFwZVsxXSwgc2hhcGVbMl0sIG91dCwgMClcbiAgICAgIGJyZWFrXG4gICAgZGVmYXVsdDpcbiAgICAgIGZsYXR0ZW5SZWMoYXJyYXksIHNoYXBlLCAwLCBvdXQsIDApXG4gIH1cbiAgcmV0dXJuIG91dFxufVxuXG5mdW5jdGlvbiBhcnJheVNoYXBlIChhcnJheV8pIHtcbiAgdmFyIHNoYXBlID0gW11cbiAgZm9yICh2YXIgYXJyYXkgPSBhcnJheV87IGFycmF5Lmxlbmd0aDsgYXJyYXkgPSBhcnJheVswXSkge1xuICAgIHNoYXBlLnB1c2goYXJyYXkubGVuZ3RoKVxuICB9XG4gIHJldHVybiBzaGFwZVxufVxuIiwidmFyIGlzVHlwZWRBcnJheSA9IHJlcXVpcmUoJy4vaXMtdHlwZWQtYXJyYXknKVxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpc0FycmF5TGlrZSAocykge1xuICByZXR1cm4gQXJyYXkuaXNBcnJheShzKSB8fCBpc1R5cGVkQXJyYXkocylcbn1cbiIsInZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL2lzLXR5cGVkLWFycmF5JylcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpc05EQXJyYXlMaWtlIChvYmopIHtcbiAgcmV0dXJuIChcbiAgICAhIW9iaiAmJlxuICAgIHR5cGVvZiBvYmogPT09ICdvYmplY3QnICYmXG4gICAgQXJyYXkuaXNBcnJheShvYmouc2hhcGUpICYmXG4gICAgQXJyYXkuaXNBcnJheShvYmouc3RyaWRlKSAmJlxuICAgIHR5cGVvZiBvYmoub2Zmc2V0ID09PSAnbnVtYmVyJyAmJlxuICAgIG9iai5zaGFwZS5sZW5ndGggPT09IG9iai5zdHJpZGUubGVuZ3RoICYmXG4gICAgKEFycmF5LmlzQXJyYXkob2JqLmRhdGEpIHx8XG4gICAgICBpc1R5cGVkQXJyYXkob2JqLmRhdGEpKSlcbn1cbiIsInZhciBkdHlwZXMgPSByZXF1aXJlKCcuLi9jb25zdGFudHMvYXJyYXl0eXBlcy5qc29uJylcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHgpIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh4KSBpbiBkdHlwZXNcbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gbG9vcCAobiwgZikge1xuICB2YXIgcmVzdWx0ID0gQXJyYXkobilcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBuOyArK2kpIHtcbiAgICByZXN1bHRbaV0gPSBmKGkpXG4gIH1cbiAgcmV0dXJuIHJlc3VsdFxufVxuIiwidmFyIGxvb3AgPSByZXF1aXJlKCcuL2xvb3AnKVxuXG52YXIgR0xfQllURSA9IDUxMjBcbnZhciBHTF9VTlNJR05FRF9CWVRFID0gNTEyMVxudmFyIEdMX1NIT1JUID0gNTEyMlxudmFyIEdMX1VOU0lHTkVEX1NIT1JUID0gNTEyM1xudmFyIEdMX0lOVCA9IDUxMjRcbnZhciBHTF9VTlNJR05FRF9JTlQgPSA1MTI1XG52YXIgR0xfRkxPQVQgPSA1MTI2XG5cbnZhciBidWZmZXJQb29sID0gbG9vcCg4LCBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiBbXVxufSlcblxuZnVuY3Rpb24gbmV4dFBvdzE2ICh2KSB7XG4gIGZvciAodmFyIGkgPSAxNjsgaSA8PSAoMSA8PCAyOCk7IGkgKj0gMTYpIHtcbiAgICBpZiAodiA8PSBpKSB7XG4gICAgICByZXR1cm4gaVxuICAgIH1cbiAgfVxuICByZXR1cm4gMFxufVxuXG5mdW5jdGlvbiBsb2cyICh2KSB7XG4gIHZhciByLCBzaGlmdFxuICByID0gKHYgPiAweEZGRkYpIDw8IDRcbiAgdiA+Pj49IHJcbiAgc2hpZnQgPSAodiA+IDB4RkYpIDw8IDNcbiAgdiA+Pj49IHNoaWZ0OyByIHw9IHNoaWZ0XG4gIHNoaWZ0ID0gKHYgPiAweEYpIDw8IDJcbiAgdiA+Pj49IHNoaWZ0OyByIHw9IHNoaWZ0XG4gIHNoaWZ0ID0gKHYgPiAweDMpIDw8IDFcbiAgdiA+Pj49IHNoaWZ0OyByIHw9IHNoaWZ0XG4gIHJldHVybiByIHwgKHYgPj4gMSlcbn1cblxuZnVuY3Rpb24gYWxsb2MgKG4pIHtcbiAgdmFyIHN6ID0gbmV4dFBvdzE2KG4pXG4gIHZhciBiaW4gPSBidWZmZXJQb29sW2xvZzIoc3opID4+IDJdXG4gIGlmIChiaW4ubGVuZ3RoID4gMCkge1xuICAgIHJldHVybiBiaW4ucG9wKClcbiAgfVxuICByZXR1cm4gbmV3IEFycmF5QnVmZmVyKHN6KVxufVxuXG5mdW5jdGlvbiBmcmVlIChidWYpIHtcbiAgYnVmZmVyUG9vbFtsb2cyKGJ1Zi5ieXRlTGVuZ3RoKSA+PiAyXS5wdXNoKGJ1Zilcbn1cblxuZnVuY3Rpb24gYWxsb2NUeXBlICh0eXBlLCBuKSB7XG4gIHZhciByZXN1bHQgPSBudWxsXG4gIHN3aXRjaCAodHlwZSkge1xuICAgIGNhc2UgR0xfQllURTpcbiAgICAgIHJlc3VsdCA9IG5ldyBJbnQ4QXJyYXkoYWxsb2MobiksIDAsIG4pXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfVU5TSUdORURfQllURTpcbiAgICAgIHJlc3VsdCA9IG5ldyBVaW50OEFycmF5KGFsbG9jKG4pLCAwLCBuKVxuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX1NIT1JUOlxuICAgICAgcmVzdWx0ID0gbmV3IEludDE2QXJyYXkoYWxsb2MoMiAqIG4pLCAwLCBuKVxuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUOlxuICAgICAgcmVzdWx0ID0gbmV3IFVpbnQxNkFycmF5KGFsbG9jKDIgKiBuKSwgMCwgbilcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9JTlQ6XG4gICAgICByZXN1bHQgPSBuZXcgSW50MzJBcnJheShhbGxvYyg0ICogbiksIDAsIG4pXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfVU5TSUdORURfSU5UOlxuICAgICAgcmVzdWx0ID0gbmV3IFVpbnQzMkFycmF5KGFsbG9jKDQgKiBuKSwgMCwgbilcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9GTE9BVDpcbiAgICAgIHJlc3VsdCA9IG5ldyBGbG9hdDMyQXJyYXkoYWxsb2MoNCAqIG4pLCAwLCBuKVxuICAgICAgYnJlYWtcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIG51bGxcbiAgfVxuICBpZiAocmVzdWx0Lmxlbmd0aCAhPT0gbikge1xuICAgIHJldHVybiByZXN1bHQuc3ViYXJyYXkoMCwgbilcbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG5cbmZ1bmN0aW9uIGZyZWVUeXBlIChhcnJheSkge1xuICBmcmVlKGFycmF5LmJ1ZmZlcilcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGFsbG9jOiBhbGxvYyxcbiAgZnJlZTogZnJlZSxcbiAgYWxsb2NUeXBlOiBhbGxvY1R5cGUsXG4gIGZyZWVUeXBlOiBmcmVlVHlwZVxufVxuIiwiLyogZ2xvYmFscyByZXF1ZXN0QW5pbWF0aW9uRnJhbWUsIGNhbmNlbEFuaW1hdGlvbkZyYW1lICovXG5pZiAodHlwZW9mIHJlcXVlc3RBbmltYXRpb25GcmFtZSA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgIHR5cGVvZiBjYW5jZWxBbmltYXRpb25GcmFtZSA9PT0gJ2Z1bmN0aW9uJykge1xuICBtb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBuZXh0OiBmdW5jdGlvbiAoeCkgeyByZXR1cm4gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHgpIH0sXG4gICAgY2FuY2VsOiBmdW5jdGlvbiAoeCkgeyByZXR1cm4gY2FuY2VsQW5pbWF0aW9uRnJhbWUoeCkgfVxuICB9XG59IGVsc2Uge1xuICBtb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBuZXh0OiBmdW5jdGlvbiAoY2IpIHtcbiAgICAgIHJldHVybiBzZXRUaW1lb3V0KGNiLCAxNilcbiAgICB9LFxuICAgIGNhbmNlbDogY2xlYXJUaW1lb3V0XG4gIH1cbn1cbiIsInZhciBwb29sID0gcmVxdWlyZSgnLi9wb29sJylcblxudmFyIEZMT0FUID0gbmV3IEZsb2F0MzJBcnJheSgxKVxudmFyIElOVCA9IG5ldyBVaW50MzJBcnJheShGTE9BVC5idWZmZXIpXG5cbnZhciBHTF9VTlNJR05FRF9TSE9SVCA9IDUxMjNcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjb252ZXJ0VG9IYWxmRmxvYXQgKGFycmF5KSB7XG4gIHZhciB1c2hvcnRzID0gcG9vbC5hbGxvY1R5cGUoR0xfVU5TSUdORURfU0hPUlQsIGFycmF5Lmxlbmd0aClcblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGFycmF5Lmxlbmd0aDsgKytpKSB7XG4gICAgaWYgKGlzTmFOKGFycmF5W2ldKSkge1xuICAgICAgdXNob3J0c1tpXSA9IDB4ZmZmZlxuICAgIH0gZWxzZSBpZiAoYXJyYXlbaV0gPT09IEluZmluaXR5KSB7XG4gICAgICB1c2hvcnRzW2ldID0gMHg3YzAwXG4gICAgfSBlbHNlIGlmIChhcnJheVtpXSA9PT0gLUluZmluaXR5KSB7XG4gICAgICB1c2hvcnRzW2ldID0gMHhmYzAwXG4gICAgfSBlbHNlIHtcbiAgICAgIEZMT0FUWzBdID0gYXJyYXlbaV1cbiAgICAgIHZhciB4ID0gSU5UWzBdXG5cbiAgICAgIHZhciBzZ24gPSAoeCA+Pj4gMzEpIDw8IDE1XG4gICAgICB2YXIgZXhwID0gKCh4IDw8IDEpID4+PiAyNCkgLSAxMjdcbiAgICAgIHZhciBmcmFjID0gKHggPj4gMTMpICYgKCgxIDw8IDEwKSAtIDEpXG5cbiAgICAgIGlmIChleHAgPCAtMjQpIHtcbiAgICAgICAgLy8gcm91bmQgbm9uLXJlcHJlc2VudGFibGUgZGVub3JtYWxzIHRvIDBcbiAgICAgICAgdXNob3J0c1tpXSA9IHNnblxuICAgICAgfSBlbHNlIGlmIChleHAgPCAtMTQpIHtcbiAgICAgICAgLy8gaGFuZGxlIGRlbm9ybWFsc1xuICAgICAgICB2YXIgcyA9IC0xNCAtIGV4cFxuICAgICAgICB1c2hvcnRzW2ldID0gc2duICsgKChmcmFjICsgKDEgPDwgMTApKSA+PiBzKVxuICAgICAgfSBlbHNlIGlmIChleHAgPiAxNSkge1xuICAgICAgICAvLyByb3VuZCBvdmVyZmxvdyB0byArLy0gSW5maW5pdHlcbiAgICAgICAgdXNob3J0c1tpXSA9IHNnbiArIDB4N2MwMFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gb3RoZXJ3aXNlIGNvbnZlcnQgZGlyZWN0bHlcbiAgICAgICAgdXNob3J0c1tpXSA9IHNnbiArICgoZXhwICsgMTUpIDw8IDEwKSArIGZyYWNcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gdXNob3J0c1xufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAob2JqKSB7XG4gIHJldHVybiBPYmplY3Qua2V5cyhvYmopLm1hcChmdW5jdGlvbiAoa2V5KSB7IHJldHVybiBvYmpba2V5XSB9KVxufVxuIiwiLy8gQ29udGV4dCBhbmQgY2FudmFzIGNyZWF0aW9uIGhlbHBlciBmdW5jdGlvbnNcblxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vdXRpbC9leHRlbmQnKVxuXG5mdW5jdGlvbiBjcmVhdGVDYW52YXMgKGVsZW1lbnQsIG9uRG9uZSwgcGl4ZWxSYXRpbykge1xuICB2YXIgY2FudmFzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJylcbiAgZXh0ZW5kKGNhbnZhcy5zdHlsZSwge1xuICAgIGJvcmRlcjogMCxcbiAgICBtYXJnaW46IDAsXG4gICAgcGFkZGluZzogMCxcbiAgICB0b3A6IDAsXG4gICAgbGVmdDogMFxuICB9KVxuICBlbGVtZW50LmFwcGVuZENoaWxkKGNhbnZhcylcblxuICBpZiAoZWxlbWVudCA9PT0gZG9jdW1lbnQuYm9keSkge1xuICAgIGNhbnZhcy5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSdcbiAgICBleHRlbmQoZWxlbWVudC5zdHlsZSwge1xuICAgICAgbWFyZ2luOiAwLFxuICAgICAgcGFkZGluZzogMFxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiByZXNpemUgKCkge1xuICAgIHZhciB3ID0gd2luZG93LmlubmVyV2lkdGhcbiAgICB2YXIgaCA9IHdpbmRvdy5pbm5lckhlaWdodFxuICAgIGlmIChlbGVtZW50ICE9PSBkb2N1bWVudC5ib2R5KSB7XG4gICAgICB2YXIgYm91bmRzID0gZWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKVxuICAgICAgdyA9IGJvdW5kcy5yaWdodCAtIGJvdW5kcy5sZWZ0XG4gICAgICBoID0gYm91bmRzLnRvcCAtIGJvdW5kcy5ib3R0b21cbiAgICB9XG4gICAgY2FudmFzLndpZHRoID0gcGl4ZWxSYXRpbyAqIHdcbiAgICBjYW52YXMuaGVpZ2h0ID0gcGl4ZWxSYXRpbyAqIGhcbiAgICBleHRlbmQoY2FudmFzLnN0eWxlLCB7XG4gICAgICB3aWR0aDogdyArICdweCcsXG4gICAgICBoZWlnaHQ6IGggKyAncHgnXG4gICAgfSlcbiAgfVxuXG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdyZXNpemUnLCByZXNpemUsIGZhbHNlKVxuXG4gIGZ1bmN0aW9uIG9uRGVzdHJveSAoKSB7XG4gICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIHJlc2l6ZSlcbiAgICBlbGVtZW50LnJlbW92ZUNoaWxkKGNhbnZhcylcbiAgfVxuXG4gIHJlc2l6ZSgpXG5cbiAgcmV0dXJuIHtcbiAgICBjYW52YXM6IGNhbnZhcyxcbiAgICBvbkRlc3Ryb3k6IG9uRGVzdHJveVxuICB9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUNvbnRleHQgKGNhbnZhcywgY29udGV4QXR0cmlidXRlcykge1xuICBmdW5jdGlvbiBnZXQgKG5hbWUpIHtcbiAgICB0cnkge1xuICAgICAgcmV0dXJuIGNhbnZhcy5nZXRDb250ZXh0KG5hbWUsIGNvbnRleEF0dHJpYnV0ZXMpXG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG4gIH1cbiAgcmV0dXJuIChcbiAgICBnZXQoJ3dlYmdsJykgfHxcbiAgICBnZXQoJ2V4cGVyaW1lbnRhbC13ZWJnbCcpIHx8XG4gICAgZ2V0KCd3ZWJnbC1leHBlcmltZW50YWwnKVxuICApXG59XG5cbmZ1bmN0aW9uIGlzSFRNTEVsZW1lbnQgKG9iaikge1xuICByZXR1cm4gKFxuICAgIHR5cGVvZiBvYmoubm9kZU5hbWUgPT09ICdzdHJpbmcnICYmXG4gICAgdHlwZW9mIG9iai5hcHBlbmRDaGlsZCA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgIHR5cGVvZiBvYmouZ2V0Qm91bmRpbmdDbGllbnRSZWN0ID09PSAnZnVuY3Rpb24nXG4gIClcbn1cblxuZnVuY3Rpb24gaXNXZWJHTENvbnRleHQgKG9iaikge1xuICByZXR1cm4gKFxuICAgIHR5cGVvZiBvYmouZHJhd0FycmF5cyA9PT0gJ2Z1bmN0aW9uJyB8fFxuICAgIHR5cGVvZiBvYmouZHJhd0VsZW1lbnRzID09PSAnZnVuY3Rpb24nXG4gIClcbn1cblxuZnVuY3Rpb24gcGFyc2VFeHRlbnNpb25zIChpbnB1dCkge1xuICBpZiAodHlwZW9mIGlucHV0ID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBpbnB1dC5zcGxpdCgpXG4gIH1cbiAgXG4gIHJldHVybiBpbnB1dFxufVxuXG5mdW5jdGlvbiBnZXRFbGVtZW50IChkZXNjKSB7XG4gIGlmICh0eXBlb2YgZGVzYyA9PT0gJ3N0cmluZycpIHtcbiAgICBcbiAgICByZXR1cm4gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihkZXNjKVxuICB9XG4gIHJldHVybiBkZXNjXG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcGFyc2VBcmdzIChhcmdzXykge1xuICB2YXIgYXJncyA9IGFyZ3NfIHx8IHt9XG4gIHZhciBlbGVtZW50LCBjb250YWluZXIsIGNhbnZhcywgZ2xcbiAgdmFyIGNvbnRleHRBdHRyaWJ1dGVzID0ge31cbiAgdmFyIGV4dGVuc2lvbnMgPSBbXVxuICB2YXIgb3B0aW9uYWxFeHRlbnNpb25zID0gW11cbiAgdmFyIHBpeGVsUmF0aW8gPSAodHlwZW9mIHdpbmRvdyA9PT0gJ3VuZGVmaW5lZCcgPyAxIDogd2luZG93LmRldmljZVBpeGVsUmF0aW8pXG4gIHZhciBwcm9maWxlID0gZmFsc2VcbiAgdmFyIG9uRG9uZSA9IGZ1bmN0aW9uIChlcnIpIHtcbiAgICBpZiAoZXJyKSB7XG4gICAgICBcbiAgICB9XG4gIH1cbiAgdmFyIG9uRGVzdHJveSA9IGZ1bmN0aW9uICgpIHt9XG4gIGlmICh0eXBlb2YgYXJncyA9PT0gJ3N0cmluZycpIHtcbiAgICBcbiAgICBlbGVtZW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihhcmdzKVxuICAgIFxuICB9IGVsc2UgaWYgKHR5cGVvZiBhcmdzID09PSAnb2JqZWN0Jykge1xuICAgIGlmIChpc0hUTUxFbGVtZW50KGFyZ3MpKSB7XG4gICAgICBlbGVtZW50ID0gYXJnc1xuICAgIH0gZWxzZSBpZiAoaXNXZWJHTENvbnRleHQoYXJncykpIHtcbiAgICAgIGdsID0gYXJnc1xuICAgICAgY2FudmFzID0gZ2wuY2FudmFzXG4gICAgfSBlbHNlIHtcbiAgICAgIFxuICAgICAgaWYgKCdnbCcgaW4gYXJncykge1xuICAgICAgICBnbCA9IGFyZ3MuZ2xcbiAgICAgIH0gZWxzZSBpZiAoJ2NhbnZhcycgaW4gYXJncykge1xuICAgICAgICBjYW52YXMgPSBnZXRFbGVtZW50KGFyZ3MuY2FudmFzKVxuICAgICAgfSBlbHNlIGlmICgnY29udGFpbmVyJyBpbiBhcmdzKSB7XG4gICAgICAgIGNvbnRhaW5lciA9IGdldEVsZW1lbnQoYXJncy5jb250YWluZXIpXG4gICAgICB9XG4gICAgICBpZiAoJ2F0dHJpYnV0ZXMnIGluIGFyZ3MpIHtcbiAgICAgICAgY29udGV4dEF0dHJpYnV0ZXMgPSBhcmdzLmF0dHJpYnV0ZXNcbiAgICAgICAgXG4gICAgICB9XG4gICAgICBpZiAoJ2V4dGVuc2lvbnMnIGluIGFyZ3MpIHtcbiAgICAgICAgZXh0ZW5zaW9ucyA9IHBhcnNlRXh0ZW5zaW9ucyhhcmdzLmV4dGVuc2lvbnMpXG4gICAgICB9XG4gICAgICBpZiAoJ29wdGlvbmFsRXh0ZW5zaW9ucycgaW4gYXJncykge1xuICAgICAgICBvcHRpb25hbEV4dGVuc2lvbnMgPSBwYXJzZUV4dGVuc2lvbnMoYXJncy5vcHRpb25hbEV4dGVuc2lvbnMpXG4gICAgICB9XG4gICAgICBpZiAoJ29uRG9uZScgaW4gYXJncykge1xuICAgICAgICBcbiAgICAgICAgb25Eb25lID0gYXJncy5vbkRvbmVcbiAgICAgIH1cbiAgICAgIGlmICgncHJvZmlsZScgaW4gYXJncykge1xuICAgICAgICBwcm9maWxlID0gISFhcmdzLnByb2ZpbGVcbiAgICAgIH1cbiAgICAgIGlmICgncGl4ZWxSYXRpbycgaW4gYXJncykge1xuICAgICAgICBwaXhlbFJhdGlvID0gK2FyZ3MucGl4ZWxSYXRpb1xuICAgICAgICBcbiAgICAgIH1cbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgXG4gIH1cblxuICBpZiAoZWxlbWVudCkge1xuICAgIGlmIChlbGVtZW50Lm5vZGVOYW1lLnRvTG93ZXJDYXNlKCkgPT09ICdjYW52YXMnKSB7XG4gICAgICBjYW52YXMgPSBlbGVtZW50XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnRhaW5lciA9IGVsZW1lbnRcbiAgICB9XG4gIH1cblxuICBpZiAoIWdsKSB7XG4gICAgaWYgKCFjYW52YXMpIHtcbiAgICAgIFxuICAgICAgdmFyIHJlc3VsdCA9IGNyZWF0ZUNhbnZhcyhjb250YWluZXIgfHwgZG9jdW1lbnQuYm9keSwgb25Eb25lLCBwaXhlbFJhdGlvKVxuICAgICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgICAgcmV0dXJuIG51bGxcbiAgICAgIH1cbiAgICAgIGNhbnZhcyA9IHJlc3VsdC5jYW52YXNcbiAgICAgIG9uRGVzdHJveSA9IHJlc3VsdC5vbkRlc3Ryb3lcbiAgICB9XG4gICAgZ2wgPSBjcmVhdGVDb250ZXh0KGNhbnZhcywgY29udGV4dEF0dHJpYnV0ZXMpXG4gIH1cblxuICBpZiAoIWdsKSB7XG4gICAgb25EZXN0cm95KClcbiAgICBvbkRvbmUoJ3dlYmdsIG5vdCBzdXBwb3J0ZWQsIHRyeSB1cGdyYWRpbmcgeW91ciBicm93c2VyIG9yIGdyYXBoaWNzIGRyaXZlcnMgaHR0cDovL2dldC53ZWJnbC5vcmcnKVxuICAgIHJldHVybiBudWxsXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGdsOiBnbCxcbiAgICBjYW52YXM6IGNhbnZhcyxcbiAgICBjb250YWluZXI6IGNvbnRhaW5lcixcbiAgICBleHRlbnNpb25zOiBleHRlbnNpb25zLFxuICAgIG9wdGlvbmFsRXh0ZW5zaW9uczogb3B0aW9uYWxFeHRlbnNpb25zLFxuICAgIHBpeGVsUmF0aW86IHBpeGVsUmF0aW8sXG4gICAgcHJvZmlsZTogcHJvZmlsZSxcbiAgICBvbkRvbmU6IG9uRG9uZSxcbiAgICBvbkRlc3Ryb3k6IG9uRGVzdHJveVxuICB9XG59XG4iLCIndXNlIHN0cmljdCdcblxubW9kdWxlLmV4cG9ydHMgPSBtb3VzZUxpc3RlblxuXG52YXIgbW91c2UgPSByZXF1aXJlKCdtb3VzZS1ldmVudCcpXG5cbmZ1bmN0aW9uIG1vdXNlTGlzdGVuKGVsZW1lbnQsIGNhbGxiYWNrKSB7XG4gIGlmKCFjYWxsYmFjaykge1xuICAgIGNhbGxiYWNrID0gZWxlbWVudFxuICAgIGVsZW1lbnQgPSB3aW5kb3dcbiAgfVxuXG4gIHZhciBidXR0b25TdGF0ZSA9IDBcbiAgdmFyIHggPSAwXG4gIHZhciB5ID0gMFxuICB2YXIgbW9kcyA9IHtcbiAgICBzaGlmdDogICBmYWxzZSxcbiAgICBhbHQ6ICAgICBmYWxzZSxcbiAgICBjb250cm9sOiBmYWxzZSxcbiAgICBtZXRhOiAgICBmYWxzZVxuICB9XG4gIHZhciBhdHRhY2hlZCA9IGZhbHNlXG5cbiAgZnVuY3Rpb24gdXBkYXRlTW9kcyhldikge1xuICAgIHZhciBjaGFuZ2VkID0gZmFsc2VcbiAgICBpZignYWx0S2V5JyBpbiBldikge1xuICAgICAgY2hhbmdlZCA9IGNoYW5nZWQgfHwgZXYuYWx0S2V5ICE9PSBtb2RzLmFsdFxuICAgICAgbW9kcy5hbHQgPSAhIWV2LmFsdEtleVxuICAgIH1cbiAgICBpZignc2hpZnRLZXknIGluIGV2KSB7XG4gICAgICBjaGFuZ2VkID0gY2hhbmdlZCB8fCBldi5zaGlmdEtleSAhPT0gbW9kcy5zaGlmdFxuICAgICAgbW9kcy5zaGlmdCA9ICEhZXYuc2hpZnRLZXlcbiAgICB9XG4gICAgaWYoJ2N0cmxLZXknIGluIGV2KSB7XG4gICAgICBjaGFuZ2VkID0gY2hhbmdlZCB8fCBldi5jdHJsS2V5ICE9PSBtb2RzLmNvbnRyb2xcbiAgICAgIG1vZHMuY29udHJvbCA9ICEhZXYuY3RybEtleVxuICAgIH1cbiAgICBpZignbWV0YUtleScgaW4gZXYpIHtcbiAgICAgIGNoYW5nZWQgPSBjaGFuZ2VkIHx8IGV2Lm1ldGFLZXkgIT09IG1vZHMubWV0YVxuICAgICAgbW9kcy5tZXRhID0gISFldi5tZXRhS2V5XG4gICAgfVxuICAgIHJldHVybiBjaGFuZ2VkXG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVFdmVudChuZXh0QnV0dG9ucywgZXYpIHtcbiAgICB2YXIgbmV4dFggPSBtb3VzZS54KGV2KVxuICAgIHZhciBuZXh0WSA9IG1vdXNlLnkoZXYpXG4gICAgaWYoJ2J1dHRvbnMnIGluIGV2KSB7XG4gICAgICBuZXh0QnV0dG9ucyA9IGV2LmJ1dHRvbnN8MFxuICAgIH1cbiAgICBpZihuZXh0QnV0dG9ucyAhPT0gYnV0dG9uU3RhdGUgfHxcbiAgICAgICBuZXh0WCAhPT0geCB8fFxuICAgICAgIG5leHRZICE9PSB5IHx8XG4gICAgICAgdXBkYXRlTW9kcyhldikpIHtcbiAgICAgIGJ1dHRvblN0YXRlID0gbmV4dEJ1dHRvbnN8MFxuICAgICAgeCA9IG5leHRYfHwwXG4gICAgICB5ID0gbmV4dFl8fDBcbiAgICAgIGNhbGxiYWNrICYmIGNhbGxiYWNrKGJ1dHRvblN0YXRlLCB4LCB5LCBtb2RzKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNsZWFyU3RhdGUoZXYpIHtcbiAgICBoYW5kbGVFdmVudCgwLCBldilcbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZUJsdXIoKSB7XG4gICAgaWYoYnV0dG9uU3RhdGUgfHxcbiAgICAgIHggfHxcbiAgICAgIHkgfHxcbiAgICAgIG1vZHMuc2hpZnQgfHxcbiAgICAgIG1vZHMuYWx0IHx8XG4gICAgICBtb2RzLm1ldGEgfHxcbiAgICAgIG1vZHMuY29udHJvbCkge1xuXG4gICAgICB4ID0geSA9IDBcbiAgICAgIGJ1dHRvblN0YXRlID0gMFxuICAgICAgbW9kcy5zaGlmdCA9IG1vZHMuYWx0ID0gbW9kcy5jb250cm9sID0gbW9kcy5tZXRhID0gZmFsc2VcbiAgICAgIGNhbGxiYWNrICYmIGNhbGxiYWNrKDAsIDAsIDAsIG1vZHMpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaGFuZGxlTW9kcyhldikge1xuICAgIGlmKHVwZGF0ZU1vZHMoZXYpKSB7XG4gICAgICBjYWxsYmFjayAmJiBjYWxsYmFjayhidXR0b25TdGF0ZSwgeCwgeSwgbW9kcylcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVNb3VzZU1vdmUoZXYpIHtcbiAgICBpZihtb3VzZS5idXR0b25zKGV2KSA9PT0gMCkge1xuICAgICAgaGFuZGxlRXZlbnQoMCwgZXYpXG4gICAgfSBlbHNlIHtcbiAgICAgIGhhbmRsZUV2ZW50KGJ1dHRvblN0YXRlLCBldilcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVNb3VzZURvd24oZXYpIHtcbiAgICBoYW5kbGVFdmVudChidXR0b25TdGF0ZSB8IG1vdXNlLmJ1dHRvbnMoZXYpLCBldilcbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZU1vdXNlVXAoZXYpIHtcbiAgICBoYW5kbGVFdmVudChidXR0b25TdGF0ZSAmIH5tb3VzZS5idXR0b25zKGV2KSwgZXYpXG4gIH1cblxuICBmdW5jdGlvbiBhdHRhY2hMaXN0ZW5lcnMoKSB7XG4gICAgaWYoYXR0YWNoZWQpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBhdHRhY2hlZCA9IHRydWVcblxuICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgaGFuZGxlTW91c2VNb3ZlKVxuXG4gICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCBoYW5kbGVNb3VzZURvd24pXG5cbiAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNldXAnLCBoYW5kbGVNb3VzZVVwKVxuXG4gICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWxlYXZlJywgY2xlYXJTdGF0ZSlcbiAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZW50ZXInLCBjbGVhclN0YXRlKVxuICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VvdXQnLCBjbGVhclN0YXRlKVxuICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VvdmVyJywgY2xlYXJTdGF0ZSlcblxuICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignYmx1cicsIGhhbmRsZUJsdXIpXG5cbiAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXVwJywgaGFuZGxlTW9kcylcbiAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBoYW5kbGVNb2RzKVxuICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5cHJlc3MnLCBoYW5kbGVNb2RzKVxuXG4gICAgaWYoZWxlbWVudCAhPT0gd2luZG93KSB7XG4gICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignYmx1cicsIGhhbmRsZUJsdXIpXG5cbiAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXl1cCcsIGhhbmRsZU1vZHMpXG4gICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIGhhbmRsZU1vZHMpXG4gICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5cHJlc3MnLCBoYW5kbGVNb2RzKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGRldGFjaExpc3RlbmVycygpIHtcbiAgICBpZighYXR0YWNoZWQpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBhdHRhY2hlZCA9IGZhbHNlXG5cbiAgICBlbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIGhhbmRsZU1vdXNlTW92ZSlcblxuICAgIGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgaGFuZGxlTW91c2VEb3duKVxuXG4gICAgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZXVwJywgaGFuZGxlTW91c2VVcClcblxuICAgIGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW91c2VsZWF2ZScsIGNsZWFyU3RhdGUpXG4gICAgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZWVudGVyJywgY2xlYXJTdGF0ZSlcbiAgICBlbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNlb3V0JywgY2xlYXJTdGF0ZSlcbiAgICBlbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNlb3ZlcicsIGNsZWFyU3RhdGUpXG5cbiAgICBlbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2JsdXInLCBoYW5kbGVCbHVyKVxuXG4gICAgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdrZXl1cCcsIGhhbmRsZU1vZHMpXG4gICAgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdrZXlkb3duJywgaGFuZGxlTW9kcylcbiAgICBlbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleXByZXNzJywgaGFuZGxlTW9kcylcblxuICAgIGlmKGVsZW1lbnQgIT09IHdpbmRvdykge1xuICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2JsdXInLCBoYW5kbGVCbHVyKVxuXG4gICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigna2V5dXAnLCBoYW5kbGVNb2RzKVxuICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBoYW5kbGVNb2RzKVxuICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleXByZXNzJywgaGFuZGxlTW9kcylcbiAgICB9XG4gIH1cblxuICAvL0F0dGFjaCBsaXN0ZW5lcnNcbiAgYXR0YWNoTGlzdGVuZXJzKClcblxuICB2YXIgcmVzdWx0ID0ge1xuICAgIGVsZW1lbnQ6IGVsZW1lbnRcbiAgfVxuXG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzKHJlc3VsdCwge1xuICAgIGVuYWJsZWQ6IHtcbiAgICAgIGdldDogZnVuY3Rpb24oKSB7IHJldHVybiBhdHRhY2hlZCB9LFxuICAgICAgc2V0OiBmdW5jdGlvbihmKSB7XG4gICAgICAgIGlmKGYpIHtcbiAgICAgICAgICBhdHRhY2hMaXN0ZW5lcnMoKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGRldGFjaExpc3RlbmVyc1xuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgZW51bWVyYWJsZTogdHJ1ZVxuICAgIH0sXG4gICAgYnV0dG9uczoge1xuICAgICAgZ2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIGJ1dHRvblN0YXRlIH0sXG4gICAgICBlbnVtZXJhYmxlOiB0cnVlXG4gICAgfSxcbiAgICB4OiB7XG4gICAgICBnZXQ6IGZ1bmN0aW9uKCkgeyByZXR1cm4geCB9LFxuICAgICAgZW51bWVyYWJsZTogdHJ1ZVxuICAgIH0sXG4gICAgeToge1xuICAgICAgZ2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIHkgfSxcbiAgICAgIGVudW1lcmFibGU6IHRydWVcbiAgICB9LFxuICAgIG1vZHM6IHtcbiAgICAgIGdldDogZnVuY3Rpb24oKSB7IHJldHVybiBtb2RzIH0sXG4gICAgICBlbnVtZXJhYmxlOiB0cnVlXG4gICAgfVxuICB9KVxuXG4gIHJldHVybiByZXN1bHRcbn1cbiIsIid1c2Ugc3RyaWN0J1xuXG5mdW5jdGlvbiBtb3VzZUJ1dHRvbnMoZXYpIHtcbiAgaWYodHlwZW9mIGV2ID09PSAnb2JqZWN0Jykge1xuICAgIGlmKCdidXR0b25zJyBpbiBldikge1xuICAgICAgcmV0dXJuIGV2LmJ1dHRvbnNcbiAgICB9IGVsc2UgaWYoJ3doaWNoJyBpbiBldikge1xuICAgICAgdmFyIGIgPSBldi53aGljaFxuICAgICAgaWYoYiA9PT0gMikge1xuICAgICAgICByZXR1cm4gNFxuICAgICAgfSBlbHNlIGlmKGIgPT09IDMpIHtcbiAgICAgICAgcmV0dXJuIDJcbiAgICAgIH0gZWxzZSBpZihiID4gMCkge1xuICAgICAgICByZXR1cm4gMTw8KGItMSlcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYoJ2J1dHRvbicgaW4gZXYpIHtcbiAgICAgIHZhciBiID0gZXYuYnV0dG9uXG4gICAgICBpZihiID09PSAxKSB7XG4gICAgICAgIHJldHVybiA0XG4gICAgICB9IGVsc2UgaWYoYiA9PT0gMikge1xuICAgICAgICByZXR1cm4gMlxuICAgICAgfSBlbHNlIGlmKGIgPj0gMCkge1xuICAgICAgICByZXR1cm4gMTw8YlxuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gMFxufVxuZXhwb3J0cy5idXR0b25zID0gbW91c2VCdXR0b25zXG5cbmZ1bmN0aW9uIG1vdXNlRWxlbWVudChldikge1xuICByZXR1cm4gZXYudGFyZ2V0IHx8IGV2LnNyY0VsZW1lbnQgfHwgd2luZG93XG59XG5leHBvcnRzLmVsZW1lbnQgPSBtb3VzZUVsZW1lbnRcblxuZnVuY3Rpb24gbW91c2VSZWxhdGl2ZVgoZXYpIHtcbiAgaWYodHlwZW9mIGV2ID09PSAnb2JqZWN0Jykge1xuICAgIGlmKCdvZmZzZXRYJyBpbiBldikge1xuICAgICAgcmV0dXJuIGV2Lm9mZnNldFhcbiAgICB9XG4gICAgdmFyIHRhcmdldCA9IG1vdXNlRWxlbWVudChldilcbiAgICB2YXIgYm91bmRzID0gdGFyZ2V0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpXG4gICAgcmV0dXJuIGV2LmNsaWVudFggLSBib3VuZHMubGVmdFxuICB9XG4gIHJldHVybiAwXG59XG5leHBvcnRzLnggPSBtb3VzZVJlbGF0aXZlWFxuXG5mdW5jdGlvbiBtb3VzZVJlbGF0aXZlWShldikge1xuICBpZih0eXBlb2YgZXYgPT09ICdvYmplY3QnKSB7XG4gICAgaWYoJ29mZnNldFknIGluIGV2KSB7XG4gICAgICByZXR1cm4gZXYub2Zmc2V0WVxuICAgIH1cbiAgICB2YXIgdGFyZ2V0ID0gbW91c2VFbGVtZW50KGV2KVxuICAgIHZhciBib3VuZHMgPSB0YXJnZXQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KClcbiAgICByZXR1cm4gZXYuY2xpZW50WSAtIGJvdW5kcy50b3BcbiAgfVxuICByZXR1cm4gMFxufVxuZXhwb3J0cy55ID0gbW91c2VSZWxhdGl2ZVlcbiIsIlxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vbGliL3V0aWwvZXh0ZW5kJylcbnZhciBkeW5hbWljID0gcmVxdWlyZSgnLi9saWIvZHluYW1pYycpXG52YXIgcmFmID0gcmVxdWlyZSgnLi9saWIvdXRpbC9yYWYnKVxudmFyIGNsb2NrID0gcmVxdWlyZSgnLi9saWIvdXRpbC9jbG9jaycpXG52YXIgY3JlYXRlU3RyaW5nU3RvcmUgPSByZXF1aXJlKCcuL2xpYi9zdHJpbmdzJylcbnZhciBpbml0V2ViR0wgPSByZXF1aXJlKCcuL2xpYi93ZWJnbCcpXG52YXIgd3JhcEV4dGVuc2lvbnMgPSByZXF1aXJlKCcuL2xpYi9leHRlbnNpb24nKVxudmFyIHdyYXBMaW1pdHMgPSByZXF1aXJlKCcuL2xpYi9saW1pdHMnKVxudmFyIHdyYXBCdWZmZXJzID0gcmVxdWlyZSgnLi9saWIvYnVmZmVyJylcbnZhciB3cmFwRWxlbWVudHMgPSByZXF1aXJlKCcuL2xpYi9lbGVtZW50cycpXG52YXIgd3JhcFRleHR1cmVzID0gcmVxdWlyZSgnLi9saWIvdGV4dHVyZScpXG52YXIgd3JhcFJlbmRlcmJ1ZmZlcnMgPSByZXF1aXJlKCcuL2xpYi9yZW5kZXJidWZmZXInKVxudmFyIHdyYXBGcmFtZWJ1ZmZlcnMgPSByZXF1aXJlKCcuL2xpYi9mcmFtZWJ1ZmZlcicpXG52YXIgd3JhcEF0dHJpYnV0ZXMgPSByZXF1aXJlKCcuL2xpYi9hdHRyaWJ1dGUnKVxudmFyIHdyYXBTaGFkZXJzID0gcmVxdWlyZSgnLi9saWIvc2hhZGVyJylcbnZhciB3cmFwUmVhZCA9IHJlcXVpcmUoJy4vbGliL3JlYWQnKVxudmFyIGNyZWF0ZUNvcmUgPSByZXF1aXJlKCcuL2xpYi9jb3JlJylcbnZhciBjcmVhdGVTdGF0cyA9IHJlcXVpcmUoJy4vbGliL3N0YXRzJylcbnZhciBjcmVhdGVUaW1lciA9IHJlcXVpcmUoJy4vbGliL3RpbWVyJylcblxudmFyIEdMX0NPTE9SX0JVRkZFUl9CSVQgPSAxNjM4NFxudmFyIEdMX0RFUFRIX0JVRkZFUl9CSVQgPSAyNTZcbnZhciBHTF9TVEVOQ0lMX0JVRkZFUl9CSVQgPSAxMDI0XG5cbnZhciBHTF9BUlJBWV9CVUZGRVIgPSAzNDk2MlxuXG52YXIgQ09OVEVYVF9MT1NUX0VWRU5UID0gJ3dlYmdsY29udGV4dGxvc3QnXG52YXIgQ09OVEVYVF9SRVNUT1JFRF9FVkVOVCA9ICd3ZWJnbGNvbnRleHRyZXN0b3JlZCdcblxudmFyIERZTl9QUk9QID0gMVxudmFyIERZTl9DT05URVhUID0gMlxudmFyIERZTl9TVEFURSA9IDNcblxuZnVuY3Rpb24gZmluZCAoaGF5c3RhY2ssIG5lZWRsZSkge1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGhheXN0YWNrLmxlbmd0aDsgKytpKSB7XG4gICAgaWYgKGhheXN0YWNrW2ldID09PSBuZWVkbGUpIHtcbiAgICAgIHJldHVybiBpXG4gICAgfVxuICB9XG4gIHJldHVybiAtMVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBSRUdMIChhcmdzKSB7XG4gIHZhciBjb25maWcgPSBpbml0V2ViR0woYXJncylcbiAgaWYgKCFjb25maWcpIHtcbiAgICByZXR1cm4gbnVsbFxuICB9XG5cbiAgdmFyIGdsID0gY29uZmlnLmdsXG4gIHZhciBnbEF0dHJpYnV0ZXMgPSBnbC5nZXRDb250ZXh0QXR0cmlidXRlcygpXG4gIHZhciBjb250ZXh0TG9zdCA9IGdsLmlzQ29udGV4dExvc3QoKVxuXG4gIHZhciBleHRlbnNpb25TdGF0ZSA9IHdyYXBFeHRlbnNpb25zKGdsLCBjb25maWcpXG4gIGlmICghZXh0ZW5zaW9uU3RhdGUpIHtcbiAgICByZXR1cm4gbnVsbFxuICB9XG5cbiAgdmFyIHN0cmluZ1N0b3JlID0gY3JlYXRlU3RyaW5nU3RvcmUoKVxuICB2YXIgc3RhdHMgPSBjcmVhdGVTdGF0cygpXG4gIHZhciBleHRlbnNpb25zID0gZXh0ZW5zaW9uU3RhdGUuZXh0ZW5zaW9uc1xuICB2YXIgdGltZXIgPSBjcmVhdGVUaW1lcihnbCwgZXh0ZW5zaW9ucylcblxuICB2YXIgU1RBUlRfVElNRSA9IGNsb2NrKClcbiAgdmFyIFdJRFRIID0gZ2wuZHJhd2luZ0J1ZmZlcldpZHRoXG4gIHZhciBIRUlHSFQgPSBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0XG5cbiAgdmFyIGNvbnRleHRTdGF0ZSA9IHtcbiAgICB0aWNrOiAwLFxuICAgIHRpbWU6IDAsXG4gICAgdmlld3BvcnRXaWR0aDogV0lEVEgsXG4gICAgdmlld3BvcnRIZWlnaHQ6IEhFSUdIVCxcbiAgICBmcmFtZWJ1ZmZlcldpZHRoOiBXSURUSCxcbiAgICBmcmFtZWJ1ZmZlckhlaWdodDogSEVJR0hULFxuICAgIGRyYXdpbmdCdWZmZXJXaWR0aDogV0lEVEgsXG4gICAgZHJhd2luZ0J1ZmZlckhlaWdodDogSEVJR0hULFxuICAgIHBpeGVsUmF0aW86IGNvbmZpZy5waXhlbFJhdGlvXG4gIH1cbiAgdmFyIHVuaWZvcm1TdGF0ZSA9IHt9XG4gIHZhciBkcmF3U3RhdGUgPSB7XG4gICAgZWxlbWVudHM6IG51bGwsXG4gICAgcHJpbWl0aXZlOiA0LCAvLyBHTF9UUklBTkdMRVNcbiAgICBjb3VudDogLTEsXG4gICAgb2Zmc2V0OiAwLFxuICAgIGluc3RhbmNlczogLTFcbiAgfVxuXG4gIHZhciBsaW1pdHMgPSB3cmFwTGltaXRzKGdsLCBleHRlbnNpb25zKVxuICB2YXIgYnVmZmVyU3RhdGUgPSB3cmFwQnVmZmVycyhnbCwgc3RhdHMsIGNvbmZpZylcbiAgdmFyIGVsZW1lbnRTdGF0ZSA9IHdyYXBFbGVtZW50cyhnbCwgZXh0ZW5zaW9ucywgYnVmZmVyU3RhdGUsIHN0YXRzKVxuICB2YXIgYXR0cmlidXRlU3RhdGUgPSB3cmFwQXR0cmlidXRlcyhcbiAgICBnbCxcbiAgICBleHRlbnNpb25zLFxuICAgIGxpbWl0cyxcbiAgICBidWZmZXJTdGF0ZSxcbiAgICBzdHJpbmdTdG9yZSlcbiAgdmFyIHNoYWRlclN0YXRlID0gd3JhcFNoYWRlcnMoZ2wsIHN0cmluZ1N0b3JlLCBzdGF0cywgY29uZmlnKVxuICB2YXIgdGV4dHVyZVN0YXRlID0gd3JhcFRleHR1cmVzKFxuICAgIGdsLFxuICAgIGV4dGVuc2lvbnMsXG4gICAgbGltaXRzLFxuICAgIGZ1bmN0aW9uICgpIHsgY29yZS5wcm9jcy5wb2xsKCkgfSxcbiAgICBjb250ZXh0U3RhdGUsXG4gICAgc3RhdHMsXG4gICAgY29uZmlnKVxuICB2YXIgcmVuZGVyYnVmZmVyU3RhdGUgPSB3cmFwUmVuZGVyYnVmZmVycyhnbCwgZXh0ZW5zaW9ucywgbGltaXRzLCBzdGF0cywgY29uZmlnKVxuICB2YXIgZnJhbWVidWZmZXJTdGF0ZSA9IHdyYXBGcmFtZWJ1ZmZlcnMoXG4gICAgZ2wsXG4gICAgZXh0ZW5zaW9ucyxcbiAgICBsaW1pdHMsXG4gICAgdGV4dHVyZVN0YXRlLFxuICAgIHJlbmRlcmJ1ZmZlclN0YXRlLFxuICAgIHN0YXRzKVxuICB2YXIgY29yZSA9IGNyZWF0ZUNvcmUoXG4gICAgZ2wsXG4gICAgc3RyaW5nU3RvcmUsXG4gICAgZXh0ZW5zaW9ucyxcbiAgICBsaW1pdHMsXG4gICAgYnVmZmVyU3RhdGUsXG4gICAgZWxlbWVudFN0YXRlLFxuICAgIHRleHR1cmVTdGF0ZSxcbiAgICBmcmFtZWJ1ZmZlclN0YXRlLFxuICAgIHVuaWZvcm1TdGF0ZSxcbiAgICBhdHRyaWJ1dGVTdGF0ZSxcbiAgICBzaGFkZXJTdGF0ZSxcbiAgICBkcmF3U3RhdGUsXG4gICAgY29udGV4dFN0YXRlLFxuICAgIHRpbWVyLFxuICAgIGNvbmZpZylcbiAgdmFyIHJlYWRQaXhlbHMgPSB3cmFwUmVhZChcbiAgICBnbCxcbiAgICBmcmFtZWJ1ZmZlclN0YXRlLFxuICAgIGNvcmUucHJvY3MucG9sbCxcbiAgICBjb250ZXh0U3RhdGUsXG4gICAgZ2xBdHRyaWJ1dGVzLCBleHRlbnNpb25zKVxuXG4gIHZhciBuZXh0U3RhdGUgPSBjb3JlLm5leHRcbiAgdmFyIGNhbnZhcyA9IGdsLmNhbnZhc1xuXG4gIHZhciByYWZDYWxsYmFja3MgPSBbXVxuICB2YXIgbG9zc0NhbGxiYWNrcyA9IFtdXG4gIHZhciByZXN0b3JlQ2FsbGJhY2tzID0gW11cbiAgdmFyIGRlc3Ryb3lDYWxsYmFja3MgPSBbY29uZmlnLm9uRGVzdHJveV1cblxuICB2YXIgYWN0aXZlUkFGID0gbnVsbFxuICBmdW5jdGlvbiBoYW5kbGVSQUYgKCkge1xuICAgIGlmIChyYWZDYWxsYmFja3MubGVuZ3RoID09PSAwKSB7XG4gICAgICBpZiAodGltZXIpIHtcbiAgICAgICAgdGltZXIudXBkYXRlKClcbiAgICAgIH1cbiAgICAgIGFjdGl2ZVJBRiA9IG51bGxcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIC8vIHNjaGVkdWxlIG5leHQgYW5pbWF0aW9uIGZyYW1lXG4gICAgYWN0aXZlUkFGID0gcmFmLm5leHQoaGFuZGxlUkFGKVxuXG4gICAgLy8gcG9sbCBmb3IgY2hhbmdlc1xuICAgIHBvbGwoKVxuXG4gICAgLy8gZmlyZSBhIGNhbGxiYWNrIGZvciBhbGwgcGVuZGluZyByYWZzXG4gICAgZm9yICh2YXIgaSA9IHJhZkNhbGxiYWNrcy5sZW5ndGggLSAxOyBpID49IDA7IC0taSkge1xuICAgICAgdmFyIGNiID0gcmFmQ2FsbGJhY2tzW2ldXG4gICAgICBpZiAoY2IpIHtcbiAgICAgICAgY2IoY29udGV4dFN0YXRlLCBudWxsLCAwKVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIGZsdXNoIGFsbCBwZW5kaW5nIHdlYmdsIGNhbGxzXG4gICAgZ2wuZmx1c2goKVxuXG4gICAgLy8gcG9sbCBHUFUgdGltZXJzICphZnRlciogZ2wuZmx1c2ggc28gd2UgZG9uJ3QgZGVsYXkgY29tbWFuZCBkaXNwYXRjaFxuICAgIGlmICh0aW1lcikge1xuICAgICAgdGltZXIudXBkYXRlKClcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzdGFydFJBRiAoKSB7XG4gICAgaWYgKCFhY3RpdmVSQUYgJiYgcmFmQ2FsbGJhY2tzLmxlbmd0aCA+IDApIHtcbiAgICAgIGFjdGl2ZVJBRiA9IHJhZi5uZXh0KGhhbmRsZVJBRilcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzdG9wUkFGICgpIHtcbiAgICBpZiAoYWN0aXZlUkFGKSB7XG4gICAgICByYWYuY2FuY2VsKGhhbmRsZVJBRilcbiAgICAgIGFjdGl2ZVJBRiA9IG51bGxcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVDb250ZXh0TG9zcyAoZXZlbnQpIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpXG5cbiAgICAvLyBzZXQgY29udGV4dCBsb3N0IGZsYWdcbiAgICBjb250ZXh0TG9zdCA9IHRydWVcblxuICAgIC8vIHBhdXNlIHJlcXVlc3QgYW5pbWF0aW9uIGZyYW1lXG4gICAgc3RvcFJBRigpXG5cbiAgICAvLyBsb3NlIGNvbnRleHRcbiAgICBsb3NzQ2FsbGJhY2tzLmZvckVhY2goZnVuY3Rpb24gKGNiKSB7XG4gICAgICBjYigpXG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZUNvbnRleHRSZXN0b3JlZCAoZXZlbnQpIHtcbiAgICAvLyBjbGVhciBlcnJvciBjb2RlXG4gICAgZ2wuZ2V0RXJyb3IoKVxuXG4gICAgLy8gY2xlYXIgY29udGV4dCBsb3N0IGZsYWdcbiAgICBjb250ZXh0TG9zdCA9IGZhbHNlXG5cbiAgICAvLyByZWZyZXNoIHN0YXRlXG4gICAgZXh0ZW5zaW9uU3RhdGUucmVzdG9yZSgpXG4gICAgc2hhZGVyU3RhdGUucmVzdG9yZSgpXG4gICAgYnVmZmVyU3RhdGUucmVzdG9yZSgpXG4gICAgdGV4dHVyZVN0YXRlLnJlc3RvcmUoKVxuICAgIHJlbmRlcmJ1ZmZlclN0YXRlLnJlc3RvcmUoKVxuICAgIGZyYW1lYnVmZmVyU3RhdGUucmVzdG9yZSgpXG4gICAgaWYgKHRpbWVyKSB7XG4gICAgICB0aW1lci5yZXN0b3JlKClcbiAgICB9XG5cbiAgICAvLyByZWZyZXNoIHN0YXRlXG4gICAgY29yZS5wcm9jcy5yZWZyZXNoKClcblxuICAgIC8vIHJlc3RhcnQgUkFGXG4gICAgc3RhcnRSQUYoKVxuXG4gICAgLy8gcmVzdG9yZSBjb250ZXh0XG4gICAgcmVzdG9yZUNhbGxiYWNrcy5mb3JFYWNoKGZ1bmN0aW9uIChjYikge1xuICAgICAgY2IoKVxuICAgIH0pXG4gIH1cblxuICBpZiAoY2FudmFzKSB7XG4gICAgY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoQ09OVEVYVF9MT1NUX0VWRU5ULCBoYW5kbGVDb250ZXh0TG9zcywgZmFsc2UpXG4gICAgY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoQ09OVEVYVF9SRVNUT1JFRF9FVkVOVCwgaGFuZGxlQ29udGV4dFJlc3RvcmVkLCBmYWxzZSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3kgKCkge1xuICAgIHJhZkNhbGxiYWNrcy5sZW5ndGggPSAwXG4gICAgc3RvcFJBRigpXG5cbiAgICBpZiAoY2FudmFzKSB7XG4gICAgICBjYW52YXMucmVtb3ZlRXZlbnRMaXN0ZW5lcihDT05URVhUX0xPU1RfRVZFTlQsIGhhbmRsZUNvbnRleHRMb3NzKVxuICAgICAgY2FudmFzLnJlbW92ZUV2ZW50TGlzdGVuZXIoQ09OVEVYVF9SRVNUT1JFRF9FVkVOVCwgaGFuZGxlQ29udGV4dFJlc3RvcmVkKVxuICAgIH1cblxuICAgIHNoYWRlclN0YXRlLmNsZWFyKClcbiAgICBmcmFtZWJ1ZmZlclN0YXRlLmNsZWFyKClcbiAgICByZW5kZXJidWZmZXJTdGF0ZS5jbGVhcigpXG4gICAgdGV4dHVyZVN0YXRlLmNsZWFyKClcbiAgICBlbGVtZW50U3RhdGUuY2xlYXIoKVxuICAgIGJ1ZmZlclN0YXRlLmNsZWFyKClcblxuICAgIGlmICh0aW1lcikge1xuICAgICAgdGltZXIuY2xlYXIoKVxuICAgIH1cblxuICAgIGRlc3Ryb3lDYWxsYmFja3MuZm9yRWFjaChmdW5jdGlvbiAoY2IpIHtcbiAgICAgIGNiKClcbiAgICB9KVxuICB9XG5cbiAgZnVuY3Rpb24gY29tcGlsZVByb2NlZHVyZSAob3B0aW9ucykge1xuICAgIFxuICAgIFxuXG4gICAgZnVuY3Rpb24gZmxhdHRlbk5lc3RlZE9wdGlvbnMgKG9wdGlvbnMpIHtcbiAgICAgIHZhciByZXN1bHQgPSBleHRlbmQoe30sIG9wdGlvbnMpXG4gICAgICBkZWxldGUgcmVzdWx0LnVuaWZvcm1zXG4gICAgICBkZWxldGUgcmVzdWx0LmF0dHJpYnV0ZXNcbiAgICAgIGRlbGV0ZSByZXN1bHQuY29udGV4dFxuXG4gICAgICBpZiAoJ3N0ZW5jaWwnIGluIHJlc3VsdCAmJiByZXN1bHQuc3RlbmNpbC5vcCkge1xuICAgICAgICByZXN1bHQuc3RlbmNpbC5vcEJhY2sgPSByZXN1bHQuc3RlbmNpbC5vcEZyb250ID0gcmVzdWx0LnN0ZW5jaWwub3BcbiAgICAgICAgZGVsZXRlIHJlc3VsdC5zdGVuY2lsLm9wXG4gICAgICB9XG5cbiAgICAgIGZ1bmN0aW9uIG1lcmdlIChuYW1lKSB7XG4gICAgICAgIGlmIChuYW1lIGluIHJlc3VsdCkge1xuICAgICAgICAgIHZhciBjaGlsZCA9IHJlc3VsdFtuYW1lXVxuICAgICAgICAgIGRlbGV0ZSByZXN1bHRbbmFtZV1cbiAgICAgICAgICBPYmplY3Qua2V5cyhjaGlsZCkuZm9yRWFjaChmdW5jdGlvbiAocHJvcCkge1xuICAgICAgICAgICAgcmVzdWx0W25hbWUgKyAnLicgKyBwcm9wXSA9IGNoaWxkW3Byb3BdXG4gICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgbWVyZ2UoJ2JsZW5kJylcbiAgICAgIG1lcmdlKCdkZXB0aCcpXG4gICAgICBtZXJnZSgnY3VsbCcpXG4gICAgICBtZXJnZSgnc3RlbmNpbCcpXG4gICAgICBtZXJnZSgncG9seWdvbk9mZnNldCcpXG4gICAgICBtZXJnZSgnc2Npc3NvcicpXG4gICAgICBtZXJnZSgnc2FtcGxlJylcblxuICAgICAgcmV0dXJuIHJlc3VsdFxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHNlcGFyYXRlRHluYW1pYyAob2JqZWN0KSB7XG4gICAgICB2YXIgc3RhdGljSXRlbXMgPSB7fVxuICAgICAgdmFyIGR5bmFtaWNJdGVtcyA9IHt9XG4gICAgICBPYmplY3Qua2V5cyhvYmplY3QpLmZvckVhY2goZnVuY3Rpb24gKG9wdGlvbikge1xuICAgICAgICB2YXIgdmFsdWUgPSBvYmplY3Rbb3B0aW9uXVxuICAgICAgICBpZiAoZHluYW1pYy5pc0R5bmFtaWModmFsdWUpKSB7XG4gICAgICAgICAgZHluYW1pY0l0ZW1zW29wdGlvbl0gPSBkeW5hbWljLnVuYm94KHZhbHVlLCBvcHRpb24pXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc3RhdGljSXRlbXNbb3B0aW9uXSA9IHZhbHVlXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICByZXR1cm4ge1xuICAgICAgICBkeW5hbWljOiBkeW5hbWljSXRlbXMsXG4gICAgICAgIHN0YXRpYzogc3RhdGljSXRlbXNcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBUcmVhdCBjb250ZXh0IHZhcmlhYmxlcyBzZXBhcmF0ZSBmcm9tIG90aGVyIGR5bmFtaWMgdmFyaWFibGVzXG4gICAgdmFyIGNvbnRleHQgPSBzZXBhcmF0ZUR5bmFtaWMob3B0aW9ucy5jb250ZXh0IHx8IHt9KVxuICAgIHZhciB1bmlmb3JtcyA9IHNlcGFyYXRlRHluYW1pYyhvcHRpb25zLnVuaWZvcm1zIHx8IHt9KVxuICAgIHZhciBhdHRyaWJ1dGVzID0gc2VwYXJhdGVEeW5hbWljKG9wdGlvbnMuYXR0cmlidXRlcyB8fCB7fSlcbiAgICB2YXIgb3B0cyA9IHNlcGFyYXRlRHluYW1pYyhmbGF0dGVuTmVzdGVkT3B0aW9ucyhvcHRpb25zKSlcblxuICAgIHZhciBzdGF0cyA9IHtcbiAgICAgIGdwdVRpbWU6IDAuMCxcbiAgICAgIGNwdVRpbWU6IDAuMCxcbiAgICAgIGNvdW50OiAwXG4gICAgfVxuXG4gICAgdmFyIGNvbXBpbGVkID0gY29yZS5jb21waWxlKG9wdHMsIGF0dHJpYnV0ZXMsIHVuaWZvcm1zLCBjb250ZXh0LCBzdGF0cylcblxuICAgIHZhciBkcmF3ID0gY29tcGlsZWQuZHJhd1xuICAgIHZhciBiYXRjaCA9IGNvbXBpbGVkLmJhdGNoXG4gICAgdmFyIHNjb3BlID0gY29tcGlsZWQuc2NvcGVcblxuICAgIC8vIEZJWE1FOiB3ZSBzaG91bGQgbW9kaWZ5IGNvZGUgZ2VuZXJhdGlvbiBmb3IgYmF0Y2ggY29tbWFuZHMgc28gdGhpc1xuICAgIC8vIGlzbid0IG5lY2Vzc2FyeVxuICAgIHZhciBFTVBUWV9BUlJBWSA9IFtdXG4gICAgZnVuY3Rpb24gcmVzZXJ2ZSAoY291bnQpIHtcbiAgICAgIHdoaWxlIChFTVBUWV9BUlJBWS5sZW5ndGggPCBjb3VudCkge1xuICAgICAgICBFTVBUWV9BUlJBWS5wdXNoKG51bGwpXG4gICAgICB9XG4gICAgICByZXR1cm4gRU1QVFlfQVJSQVlcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBSRUdMQ29tbWFuZCAoYXJncywgYm9keSkge1xuICAgICAgdmFyIGlcbiAgICAgIGlmIChjb250ZXh0TG9zdCkge1xuICAgICAgICBcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlb2YgYXJncyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICByZXR1cm4gc2NvcGUuY2FsbCh0aGlzLCBudWxsLCBhcmdzLCAwKVxuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgYm9keSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBpZiAodHlwZW9mIGFyZ3MgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgZm9yIChpID0gMDsgaSA8IGFyZ3M7ICsraSkge1xuICAgICAgICAgICAgc2NvcGUuY2FsbCh0aGlzLCBudWxsLCBib2R5LCBpKVxuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGFyZ3MpKSB7XG4gICAgICAgICAgZm9yIChpID0gMDsgaSA8IGFyZ3MubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICAgIHNjb3BlLmNhbGwodGhpcywgYXJnc1tpXSwgYm9keSwgaSlcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIHNjb3BlLmNhbGwodGhpcywgYXJncywgYm9keSwgMClcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgYXJncyA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgaWYgKGFyZ3MgPiAwKSB7XG4gICAgICAgICAgcmV0dXJuIGJhdGNoLmNhbGwodGhpcywgcmVzZXJ2ZShhcmdzIHwgMCksIGFyZ3MgfCAwKVxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoYXJncykpIHtcbiAgICAgICAgaWYgKGFyZ3MubGVuZ3RoKSB7XG4gICAgICAgICAgcmV0dXJuIGJhdGNoLmNhbGwodGhpcywgYXJncywgYXJncy5sZW5ndGgpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBkcmF3LmNhbGwodGhpcywgYXJncylcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gZXh0ZW5kKFJFR0xDb21tYW5kLCB7XG4gICAgICBzdGF0czogc3RhdHNcbiAgICB9KVxuICB9XG5cbiAgZnVuY3Rpb24gY2xlYXIgKG9wdGlvbnMpIHtcbiAgICBcblxuICAgIHZhciBjbGVhckZsYWdzID0gMFxuICAgIGNvcmUucHJvY3MucG9sbCgpXG5cbiAgICB2YXIgYyA9IG9wdGlvbnMuY29sb3JcbiAgICBpZiAoYykge1xuICAgICAgZ2wuY2xlYXJDb2xvcigrY1swXSB8fCAwLCArY1sxXSB8fCAwLCArY1syXSB8fCAwLCArY1szXSB8fCAwKVxuICAgICAgY2xlYXJGbGFncyB8PSBHTF9DT0xPUl9CVUZGRVJfQklUXG4gICAgfVxuICAgIGlmICgnZGVwdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgIGdsLmNsZWFyRGVwdGgoK29wdGlvbnMuZGVwdGgpXG4gICAgICBjbGVhckZsYWdzIHw9IEdMX0RFUFRIX0JVRkZFUl9CSVRcbiAgICB9XG4gICAgaWYgKCdzdGVuY2lsJyBpbiBvcHRpb25zKSB7XG4gICAgICBnbC5jbGVhclN0ZW5jaWwob3B0aW9ucy5zdGVuY2lsIHwgMClcbiAgICAgIGNsZWFyRmxhZ3MgfD0gR0xfU1RFTkNJTF9CVUZGRVJfQklUXG4gICAgfVxuXG4gICAgXG4gICAgZ2wuY2xlYXIoY2xlYXJGbGFncylcbiAgfVxuXG4gIGZ1bmN0aW9uIGZyYW1lIChjYikge1xuICAgIFxuICAgIHJhZkNhbGxiYWNrcy5wdXNoKGNiKVxuXG4gICAgZnVuY3Rpb24gY2FuY2VsICgpIHtcbiAgICAgIC8vIEZJWE1FOiAgc2hvdWxkIHdlIGNoZWNrIHNvbWV0aGluZyBvdGhlciB0aGFuIGVxdWFscyBjYiBoZXJlP1xuICAgICAgLy8gd2hhdCBpZiBhIHVzZXIgY2FsbHMgZnJhbWUgdHdpY2Ugd2l0aCB0aGUgc2FtZSBjYWxsYmFjay4uLlxuICAgICAgLy9cbiAgICAgIHZhciBpID0gZmluZChyYWZDYWxsYmFja3MsIGNiKVxuICAgICAgXG4gICAgICBmdW5jdGlvbiBwZW5kaW5nQ2FuY2VsICgpIHtcbiAgICAgICAgdmFyIGluZGV4ID0gZmluZChyYWZDYWxsYmFja3MsIHBlbmRpbmdDYW5jZWwpXG4gICAgICAgIHJhZkNhbGxiYWNrc1tpbmRleF0gPSByYWZDYWxsYmFja3NbcmFmQ2FsbGJhY2tzLmxlbmd0aCAtIDFdXG4gICAgICAgIHJhZkNhbGxiYWNrcy5sZW5ndGggLT0gMVxuICAgICAgICBpZiAocmFmQ2FsbGJhY2tzLmxlbmd0aCA8PSAwKSB7XG4gICAgICAgICAgc3RvcFJBRigpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJhZkNhbGxiYWNrc1tpXSA9IHBlbmRpbmdDYW5jZWxcbiAgICB9XG5cbiAgICBzdGFydFJBRigpXG5cbiAgICByZXR1cm4ge1xuICAgICAgY2FuY2VsOiBjYW5jZWxcbiAgICB9XG4gIH1cblxuICAvLyBwb2xsIHZpZXdwb3J0XG4gIGZ1bmN0aW9uIHBvbGxWaWV3cG9ydCAoKSB7XG4gICAgdmFyIHZpZXdwb3J0ID0gbmV4dFN0YXRlLnZpZXdwb3J0XG4gICAgdmFyIHNjaXNzb3JCb3ggPSBuZXh0U3RhdGUuc2Npc3Nvcl9ib3hcbiAgICB2aWV3cG9ydFswXSA9IHZpZXdwb3J0WzFdID0gc2Npc3NvckJveFswXSA9IHNjaXNzb3JCb3hbMV0gPSAwXG4gICAgY29udGV4dFN0YXRlLnZpZXdwb3J0V2lkdGggPVxuICAgICAgY29udGV4dFN0YXRlLmZyYW1lYnVmZmVyV2lkdGggPVxuICAgICAgY29udGV4dFN0YXRlLmRyYXdpbmdCdWZmZXJXaWR0aCA9XG4gICAgICB2aWV3cG9ydFsyXSA9XG4gICAgICBzY2lzc29yQm94WzJdID0gZ2wuZHJhd2luZ0J1ZmZlcldpZHRoXG4gICAgY29udGV4dFN0YXRlLnZpZXdwb3J0SGVpZ2h0ID1cbiAgICAgIGNvbnRleHRTdGF0ZS5mcmFtZWJ1ZmZlckhlaWdodCA9XG4gICAgICBjb250ZXh0U3RhdGUuZHJhd2luZ0J1ZmZlckhlaWdodCA9XG4gICAgICB2aWV3cG9ydFszXSA9XG4gICAgICBzY2lzc29yQm94WzNdID0gZ2wuZHJhd2luZ0J1ZmZlckhlaWdodFxuICB9XG5cbiAgZnVuY3Rpb24gcG9sbCAoKSB7XG4gICAgY29udGV4dFN0YXRlLnRpY2sgKz0gMVxuICAgIGNvbnRleHRTdGF0ZS50aW1lID0gbm93KClcbiAgICBwb2xsVmlld3BvcnQoKVxuICAgIGNvcmUucHJvY3MucG9sbCgpXG4gIH1cblxuICBmdW5jdGlvbiByZWZyZXNoICgpIHtcbiAgICBwb2xsVmlld3BvcnQoKVxuICAgIGNvcmUucHJvY3MucmVmcmVzaCgpXG4gICAgaWYgKHRpbWVyKSB7XG4gICAgICB0aW1lci51cGRhdGUoKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIG5vdyAoKSB7XG4gICAgcmV0dXJuIChjbG9jaygpIC0gU1RBUlRfVElNRSkgLyAxMDAwLjBcbiAgfVxuXG4gIHJlZnJlc2goKVxuXG4gIGZ1bmN0aW9uIGFkZExpc3RlbmVyIChldmVudCwgY2FsbGJhY2spIHtcbiAgICBcblxuICAgIHZhciBjYWxsYmFja3NcbiAgICBzd2l0Y2ggKGV2ZW50KSB7XG4gICAgICBjYXNlICdmcmFtZSc6XG4gICAgICAgIHJldHVybiBmcmFtZShjYWxsYmFjaylcbiAgICAgIGNhc2UgJ2xvc3QnOlxuICAgICAgICBjYWxsYmFja3MgPSBsb3NzQ2FsbGJhY2tzXG4gICAgICAgIGJyZWFrXG4gICAgICBjYXNlICdyZXN0b3JlJzpcbiAgICAgICAgY2FsbGJhY2tzID0gcmVzdG9yZUNhbGxiYWNrc1xuICAgICAgICBicmVha1xuICAgICAgY2FzZSAnZGVzdHJveSc6XG4gICAgICAgIGNhbGxiYWNrcyA9IGRlc3Ryb3lDYWxsYmFja3NcbiAgICAgICAgYnJlYWtcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIFxuICAgIH1cblxuICAgIGNhbGxiYWNrcy5wdXNoKGNhbGxiYWNrKVxuICAgIHJldHVybiB7XG4gICAgICBjYW5jZWw6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjYWxsYmFja3MubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICBpZiAoY2FsbGJhY2tzW2ldID09PSBjYWxsYmFjaykge1xuICAgICAgICAgICAgY2FsbGJhY2tzW2ldID0gY2FsbGJhY2tzW2NhbGxiYWNrcy5sZW5ndGggLSAxXVxuICAgICAgICAgICAgY2FsbGJhY2tzLnBvcCgpXG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICB2YXIgcmVnbCA9IGV4dGVuZChjb21waWxlUHJvY2VkdXJlLCB7XG4gICAgLy8gQ2xlYXIgY3VycmVudCBGQk9cbiAgICBjbGVhcjogY2xlYXIsXG5cbiAgICAvLyBTaG9ydCBjdXRzIGZvciBkeW5hbWljIHZhcmlhYmxlc1xuICAgIHByb3A6IGR5bmFtaWMuZGVmaW5lLmJpbmQobnVsbCwgRFlOX1BST1ApLFxuICAgIGNvbnRleHQ6IGR5bmFtaWMuZGVmaW5lLmJpbmQobnVsbCwgRFlOX0NPTlRFWFQpLFxuICAgIHRoaXM6IGR5bmFtaWMuZGVmaW5lLmJpbmQobnVsbCwgRFlOX1NUQVRFKSxcblxuICAgIC8vIGV4ZWN1dGVzIGFuIGVtcHR5IGRyYXcgY29tbWFuZFxuICAgIGRyYXc6IGNvbXBpbGVQcm9jZWR1cmUoe30pLFxuXG4gICAgLy8gUmVzb3VyY2VzXG4gICAgYnVmZmVyOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgcmV0dXJuIGJ1ZmZlclN0YXRlLmNyZWF0ZShvcHRpb25zLCBHTF9BUlJBWV9CVUZGRVIsIGZhbHNlLCBmYWxzZSlcbiAgICB9LFxuICAgIGVsZW1lbnRzOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgcmV0dXJuIGVsZW1lbnRTdGF0ZS5jcmVhdGUob3B0aW9ucywgZmFsc2UpXG4gICAgfSxcbiAgICB0ZXh0dXJlOiB0ZXh0dXJlU3RhdGUuY3JlYXRlMkQsXG4gICAgY3ViZTogdGV4dHVyZVN0YXRlLmNyZWF0ZUN1YmUsXG4gICAgcmVuZGVyYnVmZmVyOiByZW5kZXJidWZmZXJTdGF0ZS5jcmVhdGUsXG4gICAgZnJhbWVidWZmZXI6IGZyYW1lYnVmZmVyU3RhdGUuY3JlYXRlLFxuICAgIGZyYW1lYnVmZmVyQ3ViZTogZnJhbWVidWZmZXJTdGF0ZS5jcmVhdGVDdWJlLFxuXG4gICAgLy8gRXhwb3NlIGNvbnRleHQgYXR0cmlidXRlc1xuICAgIGF0dHJpYnV0ZXM6IGdsQXR0cmlidXRlcyxcblxuICAgIC8vIEZyYW1lIHJlbmRlcmluZ1xuICAgIGZyYW1lOiBmcmFtZSxcbiAgICBvbjogYWRkTGlzdGVuZXIsXG5cbiAgICAvLyBTeXN0ZW0gbGltaXRzXG4gICAgbGltaXRzOiBsaW1pdHMsXG4gICAgaGFzRXh0ZW5zaW9uOiBmdW5jdGlvbiAobmFtZSkge1xuICAgICAgcmV0dXJuIGxpbWl0cy5leHRlbnNpb25zLmluZGV4T2YobmFtZS50b0xvd2VyQ2FzZSgpKSA+PSAwXG4gICAgfSxcblxuICAgIC8vIFJlYWQgcGl4ZWxzXG4gICAgcmVhZDogcmVhZFBpeGVscyxcblxuICAgIC8vIERlc3Ryb3kgcmVnbCBhbmQgYWxsIGFzc29jaWF0ZWQgcmVzb3VyY2VzXG4gICAgZGVzdHJveTogZGVzdHJveSxcblxuICAgIC8vIERpcmVjdCBHTCBzdGF0ZSBtYW5pcHVsYXRpb25cbiAgICBfZ2w6IGdsLFxuICAgIF9yZWZyZXNoOiByZWZyZXNoLFxuXG4gICAgcG9sbDogZnVuY3Rpb24gKCkge1xuICAgICAgcG9sbCgpXG4gICAgICBpZiAodGltZXIpIHtcbiAgICAgICAgdGltZXIudXBkYXRlKClcbiAgICAgIH1cbiAgICB9LFxuXG4gICAgLy8gQ3VycmVudCB0aW1lXG4gICAgbm93OiBub3csXG5cbiAgICAvLyByZWdsIFN0YXRpc3RpY3MgSW5mb3JtYXRpb25cbiAgICBzdGF0czogc3RhdHNcbiAgfSlcblxuICBjb25maWcub25Eb25lKG51bGwsIHJlZ2wpXG5cbiAgcmV0dXJuIHJlZ2xcbn1cbiJdfQ==
