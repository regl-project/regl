# regl

This repo is an attempt at building some new functional abstractions for working with WebGL.  It is still pretty experimental right now, so expect things to change a lot in the near future.  If you want to know more about why I am writing this thing, take a look at the [rationale](RATIONALE.md).

## Example

In regl, you write functions which transform data into sequences of WebGL draw calls.  These functions are then partially evaluated at run time into optimized JavaScript code.  Here is a sketch of how this might look:

```JavaScript
const regl = require('regl')()

// This creates a new partially evaluated draw call.  We flag the dynamic
// parts of the draw call using the special `regl.dynamic` variable
const drawTriangle = regl({
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

  attributes: {
    position: regl.buffer([[-2, -2], [4, -2], [4,  4]]))
  },

  uniforms: {
    color: regl.prop('color')
  },

  count: 3
})

regl.frame(() => {
  // clear contents of the drawing buffer
  regl.clear({
    color: [0, 0, 0, 0],
    depth: 1
  })

  // draw a triangle
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

## Demos

## Installation

### npm

```sh
npm i -S regl
```

## Philosophy

## Benchmarks

## API
  * [Initialization](API.md#initialization)
    + [`require('regl')`](API.md#-require--regl---)
      - [`var regl = require('regl')([options])`](API.md#-var-regl---require--regl----options---)
      - [`var regl = require('regl')(element, [options])`](API.md#-var-regl---require--regl---element---options---)
      - [`var regl = require('regl')(canvas, [options])`](API.md#-var-regl---require--regl---canvas---options---)
      - [`var regl = require('regl')(gl, [options])`](API.md#-var-regl---require--regl---gl---options---)
  * [Rendering](API.md#rendering)
    + [Declaration](API.md#declaration)
      - [`var draw = regl(options)`](API.md#-var-draw---regl-options--)
      - [`regl.prop([path])`](API.md#-reglprop--path---)
    + [Invocation](API.md#invocation)
      - [`draw([options])`](API.md#-draw--options---)
      - [`draw.scope([options,] func)`](API.md#-drawscope--options---func--)
      - [`draw.batch(optionList)`](API.md#-drawbatch-optionlist--)
    + [Clear draw buffer](API.md#clear-draw-buffer)
      - [`regl.clear(options)`](API.md#-reglclear-options--)
    + [Render callback](API.md#render-callback)
      - [`regl.frame(func)`](API.md#-reglframe-func--)
  * [Resources](API.md#resources)
    + [Constructors](API.md#constructors)
      - [`regl.buffer(options)`](API.md#-reglbuffer-options--)
      - [`regl.elements(options)`](API.md#-reglelements-options--)
      - [`regl.texture(options)`](API.md#-regltexture-options--)
      - [`regl.fbo(options)`](API.md#-reglfbo-options--)
    + [Usage patterns](API.md#usage-patterns)
      - [`resource(options)`](API.md#-resource-options--)
      - [`resource.destroy()`](API.md#-resourcedestroy---)
  * [Clean up](API.md#clean-up)
      - [`regl.destroy()`](API.md#-regldestroy---)
  * [Errors and exceptions](API.md#errors-and-exceptions)

## Contributing

[For info on how to build and test headless, see the contributing guide here](DEVELOPING.md)

## License
(c) 2016 MIT License

Supported by the [Freeman Lab](https://www.janelia.org/lab/freeman-lab) and the Howard Hughes Medical Institute
