# regl
 [![Join the chat at https://gitter.im/ark-lang/ark](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/mikolalysenko/regl) [![Circle CI](https://circleci.com/gh/mikolalysenko/regl.svg?style=shield)](https://circleci.com/gh/mikolalysenko/regl) [![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](http://standardjs.com/)
 [![npm version](https://badge.fury.io/js/regl.svg)](https://badge.fury.io/js/regl) ![file size](https://badge-size.herokuapp.com/mikolalysenko/regl/gh-pages/dist/regl.min.js.svg?compression=gzip)

`regl` is a fast functional framework for WebGL.

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
`regl` is basically all of WebGL without all of the shared state.  You can do anything you could in regular WebGL with little overhead and way less debugging. `regl` emphasizes the following values:

* **Simplicity** The interface is concise and emphasizes separation of concerns.  Removing shared state helps localize the effects and interactions of code, making it easier to reason about.
* **Correctness** `regl` has more than 30,000 unit tests and above 95% code coverage. In development mode, `regl` performs strong validation and sanity checks on all input data to help you catch errors faster.
* **Performance**  `regl` uses dynamic code generation and partial evaluation to remove almost all overhead. Draw commands execute roughly as fast as hand optimized WebGL.
* **Minimalism** `regl` just wraps WebGL.  It is not a game engine and doesn't have opinions about scene graphs or vector math libraries.
* **Stability** `regl` takes interface compatibility and semantic versioning seriously, making it well suited for long lived applications that must be supported for months or years down the road.
* **Power** Any feature in WebGL is accessible, including advanced extensions like [multiple render targets](https://github.com/mikolalysenko/regl/blob/gh-pages/example/deferred_shading.js) or [instancing](https://github.com/mikolalysenko/regl/blob/gh-pages/example/instance-triangle.js).

### Comparisons
While `regl` is lower level than many 3D engines, code written in it tends to be highly compact and flexible.  A comparison of `regl` to various other WebGL [libraries across several tasks can be found here](https://mikolalysenko.github.io/regl/www/).

### Benchmarks
In order to prevent performance regressions, `regl` is continuously benchmarked.  You can run benchmarks locally using `npm run bench` or [check them out online](https://mikolalysenko.github.io/regl/www/bench.html). The results for the last few days can be found here:

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
