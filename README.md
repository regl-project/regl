# regl
 [![Circle CI](https://circleci.com/gh/mikolalysenko/regl.svg?style=svg)](https://circleci.com/gh/mikolalysenko/regl) [![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](http://standardjs.com/)

This repo is an attempt at building new functional abstractions for working with WebGL.  It is still **experimental**, so expect things to change a lot in the near future! If you want to know more about why I am writing this thing and why it looks the way it does, take a look at the [rationale](RATIONALE.md).

### Why use regl

`regl` offers the following advantages over raw WebGL code:

* **Just one function**
* **Less state** Draw commands in regl are self contained, so you don't have to worry about some other weird subroutine breaking your rendering code
* **No `bind()`** In regl, shaders, buffers, textures and fbos are specified declaratively, so there is no need to ever `bind()` them or unbind them.
* **Fewer silent failure** If you pass incorrect parameters to some WebGL method, the default behavior is to set an error code and continue on. Because `regl` commands have more structure, we can do more validation up front without the run time performance cost.
* **Sane defaults** Many WebGL APIs have redundant or outright broken parameters (for example `border` in `gl.texImage2D` or `transpose` in `gl.uniformMatrix4fv`). `regl` wraps these APIs in such a way that you will never have to see this mess.

## Simple example

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
    ]))
    // regl automatically infers sane defaults for the vertex attribute pointers
  },

  uniforms: {
    // This defines the color of the triangle to be a dynamic variable
    color: regl.prop('color')
  },

  // This tells regl the number of vertices to draw in this command
  count: 3
})

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

## More examples

[Check out the demo gallery](https://mikolalysenko.github.io/regl/www/gallery.html)

## Setup

regl has no dependencies, so setting it up is pretty easy

#### Live editing
To try out regl right away, you can use [RequireBin](http://requirebin.com/) or [codepen](http://codepen.io/).  The following links should help get you started:

* requirebin
* codepen

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

## Comparisons

TODO implement spinning textured cube in each of the following frameworks

* vs WebGL
* vs gl-* modules from stack.gl
* vs TWGL
* vs THREE.js

## Benchmarks
You can run benchmarks locally using `npm run bench` or check them out here:

* [Interactive benchmarks](https://mikolalysenko.github.io/regl/www/bench.html)

## [API](API.md)
* [Initialization](API.md#initialization)
      * [As a fullscreen canvas](API.md#as-a-fullscreen-canvas)
      * [From a container div](API.md#from-a-container-div)
      * [From a canvas](API.md#from-a-canvas)
      * [From a WebGL context](API.md#from-a-webgl-context)
* [Commands](API.md#commands)
  + [Dynamic properties](API.md#dynamic-properties)
  + [Executing commands](API.md#executing-commands)
    - [One-shot rendering](API.md#one-shot-rendering)
    - [Batch rendering](API.md#batch-rendering)
    - [Scoped parameters](API.md#scoped-parameters)
  + [Parameters](API.md#parameters)
    - [Shaders](API.md#shaders)
    - [Uniforms](API.md#uniforms)
    - [Attributes](API.md#attributes)
    - [Drawing](API.md#drawing)
    - [Framebuffer](API.md#framebuffer)
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
  + [Basic usage](API.md#basic-usage)
    - [Updating a resource](API.md#updating-a-resource)
    - [Destroying a resource](API.md#destroying-a-resource)
  + [Types](API.md#types)
    - [`regl.buffer(options)`](API.md#-reglbuffer-options--)
    - [`regl.elements(options)`](API.md#-reglelements-options--)
* [Other features](API.md#other-properties)
  + [Clear the draw buffer](API.md#clear-the-draw-buffer)
  + [Reading pixels](API.md#reading-pixels)
  + [Per-frame callbacks](API.md#per-frame-callbacks)
  + [Frame stats](API.md#frame-stats)
  + [WebGL capabilities](API.md#webgl-capabilities)
  + [Clean up](API.md#clean-up)
  + [Context loss](API.md#context-loss)

## Contributing

[For info on how to build and test headless, see the contributing guide here](DEVELOPING.md)

## License
(c) 2016 MIT License

Supported by the [Freeman Lab](https://www.janelia.org/lab/freeman-lab) and the Howard Hughes Medical Institute
