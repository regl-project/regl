# regl

This repo is an attempt at building some new functional abstractions for working with WebGL.  It is still pretty experimental right now, so expect things to change a lot in the near future.  If you want to know more about why I am writing this thing, take a look at the [rationale](RATIONALE.md).

## Some sketches

In regl, you write functions which transform data into sequences of WebGL draw calls.  These functions are then partially evaluated at run time into optimized JavaScript code.  Here is a sketch of how this might look:

```JavaScript
// NOTE: This doesn't work yet, it is just for illustration

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

# API (WORK IN PROGRESS)

## Initialization

### `require('regl')`

#### `var regl = require('regl')([options])`

#### `var regl = require('regl')(element, [options])`

#### `var regl = require('regl')(canvas, [options])`

#### `var regl = require('regl')(gl, [options])`

## Rendering

### Declaration

#### `var draw = regl(options)`

#### `regl.prop([path])`

### Invocation

#### `draw([options])`

#### `draw.scope([options,] func)`

#### `draw.batch(optionList)`

### Clear draw buffer

#### `regl.clear(options)`

### Render callback

#### `regl.frame(func)`

## Resources

### Constructors

#### `regl.buffer(options)`

#### `regl.elements(options)`

#### `regl.texture(options)`

#### `regl.fbo(options)`

### Usage patterns

#### `resource(options)`
Updates a resource

#### `resource.destroy()`
Destroy resource

## Clean up

#### `regl.destroy()`

## Errors and exceptions

All thrown exceptions inherit from `regl.Error`

## License
(c) 2016 MIT License

Supported by the Freeman Lab and the Howard Hughes Medical Institute
