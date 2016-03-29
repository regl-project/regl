# REGL API

## Initialization
There are four ways to initialize `regl`:

##### As a fullscreen canvas
By default calling `module.exports` on the `regl` package creates a full screen canvas element and new WebGLRenderingContext.

```javascript
var regl = require('regl')([options])
```

##### From a container div
Alternatively passing a container element as the first argument appends the generated canvas to its children.

```javascript
var regl = require('regl')(element, [options])
```

##### From a canvas
If the first argument is an HTMLCanvasElement, then `regl` will use this canvas to create a new WebGLRenderingContext that it renders into.

```javascript
var regl = require('regl')(canvas, [options])
```

##### From a WebGL context
Finally, if the first argument is a WebGLRenderingContext, then `regl` will just use this context without touching the DOM at all.

```javascript
var regl = require('regl')(gl, [options])
```

Note that this form is compatible with `headless-gl` and can be used to do offscreen rendering in node.js. For example,

```javascript
//Creates a headless 256x256 regl instance
var regl = require('regl')(require('gl')(256, 256))
```

## Commands
The fundamental abstraction in REGL is the idea of a draw command.  Each draw command wraps up all of the WebGL state associated with a draw call and packages it into a single reusable procedure. For example, here is a command that draws a triangle,

```javascript
const drawTriangle = regl({
  frag: `
  void main() {
    gl_FragColor = vec4(1, 0, 0, 1);
  }`,

  vert: `
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0, 1);
  }`,

  attributes: {
    position: regl.buffer([[0, -1], [-1, 0], [1, 1]])
  },

  count: 3
})
```

Once a command is declared, you can call it just like you would any function:

```javascript
drawTriangle()
```

### Dynamic properties


```javascript
var command = regl({
  // ...

  // You can declare dynamic properties using functions
  someDynamicProp: function (args) {
  },

  // Or using the prop syntax
  anotherDynamicProp: regl.prop('myProp'),
  // This is a shortcut for:
  //
  //  function (args) { return args['myProp'] }
  //

  // ...
})
```

### Command properties

#### Shaders

| Property | Description | Default |
|----------|-------------|---------|
| `vert` | Source code of vertex shader | `''`` |
| `frag` | Source code of fragment shader | `''` |

**Note**: Dynamic shaders are not supported.

#### Uniforms

#### Attributes

Each attribute can have any of the following optional properties,

| Property | Description | Default |
|----------|-------------|---------|
| `buffer` | A `REGLBuffer` wrapping the buffer object | `null` |
| `offset` | | `0` |
| `stride` | | `0` |
| `normalized` | | `false` |
| `size` | | `0` |
| `divisor` | | `0` * |

#### Drawing

| Property | Description | Default |
|----------|-------------|---------|
| `primitive` | Sets the primitive type | `'triangles'` * |
| `count` | Number of vertices to draw | `0` * |
| `offset` | Offset of primitives to draw | `0` |
| `instances` | Number of instances to render | `0` ** |
| `elements` | Element array buffer | `null` |

**Notes**

* If `elements` is specified while `primitive`, `count` and `offset` are not, then these values may be inferred from the state of the element array buffer.
* `instances` is only applicable if the `ANGLE_instanced_arrays` extension is present.
* `primitive` can take on the following values

| Value | Description |
|-------|-------------|
| `'points'` | `gl.POINTS` |
| `'lines'` | gl.LINES` |
| `'line strip'` | `gl.LINE_STRIP` |
| `'line loop` | `gl.LINE_LOOP` |
| `'triangles` | `gl.TRIANGLES` |
| `'triangle strip'` | `gl.TRIANGLE_STRIP` |
| `'triangle fan'` | `gl.TRIANGLE_FAN` |

#### Depth

| Property | Description | Default |
|----------|-------------|---------|
| `enable` | Sets `gl.enable(gl.DEPTH_TEST)` | `true` |
| `mask` | Sets `gl.depthMask` | `true` |
| `func` | Sets `gl.depthFunc`. See table below for possible values | `'less'` |

`depth.func` can take on the possible values

| Value | Description |
|-------|-------------|
| `'never'` | `gl.NEVER` |
| `'always'` | gl.ALWAYS` |
| `'<', 'less'` | `gl.LESS` |
| `'<=', 'lequal'` | gl.LEQUAL |
| `'>', 'greater'` | `gl.GREATER` |
| `'>=', 'gequal'` | gl.GEQUAL |
| `'=', 'equal'` | gl.EQUAL |
| `'!=', 'notequal'` | gl.NOTEQUAL |

#### Stencil

| Property | Description | Default |
|----------|-------------|---------|
| `enable` | Sets `gl.enable(gl.STENCIL_TEST)` | `false` |
| `mask` | Sets `gl.stencilMask` | `0xffffffff` |
| `func` | Sets `gl.stencilFunc` | `` |
| `op` | Sets `gl.stencilOpSeparate` | `` |

#### Blending

| Property | Description | Default |
|----------|-------------|---------|
| `enable` | Sets `gl.enable(gl.BLEND)` | `false` |
| `func` | Sets `gl.blendFunc` | `''` |
| `color` | Sets `gl.blendColor` | `[0, 0, 0, 0]` |
| `equation` | Sets `gl.blendEquation` | `''` |

#### Polygon offset

| Property | Description | Default |
|----------|-------------|---------|
| `enable` | Sets `gl.enable(gl.POLYGON_OFFSET)` | `false` |
| `offset` | Sets `gl.polygonOffset` | `{}` |

#### Culling

| Property | Description | Default |
|----------|-------------|---------|
| `enable` | Sets `gl.enable(gl.CULL_FACE)` | `false` |
| `face` | Sets `gl.cullFace` | `'back'` |

#### Miscellaneous parameters

| Property | Description | Default |
|----------|-------------|---------|
| `frontFace` | | `'ccw'` |
| `dither` | | `false` |
| `lineWidth` | | `1` |
| `colorMask` | | `[true, true, true, true]` |
| `viewport` | | `null` |

### Executing commands
There are 3 ways to execute a regl command,

#### One-shot rendering

```javascript
command()

command(args)
```

#### Scoped parameters

```javascript
command(function () {
  // ...
})

command(args, function () {
  // ...
})
```

#### Batch rendering

```javascript
command([arg0, arg1, arg2, ...])
```

## Resources

### Constructors

#### `regl.buffer(options)`

| Property | Description | Default |
|----------|-------------|---------|
| `data` | | `null` |
| `length` | | `0` |
| `usage` | | `'static'` |

#### `regl.elements(options)`

| Property | Description | Default |
|----------|-------------|---------|
| `data` | | `null` |
| `length` | | `0` |
| `usage` | | `'static'` |
| `primitive` | | `'triangles'` |
| `count` | | `0` |

#### `regl.texture(options)`

#### `regl.fbo(options)`

### Updates

```javascript
resource(options)
```

### Destruction

```javascript
resource.destroy()
```

## Other properties
Other than draw commands and resources, there are a few miscellaneous parts of the WebGL API which REGL wraps for completeness.  These miscellaneous odds and ends are summarized here.

### Clear the draw buffer
`regl.clear` combines `gl.clearColor, gl.clearDepth, gl.clearStencil` and `gl.clear` into a single procedure, which has the following usage:

```javascript
regl.clear({
  color: [0, 0, 0, 1],
  depth: 1,
  stencil: 0xff
})
```

| Property | Description |
|----------|-------------|
| `color` | Sets the clear color |
| `depth` | |
| `stencil` | |

If an option is not present, then the corresponding buffer is not cleared

### Reading pixels

```javascript
var pixels = regl.read([options])
```

| Property | Description | Default |
|----------|-------------|---------|
| `data` | An optional `ArrayBufferView` which gets the result of reading the pixels | `null` |
| `x` | | `0` |
| `y` | | `0` |
| `width` | | viewport.width |
| `height` | | viewport.height |

### Per-frame callbacks
`regl` also provides a common wrapper over `requestAnimationFrame` and `cancelAnimationFrame` that integrates gracefully with context loss events.

```javascript
// Hook a callback to execute each frame
var tick = regl.frame(function (count) {
  // ...
})

// When we are done, we can unsubscribe by calling cancel on the callback
tick.cancel()
```

### Frame stats
`regl` also tracks a few simple performance and timing stats to simplify benchmarks and animations.  These are all accessible via the `regl.stats` object,

| Property | Description |
|----------|-------------|
| `width` | Width of the drawing buffer |
| `height` | Height of the drawing buffer |
| `count` | Total number frames rendered |
| `start` | Wall clock time when `regl` was started |
| `t` | Time of last `frame()` event |
| `dt` | Time between last two `frame()` events |
| `renderTime` | Time spent rendering last frame |

### Clean up

```javascript
regl.destroy()
```

### Context loss
`regl` makes a best faith effort to handle context loss by default.  This means that buffers and textures are reinitialized on a context restore with their contents.  Unfortunately, this is not possible for framebuffer objects and
