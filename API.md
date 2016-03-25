# REGL API

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
