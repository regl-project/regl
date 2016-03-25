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

### Reading pixels

#### `regl.read([options])`

### Render callback

#### `var tick = regl.frame(func)`

#### `tick.cancel()`

## Resources

### Constructors

#### `regl.buffer(options)`

#### `regl.elements(options)`

#### `regl.texture(options)`

#### `regl.fbo(options)`

### Updates

#### `resource(options)`
Updates a resource

### Destruction

#### `resource.destroy()`
Destroy resource

## Clean up

#### `regl.destroy()`
