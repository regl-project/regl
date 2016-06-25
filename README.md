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
regl.frame(() => {
  // clear contents of the drawing buffer
  regl.clear({
    color: [0, 0, 0, 0],
    depth: 1
  })

  // draw a triangle using the command defined above
  drawTriangle({
    color: [
      Math.cos(Date.now() * 0.001),
      Math.sin(Date.now() * 0.0008),
      Math.cos(Date.now() * 0.003),
      1
    ]
  })
})
```

See this example [live](http://regl.party/examples/?basic)

#### More examples

Check out the [gallery](http://regl.party/examples).

## Setup

regl has no dependencies, so setting it up is pretty easy

#### Live editing
To try out regl right away, you can use the live editor in the [gallery](http://regl.party.examples).

#### npm
The easiest way to use `regl` in a project is via [npm](http://npmjs.com).  Once you have node set up, you can install and use `regl` in your project using the following command:

```sh
npm i -S regl
```

For more info on how to use npm, [check out the official docs](https://docs.npmjs.com/).

#### Standalone script tag
You can also use `regl` as a standalone script if you are really stubborn.  The most recent versions can be found under the [releases tab](releases).  To do this, add the following script tag to your HTML:

```html
<script src="[some cdn tbd]/regl.min.js"></script>
```

## Why use `regl`?
`regl` is basically all of WebGL without all of the shared state.  You can do anything you could in regular WebGL with little overhead and way less debugging.

### Comparisons

**TODO** implement spinning textured cube in each of the following frameworks

* vs WebGL
* vs gl-* modules from stack.gl
* gl-react
* vs TWGL
* vs THREE.js

### Benchmarks
You can run benchmarks locally using `npm run bench` or check them out here:

* [Interactive benchmarks](https://mikolalysenko.github.io/regl/www/bench.html)

## [API](API.md)

* [Initialization](API.md#initialization)
      * [As a fullscreen canvas](API.md#as-a-fullscreen-canvas)
      * [From a container div](API.md#from-a-container-div)
      * [From a canvas](API.md#from-a-canvas)
      * [From a WebGL context](API.md#from-a-webgl-context)
  + [Initialization options](API.md#initialization-options)
* [Commands](API.md#commands)
  + [Executing commands](API.md#executing-commands)
    - [One-shot rendering](API.md#one-shot-rendering)
    - [Batch rendering](API.md#batch-rendering)
    - [Scoped commands](API.md#scoped-commands)
  + [Inputs](API.md#inputs)
    - [Context](API.md#context)
    - [Props](API.md#props)
    - [`this`](API.md#-this-)
  + [Parameters](API.md#parameters)
    - [Shaders](API.md#shaders)
    - [Uniforms](API.md#uniforms)
    - [Attributes](API.md#attributes)
    - [Drawing](API.md#drawing)
    - [Render target](API.md#render-target)
    - [Depth buffer](API.md#depth-buffer)
    - [Blending](API.md#blending)
    - [Stencil](API.md#stencil)
    - [Polygon offset](API.md#polygon-offset)
    - [Culling](API.md#culling)
    - [Front face](API.md#front-face)
    - [Dithering](API.md#dithering)
    - [Line width](API.md#line-width)
    - [Color mask](API.md#color-mask)
    - [Sample coverage](API.md#sample-coverage)
    - [Scissor](API.md#scissor)
    - [Viewport](API.md#viewport)
* [Resources](API.md#resources)
  + [Buffers](API.md#buffers)
    - [Constructor](API.md#constructor)
    - [Update](API.md#update)
    - [Destroy](API.md#destroy)
  + [Elements](API.md#elements)
    - [Constructor](API.md#constructor-1)
    - [Update](API.md#update-1)
    - [Destroy](API.md#destroy-1)
  + [Textures](API.md#textures)
    - [Constructor](API.md#constructor-2)
    - [Update](API.md#update-2)
    - [Destroy](API.md#destroy-2)
  + [Cube maps](API.md#cube-maps)
    - [Constructor](API.md#constructor-3)
    - [Update](API.md#update-3)
    - [Destroy](API.md#destroy-3)
  + [Render buffers](API.md#render-buffers)
    - [Constructor](API.md#constructor-4)
    - [Update](API.md#update-4)
    - [Destroy](API.md#destroy-4)
  + [Frame buffers](API.md#frame-buffers)
    - [Constructor](API.md#constructor-5)
    - [Update](API.md#update-5)
    - [Destroy](API.md#destroy-5)
  + [Cubic frame buffers](API.md#cubic-frame-buffers)
    - [Constructor](API.md#constructor-6)
    - [Update](API.md#update-6)
    - [Destroy](API.md#destroy-6)
* [Other features](API.md#other-features)
  + [Clear the draw buffer](API.md#clear-the-draw-buffer)
  + [Reading pixels](API.md#reading-pixels)
  + [Per-frame callbacks](API.md#per-frame-callbacks)
  + [Device capabilities and limits](API.md#device-capabilities-and-limits)
  + [Performance metrics](API.md#performance-metrics)
  + [Clean up](API.md#clean-up)
  + [Context loss](API.md#context-loss)
  + [Unsafe escape hatch](API.md#unsafe-escape-hatch)
* [Tips](API.md#tips)
  + [Reuse resources (buffers, elements, textures, etc.)](API.md#reuse-resources--buffers--elements--textures--etc-)
  + [Preallocate memory](API.md#preallocate-memory)
  + [Debug vs release](API.md#debug-vs-release)
  + [Context loss mitigation](API.md#context-loss-mitigation)

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
