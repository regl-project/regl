# regl
 [![Join the chat at https://gitter.im/ark-lang/ark](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/mikolalysenko/regl) [![Circle CI](https://circleci.com/gh/mikolalysenko/regl.svg?style=shield)](https://circleci.com/gh/mikolalysenko/regl) [![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](http://standardjs.com/)
 [![npm version](https://badge.fury.io/js/regl.svg)](https://badge.fury.io/js/regl) ![file size](https://badge-size.herokuapp.com/mikolalysenko/regl/gh-pages/dist/regl.min.js.svg?compression=gzip)

`regl` is a fast functional reactive abstraction for WebGL.

## Example

In `regl`, there are two fundamental abstractions, **resources** and **commands**:

* A **resource** is a handle to a GPU resident object, like a texture, FBO or buffer.
* A **command** is a complete representation of the WebGL state required to perform some draw call.

To define a command you specify a mixture of static and dynamic data for the object. Once this is done, `regl` takes this description and then compiles it into optimized JavaScript code.  For example, here is a simple `regl` program to draw a colored triangle:

```JavaScript
// Calling the regl module with no arguments creates a full screen canvas and
// WebGL context, and then uses this context to initialize a new REGL instance
const regl = require('regl')()

// Calling regl() creates a new partially evaluated draw command
const drawTriangle = regl({

  // Shaders in regl are just strings.  You can use glslify or whatever you want
  // to define them.  No need to manually create shader objects.
  frag: `
    precision mediump float;
    uniform vec4 color;
    void main() {
      gl_FragColor = color;
    }`,

  vert: `
    precision mediump float;
    attribute vec2 position;
    void main() {
      gl_Position = vec4(position, 0, 1);
    }`,

  // Here we define the vertex attributes for the above shader
  attributes: {
    // regl.buffer creates a new array buffer object
    position: regl.buffer([
      [-2, -2],   // no need to flatten nested arrays, regl automatically
      [4, -2],    // unrolls them into a typedarray (default Float32)
      [4,  4]
    ])
    // regl automatically infers sane defaults for the vertex attribute pointers
  },

  uniforms: {
    // This defines the color of the triangle to be a dynamic variable
    color: regl.prop('color')
  },

  // This tells regl the number of vertices to draw in this command
  count: 3
})

// regl.frame() wraps requestAnimationFrame and also handles viewport changes
regl.frame(({time}) => {
  // clear contents of the drawing buffer
  regl.clear({
    color: [0, 0, 0, 0],
    depth: 1
  })

  // draw a triangle using the command defined above
  drawTriangle({
    color: [
      Math.cos(time * 0.001),
      Math.sin(time * 0.0008),
      Math.cos(time * 0.003),
      1
    ]
  })
})
```

See this example [live](http://regl.party/examples/?basic)

#### More examples

Check out the [gallery](https://mikolalysenko.github.io/regl/www/gallery.html). The source code of all the gallery examples can be found [here](https://github.com/mikolalysenko/regl/tree/gh-pages/example).

## Setup

regl has no dependencies, so setting it up is pretty easy

#### Live editing
To try out regl right away, you can use the live editor in the [gallery](http://regl.party/examples).

#### npm
The easiest way to use `regl` in a project is via [npm](http://npmjs.com).  Once you have node set up, you can install and use `regl` in your project using the following command:

```sh
npm i -S regl
```

For more info on how to use npm, [check out the official docs](https://docs.npmjs.com/).

#### Standalone script tag
You can also use `regl` as a standalone script if you are really stubborn.  The most recent versions can be found in the `dist/` folder.  Alternatively, you can directly import regl using npm cdn.

* Unminified:

```html
<script src="https://npmcdn.com/regl/dist/regl.js"></script>
```

* Minified:

```html
<script src="https://npmcdn.com/regl/dist/regl.min.js"></script>
```

## Why use `regl`?
`regl` is basically all of WebGL without all of the shared state.  You can do anything you could in regular WebGL with little overhead and way less debugging. Selling points of `regl` are:

* `regl` makes it easy to load extensions and to adapt the program after the limits of the target device, and exposes many WebGL extensions for easy usage. See [API.md](API.md) for more info.
* `regl`, in difference to many other WebGL frameworks, has support for easy usage of instanced rendering. See [this example](https://github.com/mikolalysenko/regl/blob/gh-pages/example/instance-triangle.js) for more details.
* `regl` integrates easily with modules from `stack.gl`, such `gl-mat4` and `gl-vec3`.
* `regl` is small and bloat-free; A minimized version of [`three.js`](http://threejs.org/) is ~500Kb, while a minimized version of `regl` is only `71Kb`.
* `regl` has little overhead, and is near as fast as hand-optimized WebGL. You can compare the performance at the [interactive benchmarks](https://mikolalysenko.github.io/regl/www/bench.html). The benchmark `cube` measures the performance of rendering a textured cube in `regl`, and `cube-webgl` does the same thing, but in raw WebGL. And `cube-threejs` does the same thing, but in `three.js`. In particular, notice how much faster `regl` is than `three.js`
* `regl` performs strong error validation and sanity checking in debug builds. But for production builds of `regl`, all validation will be stripped away.


### Comparisons

In this section, we show how you can implement a spinning textured cube in `regl`, and compare it with other WebGL frameworks.

![](images/cube_example.png)

#### [`regl`](https://mikolalysenko.github.io/regl/www/gallery/cube.js.html)

```javascript
const regl = require('../regl')()
const mat4 = require('gl-mat4')

var cubePosition = [
  [-0.5, +0.5, +0.5], [+0.5, +0.5, +0.5], [+0.5, -0.5, +0.5], [-0.5, -0.5, +0.5], // positive z face.
  [+0.5, +0.5, +0.5], [+0.5, +0.5, -0.5], [+0.5, -0.5, -0.5], [+0.5, -0.5, +0.5], // positive x face
  [+0.5, +0.5, -0.5], [-0.5, +0.5, -0.5], [-0.5, -0.5, -0.5], [+0.5, -0.5, -0.5], // negative z face
  [-0.5, +0.5, -0.5], [-0.5, +0.5, +0.5], [-0.5, -0.5, +0.5], [-0.5, -0.5, -0.5], // negative x face.
  [-0.5, +0.5, -0.5], [+0.5, +0.5, -0.5], [+0.5, +0.5, +0.5], [-0.5, +0.5, +0.5], // top face
  [-0.5, -0.5, -0.5], [+0.5, -0.5, -0.5], [+0.5, -0.5, +0.5], [-0.5, -0.5, +0.5]  // bottom face
]

var cubeUv = [
  [0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0], // positive z face.
  [0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0], // positive x face.
  [0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0], // negative z face.
  [0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0], // negative x face.
  [0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0], // top face
  [0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]  // bottom face
]

const cubeElements = [
  [2, 1, 0], [2, 0, 3],       // positive z face.
  [6, 5, 4], [6, 4, 7],       // positive x face.
  [10, 9, 8], [10, 8, 11],    // negative z face.
  [14, 13, 12], [14, 12, 15], // negative x face.
  [18, 17, 16], [18, 16, 19], // top face.
  [20, 21, 22], [23, 20, 22]  // bottom face
]

const drawCube = regl({
  frag: `
  precision mediump float;
  varying vec2 vUv;
  uniform sampler2D tex;
  void main () {
    gl_FragColor = texture2D(tex,vUv);
  }`,
  vert: `
  precision mediump float;
  attribute vec3 position;
  attribute vec2 uv;
  varying vec2 vUv;
  uniform mat4 projection, view;
  void main() {
    vUv = uv;
    gl_Position = projection * view * vec4(position, 1);
  }`,
  attributes: {
    position: cubePosition,
    uv: cubeUv
  },
  elements: cubeElements,
  uniforms: {
    view: ({tick}) => {
      const t = 0.01 * tick
      return mat4.lookAt([],
                         [5 * Math.cos(t), 2.5 * Math.sin(t), 5 * Math.sin(t)],
                         [0, 0.0, 0],
                         [0, 1, 0])
    },
    projection: ({viewportWidth, viewportHeight}) =>
      mat4.perspective([],
                       Math.PI / 4,
                       viewportWidth / viewportHeight,
                       0.01,
                       10),
    tex: regl.prop('texture')
  }
})

require('resl')({
  manifest: {
    texture: {
      type: 'image',
      src: 'assets/lena.png',
      parser: (data) => regl.texture({
        data: data,
        mag: 'linear',
        min: 'linear'
      })
    }
  },
  onDone: ({texture}) => {
    regl.frame(() => {
      regl.clear({
        color: [0, 0, 0, 255],
        depth: 1
      })
      drawCube({texture})
    })
  }
})
```


#### [Raw WebGL](https://mikolalysenko.github.io/regl/compare/webgl_cube.html)

```html
<!doctype html>
<html>
  <head>
    <title>WebGL Textured Cube Demo</title>
    <script type="text/javascript">
/* global Image, alert, requestAnimationFrame */
var canvas
var gl
var cubePositionBuffer
var cubeUvBuffer
var cubeElementsBuffers
var cubeTexture
var shaderProgram
var cubePositionAttribute
var cubeUvAttribute
var projectionUniformLocation
var viewUniformLocation
var tick
function start () {
  canvas = document.getElementById('glcanvas')
  tick = 0
  initWebGL(canvas)
  if (gl) {
    gl.clearColor(0.0, 0.0, 0.0, 1.0)
    gl.enable(gl.DEPTH_TEST)
    gl.enable(gl.CULL_FACE)
    initShaders()
    initBuffers()
    initTextures()
    // start RAF
    requestAnimationFrame(drawScene)
  }
}
function initWebGL () {
  try {
    gl = canvas.getContext('experimental-webgl')
  } catch (e) {
  }
  if (!gl) {
    alert('Unable to initialize WebGL. Your browser may not support it.')
  }
}
function initBuffers () {
  cubePositionBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, cubePositionBuffer)
  var cubePosition = [
    // positive z face.
      -0.5, +0.5, +0.5,
      +0.5, +0.5, +0.5,
      +0.5, -0.5, +0.5,
      -0.5, -0.5, +0.5,
    // positive x face
      +0.5, +0.5, +0.5,
      +0.5, +0.5, -0.5,
      +0.5, -0.5, -0.5,
      +0.5, -0.5, +0.5,
    // negative z face
      +0.5, +0.5, -0.5,
      -0.5, +0.5, -0.5,
      -0.5, -0.5, -0.5,
      +0.5, -0.5, -0.5,
    // negative x face.
      -0.5, +0.5, -0.5,
      -0.5, +0.5, +0.5,
      -0.5, -0.5, +0.5,
      -0.5, -0.5, -0.5,
    // top face
      -0.5, +0.5, -0.5,
      +0.5, +0.5, -0.5,
      +0.5, +0.5, +0.5,
      -0.5, +0.5, +0.5,
    // bottom face
      -0.5, -0.5, -0.5,
      +0.5, -0.5, -0.5,
      +0.5, -0.5, +0.5,
      -0.5, -0.5, +0.5
  ]
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cubePosition), gl.STATIC_DRAW)
  cubeUvBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeUvBuffer)
  var cubeUv = [
    // positive z face.
    0.0, 0.0,
    1.0, 0.0,
    1.0, 1.0,
    0.0, 1.0,
    // positive x face.
    0.0, 0.0,
    1.0, 0.0,
    1.0, 1.0,
    0.0, 1.0,
    // negative z face.
    0.0, 0.0,
    1.0, 0.0,
    1.0, 1.0,
    0.0, 1.0,
    // negative x face.
    0.0, 0.0,
    1.0, 0.0,
    1.0, 1.0,
    0.0, 1.0,
    // top face
    0.0, 0.0,
    1.0, 0.0,
    1.0, 1.0,
    0.0, 1.0,
    // bottom face
    0.0, 0.0,
    1.0, 0.0,
    1.0, 1.0,
    0.0, 1.0
  ]
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cubeUv), gl.STATIC_DRAW)
  cubeElementsBuffers = gl.createBuffer()
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeElementsBuffers)
  var cubeElements = [
    // positive z face.
    2, 1, 0,
    2, 0, 3,
    // positive x face.
    6, 5, 4,
    6, 4, 7,
    // negative z face.
    10, 9, 8,
    10, 8, 11,
    // negative x face.
    14, 13, 12,
    14, 12, 15,
    // top face.
    18, 17, 16,
    18, 16, 19,
    // bottom face
    20, 21, 22,
    23, 20, 22
  ]
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(cubeElements), gl.STATIC_DRAW)
}
function initTextures () {
  cubeTexture = gl.createTexture()
  var cubeImage = new Image()
  cubeImage.onload = function () {
    gl.bindTexture(gl.TEXTURE_2D, cubeTexture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cubeImage)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  }
  cubeImage.src = '../example/assets/lena.png'
}
function drawScene () {
  tick++
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
  // bind buffers.
  gl.bindBuffer(gl.ARRAY_BUFFER, cubePositionBuffer)
  gl.vertexAttribPointer(cubePositionAttribute, 3, gl.FLOAT, false, 0, 0)
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeUvBuffer)
  gl.vertexAttribPointer(cubeUvAttribute, 2, gl.FLOAT, false, 0, 0)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeElementsBuffers)
  // set texture.
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, cubeTexture)
  // set uniforms
  gl.uniform1i(gl.getUniformLocation(shaderProgram, 'tex'), 0)
  const t = 0.01 * tick
  var perspectiveMatrix = perspective(45, 640.0 / 480.0, 0.1, 100.0)
  gl.uniformMatrix4fv(projectionUniformLocation, false, new Float32Array(perspectiveMatrix))
  gl.uniformMatrix4fv(viewUniformLocation, false, new Float32Array(
    lookAt(
      [5 * Math.cos(t), 2.5 * Math.sin(t), 5 * Math.sin(t)],
      [0, 0.0, 0],
      [0, 1, 0])))
  gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0)
  requestAnimationFrame(drawScene)
}
function initShaders () {
  var fragmentShader = getShader(gl, 'shader-fs')
  var vertexShader = getShader(gl, 'shader-vs')
  shaderProgram = gl.createProgram()
  gl.attachShader(shaderProgram, vertexShader)
  gl.attachShader(shaderProgram, fragmentShader)
  gl.linkProgram(shaderProgram)
  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    alert('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram))
  }
  gl.useProgram(shaderProgram)
  cubePositionAttribute = gl.getAttribLocation(shaderProgram, 'position')
  gl.enableVertexAttribArray(cubePositionAttribute)
  cubeUvAttribute = gl.getAttribLocation(shaderProgram, 'uv')
  gl.enableVertexAttribArray(cubeUvAttribute)
  projectionUniformLocation = gl.getUniformLocation(shaderProgram, 'projection')
  viewUniformLocation = gl.getUniformLocation(shaderProgram, 'view')
}
function getShader (gl, id) {
  var e = document.getElementById(id)
  if (!e) {
    return null
  }
  var sourceCode = e.firstChild.textContent
  var shader
  if (e.type === 'x-shader/x-fragment') {
    shader = gl.createShader(gl.FRAGMENT_SHADER)
  } else if (e.type === 'x-shader/x-vertex') {
    shader = gl.createShader(gl.VERTEX_SHADER)
  } else {
    return null
  }
  gl.shaderSource(shader, sourceCode)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader))
    return null
  }
  return shader
}
// Taken from gl-mat4
// https://github.com/stackgl/gl-mat4/blob/master/lookAt.js
function lookAt (eye, center, up) {
  var x0, x1, x2, y0, y1, y2, z0, z1, z2, len
  var eyex = eye[0]
  var eyey = eye[1]
  var eyez = eye[2]
  var upx = up[0]
  var upy = up[1]
  var upz = up[2]
  var centerx = center[0]
  var centery = center[1]
  var centerz = center[2]
  z0 = eyex - centerx
  z1 = eyey - centery
  z2 = eyez - centerz
  len = 1 / Math.sqrt(z0 * z0 + z1 * z1 + z2 * z2)
  z0 *= len
  z1 *= len
  z2 *= len
  x0 = upy * z2 - upz * z1
  x1 = upz * z0 - upx * z2
  x2 = upx * z1 - upy * z0
  len = Math.sqrt(x0 * x0 + x1 * x1 + x2 * x2)
  if (!len) {
    x0 = 0
    x1 = 0
    x2 = 0
  } else {
    len = 1 / len
    x0 *= len
    x1 *= len
    x2 *= len
  }
  y0 = z1 * x2 - z2 * x1
  y1 = z2 * x0 - z0 * x2
  y2 = z0 * x1 - z1 * x0
  len = Math.sqrt(y0 * y0 + y1 * y1 + y2 * y2)
  if (!len) {
    y0 = 0
    y1 = 0
    y2 = 0
  } else {
    len = 1 / len
    y0 *= len
    y1 *= len
    y2 *= len
  }
  return [
    x0, y0, z0, 0,
    x1, y1, z1, 0,
    x2, y2, z2, 0,
    -(x0 * eyex + x1 * eyey + x2 * eyez),
    -(y0 * eyex + y1 * eyey + y2 * eyez),
    -(z0 * eyex + z1 * eyey + z2 * eyez),
    1
  ]
}
// Taken from gl-mat4
// https://github.com/stackgl/gl-mat4/blob/master/perspective.js
function perspective (fovy, aspect, near, far) {
  var f = 1.0 / Math.tan(fovy / 2)
  var nf = 1 / (near - far)
  return [
    f / aspect, 0.0, 0.0, 0.0,
    0.0, f, 0.0, 0.0,
    0.0, 0.0, (far + near) * nf, -1.0,
    0.0, 0.0, (2 * far * near) * nf, 0.0
  ]
}
    </script>

    <script id="shader-fs" type="x-shader/x-fragment">
  precision mediump float;
  varying vec2 vUv;
  uniform sampler2D tex;
  void main () {
    gl_FragColor = texture2D(tex,vUv);
  }
    </script>

    <script id="shader-vs" type="x-shader/x-vertex">
  precision mediump float;
  attribute vec3 position;
  attribute vec2 uv;
  varying vec2 vUv;
  uniform mat4 projection, view;
  void main() {
    vUv = uv;
    gl_Position = projection * view * vec4(position, 1);
  }
    </script>
  </head>
  <body onload="start()">
    <canvas id="glcanvas" width="640" height="480">
      Your browser doesn't appear to support the <code>&lt;canvas&gt;</code> element.
    </canvas>
  </body>
</html>
```

#### [stack.gl]()
TODO

#### [gl-react]()
TODO

#### [TWGL]()
TODO

#### [three.js](https://mikolalysenko.github.io/regl/compare/threejs_cube.html)
```html
<!doctype html>
<html>
  <head>
    <title>threejs cube</title>
    <meta content="text/html;charset=utf-8" http-equiv="Content-Type">
    <meta content="utf-8" http-equiv="encoding">
    <script type="text/javascript" src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r79/three.min.js"></script>
    <script type="text/javascript">
    var scene;
    var camera;
    var renderer;
    var mesh;
    var tick;

    function start() {
      init();
      drawShape();
      render();
    }

    function drawShape() {
      var geo = new THREE.CubeGeometry(1.0, 1.0, 1.0);

      var texture = THREE.ImageUtils.loadTexture('../example/assets/lena.png');
      var mats = [];
      for (var i = 0; i < 6; i++) {
        mats.push(new THREE.MeshBasicMaterial({map: texture}));
      }
      var mat = new THREE.MeshFaceMaterial(mats);

      mesh = new THREE.Mesh(geo, mat);

      scene.add(mesh);

      tick = 0;
    }

    function init() {
      scene = new THREE.Scene();

      var canvas = document.getElementById('glcanvas');
      renderer = new THREE.WebGLRenderer({canvas: canvas});
      renderer.setPixelRatio( window.devicePixelRatio );
      renderer.setSize( window.innerWidth, window.innerHeight );

      camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 0.1, 100 );
    }

    function rotateCube() {
      tick += 1
      var t = tick * 0.01

      camera.position.set(5 * Math.cos(t), 2.5 * Math.sin(t), 5 * Math.sin(t))
      camera.up = new THREE.Vector3(0, 1, 0)
      camera.lookAt(new THREE.Vector3(0, 0, 0))
    }

    function render() {
      requestAnimationFrame(render);
      rotateCube();
      renderer.render(scene, camera);
    }

    </script>
  </head>
  <body onload="start()">
    <canvas id="glcanvas" width="640" height="480">
      Your browser doesn't appear to support the <code>&lt;canvas&gt;</code> element.
    </canvas>
  </body>
</html>

```


### Benchmarks
You can run benchmarks locally using `npm run bench` or check them out here:

* [Interactive benchmarks](https://mikolalysenko.github.io/regl/www/bench.html)

You can also check out our benchmarking results for the last couple of days:

* [Benchmarking Results](https://mikolalysenko.github.io/regl/www/bench-results/bench-result-8ea4a7e806beed0b9732)

The benchmarking results were created by using our custom scripts `bench-history` and
`bench-graph`. You can read more about them in [DEVELOPING.md](DEVELOPING.md).

## [API](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md)

* [Initialization](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#initialization)
    - [As a fullscreen canvas](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#as-a-fullscreen-canvas)
    - [From a container div](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#from-a-container-div)
    - [From a canvas](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#from-a-canvas)
    - [From a WebGL context](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#from-a-webgl-context)
  + [All initialization options](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#all-initialization-options)
* [Commands](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#commands)
  + [Executing commands](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#executing-commands)
    - [One-shot rendering](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#one-shot-rendering)
    - [Batch rendering](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#batch-rendering)
    - [Scoped commands](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#scoped-commands)
  + [Inputs](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#inputs)
    - [Example](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#example)
    - [Context](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#context)
    - [Props](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#props)
    - [`this`](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#-this-)
  + [Parameters](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#parameters)
    - [Shaders](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#shaders)
    - [Uniforms](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#uniforms)
    - [Attributes](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#attributes)
    - [Drawing](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#drawing)
    - [Render target](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#render-target)
    - [Profiling](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#profiling)
    - [Depth buffer](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#depth-buffer)
    - [Blending](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#blending)
    - [Stencil](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#stencil)
    - [Polygon offset](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#polygon-offset)
    - [Culling](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#culling)
    - [Front face](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#front-face)
    - [Dithering](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#dithering)
    - [Line width](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#line-width)
    - [Color mask](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#color-mask)
    - [Sample coverage](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#sample-coverage)
    - [Scissor](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#scissor)
    - [Viewport](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#viewport)
* [Resources](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#resources)
  + [Buffers](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#buffers)
    - [Constructor](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#constructor)
    - [Update](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#update)
      * [In place update](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#in-place-update)
    - [Destroy](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#destroy)
    - [Profiling](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#profiling-1)
  + [Elements](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#elements)
    - [Constructor](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#constructor-1)
    - [Update](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#update-1)
      * [In-place update](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#in-place-update)
    - [Destroy](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#destroy-1)
  + [Textures](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#textures)
    - [Constructor](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#constructor-2)
    - [Update](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#update-2)
      * [Partial update](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#partial-update)
      * [Resize](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#resize)
    - [Destroy](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#destroy-2)
    - [Profiling](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#profiling-2)
  + [Cube maps](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#cube-maps)
    - [Constructor](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#constructor-3)
    - [Update](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#update-3)
      * [In-place update](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#in-place-update-1)
    - [Profiling](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#profiling-3)
    - [Destroy](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#destroy-3)
  + [Render buffers](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#render-buffers)
    - [Constructor](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#constructor-4)
    - [Update](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#update-4)
      * [Resizing](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#resizing)
    - [Destroy](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#destroy-4)
    - [Profiling](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#profiling-4)
  + [Framebuffers](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#framebuffers)
    - [Constructor](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#constructor-5)
    - [Update](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#update-5)
      * [Resizing](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#resizing-1)
    - [Destroy](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#destroy-5)
  + [Cubic frame buffers](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#cubic-frame-buffers)
    - [Constructor](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#constructor-6)
    - [Update](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#update-6)
    - [Destroy](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#destroy-6)
* [Other features](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#other-features)
  + [Clear the draw buffer](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#clear-the-draw-buffer)
  + [Reading pixels](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#reading-pixels)
  + [Per-frame callbacks](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#per-frame-callbacks)
  + [Extensions](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#extensions)
  + [Device capabilities and limits](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#device-capabilities-and-limits)
  + [Performance metrics](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#performance-metrics)
  + [Clean up](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#clean-up)
  + [Context loss](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#context-loss)
  + [Unsafe escape hatch](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#unsafe-escape-hatch)
* [Tips](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#tips)
  + [Reuse resources (buffers, elements, textures, etc.)](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#reuse-resources--buffers--elements--textures--etc-)
  + [Preallocate memory](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#preallocate-memory)
  + [Debug vs release](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#debug-vs-release)
  + [Profiling](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#profiling-5)
  + [Context loss mitigation](https://github.com/mikolalysenko/regl/blob/gh-pages/API.md#context-loss-mitigation)

## Development
The latest changes in `regl` can be found in the [CHANGELOG](CHANGES.md).

[For info on how to build and test headless, see the contributing guide here](DEVELOPING.md)

### License
All code (c) 2016 MIT License

Development supported by the [Freeman Lab](https://www.janelia.org/lab/freeman-lab) and the Howard Hughes Medical Institute ([@freeman-lab](https://github.com/freeman-lab) on GitHub)

#### Asset licenses
Many examples use creative commons or public domain artwork for illustrative purposes.  These assets are not included in any of the redistributable packages of regl.

* Test video (doggie-chromakey.ogv) by [L0ckergn0me](https://archive.org/details/L0ckergn0me-PixieGreenScreen446), used under creative commons license
* Cube maps (posx.jpeg, negx.jpeg, posy.jpeg, negy.jpeg, posz.jpeg, negz.jpeg) by [Humus](http://www.humus.name/index.php?page=Textures), used under creative commons 3 license
* Environment map of Oregon (ogd-oregon-360.jpg) due to Max Ogden ([@maxogd](https://github.com/maxogden) on GitHub)
* DDS test images (alpine_cliff_a, alpine_cliff_a_norm, alpine_cliff_a_spec) taken from the CC0 license [0-AD texture pack by Wildfire games](http://opengameart.org/content/0-ad-textures)
* Tile set for tile mapping demo (tiles.png) from CC0 licensed [cobblestone paths pack](http://opengameart.org/content/rpg-tiles-cobble-stone-paths-town-objects)
* Audio track for `audio.js` example is "[Bamboo Cactus](https://archive.org/details/8bp033)" by [8bitpeoples](https://archive.org/details/8bitpeoples).  CC BY-ND-NC 1.0 license
