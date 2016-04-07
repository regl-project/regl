# REGL API

## Initialization

##### As a fullscreen canvas
By default calling `module.exports` on the `regl` package creates a full screen canvas element and WebGLRenderingContext.

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

Note that this form is compatible with [`headless-gl`](https://github.com/stackgl/headless-gl) and can be used to do offscreen rendering in node.js. For example,

```javascript
//Creates a headless 256x256 regl instance
var regl = require('regl')(require('gl')(256, 256))
```

## Commands

*Draw commands* are the fundamental abstraction in `regl`.  A draw command wraps up all of the WebGL state associated with a draw call (either `drawArrays` or `drawElements`) and packages it into a single reusable function. For example, here is a command that draws a triangle,

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

To execute a command you call it just like you would any function,

```javascript
drawTriangle()
```

### Dynamic properties
Some parameters can be made dynamic by passing in a function,

```javascript
var drawSpinningStretchyTriangle = regl({
  frag: `
  void main() {
    gl_FragColor = vec4(1, 0, 0, 1);
  }`,

  vert: `
  attribute vec2 position;
  uniform float angle, scale;
  void main() {
    gl_Position = vec4(
      scale * (cos(angle) * position.x - sin(angle) * position.y),
      scale * (sin(angle) * position.x + cos(angle) * position.y),
      0,
      1.0);
  }`,

  attributes: {
    position: regl.buffer([[0, -1], [-1, 0], [1, 1]])
  },

  uniforms: {
    //
    // Dynamic properties can be functions.  Each function gets passed:
    //
    //  * args: which is a user specified object
    //  * batchId: which is the index of the draw command in the batch
    //  * stats: which are frame stats (see below)
    //
    angle: function (args, batchId, stats) {
      return args.speed * stats.count + 0.01 * batchId
    },

    // As a shortcut/optimization we can also just read out a property
    // from the args.  For example, this
    //
    scale: regl.prop('scale')
    //
    // is semantically equivalent to
    //
    //  scale: function (args) {
    //    return args.scale
    //  }
    //
  },

  count: 3
})
```

To execute a draw command with dynamic arguments we pass it a configuration object as the first argument,

```javascript
// Draws one spinning triangle
drawSpinningStretchyTriangle({
  scale: 0.5,
  speed: 2
})

// Draws multiple spinning triangles
drawSpinningStretchyTriangle([
  { // batchId 0
    scale: 1,
    speed: 1,
  },
  { // batchId 1
    scale: 2,
    speed: 0.1,
  },
  { // batchId 2
    scale: 0.25,
    speed: 3
  }
])
```

For more info on the frame stats [check out the below section](#frame-stats).

### Command properties
The input to a command declaration is a complete hierarchical description of the WebGL state machine.

#### Shaders

Each draw command can specify the source code for a vertex and/or fragment shader,

```javascript
var command = regl({
  // ...

  vert: `
  void main() {
    gl_Position = vec4(0, 0, 0, 1);
  }`,

  frag: `
  void main() {
    gl_FragColor = vec4(1, 0, 1, 1);
  }`,

  // ...
})
```

| Property | Description |
|----------|-------------|
| `vert` | Source code of vertex shader |
| `frag` | Source code of fragment shader |

**Related WebGL APIs**

* [`gl.createShader`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glCreateShader.xml)
* [`gl.shaderSource`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glShaderSource.xml)
* [`gl.compileShader`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glCompileShader.xml)
* [`gl.createProgram`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glCreateProgram.xml)
* [`gl.attachShader`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glAttachShader.xml)
* [`gl.linkProgram`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glLinkProgram.xml)
* [`gl.useProgram`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glUseProgram.xml)

#### Uniforms

```javascript
var command = regl({
  // ...

  uniforms: {
    someUniform: [1, 0, 0, 1],
    anotherUniform: regl.prop('myProp')
  },

  // ...
})
```

**Related WebGL APIs**

* [`gl.getUniformLocation`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glGetUniformLocation.xml)
* [`gl.uniform`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glUniform.xml)

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

**Related WebGL APIs**

* [`gl.vertexAttribPointer`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glVertexAttribPointer.xml)
* [`gl.vertexAttrib`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glVertexAttrib.xml)
* [`gl.getAttribLocation`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glGetAttribLocation.xml)
* [`gl.vertexAttibDivisor`](https://www.opengl.org/sdk/docs/man4/html/glVertexAttribDivisor.xhtml)
* [`gl.enableVertexAttribArray`, `gl.disableVertexAttribArray`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glDisableVertexAttribArray.xml)

#### Drawing

```javascript
var command = regl({
  // ...

  primitive: 'triangles',

  count: 6,
})
```

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

| Primitive type | Description |
|-------|-------------|
| `'points'` | `gl.POINTS` |
| `'lines'` | gl.LINES` |
| `'line strip'` | `gl.LINE_STRIP` |
| `'line loop` | `gl.LINE_LOOP` |
| `'triangles` | `gl.TRIANGLES` |
| `'triangle strip'` | `gl.TRIANGLE_STRIP` |
| `'triangle fan'` | `gl.TRIANGLE_FAN` |

**Related WebGL APIs**

* [`gl.drawArrays`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glDrawArrays.xml)
* [`gl.drawElements`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glDrawElements.xml)
* [`gl.drawArraysInstancedANGLE`](https://www.opengl.org/sdk/docs/man4/html/glDrawArraysInstanced.xhtml)
* [`gl.drawElementsInstancedANGLE`](https://www.opengl.org/sdk/docs/man4/html/glDrawElementsInstanced.xhtml)

#### Depth

| Property | Description | Default |
|----------|-------------|---------|
| `enable` | Sets `gl.enable(gl.DEPTH_TEST)` | `true` |
| `mask` | Sets `gl.depthMask` | `true` |
| `range` | Sets `gl.depthRange` | `[0, 1]` |
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

**Related WebGL APIs**

* [`gl.depthFunc`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glDepthFunc.xml)
* [`gl.depthMask`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glDepthMask.xml)
* [`gl.depthRange`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glDepthRangef.xml)

#### Blending

| Property | Description | Default |
|----------|-------------|---------|
| `enable` | Sets `gl.enable(gl.BLEND)` | `false` |
| `func` | Sets `gl.blendFunc` (see table) | `{src:'src alpha',dst:'one minus src alpha'}` |
| `equation` | Sets `gl.blendEquation` (see table) | `'add'` |
| `color` | Sets `gl.blendColor` | `[0, 0, 0, 0]` |

| Equation | Description |
|----------|---------------|
| `'add'` | `gl.FUNC_ADD` |
| `'subtract'` | `gl.FUNC_SUBTRACT` |
| `'reverse subtract'` | `gl.FUNC_REVERSE_SUBTRACT` |

| Func | Description |
|------|-------------|
| `0, 'zero'` | `gl.ZERO` |
| `1, 'one'` | `gl.ONE` |
| `'src color'` | `gl.SRC_COLOR` |
| `'one minus src color'` | `gl.ONE_MINUS_SRC_COLOR` |
| `'src alpha'` | `gl.SRC_ALPHA` |
| `'one minus src alpha'` | `gl.ONE_MINUS_SRC_ALPHA` |
| `'dst color'` | `gl.DST_COLOR` |
| `'one minus dst color'` | `gl.ONE_MINUS_DST_COLOR` |
| `'dst alpha'` | `gl.DST_ALPHA` |
| `'one minus dst alpha'` | `gl.ONE_MINUS_DST_ALPHA` |
| `'constant color'` | `gl.CONSTANT_COLOR` |
| `'one minus constant color'` | `gl.ONE_MINUS_CONSTANT_COLOR` |
| `'constant alpha'` | `gl.CONSTANT_ALPHA` |
| `'one minus constant alpha'` | `gl.ONE_MINUS_CONSTANT_ALPHA` |
| `'src alpha saturate'` | `gl.SRC_ALPHA_SATURATE` |

**Related WebGL APIs**

* [`gl.blendEquationSeparate`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glBlendEquationSeparate.xml)
* [`gl.blendFuncSeparate`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glBlendFuncSeparate.xml)
* [`gl.blendColor`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glBlendColor.xml)

#### Stencil

| Property | Description | Default |
|----------|-------------|---------|
| `enable` | Sets `gl.enable(gl.STENCIL_TEST)` | `false` |
| `mask` | Sets `gl.stencilMask` | `0xffffffff` |
| `func` | Sets `gl.stencilFunc` | `` |
| `op` | Sets `gl.stencilOpSeparate` | `` |


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
command(count)

command([args0, args1, args2, ...])
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
