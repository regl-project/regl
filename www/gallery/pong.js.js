(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*
  tags: basic, game

  <p> In this example, we implement a simple pong game. </p>

  <p> The demonstratred features are: batching, and how you can
 implement a game loop with regl. </p>

 <p> Note that the ball will probably go through the paddles
 once it goes really fast. So the game could be a lot more stable.
 But in order to keep the example short and readable,
 we have refrained from fixing this.
 </p>
*/
/* global AudioContext */

var regl = require('../regl')();
var vec2 = require('gl-vec2');

// we keep track of the mouse y-coordinate.
var mouseY = null;
require('mouse-change')(function (buttons, x, y) {
  mouseY = y;
});

function Aabb(c, r) {
  // Aaab center.
  this.c = vec2.fromValues(c[0], c[1]);

  // Aabb radiuses(halfwidths)
  this.r = vec2.fromValues(r[0], r[1]);
}

// Below are all the global objects.

var playerPaddle = new Aabb([-0.9, 0.0], [0.03, 0.15]);
var aiPaddle = new Aabb([+0.9, 0.0], [0.03, 0.15]);

var midline = new Aabb([+0.0, 0.0], [0.005, 1.0]);

// we set all ball properties in resetBall()
var ball = new Aabb([0.0, 0.0], [0.0, 0.0]); // set velocity
var ballVel = vec2.fromValues(0.0, 0.0);

var context = new AudioContext();
var volume = 0.1;

function clamp(value, min, max) {
  return min < max ? value < min ? min : value > max ? max : value : value < max ? max : value > min ? min : value;
}

function detectAabbCollision(a, b, r) {
  var x0 = +(a.c[0] - b.c[0]) - (a.r[0] + b.r[0]);
  var x1 = -(a.c[0] - b.c[0]) - (a.r[0] + b.r[0]);
  if (x0 > 0.0 || x1 > 0.0) return false;

  var y0 = +(a.c[1] - b.c[1]) - r * (a.r[1] + b.r[1]);
  var y1 = -(a.c[1] - b.c[1]) - r * (a.r[1] + b.r[1]);
  if (y0 > 0.0 || y1 > 0.0) return false;

  // a and b overlap on all axes. So we have collision.
  // Now we need to find the contact normal.

  if (x0 > x1 && x0 > y0 && x0 > y1) {
    return vec2.fromValues(-1.0, 0.0);
  }
  if (x1 > x0 && x1 > y0 && x1 > y1) {
    return vec2.fromValues(+1.0, 0.0);
  }

  if (y0 > x0 && y0 > x1 && y0 > y1) {
    return vec2.fromValues(0.0, -1.0);
  }
  if (y1 > x0 && y1 > x1 && y1 > y0) {
    return vec2.fromValues(0.0, +1.0);
  }
}

function getRand(min, max) {
  return Math.random() * (max - min) + min;
}

function resetBall(playerWon) {
  ball.c = [+0.0, 0.0];
  ball.r = [0.02, 0.02];

  var speed = getRand(0.3, 0.4);
  var RANGE = 1.2;

  var theta;
  if (!playerWon) {
    theta = getRand(-RANGE, +RANGE);
    ballVel = [speed * Math.cos(theta), speed * Math.sin(theta)];
  } else {
    theta = getRand(Math.PI - RANGE, Math.PI + RANGE);
    ballVel = [speed * Math.cos(theta), speed * Math.sin(theta)];
  }
}

// create audio buffer that lasts `length` seconds, and `createAudioDataCallback`
// will will fill each of the two channels of the buffer with audio data.
function createAudioBuffer(length, createAudioDataCallback) {
  var channels = 2;
  var frameCount = context.sampleRate * length;
  var audioBuffer = context.createBuffer(channels, frameCount, context.sampleRate);

  for (var channel = 0; channel < channels; channel++) {
    var channelData = audioBuffer.getChannelData(channel);
    createAudioDataCallback(channelData, frameCount);
  }
  return audioBuffer;
}

function playAudioBuffer(audioBuffer) {
  // Appearently, you have to create a new AudioBufferSourceNode
  // every time you want to play a sound again.
  var source = context.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(context.destination);
  source.start();
}

// When the ball collides with something, we alternate between playing two sound effects
// Both sound effects are just simple square waves.
var hitAudioBuffers = [];

hitAudioBuffers[0] = createAudioBuffer(0.15, function (channelData, frameCount) {
  var current = volume;
  for (var i = 0; i < frameCount; i++) {
    if (i % 100 === 0) {
      current *= -1.0;
    }
    channelData[i] = current * (1.0 - i / frameCount);
  }
});

hitAudioBuffers[1] = createAudioBuffer(0.15, function (channelData, frameCount) {
  var current = volume;
  for (var i = 0; i < frameCount; i++) {
    if (i % 150 === 0) {
      current *= -1.0;
    }
    channelData[i] = current * (1.0 - i / frameCount);
  }
});

// We play this sound when the player wins.
// It is just a square wave, with some simple frequency modulation.
var winAudioBuffer = createAudioBuffer(0.4, function (channelData, frameCount) {
  var current = volume;
  var period = 50;
  for (var i = 0; i < frameCount; i++) {
    if (i % period === 0) {
      current *= -1.0;
    }
    if (i % 600 === 0) {
      period -= 2;
    }
    var a = i / frameCount;
    channelData[i] = current * (1.0 - a);
  }
});

// We play this sound when the player loses.
// It is just white noise.
var loseAudioBuffer = createAudioBuffer(0.5, function (channelData, frameCount) {
  var current = getRand(-volume, +volume);
  for (var i = 0; i < frameCount; i++) {
    if (i % 150 === 0) {
      current = getRand(-volume, +volume);
    }
    channelData[i] = current * (1.0 - i / frameCount);
  }
});

// compute the reflection vector for an incident vector `v` against
// a surface with the normal `n`.
// but note that the kinetic energy is slightly increased
// with the reflection
var iHitAudioBuffer = 0;
function reflect(v, n) {
  var scratch = [0.0, 0.0];

  // alternatingly, play sound effect.
  playAudioBuffer(hitAudioBuffers[iHitAudioBuffer]);
  iHitAudioBuffer = (iHitAudioBuffer + 1) % 2;

  // if it were perfect elastic collison, this would be 1.0
  // But we want the ball to become faster with every bounce,
  // so we set it to a slightly higher value.
  var cr = 1.1;
  return vec2.subtract(v, v, vec2.scale(scratch, n, (1.0 + cr) * vec2.dot(v, n)));
}

// This command draws an Aabb as a white rectangle.
var drawAabb = regl({
  frag: '\n    precision mediump float;\n    void main() {\n      gl_FragColor = vec4(1.0);\n    }',
  vert: '\n  precision mediump float;\n\n  attribute vec2 position;\n\n  uniform vec2 offset;\n  uniform vec2 scale;\n\n  uniform float viewportWidth;\n  uniform float viewportHeight;\n\n  void main() {\n    // windows ratio scaling factor.\n    float r = (viewportWidth) / (viewportHeight);\n    gl_Position = vec4(position.xy * scale * vec2(1.0, r) + offset, 0, 1);\n  }',

  attributes: {
    position: [[-1, -1], [+1, +1], [-1, +1], [-1, -1], [+1, -1], [+1, +1]]
  },

  uniforms: {
    offset: function (_, props) {
      return props.aabb.c;
    },
    scale: function (_, props) {
      return props.aabb.r;
    },
    viewportWidth: regl.context('viewportWidth'),
    viewportHeight: regl.context('viewportHeight')

  },
  depth: {
    enable: false
  },
  cull: {
    enable: true
  },
  count: 6
});

// initialize game.
resetBall(true);

regl.frame(function ({ viewportWidth, viewportHeight, pixelRatio }) {
  regl.clear({
    color: [0, 0, 0, 1]
  });

  var deltaTime = 0.017;

  // We use this ratio r in order to make sure that all renderered
  // objects keep their proportions on different screen sizes
  // Note that we made the assumption that the screen has greater width
  // than height!
  // And we can't just calculate this value once and then cache it, because the
  // user may resize the browser window while playing!
  var r = viewportWidth / viewportHeight;

  //
  // BEGIN GAME LOGIC
  //

  var minY = -1 + playerPaddle.r[1] * r;
  var maxY = +1 - playerPaddle.r[1] * r;
  // player paddle follows the mouse
  if (mouseY !== null) {
    // this maps the mouse y-coordinates to the range [0,1]
    // we must take the pixel ratio in to account, so that it handles
    // retina displays and such.
    var a = 1.0 - mouseY * pixelRatio / viewportHeight;
    // Map from [0,1] to our coordinates system(which is [-1, -1])
    // also, clamp to ensure that the paddle does not move outside the screen boundaries.
    playerPaddle.c[1] = clamp(-1.0 + 2.0 * a, minY, maxY);
  }

  // AI paddle follows the ball.
  var dist = ball.c[1] - aiPaddle.c[1];
  aiPaddle.c[1] = clamp(aiPaddle.c[1] + dist * deltaTime * 1.9, minY, maxY);

  // Move ball.
  vec2.scaleAndAdd(ball.c, ball.c, ballVel, deltaTime);

  // Handle ball collision north wall
  if (ball.c[1] + r * ball.r[1] >= 1.0) {
    ballVel = reflect(ballVel, vec2.fromValues(0.0, -1.0));
  }

  // Handle ball collision east wall
  if (ball.c[0] + ball.r[0] >= 1.0) {
    playAudioBuffer(winAudioBuffer);
    // player win. Reset ball
    resetBall(true);
  }

  // Handle ball collision south wall
  if (ball.c[1] - r * ball.r[1] <= -1.0) {
    ballVel = reflect(ballVel, vec2.fromValues(0.0, 1.0));
  }

  // Handle ball collision west wall
  if (ball.c[0] - ball.r[0] <= -1.0) {
    playAudioBuffer(loseAudioBuffer);
    // player loss. Reset ball.
    resetBall(false);
  }

  // handle ball and AI paddle collision
  var result = detectAabbCollision(aiPaddle, ball, r);
  if (result !== false) {
    var n = result; // if collision, the return value is the contact normal.
    ballVel = reflect(ballVel, n);
  }

  // handle ball and player paddle collision
  result = detectAabbCollision(playerPaddle, ball, r);
  if (result !== false) {
    n = result; // if collision, the return value is the contact normal.
    ballVel = reflect(ballVel, n);
  }

  //
  // END GAME LOGIC
  //

  //
  // Render everything.
  //

  drawAabb([{ aabb: playerPaddle }, { aabb: aiPaddle }, { aabb: midline }, { aabb: ball }]);
});

},{"../regl":65,"gl-vec2":44,"mouse-change":63}],2:[function(require,module,exports){
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
module.exports = add

/**
 * Adds two vec2's
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {vec2} out
 */
function add(out, a, b) {
    out[0] = a[0] + b[0]
    out[1] = a[1] + b[1]
    return out
}
},{}],35:[function(require,module,exports){
module.exports = clone

/**
 * Creates a new vec2 initialized with values from an existing vector
 *
 * @param {vec2} a vector to clone
 * @returns {vec2} a new 2D vector
 */
function clone(a) {
    var out = new Float32Array(2)
    out[0] = a[0]
    out[1] = a[1]
    return out
}
},{}],36:[function(require,module,exports){
module.exports = copy

/**
 * Copy the values from one vec2 to another
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the source vector
 * @returns {vec2} out
 */
function copy(out, a) {
    out[0] = a[0]
    out[1] = a[1]
    return out
}
},{}],37:[function(require,module,exports){
module.exports = create

/**
 * Creates a new, empty vec2
 *
 * @returns {vec2} a new 2D vector
 */
function create() {
    var out = new Float32Array(2)
    out[0] = 0
    out[1] = 0
    return out
}
},{}],38:[function(require,module,exports){
module.exports = cross

/**
 * Computes the cross product of two vec2's
 * Note that the cross product must by definition produce a 3D vector
 *
 * @param {vec3} out the receiving vector
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {vec3} out
 */
function cross(out, a, b) {
    var z = a[0] * b[1] - a[1] * b[0]
    out[0] = out[1] = 0
    out[2] = z
    return out
}
},{}],39:[function(require,module,exports){
module.exports = distance

/**
 * Calculates the euclidian distance between two vec2's
 *
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {Number} distance between a and b
 */
function distance(a, b) {
    var x = b[0] - a[0],
        y = b[1] - a[1]
    return Math.sqrt(x*x + y*y)
}
},{}],40:[function(require,module,exports){
module.exports = divide

/**
 * Divides two vec2's
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {vec2} out
 */
function divide(out, a, b) {
    out[0] = a[0] / b[0]
    out[1] = a[1] / b[1]
    return out
}
},{}],41:[function(require,module,exports){
module.exports = dot

/**
 * Calculates the dot product of two vec2's
 *
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {Number} dot product of a and b
 */
function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1]
}
},{}],42:[function(require,module,exports){
module.exports = forEach

var vec = require('./create')()

/**
 * Perform some operation over an array of vec2s.
 *
 * @param {Array} a the array of vectors to iterate over
 * @param {Number} stride Number of elements between the start of each vec2. If 0 assumes tightly packed
 * @param {Number} offset Number of elements to skip at the beginning of the array
 * @param {Number} count Number of vec2s to iterate over. If 0 iterates over entire array
 * @param {Function} fn Function to call for each vector in the array
 * @param {Object} [arg] additional argument to pass to fn
 * @returns {Array} a
 * @function
 */
function forEach(a, stride, offset, count, fn, arg) {
    var i, l
    if(!stride) {
        stride = 2
    }

    if(!offset) {
        offset = 0
    }
    
    if(count) {
        l = Math.min((count * stride) + offset, a.length)
    } else {
        l = a.length
    }

    for(i = offset; i < l; i += stride) {
        vec[0] = a[i]
        vec[1] = a[i+1]
        fn(vec, vec, arg)
        a[i] = vec[0]
        a[i+1] = vec[1]
    }
    
    return a
}
},{"./create":37}],43:[function(require,module,exports){
module.exports = fromValues

/**
 * Creates a new vec2 initialized with the given values
 *
 * @param {Number} x X component
 * @param {Number} y Y component
 * @returns {vec2} a new 2D vector
 */
function fromValues(x, y) {
    var out = new Float32Array(2)
    out[0] = x
    out[1] = y
    return out
}
},{}],44:[function(require,module,exports){
module.exports = {
  create: require('./create')
  , clone: require('./clone')
  , fromValues: require('./fromValues')
  , copy: require('./copy')
  , set: require('./set')
  , add: require('./add')
  , subtract: require('./subtract')
  , multiply: require('./multiply')
  , divide: require('./divide')
  , min: require('./min')
  , max: require('./max')
  , scale: require('./scale')
  , scaleAndAdd: require('./scaleAndAdd')
  , distance: require('./distance')
  , squaredDistance: require('./squaredDistance')
  , length: require('./length')
  , squaredLength: require('./squaredLength')
  , negate: require('./negate')
  , normalize: require('./normalize')
  , dot: require('./dot')
  , cross: require('./cross')
  , lerp: require('./lerp')
  , random: require('./random')
  , transformMat2: require('./transformMat2')
  , transformMat2d: require('./transformMat2d')
  , transformMat3: require('./transformMat3')
  , transformMat4: require('./transformMat4')
  , forEach: require('./forEach')
}
},{"./add":34,"./clone":35,"./copy":36,"./create":37,"./cross":38,"./distance":39,"./divide":40,"./dot":41,"./forEach":42,"./fromValues":43,"./length":45,"./lerp":46,"./max":47,"./min":48,"./multiply":49,"./negate":50,"./normalize":51,"./random":52,"./scale":53,"./scaleAndAdd":54,"./set":55,"./squaredDistance":56,"./squaredLength":57,"./subtract":58,"./transformMat2":59,"./transformMat2d":60,"./transformMat3":61,"./transformMat4":62}],45:[function(require,module,exports){
module.exports = length

/**
 * Calculates the length of a vec2
 *
 * @param {vec2} a vector to calculate length of
 * @returns {Number} length of a
 */
function length(a) {
    var x = a[0],
        y = a[1]
    return Math.sqrt(x*x + y*y)
}
},{}],46:[function(require,module,exports){
module.exports = lerp

/**
 * Performs a linear interpolation between two vec2's
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @param {Number} t interpolation amount between the two inputs
 * @returns {vec2} out
 */
function lerp(out, a, b, t) {
    var ax = a[0],
        ay = a[1]
    out[0] = ax + t * (b[0] - ax)
    out[1] = ay + t * (b[1] - ay)
    return out
}
},{}],47:[function(require,module,exports){
module.exports = max

/**
 * Returns the maximum of two vec2's
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {vec2} out
 */
function max(out, a, b) {
    out[0] = Math.max(a[0], b[0])
    out[1] = Math.max(a[1], b[1])
    return out
}
},{}],48:[function(require,module,exports){
module.exports = min

/**
 * Returns the minimum of two vec2's
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {vec2} out
 */
function min(out, a, b) {
    out[0] = Math.min(a[0], b[0])
    out[1] = Math.min(a[1], b[1])
    return out
}
},{}],49:[function(require,module,exports){
module.exports = multiply

/**
 * Multiplies two vec2's
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {vec2} out
 */
function multiply(out, a, b) {
    out[0] = a[0] * b[0]
    out[1] = a[1] * b[1]
    return out
}
},{}],50:[function(require,module,exports){
module.exports = negate

/**
 * Negates the components of a vec2
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a vector to negate
 * @returns {vec2} out
 */
function negate(out, a) {
    out[0] = -a[0]
    out[1] = -a[1]
    return out
}
},{}],51:[function(require,module,exports){
module.exports = normalize

/**
 * Normalize a vec2
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a vector to normalize
 * @returns {vec2} out
 */
function normalize(out, a) {
    var x = a[0],
        y = a[1]
    var len = x*x + y*y
    if (len > 0) {
        //TODO: evaluate use of glm_invsqrt here?
        len = 1 / Math.sqrt(len)
        out[0] = a[0] * len
        out[1] = a[1] * len
    }
    return out
}
},{}],52:[function(require,module,exports){
module.exports = random

/**
 * Generates a random vector with the given scale
 *
 * @param {vec2} out the receiving vector
 * @param {Number} [scale] Length of the resulting vector. If ommitted, a unit vector will be returned
 * @returns {vec2} out
 */
function random(out, scale) {
    scale = scale || 1.0
    var r = Math.random() * 2.0 * Math.PI
    out[0] = Math.cos(r) * scale
    out[1] = Math.sin(r) * scale
    return out
}
},{}],53:[function(require,module,exports){
module.exports = scale

/**
 * Scales a vec2 by a scalar number
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the vector to scale
 * @param {Number} b amount to scale the vector by
 * @returns {vec2} out
 */
function scale(out, a, b) {
    out[0] = a[0] * b
    out[1] = a[1] * b
    return out
}
},{}],54:[function(require,module,exports){
module.exports = scaleAndAdd

/**
 * Adds two vec2's after scaling the second operand by a scalar value
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @param {Number} scale the amount to scale b by before adding
 * @returns {vec2} out
 */
function scaleAndAdd(out, a, b, scale) {
    out[0] = a[0] + (b[0] * scale)
    out[1] = a[1] + (b[1] * scale)
    return out
}
},{}],55:[function(require,module,exports){
module.exports = set

/**
 * Set the components of a vec2 to the given values
 *
 * @param {vec2} out the receiving vector
 * @param {Number} x X component
 * @param {Number} y Y component
 * @returns {vec2} out
 */
function set(out, x, y) {
    out[0] = x
    out[1] = y
    return out
}
},{}],56:[function(require,module,exports){
module.exports = squaredDistance

/**
 * Calculates the squared euclidian distance between two vec2's
 *
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {Number} squared distance between a and b
 */
function squaredDistance(a, b) {
    var x = b[0] - a[0],
        y = b[1] - a[1]
    return x*x + y*y
}
},{}],57:[function(require,module,exports){
module.exports = squaredLength

/**
 * Calculates the squared length of a vec2
 *
 * @param {vec2} a vector to calculate squared length of
 * @returns {Number} squared length of a
 */
function squaredLength(a) {
    var x = a[0],
        y = a[1]
    return x*x + y*y
}
},{}],58:[function(require,module,exports){
module.exports = subtract

/**
 * Subtracts vector b from vector a
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {vec2} out
 */
function subtract(out, a, b) {
    out[0] = a[0] - b[0]
    out[1] = a[1] - b[1]
    return out
}
},{}],59:[function(require,module,exports){
module.exports = transformMat2

/**
 * Transforms the vec2 with a mat2
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the vector to transform
 * @param {mat2} m matrix to transform with
 * @returns {vec2} out
 */
function transformMat2(out, a, m) {
    var x = a[0],
        y = a[1]
    out[0] = m[0] * x + m[2] * y
    out[1] = m[1] * x + m[3] * y
    return out
}
},{}],60:[function(require,module,exports){
module.exports = transformMat2d

/**
 * Transforms the vec2 with a mat2d
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the vector to transform
 * @param {mat2d} m matrix to transform with
 * @returns {vec2} out
 */
function transformMat2d(out, a, m) {
    var x = a[0],
        y = a[1]
    out[0] = m[0] * x + m[2] * y + m[4]
    out[1] = m[1] * x + m[3] * y + m[5]
    return out
}
},{}],61:[function(require,module,exports){
module.exports = transformMat3

/**
 * Transforms the vec2 with a mat3
 * 3rd vector component is implicitly '1'
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the vector to transform
 * @param {mat3} m matrix to transform with
 * @returns {vec2} out
 */
function transformMat3(out, a, m) {
    var x = a[0],
        y = a[1]
    out[0] = m[0] * x + m[3] * y + m[6]
    out[1] = m[1] * x + m[4] * y + m[7]
    return out
}
},{}],62:[function(require,module,exports){
module.exports = transformMat4

/**
 * Transforms the vec2 with a mat4
 * 3rd vector component is implicitly '0'
 * 4th vector component is implicitly '1'
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the vector to transform
 * @param {mat4} m matrix to transform with
 * @returns {vec2} out
 */
function transformMat4(out, a, m) {
    var x = a[0], 
        y = a[1]
    out[0] = m[0] * x + m[4] * y + m[12]
    out[1] = m[1] * x + m[5] * y + m[13]
    return out
}
},{}],63:[function(require,module,exports){
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

},{"mouse-event":64}],64:[function(require,module,exports){
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

},{}],65:[function(require,module,exports){

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJleGFtcGxlL3BvbmcuanMiLCJsaWIvYXR0cmlidXRlLmpzIiwibGliL2J1ZmZlci5qcyIsImxpYi9jb25zdGFudHMvYXJyYXl0eXBlcy5qc29uIiwibGliL2NvbnN0YW50cy9kdHlwZXMuanNvbiIsImxpYi9jb25zdGFudHMvcHJpbWl0aXZlcy5qc29uIiwibGliL2NvbnN0YW50cy91c2FnZS5qc29uIiwibGliL2NvcmUuanMiLCJsaWIvZHluYW1pYy5qcyIsImxpYi9lbGVtZW50cy5qcyIsImxpYi9leHRlbnNpb24uanMiLCJsaWIvZnJhbWVidWZmZXIuanMiLCJsaWIvbGltaXRzLmpzIiwibGliL3JlYWQuanMiLCJsaWIvcmVuZGVyYnVmZmVyLmpzIiwibGliL3NoYWRlci5qcyIsImxpYi9zdGF0cy5qcyIsImxpYi9zdHJpbmdzLmpzIiwibGliL3RleHR1cmUuanMiLCJsaWIvdGltZXIuanMiLCJsaWIvdXRpbC9jbG9jay5qcyIsImxpYi91dGlsL2NvZGVnZW4uanMiLCJsaWIvdXRpbC9leHRlbmQuanMiLCJsaWIvdXRpbC9mbGF0dGVuLmpzIiwibGliL3V0aWwvaXMtYXJyYXktbGlrZS5qcyIsImxpYi91dGlsL2lzLW5kYXJyYXkuanMiLCJsaWIvdXRpbC9pcy10eXBlZC1hcnJheS5qcyIsImxpYi91dGlsL2xvb3AuanMiLCJsaWIvdXRpbC9wb29sLmpzIiwibGliL3V0aWwvcmFmLmpzIiwibGliL3V0aWwvdG8taGFsZi1mbG9hdC5qcyIsImxpYi91dGlsL3ZhbHVlcy5qcyIsImxpYi93ZWJnbC5qcyIsIm5vZGVfbW9kdWxlcy9nbC12ZWMyL2FkZC5qcyIsIm5vZGVfbW9kdWxlcy9nbC12ZWMyL2Nsb25lLmpzIiwibm9kZV9tb2R1bGVzL2dsLXZlYzIvY29weS5qcyIsIm5vZGVfbW9kdWxlcy9nbC12ZWMyL2NyZWF0ZS5qcyIsIm5vZGVfbW9kdWxlcy9nbC12ZWMyL2Nyb3NzLmpzIiwibm9kZV9tb2R1bGVzL2dsLXZlYzIvZGlzdGFuY2UuanMiLCJub2RlX21vZHVsZXMvZ2wtdmVjMi9kaXZpZGUuanMiLCJub2RlX21vZHVsZXMvZ2wtdmVjMi9kb3QuanMiLCJub2RlX21vZHVsZXMvZ2wtdmVjMi9mb3JFYWNoLmpzIiwibm9kZV9tb2R1bGVzL2dsLXZlYzIvZnJvbVZhbHVlcy5qcyIsIm5vZGVfbW9kdWxlcy9nbC12ZWMyL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2dsLXZlYzIvbGVuZ3RoLmpzIiwibm9kZV9tb2R1bGVzL2dsLXZlYzIvbGVycC5qcyIsIm5vZGVfbW9kdWxlcy9nbC12ZWMyL21heC5qcyIsIm5vZGVfbW9kdWxlcy9nbC12ZWMyL21pbi5qcyIsIm5vZGVfbW9kdWxlcy9nbC12ZWMyL211bHRpcGx5LmpzIiwibm9kZV9tb2R1bGVzL2dsLXZlYzIvbmVnYXRlLmpzIiwibm9kZV9tb2R1bGVzL2dsLXZlYzIvbm9ybWFsaXplLmpzIiwibm9kZV9tb2R1bGVzL2dsLXZlYzIvcmFuZG9tLmpzIiwibm9kZV9tb2R1bGVzL2dsLXZlYzIvc2NhbGUuanMiLCJub2RlX21vZHVsZXMvZ2wtdmVjMi9zY2FsZUFuZEFkZC5qcyIsIm5vZGVfbW9kdWxlcy9nbC12ZWMyL3NldC5qcyIsIm5vZGVfbW9kdWxlcy9nbC12ZWMyL3NxdWFyZWREaXN0YW5jZS5qcyIsIm5vZGVfbW9kdWxlcy9nbC12ZWMyL3NxdWFyZWRMZW5ndGguanMiLCJub2RlX21vZHVsZXMvZ2wtdmVjMi9zdWJ0cmFjdC5qcyIsIm5vZGVfbW9kdWxlcy9nbC12ZWMyL3RyYW5zZm9ybU1hdDIuanMiLCJub2RlX21vZHVsZXMvZ2wtdmVjMi90cmFuc2Zvcm1NYXQyZC5qcyIsIm5vZGVfbW9kdWxlcy9nbC12ZWMyL3RyYW5zZm9ybU1hdDMuanMiLCJub2RlX21vZHVsZXMvZ2wtdmVjMi90cmFuc2Zvcm1NYXQ0LmpzIiwibm9kZV9tb2R1bGVzL21vdXNlLWNoYW5nZS9tb3VzZS1saXN0ZW4uanMiLCJub2RlX21vZHVsZXMv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O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNkQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNkQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNkQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUMzREEsSUFBSSxTQUFTLFFBQVEsbUJBQVIsQ0FBYjtBQUNBLElBQUksVUFBVSxRQUFRLGVBQVIsQ0FBZDtBQUNBLElBQUksTUFBTSxRQUFRLGdCQUFSLENBQVY7QUFD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QWEsVUFwQmU7QUFxQmxDLGtCQUFjLGtCQUFrQixNQXJCRTtBQXNCbEMsaUJBQWEsaUJBQWlCLE1BdEJJO0FBdUJsQyxxQkFBaUIsaUJBQWlCLFVBdkJBOztBQXlCbEM7QUFDQSxnQkFBWSxZQTFCc0I7O0FBNEJsQztBQUNBLFdBQU8sS0E3QjJCO0FBOEJsQyxRQUFJLFdBOUI4Qjs7QUFnQ2xDO0FBQ0EsWUFBUSxNQWpDMEI7QUFrQ2xDLGtCQUFjLFVBQVUsSUFBVixFQUFnQjtBQUM1QixhQUFPLE9BQU8sVUFBUCxDQUFrQixPQUFsQixDQUEwQixLQUFLLFdBQUwsRUFBMUIsS0FBaUQsQ0FBeEQ7QUFDRCxLQXBDaUM7O0FBc0NsQztBQUNBLFVBQU0sVUF2QzRCOztBQXlDbEM7QUFDQSxhQUFTLE9BMUN5Qjs7QUE0Q2xDO0FBQ0EsU0FBSyxFQTdDNkI7QUE4Q2xDLGNBQVUsT0E5Q3dCOztBQWdEbEMsVUFBTSxZQUFZO0FBQ2hCO0FBQ0EsVUFBSSxLQUFKLEVBQVc7QUFDVCxjQUFNLE1BQU47QUFDRDtBQUNGLEtBckRpQzs7QUF1RGxDO0FBQ0EsU0FBSyxHQXhENkI7O0FBMERsQztBQUNBLFdBQU87QUEzRDJCLEdBQXpCLENBQVg7O0FBOERBLFNBQU8sTUFBUCxDQUFjLElBQWQsRUFBb0IsSUFBcEI7O0FBRUEsU0FBTyxJQUFQO0FBQ0QsQ0FsaEJEIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8qXG4gIHRhZ3M6IGJhc2ljLCBnYW1lXG5cbiAgPHA+IEluIHRoaXMgZXhhbXBsZSwgd2UgaW1wbGVtZW50IGEgc2ltcGxlIHBvbmcgZ2FtZS4gPC9wPlxuXG4gIDxwPiBUaGUgZGVtb25zdHJhdHJlZCBmZWF0dXJlcyBhcmU6IGJhdGNoaW5nLCBhbmQgaG93IHlvdSBjYW5cbiBpbXBsZW1lbnQgYSBnYW1lIGxvb3Agd2l0aCByZWdsLiA8L3A+XG5cbiA8cD4gTm90ZSB0aGF0IHRoZSBiYWxsIHdpbGwgcHJvYmFibHkgZ28gdGhyb3VnaCB0aGUgcGFkZGxlc1xuIG9uY2UgaXQgZ29lcyByZWFsbHkgZmFzdC4gU28gdGhlIGdhbWUgY291bGQgYmUgYSBsb3QgbW9yZSBzdGFibGUuXG4gQnV0IGluIG9yZGVyIHRvIGtlZXAgdGhlIGV4YW1wbGUgc2hvcnQgYW5kIHJlYWRhYmxlLFxuIHdlIGhhdmUgcmVmcmFpbmVkIGZyb20gZml4aW5nIHRoaXMuXG4gPC9wPlxuKi9cbi8qIGdsb2JhbCBBdWRpb0NvbnRleHQgKi9cblxuY29uc3QgcmVnbCA9IHJlcXVpcmUoJy4uL3JlZ2wnKSgpXG5jb25zdCB2ZWMyID0gcmVxdWlyZSgnZ2wtdmVjMicpXG5cbi8vIHdlIGtlZXAgdHJhY2sgb2YgdGhlIG1vdXNlIHktY29vcmRpbmF0ZS5cbnZhciBtb3VzZVkgPSBudWxsXG5yZXF1aXJlKCdtb3VzZS1jaGFuZ2UnKShmdW5jdGlvbiAoYnV0dG9ucywgeCwgeSkge1xuICBtb3VzZVkgPSB5XG59KVxuXG5mdW5jdGlvbiBBYWJiIChjLCByKSB7XG4gIC8vIEFhYWIgY2VudGVyLlxuICB0aGlzLmMgPSB2ZWMyLmZyb21WYWx1ZXMoY1swXSwgY1sxXSlcblxuICAvLyBBYWJiIHJhZGl1c2VzKGhhbGZ3aWR0aHMpXG4gIHRoaXMuciA9IHZlYzIuZnJvbVZhbHVlcyhyWzBdLCByWzFdKVxufVxuXG4vLyBCZWxvdyBhcmUgYWxsIHRoZSBnbG9iYWwgb2JqZWN0cy5cblxudmFyIHBsYXllclBhZGRsZSA9IG5ldyBBYWJiKFstMC45LCAwLjBdLCBbMC4wMywgMC4xNV0pXG52YXIgYWlQYWRkbGUgPSBuZXcgQWFiYihbKzAuOSwgMC4wXSwgWzAuMDMsIDAuMTVdKVxuXG52YXIgbWlkbGluZSA9IG5ldyBBYWJiKFsrMC4wLCAwLjBdLCBbMC4wMDUsIDEuMF0pXG5cbi8vIHdlIHNldCBhbGwgYmFsbCBwcm9wZXJ0aWVzIGluIHJlc2V0QmFsbCgpXG52YXIgYmFsbCA9IG5ldyBBYWJiKFswLjAsIDAuMF0sIFswLjAsIDAuMF0pIC8vIHNldCB2ZWxvY2l0eVxudmFyIGJhbGxWZWwgPSB2ZWMyLmZyb21WYWx1ZXMoMC4wLCAwLjApXG5cbmNvbnN0IGNvbnRleHQgPSBuZXcgQXVkaW9Db250ZXh0KClcbmNvbnN0IHZvbHVtZSA9IDAuMVxuXG5mdW5jdGlvbiBjbGFtcCAodmFsdWUsIG1pbiwgbWF4KSB7XG4gIHJldHVybiBtaW4gPCBtYXhcbiAgICA/ICh2YWx1ZSA8IG1pbiA/IG1pbiA6IHZhbHVlID4gbWF4ID8gbWF4IDogdmFsdWUpXG4gICAgOiAodmFsdWUgPCBtYXggPyBtYXggOiB2YWx1ZSA+IG1pbiA/IG1pbiA6IHZhbHVlKVxufVxuXG5mdW5jdGlvbiBkZXRlY3RBYWJiQ29sbGlzaW9uIChhLCBiLCByKSB7XG4gIHZhciB4MCA9ICsoYS5jWzBdIC0gYi5jWzBdKSAtIChhLnJbMF0gKyBiLnJbMF0pXG4gIHZhciB4MSA9IC0oYS5jWzBdIC0gYi5jWzBdKSAtIChhLnJbMF0gKyBiLnJbMF0pXG4gIGlmICh4MCA+IDAuMCB8fCB4MSA+IDAuMCkgcmV0dXJuIGZhbHNlXG5cbiAgdmFyIHkwID0gKyhhLmNbMV0gLSBiLmNbMV0pIC0gciAqIChhLnJbMV0gKyBiLnJbMV0pXG4gIHZhciB5MSA9IC0oYS5jWzFdIC0gYi5jWzFdKSAtIHIgKiAoYS5yWzFdICsgYi5yWzFdKVxuICBpZiAoeTAgPiAwLjAgfHwgeTEgPiAwLjApIHJldHVybiBmYWxzZVxuXG4gIC8vIGEgYW5kIGIgb3ZlcmxhcCBvbiBhbGwgYXhlcy4gU28gd2UgaGF2ZSBjb2xsaXNpb24uXG4gIC8vIE5vdyB3ZSBuZWVkIHRvIGZpbmQgdGhlIGNvbnRhY3Qgbm9ybWFsLlxuXG4gIGlmICh4MCA+IHgxICYmIHgwID4geTAgJiYgeDAgPiB5MSkge1xuICAgIHJldHVybiB2ZWMyLmZyb21WYWx1ZXMoLTEuMCwgMC4wKVxuICB9XG4gIGlmICh4MSA+IHgwICYmIHgxID4geTAgJiYgeDEgPiB5MSkge1xuICAgIHJldHVybiB2ZWMyLmZyb21WYWx1ZXMoKzEuMCwgMC4wKVxuICB9XG5cbiAgaWYgKHkwID4geDAgJiYgeTAgPiB4MSAmJiB5MCA+IHkxKSB7XG4gICAgcmV0dXJuIHZlYzIuZnJvbVZhbHVlcygwLjAsIC0xLjApXG4gIH1cbiAgaWYgKHkxID4geDAgJiYgeTEgPiB4MSAmJiB5MSA+IHkwKSB7XG4gICAgcmV0dXJuIHZlYzIuZnJvbVZhbHVlcygwLjAsICsxLjApXG4gIH1cbn1cblxuZnVuY3Rpb24gZ2V0UmFuZCAobWluLCBtYXgpIHtcbiAgcmV0dXJuIE1hdGgucmFuZG9tKCkgKiAobWF4IC0gbWluKSArIG1pblxufVxuXG5mdW5jdGlvbiByZXNldEJhbGwgKHBsYXllcldvbikge1xuICBiYWxsLmMgPSBbKzAuMCwgMC4wXVxuICBiYWxsLnIgPSBbMC4wMiwgMC4wMl1cblxuICB2YXIgc3BlZWQgPSBnZXRSYW5kKDAuMywgMC40KVxuICBjb25zdCBSQU5HRSA9IDEuMlxuXG4gIHZhciB0aGV0YVxuICBpZiAoIXBsYXllcldvbikge1xuICAgIHRoZXRhID0gZ2V0UmFuZCgtUkFOR0UsICtSQU5HRSlcbiAgICBiYWxsVmVsID0gW3NwZWVkICogTWF0aC5jb3ModGhldGEpLCBzcGVlZCAqIE1hdGguc2luKHRoZXRhKV1cbiAgfSBlbHNlIHtcbiAgICB0aGV0YSA9IGdldFJhbmQoTWF0aC5QSSAtIFJBTkdFLCBNYXRoLlBJICsgUkFOR0UpXG4gICAgYmFsbFZlbCA9IFtzcGVlZCAqIE1hdGguY29zKHRoZXRhKSwgc3BlZWQgKiBNYXRoLnNpbih0aGV0YSldXG4gIH1cbn1cblxuLy8gY3JlYXRlIGF1ZGlvIGJ1ZmZlciB0aGF0IGxhc3RzIGBsZW5ndGhgIHNlY29uZHMsIGFuZCBgY3JlYXRlQXVkaW9EYXRhQ2FsbGJhY2tgXG4vLyB3aWxsIHdpbGwgZmlsbCBlYWNoIG9mIHRoZSB0d28gY2hhbm5lbHMgb2YgdGhlIGJ1ZmZlciB3aXRoIGF1ZGlvIGRhdGEuXG5mdW5jdGlvbiBjcmVhdGVBdWRpb0J1ZmZlciAobGVuZ3RoLCBjcmVhdGVBdWRpb0RhdGFDYWxsYmFjaykge1xuICB2YXIgY2hhbm5lbHMgPSAyXG4gIHZhciBmcmFtZUNvdW50ID0gY29udGV4dC5zYW1wbGVSYXRlICogbGVuZ3RoXG4gIHZhciBhdWRpb0J1ZmZlciA9IGNvbnRleHQuY3JlYXRlQnVmZmVyKGNoYW5uZWxzLCBmcmFtZUNvdW50LCBjb250ZXh0LnNhbXBsZVJhdGUpXG5cbiAgZm9yICh2YXIgY2hhbm5lbCA9IDA7IGNoYW5uZWwgPCBjaGFubmVsczsgY2hhbm5lbCsrKSB7XG4gICAgdmFyIGNoYW5uZWxEYXRhID0gYXVkaW9CdWZmZXIuZ2V0Q2hhbm5lbERhdGEoY2hhbm5lbClcbiAgICBjcmVhdGVBdWRpb0RhdGFDYWxsYmFjayhjaGFubmVsRGF0YSwgZnJhbWVDb3VudClcbiAgfVxuICByZXR1cm4gYXVkaW9CdWZmZXJcbn1cblxuZnVuY3Rpb24gcGxheUF1ZGlvQnVmZmVyIChhdWRpb0J1ZmZlcikge1xuICAvLyBBcHBlYXJlbnRseSwgeW91IGhhdmUgdG8gY3JlYXRlIGEgbmV3IEF1ZGlvQnVmZmVyU291cmNlTm9kZVxuICAvLyBldmVyeSB0aW1lIHlvdSB3YW50IHRvIHBsYXkgYSBzb3VuZCBhZ2Fpbi5cbiAgdmFyIHNvdXJjZSA9IGNvbnRleHQuY3JlYXRlQnVmZmVyU291cmNlKClcbiAgc291cmNlLmJ1ZmZlciA9IGF1ZGlvQnVmZmVyXG4gIHNvdXJjZS5jb25uZWN0KGNvbnRleHQuZGVzdGluYXRpb24pXG4gIHNvdXJjZS5zdGFydCgpXG59XG5cbi8vIFdoZW4gdGhlIGJhbGwgY29sbGlkZXMgd2l0aCBzb21ldGhpbmcsIHdlIGFsdGVybmF0ZSBiZXR3ZWVuIHBsYXlpbmcgdHdvIHNvdW5kIGVmZmVjdHNcbi8vIEJvdGggc291bmQgZWZmZWN0cyBhcmUganVzdCBzaW1wbGUgc3F1YXJlIHdhdmVzLlxudmFyIGhpdEF1ZGlvQnVmZmVycyA9IFtdXG5cbmhpdEF1ZGlvQnVmZmVyc1swXSA9XG4gICAgY3JlYXRlQXVkaW9CdWZmZXIoMC4xNSxcbiAgICAgICAgICAgICAgICAgICAgICAoY2hhbm5lbERhdGEsIGZyYW1lQ291bnQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBjdXJyZW50ID0gdm9sdW1lXG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGZyYW1lQ291bnQ7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoaSAlIDEwMCA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGN1cnJlbnQgKj0gLTEuMFxuICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgIGNoYW5uZWxEYXRhW2ldID0gY3VycmVudCAqICgxLjAgLSBpIC8gZnJhbWVDb3VudClcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICB9KVxuXG5oaXRBdWRpb0J1ZmZlcnNbMV0gPVxuICAgIGNyZWF0ZUF1ZGlvQnVmZmVyKDAuMTUsXG4gICAgICAgICAgICAgICAgICAgICAgKGNoYW5uZWxEYXRhLCBmcmFtZUNvdW50KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgY3VycmVudCA9IHZvbHVtZVxuICAgICAgICAgICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmcmFtZUNvdW50OyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGkgJSAxNTAgPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjdXJyZW50ICo9IC0xLjBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICBjaGFubmVsRGF0YVtpXSA9IGN1cnJlbnQgKiAoMS4wIC0gaSAvIGZyYW1lQ291bnQpXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgfSlcblxuLy8gV2UgcGxheSB0aGlzIHNvdW5kIHdoZW4gdGhlIHBsYXllciB3aW5zLlxuLy8gSXQgaXMganVzdCBhIHNxdWFyZSB3YXZlLCB3aXRoIHNvbWUgc2ltcGxlIGZyZXF1ZW5jeSBtb2R1bGF0aW9uLlxudmFyIHdpbkF1ZGlvQnVmZmVyID1cbiAgICBjcmVhdGVBdWRpb0J1ZmZlcigwLjQsXG4gICAgICAgICAgICAgICAgICAgICAgKGNoYW5uZWxEYXRhLCBmcmFtZUNvdW50KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgY3VycmVudCA9IHZvbHVtZVxuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHBlcmlvZCA9IDUwXG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGZyYW1lQ291bnQ7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoaSAlIHBlcmlvZCA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGN1cnJlbnQgKj0gLTEuMFxuICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpICUgNjAwID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcGVyaW9kIC09IDJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgYSA9IChpIC8gZnJhbWVDb3VudClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgY2hhbm5lbERhdGFbaV0gPSBjdXJyZW50ICogKDEuMCAtIGEpXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgfSlcblxuLy8gV2UgcGxheSB0aGlzIHNvdW5kIHdoZW4gdGhlIHBsYXllciBsb3Nlcy5cbi8vIEl0IGlzIGp1c3Qgd2hpdGUgbm9pc2UuXG52YXIgbG9zZUF1ZGlvQnVmZmVyID1cbiAgICBjcmVhdGVBdWRpb0J1ZmZlcigwLjUsXG4gICAgICAgICAgICAgICAgICAgICAgKGNoYW5uZWxEYXRhLCBmcmFtZUNvdW50KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgY3VycmVudCA9IGdldFJhbmQoLXZvbHVtZSwgK3ZvbHVtZSlcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZnJhbWVDb3VudDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpICUgMTUwID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY3VycmVudCA9IGdldFJhbmQoLXZvbHVtZSwgK3ZvbHVtZSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICBjaGFubmVsRGF0YVtpXSA9IGN1cnJlbnQgKiAoMS4wIC0gaSAvIGZyYW1lQ291bnQpXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgfSlcblxuLy8gY29tcHV0ZSB0aGUgcmVmbGVjdGlvbiB2ZWN0b3IgZm9yIGFuIGluY2lkZW50IHZlY3RvciBgdmAgYWdhaW5zdFxuLy8gYSBzdXJmYWNlIHdpdGggdGhlIG5vcm1hbCBgbmAuXG4vLyBidXQgbm90ZSB0aGF0IHRoZSBraW5ldGljIGVuZXJneSBpcyBzbGlnaHRseSBpbmNyZWFzZWRcbi8vIHdpdGggdGhlIHJlZmxlY3Rpb25cbnZhciBpSGl0QXVkaW9CdWZmZXIgPSAwXG5mdW5jdGlvbiByZWZsZWN0ICh2LCBuKSB7XG4gIHZhciBzY3JhdGNoID0gWzAuMCwgMC4wXVxuXG4gIC8vIGFsdGVybmF0aW5nbHksIHBsYXkgc291bmQgZWZmZWN0LlxuICBwbGF5QXVkaW9CdWZmZXIoaGl0QXVkaW9CdWZmZXJzW2lIaXRBdWRpb0J1ZmZlcl0pXG4gIGlIaXRBdWRpb0J1ZmZlciA9IChpSGl0QXVkaW9CdWZmZXIgKyAxKSAlIDJcblxuICAvLyBpZiBpdCB3ZXJlIHBlcmZlY3QgZWxhc3RpYyBjb2xsaXNvbiwgdGhpcyB3b3VsZCBiZSAxLjBcbiAgLy8gQnV0IHdlIHdhbnQgdGhlIGJhbGwgdG8gYmVjb21lIGZhc3RlciB3aXRoIGV2ZXJ5IGJvdW5jZSxcbiAgLy8gc28gd2Ugc2V0IGl0IHRvIGEgc2xpZ2h0bHkgaGlnaGVyIHZhbHVlLlxuICB2YXIgY3IgPSAxLjFcbiAgcmV0dXJuIHZlYzIuc3VidHJhY3QodiwgdiwgdmVjMi5zY2FsZShzY3JhdGNoLCBuLCAoMS4wICsgY3IpICogdmVjMi5kb3QodiwgbikpKVxufVxuXG4vLyBUaGlzIGNvbW1hbmQgZHJhd3MgYW4gQWFiYiBhcyBhIHdoaXRlIHJlY3RhbmdsZS5cbmNvbnN0IGRyYXdBYWJiID0gcmVnbCh7XG4gIGZyYWc6IGBcbiAgICBwcmVjaXNpb24gbWVkaXVtcCBmbG9hdDtcbiAgICB2b2lkIG1haW4oKSB7XG4gICAgICBnbF9GcmFnQ29sb3IgPSB2ZWM0KDEuMCk7XG4gICAgfWAsXG4gIHZlcnQ6IGBcbiAgcHJlY2lzaW9uIG1lZGl1bXAgZmxvYXQ7XG5cbiAgYXR0cmlidXRlIHZlYzIgcG9zaXRpb247XG5cbiAgdW5pZm9ybSB2ZWMyIG9mZnNldDtcbiAgdW5pZm9ybSB2ZWMyIHNjYWxlO1xuXG4gIHVuaWZvcm0gZmxvYXQgdmlld3BvcnRXaWR0aDtcbiAgdW5pZm9ybSBmbG9hdCB2aWV3cG9ydEhlaWdodDtcblxuICB2b2lkIG1haW4oKSB7XG4gICAgLy8gd2luZG93cyByYXRpbyBzY2FsaW5nIGZhY3Rvci5cbiAgICBmbG9hdCByID0gKHZpZXdwb3J0V2lkdGgpIC8gKHZpZXdwb3J0SGVpZ2h0KTtcbiAgICBnbF9Qb3NpdGlvbiA9IHZlYzQocG9zaXRpb24ueHkgKiBzY2FsZSAqIHZlYzIoMS4wLCByKSArIG9mZnNldCwgMCwgMSk7XG4gIH1gLFxuXG4gIGF0dHJpYnV0ZXM6IHtcbiAgICBwb3NpdGlvbjogW1xuICAgICAgWy0xLCAtMV0sIFsrMSwgKzFdLCBbLTEsICsxXSxcbiAgICAgIFstMSwgLTFdLCBbKzEsIC0xXSwgWysxLCArMV1cbiAgICBdXG4gIH0sXG5cbiAgdW5pZm9ybXM6IHtcbiAgICBvZmZzZXQ6IChfLCBwcm9wcykgPT4gcHJvcHMuYWFiYi5jLFxuICAgIHNjYWxlOiAoXywgcHJvcHMpID0+IHByb3BzLmFhYmIucixcbiAgICB2aWV3cG9ydFdpZHRoOiByZWdsLmNvbnRleHQoJ3ZpZXdwb3J0V2lkdGgnKSxcbiAgICB2aWV3cG9ydEhlaWdodDogcmVnbC5jb250ZXh0KCd2aWV3cG9ydEhlaWdodCcpXG5cbiAgfSxcbiAgZGVwdGg6IHtcbiAgICBlbmFibGU6IGZhbHNlXG4gIH0sXG4gIGN1bGw6IHtcbiAgICBlbmFibGU6IHRydWVcbiAgfSxcbiAgY291bnQ6IDZcbn0pXG5cbi8vIGluaXRpYWxpemUgZ2FtZS5cbnJlc2V0QmFsbCh0cnVlKVxuXG5yZWdsLmZyYW1lKGZ1bmN0aW9uICh7dmlld3BvcnRXaWR0aCwgdmlld3BvcnRIZWlnaHQsIHBpeGVsUmF0aW99KSB7XG4gIHJlZ2wuY2xlYXIoe1xuICAgIGNvbG9yOiBbMCwgMCwgMCwgMV1cbiAgfSlcblxuICBjb25zdCBkZWx0YVRpbWUgPSAwLjAxN1xuXG4gIC8vIFdlIHVzZSB0aGlzIHJhdGlvIHIgaW4gb3JkZXIgdG8gbWFrZSBzdXJlIHRoYXQgYWxsIHJlbmRlcmVyZWRcbiAgLy8gb2JqZWN0cyBrZWVwIHRoZWlyIHByb3BvcnRpb25zIG9uIGRpZmZlcmVudCBzY3JlZW4gc2l6ZXNcbiAgLy8gTm90ZSB0aGF0IHdlIG1hZGUgdGhlIGFzc3VtcHRpb24gdGhhdCB0aGUgc2NyZWVuIGhhcyBncmVhdGVyIHdpZHRoXG4gIC8vIHRoYW4gaGVpZ2h0IVxuICAvLyBBbmQgd2UgY2FuJ3QganVzdCBjYWxjdWxhdGUgdGhpcyB2YWx1ZSBvbmNlIGFuZCB0aGVuIGNhY2hlIGl0LCBiZWNhdXNlIHRoZVxuICAvLyB1c2VyIG1heSByZXNpemUgdGhlIGJyb3dzZXIgd2luZG93IHdoaWxlIHBsYXlpbmchXG4gIHZhciByID0gdmlld3BvcnRXaWR0aCAvIHZpZXdwb3J0SGVpZ2h0XG5cbiAgLy9cbiAgLy8gQkVHSU4gR0FNRSBMT0dJQ1xuICAvL1xuXG4gIHZhciBtaW5ZID0gLTEgKyBwbGF5ZXJQYWRkbGUuclsxXSAqIHJcbiAgdmFyIG1heFkgPSArMSAtIHBsYXllclBhZGRsZS5yWzFdICogclxuICAvLyBwbGF5ZXIgcGFkZGxlIGZvbGxvd3MgdGhlIG1vdXNlXG4gIGlmIChtb3VzZVkgIT09IG51bGwpIHtcbiAgICAvLyB0aGlzIG1hcHMgdGhlIG1vdXNlIHktY29vcmRpbmF0ZXMgdG8gdGhlIHJhbmdlIFswLDFdXG4gICAgLy8gd2UgbXVzdCB0YWtlIHRoZSBwaXhlbCByYXRpbyBpbiB0byBhY2NvdW50LCBzbyB0aGF0IGl0IGhhbmRsZXNcbiAgICAvLyByZXRpbmEgZGlzcGxheXMgYW5kIHN1Y2guXG4gICAgdmFyIGEgPSAxLjAgLSAobW91c2VZICogcGl4ZWxSYXRpbykgLyB2aWV3cG9ydEhlaWdodFxuICAgIC8vIE1hcCBmcm9tIFswLDFdIHRvIG91ciBjb29yZGluYXRlcyBzeXN0ZW0od2hpY2ggaXMgWy0xLCAtMV0pXG4gICAgLy8gYWxzbywgY2xhbXAgdG8gZW5zdXJlIHRoYXQgdGhlIHBhZGRsZSBkb2VzIG5vdCBtb3ZlIG91dHNpZGUgdGhlIHNjcmVlbiBib3VuZGFyaWVzLlxuICAgIHBsYXllclBhZGRsZS5jWzFdID0gY2xhbXAoLTEuMCArIDIuMCAqIChhKSwgbWluWSwgbWF4WSlcbiAgfVxuXG4gIC8vIEFJIHBhZGRsZSBmb2xsb3dzIHRoZSBiYWxsLlxuICB2YXIgZGlzdCA9IChiYWxsLmNbMV0gLSBhaVBhZGRsZS5jWzFdKVxuICBhaVBhZGRsZS5jWzFdID0gY2xhbXAoYWlQYWRkbGUuY1sxXSArIGRpc3QgKiBkZWx0YVRpbWUgKiAxLjksIG1pblksIG1heFkpXG5cbiAgLy8gTW92ZSBiYWxsLlxuICB2ZWMyLnNjYWxlQW5kQWRkKGJhbGwuYywgYmFsbC5jLCBiYWxsVmVsLCBkZWx0YVRpbWUpXG5cbiAgLy8gSGFuZGxlIGJhbGwgY29sbGlzaW9uIG5vcnRoIHdhbGxcbiAgaWYgKChiYWxsLmNbMV0gKyByICogYmFsbC5yWzFdKSA+PSAxLjApIHtcbiAgICBiYWxsVmVsID0gcmVmbGVjdChiYWxsVmVsLCB2ZWMyLmZyb21WYWx1ZXMoMC4wLCAtMS4wKSlcbiAgfVxuXG4gIC8vIEhhbmRsZSBiYWxsIGNvbGxpc2lvbiBlYXN0IHdhbGxcbiAgaWYgKChiYWxsLmNbMF0gKyBiYWxsLnJbMF0pID49IDEuMCkge1xuICAgIHBsYXlBdWRpb0J1ZmZlcih3aW5BdWRpb0J1ZmZlcilcbiAgICAvLyBwbGF5ZXIgd2luLiBSZXNldCBiYWxsXG4gICAgcmVzZXRCYWxsKHRydWUpXG4gIH1cblxuICAvLyBIYW5kbGUgYmFsbCBjb2xsaXNpb24gc291dGggd2FsbFxuICBpZiAoKGJhbGwuY1sxXSAtIHIgKiBiYWxsLnJbMV0pIDw9IC0xLjApIHtcbiAgICBiYWxsVmVsID0gcmVmbGVjdChiYWxsVmVsLCB2ZWMyLmZyb21WYWx1ZXMoMC4wLCAxLjApKVxuICB9XG5cbiAgLy8gSGFuZGxlIGJhbGwgY29sbGlzaW9uIHdlc3Qgd2FsbFxuICBpZiAoKGJhbGwuY1swXSAtIGJhbGwuclswXSkgPD0gLTEuMCkge1xuICAgIHBsYXlBdWRpb0J1ZmZlcihsb3NlQXVkaW9CdWZmZXIpXG4gICAgLy8gcGxheWVyIGxvc3MuIFJlc2V0IGJhbGwuXG4gICAgcmVzZXRCYWxsKGZhbHNlKVxuICB9XG5cbiAgLy8gaGFuZGxlIGJhbGwgYW5kIEFJIHBhZGRsZSBjb2xsaXNpb25cbiAgdmFyIHJlc3VsdCA9IGRldGVjdEFhYmJDb2xsaXNpb24oYWlQYWRkbGUsIGJhbGwsIHIpXG4gIGlmIChyZXN1bHQgIT09IGZhbHNlKSB7XG4gICAgdmFyIG4gPSByZXN1bHQgLy8gaWYgY29sbGlzaW9uLCB0aGUgcmV0dXJuIHZhbHVlIGlzIHRoZSBjb250YWN0IG5vcm1hbC5cbiAgICBiYWxsVmVsID0gcmVmbGVjdChiYWxsVmVsLCBuKVxuICB9XG5cbiAgLy8gaGFuZGxlIGJhbGwgYW5kIHBsYXllciBwYWRkbGUgY29sbGlzaW9uXG4gIHJlc3VsdCA9IGRldGVjdEFhYmJDb2xsaXNpb24ocGxheWVyUGFkZGxlLCBiYWxsLCByKVxuICBpZiAocmVzdWx0ICE9PSBmYWxzZSkge1xuICAgIG4gPSByZXN1bHQgLy8gaWYgY29sbGlzaW9uLCB0aGUgcmV0dXJuIHZhbHVlIGlzIHRoZSBjb250YWN0IG5vcm1hbC5cbiAgICBiYWxsVmVsID0gcmVmbGVjdChiYWxsVmVsLCBuKVxuICB9XG5cbiAgLy9cbiAgLy8gRU5EIEdBTUUgTE9HSUNcbiAgLy9cblxuICAvL1xuICAvLyBSZW5kZXIgZXZlcnl0aGluZy5cbiAgLy9cblxuICBkcmF3QWFiYihbXG4gICAgeyBhYWJiOiBwbGF5ZXJQYWRkbGUgfSxcbiAgICB7IGFhYmI6IGFpUGFkZGxlIH0sXG4gICAgeyBhYWJiOiBtaWRsaW5lIH0sXG4gICAgeyBhYWJiOiBiYWxsIH1cbiAgXSlcbn0pXG4iLCJ2YXIgR0xfRkxPQVQgPSA1MTI2XG5cbmZ1bmN0aW9uIEF0dHJpYnV0ZVJlY29yZCAoKSB7XG4gIHRoaXMuc3RhdGUgPSAwXG5cbiAgdGhpcy54ID0gMC4wXG4gIHRoaXMueSA9IDAuMFxuICB0aGlzLnogPSAwLjBcbiAgdGhpcy53ID0gMC4wXG5cbiAgdGhpcy5idWZmZXIgPSBudWxsXG4gIHRoaXMuc2l6ZSA9IDBcbiAgdGhpcy5ub3JtYWxpemVkID0gZmFsc2VcbiAgdGhpcy50eXBlID0gR0xfRkxPQVRcbiAgdGhpcy5vZmZzZXQgPSAwXG4gIHRoaXMuc3RyaWRlID0gMFxuICB0aGlzLmRpdmlzb3IgPSAwXG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcEF0dHJpYnV0ZVN0YXRlIChcbiAgZ2wsXG4gIGV4dGVuc2lvbnMsXG4gIGxpbWl0cyxcbiAgYnVmZmVyU3RhdGUsXG4gIHN0cmluZ1N0b3JlKSB7XG4gIHZhciBOVU1fQVRUUklCVVRFUyA9IGxpbWl0cy5tYXhBdHRyaWJ1dGVzXG4gIHZhciBhdHRyaWJ1dGVCaW5kaW5ncyA9IG5ldyBBcnJheShOVU1fQVRUUklCVVRFUylcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBOVU1fQVRUUklCVVRFUzsgKytpKSB7XG4gICAgYXR0cmlidXRlQmluZGluZ3NbaV0gPSBuZXcgQXR0cmlidXRlUmVjb3JkKClcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgUmVjb3JkOiBBdHRyaWJ1dGVSZWNvcmQsXG4gICAgc2NvcGU6IHt9LFxuICAgIHN0YXRlOiBhdHRyaWJ1dGVCaW5kaW5nc1xuICB9XG59XG4iLCJcbnZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL3V0aWwvaXMtdHlwZWQtYXJyYXknKVxudmFyIGlzTkRBcnJheUxpa2UgPSByZXF1aXJlKCcuL3V0aWwvaXMtbmRhcnJheScpXG52YXIgdmFsdWVzID0gcmVxdWlyZSgnLi91dGlsL3ZhbHVlcycpXG52YXIgcG9vbCA9IHJlcXVpcmUoJy4vdXRpbC9wb29sJylcbnZhciBmbGF0dGVuVXRpbCA9IHJlcXVpcmUoJy4vdXRpbC9mbGF0dGVuJylcblxudmFyIGFycmF5RmxhdHRlbiA9IGZsYXR0ZW5VdGlsLmZsYXR0ZW5cbnZhciBhcnJheVNoYXBlID0gZmxhdHRlblV0aWwuc2hhcGVcblxudmFyIGFycmF5VHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9hcnJheXR5cGVzLmpzb24nKVxudmFyIGJ1ZmZlclR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvZHR5cGVzLmpzb24nKVxudmFyIHVzYWdlVHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy91c2FnZS5qc29uJylcblxudmFyIEdMX1NUQVRJQ19EUkFXID0gMHg4OEU0XG52YXIgR0xfU1RSRUFNX0RSQVcgPSAweDg4RTBcblxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSA1MTIxXG52YXIgR0xfRkxPQVQgPSA1MTI2XG5cbnZhciBEVFlQRVNfU0laRVMgPSBbXVxuRFRZUEVTX1NJWkVTWzUxMjBdID0gMSAvLyBpbnQ4XG5EVFlQRVNfU0laRVNbNTEyMl0gPSAyIC8vIGludDE2XG5EVFlQRVNfU0laRVNbNTEyNF0gPSA0IC8vIGludDMyXG5EVFlQRVNfU0laRVNbNTEyMV0gPSAxIC8vIHVpbnQ4XG5EVFlQRVNfU0laRVNbNTEyM10gPSAyIC8vIHVpbnQxNlxuRFRZUEVTX1NJWkVTWzUxMjVdID0gNCAvLyB1aW50MzJcbkRUWVBFU19TSVpFU1s1MTI2XSA9IDQgLy8gZmxvYXQzMlxuXG5mdW5jdGlvbiB0eXBlZEFycmF5Q29kZSAoZGF0YSkge1xuICByZXR1cm4gYXJyYXlUeXBlc1tPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoZGF0YSldIHwgMFxufVxuXG5mdW5jdGlvbiBjb3B5QXJyYXkgKG91dCwgaW5wKSB7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgaW5wLmxlbmd0aDsgKytpKSB7XG4gICAgb3V0W2ldID0gaW5wW2ldXG4gIH1cbn1cblxuZnVuY3Rpb24gdHJhbnNwb3NlIChcbiAgcmVzdWx0LCBkYXRhLCBzaGFwZVgsIHNoYXBlWSwgc3RyaWRlWCwgc3RyaWRlWSwgb2Zmc2V0KSB7XG4gIHZhciBwdHIgPSAwXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc2hhcGVYOyArK2kpIHtcbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IHNoYXBlWTsgKytqKSB7XG4gICAgICByZXN1bHRbcHRyKytdID0gZGF0YVtzdHJpZGVYICogaSArIHN0cmlkZVkgKiBqICsgb2Zmc2V0XVxuICAgIH1cbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBCdWZmZXJTdGF0ZSAoZ2wsIHN0YXRzLCBjb25maWcpIHtcbiAgdmFyIGJ1ZmZlckNvdW50ID0gMFxuICB2YXIgYnVmZmVyU2V0ID0ge31cblxuICBmdW5jdGlvbiBSRUdMQnVmZmVyICh0eXBlKSB7XG4gICAgdGhpcy5pZCA9IGJ1ZmZlckNvdW50KytcbiAgICB0aGlzLmJ1ZmZlciA9IGdsLmNyZWF0ZUJ1ZmZlcigpXG4gICAgdGhpcy50eXBlID0gdHlwZVxuICAgIHRoaXMudXNhZ2UgPSBHTF9TVEFUSUNfRFJBV1xuICAgIHRoaXMuYnl0ZUxlbmd0aCA9IDBcbiAgICB0aGlzLmRpbWVuc2lvbiA9IDFcbiAgICB0aGlzLmR0eXBlID0gR0xfVU5TSUdORURfQllURVxuXG4gICAgdGhpcy5wZXJzaXN0ZW50RGF0YSA9IG51bGxcblxuICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgdGhpcy5zdGF0cyA9IHtzaXplOiAwfVxuICAgIH1cbiAgfVxuXG4gIFJFR0xCdWZmZXIucHJvdG90eXBlLmJpbmQgPSBmdW5jdGlvbiAoKSB7XG4gICAgZ2wuYmluZEJ1ZmZlcih0aGlzLnR5cGUsIHRoaXMuYnVmZmVyKVxuICB9XG5cbiAgUkVHTEJ1ZmZlci5wcm90b3R5cGUuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgICBkZXN0cm95KHRoaXMpXG4gIH1cblxuICB2YXIgc3RyZWFtUG9vbCA9IFtdXG5cbiAgZnVuY3Rpb24gY3JlYXRlU3RyZWFtICh0eXBlLCBkYXRhKSB7XG4gICAgdmFyIGJ1ZmZlciA9IHN0cmVhbVBvb2wucG9wKClcbiAgICBpZiAoIWJ1ZmZlcikge1xuICAgICAgYnVmZmVyID0gbmV3IFJFR0xCdWZmZXIodHlwZSlcbiAgICB9XG4gICAgYnVmZmVyLmJpbmQoKVxuICAgIGluaXRCdWZmZXJGcm9tRGF0YShidWZmZXIsIGRhdGEsIEdMX1NUUkVBTV9EUkFXLCAwLCAxLCBmYWxzZSlcbiAgICByZXR1cm4gYnVmZmVyXG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95U3RyZWFtIChzdHJlYW0pIHtcbiAgICBzdHJlYW1Qb29sLnB1c2goc3RyZWFtKVxuICB9XG5cbiAgZnVuY3Rpb24gaW5pdEJ1ZmZlckZyb21UeXBlZEFycmF5IChidWZmZXIsIGRhdGEsIHVzYWdlKSB7XG4gICAgYnVmZmVyLmJ5dGVMZW5ndGggPSBkYXRhLmJ5dGVMZW5ndGhcbiAgICBnbC5idWZmZXJEYXRhKGJ1ZmZlci50eXBlLCBkYXRhLCB1c2FnZSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGluaXRCdWZmZXJGcm9tRGF0YSAoYnVmZmVyLCBkYXRhLCB1c2FnZSwgZHR5cGUsIGRpbWVuc2lvbiwgcGVyc2lzdCkge1xuICAgIHZhciBzaGFwZVxuICAgIGJ1ZmZlci51c2FnZSA9IHVzYWdlXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YSkpIHtcbiAgICAgIGJ1ZmZlci5kdHlwZSA9IGR0eXBlIHx8IEdMX0ZMT0FUXG4gICAgICBpZiAoZGF0YS5sZW5ndGggPiAwKSB7XG4gICAgICAgIHZhciBmbGF0RGF0YVxuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShkYXRhWzBdKSkge1xuICAgICAgICAgIHNoYXBlID0gYXJyYXlTaGFwZShkYXRhKVxuICAgICAgICAgIHZhciBkaW0gPSAxXG4gICAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCBzaGFwZS5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgZGltICo9IHNoYXBlW2ldXG4gICAgICAgICAgfVxuICAgICAgICAgIGJ1ZmZlci5kaW1lbnNpb24gPSBkaW1cbiAgICAgICAgICBmbGF0RGF0YSA9IGFycmF5RmxhdHRlbihkYXRhLCBzaGFwZSwgYnVmZmVyLmR0eXBlKVxuICAgICAgICAgIGluaXRCdWZmZXJGcm9tVHlwZWRBcnJheShidWZmZXIsIGZsYXREYXRhLCB1c2FnZSlcbiAgICAgICAgICBpZiAocGVyc2lzdCkge1xuICAgICAgICAgICAgYnVmZmVyLnBlcnNpc3RlbnREYXRhID0gZmxhdERhdGFcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcG9vbC5mcmVlVHlwZShmbGF0RGF0YSlcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGRhdGFbMF0gPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgYnVmZmVyLmRpbWVuc2lvbiA9IGRpbWVuc2lvblxuICAgICAgICAgIHZhciB0eXBlZERhdGEgPSBwb29sLmFsbG9jVHlwZShidWZmZXIuZHR5cGUsIGRhdGEubGVuZ3RoKVxuICAgICAgICAgIGNvcHlBcnJheSh0eXBlZERhdGEsIGRhdGEpXG4gICAgICAgICAgaW5pdEJ1ZmZlckZyb21UeXBlZEFycmF5KGJ1ZmZlciwgdHlwZWREYXRhLCB1c2FnZSlcbiAgICAgICAgICBpZiAocGVyc2lzdCkge1xuICAgICAgICAgICAgYnVmZmVyLnBlcnNpc3RlbnREYXRhID0gdHlwZWREYXRhXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBvb2wuZnJlZVR5cGUodHlwZWREYXRhKVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChpc1R5cGVkQXJyYXkoZGF0YVswXSkpIHtcbiAgICAgICAgICBidWZmZXIuZGltZW5zaW9uID0gZGF0YVswXS5sZW5ndGhcbiAgICAgICAgICBidWZmZXIuZHR5cGUgPSBkdHlwZSB8fCB0eXBlZEFycmF5Q29kZShkYXRhWzBdKSB8fCBHTF9GTE9BVFxuICAgICAgICAgIGZsYXREYXRhID0gYXJyYXlGbGF0dGVuKFxuICAgICAgICAgICAgZGF0YSxcbiAgICAgICAgICAgIFtkYXRhLmxlbmd0aCwgZGF0YVswXS5sZW5ndGhdLFxuICAgICAgICAgICAgYnVmZmVyLmR0eXBlKVxuICAgICAgICAgIGluaXRCdWZmZXJGcm9tVHlwZWRBcnJheShidWZmZXIsIGZsYXREYXRhLCB1c2FnZSlcbiAgICAgICAgICBpZiAocGVyc2lzdCkge1xuICAgICAgICAgICAgYnVmZmVyLnBlcnNpc3RlbnREYXRhID0gZmxhdERhdGFcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcG9vbC5mcmVlVHlwZShmbGF0RGF0YSlcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGlzVHlwZWRBcnJheShkYXRhKSkge1xuICAgICAgYnVmZmVyLmR0eXBlID0gZHR5cGUgfHwgdHlwZWRBcnJheUNvZGUoZGF0YSlcbiAgICAgIGJ1ZmZlci5kaW1lbnNpb24gPSBkaW1lbnNpb25cbiAgICAgIGluaXRCdWZmZXJGcm9tVHlwZWRBcnJheShidWZmZXIsIGRhdGEsIHVzYWdlKVxuICAgICAgaWYgKHBlcnNpc3QpIHtcbiAgICAgICAgYnVmZmVyLnBlcnNpc3RlbnREYXRhID0gbmV3IFVpbnQ4QXJyYXkobmV3IFVpbnQ4QXJyYXkoZGF0YS5idWZmZXIpKVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoaXNOREFycmF5TGlrZShkYXRhKSkge1xuICAgICAgc2hhcGUgPSBkYXRhLnNoYXBlXG4gICAgICB2YXIgc3RyaWRlID0gZGF0YS5zdHJpZGVcbiAgICAgIHZhciBvZmZzZXQgPSBkYXRhLm9mZnNldFxuXG4gICAgICB2YXIgc2hhcGVYID0gMFxuICAgICAgdmFyIHNoYXBlWSA9IDBcbiAgICAgIHZhciBzdHJpZGVYID0gMFxuICAgICAgdmFyIHN0cmlkZVkgPSAwXG4gICAgICBpZiAoc2hhcGUubGVuZ3RoID09PSAxKSB7XG4gICAgICAgIHNoYXBlWCA9IHNoYXBlWzBdXG4gICAgICAgIHNoYXBlWSA9IDFcbiAgICAgICAgc3RyaWRlWCA9IHN0cmlkZVswXVxuICAgICAgICBzdHJpZGVZID0gMFxuICAgICAgfSBlbHNlIGlmIChzaGFwZS5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgc2hhcGVYID0gc2hhcGVbMF1cbiAgICAgICAgc2hhcGVZID0gc2hhcGVbMV1cbiAgICAgICAgc3RyaWRlWCA9IHN0cmlkZVswXVxuICAgICAgICBzdHJpZGVZID0gc3RyaWRlWzFdXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBcbiAgICAgIH1cblxuICAgICAgYnVmZmVyLmR0eXBlID0gZHR5cGUgfHwgdHlwZWRBcnJheUNvZGUoZGF0YS5kYXRhKSB8fCBHTF9GTE9BVFxuICAgICAgYnVmZmVyLmRpbWVuc2lvbiA9IHNoYXBlWVxuXG4gICAgICB2YXIgdHJhbnNwb3NlRGF0YSA9IHBvb2wuYWxsb2NUeXBlKGJ1ZmZlci5kdHlwZSwgc2hhcGVYICogc2hhcGVZKVxuICAgICAgdHJhbnNwb3NlKHRyYW5zcG9zZURhdGEsXG4gICAgICAgIGRhdGEuZGF0YSxcbiAgICAgICAgc2hhcGVYLCBzaGFwZVksXG4gICAgICAgIHN0cmlkZVgsIHN0cmlkZVksXG4gICAgICAgIG9mZnNldClcbiAgICAgIGluaXRCdWZmZXJGcm9tVHlwZWRBcnJheShidWZmZXIsIHRyYW5zcG9zZURhdGEsIHVzYWdlKVxuICAgICAgaWYgKHBlcnNpc3QpIHtcbiAgICAgICAgYnVmZmVyLnBlcnNpc3RlbnREYXRhID0gdHJhbnNwb3NlRGF0YVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcG9vbC5mcmVlVHlwZSh0cmFuc3Bvc2VEYXRhKVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95IChidWZmZXIpIHtcbiAgICBzdGF0cy5idWZmZXJDb3VudC0tXG5cbiAgICB2YXIgaGFuZGxlID0gYnVmZmVyLmJ1ZmZlclxuICAgIFxuICAgIGdsLmRlbGV0ZUJ1ZmZlcihoYW5kbGUpXG4gICAgYnVmZmVyLmJ1ZmZlciA9IG51bGxcbiAgICBkZWxldGUgYnVmZmVyU2V0W2J1ZmZlci5pZF1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZUJ1ZmZlciAob3B0aW9ucywgdHlwZSwgZGVmZXJJbml0LCBwZXJzaXN0ZW50KSB7XG4gICAgc3RhdHMuYnVmZmVyQ291bnQrK1xuXG4gICAgdmFyIGJ1ZmZlciA9IG5ldyBSRUdMQnVmZmVyKHR5cGUpXG4gICAgYnVmZmVyU2V0W2J1ZmZlci5pZF0gPSBidWZmZXJcblxuICAgIGZ1bmN0aW9uIHJlZ2xCdWZmZXIgKG9wdGlvbnMpIHtcbiAgICAgIHZhciB1c2FnZSA9IEdMX1NUQVRJQ19EUkFXXG4gICAgICB2YXIgZGF0YSA9IG51bGxcbiAgICAgIHZhciBieXRlTGVuZ3RoID0gMFxuICAgICAgdmFyIGR0eXBlID0gMFxuICAgICAgdmFyIGRpbWVuc2lvbiA9IDFcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KG9wdGlvbnMpIHx8XG4gICAgICAgICAgaXNUeXBlZEFycmF5KG9wdGlvbnMpIHx8XG4gICAgICAgICAgaXNOREFycmF5TGlrZShvcHRpb25zKSkge1xuICAgICAgICBkYXRhID0gb3B0aW9uc1xuICAgICAgfSBlbHNlIGlmICh0eXBlb2Ygb3B0aW9ucyA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgYnl0ZUxlbmd0aCA9IG9wdGlvbnMgfCAwXG4gICAgICB9IGVsc2UgaWYgKG9wdGlvbnMpIHtcbiAgICAgICAgXG5cbiAgICAgICAgaWYgKCdkYXRhJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgXG4gICAgICAgICAgZGF0YSA9IG9wdGlvbnMuZGF0YVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCd1c2FnZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgIFxuICAgICAgICAgIHVzYWdlID0gdXNhZ2VUeXBlc1tvcHRpb25zLnVzYWdlXVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCd0eXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgXG4gICAgICAgICAgZHR5cGUgPSBidWZmZXJUeXBlc1tvcHRpb25zLnR5cGVdXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ2RpbWVuc2lvbicgaW4gb3B0aW9ucykge1xuICAgICAgICAgIFxuICAgICAgICAgIGRpbWVuc2lvbiA9IG9wdGlvbnMuZGltZW5zaW9uIHwgMFxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdsZW5ndGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBcbiAgICAgICAgICBieXRlTGVuZ3RoID0gb3B0aW9ucy5sZW5ndGggfCAwXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgYnVmZmVyLmJpbmQoKVxuICAgICAgaWYgKCFkYXRhKSB7XG4gICAgICAgIGdsLmJ1ZmZlckRhdGEoYnVmZmVyLnR5cGUsIGJ5dGVMZW5ndGgsIHVzYWdlKVxuICAgICAgICBidWZmZXIuZHR5cGUgPSBkdHlwZSB8fCBHTF9VTlNJR05FRF9CWVRFXG4gICAgICAgIGJ1ZmZlci51c2FnZSA9IHVzYWdlXG4gICAgICAgIGJ1ZmZlci5kaW1lbnNpb24gPSBkaW1lbnNpb25cbiAgICAgICAgYnVmZmVyLmJ5dGVMZW5ndGggPSBieXRlTGVuZ3RoXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpbml0QnVmZmVyRnJvbURhdGEoYnVmZmVyLCBkYXRhLCB1c2FnZSwgZHR5cGUsIGRpbWVuc2lvbiwgcGVyc2lzdGVudClcbiAgICAgIH1cblxuICAgICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICAgIGJ1ZmZlci5zdGF0cy5zaXplID0gYnVmZmVyLmJ5dGVMZW5ndGggKiBEVFlQRVNfU0laRVNbYnVmZmVyLmR0eXBlXVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmVnbEJ1ZmZlclxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHNldFN1YkRhdGEgKGRhdGEsIG9mZnNldCkge1xuICAgICAgXG5cbiAgICAgIGdsLmJ1ZmZlclN1YkRhdGEoYnVmZmVyLnR5cGUsIG9mZnNldCwgZGF0YSlcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzdWJkYXRhIChkYXRhLCBvZmZzZXRfKSB7XG4gICAgICB2YXIgb2Zmc2V0ID0gKG9mZnNldF8gfHwgMCkgfCAwXG4gICAgICB2YXIgc2hhcGVcbiAgICAgIGJ1ZmZlci5iaW5kKClcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XG4gICAgICAgIGlmIChkYXRhLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBpZiAodHlwZW9mIGRhdGFbMF0gPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICB2YXIgY29udmVydGVkID0gcG9vbC5hbGxvY1R5cGUoYnVmZmVyLmR0eXBlLCBkYXRhLmxlbmd0aClcbiAgICAgICAgICAgIGNvcHlBcnJheShjb252ZXJ0ZWQsIGRhdGEpXG4gICAgICAgICAgICBzZXRTdWJEYXRhKGNvbnZlcnRlZCwgb2Zmc2V0KVxuICAgICAgICAgICAgcG9vbC5mcmVlVHlwZShjb252ZXJ0ZWQpXG4gICAgICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGRhdGFbMF0pIHx8IGlzVHlwZWRBcnJheShkYXRhWzBdKSkge1xuICAgICAgICAgICAgc2hhcGUgPSBhcnJheVNoYXBlKGRhdGEpXG4gICAgICAgICAgICB2YXIgZmxhdERhdGEgPSBhcnJheUZsYXR0ZW4oZGF0YSwgc2hhcGUsIGJ1ZmZlci5kdHlwZSlcbiAgICAgICAgICAgIHNldFN1YkRhdGEoZmxhdERhdGEsIG9mZnNldClcbiAgICAgICAgICAgIHBvb2wuZnJlZVR5cGUoZmxhdERhdGEpXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChpc1R5cGVkQXJyYXkoZGF0YSkpIHtcbiAgICAgICAgc2V0U3ViRGF0YShkYXRhLCBvZmZzZXQpXG4gICAgICB9IGVsc2UgaWYgKGlzTkRBcnJheUxpa2UoZGF0YSkpIHtcbiAgICAgICAgc2hhcGUgPSBkYXRhLnNoYXBlXG4gICAgICAgIHZhciBzdHJpZGUgPSBkYXRhLnN0cmlkZVxuXG4gICAgICAgIHZhciBzaGFwZVggPSAwXG4gICAgICAgIHZhciBzaGFwZVkgPSAwXG4gICAgICAgIHZhciBzdHJpZGVYID0gMFxuICAgICAgICB2YXIgc3RyaWRlWSA9IDBcbiAgICAgICAgaWYgKHNoYXBlLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgIHNoYXBlWCA9IHNoYXBlWzBdXG4gICAgICAgICAgc2hhcGVZID0gMVxuICAgICAgICAgIHN0cmlkZVggPSBzdHJpZGVbMF1cbiAgICAgICAgICBzdHJpZGVZID0gMFxuICAgICAgICB9IGVsc2UgaWYgKHNoYXBlLmxlbmd0aCA9PT0gMikge1xuICAgICAgICAgIHNoYXBlWCA9IHNoYXBlWzBdXG4gICAgICAgICAgc2hhcGVZID0gc2hhcGVbMV1cbiAgICAgICAgICBzdHJpZGVYID0gc3RyaWRlWzBdXG4gICAgICAgICAgc3RyaWRlWSA9IHN0cmlkZVsxXVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIFxuICAgICAgICB9XG4gICAgICAgIHZhciBkdHlwZSA9IEFycmF5LmlzQXJyYXkoZGF0YS5kYXRhKVxuICAgICAgICAgID8gYnVmZmVyLmR0eXBlXG4gICAgICAgICAgOiB0eXBlZEFycmF5Q29kZShkYXRhLmRhdGEpXG5cbiAgICAgICAgdmFyIHRyYW5zcG9zZURhdGEgPSBwb29sLmFsbG9jVHlwZShkdHlwZSwgc2hhcGVYICogc2hhcGVZKVxuICAgICAgICB0cmFuc3Bvc2UodHJhbnNwb3NlRGF0YSxcbiAgICAgICAgICBkYXRhLmRhdGEsXG4gICAgICAgICAgc2hhcGVYLCBzaGFwZVksXG4gICAgICAgICAgc3RyaWRlWCwgc3RyaWRlWSxcbiAgICAgICAgICBkYXRhLm9mZnNldClcbiAgICAgICAgc2V0U3ViRGF0YSh0cmFuc3Bvc2VEYXRhLCBvZmZzZXQpXG4gICAgICAgIHBvb2wuZnJlZVR5cGUodHJhbnNwb3NlRGF0YSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIFxuICAgICAgfVxuICAgICAgcmV0dXJuIHJlZ2xCdWZmZXJcbiAgICB9XG5cbiAgICBpZiAoIWRlZmVySW5pdCkge1xuICAgICAgcmVnbEJ1ZmZlcihvcHRpb25zKVxuICAgIH1cblxuICAgIHJlZ2xCdWZmZXIuX3JlZ2xUeXBlID0gJ2J1ZmZlcidcbiAgICByZWdsQnVmZmVyLl9idWZmZXIgPSBidWZmZXJcbiAgICByZWdsQnVmZmVyLnN1YmRhdGEgPSBzdWJkYXRhXG4gICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICByZWdsQnVmZmVyLnN0YXRzID0gYnVmZmVyLnN0YXRzXG4gICAgfVxuICAgIHJlZ2xCdWZmZXIuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHsgZGVzdHJveShidWZmZXIpIH1cblxuICAgIHJldHVybiByZWdsQnVmZmVyXG4gIH1cblxuICBmdW5jdGlvbiByZXN0b3JlQnVmZmVycyAoKSB7XG4gICAgdmFsdWVzKGJ1ZmZlclNldCkuZm9yRWFjaChmdW5jdGlvbiAoYnVmZmVyKSB7XG4gICAgICBidWZmZXIuYnVmZmVyID0gZ2wuY3JlYXRlQnVmZmVyKClcbiAgICAgIGdsLmJpbmRCdWZmZXIoYnVmZmVyLnR5cGUsIGJ1ZmZlci5idWZmZXIpXG4gICAgICBnbC5idWZmZXJEYXRhKFxuICAgICAgICBidWZmZXIudHlwZSwgYnVmZmVyLnBlcnNpc3RlbnREYXRhIHx8IGJ1ZmZlci5ieXRlTGVuZ3RoLCBidWZmZXIudXNhZ2UpXG4gICAgfSlcbiAgfVxuXG4gIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgIHN0YXRzLmdldFRvdGFsQnVmZmVyU2l6ZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciB0b3RhbCA9IDBcbiAgICAgIC8vIFRPRE86IFJpZ2h0IG5vdywgdGhlIHN0cmVhbXMgYXJlIG5vdCBwYXJ0IG9mIHRoZSB0b3RhbCBjb3VudC5cbiAgICAgIE9iamVjdC5rZXlzKGJ1ZmZlclNldCkuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgIHRvdGFsICs9IGJ1ZmZlclNldFtrZXldLnN0YXRzLnNpemVcbiAgICAgIH0pXG4gICAgICByZXR1cm4gdG90YWxcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNyZWF0ZTogY3JlYXRlQnVmZmVyLFxuXG4gICAgY3JlYXRlU3RyZWFtOiBjcmVhdGVTdHJlYW0sXG4gICAgZGVzdHJveVN0cmVhbTogZGVzdHJveVN0cmVhbSxcblxuICAgIGNsZWFyOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YWx1ZXMoYnVmZmVyU2V0KS5mb3JFYWNoKGRlc3Ryb3kpXG4gICAgICBzdHJlYW1Qb29sLmZvckVhY2goZGVzdHJveSlcbiAgICB9LFxuXG4gICAgZ2V0QnVmZmVyOiBmdW5jdGlvbiAod3JhcHBlcikge1xuICAgICAgaWYgKHdyYXBwZXIgJiYgd3JhcHBlci5fYnVmZmVyIGluc3RhbmNlb2YgUkVHTEJ1ZmZlcikge1xuICAgICAgICByZXR1cm4gd3JhcHBlci5fYnVmZmVyXG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH0sXG5cbiAgICByZXN0b3JlOiByZXN0b3JlQnVmZmVycyxcblxuICAgIF9pbml0QnVmZmVyOiBpbml0QnVmZmVyRnJvbURhdGFcbiAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICBcIltvYmplY3QgSW50OEFycmF5XVwiOiA1MTIwXG4sIFwiW29iamVjdCBJbnQxNkFycmF5XVwiOiA1MTIyXG4sIFwiW29iamVjdCBJbnQzMkFycmF5XVwiOiA1MTI0XG4sIFwiW29iamVjdCBVaW50OEFycmF5XVwiOiA1MTIxXG4sIFwiW29iamVjdCBVaW50OENsYW1wZWRBcnJheV1cIjogNTEyMVxuLCBcIltvYmplY3QgVWludDE2QXJyYXldXCI6IDUxMjNcbiwgXCJbb2JqZWN0IFVpbnQzMkFycmF5XVwiOiA1MTI1XG4sIFwiW29iamVjdCBGbG9hdDMyQXJyYXldXCI6IDUxMjZcbiwgXCJbb2JqZWN0IEZsb2F0NjRBcnJheV1cIjogNTEyMVxuLCBcIltvYmplY3QgQXJyYXlCdWZmZXJdXCI6IDUxMjFcbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgXCJpbnQ4XCI6IDUxMjBcbiwgXCJpbnQxNlwiOiA1MTIyXG4sIFwiaW50MzJcIjogNTEyNFxuLCBcInVpbnQ4XCI6IDUxMjFcbiwgXCJ1aW50MTZcIjogNTEyM1xuLCBcInVpbnQzMlwiOiA1MTI1XG4sIFwiZmxvYXRcIjogNTEyNlxuLCBcImZsb2F0MzJcIjogNTEyNlxufVxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICBcInBvaW50c1wiOiAwLFxuICBcInBvaW50XCI6IDAsXG4gIFwibGluZXNcIjogMSxcbiAgXCJsaW5lXCI6IDEsXG4gIFwibGluZSBsb29wXCI6IDIsXG4gIFwibGluZSBzdHJpcFwiOiAzLFxuICBcInRyaWFuZ2xlc1wiOiA0LFxuICBcInRyaWFuZ2xlXCI6IDQsXG4gIFwidHJpYW5nbGUgc3RyaXBcIjogNSxcbiAgXCJ0cmlhbmdsZSBmYW5cIjogNlxufVxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICBcInN0YXRpY1wiOiAzNTA0NCxcbiAgXCJkeW5hbWljXCI6IDM1MDQ4LFxuICBcInN0cmVhbVwiOiAzNTA0MFxufVxuIiwiXG52YXIgY3JlYXRlRW52aXJvbm1lbnQgPSByZXF1aXJlKCcuL3V0aWwvY29kZWdlbicpXG52YXIgbG9vcCA9IHJlcXVpcmUoJy4vdXRpbC9sb29wJylcbnZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL3V0aWwvaXMtdHlwZWQtYXJyYXknKVxudmFyIGlzTkRBcnJheSA9IHJlcXVpcmUoJy4vdXRpbC9pcy1uZGFycmF5JylcbnZhciBpc0FycmF5TGlrZSA9IHJlcXVpcmUoJy4vdXRpbC9pcy1hcnJheS1saWtlJylcbnZhciBkeW5hbWljID0gcmVxdWlyZSgnLi9keW5hbWljJylcblxudmFyIHByaW1UeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL3ByaW1pdGl2ZXMuanNvbicpXG52YXIgZ2xUeXBlcyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzL2R0eXBlcy5qc29uJylcblxuLy8gXCJjdXRlXCIgbmFtZXMgZm9yIHZlY3RvciBjb21wb25lbnRzXG52YXIgQ1VURV9DT01QT05FTlRTID0gJ3h5encnLnNwbGl0KCcnKVxuXG52YXIgR0xfVU5TSUdORURfQllURSA9IDUxMjFcblxudmFyIEFUVFJJQl9TVEFURV9QT0lOVEVSID0gMVxudmFyIEFUVFJJQl9TVEFURV9DT05TVEFOVCA9IDJcblxudmFyIERZTl9GVU5DID0gMFxudmFyIERZTl9QUk9QID0gMVxudmFyIERZTl9DT05URVhUID0gMlxudmFyIERZTl9TVEFURSA9IDNcbnZhciBEWU5fVEhVTksgPSA0XG5cbnZhciBTX0RJVEhFUiA9ICdkaXRoZXInXG52YXIgU19CTEVORF9FTkFCTEUgPSAnYmxlbmQuZW5hYmxlJ1xudmFyIFNfQkxFTkRfQ09MT1IgPSAnYmxlbmQuY29sb3InXG52YXIgU19CTEVORF9FUVVBVElPTiA9ICdibGVuZC5lcXVhdGlvbidcbnZhciBTX0JMRU5EX0ZVTkMgPSAnYmxlbmQuZnVuYydcbnZhciBTX0RFUFRIX0VOQUJMRSA9ICdkZXB0aC5lbmFibGUnXG52YXIgU19ERVBUSF9GVU5DID0gJ2RlcHRoLmZ1bmMnXG52YXIgU19ERVBUSF9SQU5HRSA9ICdkZXB0aC5yYW5nZSdcbnZhciBTX0RFUFRIX01BU0sgPSAnZGVwdGgubWFzaydcbnZhciBTX0NPTE9SX01BU0sgPSAnY29sb3JNYXNrJ1xudmFyIFNfQ1VMTF9FTkFCTEUgPSAnY3VsbC5lbmFibGUnXG52YXIgU19DVUxMX0ZBQ0UgPSAnY3VsbC5mYWNlJ1xudmFyIFNfRlJPTlRfRkFDRSA9ICdmcm9udEZhY2UnXG52YXIgU19MSU5FX1dJRFRIID0gJ2xpbmVXaWR0aCdcbnZhciBTX1BPTFlHT05fT0ZGU0VUX0VOQUJMRSA9ICdwb2x5Z29uT2Zmc2V0LmVuYWJsZSdcbnZhciBTX1BPTFlHT05fT0ZGU0VUX09GRlNFVCA9ICdwb2x5Z29uT2Zmc2V0Lm9mZnNldCdcbnZhciBTX1NBTVBMRV9BTFBIQSA9ICdzYW1wbGUuYWxwaGEnXG52YXIgU19TQU1QTEVfRU5BQkxFID0gJ3NhbXBsZS5lbmFibGUnXG52YXIgU19TQU1QTEVfQ09WRVJBR0UgPSAnc2FtcGxlLmNvdmVyYWdlJ1xudmFyIFNfU1RFTkNJTF9FTkFCTEUgPSAnc3RlbmNpbC5lbmFibGUnXG52YXIgU19TVEVOQ0lMX01BU0sgPSAnc3RlbmNpbC5tYXNrJ1xudmFyIFNfU1RFTkNJTF9GVU5DID0gJ3N0ZW5jaWwuZnVuYydcbnZhciBTX1NURU5DSUxfT1BGUk9OVCA9ICdzdGVuY2lsLm9wRnJvbnQnXG52YXIgU19TVEVOQ0lMX09QQkFDSyA9ICdzdGVuY2lsLm9wQmFjaydcbnZhciBTX1NDSVNTT1JfRU5BQkxFID0gJ3NjaXNzb3IuZW5hYmxlJ1xudmFyIFNfU0NJU1NPUl9CT1ggPSAnc2Npc3Nvci5ib3gnXG52YXIgU19WSUVXUE9SVCA9ICd2aWV3cG9ydCdcblxudmFyIFNfUFJPRklMRSA9ICdwcm9maWxlJ1xuXG52YXIgU19GUkFNRUJVRkZFUiA9ICdmcmFtZWJ1ZmZlcidcbnZhciBTX1ZFUlQgPSAndmVydCdcbnZhciBTX0ZSQUcgPSAnZnJhZydcbnZhciBTX0VMRU1FTlRTID0gJ2VsZW1lbnRzJ1xudmFyIFNfUFJJTUlUSVZFID0gJ3ByaW1pdGl2ZSdcbnZhciBTX0NPVU5UID0gJ2NvdW50J1xudmFyIFNfT0ZGU0VUID0gJ29mZnNldCdcbnZhciBTX0lOU1RBTkNFUyA9ICdpbnN0YW5jZXMnXG5cbnZhciBTVUZGSVhfV0lEVEggPSAnV2lkdGgnXG52YXIgU1VGRklYX0hFSUdIVCA9ICdIZWlnaHQnXG5cbnZhciBTX0ZSQU1FQlVGRkVSX1dJRFRIID0gU19GUkFNRUJVRkZFUiArIFNVRkZJWF9XSURUSFxudmFyIFNfRlJBTUVCVUZGRVJfSEVJR0hUID0gU19GUkFNRUJVRkZFUiArIFNVRkZJWF9IRUlHSFRcbnZhciBTX1ZJRVdQT1JUX1dJRFRIID0gU19WSUVXUE9SVCArIFNVRkZJWF9XSURUSFxudmFyIFNfVklFV1BPUlRfSEVJR0hUID0gU19WSUVXUE9SVCArIFNVRkZJWF9IRUlHSFRcbnZhciBTX0RSQVdJTkdCVUZGRVIgPSAnZHJhd2luZ0J1ZmZlcidcbnZhciBTX0RSQVdJTkdCVUZGRVJfV0lEVEggPSBTX0RSQVdJTkdCVUZGRVIgKyBTVUZGSVhfV0lEVEhcbnZhciBTX0RSQVdJTkdCVUZGRVJfSEVJR0hUID0gU19EUkFXSU5HQlVGRkVSICsgU1VGRklYX0hFSUdIVFxuXG52YXIgTkVTVEVEX09QVElPTlMgPSBbXG4gIFNfQkxFTkRfRlVOQyxcbiAgU19CTEVORF9FUVVBVElPTixcbiAgU19TVEVOQ0lMX0ZVTkMsXG4gIFNfU1RFTkNJTF9PUEZST05ULFxuICBTX1NURU5DSUxfT1BCQUNLLFxuICBTX1NBTVBMRV9DT1ZFUkFHRSxcbiAgU19WSUVXUE9SVCxcbiAgU19TQ0lTU09SX0JPWCxcbiAgU19QT0xZR09OX09GRlNFVF9PRkZTRVRcbl1cblxudmFyIEdMX0FSUkFZX0JVRkZFUiA9IDM0OTYyXG52YXIgR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIgPSAzNDk2M1xuXG52YXIgR0xfRlJBR01FTlRfU0hBREVSID0gMzU2MzJcbnZhciBHTF9WRVJURVhfU0hBREVSID0gMzU2MzNcblxudmFyIEdMX1RFWFRVUkVfMkQgPSAweDBERTFcbnZhciBHTF9URVhUVVJFX0NVQkVfTUFQID0gMHg4NTEzXG5cbnZhciBHTF9DVUxMX0ZBQ0UgPSAweDBCNDRcbnZhciBHTF9CTEVORCA9IDB4MEJFMlxudmFyIEdMX0RJVEhFUiA9IDB4MEJEMFxudmFyIEdMX1NURU5DSUxfVEVTVCA9IDB4MEI5MFxudmFyIEdMX0RFUFRIX1RFU1QgPSAweDBCNzFcbnZhciBHTF9TQ0lTU09SX1RFU1QgPSAweDBDMTFcbnZhciBHTF9QT0xZR09OX09GRlNFVF9GSUxMID0gMHg4MDM3XG52YXIgR0xfU0FNUExFX0FMUEhBX1RPX0NPVkVSQUdFID0gMHg4MDlFXG52YXIgR0xfU0FNUExFX0NPVkVSQUdFID0gMHg4MEEwXG5cbnZhciBHTF9GTE9BVCA9IDUxMjZcbnZhciBHTF9GTE9BVF9WRUMyID0gMzU2NjRcbnZhciBHTF9GTE9BVF9WRUMzID0gMzU2NjVcbnZhciBHTF9GTE9BVF9WRUM0ID0gMzU2NjZcbnZhciBHTF9JTlQgPSA1MTI0XG52YXIgR0xfSU5UX1ZFQzIgPSAzNTY2N1xudmFyIEdMX0lOVF9WRUMzID0gMzU2NjhcbnZhciBHTF9JTlRfVkVDNCA9IDM1NjY5XG52YXIgR0xfQk9PTCA9IDM1NjcwXG52YXIgR0xfQk9PTF9WRUMyID0gMzU2NzFcbnZhciBHTF9CT09MX1ZFQzMgPSAzNTY3MlxudmFyIEdMX0JPT0xfVkVDNCA9IDM1NjczXG52YXIgR0xfRkxPQVRfTUFUMiA9IDM1Njc0XG52YXIgR0xfRkxPQVRfTUFUMyA9IDM1Njc1XG52YXIgR0xfRkxPQVRfTUFUNCA9IDM1Njc2XG52YXIgR0xfU0FNUExFUl8yRCA9IDM1Njc4XG52YXIgR0xfU0FNUExFUl9DVUJFID0gMzU2ODBcblxudmFyIEdMX1RSSUFOR0xFUyA9IDRcblxudmFyIEdMX0ZST05UID0gMTAyOFxudmFyIEdMX0JBQ0sgPSAxMDI5XG52YXIgR0xfQ1cgPSAweDA5MDBcbnZhciBHTF9DQ1cgPSAweDA5MDFcbnZhciBHTF9NSU5fRVhUID0gMHg4MDA3XG52YXIgR0xfTUFYX0VYVCA9IDB4ODAwOFxudmFyIEdMX0FMV0FZUyA9IDUxOVxudmFyIEdMX0tFRVAgPSA3NjgwXG52YXIgR0xfWkVSTyA9IDBcbnZhciBHTF9PTkUgPSAxXG52YXIgR0xfRlVOQ19BREQgPSAweDgwMDZcbnZhciBHTF9MRVNTID0gNTEzXG5cbnZhciBHTF9GUkFNRUJVRkZFUiA9IDB4OEQ0MFxudmFyIEdMX0NPTE9SX0FUVEFDSE1FTlQwID0gMHg4Q0UwXG5cbnZhciBibGVuZEZ1bmNzID0ge1xuICAnMCc6IDAsXG4gICcxJzogMSxcbiAgJ3plcm8nOiAwLFxuICAnb25lJzogMSxcbiAgJ3NyYyBjb2xvcic6IDc2OCxcbiAgJ29uZSBtaW51cyBzcmMgY29sb3InOiA3NjksXG4gICdzcmMgYWxwaGEnOiA3NzAsXG4gICdvbmUgbWludXMgc3JjIGFscGhhJzogNzcxLFxuICAnZHN0IGNvbG9yJzogNzc0LFxuICAnb25lIG1pbnVzIGRzdCBjb2xvcic6IDc3NSxcbiAgJ2RzdCBhbHBoYSc6IDc3MixcbiAgJ29uZSBtaW51cyBkc3QgYWxwaGEnOiA3NzMsXG4gICdjb25zdGFudCBjb2xvcic6IDMyNzY5LFxuICAnb25lIG1pbnVzIGNvbnN0YW50IGNvbG9yJzogMzI3NzAsXG4gICdjb25zdGFudCBhbHBoYSc6IDMyNzcxLFxuICAnb25lIG1pbnVzIGNvbnN0YW50IGFscGhhJzogMzI3NzIsXG4gICdzcmMgYWxwaGEgc2F0dXJhdGUnOiA3NzZcbn1cblxuLy8gVGhlcmUgYXJlIGludmFsaWQgdmFsdWVzIGZvciBzcmNSR0IgYW5kIGRzdFJHQi4gU2VlOlxuLy8gaHR0cHM6Ly93d3cua2hyb25vcy5vcmcvcmVnaXN0cnkvd2ViZ2wvc3BlY3MvMS4wLyM2LjEzXG4vLyBodHRwczovL2dpdGh1Yi5jb20vS2hyb25vc0dyb3VwL1dlYkdML2Jsb2IvMGQzMjAxZjVmN2VjM2MwMDYwYmMxZjA0MDc3NDYxNTQxZjE5ODdiOS9jb25mb3JtYW5jZS1zdWl0ZXMvMS4wLjMvY29uZm9ybWFuY2UvbWlzYy93ZWJnbC1zcGVjaWZpYy5odG1sI0w1NlxudmFyIGludmFsaWRCbGVuZENvbWJpbmF0aW9ucyA9IFtcbiAgJ2NvbnN0YW50IGNvbG9yLCBjb25zdGFudCBhbHBoYScsXG4gICdvbmUgbWludXMgY29uc3RhbnQgY29sb3IsIGNvbnN0YW50IGFscGhhJyxcbiAgJ2NvbnN0YW50IGNvbG9yLCBvbmUgbWludXMgY29uc3RhbnQgYWxwaGEnLFxuICAnb25lIG1pbnVzIGNvbnN0YW50IGNvbG9yLCBvbmUgbWludXMgY29uc3RhbnQgYWxwaGEnLFxuICAnY29uc3RhbnQgYWxwaGEsIGNvbnN0YW50IGNvbG9yJyxcbiAgJ2NvbnN0YW50IGFscGhhLCBvbmUgbWludXMgY29uc3RhbnQgY29sb3InLFxuICAnb25lIG1pbnVzIGNvbnN0YW50IGFscGhhLCBjb25zdGFudCBjb2xvcicsXG4gICdvbmUgbWludXMgY29uc3RhbnQgYWxwaGEsIG9uZSBtaW51cyBjb25zdGFudCBjb2xvcidcbl1cblxudmFyIGNvbXBhcmVGdW5jcyA9IHtcbiAgJ25ldmVyJzogNTEyLFxuICAnbGVzcyc6IDUxMyxcbiAgJzwnOiA1MTMsXG4gICdlcXVhbCc6IDUxNCxcbiAgJz0nOiA1MTQsXG4gICc9PSc6IDUxNCxcbiAgJz09PSc6IDUxNCxcbiAgJ2xlcXVhbCc6IDUxNSxcbiAgJzw9JzogNTE1LFxuICAnZ3JlYXRlcic6IDUxNixcbiAgJz4nOiA1MTYsXG4gICdub3RlcXVhbCc6IDUxNyxcbiAgJyE9JzogNTE3LFxuICAnIT09JzogNTE3LFxuICAnZ2VxdWFsJzogNTE4LFxuICAnPj0nOiA1MTgsXG4gICdhbHdheXMnOiA1MTlcbn1cblxudmFyIHN0ZW5jaWxPcHMgPSB7XG4gICcwJzogMCxcbiAgJ3plcm8nOiAwLFxuICAna2VlcCc6IDc2ODAsXG4gICdyZXBsYWNlJzogNzY4MSxcbiAgJ2luY3JlbWVudCc6IDc2ODIsXG4gICdkZWNyZW1lbnQnOiA3NjgzLFxuICAnaW5jcmVtZW50IHdyYXAnOiAzNDA1NSxcbiAgJ2RlY3JlbWVudCB3cmFwJzogMzQwNTYsXG4gICdpbnZlcnQnOiA1Mzg2XG59XG5cbnZhciBzaGFkZXJUeXBlID0ge1xuICAnZnJhZyc6IEdMX0ZSQUdNRU5UX1NIQURFUixcbiAgJ3ZlcnQnOiBHTF9WRVJURVhfU0hBREVSXG59XG5cbnZhciBvcmllbnRhdGlvblR5cGUgPSB7XG4gICdjdyc6IEdMX0NXLFxuICAnY2N3JzogR0xfQ0NXXG59XG5cbmZ1bmN0aW9uIGlzQnVmZmVyQXJncyAoeCkge1xuICByZXR1cm4gQXJyYXkuaXNBcnJheSh4KSB8fFxuICAgIGlzVHlwZWRBcnJheSh4KSB8fFxuICAgIGlzTkRBcnJheSh4KVxufVxuXG4vLyBNYWtlIHN1cmUgdmlld3BvcnQgaXMgcHJvY2Vzc2VkIGZpcnN0XG5mdW5jdGlvbiBzb3J0U3RhdGUgKHN0YXRlKSB7XG4gIHJldHVybiBzdGF0ZS5zb3J0KGZ1bmN0aW9uIChhLCBiKSB7XG4gICAgaWYgKGEgPT09IFNfVklFV1BPUlQpIHtcbiAgICAgIHJldHVybiAtMVxuICAgIH0gZWxzZSBpZiAoYiA9PT0gU19WSUVXUE9SVCkge1xuICAgICAgcmV0dXJuIDFcbiAgICB9XG4gICAgcmV0dXJuIChhIDwgYikgPyAtMSA6IDFcbiAgfSlcbn1cblxuZnVuY3Rpb24gRGVjbGFyYXRpb24gKHRoaXNEZXAsIGNvbnRleHREZXAsIHByb3BEZXAsIGFwcGVuZCkge1xuICB0aGlzLnRoaXNEZXAgPSB0aGlzRGVwXG4gIHRoaXMuY29udGV4dERlcCA9IGNvbnRleHREZXBcbiAgdGhpcy5wcm9wRGVwID0gcHJvcERlcFxuICB0aGlzLmFwcGVuZCA9IGFwcGVuZFxufVxuXG5mdW5jdGlvbiBpc1N0YXRpYyAoZGVjbCkge1xuICByZXR1cm4gZGVjbCAmJiAhKGRlY2wudGhpc0RlcCB8fCBkZWNsLmNvbnRleHREZXAgfHwgZGVjbC5wcm9wRGVwKVxufVxuXG5mdW5jdGlvbiBjcmVhdGVTdGF0aWNEZWNsIChhcHBlbmQpIHtcbiAgcmV0dXJuIG5ldyBEZWNsYXJhdGlvbihmYWxzZSwgZmFsc2UsIGZhbHNlLCBhcHBlbmQpXG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUR5bmFtaWNEZWNsIChkeW4sIGFwcGVuZCkge1xuICB2YXIgdHlwZSA9IGR5bi50eXBlXG4gIGlmICh0eXBlID09PSBEWU5fRlVOQykge1xuICAgIHZhciBudW1BcmdzID0gZHluLmRhdGEubGVuZ3RoXG4gICAgcmV0dXJuIG5ldyBEZWNsYXJhdGlvbihcbiAgICAgIHRydWUsXG4gICAgICBudW1BcmdzID49IDEsXG4gICAgICBudW1BcmdzID49IDIsXG4gICAgICBhcHBlbmQpXG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gRFlOX1RIVU5LKSB7XG4gICAgdmFyIGRhdGEgPSBkeW4uZGF0YVxuICAgIHJldHVybiBuZXcgRGVjbGFyYXRpb24oXG4gICAgICBkYXRhLnRoaXNEZXAsXG4gICAgICBkYXRhLmNvbnRleHREZXAsXG4gICAgICBkYXRhLnByb3BEZXAsXG4gICAgICBhcHBlbmQpXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIG5ldyBEZWNsYXJhdGlvbihcbiAgICAgIHR5cGUgPT09IERZTl9TVEFURSxcbiAgICAgIHR5cGUgPT09IERZTl9DT05URVhULFxuICAgICAgdHlwZSA9PT0gRFlOX1BST1AsXG4gICAgICBhcHBlbmQpXG4gIH1cbn1cblxudmFyIFNDT1BFX0RFQ0wgPSBuZXcgRGVjbGFyYXRpb24oZmFsc2UsIGZhbHNlLCBmYWxzZSwgZnVuY3Rpb24gKCkge30pXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcmVnbENvcmUgKFxuICBnbCxcbiAgc3RyaW5nU3RvcmUsXG4gIGV4dGVuc2lvbnMsXG4gIGxpbWl0cyxcbiAgYnVmZmVyU3RhdGUsXG4gIGVsZW1lbnRTdGF0ZSxcbiAgdGV4dHVyZVN0YXRlLFxuICBmcmFtZWJ1ZmZlclN0YXRlLFxuICB1bmlmb3JtU3RhdGUsXG4gIGF0dHJpYnV0ZVN0YXRlLFxuICBzaGFkZXJTdGF0ZSxcbiAgZHJhd1N0YXRlLFxuICBjb250ZXh0U3RhdGUsXG4gIHRpbWVyLFxuICBjb25maWcpIHtcbiAgdmFyIEF0dHJpYnV0ZVJlY29yZCA9IGF0dHJpYnV0ZVN0YXRlLlJlY29yZFxuXG4gIHZhciBibGVuZEVxdWF0aW9ucyA9IHtcbiAgICAnYWRkJzogMzI3NzQsXG4gICAgJ3N1YnRyYWN0JzogMzI3NzgsXG4gICAgJ3JldmVyc2Ugc3VidHJhY3QnOiAzMjc3OVxuICB9XG4gIGlmIChleHRlbnNpb25zLmV4dF9ibGVuZF9taW5tYXgpIHtcbiAgICBibGVuZEVxdWF0aW9ucy5taW4gPSBHTF9NSU5fRVhUXG4gICAgYmxlbmRFcXVhdGlvbnMubWF4ID0gR0xfTUFYX0VYVFxuICB9XG5cbiAgdmFyIGV4dEluc3RhbmNpbmcgPSBleHRlbnNpb25zLmFuZ2xlX2luc3RhbmNlZF9hcnJheXNcbiAgdmFyIGV4dERyYXdCdWZmZXJzID0gZXh0ZW5zaW9ucy53ZWJnbF9kcmF3X2J1ZmZlcnNcblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIFdFQkdMIFNUQVRFXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgdmFyIGN1cnJlbnRTdGF0ZSA9IHtcbiAgICBkaXJ0eTogdHJ1ZSxcbiAgICBwcm9maWxlOiBjb25maWcucHJvZmlsZVxuICB9XG4gIHZhciBuZXh0U3RhdGUgPSB7fVxuICB2YXIgR0xfU1RBVEVfTkFNRVMgPSBbXVxuICB2YXIgR0xfRkxBR1MgPSB7fVxuICB2YXIgR0xfVkFSSUFCTEVTID0ge31cblxuICBmdW5jdGlvbiBwcm9wTmFtZSAobmFtZSkge1xuICAgIHJldHVybiBuYW1lLnJlcGxhY2UoJy4nLCAnXycpXG4gIH1cblxuICBmdW5jdGlvbiBzdGF0ZUZsYWcgKHNuYW1lLCBjYXAsIGluaXQpIHtcbiAgICB2YXIgbmFtZSA9IHByb3BOYW1lKHNuYW1lKVxuICAgIEdMX1NUQVRFX05BTUVTLnB1c2goc25hbWUpXG4gICAgbmV4dFN0YXRlW25hbWVdID0gY3VycmVudFN0YXRlW25hbWVdID0gISFpbml0XG4gICAgR0xfRkxBR1NbbmFtZV0gPSBjYXBcbiAgfVxuXG4gIGZ1bmN0aW9uIHN0YXRlVmFyaWFibGUgKHNuYW1lLCBmdW5jLCBpbml0KSB7XG4gICAgdmFyIG5hbWUgPSBwcm9wTmFtZShzbmFtZSlcbiAgICBHTF9TVEFURV9OQU1FUy5wdXNoKHNuYW1lKVxuICAgIGlmIChBcnJheS5pc0FycmF5KGluaXQpKSB7XG4gICAgICBjdXJyZW50U3RhdGVbbmFtZV0gPSBpbml0LnNsaWNlKClcbiAgICAgIG5leHRTdGF0ZVtuYW1lXSA9IGluaXQuc2xpY2UoKVxuICAgIH0gZWxzZSB7XG4gICAgICBjdXJyZW50U3RhdGVbbmFtZV0gPSBuZXh0U3RhdGVbbmFtZV0gPSBpbml0XG4gICAgfVxuICAgIEdMX1ZBUklBQkxFU1tuYW1lXSA9IGZ1bmNcbiAgfVxuXG4gIC8vIERpdGhlcmluZ1xuICBzdGF0ZUZsYWcoU19ESVRIRVIsIEdMX0RJVEhFUilcblxuICAvLyBCbGVuZGluZ1xuICBzdGF0ZUZsYWcoU19CTEVORF9FTkFCTEUsIEdMX0JMRU5EKVxuICBzdGF0ZVZhcmlhYmxlKFNfQkxFTkRfQ09MT1IsICdibGVuZENvbG9yJywgWzAsIDAsIDAsIDBdKVxuICBzdGF0ZVZhcmlhYmxlKFNfQkxFTkRfRVFVQVRJT04sICdibGVuZEVxdWF0aW9uU2VwYXJhdGUnLFxuICAgIFtHTF9GVU5DX0FERCwgR0xfRlVOQ19BRERdKVxuICBzdGF0ZVZhcmlhYmxlKFNfQkxFTkRfRlVOQywgJ2JsZW5kRnVuY1NlcGFyYXRlJyxcbiAgICBbR0xfT05FLCBHTF9aRVJPLCBHTF9PTkUsIEdMX1pFUk9dKVxuXG4gIC8vIERlcHRoXG4gIHN0YXRlRmxhZyhTX0RFUFRIX0VOQUJMRSwgR0xfREVQVEhfVEVTVCwgdHJ1ZSlcbiAgc3RhdGVWYXJpYWJsZShTX0RFUFRIX0ZVTkMsICdkZXB0aEZ1bmMnLCBHTF9MRVNTKVxuICBzdGF0ZVZhcmlhYmxlKFNfREVQVEhfUkFOR0UsICdkZXB0aFJhbmdlJywgWzAsIDFdKVxuICBzdGF0ZVZhcmlhYmxlKFNfREVQVEhfTUFTSywgJ2RlcHRoTWFzaycsIHRydWUpXG5cbiAgLy8gQ29sb3IgbWFza1xuICBzdGF0ZVZhcmlhYmxlKFNfQ09MT1JfTUFTSywgU19DT0xPUl9NQVNLLCBbdHJ1ZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZV0pXG5cbiAgLy8gRmFjZSBjdWxsaW5nXG4gIHN0YXRlRmxhZyhTX0NVTExfRU5BQkxFLCBHTF9DVUxMX0ZBQ0UpXG4gIHN0YXRlVmFyaWFibGUoU19DVUxMX0ZBQ0UsICdjdWxsRmFjZScsIEdMX0JBQ0spXG5cbiAgLy8gRnJvbnQgZmFjZSBvcmllbnRhdGlvblxuICBzdGF0ZVZhcmlhYmxlKFNfRlJPTlRfRkFDRSwgU19GUk9OVF9GQUNFLCBHTF9DQ1cpXG5cbiAgLy8gTGluZSB3aWR0aFxuICBzdGF0ZVZhcmlhYmxlKFNfTElORV9XSURUSCwgU19MSU5FX1dJRFRILCAxKVxuXG4gIC8vIFBvbHlnb24gb2Zmc2V0XG4gIHN0YXRlRmxhZyhTX1BPTFlHT05fT0ZGU0VUX0VOQUJMRSwgR0xfUE9MWUdPTl9PRkZTRVRfRklMTClcbiAgc3RhdGVWYXJpYWJsZShTX1BPTFlHT05fT0ZGU0VUX09GRlNFVCwgJ3BvbHlnb25PZmZzZXQnLCBbMCwgMF0pXG5cbiAgLy8gU2FtcGxlIGNvdmVyYWdlXG4gIHN0YXRlRmxhZyhTX1NBTVBMRV9BTFBIQSwgR0xfU0FNUExFX0FMUEhBX1RPX0NPVkVSQUdFKVxuICBzdGF0ZUZsYWcoU19TQU1QTEVfRU5BQkxFLCBHTF9TQU1QTEVfQ09WRVJBR0UpXG4gIHN0YXRlVmFyaWFibGUoU19TQU1QTEVfQ09WRVJBR0UsICdzYW1wbGVDb3ZlcmFnZScsIFsxLCBmYWxzZV0pXG5cbiAgLy8gU3RlbmNpbFxuICBzdGF0ZUZsYWcoU19TVEVOQ0lMX0VOQUJMRSwgR0xfU1RFTkNJTF9URVNUKVxuICBzdGF0ZVZhcmlhYmxlKFNfU1RFTkNJTF9NQVNLLCAnc3RlbmNpbE1hc2snLCAtMSlcbiAgc3RhdGVWYXJpYWJsZShTX1NURU5DSUxfRlVOQywgJ3N0ZW5jaWxGdW5jJywgW0dMX0FMV0FZUywgMCwgLTFdKVxuICBzdGF0ZVZhcmlhYmxlKFNfU1RFTkNJTF9PUEZST05ULCAnc3RlbmNpbE9wU2VwYXJhdGUnLFxuICAgIFtHTF9GUk9OVCwgR0xfS0VFUCwgR0xfS0VFUCwgR0xfS0VFUF0pXG4gIHN0YXRlVmFyaWFibGUoU19TVEVOQ0lMX09QQkFDSywgJ3N0ZW5jaWxPcFNlcGFyYXRlJyxcbiAgICBbR0xfQkFDSywgR0xfS0VFUCwgR0xfS0VFUCwgR0xfS0VFUF0pXG5cbiAgLy8gU2Npc3NvclxuICBzdGF0ZUZsYWcoU19TQ0lTU09SX0VOQUJMRSwgR0xfU0NJU1NPUl9URVNUKVxuICBzdGF0ZVZhcmlhYmxlKFNfU0NJU1NPUl9CT1gsICdzY2lzc29yJyxcbiAgICBbMCwgMCwgZ2wuZHJhd2luZ0J1ZmZlcldpZHRoLCBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0XSlcblxuICAvLyBWaWV3cG9ydFxuICBzdGF0ZVZhcmlhYmxlKFNfVklFV1BPUlQsIFNfVklFV1BPUlQsXG4gICAgWzAsIDAsIGdsLmRyYXdpbmdCdWZmZXJXaWR0aCwgZ2wuZHJhd2luZ0J1ZmZlckhlaWdodF0pXG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBFTlZJUk9OTUVOVFxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIHZhciBzaGFyZWRTdGF0ZSA9IHtcbiAgICBnbDogZ2wsXG4gICAgY29udGV4dDogY29udGV4dFN0YXRlLFxuICAgIHN0cmluZ3M6IHN0cmluZ1N0b3JlLFxuICAgIG5leHQ6IG5leHRTdGF0ZSxcbiAgICBjdXJyZW50OiBjdXJyZW50U3RhdGUsXG4gICAgZHJhdzogZHJhd1N0YXRlLFxuICAgIGVsZW1lbnRzOiBlbGVtZW50U3RhdGUsXG4gICAgYnVmZmVyOiBidWZmZXJTdGF0ZSxcbiAgICBzaGFkZXI6IHNoYWRlclN0YXRlLFxuICAgIGF0dHJpYnV0ZXM6IGF0dHJpYnV0ZVN0YXRlLnN0YXRlLFxuICAgIHVuaWZvcm1zOiB1bmlmb3JtU3RhdGUsXG4gICAgZnJhbWVidWZmZXI6IGZyYW1lYnVmZmVyU3RhdGUsXG4gICAgZXh0ZW5zaW9uczogZXh0ZW5zaW9ucyxcblxuICAgIHRpbWVyOiB0aW1lcixcbiAgICBpc0J1ZmZlckFyZ3M6IGlzQnVmZmVyQXJnc1xuICB9XG5cbiAgdmFyIHNoYXJlZENvbnN0YW50cyA9IHtcbiAgICBwcmltVHlwZXM6IHByaW1UeXBlcyxcbiAgICBjb21wYXJlRnVuY3M6IGNvbXBhcmVGdW5jcyxcbiAgICBibGVuZEZ1bmNzOiBibGVuZEZ1bmNzLFxuICAgIGJsZW5kRXF1YXRpb25zOiBibGVuZEVxdWF0aW9ucyxcbiAgICBzdGVuY2lsT3BzOiBzdGVuY2lsT3BzLFxuICAgIGdsVHlwZXM6IGdsVHlwZXMsXG4gICAgb3JpZW50YXRpb25UeXBlOiBvcmllbnRhdGlvblR5cGVcbiAgfVxuXG4gIFxuXG4gIGlmIChleHREcmF3QnVmZmVycykge1xuICAgIHNoYXJlZENvbnN0YW50cy5iYWNrQnVmZmVyID0gW0dMX0JBQ0tdXG4gICAgc2hhcmVkQ29uc3RhbnRzLmRyYXdCdWZmZXIgPSBsb29wKGxpbWl0cy5tYXhEcmF3YnVmZmVycywgZnVuY3Rpb24gKGkpIHtcbiAgICAgIGlmIChpID09PSAwKSB7XG4gICAgICAgIHJldHVybiBbMF1cbiAgICAgIH1cbiAgICAgIHJldHVybiBsb29wKGksIGZ1bmN0aW9uIChqKSB7XG4gICAgICAgIHJldHVybiBHTF9DT0xPUl9BVFRBQ0hNRU5UMCArIGpcbiAgICAgIH0pXG4gICAgfSlcbiAgfVxuXG4gIHZhciBkcmF3Q2FsbENvdW50ZXIgPSAwXG4gIGZ1bmN0aW9uIGNyZWF0ZVJFR0xFbnZpcm9ubWVudCAoKSB7XG4gICAgdmFyIGVudiA9IGNyZWF0ZUVudmlyb25tZW50KClcbiAgICB2YXIgbGluayA9IGVudi5saW5rXG4gICAgdmFyIGdsb2JhbCA9IGVudi5nbG9iYWxcbiAgICBlbnYuaWQgPSBkcmF3Q2FsbENvdW50ZXIrK1xuXG4gICAgZW52LmJhdGNoSWQgPSAnMCdcblxuICAgIC8vIGxpbmsgc2hhcmVkIHN0YXRlXG4gICAgdmFyIFNIQVJFRCA9IGxpbmsoc2hhcmVkU3RhdGUpXG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWQgPSB7XG4gICAgICBwcm9wczogJ2EwJ1xuICAgIH1cbiAgICBPYmplY3Qua2V5cyhzaGFyZWRTdGF0ZSkuZm9yRWFjaChmdW5jdGlvbiAocHJvcCkge1xuICAgICAgc2hhcmVkW3Byb3BdID0gZ2xvYmFsLmRlZihTSEFSRUQsICcuJywgcHJvcClcbiAgICB9KVxuXG4gICAgLy8gSW5qZWN0IHJ1bnRpbWUgYXNzZXJ0aW9uIHN0dWZmIGZvciBkZWJ1ZyBidWlsZHNcbiAgICBcblxuICAgIC8vIENvcHkgR0wgc3RhdGUgdmFyaWFibGVzIG92ZXJcbiAgICB2YXIgbmV4dFZhcnMgPSBlbnYubmV4dCA9IHt9XG4gICAgdmFyIGN1cnJlbnRWYXJzID0gZW52LmN1cnJlbnQgPSB7fVxuICAgIE9iamVjdC5rZXlzKEdMX1ZBUklBQkxFUykuZm9yRWFjaChmdW5jdGlvbiAodmFyaWFibGUpIHtcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KGN1cnJlbnRTdGF0ZVt2YXJpYWJsZV0pKSB7XG4gICAgICAgIG5leHRWYXJzW3ZhcmlhYmxlXSA9IGdsb2JhbC5kZWYoc2hhcmVkLm5leHQsICcuJywgdmFyaWFibGUpXG4gICAgICAgIGN1cnJlbnRWYXJzW3ZhcmlhYmxlXSA9IGdsb2JhbC5kZWYoc2hhcmVkLmN1cnJlbnQsICcuJywgdmFyaWFibGUpXG4gICAgICB9XG4gICAgfSlcblxuICAgIC8vIEluaXRpYWxpemUgc2hhcmVkIGNvbnN0YW50c1xuICAgIHZhciBjb25zdGFudHMgPSBlbnYuY29uc3RhbnRzID0ge31cbiAgICBPYmplY3Qua2V5cyhzaGFyZWRDb25zdGFudHMpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIGNvbnN0YW50c1tuYW1lXSA9IGdsb2JhbC5kZWYoSlNPTi5zdHJpbmdpZnkoc2hhcmVkQ29uc3RhbnRzW25hbWVdKSlcbiAgICB9KVxuXG4gICAgLy8gSGVscGVyIGZ1bmN0aW9uIGZvciBjYWxsaW5nIGEgYmxvY2tcbiAgICBlbnYuaW52b2tlID0gZnVuY3Rpb24gKGJsb2NrLCB4KSB7XG4gICAgICBzd2l0Y2ggKHgudHlwZSkge1xuICAgICAgICBjYXNlIERZTl9GVU5DOlxuICAgICAgICAgIHZhciBhcmdMaXN0ID0gW1xuICAgICAgICAgICAgJ3RoaXMnLFxuICAgICAgICAgICAgc2hhcmVkLmNvbnRleHQsXG4gICAgICAgICAgICBzaGFyZWQucHJvcHMsXG4gICAgICAgICAgICBlbnYuYmF0Y2hJZFxuICAgICAgICAgIF1cbiAgICAgICAgICByZXR1cm4gYmxvY2suZGVmKFxuICAgICAgICAgICAgbGluayh4LmRhdGEpLCAnLmNhbGwoJyxcbiAgICAgICAgICAgICAgYXJnTGlzdC5zbGljZSgwLCBNYXRoLm1heCh4LmRhdGEubGVuZ3RoICsgMSwgNCkpLFxuICAgICAgICAgICAgICcpJylcbiAgICAgICAgY2FzZSBEWU5fUFJPUDpcbiAgICAgICAgICByZXR1cm4gYmxvY2suZGVmKHNoYXJlZC5wcm9wcywgeC5kYXRhKVxuICAgICAgICBjYXNlIERZTl9DT05URVhUOlxuICAgICAgICAgIHJldHVybiBibG9jay5kZWYoc2hhcmVkLmNvbnRleHQsIHguZGF0YSlcbiAgICAgICAgY2FzZSBEWU5fU1RBVEU6XG4gICAgICAgICAgcmV0dXJuIGJsb2NrLmRlZigndGhpcycsIHguZGF0YSlcbiAgICAgICAgY2FzZSBEWU5fVEhVTks6XG4gICAgICAgICAgeC5kYXRhLmFwcGVuZChlbnYsIGJsb2NrKVxuICAgICAgICAgIHJldHVybiB4LmRhdGEucmVmXG4gICAgICB9XG4gICAgfVxuXG4gICAgZW52LmF0dHJpYkNhY2hlID0ge31cblxuICAgIHZhciBzY29wZUF0dHJpYnMgPSB7fVxuICAgIGVudi5zY29wZUF0dHJpYiA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICB2YXIgaWQgPSBzdHJpbmdTdG9yZS5pZChuYW1lKVxuICAgICAgaWYgKGlkIGluIHNjb3BlQXR0cmlicykge1xuICAgICAgICByZXR1cm4gc2NvcGVBdHRyaWJzW2lkXVxuICAgICAgfVxuICAgICAgdmFyIGJpbmRpbmcgPSBhdHRyaWJ1dGVTdGF0ZS5zY29wZVtpZF1cbiAgICAgIGlmICghYmluZGluZykge1xuICAgICAgICBiaW5kaW5nID0gYXR0cmlidXRlU3RhdGUuc2NvcGVbaWRdID0gbmV3IEF0dHJpYnV0ZVJlY29yZCgpXG4gICAgICB9XG4gICAgICB2YXIgcmVzdWx0ID0gc2NvcGVBdHRyaWJzW2lkXSA9IGxpbmsoYmluZGluZylcbiAgICAgIHJldHVybiByZXN1bHRcbiAgICB9XG5cbiAgICByZXR1cm4gZW52XG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIFBBUlNJTkdcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICBmdW5jdGlvbiBwYXJzZVByb2ZpbGUgKG9wdGlvbnMpIHtcbiAgICB2YXIgc3RhdGljT3B0aW9ucyA9IG9wdGlvbnMuc3RhdGljXG4gICAgdmFyIGR5bmFtaWNPcHRpb25zID0gb3B0aW9ucy5keW5hbWljXG5cbiAgICB2YXIgcHJvZmlsZUVuYWJsZVxuICAgIGlmIChTX1BST0ZJTEUgaW4gc3RhdGljT3B0aW9ucykge1xuICAgICAgdmFyIHZhbHVlID0gISFzdGF0aWNPcHRpb25zW1NfUFJPRklMRV1cbiAgICAgIHByb2ZpbGVFbmFibGUgPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgIHJldHVybiB2YWx1ZVxuICAgICAgfSlcbiAgICAgIHByb2ZpbGVFbmFibGUuZW5hYmxlID0gdmFsdWVcbiAgICB9IGVsc2UgaWYgKFNfUFJPRklMRSBpbiBkeW5hbWljT3B0aW9ucykge1xuICAgICAgdmFyIGR5biA9IGR5bmFtaWNPcHRpb25zW1NfUFJPRklMRV1cbiAgICAgIHByb2ZpbGVFbmFibGUgPSBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgIHJldHVybiBlbnYuaW52b2tlKHNjb3BlLCBkeW4pXG4gICAgICB9KVxuICAgIH1cblxuICAgIHJldHVybiBwcm9maWxlRW5hYmxlXG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZUZyYW1lYnVmZmVyIChvcHRpb25zLCBlbnYpIHtcbiAgICB2YXIgc3RhdGljT3B0aW9ucyA9IG9wdGlvbnMuc3RhdGljXG4gICAgdmFyIGR5bmFtaWNPcHRpb25zID0gb3B0aW9ucy5keW5hbWljXG5cbiAgICBpZiAoU19GUkFNRUJVRkZFUiBpbiBzdGF0aWNPcHRpb25zKSB7XG4gICAgICB2YXIgZnJhbWVidWZmZXIgPSBzdGF0aWNPcHRpb25zW1NfRlJBTUVCVUZGRVJdXG4gICAgICBpZiAoZnJhbWVidWZmZXIpIHtcbiAgICAgICAgZnJhbWVidWZmZXIgPSBmcmFtZWJ1ZmZlclN0YXRlLmdldEZyYW1lYnVmZmVyKGZyYW1lYnVmZmVyKVxuICAgICAgICBcbiAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgYmxvY2spIHtcbiAgICAgICAgICB2YXIgRlJBTUVCVUZGRVIgPSBlbnYubGluayhmcmFtZWJ1ZmZlcilcbiAgICAgICAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuICAgICAgICAgIGJsb2NrLnNldChcbiAgICAgICAgICAgIHNoYXJlZC5mcmFtZWJ1ZmZlcixcbiAgICAgICAgICAgICcubmV4dCcsXG4gICAgICAgICAgICBGUkFNRUJVRkZFUilcbiAgICAgICAgICB2YXIgQ09OVEVYVCA9IHNoYXJlZC5jb250ZXh0XG4gICAgICAgICAgYmxvY2suc2V0KFxuICAgICAgICAgICAgQ09OVEVYVCxcbiAgICAgICAgICAgICcuJyArIFNfRlJBTUVCVUZGRVJfV0lEVEgsXG4gICAgICAgICAgICBGUkFNRUJVRkZFUiArICcud2lkdGgnKVxuICAgICAgICAgIGJsb2NrLnNldChcbiAgICAgICAgICAgIENPTlRFWFQsXG4gICAgICAgICAgICAnLicgKyBTX0ZSQU1FQlVGRkVSX0hFSUdIVCxcbiAgICAgICAgICAgIEZSQU1FQlVGRkVSICsgJy5oZWlnaHQnKVxuICAgICAgICAgIHJldHVybiBGUkFNRUJVRkZFUlxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuICAgICAgICAgIHNjb3BlLnNldChcbiAgICAgICAgICAgIHNoYXJlZC5mcmFtZWJ1ZmZlcixcbiAgICAgICAgICAgICcubmV4dCcsXG4gICAgICAgICAgICAnbnVsbCcpXG4gICAgICAgICAgdmFyIENPTlRFWFQgPSBzaGFyZWQuY29udGV4dFxuICAgICAgICAgIHNjb3BlLnNldChcbiAgICAgICAgICAgIENPTlRFWFQsXG4gICAgICAgICAgICAnLicgKyBTX0ZSQU1FQlVGRkVSX1dJRFRILFxuICAgICAgICAgICAgQ09OVEVYVCArICcuJyArIFNfRFJBV0lOR0JVRkZFUl9XSURUSClcbiAgICAgICAgICBzY29wZS5zZXQoXG4gICAgICAgICAgICBDT05URVhULFxuICAgICAgICAgICAgJy4nICsgU19GUkFNRUJVRkZFUl9IRUlHSFQsXG4gICAgICAgICAgICBDT05URVhUICsgJy4nICsgU19EUkFXSU5HQlVGRkVSX0hFSUdIVClcbiAgICAgICAgICByZXR1cm4gJ251bGwnXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChTX0ZSQU1FQlVGRkVSIGluIGR5bmFtaWNPcHRpb25zKSB7XG4gICAgICB2YXIgZHluID0gZHluYW1pY09wdGlvbnNbU19GUkFNRUJVRkZFUl1cbiAgICAgIHJldHVybiBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgIHZhciBGUkFNRUJVRkZFUl9GVU5DID0gZW52Lmludm9rZShzY29wZSwgZHluKVxuICAgICAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuICAgICAgICB2YXIgRlJBTUVCVUZGRVJfU1RBVEUgPSBzaGFyZWQuZnJhbWVidWZmZXJcbiAgICAgICAgdmFyIEZSQU1FQlVGRkVSID0gc2NvcGUuZGVmKFxuICAgICAgICAgIEZSQU1FQlVGRkVSX1NUQVRFLCAnLmdldEZyYW1lYnVmZmVyKCcsIEZSQU1FQlVGRkVSX0ZVTkMsICcpJylcblxuICAgICAgICBcblxuICAgICAgICBzY29wZS5zZXQoXG4gICAgICAgICAgRlJBTUVCVUZGRVJfU1RBVEUsXG4gICAgICAgICAgJy5uZXh0JyxcbiAgICAgICAgICBGUkFNRUJVRkZFUilcbiAgICAgICAgdmFyIENPTlRFWFQgPSBzaGFyZWQuY29udGV4dFxuICAgICAgICBzY29wZS5zZXQoXG4gICAgICAgICAgQ09OVEVYVCxcbiAgICAgICAgICAnLicgKyBTX0ZSQU1FQlVGRkVSX1dJRFRILFxuICAgICAgICAgIEZSQU1FQlVGRkVSICsgJz8nICsgRlJBTUVCVUZGRVIgKyAnLndpZHRoOicgK1xuICAgICAgICAgIENPTlRFWFQgKyAnLicgKyBTX0RSQVdJTkdCVUZGRVJfV0lEVEgpXG4gICAgICAgIHNjb3BlLnNldChcbiAgICAgICAgICBDT05URVhULFxuICAgICAgICAgICcuJyArIFNfRlJBTUVCVUZGRVJfSEVJR0hULFxuICAgICAgICAgIEZSQU1FQlVGRkVSICtcbiAgICAgICAgICAnPycgKyBGUkFNRUJVRkZFUiArICcuaGVpZ2h0OicgK1xuICAgICAgICAgIENPTlRFWFQgKyAnLicgKyBTX0RSQVdJTkdCVUZGRVJfSEVJR0hUKVxuICAgICAgICByZXR1cm4gRlJBTUVCVUZGRVJcbiAgICAgIH0pXG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VWaWV3cG9ydFNjaXNzb3IgKG9wdGlvbnMsIGZyYW1lYnVmZmVyLCBlbnYpIHtcbiAgICB2YXIgc3RhdGljT3B0aW9ucyA9IG9wdGlvbnMuc3RhdGljXG4gICAgdmFyIGR5bmFtaWNPcHRpb25zID0gb3B0aW9ucy5keW5hbWljXG5cbiAgICBmdW5jdGlvbiBwYXJzZUJveCAocGFyYW0pIHtcbiAgICAgIGlmIChwYXJhbSBpbiBzdGF0aWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBib3ggPSBzdGF0aWNPcHRpb25zW3BhcmFtXVxuICAgICAgICBcblxuICAgICAgICB2YXIgaXNTdGF0aWMgPSB0cnVlXG4gICAgICAgIHZhciB4ID0gYm94LnggfCAwXG4gICAgICAgIHZhciB5ID0gYm94LnkgfCAwXG4gICAgICAgIHZhciB3LCBoXG4gICAgICAgIGlmICgnd2lkdGgnIGluIGJveCkge1xuICAgICAgICAgIHcgPSBib3gud2lkdGggfCAwXG4gICAgICAgICAgXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaXNTdGF0aWMgPSBmYWxzZVxuICAgICAgICB9XG4gICAgICAgIGlmICgnaGVpZ2h0JyBpbiBib3gpIHtcbiAgICAgICAgICBoID0gYm94LmhlaWdodCB8IDBcbiAgICAgICAgICBcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpc1N0YXRpYyA9IGZhbHNlXG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgICAgICFpc1N0YXRpYyAmJiBmcmFtZWJ1ZmZlciAmJiBmcmFtZWJ1ZmZlci50aGlzRGVwLFxuICAgICAgICAgICFpc1N0YXRpYyAmJiBmcmFtZWJ1ZmZlciAmJiBmcmFtZWJ1ZmZlci5jb250ZXh0RGVwLFxuICAgICAgICAgICFpc1N0YXRpYyAmJiBmcmFtZWJ1ZmZlciAmJiBmcmFtZWJ1ZmZlci5wcm9wRGVwLFxuICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgICB2YXIgQ09OVEVYVCA9IGVudi5zaGFyZWQuY29udGV4dFxuICAgICAgICAgICAgdmFyIEJPWF9XID0gd1xuICAgICAgICAgICAgaWYgKCEoJ3dpZHRoJyBpbiBib3gpKSB7XG4gICAgICAgICAgICAgIEJPWF9XID0gc2NvcGUuZGVmKENPTlRFWFQsICcuJywgU19GUkFNRUJVRkZFUl9XSURUSCwgJy0nLCB4KVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIEJPWF9IID0gaFxuICAgICAgICAgICAgaWYgKCEoJ2hlaWdodCcgaW4gYm94KSkge1xuICAgICAgICAgICAgICBCT1hfSCA9IHNjb3BlLmRlZihDT05URVhULCAnLicsIFNfRlJBTUVCVUZGRVJfSEVJR0hULCAnLScsIHkpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gW3gsIHksIEJPWF9XLCBCT1hfSF1cbiAgICAgICAgICB9KVxuICAgICAgfSBlbHNlIGlmIChwYXJhbSBpbiBkeW5hbWljT3B0aW9ucykge1xuICAgICAgICB2YXIgZHluQm94ID0gZHluYW1pY09wdGlvbnNbcGFyYW1dXG4gICAgICAgIHZhciByZXN1bHQgPSBjcmVhdGVEeW5hbWljRGVjbChkeW5Cb3gsIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgdmFyIEJPWCA9IGVudi5pbnZva2Uoc2NvcGUsIGR5bkJveClcblxuICAgICAgICAgIFxuXG4gICAgICAgICAgdmFyIENPTlRFWFQgPSBlbnYuc2hhcmVkLmNvbnRleHRcbiAgICAgICAgICB2YXIgQk9YX1ggPSBzY29wZS5kZWYoQk9YLCAnLnh8MCcpXG4gICAgICAgICAgdmFyIEJPWF9ZID0gc2NvcGUuZGVmKEJPWCwgJy55fDAnKVxuICAgICAgICAgIHZhciBCT1hfVyA9IHNjb3BlLmRlZihcbiAgICAgICAgICAgICdcIndpZHRoXCIgaW4gJywgQk9YLCAnPycsIEJPWCwgJy53aWR0aHwwOicsXG4gICAgICAgICAgICAnKCcsIENPTlRFWFQsICcuJywgU19GUkFNRUJVRkZFUl9XSURUSCwgJy0nLCBCT1hfWCwgJyknKVxuICAgICAgICAgIHZhciBCT1hfSCA9IHNjb3BlLmRlZihcbiAgICAgICAgICAgICdcImhlaWdodFwiIGluICcsIEJPWCwgJz8nLCBCT1gsICcuaGVpZ2h0fDA6JyxcbiAgICAgICAgICAgICcoJywgQ09OVEVYVCwgJy4nLCBTX0ZSQU1FQlVGRkVSX0hFSUdIVCwgJy0nLCBCT1hfWSwgJyknKVxuXG4gICAgICAgICAgXG5cbiAgICAgICAgICByZXR1cm4gW0JPWF9YLCBCT1hfWSwgQk9YX1csIEJPWF9IXVxuICAgICAgICB9KVxuICAgICAgICBpZiAoZnJhbWVidWZmZXIpIHtcbiAgICAgICAgICByZXN1bHQudGhpc0RlcCA9IHJlc3VsdC50aGlzRGVwIHx8IGZyYW1lYnVmZmVyLnRoaXNEZXBcbiAgICAgICAgICByZXN1bHQuY29udGV4dERlcCA9IHJlc3VsdC5jb250ZXh0RGVwIHx8IGZyYW1lYnVmZmVyLmNvbnRleHREZXBcbiAgICAgICAgICByZXN1bHQucHJvcERlcCA9IHJlc3VsdC5wcm9wRGVwIHx8IGZyYW1lYnVmZmVyLnByb3BEZXBcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICB9IGVsc2UgaWYgKGZyYW1lYnVmZmVyKSB7XG4gICAgICAgIHJldHVybiBuZXcgRGVjbGFyYXRpb24oXG4gICAgICAgICAgZnJhbWVidWZmZXIudGhpc0RlcCxcbiAgICAgICAgICBmcmFtZWJ1ZmZlci5jb250ZXh0RGVwLFxuICAgICAgICAgIGZyYW1lYnVmZmVyLnByb3BEZXAsXG4gICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICAgIHZhciBDT05URVhUID0gZW52LnNoYXJlZC5jb250ZXh0XG4gICAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgICAwLCAwLFxuICAgICAgICAgICAgICBzY29wZS5kZWYoQ09OVEVYVCwgJy4nLCBTX0ZSQU1FQlVGRkVSX1dJRFRIKSxcbiAgICAgICAgICAgICAgc2NvcGUuZGVmKENPTlRFWFQsICcuJywgU19GUkFNRUJVRkZFUl9IRUlHSFQpXVxuICAgICAgICAgIH0pXG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gbnVsbFxuICAgICAgfVxuICAgIH1cblxuICAgIHZhciB2aWV3cG9ydCA9IHBhcnNlQm94KFNfVklFV1BPUlQpXG5cbiAgICBpZiAodmlld3BvcnQpIHtcbiAgICAgIHZhciBwcmV2Vmlld3BvcnQgPSB2aWV3cG9ydFxuICAgICAgdmlld3BvcnQgPSBuZXcgRGVjbGFyYXRpb24oXG4gICAgICAgIHZpZXdwb3J0LnRoaXNEZXAsXG4gICAgICAgIHZpZXdwb3J0LmNvbnRleHREZXAsXG4gICAgICAgIHZpZXdwb3J0LnByb3BEZXAsXG4gICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgdmFyIFZJRVdQT1JUID0gcHJldlZpZXdwb3J0LmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgICAgIHZhciBDT05URVhUID0gZW52LnNoYXJlZC5jb250ZXh0XG4gICAgICAgICAgc2NvcGUuc2V0KFxuICAgICAgICAgICAgQ09OVEVYVCxcbiAgICAgICAgICAgICcuJyArIFNfVklFV1BPUlRfV0lEVEgsXG4gICAgICAgICAgICBWSUVXUE9SVFsyXSlcbiAgICAgICAgICBzY29wZS5zZXQoXG4gICAgICAgICAgICBDT05URVhULFxuICAgICAgICAgICAgJy4nICsgU19WSUVXUE9SVF9IRUlHSFQsXG4gICAgICAgICAgICBWSUVXUE9SVFszXSlcbiAgICAgICAgICByZXR1cm4gVklFV1BPUlRcbiAgICAgICAgfSlcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgdmlld3BvcnQ6IHZpZXdwb3J0LFxuICAgICAgc2Npc3Nvcl9ib3g6IHBhcnNlQm94KFNfU0NJU1NPUl9CT1gpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VQcm9ncmFtIChvcHRpb25zKSB7XG4gICAgdmFyIHN0YXRpY09wdGlvbnMgPSBvcHRpb25zLnN0YXRpY1xuICAgIHZhciBkeW5hbWljT3B0aW9ucyA9IG9wdGlvbnMuZHluYW1pY1xuXG4gICAgZnVuY3Rpb24gcGFyc2VTaGFkZXIgKG5hbWUpIHtcbiAgICAgIGlmIChuYW1lIGluIHN0YXRpY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIGlkID0gc3RyaW5nU3RvcmUuaWQoc3RhdGljT3B0aW9uc1tuYW1lXSlcbiAgICAgICAgXG4gICAgICAgIHZhciByZXN1bHQgPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICByZXR1cm4gaWRcbiAgICAgICAgfSlcbiAgICAgICAgcmVzdWx0LmlkID0gaWRcbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgfSBlbHNlIGlmIChuYW1lIGluIGR5bmFtaWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBkeW4gPSBkeW5hbWljT3B0aW9uc1tuYW1lXVxuICAgICAgICByZXR1cm4gY3JlYXRlRHluYW1pY0RlY2woZHluLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciBzdHIgPSBlbnYuaW52b2tlKHNjb3BlLCBkeW4pXG4gICAgICAgICAgdmFyIGlkID0gc2NvcGUuZGVmKGVudi5zaGFyZWQuc3RyaW5ncywgJy5pZCgnLCBzdHIsICcpJylcbiAgICAgICAgICBcbiAgICAgICAgICByZXR1cm4gaWRcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuXG4gICAgdmFyIGZyYWcgPSBwYXJzZVNoYWRlcihTX0ZSQUcpXG4gICAgdmFyIHZlcnQgPSBwYXJzZVNoYWRlcihTX1ZFUlQpXG5cbiAgICB2YXIgcHJvZ3JhbSA9IG51bGxcbiAgICB2YXIgcHJvZ1ZhclxuICAgIGlmIChpc1N0YXRpYyhmcmFnKSAmJiBpc1N0YXRpYyh2ZXJ0KSkge1xuICAgICAgcHJvZ3JhbSA9IHNoYWRlclN0YXRlLnByb2dyYW0odmVydC5pZCwgZnJhZy5pZClcbiAgICAgIHByb2dWYXIgPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgIHJldHVybiBlbnYubGluayhwcm9ncmFtKVxuICAgICAgfSlcbiAgICB9IGVsc2Uge1xuICAgICAgcHJvZ1ZhciA9IG5ldyBEZWNsYXJhdGlvbihcbiAgICAgICAgKGZyYWcgJiYgZnJhZy50aGlzRGVwKSB8fCAodmVydCAmJiB2ZXJ0LnRoaXNEZXApLFxuICAgICAgICAoZnJhZyAmJiBmcmFnLmNvbnRleHREZXApIHx8ICh2ZXJ0ICYmIHZlcnQuY29udGV4dERlcCksXG4gICAgICAgIChmcmFnICYmIGZyYWcucHJvcERlcCkgfHwgKHZlcnQgJiYgdmVydC5wcm9wRGVwKSxcbiAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICB2YXIgU0hBREVSX1NUQVRFID0gZW52LnNoYXJlZC5zaGFkZXJcbiAgICAgICAgICB2YXIgZnJhZ0lkXG4gICAgICAgICAgaWYgKGZyYWcpIHtcbiAgICAgICAgICAgIGZyYWdJZCA9IGZyYWcuYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGZyYWdJZCA9IHNjb3BlLmRlZihTSEFERVJfU1RBVEUsICcuJywgU19GUkFHKVxuICAgICAgICAgIH1cbiAgICAgICAgICB2YXIgdmVydElkXG4gICAgICAgICAgaWYgKHZlcnQpIHtcbiAgICAgICAgICAgIHZlcnRJZCA9IHZlcnQuYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZlcnRJZCA9IHNjb3BlLmRlZihTSEFERVJfU1RBVEUsICcuJywgU19WRVJUKVxuICAgICAgICAgIH1cbiAgICAgICAgICB2YXIgcHJvZ0RlZiA9IFNIQURFUl9TVEFURSArICcucHJvZ3JhbSgnICsgdmVydElkICsgJywnICsgZnJhZ0lkXG4gICAgICAgICAgXG4gICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihwcm9nRGVmICsgJyknKVxuICAgICAgICB9KVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBmcmFnOiBmcmFnLFxuICAgICAgdmVydDogdmVydCxcbiAgICAgIHByb2dWYXI6IHByb2dWYXIsXG4gICAgICBwcm9ncmFtOiBwcm9ncmFtXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VEcmF3IChvcHRpb25zLCBlbnYpIHtcbiAgICB2YXIgc3RhdGljT3B0aW9ucyA9IG9wdGlvbnMuc3RhdGljXG4gICAgdmFyIGR5bmFtaWNPcHRpb25zID0gb3B0aW9ucy5keW5hbWljXG5cbiAgICBmdW5jdGlvbiBwYXJzZUVsZW1lbnRzICgpIHtcbiAgICAgIGlmIChTX0VMRU1FTlRTIGluIHN0YXRpY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIGVsZW1lbnRzID0gc3RhdGljT3B0aW9uc1tTX0VMRU1FTlRTXVxuICAgICAgICBpZiAoaXNCdWZmZXJBcmdzKGVsZW1lbnRzKSkge1xuICAgICAgICAgIGVsZW1lbnRzID0gZWxlbWVudFN0YXRlLmdldEVsZW1lbnRzKGVsZW1lbnRTdGF0ZS5jcmVhdGUoZWxlbWVudHMsIHRydWUpKVxuICAgICAgICB9IGVsc2UgaWYgKGVsZW1lbnRzKSB7XG4gICAgICAgICAgZWxlbWVudHMgPSBlbGVtZW50U3RhdGUuZ2V0RWxlbWVudHMoZWxlbWVudHMpXG4gICAgICAgICAgXG4gICAgICAgIH1cbiAgICAgICAgdmFyIHJlc3VsdCA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICBpZiAoZWxlbWVudHMpIHtcbiAgICAgICAgICAgIHZhciByZXN1bHQgPSBlbnYubGluayhlbGVtZW50cylcbiAgICAgICAgICAgIGVudi5FTEVNRU5UUyA9IHJlc3VsdFxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgICAgIH1cbiAgICAgICAgICBlbnYuRUxFTUVOVFMgPSBudWxsXG4gICAgICAgICAgcmV0dXJuIG51bGxcbiAgICAgICAgfSlcbiAgICAgICAgcmVzdWx0LnZhbHVlID0gZWxlbWVudHNcbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgfSBlbHNlIGlmIChTX0VMRU1FTlRTIGluIGR5bmFtaWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBkeW4gPSBkeW5hbWljT3B0aW9uc1tTX0VMRU1FTlRTXVxuICAgICAgICByZXR1cm4gY3JlYXRlRHluYW1pY0RlY2woZHluLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG5cbiAgICAgICAgICB2YXIgSVNfQlVGRkVSX0FSR1MgPSBzaGFyZWQuaXNCdWZmZXJBcmdzXG4gICAgICAgICAgdmFyIEVMRU1FTlRfU1RBVEUgPSBzaGFyZWQuZWxlbWVudHNcblxuICAgICAgICAgIHZhciBlbGVtZW50RGVmbiA9IGVudi5pbnZva2Uoc2NvcGUsIGR5bilcbiAgICAgICAgICB2YXIgZWxlbWVudHMgPSBzY29wZS5kZWYoJ251bGwnKVxuICAgICAgICAgIHZhciBlbGVtZW50U3RyZWFtID0gc2NvcGUuZGVmKElTX0JVRkZFUl9BUkdTLCAnKCcsIGVsZW1lbnREZWZuLCAnKScpXG5cbiAgICAgICAgICB2YXIgaWZ0ZSA9IGVudi5jb25kKGVsZW1lbnRTdHJlYW0pXG4gICAgICAgICAgICAudGhlbihlbGVtZW50cywgJz0nLCBFTEVNRU5UX1NUQVRFLCAnLmNyZWF0ZVN0cmVhbSgnLCBlbGVtZW50RGVmbiwgJyk7JylcbiAgICAgICAgICAgIC5lbHNlKGVsZW1lbnRzLCAnPScsIEVMRU1FTlRfU1RBVEUsICcuZ2V0RWxlbWVudHMoJywgZWxlbWVudERlZm4sICcpOycpXG5cbiAgICAgICAgICBcblxuICAgICAgICAgIHNjb3BlLmVudHJ5KGlmdGUpXG4gICAgICAgICAgc2NvcGUuZXhpdChcbiAgICAgICAgICAgIGVudi5jb25kKGVsZW1lbnRTdHJlYW0pXG4gICAgICAgICAgICAgIC50aGVuKEVMRU1FTlRfU1RBVEUsICcuZGVzdHJveVN0cmVhbSgnLCBlbGVtZW50cywgJyk7JykpXG5cbiAgICAgICAgICBlbnYuRUxFTUVOVFMgPSBlbGVtZW50c1xuXG4gICAgICAgICAgcmV0dXJuIGVsZW1lbnRzXG4gICAgICAgIH0pXG4gICAgICB9XG5cbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuXG4gICAgdmFyIGVsZW1lbnRzID0gcGFyc2VFbGVtZW50cygpXG5cbiAgICBmdW5jdGlvbiBwYXJzZVByaW1pdGl2ZSAoKSB7XG4gICAgICBpZiAoU19QUklNSVRJVkUgaW4gc3RhdGljT3B0aW9ucykge1xuICAgICAgICB2YXIgcHJpbWl0aXZlID0gc3RhdGljT3B0aW9uc1tTX1BSSU1JVElWRV1cbiAgICAgICAgXG4gICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgcmV0dXJuIHByaW1UeXBlc1twcmltaXRpdmVdXG4gICAgICAgIH0pXG4gICAgICB9IGVsc2UgaWYgKFNfUFJJTUlUSVZFIGluIGR5bmFtaWNPcHRpb25zKSB7XG4gICAgICAgIHZhciBkeW5QcmltaXRpdmUgPSBkeW5hbWljT3B0aW9uc1tTX1BSSU1JVElWRV1cbiAgICAgICAgcmV0dXJuIGNyZWF0ZUR5bmFtaWNEZWNsKGR5blByaW1pdGl2ZSwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICB2YXIgUFJJTV9UWVBFUyA9IGVudi5jb25zdGFudHMucHJpbVR5cGVzXG4gICAgICAgICAgdmFyIHByaW0gPSBlbnYuaW52b2tlKHNjb3BlLCBkeW5QcmltaXRpdmUpXG4gICAgICAgICAgXG4gICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihQUklNX1RZUEVTLCAnWycsIHByaW0sICddJylcbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSBpZiAoZWxlbWVudHMpIHtcbiAgICAgICAgaWYgKGlzU3RhdGljKGVsZW1lbnRzKSkge1xuICAgICAgICAgIGlmIChlbGVtZW50cy52YWx1ZSkge1xuICAgICAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihlbnYuRUxFTUVOVFMsICcucHJpbVR5cGUnKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICByZXR1cm4gR0xfVFJJQU5HTEVTXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgICAgICAgZWxlbWVudHMudGhpc0RlcCxcbiAgICAgICAgICAgIGVsZW1lbnRzLmNvbnRleHREZXAsXG4gICAgICAgICAgICBlbGVtZW50cy5wcm9wRGVwLFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICAgICAgdmFyIGVsZW1lbnRzID0gZW52LkVMRU1FTlRTXG4gICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoZWxlbWVudHMsICc/JywgZWxlbWVudHMsICcucHJpbVR5cGU6JywgR0xfVFJJQU5HTEVTKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwYXJzZVBhcmFtIChwYXJhbSwgaXNPZmZzZXQpIHtcbiAgICAgIGlmIChwYXJhbSBpbiBzdGF0aWNPcHRpb25zKSB7XG4gICAgICAgIHZhciB2YWx1ZSA9IHN0YXRpY09wdGlvbnNbcGFyYW1dIHwgMFxuICAgICAgICBcbiAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICBpZiAoaXNPZmZzZXQpIHtcbiAgICAgICAgICAgIGVudi5PRkZTRVQgPSB2YWx1ZVxuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdmFsdWVcbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSBpZiAocGFyYW0gaW4gZHluYW1pY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIGR5blZhbHVlID0gZHluYW1pY09wdGlvbnNbcGFyYW1dXG4gICAgICAgIHJldHVybiBjcmVhdGVEeW5hbWljRGVjbChkeW5WYWx1ZSwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICB2YXIgcmVzdWx0ID0gZW52Lmludm9rZShzY29wZSwgZHluVmFsdWUpXG4gICAgICAgICAgaWYgKGlzT2Zmc2V0KSB7XG4gICAgICAgICAgICBlbnYuT0ZGU0VUID0gcmVzdWx0XG4gICAgICAgICAgICBcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIGlmIChpc09mZnNldCAmJiBlbGVtZW50cykge1xuICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xuICAgICAgICAgIGVudi5PRkZTRVQgPSAnMCdcbiAgICAgICAgICByZXR1cm4gMFxuICAgICAgICB9KVxuICAgICAgfVxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG5cbiAgICB2YXIgT0ZGU0VUID0gcGFyc2VQYXJhbShTX09GRlNFVCwgdHJ1ZSlcblxuICAgIGZ1bmN0aW9uIHBhcnNlVmVydENvdW50ICgpIHtcbiAgICAgIGlmIChTX0NPVU5UIGluIHN0YXRpY09wdGlvbnMpIHtcbiAgICAgICAgdmFyIGNvdW50ID0gc3RhdGljT3B0aW9uc1tTX0NPVU5UXSB8IDBcbiAgICAgICAgXG4gICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICByZXR1cm4gY291bnRcbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSBpZiAoU19DT1VOVCBpbiBkeW5hbWljT3B0aW9ucykge1xuICAgICAgICB2YXIgZHluQ291bnQgPSBkeW5hbWljT3B0aW9uc1tTX0NPVU5UXVxuICAgICAgICByZXR1cm4gY3JlYXRlRHluYW1pY0RlY2woZHluQ291bnQsIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgdmFyIHJlc3VsdCA9IGVudi5pbnZva2Uoc2NvcGUsIGR5bkNvdW50KVxuICAgICAgICAgIFxuICAgICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSBpZiAoZWxlbWVudHMpIHtcbiAgICAgICAgaWYgKGlzU3RhdGljKGVsZW1lbnRzKSkge1xuICAgICAgICAgIGlmIChlbGVtZW50cykge1xuICAgICAgICAgICAgaWYgKE9GRlNFVCkge1xuICAgICAgICAgICAgICByZXR1cm4gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgICAgICAgICAgIE9GRlNFVC50aGlzRGVwLFxuICAgICAgICAgICAgICAgIE9GRlNFVC5jb250ZXh0RGVwLFxuICAgICAgICAgICAgICAgIE9GRlNFVC5wcm9wRGVwLFxuICAgICAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgICAgICAgICB2YXIgcmVzdWx0ID0gc2NvcGUuZGVmKFxuICAgICAgICAgICAgICAgICAgICBlbnYuRUxFTUVOVFMsICcudmVydENvdW50LScsIGVudi5PRkZTRVQpXG5cbiAgICAgICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihlbnYuRUxFTUVOVFMsICcudmVydENvdW50JylcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFyIHJlc3VsdCA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICByZXR1cm4gLTFcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdmFyIHZhcmlhYmxlID0gbmV3IERlY2xhcmF0aW9uKFxuICAgICAgICAgICAgZWxlbWVudHMudGhpc0RlcCB8fCBPRkZTRVQudGhpc0RlcCxcbiAgICAgICAgICAgIGVsZW1lbnRzLmNvbnRleHREZXAgfHwgT0ZGU0VULmNvbnRleHREZXAsXG4gICAgICAgICAgICBlbGVtZW50cy5wcm9wRGVwIHx8IE9GRlNFVC5wcm9wRGVwLFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgICAgICAgdmFyIGVsZW1lbnRzID0gZW52LkVMRU1FTlRTXG4gICAgICAgICAgICAgIGlmIChlbnYuT0ZGU0VUKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihlbGVtZW50cywgJz8nLCBlbGVtZW50cywgJy52ZXJ0Q291bnQtJyxcbiAgICAgICAgICAgICAgICAgIGVudi5PRkZTRVQsICc6LTEnKVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoZWxlbWVudHMsICc/JywgZWxlbWVudHMsICcudmVydENvdW50Oi0xJylcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgXG4gICAgICAgICAgcmV0dXJuIHZhcmlhYmxlXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGVsZW1lbnRzOiBlbGVtZW50cyxcbiAgICAgIHByaW1pdGl2ZTogcGFyc2VQcmltaXRpdmUoKSxcbiAgICAgIGNvdW50OiBwYXJzZVZlcnRDb3VudCgpLFxuICAgICAgaW5zdGFuY2VzOiBwYXJzZVBhcmFtKFNfSU5TVEFOQ0VTLCBmYWxzZSksXG4gICAgICBvZmZzZXQ6IE9GRlNFVFxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlR0xTdGF0ZSAob3B0aW9ucywgZW52KSB7XG4gICAgdmFyIHN0YXRpY09wdGlvbnMgPSBvcHRpb25zLnN0YXRpY1xuICAgIHZhciBkeW5hbWljT3B0aW9ucyA9IG9wdGlvbnMuZHluYW1pY1xuXG4gICAgdmFyIFNUQVRFID0ge31cblxuICAgIEdMX1NUQVRFX05BTUVTLmZvckVhY2goZnVuY3Rpb24gKHByb3ApIHtcbiAgICAgIHZhciBwYXJhbSA9IHByb3BOYW1lKHByb3ApXG5cbiAgICAgIGZ1bmN0aW9uIHBhcnNlUGFyYW0gKHBhcnNlU3RhdGljLCBwYXJzZUR5bmFtaWMpIHtcbiAgICAgICAgaWYgKHByb3AgaW4gc3RhdGljT3B0aW9ucykge1xuICAgICAgICAgIHZhciB2YWx1ZSA9IHBhcnNlU3RhdGljKHN0YXRpY09wdGlvbnNbcHJvcF0pXG4gICAgICAgICAgU1RBVEVbcGFyYW1dID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gdmFsdWVcbiAgICAgICAgICB9KVxuICAgICAgICB9IGVsc2UgaWYgKHByb3AgaW4gZHluYW1pY09wdGlvbnMpIHtcbiAgICAgICAgICB2YXIgZHluID0gZHluYW1pY09wdGlvbnNbcHJvcF1cbiAgICAgICAgICBTVEFURVtwYXJhbV0gPSBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgICAgICByZXR1cm4gcGFyc2VEeW5hbWljKGVudiwgc2NvcGUsIGVudi5pbnZva2Uoc2NvcGUsIGR5bikpXG4gICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBzd2l0Y2ggKHByb3ApIHtcbiAgICAgICAgY2FzZSBTX0NVTExfRU5BQkxFOlxuICAgICAgICBjYXNlIFNfQkxFTkRfRU5BQkxFOlxuICAgICAgICBjYXNlIFNfRElUSEVSOlxuICAgICAgICBjYXNlIFNfU1RFTkNJTF9FTkFCTEU6XG4gICAgICAgIGNhc2UgU19ERVBUSF9FTkFCTEU6XG4gICAgICAgIGNhc2UgU19TQ0lTU09SX0VOQUJMRTpcbiAgICAgICAgY2FzZSBTX1BPTFlHT05fT0ZGU0VUX0VOQUJMRTpcbiAgICAgICAgY2FzZSBTX1NBTVBMRV9BTFBIQTpcbiAgICAgICAgY2FzZSBTX1NBTVBMRV9FTkFCTEU6XG4gICAgICAgIGNhc2UgU19ERVBUSF9NQVNLOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gdmFsdWVcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfREVQVEhfRlVOQzpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIGNvbXBhcmVGdW5jc1t2YWx1ZV1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgdmFyIENPTVBBUkVfRlVOQ1MgPSBlbnYuY29uc3RhbnRzLmNvbXBhcmVGdW5jc1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihDT01QQVJFX0ZVTkNTLCAnWycsIHZhbHVlLCAnXScpXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19ERVBUSF9SQU5HRTpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgIHZhciBaX05FQVIgPSBzY29wZS5kZWYoJysnLCB2YWx1ZSwgJ1swXScpXG4gICAgICAgICAgICAgIHZhciBaX0ZBUiA9IHNjb3BlLmRlZignKycsIHZhbHVlLCAnWzFdJylcbiAgICAgICAgICAgICAgcmV0dXJuIFtaX05FQVIsIFpfRkFSXVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfQkxFTkRfRlVOQzpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgdmFyIHNyY1JHQiA9ICgnc3JjUkdCJyBpbiB2YWx1ZSA/IHZhbHVlLnNyY1JHQiA6IHZhbHVlLnNyYylcbiAgICAgICAgICAgICAgdmFyIHNyY0FscGhhID0gKCdzcmNBbHBoYScgaW4gdmFsdWUgPyB2YWx1ZS5zcmNBbHBoYSA6IHZhbHVlLnNyYylcbiAgICAgICAgICAgICAgdmFyIGRzdFJHQiA9ICgnZHN0UkdCJyBpbiB2YWx1ZSA/IHZhbHVlLmRzdFJHQiA6IHZhbHVlLmRzdClcbiAgICAgICAgICAgICAgdmFyIGRzdEFscGhhID0gKCdkc3RBbHBoYScgaW4gdmFsdWUgPyB2YWx1ZS5kc3RBbHBoYSA6IHZhbHVlLmRzdClcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgXG5cbiAgICAgICAgICAgICAgXG5cbiAgICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgICBibGVuZEZ1bmNzW3NyY1JHQl0sXG4gICAgICAgICAgICAgICAgYmxlbmRGdW5jc1tkc3RSR0JdLFxuICAgICAgICAgICAgICAgIGJsZW5kRnVuY3Nbc3JjQWxwaGFdLFxuICAgICAgICAgICAgICAgIGJsZW5kRnVuY3NbZHN0QWxwaGFdXG4gICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgdmFyIEJMRU5EX0ZVTkNTID0gZW52LmNvbnN0YW50cy5ibGVuZEZ1bmNzXG5cbiAgICAgICAgICAgICAgXG5cbiAgICAgICAgICAgICAgZnVuY3Rpb24gcmVhZCAocHJlZml4LCBzdWZmaXgpIHtcbiAgICAgICAgICAgICAgICB2YXIgZnVuYyA9IHNjb3BlLmRlZihcbiAgICAgICAgICAgICAgICAgICdcIicsIHByZWZpeCwgc3VmZml4LCAnXCIgaW4gJywgdmFsdWUsXG4gICAgICAgICAgICAgICAgICAnPycsIHZhbHVlLCAnLicsIHByZWZpeCwgc3VmZml4LFxuICAgICAgICAgICAgICAgICAgJzonLCB2YWx1ZSwgJy4nLCBwcmVmaXgpXG5cbiAgICAgICAgICAgICAgICBcblxuICAgICAgICAgICAgICAgIHJldHVybiBmdW5jXG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICB2YXIgc3JjUkdCID0gcmVhZCgnc3JjJywgJ1JHQicpXG4gICAgICAgICAgICAgIHZhciBkc3RSR0IgPSByZWFkKCdkc3QnLCAnUkdCJylcblxuICAgICAgICAgICAgICBcblxuICAgICAgICAgICAgICB2YXIgU1JDX1JHQiA9IHNjb3BlLmRlZihCTEVORF9GVU5DUywgJ1snLCBzcmNSR0IsICddJylcbiAgICAgICAgICAgICAgdmFyIFNSQ19BTFBIQSA9IHNjb3BlLmRlZihCTEVORF9GVU5DUywgJ1snLCByZWFkKCdzcmMnLCAnQWxwaGEnKSwgJ10nKVxuICAgICAgICAgICAgICB2YXIgRFNUX1JHQiA9IHNjb3BlLmRlZihCTEVORF9GVU5DUywgJ1snLCBkc3RSR0IsICddJylcbiAgICAgICAgICAgICAgdmFyIERTVF9BTFBIQSA9IHNjb3BlLmRlZihCTEVORF9GVU5DUywgJ1snLCByZWFkKCdkc3QnLCAnQWxwaGEnKSwgJ10nKVxuXG4gICAgICAgICAgICAgIHJldHVybiBbU1JDX1JHQiwgRFNUX1JHQiwgU1JDX0FMUEhBLCBEU1RfQUxQSEFdXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19CTEVORF9FUVVBVElPTjpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICAgICAgICBibGVuZEVxdWF0aW9uc1t2YWx1ZV0sXG4gICAgICAgICAgICAgICAgICBibGVuZEVxdWF0aW9uc1t2YWx1ZV1cbiAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICAgICAgICBibGVuZEVxdWF0aW9uc1t2YWx1ZS5yZ2JdLFxuICAgICAgICAgICAgICAgICAgYmxlbmRFcXVhdGlvbnNbdmFsdWUuYWxwaGFdXG4gICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIHZhciBCTEVORF9FUVVBVElPTlMgPSBlbnYuY29uc3RhbnRzLmJsZW5kRXF1YXRpb25zXG5cbiAgICAgICAgICAgICAgdmFyIFJHQiA9IHNjb3BlLmRlZigpXG4gICAgICAgICAgICAgIHZhciBBTFBIQSA9IHNjb3BlLmRlZigpXG5cbiAgICAgICAgICAgICAgdmFyIGlmdGUgPSBlbnYuY29uZCgndHlwZW9mICcsIHZhbHVlLCAnPT09XCJzdHJpbmdcIicpXG5cbiAgICAgICAgICAgICAgXG5cbiAgICAgICAgICAgICAgaWZ0ZS50aGVuKFxuICAgICAgICAgICAgICAgIFJHQiwgJz0nLCBBTFBIQSwgJz0nLCBCTEVORF9FUVVBVElPTlMsICdbJywgdmFsdWUsICddOycpXG4gICAgICAgICAgICAgIGlmdGUuZWxzZShcbiAgICAgICAgICAgICAgICBSR0IsICc9JywgQkxFTkRfRVFVQVRJT05TLCAnWycsIHZhbHVlLCAnLnJnYl07JyxcbiAgICAgICAgICAgICAgICBBTFBIQSwgJz0nLCBCTEVORF9FUVVBVElPTlMsICdbJywgdmFsdWUsICcuYWxwaGFdOycpXG5cbiAgICAgICAgICAgICAgc2NvcGUoaWZ0ZSlcblxuICAgICAgICAgICAgICByZXR1cm4gW1JHQiwgQUxQSEFdXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19CTEVORF9DT0xPUjpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIGxvb3AoNCwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gK3ZhbHVlW2ldXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gbG9vcCg0LCBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoJysnLCB2YWx1ZSwgJ1snLCBpLCAnXScpXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19TVEVOQ0lMX01BU0s6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZSB8IDBcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYodmFsdWUsICd8MCcpXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19TVEVOQ0lMX0ZVTkM6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHZhciBjbXAgPSB2YWx1ZS5jbXAgfHwgJ2tlZXAnXG4gICAgICAgICAgICAgIHZhciByZWYgPSB2YWx1ZS5yZWYgfHwgMFxuICAgICAgICAgICAgICB2YXIgbWFzayA9ICdtYXNrJyBpbiB2YWx1ZSA/IHZhbHVlLm1hc2sgOiAtMVxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgICAgIGNvbXBhcmVGdW5jc1tjbXBdLFxuICAgICAgICAgICAgICAgIHJlZixcbiAgICAgICAgICAgICAgICBtYXNrXG4gICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgdmFyIENPTVBBUkVfRlVOQ1MgPSBlbnYuY29uc3RhbnRzLmNvbXBhcmVGdW5jc1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgdmFyIGNtcCA9IHNjb3BlLmRlZihcbiAgICAgICAgICAgICAgICAnXCJjbXBcIiBpbiAnLCB2YWx1ZSxcbiAgICAgICAgICAgICAgICAnPycsIENPTVBBUkVfRlVOQ1MsICdbJywgdmFsdWUsICcuY21wXScsXG4gICAgICAgICAgICAgICAgJzonLCBHTF9LRUVQKVxuICAgICAgICAgICAgICB2YXIgcmVmID0gc2NvcGUuZGVmKHZhbHVlLCAnLnJlZnwwJylcbiAgICAgICAgICAgICAgdmFyIG1hc2sgPSBzY29wZS5kZWYoXG4gICAgICAgICAgICAgICAgJ1wibWFza1wiIGluICcsIHZhbHVlLFxuICAgICAgICAgICAgICAgICc/JywgdmFsdWUsICcubWFza3wwOi0xJylcbiAgICAgICAgICAgICAgcmV0dXJuIFtjbXAsIHJlZiwgbWFza11cbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX1NURU5DSUxfT1BGUk9OVDpcbiAgICAgICAgY2FzZSBTX1NURU5DSUxfT1BCQUNLOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICB2YXIgZmFpbCA9IHZhbHVlLmZhaWwgfHwgJ2tlZXAnXG4gICAgICAgICAgICAgIHZhciB6ZmFpbCA9IHZhbHVlLnpmYWlsIHx8ICdrZWVwJ1xuICAgICAgICAgICAgICB2YXIgenBhc3MgPSB2YWx1ZS56cGFzcyB8fCAna2VlcCdcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgICBwcm9wID09PSBTX1NURU5DSUxfT1BCQUNLID8gR0xfQkFDSyA6IEdMX0ZST05ULFxuICAgICAgICAgICAgICAgIHN0ZW5jaWxPcHNbZmFpbF0sXG4gICAgICAgICAgICAgICAgc3RlbmNpbE9wc1t6ZmFpbF0sXG4gICAgICAgICAgICAgICAgc3RlbmNpbE9wc1t6cGFzc11cbiAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICB2YXIgU1RFTkNJTF9PUFMgPSBlbnYuY29uc3RhbnRzLnN0ZW5jaWxPcHNcblxuICAgICAgICAgICAgICBcblxuICAgICAgICAgICAgICBmdW5jdGlvbiByZWFkIChuYW1lKSB7XG4gICAgICAgICAgICAgICAgXG5cbiAgICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKFxuICAgICAgICAgICAgICAgICAgJ1wiJywgbmFtZSwgJ1wiIGluICcsIHZhbHVlLFxuICAgICAgICAgICAgICAgICAgJz8nLCBTVEVOQ0lMX09QUywgJ1snLCB2YWx1ZSwgJy4nLCBuYW1lLCAnXTonLFxuICAgICAgICAgICAgICAgICAgR0xfS0VFUClcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICAgICAgcHJvcCA9PT0gU19TVEVOQ0lMX09QQkFDSyA/IEdMX0JBQ0sgOiBHTF9GUk9OVCxcbiAgICAgICAgICAgICAgICByZWFkKCdmYWlsJyksXG4gICAgICAgICAgICAgICAgcmVhZCgnemZhaWwnKSxcbiAgICAgICAgICAgICAgICByZWFkKCd6cGFzcycpXG4gICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX1BPTFlHT05fT0ZGU0VUX09GRlNFVDpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgdmFyIGZhY3RvciA9IHZhbHVlLmZhY3RvciB8IDBcbiAgICAgICAgICAgICAgdmFyIHVuaXRzID0gdmFsdWUudW5pdHMgfCAwXG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIFtmYWN0b3IsIHVuaXRzXVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBcblxuICAgICAgICAgICAgICB2YXIgRkFDVE9SID0gc2NvcGUuZGVmKHZhbHVlLCAnLmZhY3RvcnwwJylcbiAgICAgICAgICAgICAgdmFyIFVOSVRTID0gc2NvcGUuZGVmKHZhbHVlLCAnLnVuaXRzfDAnKVxuXG4gICAgICAgICAgICAgIHJldHVybiBbRkFDVE9SLCBVTklUU11cbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgY2FzZSBTX0NVTExfRkFDRTpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICB2YXIgZmFjZSA9IDBcbiAgICAgICAgICAgICAgaWYgKHZhbHVlID09PSAnZnJvbnQnKSB7XG4gICAgICAgICAgICAgICAgZmFjZSA9IEdMX0ZST05UXG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAodmFsdWUgPT09ICdiYWNrJykge1xuICAgICAgICAgICAgICAgIGZhY2UgPSBHTF9CQUNLXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiBmYWNlXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKHZhbHVlLCAnPT09XCJmcm9udFwiPycsIEdMX0ZST05ULCAnOicsIEdMX0JBQ0spXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19MSU5FX1dJRFRIOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gdmFsdWVcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgXG5cbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19GUk9OVF9GQUNFOlxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gb3JpZW50YXRpb25UeXBlW3ZhbHVlXVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZih2YWx1ZSArICc9PT1cImN3XCI/JyArIEdMX0NXICsgJzonICsgR0xfQ0NXKVxuICAgICAgICAgICAgfSlcblxuICAgICAgICBjYXNlIFNfQ09MT1JfTUFTSzpcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlLm1hcChmdW5jdGlvbiAodikgeyByZXR1cm4gISF2IH0pXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gbG9vcCg0LCBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgICAgICAgIHJldHVybiAnISEnICsgdmFsdWUgKyAnWycgKyBpICsgJ10nXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9KVxuXG4gICAgICAgIGNhc2UgU19TQU1QTEVfQ09WRVJBR0U6XG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHZhciBzYW1wbGVWYWx1ZSA9ICd2YWx1ZScgaW4gdmFsdWUgPyB2YWx1ZS52YWx1ZSA6IDFcbiAgICAgICAgICAgICAgdmFyIHNhbXBsZUludmVydCA9ICEhdmFsdWUuaW52ZXJ0XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXR1cm4gW3NhbXBsZVZhbHVlLCBzYW1wbGVJbnZlcnRdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICB2YXIgVkFMVUUgPSBzY29wZS5kZWYoXG4gICAgICAgICAgICAgICAgJ1widmFsdWVcIiBpbiAnLCB2YWx1ZSwgJz8rJywgdmFsdWUsICcudmFsdWU6MScpXG4gICAgICAgICAgICAgIHZhciBJTlZFUlQgPSBzY29wZS5kZWYoJyEhJywgdmFsdWUsICcuaW52ZXJ0JylcbiAgICAgICAgICAgICAgcmV0dXJuIFtWQUxVRSwgSU5WRVJUXVxuICAgICAgICAgICAgfSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgcmV0dXJuIFNUQVRFXG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZVVuaWZvcm1zICh1bmlmb3JtcywgZW52KSB7XG4gICAgdmFyIHN0YXRpY1VuaWZvcm1zID0gdW5pZm9ybXMuc3RhdGljXG4gICAgdmFyIGR5bmFtaWNVbmlmb3JtcyA9IHVuaWZvcm1zLmR5bmFtaWNcblxuICAgIHZhciBVTklGT1JNUyA9IHt9XG5cbiAgICBPYmplY3Qua2V5cyhzdGF0aWNVbmlmb3JtcykuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgdmFyIHZhbHVlID0gc3RhdGljVW5pZm9ybXNbbmFtZV1cbiAgICAgIHZhciByZXN1bHRcbiAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInIHx8XG4gICAgICAgICAgdHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgcmVzdWx0ID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcmV0dXJuIHZhbHVlXG4gICAgICAgIH0pXG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICB2YXIgcmVnbFR5cGUgPSB2YWx1ZS5fcmVnbFR5cGVcbiAgICAgICAgaWYgKHJlZ2xUeXBlID09PSAndGV4dHVyZTJkJyB8fFxuICAgICAgICAgICAgcmVnbFR5cGUgPT09ICd0ZXh0dXJlQ3ViZScpIHtcbiAgICAgICAgICByZXN1bHQgPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYpIHtcbiAgICAgICAgICAgIHJldHVybiBlbnYubGluayh2YWx1ZSlcbiAgICAgICAgICB9KVxuICAgICAgICB9IGVsc2UgaWYgKHJlZ2xUeXBlID09PSAnZnJhbWVidWZmZXInIHx8XG4gICAgICAgICAgICAgICAgICAgcmVnbFR5cGUgPT09ICdmcmFtZWJ1ZmZlckN1YmUnKSB7XG4gICAgICAgICAgXG4gICAgICAgICAgcmVzdWx0ID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52KSB7XG4gICAgICAgICAgICByZXR1cm4gZW52LmxpbmsodmFsdWUuY29sb3JbMF0pXG4gICAgICAgICAgfSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChpc0FycmF5TGlrZSh2YWx1ZSkpIHtcbiAgICAgICAgcmVzdWx0ID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52KSB7XG4gICAgICAgICAgdmFyIElURU0gPSBlbnYuZ2xvYmFsLmRlZignWycsXG4gICAgICAgICAgICBsb29wKHZhbHVlLmxlbmd0aCwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZVtpXVxuICAgICAgICAgICAgfSksICddJylcbiAgICAgICAgICByZXR1cm4gSVRFTVxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgXG4gICAgICB9XG4gICAgICByZXN1bHQudmFsdWUgPSB2YWx1ZVxuICAgICAgVU5JRk9STVNbbmFtZV0gPSByZXN1bHRcbiAgICB9KVxuXG4gICAgT2JqZWN0LmtleXMoZHluYW1pY1VuaWZvcm1zKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgIHZhciBkeW4gPSBkeW5hbWljVW5pZm9ybXNba2V5XVxuICAgICAgVU5JRk9STVNba2V5XSA9IGNyZWF0ZUR5bmFtaWNEZWNsKGR5biwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgcmV0dXJuIGVudi5pbnZva2Uoc2NvcGUsIGR5bilcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIHJldHVybiBVTklGT1JNU1xuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VBdHRyaWJ1dGVzIChhdHRyaWJ1dGVzLCBlbnYpIHtcbiAgICB2YXIgc3RhdGljQXR0cmlidXRlcyA9IGF0dHJpYnV0ZXMuc3RhdGljXG4gICAgdmFyIGR5bmFtaWNBdHRyaWJ1dGVzID0gYXR0cmlidXRlcy5keW5hbWljXG5cbiAgICB2YXIgYXR0cmlidXRlRGVmcyA9IHt9XG5cbiAgICBPYmplY3Qua2V5cyhzdGF0aWNBdHRyaWJ1dGVzKS5mb3JFYWNoKGZ1bmN0aW9uIChhdHRyaWJ1dGUpIHtcbiAgICAgIHZhciB2YWx1ZSA9IHN0YXRpY0F0dHJpYnV0ZXNbYXR0cmlidXRlXVxuICAgICAgdmFyIGlkID0gc3RyaW5nU3RvcmUuaWQoYXR0cmlidXRlKVxuXG4gICAgICB2YXIgcmVjb3JkID0gbmV3IEF0dHJpYnV0ZVJlY29yZCgpXG4gICAgICBpZiAoaXNCdWZmZXJBcmdzKHZhbHVlKSkge1xuICAgICAgICByZWNvcmQuc3RhdGUgPSBBVFRSSUJfU1RBVEVfUE9JTlRFUlxuICAgICAgICByZWNvcmQuYnVmZmVyID0gYnVmZmVyU3RhdGUuZ2V0QnVmZmVyKFxuICAgICAgICAgIGJ1ZmZlclN0YXRlLmNyZWF0ZSh2YWx1ZSwgR0xfQVJSQVlfQlVGRkVSLCBmYWxzZSwgdHJ1ZSkpXG4gICAgICAgIHJlY29yZC50eXBlID0gMFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIGJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmdldEJ1ZmZlcih2YWx1ZSlcbiAgICAgICAgaWYgKGJ1ZmZlcikge1xuICAgICAgICAgIHJlY29yZC5zdGF0ZSA9IEFUVFJJQl9TVEFURV9QT0lOVEVSXG4gICAgICAgICAgcmVjb3JkLmJ1ZmZlciA9IGJ1ZmZlclxuICAgICAgICAgIHJlY29yZC50eXBlID0gMFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIFxuICAgICAgICAgIGlmICh2YWx1ZS5jb25zdGFudCkge1xuICAgICAgICAgICAgdmFyIGNvbnN0YW50ID0gdmFsdWUuY29uc3RhbnRcbiAgICAgICAgICAgIHJlY29yZC5idWZmZXIgPSAnbnVsbCdcbiAgICAgICAgICAgIHJlY29yZC5zdGF0ZSA9IEFUVFJJQl9TVEFURV9DT05TVEFOVFxuICAgICAgICAgICAgaWYgKHR5cGVvZiBjb25zdGFudCA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgICAgcmVjb3JkLnggPSBjb25zdGFudFxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIENVVEVfQ09NUE9ORU5UUy5mb3JFYWNoKGZ1bmN0aW9uIChjLCBpKSB7XG4gICAgICAgICAgICAgICAgaWYgKGkgPCBjb25zdGFudC5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgIHJlY29yZFtjXSA9IGNvbnN0YW50W2ldXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAoaXNCdWZmZXJBcmdzKHZhbHVlLmJ1ZmZlcikpIHtcbiAgICAgICAgICAgICAgYnVmZmVyID0gYnVmZmVyU3RhdGUuZ2V0QnVmZmVyKFxuICAgICAgICAgICAgICAgIGJ1ZmZlclN0YXRlLmNyZWF0ZSh2YWx1ZS5idWZmZXIsIEdMX0FSUkFZX0JVRkZFUiwgZmFsc2UsIHRydWUpKVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgYnVmZmVyID0gYnVmZmVyU3RhdGUuZ2V0QnVmZmVyKHZhbHVlLmJ1ZmZlcilcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuXG4gICAgICAgICAgICB2YXIgb2Zmc2V0ID0gdmFsdWUub2Zmc2V0IHwgMFxuICAgICAgICAgICAgXG5cbiAgICAgICAgICAgIHZhciBzdHJpZGUgPSB2YWx1ZS5zdHJpZGUgfCAwXG4gICAgICAgICAgICBcblxuICAgICAgICAgICAgdmFyIHNpemUgPSB2YWx1ZS5zaXplIHwgMFxuICAgICAgICAgICAgXG5cbiAgICAgICAgICAgIHZhciBub3JtYWxpemVkID0gISF2YWx1ZS5ub3JtYWxpemVkXG5cbiAgICAgICAgICAgIHZhciB0eXBlID0gMFxuICAgICAgICAgICAgaWYgKCd0eXBlJyBpbiB2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgdHlwZSA9IGdsVHlwZXNbdmFsdWUudHlwZV1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIGRpdmlzb3IgPSB2YWx1ZS5kaXZpc29yIHwgMFxuICAgICAgICAgICAgaWYgKCdkaXZpc29yJyBpbiB2YWx1ZSkge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIFxuXG4gICAgICAgICAgICByZWNvcmQuYnVmZmVyID0gYnVmZmVyXG4gICAgICAgICAgICByZWNvcmQuc3RhdGUgPSBBVFRSSUJfU1RBVEVfUE9JTlRFUlxuICAgICAgICAgICAgcmVjb3JkLnNpemUgPSBzaXplXG4gICAgICAgICAgICByZWNvcmQubm9ybWFsaXplZCA9IG5vcm1hbGl6ZWRcbiAgICAgICAgICAgIHJlY29yZC50eXBlID0gdHlwZSB8fCBidWZmZXIuZHR5cGVcbiAgICAgICAgICAgIHJlY29yZC5vZmZzZXQgPSBvZmZzZXRcbiAgICAgICAgICAgIHJlY29yZC5zdHJpZGUgPSBzdHJpZGVcbiAgICAgICAgICAgIHJlY29yZC5kaXZpc29yID0gZGl2aXNvclxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBhdHRyaWJ1dGVEZWZzW2F0dHJpYnV0ZV0gPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgIHZhciBjYWNoZSA9IGVudi5hdHRyaWJDYWNoZVxuICAgICAgICBpZiAoaWQgaW4gY2FjaGUpIHtcbiAgICAgICAgICByZXR1cm4gY2FjaGVbaWRdXG4gICAgICAgIH1cbiAgICAgICAgdmFyIHJlc3VsdCA9IHtcbiAgICAgICAgICBpc1N0cmVhbTogZmFsc2VcbiAgICAgICAgfVxuICAgICAgICBPYmplY3Qua2V5cyhyZWNvcmQpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgICAgIHJlc3VsdFtrZXldID0gcmVjb3JkW2tleV1cbiAgICAgICAgfSlcbiAgICAgICAgaWYgKHJlY29yZC5idWZmZXIpIHtcbiAgICAgICAgICByZXN1bHQuYnVmZmVyID0gZW52LmxpbmsocmVjb3JkLmJ1ZmZlcilcbiAgICAgICAgICByZXN1bHQudHlwZSA9IHJlc3VsdC50eXBlIHx8IChyZXN1bHQuYnVmZmVyICsgJy5kdHlwZScpXG4gICAgICAgIH1cbiAgICAgICAgY2FjaGVbaWRdID0gcmVzdWx0XG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIE9iamVjdC5rZXlzKGR5bmFtaWNBdHRyaWJ1dGVzKS5mb3JFYWNoKGZ1bmN0aW9uIChhdHRyaWJ1dGUpIHtcbiAgICAgIHZhciBkeW4gPSBkeW5hbWljQXR0cmlidXRlc1thdHRyaWJ1dGVdXG5cbiAgICAgIGZ1bmN0aW9uIGFwcGVuZEF0dHJpYnV0ZUNvZGUgKGVudiwgYmxvY2spIHtcbiAgICAgICAgdmFyIFZBTFVFID0gZW52Lmludm9rZShibG9jaywgZHluKVxuXG4gICAgICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG5cbiAgICAgICAgdmFyIElTX0JVRkZFUl9BUkdTID0gc2hhcmVkLmlzQnVmZmVyQXJnc1xuICAgICAgICB2YXIgQlVGRkVSX1NUQVRFID0gc2hhcmVkLmJ1ZmZlclxuXG4gICAgICAgIC8vIFBlcmZvcm0gdmFsaWRhdGlvbiBvbiBhdHRyaWJ1dGVcbiAgICAgICAgXG5cbiAgICAgICAgLy8gYWxsb2NhdGUgbmFtZXMgZm9yIHJlc3VsdFxuICAgICAgICB2YXIgcmVzdWx0ID0ge1xuICAgICAgICAgIGlzU3RyZWFtOiBibG9jay5kZWYoZmFsc2UpXG4gICAgICAgIH1cbiAgICAgICAgdmFyIGRlZmF1bHRSZWNvcmQgPSBuZXcgQXR0cmlidXRlUmVjb3JkKClcbiAgICAgICAgZGVmYXVsdFJlY29yZC5zdGF0ZSA9IEFUVFJJQl9TVEFURV9QT0lOVEVSXG4gICAgICAgIE9iamVjdC5rZXlzKGRlZmF1bHRSZWNvcmQpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgICAgIHJlc3VsdFtrZXldID0gYmxvY2suZGVmKCcnICsgZGVmYXVsdFJlY29yZFtrZXldKVxuICAgICAgICB9KVxuXG4gICAgICAgIHZhciBCVUZGRVIgPSByZXN1bHQuYnVmZmVyXG4gICAgICAgIHZhciBUWVBFID0gcmVzdWx0LnR5cGVcbiAgICAgICAgYmxvY2soXG4gICAgICAgICAgJ2lmKCcsIElTX0JVRkZFUl9BUkdTLCAnKCcsIFZBTFVFLCAnKSl7JyxcbiAgICAgICAgICByZXN1bHQuaXNTdHJlYW0sICc9dHJ1ZTsnLFxuICAgICAgICAgIEJVRkZFUiwgJz0nLCBCVUZGRVJfU1RBVEUsICcuY3JlYXRlU3RyZWFtKCcsIEdMX0FSUkFZX0JVRkZFUiwgJywnLCBWQUxVRSwgJyk7JyxcbiAgICAgICAgICBUWVBFLCAnPScsIEJVRkZFUiwgJy5kdHlwZTsnLFxuICAgICAgICAgICd9ZWxzZXsnLFxuICAgICAgICAgIEJVRkZFUiwgJz0nLCBCVUZGRVJfU1RBVEUsICcuZ2V0QnVmZmVyKCcsIFZBTFVFLCAnKTsnLFxuICAgICAgICAgICdpZignLCBCVUZGRVIsICcpeycsXG4gICAgICAgICAgVFlQRSwgJz0nLCBCVUZGRVIsICcuZHR5cGU7JyxcbiAgICAgICAgICAnfWVsc2UgaWYoXCJjb25zdGFudFwiIGluICcsIFZBTFVFLCAnKXsnLFxuICAgICAgICAgIHJlc3VsdC5zdGF0ZSwgJz0nLCBBVFRSSUJfU1RBVEVfQ09OU1RBTlQsICc7JyxcbiAgICAgICAgICAnaWYodHlwZW9mICcgKyBWQUxVRSArICcuY29uc3RhbnQgPT09IFwibnVtYmVyXCIpeycsXG4gICAgICAgICAgcmVzdWx0W0NVVEVfQ09NUE9ORU5UU1swXV0sICc9JywgVkFMVUUsICcuY29uc3RhbnQ7JyxcbiAgICAgICAgICBDVVRFX0NPTVBPTkVOVFMuc2xpY2UoMSkubWFwKGZ1bmN0aW9uIChuKSB7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0W25dXG4gICAgICAgICAgfSkuam9pbignPScpLCAnPTA7JyxcbiAgICAgICAgICAnfWVsc2V7JyxcbiAgICAgICAgICBDVVRFX0NPTVBPTkVOVFMubWFwKGZ1bmN0aW9uIChuYW1lLCBpKSB7XG4gICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICByZXN1bHRbbmFtZV0gKyAnPScgKyBWQUxVRSArICcuY29uc3RhbnQubGVuZ3RoPj0nICsgaSArXG4gICAgICAgICAgICAgICc/JyArIFZBTFVFICsgJy5jb25zdGFudFsnICsgaSArICddOjA7J1xuICAgICAgICAgICAgKVxuICAgICAgICAgIH0pLmpvaW4oJycpLFxuICAgICAgICAgICd9fWVsc2V7JyxcbiAgICAgICAgICAnaWYoJywgSVNfQlVGRkVSX0FSR1MsICcoJywgVkFMVUUsICcuYnVmZmVyKSl7JyxcbiAgICAgICAgICBCVUZGRVIsICc9JywgQlVGRkVSX1NUQVRFLCAnLmNyZWF0ZVN0cmVhbSgnLCBHTF9BUlJBWV9CVUZGRVIsICcsJywgVkFMVUUsICcuYnVmZmVyKTsnLFxuICAgICAgICAgICd9ZWxzZXsnLFxuICAgICAgICAgIEJVRkZFUiwgJz0nLCBCVUZGRVJfU1RBVEUsICcuZ2V0QnVmZmVyKCcsIFZBTFVFLCAnLmJ1ZmZlcik7JyxcbiAgICAgICAgICAnfScsXG4gICAgICAgICAgVFlQRSwgJz1cInR5cGVcIiBpbiAnLCBWQUxVRSwgJz8nLFxuICAgICAgICAgIHNoYXJlZC5nbFR5cGVzLCAnWycsIFZBTFVFLCAnLnR5cGVdOicsIEJVRkZFUiwgJy5kdHlwZTsnLFxuICAgICAgICAgIHJlc3VsdC5ub3JtYWxpemVkLCAnPSEhJywgVkFMVUUsICcubm9ybWFsaXplZDsnKVxuICAgICAgICBmdW5jdGlvbiBlbWl0UmVhZFJlY29yZCAobmFtZSkge1xuICAgICAgICAgIGJsb2NrKHJlc3VsdFtuYW1lXSwgJz0nLCBWQUxVRSwgJy4nLCBuYW1lLCAnfDA7JylcbiAgICAgICAgfVxuICAgICAgICBlbWl0UmVhZFJlY29yZCgnc2l6ZScpXG4gICAgICAgIGVtaXRSZWFkUmVjb3JkKCdvZmZzZXQnKVxuICAgICAgICBlbWl0UmVhZFJlY29yZCgnc3RyaWRlJylcbiAgICAgICAgZW1pdFJlYWRSZWNvcmQoJ2Rpdmlzb3InKVxuXG4gICAgICAgIGJsb2NrKCd9fScpXG5cbiAgICAgICAgYmxvY2suZXhpdChcbiAgICAgICAgICAnaWYoJywgcmVzdWx0LmlzU3RyZWFtLCAnKXsnLFxuICAgICAgICAgIEJVRkZFUl9TVEFURSwgJy5kZXN0cm95U3RyZWFtKCcsIEJVRkZFUiwgJyk7JyxcbiAgICAgICAgICAnfScpXG5cbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgfVxuXG4gICAgICBhdHRyaWJ1dGVEZWZzW2F0dHJpYnV0ZV0gPSBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGFwcGVuZEF0dHJpYnV0ZUNvZGUpXG4gICAgfSlcblxuICAgIHJldHVybiBhdHRyaWJ1dGVEZWZzXG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZUNvbnRleHQgKGNvbnRleHQpIHtcbiAgICB2YXIgc3RhdGljQ29udGV4dCA9IGNvbnRleHQuc3RhdGljXG4gICAgdmFyIGR5bmFtaWNDb250ZXh0ID0gY29udGV4dC5keW5hbWljXG4gICAgdmFyIHJlc3VsdCA9IHt9XG5cbiAgICBPYmplY3Qua2V5cyhzdGF0aWNDb250ZXh0KS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICB2YXIgdmFsdWUgPSBzdGF0aWNDb250ZXh0W25hbWVdXG4gICAgICByZXN1bHRbbmFtZV0gPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInIHx8IHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgcmV0dXJuICcnICsgdmFsdWVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gZW52LmxpbmsodmFsdWUpXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgfSlcblxuICAgIE9iamVjdC5rZXlzKGR5bmFtaWNDb250ZXh0KS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICB2YXIgZHluID0gZHluYW1pY0NvbnRleHRbbmFtZV1cbiAgICAgIHJlc3VsdFtuYW1lXSA9IGNyZWF0ZUR5bmFtaWNEZWNsKGR5biwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcbiAgICAgICAgcmV0dXJuIGVudi5pbnZva2Uoc2NvcGUsIGR5bilcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIHJldHVybiByZXN1bHRcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlQXJndW1lbnRzIChvcHRpb25zLCBhdHRyaWJ1dGVzLCB1bmlmb3JtcywgY29udGV4dCwgZW52KSB7XG4gICAgdmFyIHN0YXRpY09wdGlvbnMgPSBvcHRpb25zLnN0YXRpY1xuICAgIHZhciBkeW5hbWljT3B0aW9ucyA9IG9wdGlvbnMuZHluYW1pY1xuXG4gICAgXG5cbiAgICB2YXIgZnJhbWVidWZmZXIgPSBwYXJzZUZyYW1lYnVmZmVyKG9wdGlvbnMsIGVudilcbiAgICB2YXIgdmlld3BvcnRBbmRTY2lzc29yID0gcGFyc2VWaWV3cG9ydFNjaXNzb3Iob3B0aW9ucywgZnJhbWVidWZmZXIsIGVudilcbiAgICB2YXIgZHJhdyA9IHBhcnNlRHJhdyhvcHRpb25zLCBlbnYpXG4gICAgdmFyIHN0YXRlID0gcGFyc2VHTFN0YXRlKG9wdGlvbnMsIGVudilcbiAgICB2YXIgc2hhZGVyID0gcGFyc2VQcm9ncmFtKG9wdGlvbnMsIGVudilcblxuICAgIGZ1bmN0aW9uIGNvcHlCb3ggKG5hbWUpIHtcbiAgICAgIHZhciBkZWZuID0gdmlld3BvcnRBbmRTY2lzc29yW25hbWVdXG4gICAgICBpZiAoZGVmbikge1xuICAgICAgICBzdGF0ZVtuYW1lXSA9IGRlZm5cbiAgICAgIH1cbiAgICB9XG4gICAgY29weUJveChTX1ZJRVdQT1JUKVxuICAgIGNvcHlCb3gocHJvcE5hbWUoU19TQ0lTU09SX0JPWCkpXG5cbiAgICB2YXIgZGlydHkgPSBPYmplY3Qua2V5cyhzdGF0ZSkubGVuZ3RoID4gMFxuXG4gICAgdmFyIHJlc3VsdCA9IHtcbiAgICAgIGZyYW1lYnVmZmVyOiBmcmFtZWJ1ZmZlcixcbiAgICAgIGRyYXc6IGRyYXcsXG4gICAgICBzaGFkZXI6IHNoYWRlcixcbiAgICAgIHN0YXRlOiBzdGF0ZSxcbiAgICAgIGRpcnR5OiBkaXJ0eVxuICAgIH1cblxuICAgIHJlc3VsdC5wcm9maWxlID0gcGFyc2VQcm9maWxlKG9wdGlvbnMsIGVudilcbiAgICByZXN1bHQudW5pZm9ybXMgPSBwYXJzZVVuaWZvcm1zKHVuaWZvcm1zLCBlbnYpXG4gICAgcmVzdWx0LmF0dHJpYnV0ZXMgPSBwYXJzZUF0dHJpYnV0ZXMoYXR0cmlidXRlcywgZW52KVxuICAgIHJlc3VsdC5jb250ZXh0ID0gcGFyc2VDb250ZXh0KGNvbnRleHQsIGVudilcbiAgICByZXR1cm4gcmVzdWx0XG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIENPTU1PTiBVUERBVEUgRlVOQ1RJT05TXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgZnVuY3Rpb24gZW1pdENvbnRleHQgKGVudiwgc2NvcGUsIGNvbnRleHQpIHtcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuICAgIHZhciBDT05URVhUID0gc2hhcmVkLmNvbnRleHRcblxuICAgIHZhciBjb250ZXh0RW50ZXIgPSBlbnYuc2NvcGUoKVxuXG4gICAgT2JqZWN0LmtleXMoY29udGV4dCkuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgc2NvcGUuc2F2ZShDT05URVhULCAnLicgKyBuYW1lKVxuICAgICAgdmFyIGRlZm4gPSBjb250ZXh0W25hbWVdXG4gICAgICBjb250ZXh0RW50ZXIoQ09OVEVYVCwgJy4nLCBuYW1lLCAnPScsIGRlZm4uYXBwZW5kKGVudiwgc2NvcGUpLCAnOycpXG4gICAgfSlcblxuICAgIHNjb3BlKGNvbnRleHRFbnRlcilcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gQ09NTU9OIERSQVdJTkcgRlVOQ1RJT05TXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgZnVuY3Rpb24gZW1pdFBvbGxGcmFtZWJ1ZmZlciAoZW52LCBzY29wZSwgZnJhbWVidWZmZXIsIHNraXBDaGVjaykge1xuICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG5cbiAgICB2YXIgR0wgPSBzaGFyZWQuZ2xcbiAgICB2YXIgRlJBTUVCVUZGRVJfU1RBVEUgPSBzaGFyZWQuZnJhbWVidWZmZXJcbiAgICB2YXIgRVhUX0RSQVdfQlVGRkVSU1xuICAgIGlmIChleHREcmF3QnVmZmVycykge1xuICAgICAgRVhUX0RSQVdfQlVGRkVSUyA9IHNjb3BlLmRlZihzaGFyZWQuZXh0ZW5zaW9ucywgJy53ZWJnbF9kcmF3X2J1ZmZlcnMnKVxuICAgIH1cblxuICAgIHZhciBjb25zdGFudHMgPSBlbnYuY29uc3RhbnRzXG5cbiAgICB2YXIgRFJBV19CVUZGRVJTID0gY29uc3RhbnRzLmRyYXdCdWZmZXJcbiAgICB2YXIgQkFDS19CVUZGRVIgPSBjb25zdGFudHMuYmFja0J1ZmZlclxuXG4gICAgdmFyIE5FWFRcbiAgICBpZiAoZnJhbWVidWZmZXIpIHtcbiAgICAgIE5FWFQgPSBmcmFtZWJ1ZmZlci5hcHBlbmQoZW52LCBzY29wZSlcbiAgICB9IGVsc2Uge1xuICAgICAgTkVYVCA9IHNjb3BlLmRlZihGUkFNRUJVRkZFUl9TVEFURSwgJy5uZXh0JylcbiAgICB9XG5cbiAgICBpZiAoIXNraXBDaGVjaykge1xuICAgICAgc2NvcGUoJ2lmKCcsIE5FWFQsICchPT0nLCBGUkFNRUJVRkZFUl9TVEFURSwgJy5jdXIpeycpXG4gICAgfVxuICAgIHNjb3BlKFxuICAgICAgJ2lmKCcsIE5FWFQsICcpeycsXG4gICAgICBHTCwgJy5iaW5kRnJhbWVidWZmZXIoJywgR0xfRlJBTUVCVUZGRVIsICcsJywgTkVYVCwgJy5mcmFtZWJ1ZmZlcik7JylcbiAgICBpZiAoZXh0RHJhd0J1ZmZlcnMpIHtcbiAgICAgIHNjb3BlKEVYVF9EUkFXX0JVRkZFUlMsICcuZHJhd0J1ZmZlcnNXRUJHTCgnLFxuICAgICAgICBEUkFXX0JVRkZFUlMsICdbJywgTkVYVCwgJy5jb2xvckF0dGFjaG1lbnRzLmxlbmd0aF0pOycpXG4gICAgfVxuICAgIHNjb3BlKCd9ZWxzZXsnLFxuICAgICAgR0wsICcuYmluZEZyYW1lYnVmZmVyKCcsIEdMX0ZSQU1FQlVGRkVSLCAnLG51bGwpOycpXG4gICAgaWYgKGV4dERyYXdCdWZmZXJzKSB7XG4gICAgICBzY29wZShFWFRfRFJBV19CVUZGRVJTLCAnLmRyYXdCdWZmZXJzV0VCR0woJywgQkFDS19CVUZGRVIsICcpOycpXG4gICAgfVxuICAgIHNjb3BlKFxuICAgICAgJ30nLFxuICAgICAgRlJBTUVCVUZGRVJfU1RBVEUsICcuY3VyPScsIE5FWFQsICc7JylcbiAgICBpZiAoIXNraXBDaGVjaykge1xuICAgICAgc2NvcGUoJ30nKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGVtaXRQb2xsU3RhdGUgKGVudiwgc2NvcGUsIGFyZ3MpIHtcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuXG4gICAgdmFyIEdMID0gc2hhcmVkLmdsXG5cbiAgICB2YXIgQ1VSUkVOVF9WQVJTID0gZW52LmN1cnJlbnRcbiAgICB2YXIgTkVYVF9WQVJTID0gZW52Lm5leHRcbiAgICB2YXIgQ1VSUkVOVF9TVEFURSA9IHNoYXJlZC5jdXJyZW50XG4gICAgdmFyIE5FWFRfU1RBVEUgPSBzaGFyZWQubmV4dFxuXG4gICAgdmFyIGJsb2NrID0gZW52LmNvbmQoQ1VSUkVOVF9TVEFURSwgJy5kaXJ0eScpXG5cbiAgICBHTF9TVEFURV9OQU1FUy5mb3JFYWNoKGZ1bmN0aW9uIChwcm9wKSB7XG4gICAgICB2YXIgcGFyYW0gPSBwcm9wTmFtZShwcm9wKVxuICAgICAgaWYgKHBhcmFtIGluIGFyZ3Muc3RhdGUpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG5cbiAgICAgIHZhciBORVhULCBDVVJSRU5UXG4gICAgICBpZiAocGFyYW0gaW4gTkVYVF9WQVJTKSB7XG4gICAgICAgIE5FWFQgPSBORVhUX1ZBUlNbcGFyYW1dXG4gICAgICAgIENVUlJFTlQgPSBDVVJSRU5UX1ZBUlNbcGFyYW1dXG4gICAgICAgIHZhciBwYXJ0cyA9IGxvb3AoY3VycmVudFN0YXRlW3BhcmFtXS5sZW5ndGgsIGZ1bmN0aW9uIChpKSB7XG4gICAgICAgICAgcmV0dXJuIGJsb2NrLmRlZihORVhULCAnWycsIGksICddJylcbiAgICAgICAgfSlcbiAgICAgICAgYmxvY2soZW52LmNvbmQocGFydHMubWFwKGZ1bmN0aW9uIChwLCBpKSB7XG4gICAgICAgICAgcmV0dXJuIHAgKyAnIT09JyArIENVUlJFTlQgKyAnWycgKyBpICsgJ10nXG4gICAgICAgIH0pLmpvaW4oJ3x8JykpXG4gICAgICAgICAgLnRoZW4oXG4gICAgICAgICAgICBHTCwgJy4nLCBHTF9WQVJJQUJMRVNbcGFyYW1dLCAnKCcsIHBhcnRzLCAnKTsnLFxuICAgICAgICAgICAgcGFydHMubWFwKGZ1bmN0aW9uIChwLCBpKSB7XG4gICAgICAgICAgICAgIHJldHVybiBDVVJSRU5UICsgJ1snICsgaSArICddPScgKyBwXG4gICAgICAgICAgICB9KS5qb2luKCc7JyksICc7JykpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBORVhUID0gYmxvY2suZGVmKE5FWFRfU1RBVEUsICcuJywgcGFyYW0pXG4gICAgICAgIHZhciBpZnRlID0gZW52LmNvbmQoTkVYVCwgJyE9PScsIENVUlJFTlRfU1RBVEUsICcuJywgcGFyYW0pXG4gICAgICAgIGJsb2NrKGlmdGUpXG4gICAgICAgIGlmIChwYXJhbSBpbiBHTF9GTEFHUykge1xuICAgICAgICAgIGlmdGUoXG4gICAgICAgICAgICBlbnYuY29uZChORVhUKVxuICAgICAgICAgICAgICAgIC50aGVuKEdMLCAnLmVuYWJsZSgnLCBHTF9GTEFHU1twYXJhbV0sICcpOycpXG4gICAgICAgICAgICAgICAgLmVsc2UoR0wsICcuZGlzYWJsZSgnLCBHTF9GTEFHU1twYXJhbV0sICcpOycpLFxuICAgICAgICAgICAgQ1VSUkVOVF9TVEFURSwgJy4nLCBwYXJhbSwgJz0nLCBORVhULCAnOycpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWZ0ZShcbiAgICAgICAgICAgIEdMLCAnLicsIEdMX1ZBUklBQkxFU1twYXJhbV0sICcoJywgTkVYVCwgJyk7JyxcbiAgICAgICAgICAgIENVUlJFTlRfU1RBVEUsICcuJywgcGFyYW0sICc9JywgTkVYVCwgJzsnKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSlcbiAgICBpZiAoT2JqZWN0LmtleXMoYXJncy5zdGF0ZSkubGVuZ3RoID09PSAwKSB7XG4gICAgICBibG9jayhDVVJSRU5UX1NUQVRFLCAnLmRpcnR5PWZhbHNlOycpXG4gICAgfVxuICAgIHNjb3BlKGJsb2NrKVxuICB9XG5cbiAgZnVuY3Rpb24gZW1pdFNldE9wdGlvbnMgKGVudiwgc2NvcGUsIG9wdGlvbnMsIGZpbHRlcikge1xuICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgdmFyIENVUlJFTlRfVkFSUyA9IGVudi5jdXJyZW50XG4gICAgdmFyIENVUlJFTlRfU1RBVEUgPSBzaGFyZWQuY3VycmVudFxuICAgIHZhciBHTCA9IHNoYXJlZC5nbFxuICAgIHNvcnRTdGF0ZShPYmplY3Qua2V5cyhvcHRpb25zKSkuZm9yRWFjaChmdW5jdGlvbiAocGFyYW0pIHtcbiAgICAgIHZhciBkZWZuID0gb3B0aW9uc1twYXJhbV1cbiAgICAgIGlmIChmaWx0ZXIgJiYgIWZpbHRlcihkZWZuKSkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIHZhciB2YXJpYWJsZSA9IGRlZm4uYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgICBpZiAoR0xfRkxBR1NbcGFyYW1dKSB7XG4gICAgICAgIHZhciBmbGFnID0gR0xfRkxBR1NbcGFyYW1dXG4gICAgICAgIGlmIChpc1N0YXRpYyhkZWZuKSkge1xuICAgICAgICAgIGlmICh2YXJpYWJsZSkge1xuICAgICAgICAgICAgc2NvcGUoR0wsICcuZW5hYmxlKCcsIGZsYWcsICcpOycpXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNjb3BlKEdMLCAnLmRpc2FibGUoJywgZmxhZywgJyk7JylcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc2NvcGUoZW52LmNvbmQodmFyaWFibGUpXG4gICAgICAgICAgICAudGhlbihHTCwgJy5lbmFibGUoJywgZmxhZywgJyk7JylcbiAgICAgICAgICAgIC5lbHNlKEdMLCAnLmRpc2FibGUoJywgZmxhZywgJyk7JykpXG4gICAgICAgIH1cbiAgICAgICAgc2NvcGUoQ1VSUkVOVF9TVEFURSwgJy4nLCBwYXJhbSwgJz0nLCB2YXJpYWJsZSwgJzsnKVxuICAgICAgfSBlbHNlIGlmIChpc0FycmF5TGlrZSh2YXJpYWJsZSkpIHtcbiAgICAgICAgdmFyIENVUlJFTlQgPSBDVVJSRU5UX1ZBUlNbcGFyYW1dXG4gICAgICAgIHNjb3BlKFxuICAgICAgICAgIEdMLCAnLicsIEdMX1ZBUklBQkxFU1twYXJhbV0sICcoJywgdmFyaWFibGUsICcpOycsXG4gICAgICAgICAgdmFyaWFibGUubWFwKGZ1bmN0aW9uICh2LCBpKSB7XG4gICAgICAgICAgICByZXR1cm4gQ1VSUkVOVCArICdbJyArIGkgKyAnXT0nICsgdlxuICAgICAgICAgIH0pLmpvaW4oJzsnKSwgJzsnKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2NvcGUoXG4gICAgICAgICAgR0wsICcuJywgR0xfVkFSSUFCTEVTW3BhcmFtXSwgJygnLCB2YXJpYWJsZSwgJyk7JyxcbiAgICAgICAgICBDVVJSRU5UX1NUQVRFLCAnLicsIHBhcmFtLCAnPScsIHZhcmlhYmxlLCAnOycpXG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGluamVjdEV4dGVuc2lvbnMgKGVudiwgc2NvcGUpIHtcbiAgICBpZiAoZXh0SW5zdGFuY2luZykge1xuICAgICAgZW52Lmluc3RhbmNpbmcgPSBzY29wZS5kZWYoXG4gICAgICAgIGVudi5zaGFyZWQuZXh0ZW5zaW9ucywgJy5hbmdsZV9pbnN0YW5jZWRfYXJyYXlzJylcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBlbWl0UHJvZmlsZSAoZW52LCBzY29wZSwgYXJncywgdXNlU2NvcGUsIGluY3JlbWVudENvdW50ZXIpIHtcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuICAgIHZhciBTVEFUUyA9IGVudi5zdGF0c1xuICAgIHZhciBDVVJSRU5UX1NUQVRFID0gc2hhcmVkLmN1cnJlbnRcbiAgICB2YXIgVElNRVIgPSBzaGFyZWQudGltZXJcbiAgICB2YXIgcHJvZmlsZUFyZyA9IGFyZ3MucHJvZmlsZVxuXG4gICAgZnVuY3Rpb24gcGVyZkNvdW50ZXIgKCkge1xuICAgICAgaWYgKHR5cGVvZiBwZXJmb3JtYW5jZSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgcmV0dXJuICdEYXRlLm5vdygpJ1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuICdwZXJmb3JtYW5jZS5ub3coKSdcbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgQ1BVX1NUQVJULCBRVUVSWV9DT1VOVEVSXG4gICAgZnVuY3Rpb24gZW1pdFByb2ZpbGVTdGFydCAoYmxvY2spIHtcbiAgICAgIENQVV9TVEFSVCA9IHNjb3BlLmRlZigpXG4gICAgICBibG9jayhDUFVfU1RBUlQsICc9JywgcGVyZkNvdW50ZXIoKSwgJzsnKVxuICAgICAgaWYgKHR5cGVvZiBpbmNyZW1lbnRDb3VudGVyID09PSAnc3RyaW5nJykge1xuICAgICAgICBibG9jayhTVEFUUywgJy5jb3VudCs9JywgaW5jcmVtZW50Q291bnRlciwgJzsnKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYmxvY2soU1RBVFMsICcuY291bnQrKzsnKVxuICAgICAgfVxuICAgICAgaWYgKHRpbWVyKSB7XG4gICAgICAgIGlmICh1c2VTY29wZSkge1xuICAgICAgICAgIFFVRVJZX0NPVU5URVIgPSBzY29wZS5kZWYoKVxuICAgICAgICAgIGJsb2NrKFFVRVJZX0NPVU5URVIsICc9JywgVElNRVIsICcuZ2V0TnVtUGVuZGluZ1F1ZXJpZXMoKTsnKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGJsb2NrKFRJTUVSLCAnLmJlZ2luUXVlcnkoJywgU1RBVFMsICcpOycpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBlbWl0UHJvZmlsZUVuZCAoYmxvY2spIHtcbiAgICAgIGJsb2NrKFNUQVRTLCAnLmNwdVRpbWUrPScsIHBlcmZDb3VudGVyKCksICctJywgQ1BVX1NUQVJULCAnOycpXG4gICAgICBpZiAodGltZXIpIHtcbiAgICAgICAgaWYgKHVzZVNjb3BlKSB7XG4gICAgICAgICAgYmxvY2soVElNRVIsICcucHVzaFNjb3BlU3RhdHMoJyxcbiAgICAgICAgICAgIFFVRVJZX0NPVU5URVIsICcsJyxcbiAgICAgICAgICAgIFRJTUVSLCAnLmdldE51bVBlbmRpbmdRdWVyaWVzKCksJyxcbiAgICAgICAgICAgIFNUQVRTLCAnKTsnKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGJsb2NrKFRJTUVSLCAnLmVuZFF1ZXJ5KCk7JylcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHNjb3BlUHJvZmlsZSAodmFsdWUpIHtcbiAgICAgIHZhciBwcmV2ID0gc2NvcGUuZGVmKENVUlJFTlRfU1RBVEUsICcucHJvZmlsZScpXG4gICAgICBzY29wZShDVVJSRU5UX1NUQVRFLCAnLnByb2ZpbGU9JywgdmFsdWUsICc7JylcbiAgICAgIHNjb3BlLmV4aXQoQ1VSUkVOVF9TVEFURSwgJy5wcm9maWxlPScsIHByZXYsICc7JylcbiAgICB9XG5cbiAgICB2YXIgVVNFX1BST0ZJTEVcbiAgICBpZiAocHJvZmlsZUFyZykge1xuICAgICAgaWYgKGlzU3RhdGljKHByb2ZpbGVBcmcpKSB7XG4gICAgICAgIGlmIChwcm9maWxlQXJnLmVuYWJsZSkge1xuICAgICAgICAgIGVtaXRQcm9maWxlU3RhcnQoc2NvcGUpXG4gICAgICAgICAgZW1pdFByb2ZpbGVFbmQoc2NvcGUuZXhpdClcbiAgICAgICAgICBzY29wZVByb2ZpbGUoJ3RydWUnKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHNjb3BlUHJvZmlsZSgnZmFsc2UnKVxuICAgICAgICB9XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgVVNFX1BST0ZJTEUgPSBwcm9maWxlQXJnLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgc2NvcGVQcm9maWxlKFVTRV9QUk9GSUxFKVxuICAgIH0gZWxzZSB7XG4gICAgICBVU0VfUFJPRklMRSA9IHNjb3BlLmRlZihDVVJSRU5UX1NUQVRFLCAnLnByb2ZpbGUnKVxuICAgIH1cblxuICAgIHZhciBzdGFydCA9IGVudi5ibG9jaygpXG4gICAgZW1pdFByb2ZpbGVTdGFydChzdGFydClcbiAgICBzY29wZSgnaWYoJywgVVNFX1BST0ZJTEUsICcpeycsIHN0YXJ0LCAnfScpXG4gICAgdmFyIGVuZCA9IGVudi5ibG9jaygpXG4gICAgZW1pdFByb2ZpbGVFbmQoZW5kKVxuICAgIHNjb3BlLmV4aXQoJ2lmKCcsIFVTRV9QUk9GSUxFLCAnKXsnLCBlbmQsICd9JylcbiAgfVxuXG4gIGZ1bmN0aW9uIGVtaXRBdHRyaWJ1dGVzIChlbnYsIHNjb3BlLCBhcmdzLCBhdHRyaWJ1dGVzLCBmaWx0ZXIpIHtcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuXG4gICAgZnVuY3Rpb24gdHlwZUxlbmd0aCAoeCkge1xuICAgICAgc3dpdGNoICh4KSB7XG4gICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDMjpcbiAgICAgICAgY2FzZSBHTF9JTlRfVkVDMjpcbiAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzI6XG4gICAgICAgICAgcmV0dXJuIDJcbiAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUMzOlxuICAgICAgICBjYXNlIEdMX0lOVF9WRUMzOlxuICAgICAgICBjYXNlIEdMX0JPT0xfVkVDMzpcbiAgICAgICAgICByZXR1cm4gM1xuICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzQ6XG4gICAgICAgIGNhc2UgR0xfSU5UX1ZFQzQ6XG4gICAgICAgIGNhc2UgR0xfQk9PTF9WRUM0OlxuICAgICAgICAgIHJldHVybiA0XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgcmV0dXJuIDFcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBlbWl0QmluZEF0dHJpYnV0ZSAoQVRUUklCVVRFLCBzaXplLCByZWNvcmQpIHtcbiAgICAgIHZhciBHTCA9IHNoYXJlZC5nbFxuXG4gICAgICB2YXIgTE9DQVRJT04gPSBzY29wZS5kZWYoQVRUUklCVVRFLCAnLmxvY2F0aW9uJylcbiAgICAgIHZhciBCSU5ESU5HID0gc2NvcGUuZGVmKHNoYXJlZC5hdHRyaWJ1dGVzLCAnWycsIExPQ0FUSU9OLCAnXScpXG5cbiAgICAgIHZhciBTVEFURSA9IHJlY29yZC5zdGF0ZVxuICAgICAgdmFyIEJVRkZFUiA9IHJlY29yZC5idWZmZXJcbiAgICAgIHZhciBDT05TVF9DT01QT05FTlRTID0gW1xuICAgICAgICByZWNvcmQueCxcbiAgICAgICAgcmVjb3JkLnksXG4gICAgICAgIHJlY29yZC56LFxuICAgICAgICByZWNvcmQud1xuICAgICAgXVxuXG4gICAgICB2YXIgQ09NTU9OX0tFWVMgPSBbXG4gICAgICAgICdidWZmZXInLFxuICAgICAgICAnbm9ybWFsaXplZCcsXG4gICAgICAgICdvZmZzZXQnLFxuICAgICAgICAnc3RyaWRlJ1xuICAgICAgXVxuXG4gICAgICBmdW5jdGlvbiBlbWl0QnVmZmVyICgpIHtcbiAgICAgICAgc2NvcGUoXG4gICAgICAgICAgJ2lmKCEnLCBCSU5ESU5HLCAnLmJ1ZmZlcil7JyxcbiAgICAgICAgICBHTCwgJy5lbmFibGVWZXJ0ZXhBdHRyaWJBcnJheSgnLCBMT0NBVElPTiwgJyk7fScpXG5cbiAgICAgICAgdmFyIFRZUEUgPSByZWNvcmQudHlwZVxuICAgICAgICB2YXIgU0laRVxuICAgICAgICBpZiAoIXJlY29yZC5zaXplKSB7XG4gICAgICAgICAgU0laRSA9IHNpemVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBTSVpFID0gc2NvcGUuZGVmKHJlY29yZC5zaXplLCAnfHwnLCBzaXplKVxuICAgICAgICB9XG5cbiAgICAgICAgc2NvcGUoJ2lmKCcsXG4gICAgICAgICAgQklORElORywgJy50eXBlIT09JywgVFlQRSwgJ3x8JyxcbiAgICAgICAgICBCSU5ESU5HLCAnLnNpemUhPT0nLCBTSVpFLCAnfHwnLFxuICAgICAgICAgIENPTU1PTl9LRVlTLm1hcChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgICAgICByZXR1cm4gQklORElORyArICcuJyArIGtleSArICchPT0nICsgcmVjb3JkW2tleV1cbiAgICAgICAgICB9KS5qb2luKCd8fCcpLFxuICAgICAgICAgICcpeycsXG4gICAgICAgICAgR0wsICcuYmluZEJ1ZmZlcignLCBHTF9BUlJBWV9CVUZGRVIsICcsJywgQlVGRkVSLCAnLmJ1ZmZlcik7JyxcbiAgICAgICAgICBHTCwgJy52ZXJ0ZXhBdHRyaWJQb2ludGVyKCcsIFtcbiAgICAgICAgICAgIExPQ0FUSU9OLFxuICAgICAgICAgICAgU0laRSxcbiAgICAgICAgICAgIFRZUEUsXG4gICAgICAgICAgICByZWNvcmQubm9ybWFsaXplZCxcbiAgICAgICAgICAgIHJlY29yZC5zdHJpZGUsXG4gICAgICAgICAgICByZWNvcmQub2Zmc2V0XG4gICAgICAgICAgXSwgJyk7JyxcbiAgICAgICAgICBCSU5ESU5HLCAnLnR5cGU9JywgVFlQRSwgJzsnLFxuICAgICAgICAgIEJJTkRJTkcsICcuc2l6ZT0nLCBTSVpFLCAnOycsXG4gICAgICAgICAgQ09NTU9OX0tFWVMubWFwKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgICAgIHJldHVybiBCSU5ESU5HICsgJy4nICsga2V5ICsgJz0nICsgcmVjb3JkW2tleV0gKyAnOydcbiAgICAgICAgICB9KS5qb2luKCcnKSxcbiAgICAgICAgICAnfScpXG5cbiAgICAgICAgaWYgKGV4dEluc3RhbmNpbmcpIHtcbiAgICAgICAgICB2YXIgRElWSVNPUiA9IHJlY29yZC5kaXZpc29yXG4gICAgICAgICAgc2NvcGUoXG4gICAgICAgICAgICAnaWYoJywgQklORElORywgJy5kaXZpc29yIT09JywgRElWSVNPUiwgJyl7JyxcbiAgICAgICAgICAgIGVudi5pbnN0YW5jaW5nLCAnLnZlcnRleEF0dHJpYkRpdmlzb3JBTkdMRSgnLCBbTE9DQVRJT04sIERJVklTT1JdLCAnKTsnLFxuICAgICAgICAgICAgQklORElORywgJy5kaXZpc29yPScsIERJVklTT1IsICc7fScpXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgZnVuY3Rpb24gZW1pdENvbnN0YW50ICgpIHtcbiAgICAgICAgc2NvcGUoXG4gICAgICAgICAgJ2lmKCcsIEJJTkRJTkcsICcuYnVmZmVyKXsnLFxuICAgICAgICAgIEdMLCAnLmRpc2FibGVWZXJ0ZXhBdHRyaWJBcnJheSgnLCBMT0NBVElPTiwgJyk7JyxcbiAgICAgICAgICAnfWlmKCcsIENVVEVfQ09NUE9ORU5UUy5tYXAoZnVuY3Rpb24gKGMsIGkpIHtcbiAgICAgICAgICAgIHJldHVybiBCSU5ESU5HICsgJy4nICsgYyArICchPT0nICsgQ09OU1RfQ09NUE9ORU5UU1tpXVxuICAgICAgICAgIH0pLmpvaW4oJ3x8JyksICcpeycsXG4gICAgICAgICAgR0wsICcudmVydGV4QXR0cmliNGYoJywgTE9DQVRJT04sICcsJywgQ09OU1RfQ09NUE9ORU5UUywgJyk7JyxcbiAgICAgICAgICBDVVRFX0NPTVBPTkVOVFMubWFwKGZ1bmN0aW9uIChjLCBpKSB7XG4gICAgICAgICAgICByZXR1cm4gQklORElORyArICcuJyArIGMgKyAnPScgKyBDT05TVF9DT01QT05FTlRTW2ldICsgJzsnXG4gICAgICAgICAgfSkuam9pbignJyksXG4gICAgICAgICAgJ30nKVxuICAgICAgfVxuXG4gICAgICBpZiAoU1RBVEUgPT09IEFUVFJJQl9TVEFURV9QT0lOVEVSKSB7XG4gICAgICAgIGVtaXRCdWZmZXIoKVxuICAgICAgfSBlbHNlIGlmIChTVEFURSA9PT0gQVRUUklCX1NUQVRFX0NPTlNUQU5UKSB7XG4gICAgICAgIGVtaXRDb25zdGFudCgpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzY29wZSgnaWYoJywgU1RBVEUsICc9PT0nLCBBVFRSSUJfU1RBVEVfUE9JTlRFUiwgJyl7JylcbiAgICAgICAgZW1pdEJ1ZmZlcigpXG4gICAgICAgIHNjb3BlKCd9ZWxzZXsnKVxuICAgICAgICBlbWl0Q29uc3RhbnQoKVxuICAgICAgICBzY29wZSgnfScpXG4gICAgICB9XG4gICAgfVxuXG4gICAgYXR0cmlidXRlcy5mb3JFYWNoKGZ1bmN0aW9uIChhdHRyaWJ1dGUpIHtcbiAgICAgIHZhciBuYW1lID0gYXR0cmlidXRlLm5hbWVcbiAgICAgIHZhciBhcmcgPSBhcmdzLmF0dHJpYnV0ZXNbbmFtZV1cbiAgICAgIHZhciByZWNvcmRcbiAgICAgIGlmIChhcmcpIHtcbiAgICAgICAgaWYgKCFmaWx0ZXIoYXJnKSkge1xuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG4gICAgICAgIHJlY29yZCA9IGFyZy5hcHBlbmQoZW52LCBzY29wZSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmICghZmlsdGVyKFNDT1BFX0RFQ0wpKSB7XG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cbiAgICAgICAgdmFyIHNjb3BlQXR0cmliID0gZW52LnNjb3BlQXR0cmliKG5hbWUpXG4gICAgICAgIFxuICAgICAgICByZWNvcmQgPSB7fVxuICAgICAgICBPYmplY3Qua2V5cyhuZXcgQXR0cmlidXRlUmVjb3JkKCkpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgICAgIHJlY29yZFtrZXldID0gc2NvcGUuZGVmKHNjb3BlQXR0cmliLCAnLicsIGtleSlcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICAgIGVtaXRCaW5kQXR0cmlidXRlKFxuICAgICAgICBlbnYubGluayhhdHRyaWJ1dGUpLCB0eXBlTGVuZ3RoKGF0dHJpYnV0ZS5pbmZvLnR5cGUpLCByZWNvcmQpXG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGVtaXRVbmlmb3JtcyAoZW52LCBzY29wZSwgYXJncywgdW5pZm9ybXMsIGZpbHRlcikge1xuICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgdmFyIEdMID0gc2hhcmVkLmdsXG5cbiAgICB2YXIgaW5maXhcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHVuaWZvcm1zLmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgdW5pZm9ybSA9IHVuaWZvcm1zW2ldXG4gICAgICB2YXIgbmFtZSA9IHVuaWZvcm0ubmFtZVxuICAgICAgdmFyIHR5cGUgPSB1bmlmb3JtLmluZm8udHlwZVxuICAgICAgdmFyIGFyZyA9IGFyZ3MudW5pZm9ybXNbbmFtZV1cbiAgICAgIHZhciBVTklGT1JNID0gZW52LmxpbmsodW5pZm9ybSlcbiAgICAgIHZhciBMT0NBVElPTiA9IFVOSUZPUk0gKyAnLmxvY2F0aW9uJ1xuXG4gICAgICB2YXIgVkFMVUVcbiAgICAgIGlmIChhcmcpIHtcbiAgICAgICAgaWYgKCFmaWx0ZXIoYXJnKSkge1xuICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgIH1cbiAgICAgICAgaWYgKGlzU3RhdGljKGFyZykpIHtcbiAgICAgICAgICB2YXIgdmFsdWUgPSBhcmcudmFsdWVcbiAgICAgICAgICBcbiAgICAgICAgICBpZiAodHlwZSA9PT0gR0xfU0FNUExFUl8yRCB8fCB0eXBlID09PSBHTF9TQU1QTEVSX0NVQkUpIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdmFyIFRFWF9WQUxVRSA9IGVudi5saW5rKHZhbHVlLl90ZXh0dXJlIHx8IHZhbHVlLmNvbG9yWzBdLl90ZXh0dXJlKVxuICAgICAgICAgICAgc2NvcGUoR0wsICcudW5pZm9ybTFpKCcsIExPQ0FUSU9OLCAnLCcsIFRFWF9WQUxVRSArICcuYmluZCgpKTsnKVxuICAgICAgICAgICAgc2NvcGUuZXhpdChURVhfVkFMVUUsICcudW5iaW5kKCk7JylcbiAgICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgICAgdHlwZSA9PT0gR0xfRkxPQVRfTUFUMiB8fFxuICAgICAgICAgICAgdHlwZSA9PT0gR0xfRkxPQVRfTUFUMyB8fFxuICAgICAgICAgICAgdHlwZSA9PT0gR0xfRkxPQVRfTUFUNCkge1xuICAgICAgICAgICAgXG4gICAgICAgICAgICB2YXIgTUFUX1ZBTFVFID0gZW52Lmdsb2JhbC5kZWYoJ25ldyBGbG9hdDMyQXJyYXkoWycgK1xuICAgICAgICAgICAgICBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbCh2YWx1ZSkgKyAnXSknKVxuICAgICAgICAgICAgdmFyIGRpbSA9IDJcbiAgICAgICAgICAgIGlmICh0eXBlID09PSBHTF9GTE9BVF9NQVQzKSB7XG4gICAgICAgICAgICAgIGRpbSA9IDNcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gR0xfRkxPQVRfTUFUNCkge1xuICAgICAgICAgICAgICBkaW0gPSA0XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzY29wZShcbiAgICAgICAgICAgICAgR0wsICcudW5pZm9ybU1hdHJpeCcsIGRpbSwgJ2Z2KCcsXG4gICAgICAgICAgICAgIExPQ0FUSU9OLCAnLGZhbHNlLCcsIE1BVF9WQUxVRSwgJyk7JylcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICAgICAgICAgIGNhc2UgR0xfRkxPQVQ6XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaW5maXggPSAnMWYnXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUMyOlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGluZml4ID0gJzJmJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDMzpcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICczZidcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzQ6XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaW5maXggPSAnNGYnXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9CT09MOlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGluZml4ID0gJzFpJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfSU5UOlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGluZml4ID0gJzFpJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfQk9PTF9WRUMyOlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGluZml4ID0gJzJpJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICAgIGNhc2UgR0xfSU5UX1ZFQzI6XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaW5maXggPSAnMmknXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzM6XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaW5maXggPSAnM2knXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSBHTF9JTlRfVkVDMzpcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICczaSdcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0JPT0xfVkVDNDpcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICc0aSdcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlIEdMX0lOVF9WRUM0OlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGluZml4ID0gJzRpJ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzY29wZShHTCwgJy51bmlmb3JtJywgaW5maXgsICcoJywgTE9DQVRJT04sICcsJyxcbiAgICAgICAgICAgICAgaXNBcnJheUxpa2UodmFsdWUpID8gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwodmFsdWUpIDogdmFsdWUsXG4gICAgICAgICAgICAgICcpOycpXG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgVkFMVUUgPSBhcmcuYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmICghZmlsdGVyKFNDT1BFX0RFQ0wpKSB7XG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfVxuICAgICAgICBWQUxVRSA9IHNjb3BlLmRlZihzaGFyZWQudW5pZm9ybXMsICdbJywgc3RyaW5nU3RvcmUuaWQobmFtZSksICddJylcbiAgICAgIH1cblxuICAgICAgaWYgKHR5cGUgPT09IEdMX1NBTVBMRVJfMkQpIHtcbiAgICAgICAgc2NvcGUoXG4gICAgICAgICAgJ2lmKCcsIFZBTFVFLCAnJiYnLCBWQUxVRSwgJy5fcmVnbFR5cGU9PT1cImZyYW1lYnVmZmVyXCIpeycsXG4gICAgICAgICAgVkFMVUUsICc9JywgVkFMVUUsICcuY29sb3JbMF07JyxcbiAgICAgICAgICAnfScpXG4gICAgICB9IGVsc2UgaWYgKHR5cGUgPT09IEdMX1NBTVBMRVJfQ1VCRSkge1xuICAgICAgICBzY29wZShcbiAgICAgICAgICAnaWYoJywgVkFMVUUsICcmJicsIFZBTFVFLCAnLl9yZWdsVHlwZT09PVwiZnJhbWVidWZmZXJDdWJlXCIpeycsXG4gICAgICAgICAgVkFMVUUsICc9JywgVkFMVUUsICcuY29sb3JbMF07JyxcbiAgICAgICAgICAnfScpXG4gICAgICB9XG5cbiAgICAgIC8vIHBlcmZvcm0gdHlwZSB2YWxpZGF0aW9uXG4gICAgICBcblxuICAgICAgdmFyIHVucm9sbCA9IDFcbiAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICBjYXNlIEdMX1NBTVBMRVJfMkQ6XG4gICAgICAgIGNhc2UgR0xfU0FNUExFUl9DVUJFOlxuICAgICAgICAgIHZhciBURVggPSBzY29wZS5kZWYoVkFMVUUsICcuX3RleHR1cmUnKVxuICAgICAgICAgIHNjb3BlKEdMLCAnLnVuaWZvcm0xaSgnLCBMT0NBVElPTiwgJywnLCBURVgsICcuYmluZCgpKTsnKVxuICAgICAgICAgIHNjb3BlLmV4aXQoVEVYLCAnLnVuYmluZCgpOycpXG4gICAgICAgICAgY29udGludWVcblxuICAgICAgICBjYXNlIEdMX0lOVDpcbiAgICAgICAgY2FzZSBHTF9CT09MOlxuICAgICAgICAgIGluZml4ID0gJzFpJ1xuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9JTlRfVkVDMjpcbiAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzI6XG4gICAgICAgICAgaW5maXggPSAnMmknXG4gICAgICAgICAgdW5yb2xsID0gMlxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9JTlRfVkVDMzpcbiAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzM6XG4gICAgICAgICAgaW5maXggPSAnM2knXG4gICAgICAgICAgdW5yb2xsID0gM1xuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9JTlRfVkVDNDpcbiAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzQ6XG4gICAgICAgICAgaW5maXggPSAnNGknXG4gICAgICAgICAgdW5yb2xsID0gNFxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9GTE9BVDpcbiAgICAgICAgICBpbmZpeCA9ICcxZidcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDMjpcbiAgICAgICAgICBpbmZpeCA9ICcyZidcbiAgICAgICAgICB1bnJvbGwgPSAyXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzM6XG4gICAgICAgICAgaW5maXggPSAnM2YnXG4gICAgICAgICAgdW5yb2xsID0gM1xuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUM0OlxuICAgICAgICAgIGluZml4ID0gJzRmJ1xuICAgICAgICAgIHVucm9sbCA9IDRcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfRkxPQVRfTUFUMjpcbiAgICAgICAgICBpbmZpeCA9ICdNYXRyaXgyZnYnXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX0ZMT0FUX01BVDM6XG4gICAgICAgICAgaW5maXggPSAnTWF0cml4M2Z2J1xuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSBHTF9GTE9BVF9NQVQ0OlxuICAgICAgICAgIGluZml4ID0gJ01hdHJpeDRmdidcbiAgICAgICAgICBicmVha1xuICAgICAgfVxuXG4gICAgICBzY29wZShHTCwgJy51bmlmb3JtJywgaW5maXgsICcoJywgTE9DQVRJT04sICcsJylcbiAgICAgIGlmIChpbmZpeC5jaGFyQXQoMCkgPT09ICdNJykge1xuICAgICAgICB2YXIgbWF0U2l6ZSA9IE1hdGgucG93KHR5cGUgLSBHTF9GTE9BVF9NQVQyICsgMiwgMilcbiAgICAgICAgdmFyIFNUT1JBR0UgPSBlbnYuZ2xvYmFsLmRlZignbmV3IEZsb2F0MzJBcnJheSgnLCBtYXRTaXplLCAnKScpXG4gICAgICAgIHNjb3BlKFxuICAgICAgICAgICdmYWxzZSwoQXJyYXkuaXNBcnJheSgnLCBWQUxVRSwgJyl8fCcsIFZBTFVFLCAnIGluc3RhbmNlb2YgRmxvYXQzMkFycmF5KT8nLCBWQUxVRSwgJzooJyxcbiAgICAgICAgICBsb29wKG1hdFNpemUsIGZ1bmN0aW9uIChpKSB7XG4gICAgICAgICAgICByZXR1cm4gU1RPUkFHRSArICdbJyArIGkgKyAnXT0nICsgVkFMVUUgKyAnWycgKyBpICsgJ10nXG4gICAgICAgICAgfSksICcsJywgU1RPUkFHRSwgJyknKVxuICAgICAgfSBlbHNlIGlmICh1bnJvbGwgPiAxKSB7XG4gICAgICAgIHNjb3BlKGxvb3AodW5yb2xsLCBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgIHJldHVybiBWQUxVRSArICdbJyArIGkgKyAnXSdcbiAgICAgICAgfSkpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzY29wZShWQUxVRSlcbiAgICAgIH1cbiAgICAgIHNjb3BlKCcpOycpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZW1pdERyYXcgKGVudiwgb3V0ZXIsIGlubmVyLCBhcmdzKSB7XG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWRcbiAgICB2YXIgR0wgPSBzaGFyZWQuZ2xcbiAgICB2YXIgRFJBV19TVEFURSA9IHNoYXJlZC5kcmF3XG5cbiAgICB2YXIgZHJhd09wdGlvbnMgPSBhcmdzLmRyYXdcblxuICAgIGZ1bmN0aW9uIGVtaXRFbGVtZW50cyAoKSB7XG4gICAgICB2YXIgZGVmbiA9IGRyYXdPcHRpb25zLmVsZW1lbnRzXG4gICAgICB2YXIgRUxFTUVOVFNcbiAgICAgIHZhciBzY29wZSA9IG91dGVyXG4gICAgICBpZiAoZGVmbikge1xuICAgICAgICBpZiAoKGRlZm4uY29udGV4dERlcCAmJiBhcmdzLmNvbnRleHREeW5hbWljKSB8fCBkZWZuLnByb3BEZXApIHtcbiAgICAgICAgICBzY29wZSA9IGlubmVyXG4gICAgICAgIH1cbiAgICAgICAgRUxFTUVOVFMgPSBkZWZuLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgRUxFTUVOVFMgPSBzY29wZS5kZWYoRFJBV19TVEFURSwgJy4nLCBTX0VMRU1FTlRTKVxuICAgICAgfVxuICAgICAgaWYgKEVMRU1FTlRTKSB7XG4gICAgICAgIHNjb3BlKFxuICAgICAgICAgICdpZignICsgRUxFTUVOVFMgKyAnKScgK1xuICAgICAgICAgIEdMICsgJy5iaW5kQnVmZmVyKCcgKyBHTF9FTEVNRU5UX0FSUkFZX0JVRkZFUiArICcsJyArIEVMRU1FTlRTICsgJy5idWZmZXIuYnVmZmVyKTsnKVxuICAgICAgfVxuICAgICAgcmV0dXJuIEVMRU1FTlRTXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZW1pdENvdW50ICgpIHtcbiAgICAgIHZhciBkZWZuID0gZHJhd09wdGlvbnMuY291bnRcbiAgICAgIHZhciBDT1VOVFxuICAgICAgdmFyIHNjb3BlID0gb3V0ZXJcbiAgICAgIGlmIChkZWZuKSB7XG4gICAgICAgIGlmICgoZGVmbi5jb250ZXh0RGVwICYmIGFyZ3MuY29udGV4dER5bmFtaWMpIHx8IGRlZm4ucHJvcERlcCkge1xuICAgICAgICAgIHNjb3BlID0gaW5uZXJcbiAgICAgICAgfVxuICAgICAgICBDT1VOVCA9IGRlZm4uYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgICAgIFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgQ09VTlQgPSBzY29wZS5kZWYoRFJBV19TVEFURSwgJy4nLCBTX0NPVU5UKVxuICAgICAgICBcbiAgICAgIH1cbiAgICAgIHJldHVybiBDT1VOVFxuICAgIH1cblxuICAgIHZhciBFTEVNRU5UUyA9IGVtaXRFbGVtZW50cygpXG4gICAgZnVuY3Rpb24gZW1pdFZhbHVlIChuYW1lKSB7XG4gICAgICB2YXIgZGVmbiA9IGRyYXdPcHRpb25zW25hbWVdXG4gICAgICBpZiAoZGVmbikge1xuICAgICAgICBpZiAoKGRlZm4uY29udGV4dERlcCAmJiBhcmdzLmNvbnRleHREeW5hbWljKSB8fCBkZWZuLnByb3BEZXApIHtcbiAgICAgICAgICByZXR1cm4gZGVmbi5hcHBlbmQoZW52LCBpbm5lcilcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gZGVmbi5hcHBlbmQoZW52LCBvdXRlcilcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIG91dGVyLmRlZihEUkFXX1NUQVRFLCAnLicsIG5hbWUpXG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFyIFBSSU1JVElWRSA9IGVtaXRWYWx1ZShTX1BSSU1JVElWRSlcbiAgICB2YXIgT0ZGU0VUID0gZW1pdFZhbHVlKFNfT0ZGU0VUKVxuXG4gICAgdmFyIENPVU5UID0gZW1pdENvdW50KClcbiAgICBpZiAodHlwZW9mIENPVU5UID09PSAnbnVtYmVyJykge1xuICAgICAgaWYgKENPVU5UID09PSAwKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBpbm5lcignaWYoJywgQ09VTlQsICcpeycpXG4gICAgICBpbm5lci5leGl0KCd9JylcbiAgICB9XG5cbiAgICB2YXIgSU5TVEFOQ0VTLCBFWFRfSU5TVEFOQ0lOR1xuICAgIGlmIChleHRJbnN0YW5jaW5nKSB7XG4gICAgICBJTlNUQU5DRVMgPSBlbWl0VmFsdWUoU19JTlNUQU5DRVMpXG4gICAgICBFWFRfSU5TVEFOQ0lORyA9IGVudi5pbnN0YW5jaW5nXG4gICAgfVxuXG4gICAgdmFyIEVMRU1FTlRfVFlQRSA9IEVMRU1FTlRTICsgJy50eXBlJ1xuXG4gICAgdmFyIGVsZW1lbnRzU3RhdGljID0gZHJhd09wdGlvbnMuZWxlbWVudHMgJiYgaXNTdGF0aWMoZHJhd09wdGlvbnMuZWxlbWVudHMpXG5cbiAgICBmdW5jdGlvbiBlbWl0SW5zdGFuY2luZyAoKSB7XG4gICAgICBmdW5jdGlvbiBkcmF3RWxlbWVudHMgKCkge1xuICAgICAgICBpbm5lcihFWFRfSU5TVEFOQ0lORywgJy5kcmF3RWxlbWVudHNJbnN0YW5jZWRBTkdMRSgnLCBbXG4gICAgICAgICAgUFJJTUlUSVZFLFxuICAgICAgICAgIENPVU5ULFxuICAgICAgICAgIEVMRU1FTlRfVFlQRSxcbiAgICAgICAgICBPRkZTRVQgKyAnPDwoKCcgKyBFTEVNRU5UX1RZUEUgKyAnLScgKyBHTF9VTlNJR05FRF9CWVRFICsgJyk+PjEpJyxcbiAgICAgICAgICBJTlNUQU5DRVNcbiAgICAgICAgXSwgJyk7JylcbiAgICAgIH1cblxuICAgICAgZnVuY3Rpb24gZHJhd0FycmF5cyAoKSB7XG4gICAgICAgIGlubmVyKEVYVF9JTlNUQU5DSU5HLCAnLmRyYXdBcnJheXNJbnN0YW5jZWRBTkdMRSgnLFxuICAgICAgICAgIFtQUklNSVRJVkUsIE9GRlNFVCwgQ09VTlQsIElOU1RBTkNFU10sICcpOycpXG4gICAgICB9XG5cbiAgICAgIGlmIChFTEVNRU5UUykge1xuICAgICAgICBpZiAoIWVsZW1lbnRzU3RhdGljKSB7XG4gICAgICAgICAgaW5uZXIoJ2lmKCcsIEVMRU1FTlRTLCAnKXsnKVxuICAgICAgICAgIGRyYXdFbGVtZW50cygpXG4gICAgICAgICAgaW5uZXIoJ31lbHNleycpXG4gICAgICAgICAgZHJhd0FycmF5cygpXG4gICAgICAgICAgaW5uZXIoJ30nKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGRyYXdFbGVtZW50cygpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRyYXdBcnJheXMoKVxuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGVtaXRSZWd1bGFyICgpIHtcbiAgICAgIGZ1bmN0aW9uIGRyYXdFbGVtZW50cyAoKSB7XG4gICAgICAgIGlubmVyKEdMICsgJy5kcmF3RWxlbWVudHMoJyArIFtcbiAgICAgICAgICBQUklNSVRJVkUsXG4gICAgICAgICAgQ09VTlQsXG4gICAgICAgICAgRUxFTUVOVF9UWVBFLFxuICAgICAgICAgIE9GRlNFVCArICc8PCgoJyArIEVMRU1FTlRfVFlQRSArICctJyArIEdMX1VOU0lHTkVEX0JZVEUgKyAnKT4+MSknXG4gICAgICAgIF0gKyAnKTsnKVxuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBkcmF3QXJyYXlzICgpIHtcbiAgICAgICAgaW5uZXIoR0wgKyAnLmRyYXdBcnJheXMoJyArIFtQUklNSVRJVkUsIE9GRlNFVCwgQ09VTlRdICsgJyk7JylcbiAgICAgIH1cblxuICAgICAgaWYgKEVMRU1FTlRTKSB7XG4gICAgICAgIGlmICghZWxlbWVudHNTdGF0aWMpIHtcbiAgICAgICAgICBpbm5lcignaWYoJywgRUxFTUVOVFMsICcpeycpXG4gICAgICAgICAgZHJhd0VsZW1lbnRzKClcbiAgICAgICAgICBpbm5lcignfWVsc2V7JylcbiAgICAgICAgICBkcmF3QXJyYXlzKClcbiAgICAgICAgICBpbm5lcignfScpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZHJhd0VsZW1lbnRzKClcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZHJhd0FycmF5cygpXG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGV4dEluc3RhbmNpbmcgJiYgKHR5cGVvZiBJTlNUQU5DRVMgIT09ICdudW1iZXInIHx8IElOU1RBTkNFUyA+PSAwKSkge1xuICAgICAgaWYgKHR5cGVvZiBJTlNUQU5DRVMgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGlubmVyKCdpZignLCBJTlNUQU5DRVMsICc+MCl7JylcbiAgICAgICAgZW1pdEluc3RhbmNpbmcoKVxuICAgICAgICBpbm5lcignfWVsc2UgaWYoJywgSU5TVEFOQ0VTLCAnPDApeycpXG4gICAgICAgIGVtaXRSZWd1bGFyKClcbiAgICAgICAgaW5uZXIoJ30nKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZW1pdEluc3RhbmNpbmcoKVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBlbWl0UmVndWxhcigpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlQm9keSAoZW1pdEJvZHksIHBhcmVudEVudiwgYXJncywgcHJvZ3JhbSwgY291bnQpIHtcbiAgICB2YXIgZW52ID0gY3JlYXRlUkVHTEVudmlyb25tZW50KClcbiAgICB2YXIgc2NvcGUgPSBlbnYucHJvYygnYm9keScsIGNvdW50KVxuICAgIFxuICAgIGlmIChleHRJbnN0YW5jaW5nKSB7XG4gICAgICBlbnYuaW5zdGFuY2luZyA9IHNjb3BlLmRlZihcbiAgICAgICAgZW52LnNoYXJlZC5leHRlbnNpb25zLCAnLmFuZ2xlX2luc3RhbmNlZF9hcnJheXMnKVxuICAgIH1cbiAgICBlbWl0Qm9keShlbnYsIHNjb3BlLCBhcmdzLCBwcm9ncmFtKVxuICAgIHJldHVybiBlbnYuY29tcGlsZSgpLmJvZHlcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gRFJBVyBQUk9DXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgZnVuY3Rpb24gZW1pdERyYXdCb2R5IChlbnYsIGRyYXcsIGFyZ3MsIHByb2dyYW0pIHtcbiAgICBpbmplY3RFeHRlbnNpb25zKGVudiwgZHJhdylcbiAgICBlbWl0QXR0cmlidXRlcyhlbnYsIGRyYXcsIGFyZ3MsIHByb2dyYW0uYXR0cmlidXRlcywgZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIHRydWVcbiAgICB9KVxuICAgIGVtaXRVbmlmb3JtcyhlbnYsIGRyYXcsIGFyZ3MsIHByb2dyYW0udW5pZm9ybXMsIGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiB0cnVlXG4gICAgfSlcbiAgICBlbWl0RHJhdyhlbnYsIGRyYXcsIGRyYXcsIGFyZ3MpXG4gIH1cblxuICBmdW5jdGlvbiBlbWl0RHJhd1Byb2MgKGVudiwgYXJncykge1xuICAgIHZhciBkcmF3ID0gZW52LnByb2MoJ2RyYXcnLCAxKVxuXG4gICAgaW5qZWN0RXh0ZW5zaW9ucyhlbnYsIGRyYXcpXG5cbiAgICBlbWl0Q29udGV4dChlbnYsIGRyYXcsIGFyZ3MuY29udGV4dClcbiAgICBlbWl0UG9sbEZyYW1lYnVmZmVyKGVudiwgZHJhdywgYXJncy5mcmFtZWJ1ZmZlcilcblxuICAgIGVtaXRQb2xsU3RhdGUoZW52LCBkcmF3LCBhcmdzKVxuICAgIGVtaXRTZXRPcHRpb25zKGVudiwgZHJhdywgYXJncy5zdGF0ZSlcblxuICAgIGVtaXRQcm9maWxlKGVudiwgZHJhdywgYXJncywgZmFsc2UsIHRydWUpXG5cbiAgICB2YXIgcHJvZ3JhbSA9IGFyZ3Muc2hhZGVyLnByb2dWYXIuYXBwZW5kKGVudiwgZHJhdylcbiAgICBkcmF3KGVudi5zaGFyZWQuZ2wsICcudXNlUHJvZ3JhbSgnLCBwcm9ncmFtLCAnLnByb2dyYW0pOycpXG5cbiAgICBpZiAoYXJncy5zaGFkZXIucHJvZ3JhbSkge1xuICAgICAgZW1pdERyYXdCb2R5KGVudiwgZHJhdywgYXJncywgYXJncy5zaGFkZXIucHJvZ3JhbSlcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGRyYXdDYWNoZSA9IGVudi5nbG9iYWwuZGVmKCd7fScpXG4gICAgICB2YXIgUFJPR19JRCA9IGRyYXcuZGVmKHByb2dyYW0sICcuaWQnKVxuICAgICAgdmFyIENBQ0hFRF9QUk9DID0gZHJhdy5kZWYoZHJhd0NhY2hlLCAnWycsIFBST0dfSUQsICddJylcbiAgICAgIGRyYXcoXG4gICAgICAgIGVudi5jb25kKENBQ0hFRF9QUk9DKVxuICAgICAgICAgIC50aGVuKENBQ0hFRF9QUk9DLCAnLmNhbGwodGhpcyxhMCk7JylcbiAgICAgICAgICAuZWxzZShcbiAgICAgICAgICAgIENBQ0hFRF9QUk9DLCAnPScsIGRyYXdDYWNoZSwgJ1snLCBQUk9HX0lELCAnXT0nLFxuICAgICAgICAgICAgZW52LmxpbmsoZnVuY3Rpb24gKHByb2dyYW0pIHtcbiAgICAgICAgICAgICAgcmV0dXJuIGNyZWF0ZUJvZHkoZW1pdERyYXdCb2R5LCBlbnYsIGFyZ3MsIHByb2dyYW0sIDEpXG4gICAgICAgICAgICB9KSwgJygnLCBwcm9ncmFtLCAnKTsnLFxuICAgICAgICAgICAgQ0FDSEVEX1BST0MsICcuY2FsbCh0aGlzLGEwKTsnKSlcbiAgICB9XG5cbiAgICBpZiAoT2JqZWN0LmtleXMoYXJncy5zdGF0ZSkubGVuZ3RoID4gMCkge1xuICAgICAgZHJhdyhlbnYuc2hhcmVkLmN1cnJlbnQsICcuZGlydHk9dHJ1ZTsnKVxuICAgIH1cbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gQkFUQ0ggUFJPQ1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgZnVuY3Rpb24gZW1pdEJhdGNoRHluYW1pY1NoYWRlckJvZHkgKGVudiwgc2NvcGUsIGFyZ3MsIHByb2dyYW0pIHtcbiAgICBlbnYuYmF0Y2hJZCA9ICdhMSdcblxuICAgIGluamVjdEV4dGVuc2lvbnMoZW52LCBzY29wZSlcblxuICAgIGZ1bmN0aW9uIGFsbCAoKSB7XG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIH1cblxuICAgIGVtaXRBdHRyaWJ1dGVzKGVudiwgc2NvcGUsIGFyZ3MsIHByb2dyYW0uYXR0cmlidXRlcywgYWxsKVxuICAgIGVtaXRVbmlmb3JtcyhlbnYsIHNjb3BlLCBhcmdzLCBwcm9ncmFtLnVuaWZvcm1zLCBhbGwpXG4gICAgZW1pdERyYXcoZW52LCBzY29wZSwgc2NvcGUsIGFyZ3MpXG4gIH1cblxuICBmdW5jdGlvbiBlbWl0QmF0Y2hCb2R5IChlbnYsIHNjb3BlLCBhcmdzLCBwcm9ncmFtKSB7XG4gICAgaW5qZWN0RXh0ZW5zaW9ucyhlbnYsIHNjb3BlKVxuXG4gICAgdmFyIGNvbnRleHREeW5hbWljID0gYXJncy5jb250ZXh0RGVwXG5cbiAgICB2YXIgQkFUQ0hfSUQgPSBzY29wZS5kZWYoKVxuICAgIHZhciBQUk9QX0xJU1QgPSAnYTAnXG4gICAgdmFyIE5VTV9QUk9QUyA9ICdhMSdcbiAgICB2YXIgUFJPUFMgPSBzY29wZS5kZWYoKVxuICAgIGVudi5zaGFyZWQucHJvcHMgPSBQUk9QU1xuICAgIGVudi5iYXRjaElkID0gQkFUQ0hfSURcblxuICAgIHZhciBvdXRlciA9IGVudi5zY29wZSgpXG4gICAgdmFyIGlubmVyID0gZW52LnNjb3BlKClcblxuICAgIHNjb3BlKFxuICAgICAgb3V0ZXIuZW50cnksXG4gICAgICAnZm9yKCcsIEJBVENIX0lELCAnPTA7JywgQkFUQ0hfSUQsICc8JywgTlVNX1BST1BTLCAnOysrJywgQkFUQ0hfSUQsICcpeycsXG4gICAgICBQUk9QUywgJz0nLCBQUk9QX0xJU1QsICdbJywgQkFUQ0hfSUQsICddOycsXG4gICAgICBpbm5lcixcbiAgICAgICd9JyxcbiAgICAgIG91dGVyLmV4aXQpXG5cbiAgICBmdW5jdGlvbiBpc0lubmVyRGVmbiAoZGVmbikge1xuICAgICAgcmV0dXJuICgoZGVmbi5jb250ZXh0RGVwICYmIGNvbnRleHREeW5hbWljKSB8fCBkZWZuLnByb3BEZXApXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaXNPdXRlckRlZm4gKGRlZm4pIHtcbiAgICAgIHJldHVybiAhaXNJbm5lckRlZm4oZGVmbilcbiAgICB9XG5cbiAgICBpZiAoYXJncy5uZWVkc0NvbnRleHQpIHtcbiAgICAgIGVtaXRDb250ZXh0KGVudiwgaW5uZXIsIGFyZ3MuY29udGV4dClcbiAgICB9XG4gICAgaWYgKGFyZ3MubmVlZHNGcmFtZWJ1ZmZlcikge1xuICAgICAgZW1pdFBvbGxGcmFtZWJ1ZmZlcihlbnYsIGlubmVyLCBhcmdzLmZyYW1lYnVmZmVyKVxuICAgIH1cbiAgICBlbWl0U2V0T3B0aW9ucyhlbnYsIGlubmVyLCBhcmdzLnN0YXRlLCBpc0lubmVyRGVmbilcblxuICAgIGlmIChhcmdzLnByb2ZpbGUgJiYgaXNJbm5lckRlZm4oYXJncy5wcm9maWxlKSkge1xuICAgICAgZW1pdFByb2ZpbGUoZW52LCBpbm5lciwgYXJncywgZmFsc2UsIHRydWUpXG4gICAgfVxuXG4gICAgaWYgKCFwcm9ncmFtKSB7XG4gICAgICB2YXIgcHJvZ0NhY2hlID0gZW52Lmdsb2JhbC5kZWYoJ3t9JylcbiAgICAgIHZhciBQUk9HUkFNID0gYXJncy5zaGFkZXIucHJvZ1Zhci5hcHBlbmQoZW52LCBpbm5lcilcbiAgICAgIHZhciBQUk9HX0lEID0gaW5uZXIuZGVmKFBST0dSQU0sICcuaWQnKVxuICAgICAgdmFyIENBQ0hFRF9QUk9DID0gaW5uZXIuZGVmKHByb2dDYWNoZSwgJ1snLCBQUk9HX0lELCAnXScpXG4gICAgICBpbm5lcihcbiAgICAgICAgZW52LnNoYXJlZC5nbCwgJy51c2VQcm9ncmFtKCcsIFBST0dSQU0sICcucHJvZ3JhbSk7JyxcbiAgICAgICAgJ2lmKCEnLCBDQUNIRURfUFJPQywgJyl7JyxcbiAgICAgICAgQ0FDSEVEX1BST0MsICc9JywgcHJvZ0NhY2hlLCAnWycsIFBST0dfSUQsICddPScsXG4gICAgICAgIGVudi5saW5rKGZ1bmN0aW9uIChwcm9ncmFtKSB7XG4gICAgICAgICAgcmV0dXJuIGNyZWF0ZUJvZHkoXG4gICAgICAgICAgICBlbWl0QmF0Y2hEeW5hbWljU2hhZGVyQm9keSwgZW52LCBhcmdzLCBwcm9ncmFtLCAyKVxuICAgICAgICB9KSwgJygnLCBQUk9HUkFNLCAnKTt9JyxcbiAgICAgICAgQ0FDSEVEX1BST0MsICcuY2FsbCh0aGlzLGEwWycsIEJBVENIX0lELCAnXSwnLCBCQVRDSF9JRCwgJyk7JylcbiAgICB9IGVsc2Uge1xuICAgICAgZW1pdEF0dHJpYnV0ZXMoZW52LCBvdXRlciwgYXJncywgcHJvZ3JhbS5hdHRyaWJ1dGVzLCBpc091dGVyRGVmbilcbiAgICAgIGVtaXRBdHRyaWJ1dGVzKGVudiwgaW5uZXIsIGFyZ3MsIHByb2dyYW0uYXR0cmlidXRlcywgaXNJbm5lckRlZm4pXG4gICAgICBlbWl0VW5pZm9ybXMoZW52LCBvdXRlciwgYXJncywgcHJvZ3JhbS51bmlmb3JtcywgaXNPdXRlckRlZm4pXG4gICAgICBlbWl0VW5pZm9ybXMoZW52LCBpbm5lciwgYXJncywgcHJvZ3JhbS51bmlmb3JtcywgaXNJbm5lckRlZm4pXG4gICAgICBlbWl0RHJhdyhlbnYsIG91dGVyLCBpbm5lciwgYXJncylcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBlbWl0QmF0Y2hQcm9jIChlbnYsIGFyZ3MpIHtcbiAgICB2YXIgYmF0Y2ggPSBlbnYucHJvYygnYmF0Y2gnLCAyKVxuICAgIGVudi5iYXRjaElkID0gJzAnXG5cbiAgICBpbmplY3RFeHRlbnNpb25zKGVudiwgYmF0Y2gpXG5cbiAgICAvLyBDaGVjayBpZiBhbnkgY29udGV4dCB2YXJpYWJsZXMgZGVwZW5kIG9uIHByb3BzXG4gICAgdmFyIGNvbnRleHREeW5hbWljID0gZmFsc2VcbiAgICB2YXIgbmVlZHNDb250ZXh0ID0gdHJ1ZVxuICAgIE9iamVjdC5rZXlzKGFyZ3MuY29udGV4dCkuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgY29udGV4dER5bmFtaWMgPSBjb250ZXh0RHluYW1pYyB8fCBhcmdzLmNvbnRleHRbbmFtZV0ucHJvcERlcFxuICAgIH0pXG4gICAgaWYgKCFjb250ZXh0RHluYW1pYykge1xuICAgICAgZW1pdENvbnRleHQoZW52LCBiYXRjaCwgYXJncy5jb250ZXh0KVxuICAgICAgbmVlZHNDb250ZXh0ID0gZmFsc2VcbiAgICB9XG5cbiAgICAvLyBmcmFtZWJ1ZmZlciBzdGF0ZSBhZmZlY3RzIGZyYW1lYnVmZmVyV2lkdGgvaGVpZ2h0IGNvbnRleHQgdmFyc1xuICAgIHZhciBmcmFtZWJ1ZmZlciA9IGFyZ3MuZnJhbWVidWZmZXJcbiAgICB2YXIgbmVlZHNGcmFtZWJ1ZmZlciA9IGZhbHNlXG4gICAgaWYgKGZyYW1lYnVmZmVyKSB7XG4gICAgICBpZiAoZnJhbWVidWZmZXIucHJvcERlcCkge1xuICAgICAgICBjb250ZXh0RHluYW1pYyA9IG5lZWRzRnJhbWVidWZmZXIgPSB0cnVlXG4gICAgICB9IGVsc2UgaWYgKGZyYW1lYnVmZmVyLmNvbnRleHREZXAgJiYgY29udGV4dER5bmFtaWMpIHtcbiAgICAgICAgbmVlZHNGcmFtZWJ1ZmZlciA9IHRydWVcbiAgICAgIH1cbiAgICAgIGlmICghbmVlZHNGcmFtZWJ1ZmZlcikge1xuICAgICAgICBlbWl0UG9sbEZyYW1lYnVmZmVyKGVudiwgYmF0Y2gsIGZyYW1lYnVmZmVyKVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBlbWl0UG9sbEZyYW1lYnVmZmVyKGVudiwgYmF0Y2gsIG51bGwpXG4gICAgfVxuXG4gICAgLy8gdmlld3BvcnQgaXMgd2VpcmQgYmVjYXVzZSBpdCBjYW4gYWZmZWN0IGNvbnRleHQgdmFyc1xuICAgIGlmIChhcmdzLnN0YXRlLnZpZXdwb3J0ICYmIGFyZ3Muc3RhdGUudmlld3BvcnQucHJvcERlcCkge1xuICAgICAgY29udGV4dER5bmFtaWMgPSB0cnVlXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaXNJbm5lckRlZm4gKGRlZm4pIHtcbiAgICAgIHJldHVybiAoZGVmbi5jb250ZXh0RGVwICYmIGNvbnRleHREeW5hbWljKSB8fCBkZWZuLnByb3BEZXBcbiAgICB9XG5cbiAgICAvLyBzZXQgd2ViZ2wgb3B0aW9uc1xuICAgIGVtaXRQb2xsU3RhdGUoZW52LCBiYXRjaCwgYXJncylcbiAgICBlbWl0U2V0T3B0aW9ucyhlbnYsIGJhdGNoLCBhcmdzLnN0YXRlLCBmdW5jdGlvbiAoZGVmbikge1xuICAgICAgcmV0dXJuICFpc0lubmVyRGVmbihkZWZuKVxuICAgIH0pXG5cbiAgICBpZiAoIWFyZ3MucHJvZmlsZSB8fCAhaXNJbm5lckRlZm4oYXJncy5wcm9maWxlKSkge1xuICAgICAgZW1pdFByb2ZpbGUoZW52LCBiYXRjaCwgYXJncywgZmFsc2UsICdhMScpXG4gICAgfVxuXG4gICAgLy8gU2F2ZSB0aGVzZSB2YWx1ZXMgdG8gYXJncyBzbyB0aGF0IHRoZSBiYXRjaCBib2R5IHJvdXRpbmUgY2FuIHVzZSB0aGVtXG4gICAgYXJncy5jb250ZXh0RGVwID0gY29udGV4dER5bmFtaWNcbiAgICBhcmdzLm5lZWRzQ29udGV4dCA9IG5lZWRzQ29udGV4dFxuICAgIGFyZ3MubmVlZHNGcmFtZWJ1ZmZlciA9IG5lZWRzRnJhbWVidWZmZXJcblxuICAgIC8vIGRldGVybWluZSBpZiBzaGFkZXIgaXMgZHluYW1pY1xuICAgIHZhciBwcm9nRGVmbiA9IGFyZ3Muc2hhZGVyLnByb2dWYXJcbiAgICBpZiAoKHByb2dEZWZuLmNvbnRleHREZXAgJiYgY29udGV4dER5bmFtaWMpIHx8IHByb2dEZWZuLnByb3BEZXApIHtcbiAgICAgIGVtaXRCYXRjaEJvZHkoXG4gICAgICAgIGVudixcbiAgICAgICAgYmF0Y2gsXG4gICAgICAgIGFyZ3MsXG4gICAgICAgIG51bGwpXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBQUk9HUkFNID0gcHJvZ0RlZm4uYXBwZW5kKGVudiwgYmF0Y2gpXG4gICAgICBiYXRjaChlbnYuc2hhcmVkLmdsLCAnLnVzZVByb2dyYW0oJywgUFJPR1JBTSwgJy5wcm9ncmFtKTsnKVxuICAgICAgaWYgKGFyZ3Muc2hhZGVyLnByb2dyYW0pIHtcbiAgICAgICAgZW1pdEJhdGNoQm9keShcbiAgICAgICAgICBlbnYsXG4gICAgICAgICAgYmF0Y2gsXG4gICAgICAgICAgYXJncyxcbiAgICAgICAgICBhcmdzLnNoYWRlci5wcm9ncmFtKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIGJhdGNoQ2FjaGUgPSBlbnYuZ2xvYmFsLmRlZigne30nKVxuICAgICAgICB2YXIgUFJPR19JRCA9IGJhdGNoLmRlZihQUk9HUkFNLCAnLmlkJylcbiAgICAgICAgdmFyIENBQ0hFRF9QUk9DID0gYmF0Y2guZGVmKGJhdGNoQ2FjaGUsICdbJywgUFJPR19JRCwgJ10nKVxuICAgICAgICBiYXRjaChcbiAgICAgICAgICBlbnYuY29uZChDQUNIRURfUFJPQylcbiAgICAgICAgICAgIC50aGVuKENBQ0hFRF9QUk9DLCAnLmNhbGwodGhpcyxhMCxhMSk7JylcbiAgICAgICAgICAgIC5lbHNlKFxuICAgICAgICAgICAgICBDQUNIRURfUFJPQywgJz0nLCBiYXRjaENhY2hlLCAnWycsIFBST0dfSUQsICddPScsXG4gICAgICAgICAgICAgIGVudi5saW5rKGZ1bmN0aW9uIChwcm9ncmFtKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNyZWF0ZUJvZHkoZW1pdEJhdGNoQm9keSwgZW52LCBhcmdzLCBwcm9ncmFtLCAyKVxuICAgICAgICAgICAgICB9KSwgJygnLCBQUk9HUkFNLCAnKTsnLFxuICAgICAgICAgICAgICBDQUNIRURfUFJPQywgJy5jYWxsKHRoaXMsYTAsYTEpOycpKVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChPYmplY3Qua2V5cyhhcmdzLnN0YXRlKS5sZW5ndGggPiAwKSB7XG4gICAgICBiYXRjaChlbnYuc2hhcmVkLmN1cnJlbnQsICcuZGlydHk9dHJ1ZTsnKVxuICAgIH1cbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gU0NPUEUgQ09NTUFORFxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIGZ1bmN0aW9uIGVtaXRTY29wZVByb2MgKGVudiwgYXJncykge1xuICAgIHZhciBzY29wZSA9IGVudi5wcm9jKCdzY29wZScsIDMpXG4gICAgZW52LmJhdGNoSWQgPSAnYTInXG5cbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZFxuICAgIHZhciBDVVJSRU5UX1NUQVRFID0gc2hhcmVkLmN1cnJlbnRcblxuICAgIGVtaXRDb250ZXh0KGVudiwgc2NvcGUsIGFyZ3MuY29udGV4dClcblxuICAgIGlmIChhcmdzLmZyYW1lYnVmZmVyKSB7XG4gICAgICBhcmdzLmZyYW1lYnVmZmVyLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgIH1cblxuICAgIHNvcnRTdGF0ZShPYmplY3Qua2V5cyhhcmdzLnN0YXRlKSkuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgdmFyIGRlZm4gPSBhcmdzLnN0YXRlW25hbWVdXG4gICAgICB2YXIgdmFsdWUgPSBkZWZuLmFwcGVuZChlbnYsIHNjb3BlKVxuICAgICAgaWYgKGlzQXJyYXlMaWtlKHZhbHVlKSkge1xuICAgICAgICB2YWx1ZS5mb3JFYWNoKGZ1bmN0aW9uICh2LCBpKSB7XG4gICAgICAgICAgc2NvcGUuc2V0KGVudi5uZXh0W25hbWVdLCAnWycgKyBpICsgJ10nLCB2KVxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2NvcGUuc2V0KHNoYXJlZC5uZXh0LCAnLicgKyBuYW1lLCB2YWx1ZSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgZW1pdFByb2ZpbGUoZW52LCBzY29wZSwgYXJncywgdHJ1ZSwgdHJ1ZSlcblxuICAgIDtbU19FTEVNRU5UUywgU19PRkZTRVQsIFNfQ09VTlQsIFNfSU5TVEFOQ0VTLCBTX1BSSU1JVElWRV0uZm9yRWFjaChcbiAgICAgIGZ1bmN0aW9uIChvcHQpIHtcbiAgICAgICAgdmFyIHZhcmlhYmxlID0gYXJncy5kcmF3W29wdF1cbiAgICAgICAgaWYgKCF2YXJpYWJsZSkge1xuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG4gICAgICAgIHNjb3BlLnNldChzaGFyZWQuZHJhdywgJy4nICsgb3B0LCAnJyArIHZhcmlhYmxlLmFwcGVuZChlbnYsIHNjb3BlKSlcbiAgICAgIH0pXG5cbiAgICBPYmplY3Qua2V5cyhhcmdzLnVuaWZvcm1zKS5mb3JFYWNoKGZ1bmN0aW9uIChvcHQpIHtcbiAgICAgIHNjb3BlLnNldChcbiAgICAgICAgc2hhcmVkLnVuaWZvcm1zLFxuICAgICAgICAnWycgKyBzdHJpbmdTdG9yZS5pZChvcHQpICsgJ10nLFxuICAgICAgICBhcmdzLnVuaWZvcm1zW29wdF0uYXBwZW5kKGVudiwgc2NvcGUpKVxuICAgIH0pXG5cbiAgICBPYmplY3Qua2V5cyhhcmdzLmF0dHJpYnV0ZXMpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHZhciByZWNvcmQgPSBhcmdzLmF0dHJpYnV0ZXNbbmFtZV0uYXBwZW5kKGVudiwgc2NvcGUpXG4gICAgICB2YXIgc2NvcGVBdHRyaWIgPSBlbnYuc2NvcGVBdHRyaWIobmFtZSlcbiAgICAgIE9iamVjdC5rZXlzKG5ldyBBdHRyaWJ1dGVSZWNvcmQoKSkuZm9yRWFjaChmdW5jdGlvbiAocHJvcCkge1xuICAgICAgICBzY29wZS5zZXQoc2NvcGVBdHRyaWIsICcuJyArIHByb3AsIHJlY29yZFtwcm9wXSlcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGZ1bmN0aW9uIHNhdmVTaGFkZXIgKG5hbWUpIHtcbiAgICAgIHZhciBzaGFkZXIgPSBhcmdzLnNoYWRlcltuYW1lXVxuICAgICAgaWYgKHNoYWRlcikge1xuICAgICAgICBzY29wZS5zZXQoc2hhcmVkLnNoYWRlciwgJy4nICsgbmFtZSwgc2hhZGVyLmFwcGVuZChlbnYsIHNjb3BlKSlcbiAgICAgIH1cbiAgICB9XG4gICAgc2F2ZVNoYWRlcihTX1ZFUlQpXG4gICAgc2F2ZVNoYWRlcihTX0ZSQUcpXG5cbiAgICBpZiAoT2JqZWN0LmtleXMoYXJncy5zdGF0ZSkubGVuZ3RoID4gMCkge1xuICAgICAgc2NvcGUoQ1VSUkVOVF9TVEFURSwgJy5kaXJ0eT10cnVlOycpXG4gICAgICBzY29wZS5leGl0KENVUlJFTlRfU1RBVEUsICcuZGlydHk9dHJ1ZTsnKVxuICAgIH1cblxuICAgIHNjb3BlKCdhMSgnLCBlbnYuc2hhcmVkLmNvbnRleHQsICcsYTAsJywgZW52LmJhdGNoSWQsICcpOycpXG4gIH1cblxuICBmdW5jdGlvbiBpc0R5bmFtaWNPYmplY3QgKG9iamVjdCkge1xuICAgIGlmICh0eXBlb2Ygb2JqZWN0ICE9PSAnb2JqZWN0JyB8fCBpc0FycmF5TGlrZShvYmplY3QpKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgdmFyIHByb3BzID0gT2JqZWN0LmtleXMob2JqZWN0KVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcHJvcHMubGVuZ3RoOyArK2kpIHtcbiAgICAgIGlmIChkeW5hbWljLmlzRHluYW1pYyhvYmplY3RbcHJvcHNbaV1dKSkge1xuICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2VcbiAgfVxuXG4gIGZ1bmN0aW9uIHNwbGF0T2JqZWN0IChlbnYsIG9wdGlvbnMsIG5hbWUpIHtcbiAgICB2YXIgb2JqZWN0ID0gb3B0aW9ucy5zdGF0aWNbbmFtZV1cbiAgICBpZiAoIW9iamVjdCB8fCAhaXNEeW5hbWljT2JqZWN0KG9iamVjdCkpIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIHZhciBnbG9iYWxzID0gZW52Lmdsb2JhbFxuICAgIHZhciBrZXlzID0gT2JqZWN0LmtleXMob2JqZWN0KVxuICAgIHZhciB0aGlzRGVwID0gZmFsc2VcbiAgICB2YXIgY29udGV4dERlcCA9IGZhbHNlXG4gICAgdmFyIHByb3BEZXAgPSBmYWxzZVxuICAgIHZhciBvYmplY3RSZWYgPSBlbnYuZ2xvYmFsLmRlZigne30nKVxuICAgIGtleXMuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICB2YXIgdmFsdWUgPSBvYmplY3Rba2V5XVxuICAgICAgaWYgKGR5bmFtaWMuaXNEeW5hbWljKHZhbHVlKSkge1xuICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgdmFsdWUgPSBvYmplY3Rba2V5XSA9IGR5bmFtaWMudW5ib3godmFsdWUpXG4gICAgICAgIH1cbiAgICAgICAgdmFyIGRlcHMgPSBjcmVhdGVEeW5hbWljRGVjbCh2YWx1ZSwgbnVsbClcbiAgICAgICAgdGhpc0RlcCA9IHRoaXNEZXAgfHwgZGVwcy50aGlzRGVwXG4gICAgICAgIHByb3BEZXAgPSBwcm9wRGVwIHx8IGRlcHMucHJvcERlcFxuICAgICAgICBjb250ZXh0RGVwID0gY29udGV4dERlcCB8fCBkZXBzLmNvbnRleHREZXBcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGdsb2JhbHMob2JqZWN0UmVmLCAnLicsIGtleSwgJz0nKVxuICAgICAgICBzd2l0Y2ggKHR5cGVvZiB2YWx1ZSkge1xuICAgICAgICAgIGNhc2UgJ251bWJlcic6XG4gICAgICAgICAgICBnbG9iYWxzKHZhbHVlKVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgICAgICAgZ2xvYmFscygnXCInLCB2YWx1ZSwgJ1wiJylcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuICAgICAgICAgICAgICBnbG9iYWxzKCdbJywgdmFsdWUuam9pbigpLCAnXScpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICBnbG9iYWxzKGVudi5saW5rKHZhbHVlKSlcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgIH1cbiAgICAgICAgZ2xvYmFscygnOycpXG4gICAgICB9XG4gICAgfSlcblxuICAgIGZ1bmN0aW9uIGFwcGVuZEJsb2NrIChlbnYsIGJsb2NrKSB7XG4gICAgICBrZXlzLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgICB2YXIgdmFsdWUgPSBvYmplY3Rba2V5XVxuICAgICAgICBpZiAoIWR5bmFtaWMuaXNEeW5hbWljKHZhbHVlKSkge1xuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG4gICAgICAgIHZhciByZWYgPSBlbnYuaW52b2tlKGJsb2NrLCB2YWx1ZSlcbiAgICAgICAgYmxvY2sob2JqZWN0UmVmLCAnLicsIGtleSwgJz0nLCByZWYsICc7JylcbiAgICAgIH0pXG4gICAgfVxuXG4gICAgb3B0aW9ucy5keW5hbWljW25hbWVdID0gbmV3IGR5bmFtaWMuRHluYW1pY1ZhcmlhYmxlKERZTl9USFVOSywge1xuICAgICAgdGhpc0RlcDogdGhpc0RlcCxcbiAgICAgIGNvbnRleHREZXA6IGNvbnRleHREZXAsXG4gICAgICBwcm9wRGVwOiBwcm9wRGVwLFxuICAgICAgcmVmOiBvYmplY3RSZWYsXG4gICAgICBhcHBlbmQ6IGFwcGVuZEJsb2NrXG4gICAgfSlcbiAgICBkZWxldGUgb3B0aW9ucy5zdGF0aWNbbmFtZV1cbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gTUFJTiBEUkFXIENPTU1BTkRcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICBmdW5jdGlvbiBjb21waWxlQ29tbWFuZCAob3B0aW9ucywgYXR0cmlidXRlcywgdW5pZm9ybXMsIGNvbnRleHQsIHN0YXRzKSB7XG4gICAgdmFyIGVudiA9IGNyZWF0ZVJFR0xFbnZpcm9ubWVudCgpXG5cbiAgICAvLyBsaW5rIHN0YXRzLCBzbyB0aGF0IHdlIGNhbiBlYXNpbHkgYWNjZXNzIGl0IGluIHRoZSBwcm9ncmFtLlxuICAgIGVudi5zdGF0cyA9IGVudi5saW5rKHN0YXRzKVxuXG4gICAgLy8gc3BsYXQgb3B0aW9ucyBhbmQgYXR0cmlidXRlcyB0byBhbGxvdyBmb3IgZHluYW1pYyBuZXN0ZWQgcHJvcGVydGllc1xuICAgIE9iamVjdC5rZXlzKGF0dHJpYnV0ZXMuc3RhdGljKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgIHNwbGF0T2JqZWN0KGVudiwgYXR0cmlidXRlcywga2V5KVxuICAgIH0pXG4gICAgTkVTVEVEX09QVElPTlMuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgc3BsYXRPYmplY3QoZW52LCBvcHRpb25zLCBuYW1lKVxuICAgIH0pXG5cbiAgICB2YXIgYXJncyA9IHBhcnNlQXJndW1lbnRzKG9wdGlvbnMsIGF0dHJpYnV0ZXMsIHVuaWZvcm1zLCBjb250ZXh0LCBlbnYpXG5cbiAgICBlbWl0RHJhd1Byb2MoZW52LCBhcmdzKVxuICAgIGVtaXRTY29wZVByb2MoZW52LCBhcmdzKVxuICAgIGVtaXRCYXRjaFByb2MoZW52LCBhcmdzKVxuXG4gICAgcmV0dXJuIGVudi5jb21waWxlKClcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gUE9MTCAvIFJFRlJFU0hcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICByZXR1cm4ge1xuICAgIG5leHQ6IG5leHRTdGF0ZSxcbiAgICBjdXJyZW50OiBjdXJyZW50U3RhdGUsXG4gICAgcHJvY3M6IChmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgZW52ID0gY3JlYXRlUkVHTEVudmlyb25tZW50KClcbiAgICAgIHZhciBwb2xsID0gZW52LnByb2MoJ3BvbGwnKVxuICAgICAgdmFyIHJlZnJlc2ggPSBlbnYucHJvYygncmVmcmVzaCcpXG4gICAgICB2YXIgY29tbW9uID0gZW52LmJsb2NrKClcbiAgICAgIHBvbGwoY29tbW9uKVxuICAgICAgcmVmcmVzaChjb21tb24pXG5cbiAgICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkXG4gICAgICB2YXIgR0wgPSBzaGFyZWQuZ2xcbiAgICAgIHZhciBORVhUX1NUQVRFID0gc2hhcmVkLm5leHRcbiAgICAgIHZhciBDVVJSRU5UX1NUQVRFID0gc2hhcmVkLmN1cnJlbnRcblxuICAgICAgY29tbW9uKENVUlJFTlRfU1RBVEUsICcuZGlydHk9ZmFsc2U7JylcblxuICAgICAgZW1pdFBvbGxGcmFtZWJ1ZmZlcihlbnYsIHBvbGwpXG4gICAgICBlbWl0UG9sbEZyYW1lYnVmZmVyKGVudiwgcmVmcmVzaCwgbnVsbCwgdHJ1ZSlcblxuICAgICAgLy8gUmVmcmVzaCB1cGRhdGVzIGFsbCBhdHRyaWJ1dGUgc3RhdGUgY2hhbmdlc1xuICAgICAgdmFyIGV4dEluc3RhbmNpbmcgPSBnbC5nZXRFeHRlbnNpb24oJ2FuZ2xlX2luc3RhbmNlZF9hcnJheXMnKVxuICAgICAgdmFyIElOU1RBTkNJTkdcbiAgICAgIGlmIChleHRJbnN0YW5jaW5nKSB7XG4gICAgICAgIElOU1RBTkNJTkcgPSBlbnYubGluayhleHRJbnN0YW5jaW5nKVxuICAgICAgfVxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsaW1pdHMubWF4QXR0cmlidXRlczsgKytpKSB7XG4gICAgICAgIHZhciBCSU5ESU5HID0gcmVmcmVzaC5kZWYoc2hhcmVkLmF0dHJpYnV0ZXMsICdbJywgaSwgJ10nKVxuICAgICAgICB2YXIgaWZ0ZSA9IGVudi5jb25kKEJJTkRJTkcsICcuYnVmZmVyJylcbiAgICAgICAgaWZ0ZS50aGVuKFxuICAgICAgICAgIEdMLCAnLmVuYWJsZVZlcnRleEF0dHJpYkFycmF5KCcsIGksICcpOycsXG4gICAgICAgICAgR0wsICcuYmluZEJ1ZmZlcignLFxuICAgICAgICAgICAgR0xfQVJSQVlfQlVGRkVSLCAnLCcsXG4gICAgICAgICAgICBCSU5ESU5HLCAnLmJ1ZmZlci5idWZmZXIpOycsXG4gICAgICAgICAgR0wsICcudmVydGV4QXR0cmliUG9pbnRlcignLFxuICAgICAgICAgICAgaSwgJywnLFxuICAgICAgICAgICAgQklORElORywgJy5zaXplLCcsXG4gICAgICAgICAgICBCSU5ESU5HLCAnLnR5cGUsJyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcubm9ybWFsaXplZCwnLFxuICAgICAgICAgICAgQklORElORywgJy5zdHJpZGUsJyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcub2Zmc2V0KTsnXG4gICAgICAgICkuZWxzZShcbiAgICAgICAgICBHTCwgJy5kaXNhYmxlVmVydGV4QXR0cmliQXJyYXkoJywgaSwgJyk7JyxcbiAgICAgICAgICBHTCwgJy52ZXJ0ZXhBdHRyaWI0ZignLFxuICAgICAgICAgICAgaSwgJywnLFxuICAgICAgICAgICAgQklORElORywgJy54LCcsXG4gICAgICAgICAgICBCSU5ESU5HLCAnLnksJyxcbiAgICAgICAgICAgIEJJTkRJTkcsICcueiwnLFxuICAgICAgICAgICAgQklORElORywgJy53KTsnLFxuICAgICAgICAgIEJJTkRJTkcsICcuYnVmZmVyPW51bGw7JylcbiAgICAgICAgcmVmcmVzaChpZnRlKVxuICAgICAgICBpZiAoZXh0SW5zdGFuY2luZykge1xuICAgICAgICAgIHJlZnJlc2goXG4gICAgICAgICAgICBJTlNUQU5DSU5HLCAnLnZlcnRleEF0dHJpYkRpdmlzb3JBTkdMRSgnLFxuICAgICAgICAgICAgaSwgJywnLFxuICAgICAgICAgICAgQklORElORywgJy5kaXZpc29yKTsnKVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIE9iamVjdC5rZXlzKEdMX0ZMQUdTKS5mb3JFYWNoKGZ1bmN0aW9uIChmbGFnKSB7XG4gICAgICAgIHZhciBjYXAgPSBHTF9GTEFHU1tmbGFnXVxuICAgICAgICB2YXIgTkVYVCA9IGNvbW1vbi5kZWYoTkVYVF9TVEFURSwgJy4nLCBmbGFnKVxuICAgICAgICB2YXIgYmxvY2sgPSBlbnYuYmxvY2soKVxuICAgICAgICBibG9jaygnaWYoJywgTkVYVCwgJyl7JyxcbiAgICAgICAgICBHTCwgJy5lbmFibGUoJywgY2FwLCAnKX1lbHNleycsXG4gICAgICAgICAgR0wsICcuZGlzYWJsZSgnLCBjYXAsICcpfScsXG4gICAgICAgICAgQ1VSUkVOVF9TVEFURSwgJy4nLCBmbGFnLCAnPScsIE5FWFQsICc7JylcbiAgICAgICAgcmVmcmVzaChibG9jaylcbiAgICAgICAgcG9sbChcbiAgICAgICAgICAnaWYoJywgTkVYVCwgJyE9PScsIENVUlJFTlRfU1RBVEUsICcuJywgZmxhZywgJyl7JyxcbiAgICAgICAgICBibG9jayxcbiAgICAgICAgICAnfScpXG4gICAgICB9KVxuXG4gICAgICBPYmplY3Qua2V5cyhHTF9WQVJJQUJMRVMpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgdmFyIGZ1bmMgPSBHTF9WQVJJQUJMRVNbbmFtZV1cbiAgICAgICAgdmFyIGluaXQgPSBjdXJyZW50U3RhdGVbbmFtZV1cbiAgICAgICAgdmFyIE5FWFQsIENVUlJFTlRcbiAgICAgICAgdmFyIGJsb2NrID0gZW52LmJsb2NrKClcbiAgICAgICAgYmxvY2soR0wsICcuJywgZnVuYywgJygnKVxuICAgICAgICBpZiAoaXNBcnJheUxpa2UoaW5pdCkpIHtcbiAgICAgICAgICB2YXIgbiA9IGluaXQubGVuZ3RoXG4gICAgICAgICAgTkVYVCA9IGVudi5nbG9iYWwuZGVmKE5FWFRfU1RBVEUsICcuJywgbmFtZSlcbiAgICAgICAgICBDVVJSRU5UID0gZW52Lmdsb2JhbC5kZWYoQ1VSUkVOVF9TVEFURSwgJy4nLCBuYW1lKVxuICAgICAgICAgIGJsb2NrKFxuICAgICAgICAgICAgbG9vcChuLCBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgICAgICByZXR1cm4gTkVYVCArICdbJyArIGkgKyAnXSdcbiAgICAgICAgICAgIH0pLCAnKTsnLFxuICAgICAgICAgICAgbG9vcChuLCBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgICAgICByZXR1cm4gQ1VSUkVOVCArICdbJyArIGkgKyAnXT0nICsgTkVYVCArICdbJyArIGkgKyAnXTsnXG4gICAgICAgICAgICB9KS5qb2luKCcnKSlcbiAgICAgICAgICBwb2xsKFxuICAgICAgICAgICAgJ2lmKCcsIGxvb3AobiwgZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIE5FWFQgKyAnWycgKyBpICsgJ10hPT0nICsgQ1VSUkVOVCArICdbJyArIGkgKyAnXSdcbiAgICAgICAgICAgIH0pLmpvaW4oJ3x8JyksICcpeycsXG4gICAgICAgICAgICBibG9jayxcbiAgICAgICAgICAgICd9JylcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBORVhUID0gY29tbW9uLmRlZihORVhUX1NUQVRFLCAnLicsIG5hbWUpXG4gICAgICAgICAgQ1VSUkVOVCA9IGNvbW1vbi5kZWYoQ1VSUkVOVF9TVEFURSwgJy4nLCBuYW1lKVxuICAgICAgICAgIGJsb2NrKFxuICAgICAgICAgICAgTkVYVCwgJyk7JyxcbiAgICAgICAgICAgIENVUlJFTlRfU1RBVEUsICcuJywgbmFtZSwgJz0nLCBORVhULCAnOycpXG4gICAgICAgICAgcG9sbChcbiAgICAgICAgICAgICdpZignLCBORVhULCAnIT09JywgQ1VSUkVOVCwgJyl7JyxcbiAgICAgICAgICAgIGJsb2NrLFxuICAgICAgICAgICAgJ30nKVxuICAgICAgICB9XG4gICAgICAgIHJlZnJlc2goYmxvY2spXG4gICAgICB9KVxuXG4gICAgICByZXR1cm4gZW52LmNvbXBpbGUoKVxuICAgIH0pKCksXG4gICAgY29tcGlsZTogY29tcGlsZUNvbW1hbmRcbiAgfVxufVxuIiwidmFyIFZBUklBQkxFX0NPVU5URVIgPSAwXG5cbnZhciBEWU5fRlVOQyA9IDBcblxuZnVuY3Rpb24gRHluYW1pY1ZhcmlhYmxlICh0eXBlLCBkYXRhKSB7XG4gIHRoaXMuaWQgPSAoVkFSSUFCTEVfQ09VTlRFUisrKVxuICB0aGlzLnR5cGUgPSB0eXBlXG4gIHRoaXMuZGF0YSA9IGRhdGFcbn1cblxuZnVuY3Rpb24gZXNjYXBlU3RyIChzdHIpIHtcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC9cXFxcL2csICdcXFxcXFxcXCcpLnJlcGxhY2UoL1wiL2csICdcXFxcXCInKVxufVxuXG5mdW5jdGlvbiBzcGxpdFBhcnRzIChzdHIpIHtcbiAgaWYgKHN0ci5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gW11cbiAgfVxuXG4gIHZhciBmaXJzdENoYXIgPSBzdHIuY2hhckF0KDApXG4gIHZhciBsYXN0Q2hhciA9IHN0ci5jaGFyQXQoc3RyLmxlbmd0aCAtIDEpXG5cbiAgaWYgKHN0ci5sZW5ndGggPiAxICYmXG4gICAgICBmaXJzdENoYXIgPT09IGxhc3RDaGFyICYmXG4gICAgICAoZmlyc3RDaGFyID09PSAnXCInIHx8IGZpcnN0Q2hhciA9PT0gXCInXCIpKSB7XG4gICAgcmV0dXJuIFsnXCInICsgZXNjYXBlU3RyKHN0ci5zdWJzdHIoMSwgc3RyLmxlbmd0aCAtIDIpKSArICdcIiddXG4gIH1cblxuICB2YXIgcGFydHMgPSAvXFxbKGZhbHNlfHRydWV8bnVsbHxcXGQrfCdbXiddKid8XCJbXlwiXSpcIilcXF0vLmV4ZWMoc3RyKVxuICBpZiAocGFydHMpIHtcbiAgICByZXR1cm4gKFxuICAgICAgc3BsaXRQYXJ0cyhzdHIuc3Vic3RyKDAsIHBhcnRzLmluZGV4KSlcbiAgICAgIC5jb25jYXQoc3BsaXRQYXJ0cyhwYXJ0c1sxXSkpXG4gICAgICAuY29uY2F0KHNwbGl0UGFydHMoc3RyLnN1YnN0cihwYXJ0cy5pbmRleCArIHBhcnRzWzBdLmxlbmd0aCkpKVxuICAgIClcbiAgfVxuXG4gIHZhciBzdWJwYXJ0cyA9IHN0ci5zcGxpdCgnLicpXG4gIGlmIChzdWJwYXJ0cy5sZW5ndGggPT09IDEpIHtcbiAgICByZXR1cm4gWydcIicgKyBlc2NhcGVTdHIoc3RyKSArICdcIiddXG4gIH1cblxuICB2YXIgcmVzdWx0ID0gW11cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdWJwYXJ0cy5sZW5ndGg7ICsraSkge1xuICAgIHJlc3VsdCA9IHJlc3VsdC5jb25jYXQoc3BsaXRQYXJ0cyhzdWJwYXJ0c1tpXSkpXG4gIH1cbiAgcmV0dXJuIHJlc3VsdFxufVxuXG5mdW5jdGlvbiB0b0FjY2Vzc29yU3RyaW5nIChzdHIpIHtcbiAgcmV0dXJuICdbJyArIHNwbGl0UGFydHMoc3RyKS5qb2luKCddWycpICsgJ10nXG59XG5cbmZ1bmN0aW9uIGRlZmluZUR5bmFtaWMgKHR5cGUsIGRhdGEpIHtcbiAgcmV0dXJuIG5ldyBEeW5hbWljVmFyaWFibGUodHlwZSwgdG9BY2Nlc3NvclN0cmluZyhkYXRhICsgJycpKVxufVxuXG5mdW5jdGlvbiBpc0R5bmFtaWMgKHgpIHtcbiAgcmV0dXJuICh0eXBlb2YgeCA9PT0gJ2Z1bmN0aW9uJyAmJiAheC5fcmVnbFR5cGUpIHx8XG4gICAgICAgICB4IGluc3RhbmNlb2YgRHluYW1pY1ZhcmlhYmxlXG59XG5cbmZ1bmN0aW9uIHVuYm94ICh4LCBwYXRoKSB7XG4gIGlmICh0eXBlb2YgeCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHJldHVybiBuZXcgRHluYW1pY1ZhcmlhYmxlKERZTl9GVU5DLCB4KVxuICB9XG4gIHJldHVybiB4XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBEeW5hbWljVmFyaWFibGU6IER5bmFtaWNWYXJpYWJsZSxcbiAgZGVmaW5lOiBkZWZpbmVEeW5hbWljLFxuICBpc0R5bmFtaWM6IGlzRHluYW1pYyxcbiAgdW5ib3g6IHVuYm94LFxuICBhY2Nlc3NvcjogdG9BY2Nlc3NvclN0cmluZ1xufVxuIiwiXG52YXIgaXNUeXBlZEFycmF5ID0gcmVxdWlyZSgnLi91dGlsL2lzLXR5cGVkLWFycmF5JylcbnZhciBpc05EQXJyYXlMaWtlID0gcmVxdWlyZSgnLi91dGlsL2lzLW5kYXJyYXknKVxudmFyIHZhbHVlcyA9IHJlcXVpcmUoJy4vdXRpbC92YWx1ZXMnKVxuXG52YXIgcHJpbVR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvcHJpbWl0aXZlcy5qc29uJylcbnZhciB1c2FnZVR5cGVzID0gcmVxdWlyZSgnLi9jb25zdGFudHMvdXNhZ2UuanNvbicpXG5cbnZhciBHTF9QT0lOVFMgPSAwXG52YXIgR0xfTElORVMgPSAxXG52YXIgR0xfVFJJQU5HTEVTID0gNFxuXG52YXIgR0xfQllURSA9IDUxMjBcbnZhciBHTF9VTlNJR05FRF9CWVRFID0gNTEyMVxudmFyIEdMX1NIT1JUID0gNTEyMlxudmFyIEdMX1VOU0lHTkVEX1NIT1JUID0gNTEyM1xudmFyIEdMX0lOVCA9IDUxMjRcbnZhciBHTF9VTlNJR05FRF9JTlQgPSA1MTI1XG5cbnZhciBHTF9FTEVNRU5UX0FSUkFZX0JVRkZFUiA9IDM0OTYzXG5cbnZhciBHTF9TVFJFQU1fRFJBVyA9IDB4ODhFMFxudmFyIEdMX1NUQVRJQ19EUkFXID0gMHg4OEU0XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gd3JhcEVsZW1lbnRzU3RhdGUgKGdsLCBleHRlbnNpb25zLCBidWZmZXJTdGF0ZSwgc3RhdHMpIHtcbiAgdmFyIGVsZW1lbnRTZXQgPSB7fVxuICB2YXIgZWxlbWVudENvdW50ID0gMFxuXG4gIHZhciBlbGVtZW50VHlwZXMgPSB7XG4gICAgJ3VpbnQ4JzogR0xfVU5TSUdORURfQllURSxcbiAgICAndWludDE2JzogR0xfVU5TSUdORURfU0hPUlRcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLm9lc19lbGVtZW50X2luZGV4X3VpbnQpIHtcbiAgICBlbGVtZW50VHlwZXMudWludDMyID0gR0xfVU5TSUdORURfSU5UXG4gIH1cblxuICBmdW5jdGlvbiBSRUdMRWxlbWVudEJ1ZmZlciAoYnVmZmVyKSB7XG4gICAgdGhpcy5pZCA9IGVsZW1lbnRDb3VudCsrXG4gICAgZWxlbWVudFNldFt0aGlzLmlkXSA9IHRoaXNcbiAgICB0aGlzLmJ1ZmZlciA9IGJ1ZmZlclxuICAgIHRoaXMucHJpbVR5cGUgPSBHTF9UUklBTkdMRVNcbiAgICB0aGlzLnZlcnRDb3VudCA9IDBcbiAgICB0aGlzLnR5cGUgPSAwXG4gIH1cblxuICBSRUdMRWxlbWVudEJ1ZmZlci5wcm90b3R5cGUuYmluZCA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmJ1ZmZlci5iaW5kKClcbiAgfVxuXG4gIHZhciBidWZmZXJQb29sID0gW11cblxuICBmdW5jdGlvbiBjcmVhdGVFbGVtZW50U3RyZWFtIChkYXRhKSB7XG4gICAgdmFyIHJlc3VsdCA9IGJ1ZmZlclBvb2wucG9wKClcbiAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgcmVzdWx0ID0gbmV3IFJFR0xFbGVtZW50QnVmZmVyKGJ1ZmZlclN0YXRlLmNyZWF0ZShcbiAgICAgICAgbnVsbCxcbiAgICAgICAgR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIsXG4gICAgICAgIHRydWUsXG4gICAgICAgIGZhbHNlKS5fYnVmZmVyKVxuICAgIH1cbiAgICBpbml0RWxlbWVudHMocmVzdWx0LCBkYXRhLCBHTF9TVFJFQU1fRFJBVywgLTEsIC0xLCAwLCAwKVxuICAgIHJldHVybiByZXN1bHRcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3lFbGVtZW50U3RyZWFtIChlbGVtZW50cykge1xuICAgIGJ1ZmZlclBvb2wucHVzaChlbGVtZW50cylcbiAgfVxuXG4gIGZ1bmN0aW9uIGluaXRFbGVtZW50cyAoXG4gICAgZWxlbWVudHMsXG4gICAgZGF0YSxcbiAgICB1c2FnZSxcbiAgICBwcmltLFxuICAgIGNvdW50LFxuICAgIGJ5dGVMZW5ndGgsXG4gICAgdHlwZSkge1xuICAgIGVsZW1lbnRzLmJ1ZmZlci5iaW5kKClcbiAgICBpZiAoZGF0YSkge1xuICAgICAgdmFyIHByZWRpY3RlZFR5cGUgPSB0eXBlXG4gICAgICBpZiAoIXR5cGUgJiYgKFxuICAgICAgICAgICFpc1R5cGVkQXJyYXkoZGF0YSkgfHxcbiAgICAgICAgIChpc05EQXJyYXlMaWtlKGRhdGEpICYmICFpc1R5cGVkQXJyYXkoZGF0YS5kYXRhKSkpKSB7XG4gICAgICAgIHByZWRpY3RlZFR5cGUgPSBleHRlbnNpb25zLm9lc19lbGVtZW50X2luZGV4X3VpbnRcbiAgICAgICAgICA/IEdMX1VOU0lHTkVEX0lOVFxuICAgICAgICAgIDogR0xfVU5TSUdORURfU0hPUlRcbiAgICAgIH1cbiAgICAgIGJ1ZmZlclN0YXRlLl9pbml0QnVmZmVyKFxuICAgICAgICBlbGVtZW50cy5idWZmZXIsXG4gICAgICAgIGRhdGEsXG4gICAgICAgIHVzYWdlLFxuICAgICAgICBwcmVkaWN0ZWRUeXBlLFxuICAgICAgICAzKVxuICAgIH0gZWxzZSB7XG4gICAgICBnbC5idWZmZXJEYXRhKEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSLCBieXRlTGVuZ3RoLCB1c2FnZSlcbiAgICAgIGVsZW1lbnRzLmJ1ZmZlci5kdHlwZSA9IGR0eXBlIHx8IEdMX1VOU0lHTkVEX0JZVEVcbiAgICAgIGVsZW1lbnRzLmJ1ZmZlci51c2FnZSA9IHVzYWdlXG4gICAgICBlbGVtZW50cy5idWZmZXIuZGltZW5zaW9uID0gM1xuICAgICAgZWxlbWVudHMuYnVmZmVyLmJ5dGVMZW5ndGggPSBieXRlTGVuZ3RoXG4gICAgfVxuXG4gICAgdmFyIGR0eXBlID0gdHlwZVxuICAgIGlmICghdHlwZSkge1xuICAgICAgc3dpdGNoIChlbGVtZW50cy5idWZmZXIuZHR5cGUpIHtcbiAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9CWVRFOlxuICAgICAgICBjYXNlIEdMX0JZVEU6XG4gICAgICAgICAgZHR5cGUgPSBHTF9VTlNJR05FRF9CWVRFXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUOlxuICAgICAgICBjYXNlIEdMX1NIT1JUOlxuICAgICAgICAgIGR0eXBlID0gR0xfVU5TSUdORURfU0hPUlRcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgR0xfVU5TSUdORURfSU5UOlxuICAgICAgICBjYXNlIEdMX0lOVDpcbiAgICAgICAgICBkdHlwZSA9IEdMX1VOU0lHTkVEX0lOVFxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICBcbiAgICAgIH1cbiAgICAgIGVsZW1lbnRzLmJ1ZmZlci5kdHlwZSA9IGR0eXBlXG4gICAgfVxuICAgIGVsZW1lbnRzLnR5cGUgPSBkdHlwZVxuXG4gICAgLy8gQ2hlY2sgb2VzX2VsZW1lbnRfaW5kZXhfdWludCBleHRlbnNpb25cbiAgICBcblxuICAgIC8vIHRyeSB0byBndWVzcyBkZWZhdWx0IHByaW1pdGl2ZSB0eXBlIGFuZCBhcmd1bWVudHNcbiAgICB2YXIgdmVydENvdW50ID0gY291bnRcbiAgICBpZiAodmVydENvdW50IDwgMCkge1xuICAgICAgdmVydENvdW50ID0gZWxlbWVudHMuYnVmZmVyLmJ5dGVMZW5ndGhcbiAgICAgIGlmIChkdHlwZSA9PT0gR0xfVU5TSUdORURfU0hPUlQpIHtcbiAgICAgICAgdmVydENvdW50ID4+PSAxXG4gICAgICB9IGVsc2UgaWYgKGR0eXBlID09PSBHTF9VTlNJR05FRF9JTlQpIHtcbiAgICAgICAgdmVydENvdW50ID4+PSAyXG4gICAgICB9XG4gICAgfVxuICAgIGVsZW1lbnRzLnZlcnRDb3VudCA9IHZlcnRDb3VudFxuXG4gICAgLy8gdHJ5IHRvIGd1ZXNzIHByaW1pdGl2ZSB0eXBlIGZyb20gY2VsbCBkaW1lbnNpb25cbiAgICB2YXIgcHJpbVR5cGUgPSBwcmltXG4gICAgaWYgKHByaW0gPCAwKSB7XG4gICAgICBwcmltVHlwZSA9IEdMX1RSSUFOR0xFU1xuICAgICAgdmFyIGRpbWVuc2lvbiA9IGVsZW1lbnRzLmJ1ZmZlci5kaW1lbnNpb25cbiAgICAgIGlmIChkaW1lbnNpb24gPT09IDEpIHByaW1UeXBlID0gR0xfUE9JTlRTXG4gICAgICBpZiAoZGltZW5zaW9uID09PSAyKSBwcmltVHlwZSA9IEdMX0xJTkVTXG4gICAgICBpZiAoZGltZW5zaW9uID09PSAzKSBwcmltVHlwZSA9IEdMX1RSSUFOR0xFU1xuICAgIH1cbiAgICBlbGVtZW50cy5wcmltVHlwZSA9IHByaW1UeXBlXG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95RWxlbWVudHMgKGVsZW1lbnRzKSB7XG4gICAgc3RhdHMuZWxlbWVudHNDb3VudC0tXG5cbiAgICBcbiAgICBkZWxldGUgZWxlbWVudFNldFtlbGVtZW50cy5pZF1cbiAgICBlbGVtZW50cy5idWZmZXIuZGVzdHJveSgpXG4gICAgZWxlbWVudHMuYnVmZmVyID0gbnVsbFxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlRWxlbWVudHMgKG9wdGlvbnMsIHBlcnNpc3RlbnQpIHtcbiAgICB2YXIgYnVmZmVyID0gYnVmZmVyU3RhdGUuY3JlYXRlKG51bGwsIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSLCB0cnVlKVxuICAgIHZhciBlbGVtZW50cyA9IG5ldyBSRUdMRWxlbWVudEJ1ZmZlcihidWZmZXIuX2J1ZmZlcilcbiAgICBzdGF0cy5lbGVtZW50c0NvdW50KytcblxuICAgIGZ1bmN0aW9uIHJlZ2xFbGVtZW50cyAob3B0aW9ucykge1xuICAgICAgaWYgKCFvcHRpb25zKSB7XG4gICAgICAgIGJ1ZmZlcigpXG4gICAgICAgIGVsZW1lbnRzLnByaW1UeXBlID0gR0xfVFJJQU5HTEVTXG4gICAgICAgIGVsZW1lbnRzLnZlcnRDb3VudCA9IDBcbiAgICAgICAgZWxlbWVudHMudHlwZSA9IEdMX1VOU0lHTkVEX0JZVEVcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIG9wdGlvbnMgPT09ICdudW1iZXInKSB7XG4gICAgICAgIGJ1ZmZlcihvcHRpb25zKVxuICAgICAgICBlbGVtZW50cy5wcmltVHlwZSA9IEdMX1RSSUFOR0xFU1xuICAgICAgICBlbGVtZW50cy52ZXJ0Q291bnQgPSBvcHRpb25zIHwgMFxuICAgICAgICBlbGVtZW50cy50eXBlID0gR0xfVU5TSUdORURfQllURVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIGRhdGEgPSBudWxsXG4gICAgICAgIHZhciB1c2FnZSA9IEdMX1NUQVRJQ19EUkFXXG4gICAgICAgIHZhciBwcmltVHlwZSA9IC0xXG4gICAgICAgIHZhciB2ZXJ0Q291bnQgPSAtMVxuICAgICAgICB2YXIgYnl0ZUxlbmd0aCA9IDBcbiAgICAgICAgdmFyIGR0eXBlID0gMFxuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShvcHRpb25zKSB8fFxuICAgICAgICAgICAgaXNUeXBlZEFycmF5KG9wdGlvbnMpIHx8XG4gICAgICAgICAgICBpc05EQXJyYXlMaWtlKG9wdGlvbnMpKSB7XG4gICAgICAgICAgZGF0YSA9IG9wdGlvbnNcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBcbiAgICAgICAgICBpZiAoJ2RhdGEnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGRhdGEgPSBvcHRpb25zLmRhdGFcbiAgICAgICAgICAgIFxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoJ3VzYWdlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHVzYWdlID0gdXNhZ2VUeXBlc1tvcHRpb25zLnVzYWdlXVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoJ3ByaW1pdGl2ZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBwcmltVHlwZSA9IHByaW1UeXBlc1tvcHRpb25zLnByaW1pdGl2ZV1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCdjb3VudCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgXG4gICAgICAgICAgICB2ZXJ0Q291bnQgPSBvcHRpb25zLmNvdW50IHwgMFxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoJ3R5cGUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZHR5cGUgPSBlbGVtZW50VHlwZXNbb3B0aW9ucy50eXBlXVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoJ2xlbmd0aCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgYnl0ZUxlbmd0aCA9IG9wdGlvbnMubGVuZ3RoIHwgMFxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBieXRlTGVuZ3RoID0gdmVydENvdW50XG4gICAgICAgICAgICBpZiAoZHR5cGUgPT09IEdMX1VOU0lHTkVEX1NIT1JUIHx8IGR0eXBlID09PSBHTF9TSE9SVCkge1xuICAgICAgICAgICAgICBieXRlTGVuZ3RoICo9IDJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZHR5cGUgPT09IEdMX1VOU0lHTkVEX0lOVCB8fCBkdHlwZSA9PT0gR0xfSU5UKSB7XG4gICAgICAgICAgICAgIGJ5dGVMZW5ndGggKj0gNFxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpbml0RWxlbWVudHMoXG4gICAgICAgICAgZWxlbWVudHMsXG4gICAgICAgICAgZGF0YSxcbiAgICAgICAgICB1c2FnZSxcbiAgICAgICAgICBwcmltVHlwZSxcbiAgICAgICAgICB2ZXJ0Q291bnQsXG4gICAgICAgICAgYnl0ZUxlbmd0aCxcbiAgICAgICAgICBkdHlwZSlcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJlZ2xFbGVtZW50c1xuICAgIH1cblxuICAgIHJlZ2xFbGVtZW50cyhvcHRpb25zKVxuXG4gICAgcmVnbEVsZW1lbnRzLl9yZWdsVHlwZSA9ICdlbGVtZW50cydcbiAgICByZWdsRWxlbWVudHMuX2VsZW1lbnRzID0gZWxlbWVudHNcbiAgICByZWdsRWxlbWVudHMuc3ViZGF0YSA9IGZ1bmN0aW9uIChkYXRhLCBvZmZzZXQpIHtcbiAgICAgIGJ1ZmZlci5zdWJkYXRhKGRhdGEsIG9mZnNldClcbiAgICAgIHJldHVybiByZWdsRWxlbWVudHNcbiAgICB9XG4gICAgcmVnbEVsZW1lbnRzLmRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7XG4gICAgICBkZXN0cm95RWxlbWVudHMoZWxlbWVudHMpXG4gICAgfVxuXG4gICAgcmV0dXJuIHJlZ2xFbGVtZW50c1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjcmVhdGU6IGNyZWF0ZUVsZW1lbnRzLFxuICAgIGNyZWF0ZVN0cmVhbTogY3JlYXRlRWxlbWVudFN0cmVhbSxcbiAgICBkZXN0cm95U3RyZWFtOiBkZXN0cm95RWxlbWVudFN0cmVhbSxcbiAgICBnZXRFbGVtZW50czogZnVuY3Rpb24gKGVsZW1lbnRzKSB7XG4gICAgICBpZiAodHlwZW9mIGVsZW1lbnRzID09PSAnZnVuY3Rpb24nICYmXG4gICAgICAgICAgZWxlbWVudHMuX2VsZW1lbnRzIGluc3RhbmNlb2YgUkVHTEVsZW1lbnRCdWZmZXIpIHtcbiAgICAgICAgcmV0dXJuIGVsZW1lbnRzLl9lbGVtZW50c1xuICAgICAgfVxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9LFxuICAgIGNsZWFyOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YWx1ZXMoZWxlbWVudFNldCkuZm9yRWFjaChkZXN0cm95RWxlbWVudHMpXG4gICAgfVxuICB9XG59XG4iLCJcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjcmVhdGVFeHRlbnNpb25DYWNoZSAoZ2wsIGNvbmZpZykge1xuICB2YXIgZXh0ZW5zaW9ucyA9IHt9XG5cbiAgZnVuY3Rpb24gdHJ5TG9hZEV4dGVuc2lvbiAobmFtZV8pIHtcbiAgICBcbiAgICB2YXIgbmFtZSA9IG5hbWVfLnRvTG93ZXJDYXNlKClcbiAgICB2YXIgZXh0XG4gICAgdHJ5IHtcbiAgICAgIGV4dCA9IGV4dGVuc2lvbnNbbmFtZV0gPSBnbC5nZXRFeHRlbnNpb24obmFtZSlcbiAgICB9IGNhdGNoIChlKSB7fVxuICAgIHJldHVybiAhIWV4dFxuICB9XG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBjb25maWcuZXh0ZW5zaW9ucy5sZW5ndGg7ICsraSkge1xuICAgIHZhciBuYW1lID0gY29uZmlnLmV4dGVuc2lvbnNbaV1cbiAgICBpZiAoIXRyeUxvYWRFeHRlbnNpb24obmFtZSkpIHtcbiAgICAgIGNvbmZpZy5vbkRlc3Ryb3koKVxuICAgICAgY29uZmlnLm9uRG9uZSgnXCInICsgbmFtZSArICdcIiBleHRlbnNpb24gaXMgbm90IHN1cHBvcnRlZCBieSB0aGUgY3VycmVudCBXZWJHTCBjb250ZXh0LCB0cnkgdXBncmFkaW5nIHlvdXIgc3lzdGVtIG9yIGEgZGlmZmVyZW50IGJyb3dzZXInKVxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG4gIH1cblxuICBjb25maWcub3B0aW9uYWxFeHRlbnNpb25zLmZvckVhY2godHJ5TG9hZEV4dGVuc2lvbilcblxuICByZXR1cm4ge1xuICAgIGV4dGVuc2lvbnM6IGV4dGVuc2lvbnMsXG4gICAgcmVzdG9yZTogZnVuY3Rpb24gKCkge1xuICAgICAgT2JqZWN0LmtleXMoZXh0ZW5zaW9ucykuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgICBpZiAoIXRyeUxvYWRFeHRlbnNpb24obmFtZSkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJyhyZWdsKTogZXJyb3IgcmVzdG9yaW5nIGV4dGVuc2lvbiAnICsgbmFtZSlcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICB9XG4gIH1cbn1cbiIsIlxudmFyIHZhbHVlcyA9IHJlcXVpcmUoJy4vdXRpbC92YWx1ZXMnKVxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vdXRpbC9leHRlbmQnKVxuXG4vLyBXZSBzdG9yZSB0aGVzZSBjb25zdGFudHMgc28gdGhhdCB0aGUgbWluaWZpZXIgY2FuIGlubGluZSB0aGVtXG52YXIgR0xfRlJBTUVCVUZGRVIgPSAweDhENDBcbnZhciBHTF9SRU5ERVJCVUZGRVIgPSAweDhENDFcblxudmFyIEdMX1RFWFRVUkVfMkQgPSAweDBERTFcbnZhciBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1ggPSAweDg1MTVcblxudmFyIEdMX0NPTE9SX0FUVEFDSE1FTlQwID0gMHg4Q0UwXG52YXIgR0xfREVQVEhfQVRUQUNITUVOVCA9IDB4OEQwMFxudmFyIEdMX1NURU5DSUxfQVRUQUNITUVOVCA9IDB4OEQyMFxudmFyIEdMX0RFUFRIX1NURU5DSUxfQVRUQUNITUVOVCA9IDB4ODIxQVxuXG52YXIgR0xfRlJBTUVCVUZGRVJfQ09NUExFVEUgPSAweDhDRDVcbnZhciBHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX0FUVEFDSE1FTlQgPSAweDhDRDZcbnZhciBHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX01JU1NJTkdfQVRUQUNITUVOVCA9IDB4OENEN1xudmFyIEdMX0ZSQU1FQlVGRkVSX0lOQ09NUExFVEVfRElNRU5TSU9OUyA9IDB4OENEOVxudmFyIEdMX0ZSQU1FQlVGRkVSX1VOU1VQUE9SVEVEID0gMHg4Q0REXG5cbnZhciBHTF9IQUxGX0ZMT0FUX09FUyA9IDB4OEQ2MVxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSAweDE0MDFcbnZhciBHTF9GTE9BVCA9IDB4MTQwNlxuXG52YXIgR0xfUkdCQSA9IDB4MTkwOFxuXG52YXIgR0xfREVQVEhfQ09NUE9ORU5UID0gMHgxOTAyXG5cbnZhciBjb2xvclRleHR1cmVGb3JtYXRFbnVtcyA9IFtcbiAgR0xfUkdCQVxuXVxuXG4vLyBmb3IgZXZlcnkgdGV4dHVyZSBmb3JtYXQsIHN0b3JlXG4vLyB0aGUgbnVtYmVyIG9mIGNoYW5uZWxzXG52YXIgdGV4dHVyZUZvcm1hdENoYW5uZWxzID0gW11cbnRleHR1cmVGb3JtYXRDaGFubmVsc1tHTF9SR0JBXSA9IDRcblxuLy8gZm9yIGV2ZXJ5IHRleHR1cmUgdHlwZSwgc3RvcmVcbi8vIHRoZSBzaXplIGluIGJ5dGVzLlxudmFyIHRleHR1cmVUeXBlU2l6ZXMgPSBbXVxudGV4dHVyZVR5cGVTaXplc1tHTF9VTlNJR05FRF9CWVRFXSA9IDFcbnRleHR1cmVUeXBlU2l6ZXNbR0xfRkxPQVRdID0gNFxudGV4dHVyZVR5cGVTaXplc1tHTF9IQUxGX0ZMT0FUX09FU10gPSAyXG5cbnZhciBHTF9SR0JBNCA9IDB4ODA1NlxudmFyIEdMX1JHQjVfQTEgPSAweDgwNTdcbnZhciBHTF9SR0I1NjUgPSAweDhENjJcbnZhciBHTF9ERVBUSF9DT01QT05FTlQxNiA9IDB4ODFBNVxudmFyIEdMX1NURU5DSUxfSU5ERVg4ID0gMHg4RDQ4XG52YXIgR0xfREVQVEhfU1RFTkNJTCA9IDB4ODRGOVxuXG52YXIgR0xfU1JHQjhfQUxQSEE4X0VYVCA9IDB4OEM0M1xuXG52YXIgR0xfUkdCQTMyRl9FWFQgPSAweDg4MTRcblxudmFyIEdMX1JHQkExNkZfRVhUID0gMHg4ODFBXG52YXIgR0xfUkdCMTZGX0VYVCA9IDB4ODgxQlxuXG52YXIgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRFbnVtcyA9IFtcbiAgR0xfUkdCQTQsXG4gIEdMX1JHQjVfQTEsXG4gIEdMX1JHQjU2NSxcbiAgR0xfU1JHQjhfQUxQSEE4X0VYVCxcbiAgR0xfUkdCQTE2Rl9FWFQsXG4gIEdMX1JHQjE2Rl9FWFQsXG4gIEdMX1JHQkEzMkZfRVhUXG5dXG5cbnZhciBzdGF0dXNDb2RlID0ge31cbnN0YXR1c0NvZGVbR0xfRlJBTUVCVUZGRVJfQ09NUExFVEVdID0gJ2NvbXBsZXRlJ1xuc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX0FUVEFDSE1FTlRdID0gJ2luY29tcGxldGUgYXR0YWNobWVudCdcbnN0YXR1c0NvZGVbR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9ESU1FTlNJT05TXSA9ICdpbmNvbXBsZXRlIGRpbWVuc2lvbnMnXG5zdGF0dXNDb2RlW0dMX0ZSQU1FQlVGRkVSX0lOQ09NUExFVEVfTUlTU0lOR19BVFRBQ0hNRU5UXSA9ICdpbmNvbXBsZXRlLCBtaXNzaW5nIGF0dGFjaG1lbnQnXG5zdGF0dXNDb2RlW0dMX0ZSQU1FQlVGRkVSX1VOU1VQUE9SVEVEXSA9ICd1bnN1cHBvcnRlZCdcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwRkJPU3RhdGUgKFxuICBnbCxcbiAgZXh0ZW5zaW9ucyxcbiAgbGltaXRzLFxuICB0ZXh0dXJlU3RhdGUsXG4gIHJlbmRlcmJ1ZmZlclN0YXRlLFxuICBzdGF0cykge1xuICB2YXIgZnJhbWVidWZmZXJTdGF0ZSA9IHtcbiAgICBjdXI6IG51bGwsXG4gICAgbmV4dDogbnVsbCxcbiAgICBkaXJ0eTogZmFsc2VcbiAgfVxuXG4gIHZhciBjb2xvclRleHR1cmVGb3JtYXRzID0gWydyZ2JhJ11cbiAgdmFyIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0cyA9IFsncmdiYTQnLCAncmdiNTY1JywgJ3JnYjUgYTEnXVxuXG4gIGlmIChleHRlbnNpb25zLmV4dF9zcmdiKSB7XG4gICAgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzLnB1c2goJ3NyZ2JhJylcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLmV4dF9jb2xvcl9idWZmZXJfaGFsZl9mbG9hdCkge1xuICAgIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0cy5wdXNoKCdyZ2JhMTZmJywgJ3JnYjE2ZicpXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb2xvcl9idWZmZXJfZmxvYXQpIHtcbiAgICBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHMucHVzaCgncmdiYTMyZicpXG4gIH1cblxuICB2YXIgY29sb3JUeXBlcyA9IFsndWludDgnXVxuICBpZiAoZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9oYWxmX2Zsb2F0KSB7XG4gICAgY29sb3JUeXBlcy5wdXNoKCdoYWxmIGZsb2F0JywgJ2Zsb2F0MTYnKVxuICB9XG4gIGlmIChleHRlbnNpb25zLm9lc190ZXh0dXJlX2Zsb2F0KSB7XG4gICAgY29sb3JUeXBlcy5wdXNoKCdmbG9hdCcsICdmbG9hdDMyJylcbiAgfVxuXG4gIGZ1bmN0aW9uIEZyYW1lYnVmZmVyQXR0YWNobWVudCAodGFyZ2V0LCB0ZXh0dXJlLCByZW5kZXJidWZmZXIpIHtcbiAgICB0aGlzLnRhcmdldCA9IHRhcmdldFxuICAgIHRoaXMudGV4dHVyZSA9IHRleHR1cmVcbiAgICB0aGlzLnJlbmRlcmJ1ZmZlciA9IHJlbmRlcmJ1ZmZlclxuXG4gICAgdmFyIHcgPSAwXG4gICAgdmFyIGggPSAwXG4gICAgaWYgKHRleHR1cmUpIHtcbiAgICAgIHcgPSB0ZXh0dXJlLndpZHRoXG4gICAgICBoID0gdGV4dHVyZS5oZWlnaHRcbiAgICB9IGVsc2UgaWYgKHJlbmRlcmJ1ZmZlcikge1xuICAgICAgdyA9IHJlbmRlcmJ1ZmZlci53aWR0aFxuICAgICAgaCA9IHJlbmRlcmJ1ZmZlci5oZWlnaHRcbiAgICB9XG4gICAgdGhpcy53aWR0aCA9IHdcbiAgICB0aGlzLmhlaWdodCA9IGhcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlY1JlZiAoYXR0YWNobWVudCkge1xuICAgIGlmIChhdHRhY2htZW50KSB7XG4gICAgICBpZiAoYXR0YWNobWVudC50ZXh0dXJlKSB7XG4gICAgICAgIGF0dGFjaG1lbnQudGV4dHVyZS5fdGV4dHVyZS5kZWNSZWYoKVxuICAgICAgfVxuICAgICAgaWYgKGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyKSB7XG4gICAgICAgIGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXIuZGVjUmVmKClcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBpbmNSZWZBbmRDaGVja1NoYXBlIChhdHRhY2htZW50LCB3aWR0aCwgaGVpZ2h0KSB7XG4gICAgaWYgKCFhdHRhY2htZW50KSB7XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgaWYgKGF0dGFjaG1lbnQudGV4dHVyZSkge1xuICAgICAgdmFyIHRleHR1cmUgPSBhdHRhY2htZW50LnRleHR1cmUuX3RleHR1cmVcbiAgICAgIHZhciB0dyA9IE1hdGgubWF4KDEsIHRleHR1cmUud2lkdGgpXG4gICAgICB2YXIgdGggPSBNYXRoLm1heCgxLCB0ZXh0dXJlLmhlaWdodClcbiAgICAgIFxuICAgICAgdGV4dHVyZS5yZWZDb3VudCArPSAxXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciByZW5kZXJidWZmZXIgPSBhdHRhY2htZW50LnJlbmRlcmJ1ZmZlci5fcmVuZGVyYnVmZmVyXG4gICAgICBcbiAgICAgIHJlbmRlcmJ1ZmZlci5yZWZDb3VudCArPSAxXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gYXR0YWNoIChsb2NhdGlvbiwgYXR0YWNobWVudCkge1xuICAgIGlmIChhdHRhY2htZW50KSB7XG4gICAgICBpZiAoYXR0YWNobWVudC50ZXh0dXJlKSB7XG4gICAgICAgIGdsLmZyYW1lYnVmZmVyVGV4dHVyZTJEKFxuICAgICAgICAgIEdMX0ZSQU1FQlVGRkVSLFxuICAgICAgICAgIGxvY2F0aW9uLFxuICAgICAgICAgIGF0dGFjaG1lbnQudGFyZ2V0LFxuICAgICAgICAgIGF0dGFjaG1lbnQudGV4dHVyZS5fdGV4dHVyZS50ZXh0dXJlLFxuICAgICAgICAgIDApXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBnbC5mcmFtZWJ1ZmZlclJlbmRlcmJ1ZmZlcihcbiAgICAgICAgICBHTF9GUkFNRUJVRkZFUixcbiAgICAgICAgICBsb2NhdGlvbixcbiAgICAgICAgICBHTF9SRU5ERVJCVUZGRVIsXG4gICAgICAgICAgYXR0YWNobWVudC5yZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlci5yZW5kZXJidWZmZXIpXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VBdHRhY2htZW50IChhdHRhY2htZW50KSB7XG4gICAgdmFyIHRhcmdldCA9IEdMX1RFWFRVUkVfMkRcbiAgICB2YXIgdGV4dHVyZSA9IG51bGxcbiAgICB2YXIgcmVuZGVyYnVmZmVyID0gbnVsbFxuXG4gICAgdmFyIGRhdGEgPSBhdHRhY2htZW50XG4gICAgaWYgKHR5cGVvZiBhdHRhY2htZW50ID09PSAnb2JqZWN0Jykge1xuICAgICAgZGF0YSA9IGF0dGFjaG1lbnQuZGF0YVxuICAgICAgaWYgKCd0YXJnZXQnIGluIGF0dGFjaG1lbnQpIHtcbiAgICAgICAgdGFyZ2V0ID0gYXR0YWNobWVudC50YXJnZXQgfCAwXG4gICAgICB9XG4gICAgfVxuXG4gICAgXG5cbiAgICB2YXIgdHlwZSA9IGRhdGEuX3JlZ2xUeXBlXG4gICAgaWYgKHR5cGUgPT09ICd0ZXh0dXJlMmQnKSB7XG4gICAgICB0ZXh0dXJlID0gZGF0YVxuICAgICAgXG4gICAgfSBlbHNlIGlmICh0eXBlID09PSAndGV4dHVyZUN1YmUnKSB7XG4gICAgICB0ZXh0dXJlID0gZGF0YVxuICAgICAgXG4gICAgfSBlbHNlIGlmICh0eXBlID09PSAncmVuZGVyYnVmZmVyJykge1xuICAgICAgcmVuZGVyYnVmZmVyID0gZGF0YVxuICAgICAgdGFyZ2V0ID0gR0xfUkVOREVSQlVGRkVSXG4gICAgfSBlbHNlIHtcbiAgICAgIFxuICAgIH1cblxuICAgIHJldHVybiBuZXcgRnJhbWVidWZmZXJBdHRhY2htZW50KHRhcmdldCwgdGV4dHVyZSwgcmVuZGVyYnVmZmVyKVxuICB9XG5cbiAgZnVuY3Rpb24gYWxsb2NBdHRhY2htZW50IChcbiAgICB3aWR0aCxcbiAgICBoZWlnaHQsXG4gICAgaXNUZXh0dXJlLFxuICAgIGZvcm1hdCxcbiAgICB0eXBlKSB7XG4gICAgaWYgKGlzVGV4dHVyZSkge1xuICAgICAgdmFyIHRleHR1cmUgPSB0ZXh0dXJlU3RhdGUuY3JlYXRlMkQoe1xuICAgICAgICB3aWR0aDogd2lkdGgsXG4gICAgICAgIGhlaWdodDogaGVpZ2h0LFxuICAgICAgICBmb3JtYXQ6IGZvcm1hdCxcbiAgICAgICAgdHlwZTogdHlwZVxuICAgICAgfSlcbiAgICAgIHRleHR1cmUuX3RleHR1cmUucmVmQ291bnQgPSAwXG4gICAgICByZXR1cm4gbmV3IEZyYW1lYnVmZmVyQXR0YWNobWVudChHTF9URVhUVVJFXzJELCB0ZXh0dXJlLCBudWxsKVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgcmIgPSByZW5kZXJidWZmZXJTdGF0ZS5jcmVhdGUoe1xuICAgICAgICB3aWR0aDogd2lkdGgsXG4gICAgICAgIGhlaWdodDogaGVpZ2h0LFxuICAgICAgICBmb3JtYXQ6IGZvcm1hdFxuICAgICAgfSlcbiAgICAgIHJiLl9yZW5kZXJidWZmZXIucmVmQ291bnQgPSAwXG4gICAgICByZXR1cm4gbmV3IEZyYW1lYnVmZmVyQXR0YWNobWVudChHTF9SRU5ERVJCVUZGRVIsIG51bGwsIHJiKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHVud3JhcEF0dGFjaG1lbnQgKGF0dGFjaG1lbnQpIHtcbiAgICByZXR1cm4gYXR0YWNobWVudCAmJiAoYXR0YWNobWVudC50ZXh0dXJlIHx8IGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyKVxuICB9XG5cbiAgZnVuY3Rpb24gcmVzaXplQXR0YWNobWVudCAoYXR0YWNobWVudCwgdywgaCkge1xuICAgIGlmIChhdHRhY2htZW50KSB7XG4gICAgICBpZiAoYXR0YWNobWVudC50ZXh0dXJlKSB7XG4gICAgICAgIGF0dGFjaG1lbnQudGV4dHVyZS5yZXNpemUodywgaClcbiAgICAgIH0gZWxzZSBpZiAoYXR0YWNobWVudC5yZW5kZXJidWZmZXIpIHtcbiAgICAgICAgYXR0YWNobWVudC5yZW5kZXJidWZmZXIucmVzaXplKHcsIGgpXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgdmFyIGZyYW1lYnVmZmVyQ291bnQgPSAwXG4gIHZhciBmcmFtZWJ1ZmZlclNldCA9IHt9XG5cbiAgZnVuY3Rpb24gUkVHTEZyYW1lYnVmZmVyICgpIHtcbiAgICB0aGlzLmlkID0gZnJhbWVidWZmZXJDb3VudCsrXG4gICAgZnJhbWVidWZmZXJTZXRbdGhpcy5pZF0gPSB0aGlzXG5cbiAgICB0aGlzLmZyYW1lYnVmZmVyID0gZ2wuY3JlYXRlRnJhbWVidWZmZXIoKVxuICAgIHRoaXMud2lkdGggPSAwXG4gICAgdGhpcy5oZWlnaHQgPSAwXG5cbiAgICB0aGlzLmNvbG9yQXR0YWNobWVudHMgPSBbXVxuICAgIHRoaXMuZGVwdGhBdHRhY2htZW50ID0gbnVsbFxuICAgIHRoaXMuc3RlbmNpbEF0dGFjaG1lbnQgPSBudWxsXG4gICAgdGhpcy5kZXB0aFN0ZW5jaWxBdHRhY2htZW50ID0gbnVsbFxuICB9XG5cbiAgZnVuY3Rpb24gZGVjRkJPUmVmcyAoZnJhbWVidWZmZXIpIHtcbiAgICBmcmFtZWJ1ZmZlci5jb2xvckF0dGFjaG1lbnRzLmZvckVhY2goZGVjUmVmKVxuICAgIGRlY1JlZihmcmFtZWJ1ZmZlci5kZXB0aEF0dGFjaG1lbnQpXG4gICAgZGVjUmVmKGZyYW1lYnVmZmVyLnN0ZW5jaWxBdHRhY2htZW50KVxuICAgIGRlY1JlZihmcmFtZWJ1ZmZlci5kZXB0aFN0ZW5jaWxBdHRhY2htZW50KVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSAoZnJhbWVidWZmZXIpIHtcbiAgICB2YXIgaGFuZGxlID0gZnJhbWVidWZmZXIuZnJhbWVidWZmZXJcbiAgICBcbiAgICBnbC5kZWxldGVGcmFtZWJ1ZmZlcihoYW5kbGUpXG4gICAgZnJhbWVidWZmZXIuZnJhbWVidWZmZXIgPSBudWxsXG4gICAgc3RhdHMuZnJhbWVidWZmZXJDb3VudC0tXG4gICAgZGVsZXRlIGZyYW1lYnVmZmVyU2V0W2ZyYW1lYnVmZmVyLmlkXVxuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlRnJhbWVidWZmZXIgKGZyYW1lYnVmZmVyKSB7XG4gICAgdmFyIGlcblxuICAgIGdsLmJpbmRGcmFtZWJ1ZmZlcihHTF9GUkFNRUJVRkZFUiwgZnJhbWVidWZmZXIuZnJhbWVidWZmZXIpXG4gICAgdmFyIGNvbG9yQXR0YWNobWVudHMgPSBmcmFtZWJ1ZmZlci5jb2xvckF0dGFjaG1lbnRzXG4gICAgZm9yIChpID0gMDsgaSA8IGNvbG9yQXR0YWNobWVudHMubGVuZ3RoOyArK2kpIHtcbiAgICAgIGF0dGFjaChHTF9DT0xPUl9BVFRBQ0hNRU5UMCArIGksIGNvbG9yQXR0YWNobWVudHNbaV0pXG4gICAgfVxuICAgIGZvciAoaSA9IGNvbG9yQXR0YWNobWVudHMubGVuZ3RoOyBpIDwgbGltaXRzLm1heENvbG9yQXR0YWNobWVudHM7ICsraSkge1xuICAgICAgZ2wuZnJhbWVidWZmZXJUZXh0dXJlMkQoXG4gICAgICAgIEdMX0ZSQU1FQlVGRkVSLFxuICAgICAgICBHTF9DT0xPUl9BVFRBQ0hNRU5UMCArIGksXG4gICAgICAgIEdMX1RFWFRVUkVfMkQsXG4gICAgICAgIG51bGwsXG4gICAgICAgIDApXG4gICAgfVxuXG4gICAgZ2wuZnJhbWVidWZmZXJUZXh0dXJlMkQoXG4gICAgICBHTF9GUkFNRUJVRkZFUixcbiAgICAgIEdMX0RFUFRIX1NURU5DSUxfQVRUQUNITUVOVCxcbiAgICAgIEdMX1RFWFRVUkVfMkQsXG4gICAgICBudWxsLFxuICAgICAgMClcbiAgICBnbC5mcmFtZWJ1ZmZlclRleHR1cmUyRChcbiAgICAgIEdMX0ZSQU1FQlVGRkVSLFxuICAgICAgR0xfREVQVEhfQVRUQUNITUVOVCxcbiAgICAgIEdMX1RFWFRVUkVfMkQsXG4gICAgICBudWxsLFxuICAgICAgMClcbiAgICBnbC5mcmFtZWJ1ZmZlclRleHR1cmUyRChcbiAgICAgIEdMX0ZSQU1FQlVGRkVSLFxuICAgICAgR0xfU1RFTkNJTF9BVFRBQ0hNRU5ULFxuICAgICAgR0xfVEVYVFVSRV8yRCxcbiAgICAgIG51bGwsXG4gICAgICAwKVxuXG4gICAgYXR0YWNoKEdMX0RFUFRIX0FUVEFDSE1FTlQsIGZyYW1lYnVmZmVyLmRlcHRoQXR0YWNobWVudClcbiAgICBhdHRhY2goR0xfU1RFTkNJTF9BVFRBQ0hNRU5ULCBmcmFtZWJ1ZmZlci5zdGVuY2lsQXR0YWNobWVudClcbiAgICBhdHRhY2goR0xfREVQVEhfU1RFTkNJTF9BVFRBQ0hNRU5ULCBmcmFtZWJ1ZmZlci5kZXB0aFN0ZW5jaWxBdHRhY2htZW50KVxuXG4gICAgLy8gQ2hlY2sgc3RhdHVzIGNvZGVcbiAgICB2YXIgc3RhdHVzID0gZ2wuY2hlY2tGcmFtZWJ1ZmZlclN0YXR1cyhHTF9GUkFNRUJVRkZFUilcbiAgICBpZiAoc3RhdHVzICE9PSBHTF9GUkFNRUJVRkZFUl9DT01QTEVURSkge1xuICAgICAgXG4gICAgfVxuXG4gICAgZ2wuYmluZEZyYW1lYnVmZmVyKEdMX0ZSQU1FQlVGRkVSLCBmcmFtZWJ1ZmZlclN0YXRlLm5leHQpXG4gICAgZnJhbWVidWZmZXJTdGF0ZS5jdXIgPSBmcmFtZWJ1ZmZlclN0YXRlLm5leHRcblxuICAgIC8vIEZJWE1FOiBDbGVhciBlcnJvciBjb2RlIGhlcmUuICBUaGlzIGlzIGEgd29yayBhcm91bmQgZm9yIGEgYnVnIGluXG4gICAgLy8gaGVhZGxlc3MtZ2xcbiAgICBnbC5nZXRFcnJvcigpXG4gIH1cblxuICBmdW5jdGlvbiBjcmVhdGVGQk8gKGEwLCBhMSkge1xuICAgIHZhciBmcmFtZWJ1ZmZlciA9IG5ldyBSRUdMRnJhbWVidWZmZXIoKVxuICAgIHN0YXRzLmZyYW1lYnVmZmVyQ291bnQrK1xuXG4gICAgZnVuY3Rpb24gcmVnbEZyYW1lYnVmZmVyIChhLCBiKSB7XG4gICAgICB2YXIgaVxuXG4gICAgICBcblxuICAgICAgdmFyIGV4dERyYXdCdWZmZXJzID0gZXh0ZW5zaW9ucy53ZWJnbF9kcmF3X2J1ZmZlcnNcblxuICAgICAgdmFyIHdpZHRoID0gMFxuICAgICAgdmFyIGhlaWdodCA9IDBcblxuICAgICAgdmFyIG5lZWRzRGVwdGggPSB0cnVlXG4gICAgICB2YXIgbmVlZHNTdGVuY2lsID0gdHJ1ZVxuXG4gICAgICB2YXIgY29sb3JCdWZmZXIgPSBudWxsXG4gICAgICB2YXIgY29sb3JUZXh0dXJlID0gdHJ1ZVxuICAgICAgdmFyIGNvbG9yRm9ybWF0ID0gJ3JnYmEnXG4gICAgICB2YXIgY29sb3JUeXBlID0gJ3VpbnQ4J1xuICAgICAgdmFyIGNvbG9yQ291bnQgPSAxXG5cbiAgICAgIHZhciBkZXB0aEJ1ZmZlciA9IG51bGxcbiAgICAgIHZhciBzdGVuY2lsQnVmZmVyID0gbnVsbFxuICAgICAgdmFyIGRlcHRoU3RlbmNpbEJ1ZmZlciA9IG51bGxcbiAgICAgIHZhciBkZXB0aFN0ZW5jaWxUZXh0dXJlID0gZmFsc2VcblxuICAgICAgaWYgKHR5cGVvZiBhID09PSAnbnVtYmVyJykge1xuICAgICAgICB3aWR0aCA9IGEgfCAwXG4gICAgICAgIGhlaWdodCA9IChiIHwgMCkgfHwgd2lkdGhcbiAgICAgIH0gZWxzZSBpZiAoIWEpIHtcbiAgICAgICAgd2lkdGggPSBoZWlnaHQgPSAxXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBcbiAgICAgICAgdmFyIG9wdGlvbnMgPSBhXG5cbiAgICAgICAgaWYgKCdzaGFwZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHZhciBzaGFwZSA9IG9wdGlvbnMuc2hhcGVcbiAgICAgICAgICBcbiAgICAgICAgICB3aWR0aCA9IHNoYXBlWzBdXG4gICAgICAgICAgaGVpZ2h0ID0gc2hhcGVbMV1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAoJ3JhZGl1cycgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgd2lkdGggPSBoZWlnaHQgPSBvcHRpb25zLnJhZGl1c1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoJ3dpZHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICB3aWR0aCA9IG9wdGlvbnMud2lkdGhcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCdoZWlnaHQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGhlaWdodCA9IG9wdGlvbnMuaGVpZ2h0XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdjb2xvcicgaW4gb3B0aW9ucyB8fFxuICAgICAgICAgICAgJ2NvbG9ycycgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGNvbG9yQnVmZmVyID1cbiAgICAgICAgICAgIG9wdGlvbnMuY29sb3IgfHxcbiAgICAgICAgICAgIG9wdGlvbnMuY29sb3JzXG4gICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoY29sb3JCdWZmZXIpKSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWNvbG9yQnVmZmVyKSB7XG4gICAgICAgICAgaWYgKCdjb2xvckNvdW50JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBjb2xvckNvdW50ID0gb3B0aW9ucy5jb2xvckNvdW50IHwgMFxuICAgICAgICAgICAgXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKCdjb2xvclRleHR1cmUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGNvbG9yVGV4dHVyZSA9ICEhb3B0aW9ucy5jb2xvclRleHR1cmVcbiAgICAgICAgICAgIGNvbG9yRm9ybWF0ID0gJ3JnYmE0J1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmICgnY29sb3JUeXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBjb2xvclR5cGUgPSBvcHRpb25zLmNvbG9yVHlwZVxuICAgICAgICAgICAgaWYgKCFjb2xvclRleHR1cmUpIHtcbiAgICAgICAgICAgICAgaWYgKGNvbG9yVHlwZSA9PT0gJ2hhbGYgZmxvYXQnIHx8IGNvbG9yVHlwZSA9PT0gJ2Zsb2F0MTYnKSB7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgY29sb3JGb3JtYXQgPSAncmdiYTE2ZidcbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChjb2xvclR5cGUgPT09ICdmbG9hdCcgfHwgY29sb3JUeXBlID09PSAnZmxvYXQzMicpIHtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBjb2xvckZvcm1hdCA9ICdyZ2JhMzJmJ1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoJ2NvbG9yRm9ybWF0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBjb2xvckZvcm1hdCA9IG9wdGlvbnMuY29sb3JGb3JtYXRcbiAgICAgICAgICAgIGlmIChjb2xvclRleHR1cmVGb3JtYXRzLmluZGV4T2YoY29sb3JGb3JtYXQpID49IDApIHtcbiAgICAgICAgICAgICAgY29sb3JUZXh0dXJlID0gdHJ1ZVxuICAgICAgICAgICAgfSBlbHNlIGlmIChjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHMuaW5kZXhPZihjb2xvckZvcm1hdCkgPj0gMCkge1xuICAgICAgICAgICAgICBjb2xvclRleHR1cmUgPSBmYWxzZVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgaWYgKGNvbG9yVGV4dHVyZSkge1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdkZXB0aFRleHR1cmUnIGluIG9wdGlvbnMgfHwgJ2RlcHRoU3RlbmNpbFRleHR1cmUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBkZXB0aFN0ZW5jaWxUZXh0dXJlID0gISEob3B0aW9ucy5kZXB0aFRleHR1cmUgfHxcbiAgICAgICAgICAgIG9wdGlvbnMuZGVwdGhTdGVuY2lsVGV4dHVyZSlcbiAgICAgICAgICBcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnZGVwdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBpZiAodHlwZW9mIG9wdGlvbnMuZGVwdGggPT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgbmVlZHNEZXB0aCA9IG9wdGlvbnMuZGVwdGhcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZGVwdGhCdWZmZXIgPSBvcHRpb25zLmRlcHRoXG4gICAgICAgICAgICBuZWVkc1N0ZW5jaWwgPSBmYWxzZVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnc3RlbmNpbCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5zdGVuY2lsID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgIG5lZWRzU3RlbmNpbCA9IG9wdGlvbnMuc3RlbmNpbFxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzdGVuY2lsQnVmZmVyID0gb3B0aW9ucy5zdGVuY2lsXG4gICAgICAgICAgICBuZWVkc0RlcHRoID0gZmFsc2VcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ2RlcHRoU3RlbmNpbCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5kZXB0aFN0ZW5jaWwgPT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgbmVlZHNEZXB0aCA9IG5lZWRzU3RlbmNpbCA9IG9wdGlvbnMuZGVwdGhTdGVuY2lsXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGRlcHRoU3RlbmNpbEJ1ZmZlciA9IG9wdGlvbnMuZGVwdGhTdGVuY2lsXG4gICAgICAgICAgICBuZWVkc0RlcHRoID0gZmFsc2VcbiAgICAgICAgICAgIG5lZWRzU3RlbmNpbCA9IGZhbHNlXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIHBhcnNlIGF0dGFjaG1lbnRzXG4gICAgICB2YXIgY29sb3JBdHRhY2htZW50cyA9IG51bGxcbiAgICAgIHZhciBkZXB0aEF0dGFjaG1lbnQgPSBudWxsXG4gICAgICB2YXIgc3RlbmNpbEF0dGFjaG1lbnQgPSBudWxsXG4gICAgICB2YXIgZGVwdGhTdGVuY2lsQXR0YWNobWVudCA9IG51bGxcblxuICAgICAgLy8gU2V0IHVwIGNvbG9yIGF0dGFjaG1lbnRzXG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShjb2xvckJ1ZmZlcikpIHtcbiAgICAgICAgY29sb3JBdHRhY2htZW50cyA9IGNvbG9yQnVmZmVyLm1hcChwYXJzZUF0dGFjaG1lbnQpXG4gICAgICB9IGVsc2UgaWYgKGNvbG9yQnVmZmVyKSB7XG4gICAgICAgIGNvbG9yQXR0YWNobWVudHMgPSBbcGFyc2VBdHRhY2htZW50KGNvbG9yQnVmZmVyKV1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbG9yQXR0YWNobWVudHMgPSBuZXcgQXJyYXkoY29sb3JDb3VudClcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGNvbG9yQ291bnQ7ICsraSkge1xuICAgICAgICAgIGNvbG9yQXR0YWNobWVudHNbaV0gPSBhbGxvY0F0dGFjaG1lbnQoXG4gICAgICAgICAgICB3aWR0aCxcbiAgICAgICAgICAgIGhlaWdodCxcbiAgICAgICAgICAgIGNvbG9yVGV4dHVyZSxcbiAgICAgICAgICAgIGNvbG9yRm9ybWF0LFxuICAgICAgICAgICAgY29sb3JUeXBlKVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIFxuICAgICAgXG5cbiAgICAgIHdpZHRoID0gd2lkdGggfHwgY29sb3JBdHRhY2htZW50c1swXS53aWR0aFxuICAgICAgaGVpZ2h0ID0gaGVpZ2h0IHx8IGNvbG9yQXR0YWNobWVudHNbMF0uaGVpZ2h0XG5cbiAgICAgIGlmIChkZXB0aEJ1ZmZlcikge1xuICAgICAgICBkZXB0aEF0dGFjaG1lbnQgPSBwYXJzZUF0dGFjaG1lbnQoZGVwdGhCdWZmZXIpXG4gICAgICB9IGVsc2UgaWYgKG5lZWRzRGVwdGggJiYgIW5lZWRzU3RlbmNpbCkge1xuICAgICAgICBkZXB0aEF0dGFjaG1lbnQgPSBhbGxvY0F0dGFjaG1lbnQoXG4gICAgICAgICAgd2lkdGgsXG4gICAgICAgICAgaGVpZ2h0LFxuICAgICAgICAgIGRlcHRoU3RlbmNpbFRleHR1cmUsXG4gICAgICAgICAgJ2RlcHRoJyxcbiAgICAgICAgICAndWludDMyJylcbiAgICAgIH1cblxuICAgICAgaWYgKHN0ZW5jaWxCdWZmZXIpIHtcbiAgICAgICAgc3RlbmNpbEF0dGFjaG1lbnQgPSBwYXJzZUF0dGFjaG1lbnQoc3RlbmNpbEJ1ZmZlcilcbiAgICAgIH0gZWxzZSBpZiAobmVlZHNTdGVuY2lsICYmICFuZWVkc0RlcHRoKSB7XG4gICAgICAgIHN0ZW5jaWxBdHRhY2htZW50ID0gYWxsb2NBdHRhY2htZW50KFxuICAgICAgICAgIHdpZHRoLFxuICAgICAgICAgIGhlaWdodCxcbiAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICAnc3RlbmNpbCcsXG4gICAgICAgICAgJ3VpbnQ4JylcbiAgICAgIH1cblxuICAgICAgaWYgKGRlcHRoU3RlbmNpbEJ1ZmZlcikge1xuICAgICAgICBkZXB0aFN0ZW5jaWxBdHRhY2htZW50ID0gcGFyc2VBdHRhY2htZW50KGRlcHRoU3RlbmNpbEJ1ZmZlcilcbiAgICAgIH0gZWxzZSBpZiAoIWRlcHRoQnVmZmVyICYmICFzdGVuY2lsQnVmZmVyICYmIG5lZWRzU3RlbmNpbCAmJiBuZWVkc0RlcHRoKSB7XG4gICAgICAgIGRlcHRoU3RlbmNpbEF0dGFjaG1lbnQgPSBhbGxvY0F0dGFjaG1lbnQoXG4gICAgICAgICAgd2lkdGgsXG4gICAgICAgICAgaGVpZ2h0LFxuICAgICAgICAgIGRlcHRoU3RlbmNpbFRleHR1cmUsXG4gICAgICAgICAgJ2RlcHRoIHN0ZW5jaWwnLFxuICAgICAgICAgICdkZXB0aCBzdGVuY2lsJylcbiAgICAgIH1cblxuICAgICAgXG5cbiAgICAgIHZhciBjb21tb25Db2xvckF0dGFjaG1lbnRTaXplID0gbnVsbFxuXG4gICAgICBmb3IgKGkgPSAwOyBpIDwgY29sb3JBdHRhY2htZW50cy5sZW5ndGg7ICsraSkge1xuICAgICAgICBpbmNSZWZBbmRDaGVja1NoYXBlKGNvbG9yQXR0YWNobWVudHNbaV0sIHdpZHRoLCBoZWlnaHQpXG4gICAgICAgIFxuXG4gICAgICAgIGlmIChjb2xvckF0dGFjaG1lbnRzW2ldICYmIGNvbG9yQXR0YWNobWVudHNbaV0udGV4dHVyZSkge1xuICAgICAgICAgIHZhciBjb2xvckF0dGFjaG1lbnRTaXplID1cbiAgICAgICAgICAgICAgdGV4dHVyZUZvcm1hdENoYW5uZWxzW2NvbG9yQXR0YWNobWVudHNbaV0udGV4dHVyZS5fdGV4dHVyZS5mb3JtYXRdICpcbiAgICAgICAgICAgICAgdGV4dHVyZVR5cGVTaXplc1tjb2xvckF0dGFjaG1lbnRzW2ldLnRleHR1cmUuX3RleHR1cmUudHlwZV1cblxuICAgICAgICAgIGlmIChjb21tb25Db2xvckF0dGFjaG1lbnRTaXplID09PSBudWxsKSB7XG4gICAgICAgICAgICBjb21tb25Db2xvckF0dGFjaG1lbnRTaXplID0gY29sb3JBdHRhY2htZW50U2l6ZVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBXZSBuZWVkIHRvIG1ha2Ugc3VyZSB0aGF0IGFsbCBjb2xvciBhdHRhY2htZW50cyBoYXZlIHRoZSBzYW1lIG51bWJlciBvZiBiaXRwbGFuZXNcbiAgICAgICAgICAgIC8vICh0aGF0IGlzLCB0aGUgc2FtZSBudW1lciBvZiBiaXRzIHBlciBwaXhlbClcbiAgICAgICAgICAgIC8vIFRoaXMgaXMgcmVxdWlyZWQgYnkgdGhlIEdMRVMyLjAgc3RhbmRhcmQuIFNlZSB0aGUgYmVnaW5uaW5nIG9mIENoYXB0ZXIgNCBpbiB0aGF0IGRvY3VtZW50LlxuICAgICAgICAgICAgXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpbmNSZWZBbmRDaGVja1NoYXBlKGRlcHRoQXR0YWNobWVudCwgd2lkdGgsIGhlaWdodClcbiAgICAgIFxuICAgICAgaW5jUmVmQW5kQ2hlY2tTaGFwZShzdGVuY2lsQXR0YWNobWVudCwgd2lkdGgsIGhlaWdodClcbiAgICAgIFxuICAgICAgaW5jUmVmQW5kQ2hlY2tTaGFwZShkZXB0aFN0ZW5jaWxBdHRhY2htZW50LCB3aWR0aCwgaGVpZ2h0KVxuICAgICAgXG5cbiAgICAgIC8vIGRlY3JlbWVudCByZWZlcmVuY2VzXG4gICAgICBkZWNGQk9SZWZzKGZyYW1lYnVmZmVyKVxuXG4gICAgICBmcmFtZWJ1ZmZlci53aWR0aCA9IHdpZHRoXG4gICAgICBmcmFtZWJ1ZmZlci5oZWlnaHQgPSBoZWlnaHRcblxuICAgICAgZnJhbWVidWZmZXIuY29sb3JBdHRhY2htZW50cyA9IGNvbG9yQXR0YWNobWVudHNcbiAgICAgIGZyYW1lYnVmZmVyLmRlcHRoQXR0YWNobWVudCA9IGRlcHRoQXR0YWNobWVudFxuICAgICAgZnJhbWVidWZmZXIuc3RlbmNpbEF0dGFjaG1lbnQgPSBzdGVuY2lsQXR0YWNobWVudFxuICAgICAgZnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsQXR0YWNobWVudCA9IGRlcHRoU3RlbmNpbEF0dGFjaG1lbnRcblxuICAgICAgcmVnbEZyYW1lYnVmZmVyLmNvbG9yID0gY29sb3JBdHRhY2htZW50cy5tYXAodW53cmFwQXR0YWNobWVudClcbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci5kZXB0aCA9IHVud3JhcEF0dGFjaG1lbnQoZGVwdGhBdHRhY2htZW50KVxuICAgICAgcmVnbEZyYW1lYnVmZmVyLnN0ZW5jaWwgPSB1bndyYXBBdHRhY2htZW50KHN0ZW5jaWxBdHRhY2htZW50KVxuICAgICAgcmVnbEZyYW1lYnVmZmVyLmRlcHRoU3RlbmNpbCA9IHVud3JhcEF0dGFjaG1lbnQoZGVwdGhTdGVuY2lsQXR0YWNobWVudClcblxuICAgICAgcmVnbEZyYW1lYnVmZmVyLndpZHRoID0gZnJhbWVidWZmZXIud2lkdGhcbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci5oZWlnaHQgPSBmcmFtZWJ1ZmZlci5oZWlnaHRcblxuICAgICAgdXBkYXRlRnJhbWVidWZmZXIoZnJhbWVidWZmZXIpXG5cbiAgICAgIHJldHVybiByZWdsRnJhbWVidWZmZXJcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZXNpemUgKHdfLCBoXykge1xuICAgICAgXG5cbiAgICAgIHZhciB3ID0gd18gfCAwXG4gICAgICB2YXIgaCA9IChoXyB8IDApIHx8IHdcbiAgICAgIGlmICh3ID09PSBmcmFtZWJ1ZmZlci53aWR0aCAmJiBoID09PSBmcmFtZWJ1ZmZlci5oZWlnaHQpIHtcbiAgICAgICAgcmV0dXJuIHJlZ2xGcmFtZWJ1ZmZlclxuICAgICAgfVxuXG4gICAgICAvLyByZXNpemUgYWxsIGJ1ZmZlcnNcbiAgICAgIHZhciBjb2xvckF0dGFjaG1lbnRzID0gZnJhbWVidWZmZXIuY29sb3JBdHRhY2htZW50c1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjb2xvckF0dGFjaG1lbnRzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgIHJlc2l6ZUF0dGFjaG1lbnQoY29sb3JBdHRhY2htZW50c1tpXSwgdywgaClcbiAgICAgIH1cbiAgICAgIHJlc2l6ZUF0dGFjaG1lbnQoZnJhbWVidWZmZXIuZGVwdGhBdHRhY2htZW50LCB3LCBoKVxuICAgICAgcmVzaXplQXR0YWNobWVudChmcmFtZWJ1ZmZlci5zdGVuY2lsQXR0YWNobWVudCwgdywgaClcbiAgICAgIHJlc2l6ZUF0dGFjaG1lbnQoZnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsQXR0YWNobWVudCwgdywgaClcblxuICAgICAgZnJhbWVidWZmZXIud2lkdGggPSByZWdsRnJhbWVidWZmZXIud2lkdGggPSB3XG4gICAgICBmcmFtZWJ1ZmZlci5oZWlnaHQgPSByZWdsRnJhbWVidWZmZXIuaGVpZ2h0ID0gaFxuXG4gICAgICB1cGRhdGVGcmFtZWJ1ZmZlcihmcmFtZWJ1ZmZlcilcblxuICAgICAgcmV0dXJuIHJlZ2xGcmFtZWJ1ZmZlclxuICAgIH1cblxuICAgIHJlZ2xGcmFtZWJ1ZmZlcihhMCwgYTEpXG5cbiAgICByZXR1cm4gZXh0ZW5kKHJlZ2xGcmFtZWJ1ZmZlciwge1xuICAgICAgcmVzaXplOiByZXNpemUsXG4gICAgICBfcmVnbFR5cGU6ICdmcmFtZWJ1ZmZlcicsXG4gICAgICBfZnJhbWVidWZmZXI6IGZyYW1lYnVmZmVyLFxuICAgICAgZGVzdHJveTogZnVuY3Rpb24gKCkge1xuICAgICAgICBkZXN0cm95KGZyYW1lYnVmZmVyKVxuICAgICAgICBkZWNGQk9SZWZzKGZyYW1lYnVmZmVyKVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiBjcmVhdGVDdWJlRkJPIChvcHRpb25zKSB7XG4gICAgdmFyIGZhY2VzID0gQXJyYXkoNilcblxuICAgIGZ1bmN0aW9uIHJlZ2xGcmFtZWJ1ZmZlckN1YmUgKGEpIHtcbiAgICAgIHZhciBpXG5cbiAgICAgIFxuXG4gICAgICB2YXIgZXh0RHJhd0J1ZmZlcnMgPSBleHRlbnNpb25zLndlYmdsX2RyYXdfYnVmZmVyc1xuXG4gICAgICB2YXIgcGFyYW1zID0ge1xuICAgICAgICBjb2xvcjogbnVsbFxuICAgICAgfVxuXG4gICAgICB2YXIgcmFkaXVzID0gMFxuXG4gICAgICB2YXIgY29sb3JCdWZmZXIgPSBudWxsXG4gICAgICB2YXIgY29sb3JGb3JtYXQgPSAncmdiYSdcbiAgICAgIHZhciBjb2xvclR5cGUgPSAndWludDgnXG4gICAgICB2YXIgY29sb3JDb3VudCA9IDFcblxuICAgICAgaWYgKHR5cGVvZiBhID09PSAnbnVtYmVyJykge1xuICAgICAgICByYWRpdXMgPSBhIHwgMFxuICAgICAgfSBlbHNlIGlmICghYSkge1xuICAgICAgICByYWRpdXMgPSAxXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBcbiAgICAgICAgdmFyIG9wdGlvbnMgPSBhXG5cbiAgICAgICAgaWYgKCdzaGFwZScgaW4gb3B0aW9ucykge1xuICAgICAgICAgIHZhciBzaGFwZSA9IG9wdGlvbnMuc2hhcGVcbiAgICAgICAgICBcbiAgICAgICAgICBcbiAgICAgICAgICByYWRpdXMgPSBzaGFwZVswXVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmICgncmFkaXVzJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICByYWRpdXMgPSBvcHRpb25zLnJhZGl1cyB8IDBcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCd3aWR0aCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgcmFkaXVzID0gb3B0aW9ucy53aWR0aCB8IDBcbiAgICAgICAgICAgIGlmICgnaGVpZ2h0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSBpZiAoJ2hlaWdodCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgcmFkaXVzID0gb3B0aW9ucy5oZWlnaHQgfCAwXG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdjb2xvcicgaW4gb3B0aW9ucyB8fFxuICAgICAgICAgICAgJ2NvbG9ycycgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGNvbG9yQnVmZmVyID1cbiAgICAgICAgICAgIG9wdGlvbnMuY29sb3IgfHxcbiAgICAgICAgICAgIG9wdGlvbnMuY29sb3JzXG4gICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoY29sb3JCdWZmZXIpKSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWNvbG9yQnVmZmVyKSB7XG4gICAgICAgICAgaWYgKCdjb2xvckNvdW50JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBjb2xvckNvdW50ID0gb3B0aW9ucy5jb2xvckNvdW50IHwgMFxuICAgICAgICAgICAgXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKCdjb2xvclR5cGUnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY29sb3JUeXBlID0gb3B0aW9ucy5jb2xvclR5cGVcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoJ2NvbG9yRm9ybWF0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICBjb2xvckZvcm1hdCA9IG9wdGlvbnMuY29sb3JGb3JtYXRcbiAgICAgICAgICAgIFxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgnZGVwdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBwYXJhbXMuZGVwdGggPSBvcHRpb25zLmRlcHRoXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoJ3N0ZW5jaWwnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBwYXJhbXMuc3RlbmNpbCA9IG9wdGlvbnMuc3RlbmNpbFxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCdkZXB0aFN0ZW5jaWwnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBwYXJhbXMuZGVwdGhTdGVuY2lsID0gb3B0aW9ucy5kZXB0aFN0ZW5jaWxcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICB2YXIgY29sb3JDdWJlc1xuICAgICAgaWYgKGNvbG9yQnVmZmVyKSB7XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KGNvbG9yQnVmZmVyKSkge1xuICAgICAgICAgIGNvbG9yQ3ViZXMgPSBbXVxuICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xvckJ1ZmZlci5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgY29sb3JDdWJlc1tpXSA9IGNvbG9yQnVmZmVyW2ldXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbG9yQ3ViZXMgPSBbIGNvbG9yQnVmZmVyIF1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29sb3JDdWJlcyA9IEFycmF5KGNvbG9yQ291bnQpXG4gICAgICAgIHZhciBjdWJlTWFwUGFyYW1zID0ge1xuICAgICAgICAgIHJhZGl1czogcmFkaXVzLFxuICAgICAgICAgIGZvcm1hdDogY29sb3JGb3JtYXQsXG4gICAgICAgICAgdHlwZTogY29sb3JUeXBlXG4gICAgICAgIH1cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGNvbG9yQ291bnQ7ICsraSkge1xuICAgICAgICAgIGNvbG9yQ3ViZXNbaV0gPSB0ZXh0dXJlU3RhdGUuY3JlYXRlQ3ViZShjdWJlTWFwUGFyYW1zKVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIENoZWNrIGNvbG9yIGN1YmVzXG4gICAgICBwYXJhbXMuY29sb3IgPSBBcnJheShjb2xvckN1YmVzLmxlbmd0aClcbiAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xvckN1YmVzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgIHZhciBjdWJlID0gY29sb3JDdWJlc1tpXVxuICAgICAgICBcbiAgICAgICAgcmFkaXVzID0gcmFkaXVzIHx8IGN1YmUud2lkdGhcbiAgICAgICAgXG4gICAgICAgIHBhcmFtcy5jb2xvcltpXSA9IHtcbiAgICAgICAgICB0YXJnZXQ6IEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCxcbiAgICAgICAgICBkYXRhOiBjb2xvckN1YmVzW2ldXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGNvbG9yQ3ViZXMubGVuZ3RoOyArK2opIHtcbiAgICAgICAgICBwYXJhbXMuY29sb3Jbal0udGFyZ2V0ID0gR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YICsgaVxuICAgICAgICB9XG4gICAgICAgIC8vIHJldXNlIGRlcHRoLXN0ZW5jaWwgYXR0YWNobWVudHMgYWNyb3NzIGFsbCBjdWJlIG1hcHNcbiAgICAgICAgaWYgKGkgPiAwKSB7XG4gICAgICAgICAgcGFyYW1zLmRlcHRoID0gZmFjZXNbMF0uZGVwdGhcbiAgICAgICAgICBwYXJhbXMuc3RlbmNpbCA9IGZhY2VzWzBdLnN0ZW5jaWxcbiAgICAgICAgICBwYXJhbXMuZGVwdGhTdGVuY2lsID0gZmFjZXNbMF0uZGVwdGhTdGVuY2lsXG4gICAgICAgIH1cbiAgICAgICAgaWYgKGZhY2VzW2ldKSB7XG4gICAgICAgICAgKGZhY2VzW2ldKShwYXJhbXMpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZmFjZXNbaV0gPSBjcmVhdGVGQk8ocGFyYW1zKVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBleHRlbmQocmVnbEZyYW1lYnVmZmVyQ3ViZSwge1xuICAgICAgICB3aWR0aDogcmFkaXVzLFxuICAgICAgICBoZWlnaHQ6IHJhZGl1cyxcbiAgICAgICAgY29sb3I6IGNvbG9yQ3ViZXNcbiAgICAgIH0pXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVzaXplIChyYWRpdXNfKSB7XG4gICAgICB2YXIgaVxuICAgICAgdmFyIHJhZGl1cyA9IHJhZGl1c18gfCAwXG4gICAgICBcblxuICAgICAgaWYgKHJhZGl1cyA9PT0gcmVnbEZyYW1lYnVmZmVyQ3ViZS53aWR0aCkge1xuICAgICAgICByZXR1cm4gcmVnbEZyYW1lYnVmZmVyQ3ViZVxuICAgICAgfVxuXG4gICAgICB2YXIgY29sb3JzID0gcmVnbEZyYW1lYnVmZmVyQ3ViZS5jb2xvclxuICAgICAgZm9yIChpID0gMDsgaSA8IGNvbG9ycy5sZW5ndGg7ICsraSkge1xuICAgICAgICBjb2xvcnNbaV0ucmVzaXplKHJhZGl1cylcbiAgICAgIH1cblxuICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICBmYWNlc1tpXS5yZXNpemUocmFkaXVzKVxuICAgICAgfVxuXG4gICAgICByZWdsRnJhbWVidWZmZXJDdWJlLndpZHRoID0gcmVnbEZyYW1lYnVmZmVyQ3ViZS5oZWlnaHQgPSByYWRpdXNcblxuICAgICAgcmV0dXJuIHJlZ2xGcmFtZWJ1ZmZlckN1YmVcbiAgICB9XG5cbiAgICByZWdsRnJhbWVidWZmZXJDdWJlKG9wdGlvbnMpXG5cbiAgICByZXR1cm4gZXh0ZW5kKHJlZ2xGcmFtZWJ1ZmZlckN1YmUsIHtcbiAgICAgIGZhY2VzOiBmYWNlcyxcbiAgICAgIHJlc2l6ZTogcmVzaXplLFxuICAgICAgX3JlZ2xUeXBlOiAnZnJhbWVidWZmZXJDdWJlJyxcbiAgICAgIGRlc3Ryb3k6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgZmFjZXMuZm9yRWFjaChmdW5jdGlvbiAoZikge1xuICAgICAgICAgIGYuZGVzdHJveSgpXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlc3RvcmVGcmFtZWJ1ZmZlcnMgKCkge1xuICAgIHZhbHVlcyhmcmFtZWJ1ZmZlclNldCkuZm9yRWFjaChmdW5jdGlvbiAoZmIpIHtcbiAgICAgIGZiLmZyYW1lYnVmZmVyID0gZ2wuY3JlYXRlRnJhbWVidWZmZXIoKVxuICAgICAgdXBkYXRlRnJhbWVidWZmZXIoZmIpXG4gICAgfSlcbiAgfVxuXG4gIHJldHVybiBleHRlbmQoZnJhbWVidWZmZXJTdGF0ZSwge1xuICAgIGdldEZyYW1lYnVmZmVyOiBmdW5jdGlvbiAob2JqZWN0KSB7XG4gICAgICBpZiAodHlwZW9mIG9iamVjdCA9PT0gJ2Z1bmN0aW9uJyAmJiBvYmplY3QuX3JlZ2xUeXBlID09PSAnZnJhbWVidWZmZXInKSB7XG4gICAgICAgIHZhciBmYm8gPSBvYmplY3QuX2ZyYW1lYnVmZmVyXG4gICAgICAgIGlmIChmYm8gaW5zdGFuY2VvZiBSRUdMRnJhbWVidWZmZXIpIHtcbiAgICAgICAgICByZXR1cm4gZmJvXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsXG4gICAgfSxcbiAgICBjcmVhdGU6IGNyZWF0ZUZCTyxcbiAgICBjcmVhdGVDdWJlOiBjcmVhdGVDdWJlRkJPLFxuICAgIGNsZWFyOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YWx1ZXMoZnJhbWVidWZmZXJTZXQpLmZvckVhY2goZGVzdHJveSlcbiAgICB9LFxuICAgIHJlc3RvcmU6IHJlc3RvcmVGcmFtZWJ1ZmZlcnNcbiAgfSlcbn1cbiIsInZhciBHTF9TVUJQSVhFTF9CSVRTID0gMHgwRDUwXG52YXIgR0xfUkVEX0JJVFMgPSAweDBENTJcbnZhciBHTF9HUkVFTl9CSVRTID0gMHgwRDUzXG52YXIgR0xfQkxVRV9CSVRTID0gMHgwRDU0XG52YXIgR0xfQUxQSEFfQklUUyA9IDB4MEQ1NVxudmFyIEdMX0RFUFRIX0JJVFMgPSAweDBENTZcbnZhciBHTF9TVEVOQ0lMX0JJVFMgPSAweDBENTdcblxudmFyIEdMX0FMSUFTRURfUE9JTlRfU0laRV9SQU5HRSA9IDB4ODQ2RFxudmFyIEdMX0FMSUFTRURfTElORV9XSURUSF9SQU5HRSA9IDB4ODQ2RVxuXG52YXIgR0xfTUFYX1RFWFRVUkVfU0laRSA9IDB4MEQzM1xudmFyIEdMX01BWF9WSUVXUE9SVF9ESU1TID0gMHgwRDNBXG52YXIgR0xfTUFYX1ZFUlRFWF9BVFRSSUJTID0gMHg4ODY5XG52YXIgR0xfTUFYX1ZFUlRFWF9VTklGT1JNX1ZFQ1RPUlMgPSAweDhERkJcbnZhciBHTF9NQVhfVkFSWUlOR19WRUNUT1JTID0gMHg4REZDXG52YXIgR0xfTUFYX0NPTUJJTkVEX1RFWFRVUkVfSU1BR0VfVU5JVFMgPSAweDhCNERcbnZhciBHTF9NQVhfVkVSVEVYX1RFWFRVUkVfSU1BR0VfVU5JVFMgPSAweDhCNENcbnZhciBHTF9NQVhfVEVYVFVSRV9JTUFHRV9VTklUUyA9IDB4ODg3MlxudmFyIEdMX01BWF9GUkFHTUVOVF9VTklGT1JNX1ZFQ1RPUlMgPSAweDhERkRcbnZhciBHTF9NQVhfQ1VCRV9NQVBfVEVYVFVSRV9TSVpFID0gMHg4NTFDXG52YXIgR0xfTUFYX1JFTkRFUkJVRkZFUl9TSVpFID0gMHg4NEU4XG5cbnZhciBHTF9WRU5ET1IgPSAweDFGMDBcbnZhciBHTF9SRU5ERVJFUiA9IDB4MUYwMVxudmFyIEdMX1ZFUlNJT04gPSAweDFGMDJcbnZhciBHTF9TSEFESU5HX0xBTkdVQUdFX1ZFUlNJT04gPSAweDhCOENcblxudmFyIEdMX01BWF9URVhUVVJFX01BWF9BTklTT1RST1BZX0VYVCA9IDB4ODRGRlxuXG52YXIgR0xfTUFYX0NPTE9SX0FUVEFDSE1FTlRTX1dFQkdMID0gMHg4Q0RGXG52YXIgR0xfTUFYX0RSQVdfQlVGRkVSU19XRUJHTCA9IDB4ODgyNFxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChnbCwgZXh0ZW5zaW9ucykge1xuICB2YXIgbWF4QW5pc290cm9waWMgPSAxXG4gIGlmIChleHRlbnNpb25zLmV4dF90ZXh0dXJlX2ZpbHRlcl9hbmlzb3Ryb3BpYykge1xuICAgIG1heEFuaXNvdHJvcGljID0gZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9URVhUVVJFX01BWF9BTklTT1RST1BZX0VYVClcbiAgfVxuXG4gIHZhciBtYXhEcmF3YnVmZmVycyA9IDFcbiAgdmFyIG1heENvbG9yQXR0YWNobWVudHMgPSAxXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2RyYXdfYnVmZmVycykge1xuICAgIG1heERyYXdidWZmZXJzID0gZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9EUkFXX0JVRkZFUlNfV0VCR0wpXG4gICAgbWF4Q29sb3JBdHRhY2htZW50cyA9IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfQ09MT1JfQVRUQUNITUVOVFNfV0VCR0wpXG4gIH1cblxuICByZXR1cm4ge1xuICAgIC8vIGRyYXdpbmcgYnVmZmVyIGJpdCBkZXB0aFxuICAgIGNvbG9yQml0czogW1xuICAgICAgZ2wuZ2V0UGFyYW1ldGVyKEdMX1JFRF9CSVRTKSxcbiAgICAgIGdsLmdldFBhcmFtZXRlcihHTF9HUkVFTl9CSVRTKSxcbiAgICAgIGdsLmdldFBhcmFtZXRlcihHTF9CTFVFX0JJVFMpLFxuICAgICAgZ2wuZ2V0UGFyYW1ldGVyKEdMX0FMUEhBX0JJVFMpXG4gICAgXSxcbiAgICBkZXB0aEJpdHM6IGdsLmdldFBhcmFtZXRlcihHTF9ERVBUSF9CSVRTKSxcbiAgICBzdGVuY2lsQml0czogZ2wuZ2V0UGFyYW1ldGVyKEdMX1NURU5DSUxfQklUUyksXG4gICAgc3VicGl4ZWxCaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfU1VCUElYRUxfQklUUyksXG5cbiAgICAvLyBzdXBwb3J0ZWQgZXh0ZW5zaW9uc1xuICAgIGV4dGVuc2lvbnM6IE9iamVjdC5rZXlzKGV4dGVuc2lvbnMpLmZpbHRlcihmdW5jdGlvbiAoZXh0KSB7XG4gICAgICByZXR1cm4gISFleHRlbnNpb25zW2V4dF1cbiAgICB9KSxcblxuICAgIC8vIG1heCBhbmlzbyBzYW1wbGVzXG4gICAgbWF4QW5pc290cm9waWM6IG1heEFuaXNvdHJvcGljLFxuXG4gICAgLy8gbWF4IGRyYXcgYnVmZmVyc1xuICAgIG1heERyYXdidWZmZXJzOiBtYXhEcmF3YnVmZmVycyxcbiAgICBtYXhDb2xvckF0dGFjaG1lbnRzOiBtYXhDb2xvckF0dGFjaG1lbnRzLFxuXG4gICAgLy8gcG9pbnQgYW5kIGxpbmUgc2l6ZSByYW5nZXNcbiAgICBwb2ludFNpemVEaW1zOiBnbC5nZXRQYXJhbWV0ZXIoR0xfQUxJQVNFRF9QT0lOVF9TSVpFX1JBTkdFKSxcbiAgICBsaW5lV2lkdGhEaW1zOiBnbC5nZXRQYXJhbWV0ZXIoR0xfQUxJQVNFRF9MSU5FX1dJRFRIX1JBTkdFKSxcbiAgICBtYXhWaWV3cG9ydERpbXM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVklFV1BPUlRfRElNUyksXG4gICAgbWF4Q29tYmluZWRUZXh0dXJlVW5pdHM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfQ09NQklORURfVEVYVFVSRV9JTUFHRV9VTklUUyksXG4gICAgbWF4Q3ViZU1hcFNpemU6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfQ1VCRV9NQVBfVEVYVFVSRV9TSVpFKSxcbiAgICBtYXhSZW5kZXJidWZmZXJTaXplOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1JFTkRFUkJVRkZFUl9TSVpFKSxcbiAgICBtYXhUZXh0dXJlVW5pdHM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVEVYVFVSRV9JTUFHRV9VTklUUyksXG4gICAgbWF4VGV4dHVyZVNpemU6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVEVYVFVSRV9TSVpFKSxcbiAgICBtYXhBdHRyaWJ1dGVzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1ZFUlRFWF9BVFRSSUJTKSxcbiAgICBtYXhWZXJ0ZXhVbmlmb3JtczogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9WRVJURVhfVU5JRk9STV9WRUNUT1JTKSxcbiAgICBtYXhWZXJ0ZXhUZXh0dXJlVW5pdHM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVkVSVEVYX1RFWFRVUkVfSU1BR0VfVU5JVFMpLFxuICAgIG1heFZhcnlpbmdWZWN0b3JzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1ZBUllJTkdfVkVDVE9SUyksXG4gICAgbWF4RnJhZ21lbnRVbmlmb3JtczogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9GUkFHTUVOVF9VTklGT1JNX1ZFQ1RPUlMpLFxuXG4gICAgLy8gdmVuZG9yIGluZm9cbiAgICBnbHNsOiBnbC5nZXRQYXJhbWV0ZXIoR0xfU0hBRElOR19MQU5HVUFHRV9WRVJTSU9OKSxcbiAgICByZW5kZXJlcjogZ2wuZ2V0UGFyYW1ldGVyKEdMX1JFTkRFUkVSKSxcbiAgICB2ZW5kb3I6IGdsLmdldFBhcmFtZXRlcihHTF9WRU5ET1IpLFxuICAgIHZlcnNpb246IGdsLmdldFBhcmFtZXRlcihHTF9WRVJTSU9OKVxuICB9XG59XG4iLCJcbnZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL3V0aWwvaXMtdHlwZWQtYXJyYXknKVxuXG52YXIgR0xfUkdCQSA9IDY0MDhcbnZhciBHTF9VTlNJR05FRF9CWVRFID0gNTEyMVxudmFyIEdMX1BBQ0tfQUxJR05NRU5UID0gMHgwRDA1XG52YXIgR0xfRkxPQVQgPSAweDE0MDYgLy8gNTEyNlxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBSZWFkUGl4ZWxzIChcbiAgZ2wsXG4gIGZyYW1lYnVmZmVyU3RhdGUsXG4gIHJlZ2xQb2xsLFxuICBjb250ZXh0LFxuICBnbEF0dHJpYnV0ZXMsXG4gIGV4dGVuc2lvbnMpIHtcbiAgZnVuY3Rpb24gcmVhZFBpeGVscyAoaW5wdXQpIHtcbiAgICB2YXIgdHlwZVxuICAgIGlmIChmcmFtZWJ1ZmZlclN0YXRlLm5leHQgPT09IG51bGwpIHtcbiAgICAgIFxuICAgICAgdHlwZSA9IEdMX1VOU0lHTkVEX0JZVEVcbiAgICB9IGVsc2Uge1xuICAgICAgXG4gICAgICB0eXBlID0gZnJhbWVidWZmZXJTdGF0ZS5uZXh0LmNvbG9yQXR0YWNobWVudHNbMF0udGV4dHVyZS5fdGV4dHVyZS50eXBlXG5cbiAgICAgIGlmIChleHRlbnNpb25zLm9lc190ZXh0dXJlX2Zsb2F0KSB7XG4gICAgICAgIFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgXG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFyIHggPSAwXG4gICAgdmFyIHkgPSAwXG4gICAgdmFyIHdpZHRoID0gY29udGV4dC5mcmFtZWJ1ZmZlcldpZHRoXG4gICAgdmFyIGhlaWdodCA9IGNvbnRleHQuZnJhbWVidWZmZXJIZWlnaHRcbiAgICB2YXIgZGF0YSA9IG51bGxcblxuICAgIGlmIChpc1R5cGVkQXJyYXkoaW5wdXQpKSB7XG4gICAgICBkYXRhID0gaW5wdXRcbiAgICB9IGVsc2UgaWYgKGlucHV0KSB7XG4gICAgICBcbiAgICAgIHggPSBpbnB1dC54IHwgMFxuICAgICAgeSA9IGlucHV0LnkgfCAwXG4gICAgICBcbiAgICAgIFxuICAgICAgd2lkdGggPSAoaW5wdXQud2lkdGggfHwgKGNvbnRleHQuZnJhbWVidWZmZXJXaWR0aCAtIHgpKSB8IDBcbiAgICAgIGhlaWdodCA9IChpbnB1dC5oZWlnaHQgfHwgKGNvbnRleHQuZnJhbWVidWZmZXJIZWlnaHQgLSB5KSkgfCAwXG4gICAgICBkYXRhID0gaW5wdXQuZGF0YSB8fCBudWxsXG4gICAgfVxuXG4gICAgLy8gc2FuaXR5IGNoZWNrIGlucHV0LmRhdGFcbiAgICBpZiAoZGF0YSkge1xuICAgICAgaWYgKHR5cGUgPT09IEdMX1VOU0lHTkVEX0JZVEUpIHtcbiAgICAgICAgXG4gICAgICB9IGVsc2UgaWYgKHR5cGUgPT09IEdMX0ZMT0FUKSB7XG4gICAgICAgIFxuICAgICAgfVxuICAgIH1cblxuICAgIFxuICAgIFxuXG4gICAgLy8gVXBkYXRlIFdlYkdMIHN0YXRlXG4gICAgcmVnbFBvbGwoKVxuXG4gICAgLy8gQ29tcHV0ZSBzaXplXG4gICAgdmFyIHNpemUgPSB3aWR0aCAqIGhlaWdodCAqIDRcblxuICAgIC8vIEFsbG9jYXRlIGRhdGFcbiAgICBpZiAoIWRhdGEpIHtcbiAgICAgIGlmICh0eXBlID09PSBHTF9VTlNJR05FRF9CWVRFKSB7XG4gICAgICAgIGRhdGEgPSBuZXcgVWludDhBcnJheShzaXplKVxuICAgICAgfSBlbHNlIGlmICh0eXBlID09PSBHTF9GTE9BVCkge1xuICAgICAgICBkYXRhID0gZGF0YSB8fCBuZXcgRmxvYXQzMkFycmF5KHNpemUpXG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gVHlwZSBjaGVja1xuICAgIFxuICAgIFxuXG4gICAgLy8gUnVuIHJlYWQgcGl4ZWxzXG4gICAgZ2wucGl4ZWxTdG9yZWkoR0xfUEFDS19BTElHTk1FTlQsIDQpXG4gICAgZ2wucmVhZFBpeGVscyh4LCB5LCB3aWR0aCwgaGVpZ2h0LCBHTF9SR0JBLFxuICAgICAgICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgICAgICAgIGRhdGEpXG5cbiAgICByZXR1cm4gZGF0YVxuICB9XG5cbiAgcmV0dXJuIHJlYWRQaXhlbHNcbn1cbiIsIlxudmFyIHZhbHVlcyA9IHJlcXVpcmUoJy4vdXRpbC92YWx1ZXMnKVxuXG52YXIgR0xfUkVOREVSQlVGRkVSID0gMHg4RDQxXG5cbnZhciBHTF9SR0JBNCA9IDB4ODA1NlxudmFyIEdMX1JHQjVfQTEgPSAweDgwNTdcbnZhciBHTF9SR0I1NjUgPSAweDhENjJcbnZhciBHTF9ERVBUSF9DT01QT05FTlQxNiA9IDB4ODFBNVxudmFyIEdMX1NURU5DSUxfSU5ERVg4ID0gMHg4RDQ4XG52YXIgR0xfREVQVEhfU1RFTkNJTCA9IDB4ODRGOVxuXG52YXIgR0xfU1JHQjhfQUxQSEE4X0VYVCA9IDB4OEM0M1xuXG52YXIgR0xfUkdCQTMyRl9FWFQgPSAweDg4MTRcblxudmFyIEdMX1JHQkExNkZfRVhUID0gMHg4ODFBXG52YXIgR0xfUkdCMTZGX0VYVCA9IDB4ODgxQlxuXG52YXIgRk9STUFUX1NJWkVTID0gW11cblxuRk9STUFUX1NJWkVTW0dMX1JHQkE0XSA9IDJcbkZPUk1BVF9TSVpFU1tHTF9SR0I1X0ExXSA9IDJcbkZPUk1BVF9TSVpFU1tHTF9SR0I1NjVdID0gMlxuXG5GT1JNQVRfU0laRVNbR0xfREVQVEhfQ09NUE9ORU5UMTZdID0gMlxuRk9STUFUX1NJWkVTW0dMX1NURU5DSUxfSU5ERVg4XSA9IDFcbkZPUk1BVF9TSVpFU1tHTF9ERVBUSF9TVEVOQ0lMXSA9IDRcblxuRk9STUFUX1NJWkVTW0dMX1NSR0I4X0FMUEhBOF9FWFRdID0gNFxuRk9STUFUX1NJWkVTW0dMX1JHQkEzMkZfRVhUXSA9IDE2XG5GT1JNQVRfU0laRVNbR0xfUkdCQTE2Rl9FWFRdID0gOFxuRk9STUFUX1NJWkVTW0dMX1JHQjE2Rl9FWFRdID0gNlxuXG5mdW5jdGlvbiBnZXRSZW5kZXJidWZmZXJTaXplIChmb3JtYXQsIHdpZHRoLCBoZWlnaHQpIHtcbiAgcmV0dXJuIEZPUk1BVF9TSVpFU1tmb3JtYXRdICogd2lkdGggKiBoZWlnaHRcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoZ2wsIGV4dGVuc2lvbnMsIGxpbWl0cywgc3RhdHMsIGNvbmZpZykge1xuICB2YXIgZm9ybWF0VHlwZXMgPSB7XG4gICAgJ3JnYmE0JzogR0xfUkdCQTQsXG4gICAgJ3JnYjU2NSc6IEdMX1JHQjU2NSxcbiAgICAncmdiNSBhMSc6IEdMX1JHQjVfQTEsXG4gICAgJ2RlcHRoJzogR0xfREVQVEhfQ09NUE9ORU5UMTYsXG4gICAgJ3N0ZW5jaWwnOiBHTF9TVEVOQ0lMX0lOREVYOCxcbiAgICAnZGVwdGggc3RlbmNpbCc6IEdMX0RFUFRIX1NURU5DSUxcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLmV4dF9zcmdiKSB7XG4gICAgZm9ybWF0VHlwZXNbJ3NyZ2JhJ10gPSBHTF9TUkdCOF9BTFBIQThfRVhUXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5leHRfY29sb3JfYnVmZmVyX2hhbGZfZmxvYXQpIHtcbiAgICBmb3JtYXRUeXBlc1sncmdiYTE2ZiddID0gR0xfUkdCQTE2Rl9FWFRcbiAgICBmb3JtYXRUeXBlc1sncmdiMTZmJ10gPSBHTF9SR0IxNkZfRVhUXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb2xvcl9idWZmZXJfZmxvYXQpIHtcbiAgICBmb3JtYXRUeXBlc1sncmdiYTMyZiddID0gR0xfUkdCQTMyRl9FWFRcbiAgfVxuXG4gIHZhciBmb3JtYXRUeXBlc0ludmVydCA9IFtdXG4gIE9iamVjdC5rZXlzKGZvcm1hdFR5cGVzKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICB2YXIgdmFsID0gZm9ybWF0VHlwZXNba2V5XVxuICAgIGZvcm1hdFR5cGVzSW52ZXJ0W3ZhbF0gPSBrZXlcbiAgfSlcblxuICB2YXIgcmVuZGVyYnVmZmVyQ291bnQgPSAwXG4gIHZhciByZW5kZXJidWZmZXJTZXQgPSB7fVxuXG4gIGZ1bmN0aW9uIFJFR0xSZW5kZXJidWZmZXIgKHJlbmRlcmJ1ZmZlcikge1xuICAgIHRoaXMuaWQgPSByZW5kZXJidWZmZXJDb3VudCsrXG4gICAgdGhpcy5yZWZDb3VudCA9IDFcblxuICAgIHRoaXMucmVuZGVyYnVmZmVyID0gcmVuZGVyYnVmZmVyXG5cbiAgICB0aGlzLmZvcm1hdCA9IEdMX1JHQkE0XG4gICAgdGhpcy53aWR0aCA9IDBcbiAgICB0aGlzLmhlaWdodCA9IDBcblxuICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgdGhpcy5zdGF0cyA9IHtzaXplOiAwfVxuICAgIH1cbiAgfVxuXG4gIFJFR0xSZW5kZXJidWZmZXIucHJvdG90eXBlLmRlY1JlZiA9IGZ1bmN0aW9uICgpIHtcbiAgICBpZiAoLS10aGlzLnJlZkNvdW50IDw9IDApIHtcbiAgICAgIGRlc3Ryb3kodGhpcylcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95IChyYikge1xuICAgIHZhciBoYW5kbGUgPSByYi5yZW5kZXJidWZmZXJcbiAgICBcbiAgICBnbC5iaW5kUmVuZGVyYnVmZmVyKEdMX1JFTkRFUkJVRkZFUiwgbnVsbClcbiAgICBnbC5kZWxldGVSZW5kZXJidWZmZXIoaGFuZGxlKVxuICAgIHJiLnJlbmRlcmJ1ZmZlciA9IG51bGxcbiAgICByYi5yZWZDb3VudCA9IDBcbiAgICBkZWxldGUgcmVuZGVyYnVmZmVyU2V0W3JiLmlkXVxuICAgIHN0YXRzLnJlbmRlcmJ1ZmZlckNvdW50LS1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZVJlbmRlcmJ1ZmZlciAoYSwgYikge1xuICAgIHZhciByZW5kZXJidWZmZXIgPSBuZXcgUkVHTFJlbmRlcmJ1ZmZlcihnbC5jcmVhdGVSZW5kZXJidWZmZXIoKSlcbiAgICByZW5kZXJidWZmZXJTZXRbcmVuZGVyYnVmZmVyLmlkXSA9IHJlbmRlcmJ1ZmZlclxuICAgIHN0YXRzLnJlbmRlcmJ1ZmZlckNvdW50KytcblxuICAgIGZ1bmN0aW9uIHJlZ2xSZW5kZXJidWZmZXIgKGEsIGIpIHtcbiAgICAgIHZhciB3ID0gMFxuICAgICAgdmFyIGggPSAwXG4gICAgICB2YXIgZm9ybWF0ID0gR0xfUkdCQTRcblxuICAgICAgaWYgKHR5cGVvZiBhID09PSAnb2JqZWN0JyAmJiBhKSB7XG4gICAgICAgIHZhciBvcHRpb25zID0gYVxuICAgICAgICBpZiAoJ3NoYXBlJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgdmFyIHNoYXBlID0gb3B0aW9ucy5zaGFwZVxuICAgICAgICAgIFxuICAgICAgICAgIHcgPSBzaGFwZVswXSB8IDBcbiAgICAgICAgICBoID0gc2hhcGVbMV0gfCAwXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWYgKCdyYWRpdXMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIHcgPSBoID0gb3B0aW9ucy5yYWRpdXMgfCAwXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgnd2lkdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIHcgPSBvcHRpb25zLndpZHRoIHwgMFxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoJ2hlaWdodCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgaCA9IG9wdGlvbnMuaGVpZ2h0IHwgMFxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoJ2Zvcm1hdCcgaW4gb3B0aW9ucykge1xuICAgICAgICAgIFxuICAgICAgICAgIGZvcm1hdCA9IGZvcm1hdFR5cGVzW29wdGlvbnMuZm9ybWF0XVxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBhID09PSAnbnVtYmVyJykge1xuICAgICAgICB3ID0gYSB8IDBcbiAgICAgICAgaWYgKHR5cGVvZiBiID09PSAnbnVtYmVyJykge1xuICAgICAgICAgIGggPSBiIHwgMFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGggPSB3XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoIWEpIHtcbiAgICAgICAgdyA9IGggPSAxXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBcbiAgICAgIH1cblxuICAgICAgLy8gY2hlY2sgc2hhcGVcbiAgICAgIFxuXG4gICAgICBpZiAodyA9PT0gcmVuZGVyYnVmZmVyLndpZHRoICYmXG4gICAgICAgICAgaCA9PT0gcmVuZGVyYnVmZmVyLmhlaWdodCAmJlxuICAgICAgICAgIGZvcm1hdCA9PT0gcmVuZGVyYnVmZmVyLmZvcm1hdCkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgcmVnbFJlbmRlcmJ1ZmZlci53aWR0aCA9IHJlbmRlcmJ1ZmZlci53aWR0aCA9IHdcbiAgICAgIHJlZ2xSZW5kZXJidWZmZXIuaGVpZ2h0ID0gcmVuZGVyYnVmZmVyLmhlaWdodCA9IGhcbiAgICAgIHJlbmRlcmJ1ZmZlci5mb3JtYXQgPSBmb3JtYXRcblxuICAgICAgZ2wuYmluZFJlbmRlcmJ1ZmZlcihHTF9SRU5ERVJCVUZGRVIsIHJlbmRlcmJ1ZmZlci5yZW5kZXJidWZmZXIpXG4gICAgICBnbC5yZW5kZXJidWZmZXJTdG9yYWdlKEdMX1JFTkRFUkJVRkZFUiwgZm9ybWF0LCB3LCBoKVxuXG4gICAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgICAgcmVuZGVyYnVmZmVyLnN0YXRzLnNpemUgPSBnZXRSZW5kZXJidWZmZXJTaXplKHJlbmRlcmJ1ZmZlci5mb3JtYXQsIHJlbmRlcmJ1ZmZlci53aWR0aCwgcmVuZGVyYnVmZmVyLmhlaWdodClcbiAgICAgIH1cbiAgICAgIHJlZ2xSZW5kZXJidWZmZXIuZm9ybWF0ID0gZm9ybWF0VHlwZXNJbnZlcnRbcmVuZGVyYnVmZmVyLmZvcm1hdF1cblxuICAgICAgcmV0dXJuIHJlZ2xSZW5kZXJidWZmZXJcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZXNpemUgKHdfLCBoXykge1xuICAgICAgdmFyIHcgPSB3XyB8IDBcbiAgICAgIHZhciBoID0gKGhfIHwgMCkgfHwgd1xuXG4gICAgICBpZiAodyA9PT0gcmVuZGVyYnVmZmVyLndpZHRoICYmIGggPT09IHJlbmRlcmJ1ZmZlci5oZWlnaHQpIHtcbiAgICAgICAgcmV0dXJuIHJlZ2xSZW5kZXJidWZmZXJcbiAgICAgIH1cblxuICAgICAgLy8gY2hlY2sgc2hhcGVcbiAgICAgIFxuXG4gICAgICByZWdsUmVuZGVyYnVmZmVyLndpZHRoID0gcmVuZGVyYnVmZmVyLndpZHRoID0gd1xuICAgICAgcmVnbFJlbmRlcmJ1ZmZlci5oZWlnaHQgPSByZW5kZXJidWZmZXIuaGVpZ2h0ID0gaFxuXG4gICAgICBnbC5iaW5kUmVuZGVyYnVmZmVyKEdMX1JFTkRFUkJVRkZFUiwgcmVuZGVyYnVmZmVyLnJlbmRlcmJ1ZmZlcilcbiAgICAgIGdsLnJlbmRlcmJ1ZmZlclN0b3JhZ2UoR0xfUkVOREVSQlVGRkVSLCByZW5kZXJidWZmZXIuZm9ybWF0LCB3LCBoKVxuXG4gICAgICAvLyBhbHNvLCByZWNvbXB1dGUgc2l6ZS5cbiAgICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgICByZW5kZXJidWZmZXIuc3RhdHMuc2l6ZSA9IGdldFJlbmRlcmJ1ZmZlclNpemUoXG4gICAgICAgICAgcmVuZGVyYnVmZmVyLmZvcm1hdCwgcmVuZGVyYnVmZmVyLndpZHRoLCByZW5kZXJidWZmZXIuaGVpZ2h0KVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmVnbFJlbmRlcmJ1ZmZlclxuICAgIH1cblxuICAgIHJlZ2xSZW5kZXJidWZmZXIoYSwgYilcblxuICAgIHJlZ2xSZW5kZXJidWZmZXIucmVzaXplID0gcmVzaXplXG4gICAgcmVnbFJlbmRlcmJ1ZmZlci5fcmVnbFR5cGUgPSAncmVuZGVyYnVmZmVyJ1xuICAgIHJlZ2xSZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlciA9IHJlbmRlcmJ1ZmZlclxuICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgcmVnbFJlbmRlcmJ1ZmZlci5zdGF0cyA9IHJlbmRlcmJ1ZmZlci5zdGF0c1xuICAgIH1cbiAgICByZWdsUmVuZGVyYnVmZmVyLmRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7XG4gICAgICByZW5kZXJidWZmZXIuZGVjUmVmKClcbiAgICB9XG5cbiAgICByZXR1cm4gcmVnbFJlbmRlcmJ1ZmZlclxuICB9XG5cbiAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgc3RhdHMuZ2V0VG90YWxSZW5kZXJidWZmZXJTaXplID0gZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIHRvdGFsID0gMFxuICAgICAgT2JqZWN0LmtleXMocmVuZGVyYnVmZmVyU2V0KS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgdG90YWwgKz0gcmVuZGVyYnVmZmVyU2V0W2tleV0uc3RhdHMuc2l6ZVxuICAgICAgfSlcbiAgICAgIHJldHVybiB0b3RhbFxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHJlc3RvcmVSZW5kZXJidWZmZXJzICgpIHtcbiAgICB2YWx1ZXMocmVuZGVyYnVmZmVyU2V0KS5mb3JFYWNoKGZ1bmN0aW9uIChyYikge1xuICAgICAgcmIucmVuZGVyYnVmZmVyID0gZ2wuY3JlYXRlUmVuZGVyYnVmZmVyKClcbiAgICAgIGdsLmJpbmRSZW5kZXJidWZmZXIoR0xfUkVOREVSQlVGRkVSLCByYi5yZW5kZXJidWZmZXIpXG4gICAgICBnbC5yZW5kZXJidWZmZXJTdG9yYWdlKEdMX1JFTkRFUkJVRkZFUiwgcmIuZm9ybWF0LCByYi53aWR0aCwgcmIuaGVpZ2h0KVxuICAgIH0pXG4gICAgZ2wuYmluZFJlbmRlcmJ1ZmZlcihHTF9SRU5ERVJCVUZGRVIsIG51bGwpXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNyZWF0ZTogY3JlYXRlUmVuZGVyYnVmZmVyLFxuICAgIGNsZWFyOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YWx1ZXMocmVuZGVyYnVmZmVyU2V0KS5mb3JFYWNoKGRlc3Ryb3kpXG4gICAgfSxcbiAgICByZXN0b3JlOiByZXN0b3JlUmVuZGVyYnVmZmVyc1xuICB9XG59XG4iLCJcbnZhciB2YWx1ZXMgPSByZXF1aXJlKCcuL3V0aWwvdmFsdWVzJylcblxudmFyIEdMX0ZSQUdNRU5UX1NIQURFUiA9IDM1NjMyXG52YXIgR0xfVkVSVEVYX1NIQURFUiA9IDM1NjMzXG5cbnZhciBHTF9BQ1RJVkVfVU5JRk9STVMgPSAweDhCODZcbnZhciBHTF9BQ1RJVkVfQVRUUklCVVRFUyA9IDB4OEI4OVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHdyYXBTaGFkZXJTdGF0ZSAoZ2wsIHN0cmluZ1N0b3JlLCBzdGF0cywgY29uZmlnKSB7XG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBnbHNsIGNvbXBpbGF0aW9uIGFuZCBsaW5raW5nXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICB2YXIgZnJhZ1NoYWRlcnMgPSB7fVxuICB2YXIgdmVydFNoYWRlcnMgPSB7fVxuXG4gIGZ1bmN0aW9uIEFjdGl2ZUluZm8gKG5hbWUsIGlkLCBsb2NhdGlvbiwgaW5mbykge1xuICAgIHRoaXMubmFtZSA9IG5hbWVcbiAgICB0aGlzLmlkID0gaWRcbiAgICB0aGlzLmxvY2F0aW9uID0gbG9jYXRpb25cbiAgICB0aGlzLmluZm8gPSBpbmZvXG4gIH1cblxuICBmdW5jdGlvbiBpbnNlcnRBY3RpdmVJbmZvIChsaXN0LCBpbmZvKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgKytpKSB7XG4gICAgICBpZiAobGlzdFtpXS5pZCA9PT0gaW5mby5pZCkge1xuICAgICAgICBsaXN0W2ldLmxvY2F0aW9uID0gaW5mby5sb2NhdGlvblxuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICB9XG4gICAgbGlzdC5wdXNoKGluZm8pXG4gIH1cblxuICBmdW5jdGlvbiBnZXRTaGFkZXIgKHR5cGUsIGlkLCBjb21tYW5kKSB7XG4gICAgdmFyIGNhY2hlID0gdHlwZSA9PT0gR0xfRlJBR01FTlRfU0hBREVSID8gZnJhZ1NoYWRlcnMgOiB2ZXJ0U2hhZGVyc1xuICAgIHZhciBzaGFkZXIgPSBjYWNoZVtpZF1cblxuICAgIGlmICghc2hhZGVyKSB7XG4gICAgICB2YXIgc291cmNlID0gc3RyaW5nU3RvcmUuc3RyKGlkKVxuICAgICAgc2hhZGVyID0gZ2wuY3JlYXRlU2hhZGVyKHR5cGUpXG4gICAgICBnbC5zaGFkZXJTb3VyY2Uoc2hhZGVyLCBzb3VyY2UpXG4gICAgICBnbC5jb21waWxlU2hhZGVyKHNoYWRlcilcbiAgICAgIFxuICAgICAgY2FjaGVbaWRdID0gc2hhZGVyXG4gICAgfVxuXG4gICAgcmV0dXJuIHNoYWRlclxuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIHByb2dyYW0gbGlua2luZ1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgdmFyIHByb2dyYW1DYWNoZSA9IHt9XG4gIHZhciBwcm9ncmFtTGlzdCA9IFtdXG5cbiAgdmFyIFBST0dSQU1fQ09VTlRFUiA9IDBcblxuICBmdW5jdGlvbiBSRUdMUHJvZ3JhbSAoZnJhZ0lkLCB2ZXJ0SWQpIHtcbiAgICB0aGlzLmlkID0gUFJPR1JBTV9DT1VOVEVSKytcbiAgICB0aGlzLmZyYWdJZCA9IGZyYWdJZFxuICAgIHRoaXMudmVydElkID0gdmVydElkXG4gICAgdGhpcy5wcm9ncmFtID0gbnVsbFxuICAgIHRoaXMudW5pZm9ybXMgPSBbXVxuICAgIHRoaXMuYXR0cmlidXRlcyA9IFtdXG5cbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgIHRoaXMuc3RhdHMgPSB7XG4gICAgICAgIHVuaWZvcm1zQ291bnQ6IDAsXG4gICAgICAgIGF0dHJpYnV0ZXNDb3VudDogMFxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGxpbmtQcm9ncmFtIChkZXNjLCBjb21tYW5kKSB7XG4gICAgdmFyIGksIGluZm9cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBjb21waWxlICYgbGlua1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICB2YXIgZnJhZ1NoYWRlciA9IGdldFNoYWRlcihHTF9GUkFHTUVOVF9TSEFERVIsIGRlc2MuZnJhZ0lkKVxuICAgIHZhciB2ZXJ0U2hhZGVyID0gZ2V0U2hhZGVyKEdMX1ZFUlRFWF9TSEFERVIsIGRlc2MudmVydElkKVxuXG4gICAgdmFyIHByb2dyYW0gPSBkZXNjLnByb2dyYW0gPSBnbC5jcmVhdGVQcm9ncmFtKClcbiAgICBnbC5hdHRhY2hTaGFkZXIocHJvZ3JhbSwgZnJhZ1NoYWRlcilcbiAgICBnbC5hdHRhY2hTaGFkZXIocHJvZ3JhbSwgdmVydFNoYWRlcilcbiAgICBnbC5saW5rUHJvZ3JhbShwcm9ncmFtKVxuICAgIFxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGdyYWIgdW5pZm9ybXNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgdmFyIG51bVVuaWZvcm1zID0gZ2wuZ2V0UHJvZ3JhbVBhcmFtZXRlcihwcm9ncmFtLCBHTF9BQ1RJVkVfVU5JRk9STVMpXG4gICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICBkZXNjLnN0YXRzLnVuaWZvcm1zQ291bnQgPSBudW1Vbmlmb3Jtc1xuICAgIH1cbiAgICB2YXIgdW5pZm9ybXMgPSBkZXNjLnVuaWZvcm1zXG4gICAgZm9yIChpID0gMDsgaSA8IG51bVVuaWZvcm1zOyArK2kpIHtcbiAgICAgIGluZm8gPSBnbC5nZXRBY3RpdmVVbmlmb3JtKHByb2dyYW0sIGkpXG4gICAgICBpZiAoaW5mbykge1xuICAgICAgICBpZiAoaW5mby5zaXplID4gMSkge1xuICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgaW5mby5zaXplOyArK2opIHtcbiAgICAgICAgICAgIHZhciBuYW1lID0gaW5mby5uYW1lLnJlcGxhY2UoJ1swXScsICdbJyArIGogKyAnXScpXG4gICAgICAgICAgICBpbnNlcnRBY3RpdmVJbmZvKHVuaWZvcm1zLCBuZXcgQWN0aXZlSW5mbyhcbiAgICAgICAgICAgICAgbmFtZSxcbiAgICAgICAgICAgICAgc3RyaW5nU3RvcmUuaWQobmFtZSksXG4gICAgICAgICAgICAgIGdsLmdldFVuaWZvcm1Mb2NhdGlvbihwcm9ncmFtLCBuYW1lKSxcbiAgICAgICAgICAgICAgaW5mbykpXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGluc2VydEFjdGl2ZUluZm8odW5pZm9ybXMsIG5ldyBBY3RpdmVJbmZvKFxuICAgICAgICAgICAgaW5mby5uYW1lLFxuICAgICAgICAgICAgc3RyaW5nU3RvcmUuaWQoaW5mby5uYW1lKSxcbiAgICAgICAgICAgIGdsLmdldFVuaWZvcm1Mb2NhdGlvbihwcm9ncmFtLCBpbmZvLm5hbWUpLFxuICAgICAgICAgICAgaW5mbykpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gZ3JhYiBhdHRyaWJ1dGVzXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHZhciBudW1BdHRyaWJ1dGVzID0gZ2wuZ2V0UHJvZ3JhbVBhcmFtZXRlcihwcm9ncmFtLCBHTF9BQ1RJVkVfQVRUUklCVVRFUylcbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcbiAgICAgIGRlc2Muc3RhdHMuYXR0cmlidXRlc0NvdW50ID0gbnVtQXR0cmlidXRlc1xuICAgIH1cblxuICAgIHZhciBhdHRyaWJ1dGVzID0gZGVzYy5hdHRyaWJ1dGVzXG4gICAgZm9yIChpID0gMDsgaSA8IG51bUF0dHJpYnV0ZXM7ICsraSkge1xuICAgICAgaW5mbyA9IGdsLmdldEFjdGl2ZUF0dHJpYihwcm9ncmFtLCBpKVxuICAgICAgaWYgKGluZm8pIHtcbiAgICAgICAgaW5zZXJ0QWN0aXZlSW5mbyhhdHRyaWJ1dGVzLCBuZXcgQWN0aXZlSW5mbyhcbiAgICAgICAgICBpbmZvLm5hbWUsXG4gICAgICAgICAgc3RyaW5nU3RvcmUuaWQoaW5mby5uYW1lKSxcbiAgICAgICAgICBnbC5nZXRBdHRyaWJMb2NhdGlvbihwcm9ncmFtLCBpbmZvLm5hbWUpLFxuICAgICAgICAgIGluZm8pKVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgIHN0YXRzLmdldE1heFVuaWZvcm1zQ291bnQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgbSA9IDBcbiAgICAgIHByb2dyYW1MaXN0LmZvckVhY2goZnVuY3Rpb24gKGRlc2MpIHtcbiAgICAgICAgaWYgKGRlc2Muc3RhdHMudW5pZm9ybXNDb3VudCA+IG0pIHtcbiAgICAgICAgICBtID0gZGVzYy5zdGF0cy51bmlmb3Jtc0NvdW50XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICByZXR1cm4gbVxuICAgIH1cblxuICAgIHN0YXRzLmdldE1heEF0dHJpYnV0ZXNDb3VudCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBtID0gMFxuICAgICAgcHJvZ3JhbUxpc3QuZm9yRWFjaChmdW5jdGlvbiAoZGVzYykge1xuICAgICAgICBpZiAoZGVzYy5zdGF0cy5hdHRyaWJ1dGVzQ291bnQgPiBtKSB7XG4gICAgICAgICAgbSA9IGRlc2Muc3RhdHMuYXR0cmlidXRlc0NvdW50XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICByZXR1cm4gbVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHJlc3RvcmVTaGFkZXJzICgpIHtcbiAgICBmcmFnU2hhZGVycyA9IHt9XG4gICAgdmVydFNoYWRlcnMgPSB7fVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcHJvZ3JhbUxpc3QubGVuZ3RoOyArK2kpIHtcbiAgICAgIGxpbmtQcm9ncmFtKHByb2dyYW1MaXN0W2ldKVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY2xlYXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBkZWxldGVTaGFkZXIgPSBnbC5kZWxldGVTaGFkZXIuYmluZChnbClcbiAgICAgIHZhbHVlcyhmcmFnU2hhZGVycykuZm9yRWFjaChkZWxldGVTaGFkZXIpXG4gICAgICBmcmFnU2hhZGVycyA9IHt9XG4gICAgICB2YWx1ZXModmVydFNoYWRlcnMpLmZvckVhY2goZGVsZXRlU2hhZGVyKVxuICAgICAgdmVydFNoYWRlcnMgPSB7fVxuXG4gICAgICBwcm9ncmFtTGlzdC5mb3JFYWNoKGZ1bmN0aW9uIChkZXNjKSB7XG4gICAgICAgIGdsLmRlbGV0ZVByb2dyYW0oZGVzYy5wcm9ncmFtKVxuICAgICAgfSlcbiAgICAgIHByb2dyYW1MaXN0Lmxlbmd0aCA9IDBcbiAgICAgIHByb2dyYW1DYWNoZSA9IHt9XG5cbiAgICAgIHN0YXRzLnNoYWRlckNvdW50ID0gMFxuICAgIH0sXG5cbiAgICBwcm9ncmFtOiBmdW5jdGlvbiAodmVydElkLCBmcmFnSWQsIGNvbW1hbmQpIHtcbiAgICAgIFxuICAgICAgXG5cbiAgICAgIHN0YXRzLnNoYWRlckNvdW50KytcblxuICAgICAgdmFyIGNhY2hlID0gcHJvZ3JhbUNhY2hlW2ZyYWdJZF1cbiAgICAgIGlmICghY2FjaGUpIHtcbiAgICAgICAgY2FjaGUgPSBwcm9ncmFtQ2FjaGVbZnJhZ0lkXSA9IHt9XG4gICAgICB9XG4gICAgICB2YXIgcHJvZ3JhbSA9IGNhY2hlW3ZlcnRJZF1cbiAgICAgIGlmICghcHJvZ3JhbSkge1xuICAgICAgICBwcm9ncmFtID0gbmV3IFJFR0xQcm9ncmFtKGZyYWdJZCwgdmVydElkKVxuICAgICAgICBsaW5rUHJvZ3JhbShwcm9ncmFtLCBjb21tYW5kKVxuICAgICAgICBjYWNoZVt2ZXJ0SWRdID0gcHJvZ3JhbVxuICAgICAgICBwcm9ncmFtTGlzdC5wdXNoKHByb2dyYW0pXG4gICAgICB9XG4gICAgICByZXR1cm4gcHJvZ3JhbVxuICAgIH0sXG5cbiAgICByZXN0b3JlOiByZXN0b3JlU2hhZGVycyxcblxuICAgIHNoYWRlcjogZ2V0U2hhZGVyLFxuXG4gICAgZnJhZzogLTEsXG4gICAgdmVydDogLTFcbiAgfVxufVxuIiwiXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHN0YXRzICgpIHtcbiAgcmV0dXJuIHtcbiAgICBidWZmZXJDb3VudDogMCxcbiAgICBlbGVtZW50c0NvdW50OiAwLFxuICAgIGZyYW1lYnVmZmVyQ291bnQ6IDAsXG4gICAgc2hhZGVyQ291bnQ6IDAsXG4gICAgdGV4dHVyZUNvdW50OiAwLFxuICAgIGN1YmVDb3VudDogMCxcbiAgICByZW5kZXJidWZmZXJDb3VudDogMCxcblxuICAgIG1heFRleHR1cmVVbml0czogMFxuICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNyZWF0ZVN0cmluZ1N0b3JlICgpIHtcbiAgdmFyIHN0cmluZ0lkcyA9IHsnJzogMH1cbiAgdmFyIHN0cmluZ1ZhbHVlcyA9IFsnJ11cbiAgcmV0dXJuIHtcbiAgICBpZDogZnVuY3Rpb24gKHN0cikge1xuICAgICAgdmFyIHJlc3VsdCA9IHN0cmluZ0lkc1tzdHJdXG4gICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgIH1cbiAgICAgIHJlc3VsdCA9IHN0cmluZ0lkc1tzdHJdID0gc3RyaW5nVmFsdWVzLmxlbmd0aFxuICAgICAgc3RyaW5nVmFsdWVzLnB1c2goc3RyKVxuICAgICAgcmV0dXJuIHJlc3VsdFxuICAgIH0sXG5cbiAgICBzdHI6IGZ1bmN0aW9uIChpZCkge1xuICAgICAgcmV0dXJuIHN0cmluZ1ZhbHVlc1tpZF1cbiAgICB9XG4gIH1cbn1cbiIsIlxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vdXRpbC9leHRlbmQnKVxudmFyIHZhbHVlcyA9IHJlcXVpcmUoJy4vdXRpbC92YWx1ZXMnKVxudmFyIGlzVHlwZWRBcnJheSA9IHJlcXVpcmUoJy4vdXRpbC9pcy10eXBlZC1hcnJheScpXG52YXIgaXNOREFycmF5TGlrZSA9IHJlcXVpcmUoJy4vdXRpbC9pcy1uZGFycmF5JylcbnZhciBwb29sID0gcmVxdWlyZSgnLi91dGlsL3Bvb2wnKVxudmFyIGNvbnZlcnRUb0hhbGZGbG9hdCA9IHJlcXVpcmUoJy4vdXRpbC90by1oYWxmLWZsb2F0JylcbnZhciBpc0FycmF5TGlrZSA9IHJlcXVpcmUoJy4vdXRpbC9pcy1hcnJheS1saWtlJylcbnZhciBmbGF0dGVuVXRpbHMgPSByZXF1aXJlKCcuL3V0aWwvZmxhdHRlbicpXG5cbnZhciBkdHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9hcnJheXR5cGVzLmpzb24nKVxudmFyIGFycmF5VHlwZXMgPSByZXF1aXJlKCcuL2NvbnN0YW50cy9hcnJheXR5cGVzLmpzb24nKVxuXG52YXIgR0xfQ09NUFJFU1NFRF9URVhUVVJFX0ZPUk1BVFMgPSAweDg2QTNcblxudmFyIEdMX1RFWFRVUkVfMkQgPSAweDBERTFcbnZhciBHTF9URVhUVVJFX0NVQkVfTUFQID0gMHg4NTEzXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YID0gMHg4NTE1XG5cbnZhciBHTF9SR0JBID0gMHgxOTA4XG52YXIgR0xfQUxQSEEgPSAweDE5MDZcbnZhciBHTF9SR0IgPSAweDE5MDdcbnZhciBHTF9MVU1JTkFOQ0UgPSAweDE5MDlcbnZhciBHTF9MVU1JTkFOQ0VfQUxQSEEgPSAweDE5MEFcblxudmFyIEdMX1JHQkE0ID0gMHg4MDU2XG52YXIgR0xfUkdCNV9BMSA9IDB4ODA1N1xudmFyIEdMX1JHQjU2NSA9IDB4OEQ2MlxuXG52YXIgR0xfVU5TSUdORURfU0hPUlRfNF80XzRfNCA9IDB4ODAzM1xudmFyIEdMX1VOU0lHTkVEX1NIT1JUXzVfNV81XzEgPSAweDgwMzRcbnZhciBHTF9VTlNJR05FRF9TSE9SVF81XzZfNSA9IDB4ODM2M1xudmFyIEdMX1VOU0lHTkVEX0lOVF8yNF84X1dFQkdMID0gMHg4NEZBXG5cbnZhciBHTF9ERVBUSF9DT01QT05FTlQgPSAweDE5MDJcbnZhciBHTF9ERVBUSF9TVEVOQ0lMID0gMHg4NEY5XG5cbnZhciBHTF9TUkdCX0VYVCA9IDB4OEM0MFxudmFyIEdMX1NSR0JfQUxQSEFfRVhUID0gMHg4QzQyXG5cbnZhciBHTF9IQUxGX0ZMT0FUX09FUyA9IDB4OEQ2MVxuXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfUzNUQ19EWFQxX0VYVCA9IDB4ODNGMFxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDFfRVhUID0gMHg4M0YxXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUM19FWFQgPSAweDgzRjJcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQ1X0VYVCA9IDB4ODNGM1xuXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfQVRDX1dFQkdMID0gMHg4QzkyXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19FWFBMSUNJVF9BTFBIQV9XRUJHTCA9IDB4OEM5M1xudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9BVENfSU5URVJQT0xBVEVEX0FMUEhBX1dFQkdMID0gMHg4N0VFXG5cbnZhciBHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ180QlBQVjFfSU1HID0gMHg4QzAwXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfUFZSVENfMkJQUFYxX0lNRyA9IDB4OEMwMVxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9QVlJUQ180QlBQVjFfSU1HID0gMHg4QzAyXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1BWUlRDXzJCUFBWMV9JTUcgPSAweDhDMDNcblxudmFyIEdMX0NPTVBSRVNTRURfUkdCX0VUQzFfV0VCR0wgPSAweDhENjRcblxudmFyIEdMX1VOU0lHTkVEX0JZVEUgPSAweDE0MDFcbnZhciBHTF9VTlNJR05FRF9TSE9SVCA9IDB4MTQwM1xudmFyIEdMX1VOU0lHTkVEX0lOVCA9IDB4MTQwNVxudmFyIEdMX0ZMT0FUID0gMHgxNDA2XG5cbnZhciBHTF9URVhUVVJFX1dSQVBfUyA9IDB4MjgwMlxudmFyIEdMX1RFWFRVUkVfV1JBUF9UID0gMHgyODAzXG5cbnZhciBHTF9SRVBFQVQgPSAweDI5MDFcbnZhciBHTF9DTEFNUF9UT19FREdFID0gMHg4MTJGXG52YXIgR0xfTUlSUk9SRURfUkVQRUFUID0gMHg4MzcwXG5cbnZhciBHTF9URVhUVVJFX01BR19GSUxURVIgPSAweDI4MDBcbnZhciBHTF9URVhUVVJFX01JTl9GSUxURVIgPSAweDI4MDFcblxudmFyIEdMX05FQVJFU1QgPSAweDI2MDBcbnZhciBHTF9MSU5FQVIgPSAweDI2MDFcbnZhciBHTF9ORUFSRVNUX01JUE1BUF9ORUFSRVNUID0gMHgyNzAwXG52YXIgR0xfTElORUFSX01JUE1BUF9ORUFSRVNUID0gMHgyNzAxXG52YXIgR0xfTkVBUkVTVF9NSVBNQVBfTElORUFSID0gMHgyNzAyXG52YXIgR0xfTElORUFSX01JUE1BUF9MSU5FQVIgPSAweDI3MDNcblxudmFyIEdMX0dFTkVSQVRFX01JUE1BUF9ISU5UID0gMHg4MTkyXG52YXIgR0xfRE9OVF9DQVJFID0gMHgxMTAwXG52YXIgR0xfRkFTVEVTVCA9IDB4MTEwMVxudmFyIEdMX05JQ0VTVCA9IDB4MTEwMlxuXG52YXIgR0xfVEVYVFVSRV9NQVhfQU5JU09UUk9QWV9FWFQgPSAweDg0RkVcblxudmFyIEdMX1VOUEFDS19BTElHTk1FTlQgPSAweDBDRjVcbnZhciBHTF9VTlBBQ0tfRkxJUF9ZX1dFQkdMID0gMHg5MjQwXG52YXIgR0xfVU5QQUNLX1BSRU1VTFRJUExZX0FMUEhBX1dFQkdMID0gMHg5MjQxXG52YXIgR0xfVU5QQUNLX0NPTE9SU1BBQ0VfQ09OVkVSU0lPTl9XRUJHTCA9IDB4OTI0M1xuXG52YXIgR0xfQlJPV1NFUl9ERUZBVUxUX1dFQkdMID0gMHg5MjQ0XG5cbnZhciBHTF9URVhUVVJFMCA9IDB4ODRDMFxuXG52YXIgTUlQTUFQX0ZJTFRFUlMgPSBbXG4gIEdMX05FQVJFU1RfTUlQTUFQX05FQVJFU1QsXG4gIEdMX05FQVJFU1RfTUlQTUFQX0xJTkVBUixcbiAgR0xfTElORUFSX01JUE1BUF9ORUFSRVNULFxuICBHTF9MSU5FQVJfTUlQTUFQX0xJTkVBUlxuXVxuXG52YXIgQ0hBTk5FTFNfRk9STUFUID0gW1xuICAwLFxuICBHTF9MVU1JTkFOQ0UsXG4gIEdMX0xVTUlOQU5DRV9BTFBIQSxcbiAgR0xfUkdCLFxuICBHTF9SR0JBXG5dXG5cbnZhciBGT1JNQVRfQ0hBTk5FTFMgPSB7fVxuRk9STUFUX0NIQU5ORUxTW0dMX0xVTUlOQU5DRV0gPVxuRk9STUFUX0NIQU5ORUxTW0dMX0FMUEhBXSA9XG5GT1JNQVRfQ0hBTk5FTFNbR0xfREVQVEhfQ09NUE9ORU5UXSA9IDFcbkZPUk1BVF9DSEFOTkVMU1tHTF9ERVBUSF9TVEVOQ0lMXSA9XG5GT1JNQVRfQ0hBTk5FTFNbR0xfTFVNSU5BTkNFX0FMUEhBXSA9IDJcbkZPUk1BVF9DSEFOTkVMU1tHTF9SR0JdID1cbkZPUk1BVF9DSEFOTkVMU1tHTF9TUkdCX0VYVF0gPSAzXG5GT1JNQVRfQ0hBTk5FTFNbR0xfUkdCQV0gPVxuRk9STUFUX0NIQU5ORUxTW0dMX1NSR0JfQUxQSEFfRVhUXSA9IDRcblxudmFyIGZvcm1hdFR5cGVzID0ge31cbmZvcm1hdFR5cGVzW0dMX1JHQkE0XSA9IEdMX1VOU0lHTkVEX1NIT1JUXzRfNF80XzRcbmZvcm1hdFR5cGVzW0dMX1JHQjU2NV0gPSBHTF9VTlNJR05FRF9TSE9SVF81XzZfNVxuZm9ybWF0VHlwZXNbR0xfUkdCNV9BMV0gPSBHTF9VTlNJR05FRF9TSE9SVF81XzVfNV8xXG5mb3JtYXRUeXBlc1tHTF9ERVBUSF9DT01QT05FTlRdID0gR0xfVU5TSUdORURfSU5UXG5mb3JtYXRUeXBlc1tHTF9ERVBUSF9TVEVOQ0lMXSA9IEdMX1VOU0lHTkVEX0lOVF8yNF84X1dFQkdMXG5cbmZ1bmN0aW9uIG9iamVjdE5hbWUgKHN0cikge1xuICByZXR1cm4gJ1tvYmplY3QgJyArIHN0ciArICddJ1xufVxuXG52YXIgQ0FOVkFTX0NMQVNTID0gb2JqZWN0TmFtZSgnSFRNTENhbnZhc0VsZW1lbnQnKVxudmFyIENPTlRFWFQyRF9DTEFTUyA9IG9iamVjdE5hbWUoJ0NhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCcpXG52YXIgSU1BR0VfQ0xBU1MgPSBvYmplY3ROYW1lKCdIVE1MSW1hZ2VFbGVtZW50JylcbnZhciBWSURFT19DTEFTUyA9IG9iamVjdE5hbWUoJ0hUTUxWaWRlb0VsZW1lbnQnKVxuXG52YXIgUElYRUxfQ0xBU1NFUyA9IE9iamVjdC5rZXlzKGR0eXBlcykuY29uY2F0KFtcbiAgQ0FOVkFTX0NMQVNTLFxuICBDT05URVhUMkRfQ0xBU1MsXG4gIElNQUdFX0NMQVNTLFxuICBWSURFT19DTEFTU1xuXSlcblxuLy8gZm9yIGV2ZXJ5IHRleHR1cmUgdHlwZSwgc3RvcmVcbi8vIHRoZSBzaXplIGluIGJ5dGVzLlxudmFyIFRZUEVfU0laRVMgPSBbXVxuVFlQRV9TSVpFU1tHTF9VTlNJR05FRF9CWVRFXSA9IDFcblRZUEVfU0laRVNbR0xfRkxPQVRdID0gNFxuVFlQRV9TSVpFU1tHTF9IQUxGX0ZMT0FUX09FU10gPSAyXG5cblRZUEVfU0laRVNbR0xfVU5TSUdORURfU0hPUlRdID0gMlxuVFlQRV9TSVpFU1tHTF9VTlNJR05FRF9JTlRdID0gNFxuXG52YXIgRk9STUFUX1NJWkVTX1NQRUNJQUwgPSBbXVxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfUkdCQTRdID0gMlxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfUkdCNV9BMV0gPSAyXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9SR0I1NjVdID0gMlxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfREVQVEhfU1RFTkNJTF0gPSA0XG5cbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCX1MzVENfRFhUMV9FWFRdID0gMC41XG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQxX0VYVF0gPSAwLjVcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDNfRVhUXSA9IDFcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDVfRVhUXSA9IDFcblxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JfQVRDX1dFQkdMXSA9IDAuNVxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19FWFBMSUNJVF9BTFBIQV9XRUJHTF0gPSAxXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQkFfQVRDX0lOVEVSUE9MQVRFRF9BTFBIQV9XRUJHTF0gPSAxXG5cbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCX1BWUlRDXzRCUFBWMV9JTUddID0gMC41XG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ18yQlBQVjFfSU1HXSA9IDAuMjVcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCQV9QVlJUQ180QlBQVjFfSU1HXSA9IDAuNVxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JBX1BWUlRDXzJCUFBWMV9JTUddID0gMC4yNVxuXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQl9FVEMxX1dFQkdMXSA9IDAuNVxuXG5mdW5jdGlvbiBpc051bWVyaWNBcnJheSAoYXJyKSB7XG4gIHJldHVybiAoXG4gICAgQXJyYXkuaXNBcnJheShhcnIpICYmXG4gICAgKGFyci5sZW5ndGggPT09IDAgfHxcbiAgICB0eXBlb2YgYXJyWzBdID09PSAnbnVtYmVyJykpXG59XG5cbmZ1bmN0aW9uIGlzUmVjdEFycmF5IChhcnIpIHtcbiAgaWYgKCFBcnJheS5pc0FycmF5KGFycikpIHtcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxuICB2YXIgd2lkdGggPSBhcnIubGVuZ3RoXG4gIGlmICh3aWR0aCA9PT0gMCB8fCAhaXNBcnJheUxpa2UoYXJyWzBdKSkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG4gIHJldHVybiB0cnVlXG59XG5cbmZ1bmN0aW9uIGNsYXNzU3RyaW5nICh4KSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoeClcbn1cblxuZnVuY3Rpb24gaXNDYW52YXNFbGVtZW50IChvYmplY3QpIHtcbiAgcmV0dXJuIGNsYXNzU3RyaW5nKG9iamVjdCkgPT09IENBTlZBU19DTEFTU1xufVxuXG5mdW5jdGlvbiBpc0NvbnRleHQyRCAob2JqZWN0KSB7XG4gIHJldHVybiBjbGFzc1N0cmluZyhvYmplY3QpID09PSBDT05URVhUMkRfQ0xBU1Ncbn1cblxuZnVuY3Rpb24gaXNJbWFnZUVsZW1lbnQgKG9iamVjdCkge1xuICByZXR1cm4gY2xhc3NTdHJpbmcob2JqZWN0KSA9PT0gSU1BR0VfQ0xBU1Ncbn1cblxuZnVuY3Rpb24gaXNWaWRlb0VsZW1lbnQgKG9iamVjdCkge1xuICByZXR1cm4gY2xhc3NTdHJpbmcob2JqZWN0KSA9PT0gVklERU9fQ0xBU1Ncbn1cblxuZnVuY3Rpb24gaXNQaXhlbERhdGEgKG9iamVjdCkge1xuICBpZiAoIW9iamVjdCkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG4gIHZhciBjbGFzc05hbWUgPSBjbGFzc1N0cmluZyhvYmplY3QpXG4gIGlmIChQSVhFTF9DTEFTU0VTLmluZGV4T2YoY2xhc3NOYW1lKSA+PSAwKSB7XG4gICAgcmV0dXJuIHRydWVcbiAgfVxuICByZXR1cm4gKFxuICAgIGlzTnVtZXJpY0FycmF5KG9iamVjdCkgfHxcbiAgICBpc1JlY3RBcnJheShvYmplY3QpIHx8XG4gICAgaXNOREFycmF5TGlrZShvYmplY3QpKVxufVxuXG5mdW5jdGlvbiB0eXBlZEFycmF5Q29kZSAoZGF0YSkge1xuICByZXR1cm4gYXJyYXlUeXBlc1tPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoZGF0YSldIHwgMFxufVxuXG5mdW5jdGlvbiBjb252ZXJ0RGF0YSAocmVzdWx0LCBkYXRhKSB7XG4gIHZhciBuID0gZGF0YS5sZW5ndGhcbiAgc3dpdGNoIChyZXN1bHQudHlwZSkge1xuICAgIGNhc2UgR0xfVU5TSUdORURfQllURTpcbiAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUOlxuICAgIGNhc2UgR0xfVU5TSUdORURfSU5UOlxuICAgIGNhc2UgR0xfRkxPQVQ6XG4gICAgICB2YXIgY29udmVydGVkID0gcG9vbC5hbGxvY1R5cGUocmVzdWx0LnR5cGUsIG4pXG4gICAgICBjb252ZXJ0ZWQuc2V0KGRhdGEpXG4gICAgICByZXN1bHQuZGF0YSA9IGNvbnZlcnRlZFxuICAgICAgYnJlYWtcblxuICAgIGNhc2UgR0xfSEFMRl9GTE9BVF9PRVM6XG4gICAgICByZXN1bHQuZGF0YSA9IGNvbnZlcnRUb0hhbGZGbG9hdChkYXRhKVxuICAgICAgYnJlYWtcblxuICAgIGRlZmF1bHQ6XG4gICAgICBcbiAgfVxufVxuXG5mdW5jdGlvbiBwcmVDb252ZXJ0IChpbWFnZSwgbikge1xuICByZXR1cm4gcG9vbC5hbGxvY1R5cGUoXG4gICAgaW1hZ2UudHlwZSA9PT0gR0xfSEFMRl9GTE9BVF9PRVNcbiAgICAgID8gR0xfRkxPQVRcbiAgICAgIDogaW1hZ2UudHlwZSwgbilcbn1cblxuZnVuY3Rpb24gcG9zdENvbnZlcnQgKGltYWdlLCBkYXRhKSB7XG4gIGlmIChpbWFnZS50eXBlID09PSBHTF9IQUxGX0ZMT0FUX09FUykge1xuICAgIGltYWdlLmRhdGEgPSBjb252ZXJ0VG9IYWxmRmxvYXQoZGF0YSlcbiAgICBwb29sLmZyZWVUeXBlKGRhdGEpXG4gIH0gZWxzZSB7XG4gICAgaW1hZ2UuZGF0YSA9IGRhdGFcbiAgfVxufVxuXG5mdW5jdGlvbiB0cmFuc3Bvc2VEYXRhIChpbWFnZSwgYXJyYXksIHN0cmlkZVgsIHN0cmlkZVksIHN0cmlkZUMsIG9mZnNldCkge1xuICB2YXIgdyA9IGltYWdlLndpZHRoXG4gIHZhciBoID0gaW1hZ2UuaGVpZ2h0XG4gIHZhciBjID0gaW1hZ2UuY2hhbm5lbHNcbiAgdmFyIG4gPSB3ICogaCAqIGNcbiAgdmFyIGRhdGEgPSBwcmVDb252ZXJ0KGltYWdlLCBuKVxuXG4gIHZhciBwID0gMFxuICBmb3IgKHZhciBpID0gMDsgaSA8IGg7ICsraSkge1xuICAgIGZvciAodmFyIGogPSAwOyBqIDwgdzsgKytqKSB7XG4gICAgICBmb3IgKHZhciBrID0gMDsgayA8IGM7ICsraykge1xuICAgICAgICBkYXRhW3ArK10gPSBhcnJheVtzdHJpZGVYICogaiArIHN0cmlkZVkgKiBpICsgc3RyaWRlQyAqIGsgKyBvZmZzZXRdXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcG9zdENvbnZlcnQoaW1hZ2UsIGRhdGEpXG59XG5cbmZ1bmN0aW9uIGdldFRleHR1cmVTaXplIChmb3JtYXQsIHR5cGUsIHdpZHRoLCBoZWlnaHQsIGlzTWlwbWFwLCBpc0N1YmUpIHtcbiAgdmFyIHNcbiAgaWYgKHR5cGVvZiBGT1JNQVRfU0laRVNfU1BFQ0lBTFtmb3JtYXRdICE9PSAndW5kZWZpbmVkJykge1xuICAgIC8vIHdlIGhhdmUgYSBzcGVjaWFsIGFycmF5IGZvciBkZWFsaW5nIHdpdGggd2VpcmQgY29sb3IgZm9ybWF0cyBzdWNoIGFzIFJHQjVBMVxuICAgIHMgPSBGT1JNQVRfU0laRVNfU1BFQ0lBTFtmb3JtYXRdXG4gIH0gZWxzZSB7XG4gICAgcyA9IEZPUk1BVF9DSEFOTkVMU1tmb3JtYXRdICogVFlQRV9TSVpFU1t0eXBlXVxuICB9XG5cbiAgaWYgKGlzQ3ViZSkge1xuICAgIHMgKj0gNlxuICB9XG5cbiAgaWYgKGlzTWlwbWFwKSB7XG4gICAgLy8gY29tcHV0ZSB0aGUgdG90YWwgc2l6ZSBvZiBhbGwgdGhlIG1pcG1hcHMuXG4gICAgdmFyIHRvdGFsID0gMFxuXG4gICAgdmFyIHcgPSB3aWR0aFxuICAgIHdoaWxlICh3ID49IDEpIHtcbiAgICAgIC8vIHdlIGNhbiBvbmx5IHVzZSBtaXBtYXBzIG9uIGEgc3F1YXJlIGltYWdlLFxuICAgICAgLy8gc28gd2UgY2FuIHNpbXBseSB1c2UgdGhlIHdpZHRoIGFuZCBpZ25vcmUgdGhlIGhlaWdodDpcbiAgICAgIHRvdGFsICs9IHMgKiB3ICogd1xuICAgICAgdyAvPSAyXG4gICAgfVxuICAgIHJldHVybiB0b3RhbFxuICB9IGVsc2Uge1xuICAgIHJldHVybiBzICogd2lkdGggKiBoZWlnaHRcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNyZWF0ZVRleHR1cmVTZXQgKFxuICBnbCwgZXh0ZW5zaW9ucywgbGltaXRzLCByZWdsUG9sbCwgY29udGV4dFN0YXRlLCBzdGF0cywgY29uZmlnKSB7XG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gSW5pdGlhbGl6ZSBjb25zdGFudHMgYW5kIHBhcmFtZXRlciB0YWJsZXMgaGVyZVxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIHZhciBtaXBtYXBIaW50ID0ge1xuICAgIFwiZG9uJ3QgY2FyZVwiOiBHTF9ET05UX0NBUkUsXG4gICAgJ2RvbnQgY2FyZSc6IEdMX0RPTlRfQ0FSRSxcbiAgICAnbmljZSc6IEdMX05JQ0VTVCxcbiAgICAnZmFzdCc6IEdMX0ZBU1RFU1RcbiAgfVxuXG4gIHZhciB3cmFwTW9kZXMgPSB7XG4gICAgJ3JlcGVhdCc6IEdMX1JFUEVBVCxcbiAgICAnY2xhbXAnOiBHTF9DTEFNUF9UT19FREdFLFxuICAgICdtaXJyb3InOiBHTF9NSVJST1JFRF9SRVBFQVRcbiAgfVxuXG4gIHZhciBtYWdGaWx0ZXJzID0ge1xuICAgICduZWFyZXN0JzogR0xfTkVBUkVTVCxcbiAgICAnbGluZWFyJzogR0xfTElORUFSXG4gIH1cblxuICB2YXIgbWluRmlsdGVycyA9IGV4dGVuZCh7XG4gICAgJ21pcG1hcCc6IEdMX0xJTkVBUl9NSVBNQVBfTElORUFSLFxuICAgICduZWFyZXN0IG1pcG1hcCBuZWFyZXN0JzogR0xfTkVBUkVTVF9NSVBNQVBfTkVBUkVTVCxcbiAgICAnbGluZWFyIG1pcG1hcCBuZWFyZXN0JzogR0xfTElORUFSX01JUE1BUF9ORUFSRVNULFxuICAgICduZWFyZXN0IG1pcG1hcCBsaW5lYXInOiBHTF9ORUFSRVNUX01JUE1BUF9MSU5FQVIsXG4gICAgJ2xpbmVhciBtaXBtYXAgbGluZWFyJzogR0xfTElORUFSX01JUE1BUF9MSU5FQVJcbiAgfSwgbWFnRmlsdGVycylcblxuICB2YXIgY29sb3JTcGFjZSA9IHtcbiAgICAnbm9uZSc6IDAsXG4gICAgJ2Jyb3dzZXInOiBHTF9CUk9XU0VSX0RFRkFVTFRfV0VCR0xcbiAgfVxuXG4gIHZhciB0ZXh0dXJlVHlwZXMgPSB7XG4gICAgJ3VpbnQ4JzogR0xfVU5TSUdORURfQllURSxcbiAgICAncmdiYTQnOiBHTF9VTlNJR05FRF9TSE9SVF80XzRfNF80LFxuICAgICdyZ2I1NjUnOiBHTF9VTlNJR05FRF9TSE9SVF81XzZfNSxcbiAgICAncmdiNSBhMSc6IEdMX1VOU0lHTkVEX1NIT1JUXzVfNV81XzFcbiAgfVxuXG4gIHZhciB0ZXh0dXJlRm9ybWF0cyA9IHtcbiAgICAnYWxwaGEnOiBHTF9BTFBIQSxcbiAgICAnbHVtaW5hbmNlJzogR0xfTFVNSU5BTkNFLFxuICAgICdsdW1pbmFuY2UgYWxwaGEnOiBHTF9MVU1JTkFOQ0VfQUxQSEEsXG4gICAgJ3JnYic6IEdMX1JHQixcbiAgICAncmdiYSc6IEdMX1JHQkEsXG4gICAgJ3JnYmE0JzogR0xfUkdCQTQsXG4gICAgJ3JnYjUgYTEnOiBHTF9SR0I1X0ExLFxuICAgICdyZ2I1NjUnOiBHTF9SR0I1NjVcbiAgfVxuXG4gIHZhciBjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHMgPSB7fVxuXG4gIGlmIChleHRlbnNpb25zLmV4dF9zcmdiKSB7XG4gICAgdGV4dHVyZUZvcm1hdHMuc3JnYiA9IEdMX1NSR0JfRVhUXG4gICAgdGV4dHVyZUZvcm1hdHMuc3JnYmEgPSBHTF9TUkdCX0FMUEhBX0VYVFxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMub2VzX3RleHR1cmVfZmxvYXQpIHtcbiAgICB0ZXh0dXJlVHlwZXMuZmxvYXQzMiA9IHRleHR1cmVUeXBlcy5mbG9hdCA9IEdMX0ZMT0FUXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9oYWxmX2Zsb2F0KSB7XG4gICAgdGV4dHVyZVR5cGVzWydmbG9hdDE2J10gPSB0ZXh0dXJlVHlwZXNbJ2hhbGYgZmxvYXQnXSA9IEdMX0hBTEZfRkxPQVRfT0VTXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9kZXB0aF90ZXh0dXJlKSB7XG4gICAgZXh0ZW5kKHRleHR1cmVGb3JtYXRzLCB7XG4gICAgICAnZGVwdGgnOiBHTF9ERVBUSF9DT01QT05FTlQsXG4gICAgICAnZGVwdGggc3RlbmNpbCc6IEdMX0RFUFRIX1NURU5DSUxcbiAgICB9KVxuXG4gICAgZXh0ZW5kKHRleHR1cmVUeXBlcywge1xuICAgICAgJ3VpbnQxNic6IEdMX1VOU0lHTkVEX1NIT1JULFxuICAgICAgJ3VpbnQzMic6IEdMX1VOU0lHTkVEX0lOVCxcbiAgICAgICdkZXB0aCBzdGVuY2lsJzogR0xfVU5TSUdORURfSU5UXzI0XzhfV0VCR0xcbiAgICB9KVxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29tcHJlc3NlZF90ZXh0dXJlX3MzdGMpIHtcbiAgICBleHRlbmQoY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzLCB7XG4gICAgICAncmdiIHMzdGMgZHh0MSc6IEdMX0NPTVBSRVNTRURfUkdCX1MzVENfRFhUMV9FWFQsXG4gICAgICAncmdiYSBzM3RjIGR4dDEnOiBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQxX0VYVCxcbiAgICAgICdyZ2JhIHMzdGMgZHh0Myc6IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDNfRVhULFxuICAgICAgJ3JnYmEgczN0YyBkeHQ1JzogR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUNV9FWFRcbiAgICB9KVxuICB9XG5cbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29tcHJlc3NlZF90ZXh0dXJlX2F0Yykge1xuICAgIGV4dGVuZChjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHMsIHtcbiAgICAgICdyZ2IgYXRjJzogR0xfQ09NUFJFU1NFRF9SR0JfQVRDX1dFQkdMLFxuICAgICAgJ3JnYmEgYXRjIGV4cGxpY2l0IGFscGhhJzogR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19FWFBMSUNJVF9BTFBIQV9XRUJHTCxcbiAgICAgICdyZ2JhIGF0YyBpbnRlcnBvbGF0ZWQgYWxwaGEnOiBHTF9DT01QUkVTU0VEX1JHQkFfQVRDX0lOVEVSUE9MQVRFRF9BTFBIQV9XRUJHTFxuICAgIH0pXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb21wcmVzc2VkX3RleHR1cmVfcHZydGMpIHtcbiAgICBleHRlbmQoY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzLCB7XG4gICAgICAncmdiIHB2cnRjIDRicHB2MSc6IEdMX0NPTVBSRVNTRURfUkdCX1BWUlRDXzRCUFBWMV9JTUcsXG4gICAgICAncmdiIHB2cnRjIDJicHB2MSc6IEdMX0NPTVBSRVNTRURfUkdCX1BWUlRDXzJCUFBWMV9JTUcsXG4gICAgICAncmdiYSBwdnJ0YyA0YnBwdjEnOiBHTF9DT01QUkVTU0VEX1JHQkFfUFZSVENfNEJQUFYxX0lNRyxcbiAgICAgICdyZ2JhIHB2cnRjIDJicHB2MSc6IEdMX0NPTVBSRVNTRURfUkdCQV9QVlJUQ18yQlBQVjFfSU1HXG4gICAgfSlcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9ldGMxKSB7XG4gICAgY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzWydyZ2IgZXRjMSddID0gR0xfQ09NUFJFU1NFRF9SR0JfRVRDMV9XRUJHTFxuICB9XG5cbiAgLy8gQ29weSBvdmVyIGFsbCB0ZXh0dXJlIGZvcm1hdHNcbiAgdmFyIHN1cHBvcnRlZENvbXByZXNzZWRGb3JtYXRzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoXG4gICAgZ2wuZ2V0UGFyYW1ldGVyKEdMX0NPTVBSRVNTRURfVEVYVFVSRV9GT1JNQVRTKSlcbiAgT2JqZWN0LmtleXMoY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdmFyIGZvcm1hdCA9IGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0c1tuYW1lXVxuICAgIGlmIChzdXBwb3J0ZWRDb21wcmVzc2VkRm9ybWF0cy5pbmRleE9mKGZvcm1hdCkgPj0gMCkge1xuICAgICAgdGV4dHVyZUZvcm1hdHNbbmFtZV0gPSBmb3JtYXRcbiAgICB9XG4gIH0pXG5cbiAgdmFyIHN1cHBvcnRlZEZvcm1hdHMgPSBPYmplY3Qua2V5cyh0ZXh0dXJlRm9ybWF0cylcbiAgbGltaXRzLnRleHR1cmVGb3JtYXRzID0gc3VwcG9ydGVkRm9ybWF0c1xuXG4gIC8vIGFzc29jaWF0ZSB3aXRoIGV2ZXJ5IGZvcm1hdCBzdHJpbmcgaXRzXG4gIC8vIGNvcnJlc3BvbmRpbmcgR0wtdmFsdWUuXG4gIHZhciB0ZXh0dXJlRm9ybWF0c0ludmVydCA9IFtdXG4gIE9iamVjdC5rZXlzKHRleHR1cmVGb3JtYXRzKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICB2YXIgdmFsID0gdGV4dHVyZUZvcm1hdHNba2V5XVxuICAgIHRleHR1cmVGb3JtYXRzSW52ZXJ0W3ZhbF0gPSBrZXlcbiAgfSlcblxuICAvLyBhc3NvY2lhdGUgd2l0aCBldmVyeSB0eXBlIHN0cmluZyBpdHNcbiAgLy8gY29ycmVzcG9uZGluZyBHTC12YWx1ZS5cbiAgdmFyIHRleHR1cmVUeXBlc0ludmVydCA9IFtdXG4gIE9iamVjdC5rZXlzKHRleHR1cmVUeXBlcykuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgdmFyIHZhbCA9IHRleHR1cmVUeXBlc1trZXldXG4gICAgdGV4dHVyZVR5cGVzSW52ZXJ0W3ZhbF0gPSBrZXlcbiAgfSlcblxuICB2YXIgbWFnRmlsdGVyc0ludmVydCA9IFtdXG4gIE9iamVjdC5rZXlzKG1hZ0ZpbHRlcnMpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgIHZhciB2YWwgPSBtYWdGaWx0ZXJzW2tleV1cbiAgICBtYWdGaWx0ZXJzSW52ZXJ0W3ZhbF0gPSBrZXlcbiAgfSlcblxuICB2YXIgbWluRmlsdGVyc0ludmVydCA9IFtdXG4gIE9iamVjdC5rZXlzKG1pbkZpbHRlcnMpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgIHZhciB2YWwgPSBtaW5GaWx0ZXJzW2tleV1cbiAgICBtaW5GaWx0ZXJzSW52ZXJ0W3ZhbF0gPSBrZXlcbiAgfSlcblxuICB2YXIgd3JhcE1vZGVzSW52ZXJ0ID0gW11cbiAgT2JqZWN0LmtleXMod3JhcE1vZGVzKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICB2YXIgdmFsID0gd3JhcE1vZGVzW2tleV1cbiAgICB3cmFwTW9kZXNJbnZlcnRbdmFsXSA9IGtleVxuICB9KVxuXG4gIC8vIGNvbG9yRm9ybWF0c1tdIGdpdmVzIHRoZSBmb3JtYXQgKGNoYW5uZWxzKSBhc3NvY2lhdGVkIHRvIGFuXG4gIC8vIGludGVybmFsZm9ybWF0XG4gIHZhciBjb2xvckZvcm1hdHMgPSBzdXBwb3J0ZWRGb3JtYXRzLnJlZHVjZShmdW5jdGlvbiAoY29sb3IsIGtleSkge1xuICAgIHZhciBnbGVudW0gPSB0ZXh0dXJlRm9ybWF0c1trZXldXG4gICAgaWYgKGdsZW51bSA9PT0gR0xfTFVNSU5BTkNFIHx8XG4gICAgICAgIGdsZW51bSA9PT0gR0xfQUxQSEEgfHxcbiAgICAgICAgZ2xlbnVtID09PSBHTF9MVU1JTkFOQ0UgfHxcbiAgICAgICAgZ2xlbnVtID09PSBHTF9MVU1JTkFOQ0VfQUxQSEEgfHxcbiAgICAgICAgZ2xlbnVtID09PSBHTF9ERVBUSF9DT01QT05FTlQgfHxcbiAgICAgICAgZ2xlbnVtID09PSBHTF9ERVBUSF9TVEVOQ0lMKSB7XG4gICAgICBjb2xvcltnbGVudW1dID0gZ2xlbnVtXG4gICAgfSBlbHNlIGlmIChnbGVudW0gPT09IEdMX1JHQjVfQTEgfHwga2V5LmluZGV4T2YoJ3JnYmEnKSA+PSAwKSB7XG4gICAgICBjb2xvcltnbGVudW1dID0gR0xfUkdCQVxuICAgIH0gZWxzZSB7XG4gICAgICBjb2xvcltnbGVudW1dID0gR0xfUkdCXG4gICAgfVxuICAgIHJldHVybiBjb2xvclxuICB9LCB7fSlcblxuICBmdW5jdGlvbiBUZXhGbGFncyAoKSB7XG4gICAgLy8gZm9ybWF0IGluZm9cbiAgICB0aGlzLmludGVybmFsZm9ybWF0ID0gR0xfUkdCQVxuICAgIHRoaXMuZm9ybWF0ID0gR0xfUkdCQVxuICAgIHRoaXMudHlwZSA9IEdMX1VOU0lHTkVEX0JZVEVcbiAgICB0aGlzLmNvbXByZXNzZWQgPSBmYWxzZVxuXG4gICAgLy8gcGl4ZWwgc3RvcmFnZVxuICAgIHRoaXMucHJlbXVsdGlwbHlBbHBoYSA9IGZhbHNlXG4gICAgdGhpcy5mbGlwWSA9IGZhbHNlXG4gICAgdGhpcy51bnBhY2tBbGlnbm1lbnQgPSAxXG4gICAgdGhpcy5jb2xvclNwYWNlID0gMFxuXG4gICAgLy8gc2hhcGUgaW5mb1xuICAgIHRoaXMud2lkdGggPSAwXG4gICAgdGhpcy5oZWlnaHQgPSAwXG4gICAgdGhpcy5jaGFubmVscyA9IDBcbiAgfVxuXG4gIGZ1bmN0aW9uIGNvcHlGbGFncyAocmVzdWx0LCBvdGhlcikge1xuICAgIHJlc3VsdC5pbnRlcm5hbGZvcm1hdCA9IG90aGVyLmludGVybmFsZm9ybWF0XG4gICAgcmVzdWx0LmZvcm1hdCA9IG90aGVyLmZvcm1hdFxuICAgIHJlc3VsdC50eXBlID0gb3RoZXIudHlwZVxuICAgIHJlc3VsdC5jb21wcmVzc2VkID0gb3RoZXIuY29tcHJlc3NlZFxuXG4gICAgcmVzdWx0LnByZW11bHRpcGx5QWxwaGEgPSBvdGhlci5wcmVtdWx0aXBseUFscGhhXG4gICAgcmVzdWx0LmZsaXBZID0gb3RoZXIuZmxpcFlcbiAgICByZXN1bHQudW5wYWNrQWxpZ25tZW50ID0gb3RoZXIudW5wYWNrQWxpZ25tZW50XG4gICAgcmVzdWx0LmNvbG9yU3BhY2UgPSBvdGhlci5jb2xvclNwYWNlXG5cbiAgICByZXN1bHQud2lkdGggPSBvdGhlci53aWR0aFxuICAgIHJlc3VsdC5oZWlnaHQgPSBvdGhlci5oZWlnaHRcbiAgICByZXN1bHQuY2hhbm5lbHMgPSBvdGhlci5jaGFubmVsc1xuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VGbGFncyAoZmxhZ3MsIG9wdGlvbnMpIHtcbiAgICBpZiAodHlwZW9mIG9wdGlvbnMgIT09ICdvYmplY3QnIHx8ICFvcHRpb25zKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBpZiAoJ3ByZW11bHRpcGx5QWxwaGEnIGluIG9wdGlvbnMpIHtcbiAgICAgIFxuICAgICAgZmxhZ3MucHJlbXVsdGlwbHlBbHBoYSA9IG9wdGlvbnMucHJlbXVsdGlwbHlBbHBoYVxuICAgIH1cblxuICAgIGlmICgnZmxpcFknIGluIG9wdGlvbnMpIHtcbiAgICAgIFxuICAgICAgZmxhZ3MuZmxpcFkgPSBvcHRpb25zLmZsaXBZXG4gICAgfVxuXG4gICAgaWYgKCdhbGlnbm1lbnQnIGluIG9wdGlvbnMpIHtcbiAgICAgIFxuICAgICAgZmxhZ3MudW5wYWNrQWxpZ25tZW50ID0gb3B0aW9ucy5hbGlnbm1lbnRcbiAgICB9XG5cbiAgICBpZiAoJ2NvbG9yU3BhY2UnIGluIG9wdGlvbnMpIHtcbiAgICAgIFxuICAgICAgZmxhZ3MuY29sb3JTcGFjZSA9IGNvbG9yU3BhY2Vbb3B0aW9ucy5jb2xvclNwYWNlXVxuICAgIH1cblxuICAgIGlmICgndHlwZScgaW4gb3B0aW9ucykge1xuICAgICAgdmFyIHR5cGUgPSBvcHRpb25zLnR5cGVcbiAgICAgIFxuICAgICAgXG4gICAgICBcbiAgICAgIFxuICAgICAgZmxhZ3MudHlwZSA9IHRleHR1cmVUeXBlc1t0eXBlXVxuICAgIH1cblxuICAgIHZhciB3ID0gZmxhZ3Mud2lkdGhcbiAgICB2YXIgaCA9IGZsYWdzLmhlaWdodFxuICAgIHZhciBjID0gZmxhZ3MuY2hhbm5lbHNcbiAgICB2YXIgaGFzQ2hhbm5lbHMgPSBmYWxzZVxuICAgIGlmICgnc2hhcGUnIGluIG9wdGlvbnMpIHtcbiAgICAgIFxuICAgICAgdyA9IG9wdGlvbnMuc2hhcGVbMF1cbiAgICAgIGggPSBvcHRpb25zLnNoYXBlWzFdXG4gICAgICBpZiAob3B0aW9ucy5zaGFwZS5sZW5ndGggPT09IDMpIHtcbiAgICAgICAgYyA9IG9wdGlvbnMuc2hhcGVbMl1cbiAgICAgICAgXG4gICAgICAgIGhhc0NoYW5uZWxzID0gdHJ1ZVxuICAgICAgfVxuICAgICAgXG4gICAgICBcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKCdyYWRpdXMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdyA9IGggPSBvcHRpb25zLnJhZGl1c1xuICAgICAgICBcbiAgICAgIH1cbiAgICAgIGlmICgnd2lkdGgnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdyA9IG9wdGlvbnMud2lkdGhcbiAgICAgICAgXG4gICAgICB9XG4gICAgICBpZiAoJ2hlaWdodCcgaW4gb3B0aW9ucykge1xuICAgICAgICBoID0gb3B0aW9ucy5oZWlnaHRcbiAgICAgICAgXG4gICAgICB9XG4gICAgICBpZiAoJ2NoYW5uZWxzJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIGMgPSBvcHRpb25zLmNoYW5uZWxzXG4gICAgICAgIFxuICAgICAgICBoYXNDaGFubmVscyA9IHRydWVcbiAgICAgIH1cbiAgICB9XG4gICAgZmxhZ3Mud2lkdGggPSB3IHwgMFxuICAgIGZsYWdzLmhlaWdodCA9IGggfCAwXG4gICAgZmxhZ3MuY2hhbm5lbHMgPSBjIHwgMFxuXG4gICAgdmFyIGhhc0Zvcm1hdCA9IGZhbHNlXG4gICAgaWYgKCdmb3JtYXQnIGluIG9wdGlvbnMpIHtcbiAgICAgIHZhciBmb3JtYXRTdHIgPSBvcHRpb25zLmZvcm1hdFxuICAgICAgXG4gICAgICBcbiAgICAgIHZhciBpbnRlcm5hbGZvcm1hdCA9IGZsYWdzLmludGVybmFsZm9ybWF0ID0gdGV4dHVyZUZvcm1hdHNbZm9ybWF0U3RyXVxuICAgICAgZmxhZ3MuZm9ybWF0ID0gY29sb3JGb3JtYXRzW2ludGVybmFsZm9ybWF0XVxuICAgICAgaWYgKGZvcm1hdFN0ciBpbiB0ZXh0dXJlVHlwZXMpIHtcbiAgICAgICAgaWYgKCEoJ3R5cGUnIGluIG9wdGlvbnMpKSB7XG4gICAgICAgICAgZmxhZ3MudHlwZSA9IHRleHR1cmVUeXBlc1tmb3JtYXRTdHJdXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChmb3JtYXRTdHIgaW4gY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzKSB7XG4gICAgICAgIGZsYWdzLmNvbXByZXNzZWQgPSB0cnVlXG4gICAgICB9XG4gICAgICBoYXNGb3JtYXQgPSB0cnVlXG4gICAgfVxuXG4gICAgLy8gUmVjb25jaWxlIGNoYW5uZWxzIGFuZCBmb3JtYXRcbiAgICBpZiAoIWhhc0NoYW5uZWxzICYmIGhhc0Zvcm1hdCkge1xuICAgICAgZmxhZ3MuY2hhbm5lbHMgPSBGT1JNQVRfQ0hBTk5FTFNbZmxhZ3MuZm9ybWF0XVxuICAgIH0gZWxzZSBpZiAoaGFzQ2hhbm5lbHMgJiYgIWhhc0Zvcm1hdCkge1xuICAgICAgaWYgKGZsYWdzLmNoYW5uZWxzICE9PSBDSEFOTkVMU19GT1JNQVRbZmxhZ3MuZm9ybWF0XSkge1xuICAgICAgICBmbGFncy5mb3JtYXQgPSBmbGFncy5pbnRlcm5hbGZvcm1hdCA9IENIQU5ORUxTX0ZPUk1BVFtmbGFncy5jaGFubmVsc11cbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGhhc0Zvcm1hdCAmJiBoYXNDaGFubmVscykge1xuICAgICAgXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc2V0RmxhZ3MgKGZsYWdzKSB7XG4gICAgZ2wucGl4ZWxTdG9yZWkoR0xfVU5QQUNLX0ZMSVBfWV9XRUJHTCwgZmxhZ3MuZmxpcFkpXG4gICAgZ2wucGl4ZWxTdG9yZWkoR0xfVU5QQUNLX1BSRU1VTFRJUExZX0FMUEhBX1dFQkdMLCBmbGFncy5wcmVtdWx0aXBseUFscGhhKVxuICAgIGdsLnBpeGVsU3RvcmVpKEdMX1VOUEFDS19DT0xPUlNQQUNFX0NPTlZFUlNJT05fV0VCR0wsIGZsYWdzLmNvbG9yU3BhY2UpXG4gICAgZ2wucGl4ZWxTdG9yZWkoR0xfVU5QQUNLX0FMSUdOTUVOVCwgZmxhZ3MudW5wYWNrQWxpZ25tZW50KVxuICB9XG5cbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAvLyBUZXggaW1hZ2UgZGF0YVxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIGZ1bmN0aW9uIFRleEltYWdlICgpIHtcbiAgICBUZXhGbGFncy5jYWxsKHRoaXMpXG5cbiAgICB0aGlzLnhPZmZzZXQgPSAwXG4gICAgdGhpcy55T2Zmc2V0ID0gMFxuXG4gICAgLy8gZGF0YVxuICAgIHRoaXMuZGF0YSA9IG51bGxcbiAgICB0aGlzLm5lZWRzRnJlZSA9IGZhbHNlXG5cbiAgICAvLyBodG1sIGVsZW1lbnRcbiAgICB0aGlzLmVsZW1lbnQgPSBudWxsXG5cbiAgICAvLyBjb3B5VGV4SW1hZ2UgaW5mb1xuICAgIHRoaXMubmVlZHNDb3B5ID0gZmFsc2VcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlSW1hZ2UgKGltYWdlLCBvcHRpb25zKSB7XG4gICAgdmFyIGRhdGEgPSBudWxsXG4gICAgaWYgKGlzUGl4ZWxEYXRhKG9wdGlvbnMpKSB7XG4gICAgICBkYXRhID0gb3B0aW9uc1xuICAgIH0gZWxzZSBpZiAob3B0aW9ucykge1xuICAgICAgXG4gICAgICBwYXJzZUZsYWdzKGltYWdlLCBvcHRpb25zKVxuICAgICAgaWYgKCd4JyBpbiBvcHRpb25zKSB7XG4gICAgICAgIGltYWdlLnhPZmZzZXQgPSBvcHRpb25zLnggfCAwXG4gICAgICB9XG4gICAgICBpZiAoJ3knIGluIG9wdGlvbnMpIHtcbiAgICAgICAgaW1hZ2UueU9mZnNldCA9IG9wdGlvbnMueSB8IDBcbiAgICAgIH1cbiAgICAgIGlmIChpc1BpeGVsRGF0YShvcHRpb25zLmRhdGEpKSB7XG4gICAgICAgIGRhdGEgPSBvcHRpb25zLmRhdGFcbiAgICAgIH1cbiAgICB9XG5cbiAgICBcblxuICAgIGlmIChvcHRpb25zLmNvcHkpIHtcbiAgICAgIFxuICAgICAgdmFyIHZpZXdXID0gY29udGV4dFN0YXRlLnZpZXdwb3J0V2lkdGhcbiAgICAgIHZhciB2aWV3SCA9IGNvbnRleHRTdGF0ZS52aWV3cG9ydEhlaWdodFxuICAgICAgaW1hZ2Uud2lkdGggPSBpbWFnZS53aWR0aCB8fCAodmlld1cgLSBpbWFnZS54T2Zmc2V0KVxuICAgICAgaW1hZ2UuaGVpZ2h0ID0gaW1hZ2UuaGVpZ2h0IHx8ICh2aWV3SCAtIGltYWdlLnlPZmZzZXQpXG4gICAgICBpbWFnZS5uZWVkc0NvcHkgPSB0cnVlXG4gICAgICBcbiAgICB9IGVsc2UgaWYgKCFkYXRhKSB7XG4gICAgICBpbWFnZS53aWR0aCA9IGltYWdlLndpZHRoIHx8IDFcbiAgICAgIGltYWdlLmhlaWdodCA9IGltYWdlLmhlaWdodCB8fCAxXG4gICAgICBpbWFnZS5jaGFubmVscyA9IGltYWdlLmNoYW5uZWxzIHx8IDRcbiAgICB9IGVsc2UgaWYgKGlzVHlwZWRBcnJheShkYXRhKSkge1xuICAgICAgaW1hZ2UuY2hhbm5lbHMgPSBpbWFnZS5jaGFubmVscyB8fCA0XG4gICAgICBpbWFnZS5kYXRhID0gZGF0YVxuICAgICAgaWYgKCEoJ3R5cGUnIGluIG9wdGlvbnMpICYmIGltYWdlLnR5cGUgPT09IEdMX1VOU0lHTkVEX0JZVEUpIHtcbiAgICAgICAgaW1hZ2UudHlwZSA9IHR5cGVkQXJyYXlDb2RlKGRhdGEpXG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChpc051bWVyaWNBcnJheShkYXRhKSkge1xuICAgICAgaW1hZ2UuY2hhbm5lbHMgPSBpbWFnZS5jaGFubmVscyB8fCA0XG4gICAgICBjb252ZXJ0RGF0YShpbWFnZSwgZGF0YSlcbiAgICAgIGltYWdlLmFsaWdubWVudCA9IDFcbiAgICAgIGltYWdlLm5lZWRzRnJlZSA9IHRydWVcbiAgICB9IGVsc2UgaWYgKGlzTkRBcnJheUxpa2UoZGF0YSkpIHtcbiAgICAgIHZhciBhcnJheSA9IGRhdGEuZGF0YVxuICAgICAgaWYgKCFBcnJheS5pc0FycmF5KGFycmF5KSAmJiBpbWFnZS50eXBlID09PSBHTF9VTlNJR05FRF9CWVRFKSB7XG4gICAgICAgIGltYWdlLnR5cGUgPSB0eXBlZEFycmF5Q29kZShhcnJheSlcbiAgICAgIH1cbiAgICAgIHZhciBzaGFwZSA9IGRhdGEuc2hhcGVcbiAgICAgIHZhciBzdHJpZGUgPSBkYXRhLnN0cmlkZVxuICAgICAgdmFyIHNoYXBlWCwgc2hhcGVZLCBzaGFwZUMsIHN0cmlkZVgsIHN0cmlkZVksIHN0cmlkZUNcbiAgICAgIGlmIChzaGFwZS5sZW5ndGggPT09IDMpIHtcbiAgICAgICAgc2hhcGVDID0gc2hhcGVbMl1cbiAgICAgICAgc3RyaWRlQyA9IHN0cmlkZVsyXVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgXG4gICAgICAgIHNoYXBlQyA9IDFcbiAgICAgICAgc3RyaWRlQyA9IDFcbiAgICAgIH1cbiAgICAgIHNoYXBlWCA9IHNoYXBlWzBdXG4gICAgICBzaGFwZVkgPSBzaGFwZVsxXVxuICAgICAgc3RyaWRlWCA9IHN0cmlkZVswXVxuICAgICAgc3RyaWRlWSA9IHN0cmlkZVsxXVxuICAgICAgaW1hZ2UuYWxpZ25tZW50ID0gMVxuICAgICAgaW1hZ2Uud2lkdGggPSBzaGFwZVhcbiAgICAgIGltYWdlLmhlaWdodCA9IHNoYXBlWVxuICAgICAgaW1hZ2UuY2hhbm5lbHMgPSBzaGFwZUNcbiAgICAgIGltYWdlLmZvcm1hdCA9IGltYWdlLmludGVybmFsZm9ybWF0ID0gQ0hBTk5FTFNfRk9STUFUW3NoYXBlQ11cbiAgICAgIGltYWdlLm5lZWRzRnJlZSA9IHRydWVcbiAgICAgIHRyYW5zcG9zZURhdGEoaW1hZ2UsIGFycmF5LCBzdHJpZGVYLCBzdHJpZGVZLCBzdHJpZGVDLCBkYXRhLm9mZnNldClcbiAgICB9IGVsc2UgaWYgKGlzQ2FudmFzRWxlbWVudChkYXRhKSB8fCBpc0NvbnRleHQyRChkYXRhKSkge1xuICAgICAgaWYgKGlzQ2FudmFzRWxlbWVudChkYXRhKSkge1xuICAgICAgICBpbWFnZS5lbGVtZW50ID0gZGF0YVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaW1hZ2UuZWxlbWVudCA9IGRhdGEuY2FudmFzXG4gICAgICB9XG4gICAgICBpbWFnZS53aWR0aCA9IGltYWdlLmVsZW1lbnQud2lkdGhcbiAgICAgIGltYWdlLmhlaWdodCA9IGltYWdlLmVsZW1lbnQuaGVpZ2h0XG4gICAgICBpbWFnZS5jaGFubmVscyA9IDRcbiAgICB9IGVsc2UgaWYgKGlzSW1hZ2VFbGVtZW50KGRhdGEpKSB7XG4gICAgICBpbWFnZS5lbGVtZW50ID0gZGF0YVxuICAgICAgaW1hZ2Uud2lkdGggPSBkYXRhLm5hdHVyYWxXaWR0aFxuICAgICAgaW1hZ2UuaGVpZ2h0ID0gZGF0YS5uYXR1cmFsSGVpZ2h0XG4gICAgICBpbWFnZS5jaGFubmVscyA9IDRcbiAgICB9IGVsc2UgaWYgKGlzVmlkZW9FbGVtZW50KGRhdGEpKSB7XG4gICAgICBpbWFnZS5lbGVtZW50ID0gZGF0YVxuICAgICAgaW1hZ2Uud2lkdGggPSBkYXRhLnZpZGVvV2lkdGhcbiAgICAgIGltYWdlLmhlaWdodCA9IGRhdGEudmlkZW9IZWlnaHRcbiAgICAgIGltYWdlLmNoYW5uZWxzID0gNFxuICAgIH0gZWxzZSBpZiAoaXNSZWN0QXJyYXkoZGF0YSkpIHtcbiAgICAgIHZhciB3ID0gaW1hZ2Uud2lkdGggfHwgZGF0YVswXS5sZW5ndGhcbiAgICAgIHZhciBoID0gaW1hZ2UuaGVpZ2h0IHx8IGRhdGEubGVuZ3RoXG4gICAgICB2YXIgYyA9IGltYWdlLmNoYW5uZWxzXG4gICAgICBpZiAoaXNBcnJheUxpa2UoZGF0YVswXVswXSkpIHtcbiAgICAgICAgYyA9IGMgfHwgZGF0YVswXVswXS5sZW5ndGhcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGMgPSBjIHx8IDFcbiAgICAgIH1cbiAgICAgIHZhciBhcnJheVNoYXBlID0gZmxhdHRlblV0aWxzLnNoYXBlKGRhdGEpXG4gICAgICB2YXIgbiA9IDFcbiAgICAgIGZvciAodmFyIGRkID0gMDsgZGQgPCBhcnJheVNoYXBlLmxlbmd0aDsgKytkZCkge1xuICAgICAgICBuICo9IGFycmF5U2hhcGVbZGRdXG4gICAgICB9XG4gICAgICB2YXIgYWxsb2NEYXRhID0gcHJlQ29udmVydChpbWFnZSwgbilcbiAgICAgIGZsYXR0ZW5VdGlscy5mbGF0dGVuKGRhdGEsIGFycmF5U2hhcGUsICcnLCBhbGxvY0RhdGEpXG4gICAgICBwb3N0Q29udmVydChpbWFnZSwgYWxsb2NEYXRhKVxuICAgICAgaW1hZ2UuYWxpZ25tZW50ID0gMVxuICAgICAgaW1hZ2Uud2lkdGggPSB3XG4gICAgICBpbWFnZS5oZWlnaHQgPSBoXG4gICAgICBpbWFnZS5jaGFubmVscyA9IGNcbiAgICAgIGltYWdlLmZvcm1hdCA9IGltYWdlLmludGVybmFsZm9ybWF0ID0gQ0hBTk5FTFNfRk9STUFUW2NdXG4gICAgICBpbWFnZS5uZWVkc0ZyZWUgPSB0cnVlXG4gICAgfVxuXG4gICAgaWYgKGltYWdlLnR5cGUgPT09IEdMX0ZMT0FUKSB7XG4gICAgICBcbiAgICB9IGVsc2UgaWYgKGltYWdlLnR5cGUgPT09IEdMX0hBTEZfRkxPQVRfT0VTKSB7XG4gICAgICBcbiAgICB9XG5cbiAgICAvLyBkbyBjb21wcmVzc2VkIHRleHR1cmUgIHZhbGlkYXRpb24gaGVyZS5cbiAgfVxuXG4gIGZ1bmN0aW9uIHNldEltYWdlIChpbmZvLCB0YXJnZXQsIG1pcGxldmVsKSB7XG4gICAgdmFyIGVsZW1lbnQgPSBpbmZvLmVsZW1lbnRcbiAgICB2YXIgZGF0YSA9IGluZm8uZGF0YVxuICAgIHZhciBpbnRlcm5hbGZvcm1hdCA9IGluZm8uaW50ZXJuYWxmb3JtYXRcbiAgICB2YXIgZm9ybWF0ID0gaW5mby5mb3JtYXRcbiAgICB2YXIgdHlwZSA9IGluZm8udHlwZVxuICAgIHZhciB3aWR0aCA9IGluZm8ud2lkdGhcbiAgICB2YXIgaGVpZ2h0ID0gaW5mby5oZWlnaHRcblxuICAgIHNldEZsYWdzKGluZm8pXG5cbiAgICBpZiAoZWxlbWVudCkge1xuICAgICAgZ2wudGV4SW1hZ2UyRCh0YXJnZXQsIG1pcGxldmVsLCBmb3JtYXQsIGZvcm1hdCwgdHlwZSwgZWxlbWVudClcbiAgICB9IGVsc2UgaWYgKGluZm8uY29tcHJlc3NlZCkge1xuICAgICAgZ2wuY29tcHJlc3NlZFRleEltYWdlMkQodGFyZ2V0LCBtaXBsZXZlbCwgaW50ZXJuYWxmb3JtYXQsIHdpZHRoLCBoZWlnaHQsIDAsIGRhdGEpXG4gICAgfSBlbHNlIGlmIChpbmZvLm5lZWRzQ29weSkge1xuICAgICAgcmVnbFBvbGwoKVxuICAgICAgZ2wuY29weVRleEltYWdlMkQoXG4gICAgICAgIHRhcmdldCwgbWlwbGV2ZWwsIGZvcm1hdCwgaW5mby54T2Zmc2V0LCBpbmZvLnlPZmZzZXQsIHdpZHRoLCBoZWlnaHQsIDApXG4gICAgfSBlbHNlIHtcbiAgICAgIGdsLnRleEltYWdlMkQoXG4gICAgICAgIHRhcmdldCwgbWlwbGV2ZWwsIGZvcm1hdCwgd2lkdGgsIGhlaWdodCwgMCwgZm9ybWF0LCB0eXBlLCBkYXRhKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHNldFN1YkltYWdlIChpbmZvLCB0YXJnZXQsIHgsIHksIG1pcGxldmVsKSB7XG4gICAgdmFyIGVsZW1lbnQgPSBpbmZvLmVsZW1lbnRcbiAgICB2YXIgZGF0YSA9IGluZm8uZGF0YVxuICAgIHZhciBpbnRlcm5hbGZvcm1hdCA9IGluZm8uaW50ZXJuYWxmb3JtYXRcbiAgICB2YXIgZm9ybWF0ID0gaW5mby5mb3JtYXRcbiAgICB2YXIgdHlwZSA9IGluZm8udHlwZVxuICAgIHZhciB3aWR0aCA9IGluZm8ud2lkdGhcbiAgICB2YXIgaGVpZ2h0ID0gaW5mby5oZWlnaHRcblxuICAgIHNldEZsYWdzKGluZm8pXG5cbiAgICBpZiAoZWxlbWVudCkge1xuICAgICAgZ2wudGV4U3ViSW1hZ2UyRChcbiAgICAgICAgdGFyZ2V0LCBtaXBsZXZlbCwgeCwgeSwgZm9ybWF0LCB0eXBlLCBlbGVtZW50KVxuICAgIH0gZWxzZSBpZiAoaW5mby5jb21wcmVzc2VkKSB7XG4gICAgICBnbC5jb21wcmVzc2VkVGV4U3ViSW1hZ2UyRChcbiAgICAgICAgdGFyZ2V0LCBtaXBsZXZlbCwgeCwgeSwgaW50ZXJuYWxmb3JtYXQsIHdpZHRoLCBoZWlnaHQsIGRhdGEpXG4gICAgfSBlbHNlIGlmIChpbmZvLm5lZWRzQ29weSkge1xuICAgICAgcmVnbFBvbGwoKVxuICAgICAgZ2wuY29weVRleFN1YkltYWdlMkQoXG4gICAgICAgIHRhcmdldCwgbWlwbGV2ZWwsIHgsIHksIGluZm8ueE9mZnNldCwgaW5mby55T2Zmc2V0LCB3aWR0aCwgaGVpZ2h0KVxuICAgIH0gZWxzZSB7XG4gICAgICBnbC50ZXhTdWJJbWFnZTJEKFxuICAgICAgICB0YXJnZXQsIG1pcGxldmVsLCB4LCB5LCB3aWR0aCwgaGVpZ2h0LCBmb3JtYXQsIHR5cGUsIGRhdGEpXG4gICAgfVxuICB9XG5cbiAgLy8gdGV4SW1hZ2UgcG9vbFxuICB2YXIgaW1hZ2VQb29sID0gW11cblxuICBmdW5jdGlvbiBhbGxvY0ltYWdlICgpIHtcbiAgICByZXR1cm4gaW1hZ2VQb29sLnBvcCgpIHx8IG5ldyBUZXhJbWFnZSgpXG4gIH1cblxuICBmdW5jdGlvbiBmcmVlSW1hZ2UgKGltYWdlKSB7XG4gICAgaWYgKGltYWdlLm5lZWRzRnJlZSkge1xuICAgICAgcG9vbC5mcmVlVHlwZShpbWFnZS5kYXRhKVxuICAgIH1cbiAgICBUZXhJbWFnZS5jYWxsKGltYWdlKVxuICAgIGltYWdlUG9vbC5wdXNoKGltYWdlKVxuICB9XG5cbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAvLyBNaXAgbWFwXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgZnVuY3Rpb24gTWlwTWFwICgpIHtcbiAgICBUZXhGbGFncy5jYWxsKHRoaXMpXG5cbiAgICB0aGlzLmdlbk1pcG1hcHMgPSBmYWxzZVxuICAgIHRoaXMubWlwbWFwSGludCA9IEdMX0RPTlRfQ0FSRVxuICAgIHRoaXMubWlwbWFzayA9IDBcbiAgICB0aGlzLmltYWdlcyA9IEFycmF5KDE2KVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VNaXBNYXBGcm9tU2hhcGUgKG1pcG1hcCwgd2lkdGgsIGhlaWdodCkge1xuICAgIHZhciBpbWcgPSBtaXBtYXAuaW1hZ2VzWzBdID0gYWxsb2NJbWFnZSgpXG4gICAgbWlwbWFwLm1pcG1hc2sgPSAxXG4gICAgaW1nLndpZHRoID0gbWlwbWFwLndpZHRoID0gd2lkdGhcbiAgICBpbWcuaGVpZ2h0ID0gbWlwbWFwLmhlaWdodCA9IGhlaWdodFxuICAgIGltZy5jaGFubmVscyA9IG1pcG1hcC5jaGFubmVscyA9IDRcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlTWlwTWFwRnJvbU9iamVjdCAobWlwbWFwLCBvcHRpb25zKSB7XG4gICAgdmFyIGltZ0RhdGEgPSBudWxsXG4gICAgaWYgKGlzUGl4ZWxEYXRhKG9wdGlvbnMpKSB7XG4gICAgICBpbWdEYXRhID0gbWlwbWFwLmltYWdlc1swXSA9IGFsbG9jSW1hZ2UoKVxuICAgICAgY29weUZsYWdzKGltZ0RhdGEsIG1pcG1hcClcbiAgICAgIHBhcnNlSW1hZ2UoaW1nRGF0YSwgb3B0aW9ucylcbiAgICAgIG1pcG1hcC5taXBtYXNrID0gMVxuICAgIH0gZWxzZSB7XG4gICAgICBwYXJzZUZsYWdzKG1pcG1hcCwgb3B0aW9ucylcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KG9wdGlvbnMubWlwbWFwKSkge1xuICAgICAgICB2YXIgbWlwRGF0YSA9IG9wdGlvbnMubWlwbWFwXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbWlwRGF0YS5sZW5ndGg7ICsraSkge1xuICAgICAgICAgIGltZ0RhdGEgPSBtaXBtYXAuaW1hZ2VzW2ldID0gYWxsb2NJbWFnZSgpXG4gICAgICAgICAgY29weUZsYWdzKGltZ0RhdGEsIG1pcG1hcClcbiAgICAgICAgICBpbWdEYXRhLndpZHRoID4+PSBpXG4gICAgICAgICAgaW1nRGF0YS5oZWlnaHQgPj49IGlcbiAgICAgICAgICBwYXJzZUltYWdlKGltZ0RhdGEsIG1pcERhdGFbaV0pXG4gICAgICAgICAgbWlwbWFwLm1pcG1hc2sgfD0gKDEgPDwgaSlcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaW1nRGF0YSA9IG1pcG1hcC5pbWFnZXNbMF0gPSBhbGxvY0ltYWdlKClcbiAgICAgICAgY29weUZsYWdzKGltZ0RhdGEsIG1pcG1hcClcbiAgICAgICAgcGFyc2VJbWFnZShpbWdEYXRhLCBvcHRpb25zKVxuICAgICAgICBtaXBtYXAubWlwbWFzayA9IDFcbiAgICAgIH1cbiAgICB9XG4gICAgY29weUZsYWdzKG1pcG1hcCwgbWlwbWFwLmltYWdlc1swXSlcblxuICAgIC8vIEZvciB0ZXh0dXJlcyBvZiB0aGUgY29tcHJlc3NlZCBmb3JtYXQgV0VCR0xfY29tcHJlc3NlZF90ZXh0dXJlX3MzdGNcbiAgICAvLyB3ZSBtdXN0IGhhdmUgdGhhdFxuICAgIC8vXG4gICAgLy8gXCJXaGVuIGxldmVsIGVxdWFscyB6ZXJvIHdpZHRoIGFuZCBoZWlnaHQgbXVzdCBiZSBhIG11bHRpcGxlIG9mIDQuXG4gICAgLy8gV2hlbiBsZXZlbCBpcyBncmVhdGVyIHRoYW4gMCB3aWR0aCBhbmQgaGVpZ2h0IG11c3QgYmUgMCwgMSwgMiBvciBhIG11bHRpcGxlIG9mIDQuIFwiXG4gICAgLy9cbiAgICAvLyBidXQgd2UgZG8gbm90IHlldCBzdXBwb3J0IGhhdmluZyBtdWx0aXBsZSBtaXBtYXAgbGV2ZWxzIGZvciBjb21wcmVzc2VkIHRleHR1cmVzLFxuICAgIC8vIHNvIHdlIG9ubHkgdGVzdCBmb3IgbGV2ZWwgemVyby5cblxuICAgIGlmIChtaXBtYXAuY29tcHJlc3NlZCAmJlxuICAgICAgICAobWlwbWFwLmludGVybmFsZm9ybWF0ID09PSBHTF9DT01QUkVTU0VEX1JHQl9TM1RDX0RYVDFfRVhUKSB8fFxuICAgICAgICAobWlwbWFwLmludGVybmFsZm9ybWF0ID09PSBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQxX0VYVCkgfHxcbiAgICAgICAgKG1pcG1hcC5pbnRlcm5hbGZvcm1hdCA9PT0gR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUM19FWFQpIHx8XG4gICAgICAgIChtaXBtYXAuaW50ZXJuYWxmb3JtYXQgPT09IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDVfRVhUKSkge1xuICAgICAgXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc2V0TWlwTWFwIChtaXBtYXAsIHRhcmdldCkge1xuICAgIHZhciBpbWFnZXMgPSBtaXBtYXAuaW1hZ2VzXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBpbWFnZXMubGVuZ3RoOyArK2kpIHtcbiAgICAgIGlmICghaW1hZ2VzW2ldKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgc2V0SW1hZ2UoaW1hZ2VzW2ldLCB0YXJnZXQsIGkpXG4gICAgfVxuICB9XG5cbiAgdmFyIG1pcFBvb2wgPSBbXVxuXG4gIGZ1bmN0aW9uIGFsbG9jTWlwTWFwICgpIHtcbiAgICB2YXIgcmVzdWx0ID0gbWlwUG9vbC5wb3AoKSB8fCBuZXcgTWlwTWFwKClcbiAgICBUZXhGbGFncy5jYWxsKHJlc3VsdClcbiAgICByZXN1bHQubWlwbWFzayA9IDBcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IDE2OyArK2kpIHtcbiAgICAgIHJlc3VsdC5pbWFnZXNbaV0gPSBudWxsXG4gICAgfVxuICAgIHJldHVybiByZXN1bHRcbiAgfVxuXG4gIGZ1bmN0aW9uIGZyZWVNaXBNYXAgKG1pcG1hcCkge1xuICAgIHZhciBpbWFnZXMgPSBtaXBtYXAuaW1hZ2VzXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBpbWFnZXMubGVuZ3RoOyArK2kpIHtcbiAgICAgIGlmIChpbWFnZXNbaV0pIHtcbiAgICAgICAgZnJlZUltYWdlKGltYWdlc1tpXSlcbiAgICAgIH1cbiAgICAgIGltYWdlc1tpXSA9IG51bGxcbiAgICB9XG4gICAgbWlwUG9vbC5wdXNoKG1pcG1hcClcbiAgfVxuXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gVGV4IGluZm9cbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICBmdW5jdGlvbiBUZXhJbmZvICgpIHtcbiAgICB0aGlzLm1pbkZpbHRlciA9IEdMX05FQVJFU1RcbiAgICB0aGlzLm1hZ0ZpbHRlciA9IEdMX05FQVJFU1RcblxuICAgIHRoaXMud3JhcFMgPSBHTF9DTEFNUF9UT19FREdFXG4gICAgdGhpcy53cmFwVCA9IEdMX0NMQU1QX1RPX0VER0VcblxuICAgIHRoaXMuYW5pc290cm9waWMgPSAxXG5cbiAgICB0aGlzLmdlbk1pcG1hcHMgPSBmYWxzZVxuICAgIHRoaXMubWlwbWFwSGludCA9IEdMX0RPTlRfQ0FSRVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VUZXhJbmZvIChpbmZvLCBvcHRpb25zKSB7XG4gICAgaWYgKCdtaW4nIGluIG9wdGlvbnMpIHtcbiAgICAgIHZhciBtaW5GaWx0ZXIgPSBvcHRpb25zLm1pblxuICAgICAgXG4gICAgICBpbmZvLm1pbkZpbHRlciA9IG1pbkZpbHRlcnNbbWluRmlsdGVyXVxuICAgICAgaWYgKE1JUE1BUF9GSUxURVJTLmluZGV4T2YoaW5mby5taW5GaWx0ZXIpID49IDApIHtcbiAgICAgICAgaW5mby5nZW5NaXBtYXBzID0gdHJ1ZVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmICgnbWFnJyBpbiBvcHRpb25zKSB7XG4gICAgICB2YXIgbWFnRmlsdGVyID0gb3B0aW9ucy5tYWdcbiAgICAgIFxuICAgICAgaW5mby5tYWdGaWx0ZXIgPSBtYWdGaWx0ZXJzW21hZ0ZpbHRlcl1cbiAgICB9XG5cbiAgICB2YXIgd3JhcFMgPSBpbmZvLndyYXBTXG4gICAgdmFyIHdyYXBUID0gaW5mby53cmFwVFxuICAgIGlmICgnd3JhcCcgaW4gb3B0aW9ucykge1xuICAgICAgdmFyIHdyYXAgPSBvcHRpb25zLndyYXBcbiAgICAgIGlmICh0eXBlb2Ygd3JhcCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgXG4gICAgICAgIHdyYXBTID0gd3JhcFQgPSB3cmFwTW9kZXNbd3JhcF1cbiAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheSh3cmFwKSkge1xuICAgICAgICBcbiAgICAgICAgXG4gICAgICAgIHdyYXBTID0gd3JhcE1vZGVzW3dyYXBbMF1dXG4gICAgICAgIHdyYXBUID0gd3JhcE1vZGVzW3dyYXBbMV1dXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmICgnd3JhcFMnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIG9wdFdyYXBTID0gb3B0aW9ucy53cmFwU1xuICAgICAgICBcbiAgICAgICAgd3JhcFMgPSB3cmFwTW9kZXNbb3B0V3JhcFNdXG4gICAgICB9XG4gICAgICBpZiAoJ3dyYXBUJyBpbiBvcHRpb25zKSB7XG4gICAgICAgIHZhciBvcHRXcmFwVCA9IG9wdGlvbnMud3JhcFRcbiAgICAgICAgXG4gICAgICAgIHdyYXBUID0gd3JhcE1vZGVzW29wdFdyYXBUXVxuICAgICAgfVxuICAgIH1cbiAgICBpbmZvLndyYXBTID0gd3JhcFNcbiAgICBpbmZvLndyYXBUID0gd3JhcFRcblxuICAgIGlmICgnYW5pc290cm9waWMnIGluIG9wdGlvbnMpIHtcbiAgICAgIHZhciBhbmlzb3Ryb3BpYyA9IG9wdGlvbnMuYW5pc290cm9waWNcbiAgICAgIFxuICAgICAgaW5mby5hbmlzb3Ryb3BpYyA9IG9wdGlvbnMuYW5pc290cm9waWNcbiAgICB9XG5cbiAgICBpZiAoJ21pcG1hcCcgaW4gb3B0aW9ucykge1xuICAgICAgdmFyIGhhc01pcE1hcCA9IGZhbHNlXG4gICAgICBzd2l0Y2ggKHR5cGVvZiBvcHRpb25zLm1pcG1hcCkge1xuICAgICAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgICAgIFxuICAgICAgICAgIGluZm8ubWlwbWFwSGludCA9IG1pcG1hcEhpbnRbb3B0aW9ucy5taXBtYXBdXG4gICAgICAgICAgaW5mby5nZW5NaXBtYXBzID0gdHJ1ZVxuICAgICAgICAgIGhhc01pcE1hcCA9IHRydWVcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgICAgIGhhc01pcE1hcCA9IGluZm8uZ2VuTWlwbWFwcyA9IG9wdGlvbnMubWlwbWFwXG4gICAgICAgICAgYnJlYWtcblxuICAgICAgICBjYXNlICdvYmplY3QnOlxuICAgICAgICAgIFxuICAgICAgICAgIGluZm8uZ2VuTWlwbWFwcyA9IGZhbHNlXG4gICAgICAgICAgaGFzTWlwTWFwID0gdHJ1ZVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICBcbiAgICAgIH1cbiAgICAgIGlmIChoYXNNaXBNYXAgJiYgISgnbWluJyBpbiBvcHRpb25zKSkge1xuICAgICAgICBpbmZvLm1pbkZpbHRlciA9IEdMX05FQVJFU1RfTUlQTUFQX05FQVJFU1RcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzZXRUZXhJbmZvIChpbmZvLCB0YXJnZXQpIHtcbiAgICBnbC50ZXhQYXJhbWV0ZXJpKHRhcmdldCwgR0xfVEVYVFVSRV9NSU5fRklMVEVSLCBpbmZvLm1pbkZpbHRlcilcbiAgICBnbC50ZXhQYXJhbWV0ZXJpKHRhcmdldCwgR0xfVEVYVFVSRV9NQUdfRklMVEVSLCBpbmZvLm1hZ0ZpbHRlcilcbiAgICBnbC50ZXhQYXJhbWV0ZXJpKHRhcmdldCwgR0xfVEVYVFVSRV9XUkFQX1MsIGluZm8ud3JhcFMpXG4gICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfV1JBUF9ULCBpbmZvLndyYXBUKVxuICAgIGlmIChleHRlbnNpb25zLmV4dF90ZXh0dXJlX2ZpbHRlcl9hbmlzb3Ryb3BpYykge1xuICAgICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfTUFYX0FOSVNPVFJPUFlfRVhULCBpbmZvLmFuaXNvdHJvcGljKVxuICAgIH1cbiAgICBpZiAoaW5mby5nZW5NaXBtYXBzKSB7XG4gICAgICBnbC5oaW50KEdMX0dFTkVSQVRFX01JUE1BUF9ISU5ULCBpbmZvLm1pcG1hcEhpbnQpXG4gICAgICBnbC5nZW5lcmF0ZU1pcG1hcCh0YXJnZXQpXG4gICAgfVxuICB9XG5cbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAvLyBGdWxsIHRleHR1cmUgb2JqZWN0XG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgdmFyIHRleHR1cmVDb3VudCA9IDBcbiAgdmFyIHRleHR1cmVTZXQgPSB7fVxuICB2YXIgbnVtVGV4VW5pdHMgPSBsaW1pdHMubWF4VGV4dHVyZVVuaXRzXG4gIHZhciB0ZXh0dXJlVW5pdHMgPSBBcnJheShudW1UZXhVbml0cykubWFwKGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gbnVsbFxuICB9KVxuXG4gIGZ1bmN0aW9uIFJFR0xUZXh0dXJlICh0YXJnZXQpIHtcbiAgICBUZXhGbGFncy5jYWxsKHRoaXMpXG4gICAgdGhpcy5taXBtYXNrID0gMFxuICAgIHRoaXMuaW50ZXJuYWxmb3JtYXQgPSBHTF9SR0JBXG5cbiAgICB0aGlzLmlkID0gdGV4dHVyZUNvdW50KytcblxuICAgIHRoaXMucmVmQ291bnQgPSAxXG5cbiAgICB0aGlzLnRhcmdldCA9IHRhcmdldFxuICAgIHRoaXMudGV4dHVyZSA9IGdsLmNyZWF0ZVRleHR1cmUoKVxuXG4gICAgdGhpcy51bml0ID0gLTFcbiAgICB0aGlzLmJpbmRDb3VudCA9IDBcblxuICAgIHRoaXMudGV4SW5mbyA9IG5ldyBUZXhJbmZvKClcblxuICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgdGhpcy5zdGF0cyA9IHtzaXplOiAwfVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHRlbXBCaW5kICh0ZXh0dXJlKSB7XG4gICAgZ2wuYWN0aXZlVGV4dHVyZShHTF9URVhUVVJFMClcbiAgICBnbC5iaW5kVGV4dHVyZSh0ZXh0dXJlLnRhcmdldCwgdGV4dHVyZS50ZXh0dXJlKVxuICB9XG5cbiAgZnVuY3Rpb24gdGVtcFJlc3RvcmUgKCkge1xuICAgIHZhciBwcmV2ID0gdGV4dHVyZVVuaXRzWzBdXG4gICAgaWYgKHByZXYpIHtcbiAgICAgIGdsLmJpbmRUZXh0dXJlKHByZXYudGFyZ2V0LCBwcmV2LnRleHR1cmUpXG4gICAgfSBlbHNlIHtcbiAgICAgIGdsLmJpbmRUZXh0dXJlKEdMX1RFWFRVUkVfMkQsIG51bGwpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSAodGV4dHVyZSkge1xuICAgIHZhciBoYW5kbGUgPSB0ZXh0dXJlLnRleHR1cmVcbiAgICBcbiAgICB2YXIgdW5pdCA9IHRleHR1cmUudW5pdFxuICAgIHZhciB0YXJnZXQgPSB0ZXh0dXJlLnRhcmdldFxuICAgIGlmICh1bml0ID49IDApIHtcbiAgICAgIGdsLmFjdGl2ZVRleHR1cmUoR0xfVEVYVFVSRTAgKyB1bml0KVxuICAgICAgZ2wuYmluZFRleHR1cmUodGFyZ2V0LCBudWxsKVxuICAgICAgdGV4dHVyZVVuaXRzW3VuaXRdID0gbnVsbFxuICAgIH1cbiAgICBnbC5kZWxldGVUZXh0dXJlKGhhbmRsZSlcbiAgICB0ZXh0dXJlLnRleHR1cmUgPSBudWxsXG4gICAgdGV4dHVyZS5wYXJhbXMgPSBudWxsXG4gICAgdGV4dHVyZS5waXhlbHMgPSBudWxsXG4gICAgdGV4dHVyZS5yZWZDb3VudCA9IDBcbiAgICBkZWxldGUgdGV4dHVyZVNldFt0ZXh0dXJlLmlkXVxuICAgIHN0YXRzLnRleHR1cmVDb3VudC0tXG4gIH1cblxuICBleHRlbmQoUkVHTFRleHR1cmUucHJvdG90eXBlLCB7XG4gICAgYmluZDogZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIHRleHR1cmUgPSB0aGlzXG4gICAgICB0ZXh0dXJlLmJpbmRDb3VudCArPSAxXG4gICAgICB2YXIgdW5pdCA9IHRleHR1cmUudW5pdFxuICAgICAgaWYgKHVuaXQgPCAwKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbnVtVGV4VW5pdHM7ICsraSkge1xuICAgICAgICAgIHZhciBvdGhlciA9IHRleHR1cmVVbml0c1tpXVxuICAgICAgICAgIGlmIChvdGhlcikge1xuICAgICAgICAgICAgaWYgKG90aGVyLmJpbmRDb3VudCA+IDApIHtcbiAgICAgICAgICAgICAgY29udGludWVcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG90aGVyLnVuaXQgPSAtMVxuICAgICAgICAgIH1cbiAgICAgICAgICB0ZXh0dXJlVW5pdHNbaV0gPSB0ZXh0dXJlXG4gICAgICAgICAgdW5pdCA9IGlcbiAgICAgICAgICBicmVha1xuICAgICAgICB9XG4gICAgICAgIGlmICh1bml0ID49IG51bVRleFVuaXRzKSB7XG4gICAgICAgICAgXG4gICAgICAgIH1cbiAgICAgICAgaWYgKGNvbmZpZy5wcm9maWxlICYmIHN0YXRzLm1heFRleHR1cmVVbml0cyA8ICh1bml0ICsgMSkpIHtcbiAgICAgICAgICBzdGF0cy5tYXhUZXh0dXJlVW5pdHMgPSB1bml0ICsgMSAvLyArMSwgc2luY2UgdGhlIHVuaXRzIGFyZSB6ZXJvLWJhc2VkXG4gICAgICAgIH1cbiAgICAgICAgdGV4dHVyZS51bml0ID0gdW5pdFxuICAgICAgICBnbC5hY3RpdmVUZXh0dXJlKEdMX1RFWFRVUkUwICsgdW5pdClcbiAgICAgICAgZ2wuYmluZFRleHR1cmUodGV4dHVyZS50YXJnZXQsIHRleHR1cmUudGV4dHVyZSlcbiAgICAgIH1cbiAgICAgIHJldHVybiB1bml0XG4gICAgfSxcblxuICAgIHVuYmluZDogZnVuY3Rpb24gKCkge1xuICAgICAgdGhpcy5iaW5kQ291bnQgLT0gMVxuICAgIH0sXG5cbiAgICBkZWNSZWY6IGZ1bmN0aW9uICgpIHtcbiAgICAgIGlmICgtLXRoaXMucmVmQ291bnQgPD0gMCkge1xuICAgICAgICBkZXN0cm95KHRoaXMpXG4gICAgICB9XG4gICAgfVxuICB9KVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZVRleHR1cmUyRCAoYSwgYikge1xuICAgIHZhciB0ZXh0dXJlID0gbmV3IFJFR0xUZXh0dXJlKEdMX1RFWFRVUkVfMkQpXG4gICAgdGV4dHVyZVNldFt0ZXh0dXJlLmlkXSA9IHRleHR1cmVcbiAgICBzdGF0cy50ZXh0dXJlQ291bnQrK1xuXG4gICAgZnVuY3Rpb24gcmVnbFRleHR1cmUyRCAoYSwgYikge1xuICAgICAgdmFyIHRleEluZm8gPSB0ZXh0dXJlLnRleEluZm9cbiAgICAgIFRleEluZm8uY2FsbCh0ZXhJbmZvKVxuICAgICAgdmFyIG1pcERhdGEgPSBhbGxvY01pcE1hcCgpXG5cbiAgICAgIGlmICh0eXBlb2YgYSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBiID09PSAnbnVtYmVyJykge1xuICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbVNoYXBlKG1pcERhdGEsIGEgfCAwLCBiIHwgMClcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwYXJzZU1pcE1hcEZyb21TaGFwZShtaXBEYXRhLCBhIHwgMCwgYSB8IDApXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoYSkge1xuICAgICAgICBcbiAgICAgICAgcGFyc2VUZXhJbmZvKHRleEluZm8sIGEpXG4gICAgICAgIHBhcnNlTWlwTWFwRnJvbU9iamVjdChtaXBEYXRhLCBhKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gZW1wdHkgdGV4dHVyZXMgZ2V0IGFzc2lnbmVkIGEgZGVmYXVsdCBzaGFwZSBvZiAxeDFcbiAgICAgICAgcGFyc2VNaXBNYXBGcm9tU2hhcGUobWlwRGF0YSwgMSwgMSlcbiAgICAgIH1cblxuICAgICAgaWYgKHRleEluZm8uZ2VuTWlwbWFwcykge1xuICAgICAgICBtaXBEYXRhLm1pcG1hc2sgPSAobWlwRGF0YS53aWR0aCA8PCAxKSAtIDFcbiAgICAgIH1cbiAgICAgIHRleHR1cmUubWlwbWFzayA9IG1pcERhdGEubWlwbWFza1xuXG4gICAgICBjb3B5RmxhZ3ModGV4dHVyZSwgbWlwRGF0YSlcblxuICAgICAgXG4gICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0ID0gbWlwRGF0YS5pbnRlcm5hbGZvcm1hdFxuXG4gICAgICByZWdsVGV4dHVyZTJELndpZHRoID0gbWlwRGF0YS53aWR0aFxuICAgICAgcmVnbFRleHR1cmUyRC5oZWlnaHQgPSBtaXBEYXRhLmhlaWdodFxuXG4gICAgICB0ZW1wQmluZCh0ZXh0dXJlKVxuICAgICAgc2V0TWlwTWFwKG1pcERhdGEsIEdMX1RFWFRVUkVfMkQpXG4gICAgICBzZXRUZXhJbmZvKHRleEluZm8sIEdMX1RFWFRVUkVfMkQpXG4gICAgICB0ZW1wUmVzdG9yZSgpXG5cbiAgICAgIGZyZWVNaXBNYXAobWlwRGF0YSlcblxuICAgICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICAgIHRleHR1cmUuc3RhdHMuc2l6ZSA9IGdldFRleHR1cmVTaXplKFxuICAgICAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQsXG4gICAgICAgICAgdGV4dHVyZS50eXBlLFxuICAgICAgICAgIG1pcERhdGEud2lkdGgsXG4gICAgICAgICAgbWlwRGF0YS5oZWlnaHQsXG4gICAgICAgICAgdGV4SW5mby5nZW5NaXBtYXBzLFxuICAgICAgICAgIGZhbHNlKVxuICAgICAgfVxuICAgICAgcmVnbFRleHR1cmUyRC5mb3JtYXQgPSB0ZXh0dXJlRm9ybWF0c0ludmVydFt0ZXh0dXJlLmludGVybmFsZm9ybWF0XVxuICAgICAgcmVnbFRleHR1cmUyRC50eXBlID0gdGV4dHVyZVR5cGVzSW52ZXJ0W3RleHR1cmUudHlwZV1cblxuICAgICAgcmVnbFRleHR1cmUyRC5tYWcgPSBtYWdGaWx0ZXJzSW52ZXJ0W3RleEluZm8ubWFnRmlsdGVyXVxuICAgICAgcmVnbFRleHR1cmUyRC5taW4gPSBtaW5GaWx0ZXJzSW52ZXJ0W3RleEluZm8ubWluRmlsdGVyXVxuXG4gICAgICByZWdsVGV4dHVyZTJELndyYXBTID0gd3JhcE1vZGVzSW52ZXJ0W3RleEluZm8ud3JhcFNdXG4gICAgICByZWdsVGV4dHVyZTJELndyYXBUID0gd3JhcE1vZGVzSW52ZXJ0W3RleEluZm8ud3JhcFRdXG5cbiAgICAgIHJldHVybiByZWdsVGV4dHVyZTJEXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc3ViaW1hZ2UgKGltYWdlLCB4XywgeV8sIGxldmVsXykge1xuICAgICAgXG5cbiAgICAgIHZhciB4ID0geF8gfCAwXG4gICAgICB2YXIgeSA9IHlfIHwgMFxuICAgICAgdmFyIGxldmVsID0gbGV2ZWxfIHwgMFxuXG4gICAgICB2YXIgaW1hZ2VEYXRhID0gYWxsb2NJbWFnZSgpXG4gICAgICBjb3B5RmxhZ3MoaW1hZ2VEYXRhLCB0ZXh0dXJlKVxuICAgICAgaW1hZ2VEYXRhLndpZHRoID0gMFxuICAgICAgaW1hZ2VEYXRhLmhlaWdodCA9IDBcbiAgICAgIHBhcnNlSW1hZ2UoaW1hZ2VEYXRhLCBpbWFnZSlcbiAgICAgIGltYWdlRGF0YS53aWR0aCA9IGltYWdlRGF0YS53aWR0aCB8fCAoKHRleHR1cmUud2lkdGggPj4gbGV2ZWwpIC0geClcbiAgICAgIGltYWdlRGF0YS5oZWlnaHQgPSBpbWFnZURhdGEuaGVpZ2h0IHx8ICgodGV4dHVyZS5oZWlnaHQgPj4gbGV2ZWwpIC0geSlcblxuICAgICAgXG4gICAgICBcbiAgICAgIFxuICAgICAgXG5cbiAgICAgIHRlbXBCaW5kKHRleHR1cmUpXG4gICAgICBzZXRTdWJJbWFnZShpbWFnZURhdGEsIEdMX1RFWFRVUkVfMkQsIHgsIHksIGxldmVsKVxuICAgICAgdGVtcFJlc3RvcmUoKVxuXG4gICAgICBmcmVlSW1hZ2UoaW1hZ2VEYXRhKVxuXG4gICAgICByZXR1cm4gcmVnbFRleHR1cmUyRFxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlc2l6ZSAod18sIGhfKSB7XG4gICAgICB2YXIgdyA9IHdfIHwgMFxuICAgICAgdmFyIGggPSAoaF8gfCAwKSB8fCB3XG4gICAgICBpZiAodyA9PT0gdGV4dHVyZS53aWR0aCAmJiBoID09PSB0ZXh0dXJlLmhlaWdodCkge1xuICAgICAgICByZXR1cm4gcmVnbFRleHR1cmUyRFxuICAgICAgfVxuXG4gICAgICByZWdsVGV4dHVyZTJELndpZHRoID0gdGV4dHVyZS53aWR0aCA9IHdcbiAgICAgIHJlZ2xUZXh0dXJlMkQuaGVpZ2h0ID0gdGV4dHVyZS5oZWlnaHQgPSBoXG5cbiAgICAgIHRlbXBCaW5kKHRleHR1cmUpXG4gICAgICBmb3IgKHZhciBpID0gMDsgdGV4dHVyZS5taXBtYXNrID4+IGk7ICsraSkge1xuICAgICAgICBnbC50ZXhJbWFnZTJEKFxuICAgICAgICAgIEdMX1RFWFRVUkVfMkQsXG4gICAgICAgICAgaSxcbiAgICAgICAgICB0ZXh0dXJlLmZvcm1hdCxcbiAgICAgICAgICB3ID4+IGksXG4gICAgICAgICAgaCA+PiBpLFxuICAgICAgICAgIDAsXG4gICAgICAgICAgdGV4dHVyZS5mb3JtYXQsXG4gICAgICAgICAgdGV4dHVyZS50eXBlLFxuICAgICAgICAgIG51bGwpXG4gICAgICB9XG4gICAgICB0ZW1wUmVzdG9yZSgpXG5cbiAgICAgIC8vIGFsc28sIHJlY29tcHV0ZSB0aGUgdGV4dHVyZSBzaXplLlxuICAgICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICAgIHRleHR1cmUuc3RhdHMuc2l6ZSA9IGdldFRleHR1cmVTaXplKFxuICAgICAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQsXG4gICAgICAgICAgdGV4dHVyZS50eXBlLFxuICAgICAgICAgIHcsXG4gICAgICAgICAgaCxcbiAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICBmYWxzZSlcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJlZ2xUZXh0dXJlMkRcbiAgICB9XG5cbiAgICByZWdsVGV4dHVyZTJEKGEsIGIpXG5cbiAgICByZWdsVGV4dHVyZTJELnN1YmltYWdlID0gc3ViaW1hZ2VcbiAgICByZWdsVGV4dHVyZTJELnJlc2l6ZSA9IHJlc2l6ZVxuICAgIHJlZ2xUZXh0dXJlMkQuX3JlZ2xUeXBlID0gJ3RleHR1cmUyZCdcbiAgICByZWdsVGV4dHVyZTJELl90ZXh0dXJlID0gdGV4dHVyZVxuICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgcmVnbFRleHR1cmUyRC5zdGF0cyA9IHRleHR1cmUuc3RhdHNcbiAgICB9XG4gICAgcmVnbFRleHR1cmUyRC5kZXN0cm95ID0gZnVuY3Rpb24gKCkge1xuICAgICAgdGV4dHVyZS5kZWNSZWYoKVxuICAgIH1cblxuICAgIHJldHVybiByZWdsVGV4dHVyZTJEXG4gIH1cblxuICBmdW5jdGlvbiBjcmVhdGVUZXh0dXJlQ3ViZSAoYTAsIGExLCBhMiwgYTMsIGE0LCBhNSkge1xuICAgIHZhciB0ZXh0dXJlID0gbmV3IFJFR0xUZXh0dXJlKEdMX1RFWFRVUkVfQ1VCRV9NQVApXG4gICAgdGV4dHVyZVNldFt0ZXh0dXJlLmlkXSA9IHRleHR1cmVcbiAgICBzdGF0cy5jdWJlQ291bnQrK1xuXG4gICAgdmFyIGZhY2VzID0gbmV3IEFycmF5KDYpXG5cbiAgICBmdW5jdGlvbiByZWdsVGV4dHVyZUN1YmUgKGEwLCBhMSwgYTIsIGEzLCBhNCwgYTUpIHtcbiAgICAgIHZhciBpXG4gICAgICB2YXIgdGV4SW5mbyA9IHRleHR1cmUudGV4SW5mb1xuICAgICAgVGV4SW5mby5jYWxsKHRleEluZm8pXG4gICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgIGZhY2VzW2ldID0gYWxsb2NNaXBNYXAoKVxuICAgICAgfVxuXG4gICAgICBpZiAodHlwZW9mIGEwID09PSAnbnVtYmVyJyB8fCAhYTApIHtcbiAgICAgICAgdmFyIHMgPSAoYTAgfCAwKSB8fCAxXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCA2OyArK2kpIHtcbiAgICAgICAgICBwYXJzZU1pcE1hcEZyb21TaGFwZShmYWNlc1tpXSwgcywgcylcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgYTAgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIGlmIChhMSkge1xuICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbU9iamVjdChmYWNlc1swXSwgYTApXG4gICAgICAgICAgcGFyc2VNaXBNYXBGcm9tT2JqZWN0KGZhY2VzWzFdLCBhMSlcbiAgICAgICAgICBwYXJzZU1pcE1hcEZyb21PYmplY3QoZmFjZXNbMl0sIGEyKVxuICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbU9iamVjdChmYWNlc1szXSwgYTMpXG4gICAgICAgICAgcGFyc2VNaXBNYXBGcm9tT2JqZWN0KGZhY2VzWzRdLCBhNClcbiAgICAgICAgICBwYXJzZU1pcE1hcEZyb21PYmplY3QoZmFjZXNbNV0sIGE1KVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHBhcnNlVGV4SW5mbyh0ZXhJbmZvLCBhMClcbiAgICAgICAgICBwYXJzZUZsYWdzKHRleHR1cmUsIGEwKVxuICAgICAgICAgIGlmICgnZmFjZXMnIGluIGEwKSB7XG4gICAgICAgICAgICB2YXIgZmFjZV9pbnB1dCA9IGEwLmZhY2VzXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCA2OyArK2kpIHtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIGNvcHlGbGFncyhmYWNlc1tpXSwgdGV4dHVyZSlcbiAgICAgICAgICAgICAgcGFyc2VNaXBNYXBGcm9tT2JqZWN0KGZhY2VzW2ldLCBmYWNlX2lucHV0W2ldKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbU9iamVjdChmYWNlc1tpXSwgYTApXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBcbiAgICAgIH1cblxuICAgICAgY29weUZsYWdzKHRleHR1cmUsIGZhY2VzWzBdKVxuICAgICAgaWYgKHRleEluZm8uZ2VuTWlwbWFwcykge1xuICAgICAgICB0ZXh0dXJlLm1pcG1hc2sgPSAoZmFjZXNbMF0ud2lkdGggPDwgMSkgLSAxXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0ZXh0dXJlLm1pcG1hc2sgPSBmYWNlc1swXS5taXBtYXNrXG4gICAgICB9XG5cbiAgICAgIFxuICAgICAgdGV4dHVyZS5pbnRlcm5hbGZvcm1hdCA9IGZhY2VzWzBdLmludGVybmFsZm9ybWF0XG5cbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS53aWR0aCA9IGZhY2VzWzBdLndpZHRoXG4gICAgICByZWdsVGV4dHVyZUN1YmUuaGVpZ2h0ID0gZmFjZXNbMF0uaGVpZ2h0XG5cbiAgICAgIHRlbXBCaW5kKHRleHR1cmUpXG4gICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XG4gICAgICAgIHNldE1pcE1hcChmYWNlc1tpXSwgR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YICsgaSlcbiAgICAgIH1cbiAgICAgIHNldFRleEluZm8odGV4SW5mbywgR0xfVEVYVFVSRV9DVUJFX01BUClcbiAgICAgIHRlbXBSZXN0b3JlKClcblxuICAgICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICAgIHRleHR1cmUuc3RhdHMuc2l6ZSA9IGdldFRleHR1cmVTaXplKFxuICAgICAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQsXG4gICAgICAgICAgdGV4dHVyZS50eXBlLFxuICAgICAgICAgIHJlZ2xUZXh0dXJlQ3ViZS53aWR0aCxcbiAgICAgICAgICByZWdsVGV4dHVyZUN1YmUuaGVpZ2h0LFxuICAgICAgICAgIHRleEluZm8uZ2VuTWlwbWFwcyxcbiAgICAgICAgICB0cnVlKVxuICAgICAgfVxuXG4gICAgICByZWdsVGV4dHVyZUN1YmUuZm9ybWF0ID0gdGV4dHVyZUZvcm1hdHNJbnZlcnRbdGV4dHVyZS5pbnRlcm5hbGZvcm1hdF1cbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS50eXBlID0gdGV4dHVyZVR5cGVzSW52ZXJ0W3RleHR1cmUudHlwZV1cblxuICAgICAgcmVnbFRleHR1cmVDdWJlLm1hZyA9IG1hZ0ZpbHRlcnNJbnZlcnRbdGV4SW5mby5tYWdGaWx0ZXJdXG4gICAgICByZWdsVGV4dHVyZUN1YmUubWluID0gbWluRmlsdGVyc0ludmVydFt0ZXhJbmZvLm1pbkZpbHRlcl1cblxuICAgICAgcmVnbFRleHR1cmVDdWJlLndyYXBTID0gd3JhcE1vZGVzSW52ZXJ0W3RleEluZm8ud3JhcFNdXG4gICAgICByZWdsVGV4dHVyZUN1YmUud3JhcFQgPSB3cmFwTW9kZXNJbnZlcnRbdGV4SW5mby53cmFwVF1cblxuICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICBmcmVlTWlwTWFwKGZhY2VzW2ldKVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmVnbFRleHR1cmVDdWJlXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc3ViaW1hZ2UgKGZhY2UsIGltYWdlLCB4XywgeV8sIGxldmVsXykge1xuICAgICAgXG4gICAgICBcblxuICAgICAgdmFyIHggPSB4XyB8IDBcbiAgICAgIHZhciB5ID0geV8gfCAwXG4gICAgICB2YXIgbGV2ZWwgPSBsZXZlbF8gfCAwXG5cbiAgICAgIHZhciBpbWFnZURhdGEgPSBhbGxvY0ltYWdlKClcbiAgICAgIGNvcHlGbGFncyhpbWFnZURhdGEsIHRleHR1cmUpXG4gICAgICBpbWFnZURhdGEud2lkdGggPSAwXG4gICAgICBpbWFnZURhdGEuaGVpZ2h0ID0gMFxuICAgICAgcGFyc2VJbWFnZShpbWFnZURhdGEsIGltYWdlKVxuICAgICAgaW1hZ2VEYXRhLndpZHRoID0gaW1hZ2VEYXRhLndpZHRoIHx8ICgodGV4dHVyZS53aWR0aCA+PiBsZXZlbCkgLSB4KVxuICAgICAgaW1hZ2VEYXRhLmhlaWdodCA9IGltYWdlRGF0YS5oZWlnaHQgfHwgKCh0ZXh0dXJlLmhlaWdodCA+PiBsZXZlbCkgLSB5KVxuXG4gICAgICBcbiAgICAgIFxuICAgICAgXG4gICAgICBcblxuICAgICAgdGVtcEJpbmQodGV4dHVyZSlcbiAgICAgIHNldFN1YkltYWdlKGltYWdlRGF0YSwgR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YICsgZmFjZSwgeCwgeSwgbGV2ZWwpXG4gICAgICB0ZW1wUmVzdG9yZSgpXG5cbiAgICAgIGZyZWVJbWFnZShpbWFnZURhdGEpXG5cbiAgICAgIHJldHVybiByZWdsVGV4dHVyZUN1YmVcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZXNpemUgKHJhZGl1c18pIHtcbiAgICAgIHZhciByYWRpdXMgPSByYWRpdXNfIHwgMFxuICAgICAgaWYgKHJhZGl1cyA9PT0gdGV4dHVyZS53aWR0aCkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgcmVnbFRleHR1cmVDdWJlLndpZHRoID0gdGV4dHVyZS53aWR0aCA9IHJhZGl1c1xuICAgICAgcmVnbFRleHR1cmVDdWJlLmhlaWdodCA9IHRleHR1cmUuaGVpZ2h0ID0gcmFkaXVzXG5cbiAgICAgIHRlbXBCaW5kKHRleHR1cmUpXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IDY7ICsraSkge1xuICAgICAgICBmb3IgKHZhciBqID0gMDsgdGV4dHVyZS5taXBtYXNrID4+IGo7ICsraikge1xuICAgICAgICAgIGdsLnRleEltYWdlMkQoXG4gICAgICAgICAgICBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1ggKyBpLFxuICAgICAgICAgICAgaixcbiAgICAgICAgICAgIHRleHR1cmUuZm9ybWF0LFxuICAgICAgICAgICAgcmFkaXVzID4+IGosXG4gICAgICAgICAgICByYWRpdXMgPj4gaixcbiAgICAgICAgICAgIDAsXG4gICAgICAgICAgICB0ZXh0dXJlLmZvcm1hdCxcbiAgICAgICAgICAgIHRleHR1cmUudHlwZSxcbiAgICAgICAgICAgIG51bGwpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHRlbXBSZXN0b3JlKClcblxuICAgICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XG4gICAgICAgIHRleHR1cmUuc3RhdHMuc2l6ZSA9IGdldFRleHR1cmVTaXplKFxuICAgICAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQsXG4gICAgICAgICAgdGV4dHVyZS50eXBlLFxuICAgICAgICAgIHJlZ2xUZXh0dXJlQ3ViZS53aWR0aCxcbiAgICAgICAgICByZWdsVGV4dHVyZUN1YmUuaGVpZ2h0LFxuICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgIHRydWUpXG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZWdsVGV4dHVyZUN1YmVcbiAgICB9XG5cbiAgICByZWdsVGV4dHVyZUN1YmUoYTAsIGExLCBhMiwgYTMsIGE0LCBhNSlcblxuICAgIHJlZ2xUZXh0dXJlQ3ViZS5zdWJpbWFnZSA9IHN1YmltYWdlXG4gICAgcmVnbFRleHR1cmVDdWJlLnJlc2l6ZSA9IHJlc2l6ZVxuICAgIHJlZ2xUZXh0dXJlQ3ViZS5fcmVnbFR5cGUgPSAndGV4dHVyZUN1YmUnXG4gICAgcmVnbFRleHR1cmVDdWJlLl90ZXh0dXJlID0gdGV4dHVyZVxuICAgIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgICAgcmVnbFRleHR1cmVDdWJlLnN0YXRzID0gdGV4dHVyZS5zdGF0c1xuICAgIH1cbiAgICByZWdsVGV4dHVyZUN1YmUuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHRleHR1cmUuZGVjUmVmKClcbiAgICB9XG5cbiAgICByZXR1cm4gcmVnbFRleHR1cmVDdWJlXG4gIH1cblxuICAvLyBDYWxsZWQgd2hlbiByZWdsIGlzIGRlc3Ryb3llZFxuICBmdW5jdGlvbiBkZXN0cm95VGV4dHVyZXMgKCkge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbnVtVGV4VW5pdHM7ICsraSkge1xuICAgICAgZ2wuYWN0aXZlVGV4dHVyZShHTF9URVhUVVJFMCArIGkpXG4gICAgICBnbC5iaW5kVGV4dHVyZShHTF9URVhUVVJFXzJELCBudWxsKVxuICAgICAgdGV4dHVyZVVuaXRzW2ldID0gbnVsbFxuICAgIH1cbiAgICB2YWx1ZXModGV4dHVyZVNldCkuZm9yRWFjaChkZXN0cm95KVxuXG4gICAgc3RhdHMuY3ViZUNvdW50ID0gMFxuICAgIHN0YXRzLnRleHR1cmVDb3VudCA9IDBcbiAgfVxuXG4gIGlmIChjb25maWcucHJvZmlsZSkge1xuICAgIHN0YXRzLmdldFRvdGFsVGV4dHVyZVNpemUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgdG90YWwgPSAwXG4gICAgICBPYmplY3Qua2V5cyh0ZXh0dXJlU2V0KS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgdG90YWwgKz0gdGV4dHVyZVNldFtrZXldLnN0YXRzLnNpemVcbiAgICAgIH0pXG4gICAgICByZXR1cm4gdG90YWxcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiByZXN0b3JlVGV4dHVyZXMgKCkge1xuICAgIHZhbHVlcyh0ZXh0dXJlU2V0KS5mb3JFYWNoKGZ1bmN0aW9uICh0ZXh0dXJlKSB7XG4gICAgICB0ZXh0dXJlLnRleHR1cmUgPSBnbC5jcmVhdGVUZXh0dXJlKClcbiAgICAgIGdsLmJpbmRUZXh0dXJlKHRleHR1cmUudGFyZ2V0LCB0ZXh0dXJlLnRleHR1cmUpXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IDMyOyArK2kpIHtcbiAgICAgICAgaWYgKCh0ZXh0dXJlLm1pcG1hc2sgJiAoMSA8PCBpKSkgPT09IDApIHtcbiAgICAgICAgICBjb250aW51ZVxuICAgICAgICB9XG4gICAgICAgIGlmICh0ZXh0dXJlLnRhcmdldCA9PT0gR0xfVEVYVFVSRV8yRCkge1xuICAgICAgICAgIGdsLnRleEltYWdlMkQoR0xfVEVYVFVSRV8yRCxcbiAgICAgICAgICAgIGksXG4gICAgICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0LFxuICAgICAgICAgICAgdGV4dHVyZS53aWR0aCA+PiBpLFxuICAgICAgICAgICAgdGV4dHVyZS5oZWlnaHQgPj4gaSxcbiAgICAgICAgICAgIDAsXG4gICAgICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0LFxuICAgICAgICAgICAgdGV4dHVyZS50eXBlLFxuICAgICAgICAgICAgbnVsbClcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IDY7ICsraikge1xuICAgICAgICAgICAgZ2wudGV4SW1hZ2UyRChHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1ggKyBqLFxuICAgICAgICAgICAgICBpLFxuICAgICAgICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0LFxuICAgICAgICAgICAgICB0ZXh0dXJlLndpZHRoID4+IGksXG4gICAgICAgICAgICAgIHRleHR1cmUuaGVpZ2h0ID4+IGksXG4gICAgICAgICAgICAgIDAsXG4gICAgICAgICAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQsXG4gICAgICAgICAgICAgIHRleHR1cmUudHlwZSxcbiAgICAgICAgICAgICAgbnVsbClcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHNldFRleEluZm8odGV4dHVyZS50ZXhJbmZvLCB0ZXh0dXJlLnRhcmdldClcbiAgICB9KVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjcmVhdGUyRDogY3JlYXRlVGV4dHVyZTJELFxuICAgIGNyZWF0ZUN1YmU6IGNyZWF0ZVRleHR1cmVDdWJlLFxuICAgIGNsZWFyOiBkZXN0cm95VGV4dHVyZXMsXG4gICAgZ2V0VGV4dHVyZTogZnVuY3Rpb24gKHdyYXBwZXIpIHtcbiAgICAgIHJldHVybiBudWxsXG4gICAgfSxcbiAgICByZXN0b3JlOiByZXN0b3JlVGV4dHVyZXNcbiAgfVxufVxuIiwidmFyIEdMX1FVRVJZX1JFU1VMVF9FWFQgPSAweDg4NjZcbnZhciBHTF9RVUVSWV9SRVNVTFRfQVZBSUxBQkxFX0VYVCA9IDB4ODg2N1xudmFyIEdMX1RJTUVfRUxBUFNFRF9FWFQgPSAweDg4QkZcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoZ2wsIGV4dGVuc2lvbnMpIHtcbiAgdmFyIGV4dFRpbWVyID0gZXh0ZW5zaW9ucy5leHRfZGlzam9pbnRfdGltZXJfcXVlcnlcblxuICBpZiAoIWV4dFRpbWVyKSB7XG4gICAgcmV0dXJuIG51bGxcbiAgfVxuXG4gIC8vIFFVRVJZIFBPT0wgQkVHSU5cbiAgdmFyIHF1ZXJ5UG9vbCA9IFtdXG4gIGZ1bmN0aW9uIGFsbG9jUXVlcnkgKCkge1xuICAgIHJldHVybiBxdWVyeVBvb2wucG9wKCkgfHwgZXh0VGltZXIuY3JlYXRlUXVlcnlFWFQoKVxuICB9XG4gIGZ1bmN0aW9uIGZyZWVRdWVyeSAocXVlcnkpIHtcbiAgICBxdWVyeVBvb2wucHVzaChxdWVyeSlcbiAgfVxuICAvLyBRVUVSWSBQT09MIEVORFxuXG4gIHZhciBwZW5kaW5nUXVlcmllcyA9IFtdXG4gIGZ1bmN0aW9uIGJlZ2luUXVlcnkgKHN0YXRzKSB7XG4gICAgdmFyIHF1ZXJ5ID0gYWxsb2NRdWVyeSgpXG4gICAgZXh0VGltZXIuYmVnaW5RdWVyeUVYVChHTF9USU1FX0VMQVBTRURfRVhULCBxdWVyeSlcbiAgICBwZW5kaW5nUXVlcmllcy5wdXNoKHF1ZXJ5KVxuICAgIHB1c2hTY29wZVN0YXRzKHBlbmRpbmdRdWVyaWVzLmxlbmd0aCAtIDEsIHBlbmRpbmdRdWVyaWVzLmxlbmd0aCwgc3RhdHMpXG4gIH1cblxuICBmdW5jdGlvbiBlbmRRdWVyeSAoKSB7XG4gICAgZXh0VGltZXIuZW5kUXVlcnlFWFQoR0xfVElNRV9FTEFQU0VEX0VYVClcbiAgfVxuXG4gIC8vXG4gIC8vIFBlbmRpbmcgc3RhdHMgcG9vbC5cbiAgLy9cbiAgZnVuY3Rpb24gUGVuZGluZ1N0YXRzICgpIHtcbiAgICB0aGlzLnN0YXJ0UXVlcnlJbmRleCA9IC0xXG4gICAgdGhpcy5lbmRRdWVyeUluZGV4ID0gLTFcbiAgICB0aGlzLnN1bSA9IDBcbiAgICB0aGlzLnN0YXRzID0gbnVsbFxuICB9XG4gIHZhciBwZW5kaW5nU3RhdHNQb29sID0gW11cbiAgZnVuY3Rpb24gYWxsb2NQZW5kaW5nU3RhdHMgKCkge1xuICAgIHJldHVybiBwZW5kaW5nU3RhdHNQb29sLnBvcCgpIHx8IG5ldyBQZW5kaW5nU3RhdHMoKVxuICB9XG4gIGZ1bmN0aW9uIGZyZWVQZW5kaW5nU3RhdHMgKHBlbmRpbmdTdGF0cykge1xuICAgIHBlbmRpbmdTdGF0c1Bvb2wucHVzaChwZW5kaW5nU3RhdHMpXG4gIH1cbiAgLy8gUGVuZGluZyBzdGF0cyBwb29sIGVuZFxuXG4gIHZhciBwZW5kaW5nU3RhdHMgPSBbXVxuICBmdW5jdGlvbiBwdXNoU2NvcGVTdGF0cyAoc3RhcnQsIGVuZCwgc3RhdHMpIHtcbiAgICB2YXIgcHMgPSBhbGxvY1BlbmRpbmdTdGF0cygpXG4gICAgcHMuc3RhcnRRdWVyeUluZGV4ID0gc3RhcnRcbiAgICBwcy5lbmRRdWVyeUluZGV4ID0gZW5kXG4gICAgcHMuc3VtID0gMFxuICAgIHBzLnN0YXRzID0gc3RhdHNcbiAgICBwZW5kaW5nU3RhdHMucHVzaChwcylcbiAgfVxuXG4gIC8vIHdlIHNob3VsZCBjYWxsIHRoaXMgYXQgdGhlIGJlZ2lubmluZyBvZiB0aGUgZnJhbWUsXG4gIC8vIGluIG9yZGVyIHRvIHVwZGF0ZSBncHVUaW1lXG4gIHZhciB0aW1lU3VtID0gW11cbiAgdmFyIHF1ZXJ5UHRyID0gW11cbiAgZnVuY3Rpb24gdXBkYXRlICgpIHtcbiAgICB2YXIgcHRyLCBpXG5cbiAgICB2YXIgbiA9IHBlbmRpbmdRdWVyaWVzLmxlbmd0aFxuICAgIGlmIChuID09PSAwKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICAvLyBSZXNlcnZlIHNwYWNlXG4gICAgcXVlcnlQdHIubGVuZ3RoID0gTWF0aC5tYXgocXVlcnlQdHIubGVuZ3RoLCBuICsgMSlcbiAgICB0aW1lU3VtLmxlbmd0aCA9IE1hdGgubWF4KHRpbWVTdW0ubGVuZ3RoLCBuICsgMSlcbiAgICB0aW1lU3VtWzBdID0gMFxuICAgIHF1ZXJ5UHRyWzBdID0gMFxuXG4gICAgLy8gVXBkYXRlIGFsbCBwZW5kaW5nIHRpbWVyIHF1ZXJpZXNcbiAgICB2YXIgcXVlcnlUaW1lID0gMFxuICAgIHB0ciA9IDBcbiAgICBmb3IgKGkgPSAwOyBpIDwgcGVuZGluZ1F1ZXJpZXMubGVuZ3RoOyArK2kpIHtcbiAgICAgIHZhciBxdWVyeSA9IHBlbmRpbmdRdWVyaWVzW2ldXG4gICAgICBpZiAoZXh0VGltZXIuZ2V0UXVlcnlPYmplY3RFWFQocXVlcnksIEdMX1FVRVJZX1JFU1VMVF9BVkFJTEFCTEVfRVhUKSkge1xuICAgICAgICBxdWVyeVRpbWUgKz0gZXh0VGltZXIuZ2V0UXVlcnlPYmplY3RFWFQocXVlcnksIEdMX1FVRVJZX1JFU1VMVF9FWFQpXG4gICAgICAgIGZyZWVRdWVyeShxdWVyeSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBlbmRpbmdRdWVyaWVzW3B0cisrXSA9IHF1ZXJ5XG4gICAgICB9XG4gICAgICB0aW1lU3VtW2kgKyAxXSA9IHF1ZXJ5VGltZVxuICAgICAgcXVlcnlQdHJbaSArIDFdID0gcHRyXG4gICAgfVxuICAgIHBlbmRpbmdRdWVyaWVzLmxlbmd0aCA9IHB0clxuXG4gICAgLy8gVXBkYXRlIGFsbCBwZW5kaW5nIHN0YXQgcXVlcmllc1xuICAgIHB0ciA9IDBcbiAgICBmb3IgKGkgPSAwOyBpIDwgcGVuZGluZ1N0YXRzLmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgc3RhdHMgPSBwZW5kaW5nU3RhdHNbaV1cbiAgICAgIHZhciBzdGFydCA9IHN0YXRzLnN0YXJ0UXVlcnlJbmRleFxuICAgICAgdmFyIGVuZCA9IHN0YXRzLmVuZFF1ZXJ5SW5kZXhcbiAgICAgIHN0YXRzLnN1bSArPSB0aW1lU3VtW2VuZF0gLSB0aW1lU3VtW3N0YXJ0XVxuICAgICAgdmFyIHN0YXJ0UHRyID0gcXVlcnlQdHJbc3RhcnRdXG4gICAgICB2YXIgZW5kUHRyID0gcXVlcnlQdHJbZW5kXVxuICAgICAgaWYgKGVuZFB0ciA9PT0gc3RhcnRQdHIpIHtcbiAgICAgICAgc3RhdHMuc3RhdHMuZ3B1VGltZSArPSBzdGF0cy5zdW0gLyAxZTZcbiAgICAgICAgZnJlZVBlbmRpbmdTdGF0cyhzdGF0cylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN0YXRzLnN0YXJ0UXVlcnlJbmRleCA9IHN0YXJ0UHRyXG4gICAgICAgIHN0YXRzLmVuZFF1ZXJ5SW5kZXggPSBlbmRQdHJcbiAgICAgICAgcGVuZGluZ1N0YXRzW3B0cisrXSA9IHN0YXRzXG4gICAgICB9XG4gICAgfVxuICAgIHBlbmRpbmdTdGF0cy5sZW5ndGggPSBwdHJcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgYmVnaW5RdWVyeTogYmVnaW5RdWVyeSxcbiAgICBlbmRRdWVyeTogZW5kUXVlcnksXG4gICAgcHVzaFNjb3BlU3RhdHM6IHB1c2hTY29wZVN0YXRzLFxuICAgIHVwZGF0ZTogdXBkYXRlLFxuICAgIGdldE51bVBlbmRpbmdRdWVyaWVzOiBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gcGVuZGluZ1F1ZXJpZXMubGVuZ3RoXG4gICAgfSxcbiAgICBjbGVhcjogZnVuY3Rpb24gKCkge1xuICAgICAgcXVlcnlQb29sLnB1c2guYXBwbHkocXVlcnlQb29sLCBwZW5kaW5nUXVlcmllcylcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcXVlcnlQb29sLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGV4dFRpbWVyLmRlbGV0ZVF1ZXJ5RVhUKHF1ZXJ5UG9vbFtpXSlcbiAgICAgIH1cbiAgICAgIHBlbmRpbmdRdWVyaWVzLmxlbmd0aCA9IDBcbiAgICAgIHF1ZXJ5UG9vbC5sZW5ndGggPSAwXG4gICAgfSxcbiAgICByZXN0b3JlOiBmdW5jdGlvbiAoKSB7XG4gICAgICBwZW5kaW5nUXVlcmllcy5sZW5ndGggPSAwXG4gICAgICBxdWVyeVBvb2wubGVuZ3RoID0gMFxuICAgIH1cbiAgfVxufVxuIiwiLyogZ2xvYmFscyBwZXJmb3JtYW5jZSAqL1xubW9kdWxlLmV4cG9ydHMgPVxuICAodHlwZW9mIHBlcmZvcm1hbmNlICE9PSAndW5kZWZpbmVkJyAmJiBwZXJmb3JtYW5jZS5ub3cpXG4gID8gZnVuY3Rpb24gKCkgeyByZXR1cm4gcGVyZm9ybWFuY2Uubm93KCkgfVxuICA6IGZ1bmN0aW9uICgpIHsgcmV0dXJuICsobmV3IERhdGUoKSkgfVxuIiwidmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vZXh0ZW5kJylcblxuZnVuY3Rpb24gc2xpY2UgKHgpIHtcbiAgcmV0dXJuIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKHgpXG59XG5cbmZ1bmN0aW9uIGpvaW4gKHgpIHtcbiAgcmV0dXJuIHNsaWNlKHgpLmpvaW4oJycpXG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY3JlYXRlRW52aXJvbm1lbnQgKCkge1xuICAvLyBVbmlxdWUgdmFyaWFibGUgaWQgY291bnRlclxuICB2YXIgdmFyQ291bnRlciA9IDBcblxuICAvLyBMaW5rZWQgdmFsdWVzIGFyZSBwYXNzZWQgZnJvbSB0aGlzIHNjb3BlIGludG8gdGhlIGdlbmVyYXRlZCBjb2RlIGJsb2NrXG4gIC8vIENhbGxpbmcgbGluaygpIHBhc3NlcyBhIHZhbHVlIGludG8gdGhlIGdlbmVyYXRlZCBzY29wZSBhbmQgcmV0dXJuc1xuICAvLyB0aGUgdmFyaWFibGUgbmFtZSB3aGljaCBpdCBpcyBib3VuZCB0b1xuICB2YXIgbGlua2VkTmFtZXMgPSBbXVxuICB2YXIgbGlua2VkVmFsdWVzID0gW11cbiAgZnVuY3Rpb24gbGluayAodmFsdWUpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxpbmtlZFZhbHVlcy5sZW5ndGg7ICsraSkge1xuICAgICAgaWYgKGxpbmtlZFZhbHVlc1tpXSA9PT0gdmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIGxpbmtlZE5hbWVzW2ldXG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFyIG5hbWUgPSAnZycgKyAodmFyQ291bnRlcisrKVxuICAgIGxpbmtlZE5hbWVzLnB1c2gobmFtZSlcbiAgICBsaW5rZWRWYWx1ZXMucHVzaCh2YWx1ZSlcbiAgICByZXR1cm4gbmFtZVxuICB9XG5cbiAgLy8gY3JlYXRlIGEgY29kZSBibG9ja1xuICBmdW5jdGlvbiBibG9jayAoKSB7XG4gICAgdmFyIGNvZGUgPSBbXVxuICAgIGZ1bmN0aW9uIHB1c2ggKCkge1xuICAgICAgY29kZS5wdXNoLmFwcGx5KGNvZGUsIHNsaWNlKGFyZ3VtZW50cykpXG4gICAgfVxuXG4gICAgdmFyIHZhcnMgPSBbXVxuICAgIGZ1bmN0aW9uIGRlZiAoKSB7XG4gICAgICB2YXIgbmFtZSA9ICd2JyArICh2YXJDb3VudGVyKyspXG4gICAgICB2YXJzLnB1c2gobmFtZSlcblxuICAgICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGNvZGUucHVzaChuYW1lLCAnPScpXG4gICAgICAgIGNvZGUucHVzaC5hcHBseShjb2RlLCBzbGljZShhcmd1bWVudHMpKVxuICAgICAgICBjb2RlLnB1c2goJzsnKVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gbmFtZVxuICAgIH1cblxuICAgIHJldHVybiBleHRlbmQocHVzaCwge1xuICAgICAgZGVmOiBkZWYsXG4gICAgICB0b1N0cmluZzogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gam9pbihbXG4gICAgICAgICAgKHZhcnMubGVuZ3RoID4gMCA/ICd2YXIgJyArIHZhcnMgKyAnOycgOiAnJyksXG4gICAgICAgICAgam9pbihjb2RlKVxuICAgICAgICBdKVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiBzY29wZSAoKSB7XG4gICAgdmFyIGVudHJ5ID0gYmxvY2soKVxuICAgIHZhciBleGl0ID0gYmxvY2soKVxuXG4gICAgdmFyIGVudHJ5VG9TdHJpbmcgPSBlbnRyeS50b1N0cmluZ1xuICAgIHZhciBleGl0VG9TdHJpbmcgPSBleGl0LnRvU3RyaW5nXG5cbiAgICBmdW5jdGlvbiBzYXZlIChvYmplY3QsIHByb3ApIHtcbiAgICAgIGV4aXQob2JqZWN0LCBwcm9wLCAnPScsIGVudHJ5LmRlZihvYmplY3QsIHByb3ApLCAnOycpXG4gICAgfVxuXG4gICAgcmV0dXJuIGV4dGVuZChmdW5jdGlvbiAoKSB7XG4gICAgICBlbnRyeS5hcHBseShlbnRyeSwgc2xpY2UoYXJndW1lbnRzKSlcbiAgICB9LCB7XG4gICAgICBkZWY6IGVudHJ5LmRlZixcbiAgICAgIGVudHJ5OiBlbnRyeSxcbiAgICAgIGV4aXQ6IGV4aXQsXG4gICAgICBzYXZlOiBzYXZlLFxuICAgICAgc2V0OiBmdW5jdGlvbiAob2JqZWN0LCBwcm9wLCB2YWx1ZSkge1xuICAgICAgICBzYXZlKG9iamVjdCwgcHJvcClcbiAgICAgICAgZW50cnkob2JqZWN0LCBwcm9wLCAnPScsIHZhbHVlLCAnOycpXG4gICAgICB9LFxuICAgICAgdG9TdHJpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIGVudHJ5VG9TdHJpbmcoKSArIGV4aXRUb1N0cmluZygpXG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGNvbmRpdGlvbmFsICgpIHtcbiAgICB2YXIgcHJlZCA9IGpvaW4oYXJndW1lbnRzKVxuICAgIHZhciB0aGVuQmxvY2sgPSBzY29wZSgpXG4gICAgdmFyIGVsc2VCbG9jayA9IHNjb3BlKClcblxuICAgIHZhciB0aGVuVG9TdHJpbmcgPSB0aGVuQmxvY2sudG9TdHJpbmdcbiAgICB2YXIgZWxzZVRvU3RyaW5nID0gZWxzZUJsb2NrLnRvU3RyaW5nXG5cbiAgICByZXR1cm4gZXh0ZW5kKHRoZW5CbG9jaywge1xuICAgICAgdGhlbjogZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGVuQmxvY2suYXBwbHkodGhlbkJsb2NrLCBzbGljZShhcmd1bWVudHMpKVxuICAgICAgICByZXR1cm4gdGhpc1xuICAgICAgfSxcbiAgICAgIGVsc2U6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgZWxzZUJsb2NrLmFwcGx5KGVsc2VCbG9jaywgc2xpY2UoYXJndW1lbnRzKSlcbiAgICAgICAgcmV0dXJuIHRoaXNcbiAgICAgIH0sXG4gICAgICB0b1N0cmluZzogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZWxzZUNsYXVzZSA9IGVsc2VUb1N0cmluZygpXG4gICAgICAgIGlmIChlbHNlQ2xhdXNlKSB7XG4gICAgICAgICAgZWxzZUNsYXVzZSA9ICdlbHNleycgKyBlbHNlQ2xhdXNlICsgJ30nXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGpvaW4oW1xuICAgICAgICAgICdpZignLCBwcmVkLCAnKXsnLFxuICAgICAgICAgIHRoZW5Ub1N0cmluZygpLFxuICAgICAgICAgICd9JywgZWxzZUNsYXVzZVxuICAgICAgICBdKVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICAvLyBwcm9jZWR1cmUgbGlzdFxuICB2YXIgZ2xvYmFsQmxvY2sgPSBibG9jaygpXG4gIHZhciBwcm9jZWR1cmVzID0ge31cbiAgZnVuY3Rpb24gcHJvYyAobmFtZSwgY291bnQpIHtcbiAgICB2YXIgYXJncyA9IFtdXG4gICAgZnVuY3Rpb24gYXJnICgpIHtcbiAgICAgIHZhciBuYW1lID0gJ2EnICsgYXJncy5sZW5ndGhcbiAgICAgIGFyZ3MucHVzaChuYW1lKVxuICAgICAgcmV0dXJuIG5hbWVcbiAgICB9XG5cbiAgICBjb3VudCA9IGNvdW50IHx8IDBcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNvdW50OyArK2kpIHtcbiAgICAgIGFyZygpXG4gICAgfVxuXG4gICAgdmFyIGJvZHkgPSBzY29wZSgpXG4gICAgdmFyIGJvZHlUb1N0cmluZyA9IGJvZHkudG9TdHJpbmdcblxuICAgIHZhciByZXN1bHQgPSBwcm9jZWR1cmVzW25hbWVdID0gZXh0ZW5kKGJvZHksIHtcbiAgICAgIGFyZzogYXJnLFxuICAgICAgdG9TdHJpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIGpvaW4oW1xuICAgICAgICAgICdmdW5jdGlvbignLCBhcmdzLmpvaW4oKSwgJyl7JyxcbiAgICAgICAgICBib2R5VG9TdHJpbmcoKSxcbiAgICAgICAgICAnfSdcbiAgICAgICAgXSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG5cbiAgZnVuY3Rpb24gY29tcGlsZSAoKSB7XG4gICAgdmFyIGNvZGUgPSBbJ1widXNlIHN0cmljdFwiOycsXG4gICAgICBnbG9iYWxCbG9jayxcbiAgICAgICdyZXR1cm4geyddXG4gICAgT2JqZWN0LmtleXMocHJvY2VkdXJlcykuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgY29kZS5wdXNoKCdcIicsIG5hbWUsICdcIjonLCBwcm9jZWR1cmVzW25hbWVdLnRvU3RyaW5nKCksICcsJylcbiAgICB9KVxuICAgIGNvZGUucHVzaCgnfScpXG4gICAgdmFyIHNyYyA9IGpvaW4oY29kZSlcbiAgICAgIC5yZXBsYWNlKC87L2csICc7XFxuJylcbiAgICAgIC5yZXBsYWNlKC99L2csICd9XFxuJylcbiAgICAgIC5yZXBsYWNlKC97L2csICd7XFxuJylcbiAgICB2YXIgcHJvYyA9IEZ1bmN0aW9uLmFwcGx5KG51bGwsIGxpbmtlZE5hbWVzLmNvbmNhdChzcmMpKVxuICAgIHJldHVybiBwcm9jLmFwcGx5KG51bGwsIGxpbmtlZFZhbHVlcylcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgZ2xvYmFsOiBnbG9iYWxCbG9jayxcbiAgICBsaW5rOiBsaW5rLFxuICAgIGJsb2NrOiBibG9jayxcbiAgICBwcm9jOiBwcm9jLFxuICAgIHNjb3BlOiBzY29wZSxcbiAgICBjb25kOiBjb25kaXRpb25hbCxcbiAgICBjb21waWxlOiBjb21waWxlXG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGJhc2UsIG9wdHMpIHtcbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhvcHRzKVxuICBmb3IgKHZhciBpID0gMDsgaSA8IGtleXMubGVuZ3RoOyArK2kpIHtcbiAgICBiYXNlW2tleXNbaV1dID0gb3B0c1trZXlzW2ldXVxuICB9XG4gIHJldHVybiBiYXNlXG59XG4iLCJ2YXIgcG9vbCA9IHJlcXVpcmUoJy4vcG9vbCcpXG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBzaGFwZTogYXJyYXlTaGFwZSxcbiAgZmxhdHRlbjogZmxhdHRlbkFycmF5XG59XG5cbmZ1bmN0aW9uIGZsYXR0ZW4xRCAoYXJyYXksIG54LCBvdXQpIHtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBueDsgKytpKSB7XG4gICAgb3V0W2ldID0gYXJyYXlbaV1cbiAgfVxufVxuXG5mdW5jdGlvbiBmbGF0dGVuMkQgKGFycmF5LCBueCwgbnksIG91dCkge1xuICB2YXIgcHRyID0gMFxuICBmb3IgKHZhciBpID0gMDsgaSA8IG54OyArK2kpIHtcbiAgICB2YXIgcm93ID0gYXJyYXlbaV1cbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IG55OyArK2opIHtcbiAgICAgIG91dFtwdHIrK10gPSByb3dbal1cbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gZmxhdHRlbjNEIChhcnJheSwgbngsIG55LCBueiwgb3V0LCBwdHJfKSB7XG4gIHZhciBwdHIgPSBwdHJfXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbng7ICsraSkge1xuICAgIHZhciByb3cgPSBhcnJheVtpXVxuICAgIGZvciAodmFyIGogPSAwOyBqIDwgbnk7ICsraikge1xuICAgICAgdmFyIGNvbCA9IHJvd1tqXVxuICAgICAgZm9yICh2YXIgayA9IDA7IGsgPCBuejsgKytrKSB7XG4gICAgICAgIG91dFtwdHIrK10gPSBjb2xba11cbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gZmxhdHRlblJlYyAoYXJyYXksIHNoYXBlLCBsZXZlbCwgb3V0LCBwdHIpIHtcbiAgdmFyIHN0cmlkZSA9IDFcbiAgZm9yICh2YXIgaSA9IGxldmVsICsgMTsgaSA8IHNoYXBlLmxlbmd0aDsgKytpKSB7XG4gICAgc3RyaWRlICo9IHNoYXBlW2ldXG4gIH1cbiAgdmFyIG4gPSBzaGFwZVtsZXZlbF1cbiAgaWYgKHNoYXBlLmxlbmd0aCAtIGxldmVsID09PSA0KSB7XG4gICAgdmFyIG54ID0gc2hhcGVbbGV2ZWwgKyAxXVxuICAgIHZhciBueSA9IHNoYXBlW2xldmVsICsgMl1cbiAgICB2YXIgbnogPSBzaGFwZVtsZXZlbCArIDNdXG4gICAgZm9yIChpID0gMDsgaSA8IG47ICsraSkge1xuICAgICAgZmxhdHRlbjNEKGFycmF5W2ldLCBueCwgbnksIG56LCBvdXQsIHB0cilcbiAgICAgIHB0ciArPSBzdHJpZGVcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgZm9yIChpID0gMDsgaSA8IG47ICsraSkge1xuICAgICAgZmxhdHRlblJlYyhhcnJheVtpXSwgc2hhcGUsIGxldmVsICsgMSwgb3V0LCBwdHIpXG4gICAgICBwdHIgKz0gc3RyaWRlXG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGZsYXR0ZW5BcnJheSAoYXJyYXksIHNoYXBlLCB0eXBlLCBvdXRfKSB7XG4gIHZhciBzeiA9IDFcbiAgaWYgKHNoYXBlLmxlbmd0aCkge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc2hhcGUubGVuZ3RoOyArK2kpIHtcbiAgICAgIHN6ICo9IHNoYXBlW2ldXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHN6ID0gMFxuICB9XG4gIHZhciBvdXQgPSBvdXRfIHx8IHBvb2wuYWxsb2NUeXBlKHR5cGUsIHN6KVxuICBzd2l0Y2ggKHNoYXBlLmxlbmd0aCkge1xuICAgIGNhc2UgMDpcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAxOlxuICAgICAgZmxhdHRlbjFEKGFycmF5LCBzaGFwZVswXSwgb3V0KVxuICAgICAgYnJlYWtcbiAgICBjYXNlIDI6XG4gICAgICBmbGF0dGVuMkQoYXJyYXksIHNoYXBlWzBdLCBzaGFwZVsxXSwgb3V0KVxuICAgICAgYnJlYWtcbiAgICBjYXNlIDM6XG4gICAgICBmbGF0dGVuM0QoYXJyYXksIHNoYXBlWzBdLCBzaGFwZVsxXSwgc2hhcGVbMl0sIG91dCwgMClcbiAgICAgIGJyZWFrXG4gICAgZGVmYXVsdDpcbiAgICAgIGZsYXR0ZW5SZWMoYXJyYXksIHNoYXBlLCAwLCBvdXQsIDApXG4gIH1cbiAgcmV0dXJuIG91dFxufVxuXG5mdW5jdGlvbiBhcnJheVNoYXBlIChhcnJheV8pIHtcbiAgdmFyIHNoYXBlID0gW11cbiAgZm9yICh2YXIgYXJyYXkgPSBhcnJheV87IGFycmF5Lmxlbmd0aDsgYXJyYXkgPSBhcnJheVswXSkge1xuICAgIHNoYXBlLnB1c2goYXJyYXkubGVuZ3RoKVxuICB9XG4gIHJldHVybiBzaGFwZVxufVxuIiwidmFyIGlzVHlwZWRBcnJheSA9IHJlcXVpcmUoJy4vaXMtdHlwZWQtYXJyYXknKVxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpc0FycmF5TGlrZSAocykge1xuICByZXR1cm4gQXJyYXkuaXNBcnJheShzKSB8fCBpc1R5cGVkQXJyYXkocylcbn1cbiIsInZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCcuL2lzLXR5cGVkLWFycmF5JylcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpc05EQXJyYXlMaWtlIChvYmopIHtcbiAgcmV0dXJuIChcbiAgICAhIW9iaiAmJlxuICAgIHR5cGVvZiBvYmogPT09ICdvYmplY3QnICYmXG4gICAgQXJyYXkuaXNBcnJheShvYmouc2hhcGUpICYmXG4gICAgQXJyYXkuaXNBcnJheShvYmouc3RyaWRlKSAmJlxuICAgIHR5cGVvZiBvYmoub2Zmc2V0ID09PSAnbnVtYmVyJyAmJlxuICAgIG9iai5zaGFwZS5sZW5ndGggPT09IG9iai5zdHJpZGUubGVuZ3RoICYmXG4gICAgKEFycmF5LmlzQXJyYXkob2JqLmRhdGEpIHx8XG4gICAgICBpc1R5cGVkQXJyYXkob2JqLmRhdGEpKSlcbn1cbiIsInZhciBkdHlwZXMgPSByZXF1aXJlKCcuLi9jb25zdGFudHMvYXJyYXl0eXBlcy5qc29uJylcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHgpIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh4KSBpbiBkdHlwZXNcbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gbG9vcCAobiwgZikge1xuICB2YXIgcmVzdWx0ID0gQXJyYXkobilcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBuOyArK2kpIHtcbiAgICByZXN1bHRbaV0gPSBmKGkpXG4gIH1cbiAgcmV0dXJuIHJlc3VsdFxufVxuIiwidmFyIGxvb3AgPSByZXF1aXJlKCcuL2xvb3AnKVxuXG52YXIgR0xfQllURSA9IDUxMjBcbnZhciBHTF9VTlNJR05FRF9CWVRFID0gNTEyMVxudmFyIEdMX1NIT1JUID0gNTEyMlxudmFyIEdMX1VOU0lHTkVEX1NIT1JUID0gNTEyM1xudmFyIEdMX0lOVCA9IDUxMjRcbnZhciBHTF9VTlNJR05FRF9JTlQgPSA1MTI1XG52YXIgR0xfRkxPQVQgPSA1MTI2XG5cbnZhciBidWZmZXJQb29sID0gbG9vcCg4LCBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiBbXVxufSlcblxuZnVuY3Rpb24gbmV4dFBvdzE2ICh2KSB7XG4gIGZvciAodmFyIGkgPSAxNjsgaSA8PSAoMSA8PCAyOCk7IGkgKj0gMTYpIHtcbiAgICBpZiAodiA8PSBpKSB7XG4gICAgICByZXR1cm4gaVxuICAgIH1cbiAgfVxuICByZXR1cm4gMFxufVxuXG5mdW5jdGlvbiBsb2cyICh2KSB7XG4gIHZhciByLCBzaGlmdFxuICByID0gKHYgPiAweEZGRkYpIDw8IDRcbiAgdiA+Pj49IHJcbiAgc2hpZnQgPSAodiA+IDB4RkYpIDw8IDNcbiAgdiA+Pj49IHNoaWZ0OyByIHw9IHNoaWZ0XG4gIHNoaWZ0ID0gKHYgPiAweEYpIDw8IDJcbiAgdiA+Pj49IHNoaWZ0OyByIHw9IHNoaWZ0XG4gIHNoaWZ0ID0gKHYgPiAweDMpIDw8IDFcbiAgdiA+Pj49IHNoaWZ0OyByIHw9IHNoaWZ0XG4gIHJldHVybiByIHwgKHYgPj4gMSlcbn1cblxuZnVuY3Rpb24gYWxsb2MgKG4pIHtcbiAgdmFyIHN6ID0gbmV4dFBvdzE2KG4pXG4gIHZhciBiaW4gPSBidWZmZXJQb29sW2xvZzIoc3opID4+IDJdXG4gIGlmIChiaW4ubGVuZ3RoID4gMCkge1xuICAgIHJldHVybiBiaW4ucG9wKClcbiAgfVxuICByZXR1cm4gbmV3IEFycmF5QnVmZmVyKHN6KVxufVxuXG5mdW5jdGlvbiBmcmVlIChidWYpIHtcbiAgYnVmZmVyUG9vbFtsb2cyKGJ1Zi5ieXRlTGVuZ3RoKSA+PiAyXS5wdXNoKGJ1Zilcbn1cblxuZnVuY3Rpb24gYWxsb2NUeXBlICh0eXBlLCBuKSB7XG4gIHZhciByZXN1bHQgPSBudWxsXG4gIHN3aXRjaCAodHlwZSkge1xuICAgIGNhc2UgR0xfQllURTpcbiAgICAgIHJlc3VsdCA9IG5ldyBJbnQ4QXJyYXkoYWxsb2MobiksIDAsIG4pXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfVU5TSUdORURfQllURTpcbiAgICAgIHJlc3VsdCA9IG5ldyBVaW50OEFycmF5KGFsbG9jKG4pLCAwLCBuKVxuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX1NIT1JUOlxuICAgICAgcmVzdWx0ID0gbmV3IEludDE2QXJyYXkoYWxsb2MoMiAqIG4pLCAwLCBuKVxuICAgICAgYnJlYWtcbiAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUOlxuICAgICAgcmVzdWx0ID0gbmV3IFVpbnQxNkFycmF5KGFsbG9jKDIgKiBuKSwgMCwgbilcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9JTlQ6XG4gICAgICByZXN1bHQgPSBuZXcgSW50MzJBcnJheShhbGxvYyg0ICogbiksIDAsIG4pXG4gICAgICBicmVha1xuICAgIGNhc2UgR0xfVU5TSUdORURfSU5UOlxuICAgICAgcmVzdWx0ID0gbmV3IFVpbnQzMkFycmF5KGFsbG9jKDQgKiBuKSwgMCwgbilcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBHTF9GTE9BVDpcbiAgICAgIHJlc3VsdCA9IG5ldyBGbG9hdDMyQXJyYXkoYWxsb2MoNCAqIG4pLCAwLCBuKVxuICAgICAgYnJlYWtcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIG51bGxcbiAgfVxuICBpZiAocmVzdWx0Lmxlbmd0aCAhPT0gbikge1xuICAgIHJldHVybiByZXN1bHQuc3ViYXJyYXkoMCwgbilcbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG5cbmZ1bmN0aW9uIGZyZWVUeXBlIChhcnJheSkge1xuICBmcmVlKGFycmF5LmJ1ZmZlcilcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGFsbG9jOiBhbGxvYyxcbiAgZnJlZTogZnJlZSxcbiAgYWxsb2NUeXBlOiBhbGxvY1R5cGUsXG4gIGZyZWVUeXBlOiBmcmVlVHlwZVxufVxuIiwiLyogZ2xvYmFscyByZXF1ZXN0QW5pbWF0aW9uRnJhbWUsIGNhbmNlbEFuaW1hdGlvbkZyYW1lICovXG5pZiAodHlwZW9mIHJlcXVlc3RBbmltYXRpb25GcmFtZSA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgIHR5cGVvZiBjYW5jZWxBbmltYXRpb25GcmFtZSA9PT0gJ2Z1bmN0aW9uJykge1xuICBtb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBuZXh0OiBmdW5jdGlvbiAoeCkgeyByZXR1cm4gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHgpIH0sXG4gICAgY2FuY2VsOiBmdW5jdGlvbiAoeCkgeyByZXR1cm4gY2FuY2VsQW5pbWF0aW9uRnJhbWUoeCkgfVxuICB9XG59IGVsc2Uge1xuICBtb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBuZXh0OiBmdW5jdGlvbiAoY2IpIHtcbiAgICAgIHJldHVybiBzZXRUaW1lb3V0KGNiLCAxNilcbiAgICB9LFxuICAgIGNhbmNlbDogY2xlYXJUaW1lb3V0XG4gIH1cbn1cbiIsInZhciBwb29sID0gcmVxdWlyZSgnLi9wb29sJylcblxudmFyIEZMT0FUID0gbmV3IEZsb2F0MzJBcnJheSgxKVxudmFyIElOVCA9IG5ldyBVaW50MzJBcnJheShGTE9BVC5idWZmZXIpXG5cbnZhciBHTF9VTlNJR05FRF9TSE9SVCA9IDUxMjNcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjb252ZXJ0VG9IYWxmRmxvYXQgKGFycmF5KSB7XG4gIHZhciB1c2hvcnRzID0gcG9vbC5hbGxvY1R5cGUoR0xfVU5TSUdORURfU0hPUlQsIGFycmF5Lmxlbmd0aClcblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGFycmF5Lmxlbmd0aDsgKytpKSB7XG4gICAgaWYgKGlzTmFOKGFycmF5W2ldKSkge1xuICAgICAgdXNob3J0c1tpXSA9IDB4ZmZmZlxuICAgIH0gZWxzZSBpZiAoYXJyYXlbaV0gPT09IEluZmluaXR5KSB7XG4gICAgICB1c2hvcnRzW2ldID0gMHg3YzAwXG4gICAgfSBlbHNlIGlmIChhcnJheVtpXSA9PT0gLUluZmluaXR5KSB7XG4gICAgICB1c2hvcnRzW2ldID0gMHhmYzAwXG4gICAgfSBlbHNlIHtcbiAgICAgIEZMT0FUWzBdID0gYXJyYXlbaV1cbiAgICAgIHZhciB4ID0gSU5UWzBdXG5cbiAgICAgIHZhciBzZ24gPSAoeCA+Pj4gMzEpIDw8IDE1XG4gICAgICB2YXIgZXhwID0gKCh4IDw8IDEpID4+PiAyNCkgLSAxMjdcbiAgICAgIHZhciBmcmFjID0gKHggPj4gMTMpICYgKCgxIDw8IDEwKSAtIDEpXG5cbiAgICAgIGlmIChleHAgPCAtMjQpIHtcbiAgICAgICAgLy8gcm91bmQgbm9uLXJlcHJlc2VudGFibGUgZGVub3JtYWxzIHRvIDBcbiAgICAgICAgdXNob3J0c1tpXSA9IHNnblxuICAgICAgfSBlbHNlIGlmIChleHAgPCAtMTQpIHtcbiAgICAgICAgLy8gaGFuZGxlIGRlbm9ybWFsc1xuICAgICAgICB2YXIgcyA9IC0xNCAtIGV4cFxuICAgICAgICB1c2hvcnRzW2ldID0gc2duICsgKChmcmFjICsgKDEgPDwgMTApKSA+PiBzKVxuICAgICAgfSBlbHNlIGlmIChleHAgPiAxNSkge1xuICAgICAgICAvLyByb3VuZCBvdmVyZmxvdyB0byArLy0gSW5maW5pdHlcbiAgICAgICAgdXNob3J0c1tpXSA9IHNnbiArIDB4N2MwMFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gb3RoZXJ3aXNlIGNvbnZlcnQgZGlyZWN0bHlcbiAgICAgICAgdXNob3J0c1tpXSA9IHNnbiArICgoZXhwICsgMTUpIDw8IDEwKSArIGZyYWNcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gdXNob3J0c1xufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAob2JqKSB7XG4gIHJldHVybiBPYmplY3Qua2V5cyhvYmopLm1hcChmdW5jdGlvbiAoa2V5KSB7IHJldHVybiBvYmpba2V5XSB9KVxufVxuIiwiLy8gQ29udGV4dCBhbmQgY2FudmFzIGNyZWF0aW9uIGhlbHBlciBmdW5jdGlvbnNcblxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vdXRpbC9leHRlbmQnKVxuXG5mdW5jdGlvbiBjcmVhdGVDYW52YXMgKGVsZW1lbnQsIG9uRG9uZSwgcGl4ZWxSYXRpbykge1xuICB2YXIgY2FudmFzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJylcbiAgZXh0ZW5kKGNhbnZhcy5zdHlsZSwge1xuICAgIGJvcmRlcjogMCxcbiAgICBtYXJnaW46IDAsXG4gICAgcGFkZGluZzogMCxcbiAgICB0b3A6IDAsXG4gICAgbGVmdDogMFxuICB9KVxuICBlbGVtZW50LmFwcGVuZENoaWxkKGNhbnZhcylcblxuICBpZiAoZWxlbWVudCA9PT0gZG9jdW1lbnQuYm9keSkge1xuICAgIGNhbnZhcy5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSdcbiAgICBleHRlbmQoZWxlbWVudC5zdHlsZSwge1xuICAgICAgbWFyZ2luOiAwLFxuICAgICAgcGFkZGluZzogMFxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiByZXNpemUgKCkge1xuICAgIHZhciB3ID0gd2luZG93LmlubmVyV2lkdGhcbiAgICB2YXIgaCA9IHdpbmRvdy5pbm5lckhlaWdodFxuICAgIGlmIChlbGVtZW50ICE9PSBkb2N1bWVudC5ib2R5KSB7XG4gICAgICB2YXIgYm91bmRzID0gZWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKVxuICAgICAgdyA9IGJvdW5kcy5yaWdodCAtIGJvdW5kcy5sZWZ0XG4gICAgICBoID0gYm91bmRzLnRvcCAtIGJvdW5kcy5ib3R0b21cbiAgICB9XG4gICAgY2FudmFzLndpZHRoID0gcGl4ZWxSYXRpbyAqIHdcbiAgICBjYW52YXMuaGVpZ2h0ID0gcGl4ZWxSYXRpbyAqIGhcbiAgICBleHRlbmQoY2FudmFzLnN0eWxlLCB7XG4gICAgICB3aWR0aDogdyArICdweCcsXG4gICAgICBoZWlnaHQ6IGggKyAncHgnXG4gICAgfSlcbiAgfVxuXG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdyZXNpemUnLCByZXNpemUsIGZhbHNlKVxuXG4gIGZ1bmN0aW9uIG9uRGVzdHJveSAoKSB7XG4gICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIHJlc2l6ZSlcbiAgICBlbGVtZW50LnJlbW92ZUNoaWxkKGNhbnZhcylcbiAgfVxuXG4gIHJlc2l6ZSgpXG5cbiAgcmV0dXJuIHtcbiAgICBjYW52YXM6IGNhbnZhcyxcbiAgICBvbkRlc3Ryb3k6IG9uRGVzdHJveVxuICB9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUNvbnRleHQgKGNhbnZhcywgY29udGV4QXR0cmlidXRlcykge1xuICBmdW5jdGlvbiBnZXQgKG5hbWUpIHtcbiAgICB0cnkge1xuICAgICAgcmV0dXJuIGNhbnZhcy5nZXRDb250ZXh0KG5hbWUsIGNvbnRleEF0dHJpYnV0ZXMpXG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG4gIH1cbiAgcmV0dXJuIChcbiAgICBnZXQoJ3dlYmdsJykgfHxcbiAgICBnZXQoJ2V4cGVyaW1lbnRhbC13ZWJnbCcpIHx8XG4gICAgZ2V0KCd3ZWJnbC1leHBlcmltZW50YWwnKVxuICApXG59XG5cbmZ1bmN0aW9uIGlzSFRNTEVsZW1lbnQgKG9iaikge1xuICByZXR1cm4gKFxuICAgIHR5cGVvZiBvYmoubm9kZU5hbWUgPT09ICdzdHJpbmcnICYmXG4gICAgdHlwZW9mIG9iai5hcHBlbmRDaGlsZCA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgIHR5cGVvZiBvYmouZ2V0Qm91bmRpbmdDbGllbnRSZWN0ID09PSAnZnVuY3Rpb24nXG4gIClcbn1cblxuZnVuY3Rpb24gaXNXZWJHTENvbnRleHQgKG9iaikge1xuICByZXR1cm4gKFxuICAgIHR5cGVvZiBvYmouZHJhd0FycmF5cyA9PT0gJ2Z1bmN0aW9uJyB8fFxuICAgIHR5cGVvZiBvYmouZHJhd0VsZW1lbnRzID09PSAnZnVuY3Rpb24nXG4gIClcbn1cblxuZnVuY3Rpb24gcGFyc2VFeHRlbnNpb25zIChpbnB1dCkge1xuICBpZiAodHlwZW9mIGlucHV0ID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBpbnB1dC5zcGxpdCgpXG4gIH1cbiAgXG4gIHJldHVybiBpbnB1dFxufVxuXG5mdW5jdGlvbiBnZXRFbGVtZW50IChkZXNjKSB7XG4gIGlmICh0eXBlb2YgZGVzYyA9PT0gJ3N0cmluZycpIHtcbiAgICBcbiAgICByZXR1cm4gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihkZXNjKVxuICB9XG4gIHJldHVybiBkZXNjXG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcGFyc2VBcmdzIChhcmdzXykge1xuICB2YXIgYXJncyA9IGFyZ3NfIHx8IHt9XG4gIHZhciBlbGVtZW50LCBjb250YWluZXIsIGNhbnZhcywgZ2xcbiAgdmFyIGNvbnRleHRBdHRyaWJ1dGVzID0ge31cbiAgdmFyIGV4dGVuc2lvbnMgPSBbXVxuICB2YXIgb3B0aW9uYWxFeHRlbnNpb25zID0gW11cbiAgdmFyIHBpeGVsUmF0aW8gPSAodHlwZW9mIHdpbmRvdyA9PT0gJ3VuZGVmaW5lZCcgPyAxIDogd2luZG93LmRldmljZVBpeGVsUmF0aW8pXG4gIHZhciBwcm9maWxlID0gZmFsc2VcbiAgdmFyIG9uRG9uZSA9IGZ1bmN0aW9uIChlcnIpIHtcbiAgICBpZiAoZXJyKSB7XG4gICAgICBcbiAgICB9XG4gIH1cbiAgdmFyIG9uRGVzdHJveSA9IGZ1bmN0aW9uICgpIHt9XG4gIGlmICh0eXBlb2YgYXJncyA9PT0gJ3N0cmluZycpIHtcbiAgICBcbiAgICBlbGVtZW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihhcmdzKVxuICAgIFxuICB9IGVsc2UgaWYgKHR5cGVvZiBhcmdzID09PSAnb2JqZWN0Jykge1xuICAgIGlmIChpc0hUTUxFbGVtZW50KGFyZ3MpKSB7XG4gICAgICBlbGVtZW50ID0gYXJnc1xuICAgIH0gZWxzZSBpZiAoaXNXZWJHTENvbnRleHQoYXJncykpIHtcbiAgICAgIGdsID0gYXJnc1xuICAgICAgY2FudmFzID0gZ2wuY2FudmFzXG4gICAgfSBlbHNlIHtcbiAgICAgIFxuICAgICAgaWYgKCdnbCcgaW4gYXJncykge1xuICAgICAgICBnbCA9IGFyZ3MuZ2xcbiAgICAgIH0gZWxzZSBpZiAoJ2NhbnZhcycgaW4gYXJncykge1xuICAgICAgICBjYW52YXMgPSBnZXRFbGVtZW50KGFyZ3MuY2FudmFzKVxuICAgICAgfSBlbHNlIGlmICgnY29udGFpbmVyJyBpbiBhcmdzKSB7XG4gICAgICAgIGNvbnRhaW5lciA9IGdldEVsZW1lbnQoYXJncy5jb250YWluZXIpXG4gICAgICB9XG4gICAgICBpZiAoJ2F0dHJpYnV0ZXMnIGluIGFyZ3MpIHtcbiAgICAgICAgY29udGV4dEF0dHJpYnV0ZXMgPSBhcmdzLmF0dHJpYnV0ZXNcbiAgICAgICAgXG4gICAgICB9XG4gICAgICBpZiAoJ2V4dGVuc2lvbnMnIGluIGFyZ3MpIHtcbiAgICAgICAgZXh0ZW5zaW9ucyA9IHBhcnNlRXh0ZW5zaW9ucyhhcmdzLmV4dGVuc2lvbnMpXG4gICAgICB9XG4gICAgICBpZiAoJ29wdGlvbmFsRXh0ZW5zaW9ucycgaW4gYXJncykge1xuICAgICAgICBvcHRpb25hbEV4dGVuc2lvbnMgPSBwYXJzZUV4dGVuc2lvbnMoYXJncy5vcHRpb25hbEV4dGVuc2lvbnMpXG4gICAgICB9XG4gICAgICBpZiAoJ29uRG9uZScgaW4gYXJncykge1xuICAgICAgICBcbiAgICAgICAgb25Eb25lID0gYXJncy5vbkRvbmVcbiAgICAgIH1cbiAgICAgIGlmICgncHJvZmlsZScgaW4gYXJncykge1xuICAgICAgICBwcm9maWxlID0gISFhcmdzLnByb2ZpbGVcbiAgICAgIH1cbiAgICAgIGlmICgncGl4ZWxSYXRpbycgaW4gYXJncykge1xuICAgICAgICBwaXhlbFJhdGlvID0gK2FyZ3MucGl4ZWxSYXRpb1xuICAgICAgICBcbiAgICAgIH1cbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgXG4gIH1cblxuICBpZiAoZWxlbWVudCkge1xuICAgIGlmIChlbGVtZW50Lm5vZGVOYW1lLnRvTG93ZXJDYXNlKCkgPT09ICdjYW52YXMnKSB7XG4gICAgICBjYW52YXMgPSBlbGVtZW50XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnRhaW5lciA9IGVsZW1lbnRcbiAgICB9XG4gIH1cblxuICBpZiAoIWdsKSB7XG4gICAgaWYgKCFjYW52YXMpIHtcbiAgICAgIFxuICAgICAgdmFyIHJlc3VsdCA9IGNyZWF0ZUNhbnZhcyhjb250YWluZXIgfHwgZG9jdW1lbnQuYm9keSwgb25Eb25lLCBwaXhlbFJhdGlvKVxuICAgICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgICAgcmV0dXJuIG51bGxcbiAgICAgIH1cbiAgICAgIGNhbnZhcyA9IHJlc3VsdC5jYW52YXNcbiAgICAgIG9uRGVzdHJveSA9IHJlc3VsdC5vbkRlc3Ryb3lcbiAgICB9XG4gICAgZ2wgPSBjcmVhdGVDb250ZXh0KGNhbnZhcywgY29udGV4dEF0dHJpYnV0ZXMpXG4gIH1cblxuICBpZiAoIWdsKSB7XG4gICAgb25EZXN0cm95KClcbiAgICBvbkRvbmUoJ3dlYmdsIG5vdCBzdXBwb3J0ZWQsIHRyeSB1cGdyYWRpbmcgeW91ciBicm93c2VyIG9yIGdyYXBoaWNzIGRyaXZlcnMgaHR0cDovL2dldC53ZWJnbC5vcmcnKVxuICAgIHJldHVybiBudWxsXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGdsOiBnbCxcbiAgICBjYW52YXM6IGNhbnZhcyxcbiAgICBjb250YWluZXI6IGNvbnRhaW5lcixcbiAgICBleHRlbnNpb25zOiBleHRlbnNpb25zLFxuICAgIG9wdGlvbmFsRXh0ZW5zaW9uczogb3B0aW9uYWxFeHRlbnNpb25zLFxuICAgIHBpeGVsUmF0aW86IHBpeGVsUmF0aW8sXG4gICAgcHJvZmlsZTogcHJvZmlsZSxcbiAgICBvbkRvbmU6IG9uRG9uZSxcbiAgICBvbkRlc3Ryb3k6IG9uRGVzdHJveVxuICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGFkZFxuXG4vKipcbiAqIEFkZHMgdHdvIHZlYzInc1xuICpcbiAqIEBwYXJhbSB7dmVjMn0gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzJ9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7dmVjMn0gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEByZXR1cm5zIHt2ZWMyfSBvdXRcbiAqL1xuZnVuY3Rpb24gYWRkKG91dCwgYSwgYikge1xuICAgIG91dFswXSA9IGFbMF0gKyBiWzBdXG4gICAgb3V0WzFdID0gYVsxXSArIGJbMV1cbiAgICByZXR1cm4gb3V0XG59IiwibW9kdWxlLmV4cG9ydHMgPSBjbG9uZVxuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgdmVjMiBpbml0aWFsaXplZCB3aXRoIHZhbHVlcyBmcm9tIGFuIGV4aXN0aW5nIHZlY3RvclxuICpcbiAqIEBwYXJhbSB7dmVjMn0gYSB2ZWN0b3IgdG8gY2xvbmVcbiAqIEByZXR1cm5zIHt2ZWMyfSBhIG5ldyAyRCB2ZWN0b3JcbiAqL1xuZnVuY3Rpb24gY2xvbmUoYSkge1xuICAgIHZhciBvdXQgPSBuZXcgRmxvYXQzMkFycmF5KDIpXG4gICAgb3V0WzBdID0gYVswXVxuICAgIG91dFsxXSA9IGFbMV1cbiAgICByZXR1cm4gb3V0XG59IiwibW9kdWxlLmV4cG9ydHMgPSBjb3B5XG5cbi8qKlxuICogQ29weSB0aGUgdmFsdWVzIGZyb20gb25lIHZlYzIgdG8gYW5vdGhlclxuICpcbiAqIEBwYXJhbSB7dmVjMn0gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzJ9IGEgdGhlIHNvdXJjZSB2ZWN0b3JcbiAqIEByZXR1cm5zIHt2ZWMyfSBvdXRcbiAqL1xuZnVuY3Rpb24gY29weShvdXQsIGEpIHtcbiAgICBvdXRbMF0gPSBhWzBdXG4gICAgb3V0WzFdID0gYVsxXVxuICAgIHJldHVybiBvdXRcbn0iLCJtb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZVxuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcsIGVtcHR5IHZlYzJcbiAqXG4gKiBAcmV0dXJucyB7dmVjMn0gYSBuZXcgMkQgdmVjdG9yXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZSgpIHtcbiAgICB2YXIgb3V0ID0gbmV3IEZsb2F0MzJBcnJheSgyKVxuICAgIG91dFswXSA9IDBcbiAgICBvdXRbMV0gPSAwXG4gICAgcmV0dXJuIG91dFxufSIsIm1vZHVsZS5leHBvcnRzID0gY3Jvc3NcblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgY3Jvc3MgcHJvZHVjdCBvZiB0d28gdmVjMidzXG4gKiBOb3RlIHRoYXQgdGhlIGNyb3NzIHByb2R1Y3QgbXVzdCBieSBkZWZpbml0aW9uIHByb2R1Y2UgYSAzRCB2ZWN0b3JcbiAqXG4gKiBAcGFyYW0ge3ZlYzN9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWMyfSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge3ZlYzJ9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcmV0dXJucyB7dmVjM30gb3V0XG4gKi9cbmZ1bmN0aW9uIGNyb3NzKG91dCwgYSwgYikge1xuICAgIHZhciB6ID0gYVswXSAqIGJbMV0gLSBhWzFdICogYlswXVxuICAgIG91dFswXSA9IG91dFsxXSA9IDBcbiAgICBvdXRbMl0gPSB6XG4gICAgcmV0dXJuIG91dFxufSIsIm1vZHVsZS5leHBvcnRzID0gZGlzdGFuY2VcblxuLyoqXG4gKiBDYWxjdWxhdGVzIHRoZSBldWNsaWRpYW4gZGlzdGFuY2UgYmV0d2VlbiB0d28gdmVjMidzXG4gKlxuICogQHBhcmFtIHt2ZWMyfSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge3ZlYzJ9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcmV0dXJucyB7TnVtYmVyfSBkaXN0YW5jZSBiZXR3ZWVuIGEgYW5kIGJcbiAqL1xuZnVuY3Rpb24gZGlzdGFuY2UoYSwgYikge1xuICAgIHZhciB4ID0gYlswXSAtIGFbMF0sXG4gICAgICAgIHkgPSBiWzFdIC0gYVsxXVxuICAgIHJldHVybiBNYXRoLnNxcnQoeCp4ICsgeSp5KVxufSIsIm1vZHVsZS5leHBvcnRzID0gZGl2aWRlXG5cbi8qKlxuICogRGl2aWRlcyB0d28gdmVjMidzXG4gKlxuICogQHBhcmFtIHt2ZWMyfSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjMn0gYSB0aGUgZmlyc3Qgb3BlcmFuZFxuICogQHBhcmFtIHt2ZWMyfSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHJldHVybnMge3ZlYzJ9IG91dFxuICovXG5mdW5jdGlvbiBkaXZpZGUob3V0LCBhLCBiKSB7XG4gICAgb3V0WzBdID0gYVswXSAvIGJbMF1cbiAgICBvdXRbMV0gPSBhWzFdIC8gYlsxXVxuICAgIHJldHVybiBvdXRcbn0iLCJtb2R1bGUuZXhwb3J0cyA9IGRvdFxuXG4vKipcbiAqIENhbGN1bGF0ZXMgdGhlIGRvdCBwcm9kdWN0IG9mIHR3byB2ZWMyJ3NcbiAqXG4gKiBAcGFyYW0ge3ZlYzJ9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7dmVjMn0gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IGRvdCBwcm9kdWN0IG9mIGEgYW5kIGJcbiAqL1xuZnVuY3Rpb24gZG90KGEsIGIpIHtcbiAgICByZXR1cm4gYVswXSAqIGJbMF0gKyBhWzFdICogYlsxXVxufSIsIm1vZHVsZS5leHBvcnRzID0gZm9yRWFjaFxuXG52YXIgdmVjID0gcmVxdWlyZSgnLi9jcmVhdGUnKSgpXG5cbi8qKlxuICogUGVyZm9ybSBzb21lIG9wZXJhdGlvbiBvdmVyIGFuIGFycmF5IG9mIHZlYzJzLlxuICpcbiAqIEBwYXJhbSB7QXJyYXl9IGEgdGhlIGFycmF5IG9mIHZlY3RvcnMgdG8gaXRlcmF0ZSBvdmVyXG4gKiBAcGFyYW0ge051bWJlcn0gc3RyaWRlIE51bWJlciBvZiBlbGVtZW50cyBiZXR3ZWVuIHRoZSBzdGFydCBvZiBlYWNoIHZlYzIuIElmIDAgYXNzdW1lcyB0aWdodGx5IHBhY2tlZFxuICogQHBhcmFtIHtOdW1iZXJ9IG9mZnNldCBOdW1iZXIgb2YgZWxlbWVudHMgdG8gc2tpcCBhdCB0aGUgYmVnaW5uaW5nIG9mIHRoZSBhcnJheVxuICogQHBhcmFtIHtOdW1iZXJ9IGNvdW50IE51bWJlciBvZiB2ZWMycyB0byBpdGVyYXRlIG92ZXIuIElmIDAgaXRlcmF0ZXMgb3ZlciBlbnRpcmUgYXJyYXlcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuIEZ1bmN0aW9uIHRvIGNhbGwgZm9yIGVhY2ggdmVjdG9yIGluIHRoZSBhcnJheVxuICogQHBhcmFtIHtPYmplY3R9IFthcmddIGFkZGl0aW9uYWwgYXJndW1lbnQgdG8gcGFzcyB0byBmblxuICogQHJldHVybnMge0FycmF5fSBhXG4gKiBAZnVuY3Rpb25cbiAqL1xuZnVuY3Rpb24gZm9yRWFjaChhLCBzdHJpZGUsIG9mZnNldCwgY291bnQsIGZuLCBhcmcpIHtcbiAgICB2YXIgaSwgbFxuICAgIGlmKCFzdHJpZGUpIHtcbiAgICAgICAgc3RyaWRlID0gMlxuICAgIH1cblxuICAgIGlmKCFvZmZzZXQpIHtcbiAgICAgICAgb2Zmc2V0ID0gMFxuICAgIH1cbiAgICBcbiAgICBpZihjb3VudCkge1xuICAgICAgICBsID0gTWF0aC5taW4oKGNvdW50ICogc3RyaWRlKSArIG9mZnNldCwgYS5sZW5ndGgpXG4gICAgfSBlbHNlIHtcbiAgICAgICAgbCA9IGEubGVuZ3RoXG4gICAgfVxuXG4gICAgZm9yKGkgPSBvZmZzZXQ7IGkgPCBsOyBpICs9IHN0cmlkZSkge1xuICAgICAgICB2ZWNbMF0gPSBhW2ldXG4gICAgICAgIHZlY1sxXSA9IGFbaSsxXVxuICAgICAgICBmbih2ZWMsIHZlYywgYXJnKVxuICAgICAgICBhW2ldID0gdmVjWzBdXG4gICAgICAgIGFbaSsxXSA9IHZlY1sxXVxuICAgIH1cbiAgICBcbiAgICByZXR1cm4gYVxufSIsIm1vZHVsZS5leHBvcnRzID0gZnJvbVZhbHVlc1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgdmVjMiBpbml0aWFsaXplZCB3aXRoIHRoZSBnaXZlbiB2YWx1ZXNcbiAqXG4gKiBAcGFyYW0ge051bWJlcn0geCBYIGNvbXBvbmVudFxuICogQHBhcmFtIHtOdW1iZXJ9IHkgWSBjb21wb25lbnRcbiAqIEByZXR1cm5zIHt2ZWMyfSBhIG5ldyAyRCB2ZWN0b3JcbiAqL1xuZnVuY3Rpb24gZnJvbVZhbHVlcyh4LCB5KSB7XG4gICAgdmFyIG91dCA9IG5ldyBGbG9hdDMyQXJyYXkoMilcbiAgICBvdXRbMF0gPSB4XG4gICAgb3V0WzFdID0geVxuICAgIHJldHVybiBvdXRcbn0iLCJtb2R1bGUuZXhwb3J0cyA9IHtcbiAgY3JlYXRlOiByZXF1aXJlKCcuL2NyZWF0ZScpXG4gICwgY2xvbmU6IHJlcXVpcmUoJy4vY2xvbmUnKVxuICAsIGZyb21WYWx1ZXM6IHJlcXVpcmUoJy4vZnJvbVZhbHVlcycpXG4gICwgY29weTogcmVxdWlyZSgnLi9jb3B5JylcbiAgLCBzZXQ6IHJlcXVpcmUoJy4vc2V0JylcbiAgLCBhZGQ6IHJlcXVpcmUoJy4vYWRkJylcbiAgLCBzdWJ0cmFjdDogcmVxdWlyZSgnLi9zdWJ0cmFjdCcpXG4gICwgbXVsdGlwbHk6IHJlcXVpcmUoJy4vbXVsdGlwbHknKVxuICAsIGRpdmlkZTogcmVxdWlyZSgnLi9kaXZpZGUnKVxuICAsIG1pbjogcmVxdWlyZSgnLi9taW4nKVxuICAsIG1heDogcmVxdWlyZSgnLi9tYXgnKVxuICAsIHNjYWxlOiByZXF1aXJlKCcuL3NjYWxlJylcbiAgLCBzY2FsZUFuZEFkZDogcmVxdWlyZSgnLi9zY2FsZUFuZEFkZCcpXG4gICwgZGlzdGFuY2U6IHJlcXVpcmUoJy4vZGlzdGFuY2UnKVxuICAsIHNxdWFyZWREaXN0YW5jZTogcmVxdWlyZSgnLi9zcXVhcmVkRGlzdGFuY2UnKVxuICAsIGxlbmd0aDogcmVxdWlyZSgnLi9sZW5ndGgnKVxuICAsIHNxdWFyZWRMZW5ndGg6IHJlcXVpcmUoJy4vc3F1YXJlZExlbmd0aCcpXG4gICwgbmVnYXRlOiByZXF1aXJlKCcuL25lZ2F0ZScpXG4gICwgbm9ybWFsaXplOiByZXF1aXJlKCcuL25vcm1hbGl6ZScpXG4gICwgZG90OiByZXF1aXJlKCcuL2RvdCcpXG4gICwgY3Jvc3M6IHJlcXVpcmUoJy4vY3Jvc3MnKVxuICAsIGxlcnA6IHJlcXVpcmUoJy4vbGVycCcpXG4gICwgcmFuZG9tOiByZXF1aXJlKCcuL3JhbmRvbScpXG4gICwgdHJhbnNmb3JtTWF0MjogcmVxdWlyZSgnLi90cmFuc2Zvcm1NYXQyJylcbiAgLCB0cmFuc2Zvcm1NYXQyZDogcmVxdWlyZSgnLi90cmFuc2Zvcm1NYXQyZCcpXG4gICwgdHJhbnNmb3JtTWF0MzogcmVxdWlyZSgnLi90cmFuc2Zvcm1NYXQzJylcbiAgLCB0cmFuc2Zvcm1NYXQ0OiByZXF1aXJlKCcuL3RyYW5zZm9ybU1hdDQnKVxuICAsIGZvckVhY2g6IHJlcXVpcmUoJy4vZm9yRWFjaCcpXG59IiwibW9kdWxlLmV4cG9ydHMgPSBsZW5ndGhcblxuLyoqXG4gKiBDYWxjdWxhdGVzIHRoZSBsZW5ndGggb2YgYSB2ZWMyXG4gKlxuICogQHBhcmFtIHt2ZWMyfSBhIHZlY3RvciB0byBjYWxjdWxhdGUgbGVuZ3RoIG9mXG4gKiBAcmV0dXJucyB7TnVtYmVyfSBsZW5ndGggb2YgYVxuICovXG5mdW5jdGlvbiBsZW5ndGgoYSkge1xuICAgIHZhciB4ID0gYVswXSxcbiAgICAgICAgeSA9IGFbMV1cbiAgICByZXR1cm4gTWF0aC5zcXJ0KHgqeCArIHkqeSlcbn0iLCJtb2R1bGUuZXhwb3J0cyA9IGxlcnBcblxuLyoqXG4gKiBQZXJmb3JtcyBhIGxpbmVhciBpbnRlcnBvbGF0aW9uIGJldHdlZW4gdHdvIHZlYzInc1xuICpcbiAqIEBwYXJhbSB7dmVjMn0gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzJ9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7dmVjMn0gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEBwYXJhbSB7TnVtYmVyfSB0IGludGVycG9sYXRpb24gYW1vdW50IGJldHdlZW4gdGhlIHR3byBpbnB1dHNcbiAqIEByZXR1cm5zIHt2ZWMyfSBvdXRcbiAqL1xuZnVuY3Rpb24gbGVycChvdXQsIGEsIGIsIHQpIHtcbiAgICB2YXIgYXggPSBhWzBdLFxuICAgICAgICBheSA9IGFbMV1cbiAgICBvdXRbMF0gPSBheCArIHQgKiAoYlswXSAtIGF4KVxuICAgIG91dFsxXSA9IGF5ICsgdCAqIChiWzFdIC0gYXkpXG4gICAgcmV0dXJuIG91dFxufSIsIm1vZHVsZS5leHBvcnRzID0gbWF4XG5cbi8qKlxuICogUmV0dXJucyB0aGUgbWF4aW11bSBvZiB0d28gdmVjMidzXG4gKlxuICogQHBhcmFtIHt2ZWMyfSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjMn0gYSB0aGUgZmlyc3Qgb3BlcmFuZFxuICogQHBhcmFtIHt2ZWMyfSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHJldHVybnMge3ZlYzJ9IG91dFxuICovXG5mdW5jdGlvbiBtYXgob3V0LCBhLCBiKSB7XG4gICAgb3V0WzBdID0gTWF0aC5tYXgoYVswXSwgYlswXSlcbiAgICBvdXRbMV0gPSBNYXRoLm1heChhWzFdLCBiWzFdKVxuICAgIHJldHVybiBvdXRcbn0iLCJtb2R1bGUuZXhwb3J0cyA9IG1pblxuXG4vKipcbiAqIFJldHVybnMgdGhlIG1pbmltdW0gb2YgdHdvIHZlYzInc1xuICpcbiAqIEBwYXJhbSB7dmVjMn0gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzJ9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7dmVjMn0gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEByZXR1cm5zIHt2ZWMyfSBvdXRcbiAqL1xuZnVuY3Rpb24gbWluKG91dCwgYSwgYikge1xuICAgIG91dFswXSA9IE1hdGgubWluKGFbMF0sIGJbMF0pXG4gICAgb3V0WzFdID0gTWF0aC5taW4oYVsxXSwgYlsxXSlcbiAgICByZXR1cm4gb3V0XG59IiwibW9kdWxlLmV4cG9ydHMgPSBtdWx0aXBseVxuXG4vKipcbiAqIE11bHRpcGxpZXMgdHdvIHZlYzInc1xuICpcbiAqIEBwYXJhbSB7dmVjMn0gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzJ9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7dmVjMn0gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEByZXR1cm5zIHt2ZWMyfSBvdXRcbiAqL1xuZnVuY3Rpb24gbXVsdGlwbHkob3V0LCBhLCBiKSB7XG4gICAgb3V0WzBdID0gYVswXSAqIGJbMF1cbiAgICBvdXRbMV0gPSBhWzFdICogYlsxXVxuICAgIHJldHVybiBvdXRcbn0iLCJtb2R1bGUuZXhwb3J0cyA9IG5lZ2F0ZVxuXG4vKipcbiAqIE5lZ2F0ZXMgdGhlIGNvbXBvbmVudHMgb2YgYSB2ZWMyXG4gKlxuICogQHBhcmFtIHt2ZWMyfSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjMn0gYSB2ZWN0b3IgdG8gbmVnYXRlXG4gKiBAcmV0dXJucyB7dmVjMn0gb3V0XG4gKi9cbmZ1bmN0aW9uIG5lZ2F0ZShvdXQsIGEpIHtcbiAgICBvdXRbMF0gPSAtYVswXVxuICAgIG91dFsxXSA9IC1hWzFdXG4gICAgcmV0dXJuIG91dFxufSIsIm1vZHVsZS5leHBvcnRzID0gbm9ybWFsaXplXG5cbi8qKlxuICogTm9ybWFsaXplIGEgdmVjMlxuICpcbiAqIEBwYXJhbSB7dmVjMn0gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzJ9IGEgdmVjdG9yIHRvIG5vcm1hbGl6ZVxuICogQHJldHVybnMge3ZlYzJ9IG91dFxuICovXG5mdW5jdGlvbiBub3JtYWxpemUob3V0LCBhKSB7XG4gICAgdmFyIHggPSBhWzBdLFxuICAgICAgICB5ID0gYVsxXVxuICAgIHZhciBsZW4gPSB4KnggKyB5KnlcbiAgICBpZiAobGVuID4gMCkge1xuICAgICAgICAvL1RPRE86IGV2YWx1YXRlIHVzZSBvZiBnbG1faW52c3FydCBoZXJlP1xuICAgICAgICBsZW4gPSAxIC8gTWF0aC5zcXJ0KGxlbilcbiAgICAgICAgb3V0WzBdID0gYVswXSAqIGxlblxuICAgICAgICBvdXRbMV0gPSBhWzFdICogbGVuXG4gICAgfVxuICAgIHJldHVybiBvdXRcbn0iLCJtb2R1bGUuZXhwb3J0cyA9IHJhbmRvbVxuXG4vKipcbiAqIEdlbmVyYXRlcyBhIHJhbmRvbSB2ZWN0b3Igd2l0aCB0aGUgZ2l2ZW4gc2NhbGVcbiAqXG4gKiBAcGFyYW0ge3ZlYzJ9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHtOdW1iZXJ9IFtzY2FsZV0gTGVuZ3RoIG9mIHRoZSByZXN1bHRpbmcgdmVjdG9yLiBJZiBvbW1pdHRlZCwgYSB1bml0IHZlY3RvciB3aWxsIGJlIHJldHVybmVkXG4gKiBAcmV0dXJucyB7dmVjMn0gb3V0XG4gKi9cbmZ1bmN0aW9uIHJhbmRvbShvdXQsIHNjYWxlKSB7XG4gICAgc2NhbGUgPSBzY2FsZSB8fCAxLjBcbiAgICB2YXIgciA9IE1hdGgucmFuZG9tKCkgKiAyLjAgKiBNYXRoLlBJXG4gICAgb3V0WzBdID0gTWF0aC5jb3MocikgKiBzY2FsZVxuICAgIG91dFsxXSA9IE1hdGguc2luKHIpICogc2NhbGVcbiAgICByZXR1cm4gb3V0XG59IiwibW9kdWxlLmV4cG9ydHMgPSBzY2FsZVxuXG4vKipcbiAqIFNjYWxlcyBhIHZlYzIgYnkgYSBzY2FsYXIgbnVtYmVyXG4gKlxuICogQHBhcmFtIHt2ZWMyfSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjMn0gYSB0aGUgdmVjdG9yIHRvIHNjYWxlXG4gKiBAcGFyYW0ge051bWJlcn0gYiBhbW91bnQgdG8gc2NhbGUgdGhlIHZlY3RvciBieVxuICogQHJldHVybnMge3ZlYzJ9IG91dFxuICovXG5mdW5jdGlvbiBzY2FsZShvdXQsIGEsIGIpIHtcbiAgICBvdXRbMF0gPSBhWzBdICogYlxuICAgIG91dFsxXSA9IGFbMV0gKiBiXG4gICAgcmV0dXJuIG91dFxufSIsIm1vZHVsZS5leHBvcnRzID0gc2NhbGVBbmRBZGRcblxuLyoqXG4gKiBBZGRzIHR3byB2ZWMyJ3MgYWZ0ZXIgc2NhbGluZyB0aGUgc2Vjb25kIG9wZXJhbmQgYnkgYSBzY2FsYXIgdmFsdWVcbiAqXG4gKiBAcGFyYW0ge3ZlYzJ9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWMyfSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge3ZlYzJ9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcGFyYW0ge051bWJlcn0gc2NhbGUgdGhlIGFtb3VudCB0byBzY2FsZSBiIGJ5IGJlZm9yZSBhZGRpbmdcbiAqIEByZXR1cm5zIHt2ZWMyfSBvdXRcbiAqL1xuZnVuY3Rpb24gc2NhbGVBbmRBZGQob3V0LCBhLCBiLCBzY2FsZSkge1xuICAgIG91dFswXSA9IGFbMF0gKyAoYlswXSAqIHNjYWxlKVxuICAgIG91dFsxXSA9IGFbMV0gKyAoYlsxXSAqIHNjYWxlKVxuICAgIHJldHVybiBvdXRcbn0iLCJtb2R1bGUuZXhwb3J0cyA9IHNldFxuXG4vKipcbiAqIFNldCB0aGUgY29tcG9uZW50cyBvZiBhIHZlYzIgdG8gdGhlIGdpdmVuIHZhbHVlc1xuICpcbiAqIEBwYXJhbSB7dmVjMn0gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge051bWJlcn0geCBYIGNvbXBvbmVudFxuICogQHBhcmFtIHtOdW1iZXJ9IHkgWSBjb21wb25lbnRcbiAqIEByZXR1cm5zIHt2ZWMyfSBvdXRcbiAqL1xuZnVuY3Rpb24gc2V0KG91dCwgeCwgeSkge1xuICAgIG91dFswXSA9IHhcbiAgICBvdXRbMV0gPSB5XG4gICAgcmV0dXJuIG91dFxufSIsIm1vZHVsZS5leHBvcnRzID0gc3F1YXJlZERpc3RhbmNlXG5cbi8qKlxuICogQ2FsY3VsYXRlcyB0aGUgc3F1YXJlZCBldWNsaWRpYW4gZGlzdGFuY2UgYmV0d2VlbiB0d28gdmVjMidzXG4gKlxuICogQHBhcmFtIHt2ZWMyfSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge3ZlYzJ9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcmV0dXJucyB7TnVtYmVyfSBzcXVhcmVkIGRpc3RhbmNlIGJldHdlZW4gYSBhbmQgYlxuICovXG5mdW5jdGlvbiBzcXVhcmVkRGlzdGFuY2UoYSwgYikge1xuICAgIHZhciB4ID0gYlswXSAtIGFbMF0sXG4gICAgICAgIHkgPSBiWzFdIC0gYVsxXVxuICAgIHJldHVybiB4KnggKyB5Knlcbn0iLCJtb2R1bGUuZXhwb3J0cyA9IHNxdWFyZWRMZW5ndGhcblxuLyoqXG4gKiBDYWxjdWxhdGVzIHRoZSBzcXVhcmVkIGxlbmd0aCBvZiBhIHZlYzJcbiAqXG4gKiBAcGFyYW0ge3ZlYzJ9IGEgdmVjdG9yIHRvIGNhbGN1bGF0ZSBzcXVhcmVkIGxlbmd0aCBvZlxuICogQHJldHVybnMge051bWJlcn0gc3F1YXJlZCBsZW5ndGggb2YgYVxuICovXG5mdW5jdGlvbiBzcXVhcmVkTGVuZ3RoKGEpIHtcbiAgICB2YXIgeCA9IGFbMF0sXG4gICAgICAgIHkgPSBhWzFdXG4gICAgcmV0dXJuIHgqeCArIHkqeVxufSIsIm1vZHVsZS5leHBvcnRzID0gc3VidHJhY3RcblxuLyoqXG4gKiBTdWJ0cmFjdHMgdmVjdG9yIGIgZnJvbSB2ZWN0b3IgYVxuICpcbiAqIEBwYXJhbSB7dmVjMn0gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzJ9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7dmVjMn0gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEByZXR1cm5zIHt2ZWMyfSBvdXRcbiAqL1xuZnVuY3Rpb24gc3VidHJhY3Qob3V0LCBhLCBiKSB7XG4gICAgb3V0WzBdID0gYVswXSAtIGJbMF1cbiAgICBvdXRbMV0gPSBhWzFdIC0gYlsxXVxuICAgIHJldHVybiBvdXRcbn0iLCJtb2R1bGUuZXhwb3J0cyA9IHRyYW5zZm9ybU1hdDJcblxuLyoqXG4gKiBUcmFuc2Zvcm1zIHRoZSB2ZWMyIHdpdGggYSBtYXQyXG4gKlxuICogQHBhcmFtIHt2ZWMyfSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjMn0gYSB0aGUgdmVjdG9yIHRvIHRyYW5zZm9ybVxuICogQHBhcmFtIHttYXQyfSBtIG1hdHJpeCB0byB0cmFuc2Zvcm0gd2l0aFxuICogQHJldHVybnMge3ZlYzJ9IG91dFxuICovXG5mdW5jdGlvbiB0cmFuc2Zvcm1NYXQyKG91dCwgYSwgbSkge1xuICAgIHZhciB4ID0gYVswXSxcbiAgICAgICAgeSA9IGFbMV1cbiAgICBvdXRbMF0gPSBtWzBdICogeCArIG1bMl0gKiB5XG4gICAgb3V0WzFdID0gbVsxXSAqIHggKyBtWzNdICogeVxuICAgIHJldHVybiBvdXRcbn0iLCJtb2R1bGUuZXhwb3J0cyA9IHRyYW5zZm9ybU1hdDJkXG5cbi8qKlxuICogVHJhbnNmb3JtcyB0aGUgdmVjMiB3aXRoIGEgbWF0MmRcbiAqXG4gKiBAcGFyYW0ge3ZlYzJ9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWMyfSBhIHRoZSB2ZWN0b3IgdG8gdHJhbnNmb3JtXG4gKiBAcGFyYW0ge21hdDJkfSBtIG1hdHJpeCB0byB0cmFuc2Zvcm0gd2l0aFxuICogQHJldHVybnMge3ZlYzJ9IG91dFxuICovXG5mdW5jdGlvbiB0cmFuc2Zvcm1NYXQyZChvdXQsIGEsIG0pIHtcbiAgICB2YXIgeCA9IGFbMF0sXG4gICAgICAgIHkgPSBhWzFdXG4gICAgb3V0WzBdID0gbVswXSAqIHggKyBtWzJdICogeSArIG1bNF1cbiAgICBvdXRbMV0gPSBtWzFdICogeCArIG1bM10gKiB5ICsgbVs1XVxuICAgIHJldHVybiBvdXRcbn0iLCJtb2R1bGUuZXhwb3J0cyA9IHRyYW5zZm9ybU1hdDNcblxuLyoqXG4gKiBUcmFuc2Zvcm1zIHRoZSB2ZWMyIHdpdGggYSBtYXQzXG4gKiAzcmQgdmVjdG9yIGNvbXBvbmVudCBpcyBpbXBsaWNpdGx5ICcxJ1xuICpcbiAqIEBwYXJhbSB7dmVjMn0gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzJ9IGEgdGhlIHZlY3RvciB0byB0cmFuc2Zvcm1cbiAqIEBwYXJhbSB7bWF0M30gbSBtYXRyaXggdG8gdHJhbnNmb3JtIHdpdGhcbiAqIEByZXR1cm5zIHt2ZWMyfSBvdXRcbiAqL1xuZnVuY3Rpb24gdHJhbnNmb3JtTWF0MyhvdXQsIGEsIG0pIHtcbiAgICB2YXIgeCA9IGFbMF0sXG4gICAgICAgIHkgPSBhWzFdXG4gICAgb3V0WzBdID0gbVswXSAqIHggKyBtWzNdICogeSArIG1bNl1cbiAgICBvdXRbMV0gPSBtWzFdICogeCArIG1bNF0gKiB5ICsgbVs3XVxuICAgIHJldHVybiBvdXRcbn0iLCJtb2R1bGUuZXhwb3J0cyA9IHRyYW5zZm9ybU1hdDRcblxuLyoqXG4gKiBUcmFuc2Zvcm1zIHRoZSB2ZWMyIHdpdGggYSBtYXQ0XG4gKiAzcmQgdmVjdG9yIGNvbXBvbmVudCBpcyBpbXBsaWNpdGx5ICcwJ1xuICogNHRoIHZlY3RvciBjb21wb25lbnQgaXMgaW1wbGljaXRseSAnMSdcbiAqXG4gKiBAcGFyYW0ge3ZlYzJ9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWMyfSBhIHRoZSB2ZWN0b3IgdG8gdHJhbnNmb3JtXG4gKiBAcGFyYW0ge21hdDR9IG0gbWF0cml4IHRvIHRyYW5zZm9ybSB3aXRoXG4gKiBAcmV0dXJucyB7dmVjMn0gb3V0XG4gKi9cbmZ1bmN0aW9uIHRyYW5zZm9ybU1hdDQob3V0LCBhLCBtKSB7XG4gICAgdmFyIHggPSBhWzBdLCBcbiAgICAgICAgeSA9IGFbMV1cbiAgICBvdXRbMF0gPSBtWzBdICogeCArIG1bNF0gKiB5ICsgbVsxMl1cbiAgICBvdXRbMV0gPSBtWzFdICogeCArIG1bNV0gKiB5ICsgbVsxM11cbiAgICByZXR1cm4gb3V0XG59IiwiJ3VzZSBzdHJpY3QnXG5cbm1vZHVsZS5leHBvcnRzID0gbW91c2VMaXN0ZW5cblxudmFyIG1vdXNlID0gcmVxdWlyZSgnbW91c2UtZXZlbnQnKVxuXG5mdW5jdGlvbiBtb3VzZUxpc3RlbihlbGVtZW50LCBjYWxsYmFjaykge1xuICBpZighY2FsbGJhY2spIHtcbiAgICBjYWxsYmFjayA9IGVsZW1lbnRcbiAgICBlbGVtZW50ID0gd2luZG93XG4gIH1cblxuICB2YXIgYnV0dG9uU3RhdGUgPSAwXG4gIHZhciB4ID0gMFxuICB2YXIgeSA9IDBcbiAgdmFyIG1vZHMgPSB7XG4gICAgc2hpZnQ6ICAgZmFsc2UsXG4gICAgYWx0OiAgICAgZmFsc2UsXG4gICAgY29udHJvbDogZmFsc2UsXG4gICAgbWV0YTogICAgZmFsc2VcbiAgfVxuICB2YXIgYXR0YWNoZWQgPSBmYWxzZVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZU1vZHMoZXYpIHtcbiAgICB2YXIgY2hhbmdlZCA9IGZhbHNlXG4gICAgaWYoJ2FsdEtleScgaW4gZXYpIHtcbiAgICAgIGNoYW5nZWQgPSBjaGFuZ2VkIHx8IGV2LmFsdEtleSAhPT0gbW9kcy5hbHRcbiAgICAgIG1vZHMuYWx0ID0gISFldi5hbHRLZXlcbiAgICB9XG4gICAgaWYoJ3NoaWZ0S2V5JyBpbiBldikge1xuICAgICAgY2hhbmdlZCA9IGNoYW5nZWQgfHwgZXYuc2hpZnRLZXkgIT09IG1vZHMuc2hpZnRcbiAgICAgIG1vZHMuc2hpZnQgPSAhIWV2LnNoaWZ0S2V5XG4gICAgfVxuICAgIGlmKCdjdHJsS2V5JyBpbiBldikge1xuICAgICAgY2hhbmdlZCA9IGNoYW5nZWQgfHwgZXYuY3RybEtleSAhPT0gbW9kcy5jb250cm9sXG4gICAgICBtb2RzLmNvbnRyb2wgPSAhIWV2LmN0cmxLZXlcbiAgICB9XG4gICAgaWYoJ21ldGFLZXknIGluIGV2KSB7XG4gICAgICBjaGFuZ2VkID0gY2hhbmdlZCB8fCBldi5tZXRhS2V5ICE9PSBtb2RzLm1ldGFcbiAgICAgIG1vZHMubWV0YSA9ICEhZXYubWV0YUtleVxuICAgIH1cbiAgICByZXR1cm4gY2hhbmdlZFxuICB9XG5cbiAgZnVuY3Rpb24gaGFuZGxlRXZlbnQobmV4dEJ1dHRvbnMsIGV2KSB7XG4gICAgdmFyIG5leHRYID0gbW91c2UueChldilcbiAgICB2YXIgbmV4dFkgPSBtb3VzZS55KGV2KVxuICAgIGlmKCdidXR0b25zJyBpbiBldikge1xuICAgICAgbmV4dEJ1dHRvbnMgPSBldi5idXR0b25zfDBcbiAgICB9XG4gICAgaWYobmV4dEJ1dHRvbnMgIT09IGJ1dHRvblN0YXRlIHx8XG4gICAgICAgbmV4dFggIT09IHggfHxcbiAgICAgICBuZXh0WSAhPT0geSB8fFxuICAgICAgIHVwZGF0ZU1vZHMoZXYpKSB7XG4gICAgICBidXR0b25TdGF0ZSA9IG5leHRCdXR0b25zfDBcbiAgICAgIHggPSBuZXh0WHx8MFxuICAgICAgeSA9IG5leHRZfHwwXG4gICAgICBjYWxsYmFjayAmJiBjYWxsYmFjayhidXR0b25TdGF0ZSwgeCwgeSwgbW9kcylcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBjbGVhclN0YXRlKGV2KSB7XG4gICAgaGFuZGxlRXZlbnQoMCwgZXYpXG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVCbHVyKCkge1xuICAgIGlmKGJ1dHRvblN0YXRlIHx8XG4gICAgICB4IHx8XG4gICAgICB5IHx8XG4gICAgICBtb2RzLnNoaWZ0IHx8XG4gICAgICBtb2RzLmFsdCB8fFxuICAgICAgbW9kcy5tZXRhIHx8XG4gICAgICBtb2RzLmNvbnRyb2wpIHtcblxuICAgICAgeCA9IHkgPSAwXG4gICAgICBidXR0b25TdGF0ZSA9IDBcbiAgICAgIG1vZHMuc2hpZnQgPSBtb2RzLmFsdCA9IG1vZHMuY29udHJvbCA9IG1vZHMubWV0YSA9IGZhbHNlXG4gICAgICBjYWxsYmFjayAmJiBjYWxsYmFjaygwLCAwLCAwLCBtb2RzKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZU1vZHMoZXYpIHtcbiAgICBpZih1cGRhdGVNb2RzKGV2KSkge1xuICAgICAgY2FsbGJhY2sgJiYgY2FsbGJhY2soYnV0dG9uU3RhdGUsIHgsIHksIG1vZHMpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaGFuZGxlTW91c2VNb3ZlKGV2KSB7XG4gICAgaWYobW91c2UuYnV0dG9ucyhldikgPT09IDApIHtcbiAgICAgIGhhbmRsZUV2ZW50KDAsIGV2KVxuICAgIH0gZWxzZSB7XG4gICAgICBoYW5kbGVFdmVudChidXR0b25TdGF0ZSwgZXYpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaGFuZGxlTW91c2VEb3duKGV2KSB7XG4gICAgaGFuZGxlRXZlbnQoYnV0dG9uU3RhdGUgfCBtb3VzZS5idXR0b25zKGV2KSwgZXYpXG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVNb3VzZVVwKGV2KSB7XG4gICAgaGFuZGxlRXZlbnQoYnV0dG9uU3RhdGUgJiB+bW91c2UuYnV0dG9ucyhldiksIGV2KVxuICB9XG5cbiAgZnVuY3Rpb24gYXR0YWNoTGlzdGVuZXJzKCkge1xuICAgIGlmKGF0dGFjaGVkKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgYXR0YWNoZWQgPSB0cnVlXG5cbiAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIGhhbmRsZU1vdXNlTW92ZSlcblxuICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgaGFuZGxlTW91c2VEb3duKVxuXG4gICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZXVwJywgaGFuZGxlTW91c2VVcClcblxuICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VsZWF2ZScsIGNsZWFyU3RhdGUpXG4gICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWVudGVyJywgY2xlYXJTdGF0ZSlcbiAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlb3V0JywgY2xlYXJTdGF0ZSlcbiAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlb3ZlcicsIGNsZWFyU3RhdGUpXG5cbiAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2JsdXInLCBoYW5kbGVCbHVyKVxuXG4gICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXl1cCcsIGhhbmRsZU1vZHMpXG4gICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgaGFuZGxlTW9kcylcbiAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXByZXNzJywgaGFuZGxlTW9kcylcblxuICAgIGlmKGVsZW1lbnQgIT09IHdpbmRvdykge1xuICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2JsdXInLCBoYW5kbGVCbHVyKVxuXG4gICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5dXAnLCBoYW5kbGVNb2RzKVxuICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBoYW5kbGVNb2RzKVxuICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXByZXNzJywgaGFuZGxlTW9kcylcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBkZXRhY2hMaXN0ZW5lcnMoKSB7XG4gICAgaWYoIWF0dGFjaGVkKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgYXR0YWNoZWQgPSBmYWxzZVxuXG4gICAgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCBoYW5kbGVNb3VzZU1vdmUpXG5cbiAgICBlbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIGhhbmRsZU1vdXNlRG93bilcblxuICAgIGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW91c2V1cCcsIGhhbmRsZU1vdXNlVXApXG5cbiAgICBlbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNlbGVhdmUnLCBjbGVhclN0YXRlKVxuICAgIGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW91c2VlbnRlcicsIGNsZWFyU3RhdGUpXG4gICAgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZW91dCcsIGNsZWFyU3RhdGUpXG4gICAgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZW92ZXInLCBjbGVhclN0YXRlKVxuXG4gICAgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdibHVyJywgaGFuZGxlQmx1cilcblxuICAgIGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcigna2V5dXAnLCBoYW5kbGVNb2RzKVxuICAgIGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIGhhbmRsZU1vZHMpXG4gICAgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdrZXlwcmVzcycsIGhhbmRsZU1vZHMpXG5cbiAgICBpZihlbGVtZW50ICE9PSB3aW5kb3cpIHtcbiAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdibHVyJywgaGFuZGxlQmx1cilcblxuICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleXVwJywgaGFuZGxlTW9kcylcbiAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdrZXlkb3duJywgaGFuZGxlTW9kcylcbiAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdrZXlwcmVzcycsIGhhbmRsZU1vZHMpXG4gICAgfVxuICB9XG5cbiAgLy9BdHRhY2ggbGlzdGVuZXJzXG4gIGF0dGFjaExpc3RlbmVycygpXG5cbiAgdmFyIHJlc3VsdCA9IHtcbiAgICBlbGVtZW50OiBlbGVtZW50XG4gIH1cblxuICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyhyZXN1bHQsIHtcbiAgICBlbmFibGVkOiB7XG4gICAgICBnZXQ6IGZ1bmN0aW9uKCkgeyByZXR1cm4gYXR0YWNoZWQgfSxcbiAgICAgIHNldDogZnVuY3Rpb24oZikge1xuICAgICAgICBpZihmKSB7XG4gICAgICAgICAgYXR0YWNoTGlzdGVuZXJzKClcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBkZXRhY2hMaXN0ZW5lcnNcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIGVudW1lcmFibGU6IHRydWVcbiAgICB9LFxuICAgIGJ1dHRvbnM6IHtcbiAgICAgIGdldDogZnVuY3Rpb24oKSB7IHJldHVybiBidXR0b25TdGF0ZSB9LFxuICAgICAgZW51bWVyYWJsZTogdHJ1ZVxuICAgIH0sXG4gICAgeDoge1xuICAgICAgZ2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIHggfSxcbiAgICAgIGVudW1lcmFibGU6IHRydWVcbiAgICB9LFxuICAgIHk6IHtcbiAgICAgIGdldDogZnVuY3Rpb24oKSB7IHJldHVybiB5IH0sXG4gICAgICBlbnVtZXJhYmxlOiB0cnVlXG4gICAgfSxcbiAgICBtb2RzOiB7XG4gICAgICBnZXQ6IGZ1bmN0aW9uKCkgeyByZXR1cm4gbW9kcyB9LFxuICAgICAgZW51bWVyYWJsZTogdHJ1ZVxuICAgIH1cbiAgfSlcblxuICByZXR1cm4gcmVzdWx0XG59XG4iLCIndXNlIHN0cmljdCdcblxuZnVuY3Rpb24gbW91c2VCdXR0b25zKGV2KSB7XG4gIGlmKHR5cGVvZiBldiA9PT0gJ29iamVjdCcpIHtcbiAgICBpZignYnV0dG9ucycgaW4gZXYpIHtcbiAgICAgIHJldHVybiBldi5idXR0b25zXG4gICAgfSBlbHNlIGlmKCd3aGljaCcgaW4gZXYpIHtcbiAgICAgIHZhciBiID0gZXYud2hpY2hcbiAgICAgIGlmKGIgPT09IDIpIHtcbiAgICAgICAgcmV0dXJuIDRcbiAgICAgIH0gZWxzZSBpZihiID09PSAzKSB7XG4gICAgICAgIHJldHVybiAyXG4gICAgICB9IGVsc2UgaWYoYiA+IDApIHtcbiAgICAgICAgcmV0dXJuIDE8PChiLTEpXG4gICAgICB9XG4gICAgfSBlbHNlIGlmKCdidXR0b24nIGluIGV2KSB7XG4gICAgICB2YXIgYiA9IGV2LmJ1dHRvblxuICAgICAgaWYoYiA9PT0gMSkge1xuICAgICAgICByZXR1cm4gNFxuICAgICAgfSBlbHNlIGlmKGIgPT09IDIpIHtcbiAgICAgICAgcmV0dXJuIDJcbiAgICAgIH0gZWxzZSBpZihiID49IDApIHtcbiAgICAgICAgcmV0dXJuIDE8PGJcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIDBcbn1cbmV4cG9ydHMuYnV0dG9ucyA9IG1vdXNlQnV0dG9uc1xuXG5mdW5jdGlvbiBtb3VzZUVsZW1lbnQoZXYpIHtcbiAgcmV0dXJuIGV2LnRhcmdldCB8fCBldi5zcmNFbGVtZW50IHx8IHdpbmRvd1xufVxuZXhwb3J0cy5lbGVtZW50ID0gbW91c2VFbGVtZW50XG5cbmZ1bmN0aW9uIG1vdXNlUmVsYXRpdmVYKGV2KSB7XG4gIGlmKHR5cGVvZiBldiA9PT0gJ29iamVjdCcpIHtcbiAgICBpZignb2Zmc2V0WCcgaW4gZXYpIHtcbiAgICAgIHJldHVybiBldi5vZmZzZXRYXG4gICAgfVxuICAgIHZhciB0YXJnZXQgPSBtb3VzZUVsZW1lbnQoZXYpXG4gICAgdmFyIGJvdW5kcyA9IHRhcmdldC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKVxuICAgIHJldHVybiBldi5jbGllbnRYIC0gYm91bmRzLmxlZnRcbiAgfVxuICByZXR1cm4gMFxufVxuZXhwb3J0cy54ID0gbW91c2VSZWxhdGl2ZVhcblxuZnVuY3Rpb24gbW91c2VSZWxhdGl2ZVkoZXYpIHtcbiAgaWYodHlwZW9mIGV2ID09PSAnb2JqZWN0Jykge1xuICAgIGlmKCdvZmZzZXRZJyBpbiBldikge1xuICAgICAgcmV0dXJuIGV2Lm9mZnNldFlcbiAgICB9XG4gICAgdmFyIHRhcmdldCA9IG1vdXNlRWxlbWVudChldilcbiAgICB2YXIgYm91bmRzID0gdGFyZ2V0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpXG4gICAgcmV0dXJuIGV2LmNsaWVudFkgLSBib3VuZHMudG9wXG4gIH1cbiAgcmV0dXJuIDBcbn1cbmV4cG9ydHMueSA9IG1vdXNlUmVsYXRpdmVZXG4iLCJcbnZhciBleHRlbmQgPSByZXF1aXJlKCcuL2xpYi91dGlsL2V4dGVuZCcpXG52YXIgZHluYW1pYyA9IHJlcXVpcmUoJy4vbGliL2R5bmFtaWMnKVxudmFyIHJhZiA9IHJlcXVpcmUoJy4vbGliL3V0aWwvcmFmJylcbnZhciBjbG9jayA9IHJlcXVpcmUoJy4vbGliL3V0aWwvY2xvY2snKVxudmFyIGNyZWF0ZVN0cmluZ1N0b3JlID0gcmVxdWlyZSgnLi9saWIvc3RyaW5ncycpXG52YXIgaW5pdFdlYkdMID0gcmVxdWlyZSgnLi9saWIvd2ViZ2wnKVxudmFyIHdyYXBFeHRlbnNpb25zID0gcmVxdWlyZSgnLi9saWIvZXh0ZW5zaW9uJylcbnZhciB3cmFwTGltaXRzID0gcmVxdWlyZSgnLi9saWIvbGltaXRzJylcbnZhciB3cmFwQnVmZmVycyA9IHJlcXVpcmUoJy4vbGliL2J1ZmZlcicpXG52YXIgd3JhcEVsZW1lbnRzID0gcmVxdWlyZSgnLi9saWIvZWxlbWVudHMnKVxudmFyIHdyYXBUZXh0dXJlcyA9IHJlcXVpcmUoJy4vbGliL3RleHR1cmUnKVxudmFyIHdyYXBSZW5kZXJidWZmZXJzID0gcmVxdWlyZSgnLi9saWIvcmVuZGVyYnVmZmVyJylcbnZhciB3cmFwRnJhbWVidWZmZXJzID0gcmVxdWlyZSgnLi9saWIvZnJhbWVidWZmZXInKVxudmFyIHdyYXBBdHRyaWJ1dGVzID0gcmVxdWlyZSgnLi9saWIvYXR0cmlidXRlJylcbnZhciB3cmFwU2hhZGVycyA9IHJlcXVpcmUoJy4vbGliL3NoYWRlcicpXG52YXIgd3JhcFJlYWQgPSByZXF1aXJlKCcuL2xpYi9yZWFkJylcbnZhciBjcmVhdGVDb3JlID0gcmVxdWlyZSgnLi9saWIvY29yZScpXG52YXIgY3JlYXRlU3RhdHMgPSByZXF1aXJlKCcuL2xpYi9zdGF0cycpXG52YXIgY3JlYXRlVGltZXIgPSByZXF1aXJlKCcuL2xpYi90aW1lcicpXG5cbnZhciBHTF9DT0xPUl9CVUZGRVJfQklUID0gMTYzODRcbnZhciBHTF9ERVBUSF9CVUZGRVJfQklUID0gMjU2XG52YXIgR0xfU1RFTkNJTF9CVUZGRVJfQklUID0gMTAyNFxuXG52YXIgR0xfQVJSQVlfQlVGRkVSID0gMzQ5NjJcblxudmFyIENPTlRFWFRfTE9TVF9FVkVOVCA9ICd3ZWJnbGNvbnRleHRsb3N0J1xudmFyIENPTlRFWFRfUkVTVE9SRURfRVZFTlQgPSAnd2ViZ2xjb250ZXh0cmVzdG9yZWQnXG5cbnZhciBEWU5fUFJPUCA9IDFcbnZhciBEWU5fQ09OVEVYVCA9IDJcbnZhciBEWU5fU1RBVEUgPSAzXG5cbmZ1bmN0aW9uIGZpbmQgKGhheXN0YWNrLCBuZWVkbGUpIHtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBoYXlzdGFjay5sZW5ndGg7ICsraSkge1xuICAgIGlmIChoYXlzdGFja1tpXSA9PT0gbmVlZGxlKSB7XG4gICAgICByZXR1cm4gaVxuICAgIH1cbiAgfVxuICByZXR1cm4gLTFcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB3cmFwUkVHTCAoYXJncykge1xuICB2YXIgY29uZmlnID0gaW5pdFdlYkdMKGFyZ3MpXG4gIGlmICghY29uZmlnKSB7XG4gICAgcmV0dXJuIG51bGxcbiAgfVxuXG4gIHZhciBnbCA9IGNvbmZpZy5nbFxuICB2YXIgZ2xBdHRyaWJ1dGVzID0gZ2wuZ2V0Q29udGV4dEF0dHJpYnV0ZXMoKVxuICB2YXIgY29udGV4dExvc3QgPSBnbC5pc0NvbnRleHRMb3N0KClcblxuICB2YXIgZXh0ZW5zaW9uU3RhdGUgPSB3cmFwRXh0ZW5zaW9ucyhnbCwgY29uZmlnKVxuICBpZiAoIWV4dGVuc2lvblN0YXRlKSB7XG4gICAgcmV0dXJuIG51bGxcbiAgfVxuXG4gIHZhciBzdHJpbmdTdG9yZSA9IGNyZWF0ZVN0cmluZ1N0b3JlKClcbiAgdmFyIHN0YXRzID0gY3JlYXRlU3RhdHMoKVxuICB2YXIgZXh0ZW5zaW9ucyA9IGV4dGVuc2lvblN0YXRlLmV4dGVuc2lvbnNcbiAgdmFyIHRpbWVyID0gY3JlYXRlVGltZXIoZ2wsIGV4dGVuc2lvbnMpXG5cbiAgdmFyIFNUQVJUX1RJTUUgPSBjbG9jaygpXG4gIHZhciBXSURUSCA9IGdsLmRyYXdpbmdCdWZmZXJXaWR0aFxuICB2YXIgSEVJR0hUID0gZ2wuZHJhd2luZ0J1ZmZlckhlaWdodFxuXG4gIHZhciBjb250ZXh0U3RhdGUgPSB7XG4gICAgdGljazogMCxcbiAgICB0aW1lOiAwLFxuICAgIHZpZXdwb3J0V2lkdGg6IFdJRFRILFxuICAgIHZpZXdwb3J0SGVpZ2h0OiBIRUlHSFQsXG4gICAgZnJhbWVidWZmZXJXaWR0aDogV0lEVEgsXG4gICAgZnJhbWVidWZmZXJIZWlnaHQ6IEhFSUdIVCxcbiAgICBkcmF3aW5nQnVmZmVyV2lkdGg6IFdJRFRILFxuICAgIGRyYXdpbmdCdWZmZXJIZWlnaHQ6IEhFSUdIVCxcbiAgICBwaXhlbFJhdGlvOiBjb25maWcucGl4ZWxSYXRpb1xuICB9XG4gIHZhciB1bmlmb3JtU3RhdGUgPSB7fVxuICB2YXIgZHJhd1N0YXRlID0ge1xuICAgIGVsZW1lbnRzOiBudWxsLFxuICAgIHByaW1pdGl2ZTogNCwgLy8gR0xfVFJJQU5HTEVTXG4gICAgY291bnQ6IC0xLFxuICAgIG9mZnNldDogMCxcbiAgICBpbnN0YW5jZXM6IC0xXG4gIH1cblxuICB2YXIgbGltaXRzID0gd3JhcExpbWl0cyhnbCwgZXh0ZW5zaW9ucylcbiAgdmFyIGJ1ZmZlclN0YXRlID0gd3JhcEJ1ZmZlcnMoZ2wsIHN0YXRzLCBjb25maWcpXG4gIHZhciBlbGVtZW50U3RhdGUgPSB3cmFwRWxlbWVudHMoZ2wsIGV4dGVuc2lvbnMsIGJ1ZmZlclN0YXRlLCBzdGF0cylcbiAgdmFyIGF0dHJpYnV0ZVN0YXRlID0gd3JhcEF0dHJpYnV0ZXMoXG4gICAgZ2wsXG4gICAgZXh0ZW5zaW9ucyxcbiAgICBsaW1pdHMsXG4gICAgYnVmZmVyU3RhdGUsXG4gICAgc3RyaW5nU3RvcmUpXG4gIHZhciBzaGFkZXJTdGF0ZSA9IHdyYXBTaGFkZXJzKGdsLCBzdHJpbmdTdG9yZSwgc3RhdHMsIGNvbmZpZylcbiAgdmFyIHRleHR1cmVTdGF0ZSA9IHdyYXBUZXh0dXJlcyhcbiAgICBnbCxcbiAgICBleHRlbnNpb25zLFxuICAgIGxpbWl0cyxcbiAgICBmdW5jdGlvbiAoKSB7IGNvcmUucHJvY3MucG9sbCgpIH0sXG4gICAgY29udGV4dFN0YXRlLFxuICAgIHN0YXRzLFxuICAgIGNvbmZpZylcbiAgdmFyIHJlbmRlcmJ1ZmZlclN0YXRlID0gd3JhcFJlbmRlcmJ1ZmZlcnMoZ2wsIGV4dGVuc2lvbnMsIGxpbWl0cywgc3RhdHMsIGNvbmZpZylcbiAgdmFyIGZyYW1lYnVmZmVyU3RhdGUgPSB3cmFwRnJhbWVidWZmZXJzKFxuICAgIGdsLFxuICAgIGV4dGVuc2lvbnMsXG4gICAgbGltaXRzLFxuICAgIHRleHR1cmVTdGF0ZSxcbiAgICByZW5kZXJidWZmZXJTdGF0ZSxcbiAgICBzdGF0cylcbiAgdmFyIGNvcmUgPSBjcmVhdGVDb3JlKFxuICAgIGdsLFxuICAgIHN0cmluZ1N0b3JlLFxuICAgIGV4dGVuc2lvbnMsXG4gICAgbGltaXRzLFxuICAgIGJ1ZmZlclN0YXRlLFxuICAgIGVsZW1lbnRTdGF0ZSxcbiAgICB0ZXh0dXJlU3RhdGUsXG4gICAgZnJhbWVidWZmZXJTdGF0ZSxcbiAgICB1bmlmb3JtU3RhdGUsXG4gICAgYXR0cmlidXRlU3RhdGUsXG4gICAgc2hhZGVyU3RhdGUsXG4gICAgZHJhd1N0YXRlLFxuICAgIGNvbnRleHRTdGF0ZSxcbiAgICB0aW1lcixcbiAgICBjb25maWcpXG4gIHZhciByZWFkUGl4ZWxzID0gd3JhcFJlYWQoXG4gICAgZ2wsXG4gICAgZnJhbWVidWZmZXJTdGF0ZSxcbiAgICBjb3JlLnByb2NzLnBvbGwsXG4gICAgY29udGV4dFN0YXRlLFxuICAgIGdsQXR0cmlidXRlcywgZXh0ZW5zaW9ucylcblxuICB2YXIgbmV4dFN0YXRlID0gY29yZS5uZXh0XG4gIHZhciBjYW52YXMgPSBnbC5jYW52YXNcblxuICB2YXIgcmFmQ2FsbGJhY2tzID0gW11cbiAgdmFyIGxvc3NDYWxsYmFja3MgPSBbXVxuICB2YXIgcmVzdG9yZUNhbGxiYWNrcyA9IFtdXG4gIHZhciBkZXN0cm95Q2FsbGJhY2tzID0gW2NvbmZpZy5vbkRlc3Ryb3ldXG5cbiAgdmFyIGFjdGl2ZVJBRiA9IG51bGxcbiAgZnVuY3Rpb24gaGFuZGxlUkFGICgpIHtcbiAgICBpZiAocmFmQ2FsbGJhY2tzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgaWYgKHRpbWVyKSB7XG4gICAgICAgIHRpbWVyLnVwZGF0ZSgpXG4gICAgICB9XG4gICAgICBhY3RpdmVSQUYgPSBudWxsXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICAvLyBzY2hlZHVsZSBuZXh0IGFuaW1hdGlvbiBmcmFtZVxuICAgIGFjdGl2ZVJBRiA9IHJhZi5uZXh0KGhhbmRsZVJBRilcblxuICAgIC8vIHBvbGwgZm9yIGNoYW5nZXNcbiAgICBwb2xsKClcblxuICAgIC8vIGZpcmUgYSBjYWxsYmFjayBmb3IgYWxsIHBlbmRpbmcgcmFmc1xuICAgIGZvciAodmFyIGkgPSByYWZDYWxsYmFja3MubGVuZ3RoIC0gMTsgaSA+PSAwOyAtLWkpIHtcbiAgICAgIHZhciBjYiA9IHJhZkNhbGxiYWNrc1tpXVxuICAgICAgaWYgKGNiKSB7XG4gICAgICAgIGNiKGNvbnRleHRTdGF0ZSwgbnVsbCwgMClcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBmbHVzaCBhbGwgcGVuZGluZyB3ZWJnbCBjYWxsc1xuICAgIGdsLmZsdXNoKClcblxuICAgIC8vIHBvbGwgR1BVIHRpbWVycyAqYWZ0ZXIqIGdsLmZsdXNoIHNvIHdlIGRvbid0IGRlbGF5IGNvbW1hbmQgZGlzcGF0Y2hcbiAgICBpZiAodGltZXIpIHtcbiAgICAgIHRpbWVyLnVwZGF0ZSgpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc3RhcnRSQUYgKCkge1xuICAgIGlmICghYWN0aXZlUkFGICYmIHJhZkNhbGxiYWNrcy5sZW5ndGggPiAwKSB7XG4gICAgICBhY3RpdmVSQUYgPSByYWYubmV4dChoYW5kbGVSQUYpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc3RvcFJBRiAoKSB7XG4gICAgaWYgKGFjdGl2ZVJBRikge1xuICAgICAgcmFmLmNhbmNlbChoYW5kbGVSQUYpXG4gICAgICBhY3RpdmVSQUYgPSBudWxsXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaGFuZGxlQ29udGV4dExvc3MgKGV2ZW50KSB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKVxuXG4gICAgLy8gc2V0IGNvbnRleHQgbG9zdCBmbGFnXG4gICAgY29udGV4dExvc3QgPSB0cnVlXG5cbiAgICAvLyBwYXVzZSByZXF1ZXN0IGFuaW1hdGlvbiBmcmFtZVxuICAgIHN0b3BSQUYoKVxuXG4gICAgLy8gbG9zZSBjb250ZXh0XG4gICAgbG9zc0NhbGxiYWNrcy5mb3JFYWNoKGZ1bmN0aW9uIChjYikge1xuICAgICAgY2IoKVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVDb250ZXh0UmVzdG9yZWQgKGV2ZW50KSB7XG4gICAgLy8gY2xlYXIgZXJyb3IgY29kZVxuICAgIGdsLmdldEVycm9yKClcblxuICAgIC8vIGNsZWFyIGNvbnRleHQgbG9zdCBmbGFnXG4gICAgY29udGV4dExvc3QgPSBmYWxzZVxuXG4gICAgLy8gcmVmcmVzaCBzdGF0ZVxuICAgIGV4dGVuc2lvblN0YXRlLnJlc3RvcmUoKVxuICAgIHNoYWRlclN0YXRlLnJlc3RvcmUoKVxuICAgIGJ1ZmZlclN0YXRlLnJlc3RvcmUoKVxuICAgIHRleHR1cmVTdGF0ZS5yZXN0b3JlKClcbiAgICByZW5kZXJidWZmZXJTdGF0ZS5yZXN0b3JlKClcbiAgICBmcmFtZWJ1ZmZlclN0YXRlLnJlc3RvcmUoKVxuICAgIGlmICh0aW1lcikge1xuICAgICAgdGltZXIucmVzdG9yZSgpXG4gICAgfVxuXG4gICAgLy8gcmVmcmVzaCBzdGF0ZVxuICAgIGNvcmUucHJvY3MucmVmcmVzaCgpXG5cbiAgICAvLyByZXN0YXJ0IFJBRlxuICAgIHN0YXJ0UkFGKClcblxuICAgIC8vIHJlc3RvcmUgY29udGV4dFxuICAgIHJlc3RvcmVDYWxsYmFja3MuZm9yRWFjaChmdW5jdGlvbiAoY2IpIHtcbiAgICAgIGNiKClcbiAgICB9KVxuICB9XG5cbiAgaWYgKGNhbnZhcykge1xuICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKENPTlRFWFRfTE9TVF9FVkVOVCwgaGFuZGxlQ29udGV4dExvc3MsIGZhbHNlKVxuICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKENPTlRFWFRfUkVTVE9SRURfRVZFTlQsIGhhbmRsZUNvbnRleHRSZXN0b3JlZCwgZmFsc2UpXG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95ICgpIHtcbiAgICByYWZDYWxsYmFja3MubGVuZ3RoID0gMFxuICAgIHN0b3BSQUYoKVxuXG4gICAgaWYgKGNhbnZhcykge1xuICAgICAgY2FudmFzLnJlbW92ZUV2ZW50TGlzdGVuZXIoQ09OVEVYVF9MT1NUX0VWRU5ULCBoYW5kbGVDb250ZXh0TG9zcylcbiAgICAgIGNhbnZhcy5yZW1vdmVFdmVudExpc3RlbmVyKENPTlRFWFRfUkVTVE9SRURfRVZFTlQsIGhhbmRsZUNvbnRleHRSZXN0b3JlZClcbiAgICB9XG5cbiAgICBzaGFkZXJTdGF0ZS5jbGVhcigpXG4gICAgZnJhbWVidWZmZXJTdGF0ZS5jbGVhcigpXG4gICAgcmVuZGVyYnVmZmVyU3RhdGUuY2xlYXIoKVxuICAgIHRleHR1cmVTdGF0ZS5jbGVhcigpXG4gICAgZWxlbWVudFN0YXRlLmNsZWFyKClcbiAgICBidWZmZXJTdGF0ZS5jbGVhcigpXG5cbiAgICBpZiAodGltZXIpIHtcbiAgICAgIHRpbWVyLmNsZWFyKClcbiAgICB9XG5cbiAgICBkZXN0cm95Q2FsbGJhY2tzLmZvckVhY2goZnVuY3Rpb24gKGNiKSB7XG4gICAgICBjYigpXG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGNvbXBpbGVQcm9jZWR1cmUgKG9wdGlvbnMpIHtcbiAgICBcbiAgICBcblxuICAgIGZ1bmN0aW9uIGZsYXR0ZW5OZXN0ZWRPcHRpb25zIChvcHRpb25zKSB7XG4gICAgICB2YXIgcmVzdWx0ID0gZXh0ZW5kKHt9LCBvcHRpb25zKVxuICAgICAgZGVsZXRlIHJlc3VsdC51bmlmb3Jtc1xuICAgICAgZGVsZXRlIHJlc3VsdC5hdHRyaWJ1dGVzXG4gICAgICBkZWxldGUgcmVzdWx0LmNvbnRleHRcblxuICAgICAgaWYgKCdzdGVuY2lsJyBpbiByZXN1bHQgJiYgcmVzdWx0LnN0ZW5jaWwub3ApIHtcbiAgICAgICAgcmVzdWx0LnN0ZW5jaWwub3BCYWNrID0gcmVzdWx0LnN0ZW5jaWwub3BGcm9udCA9IHJlc3VsdC5zdGVuY2lsLm9wXG4gICAgICAgIGRlbGV0ZSByZXN1bHQuc3RlbmNpbC5vcFxuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBtZXJnZSAobmFtZSkge1xuICAgICAgICBpZiAobmFtZSBpbiByZXN1bHQpIHtcbiAgICAgICAgICB2YXIgY2hpbGQgPSByZXN1bHRbbmFtZV1cbiAgICAgICAgICBkZWxldGUgcmVzdWx0W25hbWVdXG4gICAgICAgICAgT2JqZWN0LmtleXMoY2hpbGQpLmZvckVhY2goZnVuY3Rpb24gKHByb3ApIHtcbiAgICAgICAgICAgIHJlc3VsdFtuYW1lICsgJy4nICsgcHJvcF0gPSBjaGlsZFtwcm9wXVxuICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIG1lcmdlKCdibGVuZCcpXG4gICAgICBtZXJnZSgnZGVwdGgnKVxuICAgICAgbWVyZ2UoJ2N1bGwnKVxuICAgICAgbWVyZ2UoJ3N0ZW5jaWwnKVxuICAgICAgbWVyZ2UoJ3BvbHlnb25PZmZzZXQnKVxuICAgICAgbWVyZ2UoJ3NjaXNzb3InKVxuICAgICAgbWVyZ2UoJ3NhbXBsZScpXG5cbiAgICAgIHJldHVybiByZXN1bHRcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzZXBhcmF0ZUR5bmFtaWMgKG9iamVjdCkge1xuICAgICAgdmFyIHN0YXRpY0l0ZW1zID0ge31cbiAgICAgIHZhciBkeW5hbWljSXRlbXMgPSB7fVxuICAgICAgT2JqZWN0LmtleXMob2JqZWN0KS5mb3JFYWNoKGZ1bmN0aW9uIChvcHRpb24pIHtcbiAgICAgICAgdmFyIHZhbHVlID0gb2JqZWN0W29wdGlvbl1cbiAgICAgICAgaWYgKGR5bmFtaWMuaXNEeW5hbWljKHZhbHVlKSkge1xuICAgICAgICAgIGR5bmFtaWNJdGVtc1tvcHRpb25dID0gZHluYW1pYy51bmJveCh2YWx1ZSwgb3B0aW9uKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHN0YXRpY0l0ZW1zW29wdGlvbl0gPSB2YWx1ZVxuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgZHluYW1pYzogZHluYW1pY0l0ZW1zLFxuICAgICAgICBzdGF0aWM6IHN0YXRpY0l0ZW1zXG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gVHJlYXQgY29udGV4dCB2YXJpYWJsZXMgc2VwYXJhdGUgZnJvbSBvdGhlciBkeW5hbWljIHZhcmlhYmxlc1xuICAgIHZhciBjb250ZXh0ID0gc2VwYXJhdGVEeW5hbWljKG9wdGlvbnMuY29udGV4dCB8fCB7fSlcbiAgICB2YXIgdW5pZm9ybXMgPSBzZXBhcmF0ZUR5bmFtaWMob3B0aW9ucy51bmlmb3JtcyB8fCB7fSlcbiAgICB2YXIgYXR0cmlidXRlcyA9IHNlcGFyYXRlRHluYW1pYyhvcHRpb25zLmF0dHJpYnV0ZXMgfHwge30pXG4gICAgdmFyIG9wdHMgPSBzZXBhcmF0ZUR5bmFtaWMoZmxhdHRlbk5lc3RlZE9wdGlvbnMob3B0aW9ucykpXG5cbiAgICB2YXIgc3RhdHMgPSB7XG4gICAgICBncHVUaW1lOiAwLjAsXG4gICAgICBjcHVUaW1lOiAwLjAsXG4gICAgICBjb3VudDogMFxuICAgIH1cblxuICAgIHZhciBjb21waWxlZCA9IGNvcmUuY29tcGlsZShvcHRzLCBhdHRyaWJ1dGVzLCB1bmlmb3JtcywgY29udGV4dCwgc3RhdHMpXG5cbiAgICB2YXIgZHJhdyA9IGNvbXBpbGVkLmRyYXdcbiAgICB2YXIgYmF0Y2ggPSBjb21waWxlZC5iYXRjaFxuICAgIHZhciBzY29wZSA9IGNvbXBpbGVkLnNjb3BlXG5cbiAgICAvLyBGSVhNRTogd2Ugc2hvdWxkIG1vZGlmeSBjb2RlIGdlbmVyYXRpb24gZm9yIGJhdGNoIGNvbW1hbmRzIHNvIHRoaXNcbiAgICAvLyBpc24ndCBuZWNlc3NhcnlcbiAgICB2YXIgRU1QVFlfQVJSQVkgPSBbXVxuICAgIGZ1bmN0aW9uIHJlc2VydmUgKGNvdW50KSB7XG4gICAgICB3aGlsZSAoRU1QVFlfQVJSQVkubGVuZ3RoIDwgY291bnQpIHtcbiAgICAgICAgRU1QVFlfQVJSQVkucHVzaChudWxsKVxuICAgICAgfVxuICAgICAgcmV0dXJuIEVNUFRZX0FSUkFZXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gUkVHTENvbW1hbmQgKGFyZ3MsIGJvZHkpIHtcbiAgICAgIHZhciBpXG4gICAgICBpZiAoY29udGV4dExvc3QpIHtcbiAgICAgICAgXG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIGFyZ3MgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgcmV0dXJuIHNjb3BlLmNhbGwodGhpcywgbnVsbCwgYXJncywgMClcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGJvZHkgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBhcmdzID09PSAnbnVtYmVyJykge1xuICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBhcmdzOyArK2kpIHtcbiAgICAgICAgICAgIHNjb3BlLmNhbGwodGhpcywgbnVsbCwgYm9keSwgaSlcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShhcmdzKSkge1xuICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBhcmdzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgICBzY29wZS5jYWxsKHRoaXMsIGFyZ3NbaV0sIGJvZHksIGkpXG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVyblxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBzY29wZS5jYWxsKHRoaXMsIGFyZ3MsIGJvZHksIDApXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGFyZ3MgPT09ICdudW1iZXInKSB7XG4gICAgICAgIGlmIChhcmdzID4gMCkge1xuICAgICAgICAgIHJldHVybiBiYXRjaC5jYWxsKHRoaXMsIHJlc2VydmUoYXJncyB8IDApLCBhcmdzIHwgMClcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGFyZ3MpKSB7XG4gICAgICAgIGlmIChhcmdzLmxlbmd0aCkge1xuICAgICAgICAgIHJldHVybiBiYXRjaC5jYWxsKHRoaXMsIGFyZ3MsIGFyZ3MubGVuZ3RoKVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZHJhdy5jYWxsKHRoaXMsIGFyZ3MpXG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGV4dGVuZChSRUdMQ29tbWFuZCwge1xuICAgICAgc3RhdHM6IHN0YXRzXG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGNsZWFyIChvcHRpb25zKSB7XG4gICAgXG5cbiAgICB2YXIgY2xlYXJGbGFncyA9IDBcbiAgICBjb3JlLnByb2NzLnBvbGwoKVxuXG4gICAgdmFyIGMgPSBvcHRpb25zLmNvbG9yXG4gICAgaWYgKGMpIHtcbiAgICAgIGdsLmNsZWFyQ29sb3IoK2NbMF0gfHwgMCwgK2NbMV0gfHwgMCwgK2NbMl0gfHwgMCwgK2NbM10gfHwgMClcbiAgICAgIGNsZWFyRmxhZ3MgfD0gR0xfQ09MT1JfQlVGRkVSX0JJVFxuICAgIH1cbiAgICBpZiAoJ2RlcHRoJyBpbiBvcHRpb25zKSB7XG4gICAgICBnbC5jbGVhckRlcHRoKCtvcHRpb25zLmRlcHRoKVxuICAgICAgY2xlYXJGbGFncyB8PSBHTF9ERVBUSF9CVUZGRVJfQklUXG4gICAgfVxuICAgIGlmICgnc3RlbmNpbCcgaW4gb3B0aW9ucykge1xuICAgICAgZ2wuY2xlYXJTdGVuY2lsKG9wdGlvbnMuc3RlbmNpbCB8IDApXG4gICAgICBjbGVhckZsYWdzIHw9IEdMX1NURU5DSUxfQlVGRkVSX0JJVFxuICAgIH1cblxuICAgIFxuICAgIGdsLmNsZWFyKGNsZWFyRmxhZ3MpXG4gIH1cblxuICBmdW5jdGlvbiBmcmFtZSAoY2IpIHtcbiAgICBcbiAgICByYWZDYWxsYmFja3MucHVzaChjYilcblxuICAgIGZ1bmN0aW9uIGNhbmNlbCAoKSB7XG4gICAgICAvLyBGSVhNRTogIHNob3VsZCB3ZSBjaGVjayBzb21ldGhpbmcgb3RoZXIgdGhhbiBlcXVhbHMgY2IgaGVyZT9cbiAgICAgIC8vIHdoYXQgaWYgYSB1c2VyIGNhbGxzIGZyYW1lIHR3aWNlIHdpdGggdGhlIHNhbWUgY2FsbGJhY2suLi5cbiAgICAgIC8vXG4gICAgICB2YXIgaSA9IGZpbmQocmFmQ2FsbGJhY2tzLCBjYilcbiAgICAgIFxuICAgICAgZnVuY3Rpb24gcGVuZGluZ0NhbmNlbCAoKSB7XG4gICAgICAgIHZhciBpbmRleCA9IGZpbmQocmFmQ2FsbGJhY2tzLCBwZW5kaW5nQ2FuY2VsKVxuICAgICAgICByYWZDYWxsYmFja3NbaW5kZXhdID0gcmFmQ2FsbGJhY2tzW3JhZkNhbGxiYWNrcy5sZW5ndGggLSAxXVxuICAgICAgICByYWZDYWxsYmFja3MubGVuZ3RoIC09IDFcbiAgICAgICAgaWYgKHJhZkNhbGxiYWNrcy5sZW5ndGggPD0gMCkge1xuICAgICAgICAgIHN0b3BSQUYoKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICByYWZDYWxsYmFja3NbaV0gPSBwZW5kaW5nQ2FuY2VsXG4gICAgfVxuXG4gICAgc3RhcnRSQUYoKVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGNhbmNlbDogY2FuY2VsXG4gICAgfVxuICB9XG5cbiAgLy8gcG9sbCB2aWV3cG9ydFxuICBmdW5jdGlvbiBwb2xsVmlld3BvcnQgKCkge1xuICAgIHZhciB2aWV3cG9ydCA9IG5leHRTdGF0ZS52aWV3cG9ydFxuICAgIHZhciBzY2lzc29yQm94ID0gbmV4dFN0YXRlLnNjaXNzb3JfYm94XG4gICAgdmlld3BvcnRbMF0gPSB2aWV3cG9ydFsxXSA9IHNjaXNzb3JCb3hbMF0gPSBzY2lzc29yQm94WzFdID0gMFxuICAgIGNvbnRleHRTdGF0ZS52aWV3cG9ydFdpZHRoID1cbiAgICAgIGNvbnRleHRTdGF0ZS5mcmFtZWJ1ZmZlcldpZHRoID1cbiAgICAgIGNvbnRleHRTdGF0ZS5kcmF3aW5nQnVmZmVyV2lkdGggPVxuICAgICAgdmlld3BvcnRbMl0gPVxuICAgICAgc2Npc3NvckJveFsyXSA9IGdsLmRyYXdpbmdCdWZmZXJXaWR0aFxuICAgIGNvbnRleHRTdGF0ZS52aWV3cG9ydEhlaWdodCA9XG4gICAgICBjb250ZXh0U3RhdGUuZnJhbWVidWZmZXJIZWlnaHQgPVxuICAgICAgY29udGV4dFN0YXRlLmRyYXdpbmdCdWZmZXJIZWlnaHQgPVxuICAgICAgdmlld3BvcnRbM10gPVxuICAgICAgc2Npc3NvckJveFszXSA9IGdsLmRyYXdpbmdCdWZmZXJIZWlnaHRcbiAgfVxuXG4gIGZ1bmN0aW9uIHBvbGwgKCkge1xuICAgIGNvbnRleHRTdGF0ZS50aWNrICs9IDFcbiAgICBjb250ZXh0U3RhdGUudGltZSA9IG5vdygpXG4gICAgcG9sbFZpZXdwb3J0KClcbiAgICBjb3JlLnByb2NzLnBvbGwoKVxuICB9XG5cbiAgZnVuY3Rpb24gcmVmcmVzaCAoKSB7XG4gICAgcG9sbFZpZXdwb3J0KClcbiAgICBjb3JlLnByb2NzLnJlZnJlc2goKVxuICAgIGlmICh0aW1lcikge1xuICAgICAgdGltZXIudXBkYXRlKClcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBub3cgKCkge1xuICAgIHJldHVybiAoY2xvY2soKSAtIFNUQVJUX1RJTUUpIC8gMTAwMC4wXG4gIH1cblxuICByZWZyZXNoKClcblxuICBmdW5jdGlvbiBhZGRMaXN0ZW5lciAoZXZlbnQsIGNhbGxiYWNrKSB7XG4gICAgXG5cbiAgICB2YXIgY2FsbGJhY2tzXG4gICAgc3dpdGNoIChldmVudCkge1xuICAgICAgY2FzZSAnZnJhbWUnOlxuICAgICAgICByZXR1cm4gZnJhbWUoY2FsbGJhY2spXG4gICAgICBjYXNlICdsb3N0JzpcbiAgICAgICAgY2FsbGJhY2tzID0gbG9zc0NhbGxiYWNrc1xuICAgICAgICBicmVha1xuICAgICAgY2FzZSAncmVzdG9yZSc6XG4gICAgICAgIGNhbGxiYWNrcyA9IHJlc3RvcmVDYWxsYmFja3NcbiAgICAgICAgYnJlYWtcbiAgICAgIGNhc2UgJ2Rlc3Ryb3knOlxuICAgICAgICBjYWxsYmFja3MgPSBkZXN0cm95Q2FsbGJhY2tzXG4gICAgICAgIGJyZWFrXG4gICAgICBkZWZhdWx0OlxuICAgICAgICBcbiAgICB9XG5cbiAgICBjYWxsYmFja3MucHVzaChjYWxsYmFjaylcbiAgICByZXR1cm4ge1xuICAgICAgY2FuY2VsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY2FsbGJhY2tzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgaWYgKGNhbGxiYWNrc1tpXSA9PT0gY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGNhbGxiYWNrc1tpXSA9IGNhbGxiYWNrc1tjYWxsYmFja3MubGVuZ3RoIC0gMV1cbiAgICAgICAgICAgIGNhbGxiYWNrcy5wb3AoKVxuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgdmFyIHJlZ2wgPSBleHRlbmQoY29tcGlsZVByb2NlZHVyZSwge1xuICAgIC8vIENsZWFyIGN1cnJlbnQgRkJPXG4gICAgY2xlYXI6IGNsZWFyLFxuXG4gICAgLy8gU2hvcnQgY3V0cyBmb3IgZHluYW1pYyB2YXJpYWJsZXNcbiAgICBwcm9wOiBkeW5hbWljLmRlZmluZS5iaW5kKG51bGwsIERZTl9QUk9QKSxcbiAgICBjb250ZXh0OiBkeW5hbWljLmRlZmluZS5iaW5kKG51bGwsIERZTl9DT05URVhUKSxcbiAgICB0aGlzOiBkeW5hbWljLmRlZmluZS5iaW5kKG51bGwsIERZTl9TVEFURSksXG5cbiAgICAvLyBleGVjdXRlcyBhbiBlbXB0eSBkcmF3IGNvbW1hbmRcbiAgICBkcmF3OiBjb21waWxlUHJvY2VkdXJlKHt9KSxcblxuICAgIC8vIFJlc291cmNlc1xuICAgIGJ1ZmZlcjogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgIHJldHVybiBidWZmZXJTdGF0ZS5jcmVhdGUob3B0aW9ucywgR0xfQVJSQVlfQlVGRkVSLCBmYWxzZSwgZmFsc2UpXG4gICAgfSxcbiAgICBlbGVtZW50czogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgIHJldHVybiBlbGVtZW50U3RhdGUuY3JlYXRlKG9wdGlvbnMsIGZhbHNlKVxuICAgIH0sXG4gICAgdGV4dHVyZTogdGV4dHVyZVN0YXRlLmNyZWF0ZTJELFxuICAgIGN1YmU6IHRleHR1cmVTdGF0ZS5jcmVhdGVDdWJlLFxuICAgIHJlbmRlcmJ1ZmZlcjogcmVuZGVyYnVmZmVyU3RhdGUuY3JlYXRlLFxuICAgIGZyYW1lYnVmZmVyOiBmcmFtZWJ1ZmZlclN0YXRlLmNyZWF0ZSxcbiAgICBmcmFtZWJ1ZmZlckN1YmU6IGZyYW1lYnVmZmVyU3RhdGUuY3JlYXRlQ3ViZSxcblxuICAgIC8vIEV4cG9zZSBjb250ZXh0IGF0dHJpYnV0ZXNcbiAgICBhdHRyaWJ1dGVzOiBnbEF0dHJpYnV0ZXMsXG5cbiAgICAvLyBGcmFtZSByZW5kZXJpbmdcbiAgICBmcmFtZTogZnJhbWUsXG4gICAgb246IGFkZExpc3RlbmVyLFxuXG4gICAgLy8gU3lzdGVtIGxpbWl0c1xuICAgIGxpbWl0czogbGltaXRzLFxuICAgIGhhc0V4dGVuc2lvbjogZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHJldHVybiBsaW1pdHMuZXh0ZW5zaW9ucy5pbmRleE9mKG5hbWUudG9Mb3dlckNhc2UoKSkgPj0gMFxuICAgIH0sXG5cbiAgICAvLyBSZWFkIHBpeGVsc1xuICAgIHJlYWQ6IHJlYWRQaXhlbHMsXG5cbiAgICAvLyBEZXN0cm95IHJlZ2wgYW5kIGFsbCBhc3NvY2lhdGVkIHJlc291cmNlc1xuICAgIGRlc3Ryb3k6IGRlc3Ryb3ksXG5cbiAgICAvLyBEaXJlY3QgR0wgc3RhdGUgbWFuaXB1bGF0aW9uXG4gICAgX2dsOiBnbCxcbiAgICBfcmVmcmVzaDogcmVmcmVzaCxcblxuICAgIHBvbGw6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHBvbGwoKVxuICAgICAgaWYgKHRpbWVyKSB7XG4gICAgICAgIHRpbWVyLnVwZGF0ZSgpXG4gICAgICB9XG4gICAgfSxcblxuICAgIC8vIEN1cnJlbnQgdGltZVxuICAgIG5vdzogbm93LFxuXG4gICAgLy8gcmVnbCBTdGF0aXN0aWNzIEluZm9ybWF0aW9uXG4gICAgc3RhdHM6IHN0YXRzXG4gIH0pXG5cbiAgY29uZmlnLm9uRG9uZShudWxsLCByZWdsKVxuXG4gIHJldHVybiByZWdsXG59XG4iXX0=
